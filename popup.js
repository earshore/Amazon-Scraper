let finalData = null;

// 安全转义函数：防止 XSS 攻击
function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

document.getElementById('scrapeBtn').addEventListener('click', async () => {
    const status = document.getElementById('status');
    const mdPreview = document.getElementById('mdPreview');
    const downloadBtn = document.getElementById('downloadBtn');
    
    status.style.display = "block";
    status.className = "success";
    status.innerText = "🔍 Analyzing product & reviews...";
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // 注入脚本
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: scrapeAmazonLogic // 逻辑函数在下方定义
        }, (results) => {
            if (chrome.runtime.lastError || !results || !results[0].result) {
                status.innerText = "❌ Connection failed or invalid page.";
                return;
            }

            finalData = results[0].result;
            const prod = finalData.products[0];

            if (prod.scrape_status === "failed") {
                status.innerText = "❌ Error: " + prod.error;
                return;
            }

            status.innerText = "✅ Analysis Complete";
            mdPreview.style.display = "block";
            downloadBtn.style.display = "block";
            renderPreview(prod);
        });
    } catch (err) {
        status.innerText = "❌ Extension Error: " + err.message;
    }
});

// 渲染函数：加入安全转义
function renderPreview(prod) {
    const preview = document.getElementById('mdPreview');
    
    // 转义列表内容
    let bulletsHtml = prod.feature_bullets
        .map(b => `<li>${escapeHtml(b)}</li>`)
        .join('');

    // 只有在有评论时才生成评论 HTML
    let reviewsHtml = "";
    if (prod.customer_reviews && prod.customer_reviews.length > 0) {
        reviewsHtml = prod.customer_reviews.map(r => `
            <div class="review-card">
                <div style="display: flex; align-items: center; margin-bottom: 4px;">
                    <div style="display: flex; color: #DE7921; font-size: 15px; margin-right: 8px;">
                        ${Array.from({ length: 5 }, (_, i) => 
                            `<span style="margin-right: -1px;">${i < r.star_rating ? '★' : '<span style="color:#ccc">☆</span>'}</span>`
                        ).join('')}
                    </div>
                    <span style="font-weight: 700; color: #0F1111; font-size: 14px;">${escapeHtml(r.headline)}</span>
                </div>
                <div style="color: #565959; font-size: 13px;">
                    Reviewed in ${escapeHtml(r.origin_country)} on ${escapeHtml(r.review_date)}
                </div>
                <div style="color: #0F1111; font-size: 14px; margin-top: 8px;">${escapeHtml(r.body)}</div>
            </div>
        `).join('');
    } else {
        reviewsHtml = '<p style="color: #565959; font-size: 13px; font-style: italic;">No reviews found for this product in the current context.</p>';
    }

    preview.innerHTML = `
        <div style="font-size: 18px; font-weight: 700; color: #0F1111;">${escapeHtml(prod.productTitle)}</div>
        <div style="font-size: 12px; color: #565959; margin-bottom: 15px;">ASIN: ${escapeHtml(prod.asin)}</div>
        <div style="font-weight: 700; border-bottom: 2px solid #eee;">About this item</div>
        <ul style="font-size: 13px; padding-left: 20px;">${bulletsHtml}</ul>
        <div style="font-weight: 700; margin-top:15px; border-bottom: 2px solid #eee;">Reviews</div>
        ${reviewsHtml}
    `;
}

// 下载功能
document.getElementById('downloadBtn').addEventListener('click', () => {
    if (!finalData) return;
    const blob = new Blob([JSON.stringify(finalData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Amazon_Scrape_${finalData.products[0].asin}.json`;
    a.click();
});

/**
 * 核心抓取逻辑：将被注入到 Amazon 页面执行
 * 辅助函数必须放在此函数内部
 */
function scrapeAmazonLogic() {
    try {
        // --- 内部辅助工具 ---
        const getText = (selectors) => {
            for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el && el.innerText.trim()) return el.innerText.trim();
            }
            return "";
        };

        const extractStars = (el) => {
            // 兼容多种星星图标的选择器
            const starIcon = el.querySelector('[data-hook="review-star-rating"], .a-icon-star, .i-stars');
            if (!starIcon) return 0;
            const rawText = starIcon.getAttribute('aria-label') || starIcon.getAttribute('title') || starIcon.innerText || "";
            // 匹配数字，支持 4.5 或 4,5 (欧洲格式)
            const match = rawText.match(/(\d([.,]\d)?)/);
            return match ? parseFloat(match[0].replace(',', '.')) : 0;
        };

        const parseDate = (s) => {
            if (!s) return "";
            // 移除前缀词汇如 "Reviewed in..." 或 "Rezension aus..."
            const cleanStr = s.replace(/^.*?(on|am|au|il|el)\s+/i, '').trim();
            
            // 常见的月份映射（扩展以支持更多站点）
            const monthMap = {
                "Januar": "01", "Janvier": "01", "January": "01",
                "Februar": "02", "Février": "02", "February": "02",
                "März": "03", "Mars": "03", "March": "03",
                "April": "04", "Avril": "04",
                "Mai": "05", "May": "05",
                "Juni": "06", "Juin": "06", "June": "06",
                "Juli": "07", "Juillet": "07", "July": "07",
                "August": "08", "Août": "08",
                "September": "09", "Septembre": "09",
                "Oktober": "10", "Octobre": "10", "October": "10",
                "November": "11", "Novembre": "11",
                "Dezember": "12", "Décembre": "12", "December": "12"
            };

            // 尝试匹配 DD. Month YYYY 或 Month DD, YYYY
            for (const [name, num] of Object.entries(monthMap)) {
                if (cleanStr.includes(name)) {
                    const yearMatch = cleanStr.match(/\d{4}/);
                    const dayMatch = cleanStr.match(/\b\d{1,2}\b/);
                    if (yearMatch && dayMatch) {
                        return `${yearMatch[0]}-${num}-${dayMatch[0].padStart(2, '0')}`;
                    }
                }
            }
            
            const dateObj = new Date(cleanStr);
            return !isNaN(dateObj) ? dateObj.toISOString().split('T')[0] : cleanStr;
        };

        // --- 数据提取核心逻辑 ---
        
        // 1. 标题提取：增加多种备选
        const productTitle = getText([
            '#productTitle',
            'h1.a-size-large',
            '.qa-title-text',
            '#title'
        ]);

        // 2. ASIN 提取：从 URL 或隐藏域获取
        let asin = "UNKNOWN";
        const asinMatch = window.location.href.match(/\/(?:dp|gp\/product|product-reviews)\/([A-Z0-9]{10})/);
        if (asinMatch) {
            asin = asinMatch[1];
        } else {
            asin = document.querySelector('#ASIN')?.value || "UNKNOWN";
        }

        // 3. 五点描述：增加对不同布局的支持
        const bulletSelectors = [
            '#feature-bullets li span.a-list-item',
            '.a-unordered-list.a-vertical.a-spacing-mini li span.a-list-item',
            '#featurebullets_feature_div li'
        ];
        let feature_bullets = [];
        for (const sel of bulletSelectors) {
            const items = Array.from(document.querySelectorAll(sel));
            if (items.length > 0) {
                feature_bullets = items
                    .map(el => el.innerText.trim())
                    .filter(t => t.length > 5 && !/Check compatibility|Make sure this fits/i.test(t));
                if (feature_bullets.length > 0) break;
            }
        }

        // 4. 评论抓取
// --- 核心修复：从评论内容中抓取国家 ---
// 在 scrapeAmazonLogic 内部修改评论抓取部分
const reviewElements = document.querySelectorAll('[data-hook="review"], .review');

const customer_reviews = Array.from(reviewElements)
    .map(el => {
        const headlineEl = el.querySelector('[data-hook="review-title"], .review-title');
        let rawHeadline = headlineEl?.innerText || "";
        let cleanHeadline = rawHeadline.replace(/(\d[\.,]\d out of 5 stars|\d[\.,]\d von 5 Sternen)/gi, '').trim();
        
        const bodyText = el.querySelector('[data-hook="review-body"], .review-text')?.innerText?.trim() || "";
        
        // 提取国家逻辑保持不变
        const dateAndLocationText = el.querySelector('[data-hook="review-date"], .review-date')?.innerText || "";
        const locationMatch = dateAndLocationText.match(/(?:in|aus|en|il)\s+(.+?)\s+(?:on|am|le|il|el|au)\s+\d/i);
        const review_country = locationMatch ? locationMatch[1].trim() : "Global";

        return {
            "headline": cleanHeadline,
            "body": bodyText,
            "star_rating": extractStars(el),
            "is_verified": !!el.querySelector('[data-hook="avp-verified-purchase-badge"]'),
            "review_date": parseDate(dateAndLocationText),
            "origin_country": review_country
        };
    })
    // --- 关键优化：过滤掉标题和正文都为空的无效数据 ---
    .filter(r => r.headline.length > 0 || r.body.length > 0) 
    .slice(0, 10);

        return {
            "metadata": {
                "scrape_timestamp": new Date().toISOString(),
                "marketplace": window.location.hostname.split('.').pop().toUpperCase(),
                "domain": window.location.hostname,
                "url": window.location.href
            },
            "products": [{
                "asin": asin,
                "productTitle": productTitle,
                "feature_bullets": feature_bullets,
                "customer_reviews": customer_reviews,
                "scrape_status": productTitle ? "success" : "failed",
                "error": productTitle ? "" : "Title not found"
            }]
        };
    } catch (e) {
        return { products: [{ scrape_status: "failed", error: e.message }] };
    }
}
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

    // 转义评论内容
    let reviewsHtml = prod.customer_reviews.map(r => `
        <div class="review-card" style="border-bottom: 1px solid #e7e7e7; padding: 20px 0; font-family: Arial, sans-serif;">
            <div style="display: flex; align-items: center; margin-bottom: 4px;">
                <div style="display: flex; color: #DE7921; font-size: 15px; margin-right: 8px;">
                    ${Array.from({ length: 5 }, (_, i) => 
                        `<span style="margin-right: -1px;">${i < r.star_rating ? '★' : '<span style="color:#ccc">☆</span>'}</span>`
                    ).join('')}
                </div>
                <span style="font-weight: 700; color: #0F1111; font-size: 14px;">
                    ${escapeHtml(r.headline)}
                </span>
            </div>
            <div style="color: #565959; font-size: 13px; margin-bottom: 4px;">
                Reviewed in ${escapeHtml(finalData.metadata.marketplace)} on ${escapeHtml(r.review_date)}
            </div>
            ${r.is_verified ? `<div style="color: #C45500; font-weight: 700; font-size: 12px;">Verified Purchase</div>` : ''}
            <div style="color: #0F1111; font-size: 14px; line-height: 1.45; margin-top: 8px;">
                ${escapeHtml(r.body)}
            </div>
        </div>
    `).join('');

    preview.innerHTML = `
        <div style="font-size: 18px; font-weight: 700; color: #0F1111; margin-bottom: 8px;">${escapeHtml(prod.productTitle)}</div>
        <div style="font-size: 12px; color: #565959; margin-bottom: 15px;">ASIN: ${escapeHtml(prod.asin)}</div>
        <div style="font-weight: 700; border-bottom: 2px solid #eee;">About this item</div>
        <ul style="font-size: 13px; padding-left: 20px;">${bulletsHtml}</ul>
        <div style="font-weight: 700; margin-top:15px; border-bottom: 2px solid #eee;">Top Reviews</div>
        ${reviewsHtml || '<p>No reviews found.</p>'}
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
        // 辅助函数定义在内部以解决作用域问题
        const extractStars = (el) => {
            const starIcon = el.querySelector('[data-hook="review-star-rating"], .a-icon-star');
            if (!starIcon) return 0;
            const rawText = starIcon.getAttribute('aria-label') || starIcon.getAttribute('title') || starIcon.innerText || "";
            const match = rawText.match(/(\d([.,]\d)?)/);
            return match ? parseFloat(match[0].replace(',', '.')) : 0;
        };

        const parseDate = (s) => {
            if (!s) return "";
            const cleanStr = s.replace(/.*on\s+/i, '').replace(/.*am\s+/i, '').trim();
            const deMonths = {"Januar":"01","Februar":"02","März":"03","April":"04","Mai":"05","Juni":"06","Juli":"07","August":"08","September":"09","Oktober":"10","November":"11","Dezember":"12"};
            const matchDE = cleanStr.match(/(\d{1,2})\.\s+(\w+)\s+(\d{4})/);
            if (matchDE) return `${matchDE[3]}-${deMonths[matchDE[2]] || '01'}-${matchDE[1].padStart(2, '0')}`;
            const dateObj = new Date(cleanStr);
            return !isNaN(dateObj) ? dateObj.toISOString().split('T')[0] : cleanStr;
        };

        const titleEl = document.querySelector('#productTitle') || document.querySelector('h1.a-size-large');
        const productTitle = titleEl?.innerText?.trim() || "";
        const asinMatch = window.location.href.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
        const asin = asinMatch ? asinMatch[1] : "UNKNOWN";

        const bulletContainer = document.querySelector('#feature-bullets') || document.querySelector('.a-unordered-list.a-vertical.a-spacing-mini');
        const feature_bullets = bulletContainer ? 
            Array.from(bulletContainer.querySelectorAll('li span.a-list-item'))
                 .map(el => el.innerText.trim())
                 .filter(t => t.length > 5 && !t.includes('Make sure this fits')) : [];

        const reviewElements = document.querySelectorAll('[data-hook="review"]');
        const customer_reviews = Array.from(reviewElements).slice(0, 10).map(el => {
            let rawHeadline = el.querySelector('[data-hook="review-title"]')?.innerText || "";
            let cleanHeadline = rawHeadline.replace(/(\d[\.,]\d out of 5 stars|\d[\.,]\d von 5 Sternen)/gi, '').trim();
            
            return {
                "headline": cleanHeadline,
                "body": el.querySelector('[data-hook="review-body"]')?.innerText?.trim() || "",
                "star_rating": extractStars(el),
                "is_verified": !!el.querySelector('[data-hook="avp-verified-purchase-badge"]'),
                "review_date": parseDate(el.querySelector('[data-hook="review-date"]')?.innerText || "")
            };
        });

        return {
            "metadata": {
                "scrape_timestamp": new Date().toISOString(),
                "marketplace": window.location.hostname.split('.').pop().toUpperCase(),
                "domain": window.location.hostname
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
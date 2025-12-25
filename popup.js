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
// function scrapeAmazonLogic() {
//     try {
//         // --- 内部辅助工具 ---
//         const getText = (selectors) => {
//             for (const selector of selectors) {
//                 const el = document.querySelector(selector);
//                 if (el && el.innerText.trim()) return el.innerText.trim();
//             }
//             return "";
//         };

//         const extractStars = (el) => {
//             // 兼容多种星星图标的选择器
//             const starIcon = el.querySelector('[data-hook="review-star-rating"], .a-icon-star, .i-stars');
//             if (!starIcon) return 0;
//             const rawText = starIcon.getAttribute('aria-label') || starIcon.getAttribute('title') || starIcon.innerText || "";
//             // 匹配数字，支持 4.5 或 4,5 (欧洲格式)
//             const match = rawText.match(/(\d([.,]\d)?)/);
//             return match ? parseFloat(match[0].replace(',', '.')) : 0;
//         };

//         const parseDate = (s) => {
//             if (!s) return "";
//             // 移除前缀词汇如 "Reviewed in..." 或 "Rezension aus..."
//             const cleanStr = s.replace(/^.*?(on|am|au|il|el)\s+/i, '').trim();
            
//             // 常见的月份映射（扩展以支持更多站点）
//             const monthMap = {
//                 "Januar": "01", "Janvier": "01", "January": "01",
//                 "Februar": "02", "Février": "02", "February": "02",
//                 "März": "03", "Mars": "03", "March": "03",
//                 "April": "04", "Avril": "04",
//                 "Mai": "05", "May": "05",
//                 "Juni": "06", "Juin": "06", "June": "06",
//                 "Juli": "07", "Juillet": "07", "July": "07",
//                 "August": "08", "Août": "08",
//                 "September": "09", "Septembre": "09",
//                 "Oktober": "10", "Octobre": "10", "October": "10",
//                 "November": "11", "Novembre": "11",
//                 "Dezember": "12", "Décembre": "12", "December": "12"
//             };

//             // 尝试匹配 DD. Month YYYY 或 Month DD, YYYY
//             for (const [name, num] of Object.entries(monthMap)) {
//                 if (cleanStr.includes(name)) {
//                     const yearMatch = cleanStr.match(/\d{4}/);
//                     const dayMatch = cleanStr.match(/\b\d{1,2}\b/);
//                     if (yearMatch && dayMatch) {
//                         return `${yearMatch[0]}-${num}-${dayMatch[0].padStart(2, '0')}`;
//                     }
//                 }
//             }
            
//             const dateObj = new Date(cleanStr);
//             return !isNaN(dateObj) ? dateObj.toISOString().split('T')[0] : cleanStr;
//         };

//         // --- 数据提取核心逻辑 ---
        
//         // 1. 标题提取：增加多种备选
//         const productTitle = getText([
//             '#productTitle',
//             'h1.a-size-large',
//             '.qa-title-text',
//             '#title'
//         ]);

//         // 2. ASIN 提取：从 URL 或隐藏域获取
//         let asin = "UNKNOWN";
//         const asinMatch = window.location.href.match(/\/(?:dp|gp\/product|product-reviews)\/([A-Z0-9]{10})/);
//         if (asinMatch) {
//             asin = asinMatch[1];
//         } else {
//             asin = document.querySelector('#ASIN')?.value || "UNKNOWN";
//         }

//         // 3. 五点描述：增加对不同布局的支持
//         const bulletSelectors = [
//             '#feature-bullets li span.a-list-item',
//             '.a-unordered-list.a-vertical.a-spacing-mini li span.a-list-item',
//             '#featurebullets_feature_div li'
//         ];
//         let feature_bullets = [];
//         for (const sel of bulletSelectors) {
//             const items = Array.from(document.querySelectorAll(sel));
//             if (items.length > 0) {
//                 feature_bullets = items
//                     .map(el => el.innerText.trim())
//                     .filter(t => t.length > 5 && !/Check compatibility|Make sure this fits/i.test(t));
//                 if (feature_bullets.length > 0) break;
//             }
//         }

//         // 4. 评论抓取
// // --- 核心修复：从评论内容中抓取国家 ---
// // 在 scrapeAmazonLogic 内部修改评论抓取部分
// const reviewElements = document.querySelectorAll('[data-hook="review"], .review');

// const customer_reviews = Array.from(reviewElements)
//     .map(el => {
//         const headlineEl = el.querySelector('[data-hook="review-title"], .review-title');
//         let rawHeadline = headlineEl?.innerText || "";
//         let cleanHeadline = rawHeadline.replace(/(\d[\.,]\d out of 5 stars|\d[\.,]\d von 5 Sternen)/gi, '').trim();
        
//         const bodyText = el.querySelector('[data-hook="review-body"], .review-text')?.innerText?.trim() || "";
        
//         // 提取国家逻辑保持不变
//         const dateAndLocationText = el.querySelector('[data-hook="review-date"], .review-date')?.innerText || "";
//         const regex = /(?:in|aus|en|il|em|nel|su|von|från|z|u)\s+(.+?)\s+(?:on|am|le|il|el|au|al|del|am|den|dnia|på|den)\s+\d/i;
//         const locationMatch = dateAndLocationText.match(regex);
//         //const locationMatch = dateAndLocationText.match(/(?:in|aus|en|il)\s+(.+?)\s+(?:on|am|le|il|el|au)\s+\d/i);
//         const review_country = locationMatch ? locationMatch[1].trim() : "Global";

//         return {
//             "headline": cleanHeadline,
//             "body": bodyText,
//             "star_rating": extractStars(el),
//             "is_verified": !!el.querySelector('[data-hook="avp-verified-purchase-badge"]'),
//             "review_date": parseDate(dateAndLocationText),
//             "origin_country": review_country
//         };
//     })
//     // --- 关键优化：过滤掉标题和正文都为空的无效数据 ---
//     .filter(r => r.headline.length > 0 || r.body.length > 0) 
//     .slice(0, 10);

//     // ... 前面提取 productTitle, asin, feature_bullets, customer_reviews 的逻辑保持不变 ...

//     // 新增：获取当前页面语言的逻辑
//     const pageLanguage = document.documentElement.lang || "Unknown";

//     return {
//         "metadata": {
//             "scrape_timestamp": new Date().toISOString(),
//             "marketplace": window.location.hostname.split('.').pop().toUpperCase(),
//             "domain": window.location.hostname,
//             "language": pageLanguage, // 对应示例中的 language
//             "total_asins": 1           // 当前逻辑每次抓取 1 个 ASIN
//         },
//         "products": [{
//             "asin": asin,
//             "url": window.location.href, // 对应示例中的 url
//             "language": pageLanguage,    // 对应示例中的 language
//             "productTitle": productTitle,
//             "feature_bullets": feature_bullets,
//             "customer_reviews": customer_reviews,
//             "scrape_status": productTitle ? "success" : "failed",
//             "error": productTitle ? "" : "Title not found"
//         }]
//     };
//     } catch (e) {
//         return { products: [{ scrape_status: "failed", error: e.message }] };
//     }
// }

function scrapeAmazonLogic() {
    try {
        // --- 1. 配置：多重备选选择器 (基于你提供的增强版) ---
        const config = {
            productTitle: ['#productTitle', '#title', 'h1[data-automation-id="title"]', 'span#productTitle', '#titleSection #title'],
            bulletPoints: ['#feature-bullets ul li span.a-list-item', '#feature-bullets li span', '.a-unordered-list.a-vertical li span', '#featurebullets_feature_div li span'],
            reviewContainers: ['[data-hook="review"]', '.review', '.a-section.review', '#cm_cr-review_list .review', '.cr-widget-Reviews .review'],
            reviewBody: ['[data-hook="review-body"] span:not(.cr-original-review-content)', '[data-hook="review-body"]', '.review-text-content span', '.review-text span', '.reviewText', 'span[data-hook="review-body"]', '.a-size-base.review-text'],
            reviewTitle: ['[data-hook="review-title"] span:not(.a-letter-space)', '[data-hook="review-title"]', '.review-title span', '.a-size-base.a-link-normal.review-title', 'a[data-hook="review-title"]'],
            reviewRating: ['[data-hook="review-star-rating"]', '[data-hook="cmps-review-star-rating"]', '.review-rating', 'i.a-icon-star']
        };

        // --- 2. 增强版欧洲站点黑名单 (德/英/法/意/西/荷/波/瑞) ---
        const BLACKLIST_REGEX = [
            /ASIN\s*:/i, /ISBN\s*:/i, /EAN\s*:/i,
            /Abmessungen|Dimensions|Dimensioni|Dimensiones|Afmetingen|Mått|Wymiary/i, 
            /Gewicht|Weight|Poids|Peso|Vikt|Waga/i,
            /Im Angebot von|Available|Disponibile|Disponible|Sinds|Tillgänglig|W ofercie/i,
            /Hersteller|Manufacturer|Produttore|Fabricante|Tillverkare|Producent/i,
            /Modellnummer|Model number|Numero modello/i,
            /Bestseller-Rang|Rank|Classifica|Ranking/i,
            /Kundenrezensionen|Reviews|Recensioni|Opiniones|Recensies|Recensioner/i,
            /von 5 Sternen|out of 5 stars|étoiles sur 5|su 5 stelle|de 5 estrellas/i,
            /Verifizierter Kauf|Verified Purchase|Achat vérifié|Acquisto verificato|Compra verificada|Verificerad|Zweryfikowany/i,
            /Auf Lager|In Stock|Disponibile|En stock|Op voorraad|I lager|W magazynie/i,
            /Wird in einem neuen Tab|New tab|Nuova scheda|Nouvel onglet/i,
            /Einkaufswagen|Basket|Panier|Carrello|Carrito|Winkelwagen|Varukorg|Koszyk/i,
            /detail-bullet|productDetails|detailBullets_feature_div/i,
            /Sponsored|Gesponsert|Sponsorizzato|Patrocinado|Gesponsord/i,
            /Nützlich|Helpful|Utile|Útil/i, // 投票按钮文字
            /Missbrauch melden|Report abuse|Signaler un abus/i, // 举报按钮
            /Löschen\s+fehlgeschlagen/i,        // 匹配：删除失败
            /Aktualisierung\s+fehlgeschlagen/i, // 匹配：更新失败
            /nicht\s+für\s+später\s+speichern/i, // 匹配：无法保存
            /Versuche\s+es\s+noch\s+einmal/i,    // 匹配：重试提示
            /wurde\s+bereits\s+aus\s+dem/i       // 匹配：已从购物车移除

        ];

        // --- 3. 跨语言日期解析引擎 (欧洲全站点支持) ---
        const parseEuropeanDate = (text) => {
            if (!text) return "";
            // 清除介词 (如 "on", "am", "le", "il", "el", "op", "den", "w dniu")
            const cleanStr = text.replace(/^.*?(on|am|le|il|el|op|den|dnia|w dniu)\s+/i, '').trim();
            
            const months = {
                jan: '01', feb: '02', mar: '03', apr: '04', mai: '05', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', okt: '10', oct: '10', nov: '11', dez: '12', dec: '12',
                januar: '01', februar: '02', märz: '03', april: '04', juni: '06', juli: '07', august: '08', september: '09', oktober: '10', november: '11', dezember: '12',
                janvier: '01', février: '02', mars: '03', mai: '05', juin: '06', juillet: '07', août: '08', octobre: '10', novembre: '11', décembre: '12',
                gennaio: '01', febbraio: '02', marzo: '03', maggio: '05', giugno: '06', luglio: '07', agosto: '08', settembre: '09', ottobre: '10', novembre: '11', dicembre: '12',
                enero: '01', febrero: '02', marzo: '03', mayo: '05', junio: '06', julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
                stycznia: '01', lutego: '02', marca: '03', kwietnia: '04', maja: '05', czerwca: '06', lipca: '07', sierpnia: '08', września: '09', października: '10', listopada: '11', grudnia: '12'
            };

            let foundMonth = "01";
            for (const [name, num] of Object.entries(months)) {
                if (cleanStr.toLowerCase().includes(name)) {
                    foundMonth = num;
                    break;
                }
            }

            const yearMatch = cleanStr.match(/\d{4}/);
            const dayMatch = cleanStr.match(/\b\d{1,2}\b/);
            return (yearMatch && dayMatch) ? `${yearMatch[0]}-${foundMonth}-${dayMatch[0].padStart(2, '0')}` : cleanStr;
        };

        // --- 4. 抓取逻辑实现 ---
        const getFirstValidText = (selectors, parent = document) => {
            for (const sel of selectors) {
                const el = parent.querySelector(sel);
                if (el && el.offsetParent !== null && el.innerText.trim()) {
                    const txt = el.innerText.trim();
                    if (!BLACKLIST_REGEX.some(r => r.test(txt))) return txt;
                }
            }
            return "";
        };

        // 4.1 基本信息
        const productTitle = getFirstValidText(config.productTitle);
        const asin = document.querySelector('#ASIN')?.value || window.location.href.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1] || "UNKNOWN";

        // 4.2 五点描述 (带黑名单精滤)
        let feature_bullets = [];
        for (const sel of config.bulletPoints) {
            const nodes = document.querySelectorAll(sel);
            if (nodes.length > 0) {
                const cleaned = Array.from(nodes)
                    .map(n => n.innerText.trim())
                    .filter(t => t.length > 8 && !BLACKLIST_REGEX.some(r => r.test(t)));
                if (cleaned.length > 0) {
                    feature_bullets = [...new Set(cleaned)].slice(0, 10);
                    break;
                }
            }
        }

        // 4.3 评论 (跨站点位置解析)
        let reviewNodes = [];
        for (const sel of config.reviewContainers) {
            const found = document.querySelectorAll(sel);
            if (found.length > 0) { reviewNodes = Array.from(found); break; }
        }
        /**
         * 增强版星级提取器：解决国际评论 rating 为 0 的问题
         */
        const extractStars = (parent) => {
            // 1. 定义多重备选选择器（包含国际评论特有的 selector）
            const starSelectors = [
                '[data-hook="review-star-rating"]',
                '[data-hook="cmps-review-star-rating"]',
                '.review-rating',
                'i.a-icon-star',
                '.a-icon-alt' // 许多国际评论的星级文本隐藏在这里
            ];

            let rawValue = "";

            for (const sel of starSelectors) {
                const el = parent.querySelector(sel);
                if (el) {
                    // 依次尝试获取 aria-label, title 或 纯文本
                    rawValue = el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || "";
                    if (rawValue) break;
                }
            }

            if (!rawValue) return 0;

            // 2. 核心修复：处理欧洲数字格式 (例如 "4,8" 或 "4.8")
            // 正则匹配：找到数字部分，支持逗号或点号
            const match = rawValue.match(/(\d([.,]\d)?)/);
            if (match) {
                // 将逗号统一替换为点号，以便 parseFloat 正确转换
                const numStr = match[0].replace(',', '.');
                return parseFloat(numStr);
            }

            return 0;
        };

        const customer_reviews = reviewNodes.map(el => {
            const dateText = el.querySelector('[data-hook="review-date"]')?.innerText || "";
            // 解析国家：从 "Reviewed in Italy on..." 中提取 Italy
            const countryMatch = dateText.match(/(?:in|aus|en|il|em|nel|su|von|från|z|u)\s+(.+?)\s+(?:on|am|le|il|el|au|al|del|den|dnia|på|op)\s+\d/i);
            
            return {
                "headline": getFirstValidText(config.reviewTitle, el).replace(/\d[.,]\d\s+.*?Sternen\s*/i, ''),
                "body": getFirstValidText(config.reviewBody, el),
                "star_rating": extractStars(el),
                "review_date": parseEuropeanDate(dateText),
                "origin_country": countryMatch ? countryMatch[1].trim() : "Global"
            };
        }).filter(r => r.body.length > 5).slice(0, 10);

        return {
            "products": [{
                "asin": asin,
                "productTitle": productTitle,
                "feature_bullets": feature_bullets,
                "customer_reviews": customer_reviews,
                "scrape_status": productTitle ? "success" : "failed"
            }]
        };
    } catch (e) {
        return { products: [{ scrape_status: "failed", error: e.message }] };
    }
}
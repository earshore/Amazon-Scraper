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
            /Sponsored|Gesponsert|Sponsorizzato|Patrocinado|Gesponsord/i,
            /Nützlich|Helpful|Utile|Útil/i, // 投票按钮文字
            /Missbrauch melden|Report abuse|Signaler un abus/i, // 举报按钮
            /Löschen\s+fehlgeschlagen/i,        // 匹配：删除失败
            /Aktualisierung\s+fehlgeschlagen/i, // 匹配：更新失败
            /nicht\s+für\s+später\s+speichern/i, // 匹配：无法保存
            /Versuche\s+es\s+noch\s+einmal/i,    // 匹配：重试提示
            /wurde\s+bereits\s+aus\s+dem/i,       // 匹配：已从购物车移除
            /Warenkorb|Cart|Panier|Carrello|Carrito|Winkelwagen|Koszyk/i, 
            /Zur Kasse gehen|Proceed to checkout|Passer la commande/i,
            /Zahlungsmethode|Payment|Paiement|Pagamento/i,
            /Zwischensumme|Subtotal|Sous-total|Subtotale/i,
            /In den Einkaufswagen|Add to Cart|Ajouter au panier/i,
            /Versandkostenfrei|Free shipping|Livraison gratuite/i,
            /Löschen|Delete|Supprimer|Rimuovi|Eliminar/i, // 购物车中的删除按钮
            /Später speichern|Save for later|Mettre de côté/i

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
                
                    .filter(n => {
                    // 1. 屏蔽详情参数区域
                    const isDetailBullet = n.closest('#detailBullets_feature_div') || n.closest('#productDetails_feature_div');
                    // 2. 屏蔽购物车/侧边栏区域
                    const isSideBar = n.closest('#rightCol') || n.closest('#nav-flyout-ewc');
                    // 3. 屏蔽客户评分分布区域
                    const isreviewsMedleyleftgridcol = n.closest('#a-fixed-left-grid-col a-col-left');

                    return !isDetailBullet && !isSideBar && !isreviewsMedleyleftgridcol;
                })

                    .map(n => n.innerText.trim())
                    .filter(t => t.length > 8 && !BLACKLIST_REGEX.some(r => r.test(t)));
                if (cleaned.length > 0) {
                    feature_bullets = [...new Set(cleaned)].slice(0, 5);
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
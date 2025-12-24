let finalData = null;

document.getElementById('scrapeBtn').addEventListener('click', async () => {
    const status = document.getElementById('status');
    const mdPreview = document.getElementById('mdPreview');
    const downloadBtn = document.getElementById('downloadBtn');
    
    status.style.display = "block";
    status.className = "success";
    status.innerText = "🔍 Analyzing product & reviews...";
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeAmazonLogic
    }, (results) => {
        if (chrome.runtime.lastError || !results[0].result) {
            status.innerText = "❌ Connection failed.";
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
});

function renderPreview(prod) {
    const preview = document.getElementById('mdPreview');
    let bulletsHtml = prod.feature_bullets.map(b => `<li>${b}</li>`).join('');

    // 渲染评论，使用 "|" 分隔星级和标题
    let reviewsHtml = prod.customer_reviews.map(r => `
        <div class="review-card" style="border-bottom: 1px solid #e7e7e7; padding: 20px 0; font-family: 'Arial', sans-serif;">
            <div style="display: flex; align-items: center; margin-bottom: 4px;">
                <div style="display: flex; color: #DE7921; font-size: 15px; margin-right: 8px;">
                    ${Array.from({ length: 5 }, (_, i) => 
                        `<span style="margin-right: -1px;">${i < r.star_rating ? '★' : '<span style="color:#ccc">☆</span>'}</span>`
                    ).join('')}
                </div>
                <span style="font-weight: 700; color: #0F1111; font-size: 14px; line-height: 1.2;">
                    ${r.headline}
                </span>
            </div>

            <div style="color: #565959; font-size: 13px; margin-bottom: 4px;">
                Reviewed in ${finalData.metadata.marketplace} on ${r.review_date}
            </div>

            ${r.is_verified ? `
            <div style="color: #C45500; font-weight: 700; font-size: 12px; margin-top: 8px;">
                Verified Purchase
            </div>` : ''}

            <div style="color: #0F1111; font-size: 14px; line-height: 1.45; word-wrap: break-word;">
                ${r.body}
            </div>
        </div>
    `).join('');

    preview.innerHTML = `
        <div style="font-size: 18px; font-weight: 700; color: #0F1111; margin-bottom: 8px;">${prod.productTitle}</div>
        <div style="font-size: 12px; color: #565959; margin-bottom: 15px;">ASIN: ${prod.asin} | Marketplace: ${finalData.metadata.marketplace}</div>
        <div style="font-weight: 700; margin-top:15px; border-bottom: 2px solid #eee; padding-bottom: 5px;">About this item</div>
        <ul style="font-size: 13px; padding-left: 20px; line-height: 1.6;">${bulletsHtml}</ul>
        <div style="font-weight: 700; margin-top:15px; border-bottom: 2px solid #eee; padding-bottom: 5px;">Top Reviews</div>
        ${reviewsHtml || '<p style="font-size:13px; color:#666;">No reviews found on this page.</p>'}
    `;
}

document.getElementById('downloadBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(finalData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Amazon_Scrape_${finalData.products[0].asin}.json`;
    a.click();
});

function scrapeAmazonLogic() {
    try {
        const titleEl = document.querySelector('#productTitle') || document.querySelector('h1.a-size-large');
        const productTitle = titleEl?.innerText?.trim() || "";
        const asin = window.location.href.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1] || "UNKNOWN";

        const bulletContainer = document.querySelector('#feature-bullets') || document.querySelector('.a-unordered-list.a-vertical.a-spacing-mini');
        const feature_bullets = bulletContainer ? 
            Array.from(bulletContainer.querySelectorAll('li span.a-list-item'))
                 .map(el => el.innerText.trim())
                 .filter(t => t.length > 5 && !t.includes('Make sure this fits')) : [];

        const extractStars = (el) => {
            const starIcon = el.querySelector('[data-hook="review-star-rating"], .a-icon-star');
            if (!starIcon) return 0;
            const rawText = starIcon.getAttribute('aria-label') || starIcon.getAttribute('title') || starIcon.innerText || "";
            const match = rawText.match(/(\d([.,]\d)?)/);
            return match ? parseFloat(match[0].replace(',', '.')) : 0;
        };

        const parseDate = (s) => {
            if (!s) return "";
            const deMonths = {"Januar":"01","Februar":"02","März":"03","April":"04","Mai":"05","Juni":"06","Juli":"07","August":"08","September":"09","Oktober":"10","November":"11","Dezember":"12"};
            const matchDE = s.match(/(\d{1,2})\.\s+(\w+)\s+(\d{4})/);
            if (matchDE) return `${matchDE[3]}-${deMonths[matchDE[2]] || '01'}-${matchDE[1].padStart(2, '0')}`;
            const matchEN = new Date(s.replace(/Reviewed in.*?on /i, ''));
            return !isNaN(matchEN) ? matchEN.toISOString().split('T')[0] : s;
        };

        const reviewElements = document.querySelectorAll('[data-hook="review"]');
        const customer_reviews = Array.from(reviewElements).slice(0, 10).map(el => {
            // 清理标题，移除重复的星级描述文本
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
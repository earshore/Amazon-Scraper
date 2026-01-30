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

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url) return;

    // 1. 获取当前页面的 ASIN 和 Host
    const urlObj = new URL(tab.url);
    const currentHost = urlObj.hostname;
    const asinMatch = tab.url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
    const currentAsin = asinMatch ? asinMatch[1] : null;

    if (!currentAsin) return; // 非商品页不恢复

    chrome.storage.local.get(["lastScrapedData"], (result) => {
      if (result.lastScrapedData) {
        const cachedData = result.lastScrapedData;

        // 2. 校验缓存数据有效性
        if (cachedData && cachedData.products && cachedData.products.length > 0) {
          const cachedProduct = cachedData.products[0];
          const cachedMetadata = cachedData.metadata || {};

          // 3. 关键校验：ASIN 和 域名必须完全一致
          // 注意：metadata.domain 是之前抓取时的 window.location.hostname
          if (
            cachedProduct.asin === currentAsin &&
            cachedMetadata.domain === currentHost
          ) {
            finalData = cachedData;
            const status = document.getElementById("status");
            const mdPreview = document.getElementById("mdPreview");
            const downloadBtn = document.getElementById("downloadBtn");

            status.style.display = "block";
            status.className = "success";
            status.innerText = "✅ 上次分析结果 (缓存)";
            mdPreview.style.display = "block";
            downloadBtn.style.display = "block";
            renderPreview(cachedProduct);
          } else {
            // 如果不匹配，静默清除旧缓存（可选，或者保留但不显示）
            // console.log("Cache mismatch: ASIN or Host differs.");
          }
        }
      }
    });
  } catch (err) {
    console.error("Auto-restore failed:", err);
  }
});

document.getElementById("scrapeBtn").addEventListener("click", async () => {
  const status = document.getElementById("status");
  const mdPreview = document.getElementById("mdPreview");
  const downloadBtn = document.getElementById("downloadBtn");

  // 初始化状态
  status.style.display = "block";
  status.className = "success";
  status.style.background = ""; // 清除可能的警告色
  status.innerText = "🔍 正在检查环境...";

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    // --- 第一步：环境与语言校验 ---
    const checkResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        return {
          lang: document.documentElement.lang.toLowerCase(),
          host: window.location.hostname,
          isAmazon: window.location.hostname.includes("amazon"),
        };
      },
    });

    const { lang, host, isAmazon } = checkResults[0].result;

    // 定义站点与语言的对应关系
    const languageMap = {
      "amazon.de": "de",
      "amazon.fr": "fr",
      "amazon.it": "it",
      "amazon.es": "es",
      "amazon.nl": "nl",
      "amazon.pl": "pl",
      "amazon.se": "sv",
      "amazon.ie": "en",
      "amazon.co.uk": "en",
      "amazon.com": "en",
    };

    // 查找当前站点应该使用的语言前缀
    const expectedLang = Object.keys(languageMap).find((key) =>
      host.includes(key)
    );
    const currentExpectedPrefix = expectedLang
      ? languageMap[expectedLang]
      : null;

    // 如果语言不匹配（例如在 .de 却不是以 de 开头）
    if (currentExpectedPrefix && !lang.startsWith(currentExpectedPrefix)) {
      showWarning(
        "语言设置不匹配",
        `检测到您在 <b>${host}</b> 使用了 <b>${lang}</b>。建议切换回本地语言以避免过滤失效。`,
        () => startScraping(tab) // 用户点击“仍要抓取”后执行
      );
      return;
    }

    // 环境正常，直接开始抓取
    startScraping(tab);
  } catch (err) {
    showError("插件运行错误", err.message);
  }
});

// --- 封装正式抓取逻辑 ---
function startScraping(tab) {
  const status = document.getElementById("status");
  const mdPreview = document.getElementById("mdPreview");
  const downloadBtn = document.getElementById("downloadBtn");

  status.style.background = ""; // 恢复正常背景
  status.innerText = "🔍 正在解析商品与评论...";

  chrome.scripting.executeScript(
    {
      target: { tabId: tab.id },
      func: scrapeAmazonLogic,
    },
    (results) => {
      if (chrome.runtime.lastError || !results || !results[0]) {
        showError("连接失败", "无法访问页面内容。");
        return;
      }

      finalData = results[0].result;
      chrome.storage.local.set({ lastScrapedData: finalData });

      // 【注意】结构变更兼容：检查 products 数组
      if (!finalData.products || finalData.products.length === 0) {
        showError("解析失败", "未找到商品信息");
        return;
      }

      const prod = finalData.products[0];

      if (prod.scrape_status === "failed") {
        let summary = "解析失败";
        let detail = prod.error || "未能识别商品信息。";
        if (detail.includes("Properties")) summary = "页面结构变更";
        showError(summary, detail);
        return;
      }

      status.className = "success";
      status.innerText = "✅ 分析完成";
      mdPreview.style.display = "block";
      downloadBtn.style.display = "block";
      renderPreview(prod);
    }
  );
}

// --- 辅助函数：显示警告（带继续按钮） ---
function showWarning(summary, detail, onContinue) {
  const status = document.getElementById("status");
  status.style.display = "block";
  status.style.background = "#FFF3CD"; // 警告黄
  status.style.color = "#856404";
  status.style.border = "1px solid #FFEEBA";
  status.style.textAlign = "left";
  status.innerHTML = `
        <div style="font-weight:bold; margin-bottom:4px;">⚠️ ${summary}</div>
        <div style="font-size:12px; margin-bottom:8px;">${detail}</div>
        <button id="forceContinueBtn" style="background:#856404; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-size:11px;">坚持抓取</button>
    `;

  document.getElementById("forceContinueBtn").onclick = onContinue;
}

// --- 辅助函数：显示错误 ---
function showError(summary, detail) {
  const status = document.getElementById("status");
  status.style.display = "block";
  status.style.background = "#FFF5F5";
  status.style.color = "#C53030";
  status.style.border = "1px solid #FEB2B2";
  status.innerHTML = `<strong>❌ ${summary}</strong>: <div style="font-size:12px">${detail}</div>`;
}

// 渲染函数：加入安全转义
function renderPreview(prod) {
  const preview = document.getElementById("mdPreview");

  // 转义列表内容
  let bulletsHtml = prod.feature_bullets
    .map((b) => `<li>${escapeHtml(b)}</li>`)
    .join("");

  // 只有在有评论时才生成评论 HTML
  let reviewsHtml = "";
  if (prod.customer_reviews && prod.customer_reviews.length > 0) {
    reviewsHtml = prod.customer_reviews
      .map(
        (r) => `
            <div class="review-card">
                <div style="display: flex; align-items: center; margin-bottom: 4px;">
                    <div style="display: flex; color: #DE7921; font-size: 15px; margin-right: 8px;">
                        ${Array.from(
          { length: 5 },
          (_, i) =>
            `<span style="margin-right: -1px;">${i < r.star_rating
              ? "★"
              : '<span style="color:#ccc">☆</span>'
            }</span>`
        ).join("")}
                    </div>
                    <span style="font-weight: 700; color: #0F1111; font-size: 14px;">${escapeHtml(
          r.headline
        )}</span>
                </div>
                <div style="color: #565959; font-size: 13px;">
                    ${escapeHtml(r.review_date)}
                                        
                </div>
                <div style="color: #0F1111; font-size: 14px; margin-top: 8px;">${escapeHtml(
          r.body
        )}</div>
            </div>
        `
      )
      .join("");
  } else {
    reviewsHtml =
      '<p style="color: #565959; font-size: 13px; font-style: italic;">No reviews found for this product.</p>';
  }

  preview.innerHTML = `
        <div style="font-size: 18px; font-weight: 700; color: #0F1111;">${escapeHtml(
    prod.productTitle
  )}</div>
        <div style="font-size: 12px; color: #565959; margin-bottom: 15px;">ASIN: ${escapeHtml(
    prod.asin
  )}</div>
        <div style="font-weight: 700; border-bottom: 2px solid #eee;">About this item</div>
        <ul style="font-size: 13px; padding-left: 20px;">${bulletsHtml}</ul>
        <div style="font-weight: 700; margin-top:15px; border-bottom: 2px solid #eee;">Reviews (${prod.customer_reviews.length})</div>
        ${reviewsHtml}
    `;
}

// 下载功能
document.getElementById("downloadBtn").addEventListener("click", () => {
  const status = document.getElementById("status");

  // 1. 校验数据是否存在
  if (!finalData || !finalData.products || !finalData.products[0]) {
    showError("下载失败", "没有可供下载的数据，请重新抓取。");
    return;
  }

  try {
    const product = finalData.products[0];

    // 2. 优先使用 metadata 中的时间戳，如果没有则生成新的
    let timestampStr = new Date().getTime();
    if (finalData.metadata && finalData.metadata.scrape_timestamp) {
      // 将 ISO 时间处理为文件名友好格式 (例如 2026-01-01T12-00-00)
      timestampStr = finalData.metadata.scrape_timestamp.replace(/[:.]/g, "-").slice(0, 19);
    }

    const marketplace = finalData.metadata?.marketplace || "Unknown";
    const fileName = `Amz_${marketplace}_${product.asin || "Unknown"}_${timestampStr}.json`;

    const blob = new Blob([JSON.stringify(finalData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;

    // 3. 兼容性点击处理
    document.body.appendChild(a); // 部分浏览器需要将元素加入 DOM 才能触发
    a.click();
    document.body.removeChild(a);

    // 释放内存
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (err) {
    showError("下载出错", err.message);
  }
});

/**
 * 核心抓取逻辑：将被注入到 Amazon 页面执行
 * 辅助函数必须放在此函数内部
 */
function scrapeAmazonLogic() {
  try {
    // --- 1. 配置：多重备选选择器 (基于你提供的增强版) ---
    const config = {
      productTitle: [
        "#productTitle",
        "#title",
        'h1[data-automation-id="title"]',
        "span#productTitle",
        "#titleSection #title",
      ],
      bulletPoints: [
        "#feature-bullets ul li .a-list-item", // 经典版最准
        "#productFactsDesktop_feature_div ul li", // 现代版最准
        ".a-unordered-list.a-vertical li", // 通用备选，不再直接指点到 span
      ],
      reviewContainers: [
        '[data-hook="review"]',
        ".review",
        ".a-section.review",
        "#cm_cr-review_list .review",
        ".cr-widget-Reviews .review",
      ],
      reviewBody: [
        '[data-hook="review-body"] span:not(.cr-original-review-content)',
        '[data-hook="review-body"]',
        ".review-text-content span",
        ".review-text span",
        ".reviewText",
        'span[data-hook="review-body"]',
        ".a-size-base.review-text",
        ".cr-original-review-content",
      ],
      reviewTitle: [
        '[data-hook="review-title"] span:not(.a-letter-space)',
        'a[data-hook="review-title"] span:not(.a-letter-space)',
        '[data-hook="review-title"]',
        ".review-title-content span",
      ],
      reviewRating: [
        '[data-hook="review-star-rating"]',
        '[data-hook="cmps-review-star-rating"]',
        ".review-rating",
        "i.a-icon-star",
      ],
    };

    // ============================================================
    // 1. 新增：Marketplace 识别逻辑
    // ============================================================
    const host = window.location.hostname;
    const marketplaceMap = {
      "amazon.de": "DE",
      "amazon.fr": "FR",
      "amazon.it": "IT",
      "amazon.es": "ES",
      "amazon.nl": "NL",
      "amazon.se": "SE",
      "amazon.pl": "PL",
      "amazon.com.be": "BE",
      "amazon.co.uk": "UK",
      "amazon.com": "US",
      "amazon.ie": "IE"
    };

    let marketplace = "OTHER";
    for (const [domain, code] of Object.entries(marketplaceMap)) {
      if (host.includes(domain)) {
        marketplace = code;
        break;
      }
    }

    // ============================================================
    // 2. 新增：Metadata 所需的语言与时间戳
    // ============================================================
    const now = new Date().toISOString();

    // 简单的语言映射表
    const langCode = document.documentElement.lang.split('-')[0].toLowerCase();
    const fullLangMap = {
      "de": "German", "en": "English", "fr": "French",
      "it": "Italian", "es": "Spanish", "nl": "Dutch",
      "pl": "Polish", "sv": "Swedish", "be": "French",
      "ie": "English", "tr": "Turkish", "us": "English",
      "pt": "Portuguese", "ja": "Japanese", "zh": "Chinese"
    };
    // 如果映射不到，首字母大写返回 (例如 "zh" -> "Zh")
    const language = fullLangMap[langCode] || (langCode.charAt(0).toUpperCase() + langCode.slice(1));

    // --- 2. 黑名单正则 ---
    const BLACKLIST_REGEX = [
      /von 5 Sternen|out of 5 stars|étoiles sur 5/i,
      /Verifizierter Kauf|Verified Purchase/i,
      /Sponsored|Gesponsert/i,
      // 注意：删除了可能会误杀标题的 "Nützlich", "Löschen" 等词汇
    ];

    // --- 3. 跨语言日期解析引擎 (欧洲全站点支持) ---
    const parseEuropeanDate = (text) => {
      if (!text) return "";
      // 清除介词 (如 "on", "am", "le", "il", "el", "op", "den", "w dniu")
      const cleanStr = text
        .replace(/^.*?(on|am|le|il|el|op|den|dnia|w dniu)\s+/i, "")
        .trim();
      // 月份映射
      const months = {
        jan: "01", feb: "02", mar: "03", apr: "04", mai: "05", may: "05", jun: "06",
        jul: "07", aug: "08", sep: "09", okt: "10", oct: "10", nov: "11", dez: "12",
        dec: "12", januar: "01", februar: "02", märz: "03", april: "04", juni: "06",
        juli: "07", august: "08", september: "09", oktober: "10", november: "11",
        dezember: "12", janvier: "01", février: "02", mars: "03", mai: "05", juin: "06",
        juillet: "07", août: "08", octobre: "10", novembre: "11", décembre: "12",
        gennaio: "01", febbraio: "02", marzo: "03", maggio: "05", giugno: "06",
        luglio: "07", agosto: "08", settembre: "09", ottobre: "10", novembre: "11",
        dicembre: "12", enero: "01", febrero: "02", marzo: "03", mayo: "05",
        junio: "06", julio: "07", agosto: "08", septiembre: "09", octubre: "10",
        noviembre: "11", diciembre: "12", stycznia: "01", lutego: "02", marca: "03",
        kwietnia: "04", maja: "05", czerwca: "06", lipca: "07", sierpnia: "08",
        września: "09", października: "10", listopada: "11", grudnia: "12",
      };
      // 查找月份
      let foundMonth = "01";
      for (const [name, num] of Object.entries(months)) {
        if (cleanStr.toLowerCase().includes(name)) {
          foundMonth = num;
          break;
        }
      }

      const yearMatch = cleanStr.match(/\d{4}/);
      const dayMatch = cleanStr.match(/\b\d{1,2}\b/);
      return yearMatch && dayMatch
        ? `${yearMatch[0]}-${foundMonth}-${dayMatch[0].padStart(2, "0")}`
        : cleanStr;
    };

    // --- 4. 抓取逻辑实现 ---
    const getFirstValidText = (
      selectors,
      parent = document,
      useBlacklist = true
    ) => {
      for (const sel of selectors) {
        const el = parent.querySelector(sel);
        if (el && el.innerText.trim()) {
          const txt = el.innerText.trim();
          if (useBlacklist && BLACKLIST_REGEX.some((r) => r.test(txt)))
            continue;
          return txt;
        }
      }
      return "";
    };

    // 4.1 基本信息
    const productTitle = getFirstValidText(config.productTitle);
    const asin =
      document.querySelector("#ASIN")?.value ||
      window.location.href.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1] ||
      "UNKNOWN";

    // 4.2 五点描述 (带黑名单精滤)
    let feature_bullets = [];
    for (const sel of config.bulletPoints) {
      const nodes = document.querySelectorAll(sel);
      if (nodes.length > 0) {
        const cleaned = Array.from(nodes)
          .filter((n) => {
            // 1. 核心改进：必须位于 #feature-bullets 容器内
            const isInMainFeatureArea =
              n.closest("#feature-bullets") ||
              n.closest("#featurebullets_feature_div") ||
              n.closest("#productFactsDesktop_feature_div");
            // 1. 屏蔽详情参数区域
            const isDetails =
              n.closest("#prodDetails") ||
              n.closest("#productDetails_feature_div");
            // 2. 屏蔽购物车/侧边栏区域
            const isSideBar =
              n.closest("#rightCol") || n.closest("#nav-flyout-ewc");
            // 3. 屏蔽客户评分分布区域
            const isCusterReview = n.closest(
              "#a-fixed-left-grid-col a-col-left"
            );
            // 4. 仅保留主内容区
            return (
              isInMainFeatureArea && !isDetails && !isSideBar && !isCusterReview
            );
          })
          .map((n) => {
            // 关键改动：获取该节点下的所有文本，防止 span 嵌套导致的文本断裂
            return n.textContent.replace(/\s+/g, " ").trim();
          })
          .filter((t) => t.length > 5); // 稍微放宽长度限制，现代版有些描述可能简短但重要

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
      if (found.length > 0) {
        reviewNodes = Array.from(found);
        break;
      }
    }

    const extractStars = (parent) => {
      // 1. 定义多重备选选择器（包含国际评论特有的 selector）
      const starSelectors = [
        '[data-hook="review-star-rating"]',
        '[data-hook="cmps-review-star-rating"]',
        ".review-rating",
        "i.a-icon-star",
        ".a-icon-alt", // 许多国际评论的星级文本隐藏在这里
      ];
      let rawValue = "";
      for (const sel of starSelectors) {
        const el = parent.querySelector(sel);
        if (el) {
          // 依次尝试获取 aria-label, title 或 纯文本
          rawValue =
            el.getAttribute("aria-label") ||
            el.getAttribute("title") ||
            el.innerText ||
            "";
          if (rawValue) break;
        }
      }

      if (!rawValue) return 0;

      // 2. 核心修复：处理欧洲数字格式 (例如 "4,8" 或 "4.8")
      // 正则匹配：找到数字部分，支持逗号或点号
      const match = rawValue.match(/(\d([.,]\d)?)/);
      if (match) {
        // 将逗号统一替换为点号，以便 parseFloat 正确转换
        const numStr = match[0].replace(",", ".");
        return parseFloat(numStr);
      }
      return 0;
    };

    const customer_reviews = reviewNodes
      .map((el) => {
        // 1. 获取原始标题 (关闭黑名单，确保拿到原始字符串)
        // 1. 获取标题节点
        const titleEl =
          el.querySelector('[data-hook="review-title"]') ||
          el.querySelector(".review-title-content") ||
          el.querySelector('a[data-hook="review-title"]');
        // 2. 强力清洗逻辑
        let cleanHeadline = "";
        if (titleEl) {
          // 【关键修复】：不直接使用 innerText，而是克隆节点并移除掉其中的星级 span
          const tempTitle = titleEl.cloneNode(true);
          // 移除星级干扰和可能的翻译占位符
          const noise = tempTitle.querySelectorAll(
            ".a-icon-alt, .cr-translated-review-content, i"
          );
          noise.forEach((n) => n.remove());
          cleanHeadline = tempTitle.textContent.replace(/\s+/g, " ").trim();
        }
        // --- 2. 正文抓取逻辑 (核心优化点) ---
        const bodyContainer =
          el.querySelector('[data-hook="review-body"]') ||
          el.querySelector(".reviewText") ||
          el.querySelector(".review-text-content");

        // 2. 强力清洗（双保险）：如果克隆方案没去干净，再跑一次正则
        const globalStarRegex =
          /^\d[.,]\d\s+(?:von\s+5\s+Sternen|out\s+of\s+5\s+stars|étoiles\s+sur\s+5|su\s+5\s+stelle|de\s+5\s+estrellas)/i;
        cleanHeadline = cleanHeadline.replace(globalStarRegex, "").trim();

        // 在亚马逊上，很多国际评论同步过来时确实是没有标题的
        const isStillDirty = /^\d[.,]\d\s+(?:von|out)/i.test(cleanHeadline);
        if (isStillDirty) {
          cleanHeadline = "";
        }

        let cleanBody = "";
        if (bodyContainer) {
          // 优先寻找原文内容 span (针对国际评论)
          const originalContent = bodyContainer.querySelector(
            ".cr-original-review-content"
          );
          if (originalContent) {
            cleanBody = originalContent.textContent.trim();
          } else {
            // 如果不是国际评论，则取容器内的文本，但要避开脚本和样式
            const tempBody = bodyContainer.cloneNode(true);
            const scripts = tempBody.querySelectorAll(
              "script, style, .a-expander-header"
            );
            scripts.forEach((s) => s.remove());
            cleanBody = tempBody.textContent.trim();
          }
        }
        // 清洗正文：去除多余换行，保持段落感
        cleanBody = cleanBody.replace(/\n\s*\n/g, "\n").replace(/\s{2,}/g, " ");

        // 4. 获取日期和国家
        // --- 3. 日期与国家 ---
        const dateText =
          el.querySelector('[data-hook="review-date"]')?.innerText || "";
        // 增强版国家提取：兼容 Reseñado en el Reino Unido (西班牙语等)
        const countryMatch = dateText.match(
          /(?:in|aus|en|il|em|nel|su|von|från|z|u|en\sel)\s+(.+?)\s+(?:on|am|le|il|el|au|al|del|den|dnia|på|op|el)\s+\d/i
        );

        return {
          headline: cleanHeadline || "No Title",
          body: cleanBody || "No Content",
          star_rating: (function (parent) {
            const starEl =
              parent.querySelector('[data-hook*="star-rating"]') ||
              parent.querySelector(".a-icon-star");
            const val =
              starEl?.getAttribute("aria-label") || starEl?.innerText || "0";
            const m = val.match(/(\d([.,]\d)?)/);
            return m ? parseFloat(m[0].replace(",", ".")) : 0;
          })(el),
          review_date: dateText,
          origin_country: countryMatch ? countryMatch[1].trim() : "Global",
        };
      })
      .filter((r) => r.body.length > 5)
      .slice(0, 10);

    // 检查数量是否异常
    let errorSummary = "";
    if (feature_bullets.length > 0 && feature_bullets.length < 3) {
      errorSummary = `抓取数量偏少(${feature_bullets.length}条)，可能存在漏抓`;
    } else if (feature_bullets.length === 0) {
      errorSummary = "未识别到任何描述点";
    }

    // --- 5. 构建最终返回对象 (调整为含 metadata 结构) ---
    const productsList = [
      {
        asin: asin,
        productTitle: productTitle,
        feature_bullets: feature_bullets,
        customer_reviews: customer_reviews,
        scrape_status: productTitle ? "success" : "failed",
      },
    ];

    return {
      metadata: {
        scrape_timestamp: now,
        marketplace: marketplace,
        domain: host,
        language: language,
        total_asins: productsList.length
      },
      products: productsList,
    };
  } catch (e) {
    return {
      metadata: {
        scrape_timestamp: new Date().toISOString(),
        marketplace: "ERROR",
        domain: window.location.hostname,
        language: "Unknown",
        total_asins: 0
      },
      products: [{ scrape_status: "failed", error: e.message }]
    };
  }
}
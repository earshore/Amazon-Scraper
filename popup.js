let finalData = null;

// 安全转义函数：防止 XSS 攻击
function escapeHtml(unsafe) {
  if (!unsafe) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setExportButtonsVisible(visible) {
  const display = visible ? "block" : "none";
  ["downloadBtn", "copyJsonBtn"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = display;
  });
}

function setLoaderVisible(visible) {
  const loader = document.getElementById("loader");
  if (loader) loader.style.display = visible ? "block" : "none";
}

function setScrapeEnabled(enabled) {
  const btn = document.getElementById("scrapeBtn");
  if (btn) btn.disabled = !enabled;
}

function resetStatusStyles() {
  const status = document.getElementById("status");
  status.style.background = "";
  status.style.color = "";
  status.style.border = "";
  status.style.textAlign = "center";
  status.className = "success";
}

function extractAsinFromUrl(url) {
  if (!url) return null;
  const m = String(url).match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  return m ? m[1].toUpperCase() : null;
}

function isAmazonHost(hostname) {
  if (!hostname) return false;
  return /(^|\.)amazon\.(com|de|fr|it|es|nl|se|pl|co\.uk|com\.be|ie)(\.|$)/i.test(
    hostname
  ) || hostname.includes("amazon.");
}

/**
 * 根据当前标签页 URL 更新顶部引导区
 * @returns {{ ok: boolean, asin: string|null, host: string, reason: string }}
 */
function updatePageHint(tab) {
  const hint = document.getElementById("pageHint");
  const url = tab?.url || "";
  let host = "";
  try {
    host = url ? new URL(url).hostname : "";
  } catch {
    host = "";
  }

  const asin = extractAsinFromUrl(url);
  const onAmazon = isAmazonHost(host);

  if (!url || url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:")) {
    hint.className = "page-hint warn";
    hint.style.display = "block";
    hint.innerHTML =
      "<strong>无法在此页面使用</strong>请先打开亚马逊<strong>商品详情页</strong>（URL 含 <code>/dp/ASIN</code>），再点击「分析此页面」。";
    setScrapeEnabled(false);
    return { ok: false, asin: null, host, reason: "restricted" };
  }

  if (!onAmazon) {
    hint.className = "page-hint warn";
    hint.style.display = "block";
    hint.innerHTML =
      "<strong>当前不是亚马逊页面</strong>本扩展仅在支持的亚马逊站点商品详情页工作。请打开例如 amazon.com / amazon.de 等站点的商品页。";
    setScrapeEnabled(false);
    return { ok: false, asin: null, host, reason: "not_amazon" };
  }

  if (!asin) {
    hint.className = "page-hint warn";
    hint.style.display = "block";
    hint.innerHTML =
      "<strong>请打开商品详情页</strong>已检测到亚马逊站点，但当前页不是商品详情（缺少 <code>/dp/ASIN</code> 或 <code>/gp/product/ASIN</code>）。搜索结果页、购物车等页面无法分析。";
    setScrapeEnabled(false);
    return { ok: false, asin: null, host, reason: "not_product" };
  }

  hint.className = "page-hint ok";
  hint.style.display = "block";
  hint.innerHTML = `<strong>已就绪</strong>站点 <code>${escapeHtml(
    host
  )}</code> · ASIN <code>${escapeHtml(asin)}</code> · 点击「分析此页面」开始。`;
  setScrapeEnabled(true);
  return { ok: true, asin, host, reason: "ready" };
}

function getExportBasename() {
  const product = finalData?.products?.[0] || {};
  let timestampStr = String(Date.now());
  if (finalData?.metadata?.scrape_timestamp) {
    timestampStr = finalData.metadata.scrape_timestamp
      .replace(/[:.]/g, "-")
      .slice(0, 19);
  }
  const marketplace = finalData?.metadata?.marketplace || "Unknown";
  return `Amz_${marketplace}_${product.asin || "Unknown"}_${timestampStr}`;
}

function downloadTextFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function flashStatusMessage(message) {
  const status = document.getElementById("status");
  const prev = {
    html: status.innerHTML,
    display: status.style.display,
    className: status.className,
    background: status.style.background,
    color: status.style.color,
    border: status.style.border,
    textAlign: status.style.textAlign,
  };
  status.style.display = "block";
  status.className = "success";
  status.style.background = "";
  status.style.color = "";
  status.style.border = "";
  status.style.textAlign = "center";
  status.innerText = message;
  setTimeout(() => {
    status.innerHTML = prev.html;
    status.style.display = prev.display;
    status.className = prev.className;
    status.style.background = prev.background;
    status.style.color = prev.color;
    status.style.border = prev.border;
    status.style.textAlign = prev.textAlign;
  }, 1500);
}

function showSuccessStatus(prod) {
  const status = document.getElementById("status");
  status.style.display = "block";
  resetStatusStyles();

  const warnings = prod.warnings || [];
  const coverage = prod.coverage || {};

  if (prod.scrape_status === "partial" || warnings.length > 0) {
    status.className = "partial";
    status.style.textAlign = "left";
    const warnHtml = warnings
      .map((w) => `<li>${escapeHtml(w)}</li>`)
      .join("");
    status.innerHTML = `
      <div style="font-weight:bold;margin-bottom:4px;">⚠️ 部分成功</div>
      <div style="font-size:12px;margin-bottom:6px;">
        标题 ${coverage.has_title ? "✓" : "✗"} ·
        ASIN ${coverage.has_asin ? "✓" : "✗"} ·
        价格 ${coverage.has_price ? "✓" : "✗"} ·
        描述点 ${coverage.bullet_count ?? 0} ·
        评论 ${coverage.review_count ?? 0}
      </div>
      ${warnings.length ? `<ul style="margin:0;padding-left:18px;font-size:12px;">${warnHtml}</ul>` : ""}
    `;
    return;
  }

  status.className = "success";
  status.innerText = `✅ 分析完成（描述点 ${coverage.bullet_count ?? 0} · 评论 ${
    coverage.review_count ?? 0
  }）`;
}

function handleScrapeResult(result) {
  finalData = result;
  chrome.storage.local.set({ lastScrapedData: finalData });

  if (!finalData || !finalData.products || finalData.products.length === 0) {
    showError("解析失败", "未找到商品信息");
    return;
  }

  const prod = finalData.products[0];

  if (prod.scrape_status === "failed") {
    let summary = "解析失败";
    let detail = prod.error || "未能识别商品信息。";
    if (detail.includes("Properties")) summary = "页面结构变更";
    const warnExtra =
      prod.warnings && prod.warnings.length
        ? " " + prod.warnings.join("；")
        : "";
    showError(summary, detail + warnExtra);
    return;
  }

  setExportButtonsVisible(true);
  document.getElementById("mdPreview").style.display = "block";
  showSuccessStatus(prod);
  renderPreview(prod, finalData.metadata);
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const ctx = updatePageHint(tab);

    if (!ctx.ok || !ctx.asin) return;

    chrome.storage.local.get(["lastScrapedData"], (result) => {
      if (result.lastScrapedData) {
        const cachedData = result.lastScrapedData;

        if (cachedData && cachedData.products && cachedData.products.length > 0) {
          const cachedProduct = cachedData.products[0];
          const cachedMetadata = cachedData.metadata || {};

          if (
            cachedProduct.asin === ctx.asin &&
            cachedMetadata.domain === ctx.host
          ) {
            finalData = cachedData;
            setExportButtonsVisible(true);
            document.getElementById("mdPreview").style.display = "block";
            showSuccessStatus(cachedProduct);
            renderPreview(cachedProduct, cachedMetadata);
            const status = document.getElementById("status");
            if (
              cachedProduct.scrape_status !== "partial" &&
              !(cachedProduct.warnings && cachedProduct.warnings.length)
            ) {
              status.className = "success";
              status.style.display = "block";
              status.innerText = "✅ 上次分析结果 (缓存)";
            } else {
              const tip = document.createElement("div");
              tip.style.fontSize = "11px";
              tip.style.marginTop = "6px";
              tip.textContent = "（缓存结果）";
              status.appendChild(tip);
            }
          }
        }
      }
    });
  } catch (err) {
    console.error("Auto-restore failed:", err);
    const hint = document.getElementById("pageHint");
    if (hint) {
      hint.className = "page-hint warn";
      hint.style.display = "block";
      hint.innerHTML =
        "<strong>无法读取当前标签页</strong>请刷新亚马逊商品页后重试。";
    }
    setScrapeEnabled(false);
  }
});

document.getElementById("scrapeBtn").addEventListener("click", async () => {
  const status = document.getElementById("status");

  resetStatusStyles();
  status.style.display = "block";
  status.innerText = "🔍 正在检查环境...";

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab || !tab.id) {
      showError("无法获取标签页", "请在亚马逊商品页打开本扩展。");
      return;
    }

    const ctx = updatePageHint(tab);
    if (!ctx.ok) {
      showError(
        "页面不支持",
        ctx.reason === "not_product"
          ? "请打开包含 /dp/ASIN 的商品详情页后再分析。"
          : "请在支持的亚马逊商品详情页使用本扩展。"
      );
      return;
    }

    const checkResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        return {
          lang: (document.documentElement.lang || "").toLowerCase(),
          host: window.location.hostname,
          isAmazon: window.location.hostname.includes("amazon"),
        };
      },
    });

    const { lang, host, isAmazon } = checkResults[0].result;

    if (!isAmazon) {
      showError("页面不支持", "请在亚马逊商品详情页使用本扩展。");
      return;
    }

    const languageMap = [
      { domain: "amazon.com.be", prefixes: ["fr", "nl", "en"] },
      { domain: "amazon.co.uk", prefixes: ["en"] },
      { domain: "amazon.ie", prefixes: ["en"] },
      { domain: "amazon.de", prefixes: ["de", "en"] },
      { domain: "amazon.fr", prefixes: ["fr", "en"] },
      { domain: "amazon.it", prefixes: ["it", "en"] },
      { domain: "amazon.es", prefixes: ["es", "en"] },
      { domain: "amazon.nl", prefixes: ["nl", "en"] },
      { domain: "amazon.se", prefixes: ["sv", "en"] },
      { domain: "amazon.pl", prefixes: ["pl", "en"] },
      { domain: "amazon.com", prefixes: ["en"] },
    ];

    const expectedLang = languageMap.find(
      (item) => host === item.domain || host.endsWith(`.${item.domain}`)
    );
    const currentExpectedPrefix = expectedLang ? expectedLang.prefixes : null;

    if (
      currentExpectedPrefix &&
      !currentExpectedPrefix.some((prefix) => lang.startsWith(prefix))
    ) {
      showWarning(
        "语言设置不匹配",
        `检测到您在 ${host} 使用了 ${lang}。建议切换回本地语言以避免过滤失效。`,
        () => startScraping(tab)
      );
      return;
    }

    startScraping(tab);
  } catch (err) {
    showError("插件运行错误", err.message);
  }
});

function startScraping(tab) {
  const status = document.getElementById("status");

  resetStatusStyles();
  status.style.display = "block";
  status.innerText = "🔍 正在解析商品与评论...";
  setLoaderVisible(true);
  setExportButtonsVisible(false);

  chrome.scripting.executeScript(
    {
      target: { tabId: tab.id },
      func: scrapeAmazonLogic,
    },
    (results) => {
      setLoaderVisible(false);

      if (chrome.runtime.lastError || !results || !results[0]) {
        showError(
          "连接失败",
          chrome.runtime.lastError?.message || "无法访问页面内容。"
        );
        return;
      }

      handleScrapeResult(results[0].result);
    }
  );
}

function showWarning(summary, detail, onContinue) {
  const status = document.getElementById("status");
  status.style.display = "block";
  status.style.background = "#FFF3CD";
  status.style.color = "#856404";
  status.style.border = "1px solid #FFEEBA";
  status.style.textAlign = "left";
  status.innerHTML = `
        <div style="font-weight:bold; margin-bottom:4px;">⚠️ ${escapeHtml(
          summary
        )}</div>
        <div style="font-size:12px; margin-bottom:8px;">${escapeHtml(
          detail
        )}</div>
        <button id="forceContinueBtn" type="button" style="background:#856404; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-size:11px;">坚持抓取</button>
    `;

  document.getElementById("forceContinueBtn").onclick = onContinue;
}

function showError(summary, detail) {
  setLoaderVisible(false);
  const status = document.getElementById("status");
  status.style.display = "block";
  status.style.background = "#FFF5F5";
  status.style.color = "#C53030";
  status.style.border = "1px solid #FEB2B2";
  status.style.textAlign = "left";
  status.className = "";
  status.innerHTML = `<strong>❌ ${escapeHtml(
    summary
  )}</strong><div style="font-size:12px;margin-top:4px;">${escapeHtml(
    detail
  )}</div>`;
}

function renderPreview(prod, metadata = {}) {
  const preview = document.getElementById("mdPreview");
  const coverage = prod.coverage || {};
  const warnings = prod.warnings || [];
  const bullets = prod.feature_bullets || [];
  const reviews = prod.customer_reviews || [];
  const scope =
    metadata.reviews_scope || "visible_dom_only";

  const chip = (label, state) =>
    `<span class="coverage-chip ${state}">${escapeHtml(label)}</span>`;

  const coverageHtml = `
    <div class="coverage-bar">
      ${chip(
        `标题 ${coverage.has_title ? "✓" : "✗"}`,
        coverage.has_title ? "ok" : "bad"
      )}
      ${chip(
        `ASIN ${coverage.has_asin ? "✓" : "✗"}`,
        coverage.has_asin ? "ok" : "bad"
      )}
      ${chip(
        `价格 ${coverage.has_price ? "✓" : "✗"}`,
        coverage.has_price ? "ok" : "warn"
      )}
      ${chip(
        `品牌 ${coverage.has_brand ? "✓" : "✗"}`,
        coverage.has_brand ? "ok" : "warn"
      )}
      ${chip(
        `主图 ${coverage.has_main_image ? "✓" : "✗"}`,
        coverage.has_main_image ? "ok" : "warn"
      )}
      ${chip(
        `描述点 ${coverage.bullet_count ?? bullets.length}`,
        (coverage.bullet_count ?? bullets.length) >= 3
          ? "ok"
          : (coverage.bullet_count ?? bullets.length) > 0
          ? "warn"
          : "bad"
      )}
      ${chip(
        `评论 ${coverage.review_count ?? reviews.length}`,
        (coverage.review_count ?? reviews.length) > 0 ? "ok" : "warn"
      )}
      ${chip(
        `状态 ${prod.scrape_status || "-"}`,
        prod.scrape_status === "success"
          ? "ok"
          : prod.scrape_status === "partial"
          ? "warn"
          : "bad"
      )}
    </div>
  `;

  const warningsHtml =
    warnings.length > 0
      ? `<ul class="warnings-list">${warnings
          .map((w) => `<li>${escapeHtml(w)}</li>`)
          .join("")}</ul>`
      : "";

  const thumbHtml = prod.main_image
    ? `<img class="thumb" src="${escapeHtml(
        prod.main_image
      )}" alt="" referrerpolicy="no-referrer" />`
    : "";

  const priceLine = prod.price
    ? `<div class="meta-row">价格: ${escapeHtml(prod.price)}</div>`
    : "";
  const brandLine = prod.brand
    ? `<div class="meta-row">品牌: ${escapeHtml(prod.brand)}</div>`
    : "";

  let bulletsHtml = bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("");
  if (!bulletsHtml) {
    bulletsHtml =
      '<li style="color:#565959;font-style:italic;list-style:none;margin-left:-20px;">（未识别到描述点）</li>';
  }

  let reviewsHtml = "";
  if (reviews.length > 0) {
    reviewsHtml = reviews
      .map(
        (r) => `
            <div class="review-card">
                <div style="display: flex; align-items: center; margin-bottom: 4px;">
                    <div style="display: flex; color: #DE7921; font-size: 15px; margin-right: 8px;">
                        ${Array.from(
                          { length: 5 },
                          (_, i) =>
                            `<span style="margin-right: -1px;">${
                              i < r.star_rating
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
      '<p style="color: #565959; font-size: 13px; font-style: italic;">当前页未识别到评论（仅抓取页面可见部分）。</p>';
  }

  preview.innerHTML = `
        ${coverageHtml}
        ${warningsHtml}
        ${thumbHtml}
        <div style="font-size: 18px; font-weight: 700; color: #0F1111;">${escapeHtml(
          prod.productTitle
        )}</div>
        <div class="meta-row">ASIN: ${escapeHtml(prod.asin)}</div>
        ${brandLine}
        ${priceLine}
        <div style="font-weight: 700; border-bottom: 2px solid #eee; margin-top: 10px;">商品卖点</div>
        <ul style="font-size: 13px; padding-left: 20px;">${bulletsHtml}</ul>
        <div style="font-weight: 700; margin-top:15px; border-bottom: 2px solid #eee;">评论 (${
          reviews.length
        })</div>
        ${reviewsHtml}
        <div class="scope-note">评论范围: <code>${escapeHtml(
          scope
        )}</code> — 仅包含商品详情页当前 DOM 中可见的评论，不是全站/全部分页评论。数据仅在本地解析，不上传服务器。</div>
    `;
}

document.getElementById("downloadBtn").addEventListener("click", () => {
  if (!finalData || !finalData.products || !finalData.products[0]) {
    showError("下载失败", "没有可供下载的数据，请重新抓取。");
    return;
  }

  try {
    downloadTextFile(
      JSON.stringify(finalData, null, 2),
      `${getExportBasename()}.json`,
      "application/json"
    );
  } catch (err) {
    showError("下载出错", err.message);
  }
});

document.getElementById("copyJsonBtn").addEventListener("click", async () => {
  if (!finalData || !finalData.products || !finalData.products[0]) {
    showError("复制失败", "没有可供复制的数据，请重新抓取。");
    return;
  }

  try {
    await navigator.clipboard.writeText(JSON.stringify(finalData, null, 2));
    flashStatusMessage("✅ 已复制 JSON 到剪贴板");
  } catch (err) {
    showError("复制失败", err.message || "浏览器拒绝访问剪贴板。");
  }
});

/**
 * 核心抓取逻辑：将被注入到 Amazon 页面执行
 * 辅助函数必须放在此函数内部
 */
function scrapeAmazonLogic() {
  try {
    const SCHEMA_VERSION = "1.2.0";
    const REVIEWS_SCOPE = "visible_dom_only";

    const config = {
      productTitle: [
        "#productTitle",
        "#title",
        'h1[data-automation-id="title"]',
        "span#productTitle",
        "#titleSection #title",
      ],
      price: [
        "#corePrice_feature_div .a-price .a-offscreen",
        "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
        "#priceblock_ourprice",
        "#priceblock_dealprice",
        "#priceblock_saleprice",
        "#price_inside_buybox",
        ".a-price.aok-align-center .a-offscreen",
        "#tp_price_block_total_price_ww .a-offscreen",
        "span.a-price.a-text-price.a-size-medium.apexPriceToPay .a-offscreen",
        "#sns-base-price .a-offscreen",
      ],
      brand: [
        "#bylineInfo",
        "a#brand",
        "#brand",
        "tr.po-brand td.a-span9 span",
        "#productOverview_feature_div tr.po-brand span.po-break-word",
      ],
      mainImage: [
        "#landingImage",
        "#imgTagWrapperId img",
        "#main-image-container img",
        "#imageBlock img",
        "img#imgBlkFront",
      ],
      bulletPoints: [
        "#feature-bullets ul li .a-list-item",
        "#productFactsDesktop_feature_div ul li",
        ".a-unordered-list.a-vertical.a-spacing-small li span.a-list-item",
        ".a-unordered-list.a-vertical li span.a-list-item",
        ".a-unordered-list.a-vertical li",
      ],
      reviewContainers: [
        '[data-hook="review"]',
        '[data-hook="reviewContainer"]',
        ".review",
        ".a-section.review",
        "#cm_cr-review_list .review",
        ".cr-widget-Reviews .review",
      ],
      reviewBody: [
        '[data-hook="reviewRichContentContainer"]',
        '[data-hook="reviewText"] [data-hook="reviewRichContentContainer"]',
        '[data-hook="reviewTextContainer"] [data-hook="reviewRichContentContainer"]',
        '[data-hook="review-body"] .cr-original-review-content',
        '[data-hook="review-body"]',
        '[data-hook="review-body"] span:not(.cr-original-review-content)',
        '[data-hook="reviewText"]',
        '[data-hook="reviewTextContainer"]',
        ".review-text-content span",
        ".review-text span",
        ".reviewText",
        'span[data-hook="review-body"]',
        ".a-size-base.review-text",
        ".cr-original-review-content",
      ],
      reviewTitle: [
        '[data-hook="reviewTitle"]',
        '[data-hook="review-title"] .cr-original-review-content',
        'a[data-hook="review-title"]',
        '[data-hook="review-title"]',
        ".review-title-content",
        ".review-title",
      ],
    };

    const marketplaceEntries = [
      ["amazon.com.be", "BE"],
      ["amazon.co.uk", "UK"],
      ["amazon.ie", "IE"],
      ["amazon.de", "DE"],
      ["amazon.fr", "FR"],
      ["amazon.it", "IT"],
      ["amazon.es", "ES"],
      ["amazon.nl", "NL"],
      ["amazon.se", "SE"],
      ["amazon.pl", "PL"],
      ["amazon.com", "US"],
    ];

    const host = window.location.hostname;
    let marketplace = "OTHER";
    for (const [domain, code] of marketplaceEntries) {
      if (host === domain || host.endsWith("." + domain)) {
        marketplace = code;
        break;
      }
    }

    const now = new Date().toISOString();

    const langCode = (document.documentElement.lang || "en")
      .split("-")[0]
      .toLowerCase();
    const fullLangMap = {
      de: "German",
      en: "English",
      fr: "French",
      it: "Italian",
      es: "Spanish",
      nl: "Dutch",
      pl: "Polish",
      sv: "Swedish",
      be: "French",
      ie: "English",
      tr: "Turkish",
      us: "English",
      pt: "Portuguese",
      ja: "Japanese",
      zh: "Chinese",
    };
    const language =
      fullLangMap[langCode] ||
      langCode.charAt(0).toUpperCase() + langCode.slice(1);

    const BLACKLIST_REGEX = [
      /von 5 Sternen|out of 5 stars|étoiles sur 5/i,
      /Verifizierter Kauf|Verified Purchase/i,
      /Sponsored|Gesponsert/i,
    ];

    const getFirstValidText = (
      selectors,
      parent = document,
      useBlacklist = true
    ) => {
      for (const sel of selectors) {
        let el;
        try {
          el = parent.querySelector(sel);
        } catch {
          continue;
        }
        if (el && el.innerText && el.innerText.trim()) {
          const txt = el.innerText.trim();
          if (useBlacklist && BLACKLIST_REGEX.some((r) => r.test(txt))) continue;
          return txt;
        }
      }
      return "";
    };

    const getFirstElement = (selectors, parent = document) => {
      for (const sel of selectors) {
        let el;
        try {
          el = parent.querySelector(sel);
        } catch {
          continue;
        }
        if (el && el.textContent && el.textContent.trim()) return el;
      }
      return null;
    };

    const cleanElementText = (source, selectorsToRemove = "") => {
      if (!source) return "";
      const temp = source.cloneNode(true);
      if (selectorsToRemove) {
        temp.querySelectorAll(selectorsToRemove).forEach((n) => n.remove());
      }
      return temp.textContent.replace(/\s+/g, " ").trim();
    };

    const extractOriginCountry = (dateText) => {
      const countryPatterns = [
        /Reviewed in (.+?) on /i,
        /Bewertet in (.+?) am /i,
        /Comment\S*\s+(?:en|au|aux)\s+(.+?)\s+le\s+/i,
        /Recensito in (.+?) il /i,
        /Revisado en (.+?) el /i,
        /Beoordeeld in (.+?) op /i,
        /Recenserad i (.+?) den /i,
        /Zrecenzowano w (.+?) (?:w dniu|dnia) /i,
      ];

      for (const pattern of countryPatterns) {
        const match = dateText.match(pattern);
        if (match) return match[1].replace(/\s+/g, " ").trim();
      }

      return "Global";
    };

    const extractStars = (parent) => {
      const starSelectors = [
        '[data-hook="review-star-rating"]',
        '[data-hook="cmps-review-star-rating"]',
        '[data-hook*="star-rating"]',
        ".review-rating",
        "i.a-icon-star",
        ".a-icon-alt",
      ];
      let rawValue = "";
      for (const sel of starSelectors) {
        const el = parent.querySelector(sel);
        if (el) {
          rawValue =
            el.getAttribute("aria-label") ||
            el.getAttribute("title") ||
            el.innerText ||
            "";
          if (rawValue) break;
        }
      }
      if (!rawValue) return 0;
      const match = rawValue.match(/(\d([.,]\d)?)/);
      if (match) {
        return parseFloat(match[0].replace(",", "."));
      }
      return 0;
    };

    const extractMainImage = () => {
      for (const sel of config.mainImage) {
        let el;
        try {
          el = document.querySelector(sel);
        } catch {
          continue;
        }
        if (!el) continue;
        const src =
          el.getAttribute("data-old-hires") ||
          el.getAttribute("data-a-dynamic-image") ||
          el.currentSrc ||
          el.getAttribute("src") ||
          "";
        if (src && src.startsWith("{")) {
          try {
            const map = JSON.parse(src);
            const keys = Object.keys(map);
            if (keys.length) return keys[0];
          } catch {
            /* ignore */
          }
        }
        if (src && /^https?:\/\//i.test(src)) return src.split(" ")[0];
      }
      return "";
    };

    const cleanBrand = (raw) => {
      if (!raw) return "";
      return raw
        .replace(
          /^(Brand|Visit the|Marke|Marque|Marca|Marka|Merk)\s*:?\s*/i,
          ""
        )
        .replace(/\s+Store$/i, "")
        .replace(/^Besuche den\s+/i, "")
        .replace(/\s+Store\.?$/i, "")
        .trim();
    };

    // 基本信息
    const productTitle = getFirstValidText(config.productTitle);
    const asin =
      document.querySelector("#ASIN")?.value ||
      window.location.href.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1] ||
      "UNKNOWN";

    let price = getFirstValidText(config.price, document, false);
    if (price) price = price.replace(/\s+/g, " ").trim();

    let brand = cleanBrand(getFirstValidText(config.brand, document, false));
    const main_image = extractMainImage();

    // 五点描述
    let feature_bullets = [];
    for (const sel of config.bulletPoints) {
      const nodes = document.querySelectorAll(sel);
      if (nodes.length > 0) {
        const cleaned = Array.from(nodes)
          .filter((n) => {
            const isInMainFeatureArea =
              n.closest("#feature-bullets") ||
              n.closest("#featurebullets_feature_div") ||
              n.closest("#productFactsDesktop_feature_div") ||
              n.closest(".a-expander-content");

            const isDetails =
              n.closest("#prodDetails") ||
              n.closest("#productDetails_feature_div") ||
              n.closest(".product-facts-detail");

            const isSideBar =
              n.closest("#rightCol") || n.closest("#nav-flyout-ewc");

            const isCustomerReview = n.closest(
              "#a-fixed-left-grid-col a-col-left"
            );

            return (
              isInMainFeatureArea &&
              !isDetails &&
              !isSideBar &&
              !isCustomerReview
            );
          })
          .map((n) => n.textContent.replace(/\s+/g, " ").trim())
          .filter((t) => t.length > 5);

        if (cleaned.length > 0) {
          feature_bullets = [...new Set(cleaned)].slice(0, 10);
          break;
        }
      }
    }

    // 评论（仅当前 DOM 可见）
    let reviewNodes = [];
    for (const sel of config.reviewContainers) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) {
        reviewNodes = Array.from(found);
        break;
      }
    }

    const customer_reviews = reviewNodes
      .map((el) => {
        const titleEl = getFirstElement(config.reviewTitle, el);
        let cleanHeadline = "";
        if (titleEl) {
          cleanHeadline = cleanElementText(
            titleEl,
            '.a-icon-alt, .a-letter-space, .cr-translated-review-content, [data-hook*="star-rating"], i'
          );
        }

        const bodyContainer = getFirstElement(config.reviewBody, el);

        const globalStarRegex =
          /^\d(?:[.,]\d)?\s+(?:von\s+5\s+Sternen|out\s+of\s+5\s+stars|\S+\s+sur\s+5|su\s+5\s+stelle|de\s+5\s+estrellas|van\s+5\s+sterren|av\s+5\s+\S+|na\s+5\s+\S+)/i;
        cleanHeadline = cleanHeadline.replace(globalStarRegex, "").trim();

        const isStillDirty =
          /^\d(?:[.,]\d)?\s+(?:von|out|sur|su|de|van|av|na)/i.test(
            cleanHeadline
          );
        if (isStillDirty) {
          cleanHeadline = "";
        }

        let cleanBody = "";
        if (bodyContainer) {
          const originalContent = bodyContainer.matches(
            ".cr-original-review-content"
          )
            ? bodyContainer
            : bodyContainer.querySelector(".cr-original-review-content");
          if (originalContent) {
            cleanBody = cleanElementText(originalContent);
          } else {
            const richContent = bodyContainer.matches(
              '[data-hook="reviewRichContentContainer"]'
            )
              ? bodyContainer
              : bodyContainer.querySelector(
                  '[data-hook="reviewRichContentContainer"]'
                );
            const bodySource = richContent || bodyContainer;
            const tempBody = bodySource.cloneNode(true);
            const scripts = tempBody.querySelectorAll(
              'script, style, noscript, .a-hidden, .a-expander-header, .a-expander-prompt, .a-expander-partial-collapse-header, .a-cardui-expand-control-footer, [data-hook="reviewExpandButtonContainer"], [data-hook="translationSpinner"]'
            );
            scripts.forEach((s) => s.remove());
            cleanBody = tempBody.textContent.trim();
          }
        }
        cleanBody = cleanBody.replace(/\n\s*\n/g, "\n").replace(/\s{2,}/g, " ");

        const dateEl = getFirstElement(
          ['[data-hook="review-date"]', '[data-hook="reviewDate"]'],
          el
        );
        const dateText = dateEl ? cleanElementText(dateEl) : "";
        const countryMatch = dateText.match(
          /(?:in|aus|en|il|em|nel|su|von|från|z|u|en\sel)\s+(.+?)\s+(?:on|am|le|il|el|au|al|del|den|dnia|på|op|el)\s+\d/i
        );
        const parsedOriginCountry = extractOriginCountry(dateText);

        return {
          headline: cleanHeadline || "No Title",
          body: cleanBody || "No Content",
          star_rating: extractStars(el),
          review_date: dateText,
          origin_country:
            parsedOriginCountry !== "Global"
              ? parsedOriginCountry
              : countryMatch
              ? countryMatch[1].trim()
              : "Global",
        };
      })
      .filter((r) => r.body.length > 5);

    const coverage = {
      has_title: Boolean(productTitle),
      has_asin: asin !== "UNKNOWN",
      has_price: Boolean(price),
      has_brand: Boolean(brand),
      has_main_image: Boolean(main_image),
      bullet_count: feature_bullets.length,
      review_count: customer_reviews.length,
    };

    const warnings = [];
    if (!productTitle) warnings.push("未识别到商品标题");
    if (asin === "UNKNOWN") warnings.push("未识别到 ASIN");
    if (!price) warnings.push("未识别到价格");
    if (!brand) warnings.push("未识别到品牌");
    if (!main_image) warnings.push("未识别到主图");
    if (feature_bullets.length === 0) {
      warnings.push("未识别到任何描述点");
    } else if (feature_bullets.length < 3) {
      warnings.push(
        `描述点偏少(${feature_bullets.length}条)，可能存在漏抓`
      );
    }
    if (customer_reviews.length === 0) {
      warnings.push("当前页未识别到评论（仅抓取页面可见评论）");
    }

    let scrape_status = "success";
    if (!productTitle) {
      scrape_status = "failed";
    } else if (warnings.length > 0) {
      scrape_status = "partial";
    }

    const productsList = [
      {
        asin: asin,
        productTitle: productTitle,
        price: price,
        brand: brand,
        main_image: main_image,
        feature_bullets: feature_bullets,
        customer_reviews: customer_reviews,
        scrape_status: scrape_status,
        coverage: coverage,
        warnings: warnings,
      },
    ];

    return {
      metadata: {
        schema_version: SCHEMA_VERSION,
        scrape_timestamp: now,
        marketplace: marketplace,
        domain: host,
        language: language,
        total_asins: productsList.length,
        reviews_scope: REVIEWS_SCOPE,
      },
      products: productsList,
    };
  } catch (e) {
    return {
      metadata: {
        schema_version: "1.2.0",
        scrape_timestamp: new Date().toISOString(),
        marketplace: "ERROR",
        domain: window.location.hostname,
        language: "Unknown",
        total_asins: 0,
        reviews_scope: "visible_dom_only",
      },
      products: [
        {
          scrape_status: "failed",
          error: e.message,
          price: "",
          brand: "",
          main_image: "",
          coverage: {
            has_title: false,
            has_asin: false,
            has_price: false,
            has_brand: false,
            has_main_image: false,
            bullet_count: 0,
            review_count: 0,
          },
          warnings: ["抓取过程发生异常: " + e.message],
          feature_bullets: [],
          customer_reviews: [],
        },
      ],
    };
  }
}

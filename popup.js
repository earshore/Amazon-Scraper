/* global AmazonProductInsightMarketplaces, chrome */
let finalData = null;
let scrapeInFlight = false;

const mp = globalThis.AmazonProductInsightMarketplaces;
if (!mp) {
  console.error(
    "AmazonProductInsightMarketplaces missing — load scraper/marketplaces.js first"
  );
}

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
  const el = document.getElementById("downloadBtn");
  if (el) el.style.display = visible ? "block" : "none";
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
  return mp ? mp.extractAsinFromUrl(url) : null;
}

function isAmazonHost(hostname) {
  return mp ? mp.isAmazonHost(hostname) : false;
}

function isExportableResult(data) {
  return mp ? mp.isExportableResult(data) : false;
}

function formatTimestamp(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

/**
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

  if (
    !url ||
    url.startsWith("chrome://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:")
  ) {
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
      "<strong>当前不是亚马逊页面</strong>本扩展仅在支持的亚马逊站点商品详情页工作。请打开 amazon.com / amazon.de 等站点的商品页。";
    setScrapeEnabled(false);
    return { ok: false, asin: null, host, reason: "not_amazon" };
  }

  if (!asin) {
    hint.className = "page-hint warn";
    hint.style.display = "block";
    hint.innerHTML =
      "<strong>请打开商品详情页</strong>已检测到亚马逊站点，但当前页不是商品详情（缺少 <code>/dp/ASIN</code>、<code>/gp/product/ASIN</code> 或 <code>/gp/aw/d/ASIN</code>）。搜索结果页、购物车等无法分析。";
    setScrapeEnabled(false);
    return { ok: false, asin: null, host, reason: "not_product" };
  }

  hint.className = "page-hint ok";
  hint.style.display = "block";
  hint.innerHTML = `<strong>已就绪</strong>站点 <code>${escapeHtml(
    host
  )}</code> · ASIN <code>${escapeHtml(
    asin
  )}</code> · 点击「分析此页面」开始。`;
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

function listBlock(title, items, cssClass) {
  if (!items || !items.length) return "";
  return `
    <div class="${cssClass}">
      <div class="msg-title">${escapeHtml(title)}</div>
      <ul>${items.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>
    </div>
  `;
}

function showSuccessStatus(prod, metadata, options = {}) {
  const status = document.getElementById("status");
  status.style.display = "block";
  resetStatusStyles();

  const warnings = prod.warnings || [];
  const notes = prod.notes || [];
  const errors = prod.errors || [];
  const coverage = prod.coverage || {};
  const fromCache = Boolean(options.fromCache);
  const ts = formatTimestamp(metadata?.scrape_timestamp);

  if (prod.scrape_status === "failed" || errors.length > 0) {
    showError(
      "解析失败",
      errors.join("；") || prod.error || "未能识别商品信息。"
    );
    return;
  }

  const covLine = `标题 ${coverage.has_title ? "✓" : "✗"} · ASIN ${
    coverage.has_asin ? "✓" : "✗"
  } · 价格 ${coverage.has_price ? "✓" : "✗"} · 描述点 ${
    coverage.bullet_count ?? 0
  } · 评论 ${coverage.review_count ?? 0}`;

  const cacheLine = fromCache
    ? `<div class="cache-line">缓存结果${ts ? ` · ${escapeHtml(ts)}` : ""} · 可重新分析以刷新</div>`
    : ts
    ? `<div class="cache-line">抓取时间 ${escapeHtml(ts)}</div>`
    : "";

  if (prod.scrape_status === "partial" || warnings.length > 0) {
    status.className = "partial";
    status.style.textAlign = "left";
    status.innerHTML = `
      <div style="font-weight:bold;margin-bottom:4px;">部分成功 — 核心字段可用，存在质量告警</div>
      <div style="font-size:12px;margin-bottom:6px;">${escapeHtml(covLine)}</div>
      ${listBlock("需要关注", warnings, "warn-block")}
      ${listBlock("说明", notes, "note-block")}
      ${cacheLine}
    `;
    return;
  }

  status.className = "success";
  status.style.textAlign = "left";
  status.innerHTML = `
    <div style="font-weight:bold;margin-bottom:4px;">分析完成</div>
    <div style="font-size:12px;margin-bottom:6px;">${escapeHtml(covLine)}</div>
    ${listBlock("说明", notes, "note-block")}
    ${cacheLine}
  `;
}

function applyExportableResult(result, options = {}) {
  finalData = result;
  setExportButtonsVisible(true);
  const preview = document.getElementById("resultPreview");
  if (preview) preview.style.display = "block";
  const prod = result.products[0];
  showSuccessStatus(prod, result.metadata, options);
  renderPreview(prod, result.metadata);
}

function handleScrapeResult(result) {
  if (!result || !result.products || result.products.length === 0) {
    finalData = null;
    setExportButtonsVisible(false);
    showError("解析失败", "未找到商品信息");
    return;
  }

  const prod = result.products[0];

  if (prod.scrape_status === "failed" || !isExportableResult(result)) {
    finalData = null;
    setExportButtonsVisible(false);
    // Do not cache failed results
    chrome.storage.local.remove(["lastScrapedData"]);
    const detail =
      (prod.errors && prod.errors.join("；")) ||
      prod.error ||
      "未能识别商品信息。";
    showError("解析失败", detail);
    return;
  }

  finalData = result;
  chrome.storage.local.set({ lastScrapedData: finalData });
  applyExportableResult(result, { fromCache: false });
}

/**
 * Inject marketplaces + scraper/core.js then call scrapeAmazonPage (ISOLATED world).
 */
async function runPageScrape(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["scraper/marketplaces.js", "scraper/core.js"],
    world: "ISOLATED",
  });

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    func: () => {
      if (typeof scrapeAmazonPage !== "function") {
        return {
          metadata: {
            schema_version: "1.3.0",
            scrape_timestamp: new Date().toISOString(),
            marketplace: "ERROR",
            domain: location.hostname,
            language: "Unknown",
            total_asins: 0,
            reviews_scope: "visible_dom_only",
          },
          products: [
            {
              asin: "UNKNOWN",
              productTitle: "",
              price: "",
              brand: "",
              main_image: "",
              feature_bullets: [],
              customer_reviews: [],
              scrape_status: "failed",
              errors: ["抓取脚本未加载（scrapeAmazonPage 不可用）"],
              warnings: [],
              notes: [],
              coverage: {
                has_title: false,
                has_asin: false,
                has_price: false,
                has_brand: false,
                has_main_image: false,
                bullet_count: 0,
                review_count: 0,
              },
            },
          ],
        };
      }
      return scrapeAmazonPage(document, window.location);
    },
  });

  return results && results[0] ? results[0].result : null;
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const ctx = updatePageHint(tab);

    if (!ctx.ok || !ctx.asin) return;

    chrome.storage.local.get(["lastScrapedData"], (result) => {
      if (!result.lastScrapedData) return;
      const cachedData = result.lastScrapedData;
      if (!isExportableResult(cachedData)) {
        chrome.storage.local.remove(["lastScrapedData"]);
        return;
      }
      if (!cachedData.products || !cachedData.products.length) return;

      const cachedProduct = cachedData.products[0];
      const cachedMetadata = cachedData.metadata || {};

      if (
        cachedProduct.asin === ctx.asin &&
        cachedMetadata.domain === ctx.host
      ) {
        applyExportableResult(cachedData, { fromCache: true });
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
  status.innerText = "正在检查环境…";

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
      world: "ISOLATED",
      func: () => ({
        lang: (document.documentElement.lang || "").toLowerCase(),
        host: window.location.hostname,
      }),
    });

    if (!checkResults || !checkResults[0] || !checkResults[0].result) {
      showError("连接失败", "无法读取页面环境信息。");
      return;
    }

    const { lang, host } = checkResults[0].result;

    if (!isAmazonHost(host)) {
      showError("页面不支持", "请在支持的亚马逊商品详情页使用本扩展。");
      return;
    }

    const prefixes = mp ? mp.getLangPrefixes(host) : null;

    if (
      prefixes &&
      !prefixes.some((prefix) => lang.startsWith(prefix))
    ) {
      showWarning(
        "语言设置不匹配",
        `检测到站点 ${host} 当前语言为 ${lang}。建议切换为站点常用语言后再分析，以提高卖点/评论解析成功率。`,
        () => startScraping(tab)
      );
      return;
    }

    startScraping(tab);
  } catch (err) {
    showError("插件运行错误", err.message);
  }
});

async function startScraping(tab) {
  if (scrapeInFlight) return;
  scrapeInFlight = true;
  setScrapeEnabled(false);

  const status = document.getElementById("status");
  resetStatusStyles();
  status.style.display = "block";
  status.innerText = "正在解析商品与评论…";
  setLoaderVisible(true);
  setExportButtonsVisible(false);

  try {
    const result = await runPageScrape(tab.id);
    if (!result) {
      showError("连接失败", "无法访问页面内容。");
      return;
    }
    handleScrapeResult(result);
  } catch (err) {
    showError("连接失败", err.message || "无法访问页面内容。");
  } finally {
    setLoaderVisible(false);
    scrapeInFlight = false;
    try {
      const [active] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (active) updatePageHint(active);
      else setScrapeEnabled(true);
    } catch {
      setScrapeEnabled(true);
    }
  }
}

function showWarning(summary, detail, onContinue) {
  const status = document.getElementById("status");
  status.style.display = "block";
  status.style.background = "#FFF3CD";
  status.style.color = "#856404";
  status.style.border = "1px solid #FFEEBA";
  status.style.textAlign = "left";
  status.innerHTML = `
        <div style="font-weight:bold; margin-bottom:4px;">${escapeHtml(
          summary
        )}</div>
        <div style="font-size:12px; margin-bottom:8px;">${escapeHtml(
          detail
        )}</div>
        <button id="forceContinueBtn" type="button" class="force-btn">仍要分析</button>
    `;
  const btn = document.getElementById("forceContinueBtn");
  btn.onclick = onContinue;
  try {
    btn.focus();
  } catch {
    /* ignore */
  }
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
  status.innerHTML = `<strong>${escapeHtml(
    summary
  )}</strong><div style="font-size:12px;margin-top:4px;">${escapeHtml(
    detail
  )}</div>`;
}

function renderPreview(prod, metadata = {}) {
  const preview = document.getElementById("resultPreview");
  if (!preview) return;
  const coverage = prod.coverage || {};
  const warnings = prod.warnings || [];
  const notes = prod.notes || [];
  const bullets = prod.feature_bullets || [];
  const reviews = prod.customer_reviews || [];
  const scope = metadata.reviews_scope || "visible_dom_only";
  const titleAlt = prod.productTitle
    ? escapeHtml(prod.productTitle).slice(0, 120)
    : "商品主图";

  const chip = (label, state) =>
    `<span class="coverage-chip ${state}">${escapeHtml(label)}</span>`;

  const coverageHtml = `
    <div class="coverage-bar">
      ${chip(`标题 ${coverage.has_title ? "✓" : "✗"}`, coverage.has_title ? "ok" : "bad")}
      ${chip(`ASIN ${coverage.has_asin ? "✓" : "✗"}`, coverage.has_asin ? "ok" : "bad")}
      ${chip(`价格 ${coverage.has_price ? "✓" : "✗"}`, coverage.has_price ? "ok" : "warn")}
      ${chip(`品牌 ${coverage.has_brand ? "✓" : "✗"}`, coverage.has_brand ? "ok" : "warn")}
      ${chip(`主图 ${coverage.has_main_image ? "✓" : "✗"}`, coverage.has_main_image ? "ok" : "warn")}
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

  const warningsHtml = warnings.length
    ? `<div class="warn-block"><div class="msg-title">需要关注</div><ul class="warnings-list">${warnings
        .map((w) => `<li>${escapeHtml(w)}</li>`)
        .join("")}</ul></div>`
    : "";

  const notesHtml = notes.length
    ? `<div class="note-block"><div class="msg-title">说明</div><ul class="notes-list">${notes
        .map((w) => `<li>${escapeHtml(w)}</li>`)
        .join("")}</ul></div>`
    : "";

  // Preview loads remote Amazon CDN images when present (see PRIVACY.md).
  const safeImage =
    prod.main_image && /^https:\/\//i.test(prod.main_image)
      ? prod.main_image
      : "";
  const thumbHtml = safeImage
    ? `<img class="thumb" src="${escapeHtml(
        safeImage
      )}" alt="${titleAlt}" referrerpolicy="no-referrer" />`
    : "";

  const priceLine = prod.price
    ? `<div class="meta-row">价格：${escapeHtml(prod.price)}</div>`
    : "";
  const brandLine = prod.brand
    ? `<div class="meta-row">品牌：${escapeHtml(prod.brand)}</div>`
    : "";

  let bulletsHtml = bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("");
  if (!bulletsHtml) {
    bulletsHtml = '<li class="empty-li">（未识别到描述点）</li>';
  }

  let reviewsHtml = "";
  if (reviews.length > 0) {
    reviewsHtml = reviews
      .map(
        (r) => `
            <div class="review-card">
                <div class="review-top">
                    <div class="stars">
                        ${Array.from({ length: 5 }, (_, i) =>
                          i < r.star_rating
                            ? "★"
                            : '<span class="star-empty">☆</span>'
                        ).join("")}
                    </div>
                    <span class="review-headline">${escapeHtml(r.headline)}</span>
                </div>
                <div class="review-date">${escapeHtml(r.review_date)}</div>
                <div class="review-body">${escapeHtml(r.body)}</div>
            </div>
        `
      )
      .join("");
  } else {
    reviewsHtml =
      '<p class="empty-p">当前页没有可见评论（属正常情况时会记入「说明」，不单独判失败）。</p>';
  }

  preview.innerHTML = `
        ${coverageHtml}
        ${warningsHtml}
        ${notesHtml}
        ${thumbHtml}
        <div class="product-title">${escapeHtml(prod.productTitle)}</div>
        <div class="meta-row">ASIN：${escapeHtml(prod.asin)}</div>
        ${brandLine}
        ${priceLine}
        <div class="section-title">商品卖点</div>
        <ul class="bullet-list">${bulletsHtml}</ul>
        <div class="section-title">评论（${reviews.length}）</div>
        ${reviewsHtml}
        <div class="scope-note">
          评论范围：<code>${escapeHtml(scope)}</code> — 仅商品详情页当前 DOM 中可见的评论，不是全站分页评论。
          数据仅在本地解析。抓取时间：${escapeHtml(
            formatTimestamp(metadata.scrape_timestamp) || "—"
          )}
        </div>
    `;
}

document.getElementById("downloadBtn").addEventListener("click", () => {
  if (!isExportableResult(finalData)) {
    showError("下载失败", "没有可供下载的有效数据，请重新分析。");
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

document.getElementById("clearCacheBtn")?.addEventListener("click", () => {
  if (!window.confirm("确定清除本地缓存的上次分析结果？")) return;
  chrome.storage.local.remove(["lastScrapedData"], () => {
    finalData = null;
    setExportButtonsVisible(false);
    const preview = document.getElementById("resultPreview");
    if (preview) {
      preview.style.display = "none";
      preview.innerHTML = "";
    }
    const status = document.getElementById("status");
    status.style.display = "block";
    status.className = "success";
    status.style.textAlign = "center";
    status.innerText = "已清除本地缓存";
  });
});

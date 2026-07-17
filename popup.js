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
  if (!status) return;
  status.style.background = "";
  status.style.color = "";
  status.style.border = "";
  status.style.textAlign = "center";
  status.className = "success";
}

function showBootError(message) {
  const card = document.querySelector(".card") || document.body;
  const box = document.createElement("div");
  box.setAttribute("role", "alert");
  box.style.cssText =
    "margin:12px 0;padding:12px;background:#FFF5F5;color:#C53030;border:1px solid #FEB2B2;border-radius:6px;font-size:13px;line-height:1.45;";
  box.textContent = message;
  card.insertBefore(box, card.firstChild);
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

/** Compact warn body: title + one-line detail (minimal footprint). */
function setPageHintWarn(hint, title, detailHtml) {
  hint.className = "page-hint warn";
  hint.style.display = "block";
  hint.innerHTML = `<div class="ph-title">${escapeHtml(
    title
  )}</div><p class="ph-detail">${detailHtml}</p>`;
}

/** Ready strip: status dot + label + host/ASIN chips (no CTA copy — button is primary). */
function setPageHintReady(hint, host, asin) {
  hint.className = "page-hint ok";
  hint.style.display = "flex";
  hint.innerHTML = `<span class="ph-dot" aria-hidden="true"></span><span class="ph-label">就绪</span><span class="ph-meta"><span class="ph-chip" title="站点">${escapeHtml(
    host
  )}</span><span class="ph-chip asin" title="ASIN">${escapeHtml(
    asin
  )}</span></span>`;
}

/**
 * @returns {{ ok: boolean, asin: string|null, host: string, reason: string }}
 */
function updatePageHint(tab) {
  const hint = document.getElementById("pageHint");
  if (!hint) {
    return { ok: false, asin: null, host: "", reason: "no_hint" };
  }
  const url = tab?.url || "";
  let host = "";
  try {
    host = url ? new URL(url).hostname : "";
  } catch {
    host = "";
  }

  const asin = extractAsinFromUrl(url);
  const onAmazon = isAmazonHost(host);
  hint.dataset.ready = "1";

  if (
    !url ||
    url.startsWith("chrome://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:")
  ) {
    setPageHintWarn(
      hint,
      "无法在此页面使用",
      "请打开亚马逊商品详情页（URL 含 <code>/dp/ASIN</code>）。"
    );
    setScrapeEnabled(false);
    return { ok: false, asin: null, host, reason: "restricted" };
  }

  if (!onAmazon) {
    setPageHintWarn(
      hint,
      "非支持站点",
      "请在 amazon.com / amazon.de 等支持站点的商品页使用。"
    );
    setScrapeEnabled(false);
    return { ok: false, asin: null, host, reason: "not_amazon" };
  }

  if (!asin) {
    setPageHintWarn(
      hint,
      "不是商品详情页",
      "需要 <code>/dp/</code>、<code>/gp/product/</code> 或 <code>/gp/aw/d/</code>。"
    );
    setScrapeEnabled(false);
    return { ok: false, asin: null, host, reason: "not_product" };
  }

  setPageHintReady(hint, host, asin);
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

/** Run after the next paint so the popup chrome is interactive first. */
function afterFirstPaint(fn) {
  const run = () => {
    try {
      fn();
    } catch (err) {
      console.error(err);
    }
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => setTimeout(run, 0));
  } else {
    setTimeout(run, 0);
  }
}

function applyExportableResult(result, options = {}) {
  finalData = result;
  setExportButtonsVisible(true);
  const preview = document.getElementById("resultPreview");
  if (preview) preview.style.display = "block";
  const prod = result.products[0];
  showSuccessStatus(prod, result.metadata, options);
  // Defer heavy DOM + remote image so status/buttons paint first.
  if (options.deferPreview) {
    afterFirstPaint(() => renderPreview(prod, result.metadata));
  } else {
    renderPreview(prod, result.metadata);
  }
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

async function onScrapeClick() {
  const status = document.getElementById("status");
  resetStatusStyles();
  if (status) {
    status.style.display = "block";
    status.innerText = "正在检查环境…";
  }

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

    if (prefixes && !prefixes.some((prefix) => lang.startsWith(prefix))) {
      showWarning(
        "语言设置不匹配",
        `检测到站点 ${host} 当前语言为 ${lang}。建议切换为站点常用语言后再分析，以提高卖点/评论解析成功率。`,
        () => startScraping(tab)
      );
      return;
    }

    startScraping(tab);
  } catch (err) {
    showError("插件运行错误", err.message || String(err));
  }
}

function wireUiHandlers() {
  const scrapeBtn = document.getElementById("scrapeBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const clearCacheBtn = document.getElementById("clearCacheBtn");

  if (!scrapeBtn || !downloadBtn) {
    showBootError(
      "弹窗 UI 未正确加载（缺少按钮节点）。请在 chrome://extensions 中「重新加载」扩展，并确认加载目录为含 manifest.json 的仓库根目录。"
    );
    return false;
  }

  scrapeBtn.addEventListener("click", () => {
    onScrapeClick().catch((err) =>
      showError("插件运行错误", err.message || String(err))
    );
  });

  downloadBtn.addEventListener("click", () => {
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
      showError("下载出错", err.message || String(err));
    }
  });

  clearCacheBtn?.addEventListener("click", () => {
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
      if (status) {
        status.style.display = "block";
        status.className = "success";
        status.style.textAlign = "center";
        status.innerText = "已清除本地缓存";
      }
    });
  });

  return true;
}

function showDetectingHint() {
  const hint = document.getElementById("pageHint");
  if (!hint) return;
  // Avoid flashing if already filled by a fast path.
  if (hint.dataset.ready === "1") return;
  hint.className = "page-hint detecting";
  hint.style.display = "flex";
  hint.innerHTML =
    '<span class="ph-dot" aria-hidden="true"></span><span class="ph-label">检测中…</span>';
}

async function restoreCacheIfAny() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const ctx = updatePageHint(tab);
    const hint = document.getElementById("pageHint");
    if (hint) hint.dataset.ready = "1";

    if (!ctx.ok || !ctx.asin) return;

    // Storage + preview after page hint is visible.
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
        applyExportableResult(cachedData, {
          fromCache: true,
          deferPreview: true,
        });
      }
    });
  } catch (err) {
    console.error("Auto-restore failed:", err);
    const hint = document.getElementById("pageHint");
    if (hint) {
      hint.dataset.ready = "1";
      setPageHintWarn(hint, "无法读取标签页", "请刷新商品页后重试。");
    }
    setScrapeEnabled(false);
  }
}

function bootPopup() {
  try {
    if (!mp) {
      showBootError(
        "核心脚本 scraper/marketplaces.js 未加载。请重新加载扩展，并确认扩展目录包含 scraper/ 文件夹。"
      );
      setScrapeEnabled(false);
      return;
    }
    // 1) Bind buttons immediately — popup must feel interactive on open.
    if (!wireUiHandlers()) return;
    showDetectingHint();
    // 2) After first paint: tabs.query + cache restore (may hit remote thumb CDN).
    afterFirstPaint(() => {
      restoreCacheIfAny();
    });
  } catch (err) {
    console.error("Popup boot failed:", err);
    showBootError(
      "弹窗初始化失败：" + (err && err.message ? err.message : String(err))
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootPopup);
} else {
  bootPopup();
}

async function startScraping(tab) {
  if (scrapeInFlight) return;
  scrapeInFlight = true;
  setScrapeEnabled(false);

  const status = document.getElementById("status");
  resetStatusStyles();
  if (status) {
    status.style.display = "block";
    status.innerText = "正在解析商品与评论…";
  }
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
  if (!status) {
    showBootError(`${summary}: ${detail || ""}`);
    return;
  }
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
  if (btn) {
    btn.onclick = onContinue;
    try {
      btn.focus();
    } catch {
      /* ignore */
    }
  }
}

function showError(summary, detail) {
  setLoaderVisible(false);
  const status = document.getElementById("status");
  if (!status) {
    showBootError(`${summary}: ${detail || ""}`);
    return;
  }
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

  // Preview may load remote Amazon CDN images (see PRIVACY.md).
  // Use data-src + deferred assign so popup open is not gated on network.
  const safeImage =
    prod.main_image && /^https:\/\//i.test(prod.main_image)
      ? prod.main_image
      : "";
  const thumbHtml = safeImage
    ? `<img class="thumb" data-src="${escapeHtml(
        safeImage
      )}" alt="${titleAlt}" referrerpolicy="no-referrer" decoding="async" loading="lazy" />`
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

  // Kick off remote thumb after layout, so open latency is not network-bound.
  afterFirstPaint(() => {
    preview.querySelectorAll("img.thumb[data-src]").forEach((img) => {
      const src = img.getAttribute("data-src");
      if (src) {
        img.setAttribute("src", src);
        img.removeAttribute("data-src");
      }
    });
  });
}


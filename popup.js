/* global AmazonProductInsightMarketplaces, chrome */
let finalData = null;
let scrapeInFlight = false;

const mp = globalThis.AmazonProductInsightMarketplaces;
if (!mp) {
  console.error(
    "AmazonProductInsightMarketplaces missing — load scraper/marketplaces.js first"
  );
}

/**
 * Kick off active-tab query as soon as popup.js evaluates (before boot wiring).
 * Overlaps with handler binding so "检测中 → 就绪" is not delayed by setup.
 * @type {Promise<chrome.tabs.Tab[]>}
 */
const earlyActiveTabQuery =
  typeof chrome !== "undefined" && chrome.tabs?.query
    ? chrome.tabs.query({ active: true, currentWindow: true })
    : Promise.resolve([]);

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

/**
 * One primary action: fresh analyze vs re-analyze (overwrites local cache).
 * Short labels; detail only in title tooltip to save chrome for results.
 * @param {"fresh"|"refresh"} mode
 */
function setPrimaryActionMode(mode) {
  const btn = document.getElementById("scrapeBtn");
  if (!btn) return;
  const next = mode === "refresh" ? "refresh" : "fresh";
  btn.dataset.mode = next;
  if (next === "refresh") {
    btn.textContent = "重新分析";
    btn.title = "覆盖本地缓存，抓取当前页最新数据";
  } else {
    btn.textContent = "分析";
    btn.title = "解析当前商品页 DOM，结果可导出 JSON";
  }
}

function resetStatusStyles() {
  const status = document.getElementById("status");
  if (!status) return;
  status.style.background = "";
  status.style.color = "";
  status.style.border = "";
  status.style.textAlign = "";
  status.style.display = "";
  status.className = "";
  if (status._toastTimer) {
    clearTimeout(status._toastTimer);
    status._toastTimer = null;
  }
}

/**
 * Non-interactive tip (toast). Must not look like a button.
 * @param {string} message
 * @param {{ kind?: "ok"|"info", autoHideMs?: number }} [options]
 */
function showToast(message, options = {}) {
  const status = document.getElementById("status");
  if (!status) return;
  const kind = options.kind === "ok" ? "ok" : "info";
  const autoHideMs =
    typeof options.autoHideMs === "number" ? options.autoHideMs : 3200;
  resetStatusStyles();
  status.style.display = "flex";
  status.className = `status-toast ${kind}`;
  const mark = kind === "ok" ? "✓" : "i";
  status.innerHTML = `<span class="toast-mark" aria-hidden="true">${mark}</span><span class="toast-text">${escapeHtml(
    message
  )}</span>`;
  if (autoHideMs > 0) {
    status._toastTimer = setTimeout(() => {
      if (status.classList.contains("status-toast")) {
        status.style.display = "none";
        status.className = "";
        status.innerHTML = "";
      }
      status._toastTimer = null;
    }, autoHideMs);
  }
}

function showBootError(message) {
  const card = document.querySelector(".card") || document.body;
  const box = document.createElement("div");
  box.setAttribute("role", "alert");
  box.className = "status-banner danger boot-error";
  box.style.cssText =
    "display:block;margin:0 0 8px;padding:6px 8px;border-radius:6px;font-size:11px;line-height:1.4;background:var(--danger-bg,#fff5f5);border:1px solid var(--danger-line,#feb2b2);border-left:3px solid var(--danger,#c53030);color:var(--text,#0f1111);";
  box.innerHTML = `<div class="banner-title" style="font-weight:600;color:var(--danger,#c53030);margin:0 0 2px;">初始化失败</div><div class="banner-detail" style="color:var(--muted,#565959);">${escapeHtml(
    message
  )}</div>`;
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

/**
 * Locale gate: only marketplace language(s) may be scraped.
 * @returns {{ ok: boolean, note?: string, detail?: string, prefixes?: string[] }}
 */
function evaluatePageLanguage(host, langAttr) {
  if (!mp) {
    return { ok: false, note: "配置未加载", detail: "语言校验模块不可用。" };
  }
  const prefixes = mp.getLangPrefixes(host);
  if (!prefixes || !prefixes.length) {
    return {
      ok: false,
      note: "未知站点语言策略",
      detail: "无法确定该站点允许的界面语言。",
    };
  }
  if (mp.isLangAllowed(langAttr, prefixes)) {
    return { ok: true, prefixes };
  }
  const need = mp.formatLangList(prefixes);
  const got = String(langAttr || "").trim() || "(空)";
  return {
    ok: false,
    prefixes,
    note: `需要 ${need} · 当前 ${got}`,
    detail: `该站点仅支持界面语言 ${need}。请先在亚马逊切换到对应语言后再分析（其他语言选择器不可靠）。当前 html[lang]=${got}`,
  };
}

async function readPageLangAndHost(tabId) {
  const checkResults = await chrome.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    func: () => ({
      lang: (document.documentElement.lang || "").toLowerCase(),
      host: window.location.hostname,
    }),
  });
  if (!checkResults || !checkResults[0] || !checkResults[0].result) {
    return null;
  }
  return checkResults[0].result;
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
 * Shared page-hint strip (ok / warn / detecting).
 * Layout always: dot + label + optional meta (chips or muted note).
 * @param {HTMLElement} hint
 * @param {{ variant: "ok"|"warn"|"detecting", label: string, chips?: string[], note?: string }} opts
 */
function setPageHintStrip(hint, opts) {
  const variant = opts.variant || "detecting";
  const label = opts.label || "";
  hint.className = `page-hint ${variant}`;
  hint.style.display = "flex";

  let metaHtml = "";
  if (opts.chips && opts.chips.length) {
    metaHtml = `<span class="ph-meta">${opts.chips
      .map((c) => {
        const text = c.text || c;
        const title = c.title || text;
        const cls = c.cls ? ` ph-chip ${c.cls}` : " ph-chip";
        return `<span class="${cls.trim()}" title="${escapeHtml(
          title
        )}">${escapeHtml(text)}</span>`;
      })
      .join("")}</span>`;
  } else if (opts.note) {
    metaHtml = `<span class="ph-meta"><span class="ph-note" title="${escapeHtml(
      opts.note
    )}">${escapeHtml(opts.note)}</span></span>`;
  }

  hint.innerHTML = `<span class="ph-dot" aria-hidden="true"></span><span class="ph-label">${escapeHtml(
    label
  )}</span>${metaHtml}`;
}

/** Warn / blocked: same strip as ready, amber signal + short note. */
function setPageHintWarn(hint, title, note) {
  setPageHintStrip(hint, {
    variant: "warn",
    label: title,
    note: note || "",
  });
}

/** Ready: green signal + host / ASIN chips. */
function setPageHintReady(hint, host, asin) {
  setPageHintStrip(hint, {
    variant: "ok",
    label: "就绪",
    chips: [
      { text: host, title: "站点" },
      { text: asin, title: "ASIN", cls: "asin" },
    ],
  });
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
    setPageHintWarn(hint, "不可用", "请打开亚马逊商品详情页（含 /dp/ASIN）");
    setScrapeEnabled(false);
    return { ok: false, asin: null, host, reason: "restricted" };
  }

  if (!onAmazon) {
    setPageHintWarn(
      hint,
      "非支持站点",
      host
        ? `${host} · 请改用 amazon.com / .de 等商品页`
        : "请改用 amazon.com / amazon.de 等商品页"
    );
    setScrapeEnabled(false);
    return { ok: false, asin: null, host, reason: "not_amazon" };
  }

  if (!asin) {
    setPageHintWarn(hint, "非商品页", "需要 /dp/、/gp/product/ 或 /gp/aw/d/");
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
  if (!status) return;
  resetStatusStyles();
  status.style.display = "block";

  const warnings = prod.warnings || [];
  const notes = prod.notes || [];
  const errors = prod.errors || [];
  const fromCache = Boolean(options.fromCache);
  const ts = formatTimestamp(metadata?.scrape_timestamp);

  if (prod.scrape_status === "failed" || errors.length > 0) {
    showError(
      "解析失败",
      errors.join("；") || prod.error || "未能识别商品信息。"
    );
    return;
  }

  const cacheLine = fromCache
    ? `<div class="cache-line">缓存${ts ? ` · ${escapeHtml(ts)}` : ""}</div>`
    : ts
    ? `<div class="cache-line">${escapeHtml(ts)}</div>`
    : "";

  if (prod.scrape_status === "partial" || warnings.length > 0) {
    status.className = "partial";
    status.style.textAlign = "left";
    status.innerHTML = `
      <div style="font-weight:600;margin-bottom:4px;">部分成功</div>
      ${listBlock("需要关注", warnings, "warn-block")}
      ${notes.length ? listBlock("说明", notes, "note-block") : ""}
      ${cacheLine}
    `;
    return;
  }

  // Full success: chips live in preview; hide status if nothing to say
  status.className = "success";
  status.style.textAlign = "left";
  if (notes.length || cacheLine) {
    status.innerHTML = `
      ${notes.length ? listBlock("说明", notes, "note-block") : ""}
      ${cacheLine}
    `;
  } else {
    status.style.display = "none";
    status.innerHTML = "";
  }
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
  setPrimaryActionMode("refresh");
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
    setPrimaryActionMode("fresh");
    showError("解析失败", "未找到商品信息");
    return;
  }

  const prod = result.products[0];

  if (prod.scrape_status === "failed" || !isExportableResult(result)) {
    finalData = null;
    setExportButtonsVisible(false);
    setPrimaryActionMode("fresh");
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
  showToast("正在检查环境…", { kind: "info", autoHideMs: 0 });

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

    const pageMeta = await readPageLangAndHost(tab.id);
    if (!pageMeta) {
      showError("连接失败", "无法读取页面环境信息。");
      return;
    }

    const { lang, host } = pageMeta;

    if (!isAmazonHost(host)) {
      showError("页面不支持", "请在支持的亚马逊商品详情页使用本扩展。");
      return;
    }

    const langGate = evaluatePageLanguage(host, lang);
    if (!langGate.ok) {
      const hint = document.getElementById("pageHint");
      if (hint) {
        setPageHintWarn(hint, "语言不符", langGate.note);
        hint.dataset.ready = "1";
      }
      setScrapeEnabled(false);
      showError("语言不符", langGate.detail);
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

  if (!scrapeBtn || !downloadBtn) {
    showBootError(
      "弹窗 UI 未正确加载（缺少按钮节点）。请在 chrome://extensions 中「重新加载」扩展，并确认加载目录为含 manifest.json 的仓库根目录。"
    );
    return false;
  }

  setPrimaryActionMode("fresh");

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

  return true;
}

function showDetectingHint() {
  const hint = document.getElementById("pageHint");
  if (!hint) return;
  // Avoid flashing if already filled by a fast path.
  if (hint.dataset.ready === "1") return;
  setPageHintStrip(hint, { variant: "detecting", label: "检测中…" });
}

/**
 * chrome.storage.local.get as a Promise (parallel with language probe on open).
 * @param {string[]} keys
 * @returns {Promise<Record<string, unknown>>}
 */
function storageLocalGet(keys) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (result) => resolve(result || {}));
    } catch (err) {
      console.warn("storage.local.get failed:", err);
      resolve({});
    }
  });
}

/**
 * After shell is painted: resolve active tab → page hint → language gate + cache.
 * Language probe and storage read run in parallel so open is not serial I/O.
 */
async function restoreCacheIfAny() {
  try {
    // Prefer the in-flight query started at script load; fall back if it failed.
    let tab;
    try {
      const tabs = await earlyActiveTabQuery;
      tab = tabs && tabs[0];
    } catch {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      tab = tabs && tabs[0];
    }
    // Cheap URL-only gate first so "就绪 / 不可用" replaces "检测中" ASAP.
    const ctx = updatePageHint(tab);
    const hint = document.getElementById("pageHint");
    if (hint) hint.dataset.ready = "1";

    if (!ctx.ok || !ctx.asin || !tab?.id) return;

    // Parallel: locale hard-gate + local cache (neither blocks the other).
    const [pageMeta, storageResult] = await Promise.all([
      readPageLangAndHost(tab.id).catch((langErr) => {
        console.warn("Language probe failed:", langErr);
        return null;
      }),
      storageLocalGet(["lastScrapedData"]),
    ]);

    if (pageMeta && isAmazonHost(pageMeta.host)) {
      const langGate = evaluatePageLanguage(pageMeta.host, pageMeta.lang);
      if (!langGate.ok) {
        if (hint) setPageHintWarn(hint, "语言不符", langGate.note);
        setScrapeEnabled(false);
        return;
      }
    }

    const cachedData = storageResult.lastScrapedData;
    if (!cachedData) return;
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
      // Heavy preview DOM + remote thumb after next paint (shell already ready).
      applyExportableResult(cachedData, {
        fromCache: true,
        deferPreview: true,
      });
    }
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
    // 1) Bind buttons immediately — HTML shell is already visible (detecting + disabled).
    if (!wireUiHandlers()) return;
    showDetectingHint();
    // 2) Tab probe ASAP (do not wait for rAF). Only preview/images defer to afterFirstPaint.
    restoreCacheIfAny().catch((err) => {
      console.error("Popup restore failed:", err);
      setScrapeEnabled(false);
    });
  } catch (err) {
    console.error("Popup boot failed:", err);
    showBootError(
      "弹窗初始化失败：" + (err && err.message ? err.message : String(err))
    );
    setScrapeEnabled(false);
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

  const isRefresh =
    document.getElementById("scrapeBtn")?.dataset?.mode === "refresh";
  showToast(
    isRefresh ? "正在重新分析（将覆盖本地缓存）…" : "正在解析商品与评论…",
    { kind: "info", autoHideMs: 0 }
  );
  setLoaderVisible(true);
  setExportButtonsVisible(false);
  // Clear prior preview while refreshing so old data is not mistaken for new.
  const preview = document.getElementById("resultPreview");
  if (preview) {
    preview.style.display = "none";
    preview.innerHTML = "";
  }

  try {
    const result = await runPageScrape(tab.id);
    if (!result) {
      showError("连接失败", "无法访问页面内容。");
      setPrimaryActionMode(isRefresh ? "fresh" : "fresh");
      return;
    }
    handleScrapeResult(result);
  } catch (err) {
    showError("连接失败", err.message || "无法访问页面内容。");
    setPrimaryActionMode("fresh");
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

function showError(summary, detail) {
  setLoaderVisible(false);
  const status = document.getElementById("status");
  if (!status) {
    showBootError(`${summary}: ${detail || ""}`);
    return;
  }
  resetStatusStyles();
  status.style.display = "block";
  status.className = "status-banner danger";
  status.innerHTML = `<div class="banner-title">${escapeHtml(
    summary
  )}</div><div class="banner-detail">${escapeHtml(detail || "")}</div>`;
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
          <code>${escapeHtml(scope)}</code>
          · ${escapeHtml(formatTimestamp(metadata.scrape_timestamp) || "—")}
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


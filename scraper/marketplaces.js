/**
 * Shared marketplace / ASIN helpers for Amazon Product Insight.
 * Single source of truth for domains, locale languages, host checks, ASIN parsing.
 *
 * Browser: load before popup.js / inject before core.js → AmazonProductInsightMarketplaces
 * Node: require("./marketplaces")
 *
 * Language policy: only marketplace locale(s). Extra UI languages (e.g. EN on DE)
 * are rejected — selectors/copy differ and scrapes are low value.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.AmazonProductInsightMarketplaces = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  /**
   * Longest-match first (amazon.com.be before amazon.com).
   * `langs` = allowed documentElement.lang prefixes for scraping (locale only).
   */
  const MARKETPLACES = [
    { domain: "amazon.com.be", code: "BE", langs: ["fr", "nl"] },
    { domain: "amazon.co.uk", code: "UK", langs: ["en"] },
    { domain: "amazon.ie", code: "IE", langs: ["en"] },
    { domain: "amazon.de", code: "DE", langs: ["de"] },
    { domain: "amazon.fr", code: "FR", langs: ["fr"] },
    { domain: "amazon.it", code: "IT", langs: ["it"] },
    { domain: "amazon.es", code: "ES", langs: ["es"] },
    { domain: "amazon.nl", code: "NL", langs: ["nl"] },
    { domain: "amazon.se", code: "SE", langs: ["sv"] },
    { domain: "amazon.pl", code: "PL", langs: ["pl"] },
    { domain: "amazon.com", code: "US", langs: ["en"] },
  ];

  const ASIN_PATTERN = /^[A-Z0-9]{10}$/i;
  /** /dp/, /gp/product/, mobile /gp/aw/d/ */
  const ASIN_URL_RE =
    /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)/i;

  function isValidAsin(value) {
    if (value == null) return false;
    return ASIN_PATTERN.test(String(value).trim());
  }

  function extractAsinFromUrl(url) {
    if (!url) return null;
    const m = String(url).match(ASIN_URL_RE);
    return m ? m[1].toUpperCase() : null;
  }

  /**
   * Prefer validated #ASIN input; else validated URL ASIN; else UNKNOWN.
   * Invalid input never overrides a good URL ASIN.
   */
  function resolveAsin(fromInput, fromUrl) {
    const input =
      fromInput != null && String(fromInput).trim()
        ? String(fromInput).trim().toUpperCase()
        : "";
    const url =
      fromUrl != null && String(fromUrl).trim()
        ? String(fromUrl).trim().toUpperCase()
        : "";
    if (isValidAsin(input)) return input;
    if (isValidAsin(url)) return url;
    return "UNKNOWN";
  }

  function findMarketplace(hostname) {
    const host = String(hostname || "").toLowerCase();
    if (!host) return null;
    for (const entry of MARKETPLACES) {
      const d = entry.domain;
      if (host === d || host.endsWith("." + d)) return entry;
    }
    return null;
  }

  function getMarketplaceCode(hostname) {
    const entry = findMarketplace(hostname);
    return entry ? entry.code : "OTHER";
  }

  function isAmazonHost(hostname) {
    return findMarketplace(hostname) != null;
  }

  function getLangPrefixes(hostname) {
    const entry = findMarketplace(hostname);
    return entry ? entry.langs.slice() : null;
  }

  /**
   * True if html[lang] matches an allowed prefix for the host.
   * Matches "de", "de-DE", "de-de" against prefix "de"; does not match "deu".
   */
  function isLangAllowed(langAttr, prefixes) {
    if (!prefixes || !prefixes.length) return false;
    const raw = String(langAttr || "").trim().toLowerCase();
    if (!raw) return false;
    const primary = raw.split(/[-_]/)[0];
    return prefixes.some((p) => {
      const prefix = String(p).toLowerCase();
      return primary === prefix || raw === prefix || raw.startsWith(prefix + "-");
    });
  }

  function isHostLangAllowed(hostname, langAttr) {
    const prefixes = getLangPrefixes(hostname);
    return isLangAllowed(langAttr, prefixes);
  }

  /** Human-readable list for UI, e.g. "de" or "fr / nl". */
  function formatLangList(prefixes) {
    if (!prefixes || !prefixes.length) return "";
    return prefixes.join(" / ");
  }

  /** Manifest host_permissions patterns (subdomain + apex). */
  function hostPermissionPatterns() {
    const out = [];
    for (const { domain } of MARKETPLACES) {
      out.push("https://*." + domain + "/*");
      out.push("https://" + domain + "/*");
    }
    return out;
  }

  function isExportableStatus(status) {
    return status === "success" || status === "partial";
  }

  function isExportableResult(data) {
    const prod = data && data.products && data.products[0];
    return Boolean(prod && isExportableStatus(prod.scrape_status));
  }

  return {
    MARKETPLACES: MARKETPLACES,
    ASIN_PATTERN: ASIN_PATTERN,
    ASIN_URL_RE: ASIN_URL_RE,
    isValidAsin: isValidAsin,
    extractAsinFromUrl: extractAsinFromUrl,
    resolveAsin: resolveAsin,
    findMarketplace: findMarketplace,
    getMarketplaceCode: getMarketplaceCode,
    isAmazonHost: isAmazonHost,
    getLangPrefixes: getLangPrefixes,
    isLangAllowed: isLangAllowed,
    isHostLangAllowed: isHostLangAllowed,
    formatLangList: formatLangList,
    hostPermissionPatterns: hostPermissionPatterns,
    isExportableStatus: isExportableStatus,
    isExportableResult: isExportableResult,
  };
});

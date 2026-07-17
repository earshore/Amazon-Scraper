/**
 * Shared marketplace / ASIN helpers for Amazon Product Insight.
 * Single source of truth for domains, language prefixes, host checks, ASIN parsing.
 *
 * Browser: load before popup.js / inject before core.js → AmazonProductInsightMarketplaces
 * Node: require("./marketplaces")
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.AmazonProductInsightMarketplaces = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  /** Longest-match first (amazon.com.be before amazon.com). */
  const MARKETPLACES = [
    { domain: "amazon.com.be", code: "BE", langs: ["fr", "nl", "en"] },
    { domain: "amazon.co.uk", code: "UK", langs: ["en"] },
    { domain: "amazon.ie", code: "IE", langs: ["en"] },
    { domain: "amazon.de", code: "DE", langs: ["de", "en"] },
    { domain: "amazon.fr", code: "FR", langs: ["fr", "en"] },
    { domain: "amazon.it", code: "IT", langs: ["it", "en"] },
    { domain: "amazon.es", code: "ES", langs: ["es", "en"] },
    { domain: "amazon.nl", code: "NL", langs: ["nl", "en"] },
    { domain: "amazon.se", code: "SE", langs: ["sv", "en"] },
    { domain: "amazon.pl", code: "PL", langs: ["pl", "en"] },
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
    hostPermissionPatterns: hostPermissionPatterns,
    isExportableStatus: isExportableStatus,
    isExportableResult: isExportableResult,
  };
});

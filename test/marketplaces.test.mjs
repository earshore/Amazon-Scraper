/**
 * Unit tests for scraper/marketplaces.js (shared allowlist / ASIN / export gates)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const mp = require(path.join(root, "scraper", "marketplaces.js"));

describe("isValidAsin / resolveAsin", () => {
  it("accepts 10-char alphanumeric ASINs only", () => {
    assert.equal(mp.isValidAsin("B08N5WRWNW"), true);
    assert.equal(mp.isValidAsin("b08n5wrwnw"), true);
    assert.equal(mp.isValidAsin("B00NOTITLE1"), false);
    assert.equal(mp.isValidAsin(""), false);
    assert.equal(mp.isValidAsin(null), false);
  });

  it("prefers valid input over URL; invalid input falls back to URL", () => {
    assert.equal(mp.resolveAsin("B08N5WRWNW", "B00OTHER01"), "B08N5WRWNW");
    assert.equal(mp.resolveAsin("B00NOTITLE1", "B08VALID01"), "B08VALID01");
    assert.equal(mp.resolveAsin("bad", "also-bad"), "UNKNOWN");
  });
});

describe("extractAsinFromUrl", () => {
  it("supports /dp/, /gp/product/, /gp/aw/d/", () => {
    assert.equal(
      mp.extractAsinFromUrl("https://www.amazon.com/dp/B08N5WRWNW"),
      "B08N5WRWNW"
    );
    assert.equal(
      mp.extractAsinFromUrl(
        "https://www.amazon.de/gp/product/B07XYZABC1/ref=xx"
      ),
      "B07XYZABC1"
    );
    assert.equal(
      mp.extractAsinFromUrl("https://www.amazon.com/gp/aw/d/B0MOBILE01"),
      "B0MOBILE01"
    );
    assert.equal(
      mp.extractAsinFromUrl("https://www.amazon.com/s?k=foo"),
      null
    );
  });
});

describe("isAmazonHost / marketplace codes", () => {
  it("allowlists supported hosts and rejects lookalikes", () => {
    assert.equal(mp.isAmazonHost("www.amazon.com"), true);
    assert.equal(mp.isAmazonHost("amazon.de"), true);
    assert.equal(mp.isAmazonHost("www.amazon.com.be"), true);
    assert.equal(mp.isAmazonHost("notamazon.com"), false);
    assert.equal(mp.isAmazonHost("amazon.com.evil.example"), false);
    assert.equal(mp.isAmazonHost("www.amazon.ca"), false);
  });

  it("maps hosts to marketplace codes with BE before com", () => {
    assert.equal(mp.getMarketplaceCode("www.amazon.com"), "US");
    assert.equal(mp.getMarketplaceCode("www.amazon.co.uk"), "UK");
    assert.equal(mp.getMarketplaceCode("www.amazon.com.be"), "BE");
    assert.equal(mp.getMarketplaceCode("smile.amazon.com"), "US");
    assert.equal(mp.getMarketplaceCode("example.com"), "OTHER");
  });

  it("returns language prefixes per host", () => {
    assert.deepEqual(mp.getLangPrefixes("www.amazon.de"), ["de", "en"]);
    assert.deepEqual(mp.getLangPrefixes("www.amazon.com"), ["en"]);
    assert.equal(mp.getLangPrefixes("www.example.com"), null);
  });
});

describe("isExportableResult", () => {
  it("allows success and partial only", () => {
    assert.equal(
      mp.isExportableResult({ products: [{ scrape_status: "success" }] }),
      true
    );
    assert.equal(
      mp.isExportableResult({ products: [{ scrape_status: "partial" }] }),
      true
    );
    assert.equal(
      mp.isExportableResult({ products: [{ scrape_status: "failed" }] }),
      false
    );
    assert.equal(mp.isExportableResult(null), false);
  });
});

describe("hostPermissionPatterns", () => {
  it("includes apex and wildcard for each marketplace domain", () => {
    const patterns = mp.hostPermissionPatterns();
    assert.ok(patterns.includes("https://*.amazon.com/*"));
    assert.ok(patterns.includes("https://amazon.com/*"));
    assert.ok(patterns.includes("https://*.amazon.com.be/*"));
    assert.ok(patterns.includes("https://amazon.com.be/*"));
    assert.equal(patterns.length, mp.MARKETPLACES.length * 2);
  });
});

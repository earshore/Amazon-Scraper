/**
 * Fixture-based tests for scraper/core.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { JSDOM } from "jsdom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const { scrapeAmazonPage, SCHEMA_VERSION, REVIEWS_SCOPE } = require(
  path.join(root, "scraper", "core.js")
);

function loadFixture(name, url) {
  const html = fs.readFileSync(
    path.join(__dirname, "fixtures", name),
    "utf8"
  );
  const dom = new JSDOM(html, { url });
  return { document: dom.window.document, location: dom.window.location };
}

describe("scraper schema constants", () => {
  it("exports schema 1.3.0 and visible_dom_only", () => {
    assert.equal(SCHEMA_VERSION, "1.3.0");
    assert.equal(REVIEWS_SCOPE, "visible_dom_only");
  });
});

describe("us-full.html", () => {
  it("parses full listing as success with reviews", () => {
    const { document, location } = loadFixture(
      "us-full.html",
      "https://www.amazon.com/dp/B08N5WRWNW"
    );
    const result = scrapeAmazonPage(document, location);
    const p = result.products[0];

    assert.equal(result.metadata.schema_version, "1.3.0");
    assert.equal(result.metadata.marketplace, "US");
    assert.equal(result.metadata.reviews_scope, "visible_dom_only");
    assert.equal(p.asin, "B08N5WRWNW");
    assert.ok(p.productTitle.length > 5);
    assert.ok(p.price.includes("19.99") || p.price.includes("$"));
    assert.ok(p.brand.length > 0);
    assert.ok(p.main_image.startsWith("http"));
    assert.ok(p.feature_bullets.length >= 5);
    assert.equal(p.customer_reviews.length, 2);
    assert.equal(p.scrape_status, "success");
    assert.equal(p.warnings.length, 0);
    assert.equal(p.errors.length, 0);
    assert.ok(p.coverage.has_title);
    assert.ok(p.coverage.has_price);
    assert.ok(p.coverage.review_count === 2);
  });
});

describe("de-partial-no-reviews.html", () => {
  it("is success with notes when only reviews missing", () => {
    const { document, location } = loadFixture(
      "de-partial-no-reviews.html",
      "https://www.amazon.de/dp/B07XYZABC1"
    );
    const result = scrapeAmazonPage(document, location);
    const p = result.products[0];

    assert.equal(result.metadata.marketplace, "DE");
    assert.equal(p.asin, "B07XYZABC1");
    assert.ok(p.productTitle.length > 0);
    assert.ok(p.feature_bullets.length >= 5);
    assert.equal(p.customer_reviews.length, 0);
    assert.equal(p.scrape_status, "success", "no reviews should be notes-only");
    assert.equal(p.warnings.length, 0);
    assert.ok(p.notes.some((n) => /评论/.test(n)));
  });
});

describe("minimal-title-only.html", () => {
  it("is partial with quality warnings when bullets missing", () => {
    const { document, location } = loadFixture(
      "minimal-title-only.html",
      "https://www.amazon.co.uk/dp/B00MINIMA1"
    );
    const result = scrapeAmazonPage(document, location);
    const p = result.products[0];

    assert.ok(p.productTitle.length > 0);
    assert.equal(p.asin, "B00MINIMA1");
    assert.equal(p.scrape_status, "partial");
    assert.ok(p.warnings.some((w) => /描述点/.test(w)));
    assert.ok(p.notes.length >= 1);
  });
});

describe("notes-only missing price still success", () => {
  it("keeps success when bullets and title exist but price empty", () => {
    const html = `
<!DOCTYPE html><html lang="en"><body>
  <input id="ASIN" value="B0NOTEONLY1" />
  <span id="productTitle">Notes Only Product With Enough Title Text</span>
  <div id="feature-bullets"><ul>
    <li><span class="a-list-item">Bullet one with enough characters here</span></li>
    <li><span class="a-list-item">Bullet two with enough characters here</span></li>
    <li><span class="a-list-item">Bullet three with enough characters here</span></li>
    <li><span class="a-list-item">Bullet four with enough characters here</span></li>
    <li><span class="a-list-item">Bullet five with enough characters here</span></li>
  </ul></div>
</body></html>`;
    const dom = new JSDOM(html, { url: "https://www.amazon.com/dp/B0NOTEONLY1" });
    const result = scrapeAmazonPage(dom.window.document, dom.window.location);
    const p = result.products[0];
    assert.equal(p.scrape_status, "success");
    assert.equal(p.warnings.length, 0);
    assert.ok(p.notes.some((n) => /价格/.test(n)));
  });
});

describe("no-title.html", () => {
  it("fails hard without product title", () => {
    const { document, location } = loadFixture(
      "no-title.html",
      "https://www.amazon.com/dp/B00NOTITL01"
    );
    const result = scrapeAmazonPage(document, location);
    const p = result.products[0];

    assert.equal(p.scrape_status, "failed");
    assert.ok(p.errors.length >= 1);
    assert.equal(p.coverage.has_title, false);
  });
});

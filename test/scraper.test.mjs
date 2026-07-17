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
const {
  scrapeAmazonPage,
  SCHEMA_VERSION,
  REVIEWS_SCOPE,
} = require(path.join(root, "scraper", "core.js"));

function loadFixture(name, url) {
  const html = fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
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
  it("parses full listing as success with reviews and field depth", () => {
    const { document, location } = loadFixture(
      "us-full.html",
      "https://www.amazon.com/dp/B08N5WRWNW"
    );
    const result = scrapeAmazonPage(document, location);
    const p = result.products[0];

    assert.equal(result.metadata.schema_version, "1.3.0");
    assert.equal(result.metadata.marketplace, "US");
    assert.equal(result.metadata.language, "English");
    assert.equal(result.metadata.reviews_scope, "visible_dom_only");
    assert.equal(p.asin, "B08N5WRWNW");
    assert.ok(p.productTitle.length > 5);
    assert.ok(p.price.includes("19.99") || p.price.includes("$"));
    assert.equal(p.brand, "Acme");
    assert.ok(p.main_image.startsWith("https://"));
    assert.ok(p.feature_bullets.length >= 5);
    assert.equal(p.customer_reviews.length, 2);
    assert.equal(p.customer_reviews[0].star_rating, 4);
    assert.equal(p.customer_reviews[0].origin_country, "the United States");
    assert.equal(p.scrape_status, "success");
    assert.equal(p.warnings.length, 0);
    assert.equal(p.errors.length, 0);
    assert.equal(p.notes.length, 0);
    assert.ok(p.coverage.has_title);
    assert.ok(p.coverage.has_price);
    assert.ok(p.coverage.has_brand);
    assert.ok(p.coverage.has_main_image);
    assert.equal(p.coverage.review_count, 2);
    assert.ok(p._debug);
  });
});

describe("de-success-no-reviews.html", () => {
  it("is success with notes when only reviews missing", () => {
    const { document, location } = loadFixture(
      "de-success-no-reviews.html",
      "https://www.amazon.de/dp/B07XYZABC1"
    );
    const result = scrapeAmazonPage(document, location);
    const p = result.products[0];

    assert.equal(result.metadata.marketplace, "DE");
    assert.equal(result.metadata.language, "German");
    assert.equal(p.asin, "B07XYZABC1");
    assert.ok(p.productTitle.length > 0);
    assert.ok(p.feature_bullets.length >= 5);
    assert.equal(p.customer_reviews.length, 0);
    assert.equal(p.scrape_status, "success", "no reviews should be notes-only");
    assert.equal(p.warnings.length, 0);
    assert.ok(p.notes.some((n) => n.includes("\u8bc4\u8bba")));
    if (p.price) {
      assert.ok(/€|EUR|,\d{2}/i.test(p.price) || p.price.length > 0);
    }
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

    assert.equal(result.metadata.marketplace, "UK");
    assert.ok(p.productTitle.length > 0);
    assert.equal(p.asin, "B00MINIMA1");
    assert.equal(p.scrape_status, "partial");
    assert.ok(p.warnings.some((w) => w.includes("\u63cf\u8ff0\u70b9")));
    assert.ok(p.notes.length >= 1);
  });
});

describe("notes-only missing price still success", () => {
  it("keeps success when bullets and title exist but price empty", () => {
    const html = `
<!DOCTYPE html><html lang="en"><body>
  <input id="ASIN" value="B0NOTEONL1" />
  <span id="productTitle">Notes Only Product With Enough Title Text</span>
  <div id="feature-bullets"><ul>
    <li><span class="a-list-item">Bullet one with enough characters here</span></li>
    <li><span class="a-list-item">Bullet two with enough characters here</span></li>
    <li><span class="a-list-item">Bullet three with enough characters here</span></li>
    <li><span class="a-list-item">Bullet four with enough characters here</span></li>
    <li><span class="a-list-item">Bullet five with enough characters here</span></li>
  </ul></div>
</body></html>`;
    const dom = new JSDOM(html, {
      url: "https://www.amazon.com/dp/B0NOTEONL1",
    });
    const result = scrapeAmazonPage(dom.window.document, dom.window.location);
    const p = result.products[0];
    assert.equal(p.scrape_status, "success");
    assert.equal(p.warnings.length, 0);
    assert.ok(p.notes.some((n) => n.includes("\u4ef7\u683c")));
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

describe("few-bullets.html", () => {
  it("is partial when only 1-2 bullets", () => {
    const { document, location } = loadFixture(
      "few-bullets.html",
      "https://www.amazon.com/dp/B0FEWBULL1"
    );
    const result = scrapeAmazonPage(document, location);
    const p = result.products[0];
    assert.equal(p.scrape_status, "partial");
    assert.ok(p.warnings.some((w) => w.includes("\u63cf\u8ff0\u70b9")));
    assert.equal(p.feature_bullets.length, 2);
  });
});

describe("no-asin.html", () => {
  it("warns UNKNOWN ASIN when form and URL lack valid ASIN", () => {
    const { document, location } = loadFixture(
      "no-asin.html",
      "https://www.amazon.com/some/path/without-asin"
    );
    const result = scrapeAmazonPage(document, location);
    const p = result.products[0];
    assert.equal(p.asin, "UNKNOWN");
    assert.equal(p.scrape_status, "partial");
    assert.ok(p.warnings.some((w) => /ASIN/.test(w)));
  });
});

describe("invalid-asin-input.html", () => {
  it("falls back to URL ASIN when #ASIN is invalid length", () => {
    const { document, location } = loadFixture(
      "invalid-asin-input.html",
      "https://www.amazon.com/dp/B08VALID01"
    );
    const result = scrapeAmazonPage(document, location);
    const p = result.products[0];
    assert.equal(p.asin, "B08VALID01");
    assert.notEqual(p.asin, "B00NOTITLE1");
  });
});

describe("empty-review-shell.html", () => {
  it("drops short review bodies and keeps real reviews", () => {
    const { document, location } = loadFixture(
      "empty-review-shell.html",
      "https://www.amazon.com/dp/B0EMPTYRE1"
    );
    const result = scrapeAmazonPage(document, location);
    const p = result.products[0];
    assert.equal(p.customer_reviews.length, 1);
    assert.ok(p.customer_reviews[0].body.length > 5);
    assert.ok(!JSON.stringify(p.customer_reviews).includes("No Content"));
    assert.equal(p.scrape_status, "success");
  });
});

describe("product-facts-bullets.html", () => {
  it("extracts bullets from productFactsDesktop without feature-bullets", () => {
    const { document, location } = loadFixture(
      "product-facts-bullets.html",
      "https://www.amazon.com/dp/B0PRODFA01"
    );
    const result = scrapeAmazonPage(document, location);
    const p = result.products[0];
    assert.ok(p.feature_bullets.length >= 5);
    assert.equal(p.scrape_status, "success");
  });
});

describe("mobile URL ASIN", () => {
  it("extracts ASIN from /gp/aw/d/ paths", () => {
    const html = `
<!DOCTYPE html><html lang="en"><body>
  <span id="productTitle">Mobile Path Product Title With Enough Length</span>
  <div id="feature-bullets"><ul>
    <li><span class="a-list-item">Bullet one with enough characters here</span></li>
    <li><span class="a-list-item">Bullet two with enough characters here</span></li>
    <li><span class="a-list-item">Bullet three with enough characters here</span></li>
  </ul></div>
</body></html>`;
    const dom = new JSDOM(html, {
      url: "https://www.amazon.com/gp/aw/d/B0MOBILE01",
    });
    const result = scrapeAmazonPage(dom.window.document, dom.window.location);
    assert.equal(result.products[0].asin, "B0MOBILE01");
  });
});

describe("buildFailedPayload via throw", () => {
  it("returns failed ERROR marketplace when document methods throw", () => {
    const evil = {
      documentElement: { getAttribute: () => "en", lang: "en" },
      querySelector: () => {
        throw new Error("simulated DOM failure");
      },
      querySelectorAll: () => {
        throw new Error("simulated DOM failure");
      },
    };
    const result = scrapeAmazonPage(evil, {
      href: "https://www.amazon.com/dp/B00FAIL0001",
      hostname: "www.amazon.com",
    });
    assert.equal(result.metadata.marketplace, "ERROR");
    assert.equal(result.products[0].scrape_status, "failed");
    assert.ok(result.products[0].errors.length >= 1);
    assert.equal(result.metadata.total_asins, 0);
  });
});

describe("main image dynamic-image largest", () => {
  it("picks largest https URL from data-a-dynamic-image", () => {
    const html = `
<!DOCTYPE html><html lang="en"><body>
  <input id="ASIN" value="B0DYNIMAG1" />
  <span id="productTitle">Dynamic Image Product Title With Enough Length XX</span>
  <img id="landingImage"
    data-a-dynamic-image='{"https://m.media-amazon.com/images/I/small.jpg":[100,100],"https://m.media-amazon.com/images/I/large.jpg":[800,800]}'
    src="https://m.media-amazon.com/images/I/small.jpg" />
  <div id="feature-bullets"><ul>
    <li><span class="a-list-item">Bullet one with enough characters here</span></li>
    <li><span class="a-list-item">Bullet two with enough characters here</span></li>
    <li><span class="a-list-item">Bullet three with enough characters here</span></li>
  </ul></div>
</body></html>`;
    const dom = new JSDOM(html, {
      url: "https://www.amazon.com/dp/B0DYNIMAG1",
    });
    const p = scrapeAmazonPage(dom.window.document, dom.window.location)
      .products[0];
    assert.ok(p.main_image.includes("large.jpg"));
  });
});

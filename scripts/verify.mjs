/**
 * Packaging + consistency verification for Amazon Product Insight.
 * Run: node scripts/verify.mjs
 *
 * Version source of truth: manifest.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import vm from "vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
  } else {
    console.log("OK  :", msg);
  }
}

const requiredFiles = [
  "manifest.json",
  "popup.html",
  "popup.js",
  "scraper/core.js",
  "scraper/marketplaces.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "README.md",
  "PRIVACY.md",
  "LICENSE",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "docs/SCHEMA.md",
  "docs/QA-CHECKLIST.md",
  "package.json",
  "test/scraper.test.mjs",
  "test/marketplaces.test.mjs",
  "test/fixtures/us-full.html",
  "test/fixtures/de-success-no-reviews.html",
  "test/fixtures/minimal-title-only.html",
  "test/fixtures/no-title.html",
  "test/fixtures/few-bullets.html",
  "test/fixtures/no-asin.html",
  "test/fixtures/empty-review-shell.html",
  "test/fixtures/invalid-asin-input.html",
  "test/fixtures/product-facts-bullets.html",
  "scripts/pack-extension.mjs",
  ".gitignore",
  "docs/ci/github-actions-check.yml",
];

for (const f of requiredFiles) {
  assert(fs.existsSync(path.join(root, f)), `exists ${f}`);
}

assert(!fs.existsSync(path.join(root, "content.js")), "content.js removed");
assert(
  !fs.existsSync(path.join(root, "test/fixtures/de-partial-no-reviews.html")),
  "old DE fixture renamed"
);

// web/ must not be part of runtime product (empty scaffold is OK if untracked)
const webPkg = path.join(root, "web", "package.json");
assert(!fs.existsSync(webPkg), "web/package.json absent (no orphan web app)");

const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8")
);
const version = manifest.version;
assert(manifest.name === "Amazon Product Insight", "manifest name");
assert(typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version), "semver");
assert(!/scraper/i.test(manifest.name), "name avoids Scraper");
assert(manifest.action?.default_title === "分析此商品", "toolbar title zh");
assert(
  manifest.minimum_chrome_version,
  "minimum_chrome_version set"
);

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert(pkg.version === version, `package.json version === ${version}`);

const mp = require(path.join(root, "scraper", "marketplaces.js"));
const core = require(path.join(root, "scraper", "core.js"));
assert(core.SCHEMA_VERSION === "1.3.0", "core SCHEMA_VERSION 1.3.0");
assert(core.REVIEWS_SCOPE === "visible_dom_only", "core reviews scope");
assert(typeof core.scrapeAmazonPage === "function", "scrapeAmazonPage export");
assert(typeof mp.isAmazonHost === "function", "marketplaces export");

// host_permissions must match marketplaces single source
const expectedHosts = new Set(mp.hostPermissionPatterns());
const actualHosts = new Set(manifest.host_permissions || []);
for (const h of expectedHosts) {
  assert(actualHosts.has(h), `host_permissions includes ${h}`);
}
for (const h of actualHosts) {
  assert(expectedHosts.has(h), `host_permissions unexpected ${h}`);
}

const popupJs = fs.readFileSync(path.join(root, "popup.js"), "utf8");
const popupHtml = fs.readFileSync(path.join(root, "popup.html"), "utf8");
const coreJs = fs.readFileSync(path.join(root, "scraper", "core.js"), "utf8");
const mpJs = fs.readFileSync(
  path.join(root, "scraper", "marketplaces.js"),
  "utf8"
);

assert(popupHtml.includes("Amazon Product Insight"), "popup branding");
assert(popupHtml.includes(`v${version}`), `popup shows v${version}`);
assert(popupHtml.includes('id="pageHint"'), "page hint");
assert(popupHtml.includes('id="resultPreview"'), "resultPreview id");
assert(!popupHtml.includes('id="mdPreview"'), "mdPreview renamed");
assert(!popupHtml.includes("Amazon Ember"), "no Amazon Ember font name");
assert(!popupHtml.includes("copyJsonBtn"), "no copy JSON button");
assert(popupHtml.includes('id="clearCacheBtn"'), "clear cache");
assert(!popupHtml.includes("downloadMdBtn"), "no MD export");
assert(
  popupHtml.includes('src="scraper/marketplaces.js"'),
  "popup loads marketplaces"
);
assert(popupHtml.includes("aria-live"), "aria-live on status regions");
assert(!popupJs.includes("toMarkdown"), "no toMarkdown");
assert(!popupJs.includes("clipboard"), "no clipboard copy path");
assert(!popupJs.includes("function scrapeAmazonLogic"), "scrape extracted from popup");
assert(
  popupJs.includes('files: ["scraper/marketplaces.js", "scraper/core.js"]') ||
    popupJs.includes("scraper/marketplaces.js"),
  "injects marketplaces + core"
);
assert(popupJs.includes("scrapeAmazonPage"), "calls scrapeAmazonPage");
assert(popupJs.includes("isExportableResult"), "export gate helper used");
assert(popupJs.includes("scrapeInFlight"), "scrape re-entry guard");
assert(coreJs.includes("notes"), "core has notes");
assert(coreJs.includes("warnings"), "core has warnings");
assert(coreJs.includes("errors"), "core has errors");
assert(coreJs.includes("resolveAsin"), "core uses resolveAsin");
assert(mpJs.includes("MARKETPLACES"), "marketplaces list present");

try {
  new vm.Script(mpJs, { filename: "scraper/marketplaces.js" });
  assert(true, "marketplaces.js parses");
} catch (e) {
  assert(false, `marketplaces.js parse: ${e.message}`);
}
try {
  new vm.Script(popupJs, { filename: "popup.js" });
  assert(true, "popup.js parses");
} catch (e) {
  assert(false, `popup.js parse: ${e.message}`);
}
try {
  new vm.Script(coreJs, { filename: "scraper/core.js" });
  assert(true, "scraper/core.js parses");
} catch (e) {
  assert(false, `core.js parse: ${e.message}`);
}

const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const schema = fs.readFileSync(path.join(root, "docs/SCHEMA.md"), "utf8");
const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const qa = fs.readFileSync(path.join(root, "docs/QA-CHECKLIST.md"), "utf8");
const privacy = fs.readFileSync(path.join(root, "PRIVACY.md"), "utf8");

const verEsc = version.replace(/\./g, "\\.");
assert(new RegExp(verEsc).test(readme), `README ${version}`);
assert(/1\.3\.0/.test(readme), "README schema 1.3.0");
assert(
  /scraper\/core\.js|scraper\\core\.js|scraper\//.test(readme),
  "README architecture"
);
assert(/marketplaces\.js/.test(readme), "README mentions marketplaces");
assert(!/复制 JSON/.test(readme), "README no copy JSON");
assert(/web\//.test(readme) && /非扩展|不包含|排除|deprecated|废弃/i.test(readme),
  "README documents web/ exclusion or deprecation");
assert(/1\.3\.0/.test(schema), "SCHEMA 1.3.0");
assert(
  /notes/.test(schema) && /warnings/.test(schema) && /errors/.test(schema),
  "SCHEMA status fields"
);
assert(
  !/占位可能为\s*"No Content"/.test(schema),
  "SCHEMA drops obsolete No Content placeholder claim"
);
assert(/过短|丢弃|过滤/.test(schema), "SCHEMA documents short-body drop");
assert(new RegExp(verEsc).test(changelog), `CHANGELOG ${version}`);
assert(new RegExp(verEsc).test(qa), `QA checklist ${version}`);
assert(/清除本地缓存|clearCache|lastScrapedData/.test(privacy), "PRIVACY mentions cache clear");
assert(/预览|CDN|media-amazon|thumbnail|主图/i.test(privacy), "PRIVACY mentions preview image network");
assert(/不.*分析|analytics|remote code|远程代码|无分析/i.test(privacy), "PRIVACY no analytics/remote code");

// Runtime whitelist for pack script
const packSrc = fs.readFileSync(
  path.join(root, "scripts/pack-extension.mjs"),
  "utf8"
);
assert(/scraper\/marketplaces\.js/.test(packSrc), "pack includes marketplaces");
assert(/RUNTIME_FILES|runtimeFiles|files\s*=/.test(packSrc), "pack has file list");

console.log("\n---");
if (failed) {
  console.error(`Verification failed: ${failed} check(s)`);
  process.exit(1);
}
console.log(`All verification checks passed (version ${version}).`);
process.exit(0);

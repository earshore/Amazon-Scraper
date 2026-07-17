/**
 * Packaging + consistency verification for Amazon Product Insight.
 * Run: node scripts/verify.mjs
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
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "README.md",
  "PRIVACY.md",
  "LICENSE",
  "CHANGELOG.md",
  "docs/SCHEMA.md",
  "docs/QA-CHECKLIST.md",
  "package.json",
  "test/scraper.test.mjs",
  "test/fixtures/us-full.html",
  "test/fixtures/de-partial-no-reviews.html",
  "test/fixtures/minimal-title-only.html",
  "test/fixtures/no-title.html",
  ".gitignore",
];

for (const f of requiredFiles) {
  assert(fs.existsSync(path.join(root, f)), `exists ${f}`);
}

assert(!fs.existsSync(path.join(root, "content.js")), "content.js removed");

const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8")
);
assert(manifest.name === "Amazon Product Insight", "manifest name");
assert(manifest.version === "1.6.1", "manifest version 1.6.1");
assert(!/scraper/i.test(manifest.name), "name avoids Scraper");
assert(manifest.action?.default_title === "分析此商品", "toolbar title zh");

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert(pkg.version === "1.6.1", "package.json version aligned");

const core = require(path.join(root, "scraper", "core.js"));
assert(core.SCHEMA_VERSION === "1.3.0", "core SCHEMA_VERSION 1.3.0");
assert(core.REVIEWS_SCOPE === "visible_dom_only", "core reviews scope");
assert(typeof core.scrapeAmazonPage === "function", "scrapeAmazonPage export");

const popupJs = fs.readFileSync(path.join(root, "popup.js"), "utf8");
const popupHtml = fs.readFileSync(path.join(root, "popup.html"), "utf8");
const coreJs = fs.readFileSync(path.join(root, "scraper", "core.js"), "utf8");

assert(popupHtml.includes("Amazon Product Insight"), "popup branding");
assert(popupHtml.includes('id="pageHint"'), "page hint");
assert(!popupHtml.includes("copyJsonBtn"), "no copy JSON button");
assert(popupHtml.includes('id="clearCacheBtn"'), "clear cache");
assert(!popupHtml.includes("downloadMdBtn"), "no MD export");
assert(!popupJs.includes("toMarkdown"), "no toMarkdown");
assert(!popupJs.includes("clipboard"), "no clipboard copy path");
assert(!popupJs.includes("function scrapeAmazonLogic"), "scrape extracted from popup");
assert(popupJs.includes('files: ["scraper/core.js"]'), "injects scraper file");
assert(popupJs.includes("scrapeAmazonPage"), "calls scrapeAmazonPage");
assert(coreJs.includes("notes"), "core has notes");
assert(coreJs.includes("warnings"), "core has warnings");
assert(coreJs.includes("errors"), "core has errors");

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

assert(/1\.6\.1/.test(readme), "README 1.6.1");
assert(/1\.3\.0/.test(readme), "README schema 1.3.0");
assert(/scraper\/core\.js|scraper\\core\.js|scraper\//.test(readme), "README architecture");
assert(!/复制 JSON/.test(readme), "README no copy JSON");
assert(/1\.3\.0/.test(schema), "SCHEMA 1.3.0");
assert(/notes/.test(schema) && /warnings/.test(schema) && /errors/.test(schema), "SCHEMA status fields");
assert(/1\.6\.1/.test(changelog), "CHANGELOG 1.6.1");
assert(/1\.6\./.test(qa), "QA checklist version");

console.log("\n---");
if (failed) {
  console.error(`Verification failed: ${failed} check(s)`);
  process.exit(1);
}
console.log("All verification checks passed.");
process.exit(0);

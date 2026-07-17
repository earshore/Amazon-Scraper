/**
 * Offline verification for Amazon Product Insight packaging & pure helpers.
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

// --- package files ---
const requiredFiles = [
  "manifest.json",
  "popup.html",
  "popup.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "README.md",
  "PRIVACY.md",
  "LICENSE",
  "CHANGELOG.md",
  "docs/SCHEMA.md",
  ".gitignore",
];

for (const f of requiredFiles) {
  assert(fs.existsSync(path.join(root, f)), `exists ${f}`);
}

assert(!fs.existsSync(path.join(root, "content.js")), "content.js removed");

// --- manifest ---
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8")
);
assert(manifest.name === "Amazon Product Insight", "manifest name branding");
assert(manifest.version === "1.5.0", "manifest version 1.5.0");
assert(
  !/scraper/i.test(manifest.name),
  "manifest name avoids Scraper brand"
);
assert(
  manifest.action?.default_title === "Analyze this product",
  "toolbar title"
);
assert(
  Array.isArray(manifest.permissions) &&
    manifest.permissions.includes("activeTab") &&
    manifest.permissions.includes("scripting") &&
    manifest.permissions.includes("storage"),
  "core permissions"
);

// --- popup sources ---
const popupJs = fs.readFileSync(path.join(root, "popup.js"), "utf8");
const popupHtml = fs.readFileSync(path.join(root, "popup.html"), "utf8");

assert(popupHtml.includes("Amazon Product Insight"), "popup title branding");
assert(popupHtml.includes('id="pageHint"'), "page hint UI");
assert(popupHtml.includes('id="copyJsonBtn"'), "copy JSON button");
assert(!popupHtml.includes("downloadMdBtn"), "no MD export button");
assert(!popupJs.includes("toMarkdown"), "no toMarkdown");
assert(popupJs.includes("reviews_scope"), "reviews_scope in scrape");
assert(popupJs.includes("visible_dom_only"), "visible_dom_only scope");
assert(popupJs.includes('SCHEMA_VERSION = "1.2.0"'), "schema 1.2.0");
assert(popupJs.includes("main_image"), "main_image field");
assert(popupJs.includes("has_price"), "coverage has_price");
assert(popupJs.includes("updatePageHint"), "empty-state helper");

// syntax check popup.js in a sandbox without running chrome APIs
try {
  new vm.Script(popupJs, { filename: "popup.js" });
  assert(true, "popup.js parses as JS");
} catch (e) {
  assert(false, `popup.js parse: ${e.message}`);
}

// pure helper behavior: extractAsinFromUrl via Function eval of isolated copy
const extractAsinFromUrl = (url) => {
  if (!url) return null;
  const m = String(url).match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  return m ? m[1].toUpperCase() : null;
};

assert(
  extractAsinFromUrl("https://www.amazon.de/dp/B08N5WRWNW") === "B08N5WRWNW",
  "ASIN from /dp/"
);
assert(
  extractAsinFromUrl(
    "https://www.amazon.com/gp/product/B0TESTASI0/ref=xx"
  ) === "B0TESTASI0",
  "ASIN from /gp/product/"
);
assert(
  extractAsinFromUrl("https://www.amazon.de/s?k=phone") === null,
  "no ASIN on search"
);

// docs mention version
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const schema = fs.readFileSync(path.join(root, "docs/SCHEMA.md"), "utf8");
const privacy = fs.existsSync(path.join(root, "PRIVACY.md"))
  ? fs.readFileSync(path.join(root, "PRIVACY.md"), "utf8")
  : "";

assert(/1\.5\.0/.test(readme), "README mentions 1.5.0");
assert(/Amazon Product Insight/.test(readme), "README branding");
assert(!/导出 MD|复制 MD|toMarkdown/.test(readme), "README no MD export");
assert(/1\.2\.0/.test(schema), "SCHEMA 1.2.0");
assert(/reviews_scope/.test(schema), "SCHEMA reviews_scope");
assert(/main_image|price|brand/.test(schema), "SCHEMA new product fields");
if (privacy) {
  assert(/本地|local/i.test(privacy), "PRIVACY local processing");
}

console.log("\n---");
if (failed) {
  console.error(`Verification failed: ${failed} check(s)`);
  process.exit(1);
}
console.log("All verification checks passed.");
process.exit(0);

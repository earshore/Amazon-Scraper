/**
 * Build a runtime-only zip for Chrome "Load unpacked" / private delivery.
 * Whitelist only — never includes web/, test/, node_modules/, etc.
 *
 * Run: node scripts/pack-extension.mjs
 * Output: dist/amazon-product-insight-{version}.zip
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8")
);
const version = manifest.version;

/** Runtime + recommended docs (no tests, no web/, no node_modules). */
const RUNTIME_FILES = [
  "manifest.json",
  "popup.html",
  "popup.js",
  "background.js",
  "scraper/marketplaces.js",
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
];

const stage = path.join(root, ".pack-stage");
const outDir = path.join(root, "dist");
const zipName = `amazon-product-insight-${version}.zip`;
const zipPath = path.join(outDir, zipName);

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

rmrf(stage);
fs.mkdirSync(stage, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

for (const rel of RUNTIME_FILES) {
  const src = path.join(root, rel);
  if (!fs.existsSync(src)) {
    console.error("Missing required file:", rel);
    process.exit(1);
  }
  const dest = path.join(stage, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// Refuse packing if stage accidentally contains web or node_modules
const banned = ["web", "node_modules", "test", ".git"];
for (const b of banned) {
  if (fs.existsSync(path.join(stage, b))) {
    console.error("Refusing to pack: banned path present in stage:", b);
    process.exit(1);
  }
}

if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

// Portable zip via tar (Windows 10+ and Linux/macOS)
try {
  execFileSync(
    "tar",
    ["-a", "-cf", zipPath, "-C", stage, "."],
    { stdio: "inherit" }
  );
} catch (e) {
  console.error("tar zip failed:", e.message);
  process.exit(1);
}

rmrf(stage);

const size = fs.statSync(zipPath).size;
console.log(`Packed ${zipName} (${size} bytes)`);
console.log(`Path: ${zipPath}`);
console.log("Contents (whitelist only):");
for (const f of RUNTIME_FILES) console.log(" -", f);

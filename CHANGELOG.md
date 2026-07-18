# Changelog

All notable changes to **Amazon Product Insight** (local Chrome MV3 extension) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.4] - 2026-07-18

Popup open UX productization: static first paint, honest page-hint state machine (no false「就绪」), parallel open probes.

### Fixed

- **No false ready:** product URLs stay on「检测中…」(host/ASIN chips allowed) with **分析** disabled until the locale hard-gate passes; only then show「就绪」and enable.
- Language probe failure is **fail-closed** on open and on click (`无法校验语言`), aligned with scrape-time checks.
- Open path no longer defers `tabs.query` behind `requestAnimationFrame`; only heavy cache preview / remote thumbnail wait for after-first-paint.
- Language probe and `storage.local` cache read run in **parallel** after the URL gate.

### Added

- Static popup shell in `popup.html`: detecting strip + disabled primary button before any JS runs.
- `verify.mjs` guards for static shell, parallel open I/O, `deferReady` / `await_language`, and fail-closed language probe UI.

### Changed

- `background.js`: document that the service worker is registration-only (no keep-alive loop); add empty `onStartup` listener.
- Docs: README page-hint state machine, QA open-path cases, schema/extension version pointers.

### Packaging

- Runtime zip via `npm run pack` → `dist/amazon-product-insight-1.6.4.zip`.
- Export **schema 1.3.0** unchanged.

## [1.6.3] - 2026-07-18

Ship-quality UI polish, locale hard-gate, and packaging/docs alignment on top of the 1.6.2 architecture.

### Added

- Lightweight `background.js` service worker (warms extension process for faster popup open).
- Unified design tokens in `popup.html` (`--ok` / `--warn` / `--danger` / type scale) for a single visual language.
- Compact page-hint strip (ready / warn / detecting share one layout).
- Single primary CTA toolbar: **分析** / **重新分析** + **导出** (side-by-side).
- Locale helpers: `isLangAllowed`, `isHostLangAllowed`, `formatLangList` in `scraper/marketplaces.js`.

### Changed

- **Language hard gate:** each marketplace allows only its local language(s) (e.g. `amazon.de` → `de` only). Wrong `html[lang]` blocks scrape on open and on click; **no**「仍要分析」bypass.
- Belgium (`amazon.com.be`) allows `fr` / `nl` only (no English).
- Removed separate「清除本地缓存」control; re-analyze overwrites `lastScrapedData`.
- Popup chrome densified: less helper copy, larger result preview, status toasts instead of button-like banners.
- Status / chips / banners all use the same semantic colors (not ad-hoc hex per component).
- Docs: README language table, QA §5 hard-gate steps, PRIVACY re-analyze wording, pack list includes `background.js`.

### Fixed

- Popup open latency: defer page probe / cache preview / remote thumbnail until after first paint.
- Language-mismatch UX aligned with ready strip (no yellow “card” vs green strip mismatch).
- `showError` uses design-system danger banner (no inline red button look).

### Packaging

- Runtime zip via `npm run pack` (whitelist; includes `background.js`).
- `npm run check` remains the release gate (syntax + tests + verify).

## [1.6.2] - 2026-07-17

### Added

- Shared `scraper/marketplaces.js` (domains, language prefixes, ASIN helpers) as single source of truth.
- Runtime pack script `npm run pack` (whitelist zip, excludes `web/` / tests / node_modules).
- CI workflow template `docs/ci/github-actions-check.yml` (copy to `.github/workflows/check.yml` to enable Actions).
- Unit tests for marketplaces + expanded scraper fixtures (few bullets, invalid ASIN, empty reviews, productFacts, failed payload).
- `CONTRIBUTING.md` for contributor / release workflow.
- Apex host permissions (`https://amazon.TLD/*` in addition to `*.amazon.TLD`).

### Changed

- ASIN: validate 10-char pattern; invalid `#ASIN` no longer overrides URL ASIN; support `/gp/aw/d/`.
- Feature bullets: trusted ID selectors (feature-bullets / productFacts / aboutThisItem) with relaxed area filter.
- Price selectors prefer non-strikethrough buybox / apex prices.
- Reviews: prefer review-list containers; cap at 20; drop bare global `.review` sweep.
- Main image: pick largest from `data-a-dynamic-image` / `srcset`; HTTPS only.
- Cache only `success` / `partial`; never restore or export `failed`.
- Scrape button locked while in-flight (no concurrent inject races).
- `verify.mjs` reads version from manifest; asserts host_permissions ≡ marketplaces.

### Removed

- Deprecated `mdPreview` id (renamed `resultPreview`).
- Amazon Ember font-family name from popup CSS.

## [1.6.1] - 2026-07-17

### Removed

- **复制 JSON** button and clipboard copy path (export via **导出 JSON** only).

### Fixed

- Drop empty review shells before placeholders (no ghost `"No Content"` reviews).
- Stricter Amazon host allowlist in popup (no broad `includes("amazon")`).
- Bullet-area customer-review filter selector (`.a-col-left`).
- Preview main image: only `https://` URLs.
- Explicit `world: "ISOLATED"` on script injection.
- Docs / QA checklist aligned with notes vs warnings semantics; private packaging notes in README.

## [1.6.0] - 2026-07-17

### Added

- Extracted injectable scrape engine `scraper/core.js` (`scrapeAmazonPage`, shared by extension inject and Node tests).
- Schema **1.3.0** three-layer diagnostics: `errors[]`, `warnings[]`, `notes[]`.
- Optional product `_debug` (`bullets_selector`, `reviews_selector`).
- Clear local cache control in popup (`清除本地缓存`).
- Cache / scrape timestamp display in result UI.
- Notes vs warnings presentation in popup（「说明」vs「需要关注」）.
- Page coverage chips aligned with status model.
- Node test suite: `test/fixtures/*` + `npm test` (jsdom / `node:test`).
- Packaging consistency script `scripts/verify.mjs` (`npm run verify`).
- Combined gate `npm run check` (syntax + test + verify).
- Manual release QA checklist `docs/QA-CHECKLIST.md`.
- Chinese toolbar title：`分析此商品`.

### Changed

- Extension version **1.6.0**; export schema **1.3.0**.
- Popup is UI-only: injects `scraper/core.js` via `files` (no inline scrape logic in `popup.js`).
- Status semantics:
  - `errors[]` / missing title → `failed`
  - `warnings[]` quality issues (missing/few bullets, unknown ASIN) → `partial`
  - `notes[]` informational (no price / brand / image / visible reviews) → do **not** force `partial`
  - `success` = title present and `warnings` empty (`notes` allowed)
- Missing price, brand, main image, or visible reviews moved from warnings to **notes**.
- Documentation rewritten for architecture, status model, schema 1.3.0, tests, and QA checklist.

### Notes

- Still local-only: parses the open Amazon product detail page; does not upload page content to a server.
- Cache remains `chrome.storage.local` key `lastScrapedData`.
- Export remains **JSON download only** (no copy-to-clipboard button).
- `metadata.reviews_scope` remains `"visible_dom_only"`.

## [1.5.0] - 2026-07-17

### Added

- Non-product page empty state when the current tab is not an Amazon product detail page.
- `reviews_scope` field for clearer review-related scrape context.
- Price, brand, and main image fields in scrape output / preview.
- `PRIVACY.md` privacy policy (local-only processing; contact via GitHub Issues).
- `LICENSE` (MIT, Copyright (c) 2026 Aihang).

### Changed

- Branding rename to **Amazon Product Insight**.
- Export schema version **1.2.0**.
- Product polish pass for UI/copy consistency with the new branding.

### Notes

- Still local-only: parses the open Amazon product detail page; does not upload page content to a server.
- Cache remains `chrome.storage.local` key `lastScrapedData`.
- Export remains **JSON download only**.

## [1.4.1] - 2026-07-17

### Changed

- Version bump for packaging/release.

### Removed

- Markdown (MD) export; JSON download is the only export format.

## [1.4.0] - 2026-07-17

### Added

- Coverage / partial scrape reporting and warnings on results.
- Documentation updates aligned with scrape status and coverage behavior.

### Changed

- Export schema version **1.1.0**.

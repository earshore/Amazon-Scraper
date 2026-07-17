# Changelog

All notable changes to **Amazon Product Insight** (local Chrome MV3 extension) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.2] - 2026-07-17

### Fixed

- Popup open latency: lightweight `background.js` service worker keeps extension warm; defer page detection / cache preview / remote thumbnail until after first paint so the toolbar popup feels instant.

### Added

- Shared `scraper/marketplaces.js` (domains, language prefixes, ASIN helpers) as single source of truth.
- Runtime pack script `npm run pack` (whitelist zip, excludes `web/` / tests / node_modules).
- CI workflow template `docs/ci/github-actions-check.yml` (copy to `.github/workflows/check.yml` to enable Actions).
- Unit tests for marketplaces + expanded scraper fixtures (few bullets, invalid ASIN, empty reviews, productFacts, failed payload).
- `CONTRIBUTING.md` for contributor / release workflow.
- Popup version label, privacy footer link, `aria-live` status regions.
- Apex host permissions (`https://amazon.TLD/*` in addition to `*.amazon.TLD`).

### Changed

- ASIN: validate 10-char pattern; invalid `#ASIN` no longer overrides URL ASIN; support `/gp/aw/d/`.
- Feature bullets: trusted ID selectors (feature-bullets / productFacts / aboutThisItem) with relaxed area filter.
- Price selectors prefer non-strikethrough buybox / apex prices.
- Reviews: prefer review-list containers; cap at 20; drop bare global `.review` sweep.
- Main image: pick largest from `data-a-dynamic-image` / `srcset`; HTTPS only.
- Cache only `success` / `partial`; never restore or export `failed`.
- Scrape button locked while in-flight (no concurrent inject races).
- Clear cache requires confirmation.
- `verify.mjs` reads version from manifest; asserts host_permissions ≡ marketplaces.
- Docs / QA aligned with DE+en language allowlist and notes vs warnings.

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

# Changelog

All notable changes to **Amazon Product Insight** (local Chrome MV3 extension) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0] - 2026-07-17

### Added

- Non-product page empty state when the current tab is not an Amazon product detail page.
- `reviews_scope` field for clearer review-related scrape context.
- Copy JSON action for the current scrape result.
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

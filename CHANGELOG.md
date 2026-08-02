# Changelog

All notable changes to Unit Converter UI are recorded here.

## [2.0.0] - 2026-08-02

### Added

- Stable `unit_id` and `quantity_id` support throughout the adapter and browser
  UI.
- Backend-driven compatible-unit loading so the To selector only shows units
  that can convert from the selected From unit.
- An `Uncategorized` Units filter for the five backend units without a UI
  mapping.

### Changed

- Upgraded the backend distribution to `nist-unit-converter` 2.0.0 from its
  Git tag while retaining the `unit_converter` Python import.
- Migrated the adapter to catalog schema 3 and the package's public catalog and
  UI taxonomy APIs.
- Updated selectors, API requests, defaults, Favorites, catalog rendering, and
  search to use canonical display names with stable IDs.
- Added the active backend distribution name and version to the health response
  and About page.
- Alphabetized API unit arrays and From/To selectors by canonical display name
  without case or accent distinctions and with punctuation treated as word
  separators.
- Ordered the Units table first by full Category path and then by canonical Unit
  name within each Category.
- Removed the redundant explanatory copy beneath the Units page title and
  shortened the completed conversion label to `result`.

### Maintenance

- Removed three unreachable pre-v2 UI modules, their unused exports, and the
  CSS selectors and design token that only supported those modules.
- Simplified converter state, Favorites rendering callbacks, and backend unit
  indexing without changing the public JSON API contract.
- Aligned local npm commands with the wheel-backed `.venv` workflow.

### Fixed

- Added distinct public errors for unknown units, incompatible units, and other
  conversion failures.
- Serialized Python `Decimal` results explicitly as JSON strings.
- Prevented unmapped units from being inferred into an unrelated UI category.
- Unknown `GET /api/...` paths now return a JSON 404 instead of falling through
  to the browser application's HTML shell.
- The Units table now shows each unit's direct UI classification beside its
  canonical display name instead of exposing a stable ID as the row label.

### Migration

- Favorites now use storage schema 2 with `fromUnitId` and `toUnitId`.
- Existing schema 1 favorites are migrated from historical display names or
  aliases to stable IDs when the catalog provides an unambiguous match.

### Documentation

- Reconciled the README with the actual package installation boundary, runtime
  API, repository contents, and UI/backend version split.
- Documented why the five NIST-categorized units without a direct UI mapping
  remain separate from semantically different converter Measures.
- Added a versioned release note enforced by the version consistency check.

No server-side data migration is required. Browser Favorites migrate from the
v1 schema to stable IDs when the v2 catalog loads.

[Full v2.0.0 release notes](release/v2.0.0.md)

## [1.1.0] - 2026-07-19

### Added

- Browser-local Favorites grouped by Category and Measure, with load, remove,
  empty, error, and cross-tab synchronization states.

### Changed

- Reworked the converter into separate Category and Measure selectors, followed
  by From and To selectors and a dedicated Amount row.
- Refined the responsive design, select controls, Units catalog, loading and
  error presentation, keyboard focus, and accessibility semantics.
- Limited displayed results to 10 fractional digits.

### Fixed

- Prevented stale asynchronous responses from replacing the newest conversion.
- Preserved in-progress converter input and focus when Favorites change in
  another tab.
- Safely recovered from unavailable, malformed, or concurrently changed browser
  storage.
- Restricted static serving to public UI assets and added bounded API input
  validation so repository files and unbounded conversion requests are rejected.
- Removed internal package and conversion exception details from API responses.

[Full v1.1.0 release notes](release/v1.1.0.md)

## [1.0.0] - 2026-06-03

### Added

- Initial build-free Unit Converter browser UI, Python HTTP adapter, supported
  unit catalog, navigation, and backend package integration.

[Full v1.0.0 release notes](release/v1.0.0.md)

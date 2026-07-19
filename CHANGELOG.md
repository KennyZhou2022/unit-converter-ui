# Changelog

All notable user-facing changes to Unit Converter UI are recorded here.

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

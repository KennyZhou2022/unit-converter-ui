# Unit Converter UI

This repository contains the web UI for the `unit-converter` Python package.
The backend package source is
[KennyZhou2022/unit-converter](https://github.com/KennyZhou2022/unit-converter).

Current UI release: `v1.1.0`. The release version is recorded in `VERSION`.
See [CHANGELOG.md](CHANGELOG.md) and the
[v1.1.0 release notes](release/v1.1.0.md) for user-facing changes.

## Product Direction

The UI should be a fast, searchable unit-conversion application backed by the
Python package's standards-based conversion engine. It can borrow the
information architecture of [UnitConverters.net](https://www.unitconverters.net/)
without copying its visual design or data wholesale.

Useful reference patterns from UnitConverters.net:

- Home page: an express converter, unit search, common conversions, and grouped
  "full version" converter links.
- Converter page: a focused From/To form, popular conversion shortcuts, and a
  complete unit list for the selected quantity.
- Category grouping: Dimension, Mechanics, Heat, Fluids, Light, Electricity,
  Magnetism, Radiology, and Miscellaneous converter groups.

The UI prioritizes supported conversions from the Python package. Unsupported
web-site categories such as currency, case conversion, data storage,
typography, or sound stay out of the interface until a backend source exists.

## Backend Facts

Current backend package observations:

- Package version: `unit-converter` 1.3.0.
- Source data: NIST Special Publication 811 (2008), Appendix B.9.
- Public APIs: `convert()`, `UnitConverter.from_package_data()`,
  `get_unit_catalog()`, `get_ui_unit_catalog()`, `list_categories()`, and
  `list_units()`.
- Catalog size: 30 source categories, 467 supported unit labels, 451 direct
  conversion rules, and 5,926 ordered convertible pairs.
- Conversion results are Python `Decimal` values.
- Unit labels must currently match backend catalog labels exactly.
- The backend now packages `ui_unit_catalog.json` and unit-level
  `ui_categories` metadata. The adapter uses those fields directly instead of
  maintaining a separate UI category map.

## Recommended Architecture

Use a normal client web app with a thin HTTP API adapter around the Python
package:

```text
Browser UI
  -> Frontend API client
  -> HTTP adapter service
  -> unit_converter Python package
  -> packaged JSON catalog and conversion graph
```

This keeps the UI independent from Python runtime details while preserving the
backend package as the single source of truth for conversion behavior.

The browser UI does not import or install the Python package directly. It calls
HTTP endpoints with `fetch`. The HTTP adapter is the Python runtime boundary: it
installs `unit-converter`, imports the package, and exposes `/api/catalog`,
`/api/units`, and `/api/convert` to the frontend.

There are two reasonable deployment shapes:

- Adapter in this UI repository: keep a separate Python service under an `api/`
  directory, with its own `requirements.txt` or `pyproject.toml`. The frontend
  still uses Node/Vite, while the adapter uses a Python virtual environment.
- Adapter in the backend repository: keep this repository as a pure static
  frontend and configure the API base URL with an environment variable such as
  `VITE_API_BASE_URL`.

For early development, the first option is convenient because the UI and API
contract can evolve together. The adapter dependency can be pinned from a
published package when available:

```text
unit-converter==1.3.0
```

Or installed from GitHub before a package release is available:

```text
unit-converter @ git+https://github.com/KennyZhou2022/unit-converter.git@v1.3.0
```

The adapter code would then call the package normally:

```python
from unit_converter import convert, get_ui_unit_catalog, get_unit_catalog, list_units
```

Current implementation:

- Build-free browser UI using native ES modules, HTML, and CSS.
- Python standard-library HTTP adapter in `api/server.py`.
- Local adapter dependency installed from the copied wheel in `vendor/wheels/`.
- Cloud adapter dependency installed from a GitHub tag through
  `api/requirements.txt`.

Target frontend stack for the next iteration:

- Vite + React + TypeScript for a small, fast app foundation.
- React Router for URL-addressable converter pages.
- TanStack Query for catalog and conversion request caching.
- Zod or generated TypeScript types for validating API responses.
- CSS variables plus plain CSS modules or scoped CSS for a restrained,
  calculator-like UI.
- Vitest + Testing Library for component tests.
- Playwright for end-to-end conversion flows.

## Repository Layout

```text
unit-converter-ui/
  CHANGELOG.md
  VERSION
  api/
    server.py
    test_server.py
    requirements.txt
    requirements.local.txt
  scripts/
    check-version.mjs
    setup-local-api.sh
    dev.sh
  release/
    v1.0.0.md
    v1.1.0.md
  vendor/
    wheels/
      unit_converter-1.3.0-py3-none-any.whl
  public/
    favicon.svg
  index.html
  src/
    app/
      App.js
      main.js
      router.js
    components/
      dom.js
    features/
      converter/
        ConverterWorkspace.js
        ConverterForm.js
        ResultPanel.js
        unitFilters.js
      favorites/
        FavoritesPanel.js
        favoriteGroups.js
        favoriteStorageSync.js
        favoriteStore.js
      catalog/
        CatalogPage.js
        CategoryGrid.js
        UnitSearch.js
      layout/
        AppShell.js
    services/
      api/
        client.js
        unitConverterApi.js
    styles/
      tokens.css
      global.css
  README.md
  package.json
```

## Release Preparation

The prepared UI release is `v1.1.0`.

- `VERSION` records the UI release version.
- `package.json` uses the same release version.
- The top navigation and browser title display `v1.1.0`.
- `/api/health` exposes both the UI version and backend package version.
- `release/v1.1.0.md` is ready to use as the GitHub Release note.
- `npm run check:version` verifies the runtime version entry points agree.

Release verification and tagging flow:

```bash
npm run check:version
npm test
npm run test:api
npm run check:api
find src -name '*.js' -exec node --check {} \;
git tag -a v1.1.0 -m "Release v1.1.0"
git push origin v1.1.0
```

Create the tag only after the release commit is reviewed and the deployment
target has passed its smoke test.

## Local Development

The local development path uses the copied backend wheel:

```bash
sh scripts/setup-local-api.sh
sh scripts/dev.sh
```

Then open:

```text
http://127.0.0.1:5173
```

The setup script creates `.venv/` and installs:

```text
vendor/wheels/unit_converter-1.3.0-py3-none-any.whl
```

This keeps local testing deterministic even before the backend package is
published to a package index.

## Cloud Deployment

For a general cloud deployment, install the adapter dependency from
`api/requirements.txt`:

```text
unit-converter @ git+https://github.com/KennyZhou2022/unit-converter.git@v1.3.0
```

When the backend package updates, bump the Git tag in that file. If the package
is published to PyPI, switch the dependency to a normal pinned version:

```text
unit-converter==1.3.0
```

Run the adapter with:

```bash
python api/server.py --host 0.0.0.0 --port "$PORT"
```

## Routes

Application routes:

- `/`: converter workspace with Category and Measure selection, From and To
  units, Amount, result, and browser-local Favorites.
- `/convert/:categorySlug/:converterSlug`: opens the workspace with a specific
  converter such as `/convert/dimension-converters/length`.
- `/units`: searchable supported-unit catalog.
- `/about`: source, backend package release, and issue-reporting links.
- `/about-data`: backward-compatible alias for `/about`.

Optional later routes:

- `/compare`: convert one input to every compatible unit in a category.
- `/recent`: local-only recent conversions.
- `/settings`: precision, notation, and theme preferences.

## API Contract

The frontend should call an HTTP adapter rather than importing Python directly.
The adapter may live in the backend repo or be added later as a small service,
but the UI should depend only on the following contract.

### `GET /api/health`

Returns adapter and backend package status.

```json
{
  "ok": true,
  "uiVersion": "1.1.0",
  "packageVersion": "1.3.0"
}
```

### `GET /api/catalog`

Returns categories from the backend package's `get_ui_unit_catalog()` tree,
filtered to subcategories that currently have supported package units.

```json
{
  "version": 1,
  "source": "NIST Special Publication 811 (2008), Appendix B.9",
  "categories": [
    {
      "name": "Dimension Converters",
      "slug": "dimension-converters",
      "subcategories": [
        {
          "name": "Length",
          "slug": "length",
          "units": [
            {
              "label": "meter (m)",
              "searchText": "meter m"
            }
          ]
        }
      ]
    }
  ]
}
```

### `GET /api/units?category=length`

Returns units for a UI subcategory or backend category. Include exact backend
labels in every option.

```json
{
  "units": [
    {
      "label": "meter (m)",
      "displayName": "meter",
      "symbol": "m"
    }
  ]
}
```

### `POST /api/convert`

Converts a value from one exact backend unit label to another.
Requests must use `Content-Type: application/json`, and the JSON body is limited
to 16 KiB. All three fields must be strings; decimal input is limited to 100
digits with a scientific-notation exponent between `-1000` and `1000`, and unit
labels are limited to 240 characters.

```json
{
  "value": "1",
  "fromUnit": "mile per hour (mi / h)",
  "toUnit": "kilometer per hour (km / h)"
}
```

Successful response:

```json
{
  "result": "1.609344",
  "resultType": "Decimal",
  "fromUnit": "mile per hour (mi / h)",
  "toUnit": "kilometer per hour (km / h)"
}
```

Error response:

```json
{
  "error": {
    "code": "INCOMPATIBLE_UNITS",
    "message": "The selected units cannot be converted.",
    "details": {}
  }
}
```

Recommended error codes:

- `INVALID_REQUEST`
- `INVALID_JSON`
- `UNSUPPORTED_MEDIA_TYPE`
- `REQUEST_TOO_LARGE`
- `INVALID_VALUE`
- `UNIT_NOT_FOUND`
- `INCOMPATIBLE_UNITS`
- `AMBIGUOUS_CONVERSION`
- `CONVERSION_NOT_FOUND`
- `UNIT_CONVERTER_UNAVAILABLE`
- `INTERNAL_ERROR`

## UI Composition

### Convert

The home screen is the usable converter, not a marketing page.

Primary regions:

- Separate Category and Measure selectors backed by the complete catalog.
- From and To unit selectors, swap control, Amount input, and result panel.
- Browser-local Favorites grouped by Category and Measure.

### Converter Page

Each converter view contains:

- Numeric input with validation for decimal/scientific notation.
- Separate Category and Measure selectors.
- Keyboard-friendly From and To unit selectors.
- Swap button.
- Result panel with loading and error states.
- Favorite save, load, and remove actions.

### Catalog Page

The catalog should expose all backend-supported units with:

- Search by name, symbol, and exact backend label.
- Category/subcategory filters.
- Counts for visible units.
- Empty states when filters have no match.

## State And Data Flow

Converter state remains local, with routes providing an initial selection:

- Deep links initialize the current Category and Measure.
- Amount and unit selections remain in the converter workspace.
- Conversion requests are debounced while typing and run immediately on unit,
  measure, favorite, and swap changes.
- Favorites are validated and stored in `localStorage` under a versioned key.
- Storage events synchronize Favorites across tabs without rebuilding the page.

Conversion flow:

```text
User edits value or unit
  -> validate input locally
  -> call POST /api/convert
  -> show Decimal result as string
  -> show backend error with recovery action when needed
```

## Formatting And Precision

The backend returns exact `Decimal` results. The UI formats only the displayed
string:

- Display at most 10 fractional digits, with correct rounding.
- Remove unnecessary trailing zeros.
- Preserve scientific-notation exponents returned by the backend.
- Do not change values sent between the frontend and backend.

## Accessibility

Baseline requirements:

- All inputs and selects have labels.
- Keyboard users can complete a conversion without a mouse.
- Result updates are announced with an appropriate live region.
- Error messages are tied to the corresponding fields.
- Color is not the only way to communicate errors or active selection.

## Testing Strategy

Automated frontend tests currently cover:

- Result formatting, numeric validation, group and measure filtering.
- Latest-request ordering for asynchronous conversions.
- Favorites persistence, grouping, validation, error handling, and cross-tab
  storage synchronization.
- Convert, Units, and About navigation markup.

Python adapter tests cover:

- Public static-file allowlisting and repository path protection.
- Request body, Decimal, and unit-label validation boundaries.
- Health responses that do not expose internal import errors.

Release verification also includes:

- JavaScript syntax and Python adapter compilation checks.
- Browser smoke tests of conversion and Favorites flows.
- Responsive visual checks across mobile and desktop viewport widths.

## Implementation Milestones

1. Scaffold Vite + React + TypeScript and basic design tokens.
2. Add mock API fixtures from backend catalog data.
3. Build home, converter, and catalog screens with mocked data.
4. Add the HTTP adapter contract and local development proxy.
5. Wire real catalog and conversion calls.
6. Add Playwright coverage for the core conversion flows.
7. Add deployment configuration once the backend adapter location is decided.

## Open Decisions

- Whether the HTTP adapter belongs in this UI repo, the backend repo, or a third
  deployment repo.
- Whether the backend should package `ui_unit_catalog.json` as a public API.
- Which popular conversion shortcuts should be curated manually versus generated
  from usage/category metadata.
- How much alias support belongs in the backend versus the frontend search
  layer.

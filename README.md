# Unit Converter UI

This repository contains the web UI for the `unit-converter` Python package.
The backend package source is
[KennyZhou2022/unit-converter](https://github.com/KennyZhou2022/unit-converter).

Current UI release: `v1.0.0`. The release version is recorded in `VERSION`.

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

The first UI version should prioritize supported conversions from the Python
package. Unsupported web-site categories such as currency, case conversion,
data storage, typography, or sound should stay hidden or explicitly marked as
future work until a backend source exists.

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

The browser UI should not import or install the Python package directly. It
should call HTTP endpoints with `fetch`/TanStack Query. The HTTP adapter is the
Python runtime boundary: it installs `unit-converter`, imports the package, and
exposes `/api/catalog`, `/api/units`, and `/api/convert` to the frontend.

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

Current first implementation:

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

## Suggested Repository Layout

```text
unit-converter-ui/
  VERSION
  api/
    server.py
    requirements.txt
    requirements.local.txt
  scripts/
    setup-local-api.sh
    dev.sh
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
        ConverterForm.js
        PopularConversions.js
        ResultPanel.js
        unitFilters.js
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

The first UI release is `v1.0.0`.

- `VERSION` records the UI release version.
- `package.json` uses the same release version.
- The top navigation and browser title display `v1.0.0`.
- `/api/health` exposes both the UI version and backend package version.
- `release/v1.0.0.md` is ready to use as the GitHub Release note.

Suggested release flow:

```bash
python3 -m py_compile api/server.py
find src -name '*.js' -exec node --check {} \;
git tag v1.0.0
```

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

Initial routes:

- `/`: home screen with express converter, search, common conversions, and
  category groups.
- `/convert/:categorySlug/:converterSlug`: focused converter page such as
  `/convert/dimension-converters/length`.
- `/units`: searchable supported-unit catalog.
- `/units/:categorySlug`: units filtered by backend or UI category.
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
  "uiVersion": "1.0.0",
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
    "message": "No conversion path found from ...",
    "details": {}
  }
}
```

Recommended error codes:

- `INVALID_VALUE`
- `UNIT_NOT_FOUND`
- `INCOMPATIBLE_UNITS`
- `AMBIGUOUS_CONVERSION`
- `CONVERSION_NOT_FOUND`
- `INTERNAL_ERROR`

## UI Composition

### Home

The home screen should be the usable converter, not a marketing page.

Primary regions:

- Express converter for common categories: Length, Temperature, Area, Volume,
  Weight/Mass, and Time when supported by the backend catalog.
- Unit search with "from" and "to" selectors.
- Common conversion shortcuts generated from supported pairs.
- Category grid matching UnitConverters.net-style groups where those groups map
  to backend-supported units.

### Converter Page

Each converter page should contain:

- Numeric input with validation for decimal/scientific notation.
- From and To unit selectors, searchable and keyboard-friendly.
- Swap button.
- Result panel with copy action.
- Popular shortcuts for the current converter.
- Complete supported unit list for the current converter.
- Source note linking the page to NIST-backed data.

### Catalog Page

The catalog should expose all backend-supported units with:

- Search by name, symbol, and exact backend label.
- Category/subcategory filters.
- Counts for visible units.
- Empty states when filters have no match.

## State And Data Flow

Keep most state local and URL-driven:

- Current category and converter come from route params.
- Current input value and unit selections can live in query params for shareable
  links, for example `?value=1&from=meter%20(m)&to=foot%20(ft)`.
- Catalog responses are cached through TanStack Query.
- Conversion requests are debounced for typing, but should also run immediately
  on unit changes and swap.
- User preferences such as precision and notation can be stored in localStorage.

Conversion flow:

```text
User edits value or unit
  -> validate input locally
  -> call POST /api/convert
  -> show Decimal result as string
  -> show backend error with recovery action when needed
```

## Formatting And Precision

The backend returns exact `Decimal` results. The UI should preserve the raw
string and format display separately:

- Default display: compact decimal string without unnecessary trailing zeros.
- Advanced option: scientific notation for very large or small values.
- Copy action should offer the displayed value first.
- Do not round silently in data passed between frontend and backend.

## Accessibility

Baseline requirements:

- All inputs and selects have labels.
- Keyboard users can complete a conversion without a mouse.
- Result updates are announced with an appropriate live region.
- Error messages are tied to the corresponding fields.
- Color is not the only way to communicate errors or active selection.

## Testing Strategy

Frontend tests:

- Unit tests for formatting, query-param parsing, and unit filtering.
- Component tests for converter form, unit selector, result panel, and error
  states.
- End-to-end tests for common conversions, swap behavior, invalid values, and
  incompatible units.

Contract tests:

- Validate `/api/catalog` against the frontend TypeScript/Zod schema.
- Verify a small set of known conversions against backend package examples,
  including temperature and temperature interval cases.

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

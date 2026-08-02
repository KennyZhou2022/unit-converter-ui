# Unit Converter UI

Browser UI and thin Python HTTP adapter for
[`nist-unit-converter`](https://github.com/KennyZhou2022/unit-converter).

Current UI release: `v2.0.0`. The backend dependency is pinned to
`nist-unit-converter v2.0.0`. The UI version is recorded in `VERSION` and is
shown in the top navigation.

## Product Scope

The application provides:

- A focused From/To converter grouped by UI category and subcategory.
- A searchable catalog of all backend-supported units and their direct UI
  classifications.
- Browser-local favorites for saved conversion directions.
- Source, package release, and issue links on the About page.

The information architecture is inspired by
[UnitConverters.net](https://www.unitconverters.net/), while all supported
units and conversion behavior come from the Python package.

## Architecture

```text
Browser UI
  -> frontend API client
  -> Python standard-library HTTP adapter
  -> unit_converter import package
  -> nist-unit-converter catalog and conversion APIs
```

The browser never imports Python directly. Local setup or the deployment
environment installs the Python distribution; the adapter in `api/server.py`
imports `unit_converter` and exposes a small same-origin JSON API. Conversion
results cross the API boundary as strings so Python `Decimal` precision is not
lost through implicit JSON serialization.

The UI is currently build-free and uses native ES modules, HTML, and CSS. The
same Python process serves both static assets and API routes.

## Backend Contract

The distribution and import names are intentionally different:

```text
Distribution: nist-unit-converter
Import:       unit_converter
```

Cloud and general deployments install the Git-tagged dependency from
`api/requirements.txt`:

```text
nist-unit-converter @ git+https://github.com/KennyZhou2022/unit-converter.git@v2.0.0
```

The project does not assume that this version exists on PyPI. Local development
uses the release wheel copied into `vendor/wheels/` and referenced by
`api/requirements.local.txt`.

The adapter imports only public package APIs:

```python
from unit_converter import (
    ConversionError,
    IncompatibleUnitError,
    UnitNotFoundError,
    can_convert,
    compatible_units,
    convert,
    get_ui_unit_catalog,
    get_unit_catalog,
    list_categories,
    list_ui_categories,
    list_ui_subcategories,
    list_ui_unit_ids,
    list_ui_units,
    list_unit_ids,
    list_units,
)
```

No runtime JSON file is read directly from the installed package.

## Catalog Model

`nist-unit-converter v2.0.0` exposes catalog schema version 3:

- 462 total units.
- 457 units with direct UI mappings.
- 5 units with `ui_mapping_status: "unmapped"`.
- Stable `unit_id` and `quantity_id` values.
- Canonical `display_name` values and conversion aliases.

The adapter builds Category and Measure controls directly from
`list_ui_categories()`, `list_ui_subcategories()`, `list_ui_units()`, and
`list_ui_unit_ids()`. It does not infer UI placement from `nist_categories`.
Unmapped units remain searchable under the Units page's `Uncategorized`
filter, but are not inserted into converter categories.

The backend's
[Supported Units documentation](https://github.com/KennyZhou2022/unit-converter/blob/v2.0.0/docs/supported-units.md)
uses NIST source categories, so all 462 records appear under a category there.
That source taxonomy is different from the narrower converter UI taxonomy.
The five records without a UI mapping are intentional:

- `foot to the fourth power (ft4)`, `inch to the fourth power (in4)`, and
  `meter to the fourth power (m4)` need a Second Moment of Area measure. The
  existing Moment of Inertia measure represents mass moment of inertia and is
  not semantically interchangeable.
- `square foot per hour (ft2 / h)` and `square meter per second (m2 / s)` need
  a Thermal Diffusivity measure. Kinematic Viscosity has the same dimensions
  but represents a different physical quantity.

The UI keeps these records separate rather than deriving a misleading UI
placement from `nist_categories`. A future backend taxonomy can map them by
adding the two missing Measures to its public UI catalog.

The Units page presents a left-aligned two-column table. `Category` contains
the direct UI category and subcategory path (for example,
`Dimension Converters / Length`), while `Unit` contains the canonical
`displayName`. Units mapped to more than one UI location show each applicable
path; the five unmapped records show `Uncategorized`. Stable IDs remain the
internal identity and are searchable, but are not used as visible row labels.

Every API array that represents units is ordered by canonical `displayName`,
ascending without case or accent distinctions and with punctuation treated as
word separators; stable IDs break any remaining ties. This single adapter
contract controls category-scoped unit results and the From and compatible To
selectors. The Units table applies a presentation-specific two-level order:
full Category path ascending first, then canonical Unit name ascending within
each Category. Category and Measure controls retain the curated order supplied
by the backend UI taxonomy.

Frontend unit records use this shape:

```json
{
  "unitId": "unit.u0271",
  "quantityId": "quantity.q0022",
  "displayName": "meter (m)",
  "aliases": [],
  "symbol": "m",
  "searchText": "unit u0271 meter m",
  "uiMappingStatus": "mapped"
}
```

Selectors display `displayName`. Select values, conversion requests, and new
persistent data use `unitId`.

After the From unit changes, the browser calls `compatible_units()` through the
adapter and intersects the result with the active Measure. The To selector
therefore contains only units that the backend reports as convertible.

## Repository Layout

```text
unit-converter-ui/
  VERSION
  CHANGELOG.md
  api/
    server.py
    test_server.py
    requirements.txt
    requirements.local.txt
  scripts/
    check-version.mjs
    dev.sh
    setup-local-api.sh
  release/
    v1.0.0.md
    v1.1.0.md
    v2.0.0.md
  vendor/wheels/
    nist_unit_converter-2.0.0-py3-none-any.whl
  public/
  src/
    app/
    components/
    features/
    services/
    styles/
  index.html
  package.json
```

## Local Development

Prerequisites are Python 3.10 or newer and a current Node.js/npm installation.
The project has no third-party frontend dependencies.

Set up the local adapter from the bundled wheel and start the UI:

```bash
npm run setup:api
npm run dev
```

Open `http://127.0.0.1:5173/`.

The local requirement is:

```text
vendor/wheels/nist_unit_converter-2.0.0-py3-none-any.whl
```

The wheel must have distribution metadata `nist-unit-converter==2.0.0`; Python
code continues to import `unit_converter`.

The setup script removes the pre-v2 distribution before force-reinstalling the
new wheel. This is required when an existing virtual environment is reused,
because both distributions own the same Python import directory.

## Cloud Deployment

Install the tagged Git dependency and start the adapter on the platform port:

```bash
python -m pip install -r api/requirements.txt
python api/server.py --host 0.0.0.0 --port "$PORT"
```

When the backend changes, update the Git tag in `api/requirements.txt`, replace
the local wheel, update `api/requirements.local.txt`, and rerun the complete
verification suite. A deployment system may instead install a wheel downloaded
from the backend project's
[GitHub Releases](https://github.com/KennyZhou2022/unit-converter/releases), but
the version must remain explicitly pinned.

For an in-place deployment upgrade from a pre-v2 environment, uninstall the old
distribution before installing the new requirement. Immutable deployments with
a fresh environment do not need this cleanup step.

## Routes

- `/`: converter workspace with Category, Measure, From, To, Amount, result,
  and Favorites controls.
- `/convert/:categorySlug/:converterSlug`: converter deep link scoped to one
  UI subcategory.
- `/units`: a searchable Category/Unit table for all 462 supported units,
  including an `Uncategorized` filter for the 5 unmapped records.
- `/about`: NIST source, current backend wheel version, releases, and issue
  reporting.
- `/about-data`: backward-compatible route alias for `/about`.

## API Contract

### `GET /api/health`

```json
{
  "ok": true,
  "uiVersion": "2.0.0",
  "packageName": "nist-unit-converter",
  "packageVersion": "2.0.0"
}
```

### `GET /api/catalog`

Returns schema 3 metadata, the direct UI taxonomy, all units, and the unmapped
unit list. Every unit array is alphabetized by canonical display name. The
following is an abbreviated response shape:

```json
{
  "version": 3,
  "totals": {
    "unit_count": 462,
    "unit_ui_mapping_count": 457,
    "unmapped_ui_unit_count": 5
  },
  "categories": [
    {
      "name": "Dimension Converters",
      "slug": "dimension-converters",
      "subcategories": [
        {
          "name": "Length",
          "slug": "length",
          "defaultFromUnit": "unit.u0271",
          "defaultToUnit": "unit.u0159",
          "units": [
            {
              "unitId": "unit.u0271",
              "quantityId": "quantity.q0022",
              "displayName": "meter (m)",
              "aliases": []
            }
          ]
        }
      ]
    }
  ],
  "allUnits": [],
  "unmappedUnits": []
}
```

### `GET /api/units?category=length`

Returns alphabetized units belonging to one UI subcategory. Omitting `category`
returns all units in the same canonical order.

### `GET /api/units?compatibleWith=unit.u0288`

Returns alphabetized canonical records for every unit compatible with the
selected stable ID. The frontend limits this response to the current UI Measure
before filling the To selector.

```json
{
  "sourceUnitId": "unit.u0288",
  "units": [
    {
      "unitId": "unit.u0250",
      "displayName": "kilometer per hour (km / h)"
    }
  ]
}
```

### `POST /api/convert`

Requests use stable IDs. The field names remain compatible with the existing UI
adapter contract.

```json
{
  "value": "1",
  "fromUnit": "unit.u0288",
  "toUnit": "unit.u0250"
}
```

Successful response:

```json
{
  "result": "1.609344",
  "resultType": "Decimal",
  "fromUnit": "unit.u0288",
  "toUnit": "unit.u0250"
}
```

Stable conversion error codes include:

- `UNIT_NOT_FOUND` for unknown IDs or aliases.
- `INCOMPATIBLE_UNITS` for units from incompatible physical quantities.
- `CONVERSION_FAILED` for other package-level conversion failures.
- `UNIT_CONVERTER_UNAVAILABLE` when the package cannot be imported.

## Favorites Migration

New favorites are stored in `localStorage` under
`unit-converter-ui:favorites:v2` and contain `fromUnitId` and `toUnitId`.

On first load, the UI checks the historical
`unit-converter:favorites:v1` entry. It creates an unambiguous lookup from each
catalog record's `displayName` and `aliases`, converts valid historical values
to stable IDs, and writes the migrated schema 2 payload. Unresolvable or
ambiguous historical values are discarded with a visible Favorites warning.
No database or server-side migration is required.

## Precision And Errors

- The adapter serializes the backend `Decimal` as a string.
- The UI displays at most 10 fractional digits with rounding and removes
  trailing zeroes.
- Input accepts bounded decimal and scientific notation.
- Conversion, compatibility-loading, empty, and service-unavailable states are
  exposed through accessible live regions.

## Verification

```bash
npm run check:version
npm test
npm run test:api
npm run check:api
find src scripts -name '*.js' -exec node --check {} \;
sh -n scripts/*.sh
git diff --check
```

The project has no bundling step, separate type checker, or separate lint task.
The JavaScript syntax pass is the current static build check. Release
verification also includes a browser smoke test of catalog loading, compatible
To filtering, ID-based conversion, Favorites, Units, About, responsive layout,
and console errors.

## Release

The prepared release is `v2.0.0`. Review the
[release notes](release/v2.0.0.md) before creating the tag:

```bash
git tag -a v2.0.0 -m "Release v2.0.0"
git push origin v2.0.0
```

Create the tag only after the release commit and deployment target have been
reviewed.

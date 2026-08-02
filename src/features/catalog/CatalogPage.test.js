import test from "node:test";
import assert from "node:assert/strict";

import {
  buildUnitCategoryLabels,
  sortCatalogRows,
} from "./CatalogPage.js";

test("maps units to their direct UI category paths without duplicates", () => {
  const sharedUnit = { unitId: "unit.u0271", displayName: "meter (m)" };
  const catalog = {
    categories: [
      {
        name: "Dimension Converters",
        slug: "dimension-converters",
        subcategories: [
          { name: "Length", slug: "length", units: [sharedUnit, sharedUnit] },
        ],
      },
      {
        name: "Mechanics Converters",
        slug: "mechanics-converters",
        subcategories: [
          { name: "Distance", slug: "distance", units: [sharedUnit] },
        ],
      },
    ],
  };

  const labelsByUnitId = buildUnitCategoryLabels(catalog);

  assert.deepEqual(labelsByUnitId.get("unit.u0271"), [
    "Dimension Converters / Length",
    "Mechanics Converters / Distance",
  ]);
  assert.equal(labelsByUnitId.has("unit.unmapped"), false);
});

test("orders catalog rows by category and then unit name", () => {
  const rows = [
    row("Mechanics Converters / Time", "year (365 days)", "unit.year"),
    row("Dimension Converters / Length", "meter (m)", "unit.meter"),
    row("Dimension Converters / Area", "square meter (m2)", "unit.square-meter"),
    row("Mechanics Converters / Time", "ångström (Å)", "unit.angstrom"),
    row("Dimension Converters / Area", "acre (a)", "unit.acre"),
    row("Uncategorized", "meter to the fourth power (m4)", "unit.m4"),
  ];

  assert.deepEqual(
    sortCatalogRows(rows).map(({ category, unit }) => [
      category,
      unit.displayName,
    ]),
    [
      ["Dimension Converters / Area", "acre (a)"],
      ["Dimension Converters / Area", "square meter (m2)"],
      ["Dimension Converters / Length", "meter (m)"],
      ["Mechanics Converters / Time", "ångström (Å)"],
      ["Mechanics Converters / Time", "year (365 days)"],
      ["Uncategorized", "meter to the fourth power (m4)"],
    ],
  );
  assert.equal(rows[0].unit.unitId, "unit.year");
});

function row(category, displayName, unitId) {
  return {
    category,
    unit: { displayName, unitId },
  };
}

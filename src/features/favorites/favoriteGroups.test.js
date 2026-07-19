import test from "node:test";
import assert from "node:assert/strict";

import { groupFavorites } from "./favoriteGroups.js";

const catalog = {
  categories: [
    {
      name: "Dimension Converters",
      slug: "dimension-converters",
      subcategories: [
        {
          name: "Length",
          slug: "length",
          units: [
            { label: "meter (m)", displayName: "meter", symbol: "m" },
            { label: "foot (ft)", displayName: "foot", symbol: "ft" },
            { label: "kilometer (km)", displayName: "kilometer", symbol: "km" },
          ],
        },
      ],
    },
    {
      name: "Mechanics Converters",
      slug: "mechanics-converters",
      subcategories: [
        {
          name: "Weight and Mass",
          slug: "weight-and-mass",
          units: [
            { label: "kilogram (kg)", displayName: "kilogram", symbol: "kg" },
            { label: "pound (lb)", displayName: "pound", symbol: "lb" },
          ],
        },
      ],
    },
  ],
};

test("groups favorites in catalog category and measure order", () => {
  const result = groupFavorites(catalog, [
    {
      groupSlug: "mechanics-converters",
      converterSlug: "weight-and-mass",
      fromUnit: "kilogram (kg)",
      toUnit: "pound (lb)",
      createdAt: "2026-07-19T12:02:00.000Z",
    },
    {
      groupSlug: "dimension-converters",
      converterSlug: "length",
      fromUnit: "meter (m)",
      toUnit: "foot (ft)",
      createdAt: "2026-07-19T12:01:00.000Z",
    },
  ]);

  assert.deepEqual(
    result.groups.map((group) => ({
      name: group.name,
      measures: group.measures.map((measure) => ({
        name: measure.name,
        pairs: measure.items.map((item) => `${item.fromLabel} → ${item.toLabel}`),
      })),
    })),
    [
      {
        name: "Dimension Converters",
        measures: [{ name: "Length", pairs: ["meter (m) → foot (ft)"] }],
      },
      {
        name: "Mechanics Converters",
        measures: [
          { name: "Weight and Mass", pairs: ["kilogram (kg) → pound (lb)"] },
        ],
      },
    ],
  );
  assert.deepEqual(result.unavailable, []);
});

test("keeps stale or incompatible favorites in an unavailable group", () => {
  const missingUnit = {
    groupSlug: "dimension-converters",
    converterSlug: "length",
    fromUnit: "meter (m)",
    toUnit: "missing unit",
    createdAt: "2026-07-19T12:00:00.000Z",
  };

  const result = groupFavorites(catalog, [missingUnit]);

  assert.deepEqual(result.groups, []);
  assert.deepEqual(result.unavailable, [missingUnit]);
});

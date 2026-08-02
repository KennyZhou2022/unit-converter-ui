import test from "node:test";
import assert from "node:assert/strict";

import { groupFavorites } from "./favoriteGroups.js";

const catalog = {
  allUnits: [
    { unitId: "unit.u0159", displayName: "foot (ft)" },
    { unitId: "unit.u0233", displayName: "kilogram (kg)" },
    { unitId: "unit.u0249", displayName: "kilometer (km)" },
    { unitId: "unit.u0271", displayName: "meter (m)" },
    {
      unitId: "unit.u0346",
      displayName: "pound (avoirdupois) (lb)",
    },
  ],
  categories: [
    {
      name: "Dimension Converters",
      slug: "dimension-converters",
      subcategories: [
        {
          name: "Length",
          slug: "length",
          units: [
            { unitId: "unit.u0271", displayName: "meter (m)" },
            { unitId: "unit.u0159", displayName: "foot (ft)" },
            { unitId: "unit.u0249", displayName: "kilometer (km)" },
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
            { unitId: "unit.u0233", displayName: "kilogram (kg)" },
            {
              unitId: "unit.u0346",
              displayName: "pound (avoirdupois) (lb)",
            },
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
      fromUnitId: "unit.u0233",
      toUnitId: "unit.u0346",
      createdAt: "2026-07-19T12:02:00.000Z",
    },
    {
      groupSlug: "dimension-converters",
      converterSlug: "length",
      fromUnitId: "unit.u0271",
      toUnitId: "unit.u0159",
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
          {
            name: "Weight and Mass",
            pairs: ["kilogram (kg) → pound (avoirdupois) (lb)"],
          },
        ],
      },
    ],
  );
  assert.deepEqual(result.unavailable, []);
});

test("keeps stale favorites in an unavailable group", () => {
  const missingUnit = {
    groupSlug: "dimension-converters",
    converterSlug: "length",
    fromUnitId: "unit.u0271",
    toUnitId: "unit.u9999",
    createdAt: "2026-07-19T12:00:00.000Z",
  };

  const result = groupFavorites(catalog, [missingUnit]);

  assert.deepEqual(result.groups, []);
  assert.deepEqual(result.unavailable, [
    {
      ...missingUnit,
      fromLabel: "meter (m)",
      toLabel: "unit.u9999",
    },
  ]);
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  compactNumberString,
  compatibleUnitsForConverter,
  convertersForGroup,
  getDefaultPair,
} from "./unitFilters.js";

const catalog = {
  categories: [
    {
      name: "Dimension Converters",
      slug: "dimension-converters",
      subcategories: [
        { name: "Length", slug: "length", units: [] },
        { name: "Area", slug: "area", units: [] },
      ],
    },
    {
      name: "Mechanics Converters",
      slug: "mechanics-converters",
      subcategories: [
        { name: "Weight and Mass", slug: "weight-and-mass", units: [] },
        { name: "Speed", slug: "speed", units: [] },
      ],
    },
  ],
};

test("returns every second-level measure for the selected converter group", () => {
  const converters = convertersForGroup(catalog, "mechanics-converters");

  assert.deepEqual(
    converters.map(({ groupSlug, slug, name }) => ({ groupSlug, slug, name })),
    [
      {
        groupSlug: "mechanics-converters",
        slug: "weight-and-mass",
        name: "Weight and Mass",
      },
      {
        groupSlug: "mechanics-converters",
        slug: "speed",
        name: "Speed",
      },
    ],
  );
});

test("falls back to the first group when a group is unavailable", () => {
  const converters = convertersForGroup(catalog, "missing-group");

  assert.deepEqual(
    converters.map(({ groupSlug, slug }) => ({ groupSlug, slug })),
    [
      { groupSlug: "dimension-converters", slug: "length" },
      { groupSlug: "dimension-converters", slug: "area" },
    ],
  );
});

test("limits displayed conversion results to ten decimal places", () => {
  assert.equal(compactNumberString("1.23456789014"), "1.2345678901");
  assert.equal(compactNumberString("1.23456789015"), "1.2345678902");
  assert.equal(compactNumberString("9.99999999999"), "10");
  assert.equal(compactNumberString("1.230000000000"), "1.23");
  assert.equal(compactNumberString("-0.00000000001"), "0");
  assert.equal(
    compactNumberString("12345678901234567890.12345678905"),
    "12345678901234567890.1234567891",
  );
  assert.equal(compactNumberString("1.23456789015E+20"), "1.2345678902E+20");
});

test("uses stable unit IDs for a converter default pair", () => {
  const converter = {
    defaultFromUnit: "unit.u0288",
    defaultToUnit: "unit.u0250",
    units: [
      { unitId: "unit.u0250", displayName: "kilometer per hour (km / h)" },
      { unitId: "unit.u0288", displayName: "mile per hour (mi / h)" },
    ],
  };

  assert.deepEqual(getDefaultPair(converter), {
    fromUnit: "unit.u0288",
    toUnit: "unit.u0250",
  });
});

test("limits compatible targets to the current converter in catalog order", () => {
  const converter = {
    units: [
      { unitId: "unit.u0288", displayName: "mile per hour (mi / h)" },
      { unitId: "unit.u0250", displayName: "kilometer per hour (km / h)" },
      { unitId: "unit.u0397", displayName: "second (s)" },
    ],
  };
  const compatibleUnits = [
    { unitId: "unit.u0250", displayName: "kilometer per hour (km / h)" },
    { unitId: "unit.u0288", displayName: "mile per hour (mi / h)" },
    { unitId: "unit.u0999", displayName: "another speed" },
  ];

  assert.deepEqual(
    compatibleUnitsForConverter(converter, compatibleUnits).map(
      (unit) => unit.unitId,
    ),
    ["unit.u0288", "unit.u0250"],
  );
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  FAVORITES_STORAGE_KEY,
  LEGACY_FAVORITES_STORAGE_KEY,
  createFavoriteStore,
} from "./favoriteStore.js";

const createdAt = "2026-07-19T12:00:00.000Z";
const catalogUnits = [
  { unitId: "unit.u0159", displayName: "foot (ft)", aliases: [] },
  {
    unitId: "unit.u0233",
    displayName: "kilogram (kg)",
    aliases: ["kilogram (k g)"],
  },
  { unitId: "unit.u0271", displayName: "meter (m)", aliases: [] },
  {
    unitId: "unit.u0346",
    displayName: "pound (avoirdupois) (lb)",
    aliases: [],
  },
];
const meterToFoot = {
  groupSlug: "dimension-converters",
  converterSlug: "length",
  fromUnitId: "unit.u0271",
  toUnitId: "unit.u0159",
};

class MemoryStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

function createStore(storage = new MemoryStorage()) {
  return createFavoriteStore(storage, {
    now: () => createdAt,
    units: catalogUnits,
  });
}

test("adds a favorite and persists the versioned payload", () => {
  const storage = new MemoryStorage();
  const store = createStore(storage);

  const result = store.toggle(meterToFoot);

  assert.equal(result.ok, true);
  assert.equal(result.saved, true);
  assert.deepEqual(store.getSnapshot(), {
    items: [{ ...meterToFoot, createdAt }],
    error: "",
  });
  assert.deepEqual(JSON.parse(storage.getItem(FAVORITES_STORAGE_KEY)), {
    schemaVersion: 2,
    items: [{ ...meterToFoot, createdAt }],
  });
});

test("toggling the exact same direction removes the existing favorite", () => {
  const store = createStore();
  store.toggle(meterToFoot);

  const result = store.toggle({ ...meterToFoot });

  assert.equal(result.ok, true);
  assert.equal(result.saved, false);
  assert.equal(store.has(meterToFoot), false);
  assert.deepEqual(store.getSnapshot().items, []);
});

test("treats the reverse direction as a separate favorite", () => {
  const store = createStore();
  const footToMeter = {
    ...meterToFoot,
    fromUnitId: meterToFoot.toUnitId,
    toUnitId: meterToFoot.fromUnitId,
  };

  store.toggle(meterToFoot);
  store.toggle(footToMeter);

  assert.equal(store.getSnapshot().items.length, 2);
});

test("removes a favorite without affecting other directions", () => {
  const store = createStore();
  const footToMeter = {
    ...meterToFoot,
    fromUnitId: meterToFoot.toUnitId,
    toUnitId: meterToFoot.fromUnitId,
  };
  store.toggle(meterToFoot);
  store.toggle(footToMeter);

  const result = store.remove(meterToFoot);

  assert.equal(result.ok, true);
  assert.equal(result.removed, true);
  assert.deepEqual(store.getSnapshot().items, [{ ...footToMeter, createdAt }]);
});

test("recovers from damaged stored JSON without throwing", () => {
  const store = createStore(
    new MemoryStorage({ [FAVORITES_STORAGE_KEY]: "{damaged" }),
  );

  const snapshot = store.getSnapshot();

  assert.deepEqual(snapshot.items, []);
  assert.match(snapshot.error, /could not be read/i);
});

test("does not mutate the in-memory list when persistence fails", () => {
  const storage = new MemoryStorage();
  storage.setItem = () => {
    throw new Error("Quota exceeded");
  };
  const store = createStore(storage);

  const result = store.toggle(meterToFoot);

  assert.equal(result.ok, false);
  assert.match(result.error, /could not be saved/i);
  assert.deepEqual(store.getSnapshot().items, []);
});

test("reports unavailable browser storage instead of pretending to persist", () => {
  const store = createFavoriteStore(null, {
    now: () => createdAt,
    units: catalogUnits,
  });

  const result = store.toggle(meterToFoot);

  assert.equal(result.ok, false);
  assert.match(store.getSnapshot().error, /could not be saved/i);
  assert.deepEqual(store.getSnapshot().items, []);
});

test("rejects malformed and oversized favorite fields", () => {
  const store = createStore();

  const missingUnit = store.toggle({ ...meterToFoot, fromUnitId: "" });
  const invalidUnitId = store.toggle({ ...meterToFoot, toUnitId: "meter (m)" });

  assert.equal(missingUnit.ok, false);
  assert.equal(invalidUnitId.ok, false);
  assert.deepEqual(store.getSnapshot().items, []);
});

test("notifies subscribers after a successful change", () => {
  const store = createStore();
  const snapshots = [];
  const unsubscribe = store.subscribe((snapshot) => snapshots.push(snapshot));

  store.toggle(meterToFoot);
  unsubscribe();
  store.toggle(meterToFoot);

  assert.deepEqual(snapshots, [
    { items: [{ ...meterToFoot, createdAt }], error: "" },
  ]);
});

test("rebases writes on the latest storage state from another tab", () => {
  const storage = new MemoryStorage();
  const firstTab = createStore(storage);
  const secondTab = createStore(storage);
  const kilogramToPound = {
    groupSlug: "mechanics-converters",
    converterSlug: "weight-and-mass",
    fromUnitId: "unit.u0233",
    toUnitId: "unit.u0346",
  };

  firstTab.toggle(meterToFoot);
  secondTab.toggle(kilogramToPound);

  assert.deepEqual(secondTab.getSnapshot().items, [
    { ...meterToFoot, createdAt },
    { ...kilogramToPound, createdAt },
  ]);
  assert.equal(JSON.parse(storage.getItem(FAVORITES_STORAGE_KEY)).items.length, 2);
});

test("migrates legacy display names and aliases to stable unit IDs", () => {
  const storage = new MemoryStorage({
    [LEGACY_FAVORITES_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      items: [
        {
          groupSlug: "dimension-converters",
          converterSlug: "length",
          fromUnit: "meter (m)",
          toUnit: "foot (ft)",
          createdAt,
        },
        {
          groupSlug: "mechanics-converters",
          converterSlug: "weight-and-mass",
          fromUnit: "kilogram (k g)",
          toUnit: "pound (avoirdupois) (lb)",
          createdAt,
        },
      ],
    }),
  });

  const store = createStore(storage);

  assert.deepEqual(store.getSnapshot(), {
    items: [
      { ...meterToFoot, createdAt },
      {
        groupSlug: "mechanics-converters",
        converterSlug: "weight-and-mass",
        fromUnitId: "unit.u0233",
        toUnitId: "unit.u0346",
        createdAt,
      },
    ],
    error: "",
  });
  assert.equal(
    JSON.parse(storage.getItem(FAVORITES_STORAGE_KEY)).schemaVersion,
    2,
  );
});

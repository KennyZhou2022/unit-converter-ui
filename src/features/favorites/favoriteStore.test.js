import test from "node:test";
import assert from "node:assert/strict";

import { createFavoriteStore, favoriteKey } from "./favoriteStore.js";

const STORAGE_KEY = "unit-converter:favorites:v1";
const createdAt = "2026-07-19T12:00:00.000Z";
const meterToFoot = {
  groupSlug: "dimension-converters",
  converterSlug: "length",
  fromUnit: "meter (m)",
  toUnit: "foot (ft)",
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
  return createFavoriteStore(storage, { now: () => createdAt });
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
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), {
    schemaVersion: 1,
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
    fromUnit: meterToFoot.toUnit,
    toUnit: meterToFoot.fromUnit,
  };

  store.toggle(meterToFoot);
  store.toggle(footToMeter);

  assert.equal(store.getSnapshot().items.length, 2);
  assert.notEqual(favoriteKey(meterToFoot), favoriteKey(footToMeter));
});

test("removes a favorite without affecting other directions", () => {
  const store = createStore();
  const footToMeter = {
    ...meterToFoot,
    fromUnit: meterToFoot.toUnit,
    toUnit: meterToFoot.fromUnit,
  };
  store.toggle(meterToFoot);
  store.toggle(footToMeter);

  const result = store.remove(meterToFoot);

  assert.equal(result.ok, true);
  assert.equal(result.removed, true);
  assert.deepEqual(store.getSnapshot().items, [{ ...footToMeter, createdAt }]);
});

test("recovers from damaged stored JSON without throwing", () => {
  const store = createStore(new MemoryStorage({ [STORAGE_KEY]: "{damaged" }));

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
  const store = createFavoriteStore(null, { now: () => createdAt });

  const result = store.toggle(meterToFoot);

  assert.equal(result.ok, false);
  assert.match(store.getSnapshot().error, /could not be saved/i);
  assert.deepEqual(store.getSnapshot().items, []);
});

test("rejects malformed and oversized favorite fields", () => {
  const store = createStore();

  const missingUnit = store.toggle({ ...meterToFoot, fromUnit: "" });
  const oversizedUnit = store.toggle({ ...meterToFoot, toUnit: "x".repeat(241) });

  assert.equal(missingUnit.ok, false);
  assert.equal(oversizedUnit.ok, false);
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
    fromUnit: "kilogram (kg)",
    toUnit: "pound (lb)",
  };

  firstTab.toggle(meterToFoot);
  secondTab.toggle(kilogramToPound);

  assert.deepEqual(secondTab.getSnapshot().items, [
    { ...meterToFoot, createdAt },
    { ...kilogramToPound, createdAt },
  ]);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).items.length, 2);
});

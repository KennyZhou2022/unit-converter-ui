import test from "node:test";
import assert from "node:assert/strict";

import { FAVORITES_STORAGE_KEY } from "./favoriteStore.js";
import { isFavoritesStorageEvent } from "./favoriteStorageSync.js";

test("accepts favorite updates and localStorage clear events", () => {
  const localStorage = {};

  assert.equal(
    isFavoritesStorageEvent(
      { key: FAVORITES_STORAGE_KEY, storageArea: localStorage },
      localStorage,
    ),
    true,
  );
  assert.equal(
    isFavoritesStorageEvent({ key: null, storageArea: localStorage }, localStorage),
    true,
  );
});

test("ignores unrelated keys and events from another storage area", () => {
  const localStorage = {};

  assert.equal(
    isFavoritesStorageEvent({ key: "another-key", storageArea: localStorage }, localStorage),
    false,
  );
  assert.equal(
    isFavoritesStorageEvent(
      { key: FAVORITES_STORAGE_KEY, storageArea: {} },
      localStorage,
    ),
    false,
  );
});

export const FAVORITES_STORAGE_KEY = "unit-converter-ui:favorites:v2";
export const LEGACY_FAVORITES_STORAGE_KEY = "unit-converter:favorites:v1";

const SCHEMA_VERSION = 2;
const LEGACY_SCHEMA_VERSION = 1;
const MAX_FAVORITES = 50;
const MAX_SLUG_LENGTH = 100;
const MAX_LEGACY_UNIT_LENGTH = 240;
const MAX_UNIT_ID_LENGTH = 64;
const UNIT_ID_PATTERN = /^unit\.u[0-9]{4,}$/;
const STORAGE_READ_ERROR = "Favorites could not be read from this browser.";
const STORAGE_WRITE_ERROR = "Favorites could not be saved in this browser.";

function favoriteKey(favorite) {
  return JSON.stringify([
    favorite?.groupSlug || "",
    favorite?.converterSlug || "",
    favorite?.fromUnitId || "",
    favorite?.toUnitId || "",
  ]);
}

export function createFavoriteStore(
  storage,
  { now = () => new Date().toISOString(), units = [] } = {},
) {
  const listeners = new Set();
  const legacyUnitIdLookup = buildLegacyUnitIdLookup(units);
  let state = readState(storage, legacyUnitIdLookup);

  function getSnapshot() {
    return {
      items: state.items.map((item) => ({ ...item })),
      error: state.error,
    };
  }

  function emit() {
    const snapshot = getSnapshot();
    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  function persist(items) {
    try {
      writeState(storage, items);
      return true;
    } catch {
      state = { ...state, error: STORAGE_WRITE_ERROR };
      emit();
      return false;
    }
  }

  function toggle(candidate) {
    const favorite = normalizeFavorite(candidate);
    if (!favorite) {
      return { ok: false, saved: false, error: "Favorite details are invalid." };
    }

    const latestState = readState(storage, legacyUnitIdLookup);
    const currentItems = latestState.error ? state.items : latestState.items;
    const key = favoriteKey(favorite);
    const existingIndex = currentItems.findIndex((item) => favoriteKey(item) === key);
    const saved = existingIndex < 0;
    if (saved && currentItems.length >= MAX_FAVORITES) {
      return {
        ok: false,
        saved: false,
        error: `You can save up to ${MAX_FAVORITES} favorites.`,
      };
    }

    const items = saved
      ? [...currentItems, { ...favorite, createdAt: String(now()) }]
      : currentItems.filter((_, index) => index !== existingIndex);
    if (!persist(items)) {
      return { ok: false, saved: !saved, error: STORAGE_WRITE_ERROR };
    }

    state = { items, error: "" };
    emit();
    return { ok: true, saved, error: "" };
  }

  function remove(candidate) {
    const favorite = normalizeFavorite(candidate);
    if (!favorite) {
      return { ok: false, removed: false, error: "Favorite details are invalid." };
    }

    const latestState = readState(storage, legacyUnitIdLookup);
    const currentItems = latestState.error ? state.items : latestState.items;
    const key = favoriteKey(favorite);
    const items = currentItems.filter((item) => favoriteKey(item) !== key);
    if (items.length === currentItems.length) {
      return { ok: true, removed: false, error: "" };
    }
    if (!persist(items)) {
      return { ok: false, removed: false, error: STORAGE_WRITE_ERROR };
    }

    state = { items, error: "" };
    emit();
    return { ok: true, removed: true, error: "" };
  }

  return {
    getSnapshot,
    has(candidate) {
      const favorite = normalizeFavorite(candidate);
      return Boolean(
        favorite
          && state.items.some((item) => favoriteKey(item) === favoriteKey(favorite)),
      );
    },
    remove,
    reload() {
      state = readState(storage, legacyUnitIdLookup);
      emit();
      return getSnapshot();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    toggle,
  };
}

function readState(storage, legacyUnitIdLookup) {
  if (!storage || typeof storage.getItem !== "function") {
    return { items: [], error: STORAGE_READ_ERROR };
  }

  let rawValue;
  let legacyRawValue;
  try {
    rawValue = storage.getItem(FAVORITES_STORAGE_KEY);
    legacyRawValue = rawValue
      ? null
      : storage.getItem(LEGACY_FAVORITES_STORAGE_KEY);
  } catch {
    return { items: [], error: STORAGE_READ_ERROR };
  }

  if (rawValue) {
    return parseStoredState(rawValue);
  }
  if (!legacyRawValue) {
    return { items: [], error: "" };
  }

  const migrated = parseLegacyState(legacyRawValue, legacyUnitIdLookup);
  if (!migrated.items.length && migrated.error) {
    return migrated;
  }
  try {
    writeState(storage, migrated.items);
  } catch {
    return { items: migrated.items, error: STORAGE_WRITE_ERROR };
  }
  return migrated;
}

function parseStoredState(rawValue) {
  try {
    const payload = JSON.parse(rawValue);
    if (payload?.schemaVersion !== SCHEMA_VERSION || !Array.isArray(payload.items)) {
      return { items: [], error: STORAGE_READ_ERROR };
    }
    return normalizeItems(payload.items, (candidate) => (
      normalizeFavorite(candidate, { includeCreatedAt: true })
    ));
  } catch {
    return { items: [], error: STORAGE_READ_ERROR };
  }
}

function parseLegacyState(rawValue, unitIdLookup) {
  try {
    const payload = JSON.parse(rawValue);
    if (
      payload?.schemaVersion !== LEGACY_SCHEMA_VERSION
      || !Array.isArray(payload.items)
    ) {
      return { items: [], error: STORAGE_READ_ERROR };
    }
    return normalizeItems(payload.items, (candidate) => (
      migrateLegacyFavorite(candidate, unitIdLookup)
    ));
  } catch {
    return { items: [], error: STORAGE_READ_ERROR };
  }
}

function normalizeItems(candidates, normalize) {
  const items = [];
  const keys = new Set();
  let discarded = false;
  for (const candidate of candidates.slice(0, MAX_FAVORITES)) {
    const favorite = normalize(candidate);
    const key = favorite && favoriteKey(favorite);
    if (!favorite || keys.has(key)) {
      discarded = true;
      continue;
    }
    keys.add(key);
    items.push(favorite);
  }
  if (candidates.length > MAX_FAVORITES) {
    discarded = true;
  }
  return {
    items,
    error: discarded ? "Some favorites could not be read from this browser." : "",
  };
}

function writeState(storage, items) {
  if (!storage || typeof storage.setItem !== "function") {
    throw new Error("Browser storage is unavailable.");
  }
  storage.setItem(
    FAVORITES_STORAGE_KEY,
    JSON.stringify({ schemaVersion: SCHEMA_VERSION, items }),
  );
}

function migrateLegacyFavorite(candidate, unitIdLookup) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  const groupSlug = validSlug(candidate.groupSlug);
  const converterSlug = validSlug(candidate.converterSlug);
  const fromUnitId = unitIdLookup.get(validLegacyUnit(candidate.fromUnit));
  const toUnitId = unitIdLookup.get(validLegacyUnit(candidate.toUnit));
  const createdAt = validCreatedAt(candidate.createdAt);
  if (!groupSlug || !converterSlug || !fromUnitId || !toUnitId || !createdAt) {
    return null;
  }
  return { groupSlug, converterSlug, fromUnitId, toUnitId, createdAt };
}

function normalizeFavorite(candidate, { includeCreatedAt = false } = {}) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const groupSlug = validSlug(candidate.groupSlug);
  const converterSlug = validSlug(candidate.converterSlug);
  const fromUnitId = validUnitId(candidate.fromUnitId);
  const toUnitId = validUnitId(candidate.toUnitId);
  if (!groupSlug || !converterSlug || !fromUnitId || !toUnitId) {
    return null;
  }

  const favorite = { groupSlug, converterSlug, fromUnitId, toUnitId };
  if (includeCreatedAt) {
    const createdAt = validCreatedAt(candidate.createdAt);
    if (!createdAt) {
      return null;
    }
    favorite.createdAt = createdAt;
  }
  return favorite;
}

function buildLegacyUnitIdLookup(units) {
  const lookup = new Map();
  const ambiguous = new Set();
  for (const unit of units) {
    const unitId = validUnitId(unit?.unitId);
    if (!unitId) {
      continue;
    }
    for (const key of [unitId, unit.displayName, ...(unit.aliases || [])]) {
      const normalizedKey = validLegacyUnit(key);
      if (!normalizedKey || ambiguous.has(normalizedKey)) {
        continue;
      }
      const existing = lookup.get(normalizedKey);
      if (existing && existing !== unitId) {
        lookup.delete(normalizedKey);
        ambiguous.add(normalizedKey);
      } else {
        lookup.set(normalizedKey, unitId);
      }
    }
  }
  return lookup;
}

function validSlug(value) {
  if (typeof value !== "string" || value.length > MAX_SLUG_LENGTH) {
    return "";
  }
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : "";
}

function validUnitId(value) {
  if (typeof value !== "string" || value.length > MAX_UNIT_ID_LENGTH) {
    return "";
  }
  const unitId = value.trim();
  return UNIT_ID_PATTERN.test(unitId) ? unitId : "";
}

function validLegacyUnit(value) {
  if (typeof value !== "string") {
    return "";
  }
  const unit = value.trim();
  return unit && unit.length <= MAX_LEGACY_UNIT_LENGTH ? unit : "";
}

function validCreatedAt(value) {
  return typeof value === "string" && value.length <= 40 ? value : "";
}

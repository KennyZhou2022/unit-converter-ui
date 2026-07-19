export const FAVORITES_STORAGE_KEY = "unit-converter:favorites:v1";

const SCHEMA_VERSION = 1;
const MAX_FAVORITES = 50;
const MAX_SLUG_LENGTH = 100;
const MAX_UNIT_LENGTH = 240;
const STORAGE_READ_ERROR = "Favorites could not be read from this browser.";
const STORAGE_WRITE_ERROR = "Favorites could not be saved in this browser.";

export function favoriteKey(favorite) {
  return JSON.stringify([
    favorite?.groupSlug || "",
    favorite?.converterSlug || "",
    favorite?.fromUnit || "",
    favorite?.toUnit || "",
  ]);
}

export function createFavoriteStore(
  storage,
  { now = () => new Date().toISOString() } = {},
) {
  const listeners = new Set();
  let state = readState(storage);

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
      if (!storage || typeof storage.setItem !== "function") {
        throw new Error("Browser storage is unavailable.");
      }
      storage.setItem(
        FAVORITES_STORAGE_KEY,
        JSON.stringify({ schemaVersion: SCHEMA_VERSION, items }),
      );
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

    const latestState = readState(storage);
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

    const latestState = readState(storage);
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
        favorite &&
          state.items.some((item) => favoriteKey(item) === favoriteKey(favorite)),
      );
    },
    remove,
    reload() {
      state = readState(storage);
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

function readState(storage) {
  if (!storage || typeof storage.getItem !== "function") {
    return { items: [], error: STORAGE_READ_ERROR };
  }

  let rawValue;
  try {
    rawValue = storage.getItem(FAVORITES_STORAGE_KEY);
  } catch {
    return { items: [], error: STORAGE_READ_ERROR };
  }

  if (!rawValue) {
    return { items: [], error: "" };
  }

  try {
    const payload = JSON.parse(rawValue);
    if (payload?.schemaVersion !== SCHEMA_VERSION || !Array.isArray(payload.items)) {
      return { items: [], error: STORAGE_READ_ERROR };
    }

    const items = [];
    const keys = new Set();
    let discarded = false;
    for (const candidate of payload.items.slice(0, MAX_FAVORITES)) {
      const favorite = normalizeFavorite(candidate, { includeCreatedAt: true });
      const key = favorite && favoriteKey(favorite);
      if (!favorite || keys.has(key)) {
        discarded = true;
        continue;
      }
      keys.add(key);
      items.push(favorite);
    }
    if (payload.items.length > MAX_FAVORITES) {
      discarded = true;
    }
    return {
      items,
      error: discarded ? "Some favorites could not be read from this browser." : "",
    };
  } catch {
    return { items: [], error: STORAGE_READ_ERROR };
  }
}

function normalizeFavorite(candidate, { includeCreatedAt = false } = {}) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const groupSlug = validSlug(candidate.groupSlug);
  const converterSlug = validSlug(candidate.converterSlug);
  const fromUnit = validUnit(candidate.fromUnit);
  const toUnit = validUnit(candidate.toUnit);
  if (!groupSlug || !converterSlug || !fromUnit || !toUnit) {
    return null;
  }

  const favorite = { groupSlug, converterSlug, fromUnit, toUnit };
  if (includeCreatedAt) {
    if (typeof candidate.createdAt !== "string" || candidate.createdAt.length > 40) {
      return null;
    }
    favorite.createdAt = candidate.createdAt;
  }
  return favorite;
}

function validSlug(value) {
  if (typeof value !== "string" || value.length > MAX_SLUG_LENGTH) {
    return "";
  }
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : "";
}

function validUnit(value) {
  if (typeof value !== "string") {
    return "";
  }
  const unit = value.trim();
  return unit && unit.length <= MAX_UNIT_LENGTH ? unit : "";
}

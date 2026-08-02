import {
  FAVORITES_STORAGE_KEY,
  LEGACY_FAVORITES_STORAGE_KEY,
} from "./favoriteStore.js";

export function isFavoritesStorageEvent(event, localStorage) {
  if (
    !event
    || ![FAVORITES_STORAGE_KEY, LEGACY_FAVORITES_STORAGE_KEY, null].includes(
      event.key,
    )
  ) {
    return false;
  }

  return !event.storageArea || !localStorage || event.storageArea === localStorage;
}

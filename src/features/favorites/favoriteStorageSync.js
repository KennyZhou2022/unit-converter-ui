import { FAVORITES_STORAGE_KEY } from "./favoriteStore.js";

export function isFavoritesStorageEvent(event, localStorage) {
  if (!event || (event.key !== FAVORITES_STORAGE_KEY && event.key !== null)) {
    return false;
  }

  return !event.storageArea || !localStorage || event.storageArea === localStorage;
}

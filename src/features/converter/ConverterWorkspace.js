import { createElement, raw } from "../../components/dom.js";
import { createFavoritesPanel } from "../favorites/FavoritesPanel.js";
import { createConverterForm } from "./ConverterForm.js";

export function createConverterWorkspace({ catalog, converter, favoriteStore }) {
  const workspace = createElement(raw`
    <div class="converter-workspace">
      <div data-slot="converter-form"></div>
      <div data-slot="favorites-panel"></div>
    </div>
  `);

  const converterForm = createConverterForm({
    catalog,
    converter,
    favoriteStore,
  });
  const favoritesPanel = createFavoritesPanel({
    catalog,
    store: favoriteStore,
    onSelect: (favorite) => {
      const loaded = converterForm.applyFavorite(favorite);
      if (loaded) {
        converterForm.focusAmount();
      }
      return loaded;
    },
  });

  const refreshFavorites = () => {
    favoritesPanel.refresh();
    converterForm.refreshFavoriteState();
  };
  const unsubscribe = favoriteStore.subscribe(refreshFavorites);

  workspace.querySelector('[data-slot="converter-form"]').append(converterForm.element);
  workspace.querySelector('[data-slot="favorites-panel"]').append(favoritesPanel.element);
  return {
    destroy() {
      unsubscribe();
    },
    element: workspace,
  };
}

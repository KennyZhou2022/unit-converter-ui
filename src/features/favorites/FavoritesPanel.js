import { createElement, html, raw } from "../../components/dom.js";
import { groupFavorites } from "./favoriteGroups.js";

export function createFavoritesPanel({ catalog, store, onSelect }) {
  const element = createElement(raw`
    <section class="panel favorites-panel" aria-labelledby="favorites-title">
      <div class="panel__header favorites-panel__header">
        <div>
          <p class="eyebrow">Saved directions</p>
          <h2 id="favorites-title">Favorites</h2>
        </div>
        <span class="favorites-count" data-slot="favorite-count">0 saved</span>
      </div>
      <div class="favorites-panel__body" data-slot="favorite-list"></div>
      <p class="visually-hidden" role="status" aria-live="polite" data-slot="favorite-status"></p>
    </section>
  `);
  const listSlot = element.querySelector('[data-slot="favorite-list"]');
  const countSlot = element.querySelector('[data-slot="favorite-count"]');
  const statusSlot = element.querySelector('[data-slot="favorite-status"]');

  function announce(message) {
    statusSlot.textContent = "";
    window.requestAnimationFrame(() => {
      statusSlot.textContent = message;
    });
  }

  function refresh() {
    const snapshot = store.getSnapshot();
    const itemCount = snapshot.items.length;
    countSlot.textContent = `${itemCount} saved`;
    listSlot.replaceChildren();

    if (snapshot.error) {
      listSlot.append(
        createElement(raw`
          <div class="favorites-notice" role="alert">
            <span aria-hidden="true">!</span>
            <p>${html`${snapshot.error}`}</p>
          </div>
        `),
      );
    }

    if (!itemCount) {
      listSlot.append(
        createElement(raw`
          <div class="favorites-empty" tabindex="-1" data-slot="favorites-empty">
            <span class="favorites-empty__mark" aria-hidden="true">
              <svg viewBox="0 0 20 20" width="20" height="20">
                <path d="M5.5 3.5h9v13l-4.5-2.8-4.5 2.8v-13Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.6"/>
              </svg>
            </span>
            <div>
              <strong>No favorites yet</strong>
              <p>Choose a measure and units above, then save this conversion.</p>
            </div>
          </div>
        `),
      );
      return;
    }

    const grouped = groupFavorites(catalog, snapshot.items);
    const content = document.createElement("div");
    content.className = "favorites-groups";
    for (const group of grouped.groups) {
      content.append(renderFavoriteGroup(group));
    }
    if (grouped.unavailable.length) {
      content.append(renderUnavailableGroup(grouped.unavailable));
    }
    listSlot.append(content);
  }

  function renderFavoriteGroup(group) {
    const section = createElement(raw`
      <section class="favorite-group" aria-labelledby="favorite-group-${html`${group.slug}`}">
        <div class="favorite-group__heading">
          <span class="favorite-group__notch" aria-hidden="true"></span>
          <h3 id="favorite-group-${html`${group.slug}`}">${html`${group.name}`}</h3>
        </div>
        <div class="favorite-group__measures"></div>
      </section>
    `);
    const measures = section.querySelector(".favorite-group__measures");
    for (const measure of group.measures) {
      const measureSection = createElement(raw`
        <section class="favorite-measure" aria-labelledby="favorite-measure-${html`${group.slug}`}-${html`${measure.slug}`}">
          <h4 id="favorite-measure-${html`${group.slug}`}-${html`${measure.slug}`}">${html`${measure.name}`}</h4>
          <ul class="favorite-list"></ul>
        </section>
      `);
      const list = measureSection.querySelector(".favorite-list");
      for (const favorite of measure.items) {
        list.append(renderFavoriteItem(favorite));
      }
      measures.append(measureSection);
    }
    return section;
  }

  function renderFavoriteItem(favorite) {
    const item = createElement(raw`
      <li class="favorite-item">
        <button class="favorite-item__load" type="button">
          <span>${html`${favorite.fromLabel}`}</span>
          <span class="favorite-item__arrow" aria-hidden="true">→</span>
          <span>${html`${favorite.toLabel}`}</span>
          <span class="favorite-item__use">Use</span>
        </button>
        <button class="favorite-item__remove" type="button" aria-label="Remove ${html`${favorite.fromLabel}`} to ${html`${favorite.toLabel}`} from favorites" title="Remove favorite">
          <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
            <path d="M4.5 5.5h11m-7.5 3v5m4-5v5M7 5.5l.7-2h4.6l.7 2m1 0-.6 11H6.6L6 5.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/>
          </svg>
        </button>
      </li>
    `);
    item.querySelector(".favorite-item__load").addEventListener("click", () => {
      const loaded = onSelect(favorite);
      if (loaded !== false) {
        announce(`Loaded ${favorite.fromLabel} to ${favorite.toLabel}.`);
      }
    });
    item.querySelector(".favorite-item__remove").addEventListener("click", (event) => {
      removeFavorite(
        favorite,
        event.currentTarget,
        `Removed ${favorite.fromLabel} to ${favorite.toLabel} from favorites.`,
      );
    });
    return item;
  }

  function removeFavorite(favorite, button, message) {
    const removeButtons = [...element.querySelectorAll(".favorite-item__remove")];
    const buttonIndex = Math.max(0, removeButtons.indexOf(button));
    const result = store.remove(favorite);
    if (!result.ok) {
      announce(result.error);
      return;
    }
    announce(message);
    const remainingButtons = [...element.querySelectorAll(".favorite-item__remove")];
    const nextTarget =
      remainingButtons[Math.min(buttonIndex, remainingButtons.length - 1)] ||
      element.querySelector('[data-slot="favorites-empty"]');
    nextTarget?.focus();
  }

  function renderUnavailableGroup(items) {
    const section = createElement(raw`
      <section class="favorite-group favorite-group--unavailable" aria-labelledby="favorite-group-unavailable">
        <div class="favorite-group__heading">
          <span class="favorite-group__notch" aria-hidden="true"></span>
          <div>
            <h3 id="favorite-group-unavailable">Unavailable</h3>
            <p>These units are no longer in the current catalog.</p>
          </div>
        </div>
        <ul class="favorite-list"></ul>
      </section>
    `);
    const list = section.querySelector(".favorite-list");
    for (const favorite of items) {
      const item = createElement(raw`
        <li class="favorite-item favorite-item--unavailable">
          <div class="favorite-item__unavailable">
            <span>${html`${favorite.fromLabel}`}</span>
            <span aria-hidden="true">→</span>
            <span>${html`${favorite.toLabel}`}</span>
          </div>
          <button class="favorite-item__remove" type="button" aria-label="Remove unavailable ${html`${favorite.fromLabel}`} to ${html`${favorite.toLabel}`} favorite" title="Remove favorite">
            <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
              <path d="M4.5 5.5h11m-7.5 3v5m4-5v5M7 5.5l.7-2h4.6l.7 2m1 0-.6 11H6.6L6 5.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/>
            </svg>
          </button>
        </li>
      `);
      item.querySelector(".favorite-item__remove").addEventListener("click", (event) => {
        removeFavorite(
          favorite,
          event.currentTarget,
          `Removed unavailable ${favorite.fromLabel} to ${favorite.toLabel} favorite.`,
        );
      });
      list.append(item);
    }
    return section;
  }

  refresh();
  return { element, refresh };
}

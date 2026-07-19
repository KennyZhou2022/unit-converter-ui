import { createElement, html, raw } from "../../components/dom.js";

export function renderCategoryGrid(catalog) {
  const grid = createElement(raw`<ul class="grid"></ul>`);
  for (const group of catalog.categories) {
    const first = group.subcategories[0];
    const card = createElement(raw`
      <li class="category-item">
        <a class="category-card" href="/convert/${group.slug}/${first.slug}" data-link>
          <div class="category-card__content">
            <strong>${html`${group.name}`}</strong>
            <span>${html`${group.subcategories.map((item) => item.name).slice(0, 3).join(" · ")}`}</span>
          </div>
          <div class="category-card__meta">
            <span>${html`${group.subcategories.length}`} measures</span>
            <span class="category-card__arrow" aria-hidden="true">→</span>
          </div>
        </a>
      </li>
    `);
    grid.append(card);
  }
  return grid;
}

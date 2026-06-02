import { createElement, html, raw } from "../../components/dom.js";

export function renderCategoryGrid(catalog) {
  const grid = createElement(raw`<div class="grid"></div>`);
  for (const group of catalog.categories) {
    const first = group.subcategories[0];
    const card = createElement(raw`
      <a class="category-card" href="/convert/${group.slug}/${first.slug}" data-link>
        <strong>${html`${group.name}`}</strong>
        <span>${html`${group.subcategories.map((item) => item.name).slice(0, 3).join(", ")}`}</span>
        <div class="chip-row">
          ${raw`${group.subcategories
            .slice(0, 4)
            .map((item) => `<span class="chip">${html`${item.name}`}</span>`)
            .join("")}`}
        </div>
      </a>
    `);
    grid.append(card);
  }
  return grid;
}

import { createElement, html, raw } from "../../components/dom.js";
import { flattenConverters } from "../converter/unitFilters.js";

export function renderCatalogPage(catalog) {
  const element = createElement(raw`
    <main class="page">
      <section>
        <h1>Supported Units</h1>
      </section>
      <section class="section">
        <div class="filters">
          <div class="field">
            <label for="catalog-query">Search</label>
            <input id="catalog-query" placeholder="kilometer, Btu, pressure..." />
          </div>
          <div class="field">
            <label for="catalog-category">Category</label>
            <select id="catalog-category"></select>
          </div>
        </div>
        <div data-slot="catalog-results"></div>
      </section>
    </main>
  `);

  const queryInput = element.querySelector("#catalog-query");
  const categorySelect = element.querySelector("#catalog-category");
  const resultsSlot = element.querySelector('[data-slot="catalog-results"]');
  const converters = flattenConverters(catalog);

  categorySelect.append(new Option("All categories", ""));
  for (const converter of converters) {
    categorySelect.append(
      new Option(`${converter.groupName} / ${converter.name}`, converter.slug),
    );
  }

  function selectedUnits() {
    const slug = categorySelect.value;
    if (!slug) {
      return catalog.allUnits;
    }
    return converters.find((converter) => converter.slug === slug)?.units || [];
  }

  function draw() {
    const query = normalize(queryInput.value);
    const matches = selectedUnits().filter(
      (unit) => !query || unit.searchText.includes(query),
    );

    if (!matches.length) {
      resultsSlot.innerHTML = '<div class="empty-state">No units match this filter.</div>';
      return;
    }

    resultsSlot.innerHTML = raw`
      <div class="unit-list">
        ${matches
          .map(
            (unit) => raw`
              <div class="unit-list__item">
                <code>${html`${unit.label}`}</code>
                <span>${html`${unit.symbol || unit.displayName}`}</span>
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  queryInput.addEventListener("input", draw);
  categorySelect.addEventListener("change", draw);
  draw();
  return element;
}

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

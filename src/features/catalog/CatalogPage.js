import { createElement, html, raw } from "../../components/dom.js";
import { flattenConverters } from "../converter/unitFilters.js";

export function renderCatalogPage(catalog) {
  const element = createElement(raw`
    <main class="page" id="main-content" tabindex="-1">
      <section>
        <p class="eyebrow">Unit index</p>
        <h1>Supported units</h1>
        <p class="lede">Search exact backend labels, common names, or symbols across the complete catalog.</p>
      </section>
      <section class="section" aria-label="Filter supported units">
        <div class="filters">
          <div class="field">
            <label for="catalog-query">Search units</label>
            <input id="catalog-query" type="search" autocomplete="off" placeholder="kilometer, Btu, pressure..." />
          </div>
          <div class="field">
            <label for="catalog-category">Measure</label>
            <select id="catalog-category"></select>
          </div>
        </div>
        <div class="results-summary" data-slot="catalog-summary" role="status" aria-live="polite"></div>
        <div data-slot="catalog-results"></div>
      </section>
    </main>
  `);

  const queryInput = element.querySelector("#catalog-query");
  const categorySelect = element.querySelector("#catalog-category");
  const summarySlot = element.querySelector('[data-slot="catalog-summary"]');
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
    summarySlot.textContent = `${matches.length} ${matches.length === 1 ? "unit" : "units"}`;

    if (!matches.length) {
      resultsSlot.innerHTML = raw`
        <div class="empty-state">
          <span class="empty-state__mark" aria-hidden="true">0</span>
          <div>
            <strong>No matching units</strong>
            <p>Try a broader name or clear the current filters.</p>
            <button class="button" type="button" data-action="clear-filters">Clear filters</button>
          </div>
        </div>
      `;
      return;
    }

    resultsSlot.innerHTML = raw`
      <ul class="unit-list">
        ${matches
          .map(
            (unit) => raw`
              <li class="unit-list__item">
                <code>${html`${unit.label}`}</code>
                <span>${html`${unit.symbol || unit.displayName}`}</span>
              </li>
            `,
          )
          .join("")}
      </ul>
    `;
  }

  queryInput.addEventListener("input", draw);
  categorySelect.addEventListener("change", draw);
  resultsSlot.addEventListener("click", (event) => {
    if (!event.target.closest('[data-action="clear-filters"]')) {
      return;
    }
    queryInput.value = "";
    categorySelect.value = "";
    draw();
    queryInput.focus();
  });
  draw();
  return element;
}

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

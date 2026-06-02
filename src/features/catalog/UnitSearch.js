import { createElement, html, raw } from "../../components/dom.js";
import { flattenConverters } from "../converter/unitFilters.js";

export function renderUnitSearch(catalog) {
  const element = createElement(raw`
    <section class="section" aria-labelledby="unit-search-title">
      <div class="section__header">
        <div>
          <h2 id="unit-search-title">Find Supported Units</h2>
          <p>Search by exact backend label, name, or symbol.</p>
        </div>
      </div>
      <div class="filters">
        <div class="field">
          <label for="home-unit-query">Search units</label>
          <input id="home-unit-query" placeholder="meter, mph, Fahrenheit..." />
        </div>
        <div class="field">
          <label for="home-unit-category">Category</label>
          <select id="home-unit-category"></select>
        </div>
      </div>
      <div data-slot="unit-results"></div>
    </section>
  `);

  const queryInput = element.querySelector("#home-unit-query");
  const categorySelect = element.querySelector("#home-unit-category");
  const resultsSlot = element.querySelector('[data-slot="unit-results"]');
  const converters = flattenConverters(catalog);

  categorySelect.append(new Option("All supported units", ""));
  for (const converter of converters) {
    categorySelect.append(
      new Option(`${converter.groupName} / ${converter.name}`, converter.slug),
    );
  }

  function units() {
    const selected = categorySelect.value;
    if (!selected) {
      return catalog.allUnits;
    }
    return converters.find((converter) => converter.slug === selected)?.units || [];
  }

  function draw() {
    const query = normalize(queryInput.value);
    const matches = units()
      .filter((unit) => !query || unit.searchText.includes(query))
      .slice(0, 24);

    if (!matches.length) {
      resultsSlot.innerHTML = '<div class="empty-state">No matching units.</div>';
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

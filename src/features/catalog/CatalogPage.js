import { createElement, html, raw } from "../../components/dom.js";
import { flattenConverters } from "../converter/unitFilters.js";

export function renderCatalogPage(catalog) {
  const element = createElement(raw`
    <main class="page" id="main-content" tabindex="-1">
      <section>
        <p class="eyebrow">Unit index</p>
        <h1>Supported units</h1>
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
  const categoryLabelsByUnitId = buildUnitCategoryLabels(catalog);

  categorySelect.append(new Option("All categories", ""));
  for (const converter of converters) {
    categorySelect.append(
      new Option(`${converter.groupName} / ${converter.name}`, converter.slug),
    );
  }
  if (catalog.unmappedUnits.length) {
    categorySelect.append(
      new Option("Uncategorized", "__uncategorized__"),
    );
  }

  function selectedRows() {
    const slug = categorySelect.value;
    if (!slug) {
      return catalog.allUnits.map((unit) => ({
        category:
          categoryLabelsByUnitId.get(unit.unitId)?.join("; ") || "Uncategorized",
        unit,
      }));
    }
    if (slug === "__uncategorized__") {
      return catalog.unmappedUnits.map((unit) => ({
        category: "Uncategorized",
        unit,
      }));
    }
    const converter = converters.find((item) => item.slug === slug);
    if (!converter) {
      return [];
    }
    const category = `${converter.groupName} / ${converter.name}`;
    return converter.units.map((unit) => ({ category, unit }));
  }

  function draw() {
    const query = normalize(queryInput.value);
    const matches = sortCatalogRows(
      selectedRows().filter(
        ({ category, unit }) =>
          !query ||
          unit.searchText.includes(query) ||
          normalize(category).includes(query),
      ),
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
      <table class="unit-table">
        <caption class="visually-hidden">Supported units ordered by category and then unit name</caption>
        <colgroup>
          <col class="unit-table__category-column" />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" aria-sort="ascending">Category</th>
            <th scope="col">Unit</th>
          </tr>
        </thead>
        <tbody>
        ${matches
          .map(
            ({ category, unit }) => raw`
              <tr>
                <td class="unit-table__category">${html`${category}`}</td>
                <td class="unit-table__name">${html`${unit.displayName}`}</td>
              </tr>
            `,
          )
          .join("")}
        </tbody>
      </table>
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

export function buildUnitCategoryLabels(catalog) {
  const labelsByUnitId = new Map();

  for (const converter of flattenConverters(catalog)) {
    const label = `${converter.groupName} / ${converter.name}`;
    for (const unit of converter.units) {
      const labels = labelsByUnitId.get(unit.unitId) || [];
      if (!labels.includes(label)) {
        labels.push(label);
        labelsByUnitId.set(unit.unitId, labels);
      }
    }
  }

  for (const labels of labelsByUnitId.values()) {
    labels.sort(compareAlphabetically);
  }

  return labelsByUnitId;
}

export function sortCatalogRows(rows) {
  return [...rows].sort(
    (left, right) =>
      compareAlphabetically(left.category, right.category) ||
      compareAlphabetically(left.unit.displayName, right.unit.displayName) ||
      compareText(left.unit.unitId, right.unit.unitId),
  );
}

function compareAlphabetically(left, right) {
  const leftParts = alphabeticalParts(left);
  const rightParts = alphabeticalParts(right);

  for (let index = 0; index < leftParts.length; index += 1) {
    const comparison = compareText(leftParts[index], rightParts[index]);
    if (comparison) {
      return comparison;
    }
  }
  return 0;
}

function alphabeticalParts(value) {
  const folded = value.normalize("NFKD").toLowerCase();
  const unaccented = folded.replace(/\p{M}/gu, "");
  return [
    unaccented.replace(/[^a-z0-9]+/g, " ").trim(),
    unaccented,
    value,
  ];
}

function compareText(left, right) {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

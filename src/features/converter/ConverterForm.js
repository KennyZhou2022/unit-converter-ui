import { createElement, html, raw, setOptions } from "../../components/dom.js";
import { unitDisplayLabel } from "../favorites/favoriteGroups.js";
import { unitConverterApi } from "../../services/api/unitConverterApi.js";
import {
  convertersForGroup,
  getDefaultPair,
  isNumericInput,
} from "./unitFilters.js";
import { renderResultPanel } from "./ResultPanel.js";
import { createConversionRequestGate } from "./conversionRequestGate.js";

export function createConverterForm({
  catalog,
  converter,
  favoriteStore,
  onFavoritesChange,
}) {
  const element = createElement(raw`
    <section class="panel converter-panel" aria-labelledby="converter-title">
      <div class="panel__header">
        <h1 id="converter-title">${html`${converter.name}`} converter</h1>
        <button class="button button--favorite" type="button" data-action="favorite" aria-pressed="false">
          <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
            <path d="M5.5 3.5h9v13l-4.5-2.8-4.5 2.8v-13Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.6"/>
          </svg>
          <span data-slot="favorite-label">Save favorite</span>
        </button>
      </div>
      <p class="visually-hidden" role="status" aria-live="polite" data-slot="favorite-feedback"></p>
      <div class="panel__body">
        <form class="converter-form">
          <div class="converter-form__measure">
            <div class="field">
              <label for="converter-group">Category</label>
              <select id="converter-group" name="converterGroup"></select>
            </div>
            <div class="field">
              <label for="converter-kind">Measure</label>
              <select id="converter-kind" name="converterKind"></select>
            </div>
          </div>
          <div class="unit-row" aria-label="Conversion direction">
            <div class="field">
              <label for="from-unit">From</label>
              <select id="from-unit" name="fromUnit"></select>
            </div>
            <div class="swap-control">
              <span class="swap-control__rail" aria-hidden="true"></span>
              <button class="button button--swap" type="button" data-action="swap" aria-label="Swap from and to units">
                <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
                  <path d="M3 6h12m0 0-3-3m3 3-3 3M17 14H5m0 0 3-3m-3 3 3 3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/>
                </svg>
                <span>Swap</span>
              </button>
            </div>
            <div class="field">
              <label for="to-unit">To</label>
              <select id="to-unit" name="toUnit"></select>
            </div>
          </div>
          <div class="amount-row">
            <div class="field">
              <label for="converter-value">Amount</label>
              <input id="converter-value" name="value" inputmode="decimal" autocomplete="off" spellcheck="false" aria-describedby="converter-value-hint" value="1" />
              <span class="field__hint" id="converter-value-hint">Decimal or scientific notation</span>
            </div>
          </div>
          <div data-slot="result"></div>
        </form>
      </div>
    </section>
  `);

  const groupSelect = element.querySelector("#converter-group");
  const converterSelect = element.querySelector("#converter-kind");
  const converterTitle = element.querySelector("#converter-title");
  const valueInput = element.querySelector("#converter-value");
  const fromSelect = element.querySelector("#from-unit");
  const toSelect = element.querySelector("#to-unit");
  const resultSlot = element.querySelector('[data-slot="result"]');
  const swapButton = element.querySelector('[data-action="swap"]');
  const favoriteButton = element.querySelector('[data-action="favorite"]');
  const favoriteLabel = element.querySelector('[data-slot="favorite-label"]');
  const favoriteFeedback = element.querySelector('[data-slot="favorite-feedback"]');

  const state = {
    converter,
    groupSlug: converter.groupSlug,
    value: "1",
    ...getDefaultPair(converter),
    result: "",
    error: "",
    loading: false,
    timer: 0,
  };
  const conversionGate = createConversionRequestGate();

  setOptions(
    groupSelect,
    catalog.categories.map((group) => ({
      value: group.slug,
      label: group.name,
    })),
    state.groupSlug,
  );

  function drawMeasures() {
    const converters = convertersForGroup(catalog, state.groupSlug);
    setOptions(
      converterSelect,
      converters.map((item) => ({
        value: item.slug,
        label: item.name,
      })),
      state.converter.slug,
    );
    return converters;
  }

  function selectConverter(next, preferredPair = getDefaultPair(next)) {
    window.clearTimeout(state.timer);
    const availableUnits = new Set(next.units.map((unit) => unit.label));
    const pair =
      availableUnits.has(preferredPair.fromUnit) &&
      availableUnits.has(preferredPair.toUnit)
        ? preferredPair
        : getDefaultPair(next);
    state.converter = next;
    state.groupSlug = next.groupSlug;
    Object.assign(state, pair);
    state.result = "";
    state.error = "";
    state.loading = false;
    groupSelect.value = state.groupSlug;
    converterTitle.textContent = `${next.name} converter`;
    drawMeasures();
    drawUnits();
    syncFavoriteButton();
    drawResult();
    scheduleConvert(0);
  }

  drawMeasures();

  groupSelect.addEventListener("change", () => {
    state.groupSlug = groupSelect.value;
    const next = convertersForGroup(catalog, state.groupSlug)[0];
    if (next) {
      selectConverter(next);
    }
  });

  converterSelect.addEventListener("change", () => {
    const next = convertersForGroup(catalog, state.groupSlug).find(
      (item) => item.slug === converterSelect.value,
    );
    if (next) {
      selectConverter(next);
    }
  });

  function drawUnits() {
    const unitOptions = state.converter.units.map((unit) => ({
      value: unit.label,
      label: unit.symbol
        ? `${unit.displayName} (${unit.symbol})`
        : unit.displayName,
    }));
    setOptions(fromSelect, unitOptions, state.fromUnit);
    setOptions(toSelect, unitOptions, state.toUnit);
  }

  function currentFavorite() {
    return {
      groupSlug: state.groupSlug,
      converterSlug: state.converter.slug,
      fromUnit: state.fromUnit,
      toUnit: state.toUnit,
    };
  }

  function favoriteDescription() {
    const units = new Map(state.converter.units.map((unit) => [unit.label, unit]));
    const fromUnit = units.get(state.fromUnit);
    const toUnit = units.get(state.toUnit);
    const fromLabel = fromUnit ? unitDisplayLabel(fromUnit) : state.fromUnit;
    const toLabel = toUnit ? unitDisplayLabel(toUnit) : state.toUnit;
    return `${fromLabel} to ${toLabel}`;
  }

  function syncFavoriteButton() {
    const saved = Boolean(favoriteStore?.has(currentFavorite()));
    favoriteButton.setAttribute("aria-pressed", saved ? "true" : "false");
    favoriteButton.setAttribute(
      "aria-label",
      saved
        ? `Remove ${favoriteDescription()} from favorites`
        : `Save ${favoriteDescription()} to favorites`,
    );
    favoriteLabel.textContent = saved ? "Saved" : "Save favorite";
  }

  function announceFavorite(message) {
    favoriteFeedback.textContent = "";
    window.requestAnimationFrame(() => {
      favoriteFeedback.textContent = message;
    });
  }

  function drawResult() {
    resultSlot.replaceChildren(
      renderResultPanel({
        value: state.value,
        result: state.result,
        error: state.error,
        loading: state.loading,
        fromUnit: state.fromUnit,
        toUnit: state.toUnit,
      }),
    );
  }

  async function runConvert(request) {
    if (!conversionGate.isCurrent(request)) {
      return;
    }
    window.clearTimeout(state.timer);
    const value = state.value.trim();
    if (!isNumericInput(value)) {
      valueInput.setAttribute("aria-invalid", "true");
      state.result = "";
      state.error = "Enter a decimal or scientific-notation number.";
      state.loading = false;
      drawResult();
      return;
    }

    valueInput.removeAttribute("aria-invalid");
    state.loading = true;
    state.error = "";
    drawResult();

    try {
      const response = await unitConverterApi.convert({
        value,
        fromUnit: state.fromUnit,
        toUnit: state.toUnit,
      });
      if (!conversionGate.isCurrent(request)) {
        return;
      }
      state.result = response.result;
      state.error = "";
    } catch (error) {
      if (!conversionGate.isCurrent(request)) {
        return;
      }
      state.result = "";
      state.error = `${error.code || "CONVERSION_FAILED"}: ${error.message}`;
    }
    state.loading = false;
    drawResult();
  }

  function scheduleConvert(delay = 250) {
    window.clearTimeout(state.timer);
    const request = conversionGate.next();
    state.timer = window.setTimeout(() => runConvert(request), delay);
  }

  valueInput.addEventListener("input", () => {
    state.value = valueInput.value;
    scheduleConvert();
  });

  fromSelect.addEventListener("change", () => {
    state.fromUnit = fromSelect.value;
    syncFavoriteButton();
    scheduleConvert(0);
  });

  toSelect.addEventListener("change", () => {
    state.toUnit = toSelect.value;
    syncFavoriteButton();
    scheduleConvert(0);
  });

  swapButton.addEventListener("click", () => {
    const previousFrom = state.fromUnit;
    state.fromUnit = state.toUnit;
    state.toUnit = previousFrom;
    drawUnits();
    syncFavoriteButton();
    scheduleConvert(0);
  });

  favoriteButton.addEventListener("click", () => {
    if (!favoriteStore) {
      announceFavorite("Favorites are unavailable in this browser.");
      return;
    }
    const description = favoriteDescription();
    const result = favoriteStore.toggle(currentFavorite());
    syncFavoriteButton();
    onFavoritesChange?.();
    announceFavorite(
      result.ok
        ? result.saved
          ? `Saved ${description} to favorites.`
          : `Removed ${description} from favorites.`
        : result.error,
    );
  });

  function applyFavorite(favorite) {
    const group = catalog.categories.find(
      (category) => category.slug === favorite.groupSlug,
    );
    if (!group) {
      return false;
    }
    const next = convertersForGroup(catalog, group.slug).find(
      (item) => item.slug === favorite.converterSlug,
    );
    if (!next) {
      return false;
    }
    const units = new Set(next.units.map((unit) => unit.label));
    if (!units.has(favorite.fromUnit) || !units.has(favorite.toUnit)) {
      return false;
    }
    selectConverter(next, {
      fromUnit: favorite.fromUnit,
      toUnit: favorite.toUnit,
    });
    return true;
  }

  drawUnits();
  syncFavoriteButton();
  drawResult();
  scheduleConvert(0);

  return {
    applyFavorite,
    element,
    focusAmount() {
      valueInput.focus();
    },
    refreshFavoriteState: syncFavoriteButton,
  };
}

export function renderConverterForm(options) {
  return createConverterForm(options).element;
}

import { createElement, html, raw, setOptions } from "../../components/dom.js";
import { unitConverterApi } from "../../services/api/unitConverterApi.js";
import {
  compatibleUnitsForConverter,
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

  const initialPair = getDefaultPair(converter);
  const state = {
    converter,
    value: "1",
    fromUnitId: initialPair.fromUnit,
    toUnitId: initialPair.toUnit,
    compatibleUnits: [],
    compatibleLoading: true,
    result: "",
    error: "",
    loading: false,
    timer: 0,
  };
  const conversionGate = createConversionRequestGate();
  let compatibilityRequest = 0;

  setOptions(
    groupSelect,
    catalog.categories.map((group) => ({
      value: group.slug,
      label: group.name,
    })),
    state.converter.groupSlug,
  );

  function drawMeasures() {
    const converters = convertersForGroup(catalog, state.converter.groupSlug);
    setOptions(
      converterSelect,
      converters.map((item) => ({
        value: item.slug,
        label: item.name,
      })),
      state.converter.slug,
    );
  }

  function selectConverter(next, preferredPair = getDefaultPair(next)) {
    const availableUnits = new Set(next.units.map((unit) => unit.unitId));
    const pair =
      availableUnits.has(preferredPair.fromUnit) &&
      availableUnits.has(preferredPair.toUnit)
        ? preferredPair
        : getDefaultPair(next);
    state.converter = next;
    state.fromUnitId = pair.fromUnit;
    state.toUnitId = pair.toUnit;
    groupSelect.value = next.groupSlug;
    converterTitle.textContent = `${next.name} converter`;
    drawMeasures();
    void loadCompatibleUnits(pair.toUnit);
  }

  drawMeasures();

  groupSelect.addEventListener("change", () => {
    const next = convertersForGroup(catalog, groupSelect.value)[0];
    if (next) {
      selectConverter(next);
    }
  });

  converterSelect.addEventListener("change", () => {
    const next = convertersForGroup(catalog, state.converter.groupSlug).find(
      (item) => item.slug === converterSelect.value,
    );
    if (next) {
      selectConverter(next);
    }
  });

  function drawUnits() {
    const fromOptions = state.converter.units.map((unit) => ({
      value: unit.unitId,
      label: unit.displayName,
    }));
    setOptions(fromSelect, fromOptions, state.fromUnitId);

    if (state.compatibleLoading) {
      setOptions(
        toSelect,
        [{ value: "", label: "Loading compatible units..." }],
        "",
      );
    } else if (!state.compatibleUnits.length) {
      setOptions(
        toSelect,
        [{ value: "", label: "No compatible units available" }],
        "",
      );
    } else {
      setOptions(
        toSelect,
        state.compatibleUnits.map((unit) => ({
          value: unit.unitId,
          label: unit.displayName,
        })),
        state.toUnitId,
      );
    }
    toSelect.disabled = state.compatibleLoading || !state.compatibleUnits.length;
    toSelect.setAttribute("aria-busy", state.compatibleLoading ? "true" : "false");
    swapButton.disabled = state.compatibleLoading || !state.toUnitId;
  }

  function currentFavorite() {
    return {
      groupSlug: state.converter.groupSlug,
      converterSlug: state.converter.slug,
      fromUnitId: state.fromUnitId,
      toUnitId: state.toUnitId,
    };
  }

  function favoriteDescription() {
    const fromUnit = unitForId(state.fromUnitId);
    const toUnit = unitForId(state.toUnitId);
    const fromLabel = fromUnit?.displayName || state.fromUnitId;
    const toLabel = toUnit?.displayName || state.toUnitId;
    return `${fromLabel} to ${toLabel}`;
  }

  function unitForId(unitId) {
    return state.converter.units.find((unit) => unit.unitId === unitId);
  }

  function syncFavoriteButton() {
    const canSave = Boolean(
      state.fromUnitId && state.toUnitId && !state.compatibleLoading,
    );
    const saved = canSave && favoriteStore.has(currentFavorite());
    favoriteButton.disabled = !canSave;
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
        fromUnit: unitForId(state.fromUnitId)?.displayName || state.fromUnitId,
        toUnit: unitForId(state.toUnitId)?.displayName || state.toUnitId,
      }),
    );
  }

  async function loadCompatibleUnits(preferredToUnitId = state.toUnitId) {
    const request = ++compatibilityRequest;
    window.clearTimeout(state.timer);
    conversionGate.next();
    state.compatibleLoading = true;
    state.compatibleUnits = [];
    state.result = "";
    state.error = "";
    state.loading = true;
    drawUnits();
    syncFavoriteButton();
    drawResult();

    try {
      const response = await unitConverterApi.compatibleUnits(state.fromUnitId);
      if (request !== compatibilityRequest) {
        return;
      }
      state.compatibleUnits = compatibleUnitsForConverter(
        state.converter,
        response.units,
      );
      const compatibleIds = new Set(
        state.compatibleUnits.map((unit) => unit.unitId),
      );
      const fallback =
        state.compatibleUnits.find((unit) => unit.unitId !== state.fromUnitId)
        || state.compatibleUnits[0];
      state.toUnitId = compatibleIds.has(preferredToUnitId)
        ? preferredToUnitId
        : fallback?.unitId || "";
      state.compatibleLoading = false;
      state.loading = false;
      if (!state.toUnitId) {
        state.error = "NO_COMPATIBLE_UNITS: No compatible target unit is available.";
      }
      drawUnits();
      syncFavoriteButton();
      drawResult();
      if (state.toUnitId) {
        scheduleConvert(0);
      }
    } catch (error) {
      if (request !== compatibilityRequest) {
        return;
      }
      state.compatibleUnits = [];
      state.compatibleLoading = false;
      state.toUnitId = "";
      state.loading = false;
      state.error = `${error.code || "COMPATIBILITY_FAILED"}: ${error.message}`;
      drawUnits();
      syncFavoriteButton();
      drawResult();
    }
  }

  async function runConvert(request) {
    if (!conversionGate.isCurrent(request)) {
      return;
    }
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
        fromUnit: state.fromUnitId,
        toUnit: state.toUnitId,
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
    if (state.compatibleLoading || !state.fromUnitId || !state.toUnitId) {
      return;
    }
    window.clearTimeout(state.timer);
    const request = conversionGate.next();
    state.timer = window.setTimeout(() => runConvert(request), delay);
  }

  valueInput.addEventListener("input", () => {
    state.value = valueInput.value;
    scheduleConvert();
  });

  fromSelect.addEventListener("change", () => {
    state.fromUnitId = fromSelect.value;
    void loadCompatibleUnits(state.toUnitId);
  });

  toSelect.addEventListener("change", () => {
    state.toUnitId = toSelect.value;
    syncFavoriteButton();
    scheduleConvert(0);
  });

  swapButton.addEventListener("click", () => {
    const previousFrom = state.fromUnitId;
    state.fromUnitId = state.toUnitId;
    state.toUnitId = previousFrom;
    void loadCompatibleUnits(previousFrom);
  });

  favoriteButton.addEventListener("click", () => {
    const description = favoriteDescription();
    const result = favoriteStore.toggle(currentFavorite());
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
    const units = new Set(next.units.map((unit) => unit.unitId));
    if (!units.has(favorite.fromUnitId) || !units.has(favorite.toUnitId)) {
      return false;
    }
    selectConverter(next, {
      fromUnit: favorite.fromUnitId,
      toUnit: favorite.toUnitId,
    });
    return true;
  }

  void loadCompatibleUnits(state.toUnitId);

  return {
    applyFavorite,
    element,
    focusAmount() {
      valueInput.focus();
    },
    refreshFavoriteState: syncFavoriteButton,
  };
}

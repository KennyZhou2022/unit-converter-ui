import { createElement, raw, setOptions } from "../../components/dom.js";
import { unitConverterApi } from "../../services/api/unitConverterApi.js";
import {
  flattenConverters,
  getDefaultPair,
  isNumericInput,
} from "./unitFilters.js";
import { renderResultPanel } from "./ResultPanel.js";

export function renderConverterForm({
  catalog,
  converter,
  onNavigate,
  showAllCategories = false,
}) {
  const allConverters = flattenConverters(catalog);
  const converters = showAllCategories
    ? allConverters
    : allConverters.filter((item) => item.groupSlug === converter.groupSlug);
  const element = createElement(raw`
    <section class="panel" aria-labelledby="converter-title">
      <div class="panel__header">
        <h2 id="converter-title">${converter.name}</h2>
      </div>
      <div class="panel__body">
        <form class="converter-form">
          <div class="field">
            <label for="converter-kind">Category</label>
            <select id="converter-kind" name="converterKind"></select>
          </div>
          <div class="field">
            <label for="converter-value">Value</label>
            <input id="converter-value" name="value" inputmode="decimal" value="1" />
          </div>
          <div class="unit-row">
            <div class="field">
              <label for="from-unit">From</label>
              <select id="from-unit" name="fromUnit"></select>
            </div>
            <button class="button" type="button" data-action="swap" aria-label="Swap units">Swap</button>
            <div class="field">
              <label for="to-unit">To</label>
              <select id="to-unit" name="toUnit"></select>
            </div>
          </div>
          <div data-slot="result"></div>
        </form>
      </div>
    </section>
  `);

  const converterSelect = element.querySelector("#converter-kind");
  const valueInput = element.querySelector("#converter-value");
  const fromSelect = element.querySelector("#from-unit");
  const toSelect = element.querySelector("#to-unit");
  const resultSlot = element.querySelector('[data-slot="result"]');
  const swapButton = element.querySelector('[data-action="swap"]');

  const state = {
    converter,
    value: "1",
    ...getDefaultPair(converter),
    result: "",
    error: "",
    loading: false,
    timer: 0,
  };

  setOptions(
    converterSelect,
    converters.map((item) => ({
      value: item.route,
      label: `${item.groupName} / ${item.name}`,
    })),
    converter.route,
  );

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

  function drawResult() {
    resultSlot.replaceChildren(
      renderResultPanel({
        result: state.result,
        error: state.error,
        loading: state.loading,
        fromUnit: state.fromUnit,
        toUnit: state.toUnit,
      }),
    );
  }

  async function runConvert() {
    window.clearTimeout(state.timer);
    const value = state.value.trim();
    if (!isNumericInput(value)) {
      state.result = "";
      state.error = "Enter a decimal or scientific-notation number.";
      state.loading = false;
      drawResult();
      return;
    }

    state.loading = true;
    state.error = "";
    drawResult();

    try {
      const response = await unitConverterApi.convert({
        value,
        fromUnit: state.fromUnit,
        toUnit: state.toUnit,
      });
      state.result = response.result;
      state.error = "";
    } catch (error) {
      state.result = "";
      state.error = `${error.code || "CONVERSION_FAILED"}: ${error.message}`;
    } finally {
      state.loading = false;
      drawResult();
    }
  }

  function scheduleConvert(delay = 250) {
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(runConvert, delay);
  }

  converterSelect.addEventListener("change", () => {
    const next = converters.find((item) => item.route === converterSelect.value);
    if (!next) {
      return;
    }
    onNavigate(next.route);
  });

  valueInput.addEventListener("input", () => {
    state.value = valueInput.value;
    scheduleConvert();
  });

  fromSelect.addEventListener("change", () => {
    state.fromUnit = fromSelect.value;
    scheduleConvert(0);
  });

  toSelect.addEventListener("change", () => {
    state.toUnit = toSelect.value;
    scheduleConvert(0);
  });

  swapButton.addEventListener("click", () => {
    const previousFrom = state.fromUnit;
    state.fromUnit = state.toUnit;
    state.toUnit = previousFrom;
    drawUnits();
    scheduleConvert(0);
  });

  drawUnits();
  drawResult();
  scheduleConvert(0);

  return element;
}

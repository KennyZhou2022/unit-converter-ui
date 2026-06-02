import { createElement, html, raw } from "../../components/dom.js";
import { compactNumberString } from "./unitFilters.js";

export function renderResultPanel({ result, error, loading, fromUnit, toUnit }) {
  const content = error
    ? raw`<p class="error" role="alert">${html`${error}`}</p>`
    : raw`
        <div class="result__label">${loading ? "Converting" : "Result"}</div>
        <div class="result__value" aria-live="polite">
          ${html`${loading ? "..." : compactNumberString(result || "Choose units to convert")}`}
        </div>
        <div class="result__meta">${html`${fromUnit || "From unit"} -> ${toUnit || "To unit"}`}</div>
      `;

  return createElement(raw`<div class="result">${content}</div>`);
}


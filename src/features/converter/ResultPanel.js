import { createElement, html, raw } from "../../components/dom.js";
import { compactNumberString } from "./unitFilters.js";

export function renderResultPanel({ value, result, error, loading, fromUnit, toUnit }) {
  const content = error
    ? raw`
        <div class="result__error-mark" aria-hidden="true">!</div>
        <div>
          <div class="result__label">Conversion unavailable</div>
          <p class="error">${html`${error}`}</p>
          <p class="result__meta">Check the amount and try again.</p>
        </div>
      `
    : loading
      ? raw`
          <div class="result__label">Converting</div>
          <div class="result__skeleton" aria-hidden="true"><span></span></div>
          <span class="visually-hidden">Calculating the conversion result.</span>
        `
      : raw`
          <div class="result__label">result</div>
          <output class="result__value">${html`${compactNumberString(result || "Ready")}`}</output>
          <div class="result__meta">
            <span>${html`${value || "Amount"}`} ${html`${fromUnit || "from unit"}`}</span>
            <span class="result__direction" aria-hidden="true">→</span>
            <span>${html`${toUnit || "to unit"}`}</span>
          </div>
        `;

  return createElement(
    raw`<div class="result ${error ? "result--error" : ""}" role="${error ? "alert" : "status"}" aria-live="${error ? "assertive" : "polite"}" aria-busy="${loading ? "true" : "false"}">${content}</div>`,
  );
}

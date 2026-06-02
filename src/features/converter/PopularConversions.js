import { createElement, raw } from "../../components/dom.js";
import { unitsForPrimaryComponent } from "./unitFilters.js";

export function renderPopularConversions(converter, onSelect) {
  const units = unitsForPrimaryComponent(converter).slice(0, 5);
  const pairs = [];
  for (let index = 0; index < units.length - 1; index += 1) {
    pairs.push([units[index], units[index + 1]]);
  }

  const element = createElement(raw`<div class="shortcut-list"></div>`);
  for (const [fromUnit, toUnit] of pairs.slice(0, 4)) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${shortLabel(fromUnit)} -> ${shortLabel(toUnit)}`;
    button.addEventListener("click", () => onSelect(fromUnit, toUnit));
    element.append(button);
  }
  return element;
}

function shortLabel(label) {
  return label.replace(/\s*\[[^\]]+\]\s*$/, "").slice(0, 36);
}


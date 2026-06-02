export function html(strings, ...values) {
  return strings.reduce((result, string, index) => {
    return result + string + (index < values.length ? escapeHtml(values[index]) : "");
  }, "");
}

export function raw(strings, ...values) {
  return strings.reduce((result, string, index) => {
    return result + string + (index < values.length ? values[index] : "");
  }, "");
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function createElement(markup) {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}

export function setOptions(select, options, selectedValue) {
  select.replaceChildren();
  for (const option of options) {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    element.selected = option.value === selectedValue;
    select.append(element);
  }
}


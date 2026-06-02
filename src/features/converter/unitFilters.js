export function flattenConverters(catalog) {
  return catalog.categories.flatMap((category) =>
    category.subcategories.map((subcategory) => ({
      ...subcategory,
      groupName: category.name,
      groupSlug: category.slug,
      route: `/convert/${category.slug}/${subcategory.slug}`,
    })),
  );
}

export function findConverter(catalog, groupSlug, converterSlug) {
  const converters = flattenConverters(catalog);
  return (
    converters.find(
      (converter) =>
        converter.groupSlug === groupSlug && converter.slug === converterSlug,
    ) || converters[0]
  );
}

export function firstConverter(catalog) {
  return flattenConverters(catalog)[0];
}

export function unitsForPrimaryComponent(converter) {
  const primary = converter.connectedComponents?.[0]?.units;
  if (!primary?.length) {
    return converter.units.map((unit) => unit.label);
  }
  return primary;
}

export function getDefaultPair(converter) {
  const fromUnit = converter.defaultFromUnit || converter.units[0]?.label || "";
  const toUnit = converter.defaultToUnit || converter.units[1]?.label || fromUnit;
  return { fromUnit, toUnit };
}

export function compactNumberString(value) {
  if (!value || !value.includes(".")) {
    return value;
  }
  return value.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

export function isNumericInput(value) {
  return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim());
}


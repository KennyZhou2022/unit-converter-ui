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

export function convertersForGroup(catalog, groupSlug) {
  const group =
    catalog.categories.find((category) => category.slug === groupSlug) ||
    catalog.categories[0];
  if (!group) {
    return [];
  }
  return group.subcategories.map((subcategory) => ({
    ...subcategory,
    groupName: group.name,
    groupSlug: group.slug,
    route: `/convert/${group.slug}/${subcategory.slug}`,
  }));
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

export function getDefaultPair(converter) {
  const fromUnit = converter.defaultFromUnit || converter.units[0]?.unitId || "";
  const toUnit = converter.defaultToUnit || converter.units[1]?.unitId || fromUnit;
  return { fromUnit, toUnit };
}

export function compatibleUnitsForConverter(converter, compatibleUnits) {
  const compatibleIds = new Set(
    compatibleUnits.map((unit) => unit.unitId),
  );
  return converter.units.filter((unit) => compatibleIds.has(unit.unitId));
}

export function compactNumberString(value) {
  if (!value) {
    return value;
  }

  const parts = value.match(/^([+-]?)(\d+)(?:\.(\d*))?([eE][+-]?\d+)?$/);
  if (!parts) {
    return value;
  }

  const [, sign, initialInteger, initialFraction = "", exponent = ""] = parts;
  const maximumFractionDigits = 10;
  let integer = initialInteger;
  let fraction = initialFraction.slice(0, maximumFractionDigits);

  if (
    initialFraction.length > maximumFractionDigits &&
    initialFraction[maximumFractionDigits] >= "5"
  ) {
    const digits = [...`${integer}${fraction}`];
    let index = digits.length - 1;
    while (index >= 0 && digits[index] === "9") {
      digits[index] = "0";
      index -= 1;
    }
    if (index < 0) {
      digits.unshift("1");
    } else {
      digits[index] = String(Number(digits[index]) + 1);
    }

    const integerLength = digits.length - maximumFractionDigits;
    integer = digits.slice(0, integerLength).join("");
    fraction = digits.slice(integerLength).join("");
  }

  fraction = fraction.replace(/0+$/, "");
  const isZero = /^0+$/.test(integer) && !fraction;
  return `${isZero ? "" : sign}${integer}${fraction ? `.${fraction}` : ""}${exponent}`;
}

export function isNumericInput(value) {
  return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim());
}

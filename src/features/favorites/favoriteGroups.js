export function groupFavorites(catalog, favorites) {
  const entries = favorites.map((favorite, index) => ({ favorite, index }));
  const unresolved = new Set(entries.map(({ index }) => index));
  const groups = [];

  for (const category of catalog.categories || []) {
    const measures = [];
    for (const converter of category.subcategories || []) {
      const units = new Map(
        (converter.units || []).map((unit) => [unit.label, unit]),
      );
      const items = [];
      for (const entry of entries) {
        const { favorite, index } = entry;
        if (
          favorite.groupSlug !== category.slug ||
          favorite.converterSlug !== converter.slug
        ) {
          continue;
        }

        const fromUnit = units.get(favorite.fromUnit);
        const toUnit = units.get(favorite.toUnit);
        if (!fromUnit || !toUnit) {
          continue;
        }

        unresolved.delete(index);
        items.push({
          ...favorite,
          fromLabel: unitDisplayLabel(fromUnit),
          toLabel: unitDisplayLabel(toUnit),
        });
      }

      if (items.length) {
        measures.push({
          name: converter.name,
          slug: converter.slug,
          items,
        });
      }
    }

    if (measures.length) {
      groups.push({
        name: category.name,
        slug: category.slug,
        measures,
      });
    }
  }

  return {
    groups,
    unavailable: entries
      .filter(({ index }) => unresolved.has(index))
      .map(({ favorite }) => favorite),
  };
}

export function unitDisplayLabel(unit) {
  return unit.symbol ? `${unit.displayName} (${unit.symbol})` : unit.displayName;
}

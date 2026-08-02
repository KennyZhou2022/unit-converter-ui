export function groupFavorites(catalog, favorites) {
  const entries = favorites.map((favorite, index) => ({ favorite, index }));
  const unresolved = new Set(entries.map(({ index }) => index));
  const groups = [];
  const allUnits = new Map(
    catalog.allUnits.map((unit) => [unit.unitId, unit]),
  );

  for (const category of catalog.categories) {
    const measures = [];
    for (const converter of category.subcategories) {
      const units = new Map(
        converter.units.map((unit) => [unit.unitId, unit]),
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

        const fromUnit = units.get(favorite.fromUnitId);
        const toUnit = units.get(favorite.toUnitId);
        if (!fromUnit || !toUnit) {
          continue;
        }

        unresolved.delete(index);
        items.push({
          ...favorite,
          fromLabel: fromUnit.displayName,
          toLabel: toUnit.displayName,
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
      .map(({ favorite }) => ({
        ...favorite,
        fromLabel: allUnits.get(favorite.fromUnitId)?.displayName
          || favorite.fromUnitId,
        toLabel: allUnits.get(favorite.toUnitId)?.displayName
          || favorite.toUnitId,
      })),
  };
}

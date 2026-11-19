// Metric families (#78): the map groups its metrics into families (spec/build_map.py, METRIC_FAMILIES) so the
// metric tier, about 80 nodes, reads in groups. The grouping changes no count and no pathway.
import { map } from "../map";
import type { Tier } from "./filter";

/** A metric's family; other tiers have none. */
export function familyOf(tier: Tier, value: string): string | undefined {
  return tier === "metric" ? map.metrics[value]?.family : undefined;
}

export interface FamilyGroup<T> {
  /** The family's name, or undefined for a tier that isn't grouped. */
  family: string | undefined;
  items: T[];
}

/**
 * A tier's items in groups: for the metric tier, one group per family present, in the map's family order, each
 * keeping the items' own order; for any other tier, one group with every item.
 */
export function byFamily<T>(tier: Tier, items: readonly T[], value: (item: T) => string): FamilyGroup<T>[] {
  if (tier !== "metric") return [{ family: undefined, items: [...items] }];
  const groups = map.metric_families.map((family): FamilyGroup<T> => ({ family, items: [] }));
  const index = new Map(map.metric_families.map((f, i) => [f, i]));
  const other: T[] = [];
  for (const item of items) {
    const i = index.get(familyOf(tier, value(item)) ?? "");
    if (i === undefined) other.push(item);
    else groups[i]?.items.push(item);
  }
  const out = groups.filter((g) => g.items.length > 0);
  return other.length > 0 ? [...out, { family: undefined, items: other }] : out;
}

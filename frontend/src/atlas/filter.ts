// The Atlas's filtering logic, shared by the 2D view (#4) and the 3D view (#5).
//
// A selection fixes at most one value per tier. The pathways shown are those that
// match every selected value. Each tier's nodes are counted as a facet: a node's
// count is how many pathways would match if it were chosen in place of that tier's
// current choice, so the counts never depend on the order the tiers are drawn in.

import { STATUSES, type MapData, type Pathway, type Status } from "../types/map";

export const TIERS = ["framework", "group", "datatype", "outcome", "model", "method", "metric"] as const;
export type Tier = (typeof TIERS)[number];

/** The order of the last three tiers: CLAUDE.md's default, and its alternative. */
export type TierOrder = "model-method-metric" | "metric-method-model";

export function tiersInOrder(order: TierOrder): Tier[] {
  const last: Tier[] = order === "model-method-metric" ? ["model", "method", "metric"] : ["metric", "method", "model"];
  return ["framework", "group", "datatype", "outcome", ...last];
}

export type Selection = Partial<Record<Tier, string>>;

export interface FilterOptions {
  /** Leave out pathways not in taxonomy v11 (marked "new"). */
  hideNew: boolean;
  /** Keep only runnable pathways (status "runnable"). */
  runnableOnly?: boolean;
}

export const DEFAULT_OPTIONS: FilterOptions = { hideNew: false };

/** The selection without its choice for one tier. */
export function without(selection: Selection, tier: Tier): Selection {
  return Object.fromEntries(Object.entries(selection).filter(([t]) => t !== tier));
}

/** Whether the settings let a pathway be shown at all, whatever is chosen. */
export function included(p: Pathway, options: FilterOptions): boolean {
  if (options.hideNew && p.added) return false;
  if (options.runnableOnly && p.status !== "runnable") return false;
  return true;
}

export function matches(p: Pathway, selection: Selection, options: FilterOptions, except?: Tier): boolean {
  if (!included(p, options)) return false;
  for (const tier of TIERS) {
    if (tier === except) continue;
    const value = selection[tier];
    if (value !== undefined && p[tier] !== value) return false;
  }
  return true;
}

export function filterPathways(pathways: readonly Pathway[], selection: Selection, options: FilterOptions): Pathway[] {
  return pathways.filter((p) => matches(p, selection, options));
}

export interface NodeSummary {
  value: string;
  /** Pathways that would match with this node chosen in its tier. Zero means incompatible. */
  count: number;
  byStatus: Record<Status, number>;
  /** Of `count`, how many are new (not in taxonomy v11). */
  newCount: number;
  selected: boolean;
}

function emptyByStatus(): Record<Status, number> {
  return Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
}

/**
 * Every value of a tier, in the order the map first lists it, with its facet count.
 * Values with no compatible pathway are kept, with a count of zero, so a view can
 * show them greyed out (and, later, say why). With new entries hidden, a value found
 * only in new pathways isn't listed at all.
 */
export function tierNodes(
  pathways: readonly Pathway[],
  selection: Selection,
  tier: Tier,
  options: FilterOptions,
): NodeSummary[] {
  const nodes = new Map<string, NodeSummary>();
  for (const p of pathways) {
    if (!included(p, options)) continue;
    let node = nodes.get(p[tier]);
    if (!node) {
      node = { value: p[tier], count: 0, byStatus: emptyByStatus(), newCount: 0, selected: selection[tier] === p[tier] };
      nodes.set(p[tier], node);
    }
    if (!matches(p, selection, options, tier)) continue;
    node.count += 1;
    node.byStatus[p.status] += 1;
    if (p.added) node.newCount += 1;
  }
  return [...nodes.values()];
}

/**
 * Choose a node, or clear it when it is already chosen. A node with no compatible
 * pathway can't be chosen: the selection is returned unchanged.
 */
export function toggle(
  pathways: readonly Pathway[],
  selection: Selection,
  tier: Tier,
  value: string,
  options: FilterOptions,
): Selection {
  if (selection[tier] === value) return without(selection, tier);
  const next = { ...selection, [tier]: value };
  return pathways.some((p) => matches(p, next, options)) ? next : selection;
}

/**
 * Make a selection match something again, after new entries are hidden or when it
 * names a value the map doesn't have. First drop each choice that matches nothing on
 * its own; if the remaining choices still match nothing together, drop them from the
 * latest tier back until they do.
 */
export function reconcile(pathways: readonly Pathway[], selection: Selection, options: FilterOptions): Selection {
  let next: Selection = selection;
  for (const tier of TIERS) {
    const value = selection[tier];
    if (value !== undefined && !pathways.some((p) => matches(p, { [tier]: value }, options))) {
      next = without(next, tier);
    }
  }
  for (const tier of [...TIERS].reverse()) {
    if (pathways.some((p) => matches(p, next, options))) break;
    next = without(next, tier);
  }
  return next;
}

/**
 * A node's label: a method's or metric's name, otherwise the value itself. The map
 * gives each method and metric its own name (a map test checks this); if two ever
 * share one, the code is added so that no two nodes look the same.
 */
export function nodeLabel(map: MapData, tier: Tier, value: string): string {
  const entries: Record<string, { label: string }> | undefined =
    tier === "method" ? map.methods : tier === "metric" ? map.metrics : undefined;
  const label = entries?.[value]?.label;
  if (entries === undefined || label === undefined) return value;
  const shared = Object.entries(entries).some(([key, e]) => key !== value && e.label === label);
  return shared ? `${label} (${value})` : label;
}

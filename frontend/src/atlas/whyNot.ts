// "Why not?" for a node with no compatible pathway. The reasons themselves come from
// spec/why_not.json, generated from the same checks as the pathways; this file only
// finds which of the current choices a node can't go with, and looks up why.

import raw from "../../../spec/why_not.json";
import type { MapData, Pathway } from "../types/map";
import { matches, without, type FilterOptions, type Selection, type Tier } from "./filter";

export interface Reason {
  text: string;
  /** A rule id such as "R3", or "" when no rule states it. */
  rule: string;
  /** Written like a rule's source, e.g. "MF-mh, CH-10 s10.4.2". */
  src: string;
}

const file = raw;

function key(tier: Tier, value: string): string {
  return `${tier}=${value}`;
}

/** Each choice's index into the file, and the reasons for each pair of choice indexes, both ways round. */
const index = new Map(file.choices.map((c, i) => [c, i]));
const byPair = new Map<string, Reason[]>();
for (const [a, b, ...rs] of file.pairs) {
  const reasons = rs.flatMap((r) => file.reasons[r] ?? []);
  byPair.set(`${String(a)} ${String(b)}`, reasons);
  byPair.set(`${String(b)} ${String(a)}`, reasons);
}

/** Why two choices never meet in a pathway, or undefined if they do. */
export function reasonsFor(a: [Tier, string], b: [Tier, string]): Reason[] | undefined {
  const i = index.get(key(...a));
  const j = index.get(key(...b));
  if (i === undefined || j === undefined) return undefined;
  return byPair.get(`${String(i)} ${String(j)}`);
}

export interface Blocker {
  tier: Tier;
  value: string;
  reasons: Reason[];
}

export type Explanation =
  /** The node fits the choices: nothing to explain (the panel only opens on a node with no pathway). */
  | { kind: "fits" }
  /** One or more of the current choices never meet this node in any pathway. */
  | { kind: "blocked"; blockers: Blocker[] }
  /** It meets each choice on its own, but not all together; dropping any of these tiers would let it fit. */
  | { kind: "together"; tiers: Tier[] }
  /** It fits the choices only through entries marked new, which are hidden. */
  | { kind: "hidden-new" }
  /** It fits the choices only through pathways that aren't runnable, and only runnable ones are shown. */
  | { kind: "not-runnable" };

/** Why a node has no compatible pathway under the current selection. */
export function explain(
  pathways: readonly Pathway[],
  selection: Selection,
  tier: Tier,
  value: string,
  options: FilterOptions,
): Explanation {
  const wanted = { ...selection, [tier]: value };
  if (pathways.some((p) => matches(p, wanted, options))) return { kind: "fits" };
  const others = Object.entries(without(selection, tier)) as [Tier, string][];
  const blockers = others.flatMap(([t, v]) => {
    const reasons = reasonsFor([tier, value], [t, v]);
    return reasons ? [{ tier: t, value: v, reasons }] : [];
  });
  if (blockers.length > 0) return { kind: "blocked", blockers };
  if (options.runnableOnly && pathways.some((p) => matches(p, wanted, { ...options, runnableOnly: false }))) {
    return { kind: "not-runnable" };
  }
  if (options.hideNew && pathways.some((p) => matches(p, wanted, { ...options, hideNew: false }))) return { kind: "hidden-new" };
  const tiers = others
    .map(([t]) => t)
    .filter((t) => pathways.some((p) => matches(p, without(wanted, t), options)));
  return { kind: "together", tiers };
}

/** The text of a rule, by id. */
export function ruleText(map: MapData, id: string): string {
  return map.rules.find((r) => r[0] === id)?.[1] ?? "";
}

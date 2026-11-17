// Pathfinder's question flow (#7). Each question fixes one tier of the map, in a methodologist's order; the
// options at each step, their counts, and which are possible come from the map through the Atlas's own
// filtering, so Pathfinder never decides validity itself. Its answers are an Atlas selection, kept in the page
// address, so the Atlas can open on them and Pathfinder on the Atlas's choices.

import {
  filterPathways,
  tierNodes,
  TIERS,
  type FilterOptions,
  type NodeSummary,
  type Selection,
  type Tier,
  type TierOrder,
} from "../atlas/filter";
import { map } from "../map";
import type { Pathway } from "../types/map";

export interface Question {
  tier: Tier;
  text: string;
}

/** The questions, in the order they are asked. Each one fixes the tier it names. */
export const QUESTIONS: Question[] = [
  { tier: "framework", text: "What kind of question does the review ask?" },
  { tier: "group", text: "What does each study compare, or describe?" },
  { tier: "datatype", text: "What did each study report?" },
  { tier: "outcome", text: "What kind of outcome is it?" },
];

/** The answers so far: the selection's values for the questions' tiers, kept only up to the first gap. */
export function answered(selection: Selection): Selection {
  const out: Selection = {};
  for (const q of QUESTIONS) {
    const value = selection[q.tier];
    if (value === undefined) break;
    out[q.tier] = value;
  }
  return out;
}

/** The first question not yet answered, or undefined once all are. */
export function nextQuestion(selection: Selection): Question | undefined {
  return QUESTIONS.find((q) => answered(selection)[q.tier] === undefined);
}

/** A question's options, possible ones first, each with how many pathways it leaves, under the Atlas's settings. */
export function choices(selection: Selection, tier: Tier, options: FilterOptions): NodeSummary[] {
  const nodes = tierNodes(map.pathways, answered(selection), tier, options);
  return [...nodes.filter((n) => n.count > 0), ...nodes.filter((n) => n.count === 0)];
}

/** Answer a question: set its tier, and clear the answers after it, which may no longer fit. */
export function answer(selection: Selection, tier: Tier, value: string): Selection {
  const out: Selection = {};
  for (const q of QUESTIONS) {
    if (q.tier === tier) {
      out[tier] = value;
      break;
    }
    const v = answered(selection)[q.tier];
    if (v !== undefined) out[q.tier] = v;
  }
  return out;
}

/** The pathways that fit the answers so far. */
export function fitting(selection: Selection, options: FilterOptions): Pathway[] {
  return filterPathways(map.pathways, answered(selection), options);
}

/** Choices in the selection that Pathfinder doesn't use: later tiers, or answers after an unanswered question. */
export function unused(selection: Selection): Tier[] {
  const kept = answered(selection);
  return TIERS.filter((t) => selection[t] !== undefined && kept[t] === undefined);
}

/** The Atlas, opened on these answers and the same settings. */
export function atlasHref(selection: Selection, options: FilterOptions, order: TierOrder): string {
  const params = new URLSearchParams();
  for (const tier of TIERS) {
    const value = answered(selection)[tier];
    if (value !== undefined) params.set(tier, value);
  }
  if (order !== "model-method-metric") params.set("order", order);
  if (options.hideNew) params.set("new", "hide");
  const query = params.toString();
  return query === "" ? "/atlas" : `/atlas?${query}`;
}

/** Take back an answer: clear it and every answer after it. */
export function clearFrom(selection: Selection, tier: Tier): Selection {
  const out: Selection = {};
  for (const q of QUESTIONS) {
    if (q.tier === tier) break;
    const v = answered(selection)[q.tier];
    if (v !== undefined) out[q.tier] = v;
  }
  return out;
}

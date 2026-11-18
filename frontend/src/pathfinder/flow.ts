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
import { cardFor } from "../cards/cards";
import { map } from "../map";
import type { TeachLine } from "../types/cards";
import type { Pathway } from "../types/map";

export interface Question {
  tier: Tier;
  text: string;
  /** Its name in the step bar. */
  short: string;
}

/** The questions, in the order they are asked. Each one fixes the tier it names. */
export const QUESTIONS: Question[] = [
  { tier: "framework", text: "What kind of question does the review ask?", short: "Your question" },
  { tier: "group", text: "What does each study compare, or describe?", short: "Study design" },
  { tier: "datatype", text: "What did each study report?", short: "What studies reported" },
  { tier: "outcome", text: "What kind of outcome is it?", short: "Outcome" },
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

/** The Atlas, opened on these answers (and a model Pathfinder pre-selected) with the same settings and view. */
export function atlasHref(
  selection: Selection,
  options: FilterOptions,
  order: TierOrder,
  model?: string,
  view?: string | null,
): string {
  const params = new URLSearchParams();
  const tiers: Selection = model === undefined ? answered(selection) : { ...answered(selection), model };
  for (const tier of TIERS) {
    const value = tiers[tier];
    if (value !== undefined) params.set(tier, value);
  }
  if (order !== "model-method-metric") params.set("order", order);
  if (options.hideNew) params.set("new", "hide");
  if (options.runnableOnly) params.set("runnable", "only");
  if (view === "3d") params.set("view", "3d");
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

// The two advisory questions (#7; docs/decisions/0005). They come after the four above and are kept in the
// address as "rare" and "vary". Neither removes a pathway: "rare" shows what the cards of the methods that fit
// say about rare events, and "vary" pre-selects a model while both stay one click away.

export type Advice = "yes" | "no" | "unsure";
export const ADVICE: Advice[] = ["yes", "no", "unsure"];

export interface AdviceQuestion {
  key: "rare" | "vary";
  text: string;
  /** Its name in the step bar. */
  short: string;
  answers: Record<Advice, string>;
}

export const RARE: AdviceQuestion = {
  key: "rare",
  text: "Are the events rare?",
  short: "Rare events?",
  answers: { yes: "Yes", no: "No", unsure: "Not sure" },
};

export const VARY: AdviceQuestion = {
  key: "vary",
  text: "Do you expect the true effects to differ between studies?",
  short: "Do effects differ?",
  answers: { yes: "Yes, they probably differ", no: "No, they share one effect", unsure: "Not sure" },
};

/** The model each answer to VARY pre-selects; "unsure" pre-selects none. */
export const MODEL_FOR: Partial<Record<Advice, string>> = { yes: "Random effects", no: "Common effect" };

export function readAdvice(value: string | null): Advice | undefined {
  return ADVICE.find((a) => a === value);
}

export interface RareLine {
  method: string;
  line: TeachLine;
}

/** What the cards of the methods among these pathways say about rare events, in the map's order of methods. */
export function rareLines(found: readonly Pathway[]): RareLine[] {
  const methods = [...new Set(found.map((p) => p.method))];
  return methods.flatMap((method) =>
    (cardFor("method", method)?.teach ?? []).filter((t) => /\brare\b/i.test(t.text)).map((line) => ({ method, line })),
  );
}

/** The models among these pathways, in the map's order. */
export function modelsIn(found: readonly Pathway[]): string[] {
  return [...new Set(found.map((p) => p.model))];
}

/**
 * Where the rare-events advice applies: binary outcomes compared between two groups (Cochrane 10.4.4.3, on
 * dichotomous outcomes) or across a network (netmetabin()). Rates (Cochrane 10.8) and one-group data are not
 * what those sections speak to, though the same methods fit them.
 */
const RARE_SCOPE = { outcome: "Binary", groups: new Set(["Two groups (pairwise)", "Multiple groups (network)"]) };

/**
 * Ask about rare events only within RARE_SCOPE, and only where a method that fits is one its card suggests for
 * them (a "use" line), not where the only line is a caution: inverse variance carries one wherever it fits.
 */
export function asksRare(found: readonly Pathway[]): boolean {
  const inScope = found.length > 0 && found.every((p) => p.outcome === RARE_SCOPE.outcome && RARE_SCOPE.groups.has(p.group));
  return inScope && rareLines(found).some((l) => l.line.kind === "use");
}

/** Ask whether true effects vary only where both models still fit. */
export function asksVary(found: readonly Pathway[]): boolean {
  return modelsIn(found).length > 1;
}

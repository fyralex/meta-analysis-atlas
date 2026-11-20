// The pathway the Workbench runs, read from the address as Pathfinder and the Atlas write it: one query parameter
// for each of the seven tiers (#165). The map says whether it exists and whether it is runnable; the page never
// decides that itself (CLAUDE.md, "Architecture").
import { pathwayQuery } from "../api/client";
import { nodeLabel, TIERS } from "../atlas/filter";
import { map } from "../map";
import type { PathwayRef } from "../types/api";
import type { Pathway } from "../types/map";

export { TIERS };

export const RANDOM = "Random effects";

/** The seven tiers from the address, or undefined when any is missing. */
export function readPathway(params: URLSearchParams): PathwayRef | undefined {
  const values = TIERS.map((tier) => params.get(tier));
  if (values.some((v) => v === null || v === "")) return undefined;
  return Object.fromEntries(TIERS.map((tier, i) => [tier, values[i]])) as unknown as PathwayRef;
}

/** Just the seven tiers of a map pathway, as the API takes them. */
export function refOf(p: PathwayRef): PathwayRef {
  return Object.fromEntries(TIERS.map((tier) => [tier, p[tier]])) as unknown as PathwayRef;
}

/** The map's pathway with these seven choices, if it has one. */
export function findPathway(ref: PathwayRef): Pathway | undefined {
  return map.pathways.find((p) => TIERS.every((tier) => p[tier] === ref[tier]));
}

export const RUNNABLE: readonly Pathway[] = map.pathways.filter((p) => p.status === "runnable");

/** The Workbench's address for a pathway. */
export function workbenchHref(p: PathwayRef): string {
  return `/workbench?${pathwayQuery(refOf(p))}`;
}

/** The Atlas's address with a pathway's seven choices made. */
export function atlasHref(p: PathwayRef): string {
  return `/atlas?${pathwayQuery(refOf(p))}`;
}

/** A metric's name without the "(log)" the map adds for the scale the model works on. */
function metricName(p: PathwayRef): string {
  return nodeLabel(map, "metric", p.metric).replace(/ \(log\)$/, "");
}

/** The pathway in a line: "Risk ratio, pooled with random effects (inverse variance)". */
export function pathwayTitle(p: PathwayRef): string {
  const model = p.model === RANDOM ? "pooled with random effects" : `pooled with a ${p.model.toLowerCase()} model`;
  // "inverse variance" is a phrase, Mantel-Haenszel and Peto are names
  return `${metricName(p)}, ${model} (${nodeLabel(map, "method", p.method).replace(/^Inverse/, "inverse")})`;
}

/** The pathway in a few words, for the step bar: "Risk ratio, random effects". */
export function pathwayShort(p: PathwayRef): string {
  return `${metricName(p)}, ${p.model.toLowerCase()}`;
}

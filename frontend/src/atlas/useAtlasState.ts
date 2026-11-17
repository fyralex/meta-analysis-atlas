// The Atlas's choices live in the page address, so a view can be bookmarked or shared,
// and Pathfinder (#7) can open the Atlas on a selection. A value the address names
// that matches nothing is dropped by reconcile(), and the view says which.

import { useState } from "react";
import { useSearchParams } from "react-router";
import { map } from "../map";
import { reconcile, TIERS, type FilterOptions, type Selection, type Tier, type TierOrder } from "./filter";

export interface AtlasState {
  selection: Selection;
  order: TierOrder;
  options: FilterOptions;
  /**
   * Tiers whose choice was dropped because, with the other choices and settings, it
   * matched no pathway: from the address, or by the last change (such as hiding new entries).
   */
  dropped: Tier[];
  update: (change: Change) => void;
}

export interface Change {
  selection?: Selection;
  order?: TierOrder;
  options?: FilterOptions;
  /** Other address parameters to set (a string) or remove (null), such as Pathfinder's answers. */
  extra?: Record<string, string | null>;
}

/** The address parameters this hook owns; any other parameter is kept as it is unless `extra` changes it. */
const OWN = new Set<string>([...TIERS, "order", "new", "runnable"]);

/** Whether any pathway in the map is runnable (none is in v0.1). */
export const ANY_RUNNABLE = map.pathways.some((p) => p.status === "runnable");

export function useAtlasState(): AtlasState {
  const [params, setParams] = useSearchParams();
  // Choices the last change cleared, with the address it wrote, so Back and Forward
  // to another address don't show a stale note.
  const [cleared, setCleared] = useState<{ address: string; tiers: Tier[] }>({ address: "", tiers: [] });
  const clearedHere = cleared.address === params.toString() ? cleared.tiers : [];
  const order: TierOrder = params.get("order") === "metric-method-model" ? "metric-method-model" : "model-method-metric";
  // "runnable=only" is ignored while no pathway is runnable: it would match nothing and clear every choice.
  const options: FilterOptions = {
    hideNew: params.get("new") === "hide",
    runnableOnly: params.get("runnable") === "only" && ANY_RUNNABLE,
  };
  const asked: Selection = {};
  for (const tier of TIERS) {
    const value = params.get(tier);
    if (value !== null) asked[tier] = value;
  }
  const selection = reconcile(map.pathways, asked, options);
  const dropped = TIERS.filter(
    (t) => (asked[t] !== undefined && selection[t] === undefined) || (clearedHere.includes(t) && selection[t] === undefined),
  );

  function update(change: Change) {
    const nextOptions = change.options ?? options;
    const wanted = change.selection ?? selection;
    const nextSelection = reconcile(map.pathways, wanted, nextOptions);
    const next = new URLSearchParams();
    for (const [key, value] of params) if (!OWN.has(key)) next.set(key, value);
    for (const [key, value] of Object.entries(change.extra ?? {})) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    for (const tier of TIERS) {
      const value = nextSelection[tier];
      if (value !== undefined) next.set(tier, value);
    }
    if ((change.order ?? order) !== "model-method-metric") next.set("order", "metric-method-model");
    if (nextOptions.hideNew) next.set("new", "hide");
    if (nextOptions.runnableOnly && ANY_RUNNABLE) next.set("runnable", "only");
    setCleared({
      address: next.toString(),
      tiers: TIERS.filter((t) => wanted[t] !== undefined && nextSelection[t] === undefined),
    });
    setParams(next, { replace: true });
  }

  return { selection, order, options, dropped, update };
}

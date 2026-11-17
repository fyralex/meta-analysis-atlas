// The Atlas's choices live in the page address, so a view can be bookmarked or shared,
// and Pathfinder (#7) can open the Atlas on a selection. A value the address names
// that matches nothing is dropped by reconcile(), and the view says which.

import { useSearchParams } from "react-router";
import { map } from "../map";
import { reconcile, TIERS, type FilterOptions, type Selection, type Tier, type TierOrder } from "./filter";

export interface AtlasState {
  selection: Selection;
  order: TierOrder;
  options: FilterOptions;
  /** Tiers whose choice in the address was dropped because it matched nothing. */
  dropped: Tier[];
  update: (change: { selection?: Selection; order?: TierOrder; options?: FilterOptions }) => void;
}

export function useAtlasState(): AtlasState {
  const [params, setParams] = useSearchParams();
  const order: TierOrder = params.get("order") === "metric-method-model" ? "metric-method-model" : "model-method-metric";
  const options: FilterOptions = { hideNew: params.get("new") === "hide" };
  const asked: Selection = {};
  for (const tier of TIERS) {
    const value = params.get(tier);
    if (value !== null) asked[tier] = value;
  }
  const selection = reconcile(map.pathways, asked, options);
  const dropped = TIERS.filter((t) => asked[t] !== undefined && selection[t] === undefined);

  function update(change: { selection?: Selection; order?: TierOrder; options?: FilterOptions }) {
    const nextOptions = change.options ?? options;
    const nextSelection = reconcile(map.pathways, change.selection ?? selection, nextOptions);
    const next = new URLSearchParams();
    for (const tier of TIERS) {
      const value = nextSelection[tier];
      if (value !== undefined) next.set(tier, value);
    }
    if ((change.order ?? order) !== "model-method-metric") next.set("order", "metric-method-model");
    if (nextOptions.hideNew) next.set("new", "hide");
    setParams(next, { replace: true });
  }

  return { selection, order, options, dropped, update };
}

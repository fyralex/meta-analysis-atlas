// The 3D view's scene (#5): the same nodes and counts as the 2D view, from the shared filter, placed in space.
// One horizontal layer per tier, stacked top to bottom in the chosen tier order; each layer's nodes on a ring.
// Nothing here decides validity: a node's count, and whether it is chosen, come from tierNodes().

import { STATUSES, type Pathway, type Status } from "../types/map";
import { nodeLabel, tierNodes, tiersInOrder, type FilterOptions, type Selection, type Tier, type TierOrder } from "./filter";
import { map } from "../map";
import { TIER_NAMES } from "./names";

export interface SceneNode {
  tier: Tier;
  value: string;
  label: string;
  count: number;
  /** The status most of its pathways have, or "none" for a node no pathway fits. */
  status: Status | "none";
  selected: boolean;
  position: [number, number, number];
  radius: number;
}

export interface SceneLayer {
  tier: Tier;
  name: string;
  y: number;
  ringRadius: number;
  nodes: SceneNode[];
}

/** Vertical distance between layers, and the smallest ring. */
const LAYER_GAP = 2.2;
const MIN_RING = 1.2;

/** The status most of a node's pathways have; ties go to the status listed first (runnable before planned). */
function mainStatus(byStatus: Record<Status, number>): Status | "none" {
  let best: Status | "none" = "none";
  let most = 0;
  for (const s of STATUSES) {
    if (byStatus[s] > most) {
      best = s;
      most = byStatus[s];
    }
  }
  return best;
}

/** Every tier as a layer, in the chosen order, with the nodes the 2D view shows and the same counts. */
export function scene(
  pathways: readonly Pathway[],
  selection: Selection,
  order: TierOrder,
  options: FilterOptions,
): SceneLayer[] {
  const tiers = tiersInOrder(order);
  const top = ((tiers.length - 1) * LAYER_GAP) / 2;
  return tiers.map((tier, i) => {
    const summaries = tierNodes(pathways, selection, tier, options);
    const ringRadius = Math.max(MIN_RING, Math.sqrt(summaries.length) * 0.75);
    const y = top - i * LAYER_GAP;
    const nodes = summaries.map((n, j): SceneNode => {
      const angle = (2 * Math.PI * j) / Math.max(1, summaries.length);
      return {
        tier,
        value: n.value,
        label: nodeLabel(map, tier, n.value),
        count: n.count,
        status: n.count === 0 ? "none" : mainStatus(n.byStatus),
        selected: n.selected,
        position: [ringRadius * Math.cos(angle), y, ringRadius * Math.sin(angle)],
        radius: n.count === 0 ? 0.08 : 0.1 + 0.05 * Math.log10(1 + n.count),
      };
    });
    return { tier, name: TIER_NAMES[tier], y, ringRadius, nodes };
  });
}

/** Whether this browser can draw the 3D view. Without WebGL, the Atlas keeps to the 2D view. */
export function hasWebGL(): boolean {
  if (typeof document === "undefined" || typeof WebGLRenderingContext === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

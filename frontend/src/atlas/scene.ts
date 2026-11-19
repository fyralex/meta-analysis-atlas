// The 3D view's scene (#5): the same nodes and counts as the 2D view, from the shared filter, placed in space.
// One horizontal layer per tier, stacked top to bottom in the chosen tier order; each layer's nodes on a ring.
// Nothing here decides validity: a node's count, and whether it is chosen, come from tierNodes().

import { STATUSES, type Pathway, type Status } from "../types/map";
import {
  filterPathways,
  nodeLabel,
  tierNodes,
  tiersInOrder,
  type FilterOptions,
  type Selection,
  type Tier,
  type TierOrder,
} from "./filter";
import { map } from "../map";
import { byFamily } from "./families";
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
  /** The metric tier's families (#78): each one's name, placed outside the ring by the middle of its nodes. */
  groups: { name: string; position: [number, number, number] }[];
}

/** Vertical distance between layers, and the smallest ring. */
const LAYER_GAP = 2.2;
const MIN_RING = 2.6;

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
    // The metric tier's nodes sit by family, with an empty place on the ring between families (#78).
    const families = byFamily(tier, tierNodes(pathways, selection, tier, options), (n) => n.value);
    const summaries = families.flatMap((g) => g.items);
    const ringRadius = Math.max(MIN_RING, Math.sqrt(summaries.length) * 0.75);
    const y = top - i * LAYER_GAP;
    const gap = families.length > 1 ? 1 : 0;
    const places = Math.max(1, summaries.length + gap * families.length);
    const slot: number[] = [];
    const groups: SceneLayer["groups"] = [];
    let at = 0;
    for (const g of families) {
      const first = at;
      for (let k = 0; k < g.items.length; k += 1) slot.push(at++);
      if (g.family !== undefined && gap > 0) {
        const mid = (2 * Math.PI * (first + at - 1)) / 2 / places;
        const r = ringRadius + 0.9;
        groups.push({ name: g.family, position: [r * Math.cos(mid), y + 0.35, r * Math.sin(mid)] });
      }
      at += gap;
    }
    const nodes = summaries.map((n, j): SceneNode => {
      const angle = (2 * Math.PI * (slot[j] ?? j)) / places;
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
    return { tier, name: TIER_NAMES[tier], y, ringRadius, nodes, groups };
  });
}

export interface SceneLink {
  from: [number, number, number];
  to: [number, number, number];
}

/**
 * The lines between neighbouring layers, as in the prototype map (#92, design E): one for each pair of nodes that
 * a matching pathway passes through, one layer after the other. They come from the pathways your choices leave,
 * so they narrow as the nodes do.
 */
export function links(
  pathways: readonly Pathway[],
  selection: Selection,
  options: FilterOptions,
  layers: readonly SceneLayer[],
): SceneLink[] {
  const where = new Map<string, [number, number, number]>(
    layers.flatMap((l) => l.nodes.map((n) => [`${l.tier}=${n.value}`, n.position] as const)),
  );
  const tiers = layers.map((l) => l.tier);
  const seen = new Set<string>();
  const out: SceneLink[] = [];
  for (const p of filterPathways(pathways, selection, options)) {
    for (const [i, upper] of tiers.entries()) {
      const lower = tiers[i + 1];
      if (lower === undefined) break;
      const a = `${upper}=${p[upper]}`;
      const b = `${lower}=${p[lower]}`;
      const key = `${a}|${b}`;
      const from = where.get(a);
      const to = where.get(b);
      if (seen.has(key) || !from || !to) continue;
      seen.add(key);
      out.push({ from, to });
    }
  }
  return out;
}

/**
 * Whether this browser can draw the 3D view: three.js needs WebGL 2 (WebGL 1 is unsupported since r163).
 * Without it, the Atlas keeps to the 2D view. The probe's context is released at once.
 */
export function hasWebGL(): boolean {
  if (typeof document === "undefined" || typeof WebGL2RenderingContext === "undefined") return false;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** A layer with more possible nodes than this is crowded: its labels would overlap. */
export const CROWDED = 8;
/** In a crowded layer, only this many of the possible nodes keep a label: those with the most pathways. */
export const LABELLED_IN_CROWD = 6;

/**
 * The nodes of a layer that show a label at rest: every possible node (count above 0), or in a crowded layer
 * the ones with the most pathways, the map's order breaking ties. A chosen or hovered node shows one anyway.
 */
export function labelled(layer: SceneLayer): Set<string> {
  const possible = layer.nodes.filter((n) => n.count > 0);
  if (possible.length <= CROWDED) return new Set(possible.map((n) => n.value));
  const top = [...possible].sort((a, b) => b.count - a.count).slice(0, LABELLED_IN_CROWD);
  return new Set(top.map((n) => n.value));
}

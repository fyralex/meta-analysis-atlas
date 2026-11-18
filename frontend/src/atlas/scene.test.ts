import { describe, expect, it } from "vitest";
import lockRaw from "../../../spec/pathways.lock.json";
import { map } from "../map";
import type { Pathway } from "../types/map";
import { DEFAULT_OPTIONS, tierNodes, TIERS, tiersInOrder, type FilterOptions, type Selection } from "./filter";
import { CROWDED, hasWebGL, LABELLED_IN_CROWD, labelled, links, scene, type SceneLayer, type SceneNode } from "./scene";

// The counts are checked against the lock file, read independently of map.json, as the 2D view's tests do.
const lock = lockRaw as unknown as Pathway[];
const F1 = "1. Interventional (effect of an intervention)";

function lockCount(selection: Selection, options: FilterOptions): number {
  return lock.filter(
    (p) =>
      !(options.hideNew && p.added) &&
      !(options.runnableOnly && p.status !== "runnable") &&
      TIERS.every((t) => selection[t] === undefined || p[t] === selection[t]),
  ).length;
}

const SELECTIONS: Selection[] = [
  {},
  { framework: F1 },
  { framework: F1, group: "Two groups (pairwise)" },
  { framework: F1, group: "Two groups (pairwise)", outcome: "Binary", model: "Random effects" },
  { method: "PETO" },
  { framework: "2. Diagnostic test accuracy" },
];

describe("the 3D scene", () => {
  it.each(SELECTIONS)("gives every node the same count as the 2D view and the lock file, for %j", (selection) => {
    // No pathway is runnable in v0.1: "runnable only" leaves every node at 0 in both views, and the counts still agree.
    for (const options of [DEFAULT_OPTIONS, { hideNew: true }, { hideNew: false, runnableOnly: true }]) {
      for (const layer of scene(map.pathways, selection, "model-method-metric", options)) {
        const flat = tierNodes(map.pathways, selection, layer.tier, options);
        expect(layer.nodes.map((n) => [n.value, n.count, n.selected])).toEqual(
          flat.map((n) => [n.value, n.count, n.selected]),
        );
        for (const n of layer.nodes) {
          const rest = Object.fromEntries(Object.entries(selection).filter(([t]) => t !== layer.tier));
          expect(n.count, `${layer.tier}=${n.value}`).toBe(lockCount({ ...rest, [layer.tier]: n.value }, options));
        }
      }
    }
  });

  it.each(SELECTIONS)("joins exactly the neighbouring nodes a matching pathway passes through, for %j", (selection) => {
    for (const [order, options] of [
      ["model-method-metric", DEFAULT_OPTIONS],
      ["metric-method-model", DEFAULT_OPTIONS],
      ["model-method-metric", { hideNew: true }],
    ] as const) {
      const layers = scene(map.pathways, selection, order, options);
      const at = (tier: string, value: string) =>
        layers.find((l) => l.tier === tier)?.nodes.find((n) => n.value === value)?.position;
      const tiers = tiersInOrder(order);
      const expected = new Set<string>();
      for (const p of lock) {
        if (options.hideNew && p.added) continue;
        if (!TIERS.every((t) => selection[t] === undefined || p[t] === selection[t])) continue;
        for (let i = 0; i + 1 < tiers.length; i++) {
          const [a, b] = [tiers[i] ?? "framework", tiers[i + 1] ?? "framework"];
          expected.add(JSON.stringify([at(a, p[a]), at(b, p[b])]));
        }
      }
      const got = links(map.pathways, selection, options, layers).map((l) => JSON.stringify([l.from, l.to]));
      expect(new Set(got).size).toBe(got.length);
      expect(new Set(got)).toEqual(expected);
    }
  });

  it("stacks the layers in the chosen tier order, top to bottom", () => {
    for (const order of ["model-method-metric", "metric-method-model"] as const) {
      const layers = scene(map.pathways, {}, order, DEFAULT_OPTIONS);
      expect(layers.map((l) => l.tier)).toEqual(tiersInOrder(order));
      for (let i = 1; i < layers.length; i++) expect(layers[i]?.y).toBeLessThan(layers[i - 1]?.y ?? 0);
    }
  });

  it("places each node of a layer apart, on its layer, and greys out nodes no pathway fits", () => {
    for (const layer of scene(map.pathways, { framework: F1 }, "model-method-metric", DEFAULT_OPTIONS)) {
      const spots = new Set(layer.nodes.map((n) => n.position.map((v) => v.toFixed(3)).join(",")));
      expect(spots.size).toBe(layer.nodes.length);
      for (const n of layer.nodes) {
        expect(n.position[1]).toBe(layer.y);
        expect(n.status === "none").toBe(n.count === 0);
      }
    }
  });

  it("says there is no WebGL where the browser has none, as in this test environment", () => {
    expect(hasWebGL()).toBe(false);
  });

  it("labels every possible node of an uncrowded layer, and only the busiest of a crowded one", () => {
    const layers = scene(map.pathways, { framework: F1 }, "model-method-metric", DEFAULT_OPTIONS);
    // Both cases must be reached for this test to mean anything.
    expect(layers.some((l) => l.nodes.filter((n) => n.count > 0).length > CROWDED)).toBe(true);
    expect(layers.some((l) => l.nodes.filter((n) => n.count > 0).length <= CROWDED)).toBe(true);
    for (const layer of layers) {
      const possible = layer.nodes.filter((n) => n.count > 0);
      const named = labelled(layer);
      if (possible.length <= CROWDED) {
        expect([...named].sort()).toEqual(possible.map((n) => n.value).sort());
      } else {
        expect(named.size).toBe(LABELLED_IN_CROWD);
        const least = Math.min(...possible.filter((n) => named.has(n.value)).map((n) => n.count));
        // No node left without a label has more pathways than one that kept its label.
        expect(possible.filter((n) => !named.has(n.value)).every((n) => n.count <= least)).toBe(true);
      }
      expect(layer.nodes.filter((n) => n.count === 0).some((n) => named.has(n.value))).toBe(false);
    }
  });

  it("breaks ties between equally busy nodes in the map's order", () => {
    const node = (value: string, count: number): SceneNode => ({
      tier: "metric",
      value,
      label: value,
      count,
      status: "planned",
      selected: false,
      position: [0, 0, 0],
      radius: 0.1,
    });
    const nodes = Array.from({ length: CROWDED + 1 }, (_, i) => node(`m${String(i)}`, 5));
    const layer: SceneLayer = { tier: "metric", name: "Metric", y: 0, ringRadius: 3, nodes };
    expect([...labelled(layer)]).toEqual(nodes.slice(0, LABELLED_IN_CROWD).map((n) => n.value));
  });
});

import { describe, expect, it } from "vitest";
import lockRaw from "../../../spec/pathways.lock.json";
import { map } from "../map";
import { STATUSES, type Pathway, type Status } from "../types/map";
import {
  DEFAULT_OPTIONS,
  filterPathways,
  nodeLabel,
  reconcile,
  tierNodes,
  tiersInOrder,
  toggle,
  TIERS,
  without,
  type Selection,
  type Tier,
} from "./filter";

// The expected counts come from the lock file, read independently of map.json.
const lock = lockRaw as unknown as Pathway[];
const all = map.pathways;
const HIDE_NEW = { hideNew: true };

function lockCount(selection: Selection, hideNew = false, status?: Status): number {
  return lock.filter(
    (p) =>
      !(hideNew && p.new) &&
      (status === undefined || p.status === status) &&
      TIERS.every((t) => selection[t] === undefined || p[t] === selection[t]),
  ).length;
}

const frameworks = [...new Set(lock.map((p) => p.framework))];

describe("filtering by framework", () => {
  it.each(frameworks)("%s: the count equals the lock file's", (framework) => {
    expect(filterPathways(all, { framework }, DEFAULT_OPTIONS)).toHaveLength(lockCount({ framework }));
    expect(filterPathways(all, { framework }, HIDE_NEW)).toHaveLength(lockCount({ framework }, true));
  });

  it("covers every pathway once across frameworks", () => {
    const total = frameworks.reduce((n, framework) => n + filterPathways(all, { framework }, DEFAULT_OPTIONS).length, 0);
    expect(total).toBe(lock.length);
  });
});

describe("every node's count", () => {
  it.each(frameworks)("%s: each node in each tier counts as the lock file does", (framework) => {
    for (const tier of TIERS) {
      for (const node of tierNodes(all, { framework }, tier, DEFAULT_OPTIONS)) {
        const sel: Selection = tier === "framework" ? { framework: node.value } : { framework, [tier]: node.value };
        expect(node.count, `${tier}: ${node.value}`).toBe(lockCount(sel));
        for (const status of STATUSES) {
          expect(node.byStatus[status], `${tier}: ${node.value}, ${status}`).toBe(lockCount(sel, false, status));
        }
      }
    }
  });

  it("adds up, in every tier, to the pathways the rest of the selection matches", () => {
    const selection: Selection = { framework: frameworks[0] ?? "", model: "Random effects" };
    for (const tier of TIERS) {
      const sum = tierNodes(all, selection, tier, DEFAULT_OPTIONS).reduce((n, node) => n + node.count, 0);
      expect(sum, tier).toBe(lockCount(without(selection, tier)));
    }
  });

  it("splits each count by status and counts the new pathways", () => {
    for (const node of tierNodes(all, {}, "method", DEFAULT_OPTIONS)) {
      expect(Object.values(node.byStatus).reduce((a, b) => a + b, 0)).toBe(node.count);
      expect(node.newCount).toBe(lock.filter((p) => p.method === node.value && p.new).length);
    }
  });

  it("keeps incompatible nodes, with a count of zero", () => {
    const nodes = tierNodes(all, { method: "PETO" }, "metric", DEFAULT_OPTIONS);
    expect(nodes.find((n) => n.value === "PETO")?.count).toBeGreaterThan(0);
    expect(nodes.find((n) => n.value === "MD")?.count).toBe(0);
  });

  it("leaves out new pathways when they are hidden", () => {
    const nodes = tierNodes(all, {}, "framework", HIDE_NEW);
    expect(nodes.map((n) => n.value)).toEqual([...new Set(lock.filter((p) => !p.new).map((p) => p.framework))]);
    expect(nodes.every((n) => n.newCount === 0)).toBe(true);
  });
});

describe("the tier order", () => {
  it("puts model, method and metric in either order after the outcome", () => {
    expect(tiersInOrder("model-method-metric").slice(4)).toEqual(["model", "method", "metric"]);
    expect(tiersInOrder("metric-method-model").slice(4)).toEqual(["metric", "method", "model"]);
  });

  it("never changes a count: the counts don't depend on the order", () => {
    const selection: Selection = { framework: frameworks[0] ?? "", metric: "OR" };
    const counts = (order: Parameters<typeof tiersInOrder>[0]) =>
      Object.fromEntries(
        tiersInOrder(order).map((t) => [t, tierNodes(all, selection, t, DEFAULT_OPTIONS).map((n) => [n.value, n.count])]),
      );
    expect(counts("metric-method-model")).toEqual(counts("model-method-metric"));
  });
});

describe("choosing nodes", () => {
  it("narrows step by step, each count matching the lock file", () => {
    let selection: Selection = {};
    const steps: [Tier, string][] = [
      ["framework", frameworks[0] ?? ""],
      ["group", "Two groups (pairwise)"],
      ["outcome", "Binary"],
      ["model", "Common effect"],
      ["method", "MH"],
    ];
    let previous = lock.length;
    for (const [tier, value] of steps) {
      selection = toggle(all, selection, tier, value, DEFAULT_OPTIONS);
      const count = filterPathways(all, selection, DEFAULT_OPTIONS).length;
      expect(count).toBe(lockCount(selection));
      expect(count).toBeLessThanOrEqual(previous);
      previous = count;
    }
    expect(previous).toBeGreaterThan(0);
  });

  it("marks the chosen node, and only it", () => {
    const nodes = tierNodes(all, { method: "IV" }, "method", DEFAULT_OPTIONS);
    expect(nodes.filter((n) => n.selected).map((n) => n.value)).toEqual(["IV"]);
  });

  it("clears a choice when it is chosen again", () => {
    const once = toggle(all, {}, "method", "IV", DEFAULT_OPTIONS);
    expect(toggle(all, once, "method", "IV", DEFAULT_OPTIONS)).toEqual({});
  });

  it("refuses a node with no compatible pathway", () => {
    const selection = { method: "PETO" };
    expect(toggle(all, selection, "metric", "MD", DEFAULT_OPTIONS)).toBe(selection);
  });

  it("drops choices that hiding new entries leaves empty", () => {
    // Every diagnostic accuracy pathway is new, so hiding them empties this choice.
    const dta = frameworks.find((f) => f.startsWith("2.")) ?? "";
    expect(lockCount({ framework: dta }, true)).toBe(0);
    expect(reconcile(all, { framework: dta }, HIDE_NEW)).toEqual({});
    const kept = { framework: frameworks[0] ?? "" };
    expect(reconcile(all, kept, HIDE_NEW)).toEqual(kept);
  });

  it("drops only the choice that is empty on its own, keeping the others", () => {
    // Every raw Cronbach's alpha pathway is still new (#24); the framework and datatype match without it.
    expect(lockCount({ metric: "ARAW" }, true)).toBe(0);
    const selection = { framework: frameworks[0] ?? "", datatype: "Arm-level summary data", metric: "ARAW" };
    expect(reconcile(all, selection, HIDE_NEW)).toEqual({ framework: selection.framework, datatype: selection.datatype });
  });

  it("drops a value the map doesn't have, keeping the valid choices after it", () => {
    const selection = { framework: frameworks[0] ?? "", group: "nope", metric: "OR" };
    expect(reconcile(all, selection, DEFAULT_OPTIONS)).toEqual({ framework: selection.framework, metric: "OR" });
  });

  it("drops every value the map doesn't have, not just the first", () => {
    expect(reconcile(all, { group: "nope", datatype: "nope", metric: "OR" }, DEFAULT_OPTIONS)).toEqual({ metric: "OR" });
  });

  it("drops the latest choices first when the rest match nothing together", () => {
    // Each choice matches on its own, but not together: the later one goes.
    const selection = { method: "PETO", metric: "MD" };
    expect(reconcile(all, selection, DEFAULT_OPTIONS)).toEqual({ method: "PETO" });
  });
});

describe("node labels", () => {
  it("names methods and metrics, and shows other values as they are", () => {
    expect(nodeLabel(map, "method", "MH")).toBe("Mantel-Haenszel");
    expect(nodeLabel(map, "metric", "SMD_D")).toContain("Cohen's d");
    expect(nodeLabel(map, "outcome", "Binary")).toBe("Binary");
  });

  it("adds the code to a name that two methods or metrics share", () => {
    // The map gives every entry its own name (#37); this keeps the fallback for one that doesn't.
    const rd = map.metrics.RD;
    if (!rd) throw new Error("no RD metric");
    const shared = { ...map, metrics: { ...map.metrics, RD2: { ...rd } } };
    expect(nodeLabel(shared, "metric", "RD")).toBe("Risk difference (RD)");
    expect(nodeLabel(shared, "metric", "RD2")).toBe("Risk difference (RD2)");
    expect(nodeLabel(map, "metric", "RD")).toBe("Risk difference");
  });

  it.each(["method", "metric"] as const)("gives every %s in the map a different label", (tier) => {
    const values = [...new Set(lock.map((p) => p[tier]))];
    expect(new Set(values.map((v) => nodeLabel(map, tier, v))).size).toBe(values.length);
  });
});

describe("showing only runnable pathways", () => {
  // No pathway is runnable in v0.1, so these tests mark every third pathway runnable in a copy of the map.
  const some = all.map((p, i): Pathway => (i % 3 === 0 ? { ...p, status: "runnable" } : p));
  const ONLY = { hideNew: false, runnableOnly: true };

  it("keeps only runnable pathways, and counts every node over them alone", () => {
    expect(filterPathways(some, {}, ONLY).every((p) => p.status === "runnable")).toBe(true);
    expect(filterPathways(some, {}, ONLY)).toHaveLength(some.filter((p) => p.status === "runnable").length);
    for (const tier of TIERS) {
      for (const n of tierNodes(some, {}, tier, ONLY)) {
        expect(n.count).toBe(some.filter((p) => p.status === "runnable" && p[tier] === n.value).length);
      }
    }
  });

  it("combines with hiding new entries", () => {
    const both = filterPathways(some, {}, { hideNew: true, runnableOnly: true });
    expect(both).toHaveLength(some.filter((p) => p.status === "runnable" && !p.new).length);
  });

  it("changes nothing when it is off", () => {
    expect(filterPathways(some, {}, DEFAULT_OPTIONS)).toHaveLength(some.length);
  });
});

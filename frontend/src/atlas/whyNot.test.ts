import { describe, expect, it } from "vitest";
import lockRaw from "../../../spec/pathways.lock.json";
import { map } from "../map";
import { references } from "../sources";
import type { Pathway } from "../types/map";
import { matches, TIERS, type Selection, type Tier } from "./filter";
import { explain, reasonsFor, ruleText } from "./whyNot";

// Which choices meet is read from the lock file, independently of the reasons file.
const lock = lockRaw as unknown as Pathway[];
const values = Object.fromEntries(TIERS.map((t) => [t, [...new Set(lock.map((p) => p[t]))]])) as Record<Tier, string[]>;
const meet = new Set<string>();
for (const p of lock) for (const a of TIERS) for (const b of TIERS) meet.add(`${a}=${p[a]}|${b}=${p[b]}`);
// Every three choices that share a pathway, keyed in TIERS order: a set lookup, not a scan of the lock file.
const tripleKey = (s: Selection) =>
  TIERS.filter((t) => s[t] !== undefined)
    .map((t) => `${t}=${s[t] ?? ""}`)
    .join("|");
const triples = new Set<string>();
for (const p of lock)
  for (const a of TIERS)
    for (const b of TIERS)
      for (const c of TIERS) if (a < b && b < c) triples.add(tripleKey({ [a]: p[a], [b]: p[b], [c]: p[c] }));
const SHOW = { hideNew: false };
const HIDE = { hideNew: true };

describe("the reasons file", () => {
  it("explains exactly the pairs of choices that never meet in a pathway", () => {
    for (const a of TIERS)
      for (const b of TIERS) {
        if (a === b) continue;
        for (const x of values[a])
          for (const y of values[b]) {
            const apart = !meet.has(`${a}=${x}|${b}=${y}`);
            expect(reasonsFor([a, x], [b, y]) !== undefined, `${a}=${x} / ${b}=${y}`).toBe(apart);
          }
      }
  });

  it("gives the same reasons both ways, and every reason cites linked sources and real rules", () => {
    const peto = reasonsFor(["method", "PETO"], ["metric", "MD"]);
    expect(peto).toEqual(reasonsFor(["metric", "MD"], ["method", "PETO"]));
    expect(peto?.map((r) => [r.text, r.rule])).toEqual([["Peto gives only: Peto odds ratio (log).", "R5"]]);
    expect(ruleText(map, "R5")).toMatch(/^Peto needs 2x2 tables/);
    for (const r of peto ?? []) for (const ref of references(map, r.src)) expect(ref.url).toMatch(/^https:\/\//);
  });
});

describe("explaining a greyed-out node", () => {
  it("names the choice it never meets, with the reasons", () => {
    const e = explain(lock, { framework: "1. Interventional (effect of an intervention)", method: "PETO" }, "metric", "MD", SHOW);
    expect(e).toEqual({
      kind: "blocked",
      blockers: [{ tier: "method", value: "PETO", reasons: reasonsFor(["metric", "MD"], ["method", "PETO"]) }],
    });
  });

  it("ignores the choice already made in the node's own tier", () => {
    const e = explain(lock, { method: "PETO", metric: "PETO" }, "metric", "MD", SHOW);
    expect(e.kind === "blocked" && e.blockers.map((b) => b.tier)).toEqual(["method"]);
  });

  it("has nothing to explain for a node that fits", () => {
    expect(explain(lock, { method: "PETO" }, "metric", "PETO", SHOW)).toEqual({ kind: "fits" });
  });

  it("says when a node fits each choice alone but not all together, and which to clear", () => {
    // Find such a case in the lock file: x and y meet, v meets each, but no pathway has all three.
    let found: { selection: Selection; tier: Tier; value: string } | undefined;
    search: for (const p of lock)
      for (const a of TIERS)
        for (const b of TIERS) {
          if (a >= b) continue;
          const selection: Selection = { [a]: p[a], [b]: p[b] };
          for (const t of TIERS) {
            if (t === a || t === b) continue;
            for (const v of values[t]) {
              const each = meet.has(`${t}=${v}|${a}=${p[a]}`) && meet.has(`${t}=${v}|${b}=${p[b]}`);
              if (each && !triples.has(tripleKey({ ...selection, [t]: v }))) {
                found = { selection, tier: t, value: v };
                break search;
              }
            }
          }
        }
    expect(found).toBeDefined();
    if (!found) return;
    const e = explain(lock, found.selection, found.tier, found.value, SHOW);
    expect(e.kind).toBe("together");
    if (e.kind !== "together") return;
    for (const t of e.tiers) {
      const rest = Object.fromEntries(Object.entries(found.selection).filter(([k]) => k !== t));
      expect(lock.some((q) => matches(q, { ...rest, [found.tier]: found.value }, SHOW))).toBe(true);
    }
  });

  it("names only the choices whose clearing would let the node fit", () => {
    // Association goes with arm-level data, continuous outcomes and common effect one at a time, not all three;
    // clearing the model alone doesn't help (found by searching the lock file).
    const selection = { datatype: "Arm-level summary data", outcome: "Continuous", model: "Common effect" };
    expect(explain(lock, selection, "framework", "4. Association", SHOW)).toEqual({
      kind: "together",
      tiers: ["datatype", "outcome"],
    });
  });

  it("says when only hidden new entries would fit", () => {
    // The network arcsine difference is new (added, in no accepted family), and so is every pathway through it,
    // while random effects has other pathways.
    expect(lock.filter((p) => p.metric === "N_ASD").every((p) => p.new)).toBe(true);
    expect(lock.some((p) => !p.new && p.model === "Random effects")).toBe(true);
    expect(explain(lock, { model: "Random effects" }, "metric", "N_ASD", HIDE)).toEqual({ kind: "hidden-new" });
    expect(explain(lock, { model: "Random effects" }, "metric", "N_ASD", SHOW).kind).not.toBe("hidden-new");
  });
});

describe("why not, with only runnable pathways shown", () => {
  it("says a node fits only through pathways that aren't runnable", () => {
    // In a copy of the map where only Peto's pathways are runnable, inverse variance fits nothing shown.
    const some = map.pathways.map((p): Pathway => (p.method === "PETO" ? { ...p, status: "runnable" } : p));
    // With the Peto odds ratio chosen, a choice blocks inverse variance first (rule R32), runnable or not.
    const why = explain(some, { metric: "PETO" }, "method", "IV", { hideNew: false, runnableOnly: true });
    expect(why.kind).toBe("blocked");
    expect(explain(some, {}, "method", "IV", { hideNew: false, runnableOnly: true }).kind).toBe("not-runnable");
  });

  it("names both settings when a node fits only through pathways both of them hide", () => {
    // The network arcsine difference's pathways are all marked new, and none is runnable.
    const some = map.pathways.map((p): Pathway => (p.method === "PETO" ? { ...p, status: "runnable" } : p));
    expect(map.pathways.filter((p) => p.metric === "N_ASD").every((p) => p.new && p.status !== "runnable")).toBe(true);
    expect(explain(some, {}, "metric", "N_ASD", { hideNew: true, runnableOnly: true }).kind).toBe("hidden-both");
  });
});

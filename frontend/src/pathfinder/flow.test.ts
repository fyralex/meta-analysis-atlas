import { describe, expect, it } from "vitest";
import lock from "../../../spec/pathways.lock.json";
import { TIERS } from "../atlas/filter";
import type { Selection } from "../atlas/filter";
import type { Pathway } from "../types/map";
import { answer, answered, atlasHref, choices, fitting, nextQuestion, QUESTIONS } from "./flow";

const key = (p: Pathway) => TIERS.map((t) => p[t]).join("|");
const locked = new Set((lock as unknown as Pathway[]).map(key));

/** Every way through the questions, choosing only options that are possible at each step. */
function walk(selection: Selection): Selection[] {
  const q = nextQuestion(selection);
  if (q === undefined) return [selection];
  return choices(selection, q.tier)
    .filter((n) => n.count > 0)
    .flatMap((n) => walk(answer(selection, q.tier, n.value)));
}

describe("Pathfinder's questions", () => {
  it("end, on every way through them, on pathways that exist in the lock file", () => {
    const ends = walk({});
    expect(ends.length).toBeGreaterThan(10);
    for (const end of ends) {
      const found = fitting(end);
      expect(found.length, JSON.stringify(end)).toBeGreaterThan(0);
      for (const p of found) expect(locked.has(key(p)), key(p)).toBe(true);
    }
  });

  it("reach every pathway in the map", () => {
    const reached = new Set(walk({}).flatMap((end) => fitting(end).map(key)));
    expect(reached.size).toBe(locked.size);
  });

  it("are asked in order, one tier each", () => {
    expect(QUESTIONS.map((q) => q.tier)).toEqual(["framework", "group", "datatype", "outcome"]);
    expect(nextQuestion({})?.tier).toBe("framework");
    expect(nextQuestion({ framework: "x", datatype: "y" })?.tier).toBe("group");
  });

  it("clear the later answers when an earlier one changes", () => {
    const s = answer({ framework: "a", group: "b", datatype: "c" }, "group", "z");
    expect(s).toEqual({ framework: "a", group: "z" });
    expect(answered({ framework: "a", datatype: "c" })).toEqual({ framework: "a" });
  });

  it("list the possible options first, and open the Atlas on the answers", () => {
    const opts = choices({}, "framework");
    expect(opts.every((n) => n.count > 0)).toBe(true);
    const first = opts[0]?.value ?? "";
    const href = atlasHref({ framework: first });
    expect(href.startsWith("/atlas?")).toBe(true);
    expect(new URLSearchParams(href.slice("/atlas?".length)).get("framework")).toBe(first);
    expect(atlasHref({})).toBe("/atlas");
  });
});

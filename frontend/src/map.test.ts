import { describe, expect, it } from "vitest";
import lock from "../../spec/pathways.lock.json";
import { countByStatus, map } from "./map";
import { STATUSES, type Pathway } from "./types/map";

const PATHWAY_KEYS: (keyof Pathway)[] = [
  "added",
  "datatype",
  "framework",
  "group",
  "method",
  "metric",
  "milestone",
  "model",
  "outcome",
  "status",
  "verified",
];

describe("spec/map.json as the frontend reads it", () => {
  it("holds the same number of pathways as the lock file", () => {
    expect(map.pathways.length).toBe(lock.length);
  });

  it("gives every pathway exactly the fields of Pathway, with the right types", () => {
    for (const p of map.pathways) {
      expect(Object.keys(p).sort()).toEqual(PATHWAY_KEYS);
      expect(STATUSES).toContain(p.status);
      expect(typeof p.verified).toBe("boolean");
      expect(typeof p.added).toBe("boolean");
    }
  });

  it("names a method and a metric the map defines in every pathway", () => {
    for (const p of map.pathways) {
      expect(map.methods[p.method], p.method).toBeDefined();
      expect(map.metrics[p.metric], p.metric).toBeDefined();
    }
  });

  it("counts every pathway under exactly one status, and none as runnable", () => {
    const counts = countByStatus(map);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(map.pathways.length);
    expect(counts.runnable).toBe(0);
  });
});

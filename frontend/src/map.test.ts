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
  "new",
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
      expect(["v0.2", "v0.3", "v0.4", "Later"]).toContain(p.milestone);
      for (const f of ["framework", "group", "datatype", "outcome", "model", "method", "metric"] as const) {
        expect(typeof p[f]).toBe("string");
      }
      expect(typeof p.added).toBe("boolean");
      expect(typeof p.new).toBe("boolean");
    }
  });

  it("gives every metric and method the fields and types the frontend reads", () => {
    for (const [code, m] of Object.entries(map.metrics)) {
      expect(typeof m.label, code).toBe("string");
      expect(typeof m.call, code).toBe("string");
      expect(typeof m.src, code).toBe("string");
      expect(typeof m.verified, code).toBe("boolean");
      expect(m.only === null || Array.isArray(m.only), code).toBe(true);
    }
    for (const [id, m] of Object.entries(map.methods)) {
      expect(typeof m.label, id).toBe("string");
      expect(typeof m.fn, id).toBe("string");
      for (const list of [m.takes, m.models, m.analysis, m.src, m.added_models]) expect(Array.isArray(list), id).toBe(true);
      expect(m.metrics === null || Array.isArray(m.metrics), id).toBe(true);
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

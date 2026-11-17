import { describe, expect, it } from "vitest";
import { map } from "./map";
import { parseSource, references } from "./sources";

describe("source strings", () => {
  it("reads keys and the sections that follow each", () => {
    expect(parseSource("CH-10 s10.4.2, s10.4.4.3, MF-peto")).toEqual([
      { key: "CH-10", sections: ["s10.4.2", "s10.4.4.3"] },
      { key: "MF-peto", sections: [] },
    ]);
    expect(parseSource("MF-cumul, MF-l1o")).toEqual([
      { key: "MF-cumul", sections: [] },
      { key: "MF-l1o", sections: [] },
    ]);
  });

  it("links every source a rule cites to the map's list of sources", () => {
    for (const [id, , , src] of map.rules) {
      const refs = references(map, src);
      expect(refs.length, id).toBeGreaterThan(0);
      for (const r of refs) expect(r.url, `${id}: ${r.key}`).toMatch(/^https:\/\//);
    }
  });
});

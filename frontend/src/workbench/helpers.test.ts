import { describe, expect, it } from "vitest";
import lockRaw from "../../../spec/pathways.lock.json";
import { ApiError } from "../api/client";
import { DEFAULTS, settingsLine, toOptions, validLevel } from "./settings";
import { findPathway, pathwayShort, pathwayTitle, readPathway, RUNNABLE, workbenchHref } from "./pathway";
import { fromError, marks, placeOf } from "./studyTable";

const RR_RANDOM = {
  framework: "1. Interventional (effect of an intervention)",
  group: "Two groups (pairwise)",
  datatype: "Arm-level summary data",
  outcome: "Binary",
  model: "Random effects",
  method: "IV",
  metric: "RR",
};

describe("the Workbench's pathway", () => {
  it("lists the runnable pathways the lock file has", () => {
    const lock = lockRaw as unknown as { status: string }[];
    expect(RUNNABLE.length).toBe(lock.filter((p) => p.status === "runnable").length);
    expect(RUNNABLE.length).toBeGreaterThan(0);
  });

  it("reads the seven tiers from its own address, and nothing short of seven", () => {
    const href = workbenchHref(RR_RANDOM);
    expect(href.startsWith("/workbench?")).toBe(true);
    const params = new URLSearchParams(href.split("?")[1]);
    expect(readPathway(params)).toEqual(RR_RANDOM);
    params.delete("metric");
    expect(readPathway(params)).toBeUndefined();
  });

  it("finds the map's pathway, or none for choices the map doesn't have", () => {
    expect(findPathway(RR_RANDOM)?.status).toBe("runnable");
    expect(findPathway({ ...RR_RANDOM, metric: "not a metric" })).toBeUndefined();
  });

  it("names it in words", () => {
    expect(pathwayTitle(RR_RANDOM)).toBe("Risk ratio, pooled with random effects (inverse variance)");
    expect(pathwayShort(RR_RANDOM)).toBe("Risk ratio, random effects");
    expect(pathwayTitle({ ...RR_RANDOM, model: "Common effect", method: "MH", metric: "OR" })).toBe(
      "Odds ratio, pooled with a common effect model (Mantel-Haenszel)",
    );
  });
});

describe("the settings", () => {
  it("send the estimator and interval only for random effects", () => {
    expect(toOptions(DEFAULTS, true)).toEqual({ estimator: "REML", interval: "z", level: 95 });
    expect(toOptions(DEFAULTS, false)).toEqual({ level: 95 });
    expect(settingsLine(DEFAULTS, true)).toBe("Between-study variance: REML · Interval: Wald · Level: 95%");
    expect(settingsLine(DEFAULTS, false)).toBe("Level: 95%");
  });

  it("accept the levels /run accepts", () => {
    expect([95, 99.5, 0.5].map(validLevel)).toEqual([true, true, true]);
    expect([0, 100, Number.NaN].map(validLevel)).toEqual([false, false, false]);
  });
});

describe("the study table", () => {
  it("places a problem on its study and cell", () => {
    expect(placeOf("data.3.ai")).toEqual({ index: 3, column: "ai" });
    expect(placeOf("data.12")).toEqual({ index: 12, column: null });
    expect(placeOf("file.columns.ai")).toBeNull();
    const m = marks([
      { path: "data.0.ai", message: "" },
      { path: "data.0.ci", message: "" },
      { path: "data.2", message: "" },
      { path: "data", message: "" },
    ]);
    expect([...m.keys()]).toEqual([0, 2]);
    expect([...(m.get(0) ?? [])]).toEqual(["ai", "ci"]);
    expect(m.get(2)?.size).toBe(0);
  });

  it("keeps the rows as written from a refused upload, and its problems", () => {
    const error = new ApiError(422, {
      code: "invalid_data",
      message: "The file has problems to fix before the analysis can run.",
      fields: [{ path: "data.0.ci", message: "Row 2 (Aronson 1948), column ci: Must be a whole number." }],
      details: { rows: [{ row: 2, cells: { study: "Aronson 1948", ci: "45.5" } }, "not a row"] },
    });
    const table = fromError(error, "trials.csv");
    expect(table.rows).toEqual([{ row: 2, cells: { study: "Aronson 1948", ci: "45.5" } }]);
    expect(table.problems).toHaveLength(1);
    expect(table.studies).toBeNull();
  });

  it("shows an error with no fields as one problem", () => {
    const table = fromError(new ApiError(413, { code: "too_large", message: "The upload is larger than 3 MB." }), "x.csv");
    expect(table.problems).toEqual([{ path: "file", message: "The upload is larger than 3 MB." }]);
    expect(table.rows).toEqual([]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { PathwayRef } from "../types/api";
import { ApiError, api, pathwayQuery } from "./client";

const PATHWAY: PathwayRef = {
  framework: "1. Interventional (effect of an intervention)",
  group: "Two groups (pairwise)",
  datatype: "Arm-level summary data",
  outcome: "Binary",
  model: "Random effects",
  method: "IV",
  metric: "RR",
};

function answer(status: number, body: unknown, json = true): ReturnType<typeof vi.fn> {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(json ? JSON.stringify(body) : String(body), {
      status,
      headers: { "Content-Type": json ? "application/json" : "text/html" },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the API client", () => {
  it("returns the typed answer", async () => {
    answer(200, { count: 1, examples: [{ id: "bcg" }] });
    const list = await api.examples();
    expect(list.count).toBe(1);
  });

  it("turns the API's error body into an ApiError with its stable code, fields and details", async () => {
    answer(409, {
      code: "pathway_not_runnable",
      message: "This pathway is planned.",
      fields: [],
      details: { status: "planned", milestone: "v0.3" },
    });
    const error = await api.spec(PATHWAY).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect([apiError.status, apiError.code, apiError.message]).toEqual([409, "pathway_not_runnable", "This pathway is planned."]);
    expect(apiError.details).toEqual({ status: "planned", milestone: "v0.3" });
  });

  it("keeps the field paths of invalid data", async () => {
    answer(422, {
      code: "invalid_data",
      message: "The file has problems.",
      fields: [{ path: "data.0.ai", message: "Row 2 (A), column ai: Must be a whole number." }],
      details: {},
    });
    const error = (await api.run({ pathway: PATHWAY, data: [] }).catch((e: unknown) => e)) as ApiError;
    expect(error.fields).toEqual([{ path: "data.0.ai", message: "Row 2 (A), column ai: Must be a whole number." }]);
  });

  it("gives a page that isn't the API's JSON a plain http_error", async () => {
    answer(413, "<html>Too large</html>", false);
    const error = (await api.examples().catch((e: unknown) => e)) as ApiError;
    expect([error.status, error.code]).toEqual([413, "http_error"]);
  });

  it("gives a 2xx page that isn't the API's JSON an http_error, not a raw parse error", async () => {
    answer(200, "<!doctype html><html></html>", false);
    const error = (await api.examples().catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect([error.status, error.code]).toEqual([200, "http_error"]);
  });

  it("says when the server can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const error = (await api.health().catch((e: unknown) => e)) as ApiError;
    expect([error.status, error.code, error.message]).toEqual([0, "network_error", "The server could not be reached."]);
  });

  it("sends the pathway as query parameters, and as form fields with the file", async () => {
    expect(pathwayQuery(PATHWAY)).toContain("metric=RR");
    expect(pathwayQuery(PATHWAY)).toContain("group=Two+groups+%28pairwise%29");
    expect(api.templateUrl(PATHWAY)).toMatch(/^\/api\/v1\/meta-analysis\/template\?framework=/);

    const fetcher = answer(200, { count: 0, studies: [], ignored_columns: [], pathway: PATHWAY });
    await api.importCsv(PATHWAY, new Blob(["study,ai\n"]), "mine.csv");
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/meta-analysis/import");
    const form = init.body as FormData;
    expect(form.get("metric")).toBe("RR");
    expect((form.get("file") as File).name).toBe("mine.csv");
  });

  it("posts a run as JSON", async () => {
    const fetcher = answer(200, { r_code: "" });
    await api.run({ pathway: PATHWAY, data: [], labels: { outcome: "death" } });
    const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ labels: { outcome: "death" } });
  });

  it("escapes an example id in its address", () => {
    expect(api.exampleCsvUrl("a/b")).toBe("/api/v1/examples/a%2Fb/studies.csv");
  });
});

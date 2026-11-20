import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { map } from "../map";
import orKnha from "./fixtures/run-or-knha-double-zero.json";
import orMh from "./fixtures/run-bcg-or-mh.json";
import rrRandom from "./fixtures/run-bcg-rr-random.json";
import { workbenchHref } from "./pathway";

// The Workbench's three steps (#165, #178), with the API answered here: the spec and example list are the backend's
// real answers for the risk ratio pathways (GET /api/v1/meta-analysis/spec and /api/v1/examples), and the fixtures
// are its real answers to /run (R 4.5, metafor 5.0.1): the 13 BCG trials as a risk ratio with random effects, and as
// a Mantel-Haenszel odds ratio; and four of them plus a study with no events, as an odds ratio with the
// Hartung-Knapp-Sidik-Jonkman interval at 90%, sent with the outcome "<b>x</b>".

const PAGE = { timeout: 15_000 };

const RR_RANDOM = {
  framework: "1. Interventional (effect of an intervention)",
  group: "Two groups (pairwise)",
  datatype: "Arm-level summary data",
  outcome: "Binary",
  model: "Random effects",
  method: "IV",
  metric: "RR",
};

const SPEC = {
  columns: [
    { name: "study", label: "Study", description: "A short name for the study, different for each row", example: "Aronson 1948", kind: "label" },
    { name: "ai", label: "Events, treatment", description: "People with the event in the treatment group", example: "4", kind: "count" },
    { name: "n1i", label: "People, treatment", description: "People in the treatment group", example: "123", kind: "count" },
    { name: "ci", label: "Events, control", description: "People with the event in the control group", example: "11", kind: "count" },
    { name: "n2i", label: "People, control", description: "People in the control group", example: "139", kind: "count" },
  ],
  events_totals: [],
  min_studies: 2,
  max_studies: 2000,
  rules: ["At least 2 and at most 2000 studies, one per row.", "`ai` is between 0 and `n1i`."],
};

const EXAMPLES = {
  count: 1,
  examples: [
    {
      id: "bcg",
      title: "BCG vaccine trials",
      summary: "13 trials of the BCG vaccine against tuberculosis",
      source: { citation: "Colditz 1994", url: "https://doi.org/10.1001/jama.1994.03510330076038" },
      count: 2,
      runs_with: [
        RR_RANDOM,
        { ...RR_RANDOM, metric: "OR" },
        { ...RR_RANDOM, model: "Common effect", method: "MH", metric: "OR" },
      ],
      published_for: [],
    },
  ],
};

const STUDIES = [
  { study: "Aronson 1948", ai: 4, n1i: 123, ci: 11, n2i: 139 },
  { study: "Ferguson & Simes 1949", ai: 6, n1i: 306, ci: 29, n2i: 303 },
];

type Route = (url: string, init?: RequestInit) => { status: number; body: unknown } | "offline";

/** Answer the API's calls by path; anything else is a 404. */
function serve(route: Route) {
  const fetcher = vi.fn((input: string, init?: RequestInit) => {
    const answer = route(input, init);
    if (answer === "offline") return Promise.reject(new TypeError("Failed to fetch"));
    return Promise.resolve(
      new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "Content-Type": "application/json" } }),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

const healthy = (upload?: { status: number; body: unknown }, run?: { status: number; body: unknown }): Route => (url) => {
  if (url === "/health") return { status: 200, body: { status: "ok", r_service: true, advisor: false } };
  if (url.startsWith("/api/v1/meta-analysis/spec?")) return { status: 200, body: SPEC };
  if (url === "/api/v1/examples") return { status: 200, body: EXAMPLES };
  if (url === "/api/v1/examples/bcg")
    return { status: 200, body: { ...EXAMPLES.examples[0], studies: STUDIES, description: "", data_from: EXAMPLES.examples[0]?.source, labels: null, published: [] } };
  if (url === "/api/v1/meta-analysis/import" && upload) return upload;
  if (url === "/api/v1/meta-analysis/run" && run) return run;
  return { status: 404, body: { code: "not_found", message: "Not found." } };
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function chooseFile(name: string) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("no file input");
  fireEvent.change(input, { target: { files: [new File(["study,ai\n"], name, { type: "text/csv" })] } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the Workbench", PAGE, () => {
  it("sits in the top bar, with Run an analysis, Casebook and Proof inside it", () => {
    serve(healthy());
    renderAt("/workbench");
    expect(screen.getByRole("heading", { level: 1, name: "Workbench" })).toBeInTheDocument();
    const apps = screen.getByRole("navigation", { name: "Apps" });
    expect(within(apps).getByRole("link", { name: "Workbench" })).toHaveClass("active");
    const inside = within(screen.getByRole("navigation", { name: "Workbench" })).getAllByRole("link");
    expect(inside.map((a) => a.getAttribute("href"))).toEqual(["/workbench", "/workbench/casebook", "/workbench/proof"]);
  });

  it("without a pathway, offers Pathfinder and every runnable analysis", () => {
    serve(healthy());
    renderAt("/workbench");
    expect(screen.getByRole("heading", { name: "Choose an analysis" })).toBeInTheDocument();
    const list = screen.getAllByRole("list").find((l) => l.classList.contains("runnable-list"));
    expect(list).toBeDefined();
    const links = within(list as HTMLElement).getAllByRole("link");
    expect(links).toHaveLength(12);
    expect(links.map((a) => a.textContent)).toContain("Risk ratio, pooled with random effects (inverse variance)");
  });

  it("says why a pathway that isn't runnable can't be run, and links to it in the Atlas", () => {
    serve(healthy());
    const planned = map.pathways.find((p) => p.status === "planned");
    if (!planned) throw new Error("the map has no planned pathway");
    renderAt(workbenchHref(planned));
    expect(screen.getByRole("heading", { name: "This analysis can't be run here yet" })).toBeInTheDocument();
    expect(screen.getByText(/Its status is/)).toHaveTextContent(`It is on the roadmap for ${planned.milestone}.`);
    expect(screen.getByRole("link", { name: "See it in the Atlas" }).getAttribute("href")).toMatch(/^\/atlas\?framework=/);
  });

  it("asks for a choice again when the map has no such pathway", () => {
    serve(healthy());
    renderAt(workbenchHref({ ...RR_RANDOM, metric: "not a metric" }));
    expect(screen.getByText("The map has no analysis with the choices in this address.")).toBeInTheDocument();
  });

  it("says the Workbench needs its server when the server can't be reached", async () => {
    serve(() => "offline");
    renderAt(workbenchHref(RR_RANDOM));
    expect(await screen.findByRole("heading", { name: "The Workbench needs its server" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Run the Workbench on your own computer" })).toHaveAttribute(
      "href",
      "https://github.com/fyralex/meta-analysis-atlas#run-the-apps-locally",
    );
  });

  it("shows step 1: the analysis, what the file needs, the template and the settings", async () => {
    serve(healthy());
    renderAt(workbenchHref(RR_RANDOM));
    expect(screen.getByText("Risk ratio, pooled with random effects (inverse variance)", { selector: ".wb-title" })).toBeInTheDocument();
    expect(screen.getByText("Runnable")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "What the file needs" })).toBeInTheDocument();
    const table = screen.getAllByRole("table")[0] as HTMLElement;
    expect(within(table).getAllByRole("row")).toHaveLength(6);
    // the rule's column names show as code, as text
    expect(screen.getByText("ai", { selector: "li code" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download a blank template (CSV)" }).getAttribute("href")).toMatch(
      /^\/api\/v1\/meta-analysis\/template\?framework=/,
    );
    expect(screen.getByText("Between-study variance: REML · Interval: Wald · Level: 95%")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Between-study variance/ })).toHaveValue("REML");
    expect(screen.getByRole("button", { name: "Load the example" })).toBeInTheDocument();
  });

  it("offers only the level for a common-effect model", async () => {
    serve(healthy());
    renderAt(workbenchHref({ ...RR_RANDOM, model: "Common effect", method: "MH" }));
    expect(await screen.findByText("Level: 95%")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /Between-study variance/ })).toBeNull();
    expect(screen.getByRole("spinbutton", { name: /Confidence level/ })).toHaveValue(95);
  });

  it("loads the example into step 2, ready to run", async () => {
    serve(healthy());
    renderAt(workbenchHref(RR_RANDOM));
    fireEvent.click(await screen.findByRole("button", { name: "Load the example" }));
    const heading = await screen.findByRole("heading", { name: "2 studies ready to run" });
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
    expect(screen.getByText("BCG vaccine trials · 2 studies")).toBeInTheDocument();
    expect(screen.getByText("Ferguson & Simes 1949")).toBeInTheDocument();
    expect(document.querySelector(".problems")).toBeNull();
  });

  it("lists an upload's problems by row, study and column, marks the cells, and keeps Run disabled", async () => {
    const fetcher = serve(
      healthy({
        status: 422,
        body: {
          code: "invalid_data",
          message: "The file has problems to fix before the analysis can run.",
          fields: [{ path: "data.1.ci", message: "Row 3 (<b>Ferguson</b>), column ci: Must be a whole number." }],
          details: {
            rows: [
              { row: 2, cells: { study: "Aronson 1948", ai: "4", n1i: "123", ci: "11", n2i: "139" } },
              { row: 3, cells: { study: "<b>Ferguson</b>", ai: "6", n1i: "306", ci: "45.5", n2i: "303" } },
            ],
          },
        },
      }),
    );
    renderAt(workbenchHref(RR_RANDOM));
    await screen.findByRole("heading", { name: "What the file needs" });
    chooseFile("my-trials.csv");
    expect(await screen.findByRole("heading", { name: "1 problem to fix before the analysis can run" })).toBeInTheDocument();
    const call = fetcher.mock.calls.find(([url]) => url === "/api/v1/meta-analysis/import");
    expect(call?.[1]?.method).toBe("POST");
    expect(screen.getByText("Row 3 (<b>Ferguson</b>), column ci: Must be a whole number.")).toBeInTheDocument();
    // labels are text: the markup shows literally and makes no element
    expect(screen.getByText("<b>Ferguson</b>", { selector: "td" })).toBeInTheDocument();
    expect(document.querySelector("td b")).toBeNull();
    const bad = screen.getByText("45.5");
    expect(bad).toHaveClass("cell-problem");
    expect(bad.closest("tr")).toHaveTextContent("Fix");
    expect(screen.getByText("Aronson 1948", { selector: ".wb-studies td" }).closest("tr")).toHaveTextContent("OK");
    expect(screen.getByRole("columnheader", { name: "Row" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run the analysis" })).toBeDisabled();
    expect(screen.getByText("Upload the corrected file")).toBeInTheDocument();
  });

  it("shows missing columns as problems without a table", async () => {
    serve(
      healthy({
        status: 422,
        body: {
          code: "invalid_data",
          message: "The file needs the columns study, ai, n1i, ci, n2i, written exactly so in its first row.",
          fields: [{ path: "file.columns.ci", message: "The column ci is missing." }],
          details: {},
        },
      }),
    );
    renderAt(workbenchHref(RR_RANDOM));
    await screen.findByRole("heading", { name: "What the file needs" });
    chooseFile("short.csv");
    expect(await screen.findByText("The column ci is missing.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "The studies as read" })).toBeNull();
  });
});

const LABELS = { outcome: "tuberculosis", treatment: "vaccinated", control: "unvaccinated" };

/** The example's answer with its words for the sentence. */
const withLabels: Route = (url, init) =>
  url === "/api/v1/examples/bcg"
    ? { status: 200, body: { ...EXAMPLES.examples[0], studies: STUDIES, description: "", data_from: EXAMPLES.examples[0]?.source, labels: LABELS, published: [] } }
    : healthy(undefined, { status: 200, body: rrRandom })(url, init);

async function loadAndRun() {
  fireEvent.click(await screen.findByRole("button", { name: "Load the example" }));
  await screen.findByRole("heading", { name: "2 studies ready to run" });
  const run = screen.getByRole("button", { name: "Run the analysis" });
  expect(run).toBeEnabled();
  fireEvent.click(run);
  return screen.findByRole("heading", { name: "Pooled risk ratio" });
}

function sentBody(fetcher: ReturnType<typeof serve>): Record<string, unknown> {
  const call = fetcher.mock.calls.find(([url]) => url === "/api/v1/meta-analysis/run");
  if (!call) throw new Error("no /run call");
  return JSON.parse(call[1]?.body as string) as Record<string, unknown>;
}

describe("the Workbench, step 3", PAGE, () => {
  it("runs the studies with the chosen settings and the example's words", async () => {
    const fetcher = serve(withLabels);
    renderAt(workbenchHref(RR_RANDOM));
    const heading = await loadAndRun();
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
    const body = sentBody(fetcher);
    expect(body["pathway"]).toEqual(RR_RANDOM);
    expect(body["options"]).toEqual({ estimator: "REML", interval: "z", level: 95 });
    expect(body["data"]).toEqual(STUDIES);
    expect(body["labels"]).toEqual(LABELS);
    expect(body["analysis_type"]).toBe("standard");
    const steps = screen.getByRole("list", { name: "Steps" });
    expect(within(steps).getByText("REML · Wald · 95%").closest("li")).toHaveAttribute("aria-current", "step");
  });

  it("gives the answer first, then the sentence, the prediction interval, I² and τ²", async () => {
    serve(withLabels);
    renderAt(workbenchHref(RR_RANDOM));
    await loadAndRun();
    const answer = screen.getByRole("region", { name: "Pooled risk ratio" });
    expect(within(answer).getByText(/^0\.49/)).toHaveTextContent("0.49 95% CI 0.34 to 0.70");
    expect(within(answer).getByText(/^On average across the 13 studies/)).toHaveTextContent(
      "the risk of tuberculosis in the vaccinated groups was 0.49 times the risk in the unvaccinated groups",
    );
    expect(within(answer).getByText(/^On the log scale/)).toHaveTextContent(
      "On the log scale: −0.715 (SE 0.180), z = −3.97, p < 0.001 · 13 studies used, none left out.",
    );
    expect(within(answer).getByText(/Cochrane Handbook Ch. 6/)).toBeInTheDocument();
    const het = screen.getByRole("region", { name: "How much the studies differ" });
    expect(within(het).getByText("0.15 to 1.55")).toBeInTheDocument();
    expect(within(het).getByText(/It includes 1, no difference/)).toBeInTheDocument();
    expect(within(het).getByText("92%")).toBeInTheDocument();
    expect(within(het).getByText("0.313")).toBeInTheDocument();
    expect(within(het).getByText(/estimated by REML\. Q = 152\.2 on 12 df\./)).toBeInTheDocument();
    expect(within(het).getByRole("link", { name: "Prediction intervals in Cards" })).toHaveAttribute(
      "href",
      "/cards?card=term%3Aprediction-interval",
    );
    expect(within(het).getByText(/s10\.10\.2, s10\.10\.4, s10\.10\.4\.3/)).toBeInTheDocument();
  });

  it("draws the forest plot, with every value also in a table", async () => {
    serve(withLabels);
    renderAt(workbenchHref(RR_RANDOM));
    await loadAndRun();
    const forest = screen.getByRole("img", { name: /^Forest plot of 13 studies; the pooled risk ratio is 0\.49, 95% CI 0\.34 to 0\.70/ });
    expect(forest.querySelectorAll("rect.plot-box")).toHaveLength(13);
    expect(forest.querySelector("polygon.plot-diamond")).not.toBeNull();
    expect(forest.querySelector("line.plot-pi")).not.toBeNull();
    expect(within(forest).getByText("4/123 · 11/139")).toBeInTheDocument();
    expect(within(forest).getByText("← tuberculosis less common in vaccinated")).toBeInTheDocument();
    const table = screen.getByText("The forest plot's values as a table").closest("details") as HTMLElement;
    const aronson = within(table).getByText("Aronson 1948").closest("tr") as HTMLElement;
    // metafor: exp(-0.889 ± 1.96 × √0.326) and weights(fit)
    expect(aronson).toHaveTextContent("0.41");
    expect(aronson).toHaveTextContent("0.13 to 1.26");
    expect(aronson).toHaveTextContent("5.1%");
  });

  it("draws the funnel plot with its caption and sources", async () => {
    serve(withLabels);
    renderAt(workbenchHref(RR_RANDOM));
    await loadAndRun();
    const funnel = screen.getByRole("img", { name: /^Funnel plot of 13 studies around the common-effect estimate/ });
    expect(funnel.querySelectorAll("circle.plot-point")).toHaveLength(13);
    expect(funnel.querySelector("polygon.plot-region")).not.toBeNull();
    const section = screen.getByRole("region", { name: "Funnel plot" });
    expect(within(section).getByText(/^Each point is a study/)).toBeInTheDocument();
    expect(within(section).getByText(/Cochrane Handbook Ch\. 13/).closest("p")).toHaveTextContent("13.3.4.2");
  });

  it("shows the R code and copies it", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    serve(withLabels);
    renderAt(workbenchHref(RR_RANDOM));
    await loadAndRun();
    const code = screen.getByRole("region", { name: "The R code" });
    expect(within(code).getByText(/rma\.uni\(yi = yi, vi = vi/)).toBeInTheDocument();
    fireEvent.click(within(code).getByRole("button", { name: "Copy the R code" }));
    expect(await within(code).findByText("Copied.")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(rrRandom.r_code);
  });

  it("shows a typed label in the sentence as text, never as markup (#172)", async () => {
    const fetcher = serve(healthy(undefined, { status: 200, body: orKnha }));
    renderAt(workbenchHref({ ...RR_RANDOM, metric: "OR" }));
    fireEvent.click(await screen.findByRole("button", { name: "Load the example" }));
    await screen.findByRole("heading", { name: "2 studies ready to run" });
    fireEvent.change(screen.getByRole("textbox", { name: "The event" }), { target: { value: "<b>x</b>" } });
    fireEvent.click(screen.getByRole("button", { name: "Run the analysis" }));
    await screen.findByRole("heading", { name: "Pooled odds ratio" });
    expect(sentBody(fetcher)["labels"]).toEqual({ outcome: "<b>x</b>" });
    expect(screen.getByText(/the odds of <b>x<\/b> in the treatment groups/)).toBeInTheDocument();
    expect(document.querySelector(".wb-answer b")).toBeNull();
  });

  it("lists the studies left out, says why, and labels a Hartung-Knapp statistic t", async () => {
    const zero = [...STUDIES, { study: "Zero trial", ai: 0, n1i: 50, ci: 0, n2i: 50 }];
    serve((url, init) =>
      url === "/api/v1/examples/bcg"
        ? { status: 200, body: { ...EXAMPLES.examples[0], studies: zero, description: "", data_from: EXAMPLES.examples[0]?.source, labels: null, published: [] } }
        : healthy(undefined, { status: 200, body: orKnha })(url, init),
    );
    renderAt(workbenchHref({ ...RR_RANDOM, metric: "OR" }));
    fireEvent.click(await screen.findByRole("button", { name: "Load the example" }));
    await screen.findByRole("heading", { name: "3 studies ready to run" });
    fireEvent.click(screen.getByRole("button", { name: "Run the analysis" }));
    const answer = await screen.findByRole("region", { name: "Pooled odds ratio" });
    expect(within(answer).getByText(/^0\.24/)).toHaveTextContent("90% CI 0.20 to 0.28");
    expect(within(answer).getByText(/^On the log scale/)).toHaveTextContent("t = −19.59, p < 0.001 · 4 studies used, 1 left out");
    const left = screen.getByRole("region", { name: "Studies left out" });
    expect(within(left).getByText("Zero trial").closest("li")).toHaveTextContent("no events in either group");
    expect(within(left).getByText(/Cochrane Handbook Ch\. 10/).closest("p")).toHaveTextContent("10.4.4.2");
  });

  it("shows Cochran's Q, not τ² or a prediction interval, for a common-effect model", async () => {
    serve(healthy(undefined, { status: 200, body: orMh }));
    renderAt(workbenchHref({ ...RR_RANDOM, model: "Common effect", method: "MH", metric: "OR" }));
    fireEvent.click(await screen.findByRole("button", { name: "Load the example" }));
    await screen.findByRole("heading", { name: "2 studies ready to run" });
    fireEvent.click(screen.getByRole("button", { name: "Run the analysis" }));
    await screen.findByRole("heading", { name: "Pooled odds ratio" });
    const het = screen.getByRole("region", { name: "How much the studies differ" });
    expect(within(het).getByText("Cochran's Q")).toBeInTheDocument();
    expect(within(het).getByText("163.9 on 12 df")).toBeInTheDocument();
    expect(within(het).queryByText(/Prediction interval/)).toBeNull();
    expect(within(het).queryByText(/τ²/)).toBeNull();
    expect(within(het).getByText(/metafor/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Forest plot/ }).querySelector("line.plot-pi")).toBeNull();
  });

  it("clears the result when a setting changes", async () => {
    serve(withLabels);
    renderAt(workbenchHref(RR_RANDOM));
    await loadAndRun();
    fireEvent.change(screen.getByRole("combobox", { name: /Between-study variance/ }), { target: { value: "DL" } });
    expect(screen.queryByRole("heading", { name: "Pooled risk ratio" })).toBeNull();
    expect(screen.getByRole("button", { name: "Run the analysis" })).toBeEnabled();
  });

  it("says why the analysis didn't run", async () => {
    serve(
      healthy(undefined, {
        status: 422,
        body: { code: "fit_failed", message: "metafor could not fit the model.", fields: [{ path: "data", message: "Too few studies." }] },
      }),
    );
    renderAt(workbenchHref(RR_RANDOM));
    fireEvent.click(await screen.findByRole("button", { name: "Load the example" }));
    await screen.findByRole("heading", { name: "2 studies ready to run" });
    fireEvent.click(screen.getByRole("button", { name: "Run the analysis" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The analysis didn't run: metafor could not fit the model.");
    expect(alert).toHaveTextContent("Too few studies.");
    expect(screen.queryByRole("heading", { name: "Pooled risk ratio" })).toBeNull();
  });

  it("keeps Run disabled while the R service can't be reached", async () => {
    serve((url, init) =>
      url === "/health" ? { status: 200, body: { status: "ok", r_service: false, advisor: false } } : healthy()(url, init),
    );
    renderAt(workbenchHref(RR_RANDOM));
    fireEvent.click(await screen.findByRole("button", { name: "Load the example" }));
    await screen.findByRole("heading", { name: "2 studies ready to run" });
    expect(screen.getByRole("button", { name: "Run the analysis" })).toBeDisabled();
    expect(screen.getByText("Running needs the R service, which isn't reachable just now.")).toBeInTheDocument();
  });
});

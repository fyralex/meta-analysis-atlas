// The Workbench, steps 1 to 3 (#165, #178), at 360, 768 and 1280 px in light and dark. The API is answered here, so the
// page is tested without a backend: the answers are the backend's own for the risk ratio pathways. A page fails if it
// logs an error, throws, or scrolls sideways; wide tables scroll inside their own boxes.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// the backend's real answers for the 13 BCG trials (R 4.5, metafor 5.0.1)
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../src/workbench/fixtures/${name}`, import.meta.url), "utf8"));
const BCG = fixture("bcg-studies.json");
const RUN = fixture("run-bcg-rr-random.json");

const PATHWAY = new URLSearchParams({
  framework: "1. Interventional (effect of an intervention)",
  group: "Two groups (pairwise)",
  datatype: "Arm-level summary data",
  outcome: "Binary",
  model: "Random effects",
  method: "IV",
  metric: "RR",
}).toString();

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

const PROBLEMS = {
  code: "invalid_data",
  message: "The file has problems to fix before the analysis can run.",
  fields: [{ path: "data.1.ci", message: "Row 3 (Ferguson & Simes 1949), column ci: Must be a whole number." }],
  details: {
    rows: [
      { row: 2, cells: { study: "Aronson 1948", ai: "4", n1i: "123", ci: "11", n2i: "139" } },
      { row: 3, cells: { study: "Ferguson & Simes 1949", ai: "6", n1i: "306", ci: "45.5", n2i: "303" } },
    ],
  },
};

async function serveApi(page: Page) {
  const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/health", (r) => r.fulfill(json({ status: "ok", r_service: true, advisor: false })));
  await page.route("**/api/v1/meta-analysis/spec?*", (r) => r.fulfill(json(SPEC)));
  await page.route("**/api/v1/examples", (r) => r.fulfill(json({ count: 0, examples: [] })));
  await page.route("**/api/v1/meta-analysis/import", (r) => r.fulfill(json(PROBLEMS, 422)));
}

function watch(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    // the page asks for the import on purpose and is answered 422; Chromium logs any failed request
    if (m.type() === "error" && !/status of 422/.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
}

for (const width of [360, 768, 1280]) {
  for (const theme of ["light", "dark"] as const) {
    test(`Workbench steps 1 and 2 at ${String(width)} px, ${theme}`, async ({ page }) => {
      const errors = watch(page);
      await serveApi(page);
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`#/workbench?${PATHWAY}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Workbench");
      await expect(page.getByRole("heading", { name: "What the file needs" })).toBeVisible();
      await noSidewaysScroll(page);
      await page.locator('input[type="file"]').setInputFiles({
        name: "my-trials.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("study,ai,n1i,ci,n2i\n"),
      });
      await expect(page.getByRole("heading", { name: "1 problem to fix before the analysis can run" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Run the analysis" })).toBeDisabled();
      await noSidewaysScroll(page);
      expect(errors).toEqual([]);
    });

    test(`Workbench step 3, the results, at ${String(width)} px, ${theme}`, async ({ page }) => {
      const errors = watch(page);
      await serveApi(page);
      const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      await page.route("**/api/v1/meta-analysis/import", (r) =>
        r.fulfill(json({ pathway: {}, count: 13, studies: BCG, ignored_columns: [] })),
      );
      await page.route("**/api/v1/meta-analysis/run", (r) => r.fulfill(json(RUN)));
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`#/workbench?${PATHWAY}`);
      await expect(page.getByRole("heading", { name: "What the file needs" })).toBeVisible();
      await page.locator('input[type="file"]').setInputFiles({
        name: "bcg.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("study,ai,n1i,ci,n2i\n"),
      });
      await expect(page.getByRole("heading", { name: "13 studies ready to run" })).toBeVisible();
      await page.getByRole("button", { name: "Run the analysis" }).click();
      await expect(page.getByRole("heading", { name: "Pooled risk ratio" })).toBeFocused();
      await expect(page.getByText("95% CI 0.34 to 0.70", { exact: true })).toBeVisible();
      await expect(page.getByRole("img", { name: /^Forest plot of 13 studies/ })).toBeVisible();
      await expect(page.getByRole("img", { name: /^Funnel plot of 13 studies/ })).toBeVisible();
      await expect(page.getByRole("button", { name: "Copy the R code" })).toBeVisible();
      await noSidewaysScroll(page);
      expect(errors).toEqual([]);
    });

    test(`Workbench without its server at ${String(width)} px, ${theme}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/health", (r) => r.abort());
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`#/workbench?${PATHWAY}`);
      await expect(page.getByRole("heading", { name: "The Workbench needs its server" })).toBeVisible();
      await noSidewaysScroll(page);
      expect(errors).toEqual([]);
    });
  }
}

test("Workbench without a pathway lists the runnable analyses", async ({ page }) => {
  const errors = watch(page);
  await serveApi(page);
  await page.goto("#/workbench");
  await expect(page.getByRole("heading", { name: "Choose an analysis" })).toBeVisible();
  await noSidewaysScroll(page);
  expect(errors).toEqual([]);
});

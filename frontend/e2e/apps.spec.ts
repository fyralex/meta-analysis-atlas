// Each app at 360, 768 and 1280 px, in light and dark (#83). A page fails if it logs an error, throws, or
// scrolls sideways; wide tables and the 3D map scroll inside their own boxes, not the page.
import { expect, test, type Page } from "@playwright/test";

const F1 = encodeURIComponent("1. Interventional (effect of an intervention)");
const BINARY =
  `pathfinder?framework=${F1}&group=Two+groups+%28pairwise%29&datatype=Arm-level+summary+data&outcome=Binary` +
  "&rare=no&vary=unsure";

const PAGES: { name: string; path: string; heading: RegExp }[] = [
  { name: "home", path: "#/", heading: /^Find the right meta-analysis/ },
  { name: "Pathfinder", path: "#/pathfinder", heading: /^What kind of question/ },
  { name: "Pathfinder results", path: `#/${BINARY}`, heading: /^\d+ analyses fit your answers$/ },
  { name: "Cards", path: "#/cards", heading: /^Learn the building blocks$/ },
  { name: "a card", path: "#/cards?card=method%3AIV", heading: /^Learn the building blocks$/ },
  { name: "Atlas, 3D", path: "#/atlas", heading: /^Atlas$/ },
  { name: "Atlas, text view", path: "#/atlas?view=2d", heading: /^Atlas$/ },
];
const WIDTHS = [360, 768, 1280];
const THEMES = ["light", "dark"] as const;

/** Errors the page logs or throws while it loads. */
function watch(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

for (const p of PAGES) {
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      test(`${p.name} at ${String(width)} px, ${theme}`, async ({ page }) => {
        const errors = watch(page);
        await page.emulateMedia({ colorScheme: theme });
        await page.setViewportSize({ width, height: 900 });
        await page.goto(p.path);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(p.heading);
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
        expect(errors).toEqual([]);
      });
    }
  }
}

test("the Atlas draws the 3D map, not the text view", async ({ page }) => {
  const errors = watch(page);
  await page.goto("#/atlas");
  await expect(page.locator(".atlas-3d canvas")).toBeVisible();
  await expect(page.getByText(/can't draw the 3D map/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

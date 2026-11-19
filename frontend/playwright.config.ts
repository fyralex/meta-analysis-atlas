// Browser tests (#83): each app in a real browser, at phone, tablet and desktop widths, in both themes.
// They run in CI at releases and locally with `npm run e2e`; scripts/check.sh doesn't run them (CLAUDE.md, "Checks").
import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    // The production build, served as GitHub Pages serves it: under /meta-analysis-atlas/, with hash routes.
    baseURL: `http://localhost:${String(PORT)}/meta-analysis-atlas/`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Software WebGL, so headless Chromium can draw the 3D map.
        launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
      },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}/meta-analysis-atlas/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

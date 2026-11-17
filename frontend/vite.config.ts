import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// GitHub Pages serves the site under /meta-analysis-atlas/.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/meta-analysis-atlas/" : "/",
  plugins: [react()],
  // The map is read from ../spec/map.json at build time.
  server: { fs: { allow: [".", "../spec"] } },
  // Most of the bundle is the map's own data (map.json and why_not.json, about 420 kB, 125 kB with the
  // site's gzip for everything). It's needed on the first view, so it isn't split off.
  build: { chunkSizeWarningLimit: 800 },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
}));

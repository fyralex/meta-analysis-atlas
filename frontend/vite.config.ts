import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// GitHub Pages serves the site under /meta-analysis-atlas/; `vite preview` serves the build there too (#83).
export default defineConfig(({ command, isPreview }) => ({
  base: command === "build" || isPreview === true ? "/meta-analysis-atlas/" : "/",
  plugins: [react()],
  // The map is read from ../spec/map.json at build time.
  server: { fs: { allow: [".", "../spec"] } },
  // Most of the bundle is the map's own data (map.json and why_not.json, about 420 kB, 125 kB with the
  // site's gzip for everything). It's needed on the first view, so it isn't split off. The 3D view's chunk
  // (three.js and react-three-fiber, about 920 kB, 240 kB gzipped) loads only when 3D is chosen (#5).
  build: { chunkSizeWarningLimit: 950 },
  test: {
    environment: "jsdom",
    // e2e/ holds the browser tests, which Playwright runs (#83).
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
  },
}));

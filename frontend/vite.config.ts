import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// GitHub Pages serves the site under /meta-analysis-atlas/.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/meta-analysis-atlas/" : "/",
  plugins: [react()],
  // The map is read from ../spec/map.json at build time.
  server: { fs: { allow: [".."] } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
}));

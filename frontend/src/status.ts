import type { Status } from "./types/map";

// The words for each status, used everywhere a status is shown (CLAUDE.md, "Pathway status").
export const STATUS_TEXT: Record<Status, { name: string; meaning: string }> = {
  runnable: {
    name: "Runnable",
    meaning: "passes a validation test against a published worked example or the R package itself; can be run",
  },
  planned: { name: "Planned", meaning: "confirmed from its sources; its engine is on the roadmap" },
  specified: { name: "Specified", meaning: "confirmed from its sources; not planned yet" },
  to_check: { name: "To check", meaning: "not yet confirmed from a primary source" },
};

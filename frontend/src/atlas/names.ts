import type { Tier } from "./filter";

export const TIER_NAMES: Record<Tier, string> = {
  framework: "Framework",
  group: "Group structure",
  datatype: "Datatype",
  outcome: "Outcome type",
  model: "Model",
  method: "Method",
  metric: "Metric",
};

/** The matching pathways are listed in full once they are this few. */
export const LIST_LIMIT = 60;

// The settings a run may change (decision 0019): for random effects, the between-study variance estimator and the
// interval; for every model, the confidence level. The defaults are the backend's own (REML, Wald, 95%).
import type { Options } from "../types/api";

export type Estimator = NonNullable<Options["estimator"]>;
export type Interval = NonNullable<Options["interval"]>;

/**
 * The estimators of metafor's rma.uni() a request may choose, named as its documentation names them (its `method`
 * argument). GENQ and GENQM aren't offered: they need study weights, which a request can't carry (decision 0019).
 */
export const ESTIMATORS: readonly { value: Estimator; label: string }[] = [
  { value: "REML", label: "Restricted maximum likelihood (REML)" },
  { value: "DL", label: "DerSimonian-Laird (DL)" },
  { value: "PM", label: "Paule-Mandel (PM)" },
  { value: "PMM", label: "Median-unbiased Paule-Mandel (PMM)" },
  { value: "ML", label: "Maximum likelihood (ML)" },
  { value: "EB", label: "Empirical Bayes (EB)" },
  { value: "HE", label: "Hedges (HE)" },
  { value: "HS", label: "Hunter-Schmidt (HS)" },
  { value: "HSk", label: "Hunter-Schmidt, small-sample corrected (HSk)" },
  { value: "SJ", label: "Sidik-Jonkman (SJ)" },
];

export const INTERVALS: readonly { value: Interval; label: string }[] = [
  { value: "z", label: "Wald (normal distribution)" },
  { value: "knha", label: "Hartung-Knapp-Sidik-Jonkman" },
];

export interface Settings {
  estimator: Estimator;
  interval: Interval;
  /** In percent. */
  level: number;
}

export const DEFAULTS: Settings = { estimator: "REML", interval: "z", level: 95 };

/** A level /run accepts: above 0% and below 100%, the backend's own bounds (backend/app/plans.py, Options). */
export function validLevel(level: number): boolean {
  return Number.isFinite(level) && level > 0 && level < 100;
}

/** The settings in a line, for the fold's summary: "REML · Wald · 95%". */
export function settingsLine(s: Settings, random: boolean): string {
  const level = `Level: ${String(s.level)}%`;
  if (!random) return level;
  const interval = s.interval === "z" ? "Wald" : "Hartung-Knapp-Sidik-Jonkman";
  return `Between-study variance: ${s.estimator} · Interval: ${interval} · ${level}`;
}

/** The options for /run: estimator and interval only where the model has random effects. */
export function toOptions(s: Settings, random: boolean): Options {
  return random ? { estimator: s.estimator, interval: s.interval, level: s.level } : { level: s.level };
}

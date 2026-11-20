// Step 3's numbers (#178): what the page shows from /run's answer. Every value is the backend's (metafor's), except
// each study's confidence interval in the forest plot, which is drawn here from the study's estimate and sampling
// variance as yi ± z × √vi, z the normal quantile for the analysis's level: the interval that metafor's summary() of
// an escalc() table gives (checked in numbers.test.ts against metafor 5.0.1), back-transformed for ratios.
import type { Labels, RunResponse, SourceRef } from "../types/api";

const RATIOS = ["OR", "RR", "PETO"];
const MINUS = "−";

export const isRatio = (metric: string): boolean => RATIOS.includes(metric);

/** The value meaning no difference between the groups: 1 for a ratio, 0 for a difference. */
export const noEffect = (metric: string): number => (isRatio(metric) ? 1 : 0);

const NAMES: Record<string, string> = {
  OR: "odds ratio",
  RR: "risk ratio",
  PETO: "Peto odds ratio",
  RD: "risk difference",
  AS: "arcsine difference",
};

/** The measure in words: "risk ratio". */
export const measureName = (metric: string): string => NAMES[metric] ?? metric;

/** Decimal places for values on the scale shown: ratios to 2, differences and log values to 3. */
export const placesFor = (metric: string): number => (isRatio(metric) ? 2 : 3);

/** A number with a fixed number of places and a true minus sign; "−0" is written "0". */
export function num(value: number, places: number): string {
  const text = Math.abs(value).toFixed(places);
  return (value < 0 && Number(text) !== 0 ? MINUS : "") + text;
}

export function pText(p: number): string {
  return p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`;
}

/** A variance: three places, or two significant figures when it is small but not zero. */
export function varianceText(v: number): string {
  if (v === 0) return "0";
  return Math.abs(v) < 0.001 ? v.toPrecision(2) : v.toFixed(3);
}

export const levelText = (level: number): string => `${String(level)}%`;

// Wichura's algorithm AS241 (Applied Statistics 37, 1988), the one R's qnorm() uses: about 16 significant figures.
// Coefficients highest power first, for Horner's rule.
const AS241 = {
  a: [2509.0809287301227, 33430.57558358813, 67265.7709270087, 45921.95393154987, 13731.69376550946, 1971.5909503065513, 133.14166789178438, 3.3871328727963665],
  b: [5226.495278852546, 28729.085735721943, 39307.89580009271, 21213.794301586597, 5394.196021424751, 687.1870074920579, 42.31333070160091, 1],
  c: [0.0007745450142783414, 0.022723844989269184, 0.2417807251774506, 1.2704582524523684, 3.6478483247632045, 5.769497221460691, 4.630337846156546, 1.4234371107496835],
  d: [1.0507500716444169e-09, 0.0005475938084995345, 0.015198666563616457, 0.14810397642748008, 0.6897673349851, 1.6763848301838038, 2.053191626637759, 1],
  e: [2.0103343992922881e-07, 2.7115555687434876e-05, 0.0012426609473880784, 0.026532189526576124, 0.29656057182850487, 1.7848265399172913, 5.463784911164114, 6.657904643501103],
  f: [2.0442631033899397e-15, 1.421511758316446e-07, 1.8463183175100548e-05, 0.0007868691311456133, 0.014875361290850615, 0.1369298809227358, 0.599832206555888, 1],
} as const;

const poly = (k: readonly number[], x: number) => k.reduce((sum, coef) => sum * x + coef, 0);

/** The standard normal quantile function, as R's qnorm(). */
export function qnorm(p: number): number {
  if (!(p > 0 && p < 1)) return Number.NaN;
  const q = p - 0.5;
  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    return (q * poly(AS241.a, r)) / poly(AS241.b, r);
  }
  let r = Math.sqrt(-Math.log(q < 0 ? p : 1 - p));
  let value: number;
  if (r <= 5) {
    r -= 1.6;
    value = poly(AS241.c, r) / poly(AS241.d, r);
  } else {
    r -= 5;
    value = poly(AS241.e, r) / poly(AS241.f, r);
  }
  return q < 0 ? -value : value;
}

/** z for a two-sided interval at `level` percent: 1.96 for 95%. */
export const zFor = (level: number): number => qnorm(1 - (1 - level / 100) / 2);

export interface Pooled {
  estimate: number | null;
  lower: number | null;
  upper: number | null;
  piLower: number | null;
  piUpper: number | null;
}

/** The pooled values on the scale people read: back-transformed for ratios, as they are for differences. */
export function pooled(res: RunResponse): Pooled {
  const on = res.ratio_scale ?? res.summary;
  const get = (key: string) => on[key] ?? null;
  return {
    estimate: get("estimate"),
    lower: get("ci_lower"),
    upper: get("ci_upper"),
    piLower: get("pi_lower"),
    piUpper: get("pi_upper"),
  };
}

export interface ForestRow {
  study: string;
  /** On the scale shown: back-transformed for ratios. */
  estimate: number;
  lower: number;
  upper: number;
  /** In percent, as metafor's weights() gives it. */
  weight: number;
}

/** One row per study the model used, with its interval at the analysis's level. */
export function forestRows(res: RunResponse): ForestRow[] {
  const z = zFor(res.options.level ?? 95);
  const back = isRatio(res.pathway.metric) ? Math.exp : (x: number) => x;
  const rows: ForestRow[] = [];
  for (const s of res.studies) {
    if (!s.used || s.yi === null || s.vi === null || s.weight === null || s.vi < 0) continue;
    const se = Math.sqrt(s.vi);
    rows.push({ study: s.study, estimate: back(s.yi), lower: back(s.yi - z * se), upper: back(s.yi + z * se), weight: s.weight });
  }
  return rows;
}

/** Ratios are drawn between these, with an arrow where an interval goes further. */
export const RATIO_LIMITS = [0.01, 100] as const;

/** The forest plot's axis: every interval, the pooled values and no effect, within the ratio limits. */
export function forestDomain(metric: string, rows: readonly ForestRow[], p: Pooled): [number, number] {
  const values = [noEffect(metric)];
  for (const r of rows) values.push(r.lower, r.upper);
  for (const v of [p.lower, p.upper, p.piLower, p.piUpper]) if (v !== null) values.push(v);
  const finite = values.filter((v) => Number.isFinite(v) && (!isRatio(metric) || v > 0));
  let lo = Math.min(...finite);
  let hi = Math.max(...finite);
  if (isRatio(metric)) {
    lo = Math.max(lo, RATIO_LIMITS[0]);
    hi = Math.min(hi, RATIO_LIMITS[1]);
  }
  return [lo, hi];
}

/** Ticks for a log axis: the usual 1-2-5 values within the domain. */
export function ratioTicks([lo, hi]: readonly [number, number]): number[] {
  const all = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
  const inside = all.filter((t) => t >= lo * 0.999 && t <= hi * 1.001);
  // with a wide range, keep 1 and every other value from it outwards
  if (inside.length <= 7) return inside;
  const one = inside.indexOf(1);
  return inside.filter((_, i) => (i - one) % 2 === 0);
}

/** A response's sources as the map writes a source string: "CH-6 s6.4.1.1, s6.4.1.3, CH-10 s10.3.2". */
export function sourceText(refs: readonly SourceRef[]): string {
  const parts: string[] = [];
  let last = "";
  for (const r of refs) {
    const section = r.section === "" ? "" : `s${r.section}`;
    if (r.key === last && section !== "") parts.push(section);
    else parts.push(section === "" ? r.key : `${r.key} ${section}`);
    last = r.key;
  }
  return parts.join(", ");
}

/** Words for the sentence, as typed; blank fields are left out, and none at all sends no labels. */
export function labelsToSend(labels: Labels): Labels | null {
  const out: Labels = {};
  for (const key of ["outcome", "treatment", "control"] as const) {
    const words = (labels[key] ?? "").trim();
    if (words !== "") out[key] = words;
  }
  return Object.keys(out).length > 0 ? out : null;
}

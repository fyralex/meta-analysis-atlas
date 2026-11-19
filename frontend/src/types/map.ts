// The shape of spec/map.json, written by spec/build_map.py.
// src/map.test.ts checks every pathway in the real file against it.

export type Status = "runnable" | "planned" | "specified" | "to_check";
export const STATUSES: readonly Status[] = ["runnable", "planned", "specified", "to_check"];

export interface Pathway {
  framework: string;
  group: string;
  datatype: string;
  outcome: string;
  model: string;
  method: string;
  metric: string;
  verified: boolean;
  added: boolean;
  /** Added and not yet accepted by the methodologist: shows the "new" badge. */
  new: boolean;
  milestone: string;
  status: Status;
}

export interface Metric {
  label: string;
  call: string;
  src: string;
  added: boolean;
  /** Added and not yet accepted by the methodologist: shows the "new" badge. */
  new: boolean;
  verified: boolean;
  only: string[] | null;
}

export interface Method {
  label: string;
  fn: string;
  domain: string;
  takes: string[];
  models: string[];
  analysis: string[];
  src: string[];
  metrics: string[] | null;
  note: string;
  added: boolean;
  /** Added and not yet accepted by the methodologist: shows the "new" badge. */
  new: boolean;
  verified: boolean;
  added_models: string[];
}

export interface Branch {
  fw: string;
  group: string;
  datatype: string;
  kind: string;
  outcome: string;
  inputs: string;
  metrics: string[];
  domain: string;
  added: boolean;
  /** Added and not yet accepted by the methodologist: shows the "new" badge. */
  new: boolean;
  verified: boolean;
  note: string;
  /** Keys of `sources` for the data this branch reads, its metrics and its note. */
  src: string[];
}

/** A note on a framework, group or datatype node; `src` is written like a rule's source. */
export interface Note {
  tier: "framework" | "group" | "datatype";
  value: string;
  text: string;
  src: string;
}

export interface MapData {
  order: string[];
  sources: Record<string, [label: string, url: string]>;
  branches: Branch[];
  rules: [id: string, rule: string, comparedWithV11: string, source: string][];
  cross_cutting: [section: string, content: string, source: string][];
  notes: Note[];
  open_items: string[];
  /** Method and metric pairs whose pathways stay to check, each with why. */
  unconfirmed: { method: string; metric: string; why: string }[];
  /** A method and an input it reads (a branch kind) whose pairing is not confirmed. */
  unconfirmed_input: { method: string; input: string; why: string }[];
  metrics: Record<string, Metric>;
  methods: Record<string, Method>;
  pathways: Pathway[];
}

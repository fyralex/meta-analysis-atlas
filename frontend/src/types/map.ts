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
  milestone: string;
  status: Status;
}

export interface Metric {
  label: string;
  call: string;
  src: string;
  added: boolean;
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
  verified: boolean;
  note: string;
}

export interface MapData {
  order: string[];
  sources: Record<string, [label: string, url: string]>;
  branches: Branch[];
  rules: [id: string, rule: string, comparedWithV11: string, source: string][];
  cross_cutting: [section: string, content: string, source: string][];
  open_items: string[];
  /** Method and metric pairs whose pathways stay to check, each with why. */
  unconfirmed: { method: string; metric: string; why: string }[];
  metrics: Record<string, Metric>;
  methods: Record<string, Method>;
  pathways: Pathway[];
}

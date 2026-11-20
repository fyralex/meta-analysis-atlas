// The backend's API, typed from its OpenAPI schema (#164). Each call returns the response's type
// or throws an ApiError carrying the API's stable `code` (CLAUDE.md, "API"), so pages can tell a
// pathway that isn't runnable from bad data, a failed fit or a server that can't be reached.
import type {
  DataSpec,
  ErrorBody,
  Example,
  ExampleList,
  FieldError,
  Health,
  ImportResult,
  PathwayRef,
  RunRequest,
  RunResponse,
} from "../types/api";

/** The API's base address: empty means the same origin, as behind the Docker Compose stack's nginx. */
export const API_BASE: string = (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: FieldError[];
  readonly details: Record<string, unknown>;

  constructor(status: number, body: ErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.fields = body.fields ?? [];
    this.details = body.details ?? {};
  }
}

function isErrorBody(value: unknown): value is ErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(0, { code: "network_error", message: "The server could not be reached." });
  }
  if (response.ok) {
    return (await response.json()) as T;
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // not JSON: a proxy's own page, for example
  }
  throw new ApiError(
    response.status,
    isErrorBody(body) ? body : { code: "http_error", message: `The server answered ${String(response.status)}.` },
  );
}

const TIERS = ["framework", "group", "datatype", "outcome", "model", "method", "metric"] as const;

/** A pathway's seven tiers as query parameters. */
export function pathwayQuery(pathway: PathwayRef): string {
  return new URLSearchParams(TIERS.map((tier) => [tier, pathway[tier]])).toString();
}

export const api = {
  health: (): Promise<Health> => call<Health>("/health"),

  /** What a runnable pathway's study table must hold. */
  spec: (pathway: PathwayRef): Promise<DataSpec> => call<DataSpec>(`/api/v1/meta-analysis/spec?${pathwayQuery(pathway)}`),

  /** The address of the pathway's CSV template, for a download link. */
  templateUrl: (pathway: PathwayRef): string => `${API_BASE}/api/v1/meta-analysis/template?${pathwayQuery(pathway)}`,

  /** Check an uploaded CSV against the pathway's column spec. */
  importCsv: (pathway: PathwayRef, file: Blob, filename = "studies.csv"): Promise<ImportResult> => {
    const form = new FormData();
    for (const tier of TIERS) form.append(tier, pathway[tier]);
    form.append("file", file, filename);
    return call<ImportResult>("/api/v1/meta-analysis/import", { method: "POST", body: form });
  },

  /** Run a runnable pathway. */
  run: (request: RunRequest): Promise<RunResponse> =>
    call<RunResponse>("/api/v1/meta-analysis/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }),

  examples: (): Promise<ExampleList> => call<ExampleList>("/api/v1/examples"),

  example: (id: string): Promise<Example> => call<Example>(`/api/v1/examples/${encodeURIComponent(id)}`),

  /** The address of an example's CSV, for a download link. */
  exampleCsvUrl: (id: string): string => `${API_BASE}/api/v1/examples/${encodeURIComponent(id)}/studies.csv`,
};

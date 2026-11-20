// Step 2's table (#165): the studies as read, from an upload or an example, with the problems the backend found.
// The checks are the backend's (backend/app/data_spec.py); this only places each problem on its row and cell.
import { ApiError } from "../api/client";
import type { Example, FieldError, ImportResult } from "../types/api";

export interface TableRow {
  /** The row in the file as a spreadsheet numbers it; null for a study that didn't come from a file. */
  row: number | null;
  /** Each column's cell as written in the file, or as the example holds it. */
  cells: Record<string, string>;
}

export interface StudyTable {
  /** Where the studies came from: the file's name or the example's title. */
  source: string;
  rows: TableRow[];
  /** Empty when the studies are ready to run. */
  problems: FieldError[];
  /** The studies as /run takes them; null while there are problems. */
  studies: Record<string, unknown>[] | null;
  /** Columns in the file that the pathway doesn't read. */
  ignored: string[];
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function asRows(studies: Record<string, unknown>[], columns: readonly string[]): TableRow[] {
  return studies.map((s) => ({ row: null, cells: Object.fromEntries(columns.map((c) => [c, cellText(s[c])])) }));
}

export function fromImport(result: ImportResult, source: string, columns: readonly string[]): StudyTable {
  return {
    source,
    rows: asRows(result.studies, columns),
    problems: [],
    studies: result.studies,
    ignored: result.ignored_columns,
  };
}

export function fromExample(example: Example, columns: readonly string[]): StudyTable {
  return { source: example.title, rows: asRows(example.studies, columns), problems: [], studies: example.studies, ignored: [] };
}

function isRow(value: unknown): value is TableRow {
  if (typeof value !== "object" || value === null) return false;
  const { row, cells } = value as { row?: unknown; cells?: unknown };
  return typeof row === "number" && typeof cells === "object" && cells !== null;
}

/** An upload the backend refused: its problems, and the rows as written when the problems are in the studies. */
export function fromError(error: ApiError, source: string): StudyTable {
  const problems = error.fields.length > 0 ? error.fields : [{ path: "file", message: error.message }];
  const raw = error.details["rows"];
  const rows = Array.isArray(raw) ? raw.filter(isRow) : [];
  return {
    source,
    rows: rows.map((r) => ({ row: r.row, cells: Object.fromEntries(Object.entries(r.cells).map(([k, v]) => [k, cellText(v)])) })),
    problems,
    studies: null,
    ignored: [],
  };
}

/** Where a problem sits: `data.3.ai` is the fourth study's ai cell, `data.3` the whole fourth study. */
export function placeOf(path: string): { index: number; column: string | null } | null {
  const match = /^data\.(\d+)(?:\.(\w+))?$/.exec(path);
  if (!match) return null;
  return { index: Number(match[1]), column: match[2] ?? null };
}

/** For each study with a problem, the columns marked (an empty set marks the whole row). */
export function marks(problems: readonly FieldError[]): Map<number, Set<string>> {
  const out = new Map<number, Set<string>>();
  for (const p of problems) {
    const place = placeOf(p.path);
    if (!place) continue;
    const set = out.get(place.index) ?? new Set<string>();
    if (place.column !== null) set.add(place.column);
    out.set(place.index, set);
  }
  return out;
}

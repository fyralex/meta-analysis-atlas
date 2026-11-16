import raw from "../../spec/map.json";
import { STATUSES, type MapData, type Status } from "./types/map";

// Read at build time. The JSON's inferred type is wider than MapData (strings for the
// statuses, arrays for the tuples), so it is narrowed here; src/map.test.ts checks
// the real file against MapData field by field.
export const map = raw as unknown as MapData;

export function countByStatus(data: MapData): Record<Status, number> {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const p of data.pathways) counts[p.status] += 1;
  return counts;
}

// A source as the map writes it ("CH-10 s10.4.2, s10.4.4.3, MF-peto"), turned into
// references: each key from the map's sources, with the sections that follow it.

import type { MapData } from "./types/map";

export interface Reference {
  key: string;
  label: string;
  url: string;
  /** Sections of the source, e.g. ["s10.4.2", "s10.4.4.3"]; empty when none is given. */
  sections: string[];
}

const SECTION = /^s\d/;

/** Parse a source string. A word starting with "s" and a digit is a section of the key before it. */
export function parseSource(field: string): { key: string; sections: string[] }[] {
  const out: { key: string; sections: string[] }[] = [];
  for (const part of field.split(",")) {
    for (const word of part.trim().split(/\s+/)) {
      if (word === "") continue;
      const last = out.at(-1);
      if (SECTION.test(word) && last) last.sections.push(word);
      else out.push({ key: word, sections: [] });
    }
  }
  return out;
}

/** The references a source string cites. A key the map doesn't list is kept, with no link. */
export function references(map: MapData, field: string): Reference[] {
  return parseSource(field).map(({ key, sections }) => {
    const known = map.sources[key];
    return { key, label: known?.[0] ?? key, url: known?.[1] ?? "", sections };
  });
}

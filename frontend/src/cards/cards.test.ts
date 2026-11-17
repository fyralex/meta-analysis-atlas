import { describe, expect, it } from "vitest";
import { TIERS } from "../atlas/filter";
import { map } from "../map";
import { parseSource } from "../sources";
import { cardById, cardFor, cardHref, cards, searchCards } from "./cards";

const CARD_KEYS = ["added", "facts", "id", "notes", "rules", "src", "teach", "tier", "title", "value", "verified"];

describe("spec/cards.json as the frontend reads it", () => {
  it("gives every card exactly the fields of Card", () => {
    for (const c of cards) {
      expect(Object.keys(c).sort()).toEqual(CARD_KEYS);
      expect([...TIERS, "rule"]).toContain(c.tier);
      for (const f of c.facts) expect(Object.keys(f).sort()).toEqual(["code", "items", "label"]);
      for (const n of c.notes) expect(Object.keys(n).sort()).toEqual(["src", "text"]);
      for (const t of c.teach) {
        expect(Object.keys(t).sort()).toEqual(["kind", "src", "text"]);
        expect(["what", "use", "caution"]).toContain(t.kind);
      }
    }
  });

  it("has a card for every node a pathway goes through, and for every rule", () => {
    for (const p of map.pathways) for (const t of TIERS) expect(cardFor(t, p[t]), `${t}=${p[t]}`).toBeDefined();
    for (const [id] of map.rules) expect(cardFor("rule", id)).toBeDefined();
  });

  it("cites only sources the map lists, at least one per card", () => {
    for (const c of cards) {
      const keys = parseSource(c.src).map((r) => r.key);
      expect(keys.length, c.id).toBeGreaterThan(0);
      expect(
        keys.filter((k) => !(k in map.sources)),
        c.id,
      ).toEqual([]);
    }
  });
});

describe("finding cards", () => {
  it("looks a card up by id and by node", () => {
    expect(cardById("method:PETO")?.title).toBe("Peto");
    expect(cardFor("metric", "PR")?.id).toBe("metric:PR");
    expect(cardById("method:NOPE")).toBeUndefined();
  });

  it("links to a card on the Cards page", () => {
    expect(cardHref("rule:R5")).toBe("/cards?card=rule%3AR5");
  });

  it("searches titles and values, ignoring case", () => {
    expect(searchCards(cards, "")).toHaveLength(cards.length);
    expect(searchCards(cards, "  peto ").map((c) => c.id)).toEqual(
      expect.arrayContaining(["method:PETO", "metric:PETO"].filter((id) => cardById(id))),
    );
    expect(searchCards(cards, "r5").map((c) => c.id)).toContain("rule:R5");
    expect(searchCards(cards, "zzzz")).toEqual([]);
  });
});

import raw from "../../../spec/cards.json";
import type { Card, CardTier } from "../types/cards";

// Read at build time; src/cards/cards.test.ts checks the real file against Card.
export const cards = raw as unknown as Card[];

const byId = new Map(cards.map((c) => [c.id, c]));
const byNode = new Map(cards.map((c) => [`${c.tier}=${c.value}`, c]));

export function cardById(id: string): Card | undefined {
  return byId.get(id);
}

/** The card for a node of the map, or for a rule (tier "rule", value "R5"). */
export function cardFor(tier: CardTier, value: string): Card | undefined {
  return byNode.get(`${tier}=${value}`);
}

/** The address of a card on the Cards page. */
export function cardHref(id: string): string {
  return `/cards?card=${encodeURIComponent(id)}`;
}

/** Cards whose title or value contains the query, ignoring case. */
export function searchCards(all: readonly Card[], query: string): Card[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...all];
  return all.filter((c) => c.title.toLowerCase().includes(q) || c.value.toLowerCase().includes(q));
}

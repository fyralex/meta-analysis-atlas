// The shape of spec/cards.json, written by spec/build_map.py.
// src/cards/cards.test.ts checks every card in the real file against it.

import type { Tier } from "../atlas/filter";

export type CardTier = Tier | "rule";

export interface Fact {
  label: string;
  items: string[];
  /** The items are R code. */
  code: boolean;
}

export interface CardNote {
  text: string;
  /** Written like a rule's source: "CH-10 s10.4.2, MF-peto". */
  src: string;
}

export type TeachKind = "what" | "use" | "caution";

/** One line of teaching text, with the source it states in our own words. */
export interface TeachLine {
  kind: TeachKind;
  text: string;
  src: string;
}

export interface Card {
  id: string;
  tier: CardTier;
  /** The value pathways use (a code for methods and metrics), or the rule's id. */
  value: string;
  title: string;
  added: boolean;
  verified: boolean;
  facts: Fact[];
  notes: CardNote[];
  /** Ids of the rules about this node, e.g. "R5". */
  rules: string[];
  /** Teaching text; empty until the card's batch is written. */
  teach: TeachLine[];
  src: string;
}

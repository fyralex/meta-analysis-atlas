// The three apps, in the order the header lists them, each with the issue that built it and how far it has got.
export const APPS = [
  {
    path: "/pathfinder",
    name: "Pathfinder",
    what: "A few questions about your review lead to its pathways.",
    issue: 7,
    state:
      "Built: the questions about the kind of review, its groups, data and outcome, then advice on rare events and on whether effects vary.",
  },
  {
    path: "/cards",
    name: "Cards",
    what: "A teaching card for every choice and rule, with references.",
    issue: 6,
    state:
      "A card for every choice and rule, with teaching text for every choice whose source has been read, and a glossary linked from the cards.",
  },
  {
    path: "/atlas",
    name: "Atlas",
    what: "The whole map, in 3D and 2D, narrowing as you choose.",
    issue: 4,
    state: "Built: the 2D view (the accessible default) and the 3D view, sharing the same counts and settings.",
  },
] as const;

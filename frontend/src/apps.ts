// The three v0.1 apps, each with the issue that builds it and how far it has got.
export const APPS = [
  {
    path: "/atlas",
    name: "Atlas",
    what: "The whole map, in 3D and 2D, narrowing as you choose.",
    issue: 4,
    state: "The 2D view is built; the 3D view isn't yet.",
  },
  {
    path: "/pathfinder",
    name: "Pathfinder",
    what: "A few questions about your review lead to its pathways.",
    issue: 7,
    state: "Not built yet.",
  },
  {
    path: "/cards",
    name: "Cards",
    what: "A teaching card for every choice and rule, with references.",
    issue: 6,
    state: "Not built yet.",
  },
] as const;

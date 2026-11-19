// Pathfinder's small map (#92, design E2). jsdom has no WebGL, so here the browser is said to have WebGL 2 and the
// three.js map is replaced by a list of what it would draw: that it is read-only, small, and lights the answers.
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { SceneLayer, SceneNode } from "../atlas/scene";

vi.mock("../atlas/scene", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../atlas/scene")>()),
  hasWebGL: () => true,
}));
vi.mock("../atlas/Atlas3D", () => ({
  default: ({
    layers,
    onPick,
    compact,
  }: {
    layers: SceneLayer[];
    onPick?: (n: SceneNode) => void;
    compact?: boolean;
  }) => (
    <ul aria-label="small map" data-readonly={String(onPick === undefined)} data-compact={String(compact === true)}>
      {layers
        .flatMap((l) => l.nodes)
        .filter((n) => n.selected)
        .map((n) => (
          <li key={`${n.tier}=${n.value}`}>{`${n.tier}: ${n.value}`}</li>
        ))}
    </ul>
  ),
}));

const F1 = "1. Interventional (effect of an intervention)";

function open(query: string) {
  const router = createMemoryRouter([{ path: "*", element: <App /> }], { initialEntries: [`/pathfinder${query}`] });
  render(<RouterProvider router={router} />);
}

describe("Pathfinder's small map", { timeout: 15_000 }, () => {
  it("is read-only and small, and lights the answers so far as the path", async () => {
    open(`?framework=${encodeURIComponent(F1)}&group=Two+groups+%28pairwise%29`);
    const small = await screen.findByRole("list", { name: "small map" });
    expect(small).toHaveAttribute("data-readonly", "true");
    expect(small).toHaveAttribute("data-compact", "true");
    expect([...small.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      `framework: ${F1}`,
      "group: Two groups (pairwise)",
    ]);
    expect(screen.getByText(/Your answers so far, lit as a path through the map/)).toBeInTheDocument();
  });

  it("lights only the answers, not choices from the address that Pathfinder doesn't use", async () => {
    open(`?framework=${encodeURIComponent(F1)}&model=Random+effects`);
    const small = await screen.findByRole("list", { name: "small map" });
    expect([...small.querySelectorAll("li")].map((li) => li.textContent)).toEqual([`framework: ${F1}`]);
  });
});

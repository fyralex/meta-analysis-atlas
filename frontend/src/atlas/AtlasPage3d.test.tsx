// The 3D view's wiring in the Atlas page. jsdom has no WebGL, so here the browser is said to have WebGL 2 and the
// three.js view is replaced by a list of its nodes as buttons: the page's handling of a pick, and its fallback
// when the 3D view fails, are what is tested. scene.test.ts checks the scene's counts themselves.
import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { SceneLayer, SceneNode } from "./scene";

const state = vi.hoisted(() => ({ fail: false }));

vi.mock("./scene", async (importOriginal) => ({ ...(await importOriginal<typeof import("./scene")>()), hasWebGL: () => true }));
vi.mock("./Atlas3D", () => ({
  default: ({ layers, onPick }: { layers: SceneLayer[]; onPick: (n: SceneNode) => void }) => {
    if (state.fail) throw new Error("the browser couldn't draw it after all");
    return (
      <ul aria-label="3D nodes">
        {layers
          .flatMap((l) => l.nodes)
          .map((n) => (
            <li key={`${n.tier}=${n.value}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(n);
                }}
              >{`${n.tier}: ${n.label} (${String(n.count)})`}</button>
            </li>
          ))}
      </ul>
    );
  },
}));

function open(query: string) {
  const router = createMemoryRouter([{ path: "*", element: <App /> }], { initialEntries: [`/atlas${query}`] });
  render(<RouterProvider router={router} />);
  return router;
}

const params = (router: ReturnType<typeof open>) => new URLSearchParams(router.state.location.search);
const F1 = "1. Interventional (effect of an intervention)";
const DTA = "2. Diagnostic test accuracy";

// These tests render whole pages; see the note in App.test.tsx (#49).
describe("the Atlas in 3D", { timeout: 15_000 }, () => {
  afterEach(() => {
    state.fail = false;
  });

  it("chooses a node on a click, as the 2D view does", async () => {
    const router = open("?view=3d");
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^framework: ${F1.replace(/[().]/g, "\\$&")} \\(`) }));
    expect(params(router).get("framework")).toBe(F1);
    expect(params(router).get("view")).toBe("3d");
  });

  it("keeps the choices and Pathfinder's answers when the view switches", async () => {
    const router = open(`?view=3d&rare=yes&framework=${encodeURIComponent(F1)}`);
    await screen.findByRole("list", { name: "3D nodes" });
    fireEvent.click(screen.getByRole("radio", { name: /^2D/ }));
    expect(params(router).get("view")).toBe("2d");
    expect(params(router).get("rare")).toBe("yes");
    expect(params(router).get("framework")).toBe(F1);
    fireEvent.click(screen.getByRole("radio", { name: /^3D/ }));
    expect(params(router).get("view")).toBeNull();
    expect(params(router).get("framework")).toBe(F1);
  });

  it("opens on the 3D map where the browser can draw it (#92, design E)", async () => {
    open("");
    expect(await screen.findByRole("list", { name: "3D nodes" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^3D/ })).toBeChecked();
  });

  it("opens, and closes again, the why-not panel for a node no pathway fits", async () => {
    open(`?view=3d&framework=${encodeURIComponent(DTA)}`);
    const grey = await screen.findByRole("button", { name: "group: Two groups (pairwise) (0)" });
    fireEvent.click(grey);
    expect(screen.getByRole("heading", { name: "Why not Two groups (pairwise)?" })).toBeInTheDocument();
    fireEvent.click(grey);
    expect(screen.queryByRole("heading", { name: "Why not Two groups (pairwise)?" })).toBeNull();
  });

  it("falls back to the 2D view, and says so, when the 3D view fails", async () => {
    state.fail = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    open("?view=3d");
    expect(await screen.findByText("The 3D view couldn't be drawn here, so the Atlas shows 2D.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^3D/ })).toBeDisabled();
    expect(screen.getAllByRole("toolbar").length).toBe(7);
    vi.restoreAllMocks();
  });
});

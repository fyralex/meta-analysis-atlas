// The 3D view's wiring in the Atlas page. jsdom has no WebGL, so here the browser is said to have WebGL 2 and the
// three.js view is replaced by a list of its nodes as buttons: the page's handling of a pick, and its fallback
// when the 3D view fails, are what is tested. scene.test.ts checks the scene's counts themselves.
import { fireEvent, render, screen, within } from "@testing-library/react";
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
    fireEvent.click(screen.getByRole("radio", { name: /^Text view/ }));
    expect(params(router).get("view")).toBe("2d");
    expect(params(router).get("rare")).toBe("yes");
    expect(params(router).get("framework")).toBe(F1);
    fireEvent.click(screen.getByRole("radio", { name: /^3D map/ }));
    expect(params(router).get("view")).toBeNull();
    expect(params(router).get("framework")).toBe(F1);
  });

  it("shows beside the map what was clicked and the options at the next step, read-only (#92, design E)", async () => {
    const router = open("");
    const panel = screen.getByRole("complementary", { name: "What you clicked" });
    expect(panel).toHaveTextContent("Click a dot on the map to see what it is");
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^framework: ${F1.replace(/[().]/g, "\\$&")} \\(`) }));
    expect(params(router).get("framework")).toBe(F1);
    // what it is: its plain name, its technical name, its card's first line and a link to the card
    expect(panel).toHaveTextContent("What are the effects of a treatment or other intervention?");
    expect(panel).toHaveTextContent(`Technical name: ${F1}`);
    expect(within(panel).getByRole("link", { name: "Read its card (opens Cards)" })).toHaveAttribute(
      "href",
      "/cards?card=framework%3Ainterventional-effect-of-an-intervention",
    );
    // the next step's options, with their counts, and nothing in the panel to click but the card link
    const next = within(panel).getByRole("region", { name: "Next: group structure" });
    expect(next).toHaveTextContent(/Two groups compared\s*157/);
    expect(within(panel).queryAllByRole("button")).toHaveLength(0);
    expect(within(panel).getByRole("region", { name: "Your choices" })).toHaveTextContent("Framework");
    // a second click undoes the choice, and the panel says what to do again
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^framework: ${F1.replace(/[().]/g, "\\$&")} \\(`) }));
    expect(params(router).get("framework")).toBeNull();
    expect(panel).toHaveTextContent("Click a dot on the map to see what it is");
  });

  it("shows why a grey dot doesn't fit in the panel beside the map", async () => {
    open(`?framework=${encodeURIComponent(DTA)}`);
    fireEvent.click(await screen.findByRole("button", { name: "group: Two groups (pairwise) (0)" }));
    const panel = screen.getByRole("complementary", { name: "What you clicked" });
    expect(within(panel).getByRole("heading", { name: "Why not Two groups (pairwise)?" })).toBeInTheDocument();
  });

  it("opens on the 3D map where the browser can draw it (#92, design E)", async () => {
    open("");
    expect(await screen.findByRole("list", { name: "3D nodes" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^3D map/ })).toBeChecked();
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
    const notice = await screen.findByText("The 3D map couldn't be drawn here, so the Atlas shows the text view.");
    // in view, not folded inside "Display options"
    expect(notice.closest("details")).toBeNull();
    expect(screen.getByRole("radio", { name: /^3D map/ })).toBeDisabled();
    expect(screen.getAllByRole("toolbar").length).toBe(7);
    vi.restoreAllMocks();
  });
});

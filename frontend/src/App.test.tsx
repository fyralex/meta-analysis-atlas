import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { countByStatus, map } from "./map";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

// These tests render whole pages. The first render in a test worker pays the cold start (jsdom, React, the
// map files), about 0.4 s alone but several seconds when two check runs share the machine (#49). A page-sized
// timeout for this file only; the global default stays.
const PAGE = { timeout: 15_000 };

describe("the app shell", PAGE, () => {
  it("shows the pathway count and the counts by status from map.json", () => {
    renderAt("/");
    expect(screen.getByText(map.pathways.length.toLocaleString("en"))).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Pathways by status" });
    const counts = countByStatus(map);
    expect(within(table).getByRole("row", { name: /Planned/ })).toHaveTextContent(String(counts.planned));
    expect(within(table).getByRole("row", { name: /To check/ })).toHaveTextContent(String(counts.to_check));
  });

  it("routes /atlas to the Atlas", () => {
    renderAt("/atlas");
    expect(screen.getByRole("heading", { level: 1, name: "Atlas" })).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Framework" })).toBeInTheDocument();
  });

  it("routes /cards to the Cards page", () => {
    renderAt("/cards");
    expect(screen.getByRole("heading", { level: 1, name: "Cards" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Find a card" })).toBeInTheDocument();
  });

  it.each([["/pathfinder", "Pathfinder", "#7"]])("routes %s to its page, which says it isn't built yet", (path, name, issue) => {
    renderAt(path);
    expect(screen.getByRole("heading", { level: 1, name })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`issue ${issue}`))).toBeInTheDocument();
  });

  it("says when a page doesn't exist", () => {
    renderAt("/nowhere");
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
  });
});

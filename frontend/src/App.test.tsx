import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import cardsRaw from "../../spec/cards.json";
import lockRaw from "../../spec/pathways.lock.json";

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
  it("opens on three doors, each saying where it goes, with counts from the map", () => {
    renderAt("/");
    expect(
      screen.getByRole("heading", { level: 1, name: "Find the right meta-analysis for your review, and see why it fits." }),
    ).toBeInTheDocument();
    const doors = within(screen.getByRole("list")).getAllByRole("link");
    expect(doors.map((d) => d.getAttribute("href"))).toEqual(["/pathfinder", "/cards", "/atlas"]);
    expect(doors.map((d) => d.querySelector(".door-where strong")?.textContent)).toEqual(["Pathfinder", "Cards", "Atlas"]);
    // Expected counts read from the lock file and cards.json themselves, not by the page's own formulas.
    const lock = lockRaw as unknown as { framework: string }[];
    expect(doors[2]).toHaveTextContent(`All ${String(lock.length)} pathways`);
    expect(doors[2]).toHaveTextContent(`across ${String(new Set(lock.map((p) => p.framework)).size)} frameworks`);
    const raw = cardsRaw as unknown as { tier: string }[];
    const terms = raw.filter((c) => c.tier === "term").length;
    expect(doors[1]).toHaveTextContent(`${String(raw.length - terms)} cards and a glossary of ${String(terms)} terms`);
    expect(doors[0]).toHaveTextContent("Answer up to 6 short questions");
  });

  it("doesn't repeat the doors in the header on the home page, and lists the apps on the others", () => {
    renderAt("/");
    expect(screen.queryByRole("navigation", { name: "Apps" })).toBeNull();
    expect(screen.getByRole("link", { name: /About this project/ })).toHaveAttribute(
      "href",
      "https://github.com/fyralex/meta-analysis-atlas#readme",
    );
    cleanup();
    renderAt("/atlas");
    const nav = screen.getByRole("navigation", { name: "Apps" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["Pathfinder", "Cards", "Atlas"]);
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

  it("routes /pathfinder to Pathfinder, at its first question", () => {
    renderAt("/pathfinder");
    expect(screen.getByRole("heading", { level: 1, name: "Pathfinder" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "What kind of question does the review ask?" })).toBeInTheDocument();
  });

  it("says when a page doesn't exist", () => {
    renderAt("/nowhere");
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
  });
});

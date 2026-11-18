import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { cards } from "./cards/cards";
import { map } from "./map";

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
    const n = map.pathways.length.toLocaleString("en");
    expect(doors[2]).toHaveTextContent(`All ${n} pathways`);
    const terms = cards.filter((c) => c.tier === "term").length;
    expect(doors[1]).toHaveTextContent(`${String(cards.length - terms)} explanations and a glossary of ${String(terms)} terms`);
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

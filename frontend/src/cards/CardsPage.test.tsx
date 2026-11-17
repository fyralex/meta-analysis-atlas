import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { cards } from "./cards";
import { CardsPage } from "./CardsPage";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/cards" element={<CardsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// These tests render whole pages. The first render in a test worker pays the cold start (jsdom, React, the
// map files), about 0.4 s alone but several seconds when two check runs share the machine (#49). A page-sized
// timeout for this file only; the global default stays.
const PAGE = { timeout: 15_000 };

describe("the Cards page", PAGE, () => {
  it("lists every card, grouped by tier and rules", () => {
    renderAt("/cards");
    expect(screen.getAllByRole("listitem")).toHaveLength(cards.length);
    expect(screen.getByRole("heading", { level: 2, name: "Rules" })).toBeInTheDocument();
    expect(screen.getByText(`${String(cards.length)} of ${String(cards.length)} cards`)).toBeInTheDocument();
  });

  it("narrows the list as you type", () => {
    renderAt("/cards");
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a card" }), {
      target: { value: "Peto" },
    });
    const links = screen.getAllByRole("link").map((a) => a.textContent);
    expect(links).toContain("Peto");
    expect(links).not.toContain("Inverse variance");
  });

  it("shows the card in the address, with its R function, rules and linked sources", () => {
    renderAt("/cards?card=method%3APETO");
    const shown = screen.getByRole("region", { name: "Method: Peto" });
    expect(within(shown).getByText("metafor::rma.peto()")).toBeInTheDocument();
    expect(within(shown).getByRole("link", { name: "Rule R5" })).toHaveAttribute("href", "/cards?card=rule%3AR5");
    expect(within(shown).getByRole("link", { name: "metafor, rma.peto()" })).toHaveAttribute(
      "href",
      "https://wviechtb.github.io/metafor/reference/rma.peto.html",
    );
    expect(within(shown).getByRole("heading", { level: 2 })).toHaveFocus();
  });

  it("shows a rule's text and its sections once", () => {
    renderAt("/cards?card=rule%3AR5");
    const shown = screen.getByRole("region", { name: "Rules: Rule R5" });
    expect(within(shown).getByText(/Peto needs 2x2 tables/)).toBeInTheDocument();
    expect(within(shown).getAllByText(/s10\.4\.2/)).toHaveLength(1);
  });

  it("shows an opened card's flags in its heading", () => {
    renderAt("/cards?card=method%3AOEV");
    const heading = screen.getByRole("heading", { level: 2, name: /^Method: / });
    expect(heading).toHaveAccessibleName(/ to check$/);
  });

  it("says so when the address names no card", () => {
    renderAt("/cards?card=method%3ANOPE");
    expect(screen.getByRole("heading", { level: 2, name: "No such card" })).toBeInTheDocument();
  });
});

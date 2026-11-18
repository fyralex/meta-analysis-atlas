import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { cards, searchCards } from "./cards";
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
  it("lists every card beside the card, in groups named as Pathfinder asks its questions", () => {
    renderAt("/cards");
    const list = screen.getByRole("navigation", { name: "All cards" });
    expect(within(list).getAllByRole("link")).toHaveLength(cards.length);
    expect(within(list).getByText(`${String(cards.length)} cards`)).toBeInTheDocument();
    const groups = within(list)
      .getAllByRole("list")
      .map((l) => l.getAttribute("aria-labelledby"))
      .map((g) => document.getElementById(g ?? "")?.textContent.replace(/ \(\d+\)$/, ""));
    expect(groups).toEqual([
      "Your question",
      "Study design",
      "What studies reported",
      "Outcome",
      "Model",
      "Method",
      "Effect measure",
      "Rules",
      "Glossary",
    ]);
    // the badges are explained beside the list
    expect(within(list).getByText("not yet confirmed from a primary source")).toBeInTheDocument();
    // with no card open, the card's place offers some to start from
    expect(screen.getByRole("heading", { level: 2, name: "Choose a card from the list" })).toBeInTheDocument();
  });

  it("opens a term's definition on the card, with its sources and a link to its glossary card", () => {
    renderAt("/cards?card=method%3ANM_GT");
    const shown = screen.getByRole("region", { name: /Frequentist, graph-theoretical/ });
    const terms = within(shown).getByRole("region", { name: "Terms on this card" });
    const term = within(terms).getByText("Transitivity").closest("details") as HTMLElement;
    const glossary = cards.find((c) => c.id === "term:transitivity");
    expect(term).toHaveTextContent(glossary?.teach[0]?.text ?? "missing");
    expect(within(term).getByText(/^Sources \(open outside the Atlas\)/)).toBeInTheDocument();
    expect(within(term).getByRole("link", { name: /^The glossary card for transitivity/ })).toHaveAttribute(
      "href",
      "/cards?card=term%3Atransitivity",
    );
  });

  it("links a choice's card to its analyses in the Atlas, with the choice made", () => {
    renderAt("/cards?card=method%3APETO");
    const link = screen.getByRole("link", { name: "See its 1 analysis in the Atlas, with Peto chosen" });
    expect(link).toHaveAttribute("href", "/atlas?method=PETO");
    cleanup();
    renderAt("/cards?card=rule%3AR5");
    expect(screen.queryByRole("link", { name: /in the Atlas/ })).toBeNull();
  });

  it("suggests searches that find cards", () => {
    renderAt("/cards");
    const box = screen.getByRole("searchbox", { name: "Find a card" });
    const examples = (box.getAttribute("placeholder") ?? "").replace(/^For example, /, "").split(" or ");
    expect(examples).toHaveLength(2);
    for (const q of examples) expect(searchCards(cards, q).length).toBeGreaterThan(0);
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
    within(shown)
      .getAllByRole("link", { name: "metafor, rma.peto()" })
      .forEach((a) => {
        expect(a).toHaveAttribute("href", "https://wviechtb.github.io/metafor/reference/rma.peto.html");
      });
    expect(within(shown).getByRole("heading", { level: 2 })).toHaveFocus();
  });

  it("shows a card's teaching text answer first, each line with its sources", () => {
    renderAt("/cards?card=method%3APETO");
    const shown = screen.getByRole("region", { name: "Method: Peto" });
    const cautions = within(shown).getByRole("region", { name: "Cautions" });
    expect(cautions).toHaveTextContent("not recommend it as a default");
    expect(cautions).toHaveTextContent("Cochrane Handbook Ch. 10, meta-analysis (s10.4.2)");
    expect(within(shown).getByRole("region", { name: "What it is" })).toBeInTheDocument();
    expect(within(shown).getByRole("region", { name: "When to use it" })).toBeInTheDocument();
    // the R call has its own section, and the rules say what they mean, with where the rule's card opens
    expect(within(shown).getByRole("region", { name: "In R" })).toHaveTextContent("metafor::rma.peto()");
    const rules = within(shown).getByRole("region", { name: "Why it can't be combined with some choices" });
    expect(rules).toHaveTextContent(/Peto needs 2x2 tables.*Rule R5 \(opens the rule's card\)/);
  });

  it("shows no teaching headings on a card whose text isn't written yet", () => {
    const blank = cards.find((c) => c.teach.length === 0); // any card whose batch isn't written yet
    expect(blank).toBeDefined();
    renderAt(`/cards?card=${encodeURIComponent(blank?.id ?? "")}`);
    expect(screen.queryByRole("region", { name: "What it is" })).not.toBeInTheDocument();
  });

  it("shows a rule's text and its sections once", () => {
    renderAt("/cards?card=rule%3AR5");
    const shown = screen.getByRole("region", { name: "Rules: Rule R5" });
    expect(within(shown).getByText(/Peto needs 2x2 tables/)).toBeInTheDocument();
    expect(within(shown).getAllByText(/s10\.4\.2/)).toHaveLength(1);
  });

  it("shows an opened card's flags in its heading", () => {
    renderAt("/cards?card=method%3AOEV");
    const heading = screen.getByRole("heading", { level: 2, name: /^Observed minus expected/ });
    expect(heading).toHaveAccessibleName(/ to check$/);
  });

  it("says so when the address names no card", () => {
    renderAt("/cards?card=method%3ANOPE");
    expect(screen.getByRole("heading", { level: 2, name: "No such card" })).toBeInTheDocument();
  });
});

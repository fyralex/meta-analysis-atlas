import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { PathfinderPage } from "./PathfinderPage";

/** The page address, shown so a test can read it. */
function Address() {
  return <output data-testid="address">{useLocation().search}</output>;
}

const address = () => screen.getByTestId("address").textContent;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/pathfinder"
          element={
            <>
              <PathfinderPage />
              <Address />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const pick = (name: RegExp) => {
  fireEvent.click(screen.getByRole("button", { name }));
};

// These tests render whole pages; see the note in App.test.tsx (#49).
const PAGE = { timeout: 15_000 };

describe("Pathfinder", PAGE, () => {
  it("asks the questions in order, keeps the answers in the address, and ends on the fitting pathways", () => {
    renderAt("/pathfinder");
    pick(/^1\. Interventional/);
    expect(screen.getByRole("heading", { level: 2, name: "What does each study compare, or describe?" })).toHaveFocus();
    pick(/^Two groups \(pairwise\)/);
    expect(screen.getByRole("heading", { level: 2, name: "What did each study report?" })).toHaveFocus();
    pick(/^Arm-level summary data/);
    expect(screen.getByRole("heading", { level: 2, name: "What kind of outcome is it?" })).toHaveFocus();
    pick(/^Binary/);
    expect(screen.getByRole("heading", { level: 2, name: "Pathways that fit your answers" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Start again" }));
    expect(screen.getByRole("heading", { level: 2, name: "What kind of question does the review ask?" })).toHaveFocus();
    pick(/^1\. Interventional/);
    pick(/^Two groups \(pairwise\)/);
    pick(/^Arm-level summary data/);
    pick(/^Binary/);
    const params = new URLSearchParams(address());
    expect(params.get("group")).toBe("Two groups (pairwise)");
    expect(params.get("outcome")).toBe("Binary");
    const atlas = screen.getByRole("link", { name: "Open them in the Atlas" });
    expect(atlas.getAttribute("href")).toContain("/atlas?framework=");
    expect(screen.getByRole("table", { name: /pathways that fit/ })).toBeInTheDocument();
  });

  it("shows what each option is, with its source and card", () => {
    renderAt("/pathfinder");
    expect(screen.getAllByRole("link", { name: /^More on / }).length).toBeGreaterThan(0);
  });

  it("starts from the answers in the address, and lets one be changed", () => {
    renderAt("/pathfinder?framework=1.+Interventional+%28effect+of+an+intervention%29&group=Two+groups+%28pairwise%29");
    expect(screen.getByRole("heading", { level: 2, name: "What did each study report?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change group structure (now Two groups (pairwise))" }));
    expect(screen.getByRole("heading", { level: 2, name: "What does each study compare, or describe?" })).toBeInTheDocument();
    expect(new URLSearchParams(address()).get("group")).toBeNull();
  });

  it("says why an option is not possible, naming the answer it conflicts with", () => {
    renderAt("/pathfinder?framework=1.+Interventional+%28effect+of+an+intervention%29&group=Two+groups+%28pairwise%29");
    expect(screen.getByText(/^Not possible with your answers/)).toBeInTheDocument();
    expect(screen.getAllByText(/^Not with your (framework|group structure),/).length).toBeGreaterThan(0);
  });

  it("follows the Atlas's setting to hide new entries, and carries it to the Atlas", () => {
    renderAt("/pathfinder?new=hide");
    expect(screen.getByText(/Entries marked new are hidden/)).toBeInTheDocument();
    const offered = screen
      .getAllByRole("button")
      .filter((b) => b.classList.contains("option"))
      .map((b) => b.textContent);
    expect(offered.length).toBeGreaterThan(0);
    // every option offered can be chosen: each one, picked on a fresh page, moves on to the next question
    for (const name of offered) {
      cleanup();
      renderAt("/pathfinder?new=hide");
      fireEvent.click(screen.getByRole("button", { name }));
      expect(screen.getByRole("heading", { level: 2, name: "What does each study compare, or describe?" })).toBeInTheDocument();
      expect(new URLSearchParams(address()).get("new")).toBe("hide");
    }
  });

  it("says when it ignores choices from the address", () => {
    renderAt("/pathfinder?framework=1.+Interventional+%28effect+of+an+intervention%29&model=Random+effects");
    expect(screen.getByText(/doesn't use your model choice/)).toBeInTheDocument();
  });
});

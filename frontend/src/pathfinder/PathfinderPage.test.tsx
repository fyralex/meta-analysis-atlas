import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

/** Answer the current question: choose the option, then press Next (its label says where it goes). */
const pick = (name: RegExp) => {
  fireEvent.click(screen.getByRole("radio", { name }));
  fireEvent.click(screen.getByRole("button", { name: /^(Next|See the results)/ }));
};

// These tests render whole pages; see the note in App.test.tsx (#49).
const PAGE = { timeout: 15_000 };

describe("Pathfinder", PAGE, () => {
  it("asks the questions in order, keeps the answers in the address, and ends on the fitting pathways", () => {
    renderAt("/pathfinder");
    pick(/^1\. Interventional/);
    expect(screen.getByRole("heading", { level: 1, name: "What does each study compare, or describe?" })).toHaveFocus();
    pick(/^Two groups \(pairwise\)/);
    expect(screen.getByRole("heading", { level: 1, name: "What did each study report?" })).toHaveFocus();
    pick(/^Arm-level summary data/);
    expect(screen.getByRole("heading", { level: 1, name: "What kind of outcome is it?" })).toHaveFocus();
    pick(/^Binary/);
    expect(screen.getByRole("heading", { level: 1, name: "Are the events rare?" })).toHaveFocus();
    pick(/^No$/);
    expect(screen.getByRole("heading", { level: 1, name: "Do you expect the true effects to differ between studies?" })).toHaveFocus();
    pick(/^Not sure$/);
    expect(screen.getByRole("heading", { level: 1, name: "Pathways that fit your answers" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Start again from question 1" }));
    expect(screen.getByRole("heading", { level: 1, name: "What kind of question does the review ask?" })).toHaveFocus();
    pick(/^1\. Interventional/);
    pick(/^Two groups \(pairwise\)/);
    pick(/^Arm-level summary data/);
    pick(/^Binary/);
    pick(/^No$/);
    pick(/^Not sure$/);
    const params = new URLSearchParams(address());
    expect(params.get("group")).toBe("Two groups (pairwise)");
    expect(params.get("outcome")).toBe("Binary");
    const atlas = screen.getByRole("link", { name: /^Open these \d+ in the Atlas, with your answers already chosen$/ });
    expect(atlas.getAttribute("href")).toContain("/atlas?framework=");
    expect(screen.getByRole("table", { name: /pathways that fit/ })).toBeInTheDocument();
  });

  it("shows what each option is, with its source and card", () => {
    renderAt("/pathfinder");
    expect(screen.getAllByRole("link", { name: /^More on / }).length).toBeGreaterThan(0);
  });

  it("starts from the answers in the address, and lets one be changed", () => {
    renderAt("/pathfinder?framework=1.+Interventional+%28effect+of+an+intervention%29&group=Two+groups+%28pairwise%29");
    expect(screen.getByRole("heading", { level: 1, name: "What did each study report?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change this answer: question 2, study design (now Two groups (pairwise))" }));
    expect(screen.getByRole("heading", { level: 1, name: "What does each study compare, or describe?" })).toBeInTheDocument();
    expect(new URLSearchParams(address()).get("group")).toBeNull();
  });

  it("says why an option is not possible, naming the answer it conflicts with", () => {
    renderAt("/pathfinder?framework=1.+Interventional+%28effect+of+an+intervention%29&group=Two+groups+%28pairwise%29");
    expect(screen.getByText(/^Why don't the other \d+ fit\?/)).toBeInTheDocument();
    expect(screen.getAllByText(/^Not with your (framework|group structure),/).length).toBeGreaterThan(0);
  });

  it("follows the Atlas's setting to hide new entries, and carries it to the Atlas", () => {
    renderAt("/pathfinder?new=hide");
    expect(screen.getByText(/Entries marked new are hidden/)).toBeInTheDocument();
    const offered = screen.getAllByRole<HTMLInputElement>("radio").map((r) => r.value);
    expect(offered.length).toBeGreaterThan(0);
    // every option offered can be chosen: each one, picked on a fresh page, moves on to the next question
    for (const value of offered) {
      cleanup();
      renderAt("/pathfinder?new=hide");
      const radio = screen.getAllByRole<HTMLInputElement>("radio").find((r) => r.value === value);
      fireEvent.click(radio as HTMLInputElement);
      fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
      expect(screen.getByRole("heading", { level: 1, name: "What does each study compare, or describe?" })).toBeInTheDocument();
      expect(new URLSearchParams(address()).get("new")).toBe("hide");
    }
  });

  it("says when it ignores choices from the address", () => {
    renderAt("/pathfinder?framework=1.+Interventional+%28effect+of+an+intervention%29&model=Random+effects");
    expect(screen.getByText(/doesn't use your model choice/)).toBeInTheDocument();
  });

  const BINARY =
    "/pathfinder?framework=1.+Interventional+%28effect+of+an+intervention%29&group=Two+groups+%28pairwise%29" +
    "&datatype=Arm-level+summary+data&outcome=Binary";

  it("on rare events, shows what the method cards say, with rule R9, and removes no pathway", () => {
    renderAt(BINARY);
    expect(screen.getAllByRole("radio", { name: /^(Yes|No|Not sure)$/ })).toHaveLength(3);
    pick(/^Yes$/);
    pick(/^Not sure$/);
    const rare = screen.getByRole("region", { name: "Rare events" });
    expect(within(rare).getByRole("link", { name: "Rule R9" })).toBeInTheDocument();
    expect(within(rare).getByRole("link", { name: "Peto" })).toBeInTheDocument();
    expect(within(rare).getByRole("link", { name: "Inverse variance" })).toBeInTheDocument();
    expect(new URLSearchParams(address()).get("rare")).toBe("yes");
    // every pathway is still listed: inverse variance included
    const table = screen.getByRole("table", { name: /pathways that fit/ });
    expect(within(table).getAllByRole("link", { name: "Inverse variance" }).length).toBeGreaterThan(0);
  });

  it("on varying effects, pre-selects a model, shows both models' cards, and switches in one click", () => {
    renderAt(`${BINARY}&rare=no`);
    expect(
      screen.getByRole("heading", { level: 1, name: "Do you expect the true effects to differ between studies?" }),
    ).toBeInTheDocument();
    pick(/^Yes, they probably differ$/);
    const model = screen.getByRole("region", { name: "Model" });
    expect(within(model).getByText("Showing random effects pathways only.")).toBeInTheDocument();
    expect(within(model).getByRole("link", { name: "Common effect" })).toBeInTheDocument();
    expect(within(model).getByRole("link", { name: "Random effects" })).toBeInTheDocument();
    expect(new URLSearchParams(address()).get("model")).toBe("Random effects");
    const atlas = screen.getByRole("link", { name: /^Open these \d+ in the Atlas/ }).getAttribute("href") ?? "";
    expect(new URLSearchParams(atlas.slice(atlas.indexOf("?"))).get("model")).toBe("Random effects");
    const table = () => screen.getByRole("table", { name: /pathways that fit/ });
    expect(within(table()).queryAllByRole("link", { name: "Common effect" })).toHaveLength(0);
    fireEvent.click(within(model).getByRole("button", { name: "Show common effect pathways only" }));
    expect(within(table()).queryAllByRole("link", { name: "Random effects" })).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Show both models" }));
    expect(within(table()).getAllByRole("link", { name: "Random effects" }).length).toBeGreaterThan(0);
    expect(within(table()).getAllByRole("link", { name: "Common effect" }).length).toBeGreaterThan(0);
  });

  it("keeps every fitting method's rare-events advice when one model is shown, and keeps the model", () => {
    renderAt(`${BINARY}&vary=yes&model=Random+effects`);
    pick(/^Yes$/);
    expect(new URLSearchParams(address()).get("model")).toBe("Random effects");
    const rare = screen.getByRole("region", { name: "Rare events" });
    // Peto is common-effect only, so its pathways are not in the table, but its card's advice still shows
    expect(within(rare).getByRole("link", { name: "Peto" })).toBeInTheDocument();
  });

  it("skips the rare-events question where no method that fits says anything about it", () => {
    renderAt(
      "/pathfinder?framework=1.+Interventional+%28effect+of+an+intervention%29&group=Two+groups+%28pairwise%29" +
        "&datatype=Arm-level+summary+data&outcome=Continuous",
    );
    expect(screen.queryByRole("heading", { level: 1, name: "Are the events rare?" })).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Do you expect the true effects to differ between studies?" }),
    ).toBeInTheDocument();
  });

  it("takes back the advisory answers when an earlier answer changes", () => {
    renderAt(`${BINARY}&rare=yes&vary=yes&model=Random+effects`);
    fireEvent.click(screen.getByRole("button", { name: "Change this answer: question 4, outcome (now Binary)" }));
    const params = new URLSearchParams(address());
    expect(params.get("rare")).toBeNull();
    expect(params.get("vary")).toBeNull();
    expect(params.get("model")).toBeNull();
  });

  it("keeps the answers in the step bar, says where Back and Next go, and needs a choice before Next", () => {
    renderAt("/pathfinder?framework=1.+Interventional+%28effect+of+an+intervention%29&group=Two+groups+%28pairwise%29");
    const bar = screen.getByRole("list", { name: "Your answers, step by step" });
    const items = within(bar).getAllByRole("listitem");
    expect(items).toHaveLength(6);
    expect(items[0]).toHaveTextContent("1 · Your question1. Interventional (effect of an intervention)");
    expect(items[1]).toHaveTextContent("2 · Study designTwo groups (pairwise)");
    expect(items[2]).toHaveAttribute("aria-current", "step");
    const next = screen.getByRole("button", { name: "Next: question 4, outcome" });
    expect(next).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /^Arm-level summary data/ }));
    expect(next).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Back to question 2" }));
    expect(screen.getByRole("heading", { level: 1, name: "What does each study compare, or describe?" })).toBeInTheDocument();
    expect(new URLSearchParams(address()).get("group")).toBeNull();
  });

  it("names the step after the last question from the option chosen, and marks steps not needed", () => {
    renderAt(
      "/pathfinder?framework=1.+Interventional+%28effect+of+an+intervention%29&group=Two+groups+%28pairwise%29" +
        "&datatype=Arm-level+summary+data",
    );
    fireEvent.click(screen.getByRole("radio", { name: /^Binary/ }));
    expect(screen.getByRole("button", { name: "Next: question 5, rare events?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /^Continuous/ }));
    expect(screen.getByRole("button", { name: "Next: question 6, do effects differ?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    const bar = screen.getByRole("list", { name: "Your answers, step by step" });
    expect(within(bar).getAllByRole("listitem")[4]).toHaveTextContent("Not needed for your answers");
  });

  it("shows the live count, and opens the Atlas with the answers chosen", () => {
    renderAt("/pathfinder?framework=1.+Interventional+%28effect+of+an+intervention%29");
    const side = screen.getByRole("complementary", { name: "With your answers so far" });
    expect(side).toHaveTextContent("454 analyses fit");
    const link = within(side).getByRole("link", { name: "Open these 454 in the Atlas, with your answers already chosen" });
    expect(link.getAttribute("href")).toContain("/atlas?framework=");
  });

  it("names each Change button with its visible words first, and keeps the earlier choice when going back", () => {
    renderAt(BINARY);
    const change = screen.getByRole("button", { name: /^Change this answer: question 4, outcome/ });
    expect(change).toHaveTextContent("Change this answer");
    fireEvent.click(screen.getByRole("button", { name: "Back to question 4" }));
    expect(screen.getByRole("radio", { name: "Binary" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Next: question 5, rare events?" })).toBeEnabled();
  });

  it("labels each option with its name only, and describes it with what it is and how many fit", () => {
    renderAt("/pathfinder?framework=1.+Interventional+%28effect+of+an+intervention%29&group=Two+groups+%28pairwise%29");
    const radio = screen.getByRole("radio", { name: "Arm-level summary data" });
    expect(radio).toHaveAccessibleDescription(/77 analyses fit/);
    expect(screen.getByText("Choose an answer to go on.")).toBeInTheDocument();
  });

  it("going back from question 6 to question 5 takes back both advisory answers", () => {
    renderAt(`${BINARY}&rare=no`);
    expect(screen.getByRole("heading", { level: 1, name: "Do you expect the true effects to differ between studies?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to question 5" }));
    const params = new URLSearchParams(address());
    expect(params.get("rare")).toBeNull();
    expect(params.get("vary")).toBeNull();
    expect(screen.getByRole("radio", { name: "No" })).toBeChecked();
  });

  it("forgets a remembered answer once it is used, so a later question never opens on a stale one", () => {
    renderAt(BINARY);
    fireEvent.click(screen.getByRole("button", { name: "Back to question 4" }));
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start again from question 1" }));
    pick(/^2\. Diagnostic test accuracy/);
    pick(/^One index test/);
    pick(/^2x2 table per study$/);
    expect(screen.getByRole("heading", { level: 1, name: "What kind of outcome is it?" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio").every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByRole("button", { name: /^(Next|See the results)/ })).toBeDisabled();
  });
});

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
  const BINARY =
    "/pathfinder?framework=1.+Interventional+%28effect+of+an+intervention%29&group=Two+groups+%28pairwise%29" +
    "&datatype=Arm-level+summary+data&outcome=Binary";

  it("asks the questions in order, keeps the answers in the address, and ends on the analyses that fit, by method", () => {
    renderAt("/pathfinder");
    pick(/^What are the effects of a treatment or other intervention\?$/);
    expect(screen.getByRole("heading", { level: 1, name: "What does each study compare, or describe?" })).toHaveFocus();
    pick(/^Two groups compared$/);
    expect(screen.getByRole("heading", { level: 1, name: "What did each study report?" })).toHaveFocus();
    pick(/^Counts or summaries for each group$/);
    expect(screen.getByRole("heading", { level: 1, name: "What kind of outcome is it?" })).toHaveFocus();
    pick(/^Yes or no$/);
    expect(screen.getByRole("heading", { level: 1, name: "Are the events rare?" })).toHaveFocus();
    pick(/^No$/);
    expect(screen.getByRole("heading", { level: 1, name: "Do you expect the true effects to differ between studies?" })).toHaveFocus();
    pick(/^Not sure$/);
    expect(screen.getByRole("heading", { level: 1, name: "28 analyses fit your answers" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Start again from question 1" }));
    expect(screen.getByRole("heading", { level: 1, name: "What kind of question does the review ask?" })).toHaveFocus();
    pick(/^What are the effects of a treatment or other intervention\?$/);
    pick(/^Two groups compared$/);
    pick(/^Counts or summaries for each group$/);
    pick(/^Yes or no$/);
    pick(/^No$/);
    pick(/^Not sure$/);
    const params = new URLSearchParams(address());
    expect(params.get("group")).toBe("Two groups (pairwise)");
    expect(params.get("outcome")).toBe("Binary");
    const atlas = screen.getByRole("link", { name: /^Open these \d+ in the Atlas, with your answers already chosen$/ });
    expect(atlas.getAttribute("href")).toContain("/atlas?framework=");
    // grouped by method: each says how many analyses it has and with which models, and opens to its card text
    const methods = screen.getByRole("region", { name: "By method" });
    const mh = within(methods).getByText("Mantel-Haenszel").closest("details") as HTMLElement;
    expect(mh).toHaveTextContent("3 analyses · common effect only");
    expect(within(mh).getByRole("link", { name: /^Read the full card on Mantel-Haenszel/ })).toBeInTheDocument();
    expect(within(mh).getByText(/^Planned/)).toBeInTheDocument();
    expect(screen.getByText(/None of them can be run yet\./)).toBeInTheDocument();
  });

  it("counts the analyses still to check on each method, and says sources open outside the Atlas", () => {
    renderAt(`${BINARY}&rare=no&vary=unsure`);
    // the status line: the counts by status, and that none can be run (derived from the statuses)
    expect(screen.getByText("26 planned, 2 to check. None of them can be run yet.")).toBeInTheDocument();
    const methods = screen.getByRole("region", { name: "By method" });
    const groups = within(methods).getAllByRole("group");
    // every analysis to check is counted on exactly one method's badge, and only methods with one have a badge
    const badges = groups.flatMap((g) => within(g).queryAllByText(/^\d+ not yet confirmed$/));
    expect(badges.reduce((n, b) => n + Number.parseInt(b.textContent, 10), 0)).toBe(2);
    for (const g of groups) {
      expect(within(g).queryByText(/not yet confirmed$/) !== null).toBe(g.textContent.includes("To check"));
    }
    // the summary line's own source is in the box, as are the other lines' sources
    const mh = within(methods).getByText("Mantel-Haenszel").closest("details") as HTMLElement;
    expect(within(mh).getByText(/^Sources \(open outside the Atlas\), for the line above/)).toBeInTheDocument();
    expect(within(mh).getAllByText(/^Sources \(open outside the Atlas\):/).length).toBeGreaterThan(0);
  });

  it("gives the reason for the models shown, and keeps the debate between the two models", () => {
    renderAt(`${BINARY}&rare=no&vary=unsure`);
    const model = () => screen.getByRole("region", { name: "Model" });
    expect(within(model()).getByText("Showing both models, because you answered “not sure”.")).toBeInTheDocument();
    // what the model cards say on when to use each: the choice is debated (CLAUDE.md rule 8)
    expect(within(model()).getAllByText(/is debated/)).toHaveLength(2);
    expect(within(model()).getAllByText(/^Caution: /)).toHaveLength(2);
    cleanup();
    renderAt(`${BINARY}&rare=no&vary=no&model=Common+effect`);
    expect(
      within(model()).getByText("Showing common effect only, because you expect the studies to share one effect."),
    ).toBeInTheDocument();
    fireEvent.click(within(model()).getByRole("button", { name: /^Random effects only/ }));
    expect(within(model()).getByText("Showing random effects only.")).toBeInTheDocument();
  });

  it("shows what each option is, with its source and card", () => {
    renderAt("/pathfinder");
    expect(screen.getAllByRole("link", { name: /^More on / }).length).toBeGreaterThan(0);
  });

  it("starts from the answers in the address, and lets one be changed", () => {
    renderAt("/pathfinder?framework=1.+Interventional+%28effect+of+an+intervention%29&group=Two+groups+%28pairwise%29");
    expect(screen.getByRole("heading", { level: 1, name: "What did each study report?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change this answer: question 2, study design (now Two groups compared)" }));
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

  it("on rare events, shows what the method cards say, with rule R9, and removes no pathway", () => {
    renderAt(BINARY);
    expect(screen.getAllByRole("radio", { name: /^(Yes|No|Not sure)$/ })).toHaveLength(3);
    pick(/^Yes$/);
    pick(/^Not sure$/);
    const rare = screen.getByRole("region", { name: "Your events are rare" });
    expect(within(rare).getByRole("link", { name: "Rule R9" })).toBeInTheDocument();
    expect(within(rare).getByRole("link", { name: "Peto" })).toBeInTheDocument();
    expect(within(rare).getByRole("link", { name: "Inverse variance" })).toBeInTheDocument();
    expect(new URLSearchParams(address()).get("rare")).toBe("yes");
    // every analysis is still listed: inverse variance included
    const methods = screen.getByRole("region", { name: "By method" });
    expect(within(methods).getByText("Inverse variance")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "28 analyses fit your answers" })).toBeInTheDocument();
  });

  it("on varying effects, pre-selects a model, says why, and switches with pressed buttons that give counts", () => {
    renderAt(`${BINARY}&rare=no`);
    expect(
      screen.getByRole("heading", { level: 1, name: "Do you expect the true effects to differ between studies?" }),
    ).toBeInTheDocument();
    // the question shows the debate between the two models where the choice is made (CLAUDE.md rule 8)
    expect(screen.getAllByText(/is debated/)).toHaveLength(2);
    pick(/^Yes, they probably differ$/);
    const model = screen.getByRole("region", { name: "Model" });
    expect(within(model).getByText("Showing random effects only, because you expect the true effects to differ.")).toBeInTheDocument();
    expect(within(model).getByRole("link", { name: /^Read the card on common effect/ })).toBeInTheDocument();
    expect(new URLSearchParams(address()).get("model")).toBe("Random effects");
    const atlas = screen.getByRole("link", { name: /^Open these \d+ in the Atlas/ }).getAttribute("href") ?? "";
    expect(new URLSearchParams(atlas.slice(atlas.indexOf("?"))).get("model")).toBe("Random effects");
    const button = (name: RegExp) => within(model).getByRole("button", { name });
    expect(button(/^Random effects only \(\d+\)$/)).toHaveAttribute("aria-pressed", "true");
    expect(button(/^Both models \(28\)$/)).toHaveAttribute("aria-pressed", "false");
    const methods = () => screen.getByRole("region", { name: "By method" });
    // Mantel-Haenszel and Peto are common-effect only
    expect(within(methods()).queryByText("Mantel-Haenszel")).toBeNull();
    fireEvent.click(button(/^Common effect only/));
    expect(button(/^Common effect only/)).toHaveAttribute("aria-pressed", "true");
    expect(within(model).getByText("Showing common effect only.")).toBeInTheDocument();
    expect(within(methods()).getByText("Mantel-Haenszel")).toBeInTheDocument();
    expect(within(methods()).queryByText("Bayesian normal-normal hierarchical model")).toBeNull();
    fireEvent.click(button(/^Both models/));
    expect(screen.getByRole("heading", { level: 1, name: "28 analyses fit your answers" })).toBeInTheDocument();
    expect(new URLSearchParams(address()).get("model")).toBeNull();
  });

  it("keeps every fitting method's rare-events advice when one model is shown, and keeps the model", () => {
    renderAt(`${BINARY}&vary=yes&model=Random+effects`);
    pick(/^Yes$/);
    expect(new URLSearchParams(address()).get("model")).toBe("Random effects");
    const rare = screen.getByRole("region", { name: "Your events are rare" });
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
    fireEvent.click(screen.getByRole("button", { name: "Change this answer: question 4, outcome (now Yes or no)" }));
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
    expect(items[0]).toHaveTextContent("1 · Your questionWhat are the effects of a treatment or other intervention?");
    expect(items[1]).toHaveTextContent("2 · Study designTwo groups compared");
    expect(items[2]).toHaveAttribute("aria-current", "step");
    const next = screen.getByRole("button", { name: "Next: question 4, outcome" });
    expect(next).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /^Counts or summaries for each group$/ }));
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
    fireEvent.click(screen.getByRole("radio", { name: /^Yes or no$/ }));
    expect(screen.getByRole("button", { name: "Next: question 5, rare events?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /^A measured value$/ }));
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
    expect(screen.getByRole("radio", { name: "Yes or no" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Next: question 5, rare events?" })).toBeEnabled();
  });

  it("labels each option with its name only, and describes it with what it is and how many fit", () => {
    renderAt("/pathfinder?framework=1.+Interventional+%28effect+of+an+intervention%29&group=Two+groups+%28pairwise%29");
    const radio = screen.getByRole("radio", { name: "Counts or summaries for each group" });
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
    pick(/^How accurate is a test\?$/);
    pick(/^One test, checked against a reference standard$/);
    pick(/^A 2x2 table of test results from each study$/);
    expect(screen.getByRole("heading", { level: 1, name: "What kind of outcome is it?" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio").every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByRole("button", { name: /^(Next|See the results)/ })).toBeDisabled();
  });

  it("names the options in plain words with an example, and shows the technical names on request", () => {
    renderAt("/pathfinder?framework=1.+Interventional+%28effect+of+an+intervention%29&group=Two+groups+%28pairwise%29");
    const radio = screen.getByRole("radio", { name: "Counts or summaries for each group" });
    expect(radio).toHaveAccessibleDescription(/12 of 100 patients had a stroke/);
    expect(screen.queryByText("Technical name: Arm-level summary data")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /Show the technical names/ }));
    expect(screen.getByText("Technical name: Arm-level summary data")).toBeInTheDocument();
  });
});

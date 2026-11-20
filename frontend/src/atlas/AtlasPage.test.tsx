import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import lockRaw from "../../../spec/pathways.lock.json";
import { App } from "../App";
import { map } from "../map";
import { STATUSES, type Pathway } from "../types/map";
import { LIST_LIMIT, TIER_NAMES } from "./names";
import { nodeLabel, TIERS, tiersInOrder, type Selection, type Tier } from "./filter";
import { reasonsFor } from "./whyNot";

// Every count the page shows is checked against the lock file, read independently of map.json.
const lock = lockRaw as unknown as Pathway[];
const F1 = "1. Interventional (effect of an intervention)";
/** The only pathways still marked new since #21 to #24 were accepted: the one-stage IPD network method's
 * common-effect model (#59). */
const IPD_COMMON = "?method=NM_IPD&model=Common+effect";

function lockCount(selection: Selection, hideNew = false): number {
  return lock.filter(
    (p) => !(hideNew && p.new) && TIERS.every((t) => selection[t] === undefined || p[t] === selection[t]),
  ).length;
}

function renderAtlas(query = "") {
  return render(
    <MemoryRouter initialEntries={[`/atlas${query}`]}>
      <App />
    </MemoryRouter>,
  );
}

function layer(tier: Tier): HTMLElement {
  return screen.getByRole("toolbar", { name: TIER_NAMES[tier] });
}

function nodes(tier: Tier): HTMLButtonElement[] {
  return within(layer(tier)).getAllByRole("button");
}

// Each tier's values by label, from the lock file: worked out once, not for every node checked.
const byLabel = Object.fromEntries(
  TIERS.map((t) => {
    const out = new Map<string, string[]>();
    for (const v of new Set(lock.map((p) => p[t]))) out.set(nodeLabel(map, t, v), [...(out.get(nodeLabel(map, t, v)) ?? []), v]);
    return [t, out];
  }),
) as Record<Tier, Map<string, string[]>>;

/** The value behind a node, found from its label among the lock file's values. */
function valueOf(tier: Tier, button: HTMLElement): string {
  const values = byLabel[tier].get(button.querySelector(".node-label")?.textContent ?? "") ?? [];
  expect(values).toHaveLength(1);
  return values[0] ?? "";
}

function shownCount(button: HTMLElement): number {
  return Number(button.querySelector(".node-count")?.textContent);
}

function node(tier: Tier, value: string): HTMLButtonElement {
  const found = nodes(tier).find((b) => valueOf(tier, b) === value);
  if (!found) throw new Error(`no node ${value} in ${tier}`);
  return found;
}

/** The live summary. Found by selector: getByRole("status") walks the whole page (about 0.4 s), and the
 * tests read the summary often. "opens on the whole map" checks once that it is the page's status region. */
function summaryRegion(): HTMLElement {
  const el = document.querySelector<HTMLElement>(".summary[role='status']");
  if (!el) throw new Error("no summary");
  return el;
}

function summary(): string {
  return summaryRegion().textContent;
}

/**
 * Every layer draws exactly the lock file's values (after hiding new entries), every
 * node shows the lock file's facet count, and the summary's counts by status match.
 */
function expectCountsMatchLock(selection: Selection, hideNew = false) {
  const kept = lock.filter((p) => !(hideNew && p.new));
  const matching = kept.filter((p) => TIERS.every((t) => selection[t] === undefined || p[t] === selection[t]));
  const text = summary(); // role queries walk the whole page: each is made once
  for (const status of STATUSES) {
    const n = matching.filter((p) => p.status === status).length;
    if (n > 0) expect(text).toContain(`${String(n)} ${status === "to_check" ? "to check" : status}`);
    else expect(text).not.toContain(status === "to_check" ? "to check" : status);
  }
  for (const tier of TIERS) {
    // By id, not by role: this runs for every node of every layer, and role queries walk the whole page.
    // Other tests find the same toolbars by role.
    const buttons = [...document.querySelectorAll<HTMLButtonElement>(`#tier-${tier}-nodes button.node`)];
    expect(new Set(buttons.map((b) => valueOf(tier, b))), tier).toEqual(new Set(kept.map((p) => p[tier])));
    for (const button of buttons) {
      const rest = Object.fromEntries(Object.entries(selection).filter(([t]) => t !== tier));
      expect(shownCount(button), `${tier}: ${valueOf(tier, button)}`).toBe(
        lockCount({ ...rest, [tier]: valueOf(tier, button) }, hideNew),
      );
    }
  }
}

// These tests render whole pages. The first render in a test worker pays the cold start (jsdom, React, the
// map files), about 0.4 s alone but several seconds when two check runs share the machine (#49). A page-sized
// timeout for this file only; the global default stays.
const PAGE = { timeout: 15_000 };

describe("the Atlas's 2D view", PAGE, () => {
  it("opens on the whole map, with every node's count equal to the lock file's", () => {
    renderAtlas();
    expect(screen.getByRole("status")).toBe(summaryRegion());
    for (const tier of TIERS) expect(layer(tier)).toContainElement(document.getElementById(`tier-${tier}-nodes`));
    expect(summary()).toContain(`${String(lock.length)} of ${String(lock.length)} pathways match`);
    expectCountsMatchLock({});
  });

  it.each([...new Set(lock.map((p) => p.framework))])("choosing %s narrows every layer to the lock file's counts", (framework) => {
    renderAtlas();
    fireEvent.click(node("framework", framework));
    expect(node("framework", framework)).toHaveAttribute("aria-pressed", "true");
    expect(summary()).toContain(`${String(lockCount({ framework }))} of ${String(lock.length)} pathways match`);
    expectCountsMatchLock({ framework });
  });

  it("narrows step by step, and a second click clears a choice", () => {
    renderAtlas();
    fireEvent.click(node("framework", F1));
    fireEvent.click(node("model", "Random effects"));
    const selection = { framework: F1, model: "Random effects" };
    expect(summary()).toContain(`${String(lockCount(selection))} of`);
    expect(summary()).toContain("your 2 choices");
    expectCountsMatchLock(selection);

    fireEvent.click(node("model", "Random effects"));
    expect(node("model", "Random effects")).toHaveAttribute("aria-pressed", "false");
    expect(summary()).toContain(`${String(lockCount({ framework: F1 }))} of`);
  });

  it("greys out a node that fits none of the other choices, and won't choose it", () => {
    renderAtlas();
    fireEvent.click(node("framework", "2. Diagnostic test accuracy"));
    const iv = node("method", "IV");
    expect(shownCount(iv)).toBe(0);
    expect(iv).toHaveAttribute("aria-disabled", "true");
    expect(iv).toHaveAccessibleName(/not compatible with your other choices/);
    fireEvent.click(iv);
    expect(iv).toHaveAttribute("aria-pressed", "false");
    expect(summary()).toContain(`${String(lockCount({ framework: "2. Diagnostic test accuracy" }))} of`);
  });

  it("lists a layer's compatible nodes before the greyed-out ones", () => {
    // Here the map lists "Observed minus expected and variance" (no match) before "Contrast-level estimates".
    expect(lockCount({ framework: F1, model: "Random effects", datatype: "Observed minus expected and variance" })).toBe(0);
    renderAtlas(`?framework=${encodeURIComponent(F1)}&model=Random%20effects`);
    for (const tier of TIERS) {
      // the metric tier is grouped by family (#78): compatible first within each family
      const runs =
        tier === "metric"
          ? within(layer(tier))
              .getAllByRole("group")
              .map((g) => within(g).getAllByRole("button"))
          : [nodes(tier)];
      for (const run of runs) {
        const counts = run.map(shownCount);
        const firstZero = counts.indexOf(0);
        if (firstZero >= 0) expect(counts.slice(firstZero).every((n) => n === 0), tier).toBe(true);
      }
    }
  });

  it("clears every choice at once", () => {
    renderAtlas(`?framework=${encodeURIComponent(F1)}&model=Common%20effect`);
    fireEvent.click(screen.getByRole("button", { name: "Clear all choices" }));
    expect(summary()).toContain(`${String(lock.length)} of ${String(lock.length)}`);
    expect(screen.queryByRole("button", { name: "Clear all choices" })).not.toBeInTheDocument();
  });

  it("redraws the layers in the other tier order without changing a count", () => {
    renderAtlas(`?framework=${encodeURIComponent(F1)}`);
    const headings = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent).slice(0, 7);
    expect(headings()).toEqual(tiersInOrder("model-method-metric").map((t) => TIER_NAMES[t]));
    fireEvent.click(screen.getByRole("radio", { name: "Metric → Method → Model" }));
    expect(headings()).toEqual(tiersInOrder("metric-method-model").map((t) => TIER_NAMES[t]));
    expectCountsMatchLock({ framework: F1 });
  });

  it("hides the entries marked new, with counts from the lock file", () => {
    renderAtlas();
    fireEvent.click(screen.getByRole("checkbox", { name: /Hide entries marked new/ }));
    const kept = lockCount({}, true);
    expect(summary()).toContain(`${String(kept)} of ${String(kept)} pathways match`);
    expectCountsMatchLock({}, true);
  });

  it("drops a choice that matches nothing once new entries are hidden, and says so", () => {
    // The one-stage IPD network method's common-effect pathways are new (#59): hiding them leaves the two choices
    // matching nothing together, so the later one, the method, is cleared.
    expect(lockCount({ method: "NM_IPD", model: "Common effect" }, true)).toBe(0);
    renderAtlas(`${IPD_COMMON}&new=hide`);
    expect(summary()).toContain(
      "Cleared your choice of method: with your other choices and settings, it matched no pathway.",
    );
    expect(summary()).toContain(`${String(lockCount({ model: "Common effect" }, true))} of`);
  });

  it("says so when ticking 'hide new' clears a choice", () => {
    renderAtlas(IPD_COMMON);
    expect(summary()).not.toContain("Cleared");
    fireEvent.click(screen.getByRole("checkbox", { name: /Hide entries marked new/ }));
    expect(summary()).toContain("Cleared your choice of method");
    expect(summary()).toContain(`${String(lockCount({ model: "Common effect" }, true))} of`);
    fireEvent.click(node("model", "Random effects"));
    expect(summary()).not.toContain("Cleared");
  });

  it("shows the cleared note only on the address it was worked out for", () => {
    const router = createMemoryRouter([{ path: "*", element: <App /> }], { initialEntries: [`/atlas${IPD_COMMON}`] });
    render(<RouterProvider router={router} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Hide entries marked new/ }));
    expect(summary()).toContain("Cleared your choice of method");
    // Back to the opening map, where the framework is unchosen for another reason.
    act(() => {
      void router.navigate("/atlas");
    });
    expect(summary()).not.toContain("Cleared");
  });

  it("offers the runnable-only switch only once a pathway is runnable, and ignores it in the address until then", () => {
    renderAtlas(`?runnable=only&framework=${encodeURIComponent(F1)}`);
    const box = screen.getByRole("checkbox", { name: /Show only runnable pathways/ });
    expect(box).toBeDisabled();
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleDescription(/No pathway is runnable yet/);
    // The framework choice is kept, and every pathway of it still counts.
    expect(summary()).toContain(`${String(lockCount({ framework: F1 }))} of ${String(lock.length)}`);
  });

  it("offers the 3D view only where the browser can draw it, and shows 2D otherwise", () => {
    // The test environment has no WebGL, like a browser without it.
    renderAtlas("?view=3d");
    expect(screen.getByRole("radio", { name: /^3D map/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /^Text view/ })).toBeChecked();
    const notice = screen.getByText(/can't draw the 3D map \(no WebGL 2\), so the Atlas shows the text view/);
    expect(notice.closest("details")).toBeNull();
    expect(screen.queryByRole("region", { name: "The map in 3D" })).toBeNull();
    for (const tier of TIERS) expect(layer(tier)).toBeInTheDocument();
  });

  it("keeps address parameters it doesn't own, but takes back Pathfinder's answers on any change", () => {
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: ["/atlas?rare=yes&vary=yes&other=1"],
    });
    render(<RouterProvider router={router} />);
    fireEvent.click(nodes("framework")[0] as HTMLElement);
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get("framework")).not.toBeNull();
    expect(params.get("other")).toBe("1");
    expect(params.get("rare")).toBeNull();
    expect(params.get("vary")).toBeNull();
  });

  it.each(["method", "metric"] as const)(
    "marks a %s new or to check from its own entry, whatever is chosen",
    (tier) => {
      const entries: Record<string, { new: boolean; verified: boolean }> = tier === "method" ? map.methods : map.metrics;
      for (const query of ["", `?framework=${encodeURIComponent("2. Diagnostic test accuracy")}`]) {
        renderAtlas(query);
        for (const button of nodes(tier)) {
          const entry = entries[valueOf(tier, button)];
          expect(entry).toBeDefined();
          const badges = [...button.querySelectorAll(".badge")].map((b) => b.textContent);
          expect(badges, valueOf(tier, button)).toEqual([
            ...(entry?.new ? ["new"] : []),
            ...(entry?.verified ? [] : ["to check"]),
          ]);
        }
        cleanup();
      }
    },
  );

  it("puts no badge on tiers that aren't entries of their own", () => {
    renderAtlas(`?framework=${encodeURIComponent("2. Diagnostic test accuracy")}`);
    for (const tier of ["framework", "group", "datatype", "outcome", "model"] as const) {
      expect(layer(tier).querySelectorAll(".badge"), tier).toHaveLength(0);
    }
  });

  it("ignores a value in the address that the map doesn't have", () => {
    renderAtlas("?method=nope&model=Common%20effect");
    expect(summary()).toContain("Cleared your choice of method");
    expect(summary()).toContain(`${String(lockCount({ model: "Common effect" }))} of`);
  });

  it("gives screen readers each node's count by status", () => {
    // The whole map, and the common-effect node: the only pathways still marked new are common-effect ones (#59),
    // and a count of 0 isn't spoken.
    renderAtlas();
    const re = node("model", "Common effect");
    const rows = lock.filter((p) => p.model === "Common effect");
    const planned = rows.filter((p) => p.status === "planned").length;
    const marked = rows.filter((p) => p.new).length;
    expect(re).toHaveAccessibleName(new RegExp(`^Common effect, ${String(rows.length)} pathways: .*${String(planned)} planned.*${String(marked)} new$`));
  });

  it("is one tab stop per layer, with the arrow keys moving between its nodes", () => {
    renderAtlas();
    const methods = nodes("method");
    expect(methods.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    methods[0]?.focus();
    fireEvent.keyDown(methods[0] as HTMLElement, { key: "ArrowRight" });
    expect(document.activeElement).toBe(methods[1]);
    fireEvent.keyDown(methods[1] as HTMLElement, { key: "End" });
    expect(document.activeElement).toBe(methods.at(-1));
    fireEvent.keyDown(methods.at(-1) as HTMLElement, { key: "ArrowRight" });
    expect(document.activeElement).toBe(methods.at(-1));
    fireEvent.keyDown(methods.at(-1) as HTMLElement, { key: "Home" });
    expect(document.activeElement).toBe(methods[0]);
  });

  it("lists the matching pathways once they are few enough", () => {
    renderAtlas();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const selection = { framework: F1, group: "One group (single arm)", outcome: "Binary", model: "Random effects" };
    const expected = lockCount(selection);
    expect(expected).toBeLessThanOrEqual(LIST_LIMIT);
    renderAtlas(`?${new URLSearchParams(selection).toString()}`);
    const table = screen.getByRole("table", { name: `The ${String(expected)} matching pathways` });
    expect(within(table).getAllByRole("row")).toHaveLength(expected + 1);
  });

  it("shows Status first, and the tiers every matching pathway shares once, above the table", () => {
    const selection = { framework: F1, group: "One group (single arm)", outcome: "Binary", model: "Random effects" };
    renderAtlas(`?${new URLSearchParams(selection).toString()}`);
    const table = screen.getByRole("table", { name: /matching pathways/ });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers[0]).toBe("Status");
    // The chosen tiers are the same in every row, so they leave the table for the line above it.
    for (const t of ["framework", "group", "outcome", "model"] as const) expect(headers).not.toContain(TIER_NAMES[t]);
    const common = document.querySelector(".pathways-common")?.textContent ?? "";
    expect(common).toContain(`${TIER_NAMES.framework} ${F1}`);
    expect(common).toContain(`${TIER_NAMES.model} Random effects`);
    // Status and the tiers that differ between rows are the columns.
    expect(headers).toEqual(["Status", TIER_NAMES.datatype, TIER_NAMES.method, TIER_NAMES.metric]);
    // Every cell names its column for the card layout on narrow screens, hidden from screen readers.
    for (const cell of within(table).getAllByRole("cell")) {
      expect(cell.querySelector(".cell-label")?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("moves a tier nobody chose to the summary line when every match shares it, and says so for a single match", () => {
    // Choosing Peto leaves one framework, group, datatype, outcome, model and metric: all shared, none chosen.
    renderAtlas(`?framework=${encodeURIComponent(F1)}&method=PETO`);
    expect(lockCount({ framework: F1, method: "PETO" })).toBe(1);
    const common = document.querySelector(".pathways-common")?.textContent ?? "";
    expect(common.startsWith("It has:")).toBe(true);
    expect(common).toContain(`${TIER_NAMES.group} Two groups (pairwise)`);
    expect(common).toContain(`${TIER_NAMES.model} Common effect`);
    const table = screen.getByRole("table", { name: /matching pathways/ });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Status"]);
  });

  it("marks a chosen node with a check as well as its colour, and gives the radio buttons values", () => {
    renderAtlas(`?framework=${encodeURIComponent(F1)}`);
    expect(node("framework", F1).querySelector(".node-check")?.textContent).toBe("✓");
    expect(nodes("framework").filter((b) => b.querySelector(".node-check"))).toHaveLength(1);
    const radios = screen
      .getAllByRole<HTMLInputElement>("radio")
      .filter((r) => r.name === "tier-order" || r.name === "atlas-view");
    expect(radios.map((r) => r.value)).toEqual(["model-method-metric", "metric-method-model", "2d", "3d"]);
  });

  describe("Why not?", () => {
    const query = `?framework=${encodeURIComponent(F1)}&method=PETO`;

    it("opens on a greyed-out node with the reason, its rule and its sources, and takes focus", () => {
      renderAtlas(query);
      const md = node("metric", "MD");
      expect(md).toHaveAccessibleName(/press to see why$/);
      fireEvent.click(md);
      const panel = screen.getByRole("region", { name: "Why not Mean difference?" });
      expect(document.activeElement).toBe(within(panel).getByRole("heading", { name: "Why not Mean difference?" }));
      expect(panel).toHaveTextContent("No pathway has Mean difference with your choice of method, Peto.");
      const [reason] = reasonsFor(["metric", "MD"], ["method", "PETO"]) ?? [];
      expect(panel).toHaveTextContent(reason?.text ?? "missing");
      expect(panel).toHaveTextContent("Rule R5: Peto needs 2x2 tables");
      expect(within(panel).getByRole("link", { name: "metafor, rma.peto()" })).toHaveAttribute("href", map.sources["MF-peto"]?.[1]);
      expect(md).toHaveAttribute("aria-pressed", "false");
      expect(within(panel).getByRole("link", { name: "Rule R5" })).toHaveAttribute("href", "/cards?card=rule%3AR5");
    });

    it("tells screen readers the node opens the panel, and closes on Escape", () => {
      renderAtlas(query);
      const md = node("metric", "MD");
      expect(md).toHaveAttribute("aria-expanded", "false");
      fireEvent.click(md);
      const panel = screen.getByRole("region", { name: "Why not Mean difference?" });
      expect(md).toHaveAttribute("aria-expanded", "true");
      expect(md).toHaveAttribute("aria-controls", panel.id);
      fireEvent.keyDown(panel, { key: "Escape" });
      expect(screen.queryByRole("region", { name: /^Why not/ })).not.toBeInTheDocument();
      expect(document.activeElement).toBe(node("metric", "MD"));
      expect(node("model", "Common effect")).not.toHaveAttribute("aria-expanded");
    });

    it("closes and gives focus back to the node", () => {
      renderAtlas(query);
      fireEvent.click(node("metric", "MD"));
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("region", { name: /^Why not/ })).not.toBeInTheDocument();
      expect(document.activeElement).toBe(node("metric", "MD"));
    });

    it("closes when a choice changes, and a second press on the node closes it too", () => {
      renderAtlas(query);
      fireEvent.click(node("metric", "MD"));
      fireEvent.click(node("metric", "MD"));
      expect(screen.queryByRole("region", { name: /^Why not/ })).not.toBeInTheDocument();
      fireEvent.click(node("metric", "MD"));
      fireEvent.click(node("model", "Common effect"));
      expect(screen.queryByRole("region", { name: /^Why not/ })).not.toBeInTheDocument();
    });

    // "Only through entries marked new" is tested in whyNot.test.ts: since #108 no node the Atlas draws is greyed
    // out by "hide new" alone: no two choices that both have pathways not marked new meet only in new ones.
  });

  describe("cards", () => {
    it("folds the card of each chosen node under its layer, with a link to the Cards page", () => {
      renderAtlas(`?framework=${encodeURIComponent(F1)}&method=PETO`);
      const details = screen.getByText("About Peto").closest("details") as HTMLElement;
      expect(details).not.toHaveAttribute("open");
      expect(layer("method").closest("section")).toContainElement(details);
      expect(details).toHaveTextContent("metafor::rma.peto()");
      expect(within(details).getByRole("link", { name: "Open this card on the Cards page" })).toHaveAttribute(
        "href",
        "/cards?card=method%3APETO",
      );
      expect(screen.getByText(/^About 1\. Interventional/)).toBeInTheDocument();
      expect(screen.queryByText(/^About Random effects/)).not.toBeInTheDocument();
    });

    it("in a card's panel, says that card links open Cards, puts its sections under the layer, and has no Atlas link", () => {
      renderAtlas(`?framework=${encodeURIComponent(F1)}&method=PETO`);
      const details = screen.getByText("About Peto").closest("details") as HTMLElement;
      // the layer's heading is an h2, so the card's sections are h3
      expect(within(details).getByRole("heading", { level: 3, name: "Cautions" })).toBeInTheDocument();
      expect(within(details).queryAllByRole("heading", { level: 4 })).toHaveLength(0);
      expect(within(details).getByRole("link", { name: /^The glossary card for continuity correction/ }).parentElement).toHaveTextContent(
        "(opens Cards)",
      );
      expect(details).toHaveTextContent("Rule R5 (opens its card in Cards)");
      expect(within(details).queryByRole("link", { name: /in the Atlas/ })).toBeNull();
    });

    it("shows a chosen node's flags next to its card's summary", () => {
      // pooling participant data from single groups has no confirmed source yet (#25)
      renderAtlas("?metric=I_P");
      const summary = screen.getByText(/^About Pooled proportion \(logit scale\)/);
      expect(summary.textContent).toMatch(/to check$/);
    });
  });
});

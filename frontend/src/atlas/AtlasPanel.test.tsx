import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { map } from "../map";
import { workbenchHref } from "../workbench/pathway";
import { AtlasPanel } from "./AtlasPanel";
import { TIERS, type Selection } from "./filter";

const OPTIONS = { hideNew: false, runnableOnly: false };

function renderPanel(selection: Selection) {
  return render(
    <MemoryRouter>
      <AtlasPanel tiers={[...TIERS]} selection={selection} options={OPTIONS} picked={null} />
    </MemoryRouter>,
  );
}

const full = (status: string): Selection => {
  const p = map.pathways.find((x) => x.status === status);
  if (!p) throw new Error(`no ${status} pathway`);
  return Object.fromEntries(TIERS.map((t) => [t, p[t]]));
};

describe("the Atlas panel's Workbench link (#165)", () => {
  it("offers the Workbench once all seven choices make a runnable pathway", () => {
    const chosen = full("runnable");
    renderPanel(chosen);
    expect(screen.getByRole("link", { name: "Run this analysis in the Workbench" })).toHaveAttribute(
      "href",
      workbenchHref(chosen as Parameters<typeof workbenchHref>[0]),
    );
  });

  it("doesn't offer it for a pathway that can't be run, or before all seven are chosen", () => {
    const { unmount } = renderPanel(full("planned"));
    expect(screen.queryByRole("link", { name: "Run this analysis in the Workbench" })).toBeNull();
    unmount();
    const partial = { ...full("runnable") };
    delete partial.metric;
    renderPanel(partial);
    expect(screen.queryByRole("link", { name: "Run this analysis in the Workbench" })).toBeNull();
  });
});

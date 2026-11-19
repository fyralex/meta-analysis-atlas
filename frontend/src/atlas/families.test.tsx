// The metric tier by family (#78): the grouping helper, the 3D layer's clusters and labels, the 2D view's groups
// and the side panel's headings. The grouping changes no count: scene.test.ts and AtlasPage.test.tsx check those.
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { map } from "../map";
import { AtlasPanel } from "./AtlasPanel";
import { byFamily, familyOf } from "./families";
import { DEFAULT_OPTIONS, tierNodes, tiersInOrder } from "./filter";
import { scene } from "./scene";

const metrics = tierNodes(map.pathways, {}, "metric", DEFAULT_OPTIONS);

describe("metric families", () => {
  it("groups the metrics by family, in the map's family order, and leaves other tiers whole", () => {
    const groups = byFamily("metric", metrics, (n) => n.value);
    expect(groups.map((g) => g.family)).toEqual(map.metric_families);
    expect(groups.flatMap((g) => g.items)).toHaveLength(metrics.length);
    for (const g of groups) for (const n of g.items) expect(familyOf("metric", n.value)).toBe(g.family);
    const methods = tierNodes(map.pathways, {}, "method", DEFAULT_OPTIONS);
    expect(byFamily("method", methods, (n) => n.value)).toEqual([{ family: undefined, items: methods }]);
  });

  it("clusters the 3D metric layer by family, with a gap and a label for each family", () => {
    const layers = scene(map.pathways, {}, "model-method-metric", DEFAULT_OPTIONS);
    const layer = layers.find((l) => l.tier === "metric");
    expect(layer?.groups.map((g) => g.name)).toEqual(map.metric_families);
    expect(layers.filter((l) => l.tier !== "metric").every((l) => l.groups.length === 0)).toBe(true);
    // each family's nodes sit together: going round the ring, the family changes once per family
    const order = layer?.nodes.map((n) => familyOf("metric", n.value)) ?? [];
    const changes = order.filter((f, i) => i > 0 && f !== order[i - 1]).length;
    expect(changes).toBe(map.metric_families.length - 1);
    // the gap: the largest step between neighbours is wider than the usual one
    const angle = (n: { position: [number, number, number] }) => Math.atan2(n.position[2], n.position[0]);
    const steps = (layer?.nodes ?? []).slice(1).map((n, i) => {
      const prev = layer?.nodes[i];
      return prev ? (angle(n) - angle(prev) + 2 * Math.PI) % (2 * Math.PI) : 0;
    });
    expect(Math.max(...steps)).toBeGreaterThan(Math.min(...steps) * 1.5);
  });

  it("shows the metric tier in the text view as one labelled group per family", () => {
    render(
      <MemoryRouter initialEntries={["/atlas?view=2d"]}>
        <App />
      </MemoryRouter>,
    );
    const toolbar = screen.getByRole("toolbar", { name: "Metric" });
    const groups = within(toolbar).getAllByRole("group");
    expect(
      groups.map(
        (g) =>
          g.getAttribute("aria-labelledby") &&
          document.getElementById(g.getAttribute("aria-labelledby") ?? "")?.textContent,
      ),
    ).toEqual(map.metric_families);
  });

  it("lists the next step's metrics under their family headings in the side panel", () => {
    const tiers = tiersInOrder("model-method-metric");
    render(
      <MemoryRouter>
        <AtlasPanel
          tiers={tiers}
          selection={{ method: "IV" }}
          options={DEFAULT_OPTIONS}
          picked={{ tier: "method", value: "IV" }}
        />
      </MemoryRouter>,
    );
    const next = screen.getByRole("region", { name: /^Next: metric/ });
    const headings = within(next)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings.length).toBeGreaterThan(1);
    expect(headings).toEqual(map.metric_families.filter((f) => headings.includes(f)));
  });
});

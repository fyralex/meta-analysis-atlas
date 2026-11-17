import { useState } from "react";
import { map } from "../map";
import { STATUS_TEXT } from "../status";
import { STATUSES, type Status } from "../types/map";
import {
  filterPathways,
  nodeLabel,
  type NodeSummary,
  type Tier,
  tierNodes,
  tiersInOrder,
  toggle,
  type TierOrder,
} from "./filter";
import { AboutCard } from "./AboutCard";
import { LIST_LIMIT, TIER_NAMES } from "./names";
import { TierLayer } from "./TierLayer";
import { useAtlasState } from "./useAtlasState";
import { explain } from "./whyNot";
import { WhyNotPanel } from "./WhyNotPanel";

const ORDERS: { value: TierOrder; text: string }[] = [
  { value: "model-method-metric", text: "Model → Method → Metric" },
  { value: "metric-method-model", text: "Metric → Method → Model" },
];

/** A method's or metric's own flags: "new" means not in the reviewed draft; "to check", not yet confirmed. */
function entryFlags(tier: "method" | "metric", value: string): { added: boolean; verified: boolean } | undefined {
  return tier === "method" ? map.methods[value] : map.metrics[value];
}

/** Compatible nodes first, then the greyed-out ones; each in the map's order. */
function compatibleFirst(nodes: NodeSummary[]): NodeSummary[] {
  return [...nodes.filter((n) => n.count > 0), ...nodes.filter((n) => n.count === 0)];
}

export function AtlasPage() {
  const { selection, order, options, dropped, update: change } = useAtlasState();
  const [asked, setAsked] = useState<{ tier: Tier; value: string } | null>(null);
  // Any change of choices or settings closes "Why not?": its answer was for the old ones.
  const update: typeof change = (c) => {
    setAsked(null);
    change(c);
  };

  function closeWhyNot() {
    if (!asked) return;
    const { tier, value } = asked;
    setAsked(null);
    const nodes = document.querySelectorAll<HTMLButtonElement>(`#tier-${tier}-nodes button.node`);
    [...nodes].find((b) => b.dataset.value === value)?.focus();
  }
  const tiers = tiersInOrder(order);
  const shown = filterPathways(map.pathways, selection, options);
  const total = options.hideNew ? map.pathways.filter((p) => !p.added).length : map.pathways.length;
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, shown.filter((p) => p.status === s).length])) as Record<
    Status,
    number
  >;
  const chosen = tiers.filter((t) => selection[t] !== undefined);

  return (
    <section className="page atlas">
      <h1>Atlas</h1>
      <p className="lead">
        Every pathway in the map, one layer per tier. Choose a node to keep only the pathways that go through it; each
        node shows how many pathways would remain if you chose it. A node at 0 doesn&apos;t fit your other choices: press it to see why.
        With the keyboard, Tab moves between layers and the arrow keys move between the nodes of a layer.
      </p>

      <div className="atlas-controls">
        <fieldset className="choice">
          <legend>Order of the last three tiers</legend>
          {ORDERS.map((o) => (
            <label key={o.value}>
              <input
                type="radio"
                name="tier-order"
                id={`order-${o.value}`}
                checked={order === o.value}
                onChange={() => {
                  update({ order: o.value });
                }}
              />
              {o.text}
            </label>
          ))}
        </fieldset>
        <label className="choice">
          <input
            type="checkbox"
            id="hide-new"
            checked={options.hideNew}
            onChange={(e) => {
              update({ options: { hideNew: e.target.checked } });
            }}
          />
          Hide entries marked new (not in the reviewed draft the map started from)
        </label>
      </div>

      <ul className="legend" aria-label="Status colours">
        {STATUSES.map((s) => (
          <li key={s}>
            <span className={`swatch st-${s}`} aria-hidden="true" />
            <strong>{STATUS_TEXT[s].name}</strong>: {STATUS_TEXT[s].meaning}
          </li>
        ))}
        <li>
          <span className="badge badge-new" aria-hidden="true">
            new
          </span>{" "}
          <span className="badge badge-check" aria-hidden="true">
            to check
          </span>{" "}
          on a method or metric: the entry isn&apos;t in the reviewed draft the map started from, or isn&apos;t yet
          confirmed from a primary source
        </li>
      </ul>

      <div className="summary" role="status">
        <p>
          <strong>{shown.length}</strong> of {total} pathways match
          {chosen.length > 0 && <> your {chosen.length === 1 ? "choice" : `${String(chosen.length)} choices`}</>}.{" "}
          <span className="muted">
            {STATUSES.filter((s) => byStatus[s] > 0)
              .map((s) => `${String(byStatus[s])} ${STATUS_TEXT[s].name.toLowerCase()}`)
              .join(", ")}
          </span>
        </p>
        {dropped.length > 0 && (
          <p className="note">
            Cleared your {dropped.length === 1 ? "choice" : "choices"} of{" "}
            {dropped.map((t) => TIER_NAMES[t].toLowerCase()).join(" and ")}: with your other choices and settings,{" "}
            {dropped.length === 1 ? "it" : "they"} matched no pathway.
          </p>
        )}
      </div>
      {chosen.length > 0 && (
        <button
          type="button"
          className="clear"
          onClick={() => {
            update({ selection: {} });
          }}
        >
          Clear all choices
        </button>
      )}

      {tiers.map((tier) => (
        <TierLayer
          key={tier}
          id={`tier-${tier}`}
          name={TIER_NAMES[tier]}
          nodes={compatibleFirst(tierNodes(map.pathways, selection, tier, options))}
          label={(value) => nodeLabel(map, tier, value)}
          {...(tier === "method" || tier === "metric" ? { flags: (value: string) => entryFlags(tier, value) } : {})}
          onChoose={(value) => {
            update({ selection: toggle(map.pathways, selection, tier, value, options) });
          }}
          asked={asked?.tier === tier ? asked.value : undefined}
          onWhyNot={(value) => {
            setAsked(asked?.tier === tier && asked.value === value ? null : { tier, value });
          }}
        >
          {asked?.tier === tier && (
            <WhyNotPanel
              tier={tier}
              label={nodeLabel(map, tier, asked.value)}
              explanation={explain(map.pathways, selection, tier, asked.value, options)}
              labelOf={(t, v) => nodeLabel(map, t, v)}
              onClose={closeWhyNot}
            />
          )}
          {selection[tier] !== undefined && (
            <AboutCard
              key={selection[tier]}
              tier={tier}
              value={selection[tier]}
              label={nodeLabel(map, tier, selection[tier])}
            />
          )}
        </TierLayer>
      ))}

      <h2>Matching pathways</h2>
      {shown.length <= LIST_LIMIT ? (
        <div className="table-wrap">
          <table className="pathways">
            <caption className="sr-only">The {shown.length} matching pathways</caption>
            <thead>
              <tr>
                {tiers.map((t) => (
                  <th key={t} scope="col">
                    {TIER_NAMES[t]}
                  </th>
                ))}
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={tiers.map((t) => p[t]).join("|")}>
                  {tiers.map((t) => (
                    <td key={t}>{nodeLabel(map, t, p[t])}</td>
                  ))}
                  <td>
                    <span className={`swatch st-${p.status}`} aria-hidden="true" /> {STATUS_TEXT[p.status].name}
                    {p.added && <span className="badge badge-new">new</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">
          {shown.length} pathways match. They are listed here once your choices narrow them to {LIST_LIMIT} or fewer.
        </p>
      )}
    </section>
  );
}

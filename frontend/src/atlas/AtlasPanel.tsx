import type { ReactNode } from "react";
import { Link } from "react-router";
import { cardFor, cardHref } from "../cards/cards";
import { map } from "../map";
import { nodeLabel, tierNodes, type FilterOptions, type Selection, type Tier } from "./filter";
import { TIER_NAMES } from "./names";

// The panel beside the 3D map (#92, design E): read-only, it follows the clicks on the map. It says what the dot
// just clicked is, lists the options still possible at the next step with their counts, and the choices made.
// Choosing happens on the map; "Why not?" for a grey dot shows here too (passed in as whyNot).

interface Props {
  tiers: Tier[];
  selection: Selection;
  options: FilterOptions;
  /** The dot last clicked and kept as a choice, if any. */
  picked: { tier: Tier; value: string } | null;
  whyNot?: ReactNode;
}

/** A choice's name in plain words where its card has them, else its name in the map. */
const plainName = (tier: Tier, value: string) => cardFor(tier, value)?.plain?.title ?? nodeLabel(map, tier, value);

export function AtlasPanel({ tiers, selection, options, picked, whyNot }: Props) {
  const chosen = tiers.filter((t) => selection[t] !== undefined);
  // The next step: the one after the dot just clicked, or the first step not chosen yet.
  const after = picked ? tiers.indexOf(picked.tier) + 1 : 0;
  const next =
    tiers.slice(after).find((t) => selection[t] === undefined) ?? tiers.find((t) => selection[t] === undefined);
  const possible = next ? tierNodes(map.pathways, selection, next, options).filter((n) => n.count > 0) : [];
  const card = picked ? cardFor(picked.tier, picked.value) : undefined;
  const what = card?.teach.find((t) => t.kind === "what");
  const name = picked ? plainName(picked.tier, picked.value) : "";
  const technical = picked ? nodeLabel(map, picked.tier, picked.value) : "";
  const through = picked
    ? tierNodes(map.pathways, selection, picked.tier, options).find((n) => n.value === picked.value)
    : undefined;

  return (
    <aside className="atlas-panel" aria-labelledby="atlas-panel-title">
      <h2 id="atlas-panel-title">What you clicked</h2>
      {/* One short line for screen readers after each click, rather than re-reading the whole panel. */}
      <p className="sr-only" role="status">
        {picked && !whyNot
          ? `${name} chosen.${
              next ? ` ${String(possible.length)} ${possible.length === 1 ? "option" : "options"} at the next step.` : ""
            }`
          : ""}
      </p>
      {whyNot}
      {!whyNot && !picked && (
        <p className="muted">Click a dot on the map to see what it is and the options at the next step.</p>
      )}
      {!whyNot && picked && (
        <div className="atlas-picked">
          <p className="card-kind">{TIER_NAMES[picked.tier]}</p>
          <p className="atlas-picked-name">{name}</p>
          {name !== technical && <p className="muted">Technical name: {technical}</p>}
          {what && <p>{what.text}</p>}
          {through && (
            <p className="muted">
              {through.count === 1 ? "1 analysis goes" : `${String(through.count)} analyses go`} through it with your
              choices.
            </p>
          )}
          {card && (
            <Link to={cardHref(card.id)}>
              Read its card <span className="muted">(opens Cards)</span>
            </Link>
          )}
        </div>
      )}

      {next && (
        <section aria-labelledby="atlas-next">
          <h2 id="atlas-next">Next: {TIER_NAMES[next].toLowerCase()}</h2>
          <p className="muted">Still possible with your choices. Click one on the map to choose it.</p>
          <ul className="atlas-next">
            {possible.map((n) => (
              <li key={n.value}>
                <span>{plainName(next, n.value)}</span> <span className="muted">{n.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {chosen.length > 0 && (
        <section aria-labelledby="atlas-chosen">
          <h2 id="atlas-chosen">Your choices</h2>
          <dl className="atlas-chosen">
            {chosen.map((t) => (
              <div key={t}>
                <dt>{TIER_NAMES[t]}</dt>
                <dd>{plainName(t, selection[t] ?? "")}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </aside>
  );
}

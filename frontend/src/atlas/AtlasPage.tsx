import { lazy, Suspense, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
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
  included,
  toggle,
  type TierOrder,
} from "./filter";
import { AboutCard } from "./AboutCard";
import { LIST_LIMIT, TIER_NAMES } from "./names";
import { TierLayer } from "./TierLayer";
import { ANY_RUNNABLE, useAtlasState } from "./useAtlasState";
import { explain } from "./whyNot";
import { WhyNotPanel } from "./WhyNotPanel";
import { hasWebGL, scene } from "./scene";
import { View3DBoundary } from "./View3DBoundary";

// three.js is loaded only when the 3D view is chosen; the 2D view, the default, doesn't need it.
const Atlas3D = lazy(() => import("./Atlas3D"));

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
  const { search } = useLocation();
  const [params] = useSearchParams();
  const [webgl] = useState(hasWebGL);
  // Set if the 3D view fails after all (its code doesn't load, or the browser can't draw it): back to 2D.
  const [failed3d, setFailed3d] = useState(false);
  const can3d = webgl && !failed3d;
  const view: "2d" | "3d" = params.get("view") === "3d" && can3d ? "3d" : "2d";
  const region3d = useRef<HTMLElement>(null);
  const [asked, setAsked] = useState<{ tier: Tier; value: string } | null>(null);
  // Any change of choices or settings closes "Why not?": its answer was for the old ones.
  // Pathfinder's advisory answers (rare, vary) belong to the choices they were given for; any change made here
  // takes them back, so they can't reach Pathfinder again on other choices.
  const update: typeof change = (c) => {
    setAsked(null);
    change({ ...c, extra: { rare: null, vary: null, ...c.extra } });
  };

  /** Switching view changes no choice, so Pathfinder's answers stay. */
  function setView(v: "2d" | "3d") {
    setAsked(null);
    change({ extra: { view: v === "3d" ? "3d" : null } });
  }

  function closeWhyNot() {
    if (!asked) return;
    const { tier, value } = asked;
    setAsked(null);
    if (view === "3d") {
      region3d.current?.focus();
      return;
    }
    const nodes = document.querySelectorAll<HTMLButtonElement>(`#tier-${tier}-nodes button.node`);
    [...nodes].find((b) => b.dataset.value === value)?.focus();
  }
  const tiers = tiersInOrder(order);
  const shown = filterPathways(map.pathways, selection, options);
  const total = map.pathways.filter((p) => included(p, options)).length;
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, shown.filter((p) => p.status === s).length])) as Record<
    Status,
    number
  >;
  const chosen = tiers.filter((t) => selection[t] !== undefined);
  // The table shows only the tiers that differ between the matching pathways; the rest go in one line above it.
  const varying = tiers.filter((t) => new Set(shown.map((p) => p[t])).size > 1);
  const common = tiers.filter((t) => !varying.includes(t));

  return (
    <section className="page atlas">
      <h1>Atlas</h1>
      <p className="lead">
        Every pathway in the map, one layer per tier. Choose a node to keep only the pathways through it; its number is
        how many would remain. A node at 0 doesn&apos;t fit your choices: press it to see why.
        {view === "2d" && " Tab moves between layers; the arrow keys move within one."}
      </p>
      <p>
        <Link to={`/pathfinder${search}`}>Answer a few questions in Pathfinder instead</Link>. It keeps your framework,
        group structure, datatype and outcome choices, up to the first one you haven&apos;t made.
      </p>

      <div className="atlas-controls">
        <fieldset className="choice">
          <legend>Show the last three tiers as</legend>
          {ORDERS.map((o) => (
            <label key={o.value}>
              <input
                type="radio"
                name="tier-order"
                id={`order-${o.value}`}
                value={o.value}
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
              update({ options: { ...options, hideNew: e.target.checked } });
            }}
          />
          Hide entries marked new (not in the reviewed draft the map started from)
        </label>
        <label className="choice">
          <input
            type="checkbox"
            id="runnable-only"
            checked={options.runnableOnly === true}
            disabled={!ANY_RUNNABLE}
            aria-describedby={ANY_RUNNABLE ? undefined : "runnable-none"}
            onChange={(e) => {
              update({ options: { ...options, runnableOnly: e.target.checked } });
            }}
          />
          Show only runnable pathways (validated against a published result)
        </label>
        {!ANY_RUNNABLE && (
          <p className="muted" id="runnable-none">
            No pathway is runnable yet. A pathway becomes runnable once it passes a validation test, against a published
            worked example or the R package run on the same data; the first ones are planned for v0.2.
          </p>
        )}
        <fieldset className="choice">
          <legend>View</legend>
          <label>
            <input
              type="radio"
              name="atlas-view"
              id="view-2d"
              value="2d"
              checked={view === "2d"}
              onChange={() => {
                setView("2d");
              }}
            />
            2D (works with the keyboard and screen readers)
          </label>
          <label>
            <input
              type="radio"
              name="atlas-view"
              id="view-3d"
              value="3d"
              checked={view === "3d"}
              disabled={!can3d}
              onChange={() => {
                setView("3d");
              }}
            />
            3D (drag to turn, click a node to choose it)
          </label>
          {!webgl && <p className="muted">This browser can&apos;t draw the 3D view (no WebGL 2), so the Atlas shows 2D.</p>}
          {webgl && failed3d && (
            <p className="muted" role="status">
              The 3D view couldn&apos;t be drawn here, so the Atlas shows 2D.
            </p>
          )}
        </fieldset>
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

      {view === "3d" && (
        <section className="atlas-3d-view" aria-label="The map in 3D" ref={region3d} tabIndex={-1}>
          <p className="muted">
            Drag to turn the layers; click a node to choose it, or a grey one to see why. The 2D view has the same nodes
            and counts, and works with the keyboard.
          </p>
          <View3DBoundary
            onError={() => {
              setFailed3d(true);
            }}
          >
            <Suspense fallback={<p>Loading the 3D view…</p>}>
              <Atlas3D
                layers={scene(map.pathways, selection, order, options)}
                onPick={(n) => {
                  if (n.count > 0) update({ selection: toggle(map.pathways, selection, n.tier, n.value, options) });
                  else setAsked(asked?.tier === n.tier && asked.value === n.value ? null : { tier: n.tier, value: n.value });
                }}
              />
            </Suspense>
          </View3DBoundary>
          {asked && (
            <WhyNotPanel
              tier={asked.tier}
              label={nodeLabel(map, asked.tier, asked.value)}
              explanation={explain(map.pathways, selection, asked.tier, asked.value, options)}
              labelOf={(t, v) => nodeLabel(map, t, v)}
              onClose={closeWhyNot}
            />
          )}
          {tiers
            .filter((t) => selection[t] !== undefined)
            .map((t) => (
              <AboutCard
                key={`${t}=${selection[t] ?? ""}`}
                tier={t}
                value={selection[t] ?? ""}
                label={nodeLabel(map, t, selection[t] ?? "")}
              />
            ))}
        </section>
      )}

      {view === "2d" &&
        tiers.map((tier) => (
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
        <>
          {common.length > 0 && shown.length > 0 && (
            <p className="pathways-common">
              {shown.length === 1 ? "It has" : `All ${String(shown.length)} share`}:{" "}
              {common.map((t, i) => (
                <span key={t}>
                  {i > 0 && " · "}
                  {TIER_NAMES[t]} <strong>{nodeLabel(map, t, shown[0]?.[t] ?? "")}</strong>
                </span>
              ))}
            </p>
          )}
          <div className="table-wrap">
            {/* Explicit roles: on narrow screens the rows become cards (CSS display), which some browsers would
                otherwise read as plain text rather than a table. */}
            <table className="pathways" role="table">
              <caption className="sr-only">The {shown.length} matching pathways</caption>
              <thead role="rowgroup">
                <tr role="row">
                  <th scope="col" role="columnheader">
                    Status
                  </th>
                  {varying.map((t) => (
                    <th key={t} scope="col" role="columnheader">
                      {TIER_NAMES[t]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody role="rowgroup">
                {shown.map((p) => (
                  <tr key={tiers.map((t) => p[t]).join("|")} role="row">
                    <td role="cell">
                      <span className="cell-label" aria-hidden="true">
                        Status
                      </span>
                      <span>
                        <span className={`swatch st-${p.status}`} aria-hidden="true" /> {STATUS_TEXT[p.status].name}
                        {p.added && <span className="badge badge-new">new</span>}
                      </span>
                    </td>
                    {varying.map((t) => (
                      <td key={t} role="cell">
                        <span className="cell-label" aria-hidden="true">
                          {TIER_NAMES[t]}
                        </span>
                        <span>{nodeLabel(map, t, p[t])}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="muted">
          {shown.length} pathways match. They are listed here once your choices narrow them to {LIST_LIMIT} or fewer.
        </p>
      )}
    </section>
  );
}

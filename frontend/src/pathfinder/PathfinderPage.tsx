import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { DEFAULT_OPTIONS, nodeLabel, type NodeSummary, type Selection, type Tier } from "../atlas/filter";
import { LIST_LIMIT, TIER_NAMES } from "../atlas/names";
import { useAtlasState } from "../atlas/useAtlasState";
import { explain } from "../atlas/whyNot";
import { cardFor, cardHref } from "../cards/cards";
import { map } from "../map";
import { Sources } from "../SourceList";
import { STATUS_TEXT } from "../status";
import { STATUSES } from "../types/map";
import { answer, answered, atlasHref, choices, clearFrom, fitting, nextQuestion, QUESTIONS } from "./flow";

const RESULT_TIERS: Tier[] = ["model", "method", "metric"];

/** What an option is, from the first "What it is" line of its card, with a link to the card. */
function Reason({ tier, value }: { tier: Tier; value: string }) {
  const card = cardFor(tier, value);
  if (!card) return null;
  const what = card.teach.find((t) => t.kind === "what");
  return (
    <div className="option-reason">
      {what && (
        <>
          <p>{what.text}</p>
          <Sources src={what.src} />
        </>
      )}
      <p>
        <Link to={cardHref(card.id)}>More on {card.title}</Link>
      </p>
    </div>
  );
}

/** Why an option is not possible with the answers so far: the map's own reason, as the Atlas gives it. */
function WhyNot({ selection, tier, value }: { selection: Selection; tier: Tier; value: string }) {
  const why = explain(map.pathways, answered(selection), tier, value, DEFAULT_OPTIONS);
  const reason = why.kind === "blocked" ? why.blockers[0]?.reasons[0] : undefined;
  if (!reason) return <p className="muted">Not possible with your answers together.</p>;
  return (
    <div className="option-reason">
      <p>{reason.text}</p>
      <Sources src={reason.src} />
    </div>
  );
}

function Options({ selection, tier, onPick }: { selection: Selection; tier: Tier; onPick: (value: string) => void }) {
  const nodes = choices(selection, tier);
  const possible = nodes.filter((n) => n.count > 0);
  const not = nodes.filter((n) => n.count === 0);
  const item = (n: NodeSummary) => (
    <li key={n.value}>
      <button
        type="button"
        className="option"
        onClick={() => {
          onPick(n.value);
        }}
      >
        {nodeLabel(map, tier, n.value)}{" "}
        <span className="muted">
          ({n.count} {n.count === 1 ? "pathway" : "pathways"})
        </span>
      </button>
      <Reason tier={tier} value={n.value} />
    </li>
  );
  return (
    <>
      <ul className="options">{possible.map(item)}</ul>
      {not.length > 0 && (
        <details className="not-possible">
          <summary>Not possible with your answers ({not.length})</summary>
          <ul className="options">
            {not.map((n) => (
              <li key={n.value}>
                <strong>{nodeLabel(map, tier, n.value)}</strong>
                <WhyNot selection={selection} tier={tier} value={n.value} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

export function PathfinderPage() {
  const { selection, update } = useAtlasState();
  const answers = answered(selection);
  const next = nextQuestion(selection);
  const found = fitting(selection);
  const heading = useRef<HTMLHeadingElement>(null);
  const step = next?.tier ?? "results";
  const started = Object.keys(answers).length > 0;
  useEffect(() => {
    if (started) heading.current?.focus();
  }, [step, started]);

  const byStatus = STATUSES.filter((s) => found.some((p) => p.status === s)).map(
    (s) => `${String(found.filter((p) => p.status === s).length)} ${STATUS_TEXT[s].name.toLowerCase()}`,
  );

  return (
    <section className="page pathfinder">
      <h1>Pathfinder</h1>
      <p className="lead">
        A few questions about your review, in the order a methodologist asks them, lead to the pathways that fit.
        Each option says what it is, with its source. Options the map rules out say why. Your answers are shared with
        the Atlas.
      </p>

      <ol className="steps">
        {QUESTIONS.filter((q) => answers[q.tier] !== undefined).map((q) => {
          const value = answers[q.tier] ?? "";
          return (
            <li key={q.tier} className="step done">
              <p className="step-question">{q.text}</p>
              <p>
                {TIER_NAMES[q.tier]}: <strong>{nodeLabel(map, q.tier, value)}</strong>{" "}
                <button
                  type="button"
                  className="link-button"
                  aria-label={`Change ${TIER_NAMES[q.tier].toLowerCase()}`}
                  onClick={() => {
                    update({ selection: clearFrom(selection, q.tier) });
                  }}
                >
                  Change
                </button>
              </p>
            </li>
          );
        })}
        {next && (
          <li className="step current">
            <h2 ref={heading} tabIndex={-1}>
              {next.text}
            </h2>
            <Options
              selection={selection}
              tier={next.tier}
              onPick={(value) => {
                update({ selection: answer(selection, next.tier, value) });
              }}
            />
          </li>
        )}
      </ol>

      {!next && (
        <section aria-labelledby="pf-results">
          <h2 id="pf-results" ref={heading} tabIndex={-1}>
            Pathways that fit your answers
          </h2>
          <p role="status">
            <strong>{found.length}</strong> {found.length === 1 ? "pathway fits" : "pathways fit"}.{" "}
            <span className="muted">{byStatus.join(", ")}</span>
          </p>
          <p>
            <Link to={atlasHref(selection)}>Open them in the Atlas</Link>, to choose the model, method and metric and
            see why the others don&apos;t fit.
          </p>
          {found.length <= LIST_LIMIT ? (
            <div className="table-wrap">
              <table className="pathways">
                <caption className="sr-only">The {found.length} pathways that fit</caption>
                <thead>
                  <tr>
                    {RESULT_TIERS.map((t) => (
                      <th key={t} scope="col">
                        {TIER_NAMES[t]}
                      </th>
                    ))}
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {found.map((p) => (
                    <tr key={RESULT_TIERS.map((t) => p[t]).join("|")}>
                      {RESULT_TIERS.map((t) => (
                        <td key={t}>
                          <Link to={cardHref(cardFor(t, p[t])?.id ?? "")}>{nodeLabel(map, t, p[t])}</Link>
                        </td>
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
              {found.length} pathways fit; the Atlas lists them once its choices narrow them to {LIST_LIMIT} or fewer.
            </p>
          )}
        </section>
      )}

      {started && (
        <p>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              update({ selection: {} });
            }}
          >
            Start again
          </button>
        </p>
      )}
    </section>
  );
}

import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { nodeLabel, type FilterOptions, type NodeSummary, type Selection, type Tier } from "../atlas/filter";
import { LIST_LIMIT, TIER_NAMES } from "../atlas/names";
import { useAtlasState } from "../atlas/useAtlasState";
import { explain, ruleText } from "../atlas/whyNot";
import { cardFor, cardHref } from "../cards/cards";
import { map } from "../map";
import { Sources } from "../SourceList";
import { STATUS_TEXT } from "../status";
import { STATUSES } from "../types/map";
import { answer, answered, atlasHref, choices, clearFrom, fitting, nextQuestion, QUESTIONS, unused } from "./flow";

const RESULT_TIERS: Tier[] = ["model", "method", "metric"];
const lower = (t: Tier) => TIER_NAMES[t].toLowerCase();

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

/** Why an option is not possible with the answers so far: every answer it conflicts with, with the map's reasons. */
function WhyNot({ selection, tier, value, options }: { selection: Selection; tier: Tier; value: string; options: FilterOptions }) {
  const why = explain(map.pathways, answered(selection), tier, value, options);
  if (why.kind === "hidden-new") return <p className="muted">It is only in entries marked new, which are hidden.</p>;
  if (why.kind !== "blocked") return <p className="muted">Not possible with your answers together.</p>;
  return (
    <ul className="option-reason">
      {why.blockers.map((b) => (
        <li key={b.tier}>
          <p>
            Not with your {lower(b.tier)}, {nodeLabel(map, b.tier, b.value)}:
          </p>
          {b.reasons.map((r) => (
            <div key={r.text}>
              <p>{r.text}</p>
              {r.rule && (
                <p className="rule">
                  <Link to={cardHref(`rule:${r.rule}`)}>Rule {r.rule}</Link>: {ruleText(map, r.rule)}
                </p>
              )}
              <Sources src={r.src} />
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}

interface OptionsProps {
  selection: Selection;
  tier: Tier;
  options: FilterOptions;
  onPick: (value: string) => void;
}

function Options({ selection, tier, options, onPick }: OptionsProps) {
  const nodes = choices(selection, tier, options);
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
                <WhyNot selection={selection} tier={tier} value={n.value} options={options} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

export function PathfinderPage() {
  const { selection, order, options, update } = useAtlasState();
  const answers = answered(selection);
  const next = nextQuestion(selection);
  const found = fitting(selection, options);
  const ignored = unused(selection);
  const heading = useRef<HTMLHeadingElement>(null);
  const step = next?.tier ?? "results";
  // Move focus to the question (or the results) after each answer, change or restart; not on first load.
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) heading.current?.focus();
    loaded.current = true;
  }, [step]);

  const byStatus = STATUSES.filter((s) => found.some((p) => p.status === s)).map(
    (s) => `${String(found.filter((p) => p.status === s).length)} ${STATUS_TEXT[s].name.toLowerCase()}`,
  );

  return (
    <section className="page pathfinder">
      <h1>Pathfinder</h1>
      <p className="lead">
        A few questions about your review, in the order a methodologist asks them, lead to the pathways that fit. Each
        option says what it is, with its source, where its card has that text; options the map rules out say why. Your
        answers are shared with the Atlas.
      </p>
      {options.hideNew && (
        <p className="note">
          Entries marked new are hidden, as in the Atlas.{" "}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              update({ options: { ...options, hideNew: false } });
            }}
          >
            Show them
          </button>
        </p>
      )}
      {ignored.length > 0 && (
        <p className="note">
          Pathfinder doesn&apos;t use your {ignored.map(lower).join(", ")} choice{ignored.length === 1 ? "" : "s"} from
          the address; {ignored.length === 1 ? "it is" : "they are"} cleared when you answer.
        </p>
      )}

      <ol className="steps">
        {QUESTIONS.filter((q) => answers[q.tier] !== undefined).map((q) => {
          const label = nodeLabel(map, q.tier, answers[q.tier] ?? "");
          return (
            <li key={q.tier} className="step done">
              <p className="step-question">{q.text}</p>
              <p>
                {TIER_NAMES[q.tier]}: <strong>{label}</strong>{" "}
                <button
                  type="button"
                  className="link-button"
                  aria-label={`Change ${lower(q.tier)} (now ${label})`}
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
          <li key={next.tier} className="step current">
            <h2 ref={heading} tabIndex={-1}>
              {next.text}
            </h2>
            <Options
              selection={selection}
              tier={next.tier}
              options={options}
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
          <p>
            <strong>{found.length}</strong> {found.length === 1 ? "pathway fits" : "pathways fit"}.{" "}
            <span className="muted">{byStatus.join(", ")}</span>
          </p>
          <p>
            <Link to={atlasHref(selection, options, order)}>Open them in the Atlas</Link>, to choose the model, method
            and metric and see why the others don&apos;t fit.
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

      {Object.keys(answers).length > 0 && (
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

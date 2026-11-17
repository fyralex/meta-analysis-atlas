import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router";
import { nodeLabel, type FilterOptions, type NodeSummary, type Selection, type Tier } from "../atlas/filter";
import { LIST_LIMIT, TIER_NAMES } from "../atlas/names";
import { useAtlasState } from "../atlas/useAtlasState";
import { explain, ruleText } from "../atlas/whyNot";
import { cardFor, cardHref } from "../cards/cards";
import { map } from "../map";
import { Sources } from "../SourceList";
import { STATUS_TEXT } from "../status";
import { STATUSES, type Pathway } from "../types/map";
import {
  ADVICE,
  answer,
  answered,
  asksRare,
  asksVary,
  atlasHref,
  choices,
  clearFrom,
  fitting,
  MODEL_FOR,
  modelsIn,
  nextQuestion,
  QUESTIONS,
  RARE,
  rareLines,
  readAdvice,
  unused,
  VARY,
  type Advice,
  type AdviceQuestion,
} from "./flow";

const RESULT_TIERS: Tier[] = ["model", "method", "metric"];
const lower = (t: Tier) => TIER_NAMES[t].toLowerCase();
/** Changing one of the four answers takes back the advisory answers too: they depend on what fits. */
const NO_ADVICE = { rare: null, vary: null };

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

function AdviceOptions({ question, onPick }: { question: AdviceQuestion; onPick: (a: Advice) => void }) {
  return (
    <ul className="options">
      {ADVICE.map((a) => (
        <li key={a}>
          <button
            type="button"
            className="option"
            onClick={() => {
              onPick(a);
            }}
          >
            {question.answers[a]}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Both models' cards: what each is, and the debate between them, as each card states it. */
function ModelAdvice({ found }: { found: readonly Pathway[] }) {
  const cards = modelsIn(found).flatMap((m) => {
    const c = cardFor("model", m);
    return c ? [c] : [];
  });
  return (
    <ul className="option-reason">
      {cards.map((c) => (
        <li key={c.id}>
          <p>
            <Link to={cardHref(c.id)}>{c.title}</Link>
          </p>
          {c.teach
            .filter((t) => t.kind === "use" || t === c.teach.find((w) => w.kind === "what"))
            .map((t) => (
              <div key={t.text}>
                <p>{t.text}</p>
                <Sources src={t.src} />
              </div>
            ))}
        </li>
      ))}
    </ul>
  );
}

/** What the cards of the methods that fit say about rare events, with the rule behind a caution. */
function RareAdvice({ found }: { found: readonly Pathway[] }) {
  return (
    <ul className="option-reason">
      {rareLines(found).map(({ method, line }) => {
        const card = cardFor("method", method);
        return (
          <li key={`${method}:${line.text}`}>
            <p>
              <Link to={cardHref(card?.id ?? "")}>{nodeLabel(map, "method", method)}</Link>
              {line.kind === "caution" ? " (caution)" : ""}: {line.text}
            </p>
            {method === "IV" && line.kind === "caution" && (
              <p className="rule">
                <Link to={cardHref("rule:R9")}>Rule R9</Link>: {ruleText(map, "R9")}
              </p>
            )}
            <Sources src={line.src} />
          </li>
        );
      })}
    </ul>
  );
}

export function PathfinderPage() {
  const { selection, order, options, update } = useAtlasState();
  const [params] = useSearchParams();
  const answers = answered(selection);
  const next = nextQuestion(selection);
  const found = fitting(selection, options);
  const rare = readAdvice(params.get("rare"));
  const vary = readAdvice(params.get("vary"));
  const askRare = next === undefined && asksRare(found);
  const askVary = next === undefined && asksVary(found);
  const advice: AdviceQuestion | undefined =
    next !== undefined ? undefined : askRare && !rare ? RARE : askVary && !vary ? VARY : undefined;
  const model = askVary && vary ? selection.model : undefined;
  const shown = model === undefined ? found : found.filter((p) => p.model === model);
  const ignored = unused(selection).filter((t) => t !== "model" || !(askVary && vary));
  const heading = useRef<HTMLHeadingElement>(null);
  const step = next?.tier ?? advice?.key ?? "results";
  // Move focus to the question (or the results) when the step changes: after an answer, a change or a restart,
  // not on first load (comparing with the last step, so StrictMode's second run of the effect changes nothing).
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    heading.current?.focus();
  }, [step]);

  const byStatus = STATUSES.filter((s) => shown.some((p) => p.status === s)).map(
    (s) => `${String(shown.filter((p) => p.status === s).length)} ${STATUS_TEXT[s].name.toLowerCase()}`,
  );
  const doneAdvice = [
    ...(askRare && rare ? [{ q: RARE, a: rare, clear: { rare: null, vary: null } }] : []),
    ...(askVary && vary ? [{ q: VARY, a: vary, clear: { vary: null } }] : []),
  ];

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
          the address; {ignored.length === 1 ? "it is" : "they are"} cleared when you answer or change an answer.
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
                    update({ selection: clearFrom(selection, q.tier), extra: NO_ADVICE });
                  }}
                >
                  Change
                </button>
              </p>
            </li>
          );
        })}
        {doneAdvice.map(({ q, a, clear }) => (
          <li key={q.key} className="step done">
            <p className="step-question">{q.text}</p>
            <p>
              <strong>{q.answers[a]}</strong>{" "}
              <button
                type="button"
                className="link-button"
                aria-label={`Change your answer to “${q.text}” (now ${q.answers[a]})`}
                onClick={() => {
                  update({ selection: answers, extra: clear });
                }}
              >
                Change
              </button>
            </p>
          </li>
        ))}
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
                update({ selection: answer(selection, next.tier, value), extra: NO_ADVICE });
              }}
            />
          </li>
        )}
        {advice && (
          <li key={advice.key} className="step current">
            <h2 ref={heading} tabIndex={-1}>
              {advice.text}
            </h2>
            {advice.key === "rare" ? (
              <p>
                Your answer removes no pathway. It decides whether the results show what the cards of the methods here
                say about rare events.
              </p>
            ) : (
              <>
                <p>
                  Your answer removes no pathway. &ldquo;Yes&rdquo; shows the random-effects pathways, &ldquo;No&rdquo;
                  the common-effect ones, and the other model stays one click away. What the cards say about the two
                  models:
                </p>
                <ModelAdvice found={found} />
              </>
            )}
            <AdviceOptions
              question={advice}
              onPick={(a) => {
                const pick = advice.key === "vary" ? MODEL_FOR[a] : undefined;
                update({ selection: pick ? { ...answers, model: pick } : answers, extra: { [advice.key]: a } });
              }}
            />
          </li>
        )}
      </ol>

      {!next && !advice && (
        <section aria-labelledby="pf-results">
          <h2 id="pf-results" ref={heading} tabIndex={-1}>
            Pathways that fit your answers
          </h2>
          <p>
            <strong>{shown.length}</strong> {shown.length === 1 ? "pathway fits" : "pathways fit"}.{" "}
            <span className="muted">{byStatus.join(", ")}</span>
          </p>

          {askVary && vary && (
            <section className="advice" aria-labelledby="pf-model">
              <h3 id="pf-model">Model</h3>
              <p>
                {model === undefined ? "Both models are shown." : `Showing ${model.toLowerCase()} pathways only.`}
              </p>
              <ul className="model-switch">
                {modelsIn(found)
                  .filter((m) => m !== model)
                  .map((m) => (
                    <li key={m}>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => {
                          update({ selection: { ...answers, model: m } });
                        }}
                      >
                        Show {m.toLowerCase()} pathways only
                      </button>
                    </li>
                  ))}
                {model !== undefined && (
                  <li>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        update({ selection: answers });
                      }}
                    >
                      Show both models
                    </button>
                  </li>
                )}
              </ul>
              <ModelAdvice found={found} />
            </section>
          )}

          {askRare && (rare === "yes" || rare === "unsure") && (
            <section className="advice" aria-labelledby="pf-rare">
              <h3 id="pf-rare">Rare events</h3>
              <p>
                {rare === "yes" ? "You said the events are rare" : "In case the events are rare"}: this is what
                the cards of the methods here say about them. No pathway is removed.
              </p>
              <RareAdvice found={shown} />
            </section>
          )}

          <p>
            <Link to={atlasHref(model === undefined ? answers : { ...answers, model }, options, order)}>
              Open them in the Atlas
            </Link>
            , to choose the model, method and metric and see why the others don&apos;t fit.
          </p>
          {shown.length <= LIST_LIMIT ? (
            <div className="table-wrap">
              <table className="pathways">
                <caption className="sr-only">The {shown.length} pathways that fit</caption>
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
                  {shown.map((p) => (
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
              {shown.length} pathways fit; the Atlas lists them once its choices narrow them to {LIST_LIMIT} or fewer.
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
              update({ selection: {}, extra: NO_ADVICE });
            }}
          >
            Start again
          </button>
        </p>
      )}
    </section>
  );
}

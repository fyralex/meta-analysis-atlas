import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { nodeLabel, type FilterOptions, type Selection, type Tier } from "../atlas/filter";
import { TIER_NAMES } from "../atlas/names";
import { useAtlasState } from "../atlas/useAtlasState";
import { explain, ruleText } from "../atlas/whyNot";
import { cardFor, cardHref } from "../cards/cards";
import { map } from "../map";
import { Sources } from "../SourceList";
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
  readAdvice,
  unused,
  VARY,
  type Advice,
  type AdviceQuestion,
} from "./flow";
import { PathMap } from "./PathMap";
import { ModelCards, Results } from "./Results";

// Pathfinder (#7), laid out as design B of #92: a step bar that holds the answers, one question at a time with
// Back and Next buttons that say where they go, and a side panel with the live count.

const lower = (t: Tier) => TIER_NAMES[t].toLowerCase();
/** Changing one of the four answers takes back the advisory answers too: they depend on what fits. */
const NO_ADVICE = { rare: null, vary: null };
const fits = (n: number) => `${String(n)} ${n === 1 ? "analysis fits" : "analyses fit"}`;
/** A choice's name in plain words where the map has one (#92), else its name in the map. */
const plainName = (tier: Tier, value: string) => cardFor(tier, value)?.plain?.title ?? nodeLabel(map, tier, value);

/** What an option is, from the first "What it is" line of its card. */
function Reason({ tier, value }: { tier: Tier; value: string }) {
  const what = cardFor(tier, value)?.teach.find((t) => t.kind === "what");
  if (!what) return null;
  return (
    <div className="option-reason">
      <p>{what.text}</p>
      <Sources src={what.src} />
    </div>
  );
}

/** Why an option is not possible with the answers so far: every answer it conflicts with, with the map's reasons. */
function WhyNot({ selection, tier, value, options }: { selection: Selection; tier: Tier; value: string; options: FilterOptions }) {
  const why = explain(map.pathways, answered(selection), tier, value, options);
  if (why.kind === "hidden-new") return <p className="muted">It is only in entries marked new, which are hidden.</p>;
  if (why.kind === "not-runnable") return <p className="muted">None of its analyses that fit your answers can be run yet.</p>;
  if (why.kind === "hidden-both") {
    return <p className="muted">It is only in entries marked new that aren&apos;t runnable yet, and both are hidden.</p>;
  }
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

interface Step {
  n: number;
  name: string;
  state: "done" | "current" | "todo" | "skipped";
  answer?: string;
  change?: () => void;
}

/** The six steps, with the answers given and a way to change each. */
function StepBar({ steps }: { steps: Step[] }) {
  return (
    <ol className="stepbar" aria-label="Your answers, step by step">
      {steps.map((s) => (
        <li key={s.n} className={`stepbar-item ${s.state}`} aria-current={s.state === "current" ? "step" : undefined}>
          <span className="stepbar-name">
            {s.n} · {s.name}
          </span>
          {s.state === "done" && (
            <>
              <strong className="stepbar-answer">{s.answer}</strong>
              <button
                type="button"
                className="link-button"
                aria-label={`Change this answer: question ${String(s.n)}, ${s.name.toLowerCase()} (now ${s.answer ?? ""})`}
                onClick={s.change}
              >
                Change this answer
              </button>
            </>
          )}
          {s.state === "current" && <span className="stepbar-answer">Answering now</span>}
          {s.state === "skipped" && <span className="stepbar-answer muted">Not needed for your answers</span>}
        </li>
      ))}
    </ol>
  );
}

interface Choice {
  value: string;
  label: string;
  body?: ReactNode;
  card?: { id: string; title: string };
}

interface QuestionProps {
  n: number;
  /** The option chosen before, when the reader comes back to this question. */
  initial?: string | undefined;
  text: string;
  intro?: ReactNode;
  choices: Choice[];
  after?: ReactNode;
  back?: { label: string; go: () => void };
  nextLabel: (picked: string | undefined) => string;
  onNext: (value: string) => void;
  heading: React.RefObject<HTMLHeadingElement | null>;
}

/** One question: its options as a radio group, then Back and Next, each saying where it goes. */
function Question({ n, initial, text, intro, choices, after, back, nextLabel, onNext, heading }: QuestionProps) {
  // A remembered answer counts only if this question still offers it.
  const [picked, setPicked] = useState<string | undefined>(
    initial !== undefined && choices.some((c) => c.value === initial) ? initial : undefined,
  );
  const hint = `q${String(n)}-hint`;
  return (
    <form
      className="question"
      onSubmit={(e) => {
        e.preventDefault();
        if (picked !== undefined) onNext(picked);
      }}
    >
      <p className="question-step muted">Question {n}</p>
      <h1 ref={heading} tabIndex={-1}>
        {text}
      </h1>
      {intro}
      <fieldset className="choices">
        <legend className="sr-only">{text}</legend>
        {choices.map((c, i) => {
          // The label is the option's name; what it is, its sources and its count describe it.
          const desc = `q${String(n)}-o${String(i)}`;
          return (
            <div key={c.value} className={picked === c.value ? "choice picked" : "choice"}>
              <label className="choice-label">
                <input
                  type="radio"
                  name={`q${String(n)}`}
                  value={c.value}
                  checked={picked === c.value}
                  aria-describedby={c.body ? desc : undefined}
                  onChange={() => {
                    setPicked(c.value);
                  }}
                />
                <strong>{c.label}</strong>
              </label>
              {c.body && (
                <div className="choice-body" id={desc}>
                  {c.body}
                </div>
              )}
              {c.card && (
                <Link className="choice-card" to={cardHref(c.card.id)}>
                  More on {c.card.title} <span className="muted">(opens Cards)</span>
                </Link>
              )}
            </div>
          );
        })}
      </fieldset>
      {after}
      <div className="question-buttons">
        {back && (
          <button type="button" className="button-secondary" onClick={back.go}>
            {back.label}
          </button>
        )}
        <button
          type="submit"
          className="button-primary"
          disabled={picked === undefined}
          aria-describedby={picked === undefined ? hint : undefined}
        >
          {nextLabel(picked)}
        </button>
      </div>
      {picked === undefined && (
        <p className="muted question-hint" id={hint}>
          Choose an answer to go on.
        </p>
      )}
    </form>
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
  const [technical, setTechnical] = useState(false);
  // The answer just taken back (by Back or Change), so its question opens with that option still chosen.
  const [returning, setReturning] = useState<{ key: string; value: string } | null>(null);
  /** Show one model's analyses, or both (undefined). */
  function showModel(m: string | undefined) {
    update({ selection: m === undefined ? answers : { ...answers, model: m } });
  }
  const step = next?.tier ?? advice?.key ?? "results";
  // Move focus to the question (or the results) when the step changes: after an answer, a change or a restart,
  // not on first load (comparing with the last step, so StrictMode's second run of the effect changes nothing).
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    heading.current?.focus();
  }, [step]);

  // The six steps: the four questions, then rare events and varying effects where they apply.
  const steps: Step[] = QUESTIONS.map((q, i) => {
    const value = answers[q.tier];
    if (value !== undefined) {
      return {
        n: i + 1,
        name: q.short,
        state: "done",
        answer: plainName(q.tier, value),
        change: () => {
          setReturning({ key: q.tier, value });
          update({ selection: clearFrom(selection, q.tier), extra: NO_ADVICE });
        },
      };
    }
    return { n: i + 1, name: q.short, state: next?.tier === q.tier ? "current" : "todo" };
  });
  const adviceStep = (q: AdviceQuestion, n: number, given: Advice | undefined, applies: boolean, clear: object): Step => {
    if (next !== undefined) return { n, name: q.short, state: "todo" };
    if (!applies) return { n, name: q.short, state: "skipped" };
    if (q.key === "vary" && advice === RARE) return { n, name: q.short, state: "todo" };
    if (given) {
      return {
        n,
        name: q.short,
        state: "done",
        answer: q.answers[given],
        change: () => {
          setReturning({ key: q.key, value: given });
          update({ selection: answers, extra: clear as Record<string, null> });
        },
      };
    }
    return { n, name: q.short, state: "current" };
  };
  steps.push(adviceStep(RARE, 5, rare, askRare, { rare: null, vary: null }));
  steps.push(adviceStep(VARY, 6, vary, askVary, { vary: null }));
  const doneSteps = steps.filter((s) => s.state === "done");
  const lastDone = doneSteps.at(-1);
  const back = lastDone?.change ? { label: `Back to question ${String(lastDone.n)}`, go: lastDone.change } : undefined;

  /** Where Next goes from the last question: the advisory questions that apply, or the results. */
  function afterQuestions(sel: Selection): string {
    const f = fitting(sel, options);
    if (asksRare(f)) return `Next: question 5, ${RARE.short.toLowerCase()}`;
    if (asksVary(f)) return `Next: question 6, ${VARY.short.toLowerCase()}`;
    return "See the results";
  }

  return (
    <section className="page pathfinder">
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
      {options.runnableOnly && (
        <p className="note">
          Only analyses that can be run are shown, as in the Atlas.{" "}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              update({ options: { ...options, runnableOnly: false } });
            }}
          >
            Show all
          </button>
        </p>
      )}
      {ignored.length > 0 && (
        <p className="note">
          Pathfinder doesn&apos;t use your {ignored.map(lower).join(", ")} choice{ignored.length === 1 ? "" : "s"} from
          the address; {ignored.length === 1 ? "it is" : "they are"} cleared when you answer or change an answer.
        </p>
      )}

      <StepBar steps={steps} />

      <div className="pathfinder-body">
        <div className="pathfinder-main">
          {next &&
            (() => {
              const i = QUESTIONS.indexOf(next);
              const nodes = choices(selection, next.tier, options);
              const possible = nodes.filter((nd) => nd.count > 0);
              const not = nodes.filter((nd) => nd.count === 0);
              const following = QUESTIONS[i + 1];
              return (
                <Question
                  key={next.tier}
                  n={i + 1}
                  initial={returning?.key === next.tier ? returning.value : undefined}
                  text={next.text}
                  heading={heading}
                  choices={possible.map((nd) => {
                    const card = cardFor(next.tier, nd.value);
                    const example = card?.plain?.example;
                    return {
                      value: nd.value,
                      label: plainName(next.tier, nd.value),
                      body: (
                        <>
                          {example && <p>{example}</p>}
                          {technical && (
                            <>
                              <p className="muted">Technical name: {nodeLabel(map, next.tier, nd.value)}</p>
                              <Reason tier={next.tier} value={nd.value} />
                            </>
                          )}
                          <p className="choice-count muted">{fits(nd.count)}</p>
                        </>
                      ),
                      ...(card ? { card: { id: card.id, title: card.title } } : {}),
                    };
                  })}
                  after={
                    not.length > 0 && (
                      <details className="not-possible">
                        <summary>
                          Why don&apos;t the other {not.length} fit? <span className="muted">(opens below)</span>
                        </summary>
                        <ul className="options">
                          {not.map((nd) => (
                            <li key={nd.value}>
                              <strong>{plainName(next.tier, nd.value)}</strong>
                              <WhyNot selection={selection} tier={next.tier} value={nd.value} options={options} />
                            </li>
                          ))}
                        </ul>
                      </details>
                    )
                  }
                  {...(back ? { back } : {})}
                  nextLabel={(picked) =>
                    following
                      ? `Next: question ${String(i + 2)}, ${following.short.toLowerCase()}`
                      : picked === undefined
                        ? "Next"
                        : afterQuestions(answer(selection, next.tier, picked))
                  }
                  onNext={(value) => {
                    setReturning(null);
                    update({ selection: answer(selection, next.tier, value), extra: NO_ADVICE });
                  }}
                />
              );
            })()}

          {advice && (
            <Question
              key={advice.key}
              n={advice.key === "rare" ? 5 : 6}
              initial={returning?.key === advice.key ? returning.value : undefined}
              text={advice.text}
              heading={heading}
              intro={
                advice.key === "rare" ? (
                  <p>
                    Your answer removes no analysis. It decides whether the results show what the cards of the methods
                    here say about rare events.
                  </p>
                ) : (
                  <>
                    <p>
                      Your answer removes no analysis. &ldquo;Yes&rdquo; shows the random-effects analyses,
                      &ldquo;No&rdquo; the common-effect ones, and the other model stays one click away. What the cards
                      say about the two models:
                    </p>
                    <ModelCards models={modelsIn(found)} />
                  </>
                )
              }
              choices={ADVICE.map((a) => ({ value: a, label: advice.answers[a] }))}
              {...(back ? { back } : {})}
              nextLabel={() =>
                advice.key === "rare" && askVary ? `Next: question 6, ${VARY.short.toLowerCase()}` : "See the results"
              }
              onNext={(value) => {
                setReturning(null);
                const a = value as Advice;
                // "vary" pre-selects its model; "rare" keeps a model only if "vary" already chose it
                const pick = advice.key === "vary" ? MODEL_FOR[a] : vary ? selection.model : undefined;
                update({ selection: pick ? { ...answers, model: pick } : answers, extra: { [advice.key]: a } });
              }}
            />
          )}

          {!next && !advice && (
            <Results
              found={found}
              shown={shown}
              model={model}
              rare={askRare ? rare : undefined}
              vary={askVary ? vary : undefined}
              onShowModel={showModel}
              heading={heading}
            />
          )}
        </div>

        <aside className="pathfinder-side" aria-labelledby="pf-sofar">
          <h2 id="pf-sofar">With your answers so far</h2>
          <p className="pathfinder-count">
            <strong>{shown.length}</strong> {shown.length === 1 ? "analysis fits" : "analyses fit"}
          </p>
          <PathMap selection={model === undefined ? answers : { ...answers, model }} order={order} options={options} />
          <Link to={atlasHref(selection, options, order, model, params.get("view"))}>
            Open {shown.length === 1 ? "it" : `these ${String(shown.length)}`} in the Atlas, with your answers already
            chosen
          </Link>
          <label className="technical-switch">
            <input
              type="checkbox"
              id="pf-technical"
              checked={technical}
              onChange={(e) => {
                setTechnical(e.target.checked);
              }}
            />
            Show the technical names (for example &ldquo;Arm-level summary data&rdquo;)
          </label>
          {doneSteps.length > 0 && (
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setReturning(null);
                update({ selection: {}, extra: NO_ADVICE });
              }}
            >
              Start again from question 1
            </button>
          )}
        </aside>
      </div>
    </section>
  );
}

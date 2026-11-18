import { type RefObject } from "react";
import { Link } from "react-router";
import { nodeLabel } from "../atlas/filter";
import { ruleText } from "../atlas/whyNot";
import { cardFor, cardHref } from "../cards/cards";
import { map } from "../map";
import { Sources } from "../SourceList";
import { STATUS_TEXT } from "../status";
import { STATUSES, type Pathway } from "../types/map";
import type { TeachKind } from "../types/cards";
import { MODEL_FOR, modelsIn, rareLines, type Advice } from "./flow";

// Pathfinder's results, laid out as design C of #92: the answer first (how many analyses fit), then the advice
// the answers asked for, then the analyses grouped by method, each opening to say what it is, with its sources.

const SOURCES_LABEL = "Sources (open outside the Atlas)";
const KIND_WORDS: Record<TeachKind, string> = { what: "More on what it is", use: "When to use it", caution: "Caution" };
const KINDS: TeachKind[] = ["what", "use", "caution"];
const analyses =(n: number) => `${String(n)} ${n === 1 ? "analysis" : "analyses"}`;

/** The models a group of analyses uses, in words: "common effect only", "both models". */
function modelWords(models: string[]): string {
  if (models.length === 1) return `${(models[0] ?? "").toLowerCase()} only`;
  if (models.length === 2) return "both models";
  return models.map((m) => m.toLowerCase()).join(", ");
}

/** What the cards of the methods that fit say about rare events, with the rule behind a caution. */
function RareAdvice({ found, rare }: { found: readonly Pathway[]; rare: Advice }) {
  return (
    <section className="callout" aria-labelledby="pf-rare">
      <h2 id="pf-rare">{rare === "yes" ? "Your events are rare" : "In case the events are rare"}</h2>
      <p>What the cards of the methods that fit say about rare events. Nothing is removed from the list below.</p>
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
              <Sources src={line.src} label={SOURCES_LABEL} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Why the model filter shows what it shows: the answer to "Do effects differ?", or the reader's own pick. */
function modelReason(model: string | undefined, vary: Advice): string {
  if (model === undefined) {
    return vary === "unsure" ? "Showing both models, because you answered “not sure”." : "Showing both models.";
  }
  const shown = `Showing ${model.toLowerCase()} only`;
  if (MODEL_FOR[vary] !== model) return `${shown}.`;
  return vary === "yes"
    ? `${shown}, because you expect the true effects to differ.`
    : `${shown}, because you expect the studies to share one effect.`;
}

/** What each model's card says it is, with its source and a link to the card. */
export function ModelCards({ models }: { models: readonly string[] }) {
  return (
    <ul className="option-reason">
      {models.map((m) => {
        const c = cardFor("model", m);
        if (!c) return null;
        const what = c.teach.find((t) => t.kind === "what");
        return (
          <li key={c.id}>
            <p>
              <strong>{c.title}</strong>
              {what ? `: ${what.text}` : ""}
            </p>
            {what && <Sources src={what.src} label={SOURCES_LABEL} />}
            <Link to={cardHref(c.id)}>
              Read the card on {c.title.toLowerCase()} <span className="muted">(opens Cards)</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

interface ModelFilterProps {
  found: readonly Pathway[];
  model: string | undefined;
  vary: Advice;
  onShow: (model: string | undefined) => void;
}

/** The model filter: says what it shows and why, with a pressed button for each choice and its count. */
function ModelFilter({ found, model, vary, onShow }: ModelFilterProps) {
  const models = modelsIn(found);
  const choices: { model: string | undefined; label: string; n: number }[] = [
    { model: undefined, label: "Both models", n: found.length },
    ...models.map((m) => ({ model: m, label: `${m} only`, n: found.filter((p) => p.model === m).length })),
  ];
  return (
    <section className="advice" aria-labelledby="pf-model">
      <h2 id="pf-model">Model</h2>
      <p id="pf-model-reason">{modelReason(model, vary)}</p>
      <div className="model-filter" role="group" aria-labelledby="pf-model pf-model-reason">
        {choices.map((c) => (
          <button
            key={c.label}
            type="button"
            className="chip"
            aria-pressed={c.model === model}
            onClick={() => {
              onShow(c.model);
            }}
          >
            {c.label} ({c.n})
          </button>
        ))}
      </div>
      <details className="more">
        <summary>
          What the two models are <span className="muted">(opens below)</span>
        </summary>
        <ModelCards models={models} />
      </details>
    </section>
  );
}

/** One method's analyses: what it is in one line, how many fit and with which models; opens to its card text. */
function MethodGroup({ method, rows }: { method: string; rows: readonly Pathway[] }) {
  const card = cardFor("method", method);
  const name = nodeLabel(map, "method", method);
  const what = card?.teach.find((t) => t.kind === "what");
  const metrics = [...new Set(rows.map((p) => p.metric))];
  const statuses = STATUSES.filter((s) => rows.some((p) => p.status === s));
  return (
    <details className="method-group">
      <summary>
        <span className="method-name">{name}</span>
        {what && <span className="method-what">{what.text}</span>}
        <span className="method-count muted">
          {analyses(rows.length)} · {modelWords(modelsIn(rows))}
        </span>
        {statuses.includes("to_check") && <span className="badge badge-check">Not yet confirmed from its source</span>}
        {rows.some((p) => p.added) && <span className="badge badge-new">new</span>}
      </summary>
      <div className="method-body">
        <div>
          {what && <Sources src={what.src} label={`${SOURCES_LABEL}, for the line above`} />}
          {KINDS.map((kind) => {
            const lines = (card?.teach ?? []).filter((t) => t.kind === kind && t !== what);
            if (lines.length === 0) return null;
            return (
              <div key={kind} className="method-teach">
                <h3>{KIND_WORDS[kind]}</h3>
                {lines.map((t) => (
                  <div key={t.text}>
                    <p>{t.text}</p>
                    <Sources src={t.src} label={SOURCES_LABEL} />
                  </div>
                ))}
              </div>
            );
          })}
          {card && card.teach.length === 0 && <p className="muted">This card has no teaching text yet.</p>}
        </div>
        <div>
          <h3>Effect measures</h3>
          <ul className="method-metrics">
            {metrics.map((m) => {
              const mc = cardFor("metric", m);
              const label = nodeLabel(map, "metric", m);
              return (
                <li key={m}>
                  {mc ? <Link to={cardHref(mc.id)}>{label}</Link> : label}{" "}
                  <span className="muted">· {modelWords(modelsIn(rows.filter((p) => p.metric === m)))}</span>
                </li>
              );
            })}
          </ul>
          <h3>Status</h3>
          <ul className="method-status">
            {statuses.map((s) => (
              <li key={s}>
                <span className={`swatch st-${s}`} aria-hidden="true" /> {STATUS_TEXT[s].name}
                {statuses.length > 1 && ` (${String(rows.filter((p) => p.status === s).length)})`}:{" "}
                {STATUS_TEXT[s].meaning}.
              </li>
            ))}
          </ul>
          {card && (
            <Link to={cardHref(card.id)}>
              Read the full card on {name} <span className="muted">(opens Cards)</span>
            </Link>
          )}
        </div>
      </div>
    </details>
  );
}

interface ResultsProps {
  found: readonly Pathway[];
  shown: readonly Pathway[];
  model: string | undefined;
  /** The answers to the advisory questions, where they were asked and answered. */
  rare: Advice | undefined;
  vary: Advice | undefined;
  onShowModel: (model: string | undefined) => void;
  heading: RefObject<HTMLHeadingElement | null>;
}

export function Results({ found, shown, model, rare, vary, onShowModel, heading }: ResultsProps) {
  const methods = [...new Set(shown.map((p) => p.method))];
  const statuses = STATUSES.filter((s) => shown.some((p) => p.status === s));
  return (
    <section aria-labelledby="pf-results" className="results">
      <h1 id="pf-results" ref={heading} tabIndex={-1}>
        {shown.length === 1 ? "1 analysis fits" : `${String(shown.length)} analyses fit`} your answers
      </h1>
      <p className="muted">
        {statuses.map((s) => `${String(shown.filter((p) => p.status === s).length)} ${STATUS_TEXT[s].name.toLowerCase()}`).join(", ")}
        {shown.some((p) => p.status === "runnable") ? "." : ". None of them can be run yet."}
      </p>

      {(rare === "yes" || rare === "unsure") && <RareAdvice found={found} rare={rare} />}
      {vary && <ModelFilter found={found} model={model} vary={vary} onShow={onShowModel} />}

      <section aria-labelledby="pf-methods" className="methods">
        <h2 id="pf-methods">
          By method <span className="muted">· open one to see what it is and its sources</span>
        </h2>
        {methods.map((m) => (
          <MethodGroup key={m} method={m} rows={shown.filter((p) => p.method === m)} />
        ))}
      </section>
    </section>
  );
}

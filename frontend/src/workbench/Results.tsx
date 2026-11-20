// Step 3 of the Workbench (#178), as in the approved mock-up (#150, "Workbench-results"): the answer first, then how
// much the studies differ, the forest and funnel plots (drawn here with D3's scales from the numbers /run returns),
// the studies left out and the R code. Every text from the server, and every label a person typed, is rendered as
// text, never as HTML (#172).
import { scaleLinear, scaleLog } from "d3-scale";
import { useState, type ReactNode, type RefObject } from "react";
import { Link } from "react-router";
import { cardHref } from "../cards/cards";
import { Sources } from "../SourceList";
import type { Labels, RunResponse } from "../types/api";
import { RANDOM } from "./pathway";
import {
  forestDomain,
  forestRows,
  isRatio,
  levelText,
  measureName,
  noEffect,
  num,
  placesFor,
  pooled,
  pText,
  ratioTicks,
  sourceText,
  varianceText,
  type ForestRow,
  type Pooled,
} from "./numbers";

export interface RunResult {
  response: RunResponse;
  /** The studies as sent, for the forest plot's event counts. */
  studies: Record<string, unknown>[];
  /** The words sent for the sentence, if any. */
  labels: Labels | null;
}

const METHOD_SOURCE: Record<string, string> = { IV: "MF-uni", MH: "MF-mh", PETO: "MF-peto" };

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function Results({ result, heading }: { result: RunResult; heading: RefObject<HTMLHeadingElement | null> }) {
  const res = result.response;
  const metric = res.pathway.metric;
  const random = res.pathway.model === RANDOM;
  const name = measureName(metric);
  const places = placesFor(metric);
  const level = levelText(res.options.level ?? 95);
  const p = pooled(res);
  const s = res.summary;
  const used = res.studies.filter((x) => x.used).length;
  const stat = res.options.interval === "knha" ? "t" : "z";

  return (
    <>
      <section aria-labelledby="wb-answer" className="panel wb-answer">
        <h2 id="wb-answer" ref={heading} tabIndex={-1} className="wb-kicker">
          Pooled {name}
        </h2>
        {p.estimate !== null && (
          <p className="wb-answer-value">
            {num(p.estimate, places)}{" "}
            {p.lower !== null && p.upper !== null && (
              <span className="wb-answer-ci">
                {level} CI {num(p.lower, places)} to {num(p.upper, places)}
              </span>
            )}
          </p>
        )}
        {res.interpretation && (
          <>
            <p className="wb-sentence">{res.interpretation.text}</p>
            <Sources src={sourceText(res.interpretation.sources)} />
          </>
        )}
        <p className="muted wb-detail">
          {isRatio(metric) && s["estimate"] != null && "On the log scale: "}
          {s["estimate"] != null && num(s["estimate"], 3)}
          {s["se"] != null && ` (SE ${num(s["se"], 3)})`}
          {s["zval"] != null && `, ${stat} = ${num(s["zval"], 2)}`}
          {s["pval"] != null && `, ${pText(s["pval"])}`}
          {" · "}
          {used} {used === 1 ? "study" : "studies"} used,{" "}
          {res.left_out.length === 0 ? "none left out" : `${String(res.left_out.length)} left out (listed below)`}.
        </p>
      </section>

      <Heterogeneity res={res} random={random} pooledValues={p} />

      <section aria-labelledby="wb-forest" className="panel">
        <h2 id="wb-forest">Forest plot</h2>
        <p className="muted">
          Each study&apos;s {name} with its {level} confidence interval; the square&apos;s size shows its weight.
          {isRatio(metric) && " Log scale."}
          {random && p.piLower !== null && " The grey line under the diamond is the prediction interval."}
        </p>
        <Forest result={result} pooledValues={p} />
      </section>

      {res.funnel && (
        <section aria-labelledby="wb-funnel" className="panel">
          <h2 id="wb-funnel">Funnel plot</h2>
          <p className="wb-caption">{res.funnel.caption}</p>
          <Sources src={sourceText(res.funnel.sources)} />
          <Funnel funnel={res.funnel} metric={metric} />
        </section>
      )}

      {res.left_out.length > 0 && <LeftOut result={result} />}

      <RCode code={res.r_code} />
    </>
  );
}

function Tile({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div className="wb-tile">
      <div className="wb-tile-label">{label}</div>
      <div className="wb-tile-value">{value}</div>
      <div className="wb-tile-text">{children}</div>
    </div>
  );
}

function Heterogeneity({ res, random, pooledValues: p }: { res: RunResponse; random: boolean; pooledValues: Pooled }) {
  const s = res.summary;
  const metric = res.pathway.metric;
  const name = measureName(metric);
  const places = placesFor(metric);
  // metafor's own count: rma.mh and rma.peto keep double-zero studies in k but not in Q (#180 audit)
  const qDf = s["q_df"];
  const df = qDf != null ? `${String(qDf)} df` : "";
  const qValue = s["q"] ?? null;
  const q = qValue !== null ? `Q = ${num(qValue, 1)} on ${df}` : null;
  const i2 = s["i2"];
  const tau2 = s["tau2"];
  const none = noEffect(metric);
  const pi = random && p.piLower !== null && p.piUpper !== null ? { lower: p.piLower, upper: p.piUpper } : null;
  const hasPi = pi !== null;
  const piIncludes = pi !== null && pi.lower <= none && none <= pi.upper;
  const scale = isRatio(metric) ? "the log scale" : `the ${name} scale`;
  const src = [
    `CH-10 s10.10.2${random ? ", s10.10.4" : ""}${hasPi ? ", s10.10.4.3" : ""}`,
    METHOD_SOURCE[res.pathway.method] ?? "",
  ]
    .filter((x) => x !== "")
    .join(", ");

  return (
    <section aria-labelledby="wb-het" className="panel">
      <h2 id="wb-het">How much the studies differ</h2>
      <div className="wb-tiles">
        {pi !== null && (
          <Tile
            label={`Prediction interval (${levelText(res.options.level ?? 95)})`}
            value={`${num(pi.lower, places)} to ${num(pi.upper, places)}`}
          >
            Where the true {name} of a new study like these is expected to fall. It {piIncludes ? "includes" : "does not include"}{" "}
            {String(none)}, no difference. <Link to={cardHref("term:prediction-interval")}>Prediction intervals in Cards</Link>
          </Tile>
        )}
        {i2 != null && (
          <Tile label="I²" value={`${num(i2, 0)}%`}>
            Of the variation between the studies&apos; estimates, the share that is beyond chance. Rough guides to its
            size can mislead, and it is uncertain when studies are few.{" "}
            <Link to={cardHref("term:heterogeneity")}>Heterogeneity in Cards</Link>
          </Tile>
        )}
        {random && tau2 != null && (
          <Tile label="τ² (between-study variance)" value={varianceText(tau2)}>
            How widely the true effects spread, on {scale}, estimated by {res.options.estimator ?? "REML"}.
            {q !== null && ` ${q}.`}{" "}
            <Link to={cardHref("term:between-study-variance-tau-squared")}>τ² in Cards</Link>
          </Tile>
        )}
        {!random && qValue !== null && (
          <Tile label="Cochran's Q" value={`${num(qValue, 1)} on ${df}`}>
            {s["q_pval"] != null && `${capital(pText(s["q_pval"]))}. `}A test of whether the studies differ more than
            chance would explain. With few or small studies it has little power, so a large p is not evidence that
            they agree.
          </Tile>
        )}
      </div>
      <Sources src={src} />
    </section>
  );
}

// ---- forest plot ---------------------------------------------------------------------------------------------------

const F = { width: 760, row: 26, top: 30, name: 0, events: 176, plotLeft: 350, plotRight: 572, estimate: 700, weight: 756 };

function eventsOf(study: Record<string, unknown> | undefined): string {
  if (!study) return "";
  const cell = (key: string) => (typeof study[key] === "number" || typeof study[key] === "string" ? String(study[key]) : "?");
  return `${cell("ai")}/${cell("n1i")} · ${cell("ci")}/${cell("n2i")}`;
}

const short = (text: string, max = 24) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function Forest({ result, pooledValues: p }: { result: RunResult; pooledValues: Pooled }) {
  const res = result.response;
  const metric = res.pathway.metric;
  const ratio = isRatio(metric);
  const places = placesFor(metric);
  const rows = forestRows(res);
  const domain = forestDomain(metric, rows, p);
  const range: [number, number] = [F.plotLeft, F.plotRight];
  const x = ratio ? scaleLog().domain(domain).range(range) : scaleLinear().domain(domain).range(range).nice();
  const [lo, hi] = x.domain() as [number, number];
  const ticks = ratio ? ratioTicks([lo, hi]) : x.ticks(5);
  const tickText = ratio ? (t: number) => String(t) : x.tickFormat(5);
  const at = (v: number) => x(Math.min(Math.max(v, lo), hi));
  const maxWeight = Math.max(...rows.map((r) => r.weight), 1);
  const byStudy = new Map(result.studies.map((st) => [String(st["study"]), st]));
  const random = res.pathway.model === RANDOM;
  const poolY = F.top + rows.length * F.row + 10;
  const axisY = poolY + F.row;
  const height = axisY + 52;
  const treatment = short(result.labels?.treatment ?? "treatment", 16);
  const event = short(result.labels?.outcome ?? "event", 14);
  const range95 = (r: { lower: number; upper: number }) => `${num(r.lower, places)}, ${num(r.upper, places)}`;
  const total = rows.reduce((sum, r) => sum + r.weight, 0);

  const summaryText =
    p.estimate !== null && p.lower !== null && p.upper !== null
      ? `the pooled ${measureName(metric)} is ${num(p.estimate, places)}, ${levelText(res.options.level ?? 95)} CI ${num(p.lower, places)} to ${num(p.upper, places)}`
      : "the pooled value could not be estimated";

  return (
    <>
      <div className="table-wrap">
        <svg
          className="plot forest"
          role="img"
          aria-label={`Forest plot of ${String(rows.length)} studies; ${summaryText}. The table after the plot gives every value.`}
          width={F.width}
          height={height}
          viewBox={`0 0 ${String(F.width)} ${String(height)}`}
        >
          <g className="plot-head">
            <text x={F.name} y={16}>Study</text>
            <text x={F.events} y={16}>Events / people (T · C)</text>
            <text x={F.estimate} y={16} textAnchor="end">{metric === "PETO" ? "Peto OR" : metric} ({levelText(res.options.level ?? 95)} CI)</text>
            <text x={F.weight} y={16} textAnchor="end">Weight</text>
          </g>
          <line className="plot-rule" x1={0} x2={F.width} y1={F.top - 6} y2={F.top - 6} />
          <line className="plot-null" x1={x(noEffect(metric))} x2={x(noEffect(metric))} y1={F.top - 6} y2={axisY} />
          {rows.map((r, i) => {
            const y = F.top + i * F.row + F.row / 2;
            const side = 5 + 9 * Math.sqrt(r.weight / maxWeight);
            return (
              <g key={r.study}>
                <title>{`${r.study}: ${num(r.estimate, places)} (${range95(r)}), weight ${r.weight.toFixed(1)}%`}</title>
                <text x={F.name} y={y + 4}>{short(r.study)}</text>
                <text x={F.events} y={y + 4} className="plot-muted">{eventsOf(byStudy.get(r.study))}</text>
                <Whisker x1={at(r.lower)} x2={at(r.upper)} y={y} left={r.lower < lo} right={r.upper > hi} />
                <rect className="plot-box" x={at(r.estimate) - side / 2} y={y - side / 2} width={side} height={side} />
                <text x={F.estimate} y={y + 4} textAnchor="end">{`${num(r.estimate, places)} (${range95(r)})`}</text>
                <text x={F.weight} y={y + 4} textAnchor="end">{`${r.weight.toFixed(1)}%`}</text>
              </g>
            );
          })}
          <line className="plot-rule" x1={0} x2={F.width} y1={poolY - 8} y2={poolY - 8} />
          <g className="plot-pooled">
            <text x={F.name} y={poolY + 9}>{random ? "Random effects" : "Common effect"}</text>
            {random && p.piLower !== null && p.piUpper !== null && (
              <line className="plot-pi" x1={at(p.piLower)} x2={at(p.piUpper)} y1={poolY + 5} y2={poolY + 5} />
            )}
            {p.estimate !== null && p.lower !== null && p.upper !== null && (
              <>
                <polygon
                  className="plot-diamond"
                  points={`${String(at(p.lower))},${String(poolY + 5)} ${String(at(p.estimate))},${String(poolY - 2)} ${String(at(p.upper))},${String(poolY + 5)} ${String(at(p.estimate))},${String(poolY + 12)}`}
                />
                <text x={F.estimate} y={poolY + 9} textAnchor="end">{`${num(p.estimate, places)} (${num(p.lower, places)}, ${num(p.upper, places)})`}</text>
              </>
            )}
            <text x={F.weight} y={poolY + 9} textAnchor="end">{`${total.toFixed(0)}%`}</text>
          </g>
          <g className="plot-axis">
            <line x1={F.plotLeft} x2={F.plotRight} y1={axisY} y2={axisY} />
            {ticks.map((t) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={axisY} y2={axisY + 5} />
                <text x={x(t)} y={axisY + 18} textAnchor="middle">{tickText(t)}</text>
              </g>
            ))}
            <text x={x(noEffect(metric)) - 8} y={axisY + 38} textAnchor="end" className="plot-muted">{`← ${event} less common in ${treatment}`}</text>
            <text x={x(noEffect(metric)) + 8} y={axisY + 38} className="plot-muted">{`more common in ${treatment} →`}</text>
          </g>
        </svg>
      </div>
      <ForestTable rows={rows} result={result} pooledValues={p} />
    </>
  );
}

function Whisker({ x1, x2, y, left, right }: { x1: number; x2: number; y: number; left: boolean; right: boolean }) {
  return (
    <g className="plot-whisker">
      <line x1={x1} x2={x2} y1={y} y2={y} />
      {left && <path d={`M${String(x1 + 6)},${String(y - 4)} L${String(x1)},${String(y)} L${String(x1 + 6)},${String(y + 4)}`} />}
      {right && <path d={`M${String(x2 - 6)},${String(y - 4)} L${String(x2)},${String(y)} L${String(x2 - 6)},${String(y + 4)}`} />}
    </g>
  );
}

function ForestTable({ rows, result, pooledValues: p }: { rows: ForestRow[]; result: RunResult; pooledValues: Pooled }) {
  const res = result.response;
  const metric = res.pathway.metric;
  const places = placesFor(metric);
  const level = levelText(res.options.level ?? 95);
  return (
    <details className="about">
      <summary>The forest plot&apos;s values as a table</summary>
      <div className="table-wrap">
        <table className="wb-table">
          <thead>
            <tr>
              <th scope="col">Study</th>
              <th scope="col" className="num">{capital(measureName(metric))}</th>
              <th scope="col" className="num">{level} CI</th>
              <th scope="col" className="num">Weight</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.study}>
                <td>{r.study}</td>
                <td className="num">{num(r.estimate, places)}</td>
                <td className="num">{`${num(r.lower, places)} to ${num(r.upper, places)}`}</td>
                <td className="num">{`${r.weight.toFixed(1)}%`}</td>
              </tr>
            ))}
            {p.estimate !== null && p.lower !== null && p.upper !== null && (
              <tr>
                <th scope="row">{res.pathway.model}</th>
                <td className="num">{num(p.estimate, places)}</td>
                <td className="num">{`${num(p.lower, places)} to ${num(p.upper, places)}`}</td>
                <td className="num">100%</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ---- funnel plot ---------------------------------------------------------------------------------------------------

const U = { width: 480, height: 320, left: 56, right: 16, top: 12, bottom: 48 };

function Funnel({ funnel, metric }: { funnel: NonNullable<RunResponse["funnel"]>; metric: string }) {
  const z = funnel.z ?? 1.959963984540054;
  const maxSe = Math.max(...funnel.points.map((pt) => pt.sei), 0.01) * 1.05;
  const xs = [...funnel.points.map((pt) => pt.yi), funnel.centre - z * maxSe, funnel.centre + z * maxSe];
  const x = scaleLinear()
    .domain([Math.min(...xs), Math.max(...xs)])
    .range([U.left, U.width - U.right])
    .nice();
  const y = scaleLinear().domain([0, maxSe]).range([U.top, U.height - U.bottom]);
  const xLabel = funnel.log_scale ? `log ${measureName(metric)}` : measureName(metric);
  const tickText = x.tickFormat(5);
  const yText = y.tickFormat(4);
  const region = `${String(x(funnel.centre - z * maxSe))},${String(y(maxSe))} ${String(x(funnel.centre))},${String(y(0))} ${String(x(funnel.centre + z * maxSe))},${String(y(maxSe))}`;
  return (
    <div className="table-wrap">
      <svg
        className="plot funnel"
        role="img"
        aria-label={`Funnel plot of ${String(funnel.points.length)} studies around the common-effect estimate of ${num(funnel.centre, 3)} (${xLabel}).`}
        width={U.width}
        height={U.height}
        viewBox={`0 0 ${String(U.width)} ${String(U.height)}`}
      >
        <polygon className="plot-region" points={region} />
        <line className="plot-centre" x1={x(funnel.centre)} x2={x(funnel.centre)} y1={y(0)} y2={y(maxSe)} />
        {funnel.points.map((pt) => (
          <circle key={pt.study} className="plot-point" cx={x(pt.yi)} cy={y(pt.sei)} r={5}>
            <title>{`${pt.study}: ${num(pt.yi, 3)}, SE ${num(pt.sei, 3)}`}</title>
          </circle>
        ))}
        <g className="plot-axis">
          <line x1={U.left} x2={U.width - U.right} y1={U.height - U.bottom} y2={U.height - U.bottom} />
          {x.ticks(5).map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={U.height - U.bottom} y2={U.height - U.bottom + 5} />
              <text x={x(t)} y={U.height - U.bottom + 18} textAnchor="middle">{tickText(t)}</text>
            </g>
          ))}
          <text x={(U.left + U.width - U.right) / 2} y={U.height - 8} textAnchor="middle" className="plot-muted">{xLabel}</text>
          <line x1={U.left} x2={U.left} y1={U.top} y2={U.height - U.bottom} />
          {y.ticks(4).map((t) => (
            <g key={t}>
              <line x1={U.left - 5} x2={U.left} y1={y(t)} y2={y(t)} />
              <text x={U.left - 8} y={y(t) + 4} textAnchor="end">{yText(t)}</text>
            </g>
          ))}
          <text transform={`translate(14 ${String((U.top + U.height - U.bottom) / 2)}) rotate(-90)`} textAnchor="middle" className="plot-muted">
            Standard error
          </text>
        </g>
      </svg>
    </div>
  );
}

// ---- left out, R code ----------------------------------------------------------------------------------------------

function LeftOut({ result }: { result: RunResult }) {
  const res = result.response;
  const byStudy = new Map(result.studies.map((st) => [String(st["study"]), st]));
  const doubleZero = (study: string) => {
    const row = byStudy.get(study);
    return row !== undefined && Number(row["ai"]) === 0 && Number(row["ci"]) === 0;
  };
  const ratio = isRatio(res.pathway.metric);
  return (
    <section aria-labelledby="wb-left-out" className="panel">
      <h2 id="wb-left-out">Studies left out</h2>
      <p>The model could not use these studies, so they are not in the result or the plots:</p>
      <ul>
        {res.left_out.map((study) => (
          <li key={study}>
            {study}
            {ratio && doubleZero(study) && <span className="muted"> · no events in either group</span>}
          </li>
        ))}
      </ul>
      {ratio && res.left_out.some(doubleZero) && (
        <>
          <p>
            A study with no events in either group says nothing about the direction or size of a ratio, so for odds
            and risk ratios it is usually left out.
          </p>
          <Sources src="CH-10 s10.4.4.2, MF-escalc" />
        </>
      )}
    </section>
  );
}

function RCode({ code }: { code: string }) {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }
  return (
    <section aria-labelledby="wb-code" className="panel">
      <h2 id="wb-code">The R code</h2>
      <p className="muted">
        Run it in R with metafor to get the same numbers. It is written from the analysis that ran; the server never
        runs code you send.
      </p>
      <pre className="wb-code" tabIndex={0} aria-label="The R code">
        <code>{code}</code>
      </pre>
      <div className="wb-actions">
        <button type="button" className="button button-primary" onClick={() => void copy()}>
          Copy the R code
        </button>
        <span role="status" className="muted">
          {copied === "done" ? "Copied." : copied === "failed" ? "Couldn't copy: select the code and copy it." : ""}
        </span>
        <Link to="/workbench/proof">How this analysis is checked (Proof)</Link>
      </div>
    </section>
  );
}

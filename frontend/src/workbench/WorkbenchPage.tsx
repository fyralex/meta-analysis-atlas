// The Workbench (#165, #178), the three steps of the approved mock-up (#150): the analysis chosen in Pathfinder or
// the Atlas, the studies (an uploaded CSV or a published example) and their check, and the results of /run.
// The backend decides what a file needs, whether it passes and what the analysis gives; the page shows what it says.
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from "react";
import { Link, NavLink, Outlet, useSearchParams } from "react-router";
import { api, ApiError } from "../api/client";
import { Sources } from "../SourceList";
import { STATUS_TEXT } from "../status";
import type { DataSpec, ExampleSummary, FieldError, Labels, PathwayRef } from "../types/api";
import type { Pathway } from "../types/map";
import {
  atlasHref,
  findPathway,
  pathwayShort,
  pathwayTitle,
  RANDOM,
  readPathway,
  refOf,
  RUNNABLE,
  TIERS,
  workbenchHref,
} from "./pathway";
import { labelsToSend } from "./numbers";
import { Results, type RunResult } from "./Results";
import { DEFAULTS, ESTIMATORS, INTERVALS, settingsLine, toOptions, validLevel, type Settings } from "./settings";
import { fromError, fromExample, fromImport, marks, type StudyTable } from "./studyTable";

const REPO = "https://github.com/fyralex/meta-analysis-atlas";
const RUN_LOCALLY = `${REPO}#run-the-apps-locally`;

/** The Workbench's frame: its heading and its row of links (decision on #150: Casebook and Proof sit under it). */
export function WorkbenchLayout() {
  return (
    <section className="page workbench">
      <h1>Workbench</h1>
      <nav aria-label="Workbench" className="subnav">
        <NavLink to="/workbench" end>
          Run an analysis
        </NavLink>
        <NavLink to="/workbench/casebook">Casebook: published examples</NavLink>
        <NavLink to="/workbench/proof">Proof: how each analysis is checked</NavLink>
      </nav>
      <Outlet />
    </section>
  );
}

/** Casebook and Proof until their issues are built. */
export function NotYet({ what, issue }: { what: string; issue: number }) {
  return (
    <div className="panel">
      <p>{what}</p>
      <p className="muted">
        Not built yet: <a href={`${REPO}/issues/${String(issue)}`}>issue #{issue}</a>.
      </p>
    </div>
  );
}

/** Run an analysis: which pathway the address names decides what the page offers. */
export function RunPage() {
  const [params] = useSearchParams();
  const ref = readPathway(params);
  const found = ref ? findPathway(ref) : undefined;
  return (
    <>
      <p className="lead">
        Run a meta-analysis on your own studies or on a published example. You get the estimate, how much the studies
        differ, the plots, and the R code that gives the same numbers.
      </p>
      {!ref && <ChooseAnalysis />}
      {ref && !found && <ChooseAnalysis problem="The map has no analysis with the choices in this address." />}
      {found && found.status !== "runnable" && <NotRunnable pathway={found} />}
      {/* a new pathway starts a new analysis: its spec, data and settings are its own */}
      {found?.status === "runnable" && <Analysis key={TIERS.map((t) => found[t]).join("|")} pathway={refOf(found)} />}
    </>
  );
}

function RunnableList() {
  return (
    <ul className="runnable-list">
      {RUNNABLE.map((p) => (
        <li key={workbenchHref(p)}>
          <Link to={workbenchHref(p)}>{pathwayTitle(p)}</Link>
        </li>
      ))}
    </ul>
  );
}

function ChooseAnalysis({ problem }: { problem?: string }) {
  return (
    <section aria-labelledby="wb-choose" className="panel">
      <h2 id="wb-choose">Choose an analysis</h2>
      {problem && <p>{problem}</p>}
      <p>
        <Link to="/pathfinder">Answer Pathfinder&apos;s questions</Link> to find the analysis that fits your review, or
        choose one of the {RUNNABLE.length} that can be run now.
      </p>
      <RunnableList />
    </section>
  );
}

function NotRunnable({ pathway }: { pathway: Pathway }) {
  const status = STATUS_TEXT[pathway.status];
  return (
    <section aria-labelledby="wb-not" className="panel">
      <h2 id="wb-not">This analysis can&apos;t be run here yet</h2>
      <p className="wb-title">{pathwayTitle(pathway)}</p>
      <p>
        Its status is <strong>{status.name}</strong>: {status.meaning}.
        {pathway.milestone !== "" && ` It is on the roadmap for ${pathway.milestone}.`} Only runnable analyses can be
        run, because each has a validation test that its results match a published example or the R package itself.
      </p>
      <p>
        <Link to={atlasHref(pathway)}>See it in the Atlas</Link>, or choose one of the {RUNNABLE.length} analyses that
        can be run now:
      </p>
      <RunnableList />
    </section>
  );
}

type Server = { state: "checking" } | { state: "up"; r: boolean } | { state: "down" };

function NeedsServer() {
  return (
    <section aria-labelledby="wb-server" className="panel">
      <h2 id="wb-server">The Workbench needs its server</h2>
      <p>
        Running an analysis needs the Atlas&apos;s backend and its R service, and this site can&apos;t reach them. The
        map, Pathfinder and Cards work without them.
      </p>
      <p>
        <a href={RUN_LOCALLY}>Run the Workbench on your own computer</a> <span className="muted">(opens GitHub)</span>.
      </p>
    </section>
  );
}

function Analysis(props: { pathway: PathwayRef }) {
  // the parent keys this component by its pathway, so the first one is the only one it sees
  const [pathway] = useState(props.pathway);
  const random = pathway.model === RANDOM;
  const [server, setServer] = useState<Server>({ state: "checking" });
  const [spec, setSpec] = useState<DataSpec | null>(null);
  const [example, setExample] = useState<ExampleSummary | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [table, setTableOnly] = useState<StudyTable | null>(null);
  const [busy, setBusy] = useState(false);
  const [settings, setSettingsOnly] = useState<Settings>(DEFAULTS);
  const [labels, setLabelsOnly] = useState<Labels>({});
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runProblem, setRunProblem] = useState<{ message: string; fields: FieldError[] } | null>(null);
  const step2 = useRef<HTMLHeadingElement>(null);
  const step3 = useRef<HTMLHeadingElement>(null);

  // a result belongs to the studies, settings and words it ran with: changing any of them clears it
  function setTable(next: StudyTable | null) {
    setTableOnly(next);
    setResult(null);
    setRunProblem(null);
  }
  function setSettings(next: Settings) {
    setSettingsOnly(next);
    setResult(null);
  }
  function setLabels(next: Labels) {
    setLabelsOnly(next);
    setResult(null);
  }

  useEffect(() => {
    let live = true;
    // read through a call: the cleanup below changes it while the requests are out
    const gone = () => !live;
    const fits = (e: ExampleSummary) => e.runs_with.some((p) => TIERS.every((t) => p[t] === pathway[t]));
    api
      .health()
      .then(
        async (health) => {
          if (gone()) return;
          setServer({ state: "up", r: health.r_service });
          try {
            const [found, listed] = await Promise.all([api.spec(pathway), api.examples()]);
            if (gone()) return;
            setSpec(found);
            setExample(listed.examples.find(fits) ?? null);
          } catch (error) {
            if (!gone()) setFailed(error instanceof ApiError ? error.message : "The server's answer could not be read.");
          }
        },
        () => {
          if (!gone()) setServer({ state: "down" });
        },
      );
    return () => {
      live = false;
    };
  }, [pathway]);

  // a new table moves the reader to step 2
  useEffect(() => {
    if (table) step2.current?.focus();
  }, [table]);

  // and a result moves them to step 3
  useEffect(() => {
    if (result) step3.current?.focus();
  }, [result]);

  const columns = spec?.columns.map((c) => c.name) ?? [];

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // the same file can be chosen again after it is fixed
    input.value = "";
    if (!file) return;
    setBusy(true);
    try {
      setTable(fromImport(await api.importCsv(pathway, file, file.name), file.name, columns));
    } catch (error) {
      if (error instanceof ApiError) setTable(fromError(error, file.name));
      else throw error;
    } finally {
      setBusy(false);
    }
  }

  async function loadExample(id: string) {
    setBusy(true);
    setFailed(null);
    try {
      const found = await api.example(id);
      setTable(fromExample(found, columns));
      // the example's own words for the sentence, which the reader can change
      setLabelsOnly({ ...(found.labels ?? {}) });
    } catch (error) {
      setFailed(error instanceof ApiError ? error.message : "The example could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!table?.studies) return;
    const studiesSent = table.studies;
    const labelsSent = labelsToSend(labels);
    setRunning(true);
    setRunProblem(null);
    try {
      const response = await api.run({
        pathway,
        analysis_type: "standard",
        options: toOptions(settings, random),
        data: studiesSent,
        labels: labelsSent,
      });
      setResult({ response, studies: studiesSent, labels: labelsSent });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      setRunProblem({ message: error.message, fields: error.fields });
    } finally {
      setRunning(false);
    }
  }

  if (server.state === "down") return <NeedsServer />;
  const ready = table !== null && table.problems.length === 0;
  const rUp = server.state === "up" && server.r;

  return (
    <>
      <ol className="stepbar" aria-label="Steps">
        <li className={`stepbar-item ${table ? "done" : "current"}`} aria-current={table ? undefined : "step"}>
          <span className="stepbar-name">1 · Your analysis</span>
          <strong className="stepbar-answer">{pathwayShort(pathway)}</strong>
        </li>
        <li
          className={`stepbar-item ${result ? "done" : table ? "current" : "todo"}`}
          aria-current={table && !result ? "step" : undefined}
        >
          <span className="stepbar-name">2 · Your data</span>
          <span className="stepbar-answer">
            {table ? `${table.source} · ${studies(table.rows.length)}` : "Not added yet"}
          </span>
        </li>
        <li className={`stepbar-item ${result ? "current" : "todo"}`} aria-current={result ? "step" : undefined}>
          <span className="stepbar-name">3 · Results</span>
          <span className="stepbar-answer">{result ? settingsShort(result) : "After the check"}</span>
        </li>
      </ol>

      <section aria-labelledby="wb-analysis" className="panel">
        <h2 id="wb-analysis">The analysis you chose</h2>
        <p className="wb-title">{pathwayTitle(pathway)}</p>
        <p className="muted">
          {pathway.group} · {pathway.outcome.toLowerCase()} outcome · {pathway.datatype.toLowerCase()} ·{" "}
          <Link to={atlasHref(pathway)}>See it in the Atlas</Link> ·{" "}
          <Link to="/pathfinder">Choose another in Pathfinder</Link>
        </p>
        <p className="wb-status">
          <span className="pill pill-runnable">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5L20 7" />
            </svg>
            {STATUS_TEXT.runnable.name}
          </span>
          <span>
            It {STATUS_TEXT.runnable.meaning}. <Link to="/workbench/proof">See the check in Proof</Link>
          </span>
        </p>
        <details className="about">
          <summary>Only runnable analyses can be run here</summary>
          <p>
            {RUNNABLE.length} analyses can be run now. <Link to="/atlas?runnable=only">Open the Atlas with
            &ldquo;runnable only&rdquo; on</Link> to see them on the map, with what is planned next.
          </p>
          <RunnableList />
        </details>
      </section>

      {server.state === "checking" && (
        <p className="muted" role="status">
          Reaching the server…
        </p>
      )}
      {server.state === "up" && !server.r && (
        <p className="note" role="status">
          The R service isn&apos;t reachable just now. You can add and check your studies; running them needs it.
        </p>
      )}
      {failed !== null && (
        <p className="note" role="alert">
          {failed}
        </p>
      )}

      {spec && (
        <section aria-labelledby="wb-data" className="panel">
          <h2 id="wb-data">Add your studies</h2>
          <div className="wb-sources">
            <div className="wb-source">
              <strong>Upload your own file</strong>
              <span className="muted">
                A CSV file with one row per study, laid out as below. It is checked before anything runs, and nothing
                is kept.
              </span>
              <FilePicker label="Choose a CSV file" primary disabled={busy} onChange={upload} />
            </div>
            {example && (
              <div className="wb-source">
                <strong>Try a published example</strong>
                <span className="muted">
                  {example.title}: {example.summary}
                </span>
                <button type="button" className="button" disabled={busy} onClick={() => void loadExample(example.id)}>
                  Load the example
                </button>
                <Link to="/workbench/casebook">More examples in Casebook</Link>
              </div>
            )}
          </div>

          <h3>What the file needs</h3>
          <div className="table-wrap">
            <table className="wb-table">
              <thead>
                <tr>
                  <th scope="col">Column</th>
                  <th scope="col">What it holds</th>
                  <th scope="col">Example</th>
                </tr>
              </thead>
              <tbody>
                {spec.columns.map((c) => (
                  <tr key={c.name}>
                    <td>
                      <code>{c.name}</code>
                    </td>
                    <td>{c.description}</td>
                    <td>{c.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="wb-rules">
            {spec.rules.map((r) => (
              <li key={r}>{withCode(r)}</li>
            ))}
          </ul>
          <p>
            <a href={api.templateUrl(pathway)} download>
              Download a blank template (CSV)
            </a>
          </p>
        </section>
      )}

      {spec && (
        <SettingsFold random={random} settings={settings} onChange={setSettings} />
      )}

      {table && (
        <Check
          table={table}
          spec={spec}
          heading={step2}
          busy={busy}
          onUpload={upload}
          runnable={ready && validLevel(settings.level)}
          rUp={rUp}
          running={running}
          problem={runProblem}
          onRun={() => void run()}
          labels={labels}
          onLabels={setLabels}
        >
          {result && <Results result={result} heading={step3} />}
        </Check>
      )}
    </>
  );
}

/** A rule as the spec writes it, with `name` shown as code. Built from text nodes only, never as HTML. */
function withCode(text: string): ReactNode[] {
  return text.split("`").map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part));
}

/** The settings a result ran with, for the step bar: "REML · Wald · 95%". */
function settingsShort({ response }: RunResult): string {
  const o = response.options;
  const level = `${String(o.level ?? 95)}%`;
  if (response.pathway.model !== RANDOM) return level;
  return `${o.estimator ?? "REML"} · ${o.interval === "knha" ? "Hartung-Knapp-Sidik-Jonkman" : "Wald"} · ${level}`;
}

const studies = (n: number) => `${String(n)} ${n === 1 ? "study" : "studies"}`;

function FilePicker({
  label,
  primary = false,
  disabled,
  onChange,
}: {
  label: string;
  primary?: boolean;
  disabled: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
}) {
  return (
    <label className={`button file-picker${primary ? " button-primary" : ""}${disabled ? " is-disabled" : ""}`}>
      {label}
      <input
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => void onChange(e)}
      />
    </label>
  );
}

function SettingsFold({
  random,
  settings,
  onChange,
}: {
  random: boolean;
  settings: Settings;
  onChange: (s: Settings) => void;
}) {
  const levelOk = validLevel(settings.level);
  return (
    <section aria-labelledby="wb-settings" className="panel">
      <h2 id="wb-settings">Settings</h2>
      <p className="muted">Chosen for you. Change them only if your protocol says otherwise.</p>
      <details className="about">
        <summary>{settingsLine(settings, random)}</summary>
        <div className="wb-settings">
          {random && (
            <label>
              Between-study variance
              <select
                value={settings.estimator}
                onChange={(e) => { onChange({ ...settings, estimator: e.currentTarget.value as Settings["estimator"] }); }}
              >
                {ESTIMATORS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                    {o.value === DEFAULTS.estimator ? ", the default" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {random && (
            <label>
              Confidence interval
              <select
                value={settings.interval}
                onChange={(e) => { onChange({ ...settings, interval: e.currentTarget.value as Settings["interval"] }); }}
              >
                {INTERVALS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                    {o.value === DEFAULTS.interval ? ", the default" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Confidence level (%)
            <input
              type="number"
              step="any"
              value={Number.isNaN(settings.level) ? "" : settings.level}
              aria-invalid={!levelOk}
              aria-describedby={levelOk ? undefined : "wb-level-error"}
              onChange={(e) => { onChange({ ...settings, level: e.currentTarget.valueAsNumber }); }}
            />
          </label>
        </div>
        {!levelOk && (
          <p id="wb-level-error" className="note">
            The level must be a number above 0 and below 100.
          </p>
        )}
        {random && (
          <>
            <p>
              REML and the Wald interval are this release&apos;s defaults (
              <a href={`${REPO}/blob/main/docs/decisions/0019-two-group-binary-defaults.md`}>decision 0019</a>). The
              Cochrane Handbook discusses the choice of estimator and the Hartung-Knapp-Sidik-Jonkman interval, and
              reports that no single estimator is best in every case; metafor documents each option.
            </p>
            <Sources src="CH-10 s10.10.4.4, MF-uni" />
          </>
        )}
        <p>
          Studies the model can&apos;t use, such as studies with no events in either group for a ratio, are left out
          and listed with the result. This can&apos;t be changed here.
        </p>
        <Sources src="CH-10 s10.4.4.2, MF-escalc" />
      </details>
    </section>
  );
}

function Check({
  table,
  spec,
  heading,
  busy,
  onUpload,
  runnable,
  rUp,
  running,
  problem,
  onRun,
  labels,
  onLabels,
  children,
}: {
  table: StudyTable;
  spec: DataSpec | null;
  heading: RefObject<HTMLHeadingElement | null>;
  busy: boolean;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  runnable: boolean;
  rUp: boolean;
  running: boolean;
  problem: { message: string; fields: FieldError[] } | null;
  onRun: () => void;
  labels: Labels;
  onLabels: (labels: Labels) => void;
  children?: ReactNode;
}) {
  const n = table.problems.length;
  const marked = marks(table.problems);
  const fromFile = table.rows.some((r) => r.row !== null);
  const columns = spec?.columns ?? [];
  return (
    <>
      <section aria-labelledby="wb-check" className="panel">
        <h2 id="wb-check" ref={heading} tabIndex={-1}>
          {n === 0
            ? `${studies(table.rows.length)} ready to run`
            : `${n === 1 ? "1 problem" : `${String(n)} problems`} to fix before the analysis can run`}
        </h2>
        <p className="muted">
          {table.rows.length > 0 ? `${studies(table.rows.length)} read from ${table.source}.` : `From ${table.source}.`}
          {table.ignored.length > 0 && ` Columns not used: ${table.ignored.join(", ")}.`}
        </p>
        {n > 0 && (
          <>
            <ul className="problems">
              {table.problems.map((p) => (
                <li key={`${p.path}:${p.message}`}>
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l10 18H2z" />
                    <path d="M12 10v5" />
                    <path d="M12 18h.01" />
                  </svg>
                  <span>{p.message}</span>
                </li>
              ))}
            </ul>
            <p>Fix them in your file and upload it again. Your analysis and settings are kept.</p>
          </>
        )}
        {n === 0 && <LabelsFold labels={labels} onChange={onLabels} />}
        <div className="wb-actions">
          {n > 0 && <FilePicker label="Upload the corrected file" primary disabled={busy} onChange={onUpload} />}
          <button
            type="button"
            className={`button${n === 0 ? " button-primary" : ""}`}
            disabled={n > 0 || !runnable || !rUp || running || busy}
            aria-describedby="wb-run-note"
            onClick={onRun}
          >
            {running ? "Running…" : "Run the analysis"}
          </button>
          <span id="wb-run-note" className="muted" role="status">
            {n > 0
              ? "Fix the problems first."
              : !runnable
                ? "Check the settings first."
                : !rUp
                  ? "Running needs the R service, which isn't reachable just now."
                  : running
                    ? "Running in R with metafor…"
                    : "It runs in R with metafor on the server; nothing is kept."}
          </span>
        </div>
        {problem && (
          <div className="note" role="alert">
            <p>The analysis didn&apos;t run: {problem.message}</p>
            {problem.fields.length > 0 && (
              <ul>
                {problem.fields.map((f) => (
                  <li key={`${f.path}:${f.message}`}>{f.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {children}

      {table.rows.length > 0 && (
        <section aria-labelledby="wb-rows" className="panel">
          <h2 id="wb-rows">The studies as read</h2>
          {n > 0 && <p className="muted">Cells with a problem are outlined and marked &ldquo;Fix&rdquo;.</p>}
          <div className="table-wrap">
            <table className="wb-table wb-studies">
              <thead>
                <tr>
                  <th scope="col">{fromFile ? "Row" : "#"}</th>
                  {columns.map((c) => (
                    <th key={c.name} scope="col" className={c.kind === "count" ? "num" : undefined}>
                      {c.name}
                      <span className="th-label">{c.label}</span>
                    </th>
                  ))}
                  {n > 0 && <th scope="col">Check</th>}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => {
                  const cols = marked.get(i);
                  return (
                    <tr key={String(r.row ?? i)} className={cols ? "row-problem" : undefined}>
                      <td>{r.row ?? i + 1}</td>
                      {columns.map((c) => {
                        const bad = cols !== undefined && (cols.size === 0 || cols.has(c.name));
                        return (
                          <td key={c.name} className={`${c.kind === "count" ? "num" : ""}${bad ? " cell-problem" : ""}`}>
                            {r.cells[c.name] ?? ""}
                          </td>
                        );
                      })}
                      {n > 0 && <td className={cols ? "check-fix" : "check-ok"}>{cols ? "Fix" : "OK"}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

const LABEL_FIELDS: readonly { key: keyof Labels; label: string; hint: string; max: number }[] = [
  { key: "outcome", label: "The event", hint: "e.g. tuberculosis", max: 60 },
  { key: "treatment", label: "Group 1 (the ai and n1i columns)", hint: "e.g. vaccinated", max: 40 },
  { key: "control", label: "Group 2 (the ci and n2i columns)", hint: "e.g. unvaccinated", max: 40 },
];

/** Optional words for the sentence that says what the result means; the backend places them in it as plain text. */
function LabelsFold({ labels, onChange }: { labels: Labels; onChange: (labels: Labels) => void }) {
  return (
    <details className="about">
      <summary>Name the event and the groups (optional)</summary>
      <p className="muted">
        The words are used only in the sentence that says what the result means. Left blank, the sentence names no
        event and calls the groups &ldquo;treatment&rdquo; and &ldquo;control&rdquo;.
      </p>
      <div className="wb-settings">
        {LABEL_FIELDS.map((f) => (
          <label key={f.key}>
            {f.label}
            <input
              type="text"
              maxLength={f.max}
              placeholder={f.hint}
              value={labels[f.key] ?? ""}
              onChange={(e) => { onChange({ ...labels, [f.key]: e.currentTarget.value }); }}
            />
          </label>
        ))}
      </div>
    </details>
  );
}

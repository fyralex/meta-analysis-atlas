# Meta-Analysis Atlas

Meta-Analysis Atlas teaches meta-analysis by letting you do it. At its core is
a **map of analysis pathways**, checked against the Cochrane Handbooks, the
metafor documentation and the other packages each pathway uses. A pathway is
one choice at each of seven tiers, in the order a methodologist asks the
questions:

```
Framework → Group structure → Datatype → Outcome type → Model → Method → Metric
```

The map covers five frameworks: interventional (including network
meta-analysis), diagnostic test accuracy, prognosis, association, and
measurement reliability. The order of the last three tiers is a setting:
Model → Method → Metric is the default, and Metric → Method → Model is the
alternative. Changing it redraws the tree but never changes which pathways
are valid.

Some choices sit across the tree rather than inside it: analysis type,
heterogeneity outputs, small-study effects, unit-of-analysis corrections, and
network outputs (ranking, consistency checks).

The app shows the whole map and **why** each pathway is valid or not, with
references. In later releases, validated pathways can be run on published
worked examples or on the user's own CSV, with the exact R code shown.

The app is stateless: there are no accounts and no database.

This file is committed to a **public** repository. Keep it
free of personal details (names, absolute home-directory paths, machine names)
and of claims about any institution's involvement.

## Working rules (read first)

1. **Every change starts as a GitHub issue and lands through a pull request.**
   Never commit to `main`. Name branches `<type>/<issue number>-<slug>`, with
   type `feat`, `fix`, `chore`, `docs` or `ci`. Keep each PR small enough to
   review in about 15 minutes.
2. **Every PR is audited** by the `auditor` agent (`.claude/agents/auditor.md`)
   for up to three rounds before the owner reviews it, except a small PR (see
   "Audit loop"). A change to the map is always audited.
3. **Only the owner merges.** Agents never merge, approve, force-push,
   rewrite published history, or push to `main`. When a PR is ready, the
   agent tells the owner (see "Ready for review") and waits.
4. **Commits are real work, as it happens.** Never backdate a commit or make
   up a history.
5. **The map is the specification.** `spec/build_map.py` holds it. Any change
   to which pathways exist, or to their status, is its own PR, and the reason
   goes in the PR with a reference. Methodology decisions also get a short
   record in `docs/decisions/`.
6. **Statistical correctness comes first.** A pathway is `runnable` only when
   it has a validation test against a published worked example, or against
   the R package run directly on the same data, with stated tolerances. Never
   loosen a tolerance to make a test pass. Find out why the results differ.
7. **Only claim what works.** The README, the API and the UI never present a
   pathway as runnable unless it is.
8. **Teaching content is held to the same standard as code.** Every note,
   "when to use" line and exclusion reason has at least one reference: a
   Cochrane Handbook chapter and section, the documentation of the R function
   it uses, or a methods paper. Cite the source by section and state its rule
   in our own words; never copy its text. Avoid "mandatory", "gold standard"
   and "always" unless the source says so. Present genuine methodological
   debate as debate.
9. **No secrets in git.** Secrets come from environment variables only and
   `.env` files are git-ignored. Before every commit, check the diff for keys,
   tokens and passwords.
10. **When you're unsure, stop and ask** instead of guessing. This covers
    statistical choices (defaults, estimators, continuity corrections), map
    changes and licensing. Ask when the work reaches the question, not in
    batches: give the options and the source, then record the answer on the
    issue.

### Starting a session

Where the work stands lives on GitHub, so any machine with a clone can
continue:

```bash
git switch main && git pull --ff-only
gh pr list                                   # anything waiting for the owner, or for fixes
gh issue list --milestone <current>          # the open milestone's issues; the lowest number goes first
gh issue view <n> --comments                 # its design and the decisions taken on it
```

- Continue the open PR if there is one. Otherwise take the next open issue
  in the current milestone.
- When the owner decides something in a conversation, add it to the issue as
  a comment straight away. Methodology decisions then get their record in
  `docs/decisions/`.
- Each PR updates the README and the docs it affects.

### Git and GitHub

Remote: `github.com/fyralex/meta-analysis-atlas` (public). Commits are authored with the owner's GitHub noreply address, set in
the repo's git config.

**Tools needed:** `git`, Python 3.11 or later, Node 22 or later, R 4.5 with the
packages in `r_service/renv.lock`, and the GitHub CLI `gh` (logged in with
`gh auth login`). Once per clone:

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pre-commit install
npm ci --prefix frontend
Rscript -e 'install.packages("renv"); renv::restore(lockfile = "r_service/renv.lock", library = .libPaths()[1])'
export ATLAS_PRIVATE_SCAN=<path to the owner's private scan script>   # e.g. in your shell profile
```

The private name scan lives outside the repository, because its pattern lists
the names that must never appear here.

**First commit (once only).** `main` gets a single commit, "Initial
release", pushed directly while the repository is still empty. Every later
change goes through a PR.

**Every change after that:**

```bash
gh issue create --title "<what and why>" --body-file -      # 1. the issue
git switch main && git pull --ff-only
git switch -c feat/<issue>-<slug>                            # 2. the branch
# ...work, with small commits...
python3 spec/build_map.py                                    # 3. regenerate, then run the local checks
scripts/check.sh                                             #    (see "Checks"); all must pass
git push -u origin feat/<issue>-<slug>                       # 4. push the branch
gh pr create --fill --body-file -                            # 5. the PR: "Closes #<issue>", what, why,
                                                             #    and the local checks that ran, with results
# 6. run the auditor, unless the PR is small (see "Audit loop"); fix and push to the same branch
# 7. tell the owner the PR is ready (see "Ready for review") and stop
# 8. the owner merges; GitHub deletes the branch, and the agent pulls main
#    and deletes its local copy
```

- Never push to `main` after the first commit, never force-push, never
  rewrite published history.
- After PR 1, the owner sets a ruleset on `main`: pull request required, no
  force-push, no deletion. CI checks are not required on pull requests,
  because CI runs only at releases (see "Checks").
- Pull requests are merged by the owner with "Squash and merge" unless a PR
  says otherwise.

### Ready for review

A PR is ready when the local checks pass, the auditor has approved it (or it
has the `needs-owner` label, or it is a small PR), and its description is
complete. The agent then
adds the `ready-for-review` label and tells the owner, with:
- the PR link;
- what changed and why, in two or three lines;
- the local checks that ran and their results;
- for map changes, the pathway counts by status and what moved;
- anything left out, and why;
- what the owner should look at most carefully.

The agent then stops work on that PR until the owner replies. If the owner
asks for changes, the agent pushes them to the same branch and reports again.

### Audit loop

The builder runs the `auditor` agent on the PR. If the `auditor` agent type
isn't available in the session, a general-purpose agent is told to read and
follow `.claude/agents/auditor.md`; it is then read-only by instruction. It
posts its comment with a single plain `gh pr comment`; if posting is denied,
the builder gives the comment's text to the owner rather than posting it.
The auditor works in a fresh
context with read-only tools and checks the PR against the `audit-pr` skill's
checklist. That covers:
- statistical correctness (right formula, right defaults, justified
  tolerances);
- whether the map still matches the code;
- whether every reference actually supports the text it's attached to;
- tests and typing.

The auditor posts one comment per round, starting `Audit round N: APPROVE` or
`Audit round N: CHANGES_REQUESTED`, with numbered findings, each marked
blocking or non-blocking.

- For each blocking finding, the builder fixes it or disputes it with a
  reason.
- Another round runs only to check a blocking finding's fix or dispute.
  A fix to a non-blocking finding is noted on the PR, with no new round.
- There are at most 3 rounds. On approval the PR gets the `audit:approved`
  label. If round 3 ends without approval, or a dispute is still open, the PR
  gets the `needs-owner` label and the owner decides.
- A round takes about 15 minutes. The auditor reruns the checks once, and its
  comment ends with what it did not check.

**Small PRs need no auditor:** a PR that changes only docs or tests, or fewer
than about 50 lines of code, and nothing in `spec/`. Its local checks are its
review, and its description says "Small PR: no audit (CLAUDE.md, Audit loop)".

The routine for each step is in the `feature-workflow` and `audit-pr` skills,
and the history is in GitHub's issues and PRs. Keep this file to the rules,
and link to those rather than repeating them.

## The map (`spec/`)

`spec/build_map.py` is the only source of truth. The apps, the generated docs,
and later the API and the advisor all read what it generates. Edit the data
there and run it; never edit the generated files.

| File | Content |
|---|---|
| `spec/build_map.py` | Sources, metrics, methods, branches, rules, cross-cutting sections, open items; and the generator |
| `spec/map.json` | Everything above plus every generated pathway (read by the apps) |
| `spec/backbone.md` | The building blocks and rules as tables |
| `spec/tree.md` | The full tree as text |
| `spec/map.html` | A searchable page of the tree (standalone) |
| `spec/pathways.lock.json` | Every generated pathway, pinned; rewritten only with `--lock` |
| `spec/why_not.json` | For each pair of choices that never meet in a pathway, the reasons why, from the same checks that generate the pathways |
| `spec/cards.json` | A card for every node and rule, and one for every glossary term: what the map holds about it, its teaching text and the terms it uses, with its sources (read by the Cards page and the Atlas) |

**What each entry carries:**
- a `src` (one or more source keys from `SOURCES`, each with a URL);
- `verified`: `False` until confirmed from a primary source read online;
- `added`: `True` when the entry is not in taxonomy v11 (the reviewed
  draft this map started from). Added entries stay visible with a "new"
  badge until the methodologist accepts or rejects them, one GitHub issue
  per family. An accepted entry goes in the `ACCEPTED_*` tables with its
  issue and keeps `added`; the generator writes `new` (added and not yet
  accepted), which the apps use for the badge;
- every metric carries its exact call, for example Hedges' g is
  `escalc(measure="SMD")` and Cohen's d is `escalc(measure="SMD",
  correct=FALSE)`;
- every method carries its function, the models it fits, the data it reads,
  and the analysis types its package supports directly.

**Pathways are generated from the rules, not listed by hand.** A test checks
the generated set against `spec/pathways.lock.json`, so any change to the set
shows up as a diff in the PR, and the PR explains each difference.

**Pathway status:**

| Status | Meaning |
|---|---|
| `runnable` | Has a passing validation test. From v0.2: the 12 interventional, two-group, arm-level, binary pathways with inverse variance, Mantel-Haenszel and Peto (`RUNNABLE` in `spec/build_map.py`) |
| `planned` | Confirmed, and its engine is on the roadmap |
| `specified` | Confirmed, not yet planned |
| `to_check` | Not yet confirmed from a primary source (`verified = False`) |

Corrections to taxonomy v11 already in the map, each with its source in
`spec/backbone.md`: GLMM metrics, estimator and analysis types; the Cohen's d
and Hedges' g mappings; log hazard ratio as a precomputed estimate;
common-effect network meta-analysis allowed; P-score and SUCRA as network
outputs, not metrics; crossover trials use a paired analysis, not the cluster
design effect; cumulative and leave-one-out limited to `rma.uni`, `rma.mh` and
`rma.peto`.

## The apps

Everything is generated from the map. Nothing is written by hand twice.

| App | What it does | Release |
|---|---|---|
| **Atlas** | The map in 3D (react-three-fiber), its main view: one layer per tier, lines joining the nodes that go together. It handles like Google Earth: still until moved; drag to turn and it glides to a stop; scroll to zoom towards the pointer, or pinch to zoom; the arrow keys turn it and + and - zoom. Clicking a node narrows the map to the compatible pathways and shows how many remain; clicking it again undoes it. Colours for status; badges for new and to-check; tier-order toggle; node cards; "Why not?" for greyed-out nodes. Beside the map, a read-only panel follows the clicks: what the node just clicked is, the options still possible at the next step, and the choices made. A 2D view lists the same nodes and counts for screen readers and the keyboard, and is used where 3D can't be drawn | v0.1 |
| **Pathfinder** | A few questions (what kind of question, how many groups, what each study reported, the outcome, whether events are rare, whether true effects are expected to vary) lead to pathways, with the reason for each step and the alternatives. Its side panel shows the answers so far as a path on a small, read-only 3D map (turn and zoom, no clicks). Shares its selection with Atlas | v0.1 |
| **Cards** | A teaching card for every node and rule, with references, plus a glossary. Shown inside Atlas and Pathfinder | v0.1 |
| **Workbench** | Upload a CSV, check it against the pathway's data format, run it, and get estimates, heterogeneity, forest and funnel plots, and the exact R code | v0.2 |
| **Casebook** | Published example datasets, loadable into Workbench in one click; the same datasets are the validation tests | v0.2 |
| **Proof** | Every pathway with its test, the published value, our value, the tolerance and whether the check passes | v0.2 |
| **Map history** | How the map changed between releases, each change linked to its issue and PR | v0.2 |
| **Advisor** | Optional, uses an LLM. See "Methods advisor" | v0.4 |

"Why not?" uses the same rules and wording everywhere, including the
validation errors from `/run` in v0.2.

## Methods advisor

The advisor is a conversation layer over the map. **The map stays the only
authority on what is valid.**

- **Agent:** Pydantic-AI with the Anthropic provider. The model ID comes from
  `ANTHROPIC_MODEL`. Its tools are the app's own logic and nothing else:
  - `explain(partial_pathway)`;
  - `compatible_next(partial_pathway)`;
  - `get_card(node_id)`;
  - `summarise_dataset()`, computed on the server from the parsed studies the
    client sends. It returns the number of studies, the columns present, the
    inferred schema, and counts of zero cells and missing values. The rows
    themselves never go to the LLM.
- **Output is structured:**
  `Advice{ kind: "recommendation" | "clarifying_question" | "out_of_scope",
  options: [Option{ pathway, analysis_type?, estimator?, reasons: [Reason{
  text, card_id }] }] }`. Before streaming, the server checks that:
  - every option is a valid pathway;
  - a pathway that isn't runnable is labelled as such;
  - every reason cites a card that a tool returned in this turn.

  If a check fails, the agent gets one repair attempt, then the answer falls
  back to `out_of_scope`.
- **Behaviour:**
  - When the situation is unclear, it asks a question instead of guessing.
  - It gives options with their trade-offs, not a single verdict.
  - It never runs an analysis itself.
  - For anything outside the map (risk of bias, study design critique), it
    says so and suggests consulting a statistician.
  - User text is untrusted input: it goes into the prompt inside delimiters,
    as data.
- **Optional:** with no `ANTHROPIC_API_KEY` set, the advisor is hidden and
  everything else works unchanged.
- **Usage:** every advisor reply writes a structured JSON log line with its
  token use, cost, latency, the tools it called, and the cards it cited.
  Prompt caching is on.
- **Evaluation:** `evals/advisor_scenarios.yaml` lists the acceptable and
  forbidden pathways and the cards that must be cited for each scenario.
  Metrics: pathway validity (must be 100%), acceptable-option hit rate,
  citation validity, correct clarifying questions and correct out-of-scope
  answers. The owner reviews every batch of scenarios.

## Architecture

**v0.1 (static).** No server. The frontend reads `spec/map.json` at build time
and is deployed to GitHub Pages.

```
spec/build_map.py ──generates──▶ spec/map.json ──build──▶ frontend (React 19 + TypeScript strict)
                                                           Atlas · Pathfinder · Cards
```

**v0.2 (running analyses).** R runs on a server: the stack below, with a
Python API and a Plumber R service. A spike (#91) showed webR could run
metafor; the owner chose the server
([decision 0006](docs/decisions/0006-r-on-the-server.md)).

```
Browser: React 19 + TypeScript (strict), D3 plots, react-three-fiber map
   │  JSON (types generated from the backend's OpenAPI schema)
   ▼
backend: FastAPI, Python 3.11
   - reads the map; validates requests against it; builds an execution plan
   - optional advisor (Pydantic-AI)
   │  JSON plan
   ▼
r_service: Plumber, R 4.5
   - runs plans: metafor first; other engines as their pathways become runnable
   - returns numbers only, plus the R code it ran
```

- **The plan builder** turns a validated request into a plan. The R side runs
  plans and holds no business rules.
- **The frontend never decides validity.** It builds its forms and the map
  from the map data.
- **Plots are drawn in the browser** with D3 from the numbers returned.

## API (v0.2, server option)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/map` | The tiers, nodes with statuses and cards, rules and cross-cutting sections |
| GET | `/api/v1/pathways` | All generated pathways with their status. Filterable by any tier |
| POST | `/api/v1/explain` | Given a partial pathway: whether it's valid, why, and what's compatible next, with references |
| GET | `/api/v1/examples` | Worked examples: dataset, source, published values, tolerance; one folder each in `backend/examples/`, which the validation tests read too |
| GET | `/api/v1/meta-analysis/spec` | The columns a runnable pathway's study table needs, in plain words, and the checks made; one spec in `backend/app/data_spec.py` feeds this, the template, the upload check and `/run` |
| GET | `/api/v1/meta-analysis/template` | A CSV template for a runnable pathway |
| POST | `/api/v1/meta-analysis/import` | Check an uploaded CSV against the pathway's column spec; returns the parsed studies or field-level errors naming each row, study and column |
| POST | `/api/v1/meta-analysis/run` | Run a **runnable** pathway (with analysis type, estimator and options); returns estimates, CIs, heterogeneity, weights, plot data, a fixed interpretation sentence with its sources, and the R code |
| POST | `/api/v1/advisor/chat` | Methods advisor over SSE (only when an API key is set) |
| GET | `/health` | Backend health, whether `r_service` is reachable, and whether the advisor is enabled |

Errors are JSON with a stable `code`, a message, and field paths where they
apply. Asking `/run` for a pathway that isn't runnable returns `409
pathway_not_runnable`, with its status and roadmap milestone. The OpenAPI
schema is the contract: `frontend/src/types/api.ts` is generated from it and
committed, and the checks confirm that it's current.

## Stack and tooling

- **Map (`spec/`):** Python 3.11, standard library only for generation; ruff,
  mypy `--strict`, pytest.
- **Frontend:** React 19, TypeScript strict, Vite, react-three-fiber, D3.
  Tooled with ESLint, `tsc --noEmit`, Vitest with
  `@testing-library/react` 16, and Playwright for browser tests. Deployed to
  GitHub Pages.
- **From v0.2, server option:** FastAPI, Pydantic 2, httpx; R 4.5 with
  Plumber, metafor and jsonlite pinned with renv (lintr, styler, testthat);
  Docker Compose with `frontend` (nginx), `backend` and `r_service`, each with
  a healthcheck. Pydantic-AI with the Anthropic provider for the advisor.

## Testing

- **Map tests:**
  - the generated pathways match `spec/pathways.lock.json`;
  - every entry has a source key that exists in `SOURCES`;
  - every metric has an exact call;
  - the comparison with taxonomy v11 is reproduced: which v11 pathways are
    kept, and each one removed with its reason;
  - from v0.2, every `runnable` pathway has at least one validation test.
- **Frontend tests:** the map's filtering logic (its counts must equal the
  lock file's), the question flow, and card rendering.
- **Browser tests** (Playwright, `frontend/e2e/`, at releases): each app at
  360, 768 and 1280 px in both themes, with no console error and no sideways
  scroll, and the Atlas drawing its 3D map.
- **From v0.2:** unit tests for the plan builder and request validation;
  validation tests (`@pytest.mark.integration`) against published examples
  (metafor's documented datasets, Borenstein et al. 2009, Viechtbauer 2005,
  Cochrane worked examples), with explicit tolerances and the source, table
  or page in each docstring; R tests with testthat.

## Checks

**On every pull request, locally.** Before pushing a branch, run
`scripts/check.sh` (pre-commit runs the quick checks on each commit). The PR
description lists the checks that ran and their results. A PR with a failing
check isn't opened. The script runs:
1. **lint, format, types and tests:** ruff, mypy `--strict`, and the map
   and backend tests (pytest).
2. **map files current:** regenerating `spec/` changes nothing.
3. **npm licence record current:** regenerating `docs/npm-licences.md` from
   `frontend/package-lock.json` changes nothing, and every dependency of the
   app has a GPL-compatible licence. Advisories `npm audit` reports that can't
   be fixed yet are listed, with why, in `docs/npm-audit.md`.
4. **private name scan:** `$ATLAS_PRIVATE_SCAN` prints nothing. The script
   fails if it isn't set.
5. **frontend:** ESLint, `tsc --noEmit`, Vitest, and the production build.
6. **R service:** its testthat tests (validation against metafor) and lintr.
   The script fails if R isn't installed.
7. **validation tests:** it starts the R service on a free port, runs
   `pytest -m integration` (`/run` against metafor run directly and against
   its documented values), and stops the service.

**At releases, in CI (GitHub Actions).** `.github/workflows/ci.yml` runs the
same script in a clean environment only when a milestone is closed, a `v*`
tag is pushed, or it's started by hand (`workflow_dispatch`). It never runs on
pull requests. It then runs the browser tests (Playwright, `frontend/e2e/`):
each app in Chromium at 360, 768 and 1280 px, in both themes, failing on a
console error or a page that scrolls sideways. Run them locally with
`npm --prefix frontend run e2e` before a release, or for a PR that changes
layout. The private scan runs locally only. A release isn't published
until CI passes. From v0.2, CI adds the backend, `r_service` and validation jobs,
and the advisor scenarios run the same way.

`pages.yml` deploys the frontend to GitHub Pages at each release.

## Commands

```bash
python3 spec/build_map.py                     # regenerate the map files
python3 spec/build_map.py --lock              # also rewrite spec/pathways.lock.json after a map change
npm --prefix frontend run dev                 # the apps, at http://localhost:5173
scripts/check.sh                              # every local check for a PR
npm --prefix frontend run e2e                 # the browser tests (Playwright; run at releases)
(cd r_service && Rscript tests/testthat.R)    # the R service's tests (check.sh runs them too)
(cd r_service && Rscript run.R)               # the R service, at http://localhost:8000 (R_SERVICE_PORT)
R_SERVICE_URL=http://localhost:8000 .venv/bin/pytest -m integration   # the validation tests, against that service (check.sh starts its own)
.venv/bin/uvicorn app.main:app --app-dir backend --port 8080   # the backend, at http://localhost:8080
docker compose up --build                     # apps, backend and R service, at http://localhost:8080
.venv/bin/pre-commit run --all-files          # the quick per-commit checks
gh workflow run CI                            # start CI by hand (it also runs at releases)
```

## License

GPL-3.0-or-later (see `LICENSE`). The R side depends on metafor and other GPL
packages. `NOTICE` lists the third-party packages and how to cite them.

## Roadmap

| Milestone | Scope |
|---|---|
| v0.1 | The map with all five frameworks; Atlas (3D and 2D), Pathfinder and Cards; static on GitHub Pages |
| v0.2 | Running analyses: Workbench, Casebook, Proof and Map history; one-group and two-group metafor pathways made runnable through validation tests |
| v0.3 | Network meta-analysis (netmeta, `rma.mv`), bayesmeta and `rma.mv` pairwise |
| v0.4 | Diagnostic accuracy, prognosis, and the methods advisor |
| Later | One-stage IPD, unit-of-analysis corrections, association and reliability engines |

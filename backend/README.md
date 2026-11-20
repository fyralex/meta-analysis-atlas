# Backend

The API for v0.2 (FastAPI, Python 3.11). It reads the generated map in `spec/`
and holds no rules of its own: `spec/build_map.py` decides what is valid.

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | `status`, whether the R service answers (`r_service`), whether the advisor is on (`advisor`) |
| GET | `/api/v1/map` | the tiers, sources, branches, rules, cross-cutting sections, metrics, methods and cards |
| GET | `/api/v1/pathways` | `count` and `pathways`; filter by any tier (`framework`, `group`, `datatype`, `outcome`, `model`, `method`, `metric`, each written as in the map) and by `status` |
| POST | `/api/v1/meta-analysis/run` | Runs a **runnable** pathway on a study table: the summary, the studies, the studies left out and the R code |
| GET | `/api/v1/meta-analysis/spec` | What a runnable pathway's study table must hold: each column in plain words, with an example, and the checks made |
| GET | `/api/v1/meta-analysis/template` | A CSV template for a runnable pathway: the header and one example row |
| POST | `/api/v1/meta-analysis/import` | Checks an uploaded CSV against a runnable pathway's column spec; returns its studies, ready for `/run`, or every problem with its row, study and column |
| GET | `/api/v1/examples` | The published example datasets: each with its source, number of studies, the runnable pathways it fits, and which have published values |
| GET | `/api/v1/examples/{id}` | One example: its studies (ready for `/run`), where they come from, labels for the interpretation sentence, and its published values with where each is printed |
| GET | `/api/v1/examples/{id}/studies.csv` | The example's studies as a CSV file |

Errors are JSON: `{"code": ..., "message": ..., "fields": [{"path": ..., "message": ...}], "details": {...}}`.
A filter value the map doesn't have is `422 unknown_value`; a malformed request is
`422 invalid_request`. The OpenAPI schema is at `/openapi.json`.

## Running an analysis

`POST /api/v1/meta-analysis/run` takes a pathway (the seven tiers, written as in the
map), an `analysis_type` (`standard`, `cumulative` or `leave-one-out`), `options` and
the study table in `data`. For now it covers the 12 interventional, two-group,
arm-level, binary pathways (decision 0019): inverse variance with OR, RR, RD and AS,
Mantel-Haenszel with OR, RR and RD, and Peto.

```json
{
  "pathway": {"framework": "1. Interventional (effect of an intervention)", "group": "Two groups (pairwise)",
    "datatype": "Arm-level summary data", "outcome": "Binary", "model": "Random effects",
    "method": "IV", "metric": "RR"},
  "analysis_type": "standard",
  "options": {"estimator": "REML", "interval": "z", "level": 95},
  "data": [{"study": "1", "ai": 4, "n1i": 123, "ci": 11, "n2i": 139}, {"study": "2", "ai": 6, "n1i": 306, "ci": 29, "n2i": 303}]
}
```

- **Study table:** one row per study, with `study` (a unique label), `ai` and `n1i` (events and
  people in the intervention arm), `ci` and `n2i` (the same in the control arm), metafor's own
  argument names. Counts are whole numbers, `0 <= events <= total`, totals at least 1, and there
  are 2 to 2000 studies. Other columns are ignored. A problem is `422 invalid_data`, with a path
  for each (`data.3.ai`). These rules live in one place, `app/data_spec.py` (#158): `/run`'s check,
  `GET /spec` and `GET /template` all read it. Both GETs take the pathway's seven tiers as query
  parameters and answer `422 unknown_pathway` or `409 pathway_not_runnable` as `/run` does.
- **Options:** `estimator` (REML by default; DL, HE, HS, HSk, SJ, ML, EB, PM and PMM also) and
  `interval` (`z`, the Wald interval, by default, or `knha`, Hartung-Knapp-Sidik-Jonkman) apply to
  random-effects inverse variance only; `level` is a percentage. `GENQ` and `GENQM` aren't offered:
  metafor needs study weights for them. Zero-cell handling can't be changed (decision 0019).
- **Result:** `summary` (estimate, se, interval, z, p, tau2, I2, H2, Q, k, and the prediction
  interval for inverse variance), `ratio_scale` (for OR, RR and Peto: the estimate and intervals
  back-transformed from the log scale), `studies` (estimate, variance and weight of each),
  `left_out` (studies the model didn't use, such as studies with no events in either arm for a
  ratio), `steps` (cumulative or leave-one-out rows, on the log scale for ratios) and `r_code`.
- **Interpretation** (`interpretation`, #160): one fixed sentence saying what the pooled result
  means, with its `sources` (Cochrane Handbook sections, metafor's `escalc` page). For example:
  "On average across the 13 studies, the risk of tuberculosis in the vaccinated groups was 0.49
  times the risk in the unvaccinated groups (95% CI 0.34 to 0.70). This is the average of effects
  that may differ between studies, not one shared effect." The optional `labels` (`outcome`,
  `treatment`, `control`; plain text, one line, 60/40/40 characters at most) fill in the words;
  without them it says "the treatment groups" and "the control groups". No LLM writes it, and it
  never says "statistically significant" (Handbook 15.3.2).
- **Funnel plot** (`funnel`, #161): each study the model used as a point (`yi`, and `sei`, its standard
  error), the centre of the 95% region and a caption with its sources (Cochrane Handbook 13.3.4.2 to
  13.3.4.5). The centre is the common-effect estimate (decision 0020): for a random-effects result
  the R service makes a second fit with `method = "EE"`, which the R code shows with `funnel(ce)`.
  The region is centre ± 1.96 × SE, always 95%. No test for asymmetry is run. The two fits are
  one analysis: if the common-effect fit fails, `/run` fails with the same error as the main fit,
  since both read the same data and a failure there means something is wrong.
- **R code:** rendered from the plan that ran, so it can't differ from it. It is shown only: the
  backend never runs it, and the R service accepts plans, not code (decision 0018).
- **Errors:** a pathway the map doesn't have is `422 unknown_pathway`; one that isn't runnable is
  `409 pathway_not_runnable`, with `details` giving its `status` and `milestone`. An option that
  doesn't apply is `422 invalid_option`. A fit that fails inside metafor is `422 analysis_failed`.
  An R service that doesn't answer is `502 r_service_unavailable`.

## Uploading a CSV

`POST /api/v1/meta-analysis/import` takes a multipart form: the pathway's seven tiers as
separate fields, and `file`. The file is read with Python's `csv` module (R never sees it)
and checked against the same column spec as `/run`, so a file that passes here passes there.

- **The file:** UTF-8, with or without a byte-order mark; separated by commas, semicolons or
  tabs (the header decides); columns in any order; other columns are ignored and listed in
  `ignored_columns`; blank lines are skipped. At most 2 MB.
- **Problems** are `422 invalid_data`: a missing or repeated column under `file.columns.<name>`;
  a study's problems under `/run`'s paths (`data.3.ai`), each message naming the file's row, the
  study and the column ("Row 5 (Aronson 1948), column ai: Must be between 0 and n1i (123).").
  Thousands separators (`1,234`) and a file that isn't UTF-8 text get their own messages.
- **Size:** the backend reads at most 2 MB of the file. In the Docker Compose stack, nginx refuses
  a request over 3 MB before it reaches the backend, with `413` and the same JSON shape
  (`code: too_large`); a host without that proxy needs its own limit (#168).
- **Nothing is kept** (decision 0006).

## Examples

Each published example is a folder in `backend/examples/<id>/` (#162):

- `studies.csv`, in its table's column spec (`table` in `example.json`), read through the same
  check as an upload;
- `example.json`: `title`, `summary`, `description`, `source` and `data_from` (citation and
  URL), optional `labels`, and `published`: for each pathway, where the values are printed and
  each value as printed (`quantity` such as `summary.estimate` or `ratio_scale.ci_lower`, `value`,
  `places`).

The pathways an example runs with aren't listed by hand: they're the map's runnable pathways
whose table is the example's. The validation tests read the same files: the data, and each
published value checked to half a unit in its last printed place. So Casebook, Proof and the
tests can't disagree. Loading refuses an example whose id isn't its folder's name, whose data
fail the upload check or carry extra columns, or whose published values are for a pathway it
doesn't run with.

The first example is the BCG vaccine trials, written from `metadat::dat.bcg` by R (a
validation test checks the file still equals it).

## Proof data

When `ATLAS_PROOF_OUT` names a file, the validation run (`pytest -m integration`) writes the
Proof page's data there (#163); `scripts/check.sh` writes `frontend/public/proof.json`
(git-ignored) and CI keeps it as the `proof` artifact. For each runnable pathway it lists every
test `RUNNABLE` in `spec/build_map.py` names for it:

```json
{"version": 1, "passed": 12, "total": 12,
 "run": {"date": "...", "r": "4.5.3", "metafor": "5.0.1", "python": "...", "commit": "...", "uncommitted_changes": false},
 "pathways": [{"pathway": {"framework": "...", "model": "Common effect", "method": "IV", "metric": "OR", ...},
   "status": "passed",
   "checks": [{"test": "backend/tests/test_validation.py::...", "kind": "r_code", "dataset": "bcg",
     "dataset_label": "BCG vaccine trials", "outcome": "passed",
     "tolerance": "relative difference under 1e-10 (absolute 1e-12 near zero)",
     "values": [{"quantity": "estimate", "ours": -0.436139..., "compared": -0.436139..., "passed": true}]}]}]}
```

- `kind` is `published` (metafor's reference pages), `by_hand` (metafor called directly in the
  test) or `r_code` (the R code `/run` shows).
- `dataset` is `bcg` (the BCG example) or `double zero` (the same with one study that has no
  events in either group; the by-hand checks run on both).
- A named test that didn't run is `missing`, never a pass; a test `RUNNABLE` doesn't name isn't
  listed. A pathway is `passed` only if every check passed, compared at least one value, and every
  value passed. Each run first deletes the last run's file, so a run that stops early leaves none.
- The versions come from the R service's `/health`; if it can't be asked, they are `null`, not
  guessed.

## Settings

| Variable | Default | |
|---|---|---|
| `ATLAS_SPEC_DIR` | the repository's `spec/` | where `map.json` and `cards.json` are |
| `ATLAS_EXAMPLES_DIR` | `backend/examples` | the published example datasets |
| `R_SERVICE_URL` | `http://localhost:8000` | the R service (`r_service/`) |
| `ATLAS_CORS_ORIGINS` | none | comma-separated origins allowed to call the API from a browser |

## The frontend's client

`frontend/src/api/client.ts` calls this API with types generated from its OpenAPI schema
(`scripts/api_types.py` writes `frontend/src/types/api.ts`; `scripts/check.sh` fails if it isn't
current). It calls the API at `VITE_API_BASE`, set when the frontend is built; empty, the default,
means the same origin, as behind the Docker Compose stack's nginx. For `npm run dev`, set it to
the backend's address (`VITE_API_BASE=http://localhost:8080`, with `ATLAS_CORS_ORIGINS` allowing
the dev server's origin).

## Running it

```bash
.venv/bin/uvicorn app.main:app --app-dir backend --port 8080
docker compose up --build        # with the apps and the R service, at http://localhost:8080
```

Its tests run with the map's: `.venv/bin/pytest` (and `scripts/check.sh`). The default run
leaves out the validation tests (`@pytest.mark.integration`), which compare `/run` with metafor
run directly and with the values on metafor's reference pages; `scripts/check.sh` starts the R
service and runs them. By hand:

```bash
(cd r_service && R_SERVICE_PORT=8000 Rscript run.R) &
R_SERVICE_URL=http://localhost:8000 .venv/bin/pytest -m integration
```

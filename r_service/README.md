# R service

Runs the analysis plans the backend builds from the map, with metafor, and
returns numbers only (decisions 0006 and 0018). It holds no rules about what
is valid: the backend checks every request against the map first.

## A plan

A plan is data, never code: R never evaluates text it receives.

```json
{
  "plan": {
    "effect": {"fn": "escalc", "args": {"measure": "RR",
      "ai": {"column": "tpos"}, "bi": {"column": "tneg"},
      "ci": {"column": "cpos"}, "di": {"column": "cneg"}}},
    "model": {"fn": "rma.uni", "args": {"yi": {"column": "yi"},
      "vi": {"column": "vi"}, "method": "REML"}},
    "post": {"fn": "leave1out"},
    "outputs": ["estimate", "ci_lower", "ci_upper", "tau2", "k"]
  },
  "data": {"tpos": [4, 6], "tneg": [119, 300], "cpos": [11, 29], "cneg": [128, 274]}
}
```

- **Steps:** each step names a function from a fixed allow-list:
  - `effect`: `escalc`;
  - `model`: `rma.uni`, `rma.mh` or `rma.peto`;
  - `post`: `cumul` or `leave1out`.
- **Arguments:** each one is a plain value, or a column reference like
  `{"column": "tpos"}`.
- **Columns:** after `effect`, the data gain `yi` and `vi`.
- **Outputs** (`outputs`, all by default): `estimate`, `se`, `ci_lower`,
  `ci_upper`, `zval`, `pval`, `tau2`, `i2`, `h2`, `q`, `q_pval`, `q_df` (Q's
  degrees of freedom, which leave out studies with no estimate: `rma.mh` and
  `rma.peto` count those in `k`), `k`, and the prediction interval `pi_lower` and `pi_upper` (from `predict()`, for
  `rma.uni` only). A value a model doesn't have is `null`, for example
  the prediction interval for `rma.mh`.
- **Studies:** every result has `studies`, one row per study in the data,
  with `study`, `yi`, `vi`, `weight` (percent, as metafor's `weights()` gives
  it) and `used`. A study the model left out, such as a double-zero study
  under Mantel-Haenszel, has `weight` null or 0 and `used` false.
- **Steps:** a `post` step adds `steps`, one row per study.
- **Refusals:** a function or column outside the plan's rules gets a 400
  with the reason. An error inside metafor gets a 422.

## Running it

```bash
cd r_service
Rscript tests/testthat.R               # tests, including validation against metafor's documented values
R_SERVICE_PORT=8000 Rscript run.R      # GET /health, POST /execute
docker build -t atlas-r-service .      # the image runs the tests while building
```

Packages are pinned in `renv.lock`. To install them:

```r
renv::restore(lockfile = "renv.lock", library = .libPaths()[1])
```

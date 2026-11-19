# 0012: R implementations for the HSROC model and for O − E and V data

Decided by the owner, 2026-11-19 (issue #25). Recorded in the `HSROC` and
`OEV` methods in `spec/build_map.py`.

## Decision

- **HSROC model (Rutter and Gatsonis):** `dtametaTMB::fitRutterGatsonis()`.
  Subgroups use `fitRutterGatsonisSubgroup()`, and meta-regression uses
  `fitRutterGatsonisReg()`.
- **O − E and V data:** compute each study's log hazard ratio as (O − E)/V,
  with variance 1/V. Then pool them in metafor's equal-effects model,
  `rma.uni(yi, vi, method = "EE")`.

## Why, and what the sources say

- **HSROC:**
  - dtametaTMB's manual (CRAN, version 0.1.4, 2026-10-26, GPL) describes
    `fitRutterGatsonis()` as fitting the Rutter and Gatsonis HSROC model
    from each study's 2x2 counts, with random effects for accuracy and
    threshold.
  - The alternative was mada's `reitsma()`, whose page says Harbord et al.
    (2007) showed the bivariate model to be equivalent to the HSROC model.
    The owner chose the package that fits the HSROC model directly.
  - dtametaTMB is young (first released in 2026), so a validation test
    against a published example matters before it runs (v0.4).
- **O − E and V:**
  - Cochrane Handbook 6.8.2 gives the log hazard ratio as (O − E)/V, with
    standard error 1/√V, and notes that it is approximate.
  - 10.9 says RevMan offers only fixed-effect methods for these data.
  - metafor's `rma.uni()` with `method = "EE"` fits an equal-effects model
    with inverse-variance weights.

## Effect on the map

No pathway is added or removed (551).

- The O − E and V method is now confirmed, so its pathway moves from to
  check to specified (milestone Later).
- The HSROC pathways stay to check, because the diagnostic accuracy branch
  and the summary ROC metric are still unconfirmed (#21).

| | Before | After |
|---|---:|---:|
| Specified | 63 | 64 |
| To check | 76 | 75 |

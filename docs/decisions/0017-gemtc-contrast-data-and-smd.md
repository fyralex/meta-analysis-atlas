# 0017: gemtc's contrast-level data and its SMD, confirmed from its source

Decided by the owner, 2026-11-19 (#25). gemtc's help pages are silent on
both points, so the map cites its source code (the CRAN mirror).

## Decision

- **Contrast-level data:** gemtc's contrast-level pathways are confirmed:
  OR, RR, MD, SMD, rate ratio and HR, each with both models.
  - `diff` must be on the scale of the link named in `mtc.model()`: log OR
    for binom/logit, log RR for binom/log, MD for normal/identity, SMD for
    normal/smd, log rate ratio for poisson/log, and log HR for
    binom/cloglog.
  - The link sets the scale gemtc reports (the `mtc.model()` table). For the
    log HR the map uses binom/cloglog; poisson/log is labelled a hazard ratio
    too and would fit the same model.
  - The network metric cards show each call.
- **From arm-level data, gemtc's standardized mean difference is Hedges' g,**
  and it is confirmed. Contrast-level SMDs are taken as given (the `smd`
  link computes nothing for them), so each study's must be computed
  consistently, as R31 says.
  - Rule R31 is amended: a network SMD must stay consistent within
    multi-arm studies. netmeta does that with Cohen's d, and gemtc, from
    arm-level data, with a Hedges' g corrected once per study.
  - The metric is relabelled "Standardized mean difference (network)".
  - Its card says the two engines' scales differ slightly.

## What the source says

- **Contrast-level data** (`inst/gemtc.releffect.likelihood.r2.txt`, and
  the `.rm` template for multi-arm studies, which also needs the reference
  arm's `std.err`):
  - each study's `diff` is modelled as normal, with standard error
    `std.err`, around the model's linear predictor for that comparison;
  - so it is read on the link's scale;
  - `R/mtc.model.R` defaults to normal/identity when only contrast data are
    given.
- **The SMD** (`R/ll.normal.smd.R`):
  - the arm-level linear predictor is multiplied by the standard deviation
    pooled across all arms of the study, and divided by
    1 − 3/(4(N − k) − 1), Hedges' correction with the study's total
    degrees of freedom;
  - the relative effect is therefore Hedges' g, with one correction per
    study, so a multi-arm study's comparisons agree.

## Effect on the map

No pathway is added or removed (540). 14 gemtc pathways move from to check
to planned (v0.3): 12 contrast-level ones, and the arm-level SMD with both
models.

| | Before | After |
|---|---:|---:|
| Planned | 430 | 444 |
| To check | 24 | 10 |

Still open: how rma.mv networks take an SMD (R31).

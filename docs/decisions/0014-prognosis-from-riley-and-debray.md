# 0014: The prognosis framework is confirmed from Riley 2019 and Debray 2017

Decided by the owner, 2026-11-19 (#22, #25). The owner supplied both papers
as PDFs. They aren't in the repository; the map cites them, and states
their guidance in its own words.

## Decision

- **Prognostic factors:** the branch and its four adjusted measures (HR,
  OR, RR, MD) are confirmed from Riley et al. 2019. They are pooled with
  random effects only (rule R34). The 8 common-effect pathways are removed.
- **Prediction model performance:** it stays as it was (c-statistic and
  O:E ratio, with metamisc's `valmeta()`), with both models. Its card adds
  Debray et al. 2017's advice and a caution that random effects is the
  usual choice.

## What the sources say

- **Riley et al. 2019**, *BMJ* 364:k4597:
  - focus on adjusted estimates (Step 1);
  - the estimates to extract are risk ratios or odds ratios, hazard ratios
    and mean differences, with their standard errors (Step 3);
  - consider separate meta-analyses for each type of estimate, adjusted and
    unadjusted estimates, cut-points, trends and methods of measurement
    (Step 5);
  - Box 2: assuming a common prognostic effect isn't sensible, because the
    true effect is expected to differ between studies; use a random-effects
    model, on the log scale for ratios (REML, DerSimonian-Laird or Bayesian), with
    Hartung-Knapp intervals; Step 5 calls random effects essential;
  - Step 7: check for small-study effects.
- **Debray et al. 2017**, *BMJ* 356:i6460 (accepted manuscript, cited by
  section heading). Under "Meta-analysis":
  - rescale the c-statistic to the logit scale and the O:E ratio to the log
    scale;
  - the analysis should usually allow for heterogeneity, through random
    effects;
  - use REML with Hartung-Knapp-Sidik-Jonkman intervals and a prediction
    interval;
  - prediction intervals are usually very wide with fewer than ten
    studies.

## Why the two differ

Riley says a common effect "is not sensible" for prognostic factors, and the
owner removed it. Debray says random effects should "usually" be used for
model performance, which leaves room for a common-effect model, so the
owner kept it with a caution.

## Effect on the map

| | Before | After |
|---|---:|---:|
| Pathways | 551 | 543 |
| Planned | 412 | 424 |
| Specified | 79 | 79 |
| To check | 60 | 40 |

The 12 remaining prognostic factor pathways move from to check to planned
(v0.4): inverse variance, rma.mv and bayesmeta, × 4 measures, random
effects.

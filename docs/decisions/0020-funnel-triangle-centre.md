# 0020: The funnel plot's triangle is centred on the common-effect estimate

Decided by the owner, 2026-11-20 (#161).

## Decision

The Workbench's funnel plot draws the region where 95% of studies would be
expected to fall if there were no bias and no heterogeneity. That region is
centred on the **common-effect** estimate:

- for random-effects inverse-variance results, the R service also fits the
  common-effect model (`rma.uni(method = "EE")`) for the centre;
- for common-effect pathways (inverse variance with `EE`, Mantel-Haenszel,
  Peto), the centre is the analysis's own estimate.

The region is always 95%, whatever confidence level the analysis uses.

## Why

Cochrane Handbook 13.3.4.2 describes the triangle as based on a fixed-effect
meta-analysis. metafor's `funnel()` centres it on the fitted model's own
estimate, which for a random-effects model is the random-effects estimate.
The owner chose the Handbook's description. For the BCG trials the two centres
differ: risk ratio about 0.65 (common effect) against 0.49 (random effects).

## Consequences

- A random-effects run makes a second, small metafor fit.
- The R code shown with a result includes that fit and the `funnel()` call, so
  the plot can be reproduced.
- The caption follows Handbook 13.3.4.2 to 13.3.4.5: it doesn't present
  asymmetry as proof of publication bias, it notes the correlation of odds
  ratios with their standard errors, and no asymmetry test is run.

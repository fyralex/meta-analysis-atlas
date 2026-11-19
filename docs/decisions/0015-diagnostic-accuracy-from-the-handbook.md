# 0015: The diagnostic accuracy framework follows the Cochrane DTA Handbook

Decided by the owner, 2026-11-19 (#21, #25). The owner supplied Chapters 9
(version 2.0, updated July 2023) and 10 (version 2.0.1, updated August 2026)
of the Cochrane Handbook for Systematic Reviews of Diagnostic Test Accuracy,
with Chapter 10's code supplement. They aren't in the repository; the map
cites them by section, and states their guidance in its own words.

## Decision

- **Bivariate model:** the map names `lme4::glmer()`, a binomial GLMM, in
  place of `mada::reitsma()`.
- **Univariate pooling** of the diagnostic odds ratio and likelihood ratios
  (`mada::madauni()`) is removed. These three measures are computed from
  the bivariate model at the summary point (rule R35).
- **Both branches are confirmed:** one test against a reference standard,
  and two or more tests compared.
- **HSROC:** it keeps dtametaTMB (decision 0012).

## What the source says

- **9.3.1:**
  - a summary point is preferred in most cases, but only from studies that
    share a threshold;
  - mixing thresholds gives an uninterpretable average;
  - pooling likelihood ratios separately ignores their correlation and can
    give impossible estimates.
- **9.3.2:** heterogeneity is expected, and random effects are the default.
- **9.4:**
  - the bivariate and HSROC models are equivalent without covariates;
  - the diagnostic odds ratio and likelihood ratios can be computed at the
    summary point.
- **9.4.7:**
  - tests are compared by adding a covariate for test type to either model;
  - studies that compare the tests directly are preferred;
  - with mixed thresholds, compare summary curves (HSROC).
- **9.4.8:** with few studies, the five parameters are hard to estimate,
  and the model may need simplifying.
- **10.2.3 and Table 10.2.a:** packages that use a normal approximation
  (mada, mvmeta) are not recommended for Cochrane reviews, and Chapter 10
  uses `lme4::glmer`. Its code supplement (Appendix 5) computes the
  diagnostic odds ratio and likelihood ratios from the glmer fit, with
  delta-method intervals.
- **10.4.3:** covariates in glmer give meta-regression and test
  comparisons.

## Effect on the map

| | Before | After |
|---|---:|---:|
| Pathways | 543 | 540 |
| Planned | 424 | 430 |
| Specified | 79 | 79 |
| To check | 40 | 31 |

- **Removed: 6.** These are the univariate pathways (diagnostic odds ratio,
  LR+ and LR−, each with both models).
- **Added: 3.** These are the bivariate model with the same three measures,
  random effects.
- **Moved: all 10 diagnostic accuracy pathways**, now planned (v0.4).

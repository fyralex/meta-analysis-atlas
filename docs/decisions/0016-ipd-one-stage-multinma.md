# 0016: One-stage IPD analysis for two groups uses multinma

Decided by the owner, 2026-11-19 (#25).

## Decision

- **The pairwise one-stage method (`IPD1`):** the map names
  `multinma::nma()` with `set_ipd()`, fitting two groups as a network of two
  treatments. This is the same package as the network method (decision in
  #59).
- **The branches:** the participant-data branches for two groups and for
  networks are confirmed. Their odds ratio, mean difference and rate ratio
  leave "to check".
- **What stays to check:**
  - the hazard ratios (`UNCONFIRMED`): multinma's help page doesn't say
    which of its survival likelihoods give one;
  - the one-group branch: no source read covers pooling participant data
    from single groups.

## What the sources say

- **Cochrane Handbook 26.4.2:** a one-stage model is a regression that
  estimates intervention effects while stratifying by study.
- **26.4.5:** it needs mixed-effects or multilevel regression software, and
  the chapter names no one-stage R package.
- **multinma:**
  - `set_ipd()` takes participant data for binary, continuous, count and
    survival outcomes;
  - `nma()` fits fixed or random treatment effects in Stan;
  - its likelihoods include Bernoulli/logit (odds ratio), normal/identity
    (mean difference) and Poisson/log (rate ratio).

The alternative was `lme4::glmer`, whose help pages describe the model but
not meta-analysis, and which has no survival model.

## Effect on the map

No pathway is added or removed (540).

| | Before | After |
|---|---:|---:|
| Specified | 79 | 86 |
| To check | 31 | 24 |

# 0009: Penalised logistic regression is accepted, with both models

Decided by the owner, 2026-11-19 (issues #20 and #58). Recorded in
`ACCEPTED_METHODS` in `spec/build_map.py`.

## Decision

Penalised logistic regression, `meta::metabin(method="LRP")`, stays in the
map for two-group binary data with the odds ratio, under both the
common-effect and the random-effects model. It is confirmed and no longer
marked new.

## Why, and what the source says

- The `metabin()` help page says both models are calculated by default, and
  states no restriction on them for LRP.
- Its random-effects model is not the usual one. It adds a multiplicative
  heterogeneity parameter (phi), estimated from a modified Pearson
  statistic, where 1 means no heterogeneity. It doesn't estimate a
  between-study variance (tau squared). The method's note and card say so.
- The alternative was to keep only the common-effect model, because the
  random-effects version differs from the other methods'. The owner chose to
  keep both and to state the difference.

## Changing it

Removing the random-effects model would remove one pathway. That change
needs a source arguing against the multiplicative model, and an audited map
change.

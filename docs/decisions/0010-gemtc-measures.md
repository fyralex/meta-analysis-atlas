# 0010: gemtc networks take only the measures its likelihoods give

Decided by the owner, 2026-11-19 (issue #40). Recorded in rule R33, the
`NM_BAYES` method (its `metrics` and note) and `UNCONFIRMED_INPUT`.

## Decision

- **Arm-level data:** gemtc keeps the odds ratio, the risk ratio, the mean
  difference, the standardized mean difference and the rate ratio. It loses
  the risk difference, the arcsine difference, the ratio of means and the
  rate difference.
- **Contrast-level data:** it keeps the same measures, plus the hazard ratio.
  Its contrast-level pathways stay to check.
- **The method is confirmed.** Its pathways become planned (v0.3), except
  those whose measure or input is still unconfirmed: the standardized mean
  difference, and every contrast-level pathway.

## Why, and what the sources say

- **Likelihoods:** gemtc's `mtc.model()` help page lists the likelihoods and
  links it supports, and what each gives:
  - binomial/logit: the odds ratio;
  - binomial/log: the risk ratio;
  - normal/identity: the mean difference;
  - normal/smd: the standardized mean difference;
  - Poisson/log, from events and exposure: a rate ratio, which gemtc names a
    hazard ratio;
  - binomial/cloglog: also a hazard ratio.

  None gives a difference of risks or rates, an arcsine difference or a
  ratio of means. The map has no arm-level network branch for time-to-event
  data, so binomial/cloglog adds no pathway.
- **Common effect:** the same page says `linearModel = "fixed"` fits a
  fixed-effect model. That was the open question behind marking the method
  unconfirmed.
- **Contrast-level data:** the `mtc.network()` help page describes them as
  `diff` and `std.err`, but doesn't say what scale `diff` is on or how it is
  matched to a likelihood. Those pathways stay to check until a source says.
- **The SMD:** gemtc's normal/smd likelihood fits a standardized mean
  difference. Its help page doesn't say whether that is Cohen's d (R31).

## Effect on the map

16 pathways are removed: 4 measures, for 2 inputs and 2 models each. Six of
them were in taxonomy v11, so the v11 comparison now lists them as removed,
with R33 as the reason.

| | Before | After |
|---|---:|---:|
| Pathways | 564 | 548 |
| Planned | 404 | 412 |
| Specified | 63 | 63 |
| To check | 97 | 73 |

# 0013: The exposure-outcome branch follows Cochrane Ch. 24 by analogy

Decided by the owner, 2026-11-19 (issue #23).

## Decision

The association framework's "Exposure and outcome (observational studies)"
branch pools adjusted odds ratios, risk ratios or hazard ratios. It is
confirmed from Cochrane Handbook Ch. 24, and its metrics too. Ch. 24 is
written for non-randomized studies **of interventions**; the map applies it
to exposures (such as risk factors) by analogy, and says so on the branch
and its card.

## What the source says (Ch. 24, last updated October 2019)

- **24.4.1:** prefer adjusted estimates to unadjusted ones. Where a study
  reports several, choose the one judged least at risk of bias from
  confounding.
- **24.6.2.1:**
  - the generic inverse-variance method suits these studies;
  - random effects should be the default, with a reason given for a
    fixed-effect model;
  - randomized trials and non-randomized studies should not be combined;
  - very different designs should be analysed separately.
- **24.6.2.2:** differences in how studies control for confounding are a
  source of heterogeneity.

These go on the branch's card. Choosing a model stays the user's choice;
the card gives Cochrane's default.

## Effect on the map

No pathway is added or removed (551). The branch's 15 pathways (inverse
variance, bayesmeta and `rma.mv`, × 3 measures) move from to check to
specified (milestone Later).

| | Before | After |
|---|---:|---:|
| Specified | 64 | 79 |
| To check | 75 | 60 |

## Changing it

A source written for exposures (an epidemiology methods paper, or reporting
guidance for observational studies) could replace the analogy.

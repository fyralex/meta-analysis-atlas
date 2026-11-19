# 0011: No refit loops for cumulative and leave-one-out analyses

Decided by the owner, 2026-11-19 (issue #25).

## Decision

The map offers cumulative and leave-one-out analyses only where a package
has a function for them. For metafor, that means `rma.uni`, `rma.mh` and
`rma.peto` (rule R11). It doesn't offer them for `rma.glmm`, `rma.mv` or
bayesmeta through a loop that refits the model study by study.

## Why

- **The rule the map already follows.** CLAUDE.md says each method carries
  the analysis types its package supports directly. A refit loop would be
  the map's own construction, not something the package documents.
- **What the sources show.**
  - metafor's `cumul()` and `leave1out()` have methods for `rma.uni`,
    `rma.mh` and `rma.peto` only.
  - bayesmeta's manual (version 3.5) has neither function (rule R13).

## Changing it

Offering refit loops would add analysis types to those methods. It would
need a source describing the loop for each model, a validation test once
the analyses run (v0.2), and an audited map change.

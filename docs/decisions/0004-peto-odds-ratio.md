# 0004: The Peto odds ratio goes only with Peto's method

Decided by the owner, 2026-11-16 (issue #45). Recorded as rule R32.

## Decision

The map offers the Peto odds ratio (`escalc(measure="PETO")`) only with
Peto's method (`rma.peto`), as before. No pathway changes.

## Why, and what the sources say

- **Cochrane Handbook 10.4.2** presents the Peto odds ratio as the estimate
  that Peto's method computes: an approximate log odds ratio from observed
  minus expected events and their variance. It doesn't recommend the method as
  a default. The introduction to 10.4 lists it among the common-effect methods.
- **metafor's `escalc(measure="PETO")`** computes the same log odds ratio
  study by study. Its page doesn't say which function should pool it; once
  computed, `rma.uni` or another method could take it, including with random
  effects (our reading, not a statement of the page).

Neither source says the Peto odds ratio must be pooled only by Peto's method.
R32 therefore states the restriction as the map's choice ("In this map, ...")
and gives both sources. The "Why not?" reason for the Peto odds ratio with any
other method cites R32 and keeps the same wording.

## Changing it

Offering the Peto odds ratio with other methods would add pathways
(inverse variance, common and random effects, for two-group binary
arm-level data, and possibly `rma.mv` and bayesmeta). That is a map change,
with its own PR and this record updated.

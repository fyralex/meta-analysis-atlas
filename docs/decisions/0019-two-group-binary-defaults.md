# 0019: Defaults for the two-group binary pathways

Decided by the owner, 2026-11-20 (#148).

## Decision

The 12 interventional, two-group, arm-level, binary pathways (inverse
variance with OR, RR, RD and AS; Mantel-Haenszel with OR, RR and RD; Peto)
run with these defaults.

- **Between-study variance:** REML. The other `rma.uni` estimators stay
  selectable, except `GENQ` and `GENQM`: metafor needs study weights chosen by
  the user for them, and the request has no place for weights yet. They are
  not offered until it does (found while validating, #148).
- **Random-effects interval:** the Wald interval (`test = "z"`). The
  Hartung-Knapp-Sidik-Jonkman interval (`test = "knha"`) is an option.
- **Zero cells:** metafor's defaults, which add 0.5 only to a study's table
  that has a zero cell. The exception is inverse variance with OR or RR,
  where studies with no events in either arm are dropped (`drop00 = TRUE`).
  They are kept for RD and AS. Mantel-Haenszel and Peto use their function's
  own default (`drop00 = TRUE`). Checked against metafor 5.0.1, `rma.mh` and
  `rma.peto` then drop such studies for OR, RR and the Peto odds ratio, and
  `rma.mh` keeps them for RD. The result lists every study left out.

## Sources

- **Cochrane Handbook 10.10.4.4** covers the choice of random-effects method.
  It notes that RevMan has defaulted to REML since 2024 and presents the
  Hartung-Knapp-Sidik-Jonkman interval as an alternative. The estimator
  discussion also runs through 10.10.4.3.
- **Handbook 10.4.1, 10.4.2 and 10.4.4.1 to 10.4.4.3** are the sections on the
  common-effect binary methods and on zero cells. **10.4.4.2** is the one the
  owner followed for dropping studies with no events in either arm from the
  ratio analyses.
- **metafor** documents the arguments that implement this: `add`, `to` and
  `drop00` (`escalc`, `rma.mh`, `rma.peto`), and the `method` and `test`
  options of `rma.uni`.

These are defaults, not rules. The sections above are cited as the owner
gave them; the Handbook text itself has not been re-read for this record
(`verified` stays as the map has it).

## Consequences

- A request may change the estimator and the interval (`options`); it may
  not change the zero-cell handling. Changing that is a new decision.
- The R code shown with a result gives `drop00` wherever the plan sets it.

# 0003: A network's standardized mean difference is Cohen's d

Decided by the owner, 2026-11-16 (issue #31).

## Decision

The map offers **one** standardized mean difference for networks (`N_SMD`),
labelled **Cohen's d**, for every network engine. Cohen's d and Hedges' g are
not offered separately for networks. Rule R31 records this.

## Why

- **What netmeta computes.** The Details of meta's `pairwise()` help page
  (source key `META-pw`) say that, for `sm = "SMD"`, it follows Crippa and
  Orsini (2016), which keeps the SMDs and their standard errors of a
  multi-arm study consistent with one another. It notes that the result is
  Cohen's d, because Hedges' g would not be consistent in such studies.
- **Taxonomy v11 differed.** It offered Cohen's d and Hedges' g separately for
  the `rma.mv` and gemtc networks (8 pathways). The map had merged them into
  `N_SMD` with no source recorded. That merge now has a reason, R31, in the
  v11 comparison.
- **The other engines aren't confirmed yet.** The source speaks for netmeta.
  How `rma.mv` and gemtc networks take an SMD isn't confirmed from their own
  documentation. So the `rma.mv` and gemtc `N_SMD` pathways are to check,
  through a new list in the map, `UNCONFIRMED`: pairs of a method and a metric
  that are each confirmed but whose pairing is not. The open items say what
  to read.

## Effect on the map

No pathway is added or removed (564).

| | Before | After |
|---|---:|---:|
| Planned | 408 | 404 |
| To check | 95 | 99 |

- The 4 `rma.mv` network SMD pathways (arm-level or contrast-level, × common or random effects) move from planned to to check.
- The gemtc ones were already to check.
- netmeta's 4 stay planned, now labelled Cohen's d.

## Sources

- meta, `pairwise()` help page, Details: https://rdrr.io/cran/meta/man/pairwise.html (read 2026-11-16).
- Crippa A, Orsini N (2016). Dose-response meta-analysis of differences in means. *BMC Medical Research Methodology* 16:91. Cited by `pairwise()`; not read for this decision.

# 0002: Network meta-analysis of count data offers the rate ratio and the rate difference

Decided by the owner, 2026-11-16 (issue #29).

## Decision

For a network of studies that report events and person-time, the map offers
two metrics: the **incidence rate ratio** (`N_IRR`) and the **incidence rate
difference** (`N_IRD`). Both are confirmed (`verified`), for arm-level data and
for contrast-level estimates.

## Why

- **Taxonomy v11 had the rate difference.** The map dropped its 4 network IRD
  pathways with no reason recorded. They are restored, so they are not marked
  new.
- **netmeta documents both.** The examples on `netmeta()`'s help page (source
  key `NM`) turn arm-level events and person-time into contrasts with
  `pairwise(..., time = ...)`. One example uses the rate ratio, another the
  rate difference, and each then fits the network with `netmeta()`.
- **Where the measures come from.** `pairwise()`'s help page sends event and
  person-time data through `metainc()`. The `sm` argument of `metainc()`
  lists IRR and IRD among its measures. `pairwise()` also gives a different
  zero-cell rule for each measure: for the ratio, 0.5 is added to every cell;
  for the difference, only when computing the standard error.
- **Same convention as the other network metrics.** Like `N_OR` or `N_MD`,
  the metric's call is netmeta's. The `rma.mv` and gemtc networks reuse the
  metric with their own engine's status: gemtc pathways stay to check.
  (Superseded for gemtc by decision 0010: gemtc has no likelihood for a rate
  difference, so its IRD pathways were removed.)

## Effect on the map

| | Before | After |
|---|---:|---:|
| Pathways | 552 | 564 |
| Planned | 392 | 408 |
| To check | 99 | 95 |

- 12 IRD pathways are added: netmeta, `rma.mv` and gemtc networks, × arm-level or contrast-level data, × common or random effects. 4 are v11's, restored; 8 are new.
- The 8 netmeta and `rma.mv` IRR pathways move from to check to planned.
- v11 comparison: 200 kept (was 196) and 26 removed (was 30).

## Sources

- netmeta, `netmeta()` help page, Examples: https://rdrr.io/cran/netmeta/man/netmeta.html (read 2026-11-16).
- meta, `pairwise()` help page, Details: https://rdrr.io/cran/meta/man/pairwise.html (read 2026-11-16).
- meta, `metainc()` help page, argument `sm`: https://rdrr.io/cran/meta/man/metainc.html (read 2026-11-16).

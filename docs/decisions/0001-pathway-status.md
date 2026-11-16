# 0001: How a pathway gets its status

Decided by the owner, 2026-11-16 (issue #2).

## Decision

Every pathway carries a **milestone** and a **status**, both generated in
`spec/build_map.py` from data, never set by hand per pathway.

**Milestone.** For a diagnostic accuracy, prognosis, association or
reliability pathway, its framework's. For an interventional pathway, its
method's engine's, following the roadmap in CLAUDE.md:

| Milestone | Engines |
|---|---|
| v0.2 | metafor's `rma.uni`, `rma.mh`, `rma.peto`, `rma.glmm` (one group, two groups, change or matched pairs) |
| v0.3 | `rma.mv` (pairwise), bayesmeta, and the network engines (netmeta, `rma.mv`, `netmetabin`, gemtc) |
| v0.4 | diagnostic accuracy and prognosis |
| Later | one-stage IPD, O − E and V, penalised logistic regression, association, reliability |

The roadmap names netmeta, `rma.mv`, bayesmeta, diagnostic accuracy and
prognosis. Placing `netmetabin` (part of netmeta) and gemtc with the networks
in v0.3, and O − E and V and penalised logistic regression in Later (no R
implementation chosen), is this record's reading of it. gemtc, O − E and V and
penalised logistic regression are all still to check, so their milestone
changes no status today.

**Status.**

| Status | When |
|---|---|
| `runnable` | it has a passing validation test (none in v0.1) |
| `to_check` | not yet confirmed from a primary source (`verified = False`) |
| `planned` | confirmed, and its milestone is v0.2, v0.3 or v0.4 |
| `specified` | confirmed, and its milestone is Later |

## Choices made

- **"Planned" means on the roadmap,** v0.2 to v0.4, not only the next
  release. The roadmap names those engines; "Later" doesn't commit to one.
- **Change or matched pairs follow their engine** (`rma.uni` in v0.2;
  `rma.mv` and bayesmeta in v0.3), not the "Later" of unit-of-analysis
  corrections: their measures (mean change, matched-pairs odds ratio) are
  `escalc` measures run like any other, and the paired data are an input,
  not a correction.

## Counts when decided

552 pathways: 392 planned (138 in v0.2, 249 in v0.3, 5 in v0.4), 61 specified,
99 to check, 0 runnable.

## Changing it

A change to the rule, or to a method's or framework's milestone, is a map
change: its own PR, with this record updated and the lock file's diff
explained.

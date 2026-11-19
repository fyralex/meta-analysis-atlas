# 0008: The first families of new entries are accepted

Decided by the owner, 2026-11-19 (issues #9 to #19). Recorded in the
`ACCEPTED_*` tables of `spec/build_map.py` (issue #108).

## Decision

- **Corrections to taxonomy v11, #9 to #15:** accepted as the map states them.
  No pathway changes.
- **Entries the map added, #16 to #19:** accepted. These are the change or
  matched-pairs group (#16), ordinal outcomes and O − E and V data (#17), seven
  extra escalc metrics (#18), and netmeta and netmetabin (#19).
- **Common-effect models the map added:** the common-effect model for `rma.mv`
  (#14) and for network meta-analysis (#11) is accepted too.

An accepted entry keeps `added` (it is still not in taxonomy v11, and the v11
comparison tests read that), and loses its "new" badge. The generator writes
`new` = added and not yet accepted, and the apps show the badge, and "hide
new", from `new`.

## Why, and what the sources say

Each family's issue gives its sources. The corrections that rest on
metafor's reference pages and Cochrane Handbook 10.10.4.4 were checked
again on 2026-11-19 before the owner decided; each issue has a comment
saying what was checked.

## Still new

- The diagnostic accuracy, prognosis, association and reliability frameworks
  (#21 to #24).

Penalised logistic regression (#20) was still new when this was decided. It
was accepted later the same day, once its models were confirmed (#58); see
decision 0009. The arcsine difference for networks (`N_ASD`), which no family
issue covered, was accepted the same day too (#111).

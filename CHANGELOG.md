# Changelog

Each release lists what changed, with the pull requests behind it. The map
itself changes only through audited pull requests, and each map change
explains its effect on the pathways.

## 0.1.0 (2026-11-17)

The first release: the map of analysis pathways, and three apps to explore
it. Nothing runs analyses yet; no pathway is runnable.

### The map

- 564 pathways across five frameworks: interventional (including network
  meta-analysis), diagnostic test accuracy, prognosis, association and
  measurement reliability. They are generated from `spec/build_map.py` and
  pinned in `spec/pathways.lock.json` (#30).
- A status for every pathway: 404 planned, 61 specified and 99 to check (#33).
- A source for every entry: methods, metrics and rules from the start (#30),
  branches and notes since #43. Each method and metric has its own name (#42).
- Map changes, each with its reason and source:
  - the incidence rate difference for networks (#39);
  - the network standardized mean difference is Cohen's d, as `pairwise()`
    computes it (#41);
  - the Peto odds ratio goes only with Peto's method, as rule R32 (#48;
    decision 0004).

### Atlas

- A 2D view of every pathway, one layer per tier, with counts for every node,
  the tier order as a setting, and a setting to hide entries marked new
  (#36, #38).
- "Why not?" for every node that doesn't fit the choices, citing the rule or
  source behind it where there is one (#44, #46).
- A 3D view of the same nodes and counts, which falls back to 2D without
  WebGL 2 (#71). Crowded layers label only their busiest nodes, so the labels
  can be read (#89).
- The matching-pathways table fits narrow screens: Status first, the tiers
  every match shares in one line above it, and a card for each row on a phone.
  A chosen node carries a check mark as well as its colour (#85).
- A setting to show only runnable pathways, which stays off until a pathway
  is runnable (#72).

### Pathfinder

- Questions in a methodologist's order lead to the pathways that fit, each
  option with its source and each ruled-out option with its reason. The
  answers are shared with the Atlas (#69).
- Advice on rare events and on whether true effects vary. Neither removes a
  pathway (#70; decision 0005).

### Cards

- A card for every choice and rule (#47), with teaching text for every
  choice whose source has been read, written and audited in 15 batches
  (#51–#57, #60–#67).
- A glossary of 14 terms, linked from the cards that use them (#68).
- A method card's "Used for" names the group structures the method has
  pathways in, with their framework where it spans several (#76).

### The project

- Local checks for every pull request, and CI and a GitHub Pages deploy at
  releases (#26, #34).
- An audit of every pull request against its sources before review, except
  small ones that change only docs, tests or a few lines outside the map
  (#26, #28).
- Faster frontend tests (#50).
- A favicon, and wording that matches the project's rules: what makes a
  pathway runnable, and why a card may have no teaching text (#87).
- A generated record of every npm package with its licence, checked to be
  GPL-compatible for what the app uses, and a list of the npm advisories
  still open in the build and test tools, with why (#75).

### Known gaps

- Some cards have no teaching text yet: those whose only source hasn't been
  read (the Cochrane Handbook for diagnostic test accuracy, and Riley et al.
  2019; #21, #25), and those whose only source doesn't cover them (the
  participant-data measures and one-stage participant-data network
  meta-analysis, which Cochrane chapter 26 doesn't describe; #25, #59).
- Penalised logistic regression's models, and the wording of a note on
  bayesmeta, still need confirming from their sources (#58).
- In the 3D view, a few long labels still overlap where nodes sit close
  together; hovering a node shows its own.

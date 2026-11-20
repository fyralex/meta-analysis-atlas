# Changelog

Each release lists what changed, with the pull requests behind it. The map
itself changes only through audited pull requests, and each map change
explains its effect on the pathways.

## 0.1.2 (2026-11-19)

The map's review: every open methodology issue is decided, and every source
it needs has been read. 540 pathways (was 564): 444 planned, 86 specified and
10 to check (was 99). Nothing is runnable yet. The 10 left to check are
tracked in #133, #134 and #135.

### Decisions on the map

- **New entries accepted:** the owner accepted the corrections to taxonomy
  v11 (#9 to #15) and every family of new entries: change and matched pairs,
  ordinal and O − E and V data, extra escalc metrics, netmeta and netmetabin,
  penalised logistic regression, the network arcsine difference, and the
  diagnostic accuracy, prognosis, association and reliability frameworks
  (#109, #110, #112, #128). Accepted entries lose the "new" badge; only 3
  pathways stay new.
- **gemtc networks:** they take only the measures their likelihoods give
  (rule R33, #118). Contrast-level data and the arm-level SMD are confirmed
  from gemtc's source (#132).
- **The network SMD:** it must stay consistent within multi-arm studies.
  netmeta gives Cohen's d; gemtc, from arm-level data, a Hedges' g corrected
  once per study (rule R31, decisions 0003 and 0017).
- **Prognosis:** confirmed from Riley et al. 2019 and Debray et al. 2017.
  Prognostic factors are pooled with random effects only (rule R34, #129).
- **Diagnostic accuracy:** confirmed from the Cochrane DTA Handbook, Ch. 9
  and 10. The bivariate model uses `lme4::glmer`. The diagnostic odds ratio
  and likelihood ratios come from its summary point, and univariate pooling
  is removed (rule R35, #130).
- **Exposure and outcome:** confirmed from Cochrane Ch. 24, by analogy
  (#127).
- **Named R implementations:**
  - dtametaTMB for the HSROC model, and metafor for O − E and V data (#126);
  - multinma for one-stage participant data (#122, #131).
- **Cards:**
  - the inverse-variance card explains the variance estimators and the
    Hartung-Knapp interval (#115);
  - the rma.mv card says when it applies (#114);
  - network metric cards name each engine's call (#117, #124).
- **Cochrane chapters:** each chapter's source gives its date. Ch. 10 and 23
  changed in November 2026, and their cited sections were rechecked (#125).
- **The reliability group** is now "One group (one instrument)" (#116).

Decision records 0008 to 0017 are in `docs/decisions/`.

### Apps

- **Atlas, metric families:** the metric step groups its dots by family:
  clusters on the 3D map, and headings in the side panel and the text view
  (#119, #120).
- **Browser tests:** Playwright checks every app at three widths and in both
  themes. They run at releases (#121).

## 0.1.1 (2026-11-18)

A redesign for first-time visitors (#92), and four corrections to the
map's teaching text. The pathways are unchanged: 564, of which 404 are
planned, 61 specified and 99 to check. Nothing is runnable yet.

### Home and Pathfinder

- **Home page:** one promise and three doors, each saying where it goes and
  who it is for (#94).
- **Pathfinder** asks one question at a time, with a step bar that holds the
  answers, and Back and Next buttons that say where they go (#95).
- **Plain names:** the options are named in plain words, each with an
  example and its source. A switch shows the technical names (#96).
- **Results, answer first:** how many analyses fit, any advice on rare events,
  then a model filter that says why it shows what it shows. The analyses are
  grouped by method, each opening to its card text and sources (#97).
- **Small map:** the side panel shows the answers so far as a path on a small,
  read-only 3D map (#104).

### Cards

- **Layout:** the list of cards sits beside the open card, grouped as
  Pathfinder asks its questions (#98).
- **Answer first:** a card opens with what it is, then when to use it, its
  cautions, the R call, the rules behind its limits, and the terms it uses.
  A term opens in place, on the card (#98).
- **Rules in plain words:** each rule has a plain sentence, citing the rule's
  own sources (#99, #101).

### Atlas

- **3D first:** the Atlas opens on the 3D map, as in the prototype, with lines
  joining the nodes that go together (#102).
- **Handles like Google Earth:** it stays still until moved, and a drag glides
  to a stop. Scroll to zoom towards the pointer, or pinch to zoom. The arrow
  keys turn it and + and - zoom; with Ctrl or Cmd, those keys still zoom the
  page (#103).
- **Read-only panel:** beside the map, a panel follows the clicks. It shows
  what was clicked, the options at the next step, and the choices so far.
  The settings fold into "Display options", and the 2D view is now the text
  view, used where 3D can't be drawn (#103).

### The map's teaching text

- "Why not?" for Mantel-Haenszel with random effects also cites rule R4 (#105).
- R24 says combining groups is recommended in most situations (#106).
- R25 says the fixed-effect-only limit for O - E and V data is RevMan's,
  which the map follows (#106; decision 0007).

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

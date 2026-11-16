# Meta-Analysis Atlas

A map of meta-analysis: every valid route from a research question to a
pooled result, in the order a methodologist asks the questions.

```
Framework → Group structure → Datatype → Outcome type → Model → Method → Metric
```

The map covers five frameworks (interventional, including network
meta-analysis; diagnostic test accuracy; prognosis; association; measurement
reliability) and 552 pathways. Every entry cites its source: the Cochrane
Handbook, the metafor documentation, or the documentation of the R package
that runs it. Entries that haven't been confirmed against a primary source
are marked as such.

## Status

Early work. Nothing runs analyses yet. Each pathway in the map has a status:
**planned** (its engine is on the roadmap below), **specified** (confirmed,
not planned yet) or **to check** (not yet confirmed from a primary source).
None is runnable yet ([how statuses are set](docs/decisions/0001-pathway-status.md)).

| Release | Scope |
|---|---|
| v0.1 (in progress) | The map, browsable in 3D and 2D; a question flow that leads to pathways; teaching cards with references |
| v0.2 | Running analyses on your own data or on published examples, with the exact R code shown; every runnable pathway validated against a published result |
| v0.3 | Network meta-analysis, Bayesian and multilevel models |
| v0.4 | Diagnostic accuracy, prognosis, and a methods advisor |

## Browse the map

- [`spec/tree.md`](spec/tree.md): the full tree as text.
- [`spec/backbone.md`](spec/backbone.md): the metrics, methods and rules,
  each with its source.
- `spec/map.html`: a searchable page; download it and open it in a browser.

The map is generated. All its data is in
[`spec/build_map.py`](spec/build_map.py); run `python3 spec/build_map.py` to
regenerate the other files.

## How this project is run

Every change starts as an issue and lands through a reviewed pull request,
including changes to the methodology. The rules are in
[`CLAUDE.md`](CLAUDE.md).

## License

GPL-3.0-or-later. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

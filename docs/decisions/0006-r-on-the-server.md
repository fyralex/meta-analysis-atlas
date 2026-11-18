# 0006: R runs on a server, through a Python API and Plumber

Decided by the owner, 2026-11-18 (issue #91).

## Decision

From v0.2, analyses run on a server. The frontend sends a request to a
Python API (FastAPI). The API checks the request against the map, builds an
execution plan, and passes it to an R service (Plumber) that runs metafor
and returns the numbers and the R code it ran. This is the server stack
CLAUDE.md describes under "Architecture" and "API".

webR (R compiled to WebAssembly, running in the browser) is not used.

## What the spike found

Issue #91 compared webR 0.6.0 with native R 4.5.3 (metafor 5.0.1) on
metafor's own datasets:
- **Matches:** 27 of 29 results were identical to 15 significant digits.
  They cover `escalc()`, `rma.uni()` with REML, DL, PM and EE,
  Hartung-Knapp, prediction intervals, meta-regression, `cumul()`,
  `leave1out()`, `rma.mh()`, `rma.peto()` and `rma.mv()`.
- **The exception:** `rma.glmm()` differed by about 4 in a million. It
  fits by numerical optimisation, and the package versions differed.
- **Cost:** the first analysis waited about 10 s while R and the packages
  downloaded.
- **Untested:** JAGS, which Bayesian network meta-analysis needs in v0.3.

So webR was workable for v0.2. The owner chose the server stack instead.

## Why the server

- **All of R:** every R package is available, JAGS included, with versions
  pinned in one place (renv).
- **Checked on the server:** the Python plan builder checks every request
  against the map before R runs it ("The frontend never decides
  validity").
- **The advisor needs a server anyway:** in v0.4 its LLM API key can't be
  kept in a browser.
- **One place to log and monitor** what runs.

## What it costs

- **Hosting and upkeep:** the app is no longer only static. From v0.2,
  running analyses needs the backend and the R service, hosted and kept
  up to date (Docker Compose, as CLAUDE.md describes).
- **Uploaded data:** a user's data goes to the server. The API must treat
  it as untrusted input and keep nothing after the run.
- **The static part stays:** Atlas, Pathfinder and Cards keep working on
  GitHub Pages without the server.

## Changing it

Moving R into the browser, wholly or as an offline mode, would reopen this
decision. The spike's numbers are on issue #91.

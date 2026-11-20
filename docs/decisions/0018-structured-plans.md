# 0018: The R service runs structured plans, never code text

Decided by the owner, 2026-11-19 (#142).

## Decision

The backend sends the R service a plan made of data: a fixed sequence of
steps.
- **The steps:** an optional effect-size step, a model step, and an
  optional follow-up step.
- **Functions:** each step names a function from an allow-list in
  `r_service/R/executor.R`.
- **Arguments:** each is a plain value, or a reference to a data column.

R checks both, then calls the function with `do.call()`. Nothing is ever
evaluated from text. The R code shown to users will be rendered from the
same plan, by the backend.

## Why

The owner's earlier service evaluated R code strings it received. That is
simpler, but anything that could reach the service could run any R code on
the server. Its safety would then rest only on the network setup.

## Consequences

- Adding a function means adding it to the allow-list, with tests, in a PR.
- The plan format is the contract between the backend and the R service
  (`r_service/README.md`).

#!/bin/sh
# Local checks for a pull request. All must pass before a branch is pushed.
# The same script runs in CI at releases. See CLAUDE.md, "Checks".
#
#   scripts/check.sh            uses .venv/bin/python
#   PYTHON=python scripts/check.sh
set -eu
cd "$(git rev-parse --show-toplevel)"
PY=${PYTHON:-.venv/bin/python}
GENERATED="spec/map.json spec/backbone.md spec/tree.md spec/map.html"

echo "== lint and format (ruff)"
"$PY" -m ruff check .
"$PY" -m ruff format --check .

echo "== generated map files are current"
before=$(cat $GENERATED | shasum)
"$PY" spec/build_map.py >/dev/null
after=$(cat $GENERATED | shasum)
if [ "$before" != "$after" ]; then
  echo "The generated files in spec/ were out of date and have now been regenerated."
  echo "Review and commit them, then run the checks again."
  exit 1
fi

echo "== private name scan"
if [ -n "${ATLAS_PRIVATE_SCAN:-}" ]; then
  "$ATLAS_PRIVATE_SCAN"
elif [ -n "${CI:-}" ]; then
  echo "skipped in CI (the scan is private and runs locally)"
else
  echo "ATLAS_PRIVATE_SCAN is not set. It must run before every push." >&2
  exit 1
fi

echo "All checks passed."

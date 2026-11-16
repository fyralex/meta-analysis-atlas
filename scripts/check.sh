#!/bin/sh
# Local checks for a pull request. All must pass before a branch is pushed.
# The same script runs in CI at releases. See CLAUDE.md, "Checks".
#
#   scripts/check.sh            uses .venv/bin/python
#   PYTHON=python scripts/check.sh
set -eu
cd "$(git rev-parse --show-toplevel)"
PY=${PYTHON:-.venv/bin/python}

echo "== lint and format (ruff)"
"$PY" -m ruff check .
"$PY" -m ruff format --check .

echo "== generated map files are current"
# Regenerate, then compare spec/ with the last commit. This catches stale
# generated files, regenerated files that weren't committed, and new files.
"$PY" spec/build_map.py >/dev/null
if [ -n "$(git status --porcelain -- spec/)" ]; then
  git status --short -- spec/
  echo "spec/ differs from the last commit (listed above)."
  echo "Commit the source change and the regenerated files, then run the checks again."
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

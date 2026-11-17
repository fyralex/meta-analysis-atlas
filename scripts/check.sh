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

echo "== types (mypy --strict)"
"$PY" -m mypy

echo "== map tests (pytest)"
"$PY" -m pytest

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

echo "== npm licence record is current"
# Regenerate docs/npm-licences.md from frontend/package-lock.json; this also fails if a
# dependency of the app has a licence that isn't GPL-compatible (#35).
"$PY" scripts/npm_licences.py
if [ -n "$(git status --porcelain -- docs/npm-licences.md)" ]; then
  echo "docs/npm-licences.md differs from the last commit: commit the regenerated file."
  exit 1
fi

echo "== frontend (lint, types, tests, build)"
if [ ! -d frontend/node_modules ]; then
  echo "frontend/node_modules is missing: run 'npm ci --prefix frontend' first." >&2
  exit 1
fi
npm --prefix frontend run -s lint
npm --prefix frontend run -s typecheck
npm --prefix frontend run -s test
npm --prefix frontend run -s build >/dev/null

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

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

echo "== map and backend tests (pytest)"
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

echo "== R service (tests, lint)"
# The R service's tests compare its plans with metafor called directly and with metafor's documented values.
if ! command -v Rscript >/dev/null 2>&1; then
  echo "Rscript is missing: install R 4.5 and the packages in r_service/renv.lock." >&2
  exit 1
fi
(
  cd r_service
  Rscript tests/testthat.R
  Rscript -e 'l <- lintr::lint_dir("."); print(l); quit(status = as.integer(length(l) > 0))'
)

echo "== validation tests (pytest -m integration, against the running R service)"
# /run's results are compared with metafor run directly and with its documented values. The service starts on a
# free port and is stopped afterwards, whatever happens.
# plumber accepts ports up to 49151 only, so the port is chosen from 20000 to 49151
PORT=$("$PY" - <<'PYEOF'
import random
import socket

while True:
    port = random.randint(20000, 49151)
    with socket.socket() as s:
        try:
            s.bind(("127.0.0.1", port))
        except OSError:
            continue
        print(port)
        break
PYEOF
)
R_LOG=$(mktemp)
(cd r_service && R_SERVICE_PORT="$PORT" exec Rscript run.R >"$R_LOG" 2>&1) &
R_PID=$!
trap 'kill "$R_PID" 2>/dev/null || true' EXIT
up=""
for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then up=yes; break; fi
  sleep 1
done
if [ -z "$up" ]; then
  echo "The R service did not start on port $PORT:" >&2
  cat "$R_LOG" >&2
  exit 1
fi
# the run also writes the Proof page's data (#163): every check RUNNABLE names, with its outcome and values
R_SERVICE_URL="http://127.0.0.1:$PORT" ATLAS_PROOF_OUT=frontend/public/proof.json "$PY" -m pytest -m integration
kill "$R_PID" 2>/dev/null || true
wait "$R_PID" 2>/dev/null || true
trap - EXIT

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

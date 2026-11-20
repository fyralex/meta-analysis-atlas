"""The Proof page's data (#163): what the validation tests checked, written as they run.

When `ATLAS_PROOF_OUT` names a file, the validation run writes there, for every runnable pathway, each test that
`RUNNABLE` in spec/build_map.py names for it. Each entry gives the test's kind, its outcome and the values it
compared. The file is built from `RUNNABLE`, not from whatever ran:
- a named test that didn't run is "missing", never a pass;
- a test `RUNNABLE` doesn't name isn't listed as a check.

Owner's decision on #150: Proof shows the last release's run, with its date and the R and metafor versions, and
never runs tests live.
"""

import datetime
import json
import os
import platform
import subprocess
from collections import defaultdict
from pathlib import Path
from typing import Any, Literal

import build_map as bm

OUT_ENV = "ATLAS_PROOF_OUT"
VERSION = 1

Kind = Literal["published", "by_hand", "r_code"]
KINDS: dict[str, Kind] = {
    "reference_page": "published",
    "called_by_hand": "by_hand",
    "called_directly": "r_code",
}
# how close each kind must be, in words (the tests' own tolerances)
TOLERANCE = {
    "published": "within half a unit in the last printed place",
    "by_hand": "relative difference under 1e-10 (absolute 1e-12 near zero)",
    "r_code": "relative difference under 1e-10 (absolute 1e-12 near zero)",
}

values: dict[str, list[dict[str, Any]]] = defaultdict(list)
outcomes: dict[str, str] = {}


def current_test() -> str | None:
    """The running test's node id, as `RUNNABLE` writes it."""
    running = os.environ.get("PYTEST_CURRENT_TEST")
    return running.rsplit(" (", 1)[0] if running else None


def record(quantity: str, ours: float | None, compared: float | None, passed: bool) -> None:
    """One value a validation test compared: called by the test helpers just before they assert."""
    node = current_test()
    if node is not None:
        values[node].append({"quantity": quantity, "ours": ours, "compared": compared, "passed": passed})


def kind_of(test_id: str) -> Kind:
    name = test_id.split("::", 1)[1]
    for part, kind in KINDS.items():
        if part in name:
            return kind
    raise ValueError(f"no kind of check for {test_id}")


# the data each check runs on: the BCG example, or the copy with one study that has no events in either group
DATASETS = {
    "bcg": "BCG vaccine trials",
    "double zero": "BCG vaccine trials plus one study with no events in either group",
}


def dataset_of(test_id: str) -> str:
    """The by-hand checks run on both data sets ([...-bcg], [...-double zero]); the others on the BCG trials."""
    return "double zero" if test_id.endswith("-double zero]") else "bcg"


def check_passed(check: dict[str, Any]) -> bool:
    """A check passed only if pytest says so and it compared at least one value, every one of them passed."""
    found = check["values"]
    return check["outcome"] == "passed" and bool(found) and all(v["passed"] for v in found)


def build(
    found_outcomes: dict[str, str], found_values: dict[str, list[dict[str, Any]]], run: dict[str, Any]
) -> dict[str, Any]:
    """The file's contents, from the outcomes and values one run recorded."""
    pathways = []
    for (model, method, metric), tests in bm.RUNNABLE.items():
        framework, group, datatype, outcome = bm.RUNNABLE_PREFIX
        checks = []
        for test_id in tests:
            kind = kind_of(test_id)
            dataset = dataset_of(test_id)
            checks.append(
                {
                    "test": test_id,
                    "kind": kind,
                    "dataset": dataset,
                    "dataset_label": DATASETS[dataset],
                    "outcome": found_outcomes.get(test_id, "missing"),
                    "tolerance": TOLERANCE[kind],
                    "values": found_values.get(test_id, []),
                }
            )
        status = "passed" if checks and all(check_passed(c) for c in checks) else "not passed"
        pathways.append(
            {
                "pathway": {
                    "framework": framework,
                    "group": group,
                    "datatype": datatype,
                    "outcome": outcome,
                    "model": model,
                    "method": method,
                    "metric": metric,
                },
                "status": status,
                "checks": checks,
            }
        )
    passed = sum(p["status"] == "passed" for p in pathways)
    return {"version": VERSION, "run": run, "passed": passed, "total": len(pathways), "pathways": pathways}


def run_facts(r_service_url: str | None) -> dict[str, Any]:
    """When and with what the run was made: the date, R and metafor (from the R service), Python and the commit."""
    facts: dict[str, Any] = {
        "date": datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds"),
        "python": platform.python_version(),
        "r": None,
        "metafor": None,
        "commit": _git("rev-parse", "HEAD"),
        "uncommitted_changes": bool(_git("status", "--porcelain")),
    }
    if r_service_url:
        try:
            import httpx

            health = httpx.get(f"{r_service_url}/health", timeout=5).json()
            facts["r"], facts["metafor"] = health.get("r"), health.get("metafor")
        except Exception:  # noqa: BLE001 (the file says the versions are unknown rather than failing the run)
            pass
    return facts


def _git(*args: str) -> str | None:
    try:
        done = subprocess.run(["git", *args], capture_output=True, text=True, timeout=10, check=True)
    except (OSError, subprocess.SubprocessError):
        return None
    return done.stdout.strip()


def write(path: Path, r_service_url: str | None) -> None:
    content = build(outcomes, values, run_facts(r_service_url))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(content, indent=1) + "\n", encoding="utf-8")

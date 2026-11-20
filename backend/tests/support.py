"""Helpers shared by the run tests (#148). Expected values come from spec/pathways.lock.json, read on its own."""

import json
import shutil
from pathlib import Path
from typing import Any

from app import plans
from app.config import DEFAULT_SPEC_DIR

LOCK: list[dict[str, Any]] = json.loads((DEFAULT_SPEC_DIR / "pathways.lock.json").read_text(encoding="utf-8"))
TIERS = ("framework", "group", "datatype", "outcome", "model", "method", "metric")


def is_supported(p: dict[str, Any]) -> bool:
    return (
        p["framework"] == plans.FRAMEWORK
        and p["group"] == plans.GROUP
        and p["datatype"] == plans.DATATYPE
        and p["outcome"] == plans.OUTCOME
        and p["metric"] in plans.SUPPORTED.get((p["model"], p["method"]), ())
    )


SUPPORTED_PATHWAYS = [p for p in LOCK if is_supported(p)]


def ref(p: dict[str, Any]) -> dict[str, str]:
    return {t: p[t] for t in TIERS}


def pathway(model: str, method: str, metric: str) -> dict[str, str]:
    found = [p for p in SUPPORTED_PATHWAYS if (p["model"], p["method"], p["metric"]) == (model, method, metric)]
    assert len(found) == 1
    return ref(found[0])


def make_spec(target: Path, runnable: list[dict[str, Any]]) -> Path:
    """Copy the spec to `target` with the given pathways marked runnable, as part C of #148 will in the real one."""
    for name in ("map.json", "cards.json"):
        shutil.copy(DEFAULT_SPEC_DIR / name, target / name)
    data = json.loads((target / "map.json").read_text(encoding="utf-8"))
    wanted = [ref(p) for p in runnable]
    for p in data["pathways"]:
        if ref(p) in wanted:
            p["status"] = "runnable"
    (target / "map.json").write_text(json.dumps(data), encoding="utf-8")
    return target

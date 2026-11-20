"""The Proof page's data (#163): built from RUNNABLE, never showing a pass it didn't see."""

import datetime
from collections import defaultdict
from typing import Any

import build_map as bm
import pytest

from . import proof

RUN = {"date": "2026-11-20T12:00:00+00:00", "r": "4.5.3", "metafor": "5.0.1"}
NAMED = [test for tests in bm.RUNNABLE.values() for test in tests]


def test_every_test_runnable_names_is_listed_once_and_nothing_else() -> None:
    extra = "backend/tests/test_validation.py::test_something_else"
    content = proof.build({extra: "passed"}, {extra: [{"quantity": "x"}]}, RUN)
    listed = [c["test"] for p in content["pathways"] for c in p["checks"]]
    assert sorted(listed) == sorted(NAMED)
    assert len(listed) == len(set(listed))
    assert extra not in listed
    assert content["total"] == len(bm.RUNNABLE) == 12


def test_a_check_that_did_not_run_is_missing_never_a_pass() -> None:
    content = proof.build({}, {}, RUN)
    assert content["passed"] == 0
    assert all(p["status"] == "not passed" for p in content["pathways"])
    assert {c["outcome"] for p in content["pathways"] for c in p["checks"]} == {"missing"}


PASSED_VALUE = [{"quantity": "estimate", "ours": 1.0, "compared": 1.0, "passed": True}]


def all_values() -> dict[str, list[dict[str, Any]]]:
    return {test: PASSED_VALUE for test in NAMED}


def test_all_passed() -> None:
    content = proof.build(dict.fromkeys(NAMED, "passed"), all_values(), RUN)
    assert content["passed"] == content["total"] == 12
    assert content["run"] == RUN and content["version"] == proof.VERSION


@pytest.mark.parametrize("outcome", ["failed", "error", "skipped"])
def test_one_check_not_passed_marks_its_pathway(outcome: str) -> None:
    found = dict.fromkeys(NAMED, "passed")
    found[NAMED[0]] = outcome
    content = proof.build(found, all_values(), RUN)
    assert content["passed"] == 11
    bad = [p for p in content["pathways"] if p["status"] != "passed"]
    assert len(bad) == 1 and bad[0]["checks"][0]["outcome"] == outcome


def test_each_pathway_has_its_kinds_of_check_and_the_tolerances() -> None:
    content = proof.build({}, {}, RUN)
    published = 0
    for p in content["pathways"]:
        kinds = [c["kind"] for c in p["checks"]]
        assert kinds.count("r_code") == 1 and kinds.count("by_hand") == 2
        published += "published" in kinds
        assert all(c["tolerance"] == proof.TOLERANCE[c["kind"]] for c in p["checks"])
        assert set(p["pathway"]) == {"framework", "group", "datatype", "outcome", "model", "method", "metric"}
    assert published == 4


def test_the_values_a_test_recorded_go_with_it() -> None:
    recorded: dict[str, list[dict[str, Any]]] = {
        NAMED[0]: [{"quantity": "estimate", "ours": 1.0, "compared": 1.0, "passed": True}]
    }
    content = proof.build({}, recorded, RUN)
    first = next(c for p in content["pathways"] for c in p["checks"] if c["test"] == NAMED[0])
    assert first["values"] == recorded[NAMED[0]]


def test_record_files_values_under_the_running_test(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(proof, "values", defaultdict(list))
    monkeypatch.setenv("PYTEST_CURRENT_TEST", "backend/tests/test_validation.py::test_x[a-b c] (call)")
    proof.record("estimate", -0.5, -0.5, True)
    assert proof.values == {
        "backend/tests/test_validation.py::test_x[a-b c]": [
            {"quantity": "estimate", "ours": -0.5, "compared": -0.5, "passed": True}
        ]
    }


def test_the_run_facts_say_when_and_with_what() -> None:
    facts = proof.run_facts(None)
    assert datetime.datetime.fromisoformat(facts["date"]).tzinfo is not None
    assert facts["r"] is None and facts["metafor"] is None  # no R service given: unknown, not guessed
    assert facts["commit"] is None or len(facts["commit"]) == 40


def test_every_named_test_has_a_kind() -> None:
    assert {proof.kind_of(test) for test in NAMED} == {"published", "by_hand", "r_code"}
    with pytest.raises(ValueError):
        proof.kind_of("backend/tests/test_validation.py::test_unrelated")


def test_a_pass_needs_its_values_and_every_value_passed() -> None:
    found = dict.fromkeys(NAMED, "passed")
    no_values = all_values() | {NAMED[0]: []}
    assert proof.build(found, no_values, RUN)["passed"] == 11
    one_off = all_values() | {NAMED[0]: [*PASSED_VALUE, {"quantity": "se", "ours": 1, "compared": 2, "passed": False}]}
    assert proof.build(found, one_off, RUN)["passed"] == 11


def test_each_check_says_which_data_it_ran_on() -> None:
    content = proof.build({}, {}, RUN)
    for p in content["pathways"]:
        by_hand = [c["dataset"] for c in p["checks"] if c["kind"] == "by_hand"]
        assert sorted(by_hand) == ["bcg", "double zero"]
        assert all(c["dataset"] == "bcg" for c in p["checks"] if c["kind"] != "by_hand")
        assert all(c["dataset_label"] == proof.DATASETS[c["dataset"]] for c in p["checks"])


# ---- the conftest hooks: outcomes from pytest's own reports ------------------------------------------------------


def report(nodeid: str, when: str, outcome: str) -> Any:
    from types import SimpleNamespace

    return SimpleNamespace(
        nodeid=nodeid, when=when, outcome=outcome, failed=outcome == "failed", skipped=outcome == "skipped"
    )


@pytest.mark.parametrize(
    ("reports", "expected"),
    [
        ([("setup", "passed"), ("call", "passed"), ("teardown", "passed")], "passed"),
        ([("setup", "passed"), ("call", "failed"), ("teardown", "passed")], "failed"),
        ([("setup", "failed")], "error"),
        ([("setup", "skipped")], "skipped"),
        ([("setup", "passed"), ("call", "passed"), ("teardown", "failed")], "error"),
    ],
    ids=["passed", "failed", "setup-error", "skipped", "teardown-error"],
)
def test_the_outcome_hook_never_turns_a_failure_into_a_pass(
    monkeypatch: pytest.MonkeyPatch, reports: list[tuple[str, str]], expected: str
) -> None:
    from . import conftest

    monkeypatch.setattr(proof, "outcomes", {})
    for when, outcome in reports:
        conftest.pytest_runtest_logreport(report("x::t", when, outcome))
    assert proof.outcomes == {"x::t": expected}


def test_a_new_run_removes_the_last_runs_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Any) -> None:
    from . import conftest

    old = tmp_path / "proof.json"
    old.write_text("{}", encoding="utf-8")
    monkeypatch.setenv(proof.OUT_ENV, str(old))
    conftest.pytest_sessionstart(None)  # type: ignore[arg-type]
    assert not old.exists()

"""POST /api/v1/meta-analysis/run and the plan builder (#148), without R: the R service is a recording stand-in.

Nothing is runnable in the map yet (part C of #148 changes that), so these tests copy the spec to a temporary
directory and mark the 12 pathways runnable there. The numbers are tested in test_validation.py, against R.
"""

import json
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app import plans
from app.config import DEFAULT_SPEC_DIR, Settings
from app.main import create_app, get_r_service
from app.r_service import RService

from .support import LOCK, SUPPORTED_PATHWAYS, is_supported, make_spec, pathway, ref

STUDIES: list[dict[str, Any]] = [
    {"study": "A", "ai": 4, "n1i": 123, "ci": 11, "n2i": 139},
    {"study": "B", "ai": 6, "n1i": 306, "ci": 29, "n2i": 303},
    {"study": "C", "ai": 0, "n1i": 50, "ci": 0, "n2i": 50},
]


class Recorder:
    """Stands in for the R service: records what it is sent and answers with a canned result."""

    def __init__(self, status: int = 200, body: Any = None) -> None:
        self.status = status
        self.body = body if body is not None else {"success": True, "results": self.results()}
        self.sent: list[dict[str, Any]] = []

    @staticmethod
    def results() -> dict[str, Any]:
        summary = dict.fromkeys(plans.SUMMARY_KEYS)
        summary.update(estimate=-0.5, ci_lower=-1.0, ci_upper=0.0, pi_lower=None, k=2)
        studies = [
            {"study": "A", "yi": -0.1, "vi": 0.2, "weight": 60.0, "used": True},
            {"study": "B", "yi": -0.2, "vi": 0.3, "weight": 40.0, "used": True},
            {"study": "C", "yi": None, "vi": None, "weight": None, "used": False},
        ]
        return {"summary": summary, "studies": studies}

    def __call__(self, request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/execute"
        self.sent.append(json.loads(request.content))
        return httpx.Response(self.status, json=self.body)


def client(spec: Path, recorder: Recorder | None = None) -> TestClient:
    app = create_app(Settings(spec_dir=spec, r_service_url="http://r"))
    service = RService("http://r", transport=httpx.MockTransport(recorder or Recorder()))
    app.dependency_overrides[get_r_service] = lambda: service
    return TestClient(app)


def body(path: dict[str, str], **extra: Any) -> dict[str, Any]:
    return {"pathway": path, "data": STUDIES, **extra}


def test_the_builder_covers_exactly_the_twelve_pathways_the_map_lists() -> None:
    # the map's two-group binary IV, MH and Peto pathways, counted from the lock on its own
    expected = [
        p
        for p in LOCK
        if p["framework"] == plans.FRAMEWORK
        and p["group"] == plans.GROUP
        and p["datatype"] == plans.DATATYPE
        and p["outcome"] == plans.OUTCOME
        and p["method"] in ("IV", "MH", "PETO")
    ]
    assert len(SUPPORTED_PATHWAYS) == len(expected) == 12


@pytest.mark.parametrize("p", SUPPORTED_PATHWAYS, ids=lambda p: f"{p['model']}-{p['method']}-{p['metric']}")
def test_every_supported_pathway_gets_a_plan_the_service_would_run(runnable_spec: Path, p: dict[str, Any]) -> None:
    recorder = Recorder()
    response = client(runnable_spec, recorder).post("/api/v1/meta-analysis/run", json=body(ref(p)))
    assert response.status_code == 200, response.text
    plan = recorder.sent[0]["plan"]
    model = plan["model"]
    if p["method"] == "IV":
        effect = plan["effect"]
        assert (effect["fn"], effect["args"]["measure"]) == ("escalc", p["metric"])
        # double-zero studies are dropped for the ratios and kept for RD and AS (decision 0019)
        assert effect["args"].get("drop00") is (True if p["metric"] in ("OR", "RR") else None)
        assert model["fn"] == "rma.uni"
        assert model["args"]["method"] == ("EE" if p["model"] == plans.COMMON else "REML")
        assert model["args"]["test"] == "z"
    else:
        assert "effect" not in plan
        assert model["fn"] == {"MH": "rma.mh", "PETO": "rma.peto"}[p["method"]]
        assert ("measure" in model["args"]) == (p["method"] == "MH")
        assert "drop00" not in model["args"]  # the function's own default
    assert model["args"]["level"] == 95.0
    assert "post" not in plan
    assert recorder.sent[0]["data"]["ai"] == [4, 6, 0]
    assert recorder.sent[0]["data"]["study"] == ["A", "B", "C"]


def test_random_effects_options_reach_the_plan(runnable_spec: Path) -> None:
    recorder = Recorder()
    options = {"estimator": "DL", "interval": "knha", "level": 90}
    path = pathway(plans.RANDOM, "IV", "RR")
    response = client(runnable_spec, recorder).post("/api/v1/meta-analysis/run", json=body(path, options=options))
    assert response.status_code == 200
    args = recorder.sent[0]["plan"]["model"]["args"]
    assert (args["method"], args["test"], args["level"]) == ("DL", "knha", 90)
    assert response.json()["options"] == options
    assert 'method = "DL", test = "knha", level = 90.0' in response.json()["r_code"]


@pytest.mark.parametrize(
    ("analysis", "step"), [("cumulative", "cumul"), ("leave-one-out", "leave1out")], ids=["cumulative", "loo"]
)
def test_an_analysis_type_adds_its_post_step(runnable_spec: Path, analysis: str, step: str) -> None:
    recorder = Recorder()
    path = pathway(plans.COMMON, "MH", "OR")
    response = client(runnable_spec, recorder).post(
        "/api/v1/meta-analysis/run", json=body(path, analysis_type=analysis)
    )
    assert response.status_code == 200
    assert recorder.sent[0]["plan"]["post"] == {"fn": step}
    assert f"steps <- {step}(fit)\nprint(steps)" in response.json()["r_code"]


def test_the_answer_has_ratio_scale_left_out_studies_and_the_code(runnable_spec: Path) -> None:
    result = client(runnable_spec).post("/api/v1/meta-analysis/run", json=body(pathway(plans.COMMON, "IV", "OR")))
    out = result.json()
    assert out["summary"]["estimate"] == -0.5
    assert out["ratio_scale"]["estimate"] == pytest.approx(0.6065306597126334)
    assert out["ratio_scale"]["pi_lower"] is None
    assert out["left_out"] == ["C"]
    assert out["steps"] is None
    code = out["r_code"]
    assert 'dat <- escalc(measure = "OR", ai = ai, n1i = n1i, ci = ci, n2i = n2i, slab = study, drop00 = TRUE' in code
    assert 'fit <- rma.uni(yi = yi, vi = vi, slab = study, method = "EE", test = "z", level = 95.0, data = dat)' in code
    assert 'study = c("A", "B", "C")' in code and "ai = c(4, 6, 0)" in code
    assert "pred <- predict(fit, transf = exp)" in code


def test_a_difference_has_no_ratio_scale(runnable_spec: Path) -> None:
    out = client(runnable_spec).post("/api/v1/meta-analysis/run", json=body(pathway(plans.COMMON, "IV", "RD"))).json()
    assert out["ratio_scale"] is None
    assert "drop00" not in out["r_code"]
    assert "transf" not in out["r_code"]


def test_study_labels_are_written_as_r_strings() -> None:
    nasty = 'A "quoted"\\ label\nwith a newline'
    columns: dict[str, list[Any]] = {
        "study": [nasty, "B"],
        "ai": [1, 2],
        "n1i": [10, 10],
        "ci": [3, 4],
        "n2i": [10, 10],
    }
    code = plans.render_r_code({"model": {"fn": "rma.peto", "args": {}}}, columns, "PETO")
    assert 'study = c("A \\"quoted\\"\\\\ label\\nwith a newline", "B")' in code


def test_a_pathway_the_map_does_not_have_is_a_422(runnable_spec: Path) -> None:
    path = pathway(plans.COMMON, "IV", "OR") | {"metric": "NOPE"}
    response = client(runnable_spec).post("/api/v1/meta-analysis/run", json=body(path))
    assert response.status_code == 422
    assert response.json()["code"] == "unknown_pathway"


def test_a_pathway_that_is_not_runnable_is_a_409_with_its_status_and_milestone() -> None:
    # the real spec: the first planned pathway that isn't one of the 12 (the one-group IV pathways come first)
    other = next(p for p in LOCK if p["status"] == "planned")
    response = client(DEFAULT_SPEC_DIR).post("/api/v1/meta-analysis/run", json=body(ref(other)))
    assert response.status_code == 409
    out = response.json()
    assert out["code"] == "pathway_not_runnable"
    assert out["details"] == {"status": "planned", "milestone": other["milestone"]}


def test_a_runnable_pathway_without_a_plan_is_a_501(tmp_path: Path) -> None:
    other = next(p for p in LOCK if not is_supported(p))
    response = client(make_spec(tmp_path, [other])).post("/api/v1/meta-analysis/run", json=body(ref(other)))
    assert response.status_code == 501
    assert response.json()["code"] == "pathway_not_implemented"


def error_paths(runnable_spec: Path, **request: Any) -> list[str]:
    path = pathway(plans.COMMON, "IV", "OR")
    payload = {"pathway": path, "data": STUDIES} | request
    response = client(runnable_spec).post("/api/v1/meta-analysis/run", json=payload)
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "invalid_data"
    return [f["path"] for f in response.json()["fields"]]


def test_the_study_table_is_checked_with_field_paths(runnable_spec: Path) -> None:
    rows: list[dict[str, Any]] = [
        {"study": "A", "ai": 4, "n1i": 100, "ci": 11, "n2i": 100},
        {"study": "B", "ai": 101, "n1i": 100, "ci": 1.5, "n2i": 100},  # more events than people; not whole
        {"study": "A", "ai": -1, "n1i": 0, "ci": "x", "n2i": 100},  # a repeated label; negative; no people; text
        {"study": "D", "ai": True, "n1i": 10},  # a boolean; ci and n2i missing
    ]
    # field problems row by row, then the range checks (events above the total, a total of 0)
    assert error_paths(runnable_spec, data=rows) == [
        "data.1.ci",
        "data.2.study",
        "data.2.ai",
        "data.2.ci",
        "data.3.ai",
        "data.3.ci",
        "data.3.n2i",
        "data.1.ai",
        "data.2.n1i",
    ]


def test_at_least_two_studies_are_needed(runnable_spec: Path) -> None:
    assert error_paths(runnable_spec, data=STUDIES[:1]) == ["data"]
    assert error_paths(runnable_spec, data=[]) == ["data"]


def test_whole_numbers_may_arrive_as_json_floats(runnable_spec: Path) -> None:
    rows = [{**r, "ai": float(r["ai"])} for r in STUDIES]
    path = pathway(plans.COMMON, "IV", "OR")
    assert client(runnable_spec).post("/api/v1/meta-analysis/run", json=body(path) | {"data": rows}).status_code == 200


def test_options_that_do_not_apply_are_refused_with_their_paths(runnable_spec: Path) -> None:
    for path in (
        pathway(plans.COMMON, "IV", "OR"),
        pathway(plans.COMMON, "MH", "OR"),
        pathway(plans.COMMON, "PETO", "PETO"),
    ):
        response = client(runnable_spec).post(
            "/api/v1/meta-analysis/run", json=body(path, options={"estimator": "DL", "interval": "knha"})
        )
        assert response.status_code == 422
        assert response.json()["code"] == "invalid_option"
        assert [f["path"] for f in response.json()["fields"]] == ["options.estimator", "options.interval"]


def test_an_analysis_type_the_method_lacks_is_refused(runnable_spec: Path) -> None:
    # subgroup is in the map for IV, but this builder only runs the analyses with no moderators
    path = pathway(plans.RANDOM, "IV", "OR")
    response = client(runnable_spec).post("/api/v1/meta-analysis/run", json=body(path, analysis_type="subgroup"))
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_request"  # not one of the three analysis types the API accepts


@pytest.mark.parametrize(
    "extra",
    [{"options": {"level": 100}}, {"options": {"estimator": "XX"}}, {"options": {"zero_cells": "add"}}, {"x": 1}],
)
def test_an_unknown_or_invalid_field_is_an_invalid_request(runnable_spec: Path, extra: dict[str, Any]) -> None:
    path = pathway(plans.RANDOM, "IV", "OR")
    response = client(runnable_spec).post("/api/v1/meta-analysis/run", json=body(path) | extra)
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_request"


@pytest.mark.parametrize(
    ("status", "answer", "http", "code"),
    [
        (422, {"success": False, "error": "Fisher scoring did not converge", "kind": "r"}, 422, "analysis_failed"),
        (400, {"success": False, "error": "x is not allowed", "kind": "plan"}, 502, "r_service_error"),
        (200, {"success": True}, 502, "r_service_error"),
        (500, "<html>", 502, "r_service_error"),
    ],
)
def test_the_r_services_answers_become_stable_errors(
    runnable_spec: Path, status: int, answer: Any, http: int, code: str
) -> None:
    path = pathway(plans.RANDOM, "IV", "OR")
    response = client(runnable_spec, Recorder(status, answer)).post("/api/v1/meta-analysis/run", json=body(path))
    assert response.status_code == http
    assert response.json()["code"] == code
    if code == "analysis_failed":
        assert "Fisher scoring did not converge" in response.json()["message"]
    else:
        assert "not allowed" not in response.text  # the service's own text stays in the log


def test_an_r_service_that_does_not_answer_is_a_502(runnable_spec: Path) -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    app = create_app(Settings(spec_dir=runnable_spec, r_service_url="http://r"))
    app.dependency_overrides[get_r_service] = lambda: RService("http://r", transport=httpx.MockTransport(refuse))
    response = TestClient(app).post("/api/v1/meta-analysis/run", json=body(pathway(plans.RANDOM, "IV", "OR")))
    assert response.status_code == 502
    assert response.json()["code"] == "r_service_unavailable"


def test_the_maps_runnable_pathways_are_the_ones_the_builder_has_plans_for() -> None:
    """The real map, not the temporary copy: what it calls runnable, /run can run (part C of #148)."""
    runnable = [ref(p) for p in LOCK if p["status"] == "runnable"]
    assert runnable == [ref(p) for p in SUPPORTED_PATHWAYS]
    response = client(DEFAULT_SPEC_DIR).post("/api/v1/meta-analysis/run", json=body(runnable[0]))
    assert response.status_code == 200, response.text

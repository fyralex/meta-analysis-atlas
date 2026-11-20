"""The funnel plot's data and caption (#161; decision 0020), without R: the R service is a stand-in."""

import json
import math
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app import plans
from app.config import DEFAULT_SPEC_DIR, Settings
from app.funnel import funnel
from app.main import create_app, get_r_service
from app.r_service import RService

from .support import SUPPORTED_PATHWAYS, pathway, ref

SOURCES: dict[str, Any] = json.loads((DEFAULT_SPEC_DIR / "map.json").read_text(encoding="utf-8"))["sources"]
DATA = [
    {"study": "A", "ai": 4, "n1i": 123, "ci": 11, "n2i": 139},
    {"study": "B", "ai": 6, "n1i": 306, "ci": 29, "n2i": 303},
    {"study": "C", "ai": 0, "n1i": 50, "ci": 0, "n2i": 50},
]
MAIN, COMMON_EFFECT = -0.5, -0.3


def pid(p: dict[str, Any]) -> str:
    return f"{p['model']}-{p['method']}-{p['metric']}"


class TwoAnswers:
    """The main fit answers with estimate MAIN; a common-effect-only plan (outputs: estimate) with COMMON_EFFECT."""

    def __init__(self) -> None:
        self.plans: list[dict[str, Any]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        plan = json.loads(request.content)["plan"]
        self.plans.append(plan)
        summary = dict.fromkeys(plans.SUMMARY_KEYS)
        if plan.get("outputs") == ["estimate"]:
            return httpx.Response(
                200, json={"success": True, "results": {"summary": {"estimate": COMMON_EFFECT}, "studies": []}}
            )
        summary.update(estimate=MAIN, ci_lower=-1.0, ci_upper=0.0, k=2)
        studies = [
            {"study": "A", "yi": -0.8, "vi": 0.25, "weight": 60.0, "used": True},
            {"study": "B", "yi": -0.2, "vi": 0.04, "weight": 40.0, "used": True},
            {"study": "C", "yi": None, "vi": None, "weight": None, "used": False},
        ]
        return httpx.Response(200, json={"success": True, "results": {"summary": summary, "studies": studies}})


def run(path: dict[str, str]) -> tuple[dict[str, Any], TwoAnswers]:
    answers = TwoAnswers()
    app = create_app(Settings(spec_dir=DEFAULT_SPEC_DIR, r_service_url="http://r"))
    app.dependency_overrides[get_r_service] = lambda: RService("http://r", transport=httpx.MockTransport(answers))
    response = TestClient(app).post("/api/v1/meta-analysis/run", json={"pathway": path, "data": DATA})
    assert response.status_code == 200, response.text
    out: dict[str, Any] = response.json()
    return out, answers


@pytest.mark.parametrize("p", SUPPORTED_PATHWAYS, ids=pid)
def test_the_centre_is_the_common_effect_estimate(p: dict[str, Any]) -> None:
    out, answers = run(ref(p))
    shape = out["funnel"]
    if p["model"] == plans.RANDOM:
        # a second fit, the same data and effect step, with a common effect and nothing else
        assert len(answers.plans) == 2
        main, ce = answers.plans
        assert ce["effect"] == main["effect"]
        assert ce["model"]["args"] == {**main["model"]["args"], "method": "EE", "test": "z"}
        assert "post" not in ce and ce["outputs"] == ["estimate"]
        assert shape["centre"] == COMMON_EFFECT
        assert 'ce <- rma.uni(yi = yi, vi = vi, slab = study, method = "EE", test = "z"' in out["r_code"]
        assert "funnel(ce, level = 95)" in out["r_code"]
    else:
        assert len(answers.plans) == 1
        assert shape["centre"] == MAIN
        assert "funnel(fit, level = 95)" in out["r_code"] and "ce <-" not in out["r_code"]
    assert shape["centre_model"] == "Common effect"
    assert shape["level"] == 95 and shape["z"] == pytest.approx(1.959963984540054)
    assert shape["log_scale"] == (p["metric"] in ("OR", "RR", "PETO"))


def test_the_points_are_the_studies_used_with_their_standard_errors() -> None:
    out, _ = run(pathway(plans.COMMON, "IV", "OR"))
    assert out["funnel"]["points"] == [{"study": "A", "yi": -0.8, "sei": 0.5}, {"study": "B", "yi": -0.2, "sei": 0.2}]


def test_cumulative_and_leave_one_out_have_the_same_funnel() -> None:
    answers = TwoAnswers()
    app = create_app(Settings(spec_dir=DEFAULT_SPEC_DIR, r_service_url="http://r"))
    app.dependency_overrides[get_r_service] = lambda: RService("http://r", transport=httpx.MockTransport(answers))
    body = {"pathway": pathway(plans.RANDOM, "IV", "RR"), "data": DATA, "analysis_type": "cumulative"}
    out = TestClient(app).post("/api/v1/meta-analysis/run", json=body).json()
    assert out["funnel"]["centre"] == COMMON_EFFECT
    assert "post" in answers.plans[0] and "post" not in answers.plans[1]


def studies(k: int) -> list[tuple[str, float | None, float | None, bool]]:
    return [(f"S{i}", -0.1 * i, 0.01 * (i + 1), True) for i in range(k)]


@pytest.mark.parametrize("metric", ["OR", "RR", "PETO", "RD", "AS"])
def test_the_caption_says_what_the_handbook_says(metric: str) -> None:
    odds = metric in ("OR", "PETO")
    shape = funnel(centre=0.0, ratio=metric in ("OR", "RR", "PETO"), odds=odds, studies=studies(12))
    text = shape.caption
    assert "around the common-effect estimate" in text
    assert "Asymmetry does not by itself show publication bias" in text
    assert ("For odds ratios, the estimate and its standard error are related" in text) == odds
    assert "No test for asymmetry is run here." in text
    assert "significan" not in text.lower()
    for source in shape.sources:
        assert source.key in SOURCES, source
    assert {s.section for s in shape.sources} == {"13.3.4.2", "13.3.4.3", "13.3.4.5"}


def test_fewer_than_ten_studies_says_tests_are_not_recommended() -> None:
    shape = funnel(centre=0.0, ratio=True, odds=False, studies=studies(9))
    assert "With fewer than 10 studies, tests for asymmetry are not recommended; none is run here." in shape.caption
    assert "13.3.4.4" in {s.section for s in shape.sources}
    assert "13.3.4.4" not in {
        s.section for s in funnel(centre=0.0, ratio=True, odds=False, studies=studies(10)).sources
    }


def test_studies_left_out_or_without_an_estimate_are_not_points() -> None:
    rows = [("A", -0.1, 0.04, True), ("B", None, None, False), ("C", 0.2, 0.09, False), ("D", None, 0.1, True)]
    shape = funnel(centre=0.0, ratio=False, odds=False, studies=rows)
    assert [(p.study, p.sei) for p in shape.points] == [("A", math.sqrt(0.04))]

"""The interpretation sentence (#160): one per metric and model, with and without labels."""

import json
import math
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app import plans
from app.config import DEFAULT_SPEC_DIR, Settings
from app.interpretation import Labels, sentence
from app.main import create_app, get_r_service
from app.r_service import RService

from .support import SUPPORTED_PATHWAYS, pathway

SOURCES: dict[str, Any] = json.loads((DEFAULT_SPEC_DIR / "map.json").read_text(encoding="utf-8"))["sources"]
LABELS = Labels(outcome="tuberculosis", treatment="vaccinated", control="unvaccinated")
# a value on the scale each metric is read on: the ratio itself, or the difference
VALUES = {"OR": (0.48, 0.33, 0.68), "RR": (0.49, 0.34, 0.70), "PETO": (0.62, 0.57, 0.67)}
VALUES |= {"RD": (-0.0252, -0.0464, -0.0039), "AS": (-0.058, -0.0936, -0.0224)}


def pid(p: dict[str, Any]) -> str:
    return f"{p['model']}-{p['method']}-{p['metric']}"


def make(p: dict[str, Any], labels: Labels | None = None, k: int = 13) -> str:
    estimate, lower, upper = VALUES[p["metric"]]
    out = sentence(
        metric=p["metric"],
        model=p["model"],
        k=k,
        level=95.0,
        estimate=estimate,
        lower=lower,
        upper=upper,
        labels=labels,
    )
    for ref in out.sources:
        assert ref.key in SOURCES, ref
    return out.text


@pytest.mark.parametrize("labelled", [False, True], ids=["plain", "labelled"])
@pytest.mark.parametrize("p", SUPPORTED_PATHWAYS, ids=pid)
def test_every_metric_and_model_has_its_sentence(p: dict[str, Any], labelled: bool) -> None:
    text = make(p, LABELS if labelled else None)
    if p["model"] == plans.RANDOM:
        assert text.startswith("On average across the 13 studies,")
        assert text.endswith("This is the average of effects that may differ between studies, not one shared effect.")
    else:
        assert text.startswith("Assuming one effect shared by all 13 studies,")
        assert "average of effects" not in text
    assert "95% CI" in text
    if labelled:
        assert "of tuberculosis" in text and "vaccinated groups" in text and "unvaccinated groups" in text
        assert "treatment" not in text and "control" not in text
    else:
        assert "treatment groups" in text and "control groups" in text
    assert "significan" not in text.lower()


def test_the_risk_ratio_sentence_reads_as_the_issue_describes() -> None:
    p = next(x for x in SUPPORTED_PATHWAYS if (x["model"], x["metric"]) == (plans.RANDOM, "RR"))
    assert make(p) == (
        "On average across the 13 studies, the risk in the treatment groups was 0.49 times the risk in the control"
        " groups (95% CI 0.34 to 0.70). This is the average of effects that may differ between studies, not one"
        " shared effect."
    )
    assert make(p, LABELS).startswith(
        "On average across the 13 studies, the risk of tuberculosis in the vaccinated groups was 0.49 times the risk"
        " in the unvaccinated groups"
    )


def test_odds_ratios_are_not_read_as_risk_ratios() -> None:
    for metric in ("OR", "PETO"):
        text = make({"metric": metric, "model": plans.COMMON})
        assert (
            "the odds in the treatment groups were 0.48" in text or "the odds in the treatment groups were 0.62" in text
        )
        assert "Odds are not risks, so this is not a risk ratio" in text
    assert "Peto's method gives an approximation" in make({"metric": "PETO", "model": plans.COMMON})
    assert "Peto" not in make({"metric": "OR", "model": plans.COMMON})


@pytest.mark.parametrize(
    ("estimate", "words"),
    [
        (-0.0252, "was 2.5 percentage points lower than the risk"),
        (0.031, "was 3.1 percentage points higher than the risk"),
        (0.0004, "differed by less than 0.05 percentage points from the risk"),
    ],
)
def test_a_risk_difference_is_in_percentage_points_with_its_direction(estimate: float, words: str) -> None:
    out = sentence(metric="RD", model=plans.COMMON, k=5, level=90, estimate=estimate, lower=-0.05, upper=0.06)
    assert words in out.text
    assert "(90% CI −5.0 to 6.0 percentage points)" in out.text


def test_negative_numbers_use_a_true_minus_and_zero_has_no_sign() -> None:
    out = sentence(metric="AS", model=plans.RANDOM, k=3, level=95, estimate=-0.058, lower=-0.0001, upper=0.002)
    assert "was −0.058 (95% CI 0.000 to 0.002)" in out.text


def test_one_study_is_neither_shared_nor_averaged() -> None:
    for model in (plans.COMMON, plans.RANDOM):
        out = sentence(metric="RR", model=model, k=1, level=95, estimate=0.5, lower=0.2, upper=1.2)
        assert out.text.startswith("From the 1 study used, the risk")
        assert "average" not in out.text and "shared" not in out.text


def test_labels_are_plain_text_with_whitespace_collapsed() -> None:
    labels = Labels(outcome="  severe   <b>disease</b> ", treatment="drug  A", control=" ")
    text = sentence(metric="RR", model=plans.COMMON, k=2, level=95, estimate=0.5, lower=0.2, upper=1.2, labels=labels)
    assert "the risk of severe <b>disease</b> in the drug A groups" in text.text
    assert "the control groups" in text.text  # a blank label falls back to the default word


# ---- through /run ------------------------------------------------------------------------------------------------


def run(body: dict[str, Any]) -> Any:
    def answer(request: httpx.Request) -> httpx.Response:
        summary = dict.fromkeys(plans.SUMMARY_KEYS)
        summary.update(estimate=-0.5, ci_lower=-1.0, ci_upper=0.0, k=3)
        studies = [
            {"study": "A", "yi": -0.1, "vi": 0.2, "weight": 60.0, "used": True},
            {"study": "B", "yi": -0.2, "vi": 0.3, "weight": 40.0, "used": True},
            {"study": "C", "yi": None, "vi": None, "weight": None, "used": False},
        ]
        return httpx.Response(200, json={"success": True, "results": {"summary": summary, "studies": studies}})

    app = create_app(Settings(spec_dir=DEFAULT_SPEC_DIR, r_service_url="http://r"))
    app.dependency_overrides[get_r_service] = lambda: RService("http://r", transport=httpx.MockTransport(answer))
    data = [
        {"study": "A", "ai": 4, "n1i": 123, "ci": 11, "n2i": 139},
        {"study": "B", "ai": 6, "n1i": 306, "ci": 29, "n2i": 303},
        {"study": "C", "ai": 0, "n1i": 50, "ci": 0, "n2i": 50},
    ]
    return TestClient(app).post("/api/v1/meta-analysis/run", json={"data": data, **body})


def test_run_gives_the_sentence_on_the_ratio_scale_counting_only_studies_used() -> None:
    out = run({"pathway": pathway(plans.COMMON, "IV", "OR"), "labels": {"outcome": "death"}}).json()
    text = out["interpretation"]["text"]
    assert text.startswith("Assuming one effect shared by all 2 studies, the odds of death in the treatment groups")
    assert f"were {math.exp(-0.5):.2f} times" in text
    assert f"(95% CI {math.exp(-1.0):.2f} to 1.00)" in text
    assert {s["key"] for s in out["interpretation"]["sources"]} == {"CH-6", "CH-10"}


@pytest.mark.parametrize(
    "labels",
    [{"outcome": "two\nlines"}, {"treatment": "x" * 41}, {"colour": "red"}],
    ids=["newline", "too-long", "unknown-field"],
)
def test_bad_labels_are_an_invalid_request(labels: dict[str, str]) -> None:
    response = run({"pathway": pathway(plans.COMMON, "IV", "OR"), "labels": labels})
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_request"

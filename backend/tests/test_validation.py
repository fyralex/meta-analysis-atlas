"""Validation of POST /api/v1/meta-analysis/run against metafor (#148; CLAUDE.md rule 6).

These tests call the running R service (R_SERVICE_URL; scripts/check.sh starts one) and run with
`pytest -m integration`. Two kinds of check, on the BCG vaccine trials (`dat.bcg` in metadat, the data metafor's
reference pages use):

1. **Against metafor run directly.** Each result from /run is compared with the R code the response shows, run
   through Rscript on the same data. They are the same computation, so the tolerance is 1e-10 relative (absolute
   1e-12 near zero): anything larger is a bug, not rounding.
2. **Against published values.** metafor's reference pages print the results of these calls, rounded to 4 decimals
   (2 for I^2); each is compared to half a unit in its last printed place.
   - rma.uni, first example (REML, log risk ratios): https://wviechtb.github.io/metafor/reference/rma.uni.html
   - rma.mh, odds ratios and risk ratios: https://wviechtb.github.io/metafor/reference/rma.mh.html
   - rma.peto: https://wviechtb.github.io/metafor/reference/rma.peto.html
   The reference pages give no published output for the other pathways, so the others are checked by 1 only.
"""

import json
import os
import subprocess
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import plans
from app.config import Settings
from app.main import create_app

from .support import SUPPORTED_PATHWAYS, pathway, ref

pytestmark = pytest.mark.integration

REL = 1e-10
ABS = 1e-12
RUN = "/api/v1/meta-analysis/run"


@pytest.fixture(scope="module")
def client(runnable_spec: Path) -> TestClient:
    url = os.environ.get("R_SERVICE_URL")
    if not url:
        pytest.fail("R_SERVICE_URL is not set: run these through scripts/check.sh, or start r_service/run.R first.")
    return TestClient(create_app(Settings(spec_dir=runnable_spec, r_service_url=url)))


def rscript(code: str, tmp_path: Path) -> Any:
    """Run R code that ends by printing one JSON value, and return it."""
    script = tmp_path / "check.R"
    script.write_text(code, encoding="utf-8")
    done = subprocess.run(["Rscript", str(script)], capture_output=True, text=True, timeout=180, check=False)
    assert done.returncode == 0, done.stderr
    return json.loads(done.stdout.strip().splitlines()[-1])


@pytest.fixture(scope="module")
def bcg(tmp_path_factory: pytest.TempPathFactory) -> list[dict[str, Any]]:
    """The 13 BCG trials as study rows, read from metadat itself, not typed here."""
    code = (
        "d <- metadat::dat.bcg\n"
        "rows <- data.frame(study = as.character(d$trial), ai = d$tpos, n1i = d$tpos + d$tneg,"
        " ci = d$cpos, n2i = d$cpos + d$cneg)\n"
        "cat(jsonlite::toJSON(rows, dataframe = 'rows', auto_unbox = TRUE))\n"
    )
    rows: list[dict[str, Any]] = rscript(code, tmp_path_factory.mktemp("bcg"))
    assert len(rows) == 13
    return rows


# What the shown R code is asked to report, named as the response names it. A value metafor doesn't have is null.
EXTRACT = """
n <- function(x) if (is.null(x)) NA else unname(x[[1]])
out <- list(
  estimate = n(fit$b), se = n(fit$se), ci_lower = n(fit$ci.lb), ci_upper = n(fit$ci.ub), zval = n(fit$zval),
  pval = n(fit$pval), tau2 = n(fit$tau2), i2 = n(fit$I2), h2 = n(fit$H2), q = n(fit$QE), q_pval = n(fit$QEp),
  k = n(fit$k)
)
if (exists("pred")) {
  out$ratio_estimate <- n(pred$pred)
  out$ratio_ci_lower <- n(pred$ci.lb)
  out$ratio_ci_upper <- n(pred$ci.ub)
  out$pi_lower <- n(pred$pi.lb)
  out$pi_upper <- n(pred$pi.ub)
}
if (exists("steps")) out$steps_estimate <- as.numeric(steps$estimate)
cat(jsonlite::toJSON(out, digits = NA, auto_unbox = TRUE, na = "null"))
"""


def run(client: TestClient, path: dict[str, str], rows: list[dict[str, Any]], **extra: Any) -> dict[str, Any]:
    response = client.post(RUN, json={"pathway": path, "data": rows, **extra})
    assert response.status_code == 200, response.text
    out: dict[str, Any] = response.json()
    return out


def close(got: float | None, want: float | None, what: str) -> None:
    if want is None:
        assert got is None, f"{what}: the service gave {got}, metafor has no value"
        return
    assert got is not None, f"{what}: the service gave no value, metafor gave {want}"
    assert got == pytest.approx(want, rel=REL, abs=ABS), what


def assert_matches_r(out: dict[str, Any], tmp_path: Path) -> None:
    """Every number in the response equals what its own R code gives."""
    direct = rscript(out["r_code"] + EXTRACT, tmp_path)
    for key, want in direct.items():
        if key in ("ratio_estimate", "ratio_ci_lower", "ratio_ci_upper"):
            close(out["ratio_scale"][key.removeprefix("ratio_")], want, key)
        elif key in ("pi_lower", "pi_upper"):
            # on the ratio scale for ratios; for a difference there is no `pred` and no key here
            close(out["ratio_scale"][key], want, key)
        elif key == "steps_estimate":
            assert [s["estimate"] for s in out["steps"]] == pytest.approx(want, rel=REL, abs=ABS)
        else:
            close(out["summary"][key], want, key)


def pid(p: dict[str, Any]) -> str:
    return f"{p['model']}-{p['method']}-{p['metric']}"


@pytest.mark.parametrize("p", SUPPORTED_PATHWAYS, ids=pid)
def test_every_pathway_equals_metafor_called_directly(
    client: TestClient, bcg: list[dict[str, Any]], p: dict[str, Any], tmp_path: Path
) -> None:
    out = run(client, ref(p), bcg)
    assert out["summary"]["k"] == 13
    assert out["left_out"] == []
    assert_matches_r(out, tmp_path)


@pytest.mark.parametrize("analysis", ["cumulative", "leave-one-out"])
@pytest.mark.parametrize(
    ("model", "method", "metric"),
    [
        (plans.RANDOM, "IV", "RR"),
        (plans.COMMON, "IV", "OR"),
        (plans.COMMON, "MH", "RD"),
        (plans.COMMON, "PETO", "PETO"),
    ],
)
def test_cumulative_and_leave_one_out_equal_metafor(
    client: TestClient, bcg: list[dict[str, Any]], tmp_path: Path, model: str, method: str, metric: str, analysis: str
) -> None:
    out = run(client, pathway(model, method, metric), bcg, analysis_type=analysis)
    assert len(out["steps"]) == 13
    assert_matches_r(out, tmp_path)


@pytest.mark.parametrize("estimator", ["DL", "HE", "HS", "HSk", "SJ", "ML", "REML", "EB", "PM", "PMM"])
@pytest.mark.parametrize("interval", ["z", "knha"])
def test_every_estimator_and_interval_equals_metafor(
    client: TestClient, bcg: list[dict[str, Any]], tmp_path: Path, estimator: str, interval: str
) -> None:
    options = {"estimator": estimator, "interval": interval, "level": 90}
    out = run(client, pathway(plans.RANDOM, "IV", "RR"), bcg, options=options)
    assert out["options"] == options
    assert_matches_r(out, tmp_path)


# ---- published values ----------------------------------------------------------------------------------------------


def half_unit(places: int) -> float:
    return 0.5 * 10.0**-places


def test_random_effects_risk_ratio_reproduces_the_rma_uni_reference_page(
    client: TestClient, bcg: list[dict[str, Any]]
) -> None:
    # rma.uni, first example: log risk ratios, REML. estimate -0.7145, se 0.1798, zval -3.9744,
    # ci -1.0669 to -0.3622, tau^2 0.3132, I^2 92.22%, Q(df = 12) = 152.2330.
    s = run(client, pathway(plans.RANDOM, "IV", "RR"), bcg)["summary"]
    want = {
        "estimate": -0.7145,
        "se": 0.1798,
        "zval": -3.9744,
        "ci_lower": -1.0669,
        "ci_upper": -0.3622,
        "tau2": 0.3132,
        "q": 152.2330,
    }
    for key, value in want.items():
        assert s[key] == pytest.approx(value, abs=half_unit(4)), key
    assert s["i2"] == pytest.approx(92.22, abs=half_unit(2))


@pytest.mark.parametrize(
    ("metric", "published"),
    [
        # rma.mh: log odds ratios. Q(df = 12) = 163.9426, I^2 92.68%; OR scale 0.6229 (0.5748, 0.6750)
        (
            "OR",
            {
                "estimate": -0.4734,
                "se": 0.0410,
                "zval": -11.5444,
                "ci_lower": -0.5538,
                "ci_upper": -0.3930,
                "q": 163.9426,
            },
        ),
        # rma.mh: log risk ratios. Q(df = 12) = 152.5676, I^2 92.13%; RR scale 0.6353 (0.5881, 0.6862)
        (
            "RR",
            {
                "estimate": -0.4537,
                "se": 0.0393,
                "zval": -11.5338,
                "ci_lower": -0.5308,
                "ci_upper": -0.3766,
                "q": 152.5676,
            },
        ),
    ],
)
def test_mantel_haenszel_reproduces_the_rma_mh_reference_page(
    client: TestClient, bcg: list[dict[str, Any]], metric: str, published: dict[str, float]
) -> None:
    out = run(client, pathway(plans.COMMON, "MH", metric), bcg)
    for key, value in published.items():
        assert out["summary"][key] == pytest.approx(value, abs=half_unit(4)), key
    scale = {"OR": (0.6229, 0.5748, 0.6750), "RR": (0.6353, 0.5881, 0.6862)}[metric]
    got = out["ratio_scale"]
    for value, key in zip(scale, ("estimate", "ci_lower", "ci_upper"), strict=True):
        assert got[key] == pytest.approx(value, abs=half_unit(4)), key
    assert out["summary"]["i2"] == pytest.approx({"OR": 92.68, "RR": 92.13}[metric], abs=half_unit(2))
    assert out["summary"]["tau2"] == 0  # metafor reports no between-study variance as 0


def test_peto_reproduces_the_rma_peto_reference_page(client: TestClient, bcg: list[dict[str, Any]]) -> None:
    # rma.peto: log odds ratios. estimate -0.4744, se 0.0407, zval -11.6689, ci -0.5541 to -0.3948,
    # Q(df = 12) = 167.7302, I^2 92.85%; OR scale 0.6222 (0.5746, 0.6738).
    out = run(client, pathway(plans.COMMON, "PETO", "PETO"), bcg)
    want = {
        "estimate": -0.4744,
        "se": 0.0407,
        "zval": -11.6689,
        "ci_lower": -0.5541,
        "ci_upper": -0.3948,
        "q": 167.7302,
    }
    for key, value in want.items():
        assert out["summary"][key] == pytest.approx(value, abs=half_unit(4)), key
    assert out["summary"]["i2"] == pytest.approx(92.85, abs=half_unit(2))
    for value, key in zip((0.6222, 0.5746, 0.6738), ("estimate", "ci_lower", "ci_upper"), strict=True):
        assert out["ratio_scale"][key] == pytest.approx(value, abs=half_unit(4)), key


# ---- studies with no events in either arm (decision 0019) ------------------------------------------------------------


def with_a_double_zero(bcg: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [*bcg, {"study": "Double zero", "ai": 0, "n1i": 40, "ci": 0, "n2i": 42}]


@pytest.mark.parametrize(
    ("model", "method", "metric", "dropped"),
    [
        (plans.COMMON, "IV", "OR", True),
        (plans.RANDOM, "IV", "RR", True),
        (plans.COMMON, "IV", "RD", False),
        (plans.RANDOM, "IV", "AS", False),
        (plans.COMMON, "MH", "OR", True),
        (plans.COMMON, "MH", "RD", False),  # rma.mh itself keeps them for a difference
        (plans.COMMON, "PETO", "PETO", True),
    ],
)
def test_a_study_with_no_events_in_either_arm_is_dropped_only_where_the_decision_says(
    client: TestClient, bcg: list[dict[str, Any]], tmp_path: Path, model: str, method: str, metric: str, dropped: bool
) -> None:
    out = run(client, pathway(model, method, metric), with_a_double_zero(bcg))
    assert out["left_out"] == (["Double zero"] if dropped else [])
    # metafor's own k for rma.mh and rma.peto still counts the dropped study, so the studies used are counted here
    assert sum(s["used"] for s in out["studies"]) == (13 if dropped else 14)
    assert_matches_r(out, tmp_path)


# ---- failures --------------------------------------------------------------------------------------------------------


def test_a_failure_inside_metafor_is_an_analysis_error(client: TestClient) -> None:
    # every study has no events in either arm: nothing is left to pool for a ratio
    rows = [{"study": f"S{i}", "ai": 0, "n1i": 20, "ci": 0, "n2i": 20} for i in range(3)]
    response = client.post(RUN, json={"pathway": pathway(plans.COMMON, "IV", "OR"), "data": rows})
    assert response.status_code == 422
    assert response.json()["code"] == "analysis_failed"

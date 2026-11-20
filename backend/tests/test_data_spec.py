"""The column spec, GET /api/v1/meta-analysis/spec and GET /api/v1/meta-analysis/template (#158).

The real map is used: its 12 runnable pathways are the ones the plan builder supports (#149).
"""

import csv
import io
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import data_spec, plans
from app.config import DEFAULT_SPEC_DIR, Settings
from app.errors import ApiError
from app.main import create_app

from .support import LOCK, SUPPORTED_PATHWAYS, pathway, ref

SPEC = data_spec.TWO_GROUP_BINARY


def client() -> TestClient:
    return TestClient(create_app(Settings(spec_dir=DEFAULT_SPEC_DIR, r_service_url="http://r")))


def pid(p: dict[str, Any]) -> str:
    return f"{p['model']}-{p['method']}-{p['metric']}"


def parse(text: str) -> list[list[str]]:
    return list(csv.reader(io.StringIO(text)))


def required_columns(spec: data_spec.DataSpec) -> list[str]:
    """The columns check_data asks for, read from its own errors on an empty row."""
    with pytest.raises(ApiError) as caught:
        data_spec.check_data([{}, {}], spec)
    return [f.path.removeprefix("data.0.") for f in caught.value.body.fields if f.path.startswith("data.0.")]


def test_the_template_header_is_exactly_what_the_check_requires() -> None:
    header, example = parse(data_spec.template_csv(SPEC))
    assert header == required_columns(SPEC) == ["study", "ai", "n1i", "ci", "n2i"]
    assert len(example) == len(header)


def test_the_example_row_passes_the_check() -> None:
    header, example = parse(data_spec.template_csv(SPEC))
    row: dict[str, Any] = {
        name: (value if name == "study" else int(value)) for name, value in zip(header, example, strict=True)
    }
    columns = data_spec.check_data([row, {**row, "study": "Another study"}], SPEC)
    assert columns["ai"] == [4, 4]


def test_the_example_is_the_first_bcg_trial() -> None:
    # Aronson 1948 in metadat's dat.bcg: tpos 4, tneg 119, cpos 11, cneg 128
    assert {c.name: c.example for c in SPEC.columns} == {
        "study": "Aronson 1948",
        "ai": "4",
        "n1i": str(4 + 119),
        "ci": "11",
        "n2i": str(11 + 128),
    }


def test_the_rules_name_every_check() -> None:
    rules = " ".join(SPEC.rules)
    assert f"At least {SPEC.min_studies} and at most {SPEC.max_studies} studies" in rules
    for pair in SPEC.events_totals:
        assert f"`{pair.events}` is between 0 and `{pair.total}`" in rules
        assert f"`{pair.total}` is at least 1" in rules
    assert "`study` is a label, different on every row" in rules


def test_the_runnable_pathways_are_the_supported_ones() -> None:
    assert [ref(p) for p in LOCK if p["status"] == "runnable"] == [ref(p) for p in SUPPORTED_PATHWAYS]


@pytest.mark.parametrize("p", SUPPORTED_PATHWAYS, ids=pid)
def test_every_runnable_pathway_has_its_spec_and_template(p: dict[str, Any]) -> None:
    c = client()
    spec = c.get("/api/v1/meta-analysis/spec", params=ref(p))
    assert spec.status_code == 200, spec.text
    assert spec.json() == SPEC.model_dump(mode="json")
    # the template's header is exactly what /run's check requires, for this pathway's own spec
    own = plans.data_spec(plans.PathwayRef.model_validate(ref(p)))
    assert parse(data_spec.template_csv(own))[0] == required_columns(own)
    template = c.get("/api/v1/meta-analysis/template", params=ref(p))
    assert template.status_code == 200
    assert template.headers["content-type"].startswith("text/csv")
    name = f"atlas-template-{p['method']}-{p['metric']}.csv".lower()
    assert template.headers["content-disposition"] == f'attachment; filename="{name}"'
    assert template.text == data_spec.template_csv(SPEC)


@pytest.mark.parametrize("endpoint", ["spec", "template"])
def test_a_pathway_that_is_not_runnable_is_a_409(endpoint: str) -> None:
    other = next(p for p in LOCK if p["status"] == "planned")
    response = client().get(f"/api/v1/meta-analysis/{endpoint}", params=ref(other))
    assert response.status_code == 409
    assert response.json()["code"] == "pathway_not_runnable"
    assert response.json()["details"] == {"status": "planned", "milestone": other["milestone"]}


@pytest.mark.parametrize("endpoint", ["spec", "template"])
def test_a_pathway_the_map_does_not_have_is_a_422(endpoint: str) -> None:
    params = pathway(plans.COMMON, "IV", "OR") | {"metric": "NOPE"}
    response = client().get(f"/api/v1/meta-analysis/{endpoint}", params=params)
    assert response.status_code == 422
    assert response.json()["code"] == "unknown_pathway"


@pytest.mark.parametrize("endpoint", ["spec", "template"])
def test_a_missing_or_unknown_query_field_is_an_invalid_request(endpoint: str) -> None:
    full = pathway(plans.COMMON, "IV", "OR")
    for params in ({k: v for k, v in full.items() if k != "metric"}, full | {"colour": "red"}):
        response = client().get(f"/api/v1/meta-analysis/{endpoint}", params=params)
        assert response.status_code == 422
        assert response.json()["code"] == "invalid_request"


def test_spec_and_template_do_not_document_an_r_service_error() -> None:
    # neither calls the R service (#170 audit)
    paths = client().get("/openapi.json").json()["paths"]
    for path in ("/api/v1/meta-analysis/spec", "/api/v1/meta-analysis/template"):
        codes = set(paths[path]["get"]["responses"])
        assert "502" not in codes and {"409", "422"} <= codes, (path, codes)
    assert "502" in paths["/api/v1/meta-analysis/run"]["post"]["responses"]

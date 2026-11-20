"""The backend's API (#144). Expected counts come from spec/pathways.lock.json, read here on its own,
not from the backend's reading of map.json."""

import json
from collections import Counter
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import DEFAULT_SPEC_DIR, Settings
from app.main import create_app, get_r_service
from app.r_service import RService

LOCK: list[dict[str, Any]] = json.loads((DEFAULT_SPEC_DIR / "pathways.lock.json").read_text(encoding="utf-8"))
CARDS: list[dict[str, Any]] = json.loads((DEFAULT_SPEC_DIR / "cards.json").read_text(encoding="utf-8"))


def client(r_service_status: int | None = 200) -> TestClient:
    """A client whose R service answers with the given status, or doesn't answer at all (None)."""

    def answer(request: httpx.Request) -> httpx.Response:
        if r_service_status is None:
            raise httpx.ConnectError("refused", request=request)
        assert request.url.path == "/health"
        return httpx.Response(r_service_status, json={"status": "ok"})

    app = create_app(Settings(spec_dir=DEFAULT_SPEC_DIR, r_service_url="http://r"))
    app.dependency_overrides[get_r_service] = lambda: RService("http://r", transport=httpx.MockTransport(answer))
    return TestClient(app)


@pytest.mark.parametrize(("status", "reachable"), [(200, True), (503, False), (None, False)])
def test_health_reports_whether_the_r_service_answers(status: int | None, reachable: bool) -> None:
    response = client(status).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "r_service": reachable, "advisor": False}


def test_every_pathway_is_served_with_its_status() -> None:
    body = client().get("/api/v1/pathways").json()
    assert body["count"] == len(LOCK) == len(body["pathways"])
    key = ("framework", "group", "datatype", "outcome", "model", "method", "metric")
    assert {tuple(p[k] for k in key): p["status"] for p in body["pathways"]} == {
        tuple(p[k] for k in key): p["status"] for p in LOCK
    }


@pytest.mark.parametrize("status", ["planned", "specified", "to_check", "runnable"])
def test_pathways_filter_by_status(status: str) -> None:
    body = client().get("/api/v1/pathways", params={"status": status}).json()
    assert body["count"] == Counter(p["status"] for p in LOCK)[status]


def test_pathways_filter_by_several_tiers() -> None:
    asked = {"framework": LOCK[0]["framework"], "method": LOCK[0]["method"], "model": "Random effects"}
    body = client().get("/api/v1/pathways", params=asked).json()
    expected = [p for p in LOCK if all(p[k] == v for k, v in asked.items())]
    assert body["count"] == len(expected) > 0
    assert all(all(p[k] == v for k, v in asked.items()) for p in body["pathways"])


def test_a_value_the_map_does_not_have_is_an_error_with_its_field() -> None:
    response = client().get("/api/v1/pathways", params={"metric": "NOPE", "method": "IV"})
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "unknown_value"
    assert [f["path"] for f in body["fields"]] == ["query.metric"]


def test_an_unknown_status_is_an_invalid_request() -> None:
    response = client().get("/api/v1/pathways", params={"status": "approved"})
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "invalid_request"
    assert body["fields"][0]["path"] == "query.status"


def test_a_misspelt_filter_is_an_invalid_request() -> None:
    response = client().get("/api/v1/pathways", params={"frameworks": "x"})
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "invalid_request"
    assert body["fields"][0]["path"] == "query.frameworks"


def test_an_unknown_path_or_method_is_a_json_error() -> None:
    response = client().get("/api/v1/nothing")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"
    response = client().post("/api/v1/pathways")
    assert response.status_code == 405
    assert response.json()["code"] == "method_not_allowed"


def test_an_unexpected_failure_is_a_json_error_without_details(tmp_path: Path) -> None:
    app = create_app(Settings(spec_dir=tmp_path))  # no map.json there
    response = TestClient(app, raise_server_exceptions=False).get("/api/v1/pathways")
    assert response.status_code == 500
    assert response.json() == {
        "code": "internal_error",
        "message": "Something went wrong on the server.",
        "fields": [],
        "details": {},
    }


def test_the_map_has_everything_but_the_pathway_list() -> None:
    body = client().get("/api/v1/map").json()
    raw = json.loads((DEFAULT_SPEC_DIR / "map.json").read_text(encoding="utf-8"))
    assert "pathways" not in body
    assert body["tiers"] == ["framework", "group", "datatype", "outcome", "model", "method", "metric"]
    for key in raw.keys() - {"pathways"}:
        assert body[key] == raw[key]
    assert len(body["cards"]) == len(CARDS)


def test_the_spec_directory_comes_from_the_environment(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("ATLAS_SPEC_DIR", str(tmp_path))
    monkeypatch.setenv("R_SERVICE_URL", "http://r_service:8000/")
    monkeypatch.setenv("ATLAS_CORS_ORIGINS", "http://localhost:5173, ")
    settings = Settings.from_env()
    assert settings.spec_dir == tmp_path
    assert settings.r_service_url == "http://r_service:8000"
    assert settings.cors_origins == ["http://localhost:5173"]


def test_the_openapi_schema_lists_the_endpoints() -> None:
    paths = client().get("/openapi.json").json()["paths"]
    assert set(paths) == {
        "/health",
        "/api/v1/map",
        "/api/v1/pathways",
        "/api/v1/meta-analysis/run",
        "/api/v1/meta-analysis/spec",
        "/api/v1/meta-analysis/template",
        "/api/v1/meta-analysis/import",
    }

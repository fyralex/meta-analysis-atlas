"""The published examples (#162): GET /api/v1/examples, one example, its CSV, and the checks made when they load."""

import csv
import io
import json
import shutil
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import DEFAULT_EXAMPLES_DIR, DEFAULT_SPEC_DIR, Settings
from app.errors import ApiError
from app.examples import Examples
from app.main import create_app
from app.map_data import MapData

from .support import LOCK, TIERS, ref


def client(examples_dir: Path = DEFAULT_EXAMPLES_DIR, spec_dir: Path = DEFAULT_SPEC_DIR) -> TestClient:
    return TestClient(create_app(Settings(spec_dir=spec_dir, examples_dir=examples_dir, r_service_url="http://r")))


def runnable() -> list[dict[str, str]]:
    return [ref(p) for p in LOCK if p["status"] == "runnable"]


def keys(pathways: list[dict[str, str]]) -> set[tuple[str, ...]]:
    return {tuple(p[t] for t in TIERS) for p in pathways}


def test_the_list_has_the_bcg_trials_with_what_they_run_with() -> None:
    body = client().get("/api/v1/examples").json()
    assert body["count"] == len(body["examples"]) == 1
    bcg = body["examples"][0]
    assert (bcg["id"], bcg["title"], bcg["count"]) == ("bcg", "BCG vaccine trials", 13)
    assert bcg["source"]["url"] == "https://doi.org/10.1001/jama.1994.03510330076038"
    # not listed by hand: every runnable pathway whose table is the example's (all 12 today)
    assert keys(bcg["runs_with"]) == keys(runnable())
    assert len(bcg["runs_with"]) == 12
    assert {(p["model"], p["method"], p["metric"]) for p in bcg["published_for"]} == {
        ("Random effects", "IV", "RR"),
        ("Common effect", "MH", "OR"),
        ("Common effect", "MH", "RR"),
        ("Common effect", "PETO", "PETO"),
    }
    assert "studies" not in bcg


def test_one_example_has_its_studies_ready_for_run() -> None:
    body = client().get("/api/v1/examples/bcg").json()
    with (DEFAULT_EXAMPLES_DIR / "bcg" / "studies.csv").open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    assert [s["study"] for s in body["studies"]] == [r["study"] for r in rows]
    assert body["studies"][0] == {"study": "Aronson 1948", "ai": 4, "n1i": 123, "ci": 11, "n2i": 139}
    assert body["labels"] == {"outcome": "tuberculosis", "treatment": "vaccinated", "control": "unvaccinated"}
    assert body["data_from"]["url"] == "https://wviechtb.github.io/metadat/reference/dat.bcg.html"
    assert all(entry["values"] and entry["url"].startswith("https://") for entry in body["published"])


def test_its_csv_is_the_file_itself() -> None:
    response = client().get("/api/v1/examples/bcg/studies.csv")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["content-disposition"] == 'attachment; filename="atlas-example-bcg.csv"'
    assert response.content == (DEFAULT_EXAMPLES_DIR / "bcg" / "studies.csv").read_bytes()
    assert len(list(csv.reader(io.StringIO(response.text)))) == 14


@pytest.mark.parametrize("url", ["/api/v1/examples/nope", "/api/v1/examples/nope/studies.csv"])
def test_an_unknown_example_is_a_404(url: str) -> None:
    response = client().get(url)
    assert response.status_code == 404
    assert response.json()["code"] == "unknown_example"


def test_runs_with_follows_the_map(tmp_path: Path) -> None:
    for name in ("map.json", "cards.json"):
        shutil.copy(DEFAULT_SPEC_DIR / name, tmp_path / name)
    data = json.loads((tmp_path / "map.json").read_text(encoding="utf-8"))
    first = runnable()[0]
    for p in data["pathways"]:
        if {t: p[t] for t in TIERS} == first:
            p["status"] = "planned"
    (tmp_path / "map.json").write_text(json.dumps(data), encoding="utf-8")
    bcg = client(spec_dir=tmp_path).get("/api/v1/examples").json()["examples"][0]
    assert keys(bcg["runs_with"]) == keys(runnable()) - keys([first])


# ---- what loading refuses --------------------------------------------------------------------------------------------


def copy_bcg(tmp_path: Path, name: str = "bcg") -> Path:
    folder = tmp_path / name
    shutil.copytree(DEFAULT_EXAMPLES_DIR / "bcg", folder)
    return folder


def edit(folder: Path, **changes: Any) -> None:
    meta = json.loads((folder / "example.json").read_text(encoding="utf-8"))
    meta.update(changes)
    (folder / "example.json").write_text(json.dumps(meta), encoding="utf-8")


def load(tmp_path: Path) -> Examples:
    examples = Examples(tmp_path, MapData(DEFAULT_SPEC_DIR))
    examples.by_id  # noqa: B018 (reading it is what checks the files)
    return examples


def test_the_id_must_be_the_folders_name(tmp_path: Path) -> None:
    copy_bcg(tmp_path, "other")
    with pytest.raises(ValueError, match="must be the folder's name"):
        load(tmp_path)


def test_published_values_must_be_for_a_pathway_the_example_runs_with(tmp_path: Path) -> None:
    folder = copy_bcg(tmp_path)
    meta = json.loads((folder / "example.json").read_text(encoding="utf-8"))
    meta["published"][0]["pathway"] = {"model": "Random effects", "method": "GLMM", "metric": "OR"}
    edit(folder, published=meta["published"])
    with pytest.raises(ValueError, match="doesn't run with"):
        load(tmp_path)


def test_the_studies_go_through_the_upload_check(tmp_path: Path) -> None:
    folder = copy_bcg(tmp_path)
    text = (folder / "studies.csv").read_text(encoding="utf-8").replace("4,123", "400,123", 1)
    (folder / "studies.csv").write_text(text, encoding="utf-8")
    with pytest.raises(ApiError) as caught:
        load(tmp_path)
    assert caught.value.body.code == "invalid_data"


def test_a_column_the_table_does_not_use_is_refused(tmp_path: Path) -> None:
    folder = copy_bcg(tmp_path)
    lines = (folder / "studies.csv").read_text(encoding="utf-8").splitlines()
    rows = [f"{lines[0]},year", *(f"{line},1900" for line in lines[1:])]
    (folder / "studies.csv").write_text("\n".join(rows) + "\n", encoding="utf-8")
    with pytest.raises(ValueError, match="doesn't use"):
        load(tmp_path)


def test_an_unknown_field_in_the_file_is_refused(tmp_path: Path) -> None:
    edit(copy_bcg(tmp_path), colour="red")
    with pytest.raises(ValueError):
        load(tmp_path)

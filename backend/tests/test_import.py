"""POST /api/v1/meta-analysis/import (#159): an uploaded CSV checked against the pathway's column spec.

The acceptance criteria of #159, one test (or more) each: a valid file; missing columns; extra columns ignored; each
rule broken; an empty file; a file that isn't CSV; a BOM; the size cap.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import csv_import, data_spec, plans
from app.config import DEFAULT_SPEC_DIR, Settings
from app.main import create_app

from .support import LOCK, pathway, ref

URL = "/api/v1/meta-analysis/import"
HEADER = "study,ai,n1i,ci,n2i"
# the first two BCG vaccine trials (metadat's dat.bcg), as totals
GOOD = f"{HEADER}\nAronson 1948,4,123,11,139\nFerguson & Simes 1949,6,306,29,303\n"


def upload(text: str | bytes, form: dict[str, str] | None = None) -> Any:
    raw = text.encode("utf-8") if isinstance(text, str) else text
    fields = form if form is not None else pathway(plans.RANDOM, "IV", "RR")
    client = TestClient(create_app(Settings(spec_dir=DEFAULT_SPEC_DIR, r_service_url="http://r")))
    return client.post(URL, data=fields, files={"file": ("studies.csv", raw, "text/csv")})


def problems(text: str | bytes) -> list[tuple[str, str]]:
    response = upload(text)
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "invalid_data"
    return [(f["path"], f["message"]) for f in response.json()["fields"]]


def test_a_valid_file_gives_the_studies_ready_for_run() -> None:
    response = upload(GOOD)
    assert response.status_code == 200, response.text
    out = response.json()
    assert out["count"] == 2
    assert out["studies"] == [
        {"study": "Aronson 1948", "ai": 4, "n1i": 123, "ci": 11, "n2i": 139},
        {"study": "Ferguson & Simes 1949", "ai": 6, "n1i": 306, "ci": 29, "n2i": 303},
    ]
    assert out["ignored_columns"] == []
    assert out["pathway"] == pathway(plans.RANDOM, "IV", "RR")


def test_the_studies_pass_runs_own_check() -> None:
    studies = upload(GOOD).json()["studies"]
    spec = plans.data_spec(plans.PathwayRef.model_validate(pathway(plans.RANDOM, "IV", "RR")))
    assert data_spec.check_data(studies, spec)["study"] == ["Aronson 1948", "Ferguson & Simes 1949"]


def test_columns_may_come_in_any_order_and_extra_ones_are_ignored() -> None:
    text = "notes,n2i,ci,n1i,ai,study,year\nx,139,11,123,4,Aronson 1948,1948\n,303,29,306,6,Ferguson,1949\n"
    out = upload(text).json()
    assert out["studies"][0] == {"study": "Aronson 1948", "ai": 4, "n1i": 123, "ci": 11, "n2i": 139}
    assert out["ignored_columns"] == ["notes", "year"]


def test_missing_columns_are_named() -> None:
    found = problems("study,ai,n1i\nA,1,10\nB,2,10\n")
    assert found == [
        ("file.columns.ci", "The column ci is missing."),
        ("file.columns.n2i", "The column n2i is missing."),
    ]


def test_a_required_column_that_appears_twice_is_refused() -> None:
    assert problems(f"{HEADER},ai\nA,1,10,2,10,3\nB,1,10,2,10,3\n") == [
        ("file.columns.ai", "The column ai appears more than once.")
    ]


@pytest.mark.parametrize(
    ("row", "path", "message"),
    [
        ("A,11,10,2,10", "data.0.ai", "Row 2 (A), column ai: Must be between 0 and n1i (10)."),
        ("A,1,10,2,0", "data.0.n2i", "Row 2 (A), column n2i: Must be at least 1."),
        ("A,1.5,10,2,10", "data.0.ai", "Row 2 (A), column ai: Must be a whole number."),
        ("A,-1,10,2,10", "data.0.ai", "Row 2 (A), column ai: Must not be negative."),
        ("A,one,10,2,10", "data.0.ai", "Row 2 (A), column ai: Must be a whole number."),
        ("A,,10,2,10", "data.0.ai", "Row 2 (A), column ai: Required."),
        (",1,10,2,10", "data.0.study", "Row 2, column study: Required."),
        ("B,1,10,2,10", "data.1.study", "Row 3 (B), column study: Duplicates the label of row 2."),
    ],
    ids=["events-above-total", "total-zero", "fraction", "negative", "text", "empty-count", "no-label", "duplicate"],
)
def test_each_rule_broken_is_reported_with_its_row_study_and_column(row: str, path: str, message: str) -> None:
    found = problems(f"{HEADER}\n{row}\nB,1,10,2,10\n")
    assert (path, message) in found
    # a total of 0 also puts its events above the total; every other case is one problem
    assert len(found) == (2 if path.endswith("n2i") else 1), found


def test_at_least_two_studies() -> None:
    assert problems(f"{HEADER}\nA,1,10,2,10\n") == [("data", "At least 2 studies are needed; got 1.")]


def test_thousands_separators_are_refused_with_a_clear_message() -> None:
    # semicolon-separated, as some spreadsheets save, so the comma stays inside the cell
    found = problems("study;ai;n1i;ci;n2i\nA;1,234;12,000;2;10\nB;1;10;2;10\n")
    assert ("data.0.ai", "Row 2 (A), column ai: Write the number without thousands separators.") in found
    assert ("data.0.n1i", "Row 2 (A), column n1i: Write the number without thousands separators.") in found
    assert not [p for p in found if p[1].endswith("Required.")]


def test_a_comma_inside_a_comma_separated_row_shows_as_an_extra_cell() -> None:
    found = problems(f"{HEADER}\nA,1,234,10,2,10\nB,1,10,2,10\n")
    assert ("data.0", "Row 2 (A): It has more cells than the header has columns.") in found


@pytest.mark.parametrize("separator", [";", "\t"])
def test_semicolons_and_tabs_are_read_like_commas(separator: str) -> None:
    lines = [HEADER, "Aronson 1948,4,123,11,139", "Ferguson & Simes 1949,6,306,29,303"]
    out = upload("\n".join(line.replace(",", separator) for line in lines) + "\n").json()
    assert [s["study"] for s in out["studies"]] == ["Aronson 1948", "Ferguson & Simes 1949"]
    assert out["studies"][1]["n2i"] == 303


def test_rows_are_named_by_their_line_in_the_file_even_after_blank_lines() -> None:
    found = problems(f"{HEADER}\n\nA,1,10,2,10\n\nB,11,10,2,10\n")
    assert found == [("data.1.ai", "Row 5 (B), column ai: Must be between 0 and n1i (10).")]


def test_quoted_labels_with_commas_are_kept() -> None:
    out = upload(f'{HEADER}\n"Smith, Jones 2001",1,10,2,10\nB,1,10,2,10\n').json()
    assert out["studies"][0]["study"] == "Smith, Jones 2001"


@pytest.mark.parametrize("text", ["", "\n\n  \n"], ids=["empty", "blank-lines"])
def test_an_empty_file_is_refused(text: str) -> None:
    assert problems(text) == [("file", "The file is empty.")]


def test_a_header_only_file_has_too_few_studies() -> None:
    assert problems(f"{HEADER}\n") == [("data", "At least 2 studies are needed; got 0.")]


def test_a_file_that_is_not_text_is_refused() -> None:
    xlsx = b"PK\x03\x04\x14\x00\x06\x00\x08\x00\x00\x00!\x00\xff\xfe binary"
    assert problems(xlsx) == [("file", 'The file isn\'t UTF-8 text. Save it from your spreadsheet as "CSV UTF-8".')]
    assert problems(b"study,ai\x00,n1i") == [("file", "The file isn't a CSV text file.")]


def test_a_text_file_that_is_not_the_table_names_the_columns_it_needs() -> None:
    response = upload("Dear reviewer,\nplease find attached\n")
    assert response.status_code == 422
    assert (
        response.json()["message"]
        == "The file needs the columns study, ai, n1i, ci, n2i, written exactly so in its first row."
    )


def test_a_byte_order_mark_is_ignored() -> None:
    out = upload("﻿" + GOOD).json()
    assert out["studies"][0]["study"] == "Aronson 1948"
    assert out["ignored_columns"] == []


def test_labels_keep_their_own_characters() -> None:
    out = upload(f"{HEADER}\nFrimodt-Møller 1973,33,5069,47,5808\nΑθήνα 2001,1,10,2,10\n").json()
    assert [s["study"] for s in out["studies"]] == ["Frimodt-Møller 1973", "Αθήνα 2001"]


def test_the_size_cap() -> None:
    rows = "".join(f"S{i},1,10,2,10\n" for i in range(csv_import.MAX_BYTES // 12))
    big = f"{HEADER}\n{rows}"
    assert len(big.encode()) > csv_import.MAX_BYTES
    assert problems(big) == [("file", "The file is larger than 2 MB.")]


def test_more_than_2000_studies_are_refused() -> None:
    rows = "".join(f"S{i},1,10,2,10\n" for i in range(2001))
    assert ("data", "At most 2000 studies are accepted; got 2001.") in problems(f"{HEADER}\n{rows}")


def test_a_pathway_that_is_not_runnable_is_a_409() -> None:
    other = next(p for p in LOCK if p["status"] == "planned")
    response = upload(GOOD, ref(other))
    assert response.status_code == 409
    assert response.json()["code"] == "pathway_not_runnable"


def test_a_pathway_the_map_does_not_have_is_a_422() -> None:
    response = upload(GOOD, pathway(plans.COMMON, "IV", "OR") | {"metric": "NOPE"})
    assert response.status_code == 422
    assert response.json()["code"] == "unknown_pathway"


def test_a_missing_tier_or_file_is_an_invalid_request() -> None:
    form = {k: v for k, v in pathway(plans.COMMON, "IV", "OR").items() if k != "metric"}
    assert upload(GOOD, form).json()["code"] == "invalid_request"
    client = TestClient(create_app(Settings(spec_dir=DEFAULT_SPEC_DIR, r_service_url="http://r")))
    response = client.post(URL, data=pathway(plans.COMMON, "IV", "OR"))
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_request"

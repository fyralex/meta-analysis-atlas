"""Reading an uploaded CSV into a study table (#159). Python's csv module only; R never sees the file.

The checks are the column spec's (`data_spec`), the same ones `/run` makes, so a file that passes here also passes
there. Problems keep `/run`'s field paths (`data.3.ai`, the fourth study) and their messages name the file's row and
the study, so a person can find them in their spreadsheet. Nothing is stored (decision 0006).
"""

import csv
import io
import re
from typing import Any

from .data_spec import DataSpec, check_data
from .errors import ApiError, FieldError

# 2 MB is far more than 2000 studies need (a row of the 12 pathways' table is under 100 bytes)
MAX_BYTES = 2_000_000
DELIMITERS = (",", ";", "\t")
WHOLE = re.compile(r"[0-9]+")
SEPARATED = re.compile(r"[0-9]{1,3}([,.' ][0-9]{3})+")
NUMBER = re.compile(r"-?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?")


def _invalid(message: str, path: str = "file") -> ApiError:
    return ApiError(422, "invalid_data", message, [FieldError(path=path, message=message)])


def decode(raw: bytes) -> str:
    """UTF-8, with or without a byte-order mark. Anything else is refused with a clear message."""
    if len(raw) > MAX_BYTES:
        raise _invalid(f"The file is larger than {MAX_BYTES // 1_000_000} MB.")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise _invalid('The file isn\'t UTF-8 text. Save it from your spreadsheet as "CSV UTF-8".') from None
    if "\x00" in text:
        raise _invalid("The file isn't a CSV text file.")
    return text


def _delimiter(header_line: str) -> str:
    """The separator that splits the header into the most fields: spreadsheets in some languages save with ';'."""
    return max(DELIMITERS, key=lambda d: len(header_line.split(d)))


def _count(value: str) -> Any:
    """A count cell as /run would receive it: a whole number as int, other numbers as float, anything else as text."""
    value = value.strip()
    if WHOLE.fullmatch(value):
        return int(value)
    if NUMBER.fullmatch(value):
        return float(value)
    return value


def read(text: str, spec: DataSpec) -> tuple[list[dict[str, Any]], list[str]]:
    """The file's studies, checked against the spec, and the names of the columns it ignored."""
    lines = text.splitlines()
    first = next((line for line in lines if line.strip()), None)
    if first is None:
        raise _invalid("The file is empty.")
    reader = csv.reader(io.StringIO(text), delimiter=_delimiter(first))
    # each kept row with its line in the file, so messages point at the right line even after blank lines
    rows = [(reader.line_num, r) for r in reader if any(cell.strip() for cell in r)]
    header = [name.strip() for name in rows[0][1]]
    body = rows[1:]
    lines_of = [line for line, _ in body]

    wanted = [c.name for c in spec.columns]
    missing = [name for name in wanted if name not in header]
    repeated = sorted({name for name in header if name and header.count(name) > 1})
    problems = [FieldError(path=f"file.columns.{name}", message=f"The column {name} is missing.") for name in missing]
    problems += [
        FieldError(path=f"file.columns.{name}", message=f"The column {name} appears more than once.")
        for name in repeated
        if name in wanted
    ]
    if problems:
        message = f"The file needs the columns {', '.join(wanted)}, written exactly so in its first row."
        raise ApiError(422, "invalid_data", message, problems)

    position = {name: header.index(name) for name in wanted}
    kinds = {c.name: c.kind for c in spec.columns}
    studies: list[dict[str, Any]] = []
    shape: list[FieldError] = []
    for i, (_, cells) in enumerate(body):
        if len(cells) > len(header):
            shape.append(FieldError(path=f"data.{i}", message="It has more cells than the header has columns."))
        study: dict[str, Any] = {}
        for name, at in position.items():
            cell = cells[at] if at < len(cells) else ""
            study[name] = cell.strip() if kinds[name] == "label" else _separated(cell, i, name, shape)
        studies.append(study)
    try:
        check_data(studies, spec)
        problems = []
    except ApiError as error:
        problems = error.body.fields
    # a cell refused for its separators is also empty to check_data: keep only the first problem for each field
    seen = {p.path for p in shape}
    problems = shape + [p for p in problems if p.path not in seen]
    if problems:
        labels = [s.get("study") for s in studies]
        named = [_name_row(p, labels, lines_of) for p in problems]
        raise ApiError(422, "invalid_data", "The file has problems to fix before the analysis can run.", named)
    ignored = [name for name in header if name and name not in wanted]
    return studies, ignored


def _separated(cell: str, i: int, name: str, problems: list[FieldError]) -> Any:
    """Refuse thousands separators (1,234 or 1.234), which would otherwise be read as a different number."""
    if SEPARATED.fullmatch(cell.strip()) and not WHOLE.fullmatch(cell.strip()):
        problems.append(FieldError(path=f"data.{i}.{name}", message="Write the number without thousands separators."))
        return None
    return _count(cell)


def _name_row(problem: FieldError, labels: list[Any], lines_of: list[int]) -> FieldError:
    """Prefix a study's problem with its line in the file (the header is line 1, or later after blank lines) and its
    label, so a person can find it in their spreadsheet."""
    parts = problem.path.split(".")
    if len(parts) < 2 or parts[0] != "data" or not parts[1].isdigit():
        return problem
    i = int(parts[1])
    label = labels[i] if i < len(labels) and labels[i] else None
    where = f"Row {lines_of[i]}" + (f" ({label})" if label else "") + (f", column {parts[2]}" if len(parts) > 2 else "")
    # check_data points at other studies by path ("the label of data.0"); in a file that is a row number
    message = re.sub(r"\bdata\.(\d+)\b", lambda m: f"row {lines_of[int(m.group(1))]}", problem.message)
    return FieldError(path=problem.path, message=f"{where}: {message}")

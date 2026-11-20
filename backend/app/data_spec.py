"""What a study table must hold for a pathway (#158): one spec, read by every place that needs it.

`/run`'s check, the upload check, the Workbench's "What the file needs" table and the CSV template all come from the
spec here, so none of them can disagree with what the server accepts. Column names are metafor's own argument
names, so the R code shown with a result reads the same table.
"""

import csv
import io
import math
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from .errors import ApiError, FieldError


class SpecColumn(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str = Field(description="The column's name in the file: metafor's argument name.")
    label: str = Field(description="A short plain name for the column.")
    description: str = Field(description="What the column holds, in plain words.")
    example: str = Field(description="A real value, from the first BCG vaccine trial (metadat's dat.bcg).")
    kind: Literal["label", "count"]


class EventsTotal(BaseModel):
    model_config = ConfigDict(frozen=True)

    events: str
    total: str


class DataSpec(BaseModel):
    model_config = ConfigDict(frozen=True)

    columns: tuple[SpecColumn, ...]
    events_totals: tuple[EventsTotal, ...] = Field(description="Pairs where the events can't exceed the total.")
    min_studies: int
    max_studies: int
    rules: tuple[str, ...] = Field(description="The checks, in plain words.")


def _rules(columns: tuple[SpecColumn, ...], pairs: tuple[EventsTotal, ...], least: int, most: int) -> tuple[str, ...]:
    labels = [c.name for c in columns if c.kind == "label"]
    counts = [c.name for c in columns if c.kind == "count"]
    return (
        f"At least {least} and at most {most} studies, one per row.",
        *(f"`{name}` is a label, different on every row." for name in labels),
        f"{', '.join(f'`{c}`' for c in counts)} are whole numbers, not negative.",
        *(f"`{p.events}` is between 0 and `{p.total}`." for p in pairs),
        *(f"`{p.total}` is at least 1." for p in pairs),
        "Other columns are ignored.",
    )


def _spec(
    columns: tuple[SpecColumn, ...], pairs: tuple[EventsTotal, ...], least: int = 2, most: int = 2000
) -> DataSpec:
    return DataSpec(
        columns=columns,
        events_totals=pairs,
        min_studies=least,
        max_studies=most,
        rules=_rules(columns, pairs, least, most),
    )


# Two groups, a yes-or-no outcome, counts for each group: the 12 runnable pathways (#148). The example row is the
# first BCG vaccine trial (Aronson 1948): 4 of 123 vaccinated and 11 of 139 unvaccinated got tuberculosis.
TWO_GROUP_BINARY = _spec(
    (
        SpecColumn(
            name="study",
            label="Study",
            description="A short name for the study, different for each row",
            example="Aronson 1948",
            kind="label",
        ),
        SpecColumn(
            name="ai",
            label="Events, treatment",
            description="People with the event in the treatment group",
            example="4",
            kind="count",
        ),
        SpecColumn(
            name="n1i",
            label="People, treatment",
            description="People in the treatment group",
            example="123",
            kind="count",
        ),
        SpecColumn(
            name="ci",
            label="Events, control",
            description="People with the event in the control group",
            example="11",
            kind="count",
        ),
        SpecColumn(
            name="n2i",
            label="People, control",
            description="People in the control group",
            example="139",
            kind="count",
        ),
    ),
    (EventsTotal(events="ai", total="n1i"), EventsTotal(events="ci", total="n2i")),
)


def check_data(rows: list[dict[str, Any]], spec: DataSpec) -> dict[str, list[Any]]:
    """The study table as columns, or a 422 `invalid_data` with a path for every problem found.

    Problems in each row's own fields come first, row by row; then the checks across columns (events above the total,
    a total of 0).
    """
    errors: list[FieldError] = []
    if len(rows) < spec.min_studies:
        message = f"At least {spec.min_studies} studies are needed; got {len(rows)}."
        errors.append(FieldError(path="data", message=message))
    if len(rows) > spec.max_studies:
        message = f"At most {spec.max_studies} studies are accepted; got {len(rows)}."
        errors.append(FieldError(path="data", message=message))
    kept = rows[: spec.max_studies]
    columns: dict[str, list[Any]] = {c.name: [] for c in spec.columns}
    labels: dict[str, int] = {}
    for i, row in enumerate(kept):
        for column in spec.columns:
            name, path = column.name, f"data.{i}.{column.name}"
            if name not in row or row[name] is None or row[name] == "":
                errors.append(FieldError(path=path, message="Required."))
                columns[name].append(None)
            elif column.kind == "label":
                columns[name].append(_label(row[name], path, i, labels, errors))
            else:
                columns[name].append(_whole_number(row[name], path, errors))
    for i in range(len(kept)):
        for pair in spec.events_totals:
            e, n = columns[pair.events][i], columns[pair.total][i]
            if e is not None and n is not None and not 0 <= e <= n:
                message = f"Must be between 0 and {pair.total} ({n})."
                errors.append(FieldError(path=f"data.{i}.{pair.events}", message=message))
            if n is not None and n < 1:
                errors.append(FieldError(path=f"data.{i}.{pair.total}", message="Must be at least 1."))
    if errors:
        raise ApiError(422, "invalid_data", "The study table is not valid for this pathway.", errors)
    return columns


def _label(value: Any, path: str, i: int, labels: dict[str, int], errors: list[FieldError]) -> str | None:
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        errors.append(FieldError(path=path, message="Must be a text label."))
        return None
    label = str(value).strip()
    if label in labels:
        errors.append(FieldError(path=path, message=f"Duplicates the label of data.{labels[label]}."))
    labels.setdefault(label, i)
    return label


def _whole_number(value: Any, path: str, errors: list[FieldError]) -> int | None:
    """A count: a whole number, not a boolean, not negative. JSON 5.0 is accepted as 5."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        errors.append(FieldError(path=path, message="Must be a whole number."))
        return None
    if isinstance(value, float) and not (math.isfinite(value) and value.is_integer()):
        errors.append(FieldError(path=path, message="Must be a whole number."))
        return None
    if value < 0:
        errors.append(FieldError(path=path, message="Must not be negative."))
        return None
    return int(value)


def template_csv(spec: DataSpec) -> str:
    """A CSV with the spec's header and its one example row."""
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow([c.name for c in spec.columns])
    writer.writerow([c.example for c in spec.columns])
    return out.getvalue()

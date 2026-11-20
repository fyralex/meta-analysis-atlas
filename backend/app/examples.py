"""Published example datasets (#162): what Casebook lists, and what the validation tests read.

Each example is a folder in `backend/examples/<id>/`:
- `studies.csv`, in the column spec of its table (`data_spec`), read through the same check as an upload, so an
  example can't be something the Workbench would refuse;
- `example.json`: title, description, source, where the data come from, optional labels for the interpretation
  sentence, and the published values with where each is printed.

The pathways an example runs with are not listed by hand: they are the map's runnable pathways whose study table is
the example's. The validation tests read the same files, so Casebook, Proof and the tests can't disagree.
"""

from functools import cached_property
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from . import csv_import, plans
from .data_spec import SPECS, DataSpec
from .errors import ApiError
from .interpretation import Labels
from .map_data import TIERS, MapData


class Citation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    citation: str
    url: str


class PathwayChoice(BaseModel):
    """A pathway's last three tiers; the first four are the example table's."""

    model_config = ConfigDict(extra="forbid")

    model: str
    method: str
    metric: str


class PublishedValue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quantity: str = Field(description="Where in the answer of /run: summary.<key> or ratio_scale.<key>.")
    value: float
    places: int = Field(description="Decimal places as printed; a match is within half a unit in the last place.")


class Published(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pathway: PathwayChoice
    where: str
    url: str
    values: list[PublishedValue]


class ExampleFile(BaseModel):
    """`example.json` as written."""

    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    summary: str
    description: str
    table: str
    labels: Labels | None = None
    source: Citation
    data_from: Citation
    published: list[Published]


class ExampleSummary(BaseModel):
    id: str
    title: str
    summary: str
    source: Citation
    count: int = Field(description="The number of studies.")
    runs_with: list[plans.PathwayRef] = Field(description="The runnable pathways this example's table fits.")
    published_for: list[PathwayChoice] = Field(description="The pathways it has published values for.")


class Example(ExampleSummary):
    description: str
    data_from: Citation
    labels: Labels | None
    published: list[Published]
    studies: list[dict[str, Any]]


class ExampleList(BaseModel):
    count: int
    examples: list[ExampleSummary]


class Examples:
    """Every example, read and checked once."""

    def __init__(self, folder: Path, data: MapData) -> None:
        self.folder = folder
        self.data = data

    @cached_property
    def by_id(self) -> dict[str, Example]:
        found: dict[str, Example] = {}
        for path in sorted(p for p in self.folder.iterdir() if p.is_dir()):
            example = self._read(path)
            found[example.id] = example
        return found

    def _read(self, path: Path) -> Example:
        meta = ExampleFile.model_validate_json((path / "example.json").read_text(encoding="utf-8"))
        if meta.id != path.name:
            raise ValueError(f"{path}: the id {meta.id!r} must be the folder's name")
        spec = SPECS[meta.table]
        studies, ignored = csv_import.read(csv_import.decode((path / "studies.csv").read_bytes()), spec)
        if ignored:
            raise ValueError(f"{path}: studies.csv has columns its table doesn't use: {ignored}")
        runnable = [
            plans.PathwayRef.model_validate(p.model_dump(include=set(TIERS)))
            for p in self.data.pathways
            if p.status == "runnable"
        ]
        runs_with = [p for p in runnable if _table_of(p) == spec]
        choices = [PathwayChoice(model=p.model, method=p.method, metric=p.metric) for p in runs_with]
        for entry in meta.published:
            if entry.pathway not in choices:
                raise ValueError(f"{path}: published values for {entry.pathway}, which this example doesn't run with")
        return Example(
            id=meta.id,
            title=meta.title,
            summary=meta.summary,
            source=meta.source,
            count=len(studies),
            runs_with=runs_with,
            published_for=[entry.pathway for entry in meta.published],
            description=meta.description,
            data_from=meta.data_from,
            labels=meta.labels,
            published=meta.published,
            studies=studies,
        )

    def listing(self) -> ExampleList:
        keep = set(ExampleSummary.model_fields)
        summaries = [ExampleSummary.model_validate(e.model_dump(include=keep)) for e in self.by_id.values()]
        return ExampleList(count=len(summaries), examples=summaries)

    def get(self, example_id: str) -> Example:
        if example_id not in self.by_id:
            raise ApiError(404, "unknown_example", f"There is no example {example_id!r}.")
        return self.by_id[example_id]


def _table_of(pathway: plans.PathwayRef) -> DataSpec | None:
    """The study table a pathway reads, or None for a pathway the plan builder has no plan for."""
    try:
        return plans.data_spec(pathway)
    except ApiError:
        return None

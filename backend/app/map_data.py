"""The generated map, read once from spec/. The backend never holds rules of its own: spec/build_map.py does."""

import json
from functools import cached_property
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel

# A pathway's seven tiers, in the order a methodologist asks the questions (CLAUDE.md).
TIERS = ("framework", "group", "datatype", "outcome", "model", "method", "metric")

Status = Literal["runnable", "planned", "specified", "to_check"]


class Pathway(BaseModel):
    framework: str
    group: str
    datatype: str
    outcome: str
    model: str
    method: str
    metric: str
    status: Status
    milestone: str
    verified: bool
    added: bool
    new: bool


class MapData:
    def __init__(self, spec_dir: Path) -> None:
        self.spec_dir = spec_dir

    @cached_property
    def raw(self) -> dict[str, Any]:
        data: dict[str, Any] = json.loads((self.spec_dir / "map.json").read_text(encoding="utf-8"))
        return data

    @cached_property
    def cards(self) -> list[dict[str, Any]]:
        data: list[dict[str, Any]] = json.loads((self.spec_dir / "cards.json").read_text(encoding="utf-8"))
        return data

    @cached_property
    def pathways(self) -> list[Pathway]:
        return [Pathway.model_validate(p) for p in self.raw["pathways"]]

    @cached_property
    def tier_values(self) -> dict[str, set[str]]:
        """The values each tier takes in some pathway: what a filter may ask for."""
        return {t: {getattr(p, t) for p in self.pathways} for t in TIERS}

    def overview(self) -> dict[str, Any]:
        """Everything the map holds except the pathway list, with the tiers and the cards."""
        body = {k: v for k, v in self.raw.items() if k != "pathways"}
        return {"tiers": list(TIERS), **body, "cards": self.cards}

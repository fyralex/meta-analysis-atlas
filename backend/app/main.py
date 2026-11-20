"""The API (CLAUDE.md, "API"). v0.2 step 2 (#144): health, the map and the pathways.

Run it with `uvicorn app.main:app --app-dir backend --port 8080`.
"""

from typing import Annotated, Any

from fastapi import Depends, FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import errors
from .config import Settings
from .errors import ApiError, ErrorBody, FieldError
from .map_data import TIERS, MapData, Pathway, Status
from .r_service import RService


class Health(BaseModel):
    status: str
    r_service: bool
    advisor: bool


class PathwayList(BaseModel):
    count: int
    pathways: list[Pathway]


class PathwayFilters(BaseModel):
    framework: str | None = None
    group: str | None = None
    datatype: str | None = None
    outcome: str | None = None
    model: str | None = None
    method: str | None = None
    metric: str | None = None
    status: Status | None = None


ERRORS: dict[int | str, dict[str, Any]] = {422: {"model": ErrorBody, "description": "The request is not valid"}}


def get_map(request: Request) -> MapData:
    data: MapData = request.app.state.map
    return data


def get_r_service(request: Request) -> RService:
    service: RService = request.app.state.r_service
    return service


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    app = FastAPI(
        title="Meta-Analysis Atlas API",
        version="0.2.0",
        description="Reads the map of analysis pathways. Running analyses comes in a later step.",
    )
    app.state.map = MapData(settings.spec_dir)
    app.state.r_service = RService(settings.r_service_url)
    errors.install(app)
    if settings.cors_origins:
        app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST"])

    @app.get("/health", tags=["health"])
    async def health(r_service: Annotated[RService, Depends(get_r_service)]) -> Health:
        """The backend is up; whether the R service answers; whether the advisor is on (not before v0.4)."""
        return Health(status="ok", r_service=await r_service.reachable(), advisor=False)

    @app.get("/api/v1/map", tags=["map"])
    def map_overview(data: Annotated[MapData, Depends(get_map)]) -> dict[str, Any]:
        """The tiers, sources, branches, rules, cross-cutting sections, metrics, methods and cards."""
        return data.overview()

    @app.get("/api/v1/pathways", tags=["map"], responses=ERRORS)
    def pathways(
        data: Annotated[MapData, Depends(get_map)], filters: Annotated[PathwayFilters, Query()]
    ) -> PathwayList:
        """Every generated pathway with its status. Each tier filter takes a value exactly as the map writes it."""
        asked = filters.model_dump(exclude_none=True)
        unknown = [
            FieldError(path=f"query.{tier}", message=f"No pathway has {tier} {value!r}.")
            for tier, value in asked.items()
            if tier in TIERS and value not in data.tier_values[tier]
        ]
        if unknown:
            raise ApiError(422, "unknown_value", "A filter names a value the map doesn't have.", unknown)
        found = [p for p in data.pathways if all(getattr(p, k) == v for k, v in asked.items())]
        return PathwayList(count=len(found), pathways=found)

    return app


app = create_app()

"""The API (CLAUDE.md, "API"). v0.2 step 2 (#144): health, the map and the pathways.

Run it with `uvicorn app.main:app --app-dir backend --port 8080`.
"""

from typing import Annotated, Any

from fastapi import Depends, FastAPI, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict

from . import errors, plans
from .config import Settings
from .data_spec import DataSpec, template_csv
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
    # a misspelt filter is an error, not silently ignored (#145 audit)
    model_config = ConfigDict(extra="forbid")

    framework: str | None = None
    group: str | None = None
    datatype: str | None = None
    outcome: str | None = None
    model: str | None = None
    method: str | None = None
    metric: str | None = None
    status: Status | None = None


ERRORS: dict[int | str, dict[str, Any]] = {422: {"model": ErrorBody, "description": "The request is not valid"}}
RUN_ERRORS: dict[int | str, dict[str, Any]] = {
    **ERRORS,
    409: {"model": ErrorBody, "description": "The pathway is not runnable yet"},
    501: {"model": ErrorBody, "description": "The map says the pathway is runnable but the plan builder has no plan"},
    502: {"model": ErrorBody, "description": "The R service did not answer, or answered something unusable"},
}


def get_map(request: Request) -> MapData:
    data: MapData = request.app.state.map
    return data


def get_r_service(request: Request) -> RService:
    service: RService = request.app.state.r_service
    return service


def runnable_pathway(data: MapData, ref: plans.PathwayRef) -> Pathway:
    """The map's pathway for these choices, if it is runnable: else `422 unknown_pathway` or `409 pathway_not_runnable`."""
    found = next((p for p in data.pathways if p.model_dump(include=set(TIERS)) == ref.model_dump()), None)
    if found is None:
        raise ApiError(
            422, "unknown_pathway", "The map has no pathway with these choices.", details=plans.pathway_facts(ref)
        )
    if found.status != "runnable":
        raise ApiError(
            409,
            "pathway_not_runnable",
            f"This pathway is {found.status.replace('_', ' ')}, not runnable (milestone {found.milestone}).",
            details={"status": found.status, "milestone": found.milestone},
        )
    return found


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    app = FastAPI(
        title="Meta-Analysis Atlas API",
        version="0.2.0",
        description="Reads the map of analysis pathways and runs the pathways the map marks as runnable.",
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

    @app.post("/api/v1/meta-analysis/run", tags=["analysis"], responses=RUN_ERRORS)
    async def run(
        request: plans.RunRequest,
        data: Annotated[MapData, Depends(get_map)],
        r_service: Annotated[RService, Depends(get_r_service)],
    ) -> plans.RunResponse:
        """Run a **runnable** pathway on a study table, and return the estimates, the studies and the R code.

        The request is checked against the map first: a pathway the map doesn't have is `422 unknown_pathway`; one
        that isn't runnable is `409 pathway_not_runnable`, with its status and milestone.
        """
        found = runnable_pathway(data, request.pathway)
        allowed = data.raw["methods"][found.method]["analysis"]
        prepared = plans.prepare(request, allowed)
        results = await r_service.execute(prepared.plan, prepared.columns)
        return plans.build_response(request, prepared, results)

    @app.get("/api/v1/meta-analysis/spec", tags=["analysis"], responses=RUN_ERRORS)
    def data_spec(
        pathway: Annotated[plans.PathwayRef, Query()], data: Annotated[MapData, Depends(get_map)]
    ) -> DataSpec:
        """What a study table must hold for a **runnable** pathway: its columns, in plain words, and the checks made.

        The Workbench's "What the file needs" table is built from this, and `/run` checks data against it.
        """
        runnable_pathway(data, pathway)
        return plans.data_spec(pathway)

    @app.get(
        "/api/v1/meta-analysis/template",
        tags=["analysis"],
        responses={**RUN_ERRORS, 200: {"content": {"text/csv": {}}, "description": "A CSV template"}},
        response_class=Response,
    )
    def template(pathway: Annotated[plans.PathwayRef, Query()], data: Annotated[MapData, Depends(get_map)]) -> Response:
        """A CSV template for a **runnable** pathway: its header and one example row (the first BCG vaccine trial)."""
        found = runnable_pathway(data, pathway)
        filename = f"atlas-template-{found.method}-{found.metric}.csv".lower()
        return Response(
            content=template_csv(plans.data_spec(pathway)),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    return app


app = create_app()

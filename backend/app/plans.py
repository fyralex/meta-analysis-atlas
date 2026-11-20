"""From a pathway, an analysis type and options to an R service plan (decision 0018; defaults in decision 0019).

Scope (#148): the 12 interventional, two-group, arm-level, binary pathways. The map decides which pathways exist and
which are runnable; this module only knows how to build a plan for those 12, and says so for any other.

The R code shown with a result is rendered from the same plan the service runs, so it can't differ from what ran.
It is only shown: nothing here or in the service evaluates it.
"""

import json
import math
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from .data_spec import TWO_GROUP_BINARY, DataSpec, check_data
from .errors import ApiError, FieldError
from .funnel import Funnel, funnel
from .interpretation import Interpretation, Labels, sentence

AnalysisType = Literal["standard", "cumulative", "leave-one-out"]
# The twelve estimators of rma.uni's `method` except GENQ and GENQM, which need study weights chosen by the user
# (metafor stops with "Must specify the 'weights' argument"). The request has no place for weights yet.
Estimator = Literal["DL", "HE", "HS", "HSk", "SJ", "ML", "REML", "EB", "PM", "PMM"]
Interval = Literal["z", "knha"]

# the tiers every supported pathway shares
FRAMEWORK = "1. Interventional (effect of an intervention)"
GROUP = "Two groups (pairwise)"
DATATYPE = "Arm-level summary data"
OUTCOME = "Binary"
COMMON = "Common effect"
RANDOM = "Random effects"

# (model, method) -> the metrics that have a plan; the map's own list is checked against this in the tests
SUPPORTED: dict[tuple[str, str], tuple[str, ...]] = {
    (COMMON, "IV"): ("OR", "RR", "RD", "AS"),
    (RANDOM, "IV"): ("OR", "RR", "RD", "AS"),
    (COMMON, "MH"): ("OR", "RR", "RD"),
    (COMMON, "PETO"): ("PETO",),
}
# metrics on the ratio scale: the estimate is a log ratio, and the result also gives it back-transformed
RATIOS = ("OR", "RR", "PETO")
DEFAULT_LEVEL = 95.0

POST_STEPS: dict[str, str] = {"cumulative": "cumul", "leave-one-out": "leave1out"}
# the analysis types this builder can run; the map's list for the method says which of them are valid
BUILDABLE = ("standard", *POST_STEPS)

SUMMARY_KEYS = (
    "estimate",
    "se",
    "ci_lower",
    "ci_upper",
    "zval",
    "pval",
    "tau2",
    "i2",
    "h2",
    "q",
    "q_pval",
    "k",
    "pi_lower",
    "pi_upper",
)
BACK_TRANSFORMED = ("estimate", "ci_lower", "ci_upper", "pi_lower", "pi_upper")


class PathwayRef(BaseModel):
    """A pathway as the map writes it: one value for each of the seven tiers."""

    model_config = ConfigDict(extra="forbid")

    framework: str
    group: str
    datatype: str
    outcome: str
    model: str
    method: str
    metric: str


class Options(BaseModel):
    """What a request may choose. Zero-cell handling is not among them (decision 0019)."""

    model_config = ConfigDict(extra="forbid")

    estimator: Estimator | None = Field(None, description="Between-study variance estimator; random effects only.")
    interval: Interval | None = Field(
        None, description='"z" (Wald, the default) or "knha" (Hartung-Knapp-Sidik-Jonkman); random effects only.'
    )
    level: float = Field(DEFAULT_LEVEL, gt=0, lt=100, description="Confidence level, in percent.")


class RunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pathway: PathwayRef
    analysis_type: AnalysisType = "standard"
    options: Options = Field(default_factory=lambda: Options(estimator=None, interval=None, level=DEFAULT_LEVEL))
    data: list[dict[str, Any]] = Field(description="One object per study: study, ai, n1i, ci, n2i.")
    labels: Labels | None = Field(None, description="Optional words for the interpretation sentence.")


class StudyRow(BaseModel):
    study: str
    yi: float | None
    vi: float | None
    weight: float | None
    used: bool


class RunResponse(BaseModel):
    pathway: PathwayRef
    analysis_type: AnalysisType
    options: Options
    summary: dict[str, float | None]
    ratio_scale: dict[str, float | None] | None = Field(
        None, description="For ratio metrics: the estimate and intervals back-transformed from the log scale."
    )
    studies: list[StudyRow]
    left_out: list[str] = Field(description="Studies the model did not use, such as double-zero studies for a ratio.")
    steps: list[dict[str, Any]] | None = Field(
        None, description="Cumulative or leave-one-out analysis: one row per study, on the model's scale."
    )
    r_code: str = Field(description="The R code that gives this result. Shown only; the service never runs it.")
    funnel: Funnel | None = Field(None, description="What the funnel plot needs, with its caption (#161).")
    interpretation: Interpretation | None = Field(
        None, description="One fixed sentence saying what the pooled result means, with its sources (#160)."
    )


@dataclass(frozen=True)
class Prepared:
    """A validated request, ready for the R service."""

    plan: dict[str, Any]
    columns: dict[str, list[Any]]
    options: Options


def _col(name: str) -> dict[str, str]:
    return {"column": name}


def check_pathway(pathway: PathwayRef) -> None:
    """The pathway must be one this builder knows. (Whether it is in the map and runnable is the endpoint's check.)"""
    shared = (pathway.framework, pathway.group, pathway.datatype, pathway.outcome) == (
        FRAMEWORK,
        GROUP,
        DATATYPE,
        OUTCOME,
    )
    if not shared or pathway.metric not in SUPPORTED.get((pathway.model, pathway.method), ()):
        raise ApiError(
            501,
            "pathway_not_implemented",
            "The plan builder has no plan for this pathway.",
            details=pathway_facts(pathway),
        )


def pathway_facts(pathway: PathwayRef) -> dict[str, Any]:
    return {"pathway": pathway.model_dump()}


def check_options(pathway: PathwayRef, analysis_type: str, options: Options, allowed_analyses: list[str]) -> None:
    errors: list[FieldError] = []
    if analysis_type not in allowed_analyses or analysis_type not in BUILDABLE:
        errors.append(
            FieldError(
                path="analysis_type",
                message=f"{pathway.method} supports {', '.join(a for a in allowed_analyses if a in BUILDABLE)}.",
            )
        )
    if pathway.model == COMMON or pathway.method != "IV":
        for name in ("estimator", "interval"):
            if getattr(options, name) is not None:
                message = "Only a random-effects inverse-variance analysis has a between-study variance to estimate."
                errors.append(FieldError(path=f"options.{name}", message=message))
    if errors:
        raise ApiError(422, "invalid_option", "An option does not apply to this pathway.", errors)


def data_spec(pathway: PathwayRef) -> DataSpec:
    """The study table a supported pathway reads (#158). All 12 read the same counts."""
    check_pathway(pathway)
    return TWO_GROUP_BINARY


def build_plan(pathway: PathwayRef, analysis_type: AnalysisType, options: Options) -> dict[str, Any]:
    """The R service plan for a supported pathway (README of r_service/ for the format)."""
    counts = {c.name: _col(c.name) for c in TWO_GROUP_BINARY.columns if c.kind == "count"}
    study = _col("study")
    plan: dict[str, Any] = {}
    if pathway.method == "IV":
        effect_args: dict[str, Any] = {"measure": pathway.metric, **counts, "slab": study}
        if pathway.metric in ("OR", "RR"):
            # studies with no events in either arm say nothing about a ratio (decision 0019)
            effect_args["drop00"] = True
        plan["effect"] = {"fn": "escalc", "args": effect_args}
        random = pathway.model == RANDOM
        plan["model"] = {
            "fn": "rma.uni",
            "args": {
                "yi": _col("yi"),
                "vi": _col("vi"),
                "slab": study,
                "method": (options.estimator or "REML") if random else "EE",
                "test": (options.interval or "z") if random else "z",
                "level": options.level,
            },
        }
    elif pathway.method == "MH":
        plan["model"] = {
            "fn": "rma.mh",
            "args": {"measure": pathway.metric, **counts, "slab": study, "level": options.level},
        }
    else:
        plan["model"] = {"fn": "rma.peto", "args": {**counts, "slab": study, "level": options.level}}
    if analysis_type in POST_STEPS:
        plan["post"] = {"fn": POST_STEPS[analysis_type]}
    plan["outputs"] = list(SUMMARY_KEYS)
    return plan


def prepare(request: RunRequest, allowed_analyses: list[str]) -> Prepared:
    """Check a request that names a runnable pathway, and build its plan. Nothing here reaches the network."""
    check_pathway(request.pathway)
    check_options(request.pathway, request.analysis_type, request.options, allowed_analyses)
    columns = check_data(request.data, data_spec(request.pathway))
    plan = build_plan(request.pathway, request.analysis_type, request.options)
    return Prepared(plan=plan, columns=columns, options=request.options)


def common_effect_plan(plan: dict[str, Any]) -> dict[str, Any] | None:
    """For a random-effects rma.uni plan, the same data fitted with a common effect: the funnel's centre (decision 0020).

    None when the plan is already common-effect (EE, rma.mh, rma.peto): its own estimate is the centre.
    """
    model = plan["model"]
    if model["fn"] != "rma.uni" or model["args"].get("method") == "EE":
        return None
    args = {**model["args"], "method": "EE", "test": "z"}
    return {
        **{k: v for k, v in plan.items() if k not in ("post", "outputs")},
        "model": {**model, "args": args},
        "outputs": ["estimate"],
    }


# ---- the R code shown ----------------------------------------------------------------------------------------------


def _r_value(value: Any) -> str:
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, str):
        # a JSON string literal is also a valid R string literal; study labels come from the user
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return repr(value)
    raise TypeError(f"no R form for {value!r}")


def _r_args(args: dict[str, Any]) -> str:
    parts = []
    for name, value in args.items():
        shown = value["column"] if isinstance(value, dict) else _r_value(value)
        parts.append(f"{name} = {shown}")
    return ", ".join(parts)


def _r_data(columns: dict[str, list[Any]]) -> str:
    lines = [f"  {name} = c({', '.join(_r_value(v) for v in values)})" for name, values in columns.items()]
    return "dat <- data.frame(\n" + ",\n".join(lines) + ",\n  stringsAsFactors = FALSE\n)"


def render_r_code(plan: dict[str, Any], columns: dict[str, list[Any]], metric: str) -> str:
    """R code that gives the plan's result, written the way a metafor user would."""
    lines = ["library(metafor)", "", _r_data(columns), ""]
    effect = plan.get("effect")
    if effect:
        lines.append(f"dat <- {effect['fn']}({_r_args(effect['args'])}, data = dat)")
    model = plan["model"]
    # the columns the model reads are named in the arguments, so `data = dat` finds them
    lines.append(f"fit <- {model['fn']}({_r_args(model['args'])}, data = dat)")
    lines.append("print(fit)")
    if metric in RATIOS:
        lines += ["", "# back on the ratio scale", "pred <- predict(fit, transf = exp)", "print(pred)"]
    ce = common_effect_plan(plan)
    lines += ["", "# funnel plot: the 95% region is centred on the common-effect estimate (decision 0020)"]
    if ce is not None:
        lines.append(f"ce <- {ce['model']['fn']}({_r_args(ce['model']['args'])}, data = dat)")
        lines.append("funnel(ce, level = 95)")
    else:
        lines.append("funnel(fit, level = 95)")
    post = plan.get("post")
    if post:
        lines += ["", f"steps <- {post['fn']}(fit)", "print(steps)"]
    return "\n".join(lines) + "\n"


# ---- the answer ----------------------------------------------------------------------------------------------------


def _exp(value: float | None) -> float | None:
    if value is None:
        return None
    try:
        return math.exp(value)
    except OverflowError:
        return None


def build_response(
    request: RunRequest, prepared: Prepared, results: dict[str, Any], common_effect: float | None = None
) -> RunResponse:
    """`common_effect` is the estimate from `common_effect_plan`, for a random-effects plan; else the analysis's own."""
    summary: dict[str, float | None] = {key: results["summary"].get(key) for key in SUMMARY_KEYS}
    ratio_scale = None
    if request.pathway.metric in RATIOS:
        ratio_scale = {key: _exp(summary[key]) for key in BACK_TRANSFORMED}
    studies = [StudyRow.model_validate(row) for row in results["studies"]]
    read_on = ratio_scale if ratio_scale is not None else summary
    point, lower, upper = (read_on.get(key) for key in ("estimate", "ci_lower", "ci_upper"))
    interpretation = None
    if point is not None and lower is not None and upper is not None:
        interpretation = sentence(
            metric=request.pathway.metric,
            model=request.pathway.model,
            k=sum(s.used for s in studies),
            level=prepared.options.level,
            estimate=point,
            lower=lower,
            upper=upper,
            labels=request.labels,
        )
    centre = common_effect if common_effect is not None else summary["estimate"]
    plot = None
    if centre is not None:
        plot = funnel(
            centre=centre,
            ratio=request.pathway.metric in RATIOS,
            odds=request.pathway.metric in ("OR", "PETO"),
            studies=[(s.study, s.yi, s.vi, s.used) for s in studies],
        )
    return RunResponse(
        pathway=request.pathway,
        analysis_type=request.analysis_type,
        options=prepared.options,
        summary=summary,
        ratio_scale=ratio_scale,
        studies=studies,
        left_out=[s.study for s in studies if not s.used],
        steps=results.get("steps"),
        r_code=render_r_code(prepared.plan, prepared.columns, request.pathway.metric),
        interpretation=interpretation,
        funnel=plot,
    )

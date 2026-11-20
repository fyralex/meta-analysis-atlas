"""What the Workbench's funnel plot needs, and its caption (#161; decision 0020).

Sources (Cochrane Handbook ch. 13, current version, read 2026-11-20):

- A funnel plot shows each study's estimate across and its standard error down, the scale reversed so larger studies
  are at the top; ratios on the log scale (13.3.4.2).
- The region where 95% of studies would fall without bias or heterogeneity is based on a fixed-effect (common-effect)
  meta-analysis (13.3.4.2), so it is centred on the common-effect estimate (decision 0020).
- Asymmetry is not diagnostic of non-reporting bias: heterogeneity, bias in smaller studies, artefact and chance can
  all cause it (13.3.4.3, Table 13.3.b; 13.3.4.5).
- Odds ratios are correlated with their standard errors, which can make a funnel asymmetric by itself (13.3.4.3).
- Tests for asymmetry need at least 10 studies (13.3.4.4). None is run here.
"""

import math

from pydantic import BaseModel, Field

from .interpretation import SourceRef

LEVEL = 95.0
Z = 1.959963984540054  # the 97.5th percentile of the standard normal: the region is always 95% (decision 0020)
FEW = 10


class FunnelPoint(BaseModel):
    study: str
    yi: float = Field(description="The study's estimate, on the scale the model works on (log for ratios).")
    sei: float = Field(description="Its standard error: the square root of its sampling variance.")


class Funnel(BaseModel):
    centre: float = Field(description="The common-effect estimate the 95% region is centred on (decision 0020).")
    centre_model: str = Field(description='Always "Common effect".')
    level: float = Field(LEVEL, description="The region's level, in percent; always 95.")
    z: float = Field(Z, description="The region is centre ± z × SE at each standard error.")
    log_scale: bool = Field(description="True for ratios: the axis is the log of the ratio.")
    points: list[FunnelPoint] = Field(description="One point per study the model used.")
    caption: str
    sources: list[SourceRef]


def funnel(
    *, centre: float, ratio: bool, odds: bool, studies: list[tuple[str, float | None, float | None, bool]]
) -> Funnel:
    """`studies` holds (label, yi, vi, used) for every study; only the used ones with an estimate become points."""
    points = [
        FunnelPoint(study=label, yi=yi, sei=math.sqrt(vi))
        for label, yi, vi, used in studies
        if used and yi is not None and vi is not None and vi >= 0
    ]
    text = [
        "Each point is a study: its estimate across, its standard error down, so larger studies are at the top.",
        "The triangle is where 95% of studies would fall around the common-effect estimate if there were no bias"
        " and no heterogeneity.",
        "Asymmetry does not by itself show non-reporting bias (such as publication bias): differences between"
        " studies, bias in smaller studies and chance can all cause it.",
    ]
    sources = [
        SourceRef(key="CH-13", section="13.3.4.2"),
        SourceRef(key="CH-13", section="13.3.4.3"),
        SourceRef(key="CH-13", section="13.3.4.5"),
    ]
    if odds:
        text.append(
            "For odds ratios, the estimate and its standard error are related, which can make a funnel look"
            " asymmetric by itself."
        )
    if len(points) < FEW:
        text.append(f"With fewer than {FEW} studies, tests for asymmetry are not recommended; none is run here.")
        sources.append(SourceRef(key="CH-13", section="13.3.4.4"))
    else:
        text.append("No test for asymmetry is run here.")
    return Funnel(
        centre=centre,
        centre_model="Common effect",
        level=LEVEL,
        z=Z,
        log_scale=ratio,
        points=points,
        caption=" ".join(text),
        sources=sources,
    )

"""One fixed sentence that says what a pooled result means (#160). No LLM: owner's decision on #150.

Each template states only what its source says about the measure and the model, cited by section below and in the
response. Sources (Cochrane Handbook, current version, read 2026-11-20; metafor's escalc() reference page):

- Risk ratio: the risk in one group as a multiple of the risk in the other (Handbook 6.4.1.2).
- Odds ratio: the same for odds, which are not risks; an OR is not an RR, and reading it as one is a common error
  (6.4.1.1, 6.4.1.3, 10.4.3).
- Peto odds ratio: an approximation to the OR that works well when events are rare, effects small and groups of
  similar size (10.4.2).
- Risk difference: a difference in risks (6.4.1.4); shown here in percentage points (the proportion times 100).
- Arcsine difference: asin(sqrt(p1)) - asin(sqrt(p2)); twice it is Cohen's h; positive means the event is more
  common in group 1 (metafor escalc(), measure "AS").
- Common effect: assumes every study estimates one shared effect (10.3.1). Random effects: assumes the studies'
  effects differ but are related (10.3.2), and its summary is their average (10.10.4.1).

The sentences never say "statistically significant" (Handbook 15.3.2, not yet a source in the map, so cited here
only) and make no causal claim. Labels a person
types are plain text: whitespace is collapsed and they are placed in the sentence as given, never interpreted.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

COMMON = "Common effect"
RANDOM = "Random effects"
MINUS = "−"


class Labels(BaseModel):
    """Optional words for the sentence, as a person would say them: "tuberculosis", "vaccinated", "unvaccinated"."""

    model_config = ConfigDict(extra="forbid")

    outcome: str | None = Field(None, max_length=60, pattern=r"^[^\r\n\t]*$", description="The event, e.g. death.")
    treatment: str | None = Field(None, max_length=40, pattern=r"^[^\r\n\t]*$", description="Group 1, e.g. vaccinated.")
    control: str | None = Field(None, max_length=40, pattern=r"^[^\r\n\t]*$", description="Group 2, e.g. placebo.")


class SourceRef(BaseModel):
    key: str = Field(description="A source key of the map (map.json `sources`).")
    section: str


class Interpretation(BaseModel):
    text: str
    sources: list[SourceRef]


Model = Literal["Common effect", "Random effects"]


def _clean(text: str | None, default: str) -> str:
    words = " ".join((text or "").split())
    return words or default


def _num(value: float, places: int) -> str:
    """A number as shown in the sentence, with a true minus sign."""
    text = f"{value:.{places}f}"
    return text.replace("-", MINUS) if not set(text) <= {"-", "0", "."} else text.lstrip("-")


def _interval(level: float, lower: float, upper: float, places: int, unit: str = "") -> str:
    shown = f"{level:g}"
    return f"{shown}% CI {_num(lower, places)}{unit} to {_num(upper, places)}{unit}"


def _opening(model: str, k: int) -> tuple[str, list[SourceRef]]:
    studies = f"{k} studies"
    if k == 1:
        # double-zero studies dropped from a ratio can leave one; nothing is shared or averaged then
        return "From the 1 study used,", [SourceRef(key="CH-10", section="10.3.1" if model == COMMON else "10.3.2")]
    if model == RANDOM:
        # different but related effects (10.3.2), whose average the summary is (10.10.4.1; #172 audit)
        averaged = [SourceRef(key="CH-10", section="10.3.2"), SourceRef(key="CH-10", section="10.10.4.1")]
        return f"On average across the {studies},", averaged
    return f"Assuming one effect shared by all {studies},", [SourceRef(key="CH-10", section="10.3.1")]


def sentence(
    *,
    metric: str,
    model: str,
    k: int,
    level: float,
    estimate: float,
    lower: float,
    upper: float,
    labels: Labels | None = None,
) -> Interpretation:
    """The sentence for a pooled result. `estimate`, `lower` and `upper` are on the scale the metric is read on:
    the ratio itself for OR, RR and PETO (not its log), the difference for RD and AS."""
    words = labels or Labels(outcome=None, treatment=None, control=None)
    outcome = _clean(words.outcome, "")
    of = f" of {outcome}" if outcome else ""
    treatment = _clean(words.treatment, "treatment")
    control = _clean(words.control, "control")
    opening, model_source = _opening(model, k)
    tail = ""
    if model == RANDOM and k > 1:
        tail = " This is the average of effects that may differ between studies, not one shared effect."

    if metric == "RR":
        body = (
            f" the risk{of} in the {treatment} groups was {_num(estimate, 2)} times the risk in the {control} groups"
            f" ({_interval(level, lower, upper, 2)})."
        )
        sources = [SourceRef(key="CH-6", section="6.4.1.2")]
    elif metric in ("OR", "PETO"):
        body = (
            f" the odds{of} in the {treatment} groups were {_num(estimate, 2)} times the odds in the {control} groups"
            f" ({_interval(level, lower, upper, 2)})."
            " Odds are not risks, so this is not a risk ratio; the two differ most when the event is common."
        )
        sources = [
            SourceRef(key="CH-6", section="6.4.1.1"),
            SourceRef(key="CH-6", section="6.4.1.3"),
            SourceRef(key="CH-10", section="10.4.3"),
        ]
        if metric == "PETO":
            body += (
                " Peto's method gives an approximation to the odds ratio that works well when events are rare,"
                " effects are small and the groups are of similar size."
            )
            sources.append(SourceRef(key="CH-10", section="10.4.2"))
    elif metric == "RD":
        points = estimate * 100
        if round(points, 1) == 0:
            change = "differed by less than 0.05 percentage points from the risk"
        else:
            change = f"was {_num(abs(points), 1)} percentage points {'higher' if points > 0 else 'lower'} than the risk"
        body = (
            f" the risk{of} in the {treatment} groups {change} in the {control} groups"
            f" ({_interval(level, lower * 100, upper * 100, 1)} percentage points)."
        )
        sources = [SourceRef(key="CH-6", section="6.4.1.4")]
    elif metric == "AS":
        body = (
            f" the arcsine difference{of} between the {treatment} and {control} groups was {_num(estimate, 3)}"
            f" ({_interval(level, lower, upper, 3)})."
            f" It is the difference in arcsine square root transformed risks: positive means the event was more common"
            f" in the {treatment} groups, and twice it is Cohen's h. It has no direct reading as a risk."
        )
        sources = [SourceRef(key="MF-escalc", section='measure "AS"')]
    else:
        raise ValueError(f"no sentence for metric {metric!r}")
    return Interpretation(text=opening + body + tail, sources=[*sources, *model_source])

"""Meta-analysis map: the data and the generator.

Everything the map knows is in this file: sources, metrics, methods,
branches and rules. Running it writes:

  spec/map.json     the full data and every generated pathway
  spec/backbone.md  the building blocks and rules, as tables
  spec/tree.md      the full tree as text
  spec/map.html     the full tree as a page you can search

Flags used on every entry:
  verified  False = not yet confirmed from a primary source read online
  added     True  = not in taxonomy v11 (needs a scope decision)

Change ORDER to redraw the tree with different tiers; the valid
combinations do not change.

The generated pathways are pinned in spec/pathways.lock.json, which a test
compares with them. After a change to the map, run with --lock to rewrite
it, and explain each difference in the pull request.
"""

from __future__ import annotations

import argparse
import html
import json
import pathlib
from collections.abc import Iterable, Mapping, Sequence
from typing import Protocol, TypedDict

HERE = pathlib.Path(__file__).parent
LOCK = HERE / "pathways.lock.json"
ORDER = ["model", "method", "metric"]  # v11 order. Alternative: metric, method, model


class Metric(TypedDict):
    label: str
    call: str
    src: str
    added: bool
    verified: bool
    only: set[str] | None


class Method(TypedDict):
    label: str
    fn: str
    domain: str
    takes: set[str]
    models: list[str]
    analysis: list[str]
    src: list[str]
    metrics: set[str] | None
    note: str
    added: bool
    verified: bool
    added_models: set[str]


class Branch(TypedDict):
    fw: str
    group: str
    datatype: str
    kind: str
    outcome: str
    inputs: str
    metrics: list[str]
    domain: str
    added: bool
    verified: bool
    note: str


class Pathway(TypedDict):
    framework: str
    group: str
    datatype: str
    outcome: str
    model: str
    method: str
    metric: str
    verified: bool
    added: bool
    milestone: str
    status: str


class Node(TypedDict):
    """One node of the tree: its children by (tier, value), and the pathway when it is a leaf."""

    kids: dict[tuple[str, str], Node]
    leaf: Pathway | None


class Emit(Protocol):
    def __call__(
        self,
        depth: int,
        tier: str | None,
        label: str | None,
        note: str | None,
        verified: bool | None,
        added: bool | None,
        n: int | None,
        *,
        is_leaf: bool | None,
    ) -> None: ...


CH = "https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-"
MF = "https://wviechtb.github.io/metafor/reference/"
SOURCES: dict[str, tuple[str, str]] = {
    "MF-escalc": ("metafor, escalc()", MF + "escalc.html"),
    "MF-uni": ("metafor, rma.uni()", MF + "rma.uni.html"),
    "MF-mh": ("metafor, rma.mh()", MF + "rma.mh.html"),
    "MF-peto": ("metafor, rma.peto()", MF + "rma.peto.html"),
    "MF-glmm": ("metafor, rma.glmm()", MF + "rma.glmm.html"),
    "MF-mv": ("metafor, rma.mv()", MF + "rma.mv.html"),
    "MF-cumul": ("metafor, cumul()", MF + "cumul.html"),
    "MF-l1o": ("metafor, leave1out()", MF + "leave1out.html"),
    "MF-models": ("metafor, model types", MF + "misc-models.html"),
    "MF-regtest": ("metafor, regtest()", MF + "regtest.html"),
    "MF-trimfill": ("metafor, trimfill()", MF + "trimfill.html"),
    "MF-selmodel": ("metafor, selmodel()", MF + "selmodel.html"),
    "MD-senn": (
        "metadat, dat.senn2013 (network models with rma.mv)",
        "https://wviechtb.github.io/metadat/reference/dat.senn2013.html",
    ),
    "CH-6": ("Cochrane Handbook Ch. 6, effect measures", CH + "06"),
    "CH-10": ("Cochrane Handbook Ch. 10, meta-analysis", CH + "10"),
    "CH-11": ("Cochrane Handbook Ch. 11, network meta-analysis", CH + "11"),
    "CH-13": ("Cochrane Handbook Ch. 13, missing results", CH + "13"),
    "CH-23": ("Cochrane Handbook Ch. 23, variants on randomized trials", CH + "23"),
    "CH-26": ("Cochrane Handbook Ch. 26, individual participant data", CH + "26"),
    "BM": ("bayesmeta manual", "https://cran.r-project.org/web/packages/bayesmeta/refman/bayesmeta.html"),
    "BM-bmr": ("bayesmeta, bmr()", "https://rdrr.io/cran/bayesmeta/man/bmr.html"),
    "NM": ("netmeta, netmeta()", "https://rdrr.io/cran/netmeta/man/netmeta.html"),
    "NM-bin": ("netmeta, netmetabin()", "https://rdrr.io/cran/netmeta/man/netmetabin.html"),
    "NM-man": ("netmeta manual", "https://cran.r-project.org/web/packages/netmeta/refman/netmeta.html"),
    "META-bin": ("meta, metabin()", "https://rdrr.io/cran/meta/man/metabin.html"),
    "META-cont": ("meta, metacont()", "https://rdrr.io/cran/meta/man/metacont.html"),
    "DMA": ("Harrer et al., Doing Meta-Analysis in R, network chapter", "https://doing-meta.guide/netwma.html"),
    "MADA": ("mada, reitsma()", "https://rdrr.io/cran/mada/man/reitsma.html"),
    "DTA-HB": (
        "Cochrane Handbook for Diagnostic Test Accuracy v2.0, Ch. 9 and 10 (PDF needs a Cochrane account; not read)",
        "https://www.cochrane.org/authors/handbooks-and-manuals/handbook-systematic-reviews-diagnostic-test-accuracy",
    ),
    "VALMETA": ("metamisc, valmeta()", "https://rdrr.io/cran/metamisc/man/valmeta.html"),
    "DEBRAY": (
        "Debray et al. 2017, BMJ 356:i6460, prediction model performance (not readable online)",
        "https://www.bmj.com/content/356/bmj.i6460",
    ),
    "RILEY": (
        "Riley et al. 2019, BMJ 364:k4597, prognostic factor studies (not readable online)",
        "https://www.bmj.com/content/364/bmj.k4597",
    ),
    "DOSRES": ("dosresmeta, dosresmeta()", "https://rdrr.io/cran/dosresmeta/man/dosresmeta.html"),
}

# --------------------------------------------------------------------------
# Metrics. key -> (label, exact call, source, flags)
# --------------------------------------------------------------------------


def m(
    label: str,
    call: str,
    src: str = "MF-escalc",
    added: bool = False,
    verified: bool = True,
    only: set[str] | None = None,
) -> Metric:
    return Metric(label=label, call=call, src=src, added=added, verified=verified, only=only)


E = 'escalc(measure="%s")'
METRICS: dict[str, Metric] = {
    # one group
    "PR": m("Raw proportion", E % "PR"),
    "PLN": m("Log proportion", E % "PLN"),
    "PLO": m("Logit proportion", E % "PLO"),
    "PAS": m("Arcsine square-root proportion", E % "PAS"),
    "PFT": m("Freeman-Tukey double arcsine proportion", E % "PFT"),
    "PRZ": m("Probit proportion", E % "PRZ", added=True),
    "MN": m("Raw mean", E % "MN"),
    "SMN": m("Standardized mean", E % "SMN"),
    "MNLN": m("Log mean", E % "MNLN", added=True),
    "IR": m("Raw incidence rate", E % "IR"),
    "IRLN": m("Log incidence rate", E % "IRLN"),
    "IRS": m("Square-root incidence rate", E % "IRS", added=True),
    "IRFT": m("Freeman-Tukey incidence rate", E % "IRFT", added=True),
    # two groups
    "OR": m("Odds ratio (log)", E % "OR"),
    "RR": m("Risk ratio (log)", E % "RR"),
    "RD": m("Risk difference", E % "RD"),
    "AS": m("Arcsine square-root risk difference", E % "AS"),
    "PETO": m("Peto odds ratio (log)", E % "PETO", only={"PETO"}),
    "MD": m("Mean difference", E % "MD"),
    "SMD_G": m("Hedges' g (bias-corrected standardized mean difference)", E % "SMD"),
    "SMD_D": m("Cohen's d (uncorrected standardized mean difference)", 'escalc(measure="SMD", correct=FALSE)'),
    "SMDH": m("Standardized mean difference, unequal variances", E % "SMDH", added=True),
    "SMD1": m("Standardized mean difference using one group's SD (Glass-type)", E % "SMD1", added=True),
    "ROM": m("Ratio of means (log)", E % "ROM"),
    "IRR": m("Incidence rate ratio (log)", E % "IRR"),
    "IRD": m("Incidence rate difference", E % "IRD"),
    "IRSD": m("Square-root incidence rate difference", E % "IRSD", added=True),
    "HR": m("Hazard ratio (log)", "no escalc measure; enter log HR and its SE", "CH-10"),
    "POR": m("Proportional odds ratio (log)", "no escalc measure; enter the log OR and its SE", "CH-10", added=True),
    # change / matched pairs
    "MC": m("Mean change", E % "MC", added=True),
    "SMCC": m("Standardized mean change (change-score SD)", E % "SMCC", added=True),
    "SMCR": m("Standardized mean change (raw-score SD)", E % "SMCR", added=True),
    "ROMC": m("Ratio of means for change (log)", E % "ROMC", added=True),
    "MPRR": m("Matched-pairs marginal risk ratio (log)", E % "MPRR", added=True),
    "MPOR": m("Matched-pairs marginal odds ratio (log)", E % "MPOR", added=True),
    "MPRD": m("Matched-pairs marginal risk difference", E % "MPRD", added=True),
    "MPORC": m("Matched-pairs conditional odds ratio (log)", E % "MPORC", added=True),
    # IPD one-stage: the coefficient of the regression
    "I_OR": m("Odds ratio from the treatment coefficient", "logistic mixed model", "CH-26", verified=False),
    "I_MD": m("Mean difference from the treatment coefficient", "linear mixed model", "CH-26", verified=False),
    "I_IRR": m("Rate ratio from the treatment coefficient", "Poisson mixed model", "CH-26", verified=False),
    "I_HR": m(
        "Hazard ratio from the treatment coefficient",
        "Cox model stratified by study or with frailty",
        "CH-26",
        verified=False,
    ),
    "I_P": m("Pooled proportion (logit scale)", "logistic mixed model, intercept only", "CH-26", verified=False),
    "I_M": m("Pooled mean", "linear mixed model, intercept only", "CH-26", verified=False),
    "I_R": m("Pooled rate (log scale)", "Poisson mixed model, intercept only", "CH-26", verified=False),
    # network (netmeta sm codes)
    "N_OR": m("Odds ratio", 'netmeta(sm="OR")', "NM"),
    "N_RR": m("Risk ratio", 'netmeta(sm="RR")', "NM"),
    "N_RD": m("Risk difference", 'netmeta(sm="RD")', "NM"),
    "N_ASD": m("Arcsine difference", 'netmeta(sm="ASD")', "NM", added=True),
    "N_MD": m("Mean difference", 'netmeta(sm="MD")', "NM"),
    "N_SMD": m("Standardized mean difference", 'netmeta(sm="SMD")', "NM"),
    "N_ROM": m("Ratio of means", 'netmeta(sm="ROM")', "NM"),
    # netmeta's examples run both through pairwise(event, time), which uses metainc()'s measures
    "N_IRR": m("Incidence rate ratio", 'netmeta(pairwise(event, time, sm="IRR"))', "NM"),
    "N_IRD": m("Incidence rate difference", 'netmeta(pairwise(event, time, sm="IRD"))', "NM"),
    "N_HR": m("Hazard ratio", 'netmeta(sm="HR")', "NM"),
    # diagnostic test accuracy
    "SESP": m("Summary sensitivity and specificity (estimated jointly)", "mada::reitsma()", "MADA"),
    "SROC": m("Summary ROC curve", "HSROC model", "DTA-HB", verified=False),
    "DOR": m("Diagnostic odds ratio", "mada::madauni()", "DTA-HB", verified=False),
    "LRP": m("Positive likelihood ratio", "mada::madauni()", "DTA-HB", verified=False),
    "LRN": m("Negative likelihood ratio", "mada::madauni()", "DTA-HB", verified=False),
    # prognosis
    "CSTAT": m("c-statistic (logit scale)", 'valmeta(measure="cstat")', "VALMETA"),
    "OE": m("Total observed:expected ratio (log scale)", 'valmeta(measure="OE")', "VALMETA"),
    "PF_HR": m("Adjusted hazard ratio (log)", "enter log HR and its SE", "RILEY", verified=False),
    "PF_OR": m("Adjusted odds ratio (log)", "enter log OR and its SE", "RILEY", verified=False),
    "PF_RR": m("Adjusted risk ratio (log)", "enter log RR and its SE", "RILEY", verified=False),
    "PF_MD": m("Adjusted mean difference", "enter MD and its SE", "RILEY", verified=False),
    # association
    "COR": m("Raw correlation", E % "COR"),
    "UCOR": m("Bias-corrected correlation", E % "UCOR"),
    "ZCOR": m("Fisher's z-transformed correlation", E % "ZCOR"),
    "RPB": m("Point-biserial correlation", E % "RPB"),
    "RBIS": m("Biserial correlation", E % "RBIS"),
    "PHI": m("Phi coefficient", E % "PHI"),
    "RTET": m("Tetrachoric correlation", E % "RTET"),
    "PCOR": m("Partial correlation", E % "PCOR"),
    "EX_OR": m("Adjusted odds ratio (log)", "enter log OR and its SE", "CH-10", verified=False),
    "EX_RR": m("Adjusted risk ratio (log)", "enter log RR and its SE", "CH-10", verified=False),
    "EX_HR": m("Adjusted hazard ratio (log)", "enter log HR and its SE", "CH-10", verified=False),
    "DR_RR": m("Trend in log relative risk per unit of dose", "dosresmeta(logrr ~ dose)", "DOSRES"),
    "DR_MD": m("Trend in mean difference per unit of dose", 'dosresmeta(covariance="md")', "DOSRES"),
    "DR_SMD": m("Trend in standardized mean difference per unit of dose", 'dosresmeta(covariance="smd")', "DOSRES"),
    # reliability
    "ARAW": m("Raw Cronbach's alpha", E % "ARAW"),
    "AHW": m("Cronbach's alpha, Hakstian-Whalen transformation", E % "AHW"),
    "ABT": m("Cronbach's alpha, Bonett transformation", E % "ABT"),
}

# --------------------------------------------------------------------------
# Methods
#   domain: which family of branches the method serves
#   takes:  which data kinds it can read
#   metrics: None = every metric of the branch (except metrics reserved for
#            one method); otherwise the allowed set
#   analysis: what the package supports directly
# --------------------------------------------------------------------------
COMMON, RANDOM = "Common effect", "Random effects"
STD, SUB, REG, CUM, L1O = "standard", "subgroup", "meta-regression", "cumulative", "leave-one-out"


def meth(
    label: str,
    fn: str,
    domain: str,
    takes: Iterable[str],
    models: list[str],
    analysis: list[str],
    src: list[str],
    metrics: set[str] | None = None,
    note: str = "",
    added: bool = False,
    verified: bool = True,
    added_models: Iterable[str] = (),
) -> Method:
    return Method(
        label=label,
        fn=fn,
        domain=domain,
        takes=set(takes),
        models=models,
        analysis=analysis,
        src=src,
        metrics=metrics,
        note=note,
        added=added,
        verified=verified,
        added_models=set(added_models),
    )


METHODS: dict[str, Method] = {
    "IV": meth(
        "Inverse variance",
        "metafor::rma.uni()",
        "pairwise",
        ["arm", "est"],
        [COMMON, RANDOM],
        [STD, SUB, REG, CUM, L1O],
        ["MF-uni", "CH-10"],
        note="Random effects: 12 estimators of the between-study variance (REML is the default); "
        'Hartung-Knapp interval available (test="knha"). Cumulative and leave-one-out need a model '
        "without moderators.",
    ),
    "MH": meth(
        "Mantel-Haenszel",
        "metafor::rma.mh()",
        "pairwise",
        ["arm"],
        [COMMON],
        [STD, CUM, L1O],
        ["MF-mh", "CH-10"],
        metrics={"OR", "RR", "RD", "IRR", "IRD"},
        note="No moderators. Generally preferred to inverse variance for common-effect binary analyses "
        "(Cochrane 10.4.1).",
    ),
    "PETO": meth(
        "Peto",
        "metafor::rma.peto()",
        "pairwise",
        ["arm"],
        [COMMON],
        [STD, CUM, L1O],
        ["MF-peto", "CH-10"],
        metrics={"PETO"},
        note="For rare events, balanced arms and small effects. Not a default (Cochrane 10.4.2).",
    ),
    "GLMM": meth(
        "Generalized linear mixed model",
        "metafor::rma.glmm()",
        "pairwise",
        ["arm"],
        [COMMON, RANDOM],
        [STD, SUB, REG],
        ["MF-glmm"],
        metrics={"OR", "IRR", "PLO", "IRLN"},
        note='Common effect is method="EE"; random effects uses maximum likelihood only. RR and RD are '
        "experimental. No cumulative or leave-one-out function.",
    ),
    "LRP": meth(
        "Penalised logistic regression (rare events)",
        'meta::metabin(method="LRP")',
        "pairwise",
        ["arm"],
        [COMMON, RANDOM],
        [STD],
        ["META-bin"],
        metrics={"OR"},
        added=True,
        verified=False,
        note="Handles single and double zero studies without a continuity correction. "
        "Which models it fits is not confirmed.",
    ),
    "BAYES": meth(
        "Bayesian normal-normal hierarchical model",
        "bayesmeta::bayesmeta()",
        "pairwise",
        ["arm", "est"],
        [RANDOM],
        [STD, SUB, REG],
        ["BM", "BM-bmr"],
        note="No MCMC. Meta-regression and subgroups through bmr(). No cumulative or leave-one-out "
        "function found in the manual.",
    ),
    "MV": meth(
        "Multilevel / multivariate",
        "metafor::rma.mv() with vcalc()",
        "pairwise",
        ["arm", "est"],
        [COMMON, RANDOM],
        [STD, SUB, REG],
        ["MF-mv"],
        added_models=[COMMON],
        note="For studies that contribute several dependent estimates. Without a random term it fits a "
        "fixed-effects model (v11 says random only). REML or ML. No Hartung-Knapp, cumulative or "
        "leave-one-out function.",
    ),
    "OEV": meth(
        "Observed minus expected and variance (log-rank / Peto)",
        "computed as (O-E)/V with variance 1/V",
        "pairwise",
        ["oev"],
        [COMMON],
        [STD],
        ["CH-10"],
        added=True,
        verified=False,
        note="Cochrane 10.9: only fixed-effect methods in RevMan. R implementation not chosen yet.",
    ),
    "IPD1": meth(
        "One-stage regression on participant data",
        "mixed-effects or multilevel regression",
        "pairwise",
        ["ipd"],
        [RANDOM],
        [STD, SUB, REG],
        ["CH-26"],
        verified=False,
        note="Stratify by study (Cochrane 26.4.2, 26.4.5). R packages still to confirm.",
    ),
    # network
    "NM_GT": meth(
        "Frequentist, graph-theoretical",
        "netmeta::netmeta()",
        "network",
        ["arm", "est"],
        [COMMON, RANDOM],
        [STD],
        ["NM", "CH-11", "DMA"],
        added=True,
        note="Arm-level data go through pairwise(). Between-study variance: DL, REML or ML. "
        "Does not support meta-regression.",
    ),
    "NM_MV": meth(
        "Frequentist, multivariate",
        "metafor::rma.mv()",
        "network",
        ["arm", "est"],
        [COMMON, RANDOM],
        [STD, SUB, REG],
        ["MD-senn", "MF-mv"],
        added_models=[COMMON],
        note="Arm-based or contrast-based. The documented example fits both a fixed-effects and a "
        "random-effects network model.",
    ),
    "NM_MH": meth(
        "Mantel-Haenszel for networks (sparse binary data)",
        "netmeta::netmetabin()",
        "network",
        ["arm"],
        [COMMON],
        [STD],
        ["NM-bin"],
        metrics={"N_OR", "N_RR", "N_RD"},
        added=True,
        note="Methods MH and NCH are common-effect only.",
    ),
    "NM_BAYES": meth(
        "Bayesian hierarchical (MCMC)",
        "gemtc with JAGS",
        "network",
        ["arm", "est"],
        [COMMON, RANDOM],
        [STD, REG],
        ["DMA", "CH-11"],
        verified=False,
        added_models=[COMMON],
        note="Supports meta-regression. Common-effect option not confirmed from the manual.",
    ),
    "NM_IPD": meth(
        "One-stage regression on participant data",
        "mixed-effects regression, frequentist or Bayesian",
        "network",
        ["ipd"],
        [RANDOM],
        [STD],
        ["CH-26"],
        verified=False,
    ),
    # diagnostic test accuracy
    "BIV": meth(
        "Bivariate model (Reitsma)",
        "mada::reitsma()",
        "dta",
        ["tab"],
        [RANDOM],
        [STD, SUB, REG],
        ["MADA"],
        metrics={"SESP"},
        note="Estimation: reml (default), ml, mm, vc, or fixed. Equivalent to the HSROC model when there "
        "are no covariates.",
    ),
    "HSROC": meth(
        "Hierarchical summary ROC model (Rutter and Gatsonis)",
        "implementation not chosen",
        "dta",
        ["tab"],
        [RANDOM],
        [STD, SUB, REG],
        ["DTA-HB", "MADA"],
        metrics={"SROC"},
        verified=False,
        note="Used when studies apply different thresholds.",
    ),
    "DTA_UNI": meth(
        "Univariate pooling",
        "mada::madauni()",
        "dta",
        ["tab"],
        [COMMON, RANDOM],
        [STD],
        ["DTA-HB"],
        metrics={"DOR", "LRP", "LRN"},
        verified=False,
        note="Ignores the correlation between sensitivity and specificity.",
    ),
    # prognosis
    "VAL": meth(
        "Meta-analysis of prediction model performance",
        "metamisc::valmeta()",
        "valid",
        ["est"],
        [COMMON, RANDOM],
        [STD],
        ["VALMETA", "DEBRAY"],
        note="REML by default, Hartung-Knapp interval, prediction interval; Bayesian option.",
    ),
    # dose-response
    "DR": meth(
        "Dose-response meta-analysis",
        "dosresmeta::dosresmeta()",
        "dose",
        ["dose"],
        [COMMON, RANDOM],
        [STD],
        ["DOSRES"],
        note="One-stage or two-stage. Covariance by Greenland-Longnecker or Hamling. Linear or non-linear trend.",
    ),
}

# --------------------------------------------------------------------------
# Branches: framework > group > datatype > outcome, with the metrics offered
# --------------------------------------------------------------------------
ARM, EST, IPD = "Arm-level summary data", "Precomputed estimate", "Individual participant data"
BRANCHES: list[Branch] = []


def br(
    fw: str,
    group: str,
    datatype: str,
    kind: str,
    outcome: str,
    inputs: str,
    metrics: list[str],
    domain: str = "pairwise",
    added: bool = False,
    verified: bool = True,
    note: str = "",
) -> None:
    BRANCHES.append(
        Branch(
            fw=fw,
            group=group,
            datatype=datatype,
            kind=kind,
            outcome=outcome,
            inputs=inputs,
            metrics=metrics,
            domain=domain,
            added=added,
            verified=verified,
            note=note,
        )
    )


F1 = "1. Interventional (effect of an intervention)"
G1, G2, G3, G4 = (
    "One group (single arm)",
    "Two groups (pairwise)",
    "Change or matched pairs (same people measured twice)",
    "Multiple groups (network)",
)
EST_IN = "estimate with SE, variance or CI"
one: dict[str, tuple[str, list[str]]] = {
    "Binary": ("events, total (xi, ni)", ["PR", "PLN", "PLO", "PAS", "PFT", "PRZ"]),
    "Continuous": ("mean, SD, n (mi, sdi, ni)", ["MN", "SMN", "MNLN"]),
    "Count / person-time": ("events, person-time (xi, ti)", ["IR", "IRLN", "IRS", "IRFT"]),
}
two: dict[str, tuple[str, list[str]]] = {
    "Binary": ("2x2 table (ai, bi, ci, di)", ["OR", "RR", "RD", "AS", "PETO"]),
    "Continuous": ("mean, SD, n per arm", ["MD", "SMD_G", "SMD_D", "SMDH", "SMD1", "ROM"]),
    "Count / person-time": ("events and person-time per arm (x1i, t1i, x2i, t2i)", ["IRR", "IRD", "IRSD"]),
}
for o, (inp, ms) in one.items():
    br(F1, G1, ARM, "arm", o, inp, ms)
for o, (_inp, ms) in one.items():
    br(F1, G1, EST, "est", o, EST_IN, ms)
for o, ms in {"Binary": ["I_P"], "Continuous": ["I_M"], "Count / person-time": ["I_R"]}.items():
    br(F1, G1, IPD, "ipd", o, "one row per participant", ms, verified=False)
for o, (inp, ms) in two.items():
    br(F1, G2, ARM, "arm", o, inp, ms)
for o, (_inp, ms) in two.items():
    br(F1, G2, EST, "est", o, EST_IN, ms)
br(F1, G2, EST, "est", "Time-to-event", "log hazard ratio with SE or CI", ["HR"])
br(
    F1,
    G2,
    EST,
    "est",
    "Ordinal",
    "log proportional odds ratio with SE",
    ["POR"],
    added=True,
    note="Cochrane 6.6 and 10.7: ordinal data can also be dichotomised (use Binary) or treated as continuous.",
)
br(F1, G2, "Observed minus expected and variance", "oev", "Time-to-event", "O - E and V per study", ["HR"], added=True)
for o, ms in {
    "Binary": ["I_OR"],
    "Continuous": ["I_MD"],
    "Count / person-time": ["I_IRR"],
    "Time-to-event": ["I_HR"],
}.items():
    br(F1, G2, IPD, "ipd", o, "one row per participant", ms, verified=False)
br(
    F1,
    G3,
    ARM,
    "arm",
    "Continuous",
    "two means, two SDs, n and the within-person correlation",
    ["MC", "SMCC", "SMCR", "ROMC"],
    added=True,
)
br(F1, G3, ARM, "arm", "Binary", "paired 2x2 table", ["MPRR", "MPOR", "MPRD", "MPORC"], added=True)
net: dict[str, tuple[str, list[str]]] = {
    "Binary": ("events and total per arm", ["N_OR", "N_RR", "N_RD", "N_ASD"]),
    "Continuous": ("mean, SD, n per arm", ["N_MD", "N_SMD", "N_ROM"]),
    "Count / person-time": ("events and person-time per arm", ["N_IRR", "N_IRD"]),
}
for o, (inp, ms) in net.items():
    br(F1, G4, ARM, "arm", o, inp, ms, domain="network")
for o, (_inp, ms) in net.items():
    br(F1, G4, "Contrast-level estimates", "est", o, "effect and SE for each pair of treatments", ms, domain="network")
br(
    F1,
    G4,
    "Contrast-level estimates",
    "est",
    "Time-to-event",
    "log hazard ratio and SE for each pair",
    ["N_HR"],
    domain="network",
)
for o, ms in {"Binary": ["N_OR"], "Continuous": ["N_MD"], "Time-to-event": ["N_HR"]}.items():
    br(F1, G4, IPD, "ipd", o, "one row per participant", ms, domain="network", verified=False)

F2 = "2. Diagnostic test accuracy"
br(
    F2,
    "One index test against a reference standard",
    "2x2 table per study",
    "tab",
    "Binary classification",
    "TP, FP, FN, TN",
    ["SESP", "SROC", "DOR", "LRP", "LRN"],
    domain="dta",
    added=True,
)
br(
    F2,
    "Two or more index tests compared",
    "2x2 table per study and test",
    "tab",
    "Binary classification",
    "TP, FP, FN, TN per test",
    ["SESP", "SROC"],
    domain="dta",
    added=True,
    verified=False,
    note="Done by adding the test as a covariate in the bivariate or HSROC model.",
)

F3 = "3. Prognosis"
br(
    F3,
    "Prognostic factor (does the factor predict the outcome?)",
    EST,
    "est",
    "Any outcome",
    "adjusted estimate with SE or CI",
    ["PF_HR", "PF_OR", "PF_RR", "PF_MD"],
    added=True,
    verified=False,
    note="Pool each measure, adjustment set and cut-point separately. Details to confirm in Riley et al. 2019.",
)
br(
    F3,
    "Prediction model performance (external validation)",
    EST,
    "est",
    "Discrimination",
    "c-statistic with SE or CI",
    ["CSTAT"],
    domain="valid",
    added=True,
)
br(
    F3,
    "Prediction model performance (external validation)",
    EST,
    "est",
    "Calibration",
    "observed and expected events, or O:E with SE",
    ["OE"],
    domain="valid",
    added=True,
)
br(
    F3,
    "Overall prognosis (average risk or rate)",
    "Same as One group",
    "none",
    "See 1. Interventional, One group",
    "",
    [],
    domain="none",
    added=True,
)

F4 = "4. Association"
br(
    F4,
    "Two variables in one group (correlation)",
    ARM,
    "arm",
    "Two continuous variables",
    "correlation and n (ri, ni)",
    ["COR", "UCOR", "ZCOR", "PCOR"],
    added=True,
)
br(
    F4,
    "Two variables in one group (correlation)",
    ARM,
    "arm",
    "One continuous, one binary variable",
    "mean, SD, n per group",
    ["RPB", "RBIS"],
    added=True,
)
br(
    F4,
    "Two variables in one group (correlation)",
    ARM,
    "arm",
    "Two binary variables",
    "2x2 table",
    ["PHI", "RTET"],
    added=True,
)
br(
    F4,
    "Exposure and outcome (observational studies)",
    EST,
    "est",
    "Any outcome",
    "adjusted estimate with SE or CI",
    ["EX_OR", "EX_RR", "EX_HR"],
    added=True,
    verified=False,
    note="Guidance for non-randomized studies (Cochrane Ch. 24) not read yet.",
)
br(
    F4,
    "Dose-response",
    "Estimates at several dose levels per study",
    "dose",
    "Binary or time-to-event",
    "dose, log relative risk and SE, cases and n per level; study type",
    ["DR_RR"],
    domain="dose",
    added=True,
)
br(
    F4,
    "Dose-response",
    "Estimates at several dose levels per study",
    "dose",
    "Continuous",
    "dose, mean, SD and n per level",
    ["DR_MD", "DR_SMD"],
    domain="dose",
    added=True,
)

F5 = "5. Measurement reliability"
br(
    F5,
    "One group",
    ARM,
    "arm",
    "Internal consistency",
    "alpha, number of items, n (ai, mi, ni)",
    ["ARAW", "AHW", "ABT"],
    added=True,
)

FRAMEWORK_NOTES = {
    F1: "Cochrane Handbook for Systematic Reviews of Interventions. One-group analyses are also used for prevalence and incidence.",
    F2: "Not in v11. The Cochrane diagnostic accuracy handbook could not be read online, so most entries are unverified.",
    F3: "Not in v11. Prediction model entries are confirmed from the metamisc documentation; prognostic factor entries are unverified.",
    F4: "Not in v11 (correlation was excluded there).",
    F5: "Not in v11. Supported by metafor.",
}
GROUP_NOTES = {
    G3: "Not in v11. Needed for before-and-after designs and crossover trials (Cochrane 23.2).",
    G4: "Both common-effect and random-effects models are available. After fitting: treatment ranking "
    "(P-score, SUCRA, rankogram) and checks of transitivity and consistency. These are outputs, not metrics.",
}
DATATYPE_NOTES = {
    IPD: "Two-stage analysis: analyse each study, then pool the estimates through the Precomputed estimate branch. "
    "One-stage analysis is shown here.",
}

# --------------------------------------------------------------------------
# Rules, cross-cutting sections, open items
# --------------------------------------------------------------------------
RULES: list[tuple[str, str, str, str]] = [
    (
        "R1",
        "Inverse variance works with every metric, both models, and both arm-level and precomputed data.",
        "agrees",
        "MF-uni, CH-10 s10.3",
    ),
    (
        "R2",
        "A precomputed estimate can only be pooled by methods that take an estimate and its variance: inverse variance, bayesmeta, rma.mv.",
        "agrees",
        "MF-mh, MF-peto, MF-glmm",
    ),
    (
        "R3",
        "Mantel-Haenszel needs arm-level counts and gives OR, RR, RD (2x2 tables) or IRR, IRD (person-time). Common effect only.",
        "agrees",
        "MF-mh",
    ),
    (
        "R4",
        '"Random-effects Mantel-Haenszel" is not a separate method: the random-effects estimate uses inverse-variance weights.',
        "agrees",
        "META-bin",
    ),
    (
        "R5",
        "Peto needs 2x2 tables and gives only the Peto odds ratio. Common effect only. For rare events, balanced arms, small effects.",
        "agrees",
        "MF-peto, CH-10 s10.4.2, s10.4.4.3",
    ),
    (
        "R6",
        "GLMM gives OR (2x2), IRR (two-group counts), logit proportion and log rate. RR and RD are experimental.",
        "v11 wrong: lists OR, RR, RD",
        "MF-glmm",
    ),
    ("R7", "GLMM random effects uses maximum likelihood only.", "v11 wrong: says REML, ML, EB", "MF-glmm"),
    ("R8", "GLMM does not apply to continuous outcomes.", "agrees", "MF-glmm"),
    ("R9", "For rare events avoid inverse variance, including DerSimonian-Laird.", "missing in v11", "CH-10 s10.4.4.3"),
    (
        "R10",
        "Subgroup analysis and meta-regression need moderators: available in rma.uni, rma.glmm, rma.mv and bayesmeta (bmr); not in rma.mh or rma.peto.",
        "agrees; answers v11's open question on bayesmeta",
        "MF-uni, MF-glmm, MF-mv, BM-bmr",
    ),
    (
        "R11",
        "Cumulative and leave-one-out functions exist for rma.uni, rma.mh and rma.peto only.",
        "v11 wrong for GLMM and rma.mv",
        "MF-cumul, MF-l1o",
    ),
    ("R12", "Cumulative and leave-one-out need a model without moderators.", "missing in v11", "MF-cumul, MF-l1o"),
    (
        "R13",
        "bayesmeta has no cumulative or leave-one-out function in the part of the manual read. It needs no MCMC.",
        "answers v11's open question",
        "BM",
    ),
    ("R14", "Hartung-Knapp intervals apply to rma.uni random-effects models only.", "agrees", "MF-uni, MF-mv"),
    (
        "R15",
        "REML is the default in metafor and RevMan. Cochrane also cites Paule-Mandel and says no estimator is universally preferable.",
        "v11 overstates: calls REML Cochrane's preference",
        "CH-10 s10.10.4.4",
    ),
    (
        "R16",
        "Network meta-analysis can use a common-effect or a random-effects model. Chapter 11 never mentions excluding the common-effect model; netmeta and the rma.mv example fit both.",
        "v11 wrong: excludes fixed effect",
        "CH-11, NM, MD-senn",
    ),
    (
        "R17",
        "P-score and SUCRA are rankings computed after a network model is fitted. They are outputs, not effect measures.",
        "v11 wrong: lists them as metrics",
        "NM-man, CH-11 s11.6.4, DMA",
    ),
    (
        "R18",
        "A network analysis must check transitivity and consistency (node-splitting, design decomposition, net heat plot).",
        "missing in v11",
        "CH-11 s11.2.2, s11.4.4",
    ),
    (
        "R19",
        "Networks usually assume one common between-study variance across comparisons.",
        "missing in v11",
        "CH-11 s11.4.3.2",
    ),
    ("R20", "Mantel-Haenszel for networks (netmetabin) is common-effect only.", "missing in v11", "NM-bin"),
    (
        "R21",
        "IPD: two-stage analysis joins the precomputed pathway. One-stage analysis needs a mixed-effects regression stratified by study.",
        "agrees",
        "CH-26 s26.4.2, s26.4.5",
    ),
    (
        "R22",
        "Cluster-randomized trial: divide the sample size (and events) by the design effect 1 + (M - 1) x ICC, or multiply the SE by its square root.",
        "agrees",
        "CH-23 s23.1.4-23.1.6",
    ),
    (
        "R23",
        "Crossover trial: use a paired analysis; without paired data, impute the SD of differences from an assumed correlation.",
        "v11 wrong: applies the cluster formula",
        "CH-23 s23.2.5-23.2.7",
    ),
    (
        "R24",
        "Study with three or more arms in a pairwise analysis: combine arms (recommended), model the correlation, or use a network.",
        "missing in v11",
        "CH-23 s23.3.4",
    ),
    (
        "R25",
        "Time-to-event from O - E and V: fixed-effect methods only; log hazard ratios with SEs are pooled by inverse variance.",
        "missing in v11",
        "CH-10 s10.9",
    ),
    (
        "R26",
        "Diagnostic accuracy: sensitivity and specificity are pooled jointly (bivariate model); the HSROC model is equivalent without covariates.",
        "not in v11",
        "MADA",
    ),
    (
        "R27",
        "Prediction model performance: pool the c-statistic on the logit scale and O:E on the log scale, random effects with Hartung-Knapp and a prediction interval.",
        "not in v11",
        "VALMETA",
    ),
    (
        "R28",
        "Tests for funnel plot asymmetry need at least 10 studies; Egger's original test is not recommended for odds ratios or SMDs.",
        "not in v11",
        "CH-13 s13.3.4.4",
    ),
    (
        "R29",
        "Trim and fill and selection models work on rma.uni models only (trim and fill: no moderators).",
        "not in v11",
        "MF-trimfill, MF-selmodel",
    ),
    (
        "R30",
        "Meta-regression is generally not advised with fewer than ten studies.",
        "missing in v11",
        "CH-10 s10.11.4",
    ),
]

CROSS: list[tuple[str, str, str]] = [
    (
        "Analysis types",
        "standard, subgroup, meta-regression, cumulative, leave-one-out, sensitivity. "
        "What each method supports is listed on the method.",
        "CH-10 s10.11, s10.14",
    ),
    (
        "Heterogeneity outputs",
        "Between-study variance, I-squared, Q test, prediction interval (encouraged with about five or more studies).",
        "CH-10 s10.10",
    ),
    (
        "Small-study effects and missing results",
        "Funnel plot, regression test (regtest), trim and fill (trimfill), selection models (selmodel).",
        "CH-13, MF-regtest, MF-trimfill, MF-selmodel",
    ),
    (
        "Unit-of-analysis corrections",
        "Cluster trials, crossover trials, studies with several arms, repeated measurements.",
        "CH-6 s6.2, CH-23",
    ),
    ("Network outputs", "Ranking (P-score, SUCRA, rankogram), league table, consistency checks.", "NM-man, CH-11"),
]

OPEN = [
    "Read the Cochrane diagnostic accuracy handbook, Ch. 9 and 10 (needs a Cochrane account) and confirm the diagnostic branch.",
    "Read Riley et al. 2019 and Debray et al. 2017 in full and confirm the prognosis branch.",
    "Read Cochrane Ch. 24 (non-randomized studies) for the exposure-outcome branch.",
    "Choose the R implementation for the HSROC model and for O - E and V data.",
    "Confirm R packages for one-stage IPD, pairwise and network.",
    "Confirm the common-effect option and inputs of the Bayesian network engine (gemtc).",
    "Confirm incidence-rate input for network meta-analysis.",
    "Confirm which models penalised logistic regression (metabin LRP) fits.",
    "Read the rest of the bayesmeta manual.",
    "Record the Handbook version and the date of each chapter.",
    "Decide whether to offer refit loops for cumulative and leave-one-out where the package has no function.",
]


# --------------------------------------------------------------------------
# Comparison with taxonomy v11 (the reviewed draft this map started from)
#
# v11 itself stays private. What is recorded here is only what the map
# changed: the interventional summary-data pathways v11 had that the map
# does not, each with its reason. v11's 25 one-stage IPD pathways are not
# compared: the map keeps its IPD branches and marks them to check.
# Each removed pathway is named as the map would name it, so a test can
# check that it is really absent.
# --------------------------------------------------------------------------
V11_SUMMARY_PATHWAYS = 226  # v11's interventional summary-data pathways
V11_KEPT = 200  # of those, in the map unchanged
CONTRAST = "Contrast-level estimates"
COUNT = "Count / person-time"


class V11Change(TypedDict):
    group: str
    datatype: str
    outcome: str
    model: str
    method: str
    metric: str  # as the map would code it; codes not in METRICS name a metric the map does not offer
    v11_metric: str  # as v11 named it
    reason: str


V11_REMOVED: list[V11Change] = []
# Pathways that replace a merged pair, so not new to the map: (framework, group, datatype, outcome, model, method, metric)
V11_MERGED_INTO: list[tuple[str, str, str, str, str, str, str]] = []

_RANKING = {"NM_MV": ("PSCORE", "P-score"), "NM_BAYES": ("SUCRA", "SUCRA")}
_RANK_REASON = "R17: a ranking computed after the network model is fitted, not an effect measure"
for _dt, _outcomes in (
    (ARM, ["Binary", "Continuous", COUNT]),
    (CONTRAST, ["Binary", "Continuous", COUNT, "Time-to-event"]),
):
    for _me, (_code, _name) in _RANKING.items():
        for _o in _outcomes:
            V11_REMOVED.append(
                V11Change(
                    group=G4,
                    datatype=_dt,
                    outcome=_o,
                    model=RANDOM,
                    method=_me,
                    metric=_code,
                    v11_metric=_name,
                    reason=_RANK_REASON,
                )
            )
for _dt in (ARM, CONTRAST):
    for _me in ("NM_MV", "NM_BAYES"):
        for _code, _name in (("N_SMD_D", "Cohen's d"), ("N_SMD_G", "Hedges' g")):
            V11_REMOVED.append(
                V11Change(
                    group=G4,
                    datatype=_dt,
                    outcome="Continuous",
                    model=RANDOM,
                    method=_me,
                    metric=_code,
                    v11_metric=_name,
                    reason="merged into N_SMD with no source recorded; under review in issue #31",
                )
            )
        V11_MERGED_INTO.append((F1, G4, _dt, "Continuous", RANDOM, _me, "N_SMD"))
# v11's 4 network IRD pathways were dropped with no reason and restored in issue #29.
for _model in (COMMON, RANDOM):
    for _code in ("RR", "RD"):
        V11_REMOVED.append(
            V11Change(
                group=G2,
                datatype=ARM,
                outcome="Binary",
                model=_model,
                method="GLMM",
                metric=_code,
                v11_metric=_code,
                reason="R6: GLMM gives OR for 2x2 tables; RR and RD are experimental",
            )
        )


# --------------------------------------------------------------------------
# Status (docs/decisions/0001-pathway-status.md)
#
#   runnable   has a passing validation test (none in v0.1)
#   planned    confirmed, and its engine is on the roadmap (v0.2 to v0.4)
#   specified  confirmed, its engine not planned yet ("Later")
#   to_check   not yet confirmed from a primary source (verified = False)
#
# A pathway's milestone is its framework's, or, for interventional
# pathways, its method's engine's (CLAUDE.md, Roadmap).
# --------------------------------------------------------------------------
LATER = "Later"
ROADMAP = ("v0.2", "v0.3", "v0.4")
STATUSES = ("runnable", "planned", "specified", "to_check")
FRAMEWORK_MILESTONE = {F2: "v0.4", F3: "v0.4", F4: LATER, F5: LATER}
METHOD_MILESTONE = {
    # metafor's one- and two-group engines
    "IV": "v0.2",
    "MH": "v0.2",
    "PETO": "v0.2",
    "GLMM": "v0.2",
    # rma.mv pairwise, bayesmeta and the network engines
    "MV": "v0.3",
    "BAYES": "v0.3",
    "NM_GT": "v0.3",
    "NM_MV": "v0.3",
    "NM_MH": "v0.3",
    "NM_BAYES": "v0.3",
    # one-stage IPD, and engines with no R implementation chosen
    "IPD1": LATER,
    "NM_IPD": LATER,
    "OEV": LATER,
    "LRP": LATER,
}


def milestone_of(framework: str, method: str) -> str:
    if framework == F1:
        return METHOD_MILESTONE[method]
    return FRAMEWORK_MILESTONE[framework]


def status_of(verified: bool, milestone: str) -> str:
    if not verified:
        return "to_check"
    return "planned" if milestone in ROADMAP else "specified"


# --------------------------------------------------------------------------
# Generation
# --------------------------------------------------------------------------
def pathways() -> list[Pathway]:
    out: list[Pathway] = []
    for b in BRANCHES:
        for mid, me in METHODS.items():
            if me["domain"] != b["domain"] or b["kind"] not in me["takes"]:
                continue
            for code in b["metrics"]:
                mt = METRICS[code]
                if me["metrics"] is not None and code not in me["metrics"]:
                    continue
                if mt["only"] and mid not in mt["only"]:
                    continue
                verified = b["verified"] and me["verified"] and mt["verified"]
                milestone = milestone_of(b["fw"], mid)
                for model in me["models"]:
                    out.append(
                        Pathway(
                            framework=b["fw"],
                            group=b["group"],
                            datatype=b["datatype"],
                            outcome=b["outcome"],
                            model=model,
                            method=mid,
                            metric=code,
                            verified=verified,
                            added=b["added"] or me["added"] or mt["added"] or model in me["added_models"],
                            milestone=milestone,
                            status=status_of(verified, milestone),
                        )
                    )
    return out


PATHWAY_KEY = ("framework", "group", "datatype", "outcome", "model", "method", "metric")


def pathway_key(p: Pathway) -> tuple[str, str, str, str, str, str, str]:
    return (p["framework"], p["group"], p["datatype"], p["outcome"], p["model"], p["method"], p["metric"])


def tier_label(tier: str, value: str) -> str:
    if tier == "method":
        return METHODS[value]["label"]
    if tier == "metric":
        return METRICS[value]["label"]
    return value


def build_tree(paths: list[Pathway]) -> Node:
    """Nested nodes: framework > group > datatype > outcome > ORDER tiers."""
    tiers = ["framework", "group", "datatype", "outcome"] + ORDER
    root = Node(kids={}, leaf=None)
    for p in paths:
        fields: Mapping[str, object] = p
        node = root
        for t in tiers:
            node = node["kids"].setdefault((t, str(fields[t])), Node(kids={}, leaf=None))
        node["leaf"] = p
    return root


def branch_for(fw: str, group: str, datatype: str, outcome: str) -> Branch | None:
    for b in BRANCHES:
        if (b["fw"], b["group"], b["datatype"], b["outcome"]) == (fw, group, datatype, outcome):
            return b
    return None


def node_info(tier: str, value: str, ctx: Mapping[str, str]) -> tuple[str, bool, bool]:
    """Return (note, flags) for a tree node."""
    note, verified, added = "", True, False
    if tier == "framework":
        note = FRAMEWORK_NOTES.get(value, "")
    elif tier == "group":
        note = GROUP_NOTES.get(value, "")
    elif tier == "datatype":
        note = DATATYPE_NOTES.get(value, "")
    elif tier == "outcome":
        b = branch_for(ctx["framework"], ctx["group"], ctx["datatype"], value)
        if b:
            note = ("Data needed: " + b["inputs"] + ". " if b["inputs"] else "") + b["note"]
            verified, added = b["verified"], b["added"]
    elif tier == "method":
        me = METHODS[value]
        note = "%s. Analysis types: %s. %s" % (me["fn"], ", ".join(me["analysis"]), me["note"])
        verified, added = me["verified"], me["added"]
    elif tier == "metric":
        mt = METRICS[value]
        note = mt["call"]
        verified, added = mt["verified"], mt["added"]
    return note.strip(), verified, added


def count_leaves(node: Node) -> int:
    return (node["leaf"] is not None) + sum(count_leaves(child) for child in node["kids"].values())


def walk(node: Node, depth: int, ctx: Mapping[str, str], emit: Emit) -> None:
    for (tier, value), child in node["kids"].items():
        ctx2 = {**ctx, tier: value}
        note, verified, added = node_info(tier, value, ctx2)
        emit(
            depth,
            tier,
            tier_label(tier, value),
            note,
            verified,
            added,
            count_leaves(child),
            is_leaf=child["leaf"] is not None and not child["kids"],
        )
        walk(child, depth + 1, ctx2, emit)
        emit(depth, None, None, None, None, None, None, is_leaf=None)  # close


def write_tree_md(tree: Node, stats: str) -> None:
    lines = [
        "# Full tree (generated by spec/build_map.py; do not edit)",
        "",
        "Tier order after outcome: " + " > ".join(ORDER) + ".",
        "Marks: [NEW] not in taxonomy v11; [CHECK] not yet confirmed from a primary source.",
        "",
        stats,
        "",
    ]

    def emit(
        depth: int,
        tier: str | None,
        label: str | None,
        note: str | None,
        verified: bool | None,
        added: bool | None,
        n: int | None,
        *,
        is_leaf: bool | None,
    ) -> None:
        if tier is None:
            return
        assert label is not None and n is not None  # set on every node that opens
        marks = (" [NEW]" if added and tier not in ("framework",) else "") + ("" if verified else " [CHECK]")
        cnt = "" if is_leaf else "  (%d)" % n
        lines.append("%s- %s: %s%s%s" % ("  " * depth, tier, label, marks, cnt))

    walk(tree, 0, {}, emit)
    extra = [b for b in BRANCHES if b["domain"] == "none"]
    for b in extra:
        lines.append("- framework: %s / %s: %s" % (b["fw"], b["group"], b["outcome"]))
    (HERE / "tree.md").write_text("\n".join(lines) + "\n")


def table(headers: Sequence[str], rows: Iterable[Sequence[object]]) -> str:
    out = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
    out += ["| " + " | ".join(str(c).replace("|", "/") for c in r) + " |" for r in rows]
    return "\n".join(out)


def flag(d: Metric | Method | Branch) -> str:
    return ", ".join(x for x in ["NEW" if d["added"] else "", "" if d["verified"] else "CHECK"] if x) or "OK"


def write_backbone_md(paths: list[Pathway], stats: str) -> None:
    used_metrics = {p["metric"] for p in paths}
    parts = [
        "# Backbone of the meta-analysis map (generated by spec/build_map.py; do not edit)",
        "",
        "Edit the data in `spec/build_map.py` and run it again. The full tree is in `spec/tree.md` and "
        "`spec/map.html`.",
        "",
        "Status: OK = confirmed from the source and in taxonomy v11. NEW = confirmed or proposed, not in v11. "
        "CHECK = not yet confirmed from a primary source.",
        "",
        stats,
        "",
        "## Branches: framework, group structure, datatype, outcome",
        "",
        table(
            ["Framework", "Group structure", "Datatype", "Outcome", "Data needed", "Status"],
            [(b["fw"], b["group"], b["datatype"], b["outcome"], b["inputs"], flag(b)) for b in BRANCHES],
        ),
        "",
        "## Metrics",
        "",
        table(
            ["Code", "Metric", "Exact call", "Source", "Status"],
            [(k, v["label"], "`%s`" % v["call"], v["src"], flag(v)) for k, v in METRICS.items() if k in used_metrics],
        ),
        "",
        "## Methods",
        "",
        table(
            ["Method", "Function", "Models", "Reads", "Analysis types", "Source", "Status", "Notes"],
            [
                (
                    v["label"],
                    "`%s`" % v["fn"],
                    ", ".join(v["models"]),
                    ", ".join(sorted(v["takes"])),
                    ", ".join(v["analysis"]),
                    ", ".join(v["src"]),
                    flag(v),
                    v["note"],
                )
                for v in METHODS.values()
            ],
        ),
        "",
        "Reads: arm = arm-level summary data, est = precomputed estimates, ipd = participant data, "
        "oev = O - E and V, tab = diagnostic 2x2 tables, dose = estimates by dose level.",
        "",
        "## Rules",
        "",
        table(["#", "Rule", "Compared with v11", "Source"], RULES),
        "",
        "## Compared with taxonomy v11",
        "",
        "Of v11's %d interventional summary-data pathways, %d are in the map unchanged and %d are not, each "
        "below with its reason. Merging Cohen's d and Hedges' g gives %d network SMD pathways. v11's one-stage "
        "IPD pathways are not compared." % (V11_SUMMARY_PATHWAYS, V11_KEPT, len(V11_REMOVED), len(V11_MERGED_INTO)),
        "",
        table(
            ["Group", "Datatype", "Outcome", "Model", "Method", "v11 metric", "Reason"],
            [
                (
                    c["group"],
                    c["datatype"],
                    c["outcome"],
                    c["model"],
                    METHODS[c["method"]]["label"],
                    c["v11_metric"],
                    c["reason"],
                )
                for c in V11_REMOVED
            ],
        ),
        "",
        "## Sections that apply across the tree",
        "",
        table(["Section", "Content", "Source"], CROSS),
        "",
        "## Still to check",
        "",
        "\n".join("%d. %s" % (i + 1, t) for i, t in enumerate(OPEN)),
        "",
        "## Sources",
        "",
        table(["Key", "Source", "Link"], [(k, v[0], v[1]) for k, v in SOURCES.items()]),
        "",
    ]
    (HERE / "backbone.md").write_text("\n".join(parts))


def write_html(tree: Node, stats_rows: list[tuple[str, int]]) -> None:
    e = html.escape
    out: list[str] = []

    def emit(
        depth: int,
        tier: str | None,
        label: str | None,
        note: str | None,
        verified: bool | None,
        added: bool | None,
        n: int | None,
        *,
        is_leaf: bool | None,
    ) -> None:
        if tier is None:
            if is_leaf is None:
                out.append("</div></details>")
            return
        assert label is not None and note is not None and n is not None  # set on every node that opens
        chips = ""
        if added and tier != "framework":
            chips += '<span class="chip new">new</span>'
        if not verified:
            chips += '<span class="chip chk">check</span>'
        cnt = "" if is_leaf else '<span class="count">%d</span>' % n
        out.append(
            '<details class="node t-%s" data-l="%s"%s><summary><span class="tier">%s</span>'
            '<span class="label">%s</span>%s%s</summary><div class="kids">%s'
            % (
                tier,
                e((label + " " + note).lower(), quote=True),
                " open" if depth < 2 else "",
                e(tier),
                e(label),
                chips,
                cnt,
                '<p class="note">%s</p>' % e(note) if note else "",
            )
        )

    walk(tree, 0, {}, emit)
    rules = "".join("<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>" % tuple(e(x) for x in r) for r in RULES)
    cross = "".join("<tr><td>%s</td><td>%s</td><td>%s</td></tr>" % tuple(e(x) for x in r) for r in CROSS)
    srcs = "".join(
        '<tr><td>%s</td><td><a href="%s">%s</a></td></tr>' % (e(k), e(v[1]), e(v[0])) for k, v in SOURCES.items()
    )
    todo = "".join("<li>%s</li>" % e(t) for t in OPEN)
    stats = "".join('<div class="stat"><b>%s</b><span>%s</span></div>' % (e(str(v)), e(k)) for k, v in stats_rows)
    page = (HERE / "map_template.html").read_text()
    for key, val in dict(
        TREE="\n".join(out), RULES=rules, CROSS=cross, SOURCES=srcs, TODO=todo, STATS=stats, ORDER=" → ".join(ORDER)
    ).items():
        page = page.replace("{{%s}}" % key, val)
    (HERE / "map.html").write_text(page)


def _json_default(o: object) -> list[str]:
    if isinstance(o, set):
        return sorted(o)
    raise TypeError("cannot write %r to JSON" % type(o))


def lock_rows(paths: Iterable[Pathway]) -> list[Pathway]:
    """The pathways as the lock file holds them: sorted by their tiers."""
    return sorted(paths, key=pathway_key)


def write_lock(paths: Iterable[Pathway]) -> None:
    rows = [json.dumps(p, sort_keys=True, ensure_ascii=False) for p in lock_rows(paths)]
    LOCK.write_text("[\n" + ",\n".join(rows) + "\n]\n")


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Write the map files from the data in this file.")
    parser.add_argument("--lock", action="store_true", help="also rewrite spec/pathways.lock.json")
    args = parser.parse_args(argv)
    paths = pathways()
    if args.lock:
        write_lock(paths)
    tree = build_tree(paths)
    n = len(paths)
    f1 = [p for p in paths if p["framework"] == F1]
    core = [p for p in f1 if not p["added"]]
    stats_rows: list[tuple[str, int]] = [
        ("pathways in total", n),
        ("interventional", len(f1)),
        ("interventional, in v11's scope", len(core)),
        ("of those, confirmed", sum(p["verified"] for p in core)),
        ("new, not in v11", sum(p["added"] for p in paths)),
        ("still to check", sum(not p["verified"] for p in paths)),
    ] + [("status " + st, sum(p["status"] == st for p in paths)) for st in STATUSES]
    stats = "Counts: " + "; ".join("%s %d" % (k, v) for k, v in stats_rows) + "."
    write_tree_md(tree, stats)
    write_backbone_md(paths, stats)
    if (HERE / "map_template.html").exists():
        write_html(tree, stats_rows)
    data = dict(
        order=ORDER,
        sources=SOURCES,
        branches=BRANCHES,
        rules=RULES,
        cross_cutting=CROSS,
        open_items=OPEN,
        metrics=METRICS,
        methods=METHODS,
        pathways=paths,
    )
    (HERE / "map.json").write_text(json.dumps(data, indent=1, default=_json_default))
    print(stats)
    by: dict[tuple[str, str], list[int]] = {}
    for p in paths:
        by.setdefault((p["framework"], p["group"]), [0, 0, 0])
        by[(p["framework"], p["group"])][0] += 1
        by[(p["framework"], p["group"])][1] += p["added"]
        by[(p["framework"], p["group"])][2] += not p["verified"]
    for k, v in by.items():
        print("%4d  new %3d  check %3d  %s / %s" % (v[0], v[1], v[2], k[0][:20], k[1]))


if __name__ == "__main__":
    main()

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
import re
from collections.abc import Iterable, Iterator, Mapping, Sequence
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
    src: list[str]  # keys of SOURCES for the data this branch reads, its metrics and its note


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
    new: bool  # added and not yet accepted by the methodologist
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
    "META-pw": ("meta, pairwise(), Details", "https://rdrr.io/cran/meta/man/pairwise.html"),
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
    "N_RD": m("Risk difference (network)", 'netmeta(sm="RD")', "NM"),
    "N_ASD": m("Arcsine difference", 'netmeta(sm="ASD")', "NM", added=True),
    "N_MD": m("Mean difference (network)", 'netmeta(sm="MD")', "NM"),
    "N_SMD": m("Standardized mean difference (Cohen's d)", 'netmeta(sm="SMD")', "META-pw"),
    "N_ROM": m("Ratio of means", 'netmeta(sm="ROM")', "NM"),
    # netmeta's examples fit both from arm-level events and person-time, via pairwise(event, time, sm=...)
    "N_IRR": m("Incidence rate ratio", 'netmeta(sm="IRR")', "NM"),
    "N_IRD": m("Incidence rate difference (network)", 'netmeta(sm="IRD")', "NM"),
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
    "PF_HR": m("Adjusted hazard ratio (log), prognostic factor", "enter log HR and its SE", "RILEY", verified=False),
    "PF_OR": m("Adjusted odds ratio (log), prognostic factor", "enter log OR and its SE", "RILEY", verified=False),
    "PF_RR": m("Adjusted risk ratio (log), prognostic factor", "enter log RR and its SE", "RILEY", verified=False),
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
    "EX_OR": m("Adjusted odds ratio (log), exposure", "enter log OR and its SE", "CH-10", verified=False),
    "EX_RR": m("Adjusted risk ratio (log), exposure", "enter log RR and its SE", "CH-10", verified=False),
    "EX_HR": m("Adjusted hazard ratio (log), exposure", "enter log HR and its SE", "CH-10", verified=False),
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
        note="Handles single and double zero studies without a continuity correction. Reports a common-effect and "
        "a random-effects result; the random-effects one uses a multiplicative heterogeneity parameter (phi), not "
        "a between-study variance.",
    ),
    "BAYES": meth(
        "Bayesian normal-normal hierarchical model",
        "bayesmeta::bayesmeta()",
        "pairwise",
        ["arm", "est"],
        [RANDOM],
        [STD, SUB, REG],
        ["BM", "BM-bmr"],
        note="Computes the posterior numerically: a grid approximation for the heterogeneity and the DIRECT "
        "algorithm for the effect. Meta-regression and subgroups through bmr(). No cumulative or leave-one-out "
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
        "One-stage regression on participant data (pairwise)",
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
        "One-stage regression on participant data (network)",
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
    *,
    src: list[str],
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
            src=src,
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
    br(F1, G1, ARM, "arm", o, inp, ms, src=["MF-escalc"])
for o, (_inp, ms) in one.items():
    br(F1, G1, EST, "est", o, EST_IN, ms, src=["MF-uni", "CH-6"])
for o, ms in {"Binary": ["I_P"], "Continuous": ["I_M"], "Count / person-time": ["I_R"]}.items():
    br(F1, G1, IPD, "ipd", o, "one row per participant", ms, verified=False, src=["CH-26"])
for o, (inp, ms) in two.items():
    br(F1, G2, ARM, "arm", o, inp, ms, src=["MF-escalc"])
for o, (_inp, ms) in two.items():
    br(F1, G2, EST, "est", o, EST_IN, ms, src=["MF-uni", "CH-6"])
br(F1, G2, EST, "est", "Time-to-event", "log hazard ratio with SE or CI", ["HR"], src=["CH-10", "CH-6", "MF-uni"])
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
    src=["CH-6", "CH-10"],
)
br(
    F1,
    G2,
    "Observed minus expected and variance",
    "oev",
    "Time-to-event",
    "O - E and V per study",
    ["HR"],
    added=True,
    src=["CH-10"],
)
for o, ms in {
    "Binary": ["I_OR"],
    "Continuous": ["I_MD"],
    "Count / person-time": ["I_IRR"],
    "Time-to-event": ["I_HR"],
}.items():
    br(F1, G2, IPD, "ipd", o, "one row per participant", ms, verified=False, src=["CH-26"])
br(
    F1,
    G3,
    ARM,
    "arm",
    "Continuous",
    "two means, two SDs, n and the within-person correlation",
    ["MC", "SMCC", "SMCR", "ROMC"],
    added=True,
    src=["MF-escalc"],
)
br(F1, G3, ARM, "arm", "Binary", "paired 2x2 table", ["MPRR", "MPOR", "MPRD", "MPORC"], added=True, src=["MF-escalc"])
net: dict[str, tuple[str, list[str]]] = {
    "Binary": ("events and total per arm", ["N_OR", "N_RR", "N_RD", "N_ASD"]),
    "Continuous": ("mean, SD, n per arm", ["N_MD", "N_SMD", "N_ROM"]),
    "Count / person-time": ("events and person-time per arm", ["N_IRR", "N_IRD"]),
}
for o, (inp, ms) in net.items():
    br(F1, G4, ARM, "arm", o, inp, ms, domain="network", src=["META-pw", "NM"])
for o, (_inp, ms) in net.items():
    br(
        F1,
        G4,
        "Contrast-level estimates",
        "est",
        o,
        "effect and SE for each pair of treatments",
        ms,
        domain="network",
        src=["NM"],
    )
br(
    F1,
    G4,
    "Contrast-level estimates",
    "est",
    "Time-to-event",
    "log hazard ratio and SE for each pair",
    ["N_HR"],
    domain="network",
    src=["NM"],
)
for o, ms in {"Binary": ["N_OR"], "Continuous": ["N_MD"], "Time-to-event": ["N_HR"]}.items():
    br(F1, G4, IPD, "ipd", o, "one row per participant", ms, domain="network", verified=False, src=["CH-26"])

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
    src=["MADA"],
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
    src=["DTA-HB"],
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
    src=["RILEY"],
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
    src=["VALMETA"],
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
    src=["VALMETA"],
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
    src=["MF-escalc"],
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
    src=["MF-escalc"],
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
    src=["MF-escalc"],
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
    src=["MF-escalc"],
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
    src=["CH-10"],
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
    src=["DOSRES"],
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
    src=["DOSRES"],
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
    src=["MF-escalc"],
)

# Added entries the methodologist has accepted, each with the GitHub issue that records the decision. An accepted
# entry keeps added=True, since it is still not in taxonomy v11, but it is no longer "new": the apps drop its badge.
ACCEPTED_METRICS: dict[str, int] = {
    **dict.fromkeys(["MC", "SMCC", "SMCR", "ROMC", "MPRR", "MPOR", "MPRD", "MPORC"], 16),
    "POR": 17,
    **dict.fromkeys(["PRZ", "MNLN", "IRS", "IRFT", "IRSD", "SMDH", "SMD1"], 18),
    "N_ASD": 111,
}
ACCEPTED_METHODS: dict[str, int] = {"OEV": 17, "NM_GT": 19, "NM_MH": 19, "LRP": 20}
ACCEPTED_MODELS: dict[tuple[str, str], int] = {("MV", COMMON): 14, ("NM_MV", COMMON): 11, ("NM_BAYES", COMMON): 11}
ACCEPTED_BRANCHES: dict[tuple[str, str, str, str], int] = {
    (F1, G3, ARM, "Continuous"): 16,
    (F1, G3, ARM, "Binary"): 16,
    (F1, G2, EST, "Ordinal"): 17,
    (F1, G2, "Observed minus expected and variance", "Time-to-event"): 17,
}


def branch_key(b: Branch) -> tuple[str, str, str, str]:
    return (b["fw"], b["group"], b["datatype"], b["outcome"])


# "New" = added and not yet accepted: these keep the badge.
def metric_new(code: str) -> bool:
    return METRICS[code]["added"] and code not in ACCEPTED_METRICS


def method_new(mid: str) -> bool:
    return METHODS[mid]["added"] and mid not in ACCEPTED_METHODS


def model_new(mid: str, model: str) -> bool:
    return model in METHODS[mid]["added_models"] and (mid, model) not in ACCEPTED_MODELS


def branch_new(b: Branch) -> bool:
    return b["added"] and branch_key(b) not in ACCEPTED_BRANCHES


# Notes on framework, group and datatype nodes: (text, source), the source written as for the rules.
# "Not in v11" is a statement about taxonomy v11, which stays private; the source backs the rest of the note.
FRAMEWORK_NOTES: dict[str, tuple[str, str]] = {
    F1: (
        "Cochrane Handbook for Systematic Reviews of Interventions. One-group analyses pool a proportion, a mean or "
        "an incidence rate from single groups.",
        "CH-10, MF-escalc",
    ),
    F2: (
        "Not in v11. The Cochrane diagnostic accuracy handbook could not be read online, so most entries are "
        "unverified.",
        "DTA-HB, MADA",
    ),
    F3: (
        "Not in v11. Prediction model entries are confirmed from the metamisc documentation; prognostic factor "
        "entries are unverified.",
        "VALMETA, RILEY",
    ),
    F4: ("Not in v11 (correlation was excluded there).", "MF-escalc, DOSRES"),
    F5: ("Not in v11. Supported by metafor.", "MF-escalc"),
}
GROUP_NOTES: dict[str, tuple[str, str]] = {
    G3: (
        "Not in v11. Needed for before-and-after designs, and for crossover trials (Cochrane 23.2).",
        "CH-23 s23.2, MF-escalc",
    ),
    G4: (
        "Both common-effect and random-effects models are available. Before fitting, judge transitivity: whether "
        "effect modifiers are similar across the comparisons. After fitting, check consistency and rank the "
        "treatments (P-score, SUCRA, rankogram); rankings are outputs, not metrics.",
        "CH-11 s11.2.2, s11.4.4, s11.6.4, NM, NM-man, MD-senn, DMA",
    ),
}
DATATYPE_NOTES: dict[str, tuple[str, str]] = {
    IPD: (
        "Two-stage analysis: analyse each study, then pool the estimates through the Precomputed estimate branch. "
        "One-stage analysis is shown here.",
        "CH-26 s26.4.2, s26.4.5",
    ),
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
        "bayesmeta has no cumulative or leave-one-out function in the part of the manual read. It computes the "
        "posterior numerically (a grid approximation and the DIRECT algorithm).",
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
        "Study with three or more arms in a pairwise analysis: combine arms (recommended in most situations), model the correlation, or use a network. Choosing one pair, or splitting the shared group, is not generally recommended.",
        "missing in v11",
        "CH-23 s23.3.4",
    ),
    (
        "R25",
        "Time-to-event from O - E and V: Cochrane notes that RevMan offers fixed-effect methods only, and this map follows it; log hazard ratios with SEs are pooled by inverse variance.",
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
    (
        "R31",
        "A network's standardized mean difference is Cohen's d. From arm-level data, pairwise() computes it that way "
        "for netmeta, since the small-sample correction of Hedges' g would make a multi-arm study's comparisons "
        "disagree; contrast-level estimates should be Cohen's d for the same reason. The map offers one network SMD.",
        "v11 wrong: offers d and g separately for rma.mv and gemtc networks",
        "META-pw",
    ),
    (
        "R32",
        "In this map, the Peto odds ratio is offered only with Peto's method. Cochrane presents it as the estimate "
        "Peto's method computes: an approximate log odds ratio from observed minus expected events and their "
        'variance. escalc(measure="PETO") also computes it study by study; this map doesn\'t offer pooling it with '
        "another method.",
        "agrees",
        "CH-10 s10.4.2, MF-escalc",
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
    "Confirm from metafor's and gemtc's documentation how their networks take a standardized mean difference "
    "(Cohen's d, R31).",
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
                    reason="R31: one network SMD, Cohen's d (N_SMD)",
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
# A method and metric each confirmed on their own, whose pairing still needs its own source.
UNCONFIRMED: dict[tuple[str, str], str] = {
    (
        "NM_MV",
        "N_SMD",
    ): "R31's source covers netmeta; how rma.mv networks take an SMD is still to read in metafor's documentation",
    (
        "NM_BAYES",
        "N_SMD",
    ): "R31's source covers netmeta; gemtc's measures are still to confirm (issue #40)",
}


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
                verified = b["verified"] and me["verified"] and mt["verified"] and (mid, code) not in UNCONFIRMED
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
                            new=branch_new(b) or method_new(mid) or metric_new(code) or model_new(mid, model),
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


class Note(TypedDict):
    tier: str
    value: str
    text: str
    src: str


def notes() -> list[Note]:
    """The framework, group and datatype notes, each with its source."""
    out: list[Note] = []
    for tier, entries in (("framework", FRAMEWORK_NOTES), ("group", GROUP_NOTES), ("datatype", DATATYPE_NOTES)):
        out += [Note(tier=tier, value=v, text=t, src=src) for v, (t, src) in entries.items()]
    return out


def branch_for(fw: str, group: str, datatype: str, outcome: str) -> Branch | None:
    for b in BRANCHES:
        if (b["fw"], b["group"], b["datatype"], b["outcome"]) == (fw, group, datatype, outcome):
            return b
    return None


def node_info(tier: str, value: str, ctx: Mapping[str, str]) -> tuple[str, bool, bool]:
    """Return (note, verified, new) for a tree node."""
    note, verified, added = "", True, False
    if tier == "framework":
        note = FRAMEWORK_NOTES.get(value, ("", ""))[0]
    elif tier == "group":
        note = GROUP_NOTES.get(value, ("", ""))[0]
    elif tier == "datatype":
        note = DATATYPE_NOTES.get(value, ("", ""))[0]
    elif tier == "outcome":
        b = branch_for(ctx["framework"], ctx["group"], ctx["datatype"], value)
        if b:
            note = ("Data needed: " + b["inputs"] + ". " if b["inputs"] else "") + b["note"]
            verified, added = b["verified"], branch_new(b)
    elif tier == "method":
        me = METHODS[value]
        note = "%s. Analysis types: %s. %s" % (me["fn"], ", ".join(me["analysis"]), me["note"])
        verified, added = me["verified"], method_new(value)
    elif tier == "metric":
        mt = METRICS[value]
        note = mt["call"]
        verified, added = mt["verified"], metric_new(value)
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
        "Marks: [NEW] not in taxonomy v11 and not yet accepted; [CHECK] not yet confirmed from a primary source.",
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


def flag(d: Metric | Method | Branch, accepted: int | None) -> str:
    """NEW for an added entry not yet accepted; "accepted #n" for one accepted in issue n; CHECK if unverified."""
    added = ("accepted #%d" % accepted if accepted else "NEW") if d["added"] else ""
    return ", ".join(x for x in [added, "" if d["verified"] else "CHECK"] if x) or "OK"


def write_backbone_md(paths: list[Pathway], stats: str) -> None:
    used_metrics = {p["metric"] for p in paths}
    parts = [
        "# Backbone of the meta-analysis map (generated by spec/build_map.py; do not edit)",
        "",
        "Edit the data in `spec/build_map.py` and run it again. The full tree is in `spec/tree.md` and "
        "`spec/map.html`.",
        "",
        "Status: OK = confirmed from the source and in taxonomy v11. NEW = confirmed or proposed, not in v11, and not "
        "yet accepted. accepted #n = not in v11, accepted by the methodologist in issue n. "
        "CHECK = not yet confirmed from a primary source.",
        "",
        stats,
        "",
        "## Branches: framework, group structure, datatype, outcome",
        "",
        table(
            ["Framework", "Group structure", "Datatype", "Outcome", "Data needed", "Status", "Source"],
            [
                (
                    b["fw"],
                    b["group"],
                    b["datatype"],
                    b["outcome"],
                    b["inputs"],
                    flag(b, ACCEPTED_BRANCHES.get(branch_key(b))),
                    ", ".join(b["src"]),
                )
                for b in BRANCHES
            ],
        ),
        "",
        "## Notes on frameworks, groups and datatypes",
        "",
        table(["Tier", "Node", "Note", "Source"], [(n["tier"], n["value"], n["text"], n["src"]) for n in notes()]),
        "",
        "## Metrics",
        "",
        table(
            ["Code", "Metric", "Exact call", "Source", "Status"],
            [
                (k, v["label"], "`%s`" % v["call"], v["src"], flag(v, ACCEPTED_METRICS.get(k)))
                for k, v in METRICS.items()
                if k in used_metrics
            ],
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
                    flag(v, ACCEPTED_METHODS.get(k)),
                    v["note"],
                )
                for k, v in METHODS.items()
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
        "## Method and metric pairs still to check",
        "",
        "Each method and metric here is confirmed on its own; their pairing is not yet, so its pathways are to check.",
        "",
        table(
            ["Method", "Metric", "Why"],
            [(METHODS[me]["label"], METRICS[mt]["label"], why) for (me, mt), why in UNCONFIRMED.items()],
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


# --------------------------------------------------------------------------
# "Why not?": why two choices never meet in a pathway
#
# A pathway is a branch, a method, one of the branch's metrics and a model
# that pass every check below (the same checks pathways() applies). For two
# choices that never meet, each combination holding both that fails exactly
# one check gives a reason; their union explains the pair. A pair that no
# such combination holds gets a reason that names the values one of the two
# goes with (from the shorter list): for two branch values, they never share
# a branch. Reasons about a method's models or metrics
# come first: when there are any, "this method takes other data" or "works
# in another domain" routes are left out as the least telling. Where a rule states the check, the reason
# cites the rule; otherwise the method's or metric's own sources.
# --------------------------------------------------------------------------
DOMAIN_WORDS = {
    "pairwise": "single groups and two-group comparisons",
    "network": "networks of three or more treatments",
    "dta": "diagnostic test accuracy",
    "valid": "prediction model validation",
    "dose": "dose-response",
    "none": "no analysis of its own",
}
KIND_WORDS = {
    "arm": "arm-level data",
    "est": "precomputed estimates",
    "ipd": "individual participant data",
    "oev": "O - E and V",
    "tab": "2x2 tables",
    "dose": "estimates at several dose levels",
    "none": "no data of its own",
}
MODEL_WORDS = {COMMON: "a common-effect model", RANDOM: "a random-effects model"}
# The rule behind a method's limit, by (method, check), and whether the rule states the limit outright.
# "takes" is cited only for precomputed estimates, all R2 covers. A reason whose rule doesn't state it
# outright, or that has no rule, is worded as what this map does ("In this map, ..."), not as a fact
# about the method.
WHY_RULE: dict[tuple[str, str], tuple[str, bool]] = {
    ("MH", "models"): ("R3", True),
    ("MH", "metrics"): ("R3", True),
    ("MH", "takes"): ("R2", True),
    ("PETO", "models"): ("R5", True),
    ("PETO", "metrics"): ("R5", True),
    ("PETO", "takes"): ("R2", True),
    ("GLMM", "metrics"): ("R6", False),  # R6 also lists RR and RD as experimental
    ("GLMM", "takes"): ("R2", True),
    ("OEV", "models"): ("R25", False),  # R25 states RevMan's limit, which the map follows (decision 0007)
    ("NM_MH", "models"): ("R20", True),
}
# A second reason for a method's limit, where another rule explains what the first leaves open (#82): R3 says
# Mantel-Haenszel is common-effect only; R4 says why there is no random-effects Mantel-Haenszel to offer.
ALSO_RULE: dict[tuple[str, str], tuple[str, str]] = {
    ("MH", "models"): (
        "R4",
        "Random-effects Mantel-Haenszel isn't a separate method: a random-effects estimate uses inverse-variance "
        "weights.",
    ),
}
# The rule behind a metric's "only with" limit, by metric. R32 states it as the map's choice, so the reason
# keeps "In this map, ".
ONLY_RULE: dict[str, str] = {"PETO": "R32"}
CHECKS = ("domain", "takes", "metrics", "only", "models")
Choice = tuple[str, str]  # (tier, value)


class Reason(TypedDict):
    text: str
    rule: str  # a rule id, or "" when no rule states it
    src: str  # written like a rule's source


def _combinations() -> Iterator[tuple[Branch, str, str, str, list[str]]]:
    """Every branch, method, branch metric and model, with the checks it fails."""
    for b in BRANCHES:
        for mid, me in METHODS.items():
            for code in b["metrics"]:
                mt = METRICS[code]
                for model in (COMMON, RANDOM):
                    fails = []
                    if me["domain"] != b["domain"]:
                        fails.append("domain")
                    if b["kind"] not in me["takes"]:
                        fails.append("takes")
                    if me["metrics"] is not None and code not in me["metrics"]:
                        fails.append("metrics")
                    if mt["only"] and mid not in mt["only"]:
                        fails.append("only")
                    if model not in me["models"]:
                        fails.append("models")
                    yield b, mid, code, model, fails


def _choices(b: Branch, mid: str, code: str, model: str) -> list[Choice]:
    return [
        ("framework", b["fw"]),
        ("group", b["group"]),
        ("datatype", b["datatype"]),
        ("outcome", b["outcome"]),
        ("model", model),
        ("method", mid),
        ("metric", code),
    ]


def _labels(tier: str, values: Iterable[str]) -> str:
    """Labels in alphabetical order, separated by semicolons (some labels hold a comma)."""
    return "; ".join(sorted((tier_label(tier, v) for v in values), key=str.lower))


def _check_reason(check: str, b: Branch, mid: str, code: str, model: str) -> Reason:
    me, mt = METHODS[mid], METRICS[code]
    rule, stated = WHY_RULE.get((mid, check), ("", False))
    if check == "only":
        rule, stated = ONLY_RULE.get(code, ""), False
    if check == "takes" and b["kind"] != "est" and rule == "R2":
        rule, stated = "", False
    if check == "domain":
        others = [k for k, m in METHODS.items() if m["domain"] == b["domain"]]
        text = "%s is offered for %s; for %s, the map offers: %s." % (
            me["label"],
            DOMAIN_WORDS[me["domain"]],
            DOMAIN_WORDS[b["domain"]],
            _labels("method", others),
        )
    elif check == "takes":
        takes = sorted(me["takes"], key=list(KIND_WORDS).index)
        text = "%s takes %s, not %s." % (me["label"], " or ".join(KIND_WORDS[k] for k in takes), KIND_WORDS[b["kind"]])
    elif check == "metrics":
        assert me["metrics"] is not None  # a "metrics" failure needs a list
        text = "%s gives only: %s." % (me["label"], _labels("metric", me["metrics"]))
    elif check == "only":
        assert mt["only"] is not None  # an "only" failure needs a list
        text = "%s is offered only with %s." % (mt["label"], _labels("method", mt["only"]))
    else:
        text = "%s fits %s only." % (me["label"], " or ".join(MODEL_WORDS[m] for m in me["models"]))
    if not stated:
        text = "In this map, " + text  # names keep their capitals
    if rule:
        src = next(r[3] for r in RULES if r[0] == rule)
    elif check == "only":
        src = mt["src"]
    elif check == "domain":  # the sources of every method the reason names
        keys: list[str] = []
        for k_mid in [mid] + [k for k, m in METHODS.items() if m["domain"] == b["domain"]]:
            keys += [k for k in METHODS[k_mid]["src"] if k not in keys]
        src = ", ".join(keys)
    else:
        src = ", ".join(me["src"])
    return Reason(text=text, rule=rule, src=src)


def _also_reasons(check: str, mid: str) -> list[Reason]:
    """The second reason a rule gives for a method's limit (ALSO_RULE), citing that rule's own sources."""
    if (mid, check) not in ALSO_RULE:
        return []
    rule, text = ALSO_RULE[(mid, check)]
    return [Reason(text=text, rule=rule, src=next(r[3] for r in RULES if r[0] == rule))]


def _choice_sources() -> dict[Choice, list[str]]:
    """The sources behind each choice: its branches' for a branch value or a metric, its own for a method."""
    sources: dict[Choice, list[str]] = {}
    for b in BRANCHES:
        cs: list[Choice] = [
            ("framework", b["fw"]),
            ("group", b["group"]),
            ("datatype", b["datatype"]),
            ("outcome", b["outcome"]),
        ]
        for c in cs + [("metric", code) for code in b["metrics"]]:
            sources.setdefault(c, [])
            sources[c] += [k for k in b["src"] if k not in sources[c]]
    for mid, me in METHODS.items():
        sources[("method", mid)] = list(me["src"])
    return sources


def why_not(paths: Sequence[Pathway]) -> dict[Choice, dict[Choice, list[Reason]]]:
    """For each choice, the choices it never meets in a pathway, each with the reasons why (the same both ways)."""
    together: dict[Choice, set[Choice]] = {}
    for p in paths:
        cs = list(zip(PATHWAY_KEY, pathway_key(p), strict=True))
        for c in cs:
            together.setdefault(c, set()).update(cs)
    sources = _choice_sources()
    by_route: dict[tuple[Choice, Choice], list[tuple[str, Reason]]] = {}
    for b, mid, code, model, fails in _combinations():
        if len(fails) != 1:
            continue
        cs = _choices(b, mid, code, model)
        reason: Reason | None = None
        for x in cs:
            for y in cs:
                if x[0] != y[0] and x in together and y not in together[x]:
                    reason = reason or _check_reason(fails[0], b, mid, code, model)
                    found = by_route.setdefault((x, y), [])
                    for r in [reason, *_also_reasons(fails[0], mid)]:
                        if (fails[0], r) not in found:
                            found.append((fails[0], r))
    out: dict[Choice, dict[Choice, list[Reason]]] = {}
    for x in together:
        for y in together:
            if x[0] == y[0] or y in together[x]:
                continue
            routes = by_route.get((x, y), [])
            # A method that can't read the data, or works in another domain, is the least telling route:
            # keep those reasons only when no limit on a model or metric explains the pair.
            closer = [r for check, r in routes if check not in ("domain", "takes")]
            reasons = closer or [r for _, r in routes] or [_apart(x, y, together, sources)]
            out.setdefault(x, {})[y] = reasons
    return out


def _apart(x: Choice, y: Choice, together: Mapping[Choice, set[Choice]], sources: Mapping[Choice, list[str]]) -> Reason:
    """Two choices that never share a branch: say what each goes with, from the shorter list."""
    # The same reason both ways: describe the choice with the shorter list, the earlier tier on a tie.
    first, second = sorted((x, y), key=lambda c: PATHWAY_KEY.index(c[0]))
    with_first = sorted((v for t, v in together[first] if t == second[0]), key=lambda v: tier_label(second[0], v))
    with_second = sorted((v for t, v in together[second] if t == first[0]), key=lambda v: tier_label(first[0], v))
    if len(with_first) <= len(with_second):
        about, tier, values = first, second[0], with_first
    else:
        about, tier, values = second, first[0], with_second
    text = "%s goes only with %s: %s." % (tier_label(*about), TIER_WORDS[tier], _labels(tier, values))
    src = sources.get(about) or sources.get(second if about == first else first) or []
    return Reason(text=text, rule="", src=", ".join(src))


TIER_WORDS = {
    "framework": "the framework",
    "group": "the group structure",
    "datatype": "the datatype",
    "outcome": "the outcome",
    "model": "the model",
    "method": "the method",
    "metric": "the metric",
}


WHY_NOT = HERE / "why_not.json"


class WhyNotFile(TypedDict):
    choices: list[str]  # "tier=value"
    reasons: list[Reason]  # each written once
    pairs: list[list[int]]  # [choice, choice, reason, ...]: each unordered pair once


def why_not_json(paths: Sequence[Pathway]) -> WhyNotFile:
    """why_not() compactly, for spec/why_not.json."""
    out = WhyNotFile(choices=[], reasons=[], pairs=[])
    r_index: dict[tuple[str, str, str], int] = {}
    c_index: dict[Choice, int] = {}

    def cid(c: Choice) -> int:
        if c not in c_index:
            c_index[c] = len(out["choices"])
            out["choices"].append("%s=%s" % c)
        return c_index[c]

    for x, others in why_not(paths).items():
        for y, rs in others.items():
            if cid(y) < cid(x):
                continue
            row = [cid(x), cid(y)]
            for r in rs:
                key = (r["text"], r["rule"], r["src"])
                if key not in r_index:
                    r_index[key] = len(out["reasons"])
                    out["reasons"].append(r)
                row.append(r_index[key])
            out["pairs"].append(row)
    return out


def write_why_not(paths: Sequence[Pathway]) -> None:
    """One pair or reason per line: small, and a change to one shows as a one-line diff."""
    data = why_not_json(paths)
    WHY_NOT.write_text(
        '{"choices": %s,\n"reasons": [\n%s\n],\n"pairs": [\n%s\n]}\n'
        % (
            json.dumps(data["choices"], ensure_ascii=False),
            ",\n".join(json.dumps(r, ensure_ascii=False) for r in data["reasons"]),
            ",\n".join(json.dumps(row) for row in data["pairs"]),
        )
    )


# --------------------------------------------------------------------------
# Cards: one for every node of every tier and for every rule, assembled from
# the data above. A card states only what the map already holds (calls,
# functions, the data each branch reads, notes and rules), each with the
# sources the map gives it. Teaching text (summary, when to use) comes later,
# in batches the owner reviews (issue #6).
# --------------------------------------------------------------------------
CARDS = HERE / "cards.json"
NODE_TIERS = ("framework", "group", "datatype", "outcome", "model", "method", "metric")
BRANCH_FIELD = {"framework": "fw", "group": "group", "datatype": "datatype", "outcome": "outcome"}
# Where to read about the two models: Cochrane 10.10.4.1 sets out the choice between them as a debate,
# and metafor's page on model types defines each. The cards' teaching text (TEACH) says so.
MODEL_SRC = "CH-10 s10.10.4.1, MF-models"


class Fact(TypedDict):
    label: str
    items: list[str]
    code: bool  # the items are R code


class CardNote(TypedDict):
    text: str
    src: str


class TeachLine(TypedDict):
    kind: str  # one of TEACH_KINDS
    text: str
    src: str  # written as for the rules


class Plain(TypedDict):
    title: str
    example: str  # empty where its only source hasn't been read
    src: str


class Card(TypedDict):
    id: str
    tier: str  # one of NODE_TIERS, "rule", or "term" (a glossary entry)
    value: str  # the value pathways use (a code for methods and metrics), or the rule's id
    title: str
    added: bool
    new: bool  # added and not yet accepted: it shows the "new" badge
    verified: bool
    facts: list[Fact]
    notes: list[CardNote]
    rules: list[str]  # ids of the rules behind a method's or metric's limits (WHY_RULE, ONLY_RULE); else empty
    teach: list[TeachLine]  # teaching text, from TEACH; empty until its batch is written
    terms: list[str]  # ids of the glossary cards for terms its teaching text or notes use (GLOSSARY)
    plain: Plain | None  # its name in plain words and an example, for Pathfinder's options (PLAIN); else None
    src: str  # the card's sources, written as for the rules


def card_id(tier: str, value: str) -> str:
    """ "method:IV", "metric:SMD", "rule:R5"; a tier whose values are labels gets a slug of the label."""
    if tier in ("method", "metric", "rule"):
        return "%s:%s" % (tier, value)
    words = "".join(c if c.isalnum() else " " for c in value.lower()).split()
    if words and words[0].isdigit():  # "1. Interventional ..." -> "interventional-..."
        words = words[1:]
    return "%s:%s" % (tier, "-".join(words))


def _join_src(fields: Iterable[str]) -> str:
    """Several source fields as one: each key once, in order of first appearance, with all its sections.

    A word starting with "s" and a digit is a section of the key before it, as the frontend reads it.
    """
    sections: dict[str, list[str]] = {}
    for field in fields:
        key = ""
        for word in field.replace(",", " ").split():
            if word[0] == "s" and word[1:2].isdigit() and key:
                if word not in sections[key]:
                    sections[key].append(word)
            else:
                key = word
                sections.setdefault(key, [])
    return ", ".join(" ".join([k, ", ".join(ss)]) if ss else k for k, ss in sections.items())


def _uniq(xs: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(xs))


def _fact(label: str, items: Iterable[str], code: bool = False) -> Fact:
    return Fact(label=label, items=list(items), code=code)


def _branch_card(tier: str, value: str) -> Card:
    bs = [b for b in BRANCHES if b[BRANCH_FIELD[tier]] == value]  # type: ignore[literal-required]
    facts: list[Fact] = []
    if tier == "framework":
        facts.append(_fact("Group structures", _uniq(b["group"] for b in bs)))
    elif tier == "group":
        facts.append(_fact("Frameworks", _uniq(b["fw"] for b in bs)))
        facts.append(_fact("Datatypes", _uniq(b["datatype"] for b in bs)))
    elif tier == "datatype":
        facts.append(
            _fact("What studies report", _uniq("%s, %s: %s" % (b["group"], b["outcome"], b["inputs"]) for b in bs))
        )
    else:
        facts.append(
            _fact("What studies report", _uniq("%s, %s: %s" % (b["group"], b["datatype"], b["inputs"]) for b in bs))
        )
    facts.append(
        _fact(
            "Branches under it",
            [
                "%d in all: %d confirmed, %d still to check; %d new, not yet accepted"
                % (
                    len(bs),
                    sum(b["verified"] for b in bs),
                    sum(not b["verified"] for b in bs),
                    sum(branch_new(b) for b in bs),
                )
            ],
        )
    )
    own = {"framework": FRAMEWORK_NOTES, "group": GROUP_NOTES, "datatype": DATATYPE_NOTES}.get(tier, {})
    card_notes = [CardNote(text=t, src=s) for t, s in [own[value]]] if value in own else []
    if tier == "outcome":
        card_notes += [
            CardNote(text="%s, %s: %s" % (b["group"], b["datatype"], b["note"]), src=", ".join(b["src"]))
            for b in bs
            if b["note"]
        ]
    return Card(
        id=card_id(tier, value),
        tier=tier,
        value=value,
        title=value,
        # new when every branch under it is new; to check when none of them is confirmed yet
        added=all(b["added"] for b in bs),
        new=all(branch_new(b) for b in bs),
        verified=any(b["verified"] for b in bs),
        facts=facts,
        notes=card_notes,
        teach=[],
        rules=[],
        terms=[],
        plain=None,
        src=_join_src([n["src"] for n in card_notes] + [", ".join(b["src"]) for b in bs]),
    )


def _framework_short(framework: str) -> str:
    """ "1. Interventional (effect of an intervention)" -> "Interventional"."""
    return framework.split(". ", 1)[-1].split(" (", 1)[0]


def _method_card(code: str, paths: Sequence[Pathway]) -> Card:
    me = METHODS[code]
    # "Used for" names the group structures the method has pathways in, not its whole domain: Peto and
    # Mantel-Haenszel are pairwise methods but take two groups only (#74).
    mine = [p for p in paths if p["method"] == code]
    # Across frameworks, a group's name alone can repeat ("One group"): name the framework too.
    several = len({p["framework"] for p in mine}) > 1
    groups = _uniq(
        f"{_framework_short(str(p['framework']))}: {p['group']}" if several else str(p["group"]) for p in mine
    )
    facts = [
        _fact("R function", [me["fn"]], code=True),
        _fact("Used for", groups or [DOMAIN_WORDS[me["domain"]]]),
        _fact("Reads", [KIND_WORDS[k] for k in sorted(me["takes"])]),
        _fact("Models", me["models"]),
        _fact("Analysis types", me["analysis"]),
    ]
    if me["metrics"] is not None:
        facts.append(_fact("Metrics", sorted(METRICS[c]["label"] for c in me["metrics"])))
    src = ", ".join(me["src"])
    return Card(
        id=card_id("method", code),
        tier="method",
        value=code,
        title=me["label"],
        added=me["added"],
        new=method_new(code),
        verified=me["verified"],
        facts=facts,
        notes=[CardNote(text=me["note"], src=src)] if me["note"] else [],
        teach=[],
        rules=sorted({r for (mid, _), (r, _) in WHY_RULE.items() if mid == code}, key=lambda r: int(r[1:])),
        terms=[],
        plain=None,
        src=src,
    )


def _metric_card(code: str) -> Card:
    mt = METRICS[code]
    facts = [
        _fact("R call", [mt["call"]], code=True),
        _fact("Outcome types", _uniq(b["outcome"] for b in BRANCHES if code in b["metrics"])),
    ]
    if mt["only"] is not None:
        facts.append(_fact("Only with", sorted(METHODS[c]["label"] for c in mt["only"])))
    return Card(
        id=card_id("metric", code),
        tier="metric",
        value=code,
        title=mt["label"],
        added=mt["added"],
        new=metric_new(code),
        verified=mt["verified"],
        facts=facts,
        notes=[],
        teach=[],
        rules=[ONLY_RULE[code]] if code in ONLY_RULE else [],
        terms=[],
        plain=None,
        src=mt["src"],
    )


def _model_card(model: str) -> Card:
    fit = [me for me in METHODS.values() if model in me["models"]]
    return Card(
        id=card_id("model", model),
        tier="model",
        value=model,
        title=model,
        added=False,
        new=False,
        verified=True,
        facts=[_fact("Methods that fit it", [me["label"] for me in fit])],
        notes=[],  # the choice between the models is in the card's teaching text (TEACH)
        teach=[],
        rules=[],
        terms=[],
        plain=None,
        # the note's sources, then those of each method listed: the list comes from each method's own models
        src=_join_src([MODEL_SRC] + [", ".join(me["src"]) for me in fit]),
    )


def _rule_card(rid: str, text: str, src: str) -> Card:
    return Card(
        id=card_id("rule", rid),
        tier="rule",
        value=rid,
        title="Rule " + rid,
        added=False,
        new=False,
        verified=True,
        facts=[],
        notes=[CardNote(text=text, src=src)],
        teach=[],
        rules=[],
        terms=[],
        plain=None,
        src=src,
    )


# --------------------------------------------------------------------------
# Each rule in plain words (#92, design D2), shown wherever a card lists the
# rules behind its limits and at the top of the rule's own card. A plain
# sentence restates its rule and adds nothing to it, so it cites the rule's
# own sources (CLAUDE.md, rule 8).
RULE_PLAIN: dict[str, str] = {
    "R1": "Inverse variance can pool any effect measure, with either model, from counts or summaries for each group "
    "or from one estimate per study.",
    "R2": "When each study reports only its own estimate, it can be pooled only by methods that take an estimate and "
    "its variance: inverse variance, bayesmeta or rma.mv.",
    "R3": "Mantel-Haenszel needs counts for each group. It gives odds ratios, risk ratios and risk differences (or rate "
    "ratios and rate differences from person-time), with a common-effect model only.",
    "R4": "There is no separate random-effects Mantel-Haenszel method: a random-effects estimate uses inverse-variance "
    "weights.",
    "R5": "Peto's method needs a 2x2 table from each study, gives only the Peto odds ratio, and fits a common-effect "
    "model only. It suits rare events, groups of similar size and small effects.",
    "R6": "A generalized linear mixed model gives odds ratios from 2x2 tables, rate ratios from counts in two groups, "
    "and logit proportions and log rates. Its risk ratios and risk differences are experimental.",
    "R7": "With random effects, a generalized linear mixed model is fitted by maximum likelihood only.",
    "R8": "A generalized linear mixed model can't be used for a measured (continuous) outcome.",
    "R9": "When events are rare, avoid inverse variance, including the DerSimonian-Laird method.",
    "R10": "Subgroup analysis and meta-regression need a function that takes study characteristics (moderators): "
    "rma.uni, rma.glmm, rma.mv or bayesmeta's bmr. rma.mh and rma.peto can't.",
    "R11": "Cumulative and leave-one-out analyses are available for rma.uni, rma.mh and rma.peto only.",
    "R12": "Cumulative and leave-one-out analyses need a model without study characteristics (moderators).",
    "R13": "The part of the bayesmeta manual read so far has no cumulative or leave-one-out function. bayesmeta "
    "computes its results numerically, with a grid approximation and the DIRECT algorithm.",
    "R14": "Hartung-Knapp confidence intervals are for random-effects models fitted with rma.uni only.",
    "R15": "REML is the default estimator of the between-study variance in metafor and RevMan. Cochrane also cites "
    "Paule-Mandel, and says no estimator is best in every case.",
    "R16": "A network meta-analysis can use either a common-effect or a random-effects model.",
    "R17": "P-scores and SUCRA rank the treatments after a network model is fitted. They are results, not effect "
    "measures.",
    "R18": "A network analysis has to check that the studies behind each comparison are similar in the things that "
    "change the effect (transitivity), and that direct and indirect evidence agree (consistency).",
    "R19": "A network usually assumes the same between-study variance for every comparison.",
    "R20": "Mantel-Haenszel for networks fits a common-effect model only.",
    "R21": "With participant data, a two-stage analysis estimates an effect in each study and then pools those "
    "estimates. A one-stage analysis fits one mixed-effects regression to all participants, stratified by study.",
    "R22": "For a cluster-randomized trial, divide the sample size (and events) by the design effect, or multiply the "
    "standard error by its square root.",
    "R23": "For a crossover trial, use a paired analysis. Without paired data, estimate the standard deviation of the "
    "differences from an assumed correlation.",
    "R24": "When a study has three or more groups, a pairwise analysis can combine groups (recommended in most situations), "
    "model the correlation between its comparisons, or use a network meta-analysis instead. Choosing one pair of groups, "
    "or splitting the shared group, is not generally recommended.",
    "R25": "For time-to-event outcomes given as observed minus expected events and their variance, Cochrane notes "
    "that RevMan offers common-effect methods only, and this map follows it. Log hazard ratios with their standard errors are pooled by "
    "inverse variance.",
    "R26": "For diagnostic accuracy, sensitivity and specificity are pooled together (the bivariate model). Without "
    "covariates, the HSROC model is equivalent.",
    "R27": "To pool a prediction model's performance, pool the c-statistic on the logit scale and the ratio of observed "
    "to expected events on the log scale, with random effects, Hartung-Knapp intervals and a prediction interval.",
    "R28": "Tests for funnel plot asymmetry need at least 10 studies. Egger's original test is not recommended for odds "
    "ratios or standardized mean differences.",
    "R29": "Trim and fill and selection models work on rma.uni models only, and trim and fill also needs a model "
    "without moderators.",
    "R30": "Meta-regression is generally not advised with fewer than ten studies.",
    "R31": "In a network, the standardized mean difference is Cohen's d, without the small-sample correction of "
    "Hedges' g, so that a study with three or more groups gives comparisons that agree.",
    "R32": "In this map, the Peto odds ratio comes only with Peto's method, the method Cochrane presents it with.",
}


# --------------------------------------------------------------------------
# Teaching text for the cards, by card id: (kind, text, source). Each line
# states its source's rule in our own words and cites the section it comes
# from (CLAUDE.md, rule 8). Written in batches the owner reviews (issue #6).
# Batch 1: the two models and the two-group methods for binary outcomes.
# Batch 2: the effect measures for two-group binary outcomes.
# Batch 3: the effect measures for two-group continuous outcomes.
# Batch 4: the measures for one group (proportions, means, incidence rates), from escalc() only.
# Batch 5: the measures for change scores and matched pairs.
# Batch 6: the other two-group measures (rates, hazard ratio, ordinal) and O - E and variance.
# Batch 7: the other pairwise methods (penalised logistic regression, Bayesian, multilevel, one-stage IPD).
# Batch 8: the network methods with a source that covers them (not yet one-stage IPD in a network).
# Batch 9: the other frameworks' methods, from the package pages only (the DTA handbook is not read yet).
# Batch 10: the correlation and Cronbach's alpha measures, from escalc() only.
# Batch 11: summary sensitivity and specificity, prediction model performance and dose-response trends.
# Batch 12: the network measures, from netmeta() and pairwise().
# Batch 13: the adjusted exposure measures, from Cochrane 10 (not the IPD measures: Cochrane 26 doesn't cover them).
# Batch 14: the interventional framework, its group structures, datatypes and outcome types.
# Batch 15: the other frameworks and their branches, where the source has been read.
# --------------------------------------------------------------------------
TEACH_KINDS = ("what", "use", "caution")
# The line every network measure shares: what netmeta() reads (netmeta(), "sm" and "TE").
NETWORK_MEASURE: tuple[str, str, str] = (
    "what",
    "The same measure as in a pairwise analysis, pooled across the network by netmeta(). netmeta() reads one "
    "estimate per comparison (every pair of arms in a multi-arm study); for arm-level data, pairwise() computes "
    "them.",
    "NM",
)
# The line every adjusted exposure measure shares: how an estimate with its standard error is pooled.
ADJUSTED_MEASURE: tuple[str, str, str] = (
    "what",
    "Each study's estimate enters as its natural logarithm with its standard error, pooled by the generic "
    "inverse-variance method. Cochrane describes that method for results available only as an estimate and its "
    "standard error, including those from non-randomized studies.",
    "CH-10 s10.3.3",
)
# Cautions that hold for every network method, whatever fits the model (Cochrane 11.2.2, 11.3.1).
NETWORK_CAUTIONS: list[tuple[str, str, str]] = [
    (
        "caution",
        "Indirect comparisons hold only when the studies behind the different comparisons are similar in everything "
        "important apart from the treatments compared (transitivity). Cochrane assesses this by comparing the "
        "effect modifiers across comparisons.",
        "CH-11 s11.2.2",
    ),
    (
        "caution",
        "Cochrane advises including a statistician skilled in network meta-analysis in the review team.",
        "CH-11 s11.3.1",
    ),
]
TEACH: dict[str, list[tuple[str, str, str]]] = {
    "model:common-effect": [
        (
            "what",
            "In its classic reading, it assumes every study estimates the same true effect, so the studies' results "
            "differ by chance alone, and the pooled estimate is that one effect.",
            "CH-10 s10.3.1, MF-models",
        ),
        (
            "what",
            'metafor separates two readings. The equal-effects model (method="EE") assumes the true effects are '
            'equal. The fixed-effects model (method="FE") makes no such assumption and estimates a weighted average '
            "of the included studies' true effects, which holds for those studies only. Both give the same numbers. "
            'This map\'s "Common effect" covers both.',
            "MF-models",
        ),
        (
            "use",
            "Whether to prefer it to a random-effects model is debated. Cochrane sets out arguments on both sides, "
            "and says the choice should not rest on a statistical test for heterogeneity.",
            "CH-10 s10.10.4.1",
        ),
        (
            "caution",
            "metafor advises deciding which kind of inference is wanted before examining the data, and notes that no "
            "test can show for certain that the true effects are homogeneous.",
            "MF-models",
        ),
    ],
    "model:random-effects": [
        (
            "what",
            "Assumes the studies' true effects differ, drawn from a distribution. It estimates their mean and the "
            "between-study variance (tau squared).",
            "CH-10 s10.3.2, MF-models",
        ),
        (
            "what",
            "Its inference reaches beyond the included studies, to a wider population of studies, which metafor "
            "notes is only loosely defined.",
            "MF-models",
        ),
        (
            "use",
            "Whether to prefer it to a common-effect model is debated. Cochrane sets out arguments on both sides, "
            "and says the choice should not rest on a statistical test for heterogeneity.",
            "CH-10 s10.10.4.1",
        ),
        (
            "caution",
            "It gives smaller studies relatively more weight than a common-effect model does, which can strengthen "
            "small-study bias when the funnel plot is asymmetric.",
            "CH-10 s10.10.4.1",
        ),
    ],
    "method:IV": [
        (
            "what",
            "Weights each study's estimate by the inverse of its variance, so more precise studies count for more. "
            "It needs only an estimate and its standard error from each study.",
            "CH-10 s10.3, s10.3.1",
        ),
        (
            "use",
            "The general approach: in metafor it takes any effect measure, with a common-effect or a random-effects "
            "model.",
            "MF-uni",
        ),
        (
            "caution",
            "Cochrane advises avoiding it, including DerSimonian and Laird, when events are rare: it relies on "
            "large-sample variances, and zero cells need a correction (often 0.5 added to each cell) that tends to "
            "pull the estimate toward no difference.",
            "CH-10 s10.4.4.1, s10.4.4.3",
        ),
    ],
    "method:MH": [
        (
            "what",
            "A common-effect method for 2x2 tables (odds ratio, risk ratio or risk difference) that weights studies "
            "in its own way, depending on the effect measure.",
            "CH-10 s10.4.1",
        ),
        (
            "use",
            "Cochrane prefers it to inverse variance when data are sparse (few events or small studies), and "
            "considers it generally preferable in common-effect analyses; otherwise the two give similar results.",
            "CH-10 s10.4.1",
        ),
        (
            "use",
            "A zero-cell correction is needed only when the same cell is zero in every study.",
            "CH-10 s10.4.4.1",
        ),
        (
            "caution",
            "Cochrane lists it among the common-effect methods; the random-effects method it gives for binary "
            "outcomes is inverse variance.",
            "CH-10 s10.4",
        ),
    ],
    "method:PETO": [
        (
            "what",
            "Pools odds ratios only, using an approximate log odds ratio built from observed minus expected events "
            "(O - E) and its variance. It needs no zero-cell correction.",
            "CH-10 s10.4.2",
        ),
        (
            "use",
            "Works well when events are rare, effects are small (odds ratios near 1) and the arms are of similar "
            "size. With event rates below 1%, it was the least biased and most powerful method in the studies "
            "Cochrane reviews, provided the effects were not very large and the arms not badly unbalanced.",
            "CH-10 s10.4.2, s10.4.4.3",
        ),
        (
            "caution",
            "It can be biased when effects are large, events are common or the arms are unbalanced. Cochrane does "
            "not recommend it as a default.",
            "CH-10 s10.4.2",
        ),
    ],
    "method:GLMM": [
        (
            "what",
            "Models the counts directly with logistic (or Poisson) regression, instead of pooling an estimate from "
            "each study. With random effects it is a binomial-normal (or Poisson-normal) model.",
            "MF-glmm",
        ),
        (
            "what",
            "Zero cells don't stop the fit, so no continuity correction is needed to fit it. Studies with no events "
            "in either group are left out by default.",
            "MF-glmm",
        ),
        (
            "use",
            "Cochrane lists logistic regression among the methods that did best for rare events in the cases where "
            "Peto's method did not: event rates above 1%, very large effects, or many unbalanced studies.",
            "CH-10 s10.4.4.3",
        ),
        (
            "caution",
            "Random effects are fitted by maximum likelihood only. Risk ratio and risk difference are experimental "
            "in rma.glmm() and often run into numerical problems, such as failing to converge.",
            "MF-glmm",
        ),
    ],
    "metric:OR": [
        (
            "what",
            "The ratio of the odds of the event in the two groups, where the odds are the chance of the event divided by the chance of no event. metafor analyses it on the log scale, which makes it symmetric around 0 and gives it a sampling distribution closer to normal.",
            "CH-6 s6.4.1.1, s6.4.1.2, MF-escalc",
        ),
        (
            "use",
            "Cochrane notes that relative measures (odds ratio, risk ratio) are on average more consistent across studies than risk differences. It suggests pooling a relative measure, re-expressing the result in absolute terms, and checking how much the choice of measure matters.",
            "CH-10 s10.4.3",
        ),
        (
            "caution",
            "It is easily misread as a risk ratio. When events are common (above about 20%), that misreading overstates the effect. Cochrane advises converting it to a risk ratio, using the comparator group's risk, before interpreting it.",
            "CH-6 s6.4.1.2, s6.4.1.3",
        ),
        (
            "caution",
            "A study with no events, or only events, in a group needs a correction before it can be computed. By default escalc() adds 0.5 to each cell of any table with a zero cell.",
            "CH-6 s6.4.1.2, MF-escalc",
        ),
        (
            "caution",
            "Cochrane leaves out studies with no events, or only events, in both groups, as they say nothing about the size of the effect. escalc() keeps them by default and corrects them like any other table with a zero cell. Setting drop00=TRUE leaves them out; its documentation notes that this has sometimes been recommended.",
            "CH-6 s6.4.1.2, CH-10 s10.4.4.2, MF-escalc",
        ),
    ],
    "metric:RR": [
        (
            "what",
            "The risk of the event in one group divided by the risk in the other; 1 means no difference. metafor analyses it on the log scale, which makes it symmetric around 0 and gives it a sampling distribution closer to normal.",
            "CH-6 s6.4.1.2, MF-escalc",
        ),
        (
            "use",
            "Cochrane notes that relative measures (odds ratio, risk ratio) are on average more consistent across studies than risk differences. It suggests pooling a relative measure, re-expressing the result in absolute terms, and checking how much the choice of measure matters.",
            "CH-10 s10.4.3",
        ),
        (
            "caution",
            "Switching which outcome counts as the event only flips the sign of a risk difference or inverts an odds ratio, but it can change a risk ratio substantially. Cochrane suggests counting the less common outcome as the event.",
            "CH-6 s6.4.1.5",
        ),
        (
            "caution",
            "What it means clinically depends on the baseline risk: the same risk ratio can be a large or a trivial change in absolute terms.",
            "CH-6 s6.4.1.2",
        ),
        (
            "caution",
            "A study with no events in either group needs a correction before it can be computed. By default escalc() adds 0.5 to each cell of any table with a zero cell, which includes a group where everyone had the event.",
            "CH-6 s6.4.1.2, MF-escalc",
        ),
        (
            "caution",
            "Cochrane leaves out studies with no events, or only events, in both groups, as they say nothing about the size of the effect. escalc() keeps them by default and corrects them like any other table with a zero cell. Setting drop00=TRUE leaves them out; its documentation notes that this has sometimes been recommended.",
            "CH-6 s6.4.1.2, CH-10 s10.4.4.2, MF-escalc",
        ),
    ],
    "metric:RD": [
        (
            "what",
            "The risk in one group minus the risk in the other, also called the absolute risk reduction. It can be computed even when neither group has events.",
            "CH-6 s6.4.1, s6.4.1.4",
        ),
        (
            "use",
            "Easy to understand, and useful for weighing likely benefits against likely harms. A number needed to treat can't be pooled, but a pooled result can be converted to one.",
            "CH-6 s6.4.1.4",
        ),
        (
            "caution",
            "Cochrane notes that relative measures are on average more consistent across studies than risk differences, and considers it wise to avoid pooling risk differences unless there is a clear reason to expect them to be consistent. A pooled relative effect can be re-expressed as a risk difference.",
            "CH-10 s10.4.3",
        ),
        (
            "caution",
            "Applied to a population with a different baseline risk, it can give impossible risks, below 0 or above 1.",
            "CH-6 s6.4.1.4",
        ),
    ],
    "metric:PETO": [
        (
            "what",
            "The odds ratio as Peto's method estimates it: an approximation built from observed minus expected events and their variance, on the log scale.",
            "CH-10 s10.4.2, MF-escalc",
        ),
        (
            "use",
            "In this map it goes only with Peto's method (rule R32); that method's card says when it suits.",
            "CH-10 s10.4.2, MF-escalc",
        ),
        (
            "caution",
            "The approximation can be biased when effects are large, events are common or the arms are unbalanced.",
            "CH-10 s10.4.2",
        ),
    ],
    "metric:AS": [
        ("what", "The difference between the arcsine square roots of the two groups' risks.", "MF-escalc"),
        ("what", "escalc() adds no 0.5 correction to zero cells for this measure unless asked to.", "MF-escalc"),
    ],
    "metric:MD": [
        (
            "what",
            "The difference between the two groups' mean outcomes, in the outcome's own units. Cochrane uses it when every study measures the outcome on the same scale.",
            "CH-6 s6.5.1.1, MF-escalc",
        ),
        (
            "what",
            'By default escalc() computes its variance without assuming the two groups have equal variances (vtype="LS"); vtype="HO" assumes they do.',
            "MF-escalc",
        ),
    ],
    "metric:SMD_G": [
        (
            "what",
            "The mean difference divided by the pooled standard deviation of the two groups, corrected for the small-sample bias of Cohen's d. Cochrane's standardized mean difference is this one, Hedges' adjusted g.",
            "CH-6 s6.5.1.2, MF-escalc",
        ),
        (
            "use",
            "For studies that measure the same thing with different instruments: each study's effect is expressed relative to the spread between its participants, which puts the studies on one scale. Results are in standard-deviation units, not the original units.",
            "CH-6 s6.5.1.2",
        ),
        (
            "caution",
            "It assumes that differences in standard deviation between studies come from their different scales, not from real differences in how variable their populations are. Where populations differ in spread (Cochrane's example: explanatory and pragmatic trials), the same true effect gives different values.",
            "CH-6 s6.5.1.2",
        ),
        (
            "caution",
            "It doesn't align scales that run in opposite directions. Where higher scores mean worse on some scales and better on others, Cochrane treats aligning them as essential: multiply one set of means by -1, or subtract them from the scale's maximum; the standard deviations stay as they are.",
            "CH-6 s6.5.1.2",
        ),
    ],
    "metric:SMD_D": [
        (
            "what",
            "The mean difference divided by the pooled standard deviation of the two groups, without the small-sample correction (correct=FALSE). escalc() notes that this version is biased upwards; Hedges' g corrects that.",
            "MF-escalc",
        ),
        (
            "use",
            "For studies that measure the same thing with different instruments: each study's effect is expressed relative to the spread between its participants, which puts the studies on one scale. Results are in standard-deviation units, not the original units.",
            "CH-6 s6.5.1.2",
        ),
        (
            "caution",
            "It assumes that differences in standard deviation between studies come from their different scales, not from real differences in how variable their populations are. Where populations differ in spread (Cochrane's example: explanatory and pragmatic trials), the same true effect gives different values.",
            "CH-6 s6.5.1.2",
        ),
        (
            "caution",
            "It doesn't align scales that run in opposite directions. Where higher scores mean worse on some scales and better on others, Cochrane treats aligning them as essential: multiply one set of means by -1, or subtract them from the scale's maximum; the standard deviations stay as they are.",
            "CH-6 s6.5.1.2",
        ),
        ("caution", "Cochrane's standardized mean difference is Hedges' adjusted g, not this one.", "CH-6 s6.5.1.2"),
    ],
    "metric:SMDH": [
        (
            "what",
            "The mean difference divided by the square root of the average of the two groups' variances, so it doesn't assume the groups have equal variances. escalc() applies a bias correction by default.",
            "MF-escalc",
        ),
        (
            "use",
            "For studies that measure the same thing with different instruments: each study's effect is expressed relative to the spread between its participants, which puts the studies on one scale. Results are in standard-deviation units, not the original units.",
            "CH-6 s6.5.1.2",
        ),
        (
            "caution",
            "It assumes that differences in standard deviation between studies come from their different scales, not from real differences in how variable their populations are. Where populations differ in spread (Cochrane's example: explanatory and pragmatic trials), the same true effect gives different values.",
            "CH-6 s6.5.1.2",
        ),
        (
            "caution",
            "It doesn't align scales that run in opposite directions. Where higher scores mean worse on some scales and better on others, Cochrane treats aligning them as essential: multiply one set of means by -1, or subtract them from the scale's maximum; the standard deviations stay as they are.",
            "CH-6 s6.5.1.2",
        ),
    ],
    "metric:SMD1": [
        (
            "what",
            "The mean difference divided by one group's standard deviation only: in escalc(), the second group's, and the first group's is not used. Cochrane calls the version that uses the comparator group's standard deviation Glass' delta.",
            "CH-6 s6.5.1.2, MF-escalc",
        ),
        (
            "use",
            "For studies that measure the same thing with different instruments: each study's effect is expressed relative to the spread between its participants, which puts the studies on one scale. Results are in standard-deviation units, not the original units.",
            "CH-6 s6.5.1.2",
        ),
        (
            "caution",
            "It assumes that differences in standard deviation between studies come from their different scales, not from real differences in how variable their populations are. Where populations differ in spread (Cochrane's example: explanatory and pragmatic trials), the same true effect gives different values.",
            "CH-6 s6.5.1.2",
        ),
        (
            "caution",
            "It doesn't align scales that run in opposite directions. Where higher scores mean worse on some scales and better on others, Cochrane treats aligning them as essential: multiply one set of means by -1, or subtract them from the scale's maximum; the standard deviations stay as they are.",
            "CH-6 s6.5.1.2",
        ),
    ],
    "metric:ROM": [
        (
            "what",
            "The ratio of the two groups' mean outcomes. metafor analyses it on the log scale, which makes it symmetric around 0 and gives it a sampling distribution closer to normal.",
            "CH-6 s6.5.1.3, MF-escalc",
        ),
        (
            "use",
            "It can combine studies that use different scales, provided the scales have comparable lower limits. It suits physical measurements that can only be positive but are measured in ways that can't easily be converted.",
            "CH-6 s6.5.1.3",
        ),
        (
            "caution",
            "Only for outcomes that take positive values: it suits values after the intervention, not changes from baseline, which can be negative. escalc() can't compute it when the two means have opposite signs.",
            "CH-6 s6.5.1.3, MF-escalc",
        ),
    ],
    "metric:PR": [
        ("what", "The proportion of participants with the event, untransformed.", "MF-escalc"),
        (
            "caution",
            "By default escalc() adds 0.5 to the event and non-event counts of any study where either is 0.",
            "MF-escalc",
        ),
    ],
    "metric:PLN": [
        ("what", "The proportion of participants with the event, on the log scale.", "MF-escalc"),
        (
            "caution",
            "By default escalc() adds 0.5 to the event and non-event counts of any study where either is 0.",
            "MF-escalc",
        ),
    ],
    "metric:PLO": [
        (
            "what",
            "The proportion of participants with the event on the logit scale, that is, the log odds of the event.",
            "MF-escalc",
        ),
        (
            "caution",
            "By default escalc() adds 0.5 to the event and non-event counts of any study where either is 0.",
            "MF-escalc",
        ),
    ],
    "metric:PRZ": [
        ("what", "The proportion of participants with the event on the probit scale.", "MF-escalc"),
        (
            "caution",
            "By default escalc() adds 0.5 to the event and non-event counts of any study where either is 0.",
            "MF-escalc",
        ),
    ],
    "metric:PAS": [
        (
            "what",
            "The proportion of participants with the event after the arcsine square-root (angular) transformation.",
            "MF-escalc",
        ),
        ("caution", "escalc() adds no correction to zero counts for this measure unless asked to.", "MF-escalc"),
    ],
    "metric:PFT": [
        (
            "what",
            "The proportion of participants with the event after the Freeman-Tukey double arcsine transformation.",
            "MF-escalc",
        ),
        (
            "caution",
            "metafor's documentation does not recommend double arcsine proportions for meta-analysis, citing Schwarzer et al. (2019) and Röver and Friede (2022).",
            "MF-escalc",
        ),
        ("caution", "escalc() adds no correction to zero counts for this measure unless asked to.", "MF-escalc"),
    ],
    "metric:MN": [
        ("what", "The mean outcome in one group, in the outcome's own units.", "MF-escalc"),
    ],
    "metric:SMN": [
        (
            "what",
            "The mean divided by the standard deviation. escalc() needs the standard deviation itself, not the standard error of the mean.",
            "MF-escalc",
        ),
        (
            "what",
            "Subtracting a fixed value from each mean first gives a single-group standardized mean difference.",
            "MF-escalc",
        ),
    ],
    "metric:MNLN": [
        (
            "what",
            "The mean outcome in one group, on the log scale. metafor mentions it for measurements on a ratio scale.",
            "MF-escalc",
        ),
    ],
    "metric:IR": [
        ("what", "The number of events divided by the person-time at risk, untransformed.", "MF-escalc"),
        ("caution", "By default escalc() adds 0.5 to the event count of any study with no events.", "MF-escalc"),
    ],
    "metric:IRLN": [
        ("what", "The number of events divided by the person-time at risk, on the log scale.", "MF-escalc"),
        ("caution", "By default escalc() adds 0.5 to the event count of any study with no events.", "MF-escalc"),
    ],
    "metric:IRS": [
        (
            "what",
            "The number of events divided by the person-time at risk, after a square-root transformation.",
            "MF-escalc",
        ),
        ("caution", "escalc() adds no correction to zero counts for this measure unless asked to.", "MF-escalc"),
    ],
    "metric:IRFT": [
        (
            "what",
            "The number of events divided by the person-time at risk, after the Freeman-Tukey transformation.",
            "MF-escalc",
        ),
        ("caution", "escalc() adds no correction to zero counts for this measure unless asked to.", "MF-escalc"),
    ],
    "metric:MC": [
        ("what", "The difference between the means of the two measurements, in the outcome's own units.", "MF-escalc"),
        (
            "what",
            "If a study reports only the standard deviation of the change scores, escalc() can take it as sd1i, with sd2i and ri set to 0.",
            "MF-escalc",
        ),
        (
            "use",
            "For two measurements on the same people (one group measured twice), or on two matched groups.",
            "MF-escalc",
        ),
        (
            "use",
            "In a crossover trial, Cochrane advises a paired analysis: analysing the periods as if they were separate groups is a unit-of-analysis error that gives the trial too little weight.",
            "CH-23 s23.2.5, s23.2.6",
        ),
        (
            "caution",
            "It needs the correlation between the two measurements. For crossover trials that don't report it, Cochrane suggests taking it from another study or an external source, and checking the result over plausible values in a sensitivity analysis.",
            "CH-23 s23.2.7.1, s23.2.7.3, MF-escalc",
        ),
    ],
    "metric:SMCC": [
        (
            "what",
            "The mean change divided by the standard deviation of the change scores, which escalc() works out from the two standard deviations and their correlation. A bias correction applies by default.",
            "MF-escalc",
        ),
        (
            "what",
            "If a study reports only the standard deviation of the change scores, escalc() can take it as sd1i, with sd2i and ri set to 0.",
            "MF-escalc",
        ),
        (
            "use",
            "For two measurements on the same people (one group measured twice), or on two matched groups.",
            "MF-escalc",
        ),
        (
            "use",
            "In a crossover trial, Cochrane advises a paired analysis: analysing the periods as if they were separate groups is a unit-of-analysis error that gives the trial too little weight.",
            "CH-23 s23.2.5, s23.2.6",
        ),
        (
            "caution",
            "It needs the correlation between the two measurements. For crossover trials that don't report it, Cochrane suggests taking it from another study or an external source, and checking the result over plausible values in a sensitivity analysis.",
            "CH-23 s23.2.7.1, s23.2.7.3, MF-escalc",
        ),
        (
            "caution",
            "When the change-score standard deviation is worked out from an imputed correlation, the imputed value changes the estimate itself, not only its standard error. Cochrane gives this caution for standardized mean differences from crossover trials.",
            "CH-23 s23.2.7.2",
        ),
    ],
    "metric:SMCR": [
        (
            "what",
            "The mean change divided by the standard deviation of the raw scores at one time point, usually before treatment; the other standard deviation isn't needed. A bias correction applies by default.",
            "MF-escalc",
        ),
        (
            "use",
            "For two measurements on the same people (one group measured twice), or on two matched groups.",
            "MF-escalc",
        ),
        (
            "use",
            "In a crossover trial, Cochrane advises a paired analysis: analysing the periods as if they were separate groups is a unit-of-analysis error that gives the trial too little weight.",
            "CH-23 s23.2.5, s23.2.6",
        ),
    ],
    "metric:ROMC": [
        (
            "what",
            "The ratio of the two measurements' means, on the log scale. A bias correction applies by default.",
            "MF-escalc",
        ),
        (
            "use",
            "For two measurements on the same people (one group measured twice), or on two matched groups.",
            "MF-escalc",
        ),
        (
            "use",
            "In a crossover trial, Cochrane advises a paired analysis: analysing the periods as if they were separate groups is a unit-of-analysis error that gives the trial too little weight.",
            "CH-23 s23.2.5, s23.2.6",
        ),
    ],
    "metric:MPRR": [
        (
            "what",
            "Built from a paired 2x2 table, which classifies each pair (or each person measured twice) by the outcome under both conditions.",
            "MF-escalc",
        ),
        (
            "what",
            "Computed from the marginal table: the paired table collapsed to the number with the outcome under each condition. This one is the risk ratio, on the log scale.",
            "MF-escalc",
        ),
        (
            "caution",
            "For crossover trials with binary outcomes, Cochrane notes that more complex methods are needed and suggests consulting a statistician.",
            "CH-23 s23.2.5",
        ),
    ],
    "metric:MPOR": [
        (
            "what",
            "Built from a paired 2x2 table, which classifies each pair (or each person measured twice) by the outcome under both conditions.",
            "MF-escalc",
        ),
        (
            "what",
            "Computed from the marginal table: the paired table collapsed to the number with the outcome under each condition. This one is the odds ratio, on the log scale.",
            "MF-escalc",
        ),
        (
            "caution",
            "For crossover trials with binary outcomes, Cochrane notes that more complex methods are needed and suggests consulting a statistician.",
            "CH-23 s23.2.5",
        ),
    ],
    "metric:MPRD": [
        (
            "what",
            "Built from a paired 2x2 table, which classifies each pair (or each person measured twice) by the outcome under both conditions.",
            "MF-escalc",
        ),
        (
            "what",
            "Computed from the marginal table: the paired table collapsed to the number with the outcome under each condition. This one is the risk difference.",
            "MF-escalc",
        ),
        (
            "caution",
            "For crossover trials with binary outcomes, Cochrane notes that more complex methods are needed and suggests consulting a statistician.",
            "CH-23 s23.2.5",
        ),
    ],
    "metric:MPORC": [
        (
            "what",
            "Built from a paired 2x2 table, which classifies each pair (or each person measured twice) by the outcome under both conditions.",
            "MF-escalc",
        ),
        ("what", "The conditional odds ratio, computed from the paired table itself, on the log scale.", "MF-escalc"),
        (
            "caution",
            "For crossover trials with binary outcomes, Cochrane notes that more complex methods are needed and suggests consulting a statistician.",
            "CH-23 s23.2.5",
        ),
    ],
    "metric:IRR": [
        (
            "what",
            "Each group's events divided by its person-time at risk, and the ratio of the two rates, on the log scale. Cochrane pools the log rate ratio by inverse variance; Poisson regression is an alternative.",
            "CH-10 s10.8, MF-escalc",
        ),
        (
            "what",
            "In randomized trials it is often close to the risk ratio, but the two differ when the intervention changes the chance of having more than one event.",
            "CH-10 s10.8",
        ),
        (
            "caution",
            "A rate assumes the risk of an event is the same for every participant and over time, which may not hold. Cochrane notes rates are particularly suited to rare events.",
            "CH-10 s10.8",
        ),
        (
            "caution",
            "By default escalc() adds 0.5 to both groups' event counts in any study with no events in one or both groups.",
            "MF-escalc",
        ),
    ],
    "metric:IRD": [
        (
            "what",
            "The difference between the two groups' rates (events divided by person-time at risk). Cochrane notes it can also be pooled by inverse variance.",
            "CH-10 s10.8, MF-escalc",
        ),
        (
            "caution",
            "A rate assumes the risk of an event is the same for every participant and over time, which may not hold. Cochrane notes rates are particularly suited to rare events.",
            "CH-10 s10.8",
        ),
        (
            "caution",
            "By default escalc() adds 0.5 to both groups' event counts in any study with no events in one or both groups.",
            "MF-escalc",
        ),
    ],
    "metric:IRSD": [
        ("what", "The difference between the square roots of the two groups' rates.", "MF-escalc"),
        (
            "caution",
            "A rate assumes the risk of an event is the same for every participant and over time, which may not hold. Cochrane notes rates are particularly suited to rare events.",
            "CH-10 s10.8",
        ),
        ("caution", "escalc() adds no correction to zero counts for this measure unless asked to.", "MF-escalc"),
    ],
    "metric:HR": [
        (
            "what",
            "The hazard ratio, pooled on the log scale. Log hazard ratios and their standard errors, for example from Cox models, are pooled by inverse variance.",
            "CH-10 s10.9",
        ),
        (
            "use",
            "If some studies report log-rank results and others Cox estimates, Cochrane notes the log-rank results can be converted to log hazard ratios and standard errors, so that all can be pooled together.",
            "CH-10 s10.9",
        ),
    ],
    "metric:POR": [
        (
            "what",
            "The proportional odds ratio, from a proportional odds model of an ordinal scale. Its log and standard error are pooled by inverse variance.",
            "CH-10 s10.7",
        ),
        (
            "use",
            "Suits a scale with few categories, when each group's counts per category are reported and all studies used the same scale. It uses the data better than splitting the scale in two.",
            "CH-10 s10.7",
        ),
        (
            "caution",
            "It needs statistical software, and its summary is hard to interpret clinically. Cochrane notes ordinal outcomes are more often analysed as binary or continuous, following how the studies analysed them.",
            "CH-10 s10.7",
        ),
    ],
    "method:OEV": [
        (
            "what",
            "Pools observed minus expected statistics (O - E) and their variances (V), from participant data or study reports.",
            "CH-10 s10.9",
        ),
        (
            "use",
            "With a log-rank approach it gives a hazard ratio; Peto's method on binary data gives an odds ratio.",
            "CH-10 s10.9",
        ),
        (
            "caution",
            "Cochrane notes that RevMan offers only common-effect methods for O - E and V outcomes.",
            "CH-10 s10.9",
        ),
    ],
    "method:LRP": [
        (
            "what",
            "Fits one logistic regression to the arm-level counts of every study at once, maximising a likelihood "
            "with a Firth-type penalty. It pools odds ratios.",
            "META-bin",
        ),
        (
            "use",
            "The penalty aims to reduce bias when events are rare and studies are few, though meta notes it can be "
            "used for binary data in general. Studies with no events in one arm or in both are included without a "
            "continuity correction.",
            "META-bin",
        ),
        (
            "caution",
            "Its random-effects version uses a multiplicative heterogeneity parameter (an estimate of 1 means no "
            "heterogeneity) rather than a between-study variance (tau squared).",
            "META-bin",
        ),
    ],
    "method:BAYES": [
        (
            "what",
            "Fits the random-effects model, whose two unknowns are the mean effect and the heterogeneity (tau), the "
            "Bayesian way: a prior for each is combined with the data into posterior distributions. bayesmeta() "
            "computes them numerically, with the DIRECT algorithm.",
            "BM",
        ),
        (
            "what",
            "It reports an estimate with a credible interval, the range the effect lies in with the stated "
            "probability, and can give the probability that the effect lies in any range.",
            "CH-10 s10.13",
        ),
        (
            "use",
            "Cochrane lists potential advantages: it can bring in outside evidence, such as how much effects usually "
            "vary, and it allows for the imprecision of the estimated heterogeneity. It adds that an informative "
            "heterogeneity prior is particularly useful when there are few studies.",
            "CH-10 s10.13",
        ),
        (
            "use",
            "bayesmeta() can also predict the effect in a new study and give shrunken estimates for each study. "
            "bmr() extends it to meta-regression, including subgroups coded as zero/one covariates.",
            "BM, BM-bmr",
        ),
        (
            "caution",
            "Results depend on the priors, so analysts using different priors can reach different results. Cochrane "
            "asks for sensitivity analyses of the assumptions and strongly recommends statistical expertise.",
            "CH-10 s10.13",
        ),
        (
            "caution",
            "The default heterogeneity prior in bayesmeta() is uniform, which its manual says to use with caution; "
            "it names weakly informative alternatives such as half-normal and half-Cauchy priors.",
            "BM",
        ),
    ],
    "method:MV": [
        (
            "what",
            "Fits multilevel and multivariate models: several estimates from one study can each enter, with a random "
            "effect for each level (such as estimates within studies) and a variance-covariance matrix for their "
            "sampling errors.",
            "MF-mv",
        ),
        (
            "use",
            "For studies that contribute dependent estimates. vcalc() can construct or approximate the "
            "variance-covariance matrix of those estimates.",
            "MF-mv",
        ),
        (
            "caution",
            "Given only the sampling variances, rma.mv() assumes the sampling errors are uncorrelated. robust() gives "
            "cluster-robust tests and confidence intervals.",
            "MF-mv",
        ),
        (
            "caution",
            'Tests use the normal distribution by default. test="t" uses a t distribution but, unlike the '
            'Hartung-Knapp option (test="knha") in rma.uni(), does not adjust the standard errors.',
            "MF-mv",
        ),
    ],
    "method:IPD1": [
        (
            "what",
            "Analyses the participant data of all studies in one regression model, stratified by study. The two-stage "
            "alternative analyses each study separately and then pools the summaries.",
            "CH-26 s26.4.2",
        ),
        (
            "use",
            "Cochrane notes that one-stage and two-stage analyses often give similar results, and that differences "
            "tend to come from different modelling assumptions. It asks for the choice to be specified in advance, "
            "or for both results to be reported.",
            "CH-26 s26.4.2",
        ),
        (
            "caution",
            "Participants have to stay within their studies, by stratifying or by accounting for clustering. The "
            "model needs more statistical expertise, and standard meta-analysis statistics are hard to get from it; "
            "Cochrane suggests a two-stage analysis alongside it for those and for forest plots.",
            "CH-26 s26.4.2",
        ),
        (
            "caution",
            "When estimating how participant characteristics change the effect, within-study interactions must be "
            "kept apart from between-study ones.",
            "CH-26 s26.4.4",
        ),
    ],
    "method:NM_GT": [
        (
            "what",
            "netmeta() fits the network with a graph-theoretical method taken from electrical networks, which has "
            "been shown to be equivalent to frequentist network meta-analysis. It reads one estimate per comparison; "
            "pairwise() converts arm-level data.",
            "NM",
        ),
        (
            "what",
            "A multi-arm study enters as all of its pairwise comparisons, reweighted because they come from the same "
            "study.",
            "NM",
        ),
        (
            "use",
            "It fits common and random effects together. The random-effects model adds the same heterogeneity "
            "variance to every comparison, estimated by DL, REML or ML.",
            "NM",
        ),
        (
            "use",
            "To check consistency, its Q statistic splits into a part for each pairwise meta-analysis and a part for "
            "the inconsistency left between them. Cochrane notes that finding no significant incoherence does not "
            "show there is none.",
            "NM, CH-11 s11.4.4.2",
        ),
        (
            "caution",
            "Assuming the same heterogeneity for every comparison is common and helps estimation, but Cochrane says "
            "the choice should rest on clinical and methodological judgement.",
            "CH-11 s11.4.3.2",
        ),
        (
            "caution",
            "Harrer et al. note that netmeta does not yet support meta-regression, which a Bayesian model allows.",
            "DMA",
        ),
    ]
    + NETWORK_CAUTIONS,
    "method:NM_MV": [
        (
            "what",
            "Fits the network as a multivariate model in rma.mv(), arm-based or contrast-based. The covariances "
            "between the comparisons of a multi-arm study go into the variance-covariance matrix.",
            "MD-senn",
        ),
        (
            "use",
            "The documented example fits fixed-effects and random-effects network models, and a model with random "
            "inconsistency effects (Law et al. 2016).",
            "MD-senn",
        ),
        (
            "use",
            "Like any rma.mv() model it accepts moderators, so a network model can include them.",
            "MF-mv",
        ),
    ]
    + NETWORK_CAUTIONS,
    "method:NM_MH": [
        (
            "what",
            "netmetabin() pools binary outcomes across a network from the event counts and sample sizes of each arm, "
            "one comparison per row (pairwise() converts arm-based data). Its Mantel-Haenszel "
            "method (Efthimiou et al. 2019) and its non-central hypergeometric method fit common effects only.",
            "NM-bin",
        ),
        (
            "use",
            "The Mantel-Haenszel model comes from a paper on network meta-analysis of rare events. By default, no "
            "continuity correction enters the network estimates.",
            "NM-bin",
        ),
        (
            "caution",
            "Heterogeneity is not modelled. In netmetabin(), a preset heterogeneity and prediction intervals are "
            "available only with the inverse-variance method.",
            "NM-bin",
        ),
    ]
    + NETWORK_CAUTIONS,
    "method:NM_BAYES": [
        (
            "what",
            "Fits a Bayesian hierarchical model for the network with gemtc, which samples the posterior by MCMC "
            "(Gibbs sampling in JAGS). By default its priors are uninformative, so the data drive the results.",
            "DMA",
        ),
        (
            "use",
            "Cochrane notes that hierarchical models are a popular way to fit network meta-analysis, often in a "
            "Bayesian framework, and lists complex analyses such as network meta-analysis among the potential "
            "advantages of Bayesian methods.",
            "CH-11 s11.4.3, CH-10 s10.13",
        ),
        (
            "use",
            "Harrer et al. note that it allows network meta-regression, which netmeta does not yet support, and that "
            "frequentist and Bayesian network models should give the same results when the sample is large enough.",
            "DMA",
        ),
        (
            "caution",
            "MCMC output needs checking: burn-in iterations are discarded, and convergence is checked with trace "
            "plots and the Gelman-Rubin potential scale reduction factor, which Harrer et al. say should end below "
            "1.05.",
            "DMA",
        ),
    ]
    + NETWORK_CAUTIONS,
    "method:BIV": [
        (
            "what",
            "Fits the bivariate random-effects model of Reitsma et al. (2005) to each study's 2x2 counts, pooling "
            "transformed sensitivity and false positive rate together.",
            "MADA",
        ),
        (
            "what",
            "Harbord et al. (2007) showed it to be equivalent to the hierarchical summary ROC model of Rutter and "
            "Gatsonis.",
            "MADA",
        ),
        (
            "use",
            "Covariates enter through its formula, for meta-regression. Variance components are estimated by REML "
            "by default.",
            "MADA",
        ),
        (
            "caution",
            "By default, when any cell of any study is zero, 0.5 is added to every cell of every study; "
            'correction.control = "single" limits it to the studies with a zero.',
            "MADA",
        ),
        (
            "caution",
            "Standard errors are given only for the summary parameters. Likelihood ratios and predictive values need "
            "other functions in mada.",
            "MADA",
        ),
    ],
    "method:HSROC": [
        (
            "what",
            "Harbord et al. (2007) showed it to be equivalent to the bivariate model of Reitsma et al., which mada's "
            "reitsma() fits.",
            "MADA",
        ),
    ],
    "method:VAL": [
        (
            "what",
            "valmeta() pools a prediction model's performance across validation studies: the c-statistic or the "
            "total observed:expected (O:E) ratio. By default it pools the c-statistic on the logit scale; the O:E "
            "ratio is modelled with a log or identity link.",
            "VALMETA",
        ),
        (
            "use",
            "It fits random effects by default (REML), with Hartung-Knapp confidence intervals and an approximate "
            "prediction interval. A Bayesian version runs through JAGS.",
            "VALMETA",
        ),
        (
            "use",
            "When a study does not report the c-statistic, the O:E ratio or their standard errors, valmeta() derives "
            "them from other information the study reports, where it can.",
            "VALMETA",
        ),
    ],
    "method:DR": [
        (
            "what",
            "dosresmeta() estimates a dose-response curve from summarised data, allowing for the correlation among a "
            "study's estimates and for heterogeneity across studies.",
            "DOSRES",
        ),
        (
            "what",
            "Each study gives an estimate for each exposure level against a reference level: log relative risks, "
            "mean differences or standardised mean differences. For log relative risks it also needs the cases and "
            "the total (or person-time) at each level, and the design: case-control, incidence rate or cumulative "
            "incidence.",
            "DOSRES",
        ),
        (
            "use",
            "For log relative risks, the covariance among a study's estimates comes from Greenland and Longnecker's "
            "method by default, or Hamling's; mean differences and standardised mean differences have their own "
            "options. The trend is linear or non-linear, as the model formula sets it (for example with a quadratic "
            "term).",
            "DOSRES",
        ),
        (
            "use",
            "Two-stage by default, or one-stage. Common effects, or random effects by ML or REML; the method of "
            "moments is available for the two-stage procedure only.",
            "DOSRES",
        ),
    ],
    "metric:COR": [
        (
            "what",
            "The correlation coefficient as reported, entered with each study's sample size. A t-statistic or p-value can stand in when the correlation is not reported, and the sign of the p-value gives the sign.",
            "MF-escalc",
        ),
        (
            "what",
            'Its sampling variance uses the usual large-sample approximation by default; vtype="H0" computes it assuming the true correlation is zero.',
            "MF-escalc",
        ),
    ],
    "metric:UCOR": [
        (
            "what",
            "The raw correlation corrected for its slight negative bias (Olkin and Pratt 1958). It takes the same inputs as the raw correlation.",
            "MF-escalc",
        ),
        (
            "what",
            'vtype="UB" gives unbiased estimates of its sampling variance.',
            "MF-escalc",
        ),
    ],
    "metric:ZCOR": [
        (
            "what",
            "The correlation after Fisher's r-to-z transformation (Fisher 1921). It takes the same inputs as the raw correlation.",
            "MF-escalc",
        ),
    ],
    "metric:RPB": [
        (
            "what",
            "The point-biserial correlation between a two-group variable and a quantitative one, from the groups' means, standard deviations and sizes. A standardized mean difference, correlation, t-statistic or p-value can stand in for the means and standard deviations.",
            "MF-escalc",
        ),
        (
            "caution",
            'Its sampling variance depends on how the data were sampled: vtype="ST" (stratified) or "CS" (cross-sectional) says which, and the default is treated as stratified.',
            "MF-escalc",
        ),
    ],
    "metric:RBIS": [
        (
            "what",
            "The biserial correlation: from the same inputs as the point-biserial correlation, it estimates the correlation between the quantitative variable and a quantitative variable assumed to underlie the two groups.",
            "MF-escalc",
        ),
        (
            "caution",
            "It assumes the two groups come from dichotomising a quantitative variable, and that the two variables are bivariate normal.",
            "MF-escalc",
        ),
    ],
    "metric:PHI": [
        (
            "what",
            "The phi coefficient, a correlation between two two-category variables, computed from the 2x2 table.",
            "MF-escalc",
        ),
        (
            "caution",
            'Its sampling variance depends on how the data were sampled: vtype="ST" (stratified) or "CS" (cross-sectional) says which, and the default is treated as cross-sectional.',
            "MF-escalc",
        ),
    ],
    "metric:RTET": [
        (
            "what",
            "The tetrachoric correlation: from the 2x2 table, it estimates the correlation between the two quantitative variables assumed to underlie the two dichotomies.",
            "MF-escalc",
        ),
        (
            "caution",
            "It assumes each dichotomy cuts a quantitative variable, and that the two variables follow a bivariate normal distribution.",
            "MF-escalc",
        ),
    ],
    "metric:PCOR": [
        (
            "what",
            "The partial correlation for one regression coefficient, computed from that coefficient's t-statistic, the sample size and the total number of predictors in the model (not counting the intercept). Its sign follows the t-statistic.",
            "MF-escalc",
        ),
    ],
    "metric:ARAW": [
        (
            "what",
            "Cronbach's alpha as reported, entered with the number of items (or parts) of the instrument and the sample size.",
            "MF-escalc",
        ),
    ],
    "metric:AHW": [
        (
            "what",
            "Cronbach's alpha transformed as 1 - (1 - alpha)^(1/3), after Hakstian and Whalen (1976). It takes the same inputs as raw alpha.",
            "MF-escalc",
        ),
        (
            "caution",
            "metafor's version differs slightly from the published transformation, chosen so that the transformed value increases with alpha.",
            "MF-escalc",
        ),
    ],
    "metric:ABT": [
        (
            "what",
            "Cronbach's alpha transformed as -log(1 - alpha), after Bonett (2002). It takes the same inputs as raw alpha.",
            "MF-escalc",
        ),
        (
            "caution",
            "metafor's version differs slightly from the published transformation, chosen so that the transformed value increases with alpha.",
            "MF-escalc",
        ),
    ],
    "metric:SESP": [
        (
            "what",
            "Summary sensitivity and false positive rate, estimated together by the bivariate model. By default reitsma() works on the logit scale for both.",
            "MADA",
        ),
    ],
    "metric:CSTAT": [
        (
            "what",
            "A measure of discrimination: how well a prediction model separates people who have the outcome from those who don't. It typically ranges from 0.5 (no discrimination) to 1 (perfect discrimination).",
            "VALMETA",
        ),
        (
            "what",
            "valmeta() pools it on the logit scale by default. When a study does not report it or its standard error, valmeta() derives them from other reported information.",
            "VALMETA",
        ),
    ],
    "metric:OE": [
        (
            "what",
            "Total observed events divided by total expected events: a rough indication of a prediction model's overall calibration.",
            "VALMETA",
        ),
        (
            "what",
            "When a study does not report it or its standard error, valmeta() derives them from other reported information. In a frequentist meta-analysis it models the within-study variation as normal (log or identity scale) or Poisson.",
            "VALMETA",
        ),
    ],
    "metric:DR_RR": [
        (
            "what",
            "Models each study's log relative risks, typically each against the study's reference exposure level, as a function of dose.",
            "DOSRES",
        ),
        (
            "what",
            "Rebuilding the covariance among a study's log relative risks needs the cases and the total (or person-time) at each level and the study design. Greenland and Longnecker's method is the default; Hamling's is the alternative.",
            "DOSRES",
        ),
    ],
    "metric:DR_MD": [
        (
            "what",
            "Models each study's mean differences, typically each against the study's reference exposure level, as a function of dose. Rebuilding their covariance (covariance = \"md\") needs the standard deviations.",
            "DOSRES",
        ),
    ],
    "metric:DR_SMD": [
        (
            "what",
            "Models each study's standardized mean differences, typically each against the study's reference exposure level, as a function of dose. Rebuilding their covariance (covariance = \"smd\") needs the standard deviations, and method.smd chooses Cohen's, Hedges' or Glass's version.",
            "DOSRES",
        ),
    ],
    "metric:N_OR": [
        NETWORK_MEASURE,
        (
            "caution",
            "By default, pairwise() adds 0.5 to every cell of a study with a zero cell, and leaves out studies with no events, or only events, in both arms unless allstudies = TRUE.",
            "META-pw",
        ),
    ],
    "metric:N_RR": [
        NETWORK_MEASURE,
        (
            "caution",
            "By default, pairwise() adds 0.5 to the event counts of a study with a zero cell, and leaves out studies with no events, or only events, in both arms unless allstudies = TRUE.",
            "META-pw",
        ),
    ],
    "metric:N_RD": [
        NETWORK_MEASURE,
        (
            "caution",
            "By default, pairwise() adds 0.5 to the cells of a study with a zero cell only to compute its standard error.",
            "META-pw",
        ),
    ],
    "metric:N_ASD": [
        NETWORK_MEASURE,
    ],
    "metric:N_MD": [
        NETWORK_MEASURE,
    ],
    "metric:N_SMD": [
        NETWORK_MEASURE,
        (
            "caution",
            "pairwise() computes Cohen's d rather than Hedges' g, because Hedges' g is not consistent within multi-arm studies.",
            "META-pw",
        ),
    ],
    "metric:N_ROM": [
        NETWORK_MEASURE,
    ],
    "metric:N_IRR": [
        NETWORK_MEASURE,
        (
            "caution",
            "By default, pairwise() adds 0.5 to the counts of a study with a zero count.",
            "META-pw",
        ),
    ],
    "metric:N_IRD": [
        NETWORK_MEASURE,
        (
            "caution",
            "By default, pairwise() adds 0.5 to the counts of a study with a zero count only to compute its standard error.",
            "META-pw",
        ),
    ],
    "metric:N_HR": [
        NETWORK_MEASURE,
        (
            "what",
            "Each comparison enters as its log hazard ratio with its standard error.",
            "NM",
        ),
    ],
    "metric:EX_OR": [ADJUSTED_MEASURE],
    "metric:EX_RR": [ADJUSTED_MEASURE],
    "metric:EX_HR": [
        ADJUSTED_MEASURE,
        (
            "what",
            "Cochrane notes that log hazard ratios from Cox proportional hazards models, with their standard errors, "
            "can be combined this way.",
            "CH-10 s10.9",
        ),
    ],
    "framework:interventional-effect-of-an-intervention": [
        (
            "what",
            "Compares the effects of interventions. When groups are compared, its effect measures are ratio measures, where 1 means no difference, or difference measures, where 0 does.",
            "CH-6 s6.1.2",
        ),
        (
            "what",
            "Its one-group branches instead summarise a single group, for example as a proportion, a mean or a rate.",
            "MF-escalc",
        ),
    ],
    "group:one-group-single-arm": [
        (
            "what",
            "Each study gives a result for one group only, such as a proportion, a mean or a rate, so there is no comparison between groups within a study.",
            "MF-escalc",
        ),
    ],
    "group:two-groups-pairwise": [
        (
            "what",
            "Each study compares two intervention groups, and each participant receives only one of the interventions, as in a parallel-group trial.",
            "CH-23 s23.2.1",
        ),
    ],
    "group:change-or-matched-pairs-same-people-measured-twice": [
        (
            "what",
            "Each study measures change within one group, typically before and after a treatment, or compares matched pairs.",
            "MF-escalc",
        ),
        (
            "what",
            "In a crossover trial, each participant receives a sequence of interventions and so acts as their own control.",
            "CH-23 s23.2.1",
        ),
        (
            "use",
            "For a two-period, two-intervention crossover trial with continuous data, Cochrane gives a paired t-test as an appropriate analysis, provided carry-over and period effects are not a problem.",
            "CH-23 s23.2.5",
        ),
        (
            "caution",
            "Analysing a crossover trial as if its groups were separate ignores the pairing, which is a unit-of-analysis error.",
            "CH-23 s23.2.6",
        ),
        (
            "caution",
            "In a crossover trial the main problem is carry-over: an intervention's effect lasting into the next period.",
            "CH-23 s23.2.3",
        ),
    ],
    "group:multiple-groups-network": [
        (
            "what",
            "Studies that link three or more interventions through direct comparisons form a network. Network meta-analysis combines the direct and indirect estimates in one analysis.",
            "CH-11 s11.1",
        ),
        (
            "what",
            "An indirect estimate of B against C comes from the direct estimates of B against A and of A against C.",
            "CH-11 s11.2.1",
        ),
        (
            "use",
            "Cochrane reports that empirical studies suggest it gives more precise estimates of intervention effects, and notes that it lets the interventions be ranked for an outcome.",
            "CH-11 s11.1.2",
        ),
        NETWORK_CAUTIONS[0],
    ],
    "datatype:arm-level-summary-data": [
        (
            "what",
            "The summary numbers each study reports, from which escalc() computes the effect measure and its sampling variance.",
            "MF-escalc",
        ),
        (
            "what",
            "When groups are compared, for a binary outcome these are the numbers with and without the event in each group; for a continuous outcome, each group's mean, standard deviation and number measured.",
            "CH-6 s6.4.2, s6.5.2",
        ),
    ],
    "datatype:precomputed-estimate": [
        (
            "what",
            "One effect estimate per study with its standard error, already computed, pooled by the generic inverse-variance method. Ratio measures are entered as natural logarithms.",
            "CH-10 s10.3.3",
        ),
    ],
    "datatype:individual-participant-data": [
        (
            "what",
            "The original data on each participant in each study, which can be checked and analysed centrally.",
            "CH-26 s26.1.1",
        ),
        (
            "use",
            "Cochrane lists advantages over published summaries, among them including unpublished studies, analysing all important outcomes, and more power to study how participant characteristics change the effect of an intervention.",
            "CH-26 s26.1.1",
        ),
        (
            "caution",
            "Cochrane notes that IPD reviews often take longer and need more resources than reviews of published summary data.",
            "CH-26 s26.1.2",
        ),
    ],
    "datatype:observed-minus-expected-and-variance": [
        (
            "what",
            "For each study, observed minus expected events (O - E) and its variance (V), from participant data or study reports.",
            "CH-10 s10.9",
        ),
    ],
    "datatype:contrast-level-estimates": [
        (
            "what",
            "One estimate with its standard error for each pair of treatments compared in a study; a multi-arm study gives every pair.",
            "NM",
        ),
    ],
    "outcome:binary": [
        (
            "what",
            "Each participant's outcome is one of two categories, such as event or no event.",
            "CH-6 s6.1.1",
        ),
    ],
    "outcome:continuous": [
        (
            "what",
            "Each participant's outcome is a measurement of a numerical quantity.",
            "CH-6 s6.1.1",
        ),
    ],
    "outcome:count-person-time": [
        (
            "what",
            "Counts, or rates, of the events each participant experiences.",
            "CH-6 s6.1.1",
        ),
    ],
    "outcome:time-to-event": [
        (
            "what",
            "The time until an event occurs, typically survival.",
            "CH-6 s6.1.1",
        ),
        (
            "use",
            "Such data are not easily summarised group by group, so Cochrane notes it is usually more convenient to extract hazard ratios.",
            "CH-6 s6.3",
        ),
    ],
    "outcome:ordinal": [
        (
            "what",
            "Each participant's outcome is one of several ordered categories; measurement scales count as ordinal data.",
            "CH-6 s6.1.1",
        ),
    ],
    "framework:diagnostic-test-accuracy": [
        (
            "what",
            "Pools a test's sensitivity and false positive rate, from each study's counts of true positives, false negatives, false positives and true negatives.",
            "MADA",
        ),
    ],
    "framework:prognosis": [
        (
            "what",
            "Includes pooling how well a prediction model performs across studies that validate it.",
            "VALMETA",
        ),
    ],
    "framework:association": [
        (
            "what",
            "Pools how strongly two variables are related, for example as a correlation, or how an outcome changes with the dose of an exposure.",
            "MF-escalc, DOSRES",
        ),
    ],
    "framework:measurement-reliability": [
        (
            "what",
            "Pools reliability estimates, such as Cronbach's alpha, across studies (a reliability generalization meta-analysis).",
            "MF-escalc",
        ),
    ],
    "group:one-index-test-against-a-reference-standard": [
        (
            "what",
            "Each study gives one 2x2 table for the test: true positives, false negatives, false positives and true negatives.",
            "MADA",
        ),
    ],
    "group:prediction-model-performance-external-validation": [
        (
            "what",
            "Each study validates the same prediction model and reports its performance, such as the c-statistic or the observed:expected ratio.",
            "VALMETA",
        ),
    ],
    "group:two-variables-in-one-group-correlation": [
        (
            "what",
            "Each study reports how two variables measured in one group are related: the correlation with its sample size, or the data it is computed from, such as group means and standard deviations or a 2x2 table.",
            "MF-escalc",
        ),
    ],
    "group:exposure-and-outcome-observational-studies": [
        ADJUSTED_MEASURE,
    ],
    "group:dose-response": [
        (
            "what",
            "Each study gives estimates for several exposure levels against a reference level, and the analysis estimates a dose-response curve across studies.",
            "DOSRES",
        ),
    ],
    "group:one-group": [
        (
            "what",
            "Each study reports Cronbach's alpha for the instrument, with the number of items and the sample size.",
            "MF-escalc",
        ),
    ],
    "datatype:2x2-table-per-study": [
        (
            "what",
            "Each study's counts of true positives, false negatives, false positives and true negatives.",
            "MADA",
        ),
    ],
    "datatype:estimates-at-several-dose-levels-per-study": [
        (
            "what",
            "For each exposure level, the estimate against the reference level. For log relative risks: its variance, standard error or confidence interval, and the cases and the total (or person-time) at each level. For mean differences and standardized mean differences: the standard deviation and the number at each level.",
            "DOSRES",
        ),
    ],
    "outcome:binary-classification": [
        (
            "what",
            "Each person's test result is positive or negative, so each study's results form a 2x2 table of true positives, false negatives, false positives and true negatives.",
            "MADA",
        ),
    ],
    "outcome:discrimination": [
        (
            "what",
            "How well a prediction model distinguishes people with the outcome from people without it, measured by the c-statistic.",
            "VALMETA",
        ),
    ],
    "outcome:calibration": [
        (
            "what",
            "Here it is summarised by the total observed:expected ratio, which metamisc presents as a rough guide to how well the model is calibrated overall.",
            "VALMETA",
        ),
    ],
    "outcome:two-continuous-variables": [
        (
            "what",
            "Both variables are quantitative. A correlation coefficient shows how strongly, and in which direction, they are linearly related.",
            "MF-escalc",
        ),
    ],
    "outcome:one-continuous-one-binary-variable": [
        (
            "what",
            "One variable is quantitative and the other has two categories, as with the point-biserial and biserial correlations.",
            "MF-escalc",
        ),
    ],
    "outcome:two-binary-variables": [
        (
            "what",
            "Both variables have two categories, so each study's data form a 2x2 table, as with the phi and tetrachoric correlations.",
            "MF-escalc",
        ),
    ],
    "outcome:binary-or-time-to-event": [
        (
            "what",
            "The outcome is summarised as log relative risks from case-control, incidence-rate or cumulative incidence data.",
            "DOSRES",
        ),
    ],
    "outcome:internal-consistency": [
        (
            "what",
            "Here the measure is Cronbach's alpha (raw or transformed), which metafor pools as a reliability estimate.",
            "MF-escalc",
        ),
    ],
}


# --------------------------------------------------------------------------
# Plain words for Pathfinder's options (#92, design B): for each framework,
# group structure, datatype and outcome, a name a newcomer understands and a
# concrete example. The example illustrates the source cited; where the only
# source hasn't been read, there is a plain name and no example. Technical
# names stay on the cards and behind Pathfinder's "technical names" switch.
PLAIN: dict[str, tuple[str, str, str]] = {
    # frameworks
    "framework:interventional-effect-of-an-intervention": (
        "What are the effects of a treatment or other intervention?",
        "For example, does a drug lower blood pressure compared with a placebo, or how several drugs compare with each other?",
        "CH-6 s6.1.2, CH-11 s11.1",
    ),
    "framework:diagnostic-test-accuracy": (
        "How accurate is a test?",
        "For example, how many infections a rapid test finds, and how many people it wrongly flags.",
        "MADA",
    ),
    "framework:prognosis": (
        "How well can we predict an outcome?",
        "For example, how well a risk score predicts heart attacks in patients it wasn't built on.",
        "VALMETA",
    ),
    "framework:association": (
        "How are two things related?",
        "For example, how strongly weight goes with blood pressure, or how risk changes with the dose of an exposure.",
        "MF-escalc, DOSRES",
    ),
    "framework:measurement-reliability": (
        "How reliable is a measurement?",
        "For example, Cronbach's alpha for a questionnaire, across the studies that used it.",
        "MF-escalc",
    ),
    # group structures
    "group:one-group-single-arm": (
        "One group, with nothing to compare it with",
        "For example, the proportion of patients who recover after a treatment, with no control group.",
        "MF-escalc",
    ),
    "group:two-groups-pairwise": (
        "Two groups compared",
        "For example, a trial of a drug against a placebo, each patient in one group only.",
        "CH-23 s23.2.1",
    ),
    "group:change-or-matched-pairs-same-people-measured-twice": (
        "The same people measured twice, or matched pairs",
        "For example, blood pressure before and after treatment in the same patients, or a crossover trial.",
        "MF-escalc, CH-23 s23.2.1",
    ),
    "group:multiple-groups-network": (
        "Three or more treatments compared",
        "For example, several drugs, with each trial comparing two or three of them.",
        "CH-11 s11.1",
    ),
    "group:one-index-test-against-a-reference-standard": (
        "One test, checked against a reference standard",
        "Each study reports how many people the test got right and wrong, as a 2x2 table.",
        "MADA",
    ),
    "group:two-or-more-index-tests-compared": ("Two or more tests compared", "", "DTA-HB"),
    "group:prognostic-factor-does-the-factor-predict-the-outcome": (
        "Does one factor predict the outcome?",
        "",
        "RILEY",
    ),
    "group:prediction-model-performance-external-validation": (
        "How well a prediction model works in new data",
        "For example, a published risk score tested in other hospitals.",
        "VALMETA",
    ),
    "group:two-variables-in-one-group-correlation": (
        "Two things measured in the same people",
        "For example, age and bone density in one group of patients.",
        "MF-escalc",
    ),
    "group:exposure-and-outcome-observational-studies": (
        "An exposure and an outcome, from observational studies",
        "For example, smoking and lung cancer, with each study reporting an odds ratio and its standard error.",
        "CH-10 s10.3.3",
    ),
    "group:dose-response": (
        "How the outcome changes with the dose",
        "For example, the risk of a disease at several levels of alcohol intake.",
        "DOSRES",
    ),
    "group:one-group": (
        "One group taking the measurement",
        "For example, patients completing a questionnaire, with its Cronbach's alpha reported.",
        "MF-escalc",
    ),
    # datatypes
    "datatype:arm-level-summary-data": (
        "Counts or summaries for each group",
        "For example, 12 of 100 patients had a stroke with the drug and 20 of 100 with placebo; or the mean, "
        "standard deviation and number in each group.",
        "CH-6 s6.4.2, s6.5.2",
    ),
    "datatype:precomputed-estimate": (
        "One effect estimate per study",
        "For example, an odds ratio with its 95% confidence interval from each paper's own analysis.",
        "CH-10 s10.3.3",
    ),
    "datatype:individual-participant-data": (
        "Data on every participant",
        "The study datasets themselves, one row per participant.",
        "CH-26 s26.1.1",
    ),
    "datatype:observed-minus-expected-and-variance": (
        "Observed minus expected events, and their variance",
        "For example, log-rank statistics from survival analyses.",
        "CH-10 s10.9",
    ),
    "datatype:contrast-level-estimates": (
        "One estimate for each pair of treatments compared",
        "For example, a mean difference with its standard error for each pair of arms in a three-arm trial.",
        "NM",
    ),
    "datatype:2x2-table-per-study": (
        "A 2x2 table of test results from each study",
        "True positives, false negatives, false positives and true negatives.",
        "MADA",
    ),
    "datatype:2x2-table-per-study-and-test": ("A 2x2 table for each test in each study", "", "DTA-HB"),
    "datatype:estimates-at-several-dose-levels-per-study": (
        "Results at several dose levels in each study",
        "For example, relative risks for low, medium and high intake, each against none.",
        "DOSRES",
    ),
    # outcome types
    "outcome:binary": (
        "Yes or no",
        "For example, whether each patient died, had a stroke or recovered.",
        "CH-6 s6.1.1",
    ),
    "outcome:continuous": ("A measured value", "For example, blood pressure or weight.", "CH-6 s6.1.1"),
    "outcome:count-person-time": (
        "Counts or rates of events",
        "For example, the number of asthma attacks per person-year.",
        "CH-6 s6.1.1",
    ),
    "outcome:time-to-event": ("Time until an event", "For example, survival time after diagnosis.", "CH-6 s6.1.1"),
    "outcome:ordinal": ("Ordered categories", "For example, mild, moderate or severe.", "CH-6 s6.1.1"),
    "outcome:binary-classification": (
        "Test positive or negative",
        "Each person's test result, positive or negative.",
        "MADA",
    ),
    "outcome:any-outcome": ("Any kind of outcome", "", "RILEY"),
    "outcome:discrimination": (
        "Telling apart who will have the outcome",
        "Measured by the c-statistic.",
        "VALMETA",
    ),
    "outcome:calibration": (
        "Predicted risk against what happened",
        "Summarised by the total observed:expected ratio.",
        "VALMETA",
    ),
    "outcome:two-continuous-variables": ("Two measured values", "For example, age and bone density.", "MF-escalc"),
    "outcome:one-continuous-one-binary-variable": (
        "One measured value and one yes or no",
        "For example, a test score in two groups of people.",
        "MF-escalc",
    ),
    "outcome:two-binary-variables": (
        "Two yes or no variables",
        "For example, exposed or not and ill or not, as a 2x2 table.",
        "MF-escalc",
    ),
    "outcome:binary-or-time-to-event": (
        "Events, or time until an event",
        "Summarised as relative risks at each dose level.",
        "DOSRES",
    ),
    "outcome:internal-consistency": ("How consistent a measurement is", "Summarised by Cronbach's alpha.", "MF-escalc"),
}


# --------------------------------------------------------------------------
# The glossary (issue #6): one card per term, linked from every card whose
# teaching text or notes use it. Each entry: (term, definition in our own words,
# source, phrases that mark the term in a card's text). A phrase matches at the
# start of a word, ignoring case, so "subgroup" also finds "subgroups".
class Term(TypedDict):
    term: str
    text: str
    src: str
    match: list[str]


GLOSSARY: list[Term] = [
    Term(
        term="Effect measure",
        text="A statistic that compares outcome data between two groups, either as a ratio (where 1 means no "
        "difference) or as a difference (where 0 does).",
        src="CH-6 s6.1.2",
        match=["effect measure"],
    ),
    Term(
        term="Heterogeneity",
        text="Variation in the true effects across studies, seen as study results that differ more than chance "
        "alone would explain.",
        src="CH-10 s10.10.1",
        match=["heterogeneity"],
    ),
    Term(
        term="Between-study variance (tau squared)",
        text="In a random-effects model, the variance of the distribution of true effects: how widely they spread "
        "around their average.",
        src="CH-10 s10.10.4",
        match=["between-study variance", "tau squared", "tau²"],
    ),
    Term(
        term="Prediction interval",
        text="A range for the effect in a new study like those in a random-effects meta-analysis, reflecting how "
        "widely the true effects spread.",
        src="CH-10 s10.10.4.3",
        match=["prediction interval"],
    ),
    Term(
        term="Continuity correction",
        text="A small number, usually 0.5, added to the cells of a 2x2 table with a zero count so that an estimate "
        "can be computed. It tends to pull estimates towards no difference and to overstate their variances.",
        src="CH-10 s10.4.4.1",
        match=["continuity correction", "zero-cell correction"],
    ),
    Term(
        term="Subgroup analysis",
        text="Splitting the data into subgroups, usually to compare the effect between them.",
        src="CH-10 s10.11.2",
        match=["subgroup"],
    ),
    Term(
        term="Meta-regression",
        text="An extension of subgroup analysis that relates the effect to study characteristics, continuous as well "
        "as categorical. Cochrane advises against it, in general, with fewer than ten studies.",
        src="CH-10 s10.11.4",
        match=["meta-regression"],
    ),
    Term(
        term="Sensitivity analysis",
        text="Repeating the main analysis with other reasonable choices in place of arbitrary or unclear ones, to see "
        "whether the findings hold. Unlike a subgroup analysis, it does not estimate an effect for the studies it "
        "sets aside.",
        src="CH-10 s10.14",
        match=["sensitivity analys"],
    ),
    Term(
        term="Credible interval",
        text="In a Bayesian analysis, a range that holds the effect with the stated probability.",
        src="CH-10 s10.13",
        match=["credible interval"],
    ),
    Term(
        term="Indirect comparison",
        text="An estimate of how two interventions compare, built from studies that compare each of them with a "
        "common third one.",
        src="CH-11 s11.2.1",
        match=["indirect comparison", "indirect estimate"],
    ),
    Term(
        term="Transitivity",
        text="The assumption behind indirect comparisons: the studies of the different comparisons are similar, on "
        "average, in everything important apart from the interventions compared.",
        src="CH-11 s11.2.2",
        match=["transitivity"],
    ),
    Term(
        term="Incoherence (inconsistency)",
        text="Disagreement between the direct and indirect evidence on the same comparison; coherence is its "
        "absence. Cochrane also calls it inconsistency, a word it uses too for heterogeneity in a pairwise "
        "meta-analysis.",
        src="CH-11 s11.2.3.2, s11.4.4.1",
        # network senses only: "inconsistency" alone also means pairwise heterogeneity (Cochrane 11.2.3.2)
        match=["incoheren", "inconsistency left between", "inconsistency effects"],
    ),
    Term(
        term="Unit-of-analysis error",
        text="Analysing more observations than the units that were randomized, for example by treating the two "
        "periods of a crossover trial as separate groups.",
        src="CH-6 s6.2.1, CH-23 s23.2.6",
        match=["unit-of-analysis"],
    ),
    Term(
        term="Carry-over",
        text="In a crossover trial, an intervention's effect lasting into the next period.",
        src="CH-23 s23.2.3",
        match=["carry-over"],
    ),
]


def _term_card(t: Term) -> Card:
    # added flags map entries that are not in taxonomy v11; the glossary is not part of the map, so it stays False
    return Card(
        id=card_id("term", t["term"]),
        tier="term",
        value=t["term"],
        title=t["term"],
        added=False,
        new=False,
        verified=True,
        facts=[],
        notes=[],
        teach=[TeachLine(kind="what", text=t["text"], src=t["src"])],
        rules=[],
        terms=[],
        plain=None,
        src=t["src"],
    )


def _terms_used(c: Card) -> list[str]:
    """The glossary cards for the terms a card's teaching text or notes use, in glossary order."""
    text = " ".join([line["text"] for line in c["teach"]] + [n["text"] for n in c["notes"]])
    return [
        card_id("term", t["term"])
        for t in GLOSSARY
        if any(re.search(r"(?<![\w-])" + re.escape(m), text, re.IGNORECASE) for m in t["match"])
    ]


def cards(paths: Sequence[Pathway]) -> list[Card]:
    """A card for every value of every tier that a pathway uses, every method and metric, every rule, and every glossary term."""
    out: list[Card] = []
    for tier in NODE_TIERS:
        values = _uniq(str(p[tier]) for p in paths)  # type: ignore[literal-required]
        if tier == "method":
            out += [_method_card(c, paths) for c in METHODS]
        elif tier == "metric":
            out += [_metric_card(c) for c in METRICS]
        elif tier == "model":
            out += [_model_card(v) for v in values]
        else:
            out += [_branch_card(tier, v) for v in values]
    out += [_rule_card(rid, text, src) for rid, text, _, src in RULES]
    for c in out:
        c["teach"] = [TeachLine(kind=k, text=t, src=src) for k, t, src in TEACH.get(c["id"], [])]
        c["src"] = _join_src([c["src"]] + [line["src"] for line in c["teach"]])
        c["terms"] = _terms_used(c)
        if c["id"] in PLAIN:
            title, example, src = PLAIN[c["id"]]
            c["plain"] = Plain(title=title, example=example, src=src)
            c["src"] = _join_src([c["src"], src])
        if c["tier"] == "rule":
            c["plain"] = Plain(title=RULE_PLAIN[c["value"]], example="", src=c["src"])
    for t in GLOSSARY:
        tc = _term_card(t)
        tc["terms"] = [x for x in _terms_used(tc) if x != tc["id"]]  # a definition links the other terms it uses
        out.append(tc)
    return out


def write_cards(paths: Sequence[Pathway]) -> None:
    """One card per line, so a change to one shows as a one-line diff."""
    CARDS.write_text("[\n%s\n]\n" % ",\n".join(json.dumps(c, ensure_ascii=False) for c in cards(paths)))


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
        ("not in v11", sum(p["added"] for p in paths)),
        ("of those, new (not yet accepted)", sum(p["new"] for p in paths)),
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
        branches=[{**b, "new": branch_new(b)} for b in BRANCHES],
        rules=RULES,
        cross_cutting=CROSS,
        notes=notes(),
        open_items=OPEN,
        unconfirmed=[{"method": me, "metric": mt, "why": why} for (me, mt), why in UNCONFIRMED.items()],
        metrics={k: {**v, "new": metric_new(k)} for k, v in METRICS.items()},
        methods={k: {**v, "new": method_new(k)} for k, v in METHODS.items()},
        pathways=paths,
    )
    (HERE / "map.json").write_text(json.dumps(data, indent=1, default=_json_default))
    write_why_not(paths)
    write_cards(paths)
    print(stats)
    by: dict[tuple[str, str], list[int]] = {}
    for p in paths:
        by.setdefault((p["framework"], p["group"]), [0, 0, 0])
        by[(p["framework"], p["group"])][0] += 1
        by[(p["framework"], p["group"])][1] += p["new"]
        by[(p["framework"], p["group"])][2] += not p["verified"]
    for k, v in by.items():
        print("%4d  new %3d  check %3d  %s / %s" % (v[0], v[1], v[2], k[0][:20], k[1]))


if __name__ == "__main__":
    main()

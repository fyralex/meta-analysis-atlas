"""Tests of the map's data and its generated pathways (spec/build_map.py)."""

from __future__ import annotations

import json
import re

import build_map as bm
import pytest

KEY_RE = re.compile(r"^[A-Za-z][A-Za-z0-9-]*$")
SECTION_RE = re.compile(r"^s\d")


def source_keys(field: str) -> list[str]:
    """The source keys a rule or section cites, e.g. "CH-11 s11.2.2, s11.4.4, NM" gives CH-11 and NM.

    A token that starts with "s" and a digit is a section of the key before it.
    """
    keys = []
    for part in field.split(","):
        words = part.split()
        if words and not SECTION_RE.match(words[0]):
            keys.append(words[0])
            words = words[1:]
        # whatever follows a key in the same part must be its sections; anything else is read as a key, so it is checked
        keys += [w for w in words if not SECTION_RE.match(w)]
    return keys


def test_source_keys_reads_sections_and_keys() -> None:
    assert source_keys("CH-11 s11.2.2, s11.4.4, NM") == ["CH-11", "NM"]
    assert source_keys("MF-cumul, MF-l1o") == ["MF-cumul", "MF-l1o"]
    assert source_keys("CH-10 s10.11, s10.14 CH-99") == ["CH-10", "CH-99"]
    assert source_keys("CH-23 s23.1.4-23.1.6") == ["CH-23"]


# --- the lock file -----------------------------------------------------------


def test_generated_pathways_match_the_lock_file() -> None:
    """Any change to which pathways exist, or to their flags, must show up as a diff of the lock file.

    After changing the map, run `python3 spec/build_map.py --lock` and explain each difference in the PR.
    """
    locked = json.loads(bm.LOCK.read_text())
    assert locked == bm.lock_rows(bm.pathways())


def test_pathways_are_unique() -> None:
    keys = [bm.pathway_key(p) for p in bm.pathways()]
    assert len(keys) == len(set(keys))


# --- sources -------------------------------------------------------------------


def test_every_metric_cites_a_known_source() -> None:
    assert {k: v["src"] for k, v in bm.METRICS.items() if v["src"] not in bm.SOURCES} == {}


def test_every_method_cites_known_sources() -> None:
    assert {k: v["src"] for k, v in bm.METHODS.items() if not v["src"] or set(v["src"]) - set(bm.SOURCES)} == {}


@pytest.mark.parametrize("rule", bm.RULES, ids=[r[0] for r in bm.RULES])
def test_every_rule_cites_known_sources(rule: tuple[str, str, str, str]) -> None:
    keys = source_keys(rule[3])
    assert keys, "rule cites no source"
    assert [k for k in keys if k not in bm.SOURCES] == []


@pytest.mark.parametrize("section", bm.CROSS, ids=[c[0] for c in bm.CROSS])
def test_every_cross_cutting_section_cites_known_sources(section: tuple[str, str, str]) -> None:
    keys = source_keys(section[2])
    assert keys
    assert [k for k in keys if k not in bm.SOURCES] == []


@pytest.mark.parametrize(
    "branch", bm.BRANCHES, ids=[" / ".join((b["fw"][:2], b["group"], b["datatype"], b["outcome"])) for b in bm.BRANCHES]
)
def test_every_branch_cites_known_sources(branch: bm.Branch) -> None:
    assert branch["src"], "branch cites no source"
    assert [k for k in branch["src"] if k not in bm.SOURCES] == []


@pytest.mark.parametrize("note", bm.notes(), ids=[n["value"] for n in bm.notes()])
def test_every_note_cites_known_sources(note: bm.Note) -> None:
    keys = source_keys(note["src"])
    assert keys, "note cites no source"
    assert [k for k in keys if k not in bm.SOURCES] == []


def test_every_note_is_listed() -> None:
    assert len(bm.notes()) == len(bm.FRAMEWORK_NOTES) + len(bm.GROUP_NOTES) + len(bm.DATATYPE_NOTES) == 8


def test_source_keys_are_well_formed_and_link_out() -> None:
    for key, (label, url) in bm.SOURCES.items():
        assert KEY_RE.match(key), key
        assert label.strip(), key
        assert url.startswith("https://"), key


# --- metrics -------------------------------------------------------------------

ESCALC_RE = re.compile(r'^escalc\(measure="[A-Z0-9]+"(, correct=FALSE)?\)$')


def test_every_metric_has_an_exact_call() -> None:
    assert [k for k, v in bm.METRICS.items() if not v["call"].strip()] == []


def test_escalc_calls_are_well_formed() -> None:
    bad = {
        k: v["call"] for k, v in bm.METRICS.items() if v["call"].startswith("escalc") and not ESCALC_RE.match(v["call"])
    }
    assert bad == {}


def test_hedges_g_and_cohens_d_map_to_their_escalc_calls() -> None:
    """Hedges' g is escalc's default SMD; Cohen's d is the same measure without the small-sample correction."""
    assert bm.METRICS["SMD_G"]["call"] == 'escalc(measure="SMD")'
    assert bm.METRICS["SMD_D"]["call"] == 'escalc(measure="SMD", correct=FALSE)'


def test_hazard_ratio_is_a_precomputed_estimate() -> None:
    """escalc has no hazard ratio measure: a log HR is entered with its SE."""
    assert not bm.METRICS["HR"]["call"].startswith("escalc")


@pytest.mark.parametrize("kind", ["METRICS", "METHODS"])
def test_no_two_entries_share_a_label(kind: str) -> None:
    """Each method and metric is named differently, so no two look the same in a list (issue #37)."""
    entries: dict[str, bm.Metric] | dict[str, bm.Method] = getattr(bm, kind)
    labels = [e["label"] for e in entries.values()]
    assert sorted(label for label in set(labels) if labels.count(label) > 1) == []


def test_every_metric_a_branch_offers_exists() -> None:
    assert [(b["outcome"], c) for b in bm.BRANCHES for c in b["metrics"] if c not in bm.METRICS] == []


def test_metrics_reserved_for_one_method_name_real_methods() -> None:
    assert {k: v["only"] for k, v in bm.METRICS.items() if v["only"] and v["only"] - set(bm.METHODS)} == {}


# --- the comparison with taxonomy v11 ------------------------------------------


def test_v11_counts_add_up() -> None:
    assert len(bm.V11_REMOVED) == 26
    assert bm.V11_KEPT + len(bm.V11_REMOVED) == bm.V11_SUMMARY_PATHWAYS == 226


def test_v11_removed_pathways_are_absent_from_the_map() -> None:
    present = {bm.pathway_key(p) for p in bm.pathways()}
    still_there = [
        c
        for c in bm.V11_REMOVED
        if (bm.F1, c["group"], c["datatype"], c["outcome"], c["model"], c["method"], c["metric"]) in present
    ]
    assert still_there == []


def test_v11_removed_pathways_each_have_a_reason() -> None:
    for c in bm.V11_REMOVED:
        assert re.match(r"^R\d+: ", c["reason"]), c


def test_network_count_data_offers_rate_ratio_and_difference() -> None:
    """netmeta's examples run both through pairwise() with event and person-time data (issue #29)."""
    for code in ("N_IRR", "N_IRD"):
        assert bm.METRICS[code]["verified"], code
        assert bm.METRICS[code]["src"] == "NM", code
    v11_ird = {
        (bm.F1, bm.G4, dt, bm.COUNT, bm.RANDOM, me, "N_IRD")
        for dt in (bm.ARM, bm.CONTRAST)
        for me in ("NM_MV", "NM_BAYES")
    }
    by_key = {bm.pathway_key(p): p for p in bm.pathways()}
    assert v11_ird <= set(by_key)
    assert [k for k in v11_ird if by_key[k]["added"]] == []


def test_the_network_smd_is_cohens_d() -> None:
    """meta's pairwise() computes Cohen's d for netmeta, as Hedges' g isn't consistent in multi-arm studies (#31)."""
    assert "Cohen's d" in bm.METRICS["N_SMD"]["label"]
    assert bm.METRICS["N_SMD"]["src"] == "META-pw"
    assert "R31" in {r[0] for r in bm.RULES}
    by_method: dict[str, set[str]] = {}
    for p in bm.pathways():
        if p["metric"] == "N_SMD":
            by_method.setdefault(p["method"], set()).add(p["status"])
    assert by_method == {"NM_GT": {"planned"}, "NM_MV": {"to_check"}, "NM_BAYES": {"to_check"}}


def test_unconfirmed_pairs_name_real_methods_and_metrics() -> None:
    assert bm.UNCONFIRMED
    for method, metric in bm.UNCONFIRMED:
        assert method in bm.METHODS and metric in bm.METRICS
        allowed = bm.METHODS[method]["metrics"]
        assert allowed is None or metric in allowed
    paired = [p for p in bm.pathways() if (p["method"], p["metric"]) in bm.UNCONFIRMED]
    assert {(p["method"], p["metric"]) for p in paired} == set(bm.UNCONFIRMED), "a pair generates no pathway"
    assert {p["status"] for p in paired} == {"to_check"}


def test_v11_removed_reasons_cite_existing_rules() -> None:
    rule_ids = {r[0] for r in bm.RULES}
    cited = {c["reason"].split(":")[0] for c in bm.V11_REMOVED if re.match(r"^R\d+:", c["reason"])}
    assert cited and cited <= rule_ids


def test_v11_removed_names_metrics_the_map_does_not_offer_or_methods_that_exclude_them() -> None:
    """Each removed metric is either not in the map at all, or excluded from that method."""
    for c in bm.V11_REMOVED:
        method = bm.METHODS[c["method"]]
        assert c["metric"] not in bm.METRICS or (
            method["metrics"] is not None and c["metric"] not in method["metrics"]
        ), c


def test_v11_merged_pathways_are_in_the_map() -> None:
    present = {bm.pathway_key(p) for p in bm.pathways()}
    assert len(bm.V11_MERGED_INTO) == 4
    assert [k for k in bm.V11_MERGED_INTO if k not in present] == []


def test_v11_scope_holds_the_kept_and_merged_pathways() -> None:
    """The map's interventional summary-data pathways not marked new are v11's kept ones plus the merged SMDs."""
    in_scope = [p for p in bm.pathways() if p["framework"] == bm.F1 and not p["added"] and p["datatype"] != bm.IPD]
    assert len(in_scope) == bm.V11_KEPT + len(bm.V11_MERGED_INTO)


# --- status and milestone --------------------------------------------------------


def test_every_pathway_has_a_known_status_and_milestone() -> None:
    for p in bm.pathways():
        assert p["status"] in bm.STATUSES, p
        assert p["milestone"] in (*bm.ROADMAP, bm.LATER), p


def test_nothing_is_runnable_in_v0_1() -> None:
    """A pathway is runnable only with a passing validation test, and v0.1 has none (CLAUDE.md, rule 6)."""
    assert [p for p in bm.pathways() if p["status"] == "runnable"] == []


def test_to_check_means_not_yet_confirmed() -> None:
    for p in bm.pathways():
        assert (p["status"] == "to_check") == (not p["verified"]), p


def test_confirmed_pathways_are_planned_when_their_engine_is_on_the_roadmap() -> None:
    for p in bm.pathways():
        if p["verified"]:
            expected = "planned" if p["milestone"] in bm.ROADMAP else "specified"
            assert p["status"] == expected, p


def test_every_method_and_framework_has_a_milestone() -> None:
    assert set(bm.METHOD_MILESTONE) >= {p["method"] for p in bm.pathways() if p["framework"] == bm.F1}
    assert set(bm.FRAMEWORK_MILESTONE) == {b["fw"] for b in bm.BRANCHES} - {bm.F1}


@pytest.mark.parametrize(
    ("framework", "method", "milestone"),
    [
        (bm.F1, "IV", "v0.2"),  # one- and two-group metafor
        (bm.F1, "GLMM", "v0.2"),
        (bm.F1, "MV", "v0.3"),  # rma.mv pairwise
        (bm.F1, "BAYES", "v0.3"),  # bayesmeta
        (bm.F1, "NM_GT", "v0.3"),  # networks
        (bm.F1, "IPD1", bm.LATER),  # one-stage IPD
        (bm.F2, "BIV", "v0.4"),  # diagnostic accuracy
        (bm.F3, "VAL", "v0.4"),  # prognosis
        (bm.F4, "IV", bm.LATER),  # association
        (bm.F5, "IV", bm.LATER),  # reliability
    ],
)
def test_milestones_follow_the_roadmap(framework: str, method: str, milestone: str) -> None:
    assert bm.milestone_of(framework, method) == milestone


def test_the_statuses_are_the_four_claude_md_defines() -> None:
    assert bm.STATUSES == ("runnable", "planned", "specified", "to_check")


# --- "Why not?" -------------------------------------------------------------------


@pytest.fixture(scope="module")
def why() -> dict[bm.Choice, dict[bm.Choice, list[bm.Reason]]]:
    return bm.why_not(bm.pathways())


def test_why_not_checks_are_the_generators() -> None:
    """The combinations that fail no check are exactly the pathways, so the reasons explain the real rules."""
    passing = {
        (b["fw"], b["group"], b["datatype"], b["outcome"], model, mid, code)
        for b, mid, code, model, fails in bm._combinations()
        if not fails
    }
    assert passing == {bm.pathway_key(p) for p in bm.pathways()}


def test_why_not_covers_exactly_the_pairs_that_never_meet(
    why: dict[bm.Choice, dict[bm.Choice, list[bm.Reason]]],
) -> None:
    together: set[tuple[bm.Choice, bm.Choice]] = set()
    choices: set[bm.Choice] = set()
    for p in bm.pathways():
        cs = list(zip(bm.PATHWAY_KEY, bm.pathway_key(p), strict=True))
        choices.update(cs)
        together.update((x, y) for x in cs for y in cs)
    apart = {(x, y) for x in choices for y in choices if x[0] != y[0] and (x, y) not in together}
    explained = {(x, y) for x, others in why.items() for y, reasons in others.items() if reasons}
    assert explained == apart


def test_why_not_reads_the_same_both_ways(why: dict[bm.Choice, dict[bm.Choice, list[bm.Reason]]]) -> None:
    assert [(x, y) for x, others in why.items() for y, r in others.items() if why[y][x] != r] == []


def test_every_why_not_reason_cites_known_sources_and_rules(
    why: dict[bm.Choice, dict[bm.Choice, list[bm.Reason]]],
) -> None:
    rule_ids = {r[0] for r in bm.RULES}
    reasons = {(r["text"], r["rule"], r["src"]) for others in why.values() for rs in others.values() for r in rs}
    for text, rule, src in reasons:
        keys = source_keys(src)
        assert keys and set(keys) <= set(bm.SOURCES), (text, src)
        assert rule == "" or rule in rule_ids, (text, rule)


@pytest.mark.parametrize(
    ("x", "y", "text", "rule"),
    [
        (("method", "PETO"), ("metric", "MD"), "Peto gives only: Peto odds ratio (log).", "R5"),
        (("method", "MH"), ("model", "Random effects"), "Mantel-Haenszel fits a common-effect model only.", "R3"),
        (
            ("method", "MH"),
            ("datatype", "Precomputed estimate"),
            "Mantel-Haenszel takes arm-level data, not precomputed estimates.",
            "R2",
        ),
        (
            ("model", "Random effects"),
            ("datatype", "Observed minus expected and variance"),
            "Observed minus expected and variance (log-rank / Peto) fits a common-effect model only.",
            "R25",
        ),
        (
            ("method", "IV"),
            ("group", "Multiple groups (network)"),
            "Inverse variance is for single groups and two-group comparisons, not networks of three or more "
            "treatments.",
            "",
        ),
        (("outcome", "Binary"), ("metric", "MD"), "Mean difference goes only with the outcome: Continuous.", ""),
    ],
)
def test_why_not_gives_the_reason_its_rule_states(
    why: dict[bm.Choice, dict[bm.Choice, list[bm.Reason]]], x: bm.Choice, y: bm.Choice, text: str, rule: str
) -> None:
    assert [(r["text"], r["rule"]) for r in why[x][y]] == [(text, rule)]


def test_r2_is_cited_only_for_precomputed_estimates() -> None:
    """R2 says which methods take a precomputed estimate; it says nothing about other data a method can't read."""
    by_kind = {b["kind"]: b for b in bm.BRANCHES if b["metrics"]}
    est, ipd = by_kind["est"], by_kind["ipd"]
    assert bm._check_reason("takes", est, "MH", est["metrics"][0], bm.COMMON)["rule"] == "R2"
    reason = bm._check_reason("takes", ipd, "MH", ipd["metrics"][0], bm.COMMON)
    assert reason["rule"] == ""
    assert reason["src"] == ", ".join(bm.METHODS["MH"]["src"])


def test_why_not_names_every_route_when_there_are_several(
    why: dict[bm.Choice, dict[bm.Choice, list[bm.Reason]]],
) -> None:
    """The Peto odds ratio with random effects: only Peto's method gives it, and Peto's method is common-effect."""
    texts = {r["text"] for r in why[("metric", "PETO")][("model", "Random effects")]}
    assert texts == {"Peto odds ratio (log) is computed only by Peto.", "Peto fits a common-effect model only."}


def test_why_not_file_holds_every_pair_once() -> None:
    data = json.loads(bm.WHY_NOT.read_text())
    assert data == bm.why_not_json(bm.pathways())
    pairs = {frozenset((row[0], row[1])) for row in data["pairs"]}
    assert len(pairs) == len(data["pairs"])
    assert all(len(row) >= 3 for row in data["pairs"])

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
        assert re.match(r"^(R\d+: |.*; under review in issue #\d+$)", c["reason"]), c


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

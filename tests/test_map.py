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
            "In this map, Inverse variance is offered for single groups and two-group comparisons; for networks "
            "of three or more treatments, the map offers: Bayesian hierarchical (MCMC); Frequentist, "
            "graph-theoretical; Frequentist, multivariate; Mantel-Haenszel for networks (sparse binary data); "
            "One-stage regression on participant data (network).",
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


def test_a_domain_reason_cites_every_method_it_names(
    why: dict[bm.Choice, dict[bm.Choice, list[bm.Reason]]],
) -> None:
    (reason,) = why[("method", "IV")][("group", "Multiple groups (network)")]
    named = ["IV"] + [k for k, m in bm.METHODS.items() if m["domain"] == "network"]
    assert set(source_keys(reason["src"])) == {k for mid in named for k in bm.METHODS[mid]["src"]}


def test_why_not_names_every_route_when_there_are_several(
    why: dict[bm.Choice, dict[bm.Choice, list[bm.Reason]]],
) -> None:
    """The Peto odds ratio with random effects: the map offers it only with Peto's method, which is common-effect."""
    reasons = {(r["text"], r["rule"]) for r in why[("metric", "PETO")][("model", "Random effects")]}
    assert reasons == {
        ("In this map, Peto odds ratio (log) is offered only with Peto.", "R32"),
        ("Peto fits a common-effect model only.", "R5"),
    }


def test_the_peto_odds_ratio_limit_cites_r32_as_the_maps_choice(
    why: dict[bm.Choice, dict[bm.Choice, list[bm.Reason]]],
) -> None:
    """Issue #45: kept as the map's choice. R32 says so, so its reason keeps "In this map, "."""
    rule = next(r for r in bm.RULES if r[0] == "R32")
    assert rule[1].startswith("In this map, ")
    (reason,) = why[("metric", "PETO")][("method", "IV")]
    assert reason == {
        "text": "In this map, Peto odds ratio (log) is offered only with Peto.",
        "rule": "R32",
        "src": "CH-10 s10.4.2, MF-escalc",
    }


def test_a_reason_no_rule_states_is_worded_as_the_maps(
    why: dict[bm.Choice, dict[bm.Choice, list[bm.Reason]]],
) -> None:
    """A reason may state a limit as a fact about a method only when its rule states it outright."""
    outright = {rule for rule, states in bm.WHY_RULE.values() if states}
    hedged = {rule for rule, states in bm.WHY_RULE.values() if not states}
    for others in why.values():
        for reasons in others.values():
            for r in reasons:
                if " goes only with " in r["text"]:
                    continue
                as_fact = not r["text"].startswith("In this map, ")
                assert not as_fact or r["rule"] in outright, r
                assert r["rule"] not in hedged or not as_fact, r


def test_why_not_file_holds_every_pair_once() -> None:
    data = json.loads(bm.WHY_NOT.read_text())
    assert data == bm.why_not_json(bm.pathways())
    pairs = {frozenset((row[0], row[1])) for row in data["pairs"]}
    assert len(pairs) == len(data["pairs"])
    assert all(len(row) >= 3 for row in data["pairs"])


# --- cards ---------------------------------------------------------------------


@pytest.fixture(scope="module")
def all_cards() -> list[bm.Card]:
    return bm.cards(bm.pathways())


def test_every_node_and_rule_has_one_card(all_cards: list[bm.Card]) -> None:
    paths = bm.pathways()
    nodes = {(t, str(p[t])) for p in paths for t in bm.NODE_TIERS}  # type: ignore[literal-required]
    nodes |= {("method", c) for c in bm.METHODS} | {("metric", c) for c in bm.METRICS}
    nodes |= {("rule", r[0]) for r in bm.RULES}
    have = [(c["tier"], c["value"]) for c in all_cards]
    assert len(have) == len(set(have))
    assert set(have) == nodes


def test_card_ids_are_unique(all_cards: list[bm.Card]) -> None:
    ids = [c["id"] for c in all_cards]
    assert len(ids) == len(set(ids))


def test_card_ids_are_readable() -> None:
    assert bm.card_id("framework", bm.F1) == "framework:interventional-effect-of-an-intervention"
    assert bm.card_id("outcome", "Count / person-time") == "outcome:count-person-time"
    assert bm.card_id("method", "IV") == "method:IV"
    assert bm.card_id("rule", "R5") == "rule:R5"


def test_every_card_cites_known_sources(all_cards: list[bm.Card]) -> None:
    for c in all_cards:
        keys = source_keys(c["src"])
        assert keys, c["id"]
        assert [k for k in keys if k not in bm.SOURCES] == [], c["id"]


def test_every_card_note_cites_known_sources_the_card_lists(all_cards: list[bm.Card]) -> None:
    for c in all_cards:
        for n in c["notes"]:
            keys = source_keys(n["src"])
            assert keys and all(k in bm.SOURCES for k in keys), c["id"]
            assert set(keys) <= set(source_keys(c["src"])), c["id"]


def test_join_src_merges_sections_under_one_key() -> None:
    assert bm._join_src(["CH-10 s10.10.4.1, MF-models", "MF-uni, CH-10", "CH-11 s11.2.2, s11.4.4, NM"]) == (
        "CH-10 s10.10.4.1, MF-models, MF-uni, CH-11 s11.2.2, s11.4.4, NM"
    )


def test_no_card_cites_a_source_twice(all_cards: list[bm.Card]) -> None:
    for c in all_cards:
        keys = source_keys(c["src"])
        assert len(keys) == len(set(keys)), c["id"]


def test_card_rules_exist(all_cards: list[bm.Card]) -> None:
    ids = {r[0] for r in bm.RULES}
    assert all(set(c["rules"]) <= ids for c in all_cards)


def test_method_card_carries_its_function_and_rules(all_cards: list[bm.Card]) -> None:
    peto = next(c for c in all_cards if c["id"] == "method:PETO")
    assert {"label": "R function", "items": ["metafor::rma.peto()"], "code": True} in peto["facts"]
    assert peto["rules"] == ["R2", "R5"]


def test_peto_odds_ratio_card_lists_r32(all_cards: list[bm.Card]) -> None:
    assert next(c for c in all_cards if c["id"] == "metric:PETO")["rules"] == ["R32"]


def test_metric_card_carries_its_exact_call(all_cards: list[bm.Card]) -> None:
    for code, mt in bm.METRICS.items():
        card = next(c for c in all_cards if c["id"] == "metric:" + code)
        assert card["facts"][0] == {"label": "R call", "items": [mt["call"]], "code": True}


def test_model_cards_cite_the_handbook_and_every_listed_method(all_cards: list[bm.Card]) -> None:
    for c in all_cards:
        if c["tier"] != "model":
            continue
        assert set(source_keys(bm.MODEL_SRC)) <= set(source_keys(c["src"]))
        keys = set(source_keys(c["src"]))
        for me in bm.METHODS.values():
            if c["value"] in me["models"]:
                assert set(me["src"]) <= keys, (c["id"], me["label"])


def _card(cards: list[bm.Card], cid: str) -> bm.Card:
    return next(c for c in cards if c["id"] == cid)


def test_branch_card_flags(all_cards: list[bm.Card]) -> None:
    """New when every branch under the node is new; to check when none of them is confirmed."""
    f1 = _card(all_cards, "framework:interventional-effect-of-an-intervention")  # some branches new, some to check
    assert (f1["added"], f1["verified"]) == (False, True)
    dta = _card(all_cards, "framework:diagnostic-test-accuracy")  # all new, one confirmed
    assert (dta["added"], dta["verified"]) == (True, True)
    ipd = _card(all_cards, "datatype:individual-participant-data")  # none confirmed
    assert ipd["verified"] is False
    assert {
        "label": "Branches under it",
        "items": ["2 in all: 1 confirmed, 1 still to check; 2 new"],
        "code": False,
    } in dta["facts"]


def test_cards_file_is_current(all_cards: list[bm.Card]) -> None:
    assert json.loads(bm.CARDS.read_text()) == json.loads(json.dumps(all_cards))


# --- teaching text -------------------------------------------------------------

BANNED = re.compile(r"\b(mandatory|gold standard|always)\b", re.IGNORECASE)


def test_teaching_text_is_for_cards_that_exist(all_cards: list[bm.Card]) -> None:
    assert set(bm.TEACH) <= {c["id"] for c in all_cards}


def test_every_teaching_line_has_a_kind_and_a_known_source() -> None:
    for cid, lines in bm.TEACH.items():
        assert lines, cid
        for kind, text, src in lines:
            assert kind in bm.TEACH_KINDS, (cid, kind)
            assert text.strip() == text and text.endswith("."), (cid, text)
            keys = source_keys(src)
            assert keys and all(k in bm.SOURCES for k in keys), (cid, src)


def test_teaching_text_avoids_absolute_words_no_source_uses() -> None:
    """CLAUDE.md rule 8: no "mandatory", "gold standard" or "always" unless the source says so."""
    assert [t for lines in bm.TEACH.values() for _, t, _ in lines if BANNED.search(t)] == []


def test_a_card_lists_its_teaching_text_and_cites_its_sources(all_cards: list[bm.Card]) -> None:
    for c in all_cards:
        assert [(t["kind"], t["text"], t["src"]) for t in c["teach"]] == bm.TEACH.get(c["id"], [])
        keys = set(source_keys(c["src"]))
        for t in c["teach"]:
            assert set(source_keys(t["src"])) <= keys, c["id"]


def test_batch_one_covers_the_models_and_the_two_group_binary_methods() -> None:
    assert {
        "model:common-effect",
        "model:random-effects",
        "method:IV",
        "method:MH",
        "method:PETO",
        "method:GLMM",
    } <= set(bm.TEACH)


def test_the_models_present_the_choice_as_a_debate() -> None:
    for cid in ("model:common-effect", "model:random-effects"):
        assert any("debated" in t and src == "CH-10 s10.10.4.1" for _, t, src in bm.TEACH[cid])


def test_batch_two_covers_the_two_group_binary_measures() -> None:
    assert {"metric:OR", "metric:RR", "metric:RD", "metric:PETO", "metric:AS"} <= set(bm.TEACH)


def test_the_risk_difference_card_cautions_that_relative_measures_are_more_consistent() -> None:
    assert any(k == "caution" and src == "CH-10 s10.4.3" for k, _, src in bm.TEACH["metric:RD"])


def test_batch_three_covers_the_two_group_continuous_measures() -> None:
    assert {"metric:MD", "metric:SMD_G", "metric:SMD_D", "metric:SMDH", "metric:SMD1", "metric:ROM"} <= set(bm.TEACH)


def test_every_standardized_mean_difference_carries_the_same_cautions() -> None:
    """Cochrane 6.5.1.2's assumption about standard deviations, and the direction of scales, apply to each."""
    shared = [line for line in bm.TEACH["metric:SMD_G"] if line[0] != "what"]
    for cid in ("metric:SMD_D", "metric:SMDH", "metric:SMD1"):
        assert all(line in bm.TEACH[cid] for line in shared), cid


ONE_GROUP = ("PR", "PLN", "PLO", "PRZ", "PAS", "PFT", "MN", "SMN", "MNLN", "IR", "IRLN", "IRS", "IRFT")


def test_batch_four_covers_every_one_group_measure() -> None:
    assert {"metric:" + c for c in ONE_GROUP} <= set(bm.TEACH)


def test_batch_four_says_nothing_beyond_escalc() -> None:
    """escalc() defines these measures and their zero-count defaults; no line here goes beyond it."""
    for c in ONE_GROUP:
        assert all(src == "MF-escalc" for _, _, src in bm.TEACH["metric:" + c]), c


PAIRED = ("MC", "SMCC", "SMCR", "ROMC", "MPRR", "MPOR", "MPRD", "MPORC")


def test_batch_five_covers_every_paired_measure() -> None:
    assert {"metric:" + c for c in PAIRED} <= set(bm.TEACH)


def test_paired_binary_cards_defer_to_a_statistician_as_cochrane_does() -> None:
    for c in ("MPRR", "MPOR", "MPRD", "MPORC"):
        assert any(k == "caution" and src == "CH-23 s23.2.5" for k, _, src in bm.TEACH["metric:" + c]), c


def test_batch_six_covers_the_other_two_group_measures_and_o_minus_e() -> None:
    assert {"metric:IRR", "metric:IRD", "metric:IRSD", "metric:HR", "metric:POR", "method:OEV"} <= set(bm.TEACH)


def test_batch_seven_covers_the_other_pairwise_methods() -> None:
    assert {"method:LRP", "method:BAYES", "method:MV", "method:IPD1"} <= set(bm.TEACH)


def test_the_bayesian_card_cautions_that_results_depend_on_the_priors() -> None:
    assert any(k == "caution" and src == "CH-10 s10.13" for k, _, src in bm.TEACH["method:BAYES"])


NETWORK_TAUGHT = ("NM_GT", "NM_MV", "NM_MH", "NM_BAYES")


def test_batch_eight_covers_the_network_methods_with_a_source() -> None:
    assert {"method:" + c for c in NETWORK_TAUGHT} <= set(bm.TEACH)


def test_every_taught_network_method_carries_the_network_cautions() -> None:
    """Transitivity and the statistician hold whatever fits the network (Cochrane 11.2.2, 11.3.1)."""
    for c in NETWORK_TAUGHT:
        assert all(line in bm.TEACH["method:" + c] for line in bm.NETWORK_CAUTIONS), c


def test_batch_nine_covers_the_other_frameworks_methods_with_a_readable_source() -> None:
    assert {"method:BIV", "method:HSROC", "method:VAL", "method:DR"} <= set(bm.TEACH)


def test_no_teaching_line_cites_a_source_marked_not_read() -> None:
    """A source the map marks as not read (or not readable online) cannot back teaching text."""
    unread = {k for k, (label, _) in bm.SOURCES.items() if "not read" in label}
    assert {"DTA-HB", "DEBRAY", "RILEY"} <= unread
    for cid, lines in bm.TEACH.items():
        for _, _, src in lines:
            assert not set(source_keys(src)) & unread, cid


CORRELATION_AND_ALPHA = ("COR", "UCOR", "ZCOR", "RPB", "RBIS", "PHI", "RTET", "PCOR", "ARAW", "AHW", "ABT")


def test_batch_ten_covers_the_correlation_and_alpha_measures_from_escalc_only() -> None:
    for c in CORRELATION_AND_ALPHA:
        lines = bm.TEACH["metric:" + c]
        assert lines and all(src == "MF-escalc" for _, _, src in lines), c


def test_batch_eleven_covers_the_measures_whose_package_pages_were_read() -> None:
    assert {"metric:" + c for c in ("SESP", "CSTAT", "OE", "DR_RR", "DR_MD", "DR_SMD")} <= set(bm.TEACH)

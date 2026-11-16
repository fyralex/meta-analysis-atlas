---
name: audit-pr
description: The auditor's checklist and comment format for reviewing one Meta-Analysis Atlas pull request. Load this when acting as the auditor agent, or to self-check a PR before asking for an audit.
---

# Audit a pull request

## Checklist

Mark a finding **blocking** if it breaks a rule in CLAUDE.md, fails a check,
ships a bug, or states something about methodology that its source doesn't
support. Everything else is **non-blocking**.

**Scope**
- The PR closes exactly one issue (`Closes #N`), and every acceptance
  criterion in the issue is met. Name any that isn't.
- No unrelated changes: drive-by refactors, formatting churn, stray files.
- The description says what changed, why, how it was tested (with the
  `scripts/check.sh` summary) and what was left out.

**The map** (blocking if broken)
- Generated files in `spec/` match `spec/build_map.py` (the check confirms
  this). No generated file was edited by hand.
- Any change to which pathways exist, or to their status, is explained in the
  PR's "Map changes" section, with counts before and after.
- A methodology change links its `methodology` issue and that issue records
  the owner's or methodologist's decision. Without a decision, the change
  doesn't belong in this PR.
- Every new or changed entry has a source key that exists, and the source
  supports the wording. Open the source when the claim is new or contested.
- Entries not confirmed from a primary source keep `verified=False`; entries
  not in taxonomy v11 keep `added=True`.
- Wording avoids "mandatory", "gold standard" and "always" unless the source
  says so; genuine debate is presented as debate.
- A source is cited by section and its rule put in our own words; no text is
  copied from a handbook or package documentation.

**Claims**
- Nothing in the README, docs or UI presents a pathway as runnable unless it
  has a passing validation test (none do in v0.1).

**Privacy and secrets** (blocking)
- No personal details: names, home-directory paths, machine names, emails
  other than the GitHub noreply address in commit metadata.
- No mention of the project this work grew out of.
- No secrets, tokens or real `.env` values. Only placeholders in
  `.env.example`.
- The private name scan ran (the check fails without it).

**Code**
- ruff passes; from PR 2, mypy `--strict` passes. No new `Any` or
  `# type: ignore` without a comment saying why.
- Tests cover new behaviour (from PR 2).
- Docs: CLAUDE.md and docstrings are updated where the change makes them
  wrong.

## Re-run the checks

```bash
gh pr view <N> --json headRefName -q .headRefName
git fetch origin && git worktree add --detach /tmp/audit-pr-<N> origin/<head-branch>
cd /tmp/audit-pr-<N> && PYTHON=<repo>/.venv/bin/python sh scripts/check.sh
git worktree remove /tmp/audit-pr-<N>
```

`ATLAS_PRIVATE_SCAN` must be set in the environment for the scan to run.

## Comment format

Post with `gh pr comment <N> --body-file <file>`:

```markdown
## Audit round <N>: APPROVE | CHANGES_REQUESTED

**Checks:** lint ✅ · format ✅ · map files current ✅ · private scan ✅

### Findings
1. **[blocking]** `path/to/file:42`: what is wrong, why it matters, what would fix it.
2. **[non-blocking]** ...

### Earlier findings            <!-- round 2 and 3 only -->
- #1 fixed · #2 withdrawn: <reason> · #3 upheld: <reason>

### Not checked
- What this round didn't cover (a file, a source not opened, a case not run), or "Nothing left out".
```

## Bounds

- About 15 minutes a round. Rerun the checks once; don't repeat work the PR's
  description already shows, unless there's a concrete reason to doubt it.
- Round 2 and 3 check only the earlier blocking findings' fixes or disputes,
  against the diff since the last round, and anything that diff introduces.
- Say plainly what wasn't checked, in the comment's last section.

Then label the round:

```bash
gh pr edit <N> --add-label audit:round-<N> --remove-label audit:round-<N-1>
```

---
name: feature-workflow
description: How every Meta-Analysis Atlas change goes from GitHub issue to a pull request ready for the owner - issue, branch, build, local checks, PR, up to three auditor rounds, hand-off to the owner. Use when starting any feature, fix, chore, docs or map change in this repo.
---

# Feature workflow: issue -> PR -> audit -> owner

Never commit to `main`, never merge, never approve, never force-push. Only the
owner merges.

## 1. Issue

Find the issue, or open one if the owner asked for the work and none exists:

```bash
gh issue list --milestone v0.1
gh issue create --title "<what>" --label <label> --milestone v0.1 --body-file -   # Goal / Acceptance criteria / Out of scope
```

A change to what the map says is valid needs a `methodology` issue with the
owner's or methodologist's decision recorded in it. If there's no decision,
stop and ask.

## 2. Branch

```bash
git switch main && git pull --ff-only
git switch -c <type>/<issue>-<slug>        # e.g. feat/4-atlas-2d
```

## 3. Build

Edit the map only in `spec/build_map.py` and regenerate with
`python3 spec/build_map.py`. Write tests with the code. Commit in small, honest
commits. Each message says what and why; end it with the attribution trailer
your session uses. Check every diff for keys, tokens and passwords before
committing.

## 4. Local checks (all must pass)

```bash
scripts/check.sh            # lint, format, generated map files current, private name scan
pre-commit run --all-files
```

`ATLAS_PRIVATE_SCAN` must point to the owner's private scan script.

## 5. Pull request

```bash
git push -u origin HEAD
gh pr create --title "<type>: <summary>" --body-file -
```

The body follows `.github/pull_request_template.md`: `Closes #N`, What, Why,
How tested (paste the check summary), Map changes, Left out.

## 6. Audit loop (max 3 rounds)

**A small PR skips this step:** it changes only docs or tests, or fewer than
about 50 lines of code, and nothing in `spec/`. Its local checks are its
review. Write "Small PR: no audit (CLAUDE.md, Audit loop)" in its description
and go to 7. A map change is never small.

For round N = 1, 2, 3:

1. Run the `auditor` agent: "Audit PR #<pr>, round N", plus, from round 2 on,
   your reply to each earlier finding.
2. Read its verdict.
   - **APPROVE**: `gh pr edit <pr> --add-label audit:approved`, then go to 7.
   - **CHANGES_REQUESTED**: go through every blocking finding:
     - Agree: fix it, rerun the local checks, push.
     - Disagree: reply on the PR (`gh pr comment`) with the finding number and
       a concrete reason. Don't change the code for it.
   - Non-blocking findings: fix them or answer them, in the same push, and
     list them in the PR's Audit section. They never need another round.
3. Next round, only if a blocking finding was fixed or disputed. Otherwise
   go to 7.

**Escalate to the owner** when round 3 ends without APPROVE, or the auditor
upholds a finding you still disagree with:

```bash
gh pr edit <pr> --add-label needs-owner
gh pr comment <pr> --body-file -
```

The escalation comment lists each open point: the finding, the auditor's
position, your position, and what each option would mean. Then go to 7.

## 7. Hand off to the owner, then stop

```bash
gh pr edit <pr> --add-label ready-for-review
```

Tell the owner in chat (see CLAUDE.md, "Ready for review"): the PR link, what
changed and why, the checks that ran, pathway counts if the map changed,
anything left out, and what to review most carefully. Then stop until the
owner replies. If they ask for changes, push them to the same branch and
report again.

## 8. After merge

The owner merges, and GitHub deletes the remote branch. Pull `main`, delete
the local branch (`git branch -D <branch>`: a squash merge leaves it looking
unmerged), and pick up the next issue in the milestone.

## Follow-up issues

Work found along the way that is out of scope gets its own issue, from the
bug template: the first line says where it was found (building or auditing
#<PR>) and how severe it is, then "What's wrong" with file and line, "What to
do", and acceptance criteria. When all of a milestone's issues are closed, the owner
closes the milestone, which runs CI; once CI passes, propose the `v<x.y.0>`
tag and release notes.

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

**Close issues by keyword.** Put one `Closes #N` line at the top of the body
for every issue the PR finishes, so GitHub closes each one when the owner
merges. Never close an issue by hand. Use "Part of #N" only for an issue that
stays open after the merge, such as a checklist issue with items left. When
that issue's last item lands, the PR finishing it says `Closes #N`.

**Stacked PRs.** If a PR builds on another open PR, branch from that PR's
branch, say "Builds on #A, whose commits it includes: please merge #A first"
at the top of the body, and have the auditor review only the difference
(`git diff origin/<A-branch> origin/<B-branch>`).

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

**A stacked PR after its base is squash-merged** will show conflicts, because
the squash rewrote the base's commits. Wait until its audit round has finished,
then:

```bash
git fetch origin && git switch <B-branch>
git diff --quiet origin/<A-branch> origin/main && echo "main == A"   # main must equal A's last commit
git merge origin/main --no-edit
git checkout --ours <each conflicted file> && git add -A           # B already contains all of A
python3 spec/build_map.py --lock                                    # regenerate, never hand-merge spec/ files
scripts/check.sh && git push
```

Only keep B's side when main equals A's last commit. If main has anything
else, resolve the conflicts properly. Check that `gh pr view <B> --json
mergeable` says `MERGEABLE`, then tell the owner it's ready.

## Follow-up issues

Work found along the way that is out of scope gets its own issue, from the
bug template: the first line says where it was found (building or auditing
#<PR>) and how severe it is, then "What's wrong" with file and line, "What to
do", and acceptance criteria.

## Releases

When the owner asks for a release, or all of a milestone's issues are closed:

1. Open a release issue, and a small docs PR (`docs/<issue>-release-<x.y.z>`)
   that adds the `CHANGELOG.md` entry. The entry gives the date, the pathway
   counts by status, and what changed, grouped and linked to its PRs. The PR
   says `Closes #<release issue>`.
2. After the owner merges it, tag the merge commit on `main` with an annotated
   tag, then push only the tag. This is the one push that goes to `main`'s
   history, and only the owner's go-ahead for the release allows it:

   ```bash
   git switch main && git pull --ff-only
   git tag -a v<x.y.z> -F - <<'EOF'
   Meta-Analysis Atlas <x.y.z>

   <two or three lines: what the release is, and the pathway counts>
   EOF
   git push origin v<x.y.z>
   ```
3. The tag starts CI (`scripts/check.sh` and the browser tests) and Pages.
   Watch both (`gh run list`, `gh run watch <id> --exit-status`), and report
   the outcome and the site's address to the owner. If CI fails, say so with
   the output, and fix it in a new PR; never move or delete a published tag.

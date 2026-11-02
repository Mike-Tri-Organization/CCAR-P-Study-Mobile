---
name: squash-merge-pr
description: Squash merge a pull request and clean up afterwards (delete the branch remotely and locally, prune remote refs, return to an up-to-date main). Use only when the user explicitly asks to squash merge a PR.
---

# Squash merge a PR and clean up

Never merge unless the user explicitly asked for it in this conversation.

## 1. Pre-checks
- `pull_request_read` (get): confirm `state` is open, not draft, `mergeable_state` is `clean`. If not, stop and report.
- Get the head SHA from git: `git rev-parse origin/<branch>`. `expectedHeadSha` must be the **full 40-character SHA**; a short SHA is rejected.
- If a summary comment was requested earlier (see the `pr-summary-comment` skill), make sure it is posted.

## 2. Merge
`merge_pull_request` with:
- `merge_method: "squash"`
- `expectedHeadSha`: the full 40-char SHA
- `commit_title`: `<PR title> (#<number>)`
- `commit_message`: a short bullet list of the real changes. Drop items that only fix bugs introduced on the branch itself. End with the attribution lines from the session's system reminder when present.

## 3. Clean up (always, right after a successful merge)
Run from the repo root:

```bash
git fetch origin main
git checkout main
git pull --ff-only origin main
git push origin --delete <branch>     # delete remote branch
git branch -D <branch>                # delete local branch (squash makes -d refuse; -D is expected)
git fetch --prune origin              # prune stale remote-tracking refs
git remote prune origin
git branch -a && git log --oneline -3 && git status -sb
```

- Verify the remote branch is really gone with `git ls-remote --heads origin`.
- If the remote delete fails (e.g. the proxy hangs up, or the repo auto-deletes head branches), do not work around it. Tell the user the branch is still on the remote and ask them to delete it in the GitHub UI or enable "Automatically delete head branches" in repo settings.
- Only delete the branch of the PR just merged. Never delete other branches (including the session's designated branch) without asking.
- End on `main`, clean and equal to `origin/main`.

## 4. Report
State: merge commit SHA, whether the remote branch was deleted, local branch deleted, current branch (`main`), and whether any deploy workflow will run (do not claim it succeeded unless checked).

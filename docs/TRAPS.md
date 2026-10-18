> **On-demand reference.** Read this file when the work goes near a trap listed here.
> `/orchestrate` passes only the entries relevant to an issue into that implementer's
> launch prompt, not the whole list. Rules that every agent needs are in the
> authoritative docs: entries 1–2 → `docs/GIT_WORKFLOW.md` § 3 (PR conventions), 3 and 5 →
> `/code-review` § Pin the range / § Dispatch, 4 → `docs/agents/runtime.md` § Preflight.
> Appending here is a version-scoped docs change. Downstream projects seed this file
> with *their* measured traps; do not copy another repo's list in wholesale.

# Trap registry — append-only, repo-specific

Each entry is cited against the repo so it can be checked. An entry that stops being true
moves to `docs/DEFERRED_ISSUES.md`'s resolved section. It is not silently deleted.

**Trims declare themselves.** An entry leaves this file in one of two ways: it moves to
that resolved section, or it is merged into another entry covering the same failure.
Either way, the PR that removes it must say which entry left and why.

The numbered entries below are **process-layer** traps. Entries 1–6 and 9–12 were
measured while dogfooding this workflow in `mantle-router-algorithm-bench` and
`mantle-7702-sdk` (2026-10-09…15; the tracker ids they cite belong to those projects) and
carry over unchanged. Entries 7–8 and 13–14 were re-measured for this repository on
2026-10-18 (7: `gh` resolved `Whisker17/research-hub` only after the token swap; 8: commits
resolve to the personal identity; 14: a Release description over 255 characters was
rejected while planning release 0.1.0). Stack-specific traps of this project (Astro,
answer-me-with-html, Chrome mobile checks, Cloudflare, the content lane) are appended
below as they are measured.

1. **`gh pr create` (and every later `gh` call) needs `--repo <owner/repo>` whenever
   `gh` would resolve the wrong GitHub repo.** A fork, a `no_push` `upstream`, or
   `gh repo view` reporting a different `nameWithOwner` than `origin` are the usual
   causes. Verify with `gh repo view --json nameWithOwner` before the first `gh pr
   create` of an issue.
2. **Nested worktrees under the primary clone need `--head <owner>:<feature-branch>`
   as well** (the owner login, not `owner/repo`: `--head owner/repo:branch` fails with
   "Head sha can't be blank … Head ref must be a branch", measured 2026-10-09 on this
   repo's first PR). `gh pr create` without `--head` infers the primary clone's checked-out
   branch (often `dev` or `main`), not the worktree's. After create,
   `gh pr view --repo <owner/repo> <N> --json headRefName` must equal the worktree
   branch. If it is the trunk, close the PR and recreate — do not push more commits
   onto a PR whose head is the trunk.
3. **Commit before dispatching a reviewer, then hand it a three-dot diff, and verify it
   is non-empty before dispatching.** `/code-review`'s canonical command is
   `git diff <fixed-point>...HEAD` (three-dot, against the merge-base). Two-dot
   (`git diff <base>`) looks like the fix for an empty three-dot on an uncommitted
   branch, but once `<base>` advances it shows the reviewer those foreign commits,
   reversed. Commit first; use three-dot; refuse to dispatch on an empty range.
4. **`--probe` is not a real call.** `scripts/agent-dispatch.sh --probe` only checks that the
   binary resolves. A role whose binary is on `PATH` but whose auth/quota/flags fail
   still reports `ok`. The gate is a real one-line dispatch that must print
   `DISPATCH-OK` and exit 0 (`docs/agents/runtime.md` § Preflight). If it fails, the
   review did not happen: stay at `In Review`, never self-review.
5. **Empty reviewer stdout is a vacuous gate, not a clean pass.** Exit 0 with no
   findings-shaped content is indistinguishable from "the dispatch never ran." Inline
   the three-dot diff (and any file the spec needs) in the reviewer prompt rather than
   depending on the reviewer to run git; if stdout is empty or a transport error,
   retry once, then stop and report.
6. **`pgrep -fl` dumps this machine's entire shell-snapshot environment** instead of the
   one process you meant to find. Use `pgrep -f <pat> | head -1` to get the pid, then
   `ps -o pid,etime,command -p <pid>`.
7. **`gh` defaults to the wrong GitHub account for this repository.** The shell exports a
   `GITHUB_TOKEN` for `whisker-yu-mantle`, which cannot resolve the private
   `Whisker17/research-hub` (GraphQL "Could not resolve to a Repository"). Git over SSH
   authenticates as `Whisker17` and works; `gh` does not. Run every `gh` call for this repo as
   `GITHUB_TOKEN= GH_TOKEN=$(env -u GITHUB_TOKEN gh auth token --user Whisker17) gh … --repo Whisker17/research-hub`.
   Measured 2026-10-18 during bootstrap.
8. **Commits use the personal identity and are unsigned.** `~/.gitconfig` resolves this
   repository to `Whisker17 <demiwhisker@gmail.com>`;
   the Touch-ID signing include applies only to `mantle-xyz` / `mantlenetworkio` remotes, so
   unattended agents can commit here without blocking. Do not add a signing config to this
   repository. Measured 2026-10-18 during bootstrap.
9. **Never use `git stash` while several worktrees of this repository are active.** The
   stash is one ref (`refs/stash`) in the shared repository, not per worktree: `git stash
   list` in any worktree shows every worktree's entries, and `git stash pop` takes the
   newest one, whoever pushed it. Measured 2026-10-11 during the 0.1.1 review fix batch 2:
   one implementer's `stash pop` applied another implementer's entry in its own worktree
   (nothing was committed; the other branch's final diff stayed intact; a rerere record
   it left behind was deleted by hand). Park work in progress as a commit on your own
   branch (amend or reset it before pushing) or in a scratch worktree instead.
10. **Stopping a dispatched agent: freeze its process tree, then kill it, then check the
   worktree.** `scripts/agent-dispatch.sh` copies the prompt into a `mktemp` spool and runs
   `pi … @<spool>` as its child (the `claude`/`codex` adapters read the spool on stdin), so
   the original prompt path is not on the runtime's command line, and the builds and scans
   the runtime starts carry neither the spool nor, usually, the worktree path (they run
   with the worktree as their working directory and relative arguments). On 2026-10-11 a
   stop aimed at the wrapper's process tree did not stop the `pi` session: it kept editing
   its worktree for ~8 minutes and restarted a scan. Procedure: note the wrapper PID at
   dispatch. To stop: find the runtime (`pgrep -P <wrapper-pid>`; for `pi` confirm its
   `@<spool>` argument with `ps -o pid,command -p <pid>`) and send it `SIGSTOP`; then
   repeatedly list the children of every stopped process (`pgrep -P`) and `SIGSTOP` each new
   one, until a pass finds no new descendant — a frozen tree cannot spawn, so the list is
   then complete. Send `SIGTERM` (then `SIGKILL`) to every recorded PID and `SIGCONT` so
   stopped processes can act on it, and confirm with `kill -0` that each is gone. Finally
   check the worktree by working directory and open files (`lsof +D <worktree>`;
   `pgrep -f <path>` only as a supplement). An empty `lsof` does not prove that a child
   that had already left the tree (reparented, working elsewhere) is gone: if the tree was
   not frozen before ancestry was lost and ownership cannot be established from launch
   records, treat the stop as unverified and do not dispatch a successor into that
   worktree.
11. **A dispatched `pi -p` session can die with `Connection error.` mid-issue, leaving local
   commits unpushed.** Measured 2026-10-14/15 during 0.1.5: three IMPLEMENTER sessions ended this
   way after 40–90 min (stdout empty, stderr `Connection error.`); recorded in the orchestrator
   comments on WHI-1770 and WHI-1777 and in the `Release 0.1.5 — orchestration` document. Nothing
   was lost: the worktree held a clean local commit or merge. Recovery, in order: (1) reconcile
   surviving work first — a detached measurement the session started may still run; find it from
   its launch record / PID sentinel and either hand it to the successor explicitly or stop it per
   entry 10; never dispatch a successor into a worktree whose processes you cannot account for;
   (2) repeat the real one-line `DISPATCH-OK` call for the role (`docs/agents/runtime.md`
   § Preflight: a call error requires it) and stop if it fails; (3) inspect the worktree
   (`git log origin/<base>..HEAD`, `git status`, `git ls-remote origin <branch>`); (4) dispatch a
   fresh IMPLEMENTER, same model and effort, with the original prompt plus a short note of the
   found state, in the same worktree, and re-establish every check on the final HEAD. Long
   measurement work inside a dispatched session runs detached (`nohup … &` + PID sentinel) so a
   dropped session cannot kill it.
12. **Write a prompt file and dispatch it in two separate, sequential tool calls, and call the
   dispatcher by its absolute path.** Twice in 0.1.5 (2026-10-15; the WHI-1850 re-review and a
   WHI-1777 resume, recorded in the orchestration document's progress log) a prompt was written
   and dispatched in two *parallel* calls: the dispatcher started first and exited 2 (`prompt file
   not found`), costing a review cycle each. Use `<primary clone>/scripts/agent-dispatch.sh`, launch it from the
   intended working directory (the implementer's worktree, or the primary clone for a reviewer),
   and check the `.err` file a few seconds after launch.
13. **Linear documents normalise markdown on save** (`-` bullets → `*`, `_x_` → `*x*`, tables
   re-padded, issue identifiers rendered as `<issue …>` links). An exact-string replace using the
   pre-normalisation text can silently change nothing. Procedure: re-read and match against the
   stored form, and re-read after every write to confirm it landed. Measured 2026-10-18 during
   release 0.1.0 on that release's orchestration document. Evidence (mantle-7702-sdk): `Release 0.1.0 —
   orchestration` document, § Process traps measured during 0.1.0, item 5.
14. **Linear `save_release({ description })` replaces the whole description and rejects more
   than 255 characters** (HTTP 400 "description must be shorter than or equal to 255
   characters"). On Release 0.1.0 an append attempt failed and a later write overwrote the
   original planning text, which had to be restored verbatim. Procedure: never put process notes
   in a Release description; keep them in the orchestration document. If a description write is
   unavoidable, read the existing text first and preserve it. Measured 2026-10-18 during release
   0.1.0 (mantle-7702-sdk). Evidence: that release's orchestration document, § Process traps measured during
   0.1.0, item 6.

# Git Workflow

This repo uses the **main + version-integration + issue-worktree** model, plus a
**content lane** that publishes reports and daily recommendations straight to `main`.

It is the code-template workflow (`https://github.com/Whisker17/code-template`, v0.2.0)
adapted to a site whose `main` deploys on every push. The adaptations are listed in
[§ Deviations from the template](#deviations-from-the-template).

## The one-sentence rules

**Code:** every issue's implementation = a dedicated git worktree branched off the
resolved base + a short-lived branch → PR into that same base → tracker state moves in
lockstep with the PR.

**Content:** reports (`reports/`), daily recommendations (`daily/`) and the tag registry
(`tags.yml`) are written by `rh` (and the Daily workflow) and pushed straight to `main`,
behind the human gates of `AGENTS.md` (把关 ①②③) — never mixed with code.

The resolved base for code is **not** always `main`. Version-scoped work targets
`release/v{version}`. **Never default to `main`.** If an issue does not fall into exactly
one row of the [resolution table](#resolving-the-base-branch), stop and surface it.

Never develop a code issue in the primary clone's working tree. The primary clone stays
on `main` and is only for: the content lane (`rh new / render / card / check / publish`),
pulling `main`, creating worktrees, and post-merge verification.

## Branch roles

| Branch | Role | Who writes |
|--------|------|------------|
| `main` | **Equals production.** CI deploys every push (`.github/workflows/deploy.yml`). Receives content-lane commits, governance PRs, hotfix PRs and finished version-integration branches. | Content lane (direct push, hook-checked) or PR |
| `release/vX.Y.Z` | **Version integration branch.** Cut from `main` by the owner when work on version X.Y.Z begins. Receives that version's issue PRs. Not releasable until the release review passed on its current SHA. | PR (issues), fan-in merge from `main` |
| `feat/*` `fix/*` `chore/*` `docs/*` | Single-issue implementation branches (inside worktrees) | Short-lived |
| `hotfix/*` | Urgent production fixes, branched from `main` | Fan in to live `release/v*` after merging |

There is **no `dev` branch**: `main` already carries every shippable change (content and
code), so a second trunk would only drift from it.

Cutting a version-integration branch is a **deliberate owner act**. An agent must not
create `release/v*` as a side effect of picking up a ticket. The first push of a newly cut
`release/v*` uses `ALLOW_DIRECT_PUSH=1` — the hook protects the name.

## Content lane

| Path | Written by | Gate |
| --- | --- | --- |
| `reports/**` | `rh new / import / render / card / publish` (Claude Code session, `.claude/skills/research-hub/`) | 把关 ①②③; `rh publish` runs `rh check` and the build |
| `daily/**` | the Daily workflow's commit job (release 0.1.0) and `rh topic` | the job's own checks; `rh daily check` |
| `tags.yml` | `rh tags add` | confirmed at 把关 ① |

Rules:

- A content commit touches **only** these paths. Code, docs, skills, workflows and config
  always go through a PR.
- Content commits are made on `main` in the primary clone and pushed directly. The local
  `pre-push` hook allows a direct push to `main` only when **every** pushed commit is a
  non-merge commit that changes content paths only; anything else is refused.
- Content never goes to `release/v*` directly. It reaches a live version branch through
  [fan-in](#fan-in-main-into-live-version-branches).
- Content written against an unreleased feature (for example a `tags.yml` field that only
  `release/v0.1.0` understands) waits until that version merged into `main`; `main`'s
  CI must stay green with `main`'s code.

## Resolving the base branch

Derive the base from this table, then **assert it immediately**. Do not store a base
branch on the issue — derived values drift.

**Every issue falls into exactly one category:**

| Category | How it is recognised | Worktree base | PR base |
| --- | --- | --- | --- |
| Hotfix | `hotfix` label | `origin/main` | `main` |
| Repo-wide governance | touches **only** the carve-out file list | `origin/main` | `main` |
| Version-scoped work | everything else; version from the title prefix, cross-checked against the tracker's release binding | `origin/release/v{version}` | `release/v{version}` |

Content is not an issue category: it never goes through a worktree or a PR.

**If an issue does not fall cleanly into exactly one category, refuse to start and
surface it.** Do not guess. Do not fall back to `main`.

### Repo-wide governance carve-out

These files govern **every** branch; pinning them to one release would mean hotfix and
content work run under stale rules:

- `docs/GIT_WORKFLOW.md`
- `docs/agents/` (issue template, tracker binding, triage labels, runtime, domain)
- `docs/TRAPS.md` and `docs/DEFERRED_ISSUES.md` entries that are process-layer
- `.githooks/` and its test `test/pre-push.test.ts`
- `.github/pull_request_template.md`
- `config/agent-roles.conf`
- `scripts/agent-dispatch.sh` and `test/test_agent_dispatch.py`
- the process skills: `.claude/skills/{grill-me,to-spec,to-tickets,implement,orchestrate,code-review,handoff,ponytail}/`
- `skills-lock.json`
- `docs/references/template-sync.md` (the adoption record)
- `AGENTS.md` § 开发流程 only (the process summary); the rest of `AGENTS.md` is product
  rules and is version-scoped

Deliberately **not** in the carve-out (they are product, versioned with the code they
drive): `.github/workflows/` (the deploy and Daily pipelines build this version's code),
the team skills (`.claude/skills/research-hub/`, `.claude/skills/daily-topics/`),
`README.md`, `docs/product-spec.md`, `docs/decisions/`.

An issue that mixes the carve-out with version-scoped work **must be split**: the
governance part goes to `main` and [fans in](#fan-in-main-into-live-version-branches);
the feature part goes to its release branch.

### Version determination (version-scoped row only)

Two independent signals, because either one alone has already failed in practice (empty
Release fields; a milestone and a Release both rendering `0.2.0` confused for each other).

1. **Primary: the issue-title prefix `[X.Y.Z]`** (e.g. `[0.1.0] [UI] …`).
2. **Cross-check: the tracker's release binding**, as defined in
   `docs/agents/issue-tracker.md` § Release ↔ version binding.

If the two signals disagree, or either is missing, **refuse to start and surface it.
Never default to `main`.** If `origin/release/v{version}` does not exist, refuse and ask —
do not create it as a side effect of picking up a ticket.

### Base check (mandatory, immediately after worktree creation)

```bash
git merge-base HEAD origin/<resolved-base>
git rev-parse origin/<resolved-base>
```

These two values must be equal. A mis-resolved base must fail in seconds, not at PR time.
The PR body **must** state the resolved base and the signals it was derived from.

## Issue lifecycle (mandatory)

Aligned with the tracker workflow states: `Todo` → `In Progress` → `In Review` → `Done`.

```text
         resolve base (table; fail closed)
                      │
                      ▼
         git worktree add (branch off origin/<resolved-base>)
                      │
                      ▼
              implement one issue
                      │
                      ▼
         push + gh pr create --base <resolved-base>
         tracker: state = In Review
                      │
                      ▼
         merge authorization for this lane (fail closed)
                      │
                      ▼
         merge PR → <resolved-base> (lane's strategy)
         remove worktree + prune branch
         fan in if that base was main
         tracker: state = Done
```

### 1. Start: new worktree off the resolved base

```bash
git fetch origin

# Branch name: type/whi-<id>-short-topic (all lowercase, dash-separated)
ISSUE=whi-123
BRANCH=feat/${ISSUE}-short-topic
WT="../research-hub-wt/${ISSUE}"
BASE=origin/release/v0.1.0   # or origin/main — from the table
PR_BASE=${BASE#origin/}

git worktree add -b "$BRANCH" "$WT" "$BASE"
cd "$WT"
pnpm install --frozen-lockfile

# Verify the base immediately — these two values must be equal
git merge-base HEAD "$BASE"
git rev-parse "$BASE"
```

Tracker: set the issue to **`In Progress`**. The hooks path is shared repository config
(set once, [§ Branch protection](#fallback-the-local-pre-push-hook)); confirm
`git config core.hooksPath` prints `.githooks` and the hook file exists in the worktree.

> ⚠️ **Base trap.** Never assume your tooling's default base. Claude Code's
> `EnterWorktree` branches from `origin/main` — right for hotfix and governance, **wrong
> for version-scoped work**. Run the check above after creating **any** worktree.

### 2. Implement

- **One worktree / one branch / one issue / one PR** (never bundle unrelated issues)
- Small Conventional Commits (`feat:` `fix:` `chore:` `docs:` `refactor:` `test:`)
- Never commit content (`reports/`, `daily/`, `tags.yml`) from a code worktree, except
  test fixtures under `test/`
- Verification has three tiers. Every result must come from the final HEAD:
  1. **Required project checks.** CI (`.github/workflows/deploy.yml` job `verify`), i.e.
     `pnpm verify`. These always pass before any merge.
  2. **Relevant issue checks.** The affected tests plus what the issue's acceptance names:
     `rh check <slug>` with mobile screenshots for anything that changes report output,
     browser checks for site pages. Run them for every PR.
  3. **Full suite.** `pnpm verify` plus `rh check` (with screenshots) over every published
     report, the dispatcher test
     (`uv run --no-project --with pytest python -m pytest test/test_agent_dispatch.py`), and
     every acceptance criterion in scope. Run it at each release candidate and after each
     fix batch. PRs that no release acceptance covers (governance, standalone
     `/implement`, hotfix) also run it before merge.
- Never commit secrets, `.env`, `.rh/`, `dist/` or large logs

### 3. Open PR → the resolved base, enter review

```bash
git push -u origin HEAD
gh pr create --repo Whisker17/research-hub --base "$PR_BASE" \
  --head "Whisker17:$BRANCH" \
  --title "feat(WHI-123): short description" \
  --body-file <filled .github/pull_request_template.md>
```

Tracker: set the issue to **`In Review` immediately** (when the PR opens).

PR conventions:

- Base is the resolved base (version-scoped work never targets `main`)
- Title carries `WHI-NNN`; the body states the resolved base and its signals, the
  evidence (SHA, commands, real results) and the role/model/effort used
- Merge strategy per [§ Merge strategy](#merge-strategy-per-lane)
- `gh` needs the right account and repo (`docs/TRAPS.md` entries 1, 2, 7)

### 4. Merge authorization

What must hold before a PR merges, and whether an agent may merge it. **Fail closed:** if a
PR fits no row, or fits a row whose conditions you cannot show, it stays at `In Review`.

| Work | Before merge | Agent may merge? |
| --- | --- | --- |
| Ordinary version issue → an existing `release/v*`, under `/orchestrate` | The issue's acceptance, the required project checks and the relevant issue checks pass on the final HEAD; PR MERGEABLE/CLEAN; the orchestrator verified the evidence | **Yes** (the orchestrator). Independent review is deferred to the release review of the whole version |
| Repo-wide governance → `main` | Required project checks, relevant checks and the full suite, plus **one independent PR review** (`/code-review`, `REVIEWER`) that passed on the final commit | **Yes**, then fan in |
| Standalone `/implement`, no release orchestration taking over | Required project checks, relevant checks and the full suite, plus **one independent PR review** that passed on the final commit | **Yes**, unless a human-gated row below applies |
| Anything touching configured high-risk paths (none — owner decision 2026-10-18) | The checks of its lane, plus a documented verification approach | **No** — human |
| `hotfix/*` → `main` | Required project checks, relevant checks, the full suite and one independent review, then a human | **No** — human |
| Finished `release/v*` → `main` | Fan-in done; the full suite (complete acceptance) and a passed release review on the **current** SHA (`/orchestrate` § Release review), then a human | **No** — human |

The content lane is not a PR row: its gates are the human gates in `AGENTS.md` (reports)
and the Daily workflow's checks (`daily/`).

- "Passed" means no unresolved blocking finding and acceptance valid on the reviewed SHA.
  A review of an earlier commit does not cover a later one.
- A human-gated or unreviewable PR stays at `In Review` with the reason recorded. If
  `REVIEWER` is unavailable, see `docs/agents/runtime.md` § Reviewer unavailable.
- Who merges: under `/orchestrate`, the orchestrator (serially, from the primary clone);
  in standalone `/implement`, the implementing agent.

#### Waiving an exception (owner decision)

An owner may waive one human-gated row for a bounded issue set. A waiver is a **PR against
every doc site that states the rule it overrides**, and it carries: **(1) scope**
recognised by machine-checkable signals (title prefix + tracker release + label);
**(2) expiry** bound to that tracker Release closing; **(3) what it does not relax**, named
one by one; **(4) the compensating control** — every acceptance criterion in a waived issue
is machine-checkable; **(5) a rationale document** under `docs/references/`.

### Post-merge cleanup (mandatory, in order)

Drive these from the **primary clone**.

0. **If the PR is CONFLICTING**: inside the feature worktree,
   `git merge origin/<resolved-base>`, resolve, rerun the affected tests, push. The PR
   must read **MERGEABLE / CLEAN** before you merge.
1. **Merge with the lane's strategy + drop the remote branch**: `gh pr merge <N> --squash
   --delete-branch` into `release/v*` or (governance) `main`; `--merge` for `hotfix/*` and
   a finished `release/v*` → `main`
2. **Remove the worktree:** `git worktree remove <worktree-path>` then `git worktree prune`
3. **Delete the local branch:** `git branch -D <branch>`
4. **Bring the primary clone's `main` up to date** (only when the merge landed on `main`):
   `git fetch origin --prune` then `git merge --ff-only origin/main`. If that refuses, the
   primary clone holds unpushed content commits made before the merge. Replay them on top:
   1. If `git status --porcelain` is not empty, park the uncommitted work as a local
      commit first — `git add -A && git commit -m "wip: local drafts (do not push)"` —
      never `git stash` (shared across worktrees, `docs/TRAPS.md` entry 9).
   2. `git rebase origin/main`. Content-only commits replay without touching code; a
      conflict means content and the merged PR touched the same file — stop and ask.
   3. If you parked drafts, `git reset --soft HEAD~1 && git restore --staged .` to turn the
      wip commit back into uncommitted work (it is the newest commit after the rebase).
   4. `pnpm rh check --no-shot`, then `git push origin main` (the hook re-checks the range).

   **Never** force-push, never merge `origin/main` into local `main` (the hook refuses merge
   commits), and never rerun `rh publish` for a report that is already committed
   (`.claude/skills/research-hub/SKILL.md`, publish recovery).
5. **Fan in whenever `main` advanced through a PR** (governance, hotfix) — in this same
   session ([§ Fan-in](#fan-in-main-into-live-version-branches))
6. **Tracker → `Done`**

### State mapping (tracker ↔ git)

| Stage | Tracker state | Git |
|-------|---------------|-----|
| Not started | `Backlog` / `Todo` | no branch |
| Implementing | `In Progress` | worktree + branch exist, no PR (or draft) |
| PR open, awaiting verification / merge | **`In Review`** | open PR → resolved base |
| Waiting for a human, or verification failed | **`In Review`**, reason recorded on the issue | open PR, not merged |
| Merged | **`Done`** | merged with the lane's strategy, cleanup done, fan-in done if the base was `main`, worktree removed |
| Abandoned | `Canceled` | PR closed, worktree removed, not merged |

## Parallel issues

- One worktree per issue → naturally parallel
- Issues touching the **same module, shared schema (`lib/schema.ts`), public interface or
  shared generated file** must not run in parallel; serialize them. "Git would merge it
  cleanly" is not evidence that two issues are independent
- An issue whose work builds on another issue's code starts only after that PR merged
- Always `git fetch` + base on `origin/<resolved-base>` before opening a new worktree

## Fan-in: `main` into live version branches

Merging `main` into every live `release/v*` keeps the version branch carrying the current
rules, hotfixes and content.

**When:**

- **Mandatory, same session:** whenever `main` advanced through a PR (governance or
  hotfix). A governance rule is in force only on branches that carry it.
- **Mandatory before** each release-review round and before opening the finished
  `release/v*` → `main` PR (the release must be reviewed against current content).
- Content-only advances may wait for those points.

**What is "live":** every `origin/release/v*` (there are no temporary cuts in this model).
Query it, do not snapshot names:

```bash
git fetch origin
git for-each-ref --format='%(refname:short)' 'refs/remotes/origin/release/v*'
```

For each, from a **temporary worktree** (the primary clone stays on `main` with content
work in progress; never switch it):

```bash
name=release/v0.1.0
git worktree add --detach ../research-hub-wt/fanin "origin/$name"
cd ../research-hub-wt/fanin
git merge origin/main      # resolve, then run the affected tests
ALLOW_DIRECT_PUSH=1 git push origin "HEAD:$name"
cd - && git worktree remove ../research-hub-wt/fanin
```

The push must fast-forward `origin/$name`; if it is rejected, someone pushed meanwhile —
remove the worktree and start over. A green suite after a conflict resolution is **not**
evidence the resolution is right: rerun the affected tests and ask of any regression test
involved whether it would fail if the fix were reverted.

## Releasing to `main`

A finished version-integration branch merges into `main` through a PR:

1. Fan in `main` ([§ Fan-in](#fan-in-main-into-live-version-branches)).
2. Full suite and a passed release review on the current SHA (`/orchestrate`).
3. `gh pr create --base main --head release/vX.Y.Z --title "release: vX.Y.Z"`; a human
   approves.
4. **Merge with a merge commit, not squash** (`gh pr merge <N> --merge`). The branch is
   deleted on merge.
5. Tag the merge commit and create the GitHub Release:
   `git fetch origin && git tag -a vX.Y.Z <merge-sha> -m "vX.Y.Z" && git push origin vX.Y.Z`.
6. CI deploys `main`; confirm the deploy run for `<merge-sha>` passed its smoke test.
7. Tracker: Release → `Released`, backfill its `commitSha` with `<merge-sha>`.

## Hotfix

**When:** production is broken and the fix cannot wait for the version in flight.

```bash
git fetch origin
git worktree add -b hotfix/whi-123-short-topic ../research-hub-wt/hotfix-whi-123 origin/main
git -C ../research-hub-wt/hotfix-whi-123 merge-base HEAD origin/main
git rev-parse origin/main
```

1. Fix **only** this one issue
2. `gh pr create --base main`, title/body carry `WHI-NNN`; tracker → `In Review`
3. Required checks, relevant checks, the full suite and one independent review pass, then
   **a human approves**. **Merge with a merge commit.**
4. Tag `vX.Y.Z.N` (four segments) on the merge commit + GitHub Release; CI deploys `main`
5. **Fan in** `main` into every live `release/v*` in the same session
6. Tracker: issue → `Done`; the hotfix Release → `Released` with its `commitSha`

## Version axis

| Place | Artifact | Question it answers |
|-------|----------|---------------------|
| Tracker | a Release (`0.1.0`, `0.1.0.1`, …) | **Plan**: which issues are in this version |
| Git | annotated tag `v0.1.0` on the merge commit in `main` | **Fact**: which tree this version is |
| GitHub | the GitHub Release on that tag | **Ship**: changelog |

- Every version-scoped issue belongs to exactly one tracker Release, matching its
  `[X.Y.Z]` title prefix. A missing or disagreeing Release is an implementation refusal.
  Governance issues have no Release.
- `package.json` carries no version; the tag is the version fact.
- Hotfixes use a four-segment version (`0.1.0.1`). Do not reuse the next minor number.
- `main` keeps receiving content after a tag, so `main` ≠ the tag tree in general; the
  tag pins the **code** of a version. `git diff vX.Y.Z origin/main -- . ':!reports' ':!daily' ':!tags.yml'`
  must be empty until the next code merge.

> **Footgun: annotated tags don't `rev-parse` to commits.** Dereference explicitly:
> `git rev-parse 'v0.1.0^{commit}'`, or ask `git merge-base --is-ancestor v0.1.0 <branch>`.

## Merge strategy (per lane)

| PR | Merge with | Why |
|----|-----------|-----|
| `feat/*` `fix/*` `chore/*` `docs/*` → `release/v*` | **squash** | One issue, one commit |
| governance `chore/*` `docs/*` → `main` | **squash** | Same |
| Finished `release/v*` → `main` | **merge commit** | Preserves the version's ancestry; the tag sits on it |
| `hotfix/*` → `main` | **merge commit** | Same |

The repo allows squash and merge commits, not rebase, and deletes branches on merge.

## Branch naming

| Type | Format | Example |
|------|--------|---------|
| Feature | `feat/whi-<id>-<topic>` | `feat/whi-1930-home-feed` |
| Fix | `fix/whi-<id>-<topic>` | `fix/whi-1940-leak-check` |
| Chore / docs | `chore/whi-<id>-<topic>` | `chore/whi-1924-adr-0003` |
| Hotfix | `hotfix/whi-<id>-<topic>` | `hotfix/whi-1950-private-gate` |
| Release | `release/v<version>` | `release/v0.1.0` |

All lowercase, words joined with `-`; one PR does one thing.

## Recommended worktree layout

```text
~/Work/src/tools/personal/
  research-hub/              # primary clone (stays on main; content lane)
  research-hub-wt/
    whi-1930/                # worktree
    fanin/                   # temporary fan-in worktree
```

## Forbidden

- Developing a code issue in the primary clone's working tree
- Pushing code, docs, skills, workflows or config directly to `main` or `release/v*`
  (always via PR; the only direct pushes are content commits to `main`, fan-in merges and
  the first push of a new `release/v*`)
- Mixing content and code in one commit or PR
- Force-pushing to `main` or `release/v*`
- Bundling unrelated issues in one PR
- Leaving the tracker in `In Progress` after the PR opens, or un-`Done` after it merges
- **Defaulting a version-scoped issue to `main`** because the release field is empty or
  the release branch does not exist — refuse and surface it
- **Creating `release/v*` as a side effect of picking up a ticket**
- Committing `.env`, API keys (Cloudflare, LLM gateway, BlockBeats) or any secret
- **Squash-merging `release/*` or `hotfix/*` into `main`**
- Landing a governance or hotfix PR on `main` without fan-in to live `release/v*` in the
  same session

## Agent / automation constraints

Implementing agents (including unattended ones) **must**:

1. Change code only inside a worktree — never in the primary clone
2. Move the tracker in lockstep: `In Progress` on start → `In Review` when the PR opens →
   `Done` only after confirming the merge and the post-merge cleanup (under `/orchestrate`
   the orchestrator owns these transitions — `docs/agents/issue-tracker.md` § Issue
   lifecycle)
3. Resolve the PR base from the [resolution table](#resolving-the-base-branch) **before**
   creating the worktree; refuse when it does not resolve to exactly one row
4. Merge only what [§ Merge authorization](#4-merge-authorization) lets an agent merge;
   independent review means a context other than the implementing one
   (`docs/agents/runtime.md`)
5. Respect module isolation when several issues run in parallel
6. Never run `rh publish` or push content unless the user explicitly asked for it
   (`AGENTS.md`); a code agent never pushes content at all
7. Never merge `release/*` or `hotfix/*` into `main` without human approval

The Daily workflow (release 0.1.0) is the only unattended writer to `main`: its commit job
adds `daily/<date>/` only and fails closed on anything else (its own issue's acceptance).

## Branch protection

Server-side protection is unavailable while the repo is private on the Free plan (GitHub
returns `403 Upgrade to GitHub Pro`). When it becomes available: on `main`, forbid
force-pushes and deletion, and do **not** require a PR (the content lane pushes directly);
on `release/v*`, forbid force-pushes and deletion only (fan-in pushes directly).

### Fallback: the local `pre-push` hook

`.githooks/pre-push` (checked in) refuses direct pushes to `main` and `release/v*`, except
a push to `main` whose commits are all non-merge content-only commits. Enable it **once in
the primary clone** — the setting lives in the shared repository config, so every worktree
inherits it:

```bash
git config core.hooksPath .githooks
```

Deliberate override for the documented cases (fan-in, first push of a new `release/v*`):

```bash
ALLOW_DIRECT_PUSH=1 git push ...
```

This guards only the local clone. It is **not** a server-side gate.

## Deviations from the template

| Template rule | Here | Why |
| --- | --- | --- |
| `main` + `dev` + `release/v*` | `main` + `release/v*`, no `dev` | `main` already carries all shippable work; the content lane publishes continuously |
| `main` only via PR | content-only commits pushed directly (hook-checked) | publishing a report is gated by 把关 ①②③, not by a PR |
| Deploy only from a tag | CI deploys every push to `main`; the tag records the code version | content must go live without a release; `main` is production by definition |
| Fan-out `dev` → `release/v*` | Fan-in `main` → `release/v*`, from a temporary worktree | `main` is the trunk; the primary clone stays on `main` |
| Temporary `release/*` cut → `main` | the integration branch itself is PRed to `main` | no `dev` to cut from |
| CI config and all skills in the carve-out | workflows and team skills are version-scoped | they build and drive this version's code |

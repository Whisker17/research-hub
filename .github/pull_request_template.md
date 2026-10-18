## Summary

<!-- What this PR does and why. Tracker issue: WHI-NNN -->

## Base branch

Resolved from `docs/GIT_WORKFLOW.md` § Resolving the base branch. **Never default to
`main`.** Content (`reports/`, `daily/`, `tags.yml`) never goes through a PR.

- [ ] `release/vX.Y.Z` (version-scoped) → merge with **squash**
- [ ] `main` (repo-wide governance carve-out only) → merge with **squash**, then fan in
- [ ] `main` (hotfix) → **merge commit** — **human gate**
- [ ] `main` (finished `release/vX.Y.Z`) → **merge commit** — **human gate**

<!-- Signals this base was derived from: title prefix `[X.Y.Z]` / tracker Release /
hotfix label / carve-out paths. -->

## Merge authorization

Row of `docs/GIT_WORKFLOW.md` § Merge authorization this PR is under:

- [ ] Ordinary version issue → `release/v*`, under `/orchestrate` (release review later)
- [ ] Governance → `main` / standalone `/implement` — independent review passed on commit: `<sha>`
- [ ] Human gate (hotfix, finished `release/v*` → `main`)

<!-- Finished `release/v*` → `main`: link the `Release X.Y.Z — orchestration` document,
the reviewed candidate H, the final review round and the last fan-in. -->

## Evidence

- Commit SHA verified:
- Commands and results (actual output or a link, not "tests pass"):
- Report / site screenshots (`rh check`, browser checks), if output changed:
- Role / model / effort used:
- New dependency or significant abstraction, and why it is needed (omit if none):

## Fan-in (any PR landing on `main`)

- [ ] After this merges, `main` is merged into every live `release/v*` **in this same
      session** (`docs/GIT_WORKFLOW.md` § Fan-in). N/A if this PR does not target `main`.

## Release / hotfix only

- [ ] `main` fanned in before the last review; the reviewed SHA is this PR's head
- [ ] Tag `vX.Y.Z` (or `vX.Y.Z.N`) planned on the merge commit + GitHub Release
- [ ] Tracker Release `commitSha` will be backfilled; deploy run for the merge commit checked

## Type

- [ ] feat
- [ ] fix
- [ ] chore
- [ ] docs
- [ ] hotfix
- [ ] release

## Checks

Tiers per `docs/GIT_WORKFLOW.md` § 2 Implement, all on the final HEAD:

- [ ] Required project checks: `pnpm verify` (CI job `verify`)
- [ ] Relevant issue checks (affected tests; `rh check <slug>` with screenshots when report
      output changes; browser checks when site pages change)
- [ ] Full suite — governance, standalone `/implement`, hotfix and release candidates only;
      N/A for an ordinary issue under `/orchestrate`
- [ ] No content (`reports/`, `daily/`, `tags.yml`) in this PR, except test fixtures
- [ ] No secret, `.env`, `.rh/` or `dist/` committed
- [ ] No new tunable parameter without a source in the spec or a decision record, or the
      deviation is explained in the Summary

## Notes

<!-- Risks, rollback plan, follow-up TODOs. Review findings consciously left unfixed go to
docs/DEFERRED_ISSUES.md in this PR, with the reason. -->

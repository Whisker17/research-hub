# code-template adoption

Source: `Whisker17/code-template`, local clone `~/Work/src/personal/code-template` at
`70b448a` (process files identical to tag `v0.2.0`), with the refinements measured in
`mantle-7702-sdk` and `mantle-router-algorithm-bench` (role bindings, process traps).
Owner decisions from the 2026-10-18 adoption session.

## Owner decisions (2026-10-18)

1. **Tracked process layer.** The process files are committed to this repository (the
   template's default), not kept in a local `.governance/` overlay as in the two work
   repositories. Consequence: no "neutral GitHub surface" rule; tracker ids, roles and
   models may appear in branch names, PRs and commits, as the template intends.
2. **Branch model:** code through `release/vX.Y.Z` integration branches, content straight
   to `main`; no `dev`. Details and the deviations table: `docs/GIT_WORKFLOW.md`.
3. **Issues** follow `docs/agents/issue-template.md` in English; the 0.1.0 issues were
   rewritten to it.
4. **High-risk paths:** none configured.

## Adopted

- Process skills `grill-me`, `to-spec`, `to-tickets`, `implement`, `orchestrate`,
  `code-review`, `handoff`, `ponytail` (template versions; `to-spec` rewritten for
  `docs/decisions/`; base/fan-out wording adapted to the no-`dev` model).
  `answer-me-with-html` is **not** vendored: `rh` already uses the user-level install
  (`rh.config.json` `amScript`).
- `docs/agents/*` (placeholders filled; `domain.md` rewritten for `docs/product-spec.md`
  + `docs/decisions/`), `docs/GIT_WORKFLOW.md` (rewritten for the content lane),
  `docs/TRAPS.md` (template header + the measured process traps), `docs/DEFERRED_ISSUES.md`
  (empty registry), `.github/pull_request_template.md` (adapted lanes),
  `.githooks/pre-push` (content-lane exception, tested by `test/pre-push.test.ts`),
  `config/agent-roles.conf`, `scripts/agent-dispatch.sh` and `test/test_agent_dispatch.py`
  (template versions), `skills-lock.json`.
- `AGENTS.md` § 开发流程 (Chinese process summary; the rest of `AGENTS.md` is unchanged).

## Not adopted

- `SETUP.md`, the Python stack layer, Docker skeletons, `CHANGELOG.md`, `config/README.md`.
- `docs/DESIGN.md`: the spec of record stays `docs/product-spec.md` + `docs/decisions/`.

## Role verification (2026-10-18)

- `scripts/agent-dispatch.sh --probe`: all three roles `ok` (static check only).
- Real calls through the dispatcher (stdin `Reply with exactly: DISPATCH-OK`), all exit 0
  and printed `DISPATCH-OK`: ORCHESTRATOR high, IMPLEMENTER high, IMPLEMENTER medium,
  REVIEWER high.
- `uv run --no-project --with pytest python -m pytest test/test_agent_dispatch.py`: 31 passed.

## GitHub

- Repository `Whisker17/research-hub` (private). `gh` must run as `Whisker17`
  (`docs/TRAPS.md` entry 7).
- Merge policy and branch protection: see the adoption PR's evidence.

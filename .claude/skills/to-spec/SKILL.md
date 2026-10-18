---
name: to-spec
description: Turn the current conversation into a spec — no interview, just synthesis of what has already been discussed. Writes a numbered decision record under docs/decisions/ (and updates the spec sections it amends) by default; publishes only as the user directs.
disable-model-invocation: true
---

This skill turns the current conversation and your understanding of the codebase into a spec (you may know it as a PRD). Do NOT interview the user — synthesize what you already know. Use `/grill-me` first if the goal, constraints or acceptance are still unclear.

## Project spec (default): a decision record

The spec of record is `docs/product-spec.md` (Chinese), amended by numbered records in `docs/decisions/` (`docs/agents/domain.md`). A new feature or change of direction is written as **the next decision record**, `docs/decisions/NNNN-<topic>.md`, in the language of the existing records (Chinese), following their shape:

- Header: status, date, the spec sections it amends.
- `## 背景` — the problem and why now.
- `## 决定` — numbered decisions. Each requirement has an objectively checkable acceptance condition and how it is verified; prefer external behaviour and existing test seams, and name the smallest check that would catch a real failure. Any tunable parameter cites its source.
- `## 不做` — explicit non-goals and rejected options, with the reason.
- `## 风险与开放问题`.
- `## 后果` — what changes for users, agents and the workflow.

Then update the sections of `docs/product-spec.md` the record amends (keep its section numbers stable; add subsections at the end of a section) and any rule in `AGENTS.md` it changes, in the same PR.

Avoid file paths and code snippets, which go stale. The exception is a snippet that pins a decision (a state machine, a schema, a type shape): trim it to the decision-rich part.

## Template or tooling spec

A spec about the process layer or tooling itself goes in its own document under `docs/references/`, never into the product spec. Its headings are free. It must still state the problem, the requirements with acceptance, the decisions, what is out of scope, and the risks.

## Publishing

Publish to the tracker (`docs/agents/issue-tracker.md`) only as the user instructs. Do not create a ready-for-agent issue by default: tickets come from `/to-tickets`.

# Domain Docs

How the engineering skills consume this repo's domain documentation.

This repo is **single-context**. Its spec of record is **`docs/product-spec.md`** (Chinese),
amended by numbered decision records in **`docs/decisions/`**. Unlike the template's
`docs/DESIGN.md`, the spec does not use the template's section layout; cite its own
section numbers.

## Before exploring, read these

- **`docs/product-spec.md`** — goal (§1), positioning (§2), the report workflow and the
  three human gates (§3), the content model (§4), the site (§5), mobile rules (§6), scope
  and non-goals (§7), acceptance (§9). It is the single source of truth for *why* the
  project is scoped the way it is.
- **`docs/decisions/NNNN-*.md`** — decisions made after v1 (site architecture, the
  language toggle and tweet card, and every later ADR). A decision record amends the
  spec; read every record that touches the area you work in. New decisions get the next
  number; the spec section they amend is updated in the same PR.
- **`AGENTS.md`** — the product rules agents must follow (rh is the only write path, rh
  never calls an LLM, default private, the claim ledger, no CSS patches in report HTML).
- **`docs/references/`** (created lazily) — prior research the project inherits from.
  Treat sourced numbers as validated inputs.

If a directory is empty or missing, proceed silently.

## File structure

```
/
├── docs/
│   ├── product-spec.md    # spec of record (Chinese)
│   ├── decisions/         # numbered decision records that amend the spec
│   ├── references/        # prior research (created lazily)
│   └── agents/            # agent operating conventions (this directory)
├── lib/ cli/ src/ worker/ scripts/ test/   # see AGENTS.md § 目录
└── reports/ daily/ tags.yml                # content (docs/GIT_WORKFLOW.md § Content lane)
```

## Use the spec's vocabulary

`docs/product-spec.md` and `AGENTS.md` fix the domain terms (brief, 把关 ①②③, 论断台账 /
claim ledger, observed / inferred / speculative, public / private site, draft /
published, tweet card). Use them as defined there; do not drift to synonyms.

## Flag design-doc conflicts

If your output contradicts the spec, a decision record, or a rule in `AGENTS.md` (for
example "rh never calls an LLM" or "no CSS patches in report HTML"), surface it
explicitly instead of silently overriding it:

> _Contradicts docs/decisions/0001 §3 ("X") — but worth reopening because…_

A change that weakens one of those rules needs a new decision record, not a code comment.

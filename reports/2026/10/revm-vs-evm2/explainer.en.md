---
template: research
lang: en
title: "EVM Execution Engines: revm, evm2, and Mantle's Execution-Layer Choice"
subtitle: evm2's real gain is in the interpreter hot path, and the only public head-to-head shows 1.10–1.19×. reth main has switched but not released. Mantle should first fix its revm stack (versions, differential tests, benchmarks), then evaluate evm2 in step with the OP upstream.
cols: 4
type: Engineering research · source comparison
audience: "Mantle devs and CTO: you know the EVM and Rust, and must decide whether the execution layer follows evm2"
scope: Source comparison of revm (Mantle on 38.0.0, main on 43.0.3) and evm2 (main c8bb5a2); public status of reth, Base, RISE, MegaETH, Foundry and Tempo; hot paths of geth, evmone, Nethermind, Besu, ethrex and revmc; gaps in Mantle's revm stack
evidence: "176-row claim ledger (observed 141 / inferred 24 / speculative 11); source at revm@ee9ab3f, v107@d629331, evm2@c8bb5a2, mantle-xyz/revm@835cb4e, mantle-xyz/reth@574e7f3; official PRs and release notes"
date: 2026-10-25 · v1
---
The short answer: evm2 does not define new EVM semantics. It is a reimplementation of revm. Its gain sits in the interpreter hot path, in three places ([F1](#F1), [F2](#F2)):

- a [[dispatch]] backend chosen at compile time;
- compile-time instruction tables per type, spec and inspection mode;
- pc, stack length and remaining gas kept in registers.

 The only public head-to-head is a 10-block mainnet replay at 1.10–1.19×. The README's "up to 2x" has no public data ([F3](#F3)).

The ecosystem moved faster than the source material says. reth main replaced revm with evm2 on 2026-10-24, but no release includes it yet ([F9](#F9)). Base only builds evm2 in parallel and runs [[differential testing]] against revm ([F11](#F11)). RISE downstreamed revm into its own VM; it did not "downgrade revm" ([F12](#F12)).

For Mantle: do not migrate the consensus path now. Do three things first ([F15](#F15)–[F18](#F18), [actions](#panel-O)): op-geth↔op-revm differential replay, a green CI on the revm fork, and a revm upgrade. Mantle is 5 majors behind.

## A revm vs evm2: engineering comparison {sheet span=4 meta="source @ 2026-10-25"}
| Dimension | revm (Mantle 38.0.0 / main 43.0.3) | evm2 (main c8bb5a2) | Verdict |
|---|---|---|---|
| Role and maturity | Semver releases, about one major per month; used by reth releases, Foundry, OP upstream | Reimplementation of revm; WIP, no release, no API stability promise | ok revm is safer |
| Interpreter dispatch | Central loop + function-pointer table; pc / stack length / gas live in `&mut Interpreter` | Backend chosen at compile time: TCO on nightly, packed on stable 64-bit; the three values stay in registers | ok evm2 is faster |
| Instruction table and spec | Runtime `Box` table; spec checked inside handlers at runtime | `const` tables per type, spec and inspect mode; inactive opcodes map to INVALID | ok evm2 is faster |
| Component boundary | Context / DB / Inspector / precompiles are all generic and monomorphized | Only the type family and tables are compile-time; DB / precompiles / Inspector / tx handlers are `dyn` | warn different trade-off |
| Custom host | Context and Handler are replaceable | Source TODO: custom hosts are not well supported yet | warn revm is more flexible |
| BAL / async DB | BAL since v107; fiber async on main (v116) | Same, same mechanism | warn on par |
| JIT / AOT | revmc maintained separately, never in a reth release | In-repo `crates/jit` (port of revmc), off by default, `BaseEvmTypes` only | warn both experimental |
| Public measurement | Baseline | 10 mainnet blocks: TCO 1.19×, packed 1.10× (vs revm 42.0.1) | warn far below 2× |
| Adoption | OP upstream, MegaETH, RISE pevm, Base node still use it | reth main switched; Foundry draft, Tempo PR, Base differential work | warn migration just started |

## B Key numbers {sheet span=2 meta="all sourced"}
| Metric | Value | Source |
|---|---|---|
| Only public evm2 vs revm comparison | 1.10× (packed) / 1.19× (TCO) | evm2#384, Ryzen 9 7950X |
| README "up to 2x" | no public data | evm2#136 |
| Dilution in block replay | benchmarks 23–34% faster → replay 4.8–6.2% faster | evm2#667 |
| reth switch to evm2 | 221 files, +17.7k / −10.9k | reth#25002, 2026-10-24 |
| Mantle revm lag | 38.0.0 → 43.0.3, 5 majors | mantle-xyz/reth Cargo.lock |
| revm major-version pace | about 1.35 per month | revm tags 2025-03 → 2026-08 |
| RISE "2×" | payload p95 mean 248 → 123 ms | hai_rise tweet chart |

## C Who is migrating, and how far {sheet span=2 meta="public evidence"}
| Project | Status |
|---|---|
| reth | ok main replaced revm with evm2; latest release v2.8.1 still on revm |
| Foundry / Tempo | warn migration PRs: draft / awaiting review |
| Base | warn evm2 crate not wired into the node; differential tests only |
| RISE | no Own closed-source RISE VM; it is not evm2 |
| MegaETH | warn public code still on revm 40.0.3; prototype signal |
| OP upstream | no Still on revm 43 + op-revm 20 |

## D Mantle's revm stack today {sheet span=2 meta="mantle-xyz/* @ 2026-10"}
```tree list
mantle-xyz/revm `v107-mantle-arsia.2` | revm 38.0.0 / op-revm 19.0.0
  Used by the mantle reth execution client | reth base v2.2.0, alloy-evm 0.34
  Used by the OP Succinct (SP1) proof path | pinned to the same tag as reth
  Mantle semantics live in op-revm handlers | about 5.7k lines: BVM_ETH / token_ratio / Arsia fees
  4 patches to core crates | the EIP-7825 patch makes EEST fail
op-geth (Go, geth 1.17.3) | the sequencer execution layer in official docs
Upstream today | revm 43; op-revm 20 now lives in the optimism repo
```

## E Conclusion {sheet span=2}
```callout ok Fix the revm stack first, then evaluate evm2 with the OP upstream
- evm2's gain is real. The size is 1.1–1.2× in interpreter replay, not 2× for a node.
- The cost of moving the consensus path is in semantics and types, not in a trait wrapper. reth needed 221 files.
- Mantle's P0: an op-geth↔op-revm differential gate, a green fork CI, and a version catch-up.
- Entry point for evm2: write Mantle semantics as VM-neutral test vectors.
```

## G How to read this {depth=1}
```callout info You already know (not explained here)
- EVM bytecode, the operand stack, gas metering and CALL frames
- Rust traits, generic monomorphization and `dyn` trait objects
- OP Stack deposit transactions and the L1 data fee
- Mantle uses OP Succinct (SP1) to produce validity proofs
```
- **5 minutes**: read the overview A–E, then [F1](#F1), [F9](#F9), [F15](#F15).
- **30 minutes**: read [Context](#panel-H) → [Background](#panel-I) → [How the hot path works](#panel-J) → [Point by point](#panel-K) → [Ecosystem](#panel-L) → [Mantle today](#panel-N) → [Actions](#panel-O).
- **Everything**: also read [Method and evidence](#panel-Q) and [Reproduce](#panel-R). The source of every claim is in `research/ledger.md`.

## H Context: why the question comes up now {depth=2}
**Trigger events**:
- On 2026-10-25, gakonst tweeted about a new EVM. He said it "just wrapped audit", has JIT built in, and will be the future of Foundry, Reth and Tempo [7].
- One day earlier, reth main merged "refactor!: replace revm with evm2" [6].
- Base added evm2 to its repo; RISE announced its own VM at 2× revm.

**Questions**:
1. What is each evm2 optimization over revm, and which line of code shows it?
2. Which revm limits are design trade-offs, and which can revm fix itself?
3. What is the real status of Base, RISE and MegaETH?
4. How do other major EVM implementations optimize the hot path?
5. What does Mantle's revm stack lack, and in what order should Mantle fix it?

**Scope and non-goals**:
- In scope: revm and evm2 architecture and source; adoption; hot paths of other EVMs; improvements for Mantle's execution layer.
- Out of scope: P2P, sync and database choices; non-EVM VMs; advice to companies other than Mantle.

**Decision criteria** (set before the results):
- A gain counts only with reproducible test conditions. We record numbers without conditions but do not use them.
- Keep "interpreter gain" and "node gain" apart.
- Keep "unique to evm2" and "also in recent revm" apart.
- On the consensus path, weigh equivalence risk; off the consensus path, weigh gain.

## I Background {depth=2}
Running example: one `ADD`. It pops two words and pushes their sum, which takes a few machine instructions. The page uses it to show where the rest of the cost comes from, and what evm2 removes.

```excalidraw q="Which concepts do you need for this page, and in what order?" read="Gray dashed boxes are assumed knowledge; blue boxes are card IDs; an arrow means learn first → learn after; the green box is the decision this page supports." takeaway="Read B-1 and B-2 first: the hot path and the framework boundary are the two lines along which revm and evm2 differ." name=prereq-map kind=prerequisite-map
{"grid": {"w": 330, "h": 120}, "defaults": {"w": 210, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "k1", "label": "EVM bytecode and gas", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "k2", "label": "Rust generics and dyn", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b1", "label": "B-1 Dispatch", "col": 1, "row": 0, "color": "blue"},
   {"id": "b4", "label": "B-4 JIT / AOT", "col": 1, "row": 1, "color": "blue"},
   {"id": "b2", "label": "B-2 revm framework", "col": 1, "row": 2, "color": "blue"},
   {"id": "b3", "label": "B-3 op-revm and L2s", "col": 1, "row": 3, "color": "blue"},
   {"id": "b5", "label": "B-5 BAL (EIP-7928)", "col": 0, "row": 3, "color": "blue"},
   {"id": "s", "label": "revm or evm2?", "col": 2, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "k1", "to": "b1"}, {"from": "b1", "to": "b4"}, {"from": "k2", "to": "b2"},
   {"from": "b2", "to": "b3"}, {"from": "b1", "to": "s"}, {"from": "b4", "to": "s"},
   {"from": "b3", "to": "s"}, {"from": "b5", "to": "b3", "dashed": true}
 ]}
```

```prereq B-1 l1 4min
# Interpreter dispatch
what: The interpreter reads an opcode, finds its handler function and calls it. How it finds and calls the handler is the dispatch method.
why: `ADD` itself is cheap, but the dispatch cost repeats hundreds of millions of times. evm2's main gain is here.
example: revm: `loop { op = code[pc]; table[op](&mut interp) }`. TCO: each handler ends with a direct jump to the next handler, with no return to a loop.
misconception: Myth: 2× faster dispatch makes the node 2× faster. Fact: block replay also includes state reads, precompiles and keccak, which dilute the gain.
deeper: alloy-rs/evm2 `crates/evm2/src/interpreter/dispatch/`
```

```prereq B-2 l1 4min
# The revm framework
what: `Evm` holds a Context (Tx / Block / Cfg / Journal / DB), an instruction table, precompiles and an Inspector. `Handler` runs a transaction in four phases: validate → pre_execution → execution → post_execution.
why: All L2 customization hooks into these extension points. The cost of moving to evm2 is mostly here, not in opcodes.
example: `Context<BlockEnv, TxEnv, CfgEnv, DB, Journal<DB>, Chain>`; state changes stay in the Journal until `finalize()`.
misconception: Myth: revm relies on runtime checks. Fact: revm components are all generics, monomorphized at compile time.
deeper: bluealloy/revm `crates/handler/src/handler.rs`
needs: B-1
```

```prereq B-3 l1 3min
# op-revm and L2 customization
what: op-revm overrides 8 Handler methods on revm to add deposit, L1 fee, operator fee and system transaction rules.
why: Mantle's BVM_ETH, token_ratio and Arsia fees live in its op-revm fork. The cost of keeping that fork sets the cost of upgrades and migration.
example: `OpTransaction { base, enveloped_tx, deposit }`; `reward_beneficiary` pays 3 vaults.
misconception: Myth: op-revm is still in the revm repo. Fact: from revm v108 it lives in ethereum-optimism/optimism.
deeper: bluealloy/revm v107 `crates/op-revm/src/handler.rs`
needs: B-2
```

```prereq B-4 3min
# JIT / AOT
what: Compile contract bytecode to machine code and run that. JIT compiles hot code at runtime; AOT compiles ahead and caches the result.
why: gakonst's tweet says the new EVM has "JIT baked in". You need to know whether that means "available in the repo" or "on by default".
misconception: Myth: having a JIT makes execution faster by default. Fact: evm2-jit is off by default, and compiles a contract in the background only after 8 misses.
deeper: alloy-rs/evm2 `crates/jit/README.md`
needs: B-1
```

```prereq B-5 2min
# BAL (Block-Level Access List)
what: EIP-7928 makes a block carry the state that each transaction reads and writes. Validators use it to run transactions in parallel, then check the BAL.
why: The GPT source treats BAL as an evm2 differentiator. revm v107 already has the same API.
misconception: Myth: a BAL comes with a parallel scheduler. Fact: evm2 and revm both give only read/write primitives; you write the scheduler.
deeper: EIP-7928 (Last Call, deadline 2026-11-01)
```

## J How the hot path works: one ADD on each side {depth=2}
First the sketch, then the code. The top row is revm; the bottom row is evm2's TCO backend.

```excalidraw q="When it runs one ADD, what does each engine do besides the add itself?" read="Top row, revm: every opcode returns to a central loop, and pc / gas / stack length go through memory (red boxes). Bottom row, evm2 TCO: the values stay in registers and each handler tail-jumps to the next one (green boxes). Simplified; the Inspector path is left out." takeaway="evm2 does not make ADD cheaper. It removes the fixed cost around every opcode." kind=hot-path
{"grid": {"w": 410, "h": 150}, "defaults": {"w": 240, "h": 72, "fontSize": 16},
 "nodes": [
   {"id": "r1", "label": "run_plain loop\nread opcode, pc += 1", "col": 0, "row": 0, "color": "blue"},
   {"id": "r2", "label": "look up fn + gas tables\ncharge gas (memory)", "col": 1, "row": 0, "color": "red"},
   {"id": "r3", "label": "handler(&mut Interpreter)\nstack len, spec check", "col": 2, "row": 0, "color": "red"},
   {"id": "e1", "label": "dispatch::<ADD>\n(pc, stack, gas) in registers", "col": 0, "row": 1, "color": "green"},
   {"id": "e2", "label": "compile-time constants\nstatic gas, no spec check", "col": 1, "row": 1, "color": "green"},
   {"id": "e3", "label": "become\nnext opcode's handler", "col": 2, "row": 1, "color": "green"}
 ],
 "edges": [
   {"from": "r1", "to": "r2", "label": "per opcode"},
   {"from": "r2", "to": "r3", "label": "indirect call"},
   {"from": "e1", "to": "e2", "label": "charge gas"},
   {"from": "e2", "to": "e3", "label": "tail call"}
 ],
 "texts": [
   {"x": 830, "y": 100, "text": "ret + Result → back to loop", "fontSize": 14, "color": "red"}
 ]}
```

One step on revm main (Mantle's v107 has the same structure, but keeps gas and the function pointer in one struct [2]):

```rust src=research/code/revm@ee9ab3f--interpreter.rs lines=295-321 hl=302,307,309,310,317
```

For each opcode revm reads the opcode, writes back pc, looks up two tables, charges gas, builds an `InstructionContext` and makes one indirect call. The handler gets `&mut Interpreter`, so the compiler cannot keep pc, stack length and gas in registers across that call (ledger H3, inferred).

evm2's TCO backend (nightly rustc): one function per opcode, monomorphized on `const OP`, ending in a tail jump.

```rust src=research/code/evm2@c8bb5a2--dispatch-tco.rs lines=43-56
```

```rust src=research/code/evm2@c8bb5a2--dispatch-tco.rs lines=96-111 hl=109,110
```

The packed backend on stable rustc packs the pc pointer and the stack length into one `usize`, which handlers take and return by value.

```rust src=research/code/evm2@c8bb5a2--dispatch-table-packed.rs lines=130-162 hl=133,137,157
```

`build.rs` picks the backend **at compile time**. It is not a runtime switch:

```uml q="Which dispatch backend does evm2 use, and what decides it?" read="build.rs reads the environment variable EVM2_DISPATCH_BACKEND, default auto. The result becomes a cfg flag; it cannot change at runtime." takeaway="On a non-wasm 64-bit target, a stable build gets packed; TCO needs a nightly build."
flowchart TD
  s["build.rs: EVM2_DISPATCH_BACKEND (default auto)"] --> w{"wasm target?"}
  w -- yes --> sr["single_return"]
  w -- no --> n{"nightly rustc and no no-tco?"}
  n -- yes --> t["tco: become tail call"]
  n -- no --> p{"64-bit target?"}
  p -- yes --> pk["packed: pc and stack length packed, gas returned"]
  p -- no --> up["unpacked"]
```

```rust src=research/code/evm2@c8bb5a2--build.rs lines=57-73
```

## K evm2 optimizations, point by point {depth=2}
The table splits each optimization into "what evm2 does / the revm equivalent / can revm catch up". The last column is our judgement (ledger H43, X27, X34); the evidence IDs are in brackets.

| Point | evm2 | revm equivalent | Can revm catch up |
|---|---|---|---|
| 1 Dispatch shape | TCO tail calls (nightly) or packed loop (stable) | Central loop + indirect call | warn possible; three PRs not merged (H41) |
| 2 pc / stack length / gas | Passed by value in registers | Fields of `&mut Interpreter` | warn every handler signature changes (H43) |
| 3 Tables and spec | `const` tables per type, spec, mode | Runtime Box table + `check!` | warn conflicts with `insert_instruction` |
| 4 Static gas | Compile-time constant | Runtime `[u16;256]` lookup | warn same as 3 |
| 5 Stack layout | 32-byte aligned + 32-byte stores | `Vec<U256>` | ok local change (H18) |
| 6 CALL and memory | Recursive calls, memory per frame | Box + Suspend, shared memory | no rejected by maintainer (H42) |
| 7 Jumpdest analysis | SIMD + lazy | Ported to main; scalar in v107 | ok already caught up (H21) |
| 8 Custom boundary | Type family + `dyn` components | All generics | warn different direction, not better or worse (X14) |
| 9 BAL | Read/write primitives, no scheduler | Same API since v107 | ok already there (X26) |
| 10 Async host | corosensei fibers | Same mechanism on main v116 | ok already there (X33) |
| 11 Inspector | Two tables; `dyn` when tracing | Two loops; generics | ok zero cost on both (X36) |
| 12 JIT / AOT | In-repo `crates/jit`, off by default | revmc, separate | warn both experimental (H22) |

```finding F1 high
# evm2's real gain is in the interpreter hot path
claim: Compared with revm, evm2 removes four costs: memory round trips for pc, stack length and gas; the runtime gas-table lookup; the spec branch inside gated opcodes; and, with TCO, the call/ret of the central loop.
evidence: [observed] revm `interpreter.rs:295-342@ee9ab3f`; evm2 `dispatch/tco.rs`, `table/packed.rs`, `dispatch/mod.rs:57-80@c8bb5a2` (ledger H2, H12–H17). [inferred] The list of savings comes from comparing the two structures (H20).
implication: The gain depends on the workload. Compute-heavy contracts with many short opcodes gain most; blocks dominated by state reads and writes gain least.
```

```finding F2 high
# The backend is fixed at compile time: packed on stable 64-bit, TCO needs nightly
claim: `EVM2_DISPATCH_BACKEND` is a build-time variable read by build.rs. Default rule: wasm → single_return, nightly rustc → tco, 64-bit → packed. The `nightly` cargo feature has nothing to do with TCO.
evidence: [observed] `evm2/crates/evm2/build.rs:21,41-72,88-97@c8bb5a2`; the `nightly` feature in `Cargo.toml` (ledger H9–H11).
implication: On a non-wasm 64-bit target, a stable build gets packed (1.10× in evm2#384). To use TCO, the nightly toolchain must be part of a reproducible build.
```

```finding F3 high
# "Up to 2x" has no public data; the only public comparison is 1.10–1.19×
claim: evm2#136 added "up to 2x" to the README with no data. evm2#384 is the only head-to-head. Conditions: 10 mainnet blocks (2,279 transactions), Ryzen 9 7950X, against revm 42.0.1. Results: TCO 145.89 vs 173.32 ms (1.19×), packed 156.76 vs 171.81 ms (1.10×).
evidence: [observed] alloy-rs/evm2#136 and #384 PR bodies (ledger H34, H35). [observed] #667 / #693 / #745 after #384 compare only against older evm2 (H36).
implication: Quote "1.1–1.2× in replay", not "2×". Mantle must measure the current ratio against revm 43 in-house (see [Reproduce](#panel-R)).
```

```finding F4 medium
# Single optimizations shrink in block replay and depend on code layout
claim: evm2#667 made snailtracer, burntpix and erc20_transfer 23–34% faster; the same change made mainnet replay only 4.8–6.2% faster. #745 reports that with `target-cpu=native`, editing an unrelated cold function moved snailtracer by 8.5%.
evidence: [observed] alloy-rs/evm2#667 and #745 PR bodies, criterion medians on Zen 5 / Zen 4 (ledger H37, H38).
implication: Fix the compiler flags and the machine for any evaluation, and replay Mantle's own blocks. Do not rely on single-contract benchmarks.
```

```finding F5 high
# evm2 is not "more compile-time" than revm: components are dyn, custom hosts are not supported yet
claim: evm2 makes the type family (10 associated types on `EvmTypesHost`) and the instruction tables compile-time. DB, precompiles, Inspector and the JIT runner are `Box<dyn>`; transactions dispatch through `HashMap<u8, Arc<dyn ErasedTxHandler>>` keyed by type byte; evm2 can assert `Send` only at runtime. A source TODO says custom hosts are not well supported yet.
evidence: [observed] `evm2/src/evm/config.rs:20-57`, `evm/mod.rs:207-238,616-644`, `evm/registry.rs:350-352@c8bb5a2` (ledger X9–X13, X15). [inferred] The direction is the reverse of revm (X14).
implication: The GPT source's "evm2 is more compile-time" is wrong. An L2 customizes evm2 with a type family, registered tx handlers and `TxHandlerHooks`; Base already uses these for deposits and the L1 fee (X16).
```

```rust src=research/code/evm2@c8bb5a2--evm-config.rs lines=20-57 hl=20,53,57
```

```finding F6 high
# BAL, async DB and the split Inspector path are not unique to evm2, so they are no reason to migrate
claim: revm v107 already has the same BAL build and read API; revm main (v116, #3709) uses the same corosensei fibers for async DB; both engines split the tracing path from the plain path. evm2's parallel BAL example has no scheduler and no conflict detection; it only validates the BAL.
evidence: [observed] revm `crates/state/src/bal.rs`, `database/interface/src/async_db.rs@ee9ab3f`; evm2 `examples/bal_parallel.rs:64-101@c8bb5a2` (ledger X24–X26, X31–X33, X36). [inferred] X27, X34.
implication: Mantle's v107 already has BAL and the split Inspector path. Only the fiber-based async DB needs an upgrade to revm main (v116); v107 has a blocking `block_on` wrapper (X32).
```

```uml q="What does evm2's parallel BAL example actually do?" read="The main thread starts one thread and one fresh EVM per transaction. A worker reads earlier transactions' writes only from the block BAL. Results are detached back to the main thread, folded in order, and asserted equal to the block BAL." takeaway="This is BAL validation, not a scheduler: no conflict detection, no re-execution."
sequenceDiagram
  autonumber
  participant M as Main thread
  participant W as Worker i (own EVM)
  participant B as Block BAL (read-only)
  M->>W: spawn(tx_i, index = i+1)
  W->>B: read writes before index i+1
  W-->>M: transact().detach() → PendingState
  M->>M: commit to a new BAL in tx order
  M->>M: assert_eq!(new BAL, block BAL)
```

```rust src=research/code/evm2@c8bb5a2--bal_parallel.rs lines=64-85 hl=64,85
```

```finding F7 high
# The JIT is a port of revmc: off by default, BaseEvmTypes only
claim: evm2#207 ported revmc into `crates/jit` (same main author, DaniPopes); the backend is LLVM 23. Default `enabled: false`. When enabled, a contract compiles in the background after 8 misses, with up to 4 workers and a 1 GiB resident cache. The JIT context accepts only `BaseEvmTypes`. Default `single_error=true` reports every failure as OutOfGas.
evidence: [observed] evm2#207; `crates/jit/runtime/src/runtime/config.rs:211,217,372,382`, `jit/context/src/lib.rs:45`, `runtime/src/evm2_evm.rs:29@c8bb5a2` (ledger H22–H27). [inferred] "JIT baked in" means in-repo plus a first-class hook, not on by default (H31).
implication: An L2 with custom types, such as Mantle's op-revm semantics, cannot use the evm2 JIT today. Pilot JIT off the consensus path first.
```

```rust src=research/code/evm2@c8bb5a2--jit-runtime-config.rs lines=208-218 hl=211,217
```

**revm's limits, split into "trade-off" and "fixable"** (ledger X39, X43, H41–H43):
- Design trade-offs: handlers take `&mut Interpreter`; the instruction table is a mutable Box; spec checks run inside handlers; all frames share one memory and the frame stack is non-recursive; generic parameters leak into the API; public traits expose interpreter internals (#3776 reports UB through the safe API).
- Already fixed inside revm: async DB (v116), BAL (v107+), `account-ext`, SIMD jumpdest analysis (#3947, ported from evm2), split instruction and gas tables (#3561).
- Possible but not merged: tail-call dispatch, tried three times (#2778, #3307, #3556). #3556 measured snailtracer 8.7% faster; CodSpeed reported a 3.76% overall regression.
- Rejected by the maintainer: replacing SharedMemory with memory per frame (#3601). DaniPopes created the evm2 repo one week later (2026-04-30).
- Pace: about 1.35 revm major versions per month; 12 of the 22 tags from v99 to v120 mark API-breaking changes.

```finding F8 medium
# revm's hot-path limits come from API conventions, not from what is technically possible
claim: revm can implement TCO, register passing and compile-time opcode constants (#3556 had an implementation). The obstacle: these changes alter every handler signature and the customization model, so they break the API. The maintainer already rejected the memory change.
evidence: [observed] bluealloy/revm#3556, #3601, `crates/handler/src/instructions.rs:26-38,99@ee9ab3f` (ledger H5, H41, H42). [inferred] H43.
implication: "revm is bad" is not accurate. Accurate: revm puts a general extension model and compatibility first; the evm2 team chose a new repo to drop those constraints.
```

## L Ecosystem: who actually migrated {depth=2}
```timeline v
2024-10-15 | RISE pevm#382 | says sequential-first revm adds too much overhead and type conversion
2026-04-23 | revm#3601 rejected | memory-per-frame proposal rejected by the maintainer
2026-04-30 | evm2 repo created | first commit by DaniPopes
2026-06-27 | evm2 JIT | revmc ported into crates/jit
2026-08-26 | Base evm2 scaffold | not wired into the node; differential tests only
2026-09-06 | evm2#384 | only public comparison: 1.10–1.19×
2026-10-20 | RISE tweet | own RISE VM, payload p95 248 → 123 ms
*2026-10-24 | reth#25002 merged to main | revm replaced by evm2
2026-10-25 | gakonst tweet | new EVM just wrapped audit, JIT built in
```

```finding F9 high
# reth main replaced revm with evm2, but no release contains it
claim: paradigmxyz/reth#25002 (onbjerg) merged into main on 2026-10-24 09:15 UTC: 221 files, +17,698 / −10,870. After it, Cargo.lock has no revm, alloy-evm or op-revm. The default build includes the JIT, but `--jit` is off at runtime by default. The latest release, v2.8.1 (2026-10-23), predates the merge.
evidence: [observed] `gh pr view 25002`; `paradigmxyz/reth/Cargo.toml:441-443@f90ed27`; `crates/node/core/src/args/jit.rs:12`; `gh release list` (ledger A8, A10, A11, M26).
implication: This is the biggest fact the source material missed. evm2 has passed Paradigm's own integration bar, but the OP upstream is still on revm 43 + op-revm 20 (M23).
```

```finding F10 medium
# gakonst's "new EVM" is very likely evm2; "just wrapped audit" has no public report
claim: The tweet names no project. Paradigm / Tempo engineers maintain evm2, revm's author rakita is a CODEOWNER, and the JIT comes from revmc; the tweet came about 18 hours after the reth merge. In 2026-10 a set of "integration audit fixes" with IDs SIGP-xxx landed, but no audit report is in the repo.
evidence: [observed] tweet text via fxtwitter; evm2 commit 06ee806; tempo#8320; evm2#731 (ledger A1, A4, A5, A14, A15). [inferred] "= evm2" (A9). [speculative] The auditor may be Sigma Prime (A16).
implication: Until an audit report is public, do not treat "audited" as a reason to adopt. The `evm2` crate on crates.io is only a 0.0.0-reserved placeholder (A3).
```

```finding F11 high
# Base: parallel development and differential tests, no switch
claim: `base-common-evm2` implements a block executor, deposits and L1 / operator fees, with 8 parity test files against revm. But no other crate in the workspace depends on it; the node still runs `BaseEvmConfig` → `BaseEvmFactory` (alloy-evm + revm 43.0.3); the crate README says "intentionally not wired into the node"; EIP-8130 transactions are not supported on the evm2 path.
evidence: [observed] `base/base/crates/common/evm2/README.md:15-18`, `src/executor.rs:121`, `crates/common/evm/src/factory.rs`@bcd96e2; Base PRs #4693, #4788, #4803 (ledger A17–A22). [inferred] A23, A24.
implication: Base gives a low-risk evaluation template: a separate crate plus parity tests against revm, without touching the node.
```

```finding F12 high
# RISE: revm downstreamed into a closed-source RISE VM, not a revm downgrade
claim: The tweet says "downstream revm into our own RISE VM", with register optimizations, opcode fusion, inlining and caching. The 2× is whole-node payload latency p95 (1-hour window, mean 248 ms vs 123 ms), with no hardware, load or revm version. pevm's revm dependency went from 19.4.0 up to 38.0.0 and never went back.
evidence: [observed] hai_rise tweet and chart; `risechain/pevm` `git log -p -- Cargo.toml`; pevm#382 (ledger A25–A27, A29). [inferred] The "downgrade" story has no evidence (A28).
implication: Do not compare RISE's number with evm2's 1.1–1.2×: node p95 and EVM replay measure different things.
```

```finding F13 medium
# MegaETH: public code is still on revm and its revm fork is growing; one prototype signal
claim: mega-evm depends on revm =40.0.3 and op-revm from the optimism repo; its spec says "built on revm and op-revm"; it keeps a revm fork based on v112 with added hooks. RealiCZ, mega-evm's top committer, wrote in evm2#387 / #388 that they prototyped porting "an OP-stack-style L2" with a second gas dimension onto evm2.
evidence: [observed] `megaeth-labs/mega-evm/Cargo.toml:139-146`, `docs/spec/overview.md:13`@821577d; evm2#387, #388; megaeth-labs/revm #56, #76 (ledger A31–A35). [inferred] A36.
implication: No public source supports an internal migration plan ([speculative] A37). Public activity shows continued short-term investment in revm.
```

## M Other major EVM implementations: they all optimize the same things {depth=2}
| Implementation | Hot path | Validation |
|---|---|---|
| geth core/vm | Generated dense switch + PGO inlining; two-level jumpdest cache; parallel prefetcher | Old and new loops diffed and fuzzed in every CI run |
| evmone | Baseline + computed goto; Advanced precomputes gas / stack per block | EVMC interface |
| Nethermind | Function-pointer table; aligned stack pool; parallel prewarm; BAL parallel validation | README says prewarm roughly halves time, no conditions |
| Besu | Experimental EVM v2: `long[]` stack, hot opcodes inlined in a switch | v1↔v2 differential tests; all 52 injected bugs caught |
| ethrex LEVM | Static per-fork function-pointer table + stack pool | EELS + ethereum/tests |
| revmc | LLVM JIT / AOT, experimental | Never in a reth release |

```finding F14 high
# Common pattern: dispatch shape, stack reuse, jumpdest caching, parallel prewarm, plus old-vs-new interpreter diffs
claim: geth #35638 keeps the old loop as a reference and runs diff and fuzz tests in every CI run. Besu #11524 diffs v1↔v2 per opcode and on random programs, and caught all 52 injected bugs. Besu v2 is 2.53× faster on arithmetic in JMH single-opcode micro-benchmarks.
evidence: [observed] go-ethereum `core/vm/interpreter.go:134-137@2006f08` and PR #35638; besu PR #11524 (ledger M31, M32, M35, M36). [observed] evmone, Nethermind and ethrex source (M33, M34, M37).
implication: The recent geth and Besu rewrites both keep old and new paths side by side with continuous diffs. Whether Mantle upgrades revm or evaluates evm2, it needs this first.
```

The current EIP-7904 measured 6 full clients against a 100 Mgas/s target and decided not to change the gas table. reth is the worst client only on `ECPAIRING_BASE`, roughly tied with ethrex (ledger M39). The GPT source mixed this up with an older report on "7 standalone EVMs, revm 18" (M40).

## N Mantle's revm stack: status and gaps {depth=2}
```excalidraw q="What does each of Mantle's three executors use, and where is the equivalence risk?" read="Left, op-geth is the sequencer execution layer in the official docs (Go). Middle, mantle reth, and right, the SP1 proof program, use the same op-revm fork (Rust). The red dashed edge is a boundary that must match block by block but has no continuous diff today." takeaway="Mantle's most urgent equivalence risk is between Go and Rust, not between revm and evm2." kind=executor-topology
{"grid": {"w": 420, "h": 160}, "defaults": {"w": 240, "h": 74, "fontSize": 16},
 "nodes": [
   {"id": "g", "label": "op-geth (geth 1.17.3)\nsequencer in the docs", "col": 0, "row": 0, "color": "blue"},
   {"id": "r", "label": "mantle reth v2.2.0\nop-revm fork (revm 38)", "col": 1, "row": 0, "color": "blue"},
   {"id": "p", "label": "OP Succinct / SP1\nsame op-revm fork", "col": 2, "row": 0, "color": "violet"},
   {"id": "s", "label": "Mantle semantics\nBVM_ETH / token_ratio / Arsia", "col": 1, "row": 1, "color": "yellow", "w": 290}
 ],
 "edges": [
   {"from": "g", "to": "r", "label": "must match", "dashed": true, "strokeColor": "red", "arrow": "both"},
   {"from": "r", "to": "p", "label": "same tag"},
   {"from": "s", "to": "r", "label": "handlers"},
   {"from": "s", "to": "g", "label": "second Go copy", "dashed": true}
 ]}
```

```finding F15 high
# One revm fork serves both the execution client and the ZK proof path
claim: mantle-xyz/reth and mantle-xyz/op-succinct both pin `mantle-xyz/revm` tag `v107-mantle-arsia.2` (revm 38.0.0 / op-revm 19.0.0 / revm-interpreter 35.0.1). `mantle-reth/` has no custom executor; Mantle semantics live in op-revm handlers (about 5.7k lines). The official docs name op-geth as the sequencer execution layer.
evidence: [observed] `mantle-xyz/reth/Cargo.toml:242-264`, `Cargo.lock`@574e7f3; `mantle-xyz/op-succinct/Cargo.toml:178-189@8d280de`; the `mantle-xyz/revm` diff; docs.mantle.xyz Node Introduction (ledger M1, M3, M4, M11, M14). [inferred] op-revm's output decides whether a proof holds (M13).
implication: Any change to the revm version or semantics hits block validation and proving at once. The three repos must upgrade in lockstep (M44).
```

```finding F16 high
# The fork's EEST and cargo-deny CI jobs are both red
claim: The fork patches 4 places in core crates. One patch changes the EIP-7825 transaction gas cap default to `u64::MAX` for every chain, which fails the EEST Osaka cases. cargo-deny reports RUSTSEC-2026-0220 (ruint < 1.20.0); mantle reth's lockfile has ruint 1.18.0.
evidence: [observed] `mantle-xyz/revm/crates/context/src/cfg.rs:425@835cb4e`; GitHub Actions runs 35086043320 and 37723171335; `mantle-xyz/reth/Cargo.lock` (ledger M6, M8, M9).
implication: The fork has no green signal from upstream conformance tests today. The patch can become a config value (M10).
```

```rust src=research/code/mantle-revm@835cb4e--context-cfg.rs lines=422-427 hl=424,426
```

```finding F17 high
# 5 major versions behind, and op-revm has a new upstream
claim: Mantle: revm 38 / alloy-evm 0.34 / reth v2.2.0. OP upstream (optimism develop): revm 43.0.2 / alloy-evm 0.39 / op-revm 20.0.0 / reth op-v2.6.0-1. From revm v108, op-revm lives in ethereum-optimism/optimism.
evidence: [observed] revm v108 release notes (#3568); `ethereum-optimism/optimism rust/Cargo.toml@b84018de4`; revm tags (ledger M22, M23, X40).
implication: The right upgrade target is the OP upstream combination, not revm alone. Upstream release notes give no end-to-end speedup, so the reasons are security, maintainability and alignment with OP, not a performance promise (M24).
```

```finding F18 high
# The current abstraction cannot swap the VM; no continuous diff and no execution benchmark
claim: Mantle reth runs execution through alloy-evm's `EvmFactory`, but that trait and Mantle's bounds name revm types directly. Current conformance tests are a gasUsed replay of 7 mainnet transaction fixtures plus smoke acceptance tests. The repo has no execution-layer or block-replay benchmark.
evidence: [observed] `alloy-rs/evm/crates/evm/src/evm.rs:7,259@v0.34.0`; `op-reth/crates/evm/src/lib.rs:206-212@574e7f3`; `integration-tests/tests/replay.rs` (ledger M19–M21). [inferred] M27.
implication: The GPT source proposes a new `MantleEvm` trait. reth's full replacement (221 files) shows the cost is in semantics and types; one more trait layer does not remove it.
```

## O What it means for Mantle: actions {depth=2}
These actions follow from the ledger (inferred), in priority order.

```excalidraw q="In what order should Mantle improve its execution layer, and when should it evaluate evm2?" read="Left to right is the order. Green boxes are work to start now; the yellow diamond is a decision point, and both conditions must hold before an evm2 evaluation." takeaway="evm2 comes after the decision point. The work before it is needed whichever VM Mantle picks." kind=roadmap
{"grid": {"w": 340, "h": 160}, "defaults": {"w": 220, "h": 78, "fontSize": 16},
 "nodes": [
   {"id": "p0", "label": "P0\ndiff gate + green CI", "col": 0, "row": 0, "color": "green", "strokeWidth": 3},
   {"id": "p1", "label": "P1\nmatch OP upstream\n+ replay benchmark", "col": 1, "row": 0, "color": "green"},
   {"id": "d", "label": "Interpreter is\nthe bottleneck?\nOP followed?", "col": 2, "row": 0, "shape": "diamond", "color": "yellow", "w": 250, "h": 150},
   {"id": "e", "label": "evaluate evm2\nreuse test vectors", "col": 3, "row": 0, "color": "blue"}
 ],
 "edges": [
   {"from": "p0", "to": "p1"}, {"from": "p1", "to": "d"}, {"from": "d", "to": "e", "label": "both"}
 ]}
```

**P0 (now)**
1. Make op-geth↔op-revm block-by-block differential replay a release gate (ledger M18–M20, M43).
   - Replay a range of mainnet blocks every day.
   - Add blocks with deposits, BVM_ETH and token_ratio changes.
   - Compare receipts and state roots.
2. Make the mantle-xyz/revm CI green. Remove the EIP-7825 core patch and set `tx_gas_limit_cap = Some(u64::MAX)` when you build `CfgEnv`. Upgrade ruint to 1.20.0 or later (M8–M10).
3. Bring core-crate patches to zero. Send `Gas::set_limit` upstream or avoid it inside op-revm; the SSTORE fix is already upstream as #3746 (M6, M7).

**P1 (next upgrade cycle)**
4. Upgrade to the OP upstream set as one unit: revm 43 / alloy-evm 0.39 / op-revm 20 (M23).
   - Move the reth, mantle-v2/rust and op-succinct tags in lockstep (M44).
5. Build an execution replay benchmark. Replay Mantle blocks on a fixed machine and record EVM execution, state reads, trie and persistence separately. First answer: what share is the interpreter?
6. Set the evm2 policy. Keep the consensus path with the OP upstream. Now, write Mantle semantics as VM-neutral test vectors; they are also the corpus for action 1 (M27).

**P2 (after data)**
7. Confirm that production reth does not disable prewarming, and add hit-rate metrics for prewarm and the precompile cache (M28).
8. Pilot JIT only off the consensus path, such as `eth_call` and simulation. Keep JIT out of the consensus path and the SP1 proof program (H26).
9. At the next op-geth rebase, take geth's 2026 interpreter work and its differential tests (M30). That work is the PGO switch, the in-place stack and the layered jumpdest cache.

```callout warn CAUTION
Do not estimate Mantle's gain from evm2's "up to 2x" or RISE's "2×". The first has no public data; the second is whole-node p95 for a closed-source VM, a different metric.
```

## P Limits and open questions {depth=2}
**Speculative, not used as conclusions on this page**:
- On Mantle mainnet, reth serves as RPC or verifier, not as sequencer (M17).
- At 60M gas per 2-second block, peak demand is about 30 Mgas/s. That is below EIP-7904's 100 Mgas/s target, so the interpreter may not be the bottleneck today (M41).
- The sequencer's block-building path may not benefit from the engine's parallel prewarm (M42).
- "Up to 2x" may come from internal runs of compute-heavy benchmarks such as snailtracer (H39).
- The JIT's `single_error` may change only trace / RPC error reasons, not state (H28).
- MegaETH has an internal evm2 migration plan (A37); revm investment may decline (A41); revm's fiber async is a port from evm2 (X35); some Mantle core patches could become evm2 handlers (X41).

**Threats to validity**:
- We ran no local benchmark: the evm2 bench build depends on `mcl_rust`, which needs cmake. All performance numbers come from project PRs, with conditions given in each finding.
- GitHub code search covers only default branches, so we may undercount evm2's dependents.
- We have no first-hand operations data on the mainnet sequencer or production flags.

**Open questions**:
1. What is the current ratio of evm2 against revm 43, and against Mantle's revm 38, on Mantle blocks?
2. Will the OP upstream (op-reth / op-revm) follow evm2, and when?
3. When will evm2-jit support custom `EvmTypes`?
4. Who ran the audit gakonst mentioned, what was its scope, and will the report be public?
5. In Mantle block processing, what shares go to the EVM interpreter, state reads and the trie?

## Q Method and evidence {depth=3}
- We used the external research (ChatGPT Deep Research, `research/gpt-deep-research.md`) only as leads. We traced every claim to source code, an official PR, release notes or official docs.
- Four parallel research lanes, with notes in `research/notes-{hotpath,extension,adoption,mantle}.md` and one merged ledger, `research/ledger.md` (176 rows).
- Source versions: revm main `ee9ab3f` (43.0.3), v107 `d629331` (38.0.0); evm2 `c8bb5a2`; mantle-xyz/revm `835cb4e`; mantle-xyz/reth `574e7f3`; reth main `f90ed27`; base/base `bcd96e2`; mega-evm `821577d`; pevm `e94b0e3`.
- The main session spot-checked reth#25002, evm2#384, the `EvmTypesHost` TODO, the JIT defaults, the Base README, and Mantle's 7825 patch with its CI log.

Main corrections to the GPT source:
- It missed that reth main switched to evm2 and that op-revm left bluealloy/revm.
- "evm2 is compile-time, revm is runtime" has the direction wrong ([F5](#F5)).
- It treated BAL and async DB as evm2 differentiators ([F6](#F6)).
- The packed cursor has no "dispatch metadata"; `EVM2_DISPATCH_BACKEND` is a build-time variable ([F2](#F2)).
- It did not say the only public comparison is 1.10–1.19× ([F3](#F3)).
- Base uses revm 43.0.3, not 42.0.1; RISE did not downgrade.
- It proposed a new `MantleEvm` trait ([F18](#F18)); most of its "optimizations to adopt" already exist in revm 38 / reth v2.2.0.
- It mixed two EIP-7904 documents; its PropAMM / JIT Router advice has no primary source and was not used.

## R Reproduce {depth=3}
```bash title="Check that reth switched to evm2"
gh pr view 25002 -R paradigmxyz/reth --json state,mergedAt,changedFiles
# expected: MERGED, 2026-10-24T09:15:08Z, 221
```

```bash title="Check the only public evm2 vs revm data"
gh pr view 384 -R alloy-rs/evm2 --json body --jq .body | grep -E '7950X|1\.19|1\.10'
```

```bash title="Run the evm2 vs revm side-by-side bench on x86-64 (needs cmake)"
git clone https://github.com/alloy-rs/evm2 && cd evm2
EVM2_BENCH_REVM=1 cargo bench -p evm2-cli --bench evm -- mainnet           # stable → packed
EVM2_BENCH_REVM=1 cargo +nightly bench -p evm2-cli --bench evm -- mainnet  # nightly → tco
```

```bash title="Check Mantle's fork version and patch"
grep -A2 -E '^name = "(revm|op-revm)"$' mantle-xyz/reth/Cargo.lock
git -C mantle-xyz/revm show v107-mantle-arsia.2:crates/context/src/cfg.rs | grep -n -A2 'MANTLE'
```

## S Glossary {depth=2}
```glossary
dispatch | interpreter dispatch | How the interpreter finds and calls the handler for the current opcode. | not transaction scheduling
TCO | tail-call dispatch | Each handler ends with `become`, a direct jump to the next handler, with no return to a central loop; evm2 enables it only on nightly rustc. | not JIT
packed | packed backend | evm2's default on stable 64-bit targets: the pc pointer shifted left by 11 bits plus the stack length in one `usize`, with remaining gas returned separately. | not compressed bytecode
monomorphization | | Rust generates one copy of the code per set of concrete type parameters, so calls skip the vtable. | the opposite of `dyn`
dyn | trait object, type erasure | A trait object called through a vtable at runtime. | the opposite of monomorphization
Handler | revm Handler | The revm trait that runs a transaction as validate → pre_execution → execution → post_execution. | not an opcode handler
Journal | journaled state | The in-memory layer that records state changes and revert entries; revm reuses it across transactions, evm2 detaches it per transaction. | not the database
op-revm | | The OP Stack extension of revm: deposits, L1 fee, operator fee; in the optimism repo from v108. | not op-geth
BAL | Block-Level Access List, EIP-7928 | A per-block list of state accesses that validators use to execute in parallel and then check. | not the EIP-2930 transaction access list
JIT | just-in-time compilation | Compiles hot contracts to machine code at runtime. | not TCO
AOT | ahead-of-time compilation | Compiles contracts ahead and caches the result. |
EEST | Ethereum Execution Spec Tests | The official Ethereum execution-layer test fixtures. |
differential testing | parity testing | Run two implementations on the same input and compare every output. | not unit testing
prewarming | parallel prewarm | Runs transactions in parallel before the main loop to load state into caches. | not parallel execution
EIP-7825 | transaction gas cap | The per-transaction gas cap added in Osaka. |
revmc | | Paradigm's EVM-to-LLVM JIT/AOT compiler; evm2-jit is a port of it. |
```

## T References {depth=2}
1. **PRIMARY** alloy-rs/evm2 @ c8bb5a2: README, AGENTS.md, `crates/evm2/{build.rs,src/interpreter/dispatch,src/evm}`, `crates/jit`, `examples/{custom_evm,bal_parallel.rs}`. Read for the actual hot path and customization boundary.
2. **PRIMARY** bluealloy/revm main @ ee9ab3f and tag v107 @ d629331: `crates/interpreter`, `crates/handler`, `crates/context`, CHANGELOG. Read for Mantle's baseline and the upstream gap.
3. **PRIMARY** alloy-rs/evm2#384: the only public evm2 vs revm replay comparison.
4. **PRIMARY** alloy-rs/evm2#136, #207, #667, #693, #745: source of the 2x claim, the JIT port, evm2's own iteration data.
5. **PRIMARY** bluealloy/revm#2140, #2778, #3307, #3556, #3601, #3558, #3561, #3709, #3947, #3776: revm-side attempts, rejections and merges.
6. **PRIMARY** paradigmxyz/reth#25002 and main @ f90ed27: reth replaces revm with evm2.
7. **PRIMARY** gakonst tweet https://x.com/gakonst/status/2114190575486538225 (2026-10-25).
8. **PRIMARY** base/base @ bcd96e2 `crates/common/evm2` and PRs #4693, #4788, #4803: Base's differential development.
9. **PRIMARY** hai_rise tweet https://x.com/hai_rise/status/2112498280294924768, risechain/pevm#382 and pevm's Cargo history.
10. **PRIMARY** megaeth-labs/mega-evm @ 821577d, alloy-rs/evm2#387 / #388, megaeth-labs/revm #56 / #76.
11. **PRIMARY** foundry-rs/foundry#17541, tempoxyz/tempo#7871, #8320: Foundry / Tempo migration and audit fixes.
12. **PRIMARY** mantle-xyz/reth @ 574e7f3 (Cargo.toml, Cargo.lock, releases) and mantle-xyz/op-succinct @ 8d280de.
13. **PRIMARY** mantle-xyz/revm tag v107-mantle-arsia.2 @ 835cb4e and its diff against upstream v107; CI runs 35086043320, 37723171335.
14. **PRIMARY** docs.mantle.xyz: Node Introduction, Elysium changelog, OP Succinct Mainnet Upgrade.
15. **PRIMARY** ethereum-optimism/optimism develop `rust/Cargo.toml`, `rust/op-revm`: the OP upstream version set.
16. **PRIMARY** go-ethereum PRs #35638, #35881, #35156; besu PR #11524; evmone, Nethermind and ethrex source.
17. **PRIMARY** EIP-7904, EIP-7928 (ethereum/EIPs master).
18. ChatGPT Deep Research (2026-10-25, `research/gpt-deep-research.md`): leads only; corrections in [Method and evidence](#panel-Q).

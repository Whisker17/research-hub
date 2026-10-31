---
template: research
title: "Mantle's 2026 Performance Roadmap: Review and Experiment Plan"
subtitle: The draft points the right way, but three gaps come first. Name the sequencer each experiment measures. Treat the preconfirmation commitment as a launch gate. Put proving and persistence into the capacity criteria. Start short blocks, parallel EVM and a commitment change only when measurements call for them.
cols: 4
type: Roadmap review · Experiment design · Engineering plan
audience: Mantle protocol and infrastructure engineers and the roadmap owner. You know OP Stack, reth and preconfirmations, and you will use this page to plan work and design experiments
scope: The author's 11-item draft roadmap and block-path experiments E1–E8; Mantle public source code, the production deployment profile and mainnet data; primary sources from other projects; a claim-by-claim check of the GPT review
evidence: 322-row claim ledger (observed 215 / inferred 95 / speculative 12); source mantle reth @574e7f3, op-geth @e33cd26, mantle-v2 @1780605, op-succinct @6b1cb57, reth v2.2.0 @88505c7; mainnet RPC and L1 readings (2026-10-31)
date: 2026-10-31 · v1
---
Conclusion first: the draft's three main principles hold. Measure the block path first. Do not reuse other chains' results. Watch RPC, DA and proving lag together ([F1](#F1)). But the draft and the GPT review both miss one fact: **the mainnet sequencer is still op-geth today**. The reth block path in the draft runs only on Sepolia and on a standby node ([F2](#F2)).

The code check also found four issues that change the plan. A reth preconfirmation commitment can be lost on power loss or failover ([F3](#F3)). With `--preconf.all` and the default budget, reth admits only about 6M gas of new user transactions per block ([F4](#F4)). As a sequencer, reth still computes the state root synchronously when it seals a block ([F6](#F6)). If production keeps the prover's default concurrency of 1, each range must finish in about 1 hour ([F8](#F8)).

So in the short term, build the config inventory, audit commitments, and diagnose the proving pipeline and storage. Then decide on short blocks, evm2, parallel EVM and the state commitment by measurement ([Roadmap](#panel-N)).

## A Verdict by roadmap item {sheet span=2 meta="Researcher's proposal, not an approved plan"}
| Draft item | Draft | Proposal | Main reason |
|---|---|---|---|
| Block-path experiments | Short | ok Keep; add E0 first | Each test must name the sequencer client |
| Preconf commitment (E4) | Part of short | no Make it a launch gate | Journal has no fsync; no failover handoff |
| Multi-proof / proving | Mid–long | warn Split; diagnose now | At default concurrency, one range must finish in about 1 hour |
| Database | Mid–long | warn Inventory now | Storage v1 support ends 2027-01 |
| DA limits | Mid–long | warn Calibrate metering now | Footprint is not real blob bytes |
| revm → evm2 | Short | warn Catch up first, then compare | OP upstream has not moved; gain about 10% |
| Shorter blocks | Short–mid | warn Mid; protocol change | op-node schedules in whole seconds |
| Network broadcast | Mid–long | warn Rewrite as L2 data delivery | Standbys and read replicas are the L2 problem |
| Parallel EVM | Mid–long | ok Keep; change the method | Measure the critical path, not conflict rate |
| State commitment | Long | ok Keep; split into 3 kinds | Break down proving cost first |
| State expiry | Long | ok Low priority; new rationale | Use Storage v2 and pruning first |
| LFM / lanes / ASS | Long | ok Demand analysis only | Mainnet uses about 0.3% of block gas |

## B Key facts {sheet span=2 meta="2026-10-31, all sourced"}
| Fact | Value | Ledger |
|---|---|---|
| Mainnet sequencer client | op-geth v1.6.3 | K2 |
| Role of reth | Mainnet standby / Sepolia sequencer | K2, K3 |
| Mainnet parameters | 2 s · limit 60M · target 15M | K16 |
| 24-hour sampled block-gas use | 0.32% (no sampled block above target) | K18 |
| reth preconf default budget | 2M per tx · 6M gas per block | P7, P8 |
| Proof range | 1,800 blocks; default concurrency 1 (production unverified) | D41, D71 |
| Blob fill | 1 blob per 7.5 min, about 5% full | D12, D13 |
| Upstream reth | v2.9.0 moved to evm2; Mantle is on v2.2.0 | X14, X1 |

## C What neither the draft nor GPT found {sheet span=2}
1. The mainnet sequencer is op-geth. The draft's reth path is the target architecture (K9).
2. op-geth, the mainnet client, has its own preconf: an in-memory FIFO, and receipts from a shadow environment. No record shows whether mainnet enables it (P82, P84, K12).
3. With `--preconf.all` and the default budget, reth has no normal path. New user gas per block stops near 6M (P19, P20).
4. Neither of Mantle's reth builders uses the sparse trie. Sealing computes the root synchronously (X42).
5. Production reth persists every block. The upstream default is every 2 blocks (K5).
6. The proving pipeline records no cycle counts, so a bottleneck breakdown needs a separate run (K24).

## D Experiment list {sheet span=2 meta="E0–E8 rewritten, E9–E14 new"}
| ID | Question | Priority |
|---|---|---|
| E0 | What config does each environment actually run? | P0 |
| E4 | After a receipt goes out, is the commitment kept? | P0 gate |
| E10 | Can proving keep up with one range per hour? What is production concurrency? | P0 |
| E11 | How far is DA footprint from real bytes? | P0 |
| E9 | How much of reth sealing is root and persistence? | P0 (before switch) |
| E1–E3 | Preconf latency, eager build, budget | P1 |
| E5–E8 | Read path, import, sustained load, burst | P1 |
| E12 | What does evm2 gain end to end on Mantle? | P1 |
| E13–E14 | pEVM critical path; short-block feasibility | P2 |

## E Schedule {sheet span=2 meta="Proposal, counted from 2026-11-02"}
```timeline
Weeks 0–2 | Establish the config and the commitment guarantees | E0 inventory; E4 commitment audit; E10 proving breakdown; E11 footprint survey; storage-mode inventory
Weeks 2–6 | Fix the current path | Rewritten E1–E8; E9 sealing timing; catch up to OP upstream op-reth; complete preconf metrics
Weeks 6–16 | Build structure from the results | Proving scale-out or smaller ranges; preconf state stream; short-block prototype; pEVM re-measurement
Months 4–9 | Only protocol changes that data supports | State commitment, state expiry, LFM, multi-proof, each only when its entry condition holds
```

## F Conclusion {sheet span=2}
```callout ok Measure first, then change the protocol
- Every experiment first names its sequencer client, preconf mode and commitment level.
- "Always lands on chain" is a correctness gate, not a performance metric. Pass E4 before you promise it.
- Capacity criteria must include proving cadence and persistence, not only sequencer seal time.
- Start with [F2](#F2), [F3](#F3), [F8](#F8) and the [Roadmap](#panel-N).
```

## G How to read this {depth=1}
```callout info You already know (not explained here)
- How OP Stack splits work between op-node, batcher and the execution client (EL), and the unsafe / safe / finalized heads
- Both reth and op-geth can serve as the EL
- EIP-1559 adjusts the base fee from block usage
- Mantle uses OP Succinct (SP1) for validity proofs
```
- **5 minutes**: read overview A–F, then [F2](#F2), [F3](#F3), [F8](#F8).
- **30 minutes**: [Context](#panel-H) → [Background](#panel-I) → [Today's system](#panel-J) → [Findings](#panel-K) → [Experiment plan](#panel-L) → [Roadmap](#panel-N).
- **Everything**: also read [New experiments](#panel-M), [Corrections](#panel-O), [Method and evidence](#panel-Q), [Reproduce](#panel-R). The source of every claim is in `research/ledger.md`.

## H Context: why review this roadmap now {depth=2}
**Problem**: the author drafted Mantle's 2026 performance roadmap (11 items) and 8 block-path experiments (E1–E8). The draft is meant to drive planning and launch criteria (U1, U2). A GPT Deep Research review already exists, but its code findings and outside claims need checking.

**Why now**:
- Reth v2.9.0 shipped on 2026-10-29 and replaced its EVM with evm2 (X14, X15).
- Base's native 200 ms blocks went live on testnet on 10-21, with mainnet planned for November (P60, P61).
- Mantle's public code already has a reth preconf subsystem and eager build (P1, P45).

**Questions** (from the brief):
1. What is Mantle's current performance baseline? Which parts can we confirm, and which are assumptions?
2. For each draft item: what is the outside state, does it apply, and is the urgency right?
3. Can E1–E8 support the draft's "result → action" table? Which experiments are missing?
4. Which GPT findings hold, and which are wrong or out of date?
5. What is the reordered short / mid / long-term roadmap?

**Scope and non-goals**:
- In: the draft roadmap and E1–E8; Mantle public code, the deployment profile and chain data; primary sources from other projects.
- Out: running experiments on the QA chain; token economics; advice to other companies; unpublished production config (marked as to-be-confirmed).

**Decision criteria** (set before the findings):
- Separate three kinds of fact: what public code does, code defaults, and production config.
- An experiment supports its action only when the control holds, the sample is large enough, and the metric matches the hypothesis.
- The change level (local implementation / parameter / protocol semantics) sets how a project starts. Measurements set its priority.

## I Background {depth=2}
**Running example**: mainnet block 102640855 holds an ERC-4337 `handleOps` transaction. It used 120,982 gas, and its DA footprint is 151,600 (K41). The sections below use it to show where each stage can limit a transaction.

```excalidraw q="Which ideas do you need to read this page, and in what order?" read="Gray dashed boxes are assumed knowledge. Blue boxes are card IDs. Arrows mean read first → read next. The green box is the decision this page supports." takeaway="Read B-1 and B-2 first: commitment levels and queueing are the two reference points for every experiment." name=prereq-map kind="Prerequisite map"
{"grid": {"w": 290, "h": 110}, "defaults": {"w": 200, "h": 58, "fontSize": 17},
 "nodes": [
   {"id": "k1", "label": "OP Stack parts", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "k2", "label": "EIP-1559", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b1", "label": "B-1 Commitment levels", "col": 1, "row": 0, "color": "blue"},
   {"id": "b2", "label": "B-2 Queues and backlog", "col": 1, "row": 1, "color": "blue"},
   {"id": "b3", "label": "B-3 Preconfirmation", "col": 2, "row": 0, "color": "blue"},
   {"id": "b4", "label": "B-4 Sealing and persistence", "col": 2, "row": 1, "color": "blue"},
   {"id": "b5", "label": "B-5 Tail-latency samples", "col": 2, "row": 2, "color": "blue"},
   {"id": "b6", "label": "B-6 DA footprint", "col": 1, "row": 2, "color": "blue"},
   {"id": "s", "label": "Which tests first?", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "k1", "to": "b1"}, {"from": "b1", "to": "b3"}, {"from": "b2", "to": "b4"},
   {"from": "k2", "to": "b6"}, {"from": "b2", "to": "b5"},
   {"from": "b3", "to": "s"}, {"from": "b4", "to": "s"}, {"from": "b5", "to": "s"}
 ]}
```

```prereq B-1 l1 3min
# Commitment levels: six different kinds of "fast"
what: A transaction gets six results in order: submission accepted, preconfirmed, readable over RPC after sealing, published to DA, proven, settled. Each level is a different strength of promise.
why: E1–E8 in the draft measure the first three levels. Capacity depends on the last three. One set of numbers cannot stand in for the other.
example: Illustration: a transaction becomes readable over RPC about one block interval (2 s) after sealing. Proofs arrive per range: the latest submission came about 40 minutes after its range's last block and 100 minutes after its first (D42).
misconception: Myth: a fast receipt means the transaction is safe. Fact: the receipt is the sequencer's promise. E4 tests whether the sequencer keeps it.
deeper: [9] OP Spec; GPT review §1.1 (lead only)
```

```prereq B-2 l1 3min
# Queues and backlog
what: The backlog of each stage changes as dQ/dt = λ − μ. λ is the arrival rate and μ is the service rate. When λ stays above μ, the backlog keeps growing.
why: If a downstream stage (DA, proving) cannot keep up, a faster sequencer only grows the backlog. After a burst, draining takes about Q / (μ − λ_normal).
example: At default concurrency the prover runs one range (1,800 blocks) at a time. If one range takes more than about 3,600 s, ranges pile up (D72).
misconception: Myth: if the backlog clears after the load stops, the system recovers. Fact: production traffic does not stop, so draining is slower.
deeper: GPT review §1.2, E8 (lead only); ledger D70
needs: B-1
```

```prereq B-3 l1 4min
# Preconfirmation
what: The sequencer executes a transaction and returns a receipt before it seals the block. Mantle has two implementations: the op-geth one (in the mainnet client; we could not confirm it is on) and the reth one (enabled on Sepolia and the standby node).
why: It sets how fast users see results. It also sets what the sequencer has promised them.
example: reth defaults: 1 s timeout, 2M gas per transaction, 6M gas budget per block, normal transactions released every 200 ms (P4–P8).
misconception: Myth: `--preconf.all` is the on switch. Fact: the switch is `--preconf.enable`; `--preconf.all` is an eligibility rule (P1, P2).
deeper: [1] mantle reth preconf crate; [2] op-geth preconf package
needs: B-1
```

```prereq B-4 3min
# Sealing and persistence
what: Sealing a block computes its state root. Persistence writes sealed blocks to the on-disk database. reth persists on its own thread, in parallel with executing the next block.
why: Slow sealing delays block publication. If persistence falls 16 blocks behind, reth stops serving engine requests (X84).
example: Mantle production reth persists every block, and MDBX runs in Durable mode (K5, K6).
misconception: Myth: Reth 2.0 cut the root to 1–2 ms, so the root no longer limits sealing. Fact: that is the engine validation path. Mantle's builders do not use it (X42).
deeper: [4] reth v2.2.0 engine tree; [12] Paradigm, Reth 2.0
needs: B-2
```

```prereq B-5 3min
# How many samples tail latency needs
what: p99 is the 99th percentile. To estimate it, the sample must hold enough of the slowest 1%.
why: The draft's E8 runs about 40 full blocks. In 40 samples, the expected count above the true p99 is only 0.4 (K35).
example: 30 minutes of 2 s blocks gives 900 blocks. The true p99 then lies between the 16th and 4th largest sample with about 96% probability (K36).
misconception: Myth: many transactions make a block-level p99 reliable. Fact: for block-level metrics, the sample size is the block count, not the transaction count.
deeper: Calculations in ledger rows K35, K36
needs: B-2
```

```prereq B-6 3min
# DA footprint
what: The OP Jovian rules estimate each transaction's compressed size and multiply it by a scalar (400 on Mantle). The result is the DA footprint. The block's total footprint may not exceed the gas limit.
why: The base fee follows max(gasUsed, footprint) (D20). Small transactions can hit the footprint limit first.
example: The running example used 120,982 gas but has a footprint of 151,600, so the fee follows the footprint (K41, K42).
misconception: Myth: if the footprint hits the limit first, L1 blob bandwidth is short. Fact: Mantle's blobs are only about 5% full (D13, D27).
deeper: [9] OP Spec, Jovian exec-engine
```

## J Today's system: two sequencers, two preconf implementations {depth=2}
Figure 2 shows today's deployment. The draft's §2.1 path, "reth executes → RPC node (op-geth) imports", matches the Mantle roadmap goal of moving the sequencer to reth. But op-geth still produces mainnet blocks today (K2, K9).

```excalidraw q="Who produces blocks today, and where does the draft's reth path run?" read="The top row is today's mainnet (blue). The bottom row is Sepolia, which is also the target after the switch (yellow = to be verified). The gray dashed node in the middle follows and does not produce blocks." takeaway="Mainnet and the QA chain measure two different sequencer implementations. Do not compare their numbers directly." name=deployment kind="Deployment"
{"grid": {"w": 330, "h": 120}, "defaults": {"w": 210, "h": 66, "fontSize": 16},
 "nodes": [
   {"id": "rpc0", "label": "Mainnet RPC\nop-geth", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "seq0", "label": "Mainnet sequencer\nop-geth v1.6.3", "col": 1, "row": 0, "color": "blue", "strokeWidth": 3},
   {"id": "pc0", "label": "Preconf (on? unconfirmed)\nmemory FIFO", "col": 2, "row": 0, "color": "blue"},
   {"id": "cand", "label": "Standby sequencer\nreth v1.6.2", "col": 1, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "rpc1", "label": "Sepolia RPC", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "seq1", "label": "Sepolia sequencer\nreth + preconf", "col": 1, "row": 2, "color": "yellow"},
   {"id": "pc1", "label": "Preconf: journal\nshared build state", "col": 2, "row": 2, "color": "yellow"}
 ],
 "edges": [
   {"from": "rpc0", "to": "seq0", "label": "forward"},
   {"from": "seq0", "to": "pc0", "label": "receipt"},
   {"from": "cand", "to": "seq0", "label": "follows", "dashed": true},
   {"from": "rpc1", "to": "seq1", "label": "forward"},
   {"from": "seq1", "to": "pc1", "label": "receipt"}
 ]}
```

How the two preconf implementations differ (P81–P88):

| Aspect | op-geth (mainnet client; enablement unconfirmed) | reth (Sepolia / standby; enabled) |
|---|---|---|
| Receipt source | Trial run in a shadow environment | The same state as the open block |
| Commitment record | Memory only | Journal file; flush, no fsync |
| Per-tx cap / per-block budget | None | 2M / 6M gas |
| Block time | Hard-coded 2 s | Slot setting, default 2 s |
| Safety valves | Refuses when sync or L1 lags | Timeout and budget gates |

Figure 3 shows one reth preconfirmation. The red spans are steps the draft's E1 does not time (P39).

```uml q="Which steps does one reth preconf request pass through, and which steps have no metric?" read="The follower RPC forwards the request to the sequencer. Red spans are waits and writes that current metrics do not cover. Simplified: deposits and timeout branches are left out." takeaway="E1 needs three more timers: listener push, wait for a build context, journal append."
sequenceDiagram
  autonumber
  participant C as Client
  participant F as Follower RPC
  participant S as reth sequencer
  participant B as payload builder
  participant J as journal
  C->>F: sendRawTransactionWithPreconf
  F->>S: forward (forward.duration_ms)
  S->>S: decode, eligibility, nonce and balance (validate)
  rect rgb(251, 234, 234)
    S->>B: listener pushes to FIFO, waits for a build job
  end
  B->>B: budget gate, execute (execute.duration_ms)
  B-->>S: receipt
  rect rgb(251, 234, 234)
    S->>J: append: write_all + flush
  end
  S-->>F: receipt
  F-->>C: receipt
```

## K Findings {depth=2}
```finding F1 high
# The draft's three main principles hold
claim: Measure the block path first, do not reuse other chains' results, and watch RPC / DA / proving lag together. This check confirms all three. Outside results do not transfer. The Reth 2.0 root number does not apply to Mantle's sealing path. DA footprint is not real blob usage.
evidence: [inferred] From the draft's §2.1 and checks X43, D27, D70 (R1). [observed] The draft's E7 / E8 already list batcher backlog and proving lag as signals (U2).
implication: Keep the draft's structure. Change the controls, the samples and the reading rules.
```

```finding F2 high
# The mainnet sequencer is still op-geth; the draft's reth path is the target architecture
claim: The deployment profile confirmed on 2026-10-27 shows op-geth v1.6.3 producing mainnet blocks. Mainnet reth is a standby sequencer that follows it. reth produces blocks only on Sepolia. So the draft's "passive mainnet measurement" and its "QA-chain experiments" measure two different implementations.
evidence: [observed] Deployment profile config/repos.json@6be759c (K1–K4). [observed] The public RPC reports Geth/v1.17.3 (K17). [inferred] K9, K10. [observed] The GPT review does not separate the two implementations (G3).
implication: E0 first records each environment's sequencer client and preconf mode. Group every result by client. Do not compare across groups.
```

```finding F3 high
# A reth preconf commitment can be lost on power loss or failover
claim: After reth gets the execution receipt from the builder, it tries to append the commitment to its journal, then returns the receipt to the client. The write flushes but does not fsync. A failed write only logs a warning, and the client still gets the receipt. The journal stores the transaction and a predicted block number, not the execution context, and the code has no failover handoff. The op-geth version in the mainnet client is weaker: commitments live only in memory, and receipts come from a shadow environment. We could not confirm that mainnet enables it.
evidence: [observed] journal.rs:234–235, rpc.rs:245–253, the JournalEntry fields (P22–P25). [observed] op-conductor only replicates sealed blocks (P41, P42). [observed] op-geth's FIFO is memory-only and its receipts come from a shadow environment (P82, P84); no record shows whether mainnet enables it (K12). [inferred] P34, P43, P88. [speculative] If the team adds conductor failover after the switch, some receipts may go unhonored (P44).
implication: E4 is a launch gate: run a fault matrix on both paths. Before you promise "always lands on chain", design a durable or replicated write, and refuse the receipt when the write fails.
```

```finding F4 high
# With --preconf.all and the default budget, reth admits about 6M gas of new user transactions per block
claim: The reth pool listener pushes every eligible transaction into the preconf queue, and the normal packing path skips them. With preconf enabled, --preconf.all and the default budget, every transaction takes the preconf path. The pool rejects a transaction above 2M gas at entry and evicts new transactions beyond the 6M per-block budget; replayed earlier commitments bypass the budget. The draft's E3 "normal transaction" control group does not exist. In execution gas, E7 cannot reach the 15M target either.
evidence: [observed] preconf_pool_listener.rs, payload_builder.rs:747, validator.rs, dispatch.rs:268 (P14–P18). [observed] Defaults at config.rs:36, 43 (P7, P8); Replay entries bypass the budget gate (P13). [inferred] P19–P21. [inferred] GPT found the control-group problem but not the capacity cap (G2).
implication: Before reth takes over as sequencer, reset the eligibility rule and budget (R4). Run E3 only in allowlist mode.
```

```finding F5 medium
# Eager build is deployed; its gain is capped near 50 ms per block
claim: --sequencer.eager-build is on by default and shipped with v1.6.3. It only moves the start of the next build to the moment the previous block becomes canonical. Seal timing does not change. op-node seals 50 ms before the payload time, so eager build removes at most about 50 ms of idle window.
evidence: [observed] op-node/flags/flags.go:275–278, sequencer.go:25, 476 (P45–P47). [observed] v1.6.3 in the deployment profile (K1). [inferred] P48, P49.
implication: In E2, bucket the gain by where in the slot a transaction arrives. Overall p99 will likely show no difference.
```

```finding F6 high
# As a sequencer, reth still computes the state root synchronously at the end of the block
claim: Mantle has two reth builders, with and without preconf. Both drop the execution cache and sparse trie that the engine offers. Both call finish(…, None) when they seal. Reth 2.0's "1–2 ms root" applies only to the engine validation path. Upgrading dependencies alone does not change this.
evidence: [observed] payload_builder.rs:888–892, 1185–1187; op-reth builder.rs:230, 473–474 (X35–X39). [observed] The v2.2.0 share flags are off by default (X79, X80). [observed] Paradigm's 1–2 ms is the root time left at the end of a block (X26). [inferred] X42–X44, X81. [speculative] Under full blocks, the synchronous root may become the sealing bottleneck (X75).
implication: Add E9 to time the sealing root before the reth switch. If the root dominates seal time, fixing the builder may gain more than evm2.
```

```finding F7 medium
# Production reth persists every block, so time it separately
claim: Every production reth node sets persistence-threshold=0, so each new block triggers persistence, and MDBX runs in Durable mode. Persistence runs on its own thread, in parallel with the next block. The engine stalls only when the gap reaches 16 blocks. Persistence writes may contend with execution's cold reads on the same disk. Nobody has measured whether this happens or how much it costs.
evidence: [observed] Deployment profile (K5, K6). [observed] reth v2.2.0 config.rs:7, 10 and persistence.rs, tree/mod.rs (K14, X82–X84). [inferred] K15, X85. [speculative] Disk contention slows execution (X86). [observed] The 2026-10-27 check found 3 settings beyond the developers' first answer (K8).
implication: In E6–E8, read commit_duration and the backpressure metrics before you decide to change disks. E0 must read config from the nodes, not from memory.
```

```finding F8 high
# At default concurrency, the prover must finish one range in about 1 hour, or the backlog grows without bound
claim: Mantle runs OP Succinct in validity mode and submits to mainnet every 1,800 blocks (about 1 hour). The proposer's concurrency limit defaults to 1 and counts witness generation, execution and proving together. If production keeps the default, one range must finish in less than about 3,600 s under sustained load. Internal QA docs also list a one-range gateway and a 1,800 s witness timeout. Nobody has verified the production values.
evidence: [observed] The last three validity-mode L1 submissions are 1,800 blocks apart (D39, D41), and the code sets the proposer's default concurrency (D71). [observed] The QA prover-network README: range size, concurrency, timeouts; it says deployment config decides the real values (K19–K23, K43); [inferred] D70, D72. [speculative] The draft says the bottleneck is ZK proving; no public result shows it (U4, D51).
implication: Add E10. First read production's concurrency and timeout values. Then use the three stage durations in the database plus L2OO submission times to test "the bottleneck is proving" directly. Move this item from mid–long term to short term.
```

Figure 4 shows the path of one range from block production to proof submission. The red box is the sustainability limit: at default concurrency, the prover handles one range at a time.

```excalidraw q="Which steps does one proof range pass through, and which one decides whether proving keeps up?" read="The top row is data publication and finality; the bottom row is the proving pipeline. The red box is the step that admits one range at a time at default concurrency. The limit is the code default; the production value is unverified. Simplified." takeaway="At default concurrency, if one range takes more than about 3,600 s in total, the backlog keeps growing." name=proof-range kind="Proving pipeline"
{"grid": {"w": 310, "h": 130}, "defaults": {"w": 200, "h": 66, "fontSize": 16},
 "nodes": [
   {"id": "seq", "label": "sequencer\n2 s per block", "col": 0, "row": 0, "color": "blue"},
   {"id": "bat", "label": "batcher\n1 blob / ~7.5 min", "col": 1, "row": 0, "color": "violet"},
   {"id": "fin", "label": "L1 finalized", "col": 2, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "wit", "label": "proposer picks range\n1,800 blocks", "col": 2, "row": 1, "color": "violet"},
   {"id": "prv", "label": "witness + proof\ndefault 1 range", "col": 1, "row": 1, "color": "red", "strokeWidth": 3},
   {"id": "l2oo", "label": "Plonk aggregation\nsubmit to L2OO", "col": 0, "row": 1, "color": "green"}
 ],
 "edges": [
   {"from": "seq", "to": "bat", "label": "batch"}, {"from": "bat", "to": "fin", "label": "blob"},
   {"from": "fin", "to": "wit"}, {"from": "wit", "to": "prv", "label": "input"},
   {"from": "prv", "to": "l2oo", "label": "proof"}
 ]}
```

```finding F9 medium
# The production proving pipeline records no cycle counts
claim: In network mode, the proposer database stores 0 for cycles and prover gas, and the self-hosted cluster leaves those fields empty. The guest marks only two spans, derivation and execution; MPT and state-root work fall under execution. keccak already uses the SP1 precompile.
evidence: [observed] collect/README.md (K24). [inferred] Cycle spans in client.rs (D46). [observed] keccak patches in op-succinct Cargo.toml and Cargo.lock (X63, X64). [inferred] K25, X68.
implication: In E10, run execute locally on the same ranges and add an MPT span. Without that data, do not start a state-commitment change.
```

```finding F10 medium
# Hitting the DA footprint limit first does not mean L1 bandwidth is short
claim: Mantle's scalar is 400, so every transaction's footprint is at least 40,000, more than the 21,000 gas of a plain transfer. At the 15M target, a block can count only 37,500 estimated bytes. Real blobs are only about 5% full. So a footprint that hits the limit first shows a metering constraint, not a blob-bandwidth limit.
evidence: [observed] Scalar 0x190 and receipts (D23, D24, K41). [observed] A blob carrying 6,836 bytes (D13). [observed] Jovian rules (D19, D20). [inferred] D25–D27. [inferred] The draft's 152 / 228 KB/s arithmetic is right (D9). [observed] But "100 bytes per transaction" is the fee-estimate floor, not a measured mean (D11).
implication: Add E11: compare footprint with the batcher's real compressed bytes first. In E7, count load as max(gas, footprint).
```

```finding F11 medium
# The draft's E8 fee-parameter direction is backwards
claim: The base-fee change scales with 1/denominator, so a faster reaction needs a lower denominator. A lower elasticity lowers the largest per-block rise. Neither drains a backlog faster. With current parameters, 40 full blocks raise the base fee about 10.3×. It then takes about 3.8 minutes to fall back to the floor.
evidence: [observed] EIP-1559 formula (D30). [observed] Mainnet D=50, E=4 (K16). [inferred] D31–D35, K37, K38. [inferred] GPT's correction holds (G6).
implication: In E8, record price recovery and queue draining separately. Use fee parameters only as a helper.
```

```finding F12 medium
# 40 full blocks cannot estimate p99, and most draft thresholds have no source
claim: In 40 samples, the expected count above the true p99 is only 0.4. The 200 ms seal threshold has no basis either: op-node leaves only 50 ms for sealing.
evidence: [inferred] K35, K36. [observed] sealingDuration = 50 ms (P47). [inferred] P78, R16.
implication: Use at least 900 blocks per run for block-level p99, and repeat runs. Treat the draft's numbers as candidate thresholds, and state the measurement endpoint, load and commitment level.
```

```finding F13 medium
# evm2 does not arrive "with the upstream upgrade"
claim: Reth v2.9.0 (10-29) switched to evm2 and reports execution about 10% faster. Mantle is on v2.2.0, and the latest OP upstream op-reth v2.8.0 is still on revm. If Mantle moves now, it must port at least 7 custom pieces itself, including the proving path.
evidence: [observed] v2.9.0 release notes (X14–X18). [observed] op-reth v2.8.0 builds on reth v2.6.0 (X21). [inferred] X13, X22, X24. [inferred] The sibling report revm-vs-evm2's "not yet released" is out of date (X23).
implication: First catch up to an upstream version that still uses revm, and use evm2 as the E12 comparison group. Decide after OP upstream moves.
```

```finding F14 medium
# Short blocks are a protocol change, not a parameter
claim: op-node schedules in whole seconds. op-geth preconf hard-codes 2 s. At constant gas per second, 200 ms blocks give reth a 0.6M budget. That is below the 2M per-tx cap, so the current validation rejects the config. Base's Denim also changes timestamps and RPC semantics. Base plans its mainnet launch for November.
evidence: [observed] sequencer.go:473–474, preconf_checker.go (P53, P87). [observed] Base Denim docs (P59–P63). [inferred] P54, P57, P58, P64. [speculative] The author says short-block tests on an older version produced unstable blocks (P80).
implication: Move it to mid term. Start with the E14 feasibility checklist, and compare at equal work per second.
```

```finding F15 low
# Other long-term items: keep the priority, rewrite the reason
claim: pEVM still lacks slot-level dependency data for Mantle. State-commitment candidates fall into three kinds; only storage changes that keep the MPT avoid a protocol upgrade. The "all state in memory" reason for state expiry is not in MegaETH's primary sources. A multi-proof system exists for settlement and safety, not proving speed. At about 0.3% block-gas use, LFM has no congestion to fix.
evidence: [observed] pevm is still WIP (X46); the 2025 dependency rate used a heuristic (X49). [inferred] X60, X61, X72, X74. [observed] Base Azul's motivation (D52, D53). [inferred] D54, R17.
implication: Give each item an entry condition (see the Roadmap) and start it only when the condition holds.
```

## L Experiment plan: E0–E8 rewritten {depth=2}
Every experiment uses one format: hypothesis, control, metric, reading rule. All thresholds below are candidates, not validated SLOs (R16).

**E0 config inventory (P0)**. Read it from the nodes, not from memory (K8).

| Area | Must record |
|---|---|
| Sequencer | Client (op-geth / reth), version, preconf eligibility (allowlist / all), budget, timeout |
| Storage | `op-reth db settings get` (Storage v1 / v2), persistence and backpressure settings |
| Downstream | Batcher compression and channel settings; proposer range, concurrency, timeouts |
| Load | Transaction mix, account and nonce spread, arrival rate, random seed |

**E1 preconf stage timing (P1)**. Build one version per client (P39).

| Observation | Conclusion | Action |
|---|---|---|
| Tail clusters at the end of the slot | Waiting for a build context | See E2 |
| Tail lines up with journal rotation | Rotation holds the lock | Shorten rotation or split the lock (speculative, P79) |
| Tail sits before the budget gate | Queueing or a short budget | See E3 |
| No stage stands out, but the total is slow | Not yet located | Trace the slowest requests end to end |

Add three metrics: listener push, wait for build, journal append. Record histograms in fractional milliseconds (P38).

**E2 eager build (P1)**. Run once on and once off, bucketed by arrival phase. Expect a late-slot gain of no more than 50 ms (P48).

**E3 preconf budget (P1, reth allowlist mode only)**. Sweep the preconf share, the budget and the gasLimit / gasUsed ratio. If rejections cluster on transactions whose gasLimit is far above gasUsed → fix gas estimation, do not raise the budget (P12).

**E4 commitment audit (P0, launch gate)**.

| Fault | reth check | op-geth check |
|---|---|---|
| kill -9 | Journal replay | In-memory FIFO is lost |
| Power loss | Commitments not fsynced | Same |
| Journal write fails | Is a receipt still sent? | Not applicable |
| Failover | Commitments in the open block | Commitments in the open block |
| Reorg / L1 origin change | Receipt vs final block | Shadow-env misprediction rate |

Any "receipt sent but not on chain" or "result differs from the receipt" blocks launch (U2, P34).

**E5 read visibility (P1)**. Measure δ = client gets the receipt → follower RPC reads the new state. Neither implementation exposes preconf state (P35), so δ is about one block interval plus propagation and import. To shorten it, design a state stream: sequence numbers, parent hash, gap detection, revocation events, canonical reconciliation (P67, P71).

**E6 RPC import (P1)**. Split it into seal → gossip → receive → execute → persist → queryable. Read commit_duration and backpressure before you decide to change disks (X88).

**E7 sustained load (P1)**. Change three things:
- Use the mainnet mix (DEX 29%, transfers 29%, oracles 24%…) plus product load, not only mStocks (K26, K30).
- Count block use as max(gasUsed, footprint) (D20).
- Record total range time against 3,600 s (scaled by production concurrency), the canonical − persisted gap, and the L2OO submission interval (D72, K15).

**E8 burst and recovery (P1)**. Keep the 40 full blocks as a shock test, but do not report p99 from it. In recovery, return to normal traffic instead of stopping. Record base-fee recovery (about 3.8 minutes, K38) apart from queue draining.

## M New experiments: E9–E14 {depth=2}
| ID | Hypothesis | Method | Continue / stop |
|---|---|---|---|
| E9 Sealing timing | As sequencer, reth's synchronous root and persistence stretch sealing | QA chain: preconf on / off × suppress-persistence on / off × threshold 0 / 2 | Root dominates → make the builder use the sparse trie; neither dominates → look at execution and IO |
| E10 Proving breakdown | One stage dominates proving lag | Read production concurrency and timeouts; three stage durations from the DB + L2OO times; local execute for cycles; an MPT span | Concurrency 1 and range > 3,600 s, or a growing backlog → add concurrency or shrink the range; MPT dominates → only then study state commitments |
| E11 DA metering | Footprint overstates real bytes | Ratio = estimated bytes (Σ footprint / 400) ÷ real channel bytes | Ratio well above 1 → assess a lower scalar; otherwise keep |
| E12 evm2 | evm2 helps Mantle end to end | Three groups: current / catch up to op-reth v2.8.0 / reth 2.9 + evm2; per-block reconciliation | Catch-up gets most of the gain → catch up first; any semantic diff → block |
| E13 pEVM | Mantle has parallel headroom | Slot-level read/write sets, gas-weighted critical path | Critical path ≥ 50% → stop general pEVM |
| E14 Short blocks | 200 ms is feasible and worth it | Checklist: op-node whole seconds, op-geth fixed 2 s, budget validation, denominator, block.number contracts, kona / SP1 | Preconf already meets interaction goals → no protocol-level short blocks |

Sources: E9 see X42, X87; E10 see D45, D46, D71, K24; E11 see D25–D27; E12 see X13, X24; E13 see X50; E14 see P53–P58, P87.

## N Roadmap: short / mid / long term {depth=2}
Counted from 2026-11-02. The windows are a planning proposal, not a delivery promise (R3–R15).

**Short term, weeks 0–6: see the config, fix the commitment semantics, diagnose proving**

| Weeks | Work | Deliverable |
|---|---|---|
| 0–2 | E0 inventory; storage-mode inventory | A reproducible baseline; a migration plan for v1 nodes (before 2027-01) |
| 0–2 | E4 commitment audit (both paths) | Whether a launch blocker exists |
| 0–3 | E10 proving breakdown; E11 footprint survey | Whether proving keeps up; how to read E7 |
| 2–6 | Rewritten E1–E8; E9 | Complete preconf metrics; the precondition result for the reth switch |
| 2–6 | Catch up to OP upstream op-reth v2.8.0 (reth v2.6.0, still revm) | The E12 control group |

```callout warn CAUTION
Before reth takes over as the mainnet sequencer, finish three things. Reset the preconf eligibility and budget (F4). Pass E4 (F3). Measure the sealing root and persistence (F6, F7). Otherwise the switch changes the capacity cap and the commitment semantics at the same time.
```

**Mid term, weeks 6–16 (about mid-December 2026 to end of February 2027)**

| Work | Entry condition |
|---|---|
| More proving concurrency or smaller ranges | E10 shows ranges near 3,600 s at concurrency 1, or the proven height falling behind |
| Preconf state stream | E5 shows read delay hurts the product |
| Builder uses the sparse trie | E9 shows the root dominates sealing |
| Short-block prototype | The E14 checklist is feasible and preconf is not enough |
| pEVM prototype | E13 shows a short critical path |
| L2 data delivery (relays, standbys, subscribers) | E6 shows propagation or import is the bottleneck |

**Long term, months 4–9**

| Item | Entry condition |
|---|---|
| State-commitment change | E10 shows MPT dominates proving cost, and implementation fixes are not enough |
| State expiry | Active state (not history) becomes the constraint |
| LFM / lanes / ASS | A clear product SLA needs it |
| Multi-proof system / new zkVM | A settlement or safety goal, not performance |

## O Corrections to the draft and to GPT {depth=3}
**Draft**

| Draft says | Correction | Ledger |
|---|---|---|
| E1: lower the per-tx gas cap to 2M | reth already defaults to 2M; op-geth has no per-tx cap | P7, P81 |
| E2: check mainnet op-node ≥ v1.6.3 | Deployed; the flag is `--sequencer.eager-build`, on by default | K1, P45 |
| E3: compare preconf and normal transactions | Under `--preconf.all` there is no normal path | P19, P21 |
| "Current 6M budget" | A reth code default; mainnet op-geth has no budget | P8, P81 |
| E7: footprint first → DA is the bottleneck | Only a metering constraint; blobs are 5% full | D27 |
| E8: raise the denominator to react faster | Lower the denominator | D35 |
| E8: seal p99 > 200 ms → catch up to upstream | Catching up is not enough; the builder must change | X44 |
| Reth 2.0 root 1–2 ms (as block-path background) | Applies only to the engine validation path | X43 |
| Bring in evm2 with the upstream reth update | OP upstream has not moved; 7 pieces to port | X24 |
| MegaETH all-in-memory → need state expiry | No such link in primary sources | X72 |
| Consider compression efficiency and batch size | Brotli is already on; blobs are only 5% full | D13, D14 |
| Binance New L1 | BNB New L1's Multi-Lane, not BSC Payment Lane | D62 |

**GPT review**

| Claim | Status | Ledger |
|---|---|---|
| Journal flushes without fsync; failed write still returns | ok Holds | G1 |
| `--preconf.all` pollutes E3 | ok Holds, but understates the impact | G2 |
| Reth v2.9.0 moved to evm2 | ok Holds | G4 |
| 152 / 228 KB/s, scalar semantics, 1559 direction | ok Holds | G6 |
| Mainnet sequencer and the two preconf implementations | no Missed | G3 |
| Builder skips the sparse trie; per-block persistence | no Missed | G9 |
| Base pending state as the E5 reference | no Out of date | G5 |
| BSC Payment Lane announced in September | warn Primary sources are from October | G7 |
| "Do not write MDBX v1 or v2" | warn Goes too far | G8 |

## P Limits and open questions {depth=2}
**Limits**
- This page ran no experiment on the QA chain. Every "observation → action" is a reading rule, not a measured Mantle result.
- The deployment profile comes from the author's config record (confirmed 2026-10-27) and covers only reth nodes. The op-geth sequencer's preconf settings are unknown (K12).
- Prover-network soak results are not in the repository, so there is no data on range proving time (K40). The last three submissions are only 3 samples (D42).
- Some reth source findings were read at symbol level, not traced line by line. "kill -9 recovers, power loss does not" is an inference (see the uncertainty notes in the P notes).
- Speculative claims: P44, P79, P80, X33, X45, X75, X86, D16, D51, D68, U3, U4. The page marks each as speculative where it appears.

**Open questions**
1. Does the mainnet op-geth sequencer run preconf? What commitment level do users get?
2. Do the standby and Sepolia reth nodes use the allowlist or all? What budget?
3. Is each production node on Storage v1 or v2? What are the backpressure and share / suppress settings?
4. What concurrency and timeouts does the production proposer use? What is one range's wall time on 8×GPU, and how is proving lag distributed?
5. How does the roadmap's "distributed GPU proof network, waiting for mainnet" relate to the self-hosted production cluster (D43)?
6. As a sequencer, does reth's engine reuse the execution result of a self-built block (X45)?

## Q Method and evidence {depth=3}
- **Path**: material-driven plus external research (paths B + C). The main inputs are the author's draft and the GPT review. We traced every GPT claim to a primary source before use.
- **Split**: three parallel research lanes (preconf and block building, execution and state, DA and proving) plus a main-session check. 322 ledger rows, grouped by prefix.
- **Source**: mantle reth @574e7f3 (production mantle-v1.6.2) and op-geth @e33cd26 (production v1.6.3). Also mantle-v2 @1780605, op-succinct @6b1cb57, upstream reth v2.2.0 @88505c7 and main @84caec5.
- **On chain**: Mantle public RPC (blocks, eth_feeHistory, receipts), L1 batcher and L2OutputOracle (Blockscout, Routescan), 2026-10-31.
- **Internal material**: the deployment profile (upstream-codebase-fix-alert) and prover-network and load-test docs (mantle-performance-test), both private repositories.
- **Spot checks**: the main session re-checked five items (notes.md). They are the eager-build default, the builder's `finish(…, None)`, the journal write-failure branch, the v2.9.0 notes and the DA scalar.

## R Reproduce {depth=3}
Mainnet parameters and block-gas use (needs Foundry's `cast`):

```bash title="Mainnet parameters and 24-hour block-gas use"
R=https://rpc.mantle.xyz
cast block latest -r $R --json | jq '{gasLimit,extraData,baseFeePerGas}'
head=$(cast bn -r $R)
for i in $(seq 0 23); do
  cast rpc eth_feeHistory 1024 $(printf '0x%x' $((head - i*1800))) '[]' -r $R \
    | jq -c '[.gasUsedRatio[]]'
done | jq -s 'add | {n:length, mean:(add/length), max:max}'
```

Expected: extraData decodes to denominator 50, elasticity 4, min base fee 50 gwei; mean about 0.003 and max below 0.25.

Source checks:

```bash title="Key lines in preconf and the builder"
git clone --depth 1 https://github.com/mantle-xyz/reth && cd reth
sed -n 230,236p mantle-reth/crates/preconf/src/journal.rs   # write_all + flush
sed -n 243,254p mantle-reth/crates/preconf/src/rpc.rs       # failed write still Ok(event)
sed -n 470,475p op-reth/crates/payload/src/builder.rs       # finish(state_provider, None)
```

## S Glossary {depth=2}
```glossary
sequencer | — | The L2 node that orders transactions and produces blocks. | not the batcher
EL | execution client | The client that executes transactions and keeps state; Mantle has op-geth and reth. | not op-node
preconfirmation | preconf | An execution receipt the sequencer returns before it seals the block. | not finality
journal | commitment log | The local file where reth preconf writes commitments it has returned. | not the txpool journal
fsync | sync_all | Forces file contents to disk so they survive power loss. | flush only empties user-space buffers
eager build | — | Starts building the next block as soon as the previous one is canonical. | does not change seal time
sparse trie | — | Part of the trie that reth keeps in memory across blocks to compute the root in parallel. | not the full state
persistence | — | Writing sealed blocks to the on-disk database. | not sealing
backpressure | — | When persistence falls 16 blocks behind, reth pauses engine requests. | not RPC rate limiting
range | proof range | The run of consecutive blocks the proposer proves at once; 1,800 on Mantle. | not a batch
DA footprint | DA metering | Estimated compressed bytes times a scalar; it limits a block together with gas. | not real blob bytes
Storage v2 | — | reth's tiered storage format; v1 support ends 2027-01. | not an MDBX version
critical path | — | The longest chain of dependent steps; it caps parallel speedup. | not the conflict rate
```

## T References {depth=2}
1. **PRIMARY** mantle-xyz/reth @574e7f3: `mantle-reth/crates/preconf/` (config, rpc, journal, dispatch, payload_builder, pool listener, canon_handler) and `rpc-ext`. The preconf implementation.
2. **PRIMARY** mantle-xyz/op-geth v1.6.3 @e33cd26: `preconf/`, `miner/preconf_checker.go`, `cmd/utils/flags.go`. The preconf implementation in the mainnet client.
3. **PRIMARY** mantlenetworkio/mantle-v2 @1780605: op-node sequencer and flags, op-batcher flags, `l1_block_info.go`; PR #370 and releases. Eager build and DA settings.
4. **PRIMARY** paradigmxyz/reth v2.2.0 @88505c7 (engine, persistence), the v2.9.0 release, the main-branch payload builder.
5. **PRIMARY** mantle-xyz/op-succinct @6b1cb57: Cargo.toml, MANTLE_CHANGES.md, validity state machine and proposer concurrency, guest cycle spans. The proving path.
6. **PRIMARY** Mantle production deployment profile: upstream-codebase-fix-alert `config/repos.json`, `docs/DESIGN.md` @6be759c (private). Who produces blocks; production settings.
7. **PRIMARY** Mantle mainnet RPC and L1 readings (2026-10-31): blocks, eth_feeHistory, receipts, batcher blobs, L2OutputOracle.
8. **PRIMARY** mantle-performance-test: `prover-network/` (@eaf4c5c) and the Q10 / Q11 test notes (private). Proving pipeline and mainnet load mix.
9. **PRIMARY** OP Spec: Ecotone derivation, Fjord, Granite, Jovian (exec-engine, l1-attributes, system-config), Subblocks.
10. **PRIMARY** EIP-1559, 7892, 8135, 8138, 2930, 7864; EF blog (Fusaka, Glamsterdam).
11. **PRIMARY** Base Docs: Denim (overview, 200ms-blocks, migrate-from-flashblocks), Azul proofs.
12. **PRIMARY** Paradigm, "Releasing Reth 2.0"; reth.rs storage docs; op-reth v2.8.0 release.
13. **PRIMARY** Succinct Docs (cycle tracking, prover gas, precompiles); SP1 Hypercube blog; ZKsync Airbender Prime.
14. **PRIMARY** Arbitrum feed relay docs; MegaETH Docs and Research; op-conductor README.
15. **PRIMARY** QMDB (arXiv 2501.05262), NOMT, base/triedb, megaeth-labs/salt, Monad MIP-8, Sei Giga docs, risechain/pevm.
16. **PRIMARY** Tempo payment lane spec; BNB Chain Payment Lane blog and Jenner announcement.
17. The author's draft (Notion drafts) and the GPT Deep Research review (Notion references). The object of review, and leads.
18. research-hub reports: high-performance-chain-roadmap, revm-vs-evm2. Background and the 2026-10 baseline.

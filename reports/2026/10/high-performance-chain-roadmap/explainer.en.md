---
template: research
lang: en
title: "High-Performance Chain Design: Components, Bottlenecks, and Mantle's Engineering Roadmap"
subtitle: Chain performance comes from 8 layers of work, not from the executor alone. Mantle mainnet now uses about 0.17% of its gas limit, so fix latency, ingress, and accounts first, then scale execution and state when measurements call for it.
cols: 4
type: Systems research · onboarding guide · engineering roadmap
audience: Protocol and infrastructure engineers new to Mantle who know EVM and OP Stack basics but have not studied high-performance chain design
scope: A general component model (L1 vs OP Stack-style L2); problems and 2026 practice for networking, consensus, block building and preconfirmations, execution, state, DA, proving, read paths, and fees; a review of 2025 internal research; Mantle's baseline and short / mid / long-term roadmap
evidence: 289-row claim ledger (observed 222 / inferred 60 / speculative 7); official docs, specs, papers, release notes; Mantle mainnet RPC and L1 batcher readings (2026-10-26); an internal load-test report (2026-06)
date: 2026-10-27 · v1
---
Key point first: chain performance is not one number. Different components limit throughput, latency, tail latency, state freshness, and sustained capacity ([F1](#F1)). Two things limit an L1: whether the slowest acceptable validator can replay blocks in time, and voting rounds. An L2 can make its real-time path fast, but its sustained capacity is the minimum of execution, DA, and proving ([F2](#F2)).

The industry moved faster in 2026 than our 2025 internal research. In reth, the state-root work left at block end is now 1–2 ms. Cold reads are the main remaining cost ([F9](#F9), [F11](#F11)). OP Stack chains moved preconfirmations away from rollup-boost / op-rbuilder, into short native blocks or in-house systems ([F8](#F8)). Ethereum blob capacity, shared by all L2s, is only about 152 KB/s ([F14](#F14)).

For Mantle: mainnet uses about 0.17% of its gas limit on average, and all latency growth in the load test came from queueing ([F19](#F19)). So the short term is measurement, an mStocks peak plan, sub-second preconfirmations, and the account layer. Parallel execution, JIT, and a new state structure start only when measurements justify them ([roadmap](#panel-T)).

## A The 8 layers of a chain {sheet span=2 meta="L1 vs OP Stack-style L2"}
| Layer | Done by (L1) | Done by (L2) | Limits first |
|---|---|---|---|
| ① Accounts and admission | txpool on every node | one sequencer entry point | invalid-request cost, queueing |
| ② Propagation | validator gossip | sequencer → nodes / RPC | latency, tail latency |
| ③ Ordering, consensus, block building | validator voting | sequencer orders alone | voting rounds, block interval |
| ④ Execution | every validator replays | sequencer, follower nodes, proof program | compute, dependency chains |
| ⑤ State and commitment | execution client | same, plus the output root | cold reads, state root |
| ⑥ Data availability | own blocks and blobs | batcher → L1 blobs | sustained capacity |
| ⑦ Verification and settlement | own consensus finality | derivation + proofs / challenges | sustained capacity, finality |
| ⑧ Read path and sync | node sync | unsafe / safe / finalized heads | state freshness, catch-up headroom |

One cross-cutting layer: resource metering and fees. It decides who pays and whose transactions wait under congestion.

## B Key numbers {sheet span=2 meta="all sourced"}
| Metric | Value | Source |
|---|---|---|
| Mantle mainnet average gas use | about 0.17% (24 h) | mainnet RPC, K3 |
| Mantle block time / limit / target | 2 s / 60M / 15M gas | K1, K2 |
| Saturated throughput in the internal load test | 29.5M gas/s ≈ the configured limit | K7, K10 |
| End-to-end latency in the load test | 3.4 → 18.2 s, all of the increase is queueing | K8 |
| Ethereum blob target capacity | about 152 KB/s, shared by all L2s | B33 |
| reth state root at block end | 1–2 ms (Reth 2.0) | E5 |
| Median parallelism of Ethereum blocks | below 2 | E18 |
| revmc JIT on L1 historical sync | 1–10% faster | E32 |

## C What projects do in 2026 {sheet span=2 meta="as of 2026-10-27"}
| Component | Representative approach | Status |
|---|---|---|
| Consensus | Solana Alpenglow (Votor) | ok live 2026-10-21; Rotor not scheduled |
| Consensus | MonadBFT: 300 ms blocks / 600 ms finality | ok mainnet |
| Preconfirmation | Base Denim: 200 ms canonical blocks | warn live on Sepolia, mainnet targeted for November |
| Preconfirmation | OP Subblocks replace Flashblocks | ok live 2026-08-31 |
| Ordering | Arbitrum PGA replaces Timeboost | ok 2026-09-24 |
| Execution | Sei Giga Ares (Block-STM style) | ok phase 1 in 2026-08 |
| State | Reth 2.0 sparse trie cache + Storage v2 | ok 2026-04 |
| L1 | Glamsterdam (ePBS + BAL) | warn mainnet date not set |

## D Mantle baseline {sheet span=2 meta="2026-10"}
```tree list
Mantle mainnet | OP Stack-based, SP1 validity proofs
  2 s blocks · 60M gas limit · 15M target | K1, K2
  Average gas use about 0.17% | K3
  Execution client: docs say op-geth | public RPC runs op-geth v1.6.x
  reth: a build runs on mainnet | sequencer switch is a 2026 H2 plan
  DA: Ethereum blobs | about 1 blob every 8 minutes
  Proofs: OP Succinct (SP1) | 12-hour withdrawal period
  Preconfirmation: allow-listed FIFO lane exists | no sub-second stream yet
  Eager next-block: shipped in v1.6.3 | mainnet status not confirmed
```

## E Roadmap at a glance {sheet span=2 meta="researcher proposal, not an approved plan"}
| Phase | Goal | Representative tasks |
|---|---|---|
| Short term, 0–3 months | See the bottlenecks; absorb the mStocks launch peak | Per-stage tracing and replay benchmark; SystemConfig peak plan; ingress backpressure; differential gate; sub-second preconfirmation prototype; native AA spec |
| Mid term, 3–6 months | Ship sub-second confirmation and the account layer | Preconfirmations on mainnet; native AA + 2D nonce hard fork; catch up with upstream reth; cancel-first lane; proving headroom |
| Long term, 6–12+ months | Change only what measurements prove | Conditional parallel execution and JIT; shorter blocks; follow the binary tree; DA options |

## F Conclusion {sheet span=2}
```callout ok Fix latency, ingress, and accounts first; scale after you measure
- Chain performance comes from 8 layers together. A 10× faster executor does not remove queueing, the block interval, DA, or proving limits.
- Mantle does not lack throughput today. mStocks needs predictable inclusion, fewer signatures, fresh state, and cancel-first ordering.
- Classify each change first: sequencer-only (A), parameter (B), hard fork (C), settlement interface (D). The class sets the cost.
- Start with [F19](#F19), [F21](#F21), and the [roadmap](#panel-T).
```

## G How to read this {depth=1}
```callout info You already know (not explained here)
- EVM transactions, gas, nonces, and contract storage
- The roles of the OP Stack sequencer, batcher, op-node, and execution client (EL)
- How a Merkle proof works
- Mantle uses OP Succinct (SP1) to produce validity proofs
```
- **5 minutes**: read overview panels A–F, then [F1](#F1), [F19](#F19), [F21](#F21).
- **30 minutes**: [Context](#panel-H) → [Background](#panel-I) → [Big picture](#panel-J) → component panels [K](#panel-K)–[Q](#panel-Q) → [Mantle baseline](#panel-S) → [Roadmap](#panel-T).
- **Everything**: add the [2025 research review](#panel-R) and [Method and evidence](#panel-V). The source of every claim is in `research/ledger.md`.
- **Exercise for new engineers**: after reading, answer the 4 questions at the end of [J](#panel-J).

## H Context: why redo this summary now {depth=2}
**The problem**: Mantle's high-performance research dates mostly from 2025. Five of its key conclusions are out of date, and three use the wrong measure ([F18](#F18)). The product focus has also moved to mStocks and trading experience, so the team needs a new system summary.

**Questions** (from the brief):
1. Which components make up a chain, top down? How does each one limit performance? How do L1 and L2 differ?
2. What problems does each component cause? What are the optimization paths? What do real projects do?
3. Which 2025 internal conclusions still hold?
4. Given mStocks, native AA, and execution quality, what should Mantle do in the short, mid, and long term?

**Scope and non-goals**:
- In scope: a general component model, L1 vs OP Stack-style L2, the 2026 status of major high-performance projects, Mantle's baseline and roadmap.
- Out of scope: token economics, markets, advice to other companies. Non-EVM chains are design references only.

**Decision rules** (set before the results):
- Every performance number must state its conditions: mainnet replay, synthetic load, or simulation.
- Separate "component gain" from "whole-chain gain": a 2× faster component does not make the chain 2× faster.
- The change class (A–D) sets complexity, the benefit sets priority, and dependencies set order.

## I Background {depth=2}
**Running example**: Alice buys one mStock with USDC from an AMM pool on Mantle. Each component section uses this order to show where it can get stuck.

```excalidraw q="Which concepts do you need, and in what order?" read="Gray dashed boxes are assumed knowledge; blue boxes are card IDs; arrows mean learn first → learn next; the green box is the decision this page supports." takeaway="Read B-1 and B-2 first: the five metrics and the two L2 paths are the two threads of this page." name=prereq-map kind="Prerequisite map"
{"grid": {"w": 300, "h": 110}, "defaults": {"w": 210, "h": 58, "fontSize": 16},
 "nodes": [
   {"id": "k1", "label": "EVM and gas", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "k2", "label": "OP Stack parts", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b1", "label": "B-1 Five metrics", "col": 1, "row": 0, "color": "blue"},
   {"id": "b3", "label": "B-3 Critical path", "col": 1, "row": 1, "color": "blue"},
   {"id": "b2", "label": "B-2 Two paths, three heads", "col": 1, "row": 2, "color": "blue"},
   {"id": "b4", "label": "B-4 State root", "col": 2, "row": 0, "color": "blue"},
   {"id": "b5", "label": "B-5 Preconfirmation", "col": 2, "row": 2, "color": "blue"},
   {"id": "b6", "label": "B-6 DA and blobs", "col": 2, "row": 3, "color": "blue"},
   {"id": "s", "label": "What should Mantle do first?", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "k1", "to": "b1"}, {"from": "b1", "to": "b3"}, {"from": "k2", "to": "b2"},
   {"from": "b3", "to": "b4"}, {"from": "b2", "to": "b5"}, {"from": "b2", "to": "b6"},
   {"from": "b4", "to": "s"}, {"from": "b5", "to": "s"}, {"from": "b6", "to": "s"}
 ]}
```

```prereq B-1 l1 3min
# Five performance metrics
what: Throughput is work done per unit of time. Latency is the time from submission until you can rely on a transaction. Tail latency looks at p99. State freshness is how far the state you read lags behind. Sustained capacity is the long-run limit with no backlog.
why: Each component limits a different metric. Parallel execution raises throughput, preconfirmations cut latency, and DA and proving set sustained capacity.
example: Mantle load test: saturated throughput 29.5M gas/s, chain-inherent latency 2 s, end-to-end 18.2 s.
misconception: Myth: high TPS means a good experience. Fact: in Mantle's load test, all added latency came from queueing, not from the chain.
deeper: [24] Mantle internal load-test report §3
```

```prereq B-2 l1 4min
# The two L2 paths and three heads
what: Real-time path: the sequencer orders and executes, producing unsafe blocks. Safety path: the batcher posts data to L1, nodes derive safe blocks from L1, and blocks become finalized once L1 finalizes.
why: An L2 lets the real-time path run ahead of the safety path. If the safety path falls behind for long, the backlog keeps growing.
example: OP Mainnet: unsafe about 2 s, safe in minutes, finalized in about 15–30 minutes.
misconception: Myth: 7 days is finality. Fact: 7 days is the standard bridge withdrawal delay, and a challenge does not reorg the L2 chain.
deeper: [3] OP Docs, Transaction finality
needs: B-1
```

```prereq B-3 l1 3min
# Critical path and pipelining
what: The critical path is the chain of steps that must finish in order. Pipelining overlaps different stages of different blocks.
why: Pipelining raises steady-state throughput but does not shorten one block's end-to-end time. This is the difference between "faster" and "more".
example: Parallel execution time T ≥ max(W/p, L): W is total work, p is threads, L is the longest dependency chain.
misconception: Myth: more threads give unlimited speedup. Fact: the dependency chain L does not shrink with more threads.
deeper: [5] Blumofe & Leiserson 1999
needs: B-1
```

```prereq B-4 l1 3min
# State root and merkleization
what: The state root is one hash that commits to all state. Each block writes its changes into the Merkle Patricia Trie (MPT) and rehashes up to the root. This step is merkleization.
why: Both block building and validation wait for the root. In 2024 the root took more than 75% of reth's block-sealing time. By 2026 reth runs it in a pipeline.
misconception: Myth: the root is always the bottleneck. Fact: Reth 2.0 cut the root work at block end to 1–2 ms.
deeper: [10] Paradigm, "Releasing Reth 2.0"
needs: B-3
```

```prereq B-5 3min
# Preconfirmation
what: The sequencer streams the order or results of some transactions before it seals the full block.
why: It sets how fast users see results. Mantle has no sub-second preconfirmations today, so its floor is the 2 s block interval.
misconception: Myth: a preconfirmation is finality. Fact: it carries the sequencer's trust assumption and can be withdrawn.
deeper: [13] OP Docs, Subblocks
needs: B-2
```

```prereq B-6 3min
# DA and blobs
what: Data availability (DA) means others can get the data they need to rebuild or verify the chain. An L2 compresses its transaction batches and posts them in Ethereum blobs.
why: However fast execution is, data that the batcher cannot post piles up. All L2s share blob capacity.
example: One blob holds 130,044 bytes; the current target is 14 blobs per block.
misconception: Myth: the state root is small, so the data to publish is small. Fact: a root cannot replace the data itself.
deeper: [15] OP Spec, Ecotone blob encoding
needs: B-2
```

## J The big picture: which components does one mStocks buy touch {depth=2}
Fig 2 puts Alice's order on the two L2 paths. The top row sets how fast Alice sees her fill. The bottom row sets how fast the fill becomes irreversible, and whether the system can keep running like this.

```excalidraw q="Which components does an L2 transaction pass, and which are on the real-time path?" read="The top row is the real-time path (blue); it sets latency and state freshness. The bottom row is the safety path (violet); it sets sustained capacity and finality. The red box is what limits Mantle's user experience first today. Simplified: deposits and the L1 origin are omitted." takeaway="Execution is only one segment of the real-time path; the bottom row sets sustained capacity." name=two-paths kind="System overview"
{"grid": {"w": 250, "h": 150}, "defaults": {"w": 190, "h": 66, "fontSize": 16},
 "nodes": [
   {"id": "u", "label": "Wallet / account\n① admission", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "rpc", "label": "RPC and txpool\nqueueing", "col": 1, "row": 0, "color": "red"},
   {"id": "seq", "label": "Sequencer\n③ order ④ execute", "col": 2, "row": 0, "color": "blue"},
   {"id": "root", "label": "⑤ State root\nseal block", "col": 3, "row": 0, "color": "blue"},
   {"id": "read", "label": "⑧ RPC reads\nnew state", "col": 4, "row": 0, "color": "blue"},
   {"id": "bat", "label": "Batcher\ncompress", "col": 2, "row": 1, "color": "violet"},
   {"id": "da", "label": "⑥ L1 blobs", "col": 3, "row": 1, "color": "violet"},
   {"id": "prv", "label": "⑦ Derive + SP1 proof", "col": 4, "row": 1, "color": "violet"}
 ],
 "edges": [
   {"from": "u", "to": "rpc"}, {"from": "rpc", "to": "seq"}, {"from": "seq", "to": "root"},
   {"from": "root", "to": "read"}, {"from": "seq", "to": "bat", "dashed": true},
   {"from": "bat", "to": "da"}, {"from": "da", "to": "prv"}
 ]}
```

```finding F1 high
# Performance is not one number: five metrics, each limited by different components
claim: Pipelining raises steady-state throughput but does not shorten one block's latency. A preconfirmation gives feedback earlier but does not speed up finality. Parallel execution can only use independent work that already exists. A fast read response does not mean fresh state.
evidence: [inferred] From the work/span bound, the semantics of RISE shreds and OP Subblocks, and Block-STM's ordering-equivalence rule (ledger S8, B7, B17, E11, R14). [inferred] The read-path trade-off (B65).
implication: Before you judge any optimization, write down which metric and which layer it changes.
```

```finding F2 high
# L1 and L2 limits come from different places
claim: Every L1 validator replays every block, so the slowest acceptable validator's replay and catch-up speed limits capacity. Normal-path voting rounds have a theoretical lower bound. An L2's real-time path can be fast, but sustained capacity is the minimum of execution, DA posting, and proving.
evidence: [observed] Solana required more than 70% of stake to run XDP before 100M CU blocks. It also noted that large blocks slow replay (S16, S59). Two-step Byzantine consensus needs n ≥ 5f−1 (S21). [observed] In the OP Stack, nodes drop data that the batcher did not post within the 12-hour sequencing window (S5). [inferred] S60.
implication: Judge any L2 "high performance" claim together with its DA and proving headroom, not only by how many transactions the sequencer executed.
```

```uml q="How does an OP Stack sequencer build one block, and which step is on the critical path?" read="op-node first prepares payload attributes (deposits first), then the EL pulls transactions from the txpool and executes them, then getPayload seals the block and computes the state root. Eager next-block moves the start of the next block to right after sealing. Simplified." takeaway="Sealing waits for the state root; tail latency comes mostly from the root and storage IO."
sequenceDiagram
  autonumber
  participant N as op-node
  participant E as EL (op-geth / reth)
  participant P as txpool
  participant G as P2P / RPC
  N->>E: forkchoiceUpdated(attrs: L1 info + deposits)
  activate E
  E->>P: pull transactions by tip
  E->>E: execute transactions
  N->>E: getPayload
  rect rgb(251, 234, 234)
    E->>E: compute state root, seal
  end
  E-->>N: payload
  deactivate E
  N->>G: gossip unsafe block
  N->>E: next forkchoiceUpdated (eager next-block)
```

**Self-check for new engineers**: after reading the page, you should be able to answer these 4 questions.
1. An RPC replies fast, but the router's quotes keep failing. Which layer could be stuck?
2. If the block interval drops from 2 s to 200 ms, which fixed costs now happen 10 times per second?
3. At the same 1,000 TPS, why do transfers and liquidations put different loads on the chain?
4. An optimization raises sequencer throughput. Which two downstream paths must you check?

## K Component ①: accounts, transaction expression, and admission {depth=2}
**What goes wrong** (Alice's order):
- One business action becomes several protocol actions: get gas, approve, swap, buy. Each step needs a signature and a wait.
- Admission costs come before fees: an invalid transaction uses parsing, signature checks, and simulation before the node rejects it.
- Nonce head-of-line blocking: if one transaction from an account is stuck, unrelated later actions also wait.

**Optimization paths and examples**:
| Path | Example | Status |
|---|---|---|
| One transaction, many actions | Base Everest: EIP-8430 native batching, sponsorship, token-paid gas | warn date TBD |
| Protocol-level smart accounts | Ethereum Hegotá headliner Frame Tx (EIP-8141); Mantle evaluates EIP-8130 / 8141 | warn planned |
| Concurrent nonces | Mantle roadmap: 2D nonce | warn H2 plan |
| Cheap checks before admission | EIP-7825: the txpool rejects transactions above 2^24 gas | ok live since Fusaka |
| Declared read/write sets | Solana: transactions declare accounts; the scheduler locks them | ok mainnet |

```finding F3 high
# At peak load, ingress breaks first, not execution
claim: At saturation in Mantle's load test, end-to-end latency rose from 3.4 s to 18.2 s. All of the increase came from self-queueing and mempool backlog. The HTTP 429 rate on writes was 7.9% (67% before tuning). Many bots racing for the same borrower caused 27–49% guard reverts.
evidence: [observed] Internal load-test report, 2026-06-24 (ledger K8, K9). [inferred] R7.
implication: Before mStocks launches, add ingress rate limits, sender-side backpressure, and hot-spot partitioning. The native AA design must also cover txpool validation budgets, revocation, and sponsorship failure semantics.
```

## L Component ②: propagation {depth=2}
**What goes wrong**:
- Leader upload fan-out: sending one block to N nodes needs bandwidth that grows with N.
- Hop count: each hop costs at least one one-way network delay. Anza holds that network latency, not transfer or compute time, mostly sets propagation delay.
- On an L2, the matching problem is not network-wide voting. It is distribution from the sequencer to follower nodes, RPCs, and apps.

**Optimization paths and examples**:
| Path | Example | Status |
|---|---|---|
| Erasure coding + multi-level tree | Solana Turbine | ok mainnet |
| Erasure coding + two-level tree; upload independent of node count | Monad RaptorCast: worst case 1 RTT | ok mainnet |
| Single relay layer, fewer hops | Alpenglow Rotor | no not scheduled |
| Dedicated low-latency network | DoubleZero: about 58% of Solana stake connected (project dashboard) | warn ingress filtering not live |
| L2 streaming distribution | OP Stack p2p for unsafe blocks; preconfirmation streams | ok |

```finding F4 medium
# Before raising block capacity, prove the network can deliver in time
claim: Under 20% packet loss and 33% malicious nodes, RaptorCast sends about 87% extra chunks so that it never retransmits. Before raising blocks to 100M CU, Solana required more than 70% of stake to run XDP kernel-bypass networking.
evidence: [observed] Monad Docs, RaptorCast (S12, S13); Solana 100M CU page (S16). [observed] Rotor is not scheduled (S14).
implication: For a single-sequencer L2, the main network work is read-path distribution and preconfirmation streams, not consensus propagation.
```

## M Component ③: ordering, consensus, block building, and preconfirmation {depth=2}
This layer does three jobs. **Ordering** decides the sequence. **Block building** decides which transactions go in and when to seal. **Consensus** makes many parties accept the same chain. An L1 does all three; a single-sequencer L2 mainly does the first two.

```finding F5 high
# Consensus rounds have a lower bound; "faster" is paid for with assumptions
claim: Partially synchronous Byzantine consensus can decide in 2 message delays only if n ≥ 5f−1; PBFT-style protocols need 3. Alpenglow's roughly 150 ms is a simulated median without compute cost, with "20% malicious + 20% offline" fault tolerance. MonadBFT runs 300 ms blocks with 600 ms finality.
evidence: [observed] PODC'21 paper (S21); solana.com Alpenglow page and Anza blog (S22–S25); Monad Docs (S29–S31). [inferred] No public mainnet measurement yet (S26).
implication: Before you compare finality numbers, check whether each one comes from a simulation, a self-test, or mainnet.
```

```finding F6 medium
# Decoupling execution from consensus buys execution time at the cost of user-visible semantics
claim: Monad's consensus agrees only on order, and proposals carry the state root from D=3 blocks earlier. Consensus sees only old state, so Monad adds a 10 MON reserve balance. Ethereum Glamsterdam adopts ePBS (EIP-7732); delayed execution (EIP-7886) is Stagnant.
evidence: [observed] Monad Docs (S41–S43); EIP-7732 / 7886 / 7773 (S45–S47). [inferred] Costs include a lagging root, changed admission rules, and later detection of divergence (S58).
implication: An L2 sequencer does not vote anyway. For Mantle, the useful lesson here is to move merkleization off the critical path. See [O](#panel-O).
```

```finding F7 high
# L2 tail latency comes from the state root and storage IO
claim: OP Stack block building is a serial loop: prepare attributes → execute → getPayload seals (computes the root) → gossip. On Base mainnet, one root per Flashblock took about 130 ms. After Base moved the root to the final block only, build P50 fell from 150 ms to 10 ms. In Base's own test, Geth build p99 was 2,319 ms and Reth 698 ms.
evidence: [observed] OP Spec exec-engine (B1); Base blog (B2–B4); before NVMe, OP Mainnet blocks degraded to 2.5–3 s (B5). [inferred] B8.
implication: Mantle's eager next-block construction shortens the gap between blocks. The next gain is in the root and IO, not in the interpreter.
```

```timeline v
2025-04 | Arbitrum Timeboost goes live | 60 s express-lane auction
2025-07 | Base Flashblocks on mainnet | one every 200 ms inside a 2 s block
2025-08 | Unichain 200 ms Flashblocks | builder runs in a TEE
2026-02 | MegaETH mainnet | about 10 ms mini-blocks
2026-08-31 | OP Subblocks go live | OP Labs stops supporting op-rbuilder
2026-09-24 | Arbitrum PGA replaces Timeboost | 250 ms blocks, 125 ms rounds
*2026-10-21 | Base Denim live on Sepolia | 200 ms canonical blocks, mainnet targeted for November
```

```finding F8 high
# In 2026, preconfirmations moved into the protocol or in-house stacks; the trust assumption did not change
claim: Base plans to retire Flashblocks in Denim and produce a canonical block, with its own state root, every 200 ms. OP Labs replaced Flashblocks with its own Subblocks and will stop running op-rbuilder once migrations finish. OP docs state a subblock preconfirmation can be withdrawn under the same conditions in which the sequencer can reorg unsafe blocks. MegaETH's sequencer signs each mini-block header, and the signature is not finality.
evidence: [observed] Base Docs (B13, B14); OP Docs (B15–B17); MegaETH Docs (B21). [inferred] B27.
implication: Read "Flashblocks" in Mantle's roadmap as the capability "sub-second preconfirmation". It does not need rollup-boost / op-rbuilder (R3).
```

## N Component ④: execution (scheduling and VM) {depth=2}
The execution layer has three kinds of bottleneck, each with a different fix:
- **Compute**: interpreter dispatch, precompiles, keccak. Interpreter work or JIT can shrink it.
- **Waiting for state**: cold SSD reads and trie read amplification. Prefetching, caching, and better storage can shrink it.
- **Business-level serial dependencies**: many transactions change the same pool. Only a change in the application or the state layout helps.

```finding F9 high
# In 2026 reth-class clients, the remaining bottleneck is cold reads, not the interpreter
claim: Base measured that blocks with heavy storage access take about 30× longer to execute than blocks without it. evm2's interpreter work is only 4.8–6.2% faster on mainnet replay. revmc JIT is 1.85–19× faster on synthetic loads but only 1–10% faster on L1 historical sync.
evidence: [observed] Base blog (E3, E4); revm-vs-evm2 ledger H37 (E8); Paradigm revmc blog (E32). [inferred] E9, E38.
implication: JIT matters only for compute-heavy contracts. Mantle should first measure the compute share with a profile, then decide (R12).
```

```finding F10 high
# Real workloads have little parallelism; parallel designs come in three kinds
claim: Declared (Solana account locks, Sui object ownership), optimistic (Block-STM, Monad, Sei Giga Ares), and validation-assisted (EIP-7928 BAL). Recent Ethereum blocks have a median parallelism below 2. RISE pevm averages about 2.02× on in-memory mainnet replay. reth and geth both implement the BAL path, but Glamsterdam is not on mainnet, so it is not active there.
evidence: [observed] Block-STM paper and chain docs (E11–E15); MegaETH research page and pevm benches (E18, E19); EIP-7928, reth v2.8.0, geth v1.17.9 (E20, E22, E28, E29). [inferred] E31.
implication: Mantle's 2025 "49.1% dependency rate" used heuristics (same sender, same contract and selector). It is not an upper bound on parallel gains. Measure slot-level read/write sets first (M43, M45).
```

## O Component ⑤: state access, commitment, and persistence {depth=2}
One write goes through four steps. Read the old value, keep a revertible change, update the trie and root, then persist in batches. Each step has its own bottleneck.

```finding F11 high
# The state root is no longer reth's critical-path bottleneck; moving it off the path is now common
claim: Reth 2.0 keeps a sparse trie cache across blocks, which cuts the root work at mainnet block end to 1–2 ms. Paradigm restarted revmc because of this and plans full parallel execution on BAL. Monad delays the root by D=3 blocks; RISE shreds skip it on the preconfirmation path. Sei Giga uses an LtHash digest of the write log. The EF Hegotá tier list defers EIP-7862 (delayed state root).
evidence: [observed] Paradigm blog and reth v2.0.0 release (E5, E7, E51); Monad Docs (E49); RISE blog (B7); Sei Docs (E55); EF Hegotá post (E54). [inferred] E56.
implication: The 2025 conclusion "execution takes only 1/6–1/10 of merkleization time" no longer holds (E70).
```

```finding F12 medium
# Storage: a trie on top of a KV store amplifies reads; new structures mostly cite their authors' own benchmarks
claim: base/triedb estimates that an MPT inside a generic KV store needs about 50 disk operations per value. Page-based layout cuts this to about 4–8. MonadDb implements the Patricia trie natively with io_uring; MIP-8 changes the storage commitment to 4 KiB pages. Reth Storage v2 cut persistence for gigagas-scale blocks from 8.4 s to 0.4 s. QMDB claims 6× over RocksDB, and NOMT has shipped 1.0.x.
evidence: [observed] base/triedb README (E39); Monad Docs and MIP-8 (E40, E41); Paradigm (E6, E46); QMDB paper and Commonware (E42, E43); NOMT (E44). [inferred] E48.
implication: Storage work that keeps the MPT root unchanged is class A. Changing the commitment structure is class D (see [S](#panel-S)).
```

```finding F13 medium
# State growth means "put it all in RAM" is not free
claim: In 2026-01 the geth state database was about 390 GiB. After the gas limit went from 30M to 60M, state grows about 116 GiB per year. Since 2025-07, all execution clients can drop pre-merge history (saving 300–500 GB). Full rolling history expiry and state expiry are still research. MegaETH's 2024 "all state fits in RAM" assumed about 100 GB.
evidence: [observed] EIP-8037 (E61); EF blog (E57–E59); MegaETH research page (E64, E67). [inferred] E69.
implication: Keeping state in memory only fixes read latency. It does not remove the cost of the root, persistence, DA, or proving.
```

## P Components ⑥⑦: data availability, proving, and settlement {depth=2}
These two layers set sustained capacity. However fast the sequencer runs, the backlog grows if the batcher cannot post data or proofs fall behind.

```finding F14 high
# Shared blob capacity is about 152 KB/s, and small transactions hit DA limits first
claim: One OP Stack blob holds 130,044 bytes. After BPO2, the blob target / max per block is 14 / 21, or about 152 / 228 KB/s, shared by all L2s. At 100 bytes per transaction, that supports about 1,500 / 2,300 TPS. If Mantle filled its 60M gas / 2 s blocks with 21k-gas transfers, it would need about 143 KB/s. EigenDA V2 claims 100 MB/s, but its security rests on a restaking quorum.
evidence: [observed] OP Spec (B30); EF Fusaka announcement (B31); EigenDA blog (B37). [inferred] B33, B34, R8; B39.
implication: Raising the gas limit alone does not add capacity for small Mantle transactions. Capacity plans must include compression ratios and blob prices.
```

```finding F15 medium
# Proving capacity is a sustained limit; the common pattern is TEE / optimistic plus ZK on demand
claim: Base wrote that an optimistic system "cannot produce more data than the proof system can prove". Base Azul uses TEE + ZK multi-proofs: when both agree, settlement takes 1 day. BOB's Kailua is optimistic by default and proves only 6 blocks in a dispute. Axiom's own test proves L1 blocks on 4 RTX 5090s with p99 of 9.7 s.
evidence: [observed] Base blog and Docs (B42, B43); BOB Docs (B47); Axiom (B48); Ethproofs (B49). [speculative] A linear extrapolation by gas rate suggests real-time proving of a 200 Mgas/s L2 needs about 40× the GPUs (B50).
implication: Mantle publishes no proof latency. Every capacity change must include "proof lag" as an acceptance metric (R9).
```

## Q Component ⑧ and cross-cutting: read path and fee metering {depth=2}
```finding F16 medium
# A fast response is not fresh state
claim: MegaETH replica nodes apply the sequencer's execution results without re-executing; full nodes re-execute on their own. On Base's Flashblocks-aware RPC, the block context of `eth_call pending` can lag by about 5 blocks. The returned state still includes every Flashblock received. OP Subblocks require RPC nodes to execute transactions themselves to get state.
evidence: [observed] MegaETH Docs (B62); Base Docs (B64); OP Docs (B15). [inferred] B65.
implication: Routers and market makers need fresh state with a version number. Measure RPC response time and state freshness separately.
```

```finding F17 medium
# Fees allocate capacity: Jovian already puts DA into the base fee
claim: OP Stack Jovian adds a minimum base fee and a DA footprint. It estimates each transaction's DA bytes with FastLZ and adds them to `blobGasUsed`. The base fee then updates with max(gasUsed, blobGasUsed). Before this, chains could only throttle the batcher, which pushed the base fee down and caused priority-fee auctions. Arbitrum shipped multi-dimensional pricing in ArbOS 61 but says not to enable it; EIP-7999 is still a Draft.
evidence: [observed] OP Spec Jovian (B52, B53); Arbitrum notice (B57); EIP-7999 (B60); ZKsync OS double accounting (B58); MegaETH dual gas (B59).
implication: Mantle already aligned with Jovian in Arsia (M9, M10). Before the mStocks peak, rehearse SystemConfig parameters before you consider new fee dimensions.
```

## R Review of 2025 internal research {depth=2}
| 2025 conclusion | 2026 status | Source |
|---|---|---|
| Execution takes 1/6–1/10 of merkleization time | no outdated: Reth 2.0 root tail is 1–2 ms | E5, E70 |
| Verkle may arrive in 2025 | no outdated: moved to the EIP-7864 binary tree (Draft) | E71, M46 |
| JIT gives about 2× | warn not realized: 1–10% on L1 sync | E32, E33, M50 |
| Mantle dependency rate 49.1% | warn heuristic measure, not a slot conflict rate | E21, M43, M45 |
| Base lowered its gas limit | no it lowered the target; the limit went up | B66 |
| Small / streamed blocks | warn partly done: eager build shipped, no sub-second stream | M48 |
| Switch to Reth in the mid term | warn in progress: sequencer switch is an H2 plan | M47 |
| op-node needs a protocol change to not wait for L1 deposits | no not needed: the L1 origin may lag up to 600 s | M49 |
| Alpenglow lowers fault tolerance to 20% | no incomplete: 20% malicious + 20% offline | S24 |
| RISE "consensus takes 40–80%" | warn no primary source found | B9, E72 |

```finding F18 high
# Five key 2025 conclusions are outdated, and three need a different measure
claim: Outdated: root is 6–10× execution, Verkle in 2025, Base lowered its gas limit, Alpenglow tolerance of 20%, op-node needs a protocol change. Wrong measure: JIT gives 2×, the 49.1% dependency rate, RISE's 40–80%.
evidence: [observed] E5, E52, B66, S24, E21. [inferred] E70, E71, M45, M49. [speculative] The RISE figures have no primary source (B9, E72).
implication: Before you quote a 2025 internal number, check this table.
```

## S Mantle: baseline, constraints, and change classes {depth=2}
```finding F19 high
# Mantle does not lack throughput: mainnet uses about 0.17% of its gas limit
claim: Mainnet reading on 2026-10-26: 2 s blocks, 60M gas limit, 15M gas target, and the base fee sits at its 50 gwei floor. Average gas use over 24 hours was about 0.17%, with a single-block peak of about 8.4%. The internal load test saturated at 29.5M gas/s, about 60M ÷ 2 s. That is the configured limit, not the execution layer's limit.
evidence: [observed] Mainnet RPC `eth_feeHistory` and block extraData (K1–K3); internal load test (K7). [inferred] K10, R1.
implication: Short-term gains come from latency, ingress, and accounts. Absorb the post-launch mStocks peak with a parameter plan and backpressure, not by scaling execution first.
```

```finding F20 high
# What Mantle has already done: Jovian alignment, blobs, ZK proofs, eager build shipped
claim: Arsia (mainnet 2026-04-22) activated 8 OP forks at once, from Canyon to Jovian. It brought span batches, Brotli, a three-part fee, dynamic EIP-1559, and the DA footprint. DA moved from EigenDA to Ethereum blobs, now about 1 blob every 7–8 minutes. Since 2025-09-16, state roots go through OP Succinct (SP1); the 12-hour withdrawal period is a safety buffer. v1.6.3 Elysium includes eager next-block construction.
evidence: [observed] mantle-v2 releases and Mantle Docs (M5, M7–M10, M12, M13, M25, M26); L1 batcher transactions (K6). [inferred] Public data cannot confirm that eager build is on for mainnet (M15, K5).
implication: Do not list span batches, Brotli, or eager build as new projects. The next step is to confirm eager build runs on mainnet.
```

```excalidraw q="Which components does a change touch, and where does the complexity come from?" read="Left to right, each class includes the work of the one before. The classes follow what the canonical protocol must change. Blue A/B keep the protocol: A changes the sequencer or EL implementation, B changes parameters. Yellow C changes the protocol: op-node, both ELs, and kona change, and the SP1 vkey rotates. Red D also changes L1 withdrawal proofs." takeaway="Classify a change before you estimate it: A/B iterate fast; C/D go into a hard fork." name=change-levels kind="Change classes"
{"grid": {"w": 270, "h": 150}, "defaults": {"w": 230, "h": 96, "fontSize": 15},
 "nodes": [
   {"id": "a", "label": "A Sequencer only\npreconf · lanes · swap EL", "col": 0, "row": 0, "color": "blue"},
   {"id": "b", "label": "B SystemConfig\ngas target · min base fee", "col": 1, "row": 0, "color": "blue"},
   {"id": "c", "label": "C Hard fork\nnative AA · BAL · block time", "col": 2, "row": 0, "color": "yellow"},
   {"id": "d", "label": "D Settlement interface\nnew state commitment", "col": 3, "row": 0, "color": "red"}
 ],
 "edges": [{"from": "a", "to": "b"}, {"from": "b", "to": "c"}, {"from": "c", "to": "d"}]}
```

```finding F21 high
# The change class sets the complexity: class C changes Go, Rust, and the proof program together
claim: Mantle builds its SP1 proof program from kona, and the program redoes derivation and execution inside the zkVM. So any change to derivation or the state transition must change op-node, op-geth, reth / op-revm, and kona, and rotate the vkey. A change to sequencer scheduling that keeps canonical results does not touch proofs. A new state commitment also affects withdrawal proofs on L1.
evidence: [observed] OP Succinct does not change op-geth / op-batcher / op-node (M55); Mantle SP1 Workflow (M56); output root construction (M60). [inferred] M57, M59, R5.
implication: Swapping the EL is class A but carries class C verification work. In 2026-01, Mantle already had one incident where revm and geth disagreed and the prover could not produce a ZKP (M58, R4).
```

**What the four mStocks user groups need** (inferred, M42, R6):
| User | Needed property | Main layers |
|---|---|---|
| Issuer | predictable inclusion, finality semantics it can reconcile | ① ③ ⑧ ⑦ |
| Retail buyer | fewer signatures, fresh quotes, sub-second feedback | ① ③ ⑧ |
| Market maker / Prop AMM | cancel-first ordering, low tail latency, fresh state | ③ ⑧ |
| Agent | concurrent nonces, scoped sponsorship, no sponsor hot spot | ① |

## T Mantle roadmap: short, mid, and long term {depth=2}
The schedule follows three rules: benefit comes from mStocks scenarios, complexity from the change class (A–D), and order from dependencies. This is a researcher proposal, not a plan Mantle has approved (R17).

**Short term (0–3 months, 2026-11 to 2027-01). Goal: see the bottlenecks, absorb the mStocks launch peak, and decide how to do sub-second preconfirmations.**
| Task | Class | Why now | Source |
|---|---|---|---|
| Per-stage tracing: submit → admit → queue → execute → root → readable → batch → proof | A | Baseline for accepting every later change | R9, K8 |
| Mainnet block replay benchmark + slot-level dependency graph | A | Decides whether parallel execution and JIT start | R12, M45 |
| mStocks peak plan: rehearse gas target, denominator, min base fee | B | Cheapest lever; the load test saw the base fee rise 893% | R10, K9 |
| Ingress rate limits, sender-side backpressure, RPC read/write isolation | A | All added load-test latency was queueing | R7 |
| Confirm and enable eager next-block on mainnet | A | Shipped, mainnet status unconfirmed | M15, K5 |
| Block-by-block differential gate: op-geth ↔ reth ↔ kona | A | Prerequisite for the pure-reth switch | R4, M58 |
| Sub-second preconfirmation: define semantics (prefix lock, signatures, withdrawal rules) and prototype on the reth builder | A | 2 s is today's latency floor | R2, R3, B11, B21 |
| native AA (8130) + 2D nonce: spec and PoC | C | Hard forks take long; start now | M38, M39 |

**Mid term (3–6 months). Goal: ship sub-second confirmation and the account layer; catch execution up with upstream.**
| Task | Class | Condition / reason | Source |
|---|---|---|---|
| Sub-second preconfirmations on mainnet; RPC exposes preconfirmed state; measure state freshness | A | After the prototype passes | F8, F16 |
| Sequencer on pure reth, geth as hot standby | A | Differential gate passes continuously | M23, R4 |
| Catch up with upstream reth (prewarm reuse, BAL path) | A | Low-risk execution and state gains | R16 |
| native AA + 2D nonce hard fork | C | Changes op-node, both ELs, kona, vkey | R5, M57 |
| Prop AMM cancel-first lane: capacity cap, auditable rules, on-chain governance | A/B | Keeps a dedicated lane from crowding out regular users | M40 |
| Distributed GPU proving network on mainnet; proof lag in acceptance criteria | A | Proving headroom before scaling | K11, R9 |
| Glamsterdam alignment (Sequencer / Prover / RPC) | C | Follows the L1 schedule | K12 |

**Long term (6–12 months and beyond). Goal: change only the remaining bottlenecks that measurements prove.**
| Task | Class | Start condition | Source |
|---|---|---|---|
| Optimistic parallel execution inside the sequencer | A | The slot-level dependency graph shows enough independent work | R11, R12 |
| Validator-side BAL parallelism | C | Assess with Glamsterdam alignment | R11, E26 |
| JIT for hot contracts | A | Profiles show a high compute share | R12, F9 |
| Shorter blocks (for example 200 ms canonical) | C | Root and persistence at millisecond scale, and proving keeps up | R15 |
| DA options: compression, blob prices, other DA layers | B/C | Demand nears shared blob capacity | R8 |
| Follow Ethereum's binary tree (EIP-7864) | D | After Ethereum finalizes it | R13 |

```uml q="Which roadmap tasks depend on which?" read="An arrow means finish first → then start. Green is short term, blue is mid term, yellow is conditional long-term work." takeaway="Per-stage tracing, the replay benchmark, and the differential gate are shared prerequisites for all later work."
flowchart TB
  t["Per-stage trace + replay benchmark"]:::s --> dep["Slot-level dependency graph"]:::s
  t --> par["Peak plan + ingress backpressure"]:::s
  diff["Block-by-block differential gate"]:::s --> reth["Sequencer on pure reth"]:::m
  reth --> up["Catch up with upstream reth"]:::m
  pc["Preconf semantics + prototype"]:::s --> pcm["Sub-second preconf on mainnet"]:::m
  pcm --> lane["Cancel-first lane"]:::m
  aa["native AA + 2D nonce spec"]:::s --> hf["Account-layer hard fork"]:::m
  dep --> pe["Parallel execution (conditional)"]:::l
  up --> pe
  t --> jit["JIT (conditional)"]:::l
  prov["Proving network on mainnet"]:::m --> blk["Shorter blocks (conditional)"]:::l
  up --> blk
  classDef s fill:#e6f4ea,stroke:#2e7d32
  classDef m fill:#e8f0fe,stroke:#1a56db
  classDef l fill:#fff8e1,stroke:#b7791f
```

```callout warn CAUTION
Do not switch the EL, enable new AA semantics, and change ordering rules in the same release. If a differential check then fails, you cannot locate the cause. The 2026-01 ZKP incident was an equivalence problem (M58).
```

## U Limits and open questions {depth=2}
- **Public data cannot confirm the mainnet sequencer's real setup**: the op-node version (is eager build on?), the execution client, and whether the preconfirmation lane is active (K5, M15). We guess the sequencer still runs mainly on op-geth ([speculative] M24).
- **Mantle publishes no proof latency** (M26). The "proving headroom" threshold in the roadmap needs operations data.
- **No Mantle-specific execution profile exists**. The E findings come from Ethereum and Base data; Mantle's more concentrated load may differ.
- **The load test used synthetic load**: mock contracts on the Sepolia QA chain, not a fork of mainnet state (K7).
- **mStocks terms have only secondary sources**: the claim that Halo Prime Limited is the issuer has no primary text ([speculative] M36). The launch target is 2026-11 (M34).
- **Many external numbers are self-reported or simulated**: Alpenglow 150 ms, QMDB 6×, RISE 5 Ggas/s, Sei 5 Ggas/s.
- **Sources conflict on Firedancer's role after Alpenglow** ([speculative] S57).

## V Method and evidence {depth=3}
- **Inputs**: the author's Notion drafts; 29 internal 2025 high-performance notes (Notion); a ChatGPT Deep Research result (leads only; see `research/gpt-deep-research.md`).
- **Research**: four parallel lanes: systems and consensus (S), L2 building / DA / proofs (B), execution and state (E), Mantle (M). We traced every claim to a primary source.
- **Main-session checks** (K): Mantle mainnet RPC (`cast block`, `eth_feeHistory` over 24 windows), L1 batcher transactions (Blockscout + `cast tx`), mantle-xyz releases and tags, the internal load-test report, and Mantle's official roadmap. We spot-checked 5 observed claims (`notes-mainsession.md` §7).
- **Synthesis** (R): the roadmap's basis; each row names the rows it comes from.
- **Ledger**: 289 rows, observed 222 / inferred 60 / speculative 7.

Reproduce the mainnet readings:
```bash title="Mantle mainnet parameters and gas use"
R=https://rpc.mantle.xyz
cast block latest -r $R --json | jq '{gasLimit,baseFeePerGas,extraData}'
cast rpc eth_feeHistory 1024 latest '[]' -r $R \
  | jq '(.gasUsedRatio|add)/(.gasUsedRatio|length)'
```

## W Glossary {depth=2}
```glossary
sequencer | | The L2 node that receives, orders, and executes transactions and produces blocks. | not a validator set
derivation | | Rebuilding L2 blocks deterministically from L1 data only. | not syncing from the sequencer
unsafe block | unsafe head | A block the sequencer produced that cannot yet be derived from L1 data. | not an invalid block
preconfirmation | preconf | The sequencer publishes the order or results of some transactions before the full block is sealed. | not finality
state root | | One hash that commits to all state, recomputed every block. | not the block hash
merkleization | | Writing state changes into the trie and rehashing up to the root. | not persistence
critical path | | The chain of steps a piece of work must finish in order. | not the most expensive step
pipelining | | Overlapping different stages of different blocks to raise steady-state throughput. | does not cut one block's latency
sustained capacity | | The long-run limit with no backlog, set by the smallest of execution, DA, and proving. | not peak TPS
state freshness | freshness | How far the state you read lags behind the latest execution result. | not RPC response time
DA | data availability | The guarantee that participants can get the data needed to verify or rebuild the chain. | not propagation
blob | EIP-4844 blob | A large data object attached to an Ethereum block; L2s post batches in it. | not calldata
BPO | blob-parameter-only fork | A small fork that changes only the blob target / max. |
eager next-block construction | | Start building the next block right after sealing the previous one, to shorten the gap. | not a preconfirmation
BAL | block-level access list, EIP-7928 | The block lists the state each transaction read and wrote, so validators can work in parallel. | not a scheduler
Block-STM | optimistic parallel execution | Run in parallel first, then validate read sets in the preset order and re-execute on conflict. | result equals serial order
reserve balance | | Monad's rule that lets consensus include transactions safely while it sees only old state. |
ePBS | EIP-7732 | Proposer-builder separation that moves payload validation off the consensus critical path. | not delayed execution
JIT | just-in-time compilation | Compile hot contract bytecode to machine code at run time. | does not change gas semantics
cold read | | A read of state that is not cached in memory and must hit the SSD. |
sparse trie | | Loads only the changed trie paths, used to compute the root in the background. |
SystemConfig | L1 config contract | An L1 contract whose parameters reach L2 through derivation, such as gas target and min base fee. | changing it needs no hard fork
DA footprint | Jovian DA metering | Adds estimated DA bytes to a block's `blobGasUsed`, which feeds the base-fee update. | not the L1 data fee
kona | Rust OP Stack implementation | Mantle's SP1 proof program is compiled from it and redoes derivation and execution in the zkVM. |
vkey | verification key | The key an L1 contract uses to verify SP1 proofs; it rotates whenever the proof program changes. |
2D nonce | two-dimensional nonce | One account has several independent nonce sequences, which avoids head-of-line blocking. | does not remove state conflicts
native AA | native account abstraction | Protocol-level support for smart accounts, sponsorship, and session keys. | not ERC-4337
replica node | | A read node that applies the sequencer's results without re-executing. | not a full node
```

## X References {depth=2}
1. **PRIMARY** ethereum.org, "Nodes and clients". The split between execution and consensus clients.
2. **PRIMARY** OP Stack Spec, "Derivation" and "L2 Execution Engine". Derivation, the three heads, the Engine API block flow.
3. **PRIMARY** OP Docs, "Transaction finality" and "Fault proofs explainer". Timing of each stage and trust assumptions.
4. **PRIMARY** Kuznetsov, Tonkikh, Zhang, PODC'21 (arXiv 2102.12825). Round lower bound for fast Byzantine consensus.
5. **PRIMARY** Blumofe & Leiserson, JACM 1999; Block-STM (arXiv 2203.06871). The work/span bound and optimistic parallelism.
6. **PRIMARY** Monad Docs: Asynchronous Execution, Reserve Balance, RaptorCast, MonadBFT, MonadDb, MIP-8, JIT Compilation.
7. **PRIMARY** solana.com: Alpenglow, 100M CU Blocks, Reduced Slot Times; Anza Alpenglow blog.
8. **PRIMARY** EIP-7732, 7773, 7825, 7886, 7928, 7999, 8037, 7864; EF blog (Fusaka, Glamsterdam Hoodi, Hegotá, partial history expiry, future of state).
9. **PRIMARY** Base blog and Docs: Scaling Base With Reth, Flashblocks Deep Dive, Doubling capacity, Upgrades, Throughput and Limits.
10. **PRIMARY** Paradigm: Releasing Reth 2.0, Reth's path to 1 gigagas, Releasing Revmc; reth v2.0.0 / v2.8.0 releases.
11. **PRIMARY** base/triedb README; QMDB (arXiv 2501.05262); thrumdev/nomt; geth Archive mode and v1.17.9 release.
12. **PRIMARY** MegaETH Docs (Architecture, Mini-Blocks, Dual Gas, Stateless Validation) and research page.
13. **PRIMARY** OP Docs: Subblocks, Preconfirmation Architecture Transition.
14. **PRIMARY** Arbitrum Docs: PGA, ArbOS 61 notice.
15. **PRIMARY** OP Spec: Ecotone blob encoding, Fjord, Jovian, Span Batches.
16. **PRIMARY** EigenDA V2 blog; Celestia Mainnet Beta docs.
17. **PRIMARY** OP Succinct Book; BOB Kailua Docs; Axiom OpenVM 2.1; Ethproofs.
18. **PRIMARY** Sei Giga paper and Docs; Sui Mysticeti v2; Aptos Raptr / Zaptos papers; Hyperliquid Docs.
19. **PRIMARY** mantle-xyz/mantle-v2 releases (Everest–Elysium) and PR #370.
20. **PRIMARY** Mantle Docs: Roadmap, Arsia, DA migration, OP Succinct upgrade, SP1 Workflow, Node Introduction.
21. **PRIMARY** mantle-xyz/reth and mantle-xyz/op-geth releases and tags.
22. **PRIMARY** Mantle mainnet RPC and L1 batcher readings (2026-10-26, `research/notes-mainsession.md`).
23. Bybit press release (2026-10-12): the mStocks partnership and launch target.
24. Mantle internal load-test report, `mantle-performance-test` qa_liquidation_summary_20260624 (private repo).
25. L2BEAT Mantle page: DA migration, vkey rotations, the 2026-01 revm hotfix record (third-party monitor).
26. research-hub reports: revm-vs-evm2, application-specific-sequencing, native-aa-eip-8130-8141.

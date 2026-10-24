---
template: research
title: "BNB New L1 Deep Dive: Native AA, Async Execution, 20 ms Sub-blocks, a Shielded Pool and LtHash"
subtitle: New L1 complements BSC; it does not replace it. Its core change is "votes sign only the order, and execution lands a few blocks later". The parallel EVM is still in design. The 0x76 AA transaction matches Tempo's almost item by item. The shielded pool goes beyond payments but is not private DeFi. "Lattice" appears only in the state commitment, and no part of the stack uses PQ signatures.
lang: en
cols: 4
type: Technical research · architecture breakdown · cross-design comparison
audience: Leadership and the team; you know the EVM and L2 architecture but have not read the New L1 docs
scope: New L1 positioning, consensus, blocks and sub-blocks, async and parallel execution, native AA, the shielded pool, the state commitment and PQ status; compared with BSC, Tempo, EIP-8130 and application-specific sequencing
evidence: 210-row claim ledger (observed 174 / inferred 31 / speculative 5); official docs snapshot bnb-chain.github.io@ef5a632 (2026-10-22); BEPs, bsc / op-geth releases, Tempo / EIP-8130 / SIMD-0215 source texts, ePrint 2026/2083; client source is not public, so nothing was measured; accessed 2026-10-24
date: 2026-10-24 · v1
---
The conclusion first, in five points:

1. **BNB is not abandoning BSC.** The official wording is that New L1 "complements BSC rather than replacing it". It uses BNB for gas and issues no new token. Today it runs only as an internal devnet. The roadmap plans testnet for late 2026 and mainnet for early 2027 ([F1](#F1)).
2. **The main change is the timing structure, not multithreading.** Validators vote only on the transaction order. Execution runs in the background, and its result lands D blocks later ([F2](#F2)). The docs give the "parallel EVM" one sentence and mark it "Detailed design is in progress" ([F3](#F3)). The cost: users pay for the declared gas_limit, with no refund ([F4](#F4)).
3. **The 20 ms sub-block is a revocable promise signed by the block producer. It is not a consensus object.** Consensus is still BSC's Parlia PoSA, with at most 64 validators ([F5](#F5), [F7](#F7)). Order-execution separation and application-specific sequencing are two different things ([F9](#F9)).
4. **The 0x76 native AA transaction matches Tempo's almost item by item:** type byte, field names, precompile name, gas constants ([F10](#F10)). The shielded pool can call public contracts with pooled funds, so it is more than payments. But the call itself is public, and the pool takes only BNB ([F12](#F12)).
5. **"Lattice" appears only in the state commitment (LtHash). It is not Falcon, and no part of the stack uses PQ signatures.** In 2026-09 researchers published a collision attack of about 2^81 queries on the same LtHash parameters. The New L1 docs still say "~128-bit" ([F14](#F14), [F15](#F15)).

## A The stack at a glance {sheet meta="by layer"}
```tree list
Positioning | Complements BSC; BNB is gas; no new token
Consensus | Parlia PoSA + BLS fast finality
  What changed | 200 ms blocks; votes sign order only; ≤ 64 validators
Blocks | 200 ms blocks + ~20 ms sub-blocks (preconfirmation)
Transaction routing | No global mempool; a Gateway hands off to the producer in one hop
Execution | reth / revm; async execution, result lands D blocks later
  Parallel EVM | access-list direction, in design
Resource isolation | Multi-Lane: reserved gas per contract address
Accounts | 0x76 native AA (same design as Tempo)
Privacy | ShieldedPool + 0x77, BNB only
State | flat KV + LtHash accumulator, no MPT
```

## B Key numbers {sheet span=2 meta="docs @ef5a632"}
| Quantity | New L1 | BSC (reference) |
|---|---|---|
| Block interval | 200 ms | 450 ms |
| Blocks per producer turn | 16 (3.2 s) | 16 (7.2 s) |
| Validators | up to 64 | 45 (21 + 24) |
| Order finality | usually +2 blocks, ~0.5 s (target) | ~1.125 s |
| Preconfirmation | ~20 ms (target; roadmap says sub-50ms) | — |
| Execution lag D | 1 … D_MAX (forum, preliminary: up to 8 blocks) | 0 (synchronous) |
| One 0x76 transaction | 1–64 calls; ≤ 128 KiB | — |
| Gas cap per transaction | 16,777,216 (BEP-652) | — |
| LtHash accumulator | 1024 × u16 = 2 KB | MPT |

## C Maturity {sheet meta="docs as of 2026-10-22"}
| Component | Status |
|---|---|
| 200 ms blocks, BLS finality | ok runs on internal devnet |
| 0x76 AA, key management | ok works on devnet |
| Shielded pool, full flow (unaudited, imported SRS) | warn works on devnet |
| ~20 ms preconfirmation | warn 20 ms is a target |
| Async execution, adaptive D (no D_MAX value yet) | warn specified |
| Access-list parallel EVM | no in design |
| BSC↔New L1 bridge | no in development |
| ERC-20 privacy, PQ authorization | no not implemented |
| Public testnet / mainnet (late 2026 / early 2027) | no planned |

## D Closest relatives {sheet span=2 meta="lineage"}
| New L1 part | Comes from / closest to | Difference |
|---|---|---|
| Consensus | BSC Parlia + BEP-126 | votes sign order only; abstain when local execution disagrees |
| Async execution | Monad (D = 3), EIP-7886 (D = 1) | D follows load; fee on declared gas |
| 0x76 AA | Tempo Transaction (also 0x76) | drops fee_token and 7702 delegation; no gas refund |
| Multi-Lane | BSC Payment Lane (BEP-703) | several lanes; unused quota flows back |
| LtHash | Solana SIMD-0215 | same parameters; different entry encoding |
| Shielded atomic call | Railgun unshield → call → reshield | spend stands when the call reverts |

## E Timeline {sheet span=2 meta="2022–2027"}
```timeline
2022-10 | Parallel EVM 2.0 | NodeReal fork only, full sync only
2024-06 | BEP-396 TxDAG | still a Draft
2026-03-18 | Tempo mainnet | 0x76 AA ships here first
2026-05-19 | BSC removes BEP-592 | "decide to follow upstream"
2026-07-08 | H2 roadmap announces the new L1 | 100K+ TPS, sub-50ms
2026-09-18 | ePrint 2026/2083 | ~2^81 collision attack on LtHash16
*2026-10-22 | New L1 docs go live | devnet stage
late 2026 / early 2027 | testnet / mainnet | planned
```

## F Conclusion {sheet span=4}
```callout ok New L1 = a BSC sibling chain that rebuilds the timing structure around 200 ms; each new feature has an existing peer, and the biggest difference is "vote on order only + adaptive execution lag"
- Positioning: complementary chain, BNB as gas, no new token; internal devnet only (F1).
- Execution: consensus fixes the order only; execution lands D blocks later; the parallel EVM's detailed design is still in progress; fees on declared gas (F2–F4).
- Blocks: the ~20 ms sub-block is a producer-signed preconfirmation; it is revocable and stays outside consensus (F5, F6).
- Consensus: still Parlia PoSA, up to 64 validators; Minimmit is the Consensus 2.0 candidate (F7).
- Ordering: order-execution separation gives apps no ordering rights; Multi-Lane only reserves capacity (F9).
- Accounts: 0x76 is a BNB variant of Tempo's design; the protocol fixes the signature schemes (F10, F11).
- Privacy: pooled funds can call public contracts, but the call is public, BNB only, unaudited (F12, F13).
- PQ: LtHash is a state commitment, not a signature; no PQ signatures in the stack; a new collision attack hits its parameters (F14, F15).
- Where to read: timing in J and L, consensus in K, BSC history in M.
- Ordering in N, AA in O, privacy in P, PQ in Q, what it means for us in R.
```

## G How to read this {depth=1}
```callout info Series navigation
Related reports: [BSC Recent Roadmap](/p/bsc-recent-development/en/) covers CAS20 and Payment Lane on today's BSC. [Native AA: EIP-8130 and EIP-8141](/p/native-aa-eip-8130-8141/en/) covers native AA on the Ethereum side. [Application-Specific Sequencing](/p/application-specific-sequencing/en/) covers ASS. [Post-Quantum Signature Selection](/p/pq-signature-selection/en/) covers Falcon and other PQ signatures. This report cites them and does not repeat them.
```

```callout info You already know (not explained here)
- EVM transactions, gas, and the EIP-1559 base fee and priority fee
- A chain first agrees on a block; nodes then execute the transactions and update the state
- Ethereum commits state with a Merkle-Patricia trie (MPT), and `eth_getProof` returns a proof for one account
- ERC-4337 implements account abstraction outside the protocol, with bundlers and an EntryPoint
- A ZK proof lets a verifier trust a computation result without redoing the computation
```

- **5 minutes**: read the lead and overview panels A–F.
- **30 minutes (leadership / product)**: also read [Context](#panel-H), [one transaction end to end](#panel-J) and [what it means for us](#panel-R).
- **30 minutes (engineering)**: read [Background](#panel-I), then [J](#panel-J)–[Q](#panel-Q) as needed.
- **To re-check**: also read [Method and evidence](#panel-T) and [Reproduce](#panel-U).

**Running example (illustrative, not a real transaction)**: Alice opens a New L1 account with her phone passkey. She gives her trading bot an access key. The key can only call `swap` on one DEX router, can spend at most 50 BNB per day, and expires in 7 days. The bot signs a `0x76` transaction with this key and swaps BNB for a token on the DEX. Later Alice deposits 10 BNB into the shielded pool and calls a public contract (a DEX, for example) straight from the pool; the BNB it returns goes back into the pool.

## H Context {depth=2}
**The problem.** BSC executes first and votes second: the producer executes every transaction before it proposes, and validators re-execute before they vote [5]. At 450 ms, execution gets only part of the block time; BNB Chain wants high-frequency trading, real-time payments and agent trading. Its targets are 100K+ TPS, sub-50ms preconfirmation and sub-second finality [14] (C7). The official view: BSC can't retrofit these changes, so it needs a new chain [15] (C1).

**Why now.**
- 2026-07-08: the H2 2026 technical roadmap announced the new L1, with testnet planned for late 2026 and mainnet for early 2027 [14] (C6).
- 2026-07-14: the BNB Chain forum opened a NewL1 category; the pinned post says it complements BSC [15] (C1).
- 2026-10-22: the official docs site published the full New L1 design docs, at devnet stage [1] (C4).

```finding F1 high
# BNB is not abandoning BSC: New L1 is a complementary chain, and today it is an internal devnet only
claim: The pinned forum post says: "It complements BSC rather than replacing it". BSC keeps serving its ecosystem, and New L1 takes the workloads BSC can't retrofit. BNB is the only native asset, and the chain issues no new token. BNB enters through an official native bridge from BSC, still in development. Today there is only an internal multi-validator devnet, with no public RPC, chain ID or client source. The roadmap plans testnet for late 2026 and mainnet for early 2027.
evidence: [observed] Forum [15]; Overview [1]; Migrating from BSC [11]; FAQ [13]; roadmap [14]; search of the bnb-chain GitHub org (C1–C4, C6, C50).
implication: Today you can assess only the design docs. BSC apps do not need to migrate; New L1 targets new workloads that BSC can't retrofit.
```

**Scope.**
- Positioning and timeline; consensus; blocks and sub-blocks; transaction routing;
- Async execution, the parallel EVM, and BSC's earlier parallel execution work;
- How order-execution separation relates to application-specific sequencing (ASS); Multi-Lane;
- 0x76 native AA, compared with Tempo, EIP-8130, EIP-7702 and ERC-4337;
- The shielded pool; the LtHash state commitment and the PQ status of each component.

**Non-goals.**
- Token prices and investment advice; advice to any company;
- Running a devnet or measuring speed (the client source is not public, see [F1](#F1));
- opBNB and Greenfield; full treatments of EIP-8130, ASS and PQ signatures (see the earlier reports).

**Decision criteria (set before the conclusions).**
1. Every claim states its maturity: running on devnet, a design written in the docs, or not implemented.
2. When the roadmap, the forum and the docs disagree, list every version; do not pick one.
3. "Is it like X?" compares only fields and values that both source texts state.

## I Background {depth=2}
```excalidraw q="Which concepts do you need before New L1, and in what order?" read="Gray dashed boxes are what you already know. Blue boxes are the cards below. The green box is the subject. An arrow means learn first → learn after." takeaway="B-0 and B-1 cover the timing structure; B-2 covers AA; B-3 and B-4 cover privacy and the state commitment; B-5 is the yardstick for ordering." name=prereq-map kind=prerequisite-map
{"grid": {"w": 290, "h": 100}, "defaults": {"w": 220, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "k1", "label": "Consensus vs execution\n(known)", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "k2", "label": "EVM transactions (known)", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "k3", "label": "ZK proofs (known)", "col": 0, "row": 3, "color": "gray", "stroke": "dashed"},
   {"id": "k4", "label": "MPT state trie\n(known)", "col": 0, "row": 4, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 Parlia\nBLS fast finality", "col": 1, "row": 0, "color": "blue"},
   {"id": "b1", "label": "B-1 Async execution", "col": 2, "row": 0, "color": "blue"},
   {"id": "b5", "label": "B-5 App-specific sequencing", "col": 2, "row": 1, "color": "blue"},
   {"id": "b2", "label": "B-2 Native AA transaction", "col": 1, "row": 2, "color": "blue"},
   {"id": "b3", "label": "B-3 Shielded pool notes", "col": 1, "row": 3, "color": "blue"},
   {"id": "b4", "label": "B-4 Homomorphic LtHash", "col": 1, "row": 4, "color": "blue"},
   {"id": "top", "label": "New L1", "col": 3, "row": 2, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "k1", "to": "b0"}, {"from": "b0", "to": "b1"}, {"from": "b1", "to": "top"},
   {"from": "b0", "to": "b5"}, {"from": "b5", "to": "top"},
   {"from": "k2", "to": "b2"}, {"from": "b2", "to": "top"},
   {"from": "k3", "to": "b3"}, {"from": "b3", "to": "top"}, {"from": "k4", "to": "b4"}, {"from": "b4", "to": "top"}
 ]}
```

```prereq B-0 l1 4min
# Parlia PoSA and BLS fast finality
what: Parlia is BSC's consensus. A stake-elected set of validators takes turns producing blocks, 16 blocks each. Fast finality is a voting layer on top. Validators sign the block header with BLS; once 2/3 have signed, the next producer aggregates the votes into its header.
why: New L1 keeps this consensus and changes three things: the block interval, the validator cap, and what a vote signs [2] (C30, C33).
example: Votes for block N land in N+1 → N becomes justified; votes for N+1 land in N+2 → N becomes finalized. At 200 ms blocks that is about 0.5 s [2] (C34, C35).
misconception: Myth: PoSA is PoA. Fact: stake elects the validators every day, and the chain can slash them. But the set has a cap, so it is not permissionless PoS (C45).
deeper: [18] BEP-126 §4.1
```

```prereq B-1 l1 4min
# Async execution (decoupling execution from consensus)
what: A conventional chain executes every transaction before it proposes a block, and the header carries the post-execution `state_root`. Async execution splits the two steps. Consensus only fixes the order. Execution runs in the background, and its result goes into a later block. Once consensus fixes the order, the order alone determines the result; execution only computes it.
why: Execution, network-wide re-execution and voting do not fit in 200 ms. The whole New L1 design rests on this split [5] (X4, X6).
example: Monad writes block N's result into N+3; EIP-7886 into N+1; New L1 into N+D, where D follows load [5][31][32] (X20).
misconception: Myth: async execution is parallel execution. Fact: the first changes when execution happens; the second changes how one block executes.
deeper: [5] Async Execution
```

```prereq B-2 l1 3min
# Native AA transaction
what: A new transaction type (an EIP-2718 envelope) puts batched calls, sponsored gas, passkey signatures and limited session keys into the protocol. Nodes check them directly, with no bundler, EntryPoint or smart-contract wallet.
why: New L1's `0x76` is this kind of transaction, and it closely matches Tempo's [7][33] (A1, A34).
example: One `0x76` transaction carries 1–64 calls under one outer signature, one nonce and one receipt [7] (A5).
misconception: Myth: native AA is EIP-7702. Fact: 7702 attaches contract code to an EOA; New L1 rejects 7702 transactions [8] (A30).
deeper: [7] Native Account Abstraction
```

```prereq B-3 l1 4min
# The note model of a shielded pool
what: Funds deposited in the pool become notes (similar to UTXOs). A note's hash (its commitment) goes into an append-only Merkle tree. To spend a note, you publish a nullifier to block double spends. A ZK proof shows that you own some note in the tree and that inputs equal outputs, without saying which note.
why: New L1's ShieldedPool uses this model, plus a flow that calls public contracts from the pool [9] (P3, P9).
example: Zcash Orchard is payments only; Railgun can unshield → call a contract → reshield [43][44] (P25, P26).
misconception: Myth: a shielded pool hides everything. Fact: deposits, withdrawals and contract calls reveal amounts and targets [9] (P20).
deeper: [9] Shielded Pool
```

```prereq B-4 l2 3min
# Homomorphic hashing with LtHash
what: A hash turns each state entry (an account or a storage slot) into a long vector; the chain adds all vectors element by element. The sum is the digest of the whole state. To change one entry, subtract its old vector and add its new one. Security rests on the SIS lattice problem: it is hard to find small coefficients that make a sum of vectors equal zero.
why: New L1 uses it instead of an MPT; the word "lattice" comes from here [10] (P29, P31).
example: To update one state entry, subtract its old vector and add its new one [10] (P30).
misconception: Myth: using a lattice means post-quantum signatures. Fact: LtHash is a state commitment, not a signature (P37).
deeper: [40] SIMD-0215
```

```prereq B-5 l2 2min
# Application-specific sequencing (ASS)
what: An app sets (or limits) the order of its own transactions and who gets the MEV. It does not leave this to the producer's tip ordering.
why: It is the yardstick for asking whether New L1's order-execution separation is ASS (panel N).
example: Multi-Lane reserves capacity for an app's address but does not let the app set its transaction order (X50).
misconception: Myth: reserved capacity gives an app ordering rights. Fact: capacity isolation and application-specific sequencing are different mechanisms (X42, X50).
deeper: [46] earlier report, Application-Specific Sequencing
```

## J One transaction end to end: from 20 ms to execution finality {depth=2}
The bot's `0x76` transaction passes through five milestones [3][4] (C27). Fig 2 shows the full sequence.

```uml q="Which roles does the bot's 0x76 transaction pass from submission to execution finality, and what guarantee does each step give?" read="Real RPC and field names. Gossip between validators is left out. The shaded part is background execution, off the consensus critical path." takeaway="At 20 ms you get the producer's signed promise; at about 0.5 s the order is irreversible; the execution result waits until block N+D is finalized."
sequenceDiagram
  autonumber
  participant B as Bot
  participant G as Gateway full node
  participant P as Current producer
  participant V as Validators ≤64
  participant E as Background executor
  B->>G: eth_sendRawTransaction(0x76)
  G->>P: one-hop replica, no global mempool
  P-->>B: signed SubBlock slice, preconfirmed ~20 ms
  P->>V: block N, order only, no state_root
  V->>V: BLS vote signs order only
  Note over V: order-finalized after N+2, ~0.5 s
  rect rgb(234, 241, 251)
    E->>E: execute block N in order
    P->>V: ExecutionCommitment(N) in N+D
    V->>V: abstain if local execution disagrees
  end
  Note over V: execution-finalized once N+D is finalized
```

| Stage | About when | Guarantees | Does not guarantee |
|---|---|---|---|
| `preconfirmed` | ~20 ms (target) | the producer signed the transaction's position | success; no revocation |
| `ordered` | ~1 block | it is in an imported block | no reorg |
| `order-finalized` | usually +2 blocks, ~0.5 s | the order is irreversible | execution success |
| `executed` | shortly after ordering; the executed tip trails by ~D | this node computed the receipt | network-wide acceptance |
| `execution-finalized` | after block N+D becomes final | the result has a commitment and a vote | — |

With D between 1 and the forum's "up to 8 blocks", execution finality comes about 0.6–2 s after the block. This is a calculation, not a measurement (M1). If an action depends on the execution result, such as a payout or a bridge release, wait until `eth_blockNumber("finalized")` passes the transaction's block [4] (C28).

```finding F5 high
# The ~20 ms sub-block is a revocable promise signed by the producer, not a consensus object
claim: During its turn, the current producer keeps packing ready transactions into signed slices (SubBlocks) and broadcasts them. A slice promises only inclusion and position, not voting, fork choice or finality. If the producer withdraws its stream, the status becomes `aborted`; if another producer takes the height, `superseded`. The stream is append-only, so a later higher-fee transaction cannot jump ahead. The forum proposal author calls it "not implemented at the protocol level … a reputational commitment".
evidence: [observed] Pre-confirmation page, Guarantees and Limitations [3]; Transaction Lifecycle [4]; forum author reply [16] (C15, C20, C21, C23, C11). [inferred] 20 ms and 0.5 s are design targets, not measurements on a public network (C13).
implication: The 20 ms itself is a target: the docs say ~20 ms, the roadmap sub-50ms, the forum 20–50 ms. Apps can use it for UI updates or payment receipts, but must handle revocation. Never release funds on it.
```

```finding F6 medium
# No global mempool: a Gateway hands the transaction to the producer in one hop; "front-running protection" is just no broadcast
claim: A Gateway is an ordinary full node. It keeps custody of the transaction and sends replicas straight to the next producers on the validator schedule, which do not forward again. There is no `txpool_*`, and the current client has no auction or ordering API. The roadmap says TxStream is "blocking front-running by design", but the docs show only "no broadcast to a public mempool"; the producer still sees the transaction first. The TEE Gateway (encrypted intake and ordering inside a TEE) is only a forum proposal from 2026-10-10.
evidence: [observed] Transaction Lifecycle [4], API list [13], roadmap [14], forum [16] (C24, C25, C8, C26). [inferred] No protocol mechanism backs the front-running claim (X43).
implication: Front-running risk moves from searchers in a public mempool to the producer itself. Whether the TEE Gateway ships decides this.
```

## K Consensus: still Parlia, three changes {depth=2}
New L1's consensus comes straight from BSC's Parlia. The table compares the two chains [2][17][19] (C14, C31, C40, C42).

| Item | New L1 | BSC |
|---|---|---|
| Block interval | 200 ms | 450 ms (BEP-619) |
| Blocks per turn | 16 = 3.2 s | 16 = 7.2 s |
| Validators | up to 64, elected daily by stake | 45 (21 Cabinet + 24 candidates) |
| What a vote signs | **order only** | the block (with its execution result) |
| Execution disproved | validators abstain | the block is invalid |
| Hard-fork gates | none, one config from genesis | many activation heights |

```finding F7 high
# Consensus is still Parlia PoSA + BLS finality: not PoA, and not permissionless PoS
claim: BNB stake elects up to 64 validators once a day, and the producer rotates every 16 blocks. A missed slot goes to others after a seeded random backoff. Once ⌈2N/3⌉ BLS votes arrive, the next producer aggregates them into its header. Casper-FFG rules then give justified and finalized heights, usually final after +2 blocks (about 0.5 s). The real change: a vote signs only the order. If a validator's local execution disagrees with an `ExecutionCommitment`, it abstains, so a wrong result cannot reach 2/3.
evidence: [observed] Consensus page [2]; BEP-126 [18] (C30–C34, C36–C39). [inferred] A capped, stake-elected, slashable PoSA set (C45); 2.25× faster blocks (C42).
implication: "PoA" is not accurate, and neither is "PoS". Decentralization is on BSC's scale: at most 64 validators. The docs also call Parlia the "current default" and are evaluating Minimmit as Consensus 2.0.
```

**Inconsistencies inside the docs.** How many blocks does order finality take? The consensus page says "+2 blocks", the API page "roughly one block interval", the status table "1–few" [2][3][13]. The migration guide says block-count constants are "off by ~3.75×" versus BSC; that uses BSC's old 750 ms. At today's 450 ms it is about 2.25× [11] (C43).

## L Async execution and the "parallel EVM" {depth=2}
Fig 3 compares the critical path of one block on BSC and on New L1.

```excalidraw q="For the same block, how do the critical paths on BSC and New L1 differ?" read="Top row is BSC: execution sits before the vote; red marks execution on the critical path. Bottom rows are New L1: the vote checks only the order; execution moves to the background and its result lands D blocks later." takeaway="New L1 does not make execution faster; it moves execution off the consensus critical path." kind=before-after
{"grid": {"w": 260, "h": 120}, "defaults": {"w": 210, "h": 66, "fontSize": 16},
 "nodes": [
   {"id": "a1", "label": "BSC:\nproducer packs", "col": 0, "row": 0, "color": "blue"},
   {"id": "a2", "label": "execute first\ncompute state_root", "col": 1, "row": 0, "color": "red"},
   {"id": "a3", "label": "validators re-execute\nthen vote", "col": 2, "row": 0, "color": "red"},
   {"id": "a4", "label": "final", "col": 3, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "b1", "label": "New L1:\nproducer packs", "col": 0, "row": 1, "color": "blue"},
   {"id": "b2", "label": "check order\nthen vote", "col": 1, "row": 1, "color": "green"},
   {"id": "b3", "label": "order final\n~0.5 s", "col": 2, "row": 1, "color": "green"},
   {"id": "c1", "label": "background\nexecutes block N", "col": 1, "row": 2, "color": "blue"},
   {"id": "c2", "label": "N+D header carries\nExecutionCommitment", "col": 2, "row": 2, "color": "violet"},
   {"id": "c3", "label": "execution final", "col": 3, "row": 2, "color": "green"}
 ],
 "edges": [
   {"from": "a1", "to": "a2"}, {"from": "a2", "to": "a3"}, {"from": "a3", "to": "a4"},
   {"from": "b1", "to": "b2"}, {"from": "b2", "to": "b3"},
   {"from": "b1", "to": "c1", "dashed": true}, {"from": "c1", "to": "c2"}, {"from": "c2", "to": "c3"}
 ]}
```

```finding F2 high
# The real novelty is the timing structure: headers carry no execution result, and the result lands D blocks later
claim: A header carries only the fields known at proposal time, including the transaction list, and omits `state_root`, `receipts_root`, `logs_bloom`, `gas_used` and others. The background executor runs block N and writes the result as an `ExecutionCommitment` into the header of block N+D. D follows load: it moves toward 1 at low load and grows at high load, by at most ±1 per block. Governance sets its cap `D_MAX`, with no value in the docs and "up to 8 blocks" on the forum (preliminary). While catching up, one block can carry several commitments.
evidence: [observed] Async Execution page [5]; forum author reply [16] (X4–X8, C29). [inferred] The docs describe adaptive D as a mechanism but do not say it runs on devnet (X11).
implication: RPC meaning changes with it. `latest` is the executed block, D blocks behind the newest block on a subscription. A query for an ordered but unexecuted block returns a retryable `-38004` [5] (X17). The executor also creates system transactions (rewards, slashing, validator updates).
```

```finding F3 high
# The "parallel EVM" is one sentence: access-list based, detailed design in progress
claim: The docs give one sentence. It says: "The current design centers on an access-list-based parallel EVM … Detailed design is in progress." The scheduler, the handling of missed dependencies, and whether it reuses the EIP-7928 format are all absent. Yet the Overview architecture table lists "Parallel EVM" as part of the execution layer, with no maturity note. The roadmap also lists "parallel execution" as one route to 100K+ TPS.
evidence: [observed] Async Execution, What's Next [5]; Overview architecture table [1]; roadmap [14] (X2, X3, C7).
implication: Today you can assess only async execution. The 100K+ TPS target depends on a component whose detailed design is still in progress.
```

```finding F4 high
# Charging the declared gas_limit with no refund is the price of async execution
claim: Consensus admits transactions against state that is D blocks old. So some admitted transactions will fail at execution: an empty balance, a drain earlier in the block, a nonce clash, a changed approval. To make them still pay for block space, New L1 charges `gas_bid × gas_limit`, refunds no unused gas, and voids EIP-3529 refunds. It derives an `effectiveBalance` from in-flight spend and admits a transaction only if that covers the cost. Each account also has hard caps on in-flight gas and calldata within the D window.
evidence: [observed] Async Execution, "Paying for Block Space" [5]; migration guide [11]; AA page [7]; the docs contrast this with Monad's reserve balance (X12–X16, A24). [inferred] Every chain that moves execution off the consensus path must address admission against lagged state (M4).
implication: A receipt's `gasUsed` usually equals the declared limit. Wallets and SDKs must change their defaults: margins such as `estimate × 1.5` become pure spend. The protocol pins the base fee to 0, so the tip is the price [11].
```

## M BSC's parallel execution history: always "how to run one block faster" {depth=2}
BNB ran four rounds of parallel execution work on BSC and opBNB [20]–[29] (X21–X35).

```timeline v
2022-01 | BEP-130 (Parallel EVM 1.0) | dispatcher splits slots, redo on conflict; Draft
2022-10 | Parallel EVM 2.0 | NodeReal fork release, full sync only, no validator mode
2023 | roadmap: "take a break and rethink" | 3.0 re-planned around read/write hints
2024-06 | BEP-396 TxDAG | proposes attaching a dependency DAG to the block; still an open Draft
2024 | TxDAG / PEVM on opBNB | TxDAG data on chain; client only a beta pre-release
2025-06 | BEP-592 non-consensus BAL | live 2026-01; nodes use it to prefetch in parallel
2025-12 | bsc v1.6.4-feature-BAL7928 | BAL-driven parallel execution feature build, falls back to serial
2026-04 | BEP-684 Header-Only Voting | votes without waiting for execution; header keeps state_root; Draft
2026-05 | BEP-592 removed | "decide to follow upstream", moves to EIP-7928
*2026-10 | New L1 | async execution specified; access-list parallelism in design
```

```finding F8 high
# BSC's parallel EVM never reached an official release; New L1 changes a different layer: the timing structure
claim: None of the 132 releases in the bsc repo enables Parallel EVM 1.0–3.0 or TxDAG. The only "parallel execution" is a 2025-12 BAL feature build. BSC removed BEP-592 in 2026-05, and its execution layer now follows upstream geth and EIP-7928. BSC's own BEP-684 only lets votes skip execution; the header still commits to `state_root`. New L1 goes further: the execution result leaves the header entirely, lands D blocks later, and D adapts.
evidence: [observed] bsc release search, PR #3690, v1.8.0-alpha, PEVM 2.0 blog, 2023 roadmap, BEP-396, op-geth releases, BEP-684 [21]–[29] (X22, X23, X26, X28, X29, X32, X33, X35). [inferred] The 2023 roadmap's "deployed … to the BSC mainnet" means a fork running on full nodes, not the validator path (X24); New L1 goes further than BEP-684 (X36, X37). [speculative] No evidence shows whether New L1's access list reuses BAL / EIP-7928 (X38).
implication: To judge New L1's execution, look at async execution. Treat the parallel EVM as not yet delivered.
```

## N Order-execution separation ≠ application-specific sequencing; Multi-Lane only reserves capacity {depth=2}
The architecture diagram says "Order-Execution separation"; the text means "votes sign the order, not the execution result" [1][2] (X39). It does not change who decides the order.

| Dimension | New L1 order-execution separation | Application-specific sequencing (ASS) |
|---|---|---|
| Solves | execution cannot block consensus at 200 ms | the order of an app's own transactions, who gets the MEV |
| Who orders | the current producer, by tip | the app, an app sequencer, or contract rules |
| Granularity | the whole chain | one app or one trading pair |
| Ordering rights for apps | no none | ok the core feature |
| Fair ordering / MEV rules | no none in the protocol | ok usually a design goal |

**What Multi-Lane is.** Governance registers a bps quota for some contract addresses in `LaneRegistry`; 1,500 bps means 15% of block gas [6] (X44, X45):
- A transaction enters a lane deterministically by its `to` address; unregistered addresses and contract creations go to the default lane.
- No calldata or selector routing: any transaction sent to a registered address uses that lane's quota.
- It reserves capacity, not inclusion; inside a lane, ordering is by tip, with no FIFO.
- Unused quota flows back to the default lane; occupancy counts the declared gas limit.

```finding F9 high
# Order-execution separation is only a timing split, orthogonal to ASS; Multi-Lane is capacity isolation
claim: Ordering power stays with the current producer: the Gateway has no ordering API, lanes order by tip, and the preconfirmation window is append-only. So order-execution separation gives apps no ordering rights and does not change who gets the MEV. Multi-Lane reserves gas for registered contract addresses but gives no ordering rules, like the payment lanes on Tempo and BSC. Compared with BSC Payment Lane (BEP-703: one payment class, unused quota stays idle), Multi-Lane has several lanes, and unused quota flows back.
evidence: [observed] Multi-Lane page [6]; Transaction Lifecycle [4]; Pre-confirmation [3]; BEP-703 [30] (X40, X41, X44–X47). [inferred] Orthogonal to ASS, so at most a base for ASS (X42, X50); the differences from Payment Lane (X48).
implication: App-level ordering on New L1 needs a separate sequencer or contract rules built on top.
```

## O Native AA: 0x76 is a BNB variant of Tempo's design {depth=2}
The bot's transaction is a `0x76`: 1–64 calls that succeed or fail together, with one signature, one nonce and one receipt [7] (A5). An account has three key levels, all managed by the `AccountKeychain` precompile (`0x…4000`) [7] (A11–A13):

| Level | Can do | Limits |
|---|---|---|
| root | its address is the account; deploys contracts, manages keys | nobody can revoke it, so root cannot rotate within the same address |
| admin | authorizes and revokes other keys | cannot deploy; must have no scope, limit or expiry |
| access | an ordinary session key | bound by scope (target + selector), a native spend limit, an expiry |

Alice's bot key is an access key, scoped to `swap` on the DEX router. The spend limit counts only native outflow, so it caps BNB but not BEP-20 tokens (A16, A33). The key also cannot use `token_fee`: that feature is only for root-signed, sponsored transactions [7] (A22).

**Item-by-item comparison with Tempo** (both source texts state each item) [7][33][34] (A34–A36, A39–A42):

| Item | New L1 | Tempo |
|---|---|---|
| Transaction type | `0x76` | `0x76` |
| Fields | 12 shared field names + `token_fee` | the same 12 + `fee_token`, `aa_authorization_list` |
| Key precompile | `AccountKeychain` @ `0x…4000` | `AccountKeychain` @ `0xAAAA…` |
| Key levels | root / admin / access | Root / Admin / Limited Access |
| Delegated signing digest | `keccak256(0x04‖hash‖account)` | same |
| WebAuthn rules, P256 surcharge | 37 bytes, UP/UV; +5,000 | same |
| Spend limit applies to | native coin only | TIP-20 only; native value not limited |
| Nonce | `nonce_key = 0` only | 2D nonces + expiring nonces |
| Unused gas | no refund | pre-charge, then refund |

```finding F10 high
# 0x76 and the Tempo Transaction share type byte, fields, precompile, digest and gas constants
claim: Both chains call their native AA transaction `0x76`, with 12 identical field names. Both key precompiles have the name `AccountKeychain` and three levels, with the same admin limits. The delegated signing digest, the WebAuthn rules, the P256 and delegated-key surcharges, and "a revoked key can never be re-authorized" are all the same. New L1 drops Tempo's `fee_token` (paying gas in TIP-20) and the 7702-style delegation, and adds `token_fee` (the account repays the sponsor in a token). 2D nonces have a field but stay disabled. Tempo mainnet went live on 2026-03-18, seven months before the New L1 docs.
evidence: [observed] New L1 AA page [7], transaction types [8]; Tempo transaction spec [33], AccountKeychain [34], mainnet blog [35] (A34–A36, A39–A43). [inferred] Many independent details match word for word and number for number, so it is a BNB variant of Tempo's design (A37). [speculative] Nobody can check whether the client ports Tempo's reth code (A38).
implication: The same type byte with different fields means two schemas behind one `0x76`; existing Tempo tools must not assume compatibility.
```

**Compared with EIP-8130, 7702 and 4337** ([36]–[39], A44–A48):

| Dimension | New L1 `0x76` | EIP-8130 + 8430 | ERC-4337 |
|---|---|---|---|
| Status | devnet | both Draft | Final |
| Validation | 3 signature schemes fixed by the protocol | pluggable authenticator contracts | account contract |
| Permissions | three key levels + scope | actors + scope bits + policy contracts | contract-defined |
| Sponsorship | built-in fee payer | 8430: built-in payer modes | paymaster contract |
| PQ upgrade path | needs a protocol upgrade | deploy a new authenticator | account implements it |
| Infrastructure | no bundler | no bundler | bundler + EntryPoint |

```finding F11 high
# The protocol fixes the signature schemes: adding PQ signatures needs a protocol upgrade; 7702 transactions are rejected
claim: New L1 supports only secp256k1, P256 and WebAuthn signatures, and key management is a precompile built into the EVM. On 2026-10-08, EIP-8130 narrowed to "Keystore Accounts", and its transaction type moved to EIP-8430 (`0x79`, PR not merged). 8130 validates with pluggable authenticator contracts and expects PQ algorithms to arrive as new authenticators. 7702 attaches delegated code to an EOA; 4337 uses the off-protocol UserOp system. New L1 rejects 7702 and 4844 transactions and needs no 4337 infrastructure.
evidence: [observed] AA page signature table [7]; System Contracts [12]; EIP-8130 @1a1f470 [36]; PR #12385 [37]; EIP-7702 [38], ERC-4337 [39] (A8, A13, A30, A44–A46, A48). [inferred] A new signature algorithm needs a protocol upgrade (A47).
implication: The earlier Native AA report puts `0x79` under 8130; that is now out of date.
```

## P Shielded pool: one step beyond payments, far from private DeFi {depth=2}
ShieldedPool is a system contract predeployed at genesis (`0x…5000`) [9] (P1). It has four flows [9] (P9):
- **Shield**: an EOA calls `privDeposit`; the address, amount and asset are public.
- **Shielded transfer**: spends 1–2 notes inside the pool and always publishes 2 nullifiers (padding with a fake one), producing up to 3 notes.
- **Unshield**: withdraws to a normal address; the amount, asset and destination are public.
- **Atomic call**: takes funds out of the pool, calls one public contract, and puts the return value back into the pool.

Every spend carries two PLONK proofs (BN254, 864 bytes each). The pool proof shows value conservation and note ownership; the auth proof shows that the EOA recorded in the note signed an EIP-712 message [9][8] (P5, P6). There are two submission paths. A `0x77` transaction has no sender, nonce or outer signature, because the proofs are the authorization. Or a relayer calls `transact` [9] (P11, P12).

```uml q="When Alice calls a DEX straight from the shielded pool, which steps are public and which are hidden? What happens if it fails?" read="Real flow names. Yellow note boxes show public on-chain data and the failure rule. The pool takes only native BNB, so the return is drawn as BNB; the docs do not say how an ERC-20 return is handled. Batched note insertion (every 50 blocks) is left out." takeaway="It hides who, not what: the call target, calldata and amounts are public; if the call reverts, the spend stands and the escrowed funds can be retried."
sequenceDiagram
  autonumber
  participant A as Alice wallet
  participant S as ShieldedPool
  participant D as DEX contract
  A->>A: prove locally, pool proof + auth proof
  A->>S: 0x77 tx (no sender), flow = atomic call
  S->>S: verify proofs, burn 2 nullifiers
  S->>S: settle and escrow the unshield amount
  Note over S: unshield amount is public
  S->>D: second frame deliver, call the contract
  Note over S,D: target and calldata are public
  D-->>S: return native BNB
  S->>S: store as BNB open note (owner hidden, amount public)
  Note over S: if the call reverts, spend stands, escrow is retryable
```

| Flow | Public | Hidden |
|---|---|---|
| Shield | depositor, amount, asset | who holds it later |
| Shielded transfer | the fee on the direct path | sender, recipient, amount, asset |
| Unshield | amount, asset, destination | the note history |
| Atomic call | unshield amount, call target, calldata, reshield amount | who made the call |

```finding F12 high
# Pooled funds can call public contracts, so it is more than payments; but it is not private DeFi
claim: An atomic call lets pooled funds trigger one public EVM call; the result returns to the pool as an open note (owner hidden, amount and asset public). The DEX contract, call target, calldata and amounts are public, and only the link between Alice and this call is hidden. If the call reverts, the spend stands and you can retry the escrowed funds. Railgun's similar flow reverts as a whole. The only supported asset is native BNB.
evidence: [observed] Privacy page, Flows, Current Status, Security Assumptions [9]; transaction types [8]; Railgun docs [43] (P8, P18, P19, P25). [inferred] The composability is "pooled funds trigger one public call", not private execution (P24). [speculative] The docs do not say whether an atomic call can target any contract (P27).
implication: Is it only private payment? No, it can reach DeFi. But the DeFi itself is fully public, so it is "using public DeFi anonymously".
```

```finding F13 high
# Do not put real funds in the shielded pool yet: unaudited, someone else's SRS, BNB only
claim: The docs' warning reads: "Do not treat it as safe for real value". The PLONK SRS is an imported public one; New L1's own ceremony and a third-party circuit audit remain outstanding pre-mainnet tasks. Not implemented: ERC-20 / BEP-20 shielding, the reserved PQ authorization, paymaster / 4337 submission, compliance hooks (an interface seam only), and recursive proof aggregation. The contract is immutable, and governance can only pause deposits.
evidence: [observed] Privacy page [9]; FAQ [13] (P7, P17, P21–P23). [inferred] The roadmap's "selective disclosure for compliance" has not landed in the docs (P46).
implication: Privacy today is "a design plus a devnet demo", not a usable product. Two more metadata leaks: registering a privacy address publicly links it to your EOA, and a relayer sees your IP and timing.
```

## Q PQ: "lattice" appears only in the state commitment {depth=2}
New L1 has no MPT. Each piece of state (an account or a non-zero storage slot) is one KV entry. Fig 5 shows how entries become the `state_root` [10] (P28, P29).

```excalidraw q="How is New L1's state_root computed, and where is the lattice?" read="Read left to right. Blue is the work per entry; green is the global accumulator. The lattice appears only in the security argument for step three." takeaway="Changing one entry costs one subtract and one add, whatever the state size; but the accumulator is a sum, so it cannot give an inclusion proof for one account."
{"grid": {"w": 255, "h": 120}, "defaults": {"w": 200, "h": 70, "fontSize": 16},
 "nodes": [
   {"id": "e", "label": "one entry\nkey ‖ value", "col": 0, "row": 0, "color": "blue"},
   {"id": "h", "label": "BLAKE3 XOF\n→ 2048 bytes", "col": 1, "row": 0, "color": "blue"},
   {"id": "s", "label": "sum all vectors\n1024 × u16", "col": 2, "row": 0, "color": "green"},
   {"id": "r", "label": "BLAKE3\n→ 32-byte state_root", "col": 3, "row": 0, "color": "green"}
 ],
 "edges": [
   {"from": "e", "to": "h"}, {"from": "h", "to": "s"}, {"from": "s", "to": "r"}
 ]}
```

**Where does PQ come in?** In one place only. The docs base the accumulator's security on the SIS lattice problem. They say 1024 × u16 "targets ~128-bit security" and cite Bellare–Micciancio 1997 and Solana SIMD-0215 [10] (P31). The table lists the cryptography of every component [2][7][9][10][45] (P40–P43):

| Component | Uses | PQ? |
|---|---|---|
| Consensus votes | BLS aggregate signatures | no |
| Account signatures | secp256k1, P256, WebAuthn | no |
| Sub-block signature | 65-byte recoverable signature | no |
| Privacy proofs | PLONK on BN254 | no |
| Privacy authorization | EOA signs EIP-712 (PQ scheme reserved, not built) | no |
| State commitment | BLAKE3 + LtHash (lattice problem, not a signature) | warn partly |

```finding F14 high
# LtHash is a state commitment, not Falcon; no part of New L1 uses PQ signatures
claim: Falcon (FN-DSA) is a lattice signature: a private key signs, a public key verifies. LtHash is a homomorphic set hash: it compresses the whole state into a digest you can update incrementally. Both relate to lattices, but they do different jobs, and the New L1 docs never mention Falcon. BLS, secp256k1 / P256 / WebAuthn and BN254 PLONK are all elliptic-curve cryptography, which NIST says Shor's algorithm breaks. The roadmap's "Post-Quantum Readiness" is a research plan for all of BNB Chain (hybrid schemes, AA-based upgrades without new addresses). Its New L1 section treats LtHash only as a speed measure.
evidence: [observed] State DB [10]; roadmap [14]; NIST IR 8547 [45] (P29, P31, P44, P45, P42). [inferred] LtHash is not a signature (P37); no component is PQ (P43).
implication: Do not call New L1 a "post-quantum L1". "Lattice-based state commitment" is the accurate term.
```

```finding F15 medium
# A ~2^81-query collision attack on the same LtHash parameters appeared in 2026-09; the docs still say ~128-bit
claim: ePrint 2026/2083 (2026-09-18) attacks LtHash16 (N = 1024, d = 16), which Facebook and Solana use. A collision needs about 2^81 hash queries and at most 2^101 operations. On 2026-09-25, SIMD-0215 rewrote its security section and accepted the attack. Its argument: the collision set has about 2^72.83 items, but fewer than 2^65 accounts hold lamports, so it cannot form a valid state. New L1 uses the same parameters with a different entry encoding (storage slots included). Its 2026-10-22 docs still say only "~128-bit".
evidence: [observed] ePrint 2026/2083 abstract [41]; SIMD-0215 @f1afd94 security section [40]; State DB [10] (P32–P34). [inferred] The docs do not reflect this update (P35); Solana's rebuttal holds only for Solana's encoding, so New L1 needs its own argument (M7). [speculative] Solana's argument does not carry over to New L1 as is (P36).
implication: This is not a directly exploitable bug. But New L1 must argue collision safety again for its own state encoding.
```

```finding F16 medium
# The cost of dropping the MPT: no eth_getProof, no snap sync, and bridges need another design
claim: The accumulator is a sum, not a tree, so there is no inclusion path. `eth_getProof` always returns `-32004`, snap sync does not exist, and whole-state debug reads are not supported. Until an "accumulator-native" inclusion proof ships (the docs say planned), bridges and light clients must rely on BLS finality votes and full-node answers. The native BSC↔New L1 bridge is still in development, and the `CrossChain` address is a placeholder. The accumulator archive adds 2 KB per block, about 0.9 GB per day.
evidence: [observed] State DB [10]; migration guide [11]; network info [13] (P38, P39, C2, M2).
implication: Cross-chain designs, light clients and indexers that rely on MPT proofs cannot plug in directly.
```

## R What it means for us {depth=2}
These are factual premises plus inferences, not advice to BNB Chain.

1. **ASS design: New L1 covers only half.** Multi-Lane sits at the same layer as the earlier report's "outer layer: allocate capacity by class". New L1 has no "inner layer: pick an ordering rule per class" (M5). So New L1 is not a reference implementation for ASS. Only its capacity setup (`LaneRegistry` + governance + unused quota flowing back) is a reference.
2. **Preconfirmation: the same strength, a one-sided promise by the producer.** New L1's SubBlock, like the Mantle FIFO preconf lane in the earlier report, is not guaranteed by consensus (M6, F5). What is worth borrowing is the interface: signed slices, revocation states (`aborted` / `superseded`), and client-side self-verification steps [3].
3. **Async execution: the cost is already written down.** When assessing "move execution off the critical path", design the admission rules at the same time (M4, F4). Options: fee on declared gas plus in-flight spend caps, or a Monad-style reserve balance. RPC meaning (`latest` = executed) must change too.
4. **Native AA: two chains now use the fixed Tempo-style design.** The earlier report suggested an 8130 PoC first; the "protocol-fixed + 0x76 schema" route now has a second adopter (M3, F10). Unlike New L1's fixed signature schemes, EIP-8130's pluggable authenticators give a PQ upgrade path without a protocol upgrade (F11).
5. **PQ: do not treat LtHash as a PQ scheme.** If you consider LtHash for state commitment, argue collision safety again for your own entry encoding (M7, F15).

```callout warn CAUTION
Point 2 relies on the earlier report's description of Mantle's preconf lane. This report did not re-check Mantle's code.
```

## S Limits and open questions {depth=2}
- **No source code, no measurements.** The New L1 client has no public repo. Every mechanism here comes from the 2026-10-22 docs snapshot (C50). 20 ms, 0.5 s and 100K+ TPS are targets (C13).
- **The docs are moving.** The devnet is "highly unstable". The docs already contradict themselves: how many blocks order finality takes, which tip `newHeads` follows, and 64 validators versus the API range `[2, 21]` (C4, C44).
- **The roadmap and the docs differ.** The roadmap's GasToken survives only as `token_fee`; "scheduled execution" maps only to validity windows; "selective disclosure" is only an interface seam (M8, M9, P46).
- **Speculative items (5).** Whether the access list reuses EIP-7928 (X38); whether the AA ports Tempo's code (A38); whether atomic calls restrict targets (P27); whether Solana's LtHash argument carries over (P36); whether the `scheme` field of `privDeposit` holds a PQ slot (P48).
- **Open questions.**
  1. The design of the access-list parallel EVM; the value of `D_MAX`; any accountability beyond abstaining when an execution commitment is wrong.
  2. Whether the TEE Gateway ships; the Minimmit timeline.
  3. Which SRS the deployment imports; when the audit and ceremony happen.
  4. Whether New L1 responds to ePrint 2026/2083; accumulator-native proofs and how the bridge verifies.
  5. Whether `0x76` is byte-compatible with Tempo.

## T Method and evidence {depth=3}
- **Primary sources.** We pin the official docs at `bnb-chain/bnb-chain.github.io@ef5a632` (the only commit of `docs/newl1/`, 2026-10-22); a local snapshot sits in `research/references/`, and the ledger cites line numbers. External: BEPs, bsc / op-geth releases, the Tempo spec, EIP-8130 @1a1f470, SIMD-0215 @f1afd94, ePrint 2026/2083, forum posts.
- **Four research lanes.** Positioning and consensus (C), execution (X), accounts (A), privacy and state (P), one lane each. The merged ledger has 210 rows: observed 174, inferred 31, speculative 5.
- **External research was a lead only.** We checked each claim from the ChatGPT Deep Research result. The main gaps are in the table below (M10).

| External research said | Check result |
|---|---|
| about 64 validators | the docs say "up to 64" (C31) |
| 20 ms preconfirmation confirmed on devnet | a target; the roadmap says sub-50ms (C11) |
| AA has four levels: Root / Admin / Delegated / Sponsor | three levels; the sponsor is another account (A49) |
| token fee is repaid after the transaction | runs before the user calls (A23) |
| "closest to Tempo" | same type byte, fields and precompile (A34–A37) |
| LtHash is about 128-bit | a ~2^81 collision attack exists (P33) |

- **Main-session spot checks.** Key lines of the consensus, async-execution, account-abstraction, privacy and state-db pages; the Tempo spec and AccountKeychain; the ePrint abstract; the SIMD-0215 security section; the EIP-8130 header and commit; both forum posts; the roadmap text. All matched.

## U Reproduce {depth=3}
Pin the docs version and check the key sentences:

```bash title="Fetch the docs snapshot and grep the key sentences"
git clone --filter=blob:none --sparse https://github.com/bnb-chain/bnb-chain.github.io
cd bnb-chain.github.io && git checkout ef5a632d2a
git sparse-checkout set docs/newl1
grep -n "up to 64" docs/newl1/core-concepts/consensus.md
grep -n "Detailed design is in progress" docs/newl1/core-concepts/async-execution.md
grep -n "128-bit" docs/newl1/core-concepts/state-db.md
grep -n "0x76" docs/newl1/core-concepts/account-abstraction.md
```

Expected: each grep matches (consensus.md L16, async-execution.md L101, state-db.md L47, account-abstraction.md L7 first).

```bash title="Check that no official bsc release ships PEVM or TxDAG"
gh api --paginate 'repos/bnb-chain/bsc/releases?per_page=100' \
  --jq '.[] | select((.body // "") | test("(?i)parallel|txdag|pevm")) | .tag_name'
```

Expected (2026-10-24): only `v1.7.0-alpha`, `v1.6.4-feature-BAL7928` and `v1.1.3`; none of their notes mention PEVM or TxDAG.

## V Glossary {depth=2}
```glossary
Parlia | PoSA | BSC's consensus: a capped, stake-elected validator set takes turns producing blocks. | not PoA, not permissionless PoS
BLS fast finality | — | Validators vote with BLS signatures; 2/3 are aggregated into the next header. | on New L1 it signs only the order
order finality | order-finalized | The transaction order is irreversible, after about +2 blocks. | does not mean execution succeeded
execution finality | execution-finalized | The execution result is in some block, and that block is finalized. | D blocks after order finality
ExecutionCommitment | — | The execution result of block N, carried in the header of block N+D. | not in block N's own header
execution lag D | adaptive execution lag | How many blocks late the result lands, 1 to D_MAX, following load. | not a fixed value
SubBlock | sub-block | A transaction slice signed by the current producer, used for ~20 ms preconfirmation. | outside consensus, revocable
preconfirmation | — | The producer's signed promise of inclusion and position. | no execution or finality guarantee
Gateway | — | An ordinary full node that takes transactions and hands them to producers in one hop. | no ordering or auction API
Multi-Lane | PriorityLane in the roadmap | Reserves a share of block gas per contract address. | no ordering rights, no FIFO
fee on declared gas | charge on gas_limit | You pay the declared gas_limit, with no refund of unused gas. | not gasUsed
0x76 | native AA transaction | New L1's native account-abstraction transaction type, the same byte as Tempo's. | not EIP-7702
AccountKeychain | — | The precompile that manages root, admin and access keys. | Tempo has a precompile with the same name
access key | session key | A delegated key bound by scope, a native spend limit and an expiry. | cannot cap BEP-20 amounts
token_fee | — | In a sponsored transaction, the account repays the sponsor in a token. | not Tempo's fee_token
ShieldedPool | shielded pool | System contract 0x…5000 that hides transfers with the note model. | BNB only
note | — | One record of value in the shielded pool, similar to a UTXO. | not an account balance
nullifier | — | A value published when a note is spent, to block double spends. | does not reveal which note
open note | — | A note with a hidden owner but a public amount and asset. | the output of an atomic call
atomic call | — | Take funds from the pool, call a public contract, store the result back in the pool. | the call itself is public
0x77 | shielded transaction | A privacy transaction with no sender or nonce; the proofs authorize it. | its fee is public
SRS | structured reference string | Public parameters for PLONK, produced by a trusted setup. | New L1 imports someone else's
LtHash | lattice hash | A homomorphic commitment that hashes state entries to vectors and adds them. | not a signature, not Falcon
SIS | Short Integer Solution | A lattice problem: find small coefficients that make a sum of vectors zero. | the security assumption of LtHash
application-specific sequencing | ASS | Lets an app decide how its own transactions are ordered and who gets the MEV. | not order-execution separation
```

## W References {depth=2}
1. [New L1 Overview](https://docs.bnbchain.org/newl1/overview/) (snapshot @ef5a632) — positioning, architecture, the role of BNB, devnet status. **PRIMARY**
2. [Consensus](https://docs.bnbchain.org/newl1/core-concepts/consensus/) — parameters, votes sign order only, Minimmit. **PRIMARY**
3. [Transaction Pre-confirmation](https://docs.bnbchain.org/newl1/core-concepts/tx-preconfirmation/) — guarantees, the confirmation ladder, self-verification. **PRIMARY**
4. [Transaction Lifecycle](https://docs.bnbchain.org/newl1/developers/transaction-lifecycle/) — Gateway, pool states, RPC tips. **PRIMARY**
5. [Async Execution](https://docs.bnbchain.org/newl1/core-concepts/async-execution/) — adaptive D, fee on declared gas, parallel EVM status. **PRIMARY**
6. [Multi-Lane](https://docs.bnbchain.org/newl1/core-concepts/multi-lane/) — reserved capacity per address. **PRIMARY**
7. [Native Account Abstraction](https://docs.bnbchain.org/newl1/core-concepts/account-abstraction/) — every 0x76 mechanism and limit. **PRIMARY**
8. [Transaction Types](https://docs.bnbchain.org/newl1/developers/transaction-types/) — 0x76 / 0x77 fields, 864-byte PLONK proofs. **PRIMARY**
9. [Shielded Pool](https://docs.bnbchain.org/newl1/core-concepts/privacy/) — flows, status, security assumptions. **PRIMARY**
10. [State DB](https://docs.bnbchain.org/newl1/core-concepts/state-db/) — LtHash construction and its costs. **PRIMARY**
11. [Migrating from BSC](https://docs.bnbchain.org/newl1/get-started/migrate-from-bsc/) — the list of differences from BSC. **PRIMARY**
12. [System Contracts](https://docs.bnbchain.org/newl1/governance/system-contracts/) — contracts kept from BSC and new ones. **PRIMARY**
13. [FAQ](https://docs.bnbchain.org/newl1/faq/) and [New L1 API List](https://docs.bnbchain.org/newl1/developers/json_rpc/newl1-api-list/) — devnet status, RPC details. **PRIMARY**
14. [BNB Chain H2 2026 Tech Roadmap](https://www.bnbchain.org/en/blog/bnb-chain-h2-2026-tech-roadmap-doubling-down-on-speed) (2026-07-08) — targets, timeline, PQ research. **PRIMARY**
15. [Forum: About the BNBChain NewL1 Category](https://forum.bnbchain.org/t/about-the-bnbchain-newl1-category/5437) (2026-07-14) — "complements BSC rather than replacing it". **PRIMARY**
16. [Forum: Introducing NewL1 MEV Solution - TEE Gateway](https://forum.bnbchain.org/t/introducing-newl1-mev-solution-tee-gateway/5589) (2026-10-10) — the proposal and the author's notes. **PRIMARY** (proposal)
17. [BSC Introduction](https://docs.bnbchain.org/bnb-smart-chain/introduction/) — BSC's current validators and block parameters. **PRIMARY**
18. [BEP-126 Fast Finality](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP126.md) — justified / finalized rules. **PRIMARY**
19. [BEP-619 0.45 s blocks](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-619.md) — BSC's current block interval. **PRIMARY**
20. [BEP-130 PR](https://github.com/bnb-chain/BEPs/pull/130) — Parallel EVM 1.0. **PRIMARY**
21. [Parallel EVM 2.0 blog](https://www.bnbchain.org/en/blog/new-milestone-the-implementation-of-parallel-evm-2-0) — full sync only. **PRIMARY**
22. [BNB Chain Tech Roadmap 2023](https://www.bnbchain.org/en/blog/bnb-chain-tech-roadmap-2023) — "take a break and rethink". **PRIMARY**
23. [BEP-396 TxDAG PR](https://github.com/bnb-chain/BEPs/pull/396) — still a Draft. **PRIMARY**
24. [bnb-chain/op-geth releases](https://github.com/bnb-chain/op-geth/releases) — PEVM beta pre-releases. **PRIMARY**
25. [BEP-592](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-592.md) — non-consensus BAL. **PRIMARY**
26. [bsc PR #3690](https://github.com/bnb-chain/bsc/pull/3690) — removes BEP-592. **PRIMARY**
27. [bsc v1.8.0-alpha](https://github.com/bnb-chain/bsc/releases/tag/v1.8.0-alpha) — back to upstream geth. **PRIMARY**
28. [bsc v1.6.4-feature-BAL7928](https://github.com/bnb-chain/bsc/releases/tag/v1.6.4-feature-BAL7928) — BAL-driven parallel execution build. **PRIMARY**
29. [BEP-684 PR](https://github.com/bnb-chain/BEPs/pull/684) — Header-Only Voting. **PRIMARY**
30. [BEP-703 Payment Lane](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-703.md) — BSC's reserved payment capacity. **PRIMARY**
31. [Monad: Asynchronous Execution](https://docs.monad.xyz/monad-arch/consensus/asynchronous-execution) — D = 3, reserve balance. **PRIMARY**
32. [EIP-7886](https://eips.ethereum.org/EIPS/eip-7886) — Ethereum's delayed execution proposal. **PRIMARY**
33. [Tempo Transactions Specification](https://docs.tempo.xyz/protocol/transactions/spec-tempo-transaction) — Tempo's 0x76. **PRIMARY**
34. [Tempo Account Keychain](https://docs.tempo.xyz/protocol/transactions/AccountKeychain) — three key levels, TIP-20 limits. **PRIMARY**
35. [Tempo Mainnet is live](https://tempo.xyz/blog/mainnet) (2026-03-18). **PRIMARY**
36. [EIP-8130 Keystore Accounts](https://eips.ethereum.org/EIPS/eip-8130) (@1a1f470) — pluggable authenticators. **PRIMARY**
37. [EIP-8430 AA Transaction Type (PR #12385)](https://github.com/ethereum/EIPs/pull/12385) — the 0x79 type split out of 8130. **PRIMARY**
38. [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) — delegated code for EOAs. **PRIMARY**
39. [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) — off-protocol AA. **PRIMARY**
40. [SIMD-0215 Accounts Lattice Hash](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0215-accounts-lattice-hash.md) (@f1afd94) — same-parameter LtHash and its security argument. **PRIMARY**
41. [ePrint 2026/2083](https://eprint.iacr.org/2026/2083) — ~2^81 collision attack on LtHash16. **PRIMARY**
42. [ePrint 2019/227](https://eprint.iacr.org/2019/227) — LtHash deployment at Facebook. **PRIMARY**
43. [RAILGUN Cross-Contract Calls](https://docs.railgun.org/developer-guide/wallet/transactions/cross-contract-calls) — unshield → call → reshield. **PRIMARY**
44. [ZIP-224 Orchard](https://zips.z.cash/zip-0224) — a payments-only privacy protocol. **PRIMARY**
45. [NIST IR 8547 ipd](https://nvlpubs.nist.gov/nistpubs/ir/2024/NIST.IR.8547.ipd.pdf) — elliptic-curve cryptography is vulnerable to Shor's algorithm. **PRIMARY**
46. Earlier reports: [BSC Recent Roadmap](/p/bsc-recent-development/en/), [Native AA: EIP-8130 and EIP-8141](/p/native-aa-eip-8130-8141/en/), [Application-Specific Sequencing](/p/application-specific-sequencing/en/), [Post-Quantum Signature Selection](/p/pq-signature-selection/en/).

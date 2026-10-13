---
template: research
title: Application-Specific Sequencing (ASS / ACE): Cross-Ecosystem Implementations & Blockspace Reallocation for Mantle
subtitle: Most EVM application-specific sequencing mechanisms do not control block ordering; they lock contract entrypoints, tax priority fees, or rely on voluntary builder commitments. The only systems restructuring blockspace are Tempo and BSC lanes, which strictly isolate capacity. Mantle already possesses an early FIFO preconf lane foundation. We recommend implementing a five-lane scheduler inside the builder—partitioning capacity by category in the outer tier while selecting tailored ordering rules in the inner tier.
cols: 4
type: Technical Research · Cross-Ecosystem Comparison · Proposal Design
audience: Protocol and infrastructure developers/researchers on Mantle: familiar with EVM and OP Stack block production, unfamiliar with custom transaction scheduling or MEV auction mechanics
scope: ASS / ACE implementations and proposals across ecosystems as of 2026-10-11 (emphasis on EVM); current and planned Mantle block production paths; Mantle architectural proposal
evidence: 251 claims ledger (observed 195 / inferred 49 / speculative 7); source code across Angstrom, op-rbuilder, rollup-boost, PUR, block-sdk, Tempo, BSC, and Mantle clients; accessed 2026-10-11
date: 2026-10-11 · v1
---
Bottom line: Application-specific sequencing on EVM rarely controls full block ordering. Implementations lock entrypoints (Angstrom L1), tax priority fees (Angstrom L2), or rely on voluntary builder agreements (PUR) ([F1](#F1)). Protocol-level blockspace reallocations are confined to Tempo and BSC payment lanes, which isolate execution capacity without providing FCFS ordering or fee insulation ([F7](#F7)). Mature designs in other ecosystems follow a consistent two-tier model: classifying operations and capping capacity in an outer tier, while applying category-specific sequencing in an inner tier ([F6](#F6)).

Mantle's op-geth and mantle-reth already embed an early FIFO preconf lane, but it lacks capacity limits and relies entirely on sequencer enforcement ([F9](#F9)). We propose a five-lane scheduler within the mantle-reth builder—separating maintenance, payment, launch, and general transactions—while reserving protocol-level validity enforcement strictly for externally auditable constraints ([F11](#F11), [F12](#F12)).

## A Four Enforcement Tiers Overview {sheet meta="by enforcement"}
```tree list
Consensus / Validity Invariant | Violation → Block Invalid
  Hyperliquid, Injective FBA | App-chain
  Tempo lane, BSC lane | Capacity isolation only
Sequencer / Builder Policy | Violation → Reputational cost
  Unichain TEE, Timeboost, PUR | EVM rollups
  BAM MPP, Mantle preconf lane | 
Off-Chain Batcher + Contract Entry | Violation → Call Reverts
  Angstrom L1, Atlas / SVR | 
Contract Rules & Economic Incentives | Zero "Violation" concept
  Angstrom L2 MEV tax, AMQ | 
```

## B Two-Tier Architectural Model {sheet span=2 meta="Design Model"}
```annot
# Mantle Blockspace Reallocation: Two Tiers | Design Recommendation
Outer Tier: [Category]{Deterministic classification: Contract × Selector × Signer} → [Capacity]{Reserved floor or ceiling}
Inner Tier: [Sequencing Rule]{FCFS / Phase-First / Priority Gas Auction / Batch Auction by category}
> Only capacity bounds and segment ordering can be enforced in validity rules. FCFS arrival timestamps require receipt proofs.
```

## C Major Implementation Comparison {sheet meta="2026-10-11"}
| Implementation | Enforcement Mechanism | Composability | Status |
|---|---|---|---|
| Angstrom L1 | Contract lock + Off-chain network | Same-block post-batch | ok Mainnet |
| Angstrom L2 | Contract tax + Sequencer trust | Same-block atomic | ok Base |
| PUR | Builder commitment | Same-block atomic | warn ERC Draft |
| BAM MPP | TEE validation | Same-block | warn 37.66% stake |
| Hyperliquid | Consensus state machine | Bridge-only | ok Mainnet |
| Tempo lane | Consensus invariant | Same-block | ok Mainnet |
| BSC lane | Consensus invariant | Same-block | warn Unactivated |
| Mantle preconf | Sequencer enforcement | Same-block | warn Pre-production |
| Express Relay | Contract permissioning | Single transaction | no Sunset |

## D Key Metrics {sheet span=2 meta="numbers"}
| Metric | Value |
|---|---|
| Mantle Block Time | 2.0s, single sequencer |
| Angstrom L2 Tax Factor (Base) | 200 (~99.5% of arbitrage bid captured by app) |
| BAM MPP Round Latency | ~50ms per round; 37.66% validator stake |
| Tempo Non-Payment Gas Cap | 30M / 500M gas |
| BSC Payment Floor | Default 5%, maximum 10% |
| Arbitrum PGA Proposal | 125ms auction batching by tip |
| ACE Parity Example | Only 2 of 6 permutations valid |

## E Evolution Timeline {sheet span=2 meta="2022 → 2026"}
```timeline v
2022-10 | PEPC Proposal | Proposer commitments enter validity rules
2024-06 | Paradigm MEV Tax | Priority fee ordering + application capture
2024-10 | Sorella ASS Post | Off-chain batching design paradigm
2025-06 | Mantle Preconf Lane | Merged into op-geth (#113)
2025-09 | BAM Mainnet | MPP plugin activation
*2026-01 | ACE Paper | Cancel-priority and causal ordering
2026-02 | Tempo Lane Mainnet | T1 network launch
```

## F Conclusions {sheet span=4}
```callout ok Separate category capacity from execution ordering
- EVM ASS rarely takes over sequencer block order; it enforces contract gate locks or levies priority taxes.
- Capacity partitioning does not equal order execution: payment lanes guarantee space, but do not provide FIFO or latency protection.
- Mantle can deploy a multi-lane scheduler within mantle-reth without hardforking rollup consensus rules.
- Only reserve protocol validity rules for properties verifiable directly from block state.
```

## G How to Read {depth=1}
```callout info Assumed Knowledge (not re-explained here)
- OP Stack rollup architecture, geth transaction pool, block assembly
- Priority fee economics (EIP-1559), MEV extraction, sandwich attacks
- Batch auctions vs continuous double auctions
```
- **5 minutes**: Read Overview (A–F) and Lead.
- **30 minutes**: Follow [EVM Contract Mechanisms](#panel-H), [Builder Policies](#panel-I), [Consensus Partitions](#panel-J), and [Mantle Architecture](#panel-K).

## H EVM Contract-Level Implementations {depth=2}
```finding F1 high
# EVM Contract-Level Sequencing Relies on Entrypoint Locks or Priority Fee Taxation
claim: Without modifying rollups or sequencers, applications implement ASS by locking router execution to off-chain batch auctions (Angstrom L1) or taxing priority fees (Angstrom L2).
evidence: [observed] Contract architectures of Angstrom L1 and L2 [1].
implication: Application-level rules cannot force block positioning without sequencer cooperation.
```

```finding F2 high
# Angstrom L2 Priority Tax Captures ~99.5% of Arbitrage Bids for Liquidity Providers
claim: Under Angstrom L2 on Base, the tax formula is:
$$
\text{Tax} = \text{swapMEVTaxFactor} \times 120{,}000 \times (\text{priority\_fee} - \text{threshold})
$$
At factor 200, 99.5% of marginal fee increases flow directly to the pool rather than the sequencer.
evidence: [observed] `AngstromL2.sol#L195-215` verified on Base mainnet [1].
implication: MEV taxation preserves liquidity without off-chain relay infrastructure.
```

```finding F3 high
# Priority Taxation Fails If Sequencers Do Not Enforce Strict Fee Ordering
claim: If a sequencer does not sort transactions strictly by priority fee or allows private deals, MEV tax protection collapses.
evidence: [inferred] Paradigm MEV tax operational axioms [1].
implication: MEV tax applications require explicit sequencer ordering guarantees.
```

## I Builder-Level Policies {depth=2}
```finding F4 high
# Rollup Builders Can Implement Custom Scheduling Without Altering Rollup Consensus
claim: External builders like op-rbuilder and mantle-reth can prioritize transaction categories (e.g. pre-confirmations, oracle updates) within the block construction pipeline.
evidence: [observed] Codebase analysis of op-rbuilder and mantle-reth [1].
implication: Mantle can deploy multi-lane transaction scheduling without protocol hard forks.
```

```finding F5 medium
# PUR Enables Trust-Minimized Top-of-Block Ingress for Oracle Feeds
claim: Priority Update Registry (PUR) allows oracle keepers to register priority updates that participating builders voluntarily insert before the first reading transaction.
evidence: [observed] ERC specification and Flashbots PUR contracts [4].
implication: Critical oracle updates avoid mempool priority fee wars when builders comply.
```

## J Consensus-Level Capacity Partitioning {depth=2}
```finding F6 high
# Multi-Tier Scheduling Partitions Capacity Globally Before Ordering Locally
claim: Injective, Tempo, and Cosmos Block SDK partition block space into discrete category quotas before applying specialized sorting (FIFO, auction, pro-rata) within each bucket.
evidence: [observed] Cosmos Block SDK and Tempo lane specifications [1].
implication: Robust blockspace management requires decoupling capacity bounds from ordering rules.
```

```finding F7 high
# Capacity Lanes Do Not Guarantee First-Come-First-Served Execution
claim: Payment lanes on BSC and Tempo guarantee block inclusion quotas during congestion, but transactions within the lane remain subject to gas tip or FIFO competition. They do not eliminate censorship or provide latency immunity.
evidence: [observed] BSC BEP-703 and Tempo consensus validation rules [1].
implication: Payment lanes solve crowding-out during surges, but cannot enforce arrival-order fairness.
```

```finding F8 medium
# Off-Chain Batching Sacrifices Same-Block Atomic Composability
claim: Protocols using off-chain solvers (CowSwap, Angstrom L1) execute trades in discrete batches, preventing multi-contract atomic composability within user transactions.
evidence: [observed] Batch execution mechanics of CowSwap and UniswapX [1].
implication: High-frequency AMMs require on-chain atomic execution to retain aggregator routing.
```

## K Proposed Five-Lane Architecture for Mantle {depth=2}
```finding F9 high
# Mantle Already Contains an Experimental FIFO Preconf Lane in Client Codebases
claim: Mantle's op-geth and mantle-reth implementations include an experimental FIFO pre-confirmation lane sorting whitelisted transactions ahead of general traffic.
evidence: [observed] Commit `mantlenetworkio/op-geth@e33cd26` PR #113 [1].
implication: Mantle possesses the code primitives required to expand into structured multi-lane block assembly.
```

```finding F10 high
# Five-Lane Scheduler Decouples Maintenance, Payments, Launches, and General Execution
claim: We recommend structuring block production into five distinct priority lanes:
1. Forced / Pre-confirmation Transactions (system-level inclusion)
2. Oracle Maintenance (PUR-style top of block)
3. Payment Lane (guaranteed quota)
4. Launchpad Phase-Shift (dedicated quota)
5. General Execution (standard priority fee auction)
evidence: [inferred] Architectural synthesis of cross-chain scheduling designs.
implication: High-frequency trading and retail payments no longer congest one another.
```

```finding F11 medium
# Hardening Block Validity Invariants Must Follow Client Scheduler Stabilization
claim: Hardcoding lane quotas into consensus validity rules increases fork risk. Mantle should stabilize scheduler behavior at the builder layer before freezing consensus invariants.
evidence: [inferred] Lessons from BSC and Tempo rollout schedules.
implication: Maintain flexibility in scheduler configuration during early adoption.
```

```finding F12 high
# FCFS Guarantees Require Cryptographic Receipt Auditing Rather Than Node Trust
claim: Validating true first-come-first-served ordering requires sequencer-signed arrival receipts, as arrival timestamps cannot be independently verified from historical block state.
evidence: [inferred] Distributed consensus ordering constraints.
implication: Enforce SLA guarantees via cryptographic receipts and slashable bonds.
```

## L Glossary {depth=2}
```glossary
ASS | Application-Specific Sequencing | Custom transaction ordering rules tailored to specific application categories.
ACE | Application-Controlled Execution | Architecture allowing applications to influence transaction scheduling and block placement.
preconf | Pre-Confirmation | Fast sub-second commitment signed by a sequencer guaranteeing transaction inclusion.
MEV tax | Priority Fee Tax | Mechanism routing priority gas fees directly to application pools to disincentivize latency wars.
PUR | Priority Update Registry | Registry protocol enabling priority inclusion for essential protocol updates.
BAM | Block Assembly Marketplace | Auction protocol allowing decentralized builders to bid on transaction bundles.
FCFS | First-Come First-Served | Ordering transactions strictly according to verified arrival timestamp.
```

## M References {depth=2}
1. [Sorella Labs: Application-Specific Sequencing Overview](https://sorellalabs.xyz) — Foundational ASS paper. **PRIMARY**
2. [Paradigm: MEV Taxes](https://paradigm.xyz/2024/06/mev-taxes) — MEV tax formulation. **PRIMARY**
3. [Angstrom L2 Protocol](https://github.com/SorellaLabs/angstrom) — Source code repository. **PRIMARY**
4. [Flashbots Priority Update Registry](https://github.com/flashbots/priority-update-registry) — PUR implementation. **PRIMARY**
5. [Mantle Network op-geth](https://github.com/mantlenetworkio/op-geth) — Preconf lane PR #113. **PRIMARY**

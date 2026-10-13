---
template: research
title: BSC Recent Roadmap: CAS20, Payment Lane, and the Jenner Upgrade
subtitle: BSC surrendered custom execution optimizations back to upstream geth, shifting engineering focus toward protocol-level financial infrastructure: native compliant CAS20 assets, reserved Payment Lane blockspace, and builder block production pipelines. CAS20 directly adapts Base B20; Payment Lane shares architectural shape with Tempo. As of 2026-10-09, Jenner features are merged but unreleased and unactivated.
cols: 4
type: Technical Research · Codebase Deep Dive
audience: Developers familiar with EVM and Ethereum client architecture who have not studied BSC's Parlia consensus or MEV builder pipelines
scope: BSC (Go), reth-bsc (Rust), BEPs/BAPs repositories between 2026-06 and 2026-10-09; Jenner hard fork; comparison with Base B20 and Tempo payment lanes
evidence: 154 claims ledger (observed 131 / inferred 19 / speculative 4); source code bsc @8cc60b2, reth-bsc @349f55c, BEPs @e9b2be3, base-std @a2954a8, base @f1f40ba, tempo @feb5dff, flashbots/priority-update-registry @8701e8e; BSC mainnet RPC; accessed 2026-10-09
date: 2026-10-09 · v1
---
Bottom line: BSC's recent development is structured across three tiers. At the asset tier is CAS20: a client-native compliant token standard replicating Base B20's interface and storage layouts ([F1](#F1), [F2](#F2)). At the resource tier is the Payment Lane: reserving a minimum 5% gas floor for payment transactions per block ([F5](#F5)). At the block production tier is BEP-675 BidBlock: currently producing ~98% of mainnet blocks ([F8](#F8)). Concurrently, BSC removed proprietary execution optimizations to realign with upstream geth ([F10](#F10)). CAS20 and Payment Lane belong to the Jenner hard fork, which has not yet entered any official release as of 2026-10-09 ([F11](#F11)).

## A Recent Roadmap Architecture {sheet meta="by layer"}
```tree list
Asset Tier | CAS20 (BEP-702): Native compliant token standard
Resource Tier | Payment Lane (BEP-703): Reserved gas floor for payments
Contract Primitives | 0x70 millisecond timestamp precompile (BEP-706)
  0x68 dual-signer evidence charged per byte | Bound to Jenner
Block Pipeline | BEP-675 BidBlock + gRPC
  Gas Limit | 55M → 70M (Live) → 80M / 90M (Target)
Consensus Parameters | Backup validator timeout 2s → 1s (BEP-714)
Off-Chain Integrations | BAP-710 PropAMM Relayer + PUR-style registry
Client Foundation | Upstream geth v1.17.3 sync; reth-bsc dual client
```

## B Validity Invariant Rule {sheet span=2 meta="BEP-703"}
```annot
# Payment Lane Block Validity Invariant | Evaluated every block
[N]{Normal + system transaction gas} + max([P]{Payment gas consumed}, [Q]{Reserved floor}) ≤ [G]{Block gas limit}
# Q Derivation | Evaluated from parent state
Q = [ratio]{Governance param, default 500, max 1000} × G / 10000
> Equivalent to: N ≤ G - Q, and N + P ≤ G. Payments may exceed Q, while normal transactions can never consume Q.
```

## C Architectural Lineage {sheet meta="lineage"}
| Dimension | CAS20 ↔ B20 | Lane ↔ Tempo |
|---|---|---|
| Design Isomorphism | ok Identical interface & layout | warn Shared structural constraint |
| Codebase Citations | ok Comments cite base-std | no Zero references |
| Code Forking | no Independent Go implementation | no Independent code |
| Counterparty Live | ok 2026-06-25 | ok 2026-02-12 |

## D Milestone Progress {sheet span=2 meta="2026-10-09"}
| Feature | Go / Rust Source | Release | Mainnet Status |
|---|---|---|---|
| CAS20 | ok Merged | no Unreleased | no Requires governance |
| Payment Lane | ok Merged | no Unreleased | no Whitelist empty |
| BEP-706 / 714 | ok Merged | no Unreleased | no Pending fork |
| BEP-675 BidBlock | ok Merged | ok v1.7.7 | ok ~98% of blocks |
| BEP-675 Hardening & gRPC | ok Merged | no Unreleased | no Development |
| BAP-710 | warn Off-chain spec | — | warn Proposal draft |

## E Evolution Timeline {sheet span=2 meta="2026"}
```timeline v
06-25 | Base B20 Mainnet | Beryl upgrade activation
08-25 | BSC Pasteur Mainnet | BidBlock builder opens
*09-11 | CAS20 & Lane Merged | Go client codebase
09-20 | Jenner Announcement | BEP-718 published
09-23 | Rust Port Merged | reth-bsc implementation
Late-Oct | Testnet Jenner | Scheduled
Late-Nov | Mainnet Jenner | Scheduled
```

## F Conclusions {sheet span=4}
```callout ok Align execution with upstream; differentiate via financial primitives
- CAS20 is a protocol-native token: state resides on-chain without gas discounts; savings stem from bypassing EVM bytecode interpretation. It adapts Base B20's design via clean Go re-implementation (F1, F2).
- Payment Lane enforces a reserved gas quota (default 5%) without parallel execution threads: qualifying transactions must target whitelisted token contracts or represent direct native BNB transfers to code-less accounts (F5, F6). It resembles Tempo structurally with inverse preferences, showing no fork lineage (F9).
- Mainnet-active upgrades are limited to BEP-675 BidBlock and the 70M gas limit; Jenner features await formal release, hard fork activation, and governance flags (F8, F11, F4).
- Components operate independently: CAS20 tokens do not automatically enter the payment whitelist, and router-mediated payments bypass lane protections (F6).
```

## G How to Read {depth=1}
```callout info Assumed Knowledge (not re-explained here)
- EVM execution semantics, state storage slots, precompiles
- Geth architecture, transaction pools, block building
- BSC Parlia Proof of Staked Authority (PoSA) consensus
```
- **5 minutes**: Read Overview (A–F) and Lead.
- **30 minutes**: Follow [Asset Tier (CAS20)](#panel-H), [Resource Tier (Payment Lane)](#panel-I), [Block Pipeline (BidBlock)](#panel-J), and [Tempo Comparison](#panel-K).

## H Asset Tier: CAS20 (BEP-702) {depth=2}
```finding F1 high
# CAS20 Adapts Base B20 Architecture Directly While Implementing Independent Go Logic
claim: CAS20 copies Base B20's function selectors, parameter structures, and storage layouts, adding BSC-specific governance roles and transfer memo handling. The implementation is cleanly written in Go rather than copy-pasted.
evidence: [observed] Code comparison between `bsc/core/vm/contracts_bep702.go` and `base-std/src/B20.sol` [1].
implication: Token contracts adhering to B20 deploy on BSC with identical operational semantics.
```

```finding F2 high
# CAS20 Bypasses Bytecode Interpretation but Imposes Standard Gas Accounting
claim: CAS20 transactions execute natively in client Go/Rust code rather than EVM bytecode, reducing CPU overhead while retaining standard EVM state access gas pricing.
evidence: [observed] Gas table implementation in `contracts_bep702.go` [1].
implication: Protocol safety is preserved; gas costs do not undercut ordinary EVM operations.
```

```finding F3 medium
# Compliance Controls Are Enforced Programmatically via Granular Roles
claim: CAS20 defines master, issuer, compliance, and pauser roles to freeze, seize, and mint compliant tokens.
evidence: [observed] Role enforcement methods in BEP-702 specification [1].
implication: Regulatory seizure and freeze actions execute natively on-chain without custom wrapper contracts.
```

```finding F4 high
# CAS20 Requires Governance Activation Following the Jenner Hard Fork
claim: Merging code does not activate CAS20. Activation requires the Jenner hard fork followed by BSC validator governance approval.
evidence: [observed] Genesis and hard fork flags in `params/config.go` [1].
implication: CAS20 tokens cannot be deployed until governance schedules post-fork activation.
```

## I Resource Tier: Payment Lane (BEP-703) {depth=2}
```finding F5 high
# Payment Lane Implements an Invariant Gas Floor Rather than a Separate Execution Thread
claim: BEP-703 reserves a minimum percentage (default 5%, up to 10%) of block gas for payment transactions. Normal transactions are rejected if total non-payment gas exceeds 95% of limit.
evidence: [observed] Block validation logic in `consensus/parlia/parlia.go#verifyBlockHeader` [1].
implication: Payment transactions do not run in parallel; they simply avoid being crowded out by high-fee non-payment traffic.
```

```finding F6 high
# Payment Qualification Relies on a Target Address Whitelist That Starts Empty
claim: A transaction qualifies for the Payment Lane if its target `to` address resides on the governance whitelist, or if it represents an eligible native BNB value transfer to an address without code. Transactions routing through general DEX routers do not qualify.
evidence: [observed] Address classification methods in BEP-703 source code [1].
implication: Payments qualify when sent to whitelisted target token addresses or directly as native BNB transfers to non-contract accounts; general DEX swaps do not qualify.
```

```finding F7 medium
# The Reserved Payment Floor Floats Proportionally with the Block Gas Limit
claim: Floor gas $Q = \text{ratio} \times G / 10{,}000$. As gas limit expands from 55M to 70M, reserved payment space expands from 2.75M to 3.5M gas.
evidence: [observed] Formula specification in BEP-703 text [1].
implication: Scaling overall block limits automatically widens guaranteed throughput for payment use cases.
```

## J Block Production Tier: BEP-675 BidBlock {depth=2}
```finding F8 high
# BEP-675 BidBlock Produces ~98% of Mainnet Blocks via Builder Auction
claim: BidBlock decouples block building from validation, allowing external builders to submit block bids. Over 98% of mainnet blocks are assembled by MEV builders.
evidence: [observed] Mainnet RPC indexing across 10,000 recent blocks [1].
implication: Transaction ordering on BSC is predominantly optimized for MEV capture rather than raw FIFO queues.
```

```finding F9 high
# Payment Lane Resembles Tempo Structurally but Inverts Operational Priorities
claim: Tempo reserves general execution space while capping high-frequency lanes; BSC reserves a priority floor for payments while constraining general non-payment traffic by $N \le G - Q$. There is zero evidence of code sharing.
evidence: [observed] Architectural comparison between `tempo/src/lane.rs` and `bsc/core/block_validator.go` [1].
implication: Both chains independently converged on quota-based block partitioning.
```

## K Maintenance and Client Alignment {depth=2}
```finding F10 high
# BSC Pruned Custom Storage Optimizations to Align with Upstream Geth v1.17
claim: BSC deleted proprietary execution patches and fast-caching forks to maintain synchronization with upstream go-ethereum v1.17.3.
evidence: [observed] Commit log diffs removing custom state database caches [1].
implication: Upstream EVM compatibility and security patches apply cleanly to BSC client builds.
```

```finding F11 high
# Jenner Hard Fork Remains Unscheduled as of October 2026
claim: While core features are merged into main branches, testnet and mainnet hardfork block heights remain unassigned.
evidence: [observed] Hard fork configuration constants in `bsc/params/config.go` [1].
implication: Protocol features will not activate on mainnet until late Q4 2026.
```

## L Implications for Mantle {depth=2}
- **Native Compliance Tokens**: Mantle can adapt CAS20 / B20 to establish institutional RWA asset foundations.
- **Reserved Blockspace**: Payment lanes prove that guaranteed transaction quotas can be enforced via simple block validation invariants without multi-thread execution engines.
- **Builder Decoupling**: MEV auctions on L2s require explicit builder-sequencer agreements to prevent transaction censorship.

## M Glossary {depth=2}
```glossary
CAS20 | Compliant Asset Standard 20 | BSC native compliant token standard executing directly in client software.
BEP-702 | BEP-702 Specification | Protocol proposal formalizing CAS20 architecture on BNB Smart Chain.
BEP-703 | Payment Lane Specification | Proposal establishing reserved blockspace gas floors for payment transactions.
Payment Lane | Payment Reserved Space | Guaranteed block gas quota inaccessible to non-payment transactions during congestion.
BidBlock | BEP-675 Block Auction | Block building auction protocol separating MEV builders from validator proposers.
Jenner | Jenner Hard Fork | BSC scheduled network upgrade activating CAS20, Payment Lane, and opcodes.
B20 | Base Token Standard | Base native compliant asset architecture serving as the design model for CAS20.
Tempo | Tempo Blockchain | Architecture enforcing quota-based transaction classification.
```

## N References {depth=2}
1. [BNB Smart Chain Repository](https://github.com/bnb-chain/bsc) — Source code at commit `8cc60b2`. **PRIMARY**
2. [BEPs Repository](https://github.com/bnb-chain/BEPs) — Specifications for BEP-702, BEP-703, BEP-675, BEP-718. **PRIMARY**
3. [Base Standard Contracts Repository](https://github.com/base-org/base-std) — Base B20 specification. **PRIMARY**
4. [Tempo Blockchain Repository](https://github.com/tempo-org/tempo) — Lane architecture reference. **PRIMARY**
5. [Flashbots Priority Update Registry](https://github.com/flashbots/priority-update-registry) — BAP-710 design reference. **PRIMARY**

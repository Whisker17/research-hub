---
template: research
title: Atomic Synchronous Composability (EEZ): Mechanics, First Mainnet Tx & Mantle L2↔L3
subtitle: EEZ pre-computes cross-chain execution off-chain, then verifies and consumes results within the identical L1 block, allowing L1 and L2 transactions to succeed or revert atomically. The first mainnet transaction executed a simple L1→L2 transfer authenticated via a single ECDSA signature.
cols: 4
type: Technical Research · Developer Onboarding
audience: Mantle developers: familiar with EVM and rollup fundamentals, unfamiliar with synchronous cross-chain composability
scope: Atomic synchronous mechanics, infrastructure modification requirements, decoding the first mainnet transaction, comparative paradigm analysis, and mapping to Mantle L2↔L3
evidence: 207 claims ledger (observed 165 / inferred 38 / speculative 4); on-chain data (Ethereum block 26127444); source code eez-core-protocol @6ae4110, eez-rollup0 @6ff63ec; accessed 2026-10-06
date: 2026-10-06 · v1
---
Bottom line: EEZ (Ethereum Economic Zone) "synchrony" does not mean L1 actively halts execution to read L2 state. Instead, cross-chain execution outcomes are pre-computed off-chain, proven on L1, and verified and consumed sequentially within the identical L1 block ([F1](#F1)). The first mainnet transaction on 2026-10-05 transferred 0.001 ETH from an L1 user to their own L2 address across two consecutive transactions within block 26127444 ([F2](#F2)). Proofs currently rely on a single ECDSA signature rather than ZK proofs ([F3](#F3)). For Mantle, "L3 accessing L2 liquidity" aligns directly with EEZ's primary architecture ([F8](#F8)), though four structural conflicts must be resolved first ([F9](#F9)).

## A Component Architecture {sheet meta="components"}
```tree list
`Composer` Off-Chain | Simulates L1 + L2 execution, generates execution table
`Signer / Prover` Off-Chain | Attests to the execution table (currently ECDSA)
`postAndVerifyBatch` L1 | Verifies proof, publishes execution entries
`CrossChainProxy` L1 | Represents remote contracts; invoked by user txs
`EEZ Manager` L1 | Asserts root, call traces, and conservation of ETH
`EEZL2` + `0x76` L2 | Loads table on child rollup, dispatches inbound calls
```

## B Entry Commitment Hash {sheet span=2 meta="proxyEntryHash"}
```annot
# keccak256(abi.encode(...)) = 0x2846…0fc4 | Recomputed locally = On-chain value
[0xceaf…]{L1 caller} → [r1:0xceaf…]{Identical address on rollup 1} [1e15]{!0.001 ETH}
> Binds empty calldata and callGas 0; altering any field invalidates hash verification
```

## C Synchronous Composability Paradigms {sheet meta="routes"}
| Paradigm | L1↔L2 Synchronous Calls with Return Values |
|---|---|
| EEZ | ok Live on mainnet (ECDSA signature proof) |
| ULTRA TX / SCOPE | warn Conceptual proposal drafts |
| Shared Sequencer | no Guarantees joint inclusion only |
| OP Interop | no Asynchronous messaging without returns |
| AggLayer / Intents | no Asynchronous fill settlement |

## D Key Metrics {sheet span=2 meta="2026-10-06"}
| Metric | Value |
|---|---|
| First AS Transaction | Block 26127444, Index 32, 0.001 ETH |
| Verification Tx Gas | 297,862 (Carried 1 blob, 142 bytes used) |
| User Execution Tx Gas | 111,263 |
| Proof Type | Single 65-byte ECDSA signature (Threshold 1) |
| Target Prover Benchmark | ~12 GPUs, ~7 seconds to prove Ethereum block |
| Mantle Block Interval | 2.0 seconds |

## E Evolution Timeline {sheet span=2 meta="2024–2026"}
```timeline
2024-10 | Vitalik: The Surge | Highlights synchronous composability as rollup goal
2026-02 | ethresear.ch #23998 | Jordi Baylina proposes proxies + execution tables
2026-03 | EEZ Announced | Launched by Gnosis and ZisK, funded by EF
2026-08 | GIP-153 Approved | Gnosis Chain governance votes to become EEZ rollup
2026-09 | Mainnet Deployment | EEZ manager contracts deployed on Ethereum
*2026-10 | First Mainnet AS Tx | 0.001 ETH L1→L2 transfer with ECDSA proof
```

## F Conclusions {sheet span=4}
```callout ok Pre-compute off-chain, verify and consume in-block
- Mechanics: Off-chain pre-computation, L1 proof verification, intra-block consumption; discrepancies cause atomic rollbacks (F1).
- Status: Mainnet has validated only basic L1→L2 deposits; security rests on a single signer and single owner (F2, F3).
- Rollup Upgrades: Ethereum requires zero hard forks; upgrades target L2 nodes, composer, signer, builder, and derivers (F4).
- Mantle: L3 routing into L2 liquidity represents the most viable path; prioritize narrow prototypes for launchpad vaults (F8, F9).
```

## G How to Read {depth=1}
```callout info Assumed Knowledge (not re-explained here)
- EVM call stack: `CALL` return values and `revert` frame bubbling
- Rollup state derivation, blob storage, and sequencer batch submission
```
- **5 minutes**: Read Overview (A–F) and Lead.
- **30 minutes**: Follow [Transaction Anatomy](#panel-H), [Paradigms](#panel-I), and [Mantle L2↔L3](#panel-J).

## H Transaction Anatomy and Verification Flow {depth=2}
```finding F1 high
# Synchronous Execution Relies on Intra-Block Consumption of Pre-Computed State
claim: Rather than querying cross-chain state synchronously during EVM execution, EEZ verifies an off-chain execution trace and enforces sequential entry consumption within the same L1 block.
evidence: [observed] Transaction sequencing in Ethereum block 26127444 [1].
implication: Synchronous composability is achievable without modifying L1 EVM opcodes.
```

```finding F2 high
# The First Mainnet Transaction Proved Basic L1 to L2 Value Transfer
claim: On 2026-10-05, user `0xceaf...` transferred 0.001 ETH to their own address on Rollup 1 across two sequential transactions (indices 31 and 32).
evidence: [observed] On-chain event decoding of `ProxyConsumed` event [1].
implication: End-to-end execution pipeline is operational on Ethereum mainnet.
```

```finding F3 high
# Production Proof Security Currently Rests on a Single ECDSA Key
claim: While intended for real-time ZK proofs (ZisK), current mainnet verification validates a single 65-byte ECDSA signature from the project deployer.
evidence: [observed] `postAndVerifyBatch` transaction inputs in block 26127444 [1].
implication: Cryptographic decentralization remains in a testbed phase.
```

## I Comparative Interoperability Paradigms {depth=2}
```finding F4 high
# EEZ Requires Comprehensive Node Upgrades While Leaving L1 Consensus Intact
claim: Deploying EEZ rollup nodes requires custom execution table interpreters (e.g. opcode `0x76`) and composer simulation engines, while L1 contracts deploy as standard Solidity code.
evidence: [observed] Codebase analysis of `eez-rollup0` and `eez-core-protocol` [1].
implication: Adopting EEZ on Mantle requires modifying child rollup node binaries.
```

## J Mapping to Mantle L2↔L3 Architectures {depth=2}
```finding F8 high
# L3 Accessing L2 Liquidity Matches EEZ's Simplest Architectural Direction
claim: Enabling an application-specific L3 on Mantle to tap deep L2 liquidity pools atomically matches EEZ's directional flow.
evidence: [inferred] Architectural synthesis of GIP-153 and Mantle roadmap documents.
implication: Mantle can deploy an L2 EEZ manager contract to anchor synchronous L3s.
```

```finding F9 high
# Porting to Mantle Requires Resolving Block-Time and Finality Mismatches
claim: Porting EEZ to Mantle L2↔L3 requires resolving four specific architectural blockers:
1. Native value accounting represents MNT rather than ETH.
2. EEZL2 predeploy address clashes with the OP Stack messenger.
3. The parent L2 does not currently support blob carrier transactions.
4. Same-block execution requires a sequencer bundle interface and proof latencies strictly below Mantle's 2-second block window.
evidence: [inferred] Architectural synthesis of Mantle OP Stack derivation and EEZ rollup specifications [1].
implication: Early prototypes should evaluate transitional multisig commitments before pursuing full ZK proof pipelines.
```

## K Glossary {depth=2}
```glossary
EEZ | Ethereum Economic Zone | Protocol enabling atomic synchronous composability across rollups and L1.
atomic synchrony | Atomic Synchrony | Cross-chain execution where calls across two chains succeed or revert together in one block.
execution table | Execution Table | Pre-computed trace of cross-chain calls, values, and outcomes committed to L1.
composer | Off-Chain Composer | Node simulating joint L1 and L2 transactions to produce execution tables.
CrossChainProxy | Cross-Chain Proxy | Contract representing remote addresses on L1 to route synchronous calls.
```

## L References {depth=2}
1. [EEZ Core Protocol Repository](https://github.com/eez-protocol/eez-core-protocol) — Contracts at commit `6ae4110`. **PRIMARY**
2. [Ethereum Block 26127444](https://etherscan.io) — First mainnet AS transaction trace. **PRIMARY**
3. [ethresear.ch #23998: Synchronous Composability](https://ethresear.ch) — Jordi Baylina proposal. **PRIMARY**
4. [Gnosis GIP-153](https://forum.gnosis.io) — Gnosis Chain transition specification. **PRIMARY**

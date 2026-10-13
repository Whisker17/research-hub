---
template: research
title: NEAR Deep Dive: Sharding Architecture, Intents/Privacy/AI Stack & Ecosystem
subtitle: NEAR did not force three narratives into a single VM. They share three core primitives: account-based authorization, a unified settlement ledger within a single contract, and an MPC network. What users actually consume is cross-chain asset swapping from existing wallets; Privacy and AI remain nascent. NEAR exemplifies a hybrid model where infra lays capability, products filter demand, and proven demand drives infra.
cols: 4
type: Technical Research · Developer Onboarding
audience: Mantle developers: familiar with EVM and rollup fundamentals, unfamiliar with NEAR (sharding, asynchronous execution, account model)
scope: L1 and chain abstraction architecture, Intents / Confidential Intents / NEAR AI primitives and infra mapping, ecosystem metrics, narrative vs infra timelines, and implications for Mantle
evidence: 314 claims ledger (observed 257 / inferred 46 / speculative 11); source code nearcore @090da31, NEPs @dcc0bcb, near/intents @4127e8e, near/mpc @e968367, nearai/ironclaw @b0b999d; NEAR mainnet RPC, DefiLlama, Intents explorer, 1Click API; accessed 2026-10-07
date: 2026-10-07 · v1
---
Bottom line: NEAR segments Intents, Privacy, and AI across distinct execution environments. They share three primitives: NEAR accounts and key delegation, the `intents.near` in-contract ledger, and an MPC network handling threshold signatures, key derivation, and external verification ([F1](#F1), [F5](#F5)). The fundamental trade-off of NEAR L1 is that cross-account calls are strictly asynchronous, forcing Intents to concentrate atomic balances inside a single contract ([F2](#F2)). The sole narrative backed by substantial user adoption is cross-chain swapping: $4.41B in 30-day volume distributed via external wallets and aggregators ([F9](#F9)). "Product-driven infra" applies only to the account model and sharding layout ([F11](#F11)). As of 2026-10-07, NEAR Intents does not support Mantle ([F13](#F13)).

## A NEAR Product Stack Architecture {sheet meta="layers"}
```tree list
User Entrypoint | External wallets, aggregators, near.com, AI agents
  1Click API / Message Bus | Off-chain RFQ matching
    `intents.near` Ledger | Public settlement within a single contract
    `intents.far` Ledger | FAR permissioned private rollup
  NEAR AI Cloud / IronClaw | Off-chain TEE inference and agent runtime
  MPC Network `v1.signer` | Threshold signatures · CKD · Chain verification
    Omni / PoA / HOT Bridges | Deposit and withdrawal paths
  NEAR L1 Consensus | 10 shards, asynchronous receipt routing
```

## B Intra-Contract Atomic Balancing {sheet span=2 meta="token_diff"}
```annot
# Single execute_intents Batch | One Atomic Execution Receipt
Alice: [USDC -1000, BTC +0.0081]{User-signed token_diff}
Solver: [USDC +1000, BTC -0.0081]{Solver-signed token_diff}
Net Sum Across All Tokens = [0]{!Must balance to zero or transaction reverts}
> Inbound and outbound bridges operate outside this atomic boundary
```

## C Narrative to Infrastructure Mapping {sheet meta="mapping"}
| Infrastructure Primitive | Intents | Confidential | AI Stack |
|---|---|---|---|
| Accounts / Key Delegation | ok | ok | ok Auth |
| In-Contract Ledger | ok | ok | warn Via Intents |
| MPC Threshold Signatures | ok Withdrawals | warn Via public chain | no |
| Private Rollup (FAR) | no | ok | warn Payments |
| TEE Compute | no | warn Product marketing | ok IronClaw |

## D Key Metrics {sheet span=2 meta="2026-10-07"}
| Metric | Value |
|---|---|
| Mainnet Version | Protocol Version 86 · nearcore 2.13.4 |
| Block Time / Finality | ~0.59s block interval; ~1.2s finality |
| Shard Count | 10 active shards (dynamic cap: 10) |
| MPC Signer Network | 17 independent operators (threshold 11/17; 13 in TDX) |
| Intents 30-Day Volume | $4.41B (Official explorer: $3.26B) |
| 30-Day Fees vs. L1 Gas | $7.38M in user fees / $141K in L1 gas (~52x ratio) |
| Daily Active Accounts | 125,000 (Down from peak of ~2.24M in 2024-06) |

## E Evolution Timeline {sheet span=2 meta="2017–2026"}
```timeline
2017 | NEAR.ai Founded | Machine learning startup; pivoted to crypto in 2018
2024-08 | Chain Signatures Mainnet | Launched alongside Nightshade 2.0 sharding
*2024-11 | Intents Beta | Deployed atop Chain Signatures network
2025-05 | 600ms Block Times | Optimistic block pipelining activated
2026-07 | Gas Keys & Dynamic Sharding | Confidential B2B settlement released
2026-10 | Sweat Economy Restructuring | Sweat moves off consumer chains
```

## F Conclusions {sheet span=4}
```callout ok Shared accounts, unified ledgers, and MPC networks—not a monolithic VM
- Architecture: Asynchronous receipts confine atomicity to single contracts; Intents uses an in-contract ledger to settle swaps, while MPC and bridging relays manage custody (F1, F2, F5, F6).
- Product Reality: Intents demonstrates genuine market volume and external distribution; Confidential Intents conceals data from the public but not operators; NEAR AI operates off-chain (F7, F8, F9).
- Development Model: Account abstraction and sharding layouts are driven by product needs, while VM execution follows protocol roadmap milestones (F3, F11).
- Mantle Takeaways: Adopt API interfaces and wallet distribution channels; do not copy asynchronous cross-contract call overhead (F13).
```

## G How to Read {depth=1}
```callout info Assumed Knowledge (not re-explained here)
- Blockchain sharding concepts, state splitting, cross-shard message passing
- Asynchronous execution vs. synchronous atomic execution
- Multi-party computation (MPC) threshold cryptography and Chain Signatures
```
- **5 minutes**: Read Overview (A–F) and Lead.
- **30 minutes**: Follow [Sharded Architecture](#panel-H), [Intents Ledger](#panel-I), and [Mantle Synthesis](#panel-J).

## H Sharded Architecture and Asynchronous Execution {depth=2}
```finding F1 high
# Asynchronous Execution Restricts Atomic Guarantees Strictly to Single Contracts
claim: Cross-account calls on NEAR route via asynchronous receipts taking 2-3 blocks to settle. Reverting a child call does not automatically revert caller state unless custom compensation handlers are authored.
evidence: [observed] Execution dispatch specifications in `nearcore` runtime [1].
implication: Multi-contract atomic composability (like Flash Loans) is impossible across separate accounts.
```

```finding F2 high
# Intents Concentrates Token Balances into a Single Contract to Achieve Atomicity
claim: `intents.near` functions as an internal balance sheet where solvers and users exchange assets atomically via balanced `token_diff` arrays inside a single execution receipt.
evidence: [observed] `intents.near` contract code at commit `4127e8e` [1].
implication: The protocol circumvents NEAR's asynchronous cross-contract latency by centralizing liquidity into a monolithic ledger.
```

## I MPC Chain Signatures and Cross-Chain Bridging {depth=2}
```finding F5 high
# MPC Network Powers External Chain Signatures and Key Derivation
claim: A decentralized network of 17 validator nodes (threshold 11/17, with 13 operating inside Intel TDX hardware enclaves) signs transactions across external blockchains (Bitcoin, Ethereum, Solana) on behalf of NEAR accounts without exposing underlying private keys.
evidence: [observed] `near/mpc` repository and on-chain signer contract `v1.signer` [3].
implication: NEAR acts as an orchestration and signing layer for external blockchain ecosystems.
```

```finding F9 high
# Cross-Chain Swaps Represent the Dominant Driver of User Demand
claim: NEAR Intents processed $4.41B in volume over 30 days, routed predominantly through external wallets and aggregators (SwapKit, Rango, ZODL, LI.FI) rather than native NEAR web portals.
evidence: [observed] 1Click API telemetry and DefiLlama indexing data [4][5]. Internal buyback volumes are distinguished from organic external user demand.
implication: Distribution through existing multi-chain user touchpoints drives volume rather than standalone chain brand identity.
```

## J Lessons and Recommendations for Mantle {depth=2}
```finding F11 high
# Product-Driven Iteration Succeeded at the Account Tier but Not the VM Tier
claim: NEAR's account model (named accounts, functional access keys) expanded rapidly through product requirements, while asynchronous WebAssembly execution created friction for DeFi builders.
evidence: [inferred] Ecosystem developer migration patterns and volume concentration.
implication: Mantle should preserve synchronous EVM composability while innovating in account abstraction and cross-chain execution interfaces.
```

```finding F13 medium
# NEAR Intents Does Not Support Mantle as of October 2026
claim: While NEAR Intents routes swaps across 12+ chains, Mantle is absent from supported networks.
evidence: [observed] 1Click API supported chains registry [1].
implication: Mantle ecosystem tokens cannot access NEAR Intents liquidity without explicit partnership integration.
```

## K Glossary {depth=2}
```glossary
receipt | Execution Receipt | Asynchronous message passed between accounts and shards on NEAR to execute child transactions.
token_diff | Token Difference Vector | Balanced net transfer vector signed by users and solvers to settle intents atomically.
Chain Signatures | Chain Signatures | MPC threshold signing protocol allowing NEAR accounts to control addresses on external chains.
Nightshade | Nightshade Sharding | NEAR's consensus and state sharding engine distributing computation across dynamic shards.
1Click API | 1Click RFQ API | Off-chain API routing user intent quotes to decentralized solver networks.
```

## L References {depth=2}
1. [nearcore Repository](https://github.com/near/nearcore) — Consensus and execution engine at commit `090da31`. **PRIMARY**
2. [near/intents Repository](https://github.com/near/intents) — Settlement contract at commit `4127e8e`. **PRIMARY**
3. [near/mpc Repository](https://github.com/near/mpc) — Multi-party computation network at commit `e968367`. **PRIMARY**
4. [NEAR Intents Explorer](https://near-intents.org) — Volume and transaction telemetry. **PRIMARY**
5. [DefiLlama NEAR Overview](https://defillama.com/chain/Near) — Ecosystem TVL and volume aggregates.

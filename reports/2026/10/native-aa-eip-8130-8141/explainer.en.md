---
template: research
title: Native Account Abstraction: Deconstructing EIP-8130, EIP-8141, and EIP-8250
subtitle: EIP-8130 encodes accounts and permissions directly into protocol state, while EIP-8141 encodes execution pipelining into transactions. For Mantle, benchmark an 8130 PoC against an 8141 + 8250 control group.
cols: 4
type: Technical Research · Specification Comparison
audience: Backend and smart contract developers familiar with EVM transactions who have not worked with account abstraction
scope: EIP-8130, EIP-8141, and EIP-8250 specifications (all drafts); applicability to Mantle Meme Launchpads and Perps
evidence: 5 reference documents in 8-native-aa/references, primary EIP texts, ACDE meeting transcripts (accessed 2026-10-04)
date: 2026-10-04 · v1
---
Bottom line: Both proposals eliminate [[Bundler]]s and [[EntryPoint]] contracts, supporting native gas sponsorship, transaction batching, and scoped AI agents. The core difference lies in which layer enforces restrictions: 8130 registers [[Actor]]s at the protocol layer and mandates a [[Policy Manager]] gatekeeper ([F1](#F1)); 8141 delegates custom policy inspection to account contract bytecode executed inside [[VERIFY]] frames ([F3](#F3)). Ethereum L1 designated 8141 as an SFI item for the Hegota upgrade, while 8130 operates on Base devnets ([F5](#F5)). Mantle should freeze its security models before benchmarking both paths side-by-side ([F6](#F6)).

## A Core Abstraction Decomposition {sheet span=2 meta="Abstractions"}
| Model | Decomposed Objects | Enforcement Layer for Scoped Agents |
|---|---|---|
| Standard EOA | None: Identity = Key = Payer | no Impossible to express |
| EIP-8130 | `Account`, `Actor`, `Authenticator`, `Keystore`, `Payer` | ok Protocol entry gate + Manager |
| EIP-8141 | `VERIFY` / `SENDER` / `DEFAULT` frames, `APPROVE` opcode | warn Inspected by account code |
| EIP-8250 | `nonce_keys` + `nonce_seq` | Adds multi-channel nonces to 8141 |

## B Transaction Envelope Formats {sheet span=2 meta="Envelope Fields"}
```annot
# EIP-8130 · Type 0x79 | Account and Permission Fields
[sender]{Asset account A} + [nonce_key, nonce_sequence]{2D nonce} + [account_changes]{Authorizations}
[calls]{Multi-phase calls} + [payer]{Gas sponsor} + [sender_auth]{Action sig} + [payer_auth]{Pay sig}
# EIP-8141 · Type 0x06 | Pipelined Execution Fields
[sender]{Asset account A} + [nonce]{!Base scalar nonce} + [frames]{1–64 frames} + [signatures]{Pre-validation}
> 8130 encodes permissions in header fields; 8141 delegates permissions to code executing within frames
```

## C Protocol-Level Capabilities {sheet span=2 meta="Native Protocol Support"}
| Feature | 8130 | 8141 Base | 8141 + 8250 |
|---|---|---|---|
| Remove Bundlers / Native Sponsorship | ok | ok | ok |
| Atomic Batching | ok Phase calls | ok Atomic groups | ok Atomic groups |
| Scoped Agent Role Table | ok Actor primitives | no Custom account code | no Custom account code |
| Protocol Entrypoint Gating | ok Policy Manager | no Bytecode introspection | no Bytecode introspection |
| Multi-Channel Nonces | ok 2D Nonce | no | ok Keyed nonces |
| Nonce-Free Execution | ok Window-based | no | warn State bloat per key |
| Arbitrary Verification Logic | warn Whitelist auth | ok Full bytecode | ok Full bytecode |

## D Specification Constants {sheet span=2 meta="Draft Constants"}
| Parameter | Value | Source |
|---|---|---|
| Baseline ERC-4337 UserOp Gas | ~42,000 (Standard EOA 21,000) | RIP-7560 motivation |
| 8130 `AA_BASE_COST` / Nonce-free fee | 15,000 / 13,000 | 8130 Intrinsic Gas |
| 8141 Fixed Overhead / k1 Verification | 12,000 + 475 × Frames / 2,800 | 8141 Gas Accounting |
| 8141 New Account State Gas | 120 × 1,530 = 183,600 | 8141 / EIP-8037 |
| 8141 Public Mempool Validation Cap | Execution: 100k; State: 500k | 8141 Mempool rules |

## E Evolution Timeline {sheet span=2 meta="Governance Status"}
```timeline
2025-10 | EIP-8130 Created | Authored by Coinbase / Base
2026-01 | EIP-8141 Created | Proposed as Hegota headliner
2026-04 | EIP-8250 Created | Keyed nonces introduced
2026-07 | Native AA CFI | Frame specification assigned
*2026-08 | 8141 SFI | Confirmed at ACDE #244
2026-09 | Base Cobalt Mainnet | Deployed without 8130
```

## F Conclusions {sheet span=2}
```callout ok Both routes support scoped agents; the difference is where boundaries live
8130 enforces entrypoint boundaries in protocol rules; 8141 pre-validates cryptographic signatures in protocol rules while delegating custom authorization inspection to smart contract bytecode. Mantle should benchmark 8130 alongside 8141 + 8250 (F6).
```

## G How to Read {depth=1}
```callout info Assumed Knowledge (not re-explained here)
- EVM transactions: nonce, gasLimit, maxFeePerGas, and cryptographic signatures
- Account abstraction basics: smart contract wallets, gas sponsorship, session keys
```
- **5 minutes**: Read Overview (A–F) and Lead.
- **30 minutes**: Follow [EIP-8130 Mechanics](#panel-H), [EIP-8141 Frames](#panel-I), and [Mantle Comparison](#panel-J).

## H EIP-8130 Protocol-Enforced Permissions {depth=2}
```finding F1 high
# EIP-8130 Mandates Account and Permission Rules at the Protocol Protocol Layer
claim: 8130 introduces native type 0x79 transactions containing explicit `Actor`, `Authenticator`, and `PolicyManager` fields. The protocol verifies actor scopes before executing transaction calls.
evidence: [observed] EIP-8130 specification draft [1].
implication: Sub-keys for agents operate within cryptographically guaranteed protocol constraints.
```

```finding F2 high
# EIP-8130 Provides Native Window-Based Nonce-Free Transactions
claim: 8130 supports nonce-free execution protected by a validity window, a unique `replay_id`, and a bounded consensus-state ring buffer, avoiding permanent state storage overhead for transient keys.
evidence: [observed] Nonce-free validation logic in EIP-8130 [1].
implication: High-frequency agents can submit transactions in parallel without sequence contention.
```

## I EIP-8141 Frame Pipelining {depth=2}
```finding F3 high
# EIP-8141 Enforces Execution Pipelining Through Explicit Frame Types
claim: 8141 introduces type 0x06 transactions partitioned into `VERIFY`, `SENDER`, and `DEFAULT` frames. Protocol rules pre-validate SECP256K1/P256 signatures, while `VERIFY` frames inspect subsequent frames before calling the `APPROVE` opcode to authorize payment, execution, or both.
evidence: [observed] EIP-8141 frame dispatch specifications [2].
implication: All agent policies must be implemented as EVM bytecode inside account validation contracts.
```

```finding F4 high
# EIP-8141 Base Lacks Multi-Channel Nonces and Requires EIP-8250
claim: Native 8141 uses a single scalar nonce. Supporting concurrent multi-channel transaction lanes requires pairing it with EIP-8250 keyed nonces.
evidence: [observed] EIP-8141 and EIP-8250 structural dependencies [2][3].
implication: Deploying parallel lanes under 8141 requires simultaneous implementation of 8250 on the sequencer.
```

## J Protocol Gas Accounting {depth=2}
Under EIP-8141, intrinsic gas accounting follows:

$$
\text{Intrinsic} = 12{,}000 + 475 \times N_{\text{frames}} + \text{Cost}_{\text{data}} + \text{Cost}_{\text{sig}} + \text{Cost}_{\text{verify}} + \text{Cost}_{\text{value}}
$$

and maximum upfront gas reservation is:

$$
\text{max\_gas} = \max\left(\text{intrinsic} + \sum \text{execution} + \sum \text{state}, \; \text{calldata\_floor} + \sum \text{state}\right)
$$

```finding F5 high
# EIP-8141 Has Achieved Formal Ethereum SFI Consensus While EIP-8130 Remains on Base Devnet
claim: All Core Devs designated EIP-8141 as an SFI item for the Hegota hard fork at ACDE #244. EIP-8130 was omitted from Base Cobalt mainnet and runs only on devnets.
evidence: [observed] ACDE #244 minutes [4] and Base Cobalt release notes [5].
implication: Following Ethereum L1 standards favors 8141, while following Base favors 8130.
```

## K Recommendations for Mantle {depth=2}
```finding F6 high
# Mantle Should Deploy an 8130 PoC While Testing 8141 + 8250 in Parallel
claim: Mantle's prioritized use cases (Meme Launchpad and Perps) benefit from 8130's rigid entrypoint gating and windowed nonces. Mantle should build an 8130 testbed while tracking upstream 8141 developments.
evidence: [inferred] Architectural synthesis of Mantle derivative and agent requirements.
implication: Freezing security invariants at the protocol boundary prevents agent sandbox escapes.
```

## L Glossary {depth=2}
```glossary
Bundler | Bundler Relayer | Off-chain node in ERC-4337 aggregating UserOperations into on-chain transactions.
EntryPoint | EntryPoint Contract | Singleton contract in ERC-4337 managing verification and execution callbacks.
Actor | Scoped Agent Role | In EIP-8130, an authorized secondary key bounded by explicit policy managers.
Policy Manager | Policy Manager Gatekeeper | Contract enforcing target, spend, and function whitelists in EIP-8130.
VERIFY | Verification Frame | Frame type in EIP-8141 executing account authentication and inspecting call payloads.
APPROVE | APPROVE Opcode | Opcode in EIP-8141 authorizing gas payment, execution permissions, or both after frame inspection.
2D nonce | 2D Nonce | Multi-channel nonce model preventing parallel transaction lanes from blocking one another.
```

## M References {depth=2}
1. [EIP-8130 Specification](https://eips.ethereum.org/EIPS/eip-8130) — Account abstraction with protocol actor model. **PRIMARY**
2. [EIP-8141 Specification](https://eips.ethereum.org/EIPS/eip-8141) — Frame-based account abstraction. **PRIMARY**
3. [EIP-8250 Specification](https://eips.ethereum.org/EIPS/eip-8250) — Keyed nonces for EVM execution. **PRIMARY**
4. [Ethereum All Core Devs (ACDE #244)](https://github.com/ethereum/pm/issues/2197) — Hegota SFI confirmation. **PRIMARY**
5. [Base Cobalt Hard Fork Notes](https://docs.base.org) — Base mainnet feature list. **PRIMARY**

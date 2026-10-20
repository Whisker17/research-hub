---
template: research
lang: en
title: "Post-Quantum Engineering on Mantle: Precompile Selection, Dual-Fork Compatibility, and Account Disaster Recovery"
subtitle: Mantle does not need to wait for Native AA to be finalized before establishing contract-level PQ smart accounts, a standardized signature verification precompile, and pre-configured emergency recovery. EIP-7702 cannot strip an EOA's ECDSA root authority and serves only as a migration helper; true account-level disaster recovery requires smart contract accounts with dual-client equivalence across op-geth and OP Succinct.
cols: 4
type: Engineering Implementation · Technical Research
audience: Mantle protocol architects, client developers, and security leads familiar with EVM, OP Stack, and rollup mechanics
scope: Layer 1 / L2 PQ practical comparison (Algorand/Starknet/Solana/QRL); digital signature candidate evaluation (ML-DSA vs Falcon vs SLH-DSA); open-source library evaluation (mldsa-native/CIRCL/RustCrypto); Mantle precompile design (dedicated DSA vs universal NTT); full-stack prover consistency (op-geth + Kona / SP1 zkVM); dual-fork cadence and upstream rebase isolation; EIP-7702 protocol bypass mechanics; institutional PQ smart account models and lifecycles
evidence: 50-claim ledger (observed 34 / inferred 12 / speculative 4); NIST FIPS 203/204/205/206 standards; EIP-7702/3607/8355/8051/7562 specifications; Algorand v5.0.0 mainnet specs; Succinct OP Succinct documentation; Linux Foundation PQCA and RustCrypto CVE-2026-24850
date: 2026-10-17 · v1
---
Bottom line: This is Part 2 (Engineering & Implementation) of the Mantle Post-Quantum series, following directly from Part 1 ("Post-Quantum from First Principles to Roadmap", `post-quantum-mantle`). While Part 1 established the destructive impact of Shor's algorithm on elliptic-curve cryptography and Ethereum's 2029 timeline, this report specifies how Mantle can proactively deploy a production-grade, EVM-compatible disaster recovery mechanism in the near term ([F1](#F1), [F19](#F19)).

The three core takeaways are:
1. **Debunking the 7702 Disaster Recovery Myth**: EIP-7702 delegation **cannot** serve as a post-quantum security boundary. 7702 does not strip an EOA's ECDSA signing authority. Once an attacker extracts the ECDSA private key, they can submit direct top-level transactions to token contracts (completely bypassing delegated contract code), or submit a new authorization tuple to overwrite or revoke the delegation ([F16](#F16), [F17](#F17)). True disaster recovery requires migrating assets ahead of time into **genuine smart contract accounts** protected by EIP-3607 ([F18](#F18)).
2. **A Stateless Standard Verification Precompile**: Instead of waiting for Native AA or universal NTT primitives, Mantle should introduce a dedicated ML-DSA-65 signature verification precompile synchronized across both the sequencer (`op-geth`) and the state transition prover (`Kona` in SP1 zkVM) ([F5](#F5), [F9](#F9), [F12](#F12)). ML-DSA-65 is the preferred baseline due to its frozen FIPS 204 standard and native enterprise HSM support (such as AWS KMS), with Falcon-512 retained as a compact benchmark ([F5](#F5), [F6](#F6)).
3. **Isolating Upstream Rebase Conflicts**: Under Mantle's annual "dual hard fork" rhythm, the custom precompile must be placed in a dedicated vendor extension address range (`>0x0100`) and accessed via versioned adapter contracts. Mantle must avoid claiming unfinalized low-order draft addresses (e.g., `0x12/0x13` in EIP-8355/8051) to eliminate collisions during upstream Ethereum rebases ([F14](#F14), [F15](#F15)).

## A Multi-Chain PQ Evolution Models {sheet meta="evolution roadmap"}
```tree list
Algorand Roadmap | Three-stage progressive rollout
  Phase 1: State Proofs | Falcon-1024 protects cross-chain proofs
  Phase 2: LogicSig Verification | AVM introduces FALCON_VERIFY opcode
  Phase 3: Native Accounts | v5.0.0 (2026-08) native Falcon-1024 accounts live
Starknet Roadmap | Native AA-driven agility
  Proving Layer STARK | Hash-based, naturally quantum-resistant
  Account Layer Cairo | Programmable contracts, Falcon-512 verified on mainnet
Mantle Recommended Path | EVM compatibility and prover equivalence
  Cryptographic Primitive | Dedicated ML-DSA-65 precompile (op-geth + Kona)
  Account Layer | ERC-4337 smart vault with dual-approval state machine
  Upstream Alignment | Versioned adapters ensure smooth transition to L1 standards
```

## B Key Engineering Metrics {sheet span=2 meta="baseline parameters"}
| Metric / Parameter | Value / Specification | Engineering Implications & Boundaries |
|---|---|---|
| **ML-DSA-65 PK / Signature** | 1,952 B / 3,309 B | NIST FIPS 204 Cat 3; ~5.3 KB total per verification |
| **Falcon-512 PK / Signature** | 897 B / ~666 B | Very compact (~1.5 KB total), but FIPS 206 is still draft |
| **ECDSA Classical Signature** | 65 bytes | Classical baseline, ~51× smaller than ML-DSA-65 |
| **Pure EVM Verification Gas** | ~1,230,000 gas | Fireblocks ML-DSA-44 EVM verifier benchmark |
| **ERC-7562 Verification Gas Cap** | 500,000 gas | Pure contract verification cannot pass public bundler mempools |
| **ERC-7562 UserOp Size Limit** | 8,192 bytes | ML-DSA-65 multisig exceeds limit; PK must be pre-cached |
| **Algorand v5.0 Mainnet Activation** | August 2026 | Proves native PQ accounts work, but consensus still Ed25519 |
| **Mantle L1 Settlement Dependency** | BN254 PLONK / Groth16 | SP1 proof outer wrapper; requires joint migration with L1 |

## C Candidate Signature Schemes and Active Libraries {sheet span=2 meta="FIPS 204/206 comparison"}
| Scheme / Library | Standard & Language | Core Advantages | Engineering Constraints & Risks |
|---|---|---|---|
| **ML-DSA-65** | FIPS 204 (Module Lattice) | Standard finalized; native AWS KMS / HSM support | Larger signatures (3.3 KB); moderate DA/mempool pressure |
| **Falcon-512** | Draft FIPS 206 (NTRU) | Extremely compact (~666 B); very fast verification | Draft standard; complex Gaussian sampling; lacks HSM support |
| **SLH-DSA-128s** | FIPS 205 (Stateless Hash) | Conservative security assumptions; pure hash | Very large signature (7.8 KB); slow; unsuitable for high-frequency on-chain |
| **PQ Code Package** | C90 (PQCA) | Formally verified via CBMC; architecture assembly | Ideal standard reference for CGO backend and differential tests |
| **Cloudflare CIRCL** | Go | Actively maintained; pure Go + AVX2/NEON; integrates with op-geth | Requires pinned tags and strict conformance test vectors |
| **RustCrypto ml-dsa** | Rust | Pure Rust; no unsafe; compiles to Kona / SP1 zkVM | **CVE-2026-24850**: Requires version ≥ 0.1.0-rc.4 to avoid duplicate hints |
| **PQClean** | C | Historical benchmark repository | **Archived August 2026**; no longer an active upstream |

## D 7702 Delegation vs Smart Contract Accounts {sheet span=2 meta="disaster recovery comparison"}
| Dimension | EIP-7702 Delegated EOA | Genuine Smart Contract Account |
|---|---|---|
| **EVM Low-Level Type** | Standard EOA with `0xef0100` delegation indicator | Pure contract address (`EXTCODESIZE > 0`) |
| **EIP-3607 Enforcement** | **Explicitly exempted**: ECDSA can still be tx sender | **Strictly enforced**: Protocol rejects contract as top-level tx sender (`from`) |
| **Transfer Bypass Attack** | Attacker calls token contract directly, **bypassing code** | **Impossible to bypass**: All transfers must execute through internal logic |
| **Revocation Attack** | Attacker signs new authorization tuple to overwrite delegation | **No protocol-level revocation**: Upgrades governed strictly by code |
| **PQ Disaster Recovery** | **Ineffective (false security)**; onboarding helper only | **Effective (robust boundary)**; establishes non-bypassable PQ defense |

## E Architecture Overview: Mantle PQ Minimal Implementation {sheet span=2 meta="system architecture"}
```tree list
Client & Key Management | Enterprise HSM / KMS
  ML-DSA-65 Signatures | AWS KMS hardware generates signatures directly
  UserOp Formatting | Carries signature only; public key pre-cached in contract
Contract & Account Layer | Decoupled programmable defense
  PQ Smart Account | ERC-4337 compatible; multi-approval & emergency state machine
  Versioned Adapter | PQVerifierAdapterV1 shields account from precompile address shifts
Execution Client (op-geth) | High-performance dedicated precompile
  Registration Space | Dedicated vendor space above 0x0100
  Verification Engine | Integrates Cloudflare CIRCL (Go) optimized backend
State Transition Prover (OP Succinct) | Dual-client equivalence & proof generation
  Kona STF | Integrates RustCrypto ml-dsa (Rust) for equivalent execution
  SP1 zkVM | Proved in RISC-V; pure software emulation in phase 1
```

## F Bottom Line and Actionable Recommendations {sheet span=4}
```callout ok Debunk 7702 myths: Deploy a stateless precompile and genuine smart accounts for Mantle PQ defense
- Debunking 7702: EIP-7702 does not strip ECDSA root authority and cannot serve as a recovery end-state. Genuine post-quantum disaster recovery requires moving funds into non-bypassable smart contract accounts (F16, F17, F18).
- Algorithm Selection: Choose frozen FIPS 204 ML-DSA-65 with enterprise HSM support; keep Falcon-512 as a compact secondary benchmark (F4, F5, F6).
- Precompile Specification: Standardize on an end-to-end stateless signature verification precompile to isolate audit boundaries; avoid unfinalized low-order draft addresses (F9, F11, F14).
- Full-Stack Prover Equivalence: Mantle uses OP Succinct; the new precompile must exhibit identical semantics and gas across op-geth (Go) and Kona (Rust in SP1 zkVM) (F12, F13).
- Permission State Machine: Implement a dual-approval model ("Classical AND PQ" in normal mode, switching to PQ-only under emergency); pre-register PQ keys to prevent attacker registration front-running (F19, F20).
- System Boundaries: Account-level PQ protection does not resolve quantum risks in L1 consensus, KZG DA, or Groth16/PLONK state verifiers; these require separate governance (F21, F22).
```

## G How to Read This Report {depth=1}
```callout info Series map: Mantle post-quantum series, three parts
- Part 1, [Post-Quantum from First Principles to Roadmap](/p/post-quantum-mantle/en/): which components quantum computers break, what each project does, and what Mantle must migrate itself.
- Part 2, [Post-Quantum Engineering on Mantle](/p/pq-in-mantle/en/): contract-level PQ accounts + a verification precompile, and why EIP-7702 is not disaster recovery.
- Part 3, [Choosing Post-Quantum Signatures](/p/pq-signature-selection/en/): hash vs lattice, EIP-8288, and revisions to parts 1 and 2 (part 3, panel R).
```

```callout warn Revisions of 2026-10-20 (see part 3, panel R)
- EIP-8355 does not take a 32 B digest; it takes a variable-length message at the end and verifies the raw message per FIPS 204. EIP-8081 now lists 8355 as Declined (ledger 51).
- `0x0100–0x01ff` is the shared range that EIP-7587 reserves for the RIP process, not a private Mantle space; check the RIP registry or use the RIP process first (ledger 52).
- The native AA timeline changed: Hegotá includes EIP-8141, and ethereum.org expects it on mainnet in 2027 Q2; ledger row #47 no longer holds (ledger 53).
- Treat the precompile as a near-term disaster-recovery tool; the adapter should abstract a "verification backend" and let one account register keys of several algorithms (ledger 54).
```

```callout info Assumed Background Knowledge
- Part 1 of this series ("Post-Quantum from First Principles to Roadmap", `post-quantum-mantle`)
- EVM execution semantics, precompiled contract invocations via `STATICCALL`
- ERC-4337 account abstraction and EIP-7702 delegation mechanics
- OP Stack and OP Succinct (Kona / SP1 zkVM) rollup architecture
```
- **5-minute read (decision-makers)**: Read the bottom line and overview panels A–F, focusing on Panel D's analysis of 7702 vulnerabilities and Panel F's core recommendations.
- **30-minute read (architects & core developers)**: Read [Multi-Chain Practice](#panel-H), [Algorithm Evaluation](#panel-I), [Precompile Design](#panel-K), [Prover Equivalence](#panel-L), [Dual-Fork Isolation](#panel-M), [7702 Protocol Bypass Analysis](#panel-N), and [Institutional Account Models](#panel-O).
- **Code review & security auditors**: Examine [Engineering Roadmap](#panel-P), [Residual Risk Inventory](#panel-Q), and [Claim Ledger Verification](#panel-R).

---

## H Multi-Chain PQ Implementations and Layered Evolution {depth=2}
"Post-quantum support" encompasses four distinct layers: account authorization, state proving, consensus identity, and confidential communications. Protecting account authorization does not imply the entire chain is quantum-secure (claims #1, #3, #5).

The figure below compares Algorand's multi-year post-quantum progression with Mantle's recommended engineering path:

```excalidraw q="What can Mantle learn from Algorand's three-stage post-quantum rollout?" read="The left column outlines Algorand's three-phase progression; the right column maps Mantle's recommended EVM engineering trajectory. Green boxes indicate validated or recommended milestones; yellow boxes denote future alignment points." takeaway="Algorand proved that delivering programmable verification primitives before touching native consensus account models is a battle-tested rollout strategy." kind=evolution path
{"grid": {"w": 340, "h": 90}, "defaults": {"w": 280, "h": 60, "fontSize": 15},
 "nodes": [
   {"id": "a1", "label": "Algorand Phase 1: State Proofs\n(Falcon-1024 protects cross-chain proofs)", "col": 0, "row": 0, "color": "blue"},
   {"id": "a2", "label": "Algorand Phase 2: LogicSig\n(AVM introduces FALCON_VERIFY)", "col": 0, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "a3", "label": "Algorand Phase 3: Native Accounts\n(v5.0.0 Falcon-1024 accounts live)", "col": 0, "row": 2, "color": "blue"},
   {"id": "m1", "label": "Mantle Starting Point: Precompile\n(op-geth + Kona implement ML-DSA-65)", "col": 1, "row": 0, "color": "green", "strokeWidth": 3},
   {"id": "m2", "label": "Mantle Recovery: Smart Accounts\n(ERC-4337 with emergency state machine)", "col": 1, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "m3", "label": "Mantle Long-term: Native AA\n(Smooth migration once L1 standards freeze)", "col": 1, "row": 2, "color": "yellow"}
 ],
 "edges": [
   {"from": "a1", "to": "a2"}, {"from": "a2", "to": "a3"},
   {"from": "m1", "to": "m2"}, {"from": "m2", "to": "m3"},
   {"from": "a2", "to": "m1", "stroke": "dashed"}
 ]}
```

```finding F1 high
# Algorand's lesson: Programmable verification precedes native accounts
claim: Algorand followed a clear three-stage evolution: "State Proofs boundary (Falcon-1024) -> LogicSig contract verification (AVM FALCON_VERIFY) -> v5.0.0 native accounts (Falcon-1024)". Its mainnet consensus messages still rely on Ed25519, and VRF still relies on elliptic curves.
evidence: [observed] Algorand Technical Brief: Quantum-Resistant Transactions on Algorand with Falcon Signatures; Algorand v5.0.0 Release Notes (claims #1, #2, #3).
implication: Providing a verification precompile and smart contract accounts before overhauling the consensus transaction format is a validated engineering strategy; "native PQ accounts" must not be conflated with a "fully quantum-resistant chain".
```

Starknet leverages native account abstraction, meaning all accounts are smart contracts by default. The community has deployed experimental Falcon-512 accounts on mainnet with verification logic written entirely in Cairo, while its STARK proof system is hash-based and inherently quantum-secure (claims #4, #5). This demonstrates how decoupled account architectures grant immense cryptographic agility.

```finding F2 high
# Starknet's native AA unlocks unmatched cryptographic agility
claim: Starknet's native account abstraction allows users to implement and test Falcon-512 verification directly in Cairo contracts without consensus hard forks. Its STARK proving system is hash-based, though L1 settlement remains tied to Ethereum consensus.
evidence: [observed] Starknet Blog: Quantum Resistance on Starknet; OpenZeppelin cairo-pq-verifiers repository (claims #4, #5).
implication: Decoupling signature verification from the base protocol enables seamless cryptographic upgrades. Mantle can achieve comparable agility via ERC-4337 without protocol lock-in.
```

In contrast, experiments in the Solana ecosystem (such as Winterwallet) adopted Winternitz One-Time Signatures (WOTS) (claim #6). WOTS and XMSS/LMS are **stateful hash-based signatures**, carrying a catastrophic engineering pitfall: private key indices must never be reused. If a key index is signed twice due to asynchronous network retries, multi-device sync, or chain reorganizations, the full private key is instantly compromised (claim #7).

```finding F3 high
# Stateful hash-based signatures present catastrophic key reuse vulnerabilities
claim: Stateful hash signatures like WOTS and XMSS leak private keys immediately if a key index is reused across retries, rollbacks, or multiple devices. Solana Winterwallet documentation explicitly warns against key reuse risks.
evidence: [observed] NIST SP 800-208; Solana Winterwallet Security Documentation (claims #6, #7).
implication: Mantle must strictly ban stateful hash-based signatures as default account primitives and enforce stateless algorithms (ML-DSA or Falcon).
```

---

## I Evaluation of Candidate Post-Quantum Signature Schemes {depth=2}
In post-quantum cryptography, one must distinguish between Key Encapsulation Mechanisms (KEM) and Digital Signature Algorithms (DSA). NIST FIPS 203 **ML-KEM** (Kyber) is designed solely to establish shared session keys against Harvest Now, Decrypt Later (HNDL) attacks and **cannot be used for transaction signatures** (claim #8).

```excalidraw q="How do core digital signature candidates differ in key size, signature size, and verification properties?" read="Horizontal comparison of four candidates. Blue boxes show byte footprint; green boxes show primary advantages; red/yellow boxes highlight engineering pain points." takeaway="ML-DSA-65 provides the optimal balance of frozen standardization and HSM ecosystem support; Falcon-512 offers minimal bytes; SLH-DSA is too large for on-chain use." kind=algorithm comparison
{"grid": {"w": 290, "h": 90}, "defaults": {"w": 240, "h": 60, "fontSize": 15},
 "nodes": [
   {"id": "m65", "label": "ML-DSA-65 (FIPS 204)\nPK: 1,952 B | Sig: 3,309 B", "col": 0, "row": 0, "color": "green", "strokeWidth": 3},
   {"id": "m65_adv", "label": "Standard fully frozen\nNative AWS KMS / HSM support", "col": 0, "row": 1, "color": "green"},
   {"id": "m44", "label": "ML-DSA-44 (FIPS 204)\nPK: 1,312 B | Sig: 2,420 B", "col": 1, "row": 0, "color": "blue"},
   {"id": "m44_adv", "label": "Cat 2 parameter set\nIdeal for lightweight tests", "col": 1, "row": 1, "color": "blue"},
   {"id": "fal", "label": "Falcon-512 (FIPS 206)\nPK: 897 B | Sig: ~666 B", "col": 2, "row": 0, "color": "blue"},
   {"id": "fal_dis", "label": "Very compact & fast\nDraft FIPS 206; lacks HSMs", "col": 2, "row": 1, "color": "yellow"},
   {"id": "slh", "label": "SLH-DSA-128s (FIPS 205)\nPK: 32 B | Sig: 7,856 B", "col": 3, "row": 0, "color": "red"},
   {"id": "slh_dis", "label": "Signature >7.8 KB exceeds budgets\nUnusable for frequent calls", "col": 3, "row": 1, "color": "red"}
 ],
 "edges": [
   {"from": "m65", "to": "m65_adv"}, {"from": "m44", "to": "m44_adv"},
   {"from": "fal", "to": "fal_dis"}, {"from": "slh", "to": "slh_dis"}
 ]}
```

```finding F4 high
# Digital signatures are the only valid account candidates; FIPS 204 is the core baseline
claim: NIST FIPS 203 is ML-KEM for key encapsulation and cannot be used for transaction signatures; FIPS 204 (ML-DSA) and FIPS 205 (SLH-DSA) are digital signature standards; Falcon's FIPS 206 remains in draft.
evidence: [observed] NIST FIPS 203, FIPS 204, FIPS 205 official releases; NIST CSRC PQC standardization process documentation (claims #8, #9, #10, #11).
implication: All architectural focus must center on digital signature verification, dismissing KEM proposals for account security.
```

For Mantle, the optimal near-term baseline is **ML-DSA-65**:
- **Standard Fully Frozen**: NIST FIPS 204 was officially released in August 2024, finalizing all parameters, encodings, and context rules without backward compatibility risks (claim #9).
- **Enterprise HSM Support**: AWS KMS natively supports ML-DSA-44/65/87 signature generation inside HSMs (claim #16). Institutional custody requires hardware-bound keys as a compliance prerequisite.
- **Pure Integer Arithmetic**: Based on Module-LWE, operations utilize modular integer arithmetic ($q = 8380417$) with no floating-point vulnerabilities, ensuring clean portability across Go, Rust, and zkVM targets.

```finding F5 high
# ML-DSA-65 should be Mantle's primary institutional baseline
claim: ML-DSA-65 (FIPS 204, NIST Category 3) is fully standardized with native AWS KMS hardware support, providing security equivalent to AES-192 as an ideal baseline for institutional reserves.
evidence: [observed] NIST FIPS 204; AWS KMS Developer Guide for PQC; [inferred] institutional custody compliance requirements prioritize standard stability over raw byte savings (claims #12, #16, #39, #48).
implication: Standardizing Mantle's initial precompile on ML-DSA-65 enables institutional participants to leverage existing cloud KMS key management infrastructure immediately.
```

Falcon-512's appeal lies in its small signature size (~666 bytes, public key 897 bytes, claim #13). However, two constraints require caution:
1. **FIPS 206 Is Still Pending**: Author Thomas Pornin explicitly warns that encodings are not guaranteed to remain backward compatible prior to final standardization (claim #11);
2. **Complex Gaussian Sampling**: Key generation and signing require Fast Fourier Sampling, making side-channel hardening difficult and delaying HSM adoption by an estimated 2–3 years (claim #48).
Crucially, Falcon's **verification logic** is fully deterministic, requires no floating-point arithmetic, and creates no consensus divergence (claim #15). It should be maintained as a secondary benchmark.

```finding F6 high
# Falcon-512 offers compact signatures but lacks frozen standards and HSMs
claim: Falcon-512 signatures are remarkably compact (~666 bytes) and verification is deterministic without floating-point math; however, FIPS 206 remains draft, signing sampling is complex, and HSM support is absent.
evidence: [observed] Falcon specification; algorand/falcon codebase; Thomas Pornin implementation notes (claims #13, #15, #48).
implication: Mantle should not make Falcon its exclusive bet today, but should maintain it as an active benchmark for a future second precompile.
```

---

## J Open-Source Cryptographic Libraries and Consensus Divergence Risks {depth=2}
Selecting a cryptographic library is a consensus-critical decision. The historical benchmark **PQClean was officially archived in August 2026**, with its maintainers recommending migration to the Linux Foundation's **PQ Code Package** (claim #20).

Production-grade libraries for Mantle include:
- **`mldsa-native` (PQCA / Linux Foundation)**: Written in C90 with CBMC formal verification, architecture-specific assembly (AArch64/x86-64), memory safety proofs, and constant-time execution guarantees. Serves as the gold standard for differential testing (claim #17).
- **Cloudflare CIRCL (`sign/mldsa`)**: High-performance Go implementation with AVX2/NEON assembly optimizations. Plugs directly into `op-geth` (claim #18).
- **RustCrypto `signatures/ml-dsa`**: Pure Rust with no `unsafe` blocks, fully compatible with Kona and compilation to SP1 RISC-V zkVM targets (claim #19).

```finding F7 high
# PQCA mldsa-native and Cloudflare CIRCL are leading engineering references
claim: PQClean was archived in August 2026; Linux Foundation PQCA's `mldsa-native` provides a formally verified C implementation; Cloudflare CIRCL provides a production Go implementation for op-geth.
evidence: [observed] PQClean GitHub archive notice; PQCA announcements; Cloudflare CIRCL repository (claims #17, #18, #20).
implication: Mantle can integrate CIRCL directly into `op-geth` while using `mldsa-native` as an automated cross-validation oracle.
```

Integrating external cryptographic libraries carries severe **consensus divergence risks**. In 2026, RustCrypto `ml-dsa` suffered **CVE-2026-24850 (GHSA-5x2r-hc65-25f9)**: a regression in version 0.0.4 changed a strict less-than check (`<`) for hint indices to less-than-or-equal (`<=`), allowing malformed signatures with duplicate hint indices to pass verification until fixed in `0.1.0-rc.4` (claim #19). While treated as minor signature malleability in standard web applications, in a blockchain setting, if a Go sequencer rejects a transaction while a Rust prover or validator accepts it, the result is an immediate **chain split or proof generation failure**!

```finding F8 high
# Subtle cryptographic library bugs trigger catastrophic consensus divergence
claim: RustCrypto `ml-dsa` accepted malformed signatures with duplicate hints due to a `<` vs `<=` check error (CVE-2026-24850); such discrepancies across clients lead directly to consensus splits.
evidence: [observed] GitHub Security Advisory GHSA-5x2r-hc65-25f9; CVE-2026-24850 records (claim #19).
implication: Rigorous differential fuzzing between `op-geth` (Go) and `Kona` (Rust) is mandatory, and Rust dependencies must strictly pin `ml-dsa >= 0.1.0-rc.4`.
```

---

## K Mantle Minimal Implementation: Precompile Design Boundaries {depth=2}
Why should Mantle deploy an **independent, stateless signature verification precompile** rather than universal NTT vector math primitives?

```excalidraw q="Dedicated signature verification precompile vs universal polynomial NTT primitives" read="The left column shows a dedicated verification precompile where cryptographic complexity is contained in low-level client code; the right column shows universal NTT primitives forcing contracts to assemble complex lattice operations." takeaway="A dedicated DSA precompile strictly contains security and audit boundaries, preventing smart contracts from introducing lattice flaws." kind=precompile boundaries
{"grid": {"w": 330, "h": 90}, "defaults": {"w": 280, "h": 60, "fontSize": 15},
 "nodes": [
   {"id": "p1", "label": "Dedicated ML-DSA-65 Precompile\nSTATICCALL 0x01XX(pk, sig, msg)", "col": 0, "row": 0, "color": "green", "strokeWidth": 3},
   {"id": "p1_b", "label": "Client handles all math & checks\n(Norm checks, rejection sampling, KATs)", "col": 0, "row": 1, "color": "green"},
   {"id": "p1_c", "label": "Contract checks return == 1\nTight audit surface, minimal attack vectors", "col": 0, "row": 2, "color": "green"},
   {"id": "p2", "label": "Universal NTT / Vector Primitives\nProvides raw polynomial multiplications", "col": 1, "row": 0, "color": "red"},
   {"id": "p2_b", "label": "Contract executes dozens of calls\nExtreme gas overhead, complex dispatch", "col": 1, "row": 1, "color": "red"},
   {"id": "p2_c", "label": "Contract must assemble lattice logic\nExtremely fragile; subtle bugs bypass checks", "col": 1, "row": 2, "color": "red"}
 ],
 "edges": [
   {"from": "p1", "to": "p1_b"}, {"from": "p1_b", "to": "p1_c"},
   {"from": "p2", "to": "p2_b"}, {"from": "p2_b", "to": "p2_c"}
 ]}
```

```finding F9 high
# Dedicated verification precompiles are the only viable path to isolate audit boundaries
claim: A dedicated DSA precompile encapsulates polynomial arithmetic, rejection sampling, and norm bounds inside verified client code; universal NTT primitives expose dangerous mathematical assembly to high-level smart contracts.
evidence: [inferred] Cryptographic API design principles; EIP-8355 architecture rationale (claim #37).
implication: Mantle should not attempt universal vector math in Phase 1, but must provide an atomic ML-DSA verification interface.
```

Pure EVM bytecode verification is unviable: Fireblocks' experimental EVM verifier consumes **~1,230,000 gas** for a single ML-DSA-44 check (claim #21). Under **ERC-7562** (Account Abstraction Validation Scope Rules), verification gas is capped at **500,000**, and serialized UserOps cannot exceed 8,192 bytes (claim #22). Pure EVM verification **cannot pass public bundler mempools** (claim #42).

```finding F10 high
# Pure EVM verification violates ERC-7562 caps and cannot enter public mempools
claim: Fireblocks ML-DSA-44 EVM verifier consumes ~1.23M gas, far exceeding ERC-7562's 500k verification gas limit; combined with signature size, pure contract verification fails bundler mempool acceptance.
evidence: [observed] Fireblocks evm-ml-dsa-verifier benchmarks; ERC-7562 specification (claims #21, #22, #42).
implication: A native protocol precompile is essential to lower verification gas substantially below the 500k mempool cap, enabling PQ smart accounts to operate through standard ERC-4337 infrastructure.
```

### Precompile Specification and Fail-Closed Principles
Mantle's precompile should adopt the **EIP-8355** draft interface:
- **Input Encoding**: `public_key (1952 B) || signature (3309 B) || message (32 B digest)`
- **Output**: 32 bytes (`0x00...01` on success, `0x00...00` on failure).
- **Fail-Closed Verification Pattern**: In EVM, **calling an address with no deployed code and no active precompile succeeds and returns empty data (`returndatasize == 0`)**! Calling contracts must strictly verify:
  ```solidity
  (bool success, bytes memory data) = PQ_PRECOMPILE.staticcall(payload);
  require(success && data.length == 32 && abi.decode(data, (uint256)) == 1, "PQ verification failed");
  ```
  Omitting length or value checks allows catastrophic silent bypasses if the precompile is inactive (claim #28).

```finding F11 high
# Precompile calls must enforce Fail-Closed checks against empty-address false positives
claim: EIP-8355 defines concatenated inputs and a 32-byte return word; contracts must verify call success, exact 32-byte length, and a return value of 1 to prevent silent passes on unactivated addresses.
evidence: [observed] EIP-8355 draft text; EVM execution semantics on empty addresses (claim #28).
implication: Standardized, audited verification adapter libraries must be provided to ecosystem developers to eliminate vulnerable call patterns.
```

---

## L Full-Stack Equivalence: op-geth to OP Succinct (Kona / SP1) {depth=2}
Mantle utilizes **OP Succinct** for state settlement, requiring dual-client equivalence across both execution and proving stacks (claims #31, #33).

```excalidraw q="How do Mantle's execution client and Succinct SP1 prover maintain precompile equivalence?" read="The left column shows execution in Go (op-geth) for block production; the right column shows proof generation in Rust (Kona inside SP1 zkVM). Both must yield identical returns and gas." takeaway="A custom precompile must be implemented in both op-geth and Kona to prevent state transition proof failures." kind=full-stack prover topology
{"grid": {"w": 320, "h": 90}, "defaults": {"w": 270, "h": 60, "fontSize": 15},
 "nodes": [
   {"id": "seq", "label": "Sequencer / op-geth (Go)\nExecutes transactions & builds blocks", "col": 0, "row": 0, "color": "blue"},
   {"id": "circl", "label": "Cloudflare CIRCL (Go)\nExecutes ML-DSA-65 precompile", "col": 0, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "kona", "label": "Kona STF (Rust)\nRuns inside SP1 RISC-V zkVM", "col": 1, "row": 0, "color": "blue"},
   {"id": "rc_ml", "label": "RustCrypto ml-dsa (Rust)\nExecutes identical verification in zkVM", "col": 1, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "sp1", "label": "Succinct SP1 Prover\nGenerates zk-proof of state transition", "col": 1, "row": 2, "color": "blue"},
   {"id": "l1", "label": "Ethereum L1 Settlement\nMantleRollup verifies SNARK proof", "col": 1, "row": 3, "color": "yellow"}
 ],
 "edges": [
   {"from": "seq", "to": "circl"},
   {"from": "kona", "to": "rc_ml"},
   {"from": "rc_ml", "to": "sp1"},
   {"from": "sp1", "to": "l1"},
   {"from": "circl", "to": "rc_ml", "stroke": "dashed"}
 ]}
```

```finding F12 high
# Mantle precompiles require strict dual-client equivalence across Go and Rust
claim: Mantle deploys OP Succinct, where Kona executes inside SP1 zkVM; op-geth (Go) and Kona (Rust) must exhibit identical gas metering and error handling for precompile execution.
evidence: [observed] blog.succinct.xyz Mantle OP Succinct case study; Kona state transition specifications (claims #31, #33).
implication: Precompile engineering must proceed as a synchronized Go/Rust initiative; omitting Rust implementation breaks rollup state proving immediately.
```

Engineers must distinguish between:
- **EVM Precompiles**: Interfaces callable by smart contracts via `STATICCALL`.
- **SP1 Circuit Precompiles**: Custom constraint circuits built into the zkVM core to accelerate operations like Keccak-f1600 (claim #32).
**Phase 1 Requires No Custom SP1 Circuits**: Kona can verify `ml-dsa` via pure Rust software in RISC-V. While this consumes several million cycles per check, institutional reserve operations occur at very low frequencies (several calls per day), imposing negligible overhead on the prover's multi-hundred-million cycle budget. Based on provisional cost-model projections, custom SP1 circuit acceleration would only become economically necessary if PQ transaction volume grew to exceed approximately 5% of daily block gas, a threshold subject to future empirical benchmarking (claims #45, #49).

```finding F13 high
# EVM precompiles differ from SP1 circuit precompiles; pure software proving suffices in Phase 1
claim: EVM contract precompiles are distinct from SP1 zkVM core circuit precompiles; for low-frequency vault operations, pure Rust emulation in Kona avoids the heavy engineering of custom ZK circuits (custom circuit need remains a provisional hypothesis).
evidence: [observed] Succinct SP1 precompile documentation; [inferred] institutional vault transaction frequency and prover amortized cost analysis; [speculative] 5% block gas threshold (claims #32, #45, #49).
implication: Dramatically reduces Phase 1 engineering risk by avoiding complex ZK-SNARK constraint circuit development.
```

---

## M Dual-Fork Rhythm and Upstream Rebase Isolation {depth=2}
Ethereum L1 undergoes major hard forks roughly annually. Mantle responds with **two hard forks per L1 fork**:
- **Fork 1 (Compatibility Fork)**: Deployed synchronously with L1 to adjust derivation rules and engine APIs, preventing halts;
- **Fork 2 (Feature Adoption Fork)**: Deployed later after extensive testing to activate L1 opcodes and precompiles (claim #34).

```excalidraw q="How does Mantle's dual hard fork cadence isolate custom precompiles from upstream rebase collisions?" read="The top track shows Ethereum L1 upgrades; the middle track shows Mantle's dual forks; the bottom track illustrates namespace isolation and adapter patterns." takeaway="Allocating vendor address space (>0x0100) and wrapping access in versioned adapters prevents upstream rebase overwrites." kind=fork isolation
{"grid": {"w": 330, "h": 90}, "defaults": {"w": 280, "h": 60, "fontSize": 15},
 "nodes": [
   {"id": "l1_fork", "label": "Ethereum L1 Annual Hard Fork\n(e.g., Pectra / Hegota)", "col": 0, "row": 0, "color": "blue"},
   {"id": "m_f1", "label": "Mantle Fork 1: Compatibility\n(Sync derivation, precompiles untouched)", "col": 0, "row": 1, "color": "green"},
   {"id": "m_f2", "label": "Mantle Fork 2: Feature Adoption\n(Adopts upstream opcodes & precompiles)", "col": 0, "row": 2, "color": "green"},
   {"id": "risk", "label": "Collision Risk: Draft Overwrite\n(0x12 draft conflict, merge loss)", "col": 1, "row": 0, "color": "red"},
   {"id": "isol", "label": "Defense 1: Vendor Namespace\n(Allocates >0x0100, following P256)", "col": 1, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "adap", "label": "Defense 2: Versioned Adapter\n(PQVerifierAdapter abstracts addresses)", "col": 1, "row": 2, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "l1_fork", "to": "m_f1"}, {"from": "m_f1", "to": "m_f2"},
   {"from": "l1_fork", "to": "risk"},
   {"from": "risk", "to": "isol"}, {"from": "isol", "to": "adap"}
 ]}
```

Mantle must avoid three rebase failure modes:
1. **Address Collisions**: Competing proposals EIP-8355 and EIP-8051 suggest `0x12` or `0x13` (claim #29). Claiming `0x12` prematurely causes irreconcilable state divergence when Ethereum reallocates that address (claim #35).
2. **Rebase Overwrites**: Upstream geth rebases routinely wipe out modifications in shared precompile lookup tables.
3. **Interface Drift**: Future standard precompiles may alter argument packing or return semantics.

**Mantle's Isolation Strategy**:
- **Namespace Isolation**: Emulate OP Stack's `P256VERIFY` (located at `0x0100`, claim #30) by placing Mantle's ML-DSA-65 precompile in vendor space (e.g., `0x0101`, claim #36).
- **Plug-in Registration Hook**: Register precompiles via an isolated `mantle_precompiles.go` hooked into fork tables, enforced by CI regression suites.
- **Versioned Adapters**: Smart accounts call `PQVerifierAdapterV1`. When Ethereum finalizes a standard precompile, Mantle simply deploys `PQVerifierAdapterV2`, allowing accounts to migrate seamlessly.

```finding F14 high
# Squatting on unfinalized low-order draft addresses invites breaking collisions
claim: EIP-8051 and EIP-8355 present competing draft proposals for 0x12 and 0x13; claiming draft addresses risks collisions and state divergence upon upstream Ethereum hard forks.
evidence: [observed] EIP-8051 and EIP-8355 draft proposals; [inferred] historical cross-chain hard fork address collision analysis (claims #29, #35).
implication: Mantle must strictly prohibit registering custom precompiles in the 0x01–0x30 reserved Ethereum address range.
```

```finding F15 high
# Vendor namespaces and adapter contracts isolate upstream rebase risks
claim: Mirroring OP Stack's P256VERIFY pattern (>0x0100) combined with versioned adapter contracts isolates custom precompiles from upstream geth rebases.
evidence: [observed] OP Stack specification for precompiles; [inferred] versioned proxy and adapter contract patterns (claims #30, #36).
implication: Guarantees that Mantle can absorb upstream rebases without corrupting post-quantum precompile execution.
```

---

## N Debunking the Myth: Why EIP-7702 Cannot Provide a Recovery Boundary {depth=2}
A common industry misconception assumes: "Users delegate their EOA to a PQ-capable wallet contract via EIP-7702. If ECDSA is threatened, they activate a 'PQ-only' switch or update delegation, securing the account."

**EVM protocol semantics prove this assumption dangerously false: 7702 offers zero post-quantum security!**

```excalidraw q="How does an attacker with a broken ECDSA key bypass EIP-7702 delegation to drain assets?" read="The top half depicts the two protocol bypass paths against a 7702-delegated EOA; the bottom half demonstrates how an EIP-3607-protected smart account blocks the attacker entirely." takeaway="7702 EOAs retain top-level transaction and revocation powers; only genuine smart accounts eliminate the ECDSA bypass." kind=7702 bypass attack
{"grid": {"w": 330, "h": 90}, "defaults": {"w": 280, "h": 60, "fontSize": 15},
 "nodes": [
   {"id": "eoa", "label": "Alice's EOA (7702 Delegated)\nDelegated to PQ wallet contract", "col": 0, "row": 0, "color": "yellow"},
   {"id": "atk", "label": "Quantum attacker extracts Alice ECDSA key", "col": 0, "row": 1, "color": "red", "strokeWidth": 3},
   {"id": "by1", "label": "Bypass Path 1: Direct Top-Level Tx\nfrom: Alice -> to: USDT -> transfer()\nCompletely skips delegated code! (EIP-3607 exempt)", "col": 1, "row": 0, "color": "red", "strokeWidth": 3},
   {"id": "by2", "label": "Bypass Path 2: Protocol Revocation\nSigns new auth tuple pointing to 0/malicious\nPQ contract revocation guard ignored by protocol!", "col": 1, "row": 1, "color": "red"},
   {"id": "sc", "label": "Genuine Smart Contract Account\nDeployed via CREATE2, no ECDSA origin", "col": 0, "row": 2, "color": "green", "strokeWidth": 3},
   {"id": "blk", "label": "EIP-3607 Block: Cannot be top-level sender\nDirect outflows must pass internal execute()\nAttacker lacking PQ signature is reverted!", "col": 1, "row": 2, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "atk", "to": "by1"}, {"from": "atk", "to": "by2"},
   {"from": "atk", "to": "blk", "stroke": "dashed"}
 ]}
```

### Bypass Path 1: Direct Top-Level Transaction Execution
- **7702 Core Rule**: An EOA with delegated code (`0xef0100 || address`) remains a valid transaction sender.
- **EIP-3607 Exemption**: While EIP-3607 prohibits accounts with code from acting as transaction senders, **EIP-7702 explicitly exempts delegated EOAs from this check** (claims #23, #24).
- **Execution Bypass**: When an attacker extracts Alice's ECDSA private key, they do not call Alice's delegated wallet contract. Instead, they broadcast a standard transaction:
  ```
  from: Alice
  to: TokenContract (USDT)
  data: transfer(AttackerAddress, 1,000,000)
  signature: ECDSA_Sign(AlicePrivKey, tx)
  ```
  In the EVM state transition, `msg.sender` is Alice. The token contract executes the transfer immediately.
  **Alice's delegated contract code is never loaded or executed! Any post-quantum verification logic is entirely bypassed!** (claim #25).

```finding F16 high
# 7702 EOAs retain top-level execution rights, leaving assets vulnerable to ECDSA theft
claim: EIP-7702 EOAs retain top-level transaction rights and are exempted from EIP-3607; an attacker with the ECDSA private key can call external contracts directly, skipping delegated PQ code.
evidence: [observed] EIP-7702 specification; EIP-3607 interaction clauses; Ethereum official 7702 guidelines (claims #23, #24, #25).
implication: Marketing 7702 as a post-quantum disaster recovery solution is cryptographically unsound; 7702 cannot serve as a security boundary.
```

### Bypass Path 2: Protocol-Level Delegation Revocation
EIP-7702 dictates that delegation is established via signed authorization tuples. An attacker holding the ECDSA private key can sign a new authorization tuple pointing to `address(0)` or a malicious contract, revoking or overwriting the delegation at the protocol level (claim #26).
Internal contract guards (e.g., `require(!isRevoked)`) have zero effect because authorization processing occurs in the consensus layer before any contract code executes!

```finding F17 high
# Attackers can overwrite or revoke 7702 delegations at the protocol layer
claim: An attacker possessing the compromised ECDSA key can broadcast a new authorization tuple to overwrite or clear the 7702 delegation, ignoring internal contract revocation restrictions.
evidence: [observed] EIP-7702 authorization tuple and revocation specifications (claims #26, #38).
implication: Confirms that 7702 is strictly an onboarding utility for batching operations, not a defensive vault boundary.
```

### True Disaster Recovery: EIP-3607 Smart Contract Accounts
True post-quantum security requires **pure smart contract accounts** deployed via `CREATE / CREATE2`:
- Under **EIP-3607**, the EVM protocol strictly rejects transactions where the sender address (`from`) already contains deployed code (claim #27).
- No attacker can initiate a standard transaction directly from that account using a classic ECDSA key.
- All account-initiated transactions must execute through the contract's entry points (e.g., `execute()`), where Mantle's ML-DSA-65 precompile enforces mandatory post-quantum authorization.
- *Caveat*: As detailed in [Section O](#panel-O), pre-existing ERC-20 allowances granted to external protocols can still allow `transferFrom` pulls outside this path, so cold vaults must also restrict external allowances.

```finding F18 high
# EIP-3607-protected smart contract accounts provide the only valid defensive boundary
claim: Smart contract accounts are protected by EIP-3607 and cannot act as top-level transaction senders; all account-initiated execution paths must pass through internal functions enforcing non-bypassable PQ verification (subject to external token allowance boundaries).
evidence: [observed] EIP-3607 specification; ERC-4337 execution semantics (claim #27).
implication: Mantle's disaster recovery framework must be structured around genuine smart accounts, guiding high-value institutional funds into dedicated vaults.
```

---

## O Institutional PQ Smart Account Model and Lifecycle {depth=2}
To reconcile institutional operational efficiency with post-quantum disaster readiness, Mantle should adopt a dual-approval state machine:

```excalidraw q="Lifecycle transitions of the institutional PQ smart account between normal and emergency modes" read="The left column shows normal operations with dual-approval; the middle represents emergency trigger events; the right shows emergency lockdown and key recovery." takeaway="Normal operations combine classical and PQ approvals, while emergency triggers enable one-way PQ takeover, eliminating ECDSA access." kind=permission state machine
{"grid": {"w": 330, "h": 90}, "defaults": {"w": 280, "h": 60, "fontSize": 15},
 "nodes": [
   {"id": "s_norm", "label": "Normal Mode\nDaily operations & rebalancing", "col": 0, "row": 0, "color": "blue"},
   {"id": "r_norm", "label": "Rule: Classical AND PQ Dual-Approval\n(ECDSA via institutional ops + ML-DSA-65 KMS)", "col": 0, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "ev_emg", "label": "Emergency Event / Cryptographic Alarm\n(Pre-registered PQ key signs emergency action)", "col": 1, "row": 0, "color": "red"},
   {"id": "s_emg", "label": "Emergency Mode\nComplete lockout of classical access", "col": 1, "row": 1, "color": "yellow", "strokeWidth": 3},
   {"id": "r_emg", "label": "Rule: PQ-Only Unilateral Authorization\n(Revokes all ECDSA keys & active session keys)", "col": 1, "row": 2, "color": "red", "strokeWidth": 3},
   {"id": "s_rec", "label": "Recovery & Migration Mode\nExecutes key rotation & vault migration", "col": 2, "row": 1, "color": "green"}
 ],
 "edges": [
   {"from": "s_norm", "to": "r_norm"},
   {"from": "r_norm", "to": "ev_emg"},
   {"from": "ev_emg", "to": "s_emg"},
   {"from": "s_emg", "to": "r_emg"},
   {"from": "r_emg", "to": "s_rec"}
 ]}
```

```finding F19 high
# Dual-approval state machines balance daily convenience with post-quantum security
claim: Institutional accounts operating under 'Classical AND PQ' in normal mode and switching to 'PQ-only' upon emergency triggers achieve non-bypassable security without daily friction.
evidence: [inferred] Multi-signature custody models and fail-safe state machine design patterns (claims #40, #43).
implication: Institutions retain standard operational procedures while possessing an immutable kill-switch to sever classical key access upon quantum threats.
```

### Immutable Pre-Registration
Post-quantum public keys (or commitment hashes) **must be registered on-chain during peacetime**. If registration is deferred until ECDSA is compromised, attackers can front-run the victim by registering their own post-quantum public keys (claim #41). Onboarding must require atomic deployment and key binding.

```finding F20 high
# Peacetime key binding is required to prevent registration front-running
claim: Once ECDSA is compromised, attackers can forge public key registrations; PQ public keys or commitments must be established on-chain during peacetime.
evidence: [inferred] Peacetime key commitment and registration front-running threat models (claim #41).
implication: Disaster recovery mechanisms must be established proactively; onboarding tooling must mandate upfront public key initialization.
```

### Residual Risk: DeFi Allowance Exposure
Even if the account contract is cryptographically unbreachable, tokens previously granted unlimited `approve` allowances to third-party DeFi contracts (e.g., AMM routers or lending protocols) can still be drained via `transferFrom` if that third party's admin keys rely on ECDSA (claim #46). Initial product rollouts must position PQ smart accounts as **cold reserve and settlement vaults with restricted allowance exposure**.

```finding F21 high
# Third-party DeFi allowances represent a residual risk outside account boundaries
claim: Historical token allowances granted to external DeFi contracts remain vulnerable to `transferFrom` drain if the external protocol's governance or admin keys are compromised.
evidence: [inferred] ERC-20 allowance mechanics and composable vulnerability propagation (claim #46).
implication: Product documentation must disclose this boundary and provide automated tools for revoking legacy allowances upon migration.
```

---

## P Mantle Engineering Rollout Roadmap {depth=2}
Mantle should implement post-quantum defense across four structured phases:

```timeline
Phase 1: Account PoC | Validate genuine smart account vs 7702 bypass attack; build ERC-4337 smart vault prototypes
Phase 2: Full-Stack Benchmarks | Benchmark Cloudflare CIRCL vs RustCrypto ml-dsa; measure EVM gas & SP1 zkVM cycles
Phase 3: Testnet Precompile Integration | Deploy ML-DSA-65 at 0x0101 on op-geth; synchronize Kona; complete SP1 proof pipeline
Phase 4: Institutional Pilot | Partner with AWS KMS custody providers; launch pilot PQ Smart Accounts for treasury reserves
```

### Mandatory Failure and Attack Scenarios for Acceptance
1. **Differential Fuzzing**: Execute 10M+ randomized malformed inputs (invalid hints, truncated signatures, corrupt keys) across `op-geth` (Go) and `Kona` (Rust) to guarantee identical error codes and gas consumption;
2. **7702 Bypass Simulation**: Construct a 7702 testbed alongside a genuine smart account; simulate an attacker with an ECDSA private key to prove that 7702 assets are drained while smart account funds remain secure;
3. **Replay & Historical Sync Safety**: Replay historical blocks surrounding the activation height to ensure calls to unactivated precompile addresses return empty data and consume base gas, preventing syncing forks;
4. **End-to-End SP1 Prover Generation**: Verify that rollup blocks containing 10+ ML-DSA-65 transactions generate valid SP1 proofs and verify on L1 within acceptable time bounds (<15 minutes).

---

## Q Residual Risk Inventory and Common Misconceptions {depth=2}
To prevent misplaced security assumptions across the organization, the following boundaries must be maintained:

| Common Misconception | Cryptographic Reality | Accurate Engineering Positioning |
|---|---|---|
| **"Adding a PQ module to a 7702 EOA secures it"** | **False**. Attackers with ECDSA keys can call external token contracts directly or overwrite delegations (claims #25, #26) | 7702 is an onboarding tool; true security requires migrating to smart contract accounts |
| **"Cheap EVM verification implies cheap proving"** | **False**. EVM precompiles meter gas; the SP1 prover must still prove computation in RISC-V (claims #31, #32) | Total costs must account for Kona's cycle consumption in SP1 zkVM |
| **"PQ accounts make the entire rollup quantum-safe"** | **False**. Account protection does not safeguard L1 consensus, KZG DA, or Mantle's Groth16/PLONK state verifier (claim #44) | Positioned strictly as "Account Authorization Disaster Recovery" |
| **"We can wait for Ethereum Native AA to finalize"** | **Passive**. Native AA on Ethereum L1 is unlikely to finalize before 2028–2029 (claim #47) | Mantle can capture institutional mindshare today via ERC-4337 |

```finding F22 high
# Account-level PQ protection is not equivalent to full-chain quantum resistance
claim: Post-quantum smart accounts protect authorization and governance; L1 consensus, KZG data availability, and settlement proof verifiers represent independent migration boundaries.
evidence: [inferred] Layered cryptographic dependency model from Part 1 (`post-quantum-mantle`) (claim #44).
implication: Product messaging must remain precise, branding the offering as a "PQ-Protected Smart Account" rather than claiming Mantle is a post-quantum blockchain.
```

---

## R Claim Ledger Verification and Reproducibility {depth=2}
All 50 claims in this report are indexed in `research/ledger.md` across three rigorous categories (observed 34 / inferred 12 / speculative 4).

Quick Reference to Primary Standards and Benchmarks:
- **Algorand v5.0.0 Falcon-1024 Specs**: `algod` v5.0.0 consensus hash v42 (August 2026) [claims #1, #2, #3]
- **NIST FIPS 204 ML-DSA Parameters**: ML-DSA-65 (PK 1952 B, Sig 3309 B, $q=8380417$) [claims #9, #12]
- **EIP-7702 & EIP-3607 Interaction**: Delegation indicator `0xef0100 || address` exemption [claims #23, #24, #27]
- **RustCrypto CVE-2026-24850**: GHSA-5x2r-hc65-25f9 hint index monotonicity fix [claim #19]
- **Fireblocks EVM Verifier Benchmarks**: 1.23M gas on ML-DSA-44 vs ERC-7562 500k limit [claims #21, #22]

```bash title="Verify RustCrypto ml-dsa vulnerability fix"
# Inspect RustCrypto ml-dsa hint monotonicity fix commit
cargo search ml-dsa --limit 1
# Verify dependency is pinned to 0.1.0-rc.4 or higher to eliminate CVE-2026-24850
```

```bash title="Verify EIP-8355 precompile payload structure"
# EIP-8355 suggested payload encoding:
# [0..1952]: pk | [1952..5261]: sig | [5261..5293]: msg
# Return: 32 bytes (0x00...01 on success / 0x00...00 on failure)
```

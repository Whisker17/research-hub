---
template: research
lang: en
title: "Choosing Post-Quantum Signatures: Hash-Based vs Lattice-Based, and the \"Third Path\" of EIP-8288"
subtitle: The debate is really three choices — the signature scheme, the aggregation proof, and the protocol interface. Ethereum bets on hashes at the protocol layer and a16z bets on lattices; neither aggregation stack is production-ready. EIP-8288 wants the protocol to stop adding a precompile per algorithm, but the current draft supports only one hash-based signature.
cols: 4
type: Technical research · Comparison · PQ series part 3
audience: Mantle developers and management who know EVM and rollups, have read (or roughly know) the threat model from parts 1 and 2, and have no background in XMSS, leanVM, lattice SNARKs or EIP-8288
scope: Principles and trade-offs of hash-based and lattice-based signatures; the XMSS + leanVM and Falcon + Aerie aggregation paths; positions and reasons of Ethereum, Starknet, a16z, LayerZero, Algorand and Solana; EIP-8288 / 8141 / PQ precompiles; revisions to the recommendations in parts 1 and 2
evidence: 193-row claim ledger (observed 148 / inferred 39 / speculative 6; three research lanes + series links); EIP texts and commit history, leanVM / Aerie READMEs and specs, the Aerie paper, NIST standards and forum posts, original tweets; accessed 2026-10-20
date: 2026-10-20 · v1
---
Bottom line: the debate is often framed as "Ethereum picks hashes, a16z picks lattices". A more precise framing is that it argues three things at once ([F1](#F1)):
1. which signature scheme to use;
2. which proof system aggregates many signatures;
3. how many kinds of cryptography the protocol should support natively.

Both sides have real weaknesses. The hash path rests trust on the oldest and best-studied primitive. But its signatures are large, proving hashes is expensive, and it needs recursion to split work across machines ([F3](#F3), [F4](#F4)). The lattice path (Falcon + Aerie) proves 32,768 signatures in 0.65 s on one laptop. But it depends on younger lattice assumptions, and the FN-DSA standard has no draft yet ([F6](#F6), [F7](#F7)). Both aggregation implementations say they are not production-ready ([F8](#F8)).

EIP-8288 tries to avoid picking a side. An account signs with any scheme locally, wraps it in a STARK, and a block-level recursive proof delivers the result. Vitalik says that this way "Ethereum can then never add a new precompile again". But the current draft accepts only one signature type, leanSPHINCS, and the generic STARK entry is not defined yet ([F11](#F11), [F12](#F12)).

For Mantle: part 2's "contract account + ML-DSA verification precompile" still holds as near-term disaster recovery ([F14](#F14)). Four things change:
- treat the precompile as a transitional tool;
- fix the address range;
- update the native AA timeline;
- make accounts target a "verification backend", not one precompile address ([F15](#F15)).

## A One debate, three choices {sheet meta="three layers"}
```tree list
Signature layer | Who authorized this message
  Hash | leanXMSS (consensus), leanSPHINCS (accounts)
  Lattice | Falcon, ML-DSA
Aggregation proof layer | How to prove a large batch is valid
  Hash-based STARK | leanVM: prove in pieces + recursive merge
  Lattice SNARK | Aerie: one proof on one machine, no recursion
Protocol interface layer | How results reach accounts and blocks
  Precompile | One address per algorithm, verify per tx
  EIP-8288 | Txs declare dependencies; block carries one recursive STARK
```

## B Key numbers {sheet span=2 meta="2026-10-20"}
| Quantity | Value |
|---|---|
| Signature size: BLS / Falcon-512 / leanXMSS / ML-DSA-65 / leanSPHINCS | 96 B / 666 B / 2,404 B / 3,309 B / 4,276 B |
| leanVM aggregating leanXMSS (M4 Max, 16 cores) | 1,362 per second, 318 KiB proof, 5.4 ms verify, 15.5 GiB peak memory |
| Aerie aggregating Falcon-512 (same M4 Max model) | 32,768 in 0.65 s, 1,346 KiB with salts, 54 ms single-core verify, 2.1 GiB peak |
| Same-machine throughput ratio (a16z figure) | Aerie about 29× leanVM; leanVM proof verification is faster (about 6 ms) |
| One leanSPHINCS dependency under EIP-8288 | 96 B of frame data + about 33,000 gas; the signature stays off-chain |
| Status | Both aggregation stacks self-report not production-ready; FIPS 206 has no draft |

## C Who stands where, and why {sheet meta="2026-10"}
| Camp | Leaning and core reason |
|---|---|
| Ethereum (Vitalik, Drake) | Hash: fewest dependencies; fear that AI breaks structured math |
| Starknet / Eli | Hash for proofs; Falcon allowed for accounts; lattice SNARKs "too new" |
| a16z / LayerZero | Lattice: fast on one machine, no recursion, NIST standards, privacy needs lattices anyway |
| Algorand | Lattice (Falcon): native accounts live; compact, fast to verify |
| Solana | BLS for consensus in Alpenglow (mainnet activation scheduled 2026-10-21); Falcon only prototyped |

## D The two paths at a glance {sheet span=2 meta="engineering summary"}
| Dimension | Hash path | Lattice path (Falcon) |
|---|---|---|
| Security assumption | ok Hashes only | warn Lattice problems: more structure, younger |
| Signature size | no 2.4–4.3 KB | ok 0.7 KB |
| Signer operations | warn Stateful keys need index tracking; stateless signing is slow | warn Floating-point sampling and side channels; moving to fixed-point |
| Proof aggregation | warn Proving hashes is costly; needs recursion | ok Mostly algebraic checks; one machine is enough |
| Standardization | warn lean schemes are custom parameters; hash not chosen | warn FIPS 206 has no draft; ML-DSA is a standard |
| Production readiness | no leanVM says not ready | no Aerie is a research release |

## E Timeline {sheet span=2 meta="2012–2027"}
```timeline
2012 | Module-SIS first defined | The "2012" Eli refers to
2024-08 | NIST publishes FIPS 204 / 205 | ML-DSA and SLH-DSA final
2026-06 | EIP-8288 and EIP-8292 drafts | Execution and consensus aggregation
2026-07-29 | HAWK withdrawn | After an AI-assisted attack
2026-08-12 | Algorand v5.0.0 | Native Falcon-1024 accounts
2026-09-28 | NIST: FN-DSA moves to fixed-point | Still no public draft
*2026-10-16 | a16z releases Aerie | Lattice aggregation, 29× leanVM
*2026-10-19 | Vitalik: "8288 maximalism" | No more precompiles; 8355 declined
2027 Q2 | Hegotá (expected) | Includes EIP-8141, not 8288
```

## F Conclusion {sheet span=4}
```callout ok Do not turn an algorithm choice into an architecture lock-in: ship PQ authorization now, target a verification backend, and wait on aggregation
- Separate the layers: signature, aggregation proof and protocol interface are independent choices; Starknet already combines "hash-based proofs + Falcon accounts" (F1, F10).
- Hash path: the most conservative assumption; the cost is large signatures, expensive proving, recursion, and the criticism that recursive security is hard to prove (F3, F4, F5).
- Lattice path: Aerie proves 32,768 Falcon signatures in 0.65 s on one machine; the cost is younger assumptions, salts that make the default size non-constant, and no FN-DSA draft (F6, F7).
- Neither is ready: leanVM and Aerie both say they are not production-ready; the fight is about the default after 2027 (F8, F9).
- EIP-8288: the protocol verifies one proof type and stops adding precompiles per algorithm; today it supports only leanSPHINCS and it is not in Hegotá (F11, F12, F13).
- For Mantle: keep the near-term plan, but change its positioning, address range and timeline, and abstract the verification backend; PQ signature aggregation does not pay off yet (F14, F15, F16).
- Where to read: basics in I–K, the two paths in L–O, EIP-8288 in P–Q, revisions and Mantle in R–S.
```

## G How to read this {depth=1}
```callout info Series map: Mantle post-quantum series, three parts
- Part 1, [Post-Quantum from First Principles to Roadmap](/p/post-quantum-mantle/en/): which components quantum computers break, what Ethereum / Starknet / Aztec do, and what Mantle must migrate itself.
- Part 2, [Post-Quantum Engineering on Mantle](/p/pq-in-mantle/en/): contract-level PQ accounts + a verification precompile, and why EIP-7702 is not disaster recovery.
- Part 3 (this report): how to choose signatures and aggregation, what EIP-8288 changes, and which statements in parts 1 and 2 need revision (panel R).
```

```callout info You already know (not explained here)
- A private key signs and a public key verifies; EOA transactions use secp256k1 ECDSA
- Shor's algorithm on a quantum computer breaks elliptic curves; hashes only lose margin (part 1, panel K)
- A hash is a "data fingerprint"; a Merkle path proves that a leaf is in a tree
- A precompile is a fixed-address contract that the client implements natively
- Rollup basics: a sequencer orders transactions, and L1 verifies the state
```
- **5 minutes (management)**: read the lead and overview panels A–F, then the action list in [panel S](#panel-S).
- **30 minutes (developers)**: read [Background](#panel-I), [How the two signatures work](#panel-J), [XMSS + leanVM](#panel-L), [Falcon + Aerie](#panel-M), [Positions](#panel-N), [EIP-8288](#panel-P) and [Revisions to parts 1 and 2](#panel-R) in order.
- **Reviewers**: also read [Method and evidence](#panel-U) and [Reproduce](#panel-V).

**Two running examples**:
1. **Consensus example**: 32,768 validators vote in one slot. BLS merges them into one 96-byte signature. With PQ signatures, the task becomes "prove that all 32,768 signatures are valid".
2. **Account example**: Alice sends a transfer to Bob from a PQ account. We follow it on the precompile path and on the EIP-8288 path.

## H Context {depth=2}
**The problem.** On 2026-10-16, a16z released Aerie. It aggregates Falcon signatures with a lattice SNARK, about 29× faster than Ethereum's leanVM on one machine. a16z also openly made "the case for lattices" [1]. Two days later, StarkWare co-founder Eli Ben-Sasson replied "Strong disagree" [19]. A day later, Vitalik called EIP-8288 the ideal route to support everyone's cryptography: "Ethereum can then never add a new precompile again" [14].

**Why now.**
- Parts 1 and 2 gave the threat inventory and a near-term engineering plan. Part 2 recommends an ML-DSA-65 verification precompile [48]. This debate decides whether that recommendation still holds.
- In 2026-09, the EF rated the ML-DSA precompile EIP-8355 "premature standardization". On 10-19, EIP-8081 moved it to Declined [36][37].
- leanVM changed its signature scheme on 10-17, and its benchmark numbers changed with it [6][7]. Without primary sources, second-hand numbers are easy to mix up.

**Scope.** Principles and trade-offs of both signature families; how the two aggregation paths work and how to read their numbers; each ecosystem's position and reasons; how EIP-8288 works and where it stands; revisions to parts 1 and 2.

**Non-goals.** No security proofs for lattices or hashes; no independent reproduction of Aerie or leanVM benchmarks; no investment view; nothing about Mantle's non-public architecture.

**Decision criteria (set before the results).** We compare the two paths on six points:
1. Security assumption: how young it is and how much structure it has;
2. Bytes: signatures and aggregates;
3. Time and memory: proving and verifying;
4. Signer operational difficulty;
5. Standardization;
6. Production readiness.

**Gaps in the existing material.** The external research (ChatGPT Deep Research) has the right frame [49], but it could not fetch the tweets. It also missed three key changes: leanVM moved to two-level leanXMSS on 10-17; the EF declined 8355; and 8288 gas totals about 33,000, not 3,000. The correction list is in [panel U](#panel-U).

## I Background {depth=2}
```excalidraw q="Which concepts do you need first to follow this debate, and in what order?" read="Gray dashed boxes are assumed knowledge; blue boxes are the cards below; the green box is the subject. An arrow means learn first → learn after." takeaway="B-1 and B-2 cover hash-based signatures, B-3 covers lattice signatures, B-4 explains why we 'prove signatures valid', and B-5 covers the frame transactions that EIP-8288 builds on." name=prereq-map kind="prerequisite map"
{"grid": {"w": 290, "h": 100}, "defaults": {"w": 220, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "hs", "label": "Hashes, Merkle trees (known)", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "pk", "label": "Sign and verify (known)", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "zk", "label": "Rollup proofs (known)", "col": 1, "row": 3, "color": "gray", "stroke": "dashed"},
   {"id": "b1", "label": "B-1 Hash signatures", "col": 1, "row": 0, "color": "blue"},
   {"id": "b2", "label": "B-2 Stateful vs stateless", "col": 2, "row": 0, "color": "blue"},
   {"id": "b3", "label": "B-3 Lattice signatures", "col": 1, "row": 1, "color": "blue"},
   {"id": "b0", "label": "B-0 Aggregation", "col": 1, "row": 2, "color": "blue"},
   {"id": "b4", "label": "B-4 Proving validity", "col": 2, "row": 2, "color": "blue"},
   {"id": "b5", "label": "B-5 Frame tx 8141", "col": 3, "row": 2, "color": "blue"},
   {"id": "top", "label": "Signature choice, 8288", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "hs", "to": "b1"}, {"from": "b1", "to": "b2"}, {"from": "pk", "to": "b3"},
   {"from": "pk", "to": "b0"}, {"from": "zk", "to": "b4"}, {"from": "b0", "to": "b4"},
   {"from": "b4", "to": "b5"}, {"from": "b2", "to": "top"}, {"from": "b3", "to": "top"},
   {"from": "b5", "to": "top"}
 ]}
```

```prereq B-0 l1 3min
# Signature aggregation
what: Compress many signatures into one small object, so a verifier checks once. BLS adds signatures directly using elliptic-curve algebra, and the result is 96 bytes.
why: No known PQ signature adds up that way [1]. So "aggregation" becomes "produce a proof that every signature in the batch verifies". That is where the two paths compete.
example: 32,768 BLS votes → one 96 B signature. 32,768 Falcon-512 signatures sent one by one take about 21 MB; after Aerie aggregation, about 1.3 MB with salts [3].
misconception: Myth: PQ aggregation is just a new byte format. Fact: it turns a cheap addition into proving work that needs dedicated compute [10].
deeper: [1] a16z Aerie post, first two paragraphs
```

```prereq B-1 l1 4min
# Hash-based signatures: reveal secrets to prove authorization
what: The signer makes a set of secret values and publishes their hashes. To sign, it reveals some secrets chosen by the message; the verifier hashes them again and compares with the public key. XMSS hangs many "one-time keys" under one Merkle root, and the root is the public key.
why: Its security depends only on the hash function [31]. That is the "fewest dependencies" Ethereum wants. The cost is that a signature carries a one-time signature plus a Merkle path, so it is large.
example: leanXMSS: two XMSS levels of height 16, 32 B public key, 2,404 B signature, 201 BLAKE2s compressions to verify [7][8].
misconception: Myth: hash-based signatures mean SLH-DSA. Fact: the lean schemes use custom parameters for Ethereum, not NIST parameter sets [6].
deeper: [8] leanXMSS spec §2–§5
```

```prereq B-2 l1 4min
# Stateful vs stateless
what: XMSS is stateful: each one-time key may sign only one message, and the signer must remember which index it used. SLH-DSA / leanSPHINCS are stateless: larger signatures and more hashing buy freedom from state.
why: If a stateful signer uses one index for two different messages, an attacker can forge signatures [31]. Consensus signs once per slot, so the slot number can serve as the state. Multi-device wallets and backup restores cannot do that, so accounts use stateless schemes [1][11].
example: leanXMSS 2,404 B (stateful, consensus); leanSPHINCS 4,276 B (stateless, accounts and 8288) [8].
misconception: Myth: the transaction nonce prevents reuse. Fact: the nonce stops replay; once signature material leaves the device, the index is spent even if the transaction never lands.
deeper: [31] NIST SP 800-208 §1.2
```

```prereq B-3 l1 5min
# Lattice signatures: find an answer that is correct and short
what: A lattice is a regular grid of points in many dimensions. Finding a short enough vector in certain lattices is slow for all known algorithms. Falcon's private key is a "trapdoor" that lets the signer find a short solution to an equation; the verifier only checks the equation and the length.
why: Falcon verification is almost all algebra, with only a handful of hashes [1]. That makes it a good fit for an algebraic proof system such as Aerie.
example: Falcon verification: $s_1 + h \cdot s_2 \equiv c \pmod{q}$ and $\|(s_1,s_2)\|^2 \le \beta^2$, where $c$ is a hash of the salt and the message [3].
misconception: Myth: lattice signatures mean Falcon. Fact: ML-DSA is also a lattice signature and is already standard FIPS 204; Falcon's FN-DSA has no draft yet [29][33].
deeper: [3] Aerie specs/falcon.md §2
```

```prereq B-4 l1 5min
# Using a proof to "aggregate" signatures
what: The aggregator runs a "verify each signature" program inside a proof system and outputs one proof that the whole batch passed. Other nodes verify only that proof. Recursion takes several proofs as input and proves that they are all valid, producing one new proof.
why: This is where the two paths differ. Verifying a hash-based signature takes hundreds of hashes, and proving one hash costs about two orders of magnitude more than computing it [1][6]. So leanVM splits work across machines and merges recursively.
example: leanVM 2-to-1 recursion: 0.29 s, 201.5 KiB output [6].
misconception: Myth: SNARK means an elliptic-curve proof. Fact: SNARK only means "succinct and non-interactive"; Aerie is a lattice SNARK, and a STARK is hash-based.
deeper: [2] Aerie paper §1.2
```

```prereq B-5 l2 3min
# Frame transactions (EIP-8141)
what: Split one transaction into "frames": verification, payment and execution. The account writes its own verification logic and can authorize with any signature scheme.
why: EIP-8288 adds a new frame type (mode 4) to 8141. Hegotá includes 8141, and ethereum.org expects Hegotá on mainnet in 2027 Q2 [12][36][38].
deeper: [12] EIP-8141
```

## J How the two signatures work {depth=2}
Hash-based and lattice signatures both resist quantum attacks, but they "trust" different things. Figure 1 puts their verification steps side by side.

```excalidraw q="What does a verifier check for a hash-based signature and for a lattice signature?" read="Top row: XMSS recovers the leaf public key from a one-time signature, then hashes up the Merkle path to the root. Bottom row: Falcon computes the target c, then checks one equation and one length bound. Red marks the most expensive part inside a proof system." takeaway="Hash-based verification is hundreds of hashes. Falcon verification is one ring equation plus a norm check, with a single hash step (HashToPoint). That gap drives the proving cost." kind="principle comparison"
{"grid": {"w": 270, "h": 120}, "defaults": {"w": 200, "h": 64, "fontSize": 16},
 "nodes": [
   {"id": "x1", "label": "Sig: one-time sig + path", "col": 0, "row": 0, "color": "blue"},
   {"id": "x2", "label": "Hash chains: leaf key", "col": 1, "row": 0, "color": "red"},
   {"id": "x3", "label": "Merkle path: to root", "col": 2, "row": 0, "color": "red"},
   {"id": "x4", "label": "Root = public key?", "col": 3, "row": 0, "color": "green"},
   {"id": "f1", "label": "Sig: salt + short s2", "col": 0, "row": 1, "color": "blue"},
   {"id": "f2", "label": "HashToPoint: target c", "col": 1, "row": 1, "color": "yellow"},
   {"id": "f3", "label": "Equation: s1 + h·s2 = c", "col": 2, "row": 1, "color": "blue"},
   {"id": "f4", "label": "Short? Valid encoding?", "col": 3, "row": 1, "color": "green"}
 ],
 "edges": [
   {"from": "x1", "to": "x2"}, {"from": "x2", "to": "x3"}, {"from": "x3", "to": "x4"},
   {"from": "f1", "to": "f2"}, {"from": "f2", "to": "f3"}, {"from": "f3", "to": "f4"}
 ]}
```

```finding F2 high
# Hash-based signatures trust only the hash, but pay for state and size
claim: Stateful hash-based signatures depend only on preimage-type hardness of the hash, which quantum computers are not expected to break; but signing two different messages with one index enables forgery. A leanXMSS signature is 2,404 B, about 25× BLS; stateless leanSPHINCS is 4,276 B and SLH-DSA-128s is 7,856 B.
evidence: [observed] NIST SP 800-208 §1, §1.2 [31] (H1, H3); leanXMSS and leanSPHINCS specs [8] (H4, H10); FIPS 205 Table 2 [30] (H11).
implication: Consensus can use the slot as state; accounts must use a stateless scheme, which doubles the signature size again. The "conservative" hash path has a size cost.
```

```finding F6 high
# Falcon is small and fast; the hard parts are the signer and the standard
claim: Falcon-512 has an 897 B public key and a 666 B signature, and verifies in about 16 µs on one core. Its signer depends on floating-point Gaussian sampling, with platform, side-channel and memory problems. On 2026-09-28, NIST said FN-DSA will require fixed-point arithmetic and that the number of approved signing procedures is "0"; as of 10-20, FIPS 206 has no public draft.
evidence: [observed] Aerie spec parameter table [3] (L4); Aerie paper §6.3 [2] (L6); ePrint 2026/1531, 2026/2313 [44] (L7, L9); NIST pqc-forum [32] (L10, L11); NIST publication list [33] (L12). [inferred] FN-DSA's final encoding may still change (L13).
implication: Projects that pick Falcon today use a "pre-standard" version. Algorand uses a deterministic variant that differs from NIST's announced direction for FN-DSA (F10).
```

ML-DSA is also a lattice signature, but with a different construction: Fiat–Shamir with aborts, based on Module-LWE and SelfTargetMSIS [29] (L2). It is a standard and has HSM support. But its signatures are large (3,309 B for ML-DSA-65). Its hash also depends on the signature itself, so Aerie's trick of "keeping the hash outside the proof" does not apply [1] (L3, L37).

## K Running example: 32,768 signatures in one slot {depth=2}
Both paths face the same task: about 32,768 validator signatures in one slot, and the whole network must accept them as valid within seconds. a16z says one Aerie machine can handle "roughly an Ethereum slot's worth of signatures" [1] (S2).

| Approach | Who does it | Output | Main cost |
|---|---|---|---|
| BLS (today) | Any node adds them | 96 B | Not quantum-safe |
| leanXMSS + leanVM | Several aggregators each prove a slice, then merge recursively | About 200–320 KiB per proof | Proving hashes is costly; needs several high-spec machines and rounds of recursion |
| Falcon + Aerie | One machine, one proof | 1.3 MB with salts; 66 KiB estimated with a common salt | One node must collect all signatures; it cannot merge others' proofs |

Neither approach removes the computation. Each one only moves where it runs, how the proof travels, and how many nodes repeat the work (S3).

## L XMSS + leanVM: how Ethereum consensus aggregates hash-based signatures {depth=2}
**In one sentence**: leanXMSS produces the signatures, and leanVM proves that "a program that checks each leanXMSS signature ran successfully". leanVM never touches private keys and takes no part in signing [10] (H29).

Figure 2 shows the flow defined by EIP-8292.

```uml q="How do tens of thousands of leanXMSS votes in one slot become one proof in a block?" read="Simplified: one subnet and two leaf aggregators. Leaf and recursive aggregation are done by opt-in aggregators; block-level folding is the proposer's duty." takeaway="Proving work concentrates on a few high-spec nodes; ordinary nodes verify one proof in a few milliseconds."
sequenceDiagram
  autonumber
  participant V as Validators (tens of thousands)
  participant A1 as Leaf aggregator 1
  participant A2 as Leaf aggregator 2
  participant R as Recursive aggregator
  participant P as Proposer
  participant N as All nodes
  V->>A1: Sign vote, slot number as index
  V->>A2: Same vote message
  A1->>A1: leanVM proves one batch valid
  A2->>A2: leanVM proves another batch
  A1->>R: Leaf proof
  A2->>R: Leaf proof
  R->>R: 2-to-1 recursive merge
  R->>P: Aggregate proof
  P->>P: Fold messages (at most 8)
  P->>N: Block-level proof
  N->>N: Verify one proof (about 5 ms)
```

**Current numbers (leanVM @3a37fb6, 2026-10-18, M4 Max, no GPU)** [6] (H22, H24, H25):

| Task | Size | Time | Proof size | Peak memory |
|---|---|---|---|---|
| Aggregate leanXMSS | 1,290 | 0.95 s (1,362 per second) | 318 KiB | 15.5 GiB |
| Aggregate leanSPHINCS | 850 | 1.0 s | 326 KiB | 16.1 GiB |
| 2-to-1 recursion | Two leaves of 900 signatures | 0.29 s | 202 KiB | 14.7 GiB |

```finding F3 high
# leanXMSS + leanVM is a working prototype, but its scheme and hash still change
claim: EIP-8292 makes aggregators an opt-in, high-spec role with no stake threshold; leaf and recursive aggregation belong to aggregators, block-level folding to proposers. Targets: typical proofs of 185–230 KiB, and 1,000 signatures in about 2.6 s on 16 cores. leanVM now uses a binary field + WHIR, BLAKE2s is only a placeholder hash, and it says it is "not (yet) production ready". On 10-17 the scheme moved to two-level leanXMSS, and README throughput fell from 1,651 to 1,362 per second.
evidence: [observed] EIP-8292 [10] (H28, H29, H30); leanVM README @127510d1 and @3a37fb6 [6] (H17, H19, H21, H22); PR #640 [7] (H4). [inferred] The two throughput figures measure different signature schemes, so do not mix them (H23).
implication: Any "leanVM signatures per second" figure needs a commit hash. With the hash not chosen, signatures, proofs and 8288's `DEPS_HASH` will all still change.
```

```finding F4 medium
# Recursion is the strength of the hash path, and its most attacked point
claim: Recursion lets leanVM split work across machines and merge other provers' proofs. a16z argues that each recursive step proves statements about "the hash used for Fiat–Shamir", so the composed security "can't be established even in the random oracle model". Academic work agrees that recursive STARK security analysis is only heuristic. On the other side, leanVM claims 128-bit ROM (64-bit QROM) soundness, while EIP-8292 says about 124 / 62 bits. As of 10-20, we found no direct EF reply to this criticism.
evidence: [observed] a16z post [1] (H54); Chiesa and co-authors, ePrint 2023/1646 [41] (H55); leanVM README [6] (H19); EIP-8292 security section [10] (H20); tweet and forum search (H57). [inferred] This is a gap in the proof model, not an attack on leanVM (L41).
implication: "The hash path is more conservative" holds for the primitive. The full system also adds assumptions about recursive composition.
```

```finding F5 medium
# The hash path has its own standardization and hardware problems
claim: leanXMSS / leanSPHINCS are not NIST parameter sets, leanVM has no final hash, and the consensus spec leanSpec still encodes XMSS over KoalaBear. A hardware-wallet-friendly SPHINCS- variant takes 47.5–390 seconds to sign on a Ledger. An early "round-skipping" attack eroded Poseidon2's security margin, and Ethereum has moved to a binary-field design that needs no circuit-friendly hash.
evidence: [observed] leanVM README [6] (H17); leanSpec commit `0b7d33e` (H26); SPHINCS- post [43] (H14); Poseidon Initiative slides and ePrint 2026/1692 [40] (H59, H60). [inferred] "Small-field Poseidon is broken" should narrow to "reduced-round attacks + eroded margin" (H61).
implication: a16z's point that the hash path is "non-standard, hash undecided" is factual; but the same criticism partly applies to Falcon (F7).
```

## M Falcon + Aerie: how a16z aggregates lattice signatures {depth=2}
**In one sentence**: Aerie is a lattice SNARK that proves only one thing: "every Falcon signature in this batch is valid". The verifier computes the hashes itself, and the proof covers only the algebra.

Figure 3 compares what each path puts inside the proof.

```excalidraw q="Which computations do leanVM and Aerie put inside the proof?" read="Left: leanVM proving XMSS, with every hash inside the proof (red). Right: Aerie proving Falcon, with HashToPoint left to the verifier (yellow) and only the equation, norm and encoding inside the proof (blue)." takeaway="Aerie is fast mainly because Falcon verification has almost no hashing to prove, not because lattice math is simpler. The cost is that the verifier needs each signature's 40 B salt." kind="proof boundary comparison"
{"grid": {"w": 360, "h": 100}, "defaults": {"w": 300, "h": 60, "fontSize": 16},
 "nodes": [
   {"id": "lt", "label": "leanVM: inside the proof", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "l1", "label": "Hash chains + Merkle paths", "col": 0, "row": 1, "color": "red"},
   {"id": "l2", "label": "Recursion: verify child proofs", "col": 0, "row": 2, "color": "red"},
   {"id": "l3", "label": "Output: about 200–320 KiB", "col": 0, "row": 3, "color": "green"},
   {"id": "at", "label": "Aerie: inside the proof", "col": 1, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "a0", "label": "Outside: verifier runs HashToPoint", "col": 1, "row": 1, "color": "yellow"},
   {"id": "a1", "label": "Inside: equation + norm + encoding", "col": 1, "row": 2, "color": "blue"},
   {"id": "a2", "label": "66 KiB proof + 40 B salt per sig", "col": 1, "row": 3, "color": "green"}
 ],
 "edges": [
   {"from": "lt", "to": "l1"}, {"from": "l1", "to": "l2"}, {"from": "l2", "to": "l3"},
   {"from": "at", "to": "a0"}, {"from": "a0", "to": "a1"}, {"from": "a1", "to": "a2"}
 ]}
```

**How it works** [2][3] (L15–L17):
1. The input is N records of (public key, message, 40 B salt), with N up to 65,536. One proof cannot mix Falcon-512 and Falcon-1024.
2. The verifier uses each salt and message to compute the target $c_i$ itself. This "public salt" idea comes from the 2024 LaBRADOR aggregation work by Aardal and co-authors; Aerie did not invent it.
3. The prover commits to the signature data with Akita, a lattice polynomial commitment based on Module-SIS.
4. Three sum-check stages reduce the equation, norm and encoding constraints to one batched opening.
5. Canonical encoding is also proven. Earlier schemes skipped this and could accept signatures that a standard verifier rejects.
6. There is no recursion.

**How to read the numbers** (Apple M4 Max, 16 threads, no GPU, median of 7 runs, signing not included; sizes include salts but not the verifier's own public keys and messages) [2][3] (L19–L23, L26, L27):

| Reading | Number | Caveat |
|---|---|---|
| Prove 32,768 Falcon-512 | 0.645 s, about 50,800 per second | Single thread 4.3 s, about 8× verifying one by one |
| Aggregate size | 1,346 KiB (about 42 B per signature, 40 B of it salt) | Not constant-size by default |
| "66 KiB" | Estimate for common-salt mode | Needs an extra non-standard assumption; no such signer ships |
| Verify | 53.6 ms single thread, 11.6 ms on 16 threads | 10× / 3.7× faster than one by one; 70% of the time is hashing |
| vs leanVM (same machine, @127510d1) | 29× throughput (all cores), 39× (single thread) | leanVM's recursive proof verifies faster: about 6 ms |
| vs a leanVM recursion tree (paper model, no network) | 33,300 signatures: 2.0 s vs 0.65 s | leanVM can spread across machines; Aerie cannot |
| Peak memory | 2.1 GiB | leanVM today: about 15.5 GiB |

```finding F7 high
# Aerie is fast, but read "66 KiB" and "29×" with their conditions
claim: Aerie proves 32,768 Falcon-512 signatures in 0.645 s on an M4 Max. The default aggregate is 1,346 KiB because each signature carries a 40 B salt. 66 KiB is an estimate for common-salt mode; no reduction of that mode's unforgeability to a standard lattice assumption is known. 29× is same-machine all-core throughput, and leanVM proof verification is actually faster. Aerie proves security only in the classical ROM, and nobody can merge two Aerie proofs.
evidence: [observed] Aerie README and benchmark table [3] (L19, L20, L21, L32); paper Tables 2–5 and §7 [2] (L22, L26, L27, L36); spec §10.1 [3] (L30). The three sources give different absolute throughput numbers (L29).
implication: Compare the paths end to end: collect, prove, propagate and verify. Also count total machine resources and recovery after failure, not only peak throughput.
```

```finding F8 high
# Both aggregation stacks say they are not production-ready
claim: The Aerie README says "research release… Neither parameter set has passed the production acceptance criteria". It does not claim compatibility with the final FIPS 206. The leanVM README says "not (yet) production ready", and formal verification is in progress. The Aerie paper also discloses heavy use of AI models for the implementation, benchmarks and parts of the security proofs.
evidence: [observed] Aerie README Status [3] (L35); Aerie paper, AI Assistance section [2] (L39); leanVM README [6] (H19).
implication: This debate sets the default for after 2027. No project should treat either aggregation stack as a ready dependency today.
```

## N Positions and reasons by ecosystem {depth=2}
The table splits each argument into "what was said" and "what checks out".

| Who | What they said | Check |
|---|---|---|
| Vitalik (10-07) | AI-accelerated math puts new risk on ML-DSA / FHE / lattices; the lean path has "no lattices, no ML-DSA, no Falcon" | Quote verified [16] (H38) |
| Vitalik (06-15) | Keep dependencies minimal and the base layer "purely hash-based"; maintain less infrastructure | Quote verified [13] (H37) |
| Justin Drake (10-07) | "Bunker mode": go all-in on hashes and avoid structured assumptions | Quote verified [18] (H40) |
| Eli Ben-Sasson (10-18) | Lattices have rich structure for AI to attack; succinct module-SIS schemes date only from 2012; wait 3–5 years | Langlois and Stehlé defined Module-SIS in 2012 [35] (H47, H48) |
| a16z (10-16) | Fast on one machine, no recursion; recursive security is hard to prove; lean schemes are non-standard; privacy needs lattices anyway | Numbers and quotes verified; "non-standard" partly applies to Falcon too (L40, L42, L44, L45) |
| Justin Thaler (10-16) | Lattices remove recursion and custom signatures; weigh that against "far more speculative" lattice attacks | Quote verified [21] (L47) |
| Algorand | Compact, fast to verify, deterministic arithmetic, continuity with State Proofs | Native Falcon-1024 accounts live [25][26] (L48, L51) |

```finding F9 high
# Ethereum's hash preference is a protocol preference, not its research scope
claim: Vitalik and Drake give two public reasons: minimal protocol dependencies, and the risk that AI breaks structured math first. strawmap lists a "hash-based PQ L1" as one of five north stars. But pq.ethereum.org (06-27) still lists Falcon and Dilithium as execution-layer candidates, and PSE has benchmarked Falcon + LaBRADOR aggregation. Vitalik himself accepts that public-key encryption cannot use hashes alone.
evidence: [observed] Vitalik tweet and Magicians reply [16][13] (H37, H38, H39); Drake tweet [18] (H40); strawmap [45] (H41); pq.ethereum.org [46] (H43); PSE post [42] (H45). [inferred] EF texts are not publicly reconciled with each other (H44).
implication: Do not read Ethereum's position as "lattices are unsafe". Its core aim is "less cryptography in the protocol", which is the same idea behind EIP-8288.
```

```finding F10 high
# Starknet is "hash-based proofs, free choice for accounts"; Algorand is the one major chain live on lattices
claim: StarkWare says STARK commitments rely only on hashes. S2morrow and OpenZeppelin have both published Falcon-512 account code (the OZ code has no audit), and StarkWare's roadmap mentions Falcon-512 for on-chain consensus signatures. Algorand's native Falcon-1024 accounts shipped with v5.0.0 (released 2026-08-12); they use a deterministic variant and leave consensus participation keys unchanged. Solana's Alpenglow upgrade uses BLS for consensus and is scheduled for mainnet activation on 2026-10-21; its Falcon code remains prototypes.
evidence: [observed] Two StarkWare posts [22][23] (H50, H51); OZ repository [24] (H53); Algorand docs and release [25][27] (L48, L49, L50); two Solana pages [28] (L53, L54). [inferred] Starknet is not anti-Falcon (H52). [speculative] Eli's "module-SIS" point targets lattice succinct proofs (Akita) rather than NTRU-based Falcon signatures (H49).
implication: "Lattice signatures, hash-based proofs" is a combination that already runs. Mantle does not need to join one camp.
```

**a16z's four arguments, one by one**:
1. **Performance and simplicity**: one machine proves the whole batch with no recursion. If an aggregator fails, any node with the same signatures can redo the proof [1] (S9). Check: true, but it assumes one node first collects every signature; the paper does not model how signatures reach that node (S9).
2. **Recursive security**: see F4. It criticizes the proof model; it is not an attack (L41).
3. **Non-standard**: true, the lean schemes do not use NIST parameter sets [6] (L43). But FN-DSA has no draft and Aerie is a research release, so this point partly applies to Falcon too (L44).
4. **Privacy**: no black-box construction turns hashes into public-key encryption, so private chains will need lattices (ML-KEM) [1] (L45). Vitalik's answer is to keep encrypted notes off-chain [16] (L46).

**How real is the AI risk?** AI-assisted attacks on lattice-family schemes did happen in 2026: Anthropic used a model to improve HAWK key recovery. The HAWK team withdrew it on 07-29 [34] (L57, L58). But HAWK rests on the lattice isomorphism problem, not on SIS / LWE / NTRU, and Anthropic said the attack does not affect lattice cryptography in general. As of 10-20, this research found no public AI attack on Falcon or ML-DSA themselves (L59, speculative).

## O Strengths and weaknesses {depth=2}
The table is an engineering summary of the panels above, not a score for whole families (S4).

| Dimension | XMSS / SPHINCS + leanVM | Falcon + Aerie |
|---|---|---|
| Base assumption | ok Hashes only; longest research history | warn Lattice problems; Akita uses Module-SIS (defined 2012) |
| Composed security | warn Recursive composition has only heuristic analysis | warn Classical ROM only; no QROM claim |
| Signature size | no 2.4–4.3 KB | ok 666 B |
| Signer side | warn Consensus manages state via slots; stateless signing is slow | warn Floating-point sampling and side channels; moving to fixed-point |
| Proving throughput | warn 1,362 per second per machine; needs several machines | ok About 50,000 per second per machine |
| Proving memory | no About 15 GiB | ok About 2 GiB |
| Proof verification | ok About 5–6 ms | warn About 54 ms on one core; grows with batch size |
| Aggregate size | ok About 200–320 KiB, mostly independent of signature count | warn About 42 B per signature by default (salts) |
| Merge others' proofs | ok Yes (recursion) | no No |
| Standards and maturity | warn Custom parameters, hash undecided, not ready | warn No FN-DSA draft; research release |

```finding F1 high
# The debate is three layered choices, and they can be mixed
claim: The signature layer (hash / lattice), the aggregation proof layer (hash-based STARK / lattice SNARK) and the protocol interface layer (precompile / EIP-8288) are independent choices. Starknet already runs "hash-based proofs + Falcon accounts". EIP-8288 follows the design "the protocol verifies one hash-based proof type, and accounts can wrap any signature in a STARK".
evidence: [observed] StarkWare [22] (H50); EIP-8288 text [11] (E5); Vitalik's 2026-09-09 tweet [17] (E29). [inferred] The three-layer split and the mixing it allows (S1).
implication: Before asking "which path", state which layer you are choosing. For Mantle, the account-layer signature choice and the L2 proof system choice are separate decisions.
```

## P EIP-8288: turning signature checks into "transaction dependencies" {depth=2}
**What it is.** EIP-8288 (Draft; authors Vitalik and Thomas Coratger; created 2026-06-03; last changed 10-15) adds a new frame type to EIP-8141: the mode 4 "dependency verification frame" [11] (E1–E3).

- The frame holds 1–256 triples of 96 bytes each: `(scheme, data_hash, verification_key_hash)`.
- The frame **runs no EVM code**. It only declares "the block must contain a proof that these dependencies hold".
- The block header gains a `recursive_stark` field: one recursive STARK that proves every dependency in the block.
- The account's verification frame reads the triples with `FRAMEPARAM` / `FRAMEDATACOPY`.
- The account itself checks two things: is the key my authorized key, and is the signed hash this transaction.

Figure 4 walks Alice's transfer to Bob through it.

```uml q="How does a PQ transfer go from wallet to block under EIP-8288?" read="Based on the spec's Test Case 1 and its mempool / builder sections, simplified to one mempool hop. Frame 0 writes data_hash as all zeros, which stands for 'this transaction's signature hash' and avoids self-reference." takeaway="The raw signature appears only on the first hop; after that, a recursive STARK travels instead. Validating nodes never see Alice's signature: they verify one block proof, then run the account logic as usual."
sequenceDiagram
  autonumber
  participant W as Alice wallet
  participant M as Mempool node
  participant B as Builder
  participant N as Validating node
  W->>W: Frame 0 dep (0x10, zeros, pubkey), frame 1 verify, frame 2 transfer
  W->>W: Sign tx signature hash with leanSPHINCS
  W->>M: Mode 0 wrapper: tx + raw signature
  M->>M: Verify each, merge every 1 s into a recursive STARK
  M->>B: Mode 1 wrapper: txs + one STARK
  B->>B: Pick txs, drop deps of excluded txs, recurse once more
  B->>N: Block (header carries recursive_stark)
  N->>N: Recompute dependency digest, verify STARK
  N->>N: Run frame 1: check key and hash in the dependency
  N->>N: Run frame 2: transfer to Bob
```

**Cost.** Each leanSPHINCS dependency: 3,000 gas of frame execution plus 30,000 added to intrinsic gas, about 33,000 gas in total. The payer pays it even if the transaction reverts [11] (E13, E14, E15). On-chain data is 96 B per dependency, plus one STARK of about 100–300 kB per block [17] (E30).

```finding F11 high
# The core of 8288: the protocol verifies one proof type; accounts keep the algorithms
claim: On 10-19 Vitalik wrote that the ideal route is "through 8288": "make whatever signature you want locally, then STARK it". He added: "Ethereum can then never add a new precompile again". On Magicians he gave the motive: a "purely hash-based" base layer and less infrastructure to maintain. The spec gives other schemes two options. They go on-chain in the clear and pay gas, or the client wraps them in a STARK for the leanSTARK route.
evidence: [observed] Vitalik tweets [14][15] (E26, E27, H42); Magicians reply #5 [13] (E28); EIP-8288 Rationale [11]; Vitalik's 2026-09-09 tweet [17] (E29).
implication: 8288 is not one more account abstraction proposal. It answers "how many kinds of cryptography should the protocol support natively", and its answer is one.
```

```finding F12 high
# The current draft supports only leanSPHINCS; "just STARK any signature" does not work yet
claim: Dependency frames accept only leanSPHINCS (0x10) today; leanSTARK (0x11) is a reserved value, and a frame that uses it stays invalid until the spec defines `get_deps_hash` for it. `AGGREGATED_VK`, `DEPS_HASH` and the reference implementation are all TBD. The spec's gas section still describes a KoalaBear field, while leanVM has moved to a binary field. There is no public benchmark for producing a STARK of Falcon / ML-DSA verification on a phone or wallet.
evidence: [observed] EIP-8288 @72ca2dd [11] (E5, E8); leanVM README [6] (E50). [inferred] Spec and implementation disagree (E23); "pick any signature, then STARK it" is not usable yet (E31). [speculative] Feasibility of client-side STARK generation (E34).
implication: Vitalik describes the end-state direction, not today's capability. The only signatures 8288 can natively aggregate today are hash-based.
```

```finding F13 high
# 8288 is not in Hegotá, and the L1 PQ precompile path has stalled
claim: EIP-8081 (Hegotá) lists only FOCIL and EIP-8141 as Scheduled for Inclusion (SFI). The EF first rated the ML-DSA precompile EIP-8355 tier C, "premature standardization"; on 10-19, EIP-8081 listed it as Declined. 7885 / 8051 / 8052 and 8288 appear in no list. Vitalik hopes 8288 enters the I* fork after Hegotá, which is only the author's hope; ethereum.org expects Hegotá on mainnet in 2027 Q2.
evidence: [observed] EIP-8081 [36] (E37, E38); EF tier list post [37] (E37, E40); Vitalik tweet of 2026-09-09 [17] (E29); ethereum.org Hegotá page [38] (E41).
implication: In the near term, L1 gives a framework (8141), not an algorithm. Waiting for L1 to standardize a PQ precompile may mean waiting forever.
```

## Q Precompiles vs EIP-8288 {depth=2}
| Dimension | PQ verification precompiles (8355 / 8051 / 8052) | EIP-8288 dependency frames + block recursive STARK |
|---|---|---|
| Who verifies | Every full node, per transaction, in the EVM | First mempool hop and the builder check raw signatures; the network verifies one STARK per block |
| On-chain data | Public key + signature per tx (about 5.3 KB for ML-DSA-65) | 96 B per dependency + one 100–300 kB proof per block |
| Execution gas | About 9,000 for ML-DSA-65 (8355) | About 33,000 per leanSPHINCS dependency |
| Adding an algorithm | One hard fork each | No EVM change; use leanSTARK (not yet defined) |
| Client burden | One consensus-critical implementation per algorithm per client | One leanVM verifier; mempool nodes and builders do heavy proving |
| Security assumptions | Only the chosen signature | leanSPHINCS + STARK and recursion + `DEPS_HASH`; the STARK route adds the wrapped signature too |
| Portability to L2s | ok High: an L2 can add its own; RIP-7212 is a precedent | no Low: needs 8141, a header field and aggregation infrastructure |
| Status | Draft; 8355 declined | Draft; not in Hegotá |

Sources: EIP texts and tier ratings [11][36][37][38] (E36, E43).

One caveat: wrapping Falcon in a STARK does not remove Falcon's assumption. The outer proof only shows that "the verification program passed"; whether anyone can forge the signature still depends on Falcon (S5).

## R Revisions to parts 1 and 2: how the three reports connect {depth=2}
Figure 5 shows the role of each report and where this report revises the first two.

```excalidraw q="What does each PQ report answer, and what does this report change in the first two?" read="The blue and green boxes are the three reports; the yellow boxes below are revisions from this report, and dashed arrows point to the report each one revises." takeaway="Part 1 sets 'what to migrate', part 2 sets 'how to do accounts now', part 3 sets 'what to choose long-term and which interface to keep'. Most revisions land on part 2's precompile positioning, address and timeline." kind="series map"
{"grid": {"w": 330, "h": 120}, "defaults": {"w": 260, "h": 64, "fontSize": 16},
 "nodes": [
   {"id": "p1", "label": "Part 1: what to migrate", "col": 0, "row": 0, "color": "blue"},
   {"id": "p2", "label": "Part 2: near-term accounts", "col": 1, "row": 0, "color": "blue"},
   {"id": "p3", "label": "Part 3: choice and interface", "col": 2, "row": 0, "color": "green", "strokeWidth": 3},
   {"id": "r3", "label": "8288 can't aggregate SP1 proofs", "col": 0, "row": 1, "color": "yellow"},
   {"id": "r1", "label": "Precompile = transitional", "col": 1, "row": 1, "color": "yellow"},
   {"id": "r2", "label": "Address range, AA timeline", "col": 2, "row": 1, "color": "yellow"}
 ],
 "edges": [
   {"from": "p1", "to": "p2"}, {"from": "p2", "to": "p3"},
   {"from": "r3", "to": "p1", "dashed": true}, {"from": "r1", "to": "p2", "dashed": true},
   {"from": "r2", "to": "p2", "dashed": true}
 ]}
```

| # | Original statement | Current judgment | Basis |
|---|---|---|---|
| R1 | Part 2: ship a standalone ML-DSA-65 precompile first | Keep, but position it as a near-term disaster-recovery tool. L1 calls such precompiles "premature", and the end-state direction is no new precompiles | E26, E37, E47 |
| R2 | Part 2: follow 8355, with a 32 B digest as the message | Wrong. 8355 takes a variable-length message at the end, verifies the raw message per FIPS 204, and explicitly rejects a fixed 32 B pre-hash | E36, E44 |
| R3 | Part 2: a "private namespace" above `0x0100` (e.g. `0x0101`) isolates conflicts | Revise. EIP-7587 (Final) reserves `0x0100–0x01ff` for the RIP process, and P256 sits at `0x100`; register through RIP or check the registry first | E39, E45 |
| R4 | Part 2 ledger #47: native AA unlikely to settle before 2028–29 | Outdated. Hegotá includes 8141, expected 2027 Q2; the old row also contradicts part 1 | E40, E41, E46 |
| R5 | Part 2: an adapter hides the precompile address | Keep and widen: abstract a "verification backend" (precompile / in-SP1 verification / later, dependency introspection) | E48 |
| R6 | Part 2: Falcon-512 only as a compact baseline | Add: a separate Falcon test track to measure its real cost in Mantle's proof path | S6 |
| R7 | Part 1: the proof path needs "L1-side aggregation (e.g. EIP-8288)" | Qualify: 8288 aggregates only leanSPHINCS and the undefined leanSTARK; it cannot directly aggregate Mantle's SP1 proofs | E49 |
| R8 | Part 1: leanVM is not production-ready and has no final hash (@127510d1) | Still true. Add: binary field + WHIR, BLAKE2s placeholder; two-level leanXMSS since 10-17; quote numbers with a commit | E50, H4, H23 |
| R9 | Part 1: Starknet has one Falcon account demo | Update: S2morrow and OpenZeppelin both have Falcon-512 account implementations, and the roadmap mentions Falcon consensus signatures | H50, H51 |

```finding F14 high
# Part 2's near-term plan holds, but three facts must change
claim: "Contract account + raw signature + precompile or in-SP1 verification" is still the most direct near-term PQ authorization path. Three facts change: part 2 described 8355's message format wrongly; `0x0101` sits in the shared range that EIP-7587 reserves for RIPs, not a private space; and native AA is not 2028–29, because ethereum.org expects 8141 with Hegotá in 2027 Q2.
evidence: [observed] EIP-8355 [39] (E36, E44); EIP-7587 [39] (E45); EIP-8081 and ethereum.org [36][38] (E40, E41). [inferred] Ledger row #47 no longer holds (E46); treat the precompile as a transitional tool (E47).
implication: Part 2's engineering direction stands, but anyone citing it should carry these three corrections.
```

## S What it means for Mantle {depth=2}
Everything below is inference or speculation, not a Mantle plan.

```finding F15 medium
# Accounts should target a "verification backend", not one precompile address
claim: If an account's verification logic hard-codes a precompile address, any change of algorithm, address or a move to dependency introspection forces an account migration. If the account only knows a "verification backend" interface, the backend can be a precompile or in-SP1 verification, and later an 8288-style dependency check. But 8288 works only for 8141 frame transactions; ERC-4337 accounts cannot declare dependency frames.
evidence: [observed] 8288 exposes dependencies through 8141's `FRAMEPARAM` / `FRAMEDATACOPY` [11][12] (E20). [inferred] Verification-backend abstraction (E48); an account that can register keys of several algorithms can switch between ML-DSA and leanSPHINCS without migrating (S7).
implication: Widen part 2's `PQVerifierAdapterV1` from "hide the address" to "hide the backend", and let one account register keys of several algorithms.
```

```finding F16 medium
# PQ signature aggregation does not pay off on Mantle in the near term
claim: The spec notes that with leanSPHINCS only, plain concatenation saves space up to about 100 signatures. One leanVM proof is about 320 KiB. On a single-sequencer L2, 8288's multi-hop recursion collapses into one proof by the sequencer, and proving time adds straight to block latency.
evidence: [observed] EIP-8288 mempool section [11], leanVM benchmarks [6], Falcon aggregation break-even study [42] (E18, E33, E59). [inferred] Break-even near 100 signatures, single-sequencer collapse, early adoption not realistic (E51, E52, E58). [speculative] No public data on the cost of verifying a leanVM STARK inside SP1; it may become a bottleneck (E54).
implication: In the near term, spend the budget on account and permission paths, not on aggregation. Revisit aggregation when PQ transaction volume and the L1 design take shape.
```

**Suggested actions (inference)**:
1. **Keep the near-term plan**: contract account + PQ verification as the disaster-recovery path for high-value assets. Treat the precompile as transitional (R1).
2. **Fix part 2's three facts**: 8355 message format, address range, AA timeline (R2–R4). Check the RIP registry or use the RIP process before picking an address (E45).
3. **Abstract the verification backend and allow several keys**: let an account register both an ML-DSA key and a leanSPHINCS key (F15, S7).
4. **Run a separate Falcon test track**: measure Falcon / ML-DSA verification cost in op-geth, Kona and SP1. Aerie matters only if Mantle needs batch aggregation (S6).
5. **Do not build PQ signature aggregation** until PQ volume and the L1 design take shape (F16).
6. **Track five signals**: 8141 activation in Hegotá; whether 8288 enters I* and leanSTARK gets defined; the FN-DSA draft; leanVM's hash choice; a16z's promised "full case" and any EF reply (S8).

```callout warn CAUTION
Do not switch a whole chain's signature choice because of one benchmark. Aerie and leanVM both say they are not production-ready, and key numbers on both sides changed within one week (F3, F8).
```

## T Limits and open questions {depth=2}
- **No reproduction**: every benchmark is self-reported by its authors; we ran none of them.
- **Fast change**: leanVM changed its scheme on 10-17, and 8288 changed on 10-15. Numbers here are as of 10-20 and may go stale.
- **Key arguments on both sides are unfinished**: a16z promised a "full case" in a later post, not seen by 10-20; the EF has not formally answered the recursion criticism (H57, L60).
- **AI risk cannot be falsified**: neither side has testable evidence; we only checked events that happened (HAWK).
- **Conflicting figures**: leanVM README (128 / 64 bits) vs EIP-8292 (124 / 62 bits); three different absolute throughput numbers for the same comparison (H20, L29).
- **Algorand v42 mainnet activation date** has no primary source (L52).
- **Mantle side**: no forecast of PQ transaction volume; no public cycle counts for verifying a leanVM proof, or Falcon / ML-DSA, inside SP1 (E54).
- **Optimism's position on 8141 / 8288** has no primary source; Base announced EIP-8130 for all OP Stack chains, then moved to EIP-8430 (E55, E56, E57).

## U Method and evidence {depth=3}
**Method.** Three parallel lanes: the hash path (H), the lattice path (L), and EIP-8288 plus series revisions (E). Every claim traces to a primary source:
- EIP texts and GitHub commits;
- leanVM / Aerie / leanSig code and specs, and the Aerie paper;
- NIST standards and forum posts;
- original tweets (text and UTC time from the fxtwitter API).

The ledger has 193 rows; see `research/notes-*.md` for each lane.

**Pinned versions.**
- EIP-8288 @`72ca2dd` (2026-10-15); EIP-8081 @`6e69e49` (2026-10-19).
- leanVM @`3a37fb6` (2026-10-18) and @`127510d1` (2026-10-15, used by a16z for comparison).
- a16z/aerie @`49b6c21`; Aerie paper ePrint 2026/2501.

**Corrections to the external research (GPT).**
- 8288 gas is not "3,000 per dependency" but about 33,000 in total, charged even on revert (E14).
- It missed the 100–300 kB STARK in the block header; "no calldata" only means signatures stay off-chain (E30).
- It missed leanVM's switch to two-level leanXMSS on 10-17; 1,362 and 1,770 measure different schemes (H23).
- "Public salt, hash outside the proof" is not Aerie's invention; it comes from Aardal and co-authors 2024 (L16).
- It missed that the EF declined 8355 and that Hegotá includes 8141 (E37, E40).
- It attributed "How STARKs Work Part 6" to Eli without evidence; we quote Eli's tweet directly instead (H47).
- The new FN-DSA plan comes from a NIST forum post, not the FIPS 204 page; FIPS 206 has no public draft (L10, L12).

## V Reproduce {depth=3}
```bash title="Check EIP-8288 constants, version and Hegotá status"
curl -sL https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-8288.md \
  | grep -E "LEANSPHINCS|LEANSTARK|AGGREGATED_VK|DEP_VERIFY"
# Expect: DEP_VERIFY_FRAME_MODE 4; LEANSTARK_SCHEME 0x11 reserved; AGGREGATED_VK TBD
curl -sL https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-8081.md \
  | grep -n "8141\|8355"
# Expect: 8141 under Scheduled; 8355 under Declined
```

```bash title="Check the self-reported leanVM and Aerie benchmarks"
git clone --depth 1 https://github.com/leanEthereum/leanVM && grep -A8 "leanXMSS signatures" leanVM/README.md
# Expect (@3a37fb6): 1,290 signatures, 0.947 s, 318.4 KiB, 1,362.468 signatures/s
git clone --depth 1 https://github.com/a16z/aerie && grep "32,768" aerie/README.md
# Expect: 645 ms | 53.6 ms | 11.6 ms | 1,346 KiB | 66 KiB | 2,113 MiB
```

```bash title="Fetch tweet text and time"
curl -s https://api.fxtwitter.com/EliBenSasson/status/2111772220389245426 | jq -r .tweet.text
curl -s https://api.fxtwitter.com/VitalikButerin/status/2112015118418473358 | jq -r .tweet.text
```

## W Glossary {depth=2}
```glossary
PQ | post-quantum | Cryptography that runs on ordinary computers and is designed to resist quantum computers. | Needs no quantum hardware
Signature aggregation | — | Letting a verifier confirm a large batch of signatures with one check. | PQ signatures cannot be added like BLS
BLS | BLS12-381 signatures | Ethereum's consensus signatures; they add up to 96 bytes and are not quantum-safe. | Not PQ
XMSS | eXtended Merkle Signature Scheme | A stateful hash-based signature that manages many one-time keys with a Merkle tree. | Not stateless SLH-DSA
leanXMSS | — | The XMSS variant planned for Ethereum consensus: two tree levels, 2,404 B signatures. | Not a NIST parameter set
SLH-DSA | FIPS 205, formerly SPHINCS+ | NIST's standard stateless hash-based signature, 7.8 KB and up. | Not XMSS
leanSPHINCS | SPHINCS- family | Ethereum's custom stateless hash-based signature, 4,276 B; the only scheme EIP-8288 supports. | Not standard SLH-DSA parameters
Stateful signature | — | The signer must remember which one-time keys it used; reuse enables forgery. | A nonce cannot replace this state
Falcon | predecessor of FN-DSA | An NTRU-lattice signature: 666 B, fast to verify, complex to sign. | FIPS 206 has no draft yet
ML-DSA | FIPS 204, formerly Dilithium | A standardized lattice signature; ML-DSA-65 signatures are 3,309 B. | Different construction from Falcon
Module-SIS | module short integer solution | The lattice problem behind ML-DSA and Akita, first defined in 2012. | Falcon rests on NTRU instead
HashToPoint | — | The Falcon verification step that hashes the salt and message into a target polynomial. | Aerie leaves it outside the proof
Salt | — | 40 random bytes per Falcon signature, needed for verification. | A common salt needs an extra assumption
SNARK | succinct non-interactive argument | Umbrella term for proof systems with short proofs and fast verification. | Not necessarily elliptic-curve based
STARK | transparent hash-based SNARK | A proof system that relies only on hashes; used by Starknet and leanVM. | Not a PQ signature
Recursive proof | recursion | Using one proof to verify other proofs, merging many proofs into one. | Its security analysis is heuristic
ROM | random oracle model | A model that treats the hash as an ideal random function for security analysis. | Not the same as QROM
QROM | quantum ROM | A security model where the attacker can query the hash in quantum superposition. | A stronger requirement than ROM
leanVM | formerly leanMultisig | The EF's minimal hash-based zkVM for aggregating hash-based signatures; self-reported not ready. | Not a general zkEVM
Aerie | — | a16z and LayerZero's Falcon signature aggregator; a research release. | Cannot merge proofs
Akita | — | The lattice polynomial commitment Aerie uses, based on Module-SIS. | Not a signature scheme
EIP-8141 | Frame Transaction | Splits a transaction into verification, payment and execution frames with account-defined rules; scheduled for Hegotá. | Carries no PQ scheme itself
EIP-8288 | in-mempool aggregation | Adds dependency frames to 8141; each block carries one recursive STARK for all dependencies. | Draft, not in Hegotá
Dependency frame | — | 8288's mode 4 frame: declares signatures or proofs that must hold, and runs no code. | Does not authorize on the account's behalf
EIP-8292 | PQ attestation aggregators | The consensus-layer aggregator role and flow. | Does not change the execution layer
Precompile | — | A fixed-address contract implemented natively by the client. | L2s can add their own
RIP range | 0x0100–0x01ff | The precompile address range EIP-7587 reserves for rollup improvement proposals. | Not owned by any one chain
Hegotá | — | The Ethereum fork after Glamsterdam, expected 2027 Q2, including 8141. | Not the PQ fork
```

## X References {depth=2}
1. [a16z crypto: Fast post-quantum signature aggregation with lattice SNARKs (2026-10-16)](https://a16zcrypto.com/posts/article/fast-post-quantum-signature-aggregation-with-lattice-snarks) — the trigger; a16z's four arguments and benchmark summary. **PRIMARY**
2. [Aerie paper, ePrint 2026/2501](https://eprint.iacr.org/2026/2501) ([PDF](https://assets.layerzero.network/pdf/aerie.pdf)) — protocol, classical ROM proof, benchmark conditions, limits. **PRIMARY**
3. [a16z/aerie README and specs/falcon.md @49b6c21](https://github.com/a16z/aerie) — research-release status, common-salt assumption, benchmark table. **PRIMARY**
4. [LayerZero: Introducing Aerie](https://layerzero.network/blog/introducing-aerie) — LayerZero's framing and throughput figures. **PRIMARY**
5. [Akita, ePrint 2026/1983](https://eprint.iacr.org/2026/1983) — lattice polynomial commitment based on Module-SIS. **PRIMARY**
6. [leanEthereum/leanVM README](https://github.com/leanEthereum/leanVM) (@3a37fb6 and @127510d1) — architecture, security claims, benchmarks. **PRIMARY**
7. [leanVM PR #640 "Double XMSS" (2026-10-17)](https://github.com/leanEthereum/leanVM/commit/55f8b0389c6cceab02dee82a003e40f7d80d0699) — two-level leanXMSS, Lean 4 security proof. **PRIMARY**
8. [leanXMSS / leanSPHINCS specs (leanVM doc-latest)](https://github.com/leanEthereum/leanVM/releases/tag/doc-latest) — sizes, costs, state requirements. **PRIMARY**
9. [leanEthereum/leanSig](https://github.com/leanEthereum/leanSig) — prototype implementation, unaudited. **PRIMARY**
10. [EIP-8292: Post-Quantum Attestation Aggregators](https://eips.ethereum.org/EIPS/eip-8292) — consensus aggregator role, targets and security notes. **PRIMARY**
11. [EIP-8288: In-mempool signature and proof aggregation](https://eips.ethereum.org/EIPS/eip-8288) (@72ca2dd) — dependency frames, block recursive STARK, gas, TBD items. **PRIMARY**
12. [EIP-8141: Frame Transaction](https://eips.ethereum.org/EIPS/eip-8141) — frame modes, introspection opcodes, signature list. **PRIMARY**
13. [Ethereum Magicians: EIP-8288 thread](https://ethereum-magicians.org/t/eip-8288-frame-type-for-pq-sig-and-stark-aggregation/28723) — Vitalik's "purely hash-based" reply. **PRIMARY**
14. [Vitalik, 2026-10-19: 8288 is the ideal route](https://x.com/VitalikButerin/status/2112015118418473358) — "never add a new precompile again". **PRIMARY**
15. [Vitalik, 2026-10-19: EIP-8288 maximalism](https://x.com/VitalikButerin/status/2112032009413439704) — follow-up. **PRIMARY**
16. [Vitalik, 2026-10-07: AI and cryptographic risk](https://x.com/VitalikButerin/status/2107976296320106851) — "no lattices, no ML-DSA, no Falcon". **PRIMARY**
17. [Vitalik, 2026-09-09: A note on recursive STARK mempools](https://x.com/VitalikButerin/status/2097711433073172837) — I* hope, 100–300 kB STARK, client-side wrapping. **PRIMARY**
18. [Justin Drake, 2026-10-07: bunker mode](https://x.com/drakefjustin/status/2107837081313505768) — all-in on hashes. **PRIMARY**
19. [Eli Ben-Sasson, 2026-10-18](https://x.com/EliBenSasson/status/2111772220389245426) — "Strong disagree". **PRIMARY**
20. [@lex_node, 2026-10-18](https://x.com/lex_node/status/2111822591123927371) — the post Vitalik replied to. **PRIMARY**
21. [Justin Thaler thread, 2026-10-16](https://x.com/SuccinctJT/status/2111136133623251316) — lattices vs recursion trade-off. **PRIMARY**
22. [StarkWare: Starknet's Quantum Edge](https://starkware.co/blog/starknets-quantum-edge-starks-and-native-account-abstraction/) — hash-based proofs, Falcon-512 accounts. **PRIMARY**
23. [StarkWare: Quantum Readiness Roadmap](https://starkware.co/blog/the-architecture-advantage-starknets-quantum-readiness-roadmap/) — Falcon-512 consensus signature direction. **PRIMARY**
24. [OpenZeppelin/cairo-pq-verifiers](https://github.com/OpenZeppelin/cairo-pq-verifiers) — Falcon / ML-DSA / WOTS verifiers, unaudited. **PRIMARY**
25. [Algorand: Post-Quantum Accounts](https://dev.algorand.co/concepts/accounts/post-quantum/) — v42, deterministic Falcon, limits. **PRIMARY**
26. [Algorand: Technical Brief (Falcon)](https://algorand.co/blog/technical-brief-quantum-resistant-transactions-on-algorand-with-falcon-signatures) — reasons for the choice. **PRIMARY**
27. [go-algorand v5.0.0](https://github.com/algorand/go-algorand/releases/tag/v5.0.0-stable) — native Falcon-1024 accounts released. **PRIMARY**
28. [Solana: Quantum readiness](https://solana.com/news/quantum-readiness) and [Alpenglow](https://solana.com/upgrades/alpenglow) — Falcon prototypes, BLS consensus. **PRIMARY**
29. [NIST FIPS 204 (ML-DSA)](https://csrc.nist.gov/pubs/fips/204/final) — construction, assumptions, sizes. **PRIMARY**
30. [NIST FIPS 205 (SLH-DSA)](https://csrc.nist.gov/pubs/fips/205/final) — stateless hash-based signature sizes. **PRIMARY**
31. [NIST SP 800-208](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-208.pdf) — security and operations of stateful hash-based signatures. **PRIMARY**
32. [NIST pqc-forum: New plan for FN-DSA (2026-09-28)](https://groups.google.com/a/list.nist.gov/g/pqc-forum/c/7z-y5qp-W2Y) — mandatory fixed-point. **PRIMARY**
33. [NIST PQC Publications](https://csrc.nist.gov/Projects/post-quantum-cryptography/publications) — no FIPS 206 in the list. **PRIMARY**
34. [Anthropic: Discovering cryptographic weaknesses with Claude](https://www.anthropic.com/research/discovering-cryptographic-weaknesses) and [NIST news (HAWK withdrawal footnote)](https://www.nist.gov/news-events/news/2026/05/nine-candidates-advance-third-round-additional-digital-signatures-pqc) — the HAWK event. **PRIMARY**
35. [Langlois–Stehlé, ePrint 2012/090](https://eprint.iacr.org/2012/090) — first definition of Module-SIS / LWE. **PRIMARY**
36. [EIP-8081: Hegotá meta](https://eips.ethereum.org/EIPS/eip-8081) (@6e69e49) — Scheduled and Declined lists. **PRIMARY**
37. [EF: Hegotá EIP Tier List (2026-09-07)](https://blog.ethereum.org/2026/09/07/protocol-hegota-eips) — 8355 "premature standardization", 8141 tier S. **PRIMARY**
38. [ethereum.org: Hegotá](https://ethereum.org/roadmap/hegota/) — expected 2027 Q2. **PRIMARY**
39. [EIP-8355](https://eips.ethereum.org/EIPS/eip-8355), [EIP-8051](https://eips.ethereum.org/EIPS/eip-8051), [EIP-8052](https://eips.ethereum.org/EIPS/eip-8052), [EIP-7587](https://eips.ethereum.org/EIPS/eip-7587) — PQ precompile drafts and the RIP address range. **PRIMARY**
40. [Khovratovich: Post-Poseidon (ethresear.ch)](https://ethresear.ch/t/post-poseidon-hash-function-variants-for-ethereum/26071) and [ePrint 2026/1692](https://eprint.iacr.org/2026/1692) — hash choice and Poseidon attacks. **PRIMARY**
41. [Chiesa and co-authors, ePrint 2023/1646](https://eprint.iacr.org/2023/1646) — security bounds for recursive proofs are only heuristic. **PRIMARY**
42. [PSE: Lattice-based signature aggregation](https://ethresear.ch/t/lattice-based-signature-aggregation/22282) and [Revisiting Falcon aggregation for PQ mempools](https://ethresear.ch/t/revisiting-falcon-signature-aggregation-for-pq-mempools/24431) — lattice aggregation benchmarks and break-even. **PRIMARY**
43. [SPHINCS- (ethresear.ch)](https://ethresear.ch/t/sphincs-minus-efficient-stateless-post-quantum-signature-verification-on-the-evm/25165) — signing time of stateless hash-based signatures on a Ledger. **PRIMARY**
44. [ePrint 2026/1531](https://eprint.iacr.org/2026/1531), [2026/1915](https://eprint.iacr.org/2026/1915), [2026/2313](https://eprint.iacr.org/2026/2313) — fixed-point Falcon, low-memory signing, side channels. **PRIMARY**
45. [strawmap.org](https://strawmap.org/) — the "hash-based PQ L1" north star. **PRIMARY**
46. [pq.ethereum.org](https://pq.ethereum.org/) — execution-layer candidates still include Falcon / Dilithium. **PRIMARY**
47. [Base: Native Account Abstraction](https://www.base.org/blog/native-account-abstraction) and [Base Upgrades](https://docs.base.org/upgrades/overview) — AA moves on the OP Stack side. **PRIMARY**
48. Parts 1 and 2 of this series: [Post-Quantum from First Principles to Roadmap](/p/post-quantum-mantle/en/), [Post-Quantum Engineering on Mantle](/p/pq-in-mantle/en/) — the reports this one revises.
49. ChatGPT Deep Research output (`research/gpt-pq-signature-selection.md`) — leads only.

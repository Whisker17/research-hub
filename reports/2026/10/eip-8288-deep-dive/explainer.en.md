---
template: research
lang: en
title: "EIP-8288 Deep Dive: Recursive STARK Mempools, an AggLayer Comparison, and the Recursion Security Debate"
subtitle: 8288 turns signature checks into block-level "dependencies" that the mempool aggregates recursively. AggLayer shares only the "proof verifies a proof" primitive. Recursion has a theory gap but no known attack.
cols: 4
type: Technical research · Mechanism · Debate review · PQ series follow-up
audience: Developers and researchers who know the EVM and what a ZK proof is, but have not followed EIP-8288, AggLayer or the debate on recursive proof security
scope: EIP-8288 design and draft status; the premises behind supporters' claims; AggLayer's proof composition and a comparison; Justin Thaler's (a16z) critique of recursion and the evidence on each side
evidence: 166-row claim ledger (three research lanes, a full-text paper review, and the main session); EIP text @5a4387b and commit history, agglayer source @9f8e6c4, leanVM @3a37fb6, Aerie @49b6c21, SP1 docs, full text of 9 papers (ePrint via Internet Archive snapshots), original text of four posts on X; accessed 2026-10-21
date: 2026-10-21 · v1
---
The conclusions first, in four points:

1. **EIP-8288 is not a new signature scheme.** It adds a [[dependency frame]] to frame transactions. The frame declares claims and runs no code. Signatures stay off-chain, mempool nodes aggregate them recursively every second, and the block carries one STARK ([F1](#F1)). The current draft accepts only one scheme, leanSPHINCS ([F4](#F4)).
2. **Supporters say "more nodes means more capacity".** The spec has no work split and no incentives. It also caps a mode 1 wrapper at 16 signatures, which conflicts with "one wrapper covers every active transaction" ([F6](#F6)).
3. **AggLayer is similar in one way only:** it verifies one SP1 proof inside another. But it has one direct composition layer at the application level (not counting SP1's internal recursion). It settles per certificate and posts PLONK/BN254 proofs to L1. It is not multi-party recursion ([F9](#F9), [F10](#F10)).
4. **The literature supports Thaler's critique of recursion.** No one has a plain random-oracle security proof for practical succinct hash-based recursion like 8288's. 8288 itself lists it as a trust assumption ([F11](#F11)). But the KRS/Fenzi-style attacks reviewed here need the attacker to choose the proved computation (a circuit or a program). Today's transaction rules accept only leanSPHINCS, so user-program proofs are not an enabled feature; a leanSTARK branch in the aggregation pseudocode still needs confirmation in the final circuit. We found no exploitable flaw ([F12](#F12), [F13](#F13)).

## A Three questions, three answers {sheet meta="Research questions"}
```tree list
What is EIP-8288 | Dependency frames on 8141; the block carries one recursive STARK
  In the spec | dependency frames, wrappers, 1 s recursion, header proof
  Still a vision | wrap any scheme in a STARK, cheap privacy, private AA, ISA
Is AggLayer similar | Only in "a proof verifies a proof"
  Differences | one application-level layer, per-certificate settlement, not PQ
Is recursion safe | Theory gap, no known attack
  Theory | no known plain-ROM proof for practical succinct recursion; standard extraction covers constant depth only
  Attacks | the FS attacks reviewed need the attacker to choose the proved computation; none of this kind found against fixed-circuit STARK recursion
  For 8288 | no exploitable flaw found; revisit once leanSTARK opens
```

## B Key numbers {sheet span=2 meta="Spec @5a4387b and author benchmarks"}
| Item | Value |
|---|---|
| Per dependency | 96 B claim; leanSPHINCS about 33,000 gas (3,000 + 30,000) |
| Aggregation interval | 1,000 ms in the spec (Vitalik's post uses 500 ms as an example) |
| Builder STARK overhead per interval | about 256 kB (post: 100–300 kB) |
| Limits | per tx ≤ 16 signatures, ≤ 1 STARK; mode 1 wrapper also ≤ 16 / 1 |
| leanVM, 850 leanSPHINCS aggregated | 1.0 s, peak 16.1 GiB, proof 325.8 KiB (M4 Max) |
| leanVM 2→1 recursion | 0.291 s, 14.7 GiB, 201.5 KiB |
| Aerie, 32,768 Falcon-512 aggregated | 645 ms, one proof, no recursion |
| leanVM security claim | README: 128-bit ROM / 64-bit QROM; EIP-8292: about 124 / 62 bits |

## C Vision vs draft {sheet meta="Vitalik's posts vs the spec"}
| Vitalik's claim | Draft status |
|---|---|
| Signatures stay off-chain; 96 B per claim | ok in the spec |
| Recursion every tick; the builder is "yet another node" | ok in the spec (1,000 ms) |
| Wrap any scheme client-side in a STARK | no leanSTARK is reserved |
| Private txs down to "low tens of thousands" of gas | no same; 60,000 gas per claim at current pricing |
| Agree on an ISA (RISC-V preferred) | warn not in the spec; still under debate |
| Private AA | no not in the spec |
| Ship in the I-star fork | warn author's hope; not in Hegotá |

## D 8288 vs AggLayer {sheet span=2 meta="Quick reference"}
| Dimension | EIP-8288 | AggLayer |
|---|---|---|
| What it combines | signature and proof dependencies of txs | one chain's state transition per certificate |
| Who combines, when | mempool nodes every second; the builder at block time | the AggLayer node, outsourced to the SP1 network |
| Recursion depth | unbounded by design | one fixed layer at the application level |
| Merges across parties | ok yes | no per chain, per certificate |
| Final check | every validating node (block validity) | an L1 contract; only the trusted aggregator can submit |
| Quantum resistance | hash-based | no PLONK/BN254 + ECDSA |
| Status | Draft | live on mainnet (since 2025-02) |

## E Recursion debate: three layers {sheet span=2 meta="Strength of evidence"}
| Layer | Finding | Main evidence |
|---|---|---|
| Theory | warn gap: no known plain-ROM security proof for practical succinct recursion | ePrint 2024/728, BCCT13; 8288 and leanerVM admit it too |
| Known attacks | warn the KRS/Fenzi-style attacks reviewed need the attacker to choose the proved computation; targets are GKR-style protocols and IOPs for program-generated instances (incl. Aurora/STIR-type hash IOPs); none of this kind found against fixed-circuit STARK recursion | ePrint 2025/118, 2026/1838 |
| Exploitable flaw in 8288 | ok none found | tx rules accept only leanSPHINCS; the pseudocode's leanSTARK branch awaits the final circuit |
| Implementation | warn other zkVMs shipped recursive-aggregation bugs | ZisK, SP1 advisories |

## F Timeline {sheet span=2 meta="2013–2026"}
```timeline
2013 | BCCT13 | recursive extraction covers constant depth only
2024-05 | ePrint 2024/728 | relativized succinct arguments do not exist in the plain ROM
2025 | ePrint 2025/118 (KRS, CRYPTO 2025) | concrete attack on Fiat–Shamir for GKR-style protocols
2025-02-03 | AggLayer pessimistic proofs on mainnet | a proof verifies a proof
2026-09-09 | EIP-8288 merged; Vitalik posts | "recursive STARK mempools"
2026-10-07 to 10-15 | spec revisions | mode 4, gas paid by the tx, union check, zero data_hash
2026-10-16 | a16z releases Aerie | lattice aggregation, no recursion
2026-10-19 | Vitalik: "8288 maximalism" | no more new precompiles
*2026-10-21 | Thaler's long post | "the real debate is recursion"
```

## G Conclusion {sheet span=4}
```callout ok 8288's value is making verification dependencies explicit and letting the network share the proving. Its risk sits in one unproven recursion assumption and an unfinished draft.
- Mechanism: dependency frames declare and do not execute; the mempool aggregates recursively every second; the block verifies one STARK; the account decides whether a dependency is its authorization (F1, F2).
- Status: leanSPHINCS only; `AGGREGATED_VK`, `DEPS_HASH` and the reference implementation are TBD; not in Hegotá (F3, F4).
- Supporters' claims: "validators verify one proof" holds; "constant proof bandwidth" holds for the proof part only; "more nodes, more capacity" lacks a work split, incentives and throughput data (F5, F6, F7).
- AggLayer: shares only the primitive of verifying an SP1 proof inside another; settles chain by chain, submitted by a trusted aggregator, not PQ (F9, F10).
- Recursion: the theory gap is real and both sides' texts admit it; the attacks reviewed need the attacker to choose the proved computation; no exploitable flaw in 8288 found; Aerie also relies on the random oracle model (F11–F14).
- Where to read: mechanism in K–M, AggLayer in N, the recursion debate in O, the checklist in P.
```

## H How to read this {depth=1}
```callout info Series navigation
This page follows up the post-quantum series. For how hash-based and lattice-based signatures work, and how to read the XMSS + leanVM and Falcon + Aerie benchmarks, see the previous page, [Choosing Post-Quantum Signatures](/p/pq-signature-selection/en/). This page does not repeat that. It goes deep on EIP-8288 itself, the AggLayer comparison and the recursion security debate.
```

```callout info You already know (not explained here)
- A private key signs and a public key verifies; Ethereum txs enter the mempool and a builder packs them
- A hash function maps any data to a fixed-size fingerprint
- A ZK proof lets a verifier trust a computation result without redoing it
- Quantum computers would break elliptic-curve signatures, so Ethereum is looking for post-quantum (PQ) signatures
- Gas prices EVM computation and data
```

- **5 minutes**: read the lead and overview panels A–G.
- **30 minutes (developers)**: read [Background](#panel-J), [How 8288 works](#panel-K), [Mempool recursion](#panel-L) and [AggLayer](#panel-N).
- **30 minutes (researchers)**: read [Background](#panel-J), [The recursion debate](#panel-O) and [the checklist](#panel-P).
- **To check our work**: also read [Method and evidence](#panel-R) and [Reproduce](#panel-S).

**The running example**: Alice uses a leanSPHINCS account to send Bob 1 ETH. In the same second, node A receives Alice's and Charlie's txs, and node B receives Bob's. The builder includes only Alice and Bob. We built this example from the spec; it is not a real tx encoding.

## I Context {depth=2}
**The problem.** PQ signatures are about 2–3 kB and cost about 150,000–200,000 gas to verify on-chain. Client-side STARKs are 128–512 kB [1] (spec Motivation). If every tx puts this data in the block and every node verifies it one by one, PQ and private txs both become expensive.

**Why now.**
- On 2026-09-09, Vitalik posted about EIP-8288 and said he hopes it ships in I-star, the fork after Hegotá [6] (C2). decentrek then posted twice about it, calling it "my new favorite EIP of all time" [8][9] (C3).
- On 2026-10-16, a16z released Aerie: one machine aggregates Falcon signatures with a lattice SNARK, without recursion [16] (C1).
- On 2026-10-21, Justin Thaler of a16z posted a long critique and named 8288 [10] (C4). His thesis: the real debate "is not lattices vs. hashes — it is lattices vs. building everything on SNARK recursion".
- There is also a claim that AggLayer does something similar. We did not find its source in the four posts from the brief (G42, speculative).

**Scope.**
- The mechanism, draft status and revision history of EIP-8288;
- The premises behind each supporter claim;
- AggLayer's proof composition and how it compares with 8288;
- The recursion security debate: theory, known attacks, and what they mean for 8288.

**Non-goals.**
- How hash-based and lattice-based signatures work (see the previous page);
- Reproducing any benchmark;
- Full derivations of cryptographic theorems;
- Investment advice or advice to any company.

**Criteria (set before the conclusions).** We judge each claim on three levels:
1. What the spec or source code says (observed);
2. What follows from those facts (inferred);
3. What is only a vision or a worry that no evidence can test yet (speculative).

**Gaps in the existing material.** The external research (ChatGPT Deep Research) had the right frame but did not read the posts on X. It also missed four details:
- the 16-signature cap on mode 1 wrappers;
- the October spec revisions;
- SP1's own stated recursion assumption;
- the position of the leanVM formal-verification project on recursive extraction.

The full list of corrections is in [panel R](#panel-R).

## J Background {depth=2}
```excalidraw q="Which concepts do I need before 8288 and the recursion debate, and in what order?" read="Gray dashed boxes are assumed knowledge; blue boxes are the cards below; the green box is this page's subject. An arrow means learn first → learn after." takeaway="B-1 covers the vehicle for 8288; B-2 covers recursion; B-3, B-4 and B-5 are the three concepts the recursion debate needs." name=prereq-map kind="Prerequisite map"
{"grid": {"w": 290, "h": 105}, "defaults": {"w": 220, "h": 62, "fontSize": 17},
 "nodes": [
   {"id": "hs", "label": "Hash functions (known)", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "zk", "label": "ZK proofs (known)", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "tx", "label": "Txs and mempool (known)", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b3", "label": "B-3 Fiat–Shamir and ROM", "col": 1, "row": 0, "color": "blue"},
   {"id": "b2", "label": "B-2 STARKs and recursion", "col": 1, "row": 1, "color": "blue"},
   {"id": "b1", "label": "B-1 Frame txs (8141)", "col": 1, "row": 2, "color": "blue"},
   {"id": "b4", "label": "B-4 Knowledge soundness", "col": 2, "row": 0, "color": "blue"},
   {"id": "b5", "label": "B-5 IVC and PCD", "col": 2, "row": 1, "color": "blue"},
   {"id": "top", "label": "8288 and the\nrecursion debate", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "hs", "to": "b3"}, {"from": "zk", "to": "b2"}, {"from": "tx", "to": "b1"},
   {"from": "b3", "to": "b4"}, {"from": "b2", "to": "b5"}, {"from": "b4", "to": "b5"},
   {"from": "b5", "to": "top"}, {"from": "b1", "to": "top"}
 ]}
```

```prereq B-1 l2 3min
# Frame transactions (EIP-8141)
what: A frame transaction splits one tx into several frames, each with a mode. A VERIFY frame validates and approves payment; a SENDER frame executes as the sender. The account writes its own validation logic, so a new signature scheme needs no hard fork. Contracts read other frames of the same tx with `FRAMEPARAM` / `FRAMEDATACOPY`.
why: 8288 adds one new frame mode, mode 4, to 8141. Hegotá includes 8141 but not 8288 [3][5] (E26).
misconception: Myth: 8141 ships PQ signatures. Fact: 8141 gives the framework; the account picks the scheme.
deeper: [3] EIP-8141
```

```prereq B-2 l1 4min
# STARKs and recursive proofs
what: A STARK is a proof system that relies only on hashes and needs no trusted setup. Recursion means one proof verifies one or more other proofs. Many proofs can then merge, layer by layer, into one proof of about the same size.
why: All of 8288's scaling comes from recursion: a mempool node takes other nodes' proofs as input and proves that they are all valid [1] (E13).
example: leanVM 2→1 recursion merges two child proofs into one in 0.291 s; the output is 201.5 KiB and verifies in about 6 ms [14] (C11).
misconception: Myth: recursion just bundles files. Fact: the outer circuit runs the inner verifier, including the inner hash computations.
deeper: [14] leanVM README, "recursion" section
```

```prereq B-3 l1 5min
# The Fiat–Shamir transform and the random oracle model (ROM)
what: In an interactive proof, the verifier sends random challenges. Fiat–Shamir replaces each challenge with a hash of the transcript so far, so the prover can send the proof offline. Security proofs usually treat that hash as an ideal random black box. This is the random oracle model (ROM).
why: leanVM claims ROM/QROM soundness; Aerie proves knowledge soundness in the classical ROM [14][17] (R9, R10). In the ROM, parties can query the hash oracle, but an ordinary circuit has no concrete implementation of it to evaluate. A recursive circuit must compute the inner hash, and Thaler's critique starts here [10].
example: The challenge is $c = H(\text{statement}, \text{transcript})$. The ROM assumes the output of $H$ is fully random; real systems use BLAKE2s or Poseidon2.
misconception: Myth: a ROM proof is a real-world proof. Fact: CGH built signature and encryption schemes that are secure in the ROM and insecure with any concrete hash [24] (R16). Since 2025, similar attacks also hit natural, deployed protocols of the GKR type [28] (R17).
deeper: [27] ePrint 2024/728 §1
```

```prereq B-4 l1 5min
# Knowledge soundness and extractors
what: Soundness only says a false statement cannot pass. Knowledge soundness asks for more: if a prover can make the verifier accept, an "extractor" exists. The extractor can pull the witness, such as the signature itself, out of that prover.
why: Signature aggregation needs knowledge soundness. "A valid signature exists for this key and message" is often simply true; what matters is that the prover has the signature [17]. Under recursion, the extractor must dig down layer by layer, and the cost adds up [25] (R28).
example: In the standard model, a knowledge assumption gives the extractor, and its size grows polynomially per layer: about $n^{c^d}$ after d layers [26] (R29). A straightline extractor reads the prover's hash queries without rerunning it, so it avoids this blowup.
misconception: Myth: a costly extractor means an attack. Fact: it is a loss in the proof technique, not an attack success rate (R29).
deeper: [26] ePrint 2023/1646 §1, §2.1
```

```prereq B-5 l2 3min
# IVC and PCD
what: IVC (incrementally verifiable computation) is a chain: each step proves that the previous step was correct and so is this one. PCD (proof-carrying data) extends this to trees and graphs: parties who do not trust each other each produce proofs, and the proofs merge.
why: The 8288 mempool aggregation tree has the shape of PCD. The "depth" in the recursion-security papers is the height of this tree (R6).
deeper: [26] ePrint 2023/1646
```

## K How EIP-8288 works {depth=2}
**What it is.** The title of EIP-8288 is "In-mempool signature and proof aggregation". Its authors are Vitalik Buterin and Thomas Coratger, and its status is Draft [1] (E1). It was first merged on 2026-09-09 and had 10 commits by 10-15 [2] (E2).

Fig 2 compares "verify each signature in the EVM" with the 8288 approach.

```excalidraw q="Where does 8288 move the cost of signature verification?" read="The top row is today's direct approach: signatures go into the block and every node verifies each one in the EVM. The bottom row is 8288: txs carry only 96 B claims, and the mempool aggregates the signatures recursively. Red is the cost that moves; green is what the whole network still does." takeaway="8288 does not remove verification. Mempool nodes and the builder do the heavy work first; every node then verifies one block proof." kind="Before and after"
{"grid": {"w": 270, "h": 120}, "defaults": {"w": 220, "h": 66, "fontSize": 16},
 "nodes": [
   {"id": "a1", "label": "Precompile path:\nuser signs", "col": 0, "row": 0, "color": "blue"},
   {"id": "a2", "label": "Tx puts a 3–5 KB\nsignature in the block", "col": 1, "row": 0, "color": "red"},
   {"id": "a3", "label": "Every node verifies\neach one in the EVM", "col": 2, "row": 0, "color": "red"},
   {"id": "b1", "label": "8288:\nuser signs", "col": 0, "row": 1, "color": "blue"},
   {"id": "b2", "label": "Tx carries only\na 96 B claim", "col": 1, "row": 1, "color": "green"},
   {"id": "b3", "label": "Mempool aggregates\nrecursively every 1 s", "col": 2, "row": 1, "color": "blue"},
   {"id": "b4", "label": "Network verifies\n1 block STARK", "col": 3, "row": 1, "color": "green"}
 ],
 "edges": [
   {"from": "a1", "to": "a2"}, {"from": "a2", "to": "a3"},
   {"from": "b1", "to": "b2"}, {"from": "b2", "to": "b3"}, {"from": "b3", "to": "b4"}
 ]}
```

**What Alice's tx looks like.** Each claim in a dependency frame is a 96-byte triple `(scheme, data_hash, verification_key_hash)`, with 1–256 triples per frame [1] (E4). For leanSPHINCS, the third field holds the 32-byte public key directly [1] (E5).

```text title="Alice's frame tx (sketch built from spec Test Case 1)"
frame 0  mode=4 dependency frame: (0x10, 32 zero bytes, Alice's leanSPHINCS key)
frame 1  VERIFY: check a dependency exists = (0x10, 32 zero bytes, key in sload(0))
frame 2  SENDER: send 1 ETH to Bob
```

An all-zero `data_hash` means "this tx's signature hash". A tx cannot write its own signature hash into a frame, because that hash covers the frame data. Dependency extraction swaps in the signature hash for proving. The frame bytes do not change, and `FRAMEDATACOPY` still returns zeros, so the VERIFY frame checks for zero bytes. The spec added this rule on 10-15 [1][12] (E8, E9).

Fig 3 shows the full path of this tx from wallet to block.

```uml q="How does Alice's tx get from her wallet into a block, and who verifies what, when?" read="Built from the spec's mempool, FOCIL and block validity sections, simplified to two mempool nodes. In this example, nodes switch to mode 1 after receiving the signatures, and the builder already has the tx bodies; the spec also permits mode 0 rebroadcasts. Charlie's tx is not included, so the builder discards its dependency." takeaway="In this example, raw signatures appear only on the first hop; after that, recursive STARKs travel. Validating nodes never see Alice's signature: they verify one block proof, then run the account logic as usual."
sequenceDiagram
  autonumber
  participant W as Alice wallet
  participant A as Node A
  participant B as Node B
  participant BD as Builder
  participant N as Validating node
  W->>A: mode 0 wrapper: tx + raw signature
  A->>A: verify each signature, merge with Charlie's tx
  A->>A: every 1,000 ms, build recursive STARK P_A
  B->>B: same, build P_B (Bob)
  A->>BD: mode 1 wrapper: tx hashes + P_A
  B->>BD: mode 1 wrapper: tx hashes + P_B
  BD->>BD: pick Alice and Bob, discard Charlie's dependency
  BD->>BD: recurse once more into the block proof
  BD->>N: block (header carries recursive_stark)
  N->>N: recompute the dependency digest from txs, verify STARK
  N->>N: run frame 1: check dependency and key
  N->>N: run frame 2: transfer
```

**What the recursive circuit does.** Below is the spec's own pseudocode. It does four things: verify direct dependencies; verify child proofs with the same `AGGREGATED_VK` and merge their dependencies; remove `discards`; deduplicate and compare with the public input [1] (E13).

```python src=research/references/eip-8288@5a4387b.md lines=168-202 hl=184-191
```

The circuit does not understand txs or blocks; it sees only a flat list of triples [1] (E13). The spec says it passes `AGGREGATED_VK` into the proof "to enable unlimited-depth recursion" [1] (E14).

**How nodes verify a block.** The block header gains a field `recursive_stark = [stark_proof, block_deps_hash]`. The proof carries no dependency list. Validating nodes recompute `block_deps_hash` from the block's txs and verify against the fixed `AGGREGATED_VK` [1] (E11). So a builder cannot include Alice's tx and quietly drop her dependency.

```finding F1 high
# 8288 makes signature checks a block validity condition, not a call inside the EVM
claim: A dependency frame (mode 4) runs no EVM code; it only declares triples that must hold. For a block to be valid, the recursive STARK in its header must prove every dependency of the block (after deduplication). Mempool nodes, FOCIL creators and builders do "exactly the same task": verify inputs, merge, discard, prove again.
evidence: [observed] EIP-8288 sections on dependency frames, block validity and the builder [1] (E3, E11, E13, E21).
implication: Dependencies are visible before EVM execution. The spec's reason: the mempool does not need to run contract code to find a missing proof, and a revert cannot make a dependency disappear.
```

```finding F2 high
# The proof says only "this key signed this hash"; the account decides on authorization
claim: The aggregation circuit only proves that the triples hold. The account must read the dependencies in its VERIFY frame with `FRAMEPARAM` / `FRAMEDATACOPY` and compare the key and `data_hash` itself. The spec's Test Case 1 does exactly this.
evidence: [observed] the spec's execution-visibility section and Test Case 1 [1] (E9). [inferred] binding to authorization is the account code's job (E10).
implication: Account authors cannot skip this step. An attacker's valid signature on "hello" also passes aggregation, but must not give the attacker Alice's rights.
```

```finding F3 high
# One leanSPHINCS dependency costs about 33,000 gas, a flat charge per claim, paid even on revert
claim: The dependency frame's execution gas is 3,000 per leanSPHINCS claim or 30,000 per leanSTARK claim. Each claim, duplicates included, also adds 30,000 to intrinsic gas. One leanSPHINCS claim therefore costs about 33,000 gas, before the fee for its 96 B of data. The first draft added this charge to the block's base fee by the block's total dependency count; on 10-07 the tx became the payer.
evidence: [observed] the Gas Accounting section and commit 9ee171b [1][2] (E23, E25). [inferred] the 33,000 total and the flat, not block-shared, charge (E24).
implication: The spec calls this an "expected cost", not a measurement. "3,000 gas per signature" leaves out most of the charge.
```

```finding F4 high
# The current draft accepts only leanSPHINCS; key constants and the reference implementation are TBD
claim: Every dependency's scheme must be `LEANSPHINCS_SCHEME` (0x10). The spec reserves `LEANSTARK_SCHEME` (0x11): a frame that uses it stays invalid until the spec defines `get_deps_hash` for it. `AGGREGATED_VK`, `DEPS_HASH` and the reference implementation all read TBD. 8288 is not in any Hegotá list.
evidence: [observed] constants table, validity constraints and Reference Implementation [1] (E6, E15); EIP-8081 [5] (E26).
implication: Today 8288 can natively aggregate only one hash-based signature scheme. The "any signature or proof" half has no spec yet.
```

## L Mempool recursion: do the supporters' claims hold? {depth=2}
**What each node does.** Every 1,000 ms, a node builds one mode 1 wrapper that covers every still-valid tx and forwards it to peers; txs it already sent travel as hashes only [1] (E18). When proving time runs short, the node uses this order [1]:
1. its own aggregate from the previous round;
2. items it must remove;
3. other nodes' aggregates (by the number of new txs they add);
4. user txs (by priority fee).

Fig 4 draws one aggregation tree for Alice, Bob and Charlie.

```excalidraw q="How do three txs' signatures become one block proof in the mempool?" read="The top row is raw signatures (mode 0). The middle row is each node's recursive proof (mode 1). The bottom is the builder's block proof. Yellow is the discarded dependency." takeaway="The block proof covers only the included txs. Discarding Charlie does not make the block invalid, because the final digest must match the txs in the block." kind="Aggregation tree"
{"grid": {"w": 250, "h": 125}, "defaults": {"w": 200, "h": 62, "fontSize": 16},
 "nodes": [
   {"id": "al", "label": "Alice signature", "col": 0, "row": 0, "color": "blue"},
   {"id": "ch", "label": "Charlie signature", "col": 1, "row": 0, "color": "yellow"},
   {"id": "bo", "label": "Bob signature", "col": 2, "row": 0, "color": "blue"},
   {"id": "pa", "label": "Node A: P_A\n(Alice, Charlie)", "col": 0, "row": 1, "dx": 125, "color": "blue"},
   {"id": "pb", "label": "Node B: P_B\n(Bob)", "col": 2, "row": 1, "color": "blue"},
   {"id": "blk", "label": "Builder: block proof\n(Alice, Bob)", "col": 1, "row": 2, "dx": 60, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "al", "to": "pa"}, {"from": "ch", "to": "pa"}, {"from": "bo", "to": "pb"},
   {"from": "pa", "to": "blk", "label": "drop Charlie"}, {"from": "pb", "to": "blk"}
 ]}
```

**decentrek's five claims, premise by premise.** decentrek argues that with 8288, more nodes means more signatures processed, while the network stays decentralized [8][9] (E39).

| Claim | Basis in the spec | What it needs to hold | Verdict |
|---|---|---|---|
| Proof bandwidth per node is constant | spec says "constant per peer"; about 256 kB per interval for the builder | tx bodies still go out once; dependency lists and tx hashes in each wrapper grow with tx count | warn holds for the proof part only |
| The builder is no longer the bottleneck | the builder does the same task as mempool nodes | the builder still merges and proves again within the slot; no cost data for many child proofs | warn not measured |
| More nodes, more capacity | every node aggregates "all currently active transactions" | the spec gives no work split and no incentives; one node's throughput is limited | no no mechanism |
| Validators verify one proof | block validity rules | relies on the soundness of leanVM and recursion | ok holds |
| Any scheme via STARK wrapping | the Rationale describes this path | leanSTARK is invalid today; no ISA chosen | no not possible yet |

```finding F5 medium
# "Constant proof bandwidth" holds only for the proof itself
claim: The spec says recursive STARK bandwidth is "constant per peer, regardless of the number of transactions", without a derivation. Tx bodies still go across the network once. Each wrapper carries the deduplicated dependency list (96 B per entry) and a list of tx hashes. The first hop, in mode 0, also carries raw signatures or STARKs.
evidence: [observed] the spec's Censorship Resistance section and wrapper encoding [1] (E17, E18); Vitalik's post: "plus each transaction getting broadcasted through the network once" [6] (E29). [inferred] the parts that grow linearly with tx count (E40).
implication: Count bandwidth in two parts: the proof is constant; txs and dependency lists are not.
```

```finding F6 high
# "More nodes, more capacity" lacks a work split, incentives and throughput data, and the mode 1 cap conflicts with it
claim: The spec has every node aggregate the whole active pool, with no split of work across nodes and no proving incentive anywhere. It caps a mode 1 wrapper at ≤ 16 leanSPHINCS and ≤ 1 leanSTARK dependencies. It also requires "exactly one wrapper containing all currently active transactions" per round. Read literally, the two rules conflict. EIP-8292's consensus-layer benchmark aggregates 1,000 signatures in about 11 / 3.7 / 2.6 s on 2 / 8 / 16 cores. All three exceed the 1,000 ms interval. These are single-message XMSS consensus-layer numbers, not a benchmark of 8288's leanSPHINCS mempool loop; they only show a hardware constraint.
evidence: [observed] spec L251, L259, L263 and full text [1] (E18, E19); EIP-8292 benchmark [4] (E42). [inferred] the conflict and the missing mechanism (E20, E41). [speculative] "tens of thousands of PQ and private txs per second" has no primary source (E43).
implication: The 16 cap may be a typo or may mean something else; neither the spec nor the forum thread says. Until the authors clarify it, the 8288 draft cannot support a "mempool scaling" argument.
```

```finding F7 medium
# The block proof shows "included dependencies are valid", not "valid txs that arrived were included"
claim: In the Ethereum Magicians thread, several participants point out that the aggregate proof shows the included dependencies are valid. It does not show that the builder left out no valid dependency it received. For this, 8288 changes the FOCIL data structure so inclusion lists also carry a recursive proof, and attesters must verify it. FOCIL is already scheduled for Hegotá, so 8288 would change a live format.
evidence: [observed] Magicians posts 3, 8 and 11 [11] (E37); the spec's FOCIL section [1] (E22); EIP-8081 [5] (E26).
implication: The proof gives correctness. Censorship resistance still depends on inclusion-list rules. Judge the two separately.
```

## M How far the vision is from the draft {depth=2}
Vitalik's two posts describe where 8288 should end up [6][7]. The table checks each point against the spec.

| Vitalik's claim | Spec today | Verdict |
|---|---|---|
| "SPHINCS-" signatures of about 3 kB stay off-chain | the native scheme is leanSPHINCS; SPHINCS- is a separate keccak-based scheme; the user must first wrap it client-side in a STARK | names mixed up |
| Private txs fall from about 10M gas to "low tens of thousands" | needs leanSTARK, invalid today; 60,000 gas per claim at current pricing | vision |
| Falcon, ML-DSA etc.: "wrap it client-side in a STARK" | the spec agrees with this path, but leanSTARK is invalid, the VK is only a hash, and nobody has chosen an ISA | vision |
| Private AA | not mentioned anywhere in the spec | vision |
| A tick of about 500 ms | the spec uses 1,000 ms | numbers differ |
| On-chain cost: one STARK (100–300 kB) + 96 B per claim | header field + 96 B triples; about 256 kB per interval for the builder | consistent |
| Ethereum must agree on an ISA, RISC-V preferred | not in the spec; leanVM plans to move from leanISA to rv64im | open |
| 10-19: "EIP-8288 maximalism", no more precompiles | not in the spec | opinion |

Sources: the posts and the spec [1][6][7][13][14] (E29–E34, C13).

**The ISA debate.** An ethresear.ch post of 10-08 argues that identifying a user's proof by `vk_hash` is only a placeholder. The proof system's VK changes whenever leanVM upgrades, which would break non-upgradable privacy pools. It proposes replacing 0x11 with a program scheme whose third field is `program_id = hash(ISA version, program bytes)` [12] (E38). The author also says there is not yet enough data to decide.

```finding F8 high
# "Wrap any signature or proof client-side in a STARK" does not work in the current draft
claim: This path needs leanSTARK dependencies, which the spec reserves. The VK is only a hash with no registry, and nobody has chosen an ISA. A third-party experiment (ERC-8403) reports that leanVM's recursion guest today verifies only raw signatures and its own proofs, not proofs of other programs. We found no primary benchmark for proving Falcon, ML-DSA or privacy circuits with leanVM on a phone.
evidence: [observed] the spec [1] (E6); the ISA post [12] (E38); the ERC-8403 post [33] (R43). [inferred] not usable today (E33). [speculative] client-side proving cost (E35).
implication: Vitalik's "never need to add more precompiles again" is a direction, not today's state. Today only leanSPHINCS gets native aggregation.
```

## N AggLayer: what is similar, what is not {depth=2}
**What AggLayer is.** AggLayer connects many chains through one unified bridge. Its core component is the [[pessimistic proof]]. It assumes any connected chain can fail. So for each cross-chain state update, it proves that the chain took out no more than its balance in the bridge [20] (G13, G14). Pessimistic proofs have run on mainnet since 2025-02-03 [21] (G36).

Fig 5 shows how one certificate gets from a chain to L1.

```uml q="How does an AggLayer certificate become an L1 settlement, and where does one proof verify another?" read="Built from agglayer @9f8e6c4 source and Polygon docs. The middle subgraph is what happens inside the SP1 program." takeaway="In the inspected PP application, a proof verifies another proof in one place only: the PP program verifies the chain's aggchain proof (SP1's internal recursion not counted). Each certificate then goes to L1 on its own, with no cross-chain merge."
flowchart TB
  chain["Connected chain (AggSender)<br/>submits certificate: bridge exits + auth"] --> node["AggLayer node<br/>runs it in native Rust first"]
  node --> sp1
  subgraph sp1["SP1 Prover Network: PP program"]
    direction TB
    pp["update the three trees<br/>balance must not underflow"] --> auth{"auth mode"}
    auth -- "ECDSA / multisig" --> sig["ECDSA address recovery"]
    auth -- "multisig + aggchain proof" --> rec["verify_sp1_proof<br/>(aggchain_vkey, public values hash)"]
  end
  sp1 --> wrap["PLONK wrap (BN254)"]
  wrap --> l1["L1: AgglayerManager<br/>only the trusted aggregator can submit"]
```

```finding F9 high
# The similarity is real: the PP program verifies another SP1 proof inside SP1
claim: `AggchainProof::verify_aggchain_proof` first assembles public values (previous and new local exit roots, L1 info root, network ID, aggchain params, and a commitment to imported bridge exits). It then calls `sp1_zkvm::lib::verify::verify_sp1_proof(&self.aggchain_vkey, &public_values.hash())`. The outer proof treats verifying the inner proof as part of its own computation.
evidence: [observed] agglayer/crates/pessimistic-proof-core/src/aggchain_data/aggchain_proof.rs:L21-38@9f8e6c4 [18] (G1, G2); SP1 Proof Aggregation docs [22].
implication: "AggLayer also uses recursion" is true at the primitive level. But the application fixes this one layer of composition, and the aggchain proof appears only in the "multisig + aggchain proof" mode (G3, G4).
```

```finding F10 high
# The differences are larger: per-certificate settlement, a trusted aggregator, not PQ end to end
claim: The node builds one `verifyPessimisticTrustedAggregator(rollupID, …)` tx per certificate; the source has no path that merges several chains' certificates into one L1 proof. Only `TRUSTED_AGGREGATOR_ROLE` can call that function. The on-chain proof is SP1's PLONK wrap over BN254, and chain authentication uses secp256k1 ECDSA. SP1 Hypercube's memory argument also relies on an elliptic-curve discrete log assumption.
evidence: [observed] certificate_task.rs:L379-446@9f8e6c4 [18] (G15); AgglayerManager.sol [19] (G18, G21); SP1 Security Model [23] (G22, G25). [inferred] no single cross-chain proof (G16); liveness and censorship resistance depend on the trusted aggregator (G19); not PQ end to end (G26).
implication: AggLayer proves cross-chain ledger constraints, not tx signature aggregation. It neither shows that 8288 is safe nor is it a PQ design.
```

**Full comparison.** The table compares the two on six more dimensions (G30–G38).

| Dimension | EIP-8288 | AggLayer |
|---|---|---|
| Goal | stop putting each signature and STARK on-chain | a compromised chain loses at most its own deposits |
| Leaf objects | `(scheme, data_hash, vk_hash)` + witness | one certificate's state transition + chain auth |
| Merge semantics | union, dedupe, discard; the circuit does not understand txs | state continuity, no balance underflow, no reused nullifier |
| Recursion assumption | spec says "widely believed" and admits it is hard to formalize | SP1 assumes more recursion steps lose no security, and bounds circuit depth to avoid the 2025/118 attack |
| Trust and liveness | permissionless mempool + builder + FOCIL | one trusted aggregator role; proving outsourced to the Succinct network |
| Maturity | Draft, reference implementation TBD | live on mainnet; README still says it is under audit |

**Who else merges many proofs into one.** The table lists three production systems (G40).

| Project | Approach | Difference from 8288 |
|---|---|---|
| Aligned aggregation service | the service aggregates submitted proofs recursively and verifies on Ethereum | a central service, not a block validity rule |
| NEBRA UPA | one permissioned aggregator batches Groth16 proofs | one aggregator; no discard semantics |
| Starknet SHARP | pairwise recursive merges, then a Solidity verifier | run by StarkWare; its "applicative recursion" is closer to AggLayer |

Among the systems we compared, none writes recursive aggregation into L1 block validity with permissionless mempool nodes doing the work. We compared few systems, so this point is only speculative (G41).

## O The recursion security debate {depth=2}
**Who is critiquing.** Justin Thaler is a Research Partner at a16z crypto research and an associate professor at Georgetown. He is also a co-author of the Aerie paper [10][17] (R1, R2). He is critiquing the approach that competes with his own, and readers should know this. His X handle @SuccinctJT is not related to Succinct, the company behind SP1 (C7).

His core sentence: "hash-only is not really hash-only: it rests on hashes plus the soundness of deep SNARK recursion" [10] (C4). In the same post he calls block-level aggregation "a powerful design independent of the hash-only vs. lattice debate". He does not oppose it [10] (C5).

Fig 6 splits the recursion debate into "model → result".

```excalidraw q="What do we know about recursive proof security under each analysis model?" read="The top row is the two things being proven. The bottom row is three kinds of analysis and their results. Red means no proof or a known attack; blue means a conditional positive result." takeaway="A single-layer Fiat–Shamir proof has a ROM security proof. Once recursion must compute the hash inside a circuit, the plain ROM no longer applies. Idealized models give positive results; concrete hashes have attacks, but the ones reviewed need the attacker to choose the proved computation." kind="Model and result"
{"grid": {"w": 300, "h": 135}, "defaults": {"w": 250, "h": 70, "fontSize": 16},
 "nodes": [
   {"id": "s1", "label": "Single-layer STARK\nhas a ROM proof", "col": 0, "row": 0, "dx": 150, "color": "green"},
   {"id": "s2", "label": "Recursion: circuit\nrecomputes inner FS hash", "col": 1, "row": 0, "dx": 150, "color": "yellow"},
   {"id": "m1", "label": "Succinct, plain ROM:\nno known proof", "col": 0, "row": 1, "color": "red"},
   {"id": "m2", "label": "Idealized models:\nnear-zero loss (heuristic)", "col": 1, "row": 1, "color": "blue"},
   {"id": "m3", "label": "Concrete hash: attacks\npick the computation", "col": 2, "row": 1, "color": "red"}
 ],
 "edges": [
   {"from": "s1", "to": "s2"},
   {"from": "s2", "to": "m1"}, {"from": "s2", "to": "m2"}, {"from": "s2", "to": "m3"}
 ]}
```

**Point by point.** The table puts Thaler's points next to the strongest rebuttal (R3–R66).

| Point | Evidence | Strongest rebuttal | Strength |
|---|---|---|---|
| A: hash-only also rests on recursion soundness | 8288 lists it as trust assumption 3 | recursive STARKs have run on-chain for years | ok strong |
| A': Aerie covers a slot on one machine, no recursion | author benchmark: 645 ms for 32,768 signatures | counts proving time only, not signature collection | warn medium |
| B: recursion security cannot be established in the ROM | 2024/728: relativized succinct arguments do not exist in the ROM | the same paper says non-relativized IVC/PCD is still open | warn medium-strong, worded too strongly (impossibility not proven) |
| B': practical Fiat–Shamir attacks exist | KRS 2025/118, Fenzi 2026/1838 | the attacks reviewed need the attacker to choose the proved computation; targets are GKR-style protocols and IOPs for program-generated instances | ok strong, but none of this kind found against fixed-circuit STARK recursion |
| C: extractor cost grows with depth; 8288 allows unlimited depth | BCCT13; 2023/1646 §1: loss "exponential in the recursion depth"; 8288 text | the blowup is a proof loss, not an attack | ok strong |
| D: idealized proofs only say an attack must use the concrete hash | 2023/1646 §2.3: an attack either reduces to the idealized model or exploits the concrete hash, and the latter is open | the authors call this "partial evidence" for current parameters | ok matches the source |
| E: no known attack on recursion; AI will speed up cryptanalysis | Thaler's own words | — | first half strong, second speculative |
| F: leanVM is not general purpose; binary-field SNARKs are slow at proving lattice arithmetic | README says "minimal" | leanVM plans to move to RISC-V | first half strong; second is Thaler's claim with no comparable benchmark checked (speculative) |
| G: privacy chains need PKE; Thaler says hashes alone cannot provide it black-box | Thaler's own words | lattices can live inside an app-level STARK | technical premise not checked here (speculative); the system-level conclusion is a judgment |

Of the three authors of the KRS attack paper, two list Ethereum Foundation and one lists Succinct [28] (R20). 2023/1646 has a StarkWare co-author, and its §2.4 analyzes exactly the recursive STARK where users submit any program with unbounded depth [26] (R50). 2025/1663 has two EF authors [29] (R33). Framing the debate as "Ethereum ignores the problem and a16z exposes it" does not match who did the research.

```finding F11 high
# The theory gap is real, and texts on the Ethereum side admit it
claim: ePrint 2024/728 proves that relativized succinct arguments do not exist in the plain ROM. These are arguments that can prove computations which query the oracle. Building IVC/PCD that way is therefore ruled out. BCCT13 shows that standard proofs based on recursive extraction hold for a constant number of compositions only. 8288 lists "Soundness of recursive STARKs" as a trust assumption and says it "adds difficulty to end-to-end formally proving". leanerVM, the leanVM formal-verification project, lists recursive extraction (T6) as an open research question and notes that leanVM has no decreasing recursion-depth measure.
evidence: [observed] ePrint 2024/728 abstract and §1 [27] (R25); BCCT13 [25] (R28); EIP-8288 Trust Assumptions [1] (R3, R4); leanerVM docs @28bbeb9 [15] (R34, R35). [inferred] both sides admit the gap (R37).
implication: "Hash-only" does leave out one assumption: the soundness of recursive Fiat–Shamir proofs. Today that assumption is "widely believed", not proven.
```

```finding F12 high
# Thaler's claim is broadly supported, but "cannot be established" is not the same as "proven impossible"
claim: The authors of 2024/728 write that ruling out standard (non-relativized) IVC and PCD in the ROM remains open. On the other side, 2023/1646 proves that if the base SNARK has straightline knowledge soundness, PCD is about as secure as the base. But the object it proves rigorously is a non-succinct version that attaches the hash queries and answers to the proof. Applying it to real recursive STARKs is a heuristic step; the authors call it "partial evidence". 2025/1663 proves security at polynomial depth in the osROM, but it analyzes HyperNova, which uses elliptic curves. Arc and WARP prove hash-based accumulation schemes secure in the ROM. But the step to PCD still evaluates the oracle inside a circuit, which needs a heuristic.
evidence: [observed] 2024/728 §1 [27] (R26); 2023/1646 Thm 1, §2.3 [26] (R30, R31, R49); 2025/1663 abstract and §1 [29] (R32, R33); WARP Thm 1 and p.63 [38] (R65). [inferred] Thaler's wording is too strong (R27); accumulation-to-PCD still needs a heuristic (R66).
implication: The positive results have different scopes: 2023/1646 proves a non-succinct recursive construction secure in the ROM, while osROM results use a stronger oracle model. Applying them to practical succinct hash-based recursion still needs an extra heuristic. A loose reduction does not mean an easy attack, and "no attack found" does not replace a reduction.
```

```finding F13 high
# The reviewed KRS/Fenzi-style attacks require attacker-chosen computation; 8288 restricts transaction dependencies, but the tree-wide restriction remains unresolved
claim: For GKR with any multilinear polynomial commitment scheme and any concrete hash, KRS builds a circuit that proves a false statement. The key is that the circuit computes its own Fiat–Shamir challenge. Fenzi extends the attack to IOPs for program-generated instances, including Aurora/STIR-type hash IOPs. The condition: Fiat–Shamir hashes only the program. We found no published attack of this kind against a fixed-circuit STARK or a recursive verifier. Today's 8288 transaction rules accept only leanSPHINCS, so user-program proofs are not an enabled feature. But the aggregation pseudocode keeps a leanSTARK branch (VK from the witness) and discards. Whether the tree also excludes arbitrary programs awaits the final circuit (R67). The spec also admits user VKs may recurse without a depth bound.
evidence: [observed] ePrint 2025/118 Thm 1, 2, 9 and §5 [28] (R17, R19, R20, R51–R54); 2026/1838 Thm 2, §7 [30] (R18, R21, R22, R55); EIP-8288 [1] (R7, E14); Thaler: "we don't know of any outright attacks on SNARK recursion" [10] (R38). [inferred] the attacks need the attacker to choose the proved computation; tx rules do not allow that today; the circuit's leanSTARK branch awaits confirmation; no exploitable flaw found (R8, R24, R39, R67).
implication: Opening `LEANSTARK_SCHEME` would introduce attacker-chosen programs. Whether Fenzi's attack applies depends on how the proof system generates and binds the proved relation (R56). In the generated-relation setting that paper analyzes, hashing the generated statement into the first challenge reduces soundness to that of the underlying protocol. Whether leanVM does this is a concrete audit item; we found no public analysis of it.
```

```finding F14 medium
# Aerie also relies on the random oracle model; the real difference is whether the circuit must prove a hash
claim: Aerie proves knowledge soundness in the classical ROM and also uses Fiat–Shamir. The verifier computes HashToPoint outside the proof, so the proved computation does not evaluate HashToPoint and does not recurse. The common-salt mode assumes a "fixed-target signer" is unforgeable (Assumption C.8); the authors know of no attack. The theorem holds in the classical ROM; the main text has no QROM analysis. Akita's parameter estimates leave out the paper's own extraction loss. Aerie is a research release; leanVM also says it is "not (yet) production ready".
evidence: [observed] Aerie paper Def 5.6, Thm 5.9, §3.2, §6.3 and README [17] (R10, R11, R14, R15, R57, R58, R60); leanVM README [14] (R9). [inferred] the difference is whether the circuit proves the FS hash (R12, C9).
implication: The first half of Thaler's point B ("all PQ SNARKs rely on the ROM") also covers Aerie. Aerie currently cannot merge independently produced aggregates. For a leanVM-style distributed design, its authors name two possible extensions: a way to merge Aerie proofs, or a recursive verifier for them; the second "reintroduces the heuristic step". Collecting raw signatures at one prover does not itself need recursion. The debate centers on one assumption, recursion, not on whether hashes or lattices are safer.
```

```finding F15 medium
# In practice, recursive aggregation has already shipped implementation bugs
claim: ZisK v1.3.2-alpha fixed a recursive-aggregation flaw. A prover could mark every child proof as null and skip the STARK checks. A final proof was then accepted for execution that was never proven. In SP1 before v3.0.0, the recursion circuit did not add the permutation argument's cumulative sum to the transcript before sampling a challenge. The advisory calls exploiting it "practically infeasible".
evidence: [observed] ZisK release notes GHSA-3j5v-j2rm-9c5f [32] (R40); SP1 [GHSA-8m24-3cfx-9fjw](https://github.com/advisories/GHSA-8m24-3cfx-9fjw) (GitHub Advisory) (R48). [inferred] these are implementation errors, not attacks on recursion theory (R41).
implication: Recursion risk is not only theoretical. Recursive circuits, empty child proofs and challenge binding are all audit priorities.
```

**Open points.** Matthew Green raises a possibility in his post on KRS [35]. In a multi-program recursion tree, one malicious program's "bugdoor" might cross program boundaries and break the whole tree. For GKR-style protocols, KRS Theorem 2 already builds a single circuit that keeps its function yet proves any output (R52). Breaking a whole multi-program tree still has no known construction (R47, speculative). As of 10-21, we found no substantive public response to Thaler's post from EF, StarkWare or leanEthereum researchers (C10, speculative).

## P How to evaluate designs like this {depth=2}
This checklist follows from the research. It is not advice to any project.

```callout info Seven questions for any recursive-aggregation design
1. **Is recursion depth bounded?** 8288: no. leanVM has no decreasing depth measure (R6, R35).
2. **Can an attacker put a chosen program into the recursion tree?** 8288's tx rules do not allow it today; whether the circuit also excludes it awaits the final circuit; after leanSTARK opens: yes (R8, R67, F13).
3. **Under which model are the security bits computed?** ROM or QROM, one layer or with recursion (E44, E45, R9).
4. **Is the final verification path quantum-resistant end to end?** An inner STARK with an outer BN254 wrap is not (G26).
5. **Who pays for proving, and who can censor?** 8288 has no proving incentive; in AggLayer, a trusted aggregator submits settlements (E41, G19).
6. **Does it prove "everything included is valid", or also "nothing valid was left out"?** (E37)
7. **If the system uses a program-generated relation, does the first Fiat–Shamir challenge hash the generated statement?** This is Fenzi's provable mitigation (R22, R56).
```

**On the two positions (inferred).**
- The 8288 side: making dependencies explicit and sharing the proving across the network is a design contribution that stands apart from "hash vs lattice"; even the critic accepts it (C8). But "hash-only" needs the addition "plus the soundness of recursive Fiat–Shamir proofs" (R37).
- The a16z side: the theory gap it points to is real (F11). But "cannot be established" overstates the theorem, and there is no concrete attack on 8288 yet (F12, F13). Aerie also relies on the ROM and is not production-ready either (F14).
- Both sides call for cryptographic agility: Thaler argues for hybrid signatures and defense in depth, and says his team builds both lattice-Jolt and hash-Jolt (C6).

## Q Limits and open questions {depth=2}
- **No reproduction**: all benchmarks are self-reported by their authors; we ran none.
- **Depth of the paper check**: ePrint returned 403 to our machine, so we took the full text from Internet Archive snapshots of the same URLs. We checked main theorems, introductions and the authors' discussion, not every line of the long proof appendices. We checked Brzuska–Hubáček–Kalsta (PKC 2026) and Arc at abstract level only.
- **leanVM's Fiat–Shamir binding**: we did not read the source to see whether the first challenge hashes the generated statement (R56).
- **The mode 1 cap of 16**: a typo or intended? Neither the spec nor the forum thread says (E19, E20).
- **Per-node throughput**: we found no data on how many leanSPHINCS signatures normal hardware proves per 1,000 ms. We also found no cost curve for a builder that merges N child proofs.
- **Conflicting security numbers**: the leanVM README says 128 / 64 bits; EIP-8292 says about 124 / 62 bits (E45).
- **Recursion under QROM**: the README does not say whether leanVM's 64-bit QROM figure is for one layer or includes recursion.
- **AggLayer mainnet roles**: we did not check on-chain who holds the trusted aggregator and upgrade roles, or whether a timelock applies.
- **Source of "AggLayer does something similar"**: not found (G42).
- **Responses**: as of 10-21 we found no substantive response to Thaler's post (C10).

## R Method and evidence {depth=3}
**Method.** Three parallel research lanes: EIP-8288 mechanism and supporters' claims (E), AggLayer and other aggregation designs (G), recursion security (R). The main session added post timelines and benchmark rows (C). We traced every claim to a primary source:
- EIP text, commit history, and the Ethereum Magicians and ethresear.ch threads;
- agglayer source and L1 contract, Polygon and SP1 docs;
- leanVM and Aerie repos and the leanerVM formal-verification docs;
- the full text of 9 papers (ePrint via Internet Archive snapshots; Aerie from the LayerZero-hosted PDF), plus 2 papers at abstract level;
- the original text of four posts on X (fetched with UTC times through the fxtwitter API).

The ledger has 166 rows (observed 127 / inferred 29 / speculative 10); lane notes are in `research/notes-*.md`, and the full-text paper review is in `notes-papers.md`. The recursion lane failed once on a connection error and finished after a relaunch.

**Pinned versions.**
- ethereum/EIPs @`5a4387b` (eip-8288.md last changed in `72ca2dd`, 2026-10-15).
- agglayer/agglayer @`9f8e6c4` (2026-10-19); AgglayerManager.sol @`1c00e15`.
- leanEthereum/leanVM @`3a37fb6`; a16z/aerie @`49b6c21`; leanerVM docs @`28bbeb9`.

**Main-session spot checks.** E19, G1, G17, G23, G25, G28, G29, R26, R34 and R35 match their sources. On 2026-10-21 we rechecked the paper-based R rows (R16–R33, R49–R66) against full text; theorems and pages are in `notes-papers.md`.

**Corrections to the external research (GPT).**
- We have the posts' original text; the external research said it could not read them.
- It missed the 16-signature cap on mode 1 wrappers and its conflict with "covers every active tx" (E19, E20).
- 33,000 gas is right, but the 30,000 part is a flat charge per claim at `LEANSTARK_VERIFICATION_GAS` (E24, E25).
- It missed the October revisions: mode 3→4, leanSTARK made reserved, the mode 1 union check, the zero `data_hash` (E2–E8, E17).
- AggLayer: settlement is per certificate with no single cross-chain proof; the outer proof is PLONK; it missed the trusted aggregator; SP1 Hypercube's memory argument has an elliptic-curve assumption, so even "the inner STARK is PQ" fails (G15, G16, G18, G21, G25).
- 2025/1663 (osROM) analyzes HyperNova and does not endorse recursive STARKs; 2024/728 itself says non-relativized IVC/PCD is open (R26, R32).
- It missed that leanerVM lists recursive extraction as an open problem (R34).

## S Reproduce {depth=3}
```bash title="Check EIP-8288 constants, the mode 1 cap and the trust assumptions"
curl -sL https://raw.githubusercontent.com/ethereum/EIPs/5a4387b9574508c1d1f70ad9ce079e92478f2e45/EIPS/eip-8288.md -o eip-8288.md
grep -n "DEP_VERIFY_FRAME_MODE\|LEANSTARK_SCHEME\|AGGREGATED_VK\|MAX_LEANSIG" eip-8288.md
# expect: mode 4; 0x11 reserved; AGGREGATED_VK TBD; MAX_LEANSIG_DEPS_PER_WRAPPER 16
grep -n "exactly one wrapper\|unlimited-depth\|Soundness of recursive" eip-8288.md
# expect: L263, L217, L523
```

```bash title="Check AggLayer's proof-in-proof and per-certificate settlement"
git clone https://github.com/agglayer/agglayer && cd agglayer && git checkout 9f8e6c4eb82b782c63954e087908c7a2ba45e226
sed -n 21,38p crates/pessimistic-proof-core/src/aggchain_data/aggchain_proof.rs
# expect: sp1_zkvm::lib::verify::verify_sp1_proof(&self.aggchain_vkey, ...)
grep -n "verifyPessimisticTrustedAggregator" crates/agglayer-certificate-orchestrator/src/certificate_task.rs
```

```bash title="Fetch post text and times"
curl -s https://api.fxtwitter.com/SuccinctJT/status/2112706944548880442 | jq -r .tweet.text
curl -s https://api.fxtwitter.com/VitalikButerin/status/2097711433073172837 | jq -r .tweet.created_at
```

## T Glossary {depth=2}
```glossary
dependency frame | dependency verification frame, mode 4 | The frame 8288 adds; it holds only 96 B triple claims and runs no code. | does not decide authorization for the account
frame transaction | EIP-8141 | A tx split into validation, execution and other frames; the account sets its own validation rules. | carries no PQ signature by itself
triple | (scheme, data_hash, verification_key_hash) | One dependency: under a scheme, a data hash holds for a public key or VK. | not the signature itself
wrapper | "envelope" in the posts | The network-level bundle: mode 0 carries raw signatures, mode 1 carries one recursive STARK. | not a transaction
recursive STARK | — | A STARK that verifies other STARKs, merging many proofs into one. | not file bundling
AGGREGATED_VK | — | The protocol's fixed verification key for the aggregation circuit; TBD today. | not a user VK
DEPS_HASH | — | The hash that compresses the dependency list to a 32 B digest; BLAKE2s in current tooling. | excludes the scheme byte
leanSPHINCS | — | A stateless hash-based signature for the execution layer; the only scheme 8288 accepts today. | not SPHINCS-
SPHINCS- | SPHINCS minus | A separate keccak-based stateless scheme; it must be wrapped in a STARK to use 8288. | not leanSPHINCS
leanVM | — | Lean Ethereum's minimal hash-based zkVM for signature aggregation and recursion; not production-ready by its own account. | not a general zkEVM
leanerVM | — | The formal-verification project for leanVM. | not another VM
FOCIL | EIP-7805 | Fork-choice enforced inclusion lists, for censorship resistance. | 8288 changes its format
ISA | instruction set architecture | The instruction set user programs run in a zkVM, for example RISC-V. | not the proof system
Fiat–Shamir | FS transform | Replaces the verifier's random challenges with hashes, making a proof non-interactive. | not a signature scheme
random oracle model | ROM | An analysis model that treats a hash as an ideal random black box. | not a real hash
QROM | quantum ROM | A model where the attacker can query the hash in quantum superposition. | a stronger requirement than the ROM
knowledge soundness | — | Any prover that makes the verifier accept must "know" a witness. | stronger than plain soundness
extractor | — | An algorithm that pulls the witness out of a prover; used to define knowledge soundness. | not an attacker
straightline extraction | — | Extraction that reads the prover's oracle queries without rewinding. | usually holds only in idealized models
relativized argument | — | An argument system for computations that query the oracle. | 2024/728 shows no succinct one exists in the ROM
IVC | incrementally verifiable computation | A chain of proofs, each showing the previous step was correct. | not all of PCD
PCD | proof-carrying data | Several parties produce proofs on a tree or graph and merge them. | the 8288 aggregation tree has this shape
KRS attack | ePrint 2025/118 | Makes a circuit compute its own FS challenge so it can prove a false statement. | not seen against STARK recursion
pessimistic proof | PP | AggLayer's proof that a chain takes out no more than its bridge balance. | does not prove the chain's own txs are correct
aggchain proof | — | A chain-defined proof that the PP program verifies inside SP1. | appears only in multisig mode
trusted aggregator | TRUSTED_AGGREGATOR_ROLE | The only L1 role that can submit AggLayer settlements. | controls liveness, not correctness
PLONK wrap | STARK→SNARK wrap | Re-proves a STARK as a small SNARK over BN254 so L1 can verify it cheaply. | not quantum-resistant
```

## U References {depth=2}
1. [EIP-8288: In-mempool signature and proof aggregation](https://eips.ethereum.org/EIPS/eip-8288) (local copy @5a4387b; file last changed 72ca2dd) — dependency frames, recursive circuit, wrappers, gas, trust assumptions. **PRIMARY**
2. [eip-8288.md commit history](https://github.com/ethereum/EIPs/commits/master/EIPS/eip-8288.md) — 10 commits and what each changed. **PRIMARY**
3. [EIP-8141: Frame Transaction](https://eips.ethereum.org/EIPS/eip-8141) — frame modes, introspection opcodes, signature hash. **PRIMARY**
4. [EIP-8292: Post-Quantum Attestation Aggregators](https://eips.ethereum.org/EIPS/eip-8292) — consensus-layer aggregation benchmarks, about 124 / 62-bit security. **PRIMARY**
5. [EIP-8081: Hegotá meta](https://eips.ethereum.org/EIPS/eip-8081) — 8141 scheduled, 8288 not listed. **PRIMARY**
6. [Vitalik, 2026-09-09: A note on recursive STARK mempools](https://x.com/VitalikButerin/status/2097711433073172837) — the 8288 vision and numbers. **PRIMARY**
7. [Vitalik, 2026-10-19: EIP-8288 maximalism](https://x.com/VitalikButerin/status/2112032009413439704) — no more new precompiles. **PRIMARY**
8. [decentrek, 2026-09-11](https://x.com/decentrek/status/2098392867773509799) — "a fourth scaling dimension". **PRIMARY**
9. [decentrek, 2026-10-20](https://x.com/decentrek/status/2112535053188145367) — five claims and the animation. **PRIMARY**
10. [Justin Thaler, 2026-10-21](https://x.com/SuccinctJT/status/2112706944548880442) — the original critique of recursion. **PRIMARY**
11. [Ethereum Magicians: EIP-8288 thread](https://ethereum-magicians.org/t/eip-8288-frame-type-for-pq-sig-and-stark-aggregation/28723) — Vitalik's "purely hash-based", omission accountability, the mode 1 bug report. **PRIMARY**
12. [ethresear.ch: Exposing an ISA for post-quantum proofs on Ethereum](https://ethresear.ch/t/exposing-an-isa-for-post-quantum-proofs-on-ethereum/26136) — the program-scheme proposal. **PRIMARY**
13. [ethresear.ch: SPHINCS minus](https://ethresear.ch/t/sphincs-minus-efficient-stateless-post-quantum-signature-verification-on-the-evm/25165) — SPHINCS- vs leanSPHINCS. **PRIMARY**
14. [leanEthereum/leanVM README](https://github.com/leanEthereum/leanVM) (@3a37fb6) — scope, security claims, benchmarks. **PRIMARY**
15. [Verified-zkEVM/leanerVM](https://github.com/Verified-zkEVM/leanerVM) (docs @28bbeb9) — T6 recursive extraction open, no depth measure. **PRIMARY**
16. [a16z crypto: Fast post-quantum signature aggregation with lattice SNARKs](https://a16zcrypto.com/posts/article/fast-post-quantum-signature-aggregation-with-lattice-snarks) (2026-10-16) — Aerie and a16z's arguments. **PRIMARY**
17. [Aerie paper, ePrint 2026/2501](https://eprint.iacr.org/2026/2501) and [a16z/aerie README](https://github.com/a16z/aerie) (@49b6c21) — classical ROM proof, benchmarks, research-release notice. **PRIMARY**
18. [agglayer/agglayer](https://github.com/agglayer/agglayer) (@9f8e6c4) — PP program, aggchain modes, certificate state machine. **PRIMARY**
19. [agglayer-contracts: AgglayerManager.sol](https://github.com/agglayer/agglayer-contracts) (@1c00e15) — L1 settlement entry point and roles. **PRIMARY**
20. [Polygon Docs: Pessimistic Proof Architecture](https://docs.polygon.technology/interoperability/agglayer/core-concepts/pessimistic-proof/architecture) — PP flow and security goal. **PRIMARY**
21. [AggLayer: Pessimistic Proofs Live on Mainnet](https://www.agglayer.dev/blogs/major-development-upgrade-for-a-multistack-future-pessimistic-proofs-live-on-agglayer-mainnet) (2025-02-03) — launch date. **PRIMARY**
22. [Succinct Docs: Proof Aggregation](https://docs.succinct.xyz/docs/sp1/writing-programs/proof-aggregation) — what `verify_sp1_proof` means. **PRIMARY**
23. [Succinct Docs: SP1 Security Model](https://docs.succinct.xyz/docs/sp1/security/security-model) — the no-loss recursion assumption, depth bound, ECDLP assumption, PLONK/BN254. **PRIMARY**
24. [Canetti, Goldreich, Halevi, ePrint 1998/011](https://eprint.iacr.org/1998/011) — schemes secure in the ROM but insecure when instantiated. **PRIMARY**
25. [Bitansky, Canetti, Chiesa, Tromer, ePrint 2012/095](https://eprint.iacr.org/2012/095) — recursive extraction covers constant depth only. **PRIMARY**
26. [Chiesa, Guan, Samocha, Yogev, ePrint 2023/1646](https://eprint.iacr.org/2023/1646) — PCD security bounds with straightline extraction. **PRIMARY**
27. [Barbara, Chiesa, Guan, ePrint 2024/728](https://eprint.iacr.org/2024/728) — relativized succinct arguments do not exist in the ROM. **PRIMARY**
28. [Khovratovich, Rothblum, Soukhanov, ePrint 2025/118](https://eprint.iacr.org/2025/118) — practical attacks on Fiat–Shamir. **PRIMARY**
29. [Maller, Mohnblatt, Zapico, ePrint 2025/1663](https://eprint.iacr.org/2025/1663) — IVC in the osROM. **PRIMARY**
30. [Fenzi, ePrint 2026/1838](https://eprint.iacr.org/2026/1838) — extension of and mitigation for the KRS attack. **PRIMARY**
31. [Brzuska, Hubáček, Kalsta: Simple Attacks against (Extended) Fiat-Shamir (PKC 2026)](https://research.aalto.fi/en/publications/simple-attacks-against-extended-fiat-shamir) — counterexample to XFS. **PRIMARY**
32. [ZisK v1.3.2-alpha release notes](https://github.com/0xPolygonHermez/zisk/releases/tag/v1.3.2-alpha) — a recursive-aggregation implementation bug. **PRIMARY**
33. [ethresear.ch: ERC-8403](https://ethresear.ch/t/erc-8403-an-account-as-one-hash-and-post-quantum-keys/26147) — the state of leanVM's recursion guest. **PRIMARY**
34. [Aligned](https://docs.alignedlayer.com/architecture/2_aggregation_mode), [NEBRA UPA](https://docs.nebra.one/upa-protocol-specification), [Starknet SHARP](https://docs.starknet.io/learn/protocol/sharp) — other proof-aggregation designs. **PRIMARY**
35. [Matthew Green: How to prove false statements? (Part 1)](https://blog.cryptographyengineering.com/2025/02/04/how-to-prove-false-statements-part-1) — a reading of KRS.
36. Previous page: [Choosing Post-Quantum Signatures](/p/pq-signature-selection/en/) — how hash and lattice signatures work, how to read the benchmarks.
37. ChatGPT Deep Research output (`research/eip-8288-deep-dive.md`) — leads only.
38. [Bünz, Chiesa, Fenzi, Wang, ePrint 2025/753 (WARP)](https://eprint.iacr.org/2025/753) and [Arc, ePrint 2024/1731](https://eprint.iacr.org/2024/1731) — hash-based accumulation schemes proven secure in the ROM. **PRIMARY**

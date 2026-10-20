---
template: research
lang: en
title: "Post-Quantum from First Principles to Roadmap: What Ethereum, Starknet and Aztec Are Doing, and What Mantle Can Do Now"
subtitle: Quantum computers threaten signatures and proofs, not hashes. Ethereum's 2029 target covers only the L1 protocol. Mantle must migrate its own proof verifier, L1 multisig keys and L2 account rules, and it can start most of that work now.
cols: 4
type: Technical research · first principles to depth
audience: Mantle developers and leadership who know the basics of EVM and rollups, but not cryptography or post-quantum
scope: Cryptography inventory of an EVM chain and of Mantle; quantum and AI threats; PQ standards and trade-offs; roadmaps and progress of Ethereum, Starknet, Aztec, Optimism and others; work Mantle can drive in 2026–2029
evidence: 356-claim ledger (observed 283 / inferred 59 / speculative 14); NIST standards, EIPs and official EF texts, project blogs and source code; Ethereum mainnet and Mantle RPC reads; accessed 2026-10-16
date: 2026-10-16 · v1
---
Bottom line: a quantum computer can solve the elliptic-curve problem. Because of that, EVM signatures, BLS consensus, KZG commitments and BN254 SNARK proofs all fail. Hashes only lose some security margin ([F1](#F1), [F3](#F3)). Ethereum aims to make all three layers of the L1 protocol quantum-resistant by December 2029. It does not migrate an L2's proof verifier, admin keys or accounts ([F11](#F11), [F12](#F12)).

Today, Mantle's state security rests on two things: one PLONK verification on BN254, and a set of secp256k1 multisig signers. Neither is on Ethereum's roadmap ([F2](#F2)). So "wait for Ethereum to choose, then rebase" is not enough. The inventory, permission hardening, PQ account prototypes and proof-path design can start now ([F15](#F15), [F16](#F16)).

## A Three threats, three outcomes {sheet meta="threat map"}
```tree list
Shor's algorithm | solves discrete logs, breaks directly
  Signatures | ECDSA, BLS, P-256: forged transactions and multisigs
  Commitments | KZG: forged blob data proofs
  Proofs | Groth16 / PLONK: forged L2 state roots
Grover's algorithm | square-root search, less margin
  Hashes / AES | Keccak, SHA-256 remain usable
HNDL | harvest now, decrypt later
  Encrypted data | hurts confidentiality, not signatures
AI cryptanalysis | applies to every scheme
  HAWK | broken in 2026-07, then withdrawn
```

## B Key numbers {sheet span=2 meta="2026-10-16"}
| Quantity | Value |
|---|---|
| Break 256-bit elliptic curves (Google estimate) | <1,200 logical qubits, <500k physical qubits, ~18–23 min |
| Existing hardware (Willow / ethereum.org) | 105 / a few thousand physical qubits |
| Experts: CRQC within 10 years | 28–49% |
| ML-DSA-44 signature / ECDSA signature | 2,420 B / 65 B (~37×) |
| PQ signature check in an EVM contract | 0.65M–8.1M gas (ecrecover: 3,000) |
| One Mantle state submission (PLONK) | 964 B proof, ~431k gas |
| Mantle L1 upgrade authority | 6/14 Safe, no timelock |

## C Progress by project {sheet meta="2026-10"}
| Project | PQ status |
|---|---|
| Ethereum | warn 8141 scheduled, rest research |
| Starknet | warn proving layer + 2 hashes |
| Aztec | warn choose in 2027, migrate by 2030 |
| Optimism | warn retire ECDSA EOAs by 2036 |
| Algorand | ok native Falcon accounts live |
| Zcash | ok recoverable notes live |
| Mantle | no no public plan |

## D Mantle components and PQ status {sheet span=2 meta="read on-chain"}
| Component | Cryptography | Under quantum |
|---|---|---|
| User accounts / 7702 | secp256k1 ECDSA | no forgeable |
| proposer, batcher | EOA (ECDSA) | no can be impersonated |
| L1 multisigs (6/14, 3/7) | ECDSA signers | no upgrade power can be seized |
| Final proof verification | PLONK on BN254 | no state can be forged |
| Withdrawal proof | keccak + MPT | ok less margin |
| DA / consensus | blob KZG, BLS | warn inherited from Ethereum |

## E Timeline {sheet span=2 meta="2024–2036"}
```timeline
2024-08 | NIST publishes FIPS 203/204/205 | first PQ standards
2026-03 | New Google estimate | ~20× fewer physical qubits
2026-07 | HAWK broken with AI help | team withdraws it
*2026-10-15 | Aztec PQ roadmap | choose in 2027, migrate by 2030
2027 Q2 | Hegotá (expected) | EIP-8141 Frame Tx
*2029-12 | Ethereum L1 three-layer PQ target | protocol capability, not full migration
2035 | NIST draft: classical public keys disallowed | IR 8547 still a draft
2036-01 | Optimism retires ECDSA EOAs | subject to governance
```

## F Conclusion {sheet span=4}
```callout ok Do not wait for Ethereum to pick an algorithm: build the inventory, tighten permissions, prototype, and plan the proof path
- Threat: Shor breaks signatures and SNARK proofs; hashes only lose margin. Experts place a CRQC in the early-to-mid 2030s, and the estimates move fast (F1, F3, F5).
- AI: an AI-assisted attack broke HAWK. The larger near-term risk is implementation bugs, so migration needs conservative choices plus formal verification (F7).
- Ethereum: 2029-12 is an L1 protocol target. Only EIP-8141 has a fork slot; PQ precompiles have none. L2s inherit only consensus and DA (F11, F12).
- Peers: no project is PQ end to end. Everyone starts with "accounts that can switch signatures" and "hash-based proofs" (F13, F14).
- Mantle: the risks with the largest impact are the multisig with no timelock and the BN254 proof wrapper. Panel Q lists six workstreams (F2, F15, F16).
- Where to start: basics in I–M, other projects in N–O, Mantle in P–Q.
```

## G How to read this {depth=1}
```callout info Series map: Mantle post-quantum series, three parts
- Part 1, [Post-Quantum from First Principles to Roadmap](/p/post-quantum-mantle/en/): which components quantum computers break, what each project does, and what Mantle must migrate itself.
- Part 2, [Post-Quantum Engineering on Mantle](/p/pq-in-mantle/en/): contract-level PQ accounts + a verification precompile, and why EIP-7702 is not disaster recovery.
- Part 3, [Choosing Post-Quantum Signatures](/p/pq-signature-selection/en/): hash vs lattice, EIP-8288, and revisions to parts 1 and 2 (part 3, panel R).
```

```callout warn Additions of 2026-10-20 (see part 3, panel R)
- Panel Q's "L1-side aggregation (e.g. EIP-8288)" needs a qualifier. 8288 aggregates only leanSPHINCS signatures today, leanSTARK has no definition yet, and it cannot directly aggregate SP1 proofs (ledger X20).
- Starknet's Falcon-512 accounts now have two implementations, from S2morrow and OpenZeppelin, and StarkWare's roadmap mentions Falcon-512 consensus signatures (ledger X21).
```

```callout info You already know (not explained here)
- A wallet has a private key and a public key; the private key signs, and anyone can verify with the public key
- EOAs sign transactions with secp256k1, and the EVM recovers the address with `ecrecover`
- How a rollup works: a sequencer orders transactions, data goes to L1, and proofs or challenges confirm the state on L1
- A hash function is a "data fingerprint" that nobody can reverse
- A multisig (Safe) executes when M of N keys sign
```
- **5 minutes (leadership)**: read the lead and the overview A–F, then the workstream list in [panel Q](#panel-Q).
- **30 minutes (developers)**: also read panels I–Q: [Background](#panel-I), [EVM cryptography](#panel-J), [Quantum threat](#panel-K), [AI](#panel-L), [PQ basics](#panel-M), [Ethereum](#panel-N), [Other projects](#panel-O), [Mantle today](#panel-P), [Recommendations](#panel-Q).
- **To verify**: also read [Method and evidence](#panel-S) and [Reproduce](#panel-T). The on-chain commands run as written.

**Running example**: Alice starts a 10 ETH withdrawal on Mantle and later claims it on L1. The withdrawal passes through six steps:
1. Alice's ECDSA signature;
2. the blob that the batcher posts to L1 (KZG);
3. the state root and PLONK proof that the proposer submits;
4. 12-hour finalization;
5. the keccak proof in OptimismPortal;
6. Ethereum consensus (BLS).

Each later panel shows at which step a quantum computer would strike.

## H Context {depth=2}
**The problem**: on 2026-10-15, Aztec published its PQ roadmap with two targets, 2027-02 and 2030 [23]. A few days earlier we reviewed Starknet's PQ migration [26]. The Ethereum Foundation (EF) aims to make all three layers of the L1 quantum-resistant by December 2029 [3]. Mantle is an EVM-equivalent L2 with no public PQ research or plan [35][36]. Our default strategy today is to wait for Ethereum's roadmap and then follow with a rebase.

**Why now**:
- Resource estimates fall fast. Google's 2026-03 estimate cut the physical qubits needed to break 256-bit elliptic curves by about 20× [16].
- AI can already improve cryptanalysis. In 2026-07, Anthropic used AI to help break the PQ candidate HAWK, and HAWK was withdrawn [22].
- Peers are publishing roadmaps: Optimism (2026-01), Algorand (live 2026-08), Sui (2026-08), Aztec (2026-10) [25][27][43][23].

**Scope**: the cryptography inventory of an EVM chain and of Mantle; quantum and AI threats; PQ standards and trade-offs; the roadmaps of Ethereum, Starknet, Aztec and others; what Mantle can drive in 2026–2029.

**Non-goals**: security proofs and math derivations of the schemes; a full security audit; Mantle's non-public architecture or key management (we use only public sources and on-chain reads, and flag what needs internal checks); investment advice.

**Gaps in existing material**: the external research (ChatGPT Deep Research) has the right frame [44], but parts are stale or incomplete:
- HAWK withdrew;
- EIP-8141 now has a fork slot;
- SP1's inner layer also relies on an elliptic curve;
- Mantle uses PLONK, not Groth16.

This report traces each claim to a primary source. [Panel S](#panel-S) lists the corrections.

## I Background {depth=2}
```excalidraw q="Which concepts must you know first to follow this report, and in what order?" read="Gray dashed boxes are assumed knowledge. Blue boxes are the cards below. The green box is the subject. An arrow means learn first → learn after." takeaway="B-1 and B-2 explain why things break, B-3 explains the rollup-specific risk, B-4 and B-5 explain what to switch to and how, and B-6 explains the special case of confidential data." name=prereq-map kind=prerequisite-map
{"grid": {"w": 280, "h": 110}, "defaults": {"w": 210, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "pk", "label": "Key pairs (known)", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "hs", "label": "Hashes (known)", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "ru", "label": "Rollup proofs (known)", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 Four crypto tools", "col": 1, "row": 0, "color": "blue"},
   {"id": "b1", "label": "B-1 Curve hard problem", "col": 1, "row": 1, "color": "blue"},
   {"id": "b3", "label": "B-3 Setup and wrapping", "col": 1, "row": 2, "color": "blue"},
   {"id": "b2", "label": "B-2 Shor and Grover", "col": 2, "row": 1, "color": "blue"},
   {"id": "b6", "label": "B-6 Harvest now", "col": 2, "row": 0, "color": "blue"},
   {"id": "b4", "label": "B-4 PQ signatures", "col": 2, "row": 2, "color": "blue"},
   {"id": "b5", "label": "B-5 Hybrid uses AND", "col": 3, "row": 2, "color": "blue"},
   {"id": "top", "label": "Mantle PQ roadmap", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "pk", "to": "b1"}, {"from": "hs", "to": "b0"}, {"from": "pk", "to": "b0"},
   {"from": "ru", "to": "b3"}, {"from": "b1", "to": "b2"}, {"from": "b0", "to": "b6"},
   {"from": "b1", "to": "b3"}, {"from": "b2", "to": "b4"}, {"from": "b4", "to": "b5"},
   {"from": "b2", "to": "top"}, {"from": "b6", "to": "top"}, {"from": "b5", "to": "top"},
   {"from": "b3", "to": "top"}
 ]}
```

```prereq B-0 l1 3min
# Four crypto tools: signatures, encryption, hashes, proofs
what: A signature answers "did the owner authorize this". Encryption answers "who can read this". A hash answers "was the data changed". A proof answers "was the computation done by the rules". Each rests on different math, so quantum computers affect each one differently.
why: Any PQ discussion must first name the tool. "Hashes are quantum-safe" does not mean "signatures are quantum-safe". "The proof system is a STARK" does not mean "the signatures are PQ".
example: Alice's withdrawal: ECDSA signature (signature) → blob KZG (commitment) → PLONK (proof) → keccak withdrawal proof (hash).
misconception: Myth: PQ means swapping one signature scheme. Fact: signatures, commitments, proofs and consensus each migrate separately, at different speeds [1][3].
deeper: [1] pq.ethereum.org FAQ
```

```prereq B-1 l1 4min
# Elliptic curves and the discrete log (ECDLP)
what: Elliptic-curve security rests on one problem: given the public key $P = kG$, find the private key $k$. A classical computer needs about $2^{128}$ steps, the same security strength as AES-128 (P61).
why: secp256k1 (EOAs), BLS12-381 (consensus, KZG) and BN254 (L2 proof verification) all rest on this problem. If someone solves it, they all fail together [2][17].
example: EOA address = `keccak256(pubkey)[12:]`. After one transaction, anyone can recover the public key from the signature and attack it offline [14].
misconception: Myth: the address is a hash of the public key, so it is safe. Fact: only addresses that never sent a transaction keep the extra hash layer [2].
deeper: [17] Babbush et al. 2026 §II
```

```prereq B-2 l1 4min
# Shor's algorithm and Grover's algorithm
what: Shor solves discrete logs and integer factoring efficiently on a quantum computer; it changes the method, not just the speed. Grover takes the square root of the number of tries in an unstructured search, and it runs serially, so adding machines barely helps.
why: This decides what to replace and what only needs new parameters. Mantle must replace anything Shor breaks. For what only Grover affects, NIST says AES-128 and SHA-256 stay usable [18].
example: For a 256-bit hash, the theoretical preimage queries drop from $2^{256}$ to $2^{128}$. Once NIST adds circuit-depth limits, a SHA-256 preimage is still in the top security category (Category 5) [18].
misconception: Myth: quantum computers break all cryptography. Fact: symmetric ciphers and hashes only lose margin [18].
deeper: [18] NIST IR 8547 ipd §2.1.3
```

```prereq B-3 l1 5min
# Trusted setup and SNARK wrapping
what: The public parameters (SRS) of Groth16 / PLONK hide a secret number τ. Classically, if one participant in the ceremony destroys their share, nobody knows τ. Many zkVMs first make a large STARK proof, then "wrap" it in a small PLONK / Groth16 proof for L1.
why: A quantum computer can compute τ directly from the public SRS. That gives a reusable backdoor to forge proofs [17]. Mantle's final proof is PLONK on BN254 [37].
example: SP1: RISC-V execution → STARK (hash-based) → PLONK wrapper (BN254, Aztec Ignition SRS) → L1 verification, ~300k gas [31].
misconception: Myth: one honest participant makes the setup quantum-safe. Fact: τ is the discrete log of points in the SRS, and Shor can solve it [17][41].
deeper: [17] Babbush et al. 2026 §V.5
```

```prereq B-4 l1 5min
# PQ signature families
what: Post-quantum (PQ) cryptography runs on ordinary computers and aims to resist quantum computers. Signatures come in three main families: lattices (ML-DSA, Falcon), hashes (SLH-DSA, XMSS) and isogenies (SQIsign).
why: The families differ in assumptions, sizes and implementation difficulty. On-chain, size and verification gas matter most.
example: Signature sizes: ECDSA 65 B; Falcon-512 666 B; ML-DSA-44 2,420 B; SLH-DSA-128s 7,856 B [20].
misconception: Myth: PQ needs quantum hardware. Fact: PQ algorithms run on ordinary CPUs [19].
deeper: [20] FIPS 204 Table 2
```

```prereq B-5 l2 3min
# Hybrid signatures: must be AND
what: During a transition, use one classical signature and one PQ signature together. Accept only when both pass (AND). Then an attacker must break both.
why: Many migration designs accidentally become "either one passes" (OR). OR is only as strong as the weaker scheme [38].
deeper: [38] IETF composite signatures draft -19 §9.1
```

```prereq B-6 l2 3min
# HNDL: harvest now, decrypt later
what: An attacker stores ciphertext today and decrypts it once a quantum computer exists.
why: It only hurts confidentiality. Signatures on a public chain need no HNDL defense; privacy apps and encrypted data do [1][23].
deeper: [23] Aztec blog, "Protecting private data now"
```

## J The cryptography an EVM chain uses today {depth=2}
An EVM chain relies on discrete-log assumptions in four places: account signatures, consensus signatures, DA commitments and L2 proof verification. Hashes appear only in the state tree and in withdrawal proofs [2][8][41].

Fig 2 colors each step of Alice's withdrawal by its quantum impact. Mantle's execution layer is a fork of Ethereum, so its account layer matches Ethereum's. Proofs, permissions and operator keys belong to Mantle. Mantle inherits DA and consensus from Ethereum [35][37].

```excalidraw q="Which cryptographic components does one Mantle withdrawal by Alice pass through, and which ones would a quantum computer break?" read="Top to bottom is the order of the withdrawal. Red = broken directly by Shor; yellow = mixed (mostly hash-based, but with an elliptic-curve assumption); green = affected only by Grover; gray dashed = inherited from Ethereum (also broken by Shor). Thick borders mark the layers with the largest impact on Mantle." takeaway="Except for the hash in the withdrawal proof, the whole path relies on elliptic curves. Mantle itself owns the PLONK verification and the L1 multisigs." kind=layer-list
{"grid": {"w": 620, "h": 72}, "defaults": {"w": 580, "h": 54, "fontSize": 16},
 "nodes": [
   {"id": "u", "label": "1 User signature: EOA / EIP-7702 / P-256 (ECDSA)", "col": 0, "row": 0, "color": "red"},
   {"id": "b", "label": "2 Batcher posts blob: EOA signature (ECDSA)", "col": 0, "row": 1, "color": "red"},
   {"id": "s", "label": "3 Inner proof: SP1 STARK (Poseidon2 + ext. curve)", "col": 0, "row": 2, "color": "yellow"},
   {"id": "p", "label": "4 Outer proof: PLONK on BN254 (Aztec Ignition SRS)", "col": 0, "row": 3, "color": "red", "strokeWidth": 3},
   {"id": "o", "label": "5 Proposer submits state root: EOA (ECDSA)", "col": 0, "row": 4, "color": "red"},
   {"id": "m", "label": "6 L1 permissions: 6/14, 3/7, Succinct 2/3 Safes", "col": 0, "row": 5, "color": "red", "strokeWidth": 3},
   {"id": "w", "label": "7 Withdrawal proof: keccak + MPT", "col": 0, "row": 6, "color": "green"},
   {"id": "d", "label": "8 DA: blob KZG (BLS12-381)", "col": 0, "row": 7, "color": "gray", "stroke": "dashed"},
   {"id": "c", "label": "9 Settlement: Ethereum consensus BLS signatures", "col": 0, "row": 8, "color": "gray", "stroke": "dashed"}
 ],
 "edges": []}
```

The table below covers the Ethereum L1 side. [Panel P](#panel-P) has the on-chain reads for Mantle.

| Layer | Component | Algorithm | Under quantum |
|---|---|---|---|
| Accounts | EOA, `ecrecover` | secp256k1 ECDSA | no Shor |
| Accounts | EIP-7702 authorization | ECDSA, delegation can be rewritten | no Shor |
| Accounts | P-256 precompile | secp256r1 | no Shor |
| State | MPT | Keccak-256 | ok less margin |
| Consensus | validator signatures, RANDAO | BLS12-381 | no Shor |
| DA | blobs, PeerDAS | KZG (BLS12-381) | no Shor |
| ZK verification | 0x06–0x08 precompiles | BN254 pairing | no Shor |

```finding F1 high
# An EVM chain relies on discrete logs in four places, and Shor breaks all of them
claim: Accounts (secp256k1 ECDSA, EIP-7702 authorizations, P-256), consensus (BLS12-381), DA (KZG) and L2 proof verification (BN254 precompiles) all rest on the elliptic-curve discrete log. The Keccak used in the state tree and withdrawal proofs only loses margin.
evidence: [observed] EIP-7702, EIP-4844, EIP-197 and the consensus-specs text [8][41] (E1–E4, E6–E14); ethereum.org lists ECDSA, BLS, KZG and pairing-based ZK proofs as solvable by Shor [2] (T11); NIST IR 8105 Table 1 [18] (T1). [inferred] The original ECDSA key can bypass a PQ module on a 7702 account (E5).
implication: "Is Mantle quantum-safe?" needs four separate answers, one per place. A single verdict cannot cover them.
```

EIP-7702 has a detail that is easy to miss. The protocol checks the authorization tuple with `ecrecover`. The same private key can re-delegate or clear the delegation at any time, and a delegated EOA can still send transactions directly [8]. So a PQ verification module on a 7702 account does not remove the original ECDSA root authority (E2–E5).

## K What happens when quantum computers arrive {depth=2}
```excalidraw q="Which components does each of the three quantum threats hit, and what follows?" read="Left: the threat. Middle: the component hit. Right: the outcome for an L2 such as Mantle. Red = broken directly; green = less margin, fix with parameters; yellow = hurts confidentiality only." takeaway="For a public L2, the real danger is the Shor row: forged signatures, forged blob proofs, forged state roots." kind=threat-map
{"grid": {"w": 340, "h": 92}, "defaults": {"w": 250, "h": 58, "fontSize": 16},
 "nodes": [
   {"id": "shor", "label": "Shor's algorithm", "col": 0, "row": 1, "color": "blue", "strokeWidth": 3},
   {"id": "grv", "label": "Grover's algorithm", "col": 0, "row": 3, "color": "blue"},
   {"id": "hn", "label": "HNDL", "col": 0, "row": 4, "color": "blue"},
   {"id": "sg", "label": "Signatures: ECDSA / BLS", "col": 1, "row": 0, "color": "red"},
   {"id": "kz", "label": "Commitments: KZG", "col": 1, "row": 1, "color": "red"},
   {"id": "pf", "label": "Proofs: PLONK / Groth16", "col": 1, "row": 2, "color": "red"},
   {"id": "hs", "label": "Hashes / AES", "col": 1, "row": 3, "color": "green"},
   {"id": "ct", "label": "ECDH ciphertext", "col": 1, "row": 4, "color": "yellow"},
   {"id": "r1", "label": "Forged txs, multisigs", "col": 2, "row": 0, "color": "red"},
   {"id": "r2", "label": "Forged blob data proofs", "col": 2, "row": 1, "color": "red"},
   {"id": "r3", "label": "Forged L2 state roots", "col": 2, "row": 2, "color": "red", "strokeWidth": 3},
   {"id": "r4", "label": "Larger parameters suffice", "col": 2, "row": 3, "color": "green"},
   {"id": "r5", "label": "Late decryption", "col": 2, "row": 4, "color": "yellow"}
 ],
 "edges": [
   {"from": "shor", "to": "sg"}, {"from": "shor", "to": "kz"}, {"from": "shor", "to": "pf"},
   {"from": "grv", "to": "hs"}, {"from": "hn", "to": "ct"},
   {"from": "sg", "to": "r1"}, {"from": "kz", "to": "r2"}, {"from": "pf", "to": "r3"},
   {"from": "hs", "to": "r4"}, {"from": "ct", "to": "r5"}
 ]}
```

Google sorts quantum attacks into three kinds [17]:
- **at-rest**: attack public keys that stay on-chain for a long time, such as EOAs that have sent transactions and multisig signers. There is plenty of time to compute offline.
- **on-spend**: compute the private key in the few minutes between broadcast and inclusion. This needs a quantum computer that finishes in minutes.
- **on-setup**: attack fixed public parameters, such as the KZG and PLONK SRS. One computation yields a reusable backdoor.

```finding F3 high
# Quantum computers break signatures, commitments and proofs, not hashes
claim: Shor directly breaks ECDSA, BLS, KZG, Groth16 / PLONK and ECDH. Grover only reduces the margin of hashes and AES. NIST says AES-128 "will remain secure for decades", and a SHA-256 preimage stays in Category 5.
evidence: [observed] NIST IR 8105 Table 1, the PQC FAQ and IR 8547 ipd [18] (T1–T6); Google white paper §III.4 [17] (T9). [inferred] "A 256-bit hash drops to 2^128" counts queries only (T7).
implication: Mantle does not need to replace keccak or the MPT. It must replace every signature and the proof wrapper, and it inherits BLS and KZG from Ethereum.
```

```finding F4 high
# A trusted setup is broken once and becomes a reusable backdoor
claim: The KZG and PLONK trapdoor τ is the discrete log of elliptic-curve points in the public SRS. Once a quantum computer computes τ, an attacker can forge blob data proofs or SNARK proofs on an ordinary computer, with no further quantum computation.
evidence: [observed] Google white paper §V.5, "a persistent, universal backdoor" [17] (T20); EF KZG ceremony FAQ: an extracted secret allows arbitrary claims about EIP-4844 data [41] (T21); Google concedes that its own SP1-generated Groth16 proof is not sound against quantum attacks [17] (T24); ethereum.org says the ceremony is secure "even against quantum computers" [2] (E51). [inferred] That ethereum.org claim is wrong (T23, E52).
implication: Mantle's final proof is BN254 PLONK (Aztec Ignition SRS). After Q-day, an attacker could send a forged proof through an allowlisted proposer. L1 would then accept a wrong state root, and the attacker could drain the bridge. The proposer is itself an ECDSA EOA with an exposed public key (T25, K5, X3).
```

Google also quantifies the exposure on Ethereum [17]:
- The 1,000 accounts holding the most ETH hold about 20.5M ETH. A fast-clock quantum computer could break them in less than 9 days (T15).
- At least 70 of the top 500 contracts carry admin-key risk, about 2.5M ETH. Deriving those keys takes less than 15 hours (T16).
- Bridges, oracles and other accounts that control much but hold little ETH carry a second-order risk that is "arguably much larger" (T17).
- The paper also notes that moving Ethereum consensus to PQ does not retroactively fix quantum flaws in deployed contracts (T18).

**When is Q-day?** No reliable date exists, and the estimates are moving fast:

| Source | Estimate |
|---|---|
| Google 2026-03 | ECDLP-256: <1,200 / 1,450 logical qubits, <500k physical qubits, ~18–23 min |
| Gidney 2025-05 | RSA-2048: <1M physical qubits, <1 week |
| Google Willow (2024-12) | 105 physical qubits |
| GRI expert survey (2026-03) | 28–49% within 10 years, 51–70% within 15 |
| EF | CRQC in the early-to-mid 2030s |
| Migration deadlines | Google 2029; NIST draft 2030 / 2035; NSA 2030–2035 |

```finding F5 medium
# Resource estimates fell about 20× in one year, but hardware is still two to three orders of magnitude short
claim: Google's 2026-03 estimate cut the physical qubits needed to break 256-bit elliptic curves to under 500,000, about 20× fewer than before. Google's Willow chip has 105 physical qubits, and ethereum.org puts current hardware at a few thousand noisy physical qubits. An expert survey puts the chance of a CRQC within 10 years at 28–49%. The EF expects one in the early-to-mid 2030s.
evidence: [observed] Google blog and arXiv 2603.28846 [16][17] (T35–T37); Willow spec sheet (T40); GRI 2025 report [21] (T42); pq.ethereum.org [1] (T47); ethereum.org puts current hardware at a few thousand noisy physical qubits [2] (T69). [inferred] That is two to three orders of magnitude short of the 500,000 needed (T41).
implication: Treat "2029" as a readiness target, not a safety countdown. The risk is that estimates keep falling: Google did not publish its circuits and verified them only with a zero-knowledge proof [17].
```

```finding F6 medium
# For a public L2, HNDL is not the main problem
claim: The EF says HNDL mainly affects encrypted data, not blockchain signatures; the realistic failure mode is stolen funds and impersonation, not rewritten finalized history. Privacy chains such as Aztec must defend against HNDL today.
evidence: [observed] pq.ethereum.org FAQ [1] (T28); Aztec's analysis of ECDH ephemeral keys [23] (T29). [inferred] Mantle's main risks are fake authorizations and fake proofs (T31, X10).
implication: Mantle needs a separate review only for encrypted data at the app layer: privacy apps, encrypted backups and institutional messages.
```

## L Recent AI cryptanalysis and its risks {depth=2}
AI already changes cryptographic security at two levels:
- **Algorithms**: it finds weaknesses in the math.
- **Implementations**: it finds bugs in code and integrations.

Keep the boundaries of each result clear.

| Result | What it means | What it does not mean |
|---|---|---|
| HAWK (2026-07-28) | HAWK-512 key recovery drops from $2^{150}$ to $2^{108}$; the team withdrew | attackers broke lattices, ML-DSA or Falcon |
| 7-round AES-128 | time drops from $2^{99}$ to about $2^{90}$; data still $2^{105}$ | full 10-round AES fails |
| Small-field Poseidon | researchers solved only reduced-round instances | attackers broke recommended Poseidon2 parameters |
| Aztec's AI audit | found critical bugs that months of human audits missed | AI findings can replace security proofs |

Anthropic ran the HAWK attack with Claude Mythos Preview in about 60 hours, at about $100k in API cost. It states that the attack is specific to HAWK and that no production software has to change [22] (T50–T55). NIST confirms that it will not standardize HAWK and that the result does not affect ML-KEM / ML-DSA [22] (T53).

```finding F7 high
# AI makes a rushed migration a risk of its own
claim: AI has already pushed one NIST signature candidate to withdrawal, and it finds implementation bugs that human audits missed. Aztec and the EF reach the same conclusion. Choose conservatively and require formal verification. Rushed, immature cryptography may be more dangerous than quantum computers.
evidence: [observed] Anthropic's research and the HAWK paper [22] (T50–T56); NIST's withdrawal note (T53); Aztec, "conservative … formally-verified implementations" [23] (T57, T63); pq.ethereum.org, "rushed deployment … more risk than it removes" [1] (T64). [inferred] For Mantle, the near-term AI risk sits mainly in contracts, verifiers and bridges (T66, X18).
implication: Schedule the PQ migration together with AI-assisted audits and formal verification. Choosing algorithms while ignoring implementations creates a new source of risk.
```

A media report says that Vitalik, in a post on 2026-10-07, expects AI to weaken the concrete security of lattice schemes within two years. We could not read the original post, so this is speculation (T65, [speculative]).

## M PQ basics: standards, sizes and trade-offs {depth=2}
**Standards status** (as of 2026-10-16) [19]:
- Final: FIPS 203 ML-KEM (key encapsulation), FIPS 204 ML-DSA (lattice signature), FIPS 205 SLH-DSA (hash-based signature), published 2024-08-13.
- Not published: FIPS 206 FN-DSA (Falcon) is still "in development", with no draft page on CSRC. FN-DSA is not compatible with current Falcon [19] (P2–P6).
- Backup: NIST selected HQC (code-based KEM) in 2025-03; no FIPS yet (P8).
- The additional signature round 3 has 8 candidates left; HAWK withdrew (P10, P11).

```tree
PQ schemes | grouped by hard problem
  Lattices | the workhorse, standardized by NIST
    ML-DSA | FIPS 204, signatures 2.4–4.6 KB
    Falcon / FN-DSA | FIPS 206 not out, signatures 0.7–1.3 KB
    ML-KEM | FIPS 203, key encapsulation, not a signature
  Hashes | most conservative assumptions
    SLH-DSA | FIPS 205, stateless, signatures 7.9–30 KB
    XMSS / leanSig | stateful, each key signs a limited number of times
  Isogenies | most compact, youngest
    SQIsign | round 3, 200 B signatures, parameters raised in 2026
  Multivariate / codes | backups for diversity
```

**Sizes** (bytes, from the standards [20]; the parameter sets have different security categories, so this is not a ranking at equal security):

| Scheme | Public key | Signature | Signature / ECDSA |
|---|--:|--:|--:|
| ECDSA secp256k1 | 64 | 65 | 1× |
| Falcon-512 | 897 | 666 | ~10× |
| ML-DSA-44 | 1,312 | 2,420 | ~37× |
| SLH-DSA-128s | 32 | 7,856 | ~121× |
| XMSS (2^10 signatures) | 68 | 2,500 | ~38× |
| SQIsign-I | 83 | 200 | ~3× |

**Gas to verify on the EVM** (all experimental or Draft, none audited) [12][40]:

| Method | Gas | Status |
|---|--:|---|
| `ecrecover` (baseline) | 3,000 | mainnet |
| Falcon-512 contract (best branch) | 650,345 | experimental branch |
| ML-DSA-44 contract (Fireblocks) | 1,226,311 | research code |
| ML-DSA-44 contract (NIST version) | ~8.1M | unaudited |
| EIP-8052 Falcon precompile | 3,000 | Draft |
| EIP-8051 ML-DSA precompile | 4,500 | Draft |

```finding F8 high
# PQ signatures are 10–121× larger, and checking them without a precompile costs 200× more
claim: An ML-DSA-44 signature is about 37× an ECDSA signature, and SLH-DSA-128s about 121×. Pure-contract verification costs at best about 650k gas (Falcon) to 1.23M gas (ML-DSA-44), about 217–409× `ecrecover`. Draft precompiles bring this to 3,000–4,500 gas, but no Ethereum fork includes them.
evidence: [observed] size tables in FIPS 204 / 205 and the Falcon spec [20] (P24–P27); ZKNOX and Fireblocks READMEs [40] (P29–P31); EIP-8051 / 8052 [12] (P32, P33). [inferred] Ratio arithmetic (P28, P36).
implication: If every transaction carries a PQ signature, the cost lands on calldata and on verification. High-frequency use cases (perps, agents) should consider session keys or batched authorization, but must not keep an unrestricted ECDSA back door.
```

**Hybrid signatures must use AND.** The IETF composite signature draft accepts only when every component signature passes. It classes the OR form as "migration flexibility" that does not give dual-algorithm security [38] (P38–P40). Web2 already uses hybrids at scale for key exchange: in 2026-09, about 70% of browser traffic used hybrid ML-KEM (X25519MLKEM768) [39] (P41).

| Acceptance rule | After an attacker breaks the classical scheme |
|---|---|
| AND: both the classical and the PQ signature must pass | ok the attacker must still break the PQ signature |
| OR: either signature passes | no the attacker passes with the classical signature alone |

```finding F9 high
# The key to hybrids and migration is AND, and Mantle's proof gateway is OR by design
claim: A hybrid signature forces an attacker to break both algorithms only in AND mode. The SP1VerifierGateway that Mantle uses accepts any route that its owner added and did not freeze; routes have no AND relation.
evidence: [observed] IETF draft -19 §3.3, §9.1 [38] (P38, P39); `SP1VerifierGateway.verifyProof` source [34] (K7). [inferred] Adding a PQ route without freezing the old BN254 route means "old proof OR new proof" (K9, X4).
implication: When the proof system changes, freezing the old route must be a written migration step. Succinct has already frozen 11 old routes (K8), so the operation is proven.
```

**PQ proof systems and PQ signatures are different things.** Signatures protect "who authorized". Proof systems protect "was the computation correct" [1].
- Hash-based proofs (STARK, FRI, WHIR) rely only on hashes; researchers consider them plausibly PQ. The cost is size: fast schemes produce proofs of about 300 KB [23] (P47).
- Lattice SNARKs (Lattice Jolt / Akita, 2026-09) produce proofs under 100 KB, but do not yet have zero knowledge [33] (P51, P52).
- Production zkVMs wrap their proofs in a BN254 SNARK before going on-chain, as the figure below shows.

```flow LR
RISC-V execution -> STARK proof: hash-based
STARK proof -> Recursive compression
Recursive compression -> *PLONK wrapper: BN254 pairing
*PLONK wrapper -> L1 verification: ~300k gas
```

```finding F10 high
# A STARK inside does not make the final verification PQ
claim: SP1 uses Gnark's BN254 Groth16 / PLONK to compress a STARK into a SNARK for on-chain verification. RISC Zero labels its own STARK layer "Quantum Safe: Yes" and its Groth16 layer "No". SP1 Hypercube's inner layer also assumes a hard discrete log on an extension-field elliptic curve.
evidence: [observed] SP1 Security Model [31] (P54, P56, O35, O36); RISC Zero Security Model [42] (P57). [inferred] On-chain verification of "STARK inside + BN254 wrapper" is not quantum-resistant (P58, O37). No public analysis shows whether a quantum attacker can exploit the inner extension-field curve (P59, [speculative]).
implication: To judge whether a rollup's proofs are PQ, look at what L1 verifies last. For Mantle, that is PLONK on BN254 (K2, K3).
```

## N Ethereum's PQ roadmap {depth=2}
**What "2029" means.** Here is the goal in the EF Protocol blog (2026-09-07): "aiming for Ethereum L1 to be quantum-resistant across all three layers (execution, consensus, and data) by December 2029". It commits to keep this target until at least January 2027 [3]. Both pq.ethereum.org and ethereum.org state that full execution-layer migration takes more years [1][2] (E18–E21).

| Layer | Today | Target | Key items and status |
|---|---|---|---|
| Execution | ECDSA EOAs | accounts pick signatures, k1 retired | ok EIP-8141 scheduled for Hegotá; warn 8151 / 8298 considered; no PQ precompiles not scheduled |
| Consensus | BLS aggregation | leanXMSS + leanVM proof aggregation | warn prototype, "not production ready" |
| Data | KZG | hash commitments + proofs (leanDA) | warn research post and benchmarks |

```timeline
2025-12 | Fusaka | PeerDAS, P-256 precompile
2026 Q4 | Glamsterdam (planned) | no PQ items
*2027 Q2 | Hegotá (expected) | FOCIL + EIP-8141
2028 | I* (placeholder) | PQ key registry, leanSPHINCS txs
2028–29 | J* (placeholder) | MV-PQ fallback
*2029 | K* (placeholder) | PQ attestations, post-quantum L1
2029–30 | L* (placeholder) | mandatory execution proofs
```

I*–L* above are placeholder fork names from the EF Architecture strawmap. The strawmap calls itself "not a prediction". On 2026-10-09 it moved "post quantum L1" from L* to K* [6] (E35–E39).

```finding F11 high
# Ethereum has scheduled only EIP-8141, and calls PQ precompiles premature
claim: Hegotá schedules only FOCIL and EIP-8141 (Frame Transaction); the EF says "Hegotá is not the PQ fork". 8141 has no PQ signature scheme of its own, only reserved extension slots. Hegotá declined the ML-DSA precompile EIP-8355 as "premature standardization", and 7885 / 8051 / 8052 are on no list. For consensus, leanVM calls itself "not (yet) production ready", and the hash function is not chosen.
evidence: [observed] EIP-8081 Hegotá meta [5] (E22, E23, E27, E28); EF Hegotá tier list [4] (E34); EIP-8141 signature scheme table [7] (E25); leanVM README @127510d1 [13] (E43, E44); ethereum.org Hegotá page [2] (E24). [inferred] Ethereum's canonical hash function is not yet chosen (E48).
implication: If Mantle wants to "follow Ethereum's algorithm choice", there is no signature algorithm to follow before 2027. On the account layer, the only thing to follow is the 8141 framework.
```

```finding F12 high
# L2s inherit only consensus and DA, and must migrate the rest themselves
claim: The EF gives L2s advice, not protocol requirements. It names four things to protect: sequencer and admin keys, bridges and cross-chain messaging, AA accounts, and the zk-rollup proof system; it calls protocol evolution "chain-specific". L2s benefit automatically only from PQ L1 consensus and blob DA, and even then must switch blob transaction versions.
evidence: [observed] pq.ethereum.org FAQ, "Ecosystem & Broader Context" [1] (E59); ethereum.org on application-layer ZK proofs [2] (E60); EIP-4844 rationale for versioned hashes [41] (E61); EIP-8151 on L2 fault proofs [9] (E62). [inferred] An L2's BN254 verifier, account rules, bridge and upgrade keys do not become PQ on their own (E63–E65).
implication: "Rebasing on Ethereum" gives Mantle only the inherited layer. Execution-layer changes such as 8141 / 8151 also need a Mantle hard fork to activate.
```

**Emergency plan.** In 2024-03, Vitalik proposed a "quantum emergency hard fork". It is a research post with no EIP [14] (E56). It has four steps:
1. roll back to before the mass theft;
2. disable EOA transactions;
3. add smart-wallet transactions;
4. users prove with a STARK that they know the seed behind their key, then switch to new validation code.

## O Starknet, Aztec and other projects {depth=2}
As of 2026-10-16, no project is PQ end to end. Everything live on mainnet is a partial component [26][27][30] (O54).

| Project | Live | Roadmap / research |
|---|---|---|
| Starknet | STARK proving layer; OS / class hash on BLAKE2s; 1 Falcon account demo | state tree, addresses, consensus, DA; "PQ L1 by 2027" only under consideration |
| Aztec | apps can choose signatures; hashed public keys; off-chain note delivery | three selection milestones in 2027; full migration by 2030 |
| Optimism | — | retire ECDSA EOAs by 2036-01; sequencer and batcher to PQ signatures |
| Algorand | Falcon state proofs (2022); native Falcon-1024 accounts (2026-08) | VRF and participation keys still Ed25519 |
| Zcash | recoverable notes (NU6.3, 2026-07-28) | Recovery Protocol not in consensus |
| Bitcoin | — | BIP-360 P2MR, BIP-361 legacy signature sunset, both Draft |
| Solana | app-level Winternitz vault (unaudited) | Falcon chosen, no timeline |
| SP1 | — | VEIL: replace Groth16 with a hash-based wrapper, no date |

**Starknet**: no new progress since our 10-14 report. The Migration Register is still the 2026-08-19 version [26] (O1–O3). Starknet's edge comes from two design choices: a hash-based proving layer, and native accounts whose signature scheme the protocol does not fix. But the official answer to "Is Starknet quantum-resistant?" is "No. Not as a single system-wide claim." [26].

**Aztec** (2026-10-15, by Zac Williamson and Mike Connor) [23]:
- Two targets: hardened libraries and dev patterns against HNDL by 2027-02; full migration by 2030 (O5).
- Three selection milestones: signatures 2027-03, public-key encryption 2027-07, proof system 2027-11 (O6).
- The hard part of the proof system is recursion. Fast PQ proofs are about 300 KB, against Aztec's current ~20 KB. 2-to-1 aggregation must take about 20–100 ms on a modern CPU to be practical (O8, O9).
- Addresses: move the keys baked into the address to a keystore registry, so the address becomes a plain hash (O10).
- Hashes: replace Poseidon2 with BLAKE2s / BLAKE3 in the long run, likely following the EF's choice (O11).
- The authors think Q-day within 4 years is unlikely (O12).

**Optimism** (2026-01-14, Karl Floersch) [25]:
- OP Labs commits to retire ECDSA EOAs within 10 years, subject to governance approval. By 2036-01, every EOA must delegate key management to a PQ smart account (O18).
- The sequencer and batch submitter move to PQ signatures; the signature scheme is not chosen (O19, O20).
- The post does not mention the proposer, fault proofs or L1 contract upgrade permissions (O21).
- Mantle is not in the superchain-registry, so this roadmap does not bind Mantle automatically (M37, M40).

**Algorand's migration semantics** are a useful contrast. After a user rekeys to a PQ address, the address stays the same and "only the Falcon key can authorize"; the old key loses its power [27] (O26). EIP-7702 works the other way: after delegation, the old ECDSA key keeps its authority. That is why Optimism needs a protocol-level retirement of ECDSA transactions in 2036 as a backstop (O53).

```timeline
2022 | Algorand | Falcon state proofs on mainnet
2026-01-14 | Optimism | Superchain PQ roadmap
2026-07-08 | Starknet v0.14.3 | OS hash moves to BLAKE2s
2026-07-28 | Zcash NU6.3 | recoverable notes live
*2026-08 | Algorand v5.0.0 | native Falcon accounts
2026-08-18 | Sui | chooses ML-DSA-65 / SLH-DSA
*2026-10-15 | Aztec | choose in 2027, migrate by 2030
2036-01 | Optimism target | retire ECDSA EOAs
```

```finding F13 high
# Peers share one order: accounts and hash-based proofs first; consensus, DA and settlement last
claim: Every live PQ component sits in the account layer, in historical proofs or in a recoverable format. The surveyed projects leave consensus signature aggregation, DA commitments and L1 settlement until later. L2s that settle on Ethereum also depend on Ethereum's consensus and DA migration.
evidence: [observed] Algorand native accounts and State Proofs [27] (O23, O27); Zcash ZIP 2005 / 258 [30] (O44–O46); Starknet Register [26] (O1, O3); Aztec's requirement list [23] (O7); Optimism roadmap [25] (O19–O21). [inferred] Cross-project synthesis (O54, O55, X16).
implication: If Mantle follows the same order, it does not fall behind its peers. Accounts and permissions come first, then proofs with Succinct, and last the L1 switch for consensus and DA.
```

```finding F14 high
# Aztec schedules "protect data today" apart from "migrate everything later"
claim: Aztec judges that apps can defend private data against HNDL now (hashed public keys, off-chain delivery, hardened libraries), so it targets 2027-02 for that. The proof system, protocol keys and validator signatures need more time, so it targets 2030 for them. Aztec also requires formally verified implementations for all new cryptography.
evidence: [observed] The two targets, three milestones and "conservative" stance in the Aztec blog [23] (O5, O6, O13, T63).
implication: Mantle can reuse this split. Plan "work that lowers risk now" (inventory, permissions, app-level encryption) apart from "work that depends on upstream" (proofs, consensus, DA). Accept each on its own terms.
```

## P Mantle today: on-chain checks {depth=2}
The facts below come from Ethereum mainnet and Mantle RPC reads on 2026-10-15/16 [37]. The contract list comes from the L2BEAT configuration [35].

```uml q="How does L1 accept one Mantle state root, and what cryptography does each step rely on?" read="The highlighted part is proof verification on L1. It decides whether L1 accepts the state root behind Alice's withdrawal. Brackets show the cryptography each step relies on." takeaway="Whether L1 accepts Mantle's state comes down to one BN254 PLONK verification. Succinct's multisig controls the routes, and Mantle's 6/14 multisig controls the verifier address."
sequenceDiagram
  autonumber
  participant A as Alice
  participant P as proposer EOA
  participant O as L2OutputOracle
  participant G as SP1 Gateway
  participant V as PLONK verifier
  participant X as OptimismPortal
  Note over A: Alice signs an L2 withdrawal tx [ECDSA]
  Note over A,P: batcher posts the txs as a blob [ECDSA + KZG]
  P->>O: proposeL2Output(root, proof) [ECDSA]
  rect rgb(234, 241, 251)
    O->>G: verifyProof(vkey, proof)
    G->>V: route by first 4 bytes of proof
    V-->>O: BN254 pairing check passes
  end
  Note over O: 12-hour finalization
  A->>X: prove + finalize [keccak + MPT]
```

| Fact (2026-10-15/16) | Reading |
|---|---|
| State submission contract | OPSuccinctL2OutputOracle v2.0.1, `optimisticMode = false` |
| Latest proof | 964 B, route `0x5a093a2f` → SP1 v6.1.0 PLONK |
| Gas per submission | 431,530 |
| proposer / batcher | both EOAs; the proposer is on an allowlist |
| Upgrade authority | ProxyAdmin → 6/14 Safe, no timelock |
| Challenger and Guardian | 3/7 Safe |
| Gateway owner | Succinct 2/3 Safe |
| DA | type-3 blobs (Arsia removed the EigenDA path) |
| L2 features | accepts 7702 txs; has a P-256 precompile |

```finding F2 high
# Mantle's state security rests on one BN254 proof and a set of ECDSA multisigs
claim: The latest state submission on 2026-10-15 carried a 964-byte proof routed to SP1 v6.1.0's PLONK verifier, which relies on BN254 pairings. The ProxyAdmin owner is a 6/14 Safe directly, with no timelock. It can upgrade the core rollup contracts with no timelock (the MNT token has a separate 1-day timelock). As Oracle owner, it can also change the verifier address and vkey. The batcher, proposer and sequencer signer are EOAs.
evidence: [observed] On-chain reads [37] (K1, K2, K5, K10, K11, K13); the Oracle source in Mantle's fork [34] (M12, M13); L2BEAT risk rating, "no delay on code upgrades (CRITICAL)" [35] (M18). [inferred] Final verification relies on BN254 pairings (K3); all these keys are secp256k1 ECDSA (K17).
implication: A quantum attacker does not need to steal user keys one by one. Six compromised Safe signer keys can seize upgrade authority. A forged PLONK proof, submitted through an allowlisted proposer, can corrupt bridge state (X2, X3).
```

**Responsibility boundary**: Fig 7 sorts Mantle's components into three groups by who can change them.

```excalidraw q="Which Mantle PQ work can Mantle do alone, which needs upstream partners, and which can only wait for Ethereum?" read="Green = Mantle on its own; yellow = with Succinct / Optimism; gray dashed = inherited from Ethereum." takeaway="The green column can start now, and it is also where quantum attacks have the most leverage." kind=responsibility-map
{"grid": {"w": 370, "h": 84}, "defaults": {"w": 290, "h": 56, "fontSize": 16},
 "nodes": [
   {"id": "a1", "label": "L1 multisigs, timelock", "col": 0, "row": 0, "color": "green", "strokeWidth": 3},
   {"id": "a2", "label": "proposer / batcher keys", "col": 0, "row": 1, "color": "green"},
   {"id": "a3", "label": "L2 accounts, precompiles", "col": 0, "row": 2, "color": "green"},
   {"id": "a4", "label": "App checks, emergency plan", "col": 0, "row": 3, "color": "green"},
   {"id": "b1", "label": "SP1 wrapper, Gateway routes", "col": 1, "row": 0, "color": "yellow", "strokeWidth": 3},
   {"id": "b2", "label": "L1-side proof aggregation", "col": 1, "row": 1, "color": "yellow"},
   {"id": "b3", "label": "OP Stack code changes", "col": 1, "row": 2, "color": "yellow"},
   {"id": "c1", "label": "Consensus BLS → leanXMSS", "col": 2, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "c2", "label": "Blob KZG → leanDA", "col": 2, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "c3", "label": "L1 account layer (8141)", "col": 2, "row": 2, "color": "gray", "stroke": "dashed"}
 ],
 "edges": [],
 "boxes": [
   {"label": "Own", "around": ["a1", "a2", "a3", "a4"], "pad": 22, "color": "green"},
   {"label": "Partner", "around": ["b1", "b2", "b3"], "pad": 22, "color": "yellow"},
   {"label": "Inherit", "around": ["c1", "c2", "c3"], "pad": 22, "color": "gray"}
 ]}
```

## Q Not just waiting: what Mantle can do {depth=2}
These are recommendations based on the evidence above. Mantle has not reviewed them internally.

```finding F15 medium
# Mantle can move before Ethereum, and it has done so before
claim: Mantle enabled a P-256 precompile through RIP-7212 before L1 shipped EIP-7951. It uses its own named hard forks (Skadi, Limb, Arsia) to follow or get ahead of EVM features. Safe multisigs also accept EIP-1271 contract signers, which can check PQ signatures in a contract without waiting for L1 AA.
evidence: [observed] the Limb changelog and reads at Mantle blocks from 2025-05 and 2025-10 show a P-256 precompile before Fusaka (2025-12-03) [36][37] (M33, K22, E7); Safe contract signatures, v=0 [37] (K21); Fireblocks ML-DSA-44 verification at ~1.23M gas [40] (P31). [inferred] PQ precompiles can ship early, but FIPS 206 is not final, so a Falcon interface risks rework (X5, X6); Mantle can replace multisig signers with PQ signers step by step (X19).
implication: The PQ signer contracts must have no ECDSA authorization or upgrade bypass, or an attacker can skip the PQ check (X19). 7702 accounts are the exception. A PQ module does not remove the ECDSA root authority; Mantle needs a protocol-level k1 retirement similar to EIP-8151 (X7).
```

```finding F16 medium
# Making the proof path PQ needs Succinct, and the old route must be frozen
claim: One state submission costs about 431k gas today. Verifying a PQ STARK directly on L1 costs on the order of 10M gas, and the calldata alone is about 4.9M gas. Succinct's public direction is to replace Groth16 with a hash-based wrapper (VEIL), with no date. Succinct's 2/3 Safe manages the Gateway, and adding or freezing routes does not go through Mantle.
evidence: [observed] On-chain gasUsed [37] (K4); Vitalik's gas magnitudes [15] (E53); VEIL blog [32] (O38); Gateway owner and source [34][37] (K6, K7). [inferred] Calldata cost of a ~300 KiB proof (P49); a Succinct hash-based wrapper and L1-side aggregation (such as EIP-8288) must move together (X8, X14).
implication: This is the hardest item for Mantle to finish alone. What it can do now is write the requirements, acceptance criteria and route-freeze procedure into its partnership plan with Succinct.
```

**Six workstreams** (the first three depend on no upstream party):

1. **Publish a cryptography dependency inventory.** Follow the Starknet Migration Register format. List five fields per component: algorithm, key holder, the permission that can change it, PQ status, upstream dependencies (X9). Start with the 9 items in the panel P table.
2. **Tighten permissions.** Add an upgrade timelock to the ProxyAdmin. Assess moving the batcher and proposer to multisigs or restricted roles. Replace Safe signers step by step with EIP-1271 PQ signer contracts. These contracts must have no ECDSA bypass (X12, X19). These steps also cut today's classical risk; L2BEAT already rates upgrades with no delay as CRITICAL (M18).
3. **Prototype PQ accounts.** Build an ML-DSA smart account on Mantle with ERC-4337 / ERC-1271. Following Algorand's semantics, test whether a leaked old ECDSA key can bypass the new account. Also assess shipping PQ precompiles and a k1 retirement in a Mantle hard fork (X6, X7).
4. **Design the proof path with Succinct.** Write four acceptance criteria (X4, X8, X14):
   - what L1 verifies last does not rely on elliptic curves;
   - dual proofs during the transition use AND;
   - Succinct freezes the old route after the switch;
   - the plan includes L1 gas and latency estimates.
5. **Follow L1.** Track Hegotá (8141), K* (PQ attestations) and leanDA. Prepare the switch of blob transaction versions and the activation of 8141 / 8151 on Mantle (E61, E65).
6. **Emergency plan and audits.** Write a Q-day plan: who can pause, who can change the verifier, and do those permissions rely on ECDSA. Require AI-assisted audits and formal verification for every new cryptographic component (X13, X18).

```timeline v
*2026 Q4 | Inventory and permissions | publish the inventory; assess an upgrade timelock
2027 H1 | Account prototype | ML-DSA smart account; old-key bypass drill
2027 H2 | Proof path | acceptance criteria with Succinct; assess PQ precompiles
2028 | Testnet | k1 retirement, PQ-signer multisig, route-switch drill
*2029 | Follow L1 | align with the PQ forks after Hegotá
```

The phases above are a speculative recommendation (X15, [speculative]). The dates depend on three things: Succinct's progress, the FIPS 206 release date, and Ethereum's fork cadence. The window itself is uncertain. Suppose Ethereum finishes L1 PQ in 2029-12 and a CRQC arrives in the early-to-mid 2030s. Then an L2 that migrates only after L1 has just a few years left (X11, [speculative]).

```callout warn CAUTION
In public statements, give PQ status per component and with a date, for example "Mantle supports ML-DSA smart accounts (testnet)". Until the proof path, L1 permissions and account root authority have all migrated, do not use blanket claims such as "Mantle is quantum-resistant" or "PQ-ready".
```

**How to measure progress** (suggested metrics):

| Metric | What it measures |
|---|---|
| Inventory coverage | whether every key component lists its algorithm, permissions and dependencies |
| ECDSA-only critical permissions | how many permissions still rest on a single ECDSA key |
| Old-key bypass drill | whether a leaked old ECDSA key can take back a PQ account |
| Assumptions of final L1 verification | whether it still relies on BN254 / KZG |
| Unfrozen old routes | whether the proof gateway is still OR |

## R Limits and open questions {depth=2}
- **Public sources only**: Mantle's HSM / KMS custody and the key types of Safe signers are not public (M59, [speculative]). We did not compare the bytecode of the on-chain implementation `0x4059…6f50` with the `mantle-v1.6.1` source.
- **No PQ verification rerun**: gas figures come from repository READMEs and EIP pricing, not from measurements on Mantle.
- **Quantum impact on SP1's inner layer**: the Hypercube memory argument uses an extension-field curve. No public analysis shows whether a quantum attacker can exploit it (P59, M45, [speculative]).
- **Upstream timelines**: there is no date for Succinct removing the BN254 wrapper, for FIPS 206, or for Ethereum's canonical hash function. Whether VEIL becomes SP1's production L1 path is speculation (M51, [speculative]).
- **Whether Mantle follows Optimism's PQ hard fork**: no public information (M60, [speculative]).
- **Conflicting data**:
  - estimates of BTC with exposed public keys range from 1.7M to 8.18M depending on the method (O32);
  - ethereum.org's PQ signature sizes disagree with EIP-8292 (E68);
  - L2BEAT's record of Mantle's proof routes lags the chain (M8, K8).
- **No primary source found**: a 2026-06 executive order turning NIST's 2030 date into a federal compliance deadline (T67); which paper Aztec's "small-field Poseidon breaks" refers to (T68); official PQ plans for Arbitrum, Polygon and Scroll (O51, O52). The ledger marks all of them speculative.

## S Method and evidence {depth=3}
**Method**: five research lanes ran in parallel. Each lane wrote one notebook, and the main session merged the notebooks into one ledger:
- T: quantum threat and AI
- P: PQ basics and proof systems
- E: Ethereum
- O: other projects
- M: Mantle public sources

The main session also ran on-chain checks with `cast` (K) and wrote the cross-lane synthesis (X). We traced every claim to a primary source: NIST standards, EIPs, official EF texts, project blogs and source code, and mainnet RPC. The external research (ChatGPT Deep Research) served only as leads [44].

**Main-session spot checks** (2026-10-16): 3 checks, all consistent with the ledger.
- the status of 8141, 8151 and 8355 in EIP-8081;
- the Optimism text on 2036 and the sequencer;
- the qubit numbers in the Google blog.

**Corrections to the external research**:
- "EIP-8141 is still Draft": Hegotá lists it as Scheduled for Inclusion, with mainnet expected in 2027 Q2 (E23, E24).
- Listing 7885 / 8051 / 8052 as directions to track: it misses that no fork includes them and that Hegotá declined EIP-8355 (E27, E28).
- "HAWK is a candidate": it withdrew on 2026-07-29 (P11).
- "SP1 is a STARK inside": the inner layer also has an extension-field elliptic-curve assumption (P56, O36).
- Mantle's proof path: the chain shows PLONK v6.1.0, not Groth16; the old sp1turbo route that L2BEAT records was frozen on 2026-10-09 (K2, K8).
- "Mantle posts via blobs or calldata": the chain shows blobs only (M23, K14).
- Scope of Optimism's roadmap: the text does not cover the proposer or L1 permissions (O21).
- Algorand v5.0.0: GPT cited the wrong source (O56).
- ethereum.org, "the KZG ceremony is quantum-safe": wrong given how KZG works (T23, E52).

## T Reproduce {depth=3}
Environment: Foundry `cast` and public RPCs. The commands run as written; results change with new blocks.

```bash title="Mantle's L1 proof path and permissions"
R=https://ethereum-rpc.publicnode.com
O=0x31d543e7BE1dA6eFDc2206Ef7822879045B9f481   # OPSuccinctL2OutputOracle
cast call $O "verifier()(address)" --rpc-url $R       # 0x3B60…185e (Gateway)
cast call $O "optimisticMode()(bool)" --rpc-url $R    # false
cast call $O "owner()(address)" --rpc-url $R          # 0x4e59…D40f
cast call 0x4e59e778a0fb77fBb305637435C62FaeD9aED40f \
  "getThreshold()(uint256)" --rpc-url $R              # 6 (14 owners)
cast call 0xca35F8338054739D138884685e08b39EE2217794 \
  "owner()(address)" --rpc-url $R                     # ProxyAdmin → same Safe
```

```bash title="Which verifier the latest proof used"
G=0x3B6041173B80E77f038f3F2C0f9744f04837185e
T=0xeae80e604a5000669bdbf085e5dd3b6a51177c405744dcb011188ea53697e812
cast tx $T input --rpc-url $R | cut -c1-10            # 0x9ad84880 (ZK mode)
cast call $G "routes(bytes4)(address,bool)" \
  0x5a093a2f --rpc-url $R                             # 0xc3c6…AF2A, false
cast call 0xc3c6dDDAc8829b233Dc6536Ec024775a57b0AF2A \
  "VERSION()(string)" --rpc-url $R                    # "v6.1.0" (PLONK)
cast call $G "routes(bytes4)(address,bool)" \
  0xd4e8ecd2 --rpc-url $R                             # v5.0.0 route, true (frozen)
```

```bash title="P-256 and 7702 on Mantle L2"
M=https://rpc.mantle.xyz
# P-256: a valid RIP-7212 test vector (split over 5 lines)
IN=0x4cee90eb86eaa050036147a12d49004b6b9c72bd725d39d4785011fe190f0b4d
IN+=a73bd4903f0ce3b639bbbf6e8e80d16931ff4bcf5993d58468e8fb19086e8cac
IN+=36dbcd03009df8c59286b162af3bd7fcc0450c9aa81be5d10d312af6c66b1d60
IN+=4aebd3099c618202fcfe16ae7770b0c49ab5eadf74b754204a3bb6060e44eff3
IN+=7618b065f9832de4ca6ca971a7a1adc826d0f7c00181a5fb2ddf79ae00b4e10e
cast call 0x0000000000000000000000000000000000000100 \
  --data $IN --rpc-url $M                             # returns …01
# 7702: estimate gas with one authorization tuple, returns 0xb57e
A=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
curl -s $M -H 'content-type: application/json' -d '{
 "jsonrpc":"2.0","id":1,"method":"eth_estimateGas",
 "params":[{"from":"'$A'","to":"'$A'","type":"0x4",
  "authorizationList":[{"chainId":"0x1388",
   "address":"0x000000000000000000000000000000000000dEaD",
   "nonce":"0x1","yParity":"0x0","r":"0x1","s":"0x1"}]}]}'
```

## U Glossary {depth=2}
```glossary
PQ | post-quantum | Cryptography that runs on ordinary computers and aims to resist quantum computers. | not quantum communication; needs no quantum hardware
CRQC | cryptographically relevant quantum computer | A quantum computer that can actually break today's public-key cryptography. | not today's chips with a few hundred qubits
Q-day | — | The day a CRQC exists and elliptic-curve cryptography fails. | no reliable date
Logical qubit | — | A reliable compute unit built from hundreds of physical qubits with error correction. | not the physical qubit count on a chip
Shor's algorithm | — | A quantum algorithm that efficiently solves discrete logs and integer factoring. | does not affect hashes
Grover's algorithm | — | A quantum search algorithm that takes the square root of the number of tries and parallelizes poorly. | does not break AES or SHA-256
HNDL | harvest now, decrypt later | Store ciphertext today and decrypt it with a future quantum computer; hurts confidentiality only. | does not affect public-chain signatures
ECDSA | secp256k1 signature | The elliptic-curve signature used by EOA transactions and multisig signers. | not PQ
BLS | BLS12-381 signature | Ethereum's validator signature; many signatures aggregate into 96 bytes. | PQ replacements lack this native aggregation
KZG | KZG commitment | A spot-checkable "math fingerprint" of blob data that relies on a trusted setup. | not a hash commitment
Trusted setup | setup ceremony | A multi-party ceremony that generates a proof system's structured reference string (SRS), which hides a secret number τ. | the SRS is the output, not the ceremony; the ceremony does not stop a quantum attacker
BN254 | alt_bn128 | The pairing curve that Ethereum precompiles support; L2s use it to verify SNARKs on L1. | EIP-2537 authors put its classical security at about 80 bits; broken under quantum
PLONK | — | A SNARK proof format; Mantle's final proof is PLONK on BN254. | not a STARK
STARK | — | A proof system that relies only on hashes; considered plausibly PQ; proofs are large. | a STARK inside does not make final verification PQ
Wrapper | SNARK wrap | Compresses a large STARK proof into a small PLONK / Groth16 proof for cheap L1 verification. | the wrapper layer decides final quantum safety
ML-DSA | FIPS 204 | NIST's standardized lattice signature; an ML-DSA-44 signature is 2,420 bytes. | not ML-KEM
Falcon | FN-DSA / FIPS 206 | A lattice signature with small signatures (666 bytes); FIPS 206 is not out yet. | FN-DSA is not compatible with current Falcon
SLH-DSA | FIPS 205 | A stateless hash-based signature with conservative assumptions; signatures start at 7.9 KB. | not XMSS
XMSS | stateful hash-based signature | Each key signs a limited number of times, and reusing state allows forgery; Ethereum's leanSig is a variant. | cannot be backed up and rolled back freely
ML-KEM | FIPS 203 | A lattice key encapsulation scheme for shared keys. | cannot sign transactions
Hybrid signature | composite | Uses a classical and a PQ signature together; both must pass (AND). | OR mode gives no dual-algorithm security
EIP-7702 | SetCode transaction | Lets an EOA delegate to contract code, but the original ECDSA key can still rewrite the delegation and send transactions. | does not remove the ECDSA root authority
EIP-8141 | Frame Transaction | Splits a transaction into validation, payment and execution frames, with account-defined validation; scheduled for Hegotá. | carries no PQ signature scheme itself
k1 retirement | k1 exit | Stops a migrated account from accepting secp256k1 authorization, as in EIP-8151. | not a ban on the whole EOA system
MV-PQ | minimum viable PQ | The EF fallback milestone in J*, which keeps Ethereum running after Q-day with weaker guarantees. | not a full migration
leanVM | — | The EF's minimal zkVM for aggregating hash-based signatures; not yet production ready by its own account. | not a general zkEVM
OP Succinct | — | Replaces OP Stack fault proofs with SP1 validity proofs; Mantle has used it since 2025-09. | not an OP Labs product
SP1 Gateway | SP1VerifierGateway | A contract that routes proofs by their first 4 bytes to different verifier versions; managed by a Succinct multisig. | routes are combined with OR
```

## V References {depth=2}
1. [pq.ethereum.org](https://pq.ethereum.org/) — the EF PQ team's roadmap table, FAQ and L2 readiness list (last updated 2026-06-27). **PRIMARY**
2. [ethereum.org: Post-quantum cryptography](https://ethereum.org/roadmap/security/quantum-resistance/) and the Hegotá / Glamsterdam pages — four vulnerable areas, the PQ team, fork timing; some claims are stale. **PRIMARY**
3. [EF: Current and Emerging Priorities (2026-09-07)](https://blog.ethereum.org/2026/09/07/protocol-priorities) — the "December 2029, three layers" target, MV-PQ, fork cadence. **PRIMARY**
4. [EF: Hegotá EIP Tier List (2026-09-07)](https://blog.ethereum.org/2026/09/07/protocol-hegota-eips) — EIP-8355 "premature standardization", the k1-exit bundle. **PRIMARY**
5. [EIP-8081 Hegotá meta](https://eips.ethereum.org/EIPS/eip-8081) — the SFI / CFI / PFI / Declined lists. **PRIMARY**
6. [ethereum/strawmap changelog](https://github.com/ethereum/strawmap) and [strawmap.org](https://strawmap.org/) — placeholder forks and the moves of PQ items. **PRIMARY**
7. [EIP-8141 Frame Transaction](https://eips.ethereum.org/EIPS/eip-8141) — the signature scheme table and PQ motivation. **PRIMARY**
8. [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702), [EIP-4844](https://eips.ethereum.org/EIPS/eip-4844), [EIP-197](https://eips.ethereum.org/EIPS/eip-197) — authorization, KZG, BN254 precompiles. **PRIMARY**
9. [EIP-8151](https://eips.ethereum.org/EIPS/eip-8151) — an old k1 key can still authorize through `ecrecover` after migration; impact on L2s. **PRIMARY**
10. [EIP-8288](https://eips.ethereum.org/EIPS/eip-8288) — block-level aggregation of PQ signatures and STARKs (Draft). **PRIMARY**
11. [EIP-8292](https://eips.ethereum.org/EIPS/eip-8292) — the consensus aggregator role (Draft). **PRIMARY**
12. [EIP-8051](https://eips.ethereum.org/EIPS/eip-8051), [EIP-8052](https://eips.ethereum.org/EIPS/eip-8052), [EIP-7885](https://eips.ethereum.org/EIPS/eip-7885) — PQ verification precompiles (all Draft). **PRIMARY**
13. [leanEthereum/leanVM @127510d1](https://github.com/leanEthereum/leanVM) and leanSig @c08a3bae — 128-bit ROM / 64-bit QROM, not production ready. **PRIMARY**
14. [Vitalik: quantum emergency hard fork (2024-03-09)](https://ethresear.ch/t/how-to-hard-fork-to-save-most-users-funds-in-a-quantum-emergency/18901) — the address definition and the emergency recovery plan. **PRIMARY**
15. [Vitalik post on X (2026-02-26)](https://x.com/VitalikButerin/status/2027075026378543132) — four vulnerable areas and gas magnitudes. **PRIMARY**
16. [Google Research blog (2026-03-31)](https://research.google/blog/safeguarding-cryptocurrency-by-disclosing-quantum-vulnerabilities-responsibly/) — ECDLP-256 resource estimates, ~20× reduction. **PRIMARY**
17. [Babbush et al., arXiv 2603.28846v2](https://arxiv.org/abs/2603.28846) — resource and hardware assumptions, three attack kinds, quantified Ethereum exposure. **PRIMARY**
18. [NIST IR 8547 ipd](https://csrc.nist.gov/pubs/ir/8547/ipd), [IR 8105](https://nvlpubs.nist.gov/nistpubs/ir/2016/NIST.IR.8105.pdf), [PQC FAQ](https://csrc.nist.gov/projects/post-quantum-cryptography/faqs) — quantum impact, migration dates, the position on symmetric algorithms. **PRIMARY**
19. [NIST PQC standardization page](https://csrc.nist.gov/projects/post-quantum-cryptography/post-quantum-cryptography-standardization) and the round 3 additional signatures page — FIPS 206 status, HAWK withdrawal. **PRIMARY**
20. [FIPS 204](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.204.pdf), [FIPS 205](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.205.pdf), [Falcon spec](https://falcon-sign.info/falcon.pdf), [RFC 8391](https://datatracker.ietf.org/doc/html/rfc8391) — size tables. **PRIMARY**
21. [GRI Quantum Threat Timeline Report 2025](https://globalriskinstitute.org/publication/quantum-threat-timeline-report-2025b/) — expert probability survey. **PRIMARY**
22. [Anthropic: Discovering cryptographic weaknesses (2026-07-28)](https://www.anthropic.com/research/discovering-cryptographic-weaknesses), the HAWK paper and [nist.gov/pqc](https://www.nist.gov/pqc) — the HAWK and 7-round AES results and their limits. **PRIMARY**
23. [Aztec: Post-Quantum Aztec (2026-10-15)](https://aztec.network/blog/post-quantum-aztec) — two targets, three milestones, proof system requirements. **PRIMARY**
24. [Aztec Docs: Keys](https://docs.aztec.network/developers/docs/foundational-topics/accounts/keys) — protocol keys and address derivation. **PRIMARY**
25. [Optimism: A Post-Quantum Roadmap for the Superchain (2026-01-14)](https://optimism.io/blog/a-post-quantum-roadmap-for-the-superchain) — the 2036 timeline and its scope. **PRIMARY**
26. [StarkWare Quantum Hub Migration Register](https://quantum.starkware.co/migration-register) and the research-hub report starknet-account-model — Starknet's per-component PQ status. **PRIMARY**
27. [Algorand v5.0.0](https://algorand.co/blog/algorand-v5.0.0-is-here.-heres-what-it-means-for-you), [Post-Quantum Accounts](https://dev.algorand.co/concepts/accounts/post-quantum), [PQ technology page](https://algorand.co/technology/post-quantum) — native Falcon accounts and remaining work. **PRIMARY**
28. [BIP-360](https://github.com/bitcoin/bips/blob/master/bip-0360.mediawiki), [BIP-361](https://github.com/bitcoin/bips/blob/master/bip-0361.mediawiki) — Bitcoin's P2MR and legacy signature sunset (Draft). **PRIMARY**
29. [Solana Foundation](https://solana.com/news/quantum-readiness) and [Anza (2026-04-27)](https://www.anza.xyz/blog/securing-solana-against-a-powerful-quantum-adversary) — Falcon choice and migration discussion. **PRIMARY**
30. [ZIP 2005](https://zips.z.cash/zip-2005), [ZIP 258](https://zips.z.cash/zip-0258) — Zcash recoverable notes and NU6.3. **PRIMARY**
31. [SP1 Security Model](https://docs.succinct.xyz/docs/sp1/security/security-model) and [Proof Types](https://docs.succinct.xyz/docs/sp1/generating-proofs/proof-types) — BN254 wrapper, extension-field curve assumption, gas. **PRIMARY**
32. [Succinct: VEIL (2026-05-01)](https://blog.succinct.xyz/veil/) — the plan to replace Groth16 with a hash-based wrapper. **PRIMARY**
33. [a16z crypto: Lattice Jolt (2026-09-09)](https://a16zcrypto.com/posts/article/lattice-snarks-jolt-post-quantum-faster/) — lattice SNARK, proofs under 100 KB, no ZK yet. **PRIMARY**
34. [mantle-xyz/op-succinct `OPSuccinctL2OutputOracle.sol` @mantle-v1.6.1](https://github.com/mantle-xyz/op-succinct) and [sp1-contracts `SP1VerifierGateway.sol`](https://github.com/succinctlabs/sp1-contracts/blob/main/contracts/src/SP1VerifierGateway.sol) — proof verification, permissions, route semantics. **PRIMARY**
35. [L2BEAT: Mantle](https://l2beat.com/scaling/projects/mantle) and the config `packages/config/src/projects/mantle` @cd994874 — contract list, roles, risks, milestones. **PRIMARY**
36. [Mantle Docs](https://docs.mantle.xyz/network) — the OP Succinct upgrade and the Skadi / Limb / Arsia changelogs. **PRIMARY**
37. Ethereum mainnet and Mantle RPC reads (this report, [panel T](#panel-T), 2026-10-15/16), and the [Safe contract signature docs](https://docs.safe.global/advanced/smart-account-signatures). **PRIMARY**
38. [IETF draft-ietf-lamps-pq-composite-sigs-19](https://datatracker.ietf.org/doc/draft-ietf-lamps-pq-composite-sigs/) — strict AND for composite signatures. **PRIMARY**
39. [Cloudflare: Is your domain using post-quantum encryption? (2026-09-29)](https://blog.cloudflare.com/post-quantum-visibility/) — about 70% of browser traffic on hybrid ML-KEM. **PRIMARY**
40. [ZKNOX ETHFALCON](https://github.com/ZKNoxHQ/ETHFALCON), [ETHDILITHIUM](https://github.com/ZKNoxHQ/ETHDILITHIUM), [Fireblocks evm-ml-dsa-verifier](https://github.com/fireblocks-labs/evm-ml-dsa-verifier) — gas for PQ verification on the EVM. **PRIMARY**
41. [EF KZG ceremony FAQ](https://github.com/ethereum/kzg-ceremony/blob/main/FAQ.md) — the 1-of-N assumption and what a leaked secret allows. **PRIMARY**
42. [RISC Zero Security Model](https://dev.risczero.com/api/security-model) — quantum-safety labels for the STARK and Groth16 layers. **PRIMARY**
43. [Sui: PQ signature schemes (2026-08-18)](https://www.sui.io/blog/suis-post-quantum-signature-schemes) — ML-DSA-65 / SLH-DSA choice and timeline. **PRIMARY**
44. ChatGPT Deep Research (`research/from-aztec-pq-to-mantle-pq.md`) — leads only; corrections in panel S.

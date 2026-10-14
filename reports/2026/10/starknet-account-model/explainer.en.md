---
template: research
lang: en
title: "Starknet's Account Model, Post-Quantum Migration, and STRK20 / Shadow Accounts"
subtitle: Starknet's PQ confidence rests on two structural choices — a hash-based STARK proving layer and native accounts whose signature scheme the protocol does not fix. But as of 2026-10-14, mainnet has moved only the proving layer and two hashes off elliptic curves, and "a fully quantum-resistant L1 by 2027" is an option under consideration with no defined scope. The confidentiality of STRK20 and Shadow Accounts rests on Stark-curve ECDH and does not inherit the proving layer's PQ property.
cols: 4
type: Technical research · dev onboarding
audience: Mantle Engineering researchers and developers who know EVM, AA and rollups, but not Cairo / Starknet or post-quantum cryptography
scope: Starknet native accounts vs. EVM account models; component-level crypto inventory and PQ status; Falcon-512 accounts; the three-phase PQ roadmap, the L1 pivot and Ethereum's 2029 target; the STRK20 privacy protocol; Shadow Accounts
evidence: 299-claim ledger (observed 254 / inferred 34 / speculative 11); source sequencer @54f97a8a, starknet-privacy @f9256c5e, starkware-starknet-utils @3e2fd53d, OZ cairo-contracts @5cf9010e, OZ cairo-pq-verifiers @bece5c07; Starknet mainnet RPC; Quantum Hub, official blogs and docs; accessed 2026-10-14
date: 2026-10-14 · v1
---
Bottom line: the Starknet protocol does not fix a signature scheme. Each account contract decides which signatures it accepts, so a move to PQ signatures needs no hard fork ([F1](#F1)). The proving layer uses hash-based STARKs and does not depend on elliptic curves either. These two facts are the real basis for "faster than Ethereum". But on mainnet v0.14.4, the state tries, contract addresses, default account signatures, consensus and DA are not yet PQ ([F4](#F4)).

"A PQ L1 by 2027" is an option from two posts on 2026-10-08, with no defined scope and no specification ([F6](#F6), [F8](#F8)). The confidentiality of STRK20 and Shadow Accounts uses Stark-curve ECDH, and the viewing public key is stored on-chain in plaintext. Once quantum attacks are practical, a user's private history and Shadow links can be rebuilt after the fact ([F11](#F11), [F14](#F14)).

## A Three topics, three layers {sheet meta="layers"}
```tree list
Starknet native accounts | Protocol calls entry points; the contract picks the scheme
  Default signature | Stark-curve ECDSA (not PQ)
  Falcon-512 account | 1 mainnet demo tx, experimental, unaudited
PQ migration | Three-phase roadmap, inside the L2 frame
  Live | Proving layer + OS hash + class hash
  Not live | State tries, addresses, consensus, DA, bridge
STRK20 privacy pool | Contract-level notes / nullifiers
  Shadow Account | Keyless proxy contract; hides the link to the main wallet
  Encryption layer | Stark-curve ECDH (not PQ)
```

## B Key numbers {sheet span=2 meta="2026-10-14"}
| Quantity | Value |
|---|---|
| Mainnet version | v0.14.4 |
| Account validation limit | 1,000,000 steps / 100M L2 gas |
| Falcon (standard SHAKE) validation | 61.9M L2 gas, about 385× ECDSA |
| Mainnet Falcon demo tx | 63.9M L2 gas, about 1.926 STRK |
| Roadmap Phase 1 | 1 of 3 items live |
| STRK20 pool fee | 2.5 STRK per `apply_actions` |
| Deployed Shadow Accounts | 173 |

## C PQ status by component {sheet meta="v0.14.4"}
| Component | Status |
|---|---|
| STARK proving layer | ok hash-based |
| OS / class hash | ok BLAKE2s |
| State tries, addresses | no Pedersen |
| Default account signature | no Stark-ECDSA |
| Consensus votes | no not signed yet |
| DA, L1 bridge | warn waits for Ethereum |
| STRK20 encryption | no ECDH |

## D 2027 and 2029 do not measure the same thing {sheet span=2 meta="scope"}
| Dimension | Starknet 2027 | Ethereum 2029-12 |
|---|---|---|
| Statement | "actively considering … target" | EF Protocol target |
| Scope | Not defined | Execution, consensus, data |
| Path | No L1 specification | Fork sequence + MV-PQ fallback |
| Consensus PQ | Vote signing still a TODO | Needs PQ attestations |

## E Timeline {sheet span=2 meta="2025–2026"}
```timeline
2025-09 | v0.14.0 | 3 sequencers run Tendermint
2026-04 | v0.14.2 | proof facts field; STRK20 pool deployed
2026-06-30 | PQ three-phase roadmap | Phase 1 estimate "about two months"
*2026-07-08 | v0.14.3 | OS hash moves to BLAKE2s
2026-07-22 | Falcon mainnet transfer | 0.01 STRK, experimental
2026-09-07 | First Shadow Account | Same day: EF posts its 2029 target
*2026-10-08 | "Considering becoming an L1" | Target 2027
```

## F Conclusion {sheet span=4}
```callout ok The confidence is real, but "fully quantum-resistant by 2027" has no testable scope yet
- Accounts: the protocol fixes no signature scheme, so PQ needs no hard fork. Existing accounts do not migrate by themselves, and the upgrade is still authorized with ECDSA (F1, F3).
- Cryptography: only the proving layer and two hashes have left elliptic curves. Falcon runs, but validation costs about 385× ECDSA and is unaudited (F4, F5).
- L1: the official word is "considering". Consensus, DA, the bridge and legacy-state migration have no plan yet (F6, F7, F8).
- Privacy: STRK20 hides data only from on-chain observers. Its encryption is ECDH, and one viewing key ties together all private history and Shadow links (F10, F11, F14).
- Where to start: accounts in panel J, PQ in K–M, privacy in N–P, acceptance checks in Q.
```

## G How to read this {depth=1}
```callout info You already know (not explained here)
- EVM accounts: an EOA signs with secp256k1 ECDSA, and the protocol recovers the address with `ecrecover`
- The basic shape of ERC-4337 and EIP-7702: UserOperation, bundler, EntryPoint, delegation code
- The basic shape of a rollup: a sequencer orders transactions, a proof is verified on L1, data goes to L1
- Basic hash functions, digital signatures and Merkle trees
- Zero-knowledge proofs as "proof that a computation followed the rules"
```
- **5 minutes**: read only the lead and overview panels A–F.
- **30 minutes**: also read [Background](#panel-I), [Accounts](#panel-J), [Crypto inventory](#panel-K), [Falcon-512](#panel-L), [Roadmap and L1](#panel-M), [STRK20](#panel-N), [Shadow Account](#panel-O), [PQ × privacy](#panel-P) and [Acceptance checks](#panel-Q).
- **Developers who will re-check it**: also read [Method and evidence](#panel-S) and [Reproduce](#panel-T). The commands run as written.

**Running example**: Alice has an OpenZeppelin (OZ) default account that signs with Stark-curve ECDSA. She deposits 100 USDC into the STRK20 privacy pool. She sends part of it privately to Bob. She puts the rest into a Vesu vault through a Shadow Account. Every panel on accounts, PQ and privacy follows Alice.

## H Context {depth=2}
**The problem**: on 2026-10-08, @Starknet posted: "We are actively considering becoming an L1. This would enable Starknet to become the first fully quantum-resistant network, with 2027 as our target."[13] The Ethereum Foundation (EF) Protocol target is December 2029 [15]. In the same weeks, StarkWare promoted Shadow Accounts for STRK20. We want to know two things. What gives Starknet the confidence to target a PQ L1 by 2027? How do its privacy protocol and Shadow Accounts work?

**Why now**: Mantle research requires that every output is checked against deterministic evidence. Starknet's account and PQ story is now widely quoted. We need to check it component by component: what is on mainnet, and what is only on the roadmap.

**Scope**:
- Starknet native accounts vs. EVM account models (EOA, ERC-4337, EIP-7702, Native AA proposals)
- A component-level crypto inventory, PQ status, and Falcon-512 accounts
- "A PQ L1 by 2027": the official wording, roadmap progress, L1 gaps, and the comparison with Ethereum 2029
- How STRK20 and Shadow Accounts work, and their privacy limits

**Non-goals**: investment advice and STRK price; a full security audit; local reruns of Cairo / Lean tests (scarb / snforge are not installed); security proofs of the cryptographic schemes themselves.

**Gaps in the existing material**: the external research (ChatGPT Deep Research) has the right frame [26]. It needs these fixes. Its Falcon cost table misses one row and reports resources, not fees. It merges two repositories that share the name s2morrow. Its note / nullifier / identity formulas drop the domain tags. It did not confirm that the proving service receives the viewing key. We checked each claim against source code, mainnet RPC and official docs (see [panel S](#panel-S)).

## I Background {depth=2}
```excalidraw q="Which concepts must you know first to follow this report, and in what order?" read="Gray dashed boxes are assumed knowledge. Blue boxes are cards. The green box is the subject. An arrow means learn first → learn after." takeaway="B-0 covers accounts, B-1 to B-3 cover PQ, B-4 and B-5 cover privacy. The three tracks meet at Starknet PQ and privacy." name=prereq-map kind=prerequisite-map
{"grid": {"w": 290, "h": 110}, "defaults": {"w": 220, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "aa", "label": "4337 / 7702 (known)", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "zk", "label": "ZK proofs (known)", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "hs", "label": "Hashes, signatures (known)", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 Native accounts", "col": 1, "row": 0, "color": "blue"},
   {"id": "b1", "label": "B-1 Quantum threat", "col": 1, "row": 2, "color": "blue"},
   {"id": "b2", "label": "B-2 Proof ≠ signature", "col": 1, "row": 1, "color": "blue"},
   {"id": "b3", "label": "B-3 Three hashes", "col": 2, "row": 2, "color": "blue"},
   {"id": "b4", "label": "B-4 Notes, nullifiers", "col": 2, "row": 1, "color": "blue"},
   {"id": "b5", "label": "B-5 ECDH, viewing key", "col": 2, "row": 0, "color": "blue"},
   {"id": "top", "label": "Starknet PQ and privacy", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "aa", "to": "b0"}, {"from": "zk", "to": "b2"}, {"from": "hs", "to": "b1"},
   {"from": "b1", "to": "b2"}, {"from": "b1", "to": "b3"}, {"from": "b1", "to": "b5"},
   {"from": "b2", "to": "b4"}, {"from": "b0", "to": "top"}, {"from": "b3", "to": "top"},
   {"from": "b4", "to": "top"}, {"from": "b5", "to": "top"}
 ]}
```

```prereq B-0 l1 4min
# Starknet native accounts
what: Starknet has no EOAs; every account is a contract. The protocol calls the account's `__validate__`, requires the return value `'VALID'`, then calls `__execute__` with the call list [1][2].
why: The signature scheme lives in the account contract, not in the protocol. This is why a move to PQ signatures needs no hard fork.
example:
~~~
INVOKE v3 → account.__validate__(calls)   // check signature, return 'VALID'
          → account.__execute__(calls)    // call each target contract
~~~
misconception: Myth: Starknet accounts are quantum-resistant by default. Fact: OZ default accounts and Braavos use Stark-curve ECDSA by default; the five signer types in Argent (Ready) contracts include no PQ type [4][5].
deeper: [2] docs.starknet.io "Accounts"
```

```prereq B-1 l1 4min
# What quantum computers break: Shor and Grover
what: [[Shor's algorithm]] solves elliptic-curve discrete logs in polynomial time. It breaks ECDSA, ECDH and the curve-based [[Pedersen]] hash. [[Grover's algorithm]] gives only a square-root speed-up on hash search, and larger parameters offset it [8].
why: To decide whether a component is PQ, ask whether it depends on discrete logs or only on hashes.
example: Public key `x(k·G)` is on-chain → a quantum attacker solves for `k` → forges signatures, or decrypts data encrypted to `k`.
misconception: Myth: no quantum computer exists today, so data posted today is safe. Fact: ciphertexts and public keys stay on-chain forever, so they can be harvested now and decrypted later ([[HNDL]]).
deeper: [8] Quantum Hub "Learn"
```

```prereq B-2 l1 3min
# A proof of correct execution ≠ a PQ signature
what: A [[STARK]] proves that a program ran by its rules. If that program checks an ECDSA signature, a signature forged with Shor is also accepted "correctly" [8].
why: Starknet's proving layer is PQ, but that does not make accounts, addresses or privacy encryption PQ.
example: Quantum Hub: "A post-quantum proving layer does not migrate account signatures by implication."
misconception: Myth: STARKs make the whole chain quantum-resistant. Fact: the official answer to "Is Starknet quantum-resistant?" is "No. Not as a single system-wide claim."[8]
deeper: [8] Quantum Hub "Learn"
needs: B-1
```

```prereq B-3 l1 4min
# Pedersen, Poseidon, BLAKE2s
what: Starknet uses three hashes. [[Pedersen]] is a linear combination of Stark-curve points, so its security rests on discrete logs. [[Poseidon]] is an algebraic hash (Hades permutation). [[BLAKE2s]] is a conventional bitwise hash [2].
why: Roadmap Phase 1 replaces Pedersen with BLAKE2. Where Pedersen is still used shows how much migration work remains.
example: Contract address = `Pedersen("STARKNET_CONTRACT_ADDRESS", deployer, salt, class_hash, Pedersen(calldata))`, still true on 2026-10-13 [1].
misconception: Myth: Pedersen is a hash, so it is as safe as BLAKE2. Fact: StarkWare says it "inherits elliptic-curve assumptions"[9].
deeper: [2] docs.starknet.io "Cryptography"
needs: B-1
```

```prereq B-4 l1 5min
# Notes and nullifiers: how a privacy pool stops double spends
what: In a [[privacy pool]], a balance is not `balances[user]` but a set of [[note]]s. Spending a note writes its [[nullifier]] on-chain, and each nullifier can be written only once [16].
why: STRK20 is this kind of pool. The nullifier comes from a private key, so observers cannot match it to the spent note.
example:
~~~
note_id   = Poseidon(NOTE_ID_TAG, channel_key, token, index, 0)
nullifier = Poseidon(NULLIFIER_TAG, channel_key, token, index, 0, k)
~~~
misconception: Myth: STRK20 turns Starknet into a UTXO chain. Fact: notes live only in one contract's storage; the chain keeps its account model [16].
deeper: [18] docs.starknet.io "Notes and nullifiers"
needs: B-2
```

```prereq B-5 l1 4min
# ECDH and the viewing key
what: [[ECDH]] lets two parties derive the same shared secret on an elliptic curve. STRK20 uses it to encrypt channel data to the recipient, and the user's [[viewing key]] to the [[auditor]] [16].
why: All STRK20 confidentiality rests on ECDH, so its PQ status differs from the proving layer.
example: `R = r·G`, `shared = x(r·K) = x(k·R)`, ciphertext = `Poseidon(tag, shared) + plaintext` [16].
misconception: Myth: a viewing key can only "view". Fact: the STRK20 viewing private key also derives nullifiers and Shadow identities, so a leak exposes the whole private history [16].
deeper: [18] docs.starknet.io "Encryption and keys"
needs: B-1
```

## J Accounts: the protocol calls entry points, the contract picks the scheme {depth=2}
Fig 2 shows the call order between the protocol and the account when Alice sends a plain transfer. The protocol does three things [1]. It picks the entry point by transaction type. It calls with caller = 0. It checks that the return value is `'VALID'`. Which signature scheme to use, and how to check it, is up to Alice's account contract.

```uml q="When Alice sends an INVOKE v3 transaction, who calls her account, and when? Which step decides whether the signature is valid?" read="The highlighted part is the validation phase, with resource and syscall limits. If step 5 fails, the transaction is dropped and pays no fee. If step 7 fails, the transaction is REVERTED, still pays, and the nonce still increments." takeaway="The protocol only accepts 'the account returned VALID'; the signature scheme lives entirely in the account contract."
sequenceDiagram
  autonumber
  participant W as Alice wallet
  participant G as Gateway / mempool
  participant S as Sequencer (blockifier)
  participant A as Alice account
  participant T as Target contract
  W->>G: Signed INVOKE v3
  G->>G: Stateless checks (paymaster_data must be empty)
  G->>S: Queue if nonce in [current, current+200]
  S->>S: Nonce must equal current exactly
  rect rgb(234, 241, 251)
    S->>A: __validate__(calls), caller = 0
    A-->>S: 'VALID'
  end
  S->>A: __execute__(calls), caller = 0
  A->>T: call_contract (one by one)
  S->>S: Charge STRK fee to Alice, nonce + 1
```

**Validation limits.** On mainnet v0.14.4, `__validate__` may use at most 1,000,000 Cairo steps and 100M L2 gas [1]. It cannot call other contracts or `deploy`. It reads the block number rounded down to a multiple of 100, and the timestamp rounded down to the hour [1]. The official reason is to stop free DoS (heavy validation that then fails) and mempool pollution [2].

```limits
Validation Cairo steps | 1000000 | steps
Validation L2 gas | 100000000 | gas
Mempool nonce lead | 200 | txs
```

**The OZ default account** (`packages/account/src/account.cairo#L71-87,#L342-348@5cf9010e` [4]). `__execute__` asserts caller = 0 again. `__validate__` checks the transaction hash with Stark-curve ECDSA:

```cairo title="OZ AccountComponent (excerpt) · cairo-contracts@5cf9010e"
fn __execute__(self: @ComponentState<TContractState>, calls: Array<Call>) {
    let sender = starknet::get_caller_address();
    assert(sender.is_zero(), Errors::INVALID_CALLER);
    assert(is_tx_version_valid(), Errors::INVALID_TX_VERSION);
    for call in calls.span() { execute_single_call(call); }
}
fn validate_transaction(self: @ComponentState<TContractState>) -> felt252 {
    let tx_info = starknet::get_tx_info().unbox();
    assert(
        self._is_valid_signature(tx_info.transaction_hash, tx_info.signature),
        Errors::INVALID_SIGNATURE,
    ); // -> core::ecdsa::check_ecdsa_signature (Stark curve)
    starknet::VALIDATED
}
```

```finding F1 high
# The Starknet protocol fixes no signature scheme; the account contract decides
claim: The protocol calls `__validate__` / `__validate_declare__` / `__validate_deploy__` with caller = 0 by transaction type, and requires `'VALID'`. Validation is capped at 1,000,000 steps / 100M L2 gas, with no external calls. An account can also swap its class in place with `replace_class_syscall`, keeping its address and storage.
evidence: [observed] blockifier `account_transaction.rs`, versioned constants and syscall limits [1] (A1–A13); OZ / Argent / Braavos upgrade code [4][5] (A30–A33).
implication: A move to PQ signatures needs no hard fork: only a new account class, or an upgrade of the existing account's class.
```

**Compared with EVM.** The table reflects specs or mainnet state as of 2026-10-14 [6]. The difference is not "can you write PQ verification", but "does the protocol fix a root key".

| Dimension | EOA | ERC-4337 | EIP-7702 | Starknet |
|---|---|---|---|---|
| Who defines auth | Protocol secp256k1 | Account `validateUserOp` | Protocol `ecrecover` + delegation code | Account `__validate__` |
| Protocol root key | no yes | ok none | no yes; the old key stays valid | ok none |
| Entry | Native tx | UserOp → bundler → EntryPoint | Type-4 tx | Native INVOKE v3 |
| Nonce | Sequential | 192-bit key + 64-bit sequence | Sequential | Sequential (mempool may lead by 200) |
| Sponsored gas | None | Paymaster | Via 4337 | warn Native field rejected; uses SNIP-9 + SNIP-29 |
| Change scheme | Hard fork | New account or proxy upgrade | Cannot drop the ECDSA root key | New account or `replace_class` |

Ethereum's Native AA proposals: EIP-7701 is withdrawn; RIP-7560 and EIP-8141 are Drafts. EIP-8141 names PQ migration as its first motivation, but accounts without code still verify with secp256k1 [6].

```finding F2 high
# The real difference from EVM is "no protocol root key", not "can it verify PQ"
claim: For EOAs and 7702 accounts, the protocol fixes a secp256k1 root key. After a 7702 delegation, the old key can still send transactions and re-delegate. 4337 can also verify PQ signatures, and its nonce (192-bit key) is more flexible than Starknet's. Starknet's native paymaster field is currently rejected by the gateway.
evidence: [observed] EIP-7702 steps 3, 5, 8 and "Transaction origination" [6] (A53–A55); ERC-4337 `getNonce(address, uint192 key)` [6] (A57); gateway `validate_empty_paymaster_data` [1] (A20). [inferred] Delegating to PQ code does not remove the quantum risk of the old 7702 key (A56).
implication: When you assess PQ migration, ask "does the protocol force an ECDSA root key to stay", not only "can a contract verify PQ signatures".
```

```finding F3 high
# Existing accounts do not become PQ by themselves; the upgrade is still authorized with ECDSA
claim: OZ, Argent and Braavos accounts can self-call `replace_class` to move to a PQ class. But that upgrade must first pass the old ECDSA `__validate__`. None of the three publishes a migration flow. The mainnet Falcon demo account was freshly deployed (nonce = 1), not upgraded.
evidence: [observed] Quantum Hub "Existing accounts do not change automatically" [7] (A49); upgrade guards [4][5] (A30–A33); RPC shows the demo tx nonce = 0x1 [11] (A46). [inferred] The upgrade depends on the old signature (A50); the demo account is a fresh deployment (A48).
implication: Existing accounts must upgrade before the quantum threat arrives. Old signature paths such as guardians, sessions and `is_valid_signature` must go too (see [F15](#F15)).
```

## K Crypto inventory: what has left elliptic curves {depth=2}
Fig 3 colors each component of Starknet mainnet v0.14.4 by PQ status. Green no longer depends on elliptic curves; red still does; yellow is unrated or demo-only; gray dashed is an external Ethereum dependency [7][1].

```excalidraw q="On mainnet v0.14.4, which Starknet components no longer depend on elliptic curves?" read="Top to bottom: proving layer → protocol commitments → accounts → consensus → Ethereum side. Green = off EC, or EC-free by design; red = still on EC; yellow = unrated or demo only; gray dashed = external dependency." takeaway="Only the proving layer and two hashes have left elliptic curves; state tries, addresses, default signatures and consensus are still red." kind=layered-inventory
{"grid": {"w": 600, "h": 74}, "defaults": {"w": 560, "h": 56, "fontSize": 16},
 "nodes": [
   {"id": "p", "label": "Proving layer: STARK / S-two (hash-based)", "col": 0, "row": 0, "color": "green"},
   {"id": "os", "label": "OS program / config hash: BLAKE2s (v0.14.3)", "col": 0, "row": 1, "color": "green"},
   {"id": "cc", "label": "Compiled class hash: BLAKE2s (v0.14.1)", "col": 0, "row": 2, "color": "green"},
   {"id": "po", "label": "Outer state commitment, class trie, v3 tx hash: Poseidon", "col": 0, "row": 3, "color": "yellow"},
   {"id": "tr", "label": "Contract / storage tries, addresses, Map slots: Pedersen", "col": 0, "row": 4, "color": "red", "strokeWidth": 3},
   {"id": "ac", "label": "Default account signature: Stark-ECDSA / secp256k1 / r1", "col": 0, "row": 5, "color": "red"},
   {"id": "fa", "label": "Falcon-512 account: 1 mainnet demo, unaudited", "col": 0, "row": 6, "color": "yellow"},
   {"id": "co", "label": "Consensus: 3 sequencers, votes not signed yet", "col": 0, "row": 7, "color": "red"},
   {"id": "eth", "label": "Ethereum side: blob / KZG, L1 bridge and messaging", "col": 0, "row": 8, "color": "gray", "stroke": "dashed"}
 ],
 "edges": []}
```

The source shows two switch points. The OS config hash moved to Blake from v0.14.3; contract address derivation is still Pedersen (`starknet_api/src/core.rs@54f97a8a` [1]):

```rust title="sequencer/crates/starknet_api/src/core.rs (excerpt) · @54f97a8a"
/// The first Starknet version at which the OS config hash is computed
/// with Blake (V4) instead of Pedersen (V3).
const OS_CONFIG_HASH_V4_CUTOVER: StarknetVersion = StarknetVersion::V0_14_3;

pub fn calculate_contract_address(/* salt, class_hash, calldata, deployer */) -> .. {
    let constructor_calldata_hash = Pedersen::hash_array(&constructor_calldata.0);
    let address = Pedersen::hash_array(&[
        prefix /* "STARKNET_CONTRACT_ADDRESS" */, deployer, salt, class_hash,
        constructor_calldata_hash,
    ]);
```

```finding F4 high
# On v0.14.4, only the proving layer and two hashes have left elliptic curves
claim: The OS program / config hash (v0.14.3, on mainnet 2026-07-08) and the compiled class hash (v0.14.1) now use BLAKE2s. Contract and storage tries, contract address derivation and Map storage slots still use Pedersen. The default account signature is still Stark-ECDSA, and DA uses Ethereum blobs (KZG).
evidence: [observed] Migration Register R4–R8 (last updated 2026-08-19) [7] (C2, C14–C17, C22); sequencer source [1] (C16, C21, C25, R24); mainnet `l1_da_mode = BLOB` [11] (C31); official answer "No. Not as a single system-wide claim." [8] (C1).
implication: "Starknet is quantum-resistant" holds only per component. Today it holds for the proving layer, the OS hash and the class hash.
```

StarkWare gives Poseidon no separate PQ rating, and the roadmap picks BLAKE2 rather than Poseidon [9]. "Poseidon is as strong as BLAKE2 against quantum attacks" is an unverified judgment (C63, [speculative]).

## L Falcon-512 accounts: they run, but are costly and unaudited {depth=2}
**The algorithm.** [[Falcon-512]] is a lattice-based signature. Verification works in the ring $\mathbb{Z}_{12289}[x]/(x^{512}+1)$ [10]:

$$
c = \mathrm{HashToPoint}(m,\ salt),\qquad s_0 = c - s_1 h \pmod q,\qquad \|s_0\|^2 + \|s_1\|^2 \le 34{,}034{,}726
$$

$h$ is the public key and $s_1$ is the signature. A Falcon-512 public key is 897 bytes and a signature is 666 bytes [10]. In Cairo, the public key packs into 29 felts and a direct signature into 31 felts [10].

**Variants.** OZ `cairo-pq-verifiers` implements five variants: hint mode with a BLAKE2s, Poseidon or SHAKE-256 [[hash-to-point]], and direct mode with BLAKE2s or SHAKE-256 [10]. Only SHAKE-256 interoperates with standard signers. In hint mode the signer supplies $s_1 h$ and the chain only checks it; in direct mode the chain computes it. Both modes have the same security [10].

| Variant (hash-to-point · mode) | Standard | validate L2 gas | / ECDSA |
|---|---|---|---|
| Stark-ECDSA (baseline) | — | 160,795 | 1× |
| Poseidon · hint | no | 13,615,909 | 85× |
| BLAKE2s · hint | no | 14,380,100 | 89× |
| BLAKE2s · direct | no | 24,525,310 | 153× |
| SHAKE-256 · hint | ok | 51,733,728 | 322× |
| SHAKE-256 · direct | ok | 61,878,938 | 385× |

The numbers come from `efficiency_baseline.json`. They measure resources as "test minus baseline", not the fee a user pays [10]. The repository says actual fees are about 1.7–2.7× the resource figure [10].

```limits
SHAKE-256 · direct validation | 61878938 / 100000000 | L2 gas | 62% of the cap
SHAKE-256 · direct validation | 427598 / 1000000 | steps
```

```cairo title="OZ Falcon512ShakeDirectVerifier (excerpt) · cairo-pq-verifiers@bece5c07 crates/falcon_512/src/lib.cairo#L161-181"
fn verify(message_hash: felt252, public_key: Span<felt252>, signature: Span<felt252>) -> bool {
    if public_key.len() != PUBKEY_FELTS || signature.len() != SIG_FELTS_DIRECT { return false; }
    let h_ntt = match packing::unpack_512_u16(public_key) { Some(v) => v, None => { return false; } };
    let s1 = match packing::unpack_512_u16(signature.slice(0, 29)) { Some(v) => v, None => { return false; } };
    let msg_point = match hash_to_point::hash_to_point_shake_512(
        message_hash, *signature.at(29), *signature.at(30),
    ) { Some(v) => v, None => { return false; } };
    falcon::verify_512_direct_u16(s1.span(), h_ntt.span(), msg_point.span())
}
```

**Mainnet record.** Transaction `0x72ae4404…0a4b3` succeeded in block 12,156,522 (2026-07-22 10:46:25 UTC, v0.14.3); it transfers 0.01 STRK [11]. The receipt shows 63,932,548 L2 gas and a fee of about 1.926 STRK [11]. The signature is 31 felts, which matches the SHAKE-direct encoding [11].

```finding F5 high
# Falcon-512 accounts fit the resource limits, but cost, standardization and audit are not ready
claim: All 5 Falcon variants validate within the 1M-step / 100M-gas cap. Standard SHAKE-direct validation uses about 385× the resources of Stark-ECDSA. The repository is marked "Experimental and unaudited". The Falcon account in OZ cairo-contracts is still in the CHANGELOG "Unreleased" section. NIST FIPS 206 is still "in development".
evidence: [observed] efficiency_baseline.json and README [10] (C38–C44, C46–C50); CHANGELOG [4] (C51); mainnet tx [11] (C53–C55); NIST CSRC [12] (C59). [inferred] 385× = 61,878,938 / 160,795 (C45).
implication: PQ accounts are past pure research, but they are not yet a production default for users. The Poseidon or BLAKE2s variants save 4–7× resources, at the cost of no compatibility with standard signers.
```

Two points remain unverified. Why does the mainnet receipt (63.9M L2 gas) differ so much from the same variant on devnet (about 139.9M)? Does the demo account's class match the build output of this commit (see [panel R](#panel-R))? Also, two repositories share the name s2morrow. feltroidprime/s2morrow is a Starknet account (Poseidon hash-to-point). starkware-bitcoin/s2morrow is a Bitcoin-oriented signature-aggregation study with no account contract [24].

## M Roadmap and L1: what "2027" means {depth=2}
**Official wording.** On 2026-10-08, Eli Ben-Sasson posted an 8-post thread. The key post reads: "We're considering multiple options, including becoming an L1 … Ethereum is targeting full L1 quantum resistance by the end of 2029 … Starknet could get there by 2027."[13] @Starknet then posted: "We are actively considering becoming an L1 … with 2027 as our target."[13] As of 2026-10-14, the SNIP repository, the community forum and Snapshot show no related proposal or vote [3][13].

```finding F6 high
# "A PQ L1 by 2027" is a target under consideration, with no scope, spec or governance process
claim: The official wording is "actively considering" and "target"; the CEO lists an L1 as one of "multiple options". There is no SNIP, forum proposal, vote or dedicated blog post. No source defines which components "fully quantum-resistant" covers.
evidence: [observed] @Starknet and @EliBenSasson posts, read through the fxtwitter API [13] (R1–R7); SNIPs HEAD, forum and Snapshot queries (R8–R10, R12). [inferred] Classed as "under consideration, not decided" (R11).
implication: Quote it as "Starknet is considering becoming an L1, with a 2027 target", not "Starknet will be a PQ L1 in 2027".
```

**The three-phase roadmap (2026-06-30).** The roadmap itself stays inside the L2 frame [9]. Progress per item:

| Phase | Item | Official estimate | Status (2026-10-14) |
|---|---|---|---|
| P1 | OS program / config hash → BLAKE2s | Early July | ok v0.14.3 on mainnet |
| P1 | Contract / storage tries → BLAKE2 | About two months | no Source still Pedersen |
| P1 | Contract address derivation → BLAKE2 | About two months | no Source still Pedersen |
| P1 note | PQ consensus signatures ("such as Falcon-512") | No date | no Votes not signed yet |
| P2 | Legacy storage migration toolkit | About a month after P1 | warn Research, no spec |
| P3 | L1 bridge secp syscalls, blob / KZG | After Ethereum | warn External dependency |

**Consensus today.** Since v0.14.0, 3 sequencers reach consensus with Tendermint. The staking docs say "Starknet is currently still centralized"[2]. In the sequencer main branch, consensus votes are not yet signed [1]:

```rust title="sequencer/crates/apollo_consensus/src/state_machine.rs#L250-256 · @54f97a8a"
    height: self.height,
    round: self.round,
    proposal_commitment,
    voter: self.id,
    // TODO(Asmaa): sign the vote
    signature: RawSignature::default(),
};
```

```finding F7 medium
# Phase 1 has passed its own estimate, and the gaps of an L1 pivot have no official answer
claim: Of the three Phase 1 items, only the OS hash is live. More than 3.5 months have passed since the roadmap was published, yet the tries and addresses are not migrated despite the "about two months" estimate. v0.14.4 (live 2026-10-06) does not include them. The roadmap's PQ consensus signatures do not replace old signatures: they must be built from scratch, because votes are unsigned today. An L1 would also need its own DA, settlement, a plan for StarkGate assets and legacy-state migration.
evidence: [observed] roadmap text [9] (R13–R18); v0.14.3 / v0.14.4 release notes and status page [14] (R19, R20, R25); sequencer source [1] (R23, R24, R34); staking docs [2] (R32, R33). [inferred] Behind schedule (R26); consensus signatures from scratch (R36); L1 gaps (R37, R38). [speculative] Shipping independent PQ consensus by 2027 carries high schedule risk (R39).
implication: To track "2027", first check which release ships the trie and address migration and which consensus signature scheme is chosen. Then look for an L1 specification.
```

**Ethereum's 2029.** On 2026-09-07, EF Protocol set the target: by December 2029, the L1 is quantum-resistant across execution, consensus and data. The deadline is "non-negotiable at least until January 2027"[15]. It also adds an [[MV-PQ]] fallback milestone at J*, "designed to keep Ethereum operating through Q-day with reduced guarantees"[15]. The related EIPs (8141, 7932, 8051, 7619, 8365) are all Drafts [15]. pq.ethereum.org puts full PQ consensus under "Longer term", later than the EF blog [15].

```finding F8 high
# 2027 and 2029 measure different things; the gap does not mean "two years ahead"
claim: Ethereum's 2029-12 target defines three layers, a fork path and the MV-PQ fallback. Starknet's 2027 has no defined scope. Its live PQ parts are the proving layer, two hashes and one experimental Falcon transfer. Consensus, DA and the bridge have no PQ plan.
evidence: [observed] EF Protocol blog [15] (R40–R45); EIP status (R47); Migration Register [7]. [inferred] Different scopes (R48, R49).
implication: Compare the two chains component by component (accounts, state commitments, consensus, DA, bridge), not year against year.
```

StarkWare's own networks page scores Starknet 8/8 and Ethereum 3/8. It states that it does not cover consensus signatures, bridges or external dependencies [8]. The same page records an Algorand target to replace its consensus by 2027. So the claim "first fully quantum-resistant network" may have a competitor (R52, [speculative]).

## N STRK20: a contract-level privacy pool {depth=2}
STRK20 is one privacy-pool contract on Starknet (`0x0403…812a`). It was deployed with v0.14.2 on 2026-04-20, and launched officially on 2026-06-09 [16][23]. The unusual part is steps 3–6 of Fig 4. Private logic runs in a [[virtual OS]] and produces a proof. The sequencer gateway verifies the proof; the on-chain contract checks only the [[proof facts]] [16][1].

```uml q="When Alice privately sends USDC to Bob (first channel), where does each step run, and who sees what?" read="Steps 3–4 run off-chain in the virtual Starknet OS at the proving service. Highlighted steps 6–7 are on-chain. Simplified: discovery sync and fee details are left out." takeaway="The on-chain contract does not re-run the private logic; it checks the message hash from the proof. The sequencer gateway verifies the proof, which is not settled on Ethereum today."
sequenceDiagram
  autonumber
  participant A as Alice SDK
  participant P as Proving service
  participant R as Relayer
  participant G as Sequencer gateway
  participant Pool as Privacy pool
  A->>A: Build private actions: open channel, spend notes, new note for Bob
  A->>P: Virtual tx: calldata has Alice address, viewing key, actions, signed by Alice
  P->>P: Run Pool.__execute__ in virtual OS: compile actions, check Alice signature
  P-->>A: Stwo proof + proof facts + public actions
  A->>R: Hand to relayer
  rect rgb(234, 241, 251)
    R->>G: apply_actions(public actions) with proof
    G->>Pool: Gateway verifies Stwo proof, then executes
    Pool->>Pool: Check message hash and 450-block freshness, write nullifiers and notes
  end
```

**What runs on-chain.** `apply_actions` runs `validate_proof` → `collect_fee` (2.5 STRK) → `_apply_actions` [16]. Nullifier WriteOnce stops double spends: before a write, the contract asserts the slot is empty [16]. Per-token running balances enforce conservation; each must be zero at the end of the transaction [16].

```cairo title="starknet-privacy · packages/privacy/src/privacy.cairo#L827-842 · @f9256c5e"
assert(program_variant == VIRTUAL_SNOS, errors::INVALID_PROGRAM_VARIANT);
assert(starknet_os_output_version == VIRTUAL_SNOS0, errors::INVALID_OS_OUTPUT_VERSION);
let current_block_number = execution_info.block_info.block_number;
assert(base_block_number < current_block_number, errors::INVALID_BASE_BLOCK_NUMBER);
assert(
    current_block_number <= base_block_number + self.proof_validity_blocks.read(),
    errors::PROOF_EXPIRED,
);
let message_hash = compute_message_hash(:actions, :contract_address);
assert(message_to_l1_hashes == [message_hash].span(), errors::INVALID_PROOF_MSG);
```

```finding F9 high
# STRK20 is a contract-level privacy pool; the sequencer gateway verifies its proofs, which are not settled on Ethereum yet
claim: The pool contract's own `__execute__`, run in the virtual OS, compiles private actions into public ones. The sequencer gateway verifies the Stwo proof; the contract checks only the message hash in the proof facts and 450-block freshness. SNIP-36 states that in Phase 1, Starknet consensus alone verifies the proofs.
evidence: [observed] privacy.cairo, actions.cairo [16] (S1–S7); gateway.rs, account_transaction.rs [1] (S8–S10); SNIP-36 [19] (S11); `proof_fact_fold.rs` still uses test constants [1] (S12); pool deployment and parameters [11] (S52, S55).
implication: STRK20 state correctness depends today on Starknet consensus (3 sequencers), not on proof verification on Ethereum.
```

**Authorization and compliance.** A spend needs Alice's account signature, and the pool accepts any one of three paths: custom validation, `is_valid_signature(tx_hash)`, or `is_valid_signature(SNIP-12 CallSet hash)` [16]. On first use, Alice registers a viewing key. The public key `x(k·G)` goes on-chain in plaintext, and the private key `k` is ECDH-encrypted to the single auditor public key; both are write-once [16]. A deposit needs an attestation signed by a screener, valid for 300 seconds [16].

**Who sees what.** By observer [18][16]:

| Observer | Can see | Cannot see |
|---|---|---|
| On-chain observer | Depositor, withdrawal recipient, amounts; recipient address of a new channel; timing | Amount, token and parties of a plain transfer |
| Relayer / paymaster | User IP, the submitted payload | Private actions in plaintext |
| Proving service | Viewing key and all private actions (full witness) | — |
| Discovery service | Viewing key, channel and note counts, sync times | IP, when an OHTTP relay is used |
| Auditor | Full history after decrypting the viewing key | Cannot sign spends |
| Bob (recipient) | The sender and all amounts on that channel | Alice's other channels |

```finding F10 high
# STRK20 hides data only from on-chain observers; the proving and discovery services get the viewing key
claim: The virtual-transaction calldata that the SDK sends to the proving service contains the viewing key and all private actions. OHTTP hides only the IP and blocks the TLS terminator; it does not hide data from the service operator. Deposit and withdrawal amounts and new-channel recipients are public. The sender is hidden from outsiders only when a paymaster submits.
evidence: [observed] SDK `proof-invocation-factory.ts` [16] (S5); discovery security spec [16] (S31); official security page [18] (S27–S29); SNIP-36 "privacy is de facto" [19] (S33). [inferred] The proving service gets the full witness (S30).
implication: When you assess STRK20 privacy, count the proving-service and discovery-service operators as trusted parties.
```

```finding F11 high
# STRK20's encryption layer is Stark-curve ECDH and does not inherit the proving layer's PQ property
claim: Channel distribution and auditor escrow use Stark-curve ECDH plus Poseidon masking, with no PQ key encapsulation. The viewing public key `x(k·G)` is stored on-chain in plaintext and cannot be replaced. The official "Post-quantum" wording refers only to the proof system.
evidence: [observed] `_compute_shared_x` and `encrypt_private_key` in `utils.cairo` [16] (S23, S34, S35); interactive page "No trusted setup. Post-quantum." (S40); a search-index snippet of starknetprivacy.com showed "quantum-resistant by design", which the page source no longer contains on 2026-10-14 (X4). [inferred] A quantum attacker can recover k from the on-chain public key (S36); the auditor public key is a single global point of failure (S38).
implication: Do not describe STRK20 confidentiality with "Starknet's proving layer is quantum-resistant".
```

```cairo title="starknet-privacy · packages/privacy/src/utils.cairo#L134-146 · @f9256c5e"
fn _compute_shared_x(ephemeral_secret: felt252, public_key: felt252) -> (felt252, felt252) {
    let ephemeral_pub_point = GEN_P().mul(scalar: ephemeral_secret);
    let ephemeral_pub_x = ephemeral_pub_point.try_into()
        .expect(internal_errors::ZERO_EPHEMERAL_PUBLIC).x();
    let public_point = EcPointTrait::new_from_x(x: public_key).expect(errors::INVALID_PUBLIC_KEY);
    let shared_point = public_point.mul(scalar: ephemeral_secret);
    let shared_x = shared_point.try_into().expect(internal_errors::ZERO_SHARED).x();
    (ephemeral_pub_x, shared_x)
}
```

**Audit and formal verification.** OpenZeppelin audited commit c5e2fb5 (2026-03-18 to 03-31, report 2026-05-29) and found 0 Critical / High issues [17]. The scope is only the 9 files in `packages/privacy/src`, without the anonymizer or the SDK [17]. The Lean development has 236 theorems and no `sorry`. It models the hash as injective and encryption as an abstract invertible function, so it proves neither confidentiality nor quantum resistance [16][20].

StarkWare's words: "We formally verified the protocol. The Cairo contract that implements it is covered separately by the OpenZeppelin audit."[20]

## O Shadow Account: a keyless proxy contract {depth=2}
**What it is.** The official docs: "A shadow account is a persistent, pseudonymous identity for one user and one dapp … A shadow account is not a wallet account: it has no keys and cannot sign."[21] Fig 5 is the authorization chain from Alice's signature to the Vesu contract.

```excalidraw q="Who may make Alice's Shadow Account call Vesu, and what does each hop check?" read="Read from top left to bottom left. Blue boxes are STRK20 parts, the green box is the Shadow Account, gray dashed boxes are external. Each edge label is that hop's check." takeaway="The Shadow Account obeys only the anonymizer; the anonymizer obeys only the pool; the pool obeys only proofs. Alice's signature is checked once inside the proof; the Shadow Account has no key."
{"grid": {"w": 440, "h": 150}, "defaults": {"w": 230, "h": 62, "fontSize": 16},
 "nodes": [
   {"id": "alice", "label": "Alice main-account signature", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "proof", "label": "Virtual OS proof", "col": 1, "row": 0, "color": "blue"},
   {"id": "pool", "label": "Pool apply_actions", "col": 2, "row": 0, "color": "blue"},
   {"id": "anon", "label": "ShadowAccountAnonymizer", "col": 2, "row": 1, "color": "blue"},
   {"id": "shadow", "label": "Shadow Account", "col": 1, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "vesu", "label": "Vesu vault", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"}
 ],
 "edges": [
   {"from": "alice", "to": "proof", "label": "verified"},
   {"from": "proof", "to": "pool", "label": "message hash"},
   {"from": "pool", "to": "anon", "label": "caller == pool"},
   {"from": "anon", "to": "shadow", "label": "caller == owner"},
   {"from": "shadow", "to": "vesu", "label": "any calls"}
 ]}
```

The Shadow Account contract is small. Its storage holds only `owner` (the anonymizer) and an upgrade component. Its single business entry point, `execute`, checks only that the caller is the owner [22]. It has no `__validate__`, `__execute__` or `is_valid_signature` [22][11].

```cairo title="starkware-starknet-utils · packages/accounts/src/shadow_account.cairo (excerpt) · @3e2fd53d"
#[storage]
struct Storage {
    #[substorage(v0)]
    upgradable: EICUpgradableComponent::Storage,
    owner: ContractAddress,
}
fn execute(ref self: ContractState, calls: Array<Call>) -> Array<Span<felt252>> {
    self.assert_only_owner();      // get_caller_address() == owner (anonymizer)
    execute_calls(calls.span())
}
```

**Address derivation.** Three Poseidon steps give the salt. The address then follows the Pedersen contract-address formula, with the fixed [[Primer]] class [16][22]:

$$
\begin{aligned}
\mathit{identity\_key} &= \mathrm{Poseidon}(\texttt{IDENTITY\_KEY\_TAG},\ \mathit{user},\ k,\ \mathit{anonymizer}) \\
\mathit{partial} &= \mathrm{Poseidon}(\mathit{identity\_key},\ \mathit{dapp\_name}) \\
\mathit{commitment} &= \mathrm{Poseidon}(\mathit{partial},\ \mathit{nonce}) \\
\mathit{address} &= \mathrm{Pedersen\_addr}(\mathit{salt}=\mathit{commitment},\ \texttt{PRIMER\_CLASS\_HASH},\ \mathit{deployer}=\mathit{anonymizer})
\end{aligned}
$$

Here $k$ is Alice's STRK20 viewing private key [16]. We recomputed the addresses from mainnet events: 172 of 173 Shadow Accounts match. The first one (2026-09-07) was deployed before the Primer method existed, with the runtime class [11].

**One Vesu deposit.** Fig 6 shows Alice moving private USDC into Vesu. On-chain, this is one transaction: a relayer calls `pool.apply_actions` [11][16].

```uml q="When Alice deposits private USDC into Vesu through a Shadow Account, what happens on-chain, and what is public?" read="The whole flow is one on-chain transaction. The amount and recipient (the Shadow address) of step 3 are public. Step 5 happens only on first use." takeaway="The vault shares stay on the Shadow Account in public view; only the link between the Shadow Account and Alice's main wallet is hidden."
sequenceDiagram
  autonumber
  participant R as Relayer
  participant Pool as Privacy pool
  participant N as Anonymizer
  participant SA as Shadow Account
  participant V as Vesu vault
  R->>Pool: apply_actions (proof already checked Alice signature)
  Pool->>Pool: Verify proof facts, charge 2.5 STRK pool fee
  Pool->>SA: Withdraw: USDC to the Shadow address (public)
  Pool->>N: privacy_invoke_with_computation(commitment, calls)
  N->>SA: First use: deploy Primer → swap to Shadow class → initialize
  N->>SA: execute([approve, deposit])
  SA->>V: approve + deposit
  V-->>SA: Vault shares stay on the Shadow Account
  opt Collect outputs
    N->>Pool: Balance back to the pool as an open note
  end
```

```finding F12 high
# A Shadow Account is a keyless proxy authorized by privacy proofs and driven only by the anonymizer
claim: A Shadow Account stores its owner (the anonymizer) and an upgrade component. Its business entry point `execute` accepts only the owner. The anonymizer accepts calls only from the privacy pool and puts no limit on call targets or selectors. The pool calls the anonymizer only when a proof is valid. On mainnet, governance can upgrade the anonymizer with zero delay.
evidence: [observed] shadow_account.cairo [22] (W12–W15); shadow_account_anonymizer.cairo [16] (W17, W18, W22); mainnet ABI and owner queries [11] (W11, W14, W15); authorization chain (W32–W35). [inferred] `dapp_name` is an identity namespace, not a call permission (W19); governance has potential control over all Shadow assets (W49).
implication: "Derived for one dapp" does not mean "can only call that dapp". Permission limits must come from the wallet, or from extra contract logic.
```

**Is it a private sub-account?** The instinct is right. StarkWare's 2026-07-15 blog still called it "private sub-accounts … Not live yet", and the SDK renamed it to Shadow Account only in RC.5 on 2026-08-12 [23][16]. But the key differences are:

| Dimension | Intuitive private sub-account | Actual Shadow Account |
|---|---|---|
| Key | Its own child key | no No key, cannot sign |
| Who sends txs | The sub-account itself | A relayer calls the pool, which drives it |
| Contents | Balances and actions private | no Balances, calls, positions all public |
| What is hidden | Everything | ok Only the link to the main wallet |
| Granularity | Any | One per (user, anonymizer, dapp_name, nonce) |
| Protocol account | Yes | no Cannot send txs or `is_valid_signature` |

```finding F13 high
# "Like a private sub-account" holds, but it hides the link, not the contents
claim: A Shadow Account's balances, calls and positions are all public. Anyone can list every Shadow address from `ShadowAccountDeployed` events. A dapp that holds a partial commitment can list all nonces of that user under its dapp_name. Mainnet deployments started on 2026-09-07, with 173 by 2026-10-14. We found no official launch post dated 2026-10-13.
evidence: [observed] official docs "What is private" [21] (W2, W42); events and `get_shadow_accounts` [16][11] (W43, W44); rename record [23][16] (W4–W6); mainnet event count [11] (W7, W8). [inferred] Matches the official former name (W47); cannot join protocols that need an account signature (W48). [speculative] The "10-13 launch" has no primary source (W9).
implication: Shadow Accounts suit "public position, separate identity" cases such as lending and staking. They are not confidential execution.
```

The public OZ audit (2026-05-29) never mentions shadow accounts or the anonymizer [17]; no public audit covers the Shadow contracts yet. The official Vesu vault demo lives under the personal account starkience and calls itself "educational, not audited"[21].

## P PQ × privacy: one key ties together the whole history {depth=2}
Fig 7 shows which derivations use Alice's viewing private key $k$. The left side is public on-chain data; the right side is what $k$ can rebuild.

```excalidraw q="If a quantum attack recovers Alice's viewing private key, what can the attacker rebuild?" read="Red boxes are permanent public on-chain data. The yellow box is the private key that Shor can solve. Violet boxes are private data rebuilt from that key. Every arrow needs only public on-chain values." takeaway="One key that cannot be replaced derives nullifiers, channels and Shadow identities, and its public key is on-chain in plaintext: a textbook harvest-now-decrypt-later target."
{"grid": {"w": 480, "h": 120}, "defaults": {"w": 240, "h": 60, "fontSize": 16},
 "nodes": [
   {"id": "pk", "label": "On-chain viewing public key x(k·G)", "col": 0, "row": 0, "color": "red"},
   {"id": "aud", "label": "ECDH ciphertext to auditor", "col": 0, "row": 2, "color": "red"},
   {"id": "k", "label": "Viewing private key k (fixed)", "col": 1, "row": 1, "color": "yellow", "strokeWidth": 3},
   {"id": "ch", "label": "Channels and note amounts", "col": 2, "row": 0, "color": "violet"},
   {"id": "nf", "label": "Nullifiers → what was spent", "col": 2, "row": 1, "color": "violet"},
   {"id": "sh", "label": "All Shadow links", "col": 2, "row": 2, "color": "violet"}
 ],
 "edges": [
   {"from": "pk", "to": "k", "label": "Shor"},
   {"from": "aud", "to": "k", "label": "break auditor key", "dashed": true},
   {"from": "k", "to": "ch", "label": "ECDH decryption"},
   {"from": "k", "to": "nf", "label": "recompute"},
   {"from": "k", "to": "sh", "label": "recompute commitments"}
 ]}
```

```finding F14 high
# Recovering one viewing key rebuilds a user's private transfer history and all Shadow links after the fact
claim: Nullifiers, channel keys and the Shadow identity_key all derive from the same k. The public key of k is on-chain in plaintext, written once and never replaceable. dapp_name is a short, guessable string, nonces are usually small, and every commitment is on-chain for comparison. The auditor public key is a single global point of failure: breaking it yields every registered user's k.
evidence: [observed] hashes.cairo, privacy.cairo, utils.cairo [16] (S13–S16, S23, W24, W30); event listing (W43). [inferred] Recovery paths follow from the derivations (S36–S38, W46, X1).
implication: A PQ migration of STRK20 cannot just rotate to new keys. On-chain public keys and ciphertexts cannot be withdrawn, so pre-migration history stays exposed.
```

```finding F15 medium
# Switching only `__validate__` to a PQ signature does not make every authorization path quantum-resistant
claim: STRK20 spend authorization calls the account's `is_valid_signature` or custom validation, not `__validate__`. Accounts also have separate signature paths: guardians, session keys, SNIP-9 outside execution.
evidence: [observed] the three paths in `assert_valid_signature` [16] (S21); SNIP-6, SNIP-9 [3] (A27, A29); Argent guardians and Braavos's demoted Stark signer [5] (A42, A44). [inferred] If any path keeps ECDSA, the account still carries quantum risk (A51, S22, X2).
implication: A PQ account review must cover the whole authorization graph: transaction entry, `is_valid_signature`, recovery, sessions and upgrades.
```

## Q Acceptance checks: how to tell if "a PQ L1 by 2027" is delivered {depth=2}
These are checks we suggest for tracking Starknet's next announcements. They are recommendations, not an official standard; each maps to a gap above.

1. Scope: does Starknet publish the list of components that "fully quantum-resistant" covers ([F6](#F6))?
2. Phase 1: which release ships the BLAKE2 move for tries and addresses, and on which date ([F4](#F4), [F7](#F7))?
3. Legacy state: does the legacy storage migration toolkit have a spec and code ([F7](#F7))?
4. Consensus: which vote signature scheme, is it PQ from day one, and how does the validator set decentralize ([F7](#F7))?
5. The L1 itself: specs for DA, settlement and finality; a plan for existing StarkGate assets ([F7](#F7), [F8](#F8))?
6. Accounts: do major wallets ship a PQ signer and a migration flow that also removes old signature paths ([F3](#F3), [F15](#F15))?
7. Falcon: is there an audit, and which variant follows the final FIPS 206 ([F5](#F5))?
8. Privacy: does STRK20 adopt PQ key encapsulation, and what happens to historical ciphertexts ([F11](#F11), [F14](#F14))?

```callout warn CAUTION
When you quote Starknet's PQ progress, state the status per component, with version and date. Neither "Starknet is quantum-resistant" nor "Starknet will be a PQ L1 in 2027" has primary-source support today.
```

## R Limits and open questions {depth=2}
- **No reruns**: scarb / snforge are not installed. Falcon costs come from the repository baseline, not from a local rerun.
- **Falcon cost gap**: the mainnet receipt (63.9M L2 gas) is about half the devnet figure for the same variant (about 139.9M). The cause is unknown. The demo account's class was also not compared with a build (v0.14.4 removed the feeder `get_class_hash_at`).
- **Mainnet vs. source**: for the pool and anonymizer, we checked only the version string `'2.1'` and the ABI, with no build comparison. The live sequencer configuration may also differ from the main branch (for example, consensus signing).
- **Audit coverage**: code added after audit commit c5e2fb5 (the snip12 legacy signature path, ComputeAndInvoke, the anonymizer) has no public audit.
- **Proof parameters**: we found no primary evidence for the S-two hash or security bits of mainnet block proofs, or for when private-transaction proofs settle on L1.
- **Unverified**: the primary source of "S2morrow in production on mainnet on 2026-04-01" (C62); the Ready app's default signer (A45); the curve of the consensus authentication key (R35); whether wallets bind dapp_name to the site origin (W51); the conditions for "under ten cents" with a 2.5 STRK pool fee (S57).
- **Conflicts in official material**: who generates proofs (the interactive page, the architecture page and starkzap differ); the screening provider (Elliptic or FPI); docs Version Notes stop at v0.14.1.

## S Method and evidence {depth=3}
**Method**: five research lanes ran in parallel. Each lane wrote one notes file, and all lanes merged into one ledger. The lanes are accounts (A), cryptography (C), roadmap (R), STRK20 (S) and Shadow (W), plus cross-lane synthesis by the main session (X). Every claim traces to source code (pinned commits), official docs, official blogs or mainnet RPC. The external research (ChatGPT Deep Research) served only as leads [26].

**Pinned versions**:

| Repository | Commit | Used for |
|---|---|---|
| starkware-libs/sequencer | 54f97a8a (2026-10-13) | Account txs, validation limits, hashes, consensus, gateway |
| starkware-libs/starknet-privacy | f9256c5e (2026-09-28) | Privacy pool, anonymizer, SDK, Lean |
| starkware-libs/starkware-starknet-utils | 3e2fd53d | Shadow Account, Primer |
| OpenZeppelin/cairo-contracts | 5cf9010e | Accounts, Falcon account component |
| OpenZeppelin/cairo-pq-verifiers | bece5c07 | Falcon verifier and benchmarks |

**Main-session spot checks** (2026-10-14): the Falcon tx receipt (block, gas, fee), the validation-limit constants, the consensus vote-signing TODO, Shadow Account storage and entry point, and `_compute_shared_x`. All 5 match the ledger.

**Corrections to the external research**:
- The Falcon cost table misses the BLAKE2s-direct row and reports resources, not fees (C43–C48).
- It merges starkware-bitcoin/s2morrow (Bitcoin signature aggregation) with feltroidprime/s2morrow (a Starknet account) (C57, C58).
- Its note / nullifier / identity formulas drop the domain tags. Its "k_view" is in fact the same key that derives nullifiers (S13–S16, W24, W30).
- "Not verified whether data is hidden from the prover": confirmed not hidden (S5, S30).
- "Calldata can avoid KZG": calldata is only for extreme cases, and mainnet uses blobs (C30, C31, R31).
- "The Vesu demo is official": it is an educational example on a personal account (W10).

## T Reproduce {depth=3}
Environment: any machine with internet access, `curl` and `python3`.

1. Read the receipt of the Falcon demo transaction:

```bash title="Mainnet RPC · Falcon tx"
curl -s -X POST https://starknet-rpc.publicnode.com \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"starknet_getTransactionReceipt",
       "params":["0x72ae4404b44ad78de65bdc460f8cc87fea4a15ce93e07a37c6a68e9adb0a4b3"]}'
# Expected: execution_status SUCCEEDED; execution_resources.l2_gas = 63932548
#           actual_fee.amount = 0x1aba6437b7129348 (about 1.926 STRK)
```

2. Read the current mainnet version:

```bash title="Mainnet RPC · latest block version"
curl -s -X POST https://starknet-rpc.publicnode.com \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"starknet_getBlockWithTxHashes","params":["latest"]}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['starknet_version'])"
# Expected (2026-10-14): 0.14.4
```

3. Confirm the validation limits, address derivation and consensus TODO in source:

```bash title="sequencer @54f97a8a"
git clone --depth 1 https://github.com/starkware-libs/sequencer && cd sequencer
git fetch --depth 1 origin 54f97a8af3a712fb6c358e30f19e5a386cb7b4e3 && git checkout FETCH_HEAD
grep -n validate_max crates/blockifier/resources/blockifier_versioned_constants_0_14_4.json
grep -n "Pedersen::hash_array" crates/starknet_api/src/core.rs
grep -n "sign the vote" crates/apollo_consensus/src/state_machine.rs
# Expected: validate_max_n_steps 1000000, validate_max_sierra_gas 100000000;
#           calculate_contract_address uses Pedersen; one line TODO(Asmaa): sign the vote
```

4. Confirm ECDH in the privacy-pool source:

```bash title="starknet-privacy @f9256c5e"
git clone https://github.com/starkware-libs/starknet-privacy && cd starknet-privacy
git checkout f9256c5e37682d37437e69a795ddd51d924c9b97
grep -n "_compute_shared_x\|GEN_P" packages/privacy/src/utils.cairo
# Expected: _compute_shared_x computes r·G and r·K on the Stark curve
```

## U Glossary {depth=2}
```glossary
Native account | Starknet account | Every account is a contract; the protocol calls its `__validate__` and `__execute__`, and the contract picks the signature scheme. | Not an ERC-4337 account outside the protocol
Shor's algorithm | Shor | A quantum algorithm that solves discrete logs and factoring in polynomial time; it breaks ECDSA, ECDH and Pedersen. | Does not break hash functions
Grover's algorithm | Grover | A quantum search algorithm with a square-root speed-up on hash preimages; larger parameters offset it. | Does not break hashes outright
HNDL | harvest now, decrypt later | Record ciphertexts and public keys today; decrypt them once quantum attacks are practical. | Needs no quantum computer today
STARK | Scalable Transparent ARgument of Knowledge | A hash-only proof system that proves a computation followed its rules. Starknet implements it with S-two. | Does not make the proven program quantum-resistant
Pedersen | Pedersen hash | Takes the x coordinate of a linear combination of Stark-curve points; its security rests on discrete logs. | Called a hash, but not PQ
Poseidon | Poseidon hash | An algebraic, proof-friendly hash (Hades permutation). Starknet uses it for v3 tx hashes, the outer state commitment and privacy-pool derivations. | No official PQ rating
BLAKE2s | BLAKE2s-256 | A conventional bitwise hash; the roadmap picks it to replace Pedersen. | Not the same class as Poseidon
Falcon-512 | FN-DSA (FIPS 206) | An NTRU-lattice signature; 897-byte public key, 666-byte signature. | FIPS 206 is not final
hash-to-point | | The Falcon step that maps a message to the polynomial c; the standard uses SHAKE-256. | BLAKE2s / Poseidon variants do not interoperate with standard signers
MV-PQ | minimum viable post-quantum | EF's fallback milestone at J* that keeps Ethereum running after Q-day with weaker guarantees. | Not a full PQ migration
privacy pool | | One contract that keeps balances as notes; the core of STRK20. | Not a separate chain
note | | A balance record inside the privacy pool; the amount is masked with a channel key. | Not a native UTXO output
nullifier | | A unique value written when a note is spent; derived from a private key and written once. | Not the note_id
viewing key | privacy private key | A STRK20 user's Stark-curve private key k; it decrypts data and derives nullifiers and Shadow identities. Its public key is on-chain and registered once. | Not just a read-only key
auditor | | One global public key; at registration, each user's viewing private key is ECDH-encrypted to it. It can view but cannot spend. | Not a contract audit firm
ECDH | elliptic-curve Diffie-Hellman | Two parties derive the same shared secret on an elliptic curve; STRK20 uses the Stark curve. | Not a PQ key encapsulation
virtual OS | virtual Starknet OS | A Starknet OS run off-chain that executes the pool's private logic and produces a proof. | Not another chain
proof facts | | The public outputs of a proof (program hash, base block, message hash), checked by the gateway and the contract. | Not the proof itself
anonymizer | ShadowAccountAnonymizer | A contract that accepts calls only from the privacy pool and deploys and drives Shadow Accounts. | Not a mixer
Shadow Account | | A keyless proxy contract, one per (user, anonymizer, dapp_name, nonce), that hides only the link to the main wallet. | Not a protocol account; has no key
Primer | Primer contract | A placeholder contract with a fixed class; the address is computed and deployed from it, then swapped to the Shadow class. | Not the Shadow runtime class
```

## V References {depth=2}
1. [starkware-libs/sequencer @54f97a8a](https://github.com/starkware-libs/sequencer/tree/54f97a8af3a712fb6c358e30f19e5a386cb7b4e3) — blockifier account transactions and validation limits, versioned constants, `starknet_api` addresses and hashes, gateway proof verification, `apollo_consensus` votes. **PRIMARY**
2. [docs.starknet.io](https://docs.starknet.io/learn/protocol/accounts) — Accounts, Transactions, Fees, Cryptography, State, Staking, Data availability, Version Notes. **PRIMARY**
3. [starknet-io/SNIPs @1789f44e](https://github.com/starknet-io/SNIPs/tree/1789f44e) — SNIP-6, 8, 9, 12, 20, 29. **PRIMARY**
4. [OpenZeppelin/cairo-contracts @5cf9010e](https://github.com/OpenZeppelin/cairo-contracts/tree/5cf9010e653b8da506f1e9824cd74c441c4f8d87) — default account, EthAccount, Falcon account component, upgrades. **PRIMARY**
5. [argent-contracts-starknet @c30f61c5](https://github.com/argentlabs/argent-contracts-starknet/tree/c30f61c5b43e12fb88ea64dcdad9649033685d83) and Braavos accounts @158d7d0b — signer types, guardians, upgrade guards. **PRIMARY**
6. [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702), [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337), [ERC-7562](https://eips.ethereum.org/EIPS/eip-7562), [EIP-8141](https://eips.ethereum.org/EIPS/eip-8141) — EVM account authorization and Native AA proposal status. **PRIMARY**
7. [Quantum Hub · Migration Register](https://quantum.starkware.co/migration-register) — official per-component status (last updated 2026-08-19). **PRIMARY**
8. [Quantum Hub · Learn](https://quantum.starkware.co/learn), [Foundations](https://quantum.starkware.co/foundations), [Networks](https://quantum.starkware.co/networks) — the official answer on quantum resistance, STARK assumptions, cross-chain comparison (made by StarkWare). **PRIMARY**
9. [The Architecture Advantage: Starknet's Quantum Readiness Roadmap](https://starkware.co/blog/the-architecture-advantage-starknets-quantum-readiness-roadmap/) (2026-06-30) — the three-phase roadmap and its estimates. **PRIMARY**
10. [OpenZeppelin/cairo-pq-verifiers @bece5c07](https://github.com/OpenZeppelin/cairo-pq-verifiers/tree/bece5c07eeea5784e570c01108ec000d2d04ae40) — Falcon verifiers, hint / direct, `efficiency_baseline.json`; sizes from [falcon-sign.info](https://falcon-sign.info/). **PRIMARY**
11. Starknet mainnet RPC ([publicnode](https://starknet-rpc.publicnode.com)) and feeder gateway — Falcon tx, mainnet version, DA mode, pool parameters, Shadow deployment events (see Reproduce). **PRIMARY**
12. [NIST CSRC PQC Standardization](https://csrc.nist.gov/projects/post-quantum-cryptography/post-quantum-cryptography-standardization) and [FIPS 204](https://csrc.nist.gov/pubs/fips/204/final) — FIPS 206 "in development". **PRIMARY**
13. [@Starknet](https://x.com/Starknet/status/2108113391525204034) and the [@EliBenSasson thread](https://x.com/EliBenSasson/status/2108110129572741426) (2026-10-08) — "actively considering becoming an L1". **PRIMARY**
14. [v0.14.3 pre-release notes](https://community.starknet.io/t/starknet-0-14-3-pre-release-notes/116211), [v0.14.4 pre-release notes](https://community.starknet.io/t/116341), [status page](https://status.starknet.io/incidents/6l23lrrdvy9y) — release contents and dates. **PRIMARY**
15. [EF Protocol priorities](https://blog.ethereum.org/2026/09/07/protocol-priorities) (2026-09-07) and [pq.ethereum.org](https://pq.ethereum.org) — Ethereum's 2029 target, MV-PQ, EIP status. **PRIMARY**
16. [starkware-libs/starknet-privacy @f9256c5e](https://github.com/starkware-libs/starknet-privacy/tree/f9256c5e37682d37437e69a795ddd51d924c9b97) — privacy-pool contract, anonymizer, SDK, discovery specs, Lean development. **PRIMARY**
17. [OpenZeppelin Privacy Contracts Audit](https://github.com/starkware-libs/starknet-privacy/tree/f9256c5e37682d37437e69a795ddd51d924c9b97/docs/audit) (2026-05-29) — audit scope and findings. **PRIMARY**
18. [docs.starknet.io · Starknet Privacy](https://docs.starknet.io/build/starknet-privacy/security.md) — security, compliance, encryption-and-keys, paymasters, notes-and-nullifiers; plus the starkzap STRK20 page. **PRIMARY**
19. [SNIP-36 In-protocol S-two verification](https://community.starknet.io/t/116123) (Draft) — gateway verification; in Phase 1 only consensus verifies. **PRIMARY**
20. [Formal Verification of the STRK20 Privacy Pool](https://starkware.co/blog/strk20-formal-verification/) (2026-07-23) — scope of the formal work and the quote. **PRIMARY**
21. [strk20.starknet.io · Shadow accounts](https://strk20.starknet.io/docs/starknet-wallet-api/shadow-accounts) — official definition, privacy limits, address derivation notes. **PRIMARY**
22. [starkware-starknet-utils @3e2fd53d](https://github.com/starkware-libs/starkware-starknet-utils/tree/3e2fd53d99e16c87f6cf2ced53b8c842a2d54a18) — `shadow_account.cairo`, Primer. **PRIMARY**
23. starknet.io blog: [Privacy Is Now Live](https://www.starknet.io/blog/privacy-live-on-starknet/), [Push to Private](https://www.starknet.io/blog/push-to-private/), [v0.14.2](https://www.starknet.io/blog/starknet-v0-14-2-the-privacy-engine-arrives/), [Quantum Resistance](https://www.starknet.io/blog/quantum-resistance/) — launch dates and the former name "private sub-accounts". **PRIMARY**
24. [starkware-bitcoin/s2morrow @831bb518](https://github.com/starkware-bitcoin/s2morrow) and feltroidprime/s2morrow @4eff9ab9 — what each same-named repository is for. **PRIMARY**
25. research-hub report `native-aa-eip-8130-8141` — leads for the EVM Native AA comparison.
26. ChatGPT Deep Research: starknet-account-model.md — external research, used only as leads.

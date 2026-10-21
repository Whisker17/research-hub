# vitalik.eth (@VitalikButerin)

- URL: https://x.com/VitalikButerin/status/2097711433073172837
- Created: Wed Sep 09 15:39:13 +0000 2026
- Fetched: 2026-10-21 via api.fxtwitter.com

A note on recursive STARK mempools (EIP-8288) https://eips.ethereum.org/EIPS/eip-8288

This is an EIP that I am hoping we can get included in I-star (the fork after Hegota) that you can think of as the next step after Frames, that would unlock extreme amounts of power. Particularly:

* Ultra-cheap quantum-safe signatures (SPHINCS-). Much of the cost savings comes from the fact that the signature data (~3 kB) does not have to go onchain
* Ultra-cheap quantum-safe privacy protocols. Status quo minimum cost for private txs is ~300k if you engineer very well (no one does), status quo quantum-safe is ~10M gas, this could reduce it to low tens of thousands.
* Universal support for your favorite new signature or proof scheme without needing EVM changes. Whatever you use (Falcon, ML-DSA, some other lattice-based thing, something code-based or isogeny-based or even more esoteric), you can just wrap it client-side in a STARK, onchain gas cost low tens of thousands just like privacy protocols. Hopefully, Ethereum will never need "please support my favorite cryptographic algo" politics again.
* Private account abstraction: keep your account logic private, and in a private location onchain. Then you can make one transaction to change the ownership of all your onchain state - accounts, defi positions, privacy protocol notes, everything - without revealing which objects' ownership you're changing.

Here's how it works.

Your transaction can include a type of frame that we call a "dependency frame". The frame is a list of statements, asserting claims like "message hash M was signed by SPHINCS- public key P" and "data hash D was proven to satisfy a statement defined by verification key V".

When you send your transaction, you send it in an envelope, which includes a signature or a STARK for each statement in a dependency frame.

Once the transaction reaches the mempool, nodes aggregate them. Each node runs a loop: wait one tick (eg. 500ms), aggregate all new envelopes (either single-tx or multi-tx) that you've seen, remove any transactions that are expired, generate a STARK recursively proving all dependencies, and send a new multi-tx envelope containing that STARK.

Hence, the bandwidth load is bounded: each node's outbound is one STARK (~100-300 kB) per tick, plus each transaction getting broadcasted through the network once (as happens already).

The block builder acts as "yet another mempool node", receiving envelopes from the mempool (plus any side channels), generates its own STARK covering the subset of transactions it intends to include in the block, and adds that STARK to the block.

Total onchain overhead: one STARK (100-300 kB), plus 96 bytes for each statement being proven.

This is what I've called before ( https://www.youtube.com/watch?v=TSLUpOpsPF0 ) "The Proof Singularity". Today, we have all the ingredients to actually implement it.

As a developer, this requires a somewhat different workflow than you are used to, but it is conceptually simple. Any signatures or STARKs, you put into a separate frame. Then the main logic that today is verifying a signature or STARK, you replace with checking for the existence of a frame that includes the correct statement as a dependency.

Examples of useful statements:

* [tx sighash] verifies against [the pubkey at sload(0)]
* there exists a secret and a merkle branch such that hashing secret+0 and applying the merkle branch outputs (public) root R, and hashing secret+1 outputs (public) nullifier N
* there exists a secret address A, salt S and signature Z such that sload(0) = hash(A, S) and a merkle proof of address A inside a recent ethereum state contains some pubkey D where [tx sighash] was signed by D [this is private account abstraction; all variables except [tx sighash] and sload(0) are private; you can also make D a STARK verification key]
* there exists an ML-DSA signature signing [tx sighash], that verifies against an ML-DSA pubkey whose hash is sload(0)

At the core, this is moving any compute and data other than bookkeeping "business logic" outside the core path of Ethereum execution, sharding and parallelizing it via the mempool.

Notice also that this requires agreeing on a _language_ (aka. an ISA) for the recursive STARKs to define statements in. The current leading candidate is RISC-V. So this would also de-facto be Ethereum adding RISC-V (or something else we decide on) as a canonical ISA - a big decision that should be done carefully, but that I think will be necessary to drive Ethereum forward.

---
template: research
title: Uniswap v4 Hooks: Mechanics, v3 Feasibility, RWA, and In-Pool Graduation
subtitle: The key distinction of v4 is linking programmable execution rules directly into unified settlement. PoolManager guarantees only net balance clearance; developers must independently prove their hook's economic incentives, regulatory boundaries, and routability.
cols: 4
type: Technical Research · Developer Deep Dive
audience: Developers familiar with Solidity and v2/v3 AMM math who have not yet written v4 hooks
scope: v4 hook architecture and lifecycle, v3 feasibility comparisons, compliance and RWA hooks, in-pool graduation for equity-quoted launchpads, notable hook case studies, security post-mortems, and implications for Mantle
evidence: 253 claims ledger (observed 197 / inferred 43 / speculative 13); pinned source commits; accessed 2026-10-06
date: 2026-10-06 · v1
---
Bottom line: The true differentiator of v4 hooks is not merely executing arbitrary code around swaps. It lies in hooks actively determining trade sizing while composing natively with concentrated liquidity, multi-hop net settlement, and ERC-6909 internal claims ([F2](#F2)). Gating rules and dynamic fees become universally binding across all callers only when codified at the hook layer ([F1](#F1)). Crucially, PoolManager verifies only that per-address, per-currency net balances clear to zero at the end of `unlock`, without verifying whether a hook's internal accounting is economically sound ([F3](#F3)). For real-world assets (RWA), access gating belongs at the pool layer, but pool rules cannot substitute for token-layer transfer compliance ([F4](#F4)). Single-pool graduation for equity-quoted launchpads is mathematically viable, but lacks production precedents ([F6](#F6)).

## A Architecture Overview {sheet meta="components"}
```tree list
`PoolManager` Singleton | Holds state and assets for all pools in a single contract
`PoolKey` Pool Identity | Currency pair, fee tier, tickSpacing, and hook address
`Hook` External Contract | Lower 14 bits of address encode permission flags
`Router` Execution Caller | Unlocks PoolManager to execute swaps, settlements, and takes
`PositionManager` LP Wrapper | Manages LP positions as ERC-721 tokens
`ERC-6909` Internal Claims | Native multi-token claims ledger custodying pool assets
```

## B Permission Bitflags: 10 Callbacks + 4 Return Deltas {sheet span=2 meta="Hooks.sol"}
```annot
# Lower 14 bits of hook address | Bits 13 → 0
[bI aI]{Bits 13, 12: Pool initialize} [bAL aAL]{Bits 11, 10: Add liquidity} [bRL aRL]{Bits 9, 8: Remove liquidity} [bS aS]{Bits 7, 6: Swap execution} [bD aD]{Bits 5, 4: Donate flow} [4x RD]{!Bits 3–0: Return deltas override balance sheet}
> Example: Hook enabling only beforeSwap must have lower 14 bits equal to 0x0080, mined via CREATE2 salt search
```

## C Feature Viability: v3 vs. v4 {sheet meta="v3 vs v4"}
| Capability | Can Native v3 Enforce at Pool Layer? |
|---|---|
| Access allowlists | no Can be bypassed by interacting directly with pool |
| Dynamic fee tiers | no Pool fee tiers are immutable |
| Custom bonding curves / custom accounting | no Swap invariants are hardcoded |
| Curveless launchpad | ok Viable using initial concentrated LP |
| Custom curve → Concentrated LP in-pool shift | no Requires v4 return delta mechanisms |

## D Key Metrics {sheet span=2 meta="2026-10"}
| Metric | Value | Source |
|---|---|---|
| Pool Creation Gas | v4: 51,532; v3: 4,557,092 | Official snapshot tests [4][9] |
| v4 30-Day Volume | $42.45B (DefiLlama) | [41] |
| Initialized Hooks | 1,000+ (Uniswap Foundation report) | [39] |
| Official v4 Deployments | 25 chains (Mantle not yet included) | Deployment registry [34] |

## E Evolution Timeline {sheet span=2 meta="2025–2026"}
```timeline
2025-05 | Cork Protocol Exploit | hookData authorization check bypassed, ~$12M loss
2025-07 | Angstrom Deployed | L1 MEV-protection hook activated
*2025-09 | Bunni Protocol Exploit | Multi-step rounding bug, ~$8.4M loss, operations paused
2026-07 | Permissioned Pools | Uniswap official permissioned pool standard released
2026-09 | StablePair Launches | Dynamic fee hook launched; adapter validation fixed
*2026-10 | SMBC Nikko Partnership | Japanese regulated institutional DeFi Gateway planned
```

## F Conclusions {sheet span=4}
```callout ok Master settlement semantics before writing hooks
- Mechanics: Hooks can reject calls, override fees, and modify accounting; net debt must clear before unlock ends, but zero net debt does not guarantee correct internal accounting.
- v3 Comparison: Callbacks themselves do not strictly require v4; what truly requires v4 is the singleton architecture, flash accounting, and return deltas.
- RWA: Place whitelist gating at the pool level, while preserving compliance restrictions at the token level; permissioned pools disallow permissioned tokens from acting as intermediate hops.
- In-Pool Graduation: Mathematically sound; key engineering hurdles are settlement price, reserve solvency, position conversion, and crossing-order execution. Prove concentrated multi-curve LP is insufficient before adding custom curves.
```

## G How to Read {depth=1}
```callout info Assumed Knowledge (not re-explained here)
- Solidity smart contracts, ERC-20 standard, contract-to-contract external calls
- Uniswap v2 constant product ($x \times y = k$) and v3 concentrated liquidity fundamentals
- EVM gas accounting, block transaction ordering, public mempools
```
- **5 minutes**: Read Overview (A–F) and Lead.
- **30 minutes (Writing hooks)**: Follow [Prerequisites](#panel-I), [v4 Mechanics](#panel-J), [Callbacks and Accounting](#panel-K), and [Engineering & Security](#panel-Q).
- **30 minutes (Evaluating RWA or launchpads)**: Read [v3 Viability](#panel-M), [Compliance & RWA](#panel-N), [In-Pool Graduation](#panel-O), and [Implications for Mantle](#panel-R).

## H Background & Motivation {depth=2}
**Problem**: Hooks represent the newest design paradigm across decentralized exchanges. Teams must understand how to review, design, and implement hooks safely, while evaluating whether RWA compliance and token launchpads belong at the pool layer or token layer.

**Why Now**:
- Uniswap standardized Permissioned Pools in 2026-07 and patched adapter validations in 2026-09; SMBC Nikko announced an institutional compliant gateway using v4 hooks in 2026-10 [23][22][26].
- Tokenized equity launchpads (Pons, PAIR, Bankr) have appeared on Robinhood Chain [30][31][33].
- Proposals for Mantle suggest pairing equity quotes with bonding curves and in-pool graduation [40].

**Scope**: Hook mechanics and lifecycles, v3 feasibility boundaries, compliance and RWA patterns, launchpad in-pool phase shifts, security post-mortems, and architectural choices for Mantle.

**Pinned Commits**: v4-core `46c6834`, v4-periphery `9969eec`, v4-template `1fbf955`, v4-hooks-public `e4eabe5`.

## I Prerequisites {depth=2}
```excalidraw q="What concepts are necessary to understand v4 hooks, and in what order?" read="Arrows denote learning sequence. Gray dashed boxes represent assumed knowledge; green boxes represent core themes." takeaway="B-0, B-2, and B-3 explain flash accounting; B-1 covers liquidity models; B-4 and B-5 explain hook deployment immutability." name=prereq-map kind="Prerequisites Map"
{"grid": {"w": 300, "h": 120}, "defaults": {"w": 190, "h": 60},
 "nodes": [
   {"id": "v2", "label": "v2/v3 Math (Assumed)", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "sol", "label": "Solidity (Assumed)", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 v3 Swap Callback", "col": 1, "row": 0, "color": "blue"},
   {"id": "b1", "label": "B-1 Concentrated LP", "col": 1, "row": 1, "color": "blue"},
   {"id": "b4", "label": "B-4 CREATE2 Mining", "col": 1, "row": 2, "color": "blue"},
   {"id": "b5", "label": "B-5 Proxy Upgrades", "col": 1, "row": 3, "color": "blue"},
   {"id": "b2", "label": "B-2 Transient Storage", "col": 2, "row": 0, "color": "blue"},
   {"id": "b3", "label": "B-3 ERC-6909 Claims", "col": 3, "row": 0, "color": "blue"},
   {"id": "mech", "label": "v4 Flash Accounting", "col": 3, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "app", "label": "RWA & In-Pool Shift", "col": 3, "row": 3, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "v2", "to": "b0"}, {"from": "v2", "to": "b1"}, {"from": "b0", "to": "b2"},
   {"from": "b2", "to": "b3"}, {"from": "sol", "to": "b4"}, {"from": "sol", "to": "b5"},
   {"from": "b3", "to": "mech"}, {"from": "b1", "to": "mech"}, {"from": "b4", "to": "mech"},
   {"from": "b5", "to": "app"}, {"from": "mech", "to": "app"}
 ]}
```

```prereq B-0 l1 5min
# v3 Swap Callback Payments
what: In Uniswap v3, the pool transfers output tokens to the recipient first, then calls `uniswapV3SwapCallback` on the caller, expecting payment before checking its resulting balance.
why: This callback targets the caller rather than an independent pool policy; anyone can implement the callback and interact with the pool directly, bypassing front-end routers.
misconception: Misconception: The v3 callback functions like a hook. Fact: Callbacks are caller payment channels; v3 core provides zero universal hooks binding all callers.
deeper: [9] v3-core `UniswapV3Pool.sol` swap and mint
```

```prereq B-1 l1 5min
# Concentrated and Single-Sided Liquidity
what: LPs allocate capital within a bounded tick range. When the range lies entirely above or below current price, the position holds only a single token.
why: Many curveless issuance designs place newly issued tokens into single-sided or multi-range concentrated LP positions to mimic bonding curves. This pattern is fully achievable on v3.
misconception: Misconception: Curveless issuance requires v4. Fact: Emulating curves via static concentrated liquidity positions works identically on v3.
deeper: [32] Doppler multicurve documentation
```

```prereq B-2 l1 5min
# Transient Storage (EIP-1153)
what: `TSTORE` and `TLOAD` read and write transient storage valid only for the duration of the current transaction, clearing automatically at gas cost of 100 per operation.
why: Uniswap v4 logs lock status and per-currency net deltas inside transient storage, asserting clearance only at `unlock` termination.
misconception: Misconception: EIP-1153 is a prerequisite for KYC checks. Fact: It is the operational foundation for v4 flash accounting, independent of identity logic.
deeper: [1] v4-core `Lock.sol` and `NonzeroDeltaCount.sol`
```

```prereq B-3 l1 5min
# ERC-6909 Claims
what: Multi-token balance vouchers internal to PoolManager. Users and hooks can claim owed tokens inside PoolManager without transferring ERC-20s, burning claims later to settle debits.
why: High-frequency market makers and hooks avoid external ERC-20 transfer overhead; transfers of 6909 claims occur invisibly to the underlying ERC-20 contract.
misconception: Misconception: ERC-6909 claims represent LP shares. Fact: Claims correspond to raw token balances without price ranges or pool association.
deeper: [1] v4-core `ERC6909.sol`
```

```prereq B-4 l1 4min
# CREATE2 Address Mining (HookMiner)
what: Contract deployment address is deterministically computed from deployer, salt, and initcode hash. Salt values are mined until the lower 14 bits match the required permission flags.
why: PoolManager checks the lower 14 bits of the hook address rather than an on-chain registry to determine callback invocations.
misconception: Misconception: Permissions can be adjusted post-deployment. Fact: Address bits define permissions; changing permissions requires deploying a new address and initializing a new pool.
deeper: [5] v4-periphery `HookMiner.sol`
needs: B-0
```

```prereq B-5 3min
# Proxies and Upgradeability
what: A proxy contract forwards calls via `delegatecall` to an implementation contract; state remains at the proxy address while code can be upgraded.
why: While a hook address fixes its permission bits, proxy hooks can upgrade internal execution logic. LPs must scrutinize admin upgrade authority.
deeper: [36] StablePair blog on upgrade scope
```

## J v4 Mechanics: Singleton, Unlock, and Flash Accounting {depth=2}
```excalidraw q="Who holds custody of pool assets, and who calls whom in Uniswap v4?" read="Blue denotes v4 core singleton; green denotes custom hook; gray denotes users and tokens." takeaway="PoolManager holds all pool assets; hooks are external contracts invoked at designated stages and do not custody pool liquidity." kind="System Flow"
{"grid": {"w": 360, "h": 130}, "defaults": {"w": 200, "h": 64},
 "nodes": [
   {"id": "u", "label": "Trader", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "r", "label": "Router / PositionMgr", "col": 1, "row": 1, "w": 230},
   {"id": "pm", "label": "PoolManager Singleton", "col": 2, "row": 1, "color": "blue", "strokeWidth": 3},
   {"id": "pools", "label": "pools[PoolId]", "col": 2, "row": 0, "color": "violet"},
   {"id": "d", "label": "Transient Net Deltas", "col": 2, "row": 2, "color": "violet"},
   {"id": "h", "label": "Hook Contract", "col": 3, "row": 1, "color": "green"},
   {"id": "t", "label": "ERC-20 Contracts", "col": 1, "row": 2, "color": "gray", "stroke": "dashed"}
 ],
 "edges": [
   {"from": "u", "to": "r", "label": "Executes"}, {"from": "r", "to": "pm", "label": "Unlocks"},
   {"from": "pm", "to": "h", "label": "Invokes"}, {"from": "pm", "to": "pools", "dashed": true},
   {"from": "pm", "to": "d", "dashed": true}, {"from": "t", "to": "pm", "label": "Transfers"}
 ]}
```

- **Singleton Architecture**: All pools exist as state entries `_pools[PoolId]` inside `PoolManager`. `PoolId` is computed by hashing the `PoolKey` struct (`currency0`, `currency1`, `fee`, `tickSpacing`, `hooks`). Creating a pool writes storage without deploying bytecode [1].
- **One Hook per Pool**: Each pool binds exactly one hook address. A single hook contract can serve multiple pools, keeping state partitioned by `PoolId` [1][8].
- **Hooks Are External Calls**: PoolManager enters hooks via external calls. A hook interacts with execution in four ways: reverting the call, returning a dynamic fee, returning a delta override, or calling PoolManager during unlock [2].

## K Flash Accounting and Delta Clearance {depth=2}
```uml q="How do deltas clear across multi-hop and hook-managed swaps?" read="Shows multi-hop intermediate token offset and Hook return delta absorption." takeaway="PoolManager asserts only that net deltas per address per currency equal zero; external ERC-20 transfers occur strictly at boundaries."
sequenceDiagram
  autonumber
  participant R as Router
  participant PM as PoolManager (Transient Delta)
  participant H as LaunchHook (Holds 6909)

  Note over R,H: Multi-hop: Token A → Token B → Token C
  R->>PM: swap A/B: A -100, B +99
  R->>PM: swap B/C: B -99, C +990
  Note over PM: Currency B nets to +99 - 99 = 0 (Automatically cleared)
  R->>PM: settle 100 A (Transfer in), take 990 C (Transfer out)

  Note over R,H: In-Pool Hook: beforeSwapReturnDelta Override
  R->>PM: swap 100 Token A → Token C
  PM->>H: beforeSwap: Hook takes 100 A, gives 1000 C
  Note over PM: Router[-100 A, +1000 C] vs Hook[+100 A, -1000 C]
  H->>PM: mint 100 A claims, burn 1000 C claims
  R->>PM: settle 100 A, take 1000 C
```

```finding F1 high
# Pool-Layer Enforcement Binds All Callers, Eliminating Router-Level Bypass Vectors
claim: Rules encoded into v4 hooks execute on every swap, liquidity action, and donation across all external callers (with the exception of hook self-calls permitted by v4-core). In v3, custom router rules are bypassed if callers interact directly with the pool.
evidence: [observed] PoolManager execution flow in `PoolManager.sol#L104-L140` [1].
implication: All access-control and pricing policies must reside in hooks to be universally binding.
```

```finding F2 high
# Flash Accounting and Return Deltas Enable Custom Automated Market Maker Curves Inside Pools
claim: Hooks bearing `beforeSwapReturnDelta` can absorb trades, overriding native concentrated liquidity calculation and quoting via arbitrary formulas.
evidence: [observed] v4-core `Hooks.sol` bitflag `BEFORE_SWAP_RETURNS_DELTA_FLAG` [1][8].
implication: Bespoke bonding curves can operate inside standard Uniswap v4 pools without separate curve deployment.
```

```finding F3 high
# PoolManager Guarantees Balance Clearance but Not Economic Solvency
claim: PoolManager checks only that `NonzeroDeltaCount == 0` upon unlock exit. It does not validate whether a hook's pricing formula is fair or whether its reserves are solvent.
evidence: [observed] `PoolManager.sol#L111` assert statement [1].
implication: Hook developers bear complete responsibility for the economic and cryptographic security of custom accounting.
```

## L Compliance, RWA, and Permissioned Pools {depth=2}
```finding F4 high
# Pool Access Allowlists Cannot Replace Token-Level Transfer Restrictions for Regulated RWAs
claim: While a hook can restrict swaps and LP actions to KYC-verified addresses, traders receiving underlying ERC-20 tokens can transfer them outside the pool unless the token contract itself enforces compliance.
evidence: [observed] Architecture of Uniswap Permissioned Pools standard [23].
implication: Regulated assets must implement transfer restrictions at both the token contract and the pool hook layer.
```

```finding F5 medium
# Official Permissioned Pools Prevent Permissioned Tokens from Acting as Intermediate Routing Hops
claim: Uniswap's Permissioned Pool implementation disallows permissioned tokens from being used as intermediate bridging hops in multi-hop swaps, protecting unqualified accounts from receiving restricted assets.
evidence: [observed] `PermissionedPoolHook.sol` transfer validation logic [23].
implication: Multi-hop routing algorithms must filter out compliance-restricted token pairs for general public orderflow.
```

## M In-Pool Graduation and Launchpad Mechanics {depth=2}
```finding F6 high
# In-Pool Phase Shifts Are Mathematically Sound but Lack Production Deployment Precedents
claim: A hook quoting a bonding curve via return deltas can mathematically shift into native concentrated liquidity upon hitting reserve thresholds. However, zero major production launchpads currently adopt this architecture.
evidence: [observed] Survey of active launchpads on Base, Solana, and Robinhood Chain; Pons V2 and Clanker utilize separate deployment or curveless models [30][31][33].
implication: Teams adopting in-pool graduation must conduct novel security audits on phase transition boundaries.
```

```finding F7 medium
# Crossing Orders Straddling Graduation Require Deterministic Splitting
claim: When a single swap spans across the curve-to-concentrated liquidity threshold, the hook must either split execution between curve and concentrated ticks or clamp the fill at the threshold.
evidence: [inferred] Discrete execution analysis on bonding curve phase shifts.
implication: Clamping and refunding excess input is significantly simpler and safer than multi-engine execution within a single transaction.
```

## N Security Case Studies and Post-Mortems {depth=2}
```finding F8 high
# Cork Protocol Exploit: Unvalidated hookData Created Free Flash Lending
claim: Cork Protocol's hook accepted caller-supplied `hookData` without asserting origin authority, allowing an attacker to drain ~$12M by forging liquidity parameters.
evidence: [observed] Post-mortem analysis of Cork exploit on 2025-05 [15].
implication: Never trust caller-supplied `hookData` without verifying signatures or strict caller whitelists.
```

```finding F9 high
# Bunni Protocol Exploit: Multi-Step Rounding Truncation Led to Precision Drain
claim: Bunni Protocol suffered an ~$8.4M drain due to integer rounding discrepancies between multi-step liquidity operations within a single unlock session.
evidence: [observed] Bunni Protocol post-mortem and subsequent operational shutdown [16].
implication: Hook math must round against the caller on both deposit and withdrawal paths.
```

```finding F10 medium
# Pool Reentrancy and Hook Recursion Require Guard Locks
claim: PoolManager prevents nested unlocks, but hooks that invoke external contracts or other pools can create indirect reentrancy loops unless reentrancy guards are applied.
evidence: [observed] `Lock.sol` single-unlock assertion [1].
implication: Hooks must enforce non-reentrant guards on state-modifying callbacks.
```

## O Implications for Mantle {depth=2}
```finding F11 medium
# Uniswap v4 Deployment on Mantle Requires Upstream Governance or Custom Deployments
claim: Official Uniswap v4 deployments span 25 chains but do not include Mantle. Deploying v4 on Mantle requires community deployment or local fork infrastructure.
evidence: [observed] Uniswap v4 official deployment addresses registry [34].
implication: Mantle can deploy v4 core contracts directly to empower native ecosystem DEXs like Merchant Moe or Agni.
```

```finding F12 high
# Transient Storage (EIP-1153) is Operational on Mantle
claim: Mantle L2 supports Cancun opcodes `TSTORE` and `TLOAD` per official upgrade documentation, providing the required execution foundation for v4 flash accounting, while direct live RPC transient-storage test suites remain pending.
evidence: [observed] Mantle node opcode support verified post-Cancun hard fork [35].
implication: v4 contracts compile and run on Mantle without opcode emulation.
```

```finding F13 medium
# Multi-Range Concentrated Liquidity Provides a Low-Risk Alternative to Custom Hook Curves
claim: Issuance models using multi-tier concentrated liquidity distributions (e.g. Doppler) achieve bonding curve price discovery without custom return delta auditing.
evidence: [observed] Production metrics of Doppler protocols across Base and Arbitrum [32].
implication: Evaluate whether multi-range static LP satisfies launchpad requirements before writing custom hook curves.
```

## P Glossary {depth=2}
```glossary
PoolManager | PoolManager Singleton | The central contract in Uniswap v4 holding all pool states and custodial token balances.
PoolKey | PoolKey Identifier | The unique tuple (currency0, currency1, fee, tickSpacing, hooks) defining a v4 pool.
hook | Hook Contract | An external contract called before and after pool actions, whose address bits encode permissions.
flash accounting | Flash Accounting | Transient storage bookkeeping where net debits and credits must clear before unlock ends.
return delta | Return Delta Override | Callback return value that modifies swap accounting, enabling custom curves.
ERC-6909 | ERC-6909 Claims | Multi-token balance claims held within PoolManager avoiding ERC-20 transfers.
transient storage | Transient Storage | EIP-1153 storage opcodes clearing automatically at transaction conclusion.
CREATE2 | CREATE2 Deployment | Deterministic deployment opcode used to mine addresses matching hook bitflag requirements.
permissioned pool | Permissioned Pool | A pool hook enforcing KYC, geographic, or identity access control on swaps and LPing.
in-pool graduation | In-Pool Graduation | Transitioning a pool from an internal bonding curve to native concentrated liquidity.
hookData | Hook Data Payload | Arbitrary bytes passed from callers through PoolManager into hook callbacks.
```

## Q References {depth=2}
1. [Uniswap/v4-core PoolManager.sol @46c6834](https://github.com/Uniswap/v4-core/blob/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src/PoolManager.sol) — unlock, swap, take, mint semantics. **PRIMARY**
2. [Uniswap/v4-core Hooks.sol @46c6834](https://github.com/Uniswap/v4-core/blob/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src/libraries/Hooks.sol) — Permission bits, callbacks, return deltas. **PRIMARY**
3. [Uniswap/v4-core IHooks.sol, BeforeSwapDelta.sol, LPFeeLibrary.sol](https://github.com/Uniswap/v4-core/tree/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src) — Callback signatures, delta coordinates, dynamic fees. **PRIMARY**
4. [Uniswap/v4-core gas snapshots](https://github.com/Uniswap/v4-core/tree/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/snapshots) — Pool creation and swap gas benchmarks. **PRIMARY**
5. [Uniswap/v4-periphery @9969eec](https://github.com/Uniswap/v4-periphery/tree/9969eec44cfdf07e24b41de47f40276a58401976) — V4Router, PositionManager, DeltaResolver, HookMiner. **PRIMARY**
6. [Uniswap/v4-template @1fbf955](https://github.com/uniswapfoundation/v4-template) — Counter hook and deployment scripts. **PRIMARY**
7. [OpenZeppelin/uniswap-hooks](https://github.com/OpenZeppelin/uniswap-hooks) — BaseHook, LimitOrderHook. **PRIMARY**
8. [Uniswap v4 Docs: Hooks, Dynamic Fees, PoolManager](https://docs.uniswap.org/contracts/v4/concepts/hooks) — Official concept specifications. **PRIMARY**
9. [Uniswap/v3-core](https://github.com/Uniswap/v3-core) — Per-pool contract, swap callbacks, fee tiers, gas snapshots. **PRIMARY**
10. [Algebra Integral Plugin Docs](https://docs.algebra.finance/algebra-integral-documentation/algebra-integral-technical-reference/core-logic/plugins) — v3-style plugin architecture. **PRIMARY**
11. [PancakeSwap Infinity Dev Docs](https://developer.pancakeswap.finance/) — Vault + singleton, hook bitmap. **PRIMARY**
12. [Balancer v3 Hooks Documentation](https://docs.balancer.fi/concepts/core-concepts/hooks.html) — Registration-time fixed hooks. **PRIMARY**
13. [Trail of Bits: Building Secure Uniswap v4 Hooks](https://blog.trailofbits.com/2026/07/30/building-secure-uniswap-v4-hooks/) — Hook vulnerability taxonomies.
14. Uniswap Foundation Hook Security Framework — Risk dimensions and upgradeability guidance.
15. Cork Post-Mortem (2025-06-04) — hookData authorization bypass analysis. **PRIMARY**
16. [Bunni: Exploit Post-Mortem](https://blog.bunni.xyz/posts/exploit-post-mortem/) — Multi-step rounding precision incident. **PRIMARY**
17. uniroute-public (Uniswap Routing) — Admission criteria for hooked pools. **PRIMARY**
18. 1inch and 0x v4 Hook Routing Specifications — Off-chain routing exclusions.
19. [Uniswap Blog: How Permissioned Pools Work on Uniswap v4](https://blog.uniswap.org/how-permissioned-pools-work-on-uniswap-v4) — Token boundary visibility. **PRIMARY**
20. [Uniswap Docs: Permissioned Pools Architecture](https://developers.uniswap.org/docs/protocols/uniswap-labs-hooks/permissioned-pools/architecture) — Four contracts and lifecycle callbacks. **PRIMARY**
21. [Uniswap Docs: Swapping Through Permissioned Pools](https://developers.uniswap.org/docs/trading/swapping-api/swapping-permissioned-pools) — Disallowance of intermediate hops, Router 2.2.0. **PRIMARY**
22. [Uniswap/v4-hooks-public PermissionedHooks](https://github.com/Uniswap/v4-hooks-public/tree/e4eabe5) & v4-periphery 9969eec — Source code and adapter verification commits. **PRIMARY**
23. [Uniswap Blog: Introducing Permissioned Pools](https://blog.uniswap.org/introducing-permissioned-pools-on-uniswap-v4) — Release announcement and institutional partners. **PRIMARY**
24. [predicatelabs/predicate-paxos](https://github.com/predicatelabs/predicate-paxos) — Signature admission and AutoWrapper patterns. **PRIMARY**
25. [Verified Pools Documentation](https://docs.verifiedpools.com/) — EAS attestation-based admission. **PRIMARY**
26. [Uniswap Blog: SMBC Nikko and Nethermind](https://blog.uniswap.org/smbc-nikko-and-nethermind-are-building-a-defi-gateway-for-japan-on-uniswap-v4) — Regulated institutional DeFi gateway in Japan. **PRIMARY**
27. [xStocks: Dividends & Stock Splits](https://docs.xstocks.fi/developers/multipliers) — EVM rebasing token multiplier architecture. **PRIMARY**
28. [Robinhood Chain: Stock Tokens & Oracles](https://docs.robinhood.com/chain/stock-tokens/) — uiMultiplier and 24/5 oracle price streams. **PRIMARY**
29. [hookwright/untoll-hook](https://github.com/hookwright/untoll-hook) — Reference implementation of in-pool graduation (testnet). **PRIMARY**
30. [Pons V2 Documentation](https://docs.ponsfamily.com/v2) — Standalone curve minting concentrated LP positions upon graduation. **PRIMARY**
31. PAIR Press Release (GlobeNewswire 2026-08-31) — Equity-quoted single-sided pools.
32. [Doppler Documentation](https://docs.doppler.lol) — Multi-tier liquidity positions and noOp migration models. **PRIMARY**
33. [Bankr Documentation](https://docs.bankr.bot/token-launching/overview) — Equity-denominated token issuance mechanics. **PRIMARY**
34. [Uniswap deployments.json](https://developers.uniswap.org/deployments.json) — Multi-chain deployment registry. **PRIMARY**
35. [Mantle Docs: Network Architecture](https://docs.mantle.xyz/network) — Skadi upgrade with EIP-1153 support, native MNT token. **PRIMARY**
36. [Uniswap/v4-hooks-public StablePair Blog](https://blog.uniswap.org/keeping-value-in-the-pool-how-stablepair-hook-works) — StablePair dynamic fee mechanisms. **PRIMARY**
37. [Angstrom Documentation](https://docs.angstrom.xyz) — L1 architecture and L2 priority fee taxation models. **PRIMARY**
38. Clanker v4 Hook Repository — Dynamic LP fees and protocol splits. **PRIMARY**
39. [Uniswap Foundation: Hook Design Lab](https://www.uniswapfoundation.org/blog/introducing-the-uniswap-v4-hook-design-lab) — Over 1,000 initialized hooks, routing incentives.
40. Project Reference Dossier (`mantle-v3-roadmap`) — `tape-design.md`, `05-compliance-and-permissioning.md`, `xstocks-inputs.md`.
41. [DefiLlama: Uniswap v4 Telemetry](https://defillama.com/protocol/uniswap-v4) — Adoption metrics and 30-day trading volume. **PRIMARY**

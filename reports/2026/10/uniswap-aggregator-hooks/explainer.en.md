---
template: research
title: "Uniswap Aggregator Hooks: Wrapping External Liquidity as v4 Pools"
subtitle: The hook trades on the external venue inside beforeSwap, then returns a delta that cancels v4's own curve. v4 supplies only the pool identity and unified settlement; reserves and pricing stay in the source protocol.
cols: 4
type: Technical research · code-level teardown + onchain data
audience: Developers who know Solidity and Uniswap v2/v3 but have not written a v4 hook
scope: How Aggregator Hooks work in code, the v4 hook background they need, comparison with classic aggregators, trade-offs, adoption, and where hooks are heading
evidence: 105-claim ledger (observed 78 / inferred 18 / speculative 9); source v4-hooks-public@2264ac8, v4-core@d153b04; Dune queries and cast reads, accessed 2026-10-24
date: 2026-10-24 · v1
---
Bottom line: Aggregator Hooks do not move Curve, Fluid or V3-fork assets into Uniswap. An adapter hook wraps each kind of external source. In `beforeSwap`, the hook trades on the external venue, then returns a delta that makes v4's own curve do nothing ([F1](#F1), [F2](#F2)). The "v4 pool" is therefore only an identity that routers can quote, compose and settle in one place.

Compared with 1inch-style aggregators, the venue adapter moves from a private contract into a public v4 pool interface ([F5](#F5)). The cost is a 1–10 bp protocol fee on top of the venue fee ([F6](#F6)). Onchain, these hooks have run since 2026-04. In the last 16 days, 99.6% of Ethereum volume was LitePSM stablecoin conversion, and lifetime protocol fees total about $2,500 ([F8](#F8)).

## A Who takes part in an Aggregator Hook swap {sheet meta="parts"}
```tree list
`Universal Router` | Execution entry; tokens are approved to Permit2, and the router pays and collects
`PoolManager` | The v4 singleton; it keeps the books but holds no reserves for this "pool"
`PoolKey` virtual pool | Two currencies + fee + tickSpacing + hook address
`Aggregator Hook` | Trades on the external venue inside beforeSwap
External venue | Curve / Fluid / V3 forks / LitePSM: reserves, pricing and venue fees live here
`TokenJar` | Receives protocol fees, later used to burn UNI
```

## B The key line: a returned delta cancels the v4 curve {sheet span=2 meta="BaseAggregatorHook.sol"}
```annot
# beforeSwap return value | exact-in example: sell X token0
[toBeforeSwapDelta(]{} [specified = −amountSpecified]{!= +X: brings the core swap amount to 0, so the v4 curve does not trade} [, unspecified]{= −(Y − f): the external output minus the protocol fee} [)]{}
> PoolManager then books the swapper against this delta; every delta must be zero when unlock ends, or the whole transaction reverts
```

## C How it differs from a classic aggregator {sheet meta="vs 1inch / 0x"}
| Dimension | Aggregator Hooks |
|---|---|
| Route search | warn Still offchain, in Uniswap's routing service / API |
| Identity of the external venue | ok A v4 PoolKey that any router can call |
| Execution entry point | ok Unified settlement in PoolManager |
| User approvals | ok Permit2 (approval) + Universal Router (execution), nothing new |
| Extra fee | warn Protocol fee of 1–10 bp |
| Routed by Uniswap? | warn Depends on the allowlist |

## D Key numbers {sheet span=2 meta="2026-10-24"}
| Metric | Value | Source |
|---|---|---|
| Announced launch | 2026-10-22; Ethereum, Base, Robinhood Chain | [6] |
| First onchain swap | 2026-04-19 (Ethereum) | Dune [4] |
| Ethereum volume, last 16 days | About $250M, 99.6% from LitePSM | Dune [4] |
| Protocol fee settings | 10 bp / 3 bp (Base 3 bp / 1 bp), LitePSM 0 | Dune [4], [10] |
| Protocol fees collected | About $2,500 lifetime | Dune [4] |
| Share through Universal Router | About 70% of hook swaps | Dune [4] |

## E Timeline {sheet span=2 meta="2025–2026"}
```timeline
2025-11 | UNIfication proposal | Item 4: launch aggregator hooks that collect fees on external liquidity
2026-03 | Tempo launch | First production aggregator hook, wrapping Tempo's stablecoin DEX
2026-04 | First onchain swap | A Curve adapter emits HookSwap on Ethereum
2026-07 | v4 protocol fee proposal | Aggregator hooks get their own fee family and a 25× multiplier
2026-09 | 0x blog post | "Uniswap v4 hooks were a mistake" questions hook safety
*2026-10-22 | Public launch | Web App and API, 7 sources
```

## F Conclusion {sheet span=4}
```callout ok Understand the "virtual pool" before the narrative
- Mechanism: the hook trades for v4 inside `beforeSwap`; `specified = −amountSpecified` idles the core curve; the zero-delta check at unlock is the backstop.
- Difference: this is not another 1inch. Route search stays offchain, but external venues become v4 pools that any router can call and that settle in PoolManager.
- Cost: through the hook, the same external pool costs 1–10 bp more than a direct call; routing depends on the allowlist.
- Today: real flow comes mostly from Uniswap's own router and stablecoin PSM conversion; protocol fee income is still small. Start with [the mechanism](#panel-J).
```

## G How to read this {depth=1}
```callout info You already know (not explained here)
- Solidity, ERC-20, external calls and callbacks between contracts
- Uniswap v2 constant product, v3 concentrated liquidity and fee tiers
- What a DEX aggregator does: split one trade across several venues
```
- **5 minutes**: the overview (A–F) and the lead.
- **30 minutes, to explain the mechanism**: read [Background](#panel-I), [How the virtual pool works](#panel-J), [The swap sequence](#panel-K) and [Adapter differences](#panel-L) in order.
- **30 minutes, to judge the market**: read [Versus aggregators](#panel-M), [Trade-offs](#panel-N), [Onchain data](#panel-O) and [Outlook](#panel-P).
- **Everything**: also read [Method and evidence](#panel-R) and [Reproduce](#panel-S).

## H Context {depth=2}
**Problem**: On 2026-10-22 Uniswap announced "Uniswap v4 is now an aggregator". It said 7 external sources cover more than 90% of DEX activity on the three chains [6]. Readers want to know three things. How can v4 "borrow" another protocol's liquidity as a v4 pool? How does this differ from 1inch or 0x? Does it matter?

**Why now**:
- The UNIfication proposal of 2025-11 lists this feature: "turning Uniswap v4 into an onchain aggregator that collects fees on external liquidity" [3][12].
- The v4 protocol fee proposal of 2026-07 gives aggregator hooks their own fee, with a cap of 250 bp [10].
- Debate about hooks is growing; in 2026-09, 0x publicly questioned hook safety [16].

**Scope**:
- How Aggregator Hooks work in code, plus the v4 background they need
- Comparison with aggregators and intent systems
- Trade-offs, adoption, and where hooks are heading

**Non-goals**: investment advice and token price views; a full security audit of the adapters; Uniswap governance details (only where the protocol fee matters).

**Source baseline**: v4-hooks-public `2264ac8`, v4-core `d153b04`, protocol-fees `656096f`. All line numbers refer to these commits.

## I Background {depth=2}
```excalidraw q="Which v4 concepts do you need before you can read an Aggregator Hook, and in what order?" read="Arrows mean learn first → learn next; gray dashed boxes are assumed knowledge; green is the subject." takeaway="B-0 to B-3 explain how v4 keeps its books; B-4 explains how an external pool gets paid. With these five cards you can read the adapter code." name=prereq-map kind=prerequisite-map
{"grid": {"w": 290, "h": 120}, "defaults": {"w": 200, "h": 60},
 "nodes": [
   {"id": "v3", "label": "v2/v3 basics (known)", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "sol", "label": "Solidity calls (known)", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 PoolManager & PoolKey", "col": 1, "row": 0, "color": "blue", "w": 230},
   {"id": "b4", "label": "B-4 v3 swap callback", "col": 1, "row": 1, "color": "blue"},
   {"id": "b2", "label": "B-2 permission bits", "col": 1, "row": 2, "color": "blue"},
   {"id": "b1", "label": "B-1 unlock & deltas", "col": 2, "row": 0, "color": "blue"},
   {"id": "b3", "label": "B-3 return delta", "col": 2, "row": 2, "color": "blue"},
   {"id": "agg", "label": "Aggregator Hook", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "v3", "to": "b0"}, {"from": "v3", "to": "b4"}, {"from": "sol", "to": "b2"},
   {"from": "b0", "to": "b1"}, {"from": "b1", "to": "b3"}, {"from": "b2", "to": "b3"},
   {"from": "b1", "to": "agg"}, {"from": "b3", "to": "agg"}, {"from": "b4", "to": "agg"}
 ]}
```

```prereq B-0 l1 4min
# PoolManager singleton and PoolKey
what: v4 has one `PoolManager` contract, and every pool is one state record inside it. A `PoolKey` identifies a pool: two currencies, fee, tickSpacing and the hook address.
why: Creating a "pool" only registers a PoolKey in PoolManager. It deploys no pool contract and needs no reserves. Aggregator Hooks use this to register an identity for an external pool.
misconception: Myth: a PoolId means reserves exist. Fact: an Aggregator Hook's virtual pool has no reserves in PoolManager and refuses liquidity.
deeper: [23] the "v4 mechanics" panel of the uniswap-v4-hooks report
```

```prereq B-1 l1 5min
# unlock and delta settlement (flash accounting)
what: The caller calls `unlock` and, inside the callback, swaps, calls `take` (pull tokens) and `settle` (pay tokens). Each address's balance owed or due per currency is a delta. If any delta is non-zero when the callback ends, the whole transaction reverts [2].
why: This lets a hook pull tokens from PoolManager, trade them on an external venue, and book the output back, all in one transaction. If the books balance, PoolManager does not care where the tokens came from.
example: take(token0, external pool, X) → books −X; settle(Y token1) → books +Y
misconception: Myth: take is a loan with interest. Fact: it is bookkeeping inside one transaction and must clear before the transaction ends.
deeper: [2] v4-core `PoolManager.sol` L104–114, L279–302
```

```prereq B-2 l1 3min
# Hook permission bits
what: The lowest 14 bits of a hook address decide which callbacks PoolManager calls. Deployers mine a CREATE2 salt until the low bits match.
why: Aggregator Hooks enable only 4 permissions, so their low bits are always `0x2888`. This is one way to spot them onchain.
deeper: [2] v4-core `Hooks.sol` L29–47
```

```prereq B-3 l1 5min
# Return delta (beforeSwapReturnDelta)
what: A hook with the `beforeSwapReturnDelta` permission can return a `BeforeSwapDelta` from `beforeSwap`. PoolManager adds its specified side to the core swap amount, and the hook owns that delta.
why: Returning `specified = −amountSpecified` brings the core swap amount to 0, so the v4 curve does not trade [2]. The unspecified side then tells PoolManager what the swapper gets.
example: sell X token0: amountSpecified = −X, hook returns +X → amountToSwap = 0
misconception: Myth: a hook can only "look" before and after a swap. Fact: with this permission, a hook can fully replace core pricing.
deeper: [2] v4-core `Hooks.sol` L248–282, `Pool.sol` L320
```

```prereq B-4 3min
# v3 swap callback
what: A v3 pool first sends the output token to the recipient. Then it calls the caller's `uniswapV3SwapCallback`, which must pay the input token. Finally the pool checks its balance.
why: The V3, PancakeSwap V3 and Slipstream adapters use this callback to `take` the input from PoolManager straight to the external pool.
deeper: [1] `UniswapV3Aggregator.sol` L67–98
```

## J How the virtual pool works {depth=2}
```excalidraw q="What is inside an Aggregator Hook pool, and who holds the funds?" read="Blue is the v4 core; green is the hook; gray dashed is the external venue; violet is where protocol fees go. Solid lines are calls, dashed lines are token flows." takeaway="PoolManager handles only identity and the ledger; reserves, pricing and venue fees (LP fees, where LPs exist) stay in the external venue. The hook translates between the two." kind=intuition
{"grid": {"w": 420, "h": 140}, "defaults": {"w": 210, "h": 70},
 "nodes": [
   {"id": "ur", "label": "Universal Router", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "pm", "label": "PoolManager (ledger only)", "col": 1, "row": 0, "color": "blue", "w": 230},
   {"id": "hook", "label": "Aggregator Hook", "col": 1, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "ext", "label": "External pool: reserves + pricing", "col": 2, "row": 1, "color": "gray", "stroke": "dashed", "w": 230},
   {"id": "jar", "label": "TokenJar", "col": 2, "row": 0, "color": "violet"}
 ],
 "edges": [
   {"from": "ur", "to": "pm", "label": "swap(PoolKey)"},
   {"from": "pm", "to": "hook", "label": "beforeSwap"},
   {"from": "hook", "to": "ext", "label": "real trade"},
   {"from": "pm", "to": "jar", "label": "protocol fee", "dashed": true}
 ]}
```

A [[virtual pool]] splits four things across places (Fig 2):

| Layer | Where it lives |
|---|---|
| Identity (PoolKey / PoolId) | PoolManager |
| Settlement (deltas, take, settle) | PoolManager |
| Reserves, pricing, LP fees | External venue |
| Translation between the two | Aggregator Hook |

`BaseAggregatorHook` enables only 4 permissions [1]:

```solidity src=research/code/BaseAggregatorHook.sol lines=84-89
```

- `beforeInitialize`: maps the PoolKey to an external pool at creation and validates it.
- `beforeAddLiquidity`: reverts with `LiquidityNotAllowed()`; the pool takes no LPs.
- `beforeSwap` + `beforeSwapReturnDelta`: trade for v4 and rewrite the books.

The core logic is in `_innerBeforeSwap`. Note the `// cancel core` comment on line 162:

```solidity src=research/code/BaseAggregatorHook.sol lines=154-186 hl=161-162,185
```

```finding F1 high
# The "v4 pool" is only a routing and settlement identity; reserves stay in the external venue
claim: An Aggregator Hook pool has no reserves in PoolManager, takes no LPs and does not price with the v4 curve. It only provides a PoolKey, so routers can quote it, compose multi-hop routes and settle in PoolManager.
evidence: [observed] Only 4 permissions; adding liquidity reverts [1]. [observed] `pseudoTotalValueLocked` reads token amounts held by the external pool [1]. [observed] When the hook cancels the core swap amount to 0, `Pool.swap` returns a zero delta [2]. [inferred] Reserves, pricing and venue fees stay in the source protocol.
implication: For TVL, price oracles or trade indexing, separate virtual pools from native v4 pools; their PoolId stands for no v4 reserves.
```

```finding F2 high
# v4 "borrows" external liquidity through a return delta plus the zero-delta check at unlock
claim: After the external trade, the hook returns `specified = −amountSpecified` to cancel the core computation, and puts the external output on the unspecified side. PoolManager does not care where the output came from; it only requires every delta to be zero when unlock ends. If the external pool fills only part of the order, the hook keeps an open delta and the whole transaction reverts.
evidence: [observed] `amountToSwap += hookDeltaSpecified` [2]; PoolManager books the hook delta to the hook, and the swapper's delta = core delta − hook delta [2]. [observed] unlock reverts on a non-zero delta count [2]. [inferred] Per the ledger table below, both of the hook's deltas net to zero; a partial fill leaves a positive token0 delta.
implication: When you write your own aggregator hook, the safety boundary is whether the returned delta equals what the hook paid and received. PoolManager guarantees balanced books, not a correct price.
```

**Bookkeeping walk-through** (exact-in, sell X token0, V3 adapter, f = protocol fee):

| Step | Hook token0 | Hook token1 | Swapper |
|---|---|---|---|
| Callback `take(token0, V3 pool, X)` | −X | | |
| V3 sends Y to PoolManager, `settle()` | | +Y | |
| Protocol fee `take(token1, TokenJar, f)` | | −f | |
| Delta returned, core idles; `afterSwap` books | +X | −(Y−f) | −X / +(Y−f) |
| Net | 0 | 0 | Router pays X, takes Y−f |

## K The full sequence of one swap {depth=2}
```uml q="In an exact-in swap through the V3 adapter, who calls whom, from the user until the books clear?" read="V3 adapter example; steps 5–14 happen inside PoolManager.swap; steps 15–16 clear the router's balances; step 17 is the check when unlock ends. The router's action order is illustrative; we did not check the real encoding." takeaway="The external pool sends its output straight to PoolManager, and PoolManager pays the input straight to the external pool; the hook only keeps books and relays neither payment."
sequenceDiagram
  autonumber
  participant U as User
  participant R as Universal Router
  participant PM as PoolManager
  participant H as V3 Aggregator Hook
  participant V as External V3 pool
  participant J as TokenJar
  U->>R: execute(sell X token0, minOut)
  R->>PM: unlock(data)
  PM->>R: unlockCallback
  R->>PM: swap(PoolKey, −X)
  PM->>H: beforeSwap
  H->>PM: sync(token1)
  H->>V: swap(recipient = PoolManager, X)
  V->>PM: transfer Y token1
  V->>H: uniswapV3SwapCallback(+X, −Y)
  H->>PM: take(token0, V3 pool, X)
  PM->>V: transfer X token0
  H->>PM: settle(), hook books +Y
  H->>PM: take(token1, TokenJar, f)
  H-->>PM: BeforeSwapDelta(+X, −(Y−f))
  Note over PM: amountToSwap = 0, core does not trade, books by hook delta
  R->>PM: settle X token0 (pulled from user via Permit2)
  R->>PM: take(token1, user, Y−f)
  PM-->>R: check every delta is zero
```

The V3 adapter's callback checks the caller first, then has PoolManager pay directly [1]:

```solidity src=research/code/UniswapV3Aggregator.sol lines=72-98 hl=78-81,97
```

```finding F3 medium
# The hook takes the input from PoolManager before the router pays it
claim: Steps 10–11 come before the router pays in step 15. So at that moment PoolManager must already hold enough token0 (inventory from other v4 pools), or the router must pay first and swap after.
evidence: [observed] The V3 callback calls `take(token0, external pool, X)` inside `beforeSwap` [1]. [observed] The official tests mint tokens to PoolManager first, commented "Seed PoolManager with tokens for swaps" [1]. [inferred] In production this depends on PoolManager inventory or the router's action order; the whole flow is atomic under flash accounting.
implication: A virtual pool for a long-tail token may need the router to settle input first. We did not check the Universal Router's real action order; see [Limits](#panel-Q).
```

## L Adapter differences {depth=2}
```excalidraw q="For different external venues, how do tokens move between PoolManager, the hook and the venue?" read="One pattern per row. Blue is PoolManager, green is the hook, gray dashed is the external protocol." takeaway="Direct adapters save a transfer but rely on the venue's callback; pass-through adapters work for venues without callbacks; the order adapter has no persistent pool and gets liquidity from hookData." kind=comparison
{"grid": {"w": 350, "h": 120}, "defaults": {"w": 170, "h": 60},
 "nodes": [
   {"id": "a0", "label": "Direct: V2/V3/Fluid", "col": 0, "row": 0, "color": "yellow", "w": 220},
   {"id": "a1", "label": "PoolManager", "col": 1, "row": 0, "color": "blue"},
   {"id": "a2", "label": "External pool", "col": 2, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "Pass-through: Curve/PSM", "col": 0, "row": 1, "color": "yellow", "w": 220},
   {"id": "b1", "label": "PoolManager", "col": 1, "row": 1, "color": "blue"},
   {"id": "b2", "label": "hook", "col": 2, "row": 1, "color": "green"},
   {"id": "b3", "label": "External pool", "col": 3, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "c0", "label": "Order: UniswapX", "col": 0, "row": 2, "color": "yellow", "w": 220},
   {"id": "c1", "label": "PoolManager", "col": 1, "row": 2, "color": "blue"},
   {"id": "c2", "label": "hook = filler", "col": 2, "row": 2, "color": "green"},
   {"id": "c3", "label": "Reactor", "col": 3, "row": 2, "color": "gray", "stroke": "dashed"}
 ],
 "edges": [
   {"from": "a1", "to": "a2", "label": "pay / return", "arrow": "both"},
   {"from": "b1", "to": "b2", "label": "take / settle", "arrow": "both"},
   {"from": "b2", "to": "b3", "label": "exchange", "arrow": "both"},
   {"from": "c1", "to": "c2", "label": "take / settle", "arrow": "both"},
   {"from": "c2", "to": "c3", "label": "order", "arrow": "both"}
 ]}
```

| Adapter | Deployment / mapping | Quote | Limits |
|---|---|---|---|
| Uniswap V3 | Singleton; `getPool(t0,t1,fee)` | Calls swap, reverts in the callback with the result | No native ETH; exact-out must match exactly |
| PancakeSwap V3 | Inherits V3, adds one callback name | Same as V3 | Same as V3 |
| Slipstream | Inherits V3, looks up pools by tickSpacing | Same as V3 | fee must be the dynamic-fee flag |
| Uniswap V2 / forks | Singleton; `getPair` | Computed from reserves | No native ETH |
| Curve StableSwap / NG | One hook per Curve pool, n(n−1)/2 PoolKeys | `get_dy` | Exact-in only |
| Fluid | One hook per Fluid pool | Resolver estimate | No exact-out for native ETH |
| LitePSM (Sky) | Singleton; one pool per pair | `tin` / `tout` formula | Capacity limits |
| UniswapX | Singleton, order in hookData | No router quote | All or nothing |

The Curve adapter is the typical pass-through adapter. The last `exchange` argument is 0, so there is no per-hop minimum output [1]:

```solidity src=research/code/StableSwapAggregator.sol lines=163-187 hl=173,177-180
```

```finding F4 high
# Adapters translate each venue's payment model into take / settle; they differ in token paths and swap types
claim: V3, PancakeSwap V3 and Slipstream share one implementation: the PancakeSwap V3 adapter is only 17 lines long. Curve uses one hook per pool, so a shared hook address tells routers they touch the same Curve pool. Curve and Fluid set no per-hop slippage limit; comments say the router checks it. The UniswapX adapter runs the other way: the hook is the filler, and the v4 swapper is the order's counterparty.
evidence: [observed] PancakeSwap / Slipstream inherit V3 and change only the callback name or the pool lookup [1]. [observed] Curve calls `exchange(..., 0)`; Fluid sets `amountLimit` to 0 or the maximum [1]. [observed] README: the v4 swapper provides the counter-side of the UniswapX order [1]. [observed] Deployed hook version strings include SushiswapV3Aggregator and SushiswapV2Aggregator [5]. [inferred] Adding a V3 fork mostly means a new factory and callback name.
implication: To review a new adapter, ask three questions. Where is the input paid from? Where does the output land? Is there a per-hop minimum output? User protection sits in the router's final minOut.
```

## M How it differs from classic aggregators {depth=2}
```excalidraw q="Both use external DEX liquidity. How do 1inch / 0x and Aggregator Hooks differ in architecture?" read="Left is a classic aggregator, right is Uniswap. Green is the subject; gray dashed boxes are external DEXs." takeaway="Classic aggregators call each DEX from a private executor; Aggregator Hooks turn external DEXs into v4 pools, so execution and settlement move into PoolManager." kind=comparison
{"grid": {"w": 270, "h": 120}, "defaults": {"w": 200, "h": 60},
 "nodes": [
   {"id": "u1", "label": "User", "col": 0, "row": 0, "color": "gray"},
   {"id": "r1", "label": "1inch Router / 0x Settler", "col": 0, "row": 1, "color": "blue", "w": 230},
   {"id": "d1", "label": "Curve", "col": 0, "row": 2, "color": "gray", "stroke": "dashed", "w": 110, "dx": -60},
   {"id": "d2", "label": "Fluid", "col": 0, "row": 2, "color": "gray", "stroke": "dashed", "w": 110, "dx": 60},
   {"id": "u2", "label": "User", "col": 2, "row": 0, "color": "gray"},
   {"id": "r2", "label": "Universal Router", "col": 2, "row": 1, "color": "blue"},
   {"id": "pm", "label": "PoolManager", "col": 2, "row": 2, "color": "blue"},
   {"id": "h", "label": "Aggregator Hook", "col": 2, "row": 3, "color": "green", "strokeWidth": 3},
   {"id": "d3", "label": "Curve / Fluid", "col": 2, "row": 4, "color": "gray", "stroke": "dashed"}
 ],
 "edges": [
   {"from": "u1", "to": "r1"}, {"from": "r1", "to": "d1"}, {"from": "r1", "to": "d2"},
   {"from": "u2", "to": "r2"}, {"from": "r2", "to": "pm"}, {"from": "pm", "to": "h", "label": "beforeSwap"}, {"from": "h", "to": "d3"}
 ]}
```

| Dimension | 1inch / 0x | Aggregator Hooks | UniswapX |
|---|---|---|---|
| Route search | Offchain API | Offchain (Uniswap router) | Fillers compete |
| Execution entry | Own Router / Settler | PoolManager + hook | Reactor |
| Venue identity | A call inside the executor | v4 PoolKey | Signed order |
| User approval | AllowanceHolder or Permit2 | Permit2 (approval); Universal Router (execution) | Permit2 signature |
| Fees | 0x: 0.15% on some pairs; integrator fees | Protocol fee to TokenJar | Fees inside the order |

```finding F5 high
# Not another 1inch: route search stays offchain; what changes is the venue's identity and where it settles
claim: Classic aggregators keep DEX adapters inside their own executor and routing stack; they expose no shared v4 PoolKey interface. Aggregator Hooks make the adapter a v4 pool that any v4-aware router can quote and execute. A multi-hop route can put native v4 pools and external venues in one unlock.
evidence: [observed] Each hook wraps a source "so that any router sees it as a Uniswap pool", with "nothing new to approve" [6]. [observed] 0x executes through Settler [18], 1inch Classic through its Router [19], and CoW through batch auctions [20]. [observed] Guidestar uses the same Universal Router and Permit2 [9]. [observed] Before launch, 112 transactions from 0x's AllowanceHolder already touched these hooks [4].
implication: 1inch, 0x, Aggregator Hooks and UniswapX will more likely coexist in layers. The first two decide where to find price; the hook settles one hop inside v4; UniswapX decides who carries the quote risk.
```

## N Trade-offs {depth=2}
| Aspect | Verdict | Basis |
|---|---|---|
| Unified settlement and multi-hop | ok Native pools and external venues combine in one unlock | [F2](#F2), [F5](#F5) |
| User approvals | ok No new approvals | [6] |
| Adapter reuse | ok A V3 fork needs a new factory and callback name | [F4](#F4) |
| Price | warn 1–10 bp on top of the venue fee | [F6](#F6) |
| Per-hop protection | warn Curve / Fluid set no per-hop minOut | [F4](#F4) |
| Gas | warn Median gas of a whole transaction with a hook swap is about 550k | [4] |
| Decentralization | warn Deployment is permissionless, production routing needs the allowlist | [F7](#F7) |
| Attack surface | no Each adapter adds new callback and accounting risk | [F2](#F2), [F7](#F7) |

```finding F6 high
# The protocol fee is Uniswap's value capture and the cost of this path versus a direct call
claim: Protocol fee = the virtual pool's slot0 protocolFee × 25, sent from the unspecified side to TokenJar. Exact-in takes it from the output; exact-out adds it to the input. Onchain, most Ethereum virtual pools pay 10 bp (some stable pairs 3 bp), Base pays 3 bp or 1 bp, and LitePSM pays nothing; so a Curve pool costs this fee more through the hook than through 1inch.
evidence: [observed] `ProtocolFees(25)` and `_applyWithProtocolFee` [1]. [observed] The proposal's 25× multiplier lifts the 10 bp cap to 250 bp, with rates of 10 bp, 3 bp for stable pairs, and 3 / 1 bp on Base [10]. [observed] The latest onchain protocolFee is mostly 40 pips (×25 = 10 bp) or 12 pips (3 bp); LitePSM pools have no fee record [4]. [observed] Flags: aggregator hooks `1<<11`, LitePSM `1<<12`, UniswapX 0 [1][3]. [inferred] For price-sensitive third-party aggregators with their own adapters, a direct call is usually cheaper.
implication: The main users of this path are orders that already come through Uniswap's frontend and API. It turns the part of that flow filled on external venues into protocol income.
```

```finding F7 medium
# Deployment is permissionless; the real gate is whether a hook gets routed
claim: The Curve adapter factory's `createPool` has no access control, so anyone can deploy a hook and create pools. But Uniswap's router picks up some hooks automatically and allowlists others by hand; the review covers routing compatibility only, not security. 0x says 54.2% of 84,163 hooks on 6 chains are malicious; Uniswap disputes that this affects its routing.
evidence: [observed] `createPool` has no modifier [1]. [observed] Official docs: some hooks need review and an allowlist entry [14]; the review form says "not a security audit or an endorsement" [15]. [observed] 0x's data is as of 2026-09-11 and uses 0x's own classification [16]. [observed] Second-hand reports cover the dispute [17].
implication: To judge a hook ecosystem, look at the allowlist and execution-quality data, not the number of deployed hooks.
```

## O Adoption: onchain data {depth=2}
Neither Uniswap nor third parties publish Aggregator Hook volume [6]. The numbers below come from our own Dune queries [4]. The queries count the `HookSwap` event that `BaseAggregatorHook` emits. The window starts on 2026-10-08; "after launch" means about 1.5 days after 2026-10-22 13:00 UTC.

| Chain | Period | Transactions / day | USD volume | Via Universal Router |
|---|---|---|---|---|
| Ethereum | 14.5 days before | about 320 | $231M | 3,270 / 4,890 swaps |
| Ethereum | 1.5 days after | about 320 | $18.6M | 393 / 556 swaps |
| Base | 14.5 days before | about 110 | $1.74M | 1,124 / 1,856 swaps |
| Base | 1.5 days after | about 900 | $0.63M | 1,217 / 1,738 swaps |
| Robinhood | 14.5 days before | about 7 | $0.02M | 74 / 115 swaps |
| Robinhood | 1.5 days after | about 130 | $0.06M | 193 / 244 swaps |

```finding F8 high
# These hooks have run for months, almost all volume is stablecoin PSM conversion, and protocol fees are still small
claim: The first onchain HookSwap was on 2026-04-19, about six months before the announcement. Of about $250M Ethereum volume in the last 16 days, 99.6% came from LitePSM hooks (USDC/USDS, DAI/USDC). LitePSM pays no protocol fee, so lifetime protocol fees are only about $2,500.
evidence: [observed] First HookSwap: Ethereum 2026-04-19, Base 2026-05-01 [4]. [observed] Per-hook totals: LitePSM hooks about $248.4M [4]. [observed] `ProtocolFeesCollected` totals about $2,500, and about $433 in the 1.5 days after launch [4]. [observed] Version strings confirm these contracts are official adapters such as LitePSMAggregator [5]. [inferred] Volume and protocol fee income are far out of proportion.
implication: Volume overstates the commercial value of this feature today. Watch two things: volume from non-PSM sources (Curve, Fluid, V3 forks, Slipstream) and the protocol fee trend.
```

```finding F9 medium
# The announcement mainly made the feature public and wider; the first 1.5 days added flow on Base and Robinhood
claim: Ethereum stayed at about 320 transactions a day before and after the announcement. Base rose from about 110 to about 900 a day, and Robinhood from about 7 to about 130. About 70% of hook swaps sit in transactions sent straight to Uniswap's Universal Router.
evidence: [observed] Dune before/after comparison [4]; Universal Router addresses from the official deployments page [8]. [inferred] Uniswap's router already used these hooks; the announcement added chains, sources and attention. With 1.5 days of data, this is an early reading only.
implication: To track adoption, watch at least 30 days: the share of non-Uniswap routers, volume from non-PSM sources, and protocol fee income.
```

No external protocol (Curve, Fluid, PancakeSwap, Aerodrome, Sky) has made a public statement. We also found no primary source for a "vampire attack" critique [6].

## P Outlook: Uniswap and the hooks narrative {depth=2}
```callout warn Everything in this panel is speculative
Each judgment states the condition it depends on. If the condition changes, so does the conclusion.
```

| Judgment (speculative) | Holds if | Counter-signal |
|---|---|---|
| Near-term adoption comes from Uniswap's own frontend and API; third-party aggregators will not move to the hook path at scale | The protocol fee stays at 1–10 bp; third parties already have direct adapters | The third-party router share keeps rising |
| External protocols stay neutral in the near term: they keep venue fees and get more fills | Reserves and venue fees stay in the source protocol ([F1](#F1)) | A venue restricts callback callers, or favors its own frontend |
| Uniswap competes less on "deepest pools" and more on "order flow"; the protocol fee taxes its own order flow when it uses external liquidity | Flow comes mainly from Uniswap's routers ([F9](#F9)) | Protocol fee income comes mainly from third-party routers |
| The next phase of hooks turns on allowlists / registries and risk labels, not hook counts | The malicious-hook dispute continues ([F7](#F7)) | Uniswap publishes execution-quality data and turns on per-hop checks by default |
| More "wrapper hooks" appear: PSMs, RWA subscription and redemption, wrap / unwrap | Fixed-fee conversion with no AMM price impact, like LitePSM, already dominates ([F8](#F8)) | Non-PSM volume stays small for a long time |

The code supports one part of the narrative: "Uniswap becomes a liquidity settlement layer". Any source that a hook can translate into take / settle can become a v4 pool ([F2](#F2)). Whether it becomes an industry standard depends on routing governance, not on the hooks themselves.

## Q Limits and open questions {depth=2}
- **Data window**: only about 1.5 days of post-launch data. The HookSwap count includes a few contracts with the same event signature but no version string; their volume is small and we did not remove them.
- **Gas**: we measured only the median gas of whole transactions with a hook swap, not a like-for-like comparison with a direct call.
- **Action order**: we did not check whether the Universal Router settles input first ([F3](#F3)).
- **The 7 sources**: Uniswap did not list them or define "90%" [6].
- **Docs versus code**: the README says Slipstream quotes through QuoterV2; the code at this commit inherits the V3 revert quote [1].
- **External reactions**: we found no formal statement from external protocols or third-party aggregators.
- **The 0x dispute**: the malicious-hook share is 0x's own classification, and 0x is a competitor [16].

## R Method and evidence {depth=3}
- **Main basis**: we read `src/aggregator-hooks/` and its tests in `v4-hooks-public@2264ac8` line by line, plus the v4-core and protocol-fees submodules [1][2][3].
- **Onchain**: `cast call` read the version strings, factories and flags of deployed hooks [5]; Dune counted the HookSwap, ProtocolFeeUpdated and ProtocolFeesCollected events [4].
- **Market and comparison**: a sub-agent checked the official blog, governance posts, aggregator docs and the 0x post; second-hand reports served as leads only.
- **External deep research**: the user's GPT research served as leads only. Corrections:
  - The UniswapX hook's liquidity does not come from "solvers"; the v4 swapper is the order's counterparty.
  - The protocol fee is concrete, not only "possible": it uses a 25× multiplier, currently 10 bp / 3 bp / 1 bp, and LitePSM pays none.
  - Timing: swaps ran onchain from 2026-04, not only from 2026-10.
  - The GPT scoring table had no basis and was not used; its directory names (`Curve/`, `Fluid/`) do not match the real ones.
- **Ledger**: 105 claims, observed 78, inferred 18, speculative 9; see `research/ledger.md`.

## S Reproduce {depth=3}
1. Pin the source:

```bash
git clone https://github.com/Uniswap/v4-hooks-public && cd v4-hooks-public
git checkout 2264ac8b023011fdca8fd3422ada172dc10184e0
git submodule update --init --depth 1 lib/v4-core lib/protocol-fees
```

2. Read the version and fee multiplier of deployed hooks (expected: `"LitePSMAggregator v1.0"`, `4096`; `"SushiswapV3Aggregator v1.0"`, `25`):

```bash
RPC=https://ethereum-rpc.publicnode.com
cast call 0x958a0904940f744f8c6b72c043ceee3ea34ae888 "aggregatorHookVersion()(string)" --rpc-url $RPC
cast call 0x958a0904940f744f8c6b72c043ceee3ea34ae888 "protocolFeeFlags()(uint256)" --rpc-url $RPC
cast call 0x0359e30d4e8e098f1033f948182f88e43efd6888 "aggregatorHookVersion()(string)" --rpc-url $RPC
cast call 0x0359e30d4e8e098f1033f948182f88e43efd6888 "protocolFeeMultiplier()(uint24)" --rpc-url $RPC
```

3. Re-run the Dune queries: 8999850 (before / after), 8999852 (per hook), 8999853 (fee settings), 8999857 (per first byte), 8999858 (fees collected). The HookSwap topic0 is `0x6150bb53cd76c5702d6074239fc7b6c2a5495d339eb122fdc06252f3efdbbc1b`.

## T Glossary {depth=2}
```glossary
virtual pool | — | A pool with a PoolKey identity but no v4 reserves; the hook fills trades on an external venue. | not a native v4 pool
PoolManager | v4 singleton | The one contract that stores all v4 pool state and keeps delta books.
PoolKey | pool identity | Two currencies, fee, tickSpacing and hook address; its hash is the PoolId. | a PoolId does not imply reserves
unlock | unlock session | The entry point into PoolManager; every delta must be zero when the callback ends.
delta | balance owed | What an address owes PoolManager, or is owed, in one currency. | not a token balance
take | pull tokens | PoolManager sends tokens to an address and books a negative delta for the caller.
settle | confirm payment | After sync, tokens sent to PoolManager are booked as a positive delta.
return delta | — | A delta a hook returns from a callback to rewrite the books.
specified / unspecified | — | The side whose amount the user fixes, and the side the trade computes. | not token0 / token1
TokenJar | protocol fee vault | An immutable contract that receives protocol fees; assets leave only when UNI is burned.
protocolFeeFlags | fee classification flags | A bitfield the hook self-reports; 1<<11 is the aggregator convention. | not the address permission bits
allowlist | routing allowlist | The list of hooks Uniswap's router adds by hand. | not a security audit
LitePSM | Sky's stablecoin module | Converts USDC and USDS / DAI 1:1 at a fixed fee. | not an AMM
Universal Router | Uniswap's router contract | The execution and payment entry point that chains v2 / v3 / v4 hops; with Permit2, tokens are approved to Permit2.
filler | — | The party that fills a signed UniswapX order for the user.
```

## U References {depth=2}
1. [Uniswap/v4-hooks-public `src/aggregator-hooks` @2264ac8](https://github.com/Uniswap/v4-hooks-public/tree/2264ac8b023011fdca8fd3422ada172dc10184e0/src/aggregator-hooks) — BaseAggregatorHook, ProtocolFees, all adapters, README, tests. **PRIMARY**
2. [Uniswap/v4-core @d153b04](https://github.com/Uniswap/v4-core/tree/d153b048868a60c2403a3ef5b2301bb247884d46/src) — unlock, swap, take / settle, Hooks.beforeSwap / afterSwap. **PRIMARY**
3. [Uniswap/protocol-fees @656096f](https://github.com/Uniswap/protocol-fees/tree/656096fd382417c9eadc1f54cb45cdd3dd1bc362) — V4FeePolicy governance guide (`1<<11` convention), UNIfication text. **PRIMARY**
4. [Dune query 8999850](https://dune.com/queries/8999850), [8999852](https://dune.com/queries/8999852), [8999853](https://dune.com/queries/8999853), [8999857](https://dune.com/queries/8999857), [8999858](https://dune.com/queries/8999858) — built for this report, run on 2026-10-24. **PRIMARY**
5. Onchain `cast call` (Ethereum, Base, 2026-10-24) — deployed hook versions, factories, flags. **PRIMARY**
6. [Uniswap Labs: Aggregator Hooks are Now Live](https://blog.uniswap.org/aggregator-hooks-are-now-live) (2026-10-22) — launch scope, 7 sources, single-transaction settlement. **PRIMARY**
7. [Uniswap Developers: Uniswap Labs Hooks](https://developers.uniswap.org/docs/protocols/uniswap-labs-hooks) — list of supported sources. **PRIMARY**
8. [Uniswap v4 Deployments](https://developers.uniswap.org/docs/protocols/v4/deployments) — Universal Router addresses per chain. **PRIMARY**
9. [Uniswap API: AMM vs UniswapX routing (Guidestar)](https://developers.uniswap.org/docs/trading/swapping-api/amm-vs-uniswapx-routing) — Guidestar and the approval path. **PRIMARY**
10. [Temp Check: Activate v4 Protocol Fees](https://gov.uniswap.org/t/temp-check-activate-v4-protocol-fees/26162/1) (2026-07-07) — aggregator hook fee rates and the 25× multiplier. **PRIMARY**
11. [Tally: Proposal 100](https://www.tally.xyz/gov/uniswap/proposal/100) — the onchain v4 protocol fee proposal. **PRIMARY**
12. [Uniswap: UNIfication](https://blog.uniswap.org/unification) — origin of aggregator hooks, TokenJar / Firepit. **PRIMARY**
13. [Uniswap is Live on Tempo](https://blog.uniswap.org/uniswap-is-live-on-tempo) (2026-03-18) — the first production aggregator hook. **PRIMARY**
14. [Uniswap Developers: Hook routing](https://developers.uniswap.org/docs/protocols/v4/concepts/hook-routing) — automatic pickup and manual allowlist. **PRIMARY**
15. [Uniswap v4 Hooks Routing Allowlist form](https://developers.uniswap.org/hook-allowlist) — review is not a security audit. **PRIMARY**
16. [0x: Uniswap v4 hooks were a mistake](https://0x.org/post/uniswap-v4-hooks-were-a-mistake) (2026-09-14) — 0x's own hook classification data. **PRIMARY** (for 0x's data)
17. [CryptoSlate: Uniswap adds seven trading sources as 0x disputes…](https://cryptoslate.com/uniswap-adds-seven-trading-sources-as-0x-disputes-its-protection-from-malicious-hooks/) — second-hand account of the dispute.
18. [0x Docs: Contracts](https://docs.0x.org/docs/core-concepts/contracts) — Settler, AllowanceHolder. **PRIMARY**
19. [1inch: Classic Swap](https://business.1inch.com/portal/documentation/apis/swap/classic-swap/introduction) — Pathfinder and Router. **PRIMARY**
20. [CoW Protocol: Solvers](https://docs.cow.fi/cow-protocol/concepts/introduction/solvers) — batch auctions and solvers. **PRIMARY**
21. [UniswapX Architecture](https://developers.uniswap.org/docs/liquidity/uniswapx/concepts/architecture) — Reactor, filler, Permit2. **PRIMARY**
22. [Euler Docs: EulerSwap](https://docs.euler.finance/developers/euler-swap) — another hook that taps external liquidity. **PRIMARY**
23. research-hub report `uniswap-v4-hooks` — the full v4 hook teardown this report builds on.

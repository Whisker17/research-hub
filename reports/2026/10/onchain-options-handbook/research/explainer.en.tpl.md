---
template: research
title: "Onchain Options Handbook: From Option Basics and the Ecosystem to Mantle's Opportunity"
subtitle: Options let people trade the shape of a payoff, not only its direction. Onchain options are limited by risk-bearing capacity, not by matching. Mantle already has the underlyings and settlement stablecoins but lacks the layer that carries option risk. The most practical start is fully collateralized structures with RFQ, built in parallel with an RWA settlement adapter.
cols: 4
type: Technical research · Onboarding · Opportunity assessment
audience: Developers who know EVM and DeFi (AMMs, lending, perps), and Mantle protocol / product researchers, with no formal options training
scope: Option basics; onchain option protocols, data and history as of 2026-10-16; the Jeff Yan interview and Hyperliquid HIP-4; a review and re-computation of the World Markets paper; Mantle capability gaps and recommendations (recommendations, not Mantle roadmap commitments)
evidence: 258-claim ledger (observed 202 / inferred 44 / speculative 12); Deribit and DefiLlama public APIs; all paper figures re-computed in Python; protocol docs and contract source; accessed 2026-10-15 to 10-16
date: 2026-10-16 · v1
---
Bottom line: options trade the shape of a payoff. The buyer pays a [[premium]] for a capped loss and open upside. The seller collects the premium and carries jump risk ([F1](#F1), [F2](#F2)).

Onchain options traded about $5.07B of notional in the last 30 days, and Derive alone took 83.7%. Deribit's open interest is about 25× Derive's ([F4](#F4)). The leading venues already match offchain and settle onchain. The real bottleneck is the market maker's hedging access and capital cost ([F5](#F5)).

Jeff Yan did not announce options on Hyperliquid. He sees HIP-4 as one path for builders to create options ([F6](#F6)). The World Markets paper argues that a venue can assemble option liquidity from spot, term financing and opposite options. Its model figures re-compute exactly, but its key premises are assumptions ([F7](#F7), [F8](#F8)). Mantle has xStocks, stablecoins and spot RFQ, but no option or perp layer. We recommend fully collateralized structures with RFQ first, with an RWA settlement adapter built in parallel ([F10](#F10), [F11](#F11)).

## A Options in One Formula {sheet meta="At expiry"}
```annot
# Payoff at expiry | Valid only at expiry
Call: [max(S_T − K, 0)]{pays only above K}; put: [max(K − S_T, 0)]{pays only below K}
# PnL = payoff − premium | The buyer can lose only the premium
Example: with ETH at 2500, buy the 2500 call for [171.35]{30 days, IV 60%}; at 3000 on expiry, the gain is [328.65]{500 − 171.35}
# Put-call parity | Options, spot and borrowing connect
[C − P]{same K, same expiry} = [S − PV(K)]{spot bought with borrowed cash}
> This identity is where the World Markets paper (panel P) starts.
```

## B Key Numbers {sheet span=2 meta="As of 10-16"}
| Item | Value |
|---|---|
| Onchain options, 30-day notional / premium | $5.07B / $88.2M |
| Derive share (notional / premium) | 83.7% / 91.2% |
| Deribit OI ÷ Derive OI | about 25× (10-01) |
| ETH 30-day implied volatility (DVOL) | 52 (realized about 44) |
| Paper's estimated quote capacity | 5.9–11.7× a 90-contract ask (conditional) |
| Option / perp volume on Mantle | $0 / $0 |
| xStocks assets on Mantle | at least about 100 |

## C Five Generations of Onchain Options {sheet meta="Who carries the risk"}
| Approach | Examples | Status |
|---|---|---|
| Insurance-style, fully collateralized | Opyn v1, Hegic | no Small |
| Option vaults (DOV) | Ribbon, Thetanuts V3 | no Closed or pivoted |
| AMM + hedging | Lyra v1, Stryke | no Stalled |
| Perpetual / convex products | Squeeth, Panoptic | warn Niche |
| Offchain matching + onchain settlement | Derive, Paradex, Rysk | ok Mainstream |

## D Timeline {sheet span=2 meta="UTC"}
```timeline v
2020-08 | Opyn ETH put exploit | Exercise logic double-counted
2021-04 | Ribbon DOV launches | Weekly covered calls
2023-07 | Ribbon merges into Aevo | DOVs fail to scale
2024-12 | Panoptic mainnet | Perpetual options on Uniswap LP
2026-05-02 | Hyperliquid HIP-4 | Bounded, fully collateralized outcomes
2026-07-24 | Derive lists XAUT options | First RWA options on Derive (Bybit 06-12 earlier)
*2026-10-07 | Derive V3 | ZK exchange, settles on Ethereum
2026-10 | World Markets paper | Composable options markets
```

## E Mantle Capability Check {sheet meta="2026-10"}
| Options need | Mantle |
|---|---|
| Underlying tokens | ok xStocks |
| Settlement stablecoin | ok USDT0 / USDC |
| Corporate-action data | ok multiplier |
| Price with market status | warn not seen live |
| Spot depth | warn $1–5M daily volume |
| Option / RFQ settlement contract | no Missing |
| Perps (for hedging) | no Missing |

## F Conclusion {sheet span=4}
```callout ok Options are worth building, but Mantle should first add the risk-bearing layer, not an options exchange
- Options turn protection and yield into products you can buy and sell. Someone on the sell side must carry jump risk (F1, F2).
- Onchain options have solved matching but not risk bearing. A few venues hold most volume, and the total is small next to Deribit (F4, F5).
- The World Markets approach needs option, lending and spot liquidity onchain. Mantle today has thin spot and lending that does not accept RWAs (F8, F10).
- Suggested start: protection and yield structures for holders. Offchain market makers quote through RFQ, and the chain settles with full collateral. Build an RWA settlement and corporate-action adapter in parallel (F11, recommendation).
```

## G How to Read This {depth=1}
```callout info You already know (not explained here)
- EVM contract calls, ERC-20 approvals, EIP-712 signatures
- AMMs and LPs: LPs supply liquidity and carry price risk
- Over-collateralized lending: collateral ratios and liquidation
- Perpetual futures: margin, funding, liquidation
- Order books: best bid, best ask and spread
- What an oracle does: brings offchain prices onchain
```
- **5 minutes**: read the lead and overview panels A–F.
- **30 minutes**: also read panels I to S: [Background](#panel-I), [Payoffs](#panel-J), [Price](#panel-K), [History](#panel-L), [Market](#panel-M), [Risk](#panel-N), [Jeff Yan](#panel-O), [Paper](#panel-P), [Numbers](#panel-Q), [RWA](#panel-R), [Mantle](#panel-S).
- **Developers who will check the work**: also read [Method and evidence](#panel-U) and [Reproduce](#panel-V).

**Running example**: ETH trades at $2,500. Options expire in 30 days, implied volatility is 60%, and the interest rate is 0. The panels answer these questions in turn:

| Role | Question |
|---|---|
| Alice (holds 1 ETH) | What does it cost to cap her downside? What does she give up for extra income? |
| Bob (market maker) | After he sells Alice an option, how does he hedge? What risk is left? |
| Mantle | What is missing for Alice to do the same with xStocks on Mantle? |

## H Context {depth=2}
**Problem**: spot, lending and perps all exist onchain, but options never grew. In October 2026, onchain options traded about $5.07B of notional in 30 days [14]. For comparison, DEX spot volume in the 30-day window ending 2026-10-12 was about $288B [14]. The two windows differ slightly.

**Why now**:
- In the Empire interview, Jeff Yan said that as a builder starting over he might work on options [10][11].
- World Markets published a paper in October 2026 that argues for options built from composable liquidity [26].
- Mantle is pushing RWAs and tokenized stocks: the xStocks issuer mints natively on Mantle, and Bybit plans mStocks for November [29][36].

**Scope**: option basics; onchain option protocols, data and history; the paper's argument and a re-computation; Mantle capability check and recommendations.

**Non-goals**: this page offers no investment or trading advice and makes no Mantle roadmap commitments. It excludes contract audits, production pricing systems and full quantitative simulations.

**Gaps in the earlier material**: the external research (ChatGPT Deep Research) [41] has a sound outline but needs these fixes:
- It did not read the World Markets paper. This page reads it in full and re-computes it.
- It missed Hyperliquid HIP-4.
- It presented stalled venues (Ithaca, Stryke) as current designs, and its Derive architecture is out of date.
- It listed rUSDY on Mantle. Mantle actually has USDY and mUSD.

The full list of corrections is in [Method and evidence](#panel-U).

## I Background {depth=2}
```excalidraw q="Which concepts do you need first, and in what order?" read="Gray dashed boxes are assumed knowledge; blue boxes are concept cards; the green box is the subject. Arrows mean learn first → learn after." takeaway="B-0 and B-1 say what an option is; B-2 and B-3 say what it is worth and where the risk sits; B-4 and B-5 say how to assemble and collateralize it." kind=Prerequisite map
{"grid": {"w": 290, "h": 115}, "defaults": {"w": 220, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "perp", "label": "Perps (known)", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "lend", "label": "Lending (known)", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "ob", "label": "Order books (known)", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 Calls and puts", "col": 1, "row": 0, "color": "blue"},
   {"id": "b1", "label": "B-1 Contract specs", "col": 1, "row": 1, "color": "blue"},
   {"id": "b5", "label": "B-5 Margin", "col": 1, "row": 2, "color": "blue"},
   {"id": "b2", "label": "B-2 Implied volatility", "col": 2, "row": 0, "color": "blue"},
   {"id": "b3", "label": "B-3 Greeks, hedging", "col": 2, "row": 1, "color": "blue"},
   {"id": "b4", "label": "B-4 Put-call parity", "col": 2, "row": 2, "color": "blue"},
   {"id": "top", "label": "Onchain options → Mantle", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "perp", "to": "b0"}, {"from": "lend", "to": "b5"}, {"from": "ob", "to": "b1", "dashed": true},
   {"from": "b0", "to": "b2"}, {"from": "b0", "to": "b1"}, {"from": "b2", "to": "b3"},
   {"from": "b5", "to": "b4"}, {"from": "b3", "to": "top"}, {"from": "b4", "to": "top"}, {"from": "b2", "to": "top", "dashed": true}
 ]}
```

```prereq B-0 l1 3min
# Calls and puts
what: A [[call]] gives the buyer the right to buy the underlying at the [[strike]] K. A [[put]] gives the right to sell at K. The buyer pays a [[premium]]; the seller receives it and takes the obligation [1].
why: Every structure and protocol on this page combines these two contracts.
example: A call with K = 2500 pays 500 if ETH is 3000 at expiry, and 0 if ETH is 2400.
misconception: Myth: buying a put is "shorting an option". Fact: buying a put is a long option position, used to bet on a fall or to protect spot.
deeper: [1] OIC, "Options Basics"
```

```prereq B-1 l1 3min
# Contract specification
what: An option must state its underlying, strike, expiry time, exercise style, settlement method, multiplier and settlement-price rule. The holder can exercise a [[European option]] only at expiry, but can sell it before expiry [1][4].
why: Most onchain option incidents hit the settlement-price path ([[fixing]]). RWAs add corporate-action rules.
example: Deribit ETH options are European with a multiplier of 1. They expire at 08:00 UTC and settle on a 30-minute [[TWAP]] of the index (07:30–08:00) [4].
misconception: Myth: the same underlying and strike make the same product. Fact: a different settlement-price source is a different risk.
deeper: [4] Deribit, "Linear USDC Options"
```

```prereq B-2 l1 4min
# Implied volatility and Black-Scholes
what: [[Black-Scholes]] prices a European option from spot, strike, time, rate and volatility [8]. The volatility that makes the model match a market price is the [[implied volatility]] [2].
why: Market makers in effect quote IV. IV and time to expiry set most of the premium.
example: ETH 2500, 30 days, IV 60%: the ATM call is $171.35. At IV 52% it falls to $148.55.
misconception: Myth: IV forecasts the future. Fact: IV is a parameter backed out of quotes. On 2026-10-15 ETH IV was about 52 and recent realized volatility about 44 [5].
deeper: [2] OIC, "Volatility & the Greeks"
```

```prereq B-3 l1 4min
# Greeks and delta hedging
what: [[delta]] measures how much the option moves when the underlying moves $1. [[gamma]] measures how fast delta changes. [[theta]] is the time value lost per day. [[vega]] measures the price change for 1 point of IV [2].
why: After selling an option, a market maker offsets delta with spot. The remaining gamma risk sets how much capital he needs.
example: The example ATM call: delta 0.534, gamma 0.000924, theta −$2.85/day, vega $2.85 per IV point.
misconception: Myth: delta-neutral means no risk. Fact: after a 10% jump, the hedged seller still loses about $27–30 (panel K).
deeper: [2] OIC, "Volatility & the Greeks"
```

```prereq B-4 l1 3min
# Put-call parity
what: European options on the same underlying, strike and expiry satisfy C − P = S − PV(K) [8]. Calls, puts, spot and borrowing can replicate each other.
why: This identity starts the World Markets paper. It also explains why a covered call equals a short put.
example: In the example, C2750 = 81.76 and P2750 = 331.76. The difference is −250 = 2500 − 2750.
misconception: Myth: spot plus lending can replicate an option. Fact: you still need a source of [[convexity]]: an opposite option or a claim with the same payoff [26].
deeper: [8] Stoll (1969)
```

```prereq B-5 3min
# Margin: full collateral and portfolio margin
what: [[Full collateral]] makes the seller lock the largest possible payout. [[Portfolio margin]] revalues the whole account across price and volatility scenarios and charges the worst loss [6][7].
why: Full collateral is simple and safe but costs capital. Portfolio margin saves capital but depends on models and liquidation.
example: A 2500/2750 call spread pays at most $250, so locking $250 is enough. A naked short call has no maximum payout.
misconception: Myth: portfolio margin removes risk. Fact: it recognizes offsets but still depends on models and liquidation.
deeper: [7] Cboe, "Portfolio Margining"
```

## J Basics 1: Payoff Shapes and Common Structures {depth=2}
Options differ from spot and perps in payoff shape, not simply in leverage. Spot and perps draw straight lines: a $1 rise earns $1. Options draw bent lines: one side has a cap and the other stays open. Fig. 1 plots PnL at expiry with the example parameters.

```svg
@@FIG1@@
```

Fig. 1 shows three points:
- A long call loses at most $171.35, with uncapped upside. Its break-even is 2671.35, not 2500.
- A long put is a long option position, but it earns money when price falls.
- A short call earns at most $171.35, and its loss on a rally has no cap [1].

**Alice's four choices**: she holds 1 ETH and can reshape her payoff with options (Fig. 2).

```svg
@@FIG2@@
```

| Structure | Max loss | Max gain | Use |
|---|---|---|---|
| Protective put (spot + long P2500) | $171.35 | Uncapped | Insurance |
| Covered call (spot − C2750) | $2,418.24 | $331.76 | Trade upside for income |
| Collar (spot + P2250 − C2750) | $235.53 | $264.47 | Cheap insurance |
| Bull call spread 2500/2750 | $89.59 | $160.41 | Cheap upside |

The table values are expiry values from the OIC formulas [3].

```finding F1 high
# Options trade payoff shape; a covered call carries the same risk as a short put, and the premium is not principal protection
claim: At every expiry price, a covered call has the same PnL as a short put at the same strike. Alice sells C2750 for $81.76; if ETH falls to 1500 she still loses $918.24. A protective put has the same PnL as a long call at the same strike.
evidence: [observed] OIC definitions and formulas [1][3] (B1, B4, B45, B46); OIC calls the two risk profiles "identical" (B43). [observed] Example prices computed in Python (B34, B35). [inferred] Break-evens and equivalences (B44, B50).
implication: Product pages should show the expiry payoff range and maximum loss, not only an "annual yield". An option-selling vault is selling insurance.
```

## K Basics 2: Price, Implied Volatility and Greeks {depth=2}
Before expiry, option price = [[intrinsic value]] + [[time value]]. Fig. 3 shows the value of the K = 2500 call with different times left.

```svg
@@FIG3@@
```

More time gives a higher, smoother curve. This extra value depends on IV and time left, and it decays each day as theta.

**IV is a surface, not one number**. Deribit ETH option quotes on 2026-10-15 [5]:

| Contract | IV | Note |
|---|---|---|
| 2000 put, Nov 27 | 56.4% | Downside protection costs more (skew) |
| 2400 call, Nov 27 | 49.7% | Near the money |
| 3000 call, Nov 27 | 52.5% | Wings above the center (smile) |
| 2400 call: Oct 30 / Nov 27 / Dec 25 | 46.5% / 49.7% / 50.6% | Longer expiries are higher |

At the same time, the ETH 30-day IV index [[DVOL]] was about 52, and recent realized volatility was about 44 [5]. The extra that option sellers collect pays for jump risk.

**How Bob hedges**: Bob sells Alice 1 ATM call for $171.35. He buys 0.534 ETH to offset delta. Then the price jumps at once:

| Scenario | New call price | Bob option PnL | Spot PnL | Total |
|---|---|---|---|---|
| ETH → 2750 | 331.76 | −160.41 | +133.57 | **−26.84** |
| ETH → 2250 | 67.29 | +104.06 | −133.57 | **−29.51** |

Bob loses in both directions: this is negative gamma. The approximation −½Γ(ΔS)² gives −$28.88. Bob collects about $2.85 of theta per day, so one 10% jump costs about 10 days of theta.

```python title="Black-Scholes and Greeks (research/scripts/bs.py, excerpt)"
from math import log, sqrt, exp, erf, pi
N = lambda x: 0.5 * (1 + erf(x / sqrt(2)))
n = lambda x: exp(-0.5 * x * x) / sqrt(2 * pi)

def bs(S, K, T, r, sigma, kind="call"):
    sqT = sqrt(T)
    d1 = (log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * sqT)
    d2 = d1 - sigma * sqT
    df = exp(-r * T)
    if kind == "call":
        price, delta = S * N(d1) - K * df * N(d2), N(d1)
    else:
        price, delta = K * df * N(-d2) - S * N(-d1), N(d1) - 1
    gamma = n(d1) / (S * sigma * sqT)
    vega = S * n(d1) * sqT / 100          # per 1 IV point
    theta = -S * n(d1) * sigma / (2 * sqT) / 365  # per day, r = 0
    return price, delta, gamma, vega, theta

print([round(x, 4) for x in bs(2500, 2500, 30/365, 0, 0.60)])
# [171.3485, 0.5343, 0.0009, 2.8488, -2.8488]
```

```finding F2 high
# The core risk of selling options is gamma: after a delta hedge, a 10% jump still costs $27–30
claim: In the example, Bob's hedged position loses $26.84 and $29.51 on ±10% jumps, about 10 days of theta. Over a short interval Δt with IV unchanged, Bob's hedged PnL ≈ ½ΓS²[σ_IV²Δt − (ΔS/S)²], where Γ is the long option's positive gamma. The seller loses when realized variance exceeds implied variance.
evidence: [observed] Python computation (B34, B36). [inferred] The theta–gamma relation and the PnL decomposition (B32, B33, B37, B38). [observed] Deribit IV, smile and DVOL on 2026-10-15 (B22, B23, B26, B29). [inferred] Black-76 reproduces Deribit marks (B20).
implication: Whoever carries gamma needs capital and a hedging venue. This sets the bottleneck for onchain options (F5).
```

## L How Onchain Options Got Here {depth=2}
Onchain options have tried five approaches. Each differs in who carries the seller's risk and how the venue prices it.

| Gen | Approach | Who carries risk | Problems |
|---|---|---|---|
| 1 | Insurance-style, fully collateralized (Opyn v1, Hegic) | A single seller or an LP pool | Opyn exercise bug in 2020 [18]; Hegic LPs lost money over time (secondary research) |
| 2 | Option vaults ([[DOV]]: Ribbon, Thetanuts V3) | Depositors | Some vaults had negative lifetime returns; pooled risk did not scale [20][25] |
| 3 | Option AMM + hedging (Lyra v1, Dopex / Stryke) | LPs | Static IV made LPs lose steadily [19] |
| 4 | Perpetual / convex products (Squeeth, Panoptic) | Makers and LPs | Squeeth shut down in 2024-11 [9] |
| 5 | Offchain matching + onchain settlement (Derive, Paradex, Rysk) | Professional market makers | Still under test |

```finding F3 high
# The first four generations failed on the seller side: settlement prices were attacked, LPs were picked off, and vaults could not scale
claim: Incidents at Opyn (2020), Ribbon legacy vaults (2025-12, about $2.7M) and Typus (2025-10, about $3.44M) all hit the settlement or oracle path. Lyra said older AMMs used static volatility and LPs lost steadily. Rysk concluded that DOVs proved demand but could not scale because of pooled risk and rigid design.
evidence: [observed] Opyn post-mortem [18] (E35); Ribbon and Typus incidents (E38, E60, media reports); Lyra post [19] (E43); Rysk docs [20] (E41); Ribbon vault returns (E39); Hegic LPs (E42). [inferred] The settlement path is the most common failure point (E63). [speculative] Market makers capture much of DOV yield in the auctions (E40); no primary quantitative evidence.
implication: A new protocol's first priority is the settlement-price rule and oracle permissions. Price seller yield for risk; do not fund it with incentives.
```

## M The Market Today {depth=2}
**A few venues hold most volume** (DefiLlama, 30 days to 2026-10-16) [14]:

| Protocol | 30-day notional | Share | Architecture |
|---|---|---|---|
| Derive (V2 + V3) | $4,245.7M | 83.7% | Order book + RFQ + portfolio margin |
| Paradex | $484.0M | 9.5% | Order book + Paradigm RFQ |
| Rysk V12 (HyperEVM) | $145.7M | 2.9% | Per-trade RFQ, full collateral |
| CallPut (Base) | $97.8M | 1.9% | Not checked |
| Aevo | $66.6M | 1.3% | Order book + portfolio margin |
| All venues | $5,074.1M | 100% | |

By premium, Derive holds 91.2%. Stryke and Kyan traded nothing in 30 days; Ithaca had only $1,999 of premium [14].

**Compared with centralized venues**: on 2026-10-01 Derive held about $1.39B of option OI, 3.1% of a $44.7B five-venue total; Deribit held 78.2% [15]. Academic work estimates DEXs at about 1% of option volume [17]. Coinbase bought Deribit in 2025 for about $2.9B [16].

**How the main protocols work**:

| Protocol | Margin | Settlement | Note |
|---|---|---|---|
| Derive V3 | Standard or scenario portfolio margin | European, 08:00 UTC; US-equity underlyings can use 16:00 New York | ZK exchange + Ethereum settlement since 2026-10-07 [21] |
| Paradex | Portfolio margin | European, USDC cash, 30-minute TWAP | Public beta 2026-04 [23] |
| Rysk V12 | Full collateral per trade | European, physical delivery | Expiries aligned with Deribit [20] |
| Thetanuts V4 | Full collateral | Oracle settlement | Offchain signed orders, onchain `fillOrder` [24] |

```finding F4 high
# Onchain options are small and concentrated; Derive's volume grew mainly through larger trades
claim: 30-day notional is about $5.07B and premium about $88.2M; Derive holds 83.7% / 91.2%. Deribit's OI is about 25× Derive's. Derive's Q3 notional rose 89.6% quarter on quarter, but trade count rose only 6.2%; the average trade grew from $47K to $84K.
evidence: [observed] DefiLlama API [14] (E21, E22, E25, E26); Alea quarterly report [15] (E27, E28, E29; the author maintains Derive's data room, a conflict of interest); Deribit statistics (E30); academic study [17] (E34). [inferred] Share computations (E23, E24).
implication: Onchain options are a small, institutional market today. A new venue must answer "who makes markets and who buys", not "can we match orders".
```

## N Why It Is Hard: Where the Risk Ends Up {depth=2}
Matching is no longer the hard part. Leading venues match offchain and settle the result onchain [21][23]. The hard part comes after a user buys an option. Who carries the seller's risk? Where does that party hedge? How much capital does it tie up?

```excalidraw q="After a user buys an option, where does the risk go, and where does cost enter the price?" read="Blue boxes are onchain; gray dashed boxes are offchain; red boxes are cost sources." takeaway="The onchain contract only locks collateral and settles. Most of the price comes from the market maker's hedging access and capital." kind=Risk flow
{"grid": {"w": 340, "h": 120}, "defaults": {"w": 200, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "u", "label": "User (Alice)", "col": 0, "row": 1, "color": "blue"},
   {"id": "c", "label": "Settlement contract", "col": 1, "row": 1, "color": "blue"},
   {"id": "m", "label": "Market maker (Bob)", "col": 2, "row": 1, "color": "blue"},
   {"id": "h", "label": "Hedge: CEX / perps", "col": 3, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "k", "label": "Capital / margin", "col": 3, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "x1", "label": "Hedge cost, jump risk", "col": 2, "row": 0, "color": "red"},
   {"id": "x2", "label": "Funding cost", "col": 2, "row": 2, "color": "red"}
 ],
 "edges": [
   {"from": "u", "to": "c", "label": "premium"}, {"from": "c", "to": "m", "label": "lock"},
   {"from": "m", "to": "h", "label": "hedge"}, {"from": "m", "to": "k", "label": "uses"},
   {"from": "x1", "to": "m", "dashed": true}, {"from": "x2", "to": "m", "dashed": true}
 ]}
```

A typical RFQ option trade runs as below, simplified from the Derive and Rysk docs [20][21].

```uml q="How does an RFQ option trade go from quote request to settlement at expiry?" read="Simplified from the Derive RFQ and Rysk V12 docs. The highlighted part runs atomically in one onchain transaction." takeaway="Bidding happens offchain; the chain only checks signatures, collects premium and locks collateral, then pays out at expiry under a preset settlement-price rule."
sequenceDiagram
  autonumber
  participant A as Alice
  participant Q as RFQ service
  participant M as Market makers
  participant C as Settlement contract
  participant O as Oracle
  A->>Q: Request (underlying, K, expiry, size)
  Q->>M: Broadcast request
  M-->>Q: Signed quote (EIP-712, expiry)
  Q-->>A: Best quote
  A->>C: Submit quote + own signature
  rect rgb(234, 241, 251)
    C->>C: Check signature, expiry, nonce
    C->>C: Take premium, lock seller collateral, record position
  end
  Note over C,O: At expiry
  O-->>C: Settlement price (e.g. 30-min TWAP)
  C->>A: Pay out if ITM
  C->>M: Release remaining collateral
```

Full collateral puts its cost straight into the price. Thetanuts docs define a maker's quote as exchange bid/ask ± collateral funding cost. The collateral APRs are 7% for USDC, 4% for WETH and 1% for cbBTC [24].

```finding F5 high
# The bottleneck of onchain options is risk bearing, not matching: leading venues already match offchain and settle onchain
claim: Derive V3 matches in a ZK exchange and settles to Ethereum; Paradex, Rysk and Thetanuts quote offchain and execute onchain. A market maker's cost comes from hedging access and capital. Full collateral adds funding cost straight into quotes; portfolio margin and perp hedging are the main ways to cut it.
evidence: [observed] Derive V3 and RFQ docs [21] (E45, E46, E56); Rysk [20] (E52); Thetanuts pricing method [24] (E53, E55). [inferred] Leading venues match offchain (E64); cost structure (E62); the bottleneck (S4).
implication: A chain that wants options must first answer three questions. Where do market makers hedge? Where does collateral capital come from? Who provides the settlement price?
```

## O Jeff Yan and Hyperliquid HIP-4 {depth=2}
The episode is Blockworks Empire, "Jeff Yan On Hyperliquid's Plan To Bring All Finance Onchain", released 2026-10-07. The 11:46 chapter has the title "Better Trading Through Fees And Options" [10].

**What he said** (most reliable first):
1. Around 04:30 (machine transcript): perps are not better than options; the two are complementary.
   He calls HIP-4 the primitive for "options or option-like payout curves" [10].
2. The builder question (retold by Chinese media; timestamp not checked): without infrastructure, he might work on options now.
   HIP-4 is a clear path to an options protocol.
   Such a protocol inherits spot, order books and portfolio margin, and hedges delta with perps.
   No crypto option or convex product has reached "escape velocity" yet [11].

**What HIP-4 is**: [[HIP-4]] outcome markets hold full collateral and settle within a fixed range. The docs say they suit prediction markets and "bounded options-like instruments". They have no margin borrowing and no liquidation [12]. The first market is a daily BTC binary settled at 06:00 UTC on the BTC mark price. It went live on mainnet on 2026-05-02 [12].

```finding F6 high
# Jeff Yan did not announce options on Hyperliquid; he leaves options to builders and Hyperliquid supplies primitives
claim: In the interview he placed options among things third-party builders can do on HIP-4. Hyperliquid's docs and announcements show no native vanilla option product or roadmap. The available primitives are HIP-4, portfolio margin (live since 2025-12) and HIP-3 perps.
evidence: [observed] Episode page and machine transcript [10] (E1–E4); media retellings [11] (E5–E7); HIP-4 docs [12] (E10–E14); portfolio margin [13] (E16). [inferred] No official vanilla option roadmap (E18). [speculative] The builder answer falls inside the 11:46 chapter (E8); reports that "Hyperliquid will add options" misread the interview (E9).
implication: Hyperliquid's play is "build general primitives, leave options to the ecosystem". This is a useful reference for Mantle (panel S).
```

## P The World Markets Paper: Mechanism {depth=2}
The paper is World Markets Research, "The Economics of Composable Options Markets" (2026-10, 12 pages) [26]. Its claim: an option's liquidity need not come only from that option's own order book.

```excalidraw q="How does a venue build a call from spot, a loan and a put, and compare it with the native call?" read="Blue boxes are the three executable legs; the green box is the call delivered to the user; the yellow box is the constraint. Numbers are the hypothetical quotes from the paper's §3." takeaway="The synthetic price is the sum of the three legs; the depth is the smallest leg. Without any one leg, the route does not exist." kind=Synthetic routing
{"grid": {"w": 350, "h": 115}, "defaults": {"w": 210, "h": 60, "fontSize": 16},
 "nodes": [
   {"id": "s", "label": "Buy spot 100.20 × 150", "col": 0, "row": 0, "color": "blue"},
   {"id": "p", "label": "Buy put 4.00 × 80", "col": 0, "row": 1, "color": "blue"},
   {"id": "b", "label": "Borrow, repay K × 60", "col": 0, "row": 2, "color": "blue"},
   {"id": "syn", "label": "Synthetic call 4.40 × 60", "col": 1, "row": 1, "color": "blue"},
   {"id": "nat", "label": "Native call 4.80 × 40", "col": 1, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "out", "label": "User gets call × 100", "col": 2, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "lim", "label": "Depth = min(150, 80, 60)", "col": 2, "row": 0, "color": "yellow"}
 ],
 "edges": [
   {"from": "s", "to": "syn"}, {"from": "p", "to": "syn"}, {"from": "b", "to": "syn"},
   {"from": "syn", "to": "out", "label": "cheaper"}, {"from": "nat", "to": "out"},
   {"from": "lim", "to": "syn", "dashed": true}
 ]}
```

**The argument in four steps**:
1. **Static replication**: by parity, C = S + P − PV(K).
   Buy spot and the matching put, and fund PV(K) with a loan that repays K at expiry.
   The synthetic price is the sum of the legs; the depth is the smallest leg [26].
2. **A source of convexity**: spot and ordinary loans supply only the spot and financing legs.
   You also need an opposite option or a maturity-settled non-recourse loan.
   At expiry, the lender of that loan receives K − max(K − S_T, 0).
3. **Dynamic replication + portfolio margin**: without a static route, the maker sells the call the client wants.
   He buys a higher-strike call and hedges only the remaining delta with spot.
   A shared ledger counts term-lending claims at 98% toward margin [26][27].
4. **Estimate**: if hedge options are available, October data support 532–1,052 quoted contracts.
   That is 5.9–11.7× the 90-contract historical best ask on Derive V2 [26].

The paper's capacity bound is $Q \le \min(H/|\Delta|,\ C_e/m,\ N_R)$: hedge capacity, capital and residual-risk limit, whichever binds first [26].

```finding F7 high
# The paper's core idea holds: option liquidity can be assembled from spot, term financing and opposite options, and portfolio margin lets makers fund only residual risk
claim: The scarcest leg limits each static route. A maker can sell a call spread instead of a naked call. Then the initial spot hedge falls from about 0.5 ETH per contract to 0.02–0.11 ETH. World's docs do state that lending claims count at 98% toward available margin.
evidence: [observed] Paper text [26] (W2–W10); World docs [27] (W41, W42); net deltas and contract counts re-computed in Python (W27, W28). [inferred] The 3.18× and 2.00× arithmetic (W11, W12).
implication: On a chain, options, lending and spot must share one margin ledger and support atomic multi-leg fills. "Composability" across separate protocols is not enough (W62).
```

## Q The Paper's Numbers: Measured or Assumed {depth=2}
| Number | Meaning | Type | Our check |
|---|---|---|---|
| DEX 30-day $246.6B | Spot volume | Measured | warn Same window now reads about $288.0B |
| Aave $12.15B, Morpho $5.78B | Loans outstanding | Measured | ok Matches DefiLlama |
| Derive OI $1.655B | Open interest | Measured | ok Exact match |
| 90 contracts / $67.20 | Derive V2 best ask | Measured (09-24) | warn Top level only; V2 has migrated |
| 532–1,052 contracts, 5.9–11.7× | Quote capacity | Model | ok Re-computed |
| Reserve per contract $35.59 / $17.49 / $6.88 | Stress loss | Model | ok Re-computed |
| 3.18×, 2.00× | Capital capacity | Model | ok Re-computed |
| $106.4M / $53.2M per $1B of demand | New volume | Assumption-driven | warn The paper assumes a $1M new bid and θ = 50% |
| Table 7 capital use | Derive vs World | Supplied by the project | no "provisional supplied estimates" |

The Python re-computation shows the worst Table 4b scenario is spot −20%, IV 75%, 7 days left. Total reserves are about $19k in all three configurations (panel V).

```finding F8 high
# The paper's model figures all re-compute, but its conclusion rests on untested premises and an outdated benchmark
claim: The key premise is that equal-size hedge options can be bought: the $25 configuration needs 1,052 executable hedge calls. This moves the "missing option liquidity" problem to the hedge leg. The benchmark is the best level of Derive V2, which has migrated, not V3 or RFQ depth. World's options are still "Coming soon". We found no community discussion of the paper.
evidence: [observed] Re-computation (W27, W28, W30, W33); the paper's own assumptions (W36, W37); World docs (W45); Derive V3 migration (W20); DEX gap and loan balances (S1, S2); search for community discussion (W60). [inferred] Problems with the premise and benchmark (S3, W39, W40); the abstract is stronger than the body (W38).
implication: When you assess a similar proposal, ask for four measured inputs: hedge-option size, affordable spot size, financing capacity and residual-risk limit. Do not rely on aggregate ratios such as "spot volume is 50.5× option volume".
```

## R RWA Options: Clocks, Units, Permissions {depth=2}
When the underlying changes from ETH to a tokenized stock, the contract gains three kinds of problems [29][30][31][33]:

| Problem | xStocks today | Rule the option must state |
|---|---|---|
| **Clock** | Onchain 24/7; issuer mint / redeem 24/5; xChange order cap is $0 during market closure | Which clock sets the settlement price; whether new positions open during closures |
| **Price** | Chainlink v10 `price` does not update on weekends; `tokenizedPrice` keeps updating | Which field drives mark and settlement |
| **Units** | Dividends, splits and fees all change the multiplier; EVM `balanceOf` changes by itself | How K and size adjust; use the non-rebasing ERC-4626 wrapper |
| **Activation time** | Three sources disagree: 00:30, 00:00, observed 23:55–04:00 UTC | How long to pause around activation |
| **Permissions** | A pauser can halt all transfers; a sanctions list blocks from / to / spender | How to settle if collateral is frozen |
| **Eligibility** | Direct mint / redeem needs KYC, $5,000 minimum, no US persons | Whether makers can arbitrage the basis |

```finding F9 high
# The engineering core of RWA options is clocks, units and permissions; they belong in the contract spec, not in operations
claim: xStocks trade 24/7 onchain, while subscriptions and redemptions with the issuer run 24/5. Corporate actions take effect through the multiplier, and three sources give different activation times. The issuer contract can pause all transfers, so collateral locked in an option contract may fail to deliver. Ready-made parts exist: the ERC-4626 wrapper and the Chainlink v10 `marketStatus` and multiplier fields.
evidence: [observed] xStocks docs and API [29][30] (X32, X33, X35, X38, X39, X44); contract source [31] (X36, X37, X41); Chainlink v10 [33] (X24, X25, X34, X40). [inferred] A freeze blocks delivery (X43); the three rules (S7).
implication: Build one shared "RWA settlement adapter" that reads the multiplier, market status and pause windows. Every option app can reuse it.
```

## S Mantle: What It Has, What It Lacks, What to Build First {depth=2}
The directions and priorities below are research recommendations. They are not live Mantle capabilities and not roadmap commitments.

**What Mantle has**:
- xStocks launched natively on Mantle on 2026-04-10 and connected to the issuer's Atomic RFQ (xChange) on 2026-05-07. The API lists at least about 100 assets deployed on Mantle [30][32].
- Aave V3 launched on Mantle on 2026-02-11, with about $330M supplied [35].
- Bybit and Mantle plan mStocks for 2026-11; only media and reposted sources exist so far [36].

**What Mantle lacks**:
- DefiLlama lists only one option protocol on Mantle, Stryke CLAMM, with $0 volume. Perp volume is $0 [14].
- Rysk and Thetanuts are not deployed on Mantle [20][24].
- Aave on Mantle does not accept xStocks or mETH as collateral, and cannot lend xStocks for a short hedge [35].
- Mantle's oracle docs do not list Chainlink, and we found no equity Data Streams live on Mantle [33][34].

```excalidraw q="Which capability layers do options need, and where does Mantle stand on each?" read="Layers run bottom-up in the order options depend on them. Green = present, yellow = partial, red = missing." takeaway="Mantle's gaps sit in the middle: price and risk bearing. Demand at the top is still untested." kind=Capability layers
{"grid": {"w": 560, "h": 78}, "defaults": {"w": 520, "h": 58, "fontSize": 17},
 "nodes": [
   {"id": "l6", "label": "Demand: who buys protection, who sells yield (untested)", "col": 0, "row": 0, "color": "yellow"},
   {"id": "l5", "label": "Risk bearing: options, perps, borrowable RWAs (missing)", "col": 0, "row": 1, "color": "red"},
   {"id": "l4", "label": "Settlement: RFQ, collateral lock, payout (missing)", "col": 0, "row": 2, "color": "red"},
   {"id": "l3", "label": "Price: equity price with market status (partial)", "col": 0, "row": 3, "color": "yellow"},
   {"id": "l2", "label": "Liquidity: spot RFQ yes, thin DEX (partial)", "col": 0, "row": 4, "color": "yellow"},
   {"id": "l1", "label": "Assets: xStocks, USDT0 / USDC, multiplier (present)", "col": 0, "row": 5, "color": "green"}
 ],
 "edges": []}
```

**Candidate directions**:

| Direction | Mantle status | Main risk | Recommendation |
|---|---|---|---|
| a. Holder protection / yield structures + RFQ (full collateral) | Partial | Makers cannot hedge during US market closures; demand untested | ok Start here |
| b. RWA settlement and corporate-action adapter | Partial | Issuer rules differ | ok In parallel with a |
| d. Distribute external option markets | Partial | External venues list no xStocks options | warn Use to test demand |
| e. mETH / USDY structured products | Partial | Long redemption delays; Reg S limits | warn Later |
| c. Replication venue with portfolio margin | Missing | Spot, shorting and perps are all missing | no Defer |

The settlement contract for direction a only needs to check quotes, lock the maximum payout and settle by rule. Below is an interface sketch:

```solidity title="RFQ option settlement contract · sketch (code does not exist)"
struct Quote {
    address maker;          // market maker (seller)
    address underlying;     // e.g. ERC-4626 wrapper of an xStock
    uint256 strike;         // in USDC
    uint64  expiry;         // settlement time (UTC)
    bool    isCall;
    uint256 amount;         // wrapper shares; unaffected by the multiplier
    uint256 premium;        // paid by Alice to the maker
    bytes32 fixingRuleId;   // price rule: source, window, closure handling
    uint64  validUntil;     // quote expiry
    uint256 nonce;
}
// fill(): verify EIP-712 signature and nonce → take premium → lock maker's max payout
// settle(): read the price set by fixingRuleId → pay if ITM → release the rest
// If the market is closed or the issuer pauses: fill reverts; settle follows the rule's fallback
```

```finding F10 high
# Mantle has underlyings, settlement stablecoins and spot RFQ; it lacks the layer that carries option risk
claim: The xStocks issuer mints natively on Mantle and offers RFQ there; stablecoins and Aave are live. But option and perp volume on Mantle are both $0. None of the main RFQ option protocols run on Mantle. Lending neither accepts RWAs nor lends xStocks for shorting. Through the parity lens, Mantle has the spot and financing legs but no source of convexity.
evidence: [observed] xStocks (X1–X5); Aave (X16, X17); DefiLlama (X21, X29); Rysk and Thetanuts (X30, X31); oracle docs (X28). [inferred] The capability assessment (X51, S5). [speculative] No equity Data Streams are live on Mantle (X27).
implication: World-style "assembled liquidity" has no raw material on Mantle yet. Add settlement contracts and price rules first; portfolio margin comes later.
```

```finding F11 medium
# Recommendation: start with fully collateralized protection / yield structures plus RFQ, build the RWA settlement adapter in parallel, and defer a portfolio-margin venue
claim: Fully collateralized structures with a bounded payout (covered call, cash-secured put, spreads, collars) need no portfolio margin and no deep onchain spot. Market makers price and hedge offchain; the chain only checks signatures, locks collateral and settles. The adapter is a prerequisite and many apps can reuse it. Centralized venues already offer xStocks structured products (Bybit Dual Asset) and RWA options (XAUT, SPY, QQQ), so others are testing demand.
evidence: [inferred] Reasons for directions a and b (X52, X53, S6); deferring c (X54); limits on e (X56). [observed] Centralized precedents (X48, X49). [speculative] The priority order (X55); following Hyperliquid's "primitives first, options to builders" path (S8); no sizable onchain tokenized-stock option market exists yet (X50).
implication: The first step is interviews, not contracts. Ask xStocks holders whether they would pay for protection. Ask option market makers how they hedge during closures and how wide their quotes must be.
```

## T Limits and Open Questions {depth=2}
**Limits of this page**:
- Jeff Yan's longer remarks on options exist only as Chinese media retellings; we have no verbatim transcript of the 11:46 chapter.
- We have no data on Mantle user demand or market-maker interest. F11's priority order is an untested recommendation, classified as speculative (X55).
- We found no statistics on the buy / sell mix of onchain option users (for example, whether retail mostly sells).
- We audited no protocol contracts and did not read `feePerPeriod` from the xStocks contracts on Mantle.
- The sub-agents had no shell, so the main session re-checked all figures in Python. We accessed most web sources on 2026-10-16; the data will change.

**Open questions**:
1. Why does DefiLlama's current same-window DEX total exceed the paper's input by about 17%?
2. Will Chainlink equity Data Streams go live on Mantle? What are the mStocks issuer structure, permissions and price feed?
3. When will Derive V3 list US-equity options, and how will it handle the settlement clock?
4. When will World Markets V2 +Options launch, and what is its real capital use?
5. How large is the basis between xStocks on Mantle and the underlying shares? Chainlink v10 `price` and `tokenizedPrice` can measure it.

## U Method and Evidence {depth=3}
**Method**: four research lanes ran in parallel, each with its own notes and ledger, then merged:
- **Lane B**: option basics, with live Deribit public API data
- **Lane E**: Jeff Yan, HIP-4, onchain option history, protocols and data
- **Lane W**: the World Markets paper section by section, number grading and checks
- **Lane X**: Mantle assets, infrastructure, RWA problems and candidate directions

Prefix S marks the main session's extra checks and synthesis. The sub-agents had no shell and computed by hand. The main session re-ran every figure in Python. This fixed one wrong inference: lane W thought Table 4b included friction and financing costs, but it is a pure mark-to-market stress loss.

**Corrections to earlier material**:

| Earlier claim | Correction |
|---|---|
| GPT: the Drive article was not available | Read in full and re-computed (W1) |
| GPT: no mention of HIP-4 | Hyperliquid's option-like product is HIP-4 (E10) |
| GPT: an operator runs the Derive order book | V3 now uses a ZK exchange (E45) |
| GPT: Ithaca and Stryke are current designs | Almost no volume in 30 days (E26) |
| GPT: Derive XAUT was the first RWA option | Bybit listed one on 06-12 (X48) |
| GPT: rUSDY is on Mantle | It is USDY and mUSD (X59) |
| GPT: no disclosure for Alea | Alea maintains Derive's data room (E27) |
| Media: Hyperliquid will add options | Not supported by the interview (E9) |
| Sub-agent: Table 4b includes costs | Pure mark-to-market stress loss (W30) |
| Paper: DEX 30-day $246.6B | Same window now reads about $288.0B (S1) |

**Ledger**: 258 claims; observed 202, inferred 44, speculative 12. Speculative claims appear only in marked evidence and in the Limits panel.

## V Reproduce {depth=3}
Environment: Python 3 and curl. Scripts live in the report's `research/scripts/` folder.

```bash title="Option example (expect 171.3485, 81.7565; ±10% jumps −26.84 / −29.51)"
cd research/scripts
python3 bs.py
```

```bash title="Paper Tables 4a / 4b and Eqs. 16–18 (expect 532 / 1052 / 2620; 35.59 / 17.49 / 6.88)"
python3 wm_check.py
```

```bash title="DefiLlama option data (expect total30d near 5.07e9; changes over time)"
curl -s "https://api.llama.fi/overview/options?excludeTotalDataChart=true\
&excludeTotalDataChartBreakdown=true&dataType=dailyNotionalVolume" \
  | jq '.total30d, [.protocols[] | {name, total30d}] | sort_by(-.total30d) | .[:6]'
```

```bash title="Deribit live IV and Greeks (expect mark_iv and greeks fields)"
curl -s "https://www.deribit.com/api/v2/public/ticker?instrument_name=ETH-27NOV26-2400-C" \
  | jq '.result | {mark_iv, greeks, underlying_price}'
```

```bash title="xStocks multiplier on Mantle (expect currentMultiplier near 1.0057)"
curl -s "https://api.xstocks.fi/api/v2/public/assets/SPYx/multiplier?network=Mantle"
```

## W Glossary {depth=2}
```glossary
call | call option | Gives the buyer the right to buy the underlying at the strike. | not a synonym for "long option"
put | put option | Gives the buyer the right to sell the underlying at the strike. | buying a put is a long option
strike | K | The price at which the option buys or sells. | not the spot price
premium | | The price the buyer pays the seller for the option. | not protocol revenue
European option | | Can be exercised only at expiry; can be sold before expiry. | unrelated to where it trades
fixing | settlement price | The price that sets the payout at expiry, such as a 30-minute TWAP. | not the mark price
TWAP | time-weighted average price | The time-weighted average price over a window. |
intrinsic value | | What exercising now would pay, such as max(S − K, 0). |
time value | | Option price minus intrinsic value; it decays over time. |
Black-Scholes | BS model | A formula that prices European options from spot, strike, time, rate and volatility. | Black-76 uses the forward instead of spot
implied volatility | IV | The volatility backed out of a market price through the model. | not historical volatility
DVOL | | Deribit's 30-day implied volatility index. |
delta | | First-order sensitivity of option price to the underlying price. |
gamma | | How fast delta changes as the underlying moves. Sellers are short gamma. |
theta | | Time value lost per day. |
vega | | Option price change for a 1-point move in IV. |
convexity | | A payoff that curves up: gains accelerate on rallies, losses have a floor. | not leverage
Full collateral | fully collateralized | The seller locks the largest possible payout; no liquidation. |
Portfolio margin | | Revalues the whole account across price and volatility scenarios and charges the worst loss. | not isolated margin
DOV | DeFi option vault | A vault that pools deposits and sells options on a schedule. | not an options exchange
RFQ | request for quote | The user asks for a price, makers return signed quotes, and the user fills one onchain. | not an order book
HIP-4 | outcome markets | Hyperliquid's primitive for fully collateralized contracts that settle within a range. | not a vanilla option
put-call parity | | C − P = S − PV(K). |
multiplier | | The factor xStocks use to reflect dividends, splits and fees. | not the contract multiplier
```

## X References {depth=2}
1. [OIC: Options Basics](https://www.optionseducation.org/optionsoverview/options-basics) — calls / puts, rights and obligations, loss limits. **PRIMARY**
2. [OIC: Volatility & the Greeks](https://www.optionseducation.org/advancedconcepts/volatility-the-greeks) — historical vs implied volatility, Greek definitions and units. **PRIMARY**
3. [OIC: Covered Call](https://www.optionseducation.org/strategies/all-strategies/covered-call-buy-write), [Cash-Secured Put](https://www.optionseducation.org/strategies/all-strategies/cash-secured-put) and other strategy pages — structure formulas; identical risk profiles. **PRIMARY**
4. [Deribit: Change To Inverse Option Delivery Process](https://insights.deribit.com/exchange-updates/change-to-inverse-option-delivery-process) and [Linear USDC Options](https://support.deribit.com/hc/en-us/articles/31424932728093-Linear-USDC-Options) — European, 08:00 UTC, 30-minute TWAP, futures settlement since 2026. **PRIMARY**
5. [Deribit public API](https://docs.deribit.com/) (`ticker`, `get_volatility_index_data`, `get_instruments`, 2026-10-15) — IV, smile, DVOL, contract fields. **PRIMARY**
6. [Deribit: Portfolio Margin](https://www.deribit.com/kb/portfolio-margin) and Standard Margin — margin formulas and scenarios. **PRIMARY**
7. [Cboe: Portfolio Margining](https://www.cboe.com/en/markets/us/options/margin/portfolio-margining-rules/) — strategy-based vs portfolio margin. **PRIMARY**
8. Black & Scholes (1973, JPE); Stoll (1969, JF); Merton (1974, JF) — the pricing model, parity, debt as an option. **PRIMARY**
9. [Paradigm: Everlasting Options](https://www.paradigm.xyz/2021/05/everlasting-options) and [Power Perpetuals](https://www.paradigm.xyz/2021/08/power-perpetuals); [Squeeth shutdown notice](https://squeeth.opyn.co/squeeth) — perpetual options and convex products. **PRIMARY**
10. [Blockworks Empire episode page](https://blockworks.com/podcast/empire/bc375300-c276-11f1-925c-cbee0c7ea3ff) and [Podscan transcript](https://www.podscan.fm/podcasts/empire-1/episodes/jeff-yan-on-hyperliquids-plan-to-bring-all-finance-onchain) — episode, chapters, 04:30 quote. **PRIMARY**
11. [KuCoin flash (reposting Mars Finance)](https://www.kucoin.com/news/flash/hyperliquid-founder-jeff-yan-considers-options-research-for-future-venture) and Binance Square (reposting Odaily) — retellings of the builder answer (media reports).
12. [Hyperliquid: HIP-4 Outcome markets](https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets) and Contract specifications — definition, binary contract spec. **PRIMARY**
13. [Hyperliquid: Portfolio margin](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/portfolio-margin) and the 2026-06-25 announcement — portfolio margin. **PRIMARY**
14. [DefiLlama API: options](https://api.llama.fi/overview/options?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyNotionalVolume) (notional and premium), dexs, the Mantle chain page — volume, shares, Mantle status. **PRIMARY** (aggregated data)
15. [Alea Research: Twice the Exposure, a Quarter Cheaper](https://alearesearch.io/newsletters/twice-the-exposure-a-quarter-cheaper) — Derive Q3 data and CEX shares; the author maintains Derive's data room.
16. [Coinbase: Deribit Joins Coinbase](https://investor.coinbase.com/news/news-details/2025/Deribit-Joins-Coinbase-Unlocking-the-Future-of-Global-Crypto-Derivatives) — the acquisition and Deribit's scale. **PRIMARY**
17. [Andolfatto & Schönleber: Decentralized and Centralized Options Trading (SSRN 4822783)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4822783) — DEXs about 1%; higher onchain IV. **PRIMARY**
18. [Opyn: ETH Put Exploit Post Mortem](https://medium.com/opyn/opyn-eth-put-exploit-post-mortem-1a009e3347a8) — the 2020 bug and compensation. **PRIMARY**
19. [Lyra: Introducing Lyra](https://blog.derive.xyz/introducing_lyra) — problems of earlier option AMMs. **PRIMARY**
20. [Rysk: Solution: Rysk V12](https://docs.rysk.finance/getting-started/solution-rysk-v12) and Problem — RFQ, physical delivery, why DOVs failed. **PRIMARY**
21. [Derive: V3 is live](https://insights.derive.xyz/v3), [RFQ Trading](https://docs.derive.xyz/trading/rfq.md), [Instrument Names](https://docs.derive.xyz/trading/instrument-names.md) — V3 architecture, RFQ flow, settlement times. **PRIMARY**
22. [Derive: XAUT Options Are Live](https://insights.derive.xyz/xaut-options-are-live-on-derive) — Derive's first RWA options. **PRIMARY**
23. [Paradex: Dated Options](https://docs.paradex.trade/trading/dated-options/overview) — European, USDC cash settlement, TWAP. **PRIMARY**
24. [Thetanuts V4 Docs](https://docs.thetanuts.finance/for-builders/overview) — OptionBook, RFQ Factory, maker pricing. **PRIMARY**
25. [The Block: Ribbon legacy DOV exploit](https://www.theblock.co/post/382461/aevos-legacy-ribbon-dov-vaults-exploited-for-2-7-million-following-oracle-upgrade) and [RGP-33](https://gov.ribbon.finance/t/rgp-33-merge-ribbon-finance-into-aevo/709) — the DOV incident and the merger into Aevo (the first is a media report).
26. World Markets Research, "The Economics of Composable Options Markets" (2026-10, PDF; local copy in `research/references/`) — all arguments and figures of the paper. **PRIMARY**
27. [World Markets Docs: ATLAS](https://docs.world.inc/tl-dr-unique-features/atlas), Trading, [Options](https://docs.world.inc/details/options.md) — 98%, 10-day term lending, options "Coming soon". **PRIMARY**
28. [GeorgL0ngGamma gist](https://gist.github.com/GeorgL0ngGamma/4e00c477cb66424b9458827f8b3bec44) — raw Derive V2 book data cited by the paper. **PRIMARY**
29. [xStocks Docs](https://docs.xstocks.fi/docs) (Introduction, FAQ, [Multipliers](https://docs.xstocks.fi/developers/multipliers)) — chain list, trading hours, corporate actions, eligibility. **PRIMARY**
30. [xStocks public API](https://api.xstocks.fi/api/v2/public/assets?network=Mantle) — Mantle deployments, wrapper addresses, per-session caps, multiplier history. **PRIMARY**
31. [backed-fi/backed-token-contract @35859e8c](https://github.com/backed-fi/backed-token-contract) — pause, sanctions list, multiplier and fees, ERC-4626 wrapper. **PRIMARY**
32. [xStocks: Introducing xStocks on Mantle](https://xstocks.fi/us/news/introducing-xstocks-on-mantle) — Atomic RFQ from 2026-05-07. **PRIMARY**
33. [Chainlink: Tokenized Asset Data Streams (Report Schema v10, Handling Stock Splits, Handling Market Events)](https://docs.chain.link/data-streams) — fields, weekend behavior, market-closure gate. **PRIMARY**
34. [Mantle Docs: Oracles](https://docs.mantle.xyz/network/for-developers/resources-and-tooling/oracles.md) and [mETH Protocol](https://docs.mantle.xyz/meth) — oracle list; mETH redemption delays. **PRIMARY**
35. [aavetracker: Aave Mantle](https://aavetracker.com/markets/mantle/) — Aave Mantle asset list (third party reading the Aave API).
36. mStocks media coverage: Gate News (citing PANews), CryptoBriefing (2026-10-13) — 2026-11 target, issuer structure (media reports).
37. [Ondo Docs: Smart Contract Addresses](https://docs.ondo.finance/addresses.md) and [USDY](https://ondo.finance/usdy) — USDY / mUSD on Mantle; Reg S. **PRIMARY**
38. OCC 2025 annual volume and Cboe, "The State of the Options Industry" — US option scale and 0DTE. **PRIMARY**
39. Bybit XAUT options launch notice (2026-06-12) and Coincall SPY / QQQ options launch notice (2026-08-26) — centralized RWA option precedents. **PRIMARY**
40. research-hub report papertrade-deep-dive (`/p/papertrade-deep-dive/`) — earlier checks of Mantle oracles, ordering and stablecoins.
41. ChatGPT Deep Research: `research/onchain-options-handbook.md` — external research, used only as leads.

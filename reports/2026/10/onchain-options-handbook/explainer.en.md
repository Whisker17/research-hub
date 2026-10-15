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
<svg viewBox="0 0 640 378" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PnL at expiry: call, put and spot" style="width:100%;height:auto;font-family:system-ui,sans-serif;font-size:13px">
<line x1="62" y1="280.0" x2="620" y2="280.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="284.0" text-anchor="end" fill="currentColor">-1200</text>
<line x1="62" y1="247.0" x2="620" y2="247.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="251.0" text-anchor="end" fill="currentColor">-900</text>
<line x1="62" y1="214.0" x2="620" y2="214.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="218.0" text-anchor="end" fill="currentColor">-600</text>
<line x1="62" y1="181.0" x2="620" y2="181.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="185.0" text-anchor="end" fill="currentColor">-300</text>
<line x1="62" y1="148.0" x2="620" y2="148.0" stroke="#999" stroke-opacity="0.8"/>
<text x="56" y="152.0" text-anchor="end" fill="currentColor">0</text>
<line x1="62" y1="115.0" x2="620" y2="115.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="119.0" text-anchor="end" fill="currentColor">+300</text>
<line x1="62" y1="82.0" x2="620" y2="82.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="86.0" text-anchor="end" fill="currentColor">+600</text>
<line x1="62" y1="49.0" x2="620" y2="49.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="53.0" text-anchor="end" fill="currentColor">+900</text>
<line x1="62" y1="16.0" x2="620" y2="16.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="20.0" text-anchor="end" fill="currentColor">+1200</text>
<line x1="62.0" y1="16" x2="62.0" y2="280" stroke="#999" stroke-opacity="0.15"/>
<text x="62.0" y="298" text-anchor="middle" fill="currentColor">1500</text>
<line x1="201.5" y1="16" x2="201.5" y2="280" stroke="#999" stroke-opacity="0.15"/>
<text x="201.5" y="298" text-anchor="middle" fill="currentColor">2000</text>
<line x1="341.0" y1="16" x2="341.0" y2="280" stroke="#999" stroke-opacity="0.15"/>
<text x="341.0" y="298" text-anchor="middle" fill="currentColor">2500</text>
<line x1="480.5" y1="16" x2="480.5" y2="280" stroke="#999" stroke-opacity="0.15"/>
<text x="480.5" y="298" text-anchor="middle" fill="currentColor">3000</text>
<line x1="620.0" y1="16" x2="620.0" y2="280" stroke="#999" stroke-opacity="0.15"/>
<text x="620.0" y="298" text-anchor="middle" fill="currentColor">3500</text>
<text x="341.0" y="316" text-anchor="middle" fill="currentColor" opacity="0.7">ETH price at expiry (USD)</text>
<polyline points="62.0,166.8 64.8,166.8 67.6,166.8 70.4,166.8 73.2,166.8 76.0,166.8 78.7,166.8 81.5,166.8 84.3,166.8 87.1,166.8 89.9,166.8 92.7,166.8 95.5,166.8 98.3,166.8 101.1,166.8 103.8,166.8 106.6,166.8 109.4,166.8 112.2,166.8 115.0,166.8 117.8,166.8 120.6,166.8 123.4,166.8 126.2,166.8 129.0,166.8 131.8,166.8 134.5,166.8 137.3,166.8 140.1,166.8 142.9,166.8 145.7,166.8 148.5,166.8 151.3,166.8 154.1,166.8 156.9,166.8 159.6,166.8 162.4,166.8 165.2,166.8 168.0,166.8 170.8,166.8 173.6,166.8 176.4,166.8 179.2,166.8 182.0,166.8 184.8,166.8 187.6,166.8 190.3,166.8 193.1,166.8 195.9,166.8 198.7,166.8 201.5,166.8 204.3,166.8 207.1,166.8 209.9,166.8 212.7,166.8 215.5,166.8 218.2,166.8 221.0,166.8 223.8,166.8 226.6,166.8 229.4,166.8 232.2,166.8 235.0,166.8 237.8,166.8 240.6,166.8 243.3,166.8 246.1,166.8 248.9,166.8 251.7,166.8 254.5,166.8 257.3,166.8 260.1,166.8 262.9,166.8 265.7,166.8 268.5,166.8 271.2,166.8 274.0,166.8 276.8,166.8 279.6,166.8 282.4,166.8 285.2,166.8 288.0,166.8 290.8,166.8 293.6,166.8 296.4,166.8 299.1,166.8 301.9,166.8 304.7,166.8 307.5,166.8 310.3,166.8 313.1,166.8 315.9,166.8 318.7,166.8 321.5,166.8 324.3,166.8 327.1,166.8 329.8,166.8 332.6,166.8 335.4,166.8 338.2,166.8 341.0,166.8 343.8,165.7 346.6,164.6 349.4,163.5 352.2,162.4 354.9,161.3 357.7,160.2 360.5,159.1 363.3,158.0 366.1,156.9 368.9,155.8 371.7,154.7 374.5,153.6 377.3,152.5 380.1,151.4 382.8,150.3 385.6,149.2 388.4,148.1 391.2,147.0 394.0,145.9 396.8,144.8 399.6,143.7 402.4,142.6 405.2,141.5 408.0,140.4 410.8,139.3 413.5,138.2 416.3,137.1 419.1,136.0 421.9,134.9 424.7,133.8 427.5,132.7 430.3,131.6 433.1,130.5 435.9,129.4 438.7,128.3 441.4,127.2 444.2,126.1 447.0,125.0 449.8,123.9 452.6,122.8 455.4,121.7 458.2,120.6 461.0,119.5 463.8,118.4 466.6,117.3 469.3,116.2 472.1,115.1 474.9,114.0 477.7,112.9 480.5,111.8 483.3,110.7 486.1,109.6 488.9,108.5 491.7,107.4 494.4,106.3 497.2,105.2 500.0,104.1 502.8,103.0 505.6,101.9 508.4,100.8 511.2,99.7 514.0,98.6 516.8,97.5 519.6,96.4 522.3,95.3 525.1,94.2 527.9,93.1 530.7,92.0 533.5,90.9 536.3,89.8 539.1,88.7 541.9,87.6 544.7,86.5 547.5,85.4 550.2,84.3 553.0,83.2 555.8,82.1 558.6,81.0 561.4,79.9 564.2,78.8 567.0,77.7 569.8,76.6 572.6,75.5 575.4,74.4 578.1,73.3 580.9,72.2 583.7,71.1 586.5,70.0 589.3,68.9 592.1,67.8 594.9,66.7 597.7,65.6 600.5,64.5 603.3,63.4 606.0,62.3 608.8,61.2 611.6,60.1 614.4,59.0 617.2,57.9 620.0,56.8" fill="none" stroke="#2f6fdf" stroke-width="2.5"/>
<line x1="62" y1="334" x2="84" y2="334" stroke="#2f6fdf" stroke-width="3"/>
<text x="90" y="338" fill="currentColor">Long call K=2500 (pays 171.35)</text>
<polyline points="62.0,56.8 64.8,57.9 67.6,59.0 70.4,60.1 73.2,61.2 76.0,62.3 78.7,63.4 81.5,64.5 84.3,65.6 87.1,66.7 89.9,67.8 92.7,68.9 95.5,70.0 98.3,71.1 101.1,72.2 103.8,73.3 106.6,74.4 109.4,75.5 112.2,76.6 115.0,77.7 117.8,78.8 120.6,79.9 123.4,81.0 126.2,82.1 129.0,83.2 131.8,84.3 134.5,85.4 137.3,86.5 140.1,87.6 142.9,88.7 145.7,89.8 148.5,90.9 151.3,92.0 154.1,93.1 156.9,94.2 159.6,95.3 162.4,96.4 165.2,97.5 168.0,98.6 170.8,99.7 173.6,100.8 176.4,101.9 179.2,103.0 182.0,104.1 184.8,105.2 187.6,106.3 190.3,107.4 193.1,108.5 195.9,109.6 198.7,110.7 201.5,111.8 204.3,112.9 207.1,114.0 209.9,115.1 212.7,116.2 215.5,117.3 218.2,118.4 221.0,119.5 223.8,120.6 226.6,121.7 229.4,122.8 232.2,123.9 235.0,125.0 237.8,126.1 240.6,127.2 243.3,128.3 246.1,129.4 248.9,130.5 251.7,131.6 254.5,132.7 257.3,133.8 260.1,134.9 262.9,136.0 265.7,137.1 268.5,138.2 271.2,139.3 274.0,140.4 276.8,141.5 279.6,142.6 282.4,143.7 285.2,144.8 288.0,145.9 290.8,147.0 293.6,148.1 296.4,149.2 299.1,150.3 301.9,151.4 304.7,152.5 307.5,153.6 310.3,154.7 313.1,155.8 315.9,156.9 318.7,158.0 321.5,159.1 324.3,160.2 327.1,161.3 329.8,162.4 332.6,163.5 335.4,164.6 338.2,165.7 341.0,166.8 343.8,166.8 346.6,166.8 349.4,166.8 352.2,166.8 354.9,166.8 357.7,166.8 360.5,166.8 363.3,166.8 366.1,166.8 368.9,166.8 371.7,166.8 374.5,166.8 377.3,166.8 380.1,166.8 382.8,166.8 385.6,166.8 388.4,166.8 391.2,166.8 394.0,166.8 396.8,166.8 399.6,166.8 402.4,166.8 405.2,166.8 408.0,166.8 410.8,166.8 413.5,166.8 416.3,166.8 419.1,166.8 421.9,166.8 424.7,166.8 427.5,166.8 430.3,166.8 433.1,166.8 435.9,166.8 438.7,166.8 441.4,166.8 444.2,166.8 447.0,166.8 449.8,166.8 452.6,166.8 455.4,166.8 458.2,166.8 461.0,166.8 463.8,166.8 466.6,166.8 469.3,166.8 472.1,166.8 474.9,166.8 477.7,166.8 480.5,166.8 483.3,166.8 486.1,166.8 488.9,166.8 491.7,166.8 494.4,166.8 497.2,166.8 500.0,166.8 502.8,166.8 505.6,166.8 508.4,166.8 511.2,166.8 514.0,166.8 516.8,166.8 519.6,166.8 522.3,166.8 525.1,166.8 527.9,166.8 530.7,166.8 533.5,166.8 536.3,166.8 539.1,166.8 541.9,166.8 544.7,166.8 547.5,166.8 550.2,166.8 553.0,166.8 555.8,166.8 558.6,166.8 561.4,166.8 564.2,166.8 567.0,166.8 569.8,166.8 572.6,166.8 575.4,166.8 578.1,166.8 580.9,166.8 583.7,166.8 586.5,166.8 589.3,166.8 592.1,166.8 594.9,166.8 597.7,166.8 600.5,166.8 603.3,166.8 606.0,166.8 608.8,166.8 611.6,166.8 614.4,166.8 617.2,166.8 620.0,166.8" fill="none" stroke="#d9534f" stroke-width="2.5"/>
<line x1="352" y1="334" x2="374" y2="334" stroke="#d9534f" stroke-width="3"/>
<text x="380" y="338" fill="currentColor">Long put K=2500 (pays 171.35)</text>
<polyline points="62.0,129.2 64.8,129.2 67.6,129.2 70.4,129.2 73.2,129.2 76.0,129.2 78.7,129.2 81.5,129.2 84.3,129.2 87.1,129.2 89.9,129.2 92.7,129.2 95.5,129.2 98.3,129.2 101.1,129.2 103.8,129.2 106.6,129.2 109.4,129.2 112.2,129.2 115.0,129.2 117.8,129.2 120.6,129.2 123.4,129.2 126.2,129.2 129.0,129.2 131.8,129.2 134.5,129.2 137.3,129.2 140.1,129.2 142.9,129.2 145.7,129.2 148.5,129.2 151.3,129.2 154.1,129.2 156.9,129.2 159.6,129.2 162.4,129.2 165.2,129.2 168.0,129.2 170.8,129.2 173.6,129.2 176.4,129.2 179.2,129.2 182.0,129.2 184.8,129.2 187.6,129.2 190.3,129.2 193.1,129.2 195.9,129.2 198.7,129.2 201.5,129.2 204.3,129.2 207.1,129.2 209.9,129.2 212.7,129.2 215.5,129.2 218.2,129.2 221.0,129.2 223.8,129.2 226.6,129.2 229.4,129.2 232.2,129.2 235.0,129.2 237.8,129.2 240.6,129.2 243.3,129.2 246.1,129.2 248.9,129.2 251.7,129.2 254.5,129.2 257.3,129.2 260.1,129.2 262.9,129.2 265.7,129.2 268.5,129.2 271.2,129.2 274.0,129.2 276.8,129.2 279.6,129.2 282.4,129.2 285.2,129.2 288.0,129.2 290.8,129.2 293.6,129.2 296.4,129.2 299.1,129.2 301.9,129.2 304.7,129.2 307.5,129.2 310.3,129.2 313.1,129.2 315.9,129.2 318.7,129.2 321.5,129.2 324.3,129.2 327.1,129.2 329.8,129.2 332.6,129.2 335.4,129.2 338.2,129.2 341.0,129.2 343.8,130.3 346.6,131.4 349.4,132.5 352.2,133.6 354.9,134.7 357.7,135.8 360.5,136.9 363.3,138.0 366.1,139.1 368.9,140.2 371.7,141.3 374.5,142.4 377.3,143.5 380.1,144.6 382.8,145.7 385.6,146.8 388.4,147.9 391.2,149.0 394.0,150.1 396.8,151.2 399.6,152.3 402.4,153.4 405.2,154.5 408.0,155.6 410.8,156.7 413.5,157.8 416.3,158.9 419.1,160.0 421.9,161.1 424.7,162.2 427.5,163.3 430.3,164.4 433.1,165.5 435.9,166.6 438.7,167.7 441.4,168.8 444.2,169.9 447.0,171.0 449.8,172.1 452.6,173.2 455.4,174.3 458.2,175.4 461.0,176.5 463.8,177.6 466.6,178.7 469.3,179.8 472.1,180.9 474.9,182.0 477.7,183.1 480.5,184.2 483.3,185.3 486.1,186.4 488.9,187.5 491.7,188.6 494.4,189.7 497.2,190.8 500.0,191.9 502.8,193.0 505.6,194.1 508.4,195.2 511.2,196.3 514.0,197.4 516.8,198.5 519.6,199.6 522.3,200.7 525.1,201.8 527.9,202.9 530.7,204.0 533.5,205.1 536.3,206.2 539.1,207.3 541.9,208.4 544.7,209.5 547.5,210.6 550.2,211.7 553.0,212.8 555.8,213.9 558.6,215.0 561.4,216.1 564.2,217.2 567.0,218.3 569.8,219.4 572.6,220.5 575.4,221.6 578.1,222.7 580.9,223.8 583.7,224.9 586.5,226.0 589.3,227.1 592.1,228.2 594.9,229.3 597.7,230.4 600.5,231.5 603.3,232.6 606.0,233.7 608.8,234.8 611.6,235.9 614.4,237.0 617.2,238.1 620.0,239.2" fill="none" stroke="#2f6fdf" stroke-width="2.5" stroke-dasharray="6 5"/>
<line x1="62" y1="356" x2="84" y2="356" stroke="#2f6fdf" stroke-width="3" stroke-dasharray="6 5"/>
<text x="90" y="360" fill="currentColor">Short call K=2500 (gets 171.35)</text>
<polyline points="62.0,258.0 64.8,256.9 67.6,255.8 70.4,254.7 73.2,253.6 76.0,252.5 78.7,251.4 81.5,250.3 84.3,249.2 87.1,248.1 89.9,247.0 92.7,245.9 95.5,244.8 98.3,243.7 101.1,242.6 103.8,241.5 106.6,240.4 109.4,239.3 112.2,238.2 115.0,237.1 117.8,236.0 120.6,234.9 123.4,233.8 126.2,232.7 129.0,231.6 131.8,230.5 134.5,229.4 137.3,228.3 140.1,227.2 142.9,226.1 145.7,225.0 148.5,223.9 151.3,222.8 154.1,221.7 156.9,220.6 159.6,219.5 162.4,218.4 165.2,217.3 168.0,216.2 170.8,215.1 173.6,214.0 176.4,212.9 179.2,211.8 182.0,210.7 184.8,209.6 187.6,208.5 190.3,207.4 193.1,206.3 195.9,205.2 198.7,204.1 201.5,203.0 204.3,201.9 207.1,200.8 209.9,199.7 212.7,198.6 215.5,197.5 218.2,196.4 221.0,195.3 223.8,194.2 226.6,193.1 229.4,192.0 232.2,190.9 235.0,189.8 237.8,188.7 240.6,187.6 243.3,186.5 246.1,185.4 248.9,184.3 251.7,183.2 254.5,182.1 257.3,181.0 260.1,179.9 262.9,178.8 265.7,177.7 268.5,176.6 271.2,175.5 274.0,174.4 276.8,173.3 279.6,172.2 282.4,171.1 285.2,170.0 288.0,168.9 290.8,167.8 293.6,166.7 296.4,165.6 299.1,164.5 301.9,163.4 304.7,162.3 307.5,161.2 310.3,160.1 313.1,159.0 315.9,157.9 318.7,156.8 321.5,155.7 324.3,154.6 327.1,153.5 329.8,152.4 332.6,151.3 335.4,150.2 338.2,149.1 341.0,148.0 343.8,146.9 346.6,145.8 349.4,144.7 352.2,143.6 354.9,142.5 357.7,141.4 360.5,140.3 363.3,139.2 366.1,138.1 368.9,137.0 371.7,135.9 374.5,134.8 377.3,133.7 380.1,132.6 382.8,131.5 385.6,130.4 388.4,129.3 391.2,128.2 394.0,127.1 396.8,126.0 399.6,124.9 402.4,123.8 405.2,122.7 408.0,121.6 410.8,120.5 413.5,119.4 416.3,118.3 419.1,117.2 421.9,116.1 424.7,115.0 427.5,113.9 430.3,112.8 433.1,111.7 435.9,110.6 438.7,109.5 441.4,108.4 444.2,107.3 447.0,106.2 449.8,105.1 452.6,104.0 455.4,102.9 458.2,101.8 461.0,100.7 463.8,99.6 466.6,98.5 469.3,97.4 472.1,96.3 474.9,95.2 477.7,94.1 480.5,93.0 483.3,91.9 486.1,90.8 488.9,89.7 491.7,88.6 494.4,87.5 497.2,86.4 500.0,85.3 502.8,84.2 505.6,83.1 508.4,82.0 511.2,80.9 514.0,79.8 516.8,78.7 519.6,77.6 522.3,76.5 525.1,75.4 527.9,74.3 530.7,73.2 533.5,72.1 536.3,71.0 539.1,69.9 541.9,68.8 544.7,67.7 547.5,66.6 550.2,65.5 553.0,64.4 555.8,63.3 558.6,62.2 561.4,61.1 564.2,60.0 567.0,58.9 569.8,57.8 572.6,56.7 575.4,55.6 578.1,54.5 580.9,53.4 583.7,52.3 586.5,51.2 589.3,50.1 592.1,49.0 594.9,47.9 597.7,46.8 600.5,45.7 603.3,44.6 606.0,43.5 608.8,42.4 611.6,41.3 614.4,40.2 617.2,39.1 620.0,38.0" fill="none" stroke="#888" stroke-width="2.5" stroke-dasharray="2 4"/>
<line x1="352" y1="356" x2="374" y2="356" stroke="#888" stroke-width="3" stroke-dasharray="2 4"/>
<text x="380" y="360" fill="currentColor">Long spot (bought at 2500)</text>
</svg>
```

Fig. 1 shows three points:
- A long call loses at most $171.35, with uncapped upside. Its break-even is 2671.35, not 2500.
- A long put is a long option position, but it earns money when price falls.
- A short call earns at most $171.35, and its loss on a rally has no cap [1].

**Alice's four choices**: she holds 1 ETH and can reshape her payoff with options (Fig. 2).

```svg
<svg viewBox="0 0 640 378" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PnL at expiry of common structures" style="width:100%;height:auto;font-family:system-ui,sans-serif;font-size:13px">
<line x1="62" y1="280.0" x2="620" y2="280.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="284.0" text-anchor="end" fill="currentColor">-1000</text>
<line x1="62" y1="247.0" x2="620" y2="247.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="251.0" text-anchor="end" fill="currentColor">-750</text>
<line x1="62" y1="214.0" x2="620" y2="214.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="218.0" text-anchor="end" fill="currentColor">-500</text>
<line x1="62" y1="181.0" x2="620" y2="181.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="185.0" text-anchor="end" fill="currentColor">-250</text>
<line x1="62" y1="148.0" x2="620" y2="148.0" stroke="#999" stroke-opacity="0.8"/>
<text x="56" y="152.0" text-anchor="end" fill="currentColor">0</text>
<line x1="62" y1="115.0" x2="620" y2="115.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="119.0" text-anchor="end" fill="currentColor">+250</text>
<line x1="62" y1="82.0" x2="620" y2="82.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="86.0" text-anchor="end" fill="currentColor">+500</text>
<line x1="62" y1="49.0" x2="620" y2="49.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="53.0" text-anchor="end" fill="currentColor">+750</text>
<line x1="62" y1="16.0" x2="620" y2="16.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="20.0" text-anchor="end" fill="currentColor">+1000</text>
<line x1="62.0" y1="16" x2="62.0" y2="280" stroke="#999" stroke-opacity="0.15"/>
<text x="62.0" y="298" text-anchor="middle" fill="currentColor">1500</text>
<line x1="201.5" y1="16" x2="201.5" y2="280" stroke="#999" stroke-opacity="0.15"/>
<text x="201.5" y="298" text-anchor="middle" fill="currentColor">2000</text>
<line x1="341.0" y1="16" x2="341.0" y2="280" stroke="#999" stroke-opacity="0.15"/>
<text x="341.0" y="298" text-anchor="middle" fill="currentColor">2500</text>
<line x1="480.5" y1="16" x2="480.5" y2="280" stroke="#999" stroke-opacity="0.15"/>
<text x="480.5" y="298" text-anchor="middle" fill="currentColor">3000</text>
<line x1="620.0" y1="16" x2="620.0" y2="280" stroke="#999" stroke-opacity="0.15"/>
<text x="620.0" y="298" text-anchor="middle" fill="currentColor">3500</text>
<text x="341.0" y="316" text-anchor="middle" fill="currentColor" opacity="0.7">ETH price at expiry (USD)</text>
<polyline points="62.0,170.6 64.8,170.6 67.6,170.6 70.4,170.6 73.2,170.6 76.0,170.6 78.7,170.6 81.5,170.6 84.3,170.6 87.1,170.6 89.9,170.6 92.7,170.6 95.5,170.6 98.3,170.6 101.1,170.6 103.8,170.6 106.6,170.6 109.4,170.6 112.2,170.6 115.0,170.6 117.8,170.6 120.6,170.6 123.4,170.6 126.2,170.6 129.0,170.6 131.8,170.6 134.5,170.6 137.3,170.6 140.1,170.6 142.9,170.6 145.7,170.6 148.5,170.6 151.3,170.6 154.1,170.6 156.9,170.6 159.6,170.6 162.4,170.6 165.2,170.6 168.0,170.6 170.8,170.6 173.6,170.6 176.4,170.6 179.2,170.6 182.0,170.6 184.8,170.6 187.6,170.6 190.3,170.6 193.1,170.6 195.9,170.6 198.7,170.6 201.5,170.6 204.3,170.6 207.1,170.6 209.9,170.6 212.7,170.6 215.5,170.6 218.2,170.6 221.0,170.6 223.8,170.6 226.6,170.6 229.4,170.6 232.2,170.6 235.0,170.6 237.8,170.6 240.6,170.6 243.3,170.6 246.1,170.6 248.9,170.6 251.7,170.6 254.5,170.6 257.3,170.6 260.1,170.6 262.9,170.6 265.7,170.6 268.5,170.6 271.2,170.6 274.0,170.6 276.8,170.6 279.6,170.6 282.4,170.6 285.2,170.6 288.0,170.6 290.8,170.6 293.6,170.6 296.4,170.6 299.1,170.6 301.9,170.6 304.7,170.6 307.5,170.6 310.3,170.6 313.1,170.6 315.9,170.6 318.7,170.6 321.5,170.6 324.3,170.6 327.1,170.6 329.8,170.6 332.6,170.6 335.4,170.6 338.2,170.6 341.0,170.6 343.8,169.3 346.6,168.0 349.4,166.7 352.2,165.3 354.9,164.0 357.7,162.7 360.5,161.4 363.3,160.1 366.1,158.7 368.9,157.4 371.7,156.1 374.5,154.8 377.3,153.5 380.1,152.1 382.8,150.8 385.6,149.5 388.4,148.2 391.2,146.9 394.0,145.5 396.8,144.2 399.6,142.9 402.4,141.6 405.2,140.3 408.0,138.9 410.8,137.6 413.5,136.3 416.3,135.0 419.1,133.7 421.9,132.3 424.7,131.0 427.5,129.7 430.3,128.4 433.1,127.1 435.9,125.7 438.7,124.4 441.4,123.1 444.2,121.8 447.0,120.5 449.8,119.1 452.6,117.8 455.4,116.5 458.2,115.2 461.0,113.9 463.8,112.5 466.6,111.2 469.3,109.9 472.1,108.6 474.9,107.3 477.7,105.9 480.5,104.6 483.3,103.3 486.1,102.0 488.9,100.7 491.7,99.3 494.4,98.0 497.2,96.7 500.0,95.4 502.8,94.1 505.6,92.7 508.4,91.4 511.2,90.1 514.0,88.8 516.8,87.5 519.6,86.1 522.3,84.8 525.1,83.5 527.9,82.2 530.7,80.9 533.5,79.5 536.3,78.2 539.1,76.9 541.9,75.6 544.7,74.3 547.5,72.9 550.2,71.6 553.0,70.3 555.8,69.0 558.6,67.7 561.4,66.3 564.2,65.0 567.0,63.7 569.8,62.4 572.6,61.1 575.4,59.7 578.1,58.4 580.9,57.1 583.7,55.8 586.5,54.5 589.3,53.1 592.1,51.8 594.9,50.5 597.7,49.2 600.5,47.9 603.3,46.5 606.0,45.2 608.8,43.9 611.6,42.6 614.4,41.3 617.2,39.9 620.0,38.6" fill="none" stroke="#2f6fdf" stroke-width="2.5"/>
<line x1="62" y1="334" x2="84" y2="334" stroke="#2f6fdf" stroke-width="3"/>
<text x="90" y="338" fill="currentColor">Protective put: spot + long P2500</text>
<polyline points="62.0,269.2 64.8,267.9 67.6,266.6 70.4,265.2 73.2,263.9 76.0,262.6 78.7,261.3 81.5,260.0 84.3,258.6 87.1,257.3 89.9,256.0 92.7,254.7 95.5,253.4 98.3,252.0 101.1,250.7 103.8,249.4 106.6,248.1 109.4,246.8 112.2,245.4 115.0,244.1 117.8,242.8 120.6,241.5 123.4,240.2 126.2,238.8 129.0,237.5 131.8,236.2 134.5,234.9 137.3,233.6 140.1,232.2 142.9,230.9 145.7,229.6 148.5,228.3 151.3,227.0 154.1,225.6 156.9,224.3 159.6,223.0 162.4,221.7 165.2,220.4 168.0,219.0 170.8,217.7 173.6,216.4 176.4,215.1 179.2,213.8 182.0,212.4 184.8,211.1 187.6,209.8 190.3,208.5 193.1,207.2 195.9,205.8 198.7,204.5 201.5,203.2 204.3,201.9 207.1,200.6 209.9,199.2 212.7,197.9 215.5,196.6 218.2,195.3 221.0,194.0 223.8,192.6 226.6,191.3 229.4,190.0 232.2,188.7 235.0,187.4 237.8,186.0 240.6,184.7 243.3,183.4 246.1,182.1 248.9,180.8 251.7,179.4 254.5,178.1 257.3,176.8 260.1,175.5 262.9,174.2 265.7,172.8 268.5,171.5 271.2,170.2 274.0,168.9 276.8,167.6 279.6,166.2 282.4,164.9 285.2,163.6 288.0,162.3 290.8,161.0 293.6,159.6 296.4,158.3 299.1,157.0 301.9,155.7 304.7,154.4 307.5,153.0 310.3,151.7 313.1,150.4 315.9,149.1 318.7,147.8 321.5,146.4 324.3,145.1 327.1,143.8 329.8,142.5 332.6,141.2 335.4,139.8 338.2,138.5 341.0,137.2 343.8,135.9 346.6,134.6 349.4,133.2 352.2,131.9 354.9,130.6 357.7,129.3 360.5,128.0 363.3,126.6 366.1,125.3 368.9,124.0 371.7,122.7 374.5,121.4 377.3,120.0 380.1,118.7 382.8,117.4 385.6,116.1 388.4,114.8 391.2,113.4 394.0,112.1 396.8,110.8 399.6,109.5 402.4,108.2 405.2,106.8 408.0,105.5 410.8,104.2 413.5,104.2 416.3,104.2 419.1,104.2 421.9,104.2 424.7,104.2 427.5,104.2 430.3,104.2 433.1,104.2 435.9,104.2 438.7,104.2 441.4,104.2 444.2,104.2 447.0,104.2 449.8,104.2 452.6,104.2 455.4,104.2 458.2,104.2 461.0,104.2 463.8,104.2 466.6,104.2 469.3,104.2 472.1,104.2 474.9,104.2 477.7,104.2 480.5,104.2 483.3,104.2 486.1,104.2 488.9,104.2 491.7,104.2 494.4,104.2 497.2,104.2 500.0,104.2 502.8,104.2 505.6,104.2 508.4,104.2 511.2,104.2 514.0,104.2 516.8,104.2 519.6,104.2 522.3,104.2 525.1,104.2 527.9,104.2 530.7,104.2 533.5,104.2 536.3,104.2 539.1,104.2 541.9,104.2 544.7,104.2 547.5,104.2 550.2,104.2 553.0,104.2 555.8,104.2 558.6,104.2 561.4,104.2 564.2,104.2 567.0,104.2 569.8,104.2 572.6,104.2 575.4,104.2 578.1,104.2 580.9,104.2 583.7,104.2 586.5,104.2 589.3,104.2 592.1,104.2 594.9,104.2 597.7,104.2 600.5,104.2 603.3,104.2 606.0,104.2 608.8,104.2 611.6,104.2 614.4,104.2 617.2,104.2 620.0,104.2" fill="none" stroke="#d9534f" stroke-width="2.5"/>
<line x1="352" y1="334" x2="374" y2="334" stroke="#d9534f" stroke-width="3"/>
<text x="380" y="338" fill="currentColor">Covered call: spot − C2750</text>
<polyline points="62.0,179.1 64.8,179.1 67.6,179.1 70.4,179.1 73.2,179.1 76.0,179.1 78.7,179.1 81.5,179.1 84.3,179.1 87.1,179.1 89.9,179.1 92.7,179.1 95.5,179.1 98.3,179.1 101.1,179.1 103.8,179.1 106.6,179.1 109.4,179.1 112.2,179.1 115.0,179.1 117.8,179.1 120.6,179.1 123.4,179.1 126.2,179.1 129.0,179.1 131.8,179.1 134.5,179.1 137.3,179.1 140.1,179.1 142.9,179.1 145.7,179.1 148.5,179.1 151.3,179.1 154.1,179.1 156.9,179.1 159.6,179.1 162.4,179.1 165.2,179.1 168.0,179.1 170.8,179.1 173.6,179.1 176.4,179.1 179.2,179.1 182.0,179.1 184.8,179.1 187.6,179.1 190.3,179.1 193.1,179.1 195.9,179.1 198.7,179.1 201.5,179.1 204.3,179.1 207.1,179.1 209.9,179.1 212.7,179.1 215.5,179.1 218.2,179.1 221.0,179.1 223.8,179.1 226.6,179.1 229.4,179.1 232.2,179.1 235.0,179.1 237.8,179.1 240.6,179.1 243.3,179.1 246.1,179.1 248.9,179.1 251.7,179.1 254.5,179.1 257.3,179.1 260.1,179.1 262.9,179.1 265.7,179.1 268.5,179.1 271.2,179.1 274.0,177.8 276.8,176.5 279.6,175.1 282.4,173.8 285.2,172.5 288.0,171.2 290.8,169.9 293.6,168.5 296.4,167.2 299.1,165.9 301.9,164.6 304.7,163.3 307.5,161.9 310.3,160.6 313.1,159.3 315.9,158.0 318.7,156.7 321.5,155.3 324.3,154.0 327.1,152.7 329.8,151.4 332.6,150.1 335.4,148.7 338.2,147.4 341.0,146.1 343.8,144.8 346.6,143.5 349.4,142.1 352.2,140.8 354.9,139.5 357.7,138.2 360.5,136.9 363.3,135.5 366.1,134.2 368.9,132.9 371.7,131.6 374.5,130.3 377.3,128.9 380.1,127.6 382.8,126.3 385.6,125.0 388.4,123.7 391.2,122.3 394.0,121.0 396.8,119.7 399.6,118.4 402.4,117.1 405.2,115.7 408.0,114.4 410.8,113.1 413.5,113.1 416.3,113.1 419.1,113.1 421.9,113.1 424.7,113.1 427.5,113.1 430.3,113.1 433.1,113.1 435.9,113.1 438.7,113.1 441.4,113.1 444.2,113.1 447.0,113.1 449.8,113.1 452.6,113.1 455.4,113.1 458.2,113.1 461.0,113.1 463.8,113.1 466.6,113.1 469.3,113.1 472.1,113.1 474.9,113.1 477.7,113.1 480.5,113.1 483.3,113.1 486.1,113.1 488.9,113.1 491.7,113.1 494.4,113.1 497.2,113.1 500.0,113.1 502.8,113.1 505.6,113.1 508.4,113.1 511.2,113.1 514.0,113.1 516.8,113.1 519.6,113.1 522.3,113.1 525.1,113.1 527.9,113.1 530.7,113.1 533.5,113.1 536.3,113.1 539.1,113.1 541.9,113.1 544.7,113.1 547.5,113.1 550.2,113.1 553.0,113.1 555.8,113.1 558.6,113.1 561.4,113.1 564.2,113.1 567.0,113.1 569.8,113.1 572.6,113.1 575.4,113.1 578.1,113.1 580.9,113.1 583.7,113.1 586.5,113.1 589.3,113.1 592.1,113.1 594.9,113.1 597.7,113.1 600.5,113.1 603.3,113.1 606.0,113.1 608.8,113.1 611.6,113.1 614.4,113.1 617.2,113.1 620.0,113.1" fill="none" stroke="#2a9d5b" stroke-width="2.5"/>
<line x1="62" y1="356" x2="84" y2="356" stroke="#2a9d5b" stroke-width="3"/>
<text x="90" y="360" fill="currentColor">Collar: spot + P2250 − C2750</text>
<polyline points="62.0,159.8 64.8,159.8 67.6,159.8 70.4,159.8 73.2,159.8 76.0,159.8 78.7,159.8 81.5,159.8 84.3,159.8 87.1,159.8 89.9,159.8 92.7,159.8 95.5,159.8 98.3,159.8 101.1,159.8 103.8,159.8 106.6,159.8 109.4,159.8 112.2,159.8 115.0,159.8 117.8,159.8 120.6,159.8 123.4,159.8 126.2,159.8 129.0,159.8 131.8,159.8 134.5,159.8 137.3,159.8 140.1,159.8 142.9,159.8 145.7,159.8 148.5,159.8 151.3,159.8 154.1,159.8 156.9,159.8 159.6,159.8 162.4,159.8 165.2,159.8 168.0,159.8 170.8,159.8 173.6,159.8 176.4,159.8 179.2,159.8 182.0,159.8 184.8,159.8 187.6,159.8 190.3,159.8 193.1,159.8 195.9,159.8 198.7,159.8 201.5,159.8 204.3,159.8 207.1,159.8 209.9,159.8 212.7,159.8 215.5,159.8 218.2,159.8 221.0,159.8 223.8,159.8 226.6,159.8 229.4,159.8 232.2,159.8 235.0,159.8 237.8,159.8 240.6,159.8 243.3,159.8 246.1,159.8 248.9,159.8 251.7,159.8 254.5,159.8 257.3,159.8 260.1,159.8 262.9,159.8 265.7,159.8 268.5,159.8 271.2,159.8 274.0,159.8 276.8,159.8 279.6,159.8 282.4,159.8 285.2,159.8 288.0,159.8 290.8,159.8 293.6,159.8 296.4,159.8 299.1,159.8 301.9,159.8 304.7,159.8 307.5,159.8 310.3,159.8 313.1,159.8 315.9,159.8 318.7,159.8 321.5,159.8 324.3,159.8 327.1,159.8 329.8,159.8 332.6,159.8 335.4,159.8 338.2,159.8 341.0,159.8 343.8,158.5 346.6,157.2 349.4,155.9 352.2,154.5 354.9,153.2 357.7,151.9 360.5,150.6 363.3,149.3 366.1,147.9 368.9,146.6 371.7,145.3 374.5,144.0 377.3,142.7 380.1,141.3 382.8,140.0 385.6,138.7 388.4,137.4 391.2,136.1 394.0,134.7 396.8,133.4 399.6,132.1 402.4,130.8 405.2,129.5 408.0,128.1 410.8,126.8 413.5,126.8 416.3,126.8 419.1,126.8 421.9,126.8 424.7,126.8 427.5,126.8 430.3,126.8 433.1,126.8 435.9,126.8 438.7,126.8 441.4,126.8 444.2,126.8 447.0,126.8 449.8,126.8 452.6,126.8 455.4,126.8 458.2,126.8 461.0,126.8 463.8,126.8 466.6,126.8 469.3,126.8 472.1,126.8 474.9,126.8 477.7,126.8 480.5,126.8 483.3,126.8 486.1,126.8 488.9,126.8 491.7,126.8 494.4,126.8 497.2,126.8 500.0,126.8 502.8,126.8 505.6,126.8 508.4,126.8 511.2,126.8 514.0,126.8 516.8,126.8 519.6,126.8 522.3,126.8 525.1,126.8 527.9,126.8 530.7,126.8 533.5,126.8 536.3,126.8 539.1,126.8 541.9,126.8 544.7,126.8 547.5,126.8 550.2,126.8 553.0,126.8 555.8,126.8 558.6,126.8 561.4,126.8 564.2,126.8 567.0,126.8 569.8,126.8 572.6,126.8 575.4,126.8 578.1,126.8 580.9,126.8 583.7,126.8 586.5,126.8 589.3,126.8 592.1,126.8 594.9,126.8 597.7,126.8 600.5,126.8 603.3,126.8 606.0,126.8 608.8,126.8 611.6,126.8 614.4,126.8 617.2,126.8 620.0,126.8" fill="none" stroke="#c98a00" stroke-width="2.5" stroke-dasharray="6 5"/>
<line x1="352" y1="356" x2="374" y2="356" stroke="#c98a00" stroke-width="3" stroke-dasharray="6 5"/>
<text x="380" y="360" fill="currentColor">Bull call spread 2500/2750</text>
</svg>
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
<svg viewBox="0 0 640 378" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Option value = intrinsic + time value" style="width:100%;height:auto;font-family:system-ui,sans-serif;font-size:13px">
<line x1="62" y1="280.0" x2="620" y2="280.0" stroke="#999" stroke-opacity="0.8"/>
<text x="56" y="284.0" text-anchor="end" fill="currentColor">0</text>
<line x1="62" y1="236.0" x2="620" y2="236.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="240.0" text-anchor="end" fill="currentColor">+100</text>
<line x1="62" y1="192.0" x2="620" y2="192.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="196.0" text-anchor="end" fill="currentColor">+200</text>
<line x1="62" y1="148.0" x2="620" y2="148.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="152.0" text-anchor="end" fill="currentColor">+300</text>
<line x1="62" y1="104.0" x2="620" y2="104.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="108.0" text-anchor="end" fill="currentColor">+400</text>
<line x1="62" y1="60.0" x2="620" y2="60.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="64.0" text-anchor="end" fill="currentColor">+500</text>
<line x1="62" y1="16.0" x2="620" y2="16.0" stroke="#999" stroke-opacity="0.25"/>
<text x="56" y="20.0" text-anchor="end" fill="currentColor">+600</text>
<line x1="62.0" y1="16" x2="62.0" y2="280" stroke="#999" stroke-opacity="0.15"/>
<text x="62.0" y="298" text-anchor="middle" fill="currentColor">2000</text>
<line x1="341.0" y1="16" x2="341.0" y2="280" stroke="#999" stroke-opacity="0.15"/>
<text x="341.0" y="298" text-anchor="middle" fill="currentColor">2500</text>
<line x1="620.0" y1="16" x2="620.0" y2="280" stroke="#999" stroke-opacity="0.15"/>
<text x="620.0" y="298" text-anchor="middle" fill="currentColor">3000</text>
<text x="341.0" y="316" text-anchor="middle" fill="currentColor" opacity="0.7">ETH price (USD)</text>
<polyline points="62.0,280.0 67.6,280.0 73.2,280.0 78.7,280.0 84.3,280.0 89.9,280.0 95.5,280.0 101.1,280.0 106.6,280.0 112.2,280.0 117.8,280.0 123.4,280.0 129.0,280.0 134.5,280.0 140.1,280.0 145.7,280.0 151.3,280.0 156.9,280.0 162.4,280.0 168.0,280.0 173.6,280.0 179.2,280.0 184.8,280.0 190.3,280.0 195.9,280.0 201.5,280.0 207.1,280.0 212.7,280.0 218.2,280.0 223.8,280.0 229.4,280.0 235.0,280.0 240.6,280.0 246.1,280.0 251.7,280.0 257.3,280.0 262.9,280.0 268.5,280.0 274.0,280.0 279.6,280.0 285.2,280.0 290.8,280.0 296.4,280.0 301.9,280.0 307.5,280.0 313.1,280.0 318.7,280.0 324.3,280.0 329.8,280.0 335.4,280.0 341.0,280.0 346.6,275.6 352.2,271.2 357.7,266.8 363.3,262.4 368.9,258.0 374.5,253.6 380.1,249.2 385.6,244.8 391.2,240.4 396.8,236.0 402.4,231.6 408.0,227.2 413.5,222.8 419.1,218.4 424.7,214.0 430.3,209.6 435.9,205.2 441.4,200.8 447.0,196.4 452.6,192.0 458.2,187.6 463.8,183.2 469.3,178.8 474.9,174.4 480.5,170.0 486.1,165.6 491.7,161.2 497.2,156.8 502.8,152.4 508.4,148.0 514.0,143.6 519.6,139.2 525.1,134.8 530.7,130.4 536.3,126.0 541.9,121.6 547.5,117.2 553.0,112.8 558.6,108.4 564.2,104.0 569.8,99.6 575.4,95.2 580.9,90.8 586.5,86.4 592.1,82.0 597.7,77.6 603.3,73.2 608.8,68.8 614.4,64.4 620.0,60.0" fill="none" stroke="#888" stroke-width="2.5" stroke-dasharray="6 5"/>
<line x1="62" y1="334" x2="84" y2="334" stroke="#888" stroke-width="3" stroke-dasharray="6 5"/>
<text x="90" y="338" fill="currentColor">Payoff at expiry max(S−2500,0)</text>
<polyline points="62.0,272.3 67.6,271.8 73.2,271.2 78.7,270.7 84.3,270.1 89.9,269.5 95.5,268.8 101.1,268.1 106.6,267.4 112.2,266.7 117.8,266.0 123.4,265.2 129.0,264.3 134.5,263.5 140.1,262.6 145.7,261.7 151.3,260.7 156.9,259.7 162.4,258.7 168.0,257.6 173.6,256.5 179.2,255.3 184.8,254.2 190.3,252.9 195.9,251.7 201.5,250.4 207.1,249.1 212.7,247.7 218.2,246.3 223.8,244.8 229.4,243.3 235.0,241.8 240.6,240.2 246.1,238.6 251.7,236.9 257.3,235.2 262.9,233.5 268.5,231.7 274.0,229.8 279.6,228.0 285.2,226.0 290.8,224.1 296.4,222.1 301.9,220.1 307.5,218.0 313.1,215.8 318.7,213.7 324.3,211.5 329.8,209.2 335.4,206.9 341.0,204.6 346.6,202.2 352.2,199.8 357.7,197.4 363.3,194.9 368.9,192.3 374.5,189.8 380.1,187.2 385.6,184.5 391.2,181.8 396.8,179.1 402.4,176.4 408.0,173.6 413.5,170.7 419.1,167.9 424.7,164.9 430.3,162.0 435.9,159.0 441.4,156.0 447.0,153.0 452.6,149.9 458.2,146.8 463.8,143.6 469.3,140.5 474.9,137.3 480.5,134.0 486.1,130.8 491.7,127.5 497.2,124.1 502.8,120.8 508.4,117.4 514.0,114.0 519.6,110.6 525.1,107.1 530.7,103.6 536.3,100.1 541.9,96.5 547.5,93.0 553.0,89.4 558.6,85.8 564.2,82.1 569.8,78.5 575.4,74.8 580.9,71.1 586.5,67.4 592.1,63.6 597.7,59.9 603.3,56.1 608.8,52.3 614.4,48.5 620.0,44.6" fill="none" stroke="#2f6fdf" stroke-width="2.5"/>
<line x1="352" y1="334" x2="374" y2="334" stroke="#2f6fdf" stroke-width="3"/>
<text x="380" y="338" fill="currentColor">Call value with 30 days left</text>
<polyline points="62.0,279.9 67.6,279.9 73.2,279.9 78.7,279.8 84.3,279.8 89.9,279.8 95.5,279.7 101.1,279.7 106.6,279.6 112.2,279.5 117.8,279.5 123.4,279.4 129.0,279.3 134.5,279.1 140.1,279.0 145.7,278.8 151.3,278.7 156.9,278.5 162.4,278.2 168.0,278.0 173.6,277.7 179.2,277.4 184.8,277.0 190.3,276.7 195.9,276.2 201.5,275.8 207.1,275.3 212.7,274.7 218.2,274.1 223.8,273.5 229.4,272.7 235.0,272.0 240.6,271.2 246.1,270.3 251.7,269.3 257.3,268.3 262.9,267.2 268.5,266.0 274.0,264.8 279.6,263.4 285.2,262.1 290.8,260.6 296.4,259.0 301.9,257.4 307.5,255.7 313.1,253.9 318.7,252.0 324.3,250.0 329.8,247.9 335.4,245.8 341.0,243.5 346.6,241.2 352.2,238.8 357.7,236.4 363.3,233.8 368.9,231.1 374.5,228.4 380.1,225.6 385.6,222.7 391.2,219.8 396.8,216.8 402.4,213.7 408.0,210.5 413.5,207.3 419.1,204.0 424.7,200.6 430.3,197.2 435.9,193.7 441.4,190.1 447.0,186.6 452.6,182.9 458.2,179.2 463.8,175.5 469.3,171.7 474.9,167.9 480.5,164.0 486.1,160.1 491.7,156.2 497.2,152.2 502.8,148.2 508.4,144.2 514.0,140.1 519.6,136.0 525.1,131.9 530.7,127.8 536.3,123.6 541.9,119.4 547.5,115.2 553.0,111.0 558.6,106.8 564.2,102.5 569.8,98.3 575.4,94.0 580.9,89.7 586.5,85.4 592.1,81.1 597.7,76.8 603.3,72.5 608.8,68.2 614.4,63.8 620.0,59.5" fill="none" stroke="#2a9d5b" stroke-width="2.5"/>
<line x1="62" y1="356" x2="84" y2="356" stroke="#2a9d5b" stroke-width="3"/>
<text x="90" y="360" fill="currentColor">Call value with 7 days left</text>
</svg>
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

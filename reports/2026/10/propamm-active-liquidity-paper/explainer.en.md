---
template: research
title: PropAMM Paper Reading: Active Liquidity On Chain (arXiv 2609.38056)
subtitle: Two seconds post-trade, propAMMs earn +0.37 to +1.69 bps while passive AMMs lose -0.22 to -2.06 bps. Four mechanisms drive this advantage, with users bearing the cost of spoofing.
cols: 4
type: Paper Reading · Research Explainer
audience: Spot execution developers and product leads on Mantle (Fluxion RFQ, PropAMM, JIT Router, Sequencer)
scope: Paper body and Appendices A–G; Base on-chain sampling of two blocks; design implications for Mantle Router and propAMM
evidence: Paper v1 · Reports from 0x / Jump / Helius / Fuller · Base RPC measurements (2026-10-04)
date: 2026-10-04 · v1
---
Bottom line: This paper is not a SoK. It is the first empirical evaluation covering 3 chains and 1 full year of [[propAMM]] data, completely reverse-engineering the closed-source Tessera contract logic on Base. Core conclusion: propAMM [[markout]] is positive while passive AMM markout is negative ([F1](#F1)). The competitive edge stems from four mechanisms: low-cost price updates, counterparty-aware pricing, winning cross-venue arbitrage, and [[spoofing]] ([F2](#F2)–[F6](#F6)). For Mantle, the most critical takeaways are [F6](#F6) and [Implications for Mantle](#panel-M).

## A Questions Answered by the Paper {sheet meta="3 + 1"}
```tree list
`Q1` Does propAMM earn more than passive AMMs? | §6 Markout analysis
`Q2` Where does the advantage originate? | §7 Four mechanisms
`Q3` Do retail traders lose out? | §8 Calm trades
`+` How does Tessera quote and price? | §2.2 + Appendices C, D
```

## B Key Metrics {sheet span=2 meta="bps · 2 seconds post-trade"}
| Metric | Solana | Base | Monad |
|---|---|---|---|
| propAMM markout | ok +0.37 | ok +1.19 | ok +1.69 |
| AMM markout | no −0.22 | no −0.62 | no −2.06 |
| Retail execution cost on propAMM | 0.26 | 1.26 | 1.62 |
| Retail execution cost on AMM | 2.59 | 1.38 | 8.60 |

## C Who Bears the Cost of the Advantage {sheet meta="§7"}
| Advantage Source | Cost Bearer |
|---|---|
| Low-cost quote updates | ok Arbitrageurs earn less |
| Counterparty-aware pricing | warn Non-aggregator orderflow |
| Winning cross-venue arbitrage | warn LPs in stale-price AMMs |
| Spoofing | no Users routed via quote snapshots |

## D Tessera Execution Formula {sheet span=2 meta="Appendix C"}
```annot
# Output of a swap | Penalties deducted after walking the price ladder
[Y_exec]{User receives} = [Y_book(x)]{Traverse two price ladders} × (1 − [Φ]{!Total penalty: Σϕ / 10⁶})
> Φ = (base + age + priority + mode + default + address) / 10⁶. Volume-weighted nominal fee is 0.44 bps, rising to 1.95 bps with penalties.
```

## E Evolution Timeline {sheet span=2 meta="2024–2026"}
```timeline
2024-11 | SolFi | Solana propAMM volume accelerates
2025-07 | Base Flashblocks | 200 ms sub-blocks activated
2025-10 | First Base propAMM | Tessera launches
2026-03 | 0x Report | End-of-block decoy quotes documented
2026-05 | Ethereum propAMMs | Builder coordination models
*2026-09 | This Paper | 3 chains, 1 year of empirical data
```

## F Conclusions {sheet span=4}
```callout ok Three Strict Constraints for Mantle
1. JIT Routers must query quotes and route swaps within the execution transaction. Section 9 outlines this exact requirement.
2. Fast lanes must strictly permit price updates, never fee-tier updates. Tessera's spoofing relies on paired default-fee updates at block start and block end.
3. Track KPIs via markout and quote-execution consistency, not quoted spreads alone. Only 39% of Tessera trades execute at quoted rates.

Read [F6](#F6) first, then [Implications for Mantle](#panel-M).
```

## G How to Read {depth=1}
```callout info Assumed Knowledge (not re-explained here)
- Uniswap v2/v3 reserve pricing, trading fees, LP concepts
- EVM transactions, gas accounting, difference between `tx.origin` and `msg.sender`
- Centralized exchange (CEX) order books: bid, ask, depth
- L2 sequencer-driven block transaction ordering
- 1 bp = 0.01%, 1 ppm = 0.0001% = 0.01 bp
```
Reading by role:

| Role | Read First | Read Next |
|---|---|---|
| Lead / Product | Overview, [F1](#F1), [F7](#F7) | [Implications for Mantle](#panel-M) |
| Router Developer | [B-4](#B-4), [F6](#F6) | [Implications for Mantle](#panel-M) · JIT Router |
| propAMM Contract / MM | [Mechanism Overview](#panel-K), [F4](#F4) | [Detailed Mathematical Formulation](#panel-L) |
| Sequencer / Infra | [B-3](#B-3), [F2](#F2) | [Implications for Mantle](#panel-M) |

## H Background & Motivation {depth=2}
**Problem**: Passive AMM quotes move only when someone trades against them. When external market prices shift, arbitrageurs pick off stale quotes, leaving LPs to absorb [[LVR]]. The paper measures passive AMM losses at 0.22–2.06 bps two seconds post-trade ([F1](#F1)).

**Why Now**: propAMMs have become dominant liquidity venues. By 2026, they capture over half of Solana SOL/USDC volume. Market share on Base and Monad continues to climb. Mantle is designing its own RFQ / propAMM and Router, requiring empirical insight into where venue profits come from and who pays for them.

**Paper Position**:
- Not a SoK. Its value lies in primary empirical data: 3 chains, 2025-09-01 through 2026-08-31 swaps, state updates, and Bybit order books.
- It completely reverse-engineers closed contracts: Tessera fully reconstructed, Metric and Elfomo partially decoded.
- It converts industry rumors (counterparty-specific pricing, spoofing) into verifiable metrics.

**Scope**: Solana SOL/USDC, Base ETH/USDC, Monad MON/USDC. **Non-goals**: Ethereum mainnet propAMMs (viewed by authors as builder-coordinated, closer to [[RFQ]]), on-chain CLOBs (like Kuru), long-tail assets.

## I Prerequisites {depth=2}
```excalidraw q="What concepts are required to understand this paper, and in what order?" read="Gray dashed boxes represent assumed knowledge; blue boxes represent cards matching the numbers below; arrows denote sequence." takeaway="B-0 through B-4 are essential. B-3 and B-4 explain why spoofing is possible." name=prereq-map kind="Prerequisites Map"
{"grid": {"w": 300, "h": 125}, "defaults": {"w": 190, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "amm", "label": "AMM Basics (Assumed)", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "evm", "label": "EVM & Sequencer (Assumed)", "col": 1, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "cex", "label": "CEX Orderbook (Assumed)", "col": 2, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 LVR", "col": 0, "row": 1, "color": "blue"},
   {"id": "b3", "label": "B-3 Intra-block Ordering", "col": 1, "row": 1, "color": "blue"},
   {"id": "b5", "label": "B-5 Microprice", "col": 2, "row": 1, "color": "blue"},
   {"id": "b6", "label": "B-6 Atomic Arbitrage", "col": 0, "row": 2, "color": "blue"},
   {"id": "b2", "label": "B-2 propAMM", "col": 1, "row": 2, "color": "blue"},
   {"id": "b4", "label": "B-4 Snapshot Routing", "col": 2, "row": 2, "color": "blue"},
   {"id": "b1", "label": "B-1 Markout", "col": 3, "row": 2, "color": "blue"}
 ],
 "edges": [
   {"from": "amm", "to": "b0"}, {"from": "evm", "to": "b3"}, {"from": "cex", "to": "b5"},
   {"from": "b0", "to": "b6"}, {"from": "b3", "to": "b2"}, {"from": "b5", "to": "b1"},
   {"from": "b6", "to": "b2"}, {"from": "b3", "to": "b4"}, {"from": "b4", "to": "b1"},
   {"from": "b2", "to": "b1"}
 ]}
```

```prereq B-0 l1 6min
# Loss-Versus-Rebalancing (LVR)
what: The expected loss suffered by passive liquidity providers against informed arbitrageurs whenever external market reference prices move.
why: Passive AMM curves cannot proactively update prices; they only adjust when an external trade hits them.
example:
~~~
CEX price jumps $2,000 → $2,020.
Arbitrageur buys from the AMM at stale $2,000 price and sells on CEX, taking $20 from LP equity.
~~~
misconception: Misconception: LVR is identical to impermanent loss. Fact: Impermanent loss assumes path independence; LVR accumulates continuously on price volatility even if price returns to start.
deeper: [3] Milionis et al. (2022) LVR foundational paper
```

```prereq B-1 l1 8min
# Markout
what: The difference between trade execution price and external Bybit microprice reference after a fixed delay $\tau$ (e.g., $\tau = 2\text{s}$). Positive markout means the maker earned alpha relative to post-trade market price.
why: Markout directly isolates whether the orderflow received was toxic (informed) or benign (uninformed).
example:
~~~
Taker buys ETH at $2,000.
At t + 2s, CEX mid-price is $1,998.
The maker sold high relative to subsequent price: Markout is +10 bps.
~~~
misconception: Misconception: Markout equals net PnL. Fact: Markout is gross alpha before gas, hedging slippage, and inventory holding costs.
deeper: [1] Section 5
```

```prereq B-2 l1 7min
# Proactive Market Maker (propAMM)
what: An on-chain liquidity pool whose quoting curves are proactively updated by an off-chain market maker submitting state transactions.
why: Allows active makers to pull quotes and update prices as CEX prices shift, avoiding adverse selection from passive stale quotes.
example:
~~~
Tessera updates anchor price p and spread s via 25-byte state updates on Base.
~~~
misconception: Misconception: propAMM is a fully on-chain order book. Fact: It quotes via parametrized algorithmic curves whose parameters are dynamically updated.
deeper: [1] Section 2
needs: B-0
```

```prereq B-3 l1 6min
# Intra-Block Transaction Ordering
what: The deterministic sequence in which transactions execute within a single block or sub-block, decided by sequencers or builders.
why: On Base Flashblocks, 200ms sub-blocks allow market makers to insert quote updates between user trades.
misconception: Misconception: Transactions in the same block execute with identical state. Fact: State updates change pricing dynamically between transactions.
deeper: [4] Base Flashblocks Architecture
```

```prereq B-4 l1 6min
# Snapshot-Based Off-Chain Routing
what: Decentralized aggregators (e.g., 0x, 1inch) simulating execution off-chain via `eth_call` against state snapshots to find the cheapest route.
why: Creates an information gap: user trades execute against later intra-block state where fees may have been adjusted.
misconception: Misconception: Off-chain quotes guarantee on-chain execution prices. Fact: State can diverge prior to block execution.
deeper: [1] Section 7.4
needs: B-3
```

```prereq B-5 l1 5min
# Microprice
what: Order-book volume-weighted price:
$$
P_{\text{micro}} = \frac{Q_b P_a + Q_a P_b}{Q_b + Q_a}
$$
why: Captures microsecond inventory skew on CEX order books better than simple mid-price.
deeper: [1] Section 5
```

```prereq B-6 l1 5min
# Atomic Cross-Venue Arbitrage
what: A smart contract executing paired trades across multiple DEXs within a single transaction, reverting if net profit is non-positive.
why: Arbitrageurs drain stale passive pools as soon as active pools adjust prices.
deeper: [1] Section 7.3
needs: B-0
```

## J Core Findings {depth=2}
```finding F1 high
# propAMM Generates Positive Markout While Passive AMMs Suffer Negative Markout
claim: Across Solana, Base, and Monad over one year, propAMM markout 2 seconds post-trade averages +0.37 to +1.69 bps, while passive AMMs average -0.22 to -2.06 bps.
evidence: [observed] Paper Table 1, Figures 4 and 5 [1]. [observed] Base Tessera achieves positive markout across 91% of trading days.
implication: Active quoting successfully neutralizes LVR on high-frequency rollups.
```

```finding F2 high
# Low-Cost State Updates Outpace Taker Execution
claim: Updating quotes via lightweight calldata costs as low as ~26.7k gas on Base. Tessera updates anchor quotes once per 0.563 blocks.
evidence: [observed] RPC verification of Base blocks 50,369,777 and 50,196,022 [1].
implication: Priority lanes for quote updates protect makers from adverse selection.
```

```finding F3 high
# Counterparty-Specific Pricing Enforces Tiered Penalty Schedules
claim: Tessera inspects `tx.origin` and calling contracts via bytecode fingerprinting, levying up to 6 additive penalty fees ($\phi$).
evidence: [observed] Decompiled fingerprint contract `0xfdb7...e684` [1].
implication: Routers must query executable prices inside transactions rather than relying on off-chain simulations.
```

```finding F4 high
# Penalties Account for Significant Effective Execution Costs
claim: While nominal quoted fees are ~0.44 bps, volume-weighted realized fees reach 1.95 bps once penalty components are factored in.
evidence: [observed] Appendix C.1 mathematical formulation and fee accounting [1].
implication: Fee components must be exposed programmatically to maintain execution transparency.
```

```finding F5 medium
# propAMMs Win Cross-Venue Atomic Arbitrage Against Passive AMMs
claim: In atomic arbitrage across propAMM and passive AMM pairs, the propAMM leg breaks even or achieves positive alpha, while the passive AMM leg absorbs losses.
evidence: [observed] Paper Table 2 and Figure 6(b) [1].
implication: Introducing propAMMs increases the adverse selection experienced by remaining passive AMM LPs.
```

```finding F6 high
# Spoofing: Only 39% of Trades Execute at the Quoted Snapshot Price
claim: Tessera raises default fees near the beginning of blocks and resets them near block ends. Realized trades execute 1.08 bps worse than end-of-block quotes.
evidence: [observed] Paper Section 7.4, Table 3, and Figure 7 [1]. [observed] 0x independent report finding 97.4% of final updates in the last sub-block [4].
implication: Sequencers must prevent fee-rate updates from entering fast pre-confirmation channels.
```

```finding F7 medium
# Retail Traders Execute at Lower Nominal Cost on propAMMs
claim: During calm market periods (reference price moving < 1 bp over 6 seconds), orderflow pays 0.26 to 1.62 bps on propAMMs versus 1.38 to 8.60 bps on passive AMMs.
evidence: [observed] Paper Section 8 and Figure 8 [1]. [inferred] Calm trades serve as a proxy for retail, without independent identity telemetry.
implication: Lower retail spreads serve as a genuine product advantage when paired with protections against spoofing.
```

```finding F8 medium
# Quote Updates Are Submitted Concurrently as 25-Byte Payloads
claim: Updates bypass standard ABI function selectors, packing sequence number, reference block, anchor price, and spread into 25 bytes.
evidence: [observed] Base RPC analysis of blocks 50,369,777 and 50,196,022 [1].
implication: Sequencers can prune outdated sequence updates from the same maker, saving execution gas.
```

## K Mechanism Overview {depth=2}
```excalidraw q="What happens to passive AMMs versus propAMMs when reference prices jump?" read="Top lane: passive AMM; bottom lane: propAMM. Red denotes loss, green denotes gain." takeaway="Passive AMMs are picked off at stale prices; propAMMs adjust quotes before takers trade." kind=Intuition
{"grid": {"w": 330, "h": 130}, "defaults": {"w": 190, "h": 64, "fontSize": 17},
 "nodes": [
   {"id": "r0", "label": "External Price Jumps", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "a1", "label": "AMM Quote Stale", "col": 1, "row": 0, "color": "red"},
   {"id": "a2", "label": "Arbitrageur Buys", "col": 2, "row": 0},
   {"id": "a3", "label": "LP Absorbs LVR", "col": 3, "row": 0, "color": "red"},
   {"id": "r1", "label": "External Price Jumps", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "p1", "label": "propAMM Updates p,s", "col": 1, "row": 1, "color": "blue", "strokeWidth": 3},
   {"id": "p2", "label": "Taker Swaps", "col": 2, "row": 1},
   {"id": "p3", "label": "Markout > 0", "col": 3, "row": 1, "color": "green"}
 ],
 "edges": [
   {"from": "r0", "to": "a1", "label": "No trade"}, {"from": "a1", "to": "a2", "label": "Old price"}, {"from": "a2", "to": "a3"},
   {"from": "r1", "to": "p1", "label": "Update p,s"}, {"from": "p1", "to": "p2", "label": "New price"}, {"from": "p2", "to": "p3"}
 ]}
```

```excalidraw q="What state variables does Tessera maintain, and how is execution output calculated?" read="Purple denotes on-chain state; yellow denotes penalty logic; green is output." takeaway="Updates touch only p and s (~26.7k gas); penalties are applied atomically after ladder traversal." kind="Concept Map"
{"grid": {"w": 300, "h": 120}, "defaults": {"w": 180, "h": 62, "fontSize": 17},
 "nodes": [
   {"id": "up", "label": "Price Update", "col": 0, "row": 0},
   {"id": "ub", "label": "Book Update", "col": 1, "row": 0},
   {"id": "hs", "label": "Historical Swaps", "col": 2, "row": 0},
   {"id": "ps", "label": "Anchor p, Spread s", "col": 0, "row": 1, "color": "violet"},
   {"id": "lad", "label": "Two Ladders", "col": 1, "row": 1, "color": "violet"},
   {"id": "acc", "label": "Net Volume Acc", "col": 2, "row": 1, "color": "violet"},
   {"id": "av", "label": "Active Levels", "col": 1, "row": 2, "color": "blue"},
   {"id": "x", "label": "Input Amount x", "col": 0, "row": 3},
   {"id": "walk", "label": "Traverse Ladder", "col": 1, "row": 3, "color": "blue"},
   {"id": "pen", "label": "× (1 − Φ)", "col": 2, "row": 3, "color": "yellow"},
   {"id": "out", "label": "Execute Y_exec", "col": 3, "row": 3, "color": "green"}
 ],
 "edges": [
   {"from": "up", "to": "ps", "label": "26.7k gas"}, {"from": "ub", "to": "lad", "label": "152k gas"}, {"from": "hs", "to": "acc", "label": "Accumulate"},
   {"from": "ps", "to": "av"}, {"from": "lad", "to": "av"}, {"from": "acc", "to": "av", "label": "Net by p"},
   {"from": "x", "to": "walk"}, {"from": "av", "to": "walk"}, {"from": "walk", "to": "pen", "label": "Y_book"}, {"from": "pen", "to": "out"}
 ]}
```

```uml q="In what order do state updates and swaps occur within a single block?" read="Empirical data from Base block 50,369,777 (149 transactions). idx denotes transaction position." takeaway="Multiple price updates occur within each block, bracketing swaps."
sequenceDiagram
  autonumber
  participant F as Default Fee EOA
  participant U as Quote Update EOA
  participant P as Tessera Pool
  participant T as Taker (via Router)
  participant H as Fingerprint Contract
  F->>P: idx 9 Default fee raised
  U->>P: idx 68 seq 0x58, p=2457.460, s=1 ppm
  U->>P: idx 119 seq 0x59, p=2457.788, s=45 ppm
  F->>P: idx 131 Default fee reset
  rect rgb(234, 241, 251)
    T->>P: idx 136 Swap 1.0177 WETH
    P->>H: Query tx.origin and caller bytecode
    H-->>P: Return penalty score
    P->>P: Compute Y_book, multiply by (1 - Φ)
    P-->>T: Transfer USDC output
  end
  U->>P: idx 137 seq 0x5a, p=2457.468, s=6 ppm
```

## L Detailed Mathematical Formulation {depth=2}
The overall swap execution formula is:

$$
Y_{\text{exec}} = Y_{\text{book}}(x) \times (1 - \Phi), \quad \Phi = \frac{\sum_{i} \phi_i}{10^6} \quad (i \in \{\text{base, age, priority, mode, default, address}\})
$$

where each penalty component $\phi_i$ is expressed in parts-per-million (ppm).

In Appendix C.1, the effective half-spread $c_{\text{eff}}$ accounting for total normalized penalty $\Phi$ is derived as:

$$
c_{\text{eff}} = 10^4 \cdot \frac{p_a - p_b (1 - \Phi)^2}{p_a + p_b (1 - \Phi)^2}
$$

and the portion deducted by the $k$-th penalty term corresponds to:

$$
\Delta Y_k = \frac{Y \cdot \phi_k}{10^6 - \sum \phi_i}
$$

## M Implications for Mantle {depth=2}
```uml q="How should Mantle's JIT Router select routes within a single transaction?" read="Architectural proposal. PA and PB denote propAMMs; RFQ quotes are supplied in calldata." takeaway="Route selection, execution, and slippage assertion happen atomically on-chain."
sequenceDiagram
  autonumber
  participant U as User / Aggregator
  participant R as JIT Router
  participant PA as propAMM A
  participant PB as propAMM B
  participant Q as Fluxion RFQ Settlement
  Note over PA,PB: Makers update p, s via sequencer fast lane
  U->>R: swap(tokenIn, amountIn, minOut, rfqQuote)
  R->>PA: quote(amountIn)
  R->>PB: quote(amountIn)
  R->>Q: Verify RFQ signature & expiry
  R->>R: Select maximal net output
  R->>PA: swap(amountIn, quoteOut)
  PA-->>R: amountOut
  R->>R: Assert amountOut >= quoteOut, else fallback
  R-->>U: Transfer tokenOut to user
```

**JIT Router Principles**:
1. Execute `quote()` and compare net output dynamically inside the execution transaction.
2. Require `quote()` and `swap()` to share identical penalty logic, asserting execution is no worse than quote.
3. Pre-agree on router classification with market makers to avoid generic router penalty tagging.
4. Support Fluxion RFQ quotes alongside on-chain propAMM pools.

**Sequencer & Protocol Rules**:
1. Fast lanes must strictly permit pricing updates (p, s, sequence cancellation). Fee-tier and access-control updates must follow normal block sequencing.
2. Parameter changes affecting taker fees must apply with an activation delay of at least one block to prevent decoy quoting.

## N Glossary {depth=2}
```glossary
propAMM | Proactive Automated Market Maker | An on-chain liquidity venue whose pricing curves are actively shifted by an off-chain market maker.
LVR | Loss-Versus-Rebalancing | The adverse selection loss suffered by passive liquidity providers against informed arbitrageurs.
markout | Post-Trade Price Difference | Difference between trade execution price and external mid-price after a fixed delay $\tau$.
spoofing | Quote Manipulation | Systematically posting tight decoy quotes at snapshot boundaries while executing trades at wider fee tiers.
microprice | Microprice | Volume-weighted order book price accounting for bid/ask queue imbalance.
Flashblocks | Flashblocks Sub-blocks | Sub-second execution blocks on Base allowing high-frequency intra-block state updates.
JIT Router | Just-In-Time Router | An on-chain router that queries live venue quotes and executes optimal routes atomically within a single transaction.
RFQ | Request-For-Quote | Bilateral quote model where market makers sign cryptographic commitments for specific trade sizes.
```

## O References {depth=2}
1. [arXiv:2609.38056: Active Liquidity On Chain](https://arxiv.org/abs/2609.38056) — Primary study. **PRIMARY**
2. [Tessera Pool Contract on Base](https://basescan.org/address/0xf524c7f078e932b12faea0e21b0e3c1a30265a7c) — Implementation bytecode and logs. **PRIMARY**
3. [Milionis et al. (2022): Automated Market Making and Loss-Versus-Rebalancing](https://arxiv.org/abs/2208.06046) — LVR theoretical foundations. **PRIMARY**
4. [0x Research: Flashblocks and Toxic Flow on Base](https://0x.org/post/flashblocks-base) — Sub-block quote behavior analysis.

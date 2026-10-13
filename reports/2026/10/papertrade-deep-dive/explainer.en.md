---
template: research
title: Papertrade Deep Dive: Vault-Counterparty Perps, Loss-Based Minting & Mantle Feasibility
subtitle: Papertrade combines single-orderbook mid quoting, protocol vault counterparty betting, winner-only fees, and loss-based token minting. Early traction stemmed from launch pulse and loss cashback; the exploit was enabled by a ~$100B per-side launch OI cap. The mechanics can be replicated on Mantle; missing primitives are native on-chain price reads and native USDC, while the true constraint is organic demand.
cols: 4
type: Technical Research · Protocol Deconstruction · Feasibility Study
audience: Protocol/product researchers and developers on Mantle: familiar with EVM and perps basics, unfamiliar with HyperCore / HyperEVM and Martingaler mechanics
scope: Papertrade mechanics, on-chain state, launch metrics, and exploit post-mortem as of 2026-10-12; comparison with peer vault perps; Mantle capability gaps and design recommendations
evidence: 222 claims ledger (observed 154 / inferred 58 / speculative 10); HyperEVM mainnet state reads (blocks 48359148–48362893); Papertrade docs & stats API; Hyperliquid, Chainlink, Pyth, Circle, Mantle docs; accessed 2026-10-12 to 10-13
date: 2026-10-13 · v1
---
Bottom line: Papertrade is a synthetic perpetual protocol quoting Hyperliquid BBO mid-prices with protocol LP acting as the direct counterparty. It charges fees strictly on winning profits and mints PAPER tokens exclusively to losing traders ([F1](#F1), [F2](#F2)). In its advertised "zero-capital launch," queuing credit was only utilized for $22.86. Protocol LP reached $5M within 65 minutes, after which it was capped at ~$5M by diverting excess earnings to stakers ([F3](#F3)). Initial volume was a standard launch pulse; staker USDC payouts equaled ~80% of net trader losses, effectively returning cash to losing accounts ([F5](#F5)).

The root cause of the exploit was an on-chain launch OI cap of ~$100B per side rather than the documented "current OI + $1B" ([F7](#F7)). For Mantle, the ledger, payout queues, and tokenomics can be ported as-is. Chain-level gaps are limited to native on-chain price precompiles and native USDC / CCTP. The true hurdle is sustainable market demand ([F11](#F11), [F12](#F12)).

## A Four-Tier Deconstruction {sheet meta="Papertrade → Mantle"}
```tree list
Pricing Tier | HyperCore BBO Precompile
  Mantle: Lacks native orderbook | Use signed report oracles
Execution Tier | Relayer + Keeper
  Mantle: Partially available | Early preconf lane foundations
Capital Tier | LP Vault + Queue + PAPER
  Mantle: Portable as-is | Application contracts
Demand Tier | Launch Pulse + Loss Cashback
  Mantle: Weak | Native perps TVL is limited
```

## B Winner Payout Schedule {sheet span=2 meta="On-chain Parameters"}
```annot
# Winner Net Payout = Notional × move′ × scale × 0.98 | Applies strictly to profits
[move′]{Price change minus 0.2 bps deadband} · [scale]{0.9 ÷ (1 + 1/(move′·15000) + 10⁵/(10⁶·move′·814.6))} · [0.98]{2% win fee}
> BTC: 0.05% move → 60.7% retained, 0.1% move → 72.4%, 1% move → 86.4%. 88.2% is an unreachable asymptotic upper bound.
```

## C Mantle Capability Comparison {sheet meta="2026-10"}
| Requirement | Papertrade | Mantle |
|---|---|---|
| Native On-chain Price | HyperCore precompile | no Missing |
| Verifiable Low-latency Price | HyperCore precompile | warn Signed reports |
| Prioritized Liquidation | Tip + Keeper | warn Tip / Preconf lane |
| Gasless / Session Key | Custom application logic | ok EIP-7702 + ERC-4337 |
| Native USDC + CCTP | Circle on HyperCore | no Missing |
| Ready-made Demand | Hyperliquid userbase | no Very weak |

## D Key Metrics {sheet span=2 meta="As of 2026-10-12"}
| Metric | Value |
|---|---|
| Cumulative Notional Volume | $845.6B (First 10 hours accounted for 67%) |
| Peak OI → 10-12 | $10.06B → $0.45B |
| Net Trader Loss / Staker Payout | -$34.1M / +$27.3M USDC |
| LP Vault / Payout Queue | ~$5M / $0 |
| PAPER Supply / Staked Ratio | 6.19B / 98.8% |
| Launch OI Cap | ~$100B per side |
| 1000x Hard Bust Distance | 5.24 bps |

## E Evolution Timeline {sheet span=2 meta="UTC"}
```timeline v
2024-06 | Martingaler Whitepaper | Queues + token incentives
2026-10-06 | Contracts Deployed | 7-day timelock, 2/3 multisig
2026-10-10 14:00 | Launch | OI cap ~$100B per side
15:05 | LP Crosses $5M | Excess swept to stakers
*~22:01 | ETH BBO Pushed 0.12% | LP drops to ~$2.4M
23:34 | First OI Cap Reduction | Capped to ~$6B, then ~$0.4B
10-11 15:41 | Impact Proposal Submitted | Pending confirmation
10-17 | Staker Cap Raised to $10M | Scheduled
```

## F Conclusions {sheet span=4}
```callout ok Port mechanics to Mantle, but do not copy its pricing or risk parameters
- Papertrade's novelty lies in capital structure (zero external LP, queue, loss minting) and pricing (single BBO mid). The haircut model adapts Rollbit (F2, F9).
- "Zero-capital launch" lasted only minutes, subsequently sustained by first-hour trader losses and a $5M vault cap (F3).
- Pricing lacks deviation circuit breakers while launch caps were 100x too wide, directly enabling the exploit (F6, F7).
- Replicating on Mantle: adopt commit-reveal signed price reports; size caps from LP risk budgets; prioritize liquidations via maintenance lanes (F13). Validate organic demand before building.
```

## G How to Read {depth=1}
```callout info Assumed Knowledge (not re-explained here)
- EVM contract calls, staticcall, EIP-1967 proxies
- Perpetual contract concepts: margin, leverage, notional size, liquidation, funding rates
- Orderbook BBO (best bid/offer) and spreads
- Oracle role: importing external prices on-chain
- Mantle architecture: OP Stack rollup, single sequencer, 2s block times
```
- **5 minutes**: Read Lead and Overview A–F.
- **30 minutes**: Follow [Prerequisites](#panel-I), [Trade Execution](#panel-J), [Pricing Schedule](#panel-K), [Capital Structure](#panel-L), [Traction Drivers](#panel-M), [HyperCore Interface](#panel-N), [Exploit Post-Mortem](#panel-O), [Peer Comparison](#panel-P), and [Mantle Recommendations](#panel-R).

**Running Example**: Alice opens a 1000x leveraged long on BTC at $82,513 with $100 margin, commanding a $100,000 notional position.

## I Prerequisites {depth=2}
```excalidraw q="What concepts are necessary to understand this report, and in what order?" read="Gray dashed boxes represent assumed knowledge; blue boxes represent concept cards; green boxes represent core themes." takeaway="B-0 through B-2 explain pricing origin; B-3 covers capital flow; B-4 and B-5 highlight what Mantle must adapt." name=prereq-map kind="Prerequisites Map"
{"grid": {"w": 290, "h": 115}, "defaults": {"w": 220, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "perp", "label": "Perpetual Contracts (Assumed)", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "ob", "label": "Orderbook Concepts (Assumed)", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "or", "label": "Oracles (Assumed)", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b1", "label": "B-1 Vault-Counterparty", "col": 1, "row": 0, "color": "blue"},
   {"id": "b0", "label": "B-0 HyperCore Precompile", "col": 1, "row": 1, "color": "blue"},
   {"id": "b4", "label": "B-4 Signed Price Reports", "col": 1, "row": 2, "color": "blue"},
   {"id": "b3", "label": "B-3 Martingaler Queue", "col": 2, "row": 0, "color": "blue"},
   {"id": "b2", "label": "B-2 BBO, Mid, and Mark", "col": 2, "row": 1, "color": "blue"},
   {"id": "b5", "label": "B-5 OI Cap & Net Exposure", "col": 2, "row": 2, "color": "blue"},
   {"id": "top", "label": "Papertrade on Mantle", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "perp", "to": "b1"}, {"from": "ob", "to": "b0"}, {"from": "or", "to": "b4"},
   {"from": "b1", "to": "b3"}, {"from": "b0", "to": "b2"}, {"from": "b1", "to": "b5"},
   {"from": "b3", "to": "top"}, {"from": "b2", "to": "top"}, {"from": "b5", "to": "top"},
   {"from": "b4", "to": "top", "dashed": true}
 ]}
```

```prereq B-0 l1 3min
# HyperCore and Read Precompiles
what: [[HyperCore]] is Hyperliquid's consensus layer running high-performance orderbooks. [[HyperEVM]] contracts invoke dedicated precompiles via staticcall to read the latest HyperCore state directly at block construction time [5].
why: Papertrade reads prices directly on-chain without relying on off-chain oracle signers.
example: `0x...080e` takes asset ID (BTC = 0) and returns `(uint64 bid, uint64 ask)` costing ~8,240 gas [5][8].
misconception: Misconception: Precompiles stream continuous real-time prices. Fact: EVM contracts read a discrete snapshot once per EVM block (~1s blocks) [6].
deeper: [5] Read precompiles section
```

```prereq B-1 l1 3min
# Vault-Counterparty Synthetic Perpetuals
what: Synthetic perpetuals do not match buyers and sellers. The protocol logs entry price and settles PnL upon close directly against a [[vault counterparty]] [1].
why: Zero slippage and zero spread arise from this structure since the protocol does not hedge externally.
example: Alice's $100,000 notional position is purely an on-chain promise paid out by the LP vault.
misconception: Misconception: Unhedged positions never charge funding. Fact: GMX v2 and gTrade operate synthetic vaults while charging dynamic funding/borrow fees [14][17].
deeper: [1] Trades and pricing
```

```prereq B-2 l1 3min
# BBO, Mid-Price, and Mark Price
what: [[BBO]] denotes best bid and offer. [[mid]] is their arithmetic midpoint. [[mark price]] is Hyperliquid's median-of-three liquidation price [7].
why: Papertrade executes opens, closes, and liquidations against mid-price, whereas Hyperliquid itself never uses mid-price for liquidations.
example: On 10-12, BTC orderbook quoted $82,513.0 / $82,514.0, yielding mid = $82,513.5 (1 tick spread ≈ 0.12 bps) [3].
misconception: Misconception: Consensus-attested prices represent fair value. Fact: Consensus only proves that a quote existed on that specific orderbook [1].
deeper: [7] Robust price indices
```

```prereq B-3 l1 4min
# Martingaler Payout Queue
what: A FIFO queue recording unpaid winning profits. When the LP vault lacks liquidity, profits queue until future trader losses refill the pool [2].
why: Provides the theoretical backing for Papertrade's "zero-capital launch."
example: During the first 6 seconds, three winners earned $7.62 each while LP was zero, queuing until the next trader loss cleared them [3].
misconception: Misconception: The queue mathematically guarantees ultimate solvency. Fact: Whitepapers simulate toy probabilistic games without proving asymptotic solvency [2].
deeper: [2] Section 2.2-2.3
```

```prereq B-4 3min
# Signed Price Report Oracles
what: Price packets signed off-chain by oracle node networks (e.g., Chainlink Data Streams, Pyth) relayed into transactions and verified by contracts [23][24].
why: Mantle lacks an integrated L1 orderbook precompile and must utilize pull-based oracle reports.
deeper: [23] Data Streams Supported Networks
```

```prereq B-5 3min
# OI Cap and Net Exposure
what: [[OI cap]] limits cumulative open position size per side. Net exposure = Long Notional - Short Notional, determining directional vault risk.
why: Without funding rates to rebalance skew, Papertrade relies entirely on OI caps to constrain drawdown risk.
example: On 10-10 at 15:00, traders held $1.23B net long while LP was $4.2M; a 0.34% concurrent BTC/ETH rally would have depleted the vault [4].
deeper: [1] Risk documentation
```

## J Trade Execution Architecture {depth=2}
```uml q="Which contracts are invoked when Alice executes an order and claims PAPER?" read="Derived from official docs and on-chain verification; highlighted box executes atomically in one EVM tx." takeaway="Price is fetched directly from HyperCore in the execution transaction, but transactions must route through official relayers."
sequenceDiagram
  autonumber
  participant A as Alice (Session Key)
  participant R as Official Relayer
  participant B as BatchExecutor
  participant E as Exchange
  participant O as PriceOracle
  participant P as BBO Precompile 0x...080e
  participant T as PaperTokenomics
  A->>R: Signed order intent (EIP-712)
  R->>B: Batch submit intents
  rect rgb(234, 241, 251)
    B->>E: openPositionBySig
    E->>O: Query price
    O->>P: staticcall(asset)
    P-->>O: (bid, ask)
    O-->>E: mid = (bid+ask)/2
    E->>E: Store entry price & margin
  end
  A->>R: Signed close intent
  R->>B: Batch submit close
  B->>E: closePositionBySig
  E->>O: Fetch live mid-price, settle PnL
  alt Loss
    E->>T: Mint PAPER based on loss
  else Profit & Insufficient LP
    E->>E: Profit appended to payout queue
  end
```

```finding F1 high
# Documented Architecture Matches On-Chain Contracts, but Execution Routes Exclusively Through Official Relayers
claim: Trade execution matches public specifications, but all opens and closes require submission via two authorized relayer addresses. Governance is controlled by a 7-day Timelock and 2/3 multisig.
evidence: [observed] HyperEVM deployed bytecode, simulation traces, and relayer nonce activity exceeding 300,000 transactions [3]. Unverified source code was reconstructed from docs and on-chain behaviors.
implication: Decentralization is limited; relayers maintain transaction ordering discretion.
```

## K Payout Haircut Schedule {depth=2}
For profitable trades, the net payout formula is:

$$
\text{Payout} = \text{Notional} \times \Delta' \times \text{scale} \times 0.98
$$

where price movement after deadband is $\Delta' = \text{move} - 0.2\text{ bps}$, and the scale factor is defined as:

$$
\text{scale} = \frac{0.9}{1 + \frac{1}{15{,}000 \cdot \Delta'} + \frac{10^5}{10^6 \cdot 814.6 \cdot \Delta'}}
$$

```finding F2 high
# Under 1000x Leverage, Small Profits Retain Only 54-72%; 88.2% Represents an Unreachable Asymptotic Ceiling
claim: At 0.05%, 0.1%, and 1% price moves, BTC profits retain only 60.7%, 72.4%, and 86.4% respectively, while ETH retains 54.0%, 67.6%, and 85.7%. The model adapts Rollbit's haircut curve.
evidence: [observed] On-chain parameters and numerical verification [3].
implication: High leverage profits are heavily dampened on small moves, increasing the cost of short-term price manipulation.
```

## L Capital Structure and Token Minting {depth=2}
USDC capital is partitioned into three buckets: LP cash, sideBucket, and the payout queue [1].

```excalidraw q="How do trader profits and losses flow through Papertrade's capital buckets?" read="Blue boxes denote protocol vaults; green denotes recipient parties; yellow denotes conditional logic." takeaway="LP vault retains a maximum of $5M; excess sweeps to PAPER stakers while PAPER mints exclusively to losing traders." kind="Capital Flow"
{"grid": {"w": 330, "h": 130}, "defaults": {"w": 200, "h": 64, "fontSize": 16},
 "nodes": [
   {"id": "loss", "label": "Trader Loss / Liquidation", "col": 0, "row": 0, "color": "gray"},
   {"id": "win", "label": "Profitable Close", "col": 0, "row": 2, "color": "gray"},
   {"id": "q", "label": "Queue Empty?", "col": 1, "row": 0, "shape": "diamond", "color": "yellow", "w": 150, "h": 80},
   {"id": "side", "label": "sideBucket", "col": 1, "row": 1, "color": "blue"},
   {"id": "lp", "label": "LP Cash Vault", "col": 2, "row": 0, "color": "blue", "strokeWidth": 3},
   {"id": "queue", "label": "Payout Queue", "col": 1, "row": 2, "color": "red"},
   {"id": "st", "label": "PAPER Stakers", "col": 3, "row": 0, "color": "green"},
   {"id": "mint", "label": "Mint PAPER", "col": 0, "row": 1, "color": "green"},
   {"id": "winner", "label": "Winner Balance", "col": 2, "row": 2, "color": "green"}
 ],
 "edges": [
   {"from": "loss", "to": "q"},
   {"from": "q", "to": "lp", "label": "Yes"},
   {"from": "q", "to": "side", "label": "No"},
   {"from": "side", "to": "queue", "label": "Harvest"},
   {"from": "lp", "to": "st", "label": "Over $5M"},
   {"from": "loss", "to": "mint", "dashed": true},
   {"from": "win", "to": "queue", "label": "No LP"},
   {"from": "lp", "to": "winner", "label": "Has LP"},
   {"from": "queue", "to": "winner", "dashed": true}
 ]}
```

The PAPER minting formula scales inversely with cumulative historical LP growth $H$. When LP is below $2M, 100 PAPER is minted per $1 loss; thereafter:

$$
\text{Mint Rate} = 100 \times \left( \frac{120\text{M}}{120\text{M} + H} \right)^2 \quad \text{PAPER per \$1 loss}
$$

```finding F3 high
# Zero-Capital Launch Was a Transitory Marketing State; Protocol Operates on Trader Losses and a $5M Capped Vault
claim: The payout queue was only active for 3 items totaling $22.86 within the first 6 seconds. The LP vault exceeded $5M in 65 minutes, with $25.97M subsequently swept to PAPER stakers across 517 transfers.
evidence: [observed] Analysis of 250,565 on-chain events across blocks 48359148–48362893 [3].
implication: The protocol quickly functioned as a profitable house funded by trader losses rather than sustained queue credit.
```

```finding F4 high
# PAPER Token Minting Replaces Cash Rebates but Faces Asymptotic Dilution
claim: PAPER mints exclusively to losing traders as psychological cashback. Staking PAPER captures ~80% of net protocol earnings.
evidence: [observed] Tokenomics contracts and distribution logs [1][3].
implication: PAPER serves as synthetic equity that offsets trader drawdown with protocol revenue share.
```

```finding F5 medium
# Early Volume Represented a Standard Launch Pulse Driven by Incentives
claim: Over 67% of cumulative volume was generated in the first 10 hours. Following cap reductions, OI collapsed by ~94% within 48 hours.
evidence: [observed] Stats API and historical volume indexing [4].
implication: Retention without extreme leverage or token emissions remains unproven.
```

```finding F6 high
# Single BBO Mid-Price Quoting Lacks Liquidity Depth and Price Deviation Guards
claim: The pricing oracle staticcalls BBO mid without validating quote size, spread width, or deviation against reference index oracles.
evidence: [observed] `PriceOracle` decompiled bytecode and documented execution paths on HyperEVM [3].
implication: Quoting mid-price on thin orderbooks exposes the vault to low-capital manipulation.
```

```finding F7 high
# The Exploit Was Enabled by a ~$100B Launch Cap Rather than Contract Bugs
claim: On 2026-10-10 at ~22:01 UTC, an attacker opened a large leveraged position and moved the ETH spot BBO by 0.12%, capturing ~$1.28M net profit according to media reports. This occurred because the launch OI cap was set to ~$100B instead of the documented conservative limits.
evidence: [observed] Subsequent emergency cap reduction transactions and parameter state [3][10]. Attack mechanics, profit numbers, and exploiter wallet identities are cited from media reports without independent on-chain verification [12].
implication: Risk caps must be bound to protocol liquidity rather than arbitrary parameters.
```

## M Mantle Feasibility and Recommendations {depth=2}
```finding F8 medium
# Mantle Lacks Native L1 Orderbook State Precompiles
claim: Mantle does not run an integrated L1 orderbook consensus. Fetching low-latency prices requires signed pull oracles.
evidence: [observed] Mantle architecture specifications and opcode tables [25].
implication: A direct copy of HyperCore precompile quoting cannot function on Mantle.
```

```finding F9 medium
# Commit-Reveal Pull Oracles Introduce Front-Running and Stale-Report Vectors
claim: Using pull oracles on L2 requires two-phase commit-reveal ordering to prevent keepers from cherry-picking favorable price timestamps.
evidence: [inferred] Oracle delay analysis across Pyth and Chainlink Data Streams [23][24].
implication: Orders must be committed before price reports are unveiled.
```

```finding F10 medium
# Native USDC and CCTP Are Missing on Mantle
claim: Native Circle USDC and CCTP are not deployed on Mantle, requiring bridged liquidity wrappers.
evidence: [observed] Circle official supported networks directory.
implication: Cross-chain deposit UX is more fragmented than on Hyperliquid.
```

```finding F11 high
# Replication is Structurally Feasible but Constrained by Demand Rather than Technology
claim: Contracts, queues, and tokenomics can be deployed on Mantle with standard EVM tools. However, Mantle's derivative TVL is limited compared to Hyperliquid.
evidence: [inferred] DeFiLlama perps volume across Layer 2 ecosystems.
implication: High-leverage synthetic products require targeted market-making incentives and trader acquisition.
```

```finding F12 high
# Risk Caps Must Scale as a Function of Vault Equity and Liquidation Latency
claim: Maximum allowable net position caps must scale strictly with vault equity to guarantee that single-block adverse moves cannot drain the pool.
evidence: [inferred] VaR simulation models under 1000x leverage constraints.
implication: Never set static multi-billion dollar caps.
```

```finding F13 medium
# Liquidations Require Priority Maintenance Lanes on the Sequencer
claim: High-leverage liquidations have narrow margin buffers (e.g. 5.24 bps at 1000x). If liquidation transactions are delayed behind user traffic, bad debt accumulates.
evidence: [observed] Bust buffer calculations under 1000x leverage schedules.
implication: Liquidations must route through sequencer priority maintenance lanes.
```

## N Glossary {depth=2}
```glossary
vault counterparty | Vault Counterparty | A liquidity pool that acts as the direct counterparty to trader positions, absorbing collective PnL.
synthetic perps | Synthetic Perpetuals | Derivatives priced against an oracle or index without holding or matching underlying spot assets.
BBO | Best Bid and Offer | The highest bid and lowest ask price currently available on an order book.
mid | mid-price | The exact arithmetic average between the best bid and best offer on an order book.
mark price | Mark Price | A smoothed index price used for liquidations to protect traders from temporary orderbook manipulation.
payout queue | Payout Queue | A FIFO queue tracking accrued winning profits that cannot be immediately honored by the LP vault.
OI cap | Open Interest Cap | A protocol-enforced ceiling limiting total open notional exposure across traders.
hard bust | Hard Bust Liquidation | Liquidation threshold where margin is completely exhausted and position is terminated.
HyperCore | HyperCore Engine | The Layer 1 consensus layer of Hyperliquid running high-throughput orderbooks.
HyperEVM | HyperEVM Environment | The EVM-compatible execution layer interacting directly with HyperCore state.
precompile | Smart Contract Precompile | A specialized contract running native node bytecode at a fixed address.
session key | Session Key | An ephemeral scoped key authorized to sign trades without withdrawal capabilities.
```

## O References {depth=2}
1. [Papertrade Docs](https://docs.papertrade.xyz/) (Snapshot `research/references/papertrade-docs-2026-10-12.md`) — Official description of mechanics, parameters, risks, and permissions. **PRIMARY**
2. [Martingaler Whitepaper](https://docs.papertrade.xyz/martingaler-whitepaper.pdf) — Queues, SRI, escape valve, toy simulations. **PRIMARY**
3. HyperEVM Mainnet On-Chain State (`rpc.hyperliquid.xyz/evm`, blocks 48359148–48362893) — Permissions, parameters, ledgers, events, cap history, impact proposal. **PRIMARY**
4. [Papertrade Stats API](https://exchange.papertrade.xyz/query/protocol/history?interval=1d) — Volume, OI, LP, dividends, PAPER supply. **PRIMARY**
5. [Hyperliquid: Interacting with HyperCore](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm/interacting-with-hypercore) — Precompile read semantics, gas costs, CoreWriter. **PRIMARY**
6. [Hyperliquid: Dual-Block Architecture](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm/dual-block-architecture) — Small blocks 1s, big blocks 1m. **PRIMARY**
7. [Hyperliquid: Robust Price Indices & Oracle](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/robust-price-indices) — Construction of mark price and oracle price. **PRIMARY**
8. [hyperliquid-dev/hyper-evm-lib](https://github.com/hyperliquid-dev/hyper-evm-lib) — BBO, mark, and oracle precompile addresses and return structs. **PRIMARY**
9. [@papertrade_xyz Launch Announcement (2026-10-10)](https://x.com/papertrade_xyz/status/2108852108766437759) — Launch timing, $10M position limit, $1B margin headroom, multisig participants. **PRIMARY**
10. [@papertrade_xyz Incident Statement (2026-10-11)](https://x.com/papertrade_xyz/status/2109308773231911359) — Acknowledgment of manipulation and cap reductions. **PRIMARY**
11. [DeFi Prime: Papertrade Tightens OI Caps](https://defiprime.com/papertrade-tightens-caps-after-bbo-manipulation) — Reports incident details; notes official statements omitted wallet addresses.
12. [The Block / The Token Press](https://www.thetokenpress.com/article/papertrade-tightens-risk-limits-after-1-28m-pricing-incident-11759d20) — Media reporting on exploiter wallets and estimated profits.
13. [Rollbit: Price Formulation & 1000x Futures](https://blog.rollbit.com/1000x-leverage-crypto-futures/) — Original market-impact formulation and fee schedules. **PRIMARY**
14. [GMX Docs: Fees & FastPriceFeed.sol](https://github.com/gmx-io/gmx-contracts/blob/master/contracts/oracle/FastPriceFeed.sol) — v2 impact / ADL mechanics and v1 skew spreads. **PRIMARY**
15. [Cointelegraph: GMX AVAX Price Manipulation Exploit](https://cointelegraph.com/news/decentralized-exchange-gmx-suffers-565k-price-manipulation-exploit) — Media report of 2022 exploit.
16. [CertiK: GMX Incident Analysis](https://www.certik.com/blog/gmx-incident-analysis) — Exploit root-cause analysis and remediation.
17. [gTrade Docs: Fees, Spread & gToken Vaults](https://docs.gains.trade) — Dynamic borrow fees, closing fee decay, GNS backstop. **PRIMARY**
18. [Jupiter Perps: Documentation & Fees](https://docs.jup.ag/user-docs/trade/perps) — Tri-oracle feeds and anti-external manipulation impact fees. **PRIMARY**
19. [Ostium: Vault Overview](https://docs.ostium.com/vault/overview) — Off-chain hedging and subordinated buffers. **PRIMARY**
20. [Avantis: Upside Perps](https://docs.avantisfi.com/trading/upside-perps) — Winner profit retention schedule of 75–95%. **PRIMARY**
21. [Hyperliquid: Protocol Vaults & HLP](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/vaults/protocol-vaults) — HLP protocol counterparty mechanics. **PRIMARY**
22. [Mantle: Joins Chainlink Scale Announcement](https://www.mantle.xyz/blog/announcements/mantle-network-joins-chainlink-scale) — Data Feeds and Data Streams roadmap. **PRIMARY**
23. [Chainlink: Data Streams Supported Networks & Schema v3](https://docs.chain.link/data-streams/supported-networks) — Feed availability and simulated impact pricing. **PRIMARY**
24. [Pyth: EVM Contract Addresses & Upgrades](https://docs.pyth.network/price-feeds/core/contract-addresses/evm) — Pull oracle deployment status. **PRIMARY**
25. [Mantle Docs: Oracles, AA & Skadi Upgrade](https://docs.mantle.xyz) — Network tooling, account abstraction, EIP-7702 status. **PRIMARY**
26. [Circle: CCTP Supported Chains & Addresses](https://developers.circle.com/cctp/concepts/supported-chains-and-domains) — Native USDC and CCTP directory. **PRIMARY**
27. [Mantle Token List & USDT0 Ecosystem](https://token-list.mantle.xyz) — Standard bridge mappings and USDT0 supply. **PRIMARY**
28. [Across: Supported Chains Directory](https://legacy-docs.across.to/reference/supported-chains) — Bridge network directory.
29. [DefiLlama: KTX.finance Telemetry](https://defillama.com/protocol/perps/ktx.finance) — Mantle native derivative aggregates.
30. Research Hub Report: `application-specific-sequencing` (`/p/application-specific-sequencing/`) — Mantle preconf and multi-lane architecture.
31. ChatGPT Deep Research Dossier (`research/papertrade-deep-dive.md`) — External preliminary background notes.
32. [nirholas/papertrade-sdk](https://github.com/nirholas/papertrade-sdk) — Third-party SDK parameter verification.
33. [Hyperliquid: Tick and Lot Size Specifications](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size) — 5 significant figures price precision. **PRIMARY**

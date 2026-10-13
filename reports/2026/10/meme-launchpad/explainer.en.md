---
template: research
title: Meme Launchpad: Mechanics, Evolution & Agentic Design
subtitle: Launchpads make contracts the trading counterparty so token launches require zero upfront capital; each generation primarily evolved to eliminate migration attack vectors. Agentic designs require verifiable on-chain permissions.
cols: 4
type: Technical Research · Onboarding
audience: Developers familiar with EVM / Solidity exploring meme launchpads and agent wallets for the first time
scope: Mechanics and lifecycle, major product post-mortems, design rationale for Mantle's agent-first launchpad
evidence: 184 claims ledger (observed 133 / inferred 34 / speculative 17), primary sources accessed 2026-10-05
date: 2026-10-05 · v1
---
Bottom line: Meme launchpads use contracts as trading counterparties, pricing buys and sells on constant-product bonding curves with [[virtual reserves]]. This lets creators launch without supplying initial liquidity, and no channel exists to withdraw liquidity during the curve phase. Successive designs have reduced the attack surface at [[migration]] upon graduation ([F1](#F1)). Opening [[sniping]], activity collapse after subsidies expire, and per-token value dilution remain unresolved ([F2](#F2), [F5](#F5), [F6](#F6)). Bankr already enables agents to launch tokens; what agentic architectures must provide is verifiable permissions: implemented as an on-chain verifiable [[session key]] sandbox ([F8](#F8)).

## A Anatomy of a Launchpad {sheet meta="components"}
```tree list
`Factory` Token Factory | Creates token and curve in a single transaction
`Curve` Curve Contract (Curve Phase) | Contract acts as counterparty, pricing via formula
`Graduation` Graduation Gate | Freezes curve once predefined condition is met
`AMM pool` AMM Pool (AMM Phase) | Open market trading post-graduation
`Locker` LP Custody | Burns or permanently locks liquidity provider tokens
`Fee router` Fee Router | Distributes revenue across creator, protocol, and LP
```

## B Bonding Curve Formula (pump.fun Classic SOL Curve) {sheet span=2 meta="annotated"}
```annot
# Constant Product + Virtual Reserves | Units: SOL, tokens
([x]{Real SOL raised, starts at 0} + [30]{Virtual SOL: establishes non-zero opening price}) × ([y]{Tokens remaining on curve, starts at 793.1M} + [279.9M]{!Virtual tokens: ensures finite price for final token}) = [k]{3.219e10, invariant throughout}
> Opening price 2.80e-8 SOL; when curve tokens sell out, x ≈ 85 SOL at 14.7x opening price
```

## C Three Graduation Archetypes {sheet meta="graduation"}
| Type | Representative | Migration Attack Surface |
|---|---|---|
| A Migrate to External DEX | four.meme (pre-2025-03) | no Vulnerable to front-run pool creation |
| B Atomic Migration to Native Pool | pump.fun, Pons V2 | ok Narrowed surface |
| C Curveless Single-sided | Clanker, Zora, PAIR | ok Zero migration step |

## D Key Metrics (pump.fun, 2026-10) {sheet span=2 meta="numbers"}
| Metric | Value | Source |
|---|---|---|
| Total Supply / Curve Supply | 1.0B / 793.1M tokens | Program parameters [1] |
| Real SOL Required for Graduation | ~85 SOL | Derived from parameters |
| Curve Trading Fee | 1.25% (Creator 0.30% + Protocol 0.95%) | Official fee schedule [2] |
| Creation / Graduation Fee | 0 / 0.015 SOL | Official fee schedule [2] |

## E Evolution Timeline {sheet span=2 meta="2024–2026"}
```timeline
2024-05 | pump.fun Authority Incident | Former employee abused withdraw authority for ~$1.9M
2024-08 | pump.fun Free Token Creation | Creators receive initial reward (0.5 SOL)
*2025-02 | four.meme Exploit | Target pool price unchecked during migration, ~$183K
2025-03 | PumpSwap Launch | Migrations route to in-house DEX, fee 6 SOL → 0
2025-05 | Perpetual Creator Revenue Split | pump.fun allocates portion of every trade to creators
2025-10 | Farcaster Acquires Clanker | Neynar subsequently acquires Farcaster in 2026-01
2026-02 | Base Sunsets Creator Rewards | Subsidies phased out
2026-07 | Robinhood Chain Mainnet | Pons, PAIR use stock tokens as quote assets
2026-08 | Printr Shuts Down | Official reason: capital and distribution constraints
*2026-09 | Robinhood Gas Subsidy Expires | Launchpad volume declines (secondary data)
```

## F Conclusions {sheet span=4}
```callout ok Master the curve and graduation before discussing agents
1) Mechanics: Contracts use virtual reserves as counterparties, enabling zero upfront capital for creators; burning or permanently locking LP positions prevents withdrawal of that liquidity, making liquidity-withdrawal rug pulls technically impossible. 2) Lessons: Relocating funds into external pools at graduation is the single largest engineering risk; subsidies cannot purchase retention. 3) Agentic: The missing layer is permissioning, not the underlying chain; start on Mantle L2 with application-layer account abstraction, and only explore L3 if conditions F1–F3 are empirically proven on-chain.
```

## G How to Read {depth=1}
```callout info Assumed Knowledge (not re-explained here)
- ERC-20 tokens, contract calls, and events
- Transactions require gas, blocks have deterministic order, mempool transactions are publicly observable
- Token swaps on decentralized exchanges (DEXs)
```
- **5 minutes**: Read Overview (A–F) and Lead.
- **30 minutes (Developers implementing mechanics)**: Follow [Prerequisites](#panel-I), [Lifecycle](#panel-J), and [Three Graduation Archetypes](#panel-K).
- **30 minutes (Participating in agentic design)**: Read [Why Make Agents First-Class Citizens](#panel-N), [Architecture Design](#panel-O), and [Design Trade-offs](#panel-P).
- **Full Deep Dive**: Review [Methodology and Evidence](#panel-R) detailing fact-checking against primary sources.

## H Background & Motivation {depth=2}
**Problem**: Launching a new token on traditional DEXs requires creators to provide both sides of the initial liquidity while retaining the ability to withdraw it at will. Retail users fear rugs, while bots snipe the first block after launch. Launchpads make the contract serve as the trading counterparty, converting these three trust problems into deterministic code.

**Why Now**:
- Two attempts on Mantle have ceased operations: Funny Money (launched 2025-02 as an AI agent launchpad and DeFAI terminal) and Printr (multi-chain launchpad, ceased operations 2026-08) [23][24].
- Agentic token issuance and trading are already operational on Base and Robinhood Chain (Bankr, Clanker) [25][13].
- Mantle is planning an agent-first launchpad, requiring technical documentation for developers to build upon.

**Scope**: Mechanics and mathematics, complete lifecycle, retrospective analysis of major products, structural flaws, and architectural foundations for agentic designs.

**Non-goals**: Tape (xStocks-denominated launchpad proposals); compliance details; schedules and KPIs; financial advice.

**Running Example**: The classic pump.fun SOL curve. Its parameters are public and reproducible; every subsequent panel illustrates mechanics on this curve before generalizing.

## I Prerequisites {depth=2}
```excalidraw q="What concepts are necessary to understand launchpads and agentic designs, and in what order?" read="Arrows indicate sequence: learn first → learn next. Gray dashed boxes represent assumed knowledge; green boxes represent the core themes." takeaway="B-0 → B-1 covers curves; B-2 → B-3 covers modern pool architectures; B-5 is prerequisite for agentic design." name=prereq-map kind="Prerequisites Map"
{"grid": {"w": 300, "h": 120}, "defaults": {"w": 190, "h": 60},
 "nodes": [
   {"id": "erc", "label": "ERC-20 & Contracts (Assumed)", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "gas", "label": "Gas & Ordering (Assumed)", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 Constant Product AMM", "col": 1, "row": 0, "color": "blue"},
   {"id": "b2", "label": "B-2 Concentrated/Single-sided", "col": 1, "row": 1, "color": "blue"},
   {"id": "b4", "label": "B-4 Sniping & MEV", "col": 1, "row": 2, "color": "blue"},
   {"id": "b5", "label": "B-5 Account Abstraction", "col": 1, "row": 3, "color": "blue"},
   {"id": "b1", "label": "B-1 Virtual Reserve Curve", "col": 2, "row": 0, "color": "blue"},
   {"id": "b3", "label": "B-3 Uniswap v4 Hooks", "col": 2, "row": 1, "color": "blue"},
   {"id": "life", "label": "Lifecycle & Products", "col": 3, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "agent", "label": "Agentic Architecture", "col": 3, "row": 3, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "erc", "to": "b0"}, {"from": "b0", "to": "b1"}, {"from": "b0", "to": "b2"},
   {"from": "b2", "to": "b3"}, {"from": "gas", "to": "b4"}, {"from": "gas", "to": "b5"},
   {"from": "b1", "to": "life"}, {"from": "b3", "to": "life"}, {"from": "b4", "to": "life"},
   {"from": "b5", "to": "agent"}, {"from": "life", "to": "agent"}
 ]}
```

```prereq B-0 l1 5min
# Constant Product AMM
what: A liquidity pool holding assets x and y, maintaining x × y = k before and after trades. Purchasing more y increases the price of remaining y.
why: Launchpad curves implement this formula, substituting part of the reserves with "virtual" numbers.
example:
~~~
Pool: x = 10 SOL, y = 1000 tokens, k = 10000
Buy with 1 SOL → x = 11, y = 10000/11 ≈ 909.1, receive ~90.9 tokens
~~~
misconception: Misconception: Prices are set by manual order books. Fact: Price is strictly determined by the ratio of the two reserves.
deeper: [9] Uniswap v4 Architecture Documentation
```

```prereq B-1 l1 8min
# Virtual-Reserve Bonding Curve
what: Adding constants to both sides of the constant product formula to act as non-existent "virtual" reserves. The contract prices each buy and sell along this curve.
why: Under pure real reserves, initial SOL reserve is 0, giving an initial price of 0 where the first buy could drain the pool virtually for free; conversely, the price of the last token tends toward infinity. Virtual reserves resolve both challenges simultaneously.
example:
~~~
pump.fun: (x + 30) × (y + 2.799e8) = 3.219e10
Opening price: 30 / 1.073e9 ≈ 2.80e-8 SOL
~~~
misconception: Misconception: Virtual reserves represent capital subsidized by the platform. Fact: They are immutable constants within the formula; no party can withdraw them.
deeper: [1] pump-public-docs, Global and BondingCurve sections
needs: B-0
```

```prereq B-2 l1 6min
# Concentrated and Single-Sided Liquidity
what: Concentrated liquidity restricts LP market making to a bounded price range. Single-sided liquidity places the entire position on one side of current price, holding only a single asset.
why: Clanker, Zora, and PAIR deploy their entire token supply as a single-sided position, absorbing quote assets as price appreciates. This position replicates bonding curve behavior without requiring graduation.
misconception: Misconception: Single-sided pools have an active counterparty at launch. Fact: The pool initially holds only the new token; the first buyer experiences zero competitive liquidity.
deeper: [9] Uniswap v4 Concepts Documentation
needs: B-0
```

```prereq B-3 l1 8min
# Uniswap v4 Hooks
what: Contracts attached at pool initialization invoked before and after swaps or liquidity modifications. They can dynamically alter swap amounts and fee tiers.
why: Decaying taxes, maximum wallet caps, fee routing, and in-pool graduation are implemented via hooks. All pools are managed by a single [[PoolManager]], making pool creation a single state update.
example:
~~~
The lower 14 bits of hook address define permissions:
beforeSwap = 1 << 7
beforeSwapReturnDelta = 1 << 3
~~~
misconception: Misconception: A pool's hook address can be replaced after initialization. Fact: Hook addresses are embedded in pool IDs and remain immutable.
deeper: [8] v4-core `Hooks.sol`
needs: B-2
```

```prereq B-4 l1 5min
# Sniping and MEV
what: Sniping occurs when automated bots purchase tokens in the first block after launch. [[MEV]] represents value extracted via transaction ordering, including [[sandwich attack]]s.
why: Virtual reserve curves are heavily front-loaded: upon 30 SOL net inflow, 53.65% of total supply has already been distributed. Earlier purchases capture disproportionately larger supply fractions.
misconception: Misconception: Sniping is a governance flaw solvable by banning bots. Fact: It stems directly from curve geometry; protocols can only mitigate it via delays, decaying taxes, and wallet limits.
deeper: [13] Clanker MEV Module Documentation
```

```prereq B-5 l1 8min
# Account Abstraction and Session Keys
what: Account abstraction makes accounts smart contracts, enabling custom signature verification. [[session key]] delegations are temporary keys authorized for specific contracts, functions, allowances, and expiries.
why: Autonomous agents must launch and trade tokens without possessing the master root private key. [[EIP-7702]] allows EOAs to delegate to smart contract code; [[ERC-4337]] provides gas sponsorship via [[Paymaster]] and [[2D nonce]] parallel channels.
misconception: Misconception: EIP-7702 inherently enforces spend limits and whitelists. Fact: 7702 only delegates execution; spend control relies on the delegation contract or [[ERC-7579]] modules.
deeper: [30] EIP-7702 Specification
```

## J Token Lifecycle: Creation to External Market {depth=2}
```uml q="What states does a pump.fun token transition through? What triggers migration?" read="State identifiers match contract fields. Dead is not a contract state; it represents inactive volume." takeaway="Graduation is triggered purely by token depletion on the curve, independent of USD valuation or price oracles."
stateDiagram-v2
  state "Curve Phase (Internal)" as Trading
  state "Complete (complete=true)" as Complete
  state "Migrated (AMM Phase)" as Migrated
  state "Inactive" as Dead
  [*] --> Trading : create_v2 (optional bundled dev buy)
  Trading --> Trading : buy / sell along curve
  Trading --> Complete : real_token_reserves == 0
  Trading --> Dead : prolonged inactivity
  Complete --> Migrated : migrate (permissionless & idempotent)
  Migrated --> Dead : liquidity drained
  note right of Complete : Curve rejects subsequent buys/sells
```

```uml q="During creation, trading, and graduation, which actor invokes which component?" read="Modeled on pump.fun; steps 5-8 represent graduation." takeaway="Migration executes atomically: pool creation, liquidity provision, and LP burning occur in one transaction."
sequenceDiagram
  autonumber
  participant C as Creator
  participant B as Sniping Bot
  participant U as Trader
  participant P as Pump Program
  participant M as Migration Executor
  participant S as PumpSwap
  C->>P: create_v2 + buy_v2 (bundled dev buy)
  P-->>B: CreateEvent (on-chain subscriber)
  B->>P: buy (same slot or next slot)
  U->>P: buy / sell (1.25% fee per trade)
  U->>P: final curve buy
  P->>P: real_token_reserves == 0, complete = true
  M->>P: migrate(mint)
  P->>S: Create pool: ~206.9M tokens + ~85 SOL
  S-->>P: LP tokens, immediately burned
  U->>S: AMM Phase buy / sell
```

**Curve Pricing Schedule** (Classic pump.fun SOL curve, derived via formula [1]):

| Net Inflow (SOL) | Sold % of Total Supply | Token Price (SOL) | Multiple vs Opening |
|---|---|---|---|
| 0 | 0% | 2.80e-8 | 1× |
| 10 | 26.82% | 4.97e-8 | 1.78× |
| 30 | 53.65% | 1.12e-7 | 4.0× |
| 60 | 71.53% | 2.52e-7 | 9.0× |
| 85.0 (Graduation) | 79.31% | 4.11e-7 | 14.7× |

The first 30 SOL captures over half of the entire supply, whereas the final 25 SOL distributes only ~7.8%. This mathematical asymmetry explains why opening sniping is structurally lucrative ([B-4](#B-4)).

**Key Observations Across Lifecycle Stages**:
1. **Creation**: Zero protocol creation fee [2]. Token initialization and initial purchase can be bundled in a single transaction as a [[dev buy]] [4].
2. **Curve Phase**: Fixed 1.25% fee per trade (0.30% creator, 0.95% protocol) [2]. The base contract has no anti-sniping protection beyond user slippage settings `max_sol_cost` / `min_sol_output` [1].
3. **Graduation Gate**: Triggered during a buy instruction when `real_token_reserves == 0` is reached [1]. The commonly cited "$69k graduation" simply reflects 410.88 SOL market capitalization at contemporary SOL valuations.
4. **Migration**: `migrate` is permissionless and idempotent; anyone may trigger it [1]. Early architectures relayed funds to Raydium via an off-chain server using a privileged `withdraw` instruction (now disabled) [1]. Since 2025-03-20, migration routes into [[PumpSwap]], dropping migration fees from 6 SOL to 0 [5].
5. **AMM Phase**: Graduated [[canonical pools|canonical pool]]s apply tiered trading fees based on market capitalization [2][4].
6. **The Long Tail**: The overwhelming majority of tokens stall on the curve or depreciate to zero post-graduation. Under Uniswap v4, creating a pool requires only a storage update within the PoolManager singleton without deploying separate contracts [9].

```callout warn CAUTION: Modern pump.fun Diverges from Classic Parameters
The source author reported September 2026 samples injecting only 0.086 SOL with supplies deviating from 1.0B tokens. Mayhem mode, in which an AI agent trades during the first 24 hours, is a possible explanation; this report has not verified it. Always query on-chain account state rather than hardcoding constants.
```

## K Three Graduation Archetypes {depth=2}
```uml q="What path do funds follow during graduation? Where does the attack surface emerge?" read="Red dashed lines represent attack vectors. Archetypes are categorized by capital path rather than v4 adoption." takeaway="Migrating funds to an external pool that allows permissionless initialization introduces front-running risks."
flowchart TB
  subgraph A["A: Migration to External DEX"]
    direction LR
    a1["Curve Contract"] -->|"Withdraw + Add Liquidity"| a2[("External DEX Pool")]
    x["Attacker"] -.->|"Front-run Init with Distorted Price"| a2
  end
  subgraph B["B: Atomic Migration to Native Pool"]
    direction LR
    b1["Curve Contract"] -->|"Single Atomic Tx"| b2[("Native AMM Pool")]
    b2 --> b3["Burn or Lock LP"]
  end
  subgraph C["C: Curveless Single-Sided Pool"]
    direction LR
    c1["Factory"] -->|"Single Deploy"| c2[("Single-Sided LP in Final Pool")]
  end
  A ~~~ B
  B ~~~ C
  linkStyle 1 stroke:#d33,stroke-dasharray:4
```

| Type | Examples | Capital Flow | Remaining Vulnerability |
|---|---|---|---|
| A Migrate to External DEX | Early pump.fun (Raydium), four.meme | Cross-protocol pool creation | Pre-initialization exploits, off-chain relayers |
| B Atomic Migration to Native Pool | Modern pump.fun, Pons V2 | Atomic pool creation & LP lock | Information shock at graduation |
| C Curveless Single-Sided | Clanker, Zora, Flaunch, PAIR | Zero asset migration | Opening block sniping |

- **Why Type C is Viable**: Uniswap v4 relies on a singleton [[PoolManager]], reducing pool creation to state modification; hooks can override dynamic fee structures inside `beforeSwap`, providing the primitive Clanker and Zora use for decaying taxes [8][9].
- **"In-Hook Curve with In-Place Phase Shift"**: Technically feasible. Hooks bearing `beforeSwapReturnDelta` permissions can intercept swap amounts and quote via arbitrary bonding curve formulas [8]. We did not identify a production launchpad using this architecture (speculative; search incomplete). Pons V2 utilizes a standalone curve contract that mints v4 positions upon graduation, placing it under Type B [18].
- **"v4 Yields Zero MEV" is False**: Eliminating pool migration merely removes the migration execution gap. Front-running and sandwiching along the bonding curve remain mathematically unchanged.

```uml q="How was four.meme exploited in 2025-02?" read="The attacker initialized the target pool at a manipulated price prior to graduation." takeaway="The vulnerability arose from failing to validate pool price during migration, not reentrancy."
sequenceDiagram
  autonumber
  participant A as Attacker
  participant F as four.meme Migration Contract
  participant V as PancakeSwap V3
  A->>V: Pre-initialize meme/WBNB pool at 3.68e14x inflated price
  A->>F: Wash trade curve to trigger graduation
  F->>V: Target pool exists, injects 200M tokens and ~24 WBNB without price validation
  A->>V: Swaps minimal meme tokens to drain entire WBNB reserves
  Note over A,V: ~$183K loss across ~20 tokens exploited via identical vector
```

## L Major Product Retrospective {depth=2}
**Issuance & Graduation Mechanisms**:

| Product | Issuance Model | Graduation Mechanism | Status (2026-10) |
|---|---|---|---|
| pump.fun (Solana) | Virtual reserve curve | Depletion → Atomic migration to PumpSwap | Added USDC quote support [2] |
| four.meme (BSC) | Virtual reserve curve, multi-quote | Quote threshold → PancakeSwap V2, burn LP | Restructured post two 2025 exploits [12] |
| Clanker (Base, etc.) | Single-sided v4 LP | None | Acquired by Farcaster, then Neynar [14][15] |
| Zora (Base → Solana) | v4 hook + Doppler multi-range | None | Expanded to Solana in 2026-02 [16] |
| Flaunch (Base) | 30-min fixed price → Full range | None | Revenue substantially contracted (secondary data) |
| Pons V2 (Robinhood Chain) | Matching quote curve | Mints full-range v4 position into locker | Cooled post-subsidy expiration (secondary) [18][37] |
| PAIR (Robinhood Chain) | 1–5 stock-quoted single-sided pools | Informational badge only | Suffered 35x depeg over market weekend [19] |

**Fee Schedules & Launch Protection**:

| Product | Trading Fee & Creator Split | Launch Protection |
|---|---|---|
| pump.fun | 1.25%, Creator 0.30% | None; user slippage only |
| Clanker | Creator fee plus protocol surcharge equal to 20% of creator fee | Decaying tax 80% → 5% (recommended 30s) |
| Zora | 1%, multi-party split | 99% sniping tax decaying over 10s |
| Flaunch | 1%, Creator 0–100%, remainder to [[PBW]] | Fixed-price window |
| Pons V2 | 1%, Creator ~35% | Conflicting parameters in docs vs README |
| PAIR | 1%, Creator 70% | Max 5.5% tx / 5.0% wallet cap within 5 blocks |
| Bankr | 1.75% total, Creator 0.665% | 14s decay tax + 2% wallet cap for 5 min |

**Local Context on Mantle**: Funny Money was launched by Mantle on 2025-02-18 as an AI agent launchpad and DeFAI terminal, accompanied by a 1M MNT trading competition prize pool [23]. Its official website now states it is "sunsetting its trading platform" without primary timestamps. Printr was a multi-chain launchpad that announced a $4.5M fundraising round in 2025-10 (with Mantle EcoFund participation); on 2026-08-17 it announced sunsetting operations by August 31, citing capital and distribution constraints [24]. Neither product established a native, generalized meme curve on Mantle.

## M Structural Defects and Design Axioms {depth=2}
```finding F1 high
# Asset Migration is the Primary Engineering Attack Surface in EVM Launchpads
claim: four.meme was exploited twice (2025-02-11 and 2025-03-18); both incidents resulted from target-pool pre-initialization or contamination. Subsequent launchpads migrated atomically into proprietary pools or eliminated migration entirely.
evidence: [observed] Verichains incident analysis: failure to validate sqrtPriceX96 on pre-existing pools caused ~$183K loss [10]. [observed] Second exploit abused deterministic pair address pre-funding [11]. [observed] 2025-03-31 architecture updated to PancakeSwap V2 migration with burned LP [12].
implication: Never transfer funds into an external pool that allows permissionless initialization. Use Type B or Type C architectures (see K).
```

```finding F2 high
# Opening Sniping Originates from Curve Geometry; Protocols Can Only Mitigate It
claim: Under classic curves, 53.65% of total supply is sold within the first 30 SOL net inflow. Protocols deploy delays, decaying taxes, wallet caps, and fixed-price windows to dampen sniping, but none eradicate it.
evidence: [inferred] Derived from curve formulas (see price schedule in J) [1]. [observed] Clanker recommends an 80% → 5% decay over 30s [13]; Zora applies 99% over 10s [16]; Bankr combines 14s decay with 5-minute 2% wallet cap [25].
implication: Anti-sniping parameters must match block production intervals. Faster, more deterministic block times allow finer tax decay steps.
```

```finding F3 medium
# Perpetual Creator Revenue Splits Replaced One-Time Grants but Cannot Buy Retention
claim: pump.fun transitioned from 0.5 SOL graduation incentives to a perpetual 0.30% fee split; Zora, Pons, PAIR, and Bankr similarly distribute volume-based splits. When speculative volume wanes, creator earnings drop to zero.
evidence: [observed] pump.fun 0.5 SOL grant in 2024-08 followed by trade fee splits starting 2025-05 [7][2]. [observed] Base App distributed ~$450K across ~17K creators over 7 months (~$26 average) [22]. [inferred] Zero quantitative evidence indicates fee sharing reduces insider self-dealing.
implication: Embed revenue splits in contracts, but do not rely on them as a user retention engine.
```

```finding F4 medium
# Multi-Quote Assets Fragment Liquidity without Production-Grade Balance Mechanisms
claim: Each quote token requires an independent pool without automated rebalancing. When stock tokens serve as quote assets, single meme pools can lock the majority of a tokenized stock's circulating supply, causing massive pricing distortions when underlying equity markets close.
evidence: [observed] PAIR's AMC pool traded at 35x real market price over a weekend; the proposed peg guard would only pause new launches and had not yet launched [19]. [observed] A single HIMS pool held ~53% of on-chain tokenized HIMS supply (another study reports approximately 81%; the measurement bases differ).
implication: Multi-quote setups require unified cross-routing and weekend circuit breakers; otherwise launch initially with a single quote asset.
```

```finding F5 high
# Subsidies and Exclusive Distribution Only Purchase Cold Starts
claim: Base App sunset Creator Rewards, with leadership publicly acknowledging the failure of social creator tokens. Robinhood Chain's 90-day gas subsidy expired on 2026-09-29; launchpad activity declined afterward, according to secondary reporting. Printr similarly cited capital and distribution constraints.
evidence: [observed] Base App sunset Creator Rewards in 2026-02; Jesse Pollak wrote on 2026-07-15 that creator coins "disintegrated completely … I was definitively wrong" [22]. [observed] Robinhood gas subsidy ran for 90 days, expiring 09-29 [21]. [speculative] Pons daily fees declined ~78% post-expiry (secondary reporting) [37]. [observed] Printr shutdown notice [24].
implication: Evaluate KPIs by graduation counts and post-graduation token survival rates rather than gross token launches.
```

```finding F6 medium
# Zero-Barrier Issuance Dilutes Individual Token Market Value
claim: When token deployment carries near-zero cost, supply expands unchecked via bots and automated agents, driving down average value per token.
evidence: [observed] Pollak public reflection on social issuance failure [22]. [speculative] Average fee revenue per Clanker token dropped from $1,371 in 2024-12 to $53 in 2026-08 (unverified DefiLlama aggregate). [inferred] Bankr requires quota, wallet age, IP, and balance thresholds to curb sybil flooding [25].
implication: Implement launch quotas or Sybil barriers before offering zero-fee agentic launches.
```

```finding F7 medium
# Administrative Privileges Introduce Third-Party Trust Risk
claim: Even in audited contracts, actors holding withdrawal or configuration permissions represent critical vulnerabilities.
evidence: [observed] 2024-05-16 pump.fun exploit where a former employee used withdrawal authority to siphon ~12.3K SOL (~$1.9M) [6]. [observed] Pons locker contract explicitly states "nobody, including protocol admin, can withdraw liquidity" [18].
implication: Immutable parameters and recipient addresses must be hardcoded; any retained admin keys must be publicly verifiable on-chain.
```

**Design Axioms Derived from Empirical Findings** (all inferred):
1. Avoid migration dependent on external pool creation: use single-sided LP or native in-pool graduation.
2. Align anti-sniping parameters with block interval granularity, or adopt deterministic quota gates or auction-based gating.
3. Code perpetual creator fees directly into contracts, but do not view them as retention guarantees.
4. Multi-quote deployments require cross-pair routing and market-close circuit breakers.
5. Subsidies only subsidize cold starts; optimize for token survival rates.
6. Enforce immutable recipient routing in code and render admin privileges transparent.

## N Why Make Agents First-Class Citizens {depth=2}
```excalidraw q="How do permission boundaries differ between bot-attached wallets and first-class agent sandboxes?" read="Top: conventional setup where bot holds master key. Bottom: proposed architecture where agent operates within restricted session sandbox." takeaway="If an agent is compromised or prompt-injected, damages are strictly bounded by whitelists, caps, and expiry." kind=Comparison
{"grid": {"w": 360, "h": 140}, "defaults": {"w": 200, "h": 64},
 "nodes": [
   {"id": "k", "label": "Human Root Key", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "bot", "label": "Bot / LLM", "col": 1, "row": 0, "color": "red"},
   {"id": "any", "label": "Arbitrary Tx & Transfer", "col": 2, "row": 0, "color": "red"},
   {"id": "o", "label": "Human Owner", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "s", "label": "Session Sandbox", "col": 1, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "fr", "label": "Factory / Router", "col": 2, "row": 1, "color": "blue"}
 ],
 "edges": [
   {"from": "k", "to": "bot", "label": "Share key"}, {"from": "bot", "to": "any", "label": "Unbounded", "strokeColor": "red"},
   {"from": "o", "to": "s", "label": "Grant/revoke"}, {"from": "s", "to": "fr", "label": "Allowlist"}
 ],
 "texts": [{"x": 360, "y": 300, "text": "Whitelist · Selectors · Allowances · Expiries", "fontSize": 16, "color": "green"}]}
```

**Permission Models in Existing Agentic Systems**:

| Product | First-Class Entity | Permission Location | Key Learnings |
|---|---|---|---|
| Bankr | Custodial wallet agent | Server-side policy: daily cap, single cap, recipient whitelist | Launch quotas, refunds on failure, machine-readable error codes |
| Clanker Droid | Human creator | Agent touches no funds ("not autonomous with your money") | Fee proceeds funding inference compute loops |
| Virtuals | Tokenized agent (issuance human-led) | No agent-facing spend limits | Revenue share, optional sniping tax |
| ElizaOS | Framework | Root private key stored in environment variables | Plugin encapsulation, optional TEE isolation |

```finding F8 high
# Existing Agentic Platforms Lack On-Chain Verifiable Permissions
claim: Bankr enables agents to deploy and trade with limits, but controls run on proprietary servers. ElizaOS stores root private keys in plaintext environment variables. Clanker Droid prohibits agents from moving funds altogether. The core differentiator must be framed as "on-chain verifiable policy independent of custodial servers."
evidence: [observed] Bankr defaults to $500 daily / $500 single-tx limits, with arbitrary calls enabled by default via off-chain policy [26]. [observed] Bankr explicitly warns that leaked agent keys can drain entire account balances [26]. [observed] ElizaOS mandates raw `EVM_PRIVATE_KEY` [29]. [observed] Droid docs [27].
implication: Do not claim competitors lack spend limits; emphasize that limits are cryptographically enforced on-chain.
```

```finding F9 high
# "Zero-Barrier Launch, Strict Trading Limits" Bounds Losses but Cannot Prevent In-Whitelist Depletion
claim: Issuance involves minimal inputs and deterministic branching, making it suitable for LLMs; trading involves slippage, MEV, and volatile pricing, requiring strict boundaries. While session keys prevent unauthorized asset transfers, an injected agent can still execute repeated unfavorable buys within whitelisted pools.
evidence: [observed] product.md design tenet: "Zero-barrier launch, strict trading limits; place machine intelligence within a physical on-chain sandbox" [38]. [observed] Mainstream session modules default to sudo permissions unless explicit policies are attached [33]. [inferred] Bounding losses within whitelists requires drawdown caps or factory-token restrictions.
implication: Always configure explicit expiry times and spend caps on sessions; incorporate maximum drawdown restrictions or restrict trading strictly to factory-issued tokens.
```

```finding F10 medium
# "Fees Funding Inference" Has Been Empirically Validated Across Protocols
claim: Agent token issuers capture a portion of transaction fees to subsidize their own inference and gas costs. Clanker, Bankr, and Virtuals all employ this model; the proposed 70%–80% split is aligned with Virtuals.
evidence: [observed] Clanker Droid allocates 10% of LP rewards [27]; Bankr creators receive 0.665% of volume [25]; Virtuals directs 70% of 1% tax [28]. [observed] Proposed design allocates ~1% fee, sending 70%–80% to agent runtime vaults [38].
implication: Hardcode fee recipient vaults at token launch; restrict runtime vaults to quote assets to prevent human diversion.
```

## O Architecture Design: Permissions, Capital, and Chain Requirements {depth=2}
The following architecture reflects the product.md proposal; "proposed" denotes design specifications rather than deployed infrastructure [38].

```uml q="How do capital and permissions flow from human owners to agents, and back to runtime vaults?" read="Solid lines denote calls or capital flow; sessions can only invoke Factory and Router." takeaway="Sessions permit token creation and swaps but forbid transfers; trading fees route exclusively to runtime vaults."
flowchart TB
  O["Human Owner"] -->|"Deposit Quote Assets"| AA["AgentAccount<br/>7702 EOA or 7579 Account"]
  O -->|"Issue / Revoke"| S["Session Sandbox<br/>Whitelist · Selectors · Allowance · Expiry"]
  AG["Agent"] -->|"Sign with Session Key"| S
  S -->|"launch"| F["LaunchpadFactory"]
  S -->|"buyExactQuote / sellExactToken"| R["Router"]
  F --> P[("v4 Pool + Hook")]
  R --> P
  P -->|"Trading Fees"| L["feeRecipients<br/>Immutable at Launch"]
  L -->|"Quote Assets"| V["Runtime Vault"]
  V -->|"Fund"| X["Inference / Gas"]
```

**Four Layers of Session Constraints** (Proposed):
1. **Target Whitelist**: Restrict execution strictly to `LaunchpadFactory` and `Router`; prohibit native `transfer` and arbitrary ERC-20 interactions.
2. **Selector Whitelist**: Limit calls to `launch(name, symbol)`, `buyExactQuote`, `sellExactToken`, and `claimFee`; prohibit arbitrary `approve`. Routers execute atomic approve-and-swap internally.
3. **Allowances**: Enforce per-tx, per-block, and lifetime spend caps in quote denominations alongside strict slippage bounds.
4. **Expiry and Revocation**: Implement mandatory time horizons (e.g., 24h auto-expiry) and instant on-chain revocation by the Owner.

These policies are implementable on ERC-7579 accounts via Rhinestone Smart Sessions, allowing simultaneous composition of call, spend, time, and usage policies [33].

```uml q="In what sequence do agent issuance, secondary agent purchase, and fee claiming occur?" read="Based on proposal: pool quotes via hook bonding curve, shifting to concentrated liquidity at threshold." takeaway="Hot execution paths are strictly structured contract calls without natural language or LLM involvement."
sequenceDiagram
  autonumber
  participant A as Agent A
  participant API as Launch API
  participant EP as EntryPoint + Paymaster
  participant AA as AgentAccount
  participant F as Factory
  participant P as v4 Pool + Hook
  participant B as Agent B
  A->>API: simulate(Deploy), zero quota consumed
  A->>EP: UserOp (signed via session key)
  EP->>AA: Validate session, Paymaster sponsors gas
  AA->>F: launch(name, symbol)
  F->>P: Deploy ERC-20, init pool (Phase 1 bonding curve)
  P-->>B: TokenLaunched Event
  B->>API: simulate(Buy)
  B->>P: buyExactQuote (hook enforces wallet limit)
  A->>P: claimFee
  P-->>AA: Quote fees routed to runtime vault
  Note over P: When cumulative buys reach threshold, hook switches to concentrated liquidity (Phase 2)
```

```uml q="Where do human and autonomous agent actors enter the system?" read="Dashed lines represent proposed mappings without live public implementations." takeaway="Human interfaces serve discovery and funding; core trading paths operate via structured APIs."
flowchart TB
  subgraph H["Human (Secondary Entry)"]
    h1["Bybit AI Chat"] --> h2["AI Subaccount<br/>Isolated Funds · API-Only"]
  end
  subgraph G["Agent (First-Class Citizen)"]
    g1["Acquire Session"] --> g2["Moltbook Forum<br/>Discovery & Cold Start"]
    g1 --> g3["Structured APIs<br/>Deploy / Buy / Sell"]
  end
  h2 -.->|"Proposed: Map to On-Chain Session"| g1
```

- **Human Portal**: Bybit AI Subaccounts launched 2026-05-27: isolated balances, zero master account exposure, API-only access [34]. Direct mapping to on-chain session keys remains an architectural proposal (speculative).
- **Agent Portal**: Moltbook is an agent-only social network launched in 2026-01 and acquired by Meta in 2026-03 [35]. The architecture positions it as an optional discovery layer that complements direct API execution.

**Infrastructure Requirements on Mantle**:

| Requirement | Proposal Scope | Status & Path |
|---|---|---|
| Session Permissions | Implement sessions via EIP-7702 | Mantle mainnet supports 7702 authorization txs [36]; policies require delegation contracts or 7579 modules |
| Pay Gas via Quote Asset | Protocol-level Paymaster | ERC-4337 specifies paymaster interfaces [31]; pricing stock tokens requires oracles (Open Question) |
| 2D Nonces | Decouple deploy & transfer queues | ERC-4337 provides 192-bit key + 64-bit sequence [31]; native RIP-7712 remains draft |
| Bursty Workloads | Fast failure for doomed reverts | Sequencer-level filtering required; prioritized in roadmap |

```finding F11 medium
# Most Proposed Chain Requirements Can Be Bootstrapped on L2 Application Layers
claim: EIP-7702 is already active on Mantle mainnet; 2D nonces and Paymasters are standard in ERC-4337. Mantle should maintain execution on L2, only considering an L3 deployment if conditions F1–F3 are empirically proven on-chain.
evidence: [observed] Mantlescan records ~60K EIP-7702 authorization transactions [36]. [observed] 4337 nonce structure and paymaster definitions [31]. [inferred] The claim that L2 cannot support 2D nonces only holds for raw EOAs and basic 7702 transactions. [observed] Documented bottlenecks: F1 hotspot spillover, F2 revert costs discouraging market makers, F3 co-located bot monopolies [38].
implication: Prioritize testing production readiness of EntryPoints, Bundlers, and Paymasters on Mantle L2 (Open Question 1).
```

## P Design Trade-offs: Product Proposal vs. Baseline Research {depth=2}
Within the project repository, product.md (the product blueprint) and earlier research outlines diverge across key architectural choices. This section contrasts both perspectives objectively.

| Dimension | product.md Proposal | Baseline Research / Outline |
|---|---|---|
| Quote Asset | mStocks core: funnel speculative demand into tokenized US equity spot volume | Default USDC: avoid dependency on stock tokens and complex gas conversion |
| Issuance Model | Bonding curve + v4 hook in-pool shift: remove migration while preserving price discovery | Curveless: single-sided pool + permanently locked LP deployed in one atomic tx |
| Bybit / byreal Integration | Deeply integrated: unified Bybit AI entry, byreal capturing all secondary liquidity | Loosely coupled: Bybit serves as secondary human portal; no direct chat issuance to KYC users |
| Reverting Transactions | Sequencer filters out inevitably reverting transactions at ingress | Impossible without sequencer modification; rely on pre-flight simulation and throttling |
| L3 Deployment Trigger | Global base fee surges and state bloat from dormant tokens | Strictly evaluate empirical metrics F1–F3 on Mantle mainnet first |

Contextual Constraints on Trade-offs:
- Public documentation indicates byreal operates as a Bybit-incubated **Solana** DEX [36]; deploying byreal on Mantle to host v4 pools represents an unpublished proposal (speculative).
- Bankr currently supports equity-denominated token launches across Robinhood Chain and Base [25], establishing external precedent for stock-quoted issuance.
- "Bonding curves inside hooks" lacks production battle-testing (see K); adopting this route introduces custom engineering and audit overhead.

## Q Limitations and Open Questions {depth=2}
- This report did not independently retrieve on-chain data. Aggregate metrics (four.meme graduation ratios, Clanker fee averages, Pons post-subsidy fees) originate from secondary sources and are flagged as speculative in the ledger.
- pump.fun's 2026 Mayhem mode mechanics and virtual reserve figures for USDC curves could not be verified via primary documentation.
- Anti-sniping parameters for Pons V2 conflict between documentation and source READMEs.
- Open Questions:
  1. Are production ERC-4337 EntryPoints, Bundlers, and Paymasters active and performant on Mantle mainnet?
  2. What oracle supplies pricing for equity-denominated gas sponsorship, and how are market-close stale states handled?
  3. Who holds and signs the cryptographic mapping from Bybit AI Subaccounts to on-chain session keys?
  4. What mathematical model converts bonding curve reserves into concentrated liquidity tick ranges during hook phase shifts?
  5. What programmatic guardrails prevent prompt-injected agents from trading down capital within whitelisted venues?

## R Methodology & Evidence {depth=3}
- **Sources**: Repository `mantle-v3-roadmap @ b819a33`, directories `2-meme-launchpad/` and `7-agent-meme-launchpad/` (agentic analysis anchored in product.md) [38].
- **Approach**: Three-lane parallel investigation covering mechanics, product retrospectives, and agentic design. External claims were only verified as observed when traced to primary sources; untraceable claims are designated speculative. Proposal texts are cited as "proposed."
- **Ledger**: 184 claims (133 observed, 34 inferred, 17 speculative), cataloged in `research/ledger.md`.
- **Primary Source Corrections to Initial Documents**:
  - four.meme exploits occurred in 2025-02 and 2025-03 due to target pool pre-initialization or contamination, not "Helper3 reentrancy."
  - Clanker was acquired sequentially by Farcaster (2025-10) and Neynar (2026-01), verified via official statements.
  - Clanker possesses no transferable "Fee Key NFT"; transferable yield NFTs were introduced by Flaunch (Memestream).
  - pump.fun graduation is triggered strictly by curve token depletion; the "$12K threshold" applies to four.meme.
  - Bankr's anti-sniping decay window spans 14 seconds.
  - Printr initiated operations wind-down on 2026-08-18, officially sunsetting on 08-31.

**Curve Mathematics Reproduction**:

```python
k = 30 * 1.073e9                      # Virtual SOL × initial virtual tokens
for s in [0, 10, 30, 60, 85.005]:     # Net real SOL raised
    v = k / (30 + s)                  # Remaining virtual tokens
    print(s, f"{(1.073e9 - v) / 1e9:.2%}", f"{(30 + s) / v:.3e}")
```

Expected final line: `85.005 79.31% 4.109e-07`.

## S Glossary {depth=2}
```glossary
virtual reserves | Virtual Reserves | Invariant constants added to curve formulas to provide an initial non-zero price and guarantee finite terminal pricing. | Not subsidized capital
bonding curve | Bonding Curve | Deterministic mathematical curve used by smart contracts to quote buy and sell orders.
curve phase | Curve Phase | Trading phase along the bonding curve prior to graduation. | AMM phase
AMM phase | AMM Phase | Trading phase in decentralized liquidity pools post-graduation.
graduation | Graduation | Milestone where curve conditions are met, halting curve trading to seed an AMM pool.
migration | Liquidity Migration | Transfer of accumulated curve reserves into an AMM pool upon graduation.
LP position | Liquidity Position | A liquidity position in an AMM; its representation depends on the implementation.
rug pull | Liquidity-withdrawal rug pull | Abrupt withdrawal of pool liquidity by token creators, crashing asset value.
dev buy | Creator Initial Purchase | Creator buying tokens bundled in the identical transaction that deploys the token.
sniping | Sniping | Automated purchases executed by bots within the first block after launch.
MEV | Maximal Extractable Value | Value captured by ordering, injecting, or censoring transactions within a block.
sandwich attack | Sandwich Attack | MEV strategy placing orders directly before and after a victim trade to extract slippage.
single-sided liquidity | Single-Sided Liquidity | Concentrated LP position deployed entirely on one side of market price with one asset.
concentrated liquidity | Concentrated Liquidity | AMM architecture where liquidity is allocated within finite price boundaries.
PoolManager | PoolManager Singleton | Core contract in Uniswap v4 managing all pool states and interactions.
hook | Hook Contract | External contract invoked before and after swaps or liquidity events in Uniswap v4. | Immutable post-creation
locker | Liquidity Locker | Custody contract that holds LP tokens, permitting fee claims while prohibiting liquidity withdrawal.
quote asset | Quote Asset | The asset used to price and purchase the newly issued token, such as SOL, USDC, or tokenized stocks.
creator fee | Creator Fee | Percentage of swap transaction fees routed directly to token creators.
PumpSwap | PumpSwap AMM | Proprietary constant product AMM launched 2025-03-20 to absorb graduating pump.fun tokens.
canonical pool | Canonical Pool | Primary AMM pool initialized upon graduation, subject to tiered protocol fees.
PBW | Progressive Bid Wall | Dynamic single-sided buy wall funded by fees deployed below market price by Flaunch.
Doppler | Doppler Protocol | Issuance protocol using Uniswap v4 hooks to structure multi-range liquidity positions.
session key | Session Key | Scoped ephemeral key authorized to execute transactions within strictly defined policies. | Not a master key
EIP-7702 | EOA Code Delegation | Ethereum upgrade enabling EOAs to delegate execution to smart contract code.
ERC-4337 | Account Abstraction | Standard enabling smart contract wallets via UserOperations, EntryPoints, and Bundlers.
ERC-7579 | Modular Smart Accounts (Draft) | Standard defining interoperable modular interfaces for smart accounts.
Paymaster | Gas Paymaster | ERC-4337 contract sponsoring gas fees on behalf of users, optionally charging ERC-20 tokens.
2D nonce | 2D Nonce | Multi-channel nonce model preventing transactions in separate lanes from blocking one another.
runtime vault | Runtime Vault | Contract custodying agent revenue to systematically subsidize inference and gas fees.
L3 | Application-Specific Chain | Specialized rollup operating atop an L2 for dedicated application throughput.
```

## T References {depth=2}
1. [pump-fun/pump-public-docs: PUMP_PROGRAM_README](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md) — Curve constants, graduation mechanics, permissionless `migrate`, LP burn. **PRIMARY**
2. [pump.fun Fees](https://pump.fun/docs/fees) — Fee schedule, graduation fees, USDC quote pairs. **PRIMARY**
3. [pump.fun Bonding Curve](https://pump.fun/docs/bonding-curve) — Constant product model, atomic migration. **PRIMARY**
4. [pump-public-docs README & FEE_PROGRAM_README](https://github.com/pump-fun/pump-public-docs) — `create_v2`, tiered market cap fees, PumpSwap virtual reserves. **PRIMARY**
5. [Cryptonews: PumpSwap Launch](https://cryptonews.com/news/pump-fun-launches-pumpswap-dex-to-rival-solanas-amms) — Migration fee reduction from 6 SOL to 0.
6. [The Block: pump.fun Post-Mortem](https://www.theblock.co/post/295029/pump-fun-post-mortem) — 2024-05 withdrawal authority exploit.
7. [The Block: pump.fun Fee Overhaul](https://www.theblock.co/news/markets/2024-08-09-pump-fun-cuts-fees-and-unveils-80-incentive-310376) — 2024-08 free token deployment and 0.5 SOL incentive.
8. [Uniswap v4-core `Hooks.sol`](https://github.com/Uniswap/v4-core/blob/main/src/libraries/Hooks.sol) — Hook permission bitflags, dynamic fees, `beforeSwapReturnDelta`. **PRIMARY**
9. [Uniswap v4 Concepts & Architecture](https://docs.uniswap.org/contracts/v4/concepts/hooks) — PoolManager singleton, immutable hook bindings. **PRIMARY**
10. [Verichains: Four.meme Hack Analysis](https://blog.verichains.io/p/fourmeme-hack-analysis) — 2025-02 incident mechanics and root cause. **PRIMARY**
11. [Decrypt: four.meme Second Exploit](https://decrypt.co/310388/meme-coin-launchpad-four-meme-falls-victim-to-another-exploit) — 2025-03 pair address pre-funding vulnerability.
12. [four.meme Official Announcement (Binance Square)](https://www.binance.com/en/square/post/22287851440922) — Migration update to PancakeSwap V2 with burned LP. **PRIMARY**
13. [Clanker Documentation](https://clanker.gitbook.io/documentation) — Single-sided liquidity, protocol fees, MEV architecture. **PRIMARY**
14. [Farcaster: Farcaster Acquires Clanker](https://farcaster.xyz/~/news/Farcaster-aquires-Clanker-l00yra) — Acquisition and buyback structure. **PRIMARY**
15. [Neynar: Neynar Acquires Farcaster](https://neynar.com/blog/neynar-is-acquiring-farcaster) — Operational stewardship of Clanker. **PRIMARY**
16. [Zora Coins Documentation](https://docs.zora.co/coins) — Token categories, anti-sniping fee structure, Doppler routing. **PRIMARY**
17. [Flaunch Documentation](https://docs.flaunch.gg) — Fixed-price launch windows, PBW mechanisms, Memestream. **PRIMARY**
18. [Pons V2 Documentation](https://www.ponsfamily.com/docs/v2) — Quote matching curves, graduation liquidity minting, non-custodial locker. **PRIMARY**
19. [PAIR Press Release (GlobeNewswire 2026-08-31)](https://www.globenewswire.com/news-release/2026/08/31/3353221/0/en/) — Multipool structure, transaction caps, AMC 35x divergence. **PRIMARY**
20. [Gate News: Uniswap Launches pools.trade](https://www.gate.com/news/detail/uniswap-launches-pools-token-launchpad-for-robinhood-chain-23246650) — Launch fee schedule and operational model.
21. [Robinhood Newsroom (2026-07-01)](https://robinhood.com/us/en/newsroom/robinhood-accelerates-global-expansion-robinhood-chain-mainnet-stock-tokens-agentic-trading/) — Mainnet deployment and tokenized stocks. **PRIMARY**
22. [CoinDesk: Pollak Acknowledges Social Strategy Shortcomings](https://www.coindesk.com/business/2026/07/15/coinbase-s-jesse-pollak-steps-back-from-base-app-leadership-after-admitting-his-crypto-social-strategy-failed) — Sunset of Base App Creator Rewards.
23. [Mantle Blog: Funny Money](https://www.mantle.xyz/blog/announcements/funny-money-mantle-network-ai-defai-launchpad) — AI launchpad positioning and trading competition. **PRIMARY**
24. [Printr Funding PR](https://www.prnewswire.com/news-releases/printr-raises-4-5m-partners-with-bybit-mantle--byreal-and-officially-launches-the-first-every-chain-token-launchpad) and [Shutdown Notice](https://cryptobriefing.com/printr-shuts-down-cancels-token-airdrop) — Capitalization, partnership scope, and termination timeline.
25. [Bankr Token Launching](https://docs.bankr.bot/token-launching/overview) — Issuance quotas, anti-sniping decay, equity quote pairs. **PRIMARY**
26. [Bankr Security](https://docs.bankr.bot/security/bankr-terminal) and [Agent API](https://docs.bankr.bot/agent-api/overview) — Server-side policy defaults, agent key risk profile. **PRIMARY**
27. [Clanker Droid Documentation](https://github.com/clanker-devco/DOCS/blob/main/droids/README.md) — Autonomous agent non-custodial boundaries, 10% fee loop. **PRIMARY**
28. [Virtuals Launch Mechanics](https://whitepaper.virtuals.io/about-virtuals/capital-formation-layer/virtuals-launch-mechanics) — 1% fee split, anti-sniping taxes. **PRIMARY**
29. [ElizaOS plugin-evm](https://docs.elizaos.ai/plugin-registry/defi/evm/examples) — `EVM_PRIVATE_KEY` configuration. **PRIMARY**
30. [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) — EOA Code Delegation Specification. **PRIMARY**
31. [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) — Account Abstraction via UserOperations. **PRIMARY**
32. [ERC-7579](https://eips.ethereum.org/EIPS/eip-7579) — Modular Smart Account Interfaces. **PRIMARY**
33. [Rhinestone Smart Sessions](https://docs.rhinestone.dev/smart-wallet/smart-sessions/overview) — Session execution policies and default permissions. **PRIMARY**
34. [Bybit Announcement: AI Subaccounts](https://announcements.bybit.com/en/article/-ai-ai--blta50e3efa96768430/) — Isolated balance architecture, API-only execution. **PRIMARY**
35. [AP: Meta Acquires Moltbook](https://www.usnews.com/news/technology/articles/2026-03-10/meta-to-acquire-moltbook-the-social-network-for-ai-agents) — Autonomous agent social network acquisition.
36. [Mantlescan EIP-7702 Transactions](https://mantlescan.xyz/txnAuthList) & [Byreal Documentation](https://docs.byreal.io/) — 7702 activity on Mantle; Byreal Solana architecture. **PRIMARY**
37. Gate News (2026-10-04, citing BlockBeats / GMGN) — Pons daily-fee decline following subsidy expiration (secondary reporting).
38. User Documentation `mantle-v3-roadmap @ b819a33`: `7-agent-meme-launchpad/product.md`, `agent-meme-launchpad-report.md`, `outline.md`, `notes/`; `2-meme-launchpad/` — Architectural proposals and design rationale.

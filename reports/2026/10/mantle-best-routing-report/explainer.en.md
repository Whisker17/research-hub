---
template: research
title: Mantle Aggregator Optimal Routing: Empirical Evaluation of 19 Algorithms
subtitle: On identical frozen snapshots, shared-pool split routing reduces slippage by 3.9 bps on average compared to Uniswap SOR ports; 4-hop history label search nears best observed benchmarks; Release 0.2.3 post-processors never degrade output while capturing fractional bps gains. The next step is connecting algorithms to live state and eth_call validation.
cols: 4
type: Empirical Report · Algorithm Analysis
audience: Backend and smart contract developers who have not built DEX aggregation routing algorithms
scope: Mantle block 101082044, 5 liquidity sources, Exact Input, gross objective
evidence: Release 0.1.0 acceptance + 0.2.0 through 0.2.3 pre-registered campaign records, source code @95d0744 and @4f17770
date: 2026-10-07 · v2 (incorporates Release 0.2.3 post-processing)
---
Bottom line: Across the 98 pools supported by Uniswap SOR, [[incremental_graph]] yields an average [[shortfall]] of 2.26 bps, compared to 6.14 bps for `uni_sor_port` ([F1](#F1)). The 4-hop `metis_history` algorithm achieves [[best known]] output in 174 out of 240 empirical benchmark test cases ([F3](#F3)). Pruning heuristics primarily reduce quote evaluation counts, while execution timings on shared benchmark runners remain inconclusive ([F4](#F4), [F7](#F7)). Release 0.2.3 introduced post-processing algorithms: refining split allocations adds 0.447 bps on average, while branch reactivation adds 0.210 bps ([F9](#F9), [F10](#F10)). Production deployment requires four distinct tiers: live state, offline solving, eth_call simulation, and router execution contracts ([Panel V](#panel-V)).

## A Problem Formulation {sheet span=2 meta="Exact Input"}
```annot
# DEX Aggregator Optimal Routing | Constrained Non-linear Optimization
[max Σ Terminal Output]{Sum of branch outputs} s.t. [Σ Inputs = A]{Full fill constraint} · [Sequential Pool State]{Downstream swaps observe upstream fills} · [Acyclic Graph]{!No x→y→x token cycles} · [Integer Constraints]{uint256 truncation}
> Edge weights vary dynamically with order size; optimal solutions form split-flow DAGs rather than shortest paths.
```

## B Benchmark Setup {sheet span=2 meta="Frozen Snapshot"}
```kv cols=3
* Snapshot: Mantle 5000 · Block 101082044 · 2026-09-25 00:00 UTC
Pools: 143 (Agni 45 · FusionX 26 · Uni v3 13 · Moe Classic 14 · Moe LB 45)
Tokens: 8 (USDC, USDT, USDT0, WMNT, mETH, WETH, FBTC, CATI)
Testcases: 398 = 96 parameter tuning + 302 report benchmarks
Baselines: Full 143 pools · Matched 98 pools (Excluding Moe LB)
Configuration: 3 hops · 4-way split · 5% grid · 50 chunk increments
Algorithms: 6 baseline + 2 SOR variants + 9 experimental + 2 post-processors
```

## C Algorithmic Capabilities {sheet span=2 meta="Capability"}
| Algorithm | Multi-Hop | Order Splitting | Shared Pools | Liquidity Book Support |
|---|---|---|---|---|
| `direct` | no | no | no | ok |
| `single_path` | ok | no | no | ok |
| `path_split` | ok | ok | no | ok |
| `uni_sor_port` | ok | ok | no | no |
| `incremental_graph` | ok | ok | ok | ok |
| `metis_history` | ok 4 hops | ok | ok | ok |

## D Key Numerical Findings {sheet span=2 meta="Matched · 240 Testcases"}
| Algorithm | Mean Shortfall (bps) | p95 Shortfall (bps) | Median Runtime (s)* |
|---|---:|---:|---:|
| `direct` | 27.97 | 97.59 | 0.0005 |
| `uni_sor_optimized` | 8.36 | 28.97 | 0.20 |
| `path_split` | 6.27 | 22.33 | 5.0 |
| `uni_sor_port` | 6.14 | 22.33 | 12.2 |
| `incremental_graph` | 2.26 | 7.66 | 7.2 |
| `metis_history` | ok 0.69 | ok 3.17 | 6.3 |

\* Measured on shared test runners; indicative descriptions only, not conclusive performance benchmarks.

## E Release History {sheet span=2 meta="Releases"}
```timeline
0.1.0 | 6 Baseline Algorithms | Includes clean port of Uniswap SOR
0.1.2 | SOR Performance Optimizations | Sampling and granular control
0.2.0 | metis_inspired | Blockwise label search
0.2.1 | 5 Independent Approaches | History, repair, cycle-safe, certificates, dual
0.2.2 | Exact Upper-Bound Pruning | 3 bounded search variants
0.2.3 | Post-Processing | Split refinement + branch reactivation
*0.3.0 | On-Chain Dry Run Prototype | Live state streaming + eth_call validation
```

## F Conclusions {sheet span=2}
```callout ok Adopt shared-pool splitting before tuning latency or simulation
Quality ranking: `metis_history` ≈ `metis_inspired` > `incremental_graph` > `path_split` ≈ `uni_sor_port` > `single_path` > `direct`. The two dominant factors are hop limits and shared pool support. Post-processors in 0.2.3 never degrade solutions but yield incremental gains (~0.2-0.5 bps), complementing rather than replacing 4-hop search. Read [F1](#F1)–[F3](#F3) first, then [Panel V](#panel-V).
```

## G How to Read {depth=1}
```callout info Assumed Knowledge (not re-explained here)
- Constant Product (v2), Concentrated Liquidity (v3), Liquidity Book (LB) AMM models
- Routing graph terminology: source, sink, hops, directed acyclic graphs (DAGs)
```
- **5 minutes**: Read Overview (A–F) and Lead.
- **30 minutes**: Follow [Core Algorithmic Benchmarks](#panel-H), [Release 0.2.3 Enhancements](#panel-I), and [On-Chain Architecture](#panel-V).

## H Algorithmic Benchmark Findings {depth=2}
```finding F1 high
# Shared-Pool Split Routing Outperforms Uniswap SOR by 3.88 bps on Average
claim: On the matched 98-pool universe, `incremental_graph` reduces mean shortfall from 6.14 bps (`uni_sor_port`) to 2.26 bps, saving traders ~3.88 bps across test cases.
evidence: [observed] Benchmark results across 240 empirical test cases on block 101082044 [1].
implication: Independent path splitting fails when paths compete for identical deep liquidity pools; shared-pool state tracking is essential.
```

```finding F2 high
# Four-Hop Search Unlocks Additional Alpha Over Three-Hop Graph Limits
claim: Expanding maximum path length from 3 hops to 4 hops via `metis_history` cuts mean shortfall from 2.26 bps to 0.69 bps, matching the best known result in 148 of 240 matched cases (and 174 of 240 in the full universe).
evidence: [observed] Benchmark outcome logs across 4-hop and 3-hop evaluation profiles [1].
implication: On Mantle, intermediate routing through WMNT or mETH bridges fragmented liquidity pools.
```

```finding F3 high
# Exact Bounded Pruning Reduces Quote Evaluations Without Quality Degradation
claim: In Release 0.2.2, bounded label search reduced quote evaluations by ~34% while maintaining identical numerical outputs.
evidence: [observed] Call-count instrumentation logs across Release 0.2.2 benchmarks [1].
implication: Upper-bound pruning accelerates offline path generation.
```

```finding F4 high
# Timing Measurements on Shared Runner Infrastructure Are Inconclusive
claim: Runtimes across repeated runs exhibited high variance due to CPU load sharing on cloud runners; timing metrics serve as descriptive indicators rather than strict SLAs.
evidence: [observed] Variance across repeated identical solver invocations [1].
implication: Production solver benchmarks require isolated bare-metal environments.
```

## I Release 0.2.3 Post-Processing Enhancements {depth=2}
```finding F9 high
# Split Refinement Post-Processing Yields Monotonic Output Improvements
claim: Re-evaluating split allocations on solved plans adds an average of 0.447 bps across test cases without ever degrading solution quality.
evidence: [observed] Release 0.2.3 benchmark outcome files [1].
implication: Post-processing represents a safe, zero-regression optimization layer.
```

```finding F10 high
# Branch Reactivation Successfully Recovers Unused Route Capacity
claim: Reactivating dormant pool branches on top of existing plans adds 0.210 bps on matched test sets.
evidence: [observed] Release 0.2.3 comparative evaluation metrics [1].
implication: High-order combinatorial solvers benefit from localized greedy post-optimization.
```

## V On-Chain Deployment Architecture {depth=2}
Deploying optimal routing to production requires four coordinated tiers:

1. **Live State Synchronization**: Indexing tick bitmaps, pool reserves, and bin states over WebSocket feeds.
2. **Offline Solver Pipeline**: Running Rust-based `metis_history` solvers producing execution plans.
3. **Pre-Flight Validation**: Simulating candidate plans via `eth_call` against pending block state to verify slippage bounds.
4. **Router Execution Contract**: Atomic multi-call contract executing multi-hop split swaps via callbacks.

## W Glossary {depth=2}
```glossary
shortfall | Shortfall Loss | Difference between achieved output and the best observed benchmark output in bps.
best known | Best Observed Benchmark | The highest recorded output across all evaluated algorithms on a specific test case (not proven mathematical optimality).
incremental_graph | Incremental Graph Solver | Algorithm allocating chunked swap volume across dynamically updated pool graphs.
uni_sor_port | Uniswap SOR Port | Direct Python port of Uniswap v3 Smart Order Router heuristic path search.
metis_history | Metis History Solver | 4-hop routing algorithm using historical state labels to prune suboptimal paths.
Liquidity Book | Liquidity Book (LB) | Discretized bin-based AMM model developed by Trader Joe / Merchant Moe.
```

## X References {depth=2}
1. [Router Algorithms Optimizer Repository](https://github.com/Whisker17/router-algorithms-optimizer) — Release artifacts at commits `95d0744` and `4f17770`. **PRIMARY**
2. [Uniswap v3 Smart Order Router](https://github.com/Uniswap/smart-order-router) — Reference heuristic router implementation. **PRIMARY**
3. [Merchant Moe Liquidity Book Whitepaper](https://merchantmoe.com) — Bin-based liquidity mathematics. **PRIMARY**

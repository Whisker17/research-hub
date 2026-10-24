---
template: research
title: Uniswap Aggregator Hooks：把外部流动性包装成 v4 池
subtitle: hook 在 beforeSwap 里去外部协议成交，再用 return delta 抵消 v4 自己的曲线。v4 只提供池子身份和统一结算，储备和定价都留在原协议。
cols: 4
type: 技术调研 · 代码级拆解 + 链上读数
audience: 懂 Solidity 和 Uniswap v2/v3 原理、没写过 v4 hook 的开发者
scope: Aggregator Hooks 的代码机制、必要的 v4 hook 背景、与传统聚合器的对比、优劣、接受度与 hooks 的走向
evidence: 105 条论断台账（observed 78 / inferred 18 / speculative 9）；源码 v4-hooks-public@2264ac8、v4-core@d153b04；Dune 查询与 cast 读链，访问于 2026-10-24
date: 2026-10-24 · v1
---
结论先行：Aggregator Hook 没有把 Curve、Fluid、V3 分叉的资产搬进 Uniswap。每类外部来源由一个适配器 hook 包装。hook 在 `beforeSwap` 里去原协议成交，再返回一个 delta，让 v4 自己的曲线空转（[F1](#F1)、[F2](#F2)）。所以“v4 池”只是一个可报价、可组合、可统一结算的身份。

和 1inch 这类聚合器比，适配器从私有合约挪进了公开的 v4 池接口（[F5](#F5)）。代价是场所费之外加收 1–10bp 协议费（[F6](#F6)）。链上读数显示，这些 hook 从 2026-04 就在跑；最近 16 天 Ethereum 上 99.6% 的量是 LitePSM 稳定币兑换，实收协议费全历史约 2,500 美元（[F8](#F8)）。

## A 一笔经过 Aggregator Hook 的 swap 涉及谁 {sheet meta="parts"}
```tree list
`Universal Router` | 执行入口；代币授权给 Permit2，路由器负责付款与取款
`PoolManager` | v4 单例；只记账，不持有这个“池”的储备
`PoolKey` 虚拟池 | 两个币 + fee + tickSpacing + hook 地址
`Aggregator Hook` | 在 beforeSwap 里去外部协议成交
外部协议 | Curve / Fluid / V3 分叉 / LitePSM：储备、定价、场所费都在这里
`TokenJar` | 收协议费，之后用于烧 UNI
```

## B 核心一行：返回 delta 抵消 v4 曲线 {sheet span=2 meta="BaseAggregatorHook.sol"}
```annot
# beforeSwap 的返回值 | exact-in 例：卖出 X 个 token0
[toBeforeSwapDelta(]{} [specified = −amountSpecified]{!= +X：把核心的 swap 量加成 0，v4 曲线不成交} [, unspecified]{= −(Y − f)：外部成交的输出，扣掉协议费} [)]{}
> 之后 PoolManager 按这个 delta 给 swapper 记账；unlock 结束时所有 delta 必须归零，否则整笔回滚
```

## C 和传统聚合器的区别 {sheet meta="vs 1inch / 0x"}
| 维度 | Aggregator Hooks |
|---|---|
| 寻路 | warn 仍在 Uniswap 链下路由服务 / API |
| 外部来源的身份 | ok v4 PoolKey，任何路由器可调 |
| 执行入口 | ok PoolManager 统一结算 |
| 用户授权 | ok Permit2 授权 + Universal Router 执行，无新授权 |
| 额外费用 | warn 协议费 1–10bp |
| 能否进 Uniswap 路由 | warn 取决于 allowlist |

## D 关键数字 {sheet span=2 meta="2026-10-24"}
| 量 | 值 | 来源 |
|---|---|---|
| 公告上线 | 2026-10-22；Ethereum、Base、Robinhood Chain | [6] |
| 最早链上成交 | 2026-04-19（Ethereum） | Dune [4] |
| Ethereum 近 16 天成交 | 约 2.5 亿美元，99.6% 来自 LitePSM | Dune [4] |
| 协议费设置 | 10bp / 3bp（Base 3bp / 1bp），LitePSM 0 | Dune [4]、[10] |
| 实收协议费 | 全历史约 2,500 美元 | Dune [4] |
| 经 Universal Router 的比例 | 约 70% 的 hook swap | Dune [4] |

## E 演进时间线 {sheet span=2 meta="2025–2026"}
```timeline
2025-11 | UNIfication 提案 | 第 4 项：上线 aggregator hooks，对外部流动性收费
2026-03 | Tempo 上线 | 第一个生产 aggregator hook，包装 Tempo 稳定币 DEX
2026-04 | 链上首笔 | Ethereum 上出现 Curve 适配器的 HookSwap
2026-07 | v4 协议费提案 | aggregator hook 单独一个费率 family，乘数 25
2026-09 | 0x 发文 | “Uniswap v4 hooks were a mistake”，质疑 hook 安全
*2026-10-22 | 公告上线 | Web App 与 API，7 个来源
```

## F 结论 {sheet span=4}
```callout ok 先看懂“虚拟池”，再谈叙事
- 机制：hook 在 `beforeSwap` 里替 v4 成交，`specified = −amountSpecified` 让核心曲线空转；unlock 的 delta 归零检查兜底。
- 区别：不是另一个 1inch。寻路仍在链下，但外部来源变成任何路由器都能调用的 v4 池，并统一走 PoolManager 结算。
- 代价：同一个外部池，经 hook 比直连多付 1–10bp；能否被路由取决于 allowlist。
- 现状：真实流量以 Uniswap 自家路由和稳定币 PSM 兑换为主，协议费收入还很小。从 [机制](#panel-J) 开始读。
```

## G 如何阅读 {depth=1}
```callout info 默认你已知道（本文不解释）
- Solidity、ERC-20、合约之间的外部调用与回调
- Uniswap v2 恒定乘积、v3 集中流动性与 fee tier
- DEX 聚合器的基本用途：把一笔交易拆到多个场所成交
```
- **5 分钟**：看总览（A–F）和导语。
- **30 分钟，要讲清机制**：按顺序读 [前置知识](#panel-I)、[虚拟池怎么成立](#panel-J)、[一笔 swap 的时序](#panel-K)、[适配器差异](#panel-L)。
- **30 分钟，要判断市场**：读 [与聚合器的区别](#panel-M)、[优劣](#panel-N)、[链上读数](#panel-O)、[走向](#panel-P)。
- **完整**：再读 [方法与证据](#panel-R) 和 [复现](#panel-S)。

## H 背景动机 {depth=2}
**问题**：Uniswap 在 2026-10-22 宣布 “Uniswap v4 is now an aggregator”，称 7 个外部来源覆盖这三条链超过 90% 的 DEX 活动 [6]。读者想知道：它凭什么能“借用”别的协议的流动性成为一个 v4 池；它和 1inch、0x 有什么不同；值不值得关注。

**为什么现在**：
- 这个能力写在 2025-11 的 UNIfication 提案里，原文是 “turning Uniswap v4 into an onchain aggregator that collects fees on external liquidity” [3][12]。
- 2026-07 的 v4 协议费提案给它单独设了费率，最高可到 250bp [10]。
- 围绕 hooks 的讨论在变多，0x 在 2026-09 公开质疑 hook 安全 [16]。

**范围**：
- Aggregator Hooks 的代码机制，以及必要的 v4 背景
- 与聚合器、intent 系统对比
- 优劣、接受度、hooks 走向

**非目标**：投资建议与代币价格判断；对适配器的完整安全审计；Uniswap 治理细节（只在协议费相关时提及）。

**源码基准**：v4-hooks-public `2264ac8`、v4-core `d153b04`、protocol-fees `656096f`。文中行号都指这些 commit。

## I 前置知识 {depth=2}
```excalidraw q="读懂 Aggregator Hook 需要先懂哪些 v4 概念？按什么顺序？" read="箭头表示先学 → 后学；灰色虚线框是默认已知；绿色是本文主题。" takeaway="B-0 到 B-3 都在讲 v4 怎么记账；B-4 讲外部池怎么收款。五张卡都懂了，就能读懂适配器代码。" name=prereq-map kind=前置知识地图
{"grid": {"w": 290, "h": 120}, "defaults": {"w": 200, "h": 60},
 "nodes": [
   {"id": "v3", "label": "v2/v3 原理（已知）", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "sol", "label": "Solidity 调用（已知）", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 PoolManager 与 PoolKey", "col": 1, "row": 0, "color": "blue", "w": 230},
   {"id": "b4", "label": "B-4 v3 回调付款", "col": 1, "row": 1, "color": "blue"},
   {"id": "b2", "label": "B-2 地址权限位", "col": 1, "row": 2, "color": "blue"},
   {"id": "b1", "label": "B-1 unlock 与 delta", "col": 2, "row": 0, "color": "blue"},
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
# PoolManager 单例与 PoolKey
是什么: v4 只有一个 `PoolManager` 合约，所有池子都是它里面的一条状态记录。池子由 `PoolKey` 确定：两个币、fee、tickSpacing、hook 地址。
为什么需要: 建一个“池”只是在 PoolManager 里登记一个 PoolKey，不需要部署池合约，也不需要放入储备。Aggregator Hook 正是利用这一点，给外部池登记一个身份。
误解: 误解：有 PoolId 就有储备。事实：Aggregator Hook 的虚拟池在 PoolManager 里没有储备，也不允许加流动性。
深入: [23] 报告 uniswap-v4-hooks 的“v4 机制”一节
```

```prereq B-1 l1 5min
# unlock 与 delta 结清（flash accounting）
是什么: 调用者先 `unlock`，在回调里做 swap、`take`（取币）、`settle`（付币）。每个地址在每个币种上的应收应付叫 delta。回调结束时，只要还有一个 delta 不为 0，整笔交易回滚 [2]。
为什么需要: 这让 hook 可以在一笔交易里先从 PoolManager 取币、拿去外部协议成交、再把输出记回来。只要最后账平，PoolManager 不关心币是从哪里来的。
例子: take(token0, 外部池, X) → 记 −X；settle(Y token1) → 记 +Y
误解: 误解：take 是借款，要付利息。事实：它只是同一笔交易内的记账，结束前必须结清。
深入: [2] v4-core `PoolManager.sol` L104–114、L279–302
```

```prereq B-2 l1 3min
# hook 地址权限位（permission bits）
是什么: hook 地址的低 14 位决定 PoolManager 调用哪些回调。部署时要用 CREATE2 换 salt，挖出低位正好匹配的地址。
为什么需要: Aggregator Hook 只开 4 个权限，低位固定是 `0x2888`。这也是在链上识别它们的一个线索。
深入: [2] v4-core `Hooks.sol` L29–47
```

```prereq B-3 l1 5min
# return delta（beforeSwapReturnDelta）
是什么: 有 `beforeSwapReturnDelta` 权限的 hook，可以在 `beforeSwap` 返回一个 `BeforeSwapDelta`。它的 specified 一侧会加到核心的 swap 量上；hook 自己承担这份 delta。
为什么需要: 返回 `specified = −amountSpecified`，核心 swap 量变成 0，v4 曲线不成交 [2]。hook 再用 unspecified 一侧告诉 PoolManager 应该给 swapper 多少。
例子: 卖 X 个 token0：amountSpecified = −X，hook 返回 +X → amountToSwap = 0
误解: 误解：hook 只能在 swap 前后“看一眼”。事实：有这个权限的 hook 能完全替代核心定价。
深入: [2] v4-core `Hooks.sol` L248–282、`Pool.sol` L320
```

```prereq B-4 3min
# v3 回调付款（swap callback）
是什么: v3 池子先把输出币打给收款人，再回调调用者的 `uniswapV3SwapCallback`，要求调用者在回调里付输入币，最后检查余额。
为什么需要: V3 / PancakeSwap V3 / Slipstream 适配器就是在这个回调里，用 `take` 让 PoolManager 直接把输入付给外部池。
深入: [1] `UniswapV3Aggregator.sol` L67–98
```

## J 虚拟池怎么成立 {depth=2}
```excalidraw q="Aggregator Hook 的“池”里到底有什么？资金在谁手里？" read="蓝色是 v4 核心；绿色是 hook；灰色虚线是外部协议；紫色是协议费去处。实线是调用，虚线是币的流向。" takeaway="PoolManager 只管身份和账本；储备、定价和场所费（有 LP 时含 LP 费）都留在外部协议。hook 是两边之间的翻译层。" kind=直觉
{"grid": {"w": 420, "h": 140}, "defaults": {"w": 210, "h": 70},
 "nodes": [
   {"id": "ur", "label": "Universal Router", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "pm", "label": "PoolManager（只记账）", "col": 1, "row": 0, "color": "blue", "w": 230},
   {"id": "hook", "label": "Aggregator Hook", "col": 1, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "ext", "label": "外部池：储备 + 定价", "col": 2, "row": 1, "color": "gray", "stroke": "dashed", "w": 230},
   {"id": "jar", "label": "TokenJar", "col": 2, "row": 0, "color": "violet"}
 ],
 "edges": [
   {"from": "ur", "to": "pm", "label": "swap(PoolKey)"},
   {"from": "pm", "to": "hook", "label": "beforeSwap"},
   {"from": "hook", "to": "ext", "label": "真实成交"},
   {"from": "pm", "to": "jar", "label": "协议费", "dashed": true}
 ]}
```

[[虚拟池]]的本质，是把四样东西拆开放（Fig 2）：

| 层 | 放在哪里 |
|---|---|
| 身份（PoolKey / PoolId） | PoolManager |
| 结算（delta、take、settle） | PoolManager |
| 储备、定价、LP 费 | 外部协议 |
| 两边的翻译 | Aggregator Hook |

`BaseAggregatorHook` 只开 4 个权限 [1]：

```solidity src=research/code/BaseAggregatorHook.sol lines=84-89
```

- `beforeInitialize`：建池时把 PoolKey 映射到外部池，并做校验。
- `beforeAddLiquidity`：直接 `revert LiquidityNotAllowed()`，这个池不接受 LP。
- `beforeSwap` + `beforeSwapReturnDelta`：替 v4 成交并改写记账。

核心逻辑在 `_innerBeforeSwap`。注意第 162 行的注释 `// cancel core`：

```solidity src=research/code/BaseAggregatorHook.sol lines=154-186 hl=161-162,185
```

```finding F1 high
# “v4 池”只是路由与结算身份，储备一直在外部协议
claim: Aggregator Hook 的池在 PoolManager 里没有储备，不接受 LP，也不用 v4 曲线定价。它只提供一个 PoolKey，让路由器能报价、组合多跳，并在 PoolManager 里统一结算。
evidence: [observed] 只开 4 个权限，加流动性直接 revert [1]。[observed] `pseudoTotalValueLocked` 读的是外部池里的代币数量 [1]。[observed] 核心 swap 量被抵消为 0 时，`Pool.swap` 直接返回零 delta [2]。[inferred] 储备、定价、场所费都留在原协议。
implication: 统计 TVL、做价格预言机或索引成交时，要把虚拟池和原生 v4 池分开；它的 PoolId 不代表任何 v4 储备。
```

```finding F2 high
# 能“借用”外部流动性，靠的是 return delta 加上 unlock 的归零检查
claim: hook 在外部成交后，返回 `specified = −amountSpecified` 抵消核心计算，unspecified 一侧写外部输出。PoolManager 不关心输出来自哪里，只要求 unlock 结束时每个 delta 归零。外部池只成交一部分时，hook 留下未结 delta，整笔交易回滚。
evidence: [observed] `amountToSwap += hookDeltaSpecified` [2]；hookDelta 记给 hook，swapper 的 delta = 核心 delta − hookDelta [2]。[observed] unlock 发现非零 delta 计数就回滚 [2]。[inferred] 按 K 面板的记账表，hook 两种币的 delta 都归零；少成交一部分时 token0 留下正 delta。
implication: 写自己的 aggregator hook 时，安全边界在“返回的 delta 是否等于真实收付”。PoolManager 只保证账平，不保证价格对。
```

**记账推演**（exact-in，卖出 X 个 token0，V3 适配器，f 为协议费）：

| 步骤 | hook token0 | hook token1 | swapper |
|---|---|---|---|
| 回调 `take(token0, V3 池, X)` | −X | | |
| V3 把 Y 打进 PoolManager，`settle()` | | +Y | |
| 协议费 `take(token1, TokenJar, f)` | | −f | |
| 返回 delta，核心空转；`afterSwap` 记账 | +X | −(Y−f) | −X / +(Y−f) |
| 合计 | 0 | 0 | 路由器付 X、取 Y−f |

## K 一笔 swap 的完整时序 {depth=2}
```uml q="一笔经过 V3 适配器的 exact-in swap，从用户到结清，谁调用谁？" read="以 V3 适配器为例；步骤 5–14 发生在 PoolManager.swap 内部；15–16 是 Router 结清欠账；17 是 unlock 结束时的检查。路由器的动作顺序是示意，未核对真实编码。" takeaway="外部池的输出直接打进 PoolManager，输入由 PoolManager 直接付给外部池；hook 只记账，不中转这两笔币。"
sequenceDiagram
  autonumber
  participant U as 用户
  participant R as Universal Router
  participant PM as PoolManager
  participant H as V3 Aggregator Hook
  participant V as 外部 V3 池
  participant J as TokenJar
  U->>R: execute(卖 X token0, minOut)
  R->>PM: unlock(data)
  PM->>R: unlockCallback
  R->>PM: swap(PoolKey, −X)
  PM->>H: beforeSwap
  H->>PM: sync(token1)
  H->>V: swap(recipient = PoolManager, X)
  V->>PM: 转出 Y token1
  V->>H: uniswapV3SwapCallback(+X, −Y)
  H->>PM: take(token0, V3 池, X)
  PM->>V: 转出 X token0
  H->>PM: settle()，hook 记 +Y
  H->>PM: take(token1, TokenJar, f)
  H-->>PM: BeforeSwapDelta(+X, −(Y−f))
  Note over PM: amountToSwap = 0，核心不成交，按 hookDelta 记账
  R->>PM: settle X token0（经 Permit2 从用户扣）
  R->>PM: take(token1, 用户, Y−f)
  PM-->>R: 检查所有 delta 已归零
```

V3 适配器的回调先核对调用者，再让 PoolManager 直接付款 [1]：

```solidity src=research/code/UniswapV3Aggregator.sol lines=72-98 hl=78-81,97
```

```finding F3 medium
# hook 在路由器付款之前，就先从 PoolManager 借出了输入币
claim: 时序第 10–11 步发生在路由器第 15 步付款之前。因此 PoolManager 当时必须已经持有足够的 token0（来自其他 v4 池的库存），或者路由器先付款再 swap。
evidence: [observed] V3 回调里 `take(token0, 外部池, X)` 在 `beforeSwap` 内执行 [1]。[observed] 官方测试先给 PoolManager 铸币，注释 “Seed PoolManager with tokens for swaps” [1]。[inferred] 生产上依赖 PoolManager 的库存或路由器的动作顺序，整个过程在 flash accounting 内原子完成。
implication: 冷门代币的虚拟池，可能需要路由器先 settle 输入。本文没有核对 Universal Router 的实际编码顺序，见 [局限](#panel-Q)。
```

## L 各适配器的差异 {depth=2}
```excalidraw q="不同外部协议，币是怎么在 PoolManager、hook 和外部池之间流动的？" read="每行一种模式。蓝色是 PoolManager，绿色是 hook，灰色虚线是外部协议。" takeaway="直连型最省一次转账，但依赖外部池的回调；经手型通用，适合没有回调的协议；订单型没有持久池，流动性来自 hookData。" kind=对比
{"grid": {"w": 350, "h": 120}, "defaults": {"w": 170, "h": 60},
 "nodes": [
   {"id": "a0", "label": "直连型：V2/V3/Fluid", "col": 0, "row": 0, "color": "yellow", "w": 220},
   {"id": "a1", "label": "PoolManager", "col": 1, "row": 0, "color": "blue"},
   {"id": "a2", "label": "外部池", "col": 2, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "经手型：Curve/PSM", "col": 0, "row": 1, "color": "yellow", "w": 220},
   {"id": "b1", "label": "PoolManager", "col": 1, "row": 1, "color": "blue"},
   {"id": "b2", "label": "hook", "col": 2, "row": 1, "color": "green"},
   {"id": "b3", "label": "外部池", "col": 3, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "c0", "label": "订单型：UniswapX", "col": 0, "row": 2, "color": "yellow", "w": 220},
   {"id": "c1", "label": "PoolManager", "col": 1, "row": 2, "color": "blue"},
   {"id": "c2", "label": "hook = filler", "col": 2, "row": 2, "color": "green"},
   {"id": "c3", "label": "Reactor", "col": 3, "row": 2, "color": "gray", "stroke": "dashed"}
 ],
 "edges": [
   {"from": "a1", "to": "a2", "label": "直付 / 直回", "arrow": "both"},
   {"from": "b1", "to": "b2", "label": "take / settle", "arrow": "both"},
   {"from": "b2", "to": "b3", "label": "exchange", "arrow": "both"},
   {"from": "c1", "to": "c2", "label": "take / settle", "arrow": "both"},
   {"from": "c2", "to": "c3", "label": "订单", "arrow": "both"}
 ]}
```

| 适配器 | 部署 / 映射 | 报价 | 限制 |
|---|---|---|---|
| Uniswap V3 | 单例；`getPool(t0,t1,fee)` | 真调 swap，回调里 revert 带回结果 | 无原生 ETH；exact-out 须精确 |
| PancakeSwap V3 | 继承 V3，只多一个回调名 | 同 V3 | 同 V3 |
| Slipstream | 继承 V3，按 tickSpacing 查池 | 同 V3 | fee 须为动态费标志 |
| Uniswap V2 / 分叉 | 单例；`getPair` | 由 reserves 计算 | 无原生 ETH |
| Curve StableSwap / NG | 每个 Curve 池一个 hook，建 n(n−1)/2 个 PoolKey | `get_dy` | 只支持 exact-in |
| Fluid | 每个 Fluid 池一个 hook | resolver 估算 | 原生 ETH 不支持 exact-out |
| LitePSM（Sky） | 单例；每对只允许一个池 | `tin` / `tout` 公式 | 有容量上限 |
| UniswapX | 单例，订单放在 hookData | 不支持路由报价 | 全成或全不成 |

Curve 适配器是“经手型”的典型。注意 `exchange` 的最后一个参数是 0，即不设单跳最小输出 [1]：

```solidity src=research/code/StableSwapAggregator.sol lines=163-187 hl=173,177-180
```

```finding F4 high
# 适配器把外部协议的“收款方式”翻译成 take / settle，差异集中在资金路径和支持的 swap 类型
claim: V3、Pancake、Slipstream 共用一份实现：PancakeSwap V3 适配器全文只有 17 行。Curve 每个池一个 hook，同一 hook 地址让路由器识别“碰的是同一个 Curve 池”。Curve 和 Fluid 不设单跳滑点限制，注释说由路由器检查。UniswapX 适配器方向相反：hook 当 filler，v4 swapper 是订单的对手方。
evidence: [observed] Pancake / Slipstream 继承 V3，只改回调名或查池方式 [1]。[observed] Curve `exchange(..., 0)`、Fluid `amountLimit` 为 0 或最大值 [1]。[observed] README：UniswapX 订单的对手方由 v4 swapper 提供 [1]。[observed] 已部署 hook 的版本字符串包括 SushiswapV3Aggregator、SushiswapV2Aggregator [5]。[inferred] 接入一个 V3 分叉，主要工作是换 factory 和回调名。
implication: 评审一个新适配器，先问三件事：输入从哪里付、输出打到哪里、单跳有没有最小输出。用户保护集中在路由器的最终 minOut 上。
```

## M 和传统聚合器的区别 {depth=2}
```excalidraw q="同样是“用外部 DEX 的流动性”，1inch / 0x 和 Aggregator Hooks 的架构差在哪？" read="左边是传统聚合器，右边是 Uniswap。绿色是本文主题；灰色虚线是外部 DEX。" takeaway="传统聚合器用私有的执行合约直连各 DEX；Aggregator Hooks 把外部 DEX 变成 v4 池，执行与结算都进了 PoolManager。" kind=对比
{"grid": {"w": 270, "h": 120}, "defaults": {"w": 200, "h": 60},
 "nodes": [
   {"id": "u1", "label": "用户", "col": 0, "row": 0, "color": "gray"},
   {"id": "r1", "label": "1inch Router / 0x Settler", "col": 0, "row": 1, "color": "blue", "w": 230},
   {"id": "d1", "label": "Curve", "col": 0, "row": 2, "color": "gray", "stroke": "dashed", "w": 110, "dx": -60},
   {"id": "d2", "label": "Fluid", "col": 0, "row": 2, "color": "gray", "stroke": "dashed", "w": 110, "dx": 60},
   {"id": "u2", "label": "用户", "col": 2, "row": 0, "color": "gray"},
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

| 维度 | 1inch / 0x | Aggregator Hooks | UniswapX |
|---|---|---|---|
| 寻路 | 链下 API | 链下（Uniswap 路由） | filler 竞争 |
| 执行入口 | 自家 Router / Settler | PoolManager + hook | Reactor |
| 外部来源身份 | 执行器里的调用 | v4 PoolKey | 签名订单 |
| 用户授权 | AllowanceHolder 或 Permit2 | Permit2 授权；Universal Router 执行 | Permit2 签名 |
| 收费 | 0x 部分交易对 0.15%；集成方费 | 协议费进 TokenJar | 订单内费用 |

```finding F5 high
# 它不是另一个 1inch：寻路仍在链下，变的是外部来源的身份和结算位置
claim: 传统聚合器把 DEX 适配器放在自家执行合约和路由栈里，不对外提供统一的 v4 PoolKey 接口。Aggregator Hooks 把适配器做成 v4 池，任何会调 v4 的路由器都能报价和执行；多跳可以把原生 v4 池和外部来源放进同一次 unlock。
evidence: [observed] 官方称 hook 包装外部来源，“so that any router sees it as a Uniswap pool”，整条路径单笔结算，“nothing new to approve” [6]。[observed] 0x 执行入口是 Settler，授权给 AllowanceHolder 或 Permit2 [18]；1inch Classic 链下寻路、经自家 Router 执行 [19]；CoW 用批量拍卖 [20]。[observed] Guidestar 走同一套 Universal Router 与 Permit2 [9]。[observed] 上线前已有 0x AllowanceHolder 发起的交易触及这些 hook（112 笔）[4]。
implication: 1inch、0x、Aggregator Hooks、UniswapX 更可能分层共存：前两者管“去哪里找价”，hook 管“怎么在 v4 里结算一跳”，UniswapX 管“谁来承担报价风险”。
```

## N 优劣势 {depth=2}
| 方面 | 判断 | 依据 |
|---|---|---|
| 统一结算与多跳 | ok 原生池和外部来源在一次 unlock 内组合 | [F2](#F2)、[F5](#F5) |
| 用户授权 | ok 不需要新授权 | [6] |
| 适配器复用 | ok V3 分叉只换 factory 和回调名 | [F4](#F4) |
| 价格 | warn 场所费之外多付 1–10bp | [F6](#F6) |
| 单跳保护 | warn Curve / Fluid 不设单跳 minOut | [F4](#F4) |
| gas | warn 含 hook swap 的交易，整笔中位数约 55 万 | [4] |
| 去中心化 | warn 部署无许可，生产路由要过 allowlist | [F7](#F7) |
| 安全面 | no 每个适配器都是新的回调与记账风险面 | [F2](#F2)、[F7](#F7) |

```finding F6 high
# 协议费是 Uniswap 的价值捕获，也是这条路径相对直连的成本
claim: 协议费 = 虚拟池 slot0 的 protocolFee × 25，从 unspecified 一侧送进 TokenJar：exact-in 从输出里扣，exact-out 加在输入上。链上实际设置是：Ethereum 多数虚拟池 10bp，部分稳定币对 3bp；Base 3bp 或 1bp；LitePSM 不收。所以同一个 Curve 池，经 hook 走比 1inch 直连多付这笔费。
evidence: [observed] `ProtocolFees(25)` 与 `_applyWithProtocolFee` [1]。[observed] 提案原文：乘 25 突破 PoolManager 10bp 硬上限，最高 250bp；默认 10bp，稳定币对 3bp，Base 3bp / 1bp [10]。[observed] 链上最新 protocolFee 多为 40 pips（×25 = 10bp）或 12 pips（3bp），LitePSM 池没有设置记录 [4]。[observed] aggregator hook 自报 `1<<11`，LitePSM 自报 `1<<12`，UniswapX 为 0 [1][3]。[inferred] 对已有自家适配器、价格敏感的第三方聚合器，直连通常更便宜。
implication: 这条路径的主要用户，是本来就走 Uniswap 前端和 API 的订单流。它把这些订单流在外部成交的部分，变成了协议收入。
```

```finding F7 medium
# 部署是无许可的，能不能被路由才是真正的闸门
claim: Curve 适配器工厂的 `createPool` 没有访问控制，任何人都能部署 hook 并建池。但 Uniswap 路由对一部分 hook 自动收录，另一部分要人工 allowlist；审核只看路由兼容性，不是安全审计。0x 称 6 条链 84,163 个 hook 里 54.2% 恶意，Uniswap 方面否认这影响其路由。
evidence: [observed] `createPool` 无修饰符 [1]。[observed] 官方文档：部分 hook 要审核并加入 allowlist [14]；审核表单写明 “not a security audit or an endorsement” [15]。[observed] 0x 数据截至 2026-09-11，是 0x 自己的分类 [16]。[observed] 双方争论见二手报道 [17]。
implication: 评估一个 hook 生态，看 allowlist 和执行质量数据，而不是看部署了多少个 hook。
```

## O 市场接受度：链上读数 {depth=2}
官方和第三方都没有公开 Aggregator Hooks 的成交量 [6]。下面的数字来自本文自建 Dune 查询 [4]。查询统计 `BaseAggregatorHook` 发出的 `HookSwap` 事件。窗口从 2026-10-08 起；“上线后”指 2026-10-22 13:00 UTC 之后约 1.5 天。

| 链 | 时段 | 交易数 / 天 | USD 量 | 经 Universal Router |
|---|---|---|---|---|
| Ethereum | 上线前 14.5 天 | 约 320 | 2.31 亿 | 3,270 / 4,890 次 |
| Ethereum | 上线后 1.5 天 | 约 320 | 1,860 万 | 393 / 556 次 |
| Base | 上线前 14.5 天 | 约 110 | 174 万 | 1,124 / 1,856 次 |
| Base | 上线后 1.5 天 | 约 900 | 63 万 | 1,217 / 1,738 次 |
| Robinhood | 上线前 14.5 天 | 约 7 | 2 万 | 74 / 115 次 |
| Robinhood | 上线后 1.5 天 | 约 130 | 6 万 | 193 / 244 次 |

```finding F8 high
# 这些 hook 早就在跑，量几乎都是稳定币 PSM 兑换，协议费收入还很小
claim: 链上最早的 HookSwap 在 2026-04-19，比公告早约半年。最近 16 天 Ethereum 约 2.5 亿美元成交里，99.6% 来自 LitePSM 系列 hook（USDC/USDS、DAI/USDC）。LitePSM 不收协议费，所以全历史实收协议费只有约 2,500 美元。
evidence: [observed] 首笔 HookSwap：Ethereum 2026-04-19、Base 2026-05-01 [4]。[observed] 按 hook 汇总，LitePSM 系列约 2.484 亿美元 [4]。[observed] `ProtocolFeesCollected` 合计约 2,500 美元，上线后 1.5 天约 433 美元 [4]。[observed] 版本字符串确认这些合约是 LitePSMAggregator 等官方适配器 [5]。[inferred] 成交额和协议费收入严重不成比例。
implication: 现在用成交额衡量这项功能会高估它的商业价值。要看两件事：非 PSM 来源（Curve、Fluid、V3 分叉、Slipstream）的成交量，协议费收入走势。
```

```finding F9 medium
# 公告主要是公开和扩面，头 1.5 天的增量在 Base 和 Robinhood
claim: Ethereum 每日交易数在公告前后都约 320 笔；Base 从约 110 笔升到约 900 笔，Robinhood 从约 7 笔升到约 130 笔。约七成 hook swap 发生在直接调用 Uniswap Universal Router 的交易里。
evidence: [observed] Dune 上线前后对比 [4]；Universal Router 地址来自官方部署页 [8]。[inferred] Uniswap 路由早已在用这些 hook，公告带来的是新链、新来源与关注度。数据只有 1.5 天，只能算早期读数。
implication: 跟踪接受度，至少要看 30 天：非 Uniswap 路由器的占比、非 PSM 来源的量、协议费收入。
```

外部协议（Curve、Fluid、PancakeSwap、Aerodrome、Sky）都没有公开表态；本文也没有找到“吸血鬼攻击”批评的一手来源 [6]。

## P 走向：对 Uniswap 和 hooks 叙事的判断 {depth=2}
```callout warn 本面板全部是推测
每条判断都写明了它成立的前提。前提变化时，结论也会变。
```

| 判断（speculative） | 成立的前提 | 反面信号 |
|---|---|---|
| 短期接受度来自 Uniswap 自家前端与 API；第三方聚合器不会大规模改走 hook 路径 | 协议费保持 1–10bp；第三方已有直连适配器 | 第三方路由器的占比持续上升 |
| 外部协议短期中立：保留场所费，多拿成交 | 储备与场所费留在原协议（[F1](#F1)） | 外部协议限制回调调用者，或在自家前端优先 |
| Uniswap 的竞争点从“池子深”转向“订单流”：协议费是对自有订单流使用外部流动性收的费 | 流量主要来自 Uniswap 路由器（[F9](#F9)） | 协议费收入主要来自第三方路由 |
| hooks 下一阶段的关键是 allowlist / 注册表与风险标注，不是 hook 数量 | 恶意 hook 争议持续（[F7](#F7)） | Uniswap 公布执行质量数据，并默认开启单跳检查 |
| 更多“包装型 hook”会出现：PSM、RWA 申赎、wrap / unwrap | LitePSM 这类固定费率、无 AMM 价格冲击的兑换已占主导（[F8](#F8)） | 非 PSM 来源的量长期很小 |

围绕 hooks 的叙事里，“Uniswap 变成流动性结算层”这一点有代码支撑：任何来源只要能被翻译成 take / settle，就能成为 v4 池（[F2](#F2)）。但它能不能成为行业标准，取决于路由端的治理，而不是 hook 本身。

## Q 局限与开放问题 {depth=2}
- **数据窗口**：上线后只有约 1.5 天数据。HookSwap 统计里混有少量没有版本号、同签名事件的合约，量很小，没有剔除。
- **gas**：只测到“含 hook swap 的整笔交易”的 gas 中位数，没有和直连外部池做同口径对比。
- **动作顺序**：没有核对 Universal Router 实际编码里是否先 settle 输入（[F3](#F3)）。
- **7 个来源**：官方没有列出是哪 7 个，也没有给“90%”的口径 [6]。
- **文档与代码不一致**：README 说 Slipstream 用 QuoterV2 报价，该 commit 的代码继承 V3 的 revert 报价 [1]。
- **外部反应**：没有找到外部协议和第三方聚合器的正式表态。
- **0x 争议**：0x 的恶意 hook 比例是它自己的分类，且 0x 是竞争方 [16]。

## R 方法与证据 {depth=3}
- **主要依据**：主会话逐行读 `v4-hooks-public@2264ac8` 的 `src/aggregator-hooks/` 和测试，以及 v4-core、protocol-fees 子模块 [1][2][3]。
- **链上**：用 `cast call` 读已部署 hook 的版本字符串、factory、flags [5]；用 Dune 统计 HookSwap、ProtocolFeeUpdated、ProtocolFeesCollected 事件 [4]。
- **市场与对比**：子 agent 查官方 blog、治理帖、聚合器文档和 0x 博文，二手报道只当线索。
- **外部 Deep Research**：用户提供的 GPT 调研只当线索。被修正的地方：
  - UniswapX hook 的流动性不是“solver 提供”，而是 v4 swapper 当订单对手方。
  - 协议费不只是“可以接入”：实际是 ×25 乘数，现行 10bp / 3bp / 1bp，LitePSM 不收。
  - 上线时间：链上 2026-04 已有成交，不是 2026-10 才开始。
  - GPT 的评分表没有依据，未采用；它列的目录名（`Curve/`、`Fluid/`）与实际目录不符。
- **台账**：105 条，observed 78、inferred 18、speculative 9；见 `research/ledger.md`。

## S 复现 {depth=3}
1. 固定源码版本：

```bash
git clone https://github.com/Uniswap/v4-hooks-public && cd v4-hooks-public
git checkout 2264ac8b023011fdca8fd3422ada172dc10184e0
git submodule update --init --depth 1 lib/v4-core lib/protocol-fees
```

2. 读已部署 hook 的版本与费率乘数（预期输出 `"LitePSMAggregator v1.0"`、`4096`；`"SushiswapV3Aggregator v1.0"`、`25`）：

```bash
RPC=https://ethereum-rpc.publicnode.com
cast call 0x958a0904940f744f8c6b72c043ceee3ea34ae888 "aggregatorHookVersion()(string)" --rpc-url $RPC
cast call 0x958a0904940f744f8c6b72c043ceee3ea34ae888 "protocolFeeFlags()(uint256)" --rpc-url $RPC
cast call 0x0359e30d4e8e098f1033f948182f88e43efd6888 "aggregatorHookVersion()(string)" --rpc-url $RPC
cast call 0x0359e30d4e8e098f1033f948182f88e43efd6888 "protocolFeeMultiplier()(uint24)" --rpc-url $RPC
```

3. 重跑 Dune 查询：8999850（上线前后）、8999852（按 hook）、8999853（协议费设置）、8999857（按首字节汇总）、8999858（实收协议费）。HookSwap 的 topic0 是 `0x6150bb53cd76c5702d6074239fc7b6c2a5495d339eb122fdc06252f3efdbbc1b`。

## T 术语表 {depth=2}
```glossary
虚拟池 | virtual pool | 只有 PoolKey 身份、没有 v4 储备的池；成交由 hook 去外部协议完成。 | 不是原生 v4 池
PoolManager | v4 单例合约 | 保存所有 v4 池状态的唯一合约，也负责 delta 记账。
PoolKey | 池子身份 | 两个币、fee、tickSpacing、hook 地址；哈希后得到 PoolId。 | PoolId 不代表有储备
unlock | 解锁会话 | 调用 PoolManager 的入口；回调结束时所有 delta 必须归零。
delta | 欠账 | 某个地址在某个币种上对 PoolManager 的应收应付。 | 不是余额
take | 取币 | 让 PoolManager 把币转给指定地址，并给调用者记负 delta。
settle | 付币确认 | sync 之后把币转进 PoolManager，再按到账量记正 delta。
return delta | 返回欠账 | hook 在回调里返回的 delta，用来改写记账。
specified / unspecified | 指定侧 / 非指定侧 | 用户给定数量的一侧，和由成交算出的另一侧。 | 不是 token0 / token1
TokenJar | 协议费金库 | 收协议费的不可变合约；资产只能通过烧 UNI 领取。
protocolFeeFlags | 费率分类标志 | hook 自报的位字段；1<<11 是 aggregator 约定。 | 不是地址权限位
allowlist | 路由白名单 | Uniswap 路由人工收录 hook 的名单。 | 不是安全审计
LitePSM | Sky 的稳定币兑换模块 | 以固定费率在 USDC 与 USDS / DAI 之间 1:1 兑换。 | 不是 AMM
Universal Router | Uniswap 路由合约 | 执行与付款的入口，组织 v2 / v3 / v4 的多跳；配合 Permit2 时，代币授权给 Permit2。
filler | 成交方 | 在 UniswapX 里替用户完成签名订单的一方。
```

## U 参考资料 {depth=2}
1. [Uniswap/v4-hooks-public `src/aggregator-hooks` @2264ac8](https://github.com/Uniswap/v4-hooks-public/tree/2264ac8b023011fdca8fd3422ada172dc10184e0/src/aggregator-hooks) — BaseAggregatorHook、ProtocolFees、各适配器、README、测试。**PRIMARY**
2. [Uniswap/v4-core @d153b04](https://github.com/Uniswap/v4-core/tree/d153b048868a60c2403a3ef5b2301bb247884d46/src) — unlock、swap、take / settle、Hooks.beforeSwap / afterSwap。**PRIMARY**
3. [Uniswap/protocol-fees @656096f](https://github.com/Uniswap/protocol-fees/tree/656096fd382417c9eadc1f54cb45cdd3dd1bc362) — V4FeePolicy 治理指南（`1<<11` 约定）、UNIfication 原文。**PRIMARY**
4. [Dune 查询 8999850](https://dune.com/queries/8999850)、[8999852](https://dune.com/queries/8999852)、[8999853](https://dune.com/queries/8999853)、[8999857](https://dune.com/queries/8999857)、[8999858](https://dune.com/queries/8999858) — 本文自建，2026-10-24 运行。**PRIMARY**
5. 链上 `cast call`（Ethereum、Base，2026-10-24）— 已部署 hook 的版本、factory、flags。**PRIMARY**
6. [Uniswap Labs：Aggregator Hooks are Now Live](https://blog.uniswap.org/aggregator-hooks-are-now-live)（2026-10-22）— 上线范围、7 个来源、单笔结算。**PRIMARY**
7. [Uniswap Developers：Uniswap Labs Hooks](https://developers.uniswap.org/docs/protocols/uniswap-labs-hooks) — 支持的来源清单。**PRIMARY**
8. [Uniswap v4 Deployments](https://developers.uniswap.org/docs/protocols/v4/deployments) — 各链 Universal Router 地址。**PRIMARY**
9. [Uniswap API：AMM vs UniswapX routing（Guidestar）](https://developers.uniswap.org/docs/trading/swapping-api/amm-vs-uniswapx-routing) — Guidestar 与授权路径。**PRIMARY**
10. [Temp Check：Activate v4 Protocol Fees](https://gov.uniswap.org/t/temp-check-activate-v4-protocol-fees/26162/1)（2026-07-07）— aggregator hook 费率与 ×25。**PRIMARY**
11. [Tally：Proposal 100](https://www.tally.xyz/gov/uniswap/proposal/100) — v4 协议费链上提案。**PRIMARY**
12. [Uniswap：UNIfication](https://blog.uniswap.org/unification) — aggregator hooks 的起源与 TokenJar / Firepit。**PRIMARY**
13. [Uniswap is Live on Tempo](https://blog.uniswap.org/uniswap-is-live-on-tempo)（2026-03-18）— 第一个生产 aggregator hook。**PRIMARY**
14. [Uniswap Developers：Hook routing](https://developers.uniswap.org/docs/protocols/v4/concepts/hook-routing) — 自动收录与人工 allowlist。**PRIMARY**
15. [Uniswap v4 Hooks Routing Allowlist 表单](https://developers.uniswap.org/hook-allowlist) — 审核不等于安全审计。**PRIMARY**
16. [0x：Uniswap v4 hooks were a mistake](https://0x.org/post/uniswap-v4-hooks-were-a-mistake)（2026-09-14）— 0x 自己的 hook 分类数据。**PRIMARY**（对 0x 数据而言）
17. [CryptoSlate：Uniswap adds seven trading sources as 0x disputes…](https://cryptoslate.com/uniswap-adds-seven-trading-sources-as-0x-disputes-its-protection-from-malicious-hooks/) — 双方争论的二手转述。
18. [0x Docs：Contracts](https://docs.0x.org/docs/core-concepts/contracts) — Settler、AllowanceHolder。**PRIMARY**
19. [1inch：Classic Swap](https://business.1inch.com/portal/documentation/apis/swap/classic-swap/introduction) — Pathfinder 与 Router。**PRIMARY**
20. [CoW Protocol：Solvers](https://docs.cow.fi/cow-protocol/concepts/introduction/solvers) — 批量拍卖与 solver。**PRIMARY**
21. [UniswapX Architecture](https://developers.uniswap.org/docs/liquidity/uniswapx/concepts/architecture) — Reactor、filler、Permit2。**PRIMARY**
22. [Euler Docs：EulerSwap](https://docs.euler.finance/developers/euler-swap) — 另一个“hook 接外部流动性”的例子。**PRIMARY**
23. research-hub 报告 `uniswap-v4-hooks` — v4 hook 机制的完整拆解，本文的背景依据。

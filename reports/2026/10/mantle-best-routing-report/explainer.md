---
template: research
title: Mantle 聚合器最佳路由：19 个算法的实验报告与解析
subtitle: 在同一冻结快照上，共享池拆单比 Uniswap SOR 端口平均少损失 3.9 bps；4 跳 history label 搜索最接近已知最优；0.2.3 的两个后处理器从不更差，但只多出零点几 bps。下一步把同一套算法接到实时状态和 eth_call 执行验证上。
cols: 4
type: 实验报告 · 算法解析
audience: 后端 / 合约开发，未做过 DEX 聚合路由
scope: Mantle 区块 101082044，5 个流动性来源，Exact Input，gross 目标
evidence: 0.1.0 验收 + 0.2.0 / 0.2.1 / 0.2.2 / 0.2.3 预注册 campaign 的冻结记录，代码 @95d0744，0.2.3 @4f17770（campaign 冻结 @60ac764）
date: 2026-10-07 · v2（新增 0.2.3 后处理方向）
---
结论先行：在 SOR 能用的 98 个池子上，[[incremental_graph]] 的平均 [[短缺]] 是 2.26 bps，`uni_sor_port` 是 6.14 bps（[F1](#F1)）。4 跳的 `metis_history` 在 240 个经验用例中有 174 个达到 [[best known]]（[F3](#F3)）。速度优化和剪枝主要减少报价次数，计时证据因主机负载全部 inconclusive（[F4](#F4)、[F7](#F7)）。0.2.3 新增“后处理”方向：精修已算完计划的拆分比例，平均多 0.447 bps；再激活新分支，比匹配对照多 0.210 bps，两者都保留为实验（[F9](#F9)、[F10](#F10)）。接入链上需要四层：实时状态、求解、eth_call 验证、执行合约（[面板 V](#panel-V)）。

## A 要解的问题 {sheet span=2 meta="Exact Input"}
```annot
# 聚合器最佳路由 | 一个带约束的非线性优化
[max Σ 终端输出]{各分支输出相加} s.t. [Σ 输入 = A]{必须全额成交} · [同池按顺序]{后一次 swap 看到前一次的状态} · [无代币环]{!计划里不能出现 x→y→x} · [整数]{uint256，向下取整}
> 边的“权重”随金额变化。所以最优解通常是一张分流图，不是一条最短路径。
```

## B 实验一览 {sheet span=2 meta="frozen"}
```kv cols=3
* 快照: Mantle 5000 · 区块 101082044 · 2026-09-25 00:00 UTC
池子: 143（Agni 45 · FusionX 26 · Uni v3 13 · Moe Classic 14 · Moe LB 45）
代币: 8（USDC、USDT、USDT0、WMNT、mETH、WETH、FBTC、CATI）
用例: 398 = 96 调参 + 302 报告
对照组: full 143 池 · matched 98 池（无 LB）
主配置: 3 跳 · 4 路拆分 · 5% 网格 · 50 块
算法: 6 基础 + 2 SOR 优化 + 9 实验 + 2 后处理（0.2.3）
```

## C 能力对比 {sheet span=2 meta="capability"}
| 算法 | 多跳 | 拆单 | 共享池 | LB |
|---|---|---|---|---|
| `direct` | no | no | no | ok |
| `single_path` | ok | no | no | ok |
| `path_split` | ok | ok | no | ok |
| `uni_sor_port` | ok | ok | no | no |
| `incremental_graph` | ok | ok | ok | ok |
| `metis_history` | ok 4 跳 | ok | ok | ok |

## D 关键数字 {sheet span=2 meta="matched · 240 经验用例"}
| 算法 | 平均短缺 bps | p95 bps | 中位求解 s* |
|---|---:|---:|---:|
| `direct` | 27.97 | 97.59 | 0.0005 |
| `uni_sor_optimized` | 8.36 | 28.97 | 0.20 |
| `path_split` | 6.27 | 22.33 | 5.0 |
| `uni_sor_port` | 6.14 | 22.33 | 12.2 |
| `incremental_graph` | 2.26 | 7.66 | 7.2 |
| `metis_history` | ok 0.69 | ok 3.17 | 6.3 |

\* 共享主机上测得，只作描述，不作速度结论。

## E 演进 {sheet span=2 meta="releases"}
```timeline
0.1.0 | 6 个基础算法 | 含 SOR 平价移植
0.1.2 | SOR 提速 | 采样 + 精确控制
0.2.0 | metis_inspired | 逐块 label 搜索
0.2.1 | 5 个独立方法 | history / 修复 / 防环 / 证书 / 对偶
0.2.2 | 精确上界剪枝 | 3 个 bounded
0.2.3 | 后处理 | 拆分精修 + 分支激活
*0.3.0 | 链上 dry run | 草案：实时状态 + eth_call
```

## F 结论 {sheet span=2}
```callout ok 先用共享池拆单，再解决速度和链上验证
质量排序：`metis_history` ≈ `metis_inspired` > `incremental_graph` > `path_split` ≈ `uni_sor_port` > `single_path` > `direct`。最大的两个因素是跳数上限和是否允许共享池。0.2.3 的后处理从不更差，但平均只多 0.2–0.5 bps，代替不了更细的分块或 4 跳搜索。先读 [F1](#F1)–[F3](#F3)，再读 [面板 V](#panel-V)。
```

## G 如何阅读 {depth=1}
```callout info 默认你已知道（本文不解释）
- 图、路径，以及 Dijkstra / Bellman-Ford 最短路径算法
- ERC-20 代币、交易、gas、approve
- EVM 用 uint256 整数运算，除法向下取整
- DEX 的用途：用户把代币 A 换成代币 B
- 能读 Python 伪代码
```

三条阅读路径：

| 路径 | 读哪些面板 | 读完能做什么 |
|---|---|---|
| 5 分钟 | 顶部总览 A–F + 本面板 | 知道结论和量级 |
| 30 分钟 | + H–V（depth 2） | 能解释每个算法，能参与接入链上的设计 |
| 完整 | + W–X（depth 3） | 能复现数字，能质疑结论 |

只关心算法原理时，按 [前置知识](#panel-I) → [教学图](#panel-L) → [基础算法](#panel-M) → [优化算法](#panel-P) 读。只关心链上落地时，直接读 [面板 U](#panel-U) 和 [面板 V](#panel-V)。只关心 0.2.3 的新方向时，按 [后处理算法](#panel-R2) → [实验设计](#panel-S1) → [实验结果](#panel-S2) → [F9](#F9)–[F11](#F11) 读。

全文用同一张 4 代币、7 个池子的[[教学图]]做例子（[面板 L](#panel-L)）。真实数据的结论全部来自冻结记录，见 [面板 S](#panel-S)。

## H 背景动机（Context） {depth=2}
**问题。** 用户在 Mantle 上把 10,000 USDC 换成 USDT0。Agni、Merchant Moe、FusionX、Uniswap v3 上有多个池子能做这笔兑换。只用最好的单个池子，平均比已知最优少拿 27.97 bps（[面板 S](#panel-S)）。[[聚合器]]要找出一个执行方案（拆单、多跳、合并），让用户拿到最多的目标代币。

**为什么现在做。** Mantle 上的流动性分散在 5 个来源。2026-09 的 7 天成交量里，Agni 占 90.73%，Moe LB 占 8.09%（`docs/DESIGN.md` §5.1）。Uniswap SOR 不支持 Moe LB，所以不能直接拿来用。我们要先知道哪种算法在 Mantle 的真实状态上最好，再写生产 Router。

**范围。**
- 一个冻结的真实区块，5 个来源，143 个池子。
- 单输入、单输出、Exact Input、整数单位。
- 目标是 gross 输出（扣协议费和价格冲击，不扣 gas）。

**非目标。** 生产报价 API、钱包签名、广播交易、部署合约、RFQ / JIT、Exact Output、跨链。本实验不声称全局最优，也不声称生产延迟。

**已有做法及其不足。**

| 做法 | 不足 |
|---|---|
| Uniswap SOR（开源） | 只支持 V2/V3；按池子 ID 判断冲突，3 跳时会组合出代币环（本实验 12 例） |
| Jupiter Metis（闭源） | 只有博客描述，没有源码；Solana 账户模型和 Mantle 不同 |
| KyberSwap（部分开源） | 不支持 Mantle：`/mantle/api/v1/routes` 返回 404（2026-10-04） |
| CFMM 凸优化论文 | 连续解，忽略 gas 和整数，不直接给出可执行计划 |

**约束。** 所有池子数学必须和链上 Solidity 逐 wei 一致。每个计划都由独立的 [[evaluator]] 从快照重放，不信任求解器自报的输出。

## I 前置知识（Background） {depth=2}
```excalidraw q="理解聚合器路由需要哪些概念？按什么顺序学？" read="箭头表示先学 → 后学；灰色虚线框是默认已知。" takeaway="B-0、B-2、B-3、B-4 是读懂所有算法的直接前提。" name=prereq-map kind=前置知识地图
{"grid": {"w": 330, "h": 120}, "defaults": {"w": 210, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "g0", "label": "最短路径（已知）", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "g1", "label": "ERC-20 / 交易（已知）", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 池子报价 f(x)", "col": 1, "row": 0, "color": "blue"},
   {"id": "b1", "label": "B-1 CL / LB 曲线", "col": 1, "row": 1, "color": "blue"},
   {"id": "b4", "label": "B-4 RoutePlan", "col": 1, "row": 2, "color": "blue"},
   {"id": "b2", "label": "B-2 价格冲击与拆单", "col": 2, "row": 0, "color": "blue"},
   {"id": "b3", "label": "B-3 共享池状态", "col": 2, "row": 1, "color": "blue"},
   {"id": "b5", "label": "B-5 CFMM 凸优化", "col": 2, "row": 2, "color": "blue"},
   {"id": "t", "label": "聚合器最佳路由", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "g0", "to": "b0", "label": "对照"},
   {"from": "g1", "to": "b4", "label": "资金"},
   {"from": "b0", "to": "b1"},
   {"from": "b0", "to": "b2", "label": "凹性"},
   {"from": "b1", "to": "b3", "label": "状态"},
   {"from": "b2", "to": "b3"},
   {"from": "b4", "to": "b5", "label": "可执行"},
   {"from": "b2", "to": "t"},
   {"from": "b3", "to": "t", "label": "耦合"},
   {"from": "b5", "to": "t"}
 ]}
```

```prereq B-0 l1 5min
# 池子报价函数（quote）f(x)
是什么: 给定池子状态和输入量 x，精确算出输出量和新状态。常数乘积池（CPMM）的公式是 `dy = floor(dx·(1−fee)·y / (x + dx·(1−fee)))`。
为什么需要: 所有算法都只通过 `quote_exact_in` 看池子。报价是算法唯一的“边权”，也是最贵的操作。
例子:
~~~
P_AB1：储备 100k / 100k，30 bps
输入 10000 → 9066（均价 0.907）
输入  1000 →  987（均价 0.987）
~~~
误解: 误解：输出和输入成正比。事实：输入越大，平均价越差，曲线是凹的。
深入: `docs/references/routing-algorithms.md` §1.7
```

```prereq B-1 8min
# 集中流动性（CL）与 Liquidity Book（LB）
是什么: [[CL]] 池把流动性放在 [[tick]] 区间里，跨越 tick 时流动性变化。[[LB]] 池把价格分成 [[bin]]，每个 bin 内价格固定，费率随波动变化。
为什么需要: 143 个池子里 84 个是 CL、45 个是 LB。它们的报价要逐 tick / 逐 bin 计算，比 CPMM 贵得多。
误解: 误解：可以把所有池子近似成 x·y=k。事实：近似会错判深度和费率，本项目只用精确迁移的 Solidity 数学。
深入: `docs/references/concentrated-liquidity-migration.md`、`liquidity-book-migration.md`
依赖: B-0
```

```prereq B-2 l1 5min
# 价格冲击与拆单
是什么: [[价格冲击]]让大单的平均价变差。把输入分给几个池子，每个池子的冲击变小，总输出可能更高。
为什么需要: 拆单是聚合器比单个 DEX 好的主要原因。最优拆分让各分支的边际价格相等。
例子:
~~~
全进 P_AB1：10000 → 9066
7000 → P_AB1 得 6523
3000 → P_AB2 得 2652
合计 9175（+109）
~~~
误解: 误解：拆得越碎越好。事实：每多一步就多一份 gas，净输出可能更低。
深入: `routing-algorithms.md` §4
依赖: B-0
```

```prereq B-3 l1 5min
# 物理池与共享状态
是什么: 一个[[物理池]]只有一份状态。同一计划里两条分支都经过它时，第二次 swap 看到第一次之后的储备。
为什么需要: 如果把两条分支分开报价再相加，会高估输出。共享池算法必须按“合并成一次 swap”记账。
例子:
~~~
分开：3000 → 5808
      7000 → 13047
      合计 18855 TKC
合并：10000 → 18132 TKC
分开相加高估 723（+4.0%）
~~~
误解: 误解：边际 f(x+d)−f(x) 等于两次顺序 swap。事实：它等于一次合并 swap；两次顺序 swap 会重复收费，输出更少。
深入: `routing-algorithms.md` §6.2；`tests/routing/test_plan_evaluation.py`
依赖: B-2
```

```prereq B-4 l1 5min
# RoutePlan 与独立 evaluator
是什么: [[RoutePlan]] 是有序的 swap 步骤，每步写明输入资金、金额和输出资金。最后一个消费者用 [[ALL_REMAINING]] 拿走余数。
为什么需要: 所有算法输出同一种计划，evaluator 从原始快照重放它。只有重放通过的计划才算数，求解器自报的数字只作诊断。
例子:
~~~
0 P_AC REQUEST 10000 → F1 18132
1 P_CD F1 5562      → F2 5253
2 P_CB F1 剩余全部  → F3 8844
3 P_DB F2 5253      → F4 4048
~~~
误解: 误解：evaluator 只检查输出数字。事实：它还检查资金守恒、先产后用、无代币环、全额成交。
深入: `docs/DESIGN.md` §2.5；`routing/evaluator.py`
依赖: B-3
```

```prereq B-5 10min
# CFMM 路由的凸优化视角
是什么: 论文 arXiv:2302.04938 把所有池子写成凸的“可接受交易集合”。在连续、无 gas 的假设下，最优路由是一个凸优化问题。它的对偶给每个代币一个价格。
为什么需要: 这个视角解释了为什么拆单有收益，也给出 `cfmm_dual` 的算法。它也说明离散搜索丢掉了什么。
误解: 误解：凸优化能直接给出链上计划。事实：解是连续数，要再恢复成整数、无环、全额成交的计划。
深入: [3] Diamandis 等，2023，§1–§2
依赖: B-2
```

## J 聚合器最佳路由 ≠ 一般最佳路径 {depth=2}
一般最短路径问题有两个关键假设：边权是常数，路径代价可以相加。AMM 路由两个都不满足。下表逐项对比。

| 维度 | 一般最佳路径（Dijkstra / Bellman-Ford） | 聚合器最佳路由 |
|---|---|---|
| 边的代价 | 常数 w(u,v)，与流量无关 | 池子输出 f(x) 随输入变化，是凹函数 |
| 组合方式 | 相加：w₁ + w₂ | 复合：f₂(f₁(x)) |
| 解的形状 | 一条路径 | 一张分流图：拆单、共享前缀、合并 |
| 最优子结构 | 有（Bellman 原理） | 没有：1,000 的最优路径不是 10,000 的最优路径 |
| 路径之间 | 独立 | 经过同一池子时互相影响（B-3） |
| 平行边 | 留最短的一条 | 同一币对有多个池（费率档、协议），都可能用上 |
| 数值 | 实数 | uint256 整数、向下取整、dust 输入 |
| 可行性 | 连通即可 | 全额成交、无[[代币环]]、执行顺序、状态范围完整 |
| 成本 | 路径长度 | 协议费和冲击在 f 里；gas 每步固定，使问题非凸 |
| 时间 | 图不变 | 状态每块变化；报价到执行之间会漂移 |

```excalidraw q="输入 1,000 TKA 时，哪条单路径最好？" read="绿色粗线是胜出路径。右侧文字是每条路径的精确输出。" takeaway="小单时，3 跳的 A→C→D→B 最好。" name=amount-small kind=有无对比
{"grid": {"w": 260, "h": 110}, "defaults": {"w": 110, "h": 54},
 "nodes": [
   {"id": "a", "label": "TKA", "col": 0, "row": 1},
   {"id": "c", "label": "TKC", "col": 1, "row": 0},
   {"id": "d", "label": "TKD", "col": 1, "row": 2},
   {"id": "b", "label": "TKB", "col": 2, "row": 1, "color": "green"}
 ],
 "edges": [
   {"from": "a", "to": "c", "label": "P_AC", "strokeColor": "#2f9e44"},
   {"from": "c", "to": "d", "label": "P_CD", "strokeColor": "#2f9e44"},
   {"from": "d", "to": "b", "label": "P_DB", "strokeColor": "#2f9e44"},
   {"from": "c", "to": "b", "label": "P_CB", "dashed": true},
   {"from": "a", "to": "d", "label": "P_AD", "dashed": true},
   {"from": "a", "to": "b", "label": "P_AB1", "dashed": true, "via": [[55, 320], [575, 320]]}
 ],
 "texts": [{"x": 680, "y": 40, "text": "输入 1,000 TKA\nA→C→D→B  1519 ✓\nA→C→B    1461\nA→D→B    1168\nP_AB1     987", "fontSize": 18}]}
```

```excalidraw q="输入 10,000 TKA 时，哪条单路径最好？" read="布局与上图相同，只改了金额。" takeaway="金额变大，最优路径变成 2 跳的 A→C→B。固定边权的 Dijkstra 会对两个金额给出同一条路径。" name=amount-large kind=有无对比
{"grid": {"w": 260, "h": 110}, "defaults": {"w": 110, "h": 54},
 "nodes": [
   {"id": "a", "label": "TKA", "col": 0, "row": 1},
   {"id": "c", "label": "TKC", "col": 1, "row": 0},
   {"id": "d", "label": "TKD", "col": 1, "row": 2},
   {"id": "b", "label": "TKB", "col": 2, "row": 1, "color": "green"}
 ],
 "edges": [
   {"from": "a", "to": "c", "label": "P_AC", "strokeColor": "#2f9e44"},
   {"from": "c", "to": "d", "label": "P_CD", "dashed": true},
   {"from": "d", "to": "b", "label": "P_DB", "dashed": true},
   {"from": "c", "to": "b", "label": "P_CB", "strokeColor": "#2f9e44"},
   {"from": "a", "to": "d", "label": "P_AD", "dashed": true},
   {"from": "a", "to": "b", "label": "P_AB1", "dashed": true, "via": [[55, 320], [575, 320]]}
 ],
 "texts": [{"x": 680, "y": 40, "text": "输入 10,000 TKA\nA→C→B    12434 ✓\nA→C→D→B  11082\nA→D→B     9947\nP_AB1     9066", "fontSize": 18}]}
```

再进一步：10,000 TKA 的最优解不是任何一条路径。共享 P_AC、在 TKC 处分流的计划得到 12892 TKB，比最好的单路径多 458（[面板 M](#panel-M)）。

**“取负对数”技巧为什么不够。** 把汇率取 −log 后，乘法变成加法，Bellman-Ford 可以找负环。这只对无穷小的交易成立，适合套利检测。真实金额下，汇率本身随金额变化，技巧失效。

### 论文 arXiv:2302.04938 怎么描述这个问题
论文 *An Efficient Algorithm for Optimal Routing Through Constant Function Market Makers*（Diamandis、Resnick、Chitra、Angeris，FC 2023）给出最一般的表述。

```annot
# 最优路由问题（论文 §1 式 1） | 连续、凸
[maximize U(Ψ)]{用户效用：凹、递增} subject to [Ψ = Σᵢ Aᵢ Δᵢ]{网络净交易向量：各市场交易映射到全局代币后相加} , [Δᵢ ∈ Tᵢ]{市场 i 接受的交易集合：闭、凸、含 0}
> 对偶分解（§2）：给每个代币一个价格 ν。每个市场独立解“在价格 ν 下的最优套利”，再用 L-BFGS-B 调 ν，直到净流量配平。
```

论文的要点：
1. **市场即凸集。** 每个 CFMM 用交易函数 φ 定义可接受交易集合 T。φ 凹，所以 T 凸。Uniswap v3 池子是许多“有界流动性”CFMM 的集合，论文称为聚合 CFMM（aggregate CFMM）。
2. **问题是凸的。** 效用凹、集合凸，所以整个路由是凸优化。拆单收益来自凸性：最优点让各市场的边际价格一致。
3. **对偶分解可以并行。** 给定价格 ν，每个池子的子问题有闭式解。对偶函数 g(ν) 的梯度就是净流量，所以梯度几乎免费。
4. **论文自己承认的局限（§6）。** 它假设执行时的交易集合和求解时相同。同一块里排在前面的交易会改变池子状态，论文没有处理。它也没有处理固定交易成本（gas）。

论文没有覆盖、但链上执行必须处理的部分：

| 论文假设 | 链上现实 | 本项目怎么处理 |
|---|---|---|
| 连续交易量 | uint256 整数、向下取整 | 所有输出由精确整数报价得出 |
| 任意净流量 | 计划要能按顺序执行，不能有代币环 | evaluator 拒绝代币环；`cfmm_dual` 做整数恢复 |
| CPMM、CL | 还有 LB（bin + 动态费率） | 离散算法精确支持 LB；`cfmm_dual` 不支持 LB |
| 无 gas | 每步有固定 gas | gross 目标；net 目标需要成本模型（[F8](#F8)） |
| 状态已知 | 报价到落地之间状态会变 | 0.3.0 用 `out@k` 测量漂移（[面板 V](#panel-V)） |

## K 实验环境：静态快照与 bench {depth=2}
**核心设计：** 冻结一个真实区块的全部池状态。所有算法在同一份状态、同一批请求、同一个 evaluator 下比较。求解期间不联网，所以差异只来自算法。

### 快照（snapshot）
```kv cols=2
* 快照 ID: mantle-5src-101082044-091b0759 · bundle sha256 717c21f3…3143
区块: 101082044，哈希 0x091b0759…65c4
时间戳: 2026-09-25 00:00:00 UTC（该时刻之后的第一个块）
读取方式: 公共 RPC，所有读取钉在同一区块号 + 哈希
池子: 143，无排除
完整性: 每个代币收集 2 倍最大名义金额的 tick / bin 范围
价格: Dune prices.minute，8 / 8 代币有价格
```

- **池子来源：** 先验证工厂地址和代码哈希，再从工厂发现池子。不按 Dune 的项目名判断池子类型。
- **状态内容：** Classic 池的储备；CL 池的价格、流动性、tick 间距、已初始化 tick 和费率；LB 池的 bin、活跃 bin、静态和动态费率参数。
- **状态不完整：** 计算越过已收集的 tick / bin 范围时，报价返回 `incomplete_snapshot`。它不等于流动性耗尽。

### 用例（cases）

| 类别 | 数量 | 怎么来的 |
|---|---:|---|
| 活跃币对 | 288 | 7 天成交最多的 12 个币对 × 2 方向 × 低 / 中 / 大 3 档 × 4 |
| 无直连池币对 | 48 | 4 个没有直连池的币对，只能多跳 |
| 边界用例 | 62 | 从状态推出：1 个原始单位、刚好能出单的最小量、刚好吃光最深池的量 |
| 合计 | 398 | 96 调参（tuning）+ 302 报告（[[held-out]]） |

- 金额来自历史 swap 腿（leg），不是重建的用户订单。
- 报告集 302 例 = 216 活跃 + 24 无直连 + 62 边界。下文“经验用例”指前两类，共 240 例。

### 两个对照组（cohort）
- **full：** 全部 143 个池子。`uni_sor_port` 不能用其中 45 个 LB 池，差距算“覆盖差”，不算搜索质量。
- **matched：** SOR 能用的 98 个 V2/V3 池子。所有算法看到相同的池子，比较才公平。

### 配置（profile）

| 参数 | full（主配置） | daily（回归用） |
|---|---|---|
| `search.max_hops` | 3 | 2 |
| `search.max_splits` | 4 | 4 |
| `search.percent_step` | 5 | 5 |
| `graph.chunks` | 50 | 200 |
| `graph.label_hops`（metis 系） | 4 | 4 |
| 每例上限 | 900 s / 300,000 次报价 | 120 s / 50,000 次报价 |

参数在调参集上标定（`docs/references/v1-acceptance.md` §3）。2 跳配置在 p95 上比 3 跳少 40–65 bps，只作回归检查。

### bench 流水线
```uml q="一次 bench 从链上数据走到报告，经过哪些部件？" read="上框只在准备阶段联网；下框的求解和评估完全离线。" takeaway="求解器只产出 RoutePlan；输出数字一律由 evaluator 重放得出。"
flowchart TB
  subgraph prep["prepare (online, once)"]
    direction LR
    rpc["Mantle RPC<br/>block 101082044"] --> col["collectors<br/>5 sources"]
    dune["Dune<br/>activity + prices"] --> cs["cases.jsonl<br/>398 cases"]
    col --> bundle[("SnapshotBundle<br/>143 pools, sha256")]
    cs --> bundle
    bundle --> cut["cuts<br/>tuning / report<br/>full / matched"]
  end
  subgraph run["run (offline)"]
    direction LR
    cutin[("one cut<br/>from prepare")] --> runner["runner<br/>1 spawn worker per algorithm"]
    prof["profile.yaml<br/>hops, splits, chunks, budget"] --> runner
    runner --> solve["solve()<br/>returns RoutePlan"]
    solve --> ev["evaluator<br/>fresh replay"]
    ev --> rec[("cases.jsonl<br/>manifest.json")]
    rec --> rep["report / analyze<br/>paired bps"]
  end
  prep ~~~ run
```

### 怎么打分
- **[[best known]]：** 同一次运行里所有算法对同一用例的最好输出。它不是数学最优。
- **[[短缺]]（shortfall）：** `(best − 本算法) / best × 10⁴`，单位 [[bps]]。只在本算法 `ok` 且 best > 0 时计算。
- **成对比较：** 两个算法都 `ok` 的用例上，数“更高 / 相等 / 更低”（H/E/L）。不同代币的原始金额从不相加。
- **状态：** `ok`、`no_route`、`invalid_plan`、`unsupported`、`timeout` 等都保留在分母里，不会被删掉。
- **工作量：** `quotes_executed`（真正执行的报价次数）是唯一跨算法的单位。

```callout warn CAUTION：计时只作描述
参考机器是共享的 Apple M2 Pro（10 核），同时运行其他 agent。0.1.2、0.2.1、0.2.2 的所有正式计时窗口都超过了预注册的负载阈值（1 分钟负载 > 5.0），裁定全部是 inconclusive。本文的秒数只说明量级，不支持“谁更快”的结论。
```

## L 贯穿全文的例子：教学图 {depth=2}
```excalidraw q="后面所有算法都在哪张图上演示？" read="节点是代币，边是池子（30 bps 的 CPMM）。储备见下表。" takeaway="4 个代币、7 个池子，足以展示多跳、拆单和共享池。" name=teaching-graph
{"grid": {"w": 330, "h": 120}, "defaults": {"w": 120, "h": 56},
 "nodes": [
   {"id": "a", "label": "TKA（输入）", "col": 0, "row": 1, "w": 150, "color": "blue"},
   {"id": "c", "label": "TKC", "col": 1, "row": 0},
   {"id": "d", "label": "TKD", "col": 1, "row": 2},
   {"id": "b", "label": "TKB（输出）", "col": 2, "row": 1, "w": 150, "color": "green"}
 ],
 "edges": [
   {"from": "a", "to": "c", "label": "P_AC"},
   {"from": "c", "to": "b", "label": "P_CB"},
   {"from": "a", "to": "d", "label": "P_AD"},
   {"from": "d", "to": "b", "label": "P_DB"},
   {"from": "c", "to": "d", "label": "P_CD", "arrow": "both"},
   {"from": "a", "to": "b", "label": "P_AB1 / P_AB2", "via": [[75, 345], [735, 345]]}
 ]}
```

| 池子 | 方向 | 储备（输入, 输出） | 10,000 全额输出 |
|---|---|---|---:|
| P_AB1 | TKA→TKB | 100,000 / 100,000 | 9066 |
| P_AB2 | TKA→TKB | 200,000 / 180,000 | 8546 |
| P_AC | TKA→TKC | 100,000 / 200,000 | 18132 TKC |
| P_CB | TKC→TKB | 200,000 / 150,000 | — |
| P_AD | TKA→TKD | 100,000 / 150,000 | — |
| P_DB | TKD→TKB | 150,000 / 120,000 | — |
| P_CD | TKC↔TKD | 100,000 / 100,000 | — |

请求固定为 **10,000 TKA → TKB**。各算法在这张图上的结果：

| 算法 | 输出 TKB | 结构 |
|---|---:|---|
| `direct` | 9066 | 全进 P_AB1 |
| `direct_split` | 9175 | 70% P_AB1 + 30% P_AB2 |
| `single_path` | 12434 | A→C→B |
| `path_split`、`uni_sor_port` | 12581 | 80% A→C→B + 20% A→D→B |
| `incremental_graph`、`metis_inspired` | ok 12892 | 共享 P_AC，在 TKC 分流 |

所有数字由 `docs/examples/routing-algorithms/run_examples.py` 独立核对。

## M 基础算法：从单池到共享池拆单 {depth=2}
0.1.0 设计了 5 个本地算法和 1 个 SOR 移植（[面板 N](#panel-N)）。5 个本地算法的能力逐级扩大：单池 → 多跳 → 直连拆单 → 不相交拆单 → 共享池拆单。后一个算法总把前一个算法的最好结果留作候选，所以不会比它差。

### ① `direct`：只看直连池
**原理。** 枚举所有直连 TKA 和 TKB 的池子，每个都全额报价，取最大。

**例子。** P_AB1 给 9066，P_AB2 给 8546，选 P_AB1。

**局限。** 没有直连池时返回 `no_route`（报告集 24 例）。看不到多跳和拆单。

### ② `single_path`：有界多跳，全额走一条
**原理。** 按跳数从小到大枚举无环路径（最多 `max_hops` 跳）。每条路径全额链式报价，取最大。前缀失败时，剪掉所有共享该前缀的路径。相同 (池子, 方向, 金额) 的报价只算一次。

**例子。** 教学图上有 6 条候选路径，共执行 10 次报价、命中缓存 2 次。A→C→B 给 12434，比 `direct` 多 37.15%。

```excalidraw q="single_path 在教学图上选中了哪条路径？" read="绿色是选中的路径；虚线是被比较过的候选。" takeaway="多跳让输出从 9066 升到 12434，但整笔只能走一条路。" name=single-path
{"grid": {"w": 300, "h": 110}, "defaults": {"w": 120, "h": 54},
 "nodes": [
   {"id": "a", "label": "TKA 10000", "col": 0, "row": 1, "w": 140},
   {"id": "c", "label": "TKC 18132", "col": 1, "row": 0, "w": 140},
   {"id": "d", "label": "TKD", "col": 1, "row": 2},
   {"id": "b", "label": "TKB 12434", "col": 2, "row": 1, "w": 140, "color": "green"}
 ],
 "edges": [
   {"from": "a", "to": "c", "label": "P_AC", "strokeColor": "#2f9e44"},
   {"from": "c", "to": "b", "label": "P_CB", "strokeColor": "#2f9e44"},
   {"from": "a", "to": "d", "label": "P_AD", "dashed": true},
   {"from": "d", "to": "b", "label": "P_DB", "dashed": true},
   {"from": "c", "to": "d", "label": "P_CD", "dashed": true},
   {"from": "a", "to": "b", "label": "P_AB1 9066", "dashed": true, "via": [[70, 320], [670, 320]]}
 ]}
```

### ③ `direct_split`：直连池上的网格动态规划
**原理。** 把输入分成 N = 100 / `percent_step` 份。先在每个直连池上报价每个份额，再用精确 DP 求最好的分配（最多 `max_splits` 路）。DP 状态是 (已用路数, 已用份数, 取整余数)。最后一路用 `ALL_REMAINING` 吸收余数，保证整数守恒。

**例子。** 10 份网格、2 路：70% 进 P_AB1 得 6523，30% 进 P_AB2 得 2652，合计 9175，比全额单池多 109。

```excalidraw q="direct_split 怎么分配 10,000 TKA？" read="节点是计划里的 swap 步骤；边上是分配比例。" takeaway="同一币对的两个池子分摊冲击，多拿 109 TKB。" name=direct-split
{"grid": {"w": 300, "h": 100}, "defaults": {"w": 190, "h": 62},
 "nodes": [
   {"id": "r", "label": "REQUEST\n10000 TKA", "col": 0, "row": 0, "dy": 50},
   {"id": "p1", "label": "P_AB1\n7000 → 6523", "col": 1, "row": 0, "color": "blue"},
   {"id": "p2", "label": "P_AB2\n3000 → 2652", "col": 1, "row": 1, "color": "blue"},
   {"id": "o", "label": "TKB 合计\n9175", "col": 2, "row": 0, "dy": 50, "color": "green"}
 ],
 "edges": [
   {"from": "r", "to": "p1", "label": "70%"},
   {"from": "r", "to": "p2", "label": "30%"},
   {"from": "p1", "to": "o"},
   {"from": "p2", "to": "o"}
 ]}
```

**局限。** 只用直连池。网格之外的分配看不到。

### ④ `path_split`：池子不相交的多跳拆单
**原理。**
1. 先跑 `single_path` 和 `direct_split`，结果留作候选。
2. 每条候选路径在网格上采样。
3. 用分支定界搜索最多 `max_splits` 条路径的分配。约束：任意两条路径不共用物理池。
4. 用背包上界剪枝：上界不超过当前最优的分支直接跳过。

**例子。** π1 = A→C→B，π2 = A→D→B，π3 = A→C→D→B。π3 和 π1 共用 P_AC，和 π2 共用 P_DB，被冲突规则排除（13 个分支）。最优是 80% π1 + 20% π2 = 10288 + 2293 = 12581。整个搜索访问 12 个节点。

```excalidraw q="path_split 为什么不能用 A→C→D→B？" read="红色虚线是被冲突规则排除的路径。" takeaway="不相交约束让拆单安全可加，但也挡住了共享前缀的好结构。" name=path-split
{"grid": {"w": 290, "h": 100}, "defaults": {"w": 180, "h": 60},
 "nodes": [
   {"id": "r", "label": "REQUEST\n10000 TKA", "col": 0, "row": 1},
   {"id": "ac", "label": "P_AC\n8000 → 14773", "col": 1, "row": 0, "color": "blue"},
   {"id": "cb", "label": "P_CB\n→ 10288", "col": 2, "row": 0, "color": "blue"},
   {"id": "ad", "label": "P_AD\n2000 → 2932", "col": 1, "row": 2, "color": "blue"},
   {"id": "db", "label": "P_DB\n→ 2293", "col": 2, "row": 2, "color": "blue"},
   {"id": "x", "label": "π3 = A→C→D→B\n共用池：排除", "col": 2, "row": 1, "color": "red", "stroke": "dashed"},
   {"id": "o", "label": "TKB 合计\n12581", "col": 3, "row": 1, "color": "green"}
 ],
 "edges": [
   {"from": "r", "to": "ac", "label": "80%"},
   {"from": "ac", "to": "cb"},
   {"from": "r", "to": "ad", "label": "20%"},
   {"from": "ad", "to": "db"},
   {"from": "r", "to": "x", "dashed": true, "strokeColor": "#e03131"},
   {"from": "cb", "to": "o"},
   {"from": "db", "to": "o"}
 ]}
```

**局限。** 不能先共用一个深池再分流，也不能合并。

### ⑤ `incremental_graph`：允许共享池的逐块贪心
**原理。**
1. 先跑 `path_split`，结果留作候选。
2. 把输入切成 K 个 [[chunk]]（主配置 K = 50）。
3. 每块在所有无环路径上计算[[边际输出]] `f(x_p + d) − f(x_p)`。x_p 是该池已分配的聚合输入。
4. 选边际最大的路径提交，更新各池的聚合输入。会形成代币环的路径不准提交。
5. 所有块提交后，同一池子的所有块合并成一个 swap 步骤，交给 evaluator 重放。
6. 只有严格好于候选时才替换。

**例子。** K = 10。10 块的选择是 `[0,1,1,0,1,1,1,0,1,1]`：3 块走 A→C→D→B，7 块走 A→C→B。两条路都经过 P_AC，所以 P_AC 一次吃进 10000，产出 18132 TKC。

TKC 处分流：5562 进 P_CD→P_DB 得 4048；其余 12570 进 P_CB 得 8844。合计 **12892**，比 `path_split` 多 311。

```excalidraw q="incremental_graph 的合并计划长什么样？" read="P_AC 只执行一次；TKC 处的资金 F1 分给两条后缀。" takeaway="共享深池再分流，是不相交拆单表达不了的结构。" name=incremental-graph
{"grid": {"w": 270, "h": 100}, "defaults": {"w": 175, "h": 62},
 "nodes": [
   {"id": "r", "label": "REQUEST\n10000 TKA", "col": 0, "row": 1},
   {"id": "ac", "label": "P_AC\n10000 → 18132", "col": 1, "row": 1, "color": "blue", "strokeWidth": 3},
   {"id": "cd", "label": "P_CD\n5562 → 5253", "col": 2, "row": 0, "color": "blue"},
   {"id": "db", "label": "P_DB\n5253 → 4048", "col": 3, "row": 0, "color": "blue"},
   {"id": "cb", "label": "P_CB\n12570 → 8844", "col": 2, "row": 2, "color": "blue"},
   {"id": "o", "label": "TKB 合计\n12892", "col": 4, "row": 1, "color": "green"}
 ],
 "edges": [
   {"from": "r", "to": "ac"},
   {"from": "ac", "to": "cd", "label": "5562"},
   {"from": "ac", "to": "cb", "label": "余数"},
   {"from": "cd", "to": "db"},
   {"from": "db", "to": "o"},
   {"from": "cb", "to": "o"}
 ]}
```

**局限。**
- 贪心：早期提交的块会锁死后续结构（修复见[面板 Q](#panel-Q)）。
- 每块都要枚举所有路径。3 跳时中位约 2.9 万次报价，4 跳时更多。
- 块数不单调：3 跳时 200 块在 p95 上比 50 块差。

## N 基础参照：`uni_sor_port`（Uniswap SOR 平价移植） {depth=2}
**为什么要它。** Uniswap SOR 是 EVM 上最常用的开源路由器。`uni_sor_port` 把 `Uniswap/smart-order-router@04c7c0b4`（v4.31.10）的路由核心逐行译成 Python。它在 35 个上游生成的 golden fixture 上和上游选择完全一致。

**原理。**
1. `compute_all_routes`：枚举 V2/V3 池子上的路由（不含 LB）。
2. `build_route_quotes`：每条路由在 5%、10%、…、100% 上报价，填满一张表。
3. 初始解：100% 的最好单路由。
4. 队列：每个百分比放入最好和次好的路由作为种子。
5. 逐层扩展：在剩余百分比里找“第一个不用已用池子”的路由，直到凑满 100%。
6. 整数填充：最后一路用 `ALL_REMAINING`，再交给 evaluator 重放。

```uml q="SOR 的选择循环怎么工作？" read="简化自 best-swap-route.ts；省略了 V8 排序细节。" takeaway="SOR 先填满整张报价表再组合，所以报价次数 = 路由数 × 网格数 × 跳数。"
flowchart TD
  r["compute_all_routes<br/>V2/V3 routes, hops ≤ 3"] --> t["build_route_quotes<br/>route × 5%…100% table"]
  t --> s["incumbent = best 100% route"]
  s --> q["queue seeds: best + 2nd best route per percent"]
  q --> e{"next layer?<br/>queue not empty and splits ≤ max_splits"}
  e -- "yes" --> f["for each node: find_first_route_not_using_used_pools<br/>in each remaining percent group"]
  f --> c{"sum = 100% ?"}
  c -- "no: push extended node" --> q
  c -- "yes" --> u["replace incumbent if quote sum is higher"]
  u --> e
  e -- "no" --> fill["D-1 integer fill<br/>last leg ALL_REMAINING"]
  fill --> ev["evaluator replay"]
```

**例子。** 10 份网格、2 路：4 条路由 × 10 个百分比，共 60 次报价。80% A→C→B 的分支在 20% 组里找不冲突的路由：A→C→B 共用 P_AC，跳过；A→D→B 不冲突，选中。结果 12581，和 `path_split` 相同。

**局限。**
- 不支持 LB。full 对照组里，SOR 用不到 45 个 LB 池。
- 只按池子 ID 判断冲突。3 跳时可能组合出代币环：报告集 12 例 `invalid_plan`（如 USDC→mETH→WETH→USDT 加 USDC→WETH→mETH→USDT）。
- 不允许共享池。
- 先填满整张表：中位约 2.4 万次报价，中位求解约 12 s（共享主机上测得）。

## O 基础算法的缺陷与优化方向 {depth=2}
0.1.0 验收（6 算法 × 302 报告用例）暴露出 4 类问题。后续每个优化算法只针对其中一类，并和它的基础算法成对比较。0.2.3 又加了第 5 类，见 [面板 R2](#panel-R2)。分块贪心的终点计划可能离最佳拆分差不到一块。另外，计划没碰过的池子始终是 0。

```excalidraw q="基础算法有哪些缺陷？各自对应哪个优化方向？" read="左列红色是问题，右列绿色是对应的优化。最后一行是 0.2.3 新增的方向。" takeaway="5 个方向：少报价、搜得更准、保证合法、可证明，以及对算完的计划做后处理。" name=defect-map
{"grid": {"w": 420, "h": 100}, "defaults": {"w": 270, "h": 70, "fontSize": 16},
 "nodes": [
   {"id": "d1", "label": "报价太多、太慢\nSOR 中位 2.4 万次报价", "col": 0, "row": 0, "color": "red"},
   {"id": "d2", "label": "贪心与近似会丢解\n跳数上限挡住好路径", "col": 0, "row": 1, "color": "red"},
   {"id": "d3", "label": "计划可能不合法\nSOR 12 例代币环", "col": 0, "row": 2, "color": "red"},
   {"id": "d4", "label": "只有数值、没有证明\n离散网格看不到全局", "col": 0, "row": 3, "color": "red"},
   {"id": "d5", "label": "块粒度留下拆分误差\n没用过的池子始终为 0", "col": 0, "row": 4, "color": "red"},
   {"id": "o1", "label": "少报价\nadaptive / optimized / bounded", "col": 1, "row": 0, "color": "green"},
   {"id": "o2", "label": "搜得更准\nmetis_inspired / history / repair", "col": 1, "row": 1, "color": "green"},
   {"id": "o3", "label": "保证合法\nuni_sor_cycle_safe", "col": 1, "row": 2, "color": "green"},
   {"id": "o4", "label": "可证明 / 全局视角\ncertified / cfmm_dual", "col": 1, "row": 3, "color": "green"},
   {"id": "o5", "label": "后处理（0.2.3）\nsplit_polish / marginal_activation", "col": 1, "row": 4, "color": "green"}
 ],
 "edges": [
   {"from": "d1", "to": "o1"}, {"from": "d2", "to": "o2"},
   {"from": "d3", "to": "o3"}, {"from": "d4", "to": "o4"},
   {"from": "d5", "to": "o5"}
 ]}
```

| 缺陷 | 证据 | 优化方向 | 算法 | 版本 |
|---|---|---|---|---|
| SOR 先填满报价表 | 中位 24,289 次报价 | 只报价可能有用的格子 | `uni_sor_adaptive`、`uni_sor_optimized` | 0.1.2 |
| 每块枚举全部路径 | `incremental_graph` 中位 23 万条路径打分 | 逐层 label 搜索，4 跳 | `metis_inspired` | 0.2.0 |
| label 只按金额合并 | 构造例 X4 损失 4994.98 bps | 按签名分组比较 | `metis_history` | 0.2.1 |
| 贪心锁死结构 | 构造例：贪心 90545314 vs 最优 111178819 | 检查点 + 后缀修复 | `incremental_graph_repair` | 0.2.1 |
| SOR 组合出代币环 | 12 例 `invalid_plan` | 组合时检查代币图无环 | `uni_sor_cycle_safe` | 0.2.1 |
| 网格最优没有证明 | 只有一个数 | 分支定界 + 精确有理上界 | `direct_split_certified` | 0.2.1 |
| 离散搜索没有全局视角 | — | 论文的对偶分解 + 整数恢复 | `cfmm_dual` | 0.2.1 |
| 大部分报价不可能胜出 | `single_path` 中位 3,134 次报价 | 证明过的上界剪枝，结果不变 | 3 个 `*_bounded` | 0.2.2 |
| 分块提交后不收回，拆分比例有误差 | 50 块时每块 2%；一个真实请求里 LB 腿多拿了 14.15 USDC | 在固定路由上精确线搜索份额 | `split_polish` | 0.2.3 |
| 计划没用过的池子始终为 0 | 论文 P1：“池子激活不足”是短缺的主因 | 在计划执行后的状态上接入新分支 | `marginal_activation` | 0.2.3 |

各优化算法和基础算法的谱系：

```tree
基础算法（0.1.0）
  direct_split | 网格 DP
    direct_split_certified | + 证书（0.2.1）
  single_path | 有界枚举
    single_path_bounded | + 上界剪枝（0.2.2）
  incremental_graph | 共享池贪心
    metis_inspired | 逐块 label 搜索，4 跳（0.2.0）
      metis_history | 按签名比较 label（0.2.1）
        metis_history_bounded | + 上界剪枝（0.2.2）
    incremental_graph_repair | 检查点 + 后缀修复（0.2.1）
    incremental_graph_bounded | + 上界剪枝（0.2.2）
  uni_sor_port | SOR 平价移植
    uni_sor_adaptive / uni_sor_optimized | 自适应采样 / shortlist（0.1.2）
    uni_sor_cycle_safe | 防代币环（0.2.1）
外部方法
  cfmm_dual | 论文对偶分解 + 整数恢复（0.2.1）
后处理（0.2.3，套在一个基础算法的计划上）
  split_polish | 精修拆分比例；基础：incremental_graph / path_split / metis_inspired / metis_history / repair
    marginal_activation | + 激活新分支；基础：incremental_graph / path_split
```

## P 优化方向一：少报价 {depth=2}
报价是最贵的操作：CL 和 LB 池要逐 tick、逐 bin 计算。这个方向有两种做法。启发式做法可能丢解；精确做法保证结果和基础算法相同。

### `uni_sor_adaptive`（配方 H3）：先粗后细的百分比采样
**原理。** 保留 SOR 的组合逻辑不变，只改“哪些格子要报价”。
1. 先只报价 25 / 50 / 75 / 100 这 4 列（粗表）。
2. 用 SOR 核心在粗表上选出当前最优分配。
3. 在当前分配的百分比旁边加 ±5% 的新列，再选一次。
4. 没有新列可加时停止（`converged`）。

**例子。** 教学图、5% 网格（20 列）：

```excalidraw q="自适应采样在教学图上走了几轮？" read="每轮只给新列报价；绿色是终点。" takeaway="66 次报价得到和完整网格（120 次）相同的 12581。" name=adaptive-rounds
{"grid": {"w": 290, "h": 110}, "defaults": {"w": 240, "h": 90, "fontSize": 15},
 "nodes": [
   {"id": "r0", "label": "第 0 轮：25/50/75/100\n24 次报价\n75/25 → 12569", "col": 0, "row": 0},
   {"id": "r1", "label": "第 1 轮：+5/20/30/70/80\n+30 次报价\n80/20 → 12581", "col": 1, "row": 0},
   {"id": "r2", "label": "第 2 轮：+15/85\n+12 次报价\n仍是 80/20", "col": 2, "row": 0},
   {"id": "r3", "label": "收敛：共 66 次\n完整网格 120 次", "col": 3, "row": 0, "color": "green"}
 ],
 "edges": [{"from": "r0", "to": "r1"}, {"from": "r1", "to": "r2"}, {"from": "r2", "to": "r3"}]}
```

**代价。** 结果是采样表上的局部不动点。构造例 `NARROW` 中最优在 90%，从未被采样：自适应得 20740242，完整 SOR 得 20795709，损失 **26.67 bps**。

### `uni_sor_optimized`（配方 H4）：shortlist + 采样 + 精确控制
**原理。**
1. 每条路由只在 5% 和 100% 两个点报价，各取前 8 名，最多留 16 条路由。
2. 在这 16 条上做同样的自适应采样。
3. 打开 3 个精确报价控制：跳过空的 CL 区间（L02）、复用 tick / bin 价格计算（L03）、复用 CL 遍历前缀（L04）。它们不改任何输出。

**代价。** shortlist 可能漏掉好路由。L08 实验里 13 个报告用例有 2 例损失，最大 1.125 bps；报价次数是 SOR 的 0.152 倍。

| 指标（L08 矩阵） | `uni_sor_port` | H3 adaptive | H4 optimized |
|---|---:|---:|---:|
| 报告用例损失 | — | 0 / 13 | 2 / 13（最大 1.125 bps） |
| 报价次数 / SOR | 1.0 | 0.467 | 0.152 |
| sentinel 冷启动（s，受污染） | 3.94 | 1.79 | 0.27 |

两个配方都是 opt-in 实验，没有被采纳为默认。

### 精确上界剪枝：`single_path_bounded` / `incremental_graph_bounded` / `metis_history_bounded`
**原理。** 对每种池子和方向，证明一个廉价的上界：输出 ≤ `floor(r̄ · x)`，r̄ 是精确有理数。多跳时上界逐跳嵌套；逐块搜索时再加一个取整余量（slack）。规则只有一条：

```excalidraw q="上界剪枝什么时候跳过一次报价？" read="菱形是判断点；绿色分支不报价。" takeaway="上界 ≤ 当前最优时跳过；只有严格更大才替换，所以结果和不剪枝完全相同。" name=bound-rule
{"grid": {"w": 320, "h": 130}, "defaults": {"w": 210, "h": 62},
 "nodes": [
   {"id": "c", "label": "候选路径\n/ chunk / label", "col": 0, "row": 0},
   {"id": "u", "label": "算上界 UB\n（精确有理数）", "col": 1, "row": 0},
   {"id": "q", "label": "UB ≤ 最优", "col": 2, "row": 0, "shape": "diamond", "color": "yellow", "w": 250, "h": 96},
   {"id": "s", "label": "跳过，不报价", "col": 3, "row": 0, "color": "green"},
   {"id": "e", "label": "精确报价", "col": 2, "row": 1, "dy": 20},
   {"id": "r", "label": "严格更大才替换", "col": 3, "row": 1, "dy": 20}
 ],
 "edges": [
   {"from": "c", "to": "u"}, {"from": "u", "to": "q"},
   {"from": "q", "to": "s", "label": "是"}, {"from": "q", "to": "e", "label": "否"},
   {"from": "e", "to": "r"}
 ]}
```

**例子（`single_path_bounded`）。** 10,000,000 A → B，7 条候选路径：

| # | 候选 | 精确输出 | 上界 | 当前最优 | 决定 |
|---|---|---:|---:|---:|---|
| 1 | `ab1` | 9871580 | — | — | 报价，成为当前最优 |
| 2 | `ab2` | — | 8973000 | 9871580 | **跳过** |
| 3 | `ab3`（`ab1` 的孪生池） | 9871580 | 9970000 | 9871580 | 报价；相等，不替换 |
| 4 | `ac→cb1` | 9651976 | 9940090 | 9871580 | 报价；更差 |
| 5 | `ac→cb2` | — | 3936786 | 9871580 | **跳过**（从已报价的前缀算上界） |
| 6 | `ad→db` | 10233347 | 10437094 | 9871580 | 报价；**新的最优** |
| 7 | `ae→eb` | — | 7952072 | 10233347 | **跳过** |

基础算法执行 10 次报价，剪枝版执行 6 次，结果都是 `ad→db` 10233347。第 3 行说明方法的极限：上界用现货价，看不到价格冲击，所以等价的孪生池跳不掉。

**没有证明就不剪。** 例如 CL 池的冻结 tick 和价格不一致时，上界返回 `None`，该候选照常报价。

## Q 优化方向二：搜得更深、更准 {depth=2}
这个方向针对 `incremental_graph` 的逐块选择：它慢、跳数受限，而且贪心。

### `metis_inspired`：逐块的分层 label 搜索
**动机。** Jupiter 的 Metis 博客说它用“大幅修改的 Bellman-Ford”，把路由生成和报价合在一起，但没有公开细节。`metis_inspired` 只验证一个窄假设：保留 `incremental_graph` 的一切，只把“每块枚举所有路径”换成“按跳数分层的 [[label]] 搜索”。它**不是** Jupiter Metis。

**原理。**
1. 第 0 层：源代币带着本块的金额。
2. 第 k 层只从第 k−1 层扩展。每条边报价一次，得到新 label（代币, 金额, 路径）。
3. 每层、每个代币只留金额最大的 label。
4. 到不了目标的扩展提前剪掉（按到目标的最短跳数）。
5. 到达目标的 label 里，边际最大者就是本块的选择。

```excalidraw q="第 1 块（1,000 TKA）的 label 搜索怎么选出路径？" read="每列是一层；同一代币在不同层的 label 互不比较。绿色是本块的选择。" takeaway="10 次扩展选出 A→C→D→B（1519），和穷举 6 条路径的结果相同。" name=metis-layers
{"grid": {"w": 270, "h": 110}, "defaults": {"w": 150, "h": 60},
 "nodes": [
   {"id": "l0", "label": "第 0 层\nTKA 1000", "col": 0, "row": 1},
   {"id": "c1", "label": "第 1 层\nTKC 1974", "col": 1, "row": 0, "color": "blue"},
   {"id": "d1", "label": "第 1 层\nTKD 1480", "col": 1, "row": 2, "color": "blue"},
   {"id": "d2", "label": "第 2 层\nTKD 1930", "col": 2, "row": 0, "color": "blue"},
   {"id": "c2", "label": "第 2 层\nTKC 1454", "col": 2, "row": 2, "color": "blue"},
   {"id": "t", "label": "TKB\n选 1519", "col": 3, "row": 1, "color": "green"}
 ],
 "edges": [
   {"from": "l0", "to": "c1", "label": "P_AC"},
   {"from": "l0", "to": "d1", "label": "P_AD"},
   {"from": "c1", "to": "d2", "label": "P_CD"},
   {"from": "d1", "to": "c2", "label": "P_CD"},
   {"from": "d2", "to": "t", "label": "1519", "strokeColor": "#2f9e44", "strokeWidth": 3},
   {"from": "c1", "to": "t", "label": "1461", "dashed": true},
   {"from": "d1", "to": "t", "label": "1168", "dashed": true},
   {"from": "c2", "to": "t", "label": "1079", "dashed": true},
   {"from": "l0", "to": "t", "label": "987", "dashed": true}
 ]}
```

**收益和代价。**
- 平行池多时省工作量：每跳 3 个平行池的构造例里，扩展 100 次 vs 枚举 280 条路径，结果相同。
- 4 跳能找到 3 跳枚举看不到的路径：构造例 X3 从 4992488733 升到 9979616307。
- 每个代币只留一个 label 会丢解：构造例 X4 中最优 4 跳路径要经过已被访问的代币，损失 4994.98 bps。
- 报告集（302 例，4 跳 vs `incremental_graph` 3 跳）：132 胜、48 负、121 平，符号检验 p = 2.93 × 10⁻¹⁰，平均 +1.41 bps。131 / 132 次胜出用到了 4 跳的块。

### `metis_history`：按“历史签名”比较 label
**动机。** 两个前缀到达同一代币时，可能访问过不同的代币。金额大的那个，未来不一定走得通。

**原理。** label 的[[签名]]是（层数, 代币, 已访问代币集合）。只有签名相同的 label 才互相比较。只有在可证明的区域（纯 CPMM 且不会溢出），才删掉金额小的 label；其余情况两个都留，并用上限（每签名 1 个、每层 1,024 个）限制规模。触到上限时记录 `state_cap`，不隐藏。

```excalidraw q="为什么只按金额保留 label 会丢掉最优路径？" read="三个 label 都到达 C。前两个签名相同，第三个签名不同。" takeaway="经 D 的 label 金额更小，却是唯一能继续走到 T 的那个：19560 vs 9938。" name=history-labels
{"grid": {"w": 250, "h": 100}, "defaults": {"w": 165, "h": 62, "fontSize": 16},
 "nodes": [
   {"id": "a", "label": "A 10000", "col": 0, "row": 1},
   {"id": "b", "label": "B（经 ab）", "col": 1, "row": 0},
   {"id": "d", "label": "D（经 ad）", "col": 1, "row": 2},
   {"id": "c1", "label": "C 11926\n{A,B,C}", "col": 2, "row": 0, "color": "blue"},
   {"id": "c2", "label": "C 4969\n{A,B,C}", "col": 2, "row": 1, "color": "blue"},
   {"id": "c3", "label": "C 9840\n{A,C,D}", "col": 2, "row": 2, "color": "blue"},
   {"id": "x", "label": "C→B 重访 B\n走不下去", "col": 3, "row": 0, "dy": 50, "color": "red", "stroke": "dashed"},
   {"id": "b2", "label": "B（经 cb2）", "col": 3, "row": 2},
   {"id": "t", "label": "T 19560", "col": 4, "row": 2, "color": "green"}
 ],
 "edges": [
   {"from": "a", "to": "b", "label": "ab"},
   {"from": "a", "to": "d", "label": "ad"},
   {"from": "b", "to": "c1", "label": "bc1"},
   {"from": "b", "to": "c2", "label": "cb2"},
   {"from": "d", "to": "c3", "label": "dc"},
   {"from": "c1", "to": "x", "dashed": true, "strokeColor": "#e03131"},
   {"from": "c2", "to": "x", "dashed": true, "strokeColor": "#e03131"},
   {"from": "c3", "to": "b2", "label": "cb2"},
   {"from": "b2", "to": "t", "label": "bt", "strokeColor": "#2f9e44"}
 ]}
```

**例子（构造例 R1）。** `metis_inspired` 在 C 只留 11926（经 B），它只能经 B 到 T，但 B 已访问，于是退回 A→B→T = 9938。`metis_history` 把经 D 的 label 放在另一组，走 A→D→C→B→T = **19560**，等于穷举最优。

**真实数据。** 报告集上对 `metis_inspired`：23 胜、254 平、14 负（最大损失 6.05 bps）。预设的上限在 283 / 302 例上触发，这是声明过的近似。

### `incremental_graph_repair`：检查点 + 后缀修复
**动机。** 贪心提交一个块，就加入一些代币边。之后任何需要反向边的路径都会成环，不能再用。早期的错误选择会锁死更好的结构。

**原理。**
1. 照常跑贪心，在每次提交前保存完整[[检查点]]。
2. 从最近的结构性检查点开始，恢复状态，强制换一个首选。
3. 剩下的块用原贪心规则重建。
4. 完整计划从原始快照重放；严格更好才替换。

```excalidraw q="贪心的第 1 块锁死了什么？修复后走哪条路？" read="左：贪心计划，红色边 B→E 挡住了 E→B。右：从空检查点重建后的计划。" takeaway="恢复到第 0 个检查点、换掉首选后，输出从 90545314 升到 111178819。" name=repair-trap
{"grid": {"w": 210, "h": 100}, "defaults": {"w": 90, "h": 50},
 "nodes": [
   {"id": "s1", "label": "S", "col": 0, "row": 1},
   {"id": "b1", "label": "B", "col": 1, "row": 0},
   {"id": "e1", "label": "E", "col": 1, "row": 2},
   {"id": "d1", "label": "D", "col": 2, "row": 1},
   {"id": "s2", "label": "S", "col": 3, "row": 1},
   {"id": "b2", "label": "B", "col": 4, "row": 0},
   {"id": "e2", "label": "E", "col": 4, "row": 2},
   {"id": "d2", "label": "D", "col": 5, "row": 1, "color": "green"}
 ],
 "edges": [
   {"from": "s1", "to": "b1", "label": "sb"},
   {"from": "b1", "to": "e1", "label": "eb", "strokeColor": "#e03131", "strokeWidth": 3},
   {"from": "e1", "to": "d1", "label": "ed"},
   {"from": "s1", "to": "e1", "label": "es"},
   {"from": "b1", "to": "d1", "label": "bd"},
   {"from": "s2", "to": "e2", "label": "es", "strokeColor": "#2f9e44"},
   {"from": "e2", "to": "b2", "label": "be", "strokeColor": "#2f9e44", "strokeWidth": 3},
   {"from": "b2", "to": "d2", "label": "bd", "strokeColor": "#2f9e44"},
   {"from": "e2", "to": "d2", "label": "ed", "strokeColor": "#2f9e44"}
 ],
 "boxes": [
   {"label": "贪心 90545314", "around": ["s1", "b1", "e1", "d1"], "pad": 26, "color": "red"},
   {"label": "修复后 111178819", "around": ["s2", "b2", "e2", "d2"], "pad": 26, "color": "green"}
 ],
 "texts": [
   {"x": 60, "y": 300, "text": "贪心：90545314（第 1 块提交 B→E）", "fontSize": 17, "color": "red"},
   {"x": 690, "y": 300, "text": "修复后：111178819（先走 E→B）", "fontSize": 17, "color": "green"}
 ]}
```

**例子（构造例 `structural_trap`）。** 3 块，每块 1,000,000 S。第 1 块走 S→B→E→D，提交了 B→E。最优计划从 S→E→B→D 开始，需要 E→B，所以贪心永远到不了。修复尝试 6 次：2 次更差、2 次重复、2 次接受，最后得到 111178819，等于 120 种块序列穷举的最优。

**真实数据。** 报告集上对关闭修复的自身：52 胜、239 平、0 负，最大 +9.01 bps。报价次数中位是 1.11 倍。

## R 优化方向三：保证合法与可证明 {depth=2}
### `uni_sor_cycle_safe`：组合时检查代币图无环
**原理。** SOR 只有一个组合点：把一条路由加入部分解。这里加一条规则：组合后所有路由的代币边并集必须无环。其余逻辑（候选、报价表、排序、队列、整数填充）全部保持上游原样。

```excalidraw q="两条各自合法、池子也不重叠的路由，为什么合在一起不合法？" read="蓝色是路由 a,b,c；紫色是路由 d,e,f；红色双箭头是两条路由合起来形成的环。" takeaway="SOR 只看池子 ID，看不到 x→y→x；防环版拒绝这个组合。" name=cycle-safe
{"grid": {"w": 300, "h": 110}, "defaults": {"w": 110, "h": 54},
 "nodes": [
   {"id": "s", "label": "s", "col": 0, "row": 1},
   {"id": "x", "label": "x", "col": 1, "row": 0},
   {"id": "y", "label": "y", "col": 1, "row": 2},
   {"id": "t", "label": "t", "col": 2, "row": 1, "color": "green"}
 ],
 "edges": [
   {"from": "s", "to": "x", "label": "a", "strokeColor": "#1971c2"},
   {"from": "y", "to": "t", "label": "c", "strokeColor": "#1971c2"},
   {"from": "s", "to": "y", "label": "d", "strokeColor": "#9c36b5"},
   {"from": "x", "to": "t", "label": "f", "strokeColor": "#9c36b5"},
   {"from": "x", "to": "y", "label": "b 与 e 成环", "arrow": "both", "strokeColor": "#e03131", "strokeWidth": 3}
 ],
 "texts": [{"x": 700, "y": 60, "text": "uni_sor_port：50/50 组合 → invalid_plan\nuni_sor_cycle_safe：拒绝组合 → 单路由 2231431", "fontSize": 17}]}
```

**真实数据。** 12 例 `invalid_plan` 全部变成 `ok`。其余 276 例和 SOR 完全相同（0 负）。代价是每次组合多一次无环检查，报价次数不变。

### `direct_split_certified`：带证书的网格分配
**原理。** 在和 `direct_split` 完全相同的网格域上做最优优先的分支定界。每个开放节点带一个精确有理数上界（切线松弛）。输出一个计划和一个[[证书]] [下界, 上界]。搜索提前停止时证书仍然有效。

```excalidraw q="证书是怎么收紧到 gap 0 的？" read="从左到右是搜索过程；绿色是最终证书。" takeaway="上界从 59 降到 58，等于找到的可行解，所以 58 在这个网格域上被证明最优。" name=certified
{"grid": {"w": 270, "h": 110}, "defaults": {"w": 220, "h": 66, "fontSize": 16},
 "nodes": [
   {"id": "n1", "label": "根节点上界 59\n（切线松弛）", "col": 0, "row": 0, "color": "yellow"},
   {"id": "n2", "label": "第一个可行解\np2 单池 57", "col": 1, "row": 0},
   {"id": "n3", "label": "更好的可行解\np1 9 + p2 29 → 58", "col": 2, "row": 0},
   {"id": "n4", "label": "所有开放节点\n上界 ≤ 58", "col": 1, "row": 1},
   {"id": "n5", "label": "证书 [58, 58]\ngap 0", "col": 2, "row": 1, "color": "green"}
 ],
 "edges": [
   {"from": "n1", "to": "n2"}, {"from": "n2", "to": "n3"},
   {"from": "n3", "to": "n4"}, {"from": "n4", "to": "n5"}
 ],
 "texts": [{"x": 0, "y": 205, "text": "注意：原始整数最优是 59（p1 10 + p2 28），\n但 p1 在 5% 网格上拿不到 10，所以 59 不在这个域里。", "fontSize": 15, "color": "gray"}]}
```

**例子（构造例 R6）。** 38 S → T，两个 CPMM 池，5% 网格，最多 2 路。证书说明：在这个网格域上 58 是最优；换一个域（池子顺序或原始整数）结论不能照搬。

**真实数据。** 只支持“所有直连池都是 CPMM”的用例。full 对照组 0 例支持；matched 对照组 20 例支持，全部是单池，全部证明 gap 0。它的价值是证书，不是更高的输出。

### `cfmm_dual`：论文的对偶分解 + 精确整数恢复
**原理。**
1. 给每个代币一个[[对偶价格]] ν。
2. 每个池子在价格 ν 下解自己的最优套利（CPMM 有闭式解，CL 用预建索引）。
3. L-BFGS-B 调整 ν，直到每个中间代币的净流量为 0、源代币正好卖出 A。
4. 按拓扑顺序，把连续流量按比例恢复成整数；最后一路拿余数。每一步用精确报价，整个计划交给 evaluator 重放。

```excalidraw q="对偶价格收敛后，150 S 怎么分配？" read="节点下方是对偶价格 ν；边上是连续最优的“卖出 → 买入”量。" takeaway="连续最优 139.35，整数恢复得到 137，整数最优是 138：恢复是启发式，没有最优性保证。" name=cfmm-dual
{"grid": {"w": 380, "h": 140}, "defaults": {"w": 140, "h": 62},
 "nodes": [
   {"id": "s", "label": "S\nν = 0.845", "col": 0, "row": 1},
   {"id": "m", "label": "M\nν = 0.456", "col": 1, "row": 0, "color": "blue"},
   {"id": "t", "label": "T\nν = 1", "col": 2, "row": 1, "color": "green"}
 ],
 "edges": [
   {"from": "s", "to": "t", "label": "st 86.6 → 79.5"},
   {"from": "s", "to": "m", "label": "sm 63.4 → 124.8"},
   {"from": "m", "to": "t", "label": "mt+mt2 124.8→59.9"}
 ],
 "texts": [{"x": 0, "y": 235, "text": "整数恢复：S 150 → st 86 / sm 64；M 125 → mt 91 / mt2 34\n输出 78 + 43 + 16 = 137（连续 139.35；穷举整数最优 138）", "fontSize": 16}]}
```

**真实数据。** 302 例里只有 28 例数值收敛，180 例未收敛，94 例恢复失败后回退到 `single_path`。和 `path_split` 比（matched）：126 胜、85 平、77 负，最差 −4564 bps。结论：功能正确、门禁全过，但**不是**质量改进。它最大的价值是给出连续视角下的估计值（不是上界）。

## R2 优化方向四：后处理——精修拆分，再激活新分支（0.2.3） {depth=2}
前 3 个方向都在改“怎么搜”。这个方向不改搜索，只改一个已经算完的计划。两个[[后处理]]器都先运行一个声明的基础算法，再用精确整数重放在它的计划上做局部优化：

- `split_polish`（E1）：路由不变，只重新分配拆分份额。
- `marginal_activation`（E2）：先做 E1，再把计划没用过的路径作为新分支接进来。

两者都**不是** Jupiter Metis，只支持 gross 目标。它们只在 profile 里写明时运行；`--strategies all` 仍然是 17 行。

**动机。**
- `incremental_graph` 每次提交 A / chunks（50 块时每块 2%），提交后不收回。所以它的计划可能离“同一组路由的最佳拆分”差不到一块。
- Jupiter 的 Ultra V3（2025-10）和 Metis v7（2025-11）公告说，它们用 [[Brent 法]]优化拆单，精度到 0.01% 或 1 bps。公告没有给出算法细节，所以这里只借用思路，算法由合同 `R023-C/1` 自己定义。
- Xi & Moallemi（P1，arXiv 2607.20762）在同币对的池子上测得平均短缺 2.02 bps。其中“已用池子之间拆错”只占 0.05467 bps，主要损失来自“该用的池子没用”。E1 针对前者，E2 针对后者。

```excalidraw q="两个后处理器各自改动计划的哪一部分？" read="上框：一个真实请求上的 E1，路由不变，只挪份额。下框：构造例上的 E2，绿色虚线是新接入的分支。" takeaway="E1 只在已有路由之间挪份额；E2 把没用过的池子接进计划，再重新拆分。" name=postproc-what
{"grid": {"w": 300, "h": 100}, "defaults": {"w": 210, "h": 66, "fontSize": 16},
 "nodes": [
   {"id": "s1", "label": "USDC 10,000", "col": 0, "row": 1},
   {"id": "a1", "label": "Agni V3\n9,950 → 9,964.15", "col": 1, "row": 0, "color": "blue"},
   {"id": "l1", "label": "Moe LB\n50 → 35.85", "col": 1, "row": 2, "color": "blue"},
   {"id": "t1", "label": "USDT0\n+189 raw", "col": 2, "row": 1, "color": "green"},
   {"id": "s2", "label": "S 1,000,000", "col": 0, "row": 5},
   {"id": "p2", "label": "池 p（原计划）\n100% → 50%", "col": 1, "row": 4, "color": "blue"},
   {"id": "q2", "label": "池 q（新分支）\n0 → 50%", "col": 1, "row": 6, "color": "green", "stroke": "dashed"},
   {"id": "t2", "label": "T\n909090 → 952380", "col": 2, "row": 5, "color": "green"}
 ],
 "edges": [
   {"from": "s1", "to": "a1"}, {"from": "s1", "to": "l1"},
   {"from": "a1", "to": "t1"}, {"from": "l1", "to": "t1"},
   {"from": "s2", "to": "p2"}, {"from": "p2", "to": "t2"},
   {"from": "s2", "to": "q2", "dashed": true, "strokeColor": "#2f9e44"},
   {"from": "q2", "to": "t2", "dashed": true, "strokeColor": "#2f9e44"}
 ],
 "boxes": [
   {"label": "E1 split_polish：路由不变，只改份额", "around": ["s1", "a1", "l1", "t1"], "pad": 26, "color": "blue"},
   {"label": "E2 marginal_activation：接入没用过的池子", "around": ["s2", "p2", "q2", "t2"], "pad": 26, "color": "green"}
 ]}
```

### `split_polish`（E1）：在固定资金拓扑上精修拆分份额
**原理。**
1. 运行基础算法。它和单独运行时用完全相同的配置，并和后处理共用一个报价账本。
2. 规范化它的计划：去掉零输入的步骤。每个被消费的资金必须被全部消费；否则拒绝（`unsupported_topology`），原样返回基础计划。
3. 把池子、方向、步骤顺序和资金连线全部固定（[[固定资金拓扑]]）。变量只有每个“被多个步骤消费”的资金上的精确有理数份额。
4. 对每个拆分资金的每一对消费者 (i, j) 做一维线搜索：把份额 t 从 i 挪到 j。t = 0 和两个端点（一方清零）总是评估；内部点用 Brent 法（或黄金分割）在 10⁹ 份的网格上找。
5. 每个点都是一次完整的整数重放，结果等于 evaluator 的结果。严格更高才接受；一轮没有接受就停止（nominee 最多 2 轮）。

**例子（构造例 F7）。** 300 S → T，3 个无手续费的 CPMM 池：`a`（1000 / 2000）、`b`（1000 / 100）、`c`（1000 / 100）。基础计划平均分配。

| 步骤 | 计划 | 输出 | 总输出 |
|---|---|---|---:|
| 基础 | `a` 100、`b` 100、`c` 100 | 181、9、9 | 199 |
| 对 (`a`, `b`)：最优在端点，`b` 清空到 `a` | `a` 200、`c` 100 | 333、9 | 342 |
| 对 (`a`, `c`)：`c` 清空到 `a` | `a` 300 | 461 | ok 461 |
| 对 (`b`, `c`)：两边都是 0，只有 t = 0 | 不变 | | 461 |
| 第 2 轮：没有接受，停止 | | | 461 |

461 等于穷举最优。这里最优解在角上，内部网格只能逼近它，所以两个端点必须评估。Brent 用 92 次模拟、197 次报价；黄金分割用 99 次、210 次，结果相同。报价上限提前到达时，保留最后接受的计划：上限 50 → 199，80 → 342，140 → 461。

**保证与边界。**
- 从不比基础差。每个返回的计划都是 evaluator 合法的整数计划。报价账本用完时状态仍是 `ok`，并记录 `truncated_by`。
- 只是局部的成对搜索：不加池子，不加路由，不保证全局最优。
- 可以接 5 种基础：`incremental_graph`、`path_split`、`metis_inspired`、`metis_history`、`incremental_graph_repair`。

### `marginal_activation`（E2）：精修之后，再激活新分支
**动机。** E1 只能在已有路由之间挪流量。基础计划没用过的池子始终是 0，即使给它一小笔钱比现有路由的边际汇率更好。最接近的公开方法是 PRIME-Flow（P2）：允许路径重叠，在“当前流量”和“新路径”之间搜索拆分比例。

**原理。**
1. 运行 E1，得到当前计划。
2. 模拟一次当前计划，得到计划执行后的池状态（[[post-plan 状态]]）。
3. 在这些状态上，用一小笔 δ = A × 10⁻⁴ 做分层 label 搜索（最多 H 跳）。到达目标代币的路径按输出排序，取前 3 名。
4. 把候选路径作为新分支接到计划后面。新分支可以复用计划里的池子：它在计划用完之后的状态上再执行一次（`shared_sequential`）。合并后的代币图有环就拒绝（`dag_cycle`）。
5. 重新拆分。PF 模式：原 REQUEST 份额整体缩成 (1 − t)，新分支拿 t，对 t 做一次线搜索。full 模式：对合并后的全部资金完整跑一次 E1（消融对照）。
6. 三个条件都满足才接受：新分支第一跳有正的整数输入；总输出严格更高；evaluator 重放（计入报价账本）得到同一个数。
7. 最多激活 K = 2 次。没有候选被接受时停止（`stop_no_candidate`）。

```uml q="E2 怎么决定接不接受一个新分支？" read="从上到下是一次激活迭代；接受后回到 post-plan 状态开始下一次迭代。" takeaway="新分支要过三道关：代币图无环、重新拆分后严格更高、计费的 evaluator 重放相同。"
flowchart TD
  E["split_polish stages<br/>(base + E1, one ledger)"] --> R{"E1 reached<br/>its end?"}
  R -- no --> N["ok, E1 incumbent<br/>not_reached: E1 truncated"]
  R -- yes --> P["post-plan states<br/>delta label search, top-3"]
  P --> C["next ranked terminal"]
  C --> D{"union token<br/>graph acyclic?"}
  D -- "no: dag_cycle" --> C
  D -- yes --> S["seed (PF / donor)<br/>re-split (PF / full polish)"]
  S --> A{"flow > 0, gross higher,<br/>charged replay equal?"}
  A -- yes --> H["rebuild, publish"] --> P
  A -- "no: no_gain_or_zero_flow" --> C
  C -. none left .-> T["stop_no_candidate"]
```

**例子。** 10⁶ S → T，两个无手续费的 CPMM 池 `p`、`q`，储备都是 10⁷ / 10⁷。基础计划全走 `p`。

| 步骤 | 发生了什么 | 总输出 |
|---|---|---:|
| 基础 | `p` 1,000,000 → 909090 | 909090 |
| E1 | 只有一个消费者，没有可拆的 | 909090 |
| 第 1 次：提议 | δ = 100；在 post-plan 状态上 `p` 给 82，没动过的 `q` 给 99，`q` 排第一 | |
| 种子 | `p` 999900、`q` 100 | 909107 |
| PF 线搜索 | t = 1/2 最优：`p`、`q` 各 500000 → 各 476190 | 952380 |
| 接受 | 第一跳流量 > 0，952380 > 909090，重放相同 | ok 952380 |
| 第 2 次 | 两个池在新状态上都给 90；都会复用池子，没有严格增益：`stop_no_candidate` | 952380 |

激活阶段用了 203 次报价。full 模式得到同一个计划，但用了 861 次。两个[[匹配对照]]从同一个 E1 结果出发，都停在 909090：只精修不激活，这里没有可拆的。

**保证与边界。**
- 从不比基础差。每次接受的激活都满足三点：第一跳流量为正、输出严格更高、重放结果相同。
- label 搜索每层、每个代币只留一个 label，所以前 3 名不是全局前 3 名。被 `dag_cycle` 拒绝的路径不修复。
- 只能接 `incremental_graph` 和 `path_split` 两种基础。

### 一个真实请求：10,000 USDC → USDT0
同一区块的 19 池 fixture，`config/daily_gross.yaml` 的参数，用显式 profile 运行（复现见 [面板 X](#panel-X)）。

| 算法 | 输出 USDT0 | 报价次数 | 计划 |
|---|---:|---:|---|
| `incremental_graph`（基础） | 10000.663447 | 264 | Agni V3 9,950 USDC + Moe LB 50 USDC |
| `split_polish` | ok 10000.663636 | 360（264 + 96） | Agni V3 9,964.149090 + Moe LB 35.850910 |
| `marginal_activation` | ok 10000.663636 | 588（+ 228） | 和 E1 相同；没有接受新分支 |

- **E1 重拆了那一块 LB。** `incremental_graph` 每块 50 USDC，正好给了 Moe LB 一块。E1 用一次 Brent 线搜索把 14.149090 USDC 挪回 Agni V3，多出 189 raw（约 0.0002 bps）。第 2 轮没有改进。
- **E2 没找到值得激活的分支。** δ = 1 USDC。前 3 名里 Agni V3 和 Moe LB 已在计划中，只能在两条腿之间挪流量。Moe Classic `0x69a7` 是新池，但它的 USDT0 储备只有 14410 raw。三个候选都记为 `no_gain_or_zero_flow`。
- 这是单个请求的探索，不是 campaign 结果。campaign 结果见 [面板 S2](#panel-S2)。

### 怎么选用
- 每个后处理器的选项全部必填，没有预设：E1 6 个（`base`、`solver`、`rounds`、`tolerance`、`grid`、`maxiter`），E2 12 个。
- 一个 profile 只能有一个 `split_polish` 条目，所以每种基础各写一个 profile。
- 非 gross 目标直接返回 `unsupported`，基础算法不运行。
- campaign 后两者的处置都是 [[keep_experimental]]：不采纳，不改默认。

## S 方法与证据：全部算法的 bench 结果 {depth=2}
### 统一结果表（本文从冻结记录重算）
数据来自 0.2.1 正式 campaign 的两个 roster 运行：14 个算法 × 302 个报告用例，主配置（3 跳、4 路、5%、50 块；metis 系 4 跳），gross 目标。每个用例的 best known 取这 14 个算法的最大值。3 个 `*_bounded` 不在表里：它们在 1,194 / 1,194 / 1,978 个单元上和参照算法逐项相同（[F7](#F7)）。0.2.3 的两个后处理器也不在表里：它们用另一次 campaign，只和自己的基础与参照成对比较（[面板 S1](#panel-S1)、[S2](#panel-S2)）。

**matched 对照组（98 池，SOR 公平比较），240 个经验用例：**

| 算法 | ok | 达到 best | 平均短缺 bps | p50 | p95 | 中位求解 s* | 中位报价次数 |
|---|---:|---:|---:|---:|---:|---:|---:|
| `direct` | 216 | 44 | 27.97 | 7.58 | 97.59 | 0.0005 | 4 |
| `direct_split` | 216 | 44 | 22.70 | 7.58 | 79.25 | 0.003 | 90 |
| `single_path` | 240 | 44 | 13.70 | 7.58 | 50.19 | 0.75 | 1,256 |
| `uni_sor_optimized` | 240 | 45 | 8.36 | 3.81 | 28.97 | 0.20 | 2,896 |
| `uni_sor_adaptive` | 240 | 45 | 6.72 | 3.33 | 23.68 | 3.56 | 11,438 |
| `path_split` | 240 | 45 | 6.27 | 3.31 | 22.33 | 5.01 | 14,042 |
| `uni_sor_port` | 230 | 45 | 6.14 | 2.70 | 22.33 | 12.19 | 24,289 |
| `uni_sor_cycle_safe` | 240 | 47 | 6.10 | 3.17 | 22.09 | 13.71 | 25,197 |
| `incremental_graph` | 240 | 76 | 2.26 | 0.41 | 7.66 | 7.25 | 19,896 |
| `incremental_graph_repair` | 240 | 85 | 2.17 | 0.39 | 7.24 | 9.43 | 23,382 |
| `metis_inspired` | 240 | 142 | 0.76 | 0.00 | 4.02 | 6.02 | 16,014 |
| `metis_history` | 240 | 148 | ok 0.69 | 0.00 | ok 3.17 | 6.33 | 16,606 |
| `cfmm_dual` | 240 | 109 | 87.44 | 0.22 | 88.35 | 0.04 | 10 |
| `direct_split_certified` | 18 | 18 | 0.00 | 0.00 | 0.00 | 0.00 | 1 |

\* 共享主机、负载最高 15，只作量级参考。`uni_sor_port` 的 10 例 `invalid_plan` 不进短缺统计。`direct_split_certified` 只在 18 个单池 CPMM 用例上有结果。

**full 对照组（143 池，含 LB），240 个经验用例：**

| 算法 | ok | 达到 best | 平均短缺 bps | p95 | 中位求解 s* |
|---|---:|---:|---:|---:|---:|
| `direct` | 216 | 40 | 27.22 | 102.25 | 0.001 |
| `single_path` | 240 | 40 | 14.39 | 46.72 | 1.70 |
| `uni_sor_optimized` | 240 | 39 | 13.04 | 46.52 | 0.19 |
| `uni_sor_port` | 230 | 39 | 10.88 | 42.35 | 12.28 |
| `path_split` | 240 | 42 | 6.65 | 23.57 | 5.40 |
| `incremental_graph` | 240 | 86 | 2.45 | 10.69 | 9.23 |
| `incremental_graph_repair` | 240 | 102 | 2.40 | 10.37 | 14.51 |
| `metis_inspired` | 240 | 164 | 0.71 | 4.60 | 6.50 |
| `metis_history` | 240 | 174 | ok 0.69 | ok 4.84 | 6.89 |
| `cfmm_dual` | 240 | 61 | 92.09 | 132.79 | 0.03 |

在 full 组里，SOR 系的短缺比 matched 组大 4–5 bps。差距来自它们用不到的 45 个 LB 池，属于覆盖差，不是搜索质量差。

### 质量与求解时间
```excalidraw q="每个算法落在“质量 × 时间”的哪个格子里？" read="横轴：中位求解时间分档；纵轴：平均短缺分档（matched，240 经验用例）。越靠上、越靠左越好。时间来自受污染的主机。" takeaway="没有一个算法同时最快和最好；metis 系质量最好，uni_sor_optimized 是最快的中等质量选项。" name=pareto-grid
{"grid": {"w": 250, "h": 86}, "defaults": {"w": 225, "h": 72, "fontSize": 14},
 "nodes": [
   {"id": "mh", "label": "metis_history 0.69\nmetis_inspired 0.76", "col": 3, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "ig", "label": "incremental_graph 2.26\n…_repair 2.17", "col": 3, "row": 2, "color": "blue"},
   {"id": "uso", "label": "uni_sor_optimized 8.36", "col": 1, "row": 3, "color": "yellow"},
   {"id": "usa", "label": "uni_sor_adaptive 6.72", "col": 2, "row": 3},
   {"id": "ps", "label": "path_split 6.27", "col": 3, "row": 3},
   {"id": "sor", "label": "uni_sor_port 6.14\ncycle_safe 6.10", "col": 4, "row": 3},
   {"id": "sp", "label": "single_path 13.70", "col": 2, "row": 4},
   {"id": "d", "label": "direct 27.97\ndirect_split 22.70\ncfmm_dual 87.44（长尾）", "col": 1, "row": 5, "color": "red"}
 ],
 "texts": [
   {"x": 270, "y": 30, "text": "< 0.25 s", "fontSize": 16, "color": "gray"},
   {"x": 520, "y": 30, "text": "0.25–5 s", "fontSize": 16, "color": "gray"},
   {"x": 770, "y": 30, "text": "5–10 s", "fontSize": 16, "color": "gray"},
   {"x": 1020, "y": 30, "text": "> 10 s", "fontSize": 16, "color": "gray"},
   {"x": 60, "y": 112, "text": "< 1 bps", "fontSize": 16, "color": "gray"},
   {"x": 60, "y": 198, "text": "1–5 bps", "fontSize": 16, "color": "gray"},
   {"x": 60, "y": 284, "text": "5–10 bps", "fontSize": 16, "color": "gray"},
   {"x": 60, "y": 370, "text": "10–20 bps", "fontSize": 16, "color": "gray"},
   {"x": 60, "y": 456, "text": "> 20 bps", "fontSize": 16, "color": "gray"}
 ]}
```

### 按金额分档（full 对照组，平均短缺 bps）

| 算法 | 低额（72） | 中额（72） | 大额（72） | 无直连池（24） |
|---|---:|---:|---:|---:|
| `direct` | 42.42 | 20.36 | 18.88 | no_route |
| `single_path` | 24.02 | 11.20 | 6.54 | 18.62 |
| `path_split` | 9.16 | 4.49 | 2.90 | 16.83 |
| `uni_sor_port` | 12.88 | 9.00 | 8.45 | 18.28 |
| `incremental_graph` | 3.17 | 0.99 | 0.52 | 10.39 |
| `metis_history` | 0.67 | 0.77 | 0.74 | ok 0.33 |

无直连池币对最依赖搜索深度。3 跳的 `incremental_graph` 差 10.39 bps，4 跳的 `metis_history` 只差 0.33 bps。

### 预注册的成对比较（登记分析的原始输出）

| 比较 | 对照组 | 成对 n | 更高 / 相等 / 更低 | p50 / p95 bps | 来源 |
|---|---|---:|---|---|---|
| `incremental_graph` vs `uni_sor_port` | matched | 276 | 176 / 100 / 0 | +0.28 / +14.03 | v1 §5.2 |
| `uni_sor_port` vs `path_split` | matched | 276 | 9 / 233 / 34 | 0.00 / 0.00 | v1 §5.2 |
| `path_split` vs `direct` | matched | 252 | 159 / 93 / 0 | +5.36 / +122.67 | v1 §5.2 |
| `incremental_graph` vs `uni_sor_port` | full（覆盖差） | 276 | 196 / 80 / 0 | +4.41 / +38.34 | v1 §5.3 |
| `metis_inspired`(4 跳) vs `incremental_graph`(3 跳) | full | 301 | 132 / 121 / 48 | 0.00 / +10.35 | metis §5 |
| `metis_history` vs `metis_inspired` | full | 291 | 23 / 254 / 14 | 最大 +363.9，最差 −6.05 | r021 §3.1 |
| repair 开 vs 关 | full | 291 | 52 / 239 / 0 | 最大 +9.01 | r021 §3 |
| `uni_sor_cycle_safe` vs `uni_sor_port` | matched | 276 | 0 / 276 / 0 | 0 / 0（另有 12 例 invalid → ok） | r021 §3 |
| `cfmm_dual` vs `path_split` | matched | 288 | 126 / 85 / 77 | 0 / 最差 −4564 | r021 §3 |

### 精确剪枝省下的工作量（full 对照组，302 例）

| 算法对 | 报价次数 参照 → 剪枝 | CL swap 步数 | LB bin 数 | 逐项相同的单元 |
|---|---|---|---|---:|
| `single_path` → `_bounded` | 865,583 → 166,847（−80.7%） | −49.3% | −86.8% | 1,194 / 1,194 |
| `incremental_graph` → `_bounded` | 8,591,807 → 6,134,446（−28.6%） | −8.3% | −13.1% | 1,194 / 1,194 |
| `metis_history` → `_bounded` | 5,562,023 → 5,253,049（−5.6%） | −2.3% | −2.3% | 1,978 / 1,978 |

单请求（USDC → USDT 1,000）5 次运行的中位求解时间：`single_path` 2.576 s → 0.415 s；`incremental_graph` 14.12 s → 13.39 s；`metis_history` 11.03 s → 11.00 s。这些是描述性的单请求测量，不是计时裁定。

### 状态汇总（302 例，full 对照组）

| 算法 | ok | no_route | invalid_plan | unsupported |
|---|---:|---:|---:|---:|
| `direct`、`direct_split` | 277 | 25 | 0 | 0 |
| 多跳本地算法（6 个） | 301 | 1 | 0 | 0 |
| `uni_sor_port` | 288 | 2 | warn 12 | 0 |
| `uni_sor_adaptive` / `optimized` / `cycle_safe` | 300 | 2 | 0 | 0 |
| `cfmm_dual` | 288 | 14 | 0 | 0 |
| `direct_split_certified` | 0 | 24 | 0 | 278 |

所有运行都没有 `timeout`、`algorithm_error` 或 `incomplete_snapshot`。

## S1 0.2.3 实验设计：research-023 预注册 campaign {depth=2}
后处理器的增益很小，容易被噪声和事后挑选盖住。所以这次实验先写合同 `R023-C/1`，固定问题、组、对照、门禁和处置；再在调参集上选参数；最后冻结代码，在报告集上只跑一次。

### 要回答的 5 个问题
全部是描述性的结果，不算 p 值：302 个用例共享 32 个有向币对和一个区块，不是独立样本。

| 问题 | 问什么 | 比较 |
|---|---|---|
| Q1 | E1 在各种基础上能加多少 | `split_polish(B)` vs B，6 种基础 |
| Q2 | E1 能不能代替更细的分块 | `split_polish(A0)` vs C100、C200 |
| Q3 | E2 的增益是不是来自“激活” | E2 vs 两种匹配对照 |
| Q4 | E2 和参照算法比怎样 | E2 vs C100、C200、M4、S4、REP |
| Q5 | Brent 和黄金分割哪个省工作量 | 成对的精修报价次数和输出 |

### 23 个组（arm）
| 组 | 数量 | 内容 |
|---|---:|---|
| 参照 | 7 | A0 = `incremental_graph` 50 块；C100、C200 = 100 / 200 块；M4 = `metis_inspired`（4 跳）；S4 = `metis_history`；REP = `incremental_graph_repair`；PS = `path_split` |
| E1-b | 6 | Brent，2 轮，容差 10⁻⁴，网格 10⁹，maxiter 60；接在 A0、C100、M4、S4、REP、PS 上 |
| E1-g | 1 | 黄金分割 2 轮，接在 A0 上（求解器对照） |
| E2 | 3 | PF on A0、PF on C100、full on A0；K = 2，前 3 名，δ = A / 10⁴ |
| E2 的对照 | 6 | 每个 E2 组各带一个 `work_matched` 和一个 `call_matched` |

- 每组都用 `config/full_gross.yaml` 的搜索参数：3 跳、4 路、5%，每例 900 s / 300,000 次报价，种子 1447，一次测量。
- 17 个非对照组另跑一遍不计时的“工作量通道”，统计 CL swap 步数和 LB bin 数。

### 匹配对照：增益是不是来自激活？
E2 比 E1 多花了报价。如果把这些报价用来继续精修 E1，也许能得到同样的增益。两个[[匹配对照]]排除这种解释：

```excalidraw q="两个匹配对照和处理组有什么不同？" read="三组从同一个 E1 结果出发；右侧是成对比较。" takeaway="起点和工作量相同，只差“加新分支”还是“继续精修”。对照本身只比 E1 多 0.002–0.019 bps。" name=matched-controls
{"grid": {"w": 320, "h": 112}, "defaults": {"w": 240, "h": 80, "fontSize": 15},
 "nodes": [
   {"id": "e1", "label": "E1 的结果\n（同一起点）", "col": 0, "row": 1},
   {"id": "tr", "label": "处理组：激活\n最多 K = 2 个新分支", "col": 1, "row": 0, "color": "green"},
   {"id": "wm", "label": "work_matched\n继续精修，直到花掉\n同样多的报价", "col": 1, "row": 1, "color": "blue"},
   {"id": "cm", "label": "call_matched\n精修同样多次\n（每次一整轮 E1）", "col": 1, "row": 2, "color": "blue"},
   {"id": "cmp", "label": "成对比较\n处理组 − 对照", "col": 2, "row": 1, "color": "yellow"}
 ],
 "edges": [
   {"from": "e1", "to": "tr"}, {"from": "e1", "to": "wm"}, {"from": "e1", "to": "cm"},
   {"from": "tr", "to": "cmp"}, {"from": "wm", "to": "cmp"}, {"from": "cm", "to": "cmp"}
 ]}
```

- **work_matched：** 从 E1 结果继续跑 E1 精修，直到花掉和激活阶段相同的报价数（硬上限），或一次精修没有改进。
- **call_matched：** 跑和激活阶段相同次数的优化调用，每次是一整轮 E1 精修。
- 对照只是测量用的组，不是可以选用的路由器。

### 顺序：先登记，再跑报告集
```timeline v
8162df3 | 合同 R023-C/1 | 问题、组、对照、门禁、处置
52a5261 · b8c93f9 · 4f17770 | 实现 | E1；E2 + 对照；E1 的 M4 / S4 / REP 基础
调参集 96 例 | 选定 nominee | 看过 probe 结果后选定
1bfd3f9 → 阶段 T | 在调参集上跑整个 schedule | 40 / 40 ok，没有改任何设置
*60ac764 | 冻结并推送 | 2026-10-06 06:35:20Z
阶段 R | 报告集只跑一次 | 06:36:17Z → 13:43:38Z，没有重跑
```

### 门禁与处置
- **E1 门禁：** 0 个非法计划；0 次比同一个基础记录差；报价账本 = 基础 + 自身；0 次 `unsupported_topology`；0 次重建错误。
- **E2 门禁：** 同上，再加对照审计：0 次超出工作目标，0 次调用次数不符。
- **处置词：** 门禁全过则为 [[keep_experimental]]。它的意思是“证据照实报告，仍然 opt-in”，不是采纳。

### 分母
23 组 × 302 例 = 6,946 个单元：6,923 个 `ok`，23 个 `no_route`（每组都是同一个用例）。没有 `timeout`、`invalid_plan` 或 `algorithm_error`。

- 10 个用例的基础输出为 0。它们单独计数，不进 bps，所以计分分母是 291。
- C100 上的 E2 有 2 例在 E1 阶段就用完报价（`not_reached`）。它们留在 302 里，但不计分，所以 PF（C100）的分母是 289。
- 每个 E1 / E2 记录里的基础行，都和对应参照组同一用例的记录逐项相同：4,832 / 4,832，0 处不同。Q1 比较的是完全相同的基础。
- [[H/E/L]] 数用例；“币对 净+ / 净−”数 32 个有向币对中整体更高 / 更低的个数。

```callout warn CAUTION：证据边界
- 报告集已被 0.1.0、0.2.0、0.2.1、0.2.2 看过（`previously_exposed`）。
- nominee 是在调参集上看过结果后选定的。
- 只有一个区块，不推广到新区块。
- 没有 L01 计时协议，所以不声称任何速度。共享主机 6 路并发，最大单次求解 101 s（C200）。
```

## S2 0.2.3 结果：从不更差，但只多出零点几 bps {depth=2}
数字全部来自 `docs/references/research-023/results.md` 和 `campaign/report-analysis.json`。bps 是“第一个计划相对第二个计划”的成对差，正数表示第一个更好。

### Q1：E1 对自己的基础
| 基础 B | 更高/相等/更低 | 平均 bps | p50 | p95 | 币对 净+ / 净− |
|---|---|---:|---:|---:|---|
| A0（`incremental_graph` 50 块） | 199/92/0 | 0.447 | 0.072 | 1.915 | 26 / 0 |
| C100（100 块） | 205/86/0 | 0.329 | 0.074 | 1.608 | 27 / 0 |
| M4（`metis_inspired`） | 214/77/0 | 0.494 | 0.129 | 2.383 | 29 / 0 |
| S4（`metis_history`） | 214/77/0 | ok 0.529 | 0.112 | 2.422 | 29 / 0 |
| REP（`incremental_graph_repair`） | 199/92/0 | 0.454 | 0.071 | 2.336 | 26 / 0 |
| PS（`path_split`） | 181/110/0 | 0.224 | 0.018 | 0.865 | 22 / 0 |

分母都是 291 / 302。6 种基础上都是 0 例更低，改进 181–214 例。增益集中在低额和中额（A0 上中位 0.30 / 0.16 bps），边界用例上中位为 0。

### Q2：E1 对更细的分块
| 比较 | 更高/相等/更低 | 平均 bps | p5 | p50 | p95 | 币对 净+ / 净− |
|---|---|---:|---:|---:|---:|---|
| `split_polish(A0)` vs C100 | warn 84/85/122 | 0.472 | −1.422 | 0.000 | 3.856 | 8 / 18 |
| `split_polish(A0)` vs C200 | warn 63/79/149 | 0.682 | −1.768 | −0.004 | 9.015 | 7 / 19 |

按用例数和币对数，E1 都输给更细的分块。平均值为正，来自少数长尾用例：粗分块在那里留下了很大的拆分误差。调参集已经预测了这个结果，报告集上更明显（币对 13 / 14 → 8 / 18）。

### Q3：E2 对匹配对照
| 处理组 vs 对照 | 计分 | 更高/相等/更低 | 平均 bps | p50 | p95 | 币对 净+ / 净− |
|---|---:|---|---:|---:|---:|---|
| PF（A0）vs work_matched | 291 | 209/78/4 | 0.210 | 0.060 | 0.948 | 28 / 1 |
| PF（A0）vs call_matched | 291 | 202/79/10 | 0.195 | 0.053 | 0.945 | 28 / 0 |
| full（A0）vs work_matched | 291 | 208/76/7 | 0.257 | 0.059 | 1.027 | 28 / 1 |
| full（A0）vs call_matched | 291 | 208/78/5 | 0.258 | 0.059 | 1.027 | 28 / 0 |
| PF（C100）vs work_matched | 289 | 195/88/6 | 0.146 | 0.044 | 0.564 | 28 / 0 |
| PF（C100）vs call_matched | 289 | 186/87/16 | 0.130 | 0.040 | 0.559 | 27 / 0 |

- **增益来自激活。** 每个 E2 组都胜过两个对照。对照本身只比 E1 多 +0.002 到 +0.019 bps：同样的预算用来继续精修，几乎没有收益。
- **激活的去向（PF，A0）。** 210 个用例中共接受 395 次激活。111 个候选因 `dag_cycle` 被拒绝，159 个没有增益，116 次迭代因没有候选而停止，0 次因预算停止。
- PF 保留了 full 模式大部分的增益（0.210 vs 0.257），工作量却小得多（见下文的物理工作量）。

### Q4：E2 对参照算法
每格是“更高 / 相等 / 更低，平均 bps”。PF（C100）的 C100 列就是它自己的基础。

| 处理组 | vs C100 | vs C200 | vs M4 | vs S4 | vs REP |
|---|---|---|---|---|---|
| PF（A0） | 170/56/65，+0.685 | 116/56/119，+0.895 | 143/52/96，warn −0.747 | 141/51/99，warn −1.986 | 233/56/2，+0.622 |
| PF（C100） | 235/54/0，+0.479 | 175/54/60，+0.691 | 156/50/83，warn −0.962 | 150/49/90，warn −2.210 | 212/54/23，+0.416 |
| full（A0） | 183/56/52，+0.748 | 134/56/101，+0.958 | 146/52/93，warn −0.684 | 145/51/95，warn −1.923 | 233/56/2，+0.685 |

- **对 `incremental_graph` 系的参照（C100、C200、REP）：** E2 在多数用例上更高。唯一的例外是 PF（A0）vs C200（116 / 56 / 119）。PF（C100）vs C200 有 26 个币对净正、3 个净负。
- **对 M4 和 S4：** E2 在更多用例上更高，但**平均值为负**。M4 和 S4 的 label 搜索在少数用例上找到好得多的路由（p5 约 −10 bps；最大是 S4 在一个 dust 边界用例上的 −351 bps）。对 `incremental_graph` 系计划的局部修改到不了那些路由。
- E2 从不低于自己的基础（PF（C100）vs C100：235 / 54 / 0）。

### Q5 与物理工作量
**Brent vs 黄金分割（都是 2 轮，接在 A0 上）。** 输出几乎相同：107 / 110 / 74，平均 +0.004 bps，p95 +0.019。黄金分割的精修报价是 Brent 的中位 1.207 倍（p95 1.432），301 例合计 2,983,922 vs 2,367,236 次。这是“精度与评估次数解耦”的实测形式，不是速度结论。

**物理工作量（不计时的工作量通道，302 例合计，相对各自基础）：**

| 组 | 报价次数 / 基础 | CL swap 步数 / 基础 | LB bin 数 / 基础 |
|---|---:|---:|---:|
| E1-b（A0） | 1.276 | 1.014 | 1.072 |
| E1-g（A0） | 1.347 | 1.020 | 1.090 |
| E2 PF（A0） | 1.305 | 1.046 | 1.079 |
| E2 full（A0） | warn 2.260 | warn 1.448 | 1.283 |
| E2 PF（C100） | 1.345 | 1.046 | 1.104 |
| E1-b（M4 / S4 / REP / PS） | 1.489 / 1.503 / 1.211 / 1.038 | 1.022 / 1.022 / 1.013 / 1.006 | 1.086 / 1.086 / 1.067 / 1.010 |

精修报价在物理上很便宜：E1 多 28% 报价，只多 1.4% CL swap 步数。原因是它在相近的金额上重新报价已用的池子。只有 E2 full 的物理成本很大（CL 步数 +44.8%）。参照组的工作量和 0.2.2 campaign 逐项相同，这是一个跨 campaign 的确定性检查。

### 调参集 vs 报告集
| 指标 | 调参集（96） | 报告集（302） |
|---|---|---|
| E1-b（A0）平均 / p50 / p95 bps | 0.473 / 0.086 / 2.076 | 0.447 / 0.072 / 1.915 |
| E1-b（A0）vs C100，币对 净+ / 净− | 13 / 14 | 8 / 18 |
| PF（A0）vs work_matched | +0.199（74/19/3） | +0.210（209/78/4） |
| full（A0）vs work_matched | +0.247 | +0.257 |

报告集上没有“好得可疑”的迹象：增益和对照差距都在调参集数字的几百分之一 bps 以内。

### 为什么比 Jupiter 公告的数字小
这里只依据合同登记的来源（`research-023/sources.md` 里的引文和哈希）。

| 公开的说法 | 实际衡量的是什么 | 和本实验的关系 |
|---|---|---|
| “100x performance improvements”（Ultra V3） | 没有定义指标；对比的是已退役的 Metis；是一组改动的合计 | 只作动机，不作目标。可迁移的只有“精度与评估次数解耦”，即 Q5 |
| +0.63 bps 正滑点（QE、Ultra V3） | 执行价和报价之差 | 不是一个路由算法对另一个的增益 |
| Brent 拆单到 0.01% / 1 bps（Ultra V3、Metis v7） | 拆分精度 | 就是 E1 的杠杆。P1 测得它只占 2.02 bps 短缺里的 0.05467 bps |
| RTSE、预测执行、JIT 链上重拆、RFQ 等 | 动态状态、执行层、Mantle 没有的场所 | 冻结的单区块 gross 重放测不到 |

另外，这里每个基础本身都已经精确拆单，留给 E1 的空间很小。基础从 50 块换到 100 块后，E1 平均增益从 0.447 降到 0.329 bps。

## T 发现 {depth=2}
```finding F1 high
# 允许共享池的拆单，比 Uniswap SOR 平均少损失约 3.9 bps，而且从不更差
结论: matched 对照组 240 个经验用例上，`incremental_graph` 平均短缺 2.26 bps，`uni_sor_port` 6.14 bps。成对比较中前者 176 胜、100 平、0 负，p95 +14.03 bps。
证据: [observed] v1 验收 F2 运行（`docs/references/v1-acceptance.md` §5.2）。[observed] 本文从 0.2.1 roster 记录重算的统一表（面板 S，脚本见复现）。[inferred] “从不更差”来自它把 `path_split` 留作候选，这是构造保证。
影响: 链上 roster 至少要有一个共享池算法；SOR 只适合作为对照或快速兜底。
```

```finding F2 high
# 跳数上限是影响质量最大的单项参数
结论: 2 跳配置在 p95 上比 3 跳少 40–65 bps。4 跳的 `metis_inspired` 对 3 跳 `incremental_graph` 132 胜 48 负（p = 2.93 × 10⁻¹⁰），131 次胜出用到 4 跳块。无直连池币对上，4 跳把短缺从 10.39 降到 0.33 bps。
证据: [observed] v1 §5.3a；`docs/references/metis-challenge-results.md` §5；本文分档表。[inferred] 这次比较同时改了机制和跳数，增益不能全部归给 label 机制。
影响: 生产路由应支持 4 跳；为了承受 4 跳的成本，需要 label 搜索和剪枝。
```

```finding F3 high
# metis_history 最接近已知最优
结论: full 对照组 240 个经验用例中，`metis_history` 有 174 个达到 best known，平均短缺 0.69 bps，p95 4.84 bps，最大 10.1 bps。对 `metis_inspired` 23 胜 14 负。
证据: [observed] 统一表（面板 S）；`docs/references/research-021/results.md` §3.1。[observed] 预设上限在 283 / 302 例触发，属于声明过的近似。
影响: 作为链上 roster 的质量主力；`metis_history_bounded` 结果相同，可直接替换。
```

```finding F4 medium
# SOR 提速配方把报价次数降到 0.15–0.47 倍，质量损失小但非零
结论: `uni_sor_optimized` 中位报价 2,896 次（SOR 24,289 次），matched 平均短缺 8.36 vs 6.14 bps。`uni_sor_adaptive` 在 L08 的 13 个报告用例上 0 损失。
证据: [observed] L08 结果（`latency-optimization-results.md` §3.5）；统一表。[observed] 所有速度裁定都是 inconclusive（主机负载）。
影响: 适合在严格延迟预算内先给出一个可用答案，再由慢的算法更新。
```

```finding F5 high
# 三个“修正型”方法消除了已知缺陷，且在报告集上没有损失
结论: `uni_sor_cycle_safe` 把 12 例 `invalid_plan` 变成 `ok`，其余 276 例完全相同。repair 对关闭修复 52 胜 0 负。`direct_split_certified` 的 20 个证书全部 gap 0。
证据: [observed] `research-021/results.md` §3、§5、§8。[observed] certified 的真实证书只覆盖单池 CPMM 用例。
影响: 链上计划必须带防环检查；repair 的收益小（最大 9.01 bps），要和 1.11 倍报价成本一起权衡。
```

```finding F6 high
# cfmm_dual 的整数恢复不可靠，不是质量改进
结论: 302 例中只有 28 例收敛，94 例恢复失败。matched 上对 `path_split` 有 77 负，最差 −4564 bps。
证据: [observed] `research-021/results.md` §3、§5。[inferred] 失败集中在 CL 多市场和 dust / 取整边界用例。
影响: 论文的方法适合给出连续估计值和价格信号，不适合直接产出链上计划。
```

```finding F7 high
# 上界剪枝是精确的，单路径上省 80.7% 的报价
结论: 3 个 bounded 策略在 4,366 个未截断单元上和参照逐项相同。报价减少 80.7%（single_path）、28.6%（incremental_graph）、5.6%（metis_history）。
证据: [observed] `research-022/results.md` §0、§4。[observed] 计时裁定 inconclusive。
影响: 链上 roster 用 `*_bounded` 替换参照，零质量风险；metis_history 的收益小，需要更紧的上界。
```

```finding F8 medium
# 净输出（扣 gas）目标还不能用来选拆单计划
结论: 成本模型 v1 没有校准拆单和共享池计划。empirical_cost 目标下，拆单算法改选单路由，放弃中位 14–22 bps 的 gross。
证据: [observed] v1 §5.4、§10.2。[inferred] 链上每步的真实 gas 是缺失的输入。
影响: 0.3.0 用 eth_call 收集每步 gas，拟合新的成本模型版本。
```

```finding F9 high
# split_polish 从不更差，但平均只多 0.22–0.53 bps，代替不了更细的分块
结论: 6 种基础上 0 例更低，改进 181–214 / 291 例。A0 上平均 +0.447 bps（p50 0.072）。但按用例数输给 C100（84 / 85 / 122）和 C200（63 / 79 / 149）。
证据: [observed] `research-023/results.md` Q1、Q2；门禁全过，处置 keep_experimental。[observed] A0 上报价 1.276 倍，CL swap 步数只有 1.014 倍。
影响: 可以作为精确基础计划之后的廉价收尾。要提升质量，先加细分块或用 4 跳搜索。
```

```finding F10 high
# 激活新分支是更大的杠杆，但对 4 跳 label 搜索平均仍为负
结论: PF（A0）比 work_matched 对照高 +0.210 bps（209 / 78 / 4），比 call_matched 高 +0.195。对照本身只比 E1 多 +0.002 到 +0.019 bps。对 M4、S4 的平均值为负（PF（C100）：−0.962 / −2.210 bps）。
证据: [observed] `research-023/results.md` Q3、Q4。[inferred] M4 / S4 的 label 搜索在少数用例上找到更好的路由。局部修改 `incremental_graph` 系计划到不了这些路由。
影响: E2 目前只接 `incremental_graph` 和 `path_split`，不能代替 `metis_history`。值得试的下一步是把激活接到 metis 系基础上。
```

```finding F11 medium
# 增益小于 Jupiter 公告，是因为两者衡量的不是同一件事
结论: Jupiter 唯一量化的价格数字是 +0.63 bps 正滑点，衡量执行价和报价之差。“100x”没有定义指标。P1 测得拆错只占 2.02 bps 短缺里的 0.05467 bps。
证据: [observed] `research-023/sources.md` 的引文（Ultra V3、QE、P1）。[inferred] 冻结的单区块 gross 重放测不到 RTSE、JIT 链上重拆等动态机制。
影响: 不要把 Jupiter 的公告数字当作 Mantle 路由的目标。动态重拆的价值由 0.3.0 的 `resplit@k` 指标来测。
```

## U 链上：真实的聚合器是怎么运作的 {depth=2}
真实聚合器分成两半：链下服务负责“看状态、算路由、出 calldata”，链上合约负责“按 calldata 执行、检查最小输出”。下文证据有三类：KyberSwap 开源的 `kyberswap-dex-lib` 与链上 Router 源码；Jupiter 接口与程序 IDL；Uniswap SOR 源码。详见 `docs/external/jupiter-kyberswap-research.md`。

```excalidraw q="一个真实聚合器由哪些部件组成？一笔兑换怎么流过它们？" read="上框是链下服务，下框是一笔链上交易。灰色虚线是外部系统。" takeaway="路由在链下算；链上只按计划执行，并用余额差检查 minReturn。" name=real-aggregator
{"grid": {"w": 340, "h": 150}, "defaults": {"w": 215, "h": 64, "fontSize": 16},
 "nodes": [
   {"id": "rpc", "label": "链上状态\nRPC / 日志 / 账户流", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "trk", "label": "发现 + 状态跟踪", "col": 1, "row": 0, "color": "violet"},
   {"id": "sim", "label": "纯函数模拟器\n（禁止联网）", "col": 2, "row": 0, "color": "blue"},
   {"id": "srch", "label": "路由搜索\nSOR / Metis / …", "col": 3, "row": 0, "color": "blue"},
   {"id": "usr", "label": "用户钱包", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "bld", "label": "构建 calldata\nminReturn + deadline", "col": 3, "row": 1, "color": "blue"},
   {"id": "rtr", "label": "Router\n余额差 ≥ minReturn", "col": 0, "row": 2, "color": "green"},
   {"id": "exe", "label": "Executor", "col": 1, "row": 2, "color": "green"},
   {"id": "pa", "label": "Pool A\nswap + 回调付款", "col": 2, "row": 2},
   {"id": "pb", "label": "Pool B", "col": 3, "row": 2}
 ],
 "edges": [
   {"from": "rpc", "to": "trk"}, {"from": "trk", "to": "sim"}, {"from": "sim", "to": "srch"},
   {"from": "srch", "to": "bld"},
   {"from": "bld", "to": "usr", "label": "报价 + calldata"},
   {"from": "usr", "to": "rtr", "label": "签名"},
   {"from": "rtr", "to": "exe", "label": "转入"},
   {"from": "exe", "to": "pa", "label": "第1跳"},
   {"from": "pa", "to": "pb", "label": "第2跳"}
 ],
 "boxes": [
   {"label": "链下：聚合器服务", "around": ["trk", "sim", "srch", "bld"], "pad": 24, "color": "blue"},
   {"label": "链上：一笔交易", "around": ["rtr", "exe", "pa", "pb"], "pad": 24, "color": "green"}
 ]}
```

### 链下：三层后端 + 路由搜索
1. **发现（discovery）。** 从工厂事件增量发现新池子。KyberSwap 的规则写明：优先链上发现，不依赖链下索引。
2. **状态跟踪（tracking）。** 收到池子日志后更新状态。KyberSwap 的做法：
   - V3：本地累加 Mint / Burn 的流动性变化，标量在 latest 重读；
   - LB：从日志解析受影响的 bin id，只重读这些 bin；
   - V2：直接从 `Sync` 日志解出储备。
   - 每次更新后做廉价自检：CL 所有 tick 的 `liquidityNet` 之和必须为 0；LB 各 bin 储备之和必须等于池储备。不通过就整池重读。
3. **模拟（simulation）。** 纯函数报价，不准联网。Jupiter 的 `Amm` 接口分成 `get_accounts_to_update` / `update` / `quote` 三段，文档明确禁止报价时联网。
4. **路由搜索。** 在模拟器上搜索。Uniswap SOR 用 TVL 选候选池，用链上 Quoter 批量报价，再做百分比组合。Jupiter Metis、KyberSwap 的搜索算法闭源。
5. **构建 calldata。** 把计划编码成 Router 的调用参数，带上 `minReturnAmount`（报价 × (1 − 滑点)）和 deadline。

### 链上：一笔兑换的执行
```uml q="用户发出交易后，链上按什么顺序执行？" read="以 KyberSwap MetaAggregationRouterV2 为蓝本简化；Jupiter 的检查方式类似。" takeaway="Router 不信任路由：它只比较执行前后的余额差，不够就整笔回滚。"
sequenceDiagram
  autonumber
  participant U as User wallet
  participant A as Aggregator API
  participant R as Router
  participant E as Executor
  participant PA as Pool A
  participant PB as Pool B
  U->>A: quote(tokenIn, tokenOut, amount)
  A-->>U: route + calldata (minReturn, deadline)
  U->>R: swap(calldata) signed tx
  R->>R: record balance of receiver
  R->>E: transferFrom user, call executor
  E->>PA: swap(amountIn, recipient)
  PA-->>E: callback: pay tokenIn
  E->>PB: swap(intermediate amount)
  PB-->>U: tokenOut to receiver
  R->>R: balance delta >= minReturn ?
  alt enough
    R-->>U: success
  else not enough
    R-->>U: revert whole tx
  end
```

### 计划格式对比

| 项目 | KyberSwap | Jupiter | 本项目 `RoutePlan` |
|---|---|---|---|
| 结构 | 两层 `swapSequences[][]` | 拓扑排序的交易 DAG | 有序步骤 + 资金引用 |
| 金额 | calldata 内金额可按比例缩放 ±5% | 每步 `percent`：取输入槽余额的百分比 | 整数绝对金额，最后一路 `ALL_REMAINING` |
| 成交保护 | 余额差 ≥ `minReturnAmount` | `quotedOutAmount` + `slippageBps` | evaluator 重放（离线） |
| 和池子交互 | adapter 直接调池子 `swap` + 回调 | CPI 调各 AMM 程序 | 0.3.0：验证用执行合约，同样直调池子 |

Jupiter 的 `RoutePlanStep { swap, percent, input_index, output_index }` 和我们的 `RoutePlan` 是同一种抽象。区别在于它用百分比，状态变了计划仍能执行；我们用绝对金额，落地块上可能余额不够而回滚。

### 执行时的再优化
- **KyberSwap Smart Settlement：** 报价时给滑点风险高的跳附加候选池。执行时，合约在候选池里比较，选输出最高的一个，同一笔交易内完成。
- **Jupiter JIT（DynamicSwap）：** 链上按执行时的真实状态重新报价，最多 6 个池，按 5% 粒度重新拆分，再和链下拆分比较取优。14 天统计中 26.89% 的交易换了池集合。
- 两家都没有公布输出改善的 bps。两者在 Mantle 上都不可用。

### Mantle 上的现状

| 对象 | 状态（2026-10-04 核实） |
|---|---|
| OKX DEX API | ok 支持 Mantle，返回可执行 calldata |
| KyberSwap 聚合器 | no 不支持 Mantle；dex-lib 也没有 Agni / FusionX / Merchant Moe |
| Odos | no 2026-07-30 停止服务 |
| OpenOcean、LI.FI、1inch | warn 待调研 |
| Agni、Merchant Moe 自带路由 | ok 可作为“不聚合”的单 DEX 基线 |

## V 接入链上：从离线实验到 aggregator {depth=2}
**思路：** 不重写算法。把“冻结快照”换成“实时状态”，把“离线 evaluator 重放”扩展成“链上 eth_call 执行验证”。下面按 0.3.0 设计草案（`docs/external/0.3.0-onchain-dry-run-design-draft.md`，待 owner 审阅）说明，最后列出生产化还缺什么。

### 四层接入
```uml q="我们的算法接入链上后，由哪些部件组成？" read="① ③ 是 0.3.0 新增的 live/ 与 tools/executor/；② 原样复用 routing/、pools/；虚线和 ④ 是 0.3.0 之后的生产化部件。" takeaway="求解层一行不改；新增的是状态层、验证层和执行层。"
flowchart TB
  subgraph state["① state layer (live/)"]
    logs["block logs + multicall<br/>pinned to (number, hash)"] --> tracker["LiveState tracker<br/>invariants, reorg rollback"]
  end
  subgraph solve["② solve layer (unchanged)"]
    roster["roster workers<br/>single_path_bounded · uni_sor_optimized<br/>incremental_graph_bounded · metis_history_bounded"]
    comp["composite<br/>best result within 5 s"]
    roster --> comp
  end
  subgraph verify["③ verify layer"]
    ev["evaluator<br/>exact replay"]
    exe["plan executor<br/>eth_call + state override"]
  end
  subgraph prod["④ execute layer (after 0.3.0)"]
    enc["encoder<br/>RoutePlan → calldata"]
    router["Router + Executor<br/>deployed contracts"]
  end
  intents["intents<br/>synthetic + mirrored"] --> roster
  tracker -- "LiveState.at(block)" --> roster
  comp --> ev --> exe
  aggs["aggregator adapters<br/>OKX, ..."] --> exe
  exe --> rec[("records<br/>offline replay")]
  comp -.-> enc -.-> router
```

| 层 | 0.3.0 做什么 | 复用什么 | 新增什么 |
|---|---|---|---|
| ① 状态 | 每块拉取已准入池子的日志；有日志的池子在该块重读 | 5 个 collector、精确池子数学 | 实时跟踪器、自检不变量、reorg 回滚、LB 快速启动 |
| ② 求解 | 小 roster 并行求解；5 s 内最好的结果作为“我们的报价” | 全部算法、`prepare` / `solve` 接口 | intent 源、roster runner |
| ③ 验证 | evaluator 重放后，用 eth_call 在同一块上执行计划 | evaluator | 验证用执行合约（只在 state override 中存在） |
| ④ 执行 | 不做（0.3.0 不广播、不部署） | — | 生产化时：encoder、Router、gas 模型 |

### 一次实时报价的时序
```uml q="0.3.0 中，一个 intent 从发出到记录经过哪些步骤？" read="k 是落地块偏移，取 0、1、2、5 和实测延迟。" takeaway="同一块、同一 intent 下比较我们和外部聚合器；结果都由 eth_call 执行决定，不信任任何一方自报。"
sequenceDiagram
  autonumber
  participant T as Tracker
  participant I as Intent source
  participant S as Roster (parallel)
  participant V as Evaluator
  participant X as Executor (eth_call)
  participant G as Aggregator APIs
  participant D as Recorder
  T->>T: follow head, re-read touched pools at block N
  I->>S: intent at head N
  I->>G: same intent
  S->>V: RoutePlans within 5 s budget
  V->>X: strict mode at block N
  X-->>V: per-step output + gas (exec_gap)
  G-->>X: calldata, simulate at block N
  loop each landing block N+k
    X->>X: proportional mode at N+k
  end
  X->>D: out@k, gas_sim, statuses
  D->>D: append record (offline replayable)
```

### 关键问题：整数金额在落地块上会失效
我们的计划写的是绝对金额。落地块上第一跳的实际产出不同，后面的固定金额可能超支而回滚。所以执行合约分两种模式：

```excalidraw q="执行合约的严格模式和比例模式有什么区别？" read="左：报价块上按原金额执行，用来验证 exec_gap = 0。右：落地块上 F1 变少（示意数字），按原比例分配。" takeaway="比例模式让计划在状态变化后仍能执行，语义上等于 Jupiter 的 percent DAG；RoutePlan 和 evaluator 都不用改。" name=executor-modes
{"grid": {"w": 270, "h": 100}, "defaults": {"w": 200, "h": 62, "fontSize": 15},
 "nodes": [
   {"id": "f1", "label": "F1 = 18132 TKC\n报价块 N", "col": 0, "row": 1, "color": "violet"},
   {"id": "cd1", "label": "P_CD 固定 5562", "col": 1, "row": 0},
   {"id": "cb1", "label": "P_CB 余数 12570", "col": 1, "row": 2},
   {"id": "f2", "label": "F1 = 18000 TKC\n落地块 N+k（示意）", "col": 2, "row": 1, "color": "violet"},
   {"id": "cd2", "label": "P_CD 30.67% = 5521", "col": 3, "row": 0, "color": "green"},
   {"id": "cb2", "label": "P_CB 余数 12479", "col": 3, "row": 2, "color": "green"}
 ],
 "edges": [
   {"from": "f1", "to": "cd1"}, {"from": "f1", "to": "cb1"},
   {"from": "f2", "to": "cd2"}, {"from": "f2", "to": "cb2"}
 ],
 "boxes": [
   {"label": "严格模式 k = 0", "around": ["f1", "cd1", "cb1"], "pad": 22, "color": "blue"},
   {"label": "比例模式 k > 0", "around": ["f2", "cd2", "cb2"], "pad": 22, "color": "green"}
 ]}
```

### 新增的链上指标

| 指标 | 定义 | 回答什么问题 |
|---|---|---|
| `exec_gap` | eth_call 执行输出 − evaluator 输出，同一块 | 我们的池子数学和链上是否一致（应为 0） |
| `out@k` | 落地块 N+k 上的模拟输出 | 延迟会损失多少 |
| `gap_vs(agg)@k` | 我们 vs 每个外部聚合器，成对 bps | 我们的路由在真实环境中排第几 |
| `gas_sim` | 执行合约按步返回的 gas | 用来拟合新的成本模型（[F8](#F8)） |
| `resolve@k` / `reselect@k` / `resplit@k` | 在落地块状态上重解 / 每跳重选 / 重新拆分 | 链上再优化（JIT）值不值得做 |

### 接入步骤
1. 冻结 0.3.0 的 roster：`single_path_bounded`（基线）、`uni_sor_optimized`（快）、`incremental_graph_bounded`、`metis_history_bounded`（质量）。bounded 版本和参照结果相同，零风险替换（[F7](#F7)）。0.2.3 的两个后处理器是 keep_experimental，不进这个 roster（[F9](#F9)、[F10](#F10)）。
2. 实现 `LiveState.at(block)`：返回和 `SnapshotBundle` 兼容的状态，钉在一个区块号和哈希上。
3. 写验证用执行合约：直接调池子的 `swap` 和回调，按步返回输出和 gas。用 fork 测试证明严格模式复现 evaluator。
4. 接入外部聚合器 adapter（先 OKX），同一 intent 同一块报价，并用 eth_call 模拟它们的 calldata。
5. 跑 24 小时试运行，再跑预注册的 7 天 campaign。
6. 用 `gas_sim` 拟合每协议的 gas 模型（基础值 + 每跨一个 tick / bin 的增量），作为新成本模型版本。
7. 生产化（0.3.0 之后）：写 encoder，把 `RoutePlan` 编码成比例语义的 calldata；部署 Router + Executor；Router 用余额差检查 `minReturn`。

```callout warn CAUTION：Python 求解速度是上线的主要障碍
质量最好的算法中位求解 6–9 s（受污染的测量），而 Mantle 约 2 s 出一个块。0.3.0 用固定 k 报告把“路由质量”和“实现速度”分开评估，不做性能重写。上线前需要：更紧的上界、跨请求复用准备好的索引，或者用编译型语言重写求解核心。
```

```callout err WARNING：不要把离线 gross 排名直接当成链上排名
离线结果不含 gas。拆单和共享池计划步数更多，gas 更高。在 `gas_sim` 和新成本模型就绪之前，不要按 gross 排名决定默认路由。
```

## W 局限与开放问题 {depth=2}
- **单快照。** 所有结论来自一个区块（101082044）。没有证明时间上的泛化。
- **best known 不是最优。** 短缺是相对 14 个算法的最好结果。metis 系用 4 跳，其他用 3 跳，所以 best known 本身偏向 4 跳算法。
- **报告集已暴露。** 302 个报告用例在 0.1.0 之后多次被看过。0.2.x 的结论标为 `previously_exposed`。
- **用例是 swap 腿，不是用户订单。** 金额分布可能和真实订单不同。
- **计时全部 inconclusive。** 共享主机负载超过阈值。需要一台专用机器重测。
- **只比较 gross。** 成本模型没有校准拆单计划。
- **没有链上执行证据。** 计划只经过精确 Python 数学重放，没有在 EVM 上执行。0.3.0 的 `exec_gap` 会补上这一点。
- **0.2.3 的参数来自调参集。** nominee 是在调参集上看过 probe 结果后选定的。合同同时把这一点写进了证据边界。
- **0.2.3 不含的机制。** 按代币合并重参数化、停用分支来解环、Fast Mode、逐 tick 精确缓存都不在 0.2.3 里。
- **开放问题：**
  1. 4 跳的增益有多少来自 label 机制，多少来自跳数？需要同跳数的消融。
  2. `metis_history_bounded` 只省 5.6% 的报价；能否用凹包络得到更紧的上界？
  3. LB 是否值得做一个 `uni_sor_lb`（0.2.1 研究结论：narrow go，未实现）？
  4. Mantle 上的 JIT 执行能挽回多少 `out@k` 损失？
  5. 把 E2 的激活接到 `metis_history` 上，能否同时拿到 4 跳 label 搜索和激活的好处？目前 E2 只支持 `incremental_graph` 和 `path_split`。
  6. PF（A0）有 111 个候选被 `dag_cycle` 拒绝。按代币合并或先停用一个分支，能救回多少？

## X 复现 {depth=3}
环境：`uv sync`；冻结语料在 `data/corpus/mantle-5src-101082044/`（gitignored，清单见 `tests/fixtures/corpus/full_bundle.json`）。

**教学图上的所有数字**（离线，不需要凭据）：
```bash
uv run python docs/examples/routing-algorithms/run_examples.py
uv run pytest tests/docs/test_routing_algorithm_examples.py tests/docs/test_r021_examples.py tests/docs/test_r022_examples.py tests/docs/test_r023_examples.py
```
预期：每个例子打印 `[OK]`，测试全部通过。`run_examples.py` 的第 23–26 节是 0.2.3 的例子（F7、`p` / `q` 构造例、真实请求和 campaign 数字）。

**单个请求，17 个算法并排：**
```bash
uv run python main.py quote --bundle tests/fixtures/corpus/bundle \
  --profile config/daily_gross.yaml --token-in USDC --token-out USDT0 --amount 10000 --details
```
预期：`incremental_graph` 等 6 行输出 10000.663447 USDT0（99.5% Agni V3 + 0.5% Moe LB），其余多数行 10000.660449，`direct_split_certified` 为 `unsupported`。

**同一请求上的 0.2.3 后处理器（[面板 R2](#panel-R2)）：** 复制 `config/daily_gross.yaml`，把 `algorithms` 换成 `incremental_graph`、`split_polish`、`marginal_activation`。再写出两个后处理器全部选项（见 `routing-algorithms.md` §11.5），存为 `r023-walkthrough.yaml`：
```bash
uv run python main.py quote --bundle tests/fixtures/corpus/bundle \
  --profile r023-walkthrough.yaml --token-in USDC --token-out USDT0 --amount 10000 \
  --strategies profile --details
```
预期：两个后处理器都输出 10000.663636（比基础多 189 raw），报价次数 360 和 588。

**面板 S 的统一表**（只读冻结记录）：
```bash
python3 docs/external/routing-report/unified_table.py \
  <artifacts>/research-021/whi-1562/aa5726c5706ea7fb8c5a9c4dc49243fdd1570136/R
```
预期第一段输出包含：`metis_history ok 240 at_best 174/240 mean 0.69 p50 0.00 p95 4.84`。

**登记过的分析**（各 campaign 的原始脚本）：
- 0.1.0：`docs/references/v1-acceptance.md` §11
- 0.2.1：`docs/references/research-021/results.md` §12
- 0.2.2：`docs/references/research-022/results.md` §10
- 0.2.3：`docs/references/research-023/results.md` §5（从冻结提交 `60ac764` 运行 `tools/research_023/campaign.py check / run / analyze / tables`）

## Y 术语表 {depth=2}
```glossary
聚合器 | aggregator | 在多个 DEX 的池子之间，为一笔兑换找最好的执行方案的服务。 | 不是单个 DEX
教学图 | teaching graph | 本文的例子：4 个代币、7 个 30 bps 的 CPMM 池子。
CL | 集中流动性 | 流动性按 tick 区间分布的 AMM，如 Agni、FusionX、Uniswap v3。 | 不是订单簿
tick | 价格刻度 | CL 池里离散的价格点。跨越已初始化的 tick 时，可用流动性改变。
LB | Liquidity Book | Merchant Moe v2.2 的池子结构：价格分成 bin，费率随波动变化。
bin | 价格桶 | LB 池里的一个固定价格区间。
价格冲击 | price impact | 输入越大，平均成交价越差。
物理池 | physical pool | 一份链上池状态。同一计划多次使用它时，后一次看到前一次的结果。
RoutePlan | 路由计划 | 有序的 swap 步骤；每步写明输入资金、金额和输出资金。
ALL_REMAINING | 余数哨兵 | 让一步拿走某资金的全部剩余余额，吸收整数取整的余数。
evaluator | 独立评估器 | 从原始快照重放计划，检查资金守恒、顺序、无环和输出。 | 不信任求解器自报的数字
代币环 | token cycle | 计划的代币图里出现 x→…→x。v1 判为 invalid_plan。
incremental_graph | 逐块共享池贪心 | 把输入切成块，逐块选边际最大的路径，最后合并同池步骤。
chunk | 块 | incremental_graph 系把输入切成 K 份中的一份。
边际输出 | marginal | 在已分配的聚合输入 x 上再加 d 的增量 f(x+d) − f(x)。
label | 标签 | 分层搜索中到达某代币的部分路径，以及它带的金额。
签名 | history signature | （层数, 代币, 已访问代币集合）。签名相同的 label 才互相比较。
检查点 | checkpoint | 贪心提交一个块之前保存的完整搜索状态。
证书 | certificate | [下界, 上界] 区间；上界在声明的域内被证明。 | 不是对全网的最优证明
对偶价格 | dual price | cfmm_dual 给每个代币的价格 ν。
held-out | 报告集 | 302 个不参与调参的用例。
best known | 已知最优 | 同一次运行中所有算法对同一用例的最好结果。 | 不是数学最优
短缺 | shortfall | (best known − 本算法输出) / best known × 10⁴，单位 bps。
bps | 基点 | 万分之一。
后处理 | post-processor | 先运行一个声明的基础算法，再在它算完的计划上做局部优化。从不比基础差。 | 不是独立的搜索
固定资金拓扑 | fixed funding topology | 池子、方向、步骤顺序和资金连线都不变，只改拆分份额。split_polish 的搜索域。
Brent 法 | Brent's method | 结合黄金分割和抛物线插值的一维局部最小化方法。 | 不保证全局最优
post-plan 状态 | post-plan state | 当前计划执行完之后各池子的状态。marginal_activation 在它上面找新分支。
匹配对照 | matched control | 从同一个 E1 结果出发、花同样的报价数（work_matched）或调用次数（call_matched）、但只做精修的对照组。 | 不是可选的路由器
H/E/L | 更高 / 相等 / 更低 | 成对比较时，第一个计划更高、相等、更低的用例数。
keep_experimental | 处置词 | 门禁全过，证据照实报告；算法仍是 opt-in，默认不变。 | 不是采纳
```

## Z 参考资料 {depth=2}
1. `docs/DESIGN.md` — 本项目的规格。为什么读：所有约束和非目标的出处。**PRIMARY**
2. `docs/references/routing-algorithms.md` — 19 个算法（含 0.2.3 的两个后处理器，§§23–24）的原理、伪代码和可执行例子。为什么读：本文例子的完整推导。**PRIMARY**
3. [An Efficient Algorithm for Optimal Routing Through CFMMs](https://arxiv.org/html/2302.04938) — Diamandis、Resnick、Chitra、Angeris，FC 2023。为什么读：路由的凸优化表述和对偶分解，§1–§2、§6。**PRIMARY**
4. `docs/references/v1-acceptance.md` — 0.1.0 六算法验收。为什么读：基础算法的成对结果和配置标定。**PRIMARY**
5. `docs/references/metis-challenge-results.md` — `metis_inspired` 的预注册结果。为什么读：4 跳增益的统计检验。**PRIMARY**
6. `docs/references/research-021/results.md` — 5 个独立方法的 campaign。为什么读：history、repair、防环、证书、对偶的处置。**PRIMARY**
7. `docs/references/research-022/results.md` — 上界剪枝的精确性和工作量。**PRIMARY**
8. `docs/references/latency-optimization-results.md` — L08 速度实验。为什么读：SOR 配方的质量损失和报价比例。
9. `docs/external/jupiter-kyberswap-research.md` — KyberSwap / Jupiter 的链上执行与状态管理调研。为什么读：面板 U 的源码证据。
10. `docs/external/0.3.0-onchain-dry-run-design-draft.md` — 链上 dry run 设计草案（待审阅）。为什么读：面板 V 的出处。
11. [Uniswap smart-order-router @04c7c0b4](https://github.com/Uniswap/smart-order-router) — SOR 源码。为什么读：`uni_sor_port` 的移植来源。
12. `docs/references/research-023/contract.md` — 合同 `R023-C/1`。为什么读：E1 / E2 的规范定义、nominee、问题、组、对照和门禁。**PRIMARY**
13. `docs/references/research-023/results.md` — 0.2.3 campaign 的结果。为什么读：面板 S2 的全部数字和审计。**PRIMARY**
14. `docs/references/research-023/sources.md` — Jupiter 公告和论文的引文、日期与哈希。为什么读：[F11](#F11) 的出处。
15. [Jupiter Ultra V3](https://developers.jup.ag/blog/ultra-v3)（2025-10-15）与 [Metis v7](https://developers.jup.ag/blog/metis-v7)（2025-11-17）— Brent 拆单的公告。为什么读：E1 的动机。
16. [Quantifying Sub-Optimality in Routing for AMMs](https://arxiv.org/abs/2607.20762) — Xi、Moallemi，2026。为什么读：拆错与池子激活不足各占多少短缺。**PRIMARY**
17. [PRIME: Efficient Algorithm for Token Graph Routing Problem](https://arxiv.org/abs/2603.08337) — PRIME-Flow 是 E2 最接近的公开方法。

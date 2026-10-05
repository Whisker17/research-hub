---
template: research
title: PropAMM 论文导读：Active Liquidity On Chain（arXiv 2609.38056）
subtitle: 成交后 2 秒，propAMM 赚 0.37–1.69 bps，AMM 亏 0.22–2.06 bps。优势有四个来源，其中 spoofing 的成本由用户承担。
cols: 4
type: 论文导读 · 研究页
audience: Mantle 现货交易层开发与产品（Fluxion RFQ、PropAMM、JIT Router、排序器）
scope: 论文正文与附录 A–G；Base 链上抽查 2 个区块；对 Mantle Router 与 propAMM 的设计启示
evidence: 论文 v1 · 0x / Jump / Helius / Fuller 报告 · Base RPC 实测（2026-10-04）
date: 2026-10-04 · v1
---
这篇论文不是 SoK。它是第一份覆盖 3 条链、1 年数据的 [[propAMM]] 实测，并完整逆向了 Base 上 Tessera 的合约逻辑。核心结论：propAMM 的 [[markout]] 为正，AMM 为负（[F1](#F1)）。优势来自低成本改价、按对手定价、赢下跨场所套利和 [[spoofing]] 四个机制（[F2](#F2)–[F6](#F6)）。对 Mantle 最重要的是 [F6](#F6) 和 [对 Mantle 的意义](#panel-P)。

## A 论文回答的问题 {sheet meta="3 + 1"}
```tree list
`Q1` propAMM 比 AMM 赚钱吗？ | §6 markout
`Q2` 优势从哪里来？ | §7 四个来源
`Q3` 散户吃亏了吗？ | §8 安静成交
`+` Tessera 怎么定价？ | §2.2 + 附录 C、D
```

## B 关键数字 {sheet span=2 meta="bps · 成交后 2 s"}
| 指标 | Solana | Base | Monad |
|---|---|---|---|
| propAMM markout | ok +0.37 | ok +1.19 | ok +1.69 |
| AMM markout | no −0.22 | no −0.62 | no −2.06 |
| 散户在 propAMM 付 | 0.26 | 1.26 | 1.62 |
| 散户在 AMM 付 | 2.59 | 1.38 | 8.60 |

## C 优势由谁付 {sheet meta="§7"}
| 来源 | 成本承担方 |
|---|---|
| 低成本改价 | ok 套利者少赚 |
| 按对手定价 | warn 非聚合器流量 |
| 赢跨场所套利 | warn 旧价 AMM 的 LP |
| spoofing | no 按报价路由的用户 |

## D Tessera 的成交公式 {sheet span=2 meta="附录 C"}
```annot
# 一笔 swap 的输出 | 罚金在走完梯子之后扣
[Y_exec]{用户拿到} = [Y_book(x)]{沿两条价格梯子走完} × (1 − [ϕ]{!6 项罚金之和，单位 ppm})
> ϕ = base + age + priority + mode + default + address。按成交量加权，名义成本 0.44 bps，含罚金 1.95 bps。
```

## E 演进 {sheet span=2 meta="2024–2026"}
```timeline
2024-11 | SolFi | Solana propAMM 起量
2025-07 | Base Flashblocks | 200 ms 子区块
2025-10 | Base 首个 propAMM | Tessera
2026-03 | 0x 报告 | 块末诱饵报价
2026-05 | 以太坊 propAMM | builder 协同
*2026-09 | 本论文 | 3 链 1 年
```

## F 结论 {sheet span=4}
```callout ok 对 Mantle：三条硬约束
1. JIT Router 必须在交易内询价并以实际输出选路。论文 §9 给出的就是这个建议。
2. 优先通道只放价格更新，不放费率更新。Tessera 的 spoofing 只靠块首、块末两笔默认费更新。
3. KPI 用 markout 和报价—成交一致率，不只用报价价差。Tessera 只有 39% 的交易按报价成交。

先读 [F6](#F6)，再读 [对 Mantle 的意义](#panel-P)。
```

## G 如何阅读 {depth=1}
```callout info 默认你已知道（本文不解释）
- Uniswap v2/v3 的储备定价、手续费、LP 概念
- EVM 交易、gas、`tx.origin` 与 `msg.sender` 的区别
- CEX 订单簿：买一、卖一、挂单量
- L2 由排序器（sequencer）决定区块内交易顺序
- 1 bp = 0.01%，1 ppm = 0.0001% = 0.01 bp
```
按角色选读：

| 角色 | 先读 | 再读 |
|---|---|---|
| lead / 产品 | 总览、[F1](#F1)、[F7](#F7) | [对 Mantle 的意义](#panel-P) |
| Router 开发 | [B-4](#B-4)、[F6](#F6) | [对 Mantle 的意义](#panel-P) · JIT Router |
| propAMM 合约 / 做市 | [工作原理](#panel-L)、[F4](#F4) | [Tessera 逆向细节](#panel-N) |
| 排序器 / 链基础设施 | [B-3](#B-3)、[F2](#F2) | [对 Mantle 的意义](#panel-P) · S1–S5 |

## H 背景动机 {depth=2}
**问题**：被动 AMM 的报价只在有人交易时才动。外部价格一变，套利者先吃掉旧报价，LP 承担 [[LVR]]。论文测得 AMM 成交后 2 秒亏 0.22–2.06 bps（[F1](#F1)）。

**为什么现在**：propAMM 已是主流成交场所。到 2026 年，它在 Solana SOL/USDC 上的成交超过一半。Base 和 Monad 上的份额仍在上升。Mantle 正在设计自己的 RFQ / propAMM 与 Router，需要知道这些场所靠什么赚钱、谁在付钱。

**论文定位**：
- 不是 SoK。它的贡献是一手数据：3 条链、2025-09-01 至 2026-08-31 的成交、更新和 Bybit 订单簿。
- 它逆向了闭源合约：Tessera 完整还原，Metric 和 Elfomo 部分还原。
- 它把行业传闻（按对手定价、spoofing）变成可检验的数字。

**范围**：Solana SOL/USDC、Base ETH/USDC、Monad MON/USDC。**非目标**：以太坊主网 propAMM（作者认为依赖 builder 排序，更像 [[RFQ]]）、链上订单簿（如 Kuru）、长尾资产。

**谱系：每一代设计改了什么**

| 设计 | 改了什么 | 留下的问题 | 出处 |
|---|---|---|---|
| Uniswap v2/v3 | 按储备定价，LP 被动 | LVR | [3] |
| Diamond、am-AMM、批量成交 | 拍卖套利权或管理权，统一出清价 | LP 仍被动 | [1] §3 |
| Solana propAMM（2024–25） | 运营方用小交易改价，链上维护订单簿 | 不透明，按对手定价 | [6] [5] |
| Base propAMM（2025-10 起） | 借 [[Flashblocks]] 在 EVM 上高频改价 | 块末诱饵报价 | [4] [1] |
| 以太坊 builder 协同（2026-05） | builder 保证更新紧贴在成交前 | 依赖 builder，像 RFQ | [7] [8] |
| 链上 propAMM Router（Lambda Class） | 统一 `quote` / `swap` 接口，交易内比价 | 只占以太坊 propAMM 量的 7.1% | [7] |
| Mantle Fluxion（计划） | RFQ 签名报价 + 撤单优先 + 预确认 | 本页讨论 | [12] |

**约束**：论文的 markout 是 gross，未扣 gas、对冲和库存成本。Base 的时间戳只能近似（见 [方法](#panel-O)）。

## I 前置知识 {depth=2}
```excalidraw q="读懂这篇论文需要哪些概念？按什么顺序学？" read="灰色虚线框是默认已知；蓝色框是卡片，编号与下方卡片一致；箭头表示先学 → 后学。" takeaway="B-0 到 B-4 是必读。B-3 和 B-4 解释了 spoofing 为什么可能。" name=prereq-map kind=前置知识地图
{"grid": {"w": 300, "h": 125}, "defaults": {"w": 190, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "amm", "label": "AMM 基础（已知）", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "evm", "label": "EVM 与排序器（已知）", "col": 1, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "cex", "label": "CEX 订单簿（已知）", "col": 2, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 LVR", "col": 0, "row": 1, "color": "blue"},
   {"id": "b3", "label": "B-3 区块内排序", "col": 1, "row": 1, "color": "blue"},
   {"id": "b5", "label": "B-5 microprice", "col": 2, "row": 1, "color": "blue"},
   {"id": "b6", "label": "B-6 原子套利", "col": 0, "row": 2, "color": "blue"},
   {"id": "b2", "label": "B-2 propAMM", "col": 1, "row": 2, "color": "blue"},
   {"id": "b4", "label": "B-4 快照路由", "col": 2, "row": 2, "color": "blue"},
   {"id": "b1", "label": "B-1 markout", "col": 3, "row": 2, "color": "blue"},
   {"id": "paper", "label": "论文四个发现", "col": 1, "row": 3, "dx": 145, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "amm", "to": "b0"}, {"from": "evm", "to": "b3"}, {"from": "cex", "to": "b5"},
   {"from": "b0", "to": "b6"}, {"from": "b0", "to": "b2", "label": "动机"},
   {"from": "b3", "to": "b2", "label": "改价排前"}, {"from": "b3", "to": "b4", "label": "块末快照"},
   {"from": "b5", "to": "b1", "label": "参考价"},
   {"from": "b6", "to": "paper"}, {"from": "b2", "to": "paper"}, {"from": "b4", "to": "paper"}, {"from": "b1", "to": "paper"}
 ]}
```

**贯穿全文的例子**：Base 上 Tessera 的 WETH/USDC 池（代理合约 `0xf524…5a7c`）。我们用两个真实区块：
- 区块 50,369,777：做市商把锚定价从 2,457.460 改到 2,457.788，随后有人卖出 1.0177 WETH（论文图 1）。
- 区块 50,196,022：默认费在第 19 笔上调、第 468 笔复位（论文图 11）。

```prereq B-0 l1 4min
# 逆向选择与 LVR（loss-versus-rebalancing）
是什么: 外部价格变了而报价没变，套利者先吃掉旧报价。LP 因报价过期而亏的部分叫 LVR。
为什么需要: propAMM 的设计目标就是消除 LVR：不等交易，直接改价。
例子:
~~~
Bybit：2,457.46 → 2,457.79
AMM 仍按 2,457.46 卖
套利者每 ETH 赚 0.33 USDC
≈ 1.3 bps，由 LP 承担
~~~
误解: 误解：LVR 就是无常损失。事实：LVR 只计算报价过期被套利的部分，不和"持币不动"比较。
深入: [3] Milionis et al. 2022，第 1–3 节
```

```prereq B-1 l1 4min
# markout（成交后盈亏）
是什么: 成交后 τ 秒，用参考价重估这笔成交，得到做市方的盈亏。正数表示做市方赚。
为什么需要: 论文的所有结论都用 markout 表达。Mantle 可以直接把它用作做市商 KPI。
例子:
~~~
做市方卖 1 ETH @ 2,457.50
2 秒后 microprice 2,457.25
markout = 0.25 / 2457.25
       ≈ +1.0 bps
~~~
误解: 误解：markout 为正就是净利润。事实：论文报告的是 gross 值，没有扣 gas、对冲和库存成本。
深入: [1] 论文第 6 节
依赖: B-5
```

```prereq B-2 l1 6min
# propAMM（proprietary AMM）
是什么: 链下定价引擎加链上合约。引擎持续计算公允价，用很小的交易写进合约。合约用运营方的库存按这个价格成交。
为什么需要: Tessera、Metric、Elfomo 都是这个结构。Mantle 的 Fluxion 要做同样的设计选择。
例子: Tessera 一次价格更新只写 25 字节：序号、参考区块、锚定价、价差。实测消耗 26,702 gas，详见"Tessera 逆向细节"面板。
误解: 误解：propAMM 就是 RFQ。事实：RFQ 每笔报价单独签名给一个 taker；propAMM 的报价是链上状态，任何人都能直接调用成交。
深入: [5] Jump 2026，"The Oracle Update"一节
依赖: B-0, B-3
```

```prereq B-3 l1 5min
# 区块内排序与 Flashblocks
是什么: 排序器决定区块内的交易顺序。Base 按单位 gas 优先费排序，并每 200 ms 发出一个子区块（Flashblock）。
为什么需要: 改价必须排在 taker 前面才有效。spoofing 也利用块首与块末的时间差。
例子: Base 区块 2 秒，最多 10 个 Flashblock。论文测得 propAMM 成交量集中在 FB1 和 FB10，合计 45.71%。
误解: 误解：出价最高就排第一。事实：Flashblock 广播后顺序锁定，后到的高费交易只能进下一个 Flashblock。
深入: [10] Base Flashblocks 文档
```

```prereq B-4 l1 5min
# 聚合器按快照路由
是什么: 聚合器在链下读取某一时刻的链上状态，模拟各场所的输出，再把路由写进用户交易。
为什么需要: 快照时刻和成交时刻之间，状态可以被改。论文的 spoofing 和 Router 建议都围绕这个缺口。
例子: 聚合器读区块 N 末尾的 Tessera 状态（默认费 0）。用户交易落在区块 N+1 中段，此时默认费已是 538 ppm。
误解: 误解：滑点保护能挡住 spoofing。事实：差额小于滑点容忍度时，交易照样成交，用户只是拿得更少。
深入: [4] 0x 2026，Pattern 1
依赖: B-3
```

```prereq B-5 3min
# microprice（加权中间价）
是什么: 按对侧挂单量加权的中间价：(bid·q_ask + ask·q_bid) / (q_bid + q_ask)。
为什么需要: 论文用 Bybit 的 microprice 作为公允价，计算全部 markout。
深入: [11] Databento，Microprice 示例
```

```prereq B-6 3min
# 原子套利（atomic arbitrage）
是什么: 在一笔交易内，在两个场所反向买卖。结束时每种代币的余额变化都 ≥ 0，至少一种 > 0。
为什么需要: 论文用它把成交分成"单笔成交"和"跨场所套利"，并发现 propAMM 是赢的一边。
深入: [1] 附录 B
依赖: B-0
```

## K 论文逐节导读 {depth=2}
| 节 | 回答什么 | 方法 | 关键结果 | Mantle 怎么用 |
|---|---|---|---|---|
| §2.2 | propAMM 怎么运作 | 以 Tessera 为例 | 锚定价 + 价差 + 档位倍数 | propAMM 合约蓝本 |
| §4、附录 A | 数据从哪来 | Old Faithful、日志解码、Bybit L2 | Solana 4.49 亿笔 propAMM 成交 | 可复用的数据管线 |
| §5 | 市场格局 | 日成交与份额 | Base 份额 2.4% → 10.9% | 新链也能起量 |
| §6 | 有没有优势 | markout 曲线 | prop 为正，AMM 为负 | KPI 定义 |
| §7.1 | 改价成本 | gas / CU、优先费 | 改价比 swap 便宜 5–15 倍 | 优先通道设计 |
| §7.2 | 是否按对手定价 | 往返价差、地址分类 | 非聚合器多付 0.10–3.59 bps | Router 身份问题 |
| §7.3 | 跨场所套利谁亏 | 余额差启发式 | 未改价的一方亏 | Mantle AMM 的 LP |
| §7.4 | 报价是否等于成交 | 两个状态重放 | 39% 一致，平均差 1.08 bps | 费率延迟生效 |
| §8 | 散户是否吃亏 | 安静成交 | propAMM 更便宜 | 对外卖点 |
| §9 | 建议 | — | 交易内询价的链上 Router | JIT Router |
| 附录 C | Tessera 细节 | 公式、地址分类、报价与成交 | 默认费贡献 56.2% 罚金收入 | 罚金透明化 |
| 附录 D | 三家实现对比 | 合约解码 | Tessera 先走梯子再扣罚金 | 设计取舍 |

## L 工作原理 {depth=2}
先看直觉：Fig 2 用同一布局对比 AMM 和 propAMM。差别只在第二个框：AMM 等交易，propAMM 先改价。

```excalidraw q="参考价跳动时，AMM 和 propAMM 分别发生什么？" read="上行是 AMM，下行是 propAMM；红色是亏损，绿色是收益。" takeaway="AMM 被套利者按旧价成交；propAMM 先改价，再按新价成交。" kind=直觉
{"grid": {"w": 330, "h": 130}, "defaults": {"w": 190, "h": 64, "fontSize": 17},
 "nodes": [
   {"id": "r0", "label": "Bybit 价格上涨", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "a1", "label": "AMM 报价不动", "col": 1, "row": 0, "color": "red"},
   {"id": "a2", "label": "套利者买入", "col": 2, "row": 0},
   {"id": "a3", "label": "LP 亏 LVR", "col": 3, "row": 0, "color": "red"},
   {"id": "r1", "label": "Bybit 价格上涨", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "p1", "label": "propAMM 改价", "col": 1, "row": 1, "color": "blue", "strokeWidth": 3},
   {"id": "p2", "label": "taker 成交", "col": 2, "row": 1},
   {"id": "p3", "label": "markout > 0", "col": 3, "row": 1, "color": "green"}
 ],
 "edges": [
   {"from": "r0", "to": "a1", "label": "不交易"}, {"from": "a1", "to": "a2", "label": "旧价"}, {"from": "a2", "to": "a3"},
   {"from": "r1", "to": "p1", "label": "更新 p,s"}, {"from": "p1", "to": "p2", "label": "新价"}, {"from": "p2", "to": "p3"}
 ]}
```

Fig 3 是 Tessera 的状态。它只存一个锚定价 p 和一个价差 s。每一档用固定倍数相对 p 和 s 定位。所以改一次 p、s，所有档位一起移动。两个累计成交量记录双向流量，按当前 p 相互抵消。

```excalidraw q="Tessera 存了哪些状态？一笔 swap 怎么用它们算出输出？" read="紫色是链上状态；黄色是罚金判断；边上写 gas 的是论文测得的中位数。" takeaway="改价只写 p 和 s（约 2.7 万 gas），罚金在走完梯子之后统一扣。" kind=概念图
{"grid": {"w": 300, "h": 120}, "defaults": {"w": 180, "h": 62, "fontSize": 17},
 "nodes": [
   {"id": "up", "label": "价格更新", "col": 0, "row": 0},
   {"id": "ub", "label": "订单簿更新", "col": 1, "row": 0},
   {"id": "hs", "label": "历史 swap", "col": 2, "row": 0},
   {"id": "ps", "label": "锚定价 p\n价差 s", "col": 0, "row": 1, "color": "violet"},
   {"id": "lad", "label": "两条梯子\n档位倍数", "col": 1, "row": 1, "color": "violet"},
   {"id": "acc", "label": "两个累计量", "col": 2, "row": 1, "color": "violet"},
   {"id": "av", "label": "可用档位", "col": 1, "row": 2, "color": "blue"},
   {"id": "x", "label": "新 swap 输入 x", "col": 0, "row": 3},
   {"id": "walk", "label": "走梯子", "col": 1, "row": 3, "color": "blue"},
   {"id": "pen", "label": "× (1 − ϕ)", "col": 2, "row": 3, "color": "yellow"},
   {"id": "out", "label": "Y_exec", "col": 3, "row": 3, "color": "green"}
 ],
 "edges": [
   {"from": "up", "to": "ps", "label": "26.7k gas"}, {"from": "ub", "to": "lad", "label": "152k gas"}, {"from": "hs", "to": "acc", "label": "累加"},
   {"from": "ps", "to": "av"}, {"from": "lad", "to": "av"}, {"from": "acc", "to": "av", "label": "按 p 净额"},
   {"from": "x", "to": "walk"}, {"from": "av", "to": "walk"}, {"from": "walk", "to": "pen", "label": "Y_book"}, {"from": "pen", "to": "out"}
 ]}
```

Fig 4 是区块 50,369,777 里真实发生的顺序。注意第 4 步：默认费在第 131 笔复位，第 136 笔的 swap 因此落在低费窗口里。

```uml q="一个区块内，Tessera 的更新和 swap 按什么顺序发生？" read="数据来自 Base 区块 50,369,777（共 149 笔交易），idx 是交易序号。罚金逐项检查的细节见 Fig 5。" takeaway="一个区块内有多次改价；swap 前后都可能有更新。"
sequenceDiagram
  autonumber
  participant F as 默认费 EOA
  participant U as 改价 EOA（多个）
  participant P as Tessera 池 0xf524
  participant T as Taker（经路由合约）
  participant H as 指纹合约 0xfdb7
  F->>P: idx 9 默认费上调
  U->>P: idx 68 seq 0x58，p=2457.460，s=1 ppm
  U->>P: idx 119 seq 0x59，p=2457.788，s=45 ppm
  F->>P: idx 131 默认费复位
  rect rgb(234, 241, 251)
    T->>P: idx 136 卖出 1.0177 WETH
    P->>H: 检查 tx.origin 与调用合约
    H-->>P: 是否命中地址罚金
    P->>P: 走梯子得 Y_book，再乘 (1 − ϕ)
    P-->>T: USDC
  end
  U->>P: idx 137 seq 0x5a，p=2457.468，s=6 ppm
```

Fig 5 把 6 项罚金的判断画成流程。论文没有给出合约内的检查顺序，图中顺序是示意。

```uml q="一笔 swap 的罚金 ϕ 由哪些判断组成？" read="简化：论文没有给出检查顺序。200 / 500 ppm 是论文观测到的优先费罚金峰值。" takeaway="地址、报价新鲜度、优先费和默认费各自独立计分，最后相加。"
flowchart LR
  s0(["swap 请求"]) --> bl{"黑名单？"}
  bl -- "是" --> rv["revert"]
  bl -- "否" --> ag{"报价过期？"}
  ag -- "是" --> rv
  ag -- "否" --> c1["age：宽限期后逐块增加"]
  ag -- "否" --> c2["address：加罚标签或指纹命中"]
  ag -- "否" --> c3["default：白名单为 0<br/>否则为当前默认费"]
  ag -- "否" --> c4["priority：优先费高时 200 或 500"]
  ag -- "否" --> c5["base、mode：论文未细述"]
  c1 --> sm["ϕ = 6 项之和（ppm）"]
  c2 --> sm
  c3 --> sm
  c4 --> sm
  c5 --> sm
  sm --> yo["Y_exec = Y_book × (1 − ϕ)"]
```

Fig 6 是 spoofing 的时序。聚合器读取块末状态，那时费率低。用户在块首之后成交，那时费率已上调。

```uml q="spoofing 怎么让用户拿到比报价差的价格？" read="示意。数字取自区块 50,196,022 的两次默认费更新（论文附录 C.3）。" takeaway="费率在块首上调、块末复位。聚合器只看到复位后的状态。"
sequenceDiagram
  autonumber
  participant A as 聚合器
  participant W as 用户钱包
  participant S as Base 排序器
  participant M as Tessera 运营方
  participant P as Tessera 池
  Note over A,P: 上一区块末尾：默认费 0，含费价差约 2.9 bps
  A->>P: eth_call 读快照
  A-->>W: 路由到 Tessera，报价 Q
  W->>S: 提交 swap（带滑点容忍）
  rect rgb(251, 234, 234)
    M->>S: idx 19：默认费 0 → 538 ppm
    S->>P: 含费价差 2.78 → 13.54 bps
  end
  S->>P: 执行用户 swap
  P-->>W: 成交 F < Q（差额被滑点容忍吸收）
  M->>S: idx 468：默认费复位为 0
  Note over P: 含费价差 13.70 → 2.94 bps，下一个快照又变好看
```

**Tessera vs Metric vs Elfomo**（附录 D）：

| 维度 | Tessera | Elfomo | Metric |
|---|---|---|---|
| 流动性结构 | 两条梯子 + 累计量净额 | 梯子，按金库余额重建容量 | 价格区间 bin，类似 v3 |
| 参考价 | 运营方写入 | 运营方 + WooFi Wooracle | 运营方 bid/ask + Chainlink 带宽 |
| 罚金位置 | 走完梯子后扣 | 走梯子时计入价格 | 走梯子时计入价格 |
| 同块重复成交 | 按金额净额 | 按同向成交笔数加罚 | bin 状态持续 |

## M 发现 {depth=2}
```finding F1 high
# propAMM 成交后为正 markout，AMM 为负
结论: 成交后 2 秒，propAMM 在 Solana、Base、Monad 分别赚 0.37、1.19、1.69 bps。AMM 分别亏 0.22、0.62、2.06 bps。曲线形状相反：AMM 成交前在价内、成交后亏；propAMM 成交前在价外、成交后赚。
证据: [observed] 论文 §6，图 3、图 4，参考价为 Bybit microprice。[observed] AMM 亏损幅度与波动率同序：ETH 60%、SOL 66%、MON 123%。
影响: propAMM 确实避开了大部分 LVR。Mantle 的做市商 KPI 应包含 markout 曲线（−5 s 到 15 s）。
```

```finding F2 high
# 改价比 swap 便宜一个量级，做市商只在关键时刻付优先费
结论: Base 上一次改价中位约 2.7 万–3.3 万 gas，一笔 swap 约 20 万–40 万 gas，便宜 5–15 倍。Tessera 每 0.563 个区块改价一次，改价次数与 ETH 波动率的相关系数为 0.56。
证据: [observed] 论文 §7.1。[observed] 我们在 Base 上读到一次价格更新 gasUsed = 26,702，论文中位数 26,706。[observed] 21,000 gas 的交易底价占改价成本的大头。
影响: 在 EVM 链上做 propAMM，改价载荷要极小。Mantle 的优先通道可以替代"用优先费抢位置"。
```

```finding F3 high
# propAMM 按交易对手定价
结论: Solana 前 6 家 propAMM 中，5 家给非聚合器流量更宽的往返价差（68%–83% 的对比格，p < 0.001）。溢价从 0.10 bps（BisonFi、Tessera）到 3.59 bps（GoonFi）。Tessera 上白名单地址实际成本 0.78 bps，加罚地址 4.96 bps。
证据: [observed] 论文表 1 与 §7.2。[observed] Tessera 同时检查 `tx.origin` 和直接调用它的合约（附录 C.2）。
影响: Mantle 的 Router 合约地址会被做市商打标签。白名单资格会被所有经过 Router 的流量共享，包括套利者。
```

```finding F4 high
# Tessera 的利润主要来自罚金，而不是订单簿价差
结论: 按成交量加权，名义成本 0.44 bps，含罚金 1.95 bps。单笔成交（占 20.70% 成交量）在 2 秒时 markout +1.29 bps；去掉罚金约 −1 bps。默认费只出现在 22.7% 的交易上，却贡献 56.2% 的罚金收入。
证据: [observed] 论文 §7.2、§7.3、图 6、附录 C.1。[observed] 优先费罚金最常见（42.7% 的交易），恰好 2 bps 和 5 bps 两个峰几乎全由它构成。
影响: 订单簿报价不能代表实际成本。Mantle 若要求 propAMM 公开罚金分量，用户和 Router 才能比较真实价格。
```

```finding F5 medium
# 跨场所原子套利中，已改价的 propAMM 是赢的一方
结论: propAMM–DEX 套利占 propAMM 成交量的 5%（Solana）、13%（Base）、6%（Monad）。propAMM 这一腿接近持平或为正；未改价的一方亏损。Tessera 对其他 propAMM 的套利中，对手方 2 秒后约 −0.5 bps。
证据: [observed] 论文表 2、图 6(b)、图 18。[inferred] 套利前参考价已移动 1.9–7.3 bps，说明套利修正的是旧报价。
影响: Mantle 引入 propAMM 后，Agni、Merchant Moe 等 AMM 的 LP 会更多地成为亏损的一边。
```

```finding F6 high
# spoofing：只有 39% 的交易按聚合器看到的报价成交
结论: Tessera 的默认费上调集中在区块前 10%，下调集中在后 10%。交易平均比块末报价差 1.08 bps，按成交量加权差 0.56 bps。区块 50,196,022 中，默认费 0 → 538 ppm 把含费价差从 2.78 bps 拉到 13.54 bps。
证据: [observed] 论文 §7.4、图 7、图 11、表 3。[observed] 0x 独立报告：某 propAMM 的最后一次改价 97.4% 落在最后一个 Flashblock，块内价格方差是块间的 5–7 倍 [4]。[observed] 我们在两个区块中都看到默认费更新"块首一次、块末一次"，详见"Tessera 逆向细节"面板。
影响: 交易内询价的 Router 能让选路基于真实价格。费率类参数还要靠排序器或合约层约束。见"对 Mantle 的意义"面板：排序器 S1、合约规范第 4 条。
```

```finding F7 medium
# 散户在 propAMM 上付得更少
结论: 安静成交（参考价 6 秒内变动 < 1 bp）在 propAMM 上付 0.26 / 1.26 / 1.62 bps，在 AMM 上付 2.59 / 1.38 / 8.60 bps（Solana / Base / Monad）。安静成交占 propAMM 成交量 32% / 43% / 17%，占 AMM 只有 9% / 16% / 8%。
证据: [observed] 论文 §8、图 8、附录 G。[inferred] "安静成交 = 散户"是近似，论文没有身份数据。
影响: "比 AMM 便宜"可以作为 Mantle propAMM 的对外卖点，但要和 F6 的 spoofing 数据一起看。
```

```finding F8 medium
# Tessera 的改价交易是 25 字节载荷，由多个地址并发提交
结论: 价格更新不走 ABI 函数，calldata 只有 25 字节：1 字节序号、5 字节参考区块、16 字节锚定价、3 字节价差。多个 EOA 同时提交，新序号排在前面，旧序号随后 revert（约 2.4 万 gas）。
证据: [observed] Base RPC 读取区块 50,369,777 和 50,196,022，命令见"复现"面板。[inferred] 字段划分由数值反推：价格 2,457.788 与价差 45 ppm 和论文图 1 一致。[inferred] 优先费尾数随序号递增，所以同一 Flashblock 内新报价先执行。
影响: Mantle 优先通道可以丢弃同一做市商的旧更新。这样就省掉并发 revert 消耗的 gas。
```

## N Tessera 逆向细节 {depth=3}
**论文给出的逆向产物**

| 产物 | 内容 | 出处 |
|---|---|---|
| 实现合约 | `0x6d9DD143…641CB`，2026-08-12 起启用，新增独立价差参数 | §2.2 脚注 2 |
| 指纹合约 | `0xfdb7fa3f…e684`，检查地址前缀和字节码 | 附录 C.2 |
| 状态 | p、s、档位倍数、跳过档数、两个累计量 | §2.2 |
| 罚金 | base、age、priority、mode、default、address，单位 ppm | §7.2、附录 C.1 |
| 地址分类 | 普通、免默认费、加罚、黑名单 + 指纹 | 附录 C.2 |
| 反事实 | 去掉罚金的 markout；块末状态 vs 执行前状态 | §7.3、附录 C.3 |

**论文没写的部分**：反编译工具、storage 布局、宽限期与过期区块数、优先费罚金阈值、mode 分量含义。

**指纹案例**（附录 C.2）：
- 交易 `0x5dde…fc62d`：发起地址以 `c0ffee` 开头，路径 USDC → WETH → VVV → USDC，经过 Metric、Uniswap v3、Tessera。这是链上循环套利。
- 交易 `0xac4f…0c71`：现场创建 30 字节转发合约，卖出 128 WETH 换约 303,365 USDC。指纹合约识别出转发模式，收 175 ppm 地址罚金。做市方 2 秒 markout −5.29 bps。

**我们的链上抽查：价格更新载荷**

```annot
# 25 字节，无函数选择器 | 区块 50,369,777 第 119 笔
[59]{序号 seq} [00030094f0]{参考区块 50,369,776 = 当前块 − 1} [00000000000000853ca7d21fda980000]{锚定价 × 10¹⁸ = 2,457.788} [00002d]{价差 45 ppm}
> gasUsed 26,702。代理合约 0xf524…5a7c 的 EIP-1967 槽指向实现 0x6d9d…41cb。字段划分是推断。
```

**并发提交与旧序号 revert**（区块 50,196,022，共 492 笔）

| idx | seq | 优先费（wei） | 结果 |
|---|---|---|---|
| 122 | 0x63 | 500,774 | ok 成功 |
| 123 | 0x62 | 500,773 | no revert，23,902 gas |
| 124 | 0x61 | 500,772 | no revert，23,874 gas |
| 191 | 0x67 | 3,407,400 | ok 成功 |
| 222–224 | 0x66–0x64 | 500,777–500,775 | no 3 笔全部 revert |
| 316 / 317 | 0x69 / 0x68 | 3,407,402 / 3,407,401 | warn 前者成功，后者 revert |

**默认费更新**：同一个地址 `0x9dd4…6bfb` 调用函数 `0x1667d875`，每次 31,985 gas。

| 区块 | idx / 总笔数 | 动作 | 优先费 / base fee |
|---|---|---|---|
| 50,196,022 | 19 / 492 | 上调（论文：0 → 538 ppm） | 1.0× |
| 50,196,022 | 468 / 492 | 复位 | 0.15× |
| 50,369,777 | 9 / 149 | 上调 | 1.0× |
| 50,369,777 | 131 / 149 | 复位 | 0.15× |

```callout warn 和论文不一致的一点
论文说 Tessera 改价时付 2.37 倍 base fee。我们的两个区块里，改价交易只付 0.1–0.68 倍。样本只有 2 个区块，不能据此否定论文的中位数。默认费参数打包在一个 32 字节字里，我们没有解出 538 ppm 的编码。
```

**附录 C.1 的两个公式怎么来**（Φ = Σϕ / 10⁶）：
- 实际卖价 = p_a / (1 − Φ)，实际买价 = p_b · (1 − Φ)。代入半价差公式，分子分母同乘 (1 − Φ)，得到 c_eff = 10⁴ · (p_a − p_b(1−Φ)²) / (p_a + p_b(1−Φ)²)。
- 用户拿到 Y = Y_book · (1 − Φ)。所以 Y_book = Y / (1 − Φ)，第 k 项扣下 Y_book · ϕ_k / 10⁶ = Y · ϕ_k / (10⁶ − Σϕ)。

**报价与成交的归因**（附录 C.3）：每笔 swap 重放两次。第一次用上一区块末尾状态，第二次用执行前一刻状态。差异按顺序归因：

| 原因 | 结果 |
|---|---|
| 运营方改了价格、订单簿或价差 | 61% 成交量反而更好 |
| 同一区块前面有别的 swap | 59% 成交量与报价一致 |
| 默认费不同 | 94% 成交量更差 |
| 其余费用或定价差异 | 99% 成交量更差 |

## O 方法与证据 {depth=3}
| 项 | 做法 | 风险 |
|---|---|---|
| 时间范围 | 2025-09-01 至 2026-08-31；Monad 从主网上线起 | Base、Monad 的 propAMM 晚于起点上线 |
| Solana 数据 | Old Faithful CAR 存档，epoch 826–1026，13 个场所 | 更新数是估计：非 swap 调用都算更新 |
| Base / Monad 数据 | 解码日志：Base 240 个池、1.49 亿笔；Monad 115 个池 | 解不开的场所一律算"其他" |
| 参考价 | Bybit USDT 对的 microprice ÷ USDCUSDT 中间价 | 只用一家 CEX |
| Solana 时间戳 | 用投票交易的时间分布定位 slot 边界，再线性插值 | 投票窗口约 0.22 s 宽；中间 slot 只靠插值 |
| Base 时间戳 | 交易位置在前 26% 记为 b − 1.8 s，其余记为 b | 中间 Flashblock 的时间不准 |
| 往返价差 | 同池 25 slot 内、方向相反、规模差 < 2 倍、中间无更新 | 只在 Solana 上做 |
| 原子套利 | 所有代币余额变化 ≥ 0 且至少一个 > 0 | 验证：92.9% / 99.1% 的量来自套利交易 |
| 安静成交 | 成交前 5 s 到后 1 s，参考价变动 < 1 bp | 散户的近似 |

**效度威胁**：
- markout 是 gross 值。它不等于做市商的净利润。
- Tessera 只分析了 2026-08-12 起的一个实现版本。罚金参数可以随时升级。
- 作者来自 Category Labs（Monad 的开发方）。Monad 上的结论可以单独复核。

## P 对 Mantle 的意义 {depth=2}
Mantle 的计划见 [12]，包含以下组件：
- Fluxion RFQ 与 propAMM，Bybit W2 做市库存
- 单排序器，无公开 mempool
- 做市商撤单优先通道，200 ms 预确认
- 接入 OKX / Kyber / LI.FI 聚合器

你还提到 JIT Router，以及把做市商改价放进预确认。下表把论文的每个发现映射到这些组件。

| 论文发现 | JIT Router | propAMM / RFQ | 排序器 |
|---|---|---|---|
| F2 改价便宜 | — | 紧凑载荷 | 优先通道只放价格更新 |
| F3 按对手定价 | Router 地址会被打标签 | 公开分类规则 | — |
| F4 罚金决定成本 | 用实际输出比价 | 罚金分量可查询 | — |
| F5 跨场所套利 | — | — | AMM LP 风险上升 |
| F6 spoofing | 交易内询价 | 费率延迟生效 | 费率更新不进优先通道 |
| F8 并发提交 | — | 序号作废 | 丢弃旧更新 |

```uml q="Mantle 的 JIT Router 在一笔交易内应该怎么选路？" read="这是提案，不是现有实现。PA、PB 是两个 propAMM；RFQ 报价由调用方放进 calldata。" takeaway="选路、断言和执行都在同一笔交易里完成，聚合器快照不再决定价格。"
sequenceDiagram
  autonumber
  participant U as 用户 / 聚合器
  participant R as JIT Router
  participant PA as propAMM A
  participant PB as propAMM B
  participant Q as Fluxion RFQ 结算
  Note over PA,PB: 做市商已经通过优先通道写入 p、s、序号
  U->>R: swap(tokenIn, amountIn, minOut, rfqQuote)
  R->>PA: quote(amountIn)
  R->>PB: quote(amountIn)
  R->>Q: 校验 RFQ 签名与有效期
  R->>R: 选最大输出
  R->>PA: swap(amountIn, quoteOut)
  PA-->>R: amountOut
  R->>R: 断言 amountOut ≥ quoteOut，否则换下一个场所
  R-->>U: tokenOut，事件记录报价与成交
```

**JIT Router**
1. 在交易内调用每个场所的 `quote()`，再按实际输出选路。论文 §9 和 Jump [5] 都给出这个建议。以太坊上的 Lambda Class Router 已用 `IPropAMM` 接口实现 [7]。
2. 要求 `quote()` 和 `swap()` 使用同一套罚金逻辑。在 Router 里断言成交不低于报价，否则回退到下一个场所。
3. 预先和做市商约定 Router 的身份规则。不要让 Router 整体进白名单；做市商仍会按 `tx.origin` 分类（[F3](#F3)）。
4. 给 Fluxion RFQ 留入口：调用方把 EIP-712 签名报价放进 calldata，Router 在同一交易内和 propAMM 报价比较。
5. 上线前测量 `quote()` 的 gas。论文只测了 swap（Base 上 20 万–40 万 gas），没有测询价。候选场所数要设上限。
6. 用事件记录每笔的报价与成交。用它计算报价—成交一致率，对标 Tessera 的 39%。

**propAMM 合约规范（Mantle 对做市商的要求）**
1. 用"锚定价 + 价差 + 档位倍数"的状态，改价只写一个存储字。
2. 记录参考区块，设宽限期和过期。即使有优先通道也保留它，用来应对排序器故障。
3. 通过 `quote()` 返回罚金分量，并在事件里公开。论文作者必须逆向才能拿到这些数据。
4. 默认费等费率参数的变更延迟到下一区块生效。这样聚合器读到的块末状态就是下一块的真实费率。
5. 如果 Mantle 的排序不按优先费拍卖，就没有理由收优先费罚金。需要先确认排序规则。
6. RFQ 报价有效期 5–15 秒（见 [12]），比 Tessera 的报价寿命长得多。考虑改为按区块计的有效期，并按报价年龄加价。

**排序器与预确认**
1. **S1** 优先通道只放行价格类更新：p、s、序号作废。费率、白名单、黑名单更新走普通通道。
2. **S2** 同一做市商的旧更新直接丢弃，不上链。Titan 在以太坊上就是这样做的 [8]。
3. **S3** 私有 mempool 对做市商也必须私有。做市商不能看到待处理的 taker 交易。
4. **S4** 子区块预确认会重现 0x 记录的"块末诱饵"问题。Router 交易内询价可以缓解，费率延迟生效可以消除。
5. **S5** 评估 Agni、Merchant Moe 等 AMM 的 LP 风险。可以考虑动态费或预言机保护。

```callout warn CAUTION：不要把费率更新放进优先通道
Tessera 的 spoofing 只需要两笔默认费更新：块首上调，块末复位。优先通道会保证这两笔每次都准时落地，把 spoofing 变成稳定行为。
```

```callout err WARNING：优先通道 + 可见的 taker 流 = last look
如果做市商能看到排序器里的 taker 交易，再用优先通道撤单或改价，就构成 [[last look]]。用户按报价下单却拿到更差的成交，且链上无法证明。Bybit W2 是关联方，这条规则必须公开并可审计。
```

**监控与 KPI**
- 复用论文方法建仪表盘：markout 曲线、安静 / 非安静拆分、聚合器与非聚合器的往返价差、报价—成交一致率。
- README 里的 KPI "价差 ≤ 3–5 bps" 是报价价差。建议增加"含罚金的实际成本"和"报价—成交一致率"。

## Q 局限与开放问题 {depth=2}
**论文没有证明什么**
- 没有证明 propAMM 净盈利。markout 不含 gas、对冲和库存成本。
- 没有证明 spoofing 是有意的。块首加费也可以解释为防御：区块开头最容易遇到抢跑。
- 没有覆盖 RFQ。Mantle 的 Fluxion 是 RFQ + propAMM 混合，结论要部分迁移。
- 散户结论依赖"安静成交"这个近似。

**我们这次的局限**
- 链上抽查只有 2 个区块。优先费倍数与论文不一致（见 [Tessera 逆向细节](#panel-N)）。
- Mantle 的事实来自仓库文档 [12] 和你的描述，没有链上核实。

**留给 Mantle 团队的问题**
1. Mantle 排序器按优先费排序还是先到先得？子区块预确认的粒度是多少？
2. 优先通道是否会让做市商看到 taker 流？谁能审计？
3. Router 的身份规则谁来定？做市商能否单独拉黑 Router？
4. Fluxion RFQ 和 propAMM 是否共用一个 Router 和一套执行质量指标？

## R 复现 {depth=3}
需要 Foundry 的 `cast` 和 Python 3。所有命令只读，使用 Base 公共 RPC。

```bash
R=https://mainnet.base.org
# 1. 代理合约指向的实现
cast storage 0xf524c1bc1c64a2c99bc7eccf19ede9a1d89d5a7c \
  0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc --rpc-url $R
# 预期：0x0000000000000000000000006d9dd143e42b6338f4f6a7c0c26d124658f641cb

# 2. 区块 50,369,777 第 119 笔的载荷与 gas
TX=0xddd0d399d1b606bccf40fa570294cbe6e55f296b5cc40953091a46cb1d6fff70
cast tx $TX input --rpc-url $R        # 预期：0x5900030094f000000000000000853ca7d21fda98000000002d
cast receipt $TX gasUsed --rpc-url $R # 预期：26702

# 3. 解码
python3 - <<'PY'
b = bytes.fromhex("5900030094f000000000000000853ca7d21fda98000000002d")
seq, ref = b[0], int.from_bytes(b[1:6], "big")
price = int.from_bytes(b[6:22], "big") / 1e18
spread_ppm = int.from_bytes(b[22:25], "big")
print(hex(seq), ref, price, spread_ppm)
PY
# 预期：0x59 50369776 2457.78765480101 45
```

**在 Mantle 上算 markout（步骤）**
1. 解码目标池的 swap 事件，记录区块、交易位置、方向、数量。
2. 给每笔成交定时间戳。有预确认流时，用子区块的接收时间。
3. 取 Bybit 订单簿，计算 microprice。
4. 对 τ ∈ {−5, …, 15} 秒计算 markout，按名义金额加权平均。
5. 按"安静 / 非安静"和"单笔 / 套利"分组重复第 4 步。

## S 术语表 {depth=2}
```glossary
LVR | loss-versus-rebalancing | 报价过期被套利导致的 LP 损失。它按"与持续再平衡的组合相比"计算。 | 不是无常损失
markout | 成交后盈亏 | 成交后 τ 秒用参考价重估这笔成交，得到做市方的盈亏，正数表示做市方赚。 | 论文中是 gross 值，不是净利润
propAMM | proprietary AMM，专有 AMM | 运营方用小交易直接改价、用自有库存成交的链上合约。 | 不是 RFQ，报价是链上状态
RFQ | request for quote | 做市商对单个 taker 签发一次性报价，taker 带签名上链成交。 | 报价不是链上公共状态
锚定价 | anchor price, p | Tessera 存储的单一参考价。所有档位按倍数相对它定位。 | 不是成交价
罚金 | penalty, ϕ | Tessera 在走完梯子后扣下的输出比例，由 6 个分量相加，单位 ppm。 | 不是 LP 手续费
默认费 | default fee | Tessera 罚金分量之一，运营方可随时改，白名单地址免收。 | 论文观测到它在块首上调、块末复位
Flashblocks | 子区块预确认 | Base 每 200 ms 发出一个子区块，广播后顺序锁定。 | 不是最终确认
预确认 | preconfirmation | 排序器在区块最终确认前给出的执行承诺。 | 通常只是运营承诺，没有密码学保证
microprice | 加权中间价 | 按对侧挂单量加权的买一、卖一中间价。 | 不是简单中间价
原子套利 | atomic arbitrage | 一笔交易内在两个场所反向买卖，所有代币余额变化都不为负。 | 不是 CEX–DEX 套利，后者有链下腿
往返价差 | realized round-trip spread | 同一池子相邻两笔反向、规模相近成交之间的相对价差。 | 不是报价价差
安静成交 | quiet fill | 成交前 5 秒到后 1 秒，参考价变动小于 1 bp 的成交。论文用它近似散户。 | 不是身份识别
spoofing | 诱饵报价 | 快照时显示好价格，成交时给更差价格。论文用于描述 Tessera 的默认费模式。 | 不同于传统市场的挂单撤单式 spoofing
last look | 最后一看 | 做市商看到 taker 订单后再决定是否按报价成交。 | 不是撤单优先本身
JIT Router | 交易内询价路由 | 在同一笔交易内询问各场所报价，再在最优场所成交的路由合约。 | 不是 JIT 流动性
```

## T 参考资料 {depth=2}
1. [Active Liquidity On Chain: Evidence from PropAMMs Across Chains](https://arxiv.org/html/2609.38056v1) — Heimbach、Milionis，Category Labs，2026。本页的主体。**PRIMARY**
2. Base RPC 实测（本页 [复现](#panel-R)）— 2026-10-04 读取区块 50,369,777 与 50,196,022。验证载荷与默认费更新。**PRIMARY**
3. [Automated Market Making and Loss-Versus-Rebalancing](https://arxiv.org/abs/2208.06046) — Milionis et al., 2022。LVR 的定义。**PRIMARY**
4. [PropAMM Shenanigans](https://0x.org/post/propamm-shenanigans) — 0x，2026-03。Base 上块末诱饵报价的独立证据。
5. [PropAMMs and the Next Chapter of Permissionless Market Structure](https://jumpcrypto.com/resources/propamms-and-the-next-chapter-of-permissionless-market-structure) — Jump Crypto（BisonFi 运营方），2026-04。改价载荷、序号、防御逻辑，以及代币化证券的论点。
6. [Solana's Proprietary AMM Revolution](https://www.helius.dev/blog/solanas-proprietary-amm-revolution) — Helius，2025-08。Solana propAMM 的起源与运营方。
7. [PropAMMs on Ethereum: the story so far](https://memos.azfuller.com/propamms/) — A. Fuller，2026-09。以太坊 builder 协同模式与 Lambda Class Router 接口。
8. [Titan Builder PropAMMs 文档](https://docs.titanbuilder.xyz/propamms) — 旧更新被替换、更新紧贴成交的 builder 规则。**PRIMARY**
9. [Measuring CEX-DEX Extracted Value](https://doi.org/10.4230/LIPIcs.AFT.2025.26) — Wu et al., AFT 2025。markout 方法的来源。
10. [Flashblocks on Base](https://docs.chainstack.com/docs/flashblocks-on-base) — Chainstack。200 ms 子区块与 pending 状态读取。
11. [Microprice and book imbalance](https://databento.com/docs/examples/order-book/microprice) — Databento。参考价的定义。
12. Mantle 内部文档：`1-rfs-propamm/README.md`、`fluxion-propamm-spec.md`、`chain-infra/README.md`。Mantle 的 RFQ / propAMM 计划与 KPI。

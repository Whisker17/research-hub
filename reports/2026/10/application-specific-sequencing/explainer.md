---
template: research
title: 应用特定排序（ASS / ACE）：跨生态实现与 Mantle 的区块空间再分配
subtitle: EVM 上的应用特定排序大多不改区块顺序，只锁合约入口、对小费收税或依赖 builder 约定；能改区块空间的只有 Tempo 与 BSC 的 lane，而且它们只隔离容量。Mantle 已有一条 FIFO preconf 车道雏形。建议在 builder 里做“外层按类别分配容量、内层按类别选排序规则”的调度，协议层强制留到后期。
cols: 4
type: 技术调研 · 跨生态对比 · 方案设计
audience: Mantle 的协议 / 基础设施开发者与研究员：懂 EVM 和 OP Stack 出块流程，没有系统看过排序机制与 MEV 拍卖设计
scope: 截至 2026-10-11 各生态的 ASS / ACE 实现与提案（重点 EVM）；Mantle 现有与计划中的出块路径；Mantle 方案（设计建议，不是现网能力）
evidence: 251 条论断台账（observed 195 / inferred 49 / speculative 7）；源码 angstrom @9821659、l2-angstrom @81bd418、op-rbuilder @4f1bec3、rollup-boost @87589f8、PUR @8701e8e、block-sdk @25c042e、tempo @87bd32a、bsc @8cc60b2、mantlenetworkio/op-geth @e33cd26、mantle-xyz/reth @f022de0、mantle-v2 @da45c31；Base / Ethereum 链上读取；访问于 2026-10-11
date: 2026-10-11 · v1
---
结论先行：EVM 上的应用特定排序几乎都不接管区块顺序。它们锁住合约入口（Angstrom L1），对优先费收税（Angstrom L2），或者依赖 builder 自愿执行的约定（PUR）（[F1](#F1)）。真正在协议层重新分配区块空间的只有 Tempo 和 BSC 的 payment lane，它们既不提供 FCFS，也不隔离费用（[F7](#F7)）。其他生态的成熟设计结构相同：外层按操作类别分档、设容量，内层各用自己的排序规则（[F6](#F6)）。

Mantle 的 op-geth 和 mantle-reth 里已经有一条 FIFO preconf 车道，但它没有容量上限，只由 sequencer 强制（[F9](#F9)）。因此建议：在 mantle-reth builder 里做五车道调度，把维护操作、支付、发射、通用交易分开；只有能从区块内容复核的规则才考虑写进协议（[F11](#F11)、[F12](#F12)）。

## A 四层全景：排序规则由谁强制 {sheet meta="by enforcement"}
```tree list
链共识 / 有效性规则 | 违规 → 区块无效
  Hyperliquid、Injective FBA | app-chain
  Tempo lane、BSC lane | 只管容量
sequencer / builder 策略 | 违规 → 只损声誉
  Unichain TEE、Timeboost、PUR | EVM
  BAM MPP、Mantle preconf 车道 | 
链下批处理网络 + 合约入口 | 违规 → 调用 revert
  Angstrom L1、Atlas / SVR | 
合约规则与经济激励 | 无“违规”
  Angstrom L2 MEV tax、AMQ | 
```

## B 一条设计公式 {sheet span=2 meta="设计建议"}
```annot
# Mantle 区块空间再分配：两层 | 设计建议
外层：[类别]{确定性分类：合约 × selector × 签名者} → [容量]{保底或上限，不按小费比较}
内层：[排序规则]{FCFS / phase-first / 小费 / 批量，按类别选}
> 能写进有效性规则的只有容量与分段顺序。FCFS 的到达时间和“没有审查”只能靠回执与追责。
```

## C 主要实现对比 {sheet meta="2026-10-11"}
| 实现 | 强制力 | 组合性 | 状态 |
|---|---|---|---|
| Angstrom L1 | 合约锁 + 链下网络 | 批次后同块 | ok 主网 |
| Angstrom L2 | 合约税 + 信任 sequencer | 同块原子 | ok Base |
| PUR | builder 约定 | 同块原子 | warn ERC 草案 |
| BAM MPP | TEE 节点 | 同块 | warn 37.66% stake |
| Hyperliquid | 共识 | 只能经桥 | ok 主网 |
| Tempo lane | 共识 | 同块 | ok 主网 |
| BSC lane | 共识 | 同块 | warn 未激活 |
| Mantle preconf | sequencer | 同块 | warn 主网未知 |
| Express Relay | 合约许可 | 同笔交易 | no 已停运 |

## D 关键数字 {sheet span=2 meta="numbers"}
| 项目 | 数值 |
|---|---|
| Mantle 出块 | 2 秒，单一 sequencer |
| Angstrom L2 税系数（Base） | 200 → 套利出价约 99.5% 归应用 |
| BAM MPP | 每轮约 50 ms；覆盖 37.66% stake |
| Tempo 非支付上限 | 30M / 500M gas |
| BSC 支付保底 | 默认 5%，上限 10% |
| Arbitrum PGA 提案 | 125 ms 一轮，按小费排序 |
| ACE 奇偶例 | 6 种排列仅 2 种合法 |

## E 时间线 {sheet span=2 meta="2022 → 2026"}
```timeline v
2022-10 | PEPC 提案 | proposer 承诺进有效性
2024-06 | Paradigm MEV tax | 小费排序 + 应用收税
2024-10 | Sorella ASS 博客 | 链下批处理路线
2025-06 | Mantle preconf 车道合入 | op-geth #113
2025-09 | BAM 主网 | MPP 插件
*2026-01 | ACE 文章 | cancel priority 案例
2026-02 | Tempo lane 上主网 | T1
2026-06 | Arbitrum PGA 提案 | 替换 Timeboost
2026 H2 | Mantle 路线图 | Flashblocks、撤单优先、2D nonce
```

## F 结论 {sheet span=4}
```callout ok 外层按类别分配容量，内层按类别选排序规则；先放在 builder，后写进协议
- EVM 上的 ASS 大多只控制合约入口或收税，不控制区块顺序（F1–F3）。Mantle 想为不同应用提供不同排序，需要在 sequencer / builder 层动手。
- 你的假设部分成立：payment 需要“容量保底 + 合格队头 FCFS + 独立 nonce 域”；DeFi 要再拆成“维护操作 phase-first”和“套利按小费拍卖”（F10）。
- Mantle 不用从零开始：preconf FIFO 车道和 mantle-reth 的配额调度器就是骨架。先补上限和分类，再扩成五车道（F9、F11）。
- 外层不能按小费分配空间，否则 MEV-tax 应用会被挤出（F3）。fallback 不能静默退回纯小费排序（F12）。
```

## G 如何阅读 {depth=1}
```callout info 默认你已知道（本文不解释）
- EVM 交易、gas、EIP-1559 的 base fee 与 priority fee
- OP Stack 的分工：op-node 驱动执行客户端出块，batcher 把数据发到 L1
- 交易池、nonce：同一账户的交易必须按 nonce 顺序执行
- Uniswap v4 hook：池子在 swap 前后调用的外部合约
- MEV 的基本概念：抢跑、夹子、套利
```
- **5 分钟**：只看导语和总览 A–F。
- **30 分钟**：再读以下面板：[前置知识](#panel-I)、[概念与四层分类](#panel-J)、[合约层](#panel-K)、[builder 层](#panel-L)、[其他生态](#panel-M)、[区块空间分区](#panel-N)、[边界](#panel-O)、[Mantle 现状](#panel-P)、[检验假设](#panel-Q)、[五车道设计](#panel-R) 和 [落地路径](#panel-S)。
- **要复核的开发者**：再读 [方法与证据](#panel-U) 和 [复现](#panel-V)，命令可以直接运行。

**贯穿全文的例子**：Mantle 的同一个出块窗口里，同时到达下面这些交易。后面每个面板都问：在这个机制下，它们按什么顺序上链？

| 记号 | 交易 |
|---|---|
| P1、P2 | 两笔 USDC 转账，P1 先到 |
| Q1、Q2 | 同一做市商对同一 Prop AMM 市场的两次报价更新，Q2 更新 |
| C1 | 做市商撤掉一笔陈旧报价 |
| T1 | taker 想吃这个市场的报价，付很高的小费 |
| A1、A2 | 两个套利者竞争同一个 MNT/USDC 池的机会，A1 小费更高 |
| L1–L3 | 三笔 meme 发射的买入 |

## H 背景动机 {depth=2}
**问题**：Mantle 的产品方向同时包含 payment、DeFi、Prop AMM 做市、perps 和 meme launchpad。它们对排序的需求不同。今天 Mantle 只有一套规则：按有效小费从高到低排 [26][27]。结果是：
- meme 发射时，支付交易要和抢购交易比小费；
- 做市商的撤单 C1 可能被付更高小费的 taker T1 抢先；
- 套利者的出价全部付给 sequencer，没有回到 LP。

**为什么现在**：
- 2026-01-29，ethresear.ch 的 ACE 文章用 cancel priority 统一比较了四种实现 [1]。
- Mantle 2026 H2 路线图列出 Flashblocks、“预确认策略上链”、Prop AMM 撤单优先和 2D nonce [26]。这些都需要先决定排序规则放在哪一层。
- 作者作为 Mantle researcher，想设计一套“为不同应用提供不同排序”的能力。

**范围**：
- 各生态的 ASS / ACE 实现与提案，重点 EVM
- Mantle 现有出块路径（op-geth）与计划路径（mantle-reth、Flashblocks）中可以插入规则的位置
- Mantle 方案：全部是设计建议，不是现网能力

**非目标**：投资建议；完整代码审计；Mantle 正式路线图承诺；共享 sequencer / based rollup 的完整对比；车道比例的定量仿真。

**已有资料的不足**：外部调研（ChatGPT Deep Research）给出了合理的框架 [33]。但它有几处问题：
- 漏了 Mantle 已有的 preconf FIFO 车道；
- 建议的工程入口（op-rbuilder）不是 Mantle 现行方向；
- 把已停运的 Pyth Express Relay、正被替换的 Timeboost 当作现行方案；
- perps 与 meme launchpad 只来自 brief，Mantle 官方一手表述是 payment、Prop AMM 撤单优先和 RWA。

完整修正表见 [方法与证据](#panel-U)。

## I 前置知识 {depth=2}
```excalidraw q="读懂这篇报告，要先懂哪些概念？按什么顺序？" read="灰色虚线框是默认已知；蓝框是卡片；绿框是本文主题。箭头表示先学 → 后学。" takeaway="B-0 讲规则能放在哪；B-1、B-2 讲现状为什么不够；B-3、B-4 讲两种现成工具；B-5 讲 Mantle 未来的出块节奏。" name=prereq-map kind=前置知识地图
{"grid": {"w": 290, "h": 115}, "defaults": {"w": 220, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "op", "label": "OP Stack（已知）", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "mem", "label": "交易池与 nonce（已知）", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "mev", "label": "MEV 基础（已知）", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 Mantle 出块路径", "col": 1, "row": 0, "color": "blue"},
   {"id": "b1", "label": "B-1 小费排序与 FCFS", "col": 1, "row": 1, "color": "blue"},
   {"id": "b2", "label": "B-2 cancel priority", "col": 1, "row": 2, "color": "blue"},
   {"id": "b5", "label": "B-5 Flashblocks", "col": 2, "row": 0, "color": "blue"},
   {"id": "b3", "label": "B-3 lane：保底与上限", "col": 2, "row": 1, "color": "blue"},
   {"id": "b4", "label": "B-4 MEV tax", "col": 2, "row": 2, "color": "blue"},
   {"id": "top", "label": "Mantle 应用感知排序", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "op", "to": "b0"}, {"from": "mem", "to": "b1"}, {"from": "mev", "to": "b2"},
   {"from": "b0", "to": "b5"}, {"from": "b1", "to": "b3"}, {"from": "b2", "to": "b4"},
   {"from": "b5", "to": "top"}, {"from": "b3", "to": "top"}, {"from": "b4", "to": "top"},
   {"from": "b1", "to": "b4", "dashed": true}
 ]}
```

```prereq B-0 l1 4min
# Mantle 出块路径
是什么: Mantle 只有一个 [[sequencer]]。op-node 每 2 秒让执行客户端 op-geth 从私有交易池取交易出块 [26][29]。验证节点和 OP Succinct 证明只按 batch 原样重放交易，不检查顺序 [29]。
为什么需要: 本文每个方案的强制力，都取决于规则放在这条路径的哪一层。
例子: op-node 设 `NoTxPool=false` → op-geth `fillTransactions` 选交易 → batcher 发 blob → kona 派生、重放并出证明。
误解: 误解：区块有效，就说明排序合规。事实：派生阶段只检查交易类型，不检查顺序（`batches.go:176-189`）[29]。
深入: [27] `miner/worker.go:731-826`
```

```prereq B-1 l1 3min
# 小费排序与 FCFS
是什么: 小费排序按[[有效小费]]从高到低选交易，同价按到达时间。[[FCFS]] 只按到达时间。op-geth、reth、Tempo 的默认交易池都是小费排序 [9][22][27]。
为什么需要: “payment 要 FCFS”的前提是知道现状不是 FCFS。
例子: A 付 2 gwei 小费；B 付 1 gwei，但先到。小费排序：A → B。FCFS：B → A。
误解: 误解：同价按时间就是 FCFS。事实：只要有人加价，就能插到前面。
深入: [9] reth `ordering.rs:61-86`
```

```prereq B-2 l1 4min
# cancel priority（撤单优先）
是什么: 做市商的报价在外部价格变化后会过时。taker 抢在撤单前吃掉它，做市商就亏钱。[[cancel priority]] 要求同一批内撤单先于吃单 [1]。
为什么需要: Prop AMM、perps 做市都需要这条规则。Mantle 路线图把它写成了 Prop AMM 的需求 [26]。
例子: 外部 ETH 价从 3000 跳到 3010。做市商发 C1 撤单，T1 来吃旧报价并付更高小费。按小费排序，T1 先执行。
误解: 误解：做市商多付小费就行。事实：Solana 上低 CU 更新只是成本优势，出价更高的 taker 仍能越过 [18]。
深入: [1] §1、§2.1
```

```prereq B-3 l1 3min
# lane：保底与上限
是什么: [[lane]] 给一类交易加 gas 约束。上限：这类交易最多用多少，例如 Tempo 给非支付 30M / 500M。保底：别的交易用不到这一份，例如 BSC 给支付默认 5% [22][23]。
为什么需要: “对区块空间再分配”在协议里就是这两种约束。
例子: BSC 55M gas 的块：支付保底 2,750,000 gas，普通交易最多 52,250,000 gas [23]。
误解: 误解：有了 lane，支付就更便宜、更靠前。事实：两条 lane 都不改费用，也不改顺序 [22][23]。
深入: [23] BEP-703 §3.3
```

```prereq B-4 3min
# MEV tax
是什么: 应用按交易的优先费收税，优先费越高税越高。只要 sequencer 按优先费排序，竞争者的出价大部分就转给应用 [6]。
为什么需要: 这是“DeFi 按小费排序”还能把价值留给 LP 的前提，也说明外层不能按小费分配空间。
深入: [6] “Incentive incompatibility” 一节
```

```prereq B-5 3min
# Flashblocks
是什么: builder 把一个区块切成多个 200–250 ms 的子块，逐个发布预确认。每个子块都重新从交易池按小费取交易 [9][10]。
为什么需要: 子块天然是一“轮”，可以在每轮开头先放维护操作。Mantle 路线图计划引入它 [26]。
深入: [10] `specs/flashblocks.md`
```

## J ASS 与 ACE：概念与四层分类 {depth=2}
两个词来自两篇文章：
- **[[ASS]]**（application-specific sequencing）来自 Sorella 2024-10 的博客。它由三个性质定义：受限的排序权、应用专属 mempool、结果与区块内顺序无关 [2]。
- **[[ACE]]**（application-controlled execution）来自 Bahrani 与 Neuder 2026-01 的 ethresear.ch 文章。定义是“应用对与它交互的**一批**交易施加排序规则” [1]。

ACE 更宽。ACE 文章把 Angstrom 归为“链下批处理”一类。引用 Sorella 原话时，它把原文的 “ASS” 换成了 “[ACE]” [1]。所以 ASS 是 ACE 的一条实现路线。

比较各种实现时，最有用的问题是：**排序规则由谁强制？违规后会怎样？** Fig 2 按这个问题把调研到的实现分成四层。

```excalidraw q="各种应用排序实现，强制力分别来自哪一层？违规后果是什么？" read="从上到下，强制力从“全体验证者”降到“经济激励”。每层左边是代表实现，右边灰字是违规后果。" takeaway="越往上，规则越可信，但改动越大、建块越难；EVM 上已上线的方案集中在下面三层。" kind=分层全景
{"defaults": {"w": 600, "h": 64, "fontSize": 16},
 "nodes": [
   {"id": "l0", "label": "链共识 / 有效性规则\nHyperliquid · Injective FBA · Tempo lane · BSC lane", "x": 0, "y": 0, "color": "green"},
   {"id": "l1", "label": "sequencer / builder 策略\nUnichain TEE · Timeboost · PUR · BAM MPP · Mantle preconf", "x": 0, "y": 100, "color": "blue"},
   {"id": "l2", "label": "链下批处理网络 + 合约入口\nAngstrom L1 · Atlas / Chainlink SVR · Express Relay（停运）", "x": 0, "y": 200, "color": "blue"},
   {"id": "l3", "label": "合约规则与经济激励\nAngstrom L2 MEV tax · UniswapX（废弃）· AMQ · Prop AMM", "x": 0, "y": 300, "color": "yellow"}
 ],
 "texts": [
   {"x": 620, "y": 22, "text": "区块无效", "fontSize": 15, "color": "gray"},
   {"x": 620, "y": 122, "text": "只损声誉", "fontSize": 15, "color": "gray"},
   {"x": 620, "y": 222, "text": "调用 revert", "fontSize": 15, "color": "gray"},
   {"x": 620, "y": 322, "text": "无“违规”", "fontSize": 15, "color": "gray"}
 ]}
```

| 层 | 组合性代价 | 抗审查 |
|---|---|---|
| 链共识 | app-chain 只能经桥；lane 同块原子 | 不保证：proposer 仍可不打包 |
| sequencer / builder | 同块原子 | 不保证：信任运营方 |
| 链下批处理 + 合约入口 | 批次后同块可用；外部 swap 先被锁 | 网络内部可设计；L1 proposer 不受约束 |
| 合约与经济激励 | 同块原子，或下一 slot 结算（AMQ） | 不保证 |

```finding F1 high
# EVM 上的 ASS 大多不接管区块排序，只控制合约入口、收税或依赖 builder 约定
结论: 在调研到的已上线 EVM 实现里，只有 Tempo lane 在协议层改变区块空间的分配；BSC lane 已合并但未激活。其他方案分三类：
- 锁住合约入口：Angstrom L1 每块先锁 swap；Atlas、Express Relay 检查许可。
- 对优先费收税：Angstrom L2、UniswapX priority。
- 依赖 builder 自愿执行的约定：PUR、Unichain TEE 小费排序。
证据: [observed] Angstrom L1 锁 [4]、Atlas 交易内顺序 [8]、Angstrom L2 税 [5]、PUR 合约只检查授权与时间窗 [13]、Tempo `general_gas_limit` [22]、BSC 未激活 [23]（A1、A40、A18、B30、L9、L24）。[inferred] 四层分类由上述实现归纳（D1、D2）。
影响: 应用自己能做的只是“让违规顺序无利可图或执行失败”。Mantle 要给不同应用不同排序，必须在 sequencer / builder 层或协议层动手。
```

## K EVM 实现之一：合约层（Angstrom、UniswapX、Atlas） {depth=2}
### Angstrom L1：合约锁 + 链下批处理

Angstrom L1 是一个 Uniswap v4 hook，加上一个链下的质押验证者网络 [3][4]。hook 在每个区块开始时锁住 swap。只有节点的 bundle，或者带节点“空块签名”的交易，才能解锁。Fig 3 是一个 slot 内的流程。

```uml q="Angstrom L1 怎样让自己的批次成为每个区块里第一笔有效的 swap？" read="源自 UnlockHook.sol、TopLevelAuth.sol、Angstrom.sol 与白皮书。高亮部分是链上执行。" takeaway="以太坊不保证 bundle 的位置；hook 保证 bundle 之前的外部 swap 一定 revert。"
sequenceDiagram
  autonumber
  participant U as 用户 / 做市商
  participant N as Angstrom 节点网络
  participant B as 以太坊 builder
  participant H as Angstrom hook
  participant X as 外部交易者
  U->>N: 签名订单、链下撤单（零 gas）
  N->>N: 共识：ToB 拍卖 + 统一清算价
  N->>B: execute(bundle)：mempool、合作 builder、MEV-Boost
  rect rgb(234, 241, 251)
    X->>H: 排在 bundle 之前的 swap
    H-->>X: revert CannotSwapWhileLocked
    B->>H: execute(bundle)：写入当前块号，解锁
    H->>H: AMM 调整 → ToB → 用户订单 → 结算
    X->>H: 同块后续 swap（按 unlockedFee）
  end
```

关键事实：
- 锁是一个**全局**变量 `_lastBlockUpdated`，一次解锁同时打开所有 Angstrom 池。文档写的是“解锁指定的池”，与代码不一致 [3][4]。
- LP 增减流动性、提取内部余额不受锁限制。节点停摆时 swap 一直锁住，但 LP 资金可以撤出 [4]。
- 撤单是链下订单类型，零 gas。只要在共识 Round 1 之前提交，就保证本 slot 生效 [3]。cancel priority 由批次构造规则保证，不依赖以太坊的区块排序。
- 白皮书说罚没在初始发布时不上线 [3]。2026-10-11 链上读取显示，主网 hook 上一块刚解锁过，仍在运行 [4]。

```solidity
// angstrom/contracts/src/modules/UnlockHook.sol:38-57 @9821659
function beforeSwap(address, PoolKey calldata key,
    IPoolManager.SwapParams calldata,
    bytes calldata optionalUnlockData
) external returns (bytes4, BeforeSwapDelta, uint24) {
    _onlyUniV4();
    if (!_isUnlocked()) { // _lastBlockUpdated != block.number
        if (optionalUnlockData.length < 20) {
            if (optionalUnlockData.length == 0) {
                revert CannotSwapWhileLocked();
            }
            revert UnlockDataTooShort();
        } else {
            address node = address(bytes20(optionalUnlockData[:20]));
            bytes calldata signature = optionalUnlockData[20:];
            unlockWithEmptyAttestation(node, signature);
        }
    }
    ...
```

```finding F2 high
# Angstrom L1 用合约锁换来 cancel priority 和统一价，代价是多一层链下网络的 liveness
结论: hook 让外部 swap 在 bundle 之前一定失败，所以批次内的规则（撤单在链下先处理、统一清算价、ToB 拍卖）对这个池子成立。代价有三项：节点停摆时 swap 不可用；外部合约只能在 bundle 之后的同块位置使用新状态；以太坊 proposer 不打包 bundle 时没有约束。
证据: [observed] `UnlockHook.sol:38-57`、`TopLevelAuth.sol:58,212-226`、`PoolUpdates.sol:50-155` [4]；白皮书 §1、App. B.3、脚注 15 [3]；主网 hook `extsload` 读取 [4]（A1–A5、A8–A10、A12）。[inferred] 无自动兜底解锁（A13）。
影响: Mantle 上的 perps / Prop AMM 可以不改 sequencer，用“合约锁 + 链下批处理”拿到撤单优先。但要像 Angstrom 一样，把 LP 存取等关键状态留在锁外。
```

### Angstrom L2：对优先费收税

L2 版本没有链下网络。hook 在 `beforeSwap` 里读出优先费，按公式收原生币税，再在 `afterSwap` 里分给池创建者、协议和 LP [5]。排序本身完全交给 L2 sequencer 的小费排序。

```solidity
// l2-angstrom/src/AngstromL2.sol @81bd418（节选）
uint256 internal constant TAXED_GAS = 120_000;      // :105
function getSwapTaxAmount(uint256 priorityFee)       // :195-200
    public view returns (uint256) {
    if (priorityFee <= priorityFeeTaxFloor) return 0;
    return swapMEVTaxFactor * TAXED_GAS
        * (priorityFee - priorityFeeTaxFloor);
}
function _getPriorityFee() internal view            // :664-666
    returns (uint256) {
    return tx.gasprice > block.basefee
        ? tx.gasprice - block.basefee : 0;
}
// :249  currency0 必须是原生币
if (key.currency0.toId() != NATIVE_CURRENCY_ID)
    revert IncompatiblePoolConfiguration();
```

用例子说明：A1 和 A2 抢同一个池的套利机会。A1 把优先费提高 1 单位，付给 sequencer 的也只多 1 单位；但在 Base 现行参数（factor 200）下，付给应用的税增加约 200 倍 [5]。所以套利者出价的约 99.5% 回到了 LP 和协议。

[[MEV tax]] 有两个前提：
- Paradigm 原文要求排序方遵守四条规则：按优先费排序、不审查、交易内容保密、不能最后出价。后三条目前只能信任单一 sequencer [6]。
- 原文也承认：MEV-tax 应用付给链的小费很低，区块满时会被挤出；在 EIP-1559 链上这种情况“should be relatively rare” [6]。

```finding F3 high
# MEV tax 能把约 99.5% 的套利出价留给应用，但依赖 sequencer 的四条承诺；外层若按小费分配空间就会挤出它
结论: Angstrom L2 的税为：$\text{Tax} = \text{swapMEVTaxFactor} \times 120{,}000 \times (\text{priority\_fee} - \text{threshold})$。Base 实测 factor 200、阈值 0.01 gwei。池子必须是“原生币 / X”交易对，在 Mantle 上就是 MNT/X。已核实的部署只在 Base（2026-09-24 新版）；文档声称的 Unichain 地址在链上没有代码。
证据: [observed] `AngstromL2.sol:105,195-215,249,664-666` [5]；Base 链上 `swapMEVTaxFactor()` = 200 等读数 [5]；Paradigm 四条规则与 Full blocks 节 [6]（A18、A19、A23、A26–A28、A33、A34）。[inferred] 99.5% 由 factor 推出（A36）；外层不能按小费比较由 A34、A36 推出（D5）。
影响: Mantle 若想吸引这类应用，sequencer 要公开承诺并能证明“按优先费排序、不插队”。外层车道的容量分配不能比较付给 sequencer 的小费。
```

### 其他合约层实现

- **UniswapX priority 路径**：每 wei 优先费换成给用户的价格改善。官方文档已标为 Deprecated：“moved to the RFQ and exclusive Dutch auction model on all chains” [7]。
- **FastLane Atlas**：一笔 `metacall` 内部按 preOps → userOp → solverOps（按 bid 排）→ allocateValue 执行，只控制交易内部顺序，不控制区块位置 [8]。仓库最后提交是 2025-10-17。ACE 文中说的“DeFi-specific L2 Atlas”是 Ellipsis Labs 的 SVM L2，不是这个项目 [8]。
- **Chainlink SVR**：Base、Arbitrum、BNB Chain、Monad 上走 Atlas，把预言机更新和清算放进同一笔交易，不需要 builder 配合 [16]。
- **Pyth Express Relay**：链下拍卖 + 合约 `isPermissioned` 检查。2026-07 Pyth 治理通过 OP-PIP-124，整体停运 [15]。

## L EVM 实现之二：sequencer / builder 层 {depth=2}
### op-rbuilder 与 rollup-boost：只有小费排序

OP Stack 生态的外部 builder（op-rbuilder）没有自己的排序算法。它从 reth 交易池取交易，而池类型写死为 `CoinbaseTipOrdering` [9]：

```rust
// reth/patches/reth-transaction-pool/src/ordering.rs:61-86 @f022de0（节选）
impl<T> TransactionOrdering for CoinbaseTipOrdering<T> {
    fn priority(&self, transaction: &Self::Transaction,
                base_fee: u64) -> Priority<Self::PriorityValue> {
        transaction.effective_tip_per_gas(base_fee)
            .map(U256::from).into()
    }
}
// 同优先级时，submission_id 小（更早入池）者在前（pending.rs:649-657）
```

- Flashblocks 模式下，每个子块都重新取一次排序迭代器，gas 预算按“区块上限 / 子块数”累加 [9]。所以小费排序只在单个子块的候选集内成立。
- 选择循环 `execute_best_transactions` 是唯一的逐笔过滤入口。现有开关有单笔 gas 上限、按地址的 gas / 计算时间令牌桶（默认关闭）、revert protection [9]。
- rollup-boost 用本地执行客户端的 `engine_newPayload` 校验外部 builder 的区块，失败就回退到本地区块 [10]。源码里**没有任何排序检查**；回退时链上看不出来。

### Unichain：TEE 里的小费排序

Unichain 自 2025-05-01 在 TEE 内建块，官方称“纯按优先费排序”；2025-08-14 上线 200 ms 子块 [11]。Flashtestations 的区块证明只检查“这个块由获准的 TEE 镜像产出”。规范原文注明合约“cannot validate the blockContentHash onchain” [10]。所以“可验证排序”实际是 TEE 信任加代码度量，不证明排序谓词，也不证明没有漏收交易。

### Arbitrum Timeboost → PGA 提案

Timeboost 每 60 秒拍卖一次 express lane，赢家的交易少等 200 ms；它是全链级的时间优先，不分应用 [12]。2026-06-03 的 Constitutional AIP 提议改为 [[PGA]]：每 125 ms 一轮按优先费排序，每 250 ms 出块，加防饿死机制。理由之一是 PropAMM 需要便宜、高频、按优先费的报价更新 [12]。该提案已进入链上投票，执行状态未核实。

```finding F4 high
# builder 层现成能力只有“小费优先、同价 FIFO”；TEE 只证明谁建的块；回退会静默取消排序规则
结论: op-rbuilder 的排序来自 reth 交易池的 `CoinbaseTipOrdering`，不是 FCFS。Flashblocks 让排序保证缩到单个子块。rollup-boost 只做 EVM 有效性校验，回退到本地块时应用级排序会被静默取消。Unichain 的“可验证排序”依赖 TEE 信任，不是排序证明。
证据: [observed] `ordering.rs:61-86`、`pending.rs:649-657`、`candidate.rs:210-219`、`payload.rs:242,735` [9]；`server.rs:380-461`、`flashtestations.md:808-831`，以及 `rg` 无排序检查 [10]；Unichain 博客与变更日志 [11]（B1–B5、B12、B14、B16–B19）。[inferred] B3、B6、B15、B20。
影响: Mantle 在 builder 层做车道时，必须同时改造 fallback 路径；宣传“可验证排序”前，需要公开回执与候选集，而不只是 TEE 证明。
```

### PUR 与 BAP-710：EVM 上的报价更新优先

Flashbots 的 [[PUR]]（Priority Update Registry）是一个共享合约。做市商把“本块有效”的报价写进固定布局的 lane；PropAMM 用 `getState(lane, minTs, maxTs)` 读取，时间窗不符就 revert [13]。Fig 4 是一笔 taker 交易的流程。

```uml q="PUR 怎样让做市商的报价更新排在 taker 之前？哪些步骤靠合约，哪些靠 builder？" read="源自 PUR README 与 PrioUpdateRegistry.sol。高亮部分是 builder 自愿执行的约定，合约无法强制。" takeaway="合约只管授权、时间窗、时间戳单调；“更新插在第一个读者之前、没读到的不上链”全靠 builder。"
sequenceDiagram
  autonumber
  participant M as 做市商
  participant B as builder
  participant T as taker
  participant R as PUR 合约
  participant P as PropAMM
  M->>B: 签名报价更新 Q1、Q2（新的替换旧的）
  T->>B: swap 交易 T1
  rect rgb(255, 243, 191)
    B->>B: T1 会读 PropAMM 的 lane？
    B->>R: 先插入最新更新 Q2：updateState
  end
  B->>P: 执行 T1
  P->>R: getState(lane, now − age, now)
  R-->>P: Q2 的报价（过期则 revert）
  Note over B: 本块没被读到的更新直接丢弃
```

```solidity
// priority-update-registry/src/PrioUpdateRegistry.sol @8701e8e（节选）
function getState(uint256 laneIndex, uint32 minTimestamp,
                  uint32 maxTimestamp)                 // :90-113
    external view returns (uint32 updateTimestamp,
                           uint256[] memory slots) {
    uint256 base = _laneSlot0Index(msg.sender, laneIndex);
    ... // slot0 = 时间戳 32 位 | 槽数 8 位 | 数据 216 位
    if (updateTimestamp < minTimestamp
        || updateTimestamp > maxTimestamp) revert StaleUpdate();
}
function updateState(address target, uint256 laneIndex,
    uint32 updateTimestamp, uint256[] calldata slots)
    external {                                         // :179-182
    if (!isUpdater[target][msg.sender]) revert NotAuthorized();
    _writeState(target, laneIndex, updateTimestamp, slots);
}
```

BSC 的 BAP-710 把 PUR 改成 48 位 seq 版本 [14]。它还加了一个 builder 中立的 relayer。relayer 把报价与读到报价的 taker 交易组成原子 bundle，再发给多个 builder [14]。

```finding F5 medium
# PUR 把“报价更新优先”带到 EVM，但完全依赖 builder；单一 sequencer 的链可以直接内置
结论: PUR 主网合约 `0xda7afeed…6b81` 已部署，ERC-8324 仍是草案；op-rbuilder 与 rollup-boost 都没有 PUR 集成。BAP-710 的 relayer 是为多 builder 环境设计的。Mantle 只有一个 builder，可以把 PUR 式插入直接写进 builder；但 RPC 仍要给 taker 提供“链上状态 + 未上链报价”的模拟视图。
证据: [observed] `PrioUpdateRegistry.sol:90-182`、README Threat Model [13]；`eth_getCode` 4085 字节 [13]；ERC PR #1852 [13]；BAP-710 §4–§5 [14]（B30–B37）。[inferred] B38、D13。
影响: Mantle 路线图里的 “Prop AMM 撤单优先” 可以先用 PUR 式维护车道实现，不需要改协议。
```

## M 其他生态：类别优先 + 类内比较 {depth=2}
### Solana BAM 的 Maker Priority Plugin

[[BAM]] 是 Jito 在 Solana 上做的链下排序层 [17]。BAM Node 运行在 TEE 中，它接收交易、排好序，再以“原子批次”推给已接入的 leader。[[MPP]] 是 BAM Node 上的插件。Fig 5 是一轮的流程。

```uml q="BAM 的 Maker Priority Plugin 怎样保证做市商更新先于 taker？高小费能越过吗？" read="源自 bam.dev Maker Plugin 文档与 bam-protos。每轮约 50 ms。高亮的是不能用小费改变的第一阶段。" takeaway="同一市场每轮只留最新一笔更新，下一轮最先执行；validator 不按序执行的后果只是被断连。"
sequenceDiagram
  autonumber
  participant M as 做市商
  participant N as BAM Node（TEE）
  participant U as 用户 / searcher
  participant V as BAM leader
  M->>N: UDP 发报价更新到 PTPU（带 seqno）
  N->>N: 校验：已登记 signer / program / market
  N->>N: 同一市场只留最高 seqno
  U->>N: 交易、bundle（带 tip）
  rect rgb(211, 249, 216)
    N->>V: Phase 1：上一轮的 maker 更新
  end
  N->>V: Phase 2：bundle 与交易按 priority score
  V-->>N: 执行结果与剩余 CU
  Note over N,V: 不按序执行 → BAM 可断开该 validator
```

MPP 的设计要点 [17]：
- 资格是静态登记的：单 signer、已登记的 program 和 market、CU price 下限。没有运行时注册接口。
- 原文：“This ordering is structural and cannot be changed by paying higher fees or tips.”
- MPP 交易不需要 Jito tip。BAM 目前覆盖 37.66% stake，MPP 只在部分区域提供。

### Hyperliquid、Block SDK、AMQ、Injective

- **Hyperliquid**：每个共识 batch 内分三类排序：不发 GTC / IOC 的动作（含 post-only）→ cancel → 含 GTC / IOC 的动作；同类内按 proposer 顺序 [19]。原话：“The only correct way for a node to execute a block … is to sort cancels and post-only orders first.” HyperEVM 合约经 CoreWriter 下单会被延迟几秒，享受不到这条规则。
- **Skip Block SDK**：每条 lane 由 `Match`、`Compare`、`MaxBlockSpace` 和建块 / 验块两个钩子组成 [20]。推荐的默认 handler 让验证者**不检查** lane 规则；仓库已于 2025-01-31 归档。
- **Temporal AMQ**：程序把撤单和限价单先放进自己的队列，下一个 slot 再按应用规则批量执行 [18]。代价是失去同块原子性；作者承认 validator 可以靠审查和拖延绕过。
- **Injective FBA**：每块末统一清算，顺序是市价单 → 旧限价单 → 新限价单 [21]。

验证者侧的 lane 检查在代码里是这样的：

```go
// block-sdk/block/base/proposals.go:150-191 @25c042e（节选）
for index, tx := range partialProposal {
    if !h.lane.Match(ctx, tx) {
        // 本 lane 之后不能再出现本 lane 的交易
        if err := h.lane.VerifyNoMatches(ctx,
            partialProposal[index+1:]); err != nil { ... }
        return partialProposal[:index], partialProposal[index:], nil
    }
    if index > 0 {
        if v, err := h.lane.Compare(ctx,
            partialProposal[index-1], tx); v == -1 || err != nil {
            return nil, nil, fmt.Errorf("transaction at index %d"+
                " has a higher priority than %d", index, index-1)
        }
    }
}
```

```finding F6 high
# 成熟的多类别设计结构相同：外层按操作类别分档并限容量，内层各用自己的比较器
结论: 四个设计都是“先按类别分档，再在档内排序”：BAM 两阶段、Hyperliquid 三类排序、Block SDK lane 链、Arbitrum PGA 提案。语义优先权都很窄：要登记、资源有界、同一市场每轮只留一笔。只靠小费做优先（Solana Prop AMM 的低 CU 更新）只是成本优势，taker 出价更高就能越过。
证据: [observed] bam.dev MPP 文档 [17]；Hyperliquid order-book 文档 [19]；`block/lane.go`、`proposals.go:150-191`、`abci.go:32-45,136-139` [20]；Arbitrum 论坛 30942 [12]；Helius 博客 [18]（X5–X8、X25、X29–X32、B28、X22）。[inferred] X23、D6。
影响: “payment 要 FCFS、DeFi 要小费”可以直接落在这个结构里：每个类别一档，每档配自己的比较器和容量。
```

## N 区块空间分区：Tempo 与 BSC 的 payment lane {depth=2}
两条已有的 payment lane 方向相反（Fig 6）。Tempo 给**非支付**交易封顶；BSC 给**支付**交易保底 [22][23]。

```excalidraw q="同样是两道 gas 约束，Tempo 和 BSC 把区块空间分给了谁？" read="每条横条代表一个区块的 gas limit，宽度按比例画。蓝色是非支付交易能用的空间，绿色是支付交易能用的空间。" takeaway="Tempo 是支付链，只给非支付留 30M / 500M；BSC 是通用链，只给支付保底 5%。两者都不规定顺序，也不分开计费。" kind=约束形状对比
{"defaults": {"h": 56, "fontSize": 16},
 "nodes": [
   {"id": "tl", "label": "Tempo", "x": 0, "y": 0, "w": 90, "color": "gray", "stroke": "dashed"},
   {"id": "tg", "label": "非支付", "x": 110, "y": 0, "w": 90, "color": "blue"},
   {"id": "tp", "label": "支付：其余全部（约 94%）", "x": 200, "y": 0, "w": 570, "color": "green"},
   {"id": "bl", "label": "BSC", "x": 0, "y": 110, "w": 90, "color": "gray", "stroke": "dashed"},
   {"id": "bg", "label": "普通 + 支付共享：≤ 95%", "x": 110, "y": 110, "w": 570, "color": "blue"},
   {"id": "bp", "label": "支付保底", "x": 680, "y": 110, "w": 90, "color": "green"}
 ],
 "texts": [
   {"x": 110, "y": 70, "text": "非支付最多 30M / 500M（header 字段 general_gas_limit）", "fontSize": 14, "color": "gray"},
   {"x": 110, "y": 180, "text": "普通交易用不到最右 5%（默认 ratio 500，闲置也不归还）", "fontSize": 14, "color": "gray"}
 ]}
```

| 维度 | Tempo | BSC（BEP-703） |
|---|---|---|
| 约束 | 非支付 ≤ 30M | N + max(P, Q) ≤ G |
| 支付识别 | target + selector + ABI 长度白名单 | 名单地址，或转原生币给无代码地址 |
| 读状态 | 否 | 父状态 + 实时状态 |
| 排序 | 规范不要求；池按小费 | 不新增排序规则 |
| 费用 | 统一 base fee，支付也推高它 | 不改费用规则 |
| 状态 | ok 主网（T1 2026-02-12） | warn 已合并，未激活 |

Tempo 能“只看交易数据”分类，是因为 TIP-20 前缀地址本身是协议预编译，语义固定 [22]。T5 起每个 call 都要命中白名单，access list 和授权列表必须为空：

```rust
// tempo/crates/primitives/src/transaction/envelope.rs:280-301 @87bd32a（节选）
Self::Eip1559(tx) => {
    let tx = tx.tx();
    tx.access_list.is_empty()
        && is_tip1045_call(tx.to.to(), &tx.input)
}
Self::AA(tx) => {
    let tx = tx.tx();
    !tx.calls.is_empty() && tx.access_list.is_empty()
        && tx.tempo_authorization_list.is_empty()
        && tx.calls.iter()
            .all(|c| is_tip1045_call(c.to.to(), &c.input))
}
```

```finding F7 high
# 两条现成的 payment lane 只隔离容量：不提供 FCFS，也不隔离费用
结论: Tempo 规范原文：“The specification does not require any specific ordering of transactions”，默认交易池按小费排序。T7 起 Tempo 的动态 base fee 以全块 gas 为输入，支付流量同样推高它。BSC 不新增排序、优先级或费用规则，预留的 gas 照付全价；闲置预留不归还，是为了让“排除支付交易”有代价。
证据: [observed] Tempo 规范 §2 [22]；TIP-1045、TIP-1067、`ordering.rs:6-27` [22]；BEP-703 §3.3、§4、§6 [23]（L2、L3、L5、L15、L17–L20、L51）。[inferred] L25、D3。
影响: “payment 要 FCFS”需要在 lane 之上另加一层车道内排序。“meme 拥堵时支付不涨价”需要单独的费用设计，lane 解决不了。
```

## O 边界：规则冲突、审查与可验证性 {depth=2}
ACE 文章设想让合约声明函数顺序，例如 `order = [Cancel, Take]`，违反即区块无效 [1]。它随后指出两个代价。

**组合性：规则之间会出现无解的环。** Fig 7 是文中两个 DEX 的例子。

```excalidraw q="为什么两条都合理的应用排序规则，会让两笔交易无法放进同一个区块？" read="A、B 两个 DEX 都要求撤单（REMOVE）先于吃单（SWAP）。红色箭头是各自规则要求的先后关系。" takeaway="A 要求 TX1 在前，B 要求 TX2 在前；两笔原子交易成环，任何顺序都违规。" kind=规则冲突
{"grid": {"w": 360, "h": 150}, "defaults": {"w": 230, "h": 70, "fontSize": 16},
 "nodes": [
   {"id": "t1", "label": "TX1\nREMOVE(A) + SWAP(B)", "col": 0, "row": 0, "color": "blue"},
   {"id": "t2", "label": "TX2\nREMOVE(B) + SWAP(A)", "col": 2, "row": 0, "color": "blue"}
 ],
 "edges": [
   {"from": "t1", "to": "t2", "label": "DEX A：TX1 须在前", "strokeColor": "red", "via": [[475, -60]]},
   {"from": "t2", "to": "t1", "label": "DEX B：TX2 须在前", "strokeColor": "red", "via": [[475, 130]]}
 ],
 "texts": [
   {"x": 0, "y": 190, "text": "两个 DEX 的规则都是 REMOVE（撤单）先于 SWAP（吃单）", "fontSize": 15, "color": "gray"}
 ]}
```

**建块复杂度：** 交易调用哪个函数可能取决于运行时状态。文中的奇偶例子里，3 笔交易的 6 种排列只有 2 种合法 [1]。验块却很便宜：执行时发现违规就判无效 [1]。缓解办法是**显式信号**：交易预先声明会调用的函数，类似 Block Access List。

```finding F8 high
# 能写成有效性规则的只有“可从区块内容复核”的约束；FCFS 和“没有审查”不在其中
结论: 容量上限 / 保底（Tempo、BSC）与类别分段顺序（Block SDK、Hyperliquid）可以由验证者复核。FCFS 依赖到达时间，区块里没有这个信息。审查也看不出来：ACE 原文说 proposer “can always execute the take and not the cancel by simply excluding the cancel”。应用规则之间的环，只能拒绝或延后其中一笔交易。
证据: [observed] ACE §2.1、§3.1、§3.2、§3.3 原文 [1]；Block SDK `ProcessLane` [20]；Tempo 与 BEP-703 的有效性条件 [22][23]（L26–L27、L31–L33、L36–L37、X31）。[inferred] D7、D15。
影响: Mantle 若开放应用自定义规则，要先定冲突处理策略。支付的纳入保证要靠回执、截止时间和 forced inclusion，不能只靠排序规则。
```

另外两条边界：
- **AA 批处理**：ERC-4337 bundle 里所有 UserOp 共用 bundler 外层交易的 `tx.gasprice`，Angstrom L2 会按它计税；同一笔交易里有 2 次及以上 swap 时，每次都计全额税 [5]。ERC-4337 原文没有讨论这一点，这是从 EVM 语义推出的 [25]。
- **nonce 阻塞**：一个账户只有一条 nonce 序列。前面一笔交易卡住，后面的支付也走不了。ERC-4337 的 192 位 key + 64 位 sequence，以及 Tempo 原生交易的 `nonce_key`，都把账户拆成多条独立序列 [22][25]。

## P Mantle 现状：出块路径与 preconf 车道 {depth=2}
Mantle 官方文档写明：交易池是私有的，sequencer “will process transactions … in the order of their base fee and priority fee” [26]。代码里实际有三段（Fig 8）。

```uml q="Mantle 的 op-geth 填块时，交易按什么顺序进入区块？" read="源自 miner/worker.go:731-826 与 preconf/。绿色是已有的 FIFO 车道；黄色是按有效小费排序的部分。" takeaway="Mantle 已经有“一个按到达顺序的类别排在小费排序之前”，但这一类没有容量上限。"
flowchart TD
  d["强制交易：L1 info、deposit"] --> p{"还有 preconf 交易？<br/>（from 与 to 都在白名单）"}
  p -- 有 --> f["commitFIFOTransactions<br/>按接收顺序执行"]
  f --> u{"还有没封进块的？"}
  u -- 有 --> stop["结束填块：不放其他交易"]
  u -- 无 --> pr
  p -- 无 --> pr["prio 账户：按有效小费"]
  pr --> n["其他交易：有效小费降序<br/>同价按时间，账户内按 nonce"]
  n --> seal["封块（DA footprint、gas 检查）"]
  style f fill:#d3f9d8,color:#222
  style stop fill:#ffe3e3,color:#222
  style n fill:#fff3bf,color:#222
```

```go
// op-geth/miner/worker.go:764-781 @e33cd26
preconfTxs, pendingPlainTxs, plainTxCount :=
    miner.txpool.PendingWithPreconfTxs(filter)
var unsealedPreconfTxs []*types.Transaction
if len(preconfTxs) > 0 {
    unsealedTxs, err := miner.commitFIFOTransactions(
        ctx, env, preconfTxs, interrupt)
    if err != nil { return err }
    unsealedPreconfTxs = unsealedTxs
}
unSealedPreconfTxsCh <- unsealedPreconfTxs
// If there are unsealed preconfirmation transactions, we cannot
// include new transactions as this could cause other transactions
// to be packaged before preconfirmation transactions
if len(unsealedPreconfTxs) > 0 { return nil }
```

preconf 车道的要点 [27][28]：
- 分类：节点配置 `--txpool.frompreconfs` 与 `--txpool.topreconfs`；from 和 to 都命中白名单才算。
- 提交：`eth_sendRawTransactionWithPreconf`；sequencer 在“虚拟下一块”上预执行，2 秒内返回回执。
- mantle-reth 已移植：一个 `biased select!` 循环交错执行 preconf FIFO 和池内交易，池内交易每个 tick 获得 `block_gas_limit / ticks_remaining` 的配额（`PoolPacer`）。
- 部署：Sepolia 的 proxyd 开放了这个 RPC；主网是否启用、白名单是谁，没有一手来源。

```rust
// mantle-reth/crates/preconf/src/builder/payload_builder.rs:772-781 @f022de0（rustdoc 节选）
/// 4. **Stage 3** — unified `select!` loop with four `biased` branches:
///    - `cancel.wait()` — exits the loop.
///    - `fifo_rx.recv()` — preconf-tx dispatch ...
///    - **Level-triggered pool arm** (`PoolPacer::can_admit()`) — each fire
///      admits exactly one pool best-tx, then returns to `select!`.
///    - `sweep_ticker.tick()` — Raises the [`PoolPacer`] ceiling by
///      [`PoolQuotaSchedule::gas_per_batch`] on each tick ...
```

排序规则可以插在三层：

| 层 | 插入点 | 违规后果 | 改动面 |
|---|---|---|---|
| 合约 | hook / gate / 批次结算 | 交易回滚 | 只改应用 |
| builder | preconf 分类器、`fillTransactions` 分段、`PoolPacer` 配额 | 只损声誉 | op-geth + mantle-reth |
| 协议 | op-node 派生 batch 校验、kona、执行层验块 | batch 丢弃或区块无效 | op-node、kona、SP1 vkey、两套 EL |

路线图 2026 H2 有下列相关条目，都还没完成 [26]：
- pure Reth 切换、Flashblocks
- “预确认策略与路由权限重构为链上动态管理的合约”
- Prop AMM “high-priority cancellations”
- EIP-8130 与 2D nonce

Mantle 的 op-rbuilder fork 的 main 分支没有任何 Mantle 提交；迁移分支自述 112 个测试中 19 个失败 [30]。

```finding F9 high
# Mantle 已有“类别 FIFO 车道排在小费排序之前”的雏形，但它没有上限，只由 sequencer 强制
结论: op-geth 与 mantle-reth 都实现了 preconf 车道：按 from × to 白名单分类，FIFO，排在最前，带回执。op-geth 在还有未封装的 preconf 交易时直接结束填块，所以这条车道可以占满整个区块。验证节点和证明只原样重放 batch，任何排序规则都只由 sequencer 强制。Mantle 现行 builder 方向是自研的 mantle-reth preconf builder，不是 op-rbuilder。
证据: [observed] `worker.go:764-826`、`ordering.go:39-69`、`preconf/tx_pool_config.go:44-67`、`fifo_tx_set.go` [27]；`payload_builder.rs:685-700,768-806,937-960` [28]；`attributes_queue.go:129-132`、`batches.go:176-189`、Sepolia proxyd 配置 [29]；op-rbuilder fork 的 compare 与迁移文档 [30]（M10–M24、M30、M31）。[inferred] M12、M32、D8。[speculative] 主网白名单用途（M22）。
影响: Mantle 不用从零开始。先给 preconf 车道加容量上限，把分类器从“地址白名单”泛化为“合约 × selector × 类别”，再扩成多车道。
```

## Q 检验假设：每类业务需要什么排序 {depth=2}
原始假设是：“payment 需要 FCFS，DeFi 需要小费优先，所以要对整个区块空间再分配。”调研后的判断：方向对，但两边都要细化。

| 业务 | 真正需要 | 车道内规则 | 参照 |
|---|---|---|---|
| payment | 拥堵时仍能进块；不被同类加价插队 | 合格队头 FCFS + 保底 | BSC 保底、Tempo 分类、2D nonce |
| Prop AMM / perps 做市 | 报价不被陈旧成交 | phase-first，小费越不过 | BAM MPP、Hyperliquid、PUR |
| 套利、清算 | 执行权价值回到应用和 LP | 小费拍卖 + MEV tax；清算可用 Atlas / SVR | Angstrom L2、SVR |
| 普通 swap、其他 | 保持兼容 | 有效小费优先（现状） | op-geth 默认 |
| meme launchpad | 热点不挤占他人 | 车道上限；车道内由应用选择 | Tempo 封顶 |

perps 与 meme launchpad 的方向来自 brief；Mantle 官方一手表述只有 payment（2D nonce）、Prop AMM 撤单优先和 RWA / 机构金融 [26]。

```finding F10 high
# 假设部分成立：payment 要“保底 + 合格队头 FCFS + 独立 nonce 域”，DeFi 要拆成维护操作与套利两类
结论: 现成 lane 都不提供 FCFS，所以 payment 的 FCFS 要另加规则；它只能定义为“当前可执行交易的队头之间先到先服务”，并为支付提供独立 nonce key。DeFi 内部，报价更新 / 撤单需要小费越不过的结构性优先；套利才适合小费拍卖，并通过 MEV tax 把价值留给 LP。外层分配容量时不比较小费。
证据: [observed] Tempo、BSC 不提供排序 [22][23]；BAM Phase 1 不可越过 [17]；Mantle 路线图的撤单优先与 2D nonce [26]；ERC-4337 keyed nonce 与 Tempo `nonce_key` [22][25]（L2、L17、X8、M28、M29、L42、L43）。[inferred] D3、D4、D5、D16。
影响: Mantle 的“再分配”应设计成“外层按类别给容量，内层按类别选规则”，而不是两条队列。
```

## R 为 Mantle 设计：五车道调度器 {depth=2}
以下全部是**设计建议**，不是现网能力。Fig 9 是架构。

```excalidraw q="交易从进入 Mantle 到上链，要经过哪些车道和检查？" read="设计建议（简化）。蓝色是 builder 内的组件；绿色是新增的调度器；紫色是链上的策略注册；灰色虚线是后期才考虑的协议层复核。" takeaway="分类只用确定性信息；容量在调度器里按类别控制；只有容量与分段顺序适合将来交给验证者复核。" kind=设计架构
{"grid": {"w": 260, "h": 120}, "defaults": {"w": 200, "h": 60, "fontSize": 16},
 "nodes": [
   {"id": "rpc", "label": "RPC / 私有交易池", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "reg", "label": "链上策略注册", "col": 1, "row": 0, "color": "violet"},
   {"id": "cls", "label": "确定性分类器", "col": 1, "row": 2, "color": "blue"},
   {"id": "q1", "label": "维护车道", "col": 2, "row": 0, "color": "blue"},
   {"id": "q2", "label": "支付车道", "col": 2, "row": 1, "color": "blue"},
   {"id": "q3", "label": "发射车道", "col": 2, "row": 3, "color": "blue"},
   {"id": "q4", "label": "通用 / DeFi 车道", "col": 2, "row": 4, "color": "blue"},
   {"id": "sch", "label": "调度器\n分段 + 容量", "col": 3, "row": 2, "color": "green", "strokeWidth": 3},
   {"id": "fb", "label": "子块 / 区块", "col": 4, "row": 2, "color": "blue"},
   {"id": "ver", "label": "派生 / 证明复核\n（后期）", "col": 4, "row": 4, "color": "gray", "stroke": "dashed"}
 ],
 "edges": [
   {"from": "rpc", "to": "cls"}, {"from": "reg", "to": "cls", "label": "读规则"},
   {"from": "cls", "to": "q1"}, {"from": "cls", "to": "q2"}, {"from": "cls", "to": "q3"}, {"from": "cls", "to": "q4"},
   {"from": "q1", "to": "sch"}, {"from": "q2", "to": "sch"}, {"from": "q3", "to": "sch"}, {"from": "q4", "to": "sch"},
   {"from": "sch", "to": "fb"}, {"from": "fb", "to": "ver", "dashed": true}
 ]}
```

| 车道 | 进入条件（确定性） | 车道内规则 | 容量 |
|---|---|---|---|
| 强制交易 | deposit、L1 info | 协议固定 | — |
| 维护 | 登记的做市 / oracle 合约 × selector × 签名者 | phase-first；每市场每轮只留最新一笔 | 小上限 |
| 支付 | 父状态代币名单 × selector / ABI 长度白名单；access list、7702 授权为空 | 合格队头 FCFS | 保底 + 上限 |
| 发射 | launchpad 合约 × selector | 应用选择：小费或批量 | 上限 |
| 通用 / DeFi | 其余全部 | 有效小费优先（现状） | 剩余空间 |

用贯穿例子走一遍（假设一个子块装得下除 L3 外的全部交易）：

```uml q="贯穿例子里的交易，在五车道调度下按什么顺序上链？" read="设计建议。从上到下是执行顺序。每个子块（或无 Flashblocks 时的每个区块）重复这一顺序。" takeaway="T1 小费再高也排在 Q2、C1 之后；P1、P2 不和抢购比价；L3 因发射车道到达上限，留到下一个子块。"
flowchart TD
  s0["① 强制交易"] --> s1["② 维护车道：Q2（Q1 被替换）→ C1"]
  s1 --> s2["③ 支付车道：P1 → P2（按接收顺序）"]
  s2 --> s3["④ 小费排序段：T1 → A1 → L1 → L2 → A2"]
  s3 --> s4["A1 付 MEV tax 给 LP；A2 机会已无，回滚"]
  s3 --> s5["L3：发射车道达上限 → 下一个子块"]
  style s1 fill:#d3f9d8,color:#222
  style s2 fill:#d3f9d8,color:#222
  style s5 fill:#ffe3e3,color:#222
```

设计要点：
1. **分类只用确定性信息。** Mantle 的稳定币是普通合约，不能照搬 Tempo 的前缀分类。把 BSC 的父状态名单与 Tempo 的 selector 白名单组合起来，并要求 access list、7702 授权为空 [22][23]。只看顶层 `to` 会漏掉经 Router 或 AA 发起的支付。
2. **外层容量不比较小费。** 支付用保底 + 上限，维护和发射用上限，通用车道拿剩余空间。具体比例要从回放中测出，本文不给定值。
3. **维护车道要窄。** 学 BAM：登记资格、限制写集、每市场每轮只留一笔，否则 taker 会把自己伪装成维护操作 [17]。
4. **MEV-tax 应用放在通用车道。** 它们依赖小费排序；在 Mantle 上只能直接用于 MNT/X 池 [5][26]。
5. **冲突处理用模板。** 第一版只提供 FCFS、phase-first、小费、批量四种模板，不开放任意排序程序，避免 ACE 式的环。

```finding F11 medium
# 建议在 mantle-reth builder 里做五车道调度，每个子块当作一轮
结论: mantle-reth preconf builder 已有 `biased select!` 多分支和 `PoolPacer` 配额，可以扩成“每车道一个分支、各自配额、各自比较器”。Flashblocks 上线后，每个子块执行一次“维护 → 支付 → 小费排序段”。路线图里的“预确认策略上链”可以作为车道规则的链上注册表。
证据: [observed] `payload_builder.rs:768-806,937-960` [28]；op-rbuilder 每个子块重新取迭代器 [9]；路线图 [26]（M23、M27、B4、B5）。[inferred] 由 F6–F10 与上述代码推出（D9–D11、D13、D17）。[speculative] 车道比例（D19）。
影响: 第一阶段只改 builder 与 RPC，不改 op-node、kona 和证明。
```

## S 落地路径与安全降级 {depth=2}
```timeline v
阶段 0 | 回放与影子调度 | 用历史交易比较“现状 / 全局 FCFS / 五车道”，测比例
阶段 1 | builder 层五车道 | 给 preconf 车道加上限；泛化分类器；链上策略注册；公开回执与指标
*阶段 2 | 维护车道上线 | PUR 式报价插入，服务 Prop AMM 撤单优先
阶段 3（可选） | 部分规则进协议 | 只放容量与分段顺序，进派生与证明
```

阶段 0 要测的指标：
- 支付：拥堵时 P95 / P99 纳入延迟、拒绝率
- 做市：撤单成功率、点差、深度
- AMM：MEV tax 收入、用户总成本
- 发射：热点时对其他车道的影响
- 链本身：builder 耗时、子块填充率

```callout warn CAUTION
不要让 fallback 静默退回纯小费排序。rollup-boost 式回退只校验 EVM 有效性 [10]。如果自研 builder 出错，备用路径必须执行同样的车道策略；做不到时，暂停受保护的操作，并保留退出路径。
```

```finding F12 medium
# 强制力分阶段：先 builder 承诺 + 回执，后把可复核规则写进协议
结论: 把车道规则写成协议有效性规则，需要同时修改 op-node 派生、kona（含 SP1 vkey 更新）和 op-geth / reth 验块。第一阶段放在 builder，用公开回执和指标建立可信度。只有容量与分段顺序适合后期交给验证者复核；FCFS 的到达时间和不审查只能靠回执、截止时间与 forced inclusion。
证据: [observed] Mantle OP Succinct 依赖 kona 系列 crate [29]；派生只检查交易类型 [29]；rollup-boost 回退不检查排序 [10]；Mantle 2024 fair sequencing 提案的“带批次号回执 + 争议” [31]（M33、M11、B14、L45）。[inferred] D7、D12、D14。[speculative] 回执与候选集的具体形式（D18）。
影响: 先做阶段 0 和阶段 1。阶段 3 只在规则稳定、确有需要时考虑。
```

## T 局限与开放问题 {depth=2}
**本文的局限**：
- Mantle 方案全部是设计建议，没有回放数据，也没有原型。车道比例标为推测。
- Mantle 主网是否启用 preconf 车道、白名单是谁，没有一手来源（推测服务做市商或支付合作方）。
- perps 与 meme launchpad 的需求只来自 brief，没有 Mantle 官方表述。
- Arbitrum PGA 提案是否已执行、Unichain 公开 attestation 是否上线，都没有核实。
- Angstrom L1 的罚没是否上线、L2 在 Unichain 是否有其他地址的部署，没有一手证据。
- 两条 payment lane 在拥堵时是否真的改善了支付延迟，没有实测数据。

**开放问题**：
1. Mantle 的 Flashblocks 用 op-rbuilder + rollup-boost，还是在 mantle-reth preconf builder 上实现？
2. kona-executor 与 mantle-reth 的执行代码是否同源？这决定协议层规则要实现几次。
3. 支付车道的费用隔离（sponsor 预算、按类别计 base fee）是否需要立项？两条现成 lane 都没有先例。
4. 维护车道的资格由谁登记、谁能修改？路线图的“预确认策略上链”还没有公开设计。

## U 方法与证据 {depth=3}
**方法**：本文是“跨生态对比 + 方案设计”。五路并行调研，各自写分册和台账，再合并：
- **A 路**：Angstrom、MEV tax、UniswapX、Atlas
- **B 路**：op-rbuilder、rollup-boost、Unichain、Timeboost、PUR、BAP-710、Express Relay、SVR
- **X 路**：BAM、AMQ、Prop AMM、Hyperliquid、Block SDK、dYdX、Injective
- **L 路**：Tempo / BSC lane、ACE 原文、PEPC 等提案、边界问题
- **M 路**：Mantle 出块路径、preconf 车道、路线图、插入点

每个论断都追到规范、固定 commit 的源码、官方文档或链上读取。外部调研只当线索。D 前缀是主会话的设计综合，全部为 inferred 或 speculative。

**固定版本**：

| 仓库 | commit |
|---|---|
| SorellaLabs/angstrom · l2-angstrom | `9821659` · `81bd418` |
| flashbots/op-rbuilder · rollup-boost | `4f1bec3` · `87589f8` |
| flashbots/priority-update-registry | `8701e8e` |
| skip-mev/block-sdk · tempoxyz/tempo | `25c042e` · `87bd32a` |
| bnb-chain/bsc · BEPs | `8cc60b2` · `e9b2be3` |
| mantlenetworkio/op-geth | `e33cd26` |
| mantle-xyz/reth · mantle-v2 | `f022de0` · `da45c31` |

**外部调研的修正**：

| 外部调研的说法 | 实际情况 |
|---|---|
| Mantle 要从零加车道 | no 已有 preconf FIFO 车道 |
| 优先评估 op-rbuilder 接入 | no Mantle fork 的 main 无改动 |
| Pyth Express Relay 是现行选项 | no 2026-07 已停运 |
| Timeboost 是现行机制 | warn 有 PGA 替换提案 |
| Angstrom L2 部署在 Unichain | warn 链上查不到 |
| Unichain 排序可验证 | warn 只证明 TEE 身份 |
| ACE 中的 Atlas 是 FastLane | no 是 Ellipsis 的 SVM L2 |
| Block SDK 验证 lane 规则 | warn 默认不验证 |
| MEV tax 公式 k × 120,000 × … | ok 正确 |
| Tempo 规范不要求 FCFS | ok 正确 |

**主会话抽查**：5 条 observed 论断重新打开源码或网页核对，全部成立：`worker.go:770-781`、`AngstromL2.sol:102-112,195-200`、`constants.rs:77`、Mantle 路线图原文、PUR 链上代码。

## V 复现 {depth=3}
需要 `git`、`curl`、`cast`（Foundry）。

1. 查看 Mantle op-geth 的 preconf 分段：

```bash
git clone --filter=blob:none \
  https://github.com/mantlenetworkio/op-geth && cd op-geth
git checkout e33cd26cda583e42196b1be82a79b70258be49af
sed -n 764,781p miner/worker.go
# 预期：commitFIFOTransactions，以及
# "we cannot include new transactions" 注释
```

2. 读取 Angstrom L2 在 Base 上的税参数：

```bash
cast call 0x02C17501E53fBB7EB0E243c74AfC6a9e01C265CF \
  "swapMEVTaxFactor()(uint256)" \
  --rpc-url https://mainnet.base.org
# 预期：200（2026-10-11）
```

3. 确认 PUR 已部署在以太坊主网：

```bash
cast code 0xda7afeed021eafc1c1af9c362de477dad0396b81 \
  --rpc-url https://ethereum-rpc.publicnode.com | wc -c
# 预期：约 8172（4085 字节的十六进制 + 0x 前缀）
```

4. 查看 Mantle 路线图里的排序相关条目：

```bash
curl -sL https://docs.mantle.xyz/network/system-information/roadmap.md \
  | grep -n -i "cancel\|2D Nonce\|Flashblocks\|pure Reth"
```

5. 查看 Tempo 的非支付上限：

```bash
git clone --filter=blob:none https://github.com/tempoxyz/tempo
cd tempo && git checkout 87bd32a63d60de656a7571025048420cc1e41758
grep -n "GENERAL_GAS_LIMIT" crates/hardfork/src/constants.rs
# 预期：TEMPO_T1_GENERAL_GAS_LIMIT: u64 = 30_000_000
```

## W 术语表 {depth=2}
```glossary
ASS | application-specific sequencing | Sorella 的说法：应用把自身状态的排序权交给指定的排序方，结果与区块内顺序无关。 | 不是共享 sequencer
ACE | application-controlled execution | 应用对与它交互的一批交易施加排序规则。ASS 是它的一条实现路线。 | 不是 Chainlink ACE
sequencer | 排序器 | rollup 里决定交易顺序并出块的一方；Mantle 只有一个。 | 不是验证节点
builder | 组块者 | 从交易池选交易、组成区块的组件；在 Mantle 里由 sequencer 运行。 | 不是 bundler
有效小费 | effective tip | `min(maxPriorityFee, maxFee − baseFee)`，小费排序的依据。 | 不是 gas price
FCFS | 先到先服务 | 只按到达 sequencer 的时间排序，加价不能插队。 | 不是“同价按时间”
cancel priority | 撤单优先 | 同一批内，撤单先于吃单执行。 | 不是撤单免费
lane | 车道 | 给一类交易的 gas 约束：上限或保底，可附带车道内排序规则。 | 不是独立的链
phase-first | 分段优先 | 每轮先执行规定类别，再执行其他交易；小费不能改变段的先后。 |
MEV tax | 应用税 | 应用按交易优先费收取递增的税，把竞争出价转给应用。 | 不是协议费用
PUR | Priority Update Registry | Flashbots 的共享合约，做市商把报价写进 lane，builder 负责把更新插在读者之前。 | 不是 BSC 的 relayer
BAM | Block Assembly Marketplace | Jito 在 Solana 上的链下排序层，节点运行在 TEE 里。 | 不是 Solana 共识
MPP | Maker Priority Plugin | BAM 的插件：做市商报价更新每轮最先执行，小费越不过。 |
PGA | priority gas auction | 短轮次内按优先费排序；Arbitrum 提议用它替换 Timeboost。 | 不是 Timeboost
Flashblocks | 子块 | 把一个区块切成 200–250 ms 的子块并逐个发布预确认。 | 不是独立区块
preconf 车道 | 预确认车道 | Mantle 客户端里按白名单分类、FIFO 执行、排在最前的交易类别。 |
```

## X 参考资料 {depth=2}
1. [Bahrani & Neuder：Application-controlled execution（ethresear.ch/t/23977）](https://ethresear.ch/t/application-controlled-execution-a-case-study-on-cancel-prioritization/23977) — ACE 定义、四种设计、规则冲突与复杂度、第 3 楼回复。**PRIMARY**
2. [Sorella：A New Era of DeFi with App-Specific Sequencing](https://sorellalabs.xyz/writing/a-new-era-of-defi-with-ass) — ASS 的三个性质与 liveness 假设。**PRIMARY**
3. [Angstrom 文档](https://docs.angstrom.xyz/) 与 [白皮书 v1](https://app.angstrom.xyz/whitepaper-v1.pdf) — L1 锁、链下撤单、抗审查与罚没、L2 机制与部署表。**PRIMARY**
4. [SorellaLabs/angstrom @9821659](https://github.com/SorellaLabs/angstrom/tree/98216596f3df0e40f9558dada56528f6ae6bb25a) — `UnlockHook.sol`、`TopLevelAuth.sol`、`Angstrom.sol`；主网 hook 读取。**PRIMARY**
5. [SorellaLabs/l2-angstrom @81bd418](https://github.com/SorellaLabs/l2-angstrom/tree/81bd4189f4f86346c915e9e8c80bb98b9b52b123) — `AngstromL2.sol` 税公式与原生币限制；Base 链上参数。**PRIMARY**
6. [Paradigm：Priority Is All You Need](https://www.paradigm.xyz/writing/priority-is-all-you-need) — MEV tax 与四条排序规则、Full blocks 局限。**PRIMARY**
7. [UniswapX：Filling on OP Stack（Deprecated）](https://developers.uniswap.org/docs/liquidity/uniswapx/filling/priority-chain/filling-on-op-stack) 与 [UniswapX @eb7ce07](https://github.com/Uniswap/UniswapX/tree/eb7ce077036258b9510b42ad37aa920cf3aaf308) — priority 路径机制与废弃说明。**PRIMARY**
8. [FastLane Atlas @083dccd](https://github.com/FastLane-Labs/atlas/tree/083dccd05a2c92e0e9cae90ac404504f741bc493) 与 [Ellipsis Atlas 博客](https://atlasxyz.medium.com/) — metacall 顺序；两个 Atlas 的区分。**PRIMARY**
9. [flashbots/op-rbuilder @4f1bec3](https://github.com/flashbots/op-rbuilder/tree/4f1bec3008e8505ea70f504d26d35ea489065bff) 与 [mantle-xyz/reth @f022de0 的 reth 交易池](https://github.com/mantle-xyz/reth/tree/f022de0f62e9f94628446cd8bc800398a24e4bfb) — 选择循环、子块预算、`CoinbaseTipOrdering`。**PRIMARY**
10. [flashbots/rollup-boost @87589f8](https://github.com/flashbots/rollup-boost/tree/87589f8b3043a0e46f7995c8fcd225132d2f73a8) — `server.rs`、`specs/flashblocks.md`、`specs/flashtestations.md`。**PRIMARY**
11. [Uniswap 博客：Rollup-Boost is live on Unichain](https://blog.uniswap.org/rollup-boost-is-live-on-unichain) 与 [Flashblocks are live](https://blog.uniswap.org/flashblocks-are-live) — TEE 小费排序与子块上线时间。**PRIMARY**
12. [Arbitrum：How Timeboost works](https://docs.arbitrum.io/how-arbitrum-works/timeboost/gentle-introduction) 与 [论坛 30942：PGA 提案](https://forum.arbitrum.foundation/t/30942) — Timeboost 规则与替换提案。**PRIMARY**
13. [flashbots/priority-update-registry @8701e8e](https://github.com/flashbots/priority-update-registry/tree/8701e8e13d74beef9126c3e1fbbe89c64ce0c0f6) 与 [ERC-8324 PR #1852](https://github.com/ethereum/ERCs/pull/1852) — PUR 接口、threat model、主网部署。**PRIMARY**
14. [BAP-710 @e9b2be3](https://github.com/bnb-chain/BEPs/blob/e9b2be3b0021c9407376351d8f57ef9b90db5185/BAPs/BAP-710.md) — PropAMM relayer 与 PUR 改版。**PRIMARY**
15. [Pyth：Express Relay](https://docs.pyth.network/express-relay) — 许可机制与 OP-PIP-124 停运。**PRIMARY**
16. [Chainlink：SVR feeds](https://docs.chain.link/data-feeds/svr-feeds) — 两条路径与 Atlas 接入。**PRIMARY**
17. [BAM：Maker Plugin](https://bam.dev/docs/bam/maker-plugin/how-it-works/) 与 [jito-labs/bam-protos @642c49a](https://github.com/jito-labs/bam-protos/tree/642c49ae6da23dcbc6c0c621288d4479799a8910) — 两阶段调度、登记规则、调度流协议；explorer 覆盖率。**PRIMARY**
18. [Temporal：ACE through AMQs](https://www.temporal.xyz/writing/application-controlled-execution-ace-through-asynchronous-market-queues-amqs) 与 [Helius：Solana's Proprietary AMM Revolution](https://www.helius.dev/blog/solanas-proprietary-amm-revolution) — 程序内队列；低 CU 更新的经济型优先（后者为二手来源）。
19. [Hyperliquid：Order book](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/order-book) — batch 内三类排序。**PRIMARY**
20. [skip-mev/block-sdk @25c042e](https://github.com/skip-mev/block-sdk/tree/25c042e0b7c4841b14f8bed11fb6c34d6e13248c) — lane 接口、验证不变量、默认不验证。**PRIMARY**
21. [Injective：Trading](https://docs.injective.network/defi/trading/index) 与 [dYdX：A New Architecture to Mitigate MEV](https://www.dydx.xyz/blog/architecture-to-mitigate-mev) — FBA；dYdX 方案只是提案。**PRIMARY**
22. [Tempo：Payment Lane Specification](https://docs.tempo.xyz/protocol/blockspace/payment-lane-specification) 与 [tempoxyz/tempo @87bd32a](https://github.com/tempoxyz/tempo/tree/87bd32a63d60de656a7571025048420cc1e41758) — 规范、TIP-1045 / 1010 / 1067、分类与验块代码、`nonce_key`。**PRIMARY**
23. [BEP-703 @e9b2be3](https://github.com/bnb-chain/BEPs/blob/e9b2be3b0021c9407376351d8f57ef9b90db5185/BEPs/BEP-703.md) 与 [bsc `core/paymentlane` @8cc60b2](https://github.com/bnb-chain/bsc/tree/8cc60b246c8c99d46d51846765d35238112a1a5c/core/paymentlane) — 保底规则、分类、未激活状态。**PRIMARY**
24. [PEPC](https://ethresear.ch/t/unbundling-pbs-towards-protocol-enforced-proposer-commitments-pepc/13879)、[EVM Native Sequencing Rules](https://ethresear.ch/t/evm-native-sequencing-rules/19606)、[EIP-7805 FOCIL](https://eips.ethereum.org/EIPS/eip-7805) — 协议级承诺与纳入约束提案。**PRIMARY**
25. [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) 与 [EIP-8130](https://eips.ethereum.org/EIPS/eip-8130) — keyed nonce、2D nonce。**PRIMARY**
26. [Mantle 文档：Architecture](https://docs.mantle.xyz/network/system-information/architecture)、[Roadmap](https://docs.mantle.xyz/network/system-information/roadmap)、[Arsia](https://docs.mantle.xyz/network/introduction/whats-new-in-mantle-v2-arsia) — 私有池与费用排序、H2 计划、费用改动。**PRIMARY**
27. [mantlenetworkio/op-geth @e33cd26](https://github.com/mantlenetworkio/op-geth/tree/e33cd26cda583e42196b1be82a79b70258be49af) — `miner/worker.go`、`miner/ordering.go`、`preconf/`。**PRIMARY**
28. [mantle-xyz/reth @f022de0](https://github.com/mantle-xyz/reth/tree/f022de0f62e9f94628446cd8bc800398a24e4bfb/mantle-reth/crates/preconf) — mantle-reth preconf builder。**PRIMARY**
29. [mantle-xyz/mantle-v2 @da45c31](https://github.com/mantle-xyz/mantle-v2/tree/da45c315d800e5040ee8625d46319a03d4064803/op-node/rollup) 与 [mantle-xyz/networks](https://github.com/mantle-xyz/networks) — 派生不检查顺序、kona 依赖、Sepolia preconf RPC。**PRIMARY**
30. [mantle-xyz/op-rbuilder](https://github.com/mantle-xyz/op-rbuilder) — fork 状态与迁移文档。**PRIMARY**
31. [Mantle Research：Fair Sequencing（Wayback 2026-03-17 快照）](https://web.archive.org/web/20260317033821/https://www.mantle.xyz/blog/research/fair-sequencing) — 2024 年 FCFS 分批 + 回执 + VRF 提案；原 URL 已重定向。**PRIMARY**
32. [L2BEAT：Mantle](https://l2beat.com/scaling/projects/mantle) — Stage 0、OP Succinct、blobs、forced inclusion。**PRIMARY**
33. ChatGPT Deep Research：`research/ass-deep-dive.md` — 外部调研，只作线索。

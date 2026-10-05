---
template: research
title: Meme Launchpad：原理、演进与 Agentic 设计
subtitle: Launchpad 让合约当对手盘，所以发币零垫资；各代产品主要在消除迁移攻击面。Agentic 方案要补的是链上可验证的权限。
cols: 4
type: 技术调研 · onboarding
audience: 懂 EVM / Solidity 的开发者，第一次接触 meme launchpad 和 agent 钱包
scope: 机制与生命周期、主要产品复盘、Mantle agent 第一公民 launchpad 的设计依据
evidence: 184 条论断台账（observed 133 / inferred 34 / speculative 17），一手来源访问于 2026-10-05
date: 2026-10-05 · v1
---
结论先行：meme launchpad 让合约自己当对手盘，报价用一条加了[[虚拟储备]]的恒定乘积曲线。所以创作者不用垫资，曲线阶段也没有撤池通道。各代产品的主要改进，是消除毕业时的[[迁移]]攻击面（[F1](#F1)）。开盘[[狙击]]、补贴退出后的流量崩塌、单币价值稀释，至今没有解决（[F2](#F2)、[F5](#F5)、[F6](#F6)）。“让 agent 发币”Bankr 已经做到。Agentic 方案要补的是权限：把它写成链上可验证的 [[session key]] 沙箱（[F8](#F8)）。

## A 一个 launchpad 由哪些部分组成 {sheet meta="components"}
```tree list
`Factory` 发币工厂 | 一笔交易创建代币和曲线
`Curve` 曲线合约（内盘） | 合约当对手盘，按公式报价
`Graduation` 毕业判定 | 条件满足后冻结曲线
`AMM pool` 外盘池 | 毕业后自由交易
`Locker` LP 处置 | LP 销毁或永久锁定
`Fee router` 费用路由 | 创作者、协议、LP 分账
```

## B 曲线公式（pump.fun 经典 SOL 曲线） {sheet span=2 meta="annotated"}
```annot
# 恒定乘积 + 虚拟储备 | 单位：SOL、代币
([x]{已募真实 SOL，开盘为 0} + [30]{虚拟 SOL：给出非零开盘价}) × ([y]{曲线上剩余可售代币，开盘 7.931 亿} + [2.799 亿]{!虚拟代币：让最后一枚的价格有限}) = [k]{3.219e10，全程不变}
> 开盘价 2.80e-8 SOL；可售代币卖完时 x ≈ 85 SOL，价格是开盘的 14.7 倍
```

## C 三类毕业形态 {sheet meta="graduation"}
| 类型 | 代表 | 迁移攻击面 |
|---|---|---|
| A 迁到外部 DEX | four.meme（2025-03 前） | no 可被抢先建池 |
| B 原子迁到自有池 | pump.fun、Pons V2 | ok 收窄 |
| C 不设曲线 | Clanker、Zora、PAIR | ok 没有迁移 |

## D 关键数字（pump.fun，2026-10） {sheet span=2 meta="numbers"}
| 量 | 值 | 来源 |
|---|---|---|
| 总供应 / 曲线可售 | 10 亿 / 7.931 亿枚 | 程序参数 [1] |
| 毕业所需真实 SOL | 约 85 SOL | 由参数推算 |
| 曲线阶段费率 | 1.25%（创作者 0.30% + 协议 0.95%） | 官方费率页 [2] |
| 创建 / 毕业费 | 0 / 0.015 SOL | 官方费率页 [2] |

## E 演进时间线 {sheet span=2 meta="2024–2026"}
```timeline
2024-05 | pump.fun 权限事故 | 前员工滥用 withdraw 权限，约 $1.9M
2024-08 | pump.fun 建币免费 | 创作者首次获得奖励（0.5 SOL）
*2025-02 | four.meme 被盗 | 迁移目标池未校验价格，约 $183K
2025-03 | PumpSwap 上线 | 毕业迁入自家 DEX，迁移费 6 SOL → 0
2025-05 | 创作者永续分成 | pump.fun 每笔交易分给创作者
2025-10 | Farcaster 收购 Clanker | 2026-01 再随 Farcaster 归 Neynar
2026-02 | Base 下线 Creator Rewards | 补贴退出
2026-07 | Robinhood Chain 主网 | Pons、PAIR 用股票代币作 quote
2026-08 | Printr 停止运营 | 官方原因：资本与分发不足
*2026-09 | Robinhood gas 补贴到期 | launchpad 成交回落（二手数据）
```

## F 结论 {sheet span=4}
```callout ok 先懂曲线和毕业，再谈 agent
1）机制：合约用虚拟储备当对手盘，创作者零垫资；毕业后 LP 销毁或锁死，撤池在技术上不可能。2）教训：毕业时把资金搬进外部池是最大的工程风险；补贴买不到留存。3）Agentic：缺口在权限，不在链；先在 Mantle L2 用应用层账户抽象起步，F1–F3 实测成立后再谈 L3。
```

## G 如何阅读 {depth=1}
```callout info 默认你已知道（本文不解释）
- ERC-20 代币、合约调用、事件
- 交易要付 gas，出块有顺序，mempool 中的交易可以被别人看到
- DEX 上可以用一种代币换另一种代币
```
- **5 分钟**：看总览（A–F）和导语。
- **30 分钟（要上手机制的开发者）**：按顺序读 [前置知识](#panel-I)、[生命周期](#panel-J)、[毕业的三种实现](#panel-K)。
- **30 分钟（要参与 agentic 设计）**：读 [为什么让 agent 当第一公民](#panel-N)、[方案设计](#panel-O)、[设计取舍](#panel-P)。
- **完整**：再读 [方法与证据](#panel-R)，它列出调研方法和被修正的资料。

## H 背景动机 {depth=2}
**问题**：在传统 DEX 上发一个新币，创作者要自己垫资做双边 [[LP]]，还能随时撤池。散户怕撤池，bot 抢第一个区块。Launchpad 用合约承担做市，把这三个问题变成了代码问题。

**为什么现在**：
- Mantle 上的两次尝试都已停止运营：Funny Money（2025-02 推出，定位 AI agent launchpad 与 DeFAI 终端）和 Printr（多链 launchpad，2026-08 停止运营）[23][24]。
- Agent 发币和交易已在 Base 和 Robinhood Chain 上跑通（Bankr、Clanker）[25][13]。
- Mantle 正在规划 agent 第一公民的 launchpad，需要一份让开发者能接手讨论的材料。

**范围**：机制与数学、完整生命周期、主要产品复盘、结构性缺陷、agentic 方案的设计依据。

**非目标**：Tape（以 xStocks 计价的 launchpad 方案）；合规细节；排期与 KPI；投资建议。

**贯穿全文的例子**：pump.fun 的经典 SOL 曲线。它的参数公开、可复算，后面的每个面板都先在这条曲线上讲，再推广。

## I 前置知识 {depth=2}
```excalidraw q="读懂 launchpad 和 agentic 方案，需要先懂哪些概念？按什么顺序？" read="箭头表示先学 → 后学；灰色虚线框是默认已知；绿色是本文的两个主题。" takeaway="B-0 → B-1 讲曲线；B-2 → B-3 讲新一代的池子；B-5 是 agentic 部分的前提。" name=prereq-map kind=前置知识地图
{"grid": {"w": 300, "h": 120}, "defaults": {"w": 190, "h": 60},
 "nodes": [
   {"id": "erc", "label": "ERC-20 与合约（已知）", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "gas", "label": "gas 与出块（已知）", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 恒定乘积 AMM", "col": 1, "row": 0, "color": "blue"},
   {"id": "b2", "label": "B-2 集中/单边流动性", "col": 1, "row": 1, "color": "blue"},
   {"id": "b4", "label": "B-4 狙击与 MEV", "col": 1, "row": 2, "color": "blue"},
   {"id": "b5", "label": "B-5 账户抽象", "col": 1, "row": 3, "color": "blue"},
   {"id": "b1", "label": "B-1 虚拟储备曲线", "col": 2, "row": 0, "color": "blue"},
   {"id": "b3", "label": "B-3 v4 hook", "col": 2, "row": 1, "color": "blue"},
   {"id": "life", "label": "生命周期与产品", "col": 3, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "agent", "label": "Agentic 方案", "col": 3, "row": 3, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "erc", "to": "b0"}, {"from": "b0", "to": "b1"}, {"from": "b0", "to": "b2"},
   {"from": "b2", "to": "b3"}, {"from": "gas", "to": "b4"}, {"from": "gas", "to": "b5"},
   {"from": "b1", "to": "life"}, {"from": "b3", "to": "life"}, {"from": "b4", "to": "life"},
   {"from": "b5", "to": "agent"}, {"from": "life", "to": "agent"}
 ]}
```

```prereq B-0 l1 5min
# 恒定乘积 AMM（constant product AMM）
是什么: 池子里有两种资产 x 和 y，交易前后保持 x × y = k。买走 y 越多，剩下的 y 越贵。
为什么需要: launchpad 的曲线就是这个公式，只是把储备的一部分换成了“虚拟”数字。
例子:
~~~
池子：x = 10 SOL，y = 1000 枚，k = 10000
买入 1 SOL → x = 11，y = 10000/11 ≈ 909.1，得到约 90.9 枚
~~~
误解: 误解：价格由人工挂单决定。事实：价格只由两边储备的比值决定。
深入: [9] Uniswap v4 架构文档
```

```prereq B-1 l1 8min
# 虚拟储备曲线（virtual-reserve bonding curve）
是什么: 在恒定乘积公式的两边各加一个常数，作为不存在的“虚拟”储备。合约用这条曲线给每一笔买卖报价。
为什么需要: 纯真实储备下，开盘时 SOL 储备为 0，价格就是 0，第一笔买单能几乎免费买空；最后一枚代币的价格又趋于无穷，曲线卖不完。虚拟储备同时解决这两个问题。
例子:
~~~
pump.fun：(x + 30) × (y + 2.799e8) = 3.219e10
开盘价 30 / 1.073e9 ≈ 2.80e-8 SOL
~~~
误解: 误解：虚拟储备是平台垫的钱。事实：它只是公式里的常数，任何人都取不走。
深入: [1] pump-public-docs，Global 与 BondingCurve 两节
依赖: B-0
```

```prereq B-2 l1 6min
# 集中流动性与单边流动性（concentrated / single-sided liquidity）
是什么: 集中流动性让 LP 只在一个价格区间内做市。单边流动性是区间全部位于现价一侧，只放一种资产。
为什么需要: Clanker、Zora、PAIR 把全部新币放成单边头寸，价格上涨时才吸收 quote。这一个头寸就起到曲线的作用，所以不需要毕业。
误解: 误解：单边池开盘时有对手盘。事实：池里只有新币，第一个买家没有任何竞争价格。
深入: [9] Uniswap v4 概念文档
依赖: B-0
```

```prereq B-3 l1 8min
# Uniswap v4 hook
是什么: 建池时绑定的一个合约，在 swap、加减流动性前后被调用。它能改写 swap 的数量和手续费。
为什么需要: 衰减税、持仓上限、费用路由和“池内毕业”都写在 hook 里。所有池子由一个 [[PoolManager]] 管理，建池只是一次状态更新。
例子:
~~~
hook 地址的低 14 位是权限位
beforeSwap = 1 << 7
beforeSwapReturnDelta = 1 << 3
~~~
误解: 误解：建池后可以换 hook。事实：hook 是池子标识的一部分，不能更换。
深入: [8] v4-core `Hooks.sol`
依赖: B-2
```

```prereq B-4 l1 5min
# 狙击与 MEV（sniping / MEV）
是什么: 狙击是 bot 在新币开盘的第一个区块抢先买入。[[MEV]] 是出块排序带来的额外收益，例如[[夹子]]交易。
为什么需要: 虚拟储备曲线非常“前置”：净入 30 SOL 时，已经卖出 53.65% 的总供应。所以越早买，拿到的份额越大。
误解: 误解：狙击是治理问题，禁掉 bot 就行。事实：它来自曲线形状，协议只能用延迟、衰减税、持仓上限来缓解。
深入: [13] Clanker MEV 模块文档
```

```prereq B-5 l1 8min
# 账户抽象与 session key（account abstraction / session key）
是什么: 账户抽象让账户本身是合约，能自定义签名校验规则。[[session key]] 是主人签发的临时密钥，只能在规定的合约、函数、额度和时间内使用。
为什么需要: agent 需要自己发币和交易，但不能拿到主人的根私钥。[[EIP-7702]] 让普通 EOA 委托给合约代码；[[ERC-4337]] 提供 [[Paymaster]] 代付 gas 和[[二维 nonce]]。
误解: 误解：EIP-7702 自带额度和白名单。事实：7702 只写入委托；限额要靠委托合约或 [[ERC-7579]] 模块实现。
深入: [30] EIP-7702 规范
```

## J 生命周期：一个代币从创建到外盘 {depth=2}
```uml q="一个 pump.fun 代币会经历哪些状态？什么条件触发迁移？" read="状态名用合约里的字段。Dead 不是合约状态，只表示长期无人交易。" takeaway="毕业由“可售代币卖完”这一个数量条件触发，不看美元价格，也不需要预言机。"
stateDiagram-v2
  state "曲线交易（内盘）" as Trading
  state "已完成 complete=true" as Complete
  state "已迁移（外盘）" as Migrated
  state "死币" as Dead
  [*] --> Trading : create_v2（可同笔 dev buy）
  Trading --> Trading : buy / sell 按曲线报价
  Trading --> Complete : real_token_reserves == 0
  Trading --> Dead : 长期无人买入
  Complete --> Migrated : migrate（任何人可调用，幂等）
  Migrated --> Dead : 流动性枯竭
  note right of Complete : 曲线拒绝后续 buy / sell
```

```uml q="创建、交易、毕业的每一步，谁调用了谁？" read="以 pump.fun 为例；步骤 5–8 是毕业。" takeaway="迁移在一笔交易里完成：建池、注入储备、销毁 LP。没有可以插队的中间状态。"
sequenceDiagram
  autonumber
  participant C as 创作者
  participant B as 狙击 bot
  participant U as 交易者
  participant P as Pump 程序
  participant M as 迁移执行者
  participant S as PumpSwap
  C->>P: create_v2 + buy_v2（同一笔，dev buy）
  P-->>B: CreateEvent（链上订阅）
  B->>P: buy（同一 slot 或下一 slot）
  U->>P: buy / sell，每笔收 1.25% 手续费
  U->>P: 最后一笔 buy
  P->>P: real_token_reserves == 0，complete = true
  M->>P: migrate(mint)
  P->>S: 建池：约 2.069 亿枚 + 约 85 SOL
  S-->>P: LP token，全部销毁
  U->>S: 外盘 buy / sell
```

**曲线价格示意**（pump.fun 经典 SOL 曲线，由公式算出 [1]）：

| 净入 SOL | 已售占总供应 | 价格（SOL） | 相对开盘 |
|---|---|---|---|
| 0 | 0% | 2.80e-8 | 1× |
| 10 | 26.82% | 4.97e-8 | 1.78× |
| 30 | 53.65% | 1.12e-7 | 4.0× |
| 60 | 71.53% | 2.52e-7 | 9.0× |
| 85.0（毕业） | 79.31% | 4.11e-7 | 14.7× |

前 30 SOL 就卖出了一半以上的供应，最后 25 SOL 只卖出约 7.8%。这就是开盘狙击有利可图的数学原因（[B-4](#B-4)）。

**每个阶段的要点**：
1. **创建**：创建免费 [2]。创建和首笔买入可以放在同一笔交易，这就是 [[dev buy]] [4]。
2. **曲线交易**：每笔 1.25% 手续费，创作者 0.30%、协议 0.95% [2]。合约层没有反狙击，只有滑点参数 `max_sol_cost` / `min_sol_output` [1]。
3. **毕业判定**：在 buy 指令末尾检查 `real_token_reserves == 0` [1]。常说的“$69k 毕业”只是 410.88 SOL 毕业市值按当时 SOL 价格换算的结果。
4. **迁移**：`migrate` 无需许可且幂等，任何人都能调用 [1]。早期由链下服务器把资金搬到 Raydium（`withdraw` 指令，已禁用）[1]。2025-03-20 起迁入自家 [[PumpSwap]]，迁移费从 6 SOL 降到 0 [5]。
5. **外盘**：毕业后的 [[canonical 池]]按市值分档收费 [2][4]。
6. **长尾**：大多数币停在曲线上，或毕业后归零。在 v4 上，建池只是 PoolManager 的一次状态更新，不部署新的池合约 [9]。

```callout warn CAUTION：2026 年的 pump.fun 不再完全符合经典曲线
资料作者在 2026-09 抽样到只注入 0.086 SOL 的迁移，而且代币总供应不等于 10 亿。原因可能是 Mayhem 模式（AI agent 在前 24 小时交易），本文没有核实。集成 pump.fun 时读链上账户，不要硬编码常数。
```

## K 毕业的三种实现 {depth=2}
```uml q="毕业时资金走哪条路？攻击面在哪里？" read="红色虚线是攻击路径。三类按资金路径划分，不按“是不是 v4”划分。" takeaway="只要毕业时要用一个任何人都能抢先初始化的外部池，就存在被预建池的风险。"
flowchart TB
  subgraph A["A：迁到外部 DEX"]
    direction LR
    a1["曲线合约"] -->|"提款 + 加流动性"| a2[("外部 DEX 池")]
    x["攻击者"] -.->|"抢先建池并设价"| a2
  end
  subgraph B["B：原子迁到自有池"]
    direction LR
    b1["曲线合约"] -->|"同一笔交易"| b2[("自有 AMM 池")]
    b2 --> b3["LP 销毁或锁死"]
  end
  subgraph C["C：不设曲线"]
    direction LR
    c1["Factory"] -->|"一笔部署"| c2[("单边 LP 在最终池")]
  end
  A ~~~ B
  B ~~~ C
  linkStyle 1 stroke:#d33,stroke-dasharray:4
```

| 类型 | 代表 | 资金路径 | 残留问题 |
|---|---|---|---|
| A 迁到外部 DEX | pump.fun 早期（Raydium）、four.meme | 跨协议建池 | 预建池、链下执行者 |
| B 原子迁到自有池 | pump.fun 现在、Pons V2 | 单笔交易内建池并处置 LP | 毕业瞬间的信息冲击 |
| C 不设曲线 | Clanker、Zora、Flaunch、PAIR | 没有搬运 | 开盘狙击 |

- **C 类为什么可行**：v4 用一个 [[PoolManager]] 管所有池子，建池只是状态更新；hook 可以在 `beforeSwap` 里覆盖手续费，这正是 Clanker 和 Zora 实现衰减税的接口 [8][9]。
- **“hook 内曲线 + 就地翻转”**：技术上可行。hook 有 `beforeSwapReturnDelta` 权限，可以改写 swap 的数量，用自定义曲线报价 [8]。但调研没有找到按这种方式上线的生产产品（推测，检索不完整）。Pons V2 是“独立曲线合约 + 毕业时铸 v4 头寸”，属于 B 类 [18]。
- **“v4 方案零 MEV”不成立**：池内相变只消除了“迁移那一下”的窗口。曲线阶段的抢跑和夹子仍然存在。

```uml q="four.meme 2025-02 是怎么被盗的？" read="攻击者在毕业前抢先建好目标池，并把价格设成错误值。" takeaway="根因是迁移时不校验已存在池子的价格，不是重入。"
sequenceDiagram
  autonumber
  participant A as 攻击者
  participant F as four.meme 迁移合约
  participant V as PancakeSwap V3
  A->>V: 预建 meme/WBNB 池，价格约为正确值的 3.68e14 倍
  A->>F: 刷单把曲线买满，触发毕业
  F->>V: 池已存在，不校验价格，注入 2 亿枚 + 约 24 WBNB
  A->>V: 用少量 meme 换走全部 WBNB
  Note over A,V: 约 $183K；约 20 个币被同一手法攻击
```

## L 主要产品复盘 {depth=2}
**发行与毕业**：

| 产品 | 发行方式 | 毕业 | 2026-10 现状 |
|---|---|---|---|
| pump.fun（Solana） | 虚拟储备曲线 | 卖完 → 原子迁入 PumpSwap | 支持 USDC 作 quote [2] |
| four.meme（BSC） | 虚拟储备曲线，多种 quote | 按 quote 数量 → PancakeSwap V2，LP 销毁 | 2025 年两次被盗后改架构 [12] |
| Clanker（Base 等） | 全部供应放成单边 v4 LP | 无 | 先后归 Farcaster、Neynar [14][15] |
| Zora（Base → Solana） | v4 hook + Doppler 多段头寸 | 无 | 2026-02 起扩展到 Solana [16] |
| Flaunch（Base） | 30 分钟固定价 → 全区间 | 无 | 手续费大幅萎缩（资料数据） |
| Pons V2（Robinhood Chain） | 同 quote 曲线 | 铸全区间 v4 头寸进 locker | 补贴到期后降温（二手）[18][37] |
| PAIR（Robinhood Chain） | 1–5 个股票 quote 单边池 | 只有信息性标志 | 周末出现过 35 倍脱锚 [19] |

**费用与开盘保护**：

| 产品 | 每笔费用与创作者份额 | 开盘保护 |
|---|---|---|
| pump.fun | 1.25%，创作者 0.30% | 无，只有滑点参数 |
| Clanker | 创作者费 + 其 20% 的协议费 | 衰减税 80% → 5%（推荐 30 秒） |
| Zora | 1%，多方分成（文档未写比例） | 狙击税 99%，10 秒衰减 |
| Flaunch | 1%，创作者 0–100%，其余进 [[PBW]] | 固定价窗口 |
| Pons V2 | 1%，创作者约 35%（资料数据） | 参数在资料与 README 间矛盾 |
| PAIR | 1%，创作者 70% | 5 个区块内单笔 ≤5.5%、单钱包 ≤5.0% |
| Bankr | 合计 1.75%，创作者 0.665% | 14 秒衰减 + 5 分钟内持仓 ≤2% |

**Mantle 本地**：Funny Money 由 Mantle 在 2025-02-18 推出，定位是 AI agent launchpad 和 DeFAI 终端；100 万 MNT 是配套交易竞赛的奖池 [23]。官网现在只写“sunsetting its trading platform”，停运日期没有一手来源。Printr 是多链 launchpad，2025-10 宣布融资 $4.5M（Mantle EcoFund 参投）；2026-08-17 宣布收尾，08-31 前停止运营，官方原因是资本与分发不足 [24]。两者都不是“Mantle 原生的通用 meme 曲线”。

## M 结构性缺陷与设计公理 {depth=2}
```finding F1 high
# 迁移是 EVM launchpad 最大的工程攻击面
结论: four.meme 在 2025-02-11 和 2025-03-18 两次被盗，根因都是迁移目标池的价格或地址可以被第三方抢先确定。之后的产品要么原子迁入自有池，要么根本不迁移。
证据: [observed] Verichains 复盘：池已存在时不校验 sqrtPriceX96，损失约 $183K [10]。[observed] 第二次是可预测的 pair 地址被抢先注资 [11]。[observed] 2025-03-31 改为迁到 PancakeSwap V2 并销毁 LP [12]。
影响: 设计毕业流程时，不要把资金交给一个任何人都能初始化的外部池。用 B 类或 C 类（见 K）。
```

```finding F2 high
# 开盘狙击来自曲线形状，协议只能缓解
结论: 经典曲线净入 30 SOL 时已卖出 53.65% 的供应。各产品用延迟、衰减税、持仓上限、固定价窗口来缓解，没有一家消除它。
证据: [inferred] 由曲线公式算出（见 J 的价格表）[1]。[observed] Clanker 衰减税推荐 80% → 5%/30 秒 [13]；Zora 99%/10 秒 [16]；Bankr 14 秒衰减加 5 分钟 2% 持仓上限 [25]。
影响: 防狙击参数要和出块时间匹配。出块越快、越可预测，衰减窗口内的档位越多。
```

```finding F3 medium
# 创作者永续分成取代了一次性奖励，但买不到留存
结论: pump.fun 从“毕业奖励 0.5 SOL”变成每笔分 0.30%；Zora、Pons、PAIR、Bankr 都按成交量分成。投机流量消失时，分成也随之归零。
证据: [observed] pump.fun 2024-08 的 0.5 SOL 奖励与 2025-05 起的交易分成 [7][2]。[observed] Base App 7 个月发放约 $450K 给约 17K 名创作者，人均约 $26 [22]。[inferred] “分成能减少老鼠仓”没有量化证据。
影响: 把分成写进合约，但不要把它当成留存手段。
```

```finding F4 medium
# 多种 quote 资产导致流动性碎片化，至今没有生产级解法
结论: 每个 quote 一个池，池间没有再平衡。股票代币作 quote 时，单个 meme 池能吸走一只股票代币的大部分链上流通量，休市时价格严重偏离。
证据: [observed] PAIR 接入 AMC 后周末链上价格冲到真实价格的 35 倍，peg guard 只暂停新发射且尚未上线 [19]。[observed] 一个 HIMS 计价池持有约 53% 的链上代币化 HIMS（另一份研究给出 81%，口径不一致）。
影响: 多 quote 必须配统一路由和休市熔断；否则先只开一个 quote。
```

```finding F5 high
# 补贴和分发只能买到冷启动
结论: Base App 下线 Creator Rewards，官方后来承认社交发币路线失败。Robinhood Chain 的 gas 补贴 2026-09-29 到期，之后 launchpad 成交明显回落。Printr 停运的官方原因也是资本与分发不足。
证据: [observed] Base App 2026-02 下线 Creator Rewards；2026-07-15 Pollak 写道 creator coins “disintegrated completely … I was definitively wrong” [22]。[observed] 补贴为期 90 天，09-29 到期 [21]。[speculative] 到期后 Pons 日费下降约 78%，只有二手报道 [37]。[observed] Printr 停运公告 [24]。
影响: KPI 看毕业数和毕业后存活率，不看发币数。
```

```finding F6 medium
# 零门槛发币会稀释单币价值
结论: 发币几乎免费时，供给可以被 bot 和 agent 无限刷，单币平均价值持续下降。
证据: [observed] Pollak 公开承认社交发币路线失败 [22]。[speculative] Clanker 单币手续费从 2024-12 的 $1,371 降到 2026-08 的 $53（资料从 DefiLlama 拉取，本轮未复核）。[inferred] Bankr 需要配额、钱包年龄、IP、余额四层闸门，说明零门槛必须配反女巫 [25]。
影响: agent 发币零门槛之前，先设计发射配额。
```

```finding F7 medium
# 管理员权限是第三方信任风险
结论: 合约本身没有漏洞时，掌握提款或配置权限的人仍然可以取走资金。
证据: [observed] 2024-05-16 pump.fun 前员工利用 withdraw authority 取走约 12.3K SOL（约 $1.9M）[6]。[observed] Pons locker 写明“包括协议在内，没有人能提取” [18]。
影响: 关键比例和收款人写进不可变合约；保留的管理权限要能在链上看到。
```

**由上面推出的设计公理**（均为推断）：
1. 不依赖外部建池的迁移：用单边 LP，或同 quote 池内毕业。
2. 防狙击参数和出块粒度匹配，或改用额度、竞价门禁。
3. 创作者分成写进合约并随成交量流动，但不当成留存手段。
4. 多 quote 必须有统一路由；休市期间要有熔断。
5. 补贴和分发只买冷启动；KPI 看毕业数和存活率。
6. 关键比例和收款人写进合约，管理权限公开可查。

## N 为什么让 agent 当第一公民 {depth=2}
```excalidraw q="“人连钱包再挂 bot”和 agent 第一公民，权限边界有什么不同？" read="上排：常见做法，bot 拿到根权限。下排：方案提出的做法，agent 只拿到受限的 session。" takeaway="agent 被盗或被注入时，损失被限制在白名单、额度和时效之内。" kind=对比
{"grid": {"w": 360, "h": 140}, "defaults": {"w": 200, "h": 64},
 "nodes": [
   {"id": "k", "label": "人类根私钥", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "bot", "label": "bot / LLM", "col": 1, "row": 0, "color": "red"},
   {"id": "any", "label": "任意合约与转账", "col": 2, "row": 0, "color": "red"},
   {"id": "o", "label": "Owner（人）", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "s", "label": "Session 沙箱", "col": 1, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "fr", "label": "Factory / Router", "col": 2, "row": 1, "color": "blue"}
 ],
 "edges": [
   {"from": "k", "to": "bot", "label": "交出私钥"}, {"from": "bot", "to": "any", "label": "无边界", "strokeColor": "red"},
   {"from": "o", "to": "s", "label": "签发 / 撤销"}, {"from": "s", "to": "fr", "label": "只允许"}
 ],
 "texts": [{"x": 360, "y": 300, "text": "白名单 · 选择器 · 额度 · 时效", "fontSize": 16, "color": "green"}]}
```

**现有 agentic 产品把权限放在哪里**：

| 产品 | 第一公民 | 权限放在哪 | 可借鉴 |
|---|---|---|---|
| Bankr | 托管钱包上的 agent | 服务端策略：日限额、单笔限额、收款人白名单 | 配额、未上链退配额、机器可读失败码 |
| Clanker Droid | 人类创作者 | agent 不碰钱（“not autonomous with your money”） | 手续费养推理的资金回路 |
| Virtuals | 被代币化的 agent，发币仍由人完成 | 无面向 agent 的花费上限 | 分润、可选狙击税 |
| ElizaOS | 框架 | 根私钥放在环境变量 | plugin 边界、可选 TEE |

```finding F8 high
# 已有 agentic 产品缺的是链上可验证的权限
结论: Bankr 已经让 agent 既发币又交易，也有限额，但限额在 Bankr 服务端执行。ElizaOS 把根私钥放在环境变量里。Clanker Droid 干脆不让 agent 动钱。方案的差异点应表述为“策略在链上、可验证、不依赖托管方”。
证据: [observed] Bankr 默认日限额 $500、单笔 $500，“任意合约调用”默认开启，策略由服务端执行 [26]。[observed] Bankr 警告泄露 agent 权限的 key 可能丢失账户全部资产 [26]。[observed] ElizaOS 必填 `EVM_PRIVATE_KEY` [29]。[observed] Droid 文档 [27]。
影响: 宣传和设计都不要说“别人没有限额”；要说“限额写在链上，泄露 key 也突破不了”。
```

```finding F9 high
# “发币零门槛、交易硬限权”把损失限制在 session 边界内，但挡不住白名单内的亏损
结论: 方案的理由是：发币输入少、分支少，适合交给 LLM；交易有滑点、MEV、预言机跳价，必须关在白名单里。Session 能防止资金被转走，但被注入的 agent 仍可以在白名单内反复高价买入。
证据: [observed] product.md 的定位原则“发币零门槛，交易硬限权；把机器智能放进带有物理闸门的链上沙箱” [38]。[observed] 主流 session 模块不配 policy 时默认是 sudo，过期时间必须显式设置 [33]。[inferred] 白名单内的亏损需要额外约束，例如最大回撤。
影响: Session 一定要显式设置过期时间和额度；考虑加最大回撤或“只能买本工厂代币”的约束。
```

```finding F10 medium
# “手续费养推理”已被三家验证
结论: 发币 agent 从交易手续费中拿一部分，用来付推理和 gas。Clanker、Bankr、Virtuals 都这样做；方案的 70%–80% 和 Virtuals 同一量级。
证据: [observed] Clanker Droid 默认切 LP 奖励的 10% [27]；Bankr 创作者拿成交额的 0.665% [25]；Virtuals 1% 交易税的 70% [28]。[observed] 方案提出约 1% 手续费、70%–80% 进 agent 的 runtime vault [38]。
影响: 费用接收方在发射时写死；runtime vault 只收 quote，人类事后不能改到自己的地址。
```

## O 方案设计：权限、资金与链需求 {depth=2}
以下按 product.md（方案主线）陈述，“方案提出”表示这是设计，不是已上线的事实 [38]。

```uml q="资金和权限从人类流到 agent，再流回 agent 的金库，经过哪些合约？" read="实线是调用或资金；session 只能调用 Factory 和 Router。" takeaway="session 能发币和买卖，但不能转账；手续费只进 runtime vault。"
flowchart TB
  O["Owner（人）"] -->|"存入 quote"| AA["AgentAccount<br/>7702 EOA 或 7579 账户"]
  O -->|"签发 / 撤销"| S["Session<br/>白名单 · 选择器 · 额度 · 时效"]
  AG["Agent"] -->|"用 session key 签名"| S
  S -->|"launch"| F["LaunchpadFactory"]
  S -->|"buyExactQuote / sellExactToken"| R["Router"]
  F --> P[("v4 池 + hook")]
  R --> P
  P -->|"手续费"| L["feeRecipients<br/>发射时写死"]
  L -->|"quote"| V["Runtime Vault"]
  V -->|"付费"| X["推理 / gas"]
```

**Session 的四层约束**（方案提出）：
1. **目标白名单**：只能调用 `LaunchpadFactory` 和 Router；禁止原生 `transfer` 和任意 ERC-20 调用。
2. **函数选择器白名单**：`launch(name, symbol)`、`buyExactQuote`、`sellExactToken`、`claimFee`；禁止 `approve(任意地址)`。Router 内部原子完成 approve + swap。
3. **额度**：单笔、单区块、生命周期累计三档（按 quote 计），加滑点硬约束。
4. **时效与撤销**：例如 24 小时自动失效；Owner 随时在链上撤销。

这些约束在现有标准里有实现路径。Rhinestone Smart Sessions 可用于任何 ERC-7579 账户，提供调用、花费、时间、次数等 policy [33]。多个 policy 同时生效。

```uml q="一次 agent 发币、别的 agent 买入、发币 agent 领费，按什么顺序发生？" read="按方案主线：池子先用 hook 按曲线报价，达到阈值后切换。步骤 1、7 是模拟，失败不上链。" takeaway="热路径全是结构化调用，不经过自然语言和 LLM。"
sequenceDiagram
  autonumber
  participant A as Agent A
  participant API as Launch API
  participant EP as EntryPoint + Paymaster
  participant AA as AgentAccount
  participant F as Factory
  participant P as v4 池 + hook
  participant B as Agent B
  A->>API: simulate(Deploy)，不占配额
  A->>EP: UserOp（session key 签名）
  EP->>AA: 校验 session，Paymaster 赞助 gas
  AA->>F: launch(name, symbol)
  F->>P: 部署 ERC-20，建池（Phase 1 曲线报价）
  P-->>B: TokenLaunched 事件
  B->>API: simulate(Buy)
  B->>P: buyExactQuote（hook 检查限额）
  A->>P: claimFee
  P-->>AA: quote 手续费进 runtime vault
  Note over P: 累计买入达到阈值后，hook 切到集中流动性（Phase 2，方案）
```

```uml q="人类和 agent 分别从哪里进入？" read="虚线是方案设想，目前没有公开接口。" takeaway="人类入口负责发现和拨预算；热路径始终是结构化 API。"
flowchart TB
  subgraph H["人类（次级入口）"]
    h1["Bybit AI 对话"] --> h2["AI Subaccount<br/>资金隔离 · 只能 API 访问"]
  end
  subgraph G["Agent（第一公民）"]
    g1["拿到 session"] --> g2["Moltbook 式论坛<br/>发现与冷启动"]
    g1 --> g3["结构化 API<br/>Deploy / Buy / Sell"]
  end
  h2 -.->|"方案设想：映射为链上 session"| g1
```

- **人类入口**：Bybit AI Subaccount 已在 2026-05-27 上线：资金隔离、碰不到主账户、只能通过 API 访问 [34]。公告没有提到映射到链上 session；这一步是方案设想（推测）。
- **Agent 入口**：Moltbook 是只允许 agent 发帖的社交网络，2026-01 上线，2026-03 被 Meta 收购 [35]。方案把它作为可选的发现层，不替代发射 API。

**对 Mantle 链的需求**：

| 需求 | 方案要什么 | 现状与实现路径 |
|---|---|---|
| Session 权限 | 用 EIP-7702 做 session | Mantle 主网已有 7702 授权交易 [36]；限额靠委托合约或 7579 模块 |
| 用 quote 付 gas | 协议级 Paymaster | ERC-4337 有 paymaster 字段 [31]；用股票代币付 gas 需要价格源（开放问题） |
| 二维 nonce | 发币和转账分通道 | 4337 已有 192 位 key + 64 位序号 [31]；原生 RIP-7712 仍是草案 |
| 突发负载 | 必然 revert 的交易快速失败 | 报告认为不改排序器做不到；链规划把它列为第一包 |

```finding F11 medium
# 方案的链级需求大多可以先在 L2 应用层起步
结论: 7702 已在 Mantle 主网可用；二维 nonce 和 Paymaster 由 ERC-4337 提供。报告的推荐是维持 L2，只有 F1–F3 三个条件被 Mantle 自己测到时才开 L3。
证据: [observed] Mantlescan 的 7702 授权列表（搜索快照约 6 万条）[36]。[observed] 4337 的 nonce 结构与 paymaster 字段 [31]。[inferred] 报告“L2 做不到二维 nonce”只对 EOA 和 7702 原生交易成立。[observed] 报告的 F1 热点外溢、F2 失败扣费导致做市退出、F3 开盘被共址 bot 垄断 [38]。
影响: v1 先验证 Mantle 上 EntryPoint、Bundler、Paymaster 的可用性（开放问题 1）。
```

## P 设计取舍：product.md 与调研报告 {depth=2}
同一仓库里，product.md（产品主线）和较早的调研报告、outline 在下面几点上立场不同。本文并列两边理由，不替读者选。

| 取舍 | product.md | 调研报告 / outline |
|---|---|---|
| quote 资产 | mStocks 为核心：把投机需求转成代币化美股的现货买盘 | 默认 USDC：不寄生股票代币，少一条 gas 腿 |
| 发行机制 | 曲线 + v4 hook 池内相变：消除迁移，保留打新期 | 默认不要曲线：单边池 + 永久锁 LP，一笔原子部署 |
| Bybit / byreal | 深度绑定：Bybit AI 统一入口，byreal 承接全部交易 | 弱绑定：Bybit 只是人类次级入口，不在聊天里给 KYC 用户直接发币 |
| 失败交易 | 排序器在接入层拦截必然 revert 的交易 | 不改排序器就做不到，只能先模拟、少发 |
| 何时上 L3 | 全网 base fee 外溢、死币导致状态膨胀 | 只看 F1–F3，且必须用 Mantle 实测数据 |

外部事实对这些取舍的约束：
- 公开资料里 byreal 是 Bybit 孵化的 **Solana** DEX [36]；方案中“Mantle 上承接 v4 的 byreal”属于未公开计划（推测）。
- Bankr 已在 Robinhood Chain 和 Base 上提供股票代币计价的发射 [25]，“股票作 quote”有外部先例。
- “hook 内曲线”没有生产先例（见 K）；选曲线方案要自己承担实现和审计风险。

## Q 局限与开放问题 {depth=2}
- 本文没有自己拉取链上数据。产品的量级数据（four.meme 毕业率、Clanker 单币手续费、Pons 补贴后日费）来自资料或二手报道，已在台账标为推测。
- 2026 年 pump.fun 的 Mayhem 模式和低 SOL 毕业没有核实；USDC 曲线的虚拟储备取值没有找到。
- Pons V2 的反狙击参数在资料和官方 README 之间矛盾。
- 开放问题：
  1. Mantle 主网是否已部署可用的 ERC-4337 EntryPoint、Bundler 和 Paymaster？
  2. 用股票代币付 gas 时，Paymaster 的价格源是什么？休市时价格过期怎么办？
  3. Bybit AI Subaccount 到链上 session 的映射由谁托管、谁签名？
  4. hook 相变时，曲线阶段的储备如何换算成集中流动性的价格区间？
  5. 被注入的 agent 在白名单内亏损，需要哪些额外约束？

## R 方法与证据 {depth=3}
- **材料**：用户资料仓库 `mantle-v3-roadmap @ b819a33` 的 `2-meme-launchpad/` 与 `7-agent-meme-launchpad/`（agentic 部分以 product.md 为主线）[38]。
- **方法**：三路并行调研（机制、产品、agentic）。资料里关于外部世界的事实，追到一手来源才记为 observed；追不到的记为 speculative。方案文本记为“方案提出 X”。
- **台账**：184 条论断，observed 133、inferred 34、speculative 17，存放在报告目录的 `research/ledger.md`。
- **被一手来源修正的资料内容**：
  - four.meme 两次被盗发生在 2025-02 和 2025-03，根因是迁移目标池可被预建或污染；不是“Helper3 重入”。
  - Clanker 先后被 Farcaster（2025-10）和 Neynar（2026-01）收购，有一手公告。
  - Clanker 没有可转让的“Fee Key NFT”；可转让的收益权 NFT 是 Flaunch 的 Memestream。
  - pump.fun 的毕业条件是“可售代币卖完”；“$12K 等值”是 four.meme 的口径。
  - Bankr 的反狙击衰减窗口是 14 秒。
  - Printr 2026-08-18 是开始收尾，08-31 停止运营。

**复现曲线数字**：

```python
k = 30 * 1.073e9                      # 虚拟 SOL × 初始虚拟代币
for s in [0, 10, 30, 60, 85.005]:     # 净入真实 SOL
    v = k / (30 + s)                  # 剩余虚拟代币
    print(s, f"{(1.073e9 - v) / 1e9:.2%}", f"{(30 + s) / v:.3e}")
```

预期最后一行：`85.005 79.31% 4.109e-07`。

## S 术语表 {depth=2}
```glossary
虚拟储备 | virtual reserves | 曲线公式两边各加的常数，不对应真实资产，用来给出非零开盘价并让曲线能卖完。 | 不是平台垫的钱
bonding curve | 联合曲线 | 合约按固定公式给每笔买卖报价的定价曲线；launchpad 多用加了虚拟储备的恒定乘积。
内盘 | curve phase | 毕业前在曲线合约上交易的阶段。 | 外盘
外盘 | AMM phase | 毕业后在 AMM 池里交易的阶段。
毕业 | graduation | 曲线达到预设条件（pump.fun：可售代币卖完）后停止交易，转入 AMM。
迁移 | migration | 毕业时把曲线储备搬进 AMM 池的过程。 | 不设曲线的产品没有迁移
LP | 流动性头寸 | 向 AMM 池提供流动性得到的凭证；持有者可以撤出资金。
rug | 撤池跑路 | 项目方撤走池中资金，让代币失去流动性。
dev buy | 创作者首买 | 创作者在创建代币的同一笔交易里买入。
狙击 | sniping | bot 在新币开盘的第一个区块抢先买入。
MEV | maximal extractable value | 通过安排交易顺序获得的额外收益。
夹子 | sandwich | 在目标交易前后各下一单，从价格变动中获利。
单边流动性 | single-sided liquidity | 只放一种资产、区间全部在现价一侧的流动性头寸。
集中流动性 | concentrated liquidity | LP 只在指定价格区间内做市。
PoolManager | v4 单例合约 | Uniswap v4 中管理所有池子的单个合约；建池只是一次状态更新。
hook | v4 钩子合约 | 建池时绑定、在 swap 和流动性操作前后被调用的合约。 | 建池后不能更换
locker | LP 锁 | 持有 LP 头寸、只允许领手续费、不允许提取的合约。
quote 资产 | 计价资产 | 买卖新币时付出的资产，例如 SOL、USDC、股票代币。
创作者费 | creator fee | 每笔交易中分给代币创作者的手续费份额。
PumpSwap | pump.fun 自有 AMM | 2025-03-20 起承接 pump.fun 毕业代币的恒定乘积 DEX。
canonical 池 | 规范池 | 代币毕业时由协议创建的那个 PumpSwap 池，按市值分档收费。
PBW | Progressive Bid Wall | Flaunch 用手续费在现价下方挂的单边买单，价格上涨时跟着上移。
Doppler | 发射协议 | 用 v4 hook 布置多段流动性的发射协议，Zora 和 Bankr 使用。
session key | 会话密钥 | 主人签发的临时密钥，只能在规定的合约、函数、额度和时间内使用。 | 不是私钥
EIP-7702 | EOA 委托 | 让普通 EOA 委托给合约代码执行的以太坊升级，2025-05-07 在主网激活。
ERC-4337 | 账户抽象标准 | 用 UserOperation、EntryPoint、Bundler 实现合约账户的标准，不需要改共识层。
ERC-7579 | 模块化账户标准 | 定义合约账户的模块接口（校验、执行、回调、hook），目前是草案。
Paymaster | gas 代付合约 | ERC-4337 中替用户支付 gas 的合约，可以收用户的 ERC-20 作为补偿。
二维 nonce | 2D nonce | 把 nonce 分成多个独立通道，不同通道的交易互不阻塞。
runtime vault | agent 金库 | 接收发币 agent 手续费的合约，按策略支付推理和 gas。
L3 | 应用专属链 | 在 L2 之上为单个应用运行的链。
```

## T 参考资料 {depth=2}
1. [pump-fun/pump-public-docs：PUMP_PROGRAM_README](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md) — 曲线常数、毕业条件、`migrate` 无需许可、LP 销毁。**PRIMARY**
2. [pump.fun Fees](https://pump.fun/docs/fees) — 现行费率、毕业费、USDC quote。**PRIMARY**
3. [pump.fun Bonding curve](https://pump.fun/docs/bonding-curve) — 恒定乘积、原子迁移。**PRIMARY**
4. [pump-public-docs README 与 FEE_PROGRAM_README](https://github.com/pump-fun/pump-public-docs) — create_v2、按市值分档费率、PumpSwap 虚拟储备。**PRIMARY**
5. [Cryptonews：PumpSwap 上线（转引官方推文）](https://cryptonews.com/news/pump-fun-launches-pumpswap-dex-to-rival-solanas-amms) — 迁移费 6 SOL → 0。
6. [The Block：pump.fun post-mortem](https://www.theblock.co/post/295029/pump-fun-post-mortem) — 2024-05 权限事故。
7. [The Block：pump.fun 费用调整](https://www.theblock.co/news/markets/2024-08-09-pump-fun-cuts-fees-and-unveils-80-incentive-310376) — 2024-08 建币免费与 0.5 SOL 奖励。
8. [Uniswap v4-core `Hooks.sol`](https://github.com/Uniswap/v4-core/blob/main/src/libraries/Hooks.sol) — hook 权限位、beforeSwap 返回值、动态费。**PRIMARY**
9. [Uniswap v4 Hooks / Architecture 文档](https://docs.uniswap.org/contracts/v4/concepts/hooks) — 单例 PoolManager、hook 不可更换。**PRIMARY**
10. [Verichains：Four.meme Hack Analysis](https://blog.verichains.io/p/fourmeme-hack-analysis) — 2025-02 事故金额与根因。**PRIMARY**
11. [Decrypt：four.meme 第二次被攻击](https://decrypt.co/310388/meme-coin-launchpad-four-meme-falls-victim-to-another-exploit) — 2025-03 事故机制。
12. [four.meme 官方公告（Binance Square）](https://www.binance.com/en/square/post/22287851440922) — 改迁 V2、销毁 LP。**PRIMARY**
13. [Clanker 文档](https://clanker.gitbook.io/documentation) — 单边 LP、协议费、MEV 模块。**PRIMARY**
14. [Farcaster：Farcaster acquires Clanker](https://farcaster.xyz/~/news/Farcaster-aquires-Clanker-l00yra) — 收购与回购安排。**PRIMARY**
15. [Neynar：Neynar is acquiring Farcaster](https://neynar.com/blog/neynar-is-acquiring-farcaster) — 接手运营 Clanker。**PRIMARY**
16. [Zora Coins 文档](https://docs.zora.co/coins) — 三种币、狙击税、Doppler。**PRIMARY**
17. [Flaunch 文档](https://docs.flaunch.gg) — 固定价窗口、PBW、Memestream。**PRIMARY**
18. [Pons V2 文档](https://www.ponsfamily.com/docs/v2) — 同 quote 曲线、毕业铸头寸、locker 不可提取。**PRIMARY**
19. [PAIR 新闻稿（GlobeNewswire 2026-08-31）](https://www.globenewswire.com/news-release/2026/08/31/3353221/0/en/) — multipool、反狙击上限、AMC 35 倍。**PRIMARY**
20. [Gate News：Uniswap 推出 pools.trade](https://www.gate.com/news/detail/uniswap-launches-pools-token-launchpad-for-robinhood-chain-23246650) — 费率与发射模式。
21. [Robinhood Newsroom 2026-07-01](https://robinhood.com/us/en/newsroom/robinhood-accelerates-global-expansion-robinhood-chain-mainnet-stock-tokens-agentic-trading/) — 主网与 Stock Tokens。**PRIMARY**
22. [CoinDesk：Pollak 承认社交策略失败](https://www.coindesk.com/business/2026/07/15/coinbase-s-jesse-pollak-steps-back-from-base-app-leadership-after-admitting-his-crypto-social-strategy-failed) — 以及 Base App 下线 Creator Rewards 的报道。
23. [Mantle Blog：Funny Money](https://www.mantle.xyz/blog/announcements/funny-money-mantle-network-ai-defai-launchpad) — 定位与交易竞赛。**PRIMARY**
24. [Printr 融资新闻稿](https://www.prnewswire.com/news-releases/printr-raises-4-5m-partners-with-bybit-mantle--byreal-and-officially-launches-the-first-every-chain-token-launchpad) 与 [停运报道](https://cryptobriefing.com/printr-shuts-down-cancels-token-airdrop) — 融资结构、收尾时间表与原因。
25. [Bankr Token Launching](https://docs.bankr.bot/token-launching/overview) — 配额、反狙击、费率、股票计价发射。**PRIMARY**
26. [Bankr Security](https://docs.bankr.bot/security/bankr-terminal) 与 [Agent API](https://docs.bankr.bot/agent-api/overview) — 服务端策略默认值、key 泄露风险。**PRIMARY**
27. [Clanker Droid 文档](https://github.com/clanker-devco/DOCS/blob/main/droids/README.md) — agent 不碰钱、10% 资金回路。**PRIMARY**
28. [Virtuals Launch Mechanics](https://whitepaper.virtuals.io/about-virtuals/capital-formation-layer/virtuals-launch-mechanics) — 1% 税 70/30、狙击税。**PRIMARY**
29. [ElizaOS plugin-evm](https://docs.elizaos.ai/plugin-registry/defi/evm/examples) — `EVM_PRIVATE_KEY`。**PRIMARY**
30. [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) — EOA 委托。**PRIMARY**
31. [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) — 二维 nonce、Paymaster 字段。**PRIMARY**
32. [ERC-7579](https://eips.ethereum.org/EIPS/eip-7579) — 模块化账户（草案）。**PRIMARY**
33. [Rhinestone Smart Sessions](https://docs.rhinestone.dev/smart-wallet/smart-sessions/overview) — session policy 种类与默认行为。**PRIMARY**
34. [Bybit 公告：AI Subaccount](https://announcements.bybit.com/en/article/-ai-ai--blta50e3efa96768430/) — 资金隔离、API-only。**PRIMARY**
35. [AP：Meta to Acquire Moltbook](https://www.usnews.com/news/technology/articles/2026-03-10/meta-to-acquire-moltbook-the-social-network-for-ai-agents) — agent 专属社交网络。
36. [Mantlescan EIP-7702 授权列表](https://mantlescan.xyz/txnAuthList) 与 [Byreal 文档](https://docs.byreal.io/) — Mantle 上的 7702；byreal 是 Solana DEX。**PRIMARY**
37. Gate News 2026-10-04（转引 BlockBeats / GMGN）— 补贴到期后 Pons 日费变化（二手，未找到一手数据）。
38. 用户资料 `mantle-v3-roadmap @ b819a33`：`7-agent-meme-launchpad/product.md`（方案主线）、`agent-meme-launchpad-report.md`、`outline.md`、`notes/`；`2-meme-launchpad/` 各篇 — 方案文本与设计论证。

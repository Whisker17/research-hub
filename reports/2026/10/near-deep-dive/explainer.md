---
template: research
title: NEAR 深度拆解：分片链架构、Intents / Privacy / AI 产品栈与生态
subtitle: NEAR 没有把三条叙事塞进一个 VM。它们共用三样东西：账户与授权、一个合约里的结算账本、一个 MPC 网络。用户真正接受的是从现有钱包跨链换资产；Privacy 和 AI 还只有上线记录。NEAR 是“infra 先铺能力、产品筛选需求、需求再反推 infra”的混合型。
cols: 4
type: 技术调研 · dev onboarding
audience: Mantle devs：懂 EVM 和 rollup 基础，不熟悉 NEAR（分片、异步执行、账户模型）
scope: L1 与链抽象层架构及取舍、Intents / Confidential Intents / NEAR AI 的原理与 infra 映射、生态使用数据、叙事与 infra 时间线、Mantle 启示
evidence: 314 条论断台账（observed 257 / inferred 46 / speculative 11）；源码 nearcore @090da31、NEPs @dcc0bcb、near/intents @4127e8e、near/mpc @e968367、nearai/ironclaw @b0b999d；NEAR 主网 RPC、DefiLlama、Intents explorer、1Click API；访问于 2026-10-07
date: 2026-10-07 · v1
---
结论先行：NEAR 把 Intents、Privacy、AI 放在不同的执行环境里。它们共用三样东西：NEAR 账户与授权、`intents.near` 这个合约内账本、一个同时做签名 / 密钥派生 / 外链验证的 MPC 网络（[F1](#F1)、[F5](#F5)）。L1 的根本取舍是跨账户调用一律异步，所以 Intents 把需要原子性的余额集中到一个合约里（[F2](#F2)）。有用户接受证据的只有跨链兑换：30 天成交 44.1 亿美元，靠外部钱包和聚合器分发（[F9](#F9)）。“产品驱动 infra”只在账户层和分片布局成立（[F11](#F11)）。截至 2026-10-07，NEAR Intents 不支持 Mantle（[F13](#F13)）。

## A 一张图看 NEAR 产品栈 {sheet meta="layers"}
```tree list
用户入口 | 外部钱包、聚合器、near.com、AI agent
  1Click API / Message Bus | 链外报价与撮合
    `intents.near` 账本 | 公链结算，单个合约
    `intents.far` 账本 | FAR 许可制私有链
  NEAR AI Cloud / IronClaw | 链外 TEE 推理与 agent
  MPC 网络 `v1.signer` | 签名 · CKD · 外链验证
    Omni / PoA / HOT 桥 | 出入金，三种信任
  NEAR L1 | 10 个分片，异步 receipt
```

## B 原子性只在一个合约里 {sheet span=2 meta="token_diff"}
```annot
# 一次 execute_intents | 一个 receipt
Alice: [USDC −1000, BTC +0.0081]{用户签的 token_diff}
Solver: [USDC +1000, BTC −0.0081]{solver 签的 token_diff}
每个 token 的增减之和 = [0]{!不配平就整笔 panic}
> 入金桥和出金桥都在这个原子域之外（示意数字，忽略费用）
```

## C 产品用到哪些 infra {sheet meta="mapping"}
| infra | Intents | Conf. | AI |
|---|---|---|---|
| 账户 / key | ok | ok | ok 登录 |
| 合约账本 | ok | ok | warn 经 Intents |
| MPC 签名 | ok 出金 | warn 经公链出金 | no |
| 私有链 FAR | no | ok | warn 支付 |
| TEE | no | warn 产品页称 | ok |

## D 关键数字 {sheet span=2 meta="2026-10-07"}
| 量 | 值 |
|---|---|
| 主网版本 | PV 86 · nearcore 2.13.4 |
| 出块（实测） | 约 0.59 s，finality 约 1.2 s |
| 分片 | 10 个（动态上限 10） |
| MPC 网络 | 17 个运营方，门限 11，13 个在 TDX |
| Intents 30 天成交 | 44.1 亿美元（explorer：32.6 亿） |
| Intents 30 天 fees / L1 gas 费 | 738 万 / 14.1 万美元（约 52 倍） |
| 日活账户 | 12.5 万（2024-06 高峰约 224 万） |

## E 时间线 {sheet span=2 meta="2017–2026"}
```timeline
2017 | NEAR.ai | AI 项目，2018 转向区块链
2024-08 | Chain Signatures 主网 | 同月 Nightshade 2.0
*2024-11 | Intents beta | 建在 Chain Signatures 之上
2025-05 | 600 ms 出块 | optimistic block
2026-07 | gas keys · 动态分片 | Confidential B2B 上线
2026-10 | Intents 事件 | Sweat 宣布收场
```

## F 结论 {sheet span=4}
```callout ok 共享的是账户、账本和 MPC，不是 VM
- 架构：异步 receipt 让原子性只存在于单个合约内；Intents 用一个合约账本解决结算，用 MPC 和三座桥解决出入金（F1、F2、F5、F6）。
- 产品：Intents 有真实交易量和渠道；Confidential Intents 对公众保密、不对运营方保密；NEAR AI 在链外，没有用量数据（F7、F8、F9）。
- 迭代方式：账户层和分片布局由产品拉动，执行层由协议路线推动（F3、F11）。
- Mantle：学服务接口与渠道分发，不学异步执行和托管账本（F13、面板 Q）。
```

## G 如何阅读 {depth=1}
```callout info 默认你已知道（本文不解释）
- EVM 合约调用：同一笔交易里同步执行，任一步失败整笔回滚
- 签名、私钥、多签的基本概念
- rollup 的基本结构：sequencer 排序，状态由证明或挑战保证
- 跨链桥的基本模型：一侧锁定，另一侧铸造
- DEX 与 RFQ 报价的基本概念
```
- **5 分钟**：只看导语和总览 A–F。
- **30 分钟**：再读 [前置知识](#panel-I)、[L1 架构](#panel-J)、[链抽象层](#panel-K)、[Intents](#panel-L)、[生态](#panel-O)、[产品驱动 infra？](#panel-P) 和 [对 Mantle 的意义](#panel-Q)。
- **要复核的开发者**：再读 [方法与证据](#panel-S) 和 [复现](#panel-T)，命令可以直接运行。

**贯穿全文的例子**：Alice 在以太坊钱包里用 1,000 USDC 换 BTC，发到她自己的 BTC 地址。L1、链抽象、Intents、Privacy 各面板都用这笔兑换展开。

## H 背景动机 {depth=2}
**问题**：NEAR 在几年里换了好几条叙事：分片 L1、链抽象、Intents、User-owned AI、Privacy。它的用户量在 2024 年一度很高（日活账户约 224 万）[27]。我们想知道：这些叙事是怎么落到同一套基础设施上的？哪些真的被用户接受？链项目方能从中学到什么开发和运营方法？

**为什么现在**：Mantle 正在评估代币化股票、聚合路由、L2↔L3 同步可组合、链抽象与意图交易等方向 [34]。很多人把 NEAR 当作“围绕产品调整链”的例子。我们需要先看清它实际怎么做。

**范围**：
- L1 与链抽象层的架构与取舍
- Intents、Confidential Intents、NEAR AI 的原理，以及它们用到哪些 NEAR infra
- 生态使用数据与口径；叙事、产品与 infra 的时间线
- 2026-10-01 Intents 安全事件（作为组合风险案例）
- 对 Mantle 的启示

**非目标**：投资建议与代币价格分析；完整代码审计；Mantle 正式路线承诺；NEAR 治理与基金会财务。

**已有资料的不足**：外部调研（ChatGPT Deep Research）给出了正确的大框架 [35]。但它有几处过时或缺证据：Chain Signatures“只能 outbound”、gas keys 是“产品导向”、CKD 连接了 AI、“链内 DEX 1,788 万”的口径。本文用源码、主网 RPC 和面板 API 逐条核对（见 [面板 S](#panel-S)）。

## I 前置知识 {depth=2}
```excalidraw q="读懂 NEAR 的产品栈要先懂哪些概念？按什么顺序？" read="灰色虚线框是默认已知；蓝框是卡片；绿框是本文主题。箭头表示先学 → 后学。" takeaway="B-0 到 B-2 讲 NEAR 链本身；B-3、B-4 讲链外的密码学与硬件信任；B-5 把它们组合成 Intents。" name=prereq-map kind=前置知识地图
{"grid": {"w": 280, "h": 110}, "defaults": {"w": 210, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "evm", "label": "EVM 调用（已知）", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "sig", "label": "签名与多签（已知）", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "ru", "label": "rollup（已知）", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 账户与 key", "col": 1, "row": 0, "color": "blue"},
   {"id": "b1", "label": "B-1 异步 receipt", "col": 1, "row": 1, "color": "blue"},
   {"id": "b2", "label": "B-2 分片与验证", "col": 1, "row": 2, "color": "blue"},
   {"id": "b3", "label": "B-3 MPC 门限签名", "col": 2, "row": 0, "color": "blue"},
   {"id": "b4", "label": "B-4 TEE 与 attestation", "col": 2, "row": 2, "color": "blue"},
   {"id": "b5", "label": "B-5 intent 与 solver", "col": 2, "row": 1, "color": "blue"},
   {"id": "top", "label": "NEAR 产品栈", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "evm", "to": "b1"}, {"from": "sig", "to": "b0"}, {"from": "ru", "to": "b2"},
   {"from": "b1", "to": "b2"}, {"from": "b0", "to": "b3"}, {"from": "b0", "to": "b5"},
   {"from": "b1", "to": "b5"}, {"from": "b3", "to": "top"}, {"from": "b5", "to": "top"},
   {"from": "b4", "to": "top"}, {"from": "b2", "to": "b4", "dashed": true}
 ]}
```

```prereq B-0 l1 4min
# 账户与访问密钥（access key）
是什么: NEAR 账户是一个可读的名字，例如 `alice.near`。名字和密钥分开，一个账户可以挂多把 [[access key]]。key 分 FullAccess 和 [[FunctionCall key]] 两类 [1][3]。
为什么需要: 本文的几个产品都建在这一层上。Chain Signatures 按调用账户派生外链地址；Intents 的 relayer 用一把 FunctionCall key 提交结算；NEAR AI 用账户签名登录。
例子:
~~~
FunctionCall key = { receiver_id: "intents.near",
  method_names: ["execute_intents"], allowance: 无限 }
~~~
误解: 误解：FunctionCall key 的 allowance 是资产额度。事实：它只限制 gas 费，key 也不能附带 NEAR [3]。
深入: [3] docs.near.org “Access Keys”
```

```prereq B-1 l1 5min
# 异步 receipt：跨合约调用不在同一笔交易里完成
是什么: 交易先在签名者的分片变成一个 [[receipt]]。合约 A 调 B，会生成新的 receipt，在后面的区块执行；结果再通过 [[callback]] 回到 A [1][3]。
为什么需要: 这决定了 NEAR 上的原子性边界。只有同一个 receipt 内的动作是原子的。B 失败时，A 已提交的状态不会回滚。
例子: A 在块 H+1 执行，B 在 H+2 执行，A 的 callback 在 H+3 执行（见 Fig 3）。
误解: 误解：两个合约在同一个分片就是同步调用。事实：同分片也走 receipt，官方文档要求按“每个账户都在不同分片”来设计 [1]。
深入: [1] nearcore `docs/architecture/how/cross-shard.md`
依赖: B-0
```

```prereq B-2 l1 5min
# 分片与无状态验证（stateless validation）
是什么: 状态按账户名区间切成多个 [[分片|shard]]。每个分片的 [[chunk producer]] 持有状态，产出 [[chunk]] 和 [[state witness]]。被抽样的 [[chunk validator]] 不存状态，拿 witness 重新执行 [2]。
为什么需要: 这解释了 NEAR 能加分片，也解释了它的限制：一个账户只能在一个分片里，热点合约拆不开。
例子: 主网现在有 10 个分片，`game.hot.tg` 一个账户独占一个分片 [4]。
误解: 误解：stateless validation 是 ZK 证明。事实：witness 是状态子集加包含证明，validator 要重新执行，不是简洁证明 [2]。
深入: [2] NEP-509
依赖: B-1
```

```prereq B-3 l1 4min
# MPC 门限签名
是什么: 一把私钥被拆成多个份额，分给多个节点。至少达到门限数量的节点合作，才能产出一个签名；单个节点拿不到完整私钥 [8]。
为什么需要: [[Chain Signatures]] 就是 NEAR 合约加一个 [[MPC]] 网络。NEAR 账户靠它控制 BTC、ETH 等外链地址；Omni 桥出金也靠它签名。
例子: 主网 `v1.signer`：17 个参与者，门限 11 [4]。
误解: 误解：NEAR 有几百个验证者，所以 MPC 也同样去中心化。事实：MPC 网络是另一组运营方，安全性看 11/17，不看 L1 验证者 [10]。
深入: [8] near/mpc README
依赖: B-0
```

```prereq B-4 4min
# TEE 与远程证明（attestation）
是什么: [[TEE]] 是 CPU 或 GPU 里的隔离执行环境，例如 Intel [[TDX]]。[[attestation]] 是硬件签发的报告，证明“这台机器在跑哪个镜像”[22]。
为什么需要: 这些地方都依赖它：NEAR AI Cloud 机密推理、MPC 节点镜像校验、Confidential Intents 产品页所说的“TEE 桥”。
误解: 误解：attestation 证明输出是对的。事实：它只证明环境和软件身份，不证明代码没有 bug，也依赖 Intel / NVIDIA 的信任根 [23]。
深入: [22] docs.near.ai “Gateway Attestation”
```

```prereq B-5 l1 4min
# intent 与 solver
是什么: 用户不签“调用哪个合约”，只签“我愿意付出什么、换到什么”。[[solver]] 报价并签对手方的那一半。双方签名一起交给 [[verifier]] 合约结算 [13]。
为什么需要: NEAR Intents 的 [[token_diff]] 就是这种签名。它让外链钱包不用开 NEAR 账户也能交易。
例子:
~~~
{"intent":"token_diff",
 "diff":{"nep141:usdc…":"-1000","nep141:btc…":"0.0081"}}
~~~
误解: 误解：intent 是让大模型理解自然语言。事实：它是一条带签名的结构化余额变化。
深入: [13] docs.near-intents.org “Intent types and execution”
依赖: B-0、B-1
```

## J L1 架构：异步、分片与验证 {depth=2}
Fig 2 先给出全貌。NEAR 的产品不在同一个执行环境里。链上只有两个结算账本和一个 MPC 合约；推理、报价、私有链都在别处 [12][17][22]。

```excalidraw q="Intents、Privacy、AI 分别跑在哪里？哪些部分在 NEAR L1 上？" read="蓝色在 NEAR L1 上；紫色是 FAR 许可制私有链；黄色是链外服务；红色是不在 TEE 里的路由；灰色虚线是外部入口。" takeaway="三条产品线只在账户、intents.near 账本和 MPC 网络处交汇；其余部分各有各的执行环境和信任假设。" kind=分层架构
{"grid": {"w": 300, "h": 130}, "defaults": {"w": 230, "h": 60, "fontSize": 16},
 "nodes": [
   {"id": "wal", "label": "外部钱包 / 聚合器", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "agt", "label": "AI agent / 应用", "col": 2, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "oc", "label": "1Click + Message Bus", "col": 0, "row": 1, "color": "yellow"},
   {"id": "prl", "label": "私有 relay", "col": 1, "row": 1, "color": "yellow"},
   {"id": "ai", "label": "NEAR AI Cloud", "col": 2, "row": 1, "color": "yellow"},
   {"id": "ver", "label": "intents.near 账本", "col": 0, "row": 2, "color": "blue", "strokeWidth": 3},
   {"id": "far", "label": "intents.far（FAR）", "col": 1, "row": 2, "color": "violet"},
   {"id": "inc", "label": "Incognito 路由", "col": 2, "row": 2, "color": "red"},
   {"id": "br", "label": "Omni / PoA / HOT 桥", "col": 0, "row": 3, "color": "yellow"},
   {"id": "mpc", "label": "MPC 网络 v1.signer", "col": 1, "row": 3, "color": "blue", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "wal", "to": "oc", "label": "报价"},
   {"from": "oc", "to": "ver", "label": "结算"},
   {"from": "prl", "to": "far", "label": "私有成交"},
   {"from": "agt", "to": "ai", "label": "推理"},
   {"from": "ai", "to": "inc", "label": "转发", "dashed": true},
   {"from": "ver", "to": "br", "label": "出入金"},
   {"from": "br", "to": "mpc", "dashed": true},
   {"from": "far", "to": "ver", "dashed": true}
 ]}
```

```finding F1 high
# 三条叙事共用账户、一个合约账本和一个 MPC 网络，不共用执行环境
结论: 公链上只有 `intents.near`、`v1.signer` 等合约；报价在链外 relay，私有成交在 FAR，推理在链外 TEE。每一层有自己的信任假设。
证据: [observed] verifier 与 `far` 构建 [12]（I1、I3、I58）；FAR 架构 [17]（I34）；MPC 合约状态 [4]（O7）；NEAR AI 推理不上链 [22]（N21）。[inferred] “共用三样东西”是对这些组件的归纳（O12）。
影响: 不能用 NEAR L1 的安全性概括整个产品栈。每个产品要按它实际经过的组件评估。
```

**异步执行是根本取舍。** Fig 3 用 A 调 B 的例子说明。A 在块 H+1 执行时，它的状态已经提交。B 在 H+2 执行，结果在 H+3 回到 A 的 callback [1][3]。只有同一个 receipt 里的动作是原子的；对同一个合约的 batch call 也算一个单元 [3]。

```uml q="合约 A 调用合约 B 时，每一步在哪个区块执行？失败了谁负责回滚？" read="三个参与者可以在不同分片，也可以在同一分片，语义相同。高亮部分是开发者必须自己写的补偿逻辑。" takeaway="NEAR 没有跨合约的整笔回滚；原子性只存在于单个 receipt 内。"
sequenceDiagram
  autonumber
  participant U as 用户
  participant A as 合约 A
  participant B as 合约 B
  U->>A: 签名交易（块 H 转成 receipt）
  Note over A: 块 H+1 执行 A.method<br/>A 的状态已提交
  A-)B: ActionReceipt(B.fn)
  Note over B: 块 H+2 执行 B.fn
  B-)A: DataReceipt(结果)
  Note over A: 块 H+3 执行 A.callback
  rect rgb(251, 234, 234)
    alt B 失败
      A->>A: 手动回滚状态、退款
    end
  end
  A-)U: 退还未用完的 gas
```

用 near-sdk 写出来是这样（按官方示例改写；callback 用 `#[private]` 限制只能由合约自己调用）[3]：

```rust
pub fn hl_query_greeting(&self) -> Promise {
    hello_near::ext(self.hello_account.clone())
        .with_static_gas(FIVE_TGAS)
        .get_greeting()
        .then(Self::ext(env::current_account_id())
            .with_static_gas(FIVE_TGAS)
            .hl_query_greeting_callback())
}
#[private]
pub fn hl_query_greeting_callback(&self,
    #[callback_result] r: Result<String, PromiseError>) -> String {
    r.unwrap_or_default() // 失败时自己处理，不会自动回滚
}
```

```finding F2 high
# 异步 receipt 让原子性只存在于单个合约里，Intents 因此把余额集中到一个账本
结论: 跨合约调用在不同区块执行，失败不回滚前序状态。`execute_intents` 在一个 receipt 内完成多方验签、记账和配平检查，任一失败整笔 panic。
证据: [observed] cross-shard.md、tx_receipts.md、docs 跨合约调用页 [1][3]（A16–A20）；verifier 源码 [12]（I8–I10）。[inferred] “集中余额是为了绕开异步”是推论，官方文档没有明说（I53）。
影响: 在 NEAR 上做多步业务要写显式状态机和补偿逻辑；EVM 链没有这个约束。
```

**分片：一个账户只能在一个分片里。** 分片按账户名区间划分 [1]。Fig 4 是 2026-10-07 主网的真实布局 [4]。红框是只包含一个账户的分片：Aurora 和 HOT 的 `game.hot.tg` 各自独占一个。

```excalidraw q="主网的 10 个分片是怎么划分的？哪些边界是为产品热点切的？" read="每个框是一个分片，按账户名区间从左到右、从上到下排列；框里写分片 ID 和区间。红框只含一个账户；黄框按产品合约切出边界；绿框是动态拆分新出现的分片。" takeaway="分片边界写着 aurora、game.hot.tg、earn.kaiching、tge-lockup.sweat：NEAR 按产品热点手工切分，热点合约最多独占一个分片。" kind=分片布局
{"grid": {"w": 220, "h": 100}, "defaults": {"w": 200, "h": 70, "fontSize": 15},
 "nodes": [
   {"id": "s10", "label": "s10 · < 650", "col": 0, "row": 0},
   {"id": "s11", "label": "s11 · 650…aurora", "col": 1, "row": 0},
   {"id": "s1", "label": "s1 · aurora", "col": 2, "row": 0, "color": "red", "strokeWidth": 3},
   {"id": "s8", "label": "s8 · …earn.kaiching", "col": 3, "row": 0},
   {"id": "s9", "label": "s9 · kaiching…", "col": 4, "row": 0, "color": "yellow"},
   {"id": "s6", "label": "s6 · game.hot.tg", "col": 0, "row": 1, "color": "red", "strokeWidth": 3},
   {"id": "s7", "label": "s7 · intents.near 在此", "col": 1, "row": 1, "color": "blue"},
   {"id": "s4", "label": "s4 · …sweat", "col": 2, "row": 1},
   {"id": "s12", "label": "s12 · sweat…", "col": 3, "row": 1, "color": "yellow"},
   {"id": "s13", "label": "s13 · ≥ wallet.ka", "col": 4, "row": 1, "color": "green"}
 ],
 "edges": []}
```

边界是一步步加上去的 [1]：PV 64 加 `tge-lockup.sweat`（Sweat），PV 65 加 `game.hot.tg`（HOT），PV 75 加 `game.hot.tg-0`，让 HOT 合约独占一个分片，PV 76 加 `earn.kaiching`（KaiChing）。nearcore 1.39 还为 sweat 和 kaiching 合约写了专门的 prefetcher [1]。

```json
// 主网 epoch config 85.json：从这里起改为动态布局 [1]
"dynamic_resharding_config": {
  "memory_usage_threshold": 40000000000,   // 分片内存超过 40 GB 才拆
  "min_child_memory_usage": 10000000000,
  "max_number_of_shards": 10,
  "min_epochs_between_resharding": 2 }
```

[[动态 resharding|dynamic resharding]] 在 nearcore 2.13 稳定 [1]。当前布局的 `last_split` 是分片 5，新边界 `wallet.ka` 不在任何静态布局里。所以主网已经自动拆过一次（9 → 10），并碰到了上限 10 [4]。

```finding F3 high
# 分片扩不了单个热点合约；NEAR 用手工边界和动态拆分给热点让路
结论: 拆分边界是账户名，一个账户不能跨分片。HOT 的游戏合约从 PV 75 起独占一个分片；动态拆分已从 9 拆到 10，上限是 10。
证据: [observed] 主网 RPC 布局与 epoch config [1][4]（O1、O2、O4）；NEP-639 的 “-0” 拆法 [2]（A37–A39）。[inferred] 已发生一次自动拆分（O5、A41）。
影响: “加分片”只帮到能分散到多个账户的负载。`intents.near` 这种单合约账本，吞吐受单个分片限制（I54）。
```

**验证：重新执行，不是证明。** Fig 5 是 [[stateless validation]] 的角色分工 [2]。block producer 不再跟踪分片，只收 endorsement。chunk 必须拿到“分配给该分片的 stake”的 2/3 以上才能进块。

```excalidraw q="一个 chunk 怎么被验证并纳入区块？谁持有状态？" read="紫色持有状态；蓝色无状态；红色注释是常见误解。" takeaway="安全性来自被抽样的 validator 重新执行 witness；这是概率性安全，不是 validity proof。" kind=角色分工
{"grid": {"w": 380, "h": 120}, "defaults": {"w": 220, "h": 64, "fontSize": 16},
 "nodes": [
   {"id": "cp", "label": "Chunk producer（有状态）", "col": 0, "row": 0, "color": "violet"},
   {"id": "w", "label": "state witness", "col": 1, "row": 0, "color": "violet"},
   {"id": "cv", "label": "Chunk validator（抽样）", "col": 2, "row": 0, "color": "blue"},
   {"id": "bp", "label": "Block producer", "col": 2, "row": 1, "color": "blue"},
   {"id": "blk", "label": "区块", "col": 1, "row": 1, "color": "green"},
   {"id": "no", "label": "不是 validity proof", "col": 0, "row": 1, "color": "red", "stroke": "dashed"}
 ],
 "edges": [
   {"from": "cp", "to": "w", "label": "生成"},
   {"from": "w", "to": "cv", "label": "分发"},
   {"from": "cv", "to": "bp", "label": "endorse"},
   {"from": "bp", "to": "blk", "label": ">2/3 stake"},
   {"from": "no", "to": "w", "dashed": true}
 ]}
```

```finding F4 high
# 现在的 NEAR 是“抽样重执行 + 600 ms 出块”；SPICE 和 200 ms 是计划
结论: stateless validation 随 nearcore 2.0 上线；600 ms 出块来自 optimistic block（2025-05）。SPICE 在代码里是 PV 180 的实验特性，不在 nightly 里。1M TPS 是 70 个分片、只跑原生转账的测试网基准。
证据: [observed] NEP-509、CHANGELOG、version.rs [1][2]（A28–A36、A43–A45、A55）；主网 RPC 实测 0.590 s/块 [4]（A45）；1M TPS 测试条件 [5]（A53、A54）；SPICE 计划 [6]（A57）。
影响: 评估 NEAR 时以 PV 86 的现状为准，不要把 SPICE 的目标当作现状。
```

**其他取舍，按“解决什么 / 代价”列出** [1][2][3]：

| 设计 | 解决的问题 | 代价 |
|---|---|---|
| [[gas key]]（PV 86） | 预付 gas、1,024 条 nonce lane；为 SPICE 防 DoS | 删除 key 时余额被烧 |
| [[拥塞控制|congestion control]] | 目标分片拥塞 ≥ 0.8 时拒收新交易 | 最坏退化到单分片吞吐 |
| [[yield/resume]] | 合约等待链外结果，最多 200 块 | resume 入口必须做访问控制 |
| [[global contract]] | 同一份代码大量部署 | 部署费 10 倍且烧掉 |
| [[存储质押|storage staking]] | 状态付费：1 NEAR / 100 KB | 用户或应用要锁 NEAR |
| ML-DSA-65 签名 | 账户层后量子签名 | 只覆盖交易与 access key |

## K 链抽象层：一个 MPC 网络，三种用途 {depth=2}
[[Chain Signatures]] 是一个 NEAR 合约（主网 `v1.signer`）加一个链外 MPC 网络 [8][9]。Fig 6 是一次签名的完整时序。合约用 [[yield/resume]] 把请求挂起，最多等 200 个区块 [8]。MPC 节点算出签名后调用 `respond`，合约先用派生公钥验签，再把签名还给调用者 [8]。

```uml q="NEAR 账户怎样签出一笔以太坊或比特币交易？" read="真实接口名。第 3 步挂起请求，第 6 步合约链上验签。MPC 节点不能塞回错误签名，但可以拒签或拖到超时。" takeaway="NEAR 合约决定“谁能请求签名”，MPC 网络决定“签名能不能产出”；广播和确认仍在目标链上。"
sequenceDiagram
  autonumber
  participant App as 应用 / 账户
  participant S as v1.signer
  participant M as MPC 节点（11/17）
  participant T as 目标链
  App->>App: 派生地址 = f(根公钥, caller, path)
  App->>S: sign({path, payload_v2, domain_id}) + 1 yocto
  S->>S: 检查后 promise_yield_create
  M->>M: indexer 发现请求，门限签名
  M->>S: respond(request, signature)
  S->>S: 用派生公钥验签，resume
  S-->>App: {big_r, s, recovery_id}
  alt 200 块内没有 respond
    S-->>App: fail_on_timeout，交易失败
  end
  App->>T: 任何人都可以广播
```

外链地址按“调用账户 + path”加法派生 [8]：

```rust
// 伪代码，改写自 near/mpc kdf.rs @e968367
tweak = SHA3-256("near-mpc-recovery v0.1.0 epsilon derivation:"
                 + predecessor_id + "," + path)
derived_pk = root_pk + G·tweak        // secp256k1；ed25519 同理
```

请求本身很小：一个 path、一个待签哈希、一个 domain（README 示例）[8]：

```json
{ "request": {
    "payload_v2": { "Ecdsa": "521da91d…43a9" },
    "path": "sepolia-1",
    "domain_id": 0 } }
```

派生绑定的是直接调用 `v1.signer` 的账户。所以一个策略合约去调用时，外链地址归这个合约控制，不归最初签交易的人 [8]。签名请求要附 1 yoctoNEAR，目的是强制使用 FullAccess key，防止恶意前端用受限 key 静默发请求 [8]。

**同一个网络现在有 4 个 [[domain]]** [4]：

| domain | 协议 | 用途 | 主网调用方（示例） |
|---|---|---|---|
| 0 | CaitSith（secp256k1） | 签名 | 钱包、Omni 出金 |
| 1 | FROST（Ed25519） | 签名 | `tx-bench.near` 等 |
| 2 | CKD（BLS12-381） | [[CKD]] | `outlayer-admin.near` |
| 3 | CaitSith | [[外链交易验证|foreign-tx]] | `mpc-prover.bridge.near` |

domain 3 让 MPC 节点去外链查交易，再对查到的结果做门限签名。它的安全性来自“至少 11 个节点各自查询自己配置的 RPC 并得到一致结果”，不是 light client [8]。

```finding F5 high
# 一个 MPC 网络在主网同时做签名、密钥派生和外链验证；“只能 outbound”已经过时
结论: `v1.signer` 有 4 个 domain，门限都是 11/17。Omni 的 Aptos / Starknet 路由已在调用 `verify_foreign_transaction`。17 个运营方里 13 个提交了真实 TDX attestation，4 个没有。
证据: [observed] 主网 RPC 合约状态 [4]（O7）；nearblocks 交易记录 [10]（C20、C21、C33、C45）；mpc 源码 [8]（C32、C35）。[inferred] docs.near.org 的“8 nodes”“one way”已过时（C22、C34）。
影响: 用 Chain Signatures 的产品要按“11/17 门限 + TEE + 外链 RPC”评估信任，不能用 L1 验证者数量代替。
```

**CKD 不检查 TEE。** [[CKD]] 给 TEE 应用派生一把确定的密钥，应用迁移或重启后能恢复同一把 [11]。但 MPC 合约只按调用账户派生，不检查调用方是否在 TEE 里；这一步要由开发者自己的合约做 [8][11]。我们没找到 NEAR AI 或 FAR 在用 CKD 的一手证据（N57，推测）。

**三座桥，三种信任** [15][16]：

| 桥 | 入站验证 | 出站签名 | 信任谁 |
|---|---|---|---|
| [[Omni Bridge]] | ETH / BTC 用 light client；SOL 等用 Wormhole | NEAR MPC | 源链共识或 Wormhole；MPC 11/17 |
| [[PoA Bridge]] | 运营方 | 运营方 | 中心化运营方（只有 owner 能 mint） |
| [[HOT Bridge]] | HOT MPC | HOT MPC | HOT 自己的 MPC，不是 `v1.signer` |

```finding F6 high
# Intents 只在 verifier 内原子；出入金跨三座桥，信任模型各不相同
结论: 一笔跨链兑换至少经过三个域：源链入金、verifier 结算、目标链出金。只有中间一步是原子的。
证据: [observed] 桥接文档与 PoA 源码 [12][15]（C47–C54、I31–I33）；verifier 单 receipt 回滚 [12]（I9）。[inferred] 三个域没有共享回滚（I30）。
影响: 用户看到的“一次 swap”，背后是三套信任假设。评估安全时要按资产走的那座桥单独看。
```

## L NEAR Intents：一个合约里的结算账本 {depth=2}
[[verifier]] 合约部署在 `intents.near`，是一个多资产账本 [12][13]。资产通过 `ft_transfer_call` 存入，在账本内交换，再通过桥提出。Fig 7 用 Alice 的例子画出完整生命周期。

```uml q="Alice 用以太坊上的 1,000 USDC 换 BTC，每一步在哪个系统、谁签名？" read="1Click 路径（depositType = ORIGIN_CHAIN）。高亮的第 8 步是唯一的原子步骤；具体走哪座桥由 1Click 选择。" takeaway="UI 上的一次兑换 = 源链入金 + verifier 结算 + 目标链出金；失败时退款是一笔新的出金。"
sequenceDiagram
  autonumber
  participant A as Alice
  participant C as 1Click + Bus
  participant S as Solver
  participant BR as 入金桥
  participant V as intents.near
  participant O as Omni + MPC
  A->>C: quote(USDC→BTC, 收款, 退款, deadline)
  C->>S: RFQ 广播（≤3000 ms）
  S-->>C: 签好的 token_diff
  C-->>A: depositAddress + 报价
  A->>BR: 在以太坊转 1,000 USDC
  BR->>V: 铸造并 ft_transfer_call 存入
  rect rgb(234, 241, 251)
    C->>V: execute_intents([Alice, Solver])
  end
  V->>O: ft_withdraw → 桥
  O-->>A: MPC 签 BTC 交易并广播
  Note over C,A: deadline 前没成交 → REFUNDED
```

**`execute_intents` 内部。** Fig 8 是一个 receipt 内的检查顺序 [12]。任何一步失败，合约 panic，整笔回滚。最后一步是配平：每个 token 的所有内部增减（包括手续费入账）必须完全撮合 [12]。

```uml q="verifier 收到一批签名 intent 后按什么顺序检查？哪一步保证没人凭空得到资产？" read="源自 engine/mod.rs 和 deltas.rs。检查按图中顺序进行；任何一步失败都会 panic，并回滚整个 receipt。" takeaway="签名、nonce 防重放、配平检查都在同一个 receipt 内；配平检查让环形套利也必然有人亏。"
flowchart TD
  in["execute_intents(signed[])"] --> chk["逐条检查每个签名载荷：<br/>签名 · verifying_contract · deadline<br/>公钥归属 · nonce 未用过"]
  chk -- 全部通过 --> ex["commit nonce，执行 intents<br/>记录每个 token 的增减"]
  ex --> bal{"每个 token 配平？"}
  bal -- 是 --> ok["发 mt_transfer 事件"]
  chk -- 任一失败 --> fail["panic：整笔回滚"]
  bal -- 否 --> fail
```

[[token_diff]] 只声明签名者自己的余额变化，不指定对手方 [12]：

```rust
// near/intents token_diff.rs @4127e8e
pub struct TokenDiff {
    pub diff: TokenDeltas, // TokenId → i128
    pub memo: Option<String>,
    pub referral: Option<AccountId>,
}
// Alice:  usdc -1000, btc +0.0081
// Solver: 方向相反的一份；两份一起提交
```

几个容易忽略的事实 [12][13][14]：
- **谁提交交易**：`intents.near` 账户上有 [[relayer key]]，它是只能调用 `execute_intents`、gas 不限的 FunctionCall key。
- **账户是另一套体系**：verifier 内的账户只是合约里的记录。外链钱包用公钥派生的隐式账户，不用开 NEAR 账户。注册的每个公钥都有完全权限。
- **签名标准**：支持 nep413、erc191、tip191、raw_ed25519、webauthn、ton_connect、sep53 七种。
- **nonce**：256 位，按位图记录，可以乱序、并发使用；versioned nonce 里带 salt 和 deadline。
- **管理员能力**：有角色可以暂停 intents、锁定账户、强制提现。这是信任假设的一部分。

[[1Click]] 把整条流程包成一个 API [14]。字段决定了资金从哪来、到哪去、失败退到哪：

```json
{
  "swapType": "EXACT_INPUT",
  "slippageTolerance": 100,
  "originAsset": "nep141:eth-0xa0b8….omft.near",
  "destinationAsset": "nep141:btc.omft.near",
  "amount": "1000000000",
  "depositType": "ORIGIN_CHAIN",
  "recipient": "bc1q…",
  "recipientType": "DESTINATION_CHAIN",
  "refundTo": "0xAlice…",
  "refundType": "ORIGIN_CHAIN",
  "deadline": "2026-10-07T12:00:00Z"
}
```

费用分三层 [14]：链上协议费 1 pip（0.0001%）；1Click 平台费 20 bps（稳定币对、同资产跨链 1 bp，没有 API key 再加 25 bps）；渠道的 `appFees` 与 1Click 五五分成。

```finding F12 medium
# 10-01 的约 380 万美元事件出在“桥 × verifier”的接口上，不是 L1 共识
结论: 官方归因于 “Omni deposit and withdrawal infrastructure interaction with NEAR Intents smart contract”。资金 10-02 全额归还。截至 10-07 没有技术复盘。
证据: [observed] @near_intents、Polosukhin、Shevchenko 的帖子 [20]（I48、I49）。[inferred] 停用的 11 条链与 HOT Bridge 支持链完全一致，“Omni”很可能指 HOT/Omni（I50）。[speculative] 当天的提交 “refunded amount check in mt_resolve_deposit”“limit number of batch tokens” 可能与根因有关 [21]（I51）。
影响: 单独审计过的模块，组合后仍可能在余额与回调接口上出错。组合产品要按接口做审计和监控。
```

## M Confidential Intents：对谁保密 {depth=2}
Confidential Intents 有两条链 [17]：
- **公链 NEAR**：`intents.near` 记录公共余额，`Treasury` 账户托管被 shield 的资产。
- **[[FAR]]**：NEAR 协议的许可制私有实例。验证者集合小，没有公网 P2P，RPC 只能经认证访问。上面跑同一份 verifier 代码的 `far` 构建，即 `intents.far` [12]。

Fig 9 是 solver 把流动性搬进私有链、成交、再搬出的过程 [17]。

```uml q="资产怎样进入私有链、在里面成交、再回到公链？" read="生产常量：intents.far、Treasury 账户 51e8…7cbe、salt e110f317。第 6 步 swap 和 recover 共用一个 nonce，只有一个能上链。" takeaway="隐私来自许可制私有链 + 私有 relay + 托管桥，不来自密码学；公链上仍能看到 shield 和 unshield 的转账。"
sequenceDiagram
  autonumber
  participant S as Solver
  participant V as intents.near
  participant B as Private PoA Bridge
  participant R as 私有 relay
  participant F as intents.far
  S->>V: shield：transfer 到 Treasury
  B->>F: 铸造 imt:Treasury:nep141:X
  R->>S: IMT 报价请求（白名单 WS）
  S-->>R: swap + recover（同一 nonce）
  R->>F: 提交 swap 或 recover
  Note over F: token_diff 在 FAR 上成交
  S->>F: unshield：imt_burn
  B->>V: 从 Treasury 放出公链资产
```

**谁能看到什么** [14][17]：

| 观察者 | 能看到 | 看不到 |
|---|---|---|
| 公链观察者 | shield / unshield 的转账、金额、时间 | FAR 上的余额与成交 |
| solver | 广播的报价请求、自己的成交 | 文档没说明 |
| 私有 relay 运营方 | 全部报价请求和签名 intent | — |
| FAR 验证者 / RPC | FAR 完整状态（协议不加密状态） | — |
| 1Click 后端 | 用户的机密余额与历史 | — |

```finding F7 high
# Confidential Intents 对公众保密，对运营方不保密；产品页和开发者文档说法不一致
结论: 隐私的信任根是许可制验证者、私有 RPC 和桥运营方。产品页写 “decentralized … validators” 和 “TEE-based bridge”；开发者文档写 “small validator set” 和 “Private PoA Bridge”，没有 TEE 描述。
证据: [observed] 开发者文档与示例 [17]（I34–I38）；产品页 [18]（I41）。[inferred] 表述矛盾与“运营方可见”是对照推出的（I42、I43）。
影响: 评估这类隐私产品，先问“对谁保密”，再问运营方权限和退出路径。
```

时间上，`confidentiality` 参数在 2026-07-01 进入 1Click，B2B 版本在 2026-07-13 上线，私有 relay 同时改为白名单 [17]。另有 [[SHIELD]] 安全层：报价时按规则评估，可以延迟可疑请求；地址筛查接入 TRM Labs 等数据源 [19]。

## N NEAR AI：链外服务，链上接点 {depth=2}
NEAR AI 的运营主体是 Jasnah, Inc. d/b/a NEAR AI [23]。它的产品都在链外。Fig 10 画出各组件和链的接点。

```excalidraw q="NEAR AI 的哪些部分碰到了 NEAR 链？" read="蓝色是 NEAR AI 的链外服务；绿色是链上部分；红色是不在 TEE 里的路由；灰色是用户侧。" takeaway="推理不上链；链只出现在登录（NEP-413）、付费（质押收益）和结算（Intents）三处。" kind=组件关系
{"grid": {"w": 390, "h": 120}, "defaults": {"w": 210, "h": 60, "fontSize": 16},
 "nodes": [
   {"id": "wal", "label": "NEAR 钱包", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "stk", "label": "质押池", "col": 0, "row": 1, "color": "green"},
   {"id": "gw", "label": "Cloud Gateway（TDX）", "col": 1, "row": 0, "color": "blue"},
   {"id": "mdl", "label": "模型 CVM + H200", "col": 2, "row": 0, "color": "blue"},
   {"id": "inc", "label": "Incognito 第三方模型", "col": 2, "row": 1, "color": "red"},
   {"id": "irc", "label": "IronClaw（WASM 沙箱）", "col": 1, "row": 2, "color": "blue"},
   {"id": "mkt", "label": "Agent Market", "col": 0, "row": 2, "color": "blue"},
   {"id": "int", "label": "Intents / Confidential", "col": 0, "row": 3, "color": "green"}
 ],
 "edges": [
   {"from": "wal", "to": "gw", "label": "NEP-413 登录"},
   {"from": "wal", "to": "stk", "label": "质押"},
   {"from": "stk", "to": "gw", "label": "收益→credits", "dashed": true},
   {"from": "gw", "to": "mdl", "label": "路由"},
   {"from": "gw", "to": "inc", "label": "转发", "dashed": true},
   {"from": "irc", "to": "gw", "label": "LLM 调用"},
   {"from": "mkt", "to": "int", "label": "结算"}
 ]}
```

**机密推理怎样验证。** 开源模型跑在 Intel TDX CVM 和 NVIDIA 机密计算 GPU 上，每台 8×H200 [22]。客户端自己验证 attestation，流程见 Fig 11。

```uml q="客户端怎样确认回答来自 TEE 里的模型？" read="真实接口 /v1/attestation/report。客户端是唯一的验证者，验证不上链。" takeaway="attestation 证明的是环境和软件身份；同一模型的实例共享签名密钥，签名匹配不能证明是同一台机器。"
sequenceDiagram
  autonumber
  participant C as 客户端
  participant G as Gateway CVM
  participant M as 模型 CVM + GPU
  participant I as Intel DCAP
  participant N as NVIDIA NRAS
  C->>G: GET /v1/attestation/report?nonce
  G-->>C: gateway 与模型报告
  C->>I: 验证 TDX quote
  C->>C: 核对 nonce、signer、RTMR3
  C->>N: 验证 GPU 证据
  C->>G: completion（可选 E2EE）
  G->>M: 路由到模型
  M-->>C: 带签名的回答
  C->>C: signer 必须唯一匹配已验证报告
```

官方自己写明了这些局限 [22][23]：
- 同一模型的实例共享一把签名密钥，包括测量配置不同的实例。
- [[Incognito]] 路由的 frontier 模型在提供方的基础设施上运行，不在 TEE 里。经 OpenRouter 的路由也不算机密推理。
- Gateway 保留 usage logs；prefix cache 跨客户共享，响应时延可能泄露前缀是否被处理过。

**IronClaw** 是用 Rust 重写的 OpenClaw 类 agent runtime，1.0 在 2026-07-27 发布 [23][24]。它的安全设计在 runtime 层：

```text
// nearai/ironclaw tool.wit @b0b999d
// - WASM tools are untrusted and run in a sandbox
// - All capabilities are opt-in (default: no access)
// - Secrets are NEVER exposed to WASM; credentials are
//   injected at host boundary
// - All outputs are scanned for secret leakage
```

IronClaw 核心代码里没有 NEAR 钱包、Intents 或 Chain Signatures 模块。它和链的接点只有两个：默认推理后端是 `cloud-api.near.ai`，以及 NEP-413 签名登录 [24]。

```finding F8 high
# NEAR AI 在链外运行；链上接点只有登录、付费和结算，而且没有公开用量
结论: 推理不上链，计费在链外按美元记账。质押 NEAR 的收益可以换成推理 credits（2026-07-30 起）。Agent Market 经 Intents 结算，2026-05-14 起支持私有 USDC。Shade Agents 自 2026-04-19 起不再维护。
证据: [observed] docs.near.ai、ToS、博客 [22][23]（N1–N26、N46、N47）；IronClaw 源码 [24]（N29–N38）；Shade Agents 页面 [25]（N44）。[inferred] 没找到任何用量数据（N48）。[speculative] NEAR AI 是否在用 CKD 无法确认（N57）。
影响: “AI 链”的实质是链外 AI 服务 + 链上身份与支付。链能提供的是授权和结算，不是推理。
```

## O 生态：用户在用什么 {depth=2}
先分清指标口径。下面的数字来自不同面板，不能相加 [26][27][28]：

| 指标（2026-10-07 抓取） | 值 | 口径 |
|---|---|---|
| 日交易数（10-06） | 909,765 | nearblocks，自然日 |
| 日活账户（10-06） | 124,809 | 账户，不是人；Intents 由 relayer 上链 |
| 链 TVL | 2.31 亿美元 | DefiLlama |
| Intents 30 天成交 | 44.1 亿 / 32.6 亿美元 | DefiLlama / 官方 explorer |
| Intents 30 天 fees · revenue | 738 万 · 193 万美元 | DefiLlama 定义 |
| L1 gas 费 30 天 | 14.1 万美元 | DefiLlama |

```finding F9 high
# 用户真正接受的是“用现有钱包跨链换资产”，入口在外部渠道
结论: Intents 30 天 fees 约为 L1 gas 费的 52 倍，综合费率约 16.7 bps。24 小时最大的 referral 是 SwapKit（8,845 笔、1,528 万美元），其次是 Rango、ZODL、LI.FI。Brave 和 Ledger 都发布了集成公告。
证据: [observed] DefiLlama、explorer、Brave / Ledger 公告 [26][28][29]（E8、E9、E13、E15、E16）。[inferred] 比值与费率由同源数字算出（E10、E12）。
影响: NEAR 的收入在服务层，不在 L1 gas。从 2026-02-23 起，渠道自动分成，协议收入用于回购 NEAR（E20、E21）。
```

还有两个口径陷阱 [28][29]：
- explorer 上 24 小时最大的 affiliate 是 NEAR 自己的回购钱包 `buybacks.multisignature.near`（约占当日成交 13.6%），这部分不是外部需求。
- Brave 自报 1.1 亿 MAU，那是渠道触达量，不能折算成 Intents 用户。

**其他产品的证据等级** [26][27][30]：

| 功能 | 证据 | 判断 |
|---|---|---|
| Intents 跨链兑换 | 持续成交与 fees，有渠道分成 | ok 强 |
| 原生 DeFi（RHEA、Meta Pool、LiNEAR） | Rhea Lend TVL 1.96 亿美元，但日 fees 在下降 | warn 中 |
| 消费级大规模建户（Sweat、HOT、KaiChing） | 2024 年日活 100–200 万，现在 12.5 万 | no 收缩 |
| Confidential Intents、NEAR AI、IronClaw | 只有上线和集成公告 | warn 无用量 |
| Shade Agents | 2026-04-19 停止维护 | no 反例 |

```finding F10 high
# 大规模建户证明了分发能力，但没有留下持续需求
结论: 日活账户从 2024-06-14 的约 224 万降到 2026-10-06 的约 12.5 万。Sweat 宣布 Sweat Wallet 和当前形态的 SWEAT 在 2026-12-30 结束，原因包括经济模型不可持续和增长放缓。
证据: [observed] nearblocks 日级数据 [27]（E1、E31）；Sweat 公告 [30]（E35、E36）。[speculative] 2026-04 上半月交易数下降约 80% 的原因没有一手归因（E33）。
影响: 账户数、交易数只能当辅助指标。核心要看非激励的重复交易和服务收入。
```

Sweat 的公告还说明了一个架构细节：每个 Sweat Wallet 账户都是 NEAR 账户，用户的 EVM 余额“只要 NEAR Chain Signatures 还在运行就能访问”[30]。

## P NEAR 是“产品驱动 infra”吗？ {depth=2}
先看时间线：叙事、产品和 infra 交替出现 [1][2][31]。

```timeline v
2017 | NEAR.ai | 叙事：AI 项目，2018 转向区块链
nearcore 1.32 | meta tx · 零余额账户 | infra：动机点名 Sweatcoin
2023 | 提出 Chain Abstraction | 叙事
2024-05 | User-owned AI | 叙事
2024-08 | Chain Signatures 主网 · Nightshade 2.0 | 产品 + infra
*2024-11 | Intents beta | 产品：建在 Chain Signatures 之上
PV 64–76 | 为 Sweat、HOT、KaiChing 切分片边界 | infra：由负载驱动
2025-05 | 600 ms 出块 | infra
2026-07 | gas keys · 动态分片 · IronClaw 1.0 | infra + 产品；Confidential B2B 同月上线
2026-09 | SPICE 设计文章 | 计划
2026-10 | Intents 事件 · Sweat 宣布收场 | 反例
```

把协议改动按“谁提出的动机”分三类 [1][2]。Fig 12 左边两组由产品拉动，右边一组由协议自身的目标推动。

```excalidraw q="NEAR 的哪些协议改动是为产品做的？哪些不是？" read="左列是产品或负载，中列是对应改动；右列是动机写着扩展性或安全的改动。虚线框表示仍是 Draft 或计划。" takeaway="产品拉动集中在账户、授权和分片布局；共识与执行层沿协议自己的路线推进。" kind=因果
{"grid": {"w": 300, "h": 90}, "defaults": {"w": 220, "h": 56, "fontSize": 15},
 "nodes": [
   {"id": "p1", "label": "Sweatcoin / NEARCrowd", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "p2", "label": "MPC 签名合约", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "p3", "label": "Chain Sig. 智能钱包", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "p4", "label": "Intents passkey", "col": 0, "row": 3, "color": "gray", "stroke": "dashed"},
   {"id": "p5", "label": "HOT / Sweat / KaiChing", "col": 0, "row": 4, "color": "gray", "stroke": "dashed"},
   {"id": "c1", "label": "NEP-366 meta tx", "col": 1, "row": 0, "color": "green"},
   {"id": "c2", "label": "NEP-519 yield/resume", "col": 1, "row": 1, "color": "green"},
   {"id": "c3", "label": "NEP-591 global contract", "col": 1, "row": 2, "color": "green"},
   {"id": "c4", "label": "NEP-635 P-256（Draft）", "col": 1, "row": 3, "color": "yellow", "stroke": "dashed"},
   {"id": "c5", "label": "分片边界 + prefetcher", "col": 1, "row": 4, "color": "green"},
   {"id": "i1", "label": "NEP-509 无状态验证", "col": 2, "row": 0, "color": "blue"},
   {"id": "i2", "label": "NEP-539 拥塞控制", "col": 2, "row": 1, "color": "blue"},
   {"id": "i3", "label": "NEP-639 动态分片", "col": 2, "row": 2, "color": "blue"},
   {"id": "i4", "label": "NEP-611 gas keys", "col": 2, "row": 3, "color": "blue"},
   {"id": "i5", "label": "SPICE（计划）", "col": 2, "row": 4, "color": "blue", "stroke": "dashed"}
 ],
 "edges": [
   {"from": "p1", "to": "c1"}, {"from": "p2", "to": "c2"}, {"from": "p3", "to": "c3"},
   {"from": "p4", "to": "c4"}, {"from": "p5", "to": "c5"}, {"from": "i5", "to": "i4", "dashed": true}
 ]}
```

一手文本的原话 [1][2]：
- NEP-366（meta tx）：“apps that pay user for doing work (like NEARCrowd or Sweatcoin)”。
- NEP-519（yield/resume）：“a smart contract (`S`) that provides the MPC signing capability”。
- NEP-591（global contract）：“With the advent of chain signatures, the smart contract wallet use case will become more ubiquitous”。
- NEP-611（gas keys）：动机是 SPICE 让执行滞后于纳入，需要防 DoS。这一条不是产品驱动。

演进的顺序也有规律。Chain Signatures 先上线（2024-08），Intents 以 “built on top of Chain Signatures” 的身份后出现（2024-11）[31]。Intents 跑出需求后，又提出了 P-256（NEP-635）和链下授权（NEP-641）[2]。

```finding F11 high
# NEAR 是混合型：产品拉动账户层和分片布局，协议路线推动执行层
结论: 一手文本明说的产品驱动改动集中在账户、授权和容量热点；stateless validation、拥塞控制、动态分片、gas keys、SPICE 的动机写的是扩展性与安全。迭代顺序是 infra 先铺能力、产品筛选需求、需求再反推 infra。
证据: [observed] NEP 原文与 CHANGELOG [1][2]（E40–E45、A9、A31）；主网分片边界 [1][4]（O2、O6）。[inferred] 三类划分与迭代顺序由这些证据推出（O12、O13）。
影响: “产品驱动 infra”在 NEAR 是真的，但只发生在离产品近的层。执行层的大改动仍需要长期研究路线。
```

反例同样重要：BOS 已不出现在官方的《History of NEAR》里；Shade Agents 停止维护；DelegateV2 在 2.13 上线、2.14 又为 SPICE 撤回 [1][25][31]。

## Q 对 Mantle 的意义 {depth=2}
前提：Mantle 是 OP Stack 系 rollup，状态由 OP Succinct 有效性证明验证，gas 代币是 MNT，执行层是同步 EVM [33]。下面的建议都是推论，不是路线承诺。

```finding F13 high
# NEAR Intents 目前不支持 Mantle；接入门槛在需求和流动性，不在技术
结论: 1Click 的 204 个资产分布在 37 条链上，没有 Mantle。新链评估看用户需求、技术兼容、流动性和审计，优先考虑已有做市商流动性和兼容的签名标准。
证据: [observed] 1Click `/v0/tokens` 与 chain-support 页 [32]（O8、O9）。[inferred] Mantle 是 EVM 链，erc191 签名已支持，所以门槛主要在需求与做市商（O10）。
影响: 在自建 solver 网络之前，先争取被现有 intent 网络接入，成本低得多。
```

按可执行程度排序：

1. **把能力包装成被分发的服务接口。** 目标场景是“从任何链、任何钱包买到 Mantle 核心资产（例如代币化股票）”。把它做成报价 API，交给钱包和聚合器分发。NEAR 的收入来自这一层，不来自 gas（F9，O14）。
2. **先接入现成网络，再决定自建。** 先争取 NEAR Intents 或同类网络支持 Mantle，用真实订单验证需求（F13）。
3. **不要照搬托管账本。** NEAR 把余额集中进一个合约，是为了在异步模型下得到原子结算。Mantle 的 JIT 路由已经能在一笔交易内读状态、重算、执行；照搬只会多出存入、提现、桥和升级权限的风险（F2，O15）。
4. **隐私先做 RFQ 层（推测）。** 先验证“订单成交前不暴露、maker 报价不泄露”的需求。确实要隐藏余额时，再评估私有 L3，并把运营方权限和退出路径写清楚（F7，O16）。
5. **agent 先做受限执行与支付（推测）。** 链能提供的是额度、收款方、目标合约、撤销这些授权约束，以及结算（F8，O17）。
6. **账户数不等于需求。** 用非激励的重复交易、含全部费用的成交价、退款尾延迟、渠道收入做核心指标（F10，O18）。
7. **按接口审计组合系统。** 桥、结算合约和链下服务组合成一个产品时，接口是最大的风险点（F12）。

```callout warn CAUTION
NEAR 的分片和异步执行是为横向扩展付出的代价，不是产品优势本身。Mantle 的核心交易路径依赖同笔交易内的原子性；不要为了“intent”这个名字放弃它。
```

## R 局限与开放问题 {depth=2}
- **用量数据缺口**：以下数据都没有公开：Intents 唯一用户与留存、Confidential Intents 占比、NEAR AI 调用量。F8、F10 的“没有用量”是“没找到”，不是“为零”。
- **私有部分不透明**：FAR 的验证者数量与身份、Private PoA Bridge 是否在 TEE 里、Treasury 私钥由谁持有，都没有公开说明。
- **1Click 的托管细节**：ORIGIN_CHAIN 路径下 deposit address 由谁控制、用户侧 `token_diff` 由谁代签，文档没有写。
- **10-01 事件**：官方承诺的技术复盘截至 10-07 未发布。F12 的根因部分只有推断和推测。
- **推测项**（页面上已标明）：NEAR AI 是否用 CKD（N57）；2026-04 链上活动断崖的原因（E33）；HOT 3,000 万用户（E38，未写进页面结论）；事件根因（I51）；Mantle 建议 4、5（O16、O17）。
- **口径**：DefiLlama 与官方 explorer 的 30 天成交相差约 35%，原因未知。
- **没回答的问题**：RPC 字段 `dynamic_resharding: false` 的含义；主网何时上调分片上限；SPICE 的上线版本。

## S 方法与证据 {depth=3}
- **分工**：五路并行调研（L1、链抽象、Intents、AI、生态），加主会话的抽查、链上补查和 Mantle 部分。每路只写自己的笔记和台账，最后合并成 314 行台账。
- **源码**：nearcore @090da31、NEPs @dcc0bcb、near/intents @4127e8e、near/mpc @e968367、nearai/ironclaw @b0b999d。代码片段都来自这些 commit。
- **链上**：NEAR 主网 RPC（`status`、`EXPERIMENTAL_protocol_config`、`v1.signer.state()`）；nearblocks API；DefiLlama API；Intents explorer；1Click `/v0/tokens`。
- **抽查**：主会话复核了 5 条 observed 论断（主网版本、Intents 30 天成交与 fees、relayer key 源码、NEP-519 动机、MPC 门限），全部一致。
- **外部调研**：ChatGPT Deep Research 只当线索 [35]。被修正的主要有：Chain Signatures 只能 outbound、gas keys 由产品驱动、CKD 连接 AI、“链内 DEX 1,788 万”、MPC “8 nodes”、动态分片是否真的拆过。

## T 复现 {depth=3}
需要 `curl`、`jq`、`python3`。数值会随时间漂移，预期值是 2026-10-07 的结果。

1. 查主网协议版本：

```bash
curl -s https://rpc.mainnet.near.org/status \
  | jq '{pv: .protocol_version, v: .version.version}'
# 预期：{"pv": 86, "v": "2.13.4"}
```

2. 查分片布局：

```bash
curl -s https://rpc.mainnet.near.org -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"EXPERIMENTAL_protocol_config",
       "params":{"finality":"final"}}' \
  | jq '.result.shard_layout.V3 | {boundary_accounts, last_split}'
# 预期：9 个边界账户（含 game.hot.tg、wallet.ka），last_split 5
```

3. 查 MPC 合约的 domain 与门限：

```bash
curl -s https://rpc.mainnet.near.org -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{
       "request_type":"call_function","finality":"final",
       "account_id":"v1.signer","method_name":"state","args_base64":"e30="}}' \
  | jq -r '.result.result | implode' | jq '.Running.domains.domains'
# 预期：4 个 domain，purpose 为 Sign、Sign、CKD、ForeignTx，门限都是 11
```

4. 查 Intents 30 天 fees 与成交：

```bash
curl -s "https://api.llama.fi/summary/fees/near-intents?dataType=dailyFees" | jq .total30d
curl -s "https://api.llama.fi/summary/dexs/near-intents" | jq .total30d
# 预期：约 7384225 与约 4414741164
```

5. 查 1Click 支持的链里有没有 Mantle：

```bash
curl -s https://1click.chaindefuser.com/v0/tokens \
  | jq '[.[].blockchain] | unique | (length, index("mantle"))'
# 预期：37，null
```

## U 术语表 {depth=2}
```glossary
access key | 访问密钥 | 挂在 NEAR 账户上的公钥。一个账户可以有多把，分 FullAccess 和 FunctionCall 两类。 | 不是账户地址
FunctionCall key | 受限 key | 只能调用指定合约的指定方法，allowance 只限制 gas 费，不能附带 NEAR。 | allowance 不是资产额度
gas key | gas 密钥 | 带独立预付 gas 余额、最多 1,024 条 nonce lane 的 access key，PV 86 起在主网可用。
receipt | 收据 | NEAR 的执行单元。一个 receipt 只读写一个账户的状态；跨账户调用会生成新 receipt。 | 不是交易回执
callback | 回调 | 被调合约执行完后，在调用方合约上执行的方法。无论成功失败都会执行。
shard | 分片 | 按账户名区间划分的状态分区。一个账户只能在一个分片里。
chunk | 分片块 | 一个分片在一个区块里的交易与 receipt 集合。
chunk producer | 分片出块者 | 持有分片状态、产出 chunk 和 state witness 的验证者。
chunk validator | 分片验证者 | 不存状态、按 stake 抽样分配，用 witness 重新执行并签 endorsement 的验证者。
state witness | 状态见证 | 执行一个 chunk 所需的状态子集加包含证明。 | 不是 validity proof
stateless validation | 无状态验证 | NEP-509 的验证方式：抽样的 validator 拿 witness 重新执行，2/3 分片 stake 背书后 chunk 才能进块。
dynamic resharding | 动态分片 | 分片内存超过阈值时，在 epoch 边界自动拆分。主网上限目前是 10 个分片。
congestion control | 拥塞控制 | 目标分片拥塞时限制新交易和发往它的 receipt，防止队列无限增长。
yield/resume | 挂起与恢复 | 合约挂起一个回调，等链外结果到达再恢复；最多等 200 个区块。
global contract | 全局合约 | 部署一次、多个账户引用的合约代码。可以按 hash（不可变）或按账户（可升级）引用。
storage staking | 存储质押 | 按状态字节锁定 NEAR，主网是每 100 KB 锁 1 NEAR。
PV | 协议版本 | NEAR 的协议版本号，主网当前为 86。代码里的特性版本号不等于主网激活版本。
SPICE | 共识与执行分离 | Near One 正在研究的架构：链只排序，执行和数据分发异步推进。代码里还不在 nightly。 | 不是现状
Chain Signatures | 链签名 | NEAR 合约 `v1.signer` 加 MPC 网络，让 NEAR 账户控制其他链的地址。 | 不是跨链桥本身
MPC | 多方计算 | 多个节点各持私钥份额，达到门限才能合作产出签名。主网门限 11/17。
domain | 签名域 | MPC 合约里的一组根密钥及其用途。主网有 4 个：两个签名、CKD、外链交易验证。
CKD | 机密密钥派生 | MPC 网络给 TEE 应用派生确定性密钥，并加密返回。MPC 合约本身不检查 TEE。
foreign-tx | 外链交易验证 | MPC 节点查询外链交易，再对查询结果做门限签名。信任 RPC 一致性，不是 light client。
TEE | 可信执行环境 | CPU 或 GPU 里的隔离环境，外部包括运营方无法读写其中的内存。
TDX | Intel Trust Domain Extensions | Intel 的虚拟机级 TEE，NEAR AI 和 MPC 节点都用它。
attestation | 远程证明 | 硬件签发的报告，证明机器运行的镜像和配置。 | 不证明输出正确
verifier | 验证合约 | NEAR Intents 的结算合约 `intents.near`，一个多资产账本。
token_diff | 余额变化 intent | 签名者声明自己各 token 余额的增减。对手方签相反的一份，合约检查配平。
solver | 求解者 | 报价并提供对手方流动性的做市方。链上不设白名单，链下 relay 需要 JWT 与 KYC。
Message Bus | 消息总线 | 链外 RFQ 中继：广播报价请求、收集 solver 签名、打包提交结算。
1Click | 一键 API | 把报价、入金、结算、出金、退款包成一个 HTTP API 的分发接口。
relayer key | 中继密钥 | `intents.near` 账户上只能调用 `execute_intents` 的 FunctionCall key。
Omni Bridge | Omni 桥 | Near One 运营的桥。入站用 light client 或 Wormhole，出站用 NEAR MPC 签名。
PoA Bridge | 权威证明桥 | 中心化运营方负责铸造与外链放款的桥，只有 owner 能 mint。
HOT Bridge | HOT 桥 | HOT Protocol 的桥，用它自己的 MPC 验证者签署出入金证明。
FAR | 私有 NEAR 分叉 | Confidential Intents 用的许可制 NEAR 实例，没有公网 P2P，RPC 需认证。
IMT | Intents 多资产代币 | FAR 上的私有资产，形如 `imt:<Treasury>:nep141:<token>`，由公链 Treasury 1:1 托管。
shield | 屏蔽 | 把公链资产转进 Treasury，并在 FAR 上铸造等额 IMT。反向操作叫 unshield。
SHIELD | Intents 安全层 | Intents / 1Click 的事件与策略服务，可按规则延迟可疑报价。 | 不是 shield 操作
NEP-413 | 链下签名消息标准 | NEAR 钱包签名任意消息的标准，Intents 和 NEAR AI 登录都用它。
Incognito | 匿名转发路由 | NEAR AI Cloud 把请求转发给 OpenAI 等第三方模型的路由。模型不在 TEE 里。
IronClaw | agent runtime | NEAR AI 的 Rust agent 运行时，用 WASM 沙箱和能力授权约束工具调用。
Shade Agents | 影子 agent 框架 | TEE agent 加链上合约验证加 Chain Signatures 的框架，2026-04-19 起不再维护。
Agent Market | agent 市场 | NEAR AI 的任务市场，经 Intents 结算，2026-05 起支持私有 USDC。
```

## V 参考资料 {depth=2}
1. [nearcore @090da31](https://github.com/near/nearcore/tree/090da3191758c75787ce14569528bf0e9d71246c) — `docs/architecture/how/`、`CHANGELOG.md`、`version.rs`、`parameters.yaml`、`epoch_configs/mainnet/`。**PRIMARY**
2. [NEPs @dcc0bcb](https://github.com/near/NEPs/tree/dcc0bcbd452f68c936696e5f9552e567c3b162e0/neps) — NEP-366、509、519、539、591、611、635、639、641 的动机与规格。**PRIMARY**
3. [docs.near.org](https://docs.near.org/smart-contracts/anatomy/crosscontract) — 跨合约调用、access key、yield/resume、global contracts。**PRIMARY**
4. [NEAR 主网 RPC](https://rpc.mainnet.near.org/status) — 协议版本、分片布局、`v1.signer` 状态（见复现）。**PRIMARY**
5. [Scaling NEAR to 1M TPS](https://blog.nearone.org/announcement/2025/12/11/scaling-near-to-1m-tps.html) — 基准测试条件与优化。**PRIMARY**
6. [SPICE Part 1](https://blog.nearone.org/research/2026/09/30/spice-01-intro.html) — SPICE 要解决的耦合与架构。**PRIMARY**
7. [Blink and It's Final](https://www.near.org/blog/blink-and-its-final-near-launches-600-ms-blocks-and-1-2-s-finality) 与 [Introducing Dynamic Resharding](https://www.near.org/blog/introducing-dynamic-resharding) — 600 ms 出块、分片历史。**PRIMARY**
8. [near/mpc @e968367](https://github.com/near/mpc/tree/e96836796331de4226d9a3dd8fbe7dfc8a65ffdd) — `sign`、`respond`、KDF、CKD、foreign-tx、TEE 设计。**PRIMARY**
9. [What are Chain Signatures?](https://docs.near.org/chain-abstraction/chain-signatures) — 官方流程与重放警告。**PRIMARY**
10. [NearBlocks Chain Signatures](https://nearblocks.io/chain-signatures) — 运营方、门限、TEE 状态与交易记录。**PRIMARY**
11. [Confidential Key Derivation in the MPC Network](https://blog.nearone.org/research/2026/02/23/mpc-ckd.html) — CKD 机制与用途。**PRIMARY**
12. [near/intents @4127e8e](https://github.com/near/intents/tree/4127e8e8fbe4206fa910c4fe7f8028c9e0972348) — verifier、`token_diff`、nonce、relayer key、PoA、`far` 构建。**PRIMARY**
13. [Verifier Contract](https://docs.near-intents.org/integration/verifier-contract/introduction) — intent 类型、账户抽象、存取款。**PRIMARY**
14. [Message Bus](https://docs.near-intents.org/integration/market-makers/message-bus/introduction)、[1Click 请求](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request) 与 [Fees](https://docs.near-intents.org/resources/fees) — RFQ、字段、状态机、费率。**PRIMARY**
15. [Token Bridges](https://docs.near-intents.org/integration/bridging/overview) 与 [Omni Bridge](https://docs.near-intents.org/learn/omni-bridge/overview) — 三座桥与信任模型。**PRIMARY**
16. [HOT Bridge](https://docs.hotdao.ai/omni-tokens) — HOT 的 Locker 与 MPC 验证者。**PRIMARY**
17. [Confidential Intents](https://docs.near-intents.org/integration/market-makers/confidential-intents) 与 [Changelog](https://docs.near-intents.org/changelog/overview) — FAR、shield、私有 relay、上线时间。**PRIMARY**
18. [intents.near.org/confidential](https://intents.near.org/confidential) — 产品页说法。**PRIMARY**
19. [Proactive Intents Security](https://docs.near-intents.org/security-compliance/proactive-intents-security) 与 [Risk & Compliance](https://docs.near-intents.org/security-compliance/risk-and-compliance) — SHIELD 与地址筛查。**PRIMARY**
20. [@near_intents 事件公告](https://x.com/near_intents/status/2105642219357241796)、[@ilblackdragon](https://x.com/ilblackdragon/status/2106072953570181155)、[@AlexAuroraDev](https://x.com/AlexAuroraDev/status/2106049685928677585) — 10-01 事件与资金归还。**PRIMARY**
21. [near/intents commits](https://github.com/near/intents/commits/main) — 10-01 / 10-02 的修复提交与 v0.4.3、v0.4.4。**PRIMARY**
22. [docs.near.ai](https://docs.near.ai/cloud/private-inference) — 架构、attestation 验证、模型路由。**PRIMARY**
23. [near.ai 博客](https://near.ai/blog) 与 [Terms of Service](https://near.ai/terms-of-service) — IronClaw 1.0、Staking for AI、Agent Market、USDC 支付、“Assume We're Lying”、运营主体。**PRIMARY**
24. [nearai/ironclaw @b0b999d](https://github.com/nearai/ironclaw/tree/b0b999d96781516ee05e6ba961d6f3ead900da96) — WASM 沙箱、NEP-413 登录、默认后端。**PRIMARY**
25. [Shade Agents](https://docs.near.org/ai/shade-agents/introduction) — 停止维护声明。**PRIMARY**
26. [DefiLlama API](https://api.llama.fi/summary/fees/near-intents?dataType=dailyFees) — TVL、Intents 成交与 fees、L1 gas 费、Fees / Revenue 定义（面板）。
27. [nearblocks charts API](https://api.nearblocks.io/v1/charts) — 日交易、活跃账户、新建账户（链上索引）。
28. [NEAR Intents Explorer](https://explorer.near-intents.org/) 与 [revenue.near.org](https://revenue.near.org) — 官方成交、referral、affiliate、收入钱包。**PRIMARY**
29. [Brave](https://brave.com/blog/near-intents/) 与 [Ledger](https://www.ledger.com/blog-near-intents-joins-ledger-wallet-via-swapkit) — 渠道集成公告。**PRIMARY**
30. [Sweat Foundation update](https://update.swe.at/) — Sweat Wallet / SWEAT 收场与原因。**PRIMARY**
31. [History of NEAR](https://www.near.org/roadmap-history) — 官方叙事时间线。**PRIMARY**
32. [1Click tokens](https://1click.chaindefuser.com/v0/tokens) 与 [Supported Chains](https://docs.near-intents.org/resources/chain-support) — 支持链与新链标准。**PRIMARY**
33. [L2BEAT: Mantle](https://l2beat.com/scaling/projects/mantle) — Mantle 的 Stage、证明与 DA（第三方分析）。
34. 内部资料：research-hub 报告 `uniswap-v4-hooks`、`mantle-best-routing-report`、`atomic-synchronous-composability`；vault《2026 链抽象+意图交易+预测市场》《性能和 ux 提升计划》— Mantle 正在评估的方向。
35. ChatGPT Deep Research：near-deep-dive.md — 外部调研，只作线索。

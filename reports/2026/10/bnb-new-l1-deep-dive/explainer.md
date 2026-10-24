---
template: research
title: BNB New L1 全面解构：Native AA、异步执行、20ms 子区块、隐私池与 LtHash
subtitle: New L1 是 BSC 的互补链，不是替代品。它的核心改动是“投票只签顺序、执行延后几块”；并行 EVM 还在设计；0x76 AA 与 Tempo 几乎逐项相同；隐私池超出了支付，但不是隐私 DeFi；“格”只用在状态承诺上，全栈没有 PQ 签名。
cols: 4
type: 技术调研 · 架构解构 · 跨方案对比
audience: 老板与团队：懂 EVM 和 L2 架构，没有读过 New L1 的文档
scope: New L1 的定位、共识、区块与子区块、异步 / 并行执行、Native AA、隐私池、状态承诺与 PQ；对比 BSC、Tempo、EIP-8130、应用特定排序
evidence: 210 条论断台账（observed 174 / inferred 31 / speculative 5）；官方文档快照 bnb-chain.github.io@ef5a632（2026-10-22）；BEPs、bsc / op-geth release、Tempo / EIP-8130 / SIMD-0215 原文、ePrint 2026/2083；客户端源码未公开，没有实测；访问于 2026-10-24
date: 2026-10-24 · v1
---
结论先行，分五点：

1. **BNB 没有放弃 BSC。** 官方原话是 New L1 “complements BSC rather than replacing it”。它用 BNB 做 gas，不发新币。现在只有内部 devnet，计划 2026 年底 testnet、2027 年初 mainnet（[F1](#F1)）。
2. **最大的改动是时间结构，不是多线程。** 验证者只对交易顺序投票；执行在后台跑，结果晚 D 块写进链里（[F2](#F2)）。文档里的“并行 EVM”只有一句话，标注“Detailed design is in progress”（[F3](#F3)）。代价是按声明的 gas_limit 收费、不退款（[F4](#F4)）。
3. **20 ms 子区块是出块者签名的可撤销承诺，不是共识对象。** 共识仍是 BSC 的 Parlia PoSA，验证者最多 64 个（[F5](#F5)、[F7](#F7)）。排序–执行分离和应用特定排序是两回事（[F9](#F9)）。
4. **0x76 Native AA 和 Tempo 的交易几乎逐项相同：** 类型号、字段名、预编译名和 gas 常量都一致（[F10](#F10)）。隐私池能用池内余额调用公开合约，所以不只是支付；但调用本身全公开，也只支持 BNB（[F12](#F12)）。
5. **“格”只用在状态承诺（LtHash）上，不是 Falcon，全栈没有 PQ 签名。** 同一组 LtHash 参数在 2026-09 被公开了约 2^81 次查询的碰撞攻击，New L1 文档还写着 “~128-bit”（[F14](#F14)、[F15](#F15)）。

## A 一张表看全栈 {sheet meta="按层"}
```tree list
定位 | BSC 的互补链；BNB 做 gas，不发新币
共识 | Parlia PoSA + BLS 快速最终性
  改了什么 | 200 ms 出块；投票只签顺序；最多 64 个验证者
区块 | 200 ms 区块 + 约 20 ms 子区块（预确认）
交易路由 | 无全局 mempool；Gateway 单跳交给出块者
执行 | reth / revm；异步执行，结果晚 D 块上链
  并行 EVM | access-list 方向，设计中
资源隔离 | Multi-Lane：按合约地址保底 gas
账户 | 0x76 原生 AA（Tempo 同款）
隐私 | ShieldedPool + 0x77，只支持 BNB
状态 | flat KV + LtHash 累加器，无 MPT
```

## B 关键数字 {sheet span=2 meta="文档 @ef5a632"}
| 量 | New L1 | BSC（对照） |
|---|---|---|
| 出块间隔 | 200 ms | 450 ms |
| 每个出块者连出 | 16 块（3.2 s） | 16 块（7.2 s） |
| 验证者 | 最多 64 | 45（21 + 24） |
| 排序最终性 | 常见 +2 块，约 0.5 s（目标） | 约 1.125 s |
| 预确认 | 约 20 ms（目标；路线图写 sub-50ms） | — |
| 执行延迟 D | 1 … D_MAX（论坛初步：最多 8 块） | 0（同步执行） |
| 0x76 单笔 | 1–64 个调用；≤ 128 KiB | — |
| 单笔 gas 上限 | 16,777,216（BEP-652） | — |
| LtHash 累加器 | 1024 × u16 = 2 KB | MPT |

## C 成熟度 {sheet meta="2026-10-22 文档"}
| 组件 | 状态 |
|---|---|
| 200 ms 出块、BLS 最终性 | ok devnet 在跑（只有内部网） |
| 0x76 AA、key 管理 | ok devnet 跑通 |
| 隐私池全流程 | warn devnet 跑通；未审计，导入 SRS |
| 约 20 ms 预确认 | warn 可订阅；20 ms 是目标值 |
| 异步执行、自适应 D | warn 写成机制；D_MAX 未公布 |
| access-list 并行 EVM | no 设计中 |
| BSC↔New L1 桥 | no 开发中，地址占位 |
| ERC-20 隐私、PQ 授权 | no 未实现 |
| 公开 testnet / mainnet | no 计划 2026 年底 / 2027 年初 |

## D 和谁像 {sheet span=2 meta="谱系"}
| New L1 的部分 | 来自 / 最像 | 差别 |
|---|---|---|
| 共识 | BSC Parlia + BEP-126 | 投票只签顺序；执行被证伪时弃权 |
| 异步执行 | Monad（D = 3）、EIP-7886（D = 1） | D 随负载变；按声明 gas 收费 |
| 0x76 AA | Tempo Transaction（同为 0x76） | 去掉 fee_token 与 7702 委托；不退 gas |
| Multi-Lane | BSC Payment Lane（BEP-703） | 多条 lane；闲置配额回流 |
| LtHash | Solana SIMD-0215 | 参数相同；条目编码不同 |
| 隐私池 atomic call | Railgun 的 unshield → 调用 → reshield | 调用回滚时花费不撤销 |

## E 时间线 {sheet span=2 meta="2022–2027"}
```timeline
2022-10 | Parallel EVM 2.0 | 只在 NodeReal 分叉，只支持 full sync
2024-06 | BEP-396 TxDAG | 至今是 Draft
2026-03-18 | Tempo 主网上线 | 0x76 AA 先在这里出现
2026-05-19 | BSC 删除 BEP-592 | “decide to follow upstream”
2026-07-08 | H2 路线图公布新 L1 | 100K+ TPS、sub-50ms
2026-09-18 | ePrint 2026/2083 | LtHash16 约 2^81 碰撞攻击
*2026-10-22 | New L1 文档上线 | devnet 阶段
2026 年底 / 2027 年初 | testnet / mainnet | 计划
```

## F 结论 {sheet span=4}
```callout ok New L1 = 一条按 200 ms 节奏重写时间结构的 BSC 兄弟链；各项新能力都有现成同类，差别最大的是“只对顺序投票 + 自适应执行延迟”
- 定位：互补链，BNB 做 gas，不发新币；只有内部 devnet（F1）。
- 执行：共识只定顺序，执行晚 D 块写回；并行 EVM 还没设计完；按声明 gas 收费（F2–F4）。
- 区块：约 20 ms 子区块是出块者签名的预确认，可撤销，不进共识（F5、F6）。
- 共识：仍是 Parlia PoSA，最多 64 个验证者；Minimmit 是 Consensus 2.0 候选（F7）。
- 排序：排序–执行分离不给应用排序权；Multi-Lane 只保容量（F9）。
- 账户：0x76 是 Tempo 设计的 BNB 变体；签名方案由协议固定（F10、F11）。
- 隐私：能用池内余额调公开合约，但调用全公开、只支持 BNB、未审计（F12、F13）。
- PQ：LtHash 是状态承诺，不是签名；全栈没有 PQ 签名；参数有新的碰撞攻击（F14、F15）。
- 从哪里读：时间结构看 J、L，共识看 K，BSC 前史看 M。
- 排序看 N，AA 看 O，隐私看 P，PQ 看 Q，对我们的意义看 R。
```

## G 如何阅读 {depth=1}
```callout info 系列导航
相关前文：[《BSC 近期开发方向》](/p/bsc-recent-development/)讲现有 BSC 的 CAS20 与 Payment Lane；[《Native AA：EIP-8130 与 EIP-8141》](/p/native-aa-eip-8130-8141/)讲以太坊侧的原生 AA；[《应用特定排序》](/p/application-specific-sequencing/)讲 ASS；[《后量子签名选型》](/p/pq-signature-selection/)讲 Falcon 等 PQ 签名。本篇引用它们，不重复展开。
```

```callout info 默认你已知道（本文不解释）
- EVM 交易、gas、EIP-1559 的 base fee 与 priority fee
- 区块链要先对区块达成共识，节点再执行交易、更新状态
- 以太坊用 Merkle-Patricia trie（MPT）承诺状态，`eth_getProof` 能给出某个账户的证明
- ERC-4337 用 bundler 和 EntryPoint 在协议外实现账户抽象
- ZK 证明能让验证者不重做计算，就相信某个计算结果正确
```

- **5 分钟**：读导语和总览 A–F。
- **30 分钟（老板 / 产品）**：再读[背景动机](#panel-H)、[一笔交易怎么走](#panel-J)、[对我们的意义](#panel-R)。
- **30 分钟（工程）**：读[前置知识](#panel-I)，再按兴趣读 [J](#panel-J)–[Q](#panel-Q)。
- **要复核的人**：再读[方法与证据](#panel-T)和[复现](#panel-U)。

**贯穿全文的例子（示意，非真实交易）**：Alice 用手机 passkey 开了一个 New L1 账户。她给自己的交易机器人发了一把 access key：只能调用某个 DEX 路由合约的 `swap`，每天最多花 50 BNB，7 天后过期。机器人用这把 key 发一笔 `0x76` 交易，在 DEX 上把 BNB 换成代币。后来 Alice 又把 10 BNB 存进隐私池，从池里直接调用一个公开合约（例如 DEX），返回的 BNB 回到池里。

## H 背景动机 {depth=2}
**问题。** BSC 是“先执行、再投票”的链：出块者执行完全部交易才能提出区块，验证者重执行后才投票 [5]。在 450 ms 出块下，执行预算只占出块时间的一部分。BNB Chain 想做高频交易、实时支付和 agent 交易，目标是 100K+ TPS、sub-50ms 预确认、亚秒最终性 [14]（C7）。官方的判断是：这些改动 BSC 没法改造进去，所以另起一条链 [15]（C1）。

**为什么现在。**
- 2026-07-08，H2 2026 技术路线图公布新 L1，计划 2026 年底 testnet、2027 年初 mainnet [14]（C6）。
- 2026-07-14，BNB Chain 论坛开了 NewL1 分区，置顶帖写明它与 BSC 互补 [15]（C1）。
- 2026-10-22，官方文档站上线完整的 New L1 设计文档，状态是 devnet [1]（C4）。

```finding F1 high
# BNB 没有放弃 BSC：New L1 是互补链，现在只有内部 devnet
claim: 论坛置顶帖原话：“It complements BSC rather than replacing it”。BSC 继续服务现有生态，New L1 承接 BSC 改不动的工作负载。BNB 是唯一原生资产，不发新币，经官方原生桥从 BSC 进入；桥还在开发。现在只有内部多验证者 devnet，没有公开 RPC、Chain ID 和客户端源码。路线图计划 2026 年底 testnet、2027 年初 mainnet。
evidence: [observed] 论坛 [15]；Overview [1]；Migrating from BSC [11]；FAQ [13]；路线图 [14]；bnb-chain GitHub 组织检索（C1–C4、C6、C50）。
implication: 现在能评估的只有设计文档。BSC 生态不需要迁移；New L1 瞄准的是 BSC 改不动的新工作负载。
```

**范围。**
- 定位与时间线；共识；区块与子区块；交易路由；
- 异步执行、并行 EVM，以及 BSC 此前的并行执行研究；
- 排序–执行分离与应用特定排序（ASS）的关系；Multi-Lane；
- 0x76 Native AA，与 Tempo、EIP-8130、EIP-7702、ERC-4337 对比；
- 隐私池；LtHash 状态承诺与各组件的 PQ 状态。

**非目标。**
- 代币价格与投资建议；对任何公司的建议；
- 独立运行 devnet 或测速（客户端源码未公开，见 [F1](#F1)）；
- opBNB、Greenfield；EIP-8130、ASS、PQ 签名本身的展开（见前文）。

**判断标准（先于结论定下）。**
1. 每条论断标明成熟度：devnet 已跑、文档写成的设计、尚未实现。
2. 路线图、论坛和文档说法不同时，列出全部说法，不挑一个。
3. “像不像 X”只比较两边原文能对上的字段和数值。

## I 前置知识 {depth=2}
```excalidraw q="读懂 New L1，要先懂哪些概念？按什么顺序？" read="灰色虚线框是默认已知；蓝框是下面的卡片；绿框是本文主题。箭头表示先学 → 后学。" takeaway="B-0、B-1 讲时间结构；B-2 讲 AA；B-3、B-4 讲隐私与状态承诺；B-5 用来判断排序问题。" name=prereq-map kind=前置知识地图
{"grid": {"w": 290, "h": 100}, "defaults": {"w": 220, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "k1", "label": "共识与执行（已知）", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "k2", "label": "EVM 交易（已知）", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "k3", "label": "ZK 证明（已知）", "col": 0, "row": 3, "color": "gray", "stroke": "dashed"},
   {"id": "k4", "label": "MPT 状态树（已知）", "col": 0, "row": 4, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 Parlia 与 BLS 最终性", "col": 1, "row": 0, "color": "blue"},
   {"id": "b1", "label": "B-1 异步执行", "col": 2, "row": 0, "color": "blue"},
   {"id": "b5", "label": "B-5 应用特定排序", "col": 2, "row": 1, "color": "blue"},
   {"id": "b2", "label": "B-2 原生 AA 交易", "col": 1, "row": 2, "color": "blue"},
   {"id": "b3", "label": "B-3 隐私池 note 模型", "col": 1, "row": 3, "color": "blue"},
   {"id": "b4", "label": "B-4 同态哈希 LtHash", "col": 1, "row": 4, "color": "blue"},
   {"id": "top", "label": "New L1", "col": 3, "row": 2, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "k1", "to": "b0"}, {"from": "b0", "to": "b1"}, {"from": "b1", "to": "top"},
   {"from": "b0", "to": "b5"}, {"from": "b5", "to": "top"},
   {"from": "k2", "to": "b2"}, {"from": "b2", "to": "top"},
   {"from": "k3", "to": "b3"}, {"from": "b3", "to": "top"}, {"from": "k4", "to": "b4"}, {"from": "b4", "to": "top"}
 ]}
```

```prereq B-0 l1 4min
# Parlia PoSA 与 BLS 快速最终性
what: Parlia 是 BSC 的共识：按质押选出一组验证者，轮流出块，每人连出 16 块。快速最终性是叠加的一层投票。验证者用 BLS 签名对区块头投票，凑够 2/3 就聚合进下一个区块头。
why: New L1 沿用这套共识，只改了三处：出块间隔、验证者上限，以及“投票签什么” [2]（C30、C33）。
example: 区块 N 的投票写进 N+1 → N 被 justify；N+1 的投票写进 N+2 → N 被 finalize。200 ms 出块下约 0.5 s [2]（C34、C35）。
misconception: 误解：PoSA 就是 PoA。事实：验证者按质押每天选举，作恶会被 slash；但集合有上限，不是无许可 PoS（C45）。
deeper: [18] BEP-126 §4.1
```

```prereq B-1 l1 4min
# 异步执行（execution 与 consensus 解耦）
what: 传统链在提出区块前就要执行全部交易，区块头里带执行后的 `state_root`。异步执行把两步拆开：共识只定交易顺序；执行在后台跑，结果写进之后某个区块。顺序一旦确定，结果就确定了，执行只是把它“算出来”。
why: 200 ms 里放不下“执行 + 全网重执行 + 投票”。New L1 的整个设计都建立在这个拆分上 [5]（X4、X6）。
example: Monad 把区块 N 的结果写进 N+3；EIP-7886 写进 N+1；New L1 写进 N+D，D 随负载变 [5][31][32]（X20）。
misconception: 误解：异步执行就是并行执行。事实：前者改的是“何时执行”，后者改的是“一个区块内怎么执行”。
deeper: [5] Async Execution
```

```prereq B-2 l1 3min
# 原生 AA 交易
what: 用一种新的交易类型（EIP-2718 envelope）把批量调用、代付、passkey 签名、受限 session key 写进协议。节点直接验证，不需要 bundler、EntryPoint 或合约钱包。
why: New L1 的 `0x76` 就是这种交易，它和 Tempo 的交易高度一致 [7][33]（A1、A34）。
example: 一笔 `0x76` 带 1–64 个调用，只有一个外层签名、一个 nonce、一张回执 [7]（A5）。
misconception: 误解：原生 AA 就是 EIP-7702。事实：7702 是给 EOA 挂一段合约代码；New L1 直接拒绝 7702 交易 [8]（A30）。
deeper: [7] Native Account Abstraction
```

```prereq B-3 l1 4min
# 隐私池的 note 模型
what: 存进池子的钱变成 note（类似 UTXO）。note 的哈希（commitment）写进一棵只追加的 Merkle 树。花一个 note 时，公开一个 nullifier 防止双花，再用 ZK 证明“我拥有树里的某个 note、金额守恒”，但不说是哪一个。
why: New L1 的 ShieldedPool 就是这个模型，加了一种“从池里调用公开合约”的流程 [9]（P3、P9）。
example: Zcash Orchard 是纯支付；Railgun 能 unshield → 调合约 → reshield [43][44]（P25、P26）。
misconception: 误解：隐私池隐藏一切。事实：存入、取出和调用合约时，金额与目标都公开 [9]（P20）。
deeper: [9] Shielded Pool
```

```prereq B-4 l2 3min
# 同态哈希 LtHash
what: 把每条状态（账户、存储槽）哈希成一个长向量，全部向量逐元素相加，得到整个状态的摘要。改一条状态，只要减旧向量、加新向量。安全性依赖格问题 SIS：很难找到一组小系数让向量之和为零。
why: New L1 用它代替 MPT，名字里的“lattice”就来自这里 [10]（P29、P31）。
example: 改一条状态：减去旧向量，加上新向量 [10]（P30）。
misconception: 误解：用了格就是后量子签名。事实：LtHash 是状态承诺，不是签名（P37）。
deeper: [40] SIMD-0215
```

```prereq B-5 l2 2min
# 应用特定排序（ASS）
what: 让应用自己决定（或约束）它的交易怎么排序、MEV 归谁，而不是全交给出块者按小费排。
why: 用来判断 New L1 的“排序–执行分离”是不是 ASS（N 面板）。
example: Multi-Lane 给应用的合约地址保留容量，但不让应用决定交易顺序（X50）。
misconception: 误解：有了保底容量就有排序权。事实：容量隔离和应用特定排序是两种机制（X42、X50）。
deeper: [46] 前文《应用特定排序》
```

## J 一笔交易怎么走：从 20 ms 到执行最终 {depth=2}
机器人发出的 `0x76` 交易要经过五个里程碑 [3][4]（C27）。图 2 是完整的时序。

```uml q="机器人的 0x76 交易从提交到执行最终，经过哪些角色、每一步拿到什么保证？" read="真实 RPC 与字段名，简化掉了验证者之间的 gossip。阴影部分是后台执行，不在共识关键路径上。" takeaway="20 ms 拿到的是出块者的签名承诺；约 0.5 s 拿到不可逆的顺序；执行结果要等 N+D 块被最终化。"
sequenceDiagram
  autonumber
  participant B as 机器人
  participant G as Gateway 全节点
  participant P as 当前出块者
  participant V as 验证者 ≤64
  participant E as 后台执行器
  B->>G: eth_sendRawTransaction(0x76)
  G->>P: 单跳转发副本，不进全局 mempool
  P-->>B: SubBlock 签名切片，preconfirmed 约 20 ms
  P->>V: 区块 N，只含交易顺序，无 state_root
  V->>V: BLS 投票只签顺序
  Note over V: N+2 块后 order-finalized，约 0.5 s
  rect rgb(234, 241, 251)
    E->>E: 按顺序执行区块 N
    P->>V: 区块 N+D 头带 ExecutionCommitment(N)
    V->>V: 本地执行对不上就弃权
  end
  Note over V: N+D 被最终化后 execution-finalized
```

| 阶段 | 约多久 | 保证什么 | 不保证什么 |
|---|---|---|---|
| `preconfirmed` | 约 20 ms（目标） | 当前出块者签名：交易在第几个位置 | 执行成功；不会被撤销 |
| `ordered` | 约 1 块 | 交易在已导入的区块里 | 不被重组 |
| `order-finalized` | 常见 +2 块，约 0.5 s | 顺序不可逆 | 执行成功 |
| `executed` | 排序后不久；已执行 tip 落后约 D 块 | 本节点已算出回执 | 全网认可这个结果 |
| `execution-finalized` | N+D 块最终化之后 | 结果被承诺且被投票 | — |

按 D = 1 到论坛给出的最多 8 块推算，执行最终约在出块后 0.6–2 s。这是推算，不是测量值（M1）。文档要求：放款、跨链这类依赖执行结果的事，要等 `eth_blockNumber("finalized")` 越过交易所在区块 [4]（C28）。

```finding F5 high
# 约 20 ms 的子区块是出块者签名的可撤销承诺，不是共识对象
claim: 当前出块者在自己的轮次里不断把就绪交易打包成签名切片（SubBlock）广播。它只承诺“纳入、在第几个位置”，不碰投票、fork choice 和最终性。出块者撤回会报 `aborted`，换人出块会报 `superseded`。窗口内只追加，后来的高费交易不能插队。论坛提案作者说它 “not implemented at the protocol level … a reputational commitment”。20 ms 本身是目标：文档写约 20 ms，路线图写 sub-50ms，论坛写 20–50 ms。
evidence: [observed] Pre-confirmation 页 Guarantees、Limitations [3]；交易生命周期 [4]；论坛作者回复 [16]（C15、C20、C21、C23、C11）。[inferred] 20 ms 与 0.5 s 是设计目标，不是公开网络的测量值（C13）。
implication: 应用可以用它刷新 UI、给支付回执，但必须处理撤销；不能凭它放款。
```

```finding F6 medium
# 没有全局 mempool：Gateway 单跳交给出块者；“防抢跑”只是不广播
claim: Gateway 是普通全节点，收下交易后保留托管，把副本直接发给按验证者排程选出的下几个出块者；出块者不再转发。没有 `txpool_*`，当前客户端也没有拍卖或排序 API。路线图说 TxStream “blocking front-running by design”，但文档里的机制只是“不广播到公共 mempool”；出块者本人仍最先看到交易。TEE Gateway（TEE 内加密入口与确定性排序）只是 2026-10-10 的论坛提案。
evidence: [observed] 交易生命周期 [4]、API 列表 [13]、路线图 [14]、论坛 [16]（C24、C25、C8、C26）。[inferred] 防抢跑缺协议机制（X43）。
implication: 抢跑风险从“公共 mempool 里的搜索者”转到了“出块者本人”。TEE Gateway 落不落地决定了这一点。
```

## K 共识：仍是 Parlia，改了三处 {depth=2}
New L1 的共识直接派生自 BSC 的 Parlia。表中对比两条链 [2][17][19]（C14、C31、C40、C42）。

| 项 | New L1 | BSC |
|---|---|---|
| 出块间隔 | 200 ms | 450 ms（BEP-619） |
| 每轮连出 | 16 块 = 3.2 s | 16 块 = 7.2 s |
| 验证者 | 最多 64，每天按质押选举 | 45（21 Cabinet + 24 候选） |
| 投票签什么 | **只签顺序** | 区块（含执行结果） |
| 执行被证伪 | 验证者弃权 | 区块直接无效 |
| 硬分叉开关 | 无，创世即一套配置 | 多轮激活高度 |

```finding F7 high
# 共识仍是 Parlia PoSA + BLS 最终性，不是 PoA，也不是无许可 PoS
claim: 验证者按 BNB 质押每天选举一次，最多 64 个，每 16 块轮换出块者；本轮出块者缺席时，其他人按确定性种子的随机退避补位。BLS 投票凑够 ⌈2N/3⌉ 后由下一个出块者聚合进区块头，按 Casper-FFG 规则判定 justified / finalized，常见情况 +2 块最终化，约 0.5 s。真正的改动是投票只签顺序：验证者本地执行后如果发现 `ExecutionCommitment` 不对，就不投票，错误结果凑不齐 2/3。文档还说 Parlia 只是 “current default”，正在评估 Minimmit 作为 Consensus 2.0。
evidence: [observed] Consensus 页 [2]；BEP-126 [18]（C30–C34、C36–C39）。[inferred] 属于有上限、按质押选出、可惩罚的 PoSA（C45）；出块快 2.25 倍（C42）。
implication: 叫它 “PoA” 不准确，叫 “PoS” 也不准确。去中心化程度和 BSC 同一量级：最多 64 个验证者。
```

**文档自己的不一致。** 排序最终用几块，三处写法不同：consensus 页 “+2 块”、API 页 “roughly one block interval”、状态表 “1–few” [2][3][13]。迁移指南说“区块计数常量比 BSC 差约 3.75 倍”，用的是 BSC 750 ms 的旧数字；按现在的 450 ms 应约 2.25 倍 [11]（C43）。

## L 异步执行与“并行 EVM” {depth=2}
图 3 对比 BSC 和 New L1 一个区块的关键路径。

```excalidraw q="同样一个区块，BSC 和 New L1 的关键路径有什么不同？" read="上行是 BSC：执行挡在投票前面，红色是关键路径上的执行。下行是 New L1：投票只看顺序，执行移到后台，结果晚 D 块写回。" takeaway="New L1 没有让执行变快，而是把执行移出了共识的关键路径。" kind=前后对比
{"grid": {"w": 260, "h": 120}, "defaults": {"w": 210, "h": 66, "fontSize": 16},
 "nodes": [
   {"id": "a1", "label": "BSC：\n出块者打包", "col": 0, "row": 0, "color": "blue"},
   {"id": "a2", "label": "先执行\n算 state_root", "col": 1, "row": 0, "color": "red"},
   {"id": "a3", "label": "验证者重执行\n再投票", "col": 2, "row": 0, "color": "red"},
   {"id": "a4", "label": "最终", "col": 3, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "b1", "label": "New L1：\n出块者打包", "col": 0, "row": 1, "color": "blue"},
   {"id": "b2", "label": "只验顺序\n就投票", "col": 1, "row": 1, "color": "green"},
   {"id": "b3", "label": "顺序最终\n约 0.5 s", "col": 2, "row": 1, "color": "green"},
   {"id": "c1", "label": "后台执行\n区块 N", "col": 1, "row": 2, "color": "blue"},
   {"id": "c2", "label": "N+D 头写\nExecutionCommitment", "col": 2, "row": 2, "color": "violet"},
   {"id": "c3", "label": "执行最终", "col": 3, "row": 2, "color": "green"}
 ],
 "edges": [
   {"from": "a1", "to": "a2"}, {"from": "a2", "to": "a3"}, {"from": "a3", "to": "a4"},
   {"from": "b1", "to": "b2"}, {"from": "b2", "to": "b3"},
   {"from": "b1", "to": "c1", "dashed": true}, {"from": "c1", "to": "c2"}, {"from": "c2", "to": "c3"}
 ]}
```

```finding F2 high
# 真正的新东西是时间结构：区块头不带执行结果，结果晚 D 块写回
claim: 区块头只带提出时就知道的字段（含交易列表），不带 `state_root`、`receipts_root`、`logs_bloom`、`gas_used` 等。后台执行器跑完区块 N，把结果以 `ExecutionCommitment` 写进 N+D 块的头。D 随负载变：低负载趋向 1，高负载变大，每块最多变 ±1，上限 `D_MAX` 由治理设定（文档没给值；论坛初步说最多 8 块）。追赶时一个区块可以带多个承诺。系统交易（奖励、slash、验证者更新）也在执行时才生成。
evidence: [observed] Async Execution 页 [5]；论坛作者回复 [16]（X4–X8、C29）。[inferred] 自适应 D 写成了机制，但文档没说已在 devnet 运行（X11）。
implication: RPC 语义跟着变：`latest` 指“已执行”的块，比你订阅到的最新块晚 D 块；查已排序未执行的块返回可重试的 `-38004` [5]（X17）。
```

```finding F3 high
# “并行 EVM”只有一句话：基于 access list，详细设计还在进行
claim: 文档只写了一句：“The current design centers on an access-list-based parallel EVM … Detailed design is in progress.” 调度器、依赖漏报怎么办、是否沿用 EIP-7928 的格式，都没有写。但概览页的架构表把 “Parallel EVM” 列为执行层组成部分，没有标注成熟度。路线图的 100K+ TPS 也把“parallel execution”列为手段之一。
evidence: [observed] Async Execution 页 What's Next [5]；Overview 架构表 [1]；路线图 [14]（X2、X3、C7）。
implication: 目前能评估的只有异步执行。100K+ TPS 依赖一个还没设计完的部件。
```

```finding F4 high
# 按声明的 gas_limit 收费、不退款，是异步执行的代价
claim: 共识按“滞后 D 块的状态”接纳交易。所以会放进执行时注定失败的交易：余额已空、同块被掏空、nonce 冲突、授权已变。为了让这些交易照样付区块空间的钱，New L1 规定：按 `gas_bid × gas_limit` 收费，不退未用 gas，EIP-3529 退款作废；按“在途花费”算出 `effectiveBalance`，够付才接纳；每个账户在 D 窗口内的在途 gas 和 calldata 有硬上限。回执里的 `gasUsed` 通常等于声明的 limit。
evidence: [observed] Async Execution “Paying for Block Space” [5]；迁移指南 [11]；AA 页 [7]（X12–X15、A24）。[observed] New L1 文档拿 Monad 的 reserve balance 作对照（X16）。[inferred] 所有把执行移出共识路径的链都要处理这个问题（M4）。
implication: 钱包和 SDK 必须改默认值：`estimate × 1.5` 这类余量直接变成支出。base fee 固定为 0，小费就是价格 [11]。
```

## M BSC 的并行执行前史：一直在“一个块内怎么跑快” {depth=2}
BNB 在 BSC 和 opBNB 上做过四轮并行执行研究 [20]–[29]（X21–X35）。

```timeline v
2022-01 | BEP-130（Parallel EVM 1.0） | dispatcher 分 slot 并发，冲突重做；Draft
2022-10 | Parallel EVM 2.0 | NodeReal 分叉 release，只支持 full sync，不支持验证者
2023 | 路线图：“take a break and rethink” | 3.0 计划改成基于读写集提示
2024-06 | BEP-396 TxDAG | 提议随区块附带依赖 DAG；至今 open Draft
2024 | opBNB 上的 TxDAG / PEVM | 链上带 TxDAG 数据；客户端只有 beta 预发布
2025-06 | BEP-592 非共识 BAL | 2026-01 上线，节点用来并发预取
2025-12 | bsc v1.6.4-feature-BAL7928 | BAL 驱动的并行执行 feature 构建，失败回退串行
2026-04 | BEP-684 Header-Only Voting | 投票不等执行；头里仍带 state_root；Draft
2026-05 | 删除 BEP-592 | “decide to follow upstream”，改跟 EIP-7928
*2026-10 | New L1 | 异步执行成形；access-list 并行设计中
```

```finding F8 high
# BSC 的并行 EVM 从未进官方 release；New L1 换了一层：改时间结构
claim: bsc 仓库全部 132 个 release 里，没有一个启用 Parallel EVM 1.0–3.0 或 TxDAG。唯一的“并行执行”是 2025-12 的 BAL feature 构建。BEP-592 已在 2026-05 删除，执行层改跟上游 geth 和 EIP-7928。BSC 自己的 BEP-684 只让投票不等执行，区块头仍承诺 `state_root`。New L1 更进一步：把执行结果整个移出区块头，晚 D 块发布，D 还会自适应。
evidence: [observed] bsc release 全量检索、PR #3690、v1.8.0-alpha、PEVM 2.0 博客、2023 路线图、BEP-396、op-geth release、BEP-684 [21]–[29]（X22、X23、X26、X28、X29、X32、X33、X35）。[inferred] 2023 路线图说的“deployed … to the BSC mainnet”指分叉跑在 full node 上，不是验证者路径（X24）；New L1 比 BEP-684 走得远（X36、X37）。[speculative] New L1 的 access list 是否沿用 BAL / EIP-7928，没有证据（X38）。
implication: 判断 New L1 的执行能力时，看异步执行；并行 EVM 先当成未交付。
```

## N 排序–执行分离 ≠ 应用特定排序；Multi-Lane 只保容量 {depth=2}
架构图上写的是 “Order-Execution separation”；正文的意思是“投票签顺序，不签执行结果” [1][2]（X39）。它没有改变“谁决定顺序”。

| 维度 | New L1 排序–执行分离 | 应用特定排序（ASS） |
|---|---|---|
| 解决什么 | 200 ms 下执行不能挡在共识前面 | 应用自己的交易怎么排、MEV 归谁 |
| 谁定顺序 | 当前出块者，按小费 | 应用、应用 sequencer 或合约规则 |
| 粒度 | 整条链 | 单个应用或交易对 |
| 给应用排序权 | no 不给 | ok 这是核心 |
| 公平排序 / MEV 规则 | no 协议里没有 | ok 通常是设计目标 |

**Multi-Lane 是什么。** 治理在 `LaneRegistry` 里给某些合约地址登记一个 bps 配额，例如 1,500 bps 就是区块 gas 的 15% [6]（X44、X45）：
- 交易按 `to` 地址确定性地进入 lane；未登记地址和合约创建走默认 lane。
- 不看 calldata 或 selector：发往登记地址的任何交易都占这个 lane 的配额。
- 只保容量，不保纳入；lane 内按小费排，不保证 FIFO。
- 闲置配额回流给默认 lane；占用按声明的 gas limit 计。

```finding F9 high
# 排序–执行分离只是时间解耦，和应用特定排序正交；Multi-Lane 是容量隔离
claim: 排序权仍在当前出块者手里：Gateway 不提供排序 API，lane 内按小费排，预确认窗口内只追加。所以排序–执行分离不给应用任何排序权，也不改变 MEV 归属。Multi-Lane 给登记的合约地址保底 gas，但不给排序规则，和 Tempo、BSC 的 payment lane 同类。和 BSC Payment Lane（BEP-703，一个支付类、闲置配额不回流）相比，Multi-Lane 有多条 lane，闲置配额会回流。
evidence: [observed] Multi-Lane 页 [6]；交易生命周期 [4]；Pre-confirmation [3]；BEP-703 [30]（X40、X41、X44–X47）。[inferred] 与 ASS 正交，只能当 ASS 的底座（X42、X50）；与 Payment Lane 的差异（X48）。
implication: 想在 New L1 上做应用级排序，需要在上层另建 sequencer 或合约规则。
```

## O Native AA：0x76 是 Tempo 设计的 BNB 变体 {depth=2}
机器人那笔交易就是 `0x76`：1–64 个调用整体原子执行，一个签名、一个 nonce、一张回执 [7]（A5）。账户有三级 key，都由 `AccountKeychain` 预编译（`0x…4000`）管理 [7]（A11–A13）：

| 等级 | 能做什么 | 限制 |
|---|---|---|
| root | 地址就是账户；部署合约、管理 key | 不能撤销，所以 root 不能在同一地址内轮换 |
| admin | 授权、撤销其他 key | 不能部署；必须无 scope、无上限、无过期 |
| access | 普通 session key | 受 scope（目标 + selector）、原生币花费上限、过期约束 |

Alice 的机器人 key 是 access 级：scope 是 DEX 路由合约的 `swap`。花费上限只算原生币流出，所以它限得住 BNB，限不住 BEP-20 代币（A16、A33）。它也不能用 `token_fee`：这个功能只允许 root 签名的代付交易 [7]（A22）。

**和 Tempo 逐项对照**（两边原文可以直接比对）[7][33][34]（A34–A36、A39–A42）：

| 项 | New L1 | Tempo |
|---|---|---|
| 交易类型 | `0x76` | `0x76` |
| 字段 | 12 个同名字段 + `token_fee` | 同样 12 个 + `fee_token`、`aa_authorization_list` |
| key 预编译 | `AccountKeychain` @ `0x…4000` | `AccountKeychain` @ `0xAAAA…` |
| key 等级 | root / admin / access | Root / Admin / Limited Access |
| 委托签名摘要 | `keccak256(0x04‖hash‖account)` | 相同 |
| WebAuthn 规则、P256 附加 gas | 37 字节、UP/UV；+5,000 | 相同 |
| 花费上限对象 | 只限原生币 | 只限 TIP-20，原生币不限 |
| nonce | 只用 `nonce_key = 0` | 2D nonce + 过期 nonce |
| 未用 gas | 不退 | 先扣后退 |

```finding F10 high
# 0x76 与 Tempo Transaction 在类型号、字段、预编译、摘要和 gas 常量上高度同源
claim: 两条链的原生 AA 交易都叫 `0x76`，有 12 个同名字段；key 预编译都叫 `AccountKeychain`，都分三级，admin 的限制相同；委托签名摘要、WebAuthn 校验规则、P256 与委托检查的附加 gas、“撤销后永不能重授权”都相同。New L1 去掉了 Tempo 的 `fee_token`（用 TIP-20 付 gas）和 7702 式委托，新增 `token_fee`（代付人收代币补偿）；2D nonce 留了字段但没启用。Tempo 主网 2026-03-18 上线，比 New L1 文档早 7 个月。
evidence: [observed] New L1 AA 页 [7]、交易类型页 [8]；Tempo 交易规范 [33]、AccountKeychain [34]、主网博客 [35]（A34–A36、A39–A43）。[inferred] 多项独立细节逐字逐数一致，是 Tempo 设计的 BNB 变体（A37）。[speculative] 客户端是否直接移植了 Tempo 的 reth 代码，无法验证（A38）。
implication: 类型号相同、字段不同，同一个 `0x76` 背后有两种 schema；现有 Tempo 工具不能直接假定兼容。
```

**和 EIP-8130、7702、4337 比**（[36]–[39]，A44–A48）：

| 维度 | New L1 `0x76` | EIP-8130 + 8430 | ERC-4337 |
|---|---|---|---|
| 状态 | devnet | 两份都是 Draft | Final |
| 验证逻辑 | 协议固定 3 种签名 | 可插拔 authenticator 合约 | 账户合约 |
| 权限 | 三级 key + scope | actor + scope 位 + policy 合约 | 合约自定 |
| 代付 | 内置 fee payer | 8430：内置 payer 模式 | paymaster 合约 |
| PQ 扩展 | 要协议升级 | 部署新 authenticator 即可 | 账户自行实现 |
| 基础设施 | 无 bundler | 无 bundler | bundler + EntryPoint |

```finding F11 high
# 签名方案由协议固定：加 PQ 签名要升级协议；7702 交易直接被拒
claim: New L1 只支持 secp256k1、P256、WebAuthn 三种签名，key 管理是编进 EVM 的预编译。EIP-8130 在 2026-10-08 收窄为 “Keystore Accounts”，交易类型拆到 EIP-8430（`0x79`，PR 未合并）；它用可插拔的 authenticator 合约验证，文档预期 PQ 算法以新 authenticator 加入。7702 给 EOA 挂委托代码，4337 用协议外的 UserOp 体系；New L1 拒绝 7702 和 4844 交易，也不需要 4337 设施。
evidence: [observed] AA 页签名表 [7]；System Contracts [12]；EIP-8130 @1a1f470 [36]；PR #12385 [37]；EIP-7702 [38]、ERC-4337 [39]（A8、A13、A30、A44–A46、A48）。[inferred] 加新签名算法要协议升级（A47）。
implication: 前文《Native AA》把 `0x79` 写在 8130 名下，已经过时。
```

## P 隐私池：比支付多一步，离隐私 DeFi 还远 {depth=2}
ShieldedPool 是创世预部署的系统合约（`0x…5000`）[9]（P1）。四种流程 [9]（P9）：
- **Shield**：EOA 调 `privDeposit` 存入，地址、金额、资产都公开。
- **Shielded transfer**：池内转账，花 1–2 个 note，总是公开 2 个 nullifier（不够就用假的补齐），产出最多 3 个 note。
- **Unshield**：取到普通地址，金额、资产、目的地公开。
- **Atomic call**：从池里取钱，调用一个公开合约，把返回值存回池里。

每次花费带两份 PLONK 证明（BN254，各 864 字节）：pool proof 证明金额守恒和 note 归属；auth proof 证明 note 里登记的 EOA 签了 EIP-712 消息 [9][8]（P5、P6）。提交有两条路：`0x77` 交易没有发送方、nonce 和外层签名，证明本身就是授权；或者交给 relayer 调用 `transact` [9]（P11、P12）。

```uml q="Alice 从隐私池直接调用 DEX，哪些步骤公开、哪些隐藏？失败了会怎样？" read="真实流程名。黄色注释框是链上公开的数据和失败语义。资产只支持原生 BNB，所以返回值画成 BNB；返回 ERC-20 时如何处理，文档没写。简化掉了 note 的批量插入（每 50 块一次）。" takeaway="隐藏的是“谁”，不是“做了什么”：调用目标、calldata 和金额都公开；调用回滚时花费不撤销，托管的钱可以重试。"
sequenceDiagram
  autonumber
  participant A as Alice 钱包
  participant S as ShieldedPool
  participant D as DEX 合约
  A->>A: 本地生成 pool proof + auth proof
  A->>S: 0x77 交易（无发送方）flow = atomic call
  S->>S: 验证明、销毁 2 个 nullifier
  S->>S: 结算并托管 unshield 金额
  Note over S: 公开 unshield 金额
  S->>D: 第二个 frame deliver，调用合约
  Note over S,D: 公开 target、calldata
  D-->>S: 返回原生 BNB
  S->>S: 存成 BNB open note（owner 隐藏，金额公开）
  Note over S: 若调用回滚，花费不撤销，托管可重试
```

| 流程 | 公开什么 | 隐藏什么 |
|---|---|---|
| Shield | 存款地址、金额、资产 | 之后谁持有 |
| 池内转账 | direct 路径的手续费 | 发送方、收款方、金额、资产 |
| Unshield | 金额、资产、目的地址 | note 历史 |
| Atomic call | unshield 金额、调用目标、calldata、reshield 金额 | 谁在调用 |

```finding F12 high
# 隐私池能用池内余额调用公开合约，所以不只是支付；但它不是隐私 DeFi
claim: Atomic call 让池内余额触发一次公开的 EVM 调用，结果以 open note（owner 隐藏、金额和资产公开）回到池里。DEX 合约、调用目标、calldata、金额都公开；只有 Alice 和这次调用之间的关联被隐藏。调用回滚时，花费照样成立，托管的钱可以重试；Railgun 的同类流程是整体回滚。资产只支持原生 BNB。
evidence: [observed] Privacy 页 Flows、Current Status、Security Assumptions [9]；交易类型页 [8]；Railgun 文档 [43]（P8、P18、P19、P25）。[inferred] 可组合性是“用池内余额触发一次公开调用”，不是隐私执行（P24）。[speculative] atomic call 能否调用任意合约，文档没写（P27）。
implication: 回答“是否只是 private payment”：不是，它能接 DeFi；但 DeFi 本身全公开，所以只是“匿名地使用公开 DeFi”。
```

```finding F13 high
# 隐私池现在不能放真钱：未审计、导入别人的 SRS、只支持 BNB
claim: 文档的警告原文是 “Do not treat it as safe for real value”。PLONK 用的 SRS 是导入的现成公共参数；自办仪式和第三方电路审计仍是主网前的未决项。未实现：ERC-20 / BEP-20 隐私、预留的 PQ 授权、paymaster / 4337 提交、合规钩子（只有接口缝）、递归证明聚合。合约不可变，治理只能暂停存款。
evidence: [observed] Privacy 页 [9]；FAQ [13]（P7、P17、P21–P23）。[inferred] 路线图宣传的 “selective disclosure for compliance” 在文档里还没有落地（P46）。
implication: 隐私能力目前是“设计 + devnet 演示”，不是可用产品。另外两处元数据泄露：注册隐私地址会公开关联 EOA；relayer 能看到 IP 和时间。
```

## Q PQ：“格”只用在状态承诺上 {depth=2}
New L1 不用 MPT。每条状态（账户、非零存储槽）是一个 KV 条目，图 5 是它变成 `state_root` 的过程 [10]（P28、P29）。

```excalidraw q="New L1 的 state_root 是怎么算出来的？“格”在哪里？" read="从左到右。蓝色是每条状态各自的计算，绿色是全局累加器。“格”只出现在第三步的安全性论证里。" takeaway="改一条状态只要“减旧向量、加新向量”，与状态大小无关；但累加器是一个和，没法给单个账户出包含证明。"
{"grid": {"w": 255, "h": 120}, "defaults": {"w": 200, "h": 70, "fontSize": 16},
 "nodes": [
   {"id": "e", "label": "一条状态\nkey ‖ value", "col": 0, "row": 0, "color": "blue"},
   {"id": "h", "label": "BLAKE3 XOF\n→ 2048 字节", "col": 1, "row": 0, "color": "blue"},
   {"id": "s", "label": "全部向量相加\n1024 × u16", "col": 2, "row": 0, "color": "green"},
   {"id": "r", "label": "BLAKE3\n→ 32 字节 state_root", "col": 3, "row": 0, "color": "green"}
 ],
 "edges": [
   {"from": "e", "to": "h"}, {"from": "h", "to": "s"}, {"from": "s", "to": "r"}
 ]}
```

**它是怎么用 PQ 的？** 只在一处：文档说累加器的安全性基于 SIS 格问题，1024 × u16 “targets ~128-bit security”，参考 Bellare–Micciancio 1997 和 Solana SIMD-0215 [10]（P31）。下表是全栈每个组件的密码学 [2][7][9][10][45]（P40–P43）：

| 组件 | 用的是什么 | 是否 PQ |
|---|---|---|
| 共识投票 | BLS 聚合签名 | no |
| 账户签名 | secp256k1、P256、WebAuthn | no |
| 子区块签名 | 65 字节可恢复签名 | no |
| 隐私证明 | PLONK on BN254 | no |
| 隐私授权 | EOA 签 EIP-712（PQ 方案预留、未实现） | no |
| 状态承诺 | BLAKE3 + LtHash（基于格问题，不是签名） | warn 部分 |

```finding F14 high
# LtHash 是状态承诺，不是 Falcon；New L1 全栈没有 PQ 签名
claim: Falcon（FN-DSA）是格基签名：私钥签、公钥验。LtHash 是同态集合哈希：把整个状态压成一个可增量更新的摘要。两者都和格有关，用途不同，New L1 文档里也没有 Falcon。BLS、secp256k1 / P256 / WebAuthn、BN254 PLONK 都是椭圆曲线密码，NIST 认定这类方案会被 Shor 算法攻破。路线图的 “Post-Quantum Readiness” 是全 BNB Chain 的研究计划（混合方案、用 AA 免换地址升级），New L1 一节只把 LtHash 当作提速手段。
evidence: [observed] State DB [10]；路线图 [14]；NIST IR 8547 [45]（P29、P31、P44、P45、P42）。[inferred] LtHash 不是签名（P37）；各组件都不是 PQ（P43）。
implication: 不能把 New L1 称为“后量子 L1”。“lattice-based state commitment” 是准确说法。
```

```finding F15 medium
# 同一组 LtHash 参数在 2026-09 被公开了约 2^81 次查询的碰撞攻击，文档还写 ~128-bit
claim: ePrint 2026/2083（2026-09-18）对 LtHash16（N = 1024，d = 16，Facebook 和 Solana 在用）给出约 2^81 次哈希查询、不超过 2^101 次运算的碰撞攻击。SIMD-0215 在 2026-09-25 改写了安全一节，承认这个攻击。它论证碰撞集合约有 2^72.83 个元素，而 lamports 非零的账户少于 2^65，所以构不成合法状态。New L1 用同一组参数，但条目编码不同（包括存储槽）；它 2026-10-22 的文档仍只写 “~128-bit”。
evidence: [observed] ePrint 2026/2083 摘要 [41]；SIMD-0215 @f1afd94 安全一节 [40]；State DB [10]（P32–P34）。[inferred] 文档没反映这次更新（P35）；Solana 的反驳只适用于 Solana 编码，New L1 需要另做论证（M7）。[speculative] Solana 的论证不能直接套用到 New L1（P36）。
implication: 这不是可直接利用的漏洞。但 New L1 要针对自己的状态编码重新论证碰撞安全。
```

```finding F16 medium
# 没有 MPT 的代价：eth_getProof、snap sync 不可用，桥要另想办法
claim: 累加器是“和”而不是树，没有包含路径，所以 `eth_getProof` 永远返回 `-32004`，snap sync 不存在，整状态 debug 读取也不支持。在“accumulator-native”包含证明发布前（文档说 planned），桥和轻客户端只能靠 BLS 最终性投票和全节点响应。BSC↔New L1 原生桥还在开发，`CrossChain` 地址目前是占位。累加器每块归档 2 KB，约 0.9 GB/天。
evidence: [observed] State DB [10]；迁移指南 [11]；Network info [13]（P38、P39、C2、M2）。
implication: 依赖 MPT 证明的跨链方案、轻客户端和索引工具都不能直接接入。
```

## R 对我们的意义 {depth=2}
以下是事实前提加推论，不是对 BNB Chain 的建议。

1. **ASS 设计：New L1 只给了一半。** Multi-Lane 和前文建议的“外层按类别分配容量”是同一层；New L1 没有“内层按类别选排序规则”（M5）。New L1 不能直接作为 ASS 的参照实现，只能参照它的容量配置（`LaneRegistry` + 治理 + 闲置回流）。
2. **预确认：强度一样，都是出块方单方承诺。** New L1 的 SubBlock 和前文所述 Mantle 的 FIFO preconf 车道一样，都不由共识保证（M6、F5）。New L1 的可借鉴之处在接口：签名切片、撤销状态（`aborted` / `superseded`）、客户端自验步骤 [3]。
3. **异步执行：代价已经写清楚了。** 评估“执行移出关键路径”时，要同时设计接纳规则（M4、F4）。可选做法：按声明 gas 收费加在途花费上限，或 Monad 式 reserve balance。RPC 语义（`latest` = 已执行）也要跟着改。
4. **Native AA：Tempo 式固定方案已有两条链采用。** 前文建议先做 8130 PoC；现在“协议固定 + 0x76 schema”路线多了一个采用者（M3、F10）。与 New L1 固定的签名方案不同，8130 的可插拔 authenticator 不用升级协议就能加 PQ 算法（F11）。
5. **PQ：不要把 LtHash 当作 PQ 方案。** 如果考虑 LtHash 做状态承诺，要按自己的条目编码重新论证碰撞安全（M7、F15）。

```callout warn CAUTION
以上第 2 条依赖前文对 Mantle preconf 车道的描述；本篇没有重新核对 Mantle 代码。
```

## S 局限与开放问题 {depth=2}
- **没有源码、没有实测。** New L1 客户端没有公开仓库；本篇全部机制来自 2026-10-22 的文档快照（C50）。20 ms、0.5 s、100K+ TPS 都是目标值（C13）。
- **文档在变。** devnet “highly unstable”；文档内部已有不一致（最终性用几块、`newHeads` 跟哪个 tip、64 个验证者 vs API 参数 `[2, 21]`）（C4、C44）。
- **路线图与文档有落差。** 路线图的 GasToken 在文档里只剩 `token_fee`；“scheduled execution”只对应有效期窗口；“selective disclosure”只有接口缝（M8、M9、P46）。
- **推测项（共 5 条）。** access list 是否沿用 EIP-7928（X38）；AA 是否直接移植 Tempo 代码（A38）；atomic call 有无目标限制（P27）；Solana 的 LtHash 论证能否套用（P36）；`privDeposit` 的 `scheme` 字段是否为 PQ 预留（P48）。
- **开放问题。**
  1. access-list 并行 EVM 的设计；`D_MAX` 取值；执行承诺出错时，除了弃权，有没有问责。
  2. TEE Gateway 会不会落地；Minimmit 的时间表。
  3. 导入的是哪份 SRS；审计与仪式的时间。
  4. New L1 是否回应 ePrint 2026/2083；accumulator-native 证明与桥的验证方式。
  5. `0x76` 与 Tempo 能否字节级兼容。

## T 方法与证据 {depth=3}
- **一手来源。** 官方文档固定在 `bnb-chain/bnb-chain.github.io@ef5a632`（`docs/newl1/` 的唯一提交，2026-10-22），本地快照在 `research/references/`，台账引用到行号。外部：BEPs、bsc / op-geth release、Tempo 规范、EIP-8130 @1a1f470、SIMD-0215 @f1afd94、ePrint 2026/2083、论坛帖。
- **四路调研。** 定位与共识（C）、执行（X）、账户（A）、隐私与状态（P）各一路，台账合并为 210 行：observed 174、inferred 31、speculative 5。
- **外部调研只作线索。** ChatGPT Deep Research 的结果逐条核对，主要偏差见下表（M10）。

| 外部调研的说法 | 核对结果 |
|---|---|
| 约 64 个验证者 | 文档是“最多 64”（C31） |
| 20 ms 预确认已在 devnet 确认 | 是目标值；路线图 sub-50ms（C11） |
| AA 有 Root / Admin / Delegated / Sponsor 四层 | 三级；代付人是另一个账户（A49） |
| token fee 在交易完成后偿还 | 在用户调用之前执行（A23） |
| “最接近 Tempo” | 类型号、字段、预编译都相同（A34–A37） |
| LtHash 约 128-bit | 已有约 2^81 碰撞攻击（P33） |

- **主会话抽查。** consensus、async-execution、account-abstraction、privacy、state-db 的关键行；Tempo 规范与 AccountKeychain；ePrint 摘要；SIMD-0215 安全一节；EIP-8130 文件头与提交；论坛两帖；路线图原文。全部一致。

## U 复现 {depth=3}
固定文档版本，核对关键原文：

```bash title="取文档快照并检索关键句"
git clone --filter=blob:none --sparse https://github.com/bnb-chain/bnb-chain.github.io
cd bnb-chain.github.io && git checkout ef5a632d2a
git sparse-checkout set docs/newl1
grep -n "up to 64" docs/newl1/core-concepts/consensus.md
grep -n "Detailed design is in progress" docs/newl1/core-concepts/async-execution.md
grep -n "128-bit" docs/newl1/core-concepts/state-db.md
grep -n "0x76" docs/newl1/core-concepts/account-abstraction.md
```

预期：四条 grep 各命中一行（consensus.md L16、async-execution.md L101、state-db.md L47、account-abstraction.md L7）。

```bash title="确认 bsc 官方 release 里没有 PEVM / TxDAG"
gh api --paginate 'repos/bnb-chain/bsc/releases?per_page=100' \
  --jq '.[] | select((.body // "") | test("(?i)parallel|txdag|pevm")) | .tag_name'
```

预期（2026-10-24）：只输出 `v1.7.0-alpha`、`v1.6.4-feature-BAL7928`、`v1.1.3` 三个 tag，说明里都不是 PEVM / TxDAG。

## V 术语表 {depth=2}
```glossary
Parlia | PoSA | BSC 的共识：按质押选出有上限的验证者集合，轮流出块。 | 不是 PoA，也不是无许可 PoS
BLS 快速最终性 | fast finality | 验证者用 BLS 签名投票，2/3 聚合后写进下一个区块头。 | 在 New L1 上只签顺序
排序最终性 | order-finalized | 交易顺序不可逆，约 +2 块。 | 不代表执行成功
执行最终性 | execution-finalized | 执行结果被写进某个区块，且该区块已最终化。 | 比排序最终晚 D 块
ExecutionCommitment | — | 区块 N 的执行结果，写在区块 N+D 的头里。 | 不在区块 N 自己的头里
执行延迟 D | adaptive execution lag | 执行结果晚几块上链，1 到 D_MAX，随负载变。 | 不是固定值
SubBlock | 子区块 | 当前出块者签名的交易切片，用于约 20 ms 的预确认。 | 不进共识，可撤销
预确认 | preconfirmation | 出块者对“纳入、位置”的签名承诺。 | 不保证执行和最终性
Gateway | — | 接收交易并单跳转给出块者的普通全节点。 | 没有排序或拍卖 API
Multi-Lane | 路线图叫 PriorityLane | 按合约地址给区块 gas 设保底配额。 | 不给排序权，不保 FIFO
声明 gas 收费 | charge on gas_limit | 按交易声明的 gas_limit 收费，不退未用部分。 | 不是按 gasUsed
0x76 | Native AA 交易 | New L1 的原生账户抽象交易类型，与 Tempo 同号。 | 不是 EIP-7702
AccountKeychain | — | 管理 root / admin / access key 的预编译。 | Tempo 有同名预编译
access key | session key | 受 scope、原生币花费上限、过期约束的委托 key。 | 限不住 BEP-20 金额
token_fee | — | 代付交易里，账户用代币补偿代付人。 | 不是 Tempo 的 fee_token
ShieldedPool | 隐私池 | 系统合约 0x…5000，用 note 模型隐藏转账。 | 只支持 BNB
note | — | 隐私池里的一笔价值记录，类似 UTXO。 | 不是账户余额
nullifier | — | 花 note 时公开的值，防止双花。 | 不暴露是哪个 note
open note | — | owner 隐藏、金额和资产公开的 note。 | atomic call 的产物
atomic call | — | 从池里取钱、调用公开合约、把结果存回池里。 | 调用本身全公开
0x77 | shielded tx | 无发送方、无 nonce 的隐私交易，证明即授权。 | 手续费公开
SRS | structured reference string | PLONK 的公共参数，由可信设置产生。 | New L1 目前导入别人的
LtHash | lattice hash | 把状态条目哈希成向量再相加的同态承诺。 | 不是签名，不是 Falcon
SIS | Short Integer Solution | 格问题：找一组小系数让向量之和为零。 | LtHash 的安全假设
应用特定排序 | ASS | 让应用决定自己交易的排序与 MEV 归属。 | 不是排序–执行分离
```

## W 参考资料 {depth=2}
1. [New L1 Overview](https://docs.bnbchain.org/newl1/overview/)（快照 @ef5a632）— 定位、架构、BNB 角色、devnet 状态。**PRIMARY**
2. [Consensus](https://docs.bnbchain.org/newl1/core-concepts/consensus/) — 参数、投票只签顺序、Minimmit。**PRIMARY**
3. [Transaction Pre-confirmation](https://docs.bnbchain.org/newl1/core-concepts/tx-preconfirmation/) — 保证、状态阶梯、自验步骤。**PRIMARY**
4. [Transaction Lifecycle](https://docs.bnbchain.org/newl1/developers/transaction-lifecycle/) — Gateway、池状态、RPC tip。**PRIMARY**
5. [Async Execution](https://docs.bnbchain.org/newl1/core-concepts/async-execution/) — 自适应 D、声明 gas 收费、并行 EVM 现状。**PRIMARY**
6. [Multi-Lane](https://docs.bnbchain.org/newl1/core-concepts/multi-lane/) — 按地址的容量保底。**PRIMARY**
7. [Native Account Abstraction](https://docs.bnbchain.org/newl1/core-concepts/account-abstraction/) — 0x76 全部机制与限制。**PRIMARY**
8. [Transaction Types](https://docs.bnbchain.org/newl1/developers/transaction-types/) — 0x76 / 0x77 字段、PLONK 864 字节。**PRIMARY**
9. [Shielded Pool](https://docs.bnbchain.org/newl1/core-concepts/privacy/) — 流程、现状、安全假设。**PRIMARY**
10. [State DB](https://docs.bnbchain.org/newl1/core-concepts/state-db/) — LtHash 构造与代价。**PRIMARY**
11. [Migrating from BSC](https://docs.bnbchain.org/newl1/get-started/migrate-from-bsc/) — 与 BSC 的差异清单。**PRIMARY**
12. [System Contracts](https://docs.bnbchain.org/newl1/governance/system-contracts/) — 沿用 BSC 的合约与新增合约。**PRIMARY**
13. [FAQ](https://docs.bnbchain.org/newl1/faq/) 与 [New L1 API List](https://docs.bnbchain.org/newl1/developers/json_rpc/newl1-api-list/) — devnet 状态、RPC 细节。**PRIMARY**
14. [BNB Chain H2 2026 Tech Roadmap](https://www.bnbchain.org/en/blog/bnb-chain-h2-2026-tech-roadmap-doubling-down-on-speed)（2026-07-08）— 目标、时间线、PQ 研究。**PRIMARY**
15. [论坛：About the BNBChain NewL1 Category](https://forum.bnbchain.org/t/about-the-bnbchain-newl1-category/5437)（2026-07-14）— “complements BSC rather than replacing it”。**PRIMARY**
16. [论坛：Introducing NewL1 MEV Solution - TEE Gateway](https://forum.bnbchain.org/t/introducing-newl1-mev-solution-tee-gateway/5589)（2026-10-10）— 提案与作者说明。**PRIMARY**（提案）
17. [BSC Introduction](https://docs.bnbchain.org/bnb-smart-chain/introduction/) — BSC 当前验证者与出块参数。**PRIMARY**
18. [BEP-126 Fast Finality](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP126.md) — justified / finalized 规则。**PRIMARY**
19. [BEP-619 0.45 s 出块](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-619.md) — BSC 当前出块间隔。**PRIMARY**
20. [BEP-130 PR](https://github.com/bnb-chain/BEPs/pull/130) — Parallel EVM 1.0。**PRIMARY**
21. [Parallel EVM 2.0 博客](https://www.bnbchain.org/en/blog/new-milestone-the-implementation-of-parallel-evm-2-0) — 只支持 full sync。**PRIMARY**
22. [BNB Chain Tech Roadmap 2023](https://www.bnbchain.org/en/blog/bnb-chain-tech-roadmap-2023) — “take a break and rethink”。**PRIMARY**
23. [BEP-396 TxDAG PR](https://github.com/bnb-chain/BEPs/pull/396) — 仍是 Draft。**PRIMARY**
24. [bnb-chain/op-geth releases](https://github.com/bnb-chain/op-geth/releases) — PEVM beta 预发布。**PRIMARY**
25. [BEP-592](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-592.md) — 非共识 BAL。**PRIMARY**
26. [bsc PR #3690](https://github.com/bnb-chain/bsc/pull/3690) — 删除 BEP-592。**PRIMARY**
27. [bsc v1.8.0-alpha](https://github.com/bnb-chain/bsc/releases/tag/v1.8.0-alpha) — 回归上游 geth。**PRIMARY**
28. [bsc v1.6.4-feature-BAL7928](https://github.com/bnb-chain/bsc/releases/tag/v1.6.4-feature-BAL7928) — BAL 驱动的并行执行构建。**PRIMARY**
29. [BEP-684 PR](https://github.com/bnb-chain/BEPs/pull/684) — Header-Only Voting。**PRIMARY**
30. [BEP-703 Payment Lane](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-703.md) — BSC 的支付保底。**PRIMARY**
31. [Monad：Asynchronous Execution](https://docs.monad.xyz/monad-arch/consensus/asynchronous-execution) — D = 3、reserve balance。**PRIMARY**
32. [EIP-7886](https://eips.ethereum.org/EIPS/eip-7886) — 以太坊的延迟执行提案。**PRIMARY**
33. [Tempo Transactions Specification](https://docs.tempo.xyz/protocol/transactions/spec-tempo-transaction) — Tempo 的 0x76。**PRIMARY**
34. [Tempo Account Keychain](https://docs.tempo.xyz/protocol/transactions/AccountKeychain) — 三级 key、TIP-20 上限。**PRIMARY**
35. [Tempo Mainnet is live](https://tempo.xyz/blog/mainnet)（2026-03-18）。**PRIMARY**
36. [EIP-8130 Keystore Accounts](https://eips.ethereum.org/EIPS/eip-8130)（@1a1f470）— 可插拔 authenticator。**PRIMARY**
37. [EIP-8430 AA Transaction Type（PR #12385）](https://github.com/ethereum/EIPs/pull/12385) — 从 8130 拆出的 0x79。**PRIMARY**
38. [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) — EOA 委托代码。**PRIMARY**
39. [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) — 协议外 AA。**PRIMARY**
40. [SIMD-0215 Accounts Lattice Hash](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0215-accounts-lattice-hash.md)（@f1afd94）— 同参数 LtHash 与安全论证。**PRIMARY**
41. [ePrint 2026/2083](https://eprint.iacr.org/2026/2083) — LtHash16 约 2^81 碰撞攻击。**PRIMARY**
42. [ePrint 2019/227](https://eprint.iacr.org/2019/227) — LtHash 在 Facebook 的部署。**PRIMARY**
43. [RAILGUN Cross-Contract Calls](https://docs.railgun.org/developer-guide/wallet/transactions/cross-contract-calls) — unshield → 调用 → reshield。**PRIMARY**
44. [ZIP-224 Orchard](https://zips.z.cash/zip-0224) — 纯支付型隐私协议。**PRIMARY**
45. [NIST IR 8547 ipd](https://nvlpubs.nist.gov/nistpubs/ir/2024/NIST.IR.8547.ipd.pdf) — 椭圆曲线密码对 Shor 算法脆弱。**PRIMARY**
46. 前文：[《BSC 近期开发方向》](/p/bsc-recent-development/)、[《Native AA：EIP-8130 与 EIP-8141》](/p/native-aa-eip-8130-8141/)、[《应用特定排序》](/p/application-specific-sequencing/)、[《后量子签名选型》](/p/pq-signature-selection/)。

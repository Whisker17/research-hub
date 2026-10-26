---
template: research
title: 高性能链的系统设计：组件、瓶颈与 Mantle 工程路线
subtitle: 链的性能由 8 个职责层共同决定，不由执行器单独决定。Mantle 主网目前只用了 gas 上限的约 0.17%，所以先改延迟、入口和账户体验，再按测量结果扩容执行和状态层。
cols: 4
type: 系统调研 · onboarding 教程 · 工程路线
audience: 新加入 Mantle 的协议 / 基础设施工程师：懂 EVM 与 OP Stack 基本概念，没有系统学过高性能链设计
scope: 通用链组件模型（区分 L1 与 OP Stack 型 L2）；网络、共识、出块与预确认、执行、状态、DA、证明、读路径、费用的问题与 2026 年各项目做法；2025 年内部研究复核；Mantle 基线与短 / 中 / 长期路线
evidence: 289 条论断台账（observed 222 / inferred 60 / speculative 7）；官方文档、规范、论文、release notes；Mantle 主网 RPC 与 L1 batcher 读数（2026-10-26）；内部压测报告（2026-06）
date: 2026-10-27 · v1
---
结论先行：链的性能不是一个数。吞吐、延迟、尾延迟、状态新鲜度和持续能力分别受不同组件约束（[F1](#F1)）。L1 的上限来自“最慢的合格验证者能否及时重放”和投票轮次；L2 的实时路径可以很快，但持续能力受执行、DA 和证明三者中最小的一个限制（[F2](#F2)）。

2026 年业界变化比 2025 年内部研究快。reth 的 state root 已降到区块末尾 1–2 ms，剩余瓶颈是冷读（[F9](#F9)、[F11](#F11)）；OP Stack 系的预确认已从 rollup-boost / op-rbuilder 收回到协议内短区块或自研实现（[F8](#F8)）；Ethereum blob 的共享容量只有约 152 KB/s（[F14](#F14)）。

对 Mantle：主网平均只用了 gas 上限的约 0.17%，压测中延迟增长全部来自排队（[F19](#F19)）。所以短期先做测量、mStocks 峰值预案、亚秒预确认和账户层；并行执行、JIT、换状态结构都按测量结果立项（[路线](#panel-T)）。

## A 一条链的 8 个职责层 {sheet span=2 meta="L1 与 OP Stack 型 L2"}
| 层 | L1 由谁做 | L2 由谁做 | 先限制什么 |
|---|---|---|---|
| ① 账户与准入 | 每个节点的 txpool | 单个 sequencer 入口 | 无效请求成本、排队 |
| ② 网络传播 | 验证者之间 gossip | sequencer → 节点 / RPC | 延迟、尾延迟 |
| ③ 排序、共识、出块 | 验证者投票 | sequencer 单方排序 | 通信轮次、出块间隔 |
| ④ 执行 | 全部验证者重放 | sequencer、跟随节点、证明程序 | 计算、依赖链 |
| ⑤ 状态与承诺 | 执行客户端 | 同左 + output root | 冷读、state root |
| ⑥ 数据可用性 | 自身区块与 blob | batcher → L1 blob | 持续能力 |
| ⑦ 验证与结算 | 自身共识最终性 | 派生 + 证明 / 挑战 | 持续能力、最终性 |
| ⑧ 读路径与同步 | 节点同步 | unsafe / safe / finalized 三个 head | 状态新鲜度、追赶余量 |

横切一层：资源计量与费用，决定拥堵时谁付钱、谁被挤出。

## B 关键数字 {sheet span=2 meta="均有出处"}
| 指标 | 数值 | 出处 |
|---|---|---|
| Mantle 主网平均 gas 利用率 | 约 0.17%（24 小时） | 主网 RPC，K3 |
| Mantle 出块 / 上限 / target | 2 s / 60M / 15M gas | K1、K2 |
| 内部压测的饱和吞吐 | 29.5M gas/s ≈ 配置上限 | K7、K10 |
| 压测端到端延迟 | 3.4 → 18.2 s，增量全是排队 | K8 |
| Ethereum blob target 容量 | 约 152 KB/s，所有 L2 共享 | B33 |
| reth 区块末尾 state root | 1–2 ms（Reth 2.0） | E5 |
| 以太坊区块中位并行度 | 小于 2 | E18 |
| revmc JIT 在 L1 历史同步上 | 快 1–10% | E32 |

## C 2026 年各家怎么做 {sheet span=2 meta="截至 2026-10-27"}
| 组件 | 代表做法 | 状态 |
|---|---|---|
| 共识 | Solana Alpenglow（Votor） | ok 2026-10-21 上线；Rotor 未排期 |
| 共识 | MonadBFT：300 ms 出块 / 600 ms 最终 | ok 主网 |
| 预确认 | Base Denim：200 ms canonical 区块 | warn Sepolia 已激活，主网目标 11 月 |
| 预确认 | OP Subblocks 取代 Flashblocks | ok 2026-08-31 上线 |
| 排序 | Arbitrum PGA 取代 Timeboost | ok 2026-09-24 |
| 执行 | Sei Giga Ares（Block-STM 风格） | ok 2026-08 第一阶段 |
| 状态 | Reth 2.0 sparse trie 缓存 + Storage v2 | ok 2026-04 |
| L1 | Glamsterdam（ePBS + BAL） | warn 主网日期未定 |

## D Mantle 基线 {sheet span=2 meta="2026-10"}
```tree list
Mantle 主网 | OP Stack 系，SP1 有效性证明
  出块 2 s · gasLimit 60M · target 15M | K1、K2
  平均利用率约 0.17% | K3
  执行客户端：文档写 op-geth | 公开 RPC 为 op-geth v1.6.x
  reth：有构建在主网运行 | sequencer 切换是 2026 H2 计划
  DA：Ethereum blob | 约每 8 分钟 1 个 blob
  证明：OP Succinct（SP1） | 提款期 12 小时
  预确认：白名单 FIFO 车道已实现 | 亚秒流式未上线
  eager next-block：v1.6.3 已发布 | 主网是否开启未确认
```

## E 路线一览 {sheet span=2 meta="研究者建议，非已批准计划"}
| 阶段 | 目标 | 代表任务 |
|---|---|---|
| 短期 0–3 个月 | 看清瓶颈，接住 mStocks 峰值 | 分段 trace 与回放基准；SystemConfig 峰值预案；入口背压；差分门禁；亚秒预确认原型；native AA 规范 |
| 中期 3–6 个月 | 亚秒确认与账户层上线 | 预确认上主网；native AA + 2D nonce 硬分叉；追平上游 reth；撤单优先车道；证明余量 |
| 长期 6–12 个月+ | 只改测量证实的瓶颈 | 条件式并行执行与 JIT；更短区块；跟随二叉树；DA 方案 |

## F 结论 {sheet span=2}
```callout ok 先改延迟、入口和账户，再按测量结果扩容
- 链的性能由 8 个职责层共同决定。执行快 10 倍，不能消除排队、出块间隔、DA 和证明的限制。
- Mantle 当前不缺吞吐。mStocks 需要确定性纳入、少签名、新鲜状态和撤单优先。
- 每项改动先判断级别：只改 sequencer（A）、改参数（B）、硬分叉（C）、改结算接口（D）。级别决定成本。
- 从 [F19](#F19)、[F21](#F21) 和 [路线](#panel-T) 开始读。
```

## G 如何阅读 {depth=1}
```callout info 默认你已知道（本文不解释）
- EVM 交易、gas、nonce 和合约存储
- OP Stack 的 sequencer、batcher、op-node 与执行客户端（EL）的分工
- Merkle 树证明的基本原理
- Mantle 用 OP Succinct（SP1）生成有效性证明
```
- **5 分钟**：读总览 A–F，再读 [F1](#F1)、[F19](#F19)、[F21](#F21)。
- **30 分钟**：[Context](#panel-H) → [前置知识](#panel-I) → [全景](#panel-J) → 各组件面板 [K](#panel-K)–[Q](#panel-Q) → [Mantle 基线](#panel-S) → [路线](#panel-T)。
- **完整**：再读 [2025 研究复核](#panel-R)、[方法与证据](#panel-V)。每条论断的出处在 `research/ledger.md`。
- **新人练习**：读完后，试着回答 [J](#panel-J) 末尾的 4 个问题。

## H Context：为什么现在重做这份总结 {depth=2}
**问题**：Mantle 的高性能研究集中在 2025 年。其中 5 条关键结论已经过时或口径有误（[F18](#F18)）。同时，产品叙事转向 mStocks 与交易体验，需要一份新的系统总结。

**要回答的问题**（来自 brief）：
1. 一条链自上而下有哪些组件？每个组件怎样限制性能？L1 与 L2 有何不同？
2. 每个组件会产生什么问题？优化方向有哪些？现实项目怎么做？
3. 2025 年的内部结论哪些仍成立？
4. 结合 mStocks、native AA 和交易执行质量，Mantle 短 / 中 / 长期做什么？

**范围与非目标**：
- 包括：通用组件模型，L1 与 OP Stack 型 L2 的差异，主流高性能项目的 2026 年状态，Mantle 基线与路线。
- 不包括：代币经济、行情、给其他公司的建议；非 EVM 生态只作设计参考。

**判断标准**（先于结论定下）：
- 性能数字必须写明测试条件：主网回放、合成负载还是仿真。
- 区分“改动收益”与“整链收益”：单组件快 2 倍，整链未必快。
- 改动级别（A–D）决定复杂度，收益决定优先级，依赖决定顺序。

## I 前置知识 {depth=2}
**运行示例**：Alice 用 USDC 在 Mantle 的 AMM 池买入 1 份 mStock。下文每个组件都用这笔交易说明它会卡在哪里。

```excalidraw q="理解本文需要哪些概念？按什么顺序学？" read="灰色虚线框是默认已知；蓝框是卡片编号；箭头表示先学 → 后学；绿框是本文要做的判断。" takeaway="先读 B-1 和 B-2：五个性能指标和 L2 的两条路径是全文的两条主线。" name=prereq-map kind=前置知识地图
{"grid": {"w": 300, "h": 110}, "defaults": {"w": 200, "h": 58, "fontSize": 17},
 "nodes": [
   {"id": "k1", "label": "EVM 与 gas", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "k2", "label": "OP Stack 组件", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b1", "label": "B-1 五个性能指标", "col": 1, "row": 0, "color": "blue"},
   {"id": "b3", "label": "B-3 关键路径与流水线", "col": 1, "row": 1, "color": "blue"},
   {"id": "b2", "label": "B-2 两条路径与三个 head", "col": 1, "row": 2, "color": "blue"},
   {"id": "b4", "label": "B-4 state root", "col": 2, "row": 0, "color": "blue"},
   {"id": "b5", "label": "B-5 预确认", "col": 2, "row": 2, "color": "blue"},
   {"id": "b6", "label": "B-6 DA 与 blob", "col": 2, "row": 3, "color": "blue"},
   {"id": "s", "label": "Mantle 先做什么？", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "k1", "to": "b1"}, {"from": "b1", "to": "b3"}, {"from": "k2", "to": "b2"},
   {"from": "b3", "to": "b4"}, {"from": "b2", "to": "b5"}, {"from": "b2", "to": "b6"},
   {"from": "b4", "to": "s"}, {"from": "b5", "to": "s"}, {"from": "b6", "to": "s"}
 ]}
```

```prereq B-1 l1 3min
# 五个性能指标
what: 吞吐是单位时间完成的工作量；延迟是一笔交易从提交到可依赖的时间；尾延迟看 p99；状态新鲜度是读到的状态落后多少；持续能力是长期不积压的上限。
why: 每个组件限制的指标不同。并行执行提高吞吐，预确认改善延迟，DA 和证明决定持续能力。
example: Mantle 压测：饱和吞吐 29.5M gas/s，链固有延迟 2 s，端到端 18.2 s。
misconception: 误解：TPS 高，体验就好。事实：Mantle 压测里延迟增量全部来自排队，不来自链。
deeper: [24] Mantle 内部压测报告 §3
```

```prereq B-2 l1 4min
# L2 的两条路径与三个 head
what: 实时路径：sequencer 排序执行，产出 unsafe 区块。安全路径：batcher 把数据发到 L1，节点从 L1 派生出 safe 区块，L1 最终后变成 finalized。
why: L2 可以让实时路径不等安全路径。但安全路径长期落后时，积压会越来越大。
example: OP Mainnet：unsafe 约 2 s，safe 数分钟，finalized 约 15–30 分钟。
misconception: 误解：7 天是最终性。事实：7 天是标准桥提现延迟，挑战不会重组 L2 链。
deeper: [3] OP Docs Transaction finality
needs: B-1
```

```prereq B-3 l1 3min
# 关键路径与流水线
what: 关键路径是一项工作必须依次完成的步骤。流水线让不同区块的不同阶段重叠执行。
why: 流水线提高稳态吞吐，但不缩短单块的端到端时间。理解这一点才能区分“更快”和“更多”。
example: 并行执行时间 T ≥ max(W/p, L)：W 是总工作，p 是线程数，L 是最长依赖链。
misconception: 误解：加线程就能无限加速。事实：依赖链 L 不随线程数缩短。
deeper: [5] Blumofe & Leiserson 1999
needs: B-1
```

```prereq B-4 l1 3min
# state root 与 merkleization
what: state root 是全部状态的一个哈希承诺。每次出块都要把改动写进 Merkle Patricia Trie（MPT），重算到根，这一步叫 merkleization。
why: 出块和验证都要等 root。2024 年 root 占 reth 封块时间超过 75%，2026 年已流水线化。
misconception: 误解：root 永远是瓶颈。事实：Reth 2.0 把区块末尾的 root 降到 1–2 ms。
deeper: [10] Paradigm “Releasing Reth 2.0”
needs: B-3
```

```prereq B-5 3min
# 预确认（preconfirmation）
what: sequencer 在完整区块封好之前，先流式发布部分交易的顺序或执行结果。
why: 它决定用户多快看到结果。Mantle 当前没有亚秒预确认，下限就是 2 s 出块间隔。
misconception: 误解：预确认就是最终性。事实：它承载的是 sequencer 的信任假设，可以被撤回。
deeper: [13] OP Docs Subblocks
needs: B-2
```

```prereq B-6 3min
# DA 与 blob
what: 数据可用性（DA）保证别人能取到重建或验证所需的数据。L2 把交易批次压缩后放进 Ethereum blob 发布。
why: 执行再快，数据发不出去也会积压。blob 容量由所有 L2 共享。
example: 每个 blob 装 130,044 字节；当前每块 target 14 个 blob。
misconception: 误解：状态根很小，所以要发布的数据也很小。事实：root 不能代替数据本身。
deeper: [15] OP Spec Ecotone blob encoding
needs: B-2
```

## J 全景：一笔 mStocks 买单走过哪些组件 {depth=2}
图 1 把 Alice 的买单放进 L2 的两条路径。上一行决定 Alice 多快看到成交；下一行决定这笔成交多快变得不可逆，以及系统能否长期这样运行。

```excalidraw q="一笔 L2 交易经过哪些组件？哪些在实时路径上？" read="上一行是实时路径（蓝），决定延迟和状态新鲜度；下一行是安全路径（紫），决定持续能力和最终性。红框是 Mantle 当前最先限制体验的环节。简化图：省略 deposit 与 L1 origin。" takeaway="执行只占实时路径的一段；持续能力由下一行决定。" name=two-paths kind=系统全景
{"grid": {"w": 250, "h": 150}, "defaults": {"w": 190, "h": 66, "fontSize": 17},
 "nodes": [
   {"id": "u", "label": "钱包 / 账户\n① 准入", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "rpc", "label": "RPC 与 txpool\n排队", "col": 1, "row": 0, "color": "red"},
   {"id": "seq", "label": "sequencer\n③ 排序 ④ 执行", "col": 2, "row": 0, "color": "blue"},
   {"id": "root", "label": "⑤ state root\n封块", "col": 3, "row": 0, "color": "blue"},
   {"id": "read", "label": "⑧ RPC 读到\n新状态", "col": 4, "row": 0, "color": "blue"},
   {"id": "bat", "label": "batcher\n压缩", "col": 2, "row": 1, "color": "violet"},
   {"id": "da", "label": "⑥ L1 blob", "col": 3, "row": 1, "color": "violet"},
   {"id": "prv", "label": "⑦ 派生 + SP1 证明", "col": 4, "row": 1, "color": "violet"}
 ],
 "edges": [
   {"from": "u", "to": "rpc"}, {"from": "rpc", "to": "seq"}, {"from": "seq", "to": "root"},
   {"from": "root", "to": "read"}, {"from": "seq", "to": "bat", "dashed": true},
   {"from": "bat", "to": "da"}, {"from": "da", "to": "prv"}
 ]}
```

```finding F1 high
# 性能不是一个数：五个指标分别受不同组件约束
claim: 流水线提高稳态吞吐，但不缩短单块延迟。预确认提前给出反馈，但不加快最终性。并行执行只能利用已经存在的独立工作。读路径的响应快，不等于状态新鲜。
evidence: [inferred] 由 work/span 下界、RISE shreds 与 OP Subblocks 的语义、Block-STM 的顺序等价约束推出（台账 S8、B7、B17、E11、R14）。[inferred] 读路径的取舍（B65）。
implication: 评估任何优化之前，先写清它改的是哪个指标、哪一层。
```

```finding F2 high
# L1 与 L2 的上限来自不同地方
claim: L1 的每个验证者都要重放全部区块，所以容量受“最慢的合格验证者能否及时重放与追赶”限制；正常路径的通信轮次有理论下界。L2 的实时路径可以很快，但持续能力受执行、DA 发布与证明三者中最小的一个限制。
evidence: [observed] Solana 提到 100M CU 前要求超过 70% 质押启用 XDP，并写明大区块拖慢重放（S16、S59）；n ≥ 5f−1 才能两步达成拜占庭共识（S21）。[observed] OP Stack 中未在 12 小时 sequencing window 内发布的数据会被丢弃（S5）。[inferred] S60。
implication: L2 的“高性能”必须连同 DA 和证明的余量一起验收，不能只看 sequencer 执行了多少交易。
```

```uml q="OP Stack sequencer 一个区块的出块流程是什么？哪一步在关键路径上？" read="op-node 先准备 payload attributes（deposit 排在最前），再让 EL 从 txpool 取交易执行，最后 getPayload 封块并计算 state root。eager next-block 把下一块的开始提前到封块之后。简化图。" takeaway="封块要等 state root；尾延迟主要来自 root 与存储 IO。"
sequenceDiagram
  autonumber
  participant N as op-node
  participant E as EL (op-geth / reth)
  participant P as txpool
  participant G as P2P / RPC
  N->>E: forkchoiceUpdated(attrs: L1 info + deposits)
  activate E
  E->>P: 取交易，按小费排序
  E->>E: 执行交易
  N->>E: getPayload
  rect rgb(251, 234, 234)
    E->>E: 计算 state root，封块
  end
  E-->>N: payload
  deactivate E
  N->>G: gossip unsafe 区块
  N->>E: 下一块的 forkchoiceUpdated（eager next-block）
```

**新人自测**：读完全文后，你应能回答下面 4 个问题。
1. 某个 RPC 返回很快，但 Router 的报价总是失败。可能卡在哪一层？
2. 把出块间隔从 2 s 改成 200 ms，哪些固定开销会变成每秒 10 次？
3. 同样 1,000 TPS，为什么转账和清算对链的压力不同？
4. 一项优化提高了 sequencer 吞吐，你还要检查哪两条下游？

## K 组件 ①：账户、交易表达与准入 {depth=2}
**会产生什么问题**（Alice 的买单）：
- 一个业务动作被拆成多个协议动作：准备 gas、approve、兑换、购买。每一步都要签名和等待。
- 准入的成本先于收费：无效交易在被拒绝前，已经消耗了解析、验签和模拟。
- nonce 队头阻塞：同一账户的前一笔卡住，后面无关的操作也要等。

**优化方向与案例**：
| 方向 | 案例 | 状态 |
|---|---|---|
| 一笔交易表达多个动作 | Base Everest：EIP-8430 原生批量、代付、代币付 gas | warn 日期待定 |
| 协议层智能账户 | Ethereum Hegotá 头条 Frame Tx（EIP-8141）；Mantle 评估 EIP-8130 / 8141 | warn 规划中 |
| 并发 nonce | Mantle 路线图：2D nonce | warn H2 计划 |
| 准入前置检查 | EIP-7825：txpool 直接拒绝 gas 超过 2^24 的交易 | ok Fusaka 已上线 |
| 声明读写集 | Solana：交易声明账户，调度时加锁 | ok 主网 |

```finding F3 high
# 峰值时先坏的是入口，不是执行
claim: Mantle 压测在饱和时，端到端延迟从 3.4 s 涨到 18.2 s，增量全部来自自排队与 mempool 积压；写入端 HTTP 429 率 7.9%（优化前 67%）；多 bot 争抢同一 borrower 造成 27–49% 的 guard revert。
evidence: [observed] 内部压测报告 2026-06-24（台账 K8、K9）。[inferred] R7。
implication: mStocks 上线前要先做入口限流、发送端背压和热点分区。native AA 的设计要同时覆盖 txpool 的验证预算、撤权和代付失败语义。
```

## L 组件 ②：网络传播 {depth=2}
**会产生什么问题**：
- leader 的上行扇出：把同一个区块发给 N 个节点，带宽随 N 增长。
- 传播跳数：每一跳至少一个单程网络时延。Anza 认为传播延迟主要由网络时延决定，不由传输或计算决定。
- L2 的对应问题不是全网投票，而是 sequencer 向跟随节点、RPC 和应用的分发。

**优化方向与案例**：
| 方向 | 案例 | 状态 |
|---|---|---|
| 纠删码 + 多层树 | Solana Turbine | ok 主网 |
| 纠删码 + 两层树，上行带宽与节点数无关 | Monad RaptorCast：最坏 1 个 RTT | ok 主网 |
| 单层中继，减少跳数 | Alpenglow Rotor | no 未排期 |
| 专用低延迟网络 | DoubleZero：约 58% Solana 质押接入（项目方面板） | warn 入口过滤未上线 |
| L2 流式分发 | OP Stack p2p 分发 unsafe 区块；预确认流 | ok |

```finding F4 medium
# 提高区块容量之前，先要证明网络能及时传完
claim: RaptorCast 在 20% 丢包与 33% 恶意节点假设下，需要多发约 87% 的分片，换来不重传。Solana 把区块提到 100M CU 前，先要求超过 70% 的质押启用 XDP 内核旁路网络。
evidence: [observed] Monad Docs RaptorCast（S12、S13）；Solana 100M CU 页（S16）。[observed] Rotor 未排期（S14）。
implication: 对单 sequencer 的 L2，网络层的主要工作是读路径分发与预确认流，不是共识传播。
```

## M 组件 ③：排序、共识、出块与预确认 {depth=2}
这一层有三件事：**排序**决定先后，**出块**决定选哪些交易和何时封块，**共识**让多方接受同一条链。L1 三件都做；单 sequencer 的 L2 主要做前两件。

```finding F5 high
# 共识轮次有下界，“更快”要用假设换
claim: 部分同步拜占庭共识要在 2 个消息延迟内决定，需要 n ≥ 5f−1；PBFT 类需要 3 个。Alpenglow 的约 150 ms 是仿真中位数，不含计算开销，容错是“20% 恶意 + 20% 离线”。MonadBFT 当前 300 ms 出块、600 ms 最终。
evidence: [observed] PODC'21 论文（S21）；solana.com Alpenglow 页与 Anza 博客（S22–S25）；Monad Docs（S29–S31）。[inferred] 主网实测尚未公开（S26）。
implication: 比较“最终性”数字前，先确认它是仿真、自测还是主网实测。
```

```finding F6 medium
# 执行与共识解耦：换来执行预算，代价是用户可见的语义
claim: Monad 的共识只对顺序达成一致，提案带 D=3 块前的状态根；共识只看得到旧状态，所以引入 10 MON 的 reserve balance。Ethereum Glamsterdam 采用 ePBS（EIP-7732），延迟执行（EIP-7886）处于 Stagnant。
evidence: [observed] Monad Docs（S41–S43）；EIP-7732 / 7886 / 7773（S45–S47）。[inferred] 代价包括 root 滞后、准入规则改变、分歧发现更晚（S58）。
implication: L2 的 sequencer 本来就不需要投票，这条路线对 Mantle 的参考价值主要在“延迟 merkleization”，见 [O](#panel-O)。
```

```finding F7 high
# L2 出块的尾延迟来自 state root 与存储 IO
claim: OP Stack 出块是“准备 attributes → 执行 → getPayload 封块（算 root）→ gossip”的串行环。Base 主网上每个 Flashblock 算一次 root 约 130 ms；把 root 移到最终区块后，构建 P50 从 150 ms 降到 10 ms。Base 自测 Geth 构建 p99 为 2,319 ms，Reth 为 698 ms。
evidence: [observed] OP Spec exec-engine（B1）；Base 博客（B2–B4）；OP Mainnet 换 NVMe 前区块会退化到 2.5–3 s（B5）。[inferred] B8。
implication: Mantle 的 eager next-block construction 缩短的是块间空窗。下一步收益在 root 与 IO，而不在解释器。
```

```timeline v
2025-04 | Arbitrum Timeboost 上线 | 60 s express lane 拍卖
2025-07 | Base Flashblocks 主网 | 2 s 区块内每 200 ms 一个
2025-08 | Unichain 200 ms Flashblocks | builder 在 TEE 中
2026-02 | MegaETH 主网 | 约 10 ms mini-block
2026-08-31 | OP Subblocks 上线 | OP Labs 停止支持 op-rbuilder
2026-09-24 | Arbitrum PGA 取代 Timeboost | 250 ms 区块，125 ms 轮次
*2026-10-21 | Base Denim 在 Sepolia 激活 | 200 ms canonical 区块，主网目标 11 月
```

```finding F8 high
# 预确认在 2026 年收回到协议内或自研栈，信任假设没有变
claim: Base 计划在 Denim 中废弃 Flashblocks，改为每 200 ms 一个带独立 state root 的 canonical 区块。OP Labs 用自研 Subblocks 取代 Flashblocks，并在迁移完成后停止运行 op-rbuilder。OP 文档写明 subblock 预确认可以在 sequencer 能 reorg unsafe 区块的同等条件下被撤回。MegaETH 由 sequencer 签名每个 mini-block 头，签名不代表最终性。
evidence: [observed] Base Docs（B13、B14）；OP Docs（B15–B17）；MegaETH Docs（B21）。[inferred] B27。
implication: Mantle 路线图里的“Flashblocks”应理解为“亚秒预确认”能力，不必绑定 rollup-boost / op-rbuilder（R3）。
```

## N 组件 ④：执行（调度与 VM） {depth=2}
执行层有三类瓶颈，处理方法不同：
- **计算**：解释器分派、预编译、keccak。可以用解释器优化或 JIT 压缩。
- **等待状态**：冷读 SSD，以及 trie 带来的读放大。可以用预取、缓存、更好的存储压缩。
- **业务串行依赖**：多笔交易改同一个池子。只能改业务或状态布局。

```finding F9 high
# 2026 年 reth 类客户端的剩余瓶颈是冷读，不是解释器
claim: Base 测得存储访问多的区块执行时间约为无存储访问区块的 30 倍。evm2 的解释器优化在主网回放中只快 4.8–6.2%。revmc JIT 在合成负载上快 1.85–19 倍，在 L1 历史同步上只快 1–10%。
evidence: [observed] Base 博客（E3、E4）；revm-vs-evm2 台账 H37（E8）；Paradigm revmc 博客（E32）。[inferred] E9、E38。
implication: JIT 只对计算密集的合约有意义。Mantle 应先用 profile 测出计算占比，再决定是否立项（R12）。
```

```finding F10 high
# 真实负载的可并行度不高；并行方案分三类
claim: 声明式（Solana 账户锁、Sui 对象所有权）、乐观式（Block-STM、Monad、Sei Giga Ares）、辅助验证式（EIP-7928 BAL）。以太坊近期区块的中位并行度小于 2；RISE pevm 在内存态主网回放中平均快约 2.02 倍。reth 与 geth 都已实现 BAL 路径，但 Glamsterdam 未上主网，所以主网尚未生效。
evidence: [observed] Block-STM 论文与各链文档（E11–E15）；MegaETH 研究页与 pevm benches（E18、E19）；EIP-7928、reth v2.8.0、geth v1.17.9（E20、E22、E28、E29）。[inferred] E31。
implication: Mantle 2025 年的 49.1% “依赖率”是启发式口径（同发送方、同合约同 selector），不能当作并行收益上限。先测 slot 级读写集（M43、M45）。
```

## O 组件 ⑤：状态访问、承诺与持久化 {depth=2}
一笔写入要经过四件事：读到旧值、在执行中维护可回滚的修改、更新 trie 并重算 root、按批次持久化。四件事的瓶颈各不相同。

```finding F11 high
# state root 已不再是 reth 的关键路径瓶颈；“移出关键路径”成为共同做法
claim: Reth 2.0 用跨块保留的 sparse trie 缓存，把主网区块末尾的 root 降到 1–2 ms；Paradigm 因此重启 revmc，并计划基于 BAL 做完整并行。Monad 延迟 D=3 块的 root，RISE shreds 不在预确认路径上算 root，Sei Giga 用 LtHash 写日志摘要。以太坊的 EIP-7862（延迟 state root）在 Hegotá 评级中被暂缓。
evidence: [observed] Paradigm 博客与 reth v2.0.0 release（E5、E7、E51）；Monad Docs（E49）；RISE 博客（B7）；Sei Docs（E55）；EF Hegotá 文（E54）。[inferred] E56。
implication: 2025 年“执行时间只有 merkleization 的 1/6–1/10”的结论已不成立（E70）。
```

```finding F12 medium
# 存储：KV 上再存一棵 trie 造成读放大；新结构的数字多为作者自测
claim: base/triedb 估计在通用 KV 上存 MPT，读写一个值约 50 次磁盘操作，按页组织可降到约 4–8 次。MonadDb 原生实现 Patricia trie 并用 io_uring；MIP-8 把存储承诺改成 4 KiB 一页。Reth Storage v2 把 Gigagas 级区块的持久化从 8.4 s 降到 0.4 s。QMDB 自称比 RocksDB 快 6 倍，NOMT 已发布 1.0.x。
evidence: [observed] base/triedb README（E39）；Monad Docs 与 MIP-8（E40、E41）；Paradigm（E6、E46）；QMDB 论文与 Commonware（E42、E43）；NOMT（E44）。[inferred] E48。
implication: 保持 MPT 根不变的存储优化属于 A 级；换承诺结构属于 D 级（见 [S](#panel-S)）。
```

```finding F13 medium
# 状态增长让“全部放进内存”不再是免费午餐
claim: 2026-01 geth 状态库约 390 GiB；gas 上限从 30M 提到 60M 后，状态年增约 116 GiB。所有执行客户端自 2025-07 起支持删除 merge 前历史（省 300–500 GB），完整滚动历史过期与 state expiry 仍在研究。MegaETH 2024 年“状态可全部放进内存”的前提是约 100 GB。
evidence: [observed] EIP-8037（E61）；EF 博客（E57–E59）；MegaETH 研究页（E64、E67）。[inferred] E69。
implication: 内存化只能解决读延迟，不能消除 root、持久化、DA 与证明的成本。
```

## P 组件 ⑥⑦：数据可用性、证明与结算 {depth=2}
这两层决定持续能力：sequencer 执行得再快，数据发不出去或证明跟不上，积压就会持续变大。

```finding F14 high
# blob 共享容量约 152 KB/s，小额交易先受 DA 约束
claim: OP Stack 一个 blob 装 130,044 字节；BPO2 之后每块 blob target / max 为 14 / 21，即约 152 / 228 KB/s，由所有 L2 共享。按每笔 100 字节算，约支撑 1,500 / 2,300 TPS。Mantle 的 60M gas / 2 s 区块若装满 21k gas 转账，约需 143 KB/s。EigenDA V2 自称 100 MB/s，但安全假设是 restaking 法定人数。
evidence: [observed] OP Spec（B30）；EF Fusaka 公告（B31）；EigenDA 博客（B37）。[inferred] B33、B34、R8；B39。
implication: Mantle 单靠提高 gas 上限扩不了小额交易的容量。容量规划要同时看压缩率与 blob 价格。
```

```finding F15 medium
# 证明能力是持续上限；主流做法是 TEE / optimistic + 按需 ZK
claim: Base 写道 optimistic 系统下“不能产生比证明系统能证明的更多数据”。Base Azul 采用 TEE + ZK 多证明：两种一致时 1 天结算。BOB 的 Kailua 默认 optimistic，争议时只证明 6 个区块。Axiom 自测用 4 张 5090 证明 L1 区块，p99 为 9.7 s。
evidence: [observed] Base 博客与 Docs（B42、B43）；BOB Docs（B47）；Axiom（B48）；Ethproofs（B49）。[speculative] 按 gas 速率线性外推，实时证明一条 200 Mgas/s 的 L2 需要约 40 倍 GPU（B50）。
implication: Mantle 没有公开证明时延。每项容量改动都要把“证明滞后”列为验收指标（R9）。
```

## Q 组件 ⑧ 与横切：读路径与费用计量 {depth=2}
```finding F16 medium
# 响应快不等于状态新鲜
claim: MegaETH 的 replica 节点直接应用 sequencer 的执行结果，不重新执行；full 节点独立重执行。在 Base 的 Flashblocks-aware RPC 上，`eth_call pending` 返回的区块上下文可能落后约 5 块。但返回的状态已包含全部收到的 Flashblocks。OP Subblocks 要求 RPC 节点自己执行交易得出状态。
evidence: [observed] MegaETH Docs（B62）；Base Docs（B64）；OP Docs（B15）。[inferred] B65。
implication: Router 与做市商需要的是“带版本号的新鲜状态”。要分开测 RPC 响应时间与状态新鲜度。
```

```finding F17 medium
# 费用是容量的分配机制：Jovian 已把 DA 写进 base fee
claim: OP Stack Jovian 引入最低 base fee 和 DA footprint：按 FastLZ 估算每笔 DA 字节，计入 `blobGasUsed`，base fee 用 max(gasUsed, blobGasUsed) 更新。此前只能靠 batcher 限流，会压低 base fee 并引发优先费拍卖。Arbitrum 多维定价随 ArbOS 61 发布但禁止启用；EIP-7999 仍是 Draft。
evidence: [observed] OP Spec Jovian（B52、B53）；Arbitrum notice（B57）；EIP-7999（B60）；ZKsync OS 双计量（B58）；MegaETH 双 gas（B59）。
implication: Mantle 已随 Arsia 对齐 Jovian（M9、M10）。在 mStocks 峰值前，先演练 SystemConfig 参数，再考虑新费用维度。
```

## R 2025 年内部研究复核 {depth=2}
| 2025 结论 | 2026 状态 | 依据 |
|---|---|---|
| 执行时间只有 merkleization 的 1/6–1/10 | no 已过时：Reth 2.0 root 尾巴 1–2 ms | E5、E70 |
| Verkle 可能 2025 年引入 | no 已过时：转向 EIP-7864 二叉树（Draft） | E71、M46 |
| JIT 约 2 倍 | warn 未兑现：L1 同步只快 1–10% | E32、E33、M50 |
| Mantle 依赖率 49.1% | warn 口径是启发式，不是 slot 冲突率 | E21、M43、M45 |
| Base 下调 gas limit | no 实际下调的是 target，limit 反而提高 | B66 |
| 小区块 / 流式出块 | warn 部分实现：eager build 已发布，亚秒流未上线 | M48 |
| 中期切换 Reth | warn 进行中：sequencer 切换是 H2 计划 | M47 |
| op-node 需改协议才能不等 L1 deposit | no 不需要：L1 origin 可滞后 600 s | M49 |
| Alpenglow 把容错降到 20% | no 不完整：是 20% 恶意 + 20% 离线 | S24 |
| RISE“共识占 40–80%” | warn 找不到一手来源 | B9、E72 |

```finding F18 high
# 2025 年的 5 条关键结论已过时，3 条需要换口径
claim: 过时：root 是执行的 6–10 倍、Verkle 2025、Base 下调 gas limit、Alpenglow 容错 20%、op-node 需改协议。需换口径：JIT 2 倍、49.1% 依赖率、RISE 的 40–80%。
evidence: [observed] E5、E52、B66、S24、E21。[inferred] E70、E71、M45、M49。[speculative] RISE 数字无一手来源（B9、E72）。
implication: 引用 2025 年内部数字前，先查本表。
```

## S Mantle：基线、约束与改动级别 {depth=2}
```finding F19 high
# Mantle 当前不缺吞吐：主网平均只用了 gas 上限的约 0.17%
claim: 2026-10-26 读取主网：2 s 出块，gasLimit 60M，gas target 15M，base fee 停在 50 gwei 的下限；24 小时平均 gas 利用率约 0.17%，单块最高约 8.4%。内部压测的饱和吞吐 29.5M gas/s 约等于 60M ÷ 2 s，即配置上限，不是执行层的能力上限。
evidence: [observed] 主网 RPC `eth_feeHistory` 与区块 extraData（K1–K3）；内部压测（K7）。[inferred] K10、R1。
implication: 短期收益来自延迟、入口和账户体验。mStocks 上线后的峰值要靠参数预案与背压接住，而不是先扩容执行层。
```

```finding F20 high
# Mantle 已经做完的事：对齐 Jovian、迁到 blob、ZK 证明、eager build 已发布
claim: Arsia（主网 2026-04-22）一次激活 Canyon 到 Jovian 共 8 个 OP 分叉，带来 span batch、Brotli、三段式费用、动态 EIP-1559 和 DA footprint。DA 已从 EigenDA 迁到 Ethereum blob，当前约每 7–8 分钟 1 个 blob。自 2025-09-16 起状态根走 OP Succinct（SP1），提款期 12 小时是安全缓冲。v1.6.3 Elysium 带 eager next-block construction。
evidence: [observed] mantle-v2 releases 与 Mantle Docs（M5、M7–M10、M12、M13、M25、M26）；L1 batcher 交易（K6）。[inferred] 主网是否已开 eager build 无法从公开信息确认（M15、K5）。
implication: 路线图不应把 span batch、Brotli、eager build 再列为新项目。下一步是确认 eager build 在主网运行。
```

```excalidraw q="一项改动要碰哪些组件？复杂度从哪里来？" read="从左到右，每一级都包含前一级的工作量。分级看规范协议要不要变。蓝色 A/B 级不改协议：A 改 sequencer 或 EL 实现，B 改参数。黄色 C 级改协议：要改 op-node、两个 EL、kona，并轮换 SP1 vkey。红色 D 级还要改 L1 提款证明。" takeaway="先判断改动级别，再估算成本；A/B 级可以快速迭代，C/D 级要排进硬分叉。" name=change-levels kind=改动级别
{"grid": {"w": 270, "h": 150}, "defaults": {"w": 230, "h": 96, "fontSize": 16},
 "nodes": [
   {"id": "a", "label": "A 只改 sequencer\n预确认 · 车道 · 换 EL", "col": 0, "row": 0, "color": "blue"},
   {"id": "b", "label": "B 改 SystemConfig\ngas target · min base fee", "col": 1, "row": 0, "color": "blue"},
   {"id": "c", "label": "C 硬分叉\nnative AA · BAL · 区块时间", "col": 2, "row": 0, "color": "yellow"},
   {"id": "d", "label": "D 改结算接口\n换状态承诺结构", "col": 3, "row": 0, "color": "red"}
 ],
 "edges": [{"from": "a", "to": "b"}, {"from": "b", "to": "c"}, {"from": "c", "to": "d"}]}
```

```finding F21 high
# 改动级别决定复杂度：C 级要同时改 Go、Rust 和证明程序
claim: Mantle 的 SP1 证明程序由 kona 编译，在 zkVM 里重做派生与执行。所以改变派生或状态转换的改动，要同时改 op-node、op-geth、reth / op-revm、kona，并轮换 vkey。只改 sequencer 调度、不改规范结果的改动不碰证明。换状态承诺还会波及 L1 上的提款证明。
evidence: [observed] OP Succinct 不改 op-geth / op-batcher / op-node（M55）；Mantle SP1 Workflow（M56）；output root 构造（M60）。[inferred] M57、M59、R5。
implication: 换 EL 是 A 级，但带 C 级的验证负担：2026-01 Mantle 就出过一次 revm 与 geth 不一致、无法生成 ZKP 的事故（M58、R4）。
```

**四类 mStocks 用户需要什么**（推断，M42、R6）：
| 用户 | 需要的性能属性 | 主要涉及的层 |
|---|---|---|
| 发行方 | 确定性纳入、可对账的最终性语义 | ① ③ ⑧ ⑦ |
| 普通买家 | 少签名、报价新鲜、亚秒反馈 | ① ③ ⑧ |
| 做市商 / Prop AMM | 撤单优先、低尾延迟、状态新鲜 | ③ ⑧ |
| Agent | 并发 nonce、限权代付、代付不成热点 | ① |

## T Mantle 路线：短 / 中 / 长期 {depth=2}
排期按三条规则：收益看 mStocks 场景，复杂度看改动级别（A–D），顺序看依赖。这是研究者建议，不是 Mantle 已批准的计划（R17）。

**短期（0–3 个月，2026-11 至 2027-01）。目标：看清瓶颈，接住 mStocks 上线峰值，定下亚秒预确认的做法。**
| 任务 | 级别 | 为什么现在做 | 依据 |
|---|---|---|---|
| 分段 trace：提交 → 准入 → 排队 → 执行 → root → 可读 → batch → 证明 | A | 所有后续改动的验收基准 | R9、K8 |
| 主网区块回放基准 + slot 级依赖图 | A | 决定并行和 JIT 是否立项 | R12、M45 |
| mStocks 峰值预案：gas target、denominator、min base fee 演练 | B | 成本最低，压测中 base fee 涨了 893% | R10、K9 |
| 入口限流、发送端背压、RPC 读写隔离 | A | 压测延迟增量全是排队 | R7 |
| 确认并开启主网 eager next-block | A | 已发布，主网状态未确认 | M15、K5 |
| op-geth ↔ reth ↔ kona 逐块差分门禁 | A | pure reth 切换的前提 | R4、M58 |
| 亚秒预确认：定语义（前缀锁定、签名、撤回条件）并在 reth builder 上做原型 | A | 2 s 是当前延迟下限 | R2、R3、B11、B21 |
| native AA（8130）+ 2D nonce：规范与 PoC | C | 硬分叉周期长，要先启动 | M38、M39 |

**中期（3–6 个月）。目标：亚秒确认与账户层上线，执行层追平上游。**
| 任务 | 级别 | 条件 / 理由 | 依据 |
|---|---|---|---|
| 亚秒预确认上主网，RPC 暴露预确认状态，测状态新鲜度 | A | 原型验证通过后 | F8、F16 |
| sequencer 切到 pure reth，geth 做热备 | A | 差分门禁连续通过 | M23、R4 |
| 追平上游 reth（prewarm 复用、BAL 路径） | A | 低风险的执行与状态收益 | R16 |
| native AA + 2D nonce 硬分叉 | C | 改 op-node、两个 EL、kona、vkey | R5、M57 |
| Prop AMM 撤单优先车道：设容量上限，规则可审计、可上链治理 | A/B | 避免专用车道挤占普通用户 | M40 |
| 分布式 GPU 证明网络上主网；证明滞后纳入验收 | A | 扩容前先有证明余量 | K11、R9 |
| Glamsterdam 对齐（Sequencer / Prover / RPC） | C | 跟随 L1 节奏 | K12 |

**长期（6–12 个月及以后）。目标：只改测量证实的剩余瓶颈。**
| 任务 | 级别 | 立项条件 | 依据 |
|---|---|---|---|
| sequencer 内乐观并行执行 | A | slot 级依赖图显示足够独立工作 | R11、R12 |
| 验证端 BAL 并行 | C | 随 Glamsterdam 对齐评估 | R11、E26 |
| 热点合约 JIT | A | profile 显示计算占比高 | R12、F9 |
| 更短区块（如 200 ms canonical） | C | root 与持久化达到毫秒级，证明跟得上 | R15 |
| DA 方案：压缩率、blob 价格、是否需要其他 DA | B/C | 需求逼近共享 blob 容量 | R8 |
| 跟随以太坊二叉树（EIP-7864） | D | 以太坊定案之后 | R13 |

```uml q="路线里的任务之间有什么依赖？" read="箭头表示“先完成 → 才能开始”。绿色是短期，蓝色是中期，黄色是长期的条件式任务。" takeaway="分段 trace、回放基准和差分门禁是所有后续工作的共同前提。"
flowchart TB
  t["分段 trace + 回放基准"]:::s --> dep["slot 级依赖图"]:::s
  t --> par["峰值预案 + 入口背压"]:::s
  diff["逐块差分门禁"]:::s --> reth["sequencer 切 pure reth"]:::m
  reth --> up["追平上游 reth"]:::m
  pc["预确认语义 + 原型"]:::s --> pcm["亚秒预确认上主网"]:::m
  pcm --> lane["撤单优先车道"]:::m
  aa["native AA + 2D nonce 规范"]:::s --> hf["账户层硬分叉"]:::m
  dep --> pe["并行执行（条件式）"]:::l
  up --> pe
  t --> jit["JIT（条件式）"]:::l
  prov["证明网络上主网"]:::m --> blk["更短区块（条件式）"]:::l
  up --> blk
  classDef s fill:#e6f4ea,stroke:#2e7d32
  classDef m fill:#e8f0fe,stroke:#1a56db
  classDef l fill:#fff8e1,stroke:#b7791f
```

```callout warn CAUTION
不要在同一次上线里同时切换 EL、启用新 AA 语义和新排序规则。三者叠加会让差分失败时无法定位原因；2026-01 的 ZKP 事故就是等价性问题（M58）。
```

## U 局限与开放问题 {depth=2}
- **主网 sequencer 的真实配置无法从公开信息确认**：op-node 版本（是否开了 eager build）、执行客户端、preconf 车道是否启用（K5、M15）。推测 sequencer 仍以 op-geth 为主（[speculative] M24）。
- **Mantle 证明时延没有公开数字**（M26）。路线图里“证明余量”的门槛需要运维数据。
- **执行占比没有 Mantle 自己的 profile**。E 组结论来自以太坊与 Base 的数据，Mantle 负载更集中，可能不同。
- **压测是合成负载**：Sepolia QA 链上的 mock 合约，不是主网状态分叉（K7）。
- **mStocks 条款只有二手来源**：发行方是 Halo Prime Limited 的说法未找到一手文本（[speculative] M36）；上线目标是 2026-11（M34）。
- **多个外部数字是项目自测或仿真**：Alpenglow 150 ms、QMDB 6 倍、RISE 5 Ggas/s、Sei 5 Ggas/s。
- **Firedancer 在 Alpenglow 后的参与情况存在矛盾**（[speculative] S57）。

## V 方法与证据 {depth=3}
- **资料**：作者 Notion drafts；2025 年内部高性能研究 29 篇（Notion）；ChatGPT Deep Research 结果（只当线索，见 `research/gpt-deep-research.md`）。
- **调研**：四路并行：系统与共识 S、L2 出块 / DA / 证明 B、执行与状态 E、Mantle M。每条论断追到一手来源。
- **主会话核对**（K）：Mantle 主网 RPC（`cast block`、`eth_feeHistory` 24 个窗口）、L1 batcher 交易（Blockscout + `cast tx`）、mantle-xyz 仓库 release 与 tag、内部压测报告、Mantle 官方路线图；抽查 5 条 observed 论断（`notes-mainsession.md` §7）。
- **综合推导**（R）：路线依据，每行写明由哪些行推出。
- **台账**：289 行，observed 222 / inferred 60 / speculative 7。

复现主网读数：
```bash title="Mantle 主网参数与利用率"
R=https://rpc.mantle.xyz
cast block latest -r $R --json | jq '{gasLimit,baseFeePerGas,extraData}'
cast rpc eth_feeHistory 1024 latest '[]' -r $R \
  | jq '(.gasUsedRatio|add)/(.gasUsedRatio|length)'
```

## W 术语表 {depth=2}
```glossary
sequencer | 排序器 | L2 上负责接收交易、排序、执行并产出区块的节点。 | 不是验证者集合
派生 | derivation | 节点只用 L1 上的数据，确定性地重建 L2 区块的过程。 | 不是从 sequencer 同步
unsafe 区块 | unsafe head | sequencer 已产出、但还不能从 L1 数据派生的区块。 | 不是无效区块
预确认 | preconfirmation | 在完整区块封好前，sequencer 先发布部分交易的顺序或结果。 | 不是最终性
state root | 状态根 | 全部状态的一个哈希承诺，每个区块都要重算。 | 不是区块哈希
merkleization | Merkle 化 | 把状态改动写进 trie 并重算到根。 | 不是持久化
关键路径 | critical path | 一项工作必须依次完成的步骤链。 | 不是最耗资源的步骤
流水线 | pipelining | 让不同区块的不同阶段重叠执行，提高稳态吞吐。 | 不缩短单块延迟
持续能力 | sustained capacity | 长期运行而不积压的上限，受执行、DA、证明中最小者限制。 | 不是峰值 TPS
状态新鲜度 | freshness | 读到的状态落后最新执行结果多少。 | 不是 RPC 响应时间
DA | 数据可用性 | 保证参与者能取到验证或重建所需的数据。 | 不是网络传播
blob | EIP-4844 blob | Ethereum 区块附带的大块数据，L2 用它发布批次。 | 不是 calldata
BPO | blob parameter only fork | 只调整 blob target / max 的小型分叉。 | 
eager next-block construction | 提前构建下一块 | 封完上一块后立即开始构建下一块，缩短块间空窗。 | 不是预确认
BAL | Block-Level Access List，EIP-7928 | 区块携带每笔交易读写了哪些状态，验证端据此并行。 | 不是调度器
Block-STM | 乐观并行执行 | 先并行执行，再按预定顺序验证读集，冲突时重执行。 | 结果等同串行
reserve balance | 储备余额 | Monad 让共识在只看得到旧状态时仍能安全纳入交易的规则。 | 
ePBS | EIP-7732 | 把执行 payload 的验证移出共识关键路径的提议者–构建者分离。 | 不是延迟执行
JIT | 即时编译 | 运行时把热点合约字节码编译成机器码。 | 不改 gas 语义
冷读 | cold read | 读取不在内存缓存里的状态，要访问 SSD。 | 
sparse trie | 稀疏 trie | 只加载被改动路径的 trie 片段，用于后台计算 root。 | 
SystemConfig | L1 配置合约 | L1 上的合约，参数经派生带到 L2，例如 gas target 与 min base fee。 | 改它不需要硬分叉
DA footprint | Jovian DA 计量 | 按估算的 DA 字节计入区块的 `blobGasUsed`，参与 base fee 更新。 | 不是 L1 data fee
kona | OP Stack Rust 实现 | Mantle 的 SP1 证明程序由它编译，在 zkVM 里重做派生与执行。 | 
vkey | 验证密钥 | L1 合约用它验证 SP1 证明；证明程序一变就要轮换。 | 
2D nonce | 二维 nonce | 一个账户有多条独立的 nonce 序列，避免队头阻塞。 | 不解除状态冲突
native AA | 原生账户抽象 | 在协议层支持智能账户、代付和会话密钥。 | 不是 ERC-4337
replica 节点 | replica node | 直接应用 sequencer 的执行结果、不重新执行的读节点。 | 不是 full 节点
```

## X 参考资料 {depth=2}
1. **PRIMARY** ethereum.org《Nodes and clients》。执行客户端与共识客户端的分工。
2. **PRIMARY** OP Stack Spec《Derivation》《L2 Execution Engine》。派生、三个 head、Engine API 出块流程。
3. **PRIMARY** OP Docs《Transaction finality》《Fault proofs explainer》。各阶段时间与信任假设。
4. **PRIMARY** Kuznetsov, Tonkikh, Zhang, PODC'21（arXiv 2102.12825）。快速拜占庭共识的轮次下界。
5. **PRIMARY** Blumofe & Leiserson, JACM 1999；Block-STM（arXiv 2203.06871）。work/span 下界与乐观并行。
6. **PRIMARY** Monad Docs：Asynchronous Execution、Reserve Balance、RaptorCast、MonadBFT、MonadDb、MIP-8、JIT Compilation。
7. **PRIMARY** solana.com：Alpenglow、100M CU Blocks、Reduced Slot Times；Anza Alpenglow 博客。
8. **PRIMARY** EIP-7732、7773、7825、7886、7928、7999、8037、7864；EF 博客（Fusaka、Glamsterdam Hoodi、Hegotá、Partial history expiry、Future of state）。
9. **PRIMARY** Base 博客与 Docs：Scaling Base With Reth、Flashblocks Deep Dive、Doubling capacity、Upgrades（Azul / Denim / Everest）、Throughput and Limits。
10. **PRIMARY** Paradigm：Releasing Reth 2.0、Reth's path to 1 gigagas、Releasing Revmc；reth v2.0.0 / v2.8.0 release。
11. **PRIMARY** base/triedb README；QMDB（arXiv 2501.05262）；thrumdev/nomt；geth Archive mode 与 v1.17.9 release。
12. **PRIMARY** MegaETH Docs（Architecture、Mini-Blocks、Dual Gas、Stateless Validation）与 Research 页。
13. **PRIMARY** OP Docs：Subblocks、Preconfirmation Architecture Transition。
14. **PRIMARY** Arbitrum Docs：PGA、ArbOS 61 notice。
15. **PRIMARY** OP Spec：Ecotone blob encoding、Fjord、Jovian、Span Batches。
16. **PRIMARY** EigenDA V2 博客；Celestia Mainnet Beta 文档。
17. **PRIMARY** OP Succinct Book；BOB Kailua Docs；Axiom OpenVM 2.1；Ethproofs。
18. **PRIMARY** Sei Giga 论文与 Docs；Sui Mysticeti v2；Aptos Raptr / Zaptos 论文；Hyperliquid Docs。
19. **PRIMARY** mantle-xyz/mantle-v2 releases（Everest–Elysium）与 PR #370。
20. **PRIMARY** Mantle Docs：Roadmap、Arsia、DA 迁移、OP Succinct 升级、SP1 Workflow、Node Introduction。
21. **PRIMARY** mantle-xyz/reth、mantle-xyz/op-geth releases 与 tag。
22. **PRIMARY** Mantle 主网 RPC 与 L1 batcher 读数（2026-10-26，`research/notes-mainsession.md`）。
23. Bybit 新闻稿（2026-10-12）：mStocks 合作与目标上线时间。
24. Mantle 内部压测报告 `mantle-performance-test` qa_liquidation_summary_20260624（私有仓库）。
25. L2BEAT Mantle 页：DA 迁移、vkey 轮换、2026-01 revm hotfix 记录（第三方监测）。
26. research-hub 报告：revm-vs-evm2、application-specific-sequencing、native-aa-eip-8130-8141。

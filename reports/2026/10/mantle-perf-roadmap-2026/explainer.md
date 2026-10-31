---
template: research
title: 2026 Mantle 性能优化路线：评审与实验方案
subtitle: 草稿的方向成立，但排期前要先补三件事：分清实验测的是哪个 sequencer，把预确认承诺当作上线门槛，把证明与持久化写进容量判据。短区块、并行 EVM 和换 commitment 都等测量结果再立项。
cols: 4
type: 路线评审 · 实验设计 · 工程排期
audience: Mantle 协议 / 基础设施工程师与路线负责人：熟悉 OP Stack、reth 和预确认的基本概念，要用本文排期和设计实验
scope: 作者草稿的 11 项路线与出块路径实验 E1–E8；Mantle 公开源码、生产部署画像与主网链上数据；外部项目一手资料；GPT 评审的逐条核对
evidence: 322 条论断台账（observed 215 / inferred 95 / speculative 12）；源码 mantle reth @574e7f3、op-geth @e33cd26、mantle-v2 @1780605、op-succinct @6b1cb57、reth v2.2.0 @88505c7；主网 RPC 与 L1 读数（2026-10-31）
date: 2026-10-31 · v1
---
结论先行：草稿有三条主线，都成立：先测出块路径，不套用外部链的结论，把 RPC、DA 与证明滞后一起观察（[F1](#F1)）。但它和 GPT 的评审都漏了一个前提：**主网 sequencer 今天仍是 op-geth**，草稿描述的 reth 出块路径只在 Sepolia 和候选节点上运行（[F2](#F2)）。

代码核对还发现四个直接影响排期的问题。reth 的预确认承诺在断电或主备切换时可能丢失（[F3](#F3)）。reth 按默认预算开 `--preconf.all` 时，每块新进的用户交易最多约 6M gas（[F4](#F4)）。reth 当 sequencer 时，封块仍同步计算 state root（[F6](#F6)）。如果生产沿用证明程序的默认并发（1），每个 range 必须在约 1 小时内证完（[F8](#F8)）。

所以短期先做配置清单、承诺审计、证明流水线与存储盘点，再按测量结果决定短区块、evm2、并行 EVM 和 commitment（[路线](#panel-N)）。

## A 路线逐项判断 {sheet span=2 meta="研究者建议，非已批准计划"}
| 草稿方向 | 草稿 | 建议 | 主要理由 |
|---|---|---|---|
| 出块路径实验 | 短期 | ok 保留，先补 E0 | 实验要写明 sequencer 客户端 |
| 预确认承诺（E4） | 短期之一 | no 提前为上线门槛 | journal 不 fsync，切换无交接 |
| 多证明 / 证明系统 | 中长期 | warn 拆开：诊断提前到短期 | 默认并发下 1 个 range 要在约 1 小时内证完 |
| DB | 中长期 | warn 盘点提前到短期 | Storage v1 在 2027-01 停止支持 |
| DA 限制 | 中长期 | warn 计量校准提前到短期 | footprint 与真实字节不是一回事 |
| revm → evm2 | 短期 | warn 改为“先追平，再对照” | OP 上游还没迁移，收益约 10% |
| 更短区块 | 短 / 中期 | warn 中期，协议级改造 | op-node 按整秒排程 |
| 网络广播 | 中 / 长期 | warn 改写为 L2 数据分发 | 备机与读副本才是 L2 的问题 |
| Parallel EVM | 中 / 长期 | ok 保留，换测量方法 | 看关键路径，不看冲突比例 |
| commitment | 长期 | ok 保留，分三类 | 先拆证明成本 |
| state expiry | 长期 | ok 低优先级，改写动机 | 先用 Storage v2 与裁剪 |
| LFM / lanes / ASS | 长期 | ok 只做需求分析 | 主网利用率约 0.3% |

## B 关键事实 {sheet span=2 meta="2026-10-31，均有出处"}
| 事实 | 数值 | 台账 |
|---|---|---|
| 主网 sequencer 客户端 | op-geth v1.6.3 | K2 |
| reth 的角色 | 主网候选 / Sepolia sequencer | K2、K3 |
| 主网参数 | 2 s · limit 60M · target 15M | K16 |
| 24 小时抽样平均利用率 | 0.32%（抽样中无区块超过 target） | K18 |
| reth 预确认默认预算 | 单笔 2M · 每块 6M gas | P7、P8 |
| 证明 range | 1800 块；默认并发 1（生产待核实） | D41、D71 |
| blob 装载率 | 每 7.5 分钟 1 个 blob，约 5% | D12、D13 |
| 上游 reth | v2.9.0 已换 evm2；Mantle 在 v2.2.0 | X14、X1 |

## C 草稿与 GPT 都没发现的事 {sheet span=2}
1. 主网 sequencer 是 op-geth。草稿的 reth 路径是目标架构（K9）。
2. 主网客户端 op-geth 另有一套预确认：内存 FIFO，回执来自影子环境；主网是否启用未确认（P82、P84、K12）。
3. reth 按默认预算开 `--preconf.all` 后没有普通路径，新进用户交易每块约 6M gas（P19、P20）。
4. Mantle 的两个 reth builder 都不接 sparse trie，封块同步算 root（X42）。
5. 生产 reth 每块持久化，上游默认是 2 块（K5）。
6. 证明流水线不记录 cycle，瓶颈拆解要单独跑（K24）。

## D 实验清单 {sheet span=2 meta="E0–E8 改写，E9–E14 新增"}
| 编号 | 问什么 | 优先级 |
|---|---|---|
| E0 | 各环境实际跑的是什么配置？ | P0 |
| E4 | 回执发出后，承诺能否兑现？ | P0 门槛 |
| E10 | 证明能否跟上每小时 1 个 range？生产并发是多少？ | P0 |
| E11 | DA footprint 与真实字节差多少？ | P0 |
| E9 | reth 封块时 root 与持久化占多少？ | P0（切换前） |
| E1–E3 | 预确认延迟、eager build、预算 | P1 |
| E5–E8 | 读路径、导入、持续负载、突发 | P1 |
| E12 | evm2 对 Mantle 全链路有多少收益？ | P1 |
| E13–E14 | pEVM 关键路径；短区块可行性 | P2 |

## E 排期 {sheet span=2 meta="建议，从 2026-11-02 起算"}
```timeline
0–2 周 | 看清配置与承诺 | E0 清单；E4 承诺审计；E10 证明拆段；E11 footprint 普查；Storage 模式盘点
2–6 周 | 修现有路径 | 改写后的 E1–E8；E9 封块计时；追平 OP 上游 op-reth；预确认指标补齐
6–16 周 | 按结果推进结构 | 证明扩容或缩 range；预确认状态流；短区块原型；pEVM 重测
4–9 个月 | 只做测量证实的协议改动 | commitment、state expiry、LFM、多证明，各自满足进入条件才立项
```

## F 结论 {sheet span=2}
```callout ok 先测清楚，再改协议
- 每个实验先写明：哪个 sequencer 客户端、哪种预确认模式、哪个承诺级别。
- 预确认的“一定上链”是正确性门槛，不是性能指标。先过 E4，再对外承诺。
- 容量判据要包含证明节奏和持久化，不能只看 sequencer 的封块时间。
- 从 [F2](#F2)、[F3](#F3)、[F8](#F8) 和 [路线](#panel-N) 开始读。
```

## G 如何阅读 {depth=1}
```callout info 默认你已知道（本文不解释）
- OP Stack 的 op-node、batcher、执行客户端（EL）分工，以及 unsafe / safe / finalized 三个 head
- reth 与 op-geth 都能当 EL
- EIP-1559 的 base fee 按区块用量调整
- Mantle 用 OP Succinct（SP1）生成有效性证明
```
- **5 分钟**：读总览 A–F，再读 [F2](#F2)、[F3](#F3)、[F8](#F8)。
- **30 分钟**：[Context](#panel-H) → [前置知识](#panel-I) → [现在的系统](#panel-J) → [发现](#panel-K) → [实验方案](#panel-L) → [路线](#panel-N)。
- **完整**：再读 [新增实验](#panel-M)、[修正对照](#panel-O)、[方法与证据](#panel-Q)、[复现](#panel-R)。每条论断的出处在 `research/ledger.md`。

## H Context：为什么现在评审这份路线 {depth=2}
**问题**：作者起草了 2026 Mantle 性能优化路线（11 项）和 8 个出块路径实验（E1–E8），准备用作排期和上线判据（U1、U2）。GPT Deep Research 已经给了一轮评审，但它的代码发现和外部结论都需要核实。

**为什么现在**：
- Reth v2.9.0 于 2026-10-29 发布，执行引擎换成 evm2（X14、X15）。
- Base 的原生 200 ms 区块 10-21 在测试网激活，主网计划 11 月（P60、P61）。
- Mantle 公开代码已有 reth 预确认子系统和 eager build（P1、P45）。

**要回答的问题**（来自 brief）：
1. Mantle 当前的性能基线是什么？哪些能确认，哪些只是假设？
2. 草稿每个方向的外部现状、适用性和紧急程度是否合理？
3. E1–E8 能否支持草稿的“结果 → 措施”？要补哪些实验？
4. GPT 的哪些发现属实，哪些错误或过时？
5. 重排后的短 / 中 / 长期路线是什么？

**范围与非目标**：
- 包括：草稿路线与 E1–E8；Mantle 公开源码、部署画像与链上数据；外部项目一手资料。
- 不包括：在 QA 链上实际运行实验；代币经济；给其他公司的建议；未公开的生产配置（只标为待核实）。

**判断标准**（先于结论定下）：
- 区分三类事实：公开代码的实现、代码默认值、生产配置。
- 一个实验只有在“对照成立、样本够、指标对准假设”时，才能支持它写的措施。
- 改动级别（本地实现 / 参数 / 协议语义）决定立项方式，测量结果决定优先级。

## I 前置知识 {depth=2}
**运行示例**：主网区块 102640855 里有一笔 ERC-4337 `handleOps` 交易。它用了 120,982 gas，DA footprint 是 151,600（K41）。下文用它说明每个环节会在哪里限制这笔交易。

```excalidraw q="读懂本文需要哪些概念？按什么顺序读？" read="灰色虚线是默认已知；蓝框是卡片编号；箭头表示先读 → 后读；绿框是本文要做的判断。" takeaway="先读 B-1 和 B-2：承诺层级和排队是全文判读实验的两把尺子。" name=prereq-map kind=前置知识地图
{"grid": {"w": 290, "h": 110}, "defaults": {"w": 200, "h": 58, "fontSize": 17},
 "nodes": [
   {"id": "k1", "label": "OP Stack 组件", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "k2", "label": "EIP-1559", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b1", "label": "B-1 承诺层级", "col": 1, "row": 0, "color": "blue"},
   {"id": "b2", "label": "B-2 排队与积压", "col": 1, "row": 1, "color": "blue"},
   {"id": "b3", "label": "B-3 预确认", "col": 2, "row": 0, "color": "blue"},
   {"id": "b4", "label": "B-4 封块与持久化", "col": 2, "row": 1, "color": "blue"},
   {"id": "b5", "label": "B-5 尾延迟样本量", "col": 2, "row": 2, "color": "blue"},
   {"id": "b6", "label": "B-6 DA footprint", "col": 1, "row": 2, "color": "blue"},
   {"id": "s", "label": "先做哪些实验？", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "k1", "to": "b1"}, {"from": "b1", "to": "b3"}, {"from": "b2", "to": "b4"},
   {"from": "k2", "to": "b6"}, {"from": "b2", "to": "b5"},
   {"from": "b3", "to": "s"}, {"from": "b4", "to": "s"}, {"from": "b5", "to": "s"}
 ]}
```

```prereq B-1 l1 3min
# 承诺层级：六种不同的“快”
what: 一笔交易依次得到 6 种结果：提交成功、预确认、封块后 RPC 可读、DA 发布、证明完成、结算。每一层的承诺强度不同。
why: 草稿的 E1–E8 测的是前三层，容量却由后三层决定。两组数字不能互相替代。
example: 示意：交易封块后约一个出块间隔（2 s）在 RPC 可读。证明按 range 提交：最近一次提交距该 range 末块约 40 分钟、首块约 100 分钟（D42）。
misconception: 误解：回执快就等于交易安全。事实：回执只是 sequencer 的承诺，是否能兑现要看 E4。
deeper: [9] OP Spec；GPT 评审 §1.1（线索）
```

```prereq B-2 l1 3min
# 排队与积压
what: 每个阶段的积压按 dQ/dt = λ − μ 变化。λ 是到达速度，μ 是处理速度。λ 持续大于 μ 时，积压一直增长。
why: 下游阶段（DA、证明）跟不上时，sequencer 越快，积压越大。突发之后的清空时间约为 Q / (μ − λ正常)。
example: 默认并发下证明每次只跑 1 个 range（1800 块）。单个 range 超过约 3600 s，range 就会越积越多（D72）。
misconception: 误解：停止加压后积压清零，就说明能恢复。事实：生产中正常流量不会停，清空更慢。
deeper: GPT 评审 §1.2、E8（线索）；台账 D70
needs: B-1
```

```prereq B-3 l1 4min
# 预确认（preconfirmation）
what: sequencer 在封块之前，先执行交易并返回回执。Mantle 有两套实现：op-geth 版（在主网客户端里，是否启用未确认）和 reth 版（Sepolia 与候选节点已开启）。
why: 它决定用户多快看到结果，也决定 sequencer 对用户承诺了什么。
example: reth 版默认：超时 1 s，单笔上限 2M gas，每块预算 6M gas，普通交易每 200 ms 放行一次（P4–P8）。
misconception: 误解：`--preconf.all` 是开关。事实：开关是 `--preconf.enable`，`--preconf.all` 是资格规则（P1、P2）。
deeper: [1] mantle reth preconf crate；[2] op-geth preconf 包
needs: B-1
```

```prereq B-4 3min
# 封块与持久化
what: 封块要算出 state root。持久化把已封的块写进磁盘数据库。reth 在独立线程里持久化，和下一块的执行并行。
why: 封块慢会推迟区块发布。持久化长期跟不上，差距到 16 块时，reth 停止处理 engine 请求（X84）。
example: Mantle 生产 reth 每块都持久化，MDBX 用 Durable 模式（K5、K6）。
misconception: 误解：Reth 2.0 已把 root 降到 1–2 ms，封块不再受 root 限制。事实：那是 engine 校验路径，Mantle 的 builder 没有接入（X42）。
deeper: [4] reth v2.2.0 engine tree；[12] Paradigm Reth 2.0
needs: B-2
```

```prereq B-5 3min
# 尾延迟需要多少样本
what: p99 是第 99 百分位。要估计它，样本里必须有足够多的“最慢 1%”。
why: 草稿 E8 只跑约 40 个满块。40 个样本里，超过真实 p99 的期望只有 0.4 个（K35）。
example: 2 s 出块跑 30 分钟是 900 块。真实 p99 约 96% 落在第 16 大与第 4 大样本之间（K36）。
misconception: 误解：交易很多，所以区块级 p99 可靠。事实：区块级指标的样本数是区块数，不是交易数。
deeper: 台账 K35、K36 的计算
needs: B-2
```

```prereq B-6 3min
# DA footprint
what: OP Jovian 规则给每笔交易估一个压缩后字节数，乘以 scalar（Mantle 是 400），记作 DA footprint。全块 footprint 不能超过 gas limit。
why: base fee 按 max(gasUsed, footprint) 调整（D20）。小交易可能先碰到 footprint 上限。
example: 运行示例的交易 gasUsed 120,982，footprint 151,600，所以计费按 footprint（K41、K42）。
misconception: 误解：footprint 先到上限，说明 L1 blob 带宽不够。事实：Mantle 的 blob 只装了约 5%（D13、D27）。
deeper: [9] OP Spec Jovian exec-engine
```

## J 现在的系统：两套 sequencer，两套预确认 {depth=2}
图 2 是今天的部署。草稿 §2.1 写的路径“reth 执行 → RPC 节点（op-geth）导入”，与 Mantle 路线图里“sequencer 切到 reth”的目标一致。但今天主网出块的仍是 op-geth（K2、K9）。

```excalidraw q="今天谁在出块？草稿描述的 reth 路径在哪里运行？" read="第一行是今天的主网（蓝）；最后一行是 Sepolia，也是切换后的目标（黄 = 待验证）。中间的灰色虚线节点只跟随，不出块。" takeaway="主网与 QA 链测的是两套 sequencer 实现，数据不能直接对照。" name=deployment kind=部署拓扑
{"grid": {"w": 300, "h": 120}, "defaults": {"w": 200, "h": 66, "fontSize": 16},
 "nodes": [
   {"id": "rpc0", "label": "主网 RPC\nop-geth", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "seq0", "label": "主网 sequencer\nop-geth v1.6.3", "col": 1, "row": 0, "color": "blue", "strokeWidth": 3},
   {"id": "pc0", "label": "预确认（启用未确认）\n内存 FIFO", "col": 2, "row": 0, "color": "blue"},
   {"id": "cand", "label": "候选 sequencer\nreth v1.6.2", "col": 1, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "rpc1", "label": "Sepolia RPC", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "seq1", "label": "Sepolia sequencer\nreth + preconf", "col": 1, "row": 2, "color": "yellow"},
   {"id": "pc1", "label": "预确认：journal\n共享在建状态", "col": 2, "row": 2, "color": "yellow"}
 ],
 "edges": [
   {"from": "rpc0", "to": "seq0", "label": "转发"},
   {"from": "seq0", "to": "pc0", "label": "回执"},
   {"from": "cand", "to": "seq0", "label": "跟随", "dashed": true},
   {"from": "rpc1", "to": "seq1", "label": "转发"},
   {"from": "seq1", "to": "pc1", "label": "回执"}
 ]}
```

两套预确认的差别（P81–P88）：

| 维度 | op-geth（主网客户端，启用未确认） | reth（Sepolia / 候选，已开启） |
|---|---|---|
| 回执来源 | 影子环境试执行 | 在建区块的同一份状态 |
| 承诺记录 | 只在内存 | journal 文件，flush 不 fsync |
| 单笔上限 / 每块预算 | 没有 | 2M / 6M gas |
| 区块时间 | 写死 2 s | slot 参数，默认 2 s |
| 安全阀 | 同步异常、L1 滞后时拒绝 | 超时与预算闸门 |

图 3 是 reth 版的一次预确认。红色区间是草稿 E1 没有计时的环节（P39）。

```uml q="reth 预确认的一笔请求经过哪些步骤？哪些步骤没有指标？" read="跟随 RPC 把请求转发给 sequencer。红色区间是现有指标没有覆盖的等待与写入。简化图：省略 deposit 与超时分支。" takeaway="E1 要补三段计时：listener 推入、等待构建上下文、journal 追加。"
sequenceDiagram
  autonumber
  participant C as 客户端
  participant F as 跟随 RPC
  participant S as reth sequencer
  participant B as payload builder
  participant J as journal
  C->>F: sendRawTransactionWithPreconf
  F->>S: 转发（forward.duration_ms）
  S->>S: 解码、资格、nonce 与余额（validate）
  rect rgb(251, 234, 234)
    S->>B: listener 推入 FIFO，等待在建 job
  end
  B->>B: 预算闸门，执行（execute.duration_ms）
  B-->>S: 回执
  rect rgb(251, 234, 234)
    S->>J: append：write_all + flush
  end
  S-->>F: 回执
  F-->>C: 回执
```

## K 发现 {depth=2}
```finding F1 high
# 草稿的三条主线成立
claim: 先测出块路径、不套用外部链的结论、把 RPC / DA / 证明滞后一起观察，这三条都被本次核对证实。外部结论确实不能直接用：Reth 2.0 的 root 数字不适用于 Mantle 的封块路径，DA footprint 也不等于真实 blob 用量。
evidence: [inferred] 由草稿 §2.1 与 X43、D27、D70 的核对推出（R1）。[observed] 草稿 E7 / E8 已经把 batcher 积压与证明滞后列为观察项（U2）。
implication: 保留草稿结构。要改的是实验对照、样本和判读。
```

```finding F2 high
# 主网 sequencer 仍是 op-geth，草稿的 reth 路径是目标架构
claim: 2026-10-27 确认的部署画像显示：主网由 op-geth v1.6.3 出块；主网 reth 是跟随它的候选 sequencer；Sepolia 上 reth 才出块。草稿的“主网被动测”与“QA 链实验”因此测的是两套实现。
evidence: [observed] 部署画像 config/repos.json@6be759c（K1–K4）。[observed] 公开 RPC 返回 Geth/v1.17.3（K17）。[inferred] K9、K10。[observed] GPT 没有区分两套实现（G3）。
implication: E0 先记录每个环境的 sequencer 客户端与预确认模式。所有实验结果按客户端分组，不跨组比较。
```

```finding F3 high
# reth 的预确认承诺在断电或主备切换时可能丢失
claim: reth 拿到执行回执后，先尝试把承诺写进 journal，再把回执返回客户端。写入只 flush 不 fsync，写失败只记警告，照样返回回执。journal 只记交易与预测块号，不记执行上下文。代码里没有主备交接。主网客户端 op-geth 的实现更弱：承诺只在内存，回执来自影子环境；主网是否启用它还未确认。
evidence: [observed] journal.rs:234–235、rpc.rs:245–253、JournalEntry 字段（P22–P25）。[observed] op-conductor 只复制已封的块（P41、P42）。[observed] op-geth FIFO 只在内存、回执来自影子环境（P82、P84）；主网是否启用没有记录（K12）。[inferred] P34、P43、P88。[speculative] 切换后配置 conductor 主备时会出现未兑现回执（P44）。
implication: E4 是上线门槛：对两条路径分别做故障矩阵。要对外宣称“一定上链”，先设计耐久写入或复制，并在写失败时拒绝发回执。
```

```finding F4 high
# reth 按默认预算开 --preconf.all 时，每块新进的用户交易最多约 6M gas
claim: reth 的 pool listener 把所有合格交易都推进预确认队列，普通打包路径跳过它们。配置条件是：开启预确认、开 --preconf.all、用默认预算。此时所有交易都走预确认，单笔超过 2M gas 在入池时被拒。新交易超出每块 6M 预算就被逐出交易池，重放的旧承诺不受预算限制。草稿 E3 的“普通交易”对照组不存在。按执行 gas 计，E7 也打不到 15M target。
evidence: [observed] preconf_pool_listener.rs、payload_builder.rs:747、validator.rs、dispatch.rs:268（P14–P18）。[observed] 默认值 config.rs:36、43（P7、P8）；Replay 条目绕过预算闸门（P13）。[inferred] P19–P21。[inferred] GPT 发现了对照污染，但没发现容量上限（G2）。
implication: reth 接任 sequencer 前，必须重设资格规则与预算（R4）。E3 只能在白名单模式下做。
```

```finding F5 medium
# eager build 已部署，收益上限约 50 ms / 块
claim: --sequencer.eager-build 默认开启，随 v1.6.3 部署。它只把下一块的构建提前到上一块成为 canonical 时，封块时间不变。op-node 在 payload 时间前 50 ms 封块，所以它最多消除约 50 ms 的空窗。
evidence: [observed] op-node/flags/flags.go:275–278、sequencer.go:25、476（P45–P47）。[observed] 部署画像 v1.6.3（K1）。[inferred] P48、P49。
implication: E2 按“交易到达在 slot 里的位置”分桶看收益。整体 p99 很可能看不出差别。
```

```finding F6 high
# reth 当 sequencer 时，封块仍在区块末尾同步算 state root
claim: Mantle 的两个 reth builder（开 / 不开预确认）都丢弃 engine 提供的执行缓存和 sparse trie，封块时调用 finish(…, None)。Reth 2.0 的“1–2 ms root”只适用于 engine 的校验路径。只升级依赖不会改变这一点。
evidence: [observed] payload_builder.rs:888–892、1185–1187；op-reth builder.rs:230、473–474（X35–X39）。[observed] v2.2.0 的 share 参数默认关闭（X79、X80）。[observed] Paradigm 的 1–2 ms 指区块末尾剩余的 root（X26）。[inferred] X42–X44、X81。[speculative] 满块下同步 root 可能成为封块瓶颈（X75）。
implication: 新增 E9，在 reth 切换前测封块 root 耗时。如果 root 占封块时间的大头，改造 builder 的收益可能大于 evm2。
```

```finding F7 medium
# 生产 reth 每块持久化，需要单独计时
claim: 生产 reth 节点都设 persistence-threshold=0，每个新块都触发持久化，MDBX 用 Durable 模式。持久化在独立线程运行，和下一块执行并行；只有差距累积到 16 块时，engine 才停顿。持久化写盘可能和执行冷读争用同一块盘，是否发生、影响多大都没有测过。
evidence: [observed] 部署画像（K5、K6）。[observed] reth v2.2.0 config.rs:7、10 与 persistence.rs、tree/mod.rs（K14、X82–X84）。[inferred] K15、X85。[speculative] 磁盘争用影响执行（X86）。[observed] 2026-10-27 核对时发现 3 项配置超出开发者的第一次答复（K8）。
implication: E6–E8 先看 commit_duration 与 backpressure 指标，再决定是否换 NVMe。E0 必须从节点读配置，不靠记忆。
```

```finding F8 high
# 默认并发下，证明要在约 1 小时内证完 1 个 range，否则积压无界增长
claim: Mantle 用 OP Succinct validity 模式，主网每 1800 块（约 1 小时）提交一次。proposer 的并发上限默认是 1，并把 witness 生成、执行和证明合并计数。如果生产沿用默认值，持续负载下单个 range 的总耗时必须短于约 3600 s。内部文档在 QA 环境也写了 gateway 只放 1 个 range、witness 超时 1800 s，但生产取值待核实。
evidence: [observed] fork 只保留 validity 模式（D39）；L1 上最近三次提交各隔 1800 块（D41）；proposer 并发默认值与计数方式（D71）。[observed] QA 环境的证明网络 README：range、并发、超时，并注明以部署配置为准（K19–K23、K43）。[inferred] D70、D72。[speculative] 草稿称瓶颈在 ZK 证明，没有公开结果（U4、D51）。
implication: 新增 E10：先读出生产的并发与超时取值，再用数据库的三段耗时加 L2OO 提交时间，直接检验“瓶颈在证明”。这一项应从中长期提前到短期。
```

图 4 是一个 range 从出块到提交证明的路径。红框是持续性门槛：默认并发下同一时间只证 1 个 range。

```excalidraw q="一个证明 range 要经过哪些步骤？哪一步决定能否持续跟上？" read="上一行是数据发布与最终确认，下一行是证明流水线。红框是默认并发下同一时间只放 1 个 range 的步骤。并发上限是代码默认值，生产待核实。简化图。" takeaway="默认并发下，单个 range 的总耗时超过约 3600 s 时，积压会一直增长。" name=proof-range kind=证明流水线
{"grid": {"w": 290, "h": 130}, "defaults": {"w": 200, "h": 66, "fontSize": 16},
 "nodes": [
   {"id": "seq", "label": "sequencer\n2 s 一块", "col": 0, "row": 0, "color": "blue"},
   {"id": "bat", "label": "batcher\n约 7.5 分钟 1 blob", "col": 1, "row": 0, "color": "violet"},
   {"id": "fin", "label": "L1 finalized", "col": 2, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "wit", "label": "proposer 选 range\n1800 块", "col": 2, "row": 1, "color": "violet"},
   {"id": "prv", "label": "witness + 证明\n默认 1 个 range", "col": 1, "row": 1, "color": "red", "strokeWidth": 3},
   {"id": "l2oo", "label": "Plonk 聚合\n提交 L2OO", "col": 0, "row": 1, "color": "green"}
 ],
 "edges": [
   {"from": "seq", "to": "bat", "label": "批次"}, {"from": "bat", "to": "fin", "label": "blob"},
   {"from": "fin", "to": "wit"}, {"from": "wit", "to": "prv", "label": "输入"},
   {"from": "prv", "to": "l2oo", "label": "证明"}
 ]}
```

```finding F9 medium
# 生产证明流水线不记录 cycle，瓶颈拆解要单独跑
claim: network 模式下 proposer 库的 cycle 与 prover gas 字段都是 0，自建集群的对应字段为空。guest 只标了“派生”和“执行”两段，MPT 和 state root 算在执行里。keccak 已走 SP1 precompile。
evidence: [observed] collect/README.md（K24）。[inferred] client.rs 的 cycle span（D46）。[observed] op-succinct Cargo.toml 与 Cargo.lock 的 keccak 补丁（X63、X64）。[inferred] K25、X68。
implication: E10 要在本地对同样的 range 跑 execute，并给 MPT 加 span。没有这组数据，不要立项换 commitment。
```

```finding F10 medium
# DA footprint 先到上限，不说明 L1 带宽不够
claim: Mantle 的 scalar 是 400，每笔交易 footprint 至少 40,000，比一笔转账的 21,000 gas 还多。按 15M target，每块只能计 37,500 估计字节。而真实 blob 只装了约 5%。所以 footprint 先到上限，说明的是计量约束，不是 blob 带宽。
evidence: [observed] scalar 0x190 与回执（D23、D24、K41）。[observed] blob 装载 6,836 字节（D13）。[observed] Jovian 规则（D19、D20）。[inferred] D25–D27。[inferred] 草稿的 152 / 228 KB/s 算术正确（D9）。[observed] 但“每笔 100 字节”是费用估算的下限，不是实测均值（D11）。
implication: 新增 E11：先对比 footprint 与 batcher 实际压缩字节。E7 的负载按 max(gas, footprint) 计。
```

```finding F11 medium
# 草稿 E8 的费用参数方向写反了
claim: base fee 变化量与 1/denominator 成正比，所以要更快反应应降低 denominator。降低 elasticity 会降低单块最大涨幅。两者都不能让积压更快清零。按当前参数，40 个满块后 base fee 约为 10.3 倍，回到下限约需 3.8 分钟。
evidence: [observed] EIP-1559 公式（D30）。[observed] 主网 D=50、E=4（K16）。[inferred] D31–D35、K37、K38。[inferred] GPT 的修正属实（G6）。
implication: E8 分开记录“价格恢复”和“队列清空”。费用参数只作辅助手段。
```

```finding F12 medium
# 40 个满块不能估计 p99；草稿的阈值多数没有出处
claim: 40 个样本里，超过真实 p99 的期望只有 0.4 个。200 ms 封块阈值也没有依据：op-node 只给封块留 50 ms。
evidence: [inferred] K35、K36。[observed] sealingDuration = 50 ms（P47）。[inferred] P78、R16。
implication: 区块级 p99 至少用 900 块并重复多轮。草稿的数字先当候选阈值，并写明测量端点、负载与承诺级别。
```

```finding F13 medium
# evm2 不是“随上游升级”就能拿到
claim: Reth v2.9.0（10-29）已换 evm2，官方测得执行快约 10%。Mantle 停在 v2.2.0，OP 上游最新 op-reth v2.8.0 仍在 revm 上。Mantle 现在迁移，要自己移植至少 7 处定制，包括证明路径。
evidence: [observed] v2.9.0 发布说明（X14–X18）。[observed] op-reth v2.8.0 基于 reth v2.6.0（X21）。[inferred] X13、X22、X24。[inferred] 姊妹报告 revm-vs-evm2 的“未发布”已过时（X23）。
implication: 先追平仍用 revm 的上游版本，evm2 作为 E12 的对照组。等 OP 上游迁移后再定。
```

```finding F14 medium
# 短区块是协议级改造，不是参数
claim: op-node 按整秒排程；op-geth 预确认写死 2 s；按每秒 gas 不变换算到 200 ms，reth 预算 0.6M 小于单笔上限 2M，现有校验会拒绝。Base 的 Denim 还要改时间戳与 RPC 语义，主网 11 月才计划激活。
evidence: [observed] sequencer.go:473–474、preconf_checker.go（P53、P87）。[observed] Base Denim 文档（P59–P63）。[inferred] P54、P57、P58、P64。[speculative] 作者称旧版本短区块测试出块不稳定（P80）。
implication: 放到中期。先做 E14 可行性清单，并用“每秒工作量相同”做对照。
```

```finding F15 low
# 其余长期项：维持优先级，改写理由
claim: pEVM 仍缺 Mantle 的 slot 级依赖数据。commitment 候选分三类，只有“保持 MPT 的存储优化”不需要协议升级。state expiry 的“全内存”动机在 MegaETH 一手材料里找不到。多证明的动机是结算与安全，不是证明速度。LFM 在利用率约 0.3% 时没有拥堵可治。
evidence: [observed] pevm 仍是 WIP（X46）；2025 年依赖率是启发式口径（X49）。[inferred] X60、X61、X72、X74。[observed] Base Azul 的动机（D52、D53）。[inferred] D54、R17。
implication: 这些项各写进入条件（见路线），满足条件再立项。
```

## L 实验方案：E0–E8 改写 {depth=2}
每个实验都按同一格式写：假设、对照、指标、判读。下面的阈值都是候选值，不是已验证的 SLO（R16）。

**E0 配置清单（P0）**。从节点读出，不靠记忆（K8）。

| 类别 | 必须记录 |
|---|---|
| sequencer | 客户端（op-geth / reth）、版本、预确认资格（白名单 / all）、预算、超时 |
| 存储 | `op-reth db settings get`（Storage v1 / v2）、persistence 与 backpressure 参数 |
| 下游 | batcher 压缩、channel 参数；proposer range、并发、超时 |
| 负载 | 交易构成、账户与 nonce 分布、到达速率、随机种子 |

**E1 预确认分段计时（P1）**。在两种客户端上各做一版（P39）。

| 观察 | 结论 | 措施 |
|---|---|---|
| 尾部集中在 slot 末段 | 等待构建上下文 | 看 E2 |
| 尾部与 journal 轮转时刻重合 | 轮转持锁 | 缩短轮转或拆锁（推测，P79） |
| 尾部在预算闸门前 | 排队或预算不足 | 看 E3 |
| 各段都不突出但总体慢 | 还不能定位 | 对最慢请求做关联追踪 |

补三项指标：listener 推入、等待构建、journal 追加；直方图改为小数毫秒（P38）。

**E2 eager build（P1）**。开 / 关各跑一次，按到达相位分桶。末段桶改善不超过 50 ms 属于预期（P48）。

**E3 预确认预算（P1，只在 reth 白名单模式做）**。扫描预确认占比、预算与 gasLimit / gasUsed 比值。被拒集中在 gasLimit 远大于 gasUsed 的交易 → 修 gas 估算，不提预算（P12）。

**E4 承诺兑现审计（P0，上线门槛）**。

| 故障 | reth 核验 | op-geth 核验 |
|---|---|---|
| kill -9 | journal 重放 | 内存 FIFO 丢失 |
| 断电 | 未 fsync 的承诺 | 同上 |
| journal 写失败 | 是否仍发回执 | 不适用 |
| 主备切换 | 在建块承诺 | 在建块承诺 |
| 重组 / L1 origin 变化 | 回执与最终块对账 | 影子环境预测失败率 |

任何“回执已发但未上链”或“结果与回执不同”都阻断上线（U2、P34）。

**E5 读可见性（P1）**。测 δ = 客户端拿到回执 → 跟随 RPC 读到新状态。两套实现都没有对外的预确认状态（P35），δ 约等于一个出块间隔加传播与导入。要缩短，需要设计状态流：序号、父块哈希、缺口检测、撤销事件、canonical 对账（P67、P71）。

**E6 RPC 导入（P1）**。拆成封块 → gossip → 收到 → 执行 → 持久化 → 可查询。先看 commit_duration 与 backpressure，再决定是否换盘（X88）。

**E7 持续负载（P1）**。改三处：
- 负载用主网构成（DEX 29%、转账 29%、预言机 24%…）加产品负载，不只用 mStocks（K26、K30）。
- 利用率按 max(gasUsed, footprint) 计（D20）。
- 记录：range 总耗时对比 3600 s（按生产并发换算）、canonical − persisted 差距、L2OO 提交间隔（D72、K15）。

**E8 突发与恢复（P1）**。保留 40 个满块做冲击测试，但不报 p99。恢复阶段回到正常流量，而不是停流。分开记录 base fee 回落（约 3.8 分钟，K38）与队列清空。

## M 新增实验：E9–E14 {depth=2}
| 编号 | 假设 | 做法 | 继续 / 停止 |
|---|---|---|---|
| E9 封块计时 | reth 当 sequencer 时，同步 root 与持久化拉长封块 | QA 链：预确认开 / 关 × suppress-persistence 开 / 关 × 阈值 0 / 2 | root 占大头 → 改 builder 接 sparse trie；都不大 → 转向执行与 IO |
| E10 证明拆段 | 证明滞后由某一段主导 | 读生产并发与超时；库里的三段耗时 + L2OO 时间；本地 execute 补 cycle；给 MPT 加 span | 并发为 1 且 range > 3600 s，或积压持续增长 → 扩并发或缩 range；MPT 占大头 → 才研究 commitment |
| E11 DA 计量 | footprint 高估真实字节 | 算比值 = 估计字节（Σ footprint / 400）÷ channel 实际字节 | 比值明显大于 1 → 评估下调 scalar；否则维持 |
| E12 evm2 | evm2 对 Mantle 全链路有收益 | 三组：现版本 / 追平 op-reth v2.8.0 / reth 2.9 + evm2；逐块对账 | 追平已拿到主要收益 → 先追平；任何语义差异 → 阻断 |
| E13 pEVM | Mantle 有可并行空间 | slot 级读写集，gas 加权关键路径 | 关键路径占比 ≥ 50% → 停止通用 pEVM |
| E14 短区块 | 200 ms 可行且有收益 | 清单：op-node 整秒、op-geth 写死 2 s、预算校验、denominator、block.number 合约、kona / SP1 | 预确认已满足交互目标 → 不做协议级短区块 |

依据：E9 见 X42、X87；E10 见 D45、D46、D71、K24；E11 见 D25–D27；E12 见 X13、X24；E13 见 X50；E14 见 P53–P58、P87。

## N 路线：短 / 中 / 长期 {depth=2}
以 2026-11-02 为起点。时间窗口是规划建议，不是完成承诺（R3–R15）。

**短期 0–6 周：看清配置，修正确认语义，诊断证明**

| 周 | 工作 | 交付 |
|---|---|---|
| 0–2 | E0 清单；Storage 模式盘点 | 可复现的基线；v1 节点的迁移计划（2027-01 前） |
| 0–2 | E4 承诺审计（两条路径） | 是否存在上线阻断项 |
| 0–3 | E10 证明拆段；E11 footprint 普查 | 证明是否跟得上；E7 的判读口径 |
| 2–6 | 改写后的 E1–E8；E9 | 预确认指标补齐；reth 切换的前置结论 |
| 2–6 | 追平 OP 上游 op-reth v2.8.0（基于 reth v2.6.0，仍用 revm） | E12 的对照组 |

```callout warn CAUTION
reth 接任主网 sequencer 之前，先完成三件事：重设预确认资格与预算（F4）、通过 E4（F3）、测清封块 root 与持久化（F6、F7）。否则切换会同时改变容量上限与承诺语义。
```

**中期 6–16 周（约 2026-12 中至 2027-02 底）**

| 工作 | 进入条件 |
|---|---|
| 证明扩并发或缩小 range | E10 显示：并发为 1 时 range 接近 3600 s，或已证明高度越落越远 |
| 预确认状态流 | E5 显示读延迟影响产品 |
| builder 接入 sparse trie | E9 显示 root 占封块大头 |
| 短区块原型 | E14 清单可行，且预确认不够用 |
| pEVM 原型 | E13 显示关键路径占比低 |
| L2 数据分发（relay、备机、订阅） | E6 显示传播或导入是瓶颈 |

**长期 4–9 个月**

| 方向 | 进入条件 |
|---|---|
| commitment 替换 | E10 显示 MPT 占证明成本大头，且实现层优化不够 |
| state expiry | 活跃状态（不是历史）成为约束 |
| LFM / lanes / ASS | 有明确的产品 SLA 需求 |
| 多证明 / 换 zkVM | 有结算或安全目标，不以性能为理由 |

## O 对草稿与 GPT 的修正对照 {depth=3}
**草稿**

| 草稿原文 | 修正 | 台账 |
|---|---|---|
| E1：降低单笔 gas 上限到 2M | reth 默认已是 2M；op-geth 没有单笔上限 | P7、P81 |
| E2：确认主网 op-node ≥ v1.6.3 | 已部署；参数是 `--sequencer.eager-build`，默认开 | K1、P45 |
| E3：preconf 与普通交易对照 | `--preconf.all` 下没有普通路径 | P19、P21 |
| “当前 6M 预算” | 是 reth 代码默认值；主网 op-geth 没有预算 | P8、P81 |
| E7：footprint 先到 → 瓶颈在 DA | 只说明计量约束；blob 只装 5% | D27 |
| E8：提高 denominator 的反应速度 | 应降低 denominator | D35 |
| E8：封块 p99 > 200 ms 就追平上游 | 追平不够，还要改 builder | X44 |
| Reth 2.0 root 1–2 ms（出块背景） | 只适用于 engine 校验路径 | X43 |
| 随上游 reth 引入 evm2 | OP 上游未迁移，要自己移植 7 处 | X24 |
| MegaETH 全内存 → 需要 state expiry | 一手材料里找不到这层因果 | X72 |
| 考虑压缩效率、批次大小 | 已用 Brotli；问题是 blob 只装 5% | D13、D14 |
| Binance New L1 | 指 BNB New L1 的 Multi-Lane，与 BSC Payment Lane 不同 | D62 |

**GPT 评审**

| 结论 | 状态 | 台账 |
|---|---|---|
| journal flush 不 fsync，写失败仍返回 | ok 属实 | G1 |
| `--preconf.all` 污染 E3 | ok 属实，但低估了影响 | G2 |
| Reth v2.9.0 换 evm2 | ok 属实 | G4 |
| 152 / 228 KB/s、scalar 语义、1559 方向 | ok 属实 | G6 |
| 主网 sequencer 与两套预确认 | no 漏掉 | G3 |
| builder 不接 sparse trie、每块持久化 | no 漏掉 | G9 |
| Base pending-state 作为 E5 参考 | no 已过时 | G5 |
| BSC Payment Lane 于 9 月公布 | warn 一手来源是 10 月 | G7 |
| “不宜写 MDBX v1 还是 v2” | warn 说过头 | G8 |

## P 局限与开放问题 {depth=2}
**局限**
- 本文没有在 QA 链上运行任何实验。所有“观察 → 措施”都是判读规则，不是测得的 Mantle 结果。
- 部署画像来自作者维护的配置记录（2026-10-27 确认），只覆盖 reth 节点。op-geth sequencer 的预确认参数未知（K12）。
- 证明网络长稳的结果没有提交到仓库，没有 range 证明时长的数据（K40）。最近三次提交只是 3 个样本（D42）。
- 部分 reth 源码结论只读到符号级，没有逐行跑通；“kill -9 能恢复、断电不能”是推断（P 分册的不确定之处）。
- speculative 的论断：P44、P79、P80、X33、X45、X75、X86、D16、D51、D68、U3、U4。页面上已在出现处标明推测。

**开放问题**
1. 主网 op-geth sequencer 是否开启预确认？对外宣称的承诺等级是什么？
2. 候选 reth 与 Sepolia reth 用白名单还是 all？预算多少？
3. 各生产节点是 Storage v1 还是 v2？backpressure 与 share / suppress 参数取值？
4. 生产 proposer 的并发与超时取值？单个 range 在 8×GPU 上的墙钟时间与证明滞后分布？
5. 路线图里“分布式 GPU 证明网络等待主网”与生产自建集群是什么关系（D43）？
6. reth 当 sequencer 时，engine 是否复用自建块的执行结果（X45）？

## Q 方法与证据 {depth=3}
- **路径**：资料驱动 + 外部调研（路径 B + C）。主要依据是作者草稿与 GPT 评审；GPT 的论断都追到一手来源再用。
- **分工**：三路并行调研（预确认与出块、执行与状态、DA 与证明）加主会话核对，台账 322 行，按前缀分册。
- **源码**：mantle reth @574e7f3（生产 mantle-v1.6.2）、op-geth @e33cd26（生产 v1.6.3）、mantle-v2 @1780605、op-succinct @6b1cb57、上游 reth v2.2.0 @88505c7 与 main @84caec5。
- **链上**：Mantle 公开 RPC（区块、eth_feeHistory、回执），L1 batcher 与 L2OutputOracle（Blockscout、Routescan），2026-10-31。
- **内部资料**：部署画像（upstream-codebase-fix-alert）、证明网络与压测工具文档（mantle-performance-test），均为私有仓库。
- **抽查**：主会话复核了 eager build 默认值、builder 的 `finish(…, None)`、journal 写失败分支、v2.9.0 发布说明、DA scalar（notes.md）。

## R 复现 {depth=3}
主网参数与利用率（需要 Foundry 的 `cast`）：

```bash title="主网参数与 24 小时利用率"
R=https://rpc.mantle.xyz
cast block latest -r $R --json | jq '{gasLimit,extraData,baseFeePerGas}'
head=$(cast bn -r $R)
for i in $(seq 0 23); do
  cast rpc eth_feeHistory 1024 $(printf '0x%x' $((head - i*1800))) '[]' -r $R \
    | jq -c '[.gasUsedRatio[]]'
done | jq -s 'add | {n:length, mean:(add/length), max:max}'
```

预期：extraData 解出 denominator 50、elasticity 4、min base fee 50 gwei；mean 约 0.003，max 小于 0.25。

源码核对：

```bash title="预确认与 builder 的关键行"
git clone --depth 1 https://github.com/mantle-xyz/reth && cd reth
sed -n 230,236p mantle-reth/crates/preconf/src/journal.rs   # write_all + flush
sed -n 243,254p mantle-reth/crates/preconf/src/rpc.rs       # 写失败仍 Ok(event)
sed -n 470,475p op-reth/crates/payload/src/builder.rs       # finish(state_provider, None)
```

## S 术语表 {depth=2}
```glossary
sequencer | 排序器 | L2 上排序交易并出块的节点。 | 不是 batcher
EL | 执行客户端 | 执行交易、维护状态的客户端，Mantle 有 op-geth 与 reth 两种。 | 不是 op-node
预确认 | preconf | sequencer 在封块前返回的执行回执。 | 不是最终性
journal | 承诺日志 | reth 预确认把已返回的承诺写进的本地文件。 | 不是交易池的 journal
fsync | sync_all | 把文件内容强制写到磁盘，断电后仍在。 | flush 只清用户态缓冲
eager build | 提前构建 | 上一块成为 canonical 后立即开始构建下一块。 | 不改变封块时间
sparse trie | 稀疏 trie | reth 跨块保留在内存的部分 trie，用来并行算 root。 | 不是完整状态
持久化 | persistence | 把已封的块写进磁盘数据库。 | 不是封块
backpressure | 反压 | 持久化落后 16 块时，reth 暂停处理 engine 请求。 | 不是 RPC 限流
range | 证明区间 | proposer 一次证明的连续区块，Mantle 为 1800 块。 | 不是 batch
DA footprint | DA 计量 | 估计压缩字节乘以 scalar，与 gas 一起约束区块。 | 不是 blob 实际字节
Storage v2 | 存储 v2 | reth 的分层存储格式，v1 在 2027-01 停止支持。 | 不是 MDBX 版本
关键路径 | critical path | 必须依次执行的最长依赖链，决定并行加速上限。 | 不是冲突比例
```

## T 参考资料 {depth=2}
1. **PRIMARY** mantle-xyz/reth @574e7f3：`mantle-reth/crates/preconf/`（config、rpc、journal、dispatch、payload_builder、pool listener、canon_handler）与 `rpc-ext`。预确认实现。
2. **PRIMARY** mantle-xyz/op-geth v1.6.3 @e33cd26：`preconf/`、`miner/preconf_checker.go`、`cmd/utils/flags.go`。主网客户端里的预确认实现。
3. **PRIMARY** mantlenetworkio/mantle-v2 @1780605：op-node sequencer 与 flags、op-batcher flags、`l1_block_info.go`；PR #370 与 releases。eager build 与 DA 参数。
4. **PRIMARY** paradigmxyz/reth v2.2.0 @88505c7（engine 配置、tree、persistence）、v2.9.0 release、main 的 Ethereum payload builder。持久化与 evm2。
5. **PRIMARY** mantle-xyz/op-succinct @6b1cb57：Cargo.toml、MANTLE_CHANGES.md、validity 状态机与 proposer 并发、guest cycle span。证明路径。
6. **PRIMARY** Mantle 生产部署画像：upstream-codebase-fix-alert `config/repos.json`、`docs/DESIGN.md` @6be759c（私有）。谁在出块、生产参数。
7. **PRIMARY** Mantle 主网 RPC 与 L1 读数（2026-10-31）：区块、eth_feeHistory、回执、batcher blob、L2OutputOracle。
8. **PRIMARY** mantle-performance-test：`prover-network/`（@eaf4c5c）与 Q10 / Q11 测试说明（私有）。证明流水线与主网负载构成。
9. **PRIMARY** OP Spec：Ecotone derivation、Fjord、Granite、Jovian（exec-engine、l1-attributes、system-config）、Subblocks。
10. **PRIMARY** EIP-1559、7892、8135、8138、2930、7864；EF 博客（Fusaka、Glamsterdam）。
11. **PRIMARY** Base Docs：Denim（overview、200ms-blocks、migrate-from-flashblocks）、Azul proofs。
12. **PRIMARY** Paradigm《Releasing Reth 2.0》；reth.rs storage 文档；op-reth v2.8.0 release。
13. **PRIMARY** Succinct Docs（cycle tracking、prover gas、precompiles）；SP1 Hypercube 博客；ZKsync Airbender Prime。
14. **PRIMARY** Arbitrum feed relay 文档；MegaETH Docs 与 Research；op-conductor README。
15. **PRIMARY** QMDB（arXiv 2501.05262）、NOMT、base/triedb、megaeth-labs/salt、Monad MIP-8、Sei Giga 文档、risechain/pevm。
16. **PRIMARY** Tempo payment lane 规范；BNB Chain Payment Lane 博客与 Jenner 公告。
17. 作者草稿（Notion drafts）与 GPT Deep Research 评审（Notion references）。被评审对象与线索。
18. research-hub 报告：high-performance-chain-roadmap、revm-vs-evm2。背景与 2026-10 基线。

# B 路调研笔记：L2 区块构建与预确认、DA、证明与结算、费用与资源计量

调研日期：2026-10-27。前缀 `B`。所有网页访问日期均为 2026-10-27，除非另注。
说明：本路只描述各项目做法，不给 Mantle 建议（Mantle 建议归 M 路）。台账见文末。

---

## B-Q1 L2 区块构建流水线：哪些阶段在关键路径上

**答案。** OP Stack sequencer 出块是一条“op-node 准备输入 → EL 执行 → 封块（算 state root）→ 广播”的串行环：op-node 先根据 L1 origin 生成 payload attributes（deposit 和 L1 属性交易必须排在最前面），再用 `engine_forkchoiceUpdated` 让执行层开始从 txpool 取交易，最后用 `engine_getPayload` 封块。封块要算 state root，这一步的耗时在高负载时已经大到会挤占出块周期：Base 主网上一次 state root 平均约 130ms（B3）。公开数据显示尾延迟主要在存储 IO 和 state root：Base 测得 Geth 构建区块 p99 为 2319ms，Reth 为 698ms（B2）；OP 换成 NVMe 前，区块时间会退化到 2.5–3s（B5）。“连续构建 / eager next-block construction”指让下一块的执行不再等上一块封块与 L1 输入准备：Mantle 发布记录对它的定义是缩短“封上一块到开始接收下一块交易”之间的空窗（B6）；RISE 的做法是推迟 merkleization，等完整区块结束后再批量做（B7）。

**依据。** B1（Engine API 调用顺序与 deposit 前置）、B2（Base Geth/Reth 构建延迟分布）、B3、B4（Flashblocks state root 成本及其移出关键路径）、B5（OP 的 IO 瓶颈）、B6（Mantle eager next-block）、B7（RISE 延迟 merkleization）、B8（推断：关键路径的构成）。

**不确定之处。**
- 公开的分阶段 profile 很少：没有找到 op-geth / op-reth 按“取 L1 输入 / 选交易 / 执行 / merkleize / 封块 / gossip”拆分的官方耗时表。Base 的数字是整块构建延迟，而且是它自己的 benchmark（2024-12，归档节点，见 B2）。
- 2025 年内部研究引用 RISE 的说法“共识阶段占 40%–80%，执行最坏只占 8%”。我在 RISE 博客里没有找到这组数字，只找到“Ethereum 中 merkleization 最多占 E2E 封块时间 75%，缩短区块时间后可超过 90%–95%”（B7 附注），所以那组数字标为 speculative（B9）。
- 内部研究里的“C 阶段”（取 L1 输入、准备派生）和 L1 的共识投票不是一回事，GPT 调研已经指出过这一点。

## B-Q2 预确认与增量区块

**答案（截至 2026-10-27）。** 在 OP Stack 一系里，“增量预确认”这层正在被收回到协议内部或厂商自研栈里，第三方 sidecar 不再是主线：
- **Base**：2025-07 起，主网 2s 区块内每 200ms 流出一个 Flashblock（B10、B11）。Azul（2026-05-28）之后，执行和共识客户端换成自研的 base-reth-node / base-consensus，builder 换成 base-builder，rollup-boost 仍在用（B12）。Base 已宣布在 Denim 升级里**废弃 Flashblocks**，改成每 200ms 一个完整的 canonical 区块。Denim 已于 2026-10-21 在 Sepolia 激活，主网目标是 2026-11（B13、B14）。
- **OP Labs**：用自研的 Subblocks 替换 Flashblocks，2026-08-31 起在 OP Mainnet 运行，间隔从 250ms 降到 200ms，stream 里的 state_root / block_hash 置零。OP Labs 不再支持 rollup-boost + op-rbuilder 组合，Subblocks 只向 OP Enterprise 客户提供（B15–B17）。
- **Unichain**：2025-08 起 200ms Flashblocks、1s 区块，builder 运行在 TEE 里，执行 priority ordering（B18、B19）。
- **MegaETH**：2026-02-09 公开主网。约 10ms 一个 mini-block，约 1s 一个 EVM block。Rex5 起 sequencer 对每个 mini-block 头签名（B20–B22）。
- **RISE**：2026-05-01 博文称主网和 RISEx 已经上线数周，但只对受邀用户开放。shreds 推迟 merkleization（B23、B7）。
- **Arbitrum**：Timeboost 于 2025-04-17 上线（60s express lane，二价拍卖，非 express 交易延迟 200ms），2026-09-24 被 PGA 取代：250ms 区块，每块 2 个 125ms 的按优先费排序轮次，最多每秒 8 块（B24–B26）。

| 方案 | 反馈延迟 | 完整区块周期 | 预确认的信任假设 | 失效 / 回滚语义 |
|---|---|---|---|---|
| Base Flashblocks（Denim 前） | ~200ms（P50 构建约 10ms） | 2s | 相信 sequencer/builder，无签名承诺 | 目标 reorg 率 < 0.1%；极端情况下全网关闭预确认，退回 2s 区块 |
| Base Denim | 200ms 就是 canonical 区块 | 200ms | 与 unsafe 区块相同 | 走 unsafe → safe → finalized 生命周期；不再有 pending 状态 |
| OP Subblocks | ~200ms | 2s | 相信 sequencer（文档原话） | 和 unsafe 区块 reorg 的条件相同；序列只追加，不重排 |
| Unichain | ~200ms | 1s | TEE 内 builder 执行公开的排序规则 | 未找到官方回滚统计 |
| MegaETH | ~10ms | ~1s | sequencer 签名的 mini-block 头，可以证明 sequencer 作恶（equivocation） | 签名不等于最终性，最终性仍取决于 L1 |
| RISE shreds | 官方称 3ms（另有 1ms / 5ms 的说法） | 未核实 | 带签名的 shred | 未找到公开语义 |
| Arbitrum PGA | 125ms 轮次；满块提前出块 | 250ms（满载时最多 8 块/s） | sequencer feed（受信任） | Timeboost 已下线 |

**依据。** B10–B26、B27（推断：趋势判断）。
**不确定之处。** MegaETH 主网上线后的真实 TPS 和 gas 指标我没有拿到一手数据（官方网络参数页是模板变量，媒体数字口径不一）。RISE 的区块时间和吞吐只有它自己的宣传数字。Unichain 在 OP Labs 停止支持 op-rbuilder 之后用哪套栈，没有查到。

## B-Q3 DA 与持续吞吐上限

**答案。** OP Stack batcher 的流程是：把 L2 区块编码成 batch（Delta 起支持 span batch），放进 channel 用 Brotli 压缩（Fjord 起），再切成 frame 装进 blob（B28、B29）。按 OP 的 blob 编码，一个 blob 能装 130,044 字节（B30）。Ethereum 在 Fusaka（2025-12-03）启用 PeerDAS；BPO1（2025-12-09）把每块 blob 的 target/max 提到 10/15，BPO2（2026-01-07）提到 14/21（B31）。截至 2026-10，BPO3 仍是参数为空的草案（B32）。

可复算的估算：
- 14 个 blob × 130,044 B ÷ 12s ≈ **152 KB/s**（target），21 个 blob 对应 ≈ **228 KB/s**（max）（B33）。
- 按 Fjord 费用模型的单笔最小估计 100 字节算，这些带宽在**所有 blob 用户之间共享**，大约能支撑 ~1,500 TPS（target）或 ~2,300 TPS（max）。按 200 字节/笔算，减半（B34）。
- 对比：Base 的单块预算约 400M gas / 2s，全是 21k gas 的转账时约 9,500 TPS，但这些交易需要约 950 KB/s 的 DA。所以对小额交易来说，blob 带宽先于 gas 成为约束（B35）。Base 文档也写明，DA 吃紧时 sequencer 会限流，高优先费的交易也会被延迟（B36）。Jovian 把这件事写进了协议（见 B-Q5）。
- 外部 DA 的容量高 1–2 个数量级：EigenDA V2 自称主网 100 MB/s，平均延迟 5s，p99 10s（B37）；Celestia 主网目前每块最多 32 MiB、出块约 3s，约 11 MB/s（B38）。代价是安全假设换成 restaked ETH + EIGEN 的法定人数，而不是 Ethereum 本身（B39）。
- 2026 年初实测 blob 并没有用满：MigaLabs 发现 BPO1 之后中位数从 6 降到 4，16 个以上 blob 的区块漏块率偏高（B40）。

**依据。** B28–B40。
**不确定之处。** 没有找到按链公开的“每笔交易平均压缩后字节数”实测值，100 和 200 字节都是假设，真实的 swap 或预言机交易更大。EigenDA 官方文档页抓取时返回 403，安全阈值来自搜索摘要（B39 标为 inferred）。

## B-Q4 验证与结算：证明吞吐如何约束持续能力

**答案。**
- **OP Stack 故障证明**：当前生效的游戏类型是 `CANNON_KONA`（kona-client 跑在 64 位多线程 Cannon 上，Upgrade 19 起）（B41）。
- **Base**：2025-10 时 Base 写道，optimistic 证明系统下“不能产生比证明系统能正确证明的更多数据”，MT+64 Cannon 上线后故障证明不再是瓶颈（B42）。Azul（2026-05-28）把 Base 换成 TEE + ZK 多证明：两种证明都有时 1 天结算，只有一种时 7 天；ZK 路径无需许可，可以推翻 TEE（B43）。Beryl 把单证明窗口降到 5 天（B44）。
- **OP Succinct**：用 range proof 证明一段区块，再用 aggregation proof 合并，链上只验证聚合证明（B45）。它公开的成本数据还停在 2024 年：每笔 0.5–1 美分，Base 样本 0.61 美分/笔（B46，已过时）。
- **Kailua（BOB）**：平时走 optimistic；有争议时只证明一个 mini proposal（6 个区块）；可以随提案附上有效性证明，从而立即最终确定。约 3 美元一次证明，链上验证约 25 万 gas，默认 4 天窗口（B47）。MegaETH 也用 Kailua（B20）。
- **L1 实时证明**：OpenVM 2.1 Preview 用 4 张 5090 证明 L1 区块，p99 为 9.7s（Axiom 自测，7,200 个主网区块）（B48）。Ethproofs 上全部受评 prover 的 sub-10s 比例是 69.5%（目标 ≥70%），项目处在“security sprint”阶段（B49）。

推断：L1 现在的 gas 速率约 5 Mgas/s，Base 的预算约 200 Mgas/s。按线性外推，L2 想做实时 ZK 证明，需要大约 40 倍于 L1 实时证明的 GPU 资源，所以 L2 目前普遍选 TEE / optimistic + 按需 ZK 的混合方案（B50，speculative）。

**依据。** B41–B50。
**不确定之处。** 没有拿到 OP Succinct 2026 年的成本和时延数据；Base ZK prover 的吞吐和成本没有公开。

## B-Q5 费用与资源计量

**答案。**
- **OP Stack（Jovian）**：Base 于 2025-12-02 激活（B51）。Jovian 引入三项：(1) 可配置的最低 base fee，写在区块头 extraData 里；(2) **DA footprint block limit**：用 FastLZ 估算每笔交易的 DA 字节数，乘以 scalar 计入 `blobGasUsed`，要求区块总量不超过 gasLimit，base fee 的更新改用 `max(gasUsed, blobGasUsed)`；(3) operator fee 公式乘 100（B52）。Jovian 规范给出的理由是：此前只能靠 batcher-sequencer 限流这种策略手段，会压低 base fee，还会引发优先费拍卖（B53）。
- **Base 的参数调整**：最低 base fee 从 2025-12 的 0.0002 gwei 逐步提到 2026-02-19 的 0.005 gwei，EIP-1559 denominator 提到 125，elasticity 为 6（B54、B55）。Base 的扩容策略改为“提 gas limit、不提 gas target，target 只在费用高企时才提高”（B56）。
- **Arbitrum**：ArbOS 61（2026-08-20 上线 One/Nova）把多维定价（Dynamic Pricing）写进了节点软件，但官方明确要求**不要启用**，并说未来版本会移除；目前只能用单维的 multi-constraint pricing（B57）。
- **ZKsync OS**：同时计两种资源。一是 EVM gas（换算成 ergs，1 gas = 256 ergs）；二是 native resource，用来近似证明和发布数据的成本（“证明所需的 RISC-V 周期数”）。native 不够时会补收 gas（B58）。
- **MegaETH**：双 gas 模型，即 compute gas 加 storage gas。原因是它的 base fee 只有 0.001 gwei、单块最多 100 亿 gas，必须单独给状态增长定价（B59）。
- **Ethereum EIP-7999**（统一多维费用市场，单个 max_fee）：仍是 Draft，2026-08/09 还在 ethresear.ch 上讨论 gas 记账设计（B60）。

**依据。** B51–B60。
**不确定之处。** 用户点名的 Base“资源定价”文章，我在 Base 博客索引里没有找到对应标题。能找到的是 2025-10 那篇提到的 resource metering 和 mempool 重构（B56），2026 年这项工作进展到哪一步没有找到。Base 现在的 gas target 没有直接写明，按 400M 预算 ÷ elasticity 6 推算约 33 Mgas/s（B61，inferred）。

## B-Q6 L2 节点角色与读路径

**答案。**
- **MegaETH** 把节点分成几类：sequencer；replica 节点（直接应用 sequencer 下发的状态更新，不重新执行）；full 节点（本地重新执行验证）；prover；以及能在笔记本级硬件上实时验证主网的 stateless validator（用 SALT witness）（B20、B62、B63）。
- **Base Flashblocks-aware RPC**：用 `pending` 标签读取预确认状态。为避免竞态，节点会缓存最多 5 个区块的 Flashblocks 状态，所以 `eth_call pending` 返回的 `block.number` / `timestamp` 可能落后约 5 块，但状态结果是对的（B64）。
- **OP Subblocks**：RPC 节点拿到 stream 后自己执行交易得出状态，不信任 stream 里的 root（B15）。
- **Base Denim**：取消 pending 状态，应用改读每 200ms 一个的 canonical 区块（B14）。

推断：“响应快”和“状态新鲜”在这些设计里是两个独立的指标。预确认 RPC 提供的是更新鲜的状态，但区块上下文可能更旧；replica 读得快，但信任 sequencer 的执行结果（B65，inferred）。

**依据。** B14、B15、B20、B62–B65。
**不确定之处。** 没有找到任何项目公开的“RPC 状态新鲜度”（stream 到达到可查询的延迟）分布数据。

---

## GPT 调研中被修正 / 过时的地方

1. **4.2 / 4.3 把 Base Flashblocks（rollup-boost + op-rbuilder + websocket-proxy）当作增量发布的现成参考架构，这已经过时。**
   - Base 在 Azul 后用自研 base-builder 和 base-reth-node 取代了 op-rbuilder 和 op-geth（B12），并计划在 Denim 中废弃 Flashblocks、改出 200ms canonical 区块（B13、B14）。
   - OP Labs 2026-08-31 改用 Subblocks，停止支持 op-rbuilder（B15–B17）。
   - GPT 引用的“已广播前缀不可插入”规则本身仍然成立（B11），但它适用的架构正在退场。
2. **4.7 / 2.9 只引用了 EIP-1559，没有写 OP Stack 已经在协议内做的 DA 计量（Jovian DA footprint、最低 base fee、operator fee），** 也没有写 Arbitrum 多维定价“已随 ArbOS 61 发布但禁止启用”的状态（B52、B57）。
3. **4.9 引用的 MegaETH 角色划分（megaeth.com/research，带 utm）应换成当前文档：** replica / full 节点、prover、stateless validator；DA 用 EigenDA，争议解决用 Kailua（B20、B63）。
4. **2.7 / 4.8 只以 OP Succinct 为证明参考，漏掉了 2026 年的主流演进：** Base 的 TEE + ZK 多证明（B43），以及 Kailua 的混合模式（B47）。另外，OP Succinct 的公开成本数字还是 2024 年的（B46）。
5. **没有覆盖 Arbitrum 的排序政策变化：** Timeboost 已于 2026-09-24 被 PGA 取代（B25）。
6. **6.1 关于 Mantle 发布记录的说法核对属实：** v1.6.3 Elysium 含 eager next-block construction；v1.5.3 Arsia 含 span batch 和 Brotli（B6）。

**2025 年内部研究需要修正的地方：**
- 内部研究《解析 Base 的扩展计划》(Notion) 写 Base“将 block gas limit 从 35 Mgas/s 下调至 25 Mgas/s”。实际下调的是 gas **target**（35→25），limit 反而从 70 提到 75 Mgas/s（B66）。
- 同一篇里的“Reth 可支持 ~150 Mgas/s”“FPS 是瓶颈”已经过时：Base 当前单块预算约 400M gas / 2s（B55）；FPS 瓶颈先被 MT+64 Cannon 解除，后来又被 Azul 多证明替换（B42、B43）。
- 内部研究《Rise Chain 中对区块构建的设计》(Notion) 写“主网 2025 Q3/Q4”。实际是 2026 年春天以邀请制上线（B23）。
- 内部研究《Rollup-Boost Intro》(Notion, 2024-H2) 描述的 rollup-boost / op-rbuilder 主线，在 OP 官方支持范围内已经退场（B16）。

## 来源

[1] **PRIMARY** OP Stack Spec – L2 Execution Engine（specs.optimism.io/protocol/exec-engine.html）。证明 sequencer 用 forkchoiceUpdated + payloadAttributes 启动构建、getPayload 封块，transactions 前缀由派生决定。访问 2026-10-27。
[2] **PRIMARY** Base blog “Scaling Base With Reth”（2024-12-18，blog.base.dev/scaling-base-with-reth）。证明 Geth 和 Reth 的区块构建 p50/p95/p99/p999 分布。访问 2026-10-27。
[3] **PRIMARY** Base blog “Flashblocks Deep Dive”（blog.base.dev/flashblocks-deep-dive）。证明主网 state root 约 130ms、移出后构建 P50 从 150ms 降到 10ms、tail reorg 从 0.2% 降到约 0、7 月 16 日上线。访问 2026-10-27。
[4] **PRIMARY** Optimism blog “Flashblocks: Deep Dive – 250ms preconfirmations on OP Mainnet”（optimism.io/blog/…，未标日期）。证明 op-rbuilder 需要 NVMe、网络 SSD 下区块时间退化到 2.5–3s、rollup-boost 的 fallback 机制。访问 2026-10-27。
[5] **PRIMARY** mantle-xyz/mantle-v2 Releases（v1.6.3 Elysium、v1.5.3/v1.5.4 Arsia）。证明 eager next-block construction 的定义，以及 Arsia 含 span batch / Brotli / Jovian 参数。访问 2026-10-27。
[6] **PRIMARY** RISE blog “Incremental Block Construction”（blog.risechain.com/incremental-block-construction，图片路径为 2025/02）。证明 shreds 的定义和延迟 merkleization。访问 2026-10-27。
[7] **PRIMARY** Base Docs – Flashblocks Reference（docs.base.org/base-chain/flashblocks/faq）。证明 200ms / 10 个 Flashblock、组件分工、reorg 目标 < 0.1%、`eth_call pending` 可能落后 N-5、Denim 废弃计划。访问 2026-10-27。
[8] **PRIMARY** Base Docs – Throughput and Limits。证明单块约 400M gas、首个 Flashblock 约 40M、P50 构建约 10ms、最低 base fee 0.005 gwei、elasticity 6、DA 限流。访问 2026-10-27。
[9] **PRIMARY** Base Docs – Transaction Ordering。证明 Flashblock 一旦构建并广播，顺序即锁定。访问 2026-10-27。
[10] **PRIMARY** Base Docs – Configuration Changelog。证明 Flashblocks 主网启用日期（2025-07-07）和最低 base fee 的上调时间线。访问 2026-10-27。
[11] **PRIMARY** Base Docs – Upgrades overview。证明 Azul / Beryl / Cobalt / Denim / Jovian 的激活日期。访问 2026-10-27。
[12] **PRIMARY** Base Docs – Denim “200ms Native Blocks”。证明 canonical 200ms 区块、BaseTime 设计、Sepolia 激活日期和主网目标。访问 2026-10-27。
[13] **PRIMARY** Base Docs – Migrate From Flashblocks。证明 Denim 后 pending 标签和 Flashblocks 订阅失效。访问 2026-10-27。
[14] **PRIMARY** Base Docs – Azul overview。证明 EIP-7825 等变更、Flashblocks payload 精简、多证明。访问 2026-10-27。
[15] **PRIMARY** Base Docs – Azul Proof System。证明 TEE + ZK 时 1 天、单证明时 7 天，ZK 无需许可且可推翻 TEE，TEE 跑在 AWS Nitro 中。访问 2026-10-27。
[16] **PRIMARY** Base blog “Introducing Base Azul”（原定 2026-05-13）。证明客户端合并、5,000 TPS 突发、后续路线。访问 2026-10-27。
[17] **PRIMARY** Base blog “Scaling Base: Doubling capacity in 30 days”（2025-10-28）。证明提 limit 而不提 target 的策略、MT+64 Cannon 解除证明瓶颈、resource metering 与 FAL 计划。访问 2026-10-27。
[18] **PRIMARY** Base blog “Scaling Base in 2025: Sustaining 10x growth”（2025-06-18）。证明 target 35→25、limit 70→75 Mgas/s。访问 2026-10-27。
[19] **PRIMARY** OP Docs – Subblocks（docs.optimism.io/op-stack/features/flashblocks）。证明 subblock 是只追加的投影而非承诺、预确认可以撤回、OP Labs 不支持 Flashblocks 栈、仅向 OP Enterprise 提供。访问 2026-10-27。
[20] **PRIMARY** OP Notice – Preconfirmation Architecture Transition。证明 Subblocks 于 2026-08-31 在 OP Mainnet 上线，以及 op-rbuilder 的退场时间线。访问 2026-10-27。
[21] **PRIMARY** OP Notice – Subblocks 200ms。证明间隔从 250ms 降到 200ms、四个字段置零。访问 2026-10-27。
[22] **PRIMARY** OP Spec – Jovian Execution Engine。证明最低 base fee、DA footprint block limit、operator fee ×100，以及 Pectra 下 blob 吞吐约 96 kB/s（target 约 64）。访问 2026-10-27。
[23] **PRIMARY** OP Spec – Fjord Execution Engine。证明 FastLZ 估算公式和 minTransactionSize = 100。访问 2026-10-27。
[24] **PRIMARY** OP Spec – Ecotone derivation（blob 编码）。证明单个 blob 最多装 130,044 字节 rollup 数据。访问 2026-10-27。
[25] **PRIMARY** OP Spec – Span Batches / Batch Submitter / Derivation。证明 batch → channel（流式压缩）→ frame 的流程。访问 2026-10-27。
[26] **PRIMARY** OP Docs – kona-client / cannon。证明 CANNON_KONA（game type 8）自 Upgrade 19 起是 respected game type，运行在 MIPS64 上。访问 2026-10-27。
[27] **PRIMARY** Uniswap blog “Unichain Hits 200ms Sub-Blocks Inside TEEs”（2025-08-14）。证明 200ms、TEE 内的 priority ordering。访问 2026-10-27。
[28] **PRIMARY** Unichain Docs – Integrating Flashblocks。证明 1s 区块 / 200ms 预确认、pending 标签。访问 2026-10-27。
[29] **PRIMARY** MegaETH Docs – Architecture。证明 replica / full 节点、EigenDA、Kailua、prover。访问 2026-10-27。
[30] **PRIMARY** MegaETH Docs – Mini-Blocks。证明约 10ms mini-block / 约 1s EVM block、Rex5 起 sequencer 签名、签名不等于最终性。访问 2026-10-27。
[31] **PRIMARY** MegaETH Spec – Dual Gas Model。证明 compute + storage 双 gas、base fee 0.001 gwei、单块最多 100 亿 gas。访问 2026-10-27。
[32] **PRIMARY** MegaETH Docs – Stateless Validation。证明可以用 SALT witness 在笔记本级硬件上实时验证主网。访问 2026-10-27。
[33] The Block “MegaETH debuts real-time mainnet”（2026-02-09，二手）。证明主网上线日期（只用于日期）。访问 2026-10-27。
[34] **PRIMARY** RISE blog “RISE Launch philosophy”（2026-05-01）。证明主网邀请制、已上线数周、自称 5 Ggas/s / 50k TPS。访问 2026-10-27。
[35] **PRIMARY** RISE Docs – Shreds。证明官方称确认时间 3ms、shred 带签名。访问 2026-10-27。
[36] **PRIMARY** Arbitrum Docs – Introduction to PGA。证明 Timeboost 的设计和退场理由，以及 PGA 的 125ms 轮次、最多 8 块/s、反饥饿 boost。访问 2026-10-27。
[37] **PRIMARY** Arbitrum blog “PGA & Fast Feed”（2026-09-24）。证明 PGA 已取代 Timeboost。访问 2026-10-27。
[38] **PRIMARY**（学术）arXiv 2509.22143 “The Express Lane to Spam and Centralization”。证明 Timeboost 三个实体赢得 99.74% 的拍卖（数据截至 2026-04-13）。访问 2026-10-27。
[39] **PRIMARY** Arbitrum Docs – ArbOS 61 notice。证明 ArbOS 61 于 2026-08-20 激活、多维定价不要启用且将被移除、优先费自 2026-09-23 在 One 上启用。访问 2026-10-27。
[40] **PRIMARY** EF blog “Fusaka Mainnet Announcement”（2025-11-06）。证明 Fusaka 2025-12-03、BPO1 10/15（2025-12-09）、BPO2 14/21（2026-01-07）。访问 2026-10-27。
[41] **PRIMARY** EIP-8138 BPO3（Draft）。证明 BPO3 参数为空，历史表为 BPO2 14/21、BPO1 10/15。访问 2026-10-27。
[42] ethresear.ch “Blob Analysis after Fusaka and BPO Updates”（MigaLabs）。证明 blob 利用率不足、16 个以上 blob 时漏块率升高。访问 2026-10-27。
[43] **PRIMARY** Eigen Labs blog “Introducing EigenDA V2 on Mainnet at 100 MB/s”（2025-07-30）。证明 100 MB/s、平均 5s / p99 10s。访问 2026-10-27。
[44] **PRIMARY** Celestia Docs – Mainnet Beta。证明当前每块最多 32 MiB、出块约 3s。访问 2026-10-27。
[45] **PRIMARY** OP Succinct Book – Architecture / Introduction。证明 range + aggregation 两层结构，以及 Lite（ZK 故障证明）选项。访问 2026-10-27。
[46] **PRIMARY** Succinct blog “Introducing OP Succinct”（2024）。证明每笔 0.5–1 美分的证明成本（已过时）。访问 2026-10-27。
[47] **PRIMARY** BOB Docs – Hybrid Chain（Kailua）。证明约 3 美元一次证明、约 25 万 gas、4 天窗口、可附有效性证明立即最终确定、mini proposal 每 6 块一个。访问 2026-10-27。
[48] **PRIMARY** Axiom blog “Proving Ethereum in Real Time on 4 GPUs”（2026-07-29）。证明 4 张 5090 p99 9.7s、16 张 5090 p99 3.7s（自测）。访问 2026-10-27。
[49] **PRIMARY** Ethproofs.org。证明当前阶段、69.5% sub-10s、每块成本 $0.003–0.006。访问 2026-10-27。
[50] **PRIMARY** ZKsync Docs – Double Resource Accounting。证明 ergs 与 native resource 两种计量、native 不足时补收 gas。访问 2026-10-27。
[51] **PRIMARY** EIP-7999（Draft，2025-08-04 创建）及 ethresear.ch “Designs for EVM gas accounting in EIP-7999”（2026-08）。证明仍处于设计阶段。访问 2026-10-27。
[52] ethereum.org – Glamsterdam 页面（搜索摘要，页面更新于 2026-09-14）。证明 Glamsterdam 预计 2026 Q4，日期未定。访问 2026-10-27。
[53] EigenDA Docs Overview（docs.eigencloud.xyz，抓取返回 403，仅有搜索摘要）。安全阈值为“1/3 ETH restakers + 1/3 EIGEN stake”。访问 2026-10-27。

被降级 / 弃用的来源：
- Chainstack 文档（二手，称 OP Flashblocks “2026 年上线”，与 OP 自己的文档口径不一）。
- bitcoin.com / cryptocapitalnews 的 MegaETH TPS 报道（二手，数字互相矛盾）。
- mnt-mantle.ink（疑似非官方站点）。
- DefiLlama 的 Timeboost 收入（只当线索）。
- cointelegraph / Galaxy 的路线解读（二手）。

## 开放问题

1. MegaETH 和 RISE 主网的真实指标（持续 TPS、gas/s、mini-block / shred 的 p99、预确认失效率）没有一手、可复核的数据。
2. 各 L2 的每笔压缩后 DA 字节分布：需要从 batcher 数据（比如每个 blob 对应的交易数）自己计算。
3. Base 的 ZK prover（Azul 多证明）实际证明延迟、成本和 GPU 规模没有公开。OP Succinct 2026 年的成本也没有更新。
4. Base Denim 主网激活日期，以及 200ms canonical 区块对 state root / 状态增长 / 证明成本的实测影响。
5. Unichain 等非 OP Enterprise 链在 op-rbuilder 退场后的栈选择。
6. Arbitrum 多维定价被撤回的原因：公告只说“将被移除”，没有给出技术理由。
7. Base Flashblock Access Lists（FAL）是否已随 Beryl 上线：Azul 博文把它列在 6 月计划里，但 Beryl 概述没有提到。

---

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| B1 | OP Stack sequencer 通过 engine_forkchoiceUpdated 携带 payloadAttributes 启动构建，再用 engine_getPayload 取回封好的块；attributes 里的 transactions（deposit 等）必须排在最前，txpool 交易接在后面 | https://specs.optimism.io/protocol/exec-engine.html（engine_forkchoiceUpdated / getPayload / noTxPool 各节，访问于 2026-10-27） | observed | |
| B2 | Base 测得归档节点上 Geth 的区块构建 p50/p99 为 374ms/2319ms，Reth 为 260ms/698ms（Base 自测，2024-12） | https://blog.base.dev/scaling-base-with-reth（benchmark 表，访问于 2026-10-27） | observed | |
| B3 | Base 主网上每个 Flashblock 计算一次 state root 平均约 130ms，让构建时间逼近 200ms | https://blog.base.dev/flashblocks-deep-dive（Optimizing State Root Calculation，访问于 2026-10-27） | observed | |
| B4 | Base 把 state root 改到最终区块上、由 op-geth 通过额外一次 FCU 计算后，Flashblock 构建 P50 从 150ms 降到 10ms | https://blog.base.dev/flashblocks-deep-dive（同节，访问于 2026-10-27） | observed | |
| B5 | OP Mainnet 的 op-rbuilder 是 IO 密集型；使用网络附加 SSD 时区块时间偶尔退化到 2.5–3s，换成 NVMe 后恢复 | [4] Performance Enhancements / Measured Impact | observed | |
| B6 | Mantle v1.6.3 Elysium 启用了 eager next-block construction，用来缩短“封上一块”到“开始接收下一块交易”之间的空窗 | https://github.com/mantle-xyz/mantle-v2/releases（1.6.3 Elysium，Sequencer and preconfirmations，访问于 2026-10-27） | observed | |
| B7 | RISE 的 shreds 不做 merkleization，只记录 ChangeSet 承诺；整个 L2 区块的 merkleization 推迟到最后一个 shred 之后 | https://blog.risechain.com/incremental-block-construction/（Shred 定义，访问于 2026-10-27） | observed | |
| B8 | OP Stack 中影响用户感知延迟的关键路径是“等待出块时隙 + 执行 + 封块算 state root + gossip”；DA 发布和证明不在实时路径上，但会限制持续吞吐 | 由 B1、B2、B3、B36 推出：Engine API 串行封块，state root 和存储 IO 主导尾延迟，DA 限流是事后约束 | inferred | |
| B9 | “共识阶段占出块时间 40%–80%、执行最坏只占 8%”这组数字只出现在内部研究《Rise Chain 中对区块构建的设计》(Notion) 引用的 RISE 白皮书里，在 RISE 博客中未能复核 | 内部研究《Rise Chain 中对区块构建的设计》(Notion)；[6] 只给出“merkleization 最多占 75%” | speculative | |
| B10 | Base 主网 2s 区块被切成 10 个 200ms Flashblock，第 j 个 Flashblock 最多使用 j/10 的区块 gas | https://docs.base.org/base-chain/flashblocks/faq（Key Concepts / Block Building，访问于 2026-10-27） | observed | |
| B11 | Base 的 Flashblock 一旦构建并广播，交易顺序即锁定，后到的高优先费交易不能插入更早的 Flashblock | https://docs.base.org/base-chain/network-information/transaction-ordering（Flashblocks，访问于 2026-10-27） | observed | |
| B12 | Azul 后 Base 的执行和共识客户端为 base-reth-node 和 base-consensus，Flashblocks builder 为 Base 维护的 base-builder，rollup-boost 仍由 Flashbots 维护 | https://docs.base.org/base-chain/flashblocks/faq（Architecture 表，访问于 2026-10-27） | observed | |
| B13 | Base 的 Denim 升级用每 200ms 一个的 canonical 区块取代 Flashblocks；2026-10-21 已在 Sepolia 激活，主网目标 2026-11，日期未定 | https://docs.base.org/upgrades/overview（Denim，访问于 2026-10-27） | observed | |
| B14 | Denim 后每个 200ms 区块都有独立的 state root、receipts 和 unsafe/safe/finalized 生命周期，pending 标签和 Flashblocks 订阅不再有等价物 | https://docs.base.org/upgrades/denim/200ms-blocks（Summary / Block lifecycle）；https://docs.base.org/upgrades/denim/migrate-from-flashblocks.md（访问于 2026-10-27） | observed | |
| B15 | OP Labs 用自研的 Subblocks 取代 Flashblocks：subblock 序列只追加，stream 中 state_root 和 block_hash 置零，RPC 节点需自行执行交易得到状态 | https://docs.optimism.io/op-stack/features/flashblocks（How it works / payload，访问于 2026-10-27） | observed | |
| B16 | Subblocks 自 2026-08-31 在 OP Mainnet 运行；最后一条 OP Enterprise 链迁移完成后，OP Labs 停止运行和测试 op-rbuilder，并不再为 Flashblocks 提供支持 | https://docs.optimism.io/notices/preconfirmation-architecture-transition.md（Timeline，访问于 2026-10-27） | observed | |
| B17 | OP Labs 文档写明，subblock 预确认在 sequencer 可以 reorg unsafe 区块的同等条件下可以被撤回，承载的是 sequencer 的信任假设而非协议的；Subblocks 只向 OP Enterprise 客户提供 | https://docs.optimism.io/op-stack/features/flashblocks（Safety and continuity FAQ）；https://docs.optimism.io/chain-operators/guides/features/flashblocks-guide（访问于 2026-10-27） | observed | |
| B18 | Unichain 自 2025-08 起提供 200ms Flashblocks，builder 在 TEE 中运行并执行 priority ordering 规则 | https://blog.uniswap.org/flashblocks-are-live（2025-08-14，访问于 2026-10-27） | observed | |
| B19 | Unichain 区块时间为 1s，Flashblocks 以 out-of-protocol 方式提供 200ms 预确认 | https://developers.uniswap.org/llms.mdx/docs/unichain/technical-information/flashblocks（What Are Flashblocks，访问于 2026-10-27） | observed | |
| B20 | MegaETH sequencer 约每 10ms 产出一个 mini-block、约每 1s 产出一个 EVM block，数据走 EigenDA，争议解决用 Kailua | https://docs.megaeth.com/architecture（访问于 2026-10-27） | observed | |
| B21 | MegaETH 自 Rex5 起由 sequencer 对每个 mini-block 头签名，可以证明 sequencer 作恶；文档写明签名不代表最终性 | https://docs.megaeth.com/mini-block（Sequencer signatures，访问于 2026-10-27） | observed | |
| B22 | MegaETH 公开主网于 2026-02-09 上线 | https://www.theblock.co/news/ecosystems/2026-02-09-megaeth-debuts-mainnet-389015（二手，只用于日期，访问于 2026-10-27） | observed | |
| B23 | RISE 2026-05-01 博文称 RISE 主网和 RISEx 已上线数周，但只对受邀用户开放；自称 5 Ggas/s、50k TPS（自测） | https://blog.risechain.com/rise-launch-philosophy/（访问于 2026-10-27） | observed | |
| B24 | Arbitrum Timeboost 于 2025-04-17 在 One 上线，以二价密封拍卖出售 60s express lane，其他交易延迟 200ms | https://docs.arbitrum.io/how-arbitrum-works/priority-gas-auction/pga（Why sunset Timeboost，访问于 2026-10-27） | observed | |
| B25 | Arbitrum One 于 2026-09-24 用 PGA 取代 Timeboost：250ms 区块，每块 2 个 125ms 按优先费排序的轮次，满块提前出块，最多每秒 8 块 | https://blog.arbitrum.io/competing-for-transaction-priority-on-arbitrum/；[36] PGA rounds（访问于 2026-10-27） | observed | |
| B26 | 实证研究发现 Timeboost 的拍卖高度集中，三个实体赢得 99.74% 的拍卖（数据截至 2026-04-13） | https://arxiv.org/html/2509.22143v3（摘要，访问于 2026-10-27） | observed | |
| B27 | 在 OP Stack 系 L2 上，增量预确认正在从第三方 sidecar（rollup-boost/op-rbuilder）转向协议内的短区块（Base Denim）或厂商自研实现（OP Subblocks） | 由 B13、B15、B16 推出：两大 OP Stack 运营方在 2026 年都放弃了 op-rbuilder 路线 | inferred | |
| B28 | OP Stack batcher 把 L2 区块编码为 batch，放进 channel 做流式压缩，再切成 frame 提交；Delta 引入 span batch 降低多块开销 | https://specs.optimism.io/protocol/delta/span-batches.html；https://specs.optimism.io/protocol/batcher.html（访问于 2026-10-27） | observed | |
| B29 | Fjord 引入 Brotli channel 压缩和基于 FastLZ 的 L1 费用估算，每笔交易的最小估计大小为 100 字节 | https://specs.optimism.io/protocol/fjord/exec-engine.html（参数表，访问于 2026-10-27） | observed | |
| B30 | 按 OP Stack 的 blob 编码，单个 blob 最多装 130,044 字节 rollup 数据 | https://specs.optimism.io/protocol/ecotone/derivation.html（Blob encoding，访问于 2026-10-27） | observed | |
| B31 | Fusaka 于 2025-12-03 激活 PeerDAS；BPO1（2025-12-09）把 blob target/max 设为 10/15，BPO2（2026-01-07）设为 14/21 | https://blog.ethereum.org/2025/11/06/fusaka-mainnet-announcement（Mainnet BPO Schedule，访问于 2026-10-27） | observed | |
| B32 | 截至 2026-10，BPO3 仍是参数为空的 Draft EIP，最新已生效参数为 BPO2 的 14/21 | https://eips.ethereum.org/EIPS/eip-8138（Specification / Historical Context，访问于 2026-10-27） | observed | |
| B33 | Ethereum blob 当前 DA 容量约为 152 KB/s（target 14）到 228 KB/s（max 21） | 由 B30、B31 推出：14×130,044/12≈151,718 B/s；21×130,044/12≈227,577 B/s | inferred | |
| B34 | 按每笔 100 字节算，Ethereum blob 在所有 L2 之间共享时约能支撑 1,500 TPS（target）到 2,300 TPS（max）；按 200 字节算减半 | 由 B29、B33 推出：151,718/100≈1,517，227,577/100≈2,276；100 字节是 Fjord 费用模型的下限，并非实测均值 | inferred | |
| B35 | 对 Base 这种单块约 400M gas / 2s 的链，小额交易的持续吞吐先受 blob 带宽约束，而非 gas | 由 B33、B55 推出：200 Mgas/s ÷ 21k≈9,500 TPS，需要约 950 KB/s DA，是 blob max 的约 4 倍 | inferred | |
| B36 | Base 文档写明，DA 吞吐吃紧时 sequencer 会限制 L2 吞吐让 batcher 追上，期间高优先费的交易也可能被延迟 | https://docs.base.org/specifications/transactions/throughput-and-limits.md（Data Availability Throughput，访问于 2026-10-27） | observed | |
| B37 | EigenDA V2 于 2025-07-30 上主网，自称吞吐 100 MB/s，平均端到端延迟 5s，p99 10s | https://www.eigenlabs.org/blog/introducing-eigenda-v2-on-mainnet-at-100-mb-s（访问于 2026-10-27） | observed | |
| B38 | Celestia 主网当前每块最多 32 MiB，出块约 3s，理论容量约 11 MB/s | https://docs.celestia.org/operate/networks/mainnet-beta（Block size limit / Block time，访问于 2026-10-27）；11 MB/s 为 32 MiB÷3s 的推算 | observed | |
| B39 | EigenDA 的安全阈值是 ETH restakers 与 EIGEN 质押者的法定人数，而不是 Ethereum 共识本身 | EigenDA Docs Overview 搜索摘要（docs.eigencloud.xyz，抓取 403，访问于 2026-10-27）；由 [53] 摘要推出 | inferred | |
| B40 | MigaLabs 实测：BPO1 后每 slot blob 中位数从 6 降到 4，16 个以上 blob 的区块后续漏块率为 0.77%–1.79%，高于约 0.5% 的基线 | https://ethresear.ch/t/blob-analysis-after-fusaka-and-bpo-updates/23853（Key findings，访问于 2026-10-27） | observed | |
| B41 | OP Stack 当前生效的故障证明游戏是 CANNON_KONA（kona-client 跑在 64 位 MIPS Cannon 上），自 Upgrade 19 起为 respected game type | https://docs.optimism.io/op-stack/components/kona-client（访问于 2026-10-27） | observed | |
| B42 | Base 2025-10 写道，optimistic 证明系统下不能产生比证明系统能证明的更多数据；MT+64 Cannon 上线后故障证明不再是瓶颈 | https://blog.base.dev/scaling-base-doubling-capacity-in-30-days（Bottleneck 3，访问于 2026-10-27） | observed | |
| B43 | Base Azul（主网 2026-05-28）采用 TEE + ZK 多证明：两种证明一致时 1 天结算，只有一种时 7 天；ZK 路径无需许可，可推翻 TEE 提案 | https://docs.base.org/upgrades/azul/proofs（Finality Model，访问于 2026-10-27） | observed | |
| B44 | Base Beryl（2026-06-25）把单证明争议的最终化窗口从 7 天降到 5 天，双证明快速路径仍为 1 天 | https://docs.base.org/llms.txt（Beryl / Faster Withdrawals 条目，访问于 2026-10-27） | observed | |
| B45 | OP Succinct 先用 range proof 证明一段 L2 区块，再聚合成一个 aggregation proof 在链上验证，只需改 op-proposer 和链上合约 | https://succinctlabs.github.io/op-succinct/architecture.html（访问于 2026-10-27） | observed | |
| B46 | OP Succinct 公开的证明成本仍是 2024 年的数字（每笔 0.5–1 美分，Base 样本 0.61 美分），时效已过 | https://blog.succinct.xyz/op-succinct（成本表，访问于 2026-10-27） | observed | |
| B47 | BOB 的 Kailua 混合模式：默认 4 天窗口，争议只需证明一个 6 块的 mini proposal（约 3 美元，约 25 万 gas 验证），也可附有效性证明立即最终确定 | https://docs.gobob.xyz/docs/bob-chain/hybrid-chain（访问于 2026-10-27） | observed | |
| B48 | Axiom 自测：OpenVM 2.1 Preview 用 4 张 5090 证明 7,200 个 L1 主网区块，p99 9.7s；用 16 张时 p99 3.7s | https://www.axiom.xyz/blog/2-1（2026-07-29，访问于 2026-10-27） | observed | |
| B49 | Ethproofs 当前处于 security sprint 阶段，受评 prover 的 sub-10s 成功率合计为 69.5%（目标 ≥70%） | https://ethproofs.org/（RTP prover performance，访问于 2026-10-27） | observed | |
| B50 | 若线性外推，以约 200 Mgas/s 运行的 L2 要做实时 ZK 证明，需要的 GPU 约为 L1 实时证明的 40 倍 | 由 B48、B55 推出：L1 约 60M gas/12s=5 Mgas/s，Base 约 200 Mgas/s；线性扩展是未经验证的假设 | speculative | |
| B51 | Jovian 于 2025-12-02 在 Base 主网激活 | https://docs.base.org/upgrades/overview（Jovian，访问于 2026-10-27） | observed | |
| B52 | Jovian 引入 DA footprint block limit：按 FastLZ 估算每笔 DA 字节数并乘以 scalar 计入 blobGasUsed，区块总量不得超过 gasLimit，base fee 更新改用 max(gasUsed, blobGasUsed) | https://specs.optimism.io/protocol/jovian/exec-engine.html（DA Footprint Block Limit，访问于 2026-10-27） | observed | |
| B53 | Jovian 规范说明：此前 L1 DA 吞吐的限制只能靠 batcher-sequencer 限流这种策略手段，会压低 base fee 并引发优先费拍卖 | https://specs.optimism.io/protocol/jovian/exec-engine.html（Rationale，访问于 2026-10-27） | observed | |
| B54 | Base 的最低 base fee 从 2025-12-04 的 200,000 wei 逐步上调到 2026-02-19 的 5,000,000 wei，EIP-1559 denominator 于 2026-02-04 提到 125 | https://docs.base.org/base-chain/network-information/configuration-changelog（访问于 2026-10-27） | observed | |
| B55 | Base 当前单块 gas 预算约 400M（2s 区块），首个 Flashblock 约 40M，EIP-1559 elasticity 为 6 | https://docs.base.org/specifications/transactions/throughput-and-limits.md（Current Limits / Fee Parameters，访问于 2026-10-27） | observed | |
| B56 | Base 改为通过提 gas limit 而不是 gas target 来扩容，target 只在观察到高费用时才提高；同时在做 resource metering 和 mempool 重构 | https://blog.base.dev/scaling-base-doubling-capacity-in-30-days（Our progress / Effort 3，访问于 2026-10-27） | observed | |
| B57 | ArbOS 61 于 2026-08-20 在 Arbitrum One/Nova 激活，节点软件附带多维定价，但官方要求不得启用，并称未来版本会移除 | https://docs.arbitrum.io/notices/arbos61-upgrade-notice（访问于 2026-10-27） | observed | |
| B58 | ZKsync OS 同时计 EVM gas（ergs）和 native resource；native resource 近似证明和发布数据的成本，不够时会补收 gas | https://docs.zksync.io/zksync-protocol/zksyncos/double-accounting（访问于 2026-10-27） | observed | |
| B59 | MegaETH 采用 compute gas + storage gas 双 gas 模型，原因是 base fee 只有 0.001 gwei、单块最多 100 亿 gas，必须单独给状态增长定价 | https://docs.megaeth.com/spec/megaevm/dual-gas-model.md（Motivation，访问于 2026-10-27） | observed | |
| B60 | EIP-7999（统一多维费用市场）仍为 Draft，2026-08 起还在讨论 EVM gas 记账的设计选项 | https://eips.ethereum.org/EIPS/eip-7999；https://ethresear.ch/t/designs-for-evm-gas-accounting-in-eip-7999/25696（访问于 2026-10-27） | observed | |
| B61 | Base 当前 gas target 约为每块 67M gas（约 33 Mgas/s） | 由 B55 推出：400M ÷ elasticity 6；官方未直接给出 target 数值 | inferred | |
| B62 | MegaETH 的 replica 节点直接应用 sequencer 下发的执行结果，不重新执行；full 节点本地重新执行，独立验证每个状态转换 | https://docs.megaeth.com/architecture（RPC Nodes，访问于 2026-10-27） | observed | |
| B63 | MegaETH 提供 stateless validator，可以用 SALT witness 在笔记本级硬件上实时验证主网 | https://docs.megaeth.com/node-operation/stateless-validation.md（访问于 2026-10-27） | observed | |
| B64 | Base 的 Flashblocks-aware 节点最多缓存 5 个区块的 Flashblocks 状态，`eth_call pending` 的区块上下文可能是 N-5，但状态结果包含全部已收到的 Flashblocks | https://docs.base.org/base-chain/flashblocks/faq（RPC FAQ，访问于 2026-10-27） | observed | |
| B65 | 预确认 RPC 和 replica 节点提升了状态新鲜度与响应速度，代价是区块上下文滞后或信任 sequencer 的执行结果，所以响应延迟和状态新鲜度需要分开衡量 | 由 B62、B64、B15 推出：三种读路径各自牺牲一个维度 | inferred | |
| B66 | Base 2025-06 下调的是 gas target（35→25 Mgas/s），同时把 gas limit 从 70 提到 75 Mgas/s；内部研究写成“下调 gas limit”是错误的 | https://blog.base.dev/scaling-base-sustain-10x-growth（访问于 2026-10-27）；对照内部研究《解析 Base 的扩展计划》(Notion) | observed | |

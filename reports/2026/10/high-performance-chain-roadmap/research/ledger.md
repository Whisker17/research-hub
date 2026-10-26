# 论断台账

每条会出现在 explainer 里的论断，都要在这里有一行。
类型：observed（直接观察到，有一手证据）/ inferred（由证据推出）/ speculative（推测，需在页面上标明）。

本表由四路调研与主会话核对合并而成，编号前缀对应分册：
- S → `notes-system.md`（系统模型、网络传播、共识与排序、执行与共识解耦、L1 扩容基线）
- B → `notes-l2.md`（L2 出块流水线、预确认、DA、证明与结算、费用计量、读路径）
- E → `notes-exec.md`（执行层瓶颈、并行执行、VM/JIT、状态存储与承诺、状态增长、硬件路线）
- M → `notes-mantle.md`（Mantle 基线、mStocks 叙事、2025 内部研究复核、改动级别）
- K → `notes-mainsession.md`（主会话：Mantle 链上参数、batcher、内部压测、官方路线图）
- R → 主会话综合推导（路线图依据），证据列写明由哪些行推出

证据里的 `[n]` 指对应分册“来源”一节的第 n 条。网页访问日期均为 2026-10-27。

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| S1 | Ethereum 节点必须同时运行执行客户端（执行交易、持有状态、监听交易）与共识客户端（PoS 共识） | [1] §What are nodes and clients，访问于 2026-10-27 | observed | |
| S2 | OP Stack 的 L2 区块由 L1 sequencing window 内的 batcher 交易、deposit 与 L1 origin 确定性派生 | [2] §Overview / sequencing window，访问于 2026-10-27 | observed | |
| S3 | OP Stack 的 unsafe head 是尚未从 L1 派生的区块，safe head 可由当前 canonical L1 派生，finalized 可由已最终的 L1 派生 | [2] §Engine Queue，访问于 2026-10-27 | observed | |
| S4 | OP Mainnet 典型时间：Subblocks 预确认约 200ms、unsafe 约 2s、safe 数分钟、finalized 约 15–30 分钟 | [3] §How this maps to protocol terms，访问于 2026-10-27 | observed | |
| S5 | OP Stack 软最终性要信任单个 sequencer 与 batcher key，batcher 未在 12 小时 sequencing window 内发布数据时交易会被丢弃 | [3] §The journey from soft finality to hard finality，访问于 2026-10-27 | observed | F2 |
| S6 | OP Stack 的“7 天”是标准桥提现延迟，不是交易最终性，故障证明挑战不会重组 L2 链 | [3] §Common misconceptions，访问于 2026-10-27 | observed | |
| S7 | OP Stack 故障证明的提案与挑战无需许可，挑战期约 1 周，最大博弈深度 73 | [4] §Permissionless challenges / FAQs，访问于 2026-10-27 | observed | |
| S8 | 区块执行时间满足 T ≥ max(W/p, L)，这是并行计算 work/span 下界在区块执行上的套用，不是某个项目的实测 | 由 [5]（T_P 由 T1/P 与 T∞ 约束）与 [6]（结果必须等同于预设顺序，依赖链即 span）推出 | inferred | F1 |
| S9 | “Σ λ·c ≤ B”的资源预算模型只是“任一资源利用率不能超过 1”的通用推导，未找到区块链专属的一手来源 | 由 S8 及 GPT 文 §3.1 推出：只能作为分析框架标注 | inferred | |
| S10 | Block-STM 在 32 线程下 Aptos 基准达 170k tps、高冲突负载 80k tps，属于合成基准而非主网 | [6] Abstract，访问于 2026-10-27 | observed | |
| S11 | Solana Turbine 把分片沿质押加权的多层树传播（fanout 参数 DATA_PLANE_FANOUT），多数验证者在 2–3 跳内收到 | [12] §Shred Propagation Flow（检索摘要），访问于 2026-10-27 | observed | |
| S12 | RaptorCast 用 Raptor 码和两层广播树，每个验证者的上行带宽只与消息大小成正比、与验证者数量无关，最坏传播时间为一个 RTT | [9] §Design requirements，访问于 2026-10-27 | observed | F4 |
| S13 | RaptorCast 不重传，在 20% 丢包和 33% 恶意节点的假设下，发送方需额外发送约 87% 的分片 | [9] §Fault tolerance，访问于 2026-10-27 | observed | F4 |
| S14 | Alpenglow 的 Rotor（单层中继取代 Turbine）截至 2026-10 尚未排期，SIMD-0326 只覆盖 Votor，主网仍用 Turbine | [14] §Phase 2: Rotor；[15] Motivation，访问于 2026-10-27 | observed | F4 |
| S15 | Anza 认为区块传播延迟主要由网络时延决定，而不是传输或计算时间 | [13] 正文 “speed of light is still too slow”，访问于 2026-10-27 | observed | |
| S16 | Solana 把区块提到 100M CU 前，要求超过 70% 质押启用 XDP 内核旁路网络以加快传播 | [17] §Network Readiness，访问于 2026-10-27 | observed | F2, F4 |
| S17 | 按 DoubleZero 自己的数据面板，epoch 1066 时约 58% 的 Solana 质押（422 个验证者）已接入 DoubleZero | [20] Solana Overview 面板（检索摘要），访问于 2026-10-27 | observed | |
| S18 | DoubleZero 宣传的入口 FPGA 过滤（去垃圾、去重、验签）截至 2026-10 尚未上线 | [19] docs “This feature is not yet functional”；Solutions “Coming in 2026”，访问于 2026-10-27 | observed | |
| S19 | OP Stack 的 sequencer 通过公开 p2p 网络把 unsafe 区块分发给其他节点 | [3] §The journey…，第 2 步，访问于 2026-10-27 | observed | |
| S20 | Base 每 200ms 构建一个 Flashblock，已广播部分的交易顺序锁定，后到的高费交易不能插入 | [40] §Flashblocks，访问于 2026-10-27 | observed | |
| S21 | 部分同步拜占庭共识要在正常路径上 2 个消息延迟内决定，当且仅当 n ≥ 5f−1；PBFT 需 3 个消息延迟 | [21] Abstract / Introduction，访问于 2026-10-27 | observed | F2, F5 |
| S22 | Solana Alpenglow（Votor）于 2026-10-21 epoch 1064 在主网激活，从 slot 459,653,000 起采用新共识 | [14] 页首与激活表，访问于 2026-10-27 | observed | F5 |
| S23 | Votor 在 ≥80% 质押一轮投票时快速最终确认，否则以 60% 阈值进入第二轮 | [14] §Voting and Certificates；[13]，访问于 2026-10-27 | observed | F5 |
| S24 | Votor 容忍 20% 恶意质押外加 20% 离线质押（“20+20”），而 TowerBFT 需要超过 2/3 质押才能 confirmed | [14] §Phase 1: Votor；[13]，访问于 2026-10-27 | observed | F5, R, F18 |
| S25 | Alpenglow 约 150ms 的中位最终性来自基于当时主网质押分布的仿真，未计入计算开销；Foundation 称其为“期望值而非常数” | [13] 正文括注；[14] §Finality Under Votor，访问于 2026-10-27 | observed | F5 |
| S26 | 截至 2026-10-27，没有找到 Alpenglow 上线后独立第三方的主网最终性实测 | 由 [14]（仍称 target/expectation）与检索到的二手报道（均称实测待定）推出 | inferred | F5 |
| S27 | Alpenglow 上线后，Solana 的 confirmed 与 finalized 指同一状态，投票交易不再进入区块 | [14] §Breaking Changes，访问于 2026-10-27 | observed | |
| S28 | Firedancer 与 Frankendancer 不支持 Alpenglow 迁移，验证者需运行 Agave 系 v4.3.2 客户端 | [14] §Breaking Change: Run an Agave-Based Client，访问于 2026-10-27 | observed | |
| S29 | MonadBFT 一轮即达推测最终性、两轮达完全最终性，正常路径为线性通信，并能抵抗 tail-forking | [10] §Summary，访问于 2026-10-27 | observed | F5 |
| S30 | MonadBFT 的推测最终性只在原 leader 双签等少数情况下可能回滚 | [10] §Configuration in Monad 表注，访问于 2026-10-27 | observed | F5 |
| S31 | Monad 主网 2025-11-24 上线，当前配置为 300ms 出块、600ms 最终性（2026-07 由 400ms/800ms 调整） | [10] 配置表；[11] 首页与 changelog 2026-07-23，访问于 2026-10-27 | observed | F5 |
| S32 | Raptr 在论文实验中 250k TPS 时延迟 755ms，属于实验环境而非主网 | [22] Abstract / §Evaluation，访问于 2026-10-27 | observed | |
| S33 | Aptos 的 Baby Raptr（Raptr 的第一阶段）2025 年上主网，把共识路径压到 4 跳 | [24]（检索摘要），访问于 2026-10-27 | observed | |
| S34 | Zaptos 在 100 个地理分布验证者的“类主网”环境中，高负载下把延迟降低约 40% | [23] Abstract / §Evaluation，访问于 2026-10-27 | observed | |
| S35 | Sui Mysticeti v2 把交易验证并入共识，其 Transaction Driver 让亚洲全节点端到端延迟从约 1.00s 降到约 0.65s（Mysten 自测） | [25] §Rollout，访问于 2026-10-27 | observed | |
| S36 | Sui 的提交中位数需要 4 轮消息，Mysten 下一步目标降到 3 轮 | [25] §Future Work，访问于 2026-10-27 | observed | |
| S37 | Sei Giga 在内部测试网达到 >5 gigagas/s 与 <250ms 最终性，Autobahn 把 DA 层与共识层分离并采用异步执行 | [26] Abstract（v3, 2026-06-29），访问于 2026-10-27 | observed | |
| S38 | 截至 2026-10-16，Sei 的 Autobahn 共识尚未上主网 | 由 [27]（二手报道称 roadmap 标为 coming soon）推出，未找到一手确认 | inferred | |
| S39 | Hyperliquid 的 HyperBFT 是 HotStuff 变体，同地部署客户端的端到端延迟中位 0.2s、p99 0.9s | [28] §Consensus / §Latency，访问于 2026-10-27 | observed | |
| S40 | Hyperliquid 主网约支持 200k orders/s，官方称当前瓶颈在执行而非共识与网络 | [28] §Throughput，访问于 2026-10-27 | observed | |
| S41 | Monad 共识只对交易顺序达成一致、不执行交易，执行因此可以用满整个出块时间 | [7] §Asynchronous Execution，访问于 2026-10-27 | observed | F6 |
| S42 | Monad 的提案只带 D=3 块前的状态根，执行出错的节点在 D 块后掉出共识并回滚重放 | [7] §Delayed Merkle Root，访问于 2026-10-27 | observed | F6 |
| S43 | Monad 用 10 MON 的 reserve balance 规则，让共识在只看得到滞后 k=3 块状态的情况下仍能安全纳入交易，新充值账户需等 k 块 | [8] §Summary；[7] §Transactions from newly-funded accounts，访问于 2026-10-27 | observed | F6 |
| S44 | Solana bankless leader 的依赖：SIMD-0298 随 Alpenglow 激活，SIMD-0290 已合入 Agave 等待激活，SIMD-0297 已批准，SIMD-0301 仍在 review | [18] Dependencies Status 表，访问于 2026-10-27 | observed | |
| S45 | EIP-7732 让 PTC 不验证执行 payload 即可证明，下一个 proposer 有半个 slot 验证 payload，代价包括 builder 扣留 payload 的 free option 问题 | [32] §Delayed validation / §Free option problem；[30] §ePBS，访问于 2026-10-27 | observed | F6 |
| S46 | EIP-7886（延迟执行）状态为 Stagnant，不在 Glamsterdam 的 scheduled 清单中 | [33] 页首状态；[29] §EIPs Scheduled for Inclusion，访问于 2026-10-27 | observed | F6 |
| S47 | Glamsterdam 列入 18 个 scheduled EIP，含 7732、7928、8037、8038、2780、7976、7981，EIP-7904 只是 informational | [29] §Specification，访问于 2026-10-27 | observed | F6 |
| S48 | Glamsterdam 于 2026-10-06 在 Sepolia 激活；原定 2026-10-26 的 Hoodi 激活因 EIP-8037 于 10-22 推迟，主网日期未定 | [29] §Activation；[31]，访问于 2026-10-27 | observed | |
| S49 | EF 在 2026-02 计划 Glamsterdam 在 2026 上半年上线，实际已推迟到至少 2026-10 之后 | 由 [36] §Looking ahead 与 S48 推出 | inferred | |
| S50 | 截至 2026-02，Ethereum 主网 gas limit 已从 30M 提到 60M，EF 的目标是“朝 100M 及以上”推进 | [36] §A quick look back / §Scale，访问于 2026-10-27 | observed | |
| S51 | 截至 2026-10，没有证据显示 Ethereum 主网 gas limit 超过 60M，200M 只在 Sepolia 测试 | 由 [37]（以 60M 作为当前默认值的例子）、[39]（二手报道主网仍 60M）与 S48 推出 | inferred | |
| S52 | EIP-7825 把单笔交易 gas 上限设为 2^24（16,777,216），txpool 与区块验证都会拒绝超限交易 | [34] §Specification；[35] Included EIPs，访问于 2026-10-27 | observed | |
| S53 | Fusaka 于 2025-12-03 上主网；BPO1（2025-12-09）把 blob target/max 调到 10/15，BPO2（2026-01-07）调到 14/21 | [35] §Activation / §BPO；[42]，访问于 2026-10-27 | observed | |
| S54 | Fusaka 包含 EIP-7935（默认 gas limit 60M）与 EIP-7825 | [35] §Included EIPs，访问于 2026-10-27 | observed | |
| S55 | Solana 区块 CU 上限从 50M 提到 60M（SIMD-0256，2025-07-22），再提到 100M（SIMD-0286，2026-07-29），单账户写入上限保持 12M | [17] §Technical Details，访问于 2026-10-27 | observed | |
| S56 | Solana slot 时间按 SIMD-0525 分四步从 400ms 降到 200ms，2026-10-09 完成 | [16] 页首与激活表，访问于 2026-10-27 | observed | |
| S57 | Firedancer 在 epoch 1065 约占 Solana 17% 活跃质押，但这与 S28 矛盾，未核实 | [41]（二手）；与 [14] 矛盾 | speculative | U |
| S58 | 执行与共识解耦扩大了执行预算，代价是状态根滞后、准入基于旧状态而需改规则、执行分歧发现更晚、用户可见语义改变 | 由 S41–S45 推出：三者都靠“先定序、后承诺”换预算，并都用额外规则补准入 | inferred | F6 |
| S59 | 提高 L1 区块容量受验证者重放与追赶能力约束，大区块会拖慢重放、延长落后节点的追赶时间 | [17] §Performance Considerations；[34] §Motivation（Validation Overhead），访问于 2026-10-27 | observed | F2 |
| S60 | L2 实时路径可以很快，但持续吞吐受执行、DA 发布与证明/挑战余量中最小者约束 | 由 S2、S5、S7 推出：未在窗口内发布的数据被丢弃，挑战需在期限内完成 | inferred | F2 |
| B1 | OP Stack sequencer 通过 engine_forkchoiceUpdated 携带 payloadAttributes 启动构建，再用 engine_getPayload 取回封好的块；attributes 里的 transactions（deposit 等）必须排在最前，txpool 交易接在后面 | https://specs.optimism.io/protocol/exec-engine.html（engine_forkchoiceUpdated / getPayload / noTxPool 各节，访问于 2026-10-27） | observed | F7 |
| B2 | Base 测得归档节点上 Geth 的区块构建 p50/p99 为 374ms/2319ms，Reth 为 260ms/698ms（Base 自测，2024-12） | https://blog.base.dev/scaling-base-with-reth（benchmark 表，访问于 2026-10-27） | observed | F7 |
| B3 | Base 主网上每个 Flashblock 计算一次 state root 平均约 130ms，让构建时间逼近 200ms | https://blog.base.dev/flashblocks-deep-dive（Optimizing State Root Calculation，访问于 2026-10-27） | observed | F7 |
| B4 | Base 把 state root 改到最终区块上、由 op-geth 通过额外一次 FCU 计算后，Flashblock 构建 P50 从 150ms 降到 10ms | https://blog.base.dev/flashblocks-deep-dive（同节，访问于 2026-10-27） | observed | F7 |
| B5 | OP Mainnet 的 op-rbuilder 是 IO 密集型；使用网络附加 SSD 时区块时间偶尔退化到 2.5–3s，换成 NVMe 后恢复 | [4] Performance Enhancements / Measured Impact | observed | F7 |
| B6 | Mantle v1.6.3 Elysium 启用了 eager next-block construction，用来缩短“封上一块”到“开始接收下一块交易”之间的空窗 | https://github.com/mantle-xyz/mantle-v2/releases（1.6.3 Elysium，Sequencer and preconfirmations，访问于 2026-10-27） | observed | |
| B7 | RISE 的 shreds 不做 merkleization，只记录 ChangeSet 承诺；整个 L2 区块的 merkleization 推迟到最后一个 shred 之后 | https://blog.risechain.com/incremental-block-construction/（Shred 定义，访问于 2026-10-27） | observed | F1, F11 |
| B8 | OP Stack 中影响用户感知延迟的关键路径是“等待出块时隙 + 执行 + 封块算 state root + gossip”；DA 发布和证明不在实时路径上，但会限制持续吞吐 | 由 B1、B2、B3、B36 推出：Engine API 串行封块，state root 和存储 IO 主导尾延迟，DA 限流是事后约束 | inferred | F7 |
| B9 | “共识阶段占出块时间 40%–80%、执行最坏只占 8%”这组数字只出现在内部研究《Rise Chain 中对区块构建的设计》(Notion) 引用的 RISE 白皮书里，在 RISE 博客中未能复核 | 内部研究《Rise Chain 中对区块构建的设计》(Notion)；[6] 只给出“merkleization 最多占 75%” | speculative | R, F18 |
| B10 | Base 主网 2s 区块被切成 10 个 200ms Flashblock，第 j 个 Flashblock 最多使用 j/10 的区块 gas | https://docs.base.org/base-chain/flashblocks/faq（Key Concepts / Block Building，访问于 2026-10-27） | observed | |
| B11 | Base 的 Flashblock 一旦构建并广播，交易顺序即锁定，后到的高优先费交易不能插入更早的 Flashblock | https://docs.base.org/base-chain/network-information/transaction-ordering（Flashblocks，访问于 2026-10-27） | observed | T |
| B12 | Azul 后 Base 的执行和共识客户端为 base-reth-node 和 base-consensus，Flashblocks builder 为 Base 维护的 base-builder，rollup-boost 仍由 Flashbots 维护 | https://docs.base.org/base-chain/flashblocks/faq（Architecture 表，访问于 2026-10-27） | observed | |
| B13 | Base 的 Denim 升级用每 200ms 一个的 canonical 区块取代 Flashblocks；2026-10-21 已在 Sepolia 激活，主网目标 2026-11，日期未定 | https://docs.base.org/upgrades/overview（Denim，访问于 2026-10-27） | observed | F8 |
| B14 | Denim 后每个 200ms 区块都有独立的 state root、receipts 和 unsafe/safe/finalized 生命周期，pending 标签和 Flashblocks 订阅不再有等价物 | https://docs.base.org/upgrades/denim/200ms-blocks（Summary / Block lifecycle）；https://docs.base.org/upgrades/denim/migrate-from-flashblocks.md（访问于 2026-10-27） | observed | F8 |
| B15 | OP Labs 用自研的 Subblocks 取代 Flashblocks：subblock 序列只追加，stream 中 state_root 和 block_hash 置零，RPC 节点需自行执行交易得到状态 | https://docs.optimism.io/op-stack/features/flashblocks（How it works / payload，访问于 2026-10-27） | observed | F8, F16 |
| B16 | Subblocks 自 2026-08-31 在 OP Mainnet 运行；最后一条 OP Enterprise 链迁移完成后，OP Labs 停止运行和测试 op-rbuilder，并不再为 Flashblocks 提供支持 | https://docs.optimism.io/notices/preconfirmation-architecture-transition.md（Timeline，访问于 2026-10-27） | observed | F8 |
| B17 | OP Labs 文档写明，subblock 预确认在 sequencer 可以 reorg unsafe 区块的同等条件下可以被撤回，承载的是 sequencer 的信任假设而非协议的；Subblocks 只向 OP Enterprise 客户提供 | https://docs.optimism.io/op-stack/features/flashblocks（Safety and continuity FAQ）；https://docs.optimism.io/chain-operators/guides/features/flashblocks-guide（访问于 2026-10-27） | observed | F1, F8 |
| B18 | Unichain 自 2025-08 起提供 200ms Flashblocks，builder 在 TEE 中运行并执行 priority ordering 规则 | https://blog.uniswap.org/flashblocks-are-live（2025-08-14，访问于 2026-10-27） | observed | |
| B19 | Unichain 区块时间为 1s，Flashblocks 以 out-of-protocol 方式提供 200ms 预确认 | https://developers.uniswap.org/llms.mdx/docs/unichain/technical-information/flashblocks（What Are Flashblocks，访问于 2026-10-27） | observed | |
| B20 | MegaETH sequencer 约每 10ms 产出一个 mini-block、约每 1s 产出一个 EVM block，数据走 EigenDA，争议解决用 Kailua | https://docs.megaeth.com/architecture（访问于 2026-10-27） | observed | |
| B21 | MegaETH 自 Rex5 起由 sequencer 对每个 mini-block 头签名，可以证明 sequencer 作恶；文档写明签名不代表最终性 | https://docs.megaeth.com/mini-block（Sequencer signatures，访问于 2026-10-27） | observed | F8, T |
| B22 | MegaETH 公开主网于 2026-02-09 上线 | https://www.theblock.co/news/ecosystems/2026-02-09-megaeth-debuts-mainnet-389015（二手，只用于日期，访问于 2026-10-27） | observed | |
| B23 | RISE 2026-05-01 博文称 RISE 主网和 RISEx 已上线数周，但只对受邀用户开放；自称 5 Ggas/s、50k TPS（自测） | https://blog.risechain.com/rise-launch-philosophy/（访问于 2026-10-27） | observed | |
| B24 | Arbitrum Timeboost 于 2025-04-17 在 One 上线，以二价密封拍卖出售 60s express lane，其他交易延迟 200ms | https://docs.arbitrum.io/how-arbitrum-works/priority-gas-auction/pga（Why sunset Timeboost，访问于 2026-10-27） | observed | |
| B25 | Arbitrum One 于 2026-09-24 用 PGA 取代 Timeboost：250ms 区块，每块 2 个 125ms 按优先费排序的轮次，满块提前出块，最多每秒 8 块 | https://blog.arbitrum.io/competing-for-transaction-priority-on-arbitrum/；[36] PGA rounds（访问于 2026-10-27） | observed | |
| B26 | 实证研究发现 Timeboost 的拍卖高度集中，三个实体赢得 99.74% 的拍卖（数据截至 2026-04-13） | https://arxiv.org/html/2509.22143v3（摘要，访问于 2026-10-27） | observed | |
| B27 | 在 OP Stack 系 L2 上，增量预确认正在从第三方 sidecar（rollup-boost/op-rbuilder）转向协议内的短区块（Base Denim）或厂商自研实现（OP Subblocks） | 由 B13、B15、B16 推出：两大 OP Stack 运营方在 2026 年都放弃了 op-rbuilder 路线 | inferred | F8 |
| B28 | OP Stack batcher 把 L2 区块编码为 batch，放进 channel 做流式压缩，再切成 frame 提交；Delta 引入 span batch 降低多块开销 | https://specs.optimism.io/protocol/delta/span-batches.html；https://specs.optimism.io/protocol/batcher.html（访问于 2026-10-27） | observed | |
| B29 | Fjord 引入 Brotli channel 压缩和基于 FastLZ 的 L1 费用估算，每笔交易的最小估计大小为 100 字节 | https://specs.optimism.io/protocol/fjord/exec-engine.html（参数表，访问于 2026-10-27） | observed | |
| B30 | 按 OP Stack 的 blob 编码，单个 blob 最多装 130,044 字节 rollup 数据 | https://specs.optimism.io/protocol/ecotone/derivation.html（Blob encoding，访问于 2026-10-27） | observed | F14 |
| B31 | Fusaka 于 2025-12-03 激活 PeerDAS；BPO1（2025-12-09）把 blob target/max 设为 10/15，BPO2（2026-01-07）设为 14/21 | https://blog.ethereum.org/2025/11/06/fusaka-mainnet-announcement（Mainnet BPO Schedule，访问于 2026-10-27） | observed | F14 |
| B32 | 截至 2026-10，BPO3 仍是参数为空的 Draft EIP，最新已生效参数为 BPO2 的 14/21 | https://eips.ethereum.org/EIPS/eip-8138（Specification / Historical Context，访问于 2026-10-27） | observed | |
| B33 | Ethereum blob 当前 DA 容量约为 152 KB/s（target 14）到 228 KB/s（max 21） | 由 B30、B31 推出：14×130,044/12≈151,718 B/s；21×130,044/12≈227,577 B/s | inferred | B, F14 |
| B34 | 按每笔 100 字节算，Ethereum blob 在所有 L2 之间共享时约能支撑 1,500 TPS（target）到 2,300 TPS（max）；按 200 字节算减半 | 由 B29、B33 推出：151,718/100≈1,517，227,577/100≈2,276；100 字节是 Fjord 费用模型的下限，并非实测均值 | inferred | F14 |
| B35 | 对 Base 这种单块约 400M gas / 2s 的链，小额交易的持续吞吐先受 blob 带宽约束，而非 gas | 由 B33、B55 推出：200 Mgas/s ÷ 21k≈9,500 TPS，需要约 950 KB/s DA，是 blob max 的约 4 倍 | inferred | |
| B36 | Base 文档写明，DA 吞吐吃紧时 sequencer 会限制 L2 吞吐让 batcher 追上，期间高优先费的交易也可能被延迟 | https://docs.base.org/specifications/transactions/throughput-and-limits.md（Data Availability Throughput，访问于 2026-10-27） | observed | |
| B37 | EigenDA V2 于 2025-07-30 上主网，自称吞吐 100 MB/s，平均端到端延迟 5s，p99 10s | https://www.eigenlabs.org/blog/introducing-eigenda-v2-on-mainnet-at-100-mb-s（访问于 2026-10-27） | observed | F14 |
| B38 | Celestia 主网当前每块最多 32 MiB，出块约 3s，理论容量约 11 MB/s | https://docs.celestia.org/operate/networks/mainnet-beta（Block size limit / Block time，访问于 2026-10-27）；11 MB/s 为 32 MiB÷3s 的推算 | observed | |
| B39 | EigenDA 的安全阈值是 ETH restakers 与 EIGEN 质押者的法定人数，而不是 Ethereum 共识本身 | EigenDA Docs Overview 搜索摘要（docs.eigencloud.xyz，抓取 403，访问于 2026-10-27）；由 [53] 摘要推出 | inferred | F14 |
| B40 | MigaLabs 实测：BPO1 后每 slot blob 中位数从 6 降到 4，16 个以上 blob 的区块后续漏块率为 0.77%–1.79%，高于约 0.5% 的基线 | https://ethresear.ch/t/blob-analysis-after-fusaka-and-bpo-updates/23853（Key findings，访问于 2026-10-27） | observed | |
| B41 | OP Stack 当前生效的故障证明游戏是 CANNON_KONA（kona-client 跑在 64 位 MIPS Cannon 上），自 Upgrade 19 起为 respected game type | https://docs.optimism.io/op-stack/components/kona-client（访问于 2026-10-27） | observed | |
| B42 | Base 2025-10 写道，optimistic 证明系统下不能产生比证明系统能证明的更多数据；MT+64 Cannon 上线后故障证明不再是瓶颈 | https://blog.base.dev/scaling-base-doubling-capacity-in-30-days（Bottleneck 3，访问于 2026-10-27） | observed | F15 |
| B43 | Base Azul（主网 2026-05-28）采用 TEE + ZK 多证明：两种证明一致时 1 天结算，只有一种时 7 天；ZK 路径无需许可，可推翻 TEE 提案 | https://docs.base.org/upgrades/azul/proofs（Finality Model，访问于 2026-10-27） | observed | F15 |
| B44 | Base Beryl（2026-06-25）把单证明争议的最终化窗口从 7 天降到 5 天，双证明快速路径仍为 1 天 | https://docs.base.org/llms.txt（Beryl / Faster Withdrawals 条目，访问于 2026-10-27） | observed | |
| B45 | OP Succinct 先用 range proof 证明一段 L2 区块，再聚合成一个 aggregation proof 在链上验证，只需改 op-proposer 和链上合约 | https://succinctlabs.github.io/op-succinct/architecture.html（访问于 2026-10-27） | observed | |
| B46 | OP Succinct 公开的证明成本仍是 2024 年的数字（每笔 0.5–1 美分，Base 样本 0.61 美分），时效已过 | https://blog.succinct.xyz/op-succinct（成本表，访问于 2026-10-27） | observed | |
| B47 | BOB 的 Kailua 混合模式：默认 4 天窗口，争议只需证明一个 6 块的 mini proposal（约 3 美元，约 25 万 gas 验证），也可附有效性证明立即最终确定 | https://docs.gobob.xyz/docs/bob-chain/hybrid-chain（访问于 2026-10-27） | observed | F15 |
| B48 | Axiom 自测：OpenVM 2.1 Preview 用 4 张 5090 证明 7,200 个 L1 主网区块，p99 9.7s；用 16 张时 p99 3.7s | https://www.axiom.xyz/blog/2-1（2026-07-29，访问于 2026-10-27） | observed | F15 |
| B49 | Ethproofs 当前处于 security sprint 阶段，受评 prover 的 sub-10s 成功率合计为 69.5%（目标 ≥70%） | https://ethproofs.org/（RTP prover performance，访问于 2026-10-27） | observed | F15 |
| B50 | 若线性外推，以约 200 Mgas/s 运行的 L2 要做实时 ZK 证明，需要的 GPU 约为 L1 实时证明的 40 倍 | 由 B48、B55 推出：L1 约 60M gas/12s=5 Mgas/s，Base 约 200 Mgas/s；线性扩展是未经验证的假设 | speculative | F15 |
| B51 | Jovian 于 2025-12-02 在 Base 主网激活 | https://docs.base.org/upgrades/overview（Jovian，访问于 2026-10-27） | observed | |
| B52 | Jovian 引入 DA footprint block limit：按 FastLZ 估算每笔 DA 字节数并乘以 scalar 计入 blobGasUsed，区块总量不得超过 gasLimit，base fee 更新改用 max(gasUsed, blobGasUsed) | https://specs.optimism.io/protocol/jovian/exec-engine.html（DA Footprint Block Limit，访问于 2026-10-27） | observed | F17 |
| B53 | Jovian 规范说明：此前 L1 DA 吞吐的限制只能靠 batcher-sequencer 限流这种策略手段，会压低 base fee 并引发优先费拍卖 | https://specs.optimism.io/protocol/jovian/exec-engine.html（Rationale，访问于 2026-10-27） | observed | F17 |
| B54 | Base 的最低 base fee 从 2025-12-04 的 200,000 wei 逐步上调到 2026-02-19 的 5,000,000 wei，EIP-1559 denominator 于 2026-02-04 提到 125 | https://docs.base.org/base-chain/network-information/configuration-changelog（访问于 2026-10-27） | observed | |
| B55 | Base 当前单块 gas 预算约 400M（2s 区块），首个 Flashblock 约 40M，EIP-1559 elasticity 为 6 | https://docs.base.org/specifications/transactions/throughput-and-limits.md（Current Limits / Fee Parameters，访问于 2026-10-27） | observed | |
| B56 | Base 改为通过提 gas limit 而不是 gas target 来扩容，target 只在观察到高费用时才提高；同时在做 resource metering 和 mempool 重构 | https://blog.base.dev/scaling-base-doubling-capacity-in-30-days（Our progress / Effort 3，访问于 2026-10-27） | observed | |
| B57 | ArbOS 61 于 2026-08-20 在 Arbitrum One/Nova 激活，节点软件附带多维定价，但官方要求不得启用，并称未来版本会移除 | https://docs.arbitrum.io/notices/arbos61-upgrade-notice（访问于 2026-10-27） | observed | F17 |
| B58 | ZKsync OS 同时计 EVM gas（ergs）和 native resource；native resource 近似证明和发布数据的成本，不够时会补收 gas | https://docs.zksync.io/zksync-protocol/zksyncos/double-accounting（访问于 2026-10-27） | observed | F17 |
| B59 | MegaETH 采用 compute gas + storage gas 双 gas 模型，原因是 base fee 只有 0.001 gwei、单块最多 100 亿 gas，必须单独给状态增长定价 | https://docs.megaeth.com/spec/megaevm/dual-gas-model.md（Motivation，访问于 2026-10-27） | observed | F17 |
| B60 | EIP-7999（统一多维费用市场）仍为 Draft，2026-08 起还在讨论 EVM gas 记账的设计选项 | https://eips.ethereum.org/EIPS/eip-7999；https://ethresear.ch/t/designs-for-evm-gas-accounting-in-eip-7999/25696（访问于 2026-10-27） | observed | F17 |
| B61 | Base 当前 gas target 约为每块 67M gas（约 33 Mgas/s） | 由 B55 推出：400M ÷ elasticity 6；官方未直接给出 target 数值 | inferred | |
| B62 | MegaETH 的 replica 节点直接应用 sequencer 下发的执行结果，不重新执行；full 节点本地重新执行，独立验证每个状态转换 | https://docs.megaeth.com/architecture（RPC Nodes，访问于 2026-10-27） | observed | F16 |
| B63 | MegaETH 提供 stateless validator，可以用 SALT witness 在笔记本级硬件上实时验证主网 | https://docs.megaeth.com/node-operation/stateless-validation.md（访问于 2026-10-27） | observed | |
| B64 | Base 的 Flashblocks-aware 节点最多缓存 5 个区块的 Flashblocks 状态，`eth_call pending` 的区块上下文可能是 N-5，但状态结果包含全部已收到的 Flashblocks | https://docs.base.org/base-chain/flashblocks/faq（RPC FAQ，访问于 2026-10-27） | observed | F16 |
| B65 | 预确认 RPC 和 replica 节点提升了状态新鲜度与响应速度，代价是区块上下文滞后或信任 sequencer 的执行结果，所以响应延迟和状态新鲜度需要分开衡量 | 由 B62、B64、B15 推出：三种读路径各自牺牲一个维度 | inferred | F1, F16 |
| B66 | Base 2025-06 下调的是 gas target（35→25 Mgas/s），同时把 gas limit 从 70 提到 75 Mgas/s；内部研究写成“下调 gas limit”是错误的 | https://blog.base.dev/scaling-base-sustain-10x-growth（访问于 2026-10-27）；对照内部研究《解析 Base 的扩展计划》(Notion) | observed | R, F18 |
| E1 | 2024-04 时，reth 的 state root 计算占封块端到端时间的 75% 以上。 | [1] §Improving the State Commitment（访问于 2026-10-27） | observed | |
| E2 | MegaETH 2024 年测得，在 512 GB 内存服务器上 reth live sync 约 1000 TPS（约 100 Mgas/s），MPT 更新开销约为执行的 10 倍。 | [9] §Understanding Ethereum Execution Client Performance / Updating the state root（访问于 2026-10-27） | observed | |
| E3 | Base 测得：不论哪个执行客户端，存储访问多的区块执行时间约为无存储访问区块的 30 倍；状态访问很少时可达约 500 Mgas/s。 | [5] §Bottleneck 2 Client Execution Speed（访问于 2026-10-27） | observed | F9 |
| E4 | Base 认为存储读写是执行速度的长尾，并为此开发 TrieDB，预计可带来 8–10 倍提升。 | [7] §Effort 2: TrieDB（访问于 2026-10-27） | observed | F9 |
| E5 | Reth 2.0（2026-04）通过跨块保留的 sparse trie 缓存，把主网区块末尾的 state root 计算降到 1–2 ms。 | [2] §Optimising Parallel State Calculation；[3] SparseTrieCacheTask（访问于 2026-10-27） | observed | B, F11, R, F18 |
| E6 | Reth 2.0 的 Storage v2 让普通区块平均持久化时间降到 40 ms，Gigagas 级区块从 8.4 s 降到 0.4 s。 | [2] §Tiered Storage（访问于 2026-10-27） | observed | F12 |
| E7 | Paradigm 表示因 state root 不再是瓶颈，重启 revmc JIT，并计划基于 Glamsterdam 的 BAL 实现完整并行执行。 | [2] §What's Next for Reth（访问于 2026-10-27） | observed | F11 |
| E8 | 在主网回放中，evm2 的解释器优化只带来 4.8%–6.2% 的提升，因为预编译、keccak 和状态操作稀释了解释器收益。 | revm-vs-evm2 台账 H37 [38] | observed | F9 |
| E9 | 对 2026 年的 reth 类客户端，主网区块处理的主要剩余开销是执行期间的状态读取，其次才是解释器计算。 | 由 E3、E4、E5、E8 推出：root 尾巴已降到毫秒级，存储访问使区块慢约 30 倍，解释器优化在主网只有个位数收益 | inferred | F9 |
| E10 | 执行层瓶颈可以分为计算、等待状态、业务串行依赖三类，前两类可用工程手段压缩，第三类需要改变业务或状态布局。 | 由 E3、E8、E18 推出：存储访问与计算的影响可以分开测量，而并行度受依赖链限制 | inferred | |
| E11 | Block-STM 保证并行执行的结果等同于按预定顺序串行执行，32 线程下最高 170k tps（17 倍），竞争负载下为 50k–80k tps。 | [17] Abstract（访问于 2026-10-27） | observed | F1, F10 |
| E12 | Monad 用乐观并行执行生成待定结果，再按顺序合并并检查输入，输入失效就重执行，每笔交易最多执行两次。 | [11] Parallel Execution 页与 FAQ（访问于 2026-10-27） | observed | F10 |
| E13 | Solana 交易要事先声明账户读写，调度阶段按账户加锁；账户已被同批交易锁住时报 AccountInUse。 | [18] §Transaction error reference（访问于 2026-10-27） | observed | F10 |
| E14 | Sui 的 address-owned 对象走快路径不经共识，shared 对象要经共识排序，同一 shared 对象上的竞争会降低吞吐。 | [19] Ownership 表与 Shared 小节（访问于 2026-10-27） | observed | F10 |
| E15 | Sei v6.6 于 2026-08-04 在主网上线 Giga 执行组件 Ares 的第一阶段（Block-STM 风格 OCC，带逐交易回退到 v2 的路径）。 | [20] Status (August 2026) 与 roadmap 表（访问于 2026-10-27） | observed | F10 |
| E16 | Sei Giga 的 5 Ggas/s 来自 40 节点的内部 devnet，不是主网数据；FlatKV 与 LtHash 承诺仍默认关闭。 | [20] Sei Giga at a glance；Flat storage and lattice hashes（访问于 2026-10-27） | observed | |
| E17 | MegaETH 认为 Block-STM 不适合它的低延迟场景，原因是需要每 10 ms 稳定出块并支持交易优先级。 | [9] §parallel EVM 段落（访问于 2026-10-27） | observed | |
| E18 | MegaETH 测得近期以太坊区块（20000000–20010000）的中位并行度小于 2，合并成大批次后也只有 2.75。 | [9]（访问于 2026-10-27） | observed | B, F10 |
| E19 | RISE pevm 在内存态的以太坊主网区块回放中平均约快 2.02 倍，最高 4.32 倍。 | [21] crates/pevm/benches README（访问于 2026-10-27） | observed | F10 |
| E20 | EIP-7928 估计 60–80% 的交易访问互不相交的存储 slot，其余 20–40% 可借助交易后的状态差分并行。 | [22] §Rationale BAL Design Choice（访问于 2026-10-27） | observed | F10 |
| E21 | Mantle 内部 2025-03 测得的 49.10% 依赖率，用的是同发送方、同合约同选择器等启发式标准，不是 slot 级冲突率。 | 内部研究《不同链中交易依赖程度分析》(Notion) [39] §交易依赖标准 | observed | R, F18 |
| E22 | EIP-7928（BAL）状态为 Last Call，截止日期 2026-11-01。 | [22] 页头（访问于 2026-10-27） | observed | F10 |
| E23 | Glamsterdam 于 2026-10-06 在 Sepolia 激活，EIP-7928 在其 Scheduled for Inclusion 名单中。 | [23] 正文与 EIP 清单（访问于 2026-10-27） | observed | |
| E24 | 原定 2026-10-26 的 Hoodi 激活已于 2026-10-22 宣布推迟，原因是需进一步调查 EIP-8037 与主网合约的交互，没有新日期。 | [24]（访问于 2026-10-27） | observed | |
| E25 | 截至 2026-10-27，以太坊主网 Glamsterdam 的激活日期未定。 | [23] “The mainnet activation date has not yet been decided”；[24] | observed | |
| E26 | BAL 让客户端可以并行读盘、并行验证交易、并行计算 state root，并可不执行交易就更新状态。 | [22] Abstract/Motivation；[23] §Block-Level Access Lists（访问于 2026-10-27） | observed | T |
| E27 | geth 开发者测得，在 Pebble 主网库上并发读约 200k QPS 后饱和；带读位置的 BAL（128 线程）比不带读位置的（4 线程）约快 10 倍。 | [26] Concurrent read over the Ethereum mainnet dataset（访问于 2026-10-27） | observed | |
| E28 | reth v2.8.0 已实现基于 BAL 的执行路径并做了优化：300M gas 的 BAL 区块平均执行时间降低 8.41%。 | [4] §Performance（访问于 2026-10-27） | observed | F10 |
| E29 | geth v1.17.9 已为 Hoodi 设置 Amsterdam 激活，并修复了 BAL 相关的并发损坏问题，说明 geth 的 BAL 路径已实现但只在测试网运行。 | [25] §Core（访问于 2026-10-27） | observed | F10 |
| E30 | RISE pevm 仓库未归档，但仍自称 WIP、不可用于生产，最后一次提交在 2026-06-05。 | [21] README；revm-vs-evm2 台账 A30 [38] | observed | |
| E31 | 截至 2026-10-27，reth 和 geth 的 BAL 并行执行在以太坊主网都还没有生效，原因是 Glamsterdam 尚未在主网激活。 | 由 E25、E28、E29 推出 | inferred | F10 |
| E32 | revmc 在 criterion 合成负载上快 1.85–19 倍（Fibonacci 19 倍），但接入 reth 做以太坊 L1 历史同步只快约 1–10%。 | [28] §How fast is it（访问于 2026-10-27） | observed | B, F9, R |
| E33 | Paradigm 2024 年预估 JIT 能让 EVM 执行快约 2 倍，依据是“约 50% 执行时间在解释器”，这一预估在 L1 历史同步实测中没有兑现。 | 由 [1] §JIT 与 E32 推出 | inferred | R |
| E34 | Monad 用优化解释器加自研原生编译器：按累计 gas 选出热点合约，异步编译成 x86-64 并缓存，未编译时走解释器，宣称 gas 和错误语义完全一致。 | [13]（访问于 2026-10-27） | observed | |
| E35 | reth v2.4.0 加入实验性 revmc JIT，需用 `--jit` 参数手动开启。 | reth v2.4.0 release notes（经 newreleases.io 镜像检索，访问于 2026-10-27） | observed | |
| E36 | reth main 已在 2026-10-24 用 evm2 替换 revm；evm2 JIT 默认编译进二进制，运行时默认关闭。 | revm-vs-evm2 台账 A8、A10 [38] | observed | |
| E37 | geth v1.17.9 改用内联 switch 实现 opcode 分发，分发速度提升 16%。 | [25] §Core #35638（访问于 2026-10-27） | observed | |
| E38 | 由于主网负载以状态访问为主，JIT 与解释器优化对整链吞吐的收益很可能只有个位数到低两位数百分比，计算密集型 L2 应用除外。 | 由 E8、E9、E32 推出 | inferred | F9 |
| E39 | 在通用 KV 上存 MPT，读写一个值约需 50 次磁盘操作；按 trie 结构把子树打包进页后，预计可降到约 4–8 次。 | [8] README Overview（访问于 2026-10-27） | observed | F12 |
| E40 | MonadDb 在磁盘和内存中原生实现 Patricia trie，用 io_uring 做异步 IO，可绕过文件系统，并用持久化（不可变）trie 实现顺序写和多版本读。 | [14]（访问于 2026-10-27） | observed | F12 |
| E41 | Monad MIP-8 把 storage trie 改为对 128 个 slot（4096 字节）一页的 BLAKE3 页承诺，使承诺单位与一次 SSD 读一致。 | [14] §Page-based storage state；[15] Specification（访问于 2026-10-27） | observed | F12 |
| E42 | QMDB 论文宣称每次状态访问只需 1 次 SSD 读、更新为 O(1) IO、内存中做 merkleization，吞吐最高为 RocksDB 的 6 倍、NOMT 的 8 倍（作者自测）。 | [29] Abstract（访问于 2026-10-27） | observed | F12 |
| E43 | Commonware 于 2025-12-10 宣布与 LayerZero 合作，把 QMDB 产品化进 Commonware Library。 | [30]（访问于 2026-10-27） | observed | F12 |
| E44 | NOMT 已在 crates.io 发布 1.0.x，内部由 Beatree（键值）和 Bitbox（trie 页）两部分存储组成。 | [31]（访问于 2026-10-27） | observed | F12 |
| E45 | Firewood 在 Avalanche 仍是实验性后端，AvalancheGo 默认数据库仍是 LevelDB。 | [32] Choose your database 表与 FAQ（访问于 2026-10-27） | observed | |
| E46 | Reth 2.0 的 Storage v2 在 MDBX 中只存 hashed state，历史 changeset 移到静态文件，索引移到 RocksDB，并成为新节点默认配置。 | [2] §Tiered Storage；[3]（访问于 2026-10-27） | observed | F12 |
| E47 | geth 的 path-based archive（v1.16+）在主网约需 2 TB，带历史 trie 节点约 6.5 TB；v1.17 起配置 `history.trienode` 后支持历史 `eth_getProof`。 | [27] §Path-Based Archive Node（访问于 2026-10-27） | observed | |
| E48 | QMDB、NOMT、Firewood 的公开性能数字都来自作者自测或早期工程测量，不是 EVM 主网生产数据。 | 由 E42、E44、E45 与 [32] “early engineering measurements” 推出 | inferred | F12 |
| E49 | Monad 的提案只携带 D 块之前的延迟 merkle root，D 目前在测试网和主网均为 3；执行出错的节点会在 D 块后脱离共识并回滚重执行。 | [12] §Delayed Merkle Root（访问于 2026-10-27） | observed | F11 |
| E50 | Monad 因共识只看得到延迟 D 块的状态，引入了 Reserve Balance 规则来约束可打包交易。 | [12] §Reserve balance（访问于 2026-10-27） | observed | |
| E51 | reth 2.0 的 sparse trie 流水线与 payload builder 共享，出块路径和验证路径都能用上后台 root 计算。 | [3] “Shared execution cache and sparse trie pipeline with payload builder”（访问于 2026-10-27） | observed | F11 |
| E52 | EIP-7864（统一二叉树）仍为 Draft，哈希函数未定（BLAKE3、Keccak、Poseidon2 三选一）；它取代 Verkle 的主要理由是 Verkle 依赖不抗量子的椭圆曲线。 | [33] Abstract 注释与 Rationale（访问于 2026-10-27） | observed | F18 |
| E53 | Hegotá 的执行层头条是 Frame Transactions（EIP-8141），共识层头条是 FOCIL，二叉树迁移不在头条中。 | [34] Execution layer / Consensus layer 表（访问于 2026-10-27） | observed | |
| E54 | EIP-7862（Delayed State Root）在 Hegotá 评级中被列为 DFI（暂缓）。 | [34] Execution layer 表 7862 行（访问于 2026-10-27） | observed | F11 |
| E55 | Sei Giga 计划用对区块写日志的 LtHash 摘要取代热路径上的 Merkle state root，状态证明改用逐块更新摘要（BUD）。 | [20] Flat storage and lattice hashes（访问于 2026-10-27） | observed | F11 |
| E56 | 把 root 移出关键路径（延迟 root、后台流水线、写日志摘要）在 2026 年已成为高性能链的共同做法，以太坊 L1 本身则暂未采用协议层延迟 root。 | 由 E5、E49、E54、E55 推出 | inferred | F11 |
| E57 | 自 2025-07-08 起，所有以太坊执行客户端都支持删除 merge 前的区块体和回执，可节省 300–500 GB。 | [35]（访问于 2026-10-27） | observed | F13 |
| E58 | 以太坊完整的滚动式历史过期截至 2025-07 仍在开发中。 | [35] “work on full, rolling history expiry is ongoing” | observed | F13 |
| E59 | EF 无状态团队 2025-12 提出 mark-expire-revive 与 multi-era 两类 state expiry 思路，测得约 80% 的状态一年以上没被访问；该文明确只是提案。 | [36] §State Expiry 与免责声明（访问于 2026-10-27） | observed | F13 |
| E60 | state expiry 截至 2026 年仍处研究阶段，叶级过期提案 EIP-7736 处于 Stagnant。 | [41]（检索摘要，访问于 2026-10-27） | observed | |
| E61 | 截至 2026-01，geth 中状态库约 390 GiB；gas 上限从 30M 提到 60M 后，每日新增状态从约 105 MiB 升到约 326 MiB，年增约 116 GiB。 | [37] Motivation（访问于 2026-10-27） | observed | F13 |
| E62 | Base 测得 geth 归档节点每周增长约 560 GB，reth 约 50 GB；当时 geth 归档占 16.61 TB，reth 占 2.74 TB。 | [6] 对比表（访问于 2026-10-27） | observed | |
| E63 | Base 把“状态与历史增长”列为四大扩容瓶颈之一，并表示下一个长期项目可能是 state expiry。 | [7] §Bottleneck 4（访问于 2026-10-27） | observed | |
| E64 | MegaETH 的 sequencer 规格为 100 核、1–4 TB 内存、10 Gbps，replica 节点为 4–8 核、16 GB。 | [9] 硬件表（访问于 2026-10-27） | observed | F13 |
| E65 | MegaETH 的 replica 节点直接应用 sequencer 发来的执行结果、不重执行；full node 重执行并独立验证每次状态转换。 | [10] §RPC Nodes（访问于 2026-10-27） | observed | |
| E66 | Monad 要求验证者和全节点用相同硬件：16 核、4.5 GHz 以上、32 GB 以上内存、2 TB NVMe 存 TrieDB，并且必须是裸金属。 | [16]（访问于 2026-10-27） | observed | |
| E67 | MegaETH 2024 年的“全部状态可放进 RAM”是以以太坊状态约 100 GB 为前提，而 2026-01 geth 状态库已约 390 GiB。 | [9]；[37] | observed | F13 |
| E68 | 当生产者硬件远高于验证节点时，replica 读到的结果只能信任 sequencer；能独立验证的节点必须在更低硬件上追上生产者吞吐，否则独立验证会长期落后。 | 由 E64、E65、E66 推出 | inferred | |
| E69 | 把状态放进内存只能解决读延迟，不能消除 state root、持久化、状态增长、DA 和证明的成本。 | 由 E2、E6、E61、E67 推出 | inferred | F13 |
| E70 | 2025 年内部研究中“执行时间约为 merkleization 的 1/6–1/10”的结论，在 Reth 2.0 之后已不再成立。 | 由 E2、E5 与内部研究《并行执行和并行 EVM 综述》(Notion) [39] 推出 | inferred | F11, R, F18 |
| E71 | 2025 年内部计划里“Verkle 若在 2025 年引入”没有发生，以太坊状态树路线已转向 EIP-7864 二叉树，且尚未排入分叉。 | 由 E52、E53 与内部研究《性能和 ux 提升计划》(Notion) [39] 推出 | inferred | R, F18 |
| E72 | 内部研究所引 RISE 的“共识占 40–80%、执行最坏只占约 8%”数据找不到可追溯的一手来源。 | 内部研究《并行执行和并行 EVM 综述》(Notion) [39] 只给转述，没有找到对应原文 | speculative | R, F18 |
| E73 | 在 merge 前的以太坊历史区块上，有学术评测测得 PEVM 平均约快 2.73 倍、Block-STM 约 2.68 倍。 | [40]（仅检索摘要，没有全文核对） | speculative | |
| M1 | Mantle 主网升级的 release 序列依次是 Everest（v1.1）、Skadi（v1.3）、Limb（v1.4）、Arsia（v1.5）、Elysium（v1.6） | [1] 各 release 标题（访问于 2026-10-27） | observed | |
| M2 | Everest 在主网启用 EigenDA 替代 MantleDA，同时做 Pectra 适配并废弃 MetaTX | [1] “1.1.1 Mainnet Everest”；[13] | observed | |
| M3 | Skadi 让主网支持 Prague，并给 op-node 新增 optimism_safeHeadAtL1Block，用于更快生成 ZK 证明 | [1] “1.3.1 Mainnet Skadi” | observed | |
| M4 | Limb 主网在 2026-01-14 07:00 UTC 激活，目的是兼容 Osaka/Fusaka | [1] “1.4.2 Mainnet Limb” | observed | |
| M5 | 按 release，Arsia 主网在 L2 时间戳 1776841200（2026-04-22 07:00 UTC）激活 | [1] “v1.5.4 Mainnet Arsia” | observed | F20 |
| M6 | L2BEAT 把 Arsia 记为 2026-04-16（SystemConfig 升级，EigenDA 路径移除），另记 2026-04-24 “Arsia fee mechanics activated”，与 release 日期不一致 | [17] Milestones、Ossification & Updates | observed | |
| M7 | Arsia 在一个时间戳同时激活 Canyon 到 Jovian 共 8 个 OP Stack 分叉，并 rebase 到 op-node v1.16.3 | [1] “v1.5.3 Sepolia Arsia”；[5] OP Stack Fork Alignment | observed | F20 |
| M8 | Arsia 的 batcher 改用标准 OP blob 格式，并支持 span batch 与 Brotli 压缩 | [1] v1.5.3 “op-batcher”；[6] Blob encoding migration | observed | F20 |
| M9 | Arsia 引入“L2 执行 + L1 数据 + operator fee”三段式费用，移除 tokenRatio 乘数，恢复带最低 base fee 的动态 EIP-1559，并把 DA footprint 计入 base fee | [5] Key Changes；[6] | observed | F17, F20 |
| M10 | Arsia 的 EIP-1559 参数、min base fee、DA footprint scalar 由 L1 SystemConfig 设置，经 ConfigUpdate 事件由派生管线带到 L2 | [6] Contract Upgrades / SystemConfig | observed | F17, F20 |
| M11 | Arsia 之前 Mantle 的 L2 base fee 固定为 0.02 gwei | [6] Dynamic EIP-1559 Base Fee；[12] | observed | |
| M12 | Mantle 的 DA 从 EigenDA 迁到 Ethereum blobs；L2BEAT 记录 2026-01-21 起两者并行，2026-04-16 起只用以太坊 DA | [7]；[17] 2026-01-21、2026-04-16 条目 | observed | F20 |
| M13 | v1.6.3 Elysium 包含 eager next-block construction（PR #370，2026-08-26 合并，op-node sequencer 默认开启），用来缩短封块到接收下一块交易之间的空窗 | [1] 1.6.3 “Sequencer and preconfirmations”；[2]；[16] commit 31de5a2 | observed | F20 |
| M14 | Elysium 的官方公告与 changelog 只针对 Sepolia/Hoodi（Sepolia 2026-10-06），文档的主网部署指南仍是 v1.5.4 | [2]；[3]；[14] “Mainnet (v1.5.4)”“Testnet (v1.6.3)” | observed | |
| M15 | 截至 2026-10-27，没有一手来源确认 eager next-block construction 已在主网 sequencer 运行 | 由 M13、M14 推出：功能只随 v1.6.3 发布，而官方只公告了测试网升级 | inferred | F20, T, U |
| M16 | Elysium 保留 Arsia/Osaka 执行规则，不在 Mantle L2 启用 Amsterdam EVM 与 EIP-7928 BAL | [2]；[3] Block header JSON fields | observed | |
| M17 | Mantle 主网出块时间为 2 秒 | research-hub 报告 application-specific-sequencing 台账 M4（mainnet rollup.json block_time=2） | observed | |
| M18 | mantle-xyz/reth 的 mantle-v1.6.2 release（2026-10-12）写明当前 gas limit 为 60M | [15] mantle-v1.6.2 “Consensus impact” | observed | |
| M19 | Limb 起 Mantle 完整区块的 RLP 上限为 8,388,608 字节，reth builder 的可选交易填到 7,388,608 字节为止 | [15] mantle-v1.6.2 #127、#146 | observed | |
| M20 | 按 2 秒出块、60M gas limit 计，Mantle 单块上限对应约 30 Mgas/s 的峰值执行容量；gas target 取决于 elasticity，本路未查到 | 由 M17、M18 推出：60M ÷ 2s；elasticity 见 [6]，当前值无来源 | inferred | |
| M21 | 官方文档仍把 op-geth 列为 sequencer 与 verifier 的执行客户端 | [11] Sequencer / Verifier 两节 | observed | |
| M22 | reth release 称 op-reth-v2.2.1-mantle-arsia.1 是“the build running on mainnet”，mantle-v1.6.2 对“sequencers running preconf”为必需升级 | [15] op-reth-v2.2.1-mantle-arsia.2、mantle-v1.6.2 | observed | |
| M23 | 路线图 2026 H2（未勾选）计划把主网 Sequencer 与 RPC 全面切到 pure Reth，Geth 降为灾备热备 | [4] 2026 H2 “Full-Stack Pure Reth Migration” | observed | T |
| M24 | 推测主网 reth 目前承担 RPC 或部分节点角色，sequencer 仍以 op-geth 为主 | 由 M21、M22、M23 与 research-hub 报告 revm-vs-evm2 台账 M17 推测，无运维侧证据 | speculative | U |
| M25 | Mantle 自 2025-09-16 起用 OP Succinct（SP1）ZK 证明验证新状态根，2025-09-23 起提款期从 7 天改为 12 小时 | [8] Transition Timeline Phase 1–3 | observed | F20 |
| M26 | Mantle 文档说明 12 小时提款期是有意保留的安全缓冲，不是证明耗时；文档没有给出证明时延 | [8] “Why do we choose 12 hours?”；[9][10] 中没有时延数字 | observed | F20, U |
| M27 | Mantle 的证明流水线由 Succinct Proposer 先请求 range proof、再聚合，提交到 MantleSuccinctL2OutputOracle | [10] §2–§4 | observed | |
| M28 | zk 证明路径故障时，Mantle 可以回退到 op-proposer 乐观模式，恢复 7 天挑战期 | [9] Proposer availability and fallback；[17] caveat | observed | |
| M29 | L2BEAT 统计 Mantle 的 batch 数据平均每 8 分 4 秒向 L1 提交一次 | [17] liveness 段 | observed | |
| M30 | Flashblocks 亚秒级流式预确认在路线图 2026 H2 中未勾选，即尚未上线 | [4] “Flashblocks Sub-Second Streaming Pre-Confirmations” | observed | |
| M31 | op-geth 已有白名单（from×to）FIFO preconf 车道和 eth_sendRawTransactionWithPreconf（2025-06-05 合入），主网是否启用未知 | research-hub 报告 application-specific-sequencing 台账 M13、M17、M19、M20、M22 | observed | |
| M32 | 官方文档对排序的说法互相矛盾：Architecture 页说按 base fee 与 priority fee，EIP-1559 Support 页仍写 Tectonic 采用 FIFO、base fee 固定 | [12]；research-hub 报告 application-specific-sequencing 台账 M5 | observed | |
| M33 | op-geth 代码中普通交易按有效小费降序、同价按首次见到的时间排序 | research-hub 报告 application-specific-sequencing 台账 M14（`op-geth/miner/ordering.go:39-69@e33cd26cda`） | observed | |
| M34 | Bybit 2026-10-12 新闻稿称与 Mantle 合作开发 mStocks，目标 11 月上线；1:1 由实股支持，支持 Bybit 上 24/7 转换与 Mantle AMM 池交易，可转入 UTA 作抵押 | [21] “Four Years of TradFi Expansion…” 段（搜索摘录） | observed | U |
| M35 | 截至 2026-10-27，mStocks 尚未上线 | 由 M34 推出：官方目标上线时间是 2026 年 11 月 | inferred | |
| M36 | mStocks 由 BVI 注册的 Halo Prime Limited 以有限追索债务形式发行，Bybit 只提供交易界面与合约运营 | 仅二手报道 [22]，未找到一手文本 | speculative | U |
| M37 | Mantle 路线图 2026 H2 把 Shielded Pool 隐私交易方案与 mStocks 场景 POC 绑在一起 | [4] “Privacy-Compliant Transactions and Tokenized Securities” | observed | |
| M38 | 路线图 2026 H2 的 native AA 项写的是评估 EIP-8130 / 8141，提供代付、session、智能账户；2D nonce 面向高频支付与交易 | [4] “Account Abstraction and High-Concurrency Matching” | observed | T |
| M39 | research-hub 的 native AA 报告建议 Mantle 先做 8130 PoC，以 8141 + 8250 作对照组 | [25] meta.yml summary | observed | T |
| M40 | 路线图 2026 H2 的 Prop AMM 项要求支持高优先级撤单与专用撮合路径 | [4] “Prop AMM High-Performance Matching Infrastructure” | observed | T |
| M41 | JIT Router 没有找到任何公开一手来源 | [4] 中没有；research-hub 报告 revm-vs-evm2 notes-mantle “资料中被修正的地方”第 6 条 | observed | |
| M42 | 发行方最需要纳入确定性与可对账的最终性语义，普通买家需要少签名和报价新鲜，做市商需要撤单优先与低尾延迟，Agent 需要 2D nonce 与限权代付 | 由 M34、M38、M40 推出：按各类用户的动作映射到所需组件属性 | inferred | S |
| M43 | 内部 49.10% 依赖比例用的是同源地址 / 同目标合约且同 selector / ERC20 同目标等启发式口径，不是 storage-slot 冲突率；1h 样本有 77/1800 个无效块 | 内部研究《不同链中交易依赖程度分析》(Notion)“交易依赖标准”、20250323 与 2025.3.24 样本 | observed | F10, R |
| M44 | 内部 53.4% 冲突率（约 1000 块）出自另一份 Lark 文档，本地副本不含其方法，无法复核 | 内部研究《性能和 ux 提升计划》(Notion) 只给出链接 | observed | |
| M45 | 冲突率 49.1% 与 53.4% 不能直接作为并行 EVM 收益上限的依据，需要用真实读写集重测 | 由 M43、M44 推出：口径是启发式的，或方法不明 | inferred | F10, R, F18, T |
| M46 | 内部“Verkle 2025 引入”的前提已经过时：状态树方向转向 binary trie（EIP-7864 Draft，理由中明确不选 Verkle），Elysium 对齐的 Glamsterdam 内容里没有状态树替换 | 由 [20] Rationale 与 [2][3] 的 Glamsterdam 兼容项清单推出 | inferred | R |
| M47 | 内部“中期切换 Reth”的计划处于进行中：reth 已发布并有构建在主网运行，但 sequencer 切换仍未完成 | 由 M22、M23 推出 | inferred | R |
| M48 | 2025 计划里的“小区块 / 流式出块”只被部分实现：eager construction 解决块间空窗，亚秒级子块仍未上线 | 由 M13、M30、M31 推出 | inferred | R |
| M49 | 内部“op-node 不等待当前 L1 deposit”的设想不需要改协议，因为 OP Stack 允许 L1 origin 在 max_sequencer_drift（600 秒）内滞后 | 由 research-hub 报告 application-specific-sequencing 台账 M4（max_sequencer_drift=600）、M9 推出 | inferred | R, F18 |
| M50 | 内部“JIT/AOT 约 2 倍”仍未落地：revmc 仍是 experimental，reth main 的 evm2-jit 默认关闭，Mantle 没有使用 JIT | research-hub 报告 revm-vs-evm2 notes-mantle M-Q2（revmc）与 P2-8 | observed | R |
| M51 | 内部 Arsia 压测文档只有方案与参数（默认档 900 笔清算 + 35 个清算 bot + 100 个套利 bot，压力档 1500/65/300），本地副本没有结果数据 | 内部研究《基于 AAVE 清算的 Mantle Arsia 压测的参数确认模型》(Notion) §0；《基于 AAVE 清算的 Mantle Arsia 压测》(Notion) | observed | |
| M52 | 内部 rsETH 压测方案中，清算交易经 gas padding 后 p50≈864K、p99≈2.2M，Bot / Arb / User 均值约 885K / 78K / 21K，同一 borrower 的分批清算互相串行依赖 | 内部研究《模拟rsETH 清算压力测试方案》(Notion) §3.1 | observed | |
| M53 | 在 60M gas limit 下，一个区块约能容纳 69 笔 p50 清算交易，2 秒出块时约每秒 35 笔，热点 borrower 还会进一步串行化 | 由 M17、M18、M52 推出：60,000,000 ÷ 864,000 ≈ 69，再除以 2 秒 | inferred | |
| M54 | 内部引用的 Base / MegaETH 的 Reth 收益数字来自它们 2024–2025 的负载，不能当作 Mantle 迁移收益，需要在 Mantle 负载上回放实测 | 由内部研究《解析 Base 的扩展计划》(Notion)、《性能和 ux 提升计划》(Notion) 的数据来源推出 | inferred | |
| M55 | OP Succinct 只升级一个链上合约和 op-proposer，不需要改 op-geth、op-batcher、op-node | [19] Overview | observed | F21 |
| M56 | Mantle 的 SP1 证明程序由 Kona 编译而来，派生与执行都在 zkVM 里重做 | [10] Mode A “zkVM executable binary (compiled from Kona)” | observed | F21 |
| M57 | 改变派生规则或状态转换的改动（新交易类型、预编译、gas / 费用规则、区块时间、BAL）要同时改 op-node、op-geth、reth / op-revm、kona，并轮换 SP1 vkey；只改 sequencer 调度、不改变规范结果的改动不需要碰证明 | 由 M55、M56、research-hub 报告 revm-vs-evm2 台账 M11（三处锁步）、[17] vkey 轮换记录推出 | inferred | F21, T |
| M58 | L2BEAT 记录 2026-01-27 有一次 revm hotfix，原因是 revm 中的 Mantle 逻辑与 geth 不一致，导致无法生成对应的 ZKP | [17] 2026-01-27 条目 | observed | F21, T |
| M59 | 排序规则、preconf、Flashblocks、eager build、结果等价的并行执行都属于只改 sequencer 的改动，因为派生不检查顺序、验证者原样重放 batch | 由 research-hub 报告 application-specific-sequencing 台账 M10、M11 与 [16] 的改动文件列表推出 | inferred | F21 |
| M60 | OP Stack 的 output root 由 MPT state_root、MessagePasser 存储根和区块哈希组成，提款对 MPT 存储根做证明，所以更换状态承诺结构会波及 L1 提款证明合约 | [18] Output root construction；由此推出波及 L1 合约 | inferred | F21 |
| K1 | 2026-10-26 16:52 UTC 读取 Mantle 主网：相邻区块时间戳差 2 秒，区块 gasLimit 为 60,000,000 | notes-mainsession.md §2：`cast block latest -r https://rpc.mantle.xyz --json`，head 102451615 | observed | B, D, F19 |
| K2 | Mantle 主网区块 extraData 为 Jovian 格式：EIP-1559 denominator 50、elasticity 4（gas target 15M）、min base fee 50 gwei，当前 base fee 等于 min base fee | notes-mainsession.md §2：extraData `0x01 00000032 00000004 0000000ba43b7400`，baseFeePerGas `0xba43b7400` | observed | B, D, F19 |
| K3 | 过去 24 小时 Mantle 主网平均 gas 利用率约 0.17%（相对 60M 上限），单块最高约 8.4% | notes-mainsession.md §2：24 个窗口 × 1024 块的 `eth_feeHistory` | observed | B, D, F19 |
| K4 | Mantle 公开 RPC 返回 `Geth/v1.17.3`，对应 mantle op-geth v1.6.x 线（v1.6.0–v1.6.3 都基于 geth 1.17.3，v1.5.x 基于 1.16.5） | notes-mainsession.md §2：`web3_clientVersion`；mantle-xyz/op-geth 各 tag 的 `version/version.go` | observed | |
| K5 | 从公开 RPC 无法确认主网 sequencer 的 op-node 版本和是否开启 eager next-block construction | 由 K4、M14、M15 推出：RPC 只暴露执行客户端版本，`optimism_version` 等方法未开放 | inferred | F20, T, U |
| K6 | Mantle 主网 batcher 当前以 type-3 blob 交易提交批次，每笔 1 个 blob，约每 7–8 分钟一笔 | notes-mainsession.md §3：Blockscout API 最近 8 笔；`cast tx 0x02fd…2ad9` | observed | F20 |
| K7 | 内部压测（Mantle Sepolia QA 链，合成 mock 合约，2026-06-24）：三档清算全部完成，链固有确认延迟恒为约 2 秒，饱和吞吐约 29.5M gas/s，峰值利用率 98.4% | notes-mainsession.md §5（mantle-xyz/mantle-performance-test `benchmark/report/qa_liquidation_summary_20260624.md`） | observed | B, F19, U |
| K8 | 同一压测中 bot 端到端延迟从 3.4 秒涨到 18.2 秒，增长部分全部来自自排队与 mempool 积压，最堵 5% 交易等待 26 个满块 | notes-mainsession.md §5 | observed | B, F3, T |
| K9 | 同一压测中 base fee 最高涨 893%，写入端 HTTP 429 率 7.9%（优化前 67%），多 bot 争抢同一 borrower 造成 27–49% 的 guard revert | notes-mainsession.md §5 | observed | F3, T |
| K10 | 压测测到的 29.5M gas/s 约等于 60M gas ÷ 2 秒，即配置的区块 gas 上限，而不是执行层自身的能力上限 | 由 K1、K7 推出；Mantle Sepolia gasLimit 同为 60M（notes-mainsession.md §5 注） | inferred | B, F19 |
| K11 | Mantle 路线图 2026 H1 的分布式 GPU 证明网络只支持 Sepolia 与 QA 网，主网仍在等待 | notes-mainsession.md §6（docs.mantle.xyz roadmap） | observed | T |
| K12 | Mantle 路线图 2026 H2 包括 Glamsterdam 同步，覆盖 Sequencer、Prover、RPC 三类客户端 | notes-mainsession.md §6 | observed | T |
| R1 | Mantle 当前的约束不是吞吐：主网只用了 gas 上限的约 0.17%，短期收益应来自延迟、交易体验和峰值承压，而不是提高 TPS | 由 K3、K7、K8 推出：日常负载距上限两个数量级，压测中延迟增长来自排队 | inferred | F19 |
| R2 | 没有亚秒预确认时，Mantle 单笔交易的确认延迟下限就是 2 秒出块间隔 | 由 K1、K7（链固有段恒为 2 秒）、M30（Flashblocks 未上线）推出 | inferred | T |
| R3 | Mantle 路线图里的“Flashblocks”应当理解为“亚秒预确认”这个能力目标：OP Labs 与 Base 都已在 2026 年离开 rollup-boost / op-rbuilder 这套组件 | 由 B13、B16、B27、M30 推出 | inferred | F8, T |
| R4 | 切换 sequencer 执行客户端的主要风险是执行等价性：Mantle 已出现过 revm 与 geth 不一致导致无法生成 ZKP 的事故 | 由 M58、M57、M21–M23 推出 | inferred | F21, T |
| R5 | 只要 op-geth 仍是受支持的节点客户端，每个改变状态转换的硬分叉都要在 op-geth、reth、kona 三处实现并逐块差分 | 由 M21、M23、M56、M57 推出 | inferred | F21, T |
| R6 | mStocks 四类用户的核心需求（确定性纳入、少签名、状态新鲜、撤单优先、无队头阻塞）主要由账户层、排序和读路径决定，执行吞吐是次要因素 | 由 M42、R1 推出 | inferred | S |
| R7 | 压测暴露的峰值体验瓶颈在入口准入、发送端背压和热点竞争，不在执行 | 由 K8、K9 推出 | inferred | F3, T |
| R8 | 若 Mantle 的 60M gas / 2 秒区块全部装满 21k gas 的小额交易（约 1,430 TPS），按每笔 100 字节需要约 143 KB/s 的 DA，接近全部 L2 共享的 blob target（约 152 KB/s） | 由 K1、B33、B34 推出：30,000,000 ÷ 21,000 ≈ 1,429；× 100 B ≈ 142.9 KB/s；100 字节是下限 | inferred | F14, T |
| R9 | 任何提高 gas 上限、缩短区块或改 STF 的改动都会加大 SP1 证明负载；Mantle 没有公开证明时延，所以证明滞后必须作为每个容量改动的验收指标 | 由 M26、M27、B42、S60 推出 | inferred | F15, T |
| R10 | gas target（15M）、denominator、min base fee 是 SystemConfig 参数，属于成本最低的 B 级改动，可以先用来调整 mStocks 峰值时的拥堵定价 | 由 K2、K9、M10 推出 | inferred | T |
| R11 | 只在 sequencer 内部、结果与串行等价的并行执行是 A 级改动；要让验证端也并行（BAL）就是 C 级硬分叉 | 由 M57、M59、E26 推出 | inferred | T |
| R12 | 并行执行和 JIT 都应设为条件式立项：前者以 slot 级依赖图为门槛，后者以执行 profile 中的计算占比为门槛 | 由 E18–E20、E32、E38、M45 推出 | inferred | F9, T |
| R13 | 更换状态承诺结构是 D 级改动，而以太坊自身的二叉树（EIP-7864）仍是 Draft，所以 Mantle 适合跟随而不是自研 | 由 M60、E52、E53 推出 | inferred | T |
| R14 | 流水线提高稳态吞吐但不缩短单块端到端延迟；预确认提前给出反馈但不加快最终性；并行执行只能利用已经存在的独立工作 | 由 S8、B7、B17、E11 推出 | inferred | F1 |
| R15 | 缩短区块时间能降低平均等待（约为区块间隔的一半），但会增加每秒的固定开销（state root、区块头、持久化、证明）；Base 敢把 canonical 区块缩到 200ms，前提是 state root 已降到毫秒级 | 由 B3、B4、B14、E5 推出 | inferred | T |
| R16 | Mantle reth 基于 reth 2.2.x，已带有 Reth 2.0 的 sparse trie 缓存与 Storage v2；上游 2.8 的 prewarm 复用（+18.58% Mgas/s）和 BAL 路径需要追平才能拿到 | 由 M22（op-reth-v2.2.1-mantle-arsia.*）、E5、E46、E28 推出 | inferred | T |
| R17 | 本报告的短 / 中 / 长期排期是研究者按“收益 × 改动级别 × 依赖”给出的建议，不是 Mantle 已批准的计划 | 由 K12、M23、M30、M38、M40（官方路线图项）与 R1–R16 推出 | inferred | T |
| K13 | Base 的下一个升级 Everest 引入 Base Transactions（EIP-8430）新交易类型，原生支持批量、代付、代币付 gas，激活日期待定 | https://docs.base.org/upgrades/overview（Everest，主会话 fetch，访问于 2026-10-27） | observed | |

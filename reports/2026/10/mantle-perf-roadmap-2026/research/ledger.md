# 论断台账

每条会出现在 explainer 里的论断，都要在这里有一行。
类型：observed（直接观察到，有一手证据）/ inferred（由证据推出）/ speculative（推测，需在页面上标明）。

前缀与分册：K = `notes-main.md`（主会话：部署画像、链上参数、内部压测工具、方法学计算）；P = `notes-preconf.md`（排序、出块、预确认、读路径、网络）；X = `notes-exec.md`（执行、状态、存储、commitment）；D = `notes-da-proof.md`（DA、证明、费用参数、区块空间分配）；U / G / R = `notes-synthesis.md`（草稿陈述、GPT 核对、路线综合）。证据里的 `[n]` 指该分册“来源”一节的第 n 条。

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| K1 | 2026-10-20 确认的 Mantle 生产版本：mantle-v2 v1.6.3、op-geth v1.6.3、reth mantle-v1.6.2（574e7f39）、revm v107-mantle-arsia.2、op-succinct mantle-v1.6.1 | upstream-codebase-fix-alert `config/repos.json@6be759c` 各条 `deployed`（confirmed_by whisker yu） | observed | F2、F5、O |
| K2 | 主网的 sequencer 是 op-geth；主网 mantle-op-reth 是跟随它的候选 sequencer（SEQUENCER_ENABLED=false） | `config/repos.json@6be759c` reth `deployment.notes`（2026-10-27 确认） | observed | B、J、F2 |
| K3 | sepolia-v133 上 mantle-op-reth 是 sequencer | 同 K2 | observed | B、F2 |
| K4 | mainnet-v133 与 sepolia-v133 的 mantle-op-reth 开启了 `--preconf.enable` 与 `--preconf.*` | 同 K2 | observed | F2 |
| K5 | 所有生产 reth 节点设 `--engine.persistence-threshold=0`、`--engine.memory-block-buffer-target=0`（每块持久化），上游默认阈值是 2 | 同 K2 | observed | C、B-4、F7 |
| K6 | 生产 reth 的 MDBX 用默认 Durable 模式，节点不裁剪 | 同 K2 | observed | B-4、F7 |
| K7 | RPC 与 p2p 节点经 `--rollup.sequencer-http` 转发交易，静态 peering（`--disable-discovery`） | 同 K2 | observed |  |
| K8 | 2026-10-27 核对时，生产配置里有 3 项（persistence-threshold=0、preconf.enable、proofs-history）超出开发者第一次给出的答案 | upstream-codebase-fix-alert `docs/DESIGN.md:1355@6be759c` | observed | F7、L |
| K9 | 草稿描述的“reth 执行、op-geth RPC 导入”路径是 reth sequencer 的目标架构，不是当前主网（主网 sequencer 是 op-geth） | 由 K2、草稿 §2.1 推出 | inferred | C、J、F2 |
| K10 | “主网被动测”与“QA 链（reth sequencer）实验”测的是两套 sequencer 实现，分段数据不能直接对照；每组数据都要标出 sequencer 客户端 | 由 K2、K3、K9 推出 | inferred | F2 |
| K11 | op-geth v1.6.3 有另一套预确认实现：白名单 `--txpool.frompreconfs/topreconfs`、`--txpool.allpreconfs`（默认 false）、`--txpool.preconftimeout`（默认 1 s）、`SendRawTransactionWithPreconf` | mantle-xyz/op-geth `cmd/utils/flags.go:437-456`、`preconf/tx_pool_config.go:10-15`、`internal/ethapi/api.go:2297`@e33cd26 | observed |  |
| K12 | 主网 op-geth sequencer 是否开启预确认，公开与部署画像资料都没有记录 | `config/repos.json@6be759c` 只列 reth 节点设置；op-geth 条目无 deployment.notes | observed | C、F3、P |
| K13 | Mantle reth 固定上游 reth v2.2.0（rev 88505c7f） | mantle-xyz/reth `Cargo.toml:9`@574e7f39 | observed |  |
| K14 | reth v2.2.0 默认：persistence 阈值 2；canonical 与已持久化差距超过 16 块时 engine API 停顿；state root task 超时 1 s | paradigmxyz/reth `crates/engine/primitives/src/config.rs:7,10,46`@88505c7 | observed | F7 |
| K15 | 每块持久化时，只有持久化提交长期跟不上（差距累积到 16 块）才会让 engine 停顿；E6–E8 应记录 canonical − persisted 差距、提交耗时与 backpressure 指标 | 由 K5、K6、K14 与 notes-exec X83–X85 推出 | inferred | F7、L |
| K16 | 2026-10-31 主网：gasLimit 60M、denominator 50、elasticity 4（target 15M）、min base fee 50 gwei，base fee 处于下限 | `cast block latest -r https://rpc.mantle.xyz --json`，区块 102640856 的 extraData `0x0100000032000000040000000ba43b7400`、baseFeePerGas 0xba43b7400 | observed | B、F11 |
| K17 | 公开 RPC 节点是 op-geth（Geth/v1.17.3） | `cast rpc web3_clientVersion -r https://rpc.mantle.xyz` | observed | F2 |
| K18 | 最近 24 小时抽样（24,576 块）平均 gas 利用率 0.32%（相对 60M），单块最高 23.5%，没有区块超过 target | `eth_feeHistory` 24 个 1024 块窗口，notes-main §3 | observed | B |
| K19 | Mantle 的输出根由 op-succinct proposer 证明后提交 L1 L2OutputOracle；证明请求经 proof router 默认发往自建 sp1-cluster（8×GPU），失败时切 Succinct 官方网络 | mantle-performance-test `prover-network/README.md@eaf4c5c`（测试环境 sepolia-qa2 的描述） | observed | F8 |
| K20 | 一个证明 range 是 1800 个 L2 块（约 1 小时），只证明 finalized 块 | 同 K19 | observed | F8 |
| K21 | witness 在 proposer pod 内重放生成，`WITNESSGEN_TIMEOUT` 默认 1800 s，router 看不到这一步 | 同 K19 | observed | F8 |
| K22 | gateway 同时只放 1 个 range 和 2 个 agg 进集群，其余排队；agg 在 CPU worker 上包成 Plonk | 同 K19 | observed | F8 |
| K23 | 卡死线 `HANG_TIMEOUT_SECS` 2400 s；熔断为 600 s 内失败 5 次；多次失败后 range 对半拆 | 同 K19 | observed | F8 |
| K24 | 生产证明流水线目前不记录每个 range 的 cycle 数与 prover gas（network 模式字段为 0，自建路径字段为空） | mantle-performance-test `prover-network/collect/README.md@eaf4c5c` | observed | C、F9、M |
| K25 | 证明瓶颈拆解（草稿“统计 zkVM 周期花在哪里”）需要单独的 SP1 execute / cycle tracking 运行，不能从现有生产记录得到 | 由 K24 推出 | inferred | F9 |
| K26 | 主网 2026-09-21～10-10 交易构成（按笔数）：DEX 29%、ERC20 29%、预言机 24%、原生转账 16.5%、批量建合约 1%、部署 0.5% | mantle-performance-test `prover-network/load/README.md@eaf4c5c` | observed | L |
| K27 | 同期主网峰值小时 2.03 TPS；最重 range 6332 笔、2.61B gas | 同 K26 | observed |  |
| K28 | 证明网络发版标准写为“可持续 TPS ≥ 主网峰值小时 × 1.5”，对应 3 TPS 基准负载 | 同 K26 | observed |  |
| K29 | blake2f、BLS12-381、modexp 等在 zkVM 中没有加速的交易，单笔就可能把 range 推过超时，长稳负载没有包含它们 | 同 K26 | observed |  |
| K30 | 草稿 E7 只用 mStocks 类交易组合；当前主网负载以 DEX、转账、预言机为主，单一组合不能代表主网 | 由 K26、草稿 E7 推出 | inferred | L |
| K31 | 最重 range 的平均每块 gas 约 1.45M，是 target 的 9.7% | 由 K27 计算：2.61B / 1800 | inferred |  |
| K32 | 2026-06 清算压测把延迟拆成提交 / 自排队 / mempool 积压 / 链固有四段，链固有约 2 s | mantle-performance-test `benchmark/rsETH_restore_test/08_three_tier_test_plan.md` Q10（main@1214cff） | observed |  |
| K33 | 同一压测文档：跨场景只能比 gas/s 与链固有确认，TPS 与“广播→上链”延迟不可比 | 同 K32，Q11 | observed |  |
| K34 | 清算压测饱和吞吐约 29.5M gas/s，等于配置上限（60M / 2 s），没有测出执行层自身余量 | 姊妹报告 high-performance-chain-roadmap `notes-mainsession.md` §5（K7–K10 行） | observed |  |
| K35 | 40 个区块中超过真实 p99 的期望个数是 0.4，全部不超过真实 p99 的概率是 0.67；40 个满块不能估计区块级 p99 | 计算：0.99^40 = 0.669（notes-main §6） | inferred | B-5、F12 |
| K36 | 900 个区块（2 s × 30 分钟）时，真实 p99 以约 96% 的概率落在第 16 大与第 4 大样本之间，可做区块级 p99 粗筛 | 二项分布次序统计量计算（notes-main §6） | inferred | B-5、F12 |
| K37 | 当前参数下满块使 base fee 每块最多涨 6%，连续 40 个满块后约为 10.3 倍 | EIP-1559 公式 + K16：(60−15)/15/50 = 0.06；1.06^40 = 10.29 | inferred | F11 |
| K38 | 40 个满块后，在近空块下 base fee 回到 50 gwei 下限约需 115 块（约 3.8 分钟） | 计算：ln(10.29)/−ln(1−1/50) ≈ 115（notes-main §6） | inferred | F11、L |
| K39 | 草稿 E8“积压超过 5 分钟才清零”需要区分价格恢复与队列清零：单是 base fee 回落就约 4 分钟 | 由 K38 推出 | inferred |  |
| K40 | 证明网络长稳测试的结果没有提交到仓库，本次无法得到 Mantle 当前证明吞吐数据 | `prover-network/README.md@eaf4c5c`：“某一轮的参数、结果、原始数据……不要提交进本仓库” | observed | P |
| K41 | 主网区块 102640855 中的一笔 ERC-4337 `handleOps` 交易：gasUsed 120,982，DA footprint（blobGasUsed）151,600，scalar 400 | `cast rpc eth_getTransactionReceipt 0x1d3c88a8…87ab -r https://rpc.mantle.xyz`（to = EntryPoint 0x0000000071727De2…，selector 0x765e827f） | observed | I、B-6、F10 |
| K42 | 这笔交易按 Jovian 规则计入 base fee 的是 DA footprint（151,600），不是 gasUsed（120,982） | 由 K41、D20 推出 | inferred | B-6 |
| K43 | 内部证明网络文档描述的是测试环境 sepolia-qa2 的默认值，并写明实际取值以部署配置为准 | mantle-performance-test `prover-network/README.md@eaf4c5c`（“各项的实际取值以部署配置为准”） | observed | F8 |
| P1 | mantle-reth 的 `--preconf.enable` 默认关闭，不传时节点行为等同 upstream op-reth | `cli/src/args.rs` `PreconfArgs::enable` / `into_config`@574e7f3 | observed | D、H、B-3、L |
| P2 | reth 的 `--preconf.all` 只把 `all_preconfs` 设为 true，是资格规则而不是启用开关 | `cli/src/args.rs` `all` 字段；`preconf/src/config.rs` `is_preconf_tx`@574e7f3 | observed | D、B-3 |
| P3 | reth 白名单模式要求 from 与 to 同时命中，合约创建只在 all 模式下合格 | `preconf/src/config.rs` `is_preconf_tx`@574e7f3 | observed |  |
| P4 | reth 预确认客户端超时默认 1s | `preconf/src/config.rs:12`@574e7f3 | observed | B-3 |
| P5 | reth 普通交易 sweep 间隔默认 200ms | `preconf/src/config.rs:21`@574e7f3 | observed | B-3 |
| P6 | reth slot 默认 2s | `preconf/src/config.rs:29`@574e7f3 | observed | B-3 |
| P7 | reth 预确认单笔 gas 上限默认 2,000,000 | `preconf/src/config.rs:36`@574e7f3 | observed | B、B-3、F4、O |
| P8 | reth 预确认每块 gas 预算默认 6,000,000 | `preconf/src/config.rs:43`@574e7f3 | observed | B、B-3、F4、O |
| P9 | reth safety margin 默认 40ms，注释称按目标硬件实测 apply p99 略大取值 | `preconf/src/config.rs:54` 及注释@574e7f3 | observed |  |
| P10 | reth journal 默认每 60s 轮转、上限 1 GiB，broadcast 容量 65536 | `preconf/src/config.rs` `DEFAULT_REJOURNAL_INTERVAL` / `DEFAULT_JOURNAL_MAX_SIZE` / `DEFAULT_BROADCAST_CAP`@574e7f3 | observed |  |
| P11 | reth `validate()` 要求每块预算不小于单笔上限，且 sweep 不大于 slot | `preconf/src/config.rs` `validate`@574e7f3 | observed |  |
| P12 | reth 预算闸门按交易声明的 gasLimit 预判，通过后按实际 gasUsed 累加 | `preconf/src/builder/dispatch.rs:268` 起与 `:346–347`@574e7f3 | observed | L |
| P13 | reth 超时与预算闸门只作用于 source=Rpc 的条目，Replay 条目绕过 | `preconf/src/builder/dispatch.rs` `is_rpc` 与 `:254`@574e7f3 | observed | F4 |
| P14 | reth 合格交易的 gasLimit 超过单笔上限时在交易池校验阶段被拒 | `preconf/src/pool_ext/validator.rs` `validate_transaction`@574e7f3 | observed | F4 |
| P15 | reth pool listener 把任何合格的 pending 交易以 source=Rpc 推入 FIFO | `preconf/src/pool_ext/preconf_pool_listener.rs` `run`@574e7f3 | observed | F4 |
| P16 | reth 无 responder 的 listener 条目以推入时刻作为 inserted_at | `preconf/src/preconf_tx_set.rs` `push_if_absent`@574e7f3 | observed | F4 |
| P17 | reth 普通 best-tx 打包臂跳过所有预确认合格交易 | `preconf/src/builder/payload_builder.rs:747`@574e7f3 | observed | F4 |
| P18 | reth FIFO 条目转为 Timeout / Canceled / Failed 时，回调把交易从交易池删除 | `preconf/src/preconf_tx_set.rs` `pool_evict` 注释；`service_builder.rs` `start`@574e7f3 | observed | F4 |
| P19 | reth 在开启预确认、开 `--preconf.all`、用默认预算时不存在普通执行路径：新进的用户交易受 2M 单笔与 6M 每块预算约束，超预算的被逐出；重放的旧承诺（Replay）不受预算限制 | 由 P2、P12–P18 推出（Replay 例外见 P13） | inferred | C、F4、O |
| P20 | 同 P19 的配置下，每块新进用户交易的执行 gas 最多约 6M（另加少量重放承诺），低于主网 15M target，E7 / E8 按执行 gas 计达不到目标负载 | 由 P8、P19、P55 推出 | inferred | C、F4 |
| P21 | 草稿 E3 在 reth `--preconf.all` 下没有可用的普通交易对照组 | 由 P19 推出 | inferred | F4、O |
| P22 | reth journal 追加只做 write_all 与 flush，不做 sync_all，注释承认断电不耐久 | `preconf/src/journal.rs:234–235` 与 `append_promised` 文档@574e7f3 | observed | F3 |
| P23 | reth journal 追加失败只记 warn，仍返回预确认回执 | `preconf/src/rpc.rs:245–253`@574e7f3 | observed | F3 |
| P24 | reth journal 在收到执行回执之后、返回客户端之前写入 | `preconf/src/rpc.rs` 回执分支@574e7f3 | observed | F3 |
| P25 | reth journal 条目只含 hash、tx_rlp、预测 block_height、committed_at_ms | `preconf/src/journal.rs` `JournalEntry`@574e7f3 | observed | F3 |
| P26 | reth 启动恢复先 rotate，再重新入池并以 Replay 推入 FIFO，入池失败的条目跳过 | `preconf/src/journal.rs` `restore_preconf_state`@574e7f3 | observed |  |
| P27 | reth 未封装的 journal 条目超过 30 个轮转周期（默认 30 分钟）被放弃并计数 | `preconf/src/service_builder.rs` `from_config`；`journal.rs` `UNSEALED_ABANDON_ROTATIONS`@574e7f3 | observed |  |
| P28 | reth rotate 期间持写锁读写整个文件，append 被阻塞 | `preconf/src/journal.rs` `rotate`@574e7f3 | observed |  |
| P29 | reth 预确认回执在交易应用到在建区块状态后、封块前返回，与普通交易共享同一个在建 State | `preconf/src/builder/payload_builder.rs` 模块文档@574e7f3 | observed |  |
| P30 | reth 在建 job 被丢弃时，已成功的预确认条目以 Replay 在下一块重放 | `preconf/src/builder/payload_builder.rs` `replay_fifo_carryover`@574e7f3 | observed |  |
| P31 | reth 重组时 canon handler 只打 warn、不恢复，注释承认 block_height 可能漂移 | `preconf/src/canon_handler.rs` `observe_reorg`@574e7f3 | observed |  |
| P32 | 预确认线上状态只有 success / failed / timeout / waiting，没有撤销态 | `rpc-ext/src/lib.rs` `PreconfStatus`@574e7f3 | observed |  |
| P33 | 预确认回执含 tx_hash、status、reason、预测 block_height、logs，不含 state root 或签名 | `rpc-ext/src/lib.rs` `PreconfTxEvent`@574e7f3 | observed |  |
| P34 | reth 回执经重放、恢复或重组后，最终块号与执行结果可能与回执不同 | 由 P25、P30、P31 推出 | inferred | F3、L |
| P35 | mantle-reth 没有对外暴露预确认后的状态，扩展 RPC 只有 4 个方法 | `rpc-ext/src/lib.rs` `MantleEthApiExt`@574e7f3 | observed | L |
| P36 | reth 跟随节点转发 preconf 请求并记录 `preconf.forward.duration_ms` | `rpc-ext/src/lib.rs` `send_raw_transaction_with_preconf`@574e7f3 | observed |  |
| P37 | reth 现有 preconf 直方图为 api.handle、execute、validate、dispatch.elapsed_at_gate、journal.rotate_duration | `preconf/src/metrics_seed.rs` `HISTOGRAMS`@574e7f3 | observed |  |
| P38 | reth preconf 直方图以 as_millis 截断成整数毫秒 | `preconf/src/builder/dispatch.rs:340`；`rpc.rs` `handle`@574e7f3 | observed | L |
| P39 | reth 现有指标不覆盖 journal 追加、listener 推入、等待构建上下文三段 | 由 P37 与 `metrics_seed.rs` 清单推出 | inferred | J、L |
| P40 | reth 路径下，草稿 E5 中读方只能在下一块封装、传播、导入后读到新状态 | 由 P29、P35 推出 | inferred |  |
| P41 | mantle-v2 包含 op-conductor，用 Raft 选 leader 并保存最新 unsafe 块 | `op-conductor/README.md`@1780605 | observed | F3 |
| P42 | op-node 在封块之后才把 unsafe payload 提交给 conductor | `op-node/rollup/sequencing/sequencer.go` `onBuildSealed`@1780605 | observed | F3 |
| P43 | reth 在建块的预确认承诺只存在于 sequencer 内存与本机 journal，主备切换时没有交接 | 由 P22–P27、P41、P42 推出 | inferred | F3 |
| P44 | pure Reth 切换后，若沿用公开代码并配置 conductor 主备，切换时会出现回执未兑现 | 由 P43 推测，未来部署配置未知 | speculative | F3、P |
| P45 | eager build 参数名为 `--sequencer.eager-build`，环境变量 `OP_NODE_SEQUENCER_EAGER_BUILD`，默认 true | PR #370 diff `op-node/flags/flags.go`（https://github.com/mantle-xyz/mantle-v2/pull/370，2026-10-31） | observed | H、F5、O |
| P46 | eager build 只把下一块构建的起始时间提前到 FCU 时刻，封块时间不变 | `op-node/rollup/sequencing/sequencer.go:476`@1780605；PR #370 Usage | observed | F5 |
| P47 | op-node 在下一个 payload 时间前 50ms 封块（sealingDuration） | `op-node/rollup/sequencing/sequencer.go:25` 与 `onBuildStarted`@1780605 | observed | F5、F12 |
| P48 | eager build 消除的空窗上限约 50ms/块，约占 2s slot 的 2.5% | 由 P46、P47 推出 | inferred | F5、L |
| P49 | 按整体 p99 判读 E2 很可能看不出效果，应按到达相位分桶 | 由 P48 推出 | inferred | F5 |
| P50 | PR #370 于 2026-08-26 合并，改 9 个文件 +112/−1，合并时 reth 验收测试 CI 为 FAILURE | https://github.com/mantle-xyz/mantle-v2/pull/370（2026-10-31） | observed |  |
| P51 | 截至 2026-10-31，mantle-v2 最新 release 是 v1.6.3 Elysium，release notes 列出 #370 | https://github.com/mantle-xyz/mantle-v2/releases（2026-10-31） | observed |  |
| P52 | v1.6.3 要求节点运营者在 L1 Glamsterdam 激活前部署 | 同上 release 页 Warning 段 | observed |  |
| P53 | op-node 以整数秒的 rollup BlockTime 排程出块 | `op-node/rollup/sequencing/sequencer.go:473–474`@1780605 | observed | F14、M |
| P54 | Mantle 引入亚秒 canonical 块需要协议级时间戳改造，不能只改参数 | 由 P53、P59 推出 | inferred | F14、M |
| P55 | Mantle 主网 gasLimit 60M、denominator 50、elasticity 4（target 15M），读取于 2026-10-26 UTC | 姊妹报告 `notes-mainsession.md` §2 | observed | M |
| P56 | 2026-10-26 抽样的 24 小时主网平均 gas 利用率为 0.167% | 姊妹报告 `notes-mainsession.md` §2 | observed | M |
| P57 | 保持每秒 gas 不变改为 200ms 区块，target 约 1.5M、limit 约 6M、reth 预确认预算约 0.6M/块 | 由 P55、P8 按 1/10 换算 | inferred | F14、M |
| P58 | 0.6M/块预算小于 2M 单笔上限，reth 现有 `validate()` 会拒绝该配置 | 由 P7、P11、P57 推出 | inferred | F14、M |
| P59 | Base Denim 每 200ms 一个独立 canonical 块，并用 BaseTime 存款（tx[1]，gas limit 1,000,000）补充毫秒时间 | https://docs.base.org/upgrades/denim/200ms-blocks（2026-10-31） | observed | F14 |
| P60 | Base Denim 于 2026-10-21 18:00 UTC 在 Base Sepolia 激活 | 同上 Warning 段；/upgrades/denim/overview | observed | H、F14 |
| P61 | Base 主网 Denim 是“targeting November 2026”的计划时间，客户端版本未发布 | 同上 Warning 段 | observed | H、F14 |
| P62 | Denim 取代 Flashblocks，激活后 pending 标签与预确认状态没有直接等价物 | https://docs.base.org/upgrades/denim/migrate-from-flashblocks | observed | F14 |
| P63 | Denim 下按 block.number 计时的合约时长缩为 1/10 | https://docs.base.org/upgrades/denim/200ms-blocks “Block-Number-Based Contract Logic” | observed | F14 |
| P64 | 若 denominator 不变，200ms 区块下 base fee 按墙钟计的调整速度约快 10 倍 | 由 P55、P57 与 EIP-1559 公式推出 | inferred | F14 |
| P65 | Base eth_getTransactionCount 页面仍推荐 Flashblocks 的 pending nonce，与 Denim 迁移指引不一致 | https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_getTransactionCount 对比 P62 | observed |  |
| P66 | GPT 以 Base pending-state 作为 E5 的设计参考已过时 | 由 P62 推出 | inferred |  |
| P67 | OP Subblocks 子块 append-only、以 payload_id 加 index 标识，预确认可在放弃或重组在建块时撤销 | https://specs.optimism.io/protocol/subblocks.html（搜索摘录） | observed | L |
| P68 | OP Subblocks 按时间比例释放块 gas | https://docs.optimism.io/app-developers/guides/transactions/subblocks-and-gas-usage（搜索摘录） | observed |  |
| P69 | reth 普通打包臂同样按 t/slot × 块 gas 上限线性释放配额，注释称沿用 op-rbuilder flashblocks 模式 | `preconf/src/builder/payload_builder.rs` `derive_pool_quota_schedule`@574e7f3 | observed |  |
| P70 | OP Mainnet 自 2026-08-31 运行 Subblocks | 姊妹报告 `notes-mainsession.md` §7 | observed |  |
| P71 | Arbitrum feed 消息带单调序号、可续传、缺口从父链回填，feed 是延迟优化而不是真相源 | https://docs.arbitrum.io/run-a-node/run-feed-relay | observed | L |
| P72 | Arbitrum 建议多节点部署时每个数据中心运行一个 feed relay | 同上开头 Warning | observed |  |
| P73 | MegaETH 区分 sequencer、replica（不重执行）与 full node，mini-block 约 10ms、EVM block 约 1s | https://docs.megaeth.com/architecture | observed |  |
| P74 | MegaETH 的 mini-block 头由 sequencer 签名 | https://docs.megaeth.com/mini-block（搜索摘录） | observed |  |
| P75 | 在 MegaETH 的架构、Realtime API、mini-block 文档中没有找到 QUIC 的一手描述 | 2026-10-31 抓取与检索 | observed |  |
| P76 | OP Stack unsafe 块经 P2P 中继，P2P 故障时 unsafe 链会停滞 | pkg.go.dev op-node 包文档（搜索摘录） | observed |  |
| P77 | 草稿“网络优化大多作用于 L1”说得过满 | 由 P42、P71、P73、P76 推出 | inferred |  |
| P78 | E7 / E8 的封块阈值应与 50ms 而非 200ms 挂钩 | 由 P47 推出 | inferred | F12 |
| P79 | reth journal 每 60s 持锁轮转，可能在回执 p99 上造成周期性尖峰 | 由 P10、P28 推测，未测量 | speculative | L、P |
| P80 | Mantle 之前的 bedrock 版本在短区块测试中出块不稳定（作者陈述） | `research/references/drafts.md` 路线表 | speculative | F14、P |
| P81 | op-geth 预确认配置只有 FromPreconfs、ToPreconfs、AllPreconfs、PreconfTimeout（默认 1s），没有单笔上限与每块预算 | `preconf/tx_pool_config.go` `DefaultTxPoolConfig`@op-geth e33cd26 | observed | J、O |
| P82 | op-geth 预确认 FIFO（FIFOTxSet）只在内存中 | `preconf/fifo_tx_set.go`@op-geth e33cd26 | observed | C、J、F3 |
| P83 | op-geth 的 `preconf/` 包没有 journal 文件 | GitHub contents API `/repos/mantle-xyz/op-geth/contents/preconf?ref=e33cd26`（2026-10-31） | observed | J |
| P84 | op-geth 预确认回执来自 preconfChecker 在“块 N+1 影子准入环境”（含预测的 L1 deposit）中的试执行，不是真正在建的区块 | `miner/preconf_checker.go` `Preconf` / `nextBlockEnv` / `UnpausePreconf`@op-geth e33cd26 | observed | C、J、F3 |
| P85 | op-geth 封块后在新环境重放 unsealed preconf txs，重放失败只 warn 并继续 | `miner/preconf_checker.go` `UnpausePreconf`@op-geth e33cd26 | observed | J |
| P86 | op-geth 在 op-node 同步异常、准入环境超过 12s 未更新、L1 head 超过 108s 未更新、L1 origin 落后超过 9 块、或准入环境领先超过 6 块时拒绝预确认 | `miner/preconf_checker.go` `precheck`；`preconf/miner_config.go`@op-geth e33cd26 | observed | J |
| P87 | op-geth 预确认准入环境写死 2s 区块间隔（preconfL2BlockTime = 2） | `miner/preconf_checker.go` `preconfL2BlockTime`@op-geth e33cd26 | observed | J、F14、M |
| P88 | 主网现行的 op-geth 路径中，预确认承诺的耐久性与结果一致性都弱于 reth 路径（没有专门的承诺日志，回执来自影子环境） | 由 P82–P85 对比 P22–P30 推出；未读 ethapi 与 worker 排序 | inferred | J、F3 |
| X1 | mantle-xyz/reth main 的上游 reth crate 钉在 paradigmxyz/reth rev 88505c7f，注释写明等于 v2.2.0。 | `mantle-xyz/reth/Cargo.toml:9,235-237@574e7f3` | observed | B |
| X2 | mantle-xyz/reth 里的 op-reth 层 vendored 自 ethereum-optimism/optimism 的 op-reth/v2.2.1。 | `mantle-xyz/reth/Cargo.toml:4,32@574e7f3` | observed |  |
| X3 | Mantle reth 的 revm 系列与 op-revm 都钉在 mantle-xyz/revm tag v107-mantle-arsia.2。 | `mantle-xyz/reth/Cargo.toml:242-251,264@574e7f3` | observed |  |
| X4 | 该 tag 对应 revm 38.0.0 / op-revm 19.0.0。 | revm-vs-evm2 台账 M1（2026-10-25 核实，Cargo.lock）[26] | observed |  |
| X5 | Mantle reth 的 alloy-evm 用 crates.io 0.34.0，没有 Mantle 补丁；alloy-op-evm 和 op-alloy 来自 mantle-v2 tag mantle-v1.6.3。 | `mantle-xyz/reth/Cargo.toml:257,260-261,267@574e7f3` | observed |  |
| X6 | Mantle reth 对 reth core 的 reth-trie-common、reth-transaction-pool、reth-provider 三个 crate 打了本地补丁。 | `mantle-xyz/reth/Cargo.toml:421-425@574e7f3` | observed |  |
| X7 | reth-provider 补丁用于一个“hashed-snapshot exec-read fix”，计划等上游合入后移除。 | `mantle-xyz/reth/Cargo.toml:116-118@574e7f3` | observed |  |
| X8 | mantle-xyz/reth 最新 release 是 mantle-v1.6.2，于 2026-10-12T08:59:19Z 发布，搭配的 revm / op-revm 仍是 v107-mantle-arsia.2。 | GitHub API `mantle-xyz/reth/releases/tags/mantle-v1.6.2`；Release 正文 [2] | observed |  |
| X9 | op-reth-v2.2.1-mantle-arsia.2（2026-08-26）引入 preconf，并把 revm 从私有 GHSA fork 换成公开的 mantle-xyz/revm tag。 | mantle-xyz/reth Releases 页 [2] | observed |  |
| X10 | Mantle 的费用与协议语义（ARSIA/JOVIAN、BVM_ETH、token_ratio、DA footprint、Arsia 费用校验）实现在 mantle-xyz/revm fork 里。 | `mantle-xyz/op-succinct/Cargo.toml:180-187@6b1cb57` | observed |  |
| X11 | 执行客户端（reth）和 SP1 证明程序（op-succinct）钉在同一个 revm tag v107-mantle-arsia.2。 | `mantle-xyz/reth/Cargo.toml:242@574e7f3`；`mantle-xyz/op-succinct/Cargo.toml:187@6b1cb57` | observed |  |
| X12 | Mantle preconf 子系统直接依赖 op_revm::L1BlockInfo 和 reth_revm::State，迁到 evm2 时这个 crate 也必须移植。 | `mantle-reth/crates/preconf/src/builder/payload_builder.rs:26,51-54@574e7f3` | observed |  |
| X13 | Mantle 迁到 evm2 至少要移植 7 处：op-revm 语义、alloy-op-evm、revm-inspectors、preconf builder、rpc-ext / eth-api 费用估算、txpool 补丁、kona / SP1 证明路径。 | 由 X3、X5、X6、X10–X12 与 [2] 推出：这些位置都直接引用 revm / op-revm 类型或语义，而 v2.9.0 要求定制 EVM / precompile / inspector / executor 移植 | inferred | F13、M |
| X14 | Reth v2.9.0 于 2026-10-29T12:36:47Z 发布。 | GitHub API `paradigmxyz/reth/releases/tags/v2.9.0` `published_at` [8] | observed | B、H、F13 |
| X15 | Reth v2.9.0 用 evm2 替换了 revm（#25002）。 | v2.9.0 发布说明首段 [8] | observed | H、F13 |
| X16 | v2.9.0 发布说明要求 SDK 使用者把自定义 EVM、precompile、inspector 和 executor 移植到 evm2 API；节点运营者不需要改配置。 | v2.9.0 § Action Required 与首段 [8] | observed | F13 |
| X17 | v2.9.0 称 evm2 让 500 个主网区块的执行吞吐 +10.0%、执行时间中位数 −10.5%。 | v2.9.0 首段 [8] | observed | F13 |
| X18 | v2.9.0 称 300M gas 大区块吞吐 +9.3%，开 BAL 时 +6.6%。 | v2.9.0 首段 [8] | observed | F13 |
| X19 | v2.9.0 的发布说明没有给出性能测量的硬件和方法。 | v2.9.0 发布说明全文 [8] | observed |  |
| X20 | v2.9.0 可以降级回 v2.8.1。 | v2.9.0 § Backwards Compatibility [8] | observed |  |
| X21 | OP 上游最新的 op-reth/v2.8.0 于 2026-10-27 发布，基于 reth v2.6.0。 | GitHub API `op-reth/v2.8.0` `published_at 2026-10-27T20:17:18Z`；正文 “Update reth to v2.6.0” [9] | observed | F13 |
| X22 | 截至 2026-10-31，OP 上游 op-reth 的发布版仍在 revm 上，没有跟进 evm2。 | 由 X15、X21 推出：evm2 首次发布于 reth v2.9.0，op-reth v2.8.0 基于更早的 v2.6.0 | inferred | F13 |
| X23 | 姊妹报告 revm-vs-evm2（2026-10-25）“reth main 已切换 evm2 但未发布”的说法已过时。 | 由 X14、X15 推出 | inferred | F13 |
| X24 | Mantle reth（v2.2.0）要拿到上游 evm2，需要跨过 v2.2 到 v2.9 共 7 个小版本，并且 OP 层没有上游实现可以直接复用。 | 由 X1、X14、X22 推出 | inferred | F13、M、O |
| X25 | op-reth v2.8.0 宣布 Storage v1 已弃用，将于 2027 年 1 月 EOL，并在启动时对 v1 库打印警告。 | op-reth v2.8.0 发布说明 § Storage [9] | observed |  |
| X26 | Paradigm 所说的 1–2 ms 指“每个主网区块末尾计算最终 state root 的时间”，前提是跨块常驻内存的 Sparse Trie Cache。 | [10] § Optimising Parallel State Calculation | observed | F6 |
| X27 | Reth 2.0 的性能数字测于 AMD EPYC 4585PX（16 核）、128 GB 内存、NVMe 软 RAID，宣称 1.7 Ggas/s。 | [10] 首段与脚注 1 | observed |  |
| X28 | Reth Storage v2 在 MDBX 中只存 hashed state，历史 changeset 移到 static files，索引移到 RocksDB。 | [10] § Tiered Storage；[11] StorageSettings rustdoc | observed |  |
| X29 | Paradigm 称 Storage v2 下普通区块平均持久化 40 ms，Gigagas 级区块 400 ms，v1 下为 8.4 s。 | [10] § Tiered Storage | observed |  |
| X30 | 新建的 reth 数据库默认 Storage v2；已有数据库沿用元数据里记录的模式，`--storage.v2` 不会改写；可用 `reth db migrate-v2` 迁移。 | [11] reth.rs/run/storage § Defaults | observed |  |
| X31 | 可以用 `reth db settings get` 读出数据库当前的 storage_v2 设置。 | [11] `reth_cli_commands/db/settings.rs` Subcommands::Get | observed |  |
| X32 | 草稿“需要确认 db 是 v1 还是 v2”可以改写为可回答的运维问题：在每个生产 reth 节点上运行 `op-reth db settings get`。 | 由 X30、X31 推出 | inferred |  |
| X33 | Mantle 节点的 datadir 如果从 v1.9.3 时代沿用至今，可能仍是 Storage v1。 | 由 X30 与 [2]（v1.9.3 系列 release）推测，没有生产数据 | speculative | P |
| X34 | Mantle 的 PreconfPayloadBuilder 是 reth_optimism_payload_builder::OpPayloadBuilder 的 fork。 | `payload_builder.rs:1-8@574e7f3` | observed |  |
| X35 | PreconfPayloadBuilder 显式丢弃上游的 CachedReads 复用，每次构建都新建 State<DB>。 | `payload_builder.rs:888-892,928@574e7f3` | observed | F6 |
| X36 | PreconfPayloadBuilder 封块时调用 `builder.finish(state_provider_for_finish, None)`，没有传入预先算好的 state root。 | `payload_builder.rs:1185-1187@574e7f3` | observed | F6 |
| X37 | 没有 `--preconf.enable` 时，Mantle 回退到上游 BasicPayloadServiceBuilder<OpPayloadBuilder>。 | `payload_service_builder.rs:161-182@574e7f3` | observed | F6 |
| X38 | vendored op-reth v2.2.1 的 OpPayloadBuilder 在 build_payload 中丢弃了 BuildArguments 的 execution_cache 和 trie_handle 字段。 | `op-reth/crates/payload/src/builder.rs:230@574e7f3`（`..` 解构）；同文件 `:334-335,356` 表明这两个字段存在 | observed | F6 |
| X39 | vendored op-reth v2.2.1 的 OpPayloadBuilder 封块时同样调用 `finish(state_provider, None)`。 | `op-reth/crates/payload/src/builder.rs:473-474@574e7f3` | observed | F6 |
| X40 | `BlockBuilder::finish` 的 state_root_precomputed 为 None 时，在内部调用 `state_root_with_updates()` 计算 root。 | [7] reth rustdoc（main）；v2.2.0 参数说明称 builder 的 `state_root_with_updates()` 是 “blocking”（`reth-v2.2.0/crates/node/core/src/args/engine.rs:488-489@88505c7`） | observed |  |
| X41 | 上游 reth main 的 Ethereum payload builder 用 execution_cache 构造 CachedStateProvider，并通过 state-root task 的 state hook 加 `finish_with_state_root` 在后台计算 root。 | `paradigmxyz/reth/crates/ethereum/payload/src/lib.rs:162-169,228-235,453-477@84caec5` | observed |  |
| X42 | reth 当 Mantle sequencer 时，不论是否开 preconf，封块时都在区块末尾同步计算 state root，没有用 Reth 2.0 的跨块 sparse trie 流水线。 | 由 X36–X40、X79 推出 | inferred | C、B-4、F6、M |
| X43 | 草稿把“Reth 2.0 已把 root 降到 1–2 ms”当作出块路径的背景，这既不适用于当前的 op-geth sequencer，也不适用于 reth 当 sequencer 时的 Mantle 封块路径。 | 由 X26、X42 与 K 行（主网 sequencer 为 op-geth）推出 | inferred | F1、F6、O |
| X44 | 草稿 E8 的措施“追平上游 reth（prewarm 复用等）”只升级依赖还不够，要让 builder 受益，必须打开 share 参数，并让 Mantle 的 builder 接收和使用 execution_cache 与 trie_handle。 | 由 X38、X41、X79、X80 推出 | inferred | F6、O |
| X45 | reth 当 sequencer 时，`engine_newPayload` 收到自建块，是否跳过重执行或使用 engine 侧 sparse trie，尚未核实。 | 没有直接证据；需要读 v2.2.0 engine tree 的 newPayload 路径或做实测 | speculative | P |
| X46 | 截至 2026-10-31，risechain/pevm README 仍写“work in progress”和“not production ready”。 | [24] README 首段 | observed | F15 |
| X47 | pevm README 自述：以太坊区块平均约快 2 倍，独立 Uniswap swap 的 gigagas 区块快 22 倍，但不足以支撑复杂的节点集成。 | [24] README § Problems | observed |  |
| X48 | Sei v6.6 于 2026-08-04 在主网上线 Ares，Ares 成为升级后节点的默认执行路径。 | [18] Status (August 2026) | observed |  |
| X49 | Mantle 2025 年内部测得的 49.10% 依赖率用的是启发式口径（同发送方、同合约同 selector），不是 slot 级冲突率。 | 姊妹报告 notes-exec E21（2026-10-27，引内部 Notion）[25] | observed | F15 |
| X50 | 重测 Mantle 的可并行度应采集 storage-slot 级读写集，并以 gas 加权的关键路径占比为决策指标，而不是冲突比例。 | 由 X47、X49 与姊妹报告 E18 推出：冲突比例不反映串行链长度 | inferred | M |
| X51 | EIP-7864 的状态是 Draft。 | [16] 页面标题 “[DRAFT]” | observed |  |
| X52 | EIP-7864 的哈希函数尚未确定，候选为 BLAKE3、Keccak、Poseidon2，参考实现暂用 BLAKE3。 | [16] Abstract 注释与 Rationale | observed |  |
| X53 | QMDB 用 append-only 的 twig 式 Merkle 结构，作者宣称吞吐最高为 RocksDB 的 6 倍、NOMT 的 8 倍、每秒 2.28M 次状态更新，摘要没有提到与 MPT 兼容。 | [19] arXiv 2501.05262 摘要 | observed |  |
| X54 | NOMT 是自定义的二叉 Merkle trie 加 DB，README 没有声称产出以太坊 MPT 根。 | [20] README | observed |  |
| X55 | Base TrieDB 把以太坊 MPT 按 4 KB 页存储，哈希仍按 RLP 计算，目标是把单次读写的磁盘操作从约 50 次降到约 4–8 次。 | [21] README § Overview、Storage Layout | observed |  |
| X56 | SALT 是独立的认证 KV：4 层 256 叉静态主 trie 加 SHI 哈希桶，用 IPA/Pedersen 向量承诺，不是以太坊 MPT。 | [22] README § Design | observed |  |
| X57 | SALT 仓库带三份审计报告：Sherlock 2025-09-16、Cantina 2025-10-17、BlockSec 2025-12-15。 | [22] 仓库 `audits/` 目录 | observed |  |
| X58 | Monad MIP-8 让 trie 承诺 {page_index, page}（每页 128 个词、4096 字节，BLAKE3 ISMC），SLOAD / SSTORE 改为按页计 gas，`eth_getProof` 必须更新。 | [17] Specification、Gas Cost、RPC Modifications | observed |  |
| X59 | Sei Giga 设计用对写日志的 LtHash 摘要取代热路径上的 Merkle 根，用 BUD 取代全局状态证明；FlatKV / LtHash 仍由运营者开启，默认关闭。 | [18] § Flat storage and lattice hashes | observed |  |
| X60 | commitment / DB 候选应分为三类：①保持 MPT 承诺的存储优化（Reth Storage v2、Base TrieDB）；②新的认证结构（QMDB、NOMT、SALT、EIP-7864）；③改变承诺粒度或摘要（MIP-8、LtHash）。 | 由 X51–X59 推出 | inferred | F15 |
| X61 | 三类中只有第①类不改变 state root 和 `eth_getProof`；第②③类都需要协议升级，并同步修改 op-geth / reth / kona / 证明程序和桥验证。 | 由 X55、X58、X60 推出 | inferred | F15 |
| X62 | Mantle op-succinct 用 SP1 6.4.0。 | `mantle-xyz/op-succinct/Cargo.toml:194-196@6b1cb57` | observed |  |
| X63 | Mantle op-succinct 通过 alloy-primitives 的 sha3-keccak 特性，加上 sha3（patch-sha3-0.10.8-sp1-6.0.0）与 tiny-keccak 补丁，让 keccak 走 SP1 precompile。 | `mantle-xyz/op-succinct/Cargo.toml:164-166,229-253@6b1cb57` | observed | F9 |
| X64 | Mantle op-succinct 的 Cargo.lock 末尾没有 `[[patch.unused]]` 段，说明锁文件里的 SP1 补丁都被使用了。 | `mantle-xyz/op-succinct/Cargo.lock:13470-13506@6b1cb57`（文件末尾） | observed | F9 |
| X65 | SP1 文档指出：sha3 补丁版本不匹配时 cargo 会静默回落到软件 keccak，而 keccak 驱动 MPT / state root 哈希，会造成大幅 cycle 回退。 | [13] § alloy-primitives keccak256 | observed |  |
| X66 | OP Succinct 的 cost-estimator 会分别报告 oracle verification、derivation 和 block execution 的成本，以及各 precompile 的 cycles。 | [14] cost-estimation-tools.md § Output | observed |  |
| X67 | ethrex 自报：仅优化 trie 实现就让 trie 哈希 cycles 降 75%，预序列化 trie 让总 cycles 降 22%。 | [15] § Optimization Impact | observed |  |
| X68 | 没有找到 Mantle 或 OP Succinct 按 MPT / EVM / 派生拆分的公开证明 profile；草稿“MPT 在 SP1 中有大量 RLP 与 Keccak”目前没有量化依据。 | 由 [13][14] 检索结果推出；需要按 XE-4 实测 | inferred | F9 |
| X69 | 降低 MPT 在 zkVM 中的成本可以先做实现层优化（precompile、trie 缓存、预序列化），不必先更换承诺结构。 | 由 X63、X65、X67 推出 | inferred |  |
| X70 | MegaETH 研究页说 sequencer 配有足够内存装下全部状态（当时以太坊约 100 GB），硬件为 1–4 TB 内存。 | [23] | observed |  |
| X71 | SALT README 说其认证层在 30 亿条 KV 时只需约 1 GB 内存，并消除了状态根更新时的随机磁盘 IO。 | [22] README 首段 | observed |  |
| X72 | 草稿“MegaETH 要把全部状态放进内存，所以需要 state expiry”的因果关系，在 MegaETH 一手材料中找不到依据。 | 由 X70、X71 推出；[22][23] 均没有提到 state expiry | inferred | F15、O |
| X73 | 按 reth 文档，以太坊主网 minimal 节点在 Storage v2 下约 224 GB（v1 为 449 GB），full 节点约 1.02 TB（v1 为 1.46 TB）。 | [11] reth.rs/run/storage § Disk savings | observed |  |
| X74 | 节点占用可以靠 Storage v2、static files 和 pruning / minimal 模式控制，不需要引入 state expiry。 | 由 X28、X73 推出 | inferred | F15 |
| X75 | reth 当 sequencer 时，封块同步 root 的耗时是否在满块下成为瓶颈，目前没有数据；如果是，接入 state-root task 的收益可能大于 evm2 的约 10%。 | 由 X17、X42 推测，需要按 XE-1 实测 | speculative | F6、P |
| X76 | reth v2.2.0 的默认值：持久化阈值 2，backpressure 阈值 16，memory block buffer target 0。 | `reth-v2.2.0/crates/engine/primitives/src/config.rs:7,10,13@88505c7` | observed |  |
| X77 | reth v2.2.0 在以下条件同时满足时才触发持久化：没有正在构建 payload（受 suppress 参数控制）、backfill 空闲、canonical 与已持久化块之差大于持久化阈值。 | `reth-v2.2.0/crates/engine/tree/src/tree/mod.rs:2016-2034@88505c7` | observed |  |
| X78 | reth v2.2.0 的参数说明写明：持久化阈值设为 0 等于“persist blocks as fast as the node receives them”，代价是更频繁的 DB 写入。 | `reth-v2.2.0/crates/node/core/src/args/engine.rs:305-309@88505c7` | observed |  |
| X79 | reth v2.2.0 的 engine 在收到带 attributes 的 FCU 时，只有打开对应参数，才把 execution cache 和 sparse trie handle 放进 BuildNewPayload 交给 builder。 | `reth-v2.2.0/crates/engine/tree/src/tree/mod.rs:3214-3236@88505c7` | observed | F6 |
| X80 | `--engine.share-execution-cache-with-payload-builder`、`--engine.share-sparse-trie-with-payload-builder`、`--engine.suppress-persistence-during-build` 在 v2.2.0 中默认都是 false。 | `reth-v2.2.0/crates/engine/primitives/src/config.rs:239-241@88505c7`；`args/engine.rs:473-512@88505c7` | observed | F6 |
| X81 | 即使打开两个 share 参数，Mantle 现有的两个 builder 也会丢弃 execution_cache 和 trie_handle，所以开关本身不会让 Mantle 封块用上 sparse trie。 | 由 X35、X38、X79 推出 | inferred | F6 |
| X82 | reth v2.2.0 的持久化由独立 OS 线程上的 PersistenceService 执行阻塞 IO，engine 通过 channel 下发 save_blocks。 | `reth-v2.2.0/crates/engine/tree/src/persistence.rs:35-42@88505c7`；`tree/mod.rs:1388-1400` | observed | F7 |
| X83 | reth v2.2.0 同一时间只有一个持久化任务；任务进行中，engine 仍用 select_biased 接收新的 engine 消息，下一块的执行与上一块的持久化并行。 | `reth-v2.2.0/crates/engine/tree/src/tree/mod.rs:1388-1400,614-630@88505c7` | observed | F7 |
| X84 | reth v2.2.0 在“持久化进行中且 canonical 与已持久化块之差 ≥ backpressure 阈值”时进入 backpressure，停止读取 engine 输入，只等持久化完成。 | `reth-v2.2.0/crates/engine/tree/src/tree/mod.rs:487-501,545-554,593-608@88505c7` | observed | B-4、F7 |
| X85 | 按默认 backpressure 16、2 s 出块推算，只有单次持久化提交持续约 15 个块间隔（约 30 s）以上，每块持久化才会阻塞 engine；正常情况下它不在封块或校验的关键路径上。 | 由 X76、X83、X84 与 K 行（阈值 0）推出；生产 backpressure 阈值假定为默认 | inferred | F7 |
| X86 | 生产的每块持久化加 Durable 提交，会让持久化线程的磁盘写和执行线程的冷读争用同一块盘，影响程度没有数据。 | 由 X78、X83 与 K 行推测；需要用 commit_duration 和执行时延实测 | speculative | F7、P |
| X87 | reth v2.2.0 已提供 `--engine.suppress-persistence-during-build`，用于短出块链在构建期间推迟持久化；reth 当 sequencer 时可以作为对照项。 | `reth-v2.2.0/crates/node/core/src/args/engine.rs:503-512@88505c7`；`tree/mod.rs:2016-2019` | observed | M |
| X88 | 草稿 E6 / E8 中“导入或封块慢就换 NVMe”的判读，应先用 commit_duration 与 backpressure 指标区分持久化提交和执行冷读，再决定措施。 | 由 X83–X86 推出 | inferred | L |
| D1 | Ethereum BPO1 于 2025-12-09（epoch 412672）激活，blob target/max 为 10/15 | blog.ethereum.org/2025/11/06/fusaka-mainnet-announcement（Mainnet BPO Schedule） | observed |  |
| D2 | BPO2 于 2026-01-07 01:01:11 UTC（epoch 419072）激活，target/max 为 14/21，update fraction 11,684,671 | [1]；eips.ethereum.org/EIPS/eip-8135（Specification 表） | observed |  |
| D3 | EIP-8135 是 “Hardfork Meta – BPO2”，状态 Final，2026-01-24 创建；GPT 用它做 BPO2 来源是对的 | eips.ethereum.org/EIPS/eip-8135（头部） | observed |  |
| D4 | EIP-7892 定义只改 blob target / max / fraction 的 BPO 硬分叉机制，状态 Final（Informational） | eips.ethereum.org/EIPS/eip-7892 | observed |  |
| D5 | BPO3（EIP-8138）截至 2026-10-31 仍是 Draft，激活时间和参数都为空 | eips.ethereum.org/EIPS/eip-8138（Specification 为 TODO） | observed |  |
| D6 | Glamsterdam 于 2026-10-06 在 Sepolia 激活；原定 10-26 的 Hoodi 激活已在 10-22 宣布推迟；主网日期未定 | blog.ethereum.org/2026/10/22/glamsterdam-hoodi-delay；blog.ethereum.org/2026/09/17/glamsterdam-testnet-announcement（激活表 Mainnet TBD） | observed |  |
| D7 | 截至 2026-10-31，Ethereum 主网生效的 blob 参数仍是 BPO2 的 14/21 | 由 D2、D5、D6 推出：此后没有已激活的 BPO 或硬分叉 | inferred |  |
| D8 | 按 OP v0 blob 编码，单个 blob 最多装 130,044 字节 rollup 数据 | specs.optimism.io/protocol/ecotone/derivation.html（“(4*31+3)*1024 = 130048”，长度上限 130048−4） | observed |  |
| D9 | 按 BPO2 和 OP 编码口径，Ethereum blob 容量约 151.7 KB/s（target）/ 227.6 KB/s（max），草稿的 152 / 228 KB/s 正确 | 由 D2、D8 推出：14×130,044/12 = 151,718 B/s；21×130,044/12 = 227,577 B/s | inferred | F10 |
| D10 | 每笔按 100 字节算，全网共享的 blob 约能支撑 1,517 TPS（target）/ 2,276 TPS（max） | 由 D9 推出：151,718/100、227,577/100 | inferred |  |
| D11 | 100 字节是 Fjord 费用估算的单笔下限 minTransactionSize，不是压缩后的实测均值 | specs.optimism.io/protocol/fjord/exec-engine.html（参数表：100、−42,585,600、836,500） | observed | F10 |
| D12 | Mantle batcher 0x2f40…d749 在 2026-10-30 23:55:59 到 10-31 01:55:59 发出 17 笔 type-3 blob 交易（nonce 215092–215108），平均 7.5 分钟一笔 | eth.blockscout.com/api/v2/addresses/0x2f40D796917ffB642bD2e2bdD2C762A5e40fd749/transactions（timestamp、nonce、type） | observed | B |
| D13 | 抽查的 batcher 交易 0x70206c50…ba48 只带 1 个 blob，rollup 数据 6,836 字节，约占 130,044 的 5.3% | eth.blockscout.com/api/v2/transactions/0x70206c50…ba48/blobs（items 只有 1 个；blob 头 0x20 00 001ab4） | observed | B、B-6、F10、O |
| D14 | 该 blob 中 channel frame 数据的首字节是 0x01，即 Brotli 压缩的 channel | 同 D13：frame_data_length 0x1a9c 之后首字节为 0x01；Fjord 规定 0x01 为 Brotli 版本前缀 | observed | O |
| D15 | Mantle 每天约发 192 个 blob，约占 Ethereum target 容量（100,800 个/天）的 0.19%；按字节约占 0.01% | 由 D2、D12、D13 推出：86,400/450 = 192；7,200×14 = 100,800；约 1.3 MB/天对比约 13.1 GB/天 | inferred |  |
| D16 | batcher 交易平均间隔约 37 个 L1 区块，可能由 Granite 超时 50 减 sub-safety-margin 10 再减 origin 滞后决定，也可能是显式的 max-channel-duration | [9] 区块号差 34–41；生产配置未公开 | speculative | P |
| D17 | Granite 把 CHANNEL_TIMEOUT 从 300 个 L1 区块降到 50 个 | specs.optimism.io/protocol/granite/derivation.html | observed |  |
| D18 | mantle-v2 op-batcher 的代码默认值为 zlib、shadow 压缩器、singular batch、calldata、max-channel-duration 0、target-num-frames 1、sub-safety-margin 10；这些默认值不等于生产配置 | mantle-v2/op-batcher/flags/flags.go:约 L49–140@1780605 | observed |  |
| D19 | Jovian 对每笔非 deposit 交易计 DA footprint = max(minTransactionSize, FastLZ 估计) × scalar，全块总和写入 blobGasUsed，且必须 ≤ gasLimit | specs.optimism.io/protocol/jovian/exec-engine.html（DA Footprint Block Limit） | observed | F10 |
| D20 | Jovian 起，base fee 更新使用 gasMetered = max(gasUsed, blobGasUsed) | 同 D19 | observed | B-6、F10、L |
| D21 | SystemConfig 的 daFootprintGasScalar 为 0 时默认取 400，mantle-v2 里也写死为 400 | specs.optimism.io/protocol/jovian/l1-attributes.html；mantle-v2/op-node/rollup/derive/l1_block_info.go:55@1780605 | observed |  |
| D22 | daFootprintGasScalar 通过 SystemConfig.setDAFootprintGasScalar(uint16)（onlyOwner）修改，并发出 updateType 7 的 ConfigUpdate 事件 | specs.optimism.io/protocol/jovian/system-config.html | observed |  |
| D23 | 2026-10-31，Mantle 主网的 daFootprintGasScalar 为 400 | 区块 102,640,944 的 L1 info 交易 0x67687e27…f657 calldata 末两字节为 0x0190；回执 0xa75acff5…e311 中 daFootprintGasScalar 为 0x190 | observed | F10 |
| D24 | 一笔 WMNT withdraw 交易的 gasUsed 是 42,365，DA footprint 是 40,000（100 字节下限 × 400） | 回执 0xa75acff5…e311（gasUsed 0xa57d、blobGasUsed 0x9c40） | observed | F10 |
| D25 | 在 60M gasLimit 和 scalar 400 下，每块最多 150,000 估计字节（约 75 KB/s），15M target 对应每块 37,500 估计字节 | 由 D19、D23、D28 推出 | inferred | F10、M |
| D26 | 每估计字节耗 gas 少于 400 的交易（例如 21k 的转账）会先触到 DA footprint 限制，而不是 gas 限制 | 由 D19、D24 推出：footprint 至少 40,000，大于 21,000 | inferred | F10、M |
| D27 | 草稿 E7 的“footprint 先到 → 瓶颈在 DA”说过头：footprint 先到只说明计量约束先收紧，而 Mantle 实际 blob 装载率只有约 5% | 由 D13、D19、D25、D26 推出 | inferred | B-6、F1、F10、M、O |
| D28 | 2026-10-31 02:03 UTC，Mantle 区块 102,640,944 的 extraData 给出 D=50、E=4、最低 base fee 50 gwei，gasLimit 为 60,000,000 | Routescan chain 5000 eth_getBlockByNumber latest | observed |  |
| D29 | 当时 Mantle 的 base fee 正好等于 50 gwei 下限 | 同 D28（baseFeePerGas 0xba43b7400） | observed |  |
| D30 | EIP-1559 中 target = limit // ELASTICITY_MULTIPLIER，base fee 变化量 = base_fee × 偏差 // target // DENOMINATOR | eips.ethereum.org/EIPS/eip-1559（Specification） | observed | F11 |
| D31 | 按 Mantle 现行参数，一个 60M 满块会让下一块的 base fee 上涨 6% | 由 D28、D30、D20 推出：(60−15)/15/50 | inferred | F11 |
| D32 | 连续 40 个满块后，base fee 约为起点的 10.29 倍（+929%） | 由 D31 推出：1.06^40 | inferred | F11 |
| D33 | 突发结束后若为接近空的区块，base fee 每块降约 1.99%，约 116 块（约 3.9 分钟）回到下限 | 由 D30、D32、D36 推出 | inferred | F11 |
| D34 | 降低 elasticity 会降低单块最大涨幅 (E−1)/D：固定 limit 时 target 变高、价格反应变慢；固定 target 时 limit 变低、积压更大；两种情况积压都不会更快清零 | 由 D30 推出：E=2、D=50 时只涨 2% | inferred | F11 |
| D35 | 草稿“提高 denominator 的反应速度”方向写反了：要加快反应应降低 denominator | 由 D30 推出：变化量与 1/D 成正比 | inferred | F11、O |
| D36 | 在 22 小时内抽取的 12 个区块平均 gasUsed 为 84,458（约为 60M 的 0.14%），其中 10 块只有 L1 info deposit | Routescan chain 5000，区块 0x61D9280…0x61E2D30 | observed |  |
| D37 | 抽样利用率（0.14%）低于主会话 24h 全量均值 0.32%，差异来自抽样稀疏；两者都说明主网负载远低于容量 | 由 D36 与 notes-main K 行推出 | inferred |  |
| D38 | Mantle 的 op-succinct fork 跟随上游 v3.12.0，固定 SP1 =6.4.0（Hypercube）和 sp1-cluster v2.7.2 | op-succinct/Cargo.toml:24、193–205@6b1cb57；MANTLE_CHANGES.md §1 | observed |  |
| D39 | Mantle 的 op-succinct 只保留 validity 模式，fault-proof 的 crate 和合约已整体删除 | MANTLE_CHANGES.md §2.3、§3.3@6b1cb57；Cargo.toml:2–15 的 members 中没有 fault-proof | observed | F8 |
| D40 | op-succinct 的 kona 等依赖固定在 mantle-v2 tag mantle-v1.6.3，revm 来自 mantle-xyz/revm v107-mantle-arsia.2 | op-succinct/Cargo.toml（kona-* 条目）@6b1cb57；MANTLE_CHANGES.md §1 | observed |  |
| D41 | L1 上 L2OO（0x31d5…f481）的 latestBlockNumber 为 102,638,546；最近三次 proposeL2Output 各相隔 1,800 个 L2 块（约 1 小时），每次约 431.5k gas，另有约 49k gas 的 checkpointBlockHash | Routescan chain 1：eth_call 0x4599c788 返回 0x61e23d2；txlist（0x61e15c2→0x61e1cca→0x61e23d2） | observed | B、F8 |
| D42 | 最近一次 validity 提交距被证明区间的末块约 40 分钟、距首块约 100 分钟 | 由 D41、D28 推出：提交时间 1793409803；按 2 秒出块推得末块时间为 1793407404 | inferred | B-1、P |
| D43 | Mantle 路线图写明，“分布式 GPU 证明网络”已支持 Sepolia 和 QA，状态为 “Waiting for Mantle Mainnet” | docs.mantle.xyz/network/system-information/roadmap.md | observed | P |
| D44 | 生产版本 mantle-v1.6.1 用的是 SP1 6.4.0 / sp1-cluster v2.7.2 这条线 | 由 MANTLE_CHANGES.md §1 版本表（mantle-v1.6.0 起为 SP1 6.4.0）、§3.5a（v1.6.1 是不含 migration 7 的旧版发布）与 K 行（生产为 v1.6.1）推出；链上 vkey 未读 | inferred |  |
| D45 | op-succinct 证明请求的状态机为 Unrequested → WitnessGeneration → Execution → Prove → Complete → Relayed，并记录三段耗时 | op-succinct/validity/src/db/types.rs:9–24、约 115–117@6b1cb57 | observed | M |
| D46 | range guest 只标了 payload-derivation 和 block-execution 两个 cycle span，MPT / state root 的开销计在 block-execution 里 | op-succinct/utils/client/src/client.rs（约 L74–146）@6b1cb57；state root 在 execute_payload 内，由代码结构推出 | inferred | F9、M |
| D47 | Mantle op-succinct 的 sp1-sdk 开启了 profiling feature | op-succinct/Cargo.toml:194@6b1cb57 | observed |  |
| D48 | SP1 的 cycle-tracker-report 只在开启 profiling 时才会写入 ExecutionReport | docs.succinct.xyz/docs/sp1/optimizing-programs/cycle-tracking | observed |  |
| D49 | SP1 prover gas 从 4.1.4 版起提供，计入了 precompile 的成本差异，量级标定在 cycles 附近 | docs.succinct.xyz/docs/sp1/optimizing-programs/prover-gas | observed |  |
| D50 | MANTLE_CHANGES 记录：sha3 patch tag 与 alloy-primitives 不匹配时，keccak 会悄悄退回软件实现，证明更贵 | MANTLE_CHANGES.md §3.11 trap 4@6b1cb57 | observed |  |
| D51 | 草稿“Mantle 当前性能瓶颈主要在 ZK proof system”目前没有公开证据，需要按 DX4 复现 | 只有作者草稿的陈述 | speculative | F8、P |
| D52 | Base Azul 中 TEE 和 ZK 两种证明都在时 1 天结算，只有一种时 7 天（Beryl 后 5 天），ZK 可以推翻 TEE | docs.base.org/upgrades/azul/proofs | observed | F15 |
| D53 | Base 多证明的官方动机是缩短提款延迟和消除挑战的经济攻击面 | 同 D52（Motivation） | observed | F15 |
| D54 | 多证明改变的是结算规则和信任假设，不会提升 ZK prover 的速度 | 由 D52、D53 推出 | inferred | F15 |
| D55 | Airbender Prime（2026-10-13）用单张 RTX PRO 6000 证明连续 7,200 个 L1 区块，99% 在 10 s 内、全部在 12 s 内（自测） | x.com/zksync/article/2110011544360607842 | observed |  |
| D56 | SP1 Hypercube（2025-11-18）用 16 张 RTX 5090 证明 954 个 L1 区块，99.7% 在 12 s 内、95.4% 在 10 s 内（自测） | blog.succinct.xyz/real-time-proving-16-gpus | observed |  |
| D57 | D55、D56 的 L1 实时证明成绩不能直接换算成 Mantle 的证明能力 | 由 D41、D45、D55、D56 推出：Mantle 证明的是 1,800 块的 OP 派生加定制执行，还有 agg 和 Plonk | inferred |  |
| D58 | Tempo 用 general_gas_limit 限制非支付交易；是否算支付只看交易数据，不读状态 | docs.tempo.xyz/protocol/blockspace/payment-lane-specification | observed |  |
| D59 | Tempo 文档写约 94% 的区块空间留给支付交易，且预留不保证纳入 | docs.tempo.xyz/protocol/fees/spec-fee | observed |  |
| D60 | BSC Payment Lane（BEP-703）默认留出 5% 的 gas、最高 10%，闲置部分不让给普通交易，排序不变 | bnbchain.org/en/blog/payment-lane-how-bsc-reserves-capacity-for-payments（2026-10-28）；Jenner 升级指南（2026-10-22） | observed |  |
| D61 | Jenner 于 2026-10-28 在 BSC 测试网激活，主网时间尚未公布 | 同 D60；docs.bnbchain.org/announce/jenner-bsc | observed |  |
| D62 | 草稿中的 “Binance New L1” 指 BNB Chain New L1：其 Multi-Lane 按 to 地址预留容量，目前只有内部 devnet | bnb-new-l1-deep-dive/research/ledger.md C4、C9、X44–X48（2026-10-24） | observed | O |
| D63 | EIP-2930 的 access list 是可选的，目的是方便预取 | eips.ethereum.org/EIPS/eip-2930 | observed |  |
| D64 | Solana 指令为每个账户声明 is_writable，验证者据此判断哪些交易可以并行 | solana.com/docs/core/instructions/instruction-structure | observed |  |
| D65 | EVM 实现 Solana 式 LFM 的主要障碍是交易没有强制事先声明的写集，只能改交易格式，或者做无状态的 to / 调用形态分类 | 由 D58、D60、D62–D64 推出 | inferred |  |
| D66 | Glamsterdam 的 block-level access list 是出块后按区块生成的，不能直接用作 LFM 的分类依据 | 由 EF Glamsterdam 公告（列出 block-level access lists）与 EIP-7928 的定义推出；EIP 原文本次未打开 | inferred |  |
| D67 | Mantle 主网的 blobBaseFeeScalar 为 0、baseFeeScalar 为 168,507，因此 L1 数据费只按 L1 base fee 计价 | L1 info calldata 和回执 l1BlobBaseFeeScalar 0x0；计价结论由 Ecotone 费用公式推出 | inferred |  |
| D68 | 回执中的 l1BlobBaseFee（约 1.45e15 wei）不像真实值，可能是主网 L1 配置只包含 Cancun+Prague blob schedule 造成的 | 回执 0xa75acff5…e311；MANTLE_CHANGES.md §3.1a@6b1cb57 | speculative | P |
| D69 | 每约 7.5 分钟一次的批次发布加上 L1 最终性，构成 validity 证明滞后的下限（op-succinct 默认只证明到 L2 finalized） | op-succinct/validity/src/prom.rs（L2MaxProvableBlock 说明）@6b1cb57，结合 D12；与 K 行“只证 finalized”一致 | inferred |  |
| D70 | 如果生产并发为 1（QA 文档的 gateway 设置与 proposer 默认值都是 1，生产未核实），每个 range 1,800 块（3,600 s 链上时间），持续负载下单个 range 的 witnessgen + 证明墙钟时间必须低于约 3,600 s，否则 range 积压会无界增长；并发大于 1 时，门槛改为“持续证明吞吐 ≥ 出块速度”；witness 1,800 s 超时（QA 值）是另一条边界 | 由 K20–K23、K43、D41、D71 推出 | inferred | B-2、F1、F8 |
| D71 | op-succinct proposer 的 `MAX_CONCURRENT_PROOF_REQUESTS` 代码默认值为 1，并把处于 WitnessGeneration、Execution、Prove 三种状态的请求合并计数 | mantle-xyz/op-succinct `validity/src/env.rs:132`、`validity/src/proposer.rs:1959-1966`@6b1cb57；book/validity/proposer.md:53 | observed | B、F8、M |
| D72 | 如果生产沿用默认值 1（未核实），每个 range 的 witness 生成、执行与证明串行进行，单个 range 的总耗时必须短于约 3600 s 才不积压 | 由 D71、D41、K20 推出；生产取值未知 | inferred | B-2、F8、L |
| U1 | 草稿把路线分成 6 类 11 项（网络广播、出块路径、更短区块、区块空间分配、evm2、pEVM、commitment、DB、state expiry、DA、多证明），并给出短 / 中 / 长期紧急程度 | `research/references/drafts.md` 路线表 | observed | H |
| U2 | 草稿 §2.1 给出 8 个出块路径实验 E1–E8 与“实验结果 → 优化举措”判读表，阈值包括 50 ms、300 ms、200 ms、500 ms、0.1%、5 分钟 | `research/references/drafts.md` §2.1 两张表 | observed | H、F1、L |
| U3 | 草稿称去年调研发现 Mantle 交易依赖程度高，盲目做 pEVM 收益不高（作者陈述，本次未复现） | `research/references/drafts.md` 执行行；口径见 X49 | speculative | P |
| U4 | 草稿称根据之前的压测，Mantle 的性能瓶颈主要在 ZK proof system（作者陈述，没有公开结果） | `research/references/drafts.md` DA/证明行；见 D51 | speculative | F8、P |
| U5 | 草稿 E7 的负载是“mStocks 类交易组合”，E8 是约 40 个满块后停止加压 | `research/references/drafts.md` E7、E8 行 | observed |  |
| G1 | GPT 关于 reth 预确认 journal（flush 不 fsync、追加失败仍返回）的代码发现属实 | 由 P22、P23 核实 | inferred | O |
| G2 | GPT 关于 `--preconf.all` 污染 E3 对照组的发现属实，但低估了影响：开启后不存在普通路径，还受 2M / 6M 上限约束 | 由 P15–P21 核实 | inferred | F4、O |
| G3 | GPT 没有发现主网 sequencer 仍是 op-geth，也没有区分 op-geth 与 reth 两套预确认实现 | `research/gpt-deep-research.md` 全文无 op-geth 预确认的讨论；对照 K2、K11 | observed | F2、O |
| G4 | GPT 关于 Reth v2.9.0 切换 evm2 的日期与 breaking 范围属实 | 由 X14–X16 核实 | inferred | O |
| G5 | GPT 用 Base pending-state 作为 E5 状态流参考已过时（Denim 取消 pending 状态） | 由 P62、P66 推出 | inferred | O |
| G6 | GPT 的 152 / 228 KB/s 复核、EIP-8135 引用、DA footprint scalar 语义、EIP-1559 参数方向修正都属实 | 由 D3、D9、D19–D21、D35 核实 | inferred | F11、O |
| G7 | GPT 称 BSC Payment Lane 于 2026 年 9 月公布，本次找到的一手来源都是 2026-10 | 由 D60、D61 推出 | inferred | O |
| G8 | GPT“不宜再笼统写成 MDBX v1 还是 v2”说过头：Storage v1 / v2 是 reth 官方术语，可以用 `db settings get` 直接回答 | 由 X30–X32 推出 | inferred | O |
| G9 | GPT 没有发现 Mantle 的两个 payload builder 都不接入 sparse trie / execution cache，也没有提到生产每块持久化 | `research/gpt-deep-research.md` §2.4、E11 只讨论上游能力；对照 X42、K5 | observed | O |
| R1 | 草稿的三条主线成立：先测出块路径、不直接套用外部链的性能结论、把 RPC / DA / 证明滞后一起纳入观察 | 由 U2 与 K10、X43、D27、D70 的核对结果推出（外部结论确实不能直接套用） | inferred | F1 |
| R2 | 每个实验都要写明 sequencer 的执行客户端（op-geth 或 reth）与预确认模式，否则数据不能对照 | 由 K2、K3、K10、P88 推出 | inferred |  |
| R3 | 预确认承诺审计（E4）应提前为上线门槛，并对 op-geth 与 reth 两条路径分别做 | 由 P22–P27、P43、P82–P88 推出 | inferred | N |
| R4 | reth 接任主网 sequencer 之前，至少要完成三件事：重设预确认资格与预算、通过 E4、测清封块 root 与持久化耗时 | 由 P20、R3、X42、X75、K5 推出 | inferred | F4、N |
| R5 | 证明流水线诊断应从中 / 长期提前到短期：持续性门槛可以直接检验（并发为 1 时单个 range < 约 3,600 s；否则持续证明吞吐 ≥ 出块速度），数据大多已有 | 由 D70、D72、D41、D45、K24 推出 | inferred | N |
| R6 | 存储与持久化盘点应提前到短期：Storage v1 在 2027-01 EOL，生产每块持久化，且生产配置与开发者认知曾不一致 | 由 X25、X31、K5、K8 推出 | inferred | N |
| R7 | DA 计量校准（footprint 普查与估计字节校准）放短期：只需读数据，且决定 E7 的判读 | 由 D24–D27 推出 | inferred | N |
| R8 | evm2 不宜作为“随上游升级”的短期项：先追平仍用 revm 的上游版本，evm2 作为对照组，并优先等 OP 上游 | 由 X17、X22、X24 推出 | inferred | N |
| R9 | 更短 canonical 区块是协议级改造，应放中期，并以“每秒工作量相同”为对照 | 由 P53、P54、P57、P58、P63、P64、P87 推出 | inferred | N |
| R10 | 区块空间分配（LFM / lanes / ASS）维持长期，近期只做需求分析 | 由 K18、D65 推出 | inferred | N |
| R11 | pEVM 维持中 / 长期，先用 slot 级读写集与加权关键路径重测 | 由 X46、X49、X50 推出 | inferred | N |
| R12 | commitment 替换维持长期，按三类拆开，先用证明成本拆分决定是否值得 | 由 X60、X61、X68、X69 推出 | inferred | N |
| R13 | state expiry 维持低优先级，动机应改写为“历史与活跃状态的占用”，可先用 Storage v2 与裁剪解决 | 由 X72、X74 推出 | inferred | N |
| R14 | 多证明（TEE + ZK）应按安全与结算目标单独立项，不算性能优化 | 由 D54 推出 | inferred | N |
| R15 | “网络广播”一行应改写为 L2 的数据分发：unsafe gossip、备机、读副本与订阅者，放中期 | 由 P76、P77、P71、P73、P42 推出 | inferred | N |
| R16 | 草稿的阈值应先作为候选阈值，并绑定测量端点、负载组合与承诺级别；样本量要能估计所报的分位数 | 由 U2、K35、K36、P78、K39 推出 | inferred | F12、L |
| R17 | 当前主网不缺吞吐：平均利用率约 0.3%，最重的证明 range 平均每块只用 target 的约 10% | 由 K18、K31 推出 | inferred | F15 |


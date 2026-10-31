# notes-main：主会话核对（部署画像、链上参数、内部压测工具、方法学计算）

调研日期 2026-10-31（UTC 02:00 前后）。台账前缀 K。

## §1 生产部署画像（作者维护的 upstream-codebase-fix-alert）

来源：`~/Work/src/networks/mantle/upstream-codebase-fix-alert/config/repos.json@6be759c`（github.com/mantle-xyz/upstream-codebase-fix-alert，私有；`deployed` 字段由 whisker yu 于 2026-10-20 确认，reth 的 `deployment.notes` 于 2026-10-27 确认）。

| 组件 | 生产版本 | commit |
|---|---|---|
| mantle-v2（op-node / batcher 等） | v1.6.3 Elysium | 8df5df7b |
| op-geth | v1.6.3 | e33cd26c |
| reth（mantle-op-reth） | mantle-v1.6.2 | 574e7f39 |
| revm / op-revm | v107-mantle-arsia.2 | 835cb4eb |
| op-succinct | mantle-v1.6.1 | 8d280ded |

reth 的 `deployment.notes`（原文要点）：
- 生产 op-reth（mainnet-v133、sepolia-v133、mainnetv2；19 个节点）跑镜像 `mantle-op-reth:mantle-v1.6.2`，内置 chain spec，没有 `--config` 文件。
- 没有 `--db.sync-mode`：MDBX 用默认 Durable 模式。
- 不裁剪（no `--full` / `--minimal` / `--prune.*`）。
- **每个节点** `--engine.persistence-threshold=0`、`--engine.memory-block-buffer-target=0`（每块持久化；上游默认阈值 2）。
- rpc45、rpc46（主网）开 `--proofs-history`（窗口 100000）。
- **mainnet-v133 与 sepolia-v133 的 mantle-op-reth 开启 Mantle 预确认（`--preconf.enable` 与 `--preconf.*`）。**
- **sepolia-v133：mantle-op-reth 是 sequencer；mainnet-v133：mantle-op-reth 是跟随 op-geth sequencer 的候选 sequencer（SEQUENCER_ENABLED=false）。**
- RPC 与 p2p 节点用 `--rollup.sequencer-http` 转发交易；静态 peering（`--disable-discovery`，7 个节点 `--trusted-only`）。
- 没有排期 Amsterdam fork，没有 block access list。
- 其余都是 reth 默认值。

DESIGN.md:1355 记录：2026-10-27 核对生产配置时，发现 `--engine.persistence-threshold=0`、`--preconf.enable`、`--proofs-history` 超出了开发者第一次给出的答案。→ 说明“生产配置 ≠ 开发者记忆 ≠ 代码默认值”，草稿 E0 manifest 的必要性有直接证据。

**推断**：主网当前的 sequencer 客户端是 op-geth，不是 reth。草稿 §2.1 写的路径“sequencer txpool → op-node 下发 attributes → reth 执行 → … → RPC 节点（op-geth）导入”描述的是 reth sequencer 的目标架构（与 Mantle 路线图 2026 H2“Sequencer 与 RPC 全面切到 reth”一致，见姊妹报告 K/M 行）。所以“主网被动测”测的是 op-geth sequencer，QA 链（reth sequencer）测的是另一套实现，两者的分段数据不能直接对照。

## §2 op-geth 也有一套预确认实现

`mantle-xyz/op-geth@e33cd26`（v1.6.3，生产版本）：
- `cmd/utils/flags.go:437-456`：`--txpool.frompreconfs`、`--txpool.topreconfs`（白名单地址）、`--txpool.allpreconfs`（所有交易都当预确认）、`--txpool.preconftimeout`。
- `preconf/tx_pool_config.go`：默认 `AllPreconfs=false`、`PreconfTimeout=1s`；`IsPreconfTx` 要求 from 与 to 同时命中白名单，或 AllPreconfs。
- `preconf/miner_config.go`：`EnablePreconfChecker=false`、`ToleranceBlock=6`（注释：6×2 s=12 s 的 Mantle 容忍时长、(6+3)×12 s 的 L1 容忍时长）。
- `internal/ethapi/api.go:2297`：`SendRawTransactionWithPreconf`。
- 主网 op-geth sequencer 是否开启这些参数：部署画像只记录了 reth 节点，op-geth 的预确认参数**未知**（开放问题）。

## §3 链上参数（公开 RPC，2026-10-31 02:00 UTC）

`cast block latest -r https://rpc.mantle.xyz --json`：区块 102640856（时间戳 1793412024 = 2026-10-31 02:00:24 UTC）；gasLimit 0x3938700 = 60,000,000；extraData `0x01 00000032 00000004 0000000ba43b7400` → Jovian 格式：denominator 50、elasticity 4（target 15M）、min base fee 50 gwei；baseFeePerGas 0xba43b7400 = 50 gwei（处于下限）。`web3_clientVersion` = `Geth/v1.17.3-stable-e5fa26ca`。

利用率：`cast rpc eth_feeHistory 1024 <block> '[]'`，从 102640860 向前每 1800 块取一个 1024 块窗口，共 24 个窗口（24,576 块，覆盖 24 小时的约 57%）。gasUsedRatio（相对 60M 上限）平均 **0.32%**，单块最高 **23.5%**（低于 target 的 25%），抽样中**没有一个区块超过 target**。（姊妹报告 10-26 测得 0.167%，同量级。）

## §4 内部压测与证明网络工具（mantle-xyz/mantle-performance-test，私有）

### 4.1 证明网络长稳工具（分支 feat/prover-soak-load @eaf4c5c，2026-10-28）
`prover-network/README.md`：
- 输出根由 op-succinct proposer 生成 ZK 证明后提交到 L1 的 L2OutputOracle。证明原来全部交给 Succinct 官方网络，现在改成“自建为主、出问题时切官方”：proposer → proof router → 默认自建 sp1-cluster（一台 8×GPU 机器），不可用时切官方网络。
- 一个 range = 1800 个 L2 块（约 1 小时）。步骤：等 finalized（batcher 发到 L1 并确认）→ 在 proposer pod 重放 1800 块生成 witness（`WITNESSGEN_TIMEOUT` 默认 1800 s，这一步 router 看不到）→ 上传输入 → router 选后端（熔断：600 s 内失败 5 次打开；`HANG_TIMEOUT_SECS` 2400 s）→ gateway 准入（同时只放 1 个 range、2 个 agg）→ GPU 分片证明，CPU 递归压缩 → agg 包成 Plonk → 提交 L2OO。`PROVING_TIMEOUT` 到时重试，多次失败后 range 对半拆。`RANGE_PROOF_EVM_GAS_LIMIT` 可按累计 gas 截断，默认不启用。
- 测试环境是 sepolia-qa2（2 s 出块，L1 Sepolia）；“各项的实际取值以部署配置为准”。
- 长稳看：L2OO 提交间隔、已证明高度是否越落越远；witness 耗时对超时；range 证明耗时对卡死线；一个周期的总耗时对“每小时一个 range”的节奏。
- `collect/README.md`：network 模式下 proposer 库的 `execution_statistics`、`total_sp1_gas`、`total_instruction_cycles` 都是 0；自建路径上集群库的 `execution_cycles`、`execution_gas` 是空的 → **生产证明流水线目前拿不到每个 range 的 cycle / prover gas**。
- `load/README.md`：主网 2026-09-21～10-10（83.5 万块）的交易构成（按笔数归一化）：DEX swap 29%、ERC20 转账 29%、预言机喂价 24%、原生转账 16.5%、批量建合约 1%、部署合约 0.5%。主网峰值小时 2.03 TPS；最重 range 6332 笔、2.61B gas。基准 3 TPS ≈ 峰值小时 × 1.5，每 range 约 1.08 万笔、约 2B gas；“3 TPS 也正好是发版标准『可持续 TPS ≥ 主网峰值小时 × 1.5』的门槛”。未放 blake2f、BLS12-381、modexp 这类“在 zkVM 里没有加速、单笔就可能把 range 推过超时”的交易。
- `guard.sh`（commit eaf4c5c）：qa2 链头 5 min 不涨或 safe 头 20 min 不涨就暂停负载。
- 本仓库不提交结果（README：“某一轮的参数、结果、原始数据，放在各自的测试记录里”）→ 证明网络长稳的结果不可得。

### 4.2 2026-06 清算压测（main，benchmark/rsETH_restore_test/08_three_tier_test_plan.md Q10/Q11；报告见姊妹报告 notes-mainsession §5）
- 端到端延迟拆成四段：提交 / 自排队 / mempool 积压 / 链固有（≈1 个出块间隔，约 2 s）。老的普通转账压测“广播→上链”= 后三段，饱和时被排队主导。
- 跨场景只能比 gas/s 和链固有确认；纯转账理论上限约 1,428 TPS，纯清算约 33 TPS，gas/s 相同（≈30M）。
- 清算压测：饱和吞吐 ~29.5M gas/s，峰值利用率 98.4%，Bot 端到端 3.4 → 18.2 s（增量来自排队）。

## §5 reth v2.2.0 的持久化参数（Mantle 固定的上游版本）

mantle-xyz/reth `Cargo.toml:9`：reth crates → paradigmxyz/reth rev 88505c7f（= v2.2.0）；revm → mantle-xyz/revm tag v107-mantle-arsia.2。
paradigmxyz/reth@88505c7 `crates/engine/primitives/src/config.rs`：
- L7 `DEFAULT_PERSISTENCE_THRESHOLD = 2`（内存中的 canonical 块超过此数时触发持久化）
- L10 `DEFAULT_PERSISTENCE_BACKPRESSURE_THRESHOLD = 16`（“Maximum canonical-minus-persisted gap before engine API processing is stalled”）
- L13 `DEFAULT_MEMORY_BLOCK_BUFFER_TARGET = 0`
- L46 `DEFAULT_STATE_ROOT_TASK_TIMEOUT = 1s`

**推断**：Mantle 把阈值设为 0，每个块都触发持久化（MDBX Durable 模式）。如果持久化持续慢于出块，canonical 与已持久化之间的差距会增长，超过 16 块时 engine API 停顿 → 封块停顿。所以 E7 / E8 应记录“canonical − persisted 差距”和持久化耗时；这是草稿与 GPT 都没提到的具体指标。阈值设为 0 的原因未知（开放问题：崩溃一致性？RPC 读一致性？）。

## §6 方法学计算（python3，2026-10-31）

- **p99 样本量**：40 个区块中，超过真实 p99 的期望个数 = 0.4；40 个都不超过真实 p99 的概率 = 0.99^40 = 0.669。→ 40 个满块不能估计区块级 p99。
- 900 个区块（2 s 出块 30 分钟）：期望 9 个尾部样本；按次序统计量，真实 p99 以 95.8% 的概率落在第 16 大与第 4 大样本之间。→ 30 分钟足够做区块级 p99 的粗筛，但只有一轮、只有一种负载。
- 200 ms 出块时 30 分钟 = 9000 块。
- **base fee**：elasticity 4、denominator 50 → 满块（60M，target 15M）每块最多涨 (60−15)/15/50 = 6%；连续 40 个满块 → ×1.06^40 = **10.29 倍**（从 50 gwei 下限到约 514 gwei）。之后在近空块（利用率约 1.3% of target）下每块约降 1.97%，回到下限约 **115–117 块（约 3.8–3.9 分钟）**。→ 草稿 E8“积压超过 5 分钟才清零”中，单是 base fee 回落就要约 4 分钟；“积压”要区分价格恢复和队列清零。
- **DA 容量（OP blob 编码每 blob 130,044 字节可用，12 s slot）**：6 / 9 / 14 / 21 blobs → 65.0 / 97.5 / 151.7 / 227.6 KB/s；按每笔 100 字节压缩后摊销 → 约 650 / 975 / 1,517 / 2,276 TPS（全网所有 rollup 共享）。
- **最重 range 的平均每块 gas**：2.61B / 1800 = 1.45M gas/块 = target 15M 的 9.7%。

## 台账（K 前缀）

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| K1 | 2026-10-20 确认的 Mantle 生产版本：mantle-v2 v1.6.3、op-geth v1.6.3、reth mantle-v1.6.2（574e7f39）、revm v107-mantle-arsia.2、op-succinct mantle-v1.6.1 | upstream-codebase-fix-alert `config/repos.json@6be759c` 各条 `deployed`（confirmed_by whisker yu） | observed |
| K2 | 主网的 sequencer 是 op-geth；主网 mantle-op-reth 是跟随它的候选 sequencer（SEQUENCER_ENABLED=false） | `config/repos.json@6be759c` reth `deployment.notes`（2026-10-27 确认） | observed |
| K3 | sepolia-v133 上 mantle-op-reth 是 sequencer | 同 K2 | observed |
| K4 | mainnet-v133 与 sepolia-v133 的 mantle-op-reth 开启了 `--preconf.enable` 与 `--preconf.*` | 同 K2 | observed |
| K5 | 所有生产 reth 节点设 `--engine.persistence-threshold=0`、`--engine.memory-block-buffer-target=0`（每块持久化），上游默认阈值是 2 | 同 K2 | observed |
| K6 | 生产 reth 的 MDBX 用默认 Durable 模式，节点不裁剪 | 同 K2 | observed |
| K7 | RPC 与 p2p 节点经 `--rollup.sequencer-http` 转发交易，静态 peering（`--disable-discovery`） | 同 K2 | observed |
| K8 | 2026-10-27 核对时，生产配置里有 3 项（persistence-threshold=0、preconf.enable、proofs-history）超出开发者第一次给出的答案 | upstream-codebase-fix-alert `docs/DESIGN.md:1355@6be759c` | observed |
| K9 | 草稿描述的“reth 执行、op-geth RPC 导入”路径是 reth sequencer 的目标架构，不是当前主网（主网 sequencer 是 op-geth） | 由 K2、草稿 §2.1 推出 | inferred |
| K10 | “主网被动测”与“QA 链（reth sequencer）实验”测的是两套 sequencer 实现，分段数据不能直接对照；每组数据都要标出 sequencer 客户端 | 由 K2、K3、K9 推出 | inferred |
| K11 | op-geth v1.6.3 有另一套预确认实现：白名单 `--txpool.frompreconfs/topreconfs`、`--txpool.allpreconfs`（默认 false）、`--txpool.preconftimeout`（默认 1 s）、`SendRawTransactionWithPreconf` | mantle-xyz/op-geth `cmd/utils/flags.go:437-456`、`preconf/tx_pool_config.go:10-15`、`internal/ethapi/api.go:2297`@e33cd26 | observed |
| K12 | 主网 op-geth sequencer 是否开启预确认，公开与部署画像资料都没有记录 | `config/repos.json@6be759c` 只列 reth 节点设置；op-geth 条目无 deployment.notes | observed |
| K13 | Mantle reth 固定上游 reth v2.2.0（rev 88505c7f） | mantle-xyz/reth `Cargo.toml:9`@574e7f39 | observed |
| K14 | reth v2.2.0 默认：persistence 阈值 2；canonical 与已持久化差距超过 16 块时 engine API 停顿；state root task 超时 1 s | paradigmxyz/reth `crates/engine/primitives/src/config.rs:7,10,46`@88505c7 | observed |
| K15 | 每块持久化时，只有持久化提交长期跟不上（差距累积到 16 块）才会让 engine 停顿；E6–E8 应记录 canonical − persisted 差距、提交耗时与 backpressure 指标 | 由 K5、K6、K14 与 notes-exec X83–X85 推出 | inferred |
| K16 | 2026-10-31 主网：gasLimit 60M、denominator 50、elasticity 4（target 15M）、min base fee 50 gwei，base fee 处于下限 | `cast block latest -r https://rpc.mantle.xyz --json`，区块 102640856 的 extraData `0x0100000032000000040000000ba43b7400`、baseFeePerGas 0xba43b7400 | observed |
| K17 | 公开 RPC 节点是 op-geth（Geth/v1.17.3） | `cast rpc web3_clientVersion -r https://rpc.mantle.xyz` | observed |
| K18 | 最近 24 小时抽样（24,576 块）平均 gas 利用率 0.32%（相对 60M），单块最高 23.5%，没有区块超过 target | `eth_feeHistory` 24 个 1024 块窗口，notes-main §3 | observed |
| K19 | Mantle 的输出根由 op-succinct proposer 证明后提交 L1 L2OutputOracle；证明请求经 proof router 默认发往自建 sp1-cluster（8×GPU），失败时切 Succinct 官方网络 | mantle-performance-test `prover-network/README.md@eaf4c5c`（测试环境 sepolia-qa2 的描述） | observed |
| K20 | 一个证明 range 是 1800 个 L2 块（约 1 小时），只证明 finalized 块 | 同 K19 | observed |
| K21 | witness 在 proposer pod 内重放生成，`WITNESSGEN_TIMEOUT` 默认 1800 s，router 看不到这一步 | 同 K19 | observed |
| K22 | gateway 同时只放 1 个 range 和 2 个 agg 进集群，其余排队；agg 在 CPU worker 上包成 Plonk | 同 K19 | observed |
| K23 | 卡死线 `HANG_TIMEOUT_SECS` 2400 s；熔断为 600 s 内失败 5 次；多次失败后 range 对半拆 | 同 K19 | observed |
| K24 | 生产证明流水线目前不记录每个 range 的 cycle 数与 prover gas（network 模式字段为 0，自建路径字段为空） | mantle-performance-test `prover-network/collect/README.md@eaf4c5c` | observed |
| K25 | 证明瓶颈拆解（草稿“统计 zkVM 周期花在哪里”）需要单独的 SP1 execute / cycle tracking 运行，不能从现有生产记录得到 | 由 K24 推出 | inferred |
| K26 | 主网 2026-09-21～10-10 交易构成（按笔数）：DEX 29%、ERC20 29%、预言机 24%、原生转账 16.5%、批量建合约 1%、部署 0.5% | mantle-performance-test `prover-network/load/README.md@eaf4c5c` | observed |
| K27 | 同期主网峰值小时 2.03 TPS；最重 range 6332 笔、2.61B gas | 同 K26 | observed |
| K28 | 证明网络发版标准写为“可持续 TPS ≥ 主网峰值小时 × 1.5”，对应 3 TPS 基准负载 | 同 K26 | observed |
| K29 | blake2f、BLS12-381、modexp 等在 zkVM 中没有加速的交易，单笔就可能把 range 推过超时，长稳负载没有包含它们 | 同 K26 | observed |
| K30 | 草稿 E7 只用 mStocks 类交易组合；当前主网负载以 DEX、转账、预言机为主，单一组合不能代表主网 | 由 K26、草稿 E7 推出 | inferred |
| K31 | 最重 range 的平均每块 gas 约 1.45M，是 target 的 9.7% | 由 K27 计算：2.61B / 1800 | inferred |
| K32 | 2026-06 清算压测把延迟拆成提交 / 自排队 / mempool 积压 / 链固有四段，链固有约 2 s | mantle-performance-test `benchmark/rsETH_restore_test/08_three_tier_test_plan.md` Q10（main@1214cff） | observed |
| K33 | 同一压测文档：跨场景只能比 gas/s 与链固有确认，TPS 与“广播→上链”延迟不可比 | 同 K32，Q11 | observed |
| K34 | 清算压测饱和吞吐约 29.5M gas/s，等于配置上限（60M / 2 s），没有测出执行层自身余量 | 姊妹报告 high-performance-chain-roadmap `notes-mainsession.md` §5（K7–K10 行） | observed |
| K35 | 40 个区块中超过真实 p99 的期望个数是 0.4，全部不超过真实 p99 的概率是 0.67；40 个满块不能估计区块级 p99 | 计算：0.99^40 = 0.669（notes-main §6） | inferred |
| K36 | 900 个区块（2 s × 30 分钟）时，真实 p99 以约 96% 的概率落在第 16 大与第 4 大样本之间，可做区块级 p99 粗筛 | 二项分布次序统计量计算（notes-main §6） | inferred |
| K37 | 当前参数下满块使 base fee 每块最多涨 6%，连续 40 个满块后约为 10.3 倍 | EIP-1559 公式 + K16：(60−15)/15/50 = 0.06；1.06^40 = 10.29 | inferred |
| K38 | 40 个满块后，在近空块下 base fee 回到 50 gwei 下限约需 115 块（约 3.8 分钟） | 计算：ln(10.29)/−ln(1−1/50) ≈ 115（notes-main §6） | inferred |
| K39 | 草稿 E8“积压超过 5 分钟才清零”需要区分价格恢复与队列清零：单是 base fee 回落就约 4 分钟 | 由 K38 推出 | inferred |
| K40 | 证明网络长稳测试的结果没有提交到仓库，本次无法得到 Mantle 当前证明吞吐数据 | `prover-network/README.md@eaf4c5c`：“某一轮的参数、结果、原始数据……不要提交进本仓库” | observed |

## 补充（写稿时）
| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| K41 | 主网区块 102640855 中的一笔 ERC-4337 `handleOps` 交易：gasUsed 120,982，DA footprint（blobGasUsed）151,600，scalar 400 | `cast rpc eth_getTransactionReceipt 0x1d3c88a8…87ab -r https://rpc.mantle.xyz`（to = EntryPoint 0x0000000071727De2…，selector 0x765e827f） | observed |
| K42 | 这笔交易按 Jovian 规则计入 base fee 的是 DA footprint（151,600），不是 gasUsed（120,982） | 由 K41、D20 推出 | inferred |

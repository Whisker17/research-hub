# notes-mainsession：主会话核对（Mantle 链上参数与发布记录，2026-10-27 CST / 2026-10-26 UTC）

## §1 网络升级时间线（gh release list / view -R mantle-xyz/mantle-v2）
- v1.1.1 Mainnet Everest（2025-03-07 发布）：主网启用 EigenDA，替换 MantleDA；Pectra 兼容准备。
- v1.3.1/1.3.2 Mainnet Skadi（2025-08）：支持 Ethereum Prague 全部特性；op-node 新增 `optimism_safeHeadAtL1Block`，“to generate succinct ZKP proofs faster”。
- v1.4.2 Mainnet Limb（2025-12-25 发布，fork 2026-01-14 07:00 UTC）：支持 Osaka；op-batcher 支持 Fusaka 后的 cell proofs blob 交易；op-node 用 `eth/v1/beacon/blobs` 取 blob 数据。
- v1.5.3 Sepolia Arsia（2026-03-18）：Arsia 在一次激活里同时启用 8 个 OP Stack fork（Canyon、Delta、Ecotone、Fjord、Granite、Holocene、Isthmus、Jovian）；派生对齐上游（strict batch ordering、无缓冲、invalid payload → deposits-only）；op-batcher blob 数据格式改变、支持 span batch 与 brotli；新增 `OperatorFeeVault` 预部署；GasPriceOracle 改为 Arsia 费用模型；SystemConfig 新增 `setGasConfigArsia()`、`setEIP1559Params()`、`setOperatorFeeScalars()`、`setMinBaseFee()`、`setDAFootprintGasScalar()`。
- v1.5.4 Mainnet Arsia（2026-04-08 发布；激活 L2 时间戳 1776841200 = 2026-04-22 07:00 UTC）：派生数据源与 L1 读取逻辑更新、blob format switch 测试、CertiK 审计报告。
- v1.6.3 Elysium（2026-09-21，Latest）：目的是在 L1 Glamsterdam 激活后保持派生、批提交和跨链消息可用；L2 EVM 仍是 Arsia/Osaka 规则，不在 L2 激活 Amsterdam EVM；基于 `op-geth v1.6.3`（上游 go-ethereum v1.17.3）；支持 L1 Amsterdam header、BPO 时间表、新的 batch-submission calldata floor；**PR #370：Enabled eager next-block construction to reduce the dead window between sealing one block and accepting transactions for the next block**（标题“Sequencer and preconfirmations”）。

## §2 链上参数（公开 RPC https://rpc.mantle.xyz，2026-10-26 16:52 UTC，head 102451615）
命令：`cast block latest -r https://rpc.mantle.xyz --json`；`cast rpc web3_clientVersion`；`cast rpc eth_feeHistory 1024 <block> '[]'`（24 个窗口，每小时一个，每个 1024 块）。
- chainId 5000；区块间隔 2 秒（相邻区块时间戳差 2）。
- 区块 gasLimit = 0x3938700 = 60,000,000。
- extraData = 0x01 00000032 00000004 0000000ba43b7400 → Jovian 格式：EIP-1559 denominator 50、elasticity 4（gas target = 15M）、min base fee 0xba43b7400 = 50 gwei（单位为 MNT 计价的 wei）。
- 公开 RPC `web3_clientVersion` = `Geth/v1.17.3-stable-e5fa26ca/linux-amd64/go1.26.8`（RPC 节点是 op-geth；sequencer 自身客户端不能由此确定）。mantle-xyz/op-geth 各 tag 的 `version/version.go`：v1.5.5 / v1.5.6 → 1.16.5；v1.6.0（2026-07-20）/ v1.6.1 / v1.6.2-rc0 / v1.6.3 → 1.17.3。→ 公开 RPC 跑的是 op-geth v1.6.x 线（具体 patch 无法确定）。
- 过去 24 小时（24×1024 块抽样）平均 gas 利用率 0.167%（相对 60M 上限），单块最高 8.4%；抽样 31 个区块平均 1.55 笔交易（含 L1 info deposit）。→ 当前主网负载远低于容量。
- 旧文档（mantle-docs 仓库，最后提交 2024-11-08）写 block gas limit 250B units：那是 Arsia 之前的 Mantle gas 计量；Arsia 对齐 OP 费用模型后上限为 60M。

## §3 DA（L1 链上观察）
- 部署配置 `packages/contracts-bedrock/deploy-config/mantle-mainnet.json@09e3693`：`batchSenderAddress` 0x2f40D796917ffB642bD2e2bdD2C762A5e40fd749，`l2BlockTime` 2。
- Blockscout API `eth.blockscout.com/api/v2/addresses/0x2f40…d749/transactions`（2026-10-26）：最近 8 笔都是 type 3（blob）交易，发往 `0xFFEEDDCCBBAA0000000000000000000000000000`，间隔约 7–8 分钟。
- `cast tx 0x02fd3349…2ad9 -r https://ethereum-rpc.publicnode.com`：type 0x3、1 个 blob、calldata 为空。→ Mantle 主网当前用 Ethereum blobs 发布批次（不是 EigenDA），约每 7–8 分钟一批、每批 1 个 blob。
- mantle-v2 源码仍保留 `MantleDaSwitch` / EigenDA legacy 字段（op-node/rollup/types.go:197-200@09e3693），派生目录有 `mantle_blob_source.go`、`altda_data_source.go`。

## §4 客户端仓库
- mantle-xyz/reth（公开）：release `op-reth-v2.2.1-mantle-arsia.2`（2026-08-26，Latest）、`mantle-v1.6.1/1.6.2`（2026-10-12）。
- mantle-xyz/op-geth：`1.6.3 Elysium`（2026-09-21）。
- mantle-xyz/sp1-cluster（公开 fork）：“official multi-GPU proving service implementation for SP1”。→ 与 OP Succinct（SP1）证明路径一致（推断）。

## §5 内部压测（mantle-xyz/mantle-performance-test，私有仓库，benchmark/report/qa_liquidation_summary_20260624.md）
- Mantle Sepolia QA 链、合成 mock 合约（非状态分叉），rsETH 清算三档压测（2026-06-24）。
- 三档 100% 清算；Tier 3（100 万 wrsETH、160 bot / 400 arb）清算窗口 78.9 s。
- “链固有确认延迟”恒定 ≈2 s（一个出块间隔）；饱和吞吐稳定 ~29.5M gas/s，峰值利用率 98.4%。
- Bot 端到端延迟 3.4 s → 7.6 s → 18.2 s，增长全部来自自排队 + mempool 积压；Tier 3 Bot 等待块数 p95 = 26。
- BaseFee 最大涨幅 +10% / +92% / +893%；写入端 429 率 Tier 3 从历史 67% 降到 7.9%（高初始 feeCap + RBF 限速）。
- Guard revert 率 27–49%（多 bot 争抢同一 borrower）。
- 注：29.5M gas/s ≈ 60M gas / 2 s，即饱和吞吐等于配置的区块 gas 上限（Mantle Sepolia `cast block latest -r https://rpc.sepolia.mantle.xyz` 的 gasLimit 也是 0x3938700 = 60M；QA 链配置未直接核实）；该测试没有测出执行层自身的余量（主会话推断）。
- 测试计划后续加入了“latency-segment decomposition”问题（commit 11041ea, 2026-06-24）。

## §6 Mantle 官方路线图（https://docs.mantle.xyz/network/system-information/roadmap.md，curl 于 2026-10-27）
- 2026 H1（已勾选）：Arsia（三段式费用、DA 迁到 blobs）、Reth RPC 兼容与测试网验证、ZK 验证模块 + SP1 Hypercube、“Low-Cost Distributed GPU Proof Network … Mantle Sepolia and QA network supported. Waiting for Mantle Mainnet...”。
- 2026 H2（全部未勾选）：Mainnet Sequencer 与 RPC 全面切到 pure Reth（Geth 降为灾备热备）；Glamsterdam 同步（Sequencer / Prover / RPC）；Flashblocks 亚秒流式预确认；预确认策略与路由权限上链治理；Prop AMM（高优先级撤单、专用撮合路径）；native AA（评估 EIP-8130 / 8141）；2D nonce；Shielded Pool + mStocks POC。

## §7 抽查（主会话，fetch_content，2026-10-27）
- B13 Base Denim：docs.base.org/upgrades/overview “Denim introduces native blocks at a 200ms cadence, replacing Flashblocks … Base Sepolia: Activated October 21, 2026 · Base Mainnet: Targeting November 2026” ✓
- B16 OP Subblocks：docs.optimism.io/notices/preconfirmation-architecture-transition “Subblocks has been running on OP Mainnet since August 31, 2026 … OP Labs stops running and testing op-rbuilder” ✓
- S22 / S14 Alpenglow：solana.com/upgrades/alpenglow “activated in epoch 1064 … October 21, 2026”；Rotor “not yet scheduled” ✓
- E5 Reth 2.0：paradigm.xyz “reduces the time spent calculating the final state root at the end of each mainnet block to just 1–2ms” ✓
- M23 / M30 Mantle 路线图：见 §6 ✓

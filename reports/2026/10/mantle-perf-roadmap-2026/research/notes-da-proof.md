# notes-da-proof：DA、证明、费用参数、区块空间分配（分路 D）

调研日期 2026-10-31。台账前缀 `D`。网页访问日期均为 2026-10-31（另注者除外）。
源码：`mantle-xyz/op-succinct@6b1cb57`、`mantlenetworkio/mantle-v2@1780605`（只读 shallow clone）。
链上数据：Mantle L2 通过 Routescan 的 Etherscan 兼容代理（`api.routescan.io/v2/network/mainnet/evm/5000/etherscan/api?module=proxy…`）读取；L1 通过 eth.blockscout.com API v2 和 Routescan（chain 1）读取。本次运行没有 bash/cast，`rpc.mantle.xyz` 的 JSON-RPC POST 和 `eth_feeHistory` 都用不了，所以 24h 利用率只做了抽样复核（见 D7）。
说明：本文件按运行时要求写到 artifact 路径。任务里写的 `reports/2026/10/mantle-perf-roadmap-2026/research/notes-da-proof.md` 需要由父会话落盘。

**主会话已核实的事实（notes-main.md K 行，本文引用，不在本台账重复登记）：**
- 生产 op-succinct 版本为 mantle-v1.6.1（commit 8d280ded）。
- 内部证明网络（mantle-performance-test prover-network README @eaf4c5c）的链路是：proposer → proof router → 默认走自建 sp1-cluster（8×GPU），失败时切到 Succinct 官方网络。
- range 为 1,800 块（约 1 小时），只证明 finalized 区块。
- witness 在 proposer pod 内生成，超时 1,800 s。
- gateway 同时只跑 1 个 range 和 2 个 agg。
- agg 用 Plonk 包装。
- network 模式下 cycle 和 prover gas 字段为 0。
- 主网参数（2026-10-31）：denominator 50、elasticity 4、limit 60M、min base fee 50 gwei；24h 平均利用率 0.32%。

---

## D1. Ethereum blob 容量与草稿“152 / 228 KB/s”

**答案。** 截至 2026-10-31，主网生效的仍是 BPO2：每块 target 14、max 21 个 blob，2026-01-07 激活（[1][2]）。BPO3（EIP-8138）还是参数为空的 Draft（[4]）。Glamsterdam 只在 Sepolia 激活了（2026-10-06）；Hoodi 原定 10-26 激活，已于 10-22 宣布推迟，主网日期待定（[5][6]）。GPT 引用的 EIP-8135 就是 “Hardfork Meta – BPO2”（Final），与本问题直接相关，引用是对的（[2]）。按 OP blob 编码，每个 blob 最多装 130,044 字节（[7]），算下来 14×130,044/12 ≈ 151.7 KB/s，21×130,044/12 ≈ 227.6 KB/s。草稿的 152 / 228 KB/s 算术正确。

**依据。**
- EF Fusaka 公告：BPO1 10/15，2025-12-09（epoch 412672）；BPO2 14/21，2026-01-07 01:01:11 UTC（epoch 419072）[1]。EIP-8135 给出 BPO2 的 update fraction 11,684,671，状态 Final [2]。EIP-7892 定义 BPO 机制，状态 Final（Informational）[3]。
- OP Ecotone 派生规范：`(4*31+3)*1024 = 130048` 字节，长度超过 `130048 - 4` 的 blob 无效，所以可用 130,044 字节 [7]。
- 草稿“每笔 100 bytes → 约 1,517 / 2,276 TPS”必须写明四个前提：
  1. 100 字节是 Fjord 费用估算的下限 `minTransactionSize`，不是实测均值（[8]）。
  2. 指的是压缩后、摊销了 batch/frame 开销的字节。
  3. 这些带宽由所有 blob 用户共享。
  4. max 档不可持续：持续高于 target 时，blob base fee 会按 update fraction 指数上涨（[2]）。

**不确定之处。** 没有拿到当前 Ethereum blob 实际占用率的一手数据。

## D2. Mantle 的 DA 与 batcher 现状

**答案。**
- Mantle 主网用 Ethereum blob 发布批次。2026-10-30 23:55:59 到 10-31 01:55:59 的 2 小时里，batcher 发了 17 笔 type-3 交易（nonce 215092→215108），平均每 7.5 分钟一笔，每笔 1 个 blob（[9][10]）。
- 抽查的最新 blob 只装了 6,836 字节 rollup 数据，占 130,044 的 5.3%。frame 数据以 0x01 开头，说明是 Brotli 压缩的 channel（[10][11]）。
- 推算每天约 192 个 blob，约占 Ethereum target 容量（100,800 blob/天）的 0.19%；按实际字节只占约 0.01%。
- 公开代码里 op-batcher 的默认值是 zlib、singular batch、calldata、`max-channel-duration=0`、`target-num-frames=1`、`sub-safety-margin=10`（[12]）。这只是代码默认值，生产显然覆盖了（生产用的是 blob 和 Brotli）。

**依据。**
- Blockscout `/api/v2/addresses/0x2f40…d749/transactions`：交易全是 type 3，发往 `0xFFEEDDCcBbAA…0000`，相邻两笔间隔 34–41 个 L1 区块，均值约 37 [9]。
- `/api/v2/transactions/0x70206c50…ba48/blobs` 只返回 1 个 blob。按 v0 编码解读 blob 头：`0x20 00 001ab4` 表示版本 0、长度 0x1ab4 = 6,836。后面依次是派生版本 0x00、channel_id `aad14768…e3351e`、frame_number 0、frame_data_length 0x1a9c = 6,812，frame_data 首字节 0x01 [10]。1+16+2+4+6,812+1 = 6,836，长度吻合。按 Fjord 规定，0x01 是 Brotli channel 的版本前缀 [11]。
- 代码默认值见 `op-batcher/flags/flags.go@1780605`：sub-safety-margin 10（约 L49–56）、max-channel-duration 0（约 L69–74）、target-num-frames 1（约 L86–91）、compressor shadow（约 L98–109）、compression-algo Zlib（约 L110–117）、batch-type 0（约 L124–130）、DA type calldata（约 L131–140）[12]。
- 约 37 个 L1 区块的发送节奏，与“Granite CHANNEL_TIMEOUT 50 减 sub-safety-margin 10，再减去 L1 origin 落后的几块”吻合（[13]）。但也可能是生产显式设置了 `max-channel-duration`，所以记为 speculative。

**不确定之处。** 只解码了 1 个 blob 头。是否启用 span batch 要解压 channel 才能确认，本次没做。生产 batcher 参数没有公开。

## D3. Jovian DA footprint 与 Mantle 当前值

**答案。** Jovian 规定（[14]）：
- 每笔非 deposit 交易的 DA footprint = `max(minTransactionSize, FastLZ 线性估计) × daFootprintGasScalar`。
- 全块 footprint 之和写入区块头 `blobGasUsed`，且必须 ≤ `gasLimit`。
- base fee 改按 `max(gasUsed, blobGasUsed)` 更新。

SystemConfig 里这个值为 0 时，默认取 400（[15]）；mantle-v2 里也写死为 `DAFootprintGasScalarDefault = 400`（[16]）。**Mantle 主网现值是 400**：L1 info deposit calldata 末两字节为 0x0190，用户交易回执里 `daFootprintGasScalar` 为 0x190（[17][18]）。

**草稿 E7 的判读需要改。** footprint 是“FastLZ 估计字节 × scalar”这个计量维度。footprint 先接近 target，说明的是计量约束先收紧，不能推出 L1 DA 带宽是瓶颈。按 Mantle 参数：
- 60M 的 gasLimit 下，每块最多 150,000 估计字节（约 75 KB/s）。
- 15M 的 target 对应 37,500 估计字节/块。
- 每笔交易的 footprint 至少 100 × 400 = 40,000，比一笔 21k 的转账还高。

所以每估计字节耗 gas 少于 400 的交易，都会先触到 DA 维度。而真实 blob 装载率只有约 5%。GPT §5.6/E7 对 scalar 语义的说明属实。

**依据。** [14][15][19][8]；区块 102,640,944 的 L1 info 交易 `0x67687e27…f657` calldata 长 178 字节，与 `L1InfoJovianLen` 一致（`l1_block_info.go:32@1780605`）[17]；WMNT withdraw 交易 `0xa75acff5…e311` 的回执显示 `gasUsed 42,365`、`blobGasUsed 40,000` [18]。

**不确定之处。**
- 没能用 cast 读 L1 SystemConfig 的原值，所以分不清它是显式设成 400，还是设为 0 后走了默认值。
- FastLZ 估计值和实际 Brotli 字节之比没测。粗算（speculative）：每笔交易实际约 55 字节，低于 100 字节下限，即 footprint 可能高估实际字节。

## D4. EIP-1559 参数方向与 Mantle 当前参数

**答案。** EIP-1559（[20]）：
- `target = gas_limit // E`
- `delta = base_fee × |gas_used − target| // target // D`

所以 D **越小**，调整越快；满块时单块最大涨幅为 `(E−1)/D`。

Mantle 现值：区块 102,640,944 的 extraData 给出 D=50、E=4、min base fee 50 gwei，limit 60M，target 15M，base fee 正停在下限（[17]）；与主会话 K 行一致。由此：
- 一个满块让 base fee 涨 (60−15)/15/50 = 6%（草稿的 6% 正确）。
- 40 个连续满块累计 1.06^40 ≈ 10.29×（+929%）。
- 之后接近空块时每块降约 1.99%，约 116 块（3.9 分钟）回到下限。

**草稿 E8“降低 elasticity，或提高 denominator 的反应速度”需要改：**
1. 要更快反应，应该**降低** D，不是提高。
2. 降低 E 会降低单块最大涨幅：E=2 时只有 2%。
   - 固定 limit：target 变高，价格反应变慢。
   - 固定 target：limit 变低，积压更大。
   - 两种情况下积压都不会更快清零。
3. 清零速度取决于处理能力减去到达率；费用参数只影响对价格敏感的需求。

GPT §四 E8 的修正属实。

**依据。** [20][17]，算术见 D30–D35。
**不确定之处。** 客户端实现里的整数取整细节忽略不计。

## D5. Mantle 的证明路径与证明流水线

**答案。** 主网走 **OP Succinct validity 模式**（Validity-Oracle-only），不是 Lite 或 fault proof：
- 公开 fork 基于上游 v3.12.0，用 SP1 `=6.4.0`（Hypercube）和 sp1-cluster v2.7.2，kona 来自 mantle-v2 `mantle-v1.6.3`；fault-proof 已整体删除（[21][22]）。
- 生产版本是 mantle-v1.6.1（K 行）。MANTLE_CHANGES 的版本表从 mantle-v1.6.0 起就是 SP1 6.4.0 / sp1-cluster v2.7.2；v1.6.1 是这条线上更新的发布（§3.5a 的回滚说明把 mantle-v1.6.1 列为不含 migration 7 的旧版），所以生产应在 SP1 6.4.0 上（inferred）。

L1 链上：
- `OPSuccinctL2OutputOracle`（0x31d5…f481）的 `latestBlockNumber` = 102,638,546。
- 最近三次 `proposeL2Output` 各相隔 1,800 个 L2 块（约 1 小时），每次约 431.5k gas，另有一笔约 49k gas 的 `checkpointBlockHash`（[23]），与 K 行的“range 1,800 块”一致。
- 最近一次提交距被证明区间的末块约 40 分钟，距首块约 100 分钟。

**证明后端：**
- K 行：默认用自建 sp1-cluster（8×GPU），失败才切到 Succinct 网络。
- 官方路线图写的是“Low-Cost Distributed GPU Proof Network … Waiting for Mantle Mainnet”（[24]）。
- 推测（speculative）：二者并不矛盾。路线图指的“分布式 GPU 证明网络”是另一个尚未上主网的产品，生产目前跑的是内部 8 卡集群。需要 Mantle 确认口径。

**流水线按代码状态拆段**（[25][26][27]）：
1. 选区间：1,800 块。
2. **WitnessGeneration**：host 用 kona 在本地派生、执行并收集 preimage；生产中在 proposer pod 里跑，超时 1,800 s（K 行）。
3. **Execution**：模拟，得出 cycles 和 prover gas。
4. **Prove**：range proof。
5. Complete。
6. aggregation：witnessgen 加证明，Plonk 包装（K 行，与 MANTLE_CHANGES §3.10b 一致）。
7. `checkpointBlockHash`。
8. `proposeL2Output`，状态变为 Relayed。

DB 里已经记录了 `witnessgen_duration` / `execution_duration` / `prove_duration`（[26]）。guest 的 cycle tracker 只分了 `payload-derivation` 和 `block-execution` 两段，MPT / state root 包含在后者里（[27]）。`sp1-sdk` 已开启 `profiling`（[21][28]）。

**按 K 行补充的推断：**
- network 模式下 cycle 和 prover gas 字段为 0，所以证明成本拆解必须靠本地 `execute`（或 cluster 路径）补数（DX4）。
- gateway 同时只跑 1 个 range，range 又按 1,800 块（3,600 s 链上时间）切。若持续负载下单个 range 的“witnessgen + 证明”超过约 3,600 s，range 积压就会无界增长。witnessgen 的 1,800 s 超时本身也是一个硬边界。

草稿“瓶颈主要在 ZK proof system”只能当作者陈述，待复现。

**依据。** [21] Cargo.toml L24、L193–205；[22] MANTLE_CHANGES §1、§2.3、§3.3、§3.10b、§3.11；[23]；[24]；[25] prom.rs；[26] db/types.rs；[27] client.rs；[28][29] SP1 文档；K 行（主会话）。

**不确定之处。** 链上 `aggregationVkey` 未读，无法独立确认生产用的是 SP1 6.4.0。40/100 分钟只有 3 个样本。range 在 8×GPU 上的实际证明时长没有公开数据。

## D6. 多证明与实时证明

**答案。**
- Base Azul：TEE 和 ZK 两种证明都在时 1 天结算；只有一种时 7 天（Beryl 后改为 5 天）。ZK 路径无需许可，可以推翻 TEE（[30]）。官方给的动机是提款延迟和挑战的经济攻击面，不是证明速度，所以 **multiproof 不等于 ZK 提速**。
- SP1 Hypercube（2025-11-18）：16 张 RTX 5090，954 个 L1 区块里 99.7% 在 12 s 内、95.4% 在 10 s 内完成（[31]）。
- Airbender Prime（2026-10-13）：单张 RTX PRO 6000，连续 7,200 个 L1 区块中 99% 在 10 s 内、全部在 12 s 内完成（[32]）。
- 两者都是厂商自测的 L1 区块成绩。Mantle 证明的是 1,800 块的 OP 派生 + 定制执行，再做 agg 和 Plonk，不能直接换算。

**依据。** [30][31][32]。
**不确定之处。** GPT 引用的 zksync.io 博客链接未核实；本文用的是 ZKsync 在 X 上的长文。

## D7. 区块空间分配

**答案。**
- **Tempo**：用 `general_gas_limit` 限制非支付交易。是否算支付交易只看交易数据，不读状态（白名单调用形态，且 `access_list` 为空）（[33]）。约 94% 的区块空间留给支付（[34]）。
- **BSC Payment Lane（BEP-703，Jenner 硬分叉）**：默认留 5%，最高 10%；闲置部分也不让给普通交易；不改排序。测试网 2026-10-28 激活，主网时间待公布（[35][36][37]）。
- **“Binance New L1”**：指 BNB Chain 的 New L1。它的 Multi-Lane 按 `to` 地址预留容量，目前只有内部 devnet；与 BSC Payment Lane 是两回事（姊妹报告 bnb-new-l1-deep-dive C4、C9、X44–X48）。
- **Solana 式 LFM 在 EVM 上的障碍**：Solana 的指令会声明 `is_writable`（[38]），EVM 的 access list 是可选的（[39]），所以只能改交易格式，或者做无状态分类。
- **Mantle 利用率**：我在 22 小时里抽了 12 个区块，平均约 0.14%，其中 10 块只有 deposit（[40]）。主会话 24h 全量均值是 0.32%（K 行）。两者都远低于 1%；差异来自抽样稀疏（交易集中在少数区块），以 K 行全量值为准。

**依据。** [33]–[40]；K 行。

---

## 对草稿 / GPT 评审的修正

1. **草稿 E7 第二行**“DA footprint 先接近 target → 瓶颈在 DA”，结论说过头了（D19–D27）。footprint 是 FastLZ 估计 × 400 的计量值，而实际 blob 装载率只有约 5%。应先把 footprint 和 batcher 实际压缩后的字节对比，再判断；E7 的 target 也应按 max(gas, footprint) 来定。
2. **草稿 E8 第二行**（D34、D35）：要更快反应应降低 D，而不是提高；降低 E 会让反应变慢或容量变小。费用参数都不能加快积压清零。
3. **草稿 DA 行**：152 / 228 KB/s 和 1,500 / 2,300 TPS 的算术都对，但要补上四个前提，并写明截至 10-31 仍是 BPO2。
4. **草稿“考虑压缩效率、批次大小和频率”**：现状正相反。生产已经用 Brotli，问题是 blob 只装了 5%，近期该看的是 safe head 滞后和 blob 成本之间的取舍。
5. **草稿“瓶颈主要在 ZK proof system”**：没有公开证据，待复现。公开可测的是：每 1,800 块（约 1 小时）一次聚合提交，提交时距区间末块约 40 分钟。K 行补出了明确的结构约束：同时 1 个 range、witness 超时 1,800 s。按这些约束，“range 证明时长 < 3,600 s”就是持续性门槛（D70）。
6. **草稿 E7 第三行“如 GPU 证明网络上主网”**：主网证明已在自建 8×GPU sp1-cluster 上运行（K 行），证明滞后现在就能用 L2OO 测。路线图里的“分布式 GPU 证明网络”与这个集群是什么关系，需要确认。
7. **草稿“Binance New L1”**：指 BNB New L1（Multi-Lane），与 BSC Payment Lane 是两个东西。
8. **GPT §5.11**“BSC 2026 年 9 月公布 Payment Lane”：我找到的一手来源都是 2026-10 的（10-22、10-28），9 月的说法无法核实。
9. **GPT 说对的部分**：§5.6 的 152/228、EIP-8135、scalar 语义；§四 E8 的参数方向；E19-B 的“multiproof 不等于提速”。
10. **GPT §5.13 需要补充**：guest 只有两个 cycle span，MPT 没有单列；network 模式下 cycle 和 prover gas 为 0（K 行），所以“用 prover gas 拆成本”必须在本地 execute；sha3 patch 不匹配时 keccak 会退回软件实现，这一风险已写在 MANTLE_CHANGES 里。

## 对路线与实验的建议（均为建议）

| 编号 | 假设 | 做法与对照 | 指标 | 观察 → 结论 → 措施 | 优先级理由 |
|---|---|---|---|---|---|
| DX1 footprint/gas 比值普查 | 部分主流交易受 DA 计量约束 | 用历史回执和 QA 上的 mStocks / Router / perps 样本，逐笔读 `blobGasUsed` 和 `gasUsed` | footprint/gas 的分布；按 max(gas, footprint) 算的块级利用率 | 比值 >1 的交易占比高 → E7 的 target 按计量值定，扩容先看 scalar；否则 DA 计量不是近期约束 | 短期 P0：只需读数据 |
| DX2 估计字节 vs 实际字节校准 | FastLZ 估计高于 Brotli 批次压缩后的字节 | 同一段区块，比较 Σ(footprint/400) 和 channel 的 frame 字节 | 比值 r = 实际 / 估计 | r 明显 <1 → scalar 有下调空间（走治理 `setDAFootprintGasScalar`）；r ≈ 1 → 维持 | 短期：DX1 和 E7 都靠它判读 |
| DX3 batcher 节奏 | safe head 滞后约 7.5 分钟，由 channel 超时或 channel 时长决定 | QA 上扫 `max-channel-duration`、`target-num-frames`、`max-pending-tx` | safe head 滞后、blob 装载率、每 MB 的 L1 成本、证明起点延迟 | 缩短后端到端证明滞后下降、成本可接受 → 调整；否则维持 | 中期 |
| DX4 证明流水线分段 | 证明滞后由 witnessgen / prove / agg / 提交中某一段主导 | 用 DB 里三段 duration 加 L2OO 提交时间；对同样的 range 本地跑 `execute` 补 cycles 和 prover gas（network 模式下这两项为 0）；guest 给 state root / MPT 加 span；在 QA 上按 target 负载跑 1,800 块的 range | 各段 p50 / p99；单个 range 墙钟时间对比 3,600 s；witnessgen 对比 1,800 s 超时；prover gas / 块 | range 时长持续 >3,600 s 或接近 witness 超时 → 证明是容量瓶颈，先扩并发或缩小 range；MPT 占大头 → 进入 commitment 研究 | 短期 P0：数据大多已有，能直接验证或推翻“瓶颈在 ZK” |
| DX5 1559 离线仿真 | D/E 只影响价格 | 按 D∈{8,25,50}、E∈{2,4} 回放 E8 的需求 | base fee 轨迹、积压清零时间 | 只有需求对价格敏感时，小 D 才能缩短突发 → 只能作辅助手段 | 短期，低成本 |
| DX6 LFM / lanes | 低利用率下不会出现拥堵外溢 | 只做需求分析 | — | 有 SLA 需求 → 评估按 `to` 预留；否则放长期 | 长期：利用率 0.32%（K 行） |

## 来源

1. **PRIMARY** EF Blog “Fusaka Mainnet Announcement”（2025-11-06）：BPO1 / BPO2 的参数与日期。
2. **PRIMARY** EIP-8135 “Hardfork Meta – BPO2”（Final）：14/21、update fraction 11,684,671。
3. **PRIMARY** EIP-7892（Final）：BPO 机制。
4. **PRIMARY** EIP-8138 BPO3（Draft）：参数为空。
5. **PRIMARY** EF Blog “Glamsterdam on Hoodi Postponed”（2026-10-22）。
6. **PRIMARY** EF Blog “Glamsterdam Testnet Announcement” 和 ethereum/pm 的 glamsterdam-pm.md：Sepolia 10-06 激活，主网 TBD，包含 block-level access lists。
7. **PRIMARY** OP Spec Ecotone derivation：每个 blob 可用 130,044 字节。
8. **PRIMARY** OP Spec Fjord exec-engine：minTransactionSize 100、intercept、fastlzCoef。
9. **PRIMARY** eth.blockscout.com API v2：batcher 0x2f40…d749 的交易列表。
10. **PRIMARY** eth.blockscout.com API v2：交易 0x70206c50…ba48 的 /blobs（1 个 blob，长度 6,836，frame 首字节 0x01）。
11. **PRIMARY** OP Spec Fjord derivation：Brotli channel 前缀 0x01（本次未单独打开，见开放问题）。
12. **PRIMARY** `mantle-v2@1780605:op-batcher/flags/flags.go`：op-batcher 默认值。
13. **PRIMARY** OP Spec Granite derivation：CHANNEL_TIMEOUT 50。
14. **PRIMARY** OP Spec Jovian exec-engine：DA footprint。
15. **PRIMARY** OP Spec Jovian l1-attributes：值为 0 时默认 400。
16. **PRIMARY** `mantle-v2@1780605:op-node/rollup/derive/l1_block_info.go:55`（另见 L32）。
17. **PRIMARY** Routescan chain 5000：区块 0x61E2D30 和它的 L1 info 交易 0x67687e27…f657。
18. **PRIMARY** Routescan chain 5000：回执 0xa75acff5…e311 及区块 0x61E2365。
19. **PRIMARY** OP Spec Jovian system-config：setDAFootprintGasScalar。
20. **PRIMARY** EIP-1559：base fee 更新公式。
21. **PRIMARY** `op-succinct@6b1cb57:Cargo.toml`：L2–15、L24、L193–205、profiling feature。
22. **PRIMARY** `op-succinct@6b1cb57:MANTLE_CHANGES.md`：§1、§2.3、§3.3、§3.5a、§3.10b、§3.11。
23. **PRIMARY** Routescan chain 1：L2OO 0x31d5…f481 的 `latestBlockNumber` 和 txlist。
24. **PRIMARY** Mantle 路线图（docs.mantle.xyz/network/system-information/roadmap.md）。
25. **PRIMARY** `op-succinct@6b1cb57:validity/src/prom.rs:L10–35`。
26. **PRIMARY** `op-succinct@6b1cb57:validity/src/db/types.rs:L9–24、约 L115–117`。
27. **PRIMARY** `op-succinct@6b1cb57:utils/client/src/client.rs`（约 L74–146）；`programs/range/ethereum/src/main.rs`。
28. **PRIMARY** SP1 Docs：Cycle Tracking。
29. **PRIMARY** SP1 Docs：Prover Gas。
30. **PRIMARY** Base Docs：Azul Proof System。
31. **PRIMARY** Succinct Blog：SP1 Hypercube 16 GPUs（2025-11-18）。
32. **PRIMARY** ZKsync “Introducing Airbender Prime”（X 长文，2026-10-13）。
33. **PRIMARY** Tempo Docs：Payment Lane Specification。
34. **PRIMARY** Tempo Docs：Fees。
35. **PRIMARY** BNB Chain Blog：Payment Lane（2026-10-28）。
36. **PRIMARY** BNB Chain Blog：Jenner 升级指南（2026-10-22）。
37. **PRIMARY** docs.bnbchain.org/announce/jenner-bsc。
38. **PRIMARY** Solana Docs：Instruction Structure。
39. **PRIMARY** EIP-2930。
40. **PRIMARY** Routescan chain 5000：对 12 个区块（0x61D9280…0x61E2D30）调用 eth_getBlockByNumber。
- 主会话 notes-main.md 的 K 行：生产版本、证明网络拓扑、主网参数、0.32% 利用率（引用，不在此重复登记）。
- 线索：姊妹报告 high-performance-chain-roadmap（2026-10-27）；bnb-new-l1-deep-dive 的 ledger（2026-10-24）。
- 降级：cointelegraph、coindesk、spendnode、coingabbar、gate、digitaltoday、cryptobriefing（二手报道）；Medium 的 SP1 对比文章；zksync.io/airbender 上 2025-06 的对比表。

## 矛盾记录

- 区块利用率：本路抽 12 块得到约 0.14%，主会话 24h 全量均值为 0.32%（K 行）。差异来自抽样稀疏，以 K 行为准；两者都远低于 1%。
- 证明后端：路线图写“GPU 证明网络等待主网”，K 行写“生产默认用自建 8×GPU sp1-cluster”。可能是口径不同，待 Mantle 确认。

## 开放问题

1. L1 SystemConfig 的 `daFootprintGasScalar()` 原值是 400，还是 0 走了默认值？
2. FastLZ 估计值与实际 Brotli 字节之比（DX2）；生产是否用 span batch。
3. 生产 batcher 的参数，以及约 37 个 L1 块的发送节奏到底由哪个参数决定。
4. 链上 `aggregationVkey` 是否对应 mantle-v1.6.1 的构建（独立确认 SP1 6.4.0）。
5. 回执中的 `l1BlobBaseFee` ≈ 1.45e15 wei，以及 `blobBaseFeeScalar = 0`（L1 数据费与 blob 实际成本脱钩）。这是有意为之吗？
6. 证明滞后的分布（目前只有 3 个样本），以及 range 在 8×GPU 上的墙钟时间。
7. Fjord derivation 页对 0x01 前缀的原文还没补读。

---

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| D1 | Ethereum BPO1 于 2025-12-09（epoch 412672）激活，blob target/max 为 10/15 | blog.ethereum.org/2025/11/06/fusaka-mainnet-announcement（Mainnet BPO Schedule） | observed |
| D2 | BPO2 于 2026-01-07 01:01:11 UTC（epoch 419072）激活，target/max 为 14/21，update fraction 11,684,671 | [1]；eips.ethereum.org/EIPS/eip-8135（Specification 表） | observed |
| D3 | EIP-8135 是 “Hardfork Meta – BPO2”，状态 Final，2026-01-24 创建；GPT 用它做 BPO2 来源是对的 | eips.ethereum.org/EIPS/eip-8135（头部） | observed |
| D4 | EIP-7892 定义只改 blob target / max / fraction 的 BPO 硬分叉机制，状态 Final（Informational） | eips.ethereum.org/EIPS/eip-7892 | observed |
| D5 | BPO3（EIP-8138）截至 2026-10-31 仍是 Draft，激活时间和参数都为空 | eips.ethereum.org/EIPS/eip-8138（Specification 为 TODO） | observed |
| D6 | Glamsterdam 于 2026-10-06 在 Sepolia 激活；原定 10-26 的 Hoodi 激活已在 10-22 宣布推迟；主网日期未定 | blog.ethereum.org/2026/10/22/glamsterdam-hoodi-delay；blog.ethereum.org/2026/09/17/glamsterdam-testnet-announcement（激活表 Mainnet TBD） | observed |
| D7 | 截至 2026-10-31，Ethereum 主网生效的 blob 参数仍是 BPO2 的 14/21 | 由 D2、D5、D6 推出：此后没有已激活的 BPO 或硬分叉 | inferred |
| D8 | 按 OP v0 blob 编码，单个 blob 最多装 130,044 字节 rollup 数据 | specs.optimism.io/protocol/ecotone/derivation.html（“(4*31+3)*1024 = 130048”，长度上限 130048−4） | observed |
| D9 | 按 BPO2 和 OP 编码口径，Ethereum blob 容量约 151.7 KB/s（target）/ 227.6 KB/s（max），草稿的 152 / 228 KB/s 正确 | 由 D2、D8 推出：14×130,044/12 = 151,718 B/s；21×130,044/12 = 227,577 B/s | inferred |
| D10 | 每笔按 100 字节算，全网共享的 blob 约能支撑 1,517 TPS（target）/ 2,276 TPS（max） | 由 D9 推出：151,718/100、227,577/100 | inferred |
| D11 | 100 字节是 Fjord 费用估算的单笔下限 minTransactionSize，不是压缩后的实测均值 | specs.optimism.io/protocol/fjord/exec-engine.html（参数表：100、−42,585,600、836,500） | observed |
| D12 | Mantle batcher 0x2f40…d749 在 2026-10-30 23:55:59 到 10-31 01:55:59 发出 17 笔 type-3 blob 交易（nonce 215092–215108），平均 7.5 分钟一笔 | eth.blockscout.com/api/v2/addresses/0x2f40D796917ffB642bD2e2bdD2C762A5e40fd749/transactions（timestamp、nonce、type） | observed |
| D13 | 抽查的 batcher 交易 0x70206c50…ba48 只带 1 个 blob，rollup 数据 6,836 字节，约占 130,044 的 5.3% | eth.blockscout.com/api/v2/transactions/0x70206c50…ba48/blobs（items 只有 1 个；blob 头 0x20 00 001ab4） | observed |
| D14 | 该 blob 中 channel frame 数据的首字节是 0x01，即 Brotli 压缩的 channel | 同 D13：frame_data_length 0x1a9c 之后首字节为 0x01；Fjord 规定 0x01 为 Brotli 版本前缀 | observed |
| D15 | Mantle 每天约发 192 个 blob，约占 Ethereum target 容量（100,800 个/天）的 0.19%；按字节约占 0.01% | 由 D2、D12、D13 推出：86,400/450 = 192；7,200×14 = 100,800；约 1.3 MB/天对比约 13.1 GB/天 | inferred |
| D16 | batcher 交易平均间隔约 37 个 L1 区块，可能由 Granite 超时 50 减 sub-safety-margin 10 再减 origin 滞后决定，也可能是显式的 max-channel-duration | [9] 区块号差 34–41；生产配置未公开 | speculative |
| D17 | Granite 把 CHANNEL_TIMEOUT 从 300 个 L1 区块降到 50 个 | specs.optimism.io/protocol/granite/derivation.html | observed |
| D18 | mantle-v2 op-batcher 的代码默认值为 zlib、shadow 压缩器、singular batch、calldata、max-channel-duration 0、target-num-frames 1、sub-safety-margin 10；这些默认值不等于生产配置 | mantle-v2/op-batcher/flags/flags.go:约 L49–140@1780605 | observed |
| D19 | Jovian 对每笔非 deposit 交易计 DA footprint = max(minTransactionSize, FastLZ 估计) × scalar，全块总和写入 blobGasUsed，且必须 ≤ gasLimit | specs.optimism.io/protocol/jovian/exec-engine.html（DA Footprint Block Limit） | observed |
| D20 | Jovian 起，base fee 更新使用 gasMetered = max(gasUsed, blobGasUsed) | 同 D19 | observed |
| D21 | SystemConfig 的 daFootprintGasScalar 为 0 时默认取 400，mantle-v2 里也写死为 400 | specs.optimism.io/protocol/jovian/l1-attributes.html；mantle-v2/op-node/rollup/derive/l1_block_info.go:55@1780605 | observed |
| D22 | daFootprintGasScalar 通过 SystemConfig.setDAFootprintGasScalar(uint16)（onlyOwner）修改，并发出 updateType 7 的 ConfigUpdate 事件 | specs.optimism.io/protocol/jovian/system-config.html | observed |
| D23 | 2026-10-31，Mantle 主网的 daFootprintGasScalar 为 400 | 区块 102,640,944 的 L1 info 交易 0x67687e27…f657 calldata 末两字节为 0x0190；回执 0xa75acff5…e311 中 daFootprintGasScalar 为 0x190 | observed |
| D24 | 一笔 WMNT withdraw 交易的 gasUsed 是 42,365，DA footprint 是 40,000（100 字节下限 × 400） | 回执 0xa75acff5…e311（gasUsed 0xa57d、blobGasUsed 0x9c40） | observed |
| D25 | 在 60M gasLimit 和 scalar 400 下，每块最多 150,000 估计字节（约 75 KB/s），15M target 对应每块 37,500 估计字节 | 由 D19、D23、D28 推出 | inferred |
| D26 | 每估计字节耗 gas 少于 400 的交易（例如 21k 的转账）会先触到 DA footprint 限制，而不是 gas 限制 | 由 D19、D24 推出：footprint 至少 40,000，大于 21,000 | inferred |
| D27 | 草稿 E7 的“footprint 先到 → 瓶颈在 DA”说过头：footprint 先到只说明计量约束先收紧，而 Mantle 实际 blob 装载率只有约 5% | 由 D13、D19、D25、D26 推出 | inferred |
| D28 | 2026-10-31 02:03 UTC，Mantle 区块 102,640,944 的 extraData 给出 D=50、E=4、最低 base fee 50 gwei，gasLimit 为 60,000,000 | Routescan chain 5000 eth_getBlockByNumber latest | observed |
| D29 | 当时 Mantle 的 base fee 正好等于 50 gwei 下限 | 同 D28（baseFeePerGas 0xba43b7400） | observed |
| D30 | EIP-1559 中 target = limit // ELASTICITY_MULTIPLIER，base fee 变化量 = base_fee × 偏差 // target // DENOMINATOR | eips.ethereum.org/EIPS/eip-1559（Specification） | observed |
| D31 | 按 Mantle 现行参数，一个 60M 满块会让下一块的 base fee 上涨 6% | 由 D28、D30、D20 推出：(60−15)/15/50 | inferred |
| D32 | 连续 40 个满块后，base fee 约为起点的 10.29 倍（+929%） | 由 D31 推出：1.06^40 | inferred |
| D33 | 突发结束后若为接近空的区块，base fee 每块降约 1.99%，约 116 块（约 3.9 分钟）回到下限 | 由 D30、D32、D36 推出 | inferred |
| D34 | 降低 elasticity 会降低单块最大涨幅 (E−1)/D：固定 limit 时 target 变高、价格反应变慢；固定 target 时 limit 变低、积压更大；两种情况积压都不会更快清零 | 由 D30 推出：E=2、D=50 时只涨 2% | inferred |
| D35 | 草稿“提高 denominator 的反应速度”方向写反了：要加快反应应降低 denominator | 由 D30 推出：变化量与 1/D 成正比 | inferred |
| D36 | 在 22 小时内抽取的 12 个区块平均 gasUsed 为 84,458（约为 60M 的 0.14%），其中 10 块只有 L1 info deposit | Routescan chain 5000，区块 0x61D9280…0x61E2D30 | observed |
| D37 | 抽样利用率（0.14%）低于主会话 24h 全量均值 0.32%，差异来自抽样稀疏；两者都说明主网负载远低于容量 | 由 D36 与 notes-main K 行推出 | inferred |
| D38 | Mantle 的 op-succinct fork 跟随上游 v3.12.0，固定 SP1 =6.4.0（Hypercube）和 sp1-cluster v2.7.2 | op-succinct/Cargo.toml:24、193–205@6b1cb57；MANTLE_CHANGES.md §1 | observed |
| D39 | Mantle 的 op-succinct 只保留 validity 模式，fault-proof 的 crate 和合约已整体删除 | MANTLE_CHANGES.md §2.3、§3.3@6b1cb57；Cargo.toml:2–15 的 members 中没有 fault-proof | observed |
| D40 | op-succinct 的 kona 等依赖固定在 mantle-v2 tag mantle-v1.6.3，revm 来自 mantle-xyz/revm v107-mantle-arsia.2 | op-succinct/Cargo.toml（kona-* 条目）@6b1cb57；MANTLE_CHANGES.md §1 | observed |
| D41 | L1 上 L2OO（0x31d5…f481）的 latestBlockNumber 为 102,638,546；最近三次 proposeL2Output 各相隔 1,800 个 L2 块（约 1 小时），每次约 431.5k gas，另有约 49k gas 的 checkpointBlockHash | Routescan chain 1：eth_call 0x4599c788 返回 0x61e23d2；txlist（0x61e15c2→0x61e1cca→0x61e23d2） | observed |
| D42 | 最近一次 validity 提交距被证明区间的末块约 40 分钟、距首块约 100 分钟 | 由 D41、D28 推出：提交时间 1793409803；按 2 秒出块推得末块时间为 1793407404 | inferred |
| D43 | Mantle 路线图写明，“分布式 GPU 证明网络”已支持 Sepolia 和 QA，状态为 “Waiting for Mantle Mainnet” | docs.mantle.xyz/network/system-information/roadmap.md | observed |
| D44 | 生产版本 mantle-v1.6.1 用的是 SP1 6.4.0 / sp1-cluster v2.7.2 这条线 | 由 MANTLE_CHANGES.md §1 版本表（mantle-v1.6.0 起为 SP1 6.4.0）、§3.5a（v1.6.1 是不含 migration 7 的旧版发布）与 K 行（生产为 v1.6.1）推出；链上 vkey 未读 | inferred |
| D45 | op-succinct 证明请求的状态机为 Unrequested → WitnessGeneration → Execution → Prove → Complete → Relayed，并记录三段耗时 | op-succinct/validity/src/db/types.rs:9–24、约 115–117@6b1cb57 | observed |
| D46 | range guest 只标了 payload-derivation 和 block-execution 两个 cycle span，MPT / state root 的开销计在 block-execution 里 | op-succinct/utils/client/src/client.rs（约 L74–146）@6b1cb57；state root 在 execute_payload 内，由代码结构推出 | inferred |
| D47 | Mantle op-succinct 的 sp1-sdk 开启了 profiling feature | op-succinct/Cargo.toml:194@6b1cb57 | observed |
| D48 | SP1 的 cycle-tracker-report 只在开启 profiling 时才会写入 ExecutionReport | docs.succinct.xyz/docs/sp1/optimizing-programs/cycle-tracking | observed |
| D49 | SP1 prover gas 从 4.1.4 版起提供，计入了 precompile 的成本差异，量级标定在 cycles 附近 | docs.succinct.xyz/docs/sp1/optimizing-programs/prover-gas | observed |
| D50 | MANTLE_CHANGES 记录：sha3 patch tag 与 alloy-primitives 不匹配时，keccak 会悄悄退回软件实现，证明更贵 | MANTLE_CHANGES.md §3.11 trap 4@6b1cb57 | observed |
| D51 | 草稿“Mantle 当前性能瓶颈主要在 ZK proof system”目前没有公开证据，需要按 DX4 复现 | 只有作者草稿的陈述 | speculative |
| D52 | Base Azul 中 TEE 和 ZK 两种证明都在时 1 天结算，只有一种时 7 天（Beryl 后 5 天），ZK 可以推翻 TEE | docs.base.org/upgrades/azul/proofs | observed |
| D53 | Base 多证明的官方动机是缩短提款延迟和消除挑战的经济攻击面 | 同 D52（Motivation） | observed |
| D54 | 多证明改变的是结算规则和信任假设，不会提升 ZK prover 的速度 | 由 D52、D53 推出 | inferred |
| D55 | Airbender Prime（2026-10-13）用单张 RTX PRO 6000 证明连续 7,200 个 L1 区块，99% 在 10 s 内、全部在 12 s 内（自测） | x.com/zksync/article/2110011544360607842 | observed |
| D56 | SP1 Hypercube（2025-11-18）用 16 张 RTX 5090 证明 954 个 L1 区块，99.7% 在 12 s 内、95.4% 在 10 s 内（自测） | blog.succinct.xyz/real-time-proving-16-gpus | observed |
| D57 | D55、D56 的 L1 实时证明成绩不能直接换算成 Mantle 的证明能力 | 由 D41、D45、D55、D56 推出：Mantle 证明的是 1,800 块的 OP 派生加定制执行，还有 agg 和 Plonk | inferred |
| D58 | Tempo 用 general_gas_limit 限制非支付交易；是否算支付只看交易数据，不读状态 | docs.tempo.xyz/protocol/blockspace/payment-lane-specification | observed |
| D59 | Tempo 文档写约 94% 的区块空间留给支付交易，且预留不保证纳入 | docs.tempo.xyz/protocol/fees/spec-fee | observed |
| D60 | BSC Payment Lane（BEP-703）默认留出 5% 的 gas、最高 10%，闲置部分不让给普通交易，排序不变 | bnbchain.org/en/blog/payment-lane-how-bsc-reserves-capacity-for-payments（2026-10-28）；Jenner 升级指南（2026-10-22） | observed |
| D61 | Jenner 于 2026-10-28 在 BSC 测试网激活，主网时间尚未公布 | 同 D60；docs.bnbchain.org/announce/jenner-bsc | observed |
| D62 | 草稿中的 “Binance New L1” 指 BNB Chain New L1：其 Multi-Lane 按 to 地址预留容量，目前只有内部 devnet | bnb-new-l1-deep-dive/research/ledger.md C4、C9、X44–X48（2026-10-24） | observed |
| D63 | EIP-2930 的 access list 是可选的，目的是方便预取 | eips.ethereum.org/EIPS/eip-2930 | observed |
| D64 | Solana 指令为每个账户声明 is_writable，验证者据此判断哪些交易可以并行 | solana.com/docs/core/instructions/instruction-structure | observed |
| D65 | EVM 实现 Solana 式 LFM 的主要障碍是交易没有强制事先声明的写集，只能改交易格式，或者做无状态的 to / 调用形态分类 | 由 D58、D60、D62–D64 推出 | inferred |
| D66 | Glamsterdam 的 block-level access list 是出块后按区块生成的，不能直接用作 LFM 的分类依据 | 由 EF Glamsterdam 公告（列出 block-level access lists）与 EIP-7928 的定义推出；EIP 原文本次未打开 | inferred |
| D67 | Mantle 主网的 blobBaseFeeScalar 为 0、baseFeeScalar 为 168,507，因此 L1 数据费只按 L1 base fee 计价 | L1 info calldata 和回执 l1BlobBaseFeeScalar 0x0；计价结论由 Ecotone 费用公式推出 | inferred |
| D68 | 回执中的 l1BlobBaseFee（约 1.45e15 wei）不像真实值，可能是主网 L1 配置只包含 Cancun+Prague blob schedule 造成的 | 回执 0xa75acff5…e311；MANTLE_CHANGES.md §3.1a@6b1cb57 | speculative |
| D69 | 每约 7.5 分钟一次的批次发布加上 L1 最终性，构成 validity 证明滞后的下限（op-succinct 默认只证明到 L2 finalized） | op-succinct/validity/src/prom.rs（L2MaxProvableBlock 说明）@6b1cb57，结合 D12；与 K 行“只证 finalized”一致 | inferred |
| D70 | gateway 同时只证明 1 个 range、每个 range 1,800 块（3,600 s 链上时间），所以持续负载下单个 range 的 witnessgen + 证明墙钟时间必须低于约 3,600 s，否则 range 积压会无界增长；witness 1,800 s 超时是另一条硬边界 | 由 K 行（1 range 并发、1,800 块、witness 超时 1,800 s）与 D41 推出 | inferred |

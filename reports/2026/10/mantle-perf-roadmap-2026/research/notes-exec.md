# X 路调研笔记：执行、状态、存储、commitment

> 调研日期 2026-10-31。台账前缀 X。网页访问日期均为 2026-10-31，另注明的除外。
> 本文件按运行时指定的产出路径写入；目标位置 `reports/2026/10/mantle-perf-roadmap-2026/research/notes-exec.md` 由主会话落盘。
> 源码引用格式 `仓库/路径:行号@短哈希`。mantle-xyz/reth @574e7f3、mantle-xyz/op-succinct @6b1cb57、paradigmxyz/reth main @84caec5、paradigmxyz/reth v2.2.0 @88505c7（`/tmp/rhsrc/reth-v2.2.0`），均为 2026-10-31 shallow clone。
> 本路没有 shell：版本、日期来自 GitHub Release 页面 / GitHub REST API，源码靠逐文件阅读，没有跑 `rg`、`cargo` 或 `gh`。
> 生产部署事实（主网 sequencer 仍是 op-geth、reth 是候选；生产 reth 节点 mantle-v1.6.2 设 `--engine.persistence-threshold=0`、`--engine.memory-block-buffer-target=0`、MDBX Durable、不裁剪）由主会话核实，见 notes-main.md 的 K 行，本文件引用但不重复登记。

---

## X1 Mantle reth 的依赖基线，以及 evm2 要移植哪些定制

**答案。** mantle-xyz/reth main 由三层组成：
- 上游 reth crate 钉在 paradigmxyz/reth rev `88505c7f`（= v2.2.0）；
- 一份 vendored 的 op-reth（来自 ethereum-optimism/optimism `op-reth/v2.2.1`）；
- 自研的 `mantle-reth/` 层。

revm / op-revm 用 Mantle fork `mantle-xyz/revm` tag `v107-mantle-arsia.2`（revm 38.0.0 / op-revm 19.0.0）。最新 release 是 `mantle-v1.6.2`（2026-10-12），搭配的 revm tag 没变。迁到 evm2 时要移植的点有 7 处，见下表。

**依据。**
- 版本钉选：`mantle-xyz/reth/Cargo.toml:4,9-10,32,235-251,257,260-267@574e7f3` [1]。revm 38.0.0 / op-revm 19.0.0 的具体版本号引自姊妹报告 revm-vs-evm2 台账 M1（2026-10-25 核实）[26]。
- reth core 打了 3 个补丁：`reth-trie-common`、`reth-transaction-pool`、`reth-provider`（`Cargo.toml:421-425`）。其中 reth-provider 的补丁是“hashed-snapshot exec-read fix”（`Cargo.toml:116-118`）[1]。
- release：`mantle-v1.6.2` 于 2026-10-12T08:59:19Z 发布，“Paired components unchanged… revm / op-revm v107-mantle-arsia.2”。`op-reth-v2.2.1-mantle-arsia.2`（2026-08-26）引入 preconf，并把 revm 改为公开 fork [2]。

**evm2 移植清单（由代码推出，inferred）。**

| # | 位置 | 内容 | 依据 |
|---|---|---|---|
| 1 | `mantle-xyz/revm` 的 op-revm handler | ARSIA/JOVIAN、BVM_ETH、token_ratio、DA footprint、Arsia 费用校验、GHSA 修复 | `mantle-xyz/op-succinct/Cargo.toml:180-187@6b1cb57` [12]；姊妹报告 F15（约 5.7k 行）[26] |
| 2 | `alloy-op-evm` / `op-alloy`（mantle-v2 tag `mantle-v1.6.3`） | EVM 工厂、交易类型 | evm2 不再走 alloy-evm，这一层要换成 evm2 的类型族加 tx handler（姊妹 F5、F18） |
| 3 | `revm-inspectors` fork（`v0.39.0-mantle-arsia.2`） | trace / debug | v2.9.0 已换成 `evm2-inspectors` [8] |
| 4 | `mantle-reth/crates/preconf` | 直接用 `op_revm::L1BlockInfo` 和 `reth_revm::State`；整份 OP payload builder 是 fork | `payload_builder.rs:1-14,26,51-54` [3] |
| 5 | `mantle-reth/crates/rpc-ext`、`eth-api` | Arsia 费用估算、token_ratio、eth_simulateV1 | release notes [2] |
| 6 | `patches/reth-transaction-pool` | `extra_balance_cost` hook（L1 fee 与 operator fee 进入余额检查） | [1]、[2] rc4 说明 |
| 7 | 证明路径 | kona executor（mantle-v2）与 op-succinct 钉同一个 revm tag，必须和执行客户端锁步 | [12]；姊妹报告 F15 |

**不确定之处。**
- `mantle-xyz/revm` 本身的 diff 这次没有重读，沿用姊妹报告 2026-10-25 的结论。
- `patches/reth-provider` 的具体改动这次没读。

---

## X2 上游 reth evm2：是否已发布、breaking change、性能数字、op-reth 是否同步

**答案。** 已发布。Reth v2.9.0 于 **2026-10-29T12:36:47Z** 发布，把 revm 整体换成 evm2（#25002）。

- **Breaking change。** 发布说明写明 SDK 使用者的“Custom EVMs, precompiles, inspectors and executors need porting to evm2's APIs”；节点运营者不需要改配置，可以降级回 v2.8.1。
- **官方性能数字。** evm2 让区块执行“about 10% faster”：500 个主网区块上吞吐 +10.0%、执行时间中位数 −10.5%；300M gas 大区块上 +9.3%，开 BAL 时 +6.6%。发布说明没有写硬件和测量方法。
- **OP 上游没跟。** op-reth 最新是 `op-reth/v2.8.0`（2026-10-27），基于 reth v2.6.0，也就是仍在 revm 上。
- **姊妹报告已过时。** revm-vs-evm2（10-25）写的“reth main 已切换但未发布”已被 10-29 的发布推翻。

**依据。**
- [8] GitHub API `releases/tags/v2.9.0`：`published_at`、正文、依赖 `evm2 f93318f`。
- [9] `op-reth/v2.8.0` 发布页与 API：`published_at 2026-10-27T20:17:18Z`，“Update reth to v2.6.0”。
- [26] 姊妹报告 F9。

**不确定之处。**
- 10% 的基准条件（硬件、区块区间、对比的 revm 版本）发布说明没有给。和姊妹报告里 evm2#384 的 1.10–1.19×（Ryzen 9 7950X，10 个区块）量级一致，但口径不同。
- OP 上游何时迁 evm2，没有找到公开计划。Foundry #17541 把 OP 的 evm2 实现放在个人仓库 `mablr/evm2-networks`，并注明“OP post-execution settlement… explicit gaps”（来自检索摘要，没有逐页核对）。

---

## X3 Reth 2.0 的 state root、存储分层、持久化，以及 Mantle builder 是否用上了这些优化

**先说清适用范围。** 主网 sequencer 仍是 op-geth，reth 只是候选（K 行）。所以下面的“builder 路径”结论描述的是**把 reth 换成 sequencer 之后**的出块路径。今天生产 reth 节点（RPC / verifier）走的是 engine 的 `newPayload` 校验路径，加上每块持久化。

**1–2 ms 指什么。** Paradigm 原文是“reduces the time spent calculating the final state root at the end of each mainnet block to just 1–2ms”，前提是跨块常驻内存的 Sparse Trie Cache 和后台 root 任务。它说的是区块末尾剩下的那段 root 计算，不是 root 的总工作量。测量环境是以太坊主网、AMD EPYC 4585PX、128 GB 内存、NVMe RAID。在 reth 里，这套流水线挂在 engine 的 `newPayload` 校验路径上。

**存储分层。** Storage v2 是 reth 的正式名称（`StorageSettings.storage_v2`，CLI 参数 `--storage.v2`）：
- MDBX 里只存 hashed state；
- changeset、receipt、sender 进 static files；
- 历史索引和交易哈希索引进 RocksDB。

新库默认 v2，已有库沿用元数据里记录的模式。可以用 `reth db migrate-v2` 迁移，用 `reth db settings get` 查看。op-reth v2.8.0 已宣布 Storage v1 在 2027-01 EOL。

**草稿“需要确认 db 是 v1 还是 v2”。** 这个问题其实是可回答的。应改写为：

> 在每个生产 reth 节点上运行 `op-reth db settings get`，结果是什么？datadir 是从 v1.9.3 时代继承的，还是用 2.x 新建的？是否需要在 2027-01 之前执行 `migrate-v2`？

**Builder 路径：Mantle 的两个 builder 都没有接入流水线 root（reth 当 sequencer 时）。**

- **开 preconf 时。** `PreconfPayloadBuilder` 是 `OpPayloadBuilder` 的 fork。
  - 它显式丢弃了 `CachedReads`：注释写 “upstream's `CachedReads` reuse optimization is not wired here … deliberately ignored”。
  - 每次构建都新建一个 `State<DB>`。
  - 封块时调用 `builder.finish(state_provider_for_finish, None)`。
- **不开 preconf 时。** 回退到 vendored op-reth v2.2.1 的 `OpPayloadBuilder`。
  - 它在 `build_payload` 里用 `..` 丢掉了 `BuildArguments` 中的 `execution_cache` 和 `trie_handle`。
  - 同样调用 `finish(state_provider, None)`。

`finish` 的第二个参数为 `None` 时，会在区块末尾同步调用 `state_root_with_updates()` 算 root。

**v2.2.0 本身已经提供了把 cache 和 sparse trie 交给 builder 的通道，只是默认关闭，而且 Mantle 的 builder 不接收。**
- engine 收到带 payload attributes 的 FCU 时，只有在 `--engine.share-execution-cache-with-payload-builder` / `--engine.share-sparse-trie-with-payload-builder` 打开时，才会把 `cache` 和 `trie_handle` 放进 `BuildNewPayload` 发给 builder。两个参数默认都是 false。
- v2.2.0 对后一个参数的说明正是：“Replaces the payload builder's blocking `state_root_with_updates()` call with the sparse trie, computing the state root concurrently with transaction execution”。
- 即使打开这两个参数，Mantle 的两个 builder 也会把这两个字段丢弃，所以没有效果（inferred）。
- Mantle 的 builder 代码里没有 prewarm 调用。v2.2.0 的 prewarm 和 sparse trie 都在 engine 的 payload processor 里，作用于 `newPayload` 校验。

上游 reth main 的 Ethereum builder 则会接收 `execution_cache` 和 `state_root_handle`，并用 `finish_with_state_root` 拿后台任务算好的 root。

所以：
- 草稿把“Reth 2.0 已把 root 降到 1–2 ms”当作出块路径的背景，不适用于 reth 当 sequencer 时的 Mantle 封块路径（inferred）。
- E8 的措施“追平上游 reth（prewarm 复用等）”只升级依赖不够，需要同时满足三件事（inferred）：
  1. 打开两个 share 参数；
  2. 改两个 builder，让它们接收并使用这两个字段；
  3. 按参数说明，避免 builder 与 engine 争用同一棵 sparse trie。

**每块持久化对封块和执行路径的影响（reth v2.2.0 源码）。**

*持久化怎么触发。*
- `should_persist()` 的条件是：
  - 没有正在构建 payload（`building_payload`，只在打开 `--engine.suppress-persistence-during-build` 时生效，默认 false）；
  - backfill 空闲；
  - `canonical - last_persisted > persistence_threshold`。
- 参数说明写明 “To persist blocks as fast as the node receives them, set this value to zero”。
- 生产设为 0，加上 `memory-block-buffer-target=0`（持久化目标就是 canonical head），效果是：每出现一个新的 canonical 块，只要当时没有持久化在跑，就立即持久化到 head。

*持久化和执行是否并行。* 是并行的。
- `PersistenceService` 在自己的 OS 线程里做阻塞 IO。engine 通过 channel 发出 `save_blocks` 后立即返回。
- engine 主循环用 `select_biased!` 同时等两样东西：持久化完成，以及新的 engine 消息（`newPayload` / FCU）。
- 所以下一块的执行与上一块的提交是并行的。
- 但同一时间只有一个持久化任务：`advance_persistence` 只在 `!in_progress` 时启动新任务。任务进行期间新到的块留在内存里，等上一个任务完成后一起批量写入。

*backpressure 何时触发。*
- 条件是 `persistence_state.in_progress() && persistence_gap >= persistence_backpressure_threshold`，默认 16，K 行没有提到生产改过。
- 一旦触发，engine 停止读取输入 channel，只等持久化完成。这时 `newPayload` 和 FCU 都会排队，回复被推迟。
- 推算：按 2 s 一块，单次持久化提交要持续约 15 个块间隔（约 30 s）以上才会触发。正常情况下每块持久化不会进入封块或校验的关键路径（inferred）。

*仍可能有的间接影响（inferred / speculative）。*
- 每块一次提交，加上 Durable 模式下每次提交的同步落盘，提交次数是默认阈值 2 时的约 3 倍（默认要等差距大于 2 才写）。持久化线程的磁盘写会和执行线程的冷读争用同一块 NVMe。
- memory buffer 为 0 时，内存 overlay 很浅，执行读状态更多直接落到 DB。
- 这两点都没有实测数据。应当用 reth 的 persistence 指标（`commit_duration`）和 `backpressure_active` / `backpressure_stall_duration` 指标核对。
- 如果 reth 将来当 sequencer，`--engine.suppress-persistence-during-build` 可以把持久化推迟到构建结束之后。它的说明写着 “Useful on chains with short block times where persistence I/O can interfere with block building latency”。这是 v2.2.0 已有、默认关闭的选项。

**依据。**
- [10] Paradigm “Releasing Reth 2.0” §Optimising Parallel State Calculation、§Tiered Storage、脚注硬件。
- [11] reth.rs/run/storage、`StorageSettings` rustdoc、`reth db settings` 源码。
- [9] op-reth v2.8.0 的 Storage 小节。
- [3] `mantle-reth/crates/preconf/src/builder/payload_builder.rs:1-14,888-892,925-928,1185-1187@574e7f3`。
- [4] `payload_service_builder.rs:161-182@574e7f3`。
- [5] `op-reth/crates/payload/src/builder.rs:221-230,247-250,334-335,356,473-474@574e7f3`。
- [6] `paradigmxyz/reth/crates/ethereum/payload/src/lib.rs:162-169,228-235,453-477@84caec5`。
- [7] reth rustdoc `BlockBuilder::finish`。
- [29] reth v2.2.0 源码 @88505c7：
  - `crates/engine/primitives/src/config.rs:7,10,13,239-241`；
  - `crates/engine/tree/src/tree/mod.rs:487-501,545-554,593-608,614-630,1388-1400,2016-2034,3214-3236`；
  - `crates/engine/tree/src/persistence.rs:35-42`；
  - `crates/node/core/src/args/engine.rs:305-315,473-512`。

**不确定之处。**
- `state_root_with_updates` 在 v2.2.0 里是否内部并行（例如 `ParallelStateRoot`）没有核实。所以只能说“没有用跨块 sparse trie 流水线”，不能说“完全串行”。
- reth 当 sequencer 时，`engine_newPayload` 收到自己构建的块，是否复用已执行结果、跳过重执行，没有核实（speculative）。
- 生产节点的 `persistence-backpressure-threshold` 是否保持默认 16，K 行没有说明。这里按默认值推算。
- 每块持久化的磁盘争用对执行时延的实际影响没有数据。

---

## X4 Parallel EVM：外部现状，以及怎样重做依赖实验

**答案。**
- RISE pevm README 在 2026-10-31 仍写“**work in progress** and is **not production ready**”。README 自述：以太坊区块上平均约快 2 倍，独立 Uniswap swap 组成的 gigagas 区块上快 22 倍，但“wasn't good enough to justify complex node integrations”。
- 生产上的 EVM 并行：Sei v6.6 于 2026-08-04 上主网，Ares（Block-STM 风格 OCC）是升级后节点的默认执行路径。
- 可并行度的公开数据（姊妹报告，2026-10-27）：MegaETH 测得以太坊区块中位并行度 <2；Mantle 2025 年的 49.10% 依赖率是启发式口径（同发送方、同合约同 selector），不是 slot 级冲突率。

**草稿“去年发现 Mantle 交易依赖高”应怎样重测（建议）：**
1. **样本。** 回放 Mantle 主网多个时段的区块，用 revm 的 BAL 构建 API（v107 已有，见姊妹 F6）或 inspector，采集每笔交易在**账户字段和 storage slot 粒度**上的读写集。
2. **依赖图与上限。** 按 canonical 顺序建 RAW / WAW 依赖图，算出**加权关键路径**：以 gasUsed 或实测执行时间为权重的最长链。可达加速比上限 = 总执行量 / 关键路径。
3. **排除实现带来的假依赖。** 例如 coinbase、fee vault 的累加，L1 block info 等系统读。OP 系做法是延迟计费；Mantle 有 3 个 vault 分账（姊妹报告 B-3）。分别报告“含”和“不含”这类依赖的结果。
4. **关注点。** 不看冲突比例，看关键路径占总执行时间的比例，以及热点合约（mStocks、Router）在关键路径上的份额。

**依据。**
- [24] risechain/pevm README（2026-10-31）。
- [18] Sei Giga 文档 Status (August 2026)。
- [25] 姊妹报告 notes-exec E18、E21、E30。

**不确定之处。**
- Monad 主网并行执行的实际加速数据没有公开。
- Mantle 当前交易组合（mStocks 上线后）的依赖结构没有新数据。

---

## X5 commitment 与 DB 候选：逐个核实，并分成三类

**答案。** 草稿把“替换 MPT”和“换 DB”放在一起，实际上要分三类：

| 类别 | 候选 | 保持以太坊 MPT 根与 `eth_getProof`？ | 依据 |
|---|---|---|---|
| ① 保持承诺，只改存储 | Reth Storage v2（MDBX + static files + RocksDB）；**Base TrieDB**（4 KB 页存 MPT，哈希仍按 RLP 计算）；MonadDb 的存储层设计（异步 IO、原生 trie 布局） | 是 | [10][11][21]；姊妹 E40 |
| ② 新的认证结构（根不同） | **QMDB**（append-only twig Merkle）、**NOMT**（自定义二叉 Merkle trie）、**SALT**（4 层 256 叉主 trie + SHI 哈希桶 + IPA/Pedersen 向量承诺）、**EIP-7864**（统一二叉树，Draft，哈希函数未定） | 否 | [19][20][22][16] |
| ③ 改变承诺粒度或摘要 | **Monad MIP-8**（trie 承诺 `{page_index, page}`，128 词 / 4096 B，BLAKE3 ISMC，SLOAD/SSTORE 改按页计 gas，`eth_getProof` 必须改）；**Sei LtHash**（对写日志做同态摘要，热路径上没有 Merkle 根，用 BUD 代替全局状态证明；FlatKV / LtHash 仍由运营者开启，默认关闭） | 否，还改了 gas 或证明接口 | [17][18] |

只有第①类不需要协议升级。第②③类都会改变 state root、witness、桥 / 提款证明和 `eth_getProof`；在 OP Stack 上还要同步改 op-geth / reth / kona / 证明程序（inferred）。

**依据。** 见表内编号。其他补充：
- QMDB 宣称“比 RocksDB 快至多 6 倍、比 NOMT 快 8 倍、每秒 2.28M 次更新”，这些是作者自测，摘要没有说明和 MPT 是否兼容 [19]。
- SALT 仓库带三份审计报告：Sherlock 2025-09、Cantina 2025-10、BlockSec 2025-12 [22]。
- Base TrieDB README 宣称读写一个值的磁盘操作从约 50 次降到约 4–8 次 [21]。

**不确定之处。**
- Base TrieDB 是否已在 Base 生产节点启用：README 没有状态说明，本路也没找到 2026 年的确认。
- MIP-8 在 Monad 主网的激活日期没有核实。
- NOMT 的最新版本号本路没有读到。姊妹报告记为 crates.io 1.0.x（2026-10-27）。

---

## X6 MPT 在 zkVM 里的成本

**答案。** 草稿说“MPT 在 SP1 中有大量 RLP 和 Keccak”，方向上合理，但没有找到 Mantle 或 OP Succinct 按“MPT / EVM / 派生”拆开的公开 profile。已经能确认的有三点：
1. **keccak 已走 SP1 precompile。** Mantle op-succinct 用 SP1 6.4.0（Hypercube），并通过 `alloy-primitives` 的 `sha3-keccak` 特性，配合 `sha3`（tag `patch-sha3-0.10.8-sp1-6.0.0`）和 `tiny-keccak` 补丁，让 keccak 走 precompile。补丁注释专门提醒：版本不配套时 cargo 会静默回落到软件 keccak。`Cargo.lock`（13506 行）末尾没有 `[[patch.unused]]` 段，说明锁文件里补丁生效。SP1 官方文档也写明：补丁失配是“a large cycle regression, since keccak drives MPT/state-root hashing”。
2. **有现成的拆分工具。** OP Succinct 的 `cost-estimator` 会分别报告 oracle verification、derivation、block execution 的开销，以及各 precompile 的 cycles。SP1 的 prover gas 比 RISC-V cycles 更接近实际证明成本。
3. **实现优化空间很大。** ethrex 自报：仅优化 trie 实现，trie 哈希 cycles 就降 75%，预序列化 trie 让总 cycles 降 22%。说明 MPT 在 zkVM 里的成本很大一部分取决于实现，不只取决于承诺结构。

**依据。**
- [12] `mantle-xyz/op-succinct/Cargo.toml:164-166,194-196,229-253@6b1cb57`；`Cargo.lock:13470-13506`。
- [13] SP1 docs Precompiles § alloy-primitives keccak256。
- [14] SP1 docs Prover Gas；op-succinct book `cost-estimation-tools.md`。
- [15] ethrex docs zkVM Comparison § Optimization Impact。

**不确定之处。**
- 只读了 workspace 根目录 `Cargo.lock` 的末尾。guest ELF 如果用独立 lockfile 构建，需要另行核对（可看 `ExecutionReport.syscall_counts` 里有没有 keccak syscall）。
- Mantle 区块的 MPT 部分占证明成本多少，没有公开数据，只能实测。

---

## X7 state expiry 的动机

**答案。** 草稿说“MegaETH 提出把所有状态放进内存，所以需要 state expiry”。在 MegaETH 一手材料里找不到这层因果。MegaETH 的说法是：
- sequencer 配“abundant RAM to hold the entire blockchain state”（1–4 TB，当时按以太坊状态约 100 GB 估计）；
- SALT 的卖点是**认证层**很省内存：30 亿条 KV 只要约 1 GB，状态根更新不再有随机磁盘 IO。

两者都没有提 state expiry。Reth 这边，Storage v2、static files 和 pruning / minimal 模式在不做 expiry 的前提下就能控制节点占用：以太坊 minimal 节点小于 300 GB，Storage v2 的 minimal 节点占用约 224 GB（v1 为 449 GB）。

**依据。**
- [23] MegaETH Research 页。
- [22] SALT README。
- [10] Reth 2.0 § Minimal Mode。
- [11] reth.rs/run/storage 的磁盘占用表。

**不确定之处。**
- MegaETH 是否在别处（推文、演讲）谈过 state expiry，没有检索到。
- Mantle 当前活跃状态和历史数据的大小，本路没有数据。生产 reth 不裁剪（K 行），历史数据会一直增长。

---

## 对草稿 / GPT 评审的修正

1. **草稿“revm → evm2：随上游 reth 更新引入 evm2”说得太轻。**
   - evm2 只在 reth v2.9.0（2026-10-29）里；Mantle 停在 v2.2.0，中间隔 7 个小版本。
   - OP 上游 op-reth 最新 v2.8.0 仍基于 reth v2.6.0（revm）。Mantle 如果现在就迁，等于自己先把 OP 层（op-revm 语义、alloy-op-evm、inspectors、preconf builder）移植到 evm2，再同步移植 kona 和 SP1 证明路径（X1、X2）。
   - 上游给的收益约 10%，是以太坊主网口径。
   - 主网 sequencer 现在是 op-geth，evm2 的执行收益在 sequencer 换成 reth 之前，只体现在 reth RPC / verifier 节点上。
2. **姊妹报告 revm-vs-evm2（10-25）“reth main 已切换但未发布”已过时。** v2.9.0 已于 10-29 发布（X2）。
3. **草稿 §2.1“Reth 2.0 已把主网区块末尾的 root 降到 1–2 ms”被当作出块路径的背景，这不成立。**
   - 今天出块的是 op-geth。
   - reth 当 sequencer 时，Mantle 的两条 builder 路径都丢弃了 engine 提供的 `execution_cache` 和 `trie_handle`（preconf 路径连 `CachedReads` 也丢弃），封块时调用 `finish(…, None)` 同步算 root。v2.2.0 里把它们交给 builder 的开关默认也是关的（X3）。
   - 所以草稿引用的“2024 年 root 占封块时间 75% 以上”的问题，在 reth 当 sequencer 的封块路径上可能仍然存在。这是推断，要实测。
4. **草稿 E8 的措施“追平上游 reth（prewarm 复用等）”不充分。**
   - prewarm 和 sparse trie 都在 engine 校验路径上。
   - 要让 builder 受益，必须同时打开 `--engine.share-execution-cache-with-payload-builder` / `--engine.share-sparse-trie-with-payload-builder`，并修改 Mantle 的两个 builder，让它们接收和使用这两个字段（X3）。
5. **草稿 E6（RPC 导入延迟）、E8（满块）要把持久化单独计时。**
   - 生产 reth 每块持久化，并且是 Durable 模式。持久化在独立线程上，和下一块执行并行。只有单次提交持续约 15 个块间隔以上（默认 backpressure 16）时，才会阻塞 engine。
   - “RPC 导入 p99 超过 500 ms → 换 NVMe”的判读，应改为先看 `commit_duration`、`backpressure_active` 和 `backpressure_stall_duration`，确认磁盘问题出在持久化提交还是执行冷读（X3）。
6. **GPT §2.4“不宜再笼统写成 MDBX v1 还是 v2”说过了头。** “Storage v1 / v2”正是 reth 的官方术语（`StorageSettings.storage_v2`），问题可以直接用 `db settings get` 回答。GPT 关于存储分层的描述正确，但应补上：op-reth 已宣布 Storage v1 在 2027-01 EOL，这是一个有截止日期的运维事项（X3）。
7. **GPT §2.4 关于 v2.9.0 的事实正确。** 日期、breaking 范围、“1–2 ms 是区块末尾剩余 root 时间”都核实无误。应补充：上游性能数字是 +10.0% / −10.5%（500 个主网区块）和 +9.3%（300M gas 区块），且发布说明没有给硬件（X2）。
8. **草稿把 commitment 候选和 DB 候选混在一起。**
   - Base TrieDB 保持 MPT，属于第①类。
   - MonadDb 的存储设计可以参考，但 Monad 现在的 MIP-8 已改变承诺粒度和 gas，属于第③类。
   - MegaETH SALT 是新的认证结构，不是“换个数据库”，属于第②类（X5）。
9. **草稿 state expiry 的动机没有一手来源支撑**（X7）。GPT §5.10 的改写方向正确。
10. **GPT §5.4 说 pevm 仍是 WIP、非生产就绪：2026-10-31 复核仍成立**（X4）。
11. **GPT §5.9 说 EIP-7864 仍是 Draft：复核成立。** 应补充：哈希函数仍未定（BLAKE3 / Keccak / Poseidon2）（X5）。
12. **草稿“MPT 在 SP1 中有大量 RLP 和 Keccak”是未量化的说法。** Mantle 的 keccak 已走 precompile（补丁生效）。剩下的成本里，有多少来自 MPT 遍历和 RLP、多少来自 EVM，需要用 cost-estimator 和 cycle-tracker 实测（X6）。

---

## 对路线与实验的建议（建议，非 Mantle 已批准的路线）

### XE-0 存储与持久化盘点（P0，1–2 天）
- **做法。** 在每个生产 reth 节点上：
  - 运行 `op-reth db settings get`；
  - 记录 `--engine.persistence-backpressure-threshold` 和三个 share / suppress 参数；
  - 导出一周的 `commit_duration`、`backpressure_active`、`backpressure_stall_duration` 指标。
- **判读。**
  - 有 v1 节点 → 在 2027-01 之前排 `migrate-v2` 或从快照重建。
  - `backpressure_active` 曾经为 1 → 持久化跟不上，先查磁盘和 Durable 提交耗时，再考虑把持久化阈值调回默认 2。
  - QA 链的存储模式和持久化参数必须与主网一致，否则 E6–E8 的结论不能外推。

### XE-1 reth 当 sequencer 时的封块 root 与持久化计时（P0，sequencer 切换 reth 的前置条件，并入草稿 E7 / E8）
- **假设。** reth 当 sequencer 时，同步 root 在满块下占封块时间的大头；每块持久化与构建争用磁盘。
- **对照（同一 QA 链、同一负载）。**
  - a：preconf 开 / 关（两条 builder 路径）；
  - b：`--engine.suppress-persistence-during-build` 开 / 关；
  - c：persistence-threshold 取 0 和 2；
  - 同时对比 RPC 节点 engine 侧 `newPayload` 的 root 耗时。
- **指标。** `builder.finish` 内 root 计算的 p50 / p99；“attributes 到 sealed”的总时间；`commit_duration`；backpressure 指标。
- **判读。**
  - root 的 p99 大于封块预算的 30%（阈值为建议）→ 先改造 builder：接收 `execution_cache` 和 `trie_handle`，再打开两个 share 参数。这比 evm2 更直接。
  - 只开 suppress 封块尾延迟就明显下降 → 持久化 IO 争用是主因。
  - 两者都不显著 → root 和持久化都不是瓶颈，把精力放到执行和 IO。

### XE-2 evm2 迁移的三组对照（P1，等 XE-1 结果，且优先等 OP 上游）
- **三组。**
  - A：现在的 v2.2.0 + revm 38；
  - B：追平 reth v2.8.1（仍是 revm）+ OP 上游组合；
  - C：v2.9.0 + evm2（自己移植 OP 层）。
- **指标。** 回放 Mantle 区块的执行时间；逐块比对 state root 和 receipt；SP1 证明的 cycles 与 prover gas。
- **判读。**
  - B 相对 A 已经拿到主要收益 → 先做 B。C 等 OP 上游跟进再做。
  - C 相对 B 的执行收益低于 10% 且证明成本不变 → 不单独立项。
  - 出现任何语义差异 → 阻断上线。

### XE-3 pEVM 可并行度重测（P2）
- 方法见 X4。
- **判读。**
  - 加权关键路径占比 ≥ 50% → 通用 pEVM 上限不到 2 倍 → 停止通用 pEVM，改做预热和 IO 并行。
  - 去掉实现带来的假依赖后上限 ≥ 3 倍 → 值得原型 → 先在 follower 或验证端做。

### XE-4 证明成本拆分（P1）
- **做法。** 用 `cost-estimator` 跑多个 Mantle 区间。在 guest 内加 cycle-tracker，分出“MPT 遍历 + RLP / 哈希 / EVM / 派生”四段。检查 `syscall_counts` 里有 keccak syscall，确认补丁生效。
- **判读。**
  - MPT 加哈希占证明成本 30% 以上（阈值为建议）→ 先做实现层优化：trie 缓存、预序列化，再评估第②类承诺结构。
  - 占比低 → 承诺结构替换后置。

### XE-5 状态与历史占用（P3）
- 测活跃状态、历史数据、索引各自的体积和增长率。生产不裁剪，历史数据会持续增长。
- 历史数据占主导 → 用 pruning、minimal 模式、static files 解决，不需要 expiry。

**优先级理由。**
- XE-0 成本最低。XE-1 是“reth 接替 op-geth 当 sequencer”的前置条件，直接决定草稿 E8 的措施是否成立。
- evm2 的收益上限约 10%，又依赖 OP 上游，适合放在 XE-1 之后。
- commitment 替换要协议升级，必须先有 XE-4 的数据。

---

## 来源

1. **PRIMARY** mantle-xyz/reth `Cargo.toml` @574e7f3（`:4,9-10,32,116-118,235-251,257,260-267,421-425`）。证明 reth v2.2.0 rev、vendored op-reth v2.2.1、revm fork tag、alloy-evm 0.34.0、3 个 core 补丁。
2. **PRIMARY** mantle-xyz/reth Releases 页面与 API `releases/tags/mantle-v1.6.2`。证明最新 release 为 mantle-v1.6.2（2026-10-12）、搭配的 revm 没变，以及 arsia.2（2026-08-26）引入 preconf。访问于 2026-10-31。
3. **PRIMARY** mantle-xyz/reth `mantle-reth/crates/preconf/src/builder/payload_builder.rs` @574e7f3（`:1-14,26,51-54,888-892,925-928,1185-1187`）。证明 preconf builder fork 自 OpPayloadBuilder、丢弃 CachedReads、用 `finish(…, None)`。
4. **PRIMARY** mantle-xyz/reth `mantle-reth/crates/preconf/src/payload_service_builder.rs:161-182` @574e7f3。证明关闭 preconf 时回退到上游 OpPayloadBuilder。
5. **PRIMARY** mantle-xyz/reth `op-reth/crates/payload/src/builder.rs:221-230,247-250,334-335,356,473-474` @574e7f3。证明 vendored op-reth v2.2.1 builder 丢弃 `execution_cache` / `trie_handle`，用 `finish(…, None)`。
6. **PRIMARY** paradigmxyz/reth `crates/ethereum/payload/src/lib.rs:162-169,228-235,453-477` @84caec5。证明上游 Ethereum builder 接入了 execution cache 和 state-root task。
7. **PRIMARY** reth rustdoc `BlockBuilder::finish` / `BuildArguments`（reth.rs/docs，main 版本）。证明 `None` 时调用 `state_root_with_updates()`。访问于 2026-10-31。
8. **PRIMARY** paradigmxyz/reth Release v2.9.0（GitHub API，`published_at 2026-10-29T12:36:47Z`）。证明 evm2 替换、SDK breaking 范围、性能数字、可降级、evm2 rev f93318f。
9. **PRIMARY** ethereum-optimism/optimism Release `op-reth/v2.8.0`（API `published_at 2026-10-27T20:17:18Z`）。证明它基于 reth v2.6.0、Storage v1 将于 2027-01 EOL。
10. **PRIMARY** Paradigm, “Releasing Reth 2.0!”。证明 1–2 ms 的确切表述、Sparse Trie Cache、Storage v2 分层、40 ms / 0.4 s / 8.4 s、Minimal 模式、测试硬件。访问于 2026-10-31。
11. **PRIMARY** reth.rs/run/storage；`StorageSettings` rustdoc；`reth_cli_commands/db/{migrate_v2,settings}.rs`。证明 v2 默认值、迁移、`db settings`、磁盘占用表。访问于 2026-10-31。
12. **PRIMARY** mantle-xyz/op-succinct `Cargo.toml:164-166,180-187,194-196,229-253`、`Cargo.lock:13470-13506` @6b1cb57。证明 SP1 6.4.0、keccak 补丁、revm fork 承载的 Mantle 语义、锁文件末尾没有 `patch.unused`。
13. **PRIMARY** Succinct docs, Precompiles（§ alloy-primitives keccak256）。证明 keccak 补丁失配会导致软件 keccak 和 cycle 回退。访问于 2026-10-31。
14. **PRIMARY** Succinct docs, Prover Gas；op-succinct book `cost-estimation-tools.md`。证明 prover gas、cost-estimator 分项报告。访问于 2026-10-31。
15. **PRIMARY**（厂商自报）ethrex docs, zkVM Comparison § Optimization Impact。证明 trie 实现优化的 cycle 收益。访问于 2026-10-31。
16. **PRIMARY** EIP-7864。证明 Draft、哈希函数未定、用二叉树替换 MPT。访问于 2026-10-31。
17. **PRIMARY** Monad MIP-8。证明页式承诺、按页计 gas、`eth_getProof` 必须修改。访问于 2026-10-31。
18. **PRIMARY** Sei docs, What Is Sei Giga?。证明 Ares 上主网时间、LtHash / BUD、FlatKV 默认关闭。访问于 2026-10-31。
19. **PRIMARY** QMDB, arXiv 2501.05262（v3）。证明 twig 结构与作者自测数字。访问于 2026-10-31。
20. **PRIMARY** thrumdev/nomt README。证明 NOMT 是自定义二叉 Merkle trie。访问于 2026-10-31。
21. **PRIMARY** base/triedb README。证明按页存 MPT、哈希用 RLP、磁盘操作约 50 次降到约 4–8 次。访问于 2026-10-31。
22. **PRIMARY** megaeth-labs/salt README 与仓库目录。证明 SALT 结构、认证层 1 GB 对应 30 亿条、审计报告。访问于 2026-10-31。
23. **PRIMARY** MegaETH Research 页。证明 sequencer 用大内存装下全部状态。访问于 2026-10-31。
24. **PRIMARY** risechain/pevm README。证明仍为 WIP、非生产就绪、2 倍和 22 倍的自述。访问于 2026-10-31。
25. 姊妹报告 high-performance-chain-roadmap `research/notes-exec.md`（2026-10-27）。E18、E21、E30、E40。
26. 姊妹报告 revm-vs-evm2 `explainer.md` 与台账（2026-10-25）。F5、F9、F15、F18、M1、M14。
27. GPT Deep Research（`research/gpt-deep-research.md`）§2.4、§5.2–5.4、§5.9–5.10。只当线索。
28. 作者草稿 `research/references/drafts.md`。被评审对象。
29. **PRIMARY** paradigmxyz/reth v2.2.0 源码 @88505c7（`/tmp/rhsrc/reth-v2.2.0`）。证明持久化阈值、backpressure、persist 触发条件、持久化独立线程、share / suppress 参数及默认值、FCU 时向 builder 传 cache 和 trie_handle 的条件。读取于 2026-10-31（部分片段经 raw.githubusercontent.com 同 rev 交叉核对）。
30. notes-main.md K 行（主会话核实的生产部署事实）。只引用，不在本台账重复登记。

已拒绝或降级：
- blog.arcbjorn.com（MegaETH 二手文）；
- AiCoin 白皮书解读（二手）；
- shattered.io、wavect.io 的 ZK 概述（二手）；
- hackmd grandchildrice 的 SP1 笔记（非官方）；
- newreleases.io 镜像（已改用 GitHub 原页和 API）。

---

## 开放问题

1. 生产 reth 节点的 `persistence-backpressure-threshold` 和三个 share / suppress 参数的实际取值；`commit_duration` 和 backpressure 指标的历史。
2. 各生产节点的 Storage 模式（v1 还是 v2），以及在 2027-01 之前的迁移计划。
3. reth v2.2.0 的 `state_root_with_updates()` 是否内部并行？reth 当 sequencer 时，engine 是否复用自建块的执行结果？
4. OP 上游 op-reth 迁到 evm2 的时间表。
5. Mantle 区块证明成本中 MPT、哈希、EVM、派生各占多少（需要跑 XE-4）。
6. Base TrieDB 的生产状态；MIP-8 在 Monad 主网的激活日期。

---

## 论断台账

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| X1 | mantle-xyz/reth main 的上游 reth crate 钉在 paradigmxyz/reth rev 88505c7f，注释写明等于 v2.2.0。 | `mantle-xyz/reth/Cargo.toml:9,235-237@574e7f3` | observed |
| X2 | mantle-xyz/reth 里的 op-reth 层 vendored 自 ethereum-optimism/optimism 的 op-reth/v2.2.1。 | `mantle-xyz/reth/Cargo.toml:4,32@574e7f3` | observed |
| X3 | Mantle reth 的 revm 系列与 op-revm 都钉在 mantle-xyz/revm tag v107-mantle-arsia.2。 | `mantle-xyz/reth/Cargo.toml:242-251,264@574e7f3` | observed |
| X4 | 该 tag 对应 revm 38.0.0 / op-revm 19.0.0。 | revm-vs-evm2 台账 M1（2026-10-25 核实，Cargo.lock）[26] | observed |
| X5 | Mantle reth 的 alloy-evm 用 crates.io 0.34.0，没有 Mantle 补丁；alloy-op-evm 和 op-alloy 来自 mantle-v2 tag mantle-v1.6.3。 | `mantle-xyz/reth/Cargo.toml:257,260-261,267@574e7f3` | observed |
| X6 | Mantle reth 对 reth core 的 reth-trie-common、reth-transaction-pool、reth-provider 三个 crate 打了本地补丁。 | `mantle-xyz/reth/Cargo.toml:421-425@574e7f3` | observed |
| X7 | reth-provider 补丁用于一个“hashed-snapshot exec-read fix”，计划等上游合入后移除。 | `mantle-xyz/reth/Cargo.toml:116-118@574e7f3` | observed |
| X8 | mantle-xyz/reth 最新 release 是 mantle-v1.6.2，于 2026-10-12T08:59:19Z 发布，搭配的 revm / op-revm 仍是 v107-mantle-arsia.2。 | GitHub API `mantle-xyz/reth/releases/tags/mantle-v1.6.2`；Release 正文 [2] | observed |
| X9 | op-reth-v2.2.1-mantle-arsia.2（2026-08-26）引入 preconf，并把 revm 从私有 GHSA fork 换成公开的 mantle-xyz/revm tag。 | mantle-xyz/reth Releases 页 [2] | observed |
| X10 | Mantle 的费用与协议语义（ARSIA/JOVIAN、BVM_ETH、token_ratio、DA footprint、Arsia 费用校验）实现在 mantle-xyz/revm fork 里。 | `mantle-xyz/op-succinct/Cargo.toml:180-187@6b1cb57` | observed |
| X11 | 执行客户端（reth）和 SP1 证明程序（op-succinct）钉在同一个 revm tag v107-mantle-arsia.2。 | `mantle-xyz/reth/Cargo.toml:242@574e7f3`；`mantle-xyz/op-succinct/Cargo.toml:187@6b1cb57` | observed |
| X12 | Mantle preconf 子系统直接依赖 op_revm::L1BlockInfo 和 reth_revm::State，迁到 evm2 时这个 crate 也必须移植。 | `mantle-reth/crates/preconf/src/builder/payload_builder.rs:26,51-54@574e7f3` | observed |
| X13 | Mantle 迁到 evm2 至少要移植 7 处：op-revm 语义、alloy-op-evm、revm-inspectors、preconf builder、rpc-ext / eth-api 费用估算、txpool 补丁、kona / SP1 证明路径。 | 由 X3、X5、X6、X10–X12 与 [2] 推出：这些位置都直接引用 revm / op-revm 类型或语义，而 v2.9.0 要求定制 EVM / precompile / inspector / executor 移植 | inferred |
| X14 | Reth v2.9.0 于 2026-10-29T12:36:47Z 发布。 | GitHub API `paradigmxyz/reth/releases/tags/v2.9.0` `published_at` [8] | observed |
| X15 | Reth v2.9.0 用 evm2 替换了 revm（#25002）。 | v2.9.0 发布说明首段 [8] | observed |
| X16 | v2.9.0 发布说明要求 SDK 使用者把自定义 EVM、precompile、inspector 和 executor 移植到 evm2 API；节点运营者不需要改配置。 | v2.9.0 § Action Required 与首段 [8] | observed |
| X17 | v2.9.0 称 evm2 让 500 个主网区块的执行吞吐 +10.0%、执行时间中位数 −10.5%。 | v2.9.0 首段 [8] | observed |
| X18 | v2.9.0 称 300M gas 大区块吞吐 +9.3%，开 BAL 时 +6.6%。 | v2.9.0 首段 [8] | observed |
| X19 | v2.9.0 的发布说明没有给出性能测量的硬件和方法。 | v2.9.0 发布说明全文 [8] | observed |
| X20 | v2.9.0 可以降级回 v2.8.1。 | v2.9.0 § Backwards Compatibility [8] | observed |
| X21 | OP 上游最新的 op-reth/v2.8.0 于 2026-10-27 发布，基于 reth v2.6.0。 | GitHub API `op-reth/v2.8.0` `published_at 2026-10-27T20:17:18Z`；正文 “Update reth to v2.6.0” [9] | observed |
| X22 | 截至 2026-10-31，OP 上游 op-reth 的发布版仍在 revm 上，没有跟进 evm2。 | 由 X15、X21 推出：evm2 首次发布于 reth v2.9.0，op-reth v2.8.0 基于更早的 v2.6.0 | inferred |
| X23 | 姊妹报告 revm-vs-evm2（2026-10-25）“reth main 已切换 evm2 但未发布”的说法已过时。 | 由 X14、X15 推出 | inferred |
| X24 | Mantle reth（v2.2.0）要拿到上游 evm2，需要跨过 v2.2 到 v2.9 共 7 个小版本，并且 OP 层没有上游实现可以直接复用。 | 由 X1、X14、X22 推出 | inferred |
| X25 | op-reth v2.8.0 宣布 Storage v1 已弃用，将于 2027 年 1 月 EOL，并在启动时对 v1 库打印警告。 | op-reth v2.8.0 发布说明 § Storage [9] | observed |
| X26 | Paradigm 所说的 1–2 ms 指“每个主网区块末尾计算最终 state root 的时间”，前提是跨块常驻内存的 Sparse Trie Cache。 | [10] § Optimising Parallel State Calculation | observed |
| X27 | Reth 2.0 的性能数字测于 AMD EPYC 4585PX（16 核）、128 GB 内存、NVMe 软 RAID，宣称 1.7 Ggas/s。 | [10] 首段与脚注 1 | observed |
| X28 | Reth Storage v2 在 MDBX 中只存 hashed state，历史 changeset 移到 static files，索引移到 RocksDB。 | [10] § Tiered Storage；[11] StorageSettings rustdoc | observed |
| X29 | Paradigm 称 Storage v2 下普通区块平均持久化 40 ms，Gigagas 级区块 400 ms，v1 下为 8.4 s。 | [10] § Tiered Storage | observed |
| X30 | 新建的 reth 数据库默认 Storage v2；已有数据库沿用元数据里记录的模式，`--storage.v2` 不会改写；可用 `reth db migrate-v2` 迁移。 | [11] reth.rs/run/storage § Defaults | observed |
| X31 | 可以用 `reth db settings get` 读出数据库当前的 storage_v2 设置。 | [11] `reth_cli_commands/db/settings.rs` Subcommands::Get | observed |
| X32 | 草稿“需要确认 db 是 v1 还是 v2”可以改写为可回答的运维问题：在每个生产 reth 节点上运行 `op-reth db settings get`。 | 由 X30、X31 推出 | inferred |
| X33 | Mantle 节点的 datadir 如果从 v1.9.3 时代沿用至今，可能仍是 Storage v1。 | 由 X30 与 [2]（v1.9.3 系列 release）推测，没有生产数据 | speculative |
| X34 | Mantle 的 PreconfPayloadBuilder 是 reth_optimism_payload_builder::OpPayloadBuilder 的 fork。 | `payload_builder.rs:1-8@574e7f3` | observed |
| X35 | PreconfPayloadBuilder 显式丢弃上游的 CachedReads 复用，每次构建都新建 State<DB>。 | `payload_builder.rs:888-892,928@574e7f3` | observed |
| X36 | PreconfPayloadBuilder 封块时调用 `builder.finish(state_provider_for_finish, None)`，没有传入预先算好的 state root。 | `payload_builder.rs:1185-1187@574e7f3` | observed |
| X37 | 没有 `--preconf.enable` 时，Mantle 回退到上游 BasicPayloadServiceBuilder<OpPayloadBuilder>。 | `payload_service_builder.rs:161-182@574e7f3` | observed |
| X38 | vendored op-reth v2.2.1 的 OpPayloadBuilder 在 build_payload 中丢弃了 BuildArguments 的 execution_cache 和 trie_handle 字段。 | `op-reth/crates/payload/src/builder.rs:230@574e7f3`（`..` 解构）；同文件 `:334-335,356` 表明这两个字段存在 | observed |
| X39 | vendored op-reth v2.2.1 的 OpPayloadBuilder 封块时同样调用 `finish(state_provider, None)`。 | `op-reth/crates/payload/src/builder.rs:473-474@574e7f3` | observed |
| X40 | `BlockBuilder::finish` 的 state_root_precomputed 为 None 时，在内部调用 `state_root_with_updates()` 计算 root。 | [7] reth rustdoc（main）；v2.2.0 参数说明称 builder 的 `state_root_with_updates()` 是 “blocking”（`reth-v2.2.0/crates/node/core/src/args/engine.rs:488-489@88505c7`） | observed |
| X41 | 上游 reth main 的 Ethereum payload builder 用 execution_cache 构造 CachedStateProvider，并通过 state-root task 的 state hook 加 `finish_with_state_root` 在后台计算 root。 | `paradigmxyz/reth/crates/ethereum/payload/src/lib.rs:162-169,228-235,453-477@84caec5` | observed |
| X42 | reth 当 Mantle sequencer 时，不论是否开 preconf，封块时都在区块末尾同步计算 state root，没有用 Reth 2.0 的跨块 sparse trie 流水线。 | 由 X36–X40、X79 推出 | inferred |
| X43 | 草稿把“Reth 2.0 已把 root 降到 1–2 ms”当作出块路径的背景，这既不适用于当前的 op-geth sequencer，也不适用于 reth 当 sequencer 时的 Mantle 封块路径。 | 由 X26、X42 与 K 行（主网 sequencer 为 op-geth）推出 | inferred |
| X44 | 草稿 E8 的措施“追平上游 reth（prewarm 复用等）”只升级依赖还不够，要让 builder 受益，必须打开 share 参数，并让 Mantle 的 builder 接收和使用 execution_cache 与 trie_handle。 | 由 X38、X41、X79、X80 推出 | inferred |
| X45 | reth 当 sequencer 时，`engine_newPayload` 收到自建块，是否跳过重执行或使用 engine 侧 sparse trie，尚未核实。 | 没有直接证据；需要读 v2.2.0 engine tree 的 newPayload 路径或做实测 | speculative |
| X46 | 截至 2026-10-31，risechain/pevm README 仍写“work in progress”和“not production ready”。 | [24] README 首段 | observed |
| X47 | pevm README 自述：以太坊区块平均约快 2 倍，独立 Uniswap swap 的 gigagas 区块快 22 倍，但不足以支撑复杂的节点集成。 | [24] README § Problems | observed |
| X48 | Sei v6.6 于 2026-08-04 在主网上线 Ares，Ares 成为升级后节点的默认执行路径。 | [18] Status (August 2026) | observed |
| X49 | Mantle 2025 年内部测得的 49.10% 依赖率用的是启发式口径（同发送方、同合约同 selector），不是 slot 级冲突率。 | 姊妹报告 notes-exec E21（2026-10-27，引内部 Notion）[25] | observed |
| X50 | 重测 Mantle 的可并行度应采集 storage-slot 级读写集，并以 gas 加权的关键路径占比为决策指标，而不是冲突比例。 | 由 X47、X49 与姊妹报告 E18 推出：冲突比例不反映串行链长度 | inferred |
| X51 | EIP-7864 的状态是 Draft。 | [16] 页面标题 “[DRAFT]” | observed |
| X52 | EIP-7864 的哈希函数尚未确定，候选为 BLAKE3、Keccak、Poseidon2，参考实现暂用 BLAKE3。 | [16] Abstract 注释与 Rationale | observed |
| X53 | QMDB 用 append-only 的 twig 式 Merkle 结构，作者宣称吞吐最高为 RocksDB 的 6 倍、NOMT 的 8 倍、每秒 2.28M 次状态更新，摘要没有提到与 MPT 兼容。 | [19] arXiv 2501.05262 摘要 | observed |
| X54 | NOMT 是自定义的二叉 Merkle trie 加 DB，README 没有声称产出以太坊 MPT 根。 | [20] README | observed |
| X55 | Base TrieDB 把以太坊 MPT 按 4 KB 页存储，哈希仍按 RLP 计算，目标是把单次读写的磁盘操作从约 50 次降到约 4–8 次。 | [21] README § Overview、Storage Layout | observed |
| X56 | SALT 是独立的认证 KV：4 层 256 叉静态主 trie 加 SHI 哈希桶，用 IPA/Pedersen 向量承诺，不是以太坊 MPT。 | [22] README § Design | observed |
| X57 | SALT 仓库带三份审计报告：Sherlock 2025-09-16、Cantina 2025-10-17、BlockSec 2025-12-15。 | [22] 仓库 `audits/` 目录 | observed |
| X58 | Monad MIP-8 让 trie 承诺 {page_index, page}（每页 128 个词、4096 字节，BLAKE3 ISMC），SLOAD / SSTORE 改为按页计 gas，`eth_getProof` 必须更新。 | [17] Specification、Gas Cost、RPC Modifications | observed |
| X59 | Sei Giga 设计用对写日志的 LtHash 摘要取代热路径上的 Merkle 根，用 BUD 取代全局状态证明；FlatKV / LtHash 仍由运营者开启，默认关闭。 | [18] § Flat storage and lattice hashes | observed |
| X60 | commitment / DB 候选应分为三类：①保持 MPT 承诺的存储优化（Reth Storage v2、Base TrieDB）；②新的认证结构（QMDB、NOMT、SALT、EIP-7864）；③改变承诺粒度或摘要（MIP-8、LtHash）。 | 由 X51–X59 推出 | inferred |
| X61 | 三类中只有第①类不改变 state root 和 `eth_getProof`；第②③类都需要协议升级，并同步修改 op-geth / reth / kona / 证明程序和桥验证。 | 由 X55、X58、X60 推出 | inferred |
| X62 | Mantle op-succinct 用 SP1 6.4.0。 | `mantle-xyz/op-succinct/Cargo.toml:194-196@6b1cb57` | observed |
| X63 | Mantle op-succinct 通过 alloy-primitives 的 sha3-keccak 特性，加上 sha3（patch-sha3-0.10.8-sp1-6.0.0）与 tiny-keccak 补丁，让 keccak 走 SP1 precompile。 | `mantle-xyz/op-succinct/Cargo.toml:164-166,229-253@6b1cb57` | observed |
| X64 | Mantle op-succinct 的 Cargo.lock 末尾没有 `[[patch.unused]]` 段，说明锁文件里的 SP1 补丁都被使用了。 | `mantle-xyz/op-succinct/Cargo.lock:13470-13506@6b1cb57`（文件末尾） | observed |
| X65 | SP1 文档指出：sha3 补丁版本不匹配时 cargo 会静默回落到软件 keccak，而 keccak 驱动 MPT / state root 哈希，会造成大幅 cycle 回退。 | [13] § alloy-primitives keccak256 | observed |
| X66 | OP Succinct 的 cost-estimator 会分别报告 oracle verification、derivation 和 block execution 的成本，以及各 precompile 的 cycles。 | [14] cost-estimation-tools.md § Output | observed |
| X67 | ethrex 自报：仅优化 trie 实现就让 trie 哈希 cycles 降 75%，预序列化 trie 让总 cycles 降 22%。 | [15] § Optimization Impact | observed |
| X68 | 没有找到 Mantle 或 OP Succinct 按 MPT / EVM / 派生拆分的公开证明 profile；草稿“MPT 在 SP1 中有大量 RLP 与 Keccak”目前没有量化依据。 | 由 [13][14] 检索结果推出；需要按 XE-4 实测 | inferred |
| X69 | 降低 MPT 在 zkVM 中的成本可以先做实现层优化（precompile、trie 缓存、预序列化），不必先更换承诺结构。 | 由 X63、X65、X67 推出 | inferred |
| X70 | MegaETH 研究页说 sequencer 配有足够内存装下全部状态（当时以太坊约 100 GB），硬件为 1–4 TB 内存。 | [23] | observed |
| X71 | SALT README 说其认证层在 30 亿条 KV 时只需约 1 GB 内存，并消除了状态根更新时的随机磁盘 IO。 | [22] README 首段 | observed |
| X72 | 草稿“MegaETH 要把全部状态放进内存，所以需要 state expiry”的因果关系，在 MegaETH 一手材料中找不到依据。 | 由 X70、X71 推出；[22][23] 均没有提到 state expiry | inferred |
| X73 | 按 reth 文档，以太坊主网 minimal 节点在 Storage v2 下约 224 GB（v1 为 449 GB），full 节点约 1.02 TB（v1 为 1.46 TB）。 | [11] reth.rs/run/storage § Disk savings | observed |
| X74 | 节点占用可以靠 Storage v2、static files 和 pruning / minimal 模式控制，不需要引入 state expiry。 | 由 X28、X73 推出 | inferred |
| X75 | reth 当 sequencer 时，封块同步 root 的耗时是否在满块下成为瓶颈，目前没有数据；如果是，接入 state-root task 的收益可能大于 evm2 的约 10%。 | 由 X17、X42 推测，需要按 XE-1 实测 | speculative |
| X76 | reth v2.2.0 的默认值：持久化阈值 2，backpressure 阈值 16，memory block buffer target 0。 | `reth-v2.2.0/crates/engine/primitives/src/config.rs:7,10,13@88505c7` | observed |
| X77 | reth v2.2.0 在以下条件同时满足时才触发持久化：没有正在构建 payload（受 suppress 参数控制）、backfill 空闲、canonical 与已持久化块之差大于持久化阈值。 | `reth-v2.2.0/crates/engine/tree/src/tree/mod.rs:2016-2034@88505c7` | observed |
| X78 | reth v2.2.0 的参数说明写明：持久化阈值设为 0 等于“persist blocks as fast as the node receives them”，代价是更频繁的 DB 写入。 | `reth-v2.2.0/crates/node/core/src/args/engine.rs:305-309@88505c7` | observed |
| X79 | reth v2.2.0 的 engine 在收到带 attributes 的 FCU 时，只有打开对应参数，才把 execution cache 和 sparse trie handle 放进 BuildNewPayload 交给 builder。 | `reth-v2.2.0/crates/engine/tree/src/tree/mod.rs:3214-3236@88505c7` | observed |
| X80 | `--engine.share-execution-cache-with-payload-builder`、`--engine.share-sparse-trie-with-payload-builder`、`--engine.suppress-persistence-during-build` 在 v2.2.0 中默认都是 false。 | `reth-v2.2.0/crates/engine/primitives/src/config.rs:239-241@88505c7`；`args/engine.rs:473-512@88505c7` | observed |
| X81 | 即使打开两个 share 参数，Mantle 现有的两个 builder 也会丢弃 execution_cache 和 trie_handle，所以开关本身不会让 Mantle 封块用上 sparse trie。 | 由 X35、X38、X79 推出 | inferred |
| X82 | reth v2.2.0 的持久化由独立 OS 线程上的 PersistenceService 执行阻塞 IO，engine 通过 channel 下发 save_blocks。 | `reth-v2.2.0/crates/engine/tree/src/persistence.rs:35-42@88505c7`；`tree/mod.rs:1388-1400` | observed |
| X83 | reth v2.2.0 同一时间只有一个持久化任务；任务进行中，engine 仍用 select_biased 接收新的 engine 消息，下一块的执行与上一块的持久化并行。 | `reth-v2.2.0/crates/engine/tree/src/tree/mod.rs:1388-1400,614-630@88505c7` | observed |
| X84 | reth v2.2.0 在“持久化进行中且 canonical 与已持久化块之差 ≥ backpressure 阈值”时进入 backpressure，停止读取 engine 输入，只等持久化完成。 | `reth-v2.2.0/crates/engine/tree/src/tree/mod.rs:487-501,545-554,593-608@88505c7` | observed |
| X85 | 按默认 backpressure 16、2 s 出块推算，只有单次持久化提交持续约 15 个块间隔（约 30 s）以上，每块持久化才会阻塞 engine；正常情况下它不在封块或校验的关键路径上。 | 由 X76、X83、X84 与 K 行（阈值 0）推出；生产 backpressure 阈值假定为默认 | inferred |
| X86 | 生产的每块持久化加 Durable 提交，会让持久化线程的磁盘写和执行线程的冷读争用同一块盘，影响程度没有数据。 | 由 X78、X83 与 K 行推测；需要用 commit_duration 和执行时延实测 | speculative |
| X87 | reth v2.2.0 已提供 `--engine.suppress-persistence-during-build`，用于短出块链在构建期间推迟持久化；reth 当 sequencer 时可以作为对照项。 | `reth-v2.2.0/crates/node/core/src/args/engine.rs:503-512@88505c7`；`tree/mod.rs:2016-2019` | observed |
| X88 | 草稿 E6 / E8 中“导入或封块慢就换 NVMe”的判读，应先用 commit_duration 与 backpressure 指标区分持久化提交和执行冷读，再决定措施。 | 由 X83–X86 推出 | inferred |

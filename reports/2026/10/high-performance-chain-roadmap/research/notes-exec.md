# E 路调研笔记：执行调度、虚拟机、状态存储与承诺

> 调研日期 2026-10-27。前缀 E。网页访问日期均为 2026-10-27，另注明的除外。
> 说明：本文件按运行时指定的产出路径写入；目标位置 `reports/2026/10/high-performance-chain-roadmap/research/notes-exec.md` 由主会话落盘。
> 证据中的 `[n]` 指“来源”一节编号；“revm-vs-evm2 台账 Hx/Mx/Xx”指同仓库报告 `reports/2026/10/revm-vs-evm2/research/ledger.md` 中已核实的行。

---

## E-Q1 执行层瓶颈分类：执行、状态读取、state root 各占多少？

**答案。** 目前没有一份公开、口径统一、能直接回答“主网区块处理时间里执行、状态读取、state root/提交各占几成”的 2026 年 profile。现有数据来自不同时间、不同条件：2024 年 Paradigm 和 MegaETH 都发现 reth 的 state root 是主要开销（封块端到端时间的 75% 以上，约为执行的 10 倍）。Reth 2.0（2026-04）把 state root 改成和执行并行的流水线，并在块间保留 sparse trie 缓存，主网区块末尾剩下的 root 计算只要 1–2 ms。之后剩下的瓶颈主要是执行阶段的状态读取（冷读 IO）。在纯解释器计算上，主网回放收益只有个位数百分比。

**依据。** E1–E10。
- 2024：state root 占封块时间 >75%（E1）；MPT 更新约为执行的 10 倍，live sync 约 100 Mgas/s（E2）。
- 2025：Base 测得存储访问多的区块执行时间约为无存储访问区块的 30 倍；状态访问很少时可达约 500 Mgas/s（E3）。Base 认为存储读写是执行速度的长尾，并为此做了 TrieDB（E4）。
- 2026：Reth 2.0 区块末尾 root 1–2 ms，持久化平均 40 ms（E5、E6）；Paradigm 因“state root 不再是瓶颈”重启 revmc（E7）。
- 计算占比：evm2 解释器优化在主网回放中只带来 4.8%–6.2%（revm-vs-evm2 H37）；revm 维护者 2025 年也认为 IO 占主导（X42）。

**三类瓶颈的划分（inferred，E10）。**
- 计算：解释器分发、预编译、keccak。
- 等待状态：冷读 SSD；在 MPT+KV 下还有读放大。
- 业务串行依赖：热点账户和合约。

前两类可以靠工程手段压缩。第三类只能靠改变业务或状态布局，或者用 BAL/预执行把依赖提前暴露。

**不确定之处。**
- 1–2 ms 指的是“执行结束后剩下的 root 尾巴”，不是 root 计算的总 CPU 量。后台 root 任务仍会占用核心和 IO，公开资料没有给出它与执行争用资源的数据。
- 没有找到 2026 年按“执行 / 读 / root / 持久化”拆分的主网时间占比；ethPandaOps 的 timing 面板只给端到端时间。
- 2025 年内部文档里引用的 RISE 说法“共识占 40–80%、执行最坏只占 8%”，找不到可追溯的一手来源。

---

## E-Q2 并行执行：各家方案、生产状态、真实可并行度、BAL

**答案。** 并行方案有三类：
- 声明式：Solana 要求交易声明账户读写，按账户加锁；Sui 按对象所有权区分快路径和共识路径。
- 乐观式：Block-STM（Aptos 生产使用）、Monad、Sei Giga Ares（2026-08 已上主网）。
- 辅助验证式：EIP-7928 BAL 把块内读写集和写后值写进区块，验证端据此并行读取、执行和计算 root。

以太坊真实负载的可并行度并不高：
- MegaETH 测得近期区块中位并行度 <2，合并成大批次后也只有 2.75。
- RISE pevm 在内存态主网回放中平均加速约 2.02 倍。
- EIP-7928 估计 60–80% 的交易访问互不相交的 slot。

因此生产级 EVM 并行目前主要出现在两个地方：一是验证端，靠 BAL 或预热；二是自建链的 sequencer。reth 和 geth 的 BAL 并行路径已经实现，但截至 2026-10-27 只在测试网（Sepolia）生效。Hoodi 激活已于 2026-10-22 推迟，主网日期未定。

**依据。**
- 各方案：E11–E17。
- 可并行度：E18–E21。
- BAL 状态：E22–E27。
- reth/geth：E28–E29、E31，以及 revm-vs-evm2 X25–X28、M29。
- RISE pevm：E30。

**不确定之处。**
- 各家冲突率的口径不同（中位并行度、加速比、slot 不相交比例），不能直接比较。
- pevm 的数字是在内存态上测的（磁盘 IO 被排除）；带磁盘时并行能隐藏 IO 等待，加速比可能更高也可能更低，没有统一实测。
- Mantle 的 49.1% 依赖率是启发式口径（同发送方、同合约同选择器），不是 slot 级冲突率（E21）。
- Aptos 的“生产运行”出自论文版本，2026 年 Aptos 是否已换成 Block-STM v2 等新调度器，本路没有核实。
- geth 是否有不依赖 BAL 的生产级并行执行：v1.17.9 的发布记录只提到 BAL 相关修复，没有看到不依赖 BAL 的并行执行功能（E29）。

---

## E-Q3 VM：解释器优化与 JIT/AOT

**答案。** JIT/AOT 在计算密集型合约上能快 1.85–19 倍，但在以太坊 L1 历史同步上，revmc 只带来约 1–10% 的提升（Paradigm 2024）。这就是“收益取决于计算占比”的直接证据。

各客户端现状：
- **Monad**：优化解释器加自研 x86-64 原生编译器。按累计 gas 选出热点合约，异步编译并缓存；没编译完的合约走解释器；宣称 gas 和错误语义完全一致。
- **reth**：v2.4.0 起加入实验性 revmc JIT（`--jit` 需手动开启）。main 分支已换成 evm2，JIT 默认编译进二进制、运行时默认关闭。
- **geth**：v1.17.9 改为内联 switch 分发，opcode 分发快了 16%。

**依据。** E32–E38，以及 revm-vs-evm2 台账 H22–H27、H35、H37、M30、M31、M38、M41。

**不确定之处。**
- Monad 原生编译器没有公开的主网加速数据。
- evm2 README 里“快 2 倍”的说法没有公开 benchmark 支撑（revm-vs-evm2 H34、H39）。
- JIT 在 L2 高计算负载上的实测收益没有公开数据。

---

## E-Q4 状态访问与存储

**答案。** 通用 KV（LevelDB/Pebble/MDBX）上再存一棵 MPT，会形成“结构套结构”的双重索引。base/triedb 估计，读写一个值大约要 50 次磁盘操作，按 trie 结构分页后可降到约 4–8 次。

各方案的路线和现状：
- **MonadDb**：原生 Patricia trie、io_uring 异步 IO、可绕过文件系统；2026 年又通过 MIP-8 把 storage trie 改为对 4 KiB 页做承诺，与 SSD 读取单位对齐。
- **QMDB**：论文宣称比 RocksDB 快至多 6 倍、比 NOMT 快 8 倍；2025-12 起由 Commonware 与 LayerZero 合作产品化。
- **NOMT**：已发布 1.0.x。
- **Firewood**：在 Avalanche 仍是实验性后端，默认仍用 LevelDB。
- **reth**：Storage v2（2.0 默认）在 MDBX 中只存 hashed state，历史 changeset 移入静态文件，索引移入 RocksDB；Gigagas 级区块的持久化从 8.4 s 降到 0.4 s。
- **geth**：path-based archive（v1.16+）约 2 TB；v1.17 起可选保留历史 trie 节点，以支持历史 `eth_getProof`。

**依据。** E39–E48，以及内部研究《由 QMDB 引发的对于区块链状态管理方案综述》(Notion)。

**不确定之处。**
- QMDB、NOMT 的数字来自各自作者的合成负载 benchmark，不是 EVM 主网回放。
- Base TrieDB 是否已在 Base 生产节点启用，没有找到 2026 年的确认。
- MIP-8 在 Monad 主网的激活日期：文档已写了迁移说明，但本路没有核实具体日期。
- Firewood 的 3 TB vs 16 TB 归档体积是“早期工程测量”。

---

## E-Q5 状态承诺 / merkleization

**答案。** state root 是关键路径，因为在执行与共识交错的设计中，提案和投票都要先知道执行后的 root。在 MPT 下，每改一个叶子都要读、写整条路径，IO 密集。

主要解决办法：
1. **不改协议、改计算方式。** reth 的并行 sparse trie 加后台 root 任务、跨块 sparse trie 缓存和 Partial Proofs；geth 的 prefetcher。
2. **把 root 移出关键路径。** Monad 的提案带 D=3 块前的延迟 merkle root；RISE shreds 不在预确认路径上做 merkleization；Sei Giga 用 LtHash 写日志摘要，取代热路径上的 Merkle root。
3. **换承诺结构。** EIP-7864 二叉树（Draft，哈希函数未定）。Verkle 已被 EIP-7864 取代，原因是它不抗量子；EIP-7864 不在 Glamsterdam 名单里，Hegotá 的头条是 FOCIL 和 Frame Tx。EIP-7862（Delayed State Root）在 Hegotá 评级中被列为暂缓。

**依据。** E49–E56，以及 E5、E12、E20。

**不确定之处。**
- Hegotá 文中提到的“I* trie-migration”具体指哪个分叉、何时进行，没有官方日期。
- RISE shreds 的设计只追到 RISE 博客和内部研究，没有核对代码。

---

## E-Q6 状态增长与历史

**答案。**
- **历史数据（区块体、回执）。** 2025-07-08 起，所有以太坊执行客户端都支持删除 merge 前的历史（EIP-4444 的 partial history expiry），可节省 300–500 GB。完整的滚动式历史过期仍在开发中。
- **活跃状态。** EIP-8037 记录：截至 2026-01，geth 中状态库约 390 GiB；gas 上限从 30M 提到 60M 后，每日新增状态从约 105 MiB 升到约 326 MiB，年增约 116 GiB。Glamsterdam 用 EIP-8037 提高状态创建的 gas 价格；而 Hoodi 正是因为 EIP-8037 与主网合约的交互问题才推迟。
- **state expiry。** 仍在研究阶段：EF 无状态团队 2025-12 提出 mark-expire-revive 与 multi-era 两条思路，测得约 80% 的状态一年以上没被访问过；EIP-7736 处于 Stagnant。
- **L2 层面。** Base 测得 geth 归档节点每周增长约 560 GB（reth 约 50 GB）。Base 将“状态与历史增长”列为四大扩容瓶颈之一，并表示长期要研究 state expiry。

**依据。** E57–E63。

**不确定之处。** ethereum.org 状态页与 EIP-7736 的状态只来自检索摘要，没有逐页核对。

---

## E-Q7 内存化 / 硬件路线

**答案。** 有两种做法：
- **生产者高配、验证者低配。** MegaETH 的 sequencer 用 100 核、1–4 TB 内存，把全部状态放进内存；replica 节点不重执行，只应用状态差分，4–8 核 16 GB 即可；full node 独立重执行。
- **验证者也要能跑满全速。** Monad 要求验证者和全节点都用 16 核、4.5 GHz 以上、32 GB 内存、2 TB NVMe 存 TrieDB，并且必须是裸金属；它靠 MonadDb 用好 SSD，而不是把状态塞进内存。

“生产者规格”和“验证规格”分开以后，带来几个后果：
- 能独立重执行的节点必须追得上生产者的吞吐。
- replica 读到的是对 sequencer 的信任，不是独立验证。
- 仅凭“状态能装进内存”不能直接推出可持续吞吐：状态会持续增长（以太坊 2026-01 约 390 GiB，不是 2024 年说的约 100 GB），state root、DA 和证明也仍要跟上。

**依据。** E64–E69。

**不确定之处。** MegaETH 当前生产 sequencer 的实际硬件规格未公开；表中数字来自 2024 年研究页和博客。

---

## GPT 调研中被修正 / 过时的地方

1. **EIP-7928 的状态。** GPT 写“规范状态为 Review”。实际已是 Last Call（截止 2026-11-01），并已列入 Glamsterdam 的 Scheduled for Inclusion；Glamsterdam 2026-10-06 在 Sepolia 激活，Hoodi 激活 2026-10-22 推迟（E22–E25）。
2. **“改善执行后 state root 可能成为瓶颈”的方向反了。** 对 reth 来说，2026 年恰好相反：state root 已经被流水线化（区块末尾 1–2 ms），Paradigm 因此把精力转回 JIT 和 BAL 并行（E5、E7）。GPT 3.2 节的示意表（执行 80 ms、root 120 ms）只能当示意，不能当 2026 年的现状。
3. **MonadDb“原生组织 MPT”需要补充。** MIP-8 之后，storage trie 改为对 4 KiB 页做承诺，叶子不再是单个 slot（E41）。GPT 说“不是通过取消 MPT 取得收益”大体成立，但承诺粒度已经变了。
4. **对 Verkle/二叉树没有给现状。** Verkle 已被 EIP-7864 二叉树取代（不抗量子是主要原因），EIP-7864 仍是 Draft，也不在 Glamsterdam/Hegotá 的头条里（E52–E54）。
5. **“重新核对 geth 归档体积”的说法应更新为具体数字。** path-based archive 约 2 TB，带历史 trie 约 6.5 TB；v1.17 起支持历史 `eth_getProof`（E47）。
6. **NOMT/QMDB 只被当作“设计参考”。** 应补上 2025-12 起 Commonware 与 LayerZero 合作把 QMDB 产品化，以及 NOMT 已发布 1.0.x（E43–E45）。
7. **Monad 原生编译器的引用正确。** 但应补充：编译目标是 x86-64、热点按累计 gas 选择（E34）。

**内部 2025 研究（Notion）中需要修正的结论：**
- **《并行执行和并行 EVM 综述》**：“执行时间约为 merkleization 的 1/6–1/10”只是 2024 年 reth live sync 的数据，已被 Reth 2.0 推翻（E2、E5）。“JIT 可带来约 2 倍”是 Paradigm 2024 年的预估；revmc 在 L1 历史同步上实测只有 1–10%（E32、E33）。
- **《性能和 ux 提升计划》**：“Verkle 若在 2025 年引入”没有发生，路线已转向 EIP-7864（E52）。“Ethereum 状态约 100G，可全部放进 RAM”已过时，应以 EIP-8037 的约 390 GiB（2026-01）为准（E61）。
- **《不同链中交易依赖程度分析》**：49.10% 是启发式口径，仍可用作“集中度”指标，不能当 slot 级冲突率（E21）。

---

## 来源

1. **PRIMARY** Paradigm, “Reth’s path to 1 gigagas per second, and beyond”（2024-04-24），https://www.paradigm.xyz/writing/reth-perf。证明 2024 年 state root 占封块时间 >75%、约 80% 的 slot 被独立访问、JIT 预估约 2 倍。访问于 2026-10-27。
2. **PRIMARY** Paradigm, “Releasing Reth 2.0!”（2026-04），https://www.paradigm.xyz/writing/releasing-reth-2-0。证明 sparse trie 缓存使区块末尾 root 降到 1–2 ms、Storage v2 的持久化数据、重启 revmc、计划基于 BAL 做完整并行执行。访问于 2026-10-27。
3. **PRIMARY** reth v2.0.0 release notes，https://github.com/paradigmxyz/reth/releases/tag/v2.0.0。证明 Storage v2 默认开启、SparseTrieCacheTask、ArenaParallelSparseTrie，以及 sparse trie 流水线与 payload builder 共享。访问于 2026-10-27。
4. **PRIMARY** reth v2.8.0 release notes，https://github.com/paradigmxyz/reth/releases/tag/v2.8.0。证明 prewarm 结果复用带来 +18.58% Mgas/s、300M-gas BAL 区块的优化，以及 Amsterdam 排期。访问于 2026-10-27。
5. **PRIMARY** Base, “Scaling Base in 2025”，https://blog.base.dev/scaling-base-in-2025。证明存储访问多的区块约慢 30 倍、少状态访问时约 500 Mgas/s、geth/reth 的软上限约 40/100 Mgas/s。访问于 2026-10-27。
6. **PRIMARY** Base, “Scaling Base With Reth”（2024-12-18），https://blog.base.dev/scaling-base-with-reth。证明 geth 与 reth 归档节点的磁盘占用和周增长、出块 p999。访问于 2026-10-27。
7. **PRIMARY** Base, “Scaling Base: Doubling capacity in 30 days”（2025-10-28），https://blog.base.dev/scaling-base-doubling-capacity-in-30-days。证明存储读写是执行速度的长尾、TrieDB 可能带来 8–10 倍、sequencer 已迁到 reth、计划研究 state expiry。访问于 2026-10-27。
8. **PRIMARY** base/triedb README，https://github.com/base/triedb。证明 KV 上存 trie 每个值约 50 次磁盘操作、按页组织可降到约 4–8 次。访问于 2026-10-27。
9. **PRIMARY** MegaETH Research，https://www.megaeth.com/research。证明中位并行度 <2、MPT 更新约为执行的 10 倍、sequencer 规格、“状态约 100 GB”（2024 年）。访问于 2026-10-27。
10. **PRIMARY** MegaETH docs, Architecture，https://docs.megaeth.com/architecture。证明约 10 ms 的 mini-block、replica 节点不重执行、full node 重执行、使用 EigenDA 和 Kailua。访问于 2026-10-27。
11. **PRIMARY** Monad docs, Parallel Execution，https://docs.monad.xyz/monad-arch/execution/parallel-execution；以及 FAQ。证明乐观执行加串行合并、每笔交易最多执行两次。访问于 2026-10-27。
12. **PRIMARY** Monad docs, Asynchronous Execution，https://docs.monad.xyz/monad-arch/consensus/asynchronous-execution。证明延迟 merkle root D=3、Reserve Balance。访问于 2026-10-27。
13. **PRIMARY** Monad docs, JIT Compilation，https://docs.monad.xyz/monad-arch/execution/native-compilation。证明编译到原生 x86-64、按累计 gas 选热点、异步编译、语义一致。访问于 2026-10-27。
14. **PRIMARY** Monad docs, MonadDb，https://docs.monad.xyz/monad-arch/execution/monaddb。证明原生 Patricia trie、io_uring、绕过文件系统、持久化 trie 加顺序写。访问于 2026-10-27。
15. **PRIMARY** MIP-8: Page-ified Storage State，https://mips.monad.xyz/MIPs/MIP-8。证明以 128 slot / 4096 B 为一页、页承诺用 BLAKE3 ISMC。访问于 2026-10-27。
16. **PRIMARY** Monad docs, Hardware Requirements，https://docs.monad.xyz/node-ops/hardware-requirements。证明验证者和全节点硬件规格相同、必须裸金属。访问于 2026-10-27。
17. **PRIMARY** Block-STM, arXiv 2203.06871，https://arxiv.org/abs/2203.06871。证明 32 线程下最高 170k tps（17 倍）、竞争负载下 50k–80k tps、在 Aptos 生产运行（截至论文）。访问于 2026-10-27。
18. **PRIMARY** Solana docs, Transaction processing pipeline，https://solana.com/docs/core/transactions/transaction-pipeline。证明账户锁冲突在调度阶段报 `AccountInUse`、加锁数量有上限。访问于 2026-10-27。
19. **PRIMARY** Sui docs, Types of Object Ownership，https://docs.sui.io/concepts/object-ownership。证明 address-owned 对象走快路径、shared 对象需共识排序，且热点 shared 对象会降低吞吐。访问于 2026-10-27。
20. **PRIMARY** Sei docs, What Is Sei Giga?，https://docs.sei.io/learn/sei-giga。证明 v6.6（2026-08-04）上线 Ares 第一阶段、Block-STM 风格 OCC、LtHash 承诺仍处于 operator-gated 阶段、5 Ggas/s 是内部 devnet 数据。访问于 2026-10-27。
21. **PRIMARY** risechain/pevm 仓库与 benches README，https://github.com/risechain/pevm。证明仓库仍为 WIP、未归档；内存态主网回放平均约 2.02 倍、最高 4.32 倍。访问于 2026-10-27。
22. **PRIMARY** EIP-7928，https://eips.ethereum.org/EIPS/eip-7928。证明 Last Call（截止 2026-11-01）、用途、60–80% 交易互不相交、平均约 92 KiB。访问于 2026-10-27。
23. **PRIMARY** EF, Glamsterdam Hoodi Testnet Announcement（2026-10-16，2026-10-22 更新），https://blog.ethereum.org/en/2026/10/16/glamsterdam-hoodi-announcement。证明 Sepolia 已于 10-06 激活、EIP 清单、主网日期未定。访问于 2026-10-27。
24. **PRIMARY** EF, Glamsterdam on Hoodi Postponed，https://blog.ethereum.org/2026/10/22/glamsterdam-hoodi-delay。证明因 EIP-8037 的交互问题推迟、新日期未定。访问于 2026-10-27。
25. **PRIMARY** go-ethereum v1.17.9 release，https://github.com/ethereum/go-ethereum/releases/tag/v1.17.9。证明内联 switch 使分发快 16%、BAL 修复、状态历史提交移到后台。访问于 2026-10-27。
26. **PRIMARY**（geth 开发者 gary rong）HackMD “Concurrent read benchmarking”（2025-11-10），https://hackmd.io/@bFEBbZiVSAO0IURh9qzEFg/S1Y-mjBkWe。证明 Pebble 主网库并发读约 200k QPS 后饱和、带读位置的 BAL 约快 10 倍。访问于 2026-10-27。
27. **PRIMARY** geth docs, Archive mode，https://geth.ethereum.org/docs/fundamentals/archive。证明 path archive 约 2 TB / 6.5 TB、v1.17 支持历史 getProof。访问于 2026-10-27。
28. **PRIMARY** Paradigm, “Releasing Revmc”（2024），https://www.paradigm.xyz/writing/revmc。证明 1.85–19 倍（criterion 合成负载）、L1 历史同步只有 1–10%。访问于 2026-10-27。
29. **PRIMARY** QMDB, arXiv 2501.05262，https://arxiv.org/abs/2501.05262。证明“每次访问 1 次 SSD 读、更新 O(1) IO、比 RocksDB 快 6 倍、比 NOMT 快 8 倍”等作者自测数字。访问于 2026-10-27。
30. **PRIMARY** Commonware, “QMDB All The Things”（2025-12-10），https://commonware.xyz/blogs/qmdb。证明与 LayerZero 合作产品化 QMDB。访问于 2026-10-27。
31. **PRIMARY** thrumdev/nomt 仓库与 crates.io nomt 1.0.5，https://github.com/thrumdev/nomt、https://crates.io/crates/nomt。证明 NOMT 已发布 1.0.x、由 Beatree 和 Bitbox 两部分存储组成。访问于 2026-10-27。
32. **PRIMARY** Avalanche Builder Hub, Firewood，https://docs.avax.network/docs/primary-network/firewood。证明 Firewood 仍是实验性后端、默认 LevelDB、无 compaction、归档约 3 TB 对约 16 TB（早期测量）。访问于 2026-10-27。
33. **PRIMARY** EIP-7864，https://eips.ethereum.org/EIPS/eip-7864。证明 Draft、哈希函数未定、因 Verkle 不抗量子而选二叉树。访问于 2026-10-27。
34. **PRIMARY** EF, “The Hegotá EIP Opinion Post and Tier List”（2026-09-07），https://blog.ethereum.org/2026/09/07/protocol-hegota-eips。证明头条是 FOCIL 和 Frame Tx、EIP-7862 Delayed State Root 被暂缓、trie migration 另有设计。访问于 2026-10-27。
35. **PRIMARY** EF, “Partial history expiry announcement”（2025-07-08），https://blog.ethereum.org/2025/07/08/partial-history-exp。证明所有执行客户端支持删除 merge 前历史、节省 300–500 GB。访问于 2026-10-27。
36. **PRIMARY** EF, “The Future of Ethereum’s State”（2025-12-16），https://blog.ethereum.org/2025/12/16/future-of-state。证明 state expiry 的两条思路、约 80% 状态一年未被访问、该文是提案而非共识。访问于 2026-10-27。
37. **PRIMARY** EIP-8037，https://eips.ethereum.org/EIPS/eip-8037。证明 2026-01 geth 状态库约 390 GiB、年增约 116 GiB、Last Call。访问于 2026-10-27。
38. 同仓库报告 revm-vs-evm2 台账（`reports/2026/10/revm-vs-evm2/research/ledger.md`，2026-10-25 核实）。证明 H37（evm2 主网回放 4.8–6.2%）、X42（revm 维护者认为 IO 占主导）、M28–M31、M38、M41 等。访问于 2026-10-27。
39. 内部研究（Notion）：《并行执行和并行 EVM 综述》《不同链中交易依赖程度分析》《性能和 ux 提升计划》《由 QMDB 引发的对于区块链状态管理方案综述》《Verkle Tree 对于磁盘 IO 的影响》《客户端实现性能收集》，本地副本 `.rh/scratch/hp-roadmap/notion/*.md`。证明 2025 年的内部结论（作为被核对对象）。访问于 2026-10-27。
40. AFT 2025 论文 “Efficient Parallel Execution of Blockchain Transactions Leveraging Conflict Specifications”，https://drops.dagstuhl.de/storage/00lipics/lipics-vol354-aft2025/LIPIcs.AFT.2025.29/LIPIcs.AFT.2025.29.pdf。证明 merge 前历史区块上 PEVM 约 2.73 倍、Block-STM 约 2.68 倍。只读了检索摘要，没有全文核对。访问于 2026-10-27。
41. ethereum.org, Statelessness, state expiry and history expiry（页面更新于 2026-06-30），https://ethereum.org/roadmap/statelessness；以及 EIP-7736（Stagnant），https://eips.ethereum.org/EIPS/eip-7736。证明 state expiry 仍处研究阶段。只读了检索摘要。访问于 2026-10-27。

已拒绝或降级的来源：
- Bankless、CoinDesk、MEXC、spotedcrypto、TokenPost、NBTC 等二手报道：只当线索。其中 TokenPost 说“Ares 计划后续发布”，与 Sei 官方文档矛盾，以官方为准。
- shattered.io、ainvest 关于 Verkle 的文章：有事实错误（例如称“通过 EIP-7864 实现 Verkle”）。
- Medium 上的 RISE 介绍文：二手。
- 7BlockLabs 归档体积文：二手，以 geth 官方文档代替。

---

## 开放问题

1. 2026 年主网上“执行 / 冷读 / 后台 root / 持久化”的 CPU 与 IO 占比：可用 reth-bench 或 benchmarkoor 自测，公开资料中没有。
2. BAL 并行在 L2（OP Stack）上怎么落地：OP Stack 是否、何时采用 Amsterdam 或类似的 Flashblock Access List，本路没有核实（Base 文中提到 FAL，见 E7）。
3. Monad MIP-8 的主网激活时间，以及页式承诺对 witness 和证明系统的影响。
4. Base TrieDB 的 2026 年生产状态和实测收益。
5. 在真实 L2（尤其高集中度的合约负载）上，乐观并行执行与 prewarm 复用的收益对比。

---

## 论断台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| E1 | 2024-04 时，reth 的 state root 计算占封块端到端时间的 75% 以上。 | [1] §Improving the State Commitment（访问于 2026-10-27） | observed | |
| E2 | MegaETH 2024 年测得，在 512 GB 内存服务器上 reth live sync 约 1000 TPS（约 100 Mgas/s），MPT 更新开销约为执行的 10 倍。 | [9] §Understanding Ethereum Execution Client Performance / Updating the state root（访问于 2026-10-27） | observed | |
| E3 | Base 测得：不论哪个执行客户端，存储访问多的区块执行时间约为无存储访问区块的 30 倍；状态访问很少时可达约 500 Mgas/s。 | [5] §Bottleneck 2 Client Execution Speed（访问于 2026-10-27） | observed | |
| E4 | Base 认为存储读写是执行速度的长尾，并为此开发 TrieDB，预计可带来 8–10 倍提升。 | [7] §Effort 2: TrieDB（访问于 2026-10-27） | observed | |
| E5 | Reth 2.0（2026-04）通过跨块保留的 sparse trie 缓存，把主网区块末尾的 state root 计算降到 1–2 ms。 | [2] §Optimising Parallel State Calculation；[3] SparseTrieCacheTask（访问于 2026-10-27） | observed | |
| E6 | Reth 2.0 的 Storage v2 让普通区块平均持久化时间降到 40 ms，Gigagas 级区块从 8.4 s 降到 0.4 s。 | [2] §Tiered Storage（访问于 2026-10-27） | observed | |
| E7 | Paradigm 表示因 state root 不再是瓶颈，重启 revmc JIT，并计划基于 Glamsterdam 的 BAL 实现完整并行执行。 | [2] §What's Next for Reth（访问于 2026-10-27） | observed | |
| E8 | 在主网回放中，evm2 的解释器优化只带来 4.8%–6.2% 的提升，因为预编译、keccak 和状态操作稀释了解释器收益。 | revm-vs-evm2 台账 H37 [38] | observed | |
| E9 | 对 2026 年的 reth 类客户端，主网区块处理的主要剩余开销是执行期间的状态读取，其次才是解释器计算。 | 由 E3、E4、E5、E8 推出：root 尾巴已降到毫秒级，存储访问使区块慢约 30 倍，解释器优化在主网只有个位数收益 | inferred | |
| E10 | 执行层瓶颈可以分为计算、等待状态、业务串行依赖三类，前两类可用工程手段压缩，第三类需要改变业务或状态布局。 | 由 E3、E8、E18 推出：存储访问与计算的影响可以分开测量，而并行度受依赖链限制 | inferred | |
| E11 | Block-STM 保证并行执行的结果等同于按预定顺序串行执行，32 线程下最高 170k tps（17 倍），竞争负载下为 50k–80k tps。 | [17] Abstract（访问于 2026-10-27） | observed | |
| E12 | Monad 用乐观并行执行生成待定结果，再按顺序合并并检查输入，输入失效就重执行，每笔交易最多执行两次。 | [11] Parallel Execution 页与 FAQ（访问于 2026-10-27） | observed | |
| E13 | Solana 交易要事先声明账户读写，调度阶段按账户加锁；账户已被同批交易锁住时报 AccountInUse。 | [18] §Transaction error reference（访问于 2026-10-27） | observed | |
| E14 | Sui 的 address-owned 对象走快路径不经共识，shared 对象要经共识排序，同一 shared 对象上的竞争会降低吞吐。 | [19] Ownership 表与 Shared 小节（访问于 2026-10-27） | observed | |
| E15 | Sei v6.6 于 2026-08-04 在主网上线 Giga 执行组件 Ares 的第一阶段（Block-STM 风格 OCC，带逐交易回退到 v2 的路径）。 | [20] Status (August 2026) 与 roadmap 表（访问于 2026-10-27） | observed | |
| E16 | Sei Giga 的 5 Ggas/s 来自 40 节点的内部 devnet，不是主网数据；FlatKV 与 LtHash 承诺仍默认关闭。 | [20] Sei Giga at a glance；Flat storage and lattice hashes（访问于 2026-10-27） | observed | |
| E17 | MegaETH 认为 Block-STM 不适合它的低延迟场景，原因是需要每 10 ms 稳定出块并支持交易优先级。 | [9] §parallel EVM 段落（访问于 2026-10-27） | observed | |
| E18 | MegaETH 测得近期以太坊区块（20000000–20010000）的中位并行度小于 2，合并成大批次后也只有 2.75。 | [9]（访问于 2026-10-27） | observed | |
| E19 | RISE pevm 在内存态的以太坊主网区块回放中平均约快 2.02 倍，最高 4.32 倍。 | [21] crates/pevm/benches README（访问于 2026-10-27） | observed | |
| E20 | EIP-7928 估计 60–80% 的交易访问互不相交的存储 slot，其余 20–40% 可借助交易后的状态差分并行。 | [22] §Rationale BAL Design Choice（访问于 2026-10-27） | observed | |
| E21 | Mantle 内部 2025-03 测得的 49.10% 依赖率，用的是同发送方、同合约同选择器等启发式标准，不是 slot 级冲突率。 | 内部研究《不同链中交易依赖程度分析》(Notion) [39] §交易依赖标准 | observed | |
| E22 | EIP-7928（BAL）状态为 Last Call，截止日期 2026-11-01。 | [22] 页头（访问于 2026-10-27） | observed | |
| E23 | Glamsterdam 于 2026-10-06 在 Sepolia 激活，EIP-7928 在其 Scheduled for Inclusion 名单中。 | [23] 正文与 EIP 清单（访问于 2026-10-27） | observed | |
| E24 | 原定 2026-10-26 的 Hoodi 激活已于 2026-10-22 宣布推迟，原因是需进一步调查 EIP-8037 与主网合约的交互，没有新日期。 | [24]（访问于 2026-10-27） | observed | |
| E25 | 截至 2026-10-27，以太坊主网 Glamsterdam 的激活日期未定。 | [23] “The mainnet activation date has not yet been decided”；[24] | observed | |
| E26 | BAL 让客户端可以并行读盘、并行验证交易、并行计算 state root，并可不执行交易就更新状态。 | [22] Abstract/Motivation；[23] §Block-Level Access Lists（访问于 2026-10-27） | observed | |
| E27 | geth 开发者测得，在 Pebble 主网库上并发读约 200k QPS 后饱和；带读位置的 BAL（128 线程）比不带读位置的（4 线程）约快 10 倍。 | [26] Concurrent read over the Ethereum mainnet dataset（访问于 2026-10-27） | observed | |
| E28 | reth v2.8.0 已实现基于 BAL 的执行路径并做了优化：300M gas 的 BAL 区块平均执行时间降低 8.41%。 | [4] §Performance（访问于 2026-10-27） | observed | |
| E29 | geth v1.17.9 已为 Hoodi 设置 Amsterdam 激活，并修复了 BAL 相关的并发损坏问题，说明 geth 的 BAL 路径已实现但只在测试网运行。 | [25] §Core（访问于 2026-10-27） | observed | |
| E30 | RISE pevm 仓库未归档，但仍自称 WIP、不可用于生产，最后一次提交在 2026-06-05。 | [21] README；revm-vs-evm2 台账 A30 [38] | observed | |
| E31 | 截至 2026-10-27，reth 和 geth 的 BAL 并行执行在以太坊主网都还没有生效，原因是 Glamsterdam 尚未在主网激活。 | 由 E25、E28、E29 推出 | inferred | |
| E32 | revmc 在 criterion 合成负载上快 1.85–19 倍（Fibonacci 19 倍），但接入 reth 做以太坊 L1 历史同步只快约 1–10%。 | [28] §How fast is it（访问于 2026-10-27） | observed | |
| E33 | Paradigm 2024 年预估 JIT 能让 EVM 执行快约 2 倍，依据是“约 50% 执行时间在解释器”，这一预估在 L1 历史同步实测中没有兑现。 | 由 [1] §JIT 与 E32 推出 | inferred | |
| E34 | Monad 用优化解释器加自研原生编译器：按累计 gas 选出热点合约，异步编译成 x86-64 并缓存，未编译时走解释器，宣称 gas 和错误语义完全一致。 | [13]（访问于 2026-10-27） | observed | |
| E35 | reth v2.4.0 加入实验性 revmc JIT，需用 `--jit` 参数手动开启。 | reth v2.4.0 release notes（经 newreleases.io 镜像检索，访问于 2026-10-27） | observed | |
| E36 | reth main 已在 2026-10-24 用 evm2 替换 revm；evm2 JIT 默认编译进二进制，运行时默认关闭。 | revm-vs-evm2 台账 A8、A10 [38] | observed | |
| E37 | geth v1.17.9 改用内联 switch 实现 opcode 分发，分发速度提升 16%。 | [25] §Core #35638（访问于 2026-10-27） | observed | |
| E38 | 由于主网负载以状态访问为主，JIT 与解释器优化对整链吞吐的收益很可能只有个位数到低两位数百分比，计算密集型 L2 应用除外。 | 由 E8、E9、E32 推出 | inferred | |
| E39 | 在通用 KV 上存 MPT，读写一个值约需 50 次磁盘操作；按 trie 结构把子树打包进页后，预计可降到约 4–8 次。 | [8] README Overview（访问于 2026-10-27） | observed | |
| E40 | MonadDb 在磁盘和内存中原生实现 Patricia trie，用 io_uring 做异步 IO，可绕过文件系统，并用持久化（不可变）trie 实现顺序写和多版本读。 | [14]（访问于 2026-10-27） | observed | |
| E41 | Monad MIP-8 把 storage trie 改为对 128 个 slot（4096 字节）一页的 BLAKE3 页承诺，使承诺单位与一次 SSD 读一致。 | [14] §Page-based storage state；[15] Specification（访问于 2026-10-27） | observed | |
| E42 | QMDB 论文宣称每次状态访问只需 1 次 SSD 读、更新为 O(1) IO、内存中做 merkleization，吞吐最高为 RocksDB 的 6 倍、NOMT 的 8 倍（作者自测）。 | [29] Abstract（访问于 2026-10-27） | observed | |
| E43 | Commonware 于 2025-12-10 宣布与 LayerZero 合作，把 QMDB 产品化进 Commonware Library。 | [30]（访问于 2026-10-27） | observed | |
| E44 | NOMT 已在 crates.io 发布 1.0.x，内部由 Beatree（键值）和 Bitbox（trie 页）两部分存储组成。 | [31]（访问于 2026-10-27） | observed | |
| E45 | Firewood 在 Avalanche 仍是实验性后端，AvalancheGo 默认数据库仍是 LevelDB。 | [32] Choose your database 表与 FAQ（访问于 2026-10-27） | observed | |
| E46 | Reth 2.0 的 Storage v2 在 MDBX 中只存 hashed state，历史 changeset 移到静态文件，索引移到 RocksDB，并成为新节点默认配置。 | [2] §Tiered Storage；[3]（访问于 2026-10-27） | observed | |
| E47 | geth 的 path-based archive（v1.16+）在主网约需 2 TB，带历史 trie 节点约 6.5 TB；v1.17 起配置 `history.trienode` 后支持历史 `eth_getProof`。 | [27] §Path-Based Archive Node（访问于 2026-10-27） | observed | |
| E48 | QMDB、NOMT、Firewood 的公开性能数字都来自作者自测或早期工程测量，不是 EVM 主网生产数据。 | 由 E42、E44、E45 与 [32] “early engineering measurements” 推出 | inferred | |
| E49 | Monad 的提案只携带 D 块之前的延迟 merkle root，D 目前在测试网和主网均为 3；执行出错的节点会在 D 块后脱离共识并回滚重执行。 | [12] §Delayed Merkle Root（访问于 2026-10-27） | observed | |
| E50 | Monad 因共识只看得到延迟 D 块的状态，引入了 Reserve Balance 规则来约束可打包交易。 | [12] §Reserve balance（访问于 2026-10-27） | observed | |
| E51 | reth 2.0 的 sparse trie 流水线与 payload builder 共享，出块路径和验证路径都能用上后台 root 计算。 | [3] “Shared execution cache and sparse trie pipeline with payload builder”（访问于 2026-10-27） | observed | |
| E52 | EIP-7864（统一二叉树）仍为 Draft，哈希函数未定（BLAKE3、Keccak、Poseidon2 三选一）；它取代 Verkle 的主要理由是 Verkle 依赖不抗量子的椭圆曲线。 | [33] Abstract 注释与 Rationale（访问于 2026-10-27） | observed | |
| E53 | Hegotá 的执行层头条是 Frame Transactions（EIP-8141），共识层头条是 FOCIL，二叉树迁移不在头条中。 | [34] Execution layer / Consensus layer 表（访问于 2026-10-27） | observed | |
| E54 | EIP-7862（Delayed State Root）在 Hegotá 评级中被列为 DFI（暂缓）。 | [34] Execution layer 表 7862 行（访问于 2026-10-27） | observed | |
| E55 | Sei Giga 计划用对区块写日志的 LtHash 摘要取代热路径上的 Merkle state root，状态证明改用逐块更新摘要（BUD）。 | [20] Flat storage and lattice hashes（访问于 2026-10-27） | observed | |
| E56 | 把 root 移出关键路径（延迟 root、后台流水线、写日志摘要）在 2026 年已成为高性能链的共同做法，以太坊 L1 本身则暂未采用协议层延迟 root。 | 由 E5、E49、E54、E55 推出 | inferred | |
| E57 | 自 2025-07-08 起，所有以太坊执行客户端都支持删除 merge 前的区块体和回执，可节省 300–500 GB。 | [35]（访问于 2026-10-27） | observed | |
| E58 | 以太坊完整的滚动式历史过期截至 2025-07 仍在开发中。 | [35] “work on full, rolling history expiry is ongoing” | observed | |
| E59 | EF 无状态团队 2025-12 提出 mark-expire-revive 与 multi-era 两类 state expiry 思路，测得约 80% 的状态一年以上没被访问；该文明确只是提案。 | [36] §State Expiry 与免责声明（访问于 2026-10-27） | observed | |
| E60 | state expiry 截至 2026 年仍处研究阶段，叶级过期提案 EIP-7736 处于 Stagnant。 | [41]（检索摘要，访问于 2026-10-27） | observed | |
| E61 | 截至 2026-01，geth 中状态库约 390 GiB；gas 上限从 30M 提到 60M 后，每日新增状态从约 105 MiB 升到约 326 MiB，年增约 116 GiB。 | [37] Motivation（访问于 2026-10-27） | observed | |
| E62 | Base 测得 geth 归档节点每周增长约 560 GB，reth 约 50 GB；当时 geth 归档占 16.61 TB，reth 占 2.74 TB。 | [6] 对比表（访问于 2026-10-27） | observed | |
| E63 | Base 把“状态与历史增长”列为四大扩容瓶颈之一，并表示下一个长期项目可能是 state expiry。 | [7] §Bottleneck 4（访问于 2026-10-27） | observed | |
| E64 | MegaETH 的 sequencer 规格为 100 核、1–4 TB 内存、10 Gbps，replica 节点为 4–8 核、16 GB。 | [9] 硬件表（访问于 2026-10-27） | observed | |
| E65 | MegaETH 的 replica 节点直接应用 sequencer 发来的执行结果、不重执行；full node 重执行并独立验证每次状态转换。 | [10] §RPC Nodes（访问于 2026-10-27） | observed | |
| E66 | Monad 要求验证者和全节点用相同硬件：16 核、4.5 GHz 以上、32 GB 以上内存、2 TB NVMe 存 TrieDB，并且必须是裸金属。 | [16]（访问于 2026-10-27） | observed | |
| E67 | MegaETH 2024 年的“全部状态可放进 RAM”是以以太坊状态约 100 GB 为前提，而 2026-01 geth 状态库已约 390 GiB。 | [9]；[37] | observed | |
| E68 | 当生产者硬件远高于验证节点时，replica 读到的结果只能信任 sequencer；能独立验证的节点必须在更低硬件上追上生产者吞吐，否则独立验证会长期落后。 | 由 E64、E65、E66 推出 | inferred | |
| E69 | 把状态放进内存只能解决读延迟，不能消除 state root、持久化、状态增长、DA 和证明的成本。 | 由 E2、E6、E61、E67 推出 | inferred | |
| E70 | 2025 年内部研究中“执行时间约为 merkleization 的 1/6–1/10”的结论，在 Reth 2.0 之后已不再成立。 | 由 E2、E5 与内部研究《并行执行和并行 EVM 综述》(Notion) [39] 推出 | inferred | |
| E71 | 2025 年内部计划里“Verkle 若在 2025 年引入”没有发生，以太坊状态树路线已转向 EIP-7864 二叉树，且尚未排入分叉。 | 由 E52、E53 与内部研究《性能和 ux 提升计划》(Notion) [39] 推出 | inferred | |
| E72 | 内部研究所引 RISE 的“共识占 40–80%、执行最坏只占约 8%”数据找不到可追溯的一手来源。 | 内部研究《并行执行和并行 EVM 综述》(Notion) [39] 只给转述，没有找到对应原文 | speculative | |
| E73 | 在 merge 前的以太坊历史区块上，有学术评测测得 PEVM 平均约快 2.73 倍、Block-STM 约 2.68 倍。 | [40]（仅检索摘要，没有全文核对） | speculative | |

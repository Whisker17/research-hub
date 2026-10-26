# notes-mantle：Mantle 当前基线、产品叙事、2025 内部研究复核、改动约束

- 调研路：M（台账前缀 M）。调研日期 2026-10-27，网页来源均为当日访问。
- 本路没有 bash，没有跑 RPC 或 gh。主会话的 `mantle-facts.md` 在开工和收尾时都不存在（`.rh/scratch/hp-roadmap/mantle-facts.md` 报 ENOENT），所以链上参数一律引用公开文档、release 记录，或同仓库已有报告的台账。
- 同仓库已有报告的引用格式：“research-hub 报告 <slug> 台账 <编号>”。asseq = application-specific-sequencing（2026-10-11 的源码快照），revm = revm-vs-evm2（2026-10-25 的源码快照）。
- 内部资料的引用格式：内部研究《标题》(Notion)。本地副本里有几篇只有 stub，正文在附件里、本地读不到：《流式出块技术方案设计 - geth》《关于 Reth 与 Geth 性能对比的说明与勘误》《MegaEth 高性能技术解析》《Monad 高性能设计解析》《CLOBs on Mantle》（只剩一行设计目标）。这几篇没有当作已读全文。

---

## M-Q1 Mantle 技术基线（2026-10）

### 答案
- **形态**：Mantle 是 OP Stack 系 ZK Rollup，L2BEAT 定级 Stage 0。
- **出块与执行**：出块 2 秒；release 记录写明当前 gas limit 为 60M。官方文档写的 sequencer 执行层仍是 op-geth。
- **reth 的位置**：mantle-xyz/reth 已有构建“在主网运行”，但“sequencer 切到 pure Reth”在路线图里仍是 2026 H2 的未完成项。
- **DA 与证明**：DA 已从 EigenDA 迁到 Ethereum blobs，Arsia 起只用以太坊 DA。证明从 2025-09-16 起走 OP Succinct（SP1），提款期 12 小时。
- **排序**：交易池私有，按小费排序。代码里另有一条白名单 FIFO 的 preconf 车道。Flashblocks 仍未上线。
- **与性能相关、已发布的改动**：
  - Arsia（主网 2026-04-22）带来 span batch、Brotli、三段式费用、动态 EIP-1559 和 DA footprint；
  - Elysium v1.6.3 带来 eager next-block construction。但 Elysium 的官方公告只针对测试网，**主网是否已经跑 eager construction，没有一手来源能确认**。

### 依据

**升级时间线**（M1–M16）

| 升级 | 版本 | 主网时间 | 与性能 / 容量相关的内容 |
|---|---|---|---|
| Everest | v1.1.x | release 页没写日期 | 主网启用 EigenDA，替换 MantleDA；Pectra 兼容（7702、RIP-7212）；废弃 MetaTX，改用 7702 代付 [1][13] |
| Skadi | v1.3.x | release 页没写日期 | 支持 Prague；op-node 新增 `optimism_safeHeadAtL1Block`，用于“更快生成 succinct ZKP” [1] |
| Limb | v1.4.2 | 2026-01-14 07:00 UTC | 支持 Osaka/Fusaka；batcher 支持 cell proof blob；blob 改从 beacon `blobs` 接口读取 [1] |
| Arsia | v1.5.4 | 2026-04-22 07:00 UTC（release）；L2BEAT 记为 04-16 / 04-24 | 同时激活 Canyon→Jovian 8 个 OP 分叉，rebase 到 op-node v1.16.3；span batch 加 Brotli；标准 OP blob 格式；三段式费用（含 operator fee）；动态 EIP-1559，带 min base fee；DA footprint 计入 base fee [1][5][6][17] |
| Elysium | v1.6.3 | Sepolia 2026-10-06；主网未公告 | 兼容 L1 Glamsterdam；**eager next-block construction**（PR #370）；preconf 一致性修复；L2 仍用 Arsia/Osaka 规则，不启用 Amsterdam EVM，也就没有 BAL [1][2][3][16] |

- 说明：表中“operator fee 与 Isthmus/Jovian 对齐”都发生在 Arsia 这一次，不是单独的升级。
- DA 迁移：DA 迁移公告没有写日期 [7]。L2BEAT 记录 2026-01-21 起 blobs 与 EigenDA 并行，2026-04-16 起只用以太坊 DA [17]。
- 批次节奏：L2BEAT 统计 batch 平均每 8 分 4 秒提交一次 [17]。这只是 DA 发布节奏，不代表证明节奏。

**区块参数**（M17–M20）
- block_time = 2（主网 rollup.json，research-hub 报告 asseq 台账 M4）。
- mantle-v1.6.2 release（2026-10-12）原文 “cannot be reached at the current 60M gas limit”。同一 release 还写明：Limb 起完整区块 RLP 上限为 8,388,608 字节，builder 的可选交易只填到 7,388,608 字节 [15]。
- gas target 由 SystemConfig 上的 elasticity 决定，经区块 extraData 传到 L2 [6]。本路没有查到它的当前值。

**执行客户端**（M21–M24）
- docs Node Introduction：sequencer 和 verifier 都由 “op-node and op-geth” 组成 [11]。
- mantle-xyz/reth 的 release：
  - `op-reth-v2.2.1-mantle-arsia.2`（2026-08-26）把 `...-arsia.1` 称作 “the build running on mainnet”，并说明 revm 从私有 GHSA fork 移回了公开 tag；
  - `mantle-v1.6.2` 写着 “Required for sequencers running preconf”；
  - rc4 的验收测试是在 “devnet from scratch, reth as sequencer” 下跑的 [15]。
- 路线图 2026 H2（未勾选）原文：“Mainnet Sequencer and RPC Full Switch to Pure Reth … Geth client relegated to disaster recovery hot standby” [4]。
- research-hub 报告 revm 台账 M14–M17 的结论一致：公开证据只能确认 reth 的某个构建在主网运行，确认不了它是不是 sequencer。

**证明**（M25–M29）
- 2025-09-16 起所有新状态根都走 ZK 证明，2025-09-23 起提款期从 7 天改为 12 小时。文档原话说 12 小时是 “a deliberate security measure … safety buffer” [8]。
- 证明流水线：Mantle-Succinct-Proposer 请求 range proof，SP1 执行由 Kona 编译出的程序，再聚合，最后提交到 `MantleSuccinctL2OutputOracle` [10]。
- 证明故障时可以回退到 op-proposer 乐观模式，恢复 7 天挑战期 [9]。L2BEAT 写的是 “Prover: SP1 Hypercube”、“12h execution delay” [17]。
- **文档里没有任何证明时延或证明区间的数字。**

**排序与 mempool**（M30–M33）
- 路线图把 Flashblocks 列为 H2 未勾选 [4]。
- op-geth 里有白名单（from×to）FIFO preconf 车道和 `eth_sendRawTransactionWithPreconf`，2025-06-05 合入；Sepolia 的 proxyd 已开放，主网是否启用未知（research-hub 报告 asseq 台账 M13、M17、M19–M22）。
- 普通交易按有效小费降序，同价按到达时间（asseq 台账 M14）。交易池私有（asseq 台账 M5）。

### 不确定之处
- **Arsia 主网日期有三个说法**：release 写 2026-04-22 07:00 UTC；L2BEAT 写 2026-04-16 SystemConfig 升级，04-24 “Arsia fee mechanics activated”。本笔记以 release 为准，同时保留矛盾记录。
- **eager next-block construction 在主网的状态**：v1.6.3 是 op-node 版本，PR #370 把它设为默认开启。但文档的主网部署指南仍是 v1.5.4 [14]，Elysium 公告也只针对测试网 [3]。另一方面，L2BEAT 记录 2026-09 的 vkey 已经更新到 mantle-v1.6.0 / v1.6.1 [17]，说明 v1.6 线的证明程序已上主网。主网 sequencer 的 op-node 版本，仍需要运维侧确认。
- 主网的 gas target 和 elasticity、preconf 白名单、主网 sequencer 的执行客户端，都没有一手来源。
- docs 的 EIP-1559 Support 页仍写“base fee 固定 0.02 gwei”“Tectonic 采用 FIFO”[12]。这与 Arsia 文档 [5] 和代码（asseq M14）都矛盾，应是文档过时。

---

## M-Q2 产品叙事与各类用户对链的性能要求

### 答案
- **mStocks 是什么**：Bybit 与 Mantle 合作开发的代币化股票。Bybit 2026-10-12 的新闻稿称目标 **2026 年 11 月上线**，1:1 由实股支持。用户可以在 Bybit 上 24/7 双向转换实股和 mStocks，也可以在 Mantle 的 AMM 池里交易；转换后的 mStocks 可以转入 Bybit UTA 作抵押 [21]。截至 2026-10-27 还没有上线。
- **发行方**：只有二手报道说是 BVI 注册的 Halo Prime Limited，以有限追索债务的形式发行 [22]，属于 speculative。
- **路线图里的相关项**：mStocks 与 Shielded Pool 隐私交易 POC 绑定 [4]。2026 H2 还有三项：
  - native AA：评估 EIP-8130 / 8141，提供代付、session、智能账户；
  - 2D nonce：面向高频支付和交易；
  - Prop AMM：高优先级撤单和专用撮合路径 [4]。
- **没找到公开一手来源的**：JIT Router。

### 依据
- Bybit 新闻稿片段（经搜索摘录，直接抓取超时）[21]：“Bybit is also developing mStocks in collaboration with Mantle, with a targeted launch in November … backed 1:1 by real stocks … trading through automated market maker (AMM) liquidity pools on Mantle … transferable into Bybit's Unified Trading Account (UTA) for use as trading collateral”。
- 二手报道 [22]：“Halo Prime Limited … will issue mStocks as limited-recourse debt obligations”；“Bybit will supply the trading interface and operate the smart contract functions … neither the issuer nor the custodian”。
- 路线图原文 [4]，见 M37、M38、M40。
- native AA：research-hub 报告 native-aa-eip-8130-8141 的结论是 “先做 8130 PoC，同时用 8141 + 8250 做对照组” [25]。
- 交易执行质量：
  - preconf 车道和应用特定排序的插入点见 research-hub 报告 asseq 台账 M12、M45；
  - 路线图里 “On-chain Governance of Pre-Confirmation Mechanisms” 要把预确认策略和路由权限做成链上合约 [4]。

### 各类用户对链的性能要求（全部 inferred，M42）

| 用户 | 典型动作 | 主要性能属性 | 主要涉及的组件 |
|---|---|---|---|
| 发行方（Halo Prime / Bybit 的合约运营方） | 7×24 mint/burn，响应转换请求；对账 | 纳入确定性、尾延迟、事件可索引、与 Bybit 账本对账的最终性语义（预确认 / unsafe 与 12h 提款最终性的区别） | 准入、排序（不被拥堵挤出）、RPC / 索引、证明 |
| 普通买家 | 稳定币 → mStock（AMM） | 签名次数（AA 代付、批量调用）、报价新鲜度、预确认时延 | 账户层、预确认、状态流 |
| 做市商 / Prop AMM | 高频改价、撤单 | 撤单优先（结构性规则，不靠出价）、低尾延迟、状态新鲜度 | 排序规则、preconf 车道容量、builder |
| Agent | 多策略并发 | 2D nonce 免队头阻塞、限权 session、代付预算不形成热点 | 账户层、交易池准入 |

- 美股休市时 AMM 价格无法与实股锚定，所以休市时段的报价更新和套利流量可能集中出现（speculative）。

### 不确定之处
- 发行方、托管方和转换流程的条款没有一手文本，只有二手报道。
- mStocks 的合约部署地址、首批股票和上线日期还没公布。
- mStocks 与 xStocks（Backed 发行，已在 Mantle 上，research-hub 报告 asseq 台账 M42）的关系，本路没有核实。

---

## M-Q3 2025 内部研究复核

| 内部结论（出处） | 2026 状态 | 依据 |
|---|---|---|
| 短期引入 flashblocks/miniblocks 小区块，延迟 merkleization（《性能和 ux 提升计划》） | **部分实现**：eager next-block construction 只缩短块间空窗，属于流水线；亚秒级子块（Flashblocks）仍未上线；另有 preconf 车道给出单笔预确认 | M13、M30、M31、M48 |
| op-node 不等待当前 L1 deposit，“容错 n-3”（同上） | **需修正**：OP Stack 本来就允许 L1 origin 滞后，上限是 max_sequencer_drift=600s，不需要改协议 | M49 |
| 中期切换到 Reth（同上；《解析 Base 的扩展计划》） | **进行中**：mantle-reth 已发布，有构建在主网运行，preconf builder 已移植；sequencer 切换是 H2 未完成项 | M22、M23、M47 |
| Reth live sync 1k TPS、Base 的 Reth 存储 −83.5%、build p50 374→260ms | **过时 / 不能直接搬用**：这些是 MegaETH 和 Base 在 2024–2025 的测量；Mantle 的收益要自己回放测量。内部的《Reth 与 Geth 性能对比勘误》本地只有 stub，勘误内容无法核对 | M54 |
| Mantle 交易冲突比例 49.1%（24h）/ 53.4%（约 1000 块）（《不同链中交易依赖程度分析》《性能和 ux 提升计划》） | **需修正口径**：49.10% 用的是“同源地址 / 同目标合约且同 selector / ERC20 同目标”等启发式条件，不是 storage-slot 级冲突率；1h 样本有 77/1800 个无效块。53.4% 的方法在本地读不到 | M43、M45 |
| 前十合约占 68.4% 交易（同上） | **仍可作为集中度信号**，但时间点是 2025-H1，需要重测 | 内部研究《性能和 ux 提升计划》(Notion) |
| “如果 Verkle 2025 年引入…”（同上；《Verkle Tree 对于磁盘 IO 的影响》） | **过时**：状态树方向已转向 binary trie（EIP-7864，Draft，理由里明确不选 Verkle）；Elysium 对齐的 Glamsterdam 内容里没有状态树替换 | M46 |
| JIT/AOT 约 2 倍（同上；《并行执行和并行 EVM 综述》） | **仍是假设**：revmc 仍是 experimental，reth main 的 evm2-jit 默认关闭，Mantle 没有使用 JIT | M50 |
| “state root 更新是关键制约”“执行时间约为 merkleization 的 1/6–1/10”（《并行执行和并行 EVM 综述》引 MegaETH） | **口径存疑，需在 Mantle 上重测**：原始数据是 MegaETH 在 Ethereum 历史回放上的结果，不是 Mantle 负载 | 内部研究《并行执行和并行 EVM 综述》(Notion)；M54 同理 |
| RISE：共识阶段占 40–80%，执行最坏只占约 8%（《Rise Chain 中对区块构建的设计》） | **需修正**：这里的 C 阶段指 L2 获取 L1 输入和区块属性，不是 L1 投票开销；数字来自 RISE 自述 | GPT 文 §2.3 的提醒成立；内部研究《Rise Chain 中对区块构建的设计》(Notion) |
| A2S：服务隔离让交易“天然支持并行执行”；tips 上下限形成费用隔离（《一种基于 A2S 的区块构建方案》） | **需修正**：服务隔离不等于状态隔离；tips 上下限也不隔离共享的 base fee。Mantle 已有的 preconf FIFO 车道是 A2S “banking FCFS”的雏形，但没有容量上限 | asseq 台账 M16、M45；M31 |
| Arsia 压测（《基于 AAVE 清算的 Mantle Arsia 压测》及参数模型） | **只有方案，没有结果**：默认档 900 笔清算、35 个清算 bot、100 个套利 bot，压力档 1500 / 65 / 300；监控要求覆盖预确认、op-batcher、ZK 证明，压测从 proxyd 进入。本地副本没有结果数据 | M51、M52、M53 |
| CLOB 设计目标：撮合 ≤100ms，结算 ≤1s，≥20k TPS，FIFO + Cancel 优先（《CLOBs on Mantle》） | **方向与 2026 路线图的 Prop AMM 撤单优先一致**；正文在附件里，本地只有目标行 | M40 |
| Base 扩展计划、MegaETH、Monad、Solana roadmap 等外部项目的结论 | 归其他调研路复核；本路只核对与 Mantle 相关的推论 | — |

### 不确定之处
- 53.4%、《Reth/Geth 勘误》、《流式出块 - geth》的正文本地都读不到，复核不完整。
- Arsia 压测有没有实际执行、结果如何，没有材料。

---

## M-Q4 Mantle 的改动约束（给路线图分级用）

### 答案
OP Stack 系 L2 的一项改动是否“只改 sequencer”，判据有一条：**它会不会改变“从 L1 数据派生 L2 区块并执行”的结果**。Mantle 的 ZK 证明程序由 kona 编译而来，在 zkVM 里重做派生和执行。所以凡是改派生或 STF 的改动，都要同时改 Go 侧（op-node / op-geth）、Rust 侧（reth / op-revm）和 kona，并轮换 SP1 vkey。只改 sequencer 内部调度、而不改变规范结果的改动，不需要碰证明。

| 级别 | 例子 | 要改哪里 | 依据 |
|---|---|---|---|
| A 只改 sequencer / builder（不改协议语义） | eager next-block construction；preconf 车道和 Flashblocks 式流式预确认；车道 / 排序规则；mempool 准入；prewarm / 缓存；sequencer 内并行执行（结果与串行等价时）；保持 MPT 根不变的存储布局；RPC 与状态流；把 sequencer 从 op-geth 换到 reth（前提是两者逐块等价） | sequencer 的 op-node 和 EL | PR #370 只改 op-node/sequencing 等 9 个文件 [16]；派生不检查顺序、验证者原样重放（asseq 台账 M10、M11）；OP Succinct 不改 op-geth、op-batcher、op-node [19] |
| B 只改 L1 参数（不改代码，但属于共识输入） | gas limit、EIP-1559 denominator / elasticity、min base fee、DA footprint scalar、operator fee scalar | L1 SystemConfig 的 owner 调用，经 ConfigUpdate 事件派生到 L2 | [6]；上限受 8,388,608 字节区块 RLP 限制 [15]，也受证明能力制约（inferred，M57） |
| C 协议级（硬分叉） | 新交易类型（EIP-8130 native AA）、新预编译、gas 表或费用规则、区块时间、激活 Amsterdam / BAL、batch / blob 格式、派生规则（例如协议强制的排序规则） | op-node（Go）、op-geth（Go）、reth / op-revm（Rust）、kona（Rust），重编 SP1 程序并轮换 vkey；必要时改 L1 合约 | M56、M57、M58；asseq 台账 M34 |
| D 结算接口级 | 更换状态承诺结构（QMDB / NOMT / binary trie） | 在 C 之上，还要改 output root 构造和 L1 上的提款证明（OptimismPortal 等） | output root = keccak(version ‖ state_root(MPT) ‖ withdrawal_storage_root ‖ block_hash)，提款要对 MPT 存储根做证明 [18]；M60 |

### 依据
- OP Succinct 原文：“upgrades a single on-chain contract and the op-proposer component. No changes are needed to op-geth, op-batcher, or op-node” [19]。
- Mantle SP1 Workflow 原文：“the zkVM executable binary (compiled from Kona)”，“invokes Kona … to perform block derivation” [10]。
- 等价性风险已经出过事。L2BEAT 2026-01-27 记录 “a hotfix addressing an issue where Mantle logic in revm was inconsistent with geth, which prevented the generation of the corresponding ZKP”，并记录 2026-09-10 和 09-17 vkey 随 mantle-v1.6.0 / v1.6.1 更新 [17]。
- revm fork 的锁步要求：op-succinct、reth、mantle-v2/rust 三处都钉同一个 revm tag（research-hub 报告 revm 台账 M11）。
- Arsia 的参数通过 SystemConfig 下发：“propagated to L2 via ConfigUpdate events and picked up by the L2 derivation pipeline” [6]。

### 不确定之处
- 换 sequencer 执行客户端虽然不改协议，但 op-geth↔op-revm 不一致会直接导致证明失败（M58）。所以 A 级里的“换客户端”实际带着 C 级的验证负担（inferred）。
- 提高 gas limit 对证明成本和证明时延的影响，没有公开数字。
- 加 BAL 或 Amsterdam 属于 C 级。Elysium 已经继承了相关代码框架，但没有激活 [2]。

---

## GPT 调研中被修正 / 过时的地方

1. **§6.1 “v1.6.3 Elysium 发布记录已经包含 eager next-block construction，不能写成从零引入”**：release 内容属实（PR #370，2026-08-26 合并）。但 Elysium 的官方公告和 changelog 只针对 Sepolia/Hoodi（Sepolia 2026-10-06），主网部署指南仍是 v1.5.4。所以它不能直接算作“主网基线”，应写成“已发布、主网状态待确认”。
2. **§6.1 “公开发布记录仍以 op-geth 为上游基础”**：说法不完整。mantle-xyz/reth 有独立的 release 线（op-reth v2.2.1-mantle-arsia.*、mantle-v1.6.x），自称有构建在主网运行，并已移植 preconf builder；路线图 H2 计划 sequencer 切到 pure Reth。op-geth 仍是文档化的 sequencer 执行层，这一点正确。
3. **引用错位**：
   - 49.10% 依赖比例引的是《流式出块技术方案设计 - geth》，实际出自《不同链中交易依赖程度分析》；
   - Arsia 清算压测（§4.8、§6.3）引的是《MegaEth 高性能技术解析》，实际出自《基于 AAVE 清算的 Mantle Arsia 压测》；
   - §5.1 “最新产品笔记把 mStocks、native AA、交易排序、JIT Router、Prop AMM 放在同一路线”引的是《Monad 高性能设计解析》，该页本地只有 stub。可核实的一手来源是 Mantle 官方路线图（其中没有 JIT Router）。
4. **§6.3 “旧压测已经覆盖入口、预确认、batcher 和证明”**：内部文档只把这些列为“监控指标”和设计，本地没有任何结果数据，不能写成“已覆盖”。
5. **漏掉的现状**：
   - preconf FIFO 车道和 `eth_sendRawTransactionWithPreconf` 已在 op-geth / reth 中实现（research-hub 报告 asseq 已记录）；
   - Flashblocks 尚未上线；
   - 提款期 12 小时是安全缓冲，不是证明时延；
   - 证明程序就是 kona，所以 C 级改动要轮换 vkey（§4.8 只泛泛地说“必须进入统一验证范围”）。
6. **§5 对 mStocks 的描述缺少一手事实**：mStocks 是 Bybit 主导、与 Mantle 合作的产品，目标 2026-11 上线，截至 2026-10-27 未上线。发行方是谁只有二手报道。

## 来源

1. **PRIMARY** mantle-xyz/mantle-v2 Releases（https://github.com/mantle-xyz/mantle-v2/releases ）。证明 Everest / Skadi / Limb / Arsia / Elysium 各版本内容，Limb 和 Arsia 的主网激活时间，Arsia 带 span batch、Brotli，v1.6.3 带 eager next-block construction。访问 2026-10-27。
2. **PRIMARY** Mantle Docs：Mantle v2 v1.6.3 - Elysium Upgrade（…/changelogs/mantle-v2-v1.6.3-elysium-upgrade.md）。证明 Elysium 面向 Sepolia（2026-10-06）、保留 Arsia/Osaka 规则、包含 eager construction 和 preconf 一致性修复。访问 2026-10-27。
3. **PRIMARY** Mantle Docs：Elysium Upgrade 公告（…/updated-notices/elysium-upgrade-preparing-mantle-sepolia-hoodi-testnet-…md）。证明这次升级只针对测试网，不启用 Amsterdam EVM 和 EIP-7928。访问 2026-10-27。
4. **PRIMARY** Mantle Docs：Roadmap（https://docs.mantle.xyz/network/system-information/roadmap.md ）。证明 2026 H1 已完成项，以及 H2 未勾选项：pure Reth、Flashblocks、预确认策略上链、Prop AMM、native AA（8130/8141）、2D nonce、Shielded Pool 与 mStocks POC。访问 2026-10-27。
5. **PRIMARY** Mantle Docs：What's New in Mantle v2 Arsia。证明三段式费用、去掉 tokenRatio、动态 EIP-1559、DA footprint、对齐 Canyon→Jovian、rebase 到 op-node v1.16.3。访问 2026-10-27。
6. **PRIMARY** Mantle Docs：Arsia Upgrade 公告。证明 Arsia 前 base fee 固定 0.02 gwei、EIP-1559 参数放在 extraData、SystemConfig 参数经 ConfigUpdate 派生、blob 编码切到标准 OP 格式。访问 2026-10-27。
7. **PRIMARY** Mantle Docs：Migration of Data Availability to Ethereum Blobs。证明 DA 从 EigenDA 迁到 blobs 的动机和结果（成为标准 ZK Rollup）；公告本身不含日期。访问 2026-10-27。
8. **PRIMARY** Mantle Docs：Mantle OP Succinct Mainnet Upgrade & Withdrawal Period Transition。证明 2025-09-16 起 ZK 证明、2025-09-23 起 12 小时提款，以及 12 小时是安全缓冲。访问 2026-10-27。
9. **PRIMARY** Mantle Docs：zk Validity Proof。证明单一 Succinct Proposer、回退到 op-proposer 乐观模式。访问 2026-10-27。
10. **PRIMARY** Mantle Docs：SP1 Workflow。证明 range / aggregation 流程，以及 zkVM 程序由 Kona 编译、在其中做派生。访问 2026-10-27。
11. **PRIMARY** Mantle Docs：Node Introduction。证明文档化的 sequencer / verifier 是 op-node + op-geth。访问 2026-10-27。
12. **PRIMARY（过时）** Mantle Docs：EIP-1559 Support。仍写 base fee 固定、Tectonic 用 FIFO，与 [5][6] 矛盾。访问 2026-10-27。
13. **PRIMARY** Mantle Docs：Mainnet v2 Everest Upgrade。证明 Everest 启用 EigenDA、Pectra 适配、废弃 MetaTX。访问 2026-10-27。
14. **PRIMARY** Mantle Docs：llms.txt 索引。证明部署指南写的是 “Mainnet (v1.5.4)”、“Testnet (v1.6.3)”。访问 2026-10-27。
15. **PRIMARY** mantle-xyz/reth Releases（https://github.com/mantle-xyz/reth/releases ）。证明 60M gas limit、8,388,608 字节区块上限、“the build running on mainnet”、preconf 移植、rc4 以 reth 当 sequencer 的验收。访问 2026-10-27。
16. **PRIMARY** mantle-xyz/mantle-v2 PR #370 “Feat/preconf dead window”。证明 2026-08-26 合并，“eager next-block build, enabled by default”，只改 op-node sequencing / driver / flags。访问 2026-10-27。
17. L2BEAT Mantle 页（https://l2beat.com/scaling/projects/mantle ，第三方监测，跟踪链上合约）。证明 Stage 0、blobs、SP1 Hypercube、12h 延迟，Arsia 相关日期（04-16 / 04-24），2026-01-21 blobs 与 EigenDA 并行，2026-01-27 的 revm 与 geth 不一致 hotfix，vkey 轮换记录，batch 平均每 8 分 4 秒提交一次。访问 2026-10-27。
18. **PRIMARY** OP Stack Specs：L2 Output Root Proposals（https://specs.optimism.io/protocol/proposals.html ）。证明 output root 的构造方式，以及提款要对 MPT 存储根做证明。访问 2026-10-27。
19. **PRIMARY** OP Succinct Architecture（https://succinctlabs.github.io/op-succinct/architecture.html ）。证明 OP Succinct 只改一个合约和 proposer，不改 op-geth / op-batcher / op-node。访问 2026-10-27。
20. **PRIMARY** EIP-7864（https://eips.ethereum.org/EIPS/eip-7864 ）。证明 binary state tree 处于 Draft，理由里明确不选 Verkle。访问 2026-10-27。
21. **PRIMARY** Bybit 新闻稿 “Bybit Expands Beyond Crypto as CEO Outlines Next Phase of Financial Platform”（2026-10-12，bybit.com/press；抓取超时，内容取自搜索摘录）。证明 mStocks 的合作方、目标上线时间、1:1 支持、24/7 转换、Mantle AMM 交易、可作 UTA 抵押。访问 2026-10-27。
22. 二手报道：cryptobriefing.com/bybit-mstocks-tokenized-equity-trading-launch、en.cryptonomist.ch/2026/10/13/bybit-tokenized-equity-trading（2026-10-13）。只作线索：发行方 Halo Prime Limited、有限追索债务结构。访问 2026-10-27。
23. research-hub 报告 revm-vs-evm2 `research/notes-mantle.md` 台账 M11–M17 及 M-Q2 / P2-8。用于 reth / op-revm / op-succinct 锁步、reth 在主网的角色、JIT 现状。
24. research-hub 报告 application-specific-sequencing `research/ledger.md` 的 M 行（M4、M5、M10–M22、M34、M42、M45）。用于出块参数、排序代码、preconf 车道、派生不检查顺序。
25. research-hub 报告 native-aa-eip-8130-8141 `meta.yml` 摘要。用于“先做 8130 PoC”的结论。
26. 内部研究（Notion，Mantle 内部资料，本地副本 `.rh/scratch/hp-roadmap/notion/`，2026-10-26 导出）：《性能和 ux 提升计划》《不同链中交易依赖程度分析》《并行执行和并行 EVM 综述》《Rise Chain 中对区块构建的设计》《一种基于 A2S 的区块构建方案》《解析 Base 的扩展计划》《由 QMDB 引发的对于区块链状态管理方案综述》《Verkle Tree 对于磁盘 IO 的影响》《客户端实现性能收集》《基于 AAVE 清算的 Mantle Arsia 压测》及参数确认模型、《模拟rsETH 清算压力测试方案》《CLOBs on Mantle》。
27. 线索：`research/gpt-deep-research.md` 第五、六章。修正见上一节。

## 开放问题

1. 主网 sequencer 当前的 op-node 版本：是否已经在跑 v1.6.3 的 eager next-block construction？执行客户端是 op-geth 还是 reth？preconf 车道是否启用、白名单是谁？
2. 主网的 gas target / elasticity、min base fee、DA footprint scalar 的当前值（需要主会话用 RPC 或 SystemConfig 读取；mantle-facts.md 未生成）。
3. OP Succinct 的实际证明区间和证明时延（从区块产生到 L1 上有证明的状态根）。这决定“持续能力”能留多少余量。
4. mStocks 的发行方、托管方和转换条款的一手文本；合约是否部署在 Mantle L2；上线日期。
5. Arsia 压测有没有实际执行，结果如何（TPS、base fee 回落、四段延迟分解）。
6. 53.4% 冲突率的方法；《Reth/Geth 勘误》正文。
7. 路线图把 native AA 写成“评估 8130 / 8141”，摘要句却写“implement EIP-8130”。最终采用哪个方案、何时进入 C 级硬分叉，还不清楚。

---

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| M1 | Mantle 主网升级的 release 序列依次是 Everest（v1.1）、Skadi（v1.3）、Limb（v1.4）、Arsia（v1.5）、Elysium（v1.6） | [1] 各 release 标题（访问于 2026-10-27） | observed | |
| M2 | Everest 在主网启用 EigenDA 替代 MantleDA，同时做 Pectra 适配并废弃 MetaTX | [1] “1.1.1 Mainnet Everest”；[13] | observed | |
| M3 | Skadi 让主网支持 Prague，并给 op-node 新增 optimism_safeHeadAtL1Block，用于更快生成 ZK 证明 | [1] “1.3.1 Mainnet Skadi” | observed | |
| M4 | Limb 主网在 2026-01-14 07:00 UTC 激活，目的是兼容 Osaka/Fusaka | [1] “1.4.2 Mainnet Limb” | observed | |
| M5 | 按 release，Arsia 主网在 L2 时间戳 1776841200（2026-04-22 07:00 UTC）激活 | [1] “v1.5.4 Mainnet Arsia” | observed | |
| M6 | L2BEAT 把 Arsia 记为 2026-04-16（SystemConfig 升级，EigenDA 路径移除），另记 2026-04-24 “Arsia fee mechanics activated”，与 release 日期不一致 | [17] Milestones、Ossification & Updates | observed | |
| M7 | Arsia 在一个时间戳同时激活 Canyon 到 Jovian 共 8 个 OP Stack 分叉，并 rebase 到 op-node v1.16.3 | [1] “v1.5.3 Sepolia Arsia”；[5] OP Stack Fork Alignment | observed | |
| M8 | Arsia 的 batcher 改用标准 OP blob 格式，并支持 span batch 与 Brotli 压缩 | [1] v1.5.3 “op-batcher”；[6] Blob encoding migration | observed | |
| M9 | Arsia 引入“L2 执行 + L1 数据 + operator fee”三段式费用，移除 tokenRatio 乘数，恢复带最低 base fee 的动态 EIP-1559，并把 DA footprint 计入 base fee | [5] Key Changes；[6] | observed | |
| M10 | Arsia 的 EIP-1559 参数、min base fee、DA footprint scalar 由 L1 SystemConfig 设置，经 ConfigUpdate 事件由派生管线带到 L2 | [6] Contract Upgrades / SystemConfig | observed | |
| M11 | Arsia 之前 Mantle 的 L2 base fee 固定为 0.02 gwei | [6] Dynamic EIP-1559 Base Fee；[12] | observed | |
| M12 | Mantle 的 DA 从 EigenDA 迁到 Ethereum blobs；L2BEAT 记录 2026-01-21 起两者并行，2026-04-16 起只用以太坊 DA | [7]；[17] 2026-01-21、2026-04-16 条目 | observed | |
| M13 | v1.6.3 Elysium 包含 eager next-block construction（PR #370，2026-08-26 合并，op-node sequencer 默认开启），用来缩短封块到接收下一块交易之间的空窗 | [1] 1.6.3 “Sequencer and preconfirmations”；[2]；[16] commit 31de5a2 | observed | |
| M14 | Elysium 的官方公告与 changelog 只针对 Sepolia/Hoodi（Sepolia 2026-10-06），文档的主网部署指南仍是 v1.5.4 | [2]；[3]；[14] “Mainnet (v1.5.4)”“Testnet (v1.6.3)” | observed | |
| M15 | 截至 2026-10-27，没有一手来源确认 eager next-block construction 已在主网 sequencer 运行 | 由 M13、M14 推出：功能只随 v1.6.3 发布，而官方只公告了测试网升级 | inferred | |
| M16 | Elysium 保留 Arsia/Osaka 执行规则，不在 Mantle L2 启用 Amsterdam EVM 与 EIP-7928 BAL | [2]；[3] Block header JSON fields | observed | |
| M17 | Mantle 主网出块时间为 2 秒 | research-hub 报告 application-specific-sequencing 台账 M4（mainnet rollup.json block_time=2） | observed | |
| M18 | mantle-xyz/reth 的 mantle-v1.6.2 release（2026-10-12）写明当前 gas limit 为 60M | [15] mantle-v1.6.2 “Consensus impact” | observed | |
| M19 | Limb 起 Mantle 完整区块的 RLP 上限为 8,388,608 字节，reth builder 的可选交易填到 7,388,608 字节为止 | [15] mantle-v1.6.2 #127、#146 | observed | |
| M20 | 按 2 秒出块、60M gas limit 计，Mantle 单块上限对应约 30 Mgas/s 的峰值执行容量；gas target 取决于 elasticity，本路未查到 | 由 M17、M18 推出：60M ÷ 2s；elasticity 见 [6]，当前值无来源 | inferred | |
| M21 | 官方文档仍把 op-geth 列为 sequencer 与 verifier 的执行客户端 | [11] Sequencer / Verifier 两节 | observed | |
| M22 | reth release 称 op-reth-v2.2.1-mantle-arsia.1 是“the build running on mainnet”，mantle-v1.6.2 对“sequencers running preconf”为必需升级 | [15] op-reth-v2.2.1-mantle-arsia.2、mantle-v1.6.2 | observed | |
| M23 | 路线图 2026 H2（未勾选）计划把主网 Sequencer 与 RPC 全面切到 pure Reth，Geth 降为灾备热备 | [4] 2026 H2 “Full-Stack Pure Reth Migration” | observed | |
| M24 | 推测主网 reth 目前承担 RPC 或部分节点角色，sequencer 仍以 op-geth 为主 | 由 M21、M22、M23 与 research-hub 报告 revm-vs-evm2 台账 M17 推测，无运维侧证据 | speculative | |
| M25 | Mantle 自 2025-09-16 起用 OP Succinct（SP1）ZK 证明验证新状态根，2025-09-23 起提款期从 7 天改为 12 小时 | [8] Transition Timeline Phase 1–3 | observed | |
| M26 | Mantle 文档说明 12 小时提款期是有意保留的安全缓冲，不是证明耗时；文档没有给出证明时延 | [8] “Why do we choose 12 hours?”；[9][10] 中没有时延数字 | observed | |
| M27 | Mantle 的证明流水线由 Succinct Proposer 先请求 range proof、再聚合，提交到 MantleSuccinctL2OutputOracle | [10] §2–§4 | observed | |
| M28 | zk 证明路径故障时，Mantle 可以回退到 op-proposer 乐观模式，恢复 7 天挑战期 | [9] Proposer availability and fallback；[17] caveat | observed | |
| M29 | L2BEAT 统计 Mantle 的 batch 数据平均每 8 分 4 秒向 L1 提交一次 | [17] liveness 段 | observed | |
| M30 | Flashblocks 亚秒级流式预确认在路线图 2026 H2 中未勾选，即尚未上线 | [4] “Flashblocks Sub-Second Streaming Pre-Confirmations” | observed | |
| M31 | op-geth 已有白名单（from×to）FIFO preconf 车道和 eth_sendRawTransactionWithPreconf（2025-06-05 合入），主网是否启用未知 | research-hub 报告 application-specific-sequencing 台账 M13、M17、M19、M20、M22 | observed | |
| M32 | 官方文档对排序的说法互相矛盾：Architecture 页说按 base fee 与 priority fee，EIP-1559 Support 页仍写 Tectonic 采用 FIFO、base fee 固定 | [12]；research-hub 报告 application-specific-sequencing 台账 M5 | observed | |
| M33 | op-geth 代码中普通交易按有效小费降序、同价按首次见到的时间排序 | research-hub 报告 application-specific-sequencing 台账 M14（`op-geth/miner/ordering.go:39-69@e33cd26cda`） | observed | |
| M34 | Bybit 2026-10-12 新闻稿称与 Mantle 合作开发 mStocks，目标 11 月上线；1:1 由实股支持，支持 Bybit 上 24/7 转换与 Mantle AMM 池交易，可转入 UTA 作抵押 | [21] “Four Years of TradFi Expansion…” 段（搜索摘录） | observed | |
| M35 | 截至 2026-10-27，mStocks 尚未上线 | 由 M34 推出：官方目标上线时间是 2026 年 11 月 | inferred | |
| M36 | mStocks 由 BVI 注册的 Halo Prime Limited 以有限追索债务形式发行，Bybit 只提供交易界面与合约运营 | 仅二手报道 [22]，未找到一手文本 | speculative | |
| M37 | Mantle 路线图 2026 H2 把 Shielded Pool 隐私交易方案与 mStocks 场景 POC 绑在一起 | [4] “Privacy-Compliant Transactions and Tokenized Securities” | observed | |
| M38 | 路线图 2026 H2 的 native AA 项写的是评估 EIP-8130 / 8141，提供代付、session、智能账户；2D nonce 面向高频支付与交易 | [4] “Account Abstraction and High-Concurrency Matching” | observed | |
| M39 | research-hub 的 native AA 报告建议 Mantle 先做 8130 PoC，以 8141 + 8250 作对照组 | [25] meta.yml summary | observed | |
| M40 | 路线图 2026 H2 的 Prop AMM 项要求支持高优先级撤单与专用撮合路径 | [4] “Prop AMM High-Performance Matching Infrastructure” | observed | |
| M41 | JIT Router 没有找到任何公开一手来源 | [4] 中没有；research-hub 报告 revm-vs-evm2 notes-mantle “资料中被修正的地方”第 6 条 | observed | |
| M42 | 发行方最需要纳入确定性与可对账的最终性语义，普通买家需要少签名和报价新鲜，做市商需要撤单优先与低尾延迟，Agent 需要 2D nonce 与限权代付 | 由 M34、M38、M40 推出：按各类用户的动作映射到所需组件属性 | inferred | |
| M43 | 内部 49.10% 依赖比例用的是同源地址 / 同目标合约且同 selector / ERC20 同目标等启发式口径，不是 storage-slot 冲突率；1h 样本有 77/1800 个无效块 | 内部研究《不同链中交易依赖程度分析》(Notion)“交易依赖标准”、20250323 与 2025.3.24 样本 | observed | |
| M44 | 内部 53.4% 冲突率（约 1000 块）出自另一份 Lark 文档，本地副本不含其方法，无法复核 | 内部研究《性能和 ux 提升计划》(Notion) 只给出链接 | observed | |
| M45 | 冲突率 49.1% 与 53.4% 不能直接作为并行 EVM 收益上限的依据，需要用真实读写集重测 | 由 M43、M44 推出：口径是启发式的，或方法不明 | inferred | |
| M46 | 内部“Verkle 2025 引入”的前提已经过时：状态树方向转向 binary trie（EIP-7864 Draft，理由中明确不选 Verkle），Elysium 对齐的 Glamsterdam 内容里没有状态树替换 | 由 [20] Rationale 与 [2][3] 的 Glamsterdam 兼容项清单推出 | inferred | |
| M47 | 内部“中期切换 Reth”的计划处于进行中：reth 已发布并有构建在主网运行，但 sequencer 切换仍未完成 | 由 M22、M23 推出 | inferred | |
| M48 | 2025 计划里的“小区块 / 流式出块”只被部分实现：eager construction 解决块间空窗，亚秒级子块仍未上线 | 由 M13、M30、M31 推出 | inferred | |
| M49 | 内部“op-node 不等待当前 L1 deposit”的设想不需要改协议，因为 OP Stack 允许 L1 origin 在 max_sequencer_drift（600 秒）内滞后 | 由 research-hub 报告 application-specific-sequencing 台账 M4（max_sequencer_drift=600）、M9 推出 | inferred | |
| M50 | 内部“JIT/AOT 约 2 倍”仍未落地：revmc 仍是 experimental，reth main 的 evm2-jit 默认关闭，Mantle 没有使用 JIT | research-hub 报告 revm-vs-evm2 notes-mantle M-Q2（revmc）与 P2-8 | observed | |
| M51 | 内部 Arsia 压测文档只有方案与参数（默认档 900 笔清算 + 35 个清算 bot + 100 个套利 bot，压力档 1500/65/300），本地副本没有结果数据 | 内部研究《基于 AAVE 清算的 Mantle Arsia 压测的参数确认模型》(Notion) §0；《基于 AAVE 清算的 Mantle Arsia 压测》(Notion) | observed | |
| M52 | 内部 rsETH 压测方案中，清算交易经 gas padding 后 p50≈864K、p99≈2.2M，Bot / Arb / User 均值约 885K / 78K / 21K，同一 borrower 的分批清算互相串行依赖 | 内部研究《模拟rsETH 清算压力测试方案》(Notion) §3.1 | observed | |
| M53 | 在 60M gas limit 下，一个区块约能容纳 69 笔 p50 清算交易，2 秒出块时约每秒 35 笔，热点 borrower 还会进一步串行化 | 由 M17、M18、M52 推出：60,000,000 ÷ 864,000 ≈ 69，再除以 2 秒 | inferred | |
| M54 | 内部引用的 Base / MegaETH 的 Reth 收益数字来自它们 2024–2025 的负载，不能当作 Mantle 迁移收益，需要在 Mantle 负载上回放实测 | 由内部研究《解析 Base 的扩展计划》(Notion)、《性能和 ux 提升计划》(Notion) 的数据来源推出 | inferred | |
| M55 | OP Succinct 只升级一个链上合约和 op-proposer，不需要改 op-geth、op-batcher、op-node | [19] Overview | observed | |
| M56 | Mantle 的 SP1 证明程序由 Kona 编译而来，派生与执行都在 zkVM 里重做 | [10] Mode A “zkVM executable binary (compiled from Kona)” | observed | |
| M57 | 改变派生规则或状态转换的改动（新交易类型、预编译、gas / 费用规则、区块时间、BAL）要同时改 op-node、op-geth、reth / op-revm、kona，并轮换 SP1 vkey；只改 sequencer 调度、不改变规范结果的改动不需要碰证明 | 由 M55、M56、research-hub 报告 revm-vs-evm2 台账 M11（三处锁步）、[17] vkey 轮换记录推出 | inferred | |
| M58 | L2BEAT 记录 2026-01-27 有一次 revm hotfix，原因是 revm 中的 Mantle 逻辑与 geth 不一致，导致无法生成对应的 ZKP | [17] 2026-01-27 条目 | observed | |
| M59 | 排序规则、preconf、Flashblocks、eager build、结果等价的并行执行都属于只改 sequencer 的改动，因为派生不检查顺序、验证者原样重放 batch | 由 research-hub 报告 application-specific-sequencing 台账 M10、M11 与 [16] 的改动文件列表推出 | inferred | |
| M60 | OP Stack 的 output root 由 MPT state_root、MessagePasser 存储根和区块哈希组成，提款对 MPT 存储根做证明，所以更换状态承诺结构会波及 L1 提款证明合约 | [18] Output root construction；由此推出波及 L1 合约 | inferred | |

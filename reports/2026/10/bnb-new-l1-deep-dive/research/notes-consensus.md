# 调研笔记：consensus 分路（定位 / 共识 / 区块与子区块 / 交易路由 / 治理）

- 分路前缀：C
- 调研日期：2026-10-24（所有网页来源的访问日期都是这一天）
- 主要一手来源：官方文档快照 `newl1-docs@ef5a632`（`bnb-chain/bnb-chain.github.io` 仓库 `docs/newl1/`，commit ef5a632，2026-10-22），引用格式 `newl1-docs@ef5a632/<路径>:L<行号>`。行号是用 read 工具（带 offset）逐行核对得到的。
- 方法限制：这一轮只有 read / web 工具，没有 shell，所以**没有**运行 `gh search code` 或 `gh api`。BEP 的 commit 是通过 GitHub REST API 网页抓取固定的。BEP 正文按章节号引用，不按行号（原始抓取没有带行号）。

---

## Q1 定位：BNB 是要开新 L1 并放弃 BSC 吗？

**答案**：不是。官方原话是 New L1“与 BSC 互补，而不是取代 BSC”，BSC 继续作为现有生态的“broad-base chain”，New L1 是给 BSC 承载不了的工作负载做的 clean-slate 设计 [1 overview.md:L23][3]。BNB 仍是唯一的原生资产（不发新币，从 BSC 桥过来付 gas，原生桥仍在开发中）。截至 2026-10-24，网络只是**内部多验证者 devnet**；路线图计划 2026 年底上 testnet、2027 年初上 mainnet [2]。

**依据**
- 关系：
  - 论坛置顶帖（BNB Chain 核心开发者 @zzzckck，2026-07-14）：“It complements BSC rather than replacing it: BSC continues serving its mature ecosystem, while NewL1 targets workloads that require deep architectural changes BSC can’t retrofit — connected through an official native bridge.”，并把 New L1 定位为“Vertical-Optimized General-Purpose L1”[3]。
  - 文档：“BSC remains the broad-base chain for the existing ecosystem. New L1 is a clean-slate design for the workloads that outgrow it.” [1 overview.md:L23]
- BNB 的角色：
  - “BNB is the native asset of New L1, and no new token is issued. It is bridged from BSC and pays for gas, through a native BSC ↔ New L1 bridge that is still in development.” [1 overview.md:L41]
  - 网络信息页的 Bridge 一栏写的是“in development”[1 get-started/network-info.md:L15]。
  - `CrossChain`（0x…2000）目前只是占位合约 [1 get-started/migrate-from-bsc.md:L10][1 governance/system-contracts.md:L15, L30]。
  - govBNB：在 `StakeHub` 质押后按 1:1 铸造，不可转让（`ERC20Votes`），委托之后才有投票权 [1 overview.md:L41][1 governance/overview.md:L15–17]。
- 成熟度：
  - “New L1 runs today as a multi-validator devnet with real block production and end-to-end finality. Public testnet and mainnet are still ahead” [1 overview.md:L67]。
  - FAQ 写的是“internal multi-validator devnet”[1 faq.md:L18]。
  - 首页提示：“currently in devnet. The network is highly unstable and subject to breaking changes.” [1 index.md:L21–22]
  - RPC 未开放，Chain ID 未定 [1 get-started/network-info.md:L11–12, L18]。
  - 执行层基于 reth / revm [1 overview.md:L45]。
- 路线图原话（[2]，2026-07-08，“Designed for the Decade: A New L1 Takes Shape”一节）逐条记录：
  - “High Performance: 100K+ TPS through co-optimized consensus, parallel execution, and LtHash-based storage”
  - “Ultra-Low Latency: Sub-50ms transaction preconfirmation and sub-1-second block finality”
  - “TxStream: No public mempool. Transactions stream directly to the block leader, cutting latency and blocking front-running by design”
  - “PriorityLane: Reserved block space for mission-critical traffic (oracles, liquidations, bridges), governed on-chain”
  - “Native Privacy: Protocol-level confidential transactions with selective disclosure for compliance”
  - “Account Abstraction Suite: Gas sponsorship, GasToken, transaction batching, scheduled execution, passkey signing, and access key control”
  - “BNB Powered … staying interoperable with the BNB Chain ecosystem”
  - “We plan to ship it on testnet by the end of 2026, with mainnet release following in early 2027.”
  - 量子：路线图有单独一节“Post-Quantum Readiness”，讲的是全栈研究与测试（“hybrid approach that layers quantum-resistant protection on top of today's cryptography”；“how account abstraction can let users adopt quantum-safe security without changing their existing addresses”），**没有**专门对 New L1 做 PQ 承诺。New L1 那一节本身也没有出现 quantum 一词。
- 路线图与文档对照：

| 路线图（2026-07） | 文档现状（2026-10，ef5a632） | 差异 |
|---|---|---|
| sub-50ms preconfirmation | ~20 ms（sub-block）[1 core-concepts/tx-preconfirmation.md:L7][1 overview.md:L60] | 文档的目标更激进；论坛 TEE Gateway 帖作者回复说 sub-block 时长“expected to be between 20ms and 50ms”[4] |
| sub-1-second block finality | 文档用的是“target”措辞：“Under the proposed Parlia design, cross-block BLS votes target transaction-order finality in under one second” [1 overview.md:L7]；常见情况 +2 块 ≈ 0.5 s [1 core-concepts/consensus.md:L32] | 文档承诺的是**排序**最终性；执行最终性要等更晚的区块记录 `ExecutionCommitment` 并完成最终化 [1 overview.md:L7] |
| 100K+ TPS | 文档快照里没有 TPS 数字（devnet 创世区块 gas limit 600M [1 get-started/network-info.md:L31]） | 文档没有给出可以核对的 TPS |
| TxStream（无 public mempool） | “no global mempool”，交易直接送到当前和下一个 proposer [1 overview.md:L35, L48]；Gateway 单跳路由 [1 developers/transaction-lifecycle.md:L20] | 文档里没有出现 “TxStream” 这个名字；“blocking front-running by design”这一点文档没有论证（当前客户端没有 Gateway 拍卖或排序 API [1 developers/transaction-lifecycle.md:L28]），防抢跑另有论坛提案 TEE Gateway [4] |
| PriorityLane | 文档叫 **Multi-Lane**：按地址做的 gas 容量预留，由 `LaneRegistry` 治理；“capacity guarantee, not an inclusion guarantee”，lane 内不保证 FIFO [1 core-concepts/multi-lane.md:L7, L11–15] | 改了名字；路线图举的 oracle / 清算 / 桥只是用途举例，文档里的 lane 是按地址分的，不按用途分 |
| Native Privacy / AA Suite | 由 privacy / AA 分路核对（文档 AA 是 `0x76`，隐私是 ShieldedPool） | 路线图提到的 “scheduled execution”“selective disclosure” 是否已落地，交给对应分路核对 |

**不确定之处**
- “multi-validator devnet” 与 “internal devnet” 的规模（验证者个数、地理分布）没有公开。
- New L1 客户端源码：网页搜索 bnb-chain 组织只看到 reth、reth-bsc 等仓库，没有找到 New L1 仓库。但本轮**没有**用 `gh search code` 复核。
- 媒体说法“BSC remaining the settlement hub”（Bankless，2026-07-08）在路线图原文里找不到，未采用。

---

## Q7 区块：200ms 区块 + ~20ms SubBlock、交易生命周期

**答案**：
- 200 ms 是共识区块间隔，每个 proposer 连续出 16 块。
- SubBlock 是**当前出块者**在轮次内不断流出的签名交易切片，通过 P2P gossip 传播。它只承诺“包含 + 位置”，不碰 vote pool、fork choice 和 finality，可以被撤销（`aborted` / `superseded`），leader 失效时承诺随之作废。
- 交易没有全局 mempool：Gateway（普通全节点）收下交易后，单跳把副本发给按验证者排程选出的即将出块者。
- 状态阶梯：preconfirmed → ordered → order-finalized / executed → execution-finalized。RPC 的 `latest` 指向**已执行**的 tip，`safe` / `finalized` 指向“承诺支撑”的执行高度。

**依据**
- 参数：区块间隔 200 ms，轮次长度 16 块 [1 core-concepts/consensus.md:L13, L15][1 get-started/network-info.md:L25–26]。
- SubBlock 由谁产、产什么：
  - “During its turn, the current block producer repeatedly packs ready transactions into signed sub-block slices.” [1 developers/transaction-lifecycle.md:L104]
  - “only the current block producer originates a stream at any given moment” [1 core-concepts/tx-preconfirmation.md:L7]
  - 帧结构：“the sub-block header (`blockNumber`, `parentHash`, `index`, `prevSubBlockHash`, `timestampMs`, `flags`, `txRoot`), its hash, the EIP-2718 encoded transactions, and the 65-byte producer signature” [1 developers/json_rpc/newl1-api-list.md:L159]。
  - 推论（researcher inference）：`prevSubBlockHash` 说明同一区块内的切片是哈希链式串起来的；“65 字节签名 + recover the signer”[1 core-concepts/tx-preconfirmation.md:L48] 说明这是 secp256k1 可恢复签名，不是 BLS。
- Gossip：
  - “P2P block and sub-block gossip” [1 overview.md:L35]
  - 出块者把自己发布的切片直接喂给本地订阅者，单节点 devnet 上也能用 [1 core-concepts/tx-preconfirmation.md:L60–61]
- 客户端验证：订阅 `newl1_subscribeSubBlocks` → 恢复签名者 → 用 `newl1_getValidatorSchedule` 确认签名者在验证者集合里（“checks set membership only, not exact turn/rank”）→ 重新推导 tx root，确认位置 [1 core-concepts/tx-preconfirmation.md:L47–50]。
- 承诺什么、不承诺什么：
  - “best-effort, validator-signed promise about ordering and inclusion. It says nothing about execution success and nothing about finality … never touches the vote pool, fork choice, or finality logic” [1 core-concepts/tx-preconfirmation.md:L11–15]
  - 窗口内只追加：后来的高费交易不能重排已经流出的交易 [1 core-concepts/tx-preconfirmation.md:L55]
- Leader 切换或失败：
  - “The promise dies with a leader failover … outstanding pre-confirmations may be superseded by the next leader's block.” [1 core-concepts/tx-preconfirmation.md:L56]
  - 出块者撤回流 → `aborted`；别的区块占了该高度 → `superseded` [1 developers/transaction-lifecycle.md:L108–109]
- 事件与缓存：
  - 事件字段包括 `{txHash, blockNumber, parentHash, subBlockIndex, subBlockHash, position, leader, timestampMs, status}`，订阅者落后时发 `lagged` 帧 [1 core-concepts/tx-preconfirmation.md:L35]
  - 缓存最多 8,192 条事件、跨度最多 80 块 [1 developers/transaction-lifecycle.md:L144]
- 论坛旁证：TEE Gateway 帖作者在 2026-10-23 回复：“The ‘sub-block’ concept is not implemented at the protocol level; rather, it serves as a reputational commitment.” [4]。这与文档“不进 fork choice、只是 advisory”的描述一致。
- 交易路由：
  - Gateway 就是普通全节点，接收标准 `eth_sendRawTransaction` [1 developers/transaction-lifecycle.md:L13]
  - “the Gateway keeps custody of it and sends replicas directly to the upcoming block producers selected from the validator schedule. A producer may pack its replica, but does not forward it again. This single-hop routing replaces global mempool broadcast.” [1 developers/transaction-lifecycle.md:L20]
  - 概览页的说法是“routed straight to the current and next proposer” [1 overview.md:L35]
  - 没有 `txpool_*`；`newPendingTransactions` 只显示本节点收到的交易 [1 developers/json_rpc/newl1-api-list.md:L56]
  - 当前客户端没有 Gateway 拍卖或排序 API；把同一笔交易交给多个 Gateway 只会产生多个独立托管方 [1 developers/transaction-lifecycle.md:L26, L28]
  - 本地池的默认规则：nonce 最多超前 256；RBF 需要 +10%；TTL 3 小时 [1 developers/transaction-lifecycle.md:L97–100]
- 状态阶梯 [1 core-concepts/tx-preconfirmation.md:L23–27]：
  - `preconfirmed`：约 20 ms，可撤销
  - `ordered`：约 1 个区块间隔
  - `order-finalized`：约 1 到几个区块间隔，2/3 验证者投票
  - `executed`：排序后不久
  - `execution-finalized`：执行结果写进承诺、且承诺所在的区块已最终化之后
- RPC block tag：
  - `latest` / `pending` → 已执行 tip；`safe` / `finalized` → 位于 justified / finalized 区块（含）之前、最近一个已发布的执行承诺的高度 [1 developers/transaction-lifecycle.md:L172–174][1 developers/json_rpc/newl1-api-list.md:L22–23]
  - 原始的 ordered / justified / finalized 高度要通过 `newl1_subscribeNewHeads` 读 [1 developers/transaction-lifecycle.md:L177]
  - 错误码：`-38004` 表示已排序未执行，可以重试；`-38001` 表示没有这个区块 [1 developers/json_rpc/newl1-api-list.md:L31–32]
- 执行延迟：
  - 区块 N 的执行结果写进 N+D 的区块头，1 ≤ D ≤ D_MAX，每块最多变化 ±1 [1 core-concepts/async-execution.md:L20, L28]
  - 论坛回复（初步说法）：“Delayed execution is expected to involve a maximum delay of 8 blocks.” [4]

**不确定之处**
- 文档没有给出每个 200 ms 区块里有几个 SubBlock，也没写 slice 的产出节奏（~20 ms 是指“交易被预确认的延迟”，不一定等于切片间隔）。
- `flags` 字段的语义没有写。
- 签名者校验只校验“是否在集合内”，不校验“是否是本轮 leader”。文档承认这个限制，但没有给出严格校验的办法。
- Gateway 发给“即将出块的几个 producer”具体是几个，文档有两种说法（“current and next” vs “upcoming block producers”），没有给出确切数字。

---

## Q8 共识：enhanced Parlia 相对 BSC Parlia 改了什么？

**答案**：
- 仍然是 Parlia PoSA + BLS 快速最终性（同一家族）。
- 改动有这几项：出块间隔 200 ms（BSC 现为 450 ms）；验证者上限 64（BSC 为 45 = 21 Cabinet + 24 Candidates）；**投票只签排序、不签执行结果**；验证者在自己的本地执行能证伪已发布的 `ExecutionCommitment` 时弃权；从创世起只有一套配置，没有硬分叉门控。
- 轮次长度 16、Casper-FFG 式的 justified / finalized 规则、BLS 聚合进区块头，都沿用 BSC（BEP-126）的构造。
- 文档明说 Parlia 只是“current default”，Minimmit 正作为 Consensus 2.0 的候选在评估。

**依据**
- 来源与范围：“derived from Parlia … takes it with tuned parameters and a handful of deliberate divergences, stripped of BSC's accumulated hardfork gating: the chain runs one configuration from genesis, with no activation heights and no feature flags.” [1 core-concepts/consensus.md:L7]
- 验证者数量：“up to 64 validators, PoSA” [1 core-concepts/consensus.md:L16]。BSC 文档写的是 “45 validators: 21 Cabinet and 24 Candidates” [5]。
- 出块：每 16 块按排序轮换；in-turn proposer 缺席时，out-of-turn 验证者在“randomized backoff”之后补上，延迟表用确定性种子生成；in-turn 区块权重更高 [1 core-concepts/consensus.md:L20]。
- 最终性：
  - 验证者签的是区块的排序，不是执行结果 [1 core-concepts/consensus.md:L24]
  - 下一个 proposer 收齐 ⌈2N/3⌉ 签名后，把它们聚合成一个 BLS attestation 放进区块头；按 Casper-FFG 规则，source 与 target 相邻的 attestation 使 source 最终化 [1 core-concepts/consensus.md:L28–30]
  - 常见情况：+1 块 justified、+2 块 finalized，约 0.5 s [1 core-concepts/consensus.md:L32]
  - BSC 的 BEP-126 是同一构造：直接子块头里有 attestation 即为 justified；自身 justified 且直接子块也 justified 即为 finalized；聚合阈值 ⅔*v+；attestation 放在区块头的 extra 字段 [6 §2, §4.1.2, §4.1.3]
- 执行承诺：“a validator abstains from voting on any block whose published `ExecutionCommitment` its own local execution disproves, so an incorrect execution result cannot gather the ⌈2N/3⌉ votes” [1 core-concepts/consensus.md:L34]。导入区块时**不会**直接拒绝这个区块（否则执行追赶期间，后续区块就无法解析父块）[1 core-concepts/async-execution.md:L80]。
- 选举：
  - 每天在指定区块选举一次，按质押排名；epoch 边界的区块头绑定当选集合 [1 core-concepts/consensus.md:L38]
  - 验证者集合本身不由治理投票决定 [1 governance/overview.md:L11, L44]
  - 出块间隔、turn length、epoch length 都是链参数，不应硬编码 [1 core-concepts/consensus.md:L45]
  - epoch length 的具体值文档没给（示例里是 `"0x…"`）[1 developers/json_rpc/newl1-api-list.md:L87]
- 惩罚：
  - double-sign 证据自动上链触发 slashing；每个验证者另有本地 journal，从源头拒签冲突的投票或区块 [1 core-concepts/consensus.md:L40]
  - `SlashIndicator` 记录宕机和漏块 [1 governance/system-contracts.md:L12]
- 未来：“Parlia is the current default rather than a permanent commitment … Minimmit … as a candidate for Consensus 2.0.” [1 core-concepts/consensus.md:L50]
- BSC 当前参数：
  - 区块间隔 0.45 s（BEP-619，Fermi）；每轮仍是 16 块，轮次时长 7.2 s；epoch 保持 1000 块；快速最终性约 1.125 s；快速最终性失效时退回自然最终性（约 79.2 s / 108 s）[7 §5.1, §6.1, §6.3]
  - BSC 文档 [5]：“0.45 seconds … approximately 1.125 seconds”
  - 路线图 [2]：H1 2026 BSC 的“Memory Finality”从 1,125 ms 降到 650 ms（与 BSC 文档口径不同，见“矛盾”）
  - BEP-524（Maxwell）把 turn length 从 8 改成 16、epoch 从 500 改成 1000（来自搜索摘要，未固定 commit）

| 项 | New L1（devnet 文档） | BSC（当前） |
|---|---|---|
| 共识家族 | Parlia PoSA + BLS FF（enhanced） | Parlia PoSA + BLS FF（BEP-126） |
| 出块间隔 | 200 ms | 450 ms（BEP-619） |
| turn length | 16 块（= 3.2 s，推论） | 16 块（= 7.2 s） |
| 验证者 | 最多 64 | 45（21 + 24） |
| 最终性 | +2 块 ≈ 0.5 s（排序最终性） | +2 块 ≈ 1.125 s（文档）；路线图称 memory finality 650 ms |
| 投票对象 | 只签排序；执行承诺不对时弃权 | 区块（同步执行，区块头含 stateRoot） |
| 硬分叉门控 | 无，创世即全部配置 | 历史硬分叉逐个激活 |
| 子区块 / 预确认 | 有（advisory） | 无 |

**不确定之处**
- “up to 64” 是上限，devnet 实际有几个验证者没有公开。
- `eth_getFinalizedHeader` 的参数范围 `[2, 21]` 看起来沿用了 BSC 的 21 [1 developers/json_rpc/newl1-api-list.md:L346]，与 64 的上限对不上。
- 2/3 BLS 投票在跨地域部署下能否做到 0.5 s，没有公开测量数据。
- 论坛 Consensus 分区里有关于“epoch 边界记录下一任验证者集合、延迟切换”的帖子（搜索摘要可见），本轮没有细读。

---

## 治理：govBNB、提案流程、系统合约

**答案**：
- 治理引擎与 BSC 相同（OpenZeppelin / Compound 的 `Governor` + `Timelock`），流程是 propose → vote → quorum → queue → timelock → execute，经 `GovHub.updateParam` 转发给目标合约，没有管理员密钥可以绕过。
- 质押与治理合约栈沿用 BSC 字节码，地址也相同；New L1 自己新增的是 `LaneRegistry`、AA 预编译和 ShieldedPool。
- 治理时间常数仍是 devnet 值。

**依据**
- 引擎：“the same Compound/OpenZeppelin `Governor` + `Timelock` engine as BNB Smart Chain. There is no admin key or externally-owned account that can bypass this process” [1 governance/overview.md:L7]
- 两道门：受治理的目标合约只接受来自 `GovHub` 的调用；`GovHub` 只接受来自 `Timelock` 的调用 [1 governance/overview.md:L28]
- 生命周期见 [1 governance/overview.md:L21–26]。Multi-Lane 配额这类参数在 timelock 之外还有一段额外激活延迟 [1 governance/overview.md:L31]（API 示例中 `configAnchorDepth` 为 8 块）。
- 沿用 BSC 的合约：`ValidatorSet`、`SlashIndicator`、`SystemReward`、`StakeHub`、`StakeCredit`、`GovToken`、`Governor`、`Timelock`，地址与 BSC 相同。`Governor` / `Timelock` 用 New L1 自己的时间常数重新编译，“still devnet-only values and not finalized for a public network” [1 governance/system-contracts.md:L29]。
- 新增的合约：
  - `LaneRegistry` 0x…3000
  - `AccountKeychain` 0x…4000、`SignatureVerifier` 0x…4001（都是预编译）
  - `ShieldedPool` 0x…5000
  - `ShieldedAuthVerifier` 0x…5003

  出处：[1 governance/system-contracts.md:L21–25, L31]。`CrossChain` 0x…2000 只是占位，用来满足 `ValidatorSet` 的内部检查 [1 governance/system-contracts.md:L15, L30]。

**不确定之处**
- `GovHub`（0x…1007）既不在“沿用 BSC”名单里，也不在“New L1 原创”名单里 [1 governance/system-contracts.md:L14, L29, L31]，它的来源文档没有说清楚。
- 投票期、提案门槛、quorum、timelock 延迟的具体数值都没有公开。

---

## 外部调研中被修正的地方（ChatGPT Deep Research，2026-10-24）

1. **“目标约 64 个验证者”**（§1.7、§10.1）：夸大或误读。文档写的是 “up to 64 validators”，是**上限**，不是目标 [1 core-concepts/consensus.md:L16]。另外 `eth_getFinalizedHeader` 的参数范围是 `[2, 21]`，与 64 不一致 [1 developers/json_rpc/newl1-api-list.md:L346]，外部调研没有提到。
2. **“Casper-FFG-like”“out-of-turn deterministic backoff”“至少 2/3 attestation”**：基本正确，但措辞不精确。文档原文是：
   - “using Casper-FFG rules”
   - “randomized backoff, with the delay schedule seeded deterministically”
   - 门槛为 ⌈2N/3⌉，由下一个 proposer 聚合进区块头

   出处 [1 core-concepts/consensus.md:L20, L28–30]。外部调研漏掉了最关键的差异：**投票只签排序**，执行承诺错误时验证者弃权 [1 core-concepts/consensus.md:L24, L34]。
3. **“Ordered block 约 200ms：共识确认了交易排序”**（§7.1）：夸大。`ordered` 只表示交易进了已导入的区块，仍可能被重组；“排序不可逆”要到 `order-finalized`（约 +2 块）[1 core-concepts/tx-preconfirmation.md:L24–25][1 core-concepts/consensus.md:L32]。
4. **“20ms preconfirmation 属于官方已确认或已有 devnet 行为”**（§2.2）：需要降级为“目标值”：
   - 概览页用的是 “target” 措辞 [1 overview.md:L7, L34]
   - 路线图承诺的是 sub-50ms [2]
   - 论坛回复说 sub-block 时长“预计 20–50ms”，20 ms tick 是“engineering target”[4]

   devnet 上确实能订阅预确认 [1 core-concepts/tx-preconfirmation.md:L60–61]，但没有公开的延迟测量。
5. **§7.3 “gateway 会把交易直接转发给当前或即将出块的 proposer”**：方向正确，但缺了几个要点：
   - Gateway 只是普通全节点，没有专用的交易格式或 API
   - Gateway 保持托管，producer 不会再转发（单跳）
   - 当前客户端**没有**拍卖或排序 API

   出处 [1 developers/transaction-lifecycle.md:L13, L20, L28]。外部调研也完全没提到论坛上的 TEE Gateway 提案（加密入口、TEE 内确定性排序、主备切换、无 TEE 证明的区块额外烧掉 30% 收入）[4]。注意这只是提案，没有进入文档或 devnet。
6. **漏掉了 Consensus 2.0 / Minimmit**：文档明说 Parlia 只是 “current default rather than a permanent commitment” [1 core-concepts/consensus.md:L50]，外部调研把 Parlia 当成了定案。
7. **漏掉了“不放弃 BSC”最直接的官方原话**：外部调研只引用概览页，没有引用论坛置顶帖里的 “complements BSC rather than replacing it” [3]。
8. **漏掉了路线图与文档的命名和数值差异**：TxStream 和 PriorityLane 是路线图的叫法，文档里叫 no global mempool / Gateway 和 Multi-Lane；sub-50ms 对 ~20ms；“blocking front-running by design”在文档中没有机制支撑 [2][1 core-concepts/multi-lane.md:L11–15]。
9. **BSC 参数**（§10.2：45 / 21 / 24、0.45 s、约 1.125 s）：与 BSC 文档一致 [5][7]。但外部调研没有注意到路线图给的 “memory finality 650 ms” 与之不同 [2]。
10. **漏掉了治理细节**：GovHub → Timelock 两道门、哪些合约沿用 BSC 字节码、治理时间常数仍为 devnet 值，外部调研都没提 [1 governance/overview.md:L28][1 governance/system-contracts.md:L29]。

（附带发现：官方文档自身有一处过时。migrate-from-bsc.md 说区块计数常量“off by ~3.75× versus BSC”[1 get-started/migrate-from-bsc.md:L46]，这个倍数对应的是 BSC 750 ms；Fermi 之后 BSC 是 450 ms，倍数应约为 2.25×。）

---

## 矛盾记录

- **最终性用了几个区块**：consensus.md 说常见情况 +2 块最终化，约 0.5 s [1 core-concepts/consensus.md:L32]；API 页的 Finality API 一节说“irreversible once two-thirds … in roughly one block interval” [1 developers/json_rpc/newl1-api-list.md:L334]；状态阶梯写的是“~1–few block intervals” [1 core-concepts/tx-preconfirmation.md:L25]。
- **“最终”一词的口径**：async-execution.md 说 “Ordering alone never finalizes a block; finality requires the execution result to be committed on-chain and voted on” [1 core-concepts/async-execution.md:L46]，而 consensus.md 和状态阶梯把“排序最终”单独列为一个阶段。researcher 的理解是：前者说的“finality”指执行最终性，但文档没有统一术语。
- **`eth_subscribe("newHeads")` 跟的是哪个 tip**：async-execution.md 把它和 `newl1_subscribeNewHeads` 一起列为读取 ordered 高度的方式 [1 core-concepts/async-execution.md:L90]；transaction-lifecycle.md 说它 “follows the executed-block feed instead” [1 developers/transaction-lifecycle.md:L177]。
- **devnet 成熟度的措辞**：overview 一处用 “proposed Parlia design … target” [1 overview.md:L7]，另一处说 devnet 有 “real block production and end-to-end finality” [1 overview.md:L67]。
- **BSC 最终性**：BSC 文档约 1.125 s [5]，BEP-619 也是约 1.125 s [7 §6.3]；路线图 “Memory Finality 650 ms” [2]。口径可能不同（memory finality 未必等于两块 FF），来源没有解释。
- **预确认延迟**：文档约 20 ms [1]，路线图 sub-50ms [2]，论坛 20–50 ms [4]。
- **验证者上限与 API 参数**：最多 64 [1 core-concepts/consensus.md:L16] 对 `[2, 21]` [1 developers/json_rpc/newl1-api-list.md:L346]。

---

## 来源

1. **PRIMARY** — `newl1-docs@ef5a632`：本地快照 `research/references/newl1-docs@ef5a632/`（`bnb-chain/bnb-chain.github.io` 仓库 `docs/newl1/`，commit ef5a632，2026-10-22），对应线上页面 https://docs.bnbchain.org/newl1/ 。证明了 New L1 的参数、共识、预确认、交易生命周期、RPC 语义、治理与系统合约的官方描述和成熟度措辞。
2. **PRIMARY** — BNB Chain 博客《BNB Chain H2 2026 Tech Roadmap: Doubling Down on Speed》（2026-07-08），https://www.bnbchain.org/en/blog/bnb-chain-h2-2026-tech-roadmap-doubling-down-on-speed ，访问日期 2026-10-24。证明了 New L1 的路线图目标（100K+ TPS、sub-50ms、sub-1s、TxStream、PriorityLane、隐私、AA）、testnet / mainnet 时间线，以及 BSC H1 的数据（450 ms，memory finality 650 ms）。
3. **PRIMARY** — BNB Chain 论坛《About the BNBChain NewL1 Category》（@zzzckck，2026-07-14），https://forum.bnbchain.org/t/about-the-bnbchain-newl1-category/5437 ，访问日期 2026-10-24。证明了官方定位：“complements BSC rather than replacing it”、不发新币、官方原生桥、Vertical-Optimized General-Purpose L1。
4. **PRIMARY（提案，不代表已实现）** — BNB Chain 论坛《Introducing NewL1 MEV Solution - TEE Gateway》（@galaio，2026-10-10；作者回复 2026-10-23），https://forum.bnbchain.org/t/introducing-newl1-mev-solution-tee-gateway/5589 ，访问日期 2026-10-24。证明了 TEE Gateway 的设计提案，以及作者的初步说明（sub-block 预计 20–50 ms、“not implemented at the protocol level … reputational commitment”、执行最多延迟 8 块）。
5. **PRIMARY** — BSC 官方文档 Introduction，https://docs.bnbchain.org/bnb-smart-chain/introduction/ ，访问日期 2026-10-24。证明了 BSC 当前为 45 个验证者（21 Cabinet + 24 Candidates）、0.45 s 出块、快速最终性约 1.125 s，以及 PoSA 的定义。
6. **PRIMARY** — BEP-126 Fast Finality，`bnb-chain/BEPs` 仓库 `BEPs/BEP126.md`，固定在 commit 531f51c780c1fd3c476782bbed55731af82ba6c8。证明了 BSC 快速最终性的 justified / finalized 规则、⅔ 阈值，以及 attestation 放在区块头 extra 字段。
7. **PRIMARY** — BEP-619 Short Block Interval Phase Three: 0.45 Seconds，`bnb-chain/BEPs` 仓库 `BEPs/BEP-619.md`，固定在 commit 54ee27fa7c068fc308fec4118aaa197b4d876d15（状态 Enabled）。证明了 BSC 当前 0.45 s 出块、16 块一轮（7.2 s）、epoch 1000、最终性约 1.125 s。
8. 外部调研 `research/BNB-new-L1-deep-dive.md`（ChatGPT Deep Research，2026-10-24）：只作线索。它的正误在上文逐条核对。
9. 被降级为线索的来源：
   - Bankless《BNB Chain Builds New L1 for Agentic Trading》（2026-07-08）
   - Crypto Briefing / Binance Square / CoinNess / The Agent Times 关于论坛的报道
   - BEP-524 与 Fermi 日期的搜索摘要（未固定 commit）

---

## 开放问题

- devnet 实际有几个验证者？64 的上限能否撑住 200 ms 出块 + 2/3 BLS 聚合（跨地域）？
- 每个区块里 SubBlock 的数量和节奏、`flags` 的语义；严格的“当前 leader”校验怎么做？
- Gateway 实际发给几个“upcoming producers”？leader 失效时交易怎么重新路由（Gateway 是否重发）？
- TEE Gateway 提案会不会进入 testnet？它与文档里的“普通全节点 Gateway”是什么关系？
- Minimmit（Consensus 2.0）有没有时间表？
- epoch length、D_MAX，以及治理时间常数（投票期、quorum、timelock）的实际值是多少？
- `GovHub` 是沿用 BSC 的还是新写的？
- 路线图里 “scheduled execution”“selective disclosure” 在文档中是否有对应实现？（交给 AA / 隐私分路）

---

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| C1 | 官方定位 New L1 与 BSC 互补而非取代：BSC 继续服务现有生态，New L1 承接 BSC 无法改造的工作负载 | [3] 论坛置顶帖 "complements BSC rather than replacing it"；[1] newl1-docs@ef5a632/overview.md:L23 | observed | |
| C2 | BNB 是 New L1 唯一原生资产，不发新币，从 BSC 桥入并支付 gas；原生 BSC↔New L1 桥仍在开发中，`CrossChain` 地址目前只是占位 | [1] newl1-docs@ef5a632/overview.md:L41；get-started/network-info.md:L15；get-started/migrate-from-bsc.md:L10；[3] | observed | |
| C3 | 在 `StakeHub` 质押 BNB 会 1:1 铸造不可转让的 govBNB（ERC20Votes），只有委托后才计入投票权 | [1] newl1-docs@ef5a632/overview.md:L41；governance/overview.md:L15–17 | observed | |
| C4 | 截至 2026-10-22 文档，New L1 只运行内部多验证者 devnet，没有公开 testnet / mainnet、RPC 或 Chain ID，首页提示“highly unstable” | [1] newl1-docs@ef5a632/overview.md:L67；faq.md:L18；index.md:L21–22；get-started/network-info.md:L11–12, L18 | observed | |
| C5 | New L1 执行层基于 reth 与 revm | [1] newl1-docs@ef5a632/overview.md:L45 | observed | |
| C6 | 路线图计划 2026 年底上线 testnet，2027 年初上线 mainnet | [2] H2 2026 路线图 “We plan to ship it on testnet by the end of 2026, with mainnet release following in early 2027” | observed | |
| C7 | 路线图对 New L1 的性能目标是 100K+ TPS、sub-50ms 预确认、sub-1-second 区块最终性 | [2] “High Performance” 与 “Ultra-Low Latency” 两条 | observed | |
| C8 | 路线图称 TxStream 不设 public mempool，交易直接流向 block leader，并称“blocking front-running by design” | [2] “TxStream” 一条 | observed | |
| C9 | 路线图的 PriorityLane 在文档中叫 Multi-Lane：按 `to` 地址预留 gas 容量，只保证容量、不保证纳入，lane 内不保证 FIFO | [2] “PriorityLane”；[1] newl1-docs@ef5a632/core-concepts/multi-lane.md:L7, L11–15 | observed | |
| C10 | 路线图的后量子内容是全栈研究与测试（hybrid 方案、借助 AA 免换地址升级），没有专门对 New L1 做 PQ 承诺 | [2] “Post-Quantum Readiness” 一节；New L1 一节没有出现 quantum | observed | |
| C11 | 预确认延迟三处说法不同：文档约 20 ms、路线图 sub-50ms、论坛提案作者称 sub-block 预计 20–50 ms 且 20 ms tick 只是 engineering target | [1] newl1-docs@ef5a632/core-concepts/tx-preconfirmation.md:L7；[2]；[4] | observed | |
| C12 | 概览页把 sub-second 排序最终性写成“proposed Parlia design”下的 target | [1] newl1-docs@ef5a632/overview.md:L7, L34 | observed | |
| C13 | 约 20 ms 预确认与 0.5 s 最终性应视为设计目标，不是公开网络上的实测值 | 由 C4、C11、C12 推出：只有内部 devnet，文档自己用 target 措辞，各来源数值不一 | inferred | |
| C14 | New L1 区块间隔 200 ms，每个 proposer 每轮连续出 16 块 | [1] newl1-docs@ef5a632/core-concepts/consensus.md:L13, L15；get-started/network-info.md:L25–26 | observed | |
| C15 | SubBlock 是当前出块者在轮次内不断打包就绪交易得到的签名切片，同一时刻只有当前出块者发起流 | [1] newl1-docs@ef5a632/developers/transaction-lifecycle.md:L104；core-concepts/tx-preconfirmation.md:L7 | observed | |
| C16 | SubBlock 帧包含区块头字段（blockNumber、parentHash、index、prevSubBlockHash、timestampMs、flags、txRoot）、哈希、EIP-2718 交易和 65 字节出块者签名 | [1] newl1-docs@ef5a632/developers/json_rpc/newl1-api-list.md:L159 | observed | |
| C17 | 同一区块内的 SubBlock 以 prevSubBlockHash 链式串联，出块者签名是 secp256k1 风格的可恢复签名，不是 BLS | 由 C16 加 [1] core-concepts/tx-preconfirmation.md:L48（“Recover the signer”）推出：65 字节加可恢复，是 ECDSA 的特征 | inferred | |
| C18 | SubBlock 通过 P2P gossip 传播，出块者也直接推给本地订阅者，单节点 devnet 上也能用 | [1] newl1-docs@ef5a632/overview.md:L35；core-concepts/tx-preconfirmation.md:L60–61 | observed | |
| C19 | 客户端自验 SubBlock 的步骤：恢复签名者，查它是否在验证者集合内（只查成员资格，不查本轮 leader），重算 tx root 确认位置 | [1] newl1-docs@ef5a632/core-concepts/tx-preconfirmation.md:L47–50 | observed | |
| C20 | 预确认只是关于排序与纳入的 best-effort 签名承诺：不涉及执行与最终性，不碰 vote pool / fork choice / finality；窗口内只追加，不能被后来的高费交易重排 | [1] newl1-docs@ef5a632/core-concepts/tx-preconfirmation.md:L11–15, L55 | observed | |
| C21 | Leader 失效时它尚未兑现的预确认可能被下一任 leader 的区块取代（superseded）；出块者撤回流则报 aborted | [1] newl1-docs@ef5a632/core-concepts/tx-preconfirmation.md:L56；developers/transaction-lifecycle.md:L108–109 | observed | |
| C22 | 预确认事件含 txHash、blockNumber、subBlockIndex、position、leader、status 等字段，订阅者落后时收到 lagged 帧；缓存最多 8,192 条 / 80 块 | [1] newl1-docs@ef5a632/core-concepts/tx-preconfirmation.md:L35；developers/transaction-lifecycle.md:L135, L144 | observed | |
| C23 | 论坛提案作者称 sub-block “not implemented at the protocol level”，只是一种 reputational commitment | [4] 作者 2026-10-23 回复第 3 点 | observed | |
| C24 | Gateway 是普通全节点，接收标准 eth_sendRawTransaction 后保持托管，把副本单跳发给按验证者排程选出的即将出块者，producer 不再转发 | [1] newl1-docs@ef5a632/developers/transaction-lifecycle.md:L13, L20；overview.md:L35 | observed | |
| C25 | 没有全局 mempool 与 txpool_* 命名空间；newPendingTransactions 只显示本节点收到的交易；当前客户端没有 Gateway 拍卖或排序 API | [1] newl1-docs@ef5a632/developers/json_rpc/newl1-api-list.md:L56；developers/transaction-lifecycle.md:L28 | observed | |
| C26 | TEE Gateway（TEE 内加密入口与确定性排序、主备切换、无 TEE 证明的区块额外烧掉 30% 收入）只是 2026-10-10 的论坛提案，没有写进文档，也没有说已在 devnet 上运行 | [4] 帖子正文（Core Proposal、Phase 0–3）与作者 “once the devnet or testnet is launched” | observed | |
| C27 | 状态阶梯：preconfirmed（约 20 ms）→ ordered（约 1 块）→ order-finalized（约 1 到几块）/ executed → execution-finalized（承诺所在区块最终化之后） | [1] newl1-docs@ef5a632/core-concepts/tx-preconfirmation.md:L23–27 | observed | |
| C28 | RPC 中 latest/pending 指向已执行 tip，safe/finalized 指向 justified/finalized 区块之前最近一个已发布执行承诺的高度；原始共识高度要读 newl1_subscribeNewHeads；-38004 表示已排序未执行 | [1] newl1-docs@ef5a632/developers/transaction-lifecycle.md:L172–177；developers/json_rpc/newl1-api-list.md:L22–23, L31 | observed | |
| C29 | 区块 N 的执行结果写进区块 N+D 的区块头，1≤D≤D_MAX、每块最多变化 ±1；论坛作者初步称最大延迟预计 8 块 | [1] newl1-docs@ef5a632/core-concepts/async-execution.md:L20, L28；[4] 作者回复第 4 点 | observed | |
| C30 | New L1 共识派生自 Parlia PoSA，从创世起只有一套配置，没有激活高度和 feature flag | [1] newl1-docs@ef5a632/core-concepts/consensus.md:L5, L7 | observed | |
| C31 | New L1 验证者集合上限 64；BSC 当前为 45 个（21 Cabinet + 24 Candidates） | [1] newl1-docs@ef5a632/core-concepts/consensus.md:L16；[5] BSC Introduction | observed | |
| C32 | 每 16 块按排序轮换 proposer；in-turn 缺席时 out-of-turn 验证者按确定性种子生成的随机退避补位；in-turn 区块权重更高 | [1] newl1-docs@ef5a632/core-concepts/consensus.md:L20 | observed | |
| C33 | 验证者的 BLS 投票签的是区块排序而不是执行结果；下一个 proposer 收齐 ⌈2N/3⌉ 签名后聚合进区块头；按 Casper-FFG 规则，相邻的 source/target 使 source 最终化 | [1] newl1-docs@ef5a632/core-concepts/consensus.md:L24, L28–30 | observed | |
| C34 | 常见情况下区块 +1 块 justified、+2 块 finalized，200 ms 间隔下约 0.5 s | [1] newl1-docs@ef5a632/core-concepts/consensus.md:L32 | observed | |
| C35 | BSC 的 BEP-126 是同一构造：直接子块头含 attestation 即 justified；自身与直接子块都 justified 即 finalized；阈值 ⅔*v+ | [6] BEP126.md@531f51c §2, §4.1.2, §4.1.3 | observed | |
| C36 | 验证者对已发布 ExecutionCommitment 被自己本地执行证伪的区块弃权投票，使错误执行结果凑不齐 ⌈2N/3⌉；导入时不直接拒绝 | [1] newl1-docs@ef5a632/core-concepts/consensus.md:L34；core-concepts/async-execution.md:L80 | observed | |
| C37 | 验证者每天在指定区块按质押排名选举一次，由 epoch 边界区块头绑定；例行轮换不经治理投票 | [1] newl1-docs@ef5a632/core-concepts/consensus.md:L38；governance/overview.md:L11, L44 | observed | |
| C38 | double-sign 证据自动上链触发 slashing，本地 journal 防止签出冲突的投票或区块；SlashIndicator 记录宕机和漏块 | [1] newl1-docs@ef5a632/core-concepts/consensus.md:L40；governance/system-contracts.md:L12 | observed | |
| C39 | 文档称 Parlia 只是“current default”，Minimmit 正作为 Consensus 2.0 候选评估，共识层留有接口以便替换 | [1] newl1-docs@ef5a632/core-concepts/consensus.md:L50 | observed | |
| C40 | BSC 当前出块 0.45 s（BEP-619，Enabled），每轮仍 16 块（7.2 s），epoch 1000 块，快速最终性约 1.125 s | [7] BEP-619.md@54ee27f §5.1, §6.1, §6.3；[5] | observed | |
| C41 | 路线图称 BSC 在 H1 2026 把出块从 750 ms 降到 450 ms，memory finality 从 1,125 ms 降到 650 ms | [2] “What Changed in Six Months” 表格 | observed | |
| C42 | 与 BSC 相比，New L1 出块快 2.25 倍（200 对 450 ms），同样 16 块一轮但轮次时长 3.2 s 对 7.2 s，排序最终性约 0.5 s 对约 1.125 s（BSC 文档口径） | 由 C14、C34、C40 推出：450/200=2.25；16×0.2=3.2 s；两块 FF 分别约 0.4–0.5 s 与 1.125 s | inferred | |
| C43 | 迁移文档中“区块计数常量与 BSC 相差约 3.75 倍”沿用了 BSC 750 ms 的旧基准，Fermi 之后应约为 2.25 倍 | 由 [1] newl1-docs@ef5a632/get-started/migrate-from-bsc.md:L46 与 C40 推出：5 块/s ÷ 1.33 块/s = 3.75，而 5 ÷ 2.22 ≈ 2.25 | inferred | |
| C44 | New L1 的 eth_getFinalizedHeader / eth_getFinalizedBlock 只接受 verifiedValidatorNum ∈ [2, 21]，不支持 BSC 的 -1/-2/-3 简写 | [1] newl1-docs@ef5a632/developers/json_rpc/newl1-api-list.md:L346, L349 | observed | |
| C45 | New L1 属于质押选举的 authority 集合（PoSA），不是无许可 PoS；只叫 PoA 会漏掉质押选举与 slashing | 由 C30、C31、C37、C38 推出：集合有上限，按质押选出，有惩罚 | inferred | |
| C46 | 治理沿用 BSC 的 OpenZeppelin/Compound Governor + Timelock 引擎，没有管理员密钥可以绕过；受治理目标只认 GovHub，GovHub 只认 Timelock | [1] newl1-docs@ef5a632/governance/overview.md:L7, L28 | observed | |
| C47 | 提案流程为 propose→vote→quorum→queue→timelock→execute（GovHub.updateParam）；Multi-Lane 配额另有激活延迟 | [1] newl1-docs@ef5a632/governance/overview.md:L21–26, L31 | observed | |
| C48 | ValidatorSet、SlashIndicator、SystemReward、StakeHub、StakeCredit、GovToken、Governor、Timelock 沿用 BSC 字节码与地址；Governor/Timelock 的时间常数仍是 devnet 值 | [1] newl1-docs@ef5a632/governance/system-contracts.md:L29 | observed | |
| C49 | LaneRegistry、AccountKeychain/SignatureVerifier（预编译）、ShieldedPool/ShieldedAuthVerifier 是 New L1 原创的系统合约，BSC 没有对应物 | [1] newl1-docs@ef5a632/governance/system-contracts.md:L21–25, L31 | observed | |
| C50 | bnb-chain GitHub 组织下目前没有公开的 New L1 客户端源码仓库 | 网页搜索 bnb-chain 组织只看到 reth、reth-bsc 等；本轮没有运行 gh search code 复核 | speculative | |

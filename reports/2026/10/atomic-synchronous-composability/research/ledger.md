# 论断台账

每条会出现在 explainer 里的论断，都要在这里有一行。
类型：observed（直接观察到，有一手证据）/ inferred（由证据推出）/ speculative（推测，需在页面上标明）。

四个分册并行完成后合并（2026-10-06）。前缀对应分册：
- **T** → [notes-tx.md](notes-tx.md)（首笔主网交易解码，主会话）
- **M** → [notes-mechanism.md](notes-mechanism.md)（机制、组件、生命周期、infra 改造）
- **A** → [notes-alternatives.md](notes-alternatives.md)（其他同步可组合路线对比）
- **E** → [notes-ecosystem.md](notes-ecosystem.md)（外部观点、Mantle 现状与 L2↔L3 映射）
- **G** → 主会话写稿时的综合判断（证据指向其他前缀的行与分册节号）

证据里的 `[n]` 指该分册“来源”一节的第 n 条。

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| T1 | 用户交易在区块 26127444（2026-10-05 16:44:59 UTC）、区块内序号 32，status 成功，gasUsed 111,263 | [1] receipt 与 block | observed | L、D |
| T2 | 用户交易是向 CrossChainProxy `0x3c18…` 转 0.001 ETH、input 为空的普通转账 | [1] `eth_getTransactionByHash`：value `0x38d7ea4c68000`、input `0x`；[3] 合约名 CrossChainProxy | observed | L |
| T3 | 同一区块的上一笔交易（序号 31）由 `0x4261…` 调用 EEZ manager 的 `postAndVerifyBatch`，并携带 1 个 blob | [1] block 交易列表；[2] method `postAndVerifyBatch`；[7] | observed | L |
| T4 | 主网 EEZ manager 是 EIP-1967 代理 `0x4b27…`，实现合约 `EEZ` 的已验证源码与 eez-core-protocol @ `6ae4110` 的核心文件逐字节相同 | [3] Blockscout implementations；本地 `diff` 四个文件无差异 [4] | observed | F3 |
| T5 | batch 只用一个 proof system：ECDSAProofSystem `0x1ac7…`，proof 是 65 字节签名 | [2] proofSystems 与 proofs 字段；[3] 合约名 | observed | F3、D |
| T6 | rollup 1 的 threshold 为 1，即一个 ECDSA 签名就足以通过验证 | [5] `cast call threshold()` = 1 | observed | F3、D |
| T7 | ECDSA signer 是 `0xa86e…`，部署时设置，截至区块 26132764 没有更换 | [8] SignerUpdated 日志只有部署时一条；[5] `signer()` | observed | F3 |
| T8 | 发起演示交易的 EOA `0xceaf…` 同时是 manager 部署者、rollup 1 owner、ECDSAProofSystem owner 与 ProxyAdmin owner | [3] creator；[5] `owner()` ×3 | observed | F3 |
| T9 | batch 含两条 entry：entry0 是纯 L2 条目（proxyEntryHash = 0，无调用），把 rollup 1 的 root 从 `0x9099…` 推到 `0x30d8…` | [2] 解码参数 | observed | L |
| T10 | entry1 的 etherDelta = +0.001 ETH，root 从 `0x30d8…` 推到 `0x5452…`，没有 L2→L1 调用和重入表 | [2] 解码参数 | observed | L |
| T11 | immediateEntryCount = 1：entry0 在第 31 笔交易里立即执行，entry1 入队等待消费 | [2]；[1] tx31 事件 L2ExecutionPerformed(0x30d8…) 与 EntryExecuted(0) | observed | L |
| T12 | 用户交易调用树：代理先 staticcall `STATIC_CHECK_GAS`，再自调用 `staticCheck` 判断非 static 上下文，然后带 0.001 ETH 调用 manager 的 `executeCrossChainCall` | [6] internal transactions；[4] `CrossChainProxy.sol` `_fallback` | observed | L |
| T13 | 用户交易发出 CrossChainCallExecuted、ExecutionConsumed(rollupId 1, index 0)、L2ExecutionPerformed(root `0x5452…`, 余额 0.001 ETH)、EntryExecuted 四个事件 | [1] receipt logs，按 [4] 的事件签名解码 | observed | F2 |
| T14 | 本地复算的 crossChainCallHash 等于 entry1 的 proxyEntryHash `0x2846…`，绑定了 source=`0xceaf…`、source rollup 0、target=`0xceaf…`、target rollup 1、value 1e15、空 calldata | [5] cast 复算；公式 [4] `EEZBase.sol` L282–L299 与 `EEZ.sol` L865–L867 | observed | B、F2 |
| T15 | 两条 entry 的 rollingHash 都等于起始种子，说明执行期间 L1 上没有发生任何跨链 CALL | [5] cast 复算 `0x07f0…`、`0x5a25…`；公式 [4] `EEZBase.sol` L388–L397 | observed | L、F2 |
| T16 | 代理 `0x3c18…` 代表 rollup 1 上的地址 `0xceaf…`，由该 EOA 在 14 个区块前创建 | [1] CrossChainProxyCreated 事件；[5] `computeCrossChainProxyAddress` | observed | L、F2 |
| T17 | 这笔交易的效果是：L1 用户向自己在 rollup 1 上的同一地址转 0.001 ETH，L1 上的存入和 L2 状态根推进在同一笔 L1 交易里原子完成 | 由 T2、T10、T13、T14、T16 推出 | inferred | 导语、F2 |
| T18 | 验证（tx31）与消费（tx32）是同一区块里相邻的两笔交易，不是同一个交易信封 | [1] 序号 31、32；[2] | observed | 导语、F2 |
| T19 | 如果 tx31 没有在同一区块内排在前面，用户交易会 revert，不会留下部分结果 | 由 T18 与 [4] `IEEZ.sol` L67–L76（队列只在 `lastVerifiedBlock == block.number` 时可读）、`EEZ.sol` `_requireVerifiedThisBlock` 推出 | inferred | F2 |
| T20 | 这笔交易没有演示 L2 返回值被 L1 使用、L2→L1 调用、嵌套、static 读、多 rollup 或 ZK 证明 | 由 T5、T10、T15 推出 | inferred | F2 |
| T21 | EEZ manager 于 2026-09-29 部署，rollup 1 于 2026-10-05 09:20 UTC 注册，此后 composer 大约每小时提交一个 batch | [9] manager 交易时间线 | observed | E |
| T22 | 本交易是该部署上第一次 ExecutionConsumed，也就是第一次通过代理消费 entry | [10] cast logs：第一条在区块 26127444 | observed | |
| T23 | 截至区块 26132601，manager 共 60 笔交易、9 次 entry 消费，其他地址也开始创建代理 | [9]；[10] | observed | |
| T24 | 截至 2026-10-06，只注册了 rollup 1，其 L1 记账 ETH 余额为 0.01105 ETH | [5] `rollups(1)`、`rollups(2)` | observed | |
| T25 | 第 31 笔 batch 的 blob 只用了 142 字节（共 131,072 字节），整笔 gasUsed 297,862 | [7] usageSize；[2] gas_used | observed | D |
| T26 | 这次演示的安全性取决于单一 signer 私钥和单一 owner，不是密码学有效性证明 | 由 T5–T8 推出 | inferred | F3 |
| T27 | 主网 batch 使用了 blob（blobIndices=[0]）和 blockNumber=最新，而 eez-rollup0 @6ff63ec 的 signer SPEC 要求 blobIndices 为空、blockNumber=0，说明主网运行的栈比公开的 signer 规范更新 | 由 [2] 解码参数与 notes-mechanism.md §3.7（signer profile，[20] §7）推出 | inferred | P |
| T28 | entry0 对应 rollup0 profile 中的 anchor 条目：每个 batch 先推进到一个空的候选区块，再接入站或出站条目 | 由 T9 与 notes-mechanism.md §4a 第 3、5 步推出 | inferred | |
| M1 | 原帖由 Jordi Baylina 于 2026-02-02 在 ethresear.ch topic 23998 发表 | [1] 23998.json 第 1 帖 created_at 2026-02-02T07:55:46Z，作者 jbaylina | observed | E、T |
| M2 | 原帖把同步可组合定义为：同一笔交易内 CALL 另一条链的合约，在同一执行上下文中拿到返回值，所有链一起成功或一起 revert | [1] 第 2 节原文 | observed | I、S |
| M3 | 原帖主张整套机制不需要分叉 L1，全部通过合约实现 | [1] “No L1 Fork Required” 一节 | observed | F1、K |
| M4 | 原帖设计是 execution table 加上单个 validity proof，proxy 查表、核对并应用 root、执行嵌套 L1 调用后返回 RESULT | [1] 第 5 节 Step 2–3 | observed | J |
| M5 | 作者回帖称：shared sequencer 规定唯一的线性顺序，同 slot 内不允许 L1→L2 与 L2→L1 交错；不在 sequencer 的 slot 内调用 proxy 会 revert | [2] 第 8 帖 jbaylina 回复 | observed | |
| M6 | 当前代码用“扁平调用数组 + 统一重入表 + rolling hash + success 标志”取代了原帖的 action/nextAction 和 REVERT_CONTINUE | [8] IEEZ.sol L112-L137；[1] 第 5 节 | observed | |
| M7 | 当前代码用可插拔的 multi-prover 取代原帖的单一 ZK proof，仓库自带的是 ECDSAProofSystem | [9]；[15]；[12] DeployL1 | observed | |
| M8 | rollup0 README 明确称当前 ECDSA attestation 不是 succinct validity proof | [18] README 原文 “not yet a succinct validity proof” | observed | F3 |
| M9 | postAndVerifyBatch 先完成全部 proof 验证，再修改状态；任一 proof 失败整批 revert | [5] EEZ.sol L399、L787；[15] Counting rule | observed | F1 |
| M10 | 每次 verify 把参与 rollup 的 lastVerifiedBlock 设为当前块，并重置该 rollup 的队列和游标 | [5] EEZ.sol L404-L406、L804-L811 | observed | |
| M11 | proxy 入口和 executeL2Txs 都要求 lastVerifiedBlock == block.number，否则 revert ExecutionNotInCurrentBlock | [5] EEZ.sol L1572-L1576 | observed | F1、J |
| M12 | 执行 entry 时依次检查 currentRoot、rolling hash、ETH 守恒，任一失败整条 entry revert | [5] EEZ.sol L1011-L1032 | observed | F1、J |
| M13 | entry 的 root 更新在其全部调用执行完之后才写入，执行中途读到的是前置状态 | [5] EEZ.sol L1021-L1022；[13] §H.1 | observed | |
| M14 | 队列匹配要求 proxyEntryHash、destinationRollupId 和所有 live root pin 同时相等，不匹配的 entry 被跳过 | [5] _entryMatches；[13] §G.3 | observed | F5 |
| M15 | 前导 proxyEntryHash==0 的 L2Tx 在 postAndVerifyBatch 内用 try/catch 执行，失败且数据非空时 emit L2TxSkipped | [5] EEZ.sol L417-L434 | observed | |
| M16 | 即时前缀之外的 entry 无条件按 destinationRollupId 入队 | [5] EEZ.sol L463；[15] 第 8 步 | observed | |
| M17 | immediateEntryCount 和 immediateStaticEntryCount 不进入 public input，由 poster 选择调度方式 | [15] Unproven dispatch params；[16] Immediate dispatch is not proven | observed | F5 |
| M18 | publicInputsHash 绑定完整的 entry 哈希、static entry 哈希、blob 哈希、callData 哈希、per-rollup customData、可选的 sender，以及 (rollupId, vkey) 累加器 | [5] EEZ.sol L753-L785；[15] | observed | |
| M19 | public input 不绑定 block.chainid、registry 地址或协议版本 | [16] Proof domains 一节 | observed | F10 |
| M20 | CrossChainProxy 的 CREATE2 salt 为 keccak256(originalRollupId, originalAddress)，部署者是 manager，salt 不含 chainid | [6] EEZBase.sol L237、L247-L260；[4] | observed | I |
| M21 | CrossChainProxy 没有 receive 函数，空 calldata 的 ETH 转账也进入 fallback 并转为 executeCrossChainCall | [7] CrossChainProxy.sol L67 fallback 与 L113-L128 _fallback，全文无 receive | observed | |
| M22 | 只有 manager 调用 executeOnBehalf 时，proxy 才会去调本链的目标合约 | [7] CrossChainProxy.sol L69 | observed | |
| M23 | 目标合约看到的 msg.sender 是远端调用者在本链对应的 proxy 地址 | [13] §I.6 | observed | I、F10 |
| M24 | L1 proxy 入口计算 call hash 时，sourceRollupId 取 0、callGas 取 0、value 取 msg.value | [5] EEZ.sol L865-L867；[14] hash 表 | observed | |
| M25 | rolling hash 的种子是 (rollupId, currentRoot) 序列加 proxyEntryHash，之后按 CALL_BEGIN/CALL_END/NESTED_BEGIN/NESTED_END/CALL_NOT_FOUND/CALL_INSUFFICIENT_GAS 六种标签折叠 | [6] EEZBase.sol L40-L45、L388-L451 | observed | J |
| M26 | rolling hash 让错误的调用、错误的返回值、缺少或多出调用、嵌套位置错误都在 entry 边界被拒绝 | [13] §I.9；[14] Rolling Hash | observed | J |
| M27 | 排除标签 5 和 6 依赖 prover 约束，合约无法强制 | [13] §H.4 Prover requirement | observed | |
| M28 | 仓库内的 ECDSAProofSystem.verify 只检查 ecrecover 出的地址是否等于 signer，不检查执行正确性 | [9] ECDSAProofSystem.sol L67-L70 | observed | F3 |
| M29 | core 版 ECDSAProofSystem 的 owner 可以更换 signer；rollup0 版的 signer 是 immutable | [9] L51 setSigner；[23] immutable signer | observed | |
| M30 | Rollup owner 可以增删 proof system、改 vkey、任意设置 threshold，并通过 setRoot 直接改写 L1 上的 rollup root | [10] Rollup.sol L227-L268 | observed | F3、F10 |
| M31 | setRoot 只在本块没有 verify 过、且不在执行中时可用 | [5] EEZ.sol L1538-L1546 | observed | |
| M32 | EEZ、Rollup、EEZL2 都部署在 transparent upgradeable proxy 后面，可以升级 | [12] EEZProxy.sol；Deploy.s.sol _deployEEZ、_deployRollup、_deployL2 | observed | |
| M33 | 部署脚本 DeployL1 默认部署单个 ECDSAProofSystem，threshold 为 1 | [12] Deploy.s.sol DeployL1；deployment/README.md | observed | |
| M34 | EEZL2 只允许 SYSTEM_ADDRESS 装表或投递入站调用，并要求消费发生在装表的同一块 | [11] EEZL2.sol L39、L219、L308、L785 | observed | |
| M35 | L2→L1 调用在 L2 上返回的是表中预先算好的 returnData，其真实性在 L1 执行 L2Tx entry 时由 CALL_END 核对 | [11] executeCrossChainCall L264；[14] L2→L1 (simple) 示例 | observed | |
| M36 | rollup0 的 L2 原生系统交易类型为 0x76：无签名，sender 固定 0xeee…0076，to 固定 EEZL2 0x4200…0007，gas price 为 0 | [19] native-system-transactions.md | observed | K |
| M37 | 入站系统交易在执行前 mint 出 value，外层失败时撤销这笔 mint | [19] | observed | K |
| M38 | rollup0 平时出 Live block，每个 L1 区块对应一个 Sync block；Sync block 先提交到 L2，L1 未确认时回滚 | [18] README “What it does” | observed | K |
| M39 | composer 把 postAndVerifyBatch 和用户 L1 交易作为 bundle 提交，目标是落在同一个 L1 区块 | [18] README “Routes cross-chain calls” | observed | J、K |
| M40 | rollup0 README 写明支持的 L1 是 Gnosis Chiado 测试网 | [18] README 第一段 | observed | |
| M41 | signer profile 只支持 anchor、outbound*、inbound* 序列，不支持 static、嵌套、blob、L1 区块绑定和多 PS | [20] §1 | observed | F8、O |
| M42 | 在 rollup0 profile 中，L1 记录的 root 是 L2 区块哈希和交易前缀候选块哈希组成的链 | [20] §8.1；[22] §3.1 | observed | I |
| M43 | signer 的签名不担保 canonical 祖先、finality、排序者授权、未来 L1 执行结果和调度方式 | [20] §1.1 | observed | F5 |
| M44 | rollup0 的 signer SPEC 钉住 core-protocol 旧 commit 6fcc90b6，ABI 与 @6ae4110f 不同 | [20] 开头与 Annex A；[8] | observed | |
| M45 | 证明超时时 composer 提交空的 Sync block，effect 延到下一个周期 | [22] §6.3 | observed | |
| M46 | follower 只靠 L1 的 BatchPosted 和 callData DA 就能重建 L2 | [18]；[20] §11 | observed | K、F4 |
| M47 | rbuilder-chiado 一个 bundle 超过约 3 笔时会静默丢弃多出的交易，所以 bundle 默认上限是 3 | [18] EEZ_MAX_USER_TXS_PER_BUNDLE 说明 | observed | K |
| M48 | 主网首笔交易的形态（同块先 postAndVerifyBatch、再由用户向 proxy 转 ETH 且 input 为空）与 L1→L2“入队 entry 由同块 proxy 调用消费”的路径一致 | 由 M11、M16、M21、[25] 推出：verify 交易在前、proxy 空 calldata 调用在后，符合 SCENARIO_CATALOG [17] 中 Origin entry 同块消费的模式 | inferred | |
| M49 | 主网交易使用的 verifier 是 ECDSA 型 proof system | 由 M28、[25] 推出：proof 为 65 字节，与 r‖s‖v 签名格式一致；未核对合约字节码 | inferred | |
| M50 | AS 结果的最终性取决于 L1 区块的 finality，不会比 L1 更快 | 由 M11、[24] 推出：entry 只在 verify 所在的 L1 块内生效，root 写在 L1 状态里 | inferred | |
| M51 | 当前 ECDSA 部署下，signer 私钥泄露或 signer 作恶就能让任意 root 转换通过验证 | 由 M28、M33 推出：threshold 为 1 且 verify 只做 ecrecover | inferred | |
| M52 | composer 或 builder 可以审查或延迟用户的 AS 交易，但按合约设计只会导致未执行，不会写入错误状态 | 由 M11、M12、M39 推出：同块 gate 和 root、哈希检查拒绝错误的轨迹；包含权在链下 | inferred | F5 |
| M53 | 不需要 Ethereum 硬分叉，但 L2 必须改执行客户端并使用全新 genesis | [1] No L1 Fork；[19] “L1 consensus stays upstream” 与 fresh genesis 要求 | observed | F4、K |
| M54 | outbound entry 被跳过后，L2 节点如何重组到 L1 实际停留的前缀候选块，目前没有规范说明 | 由 M15、M42 推出：后续 entry 的 currentRoot 会失配；本 lane 未读到对应的节点规范 | speculative | P |
| M55 | L1→L2 调用在 L2 上 revert，或其 L1 frame 之后被回滚时，L2 上不投递，root 不动 | [13] §A.1 L2 prover constraints “Lookups are never delivered” | observed | |
| A1 | Espresso 网络不执行交易，定位为确认 / 最终性层，各链保留自己的 sequencer | [7] docs.espressosys.com/network：“Espresso does not execute transactions”“keeps its own… sequencer” | observed | |
| A2 | 只有 shared sequencer 时，能保证的是原子包含，不能保证同步执行和返回值 | 由 A1、A3 推出：确认层不执行交易；CIRC 需要额外的 coordinator 预填 inbox 并在 L1 用证明检查一致性，才能实现同步 | inferred | C、F6 |
| A3 | CIRC 通过 coordinator 预填各链 inbox，并在 L1 用聚合证明检查 inbox 并集等于 outbox 并集，实现 L2↔L2 同步 | [6] CIRC hackmd：“pre-populated by the Shared Sequencer (a.k.a Coordinator)”，以及 inbox/outbox 一致性条件 | observed | M |
| A4 | CIRC 和 Compose 的同步可组合目标是 L2↔L2，没有宣称 L1↔L2 | [6]“synchronous composability across L2s”；[36] Compose README 只描述 rollup 网络 | observed | M |
| A5 | Compose 用两阶段提交协调包含，再用单一 ZK 证明在 L1 同时结算各链 | [36] compose-network/specs README | observed | |
| A6 | Astria 共享排序网络已于 2025-12 停机，最后区块为 15,360,577 | [8] The Block 2025-12-02 引述团队 X 帖（二手来源，多家报道一致） | observed | M |
| A7 | Jordi 认为同步交易对发送者的原子性靠证明强制，而不是靠排序者自律 | [1] 23998 回帖：“enforced by the protocol's validity rules and checked as part of the proof” | observed | |
| A8 | 在 EEZ 设计中，shared sequencer 为每个 slot 定义 L1 与 L2 的单一线性顺序，不允许交错 | [1] 23998 Jordi 回帖：“Concurrent interleavings… within the same slot are not allowed” | observed | |
| A9 | Drake 的 based rollup 原帖定义了 L1 proposer 无许可包含 L2 块，但没有宣称同步可组合 | [5] ethresear.ch/t/15016 正文与缺点清单 | observed | |
| A10 | Vitalik 的帖子认为 based rollup 可以把整个 L2 块装进 L1 交易并加后置断言，从而实现与 L1 同步 | [4] 23863 正文：“directly containing an entire L2 block… post-assertions that revert everything” | observed | |
| A11 | based 与 L1 的同步还要求在一个 L1 slot 内证明 L2 状态转换 | [4] jvranek 回帖：“prove the L2's STF within one L1 slot”；[13] Spire“must use validity proofs… latency is crucial” | observed | |
| A12 | Taiko Alethia 当前由 3 家白名单 preconfer 排序，质押 / slash 阶段仍在规划 | [9] Taiko preconf 文档“Stage 1… (Current)”“Stage 2… (Planned)” | observed | |
| A13 | Taiko 主网先 propose 后单独 prove，证明窗口 4 小时，要求至少一个 ZK 证明 | [10] Taiko proving-system 文档 | observed | M |
| A14 | Taiko 主网目前不提供与 L1 的同步可组合 | 由 A11、A13 推出：同步需要同 slot 证明，而 Taiko 的证明是异步补交（窗口 4 h） | inferred | M |
| A15 | Gwyneth ULTRA TX 由 master builder 把 L1 AA 交易、多条 L2 的块、证明和跨链返回值打包进一笔 L1 交易，任一不一致即整体 revert | [11] ULTRA TX 帖（2025-11-11） | observed | C、M |
| A16 | 截至 2025-11，Gwyneth 的实时证明仍是工程目标，证明系统尚在开发（SGX/TDX “coming soon”） | [11]“still an active engineering goal”“Proving is still under development” | observed | |
| A17 | Taiko 在 2025 Q3 完成了 Gwyneth 跨链原子交易的设计和内部演示 | [12] Taikolights Q3 2025（搜索摘要） | observed | M |
| A18 | Spire 已暂停 Based Stack 开发，理由之一是同步需要的共享最终性在当前技术下不可行 | [13] docs.spire.dev 原文 | observed | |
| A19 | Puffer UniFi 在 2025-08 处于测试网 V2，路线图包含 multi-TEE 实时证明 | [14] Puffer 博客 2025-08-14（搜索摘要） | observed | |
| A20 | SCOPE 认为 L1↔L2 同步需要实时证明、shared sequencer、L1 proposer 协调，L2↔L2 则不需要实时证明 | [3] SCOPE“Core SCOPE requirements (L1↔L2)”与 L2↔L2 一节 | observed | F6 |
| A21 | EF 对实时证明的定义是 mainnet 块 P99 ≤10 s、CAPEX ≤10 万美元、功耗 ≤10 kW、≥128 bit、证明 ≤300 KiB | [15] EF 博客 2025-07-10 | observed | |
| A22 | EF 在 2025-12 称 zkVM 已在目标硬件上 10 s 内证完 99% 的以太坊块，成本下降 45 倍 | [16] EF 博客 2025-12-18 | observed | M |
| A23 | EF 在 2025-12 认为安全性是剩余难点，并定下 2026-05 达到 100-bit、2026 年底达到 128-bit 可证明安全的里程碑 | [16] Milestone 2/3 | observed | |
| A24 | SP1 Hypercube 在 16×RTX 5090 上让 99.7% 的块 <12 s、95.4% 的块 <10 s | [17] Succinct 博客（约 2025-11，954 块样本） | observed | |
| A25 | Pico Prism 2.1 在 16 GPU 上对 7,200 个主网块的 P99 为 9.14 s，平均 4.87 s | [18] Brevis 2026-07-28 | observed | |
| A26 | 公开的实时证明基准都是“出块后证明 L1 块”的口径，不能直接代表同步交易所需的出块前 L2 证明延迟 | 由 A21、A11 推出：基准测的是 L1 块证明时间；同步要求在 slot 截止前完成 L2 加跨链 witness 的证明，还要扣除模拟和传播时间 | inferred | M、P |
| A27 | EEZ 主网首笔交易的 proof 是 65 字节 ECDSA 签名，不是 ZK 证明 | [37] 主会话对区块 26127444 tx#31 的解码；[35] rollup0 README L29-32“not yet a succinct validity proof” | observed | |
| A28 | AggLayer 的跨链交易须先在 L1 最终确定，才能在目标链 claim | [19] Agglayer architecture：“finalized on the L1 before they can be claimed” | observed | M |
| A29 | pessimistic proof 只证明桥账本树（LET/LBT/Nullifier）的变化，用来把被攻破链的损失限制在其存款以内 | [20] Pessimistic Proof architecture | observed | |
| A30 | AggLayer 的 pessimistic proof 于 2025-02-03 在主网启用（v0.2） | [21] Polygon 论坛 v0.2 公告（搜索摘要） | observed | |
| A31 | AggLayer 的 fast interop（<5 s）在官方页面上是将来时的规划 | [22] agglayer.dev“When Agglayer spins up fast interop, it will provide…” | observed | |
| A32 | AggLayer 不原生支持跨链调用的同步返回值 | [3] SCOPE：“AggLayer and similar protocols do not natively support synchronous return values” | observed | C、F6 |
| A33 | OP interop 的一条跨链消息需要两笔交易（initiating log 与 executing message） | [23]“A total of two transactions are required” | observed | F6 |
| A34 | OP interop 允许同一时间戳内的消息，executing 甚至可以排在 initiating 之前，消息 7 天过期 | [24] Timestamp Invariant 与 EXPIRY_TIME | observed | |
| A35 | OP interop 中引用了无效消息的块会被 fork choice reorg 掉，sequencer 应在包含前校验 | [23] overview 原文 | observed | |
| A36 | OP interop 是同时间戳消息传递，调用方拿不到返回值，不属于真同步调用 | 由 A33、A34 推出：两笔独立交易组成一条消息，源链交易无法在同一执行上下文内读取目标链结果 | inferred | C、M |
| A37 | 截至 2026-10-06，承载 interop 的 Lagoon 硬分叉状态为“In development / Not scheduled” | [26] OP 文档 network-upgrades 与 lagoon 页 | observed | M |
| A38 | OP 曾计划 2026-07 在 OP Sepolia 与 Unichain Sepolia 激活 interop，但通知页仍写“not yet finalized” | [25] interop-prep 通知 | observed | |
| A39 | Offchain Labs 的 Arbitrum interop 路线是先 intents，再推进需 DAO 批准的跨链操作，文中没有提同步可组合 | [27] Offchain Labs 博客（2025-02） | observed | |
| A40 | Arbitrum Crosschain Broadcaster 基于存储证明，速度受路由上各链最终性限制 | [28] Offchain Labs Broadcaster 博客 | observed | |
| A41 | EIL 是 EF AA 团队基于 ERC-4337 的提案，由钱包发起并结算跨 L2 操作，不依赖 relayer/solver | [29] EF 博客 2025-11-18 | observed | |
| A42 | EF 在 2026-03 建议最贴近 L1 的 L2 追求同步可组合与 native rollup，同时推荐 OIF 与 Fast Confirmation Rule | [30] EF 博客 2026-03-23 | observed | |
| A43 | EEZ 自我定位为由 EF 资助的“L1<>L2 framework”，创始成员包括 Titan、Beaver Build 等 builder | [31] eez.io 介绍文章 | observed | |
| A44 | EEZ core README 把 EEZ 表述为“based rollups sharing the same L1 sequencer”之间的同步可组合 | [33] eez-core-protocol/README.md#L9@6ae4110 | observed | |
| A45 | EEZ 参考实现 eez-rollup0 使用自有 sequencer 加 composer，L1 测试网为 Gnosis Chiado | [35] eez-rollup0/README.md#L3-L9@6ff63ec | observed | M |
| A46 | eez-rollup0 把 postAndVerifyBatch 与用户 L1 交易作为 bundle 交给 L1 builder，要求同块全有或全无；rbuilder-chiado 会丢弃超过约 3 笔的部分 | [35] README#L16-L20、#L42-L44、#L155-L158@6ff63ec | observed | |
| A47 | EEZ 实际依赖的是 composer 加愿意原子打包的 L1 builder，而不是 L1 proposer 无许可地给 L2 排序 | 由 A44、A45、A46、A51 推出：README 措辞为 based，但参考实现和 Gnosis 首版都是集中式 sequencer/composer，靠 L1 builder 原子打包 | inferred | M |
| A48 | EEZ L1 合约要求实际执行与预计算（rolling hash、返回值）一致，否则整体 revert；任一证明失败则整批 revert | [34] eez-core-protocol/src/EEZ.sol#L33-L39@6ae4110 | observed | |
| A49 | EEZ 要求执行条目在其状态更新所在的同一 L1 块内被消费 | [34] EEZ.sol#L218-L219 `ExecutionNotInCurrentBlock` | observed | |
| A50 | EEZ、SCOPE、ULTRA TX 同属“链下联合模拟 + 预计算结果带证明上链 + L1 执行时比对，不一致即 revert”的同构设计 | 由 A15、A20、A48 推出：三者都由单一 builder 预计算跨域结果，在一笔 L1 交易或同一块内验证比对 | inferred | F6 |
| A51 | GIP-153 首版：Gnosis Ltd 运营集中式 composer，用 TEE 类过渡证明，组合为单向，genesis 目标 2026-12 至 2027-01 | [32] GIP-153 原文 | observed | |
| A52 | GIP-153 预计完整 EEZ 规范（双向组合、嵌套调用、实时 ZK）在 2027 年落地 | [32]“expected to land over the course of 2027” | observed | |
| A53 | Ethresear.ch 上已有人指出，EEZ 的执行表可以看作 CIRC 式 mailbox 的变体 | [1] Ellie Davidson 回帖：“The execution table could be viewed as a version of a mailbox” | observed | |
| A54 | 23998 回帖担心：没有证明基础设施的本地出块 proposer 所在的 slot 无法提供同步交易，builder 也可能审查用户 | [1] Tim Clancy 回帖 | observed | |
| A55 | intents 是“时间上异步、结果上原子”，适合结果可预先声明的转账 / 兑换 / L2→L1 提款 | [2] 23426“asynchronous in time but atomic in outcome”以及 Use Cases 一节 | observed | H、M |
| A56 | 闪电贷、跨 rollup 清算、多步套利依赖执行时的返回值，很难用 intents 表达 | [2] 23426“cannot be replicated with intents” | observed | |
| A57 | atomic 加 synchronous 不自动保证 non-interleaving，需要单独说明 | [2] thegaram33 回帖 #2/#4；[1] thegaram33 在 23998 中的追问 | observed | F11 |
| A58 | 截至 2026-10-06，在以太坊主网上实际跑通 L1↔L2 带返回值同步交易的路线只有 EEZ，而且用的是签名证明 | 由 A16、A17、A27、A37 推出：Gwyneth 处于设计 / 内部演示，SCOPE 与 Vitalik 方案是提案，OP interop 未定档，AggLayer 是异步；只有 EEZ 有主网交易（ECDSA）。未穷尽检索所有项目 | inferred | C、F6 |
| A59 | 对 Mantle L2↔L3 来说，Mantle L2 的 sequencer 可以直接扮演 EEZ 中“L1 builder”的角色，从而省掉跨实体的 builder 协调 | 由 A46、A47 与 E37 推出：EEZ 的原子性依赖共同提交点的出块者原子打包 bundle；共同提交点是 Mantle L2 时，出块者就是 Mantle 自己的单一排序器（E37） | inferred | |
| E1 | ethresear.ch 23998 由 Jordi Baylina 于 2026-02-02 发布，把同步可组合定义为一笔交易内跨链 CALL 并在同一执行上下文拿回结果 | [1] 原帖第 2 节与 JSON created_at | observed | |
| E2 | 23998 原帖称该机制不需要 L1 硬分叉 | [1] “No L1 Fork Required” 节 | observed | |
| E3 | 23998 原帖给出实时证明基准：证明一个以太坊区块约需 12 张 GPU、约 7 秒，并承认证明者中心化是合理担忧 | [1] 第 1 节 | observed | D |
| E4 | 23998 原帖规定：原生币不是 ETH 的 rollup 不得与外部 rollup 发生非零 Ether value 的 CALL | [1] “Native Tokens and Value Transfers” 节 | observed | F9 |
| E5 | Jordi 回复称同一 slot 由共享排序器给出单一线性顺序，不允许 L1→L2 与 L2→L1 交错（non-interleaving） | [1] 第 8 楼回复 | observed | F11 |
| E6 | Tim Clancy 担心同步可组合被私有路由到“builder duopoly”，并削弱 forced inclusion | [1] 第 21 楼 | observed | N |
| E7 | Elem Oghenekaro 指出 builder 即 execution table 构造者，同步可组合会带来跨域 MEV | [1] 第 22 楼 | observed | N |
| E8 | Martin Köppelmann 在 23998 帖贴出同步 rollup POC 视频与 synchronous_surge 仓库 | [1] 第 18 楼 | observed | |
| E9 | 23426（Alon Muroch，2025-11-11）列出的 SC 用例包括跨链闪电贷、多 rollup 原子套利与清算、跨链 swap、NFT 桥、单例 dApp | [2] Use Cases 节 | observed | N、F7 |
| E10 | 23426 承认 L2→L1 桥接上 intents 占优，直到实时 ZK 证明普及 | [2] Intents 用例节末尾 | observed | |
| E11 | non-interleaving 作为同步可组合的第三属性由 Péter Garamvölgyi 在 23426 提出 | [2] 第 2 楼 | observed | F11 |
| E12 | GIP-153 于 2026-08-19 通过：123,158 GNO 赞成、115 反对、151 弃权、54 个投票者、法定人数 75,000 | [4] DAO 月报 At a glance 与 Forum 节 | observed | E、N |
| E13 | GIP-153 第一版计划用临时证明（likely TEE-based），之后转向实时 ZK | [3] “How it works” 节 | observed | N、F7 |
| E14 | GIP-153 上线时由 Gnosis Ltd 中心化运营 composer，forced inclusion 仅为待评估选项 | [3] “How it works” 节 | observed | N、F7 |
| E15 | GIP-153 上线时组合是单向的（atomic L2→L1 calls），双向、嵌套与实时 ZK 预计在 2027 年落地 | [3] Synchronous Composability 与 Budget and timeline 节 | observed | N、F7、F8 |
| E16 | GIP-153 目标 genesis 为 2026-12 至 2027-01，出块 2 秒，gas 为 xDAI | [3] | observed | |
| E17 | GIP-153 自述快速出块与同步可组合目前只能在中心化下实现 | [3] Motivation 节 | observed | N |
| E18 | EEZ 于 2026-03-29 发布，由 Gnosis 与 ZisK 创立，EF 出资，治理主体是瑞士的 EEZ Association | [5] 原文；[7] | observed | E |
| E19 | EEZ 宣称的其他创始成员包括 Aave、Titan、Beaver Build、Centrifuge、xStocks | [5] “What comes next” 节 | observed | |
| E20 | 没有一手证据表明 Polygon Labs 作为组织参与 EEZ；关联仅限 Jordi 的个人履历和一个 fork 自 0xPolygonHermez 的仓库 | 由 [7]（Jordi 曾是 Polygon zkEVM 贡献者）、[8]（fork 仓库）、[5]（成员名单无 Polygon）推出：现有材料只显示个人与代码渊源 | inferred | |
| E21 | 截至 2026-08，Rollup 0 在 Chiado 和内部 12 秒 devnet 上运行，首个端到端里程碑是 ECDSA prover 签名的区块 | [6] Rollup 0 Development 节 | observed | |
| E22 | EEZ 在 2026-08 用 blob 规格取代了临时 calldata 格式，并把 L2 单笔交易 gas 上限定为 15M | [6] Technical Progress 节 | observed | |
| E23 | 首笔主网 AS 公告由 EEZ 贡献者 Eduardo Antuña 与 @etheconomiczone 在 X 上发布，内容为 0.001 ETH 跨链调用加 rollup 状态更新 | [9][10] 二手转述；X 原文抓取 403 [11] | observed | H |
| E24 | 首笔交易的验证（tx #31 postAndVerifyBatch）与用户调用（tx #32）位于同一区块 26127444，proof 为 65 字节 ECDSA 签名 | [36] 主会话链上解码 | observed | |
| E25 | @eduadiez 公告推文约在链上交易后 36 分钟（约 17:21 UTC）发出 | 由 [9] 推文 ID 2107159200086319334 的 snowflake 时间戳与 [36] 的区块时间 16:44:59 UTC 推出：ID 换算约为 2026-10-05 17:21 UTC | inferred | |
| E26 | Cointelegraph 称交易发生在“Tuesday”是错误的，2026-10-05 是星期一 | [9] 原文 “On Tuesday”；[10] “Happy Monday, October 5, 2026” | observed | |
| E27 | Vitalik 在 2024-10 认为同步可组合可提升 DeFi 资金效率：L2↔L1 无需跨 L2 协调，L2↔L2 需要共享排序 | [12] Surge 原文 | observed | E |
| E28 | Vitalik 在 2026-02 称 rollup-centric 愿景“no longer makes sense” | 仅有二手报道 [13]，一手原帖未取得 | speculative | P |
| E29 | eez-core-protocol 的闪电贷 e2e 演示：L1 闪电贷的还款依赖一笔 L1 用户交易内的 L1→L2→L1 桥往返 | [29] L39-L68 | observed | N、F7 |
| E30 | 闪电贷 e2e 使用占位 root，并在本地同块挖出，不是主网或真实 L2 状态的演示 | [29] L160-L166、L470-L471 | observed | N、F7 |
| E31 | DeployUniswapLab 只部署 MiniUniswap 等 mock 应用，不含 EEZ 基础设施和跨链调用 | [30] L12-L13 | observed | N、F7 |
| E32 | eez-core-protocol 未审计，periphery（Bridge、defiMock）是 test-only，不是生产实现 | [31] L5、L19 | observed | |
| E33 | Mantle 自 2025-09-16 起用 OP Succinct ZK 证明提交状态根，2025-09-23 起提款期为 12 小时 | [15] | observed | O |
| E34 | Mantle 的 DA 已从 EigenDA 迁到 Ethereum blobs | [16] 迁移公告；[17] Architecture 页描述 blob 提交；[25] 主网配置移除 EigenDA；[21] 路线图已勾选 | observed | O |
| E35 | Mantle 原生 gas 代币是 MNT，Arsia（2026-04-22 主网）起改为三段式费用并移除 tokenRatio | [22][18][37] | observed | O |
| E36 | Mantle 已启用 EIP-1153 transient storage（Skadi），满足 EEZ manager 对 TSTORE 的依赖 | [19] Skadi EIP 列表；[34] EEZBase L60-L64 | observed | O |
| E37 | Mantle 出块时间固定为 2 秒，交易池私有，由单一排序器排序 | [24] Tectonic 公告；[17] Transaction Pool 节 | observed | O、D、F9 |
| E38 | Mantle 官方文档和 2026 路线图中没有 L3、appchain SDK 或同步可组合条目 | [21] 路线图全文；docs llms.txt 索引中无相关页面（访问于 2026-10-06） | observed | O、P |
| E39 | Mantle “Differences” 文档页的 EigenDA 与 “Shanghai 及之前” 表述已过时 | 由 [22] 与 [16][19][20] 对比推出：后者显示已迁 blobs 并支持 Prague/Osaka 特性 | inferred | |
| E40 | EEZL2 子链 manager 固定在 0x4200…0007，与 OP Stack 和 Mantle 的 L2CrossDomainMessenger 同址 | [27] L3-L7；[23]；[26] | observed | F9 |
| E41 | Mantle L3 若沿用 OP Stack genesis，必须重定位 EEZL2 或移除 messenger，并同步修改节点、signer、deriver | 由 E40 与 [27]（genesis 生成脚本删除该地址分配、系统交易目标固定）推出 | inferred | |
| E42 | 父链换成 Mantle L2 后，etherDelta 记账的是 MNT | 由 [33] L77-L86（etherDelta 记录父链原生币净流量）与 E35（Mantle 原生币为 MNT）推出 | inferred | F9 |
| E43 | 如果 Mantle L3 不以 MNT 作 gas，跨层调用应禁止非零原生 value | 由 E4（Jordi 规则）与 E42 推出 | inferred | F9 |
| E44 | EEZ 的 L2（子链）不接受 blob 交易 | [27] L11-L14 | observed | F9 |
| E45 | Mantle L2 主网接受 type-3 blob 交易 | 未找到一手来源；OP Stack 系 L2 通常不支持，仅为推测 | speculative | F9、P |
| E46 | Mantle L3→L2 的 DA 大概率只能走 batch 的 callData 字段，而不是 EEZ 的 blob 路径 | 由 [33] L34-L47（batch 同时有 blobIndices 与 callData）、E44、E45 推出：父链没有 blob 交易时只剩 calldata | inferred | F9 |
| E47 | EEZ 要求验证与消费在同一父链区块（lastVerifiedBlock == block.number） | [33] L61-L67 | observed | |
| E48 | 在 Mantle L2 上实现 AS 需要排序器提供“batch + 用户交易”原子 bundle 包含能力 | 由 E47 与 E37（私有交易池、单一排序器、无外部 builder 市场）推出 | inferred | F9 |
| E49 | 父链换成 Mantle L2 后，同步证明窗口约 2 秒，远短于 23998 给出的约 7 秒整块证明基准，第一阶段大概率需要 ECDSA/TEE 过渡或降低同步频率 | 由 E37（2 秒出块）、E3（约 7 秒）、E13（Gnosis 第一阶段也用 TEE）推出 | inferred | F9、P |
| E50 | 入站 0x76 系统交易的 tx.gasprice 为 0，依赖 gasUsed*tx.gasprice 报销的合约会得到 0 | [27] L24-L30 | observed | |
| E51 | 入站系统交易按 value 铸币，外层失败时撤销铸币 | [27] L43-L51 | observed | |
| E52 | EEZ 公共输入不绑定 chainid、registry 地址和协议版本，独立部署必须隔离验证域 | [32] “Proof domains are a deployment responsibility” | observed | F10 |
| E53 | 证明通过不保证条目被送达，immediate 调度参数不在公共输入内 | [32] Delivery 节；[33] L30-L32 注释 | observed | |
| E54 | Gnosis 博客的“No new trust assumptions”与 GIP-153 承认的临时证明额外信任假设互相矛盾 | [7] 与 [3] 原文对照 | observed | |
| E55 | 在 AS 毕业流程中，如果 L2 DEX 池可以被第三方提前创建，four.meme 式预建池攻击依然存在，Router 必须校验价格或使用只能由自己初始化的池 | 由 [35]（four.meme 根因：迁移目标池价格或地址被抢先确定）与 AS 只保证原子性、不校验业务价格的事实（[33] 条目只绑定调用与返回）推出 | inferred | |
| E56 | L3 使用 L2 抵押时，只读（static）条目不足以防止双花，必须在同一条目内锁定 L2 抵押 | 由 [33]/[32]（static 条目不改变状态）推出：只读不锁仓，用户随后仍可转走资产 | inferred | O |
| E57 | Mantle 方案中 L3 的最终性不会高于 Mantle L2 的 safe/finalized 头 | 由 [28]（L2 跟随父链，父链失败时回滚）与 [15]（Mantle L2 状态经 ZK 证明在 L1 上结算）推出 | inferred | |
| E58 | Mantle 是否会把 EEZ 式 AS 作为 L2↔L3 能力推出 | 没有任何官方计划或公告，路线图未列 [21] | speculative | P |
| G1 | L3 调用 L2 的 Vault / DEX，对应 EEZ 中“子链调用父链”（L2→L1）的方向：L3 交易先拿到预计算的返回值，L2 在 batch 里真实执行该调用并用 CALL_END 核对 | 由 M35、M15 与 notes-mechanism.md §4b 推出：把 L1 换成 Mantle L2、L2 换成 L3 后，流程不变 | inferred | 导语、O、F8 |
| G2 | “子链调父链”正是 GIP-153 首版只支持的单向组合，也是 Mantle L3 使用 L2 流动性最需要的方向 | 由 E15（首版 atomic L2→L1 calls）与 G1 推出 | inferred | O、F8 |
| G3 | Vault 场景：资金和 shares 留在 L2 的 adapter，L3 只记录仓位；L3 的记录不能成为能独立赎回的第二份债权 | notes-ecosystem.md §3.2 场景 1；外部调研 §11.1 的建议；由 M12、M25（同一条目内回滚）推出 | inferred | O |
| G4 | Launchpad 毕业宜把 canonical token 与募资 escrow 放在 L2，由 L3 一次调用 L2 的毕业 Router，在 Router 内完成释放、建池、加 LP、锁 LP | 由 M41（signer profile 不支持嵌套与一个 effect 多调用）与 E55 推出：多步 L2 动作收进一个 Router，只需要一次 L3→L2 调用；外部调研 §12.2–12.4 | inferred | O |
| G5 | 第一个 Mantle 原型宜收窄为：单条 L3 + L2 上的一个受限 Router + 一次 L3→L2 调用 + 明确标注的可信过渡证明 | 由 G1、G2、G4、E49、M41 推出 | inferred | F8、O |
| G6 | 被攻破的 L3 能按协议规则动用代理在 L2 上持有的资产与 allowance，所以要按 L3、应用、资产分别设限额 | 由 M23（L2 合约看到的 msg.sender 是代理）与 notes-ecosystem.md §4 推出 | inferred | F10 |
| G7 | 高频操作宜留在 L3 本地，只有毕业、建仓、赎回这类关键经济动作走同步路径 | 由 E49（约 2 秒窗口）与 T25、M39（每次同步都要父链 batch 与 bundle）推出；外部调研 §12.5 | inferred | O |

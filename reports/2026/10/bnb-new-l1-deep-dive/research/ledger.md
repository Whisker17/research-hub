# 论断台账

每条会出现在 explainer 里的论断，都要在这里有一行。
类型：observed（直接观察到，有一手证据）/ inferred（由证据推出）/ speculative（推测，需在页面上标明）。

四路调研合并（2026-10-24）。前缀对应分册：**C** = `notes-consensus.md`（定位、共识、区块与子区块、交易路由、治理）；**X** = `notes-execution.md`（异步 / 并行执行、BSC 并行执行史、OES vs ASS、Multi-Lane）；**A** = `notes-account.md`（Native AA 与 EIP-8130 / Tempo / 7702 / 4337）；**P** = `notes-privacy.md`（隐私池、LtHash 状态承诺、密码学栈）。证据里的 `[n]` 指该分册“来源”一节的第 n 条；`newl1-docs@ef5a632/<路径>:L<行>` 指本地固定快照 `references/newl1-docs@ef5a632/`。

主会话抽查（2026-10-24）：consensus.md L16（“up to 64”）、L32、L50；async-execution.md L20–28、L101；account-abstraction.md L13、L36、L78–88、L122；privacy.md L56、L63、L67–68；state-db.md L14–16、L47（均读原文核对）。外部：Tempo spec-tempo-transaction（`0x76`、字段表、`keccak256(0x04 || … || user_address)`）与 AccountKeychain（`0xAAAAAAAA00…`）页（A34–A36）；ePrint 2026/2083 摘要（LtHash16 约 2^81 次查询，P33）；SIMD-0215 Security Considerations L219–233（P34）；EIP-8130 文件头 “Keystore Accounts”、commit 1a1f470 “move the transaction type to a new EIP”、PR #12385 open（A44–A45）；论坛 /t/5437 “complements BSC rather than replacing it”（C1）与 /t/5589 “reputational commitment”“maximum delay of 8 blocks”（C23、C29）；H2 2026 路线图 New L1 一节原文（C6–C10、P44–P46）。均与来源一致。C50、X29 由主会话用 gh 补证后从 speculative 升为 observed。

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| C1 | 官方定位 New L1 与 BSC 互补而非取代：BSC 继续服务现有生态，New L1 承接 BSC 无法改造的工作负载 | [3] 论坛置顶帖 "complements BSC rather than replacing it"；[1] newl1-docs@ef5a632/overview.md:L23 | observed | H、F1 |
| C2 | BNB 是 New L1 唯一原生资产，不发新币，从 BSC 桥入并支付 gas；原生 BSC↔New L1 桥仍在开发中，`CrossChain` 地址目前只是占位 | [1] newl1-docs@ef5a632/overview.md:L41；get-started/network-info.md:L15；get-started/migrate-from-bsc.md:L10；[3] | observed | F1、F16 |
| C3 | 在 `StakeHub` 质押 BNB 会 1:1 铸造不可转让的 govBNB（ERC20Votes），只有委托后才计入投票权 | [1] newl1-docs@ef5a632/overview.md:L41；governance/overview.md:L15–17 | observed | F1 |
| C4 | 截至 2026-10-22 文档，New L1 只运行内部多验证者 devnet，没有公开 testnet / mainnet、RPC 或 Chain ID，首页提示“highly unstable” | [1] newl1-docs@ef5a632/overview.md:L67；faq.md:L18；index.md:L21–22；get-started/network-info.md:L11–12, L18 | observed | H、F1、S |
| C5 | New L1 执行层基于 reth 与 revm | [1] newl1-docs@ef5a632/overview.md:L45 | observed | |
| C6 | 路线图计划 2026 年底上线 testnet，2027 年初上线 mainnet | [2] H2 2026 路线图 “We plan to ship it on testnet by the end of 2026, with mainnet release following in early 2027” | observed | H、F1 |
| C7 | 路线图对 New L1 的性能目标是 100K+ TPS、sub-50ms 预确认、sub-1-second 区块最终性 | [2] “High Performance” 与 “Ultra-Low Latency” 两条 | observed | H、F3 |
| C8 | 路线图称 TxStream 不设 public mempool，交易直接流向 block leader，并称“blocking front-running by design” | [2] “TxStream” 一条 | observed | F6 |
| C9 | 路线图的 PriorityLane 在文档中叫 Multi-Lane：按 `to` 地址预留 gas 容量，只保证容量、不保证纳入，lane 内不保证 FIFO | [2] “PriorityLane”；[1] newl1-docs@ef5a632/core-concepts/multi-lane.md:L7, L11–15 | observed | |
| C10 | 路线图的后量子内容是全栈研究与测试（hybrid 方案、借助 AA 免换地址升级），没有专门对 New L1 做 PQ 承诺 | [2] “Post-Quantum Readiness” 一节；New L1 一节没有出现 quantum | observed | |
| C11 | 预确认延迟三处说法不同：文档约 20 ms、路线图 sub-50ms、论坛提案作者称 sub-block 预计 20–50 ms 且 20 ms tick 只是 engineering target | [1] newl1-docs@ef5a632/core-concepts/tx-preconfirmation.md:L7；[2]；[4] | observed | F5、T |
| C12 | 概览页把 sub-second 排序最终性写成“proposed Parlia design”下的 target | [1] newl1-docs@ef5a632/overview.md:L7, L34 | observed | |
| C13 | 约 20 ms 预确认与 0.5 s 最终性应视为设计目标，不是公开网络上的实测值 | 由 C4、C11、C12 推出：只有内部 devnet，文档自己用 target 措辞，各来源数值不一 | inferred | F5、S |
| C14 | New L1 区块间隔 200 ms，每个 proposer 每轮连续出 16 块 | [1] newl1-docs@ef5a632/core-concepts/consensus.md:L13, L15；get-started/network-info.md:L25–26 | observed | K |
| C15 | SubBlock 是当前出块者在轮次内不断打包就绪交易得到的签名切片，同一时刻只有当前出块者发起流 | [1] newl1-docs@ef5a632/developers/transaction-lifecycle.md:L104；core-concepts/tx-preconfirmation.md:L7 | observed | F5 |
| C16 | SubBlock 帧包含区块头字段（blockNumber、parentHash、index、prevSubBlockHash、timestampMs、flags、txRoot）、哈希、EIP-2718 交易和 65 字节出块者签名 | [1] newl1-docs@ef5a632/developers/json_rpc/newl1-api-list.md:L159 | observed | |
| C17 | 同一区块内的 SubBlock 以 prevSubBlockHash 链式串联，出块者签名是 secp256k1 风格的可恢复签名，不是 BLS | 由 C16 加 [1] core-concepts/tx-preconfirmation.md:L48（“Recover the signer”）推出：65 字节加可恢复，是 ECDSA 的特征 | inferred | |
| C18 | SubBlock 通过 P2P gossip 传播，出块者也直接推给本地订阅者，单节点 devnet 上也能用 | [1] newl1-docs@ef5a632/overview.md:L35；core-concepts/tx-preconfirmation.md:L60–61 | observed | |
| C19 | 客户端自验 SubBlock 的步骤：恢复签名者，查它是否在验证者集合内（只查成员资格，不查本轮 leader），重算 tx root 确认位置 | [1] newl1-docs@ef5a632/core-concepts/tx-preconfirmation.md:L47–50 | observed | |
| C20 | 预确认只是关于排序与纳入的 best-effort 签名承诺：不涉及执行与最终性，不碰 vote pool / fork choice / finality；窗口内只追加，不能被后来的高费交易重排 | [1] newl1-docs@ef5a632/core-concepts/tx-preconfirmation.md:L11–15, L55 | observed | F5 |
| C21 | Leader 失效时它尚未兑现的预确认可能被下一任 leader 的区块取代（superseded）；出块者撤回流则报 aborted | [1] newl1-docs@ef5a632/core-concepts/tx-preconfirmation.md:L56；developers/transaction-lifecycle.md:L108–109 | observed | F5 |
| C22 | 预确认事件含 txHash、blockNumber、subBlockIndex、position、leader、status 等字段，订阅者落后时收到 lagged 帧；缓存最多 8,192 条 / 80 块 | [1] newl1-docs@ef5a632/core-concepts/tx-preconfirmation.md:L35；developers/transaction-lifecycle.md:L135, L144 | observed | |
| C23 | 论坛提案作者称 sub-block “not implemented at the protocol level”，只是一种 reputational commitment | [4] 作者 2026-10-23 回复第 3 点 | observed | F5 |
| C24 | Gateway 是普通全节点，接收标准 eth_sendRawTransaction 后保持托管，把副本单跳发给按验证者排程选出的即将出块者，producer 不再转发 | [1] newl1-docs@ef5a632/developers/transaction-lifecycle.md:L13, L20；overview.md:L35 | observed | F6 |
| C25 | 没有全局 mempool 与 txpool_* 命名空间；newPendingTransactions 只显示本节点收到的交易；当前客户端没有 Gateway 拍卖或排序 API | [1] newl1-docs@ef5a632/developers/json_rpc/newl1-api-list.md:L56；developers/transaction-lifecycle.md:L28 | observed | F6 |
| C26 | TEE Gateway（TEE 内加密入口与确定性排序、主备切换、无 TEE 证明的区块额外烧掉 30% 收入）只是 2026-10-10 的论坛提案，没有写进文档，也没有说已在 devnet 上运行 | [4] 帖子正文（Core Proposal、Phase 0–3）与作者 “once the devnet or testnet is launched” | observed | F6 |
| C27 | 状态阶梯：preconfirmed（约 20 ms）→ ordered（约 1 块）→ order-finalized（约 1 到几块）/ executed → execution-finalized（承诺所在区块最终化之后） | [1] newl1-docs@ef5a632/core-concepts/tx-preconfirmation.md:L23–27 | observed | J |
| C28 | RPC 中 latest/pending 指向已执行 tip，safe/finalized 指向 justified/finalized 区块之前最近一个已发布执行承诺的高度；原始共识高度要读 newl1_subscribeNewHeads；-38004 表示已排序未执行 | [1] newl1-docs@ef5a632/developers/transaction-lifecycle.md:L172–177；developers/json_rpc/newl1-api-list.md:L22–23, L31 | observed | J |
| C29 | 区块 N 的执行结果写进区块 N+D 的区块头，1≤D≤D_MAX、每块最多变化 ±1；论坛作者初步称最大延迟预计 8 块 | [1] newl1-docs@ef5a632/core-concepts/async-execution.md:L20, L28；[4] 作者回复第 4 点 | observed | F2 |
| C30 | New L1 共识派生自 Parlia PoSA，从创世起只有一套配置，没有激活高度和 feature flag | [1] newl1-docs@ef5a632/core-concepts/consensus.md:L5, L7 | observed | I、F7 |
| C31 | New L1 验证者集合上限 64；BSC 当前为 45 个（21 Cabinet + 24 Candidates） | [1] newl1-docs@ef5a632/core-concepts/consensus.md:L16；[5] BSC Introduction | observed | K、F7、T |
| C32 | 每 16 块按排序轮换 proposer；in-turn 缺席时 out-of-turn 验证者按确定性种子生成的随机退避补位；in-turn 区块权重更高 | [1] newl1-docs@ef5a632/core-concepts/consensus.md:L20 | observed | F7 |
| C33 | 验证者的 BLS 投票签的是区块排序而不是执行结果；下一个 proposer 收齐 ⌈2N/3⌉ 签名后聚合进区块头；按 Casper-FFG 规则，相邻的 source/target 使 source 最终化 | [1] newl1-docs@ef5a632/core-concepts/consensus.md:L24, L28–30 | observed | I、F7 |
| C34 | 常见情况下区块 +1 块 justified、+2 块 finalized，200 ms 间隔下约 0.5 s | [1] newl1-docs@ef5a632/core-concepts/consensus.md:L32 | observed | I、F7 |
| C35 | BSC 的 BEP-126 是同一构造：直接子块头含 attestation 即 justified；自身与直接子块都 justified 即 finalized；阈值 ⅔*v+ | [6] BEP126.md@531f51c §2, §4.1.2, §4.1.3 | observed | I |
| C36 | 验证者对已发布 ExecutionCommitment 被自己本地执行证伪的区块弃权投票，使错误执行结果凑不齐 ⌈2N/3⌉；导入时不直接拒绝 | [1] newl1-docs@ef5a632/core-concepts/consensus.md:L34；core-concepts/async-execution.md:L80 | observed | F7 |
| C37 | 验证者每天在指定区块按质押排名选举一次，由 epoch 边界区块头绑定；例行轮换不经治理投票 | [1] newl1-docs@ef5a632/core-concepts/consensus.md:L38；governance/overview.md:L11, L44 | observed | F7 |
| C38 | double-sign 证据自动上链触发 slashing，本地 journal 防止签出冲突的投票或区块；SlashIndicator 记录宕机和漏块 | [1] newl1-docs@ef5a632/core-concepts/consensus.md:L40；governance/system-contracts.md:L12 | observed | F7 |
| C39 | 文档称 Parlia 只是“current default”，Minimmit 正作为 Consensus 2.0 候选评估，共识层留有接口以便替换 | [1] newl1-docs@ef5a632/core-concepts/consensus.md:L50 | observed | F7 |
| C40 | BSC 当前出块 0.45 s（BEP-619，Enabled），每轮仍 16 块（7.2 s），epoch 1000 块，快速最终性约 1.125 s | [7] BEP-619.md@54ee27f §5.1, §6.1, §6.3；[5] | observed | K |
| C41 | 路线图称 BSC 在 H1 2026 把出块从 750 ms 降到 450 ms，memory finality 从 1,125 ms 降到 650 ms | [2] “What Changed in Six Months” 表格 | observed | |
| C42 | 与 BSC 相比，New L1 出块快 2.25 倍（200 对 450 ms），同样 16 块一轮但轮次时长 3.2 s 对 7.2 s，排序最终性约 0.5 s 对约 1.125 s（BSC 文档口径） | 由 C14、C34、C40 推出：450/200=2.25；16×0.2=3.2 s；两块 FF 分别约 0.4–0.5 s 与 1.125 s | inferred | K、F7 |
| C43 | 迁移文档中“区块计数常量与 BSC 相差约 3.75 倍”沿用了 BSC 750 ms 的旧基准，Fermi 之后应约为 2.25 倍 | 由 [1] newl1-docs@ef5a632/get-started/migrate-from-bsc.md:L46 与 C40 推出：5 块/s ÷ 1.33 块/s = 3.75，而 5 ÷ 2.22 ≈ 2.25 | inferred | K |
| C44 | New L1 的 eth_getFinalizedHeader / eth_getFinalizedBlock 只接受 verifiedValidatorNum ∈ [2, 21]，不支持 BSC 的 -1/-2/-3 简写 | [1] newl1-docs@ef5a632/developers/json_rpc/newl1-api-list.md:L346, L349 | observed | S |
| C45 | New L1 属于质押选举的 authority 集合（PoSA），不是无许可 PoS；只叫 PoA 会漏掉质押选举与 slashing | 由 C30、C31、C37、C38 推出：集合有上限，按质押选出，有惩罚 | inferred | I、F7 |
| C46 | 治理沿用 BSC 的 OpenZeppelin/Compound Governor + Timelock 引擎，没有管理员密钥可以绕过；受治理目标只认 GovHub，GovHub 只认 Timelock | [1] newl1-docs@ef5a632/governance/overview.md:L7, L28 | observed | |
| C47 | 提案流程为 propose→vote→quorum→queue→timelock→execute（GovHub.updateParam）；Multi-Lane 配额另有激活延迟 | [1] newl1-docs@ef5a632/governance/overview.md:L21–26, L31 | observed | |
| C48 | ValidatorSet、SlashIndicator、SystemReward、StakeHub、StakeCredit、GovToken、Governor、Timelock 沿用 BSC 字节码与地址；Governor/Timelock 的时间常数仍是 devnet 值 | [1] newl1-docs@ef5a632/governance/system-contracts.md:L29 | observed | |
| C49 | LaneRegistry、AccountKeychain/SignatureVerifier（预编译）、ShieldedPool/ShieldedAuthVerifier 是 New L1 原创的系统合约，BSC 没有对应物 | [1] newl1-docs@ef5a632/governance/system-contracts.md:L21–25, L31 | observed | |
| C50 | bnb-chain GitHub 组织下目前没有公开的 New L1 客户端源码仓库 | 主会话 2026-10-24：`gh api orgs/bnb-chain/repos` 列出 2026-05 以来有推送的仓库，没有 New L1 客户端（只有 reth、reth-bsc、reth-core 等）；`gh search code ExecutionCommitment --owner bnb-chain` 只命中文档仓库 bnb-chain.github.io 的 docs/newl1/ | observed | F1、S |
| X1 | New L1 的执行层基于 reth 与 revm，revm 语义是硬性设计约束 | [3] newl1-docs@ef5a632/overview.md:L45；[7] faq.md:L9 | observed | |
| X2 | 文档对“Parallel EVM”的全部描述只有一段：基于 access list，交易显式声明状态依赖，不冲突的交易并发执行；原文为“Detailed design is in progress” | [1] newl1-docs@ef5a632/core-concepts/async-execution.md:L99–101 | observed | F3 |
| X3 | overview 架构表和架构图把 Parallel EVM 列为执行层组成部分，没有标注成熟度 | [3] overview.md:L33；[11] 架构图 | observed | F3 |
| X4 | 区块头省略 state_root、receipts_root、logs_bloom、gas_used、blob_gas_used、requests_hash，这些值在后续区块的 execution commitments 中发布；执行由后台 scheduler 独立于出块和投票完成 | [1] async-execution.md:L16 | observed | I、F2 |
| X5 | 系统交易在执行时生成，效果写入 ExecutionCommitment，不进入区块的交易列表；区块带 systemTransactionsRoot 和 commitments，未执行前 stateRoot 等字段为 null | [1] async-execution.md:L70；[6] get-started/migrate-from-bsc.md:L71–72 | observed | F2 |
| X6 | 区块 N 的结果写入区块 N+D 的头部；负载低时 D 趋向 1，负载高时 D 增大；追赶时一个区块可以携带多个 ExecutionCommitment | [1] async-execution.md:L20–24 | observed | I、F2 |
| X7 | 1 ≤ D ≤ D_MAX，每块最多变化 ±1，D_MAX 由治理配置（文档未给数值）；验证者只检查承诺列表连续、严格递增、每块推进有界 | [1] async-execution.md:L28 | observed | F2 |
| X8 | 区块状态依次为 ordered → executed → committed → finalized；只有排序不算最终；reorg 时排序和执行一起回滚 | [1] async-execution.md:L35–46 | observed | F2 |
| X9 | 投票只针对排序；验证者如果本地执行否定了已发布的执行承诺，就不投票，错误结果凑不到 ⌈2N/3⌉ 票；区块导入阶段不拒绝这类区块 | [1] async-execution.md:L80；[9] consensus.md:L24、L34 | observed | |
| X10 | 对错误的执行承诺，文档只描述了不投票这一种处理，没有欺诈证明或专门的 slashing | 由 X9 推出：已读的 async-execution 和 consensus 页只写了不投票这一种纠错手段 | inferred | |
| X11 | 自适应 lag 属于当前设计，不在标为 in progress 的范围内，但文档没有明说已在 devnet 运行 | 由 X2、X6 与 [3] overview.md:L67 推出：async-execution 页只把并行 EVM 标为 in progress | inferred | F2 |
| X12 | 按声明 gas 收费的起因：共识按滞后 D 块的状态接纳交易，会遇到零余额 spam、同块抽干、nonce 冲突、合约依赖四类问题 | [1] async-execution.md:L50–57 | observed | F4 |
| X13 | 费用为 gas_bid × gas_limit，不退未用 gas，EIP-3529 退款作废（系统交易和 RPC 模拟除外）；回执 gasUsed 通常等于声明的 limit；单笔交易上限 16,777,216 gas | [1] async-execution.md:L61；[6] migrate-from-bsc.md:L14、L20–21 | observed | F4 |
| X14 | 只有 effectiveBalance ≥ tx_cost 才接纳交易；每个账户在 D 窗口内的在途 gas_limit 和 calldata 有硬上限 | [1] async-execution.md:L59、L62、L64 | observed | F4 |
| X15 | 执行时结算：nonce 正确时收 min(balance, occupied×price) 并消耗 nonce；nonce 无效时不收费、不改状态；回执计入 min(gas_limit, 剩余区块 gas) | [1] async-execution.md:L63 | observed | F4 |
| X16 | 文档称 New L1 不需要 Monad 式的固定 reserve floor；Monad 使用 Reserve Balance 规则 | [1] async-execution.md:L66；[25] | observed | F4 |
| X17 | latest 解析为已执行的区块头；finalized 以执行承诺为依据；查询已排序但未执行的区块返回可重试的 -38004 | [1] async-execution.md:L84–96 | observed | F2 |
| X18 | LtHash 可交换，状态 diff 可以分片并行哈希、无锁归约，不拖慢并行执行 | [4] core-concepts/state-db.md:L9、L44 | observed | |
| X19 | 节点重启时重放的窗口按最大执行 lag 确定 | [4] state-db.md:L76 | observed | |
| X20 | 排序与执行解耦不是 New L1 首创：Monad 先就排序达成共识，D = 3；EIP-7886（Stagnant）把执行输出推迟一块；New L1 文档自己引用了这两者 | [25]；[24]；[1] async-execution.md:L20 | observed | I |
| X21 | Parallel EVM 1.0 即 NodeReal 于 2022 年初提出的 BEP-130（dispatcher + slot + 冲突重做），参考实现在 node-real/bsc 分叉；BEPs PR 于 2023-02-14 合并，文件状态为 Draft | [14]；[16] BEPs PR #130 | observed | M |
| X22 | Parallel EVM 2.0 于 2022-10-17 以 NodeReal release v1.1.16+Parallel-2.0 发布，只支持 full sync，不支持 validator 模式 | [15] | observed | M、F8 |
| X23 | Tech Roadmap 2023 称“deployed several iterations to the BSC mainnet”，同时说 3.0 才会把并行用到 validator 模式，并称当前实现过于复杂、要“take a break and rethink” | [32] Tech Roadmap 2023 | observed | M、F8 |
| X24 | PEVM 1.0 / 2.0 从未进入 BSC 的验证者或共识路径；所谓“部署到主网”指分叉 release 运行在同步主网的 full node 上 | 由 X22、X23 推出：2.0 不支持 validator 模式，3.0 才计划做 validator 模式且被搁置 | inferred | M、F8 |
| X25 | Parallel EVM 3.0 规划为基于 hint（读写集）的 dispatcher，以减少重复执行，目标是进入 BSC / opBNB 生产环境 | [14] | observed | M |
| X26 | BEP-396 TxDAG（2024-06）用执行读写集构造依赖 DAG，PR 仍是 open 的 Draft；BEP-456 同样 open | [17] BEPs PR #396、#456 | observed | M、F8 |
| X27 | TxDAG PEVM 在 op-geth alpha 版上测试，实验室平均提升约 30% | [18] | observed | M |
| X28 | opBNB 主网从 block 43274759 起在链上携带 TxDAG 数据，但 PEVM 客户端只有标注“Beta - Not production ready”的 op-geth v0.5.4-pevm 预发布版；2025 路线图称 2024 年在 opBNB 上实现了 Parallel EVM | [34] op-geth releases；[33] Tech Roadmap 2025 | observed | M、F8 |
| X29 | Parallel EVM 1.0–3.0 和 TxDAG 都没有进入 bnb-chain/bsc 官方 release；官方 release 里唯一的“并行执行”是 BAL 驱动的 feature 构建 v1.6.4-feature-BAL7928（2025-12-18） | 主会话 2026-10-24：`gh api repos/bnb-chain/bsc/releases` 全部 132 个 release 的说明中检索 parallel/txdag/pevm，只命中 v1.7.0-alpha（trie 预取并行）、v1.6.4-feature-BAL7928（BAL 驱动并行执行，失败回退串行）、v1.1.3（bloom 并行计算）；另见 [15][17][32][34] | observed | M、F8 |
| X30 | BEP-592（2025-06-30，Candidate）是非共识 BAL：附在区块末尾，节点用于并发预取，不校验内容 | [19] BEP-592 @cb62306 | observed | M |
| X31 | 官方 BAL 博客称 BEP-592 已上线，EIP-7928 将取代它；实验室中 EIP-7928 吞吐 +18.6%，p95 处理时间 +32.1% | [20] | observed | M |
| X32 | bsc#3690 于 2026-05-19 合并（milestone v1.7.6），删除 BEP-592，理由为“decide to follow upstream”；v1.7.6（Chapel）和 v1.7.7（主网，2026-07-22）的 release notes 都声明 --enablebal 失效、必须删除 EnableBAL | [35] bsc PR #3690；[36] v1.7.6；[21] v1.7.7 | observed | M、F8 |
| X33 | v1.8.0-alpha（2026-08-13，不面向生产）同步 geth v1.17.3，删除 superinstruction（#3759）和 incr snapshot（#3768），用 EIP-7928 脚手架取代 BEP-592 | [37] bsc v1.8.0-alpha | observed | M、F8 |
| X34 | 官方路线图仍把 BAL 作为并行方向：H2 2026 计划用 BAL 并行降低导入延迟；Tech Roadmap 2026 计划用 EIP-7928 在追块时做无冲突并行（称已带来 20% 提升），并在出块时用静态分析预判依赖 | [12] H2 2026 路线图；[13] Tech Roadmap 2026 | observed | M |
| X35 | BEP-684（2026-04-23，open Draft）提出只校验 header 就投票、执行异步；区块头仍承诺 state_root；最终性要等导入完成；EXECUTION_DEBT_MAX = 2 | [23] BEP-684 @73b1cfe | observed | M、F8 |
| X36 | New L1 比 BEP-684 走得更远：区块头根本不带执行结果，结果延迟 D 块由 ExecutionCommitment 发布，且 D 自适应 | 由 X4、X6、X35 推出 | inferred | F8 |
| X37 | BSC 的并行执行线（PEVM、TxDAG、BAL）和 New L1 的 access-list 并行都属于区块内执行加速，New L1 这部分仍在设计；New L1 的新东西在于共识与执行的时间结构 | 由 X2、X21–X35、X36 推出 | inferred | F8 |
| X38 | New L1 的 access list 在格式或代码上沿用了 BAL / EIP-7928 或 TxDAG | 没有一手证据；[1] L101 只写了“access-list-based” | speculative | F8、S |
| X39 | 架构图写作“Order-Execution separation”；正文称 order-execution decoupling，指验证者只签排序、不签执行结果 | [11]；[9] consensus.md:L24；[1] async-execution.md:L9 | observed | N |
| X40 | 排序由当前出块者决定：gateway 把交易单跳发给即将出块的生产者，不提供拍卖或排序 API；预确认在窗口内只追加不重排 | [5] developers/transaction-lifecycle.md:L20、L28；[10] tx-preconfirmation.md:L7、L55 | observed | F9 |
| X41 | lane 内按普通手续费优先排序，不提供 FIFO，也不保证纳入 | [2] core-concepts/multi-lane.md:L11–15 | observed | F9 |
| X42 | OES 只是共识与执行的时间解耦，不给应用排序权，也不改变 MEV 归属，与 ASS 正交 | 由 X39–X41 推出；ASS 定义见 [30] | inferred | I、F9 |
| X43 | 路线图称 TxStream 能阻止抢跑，但文档里的机制只是不广播到全局 mempool，出块者本人仍然最先收到交易 | [12]；由 X40 推出 | inferred | F6 |
| X44 | Multi-Lane 按 to 地址确定性路由；未注册地址和合约创建进入默认的无上限 lane；不按 calldata 或函数选择器路由 | [2] multi-lane.md:L19–23 | observed | N、F9 |
| X45 | lane 配额以 bps 记在 LaneRegistry（0x…3000，经治理修改）；默认 lane 吸收剩余容量和未用掉的保留容量；占用按声明的 gas limit 计 | [2] multi-lane.md:L27–31；[8] governance/system-contracts.md:L21 | observed | N、F9 |
| X46 | lane 配置从滞后的检查点读取，改动大约在一个执行 lag 之后生效；可通过 newl1_laneConfig 查询 | [2] multi-lane.md:L35–37 | observed | F9 |
| X47 | BSC Payment Lane（BEP-703，Draft）只有一个支付类别，配额默认 500 bps、上限 1000 bps；即使配额闲置，普通交易也不能用；不改变排序 | [26] BEP-703 @cb62306 | observed | F9 |
| X48 | Multi-Lane 与 Payment Lane 的差异：多条 lane 对单一支付类、未用配额回流对闲置、按声明 gas 计对按实际 gas 计；文档自称 Multi-Lane 在 BSC 上没有对应物 | 由 X45、X47 与 [2] multi-lane.md:L7 推出 | inferred | F9 |
| X49 | H2 路线图把这个功能称为 PriorityLane，举的例子是预言机、清算和跨链桥 | [12] | observed | |
| X50 | Multi-Lane 属于容量隔离（与 Tempo、BSC 的 lane 同类），不是 ASS：它给注册地址保留容量，但不给排序权 | 由 X41、X44、X45 推出；分类依据 [30] | inferred | I、F9 |
| A1 | New L1 的原生 AA 交易是 EIP-2718 类型 `0x76`，从 genesis 起有效，不需要 bundler、EntryPoint 或合约钱包，由每个节点执行规则 | [1] newl1-docs@ef5a632/core-concepts/account-abstraction.md:L7, L9 | observed | I |
| A2 | 官方称 0x76 信封和 AA key 管理已在源码构建的多验证者 devnet 上跑通；没有公开 testnet 或 mainnet | [7] newl1-docs@ef5a632/overview.md:L67–69；[6] newl1-docs@ef5a632/faq.md:L18 | observed | |
| A3 | 官方仓库没有受支持的 New L1 SDK 或版本化 codec，要求使用对应客户端版本的 codec 和测试向量 | [2] newl1-docs@ef5a632/developers/transaction-types.md:L16–17 | observed | |
| A4 | 0x76 字段：chain_id、nonce_key、nonce、两个 1559 费用字段、gas_limit、calls、access_list、valid_after / valid_before、key_authorization、fee_payer_signature、token_fee | [1] account-abstraction.md:L22–34 | observed | |
| A5 | 一笔 0x76 含 1–64 个调用，只有一个外层签名、一个 nonce、一张回执，调用全部生效或全部回滚 | [1] account-abstraction.md:L13, L29 | observed | I、O |
| A6 | 单笔 0x76 编码后不超过 128 KiB；任何用户交易声明 gas 不超过 16,777,216 | [1] account-abstraction.md:L36, L124, L171–172 | observed | |
| A7 | `nonce_key` 目前必须为 0；并行 nonce 通道“预留但未启用” | [2] transaction-types.md:L28, L48；[1] account-abstraction.md:L175 | observed | |
| A8 | 支持 secp256k1、P256、WebAuthn 三种签名，任一种都可以做 root 或委托 key；P256 / WebAuthn 的公钥放在签名里 | [1] account-abstraction.md:L61–65 | observed | F11 |
| A9 | 以下规则由共识强制：P256 low-s 且公钥是有效曲线点、`pre_hash` 标志；WebAuthn authenticator data 正好 37 字节、UP 或 UV 至少一个、type 为 `webauthn.get`、无填充 base64url challenge | [1] account-abstraction.md:L67–72 | observed | |
| A10 | passkey 为 root 的账户不能签 legacy 或 EIP-1559 交易，只能通过 0x76 操作 | [1] account-abstraction.md:L74 | observed | |
| A11 | root、admin、access 是同一账户的三个授权等级；root 的地址就是账户，不能被撤销 | [1] account-abstraction.md:L78–84 | observed | O |
| A12 | admin key 可以授权和撤销其他委托 key（包括 admin），但不能部署合约，必须是无 scope、无上限、无过期的；被盗后可清掉账户所有 session key | [1] account-abstraction.md:L83, L86 | observed | O |
| A13 | `AccountKeychain` 在 `0x…4000`，`SignatureVerifier` 在 `0x…4001`，是编进 EVM 预编译表的 Rust 逻辑，New L1 原创，BSC 没有 | [1] account-abstraction.md:L88；[3] newl1-docs@ef5a632/governance/system-contracts.md:L22–23, L31–32 | observed | O、F11 |
| A14 | 授权 key 有两条路径：inline 授权最多 32 个 scope，直接调用 `authorizeKey` 最多 256 个；每个 scope 最多 64 个 selector | [1] account-abstraction.md:L94–99 | observed | |
| A15 | scope 限制目标地址，可再细化到 4 字节 selector；scope 为空列表等于什么都不能做；root 绕过 scope | [1] account-abstraction.md:L105 | observed | |
| A16 | 花费上限只限制原生币流出：成功调用转出的 value 加自付时的 gas_limit×价格；支持一次性或固定周期桶；代付的 gas 不计入 | [1] account-abstraction.md:L107 | observed | O |
| A17 | 撤销是永久的：撤销过的 key id 在该账户上永远不能再授权；已过期但没撤销的槽位也不能重授权 | [1] account-abstraction.md:L109 | observed | |
| A18 | `newl1_getKey` 返回 sigType（0 = secp256k1，1 = P256，2 = WebAuthn）、expiry、isRevoked、isAdmin、scoped、spendLimit、spendPeriod、spent | [4] newl1-docs@ef5a632/developers/json_rpc/newl1-api-list.md:L186, L207–218 | observed | |
| A19 | 委托 key 签的是 `keccak256(0x04 \|\| signing_hash \|\| account)`，并和账户地址一起包装，防止跨账户重放 | [1] account-abstraction.md:L48；[2] transaction-types.md:L43 | observed | |
| A20 | 账户签名哈希承诺“有没有代付人”但不含代付签名；代付哈希把交易体绑定到被代付账户 | [1] account-abstraction.md:L40；[2] transaction-types.md:L40 | observed | |
| A21 | 拒绝自代付；准入要求代付人够付 gas 预留、账户够付调用总 value；账户照样推进 nonce | [1] account-abstraction.md:L128–131 | observed | |
| A22 | `token_fee` 只能用在 root 签名且有代付的 AA 上；recipient 必须是代付人，token 必须是合约，amount 不能为 0；不需要 allowance 或 permit | [1] account-abstraction.md:L134 | observed | O |
| A23 | token 支付在用户调用之前、原子检查点之外执行：用户调用回滚照样付；token 支付失败则用户调用不执行，代付人照收全额 gas_limit | [1] account-abstraction.md:L136 | observed | T |
| A24 | AA 和普通交易都按声明的 gas_limit 收费，不退未用 gas，存储退款作废；这条同样适用于代付人和 session key 上限 | [1] account-abstraction.md:L117–118；[5] newl1-docs@ef5a632/get-started/migrate-from-bsc.md:L14, L22 | observed | F4 |
| A25 | AA 附加 gas：P256 约 5,000，WebAuthn 5,000 + 按字节，委托 key 检查 3,000，inline 授权约 27,000 | [1] account-abstraction.md:L122 | observed | |
| A26 | 有效期：valid_after 含边界、valid_before 不含边界；节点本地策略是 valid_after 最多提前 120 s、valid_before 至少还剩 3 s | [1] account-abstraction.md:L140, L142 | observed | |
| A27 | 已上链但失败的交易收全额 gas_limit 并推进 nonce；委托 key 权限在执行时再检查，通过提交检查不代表一定成功 | [1] account-abstraction.md:L150, L153 | observed | |
| A28 | tx.origin 和顶层调用的 msg.sender 都是账户，不是委托 key 或代付人；合约可以从 keychain 预编译读出当前签名的 key id（0 表示 root） | [1] account-abstraction.md:L157, L159 | observed | |
| A29 | CREATE 只在同时满足以下条件时允许：第一个调用、root 签名、自付、没有 inline 授权 | [1] account-abstraction.md:L163 | observed | |
| A30 | New L1 拒绝 EIP-7702（0x04）和 EIP-4844 交易；FAQ 称 AA 不涉及 bundler 或 paymaster 合约 | [2] transaction-types.md:L14；[4] newl1-api-list.md:L59；[6] faq.md:L22 | observed | I、F11 |
| A31 | 隐私页“尚未实现”清单里的 “paymaster/ERC-4337 submission” 指 shielded pool 的提交路径，不是 AA | [8] newl1-docs@ef5a632/core-concepts/privacy.md:L63 | observed | |
| A32 | New L1 AA 的账户是无代码的协议账户，权限状态在预编译存储里，root key 无法在同一地址内轮换 | 由 A1、A11、A13 推出：没有合约钱包、地址等于 root 且 root 不可撤销、key 状态由 keychain 预编译管理 | inferred | |
| A33 | New L1 session key 无法原生限制 BEP-20 的支出金额，只能用目标 / selector 来限制 | 由 A15、A16 推出：花费上限只计原生币流出，scope 只有目标和 selector | inferred | O |
| A34 | Tempo 的原生 AA 交易也用 EIP-2718 类型 `0x76`，并且有 chain_id、两个费用字段、gas_limit、calls、access_list、nonce_key、nonce、valid_before、valid_after、fee_payer_signature、key_authorization 这 12 个同名字段（两个费用字段分开计） | [11] docs.tempo.xyz spec-tempo-transaction（TempoTransaction 结构，访问于 2026-10-24） | observed | I、O、F10、T |
| A35 | Tempo 的 key 预编译同样叫 `AccountKeychain`（地址 `0xAAAAAAAA00…00`，和 New L1 的 `0x…4000` 不同），同样分 Root / Admin / Limited Access 三级，admin 同样不能带上限、scope、过期 | [12] docs.tempo.xyz AccountKeychain（访问于 2026-10-24）；[1] account-abstraction.md:L82–84, L88 | observed | O、F10、T |
| A36 | Tempo 的 Keychain V2 签名同样是 `keccak256(0x04 \|\| tx_sig_hash \|\| user_address)`；WebAuthn 规则（37 字节、UP 或 UV、webauthn.get）、P256 `pre_hash`、附加 gas（P256 +5,000、Keychain +3,000）和撤销后不能重授权，都与 New L1 相同 | [11] spec-tempo-transaction（Signature Types、Gas Costs）；[12] Key Revocation；[1] account-abstraction.md:L48, L70–72, L109, L122 | observed | O、F10、T |
| A37 | New L1 的 0x76 与 Tempo Transaction 在类型号、字段名、预编译名、签名摘要、gas 常量和权限语义上高度同源，可以看作 Tempo 设计的 BNB 变体 | 由 A34、A35、A36 推出：多项独立设计细节逐字或逐数值一致，巧合的可能性很低 | inferred | F10、T |
| A38 | New L1 客户端的 AA 实现可能直接复用或移植了 Tempo 的 reth 代码 | 未验证：New L1 基于 reth / revm（[7] overview.md:L45），Tempo 也基于 Reth（[11] Nonce 实现说明），但 New L1 源码不公开，两份文档都没有提到对方 | speculative | F10、S |
| A39 | 与 Tempo 相比，New L1 去掉了 `fee_token`（TIP-20 付 gas）和 `aa_authorization_list`（7702 式委托），新增 `token_fee` 用代币偿还代付人 | [11] TempoTransaction 结构；[1] account-abstraction.md:L34, L134；[2] transaction-types.md:L14 | observed | O、F10 |
| A40 | Tempo 已开放 2D nonce 和过期 nonce（`uint256.max`，valid_before 最多 300 s）；New L1 只允许 nonce_key = 0 | [11] Parallelizable Nonces / Nonce Validation；[2] transaction-types.md:L48 | observed | O、F10 |
| A41 | 花费上限对象相反：Tempo 只限 TIP-20 代币，原生 value 不受限；New L1 只限原生币流出 | [12] Access Keys（“Native value transfers … are NOT limited”）；[1] account-abstraction.md:L107 | observed | O、F10 |
| A42 | Tempo 按代付人或发送方先预扣再退款；New L1 收全额声明 gas_limit 不退款 | [11] Fee Payer Resolution（“pre-charge, refund”）；[1] account-abstraction.md:L118 | observed | O、F10 |
| A43 | Tempo 主网于 2026-03-18 上线，New L1 仍处于 devnet | [13] tempo.xyz/blog/mainnet；[7] overview.md:L67 | observed | F10 |
| A44 | EIP-8130 当前版本（2026-10-08，Draft）标题为 “Keystore Accounts”，只定义 Keystore，交易类型已拆到单独提案 | [9] ethereum/EIPs EIPS/eip-8130.md@1a1f470（Abstract；提交信息 “move the transaction type to a new EIP”） | observed | O、F11 |
| A45 | 拆出的 EIP-8430 “AA Transaction Type” 是 Draft，PR #12385 还没合并；它用 `0x79`（代付域 `0x7A`），有 phase 批量、2D nonce 和 nonce-free 模式、交易内 7702 式委托，并按 gas_used 结算退款 | [10] chunter-cb/EIPs EIPS/eip-8430.md@a742d263（Constants、Nonces、Account Changes、Fees）；PR ethereum/EIPs#12385 状态 open | observed | O、F11 |
| A46 | EIP-8130 的验证由可插拔 authenticator 合约完成（canonical 集合为 k1 / p256 / passkey / delegate），权限用 scope 位和 policy manager 表达；文档预期 PQ 算法以新 authenticator 加入，不需要迁移 | [9] eip-8130.md@1a1f470（Canonical Authenticator Set、Actor Scope、Actor Policies） | observed | O、F11 |
| A47 | 和 8130 相比，New L1 的签名算法由协议固定在三种之内；给 AA 加 PQ 或新签名算法需要协议升级，而 8130 只需部署新 authenticator 并纳入 canonical 集合 | 由 A8、A13、A46 推出：New L1 签名方案和 keychain 都是 enshrined 预编译，AA 文档没有可插拔验证器 | inferred | O、F11 |
| A48 | EIP-7702（Final）用类型 `0x04` 给 EOA 写入委托指示符 `0xef0100 \|\| address`；ERC-4337（Final）用 UserOperation、独立 mempool、bundler、EntryPoint `handleOps` 和 paymaster 实现协议外 AA | [14] ethereum/EIPs EIPS/eip-7702.md@bbc3f958（Parameters、Abstract）；[15] ethereum/ERCs ERCS/erc-4337.md@c8d8c210（Abstract、front matter） | observed | O、F11 |
| A49 | 外部调研把 New L1 写成“Root / Admin / Delegated / Sponsor 四层”、把 token fee 写成“交易完成后偿还”，都和官方文档不符 | [16] BNB-new-L1-deep-dive.md §3.2–3.3；对照 [1] account-abstraction.md:L78–84, L130, L136 | observed | T |
| P1 | ShieldedPool 是 genesis 预部署的系统合约，地址 `0x…5000`；auth proof 验证器 ShieldedAuthVerifier 在 `0x…5003`，没有硬分叉门槛 | [1] newl1-docs@ef5a632/core-concepts/privacy.md:L52；[4] governance/system-contracts.md:L24–25 | observed | P |
| P2 | ShieldedPool/ShieldedAuthVerifier 是 New L1 原创，BSC 上没有对应物 | [4] governance/system-contracts.md:L31 | observed | |
| P3 | 隐私池采用 note（owner commitment、amount、asset、isOpen）+ 只追加 Merkle 树 + nullifier 的 UTXO 式模型 | [1] core-concepts/privacy.md:L18–20 | observed | I |
| P4 | 每次花费固定销毁 2 个 nullifier，只有一个真实输入时用无法区分的 phantom nullifier 补位，以隐藏真实输入数 | [1] core-concepts/privacy.md:L20 | observed | |
| P5 | 每次花费带两个 PLONK 证明：pool proof（价值守恒、Merkle 成员资格、nullifier、spend key）和 auth proof（note 中承诺的 EOA 对 EIP-712 消息的签名），两者靠 note commitment 绑定 | [1] core-concepts/privacy.md:L21 | observed | P |
| P6 | 证明为 gnark BN254 PLONK，每个恰好 864 字节，长度不符在解码阶段即被拒绝 | [3] developers/transaction-types.md:L62、L95 | observed | P |
| P7 | 当前部署导入现成的公共 SRS，没有举办 New L1 自己的仪式；电路未审计；两项都是主网前的未决项，文档要求不要放真钱 | [1] core-concepts/privacy.md:L9–10、L67；[9] faq.md:L30 | observed | F13 |
| P8 | 目前只支持原生 BNB：“the asset field is pinned to native, with no ERC-20/BEP-20 path” | [1] core-concepts/privacy.md:L56 | observed | F12 |
| P9 | 四种流程：Shield（privDeposit，不需证明，公开存款方、金额、资产）、Shielded transfer、Unshield（公开金额、资产、目的地址）、Atomic call | [1] core-concepts/privacy.md:L28–31 | observed | I、P |
| P10 | 一次 shielded transfer 花 1–2 个 note，最多产出 3 个输出（收款、找零、手续费），各自加密给对应 view key | [1] core-concepts/privacy.md:L29 | observed | |
| P11 | `0x77` 原生交易没有 sender、nonce 和外层签名，由两个证明授权，任何 validator 或 builder 都能打包；文档称它是抗审查的后备路径 | [1] core-concepts/privacy.md:L37、L40；[3] developers/transaction-types.md:L12、L55 | observed | P |
| P12 | Relayer 路径：relayer 用普通签名交易调用 `transact`，手续费以私有 fee note 支付（金额、资产隐藏）；direct 路径的手续费 `feePerGas × gasLimit` 公开，且用原生 BNB | [1] core-concepts/privacy.md:L37–38、L68 | observed | P |
| P13 | `0x77` 有 30 个公开信号，gasLimit 和 feePerGas 写在信号 `[28]/[29]` 里，所以手续费在证明内承诺，不能换 limit 重播；`[12]` 区分 transfer/withdraw/atomic call | [3] developers/transaction-types.md:L63、L67、L69 | observed | |
| P14 | `0x77` 不能用 eth_estimateGas，要先读 `newl1_shieldedGasConstants` 定 gas；被接受的 `0x77` 按声明 limit 全额收费 | [3] developers/transaction-types.md:L96 | observed | |
| P15 | 新 commitment 先排队，由 `deferBatchInsert` 每 50 块（约 10 秒）批量插入；证明验证和 nullifier 销毁不延迟；收到的 note 立即可发现，下次插入后才能花 | [1] core-concepts/privacy.md:L60 | observed | |
| P16 | 一个 32 字节 seed 派生 spend key、note-secret seed、view key；view key 只用于发现和解密收到的 note；EOA 私钥复用为授权密钥 | [1] core-concepts/privacy.md:L22 | observed | |
| P17 | `registerPrivacyInfo` 会把 EOA 与隐私地址公开关联，但各个 note 之间仍互不关联 | [1] core-concepts/privacy.md:L23、L69 | observed | F13 |
| P18 | Atomic call：先结算并托管，再在第二个 frame（`deliver`）执行公开调用；调用回滚时花费和手续费都不回退，托管价值可以重试 | [3] developers/transaction-types.md:L97；[1] core-concepts/privacy.md:L31 | observed | F12 |
| P19 | Atomic call 公开 unshield 金额、调用 target、calldata 和 reshield 金额，结果以 open note（owner 隐藏，amount、asset 公开）回到池中 | [1] core-concepts/privacy.md:L24、L31、L68 | observed | F12 |
| P20 | 只有 shielded→shielded 转账同时隐藏发送方、收款方、金额、资产；即便如此，direct 路径的手续费仍公开 | [1] core-concepts/privacy.md:L68 | observed | I |
| P21 | 隐私池没有网络层匿名，relayer 能看到 IP 和时间，是元数据层面的可信方；atomic call 和公开手续费的匿名性来自用户集合，不是密码学隐藏 | [1] core-concepts/privacy.md:L71–72 | observed | F13 |
| P22 | ShieldedPool 不可变（没有 admin、proxy、升级路径），唯一受治理的动作是暂停存款；提现、转账、atomic call 不受暂停影响 | [1] core-concepts/privacy.md:L61、L73 | observed | F13 |
| P23 | 未实现：ERC-20/BEP-20 shielding、预留的 PQ 授权方案、paymaster/ERC-4337、按资产的合规钩子（只有接口缝，没有验证器和调用点）、递归证明聚合、多开关治理 | [1] core-concepts/privacy.md:L63 | observed | F13 |
| P24 | New L1 隐私的可组合性是“用池内余额触发一次公开 EVM 调用，结果以 open note 回池”，不是隐私执行，也不是 confidential DeFi | 由 P18、P19、P8 推出：调用和金额公开，回池的 note 金额公开，资产只有 BNB | inferred | F12 |
| P25 | Railgun RelayAdapt 同样是 unshield → 多个公开合约调用 → reshield 的单笔交易，但调用失败时整体回滚，与 New L1 “花费照样成立、托管可重试”的失败语义不同 | [16] docs.railgun.org cross-contract-calls（访问于 2026-10-24）；与 P18 对照 | observed | I、F12 |
| P26 | Zcash Orchard 是纯 shielded 支付协议，使用 Halo 2，不需要 SRS；Aztec 的私有函数在客户端 PXE 执行，只把证明发给网络 | [17] zips.z.cash/zip-0224；[18] docs.aztec.network/developers/overview | observed | I |
| P27 | atomic call 的 target 是否有白名单或限制，文档没写；“能调用任意合约”没有原文支持 | [1] core-concepts/privacy.md:L31 只举 “a DEX swap, for example”，全文没有限制条款 | speculative | F12、S |
| P28 | New L1 状态为 flat KV：账户条目 `0x00‖address`→nonce‖balance‖code_hash，存储条目 `0x01‖address‖slot`→value，值为零的槽不计入 | [2] core-concepts/state-db.md:L28–29、L35 | observed | Q |
| P29 | 每个条目用 BLAKE3 XOF 输出 2048 字节（1024 个小端 u16），全部活跃条目逐元素 wrapping u16 相加成 2KB 累加器，`state_root = BLAKE3(accumulator)`（32 字节） | [2] core-concepts/state-db.md:L14–16、L39、L41、L51 | observed | I、Q、F14 |
| P30 | 累加器支持 O(1) 的 mix_in/mix_out，与顺序无关、可并行，结果逐位一致；从 genesis 起就使用，没有分叉开关 | [2] core-concepts/state-db.md:L43–45、L65 | observed | I |
| P31 | 文档称安全性基于 SIS，1024×u16 “targets ~128-bit security”，引用 Bellare–Micciancio（1997）与 Solana SIMD-0215 | [2] core-concepts/state-db.md:L47 | observed | I、Q、F14 |
| P32 | SIMD-0215 的 LtHash 参数与 New L1 相同（BLAKE3 XOF 2048 字节、1024 个 u16 wrapping add/sub、32 字节 blake3 输出），但 Solana 对整个账户做一次 hash（含 data、owner），lamports=0 的账户记为零；SIMD-0215 已激活 | [13] solana-improvement-documents proposals/0215-accounts-lattice-hash.md@f1afd94 | observed | F15 |
| P33 | ePrint 2026/2083（2026-09-18）对 LtHash16（N=1024，d=16）给出约 2^81 次哈希查询、≤2^101 次运算的碰撞攻击，远低于原先 ≥200-bit 的说法 | [14] eprint.iacr.org/2026/2083 摘要；[15] eprint 2019/227 摘要 | observed | F15、T |
| P34 | SIMD-0215 于 2026-09-25 更新安全一节，承认 2^81 攻击，并用“碰撞集合约 2^72.83 个元素，而 lamports 非零的账户少于 2^65”论证 Solana 仍安全 | [13] SIMD-0215@f1afd94 Security Considerations | observed | F15 |
| P35 | New L1 文档（2026-10-22）的 “~128-bit” 表述没有反映 ePrint 2026/2083 和 SIMD-0215 的更新 | 由 P31、P33、P34 推出：文档提交晚于两者，但只写 ~128-bit，没有提及攻击 | inferred | F15 |
| P36 | Solana 依赖 lamports 总量上限的“碰撞集合构不成合法状态”论证不能直接套用到 New L1，因为 New L1 的条目包括存储槽和零余额账户 | 由 P28、P34 推出；New L1 是否有其他条目数上界，文档未讨论 | speculative | F15、S |
| P37 | LtHash 是格基同态集合哈希和状态承诺，不是签名；New L1 已读文档中没有 Falcon/FN-DSA | 由 P29、P31 推出；[1]–[11] 均未出现 Falcon | inferred | I、F14 |
| P38 | 累加器是“和”而不是树，`eth_getProof` 总是返回 `-32004`；在 accumulator-native 包含证明发布前，桥和轻客户端只能依靠 BLS 最终性投票和全节点响应；该证明方案“is planned” | [2] core-concepts/state-db.md:L102；[7] developers/json_rpc/newl1-api-list.md:L53 | observed | F16 |
| P39 | snap sync 不存在（计划用检查点累加器同步替代），整状态 debug 读取（debug_dumpBlock 等）返回 `-32004` | [2] core-concepts/state-db.md:L106–107 | observed | F16 |
| P40 | 共识最终性用 BLS 聚合投票（⌈2N/3⌉），与 BSC 同构；文档和 BEP-126 都没写明 BLS 曲线 | [5] core-concepts/consensus.md:L24、L29；[20] BEP126.md | observed | Q |
| P41 | 交易签名方案为 secp256k1、P256（secp256r1）、WebAuthn，由 SignatureVerifier 预编译验证 | [6] core-concepts/account-abstraction.md:L61–63；[4] governance/system-contracts.md:L23 | observed | Q |
| P42 | NIST 认定 ECDSA、EdDSA 及基于 ECC 的方案对 Shor 算法脆弱 | [19] NIST IR 8547 ipd §2.1.1 | observed | Q、F14 |
| P43 | New L1 现有签名和证明组件（BLS、secp256k1/P256/WebAuthn、ECDSA auth proof、BN254 PLONK）都是经典椭圆曲线密码，都不是 PQ；PQ 只以“预留的 PQ 授权方案（未实现）”的形式出现在文档中 | 由 P5、P6、P23、P40、P41、P42 推出：这些组件都依赖椭圆曲线离散对数 | inferred | Q、F14 |
| P44 | 路线图的 “Post-Quantum Readiness” 是 BNB Chain 全栈研究：测试在现有密码学上叠加抗量子保护的混合方案，并研究用 AA 在不换地址的情况下升级 | [12] bnbchain.org H2 2026 roadmap blog（2026-07-08，访问于 2026-10-24），“Post-Quantum Readiness” 一节 | observed | F14 |
| P45 | 路线图 New L1 一节把 LtHash 写成性能手段（“100K+ TPS through … LtHash-based storage”），没有称其为 PQ；媒体标题 “Quantum Future” 对应的是全栈 PQ 研究段落 | [12] roadmap blog，“A New L1 Takes Shape” 与 “Post-Quantum Readiness” 两节；[21] Decrypt 2026-07-08 标题 | observed | F14 |
| P46 | 路线图宣传 “Native Privacy … with selective disclosure for compliance”，但文档的合规钩子“only an interface seam, no verifier and no call site”，选择性披露尚未落地 | 由 P23 与 [12] roadmap blog “Native Privacy” 条对照推出 | inferred | F13、S |
| P47 | 官方称完整的 shielded-pool 流程已在源码构建的 devnet 上跑过，但整个网络仍是内部多验证者 devnet，没有公共 testnet 或 mainnet | [10] overview.md:L67、L69；[9] faq.md:L18 | observed | |
| P48 | `privDeposit` 的 `scheme`（uint8）参数可能就是给 PQ 授权方案预留的位置 | [3] developers/transaction-types.md:L77–78 只出现 `$SCHEME`，没有说明含义 | speculative | S |
| M1 | 以 D = 1 到论坛初步给出的 8 块计，区块 N 的执行最终落在 N+3 到 N+10 块之后，约 0.6–2 s（推算，按常见情况承诺块 +2 块最终化，未实测） | 由 C29、C34、X6 推出：结果写进 N+D 块，N+D 块再 +2 块最终化；(D+2) × 200 ms = 0.6 s（D=1）到 2.0 s（D=8） | inferred | J |
| M2 | 累加器每块归档一行 2 KB，200 ms 出块下约 0.9 GB/天；目前全量保留，按回执保留期裁剪是“scheduled follow-up” | newl1-docs@ef5a632/core-concepts/state-db.md:L96 | observed | F16 |
| M3 | 协议原生、签名方案固定的 Tempo 式 AA 交易（0x76 schema）已有两条链采用（Tempo 主网、New L1 devnet），EIP-8130 走的是可插拔验证器路线 | 由 A34–A37、A43、A46 推出 | inferred | R |
| M4 | 把执行移出共识关键路径的链，都要处理“按滞后状态接纳交易”带来的白嫖问题：New L1 用按声明 gas 收费加在途花费上限，Monad 用 reserve balance | 由 X12–X16 推出 | inferred | F4、R |
| M5 | New L1 的 Multi-Lane 与前文 application-specific-sequencing 建议的“外层按类别分配容量”处在同一层；New L1 没有“内层按类别选排序规则”这一部分 | 由 X41、X44、X45、X50 与前文 application-specific-sequencing 的 F6、F11 推出 | inferred | R |
| M6 | New L1 的 SubBlock 预确认与前文所述 Mantle 的 FIFO preconf 车道一样，都由出块方单方给出，不由共识保证 | 由 C20、C21、C23 与前文 application-specific-sequencing 的 F9 推出 | inferred | R |
| M7 | 采用 LtHash16（1024×u16）参数的链需要针对自己的条目编码给出“碰撞集合构不成合法状态”的论证，不能只引用 ~128-bit 或 SIMD-0215 | 由 P32、P33、P34 推出：2^81 攻击针对参数本身；Solana 的反驳依赖它自己的账户编码与 lamports 上限 | inferred | F15、R |
| M8 | 路线图的 Account Abstraction Suite 列出 Gas sponsorship、GasToken、transaction batching、scheduled execution、passkey signing、access key control | H2 2026 路线图 “A New L1 Takes Shape” 一节原文（主会话 2026-10-24 抓取核对） | observed | S |
| M9 | 路线图里的 GasToken 在文档中只以 token_fee（代付人收代币补偿）出现，没有 Tempo 式 fee_token；“scheduled execution”在 AA 文档中只对应 valid_after / valid_before 有效期窗口 | 由 M8、A22、A26、A39 推出 | inferred | S |
| M10 | 外部调研（ChatGPT）的主要偏差：把上限 64 写成目标、把 20 ms 当已确认行为、把 AA 写成四层、把 token_fee 写成事后偿还、低估与 Tempo 的相似、没提 LtHash16 的 2^81 攻击 | 汇总 notes.md“资料中被修正的地方”第 1–6 条（C31、C11、A49、A23、A34–A37、P33） | observed | T |
| M11 | New L1 的各项新能力都有现成同类（Tempo 的 0x76、Monad / EIP-7886 的延迟执行、Solana 的 LtHash、Railgun 的隐私调用、BSC 的 Payment Lane）；与同类差别最大的是“只对顺序投票 + 自适应执行延迟 D” | 由 X20、X36、A37、P32、P25、X48 推出 | inferred | |
| M12 | New L1 文档描述传统链把执行与共识交织：提案带执行后的 state_root，leader 先执行再提案，每个验证者重执行后才投票 | newl1-docs@ef5a632/core-concepts/async-execution.md:L7 | observed | |
| M13 | BNB Chain 官方推文（2026-07-08）列出新 L1 目标：100K+ TPS、sub-50 ms 预确认、sub-1-second 区块最终性、无 public mempool、关键交易预留 lane、原生隐私与 AA，testnet 计划年底 | https://x.com/BNBCHAIN/status/2074826228046213442（主会话经 fxtwitter API 读取原文，2026-10-24） | observed | |

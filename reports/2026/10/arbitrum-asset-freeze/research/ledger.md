# 论断台账

每条会出现在 explainer 里的论断，都要在这里有一行。
类型：observed（直接观察到，有一手证据）/ inferred（由证据推出）/ speculative（推测，需在页面上标明）。

本表合并五个分册的台账（2026-10-07）。前缀对应分册：M = [notes-mechanism.md](notes-mechanism.md)（机制与背景），T = [notes-tx.md](notes-tx.md)（交易解析，主会话），V = [notes-views.md](notes-views.md)（社区观点），P = [notes-precedents.md](notes-precedents.md)（各链先例），O = [notes-mantle.md](notes-mantle.md)（Mantle 适用性，主会话），G = 主会话写稿时的综合论断。证据里的 `[n]` 指该分册“来源”一节的第 n 条。

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| M1 | 标准 `AbsInbox.sendUnsignedTransaction` 把 `msg.sender` 作为消息 sender 入队，调用者不能指定 L2 发送者 | nitro-contracts/src/bridge/AbsInbox.sol#L162-L188@ff6334e [1] | observed | I、J |
| M2 | ETH 原生 `Inbox._deliverToBridge` 对所有 sender（EOA 和合约）统一做 `applyL1ToL2Alias` 后再交给 Bridge | nitro-contracts/src/bridge/Inbox.sol#L317-L326@ff6334e [2] | observed | I |
| M3 | alias 偏移量是 `0x1111000000000000000000000000000000001111`，按 2^160 取模相加 | AddressAliasHelper.sol#L8-L20@ff6334e [3]；docs l1-to-l2-messaging [23] | observed | I |
| M4 | EOA/合约的区分只用于 `depositEth` 的目的地址和 retryable 的 refund 地址 | Inbox.sol#L202-L214、AbsInbox.sol `_createRetryableTicket` [1][2] | observed | |
| M5 | `*ToFork` 系列（undo alias）只能在 chainId 变化后由 EOA 调用 | Inbox.sol#L109-L111、L143-L145 [2] | observed | |
| M6 | 标准实现下，L1 调用者在 L2 只能以 alias(自己) 的身份发 unsigned tx；要以普通 EOA X 的身份发，必须改 Inbox 代码 | 由 M1、M2、M3 推出：From = Poster = alias(L1 caller)，要让 alias(c)=X 必须控制 c = X−OFFSET 的私钥，实际做不到 | inferred | J |
| M7 | Bridge 入队只检查调用者是不是 allowlist 里的 Inbox 地址，不检查 Inbox 的实现代码 | AbsBridge.sol#L149-L169@ff6334e [5] | observed | I、J、F1 |
| M8 | delayed message 以 `keccak(prevAcc, keccak(kind,sender,block,ts,seq,baseFee,dataHash))` 累加进 `delayedInboxAccs` | AbsBridge.sol#L171-L192；Messages.sol [5] | observed | I |
| M9 | `forceInclusion` 要求消息所在 L1 区块 + delayBlocks_ < 当前区块，并校验累加器原像 | SequencerInbox.sol#L292-L310@ff6334e [6] | observed | I |
| M10 | Arbitrum One 当前 force inclusion 延迟最大约 1 天（7,200 个 L1 区块），delay buffer 可把下限降到 150 个区块 | L2BEAT 风险表 "1 day, 150-7,200 L1 blocks" [21]；docs sequencer "delayBlocks … 24 hours … threshold 150" [22] | observed | I |
| M11 | Sequencer 只决定排序和收录，不决定执行结果；delayed message 由 DelayedSequencer 在 L1 finalize 后纳入 | docs sequencer 原文 "it does not decide execution outcomes" [22] | observed | |
| M12 | `L1IncomingMessage` header 包含 Kind、Poster、L1 区块号、时间戳、RequestId、L1BaseFee | arbostypes/incomingmessage.go#L51-L58@ccc5c82 [8]；docs STF [24] | observed | I |
| M13 | `Kind=3/L2Kind=0` 派生 `ArbitrumUnsignedTx`，`From` 直接取 header 的 Poster | parse_l2.go#L121-L126、L244-L255@ccc5c82 [8] | observed | I、J、F1 |
| M14 | `Kind=12` 派生 `ArbitrumDepositTx`，`Kind=9` 派生 `ArbitrumSubmitRetryableTx`，`Kind=7` 派生 deposit + unsigned/contract tx | parse_l2.go#L37-L72、L277-L297 [8] | observed | |
| M15 | 通过 SignedTx 路径提交类型号 ≥ 0x64 的 Arbitrum 内部交易会被拒绝 | parse_l2.go#L171-L175 [8] | observed | |
| M16 | 交易类型号：Deposit 0x64、Unsigned 0x65、Contract 0x66、Retry 0x68、SubmitRetryable 0x69、Internal 0x6A | go-ethereum core/types/transaction.go#L47-L54@260bc5d [9] | observed | |
| M17 | `arbitrumSigner.Sender` 对 Unsigned/Contract/Deposit/Retry/SubmitRetryable 直接返回 `inner.From`，不做签名恢复 | go-ethereum core/types/arbitrum_signer.go#L39-L52 [9] | observed | I |
| M18 | `ArbitrumUnsignedTx` 的 `skipNonceChecks` 和 `skipTransactionChecks` 都是 false；Contract/Deposit/Retry/SubmitRetryable/Internal 都是 true | arb_types.go#L61-L81@260bc5d [9] | observed | I、F4 |
| M19 | `buyGas` 要求 From 余额 ≥ gasLimit×GasFeeCap + value，`preCheck` 在不跳过时校验 nonce | state_transition.go#L471-L498、L520-L527@260bc5d [10] | observed | I、F4 |
| M20 | 冻结交易的 value 比公告余额少 0.0001 ETH，与 buyGas 预留 gasLimit×feeCap 一致（字段值需交易解析 lane 核对） | 由 M19 和外部调研给出的 gasLimit=100,000、feeCap=1 gwei 推出：value ≤ 余额 − 0.0001 ETH | inferred | |
| M21 | OSP 读取 delayed message 时只校验消息哈希能否接上 `bridge.delayedInboxAccs(msgIndex)` | OneStepProverHostIo.sol#L398-L423@ff6334e [7] | observed | I、J、F1 |
| M22 | 升级后的 Inbox（代理地址不变）写入的冒充 sender 消息，对 STF 和 BoLD 来说是合法输入，证明系统不会拦截 | 由 M7、M8、M21 推出：Bridge 只认地址，OSP 只认累加器，二者都不校验写入逻辑 | inferred | J、F1 |
| M23 | Security Council 通过"升级 Inbox → 用 `sendUnsignedTransactionOverride` 冒充 sender 转账 → 恢复实现"完成冻结 | 论坛 30803 #1 原文 "upgrade the inbox contract … impersonate the transaction sender" [19] | observed | 导语、J、F1 |
| M24 | 交易 0x0799… 中 Inbox 实现从 0x7C058…0a10 切到 0x980D1F…A859 再切回 | L2BEAT Inbox 升级记录 2026-04-21 03:26 UTC [21] | observed | |
| M25 | 2026-06-15 的资金释放用了同一种 Inbox 临时升级机制 | L2BEAT 2026-06-15 Inbox 升级记录和 "SpoofL2TxAction mechanism" 描述 [21] | observed | |
| M26 | L1 紧急升级链路：SC Safe 0xF06E…3F85（9/12）→ UpgradeExecutor 0x3ffF…CeDd → ProxyAdmin 0x5547…2dbD → Inbox 0x4Dbd…AB3f，无延迟 | L2BEAT 权限章节 [21] | observed | 总览 A、I |
| M27 | 常规升级路径经 L2 Timelock 8 天 + 挑战期 6 天 8 小时 + L1 Timelock 3 天，合计约 17 天 8 小时 | L2BEAT 权限章节 [21] | observed | I |
| M28 | 宪法规定 Security Council 12 人，紧急和非紧急行动都需要 9-of-12 | dao-constitution Section 3 原文 "9-of-12 approval" [20] | observed | I |
| M29 | 紧急行动只能用于 "true security emergency"，事后必须发 "full transparency report" | dao-constitution Section 3 [20] | observed | I |
| M30 | brief 中"非紧急 7/12"与宪法和 L2BEAT 不符 | 由 M28 和 L2BEAT "non-emergency (9/12…)" [21] 推出 | inferred | |
| M31 | One/Nova 的 chain owner 权限授予 DAO 和 Security Council；ArbOS chain owner 包括 L2UpgradeExecutor | dao-constitution Section 1 [20]；L2BEAT "chain owners … on the L2UpgradeExecutor" [21] | observed | |
| M32 | ArbOS 60 Elara AIP 于 2026-03-05 发布，6 月 19 日因 STF 退款 bug 改为 ArbOS 61，范围不变 | 论坛 30601 #1 [18] | observed | F2、L |
| M33 | ArbOS 61 链上投票 2026-07-16 至 07-30 通过，2026-08-20 17:00 UTC 在 One/Nova 激活 | docs arbos61 "Activation" [17] | observed | 总览 E、F2、L |
| M34 | 官方明确 compliance filtering 在 Arbitrum One/Nova 上 "intentionally disabled" | docs arbos61 [17]；AIP #1 "will not be enabled on Arbitrum One or Nova" [18] | observed | 总览 C、F2、L |
| M35 | 启用 filtering 需要 chain owner 调用 ArbOwner 设定生效时间，且必须 ≥ 当前 + 7 天 | ArbOwner.go#L56、L103-L139@ccc5c82 [12]；论坛 30601 #20 [18] | observed | L |
| M36 | 只有在 filtering 生效时间到达后，chain owner 才能 `AddTransactionFilterer` | ArbOwner.go#L184-L198 [12] | observed | |
| M37 | 预编译 `ArbFilteredTransactionsManager` 地址为 0x74，只有 TransactionFilterers 成员能增删 hash，非成员调用会 BurnOut | ArbFilteredTransactionsManager.go#L15-L62@ccc5c82 [11]；arbitrum_signer.go#L27 [9] | observed | L |
| M38 | 已登记 hash 的普通交易在 STF 中 nonce+1、耗尽剩余 gas、跳过执行 | tx_processor.go#L1089-L1105@ccc5c82 [13] | observed | L |
| M39 | 已登记 hash 的 `ArbitrumDepositTx`，资金会被转给 `FilteredFundsRecipient`（默认 networkFeeAccount）而不是原收款人 | tx_processor.go#L245-L267 [13]；ArbOwner.go#L226-L233 [12] | observed | F6 |
| M40 | 已登记的 retryable 提交，FeeRefundAddr 和 Beneficiary 被改成 recipient，并跳过 auto-redeem | tx_processor.go#L285-L306 及 isFiltered 分支 [13] | observed | F6 |
| M41 | 官方文档说被过滤 deposit 的 "credit is dropped"、ETH 可能锁在桥里，与代码中的资金改道行为不一致 | 由 M39 与 compliance-filtering 文档原文 [16] 对比推出 | inferred | F6 |
| M42 | Sequencer 层过滤会在排序前模拟交易，依据 `sha256(salt‖address)` 哈希表和事件规则拒收 | compliance-filtering 文档 [16]；block_processor.go 的 TxFilter/BlockFilter 接口 [14] | observed | L |
| M43 | delayed message 的过滤路径是：delayed sequencer 过滤 → transaction-filterer 服务 → 0x74 登记 → STF 失败 | CHANGELOG v3.10.0/rc.1/rc.3 NIT-5012 条目 [15]；tx_processor.go 注释 "delayed sequencer can advance past it" [13]；文档 sentinel 描述 [16] | observed | L |
| M44 | filtering 总开关 `TransactionFiltering.Enable` 默认 false | CHANGELOG v3.10.2 "master switch (default false)" [15] | observed | |
| M45 | 外部调研提到的"过滤状态在交易间泄漏"修复对应 v3.11.0-rc.2，属于 sequencer 层 | CHANGELOG v3.11.0-rc.2 "Sequencer no longer rejects clean transactions following a filtered one" [15] | observed | |
| M46 | burn 例外：Transfer 的 to 为 0x0 时即使 from 受限也放行，但受限地址本人作为 tx.origin 仍被拦 | compliance-filtering 文档 "Exception rules" [16] | observed | |
| M47 | ArbOS 61 filtering 不能冒充用户发起交易，只能让交易失败或改道资金；KelpDAO 机制能冒充 sender | 由 M37、M38、M39 与 M23 对比推出 | inferred | F2、L |
| M48 | 用户记忆中的"ArbOS 升级引入的 sequencer 级操作"对应 ArbOS 61 Compliance Filtering，而不是 KelpDAO 冻结机制 | 由 M23、M33、M34 推出：冻结发生在 2026-04-21，ArbOS 61 于 2026-08-20 才激活，且在 One 上未启用 | inferred | 导语、F2 |
| M49 | 冻结发生时 Elara 提案（含 compliance filtering）正处于论坛讨论和链下投票阶段，可能是用户记忆错位的来源 | 由 M32 和 L2BEAT 2026-04-14 投票帖 [18] 推出 | speculative | F2 |
| M50 | L2BEAT 治理团队认为把 filtering 放进核心栈可能影响 Stages 框架，只要在 One/Nova 上保持禁用就不构成阻碍 | 论坛 30601 #16 krst 原文 [18] | observed | |
| M51 | 干预层①（sequencer 拒收）可以被 force inclusion 在约 1 天后绕过 | 由 M9、M10、M11 推出 | inferred | 总览 C |
| M52 | 干预层②（STF 规则）不能被 force inclusion 绕过，因为规则在 STF 里对 delayed 交易同样生效 | M38；compliance-filtering 文档 "Force inclusion protection" [16] | observed | 总览 C |
| M53 | 干预层④（改输入入口）不需要改证明程序 | 由 M21、M22 推出 | inferred | |
| M54 | 干预层⑤（硬分叉改状态）需要新的 STF/WASM 模块根，权力属于 chain owner（DAO 或 SC 紧急行动） | AIP #1 "ArbOS upgrade … equivalent of a hard fork" [18]；宪法 "execute any software upgrade" [20]；由此推出需要改证明程序 | inferred | 总览 C |
| M55 | 原生 ETH 没有资产合约层的冻结能力，只能走层①②④⑤ | 由 M17、M19 推出：ETH 是账户余额，转账不经过任何 token 合约 | inferred | 总览 C |
| M56 | 论坛公告的 "11:26pm ET, 21st April" 与 L1 区块时间 2026-04-21 03:26:47 UTC（美东 4 月 20 日）不符 | 论坛 30803 #1 [19]；brief 已知事实的区块时间；UTC−4 换算 | inferred | |
| M57 | Arbitrum One 当前的 ArbOS v61 wasmModuleRoot 是 0xc10cd7ec…dc97 | docs arbos61 [17]；L2BEAT Program Hashes [21] | observed | |
| T1 | L1 冻结交易位于区块 24925592，时间 2026-04-21 03:26:47 UTC，执行成功 | [1]；[2] | observed | 总览 E、K |
| T2 | 顶层调用是 Security Council Safe 0xF06E…3F85 的 execTransaction，以 delegatecall 调 MultiSendCallOnly | [1] 解码 execTransaction 参数 | observed | 总览 A、K |
| T3 | 这笔交易带 9 个签名（585 字节 = 9×65），Safe 当前 threshold 为 9、owners 12 | [1] signatures 长度；[6] getThreshold / getOwners | observed | 总览 D、K、F3 |
| T4 | MultiSend 第一步通过 Multicall3 调 CREATE2 部署器，现场部署补丁 Inbox 实现 0x980D…A859 和 SpoofL2TxAction 0x3d456…a322 | [2] trace index 3–7 | observed | K |
| T5 | MultiSend 第二步调用 UpgradeExecutor.execute，后者 delegatecall SpoofL2TxAction.execute | [2] trace index 8–10；[1] 解码 | observed | 总览 A、K |
| T6 | ProxyAdmin 的 owner 是 UpgradeExecutor；UpgradeExecutor 的 EXECUTOR_ROLE 授予 Security Council Safe 和 L1 Timelock | [6] owner() / hasRole() 当前值 | observed | 总览 A、K |
| T7 | SpoofL2TxAction.execute 依次执行：读当前实现 → 升级 Inbox 到补丁实现 → 调 sendUnsignedTransactionOverride → 升级回原实现 | [5] 已验证源码；[2] trace 11–20 与 logs 4、7 | observed | 总览 A、K、F3 |
| T8 | action 参数：gasLimit 100,000、maxFeePerGas 1 gwei、nonce 0、to 0x…0DA0、value 30,765.667401709008927568 ETH、data 空、from 0x5d39…7Ccc | [1] 解码 UpgradeExecutor.execute 内层 calldata | observed | 总览 B、总览 D、K |
| T9 | 补丁实现相对原实现只改两处：sendUnsignedTransactionToFork 改为 revert；新增 sendUnsignedTransactionOverride，用参数 from 替代 msg.sender，并去掉 fork/EOA 检查 | [3][4] 已验证源码 diff；AbsInbox.sol 两版相同 | observed | 总览 B、K |
| T10 | 补丁函数除 onlyAllowed（allowlist 关闭）和 whenNotPaused 外没有访问控制，注释写明不原子执行会让 bridge “fully drainable by anyone” | [4] 源码与注释 | observed | 总览 B、K、F3 |
| T11 | 补丁函数先 undoL1ToL2Alias(from)，_deliverToBridge 再 applyL1ToL2Alias，所以 Bridge 记录的 sender 等于 from | [4] Inbox.sol _deliverToBridge；[2] MessageDelivered.sender = 0x5d39…7Ccc | observed | K |
| T12 | 入队的是 delayed message #2416814，kind 3（L2_MSG），messageDataHash 0x62f5e672…8d1c | [2] log 5 | observed | K |
| T13 | 消息数据为 0x00 ‖ gasLimit ‖ maxFeePerGas ‖ nonce ‖ to ‖ value，共 161 字节，keccak 与链上 messageDataHash 一致 | [2] log 6；本地 cast keccak 复算 | observed | K |
| T14 | 补丁调用以 amount=0 入队，L1 没有向 Bridge 存入 ETH，L2 转出的 ETH 来自攻击者已有余额 | [4] `_deliverMessage(..., 0)`；[2] 所有内部调用 value 为 0 | observed | 总览 B、K、F4 |
| T15 | 冻结交易结束后 Inbox 代理指回原实现 0x7C05…0a10，至今未变 | [2] log 7；[6] cast implementation | observed | K、F3 |
| T16 | L2 交易在 Arbitrum One 区块 454686044 执行，时间 03:35:08 UTC，类型 0x65，v/r/s 全为 0，nonce 0 | [7] eth_getTransactionByHash | observed | K |
| T17 | L2 交易是空 calldata 的原生 ETH 转账，gasUsed 21,000，无事件，effectiveGasPrice 0.020064 gwei | [7] receipt | observed | K |
| T18 | L1 入队到 L2 执行相隔 501 秒（8 分 21 秒） | 由 T1（时间戳 1776742007）和 T16（1776742508）推出 | inferred | 总览 D |
| T19 | 交易 value 比公告金额少 0.0001 ETH，正好等于 gasLimit × maxFeePerGas，这是 buyGas 要求预留的最大 gas 预算 | 由 T8、[10] 公告金额与 M19 推出 | inferred | K、F4 |
| T20 | 攻击者地址当前余额 0.000099578656 ETH，等于 0.0001 − 实际手续费 0.000000421344 ETH，nonce 为 1，说明冻结后该地址没有再发生任何余额变动 | [6] cast balance / nonce；由 T17 计算 | inferred | K、F5 |
| T21 | 2026-06-15 的 L1 释放交易 0xc2e247e5… 由 L1 Timelock 的 executeBatch 发起，复用同一个 SpoofL2TxAction 和同一个补丁实现 | [8] trace | observed | 总览 E、F5 |
| T22 | 6 月 L2 交易 0x09795deb… 同为 0x65 类型，从 0x…0DA0 向 0x3b87…6C07 转 30,765.617401709008927568 ETH，预留 0.05 ETH gas | [7] | observed | F5 |
| T23 | 6 月释放走的是常规宪法治理路径（L1 Timelock），冻结走的是 Security Council 紧急路径（无延迟） | 由 T2、T21 与 M26、M27 推出 | inferred | F5 |
| T24 | 0x…0DA0 当前余额等于 0.05 ETH 减 6 月交易手续费，6 月之后没有变动 | [6] cast balance；由 T22 gasUsed × effectiveGasPrice 计算 | inferred | F5 |
| T25 | 自区块 24,000,000 起，Inbox 代理只发生过 4 次 Upgraded，全部属于 4 月和 6 月这两笔交易 | [8] Blockscout getLogs | observed | 总览 C、F5 |
| T26 | 0x…0DA0 没有私钥可用，资金只能再次通过治理升级 Inbox、以它为 sender 才能转出 | 由 T21、T25 推出：唯一一次转出就是用同一机制完成的；0xDA0 是低位地址，不对应任何已知私钥 | inferred | F5 |
| T27 | 官方论坛说明称技术方案是“原子地升级 inbox、冻结资金、恢复原实现”，并由 Arbitrum contributors 准备 payload、Council 验证后签名 | [10] 论坛 30803 #1 | observed | H |
| T28 | 4 月和 6 月之间 Bridge 实现地址发生过变化（0x93e8f923… → 0xfE474906…），原因未查 | [2] trace index 18；[8] trace index 12 | observed | K |
| V1 | KelpDAO rsETH 于 2026-04-18 17:35 UTC 被解锁 116,500 rsETH（约 2.92 亿美元） | [26] LayerZero 报告 §2.3 时间线 | observed | 总览 E、H |
| V2 | CrowdStrike 和 Mandiant 以 high confidence 将攻击归因于 DPRK，以中等置信度归到 UNC4899/TraderTraitor；Tay 等研究者也做了同样归因 | [26] §2.1 | observed | |
| V3 | Arbitrum 官方称 Council "acted with input from law enforcement as to the exploiter's identity" | [5] 官方 X 帖原文 | observed | |
| V4 | 官方 X 写 "April 20 11:26pm ET"，论坛帖写 "11:26pm ET, 21st April 2026"，两者日期相差一天 | [5]；[1]#1 | observed | |
| V5 | 由 V4 推出：论坛帖日期写错，X 帖正确 | 由 V4 和已知 L1 时间 03:26:47 UTC 推出：03:26 UTC 4-21 等于 23:26 EDT 4-20 | inferred | |
| V6 | Aave Labs 等五方于 2026-04-25 提出释放 AIP，附对 Foundation、Offchain Labs 和 Council 成员的无上限赔偿承诺 | [2]#1 | observed | F8 |
| V7 | Snapshot 温度检查从 2026-04-30 18:54:51 到 05-07 18:54:51 UTC；For 182,176,773 ARB、Against 1,738、Abstain 18,102,392；1,693 票 | [3] GraphQL 返回 | observed | F7 |
| V8 | 温度检查 For 占 90.96%，Abstain 占 9.04% | 由 V7 推出：182,176,773 / 200,280,903 = 0.9096 | inferred | 总览 D、F7 |
| V9 | 判决债权人律师 Gerstein 向"Arbitrum DAO"送达限制令，称 0x…0DA0 余额属于 DPRK（含 Lazarus）有权益的财产 | [2]#22 | observed | 导语、总览 E、F8 |
| V10 | SDNY 2026-05-08 命令允许链上投票，把资产转给 Aave LLC，参与投票者不算违反限制令，其余事项保留 | [4] Doc 52 第 1–4 段 | observed | 总览 E、F8 |
| V11 | 修订版 AIP 把收款方改为 Aave LLC 地址 0x3b87…6C07，并声明不授权在受限期间分配资金 | [2]#37 | observed | |
| V12 | 2026-06-15 Foundation 宣布提案已执行，约 30,765.6 ETH 转给 Aave LLC | [2]#56 | observed | |
| V13 | 链上 AIP 的票数在本次调研中没有拿到 | [35] Tally 页面无票数；alt.gov 页面是 JS 渲染 | observed | P |
| V14 | Goldfeder（Offchain Labs）在采访中说 "The DAO cannot be consulted… that essentially means North Korea is consulted" | [19] CoinDesk 采访转述 | observed | M |
| V15 | Goldfeder 称 "We're no more or less decentralized today than we were yesterday" | [19] | observed | |
| V16 | McCorry（Arbitrum Foundation）强调 Council 透明、由选举产生，"not hand-picked by us" | [19]；[7] | observed | M |
| V17 | Council 成员 Griff Green 用 "all it takes for evil to triumph is for good men to do nothing" 解释决定 | [6] | observed | M |
| V18 | Griff Green 在采访中称 "things are not immutable. It's always run on social consensus" | [20] Coinage 采访转述 | observed | |
| V19 | mert（Helius CEO）辩护说 Arbitrum 是 Stage 1，有控制手段却不用才更糟 | [9] | observed | M |
| V20 | maxlomu 指出 "ETH was moved on Arbitrum without the user's consent"，并称这一先例影响中立性 | [1]#3 | observed | M |
| V21 | Robby Greenfield 认为这项能力 "not scoped to recovery"，是嵌在升级权限里的通用权力 | [1]#4 | observed | M |
| V22 | MconnectDAO 要求制定 Emergency Action Policy，称 "Governance shouldn't rely on luck" | [1]#6 | observed | M |
| V23 | 论坛 30803 的 6 条社区回复全部肯定结果，其中 3 条附带框架或先例方面的担忧 | [1]#2–#10 逐楼阅读 | observed | M、F7 |
| V24 | dzack23 指出 Council 介入的是与 Arbitrum 协议漏洞无关的外部事件 | [2]#12 | observed | F9 |
| V25 | dzack23 认为再用紧急行动加快释放会违宪，并开创很坏的先例；Mihal 同样反对 | [2]#15、#16 | observed | |
| V26 | 宪法规定紧急行动需要 9/12 批准，且只能用于影响 Arbitrum 治理链的 "true security emergency" | [25] Section 3 | observed | F9 |
| V27 | 宪法要求紧急行动后发布 "full transparency report" | [25] Section 3 | observed | F9 |
| V28 | 截至 2026-10-07，没有找到本次行动的专门透明度报告 | [36] 论坛搜索首页结果 | speculative | F9 |
| V29 | 这次冻结是对宪法紧急条款的宽泛解释（外部协议漏洞而非链本身漏洞） | 由 V24、V26 推出：触发事件不属于宪法例举的"chain governed by ArbitrumDAO 的关键漏洞" | inferred | F9 |
| V30 | L2BEAT 治理团队称 "this isn't a neutral situation"，并追问 "Why this case and not others" | [22] | observed | M |
| V31 | L2BEAT 认为修订路径不构成 "governance being forced by external legal pressure" | [2]#51 | observed | |
| V32 | L2BEAT 把 Arbitrum One 评为 Stage 1；Council 9/12 可无延迟升级；紧急路径没有退出窗口 | [24] | observed | |
| V33 | L2BEAT Stage 1 框架允许存在 Security Council（≥75% 门限） | [23] | observed | |
| V34 | "Stage 1 允许 Council"这条反驳在定义上成立，但同时意味着紧急路径对用户没有退出窗口 | 由 V32、V33 推出：Stage 1 只要求非 Council 升级有 ≥7 天退出窗口 | inferred | |
| V35 | Farside Insights 借此嘲讽 L2BEAT 的退出窗口颜色 | [11] | observed | |
| V36 | X 上有批评者称此事证明 "almost nothing in crypto is truly decentralized" 或违背 DAO 本义 | [12]；[13] | observed | M |
| V37 | 有匿名用户称 Arbitrum 是 "a multisig wallet that can unilaterally freeze and steal funds" | [31] 二手转引，未找到原帖 | speculative | |
| V38 | CoinDesk 当作批评者引用的 @xch_chris 只有约 81 粉丝，帖子 49 次浏览 | [15] fxtwitter 元数据 | observed | M |
| V39 | KelpDAO 官方公开感谢 Council，并提到 SEAL 911 参与协调 | [8] | observed | |
| V40 | Aave 方面主张 "a thief does not gain lawful ownership of stolen property" | [2]#34 | observed | M |
| V41 | 判决债权人一方据报道主张这是欺诈而非盗窃，攻击者取得了所有权 | [21] CoinDesk 转述 | observed | |
| V42 | 律师 Gabriel Shapiro 认为限制令具有约束力，DAO 应先诉讼，而不是自行决定 | [16] | observed | M |
| V43 | MegaETH 的 PaperImperium 称 "the Arbitrum Security Council was not kind to the DAO"，理由是冻结让 DAO 暴露于债权人追索 | [17] | observed | M |
| V44 | TID Research 在温度检查中因法律风险投弃权，法院命令后转为 FOR | [2]#24、#40 | observed | |
| V45 | 多名代表要求把 DAO 代表直接列为被赔偿方 | [2]#5、#6、#7、#18、#26、#32 | observed | F8 |
| V46 | 冻结后不到两周，资产就受美国法院限制令约束，最终流向需要法院许可 | 由 V9、V10、V12 推出：04-21 冻结，05-01 送达限制令，05-08 命令，转给 Aave LLC 后仍受限制 | inferred | F8 |
| V47 | 多名代表事后要求制定常设的冻结资产处置政策 | [2]#17、#54；[2]#7 第 9 点 | observed | |
| V48 | Bankless 分析认为有冻结能力就有道义责任行动，但这种能力会招来监管 | [28] | observed | |
| V49 | Entropy 指出弃权票也计入法定人数，想置身事外只能不投票 | [2]#19 | observed | |
| V50 | 温度检查的 90.96% 不能直接解读为公众认可冻结能力（投票对象是释放资金，投票者是 DAO 参与者，存在选择偏差） | 由 V7、V49 和 Snapshot 提案标题推出：投票内容是 "Approve Release of Frozen ETH" | inferred | F7 |
| V51 | 本样本 33 条观点中，利益相关方（Offchain Labs、Foundation、Council、Kelp、Aave）全部支持 | §2 表 O1–O5、O22 逐条对照 [5][6][7][8][19][2]#34 | observed | M、F7 |
| V52 | 没有找到 FBI 关于此案的公告，也没有找到 ZachXBT 对冻结本身的评论 | DuckDuckGo 检索结果；[32] 只有洗钱追踪 | speculative | P |
| V53 | 2026-05-24 Council 另一次紧急行动修复的是治理合约漏洞（L1 Timelock renounceRole），属于协议漏洞类的典型用途 | [27] | observed | |
| V54 | Griff Green 在采访中称 DAO 不会释放资金，"unless 100% of it goes straight into users hands"；实际资金转给了受限制令约束的 Aave LLC | [20]；[2]#56；[4] | observed | |
| P1 | The DAO 硬分叉在第 1920000 块执行不规则状态变更，把约 1200 万 ETH 划入 WithdrawDAO 恢复合约 | [4] EF Blog “Hard Fork Completed” | observed | N |
| P2 | The DAO 分叉时约 85% 矿工跟随新链，旧链继续存在 | [4] “roughly 85% of miners mining on the fork”；`--oppose-dao-fork` | observed | N |
| P3 | EIP-999 提议恢复 0x863DF6…07b4 处已自毁的 WalletLibrary 代码，状态为 Withdrawn | [5] EIP-999 页面 | observed | N |
| P4 | EIP-999 的 coin vote 结果为 55% 反对、39.4% 赞成 | [6] Cointelegraph 转述（原投票页不可访问） | speculative | N、P |
| P5 | EIP-999 被拒的理由之一是受益方集中（Polkadot 约 306,000 ETH 被锁） | [6] Cointelegraph | speculative | |
| P6 | BSC Token Hub 事件中，BNB Chain 逐个联系验证者让链停下 | [7] BNB Chain 博客 | observed | N |
| P7 | BSC v1.1.15 是硬分叉版本，在客户端中禁止攻击相关地址继续交易 | [8] Release v1.1.15，PR #1109 “nanofork: block exploitation accounts” | observed | N |
| P8 | BNB Chain 曾计划用链上治理投票决定是否冻结被盗资金，结果未核实 | [7] “freeze or not to freeze?” | observed | |
| P9 | Linea 在 Velocore 事件中暂停 sequencer（区块 5081800–5081801 之间）并审查攻击者地址 | [10] Cointelegraph 转引 Linea X 帖 | speculative | N |
| P10 | Matter Labs CEO Gluchowski 公开批评说 sequencer 去中心化“isn’t optional” | [10] Cointelegraph 转引 X 帖 | speculative | N |
| P11 | Hyperliquid 验证者投票下架 JELLY 永续合约，被标记地址不获补偿 | [20] TechFlow 转引 @HyperliquidX | speculative | P |
| P12 | Sui 验证者通过各自节点的配置文件忽略攻击者地址的交易，冻结约 1.62 亿美元 | [3] Chainflow 转引 Sui X 帖；[2] PR 称之为 “address deny list” | observed | N |
| P13 | Sui 恢复升级允许地址 A 的签名以 B 为 sender，只限指定的 TransactionDigest，并绕过 deny list | [2] PR #22237 描述 | observed | N、F10 |
| P14 | Sui 恢复投票按验证者质押加权，排除基金会质押，90.9% 质押支持 | [1] Sui 博客 Update | observed | N |
| P15 | Sui 恢复资金计划转入 4/6 多签信托（Cetus 2 / Sui Foundation 2 / OtterSec 2） | [1] Sui 博客 | observed | N |
| P16 | Sui 验证者 Chainflow 投赞成，但批评投票仓促，并指出基金会委托质押带来的利益冲突 | [3] Chainflow 声明 | observed | |
| P17 | Berachain Prague3 硬分叉冻结 Balancer 攻击者的账户和转账，以及 BEX vault 的使用 | [11] bera-geth v1.011602.6 / v1.011607.0 release notes | observed | |
| P18 | Berachain Prague4 于 2025-11-12 16:00 UTC 撤销 Prague3 的冻结 | [11] bera-geth v1.011607.0 | observed | |
| P19 | Berachain 被盗资金由一名 MEV bot 运营者自愿归还，不是协议强制划转 | [12] Coinpaper 转引 Berachain X 帖 | speculative | P |
| P20 | Gnosis 的 soft fork 让验证者拒绝为移动攻击者余额的区块投票，超过 50% 验证者采纳 | [13] Friederike Ernst 论坛帖 | observed | N |
| P21 | Gnosis 第一版 soft fork 只过滤 from/to，可通过 EIP-7702 授权绕过；11-07 部署第二次 soft fork 修补 | [16] mfw78 论坛帖（利益相关方） | observed | |
| P22 | Gnosis hard fork 于 2025-12-22 激活，以不规则状态转换把攻击者 EOA 的代码替换为受限转发合约 | [14] 激活时间；[15] 规范原文引用 | observed | N |
| P23 | 只按交易顶层 from/to 的地址审查不足以冻结资产；Arbitrum Compliance Filtering 覆盖 CALL/CREATE 和代币转账，范围更宽 | 由 P21、[26] 规则列表推出：Gnosis 的绕过路径正是内部调用 / 授权，而 Arbitrum 的规则明确覆盖这些 | inferred | |
| P24 | Gnosis 回收的资金进入 DAO 控制的 Safe，通过 Merkl 领取页分发 | [15] claim process 帖 | observed | N |
| P25 | Gnosis 大验证者 Serenita 支持 hard fork，但要求事前制定 ground rules，并指出救援 Safe 当时只有单签 | [14] Serenita 论坛帖 | observed | F11 |
| P26 | Flow 验证者在区块 137390190 协调停链，时间在首笔恶意交易后 6 小时内 | [18] Flow post-mortem | observed | N |
| P27 | Flow 通过 HCU 给 Community Governance Council 一个有限治理接口，用来回收和销毁受限账户中的伪造代币 | [18] Phase II 描述 | observed | N |
| P28 | Flow 曾准备回滚到攻击前 checkpoint 的方案，最终选择保留合法历史的 Isolated Recovery | [18] §8 | observed | N |
| P29 | Flow 已销毁 874 亿枚伪造 FLOW，由 Community Governance Council 在链上执行 | [19] Flow 最终更新 | observed | |
| P30 | Flow 承诺事后撤销 Council 的提升权限，是否已执行未核实 | [18] §9 guarantees | observed | |
| P31 | USDC 合约由 blacklister 角色单方面拉黑地址，被拉黑地址的操作会被 revert | [23] Blacklistable.sol | observed | N |
| P32 | Tether 条款保留冻结、拉黑和没收 USDT 的权利 | [24] Tether ToS | observed | |
| P33 | XRPL 发行方可以冻结其发行资产，但 XRP 不可冻结；发行方可以用 No Freeze 永久放弃冻结权 | [21] XRPL 文档 | observed | N |
| P34 | Stellar clawback 要求发行方在 trustline 建立时已设置 AUTH_CLAWBACK_ENABLED_FLAG | [22] CAP-35 | observed | |
| P35 | Arbitrum Compliance Filtering 默认关闭，不打算在 Arbitrum One 使用 | [26] Arbitrum Docs | observed | |
| P36 | ZK Stack 的 ITransactionFilterer 可以按 sender、目标、value、calldata 过滤 L1→L2 交易 | [25] 接口代码；[29] L2BEAT 分析 | observed | |
| P37 | OP Stack 的 user-deposited transactions 由 L1 收据派生、放在 epoch 首块，sequencer batch 不得包含 deposited 类型交易 | [33] Derivation spec | observed | |
| P38 | L2BEAT 判定 Arbitrum One 为 Stage 1，SC 为 9/12，Self sequence 延迟 1 天 | [30] L2BEAT 项目页 | observed | F12 |
| P39 | L2BEAT 认为 Arbitrum One 未达 Stage 2 的原因之一是“SC 的行动不限于链上可证 bug” | [30] Stage 2 issues | observed | F12 |
| P40 | Stage 1 要求 SC 至少 8 人、阈值 75%；SC 以外发起的升级需要退出窗口（规范现为 5 天） | [28] 论坛规范及 changelog | observed | F12 |
| P41 | l2beat.com/stages 页面写的是 7 天退出窗口，与论坛规范 2026-04-30 起的 5 天不一致 | [27] 与 [28] 对比 | observed | |
| P42 | L2BEAT 曾考虑让 Stage 1 的 SC“只修 bug、不处理其他恶意行为”，但明确排除在第一版之外 | [29] 原文 “we decided to exclude this property in this first version” | observed | F12 |
| P43 | KelpDAO 式的 SC 定向划转在 Stage 1 定义下被允许 | 由 P38、P40、P42 推出：Stage 1 只约束 L2→L1 消息与 SC 结构，不限制 SC 的紧急升级用途，Arbitrum 仍被评为 Stage 1 | inferred | F12 |
| P44 | Stage 2 链的 SC 不应具备 KelpDAO 式的即时划转能力 | 由 [28] Stage 2 “SC restricted to act only due to errors detected on chain”、P39 推出：划转攻击者资产不属于链上可裁决的 bug | inferred | F12 |
| P45 | L2BEAT 治理代表认为用冻结资金减损“most reasonable”，同时追问“why this case and not others” | [31] Governance Review #93（L2BEAT 是 Arbitrum delegate） | observed | |
| P46 | 先例中被接受的案例都伴随“范围窄（单地址 / 指定交易）+ 多数背书 + 资金托管透明” | 由 P13–P15、P20、P22、P24、P1–P2 推出：Sui、Gnosis、The DAO 都具备这三点并最终执行 | inferred | F11 |
| P47 | 受益方集中、整链回滚、中心化单方面停链这三类做法遭遇强烈反对或被放弃 | 由 P3–P5（EIP-999 被撤回）、P28（Flow 放弃回滚）、P10（Linea 被批）推出 | inferred | F11 |
| P48 | 即使是获支持的干预，参与者也普遍要求事前规则框架 | 由 P16、P25、P45 及 [15] MichaelRealT 的“strict framework”推出 | inferred | F11 |
| P49 | 在所列先例中，Arbitrum 是唯一不需要验证者 / 节点运营者升级或配合、只靠多签升级 L1 合约完成划转的案例 | 由第 4 节对比表推出：Sui、Gnosis、Berachain、Flow、BSC、The DAO 都需要节点 / 验证者采纳新版本或配置；Arbitrum 由 SC 9/12 升级 L1 Inbox 完成（[30]、[32]） | inferred | F10 |
| P50 | Sui 的“按交易摘要授权的别名”在机制上与 Arbitrum“临时 Inbox override 指定 sender”最接近 | 由 P13 与 [32] 推出：两者都不用私钥，让协议在一次性范围内以攻击者地址为 sender 执行指定交易 | inferred | F10 |
| O1 | Mantle 是 Stage 0 ZK Rollup，链 ID 5000，gas 代币是 MNT | [1] Summary 与 Stage 节 | observed | O |
| O2 | Mantle 交易数据发到 Ethereum blobs，2026-04-16 Arsia 升级后移除了 EigenDA 路径 | [1] Milestones 2026-04-16 | observed | O |
| O3 | Mantle 状态由 OP Succinct（SP1）有效性证明验证，执行延迟 12 小时，系统可切换到无证明的乐观模式 | [1] State validation 节 | observed | O |
| O4 | L2BEAT 风险摘要第一条：合约被恶意升级可导致资金被盗，代码升级没有延迟（CRITICAL）；退出窗口为 None | [1] Risk summary / Exit window | observed | O、F13 |
| O5 | 用户可以通过 L1 强制收录交易，最长延迟 12 小时 | [1] Sequencer failure 节 | observed | O |
| O6 | MantleSecurityMultisig（0x4e59…D40f）门槛 6/14，可经 ProxyAdmin 无延迟升级 OptimismPortal、L1StandardBridge、L1CrossDomainMessenger、SystemConfig、OPSuccinctL2OutputOracle | [1] Permissions 节；[3] getThreshold=6、owners 14 | observed | 导语、总览 D、O、F13 |
| O7 | OptimismPortal 代理 0xc54c…A8Fb 的当前实现是 0xe1399f…31A7，admin 是 ProxyAdmin 0xca35…7794，ProxyAdmin owner 是 MantleSecurityMultisig | [3] cast implementation / admin / owner() | observed | O、F13 |
| O8 | MantleEngineeringMultisig（3/7）是 Portal 的 GUARDIAN，可以暂停提款 | [1]；[3] GUARDIAN() | observed | O |
| O9 | MantleSecurityMultisig 可以无延迟更换 SP1 vkey、verifier 地址和 rollupConfigHash，并切换乐观 / ZK 模式 | [1] OPSuccinctL2OutputOracle 权限描述 | observed | O |
| O10 | Mantle Portal 的 depositTransaction 以 msg.sender 为 from，只在调用者是合约时做 alias，然后发出 TransactionDeposited 事件 | [2] OptimismPortal.sol#L379-L427@da45c31 | observed | O |
| O11 | 部署实现 0xe1399f… 的 depositTransaction 与 mantle-v2 HEAD 只有格式差异，逻辑相同 | [4] 已验证源码 diff | observed | O |
| O12 | op-node 只把 deposit 合约地址发出、topic0 匹配的日志当作 deposit，from 直接取自 Topics[1] | [2] deposits.go#L14-L22、deposit_log.go#L36-L51 | observed | O、F13 |
| O13 | Mantle 的 deposit 比上游 OP 多出 MNT 的 Mint、EthValue、EthTxValue 等字段 | [2] deposit_log.go#L109-L184；OptimismPortal.sol opaqueData | observed | O、F14 |
| O14 | OP 规范：deposit 交易不做签名验证，from 由派生过程按 L1 deposit 合约日志认证 | [5] “Validation and Authorization of Deposited Transactions” | observed | O |
| O15 | OP 规范：deposit 交易没有 nonce，用 sourceHash 唯一标识；L2 gas 在 L1 购买 | [5] “The Deposited Transaction Type” | observed | O、F14 |
| O16 | Mantle 的治理多签在结构上拥有和 Arbitrum Security Council 同类的能力：换掉入口合约实现，就能产生 from 为任意地址的合法 L1→L2 输入 | 由 O7、O10、O12、O14 推出：派生只认 Portal 代理地址的日志，代理实现可由 6/14 无延迟替换；与 T7、T11、M22 的 Arbitrum 结构同构 | inferred | 导语、F13 |
| O17 | Mantle 上这类操作的批准门槛（6/14、无延迟）低于 Arbitrum 紧急路径（9/12、无延迟） | 由 O6、M28 推出 | inferred | F13 |
| O18 | 在 Mantle 上，这类恢复交易不需要像 Arbitrum 那样在 value 里留出 gas 预算，也没有 nonce 竞争 | 由 O15 与 T19、M18、M19 对比推出 | inferred | F14 |
| O19 | 这类输入能否通过当前 OP Succinct 证明，本次没有验证，需要测试网实测 | 未读 op-succinct range 程序；开放问题 1 | speculative | F14、P |
| O20 | Guardian 暂停只影响提款，depositTransaction 没有 whenNotPaused，所以暂停挡不住 L2 内部转账 | [2] OptimismPortal.sol#L67-L69、L379-L390 | observed | O |
| O21 | 只靠 sequencer 拒收不能冻结资产，攻击者可以在最长 12 小时后经 L1 强制收录 | 由 O5、[5] 推出 | inferred | O |
| O22 | mantle-v2 派生代码里没有对应 ArbOS 61 的交易过滤逻辑；deposit_7708_filter_test.go 是 EIP-7708 日志兼容测试 | [2] op-node/rollup/derive 目录与该测试文件注释 | observed | O |
| O23 | 恢复动作若填写非零 Mint / EthValue，会在 L2 凭空增发、破坏桥的资产守恒；Arbitrum 补丁用 amount=0 避免了这一点 | 由 O13 与 T14 推出 | inferred | F14 |
| O24 | 以合约地址或 EIP-7702 授权地址为 from 的 deposit 能否正常执行，需要实测 | 未验证 op-geth 对 deposit 的 EIP-3607 处理 | speculative | F14、P |
| O25 | 本次没有找到 Mantle 成文的紧急行动规则（类似 Arbitrum 宪法第 3 节） | docs.mantle.xyz 与 L2BEAT 页面未提及；开放问题 3 | speculative | P |
| G1 | 冻结能力的本质是“谁能无延迟改 L1 入口合约的代码”；入口可以这样升级的 rollup 都有同类能力 | 由 M22、T7、O16 推出：Arbitrum 与 Mantle 的派生都只认入口地址，不认入口代码 | inferred | 总览 F |
| G2 | 从技术上分类，KelpDAO 操作不是“拒绝收录”意义上的审查，而是更强的干预：未经私钥持有人同意改变资产控制权；ArbOS 61 过滤才是交易审查能力 | 由 M47、M51、M52、V20 推出 | inferred | M |
| G3 | 这次能冻结，前提是资金仍以原生 ETH 留在攻击者 EOA 里；资金进入 DEX、借贷或跨链流程后，同一方法不能直接追回头寸 | 由 M55、T17 与 T20 推出：交易是空 calldata 的原生转账，攻击者地址此前没有发过交易 | inferred | F4、O CAUTION |
| G4 | ArbitrumUnsignedTx 需要匹配攻击者当前 nonce；如果攻击者在入队到执行之间先发了交易，这笔冻结交易会因 nonce 不匹配而无法执行 | 由 M18、M19、T8（nonce 0）、T16、T18（501 秒窗口）推出 | inferred | F4 |
| G5 | 公众层面的结论是“对这一次有条件支持”，没有证据表明公众接受链长期拥有通用的冻结或划转能力 | 由 V8、V23、V50、P46、P48 推出 | inferred | 总览 F、F7 |
| G6 | 对 Mantle：使用类似能力前，应先在测试网完整演练（含 OP Succinct 证明与资产守恒检查） | 由 O19、O23、O24 推出 | inferred | O |
| G7 | 对 Mantle：应事前写明紧急规则（触发标准、范围、托管地址、释放流程、透明度报告），Arbitrum 社区事后才补提这些要求 | 由 V22、V47、P48、O25 推出 | inferred | O |
| G8 | 对 Mantle：应事前准备法律与赔偿安排，因为冻结后资产可能被法院限制令锁定，治理参与者面临法律风险 | 由 V9、V10、V45、V46 推出 | inferred | O |
| G9 | 恢复入口的设计教训：带“指定 sender”能力的代码只能在同一笔交易里换入、使用、换出，绝不能单独留在入口实现里 | 由 T10、T15 推出 | inferred | F3、O WARNING |
| G10 | “这一次救援”和“常设冻结能力”应作为两个独立决策：前者有先例支持，后者没有 | 由 G5、P46–P48、V47 推出 | inferred | O |

| V55 | 33 条有原文的观点中，支持 13 条，有条件支持或担忧 13 条，反对或批评 7 条 | notes-views.md §2 观点表 O1–O33 逐条计数 | observed | 总览 D、M |
| G11 | 冻结（04-21）后 10 天，判决债权人就向 Arbitrum DAO 送达了限制令（05-01） | 由 T1 与 V9 的日期推出 | inferred | 导语、F8 |

# Lane M：Arbitrum 背景与两套干预机制（notes-mechanism）

**研究问题**：(1) devs 理解这次冻结所需的 Arbitrum 背景：输入路径、delayed inbox / force inclusion、ArbOS 如何把 L1 消息派生成 L2 交易、unsigned tx 与 aliasing、BoLD 验证什么、权限结构；(2) ArbOS 61 Elara 的 Compliance / Transaction Filtering 是什么，和 KelpDAO 冻结有什么区别；(3) 一套干预层次分类框架。
**一句话答案**：KelpDAO 冻结是 **"改输入入口"**：Security Council（9/12）临时升级 L1 `Inbox` 的实现，加了一个能冒充任意 sender 的入口，写进一条 delayed message，ArbOS 照常把它派生成一笔 `ArbitrumUnsignedTx`（0x65，`From` = 黑客地址）。因为 STF 和 BoLD 只校验"这条消息是不是在 Bridge 的 `delayedInboxAccs` 里"，不校验"是哪段 Inbox 代码写进去的"，所以证明系统不会拦。ArbOS 61 的 Compliance Filtering 是另一套机制：sequencer 层地址/事件过滤，加上 STF 层"按交易 hash 强制失败"（预编译 0x74）。它 2026-08-20 才在 Arbitrum One 激活，并且官方明确说在 One/Nova 上不启用。用户记成的"ArbOS 升级引入的 sequencer 级操作"对应的是后者，不是这次冻结用的机制。

---

## 1. Onboarding 背景

### 1.1 交易输入路径：sequencer 批次 / delayed inbox / force inclusion

**答案**：L2 状态只由两条 L1 输入流决定。一条是 sequencer 通过 `SequencerInbox` 提交的批次；另一条是任何人通过 `Inbox` 写进 `Bridge` 的 delayed messages，它们进入 `delayedInboxAccs` 哈希累加器。sequencer 在批次里声明"读到第几条 delayed message"。如果 sequencer 不收某条 delayed message，过了 `delayBlocks`（Arbitrum One 目前约 1 天 / 7,200 个 L1 区块，受 delay buffer 调节）以后，任何人都能调用 `forceInclusion` 把它强行纳入。

**依据**：
- `Inbox` 的所有入口最终都走 `_deliverToBridge → bridge.enqueueDelayedMessage(kind, alias(sender), keccak(data))` [1][2]。`AbsBridge._enqueueDelayedMessage` 只检查 `allowedDelayedInboxes(msg.sender)`，也就是调用者是不是被登记的 Inbox 合约，然后 `addMessageToDelayedAccumulator` 往 `delayedInboxAccs` 里 push 一个 `keccak(prevAcc, messageHash)` [5]。`messageHash = keccak(kind, sender, blockNumber, timestamp, inboxSeqNum, baseFeeL1, messageDataHash)` [5]。
- `SequencerInbox.forceInclusion` 的检查顺序：先要求 `l1BlockAndTime[0] + delayBlocks_ < block.number`，否则 revert `ForceIncludeBlockTooSoon`；再校验调用者给的消息原像与 `bridge.delayedInboxAccs` 一致；最后用空数据批次把 `totalDelayedMessagesRead` 推进到该条 [6]。如果启用了 delay buffer，`delayBlocks_` 取 buffer 计算值 [6]。
- 官方文档：force inclusion 窗口取 `delayBuffer` 和 `delayBlocks` 中较小的那个。`delayBlocks` 当前为 24 小时；Arbitrum One 的 threshold 是 150 个 L1 区块（30 分钟），`delayBuffer` 初始为 14,400 个区块（2 天）[22]。L2BEAT 显示 Arbitrum One 当前为 "1 day, 150-7,200 L1 blocks"，并注明强制纳入会生成一条 "L1-originated L2 message"，sender 地址经过 alias [21]。
- 文档对 sequencer 职责的描述是：只负责排序，执行结果由 ArbOS/STF 决定（"it does not decide execution outcomes"）；DelayedSequencer 会等 delayed message 在 L1 finalize 后自动把它排进序列 [22]。

**不确定之处**：Arbitrum One 当前 `delayBuffer` 的实时值没有直接读链，用的是 L2BEAT 的结论"当前 buffer 给出最大延迟 = 1 天"[21]。

### 1.2 STF / ArbOS：L1 消息如何变成 L2 交易

**答案**：每条输入都是一个 `L1IncomingMessage`，header 里有 `Kind`、`Poster`（即 sender）、L1 区块号、时间戳、`RequestId`、`L1BaseFee`。`ParseL2Transactions` 按 `Kind` 分派：
- `L2Message`（3）：再读一字节 `L2MessageKind`。`UnsignedUserTx`（0）生成 `ArbitrumUnsignedTx`（0x65）；`ContractTx`（1）生成 `ArbitrumContractTx`（0x66）；`SignedTx`（4）是普通签名交易。
- `EthDeposit`（12）生成 `ArbitrumDepositTx`（0x64）。
- `SubmitRetryable`（9）生成 `ArbitrumSubmitRetryableTx`（0x69）。
- `L2FundedByL1`（7）生成一个 deposit 再接一笔 unsigned/contract tx。

unsigned / contract tx 的 `From` **直接取消息 header 的 `Poster`**。

**依据**：
- 消息类型常量：L1 侧见 nitro-contracts `MessageTypes.sol`（`L2_MSG=3`、`L2FundedByL1=7`、`submitRetryableTx=9`、`ethDeposit=12`、`unsignedEOATx=0`、`unsignedContractTx=1`）[4]；ArbOS 侧见 `arbostypes/incomingmessage.go` L24-35 与 `parse_l2.go` L91-101 [8]。
- `parseUnsignedTx` 构造 `ArbitrumUnsignedTx{ChainId, From: poster, Nonce, GasFeeCap, Gas, To, Value, Data}`；只有 `UnsignedUserTx` 读取 nonce，`ContractTx` 不读 nonce，改为带 `RequestId` [8]。
- 交易类型号：`ArbitrumDepositTxType=0x64`、`ArbitrumUnsignedTxType=0x65`、`ArbitrumContractTxType=0x66`、`ArbitrumRetryTxType=0x68`、`ArbitrumSubmitRetryableTxType=0x69`、`ArbitrumInternalTxType=0x6A` [9]。
- `arbitrumSigner.Sender()` 对 Unsigned、Contract、Deposit、Retry、SubmitRetryable 都直接返回 `inner.From`，不做 ECDSA 恢复 [9]。
- `SignedTx` 路径会拒绝类型号 ≥ `ArbitrumDepositTxType` 的交易。所以用户不能自己塞一笔 0x65 进来，它只能由 L1 消息派生 [8]。

### 1.3 unsigned tx 跳过了哪些检查

**答案**：`ArbitrumUnsignedTx` **不跳过** nonce 检查，也不跳过普通交易检查。`skipNonceChecks()` 和 `skipTransactionChecks()` 都返回 false，因此 nonce 必须等于账户当前 nonce，`buyGas` 要求余额 ≥ `gasLimit × GasFeeCap + value`。`ArbitrumContractTx`、`ArbitrumDepositTx`、`ArbitrumSubmitRetryableTx`、`ArbitrumRetryTx`、`ArbitrumInternalTx` 两项都跳过。所以"unsigned"只是不需要签名，授权来自 L1 消息通道，并不是一个能无条件改余额的 `setBalance`。

**依据**：`arb_types.go` L61-81 [9]；`TransactionToMessage` 把这两个标志拷进 `Message` [10]；`buyGas` 的余额检查是 `GasLimit × GasFeeCap + Value` [10]；`preCheck` 只在 `!msg.SkipNonceChecks` 时比较 nonce [10]。

**推论（供冻结交易解析 lane 核对）**：公告金额和实际 `value` 正好差 0.0001 ETH。这与 `buyGas` 的约束一致：若 `gasLimit = 100,000` 且 `maxFeePerGas = 1 gwei`，`value` 最多只能是"余额 − 0.0001 ETH"。实际扣费按 `effectiveGasPrice = baseFee` 计，未用的 gas 会退还 [9][10]。这两个字段值来自外部调研和链上浏览器，本 lane 没有独立解码。

### 1.4 地址 aliasing 与"能否以任意地址身份发交易"

**答案**：
- `OFFSET = 0x1111000000000000000000000000000000001111`，`alias(a) = a + OFFSET (mod 2^160)` [3]。
- 在 ETH 原生的标准 `Inbox` 里，**所有**经 `_deliverToBridge` 入队的消息，sender 都会被 `applyL1ToL2Alias`，不区分 EOA 还是合约 [2]。`AbsInbox.sendUnsignedTransaction` 把 `msg.sender` 原样交给 `_deliverMessage`，alias 发生在 `Inbox._deliverToBridge` [1][2]。
- 区分 EOA 和合约的地方只有两处：`depositEth` 的**目的地址**（合约或 `tx.origin != msg.sender` 时才 alias），以及 retryable 的 refund 地址 [1][2]。
- `*ToFork` 系列函数会先 `undoL1ToL2Alias(msg.sender)` 来抵消 alias，但只有在 L1 分叉、chainId 变化后才能调用 [2]。

**含义**：在标准实现下，L1 调用者只能以 `alias(自己)` 的身份在 L2 发 unsigned tx。要让 L2 上的 `From` 等于某个普通 EOA X，必须控制 L1 地址 `X − OFFSET`，而这需要它的私钥，实际上做不到。所以要"冒充黑客地址"，唯一的办法是改掉 Inbox 的代码，绕过这道 alias 绑定。论坛公告说 Security Council 正是加了 `sendUnsignedTransactionOverride`，"with the ability to impersonate the transaction sender" [19]。

**不确定之处**：
- override 函数的具体实现（是直接把目标地址作为 Bridge sender 入队，还是先 undo alias 再走 `_deliverToBridge`）不在本 lane 范围，需要交易解析 lane 从实现合约 `0x980D1F93…A859` 的源码确认。L2BEAT 把它叫作 "SpoofL2TxAction mechanism" [21]。
- 官方文档只写"Unsigned messages … sender's address must be aliased"[23]，没有写出"EOA 也会 alias"，但代码里 EOA 确实也会 alias [2]。

### 1.5 欺诈证明（BoLD）验证的是什么

**答案**：BoLD 和 one-step proof 验证的是：**给定输入**（sequencer 批次 + `delayedInboxAccs` 里的 delayed messages），用约定的 WASM 模块根（ArbOS 版本）执行 STF，结果是否正确。读取 delayed message 时，OSP 只要求"这条消息的哈希能接上 `bridge.delayedInboxAccs(msgIndex)`"。至于哪个 Inbox 实现、因为什么写入了这条消息，证明系统不管。所以，只要升级后的 Inbox 仍在 Bridge 的 allowlist 里（代理地址不变），它写入的任意 sender 消息对 STF 和证明来说都是合法输入。

**依据**：
- `OneStepProverHostIo.validateDelayedInbox` 会重算 `keccak(kind, sender, header, keccak(data))` 并 `require(acc == bridge.delayedInboxAccs(msgIndex))` [7]。
- `AbsBridge` 只检查 `allowedDelayedInboxes(msg.sender)` [5]。
- ArbOS 文档："ordered list is derived deterministically from headers that no node can fabricate; it is the true input" [24]。
- L2BEAT 列出 Arbitrum One 的 ArbOS v61 wasmModuleRoot `0xc10cd7ec…dc97` [21]，与 ArbOS 61 发布页一致 [17]。
- L2BEAT 也记录了：2026-04-21 和 2026-06-15 的 Inbox 实现切换 `0x7C058…0a10 → 0x980D1F…A859 → 0x7C058…0a10`，两次都在同一笔 L1 交易里完成 [21]。

**不确定之处**：BoLD 文档原文没有直接说"inbox messages 是输入"（gentle-introduction 页只写 "given input of onchain operations"）。本节结论来自合约源码 [7]，属于 observed（代码），而不是文档表述。

### 1.6 权限结构

**答案**：
- L1 侧链路：L1 Security Council Safe `0xF06E95eF…3F85`（9/12）→ L1 `UpgradeExecutor` `0x3ffFbAdA…CeDd` → `ProxyAdmin` `0x55472626…2dbD` → `Inbox` 代理 `0x4Dbd4fc5…AB3f` 和 `SequencerInbox` `0x1c479675…82B6`。走这条路**没有延迟** [21]。
- 常规路径：DAO（Constitutional AIP）或 L2 Proposer SC（9/12）→ L2 Timelock（8 天）→ Outbox（挑战期 6 天 8 小时）→ L1 Timelock（3 天）→ UpgradeExecutor，合计约 17 天 8 小时 [21]。
- L2 侧：L2SecurityCouncilEmergency `0x423552c0…1641`（9/12）可无延迟调用 L2UpgradeExecutor `0xCF575722…A827`。ArbOS 的 chain owner（ArbOwner 0x70 的调用权）由 L2UpgradeExecutor 和几份单用途合约（BaseFeeManager 等）持有 [21]。
- 宪法 §3：Security Council 共 12 人，**Emergency Actions 和 Non-Emergency Actions 都要 9-of-12**；紧急行动只能用于 "true security emergency"，事后必须发 "full transparency report"；DAO 可以通过 Constitutional AIP 削减或取消这些权力 [20]。
- 宪法 §1：One/Nova 的 "chain owner" 权限同时授予了 DAO 和 Security Council [20]。

**不确定之处 / 与 brief 的出入**：brief 里写的"非紧急 7/12"与当前宪法原文（9-of-12）[20] 以及 L2BEAT（"non-emergency (9/12…)"）[21] 不符，正文应以 9/12 为准。宪法条款没有编号（例如 3.x），只能按"Section 3: The Security Council"引用。

---

## 2. ArbOS 61 Elara：Compliance / Transaction Filtering

### 2.1 时间线

**答案**：

| 日期 | 事件 | 来源 |
|---|---|---|
| 2026-03-05 | Offchain Labs 在论坛发布 AIP（当时叫 ArbOS 60 Elara），把 compliance transaction filtering 列为"included … but left intentionally disabled on Arbitrum One and Nova" | [18] |
| 2026-04-14 | L2BEAT 治理团队在链下投票阶段投 FOR，同时提醒把该功能放进核心栈可能影响 Stages 框架 | [18 #16] |
| 2026-04-21 | KelpDAO 冻结发生（此时 ArbOS 60/61 还没在 One 激活） | [19] |
| 2026-05-06 | Offchain 回复：该功能由 ArbOwner 调用开关，内置 7 天生效延迟 | [18 #20] |
| 2026-06-19 | 因 gas 退款 bug 涉及 STF，版本号改为 ArbOS 61，范围不变 | [18] |
| 2026-06-29 | Sepolia 激活 | [17] |
| 2026-07-16 ~ 07-30 | 链上投票（alt.gov.arbitrum.foundation），通过 | [17] |
| 2026-08-20 17:00 UTC | One/Nova 激活 | [17] |

**官方关于 One/Nova 的原话**：
- 发布页："This ships in ArbOS 61 but is left intentionally disabled on Arbitrum One and Nova" [17]
- AIP："This feature, however, will not be enabled on Arbitrum One or Nova as part of this proposal." [18]
- 功能文档："not intended or proposed to be used by Arbitrum One" [16]

**不确定之处**：只找到发布页上的 Snapshot/Tally 时间描述，没有逐条核对 Snapshot 投票的原始页面。另外没有读链确认 Arbitrum One 的 `TransactionFilteringFromTime` 是否为 0（见开放问题）。

### 2.2 机制：两层结构

**Sequencer 层（链下、可配置、不进证明）**：
- 节点从 S3 拉取 `sha256(salt‖address)` 形式的受限地址哈希表，sequencer 在排序前**模拟**每笔交易。
- 规则包括 from/to、ERC-20/721/1155 的 `Transfer`/`Approval` 事件、对受限地址的 `CALL`/`CREATE`/`CREATE2`/`SELFDESTRUCT`，命中就拒绝收录 [16]。
- 实现上，`ProduceBlockAdvanced` 提供 `PreTxFilter`/`PostTxFilter`/`BlockFilter` 钩子和 `addressChecker`；block 末尾如果 `statedb.IsTxFiltered()` 就返回 `state.ErrSeqFilter` [14]。
- retryable 的 redeem 碰到被过滤地址时，会整组回滚（用户 tx 连同其 redeem），见 `ErrFilteredCascadingRedeem` [14]。
- 被过滤的交易通过 `cmd/filtering-report` 上报 [15]。
- 配置开关：`--execution.transaction-filtering.enable`（默认 false，v3.10.2）、`address-filter.s3.*`、`event-filter.path`/`rules` [15][16]。

**STF 层（链上状态、进证明）**：
- 预编译 `ArbFilteredTransactionsManager`，地址 `0x74`，提供 `AddFilteredTransaction`、`DeleteFilteredTransaction`、`IsTransactionFiltered`。只有 `TransactionFilterers` 成员能写，非成员调用会 `BurnOut` [11]。存储在 `FilteredTransactionsStateAddress = 0xA4B05…0001` [9]。
- 授权流程：chain owner 先通过 `ArbOwner.SetTransactionFilteringFrom` 设定生效时间。这个时间必须 ≥ 当前 + 7 天（`FeatureEnableDelay`），否则报 `ErrDelay`。之后才能 `AddTransactionFilterer`（生效前调用会报 "transaction filtering feature is not enabled yet"）。chain owner 还可以 `SetFilteredFundsRecipient`，设为 0 时回退到 networkFeeAccount [12]。
- STF 中的效果：
  - 普通交易（包括 unsigned/contract 等走 EVM 的类型）在 `RevertedTxHook` 中，如果 hash 已登记，则 nonce+1、**耗尽全部剩余 gas**（"Consume all remaining gas as punishment"）、跳过 EVM 执行，返回 `ErrFilteredOnChain` [13]。
  - `ArbitrumDepositTx`：ETH 仍然铸出，但改转给 `FilteredFundsRecipientOrDefault()`，不进原收款人 [13]。
  - `ArbitrumSubmitRetryableTx`：`FeeRefundAddr` 和 `Beneficiary` 被改成同一个 recipient，并跳过 auto-redeem [13]。
- delayed message 路径：delayed sequencer 在排序 delayed message 时也跑地址过滤，命中后交给 `transaction-filterer` 服务（RPC），由它调用 0x74 登记 hash。登记完成后 delayed sequencer 才能"advance past it"，交易随后在 STF 里失败 [13][15]。相关配置：`--execution.sequencer.transaction-filtering.disable-delayed-sequencing-filter`；NIT-5012 规定，如果开了 delayed 过滤但没配 `transaction-filterer-rpc-client.url`，节点直接退出（fail fast）[15]。文档把这个组件叫 "Delayed Inbox Sentinel" 和 "Transaction Guardian Precompile" [16]。

**官方列出的边界与副作用** [16]：
1. **Burn 例外**：`Transfer` 事件的 `to == 0x0` 时，即使 `from` 受限也放行。但如果同一笔交易还有其他违规，仍整笔失败；受限地址本人作为 `tx.origin` 照样被拦。
2. **L1 已锁、L2 未到账**："the ETH may become locked in the bridge with no corresponding child chain asset"。
3. 没有 STF 层的话，用户可以靠 force inclusion 绕过 sequencer 过滤。

**文档与代码的出入（重要）**：文档说被过滤的 deposit "credit is dropped"。但在 nitro@ccc5c82 的 `StartTxHook` 里，被登记的 deposit **不会丢弃**，而是把 ETH 改投到 chain owner 设定的 `FilteredFundsRecipient`（或 networkFeeAccount）[13]。也就是说，启用后"过滤"对 deposit/retryable 的实际效果是**资金改道到 chain owner 指定地址**，比文档描述的"锁在桥里"更接近没收。这一点值得在页面上明确写出。

**不确定之处**：
- `execution/gethexec` 里 sequencer 侧过滤和 transaction-filterer 的具体代码没有逐行读，本节依据的是 CHANGELOG 条目、`tx_processor.go` 和 `block_processor.go` 里的注释与实现。
- 行号为人工计数，可能有 ±2 行误差。

### 2.3 与 KelpDAO 操作对比

| 维度 | KelpDAO 冻结（2026-04-21） | ArbOS 61 Compliance Filtering |
|---|---|---|
| 目的 | 一次性把特定账户的 ETH 转到隔离地址 `0x…0DA0` [19] | 持续阻止涉及受限地址的交易 [16] |
| 所在层 | L1 输入入口（Inbox 代码）[19][21] | Sequencer（链下）+ STF（预编译 0x74，链上状态）[16][11] |
| 权限 | L1 Security Council 9/12 → UpgradeExecutor → ProxyAdmin 升级 Inbox，无延迟 [20][21] | chain owner 启用（≥7 天生效）+ 授权 `TransactionFilterers` 写 hash [12][17] |
| 状态效果 | 产生一笔"以黑客身份"签发的转账，资产从 A 转到 B [19] | 交易被拒收或在 STF 中失败、扣光 gas；deposit/retryable 资金改道 recipient [13] |
| 是否改证明程序 | 否：消息照常进 `delayedInboxAccs`，现有 STF/WASM 照常执行 [5][7] | 否（启用时）：逻辑已在 ArbOS 61 的 WASM 模块根里；但引入本身需要 ArbOS 升级 [17] |
| 与 force inclusion 的关系 | 它本身**就是**一条 delayed message，force inclusion 与它不冲突（推论） | 专门设计成覆盖 force inclusion 路径 [16] |
| 在 Arbitrum One 是否启用 | 已执行过（2026-04-21；2026-06-15 释放时用了同一机制）[19][21] | 代码已随 ArbOS 61 上线（2026-08-20），官方声明不启用 [17] |
| 能否"冒充"用户 | 能：冒充 sender 发起转账 [19] | 不能：只能让交易失败或改道资金，不能代表用户发起交易 [11][13] |

**用户记忆的归属**："ArbOS 升级引入的 sequencer 级操作"对应的是 **ArbOS 61 Compliance Filtering**：它确实由 ArbOS 升级引入，也确实有 sequencer 层组件。但它在冻结发生时还没有在 One 上激活（2026-08-20 才激活），而且在 One 上没有启用，所以不可能是 KelpDAO 冻结用的机制 [17][19]。这个记忆错位的一个合理来源是：冻结发生时，Elara AIP（含 compliance filtering）正在论坛讨论和链下投票阶段（3 月发帖，4 月 14 日 L2BEAT 投票）[18]。这是 inferred。另一种说法"Security Council 临时升级 L1 Inbox"与官方公告 [19] 和 L2BEAT 的升级记录 [21] 一致。

---

## 3. 干预层次分类框架

| 层 | 例子 | 谁有权 | 能否被 force inclusion 绕过 | 要不要改证明程序 | Arbitrum One 现状 |
|---|---|---|---|---|---|
| ① Sequencer 拒绝收录 | 不把某地址的交易排进块；ArbOS 61 的 sequencer 过滤 | sequencer 运营方（节点配置）[16][22] | **能**：等 `delayBlocks`（约 1 天）后 `forceInclusion` [6][21] | 否（不进 STF）| 中心化 sequencer 在技术上可以这样做 [21]；ArbOS 61 过滤代码存在但官方声明未启用 [17] |
| ② STF 执行规则拒绝 | 预编译 0x74 登记 hash，交易失败并扣光 gas | chain owner 启用（≥7 天延迟）+ 授权的 filterer [12] | **不能**：规则在 STF 里，force inclusion 进来的交易也会失败 [13][16] | 需要 STF 支持：ArbOS 61 已内置，启用时不需要再改 | 能力已上线，官方声明未启用 [17] |
| ③ 资产合约冻结 | token 合约自带的 blacklist/pause | 各合约 owner（取决于具体合约，inferred）| 不能（规则在合约里）| 否 | 取决于具体资产；**原生 ETH 没有这一层** [9]（ETH 是账户余额，没有合约逻辑）|
| ④ 特权划转（改输入入口） | KelpDAO 冻结：升级 Inbox，冒充 sender | 能升级 L1 Inbox 的主体：SC 9/12（无延迟）或 DAO（约 17 天 8 小时）[20][21] | 不适用：它本身就是 delayed message，用户无法阻止它被纳入（推论）| 否：OSP 认可 `delayedInboxAccs` 里的任何消息 [7] | **已用过两次**（4/21 冻结、6/15 释放）[19][21] |
| ⑤ 硬分叉改状态 | ArbOS 升级或新 WASM 模块根里写入特殊状态改动 | ArbOS 升级 = chain owner（DAO 或 SC 紧急行动）[18][20] | 不能 | **要**：新的 STF/WASM 模块根 | 能力存在（SC "any software upgrade"）[20]；没有查到用于资产处置的先例 |

---

## 图的素材

**A. 输入路径（sequencer / delayed inbox / force inclusion）**
- 参与者：用户 EOA、L1 `Inbox`（`0x4Dbd…AB3f`）、L1 `Bridge`（存 `delayedInboxAccs`）、L1 `SequencerInbox`（`0x1c47…82B6`）、Sequencer/DelayedSequencer、ArbOS/STF、BoLD 验证者 [1][5][6][21][22]。
- 路径 1：用户 → RPC → Sequencer 排序 → batch poster → `SequencerInbox.addSequencerL2Batch*` → `bridge.enqueueSequencerMessage`（`sequencerInboxAccs` 里引用 `delayedAcc`）[5][22]。
- 路径 2：用户/合约 → `Inbox.send*` → `_deliverToBridge(alias(sender))` → `Bridge.delayedInboxAccs.push` → DelayedSequencer 等 L1 finality 后纳入 [2][5][22]。
- 路径 3（sequencer 不纳入时）：经过 `delayBlocks`（约 7,200 区块 / 1 天，buffer 可降到最少约 150 区块）后，任何人调用 `SequencerInbox.forceInclusion` [6][21][22]。
- 汇合：两条路径都变成 `L1IncomingMessage` → `ParseL2Transactions` → EVM 交易 [8][24]。

**B. 消息到交易的映射（状态机式）**
- `Kind=3 / L2Kind=0` → `ArbitrumUnsignedTx`（From = Poster，校验 nonce）[8][9]
- `Kind=3 / L2Kind=1` → `ArbitrumContractTx`（From = Poster，有 RequestId，不校验 nonce）[8][9]
- `Kind=3 / L2Kind=4` → 签名交易（类型号 ≥ 0x64 一律拒绝）[8]
- `Kind=12` → `ArbitrumDepositTx`（铸 ETH 并转账）[8][13]
- `Kind=9` → `ArbitrumSubmitRetryableTx` [8]
- `Kind=7` → `[ArbitrumDepositTx, unsigned/contract tx]` [8]

**C. Compliance Filtering 两层结构**
- 普通 RPC 交易：Sequencer 模拟 →（地址哈希表 + 事件规则）→ 命中则拒收并上报 filtering-report；没命中则进块 [14][15][16]。
- Delayed message：DelayedSequencer 模拟 → 命中 → transaction-filterer 服务 → `0x74.AddFilteredTransaction(hash)`（调用者须是 `TransactionFilterers` 成员）→ 交易被排入 → STF 的 `RevertedTxHook`/`StartTxHook` 发现 hash 已登记 → 失败、扣光 gas，或资金改道 `FilteredFundsRecipient` [11][12][13][15]。
- 启用前置：chain owner 调用 `ArbOwner.SetTransactionFilteringFrom(t ≥ now+7d)` → 到时间后 `AddTransactionFilterer` → 节点开 `--execution.transaction-filtering.enable` [12][15]。

**D. 干预层次图**：五层（见第 3 节表格）。每层标三个属性："谁有权 / 能否被 force inclusion 绕过 / 是否改证明程序"。①②之间画一条"force inclusion 边界"，②⑤之间画一条"是否进 STF/证明"边界，④单独标注"输入认证入口"。

**E. 权限链（画 L1 调用树时用）**
- Emergency：L1 SC Safe `0xF06E…3F85`（9/12）→ `UpgradeExecutor` `0x3ffF…CeDd` → `ProxyAdmin` `0x5547…2dbD` → `Inbox` 代理 `0x4Dbd…AB3f`（实现 `0x7C058…0a10` ↔ `0x980D1F…A859`）[21]。
- Regular：DAO / L2 Proposer SC → L2 Timelock 8 天 → Outbox 6 天 8 小时 → L1 Timelock 3 天 → UpgradeExecutor [21]。

---

## 代码素材

**C1. 标准 unsigned 入口只绑定 `msg.sender`**：nitro-contracts/src/bridge/AbsInbox.sol#L162-L188@ff6334e（节选）
https://github.com/OffchainLabs/nitro-contracts/blob/ff6334e7bfe6468f85202df98db92468e25f5688/src/bridge/AbsInbox.sol#L162-L188
```solidity
function sendUnsignedTransaction(
    uint256 gasLimit, uint256 maxFeePerGas, uint256 nonce,
    address to, uint256 value, bytes calldata data
) external whenNotPaused onlyAllowed returns (uint256) {
    if (gasLimit > type(uint64).max) revert GasLimitTooLarge();
    return _deliverMessage(
        L2_MSG,
        msg.sender,                       // <- sender 由调用者决定，不能指定
        abi.encodePacked(L2MessageType_unsignedEOATx,
            gasLimit, maxFeePerGas, nonce, uint256(uint160(to)), value, data),
        0
    );
}
```

**C2. Inbox 入队时一律 alias**：nitro-contracts/src/bridge/Inbox.sol#L317-L326@ff6334e
https://github.com/OffchainLabs/nitro-contracts/blob/ff6334e7bfe6468f85202df98db92468e25f5688/src/bridge/Inbox.sol#L317-L326
```solidity
function _deliverToBridge(uint8 kind, address sender, bytes32 messageDataHash, uint256 amount)
    internal override returns (uint256)
{
    return IEthBridge(address(bridge)).enqueueDelayedMessage{value: amount}(
        kind, AddressAliasHelper.applyL1ToL2Alias(sender), messageDataHash
    );
}
```

**C3. Alias 偏移**：nitro-contracts/src/libraries/AddressAliasHelper.sol#L8-L20@ff6334e
https://github.com/OffchainLabs/nitro-contracts/blob/ff6334e7bfe6468f85202df98db92468e25f5688/src/libraries/AddressAliasHelper.sol#L8-L20
```solidity
uint160 internal constant OFFSET = uint160(0x1111000000000000000000000000000000001111);
function applyL1ToL2Alias(address l1Address) internal pure returns (address l2Address) {
    unchecked { l2Address = address(uint160(l1Address) + OFFSET); }
}
```

**C4. Bridge 只认 Inbox 地址，不认代码**：nitro-contracts/src/bridge/AbsBridge.sol#L149-L169@ff6334e（节选）
https://github.com/OffchainLabs/nitro-contracts/blob/ff6334e7bfe6468f85202df98db92468e25f5688/src/bridge/AbsBridge.sol#L149-L169
```solidity
function _enqueueDelayedMessage(uint8 kind, address sender, bytes32 messageDataHash, uint256 amount)
    internal returns (uint256)
{
    if (!allowedDelayedInboxes(msg.sender)) revert NotDelayedInbox(msg.sender);
    uint256 messageCount = addMessageToDelayedAccumulator(
        kind, sender, uint64(block.number), uint64(block.timestamp), _baseFeeToReport(), messageDataHash
    );
    _transferFunds(amount);
    return messageCount;
}
```

**C5. Force inclusion 时间门槛**：nitro-contracts/src/bridge/SequencerInbox.sol#L292-L310@ff6334e（节选）
https://github.com/OffchainLabs/nitro-contracts/blob/ff6334e7bfe6468f85202df98db92468e25f5688/src/bridge/SequencerInbox.sol#L292-L310
```solidity
uint256 delayBlocks_ = delayBlocks;
if (isDelayBufferable) {
    buffer.update(l1BlockAndTime[0]);
    delayBlocks_ = delayBufferableBlocks(buffer.bufferBlocks);
}
// Can only force-include after the Sequencer-only window has expired.
if (l1BlockAndTime[0] + delayBlocks_ >= block.number) revert ForceIncludeBlockTooSoon();
bytes32 prevDelayedAcc = 0;
if (_totalDelayedMessagesRead > 1) prevDelayedAcc = bridge.delayedInboxAccs(_totalDelayedMessagesRead - 2);
if (bridge.delayedInboxAccs(_totalDelayedMessagesRead - 1)
        != Messages.accumulateInboxMessage(prevDelayedAcc, messageHash)) revert IncorrectMessagePreimage();
```

**C6. 证明系统只校验累加器**：nitro-contracts/src/osp/OneStepProverHostIo.sol#L398-L423@ff6334e（节选）
https://github.com/OffchainLabs/nitro-contracts/blob/ff6334e7bfe6468f85202df98db92468e25f5688/src/osp/OneStepProverHostIo.sol#L398-L423
```solidity
bytes32 messageDataHash = keccak256(message[DELAYED_HEADER_LEN:]);
bytes1 kind = message[0];
uint256 sender;
(sender,) = Deserialize.u256(message, 1);
bytes32 messageHash = keccak256(
    abi.encodePacked(kind, uint160(sender), message[33:DELAYED_HEADER_LEN], messageDataHash)
);
bytes32 acc = Messages.accumulateInboxMessage(beforeAcc, messageHash);
require(acc == execCtx.bridge.delayedInboxAccs(msgIndex), "BAD_DELAYED_MESSAGE");
```

**C7. ArbOS 把 Poster 直接当 From**：nitro/arbos/parse_l2.go#L244-L255@ccc5c82
https://github.com/OffchainLabs/nitro/blob/ccc5c828d9ea22f161efc784bac4d4a6559b7e59/arbos/parse_l2.go#L244-L255
```go
switch txKind {
case L2MessageKind_UnsignedUserTx:
    inner = &types.ArbitrumUnsignedTx{
        ChainId:   chainId,
        From:      poster,
        Nonce:     nonce,
        GasFeeCap: maxFeePerGas.Big(),
        Gas:       gasLimit,
        To:        destination,
        Value:     value.Big(),
        Data:      calldata,
    }
```

**C8. unsigned tx 不跳过 nonce 和交易检查；sender 取 From**：go-ethereum/core/types/arb_types.go#L65-L66、L76-L77；arbitrum_signer.go#L39-L42@260bc5d
https://github.com/OffchainLabs/go-ethereum/blob/260bc5dcbd5a16925d7e26145577b2612f30f428/core/types/arb_types.go#L61-L81
https://github.com/OffchainLabs/go-ethereum/blob/260bc5dcbd5a16925d7e26145577b2612f30f428/core/types/arbitrum_signer.go#L39-L42
```go
func (tx *ArbitrumUnsignedTx) skipNonceChecks() bool        { return false }
func (tx *ArbitrumContractTx) skipNonceChecks() bool        { return true }
func (tx *ArbitrumUnsignedTx) skipTransactionChecks() bool  { return false }
func (tx *ArbitrumContractTx) skipTransactionChecks() bool  { return true }
// arbitrum_signer.go
case *ArbitrumUnsignedTx:
    return inner.From, nil
```

**C9. 余额约束 `gasLimit×feeCap + value`**：go-ethereum/core/state_transition.go#L471-L498@260bc5d（节选）
https://github.com/OffchainLabs/go-ethereum/blob/260bc5dcbd5a16925d7e26145577b2612f30f428/core/state_transition.go#L471-L498
```go
balanceCheck := new(big.Int).Set(mgval)
if st.msg.GasFeeCap != nil {
    balanceCheck.SetUint64(st.msg.GasLimit)
    balanceCheck = balanceCheck.Mul(balanceCheck, st.msg.GasFeeCap)
}
balanceCheck.Add(balanceCheck, st.msg.Value)
...
if have, want := st.state.GetBalance(st.msg.From), balanceCheckU256; have.Cmp(want) < 0 {
    return fmt.Errorf("%w: address %v have %v want %v", ErrInsufficientFunds, ...)
}
```

**C10. 过滤预编译**：nitro/precompiles/ArbFilteredTransactionsManager.go#L15-L37、L59-L62@ccc5c82
https://github.com/OffchainLabs/nitro/blob/ccc5c828d9ea22f161efc784bac4d4a6559b7e59/precompiles/ArbFilteredTransactionsManager.go#L15-L62
```go
type ArbFilteredTransactionsManager struct {
    Address addr // 0x74
    ...
}
func (con ArbFilteredTransactionsManager) AddFilteredTransaction(c *Context, evm *vm.EVM, txHash common.Hash) error {
    if !con.hasAccess(c) {
        return c.BurnOut()
    }
    filteredState := filteredTransactions.Open(evm.StateDB, c)
    if err := filteredState.Add(txHash); err != nil { return err }
    return con.FilteredTransactionAdded(c, evm, txHash)
}
func (con ArbFilteredTransactionsManager) hasAccess(c *Context) bool {
    manager, err := c.State.TransactionFilterers().IsMember(c.caller)
    return manager && err == nil
}
```

**C11. STF 中被登记 hash 的处理**：nitro/arbos/tx_processor.go#L1089-L1105@ccc5c82
https://github.com/OffchainLabs/nitro/blob/ccc5c828d9ea22f161efc784bac4d4a6559b7e59/arbos/tx_processor.go#L1089-L1105
```go
// Check if tx is in the onchain filter (gas-free read).
// This handles delayed messages that were flagged by address filter,
// then added to onchain filter list. We skip execution but consume gas.
if p.state.FilteredTransactions().IsFilteredFree(txHash) {
    p.evm.StateDB.SetNonce(p.msg.From, p.evm.StateDB.GetNonce(p.msg.From)+1, tracing.NonceChangeEoACall)
    // Consume all remaining gas as punishment
    usedGas := *gasRemaining
    *gasRemaining = 0
    ...
    filteredErr := &core.ErrFilteredOnChain{TxHash: txHash}
    return usedMultiGas, filteredErr
}
```

**C12. deposit 被过滤时资金改道**：nitro/arbos/tx_processor.go#L245-L267@ccc5c82（节选）
https://github.com/OffchainLabs/nitro/blob/ccc5c828d9ea22f161efc784bac4d4a6559b7e59/arbos/tx_processor.go#L245-L267
```go
txHash := underlyingTx.Hash()
var txnErr error
if p.state.FilteredTransactions().IsFilteredFree(txHash) {
    recipient, err := p.state.FilteredFundsRecipientOrDefault()
    ...
    to = &recipient
    txnErr = &core.ErrFilteredOnChain{TxHash: txHash}
}
util.MintBalance(&from, value.ToBig(), evm, util.TracingBeforeEVM, tracing.BalanceIncreaseDeposit)
...
core.Transfer(evm.StateDB, from, *to, value, evm.ChainRules())
```

**C13. 启用门槛（7 天）**：nitro/precompiles/ArbOwner.go#L56、L184-L198@ccc5c82（节选）
https://github.com/OffchainLabs/nitro/blob/ccc5c828d9ea22f161efc784bac4d4a6559b7e59/precompiles/ArbOwner.go#L184-L198
```go
const FeatureEnableDelay = 7 * 24 * 60 * 60 // one week
func (con ArbOwner) AddTransactionFilterer(c ctx, evm mech, filterer addr) error {
    enabledTime, err := c.State.TransactionFilteringFromTime()
    if err != nil { return err }
    if enabledTime == 0 || enabledTime > evm.Context.Time {
        return errors.New("transaction filtering feature is not enabled yet")
    }
    if err := c.State.TransactionFilterers().Add(filterer); err != nil { return err }
    return con.TransactionFiltererAdded(c, evm, filterer)
}
```

---

## 来源

1. **PRIMARY** OffchainLabs/nitro-contracts `src/bridge/AbsInbox.sol` @ff6334e：证明 `sendUnsignedTransaction` 只能以 `msg.sender` 作为 sender 入队（L162-188）。
2. **PRIMARY** nitro-contracts `src/bridge/Inbox.sol` @ff6334e：证明 `_deliverToBridge` 对所有 sender 做 alias（L317-326）；`depositEth` 只对合约目的地址做 alias（L202-214）；`*ToFork` 只能在分叉后调用（L109、L143）。
3. **PRIMARY** nitro-contracts `src/libraries/AddressAliasHelper.sol` @ff6334e：证明 alias 偏移量（L8）。
4. **PRIMARY** nitro-contracts `src/libraries/MessageTypes.sol` @ff6334e：证明 L1 侧消息类型编号。
5. **PRIMARY** nitro-contracts `src/bridge/AbsBridge.sol`（L48、L149-192）与 `Messages.sol` @ff6334e：证明 `delayedInboxAccs` 累加器结构，以及 Bridge 只检查 Inbox 地址是否在 allowlist。
6. **PRIMARY** nitro-contracts `src/bridge/SequencerInbox.sol` @ff6334e：证明 `forceInclusion` 的延迟门槛和累加器校验（L272-325，关键行 L300）。
7. **PRIMARY** nitro-contracts `src/osp/OneStepProverHostIo.sol` @ff6334e：证明 OSP 读取 delayed message 时只校验 `delayedInboxAccs`（L398-423）。
8. **PRIMARY** OffchainLabs/nitro `arbos/parse_l2.go`、`arbos/arbostypes/incomingmessage.go` @ccc5c82：证明消息到交易的派生规则，以及 `From = Poster`。
9. **PRIMARY** OffchainLabs/go-ethereum `core/types/arb_types.go`、`arbitrum_signer.go`、`transaction.go` @260bc5d：证明交易类型号、skip 标志、sender 取 From、0x74 和过滤状态地址。
10. **PRIMARY** go-ethereum `core/state_transition.go` @260bc5d：证明 `buyGas` 的余额约束和 `preCheck` 的 nonce 检查（L374-404、L471-527）。
11. **PRIMARY** nitro `precompiles/ArbFilteredTransactionsManager.go` @ccc5c82：证明 0x74 预编译的接口和权限检查。
12. **PRIMARY** nitro `precompiles/ArbOwner.go` @ccc5c82：证明 filterer 由 chain owner 授权、7 天启用延迟、`FilteredFundsRecipient`（L56、L103-139、L184-233）。
13. **PRIMARY** nitro `arbos/tx_processor.go` @ccc5c82：证明 STF 中被过滤交易扣光 gas（L1089-1105），以及 deposit/retryable 资金改道（L245-306）。
14. **PRIMARY** nitro `arbos/block_processor.go` @ccc5c82：证明 sequencer 钩子（Pre/PostTxFilter、BlockFilter）、`ErrSeqFilter` 和 redeem 整组回滚。
15. **PRIMARY** nitro `CHANGELOG.md` @ccc5c82：证明过滤相关配置项和修复的时间线（v3.10.0 新增 address-filter/event-filter/delayed-sequencing-filter；v3.10.2 总开关默认 false；v3.11.0-rc.1 "Support for ArbOS 61"、"Report filtered delayed transactions"；rc.2 修复"Sequencer no longer rejects clean transactions following a filtered one"；rc.3 NIT-5012）。
16. **PRIMARY** Arbitrum Docs "Compliance filtering" https://docs.arbitrum.io/launch-arbitrum-chain/chain-config/sequencer/compliance-filtering （访问 2026-10-07）：证明两层结构、sentinel、burn 例外、deposit 副作用，以及"不打算用于 Arbitrum One"。
17. **PRIMARY** Arbitrum Docs "ArbOS 61 Elara" https://docs.arbitrum.io/run-arbitrum-node/arbos-releases/arbos61 （访问 2026-10-07）：证明投票时间（2026-07-16 至 07-30）、激活时间（2026-08-20 17:00 UTC）、合规过滤在 One/Nova 上 "intentionally disabled"、7 天启用延迟、wasmModuleRoot。
18. **PRIMARY** 论坛 "[Constitutional] AIP: ArbOS 61 Elara" https://forum.arbitrum.foundation/t/30601.json （#1 Offchain Labs 2026-03-05 发帖，2026-06-19 更新；#16 L2BEAT krst 2026-04-14；#20 Offchain 2026-05-06；#32 L2BEAT 2026-07-30；访问 2026-10-07）：证明 60→61 改名的原因、功能在 One 上不启用、L2BEAT 的保留意见。
19. **PRIMARY** 论坛 "Security Council Emergency Action 21-04-2026" https://forum.arbitrum.foundation/t/30803.json （访问 2026-10-07）：证明冻结的技术路径（"upgrade the inbox contract … sendUnsignedTransactionOverride … impersonate the transaction sender"）和隔离地址 `0x…0DA0`。
20. **PRIMARY** ArbitrumDAO Constitution https://docs.arbitrum.foundation/dao-constitution （访问 2026-10-07）：证明 Section 1 chain owner 归属、Section 3 中紧急与非紧急行动都要 9-of-12，以及透明度报告义务。
21. 第三方分析（基于链上数据）L2BEAT Arbitrum One https://l2beat.com/scaling/projects/arbitrum （访问 2026-10-07）：证明合约地址和权限链、force inclusion "1 day, 150-7,200 L1 blocks"、Inbox 在 2026-04-21 和 2026-06-15 的实现切换（"SpoofL2TxAction mechanism"）、各 SC 多签 9/12。
22. **PRIMARY** Arbitrum Docs "The Sequencer and censorship resistance" https://docs.arbitrum.io/how-arbitrum-works/deep-dives/sequencer （访问 2026-10-07）：证明 sequencer 不决定执行结果、DelayedSequencer 的角色、delayBlocks 为 24 小时、Censorship Timeout 参数。
23. **PRIMARY** Arbitrum Docs "Bridging from a parent chain to a child chain" https://docs.arbitrum.io/how-arbitrum-works/l1-to-l2-messaging （访问 2026-10-07）：证明 aliasing 的定义和设计理由。
24. **PRIMARY** Arbitrum Docs "State Transition Function" https://docs.arbitrum.io/how-arbitrum-works/deep-dives/stf （访问 2026-10-07）：证明 `L1IncomingMessage` 的结构和"headers that no node can fabricate"的输入模型。

---

## 外部调研中被修正或无法核实的地方

1. **"Elara … 官方于 2026 年 8 月 20 日发布 Elara 上线信息"**：准确说法是 2026-08-20 17:00 UTC 在 One/Nova **激活**。链上投票是 2026-07-16 至 07-30，Sepolia 6 月 29 日激活 [17]。
2. **"sentinel … STF 处理到该交易时，让它失败并消耗相应 gas"**：对普通交易成立 [13]。但外部调研漏掉了：被登记的 `ArbitrumDepositTx` 和 `SubmitRetryableTx` **不会简单失败**，而是把资金或受益人改成 chain owner 设定的 `FilteredFundsRecipient`（默认 networkFeeAccount）[12][13]。官方文档写的是 "credit is dropped … locked in the bridge"[16]，与代码不一致，正文应以代码为准，同时写明这一出入。
3. **"修复同一区块内过滤状态在交易间泄漏"**：可以核实。对应 CHANGELOG v3.11.0-rc.2："Sequencer no longer rejects clean transactions following a filtered one in the same block"[15]。但这是 **sequencer 层**的 bug，不是 STF 层。
4. **"普通 unsigned 消息还会应用地址 aliasing"**：正确，但不完整。标准 ETH Inbox 对**所有** sender（包括 EOA）都做 alias；EOA/合约的区分只影响 `depositEth` 的目的地址和 retryable 的 refund 地址 [1][2]。
5. **"9/12 是紧急阈值"**：正确 [20]。另外，brief 里"非紧急 7/12"的说法与宪法原文不符，宪法写的是 9-of-12 [20][21]。
6. **"Unsigned 不等于 nonce/余额检查全部跳过"**：已用源码核实 [9][10]。"差额 0.0001 ETH = 100,000 × 1 gwei"在约束层面成立（`buyGas` 要求余额 ≥ `gasLimit×feeCap + value`）[10]，但 `gasLimit` 和 `maxFeePerGas` 的具体字段值本 lane 没有独立解码。
7. **外部调研 4.1 表格"是否需要覆盖强制收录：使用正常跨链输入完成操作"**：本 lane 改成"它本身就是一条 delayed message"，并补充了"不需要改证明程序"的依据（OSP 只校验累加器）[7]。
8. **外部调研没有提到 L2BEAT 的记录**：2026-06-15 的资金释放用的是同一种 Inbox 临时升级机制（"SpoofL2TxAction"）[21]。这一点由交易解析 lane 进一步核实。
9. **ArbOS 61 链接**：外部调研引用的是 `nitro/blob/master/...`（未固定 commit），本 lane 改为固定在 ccc5c82。

---

## 开放问题

1. Arbitrum One 当前的 `ArbOwnerPublic`/ArbOS 状态中，`TransactionFilteringFromTime` 是否为 0？`TransactionFilterers` 列表是否为空？可以用 `eth_call` 读 0x6b/0x74 验证"未启用"的官方声明。本 lane 没有读链。
2. `sendUnsignedTransactionOverride` 的具体实现：是直接把黑客地址作为 Bridge 的 sender，还是先 undo alias？它入队的 `kind` 是 3（L2_MSG）还是 7？需要交易解析 lane 读实现合约 `0x980D1F93…A859` 的源码。
3. 冻结的 L1 交易（03:26:47 UTC）到 L2 执行（约 03:35 UTC）之间有大约 8 分钟窗口。这段时间里黑客的 L2 交易如果抢先，是否会让 unsigned tx 因 nonce 或余额不符而失败？sequencer 在这个窗口有没有做任何配合？公开资料没有说明。
4. 论坛公告写的是 "At 11:26pm ET, 21st April 2026"。按 L1 区块时间 2026-04-21 03:26:47 UTC 换算，美东时间应该是 **4 月 20 日** 23:26 [19]。日期写法可能是笔误，交给交易解析 lane 统一处理。
5. Security Council 是否已按宪法 Section 3 发布正式的 "full transparency report"？本 lane 没有检索到，交给社区观点 lane 跟进。
6. `execution/gethexec` 里 delayed sequencer 遇到被过滤的 delayed message 时，是"停住直到 hash 上链"还是"跳过"？注释暗示前者（"so … the delayed sequencer can advance past it"）[13]，但没有逐行核对 gethexec 的代码。

---

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| M1 | 标准 `AbsInbox.sendUnsignedTransaction` 把 `msg.sender` 作为消息 sender 入队，调用者不能指定 L2 发送者 | nitro-contracts/src/bridge/AbsInbox.sol#L162-L188@ff6334e [1] | observed | |
| M2 | ETH 原生 `Inbox._deliverToBridge` 对所有 sender（EOA 和合约）统一做 `applyL1ToL2Alias` 后再交给 Bridge | nitro-contracts/src/bridge/Inbox.sol#L317-L326@ff6334e [2] | observed | |
| M3 | alias 偏移量是 `0x1111000000000000000000000000000000001111`，按 2^160 取模相加 | AddressAliasHelper.sol#L8-L20@ff6334e [3]；docs l1-to-l2-messaging [23] | observed | |
| M4 | EOA/合约的区分只用于 `depositEth` 的目的地址和 retryable 的 refund 地址 | Inbox.sol#L202-L214、AbsInbox.sol `_createRetryableTicket` [1][2] | observed | |
| M5 | `*ToFork` 系列（undo alias）只能在 chainId 变化后由 EOA 调用 | Inbox.sol#L109-L111、L143-L145 [2] | observed | |
| M6 | 标准实现下，L1 调用者在 L2 只能以 alias(自己) 的身份发 unsigned tx；要以普通 EOA X 的身份发，必须改 Inbox 代码 | 由 M1、M2、M3 推出：From = Poster = alias(L1 caller)，要让 alias(c)=X 必须控制 c = X−OFFSET 的私钥，实际做不到 | inferred | |
| M7 | Bridge 入队只检查调用者是不是 allowlist 里的 Inbox 地址，不检查 Inbox 的实现代码 | AbsBridge.sol#L149-L169@ff6334e [5] | observed | |
| M8 | delayed message 以 `keccak(prevAcc, keccak(kind,sender,block,ts,seq,baseFee,dataHash))` 累加进 `delayedInboxAccs` | AbsBridge.sol#L171-L192；Messages.sol [5] | observed | |
| M9 | `forceInclusion` 要求消息所在 L1 区块 + delayBlocks_ < 当前区块，并校验累加器原像 | SequencerInbox.sol#L292-L310@ff6334e [6] | observed | |
| M10 | Arbitrum One 当前 force inclusion 延迟最大约 1 天（7,200 个 L1 区块），delay buffer 可把下限降到 150 个区块 | L2BEAT 风险表 "1 day, 150-7,200 L1 blocks" [21]；docs sequencer "delayBlocks … 24 hours … threshold 150" [22] | observed | |
| M11 | Sequencer 只决定排序和收录，不决定执行结果；delayed message 由 DelayedSequencer 在 L1 finalize 后纳入 | docs sequencer 原文 "it does not decide execution outcomes" [22] | observed | |
| M12 | `L1IncomingMessage` header 包含 Kind、Poster、L1 区块号、时间戳、RequestId、L1BaseFee | arbostypes/incomingmessage.go#L51-L58@ccc5c82 [8]；docs STF [24] | observed | |
| M13 | `Kind=3/L2Kind=0` 派生 `ArbitrumUnsignedTx`，`From` 直接取 header 的 Poster | parse_l2.go#L121-L126、L244-L255@ccc5c82 [8] | observed | |
| M14 | `Kind=12` 派生 `ArbitrumDepositTx`，`Kind=9` 派生 `ArbitrumSubmitRetryableTx`，`Kind=7` 派生 deposit + unsigned/contract tx | parse_l2.go#L37-L72、L277-L297 [8] | observed | |
| M15 | 通过 SignedTx 路径提交类型号 ≥ 0x64 的 Arbitrum 内部交易会被拒绝 | parse_l2.go#L171-L175 [8] | observed | |
| M16 | 交易类型号：Deposit 0x64、Unsigned 0x65、Contract 0x66、Retry 0x68、SubmitRetryable 0x69、Internal 0x6A | go-ethereum core/types/transaction.go#L47-L54@260bc5d [9] | observed | |
| M17 | `arbitrumSigner.Sender` 对 Unsigned/Contract/Deposit/Retry/SubmitRetryable 直接返回 `inner.From`，不做签名恢复 | go-ethereum core/types/arbitrum_signer.go#L39-L52 [9] | observed | |
| M18 | `ArbitrumUnsignedTx` 的 `skipNonceChecks` 和 `skipTransactionChecks` 都是 false；Contract/Deposit/Retry/SubmitRetryable/Internal 都是 true | arb_types.go#L61-L81@260bc5d [9] | observed | |
| M19 | `buyGas` 要求 From 余额 ≥ gasLimit×GasFeeCap + value，`preCheck` 在不跳过时校验 nonce | state_transition.go#L471-L498、L520-L527@260bc5d [10] | observed | |
| M20 | 冻结交易的 value 比公告余额少 0.0001 ETH，与 buyGas 预留 gasLimit×feeCap 一致（字段值需交易解析 lane 核对） | 由 M19 和外部调研给出的 gasLimit=100,000、feeCap=1 gwei 推出：value ≤ 余额 − 0.0001 ETH | inferred | |
| M21 | OSP 读取 delayed message 时只校验消息哈希能否接上 `bridge.delayedInboxAccs(msgIndex)` | OneStepProverHostIo.sol#L398-L423@ff6334e [7] | observed | |
| M22 | 升级后的 Inbox（代理地址不变）写入的冒充 sender 消息，对 STF 和 BoLD 来说是合法输入，证明系统不会拦截 | 由 M7、M8、M21 推出：Bridge 只认地址，OSP 只认累加器，二者都不校验写入逻辑 | inferred | |
| M23 | Security Council 通过"升级 Inbox → 用 `sendUnsignedTransactionOverride` 冒充 sender 转账 → 恢复实现"完成冻结 | 论坛 30803 #1 原文 "upgrade the inbox contract … impersonate the transaction sender" [19] | observed | |
| M24 | 交易 0x0799… 中 Inbox 实现从 0x7C058…0a10 切到 0x980D1F…A859 再切回 | L2BEAT Inbox 升级记录 2026-04-21 03:26 UTC [21] | observed | |
| M25 | 2026-06-15 的资金释放用了同一种 Inbox 临时升级机制 | L2BEAT 2026-06-15 Inbox 升级记录和 "SpoofL2TxAction mechanism" 描述 [21] | observed | |
| M26 | L1 紧急升级链路：SC Safe 0xF06E…3F85（9/12）→ UpgradeExecutor 0x3ffF…CeDd → ProxyAdmin 0x5547…2dbD → Inbox 0x4Dbd…AB3f，无延迟 | L2BEAT 权限章节 [21] | observed | |
| M27 | 常规升级路径经 L2 Timelock 8 天 + 挑战期 6 天 8 小时 + L1 Timelock 3 天，合计约 17 天 8 小时 | L2BEAT 权限章节 [21] | observed | |
| M28 | 宪法规定 Security Council 12 人，紧急和非紧急行动都需要 9-of-12 | dao-constitution Section 3 原文 "9-of-12 approval" [20] | observed | |
| M29 | 紧急行动只能用于 "true security emergency"，事后必须发 "full transparency report" | dao-constitution Section 3 [20] | observed | |
| M30 | brief 中"非紧急 7/12"与宪法和 L2BEAT 不符 | 由 M28 和 L2BEAT "non-emergency (9/12…)" [21] 推出 | inferred | |
| M31 | One/Nova 的 chain owner 权限授予 DAO 和 Security Council；ArbOS chain owner 包括 L2UpgradeExecutor | dao-constitution Section 1 [20]；L2BEAT "chain owners … on the L2UpgradeExecutor" [21] | observed | |
| M32 | ArbOS 60 Elara AIP 于 2026-03-05 发布，6 月 19 日因 STF 退款 bug 改为 ArbOS 61，范围不变 | 论坛 30601 #1 [18] | observed | |
| M33 | ArbOS 61 链上投票 2026-07-16 至 07-30 通过，2026-08-20 17:00 UTC 在 One/Nova 激活 | docs arbos61 "Activation" [17] | observed | |
| M34 | 官方明确 compliance filtering 在 Arbitrum One/Nova 上 "intentionally disabled" | docs arbos61 [17]；AIP #1 "will not be enabled on Arbitrum One or Nova" [18] | observed | |
| M35 | 启用 filtering 需要 chain owner 调用 ArbOwner 设定生效时间，且必须 ≥ 当前 + 7 天 | ArbOwner.go#L56、L103-L139@ccc5c82 [12]；论坛 30601 #20 [18] | observed | |
| M36 | 只有在 filtering 生效时间到达后，chain owner 才能 `AddTransactionFilterer` | ArbOwner.go#L184-L198 [12] | observed | |
| M37 | 预编译 `ArbFilteredTransactionsManager` 地址为 0x74，只有 TransactionFilterers 成员能增删 hash，非成员调用会 BurnOut | ArbFilteredTransactionsManager.go#L15-L62@ccc5c82 [11]；arbitrum_signer.go#L27 [9] | observed | |
| M38 | 已登记 hash 的普通交易在 STF 中 nonce+1、耗尽剩余 gas、跳过执行 | tx_processor.go#L1089-L1105@ccc5c82 [13] | observed | |
| M39 | 已登记 hash 的 `ArbitrumDepositTx`，资金会被转给 `FilteredFundsRecipient`（默认 networkFeeAccount）而不是原收款人 | tx_processor.go#L245-L267 [13]；ArbOwner.go#L226-L233 [12] | observed | |
| M40 | 已登记的 retryable 提交，FeeRefundAddr 和 Beneficiary 被改成 recipient，并跳过 auto-redeem | tx_processor.go#L285-L306 及 isFiltered 分支 [13] | observed | |
| M41 | 官方文档说被过滤 deposit 的 "credit is dropped"、ETH 可能锁在桥里，与代码中的资金改道行为不一致 | 由 M39 与 compliance-filtering 文档原文 [16] 对比推出 | inferred | |
| M42 | Sequencer 层过滤会在排序前模拟交易，依据 `sha256(salt‖address)` 哈希表和事件规则拒收 | compliance-filtering 文档 [16]；block_processor.go 的 TxFilter/BlockFilter 接口 [14] | observed | |
| M43 | delayed message 的过滤路径是：delayed sequencer 过滤 → transaction-filterer 服务 → 0x74 登记 → STF 失败 | CHANGELOG v3.10.0/rc.1/rc.3 NIT-5012 条目 [15]；tx_processor.go 注释 "delayed sequencer can advance past it" [13]；文档 sentinel 描述 [16] | observed | |
| M44 | filtering 总开关 `TransactionFiltering.Enable` 默认 false | CHANGELOG v3.10.2 "master switch (default false)" [15] | observed | |
| M45 | 外部调研提到的"过滤状态在交易间泄漏"修复对应 v3.11.0-rc.2，属于 sequencer 层 | CHANGELOG v3.11.0-rc.2 "Sequencer no longer rejects clean transactions following a filtered one" [15] | observed | |
| M46 | burn 例外：Transfer 的 to 为 0x0 时即使 from 受限也放行，但受限地址本人作为 tx.origin 仍被拦 | compliance-filtering 文档 "Exception rules" [16] | observed | |
| M47 | ArbOS 61 filtering 不能冒充用户发起交易，只能让交易失败或改道资金；KelpDAO 机制能冒充 sender | 由 M37、M38、M39 与 M23 对比推出 | inferred | |
| M48 | 用户记忆中的"ArbOS 升级引入的 sequencer 级操作"对应 ArbOS 61 Compliance Filtering，而不是 KelpDAO 冻结机制 | 由 M23、M33、M34 推出：冻结发生在 2026-04-21，ArbOS 61 于 2026-08-20 才激活，且在 One 上未启用 | inferred | |
| M49 | 冻结发生时 Elara 提案（含 compliance filtering）正处于论坛讨论和链下投票阶段，可能是用户记忆错位的来源 | 由 M32 和 L2BEAT 2026-04-14 投票帖 [18] 推出 | speculative | |
| M50 | L2BEAT 治理团队认为把 filtering 放进核心栈可能影响 Stages 框架，只要在 One/Nova 上保持禁用就不构成阻碍 | 论坛 30601 #16 krst 原文 [18] | observed | |
| M51 | 干预层①（sequencer 拒收）可以被 force inclusion 在约 1 天后绕过 | 由 M9、M10、M11 推出 | inferred | |
| M52 | 干预层②（STF 规则）不能被 force inclusion 绕过，因为规则在 STF 里对 delayed 交易同样生效 | M38；compliance-filtering 文档 "Force inclusion protection" [16] | observed | |
| M53 | 干预层④（改输入入口）不需要改证明程序 | 由 M21、M22 推出 | inferred | |
| M54 | 干预层⑤（硬分叉改状态）需要新的 STF/WASM 模块根，权力属于 chain owner（DAO 或 SC 紧急行动） | AIP #1 "ArbOS upgrade … equivalent of a hard fork" [18]；宪法 "execute any software upgrade" [20]；由此推出需要改证明程序 | inferred | |
| M55 | 原生 ETH 没有资产合约层的冻结能力，只能走层①②④⑤ | 由 M17、M19 推出：ETH 是账户余额，转账不经过任何 token 合约 | inferred | |
| M56 | 论坛公告的 "11:26pm ET, 21st April" 与 L1 区块时间 2026-04-21 03:26:47 UTC（美东 4 月 20 日）不符 | 论坛 30803 #1 [19]；brief 已知事实的区块时间；UTC−4 换算 | inferred | |
| M57 | Arbitrum One 当前的 ArbOS v61 wasmModuleRoot 是 0xc10cd7ec…dc97 | docs arbos61 [17]；L2BEAT Program Hashes [21] | observed | |

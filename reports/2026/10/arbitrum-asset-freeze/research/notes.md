# 调研笔记索引：Arbitrum 冻结黑客资产

调研分五册完成（2026-10-07；网页来源均在当天访问）。源码固定：nitro-contracts @ `ff6334e`、nitro @ `ccc5c82`、OffchainLabs/go-ethereum @ `260bc5d`、mantle-v2 @ `da45c31`。链上数据来自 Ethereum / Arbitrum 公共 RPC 和 eth.blockscout.com。合并台账见 [ledger.md](ledger.md)（214 行：observed 164 / inferred 37 / speculative 13）。外部调研（ChatGPT Deep Research）已用 `rh import research` 存为 [censor-users-on-arbitrum.md](censor-users-on-arbitrum.md)，只当线索使用。

| 分册 | brief 研究问题 | 一句话答案 |
|---|---|---|
| [notes-mechanism.md](notes-mechanism.md)（M） | 1 机制与背景 | 冻结是“改输入入口”：Security Council（9/12）临时升级 L1 Inbox，以黑客地址为 sender 写入一条 delayed message，ArbOS 照常派生成 `ArbitrumUnsignedTx`（0x65）。Bridge 只认 Inbox 地址，BoLD 的 OSP 只认 delayed 累加器，所以证明系统不会拦。ArbOS 61 Compliance Filtering 是另一套机制：sequencer 层过滤，加上 STF 层按交易 hash 强制失败（预编译 0x74）。它在 2026-08-20 才激活，而且在 One / Nova 上“intentionally disabled”。用户记成的“ArbOS 升级引入的 sequencer 级操作”对应的是后者。 |
| [notes-tx.md](notes-tx.md)（T，主会话） | 2 交易逐步解析 | L1 交易 `0x0799…` 里，Safe 带 9 个签名，通过 MultiSend 做两件事：用 CREATE2 现场部署补丁 Inbox 和 `SpoofL2TxAction`；再由 UpgradeExecutor delegatecall action，依次执行“升级 → `sendUnsignedTransactionOverride` 入队 msg #2416814 → 改回原实现”。501 秒后，L2 执行 0x65 交易：签名全 0、nonce 0，转出 30,765.667401709008927568 ETH（比公告少 0.0001 ETH，正好是 gas 预留）。6 月 15 日，L1 Timelock 走常规治理路径，复用同一组合约把资金转给 Aave LLC 的 Safe。补丁源码、调用树、消息哈希、余额尾数都已在本地复核。 |
| [notes-views.md](notes-views.md)（V） | 3 社区与 KOL 观点 | 几乎所有人都支持“这一次”的结果（释放资金的 Snapshot 90.96% 赞成），但很多是有条件支持：承认 ETH “未经用户同意被移动”，认为这项能力“不限于救援”，要求公布触发标准和处置政策。L2BEAT 追问 “why this case and not others”。冻结后 10 天，DPRK 判决债权人就向“Arbitrum DAO”送达限制令，“冻结 → 链被法律体系拉进来”这一风险已经兑现。利益相关方全部支持；明确反对的多是 X 上影响力有限的账号。 |
| [notes-precedents.md](notes-precedents.md)（P） | 4 其他链先例与公众认可 | 先例按机制分为：sequencer 停摆（Linea）、验证者 / 节点拒收（Sui、Gnosis soft fork、BSC）、硬分叉或不规则状态变更（The DAO、Gnosis、Berachain、Flow）、发行方冻结（USDC、USDT、XRPL、Stellar）。Arbitrum 是唯一只靠多签升级 L1 合约、不需要节点配合就完成划转的案例。被接受的案例有三个共同点：范围窄、多数背书、资金托管透明。EIP-999 和 Flow 回滚方案被放弃。L2BEAT Stage 1 允许 Security Council 这样做；Stage 2 按定义不允许。 |
| [notes-mantle.md](notes-mantle.md)（O，主会话） | 5 对 Mantle 的意义 | 结构上有同类能力。OP Stack deposit（0x7E）的 `from` 只由 OptimismPortal 代理地址的日志认证。Mantle 的 Portal 可由 MantleSecurityMultisig（6/14）无延迟升级，门槛低于 Arbitrum 的 9/12。和 Arbitrum 相比，Mantle 的 deposit 不需要 gas 预留，也没有 nonce 竞争，但有 MNT / BVM_ETH 两个铸造字段，必须守住资产守恒。OP Succinct 证明是否接受这类输入，需要测试网实测。Mantle 没有对应 ArbOS 61 的交易过滤。 |

## 主会话抽查（2026-10-07）

- M38：`nitro/arbos/tx_processor.go#L1089-L1105@ccc5c82`，已登记 hash 的交易 nonce+1、耗尽剩余 gas、跳过执行。与源码一致。
- M37：`ArbFilteredTransactionsManager` 地址 0x74（预编译注释和 `arbitrum_signer.go#L27`）。一致。
- M33 / M34：docs arbos61 原文：“activates on Arbitrum One and Nova on Thursday, August 20, 2026 at 17:00 UTC”，“left intentionally disabled on Arbitrum One and Nova”，投票 7-16 至 7-30。一致。
- V7：Snapshot GraphQL 返回 For 182,176,773 / Against 1,738 / Abstain 18,102,392，1,693 票。一致。
- P13：Sui PR #22237 原文：“address aliases which allow a signature from address A to act as the sender address B … restricted to a specified set of TransactionDigests”，2025-05-30 合并。一致。
- T 分册与 M 分册交叉核对：M20（0.0001 ETH 差额的推断）由 T8 / T19 的字段解码证实；M24 / M25（L2BEAT 的升级记录）由 T4 / T21 / T25 的链上 trace 证实。

## 资料（外部调研）中被修正或补充的地方

- **用户记忆的修正**：冻结不是 ArbOS 升级引入的 sequencer 功能。冻结发生在 2026-04-21，ArbOS 61（含 Compliance Filtering）在 2026-08-20 才激活，而且在 One 上禁用（M48）。
- 外部调研 §2.3 说没有复核内部调用和临时实现。现在已经完整还原：两个 CREATE2 部署、补丁 Inbox 与原实现的 diff、`SpoofL2TxAction` 源码、消息哈希复算（T 分册）。
- 补丁函数本身没有权限检查，源码注释写明不原子执行会让 bridge “fully drainable by anyone”。安全性完全依赖“同一笔交易里换上、用完、换回”（T10）。
- 6 月释放的授权方是 L1 Timelock（常规宪法治理路径），复用了 4 月部署的同一组合约（T21）。外部调研只写了 L2 侧。
- 被过滤的 `ArbitrumDepositTx` / retryable 不是简单失败，而是把资金改道到 `FilteredFundsRecipient`。官方文档写 “credit is dropped”，与代码不一致（M39–M41）。
- 宪法把紧急行动限定为影响 “a chain governed by the ArbitrumDAO” 的安全紧急情况，而 KelpDAO 漏洞在 Arbitrum 协议之外；宪法要求的透明度报告目前没找到（V26–V29）。
- 外部调研漏掉了判决债权人限制令、L2BEAT 的两次表态、法律风险类观点（V 分册），以及 Gnosis、Berachain、Flow、BSC nanofork 等先例（P 分册）。BSC 的攻击地址黑名单已经通过 v1.1.15 硬分叉写进客户端，外部调研说“不能认定已实施”不准确（P7）。
- 论坛公告的日期“21st April 11:26pm ET”写错了一天，应为美东 4 月 20 日（V4、V5、M56）。

## 开放问题

- 攻击者的 ETH 如何来到 Arbitrum（二手报道说是用 rsETH 在 Aave 借出 WETH），没有用链上数据核实。
- 9 个签名对应哪 9 名 Council 成员，没有恢复。
- 宪法要求的事后透明度报告是否发布（V28，speculative）。
- 链上 AIP（释放资金）的票数没有拿到（V13）。
- SDNY 后续的实体裁决、Aave LLC 收到资金后的处置，截至 2026-10-07 没有查到。
- Mantle：OP Succinct 程序是否对 deposit 来源有额外约束（O19）；合约 / 7702 地址作为 deposit `from` 的行为（O24）；Mantle 有没有成文的紧急行动规则（O25）。

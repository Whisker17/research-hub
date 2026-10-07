# Lane O：Mantle 上的类似路径与可行性（brief 研究问题 5，主会话）

**研究问题**：Mantle（OP Stack 分支 + OP Succinct）上有没有和 Arbitrum KelpDAO 冻结类似的路径？前提是什么，风险在哪里？只做机制可行性分析，不针对具体事件，不写操作手册。
**一句话答案**：结构上有。OP Stack 的 deposit 交易（0x7E）同样不带签名，`from` 只由“L1 deposit 合约（OptimismPortal 代理地址）发出的 `TransactionDeposited` 日志”认证。Mantle 的 OptimismPortal 可由 MantleSecurityMultisig（6/14）经 ProxyAdmin **无延迟**升级。所以，与 Arbitrum 升级 Inbox 对应的治理能力在 Mantle 上同样存在，而且门槛更低（6/14 对 9/12）。差异有四点：deposit 的 gas 在 L1 购买，不需要像 Arbitrum 那样留 gas 预留；deposit 没有 nonce，靠 `sourceHash` 区分，不存在 nonce 竞争；Mantle 的原生币是 MNT，ETH 是 BVM_ETH，资产语义不同；OP Succinct 证明是否对这类输入有额外约束，需要实测。另外，Mantle 没有对应 ArbOS 61 的 STF 层交易过滤。

数据于 2026-10-07 读取。源码：mantle-v2 @ `da45c315d800e5040ee8625d46319a03d4064803`（2026-09-23）。链上：Ethereum RPC `cast call`。L2BEAT 页面最近一次更新是 2026-09-17。

---

## 1. Mantle 当前架构

**答案**：Mantle 是 Stage 0 ZK Rollup，链 ID 5000，gas 代币是 MNT。交易数据发到 Ethereum blobs（2026-04-16 Arsia 升级后不再用 EigenDA）。状态由 OP Succinct（SP1）有效性证明验证，执行延迟 12 小时。系统也能切换到不需要证明的“乐观模式” [1]。

**依据**：
- L2BEAT：“Mantle is a Stage 0 ZK Rollup”；“Transaction data is posted to Ethereum blobs and state transitions are validated onchain via OP Succinct ZK validity proofs (SP1)”；2026-04-16 “Arsia upgrade: full Ethereum DA. EigenDA code path removed” [1]。
- L2BEAT 风险摘要第一条：“Funds can be stolen if a contract receives a malicious code upgrade. There is no delay on code upgrades (CRITICAL)”；退出窗口为 “None” [1]。
- 强制收录：“users can force transactions to be included in the project's chain by sending them to L1. There can be up to a 12h delay on this operation.” [1]

## 2. 权限结构

| 角色 | 地址 / 门槛 | 能做什么 | 依据 |
|---|---|---|---|
| MantleSecurityMultisig | `0x4e59e778a0fb77fBb305637435C62FaeD9aED40f`，6/14 | 经 ProxyAdmin `0xca35…7794` **无延迟**升级 OptimismPortal、L1StandardBridge、L1CrossDomainMessenger、SystemConfig、OPSuccinctL2OutputOracle；切换乐观 / ZK 模式、换 vkey 与 verifier；经 1 天 Timelock 升级 MNT 代币 | [1]；链上 threshold / owners [3] |
| MantleEngineeringMultisig | `0x2F44BD2a54aC3fB20cd7783cF94334069641daC9`，3/7 | OptimismPortal 的 GUARDIAN，可以暂停提款；作为 challenger 可删除已提交的状态根、开关乐观模式 | [1]；`GUARDIAN()` [3] |
| Sequencer | 单一运营者（L2BEAT “centralized operator”） | 决定排序；不能永久跳过 deposit | [1][5] |

链上核对（2026-10-07）[3]：OptimismPortal 代理 `0xc54cb22944F2bE476E02dECfCD7e3E7d3e15A8Fb`，当前实现 `0xe1399f54ba2597b4EaDA9E3450c34D393fb131A7`；代理 admin = ProxyAdmin `0xca35F8338054739D138884685e08b39EE2217794`；ProxyAdmin `owner()` = MantleSecurityMultisig；Safe `getThreshold()` = 6，owners 14 个；Portal `version()` = "1.7.0"，`paused()` = false，`GUARDIAN()` = MantleEngineeringMultisig。

## 3. L1→L2 输入路径与 Arbitrum 的对应关系

**答案**：两者的认证模型相同，都是“L2 信任某个 L1 合约地址发出的记录”。Arbitrum 的记录是 Bridge 里 allowlist Inbox 写入的 delayed message。Mantle 的记录是 OptimismPortal 代理地址发出的 `TransactionDeposited` 日志。两者都只认地址，不认代码。

**依据**：
- Mantle Portal `depositTransaction`：`from = msg.sender`；调用者是合约（`msg.sender != tx.origin`）时才做 alias；然后 `emit TransactionDeposited(from, _to, DEPOSIT_VERSION, opaqueData)`。`opaqueData = abi.encodePacked(_mntValue, _mntTxValue, msg.value, _ethTxValue, _gasLimit, _isCreation, _data)` [2] OptimismPortal.sol#L379-L427。部署实现 `0xe1399f…` 的已验证源码中，这个函数和 mantle-v2 HEAD 只有格式差异，逻辑相同 [4]。
- op-node 派生：`UserDeposits` 只收 `log.Address == depositContractAddr && Topics[0] == DepositEventABIHash` 的日志 [2] deposits.go#L14-L22；`UnmarshalDepositLogEvent` 直接从 `Topics[1]` 读 `from` [2] deposit_log.go#L36-L51；Mantle 版本额外解析 `Mint`（MNT）、`EthValue`、`EthTxValue` [2] deposit_log.go#L109-L184。
- OP 规范：deposit 交易“do not include signature validation”；“authorization is handled by the L2 chain derivation process, which when correctly applied will only derive transactions with a `from` address attested to by the logs of the L1 deposit contract.” 规范还写明，deposit 交易不含 `nonce`，用 `sourceHash` 唯一标识；“They buy their L2 gas on L1 and, as such, the L2 gas is not refundable.” [5]
- 派生和证明认的是 rollup config 里的 deposit 合约**地址**。升级 Portal 实现不会改变这个地址。

**推论（inferred）**：MantleSecurityMultisig 在结构上拥有和 Arbitrum Security Council 同类的能力。它可以临时换掉 Portal 实现，让 Portal 发出 `from` 为任意地址的 `TransactionDeposited` 日志；派生程序会把它当成合法 deposit。这和 L2BEAT 的风险提示一致（“malicious code upgrade … no delay”）。本 lane 不给出实现细节；它是否真的能通过 OP Succinct 证明，需要在测试网完整走一遍（speculative）。

## 4. 与 Arbitrum 的关键差异

| 维度 | Arbitrum（KelpDAO 案例） | Mantle / OP Stack | 依据 |
|---|---|---|---|
| 认证入口 | Bridge allowlist 里的 Inbox 合约 | OptimismPortal 代理地址发出的日志 | T11、M7；[2][5] |
| 谁能换入口代码 | Security Council 9/12（紧急，无延迟）或 DAO 常规路径（约 17 天） | MantleSecurityMultisig 6/14，无延迟 | M26–M28；[1][3] |
| 合成交易类型 | `ArbitrumUnsignedTx` 0x65 | deposit 交易 0x7E | M16；[5] |
| nonce | 有，要和账户当前 nonce 一致 | 没有，用 sourceHash 标识 | M18–M19；[5] |
| gas | 从 `from` 的 L2 余额扣，value 必须留出 gasLimit × feeCap | 在 L1 购买，不从 `from` 的 L2 余额扣 | T19；[5] |
| 原生资产 | ETH | MNT（L2 原生），ETH 在 L2 是 BVM_ETH | [1][2] |
| 输入能否被跳过 | delayed message 最长约 1 天后可以 force include | deposit 必须在 sequencing window 内纳入，L2BEAT 写最长 12 小时 | M10；[1][5] |
| STF 层交易过滤 | ArbOS 61 有，但在 One / Nova 上禁用 | 没有找到对应功能 | M34；[2] |
| 证明系统 | BoLD 只校验 delayed 累加器 | OP Succinct 证明派生和执行；派生按 rollup config 里的 deposit 合约地址取日志 | M21；[1][2] |

## 5. 其他可选路径

1. **Sequencer 拒绝收录**：运营者可以不排攻击者的普通交易。但攻击者可以从 L1 走 deposit，最长 12 小时后被强制纳入 [1][5]。它只能争取时间，不能冻结资产（inferred）。
2. **Guardian 暂停**：Mantle Portal 的 `paused` 注释写明“When set to true, withdrawals are paused”；`depositTransaction` 没有 `whenNotPaused` 修饰 [2] OptimismPortal.sol#L67-L69、L379-L390。所以暂停只挡住通过官方桥提款，挡不住 L2 内部转账、DEX 交易和第三方跨链桥（inferred）。
3. **资产合约层**：资产发行方有没有冻结或拉黑能力，要逐个资产核实。本次没有逐个核实 Mantle 上主要资产的发行方权限（开放问题）。
4. **硬分叉 / 状态覆盖**：需要所有节点和 OP Succinct 程序一起升级，还要更新链上 vkey。MantleSecurityMultisig 可以无延迟更新 vkey 和 rollupConfigHash [1]，但节点运营者和生态要跟随新版本（inferred）。
5. **常设的 STF 过滤**：mantle-v2 的派生代码里没有交易过滤逻辑。`deposit_7708_filter_test.go` 是 EIP-7708 日志兼容测试，不是过滤功能 [2]。

## 6. 风险与前提（给页面用）

- **mint 字段**：Mantle deposit 有 `Mint`（MNT）和 `EthValue` 两个“铸造”字段 [2]。恢复动作如果填了非零铸造字段，就会在 L2 凭空增发，而 L1 并没有锁定对应资产。Arbitrum 的补丁函数用 `amount = 0` 避免了这一点（T14）。所以“资产守恒”是必须验证的不变量（inferred）。
- **时序窗口**：L1 入队到 L2 执行之间存在延迟（Arbitrum 案例 8 分 21 秒，T18）。攻击者在这段时间里仍然可以通过 sequencer 转走资产（inferred）。
- **合约账户**：如果攻击地址是合约，或已经用 EIP-7702 设置了代码，deposit 能否以它为 `from` 执行、行为是否一致，需要实测（speculative）。
- **资产形态**：资产如果已经存进借贷、LP 或跨链流程，转走原生余额不等于追回头寸（inferred）。
- **治理先例**：Mantle 的门槛是 6/14，没有延迟，也没有像 Arbitrum 宪法那样写成文的“紧急行动”条款（本次没找到 Mantle 的对应文件，开放问题）。一旦使用，外界会按 L2BEAT 的 “funds can be stolen if …” 那条风险重新评估 Mantle（inferred）。

## 7. 图的素材

- Arbitrum 与 Mantle 的输入路径并排：L1 用户 → Inbox → Bridge（delayedInboxAccs）→ ArbOS → 0x65 ‖ L1 用户 → OptimismPortal（TransactionDeposited）→ op-node 派生 → 0x7E。两边的“可升级入口”都由一个多签控制：Arbitrum SC 9/12 → UpgradeExecutor → ProxyAdmin；Mantle Security MS 6/14 → ProxyAdmin。

## 8. 来源

1. **PRIMARY** L2BEAT Mantle 项目页 https://l2beat.com/scaling/projects/mantle （Stage、DA、证明、权限、风险摘要、强制收录 12h；最近更新 2026-09-17）。访问于 2026-10-07。
2. **PRIMARY** mantle-v2 @ da45c31：`packages/contracts-bedrock/src/L1/OptimismPortal.sol`、`op-node/rollup/derive/deposits.go`、`deposit_log.go`、`deposit_7708_filter_test.go`。
3. **PRIMARY** Ethereum 主网链上读数（`cast implementation/admin/call`）：Portal 代理实现、ProxyAdmin owner、Safe threshold / owners、GUARDIAN、version、paused。2026-10-07。
4. **PRIMARY** 部署的 OptimismPortal 实现已验证源码 https://eth.blockscout.com/api/v2/smart-contracts/0xe1399f54ba2597b4EaDA9E3450c34D393fb131A7 ，与 mantle-v2 的 depositTransaction 做 diff。2026-10-07。
5. **PRIMARY** OP Stack 规范 Deposits https://specs.optimism.io/protocol/deposits.html （0x7E 字段、无签名、from 认证、无 nonce、L1 购买 gas）。访问于 2026-10-07。

## 9. 外部调研中被修正或补充的地方

- 外部调研 §5.1 引用 L2BEAT 的权限描述（6/14、3/7、12 小时）。现已用链上读数核实 threshold、owners、ProxyAdmin owner 和 GUARDIAN。
- 外部调研把 OP deposit “不需要 gas 预留、没有 nonce”只当作重放保护的提示。这里补充：它们正好消除了 Arbitrum 案例里的两个工程约束（value 留出 gas、nonce 必须匹配）。
- 外部调研 §5.5 提醒 mint 与 value 的区别。这里补充：Mantle 有 MNT 的 `Mint` 和 `EthValue` 两个铸造字段，比上游 OP 多一个。

## 10. 开放问题

- OP Succinct（mantle-xyz/op-succinct `mantle-v1.6.1`）的 range 程序在派生 deposit 时，是否只按 rollup config 里的 deposit 合约地址取日志、没有其他约束？本次没有读程序源码，要在测试网验证。
- deposit 交易以合约地址或 EIP-7702 授权地址为 `from` 时，Mantle op-geth 怎么处理（EIP-3607 是否对 deposit 豁免）。
- Mantle 有没有成文的紧急行动规则或治理授权（类似 Arbitrum 宪法第 3 节）。
- Mantle 上主要资产的发行方冻结权限，没有逐个核实。

## 11. 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| O1 | Mantle 是 Stage 0 ZK Rollup，链 ID 5000，gas 代币是 MNT | [1] Summary 与 Stage 节 | observed | |
| O2 | Mantle 交易数据发到 Ethereum blobs，2026-04-16 Arsia 升级后移除了 EigenDA 路径 | [1] Milestones 2026-04-16 | observed | |
| O3 | Mantle 状态由 OP Succinct（SP1）有效性证明验证，执行延迟 12 小时，系统可切换到无证明的乐观模式 | [1] State validation 节 | observed | |
| O4 | L2BEAT 风险摘要第一条：合约被恶意升级可导致资金被盗，代码升级没有延迟（CRITICAL）；退出窗口为 None | [1] Risk summary / Exit window | observed | |
| O5 | 用户可以通过 L1 强制收录交易，最长延迟 12 小时 | [1] Sequencer failure 节 | observed | |
| O6 | MantleSecurityMultisig（0x4e59…D40f）门槛 6/14，可经 ProxyAdmin 无延迟升级 OptimismPortal、L1StandardBridge、L1CrossDomainMessenger、SystemConfig、OPSuccinctL2OutputOracle | [1] Permissions 节；[3] getThreshold=6、owners 14 | observed | |
| O7 | OptimismPortal 代理 0xc54c…A8Fb 的当前实现是 0xe1399f…31A7，admin 是 ProxyAdmin 0xca35…7794，ProxyAdmin owner 是 MantleSecurityMultisig | [3] cast implementation / admin / owner() | observed | |
| O8 | MantleEngineeringMultisig（3/7）是 Portal 的 GUARDIAN，可以暂停提款 | [1]；[3] GUARDIAN() | observed | |
| O9 | MantleSecurityMultisig 可以无延迟更换 SP1 vkey、verifier 地址和 rollupConfigHash，并切换乐观 / ZK 模式 | [1] OPSuccinctL2OutputOracle 权限描述 | observed | |
| O10 | Mantle Portal 的 depositTransaction 以 msg.sender 为 from，只在调用者是合约时做 alias，然后发出 TransactionDeposited 事件 | [2] OptimismPortal.sol#L379-L427@da45c31 | observed | |
| O11 | 部署实现 0xe1399f… 的 depositTransaction 与 mantle-v2 HEAD 只有格式差异，逻辑相同 | [4] 已验证源码 diff | observed | |
| O12 | op-node 只把 deposit 合约地址发出、topic0 匹配的日志当作 deposit，from 直接取自 Topics[1] | [2] deposits.go#L14-L22、deposit_log.go#L36-L51 | observed | |
| O13 | Mantle 的 deposit 比上游 OP 多出 MNT 的 Mint、EthValue、EthTxValue 等字段 | [2] deposit_log.go#L109-L184；OptimismPortal.sol opaqueData | observed | |
| O14 | OP 规范：deposit 交易不做签名验证，from 由派生过程按 L1 deposit 合约日志认证 | [5] “Validation and Authorization of Deposited Transactions” | observed | |
| O15 | OP 规范：deposit 交易没有 nonce，用 sourceHash 唯一标识；L2 gas 在 L1 购买 | [5] “The Deposited Transaction Type” | observed | |
| O16 | Mantle 的治理多签在结构上拥有和 Arbitrum Security Council 同类的能力：换掉入口合约实现，就能产生 from 为任意地址的合法 L1→L2 输入 | 由 O7、O10、O12、O14 推出：派生只认 Portal 代理地址的日志，代理实现可由 6/14 无延迟替换；与 T7、T11、M22 的 Arbitrum 结构同构 | inferred | |
| O17 | Mantle 上这类操作的批准门槛（6/14、无延迟）低于 Arbitrum 紧急路径（9/12、无延迟） | 由 O6、M28 推出 | inferred | |
| O18 | 在 Mantle 上，这类恢复交易不需要像 Arbitrum 那样在 value 里留出 gas 预算，也没有 nonce 竞争 | 由 O15 与 T19、M18、M19 对比推出 | inferred | |
| O19 | 这类输入能否通过当前 OP Succinct 证明，本次没有验证，需要测试网实测 | 未读 op-succinct range 程序；开放问题 1 | speculative | |
| O20 | Guardian 暂停只影响提款，depositTransaction 没有 whenNotPaused，所以暂停挡不住 L2 内部转账 | [2] OptimismPortal.sol#L67-L69、L379-L390 | observed | |
| O21 | 只靠 sequencer 拒收不能冻结资产，攻击者可以在最长 12 小时后经 L1 强制收录 | 由 O5、[5] 推出 | inferred | |
| O22 | mantle-v2 派生代码里没有对应 ArbOS 61 的交易过滤逻辑；deposit_7708_filter_test.go 是 EIP-7708 日志兼容测试 | [2] op-node/rollup/derive 目录与该测试文件注释 | observed | |
| O23 | 恢复动作若填写非零 Mint / EthValue，会在 L2 凭空增发、破坏桥的资产守恒；Arbitrum 补丁用 amount=0 避免了这一点 | 由 O13 与 T14 推出 | inferred | |
| O24 | 以合约地址或 EIP-7702 授权地址为 from 的 deposit 能否正常执行，需要实测 | 未验证 op-geth 对 deposit 的 EIP-3607 处理 | speculative | |
| O25 | 本次没有找到 Mantle 成文的紧急行动规则（类似 Arbitrum 宪法第 3 节） | docs.mantle.xyz 与 L2BEAT 页面未提及；开放问题 3 | speculative | |

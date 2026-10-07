# Lane T：冻结交易逐步解析（brief 研究问题 2，主会话）

**研究问题**：KelpDAO 冻结的 L1 治理交易 `0x0799…f770` 和 L2 交易 `0x5618…0f6b` 每一步做了什么？之后资金怎么被释放？
**一句话答案**：一笔 L1 交易里，Security Council Safe（9 个签名）通过 MultiSend 做了两件事。第一件，用 CREATE2 现场部署两个合约：打了补丁的 Inbox 实现、一次性的 `SpoofL2TxAction`。第二件，让 UpgradeExecutor delegatecall `SpoofL2TxAction.execute`：读当前实现 → 升级 Inbox → 调 `sendUnsignedTransactionOverride` 以攻击者地址入队一条 delayed message → 把 Inbox 改回原实现。8 分 21 秒后，Arbitrum 把这条消息派生成一笔 `ArbitrumUnsignedTx`（0x65，签名全 0，nonce 0），从攻击者地址把 30,765.667401709008927568 ETH 转到 `0x…0DA0`。6 月 15 日，L1 Timelock 走常规治理路径，复用同一个 action 和补丁实现，以 `0x…0DA0` 为 sender 把资金转给 Aave LLC 的 Safe。

所有数据于 2026-10-07 读取：Ethereum RPC `https://ethereum-rpc.publicnode.com`、Arbitrum RPC `https://arb1.arbitrum.io/rpc`、`eth.blockscout.com` API（trace、logs、已验证源码）。两个 RPC 都不提供历史状态，所以历史余额用“当前余额 + 交易字段”推算。

---

## 1. 参与合约（Ethereum 主网）

| 角色 | 地址 | 依据 |
|---|---|---|
| 提交交易的 EOA | `0x10590a5c93E8695bDb134c22f04C4d5b50755DC4`（nonce 223） | [1] |
| Security Council 紧急 Safe | `0xF06E95eF589D9c38af242a8AAee8375f14023F85`（当前 threshold 9，owners 12） | [1][6] |
| MultiSendCallOnly | `0x40A2aCCbd92BCA938b02010E17A5b8929b49130D` | [2] |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | [2] |
| CREATE2 确定性部署器 | `0x4e59b44847b379578588920cA78FbF26c0B4956C` | [2] |
| UpgradeExecutor（代理） | `0x3ffFbAdAF827559da092217e474760E2b2c3CeDd`（实现 `0x3d745b88…7932`） | [2] |
| ProxyAdmin | `0x554723262467F125Ac9e1cDFa9Ce15cc53822dbD`（owner = UpgradeExecutor） | [2][6] |
| Inbox（代理） | `0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f` | [2][3] |
| 原 Inbox 实现 | `0x7C058ad1D0Ee415f7e7f30e62DB1BCf568470a10` | [3] |
| 补丁 Inbox 实现（本交易现场部署） | `0x980D1F93FC5809c828539c46084801673FA6A859` | [2][4] |
| SpoofL2TxAction（本交易现场部署） | `0x3d456FCd62f5baBCf3263B72fb4ac8fF8cc5a322` | [2][5] |
| Bridge（代理） | `0x8315177aB297bA92A06054cE80a67Ed4DBd7ed3a`（4 月实现 `0x93e8f923…b898`；6 月实现 `0xfE474906…2418`） | [2][8] |

UpgradeExecutor 的 `EXECUTOR_ROLE` 当前授予两个地址：Security Council Safe `0xF06E…3F85`，以及 L1 Timelock `0xE6841D92B0C345144506576eC13ECf5103aC7f49` [6]。

## 2. L1 交易 `0x079984c5…f770` 逐步拆解

区块 24925592，2026-04-21 03:26:47 UTC，交易序号 1，状态成功 [1]。

**第 0 步：Safe 验签。** 顶层调用是 `execTransaction(to=MultiSendCallOnly, operation=1 (delegatecall), data=multiSend(...))`。`signatures` 长 585 字节 = 9 × 65，也就是 9 个签名，正好等于 threshold 9 [1][6]。

**第 1 步：MultiSend 子调用 #0：`Multicall3.aggregate3`。** 两次调用 CREATE2 部署器，部署两个合约 [2]：
- 补丁 Inbox 实现 `0x980D…A859`（构造参数 `maxDataSize = 0x1cccc = 117964`，与原实现相同）。
- `SpoofL2TxAction` `0x3d456…a322`（构造参数 `patchedInboxImpl = 0x980D…A859`）。

**第 2 步：MultiSend 子调用 #1：`UpgradeExecutor.execute(SpoofL2TxAction, data)`。** UpgradeExecutor 以 delegatecall 执行 action，所以 action 里的 `msg.sender` 视角是 UpgradeExecutor，也就是 ProxyAdmin 的 owner [2][5]。解码后的参数 [1]：

```
execute(
  proxyAdmin   = 0x5547…2dbD,
  inbox        = 0x4Dbd…AB3f,
  gasLimit     = 100000,
  maxFeePerGas = 1000000000      // 1 gwei
  nonce        = 0,
  to           = 0x…0DA0,
  value        = 30765667401709008927568,   // 30,765.667401709008927568 ETH
  data         = 0x,
  from         = 0x5d3919F12bCc35c26Eee5F8226A9bee90c257Ccc
)
```

**第 3 步：action 内部（trace index 11–20 与 logs 4–8）** [2]：
1. `ProxyAdmin.getProxyImplementation(inbox)` → `0x7C05…0a10`（staticcall）。
2. `ProxyAdmin.upgrade(inbox, 0x980D…)` → log 4 `Upgraded(0x980D…A859)`。
3. `Inbox.sendUnsignedTransactionOverride(...)`（代理 delegatecall 到补丁实现）→ `Bridge.enqueueDelayedMessage` → log 5 `MessageDelivered`：
   - `messageIndex = 2416814`，`kind = 3`（L2_MSG），`sender = 0x5d39…7Ccc`，`messageDataHash = 0x62f5e672…8d1c`，`baseFeeL1 = 219119528`，`timestamp = 1776742007`。
   - log 6 `InboxMessageDelivered(2416814, data)`：`data` 161 字节 = `0x00`（`L2MessageType_unsignedEOATx`）‖ gasLimit ‖ maxFeePerGas ‖ nonce ‖ to ‖ value ‖（空 data）。本地 `keccak256(data)` = `0x62f5e672…8d1c`，与链上 `messageDataHash` 一致 [2]。
4. `ProxyAdmin.upgrade(inbox, 0x7C05…)` → log 7 `Upgraded(0x7C05…0a10)`。
5. log 8 `UpgradeExecuted(0x3d456…, 0, data)`；log 9 Safe `ExecutionSuccess`。

**sender 为什么等于攻击者地址。** 补丁函数先 `undoL1ToL2Alias(from)`，`Inbox._deliverToBridge` 再统一 `applyL1ToL2Alias(sender)`，两者抵消，所以 `MessageDelivered.sender` 正好是 `from` [4]。

**原子性。** 补丁实现在同一笔交易里被换上、使用、换下。现在 Inbox 代理指回 `0x7C05…0a10` [6]。补丁函数除了 `onlyAllowed`（allowlist 关闭时无效）和 `whenNotPaused` 外没有访问控制。源码注释写明：“Intended for atomic upgrade-call-restore via SpoofL2TxAction; otherwise any gap leaves the bridge fully drainable by anyone.” [4]

**没有新铸 ETH。** 补丁函数调用 `_deliverMessage(..., amount = 0)`，L1 没有向 Bridge 转入 ETH。L2 上转出的 value 来自攻击者在 L2 的已有余额 [4]。

## 3. 补丁 Inbox 与原实现的差异

对 Blockscout 上两个已验证实现做 diff（同为 `src/bridge/Inbox.sol`，solc 0.8.17）[3][4]。只有两处变化：
1. `sendUnsignedTransactionToFork` 的函数体换成 `revert("NOT_IMPLEMENTED")`。
2. 新增 `sendUnsignedTransactionOverride`，代码与原 `sendUnsignedTransactionToFork` 几乎相同。区别有三点：去掉 `_chainIdChanged()` 和 `msg.sender == tx.origin` 检查；多一个 `from` 参数；`undoL1ToL2Alias(msg.sender)` 改成 `undoL1ToL2Alias(from)`。

`AbsInbox.sol` 两版完全相同 [3][4]。

```solidity
// 补丁实现 0x980D…A859 · src/bridge/Inbox.sol（Blockscout 已验证源码）
function sendUnsignedTransactionOverride(
    uint256 gasLimit, uint256 maxFeePerGas, uint256 nonce,
    address to, uint256 value, bytes calldata data, address from
) external whenNotPaused onlyAllowed returns (uint256) {
    if (gasLimit > type(uint64).max) revert GasLimitTooLarge();
    return _deliverMessage(
        L2_MSG,
        AddressAliasHelper.undoL1ToL2Alias(from),   // 原版是 msg.sender
        abi.encodePacked(L2MessageType_unsignedEOATx, gasLimit,
            maxFeePerGas, nonce, uint256(uint160(to)), value, data),
        0
    );
}
```

```solidity
// SpoofL2TxAction 0x3d456…a322 · src/SpoofL2TxAction.sol（节选）
address currentImpl = ProxyAdmin(proxyAdmin).getProxyImplementation(inbox);
ProxyAdmin(proxyAdmin).upgrade(inbox, patchedInboxImpl);
Inbox(inbox).sendUnsignedTransactionOverride({gasLimit: gasLimit,
    maxFeePerGas: maxFeePerGas, nonce: nonce, to: to,
    value: value, data: data, from: from});
ProxyAdmin(proxyAdmin).upgrade(inbox, currentImpl);
```

## 4. L2 交易 `0x56180442…0f6b`

Arbitrum One 区块 454686044（`0x1b19f55c`），2026-04-21 03:35:08 UTC，区块内序号 1（区块共 2 笔交易）[7]：

| 字段 | 值 |
|---|---|
| type | `0x65`（ArbitrumUnsignedTx） |
| from | `0x5d3919F12bCc35c26Eee5F8226A9bee90c257Ccc` |
| to | `0x0000000000000000000000000000000000000DA0` |
| value | `0x683cf676a5cc88b3b50` = 30,765.667401709008927568 ETH |
| nonce | 0 |
| gas / maxFeePerGas | 100,000 / 1 gwei |
| input | `0x` |
| v / r / s | 0 / 0 / 0 |
| status / gasUsed | 成功 / 21,000 |
| effectiveGasPrice | 0.020064 gwei（区块 baseFee） |
| logs | 0 |

**时间差**：L1 消息时间戳 03:26:47 → L2 执行 03:35:08，相隔 501 秒（8 分 21 秒）[1][7]。

**金额核对**：
- 公告金额 30,765.667501709008927568 ETH，交易 value 少 0.0001 ETH = 100,000 gas × 1 gwei。也就是说，value 刚好留出 `buyGas` 要求的最大 gas 预算 [7][9]。
- 实际手续费 = 21,000 × 0.020064 gwei = 0.000000421344 ETH。
- 攻击者地址当前余额是 99,578,656,000,000 wei = 0.0001 − 0.000000421344 ETH，nonce 是 1，没有代码。这说明冻结之后这个地址再也没有发过交易，也没有收到过 ETH [6]。

## 5. 6 月释放：同一套机制，换了授权路径

**L1 交易 `0xc2e247e5…145b`**：区块 25322204，2026-06-15 10:08:47 UTC，由 EOA `0xA0141D575dbc63a7cF7Af303054279A91D10CC83` 调用 L1 Timelock `0xE6841D…7f49` 的 `executeBatch` [8]。调用链：L1ArbitrumTimelock → UpgradeExecutor → **同一个** `SpoofL2TxAction 0x3d456…` → ProxyAdmin 升级到**同一个**补丁实现 `0x980D…` → Bridge 入队 → 改回 `0x7C05…` [8]。

**L2 交易 `0x09795deb…df72`**：2026-06-15 10:18:25 UTC，在 L1 之后 578 秒执行 [7]。

| 字段 | 值 |
|---|---|
| type | `0x65` |
| from → to | `0x…0DA0` → `0x3b87db6ded35eBD28EcbF8014fb325eef23f6C07` |
| value | 30,765.617401709008927568 ETH |
| gas / maxFeePerGas | 50,000 / 1,000 gwei（预留 0.05 ETH） |
| gasUsed / effectiveGasPrice | 27,329 / 0.02001 gwei |
| log | 收款合约发出 1 条事件（topic0 `0x3d0ce9bf…`，即 Safe 的 `SafeReceived`，topic1 = `0xDA0`） |

`0x…0DA0` 当前余额是 49,999,453,146,710,000 wei，正好等于 0.05 ETH 减去这笔交易的手续费 0.00000054685329 ETH。所以 0xDA0 之后也没有再动过 [6][7]。

**Inbox 历史上只升级过这两次。** 用 Blockscout 查询 Inbox 代理从区块 24,000,000 至今的全部 `Upgraded` 事件，只有 4 条，分别属于 4 月和 6 月这两笔交易 [8]。

## 6. 图的素材

- **L1 调用树**（April）：EOA → Safe.execTransaction（9 sig）→ delegatecall MultiSendCallOnly → ① Multicall3.aggregate3 → CREATE2 ×2（补丁 Inbox、SpoofL2TxAction）② UpgradeExecutor.execute → delegatecall SpoofL2TxAction.execute → ProxyAdmin.getProxyImplementation / ProxyAdmin.upgrade(→补丁) / Inbox.sendUnsignedTransactionOverride → Bridge.enqueueDelayedMessage / ProxyAdmin.upgrade(→原实现)。
- **时序**：03:26:47 L1 区块 24925592（升级 + 入队 msg #2416814 + 恢复）→ delayed inbox 等待 → 03:35:08 L2 区块 454686044 执行 0x65 交易 → 03:46:45 官方 X 公告 → 03:57:55 论坛公告。
- **6 月对照**：授权方从 Security Council Safe（紧急 9/12、无延迟）换成 L1 Timelock（宪法 AIP 走完 L2 投票 + 时间锁之后执行），机制和合约完全相同。

## 7. 来源

1. **PRIMARY** L1 交易 `0x079984c5…f770` 原始字段与 calldata：`cast tx` / `cast receipt`（Ethereum RPC），解码 `execTransaction`、`multiSend`、`UpgradeExecutor.execute`、`SpoofL2TxAction.execute`。证明顶层调用、签名数量、action 参数。2026-10-07。
2. **PRIMARY** Blockscout API：`https://eth.blockscout.com/api/v2/transactions/0x079984c56c5670108f5c6f664904178f9b364340351949a42e4637d1f645f770/internal-transactions` 与 `/logs`。证明内部调用顺序、CREATE2 部署、Upgraded / MessageDelivered / InboxMessageDelivered 事件。2026-10-07。
3. **PRIMARY** 原 Inbox 实现已验证源码：`https://eth.blockscout.com/api/v2/smart-contracts/0x7C058ad1D0Ee415f7e7f30e62DB1BCf568470a10`。2026-10-07。
4. **PRIMARY** 补丁 Inbox 实现已验证源码：`https://eth.blockscout.com/api/v2/smart-contracts/0x980D1F93FC5809c828539c46084801673FA6A859`（`sendUnsignedTransactionOverride`、注释、`_deliverToBridge`）。2026-10-07。
5. **PRIMARY** SpoofL2TxAction 已验证源码：`https://eth.blockscout.com/api/v2/smart-contracts/0x3d456FCd62f5baBCf3263B72fb4ac8fF8cc5a322`。2026-10-07。
6. **PRIMARY** 当前链上状态（`cast call` / `cast balance` / `cast nonce`）：Safe `getThreshold()=9`、`getOwners()` 12 个；ProxyAdmin `owner()` = UpgradeExecutor；UpgradeExecutor `hasRole(EXECUTOR_ROLE, …)` 对 Safe 和 L1 Timelock 都为 true；Inbox 当前实现 `0x7C05…`；攻击者与 0xDA0 的余额 / nonce。2026-10-07。
7. **PRIMARY** Arbitrum One RPC：`eth_getTransactionByHash` / `eth_getTransactionReceipt` / `eth_getBlockByNumber`，交易 `0x5618…0f6b` 与 `0x0979…df72`。2026-10-07。
8. **PRIMARY** L1 交易 `0xc2e247e5869aaf5b57ff1cc5da8b56f6675161ad6f980b547846f209e43e145b` 的 Blockscout trace / logs；Inbox 代理 `Upgraded` 事件全量查询 `https://eth.blockscout.com/api?module=logs&action=getLogs&address=0x4Dbd…&topic0=0xbc7cd75a…&fromBlock=24000000`。2026-10-07。
9. **PRIMARY** OffchainLabs/go-ethereum `core/state_transition.go` `buyGas`（见 notes-mechanism M19）。
10. **PRIMARY** Arbitrum 论坛 30803 #1 官方说明 `https://forum.arbitrum.foundation/t/30803.json`：“implement an atomic action to upgrade the inbox contract … impersonate the transaction sender”。2026-10-07。

## 8. 外部调研中被修正或补充的地方

- 外部调研 §2.3 说“没有完成临时实现字节码、每一层内部调用”的复核。现在已经完整还原：调用树、两个 CREATE2 部署、补丁源码 diff、action 源码、消息数据哈希复算。
- 外部调研 §2.4 的伪代码与真实 `SpoofL2TxAction` 一致。补充三点：真实实现还现场部署了补丁合约；补丁函数自身没有权限检查，安全性完全靠“同一笔交易里换上再换下”；`amount = 0`，没有在 L1 铸币。
- 外部调研 §3.2 写 6 月转账是 unsigned 类型，这一点正确。补充：6 月的 L1 授权方是 L1 Timelock（常规宪法治理路径），不是 Security Council；而且复用了 4 月部署的同一组合约。
- 外部调研没有指出：攻击者地址和 0xDA0 的当前余额，都精确等于“gas 预留 − 实际手续费”，说明两个地址在被清空后都没再动过。

## 9. 开放问题

- 攻击者 ETH 如何来到 Arbitrum：二手报道说攻击者把 rsETH 存进 Aave（含 Arbitrum 部署）借出 WETH，本次没有用链上数据核实。
- 4 月到 6 月之间 Bridge 实现从 `0x93e8f923…` 换成 `0xfE474906…`，原因没有查。
- 4 月交易中 9 个签名对应哪 9 名成员，没有恢复签名人（需要 Safe tx hash 和 ecrecover）。
- 历史区块的 Safe threshold 用的是当前值，因为公共节点不提供归档状态。宪法与 L2BEAT 都写 9/12（见 M28）。

## 10. 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| T1 | L1 冻结交易位于区块 24925592，时间 2026-04-21 03:26:47 UTC，执行成功 | [1]；[2] | observed | |
| T2 | 顶层调用是 Security Council Safe 0xF06E…3F85 的 execTransaction，以 delegatecall 调 MultiSendCallOnly | [1] 解码 execTransaction 参数 | observed | |
| T3 | 这笔交易带 9 个签名（585 字节 = 9×65），Safe 当前 threshold 为 9、owners 12 | [1] signatures 长度；[6] getThreshold / getOwners | observed | |
| T4 | MultiSend 第一步通过 Multicall3 调 CREATE2 部署器，现场部署补丁 Inbox 实现 0x980D…A859 和 SpoofL2TxAction 0x3d456…a322 | [2] trace index 3–7 | observed | |
| T5 | MultiSend 第二步调用 UpgradeExecutor.execute，后者 delegatecall SpoofL2TxAction.execute | [2] trace index 8–10；[1] 解码 | observed | |
| T6 | ProxyAdmin 的 owner 是 UpgradeExecutor；UpgradeExecutor 的 EXECUTOR_ROLE 授予 Security Council Safe 和 L1 Timelock | [6] owner() / hasRole() 当前值 | observed | |
| T7 | SpoofL2TxAction.execute 依次执行：读当前实现 → 升级 Inbox 到补丁实现 → 调 sendUnsignedTransactionOverride → 升级回原实现 | [5] 已验证源码；[2] trace 11–20 与 logs 4、7 | observed | |
| T8 | action 参数：gasLimit 100,000、maxFeePerGas 1 gwei、nonce 0、to 0x…0DA0、value 30,765.667401709008927568 ETH、data 空、from 0x5d39…7Ccc | [1] 解码 UpgradeExecutor.execute 内层 calldata | observed | |
| T9 | 补丁实现相对原实现只改两处：sendUnsignedTransactionToFork 改为 revert；新增 sendUnsignedTransactionOverride，用参数 from 替代 msg.sender，并去掉 fork/EOA 检查 | [3][4] 已验证源码 diff；AbsInbox.sol 两版相同 | observed | |
| T10 | 补丁函数除 onlyAllowed（allowlist 关闭）和 whenNotPaused 外没有访问控制，注释写明不原子执行会让 bridge “fully drainable by anyone” | [4] 源码与注释 | observed | |
| T11 | 补丁函数先 undoL1ToL2Alias(from)，_deliverToBridge 再 applyL1ToL2Alias，所以 Bridge 记录的 sender 等于 from | [4] Inbox.sol _deliverToBridge；[2] MessageDelivered.sender = 0x5d39…7Ccc | observed | |
| T12 | 入队的是 delayed message #2416814，kind 3（L2_MSG），messageDataHash 0x62f5e672…8d1c | [2] log 5 | observed | |
| T13 | 消息数据为 0x00 ‖ gasLimit ‖ maxFeePerGas ‖ nonce ‖ to ‖ value，共 161 字节，keccak 与链上 messageDataHash 一致 | [2] log 6；本地 cast keccak 复算 | observed | |
| T14 | 补丁调用以 amount=0 入队，L1 没有向 Bridge 存入 ETH，L2 转出的 ETH 来自攻击者已有余额 | [4] `_deliverMessage(..., 0)`；[2] 所有内部调用 value 为 0 | observed | |
| T15 | 冻结交易结束后 Inbox 代理指回原实现 0x7C05…0a10，至今未变 | [2] log 7；[6] cast implementation | observed | |
| T16 | L2 交易在 Arbitrum One 区块 454686044 执行，时间 03:35:08 UTC，类型 0x65，v/r/s 全为 0，nonce 0 | [7] eth_getTransactionByHash | observed | |
| T17 | L2 交易是空 calldata 的原生 ETH 转账，gasUsed 21,000，无事件，effectiveGasPrice 0.020064 gwei | [7] receipt | observed | |
| T18 | L1 入队到 L2 执行相隔 501 秒（8 分 21 秒） | 由 T1（时间戳 1776742007）和 T16（1776742508）推出 | inferred | |
| T19 | 交易 value 比公告金额少 0.0001 ETH，正好等于 gasLimit × maxFeePerGas，这是 buyGas 要求预留的最大 gas 预算 | 由 T8、[10] 公告金额与 M19 推出 | inferred | |
| T20 | 攻击者地址当前余额 0.000099578656 ETH，等于 0.0001 − 实际手续费 0.000000421344 ETH，nonce 为 1，说明冻结后该地址没有再发生任何余额变动 | [6] cast balance / nonce；由 T17 计算 | inferred | |
| T21 | 2026-06-15 的 L1 释放交易 0xc2e247e5… 由 L1 Timelock 的 executeBatch 发起，复用同一个 SpoofL2TxAction 和同一个补丁实现 | [8] trace | observed | |
| T22 | 6 月 L2 交易 0x09795deb… 同为 0x65 类型，从 0x…0DA0 向 0x3b87…6C07 转 30,765.617401709008927568 ETH，预留 0.05 ETH gas | [7] | observed | |
| T23 | 6 月释放走的是常规宪法治理路径（L1 Timelock），冻结走的是 Security Council 紧急路径（无延迟） | 由 T2、T21 与 M26、M27 推出 | inferred | |
| T24 | 0x…0DA0 当前余额等于 0.05 ETH 减 6 月交易手续费，6 月之后没有变动 | [6] cast balance；由 T22 gasUsed × effectiveGasPrice 计算 | inferred | |
| T25 | 自区块 24,000,000 起，Inbox 代理只发生过 4 次 Upgraded，全部属于 4 月和 6 月这两笔交易 | [8] Blockscout getLogs | observed | |
| T26 | 0x…0DA0 没有私钥可用，资金只能再次通过治理升级 Inbox、以它为 sender 才能转出 | 由 T21、T25 推出：唯一一次转出就是用同一机制完成的；0xDA0 是低位地址，不对应任何已知私钥 | inferred | |
| T27 | 官方论坛说明称技术方案是“原子地升级 inbox、冻结资金、恢复原实现”，并由 Arbitrum contributors 准备 payload、Council 验证后签名 | [10] 论坛 30803 #1 | observed | |
| T28 | 4 月和 6 月之间 Bridge 实现地址发生过变化（0x93e8f923… → 0xfE474906…），原因未查 | [2] trace index 18；[8] trace index 12 | observed | |

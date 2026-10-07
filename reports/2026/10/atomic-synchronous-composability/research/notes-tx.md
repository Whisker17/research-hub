# notes-tx：2026-10-05 首笔主网 AS 交易解码（brief 研究问题 2）

**研究问题**：交易 `0xd0cbfef7…0a02` 做了哪些操作（调用树、事件、资金流、proof system）？实现了什么效果？
**一句话答案**：这是一笔“L1 用户把 0.001 ETH 发给自己在 rollup 1 上的同一地址”的 L1→L2 同步存款。它由**两笔相邻的 L1 交易**组成：区块 26127444 的第 31 笔由 composer 调用 `postAndVerifyBatch`，带 1 个 blob 和 1 个 65 字节 ECDSA 签名，发布两条 execution entry；第 32 笔（用户交易）向 CrossChainProxy 转账，在同一笔交易里消费第二条 entry，把 rollup 1 的状态根从 `0x30d8…` 推进到 `0x5452…`，L1 上记账的 rollup ETH 余额从 0 变成 0.001 ETH。L1 侧没有执行任何 L2→L1 调用，所以它演示的是“L1 发起、L2 状态在同一个 L1 交易里原子推进”的最简路径，不是嵌套调用或带返回值的复杂组合。

> 主会话自行解码，2026-10-06。RPC：`https://ethereum-rpc.publicnode.com`（非 archive）；索引：`https://eth.blockscout.com/api/v2`、`https://api.blobscan.com`。源码：eez-core-protocol @ `6ae4110fb748fd10882d5afea576fbd1a5c38fc3`。

---

## Q1 交易本身

- 用户交易 `0xd0cbfef7df37b362839d7bf91a91bccc09b1510625919b7bcdaa291153920a02`：区块 26127444，区块内序号 32，时间 2026-10-05 16:44:59 UTC，from `0xceaf908c05b277e92e89b51b281ec76305b9a141`，to `0x3c1837f7c48edc0f8cb172d3c7fb9884f00ff7c8`，value `0x38d7ea4c68000` = 0.001 ETH，input `0x`（空），gas limit 500,000，gasUsed 111,263，status 1 [1]。
- 同一区块第 31 笔 `0x82ee73bd577bb5938a7cbb2f4b09c4ad500fc368c8fd21896100c70fcb1eaf67`：from `0x4261d69f840cc550945def48e5f477737118d546`（EOA），to EEZ manager `0x4b2760f8…402c`，selector `0xe4a480e4` = `postAndVerifyBatch`，带 1 个 blob（versioned hash `0x011611…e3da`，blob 实际使用 142 字节），gasUsed 297,862，blob gas 131,072 [1][2][7]。
- 合约身份（Blockscout 已验证源码）：`0x4b2760f8…` 是 `EEZProxy`（EIP-1967），实现为 `EEZ` `0x4c3d971b…4dba`；`0x3c1837f7…` 是 `CrossChainProxy`；`0x1ac760d5…721e` 是 `ECDSAProofSystem`；`0xb3fb7a12…56d0` 是 rollup 1 的 `Rollup` 合约（代理，实现 `0xf586091d…`）[3]。
- 已验证源码 `src/EEZ.sol`、`src/base/CrossChainProxy.sol`、`src/base/EEZBase.sol`、`src/interfaces/IEEZ.sol` 与仓库 commit `6ae4110` 逐字节相同（`diff` 无输出）[3][4]。

## Q2 postAndVerifyBatch 的参数（第 31 笔）

按 `ProofSystemBatchPerVerificationEntries` 字段顺序解码（`src/interfaces/IEEZ.sol` L34–L47）[2][4]：

| 字段 | 值 | 含义 |
|---|---|---|
| expectedRootPerRollup | `[]` | 不做额外 root 断言 |
| entries[0] | rollupUpdates `[(1, 0, 0x9099…3553 → 0x30d8…4398)]`；proxyEntryHash `0x0`；l2ToL1Calls `[]`；expectedL1ToL2Calls `[]`；rollingHash `0x5a25…b4b6`；destinationRollupId 1；success true | 纯 L2 交易条目（L2Tx）：推进 rollup 1 的状态，不碰 L1 |
| entries[1] | rollupUpdates `[(1, +1e15, 0x30d8…4398 → 0x5452…04a2)]`；proxyEntryHash `0x2846…0fc4`；无调用；rollingHash `0x07f0…98e1`；destinationRollupId 1；success true | 等待 L1 代理调用来消费的条目：etherDelta = +0.001 ETH |
| staticEntries | `[]` | |
| immediateEntryCount | 1 | 第 0 条在本交易里立即执行，第 1 条入队 |
| proofSystems | `[0x1ac760d5…]` | 只用 ECDSAProofSystem |
| rollupIdsWithProofSystems | `[(1, [0])]` | rollup 1 用第 0 个 proof system |
| blobIndices | `[0]` | 消费本交易的第 0 个 blob |
| callData | `0x` | |
| proofs | 1 个 65 字节签名 | ECDSA 签名（r,s,v）|
| blockNumber | `2^64−1` | 绑定“最新” L1 区块 |
| bindMsgSenderInPublicInput | false | 任何人都可以提交这个 batch |

## Q3 事件与调用树

**第 31 笔事件**（logIndex 148–150）[1]：`L2ExecutionPerformed(rollupId=1, newRoot=0x30d8…, etherBalance=0)` → `EntryExecuted(entryIndex=0, rollingHash=0x5a25…)` → `BatchPosted(sharedPublicInput=0x0ee7…5d26, rollupIds=[1])`。内部调用：manager staticcall Rollup 合约（`checkProofSystemsAndGetVkeys`、`getCustomData`），staticcall ECDSAProofSystem（`verify`），自调用执行立即条目 [6]。

**第 32 笔调用树**（Blockscout internal transactions）[6]：
```
EOA 0xceaf… ──call 0.001 ETH, data=0x──▶ CrossChainProxy 0x3c18…
  ├─ staticcall EEZProxy.STATIC_CHECK_GAS()  (→ delegatecall EEZ impl)
  ├─ call self.staticCheck()  (gas 1000; TSTORE 成功 ⇒ 非 static 上下文)
  └─ call{value: 0.001 ETH} EEZProxy.executeCrossChainCall(0xceaf…, 0x)
       └─ delegatecall EEZ impl: 校验代理 → 计算 callHash → 消费队列条目 → 更新 root
```
**第 32 笔事件**（logIndex 151–154）[1]：`CrossChainCallExecuted(crossChainCallHash=0x2846…, proxy=0x3c18…, sourceAddress=0xceaf…, callData=0x, value=1e15)` → `ExecutionConsumed(0x2846…, rollupId=1, entryQueueIndex=0)` → `L2ExecutionPerformed(1, newRoot=0x5452…, etherBalance=1e15)` → `EntryExecuted(0, 0x07f0…)`。

## Q4 哈希复现（证明“条目绑定了什么”）

用 `cast` 按源码公式本地复算，三个值全部与链上一致 [4][5]：
1. `crossChainCallHash = keccak256(abi.encode(false, 0xceaf…, 0 /*MAINNET_ROLLUP_ID*/, 0xceaf…, 1, 1e15, 0, 0x))` = `0x28467651…0fc4` = entries[1].proxyEntryHash = 事件里的 hash（公式：`EEZBase.sol` L282–L299；调用参数：`EEZ.sol` L865–L867）。
2. entries[1].rollingHash = `keccak(keccak(0, 1, 0x30d8…), 0x2846…)` = `0x07f06f3c…98e1`：只有起始种子（`EEZBase.sol` L388–L397），说明执行期间**没有任何 CALL_BEGIN / CALL_END 事件**，即 L1 侧没有 L2→L1 调用。
3. entries[0].rollingHash = `keccak(keccak(0, 1, 0x9099…), 0x0)` = `0x5a25079b…b4b6`：纯 L2 条目，同样没有 L1 调用。

## Q5 代理代表谁

- `0x3c1837f7…` 由 `0xceaf…` 在区块 26127430（16:42:11 UTC，比 AS 交易早 14 个区块）调用 `createCrossChainProxy` 创建；事件 `CrossChainProxyCreated(proxy=0x3c18…, originalAddress=0xceaf…, originalRollupId=1)` [1]。
- `computeCrossChainProxyAddress(0xceaf…, 1)` 返回 `0x3c1837f7…`（CREATE2，salt = `keccak(rollupId, address)`，`EEZBase.sol` L237、L255–L258）[4][5]。
- 所以这笔交易的语义是：L1 上的 `0xceaf…` 调用“rollup 1 上的 `0xceaf…`”，附带 0.001 ETH，calldata 为空，也就是一笔普通的 L1→L2 ETH 转账。在 L2 上，收款方看到的 `msg.sender` 是“L1 地址 `0xceaf…` 在 L2 上的代理”。

## Q6 信任与权限（交易发生时）

- ECDSAProofSystem 的 signer 是 `0xa86e00c0…a15e`，在部署时（区块 26085436）设置；截至区块 26132764 没有 `SignerUpdated` 换签名人的事件。owner 是 `0xceaf…` [5][8]。
- Rollup 1 的 `threshold` = 1，owner = `0xceaf…`；EEZProxy 的 ProxyAdmin `0x57bf29a0…` 的 owner 也是 `0xceaf…` [5]。
- 也就是说，发起演示交易的 EOA 同时是 manager 的部署者、rollup 1 的 owner、proof system 的 owner 和升级管理员。这是一次项目方自己操作的演示，安全性完全依赖 signer 私钥和这个 owner [5]。

## Q7 时间线（EEZ manager 的全部交易，Blockscout）[9]

- 2026-09-29 19:33 UTC：部署 EEZProxy（区块 26085240）；20:12 部署 ECDSAProofSystem；20:34 部署 Rollup 实现。
- 2026-10-05 09:20：`registerRollup`（rollup 1）；10:10 起 composer `0x4261…` 大约每小时提交一次 `postAndVerifyBatch`。
- 2026-10-05 16:42：`createCrossChainProxy`；16:44:59：AS 交易（第一个 `ExecutionConsumed` 事件）。
- 截至 2026-10-06 10:01（区块 26132601）：共 60 笔 manager 交易；`ExecutionConsumed` 共 9 次。其中 18:51（0.01 ETH）、06:34（0.001 ETH）是 ETH 转入；另有几笔 value 很小的调用；新出现了 `0x7B2e…`、`0x64E4…`、`0x198B…` 等其他地址创建代理 [9][10]。
- 当前 `rollups(1).etherBalance` = 0.01105 ETH；只有 rollup 1 注册（`rollups(2)` 为空）[5]。

## Q8 实现了什么效果（推断）

- 用户只发了**一笔普通转账**，L2 状态就在**同一笔 L1 交易**里更新了：L1 上存入 rollup 的 ETH 与 L2 状态根的推进是原子的。要么两者都发生，要么用户交易 revert，退回 0.001 ETH。没有异步桥的“先锁定、等待 relayer、再到 L2 领取”。
- 它依赖同一区块里 composer 的第 31 笔交易先完成验证。`executeCrossChainCall` 只读 `lastVerifiedBlock == block.number` 的队列（`IEEZ.sol` L67–L76 注释）。如果第 31 笔没有进同一区块或排在后面，用户交易会失败，而不是“部分成功”。
- 它没有演示：L2 返回值被 L1 使用、L2→L1 调用、嵌套 / 回调、static 读、多 rollup、ZK 证明。

## 图的素材

- **区块内顺序**：tx31 composer → EEZ.postAndVerifyBatch（verify ECDSA → 执行 entry0 → 入队 entry1）；tx32 user → CrossChainProxy → EEZ.executeCrossChainCall（算 hash → 匹配 entry1 → 核对 currentRoot → 无 L1 调用 → 核对 rollingHash → etherDelta 守恒 → root 0x30d8→0x5452，余额 0→0.001）。
- **状态根链**：`0x9099…` →(entry0, tx31)→ `0x30d8…` →(entry1, tx32)→ `0x5452…`。

## 来源

1. **PRIMARY** Ethereum 主网 JSON-RPC：`eth_getTransactionByHash` / `eth_getTransactionReceipt`（两笔交易与代理创建交易 `0xeba2ca05…`）、`eth_getBlockByNumber(26127444)`，2026-10-06 获取。证明交易字段、事件与区块内顺序。
2. **PRIMARY** Blockscout `GET /api/v2/transactions/0x82ee73bd…`：`postAndVerifyBatch` 的解码参数，2026-10-06。
3. **PRIMARY** Blockscout `/api/v2/smart-contracts/<addr>` 与 `/addresses/<addr>`：合约名、验证状态、EIP-1967 实现、创建者，2026-10-06。
4. **PRIMARY** eez-core-protocol @ `6ae4110`：`src/interfaces/IEEZ.sol`、`src/base/EEZBase.sol`、`src/base/CrossChainProxy.sol`、`src/EEZ.sol`；与 Blockscout 已验证源码 diff 相同。
5. **PRIMARY** `cast call` / `cast keccak` / `cast abi-encode`（Foundry），2026-10-06：`signer()`、`owner()`、`threshold()`、`rollups(1)`、`computeCrossChainProxyAddress`、ProxyAdmin 槽，以及哈希复算。
6. **PRIMARY** Blockscout `/api/v2/transactions/<hash>/internal-transactions`（两笔交易），2026-10-06。
7. **PRIMARY** Blobscan `/blobs/0x011611…e3da`：blob 归属区块 26127444、usageSize 142 字节，2026-10-06。
8. **PRIMARY** Blockscout `/api/v2/addresses/0x1ac760d5…/logs`：部署时 `SignerUpdated(0 → 0xa86e…)`、`OwnershipTransferred(→ 0xceaf…)`，此后无更换。
9. **PRIMARY** Blockscout `/api/v2/addresses/0x4b2760f8…/transactions`：manager 全部 60 笔交易的时间线，2026-10-06。
10. **PRIMARY** `cast logs`（ExecutionConsumed 与 CrossChainCallExecuted 主题，区块 26085240–26132764）：9 次消费，第一次是本交易。

## 外部调研中被修正或无法核实的地方

- GPT 结果 §8 称“未取得原始 receipt 和 trace”，并把具体发送者、目标合约、proof 类型、是否同一交易信封列为待核验。现已全部核实：目标是 CrossChainProxy；proof 是 ECDSAProofSystem（threshold 1）；验证与消费是**同一区块里的两笔交易**，不是同一个交易信封。
- GPT 结果 §1.3 认为“不能仅凭默认部署脚本断定主网交易用 ECDSA”。链上已确认用的是 ECDSA。
- GPT 结果把演示称为“跨链调用 + rollup 状态更新”，这个说法准确。但具体内容是“向自己在 L2 上的地址转 0.001 ETH”，没有业务合约调用。

## 开放问题

- L2 侧：rollup 1 的 chain ID、L2 RPC 或浏览器、对应的 L2 交易，本次没有找到公开入口。blob（142 字节）的 L2 交易内容没有解码。
- ECDSA 签名对应的 publicInputsHash 没有在本地复算（需要按 MULTI_PROVER_SPEC 拼出公共输入）；本次只确认链上 `verify` 通过，且当时只有一个 signer。
- 之后的 8 次消费里，是否出现过 L2→L1 调用或带返回值的组合，没有逐笔解码。

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| T1 | 用户交易在区块 26127444（2026-10-05 16:44:59 UTC）、区块内序号 32，status 成功，gasUsed 111,263 | [1] receipt 与 block | observed | |
| T2 | 用户交易是向 CrossChainProxy `0x3c18…` 转 0.001 ETH、input 为空的普通转账 | [1] `eth_getTransactionByHash`：value `0x38d7ea4c68000`、input `0x`；[3] 合约名 CrossChainProxy | observed | |
| T3 | 同一区块的上一笔交易（序号 31）由 `0x4261…` 调用 EEZ manager 的 `postAndVerifyBatch`，并携带 1 个 blob | [1] block 交易列表；[2] method `postAndVerifyBatch`；[7] | observed | |
| T4 | 主网 EEZ manager 是 EIP-1967 代理 `0x4b27…`，实现合约 `EEZ` 的已验证源码与 eez-core-protocol @ `6ae4110` 的核心文件逐字节相同 | [3] Blockscout implementations；本地 `diff` 四个文件无差异 [4] | observed | |
| T5 | batch 只用一个 proof system：ECDSAProofSystem `0x1ac7…`，proof 是 65 字节签名 | [2] proofSystems 与 proofs 字段；[3] 合约名 | observed | |
| T6 | rollup 1 的 threshold 为 1，即一个 ECDSA 签名就足以通过验证 | [5] `cast call threshold()` = 1 | observed | |
| T7 | ECDSA signer 是 `0xa86e…`，部署时设置，截至区块 26132764 没有更换 | [8] SignerUpdated 日志只有部署时一条；[5] `signer()` | observed | |
| T8 | 发起演示交易的 EOA `0xceaf…` 同时是 manager 部署者、rollup 1 owner、ECDSAProofSystem owner 与 ProxyAdmin owner | [3] creator；[5] `owner()` ×3 | observed | |
| T9 | batch 含两条 entry：entry0 是纯 L2 条目（proxyEntryHash = 0，无调用），把 rollup 1 的 root 从 `0x9099…` 推到 `0x30d8…` | [2] 解码参数 | observed | |
| T10 | entry1 的 etherDelta = +0.001 ETH，root 从 `0x30d8…` 推到 `0x5452…`，没有 L2→L1 调用和重入表 | [2] 解码参数 | observed | |
| T11 | immediateEntryCount = 1：entry0 在第 31 笔交易里立即执行，entry1 入队等待消费 | [2]；[1] tx31 事件 L2ExecutionPerformed(0x30d8…) 与 EntryExecuted(0) | observed | |
| T12 | 用户交易调用树：代理先 staticcall `STATIC_CHECK_GAS`，再自调用 `staticCheck` 判断非 static 上下文，然后带 0.001 ETH 调用 manager 的 `executeCrossChainCall` | [6] internal transactions；[4] `CrossChainProxy.sol` `_fallback` | observed | |
| T13 | 用户交易发出 CrossChainCallExecuted、ExecutionConsumed(rollupId 1, index 0)、L2ExecutionPerformed(root `0x5452…`, 余额 0.001 ETH)、EntryExecuted 四个事件 | [1] receipt logs，按 [4] 的事件签名解码 | observed | |
| T14 | 本地复算的 crossChainCallHash 等于 entry1 的 proxyEntryHash `0x2846…`，绑定了 source=`0xceaf…`、source rollup 0、target=`0xceaf…`、target rollup 1、value 1e15、空 calldata | [5] cast 复算；公式 [4] `EEZBase.sol` L282–L299 与 `EEZ.sol` L865–L867 | observed | |
| T15 | 两条 entry 的 rollingHash 都等于起始种子，说明执行期间 L1 上没有发生任何跨链 CALL | [5] cast 复算 `0x07f0…`、`0x5a25…`；公式 [4] `EEZBase.sol` L388–L397 | observed | |
| T16 | 代理 `0x3c18…` 代表 rollup 1 上的地址 `0xceaf…`，由该 EOA 在 14 个区块前创建 | [1] CrossChainProxyCreated 事件；[5] `computeCrossChainProxyAddress` | observed | |
| T17 | 这笔交易的效果是：L1 用户向自己在 rollup 1 上的同一地址转 0.001 ETH，L1 上的存入和 L2 状态根推进在同一笔 L1 交易里原子完成 | 由 T2、T10、T13、T14、T16 推出 | inferred | |
| T18 | 验证（tx31）与消费（tx32）是同一区块里相邻的两笔交易，不是同一个交易信封 | [1] 序号 31、32；[2] | observed | |
| T19 | 如果 tx31 没有在同一区块内排在前面，用户交易会 revert，不会留下部分结果 | 由 T18 与 [4] `IEEZ.sol` L67–L76（队列只在 `lastVerifiedBlock == block.number` 时可读）、`EEZ.sol` `_requireVerifiedThisBlock` 推出 | inferred | |
| T20 | 这笔交易没有演示 L2 返回值被 L1 使用、L2→L1 调用、嵌套、static 读、多 rollup 或 ZK 证明 | 由 T5、T10、T15 推出 | inferred | |
| T21 | EEZ manager 于 2026-09-29 部署，rollup 1 于 2026-10-05 09:20 UTC 注册，此后 composer 大约每小时提交一个 batch | [9] manager 交易时间线 | observed | |
| T22 | 本交易是该部署上第一次 ExecutionConsumed，也就是第一次通过代理消费 entry | [10] cast logs：第一条在区块 26127444 | observed | |
| T23 | 截至区块 26132601，manager 共 60 笔交易、9 次 entry 消费，其他地址也开始创建代理 | [9]；[10] | observed | |
| T24 | 截至 2026-10-06，只注册了 rollup 1，其 L1 记账 ETH 余额为 0.01105 ETH | [5] `rollups(1)`、`rollups(2)` | observed | |
| T25 | 第 31 笔 batch 的 blob 只用了 142 字节（共 131,072 字节），整笔 gasUsed 297,862 | [7] usageSize；[2] gas_used | observed | |
| T26 | 这次演示的安全性取决于单一 signer 私钥和单一 owner，不是密码学有效性证明 | 由 T5–T8 推出 | inferred | |
| T27 | 主网 batch 使用了 blob（blobIndices=[0]）和 blockNumber=最新，而 eez-rollup0 @6ff63ec 的 signer SPEC 要求 blobIndices 为空、blockNumber=0，说明主网运行的栈比公开的 signer 规范更新 | 由 [2] 解码参数与 notes-mechanism.md §3.7（signer profile，[20] §7）推出 | inferred | |
| T28 | entry0 对应 rollup0 profile 中的 anchor 条目：每个 batch 先推进到一个空的候选区块，再接入站或出站条目 | 由 T9 与 notes-mechanism.md §4a 第 3、5 步推出 | inferred | |

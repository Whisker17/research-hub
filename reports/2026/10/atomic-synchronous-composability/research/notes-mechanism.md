# notes-mechanism：AS 交易的机制、背景与 infra 改造（brief 研究问题 1）

**研究问题**：L1↔L2 原子同步（AS）交易在 EEZ 中具体怎么实现？一笔交易从提交到 canonical 经历了什么？要改哪些 infra？现在的边界和风险在哪？

**一句话答案**：EEZ 不让 L1 在执行中途去读 L2，而是**先算后验**。composer 在链下同时模拟 L1 和 L2，把 L2 侧的结果与 L1 侧必须真实发生的调用写成 execution table（`ExecutionEntry[]`），再由 proof system 背书（当前参考实现是 ECDSA 签名，不是 ZK）。`postAndVerifyBatch` 在 L1 上验证后，同一个 L1 区块内的代理调用逐条消费 entry：先核对前置 root，再真实执行 L1 调用，用 rolling hash 核对整条交互轨迹、核对 ETH 守恒，最后推进 rollup root。任何一项对不上就整条回滚。Ethereum 不需要硬分叉；L2 客户端、composer、signer、L1 builder 和 deriver 都要改。

> 访问/读取日期：2026-10-06。代码固定在 eez-core-protocol @ `6ae4110f`、eez-rollup0 @ `6ff63ecd`。

---

## Q1 背景：异步桥 vs 同步可组合；atomic / synchronous / isolation / validity / finality

**答案**：异步桥的流程是“A 链发消息→结束本交易→等待中继→B 链另起一笔交易处理→结果要再发一条消息回来”。同步可组合则是：在**同一笔交易**里，A 链合约 CALL 另一条链上的合约，拿到返回值后继续执行；所有相关链要么一起成功，要么一起回滚 [1]。这几个性质要分开看：
- **synchronous**：能不能在同一执行上下文里用上远端返回值；
- **atomic**：相关链上的状态变化是否一起提交或一起回滚；
- **isolation / non-interleaving**：跨域操作的中间状态会不会被别的交易插进来；
- **validity**：远端状态转换是否正确；
- **finality**：结果还会不会因为 L1 重组而消失。

**依据**：
- 原帖第 2 节对同步可组合的定义是“within a single transaction … CALL … receive the result back in the same execution context”，并说明“either succeeds atomically across all involved chains, or it reverts entirely” [1]。
- 回帖中 Péter Garamvölgyi 单独提出 non-interleaving（serializability）需求 [2]。Jordi Baylina 的回答是：shared sequencer 在一个 slot 内为 L1 与各 L2 规定唯一的线性顺序，同 slot 内不允许 `tx1: L1→L2` 与 `tx2: L2→L1` 交错执行；atomicity 由协议的有效性规则和 proof 保证 [2]。
- 关于 finality：Ethereum 上的区块要等 checkpoint 对获得 ≥2/3 质押投票后才 finalized，finalized 之后的回滚在经济上不可行 [24]。EEZ 的 entry 只在 L1 区块内生效，因此 AS 结果的最终性**继承 L1 的最终性**，不会比 L1 更快（推断，依据 [5] 的 same-block gate 和 [24]）。

**为什么普通 rollup 做不到**：每条 rollup 自己排序、自己出块，L1 只在事后看到 batch 或 state root 的结算（optimistic 有挑战期，ZK 有证明延迟）。L1 合约在执行时**没有** L2 的最新状态，也没有 L2 状态转换的有效性证明，所以拿不到可信的 L2 返回值，只能走“发消息 + 等待”的异步模型 [1]（原帖第 1 节：数据与证明分开提交会产生时间差，realtime proving 就是为了消除这个时间差）。

**不确定之处**：原帖把 atomicity 和 non-interleaving 交给“shared sequencer 规定的总序 + 有效性证明”来保证。当前 EEZ 参考实现中，这个排序者实际上就是单一 composer 加 L1 builder bundle（见 Q3、Q6），所以隔离性依赖它们诚实地排序。合约只能保证“排错序会导致失败”，不能保证“一定成功”（推断）。

---

## Q2 EEZ 的核心思路；原帖设计与当前代码的差异

**答案**：原帖是 Jordi Baylina 于 2026-02-02 在 ethresear.ch 发表的 “Synchronous Composability Between Rollups via Realtime Proving”（topic 23998）[1]。核心论点有四条：
1. based rollup 加上 realtime proving，让 DA 与 validity proof 作为一个原子单元同时提交；
2. 在 L1 上为 L2 合约部署 proxy；
3. 链下构造 execution table，用**一个** validity proof 担保整张表，然后临时存入 L1 state；
4. L1 交易执行到 proxy 时，查表、核对并应用 root 变化、执行嵌套的 L1 调用、返回 RESULT。不需要 L1 分叉。

当前代码保留了这个骨架，但数据结构、回滚机制和证明机制都已明显改变（见下表）。

**依据**：原帖第 1、4、5、6 节 [1]；参考实现链接指向 `jbaylina/sync-rollups` [1]。当前 core README 标题仍是 “Sync Rollups”，描述为“State transitions are pre-computed off-chain and verified on-chain by a configurable set of proof systems … within a single L1 block” [3]。

| 维度 | 原帖（2026-02-02）[1][2] | 当前代码 @6ae4110f [5][8][13] |
|---|---|---|
| 表项结构 | Action（CALL/RESULT/L2TX）+ L2 state transitions + nextAction 的序列 | `ExecutionEntry`：`rollupUpdates[]` + `proxyEntryHash` + 扁平 `l2ToL1Calls[]` + 统一重入表 `expectedL1ToL2Calls[]` + 单个 `rollingHash` + `success/returnData` |
| 回滚 | 用 `REVERT` / `REVERT_CONTINUE` action 在 L1↔L2 间传递 | 改为 `success=false` 的 entry 或行、`revertNextNCalls` 强制回滚段、`ContextResult` revert 传输 [13][14] |
| 证明 | “a single validity proof”（ZK） | 可插拔 multi-prover：`IProofSystem.verify(proof, publicInputsHash)`，每条 rollup 自设 threshold；仓库自带的是 `ECDSAProofSystem` [9][15] |
| 表的生命周期 | 消费后删除 entry 以节省存储 | 不删除，用游标前向扫描；每次 verify 重置队列；只在 `lastVerifiedBlock == block.number` 的同一区块可读 [5]。这与回帖 #14 的建议“跳过的 entry 不应在后续区块可用”一致 [2] |
| proxy 部署 | Step 1：执行前必须已部署 | 执行时 `getOrCreateCrossChainProxy` 会自动创建 source proxy；static 路径要求已部署 [6][5] |
| 排序者 | based：任何人都可以提议 | `postAndVerifyBatch` 不限调用者（permissionless），但 rollup0 的实际部署是单一 composer + 单一 attester [13 §I.4][18][20] |
| ETH 记账 | “Ether accountability”：跟踪每条 rollup 持有的 ETH | `RollupConfig.etherBalance` + `RollupUpdate.etherDelta` + 每个 entry 的守恒检查 [5][8] |

**EEZ 流水线（当前实现）**：composer 链下模拟多域执行 → 生成 batch（entries、callData 中的 DA、proof 槽位）→ signer 重执行后签名 [20][22] → L1 `postAndVerifyBatch` 依次做结构校验、取 vkey、验证所有 proof、标记 `lastVerifiedBlock = block.number`、执行前导 L2Tx、执行 meta hook、剩余 entry 入队 [5] → 同一 L1 区块内由 proxy 调用 / `executeL2Txs` 消费 entry → `_applyRollupUpdates` 把 `rollups[rid].root` 推进到 `newRoot` [5]。

**与 based rollup / realtime proving 的关系**：原帖把 realtime proving 作为前提（文中给出的数据是“~12 GPUs、~7s 证明一个完整以太坊区块”）[1]。当前 rollup0 用“stateless 重执行 + ECDSA 签名”代替 ZK，README 明确说“This is not yet a succinct validity proof”[18]。

**不确定之处**：原帖设想由 based / shared sequencer 定义总序；当前实现里谁有权构造 Sync block 由 composer 的部署决定，没有链上的排序者选举（推断，依据 [13 §I.4] 中 postAndVerifyBatch 不限调用者）。原帖之后的 26 条回帖只抽查了 #2、#8、#13–#16。

---

## Q3 组件逐个讲清

### 3.1 L1 `EEZ.sol`（registry + execution manager）

**答案**：`EEZ` 保存三类状态：
- 每条 rollup 的 `RollupConfig{rollupContract, root, etherBalance}`；
- 每条 rollup 的 `RollupVerification`（执行队列、static 队列、游标、`lastVerifiedBlock`）；
- 已授权 proxy 的映射。

`EEZ` 部署在 `EEZProxy`（OZ TransparentUpgradeableProxy）后面，upgrade owner 可以替换实现 [5][12]。

**依据与流程**：
- `registerRollup(rollupContract, initialRoot)`：分配 `++rollupCounter`，回调 manager 的 `rollupContractRegistered` 认证注册者 [5 L344-L354]。rollup id 0 保留给 L1（`MAINNET_ROLLUP_ID`）[5]。
- `postAndVerifyBatch(batch)` [5 L371 起]，按顺序：
  - 0）重入保护：`_insideExecution() || _transientEntriesLength != 0` 时 revert（L380）；
  - 1a）可选的 `expectedRootPerRollup` 断言；
  - 1）`_validateBatchStructure` 做排序、注册、每个 entry ≥1 个 `rollupUpdates`、`destinationRollupId ∈ rollupUpdates`、所有 call 的 source rollup ∈ `rollupUpdates`（proxy protection），以及即时前缀边界（L391）；
  - 2）对每条 rollup 调 `checkProofSystemsAndGetVkeys`（view，threshold 在 manager 里检查）（L395）；
  - 3）`_verifyProofSystemBatch`：构建 `sharedPublicInput`，再对每个 PS 计算 `publicInputsHash` 并 `verify`，任一失败整批 revert（L399；L753-L787）；
  - 4）对参与的 rollup 设 `lastVerifiedBlock = block.number` 并重置队列（L404-L406；L804-L811）；
  - 5+6）前导 `proxyEntryHash==0` 的 L2Tx 用 try/catch 自调用逐条执行，失败且返回数据非空时 emit `L2TxSkipped`，全部失败则整批 revert（L417-L434）；
  - 7）即时前缀中剩下的 entry 装入 `_transientEntries`，回调 `msg.sender.executeMetaCrossChainTransactions()`（L443-L451）；
  - 8）其余 entry 按 `destinationRollupId` **无条件**入队（L463）；
  - 9）清空 transient 表，emit `BatchPosted`。
- **同块约束**：proxy 入口 `_validateProxyAndGetDestinationInfo` 和 `executeL2Txs` 都调用 `_requireVerifiedThisBlock`，即 `lastVerifiedBlock != block.number` 时 revert `ExecutionNotInCurrentBlock` [5 L1572-L1576]。`setRoot` 的锁定条件正好相反：本块已经 verify 过就禁止调用 [5 L1538-L1546]。
- **执行 entry 时的检查**（`_executeEntry` [5 L992 起]）：
  - 逐个检查 `rollups[rid].root == currentRoot`，不等则 `RootMismatch`（L1011-L1016）；
  - `_rollingHashEntryBegin` 播种（L1018）；
  - 依次执行 `l2ToL1Calls`（L1021）；
  - `_applyRollupUpdates` 写入 `newRoot` 并加减 `etherBalance`，余额不足时 `InsufficientRollupBalance`（L1022；L1324 起）；
  - `_rollingHash == entry.rollingHash`（L1026）；
  - `Σ etherDelta == _entryEtherDelta`（L1032）；
  - `success == false` 时，执行和校验都完成后整体 revert，返回 `returnData`。
- **队列匹配**：`_entryMatches` 要求 `proxyEntryHash`、`destinationRollupId` 和**所有 live root pin** 同时相等；不匹配的 entry 被跳过，扫到队尾仍无匹配则 `ExecutionNotFound` [5][13 §G.3]。

**不确定之处**：主网实现合约 0x4c3d971b… 是否等于 @6ae4110f 的 `EEZ.sol`，本 lane 未核对字节码（见开放问题）。

### 3.2 `CrossChainProxy`

**答案**：每个 `(originalAddress, originalRollupId)` 在每个 manager 上对应一个 CREATE2 proxy。proxy 只做转发：manager 用 `executeOnBehalf` 调它时，它去调本链的目标合约；其他任何调用（**包括空 calldata 的纯 ETH 转账**，因为它没有 `receive()`）都走 `_fallback`，转发到 manager 的 `executeCrossChainCall`（STATICCALL 上下文中则转到 `staticCrossChainCall`）。

**依据**：
- salt 为 `keccak256(abi.encodePacked(originalRollupId, originalAddress))`，部署者是 manager 自身；init code 不带构造参数，所以地址由 `(manager 地址, rollupId, 地址, proxy 字节码)` 唯一决定，salt 中**不含 chainid** [6 L237；L247-L260][4][13 §H.5]。
- `fallback()`：只有 `msg.sender == EEZ && sig == executeOnBehalf` 时才去调目标（gas 上限为 `callGas`，0 表示不设上限）[7 L67-L83]。
- `_fallback()`：用一次带 `STATIC_CHECK_GAS` 上限的自调用尝试 `tstore`，以此判断是否处于 static 上下文；然后调 `EEZ.executeCrossChainCall(msg.sender, msg.data)`，并附带 `msg.value` [7 L113-L128]。
- **msg.sender 语义**：在源链上，proxy 把自己的调用者作为 `sourceAddress` 传给 manager，计入 call hash [5 L855-L881]。在目标链上，目标合约看到的 `msg.sender` 是“远端调用者在本链对应的 proxy 地址”，不是原始 EOA [13 §I.6]。
- 对 proxy 执行 `balance`、`extcodesize`、`delegatecall` 等操作，看到的是 proxy 自身；“表里没有匹配 entry”和“目标真的 revert”两种情况对调用方不可区分 [16]。

### 3.3 数据结构（以 `src/interfaces/IEEZ.sol` 为准）

**答案与依据** [8]：
- `RollupUpdate {uint64 rollupId; int192 etherDelta; bytes32 currentRoot; bytes32 newRoot}`（L81-L86）：一个 entry 对某条 rollup 的状态转换。`currentRoot` 在消费时与 live root 比对；`etherDelta` 带符号，int192 与 rollupId 打包进同一个 slot。
- `L2ToL1Call {uint16 revertNextNCalls; bool isStatic; uint64 gas; address sourceAddress; uint64 sourceRollupId; address targetAddress; uint256 value; bytes data}`（L89-L98）：要在 L1 上真实执行的调用，通过 source proxy 的 `executeOnBehalf` 发出。L2 侧的同构结构叫 `CrossChainCall` [11]。
- `ExpectedL1ToL2Call {bytes32 expectedL1toL2Hash; L2ToL1Call[] l2ToL1Calls; bytes32 revertedOrStaticRollingHash; bool success; bytes returnData}`（L112-L118）：L1 执行中途重入另一条 rollup 时预先算好的结果。key 为 `keccak256(crossChainCallHash ‖ 当时的 _rollingHash)`；SUCCESS、STATIC、REVERTED 三类共用这一张表。
- `ExecutionEntry {RollupUpdate[] rollupUpdates; bytes32 proxyEntryHash; L2ToL1Call[] l2ToL1Calls; ExpectedL1ToL2Call[] expectedL1ToL2Calls; bytes32 rollingHash; uint64 destinationRollupId; bool success; bytes returnData}`（L128-L137）。
- `ProofSystemBatchPerVerificationEntries`（L34-L47）字段：`expectedRootPerRollup`、`entries`、`staticEntries`、`immediateEntryCount`、`immediateStaticEntryCount`、`proofSystems`、`rollupIdsWithProofSystems`、`blobIndices`、`callData`、`proofs`、`blockNumber`、`bindMsgSenderInPublicInput`。
- 任务里提到的 `RollupStateUpdate` / `CrossChainCall` 名称在当前 L1 接口中**不存在**：L1 用 `RollupUpdate` / `L2ToL1Call`；`CrossChainCall` 是 L2（`IEEZL2.sol`）的名字 [4][8]。rollup0 签名器钉住的旧 ABI 用的是 `StateUpdate{rollupId,currentState,newState,int256 etherDelta}` [20 Annex A]。
- **`proxyEntryHash`** = `computeCrossChainCallHash(isStatic, sourceAddress, sourceRollupId, targetAddress, targetRollupId, value, callGas, data)` = `keccak256(abi.encode(...))` [6 L282-L299]。在 L1 的 proxy 入口，各参数取值为：`isStatic=false`、`sourceRollupId=0`（MAINNET）、`targetAddress/targetRollupId` 取 proxy 记录的原始地址和 rollup、`value=msg.value`、`callGas=0`、`data=原始 calldata` [5 L865-L867][14]。
- **immediate entry（`proxyEntryHash == 0`，即 “L2Tx”）**：没有 proxy 来消费它，对应一笔 L2 发起的交易在 L1 上的落地（可能包含多个 L2→L1 调用）。必须是 canonical 形式（`success=true`、`returnData` 为空）。位于 batch 前导位置时在 `postAndVerifyBatch` 内直接从 calldata 执行；不在前导位置时入队，之后由任何人调用 `executeL2Txs(rid)` 执行 [5][14]。

### 3.4 Rolling hash

**答案**：每个 entry 维护一个 transient 累加器。种子是 `keccak(…keccak(0, rid_i, currentRoot_i)…, proxyEntryHash)`，之后在 6 种带标签的事件上依次折叠：
- `CALL_BEGIN(1, callHash)`、`CALL_END(2, success, retData)`
- `NESTED_BEGIN(3, callHash)`、`NESTED_END(4)`
- `CALL_NOT_FOUND(5, callHash)`、`CALL_INSUFFICIENT_GAS(6)`

最后与 `entry.rollingHash` 做一次比较 [6 L40-L45；L388-L397；L429-L451]。

**为什么要绑定交互轨迹**：proof 担保的是“链下模拟出的那条轨迹”。L1 上的调用是真实执行的，结果可能因为 L1 状态变化而不同。哈希链同时绑定“执行了哪个调用”（CALL_BEGIN 折入调用身份）、“它返回了什么”（CALL_END）以及嵌套边界和顺序。调用错、返回值错、缺少或多出调用、嵌套位置错，任何一处不一致都会让最终哈希不同，整个 entry 随之 revert [13 §I.9][14]。哈希里不折入索引：链式结构本身已经绑定了顺序。重入行的 key 中折入当时的 `_rollingHash`，因此同一个调用在不同位置会对应不同的行 [6][13 §E]。L2 侧的种子是 `keccak(0, proxyEntryHash)`，没有 root 前缀 [11]。

**不确定之处**：标签 5 和 6 是“失败标记”，排除它们依赖 prover/circuit 的约束，合约本身无法强制 [13 §H.4]。

### 3.5 Proof system 与 per-rollup manager

**答案**：接口只有一个函数 `verify(bytes proof, bytes32 publicInputsHash) returns (bool)` [9]。

**publicInputsHash 的构造** [15][5 L753-L785]：
```
sharedPublicInput = keccak256(encodePacked(abi.encode(entryHashes), abi.encode(staticEntryHashes), abi.encode(blobHashes), keccak256(callData), abi.encode(customDataHashes), boundSender))
publicInputsHash[k] = keccak256(encodePacked(sharedPublicInput, acc_k))
acc_k = fold(acc, rollupId, vkey)
```
其中：
- `entryHashes[i] = keccak256(abi.encode(entry))`，覆盖完整 entry；
- `customData` 由 `Rollup.getCustomData(blockNumber)` 提供：0 表示空，max 表示最新块；否则为 `(0, blockhash)`；
- `boundSender` 在 `bindMsgSenderInPublicInput` 为 true 时取 `msg.sender`，否则为 0。

**ECDSAProofSystem**：
- core 版本 [9]：OZ `ECDSA.recover(publicInputsHash, proof) == signer`，对原始摘要签名，不加 EIP-191 前缀；`Ownable`，owner 可调用 `setSigner` 更换 signer。
- rollup0 版本 [23]：signer 是 **immutable**，拒绝 high-s 签名，`vkey = bytes32(uint160(signer))`。
- 两个版本都**不**检查执行正确性。正确性完全依赖链下 signer 的重执行 [18][20]。

**multi-prover**：batch 列出全局的 `proofSystems[]`，每条 rollup 用 `proofSystemIndexes[]` 选出子集。manager 的 `checkProofSystemsAndGetVkeys` 要求子集长度 ≥ `threshold`，且每个 PS 都有非零 vkey。batch 中列出的每个 proof 都必须验证通过 [10 L146][15]。

**Rollup.sol owner 的权限** [10]：
- `addProofSystem` / `removeProofSystem` / `updateVerificationKey`（L227-L250）；
- `setThreshold`：任意值都接受，包括 0（L253）；
- `setRoot`：直接改写 L1 上的 rollup root，只在“本块没有 verify 过、且不在执行中”时被拒（L265 → [5 L1538-L1546]）；
- `transferOwnership`；
- 另外 Rollup 本身也是 TransparentUpgradeableProxy，可以升级 [12]。

**不确定之处**：threshold 设为 0 时，manager 侧的检查形同虚设；但 `_validateBatchStructure` 要求每条 rollup 的 `proofSystemIndexes` 非空，所以每个 batch 仍至少要验证一个 proof [5][10]。

### 3.6 L2 侧 `EEZL2.sol`

**答案**：L2 manager 没有 proof、没有 registry、没有 root。只有 immutable 的 `SYSTEM_ADDRESS` 能调用以下两个函数 [11 L39]：
- `loadExecutionTable(entries, staticEntries)`（L219）：只装表，记下 `lastLoadBlock`；
- `executeIncomingCrossChainCall(entries, staticEntries)`（L308）：原子地换表并执行 `entries[0]`，即投递一笔 L1→L2 入站调用。

**L2→L1 调用如何在 L2 上拿到返回值**：用户的 L2 交易调用“L1 合约在 L2 上的 proxy” → `EEZL2.executeCrossChainCall`（L264）。它计算 `sourceRollupId=ROLLUP_ID` 的 call hash，在已加载的表中前向扫描匹配的 `proxyEntryHash`，执行该 entry（通常没有 incomingCalls，rolling hash 只有种子），然后**直接返回预先算好的 `returnData`** [11][14 “L2→L1 (simple)”]。随调用附带的 `msg.value` 转给 `SYSTEM_ADDRESS` [11]。这个返回值是否真实，在 L1 上兑现：同一 batch 中 `proxyEntryHash==0` 的 L2Tx entry 会在 L1 上真实执行该调用，并核对 `CALL_END(true, retData)` [14]。

**同块约束**：`_validateProxyAndGetDestinationInfo` 要求 `lastLoadBlock == block.number` [11 L785]。

### 3.7 eez-rollup0 节点

**答案**（[18][19][20][22]）：

| 角色 | 职责 |
|---|---|
| sequencer | 驱动一个基于 reth 的 L2 节点出块：平时出普通的 **Live block**；每个 L1 区块对应出一个承载跨链工作的 **Sync block** |
| composer | 两个 ingress 前端（L1→L2 端口 18999，L2→L1 端口 18998）截留跨链交易 → 模拟 → 打包进下一个 Sync block → 组装 batch → 请 signer 签名 → 把 `postAndVerifyBatch` 与用户的 L1 交易作为 bundle 提交给 builder，目标是落在**同一个** L1 区块 |
| proof signer | 对 Sync 窗口内的区块做 stateless（或基于 follower 的 stateful）重执行，逐条核对 settlement 效果，自己重算 publicInputsHash，然后用 ECDSA 签名 |
| deriver / follower | 只读 L1（`BatchPosted` + batch.callData 中的 DA）就能重建相同的 L2 链 |

**Live vs Sync 的区别**：中间的 Live block 不能包含原生系统交易 [19]。Sync block 先提交到 L2，L1 提交没成功时回滚这个 L2 区块，即“L2 only keeps what L1 confirms”[18]。

**`0x76` 系统交易** [19]：
- 编码为 `0x76 || rlp([chainId, nonce, to, value, input])`，没有签名，sender 固定为 `0xeeee…0076`，to 固定为 EEZL2 `0x4200…0007`；
- gas price 为 0，`tx.gasprice` 读出来是 0，隐式 gas 上限 2,000,000；
- 入站交易在执行前 mint 出 `value`，外层失败时撤销这笔 mint；
- 交易池拒绝这种交易；L2 不支持 blob 交易；
- outbound 以 `[load, user]` 成对出现，inbound 是独立的投递交易。

**预部署**：EEZL2 在 `0x4200000000000000000000000000000000000007`，系统地址 `0xeeee…eeee0076` 没有私钥 [18][19]。

**signer profile**（[20] §1、§7–§12）：
- 只支持 `anchor, outbound*, inbound*` 这样的 entry 序列；单 rollup、单 PS、单 vkey；
- 不支持 static entry、嵌套调用、一个 effect 含多个调用、显式 call gas、强制回滚段、blob、L1 block 绑定、sender 绑定、多 PS；
- 要求 `blobIndices` 为空、`blockNumber=0`、`bindMsgSender=false`；
- “root”取的是 L2 **区块哈希**（以及交易前缀对应的候选区块哈希），不是 state root [20 §8.1][22 §3.1]；
- 签名**不**证明 canonical 祖先、finality、排序者授权、未来 L1 执行一定成功，也不证明即时/排队的调度方式 [20 §1.1]。

**父链**：README @6ff63ecd 写的是“The supported L1 is Gnosis Chiado (a testnet)”[18]。主网交易存在（主会话解码 [25]），但 rollup0 README 没有记录 Ethereum 主网部署。

**不确定之处**：signer SPEC 钉住的是 core-protocol 的**旧** commit `6fcc90b6`，其 ABI（`StateUpdate`、7 参数的 `executeIncomingCrossChainCall`、selector `0xcafef125`）与 core @6ae4110f 不同 [20 Annex A]。也就是说，同一时间点的两个仓库并不是同一版协议。

---

## Q4 一笔 AS 交易的完整生命周期

### 4a L1→L2（与主网首笔交易形态相同：用户向 CrossChainProxy 转 0.001 ETH、空 input）

1. 用户在 L1 签好一笔“调用 L2 合约 B 的 L1 proxy”的交易，发往 composer 的 L1→L2 前端，交易被截留 [18]。
2. composer 基于 L2 当前状态模拟 B 的执行，得到 `returnData` 和 L2 新状态，并在 Sync block 里放入一笔 `0x76` 投递交易（`executeIncomingCrossChainCall`，`value` 在 L2 上 mint 出来）[19][20 §9]。Sync block **先在 L2 本地提交**（暂定状态）[18]。
3. composer 组装 batch：`entries = [anchor(proxyEntryHash=0), …, inbound entry]`。inbound entry 中 `proxyEntryHash = hash(false, user, 0, B, rid, v, 0, data)`，`l2ToL1Calls` 为空，`rollingHash` 只有种子，`etherDelta = +v`，`newRoot` = 候选区块哈希；`immediateEntryCount` 只覆盖前导 L2Tx 部分，所以 inbound entry **入队**等待消费 [20 §8–§9][22 §3.1]。
4. signer 重执行并签名，composer 把签名填入 `proofs`，再把 `[postAndVerifyBatch 交易, 用户交易]` 作为 bundle 交给 builder，要求同块包含 [22 §1、§5][18]。
5. L1 区块 N 中：交易 A 调 `postAndVerifyBatch`，验证 ECDSA 签名、设 `lastVerifiedBlock=N`、执行 anchor（root 从已结算的区块哈希推进到空候选块的哈希 E）、inbound entry 入队 [5]。交易 B（用户交易）进入 proxy 的 `fallback` → `_fallback` → `EEZ.executeCrossChainCall(user, "")` 并附带 `msg.value`，然后：
   - 同块检查通过 → 前向扫描匹配 hash、destination、live root（此时 root 已经是 E）；
   - `_executeEntry`：root 检查、rolling hash 种子比对、`Σ etherDelta(+v) == msg.value(v)` 检查；
   - root 推进到 `newRoot`，`etherBalance += v`；
   - 把 `returnData` 返回给用户 [5][7]。
6. **canonical 的时刻**：区块 N 被 L1 接受，且交易 B 成功消费了 entry，此时 L1 上的 `rollups[rid].root` 就是新的 L2 区块承诺。follower 从 `BatchPosted` 和 DA 重建 L2 [18]。**最终性**等区块 N 在 L1 上 finalized 时才具备 [24]。

### 4b L2→L1

1. 用户签一笔 L2 交易（L2 合约 D 调用 L1 合约 C 在 L2 上的 proxy），发往 L2→L1 前端 [18]。
2. composer 模拟：先在 L1 视图上模拟 C 得到 `retC`，再构造 Sync block 中的 `[0x76 load(execution table: proxyEntryHash=hashL2Out(D→C), returnData=retC), 用户交易]` 这一对。用户交易在 L2 上调 proxy，拿到 `retC` 后继续执行 [19][14][11]。
3. batch 中对应一条 **immediate L2Tx entry**：`proxyEntryHash=0`，`l2ToL1Calls=[{src=D, srcRollup=rid, target=C, …}]`，`rollingHash = seed → CALL_BEGIN → CALL_END(true, retC)`，`etherDelta = -value` [20 §10][14]。
4. L1：`postAndVerifyBatch` 验证完成后直接从 calldata 执行这条 entry，经过 D 在 L1 上的 proxy（不存在则自动创建）调用 `executeOnBehalf(C, gas, data)`。C 在 L1 上**真实执行**；`retC` 与模拟结果不一致时 → `RollingHashMismatch` → 这条 entry 被跳过（emit `L2TxSkipped`）[5]。

### 4c 失败、回滚、未消费的情况

| 情况 | 结果 | 来源 |
|---|---|---|
| 任一 proof 验证失败 | 整个 `postAndVerifyBatch` revert，状态不变 | [5][15] |
| proxy 调用发生在 verify 之前或之后的区块 | `ExecutionNotInCurrentBlock` | [5 L1572] |
| 前置 root 已经变了（依赖的 entry 被跳过） | 队列路径：不匹配，最终 `ExecutionNotFound`；即时路径：`RootMismatch` | [5][13 §H.8] |
| L1 真实执行结果与模拟不同 | `RollingHashMismatch`，整个 entry 回滚 | [5 L1026] |
| ETH 净流量与 `Σ etherDelta` 不等 | `EtherDeltaMismatch` | [5 L1032] |
| 即时 L2Tx 执行失败 | revert 数据非空时跳过并 emit `L2TxSkipped`；为空时整批 revert（`ImmediateL2TxOutOfGas`）；前导段全部失败也整批 revert | [5 L417-L434][16] |
| 入队但本块没被消费 | 下一块不可读（同块 gate）；下一次 verify 会覆盖队列。“proof 通过 ≠ 每条 entry 都送达” | [16][13 §G.4–G.5] |
| poster 的 meta hook 什么都不消费 | 即时 entry 被丢弃；proof 不覆盖调度参数，需要用 `bindMsgSenderInPublicInput` 限定 poster | [16] |
| L1→L2 调用在 L2 上 revert，或 L1 frame 之后被回滚 | 视为“lookup”：L2 上不投递、root 不动；L1 上对应 `success=false` 的 entry 会把 root 一起回滚 | [13 §A.1] |
| L1 bundle 没有上链 | L2 回滚 Sync block | [18] |
| 证明超时 | 提交一个空的 Sync block，effect 保留到下个周期 | [22 §6.3] |

**不确定之处**：rollup0 profile 里 root 是一条“候选区块哈希链”。如果中间某个 outbound entry 被跳过，后续 entry 的 `currentRoot` 都会对不上，L1 的 root 会停在某个前缀候选块上。节点如何把 L2 重组到这个前缀，本 lane 没有读到对应规范（speculative）。

---

## Q5 需要改的 infra 清单

| 层 | 需要改 / 新增 | 依据 |
|---|---|---|
| Ethereum L1 协议 | **不需要硬分叉**：全部通过合约实现；L1 共识保持上游 Ethereum/Gnosis | [1 “No L1 Fork Required”][19] |
| L1 合约 | `EEZ`（可升级代理）+ 每条 rollup 一个 `Rollup` manager + `ECDSAProofSystem`（或 ZK verifier）+ 按需自动部署的 `CrossChainProxy`；`registerRollup` | [5][10][12] |
| L2 执行客户端 | reth 改造：`0x76` 原生系统交易（无签名、零 gas price、mint 语义、固定 2M gas）、EEZL2 预部署 `0x42…07`、系统地址 `0xeee…0076`、交易池拒绝 0x76 和保留 sender、禁用 blob 交易、Live/Sync 两类区块；需要**全新 genesis**，不支持原地迁移 | [19][18] |
| composer / sequencer | 跨链 ingress 前端、多域模拟、生成 execution table 与 Sync block、组装 batch、构造 DA（`callData = 0x00 ‖ RLP([blockTxCounts, transactions, l2Entries])`）、settlement 截止时间、失败时回落到空 Sync block | [18][22 §3、§6] |
| prover / signer | 单飞 gRPC `Prove` 服务：stateless/stateful 重执行，校验 settlement 效果、DA 和系统交易字节，重算 publicInputsHash 后 ECDSA 签名；未来替换为 ZK | [20][21][22] |
| L1 builder / 提交者 | 需要**原子 bundle 同块包含**（`postAndVerifyBatch` + 用户 L1 交易）。README 提醒 rbuilder-chiado 一个 bundle 超过约 3 笔时会静默丢弃多出的交易 | [18] |
| deriver / follower | 从 L1 `BatchPosted` 和 calldata DA 重建，包括重建被省略的系统交易 | [18][19][20 §11] |
| RPC / 钱包 | 跨链交易必须发到 ingress 前端（普通 RPC 不会组合）；提供 `eez_composerInfo`；用户交互对象是 proxy 地址；在入站执行中 `tx.gasprice=0`，依赖报销的合约会受影响 | [18][19] |
| 应用合约 | 授权时要识别跨域身份（`msg.sender` 是 proxy）；不要依赖 `gasleft()` 或 proxy 的 `balance` / `extcodesize` | [16][13 §I.6] |

---

## Q6 当前边界与风险

1. **未审计、仍在变化**：README、CLAUDE.md 和合约 natspec 都写明 “EARLY-STAGE … not audited”，并且“Do not rely on this code for value-bearing deployments”[3][4][5]。
2. **信任 ECDSA**：所谓 proof 只是单个 signer 的签名。signer 私钥泄露或 signer 作恶，就能让任意 root 转换通过验证（推断，依据 [9][23]：verify 只做 ecrecover）。README 明确说这不是 succinct validity proof [18]。
3. **owner 与升级权限**：
   - Rollup owner 可以 `setRoot`（任意改写 root）、改 threshold、增删 PS 或 vkey [10]；
   - EEZ、Rollup、EEZL2 都部署在 transparent proxy 后面，ProxyAdmin owner 可以替换逻辑 [12]；
   - core 版本 ECDSAProofSystem 的 owner 可以更换 signer [9]。
4. **跨部署重放**：public input 不绑定 `block.chainid`、registry 地址或协议版本，需要由各部署自己保证域隔离 [16]。proxy 的 salt 也不含 chainid [4]。rollup0 默认 `blockNumber=0`（不绑定 L1 区块）[20 §7]。
5. **调度参数不在证明范围内**：`immediateEntryCount` 和 `immediateStaticEntryCount` 不进入 public input，poster 可以决定即时还是排队，也可以丢弃即时 entry [16][20 §1.2]。旧 proof 仍可以替换掉已经排队的有用工作 [16]。
6. **不支持的程序形态**：依赖 `gasleft()` 的结果、静态候选无法区分、proxy 的操作码语义差异、revert 原因无法区分 [16]。rollup0 profile 连嵌套调用和 static 调用都不支持 [20]。
7. **中心化与审查**：只有 composer 能把跨链交易放进 Sync block，同块原子性依赖 builder 的 bundle 支持；composer 或 builder 可以拒绝或延迟用户交易，按合约设计只会导致“未执行”，不会导致错误状态（推断，依据 [16][18][5]）。signer 还能通过报告“可处理的失败”把用户交易驱逐出去 [20 §14.1]。
8. **L2 资金池**：EEZL2 没有按表核对 ETH 的账本，库存核对由节点或 circuit 负责 [13 §H.2][16]。

---

## 图的素材

**A. 架构（参与者）**
- L1：User EOA/合约 → `CrossChainProxy(L1, 代表 L2 地址)` → `EEZ`（TransparentProxy）↔ `Rollup` manager ↔ `ECDSAProofSystem` [5][7][10][9]
- 链下：Composer（含 ingress 前端 18999/18998、内嵌的 L1 节点、驱动 L2 reth 的 sequencer）↔ Proof signer（gRPC Prove）→ L1 builder（bundle）[18][22]
- L2：reth（Live/Sync 区块）+ `EEZL2 @0x42…07` + 系统地址 `0xeee…0076`（0x76 交易）+ `CrossChainProxy(L2, 代表 L1 地址)` [19]
- Follower/Deriver：读取 L1 `BatchPosted` 和 DA → 重建 L2 [18]

**B. L1→L2 时序（对应主网交易形态）** [5][7][18][20][22]
1. User → L1→L2 前端：提交已签名的 L1 交易
2. Composer：模拟，在 Sync block 中放入 0x76 `executeIncomingCrossChainCall`（L2 本地暂定提交）
3. Composer → Signer：Prove（batch + 区块 witness）→ 返回 65 字节签名
4. Composer → Builder：bundle[tx_a=`postAndVerifyBatch`, tx_b=用户交易]
5. 区块 N：tx_a → EEZ 验证 proof、设 `lastVerifiedBlock=N`、执行 anchor、inbound entry 入队、emit `BatchPosted`
6. 区块 N：tx_b → Proxy.fallback → `EEZ.executeCrossChainCall` → 匹配 entry → 检查 root → 检查 rolling hash → ETH 守恒 → 推进 root、`etherBalance += v` → 返回 returnData
7. Follower 从区块 N 派生；L1 finalized 后具备最终性

**C. L2→L1 时序** [11][14][20]
1. User → L2→L1 前端；Composer 在 L1 视图上模拟 C
2. Sync block：[0x76 loadExecutionTable, 用户交易]；用户交易 → L2 proxy → `EEZL2.executeCrossChainCall` → 返回预计算的 retC
3. L1：`postAndVerifyBatch` 内执行即时 L2Tx entry → D 的 L1 proxy `executeOnBehalf` → C 真实执行 → 核对 CALL_END(true, retC)

**D. Entry 状态机（L1）** [5][13][16]
- `posted`：proof 通过，`lastVerifiedBlock = N`，处于即时、transient 或队列中
- → `consumed`：hash、destination、live root 匹配，rolling hash 和 ETH 校验通过 → root 推进
- → `consumed-but-reverted`：`success=false`，或校验失败 → 回滚，游标恢复（可以重试）
- → `skipped`：前向扫描越过它（root pin 不匹配），永不执行
- → `expired`：到了区块 N+1，同块 gate 拒绝
- → `replaced`：同块再次 verify 时队列被重置

**E. L2 Sync block 状态** [18][22]：本地提交（暂定）→ L1 bundle 落块且 entry 被消费 → canonical；L1 未包含 → 回滚；证明超时 → 改为空 Sync block，effect 延到下个周期。

**F. 对比维度（异步桥 vs EEZ AS）**：返回值在同一笔交易内可用（否 / 是）；跨链原子性（否 / 由 entry 级 revert 保证）；延迟（多笔交易、挑战期或证明延迟 / 同一 L1 区块）；信任（桥的验证 / proof system + composer + builder）；L1 改动（无 / 无）；L2 改动（少 / 系统交易 + 预部署 + 新 genesis）[1][5][18][19]。

---

## 代码素材

**① CrossChainProxy：所有非 manager 调用都转到 EEZ**（eez-core-protocol/src/base/CrossChainProxy.sol#L113-L128@6ae4110f）
```solidity
function _fallback() internal {
    uint256 staticCheckGas = IEEZ(EEZ).STATIC_CHECK_GAS();
    (bool success,) = address(this).call{gas: staticCheckGas}(abi.encodeWithSelector(STATIC_CHECK_SELECTOR));
    bytes memory result;
    if (!success) {
        (success, result) = EEZ.staticcall(abi.encodeCall(IEEZ.staticCrossChainCall, (msg.sender, msg.data)));
    } else {
        (success, result) =
            EEZ.call{value: msg.value}(abi.encodeCall(IEEZ.executeCrossChainCall, (msg.sender, msg.data)));
    }
    ...
```

**② proxy 地址派生**（src/base/EEZBase.sol#L237、L258-L260@6ae4110f）
```solidity
bytes32 salt = keccak256(abi.encodePacked(originalRollupId, originalAddress));
proxy = address(new CrossChainProxy{salt: salt}());
// address = keccak256(0xff ‖ manager ‖ salt ‖ PROXY_INIT_CODE_HASH)[12:]
```

**③ Rolling hash**（src/base/EEZBase.sol#L388-L397、L429-L439@6ae4110f）
```solidity
function _rollingHashEntryBegin(RollupUpdate[] memory rollupUpdates, bytes32 proxyEntryHash) internal {
    if (_rollingHash != bytes32(0)) revert RollingHashNotCleared();
    bytes32 _rollupRootsHash;
    for (uint256 i = 0; i < rollupUpdates.length; i++) {
        _rollupRootsHash =
            keccak256(abi.encodePacked(_rollupRootsHash, rollupUpdates[i].rollupId, rollupUpdates[i].currentRoot));
    }
    _rollingHash = keccak256(abi.encodePacked(_rollupRootsHash, proxyEntryHash));
}
function _rollingHashCallBegin(bytes32 crossChainCallHash) internal {
    _rollingHash = keccak256(abi.encodePacked(_rollingHash, CALL_BEGIN, crossChainCallHash));
}
function _rollingHashCallEnd(bool success, bytes memory retData) internal {
    _rollingHash = keccak256(abi.encodePacked(_rollingHash, CALL_END, success, retData));
}
```

**④ 执行 entry 时的检查**（src/EEZ.sol#L1011-L1032@6ae4110f，节选）
```solidity
for (uint256 i = 0; i < rollupUpdates.length; i++) {
    if (rollups[rollupUpdates[i].rollupId].root != rollupUpdates[i].currentRoot) {
        revert RootMismatch(rollupUpdates[i].rollupId);
    }
    _pushVerifiedRollup(rollupUpdates[i].rollupId);
}
_rollingHashEntryBegin(rollupUpdates, proxyEntryHash);
_lastL1ToL2CallConsumed = 0;
_processL2ToL1Calls(l2ToL1Calls);
int256 totalEtherDelta = _applyRollupUpdates(rollupUpdates);
if (_rollingHash != rollingHash) revert RollingHashMismatch();
if (totalEtherDelta != _entryEtherDelta) revert EtherDeltaMismatch();
```

**⑤ 同块 gate**（src/EEZ.sol#L1572-L1576@6ae4110f）
```solidity
function _requireVerifiedThisBlock(uint64 rollupId) internal view {
    if (verificationByRollup[rollupId].lastVerifiedBlock != uint64(block.number)) {
        revert ExecutionNotInCurrentBlock(rollupId);
    }
}
```

**⑥ public input**（src/EEZ.sol#L753-L762、L785-L787@6ae4110f）
```solidity
bytes32 sharedPublicInput = keccak256(abi.encodePacked(
    abi.encode(entryHashes), abi.encode(staticEntryHashes), abi.encode(blobHashes),
    keccak256(batch.callData), abi.encode(customDataHashes),
    batch.bindMsgSenderInPublicInput ? msg.sender : address(0)));
...
bytes32 publicInputsHash = keccak256(abi.encodePacked(sharedPublicInput, accRollupsWithVerificationKeys));
if (!IProofSystem(batch.proofSystems[k]).verify(batch.proofs[k], publicInputsHash)) revert InvalidProof();
```

**⑦ ECDSA “proof”**（src/proofSystems/ECDSAProofSystem.sol#L67-L70@6ae4110f）
```solidity
function verify(bytes calldata proof, bytes32 publicInputsHash) external view returns (bool) {
    address recovered = ECDSA.recover(publicInputsHash, proof);
    return recovered == signer;
}
```

**⑧ L1 入口计算 call hash**（src/EEZ.sol#L865-L880@6ae4110f）
```solidity
bytes32 crossChainCallHash = computeCrossChainCallHash(
    NOT_STATIC_CALL, sourceAddress, MAINNET_ROLLUP_ID, destAddress, destRid, msg.value, ZERO_CALL_GAS, callData);
if (_insideExecution()) { _entryEtherDelta += int256(msg.value); return _consumeNestedCall(destRid, crossChainCallHash); }
_entryEtherDelta = int256(msg.value);
return _consumeAndExecuteEntry(destRid, crossChainCallHash);
```

**⑨ 0x76 线格式**（eez-rollup0/docs/native-system-transactions.md@6ff63ecd）：`0x76 || rlp([chainId, nonce, to, value, input])`，sender 固定为 `0xeeee…0076`，to 固定为 `0x4200…0007`。

GitHub 链接示例：https://github.com/eez-association/eez-core-protocol/blob/6ae4110fb748fd10882d5afea576fbd1a5c38fc3/src/EEZ.sol#L371 、https://github.com/eez-association/eez-core-protocol/blob/6ae4110fb748fd10882d5afea576fbd1a5c38fc3/src/base/EEZBase.sol#L388 、https://github.com/eez-association/eez-core-protocol/blob/6ae4110fb748fd10882d5afea576fbd1a5c38fc3/src/base/CrossChainProxy.sol#L113

---

## 来源

1. **PRIMARY** Jordi Baylina，“Synchronous Composability Between Rollups via Realtime Proving”，ethresear.ch topic 23998 第 1 帖（2026-02-02），https://ethresear.ch/t/23998.json （访问 2026-10-06）。证明了原帖的定义、execution table、proxy 模型、REVERT/REVERT_CONTINUE、不需要 L1 分叉，以及参考实现指向 jbaylina/sync-rollups。
2. **PRIMARY** 同一 topic 的回帖：#2（Péter Garamvölgyi 提出 atomicity 与 non-interleaving 问题）、#8（Baylina 回答：shared sequencer 规定总序、slot 外调用 proxy 会 revert）、#13–#16（状态依赖分支、跳过的 entry 不应跨块）（访问 2026-10-06）。证明了作者对隔离性和同 slot 约束的表述。
3. **PRIMARY** eez-core-protocol/README.md@6ae4110f。证明了 “EARLY-STAGE … not audited”、两侧合约的分工，以及“within a single L1 block”。
4. **PRIMARY** eez-core-protocol/CLAUDE.md@6ae4110f。证明了结构字段注释、CREATE2 salt 不含 chainid、函数清单。
5. **PRIMARY** eez-core-protocol/src/EEZ.sol@6ae4110f（行号见正文）。证明了 postAndVerifyBatch 的流程、同块 gate、entry 检查、ETH 守恒、setRoot。
6. **PRIMARY** src/base/EEZBase.sol@6ae4110f。证明了标签常量、rolling hash 折叠、call hash 公式、proxy 地址派生。
7. **PRIMARY** src/base/CrossChainProxy.sol@6ae4110f。证明了 fallback/executeOnBehalf 分派、没有 receive、static 检测。
8. **PRIMARY** src/interfaces/IEEZ.sol@6ae4110f。证明了各 L1 结构体的字段。
9. **PRIMARY** src/interfaces/IProofSystem.sol + src/proofSystems/ECDSAProofSystem.sol@6ae4110f。证明了 verify 接口、ECDSA 只做 recover、owner 可以 setSigner。
10. **PRIMARY** src/rollupContract/Rollup.sol@6ae4110f。证明了 threshold、vkey、getCustomData 和 owner 权限（包括 setRoot）。
11. **PRIMARY** src/L2/EEZL2.sol@6ae4110f。证明了 SYSTEM_ADDRESS、load/executeIncoming、L2 侧返回预计算值、lastLoadBlock gate。
12. **PRIMARY** src/proxy/EEZProxy.sol + deployment/Deploy.s.sol + deployment/README.md@6ae4110f。证明了 EEZ/Rollup/EEZL2 均可升级、DeployL1 默认 ECDSA 且 threshold=1。
13. **PRIMARY** docs/CORE_PROTOCOL_SPEC.md@6ae4110f（§A.1 prover constraints、§E、§G、§H、§I）。证明了 lookup 不投递、同块限制、队列替换、安全性论证。
14. **PRIMARY** docs/EXECUTION_ENTRY_SPEC.md@6ae4110f。证明了 hash 取值表、L1→L2 和 L2→L1 的示例表、投递单元。
15. **PRIMARY** docs/MULTI_PROVER_SPEC.md@6ae4110f。证明了 publicInputsHash 的构造、threshold 在 manager、调度参数不被证明。
16. **PRIMARY** docs/CAVEATS.md@6ae4110f。证明了 proxy 操作码差异、“posting 不保证送达”、即时调度未被证明、未绑定 chainid、gasleft 不受支持。
17. **PRIMARY** test/blob/SCENARIO_CATALOG.md@6ae4110f。证明了“L2Tx host（即时）”与“Origin entry（入队、同块消费）”两种角色。
18. **PRIMARY** eez-rollup0/README.md@6ff63ecd。证明了四个角色、Live/Sync、先提交后修复、同块 bundle、支持的 L1 为 Chiado、“not yet a succinct validity proof”、ingress 端口、bundle 上限。
19. **PRIMARY** eez-rollup0/docs/native-system-transactions.md@6ff63ecd。证明了 0x76 格式、固定 sender/to、零 gas price、mint 语义、需要全新 genesis、L1 共识不变。
20. **PRIMARY** eez-rollup0/crates/eez-proof-signer/SPEC.md@6ff63ecd。证明了 signer 支持的 profile、签名不承诺的内容、root 是区块哈希链、钉住旧 core commit 6fcc90b6 与旧 ABI、actionable failure 驱逐。
21. **PRIMARY** eez-rollup0/crates/eez-proof-signer/docs/architecture.md@6ff63ecd。证明了 signer 的信任边界和“不观察 L1/L2 fork choice”。
22. **PRIMARY** eez-rollup0/crates/eez-control-rpc/SPEC.md@6ff63ecd。证明了 composer 的 7 步流程、batch 字段要求、DA 格式、状态链、截止时间与空 Sync block 回落。
23. **PRIMARY** eez-rollup0/contracts/src/ECDSAProofSystem.sol@6ff63ecd。证明了 rollup0 版本 signer 为 immutable、拒绝 high-s、vkey=signer 地址。
24. **PRIMARY** ethereum.org，“Proof-of-stake (PoS)”，https://ethereum.org/en/developers/docs/consensus-mechanisms/pos/ （访问 2026-10-06）。证明了 checkpoint 与 2/3 投票的 finalized 语义。
25. 主会话链上解码（common.md 提供，本 lane 未复核）：区块 26127444，第 31 笔是 `postAndVerifyBatch`（1 个 blob，65 字节 ECDSA proof），第 32 笔是用户向 CrossChainProxy 转 0.001 ETH、input 为空。
26. 外部调研（ChatGPT Deep Research）：research/atomic-synchronous-tx.md，**只作线索**。

---

## 外部调研中被修正或无法核实的地方

- **已核实**：“完整部署脚本默认 ECDSAProofSystem、threshold 1”成立（Deploy.s.sol 中 `DeployL1` 写死 threshold 1）[12]。“参考节点以 Chiado 为支持父链”成立 [18]。“root 不等于 stateRoot，rollup0 用区块哈希链”成立 [20][22]。
- **来源需替换**：GPT 引用 ethresear.ch topic 23426 作为 non-interleaving 需求的来源，本 lane 未打开该帖。topic 23998 自己的回帖 #2 和 #8 就有直接讨论 [2]，建议改引 23998。
- **需要补充**：GPT 没有注意到 rollup0 的 signer/composer 钉住的是 core-protocol **旧 commit 6fcc90b6**。两者 ABI 不同（`StateUpdate`/`int256 etherDelta`/7 参数的 `executeIncomingCrossChainCall`，对比当前的 `RollupUpdate`/`int192`/2 参数）；`ECDSAProofSystem` 也有两个实现（core 版 owner 可换 signer；rollup0 版 signer immutable）[9][20][23]。所以“按 main 分支读合约就能解释部署”的说法不成立。
- **需要更新**：GPT 写的“链上时间戳未独立验证、verifier 类型未确认”已经过时。主会话已解码：区块 26127444，2026-10-05 16:44:59 UTC，proof 为 65 字节签名 [25]。由此推断 verifier 是 ECDSA 型，但具体是哪个合约仍需核对。
- **补充一个细节**：GPT 说 threshold 可以配置，但没提 Rollup 允许 `setThreshold(0)`。即便如此，EEZ 仍要求每条 rollup 至少选一个 PS [5][10]。GPT 也没提 Rollup owner 的 `setRoot` 逃生口、EEZ 本身可升级 [10][12]。
- **无法核实（不属本 lane）**：GIP-153 的“初期 TEE 证明、composer 集中运营”；crypto.news 的“首次主网 L1→L2”报道（二手）。
- **措辞修正**：GPT 第 6.2 节所称原帖的“action 序列”，准确说法是 CALL/RESULT/L2TX 加 REVERT/REVERT_CONTINUE，见原帖第 5 节 [1]。

## 开放问题

1. 主网 EEZ 实现 0x4c3d971b… 的字节码对应 core-protocol 的哪个 commit？`postAndVerifyBatch` 的 selector 是 rollup0 钉住的 `0xcafef125`，还是 @6ae4110f 新 ABI 的 selector？（需要 Etherscan/Blockscout 的验证源码，或在本地编译后比对）
2. 主网交易 31 带了 1 个 blob，但 rollup0 profile 要求 `blobIndices=[]`。这个 blob 是被 batch 引用了，还是只挂在交易层？说明主网部署用的 profile 可能不同于 @6ff63ecd。
3. 主网上 Rollup manager 的 owner、threshold、PS 列表，ECDSAProofSystem 的 signer 和 owner（如果有），以及 EEZ ProxyAdmin 的 owner，分别是谁？
4. 主网对应的 L2 是哪条链（chain id、rollupId）？主网用的是不是 rollup0 composer（README 只写了 Chiado）？
5. outbound entry 中途被跳过后，L2 节点如何重组到 L1 实际停留的那个前缀候选区块？
6. 同块 bundle 依赖哪个 builder 或 relay？主网是否用了私有 bundle？builder 不支持原子 bundle 时会有什么后果？

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| M1 | 原帖由 Jordi Baylina 于 2026-02-02 在 ethresear.ch topic 23998 发表 | [1] 23998.json 第 1 帖 created_at 2026-02-02T07:55:46Z，作者 jbaylina | observed | |
| M2 | 原帖把同步可组合定义为：同一笔交易内 CALL 另一条链的合约，在同一执行上下文中拿到返回值，所有链一起成功或一起 revert | [1] 第 2 节原文 | observed | |
| M3 | 原帖主张整套机制不需要分叉 L1，全部通过合约实现 | [1] “No L1 Fork Required” 一节 | observed | |
| M4 | 原帖设计是 execution table 加上单个 validity proof，proxy 查表、核对并应用 root、执行嵌套 L1 调用后返回 RESULT | [1] 第 5 节 Step 2–3 | observed | |
| M5 | 作者回帖称：shared sequencer 规定唯一的线性顺序，同 slot 内不允许 L1→L2 与 L2→L1 交错；不在 sequencer 的 slot 内调用 proxy 会 revert | [2] 第 8 帖 jbaylina 回复 | observed | |
| M6 | 当前代码用“扁平调用数组 + 统一重入表 + rolling hash + success 标志”取代了原帖的 action/nextAction 和 REVERT_CONTINUE | [8] IEEZ.sol L112-L137；[1] 第 5 节 | observed | |
| M7 | 当前代码用可插拔的 multi-prover 取代原帖的单一 ZK proof，仓库自带的是 ECDSAProofSystem | [9]；[15]；[12] DeployL1 | observed | |
| M8 | rollup0 README 明确称当前 ECDSA attestation 不是 succinct validity proof | [18] README 原文 “not yet a succinct validity proof” | observed | |
| M9 | postAndVerifyBatch 先完成全部 proof 验证，再修改状态；任一 proof 失败整批 revert | [5] EEZ.sol L399、L787；[15] Counting rule | observed | |
| M10 | 每次 verify 把参与 rollup 的 lastVerifiedBlock 设为当前块，并重置该 rollup 的队列和游标 | [5] EEZ.sol L404-L406、L804-L811 | observed | |
| M11 | proxy 入口和 executeL2Txs 都要求 lastVerifiedBlock == block.number，否则 revert ExecutionNotInCurrentBlock | [5] EEZ.sol L1572-L1576 | observed | |
| M12 | 执行 entry 时依次检查 currentRoot、rolling hash、ETH 守恒，任一失败整条 entry revert | [5] EEZ.sol L1011-L1032 | observed | |
| M13 | entry 的 root 更新在其全部调用执行完之后才写入，执行中途读到的是前置状态 | [5] EEZ.sol L1021-L1022；[13] §H.1 | observed | |
| M14 | 队列匹配要求 proxyEntryHash、destinationRollupId 和所有 live root pin 同时相等，不匹配的 entry 被跳过 | [5] _entryMatches；[13] §G.3 | observed | |
| M15 | 前导 proxyEntryHash==0 的 L2Tx 在 postAndVerifyBatch 内用 try/catch 执行，失败且数据非空时 emit L2TxSkipped | [5] EEZ.sol L417-L434 | observed | |
| M16 | 即时前缀之外的 entry 无条件按 destinationRollupId 入队 | [5] EEZ.sol L463；[15] 第 8 步 | observed | |
| M17 | immediateEntryCount 和 immediateStaticEntryCount 不进入 public input，由 poster 选择调度方式 | [15] Unproven dispatch params；[16] Immediate dispatch is not proven | observed | |
| M18 | publicInputsHash 绑定完整的 entry 哈希、static entry 哈希、blob 哈希、callData 哈希、per-rollup customData、可选的 sender，以及 (rollupId, vkey) 累加器 | [5] EEZ.sol L753-L785；[15] | observed | |
| M19 | public input 不绑定 block.chainid、registry 地址或协议版本 | [16] Proof domains 一节 | observed | |
| M20 | CrossChainProxy 的 CREATE2 salt 为 keccak256(originalRollupId, originalAddress)，部署者是 manager，salt 不含 chainid | [6] EEZBase.sol L237、L247-L260；[4] | observed | |
| M21 | CrossChainProxy 没有 receive 函数，空 calldata 的 ETH 转账也进入 fallback 并转为 executeCrossChainCall | [7] CrossChainProxy.sol L67 fallback 与 L113-L128 _fallback，全文无 receive | observed | |
| M22 | 只有 manager 调用 executeOnBehalf 时，proxy 才会去调本链的目标合约 | [7] CrossChainProxy.sol L69 | observed | |
| M23 | 目标合约看到的 msg.sender 是远端调用者在本链对应的 proxy 地址 | [13] §I.6 | observed | |
| M24 | L1 proxy 入口计算 call hash 时，sourceRollupId 取 0、callGas 取 0、value 取 msg.value | [5] EEZ.sol L865-L867；[14] hash 表 | observed | |
| M25 | rolling hash 的种子是 (rollupId, currentRoot) 序列加 proxyEntryHash，之后按 CALL_BEGIN/CALL_END/NESTED_BEGIN/NESTED_END/CALL_NOT_FOUND/CALL_INSUFFICIENT_GAS 六种标签折叠 | [6] EEZBase.sol L40-L45、L388-L451 | observed | |
| M26 | rolling hash 让错误的调用、错误的返回值、缺少或多出调用、嵌套位置错误都在 entry 边界被拒绝 | [13] §I.9；[14] Rolling Hash | observed | |
| M27 | 排除标签 5 和 6 依赖 prover 约束，合约无法强制 | [13] §H.4 Prover requirement | observed | |
| M28 | 仓库内的 ECDSAProofSystem.verify 只检查 ecrecover 出的地址是否等于 signer，不检查执行正确性 | [9] ECDSAProofSystem.sol L67-L70 | observed | |
| M29 | core 版 ECDSAProofSystem 的 owner 可以更换 signer；rollup0 版的 signer 是 immutable | [9] L51 setSigner；[23] immutable signer | observed | |
| M30 | Rollup owner 可以增删 proof system、改 vkey、任意设置 threshold，并通过 setRoot 直接改写 L1 上的 rollup root | [10] Rollup.sol L227-L268 | observed | |
| M31 | setRoot 只在本块没有 verify 过、且不在执行中时可用 | [5] EEZ.sol L1538-L1546 | observed | |
| M32 | EEZ、Rollup、EEZL2 都部署在 transparent upgradeable proxy 后面，可以升级 | [12] EEZProxy.sol；Deploy.s.sol _deployEEZ、_deployRollup、_deployL2 | observed | |
| M33 | 部署脚本 DeployL1 默认部署单个 ECDSAProofSystem，threshold 为 1 | [12] Deploy.s.sol DeployL1；deployment/README.md | observed | |
| M34 | EEZL2 只允许 SYSTEM_ADDRESS 装表或投递入站调用，并要求消费发生在装表的同一块 | [11] EEZL2.sol L39、L219、L308、L785 | observed | |
| M35 | L2→L1 调用在 L2 上返回的是表中预先算好的 returnData，其真实性在 L1 执行 L2Tx entry 时由 CALL_END 核对 | [11] executeCrossChainCall L264；[14] L2→L1 (simple) 示例 | observed | |
| M36 | rollup0 的 L2 原生系统交易类型为 0x76：无签名，sender 固定 0xeee…0076，to 固定 EEZL2 0x4200…0007，gas price 为 0 | [19] native-system-transactions.md | observed | |
| M37 | 入站系统交易在执行前 mint 出 value，外层失败时撤销这笔 mint | [19] | observed | |
| M38 | rollup0 平时出 Live block，每个 L1 区块对应一个 Sync block；Sync block 先提交到 L2，L1 未确认时回滚 | [18] README “What it does” | observed | |
| M39 | composer 把 postAndVerifyBatch 和用户 L1 交易作为 bundle 提交，目标是落在同一个 L1 区块 | [18] README “Routes cross-chain calls” | observed | |
| M40 | rollup0 README 写明支持的 L1 是 Gnosis Chiado 测试网 | [18] README 第一段 | observed | |
| M41 | signer profile 只支持 anchor、outbound*、inbound* 序列，不支持 static、嵌套、blob、L1 区块绑定和多 PS | [20] §1 | observed | |
| M42 | 在 rollup0 profile 中，L1 记录的 root 是 L2 区块哈希和交易前缀候选块哈希组成的链 | [20] §8.1；[22] §3.1 | observed | |
| M43 | signer 的签名不担保 canonical 祖先、finality、排序者授权、未来 L1 执行结果和调度方式 | [20] §1.1 | observed | |
| M44 | rollup0 的 signer SPEC 钉住 core-protocol 旧 commit 6fcc90b6，ABI 与 @6ae4110f 不同 | [20] 开头与 Annex A；[8] | observed | |
| M45 | 证明超时时 composer 提交空的 Sync block，effect 延到下一个周期 | [22] §6.3 | observed | |
| M46 | follower 只靠 L1 的 BatchPosted 和 callData DA 就能重建 L2 | [18]；[20] §11 | observed | |
| M47 | rbuilder-chiado 一个 bundle 超过约 3 笔时会静默丢弃多出的交易，所以 bundle 默认上限是 3 | [18] EEZ_MAX_USER_TXS_PER_BUNDLE 说明 | observed | |
| M48 | 主网首笔交易的形态（同块先 postAndVerifyBatch、再由用户向 proxy 转 ETH 且 input 为空）与 L1→L2“入队 entry 由同块 proxy 调用消费”的路径一致 | 由 M11、M16、M21、[25] 推出：verify 交易在前、proxy 空 calldata 调用在后，符合 SCENARIO_CATALOG [17] 中 Origin entry 同块消费的模式 | inferred | |
| M49 | 主网交易使用的 verifier 是 ECDSA 型 proof system | 由 M28、[25] 推出：proof 为 65 字节，与 r‖s‖v 签名格式一致；未核对合约字节码 | inferred | |
| M50 | AS 结果的最终性取决于 L1 区块的 finality，不会比 L1 更快 | 由 M11、[24] 推出：entry 只在 verify 所在的 L1 块内生效，root 写在 L1 状态里 | inferred | |
| M51 | 当前 ECDSA 部署下，signer 私钥泄露或 signer 作恶就能让任意 root 转换通过验证 | 由 M28、M33 推出：threshold 为 1 且 verify 只做 ecrecover | inferred | |
| M52 | composer 或 builder 可以审查或延迟用户的 AS 交易，但按合约设计只会导致未执行，不会写入错误状态 | 由 M11、M12、M39 推出：同块 gate 和 root、哈希检查拒绝错误的轨迹；包含权在链下 | inferred | |
| M53 | 不需要 Ethereum 硬分叉，但 L2 必须改执行客户端并使用全新 genesis | [1] No L1 Fork；[19] “L1 consensus stays upstream” 与 fresh genesis 要求 | observed | |
| M54 | outbound entry 被跳过后，L2 节点如何重组到 L1 实际停留的前缀候选块，目前没有规范说明 | 由 M15、M42 推出：后续 entry 的 currentRoot 会失配；本 lane 未读到对应的节点规范 | speculative | |
| M55 | L1→L2 调用在 L2 上 revert，或其 L1 frame 之后被回滚时，L2 上不投递，root 不动 | [13] §A.1 L2 prover constraints “Lookups are never delivered” | observed | |

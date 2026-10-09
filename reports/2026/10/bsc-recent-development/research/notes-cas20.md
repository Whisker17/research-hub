# notes-cas20：CAS20（BEP-702）与 Base B20

调研截止：2026-10-09。本路前缀：C。
源码固定版本：bsc `8cc60b246c`（develop，2026-10-08）、reth-bsc `349f55c`（develop，2026-10-09）、BEPs `e9b2be3b00`（master，2026-10-08）、base-std `a2954a8d57`（main，2026-10-02）、base `f1f40baf23`（main，2026-10-09）。
下文 `bsc/…`、`reth-bsc/…`、`BEPs/…`、`base-std/…`、`base/…` 均指上述 commit 的路径；网页访问日期都是 2026-10-09。

> **先说最重要的事**：BEP-702 在 BEPs master 上的文本**落后于代码**。bsc#3826 和 bsc#3829（均于 2026-09-23 合并）改了创建事件顺序、bootstrap 调用者，以及扣押策略的名字；对应的规范修订 BEPs#716 **到 2026-10-09 仍是 open**。reth-bsc#512 跟的是 #716 修订版，没跟 master 文本。所以报告里讲行为时以代码为准，同时写明规范和代码不一致。

---

## C-Q1 CAS20 做什么：动机、定位、两个变体

**答案**：CAS20（Compliant Asset Standard，名字里的 20 对应它保留的 BEP-20 接口）把同质化代币做成协议内置的 stateful precompile，而不是部署字节码。目标是稳定币和代币化 RWA：代币的行为由链来保证，合规原语（共享 allow/blocklist 策略、分功能暂停、mint / burn / seize 角色分离）是标准的一部分。代币分两个变体：Asset（decimals 6–18，带 multiplier、公告、批量 mint、扩展元数据）和 Stablecoin（decimals 固定 6，带不可变的 currency 代码）。

**依据**
- BEP-702 §1 / §2 的动机有四条 [1]：(1) BEP-20 只是 ABI 约定，不保证行为，隐藏的 mint 路径、审计后的 proxy 升级都可能藏在正常接口后面；(2) 合规原语只需验证一次；(3) RWA 的“重新计价”（BEP-677 / ERC-8056）原来只有接口约定，没有可强制执行的语义；(4) 去掉字节码解释和 ABI 解码开销，只对实际做的状态访问计费。
- §3.5 / §3.12 / §3.13 [1]：
  - Asset：`decimals ∈ [6,18]`，创建时选定，之后不变。扩展包括 `multiplier`（WAD 精度，即 1e18 = 1.0）、ERC-8056 的定时 multiplier、`announce`、`batchMint`、`extraMetadata`，以及 `OPERATOR_ROLE`。
  - Stablecoin：`decimals` 固定为 6 且不存储，只多一个 `currency()`。
- 代码中的校验：Asset 的 decimals 越界报 `InvalidDecimals`（`bsc/core/vm/cas20_factory.go:258-265`）；currency 非空且只能是 A–Z，否则报 `MissingRequiredField` / `InvalidCurrency`（`cas20_factory.go:276-286`）；Stablecoin 的 decimals 写死为 6（`cas20_factory.go:268-269`、`cas20.go:185-187`）。
- currency 只是发行方的自我声明，不能证明储备（BEP §3.13 [1]）。

**不确定之处**：BEP 头部写 `Created: 2026-07-16`，但 BEPs#702 PR 里的 commit 都从 2026-09-03 开始（PR 期间可能 force-push 过）[3]。7 月到 9 月之间的设计演变看不到。

---

## C-Q2 怎么做：stateful precompile 执行路径、调用约束、地址、0xEF、存储

**答案**：bsc 在 `core/vm` 新增了 `StatefulPrecompiledContract`（`RequiredGas` + `RunStateful(ctx, input)`）。执行流程如下：

1. `evm.precompile()` 先查静态表；Jenner 生效后，再按地址前缀把 Factory、两个 Registry 和 `0xCA52…` 代币空间解析到原生实现。
2. `runPrecompile` 用类型断言把调用转到 `runStatefulPrecompiledContract`，传入的 `PrecompileContext` 包含 StateDB、Self、Caller、ReadOnly、DirectCall、Value 和 gas。
3. 每个入口先做调用形式检查：DELEGATECALL / CALLCODE 报 `DelegateCallNotAllowed`；携带 value 报 `NonPayable`；STATICCALL 中的写操作报 `StaticCallNotAllowed`。这三个都是 ABI revert，不是耗尽 gas 的 halt。

代币的状态就是代币地址自己的 storage（按 ERC-7201 命名空间布局），通过 `StateDB.SetState` 写入，所以会进入 state root。代币账户上写入一字节代码 `0xEF` 作为哨兵，用来防止 EIP-161 清理空账户，并作为“已初始化”的判据。

**依据**

接口与路由
- 接口定义：`bsc/core/vm/contracts_stateful.go:13-20`；上下文结构：`:23-53`；执行入口 `runStatefulPrecompiledContract`：`:161-187`。它先按 `RequiredGas` 扣费（CAS20 恒为 0，见 `cas20.go:149-150`），再构造上下文、调用 `RunStateful`。
- 路由：`bsc/core/vm/evm.go:46-59` 先查 `evm.precompiles`，再在 `cas20Enabled()`（即 `chainRules.IsJenner`，`:65-67`）时调用 `resolveCAS20(addr)`；`:75-80` 对 `StatefulPrecompiledContract` 做类型断言分流。
- CALL 路径：`evm.go:318` 先 resolve，`:345-346` 先做 value 转账，`:349-350` 再进入 precompile，出错时 `:370-380` 前后回滚 snapshot。STATICCALL 走 `evm.go:512-513`（`readOnly=true`），CALLCODE 和 DELEGATECALL 分别走 `:415-416` 和 `:460-461`（`directCall=false`）。
- BEP §3.2 对 value 的说明：EVM 在 dispatch 之前就转了 value，如果入口只是忽略它，钱会卡在无法提走的地址里，所以必须 revert [1]。

地址
- `bsc/core/vm/cas20.go:11-23`：代币前缀 `0xCA52`；Factory 在 `0xCA5F000…000`；ActivationRegistry 在 `0x7020…0001`。PolicyRegistry 在 `0x7020…0002`（BEP §3.1 [1]；代码在 `cas20_policy.go` 中声明）。
- `IsCAS20Address` 检查 `[0:2]==0xCA52` 且 `[2:10]` 全为 0（`cas20.go:50-60`）。
- 派生算法：`cas20_factory.go:39-47` 为 `0xCA52 ‖ 8×0x00 ‖ variant ‖ keccak256(abi.encode(creator,salt))[:9]`。BEP §3.3 特别强调这里用的是 `abi.encode`（64 字节），不是 `encodePacked` [1]。
- 变体字节：`0x00` 表示 Asset，`0x01` 表示 Stablecoin（`cas20.go:14-18`、`:112-119`）。未识别的变体字节不路由（`resolveCAS20Token` 返回 false），按普通账户处理。

调用约束的代码实现
- `cas20EnterCall`（`cas20.go:88-100`）：先判断 `!DirectCall`，再判断 `Value≠0`，然后按 calldata 字数收费。
- `finishCAS20`（`cas20_errors.go:39-52`）把内部错误映射为 `DelegateCallNotAllowed()` / `StaticCallNotAllowed()` 这两个 ABI revert。
- `finishCAS20Metered`（`:55-63`）规定出口优先级：写保护 > out-of-gas > 方法自身的结果。
- 写保护还在每个“写点”兜底：`chargeStorageWrite`、`AddLog`、`chargeCodeWrite` 遇到 `ReadOnly` 都会 `markWriteProtected`（`cas20_gas.go:59-62`、`:81-84`，`contracts_stateful.go:145-149`）。

存在性与 0xEF 哨兵
- `runCAS20Token`（`cas20.go:189-200`）：调用形式检查之后，用 `cas20InitializedMetered` 精确比较 code hash 是否等于 `keccak256(0xEF)`（`:62-70`），并按账户访问收费。不相等则 revert 且 returndata 为空。
- BEP §3.3 的表格：未初始化但前缀合法的地址也会被路由，在 handler 内部拒绝 [1]。
- `CAS20MarkerCode = []byte{0xEF}`（`cas20_factory.go:33-35`）。BEP §3.16 / §4.9 给出的理由 [1]：
  - 代币账户没有 nonce、通常也没有余额，如果再没有代码，就是 EIP-161 意义上的空账户，被 touch 后会连同 storage 一起删掉；
  - `0xEF` 是 EIP-3541 保留的前缀，`CREATE` / `CREATE2` 无法部署出这样的代码，所以无法伪造；
  - 账户有了代码之后，`EXTCODESIZE` 返回 1，“有代码就是合约”这类启发式判断仍然成立。

存储布局与 state root
- `bsc/core/vm/cas20_storage.go:10-39` 列出 `bsc.cas20` 命名空间的 slot 0–14 和打包 lane；`erc7201Root` 在 `:43-50`；mapping slot 的算法与 Solidity 一致（`:65-67`）。
- `setWord` 收费后调用 `s.state.SetState(s.token, slot, val)`（`:140-146`），也就是写进代币账户自己的 storage。
- BEP §3.17 [1] 给出五个命名空间及其 root：`bsc.cas20`、`bsc.cas20.asset`、`bsc.cas20.stablecoin`、`bsc.policy_registry`、`bsc.activation_registry`。它还明确：slot 决定代币账户的 storage root，从而决定区块哈希；CAS20 只写 code（哨兵）和 storage，**从不写 nonce 和余额**。

**不确定之处**
- BEP §3.6 规定的“共享前缀”顺序是：调用形式 → 存在性 → 解码 → static。代码中，代币方法的 static 检查放在各方法内部的解码之后（commit `80d485ae0`“decode before the static-frame guard in every token method”），与 BEP 一致。Factory 和 Registry 则把 static 检查放在解码之前（`cas20_policy.go:366-373`）。没有逐方法全量核对。
- `evm.go:61` 的注释写的是“gates the family on Jenner (BEP-706)”，BEP 编号引错了（应为 702）。无害，但说明注释不可全信。

---

## C-Q3 工作流程：一次创建、一次 transfer / transferFrom

**答案**：当前代码（bsc#3826 之后）中 `createCAS20` 的顺序如下：

1. static 检查
2. 解码参数
3. 变体枚举检查，并检查该变体的 feature 已激活
4. 解码 params，检查 version，再逐字段校验（Stablecoin 校验 currency）
5. 收 keccak 费用，派生地址
6. 检查地址是否已被占用（有任何代码就报 `TokenAlreadyExists`）
7. 写 `0xEF` 哨兵（收建账户和代码的费用）
8. 写身份 storage（name、symbol、supplyCap；Asset 写 decimals 和 multiplier，Stablecoin 写 currency）
9. 由 Factory 发出 `CAS20Created`
10. 授予 initialAdmin，发出 `RoleGranted`（sender 为 Factory）
11. 逐条执行 initCalls：先收内部 dispatch 费用；`msg.sender` 为 Factory；处于特权 bootstrap 模式
12. 返回代币地址

bsc#3826 把 `CAS20Created` 从最后挪到了 admin 授权和 initCalls 之前，并把 bootstrap 的调用者从 creator 改成了 Factory。

transfer 的检查顺序：pause(TRANSFER) → 收款方为零地址 → 发送方为零地址 → TRANSFER_SENDER 策略 → TRANSFER_RECEIVER 策略 → 余额 → 写两个余额 → `Transfer` 事件。transferFrom 在“零地址”之后多出：allowance → TRANSFER_EXECUTOR 策略（spender==from 时跳过）→ 扣减 allowance（额度为 `max` 时不扣），然后接 move。

**依据**
- 创建流程代码：`bsc/core/vm/cas20_factory.go:109-219`（逐行对应上面的步骤：`:110` static，`:132-142` 变体与激活，`:143-151` 参数，`:153-156` 派生，`:158-160` 占用，`:161-164` 哨兵，`:170-178` 身份，`:179-184` 事件，`:185-192` admin，`:201-214` initCalls）。
- bsc#3826 [5]（merge `37417a05`，2026-09-23T02:58Z）：
  - diff 显示 `spawnBootstrap(addr, creator)` 改成了 `spawnBootstrap(addr, CAS20FactoryAddress)`，`AddLog(CAS20Created…)` 从函数末尾挪到了身份写入之后；
  - PR 给的理由：“Running them as the creator let the factory act in the creator's name (approve, transfer, burn, the renounce methods), a power no ordinary caller has”；
  - 测试 `TestCAS20CreatedEvent`（`cas20_factory_test.go:242`）把“第一条 log 是 CAS20Created，接着是 RoleGranted 且 sender 为 Factory”固定了下来。
- **规范与代码不一致**：BEP-702 master §3.4 [1] 写的仍是“…execute initCalls; emit CAS20Created”（事件最后），以及“inside them msg.sender is the creator, not the factory”。修订 PR BEPs#716 [6]（2026-09-17 创建）到 2026-10-09 仍是 OPEN。
- bootstrap 的特权范围：`cas20Token.privileged`（`cas20_token.go:14-16`）会跳过角色检查（`ensureRole`，`cas20_admin.go:360-366`）和 transfer 侧的三种策略（`cas20_token.go:214`、`:246`）。MINT_RECEIVER、pause、supply cap、防复活检查不跳过（BEP §3.4 [1]，代码注释见 `cas20_token.go:14-16`、`cas20_admin.go:368-382`）。
- initCall 出错的处理：任何 revert 都被包成 `InitCallFailed(index)`，非 revert 错误（例如 OOG）原样上抛（`cas20_factory.go:208-213`）；长度小于 4 字节报 `InternalCallMalformed`（`:205-207`）。
- transfer / transferFrom：`bsc/core/vm/cas20_token.go:175-189`、`:191-230`；`move` 在 `:239-269`。
- move 即使在 from==to 或 amount 为 0 时也照样写两次 storage，理由是“bytecode would perform them, and skipping them would underprice the native token”（`:257-258`）。
- BEP §3.6 的“Check order”表也是同一顺序，并声明该顺序属于共识 [1]。
- approve 不受 pause 和策略影响（`cas20_token.go:156-173`；BEP §3.8 [1]）。

**不确定之处**
- BEP master 关于 bootstrap 的说法（“a role they grant to msg.sender lands on the creator”）在当前代码下不成立：现在 msg.sender 是 Factory，往 msg.sender 授权就授给了 Factory。按 #716 的文本，“methods that act on msg.sender have no place in the window”。
- bsc#3813 的 PR 描述还提到“`CAS20Created` 携带 creator 和 salt”是一个可能的后续改动；#716 的结论是不加。

---

## C-Q4 合规能力：角色、Policy Registry、seize、memo、multiplier

**答案**
- **角色**：采用 AccessControl 模型，内置 DEFAULT_ADMIN、MINT、BURN、SEIZE、PAUSE、UNPAUSE、METADATA，Asset 另有 OPERATOR。另加 `adminCount` 规则：不能撤掉最后一个 admin；`renounceLastAdmin` 不可逆，admin 数归零后所有角色的成员关系都被冻结。
- **策略**：每个代币有六个策略槽，默认都是 0（ALWAYS_ALLOW），合规是选择性开启的。策略存在共享的 PolicyRegistry 里，类型有 BLOCKLIST、ALLOWLIST，以及 UNION / INTERSECT 复合策略（由 2–4 个简单策略组成，只嵌套一层）；`isAuthorized` 从不 revert。
- **seize**：需要 SEIZE_ROLE，且 SEIZE 功能未暂停；只有**不**被 `SEIZE_EXEMPT_POLICY` 授权的持有人才能被扣押，默认没有任何人可被扣押；`to` 必须通过 SEIZE_RECEIVER 策略；totalSupply 不变；依次发出 Transfer、Memo、Seized。bsc#3829 把这个槽从 SEIZE_HOLDER_POLICY 改名为 SEIZE_EXEMPT_POLICY；scope 哈希随之改变，slot 14 不变。
- **memo**：`…WithMemo` 方法在主事件之后紧跟一条 `Memo(caller, bytes32)`；`…WithMemoFormat` 再加一条 `MemoFormatDeclared(declarer, memo, formatId)`。
- **multiplier**：只影响显示值，scaled = ⌊raw·m/1e18⌋；`balanceOf` 和所有转账都用 raw 值；定时 multiplier 到期时在读取时生效，链上不发事件。

**依据**

角色
- BEP §3.7 [1]；代码 `bsc/core/vm/cas20_admin.go:14`（`roleSeize`）等。
- `ensureRoleMutable` 的冻结规则：`cas20_admin.go:368-382`。

策略
- 六个 scope 的哈希：`cas20_admin.go:37-42`（`TRANSFER_SENDER_POLICY` … `SEIZE_EXEMPT_POLICY`、`SEIZE_RECEIVER_POLICY`）。
- 打包 lane：`cas20_storage.go:31-38`。slot 9 放 sender / receiver / executor，slot 10 放 mintReceiver，slot 14 放 seizeExempt / seizeReceiver。
- `isAuthorized`：`cas20_policy.go:168-198`。先查 ID 格式，然后 ALWAYS_ALLOW 返回 true、ALWAYS_BLOCK 返回 false，UNION 对子策略取 OR，INTERSECT 取 AND，其余按名单成员关系判断，从不 revert。
- 复合策略子节点数为 2–4（`cas20_policy.go:20-24`）。BEP §3.8 [1] 规定：单批最多 64 个地址；`policyId` 最高字节编码类型；哨兵值 `ALWAYS_ALLOW=0`、`ALWAYS_BLOCK=0x0100000000000001`；计数器从 2 开始；管理员转移分 stage / finalize 两步。
- PolicyRegistry 的写操作要经过激活门控：`cas20_policy.go:366-377`（先 static，后检查 `featurePolicyRegistry`）。

seize
- 实现：`cas20_admin.go:506-552`。
- 默认值：exempt 槽为 0 即 ALWAYS_ALLOW，所有人都被豁免，所以没有人可被扣押（BEP §3.8 [1]；PR #3829 描述 [7]）。
- bsc#3829 [7]（merge `057868dc`，2026-09-23T06:10Z）：diff 把 `scopeSeizeHolder` 换成 `scopeSeizeExempt`，keccak 的输入串从 `"SEIZE_HOLDER_POLICY"` 改为 `"SEIZE_EXEMPT_POLICY"`。PR 原话：“This is an interface change… the old names are not retained as aliases”，“Keep slot 14, its packed offsets, and seizure authorization behavior unchanged”。
- BEP master 仍写 `SEIZE_HOLDER_POLICY` [1]。
- 暂停与 seize 的关系：`pause(TRANSFER)` 不影响 seize，`pause(SEIZE)` 单独收回扣押能力（BEP §3.9 [1]）。

memo
- BEP §3.6 [1]：memo 为 `bytes32`；`formatId = keccak256(definition)` 是约定，不进入共识，链上不校验，零值 `formatId` 报 `InvalidFormatId`。
- 代码：`cas20_memo.go`。memo-format 由 PR #3813 中的 commit `28997d9c5` 加入（2026-09-09）。

multiplier
- `bsc/core/vm/cas20_asset.go:119-130`：`settleMatured` 和 `effectiveMultiplier` 在读取时判断定时值是否到期。
- `:162-177`：`applyMultiplier` / `removeMultiplier` 是带溢出检查的乘除，溢出时 `Panic(0x11)`。
- 上限：multiplier ≤ uint128.max，supplyCap ≤ uint128.max，两者相乘不会超出 uint256（BEP §3.10、§3.12、§6.5 [1]）。
- BEP 明确它“Not a yield mechanism”[1]。

**不确定之处**
- `announce` 的内部调用保留原 msg.sender（BEP §3.12）。这和 initCalls 现在用 Factory 作为 msg.sender 是两套语义，报告里不要混在一起讲。
- seize 在 bootstrap 窗口里的行为：代码中 privileged 会跳过 SEIZE_ROLE 检查（`ensureRole`），但 exempt / receiver 策略不跳过。BEP 只说“the seizure policies… never skipped”，没有专门讨论这种边角情况。

---

## C-Q5 gas 与性能

**答案**：`RequiredGas` 恒为 0，所有计费都在 `RunStateful` 内按实际工作现场扣。

`cas20_gas.go` 按 geth 的 `makeGasSStoreFunc` 逐条复刻了：
- EIP-2929 的冷 / 热访问；
- EIP-2200 的 net metering，包括 2300 gas 的 sentry；
- EIP-3529 的退款。

此外还对 keccak、log、账户访问、代码写入收费。calldata 在每次外部调用时按 6 gas / 32 字节收一次。initCalls 和 announce 的每一项按“一次 warm CALL（100）+ 6 gas/字”收费，但这只是一个**价格**，不开新的调用帧：不增加 call depth，也不做 63/64 预留。

CAS20 地址不会被预热。tracer 通过新增的 `OnStorageRead` / `OnAccountRead` hook 看到原生的状态访问。RPC 增加了 `eth_getCAS20TokenInfo` 和 `eth_getCAS20TokenInfoBatch`（≤20 个地址）。

性能数据只有 reth-bsc#512 的本地微基准（M1 Pro，内存数据库，单线程 transfer 约 1.3 µs）。PR 明确说明，BEP §3.14 要求的激活前对抗性 / 整块计时测量**不在**这次验证范围内。Go 侧没有找到 benchmark。

**依据**

计费实现
- `bsc/core/vm/cas20.go:149-150`：RequiredGas 返回 0。
- `cas20_gas.go:16`：`cas20CalldataWordGas = CopyGas + MemoryGas`（3+3=6）。
- `:22-25`：`chargeInternalDispatch = WarmStorageReadCostEIP2929(100) + words*6`。
- `:27-33`：`chargeCalldata`，只在 `cas20EnterCall` 里调用一次（`cas20.go:96`）。
- `:46-54`：账户访问，冷 2600 / 热 100，先 warm 再收费。
- `:58-68`：代码写入，`CreateDataGas*len`，地址原本无代码时另加 `CreateGas`。
- `:72-74`：sentry。
- `:77-131`：SSTORE 规则，按 EIP-2200 的条款编号逐支对应。
- 存储读取：`cas20_storage.go:109-119`。

BEP 对计费的规定（§3.14 [1]）
- “This standard introduces no gas parameters of its own”，并规定不得比字节码更便宜。
- 收费表里有“Calldata … once per external call”和“Internal dispatch … The charge is a price, not a call frame: an entry runs in the outer frame's budget, adds no call depth and reserves no 63/64 of the remaining gas”。
- 对应的 BEPs commit：`75ea9bf`（2026-09-07，“calldata is charged once per external call, not per internal dispatch”）和 `794da11`（2026-09-09，“an internal dispatch is a price, not a call frame”）[2]。
- 为什么要给内部 dispatch 定价：entry 的 offset 可以互相别名（alias），dispatch 次数不受 calldata 长度约束，必须有东西给它设上界（BEP §3.14 “Not charged” 段 [1]，`cas20_gas.go:18-21` 注释）。
- 预热规则：“No CAS20 address is warm at the start of a transaction”（BEP §3.14 [1]，`cas20_gas.go:12-14`）；代币读 registry 的 slot 时，registry 的地址也一并变热。

与字节码等价的测试
- `cas20_gas_bytecode_test.go:73`（`TestCAS20StorageGasAgainstBytecode`）把同一组 SLOAD / SSTORE 序列分别用原生实现和 PUSH1 / SLOAD / SSTORE 字节码执行，比较 gas。
- `cas20_access_gas_bytecode_test.go:80` 做同样的账户访问比较。

tracing / RPC
- hook 定义：`bsc/core/tracing/hooks.go:331-332`（`OnStorageRead`、`OnAccountRead`），由 #3813 引入（`git log -S OnStorageRead` 只命中 `6274bf914`）。
- 调用点：`contracts_stateful.go:99-109`。
- 测试：`eth/tracers/native/cas20_prestate_test.go`、`eth/tracers/logger/cas20_access_list_test.go`。
- state override 遇到 CAS20 地址时，用 `DisabledPrecompile` 关闭原生路由：`internal/ethapi/override/override.go:75-81`，`cas20.go:38-48`。
- RPC：`internal/ethapi/api_cas20.go:13-36`，batch 上限 20。

性能数据
- reth-bsc#512 [8] 的 PR 正文：“Local measurement on 2026-09-23 (Apple M1 Pro…): ordinary miss approximately 1.33 ns; single-thread transfer 1.315 µs with observation disabled versus 1.444 µs with Prometheus”。
- 同一 PR 的 “Not in this change: Adversarial/full-block timing measurements required before activation by BEP-702 §3.14. The microbenchmarks do not cover that requirement.”
- `reth-bsc/benches/cas20.rs:1-9` 说明 bench 测的是：transfer、transferFrom、4 子策略的 union `isAuthorized`、带 2 个内部调用的 announce，每次迭代一笔交易、journal 不提交。
- Go 侧：`rg '^func Benchmark' core/vm/cas20*_test.go` 无结果。

**不确定之处**
- 没有任何 CAS20 transfer 与同等 BEP-20 transfer 在 gas 或耗时上的公开对比。golden fixture 里有每一步帧级的 gasUsed（例如 “transfer alice->bob 400” 为 26458），但那是在单笔未结束交易的 harness 中测的，不含 21000 intrinsic，也不含 CALL 本身的冷账户费用，**不能**当作对比数据。
- BEP §6.6 承认：去掉解释开销后，同样的 gas 能新建更多 storage slot，即“状态增长”残差，并要求激活前量化。尚未看到量化结果。

---

## C-Q6 激活：Activation Registry

**答案**：激活分两层：
- **第一层，硬分叉**：Jenner 让节点上有这份代码，并在 fork 区块开头给两个 registry 种下 `0xEF` 哨兵。
- **第二层，ActivationRegistry 的开关**：权限也分两级。
  1. 治理任命 admin：BSC 的提案只能以 GovHub（`0x…1007`）为目标，由 GovHub 的 `updateParam(key, value, target)` 转发 `updateParam("admin", <20 字节>)` 给 registry。
  2. admin 再执行 `activate` / `deactivate(feature)`。

feature id 有三个：`keccak256("bsc.cas20_asset")`、`keccak256("bsc.cas20_stablecoin")`、`keccak256("bsc.policy_registry")`。fork 时全部关闭，admin 为空，所以 fork 后什么都开不了，直到治理任命 admin。

开关只门控 `createCAS20` 和 PolicyRegistry 的写操作，**从不**作用于已有代币的任何操作（包括所有读取）。不过，关闭 policy_registry 会把共享名单冻结在当前状态。

genesis：BEP master 要求“fork 后诞生的链在 genesis alloc 里带哨兵”，但 bsc 代码只在跨越 Jenner 的那个区块种哨兵。BEPs#716（open）提议撤回 genesis 要求，改为“网络必须把 jennerTime 排在 genesis 之后”。

**依据**
- 门控实现：
  - `bsc/core/vm/cas20_activation.go:24-28`：三个 feature id；
  - `:82-87`：`requireGov` 要求调用者等于 `params.CAS20GovHubAddress`；
  - `:144-182`：`updateParam`，只接受 key `"admin"`，value 必须是 20 字节且非零，成功后发 `AdminChanged` 和 `ParamChange`；
  - `:184-210`：`setFeature`，要求 admin，已激活再激活报 `AlreadyActivated`，未激活去关闭报 `FeatureNotActivated`；
  - `:212-217`：`ensureFeatureActivated`；
  - `requireAdmin` 规定 admin 为零地址时任何人都不匹配（`:75-80`）。
- GovHub 常量：`bsc/params/protocol_params.go:247-256`。注释写明：“BSCGovernor's whitelist of proposal targets holds GovHub alone… GovHub's own updateParam(key, value, target)… forwards”。
- 哨兵在 fork 时种下：
  - `bsc/core/systemcontracts/upgrade.go:1158-1163`：在 `atBlockBegin`、`IsOnJenner` 时调用 `vm.SeedCAS20Activation`，紧挨着 HistoryStorageAddress 的处理；
  - `bsc/core/vm/cas20_genesis.go:13-24`：已有代码时不覆盖，只记 log.Error；
  - reth-bsc 的对应位置在 `src/node/evm/executor.rs`（#512 描述 [8]）。
- 只门控创建：BEP §3.15 的 “What the switch does and does not reach” 表 [1]；代码中 token 的 dispatch（`cas20.go:189-200`）不查 registry。
- genesis 问题：
  - BEP master §3.15 / §3.16 [1]：“on a chain born after the fork… the sentinels MUST be present in the genesis allocation”，由 BEPs commit `82e9c5d`（2026-09-06）加入 [2]；
  - bsc#3813 描述：“the node-deploy genesis seeding for chains born after the fork lives in that repository” [4]；
  - hashdit-bot 在 #3813 上（2026-09-09）标了 HIGH：“Jenner-active genesis chains can permanently miss the CAS20 registry sentinels” [4]；
  - BEPs#716 [6]：“the genesis-allocation requirement, which no implementation performs, is withdrawn”，“Every BSC network schedules jennerTime after its genesis and a new network must do the same”；
  - bsc 代码 `IsOnJenner`（`params/config.go:1483-1490`）要求前一块未到 Jenner、当前块已到，所以 genesis 即已在 Jenner 的链永远不会触发；`core/genesis.go` 里没有 CAS20 相关代码（`rg CAS20 core/genesis.go` 无结果）。
- 为什么 admin 不再从配置读取：bsc#3813 描述 [4] 说，第一版设计是从 ChainConfig 读 admin、在 fork 边界写入；评审发现两个问题：genesis 已过 fork 的链永远写不进去，而且这个选择只能做一次。
- Jenner 状态：
  - `bsc/params/config.go:256`（mainnet）和 `:311`（Chapel）都是 `JennerTime: nil`；
  - BNB Chain 官方公告 [11]：测试网“Late October 2026”，主网“Late November 2026”，“The hard fork release … has not been published yet”；
  - BEP-718 Meta-Jenner 把 BEP-702 列入 Jenner [12]；
  - reth-bsc 只给内部 QANet 排了 Jenner：`reth-bsc/src/hardforks/bsc.rs:231-232`，时间戳 1791176400，即 2026-10-05 05:00 UTC，由 reth-bsc#531 在 2026-10-09 合并。

**不确定之处**
- node-deploy 仓库是否真的在 genesis 里放了哨兵：没有核查（不在本地源码之列）。#3813 说放在那里，#716 却说“no implementation performs”，两者矛盾，照实记录。
- 谁会被任命为 admin、何时任命：无公开信息。

---

## C-Q7 与 Base B20 的关系

**答案**：证据支持这样的说法：**CAS20 的接口、架构和存储布局直接沿用 Base B20 / base-std 的设计，换了前缀和命名空间，删了少数方法，又加了 BSC 自己的治理与 memo-format；代码则是独立的 Go 实现，接入的是 geth 的 EVM。** 它不是 Base Rust 代码的 fork。

在 BSC 开发期间，CAS20 还在持续跟进 B20 的规范变化：
- SEIZE_EXEMPT 改名：Base 2026-09-02，BSC 2026-09-23；
- 创建事件顺序和 bootstrap 调用者改成与 B20 实现一致：bsc#3826。

BSC 没有跟进 B20 Denim 的三项改动：拒绝把代币自身作为收款方、executor 策略覆盖所有转账路径、NOT 策略。BSC 独有的部分：GovHub 治理任命 admin、`MemoFormatDeclared`、`variantOf`、两字节前缀 `0xCA52`、单一版本（没有按 fork 冻结的逻辑版本）。

“Go 代码是不是对照 Base Rust 代码翻译的”无法判断：不同语言、内部结构不同，没有证据。

**依据（证据 1：BSC 仓库中的直接痕迹）**
- **commit `57d98c2`**（`57d98c2acb5f`，2026-09-08，“core/vm: name the standard, not another implementation, in comments”）：
  - 用 `gh api repos/bnb-chain/bsc/commits/57d98c2` 核实，它属于 PR #3813（`/commits/57d98c2/pulls` 返回 #3813）。PR 是 squash 合并的，所以本地 develop 的历史里找不到（`git show 57d98c2` 报 unknown revision），在 GitHub 上可以访问 [9]。
  - 改动内容：`cas20_abi_test.go` 中 “The hashes base-std publishes in full” 改为 “The hashes the standard publishes in full”，三处 “(base-std's published value)” 改为 “the published value”；`cas20_errors.go` 中 “IB20 reports which one it could not find” 改为 “ICAS20 …”；`cas20_test.go` 中测试用例名 “the reference implementation's prefix”（地址 `0xb2000…00ff`）改为 “a neighbouring prefix”。**外部调研对此 commit 的描述正确。**
- **PR #3813 的首个实现 commit `13a9d22d9`**（2026-09-03）用 `gh api …/commits/13a9d22d9` 读 patch，痕迹更多：
  - `cas20_abi_test.go`：“The role and policy-scope ids themselves, which base-std publishes as full…”，并用 base-std 的已发布值作为期望值，测试 `SEIZE_RECEIVER_POLICY` 的 scope 哈希、`Seized` 和 `CompositePolicyUpdated` 的 topic0；
  - `cas20_asset.go`：“caller falls back to the shared IB20 dispatch”；
  - `cas20_metadata.go`：“the remaining IB20 views”；
  - `cas20_errors.go`：“(IPolicyRegistry vs IB20)”。
  - 之后 `c98332918`（2026-09-06）删掉了其中一部分，`57d98c2` 改掉了剩下的。
- `d6a0a0414`（2026-09-04）把前缀从 `0xCA50` 改成 `0xCA52`，测试中的 `0xb2…` 仍被叫作 “the reference implementation's prefix”。
- 当前代码里还残留一个邻接前缀测试：`bsc/core/vm/cas20_test.go:47` 的 `{"a neighbouring prefix", 0xb2000…00ff, false}`。
- BEP-702 §3.1 [1]：“Activation takes the first slot and policy the second, matching the order the reference implementation uses under its own prefix”。Base 的 ActivationRegistry 和 PolicyRegistry 恰好是 `0x8453…0001` / `0x8453…0002`（`base-std/src/StdPrecompiles.sol:12-14`）。BEP 全文没有出现 “Base”、“B20”、“base-std”（`git log -S` 对这三个词都无命中）。

**依据（证据 2：B20 的设计，以及两者逐项相同的地方）**
- B20 是 Base **Beryl** 升级的一部分：Base Sepolia 2026-06-18、Base 主网 2026-06-25 上线。**Cobalt**（加了 seize、复合策略、ERC-8056 定时 multiplier）在 Sepolia 2026-09-23、主网 2026-09-30 上线。**Denim** 尚未在主网激活。
  - 来源：Base 文档 upgrades/overview、beryl/overview、cobalt/overview [13]；
  - `base/crates/common/chains/src/config.rs:476-478`：mainnet `beryl_timestamp: 1_782_410_400`（2026-06-25 18:00 UTC），`cobalt: 1_790_791_200`（2026-09-30 18:00 UTC），`denim: None`；Sepolia 的 denim 为 `1_792_605_600`（2026-10-21）；
  - `base-std/CHANGELOG.md`（Beryl/Cobalt Live，Denim “hasn't activated yet”）[10]。
- B20 用 Rust precompile 实现：Base 文档写“B20 tokens are implemented as Rust precompiles” [13]；代码在 `base/crates/common/precompiles/src/{b20_factory,b20_asset,b20_stablecoin,policy,activation}`。
- 地址编码结构相同：`base/crates/common/precompiles/src/b20_factory/variant.rs:24`（`PREFIX_BYTE = 0xb2`）、`:61-67`（`[0]==0xB2 && [1..10]==0`，`[10]` 为变体）、`:124-127`（`keccak256((creator, salt).abi_encode())`，取前 9 字节）。区别只在前缀：B20 是 1 字节 `0xB2` + 9 个零字节，CAS20 是 2 字节 `0xCA52` + 8 个零字节。
- 存储布局逐字段相同：
  - `base/crates/common/precompiles/src/common/core_storage.rs:13-97` 的 `#[namespace("base.b20")]`：name 0、symbol 1、contractURI 2、totalSupply 3、balances 4、allowances 5、roles 6、roleAdmins 7、adminCount 8，slot 9 放 transfer sender/receiver/executor（offset 0/8/16），slot 10 放 mintReceiver，paused 11、supplyCap 12、nonces 13，slot 14 放 seizeExempt/seizeReceiver；
  - asset 扩展：decimals 0、multiplier 1、announcements 2、extraMetadata 3，slot 4 放 pending(u128) 和 effectiveAt(u64)（`b20_asset/storage.rs:14-33`）；
  - 与 `bsc/core/vm/cas20_storage.go:12-38` 和 BEP §3.17 完全对应。命名空间串只差前缀：`base.b20` / `base.b20.asset` / `base.b20.stablecoin` / `base.policy_registry` / `base.activation_registry`，对应 `bsc.cas20` / `bsc.cas20.asset` / `bsc.cas20.stablecoin` / `bsc.policy_registry` / `bsc.activation_registry`。
- feature id 同构：`base.b20_asset` / `base.b20_stablecoin` / `base.policy_registry`（`base/…/activation/storage.rs:54-58`）对应 `bsc.cas20_asset` / `bsc.cas20_stablecoin` / `bsc.policy_registry`。
- 接口名高度重合。命令如下：
  `grep -ho "function [A-Za-z0-9_]*" base-std/src/interfaces/*.sol | sed 's/B20/CAS20/g'` 与 `grep -o "function …" BEPs/BEPs/BEP-702.md` 做 `comm` 比较。结果：**100 个函数名相同**。B20 独有 `burnBlocked`、`BURN_BLOCKED_ROLE`（Cobalt 起 deprecated）、`invertedPolicyId`（Denim）、`SEIZE_EXEMPT_POLICY`（BEP master 落后，代码里已有）；BEP 独有 `transferWithMemoFormat`、`transferFromWithMemoFormat`、`updateParam`、`variantOf`、`SEIZE_HOLDER_POLICY`。
- 常量相同：角色和 scope 哈希相同（`base-std/src/lib/B20Constants.sol:7-22`）；Asset decimals 为 6–18，`MAX_SUPPLY_CAP = uint128.max`（`:30-40`）。
- 创建时序相同，bsc#3826 是向 B20 实现看齐：
  - `base/crates/common/precompiles/src/b20_factory/logic/v1.rs:58-99`：先初始化身份，再 `emit B20Created`，再 `grant_role_unchecked(DefaultAdmin, initial_admin, sender = B20FactoryStorage::ADDRESS)`，最后在 `with_caller(B20FactoryStorage::ADDRESS, …)` 中执行 initCalls；
  - `base-std/src/interfaces/IB20Factory.sol:102-104`：“Emitted… after the token's identity is sealed and before any initCalls”；
  - `:137-149`：“factory-originated calls bypass the token's role gates…”；
  - bsc#3826 之前，CAS20 是“事件在最后、caller 为 creator”；之后与 B20 一致。#3826 的 PR 文本没有提到 B20。
- seize 改名的先后：base-std commit `607ef9a`（2026-09-02，“feat(b20): rename SEIZE_HOLDER_POLICY to SEIZE_EXEMPT_POLICY (#214)”）先改；bsc#3829 在 2026-09-23 跟进。
- 激活 admin 机制不同：
  - Base：Beryl 用链配置里的静态 admin，例如主网 `0xcE3a3bEE7E72E2A24079f3c0Cb3b97740ED425A9`（`base/crates/common/chains/src/config.rs:147-148`）；Cobalt 起支持状态里的 `setAdmin`，只能由现任 admin 调用（`base/…/activation/storage.rs:24-46`、`:140-166`）；
  - BSC：由治理通过 GovHub `updateParam` 任命，admin 不能自己换人（`cas20_activation.go:82-87`、`:144-182`）。
- 版本化不同：B20 按 hardfork 冻结逻辑版本（fork → version 枚举 → 冻结实现，见 `base-std/docs/architecture.md` §3.2-3.3 [10]；`AssetVersions::from_base_upgrade`，`base/…/b20_asset/dispatch.rs:60-64`）。BSC 只有一个版本，按 Jenner 开关（`evm.go:65-67`；`cas20Variants` 里没有版本维度，`cas20.go:113-119`）。
- initCall 失败的错误不同：
  - B20 在内部 revert 带非空数据时**冒泡**内部原因，否则报 `InitCallFailed`（`base/…/b20_factory/logic/v1.rs` 中的 `map_init_call_error`；`IB20Factory.sol:136`）；
  - BSC 对任何 revert 一律报 `InitCallFailed(index)`（`cas20_factory.go:208-213`）。
- Denim 的三项 B20 改动不在 CAS20 里：
  - 代币自身作收款方会被拒（`base-std/CHANGELOG.md` Denim 表）；BSC 的 `move` 只检查零地址（`cas20_token.go:239-245`）；
  - executor 策略覆盖所有转账路径；BSC 只在委托的 transferFrom 上检查（`cas20_token.go:214`）；
  - NOT / invert 策略（bit 63）；BSC 把类型字节 ≥ 0x04 视为无效 ID（BEP §3.8；`cas20_policy.go:169-171`）。

**对照表（报告可直接改写）**

| 维度 | BSC CAS20 | Base B20 |
|---|---|---|
| 代币地址前缀 | `0xCA52` + 8×00（10 字节保留前缀）| `0xB2` + 9×00（10 字节保留前缀）|
| 变体字节 / 指纹 | `[10]`：00=Asset、01=Stablecoin；`keccak256(abi.encode(creator,salt))[:9]` | 相同 |
| Factory | `0xCA5F00…00`，`createCAS20(variant,salt,params,initCalls)` | `0xB20f00…00`，`createB20(…)` 签名同构 |
| Activation Registry | `0x7020…01`；治理（GovHub `updateParam("admin")`）任命 admin → admin 开关 | `0x8453…01`；Beryl 用链配置的静态 admin，Cobalt 起现任 admin 可 `setAdmin` |
| feature id | `bsc.cas20_asset` / `bsc.cas20_stablecoin` / `bsc.policy_registry` | `base.b20_asset` / `base.b20_stablecoin` / `base.policy_registry` |
| Policy Registry | `0x7020…02`；BLOCKLIST/ALLOWLIST/UNION/INTERSECT | `0x8453…02`；同上，Denim 加 NOT（bit 63）|
| 策略槽 | 6 个；executor 只管委托的 transferFrom | 6 个；Denim 起 executor 管所有转账路径 |
| 角色 | DEFAULT_ADMIN、MINT、BURN、SEIZE、PAUSE、UNPAUSE、METADATA（+OPERATOR）| 同上，另有 BURN_BLOCKED（Cobalt 起 deprecated）|
| seize | `seizeWithMemo` + `SEIZE_EXEMPT_POLICY`（bsc#3829 2026-09-23 改名）| 同（Cobalt；base-std#214 于 2026-09-02 改名）|
| multiplier | WAD 即时 + ERC-8056 定时 | 同（Beryl 即时，Cobalt 加 ERC-8056）|
| memo | `Memo` + BSC 独有 `MemoFormatDeclared(formatId)` | `Memo` |
| decimals | Asset 6–18，Stablecoin 固定 6 | 相同 |
| 存储布局 | ERC-7201 `bsc.cas20*`，slot 0–14 / asset 0–4 | `base.b20*`，逐字段相同 |
| 版本化 | 单一实现，Jenner 开关 | 按 hardfork 冻结的逻辑版本 |
| 实现语言 | Go（bsc `core/vm`）+ Rust 移植（reth-bsc）| Rust（base `crates/common/precompiles`）|
| 上线状态 | 已合并到 develop，未进入 release；JennerTime 未定（计划测试网 10 月下旬、主网 11 月下旬）；fork 后还要治理任命 admin 才能开启 | Beryl 主网 2026-06-25 上线；Cobalt 主网 2026-09-30 上线；Denim 未上主网 |

**不确定之处**
- BEP 和代码注释里的 “reference implementation / reference contract” 具体指什么不统一：§3.1 指的很可能是 B20（registry 顺序吻合）；§3.17 的 “reference implementation's layout fixture” 指 bsc 自己的 Go 代码；§3.14 的 “reference contract” 无法确定，可能是某个 Solidity 参考合约，比如 base-std 的 `test/lib/mocks/MockB20.sol`，也可能是 BSC 内部合约。标为 speculative。
- B20 在 Base 主网上实际激活了哪些 feature、是否已被大规模使用：没有查证。Base 文档只提示“Verify the Activation Registry is enabled”。
- “代码独立实现”只能从语言不同、模块结构不同（Go 的 `cas20Storage` 和手写 ABI，对比 Rust 的 `#[derive(Storable)]` 宏和版本冻结）推出来。没有证据排除“对照 Rust 或 Solidity mock 改写”的可能。

---

## C-Q8 Rust 实现 reth-bsc#512

**答案**：reth-bsc#512 于 2026-09-17 创建，2026-09-24T01:30Z 合并，merge commit 为 `810c247`，+15331/−37 行，改动 45 个文件。它把 go-bsc 的 CAS20 全家族（Factory、两个变体、两个 Registry）移植成 reth-bsc 的 stateful precompile：Jenner 时安装 `Cas20Lookup` 作为动态 lookup；在 fork 区块开头的 hook 中种哨兵；gas 按 go-bsc 的收费函数逐个对应；RPC 也对齐（TokenInfo、access list、code override、prestate）。

对齐方式：
1. 以 Go 的 `057868dc`（含 #3826、#3829）为基线，遵循 BEPs#716 修订版，而不是 BEP master；
2. 所有 selector、topic、角色、scope、feature、ERC-7201 root 都以字面量写死并校验原像；`cas20_layout.json` 布局 fixture 与常量对比；
3. **golden fixture**：由 Go harness 录制 145 步调用，Rust 逐步回放，比对 returndata、status、gas、refund、logs 和最终 state root。Go 重新录制结果逐字节相同。

后续修复有 reth-bsc#524（CAS20 state override 路由，2026-10-08 合并）。

**依据**
- PR #512 [8]：`gh api repos/bnb-chain/reth-bsc/pulls/512` 返回 `merged_at 2026-09-24T01:30:04Z`、`merge_commit_sha 810c2472836b`，作者 zlacfzy（与 bsc#3813 / #3826 / #3829 是同一作者）。正文含 Routing、Execution、Fork transition、Observation、RPC、Verification（“648 passed, 1 ignored”）、“Not in this change” 各节。
- fixture：`reth-bsc/src/evm/precompiles/cas20/testdata/README.md`（145 calls，来自 bsc `057868dc…`，“matches the BEP-702 revision in BEPs #716, rather than the earlier master text”；生成器 `cas20_golden_test.go` “is kept here because the recorder is not part of Go develop”）。
- 用 python 读取 `cas20_golden.json`：`steps` 有 145 步，`stateRoot = 0x76626b7d…6443`，`chainId = 1`。
- 生成器：`testdata/cas20_golden_test.go:15-25`。
- footprint 文件只是 Rust 自己的统计，“not an independent Go oracle”（README）。
- 路由：`reth-bsc/src/evm/precompiles/cas20/mod.rs:122-138`（`resolve`：`0xca52` → 变体，`0xca5f` → Factory，`0x7020` → 两个 Registry）、`:146-197`（`Cas20Lookup`，`spec >= Jenner` 时启用，code override 时 `disabled`）。安装位置：`src/evm/api/mod.rs:67-70`。
- reth-bsc 的 Jenner 时间：mainnet 和 testnet 尚未排期（`src/hardforks/bsc.rs:415-425` 的测试断言 “Jenner must stay unscheduled”）；QANet 为 2026-10-05 05:00 UTC（`:231-232`）。

**不确定之处**：#512 的验证依赖 Go 录制的单一场景（145 步）和单元测试。BEP §6.1 要求的“对 BEP-20 参考实现做差分测试、对存储布局和计费做 fuzz”是否已完成，没有看到公开结果。

---

## 代码片段（建议放进报告）

**S1. stateful precompile 接口与上下文**：`bsc/core/vm/contracts_stateful.go:13-53@8cc60b246c`。说明它和普通 precompile 的区别：拿到 StateDB、Caller、ReadOnly、DirectCall、Value 和 gas budget。
```go
type StatefulPrecompiledContract interface {
	// RequiredGas is the flat charge taken before RunStateful; data-dependent
	// cost is charged inside it.
	RequiredGas(input []byte) uint64
	// RunStateful's error reverts every state mutation of the call.
	RunStateful(ctx *PrecompileContext, input []byte) ([]byte, error)
}

type PrecompileContext struct {
	evm *EVM
	StateDB StateDB
	Self common.Address   // callee address and the storage root of its state
	Caller common.Address // msg.sender for this frame
	ReadOnly bool         // inside a STATICCALL or any read-only ancestor frame
	DirectCall bool       // false for CALLCODE and DELEGATECALL
	Value *uint256.Int    // wei attached to the frame; nil means zero
	gas *GasBudget
	...
}
```

**S2. EVM 路由：静态表之外，按前缀解析 CAS20**：`bsc/core/vm/evm.go:46-59, 75-80@8cc60b246c`。用于“ERC-20 与 CAS20 调用路径对比”图。
```go
func (evm *EVM) precompile(addr common.Address) (PrecompiledContract, bool) {
	if p, ok := evm.precompiles[addr]; ok {
		if p == DisabledPrecompile {
			return nil, false
		}
		return p, ok
	}
	// CAS20 tokens have no fixed address, so they cannot live in the static map:
	// they are resolved from the address prefix instead.
	if evm.cas20Enabled() {        // chainRules.IsJenner
		return resolveCAS20(addr)
	}
	return nil, false
}

func (evm *EVM) runPrecompile(p PrecompiledContract, caller, self common.Address, input []byte, gas GasBudget, readOnly, directCall bool, value *uint256.Int) ([]byte, GasBudget, error) {
	if sp, ok := p.(StatefulPrecompiledContract); ok {
		return runStatefulPrecompiledContract(evm, sp, caller, self, input, gas, readOnly, directCall, value)
	}
	return RunPrecompiledContract(evm.StateDB, p, self, input, gas, evm.Config.Tracer, evm.chainRules, evm.Context)
}
```

**S3. 每个入口的前置检查，以及代币存在性检查**：`bsc/core/vm/cas20.go:88-100, 189-200@8cc60b246c`。
```go
func cas20EnterCall(ctx *PrecompileContext, input []byte) error {
	if !ctx.DirectCall {
		return ErrCAS20DelegateCall                    // -> DelegateCallNotAllowed()
	}
	if ctx.Value != nil && !ctx.Value.IsZero() {
		return revCAS20("NonPayable()", errSelNonPayable)
	}
	if !ctx.chargeCalldata(input) {                // 6 gas / word, once per external call
		return ErrOutOfGas
	}
	return nil
}

func runCAS20Token(ctx *PrecompileContext, input []byte, bind func(*PrecompileContext, []byte) ([]byte, error)) ([]byte, error) {
	if err := cas20EnterCall(ctx, input); err != nil {
		return finishCAS20(nil, err)
	}
	if !cas20InitializedMetered(ctx, ctx.Self) {   // codehash == keccak(0xEF), charged as account access
		return finishCAS20Metered(ctx, nil, ErrExecutionReverted)
	}
	ret, err := bind(ctx, input)
	return finishCAS20Metered(ctx, ret, err)
}
```

**S4. CAS20 创建（地址派生、哨兵、事件顺序、bootstrap）**：`bsc/core/vm/cas20_factory.go:39-47, 152-192, 201-213@8cc60b246c`（展示时删减）。
```go
// 0xCA52 ++ 8×0x00 ++ variant ++ keccak256(abi.encode(creator, salt))[:9].
func cas20DeriveAddress(variant byte, creator common.Address, salt common.Hash) common.Address {
	h := crypto.Keccak256(common.LeftPadBytes(creator.Bytes(), 32), salt.Bytes())
	var a common.Address
	a[0], a[1] = cas20MarkerPrefix[0], cas20MarkerPrefix[1]
	a[10] = variant
	copy(a[11:20], h[:9])
	return a
}
// in createCAS20, after the feature gate and params validation:
	addr := cas20DeriveAddress(variant, creator, salt)
	if cas20AddressOccupied(ctx, addr) {
		return nil, revCAS20("TokenAlreadyExists(address)", errSelTokenExists, addrKey(addr))
	}
	if !ctx.chargeCodeWrite(addr, CAS20MarkerCode) { return nil, ErrOutOfGas }
	ctx.StateDB.SetCode(addr, CAS20MarkerCode, tracing.CodeChangeContractCreation) // 0xEF sentinel first
	tokenCtx := ctx.spawnBootstrap(addr, CAS20FactoryAddress)   // bsc#3826: was `creator`
	tok := newCAS20TokenBootstrap(tokenCtx, decimals)           // privileged = true
	... setName / setSymbol / setSupplyCap / variant extension ...
	ctx.AddLog([]common.Hash{cas20TopicCAS20Created, addrKey(addr), wU8(variant)}, ...) // bsc#3826: moved up
	if initialAdmin != (common.Address{}) { ... RoleGranted(sender = factory) ... }
	for i, call := range initCalls {
		if !ctx.chargeInternalDispatch(call) { return nil, ErrOutOfGas } // warm CALL + copy, no new frame
		...
		if _, err := dispatch(call); err != nil { return nil, revCAS20("InitCallFailed(uint256)", ...) }
	}
```

**S5. transferFrom 的检查顺序**：`bsc/core/vm/cas20_token.go:191-230@8cc60b246c`。可原样使用，约 40 行，可删去 return 行；要点是 pause → 零地址 → allowance → executor 策略 → move（sender、receiver 策略 → 余额）。

**S6. 原生 SSTORE 计费，复刻 EIP-2200/2929/3529**：`bsc/core/vm/cas20_gas.go:72-131@8cc60b246c`。可截取 `:85-112`：sentry → 冷 slot → noop / create / reset 三个分支。

**S7. 两级激活权限**：`bsc/core/vm/cas20_activation.go:82-87, 160-170, 193-195@8cc60b246c`。
```go
func requireGov(ctx *PrecompileContext) error {
	if ctx.Caller != params.CAS20GovHubAddress {   // 0x...1007
		return revCAS20("Unauthorized(address)", errSelUnauthorizedAddr, addrKey(ctx.Caller))
	}
	return nil
}
// updateParam: governance appoints the admin
	if key != cas20ParamAdmin { return revCAS20StringBytes("UnknownParam(string,bytes)", ...) }
	if len(value) != 20 { return revCAS20StringBytes("InvalidValue(string,bytes)", ...) }
// setFeature: the admin works the switch
	if err := reg.requireAdmin(ctx); err != nil { return err }  // stored admin must be non-zero
```

**S8. seize 与 SEIZE_EXEMPT 的反向语义**：`bsc/core/vm/cas20_admin.go:506-531@8cc60b246c`。说明 exempt 策略授权的人**不能**被扣押，默认的 ALWAYS_ALLOW 等于全部豁免。

**S9. fork 区块开头种哨兵**：`bsc/core/systemcontracts/upgrade.go:1158-1163@8cc60b246c` 与 `bsc/core/vm/cas20_genesis.go:13-24`。

**S10（对比用）. B20 的地址派生**：`base/crates/common/precompiles/src/b20_factory/variant.rs:24, 61-67, 124-127@f1f40baf23`。与 S4 并排放，展示结构相同、只有前缀不同。
```rust
pub const PREFIX_BYTE: u8 = 0xb2;
pub fn from_address(address: Address) -> Option<Self> {
    let bytes = address.as_slice();
    if bytes[0] != Self::PREFIX_BYTE || bytes[1..10] != [0u8; 9] { return None; }
    Self::from_discriminant(bytes[10])
}
pub fn compute_address(self, creator: Address, salt: B256) -> (Address, [u8; 9]) {
    let hash = keccak256((creator, salt).abi_encode());
    self.compute_address_from_hash(hash)
}
```

**S11（对比用）. B20 的创建顺序**：`base/crates/common/precompiles/src/b20_factory/logic/v1.rs:58-99@f1f40baf23`。顺序为 `emit B20Created` → `grant_role_unchecked(…, B20FactoryStorage::ADDRESS)` → `with_caller(B20FactoryStorage::ADDRESS, initCalls)`，与 bsc#3826 之后的 CAS20 一致。

**S12（对比用）. 存储布局**：`base/…/common/core_storage.rs:13-97` 与 `bsc/core/vm/cas20_storage.go:10-38` 并排，展示 slot 编号一致。

---

## 图的素材

**图 A：ERC-20 与 CAS20 调用路径对比**
- 共同起点：用户发交易 `token.transfer(to, v)` → `evm.Call` → 深度检查 → value 转账（`evm.go:345-346`）。
- ERC-20 分支：`evm.precompile(addr)` 未命中 → `resolveCode` 加载字节码 → 解释器逐个 opcode 执行（ABI 解码、2×SLOAD、2×SSTORE、LOG3），每个 opcode 收 gas → 合约 storage 更新 → `Transfer` 事件。
- CAS20 分支：`evm.precompile(addr)` 静态表未命中 → `IsJenner` → `resolveCAS20` 按前缀 `0xCA52`、变体字节解析到 `cas20Asset` 或 `cas20Stablecoin` → `runStatefulPrecompiledContract` 扣 RequiredGas=0 并构造 `PrecompileContext` → `cas20EnterCall`（DirectCall、value、calldata 收费）→ 存在性检查（codehash==keccak(0xEF)）→ selector dispatch → 带计费的 storage 读写（冷 / 热、EIP-2200）→ `AddLog` → `finishCAS20Metered`（写保护 > OOG > 结果）。出错时 snapshot 回滚。
- 共同终点：代币账户的 storage 进入 state root。
- 旁注：同时向 tracer 报告 `OnStorageRead` 和 `OnAccountRead`。

**图 B：CAS20 创建时序（参与者：EOA/合约、CAS20Factory、ActivationRegistry、新代币地址、PolicyRegistry）**
1. 调用方 → Factory：`createCAS20(variant, salt, params, initCalls)`
2. Factory：检查调用形式和 calldata 收费 → static 检查 → 解码
3. Factory → ActivationRegistry（storage 读，不是 CALL）：feature 是否已激活？否则 `FeatureNotActivated`
4. Factory：解码 params → version → 字段校验（decimals / currency）
5. Factory：派生地址 → 检查地址是否有代码，有则 `TokenAlreadyExists`
6. Factory → 新地址：`SetCode(0xEF)`
7. Factory → 新地址 storage：name、symbol、supplyCap=uint128.max，以及 decimals+multiplier=1e18 或 currency
8. Factory 发出 `CAS20Created(token, variant, name, symbol, decimals, variantEventParams)`
9. 若 initialAdmin≠0：写 roles[DEFAULT_ADMIN][admin]、adminCount=1，代币发出 `RoleGranted(sender=Factory)`
10. 循环执行 initCalls：先收内部 dispatch 费用 → 以特权模式、msg.sender=Factory 执行（可能读 PolicyRegistry，例如 MINT_RECEIVER）→ 任一失败则整体回滚，报 `InitCallFailed(i)`
11. 返回代币地址
- 变更标注：bsc#3826 之前，第 8 步在第 10 步之后，第 9、10 步的 sender / msg.sender 是 creator。BEP master 仍是旧描述，BEPs#716 为 open。

**图 C：激活的三道闸（可与“进度时间线”合并）**
- 闸 1：Jenner 硬分叉，代码路由启用，fork 区块开头给两个 registry 种哨兵。（BSC 主网和测试网 JennerTime 均未设置；官方计划测试网 10 月下旬、主网 11 月下旬。）
- 闸 2：治理提案 → GovHub `updateParam("admin", addr, target=0x7020…01)` → ActivationRegistry 存下 admin。
- 闸 3：admin 调 `activate(keccak("bsc.cas20_asset" | "bsc.cas20_stablecoin" | "bsc.policy_registry"))`。
- 分支：`deactivate` 只阻止新的创建和 PolicyRegistry 写操作，已有代币照常运行；已有代币的冻结只能由发行方的 `pause` 完成。

**图 D：transfer / transferFrom 的检查决策树**：按 C-Q3 给出的顺序逐级排列，每个失败分支标上对应的错误名。

**图 E：CAS20 进度时间线（含 B20 对照）**
- 2026-05-12：base-std 首个 commit
- 2026-06-18 / 06-25：Base Sepolia / 主网 Beryl，B20 上线
- 2026-07-16：BEP-702 头部写的 Created 日期
- 2026-09-02：base-std 把 SEIZE_HOLDER 改名为 SEIZE_EXEMPT
- 2026-09-03：bsc#3813 开 PR
- 2026-09-08：bsc 内部 commit 57d98c2 清理 base-std / IB20 注释
- 2026-09-11：BEPs#702 合并（05:57Z），bsc#3813 合并（06:47Z）
- 2026-09-17：BEPs#716 开（至今 open）；reth-bsc#512 开
- 2026-09-20：BEP-718 Meta-Jenner 合并
- 2026-09-23：bsc#3826 和 #3829 合并；Base Sepolia Cobalt
- 2026-09-24：reth-bsc#512 合并
- 2026-09-30：Base 主网 Cobalt
- 2026-10-05：reth-bsc QANet 的 Jenner 时间戳
- 2026-10-08：reth-bsc#524 合并
- 2026-10 下旬（计划）：BSC 测试网 Jenner
- 2026-11 下旬（计划）：BSC 主网 Jenner
- 之后：治理任命 admin → activate
- 状态：已合并、未 release、未激活

---

## 外部调研的修正

1. **“57d98c2 修改了几处注释与测试描述”**：内容正确，但需要补充两点。(a) 这是 PR #3813 分支里的 commit；PR 是 squash 合并的，在 bsc develop 历史中不存在，只能在 GitHub 上看到 [9]。(b) 痕迹不止这一个 commit：#3813 的首个实现 commit `13a9d22d9` 有更多 “base-std publishes”、“IB20 dispatch / views” 注释，测试还直接以 base-std 的已发布哈希为期望值；`d6a0a0414` 也有。
2. **“初始化调用的 msg.sender 必须是 Factory；创建事件先于初始化事件”**：对当前代码正确（bsc#3826）。但外部调研没有指出 **BEP-702 master 文本仍是相反的写法**（事件在最后、msg.sender=creator），规范修订 BEPs#716 仍未合并 [1][6]。它也没有指出 #3826 的结果正好与 Base B20 实现的顺序一致 [5]，这本身就是 C-Q7 的证据。
3. **“transferFrom 的处理逻辑包括 allowance、spender 执行资格、发送方和接收方策略、暂停状态、余额”**：列举的顺序不对。实际顺序是 **pause 最先** → 零地址 → allowance → executor → sender → receiver → 余额（`cas20_token.go:191-269`；BEP §3.6），而且 BEP 规定这个顺序属于共识。
4. **“Base B20 也在向 ERC-8056 的显示数量与定时 multiplier 接口演进”**：已过时。ERC-8056 定时 multiplier 随 Cobalt 在 Base 主网 2026-09-30 上线 [10][13]。
5. **“Base B20 同样采用… Activation Registry…”**：结构相同，但**激活权限不同**。Base 由链配置的静态 admin（Cobalt 起可由现任 admin 换人）控制；BSC 由 GovHub 治理任命，admin 不能自己换人（`base/crates/common/precompiles/src/activation/storage.rs:24-46, 140-166`；`bsc/core/vm/cas20_activation.go:82-87`）[14][15]。外部调研没有区分这一点。
6. **“Activation Registry 采用两层权限：BSC 治理通过 updateParam("admin", …) 任命管理员”**：基本正确，但漏了“必须经 GovHub 转发”（`0x…1007`；BSCGovernor 的提案目标白名单里只有 GovHub），也漏了 registry 必须先有 `0xEF` 代码，GovHub 才会转发（`protocol_params.go:247-256`；BEP §3.15）。
7. **“关闭某个创建功能，不等于把此前发行的 token 全部暂停”**：正确，但不完整。关闭 `bsc.policy_registry` 会**冻结所有共享名单**（成员和管理员都不能再更新），这会间接影响依赖这些名单的现有代币的合规状态（BEP §3.15、§6.2 [1]）。
8. **“已有双客户端实现，等待 Jenner”**：需要补充。(a) 截至 2026-10-09，bsc 没有任何 release 包含 CAS20（最新的 v1.8.0-alpha 为 2026-08-13，早于 #3813 的 2026-09-11 合并）；reth-bsc 最新 v0.1.2 为 2026-08-20，也早于 #512 的合并。(b) mainnet 和 Chapel 的 `JennerTime: nil`。(c) Jenner 之后还要治理任命 admin、admin 激活，CAS20 才可用。
9. **引用的 `raw.githubusercontent.com/.../develop/...` 链接**：都是浮动分支，内容会变。报告应改用固定 commit（`8cc60b246c`）。
10. 外部调研没有提到的规范与代码不一致：genesis 哨兵要求（BEP master 要求放在 genesis；代码只在跨 fork 的区块种；#716 提议撤回），以及 `SEIZE_HOLDER_POLICY` 在 BEP master 中的旧名字。
11. **“reth-bsc#512 明确是在移植并对齐 Go 版本的行为”**：正确。可补充：对齐基线是 Go `057868dc` 加 BEPs#716，**不是** BEP master；验证手段是 145 步 golden replay 加 state root 比对 [8]。

---

## 来源

1. **PRIMARY** BEP-702 原文，`BEPs/BEPs/BEP-702.md@e9b2be3b00`：证明规范层面的动机、地址、调用约束、创建流程（旧版）、检查顺序、gas 规则、激活、哨兵和存储布局。
2. **PRIMARY** BEP-702 修订历史，`git log --format='%h %cs %s' -- BEPs/BEP-702.md`（commit `90cc328` … `0564c01`，2026-09-03 至 09-10）：证明规范逐步修订的时间与主题（如 `75ea9bf`、`794da11`、`82e9c5d`、`86f1b2f`）。
3. **PRIMARY** BEPs#702 PR（merged 2026-09-11T05:57Z）：证明规范合并时间。
4. **PRIMARY** bsc#3813 PR（created 2026-09-03，merged 2026-09-11T06:47:58Z，merge `6274bf91`，29 个 commit）的正文与评论：证明主实现的范围、激活设计的由来、RPC，以及 hashdit 对 genesis 哨兵的 HIGH 提示。
5. **PRIMARY** bsc#3826 PR 与 commit `37417a05`（merged 2026-09-23T02:58:44Z）：证明创建事件被提前、bootstrap 调用者改为 Factory，以及理由。
6. **PRIMARY** BEPs#716（created 2026-09-17，state OPEN）：证明规范修订仍未合并，以及它对事件顺序、bootstrap 调用者、genesis 要求的修改。
7. **PRIMARY** bsc#3829 PR 与 commit `057868dc`（merged 2026-09-23T06:10:01Z）：证明 SEIZE_EXEMPT 改名、scope 哈希变化、slot 不变、没有别名。
8. **PRIMARY** reth-bsc#512（created 2026-09-17，merged 2026-09-24T01:30:04Z，merge `810c247`）正文：证明 Rust 移植的范围、对齐基线、golden 验证、微基准数字，以及“未做整块计时测量”的声明。
9. **PRIMARY** bsc commit `57d98c2acb5f`（`gh api repos/bnb-chain/bsc/commits/57d98c2`，2026-09-08，属于 #3813）及 `13a9d22d9`、`d6a0a0414`、`c98332918` 的 patch：证明 BSC 开发过程中直接引用了 base-std / IB20 / B20 前缀。
10. **PRIMARY** base-std `a2954a8d57`：`CHANGELOG.md`、`changelog/README.md`、`src/interfaces/*.sol`、`src/lib/B20Constants.sol`、`src/StdPrecompiles.sol`、`docs/architecture.md`、commit `607ef9a`：证明 B20 的接口、常量、地址、按 fork 的状态，以及 seize 改名的时间。
11. **PRIMARY** BNB Chain Jenner 公告，https://docs.bnbchain.org/announce/jenner-bsc/（访问 2026-10-09）：证明 Jenner 的计划时间（测试网 10 月下旬、主网 11 月下旬）和“release 尚未发布”。
12. **PRIMARY** BEP-718 Meta-Jenner，`BEPs/BEPs/BEP-718.md@e9b2be3b00`：证明 BEP-702 已列入 Jenner。
13. **PRIMARY** Base 文档：https://docs.base.org/upgrades/beryl/b20.md 、https://docs.base.org/upgrades/overview.md 、/upgrades/beryl/overview.md 、/upgrades/cobalt/overview.md（访问 2026-10-09）：证明 B20 属于 Beryl、用 Rust precompile 实现，以及 Beryl / Cobalt 的上线日期。
14. **PRIMARY** base 源码 `f1f40baf23`：`crates/common/precompiles/src/{b20_factory/variant.rs, b20_factory/logic/v1.rs, common/core_storage.rs, b20_asset/storage.rs, activation/storage.rs, lookup.rs, b20_asset/dispatch.rs}`、`crates/common/chains/src/config.rs`：证明 B20 的地址算法、创建顺序、存储布局、激活 admin 机制、fork 时间戳。
15. **PRIMARY** bsc 源码 `8cc60b246c`：`core/vm/{contracts_stateful.go, evm.go, cas20*.go}`、`core/systemcontracts/upgrade.go`、`params/{config.go, protocol_params.go}`、`internal/ethapi/api_cas20.go`、`core/tracing/hooks.go`：证明 CAS20 的实际行为。
16. **PRIMARY** reth-bsc 源码 `349f55c`：`src/evm/precompiles/cas20/{mod.rs, testdata/*}`、`benches/cas20.rs`、`src/hardforks/bsc.rs`，以及 reth-bsc#531、#524：证明 Rust 实现的路由、fixture 和 QANet 的 Jenner 时间。
17. **PRIMARY** `gh release list -R bnb-chain/bsc` / `-R bnb-chain/reth-bsc`（2026-10-09）：证明最新 release 日期都早于 CAS20 合并。
18. 外部调研 `research/bsc-development-research.md`（ChatGPT Deep Research）：只作线索。

---

## 开放问题

1. BEPs#716 何时合并？合并前，BEP-702 master 文本与两个客户端的行为不一致（事件顺序、bootstrap 调用者、SEIZE_EXEMPT、genesis 要求）。
2. 对 genesis 已在 Jenner 的链（新测试网、devnet），node-deploy 等工具是否真的在 genesis alloc 里放了两个 registry 哨兵？#3813 说放了，#716 说没有任何实现这样做。
3. BEP §3.14 和 §6.1 要求的激活前测量（整块对抗性计时、parity 差分、存储与 gas fuzz）由谁做、何时公开？
4. 治理会把谁任命为 ActivationRegistry admin（多签？基金会地址？），何时提案？
5. BSC 是否会跟进 B20 Denim 的三项改动（拒绝代币自身作收款方、executor 覆盖所有路径、NOT 策略）？如果跟进，就需要第二次硬分叉和按 fork 的版本化机制，而 bsc 目前没有这个结构。
6. BEP §3.14 中“the reference contract”到底指哪份合约（base-std MockB20？BSC 内部的 Solidity 参考？）？
7. Base 主网上 B20 的 feature 实际是否已激活、使用情况如何？本次未查证。
8. BSC 与 Base 之间有没有正式的合作或授权说明？仓库、BEP 和公告里都没有提到 Base。

---

## 台账

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| C1 | BEP-702 状态为 Draft，头部 Created 2026-07-16；BEPs#702 于 2026-09-11 合并 | `BEPs/BEPs/BEP-702.md:1-8@e9b2be3b00`；来源 [3] | observed |
| C2 | BEP-702 的动机：BEP-20 只是 ABI 约定，不保证行为；面向稳定币和代币化 RWA；把合规原语、重新计价、状态访问计价放进协议 | BEP-702 §1、§2（来源 [1]） | observed |
| C3 | Asset 的 decimals 在 [6,18] 内，带 multiplier / announce / batchMint / extraMetadata / OPERATOR_ROLE；Stablecoin 的 decimals 固定为 6，currency 非空、只能是 A–Z、不可变，且只是自我声明 | BEP §3.5、§3.12、§3.13；`bsc/core/vm/cas20_factory.go:258-286@8cc60b246c` | observed |
| C4 | 单例地址：Factory `0xCA5F00…00`、ActivationRegistry `0x7020…01`、PolicyRegistry `0x7020…02`；CAS20 地址不会被预热 | `bsc/core/vm/cas20.go:20-23`；BEP §3.1、§3.14 | observed |
| C5 | 代币地址 = `0xCA52` ‖ 8 个零字节 ‖ 变体（00=Asset / 01=Stablecoin）‖ `keccak256(abi.encode(creator,salt))[:9]` | `bsc/core/vm/cas20_factory.go:39-47`；`cas20.go:11-18`；BEP §3.3 | observed |
| C6 | `StatefulPrecompiledContract` = RequiredGas + RunStateful(ctx)；CAS20 的 RequiredGas 恒为 0，所有计费在 RunStateful 内进行 | `bsc/core/vm/contracts_stateful.go:13-20, 161-187`；`cas20.go:149-150`；BEP §3.2 | observed |
| C7 | EVM 先查静态 precompile 表，Jenner 后再按地址前缀解析 CAS20；用类型断言把调用转到 stateful 路径 | `bsc/core/vm/evm.go:46-80@8cc60b246c` | observed |
| C8 | DELEGATECALL / CALLCODE 报 DelegateCallNotAllowed，携带 value 报 NonPayable，STATICCALL 中的写操作报 StaticCallNotAllowed，三者都是 ABI revert，不是 halt；写点处另有兜底 | `bsc/core/vm/cas20.go:88-100`；`cas20_errors.go:39-63`；`cas20_gas.go:59-62, 81-84`；BEP §3.2 | observed |
| C9 | 代币和 registry 账户都带一字节代码 `0xEF`，用于防止 EIP-161 清理账户与 storage；EIP-3541 保证它不可伪造；存在性按 code hash 精确比较 | `bsc/core/vm/cas20_factory.go:33-35`；`cas20.go:62-70`；BEP §3.16、§4.9 | observed |
| C10 | CAS20 的状态写在代币账户自己的 storage 里（ERC-7201 命名空间 `bsc.cas20*`），因此进入 state root；不写 nonce 和余额 | `bsc/core/vm/cas20_storage.go:10-50, 140-146`；BEP §3.17 | observed |
| C11 | 当前代码的创建顺序：激活检查 → 参数与 version 校验 → 派生地址 → 占用检查 → 写 0xEF → 身份 storage → CAS20Created → 授予 initialAdmin → initCalls | `bsc/core/vm/cas20_factory.go:109-219@8cc60b246c` | observed |
| C12 | bsc#3826（2026-09-23 合并）把 CAS20Created 提到 admin 授权和 initCalls 之前，并把 bootstrap 的 msg.sender 从 creator 改成 Factory | 来源 [5]：commit `37417a05` 的 diff 与 PR 正文；`cas20_factory_test.go:242` | observed |
| C13 | BEP-702 master 仍写“CAS20Created 最后发出、initCalls 中 msg.sender 是 creator、SEIZE_HOLDER_POLICY”；修订 PR BEPs#716 截至 2026-10-09 为 open | BEP §3.4、§3.8（来源 [1]）；`gh api repos/bnb-chain/BEPs/pulls/716` → state open（来源 [6]） | observed |
| C14 | bootstrap 窗口跳过角色检查和 transfer 侧三种策略，不跳过 MINT_RECEIVER、pause、supply cap 和防复活检查 | `bsc/core/vm/cas20_token.go:14-16, 214, 246`；`cas20_admin.go:360-382`；BEP §3.4 | observed |
| C15 | transfer 顺序：pause → 零地址 → sender 策略 → receiver 策略 → 余额；transferFrom 在零地址之后插入 allowance → executor 策略（spender==from 时跳过）；这个顺序属于共识 | `bsc/core/vm/cas20_token.go:175-269`；BEP §3.6 “Check order” | observed |
| C16 | 每个代币有 6 个策略槽，默认 0=ALWAYS_ALLOW；PolicyRegistry 有 BLOCKLIST / ALLOWLIST / UNION / INTERSECT（复合策略 2–4 个子策略）；isAuthorized 从不 revert；单批最多 64 个地址；写操作受 bsc.policy_registry 门控 | `bsc/core/vm/cas20_admin.go:37-42`；`cas20_policy.go:20-24, 168-198, 366-377`；BEP §3.8 | observed |
| C17 | 内置角色：DEFAULT_ADMIN / MINT / BURN / SEIZE / PAUSE / UNPAUSE / METADATA（Asset 另有 OPERATOR）；不能撤掉最后一个 admin；renounceLastAdmin 不可逆，之后角色成员关系冻结 | BEP §3.7；`bsc/core/vm/cas20_admin.go:368-382` | observed |
| C18 | seize 需要 SEIZE_ROLE 且 SEIZE 未暂停；只有不被 SEIZE_EXEMPT_POLICY 授权的持有人可被扣押，默认没有人可被扣押；totalSupply 不变；依次发出 Transfer、Memo、Seized | `bsc/core/vm/cas20_admin.go:506-552@8cc60b246c`；BEP §3.6、§3.8 | observed |
| C19 | bsc#3829（2026-09-23）把 SEIZE_HOLDER_POLICY 改名为 SEIZE_EXEMPT_POLICY，scope 哈希改变、slot 14 不变、不保留别名；base-std 已于 2026-09-02 先做了同样的改名（#214） | 来源 [7]；base-std commit `607ef9a`（来源 [10]） | observed |
| C20 | memo 是 bytes32，`Memo` 事件紧跟主事件；`MemoFormatDeclared(formatId)` 是 BSC 独有的，B20 接口没有 | BEP §3.6；`rg -i formatId base-std/src base/crates/common/precompiles/src` 无结果 | observed |
| C21 | Asset 的 multiplier：scaled=⌊raw·m/1e18⌋；balanceOf 和转账都用 raw；m ≤ uint128.max；定时 multiplier 在读取时生效，不发事件；带 ERC-8056 别名 | `bsc/core/vm/cas20_asset.go:119-177`；BEP §3.12、§6.5 | observed |
| C22 | 原生计费复刻 EIP-2929 冷/热、EIP-2200 net metering（含 2300 sentry）、EIP-3529 退款；calldata 每次外部调用按 6 gas/字收一次；initCalls 和 announce 每项收 100+6 gas/字，不开调用帧、不做 63/64 预留 | `bsc/core/vm/cas20_gas.go:16-131`；`cas20.go:96`；BEP §3.14；BEPs commit `75ea9bf`、`794da11` | observed |
| C23 | #3813 新增 tracer hook OnStorageRead / OnAccountRead，让 prestate 和 access-list tracer 能看到原生访问；state override 通过 DisabledPrecompile 关闭路由；提供 eth_getCAS20TokenInfo 和 Batch（≤20） | `bsc/core/tracing/hooks.go:331-332`；`contracts_stateful.go:99-109`；`internal/ethapi/api_cas20.go:13-36`；`override/override.go:75-81` | observed |
| C24 | 唯一的性能数据是 reth-bsc#512 的本地微基准：M1 Pro 上单线程 transfer 1.315 µs；PR 明确说明不覆盖 BEP §3.14 要求的对抗性 / 整块计时测量；Go 侧没有 benchmark | 来源 [8] 的 PR 正文 Verification 与 “Not in this change” 节；`rg '^func Benchmark' bsc/core/vm/cas20*_test.go` 无结果 | observed |
| C25 | 激活分两层：治理经 GovHub `0x…1007` 调 `updateParam("admin", 20 字节非零值)` 任命 admin，admin 再 activate / deactivate；admin 不能自己换人 | `bsc/core/vm/cas20_activation.go:82-87, 144-210`；`params/protocol_params.go:247-256`；BEP §3.15 | observed |
| C26 | feature id 为 keccak256("bsc.cas20_asset" \| "bsc.cas20_stablecoin" \| "bsc.policy_registry")，fork 时全部关闭，admin 为空 | `bsc/core/vm/cas20_activation.go:24-28`；BEP §3.15 | observed |
| C27 | 开关只门控 createCAS20 和 PolicyRegistry 的写操作，已有代币的操作和所有读取都不查 registry；关闭 policy_registry 会冻结共享名单 | BEP §3.15 表与 §6.2；`bsc/core/vm/cas20.go:189-200` | observed |
| C28 | bsc 只在跨越 Jenner 的区块开头（atBlockBegin + IsOnJenner）给两个 registry 种 0xEF；genesis 已在 Jenner 的链不会触发；BEP master 要求在 genesis 里放哨兵，BEPs#716 提议撤回这一要求；hashdit 在 #3813 上把它标为 HIGH | `bsc/core/systemcontracts/upgrade.go:1158-1163`；`params/config.go:1483-1490`；来源 [4]、[6]；BEP §3.15 | observed |
| C29 | bsc 的 mainnet 和 Chapel 配置中 JennerTime 为 nil；官方计划测试网 2026 年 10 月下旬、主网 11 月下旬，release 尚未发布；reth-bsc 只排了 QANet（2026-10-05 05:00 UTC） | `bsc/params/config.go:256, 311`；来源 [11]；`reth-bsc/src/hardforks/bsc.rs:231-232, 415-425` | observed |
| C30 | 截至 2026-10-09，没有任何 bsc 或 reth-bsc 的 release 包含 CAS20 | 由 C33、来源 [17] 推出：bsc 最新 v1.8.0-alpha（08-13）早于 #3813 合并（09-11），reth-bsc 最新 v0.1.2（08-20）早于 #512 合并（09-24） | inferred |
| C31 | bsc commit 57d98c2（2026-09-08，属于 PR #3813，squash 后不在 develop 历史中）把注释里的 base-std 改成“the standard”、IB20 改成 ICAS20、“the reference implementation's prefix (0xb2…)”改成“a neighbouring prefix” | 来源 [9]：`gh api repos/bnb-chain/bsc/commits/57d98c2` 的 patch 与 `/pulls` | observed |
| C32 | #3813 的首个实现 commit 13a9d22d9 还有 “base-std publishes”、“IB20 dispatch / views” 等注释，测试以 base-std 的已发布哈希为期望值 | 来源 [9]：`gh api …/commits/13a9d22d9` 的 patch | observed |
| C33 | bsc#3813 于 2026-09-11 合并，reth-bsc#512 于 2026-09-24 合并 | 来源 [4]、[8] 的 mergedAt | observed |
| C34 | B20 属于 Base Beryl（Sepolia 2026-06-18、主网 2026-06-25），Cobalt（Sepolia 09-23、主网 09-30）加入 seize、复合策略和 ERC-8056，Denim 尚未上主网 | 来源 [13] upgrades/overview；`base/crates/common/chains/src/config.rs:476-478, 551-553`；`base-std/CHANGELOG.md` | observed |
| C35 | B20 是 Rust precompile（base `crates/common/precompiles`）；CAS20 是 Go 实现（bsc `core/vm`），另有 Rust 移植版（reth-bsc） | 来源 [13] “implemented as Rust precompiles”；来源 [14]、[15]、[16] | observed |
| C36 | CAS20 与 B20 的地址结构相同：都是 10 字节保留前缀 ‖ 变体字节 ‖ 9 字节 abi.encode 指纹，只有前缀不同（`0xB2`+9×00 对 `0xCA52`+8×00） | `base/…/b20_factory/variant.rs:24, 61-67, 124-127@f1f40baf23`；C5 | observed |
| C37 | CAS20 存储布局与 B20 逐字段相同（core slot 0–14、asset slot 0–4、打包 lane），只是命名空间串从 base.* 换成 bsc.*；feature id 也同构 | `base/…/common/core_storage.rs:13-97`；`b20_asset/storage.rs:14-33`；`activation/storage.rs:54-58`；`bsc/core/vm/cas20_storage.go:10-38` | observed |
| C38 | 接口函数名有 100 个相同；B20 独有 burnBlocked、BURN_BLOCKED_ROLE、invertedPolicyId；CAS20 独有 transferWithMemoFormat、transferFromWithMemoFormat、updateParam、variantOf | notes §C-Q7 的 `grep \| sed \| comm` 命令输出（base-std `src/interfaces/*.sol` 对比 BEP-702） | observed |
| C39 | bsc#3826 之后，CAS20 的创建顺序（事件 → admin 授权，sender=Factory → 以 Factory 为 caller 执行 initCalls）与 B20 实现一致；#3826 的正文没有提到 B20 | `base/…/b20_factory/logic/v1.rs:58-99`；`base-std/src/interfaces/IB20Factory.sol:102-104, 137-149`；来源 [5] | observed |
| C40 | 两者的差异：激活 admin（Base 用链配置的静态 admin，Cobalt 起现任 admin 可 setAdmin；BSC 由 GovHub 治理任命）、版本化（B20 按 fork 冻结版本，BSC 单一版本）、initCall 失败时 B20 冒泡内部原因而 BSC 一律报 InitCallFailed、B20 Denim 的三项改动 CAS20 都没有 | `base/…/activation/storage.rs:24-46, 140-166`；`base-std/docs/architecture.md` §3；`base/…/b20_factory/logic/v1.rs` 的 map_init_call_error；`bsc/core/vm/cas20_factory.go:208-213`；`cas20_token.go:214, 239-245`；`base-std/CHANGELOG.md` Denim 节 | observed |
| C41 | CAS20 的接口、架构和存储布局直接沿用 Base B20 / base-std 的设计，并持续跟进其规范变更（如 SEIZE_EXEMPT）；它不是“恰好相似的独立设计” | 由 C19、C31、C32、C36、C37、C38、C39 推出：开发痕迹直接引用 base-std / IB20，布局和接口逐项同构，并跟随 B20 改名和改顺序 | inferred |
| C42 | CAS20 代码是接入 geth EVM 的 Go 实现，不是 Base Rust 代码的 fork | 由 C35、C40 推出：语言不同；内部结构不同（手写 ABI 与 cas20Storage，对比 Rust 宏和按 fork 冻结的版本）；没有共享源文件 | inferred |
| C43 | BSC 开发者可能参照 base-std 的 Solidity mock（MockB20）或 Base 的 Rust 代码来写 Go 实现；BEP §3.14 的 “reference contract” 可能指某份 B20 参考合约 | 没有直接证据；仅凭 `base/…/core_storage.rs:83-84` 提到 “base-std mock”、BEP §3.1 / §3.14 的 “reference implementation / contract” 措辞推测 | speculative |
| C44 | reth-bsc#512 以 Go `057868dc` 加 BEPs#716 为基线移植全家族；145 步 golden fixture 逐步比对 returndata / status / gas / refund / logs 和最终 state root；648 个测试通过 | 来源 [8]；`reth-bsc/src/evm/precompiles/cas20/testdata/README.md@349f55c`；`cas20_golden.json` 中 steps=145 | observed |

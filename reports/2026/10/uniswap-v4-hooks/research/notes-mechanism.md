# notes-mechanism：v4 hook 机制与一个简单 hook 的完整生命周期（brief 研究问题 1 + 问题 6 的 gas 部分）

研究问题：v4 的单例 PoolManager、unlock 回调与 flash accounting、delta 记账、hook 地址权限位、各回调签名与返回值（含 return delta、动态费覆盖）怎样协同工作？一个最小 hook 从编写、部署、建池、加流动性、swap 到移除流动性，每一步是谁调用谁、delta 怎么变、最后怎么结清？v4 相对 v3 的 gas 差在哪里？

一句话答案：所有池子的状态都存在一个 PoolManager 合约里。外部合约必须先调 `unlock`，在 `unlockCallback` 里做 swap、加减流动性等操作；每个操作只往 transient storage 里给“调用者 × 币种”记一笔有符号 delta，退出 `unlock` 前非零 delta 的计数必须归零，否则整笔交易 revert。hook 是一个地址低 14 位编码了权限的外部合约，PoolManager 在固定位置 CALL 它；它可以拦截（revert）、改费率（动态费池）、改记账（4 个 return-delta 标志）。v4-core 自己的 gas 快照显示：建池 51,532 gas，而 v3 `createPool` 为 4,557,092 gas；多跳 swap 每多一跳的边际成本 v4 约 57.5k，v3 约 64.7k，但两套快照口径不同。hook 回调的额外开销没有官方单列数字。

口径：v4-core @ `46c6834698c48bc4a463a86d8420f4eb1d7f3b75`（2026-04-02 合并）；v4-periphery @ `9969eec44cfdf07e24b41de47f40276a58401976`（2026-09-18）；Uniswap/v4-template @ `1fbf95547791f0821a170b88c750cb2e04e6818b`（2025-10-28）；OpenZeppelin/uniswap-hooks @ `e59fe72c110c3862eec9b332530dce49ca506bbb`（template 的子模块）。行号按 raw 文件逐行计数，渲染前建议在 GitHub 上点开核对一次。网页访问日期均为 2026-10-06。

---

## Q1 v4 架构：单例、unlock、flash accounting、delta、ERC-6909、原生 ETH、donate

### 1.1 单例 PoolManager 与 PoolKey

**答案**：所有池子都是 `PoolManager` 里 `mapping(PoolId => Pool.State) _pools` 的一项。池子由 `PoolKey{currency0, currency1, fee, tickSpacing, hooks}` 唯一确定，hook 地址是池子身份的一部分。建池（`initialize`）只写一个 storage 槽组，不部署合约，也不需要先 unlock。

**依据**
- `_pools` 映射：[1] `v4-core/src/PoolManager.sol#L93@46c6834`。
- PoolKey 五个字段：[6] `v4-core/src/types/PoolKey.sol#L11-L22@46c6834`。注释写明 `fee` 若最高位为 1 则必须恰好等于 `0x800000`（动态费）。
- `initialize` 没有 `onlyWhenUnlocked` 修饰符。它依次检查 tickSpacing 范围、`currency0 < currency1`、`isValidHookAddress`，然后调用 `beforeInitialize` → `_pools[id].initialize` → emit → `afterInitialize`：[1] `PoolManager.sol#L117-L142`。官方文档也写“pool initialization can happen outside the context of unlocking” [18]。
- 官方文档 PoolManager 页：v3 每个池子一个合约，v4 用单例 [23]。

**不确定之处**：无实质不确定。PoolKey 不存储在链上（注释 “poolkeys are not saved in storage and must always be provided by the caller” [1] `#L137`），所以集成方必须从 `Initialize` 事件或 PositionManager 的 `poolKeys` 映射 [11] 中还原 key。

### 1.2 unlock → unlockCallback → 结清检查

**答案**：`unlock(data)` 先用 `tstore` 把 `IS_UNLOCKED_SLOT` 置 true，再回调 `msg.sender.unlockCallback(data)`。回调返回后检查 `NonzeroDeltaCount == 0`，不为 0 就 revert `CurrencyNotSettled`，最后重新上锁。`swap / modifyLiquidity / donate / take / settle / clear / mint / burn` 都带 `onlyWhenUnlocked`。`sync` 和 `initialize` 不带。

**依据**
- [1] `PoolManager.sol#L104-L114`（unlock）、`#L96-L99`（onlyWhenUnlocked）。
- [7] `v4-core/src/libraries/Lock.sol#L8-L15@46c6834`：锁状态用 `tstore/tload` 存在 transient storage。
- [7] `NonzeroDeltaCount.sol`：同样存在 transient 槽中，`increment/decrement` 由 `_accountDelta` 在 delta 从 0 变非 0、或从非 0 变 0 时调用 [1] `#L368-L378`。
- 嵌套 unlock 会 revert `AlreadyUnlocked` [1] `#L105`，所以一笔交易里同一时刻只有一个 locker。但在 callback 内部，任何合约（包括 hook）都可以直接调用 PoolManager 的 `onlyWhenUnlocked` 函数，因为检查只看全局锁状态 [1] `#L96-L99`（inferred：核心合约不校验调用者是不是 locker）。

### 1.3 flash accounting 与 EIP-1153

**答案**：delta 记在 `keccak256(target, currency)` 对应的 transient 槽里（`tload/tstore`），按“调用者地址 × 币种”累加。中间步骤不发生 ERC-20 转账，只有最终净额才需要转账，所以多跳 swap 只在两端各转一次币。EIP-1153 的 `TLOAD/TSTORE` 各 100 gas，交易结束自动清空，Ethereum 主网在 Cancun 升级中启用。

**依据**
- [7] `v4-core/src/libraries/CurrencyDelta.sol#L10-L41@46c6834`（`_computeSlot` 与 `applyDelta`）。
- [18] 官方 flash-accounting 文档：“any number of arbitrary hops only requires two token transfers”。
- [10] V4Router 多跳循环里每一跳只调用 `poolManager.swap`，把上一跳的 `amountOut` 当作下一跳的 `amountIn`，中间没有 transfer：`v4-periphery/src/V4Router.sol#L115-L130@9969eec`。
- [27] EIP-1153：TLOAD/TSTORE 100 gas，交易结束丢弃，revert 时回滚；测试路径位于 `tests/cancun/`。
- [26] 2023 年愿景博客：flash accounting 的最佳设计依赖 EIP-1153。

**不确定之处**：链上必须支持 EIP-1153，v4-core 才能工作（`pragma 0.8.24+` 且使用 `tstore`）。某条 L2 是否已启用对应升级，属于“对 Mantle 的意义”lane 的范围，本 lane 未核查。

### 1.4 BalanceDelta 的符号、sync / settle / take / clear

**答案**：对调用者而言，**正 delta = PoolManager 欠你（可以 take）；负 delta = 你欠 PoolManager（必须 settle）**。ERC-20 的支付流程是：先 `sync(currency)` 快照余额，再把币转进 PoolManager，最后 `settle()`，PoolManager 用“当前余额 − 快照余额”给你记正 delta。`take` 先记负 delta 再转出。`clear` 用于放弃一笔正 delta（金额必须精确相等）。

**依据**
- 符号约定：IHooks 对 afterSwap 参数 `delta` 的注释是 “The amount owed to the caller (positive) or owed to the pool (negative)” [3] `IHooks.sol#L107-L121`；官方指南也写 “A negative delta signals that the PoolManager is owed tokens” [22]。
- `sync` [1] `#L279-L288`、`take` [1] `#L291-L297`、`settle/settleFor` [1] `#L300-L307`、`_settle` [1] `#L349-L365`、`clear` [1] `#L310-L319`。
- periphery 的标准结清封装：`_settle = sync → (原生 ETH 走 settle{value}) / (ERC-20 走 _pay 再 settle)` [10] `v4-periphery/src/base/DeltaResolver.sol#L38-L48@9969eec`。

### 1.5 ERC-6909 claim（mint / burn）

**答案**：`mint(to, id, amount)` 让调用者对该币种记负 delta，同时给 `to` 铸 ERC-6909 claim，相当于“把应得的币留在 PoolManager 里，换一张内部凭证”。`burn` 则烧掉 claim，换回正 delta。高频交易者或 hook 可以只在 PoolManager 内部记账，不发生 ERC-20 转账。

**依据**：[1] `#L322-L336`；[19] 官方 ERC-6909 文档，说明 claim 无需外部调用、gas 开销恒定，适用于 MEV bot 和 LP 管理者。

**不确定之处**：v4-core 快照里，“swap mint output as 6909” 为 154,985 gas，反而高于 “simple swap” 的 123,144 [9]。两个测试的场景不同（首次 mint 会写入新的 storage 槽），不能据此说 6909 更贵或更便宜。

### 1.6 原生 ETH 与 donate

**答案**：
- 原生 ETH 以 `Currency(address(0))` 表示。settle 时按 `msg.value` 记账，不需要 WETH 包装。
- `donate` 把 amount0/1 直接加到当前在区间内的 LP 的 `feeGrowthGlobal` 上，给调用者记负 delta；如果当前流动性为 0，则 revert。

**依据**
- [1] `_settle` 中 `currency.isAddressZero()` → `paid = msg.value`（`#L353-L354`）。
- [1] `donate` `#L256-L276`；[8] `Pool.sol` 的 `donate()` 与 `NoLiquidityToReceiveFees`。
- `Pool.State` 的注释提醒：只有一个头寸的池子可以自己给自己 donate，从而虚增 `feeGrowthGlobal` [8]。
- gas：v4-core 快照中 “simple swap with native” 为 108,434，“simple swap” 为 123,144 [9]。博客称原生 ETH 带来额外节省 [25]。

---

## Q2 Hook 机制

### 2.1 14 个权限位（地址低 14 位）

**答案**：PoolManager 不查注册表，直接看 hook 地址的低 14 位决定是否调用某个回调。位定义如下表 [2] `v4-core/src/libraries/Hooks.sol#L27-L47@46c6834`。

| 位 | 常量 | 含义 |
|---|---|---|
| 13 | BEFORE_INITIALIZE_FLAG | initialize 前调用 |
| 12 | AFTER_INITIALIZE_FLAG | initialize 后调用 |
| 11 | BEFORE_ADD_LIQUIDITY_FLAG | liquidityDelta > 0 时，在改头寸前调用 |
| 10 | AFTER_ADD_LIQUIDITY_FLAG | 加流动性后调用 |
| 9 | BEFORE_REMOVE_LIQUIDITY_FLAG | liquidityDelta ≤ 0 时，在改头寸前调用（注意 0 也算 remove） |
| 8 | AFTER_REMOVE_LIQUIDITY_FLAG | 减流动性后调用 |
| 7 | BEFORE_SWAP_FLAG | swap 前调用 |
| 6 | AFTER_SWAP_FLAG | swap 后调用 |
| 5 | BEFORE_DONATE_FLAG | donate 前调用 |
| 4 | AFTER_DONATE_FLAG | donate 后调用 |
| 3 | BEFORE_SWAP_RETURNS_DELTA_FLAG | beforeSwap 返回的 BeforeSwapDelta 生效 |
| 2 | AFTER_SWAP_RETURNS_DELTA_FLAG | afterSwap 返回的 int128 生效 |
| 1 | AFTER_ADD_LIQUIDITY_RETURNS_DELTA_FLAG | afterAddLiquidity 返回的 BalanceDelta 生效 |
| 0 | AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA_FLAG | afterRemoveLiquidity 返回的 BalanceDelta 生效 |

- “liquidityDelta ≤ 0 走 remove 分支”见 [2] `#L200-L204`。
- 官方文档列出同样的 10 个调用权限和 4 个 return-delta 权限 [21]。

### 2.2 地址有效性规则

**答案**：`isValidHookAddress(hooks, fee)` 有三条规则：
1. 4 个 return-delta 位各自要求对应的动作位也置位，否则地址无效。
2. `hooks == address(0)` 时，池子不能是动态费。
3. 非零 hook 地址至少要有 1 个标志位，或者池子是动态费池。

`initialize` 时若校验不过，revert `HookAddressNotValid`。

**依据**：[2] `#L109-L126`；[1] `#L126`。

**推论**：
- 一个零标志位的 hook 只要配动态费池，就是合法的。它可以完全不实现回调，只在外部周期性调用 `updateDynamicLPFee`（inferred，由 [2] `#L123-L125` 与 [1] `#L339-L346` 推出）。
- 校验只发生在 `initialize`，核心合约不检查 hook 的代码是否真的实现了这些回调。BaseHook 在构造函数里调 `validateHookPermissions`，校验“声明的权限 == 地址位”，这属于 hook 端的自检 [15] `uniswap-hooks/src/base/BaseHook.sol#L58-L61@e59fe72`。

### 2.3 CREATE2 挖地址（HookMiner）

**答案**：hook 必须部署到“低 14 位恰好等于所需标志”的地址上。做法是循环 salt，按 `keccak256(0xFF ++ deployer ++ salt ++ keccak256(initcode ++ args))` 计算地址，直到 `addr & 0x3FFF == flags` 且该地址无代码，再用 `new Hook{salt: salt}(...)` 部署。`forge script` 场景下，deployer 是 CREATE2 Deployer Proxy `0x4e59b448…956C`。

**依据**
- [12] `v4-periphery/test/shared/HookMiner.sol#L8-L41@9969eec`：`MAX_LOOP = 160_444`，同时检查 `code.length == 0`。
- template 部署脚本：[14] `v4-template/script/00_DeployHook.s.sol#L15-L30@1fbf955`。
- 官方文档 FAQ 给出同样流程，并提到测试里可以用 Foundry `deployCodeTo` 免挖 [21]。

**不确定之处**：官方文档链接的路径是 `v4-periphery/src/utils/HookMiner.sol` [21]，但在 periphery @9969eec 的文件树里，HookMiner 位于 `test/shared/`，`src/utils/` 下没有 [12]。template 仍然 import `@uniswap/v4-periphery/src/utils/HookMiner.sol`，应当解析到它依赖树中较旧的 periphery 版本。这一点未核实。

**推论**：要求 14 位全部匹配时，期望尝试次数约 2^14 = 16,384 次，`MAX_LOOP` 约为它的 9.8 倍（inferred）。

### 2.4 各回调签名、何时调用、能改什么

| 回调 | 签名返回 | 调用时机（PoolManager 中位置） | 能改什么 |
|---|---|---|---|
| beforeInitialize | `bytes4` | initialize 写 slot0 之前 [1] `#L130` | 只能 revert（拒绝建池），或记录状态 |
| afterInitialize | `bytes4` | 写入、emit 之后 [1] `#L141` | 动态费池可以在这里调 `updateDynamicLPFee` 设置非零初始费；否则初始费为 0 [5] `LPFeeLibrary.sol#L47-L56` |
| beforeAdd/RemoveLiquidity | `bytes4` | `pool.modifyLiquidity` 之前 [1] `#L156` | 只能 revert 或记录（准入控制在这里做） |
| afterAdd/RemoveLiquidity | `(bytes4, BalanceDelta)` | emit 之后 [1] `#L178` | 若有 *_RETURNS_DELTA 位：返回的 hookDelta 记到 hook 名下，`callerDelta = delta − hookDelta` [2] `#L208-L244` |
| beforeSwap | `(bytes4, BeforeSwapDelta, uint24)` | `_swap` 之前 [1] `#L202` | ①revert；②动态费池返回带 `0x400000` 标志的 lpFee，覆盖本次费率；③若有 BEFORE_SWAP_RETURNS_DELTA 位，用 specified delta 改写进入曲线的数量（不得翻转 exactIn/exactOut），unspecified delta 留到 afterSwap 统一结算 [2] `#L247-L281` |
| afterSwap | `(bytes4, int128)` | `_swap` 与 emit 之后 [1] `#L221` | 若有 AFTER_SWAP_RETURNS_DELTA 位，返回的 int128 加到 unspecified 一侧的 hookDelta 上，调用者对应少得或多付 [2] `#L284-L314` |
| before/afterDonate | `bytes4` | `pool.donate` 前后 [1] `#L266`、`#L275` | 只能 revert 或记录 |

**依据**：签名见 [3] `IHooks.sol#L21-L121`；返回值校验方面，`callHook` 要求返回值至少 32 字节且首 4 字节等于调用的 selector [2] `#L151-L153`，带 delta 的返回必须恰好 64 字节 [2] `#L165`，beforeSwap 必须恰好 96 字节 [2] `#L258`。

**sender 参数**：传给 hook 的 `sender` 是 PoolManager 的 `msg.sender`，即 router 或 PositionManager，**不是终端用户** [2] `#L179`、`#L201`、`#L255`。PositionManager 的头寸在 PoolManager 里的 owner 是 PositionManager 自己，salt 为 `bytes32(tokenId)` [11] `PositionManager.sol` `_mint/_increase/_decrease`。所以准入类 hook 要拿到真实用户，只能信任 router 暴露的 `msgSender()`（BaseActionsRouter 实现了 `IMsgSender` [10]），或者读 hookData。这是 inferred 结论，合规 lane 需要展开。

**自调用跳过**：如果 hook 自己就是 PoolManager 的调用者（例如 hook 在回调里自己发起 swap），那么 init、modifyLiquidity、swap、donate 的 hook 调用都会被跳过，避免递归 [2] `#L170-L174`、`#L216`、`#L252`、`#L292`。v4-core 有专门的 SkipCallsTest [9]。

### 2.5 BeforeSwapDelta 与 return delta 的记账

**答案**
- `BeforeSwapDelta` 是一个 int256：高 128 位是 specified 币种的 delta，低 128 位是 unspecified 币种的 delta [4] `BeforeSwapDelta.sol#L4-L16`。
- 符号从 **hook 的视角** 看：正数表示 hook 被欠或已拿走币，负数表示 hook 欠或已付出币 [3] `#L95-L102`。
- beforeSwap 的 specified delta 先加到 `amountToSwap` 上，然后才进入集中流动性曲线。如果 hook 返回的 delta 恰好吃掉全部输入，曲线计算实际上被跳过，这就是 “NoOp swap”，也是实现自定义曲线的入口 [2] `#L272-L278`；[24]。
- afterSwap 把 beforeSwap 的 unspecified delta 和 afterSwap 返回的 int128 相加。然后根据 `(amountSpecified < 0) == zeroForOne` 把 specified/unspecified 映射到 currency0/1，得到 `hookDelta`，再算 `swapDelta = swapDelta − hookDelta` [2] `#L294-L313`。
- PoolManager 把 `hookDelta` 记到 hook 地址名下，把 `swapDelta` 记到调用者名下 [1] `#L223-L226`。
- 因此 hook 自己的 delta 也必须在同一次 unlock 内结清：hook 在回调里调 `take/settle/mint/burn`，否则整笔交易会因 `NonzeroDeltaCount ≠ 0` 而 revert（inferred，由 [1] `#L112` 与 `#L224` 推出）。

**不确定之处**：v4-core 快照 `CustomAccountingTest` 给出 “swap CA custom curve + swap noop” 124,402 gas、“swap CA fee on unspecified” 154,572 gas [9]。它们只能说明自定义记账可行，不能当作通用开销。

### 2.6 hookData

**答案**：`hookData` 是调用者交给 PoolManager 的任意 bytes，原样转给 before/after 的 modifyLiquidity、swap、donate 回调。`initialize` 没有 hookData。PoolManager 不解释它的内容。V4Router 的多跳路径允许每一跳的 `PathKey` 带独立的 hookData。

**依据**：[1] `#L145`、`#L187`、`#L256` 的签名；[3] 中 hookData 参数注释为 “Arbitrary data handed into the PoolManager by the swapper to be be passed on to the hook”；[10] V4Router `#L119-L120` 中的 `pathKey.hookData`。

**不确定之处**：template 的 `initializePool` 调用多编码了一个 hookData 参数 [14] `01_CreatePoolAndAddLiquidity.s.sol`，但 `PoolInitializer_v4.initializePool(key, sqrtPriceX96)` 只接收两个参数 [11]。多余的 calldata 会被忽略，`initialize` 也确实不会把它传给 hook（inferred）。

### 2.7 动态手续费

**答案**：只有 `PoolKey.fee == 0x800000`（DYNAMIC_FEE_FLAG）的池子才是动态费池，这个属性在建池时确定、之后不可改。改费有两条路径：
- **持久修改**：hook（且只能是该池的 hook）随时调用 `updateDynamicLPFee(key, fee)` 写 slot0。这个函数**不需要 unlock**。
- **单次覆盖**：beforeSwap 返回 `fee | 0x400000`（OVERRIDE_FEE_FLAG），只对本次 swap 生效，不写 storage。

费率单位是百分之一 bip（pips），上限 1,000,000 = 100%。动态费池的初始费为 0。

**依据**
- [5] `LPFeeLibrary.sol#L15`（`0x800000`）、`#L19`（`0x400000`）、`#L25`（`MAX_LP_FEE = 1000000`）、`#L51-L56`（初始费为 0）。
- [1] `updateDynamicLPFee` `#L339-L346`：要求 `isDynamicFee` 且 `msg.sender == key.hooks`，没有 `onlyWhenUnlocked`。
- [8] `Pool.swap`：`lpFeeOverride.isOverride()` 时才使用覆盖值，并去掉标志位后校验；否则读 slot0。若总 swapFee ≥ 100% 且为 exactOut，则 revert `InvalidFeeForExactOut`。
- [20] 官方文档：动态费属性不可变，有“周期性 updateDynamicLPFee”和“beforeSwap 逐笔返回”两种方式。

**不确定之处**：[20] 的图文说 “beforeSwap hook … calls the updateDynamicLPFee function”，这把两条路径混在了一起。代码里两种都能用：在 beforeSwap 里调 `updateDynamicLPFee` 是一次持久的 storage 写入，返回覆盖标志则不写 storage。快照显示 “swap with dynamic fee” 139,153 gas、“update dynamic fee in before swap” 147,743 gas [9]，两者差约 8.6k，与多一次 storage 写入的量级相符（inferred）。

### 2.8 hook 能否更换、能否升级

**答案**
- **能否更换**：不能。hook 地址在 PoolKey 里，PoolId 是 key 的哈希，换 hook 就等于换一个新池子 [6]；官方 FAQ 写明 hook 不能添加、移除或替换 [21]。
- **能否升级**：取决于 hook 合约本身。核心合约只看地址位，不看代码。如果 hook 是代理合约（代理部署在挖出的地址上），实现合约可以被换掉。Uniswap 安全框架把 upgradeability 列为单独的风险维度，建议优先不可变；确实需要升级时，用标准 UUPS/Transparent 代理加 multisig/timelock，或者“发新版 hook 让池子自愿迁移”[24]。

**不确定之处**：BaseHook 在构造函数里校验的是 `address(this)`。如果用代理，实现合约的构造函数校验的是实现合约自己的地址，而不是代理地址，所以 BaseHook 的自检对代理部署不成立。这是由 [15] 推出的 speculative 判断，没有找到官方说明。

---

## Q3 一个简单 hook 的完整生命周期：v4-template 的 Counter

选用 `Uniswap/v4-template @1fbf955` 的 `src/Counter.sol`：权限为 beforeSwap、afterSwap、beforeAddLiquidity、beforeRemoveLiquidity，各自只把计数加 1，不返回 delta，费率为静态 0.30%。这是官方文档推荐的起手模板 [21]。

### 3.1 编写

- 继承 OpenZeppelin `BaseHook`。BaseHook 提供 `onlyPoolManager` 修饰的外部入口，以及默认 revert `HookNotImplemented` 的 `_beforeSwap` 等内部函数 [15] `#L66-L69`。
- 子类覆盖 `getHookPermissions()` 和需要的 `_xxx` 函数 [14] `Counter.sol#L29-L46`、`#L52-L86`。
- 状态按 `PoolId` 分桶，因为一个 hook 可以服务多个池子 [14] `#L16-L25`。

### 3.2 挖地址并部署

- `flags = BEFORE_SWAP | AFTER_SWAP | BEFORE_ADD_LIQUIDITY | BEFORE_REMOVE_LIQUIDITY = 0x80 | 0x40 | 0x800 | 0x200 = 0x0AC0`。
- 用 `HookMiner.find(CREATE2_FACTORY, flags, creationCode, abi.encode(poolManager))` 求 salt，再 `new Counter{salt}(poolManager)`，最后断言实际地址等于挖出的地址 [14] `00_DeployHook.s.sol#L15-L30`。
- 构造函数里 `validateHookAddress(this)` 校验权限声明与地址位一致，不一致就部署失败 [15] `#L58-L61`；[2] `#L83-L103`。

### 3.3 initialize 池

- 脚本构造 `PoolKey{c0, c1, 3000, 60, hook}`，通过 `positionManager.multicall([initializePool, modifyLiquidities])` 在一笔交易里原子地完成建池和加流动性 [14] `01_CreatePoolAndAddLiquidity.s.sol`。
- `PositionManager.initializePool` → `PoolManager.initialize`（不需要 unlock）。依次校验 hook 地址；Counter 没有 init 位，所以 `beforeInitialize/afterInitialize` 都跳过；写 slot0，费率为 3000 pips = 0.30% [1] `#L117-L142`。
- **delta**：无。
- `initializePool` 用 try/catch 包住 `initialize`。如果池子已被别人初始化，它返回 `type(int24).max` 而不是 revert [11] `PoolInitializer_v4.sol`。所以别人抢先用怪异价格初始化时，multicall 会继续以那个价格加流动性，只靠 `amount0Max/amount1Max` 兜底（inferred）。

### 3.4 加流动性（PositionManager）

1. 用户 → `PositionManager.modifyLiquidities(abi.encode(actions, params), deadline)` → `poolManager.unlock(data)` [10] `BaseActionsRouter.sol#L25-L27`。
2. PoolManager 置锁位，回调 `PositionManager.unlockCallback`，后者按 actions 依次执行 `MINT_POSITION, SETTLE_PAIR, SWEEP, SWEEP` [14] `LiquidityHelpers.sol`；[10] `BaseActionsRouter.sol#L32-L37`。
3. `MINT_POSITION`：铸 ERC-721 → `poolManager.modifyLiquidity(key, {tickLower, tickUpper, +L, salt=tokenId}, hookData)` [11]。
4. PoolManager：`beforeModifyLiquidity` → 调用 Counter 的 `beforeAddLiquidity`（sender = PositionManager），计数 +1 → `Pool.modifyLiquidity` 算出本金 delta → `afterModifyLiquidity`（Counter 没有该位，跳过）→ `_accountPoolBalanceDelta(callerDelta, PositionManager)` [1] `#L145-L184`。
5. **delta**：PositionManager 的 c0、c1 delta 都变为负值（欠池子），`NonzeroDeltaCount = 2`。
6. `SETTLE_PAIR`：对每个币种执行 `sync` → `permit2.transferFrom(user → PoolManager)` → `settle()`，delta 回到 0，计数归 0 [11] `_settlePair/_pay`；[10] `DeltaResolver.sol#L38-L48`。
7. 回到 `unlock`：计数为 0，上锁，交易成功 [1] `#L112-L113`。

### 3.5 swap（router → unlock → callback → swap → beforeSwap → 计算 → afterSwap → settle/take）

以 exactIn 1e18 的 token0 → token1、zeroForOne 为例，按 V4Router 的 `SWAP_EXACT_IN_SINGLE + SETTLE_ALL + TAKE_ALL` 走。template 脚本用的是 hookmate 的 `UniswapV4Router04` [14]，其内部实现本 lane 未读，但流程同构。

1. 用户 → Router → `poolManager.unlock(data)` → `Router.unlockCallback`。
2. Router → `poolManager.swap(key, {zeroForOne: true, amountSpecified: -1e18, sqrtPriceLimit: MIN+1}, hookData)` [10] V4Router `_swap`。
3. PoolManager：`amountSpecified ≠ 0`，池子已初始化 → `Hooks.beforeSwap` → `Counter.beforeSwap(sender=Router, …)`，`beforeSwapCount++`，返回 `(selector, ZERO_DELTA, 0)`。因为不是动态费池，忽略 fee；因为没有 return-delta 位，`amountToSwap` 保持 -1e18 [2] `#L247-L281`。
4. `_swap` → `Pool.swap`：沿 tick 逐步计算，扣 LP 费 0.30%（协议费默认为 0），得到 `swapDelta = (-1e18, +out)` [8]；emit Swap [1] `#L230-L253`。
5. `Hooks.afterSwap` → `Counter.afterSwap`，`afterSwapCount++`，返回 `(selector, 0)`。`hookDelta = 0`，`swapDelta` 不变 [2] `#L284-L314`。
6. `_accountPoolBalanceDelta(swapDelta, Router)`：Router 的 c0 delta = -1e18，c1 delta = +out，计数 = 2 [1] `#L226`。
7. `SETTLE_ALL(c0)`：`_getFullDebt` = 1e18 → `sync` → 从用户 transferFrom 到 PoolManager → `settle`，c0 delta 归 0 [10] `V4Router.sol#L55-L60`。
8. `TAKE_ALL(c1, minOut)`：`_getFullCredit` = out，检查 out ≥ minOut → `take(c1, user, out)`，c1 delta 归 0 [10] `#L61-L66`。
9. 回到 `unlock`：计数为 0，上锁。

### 3.6 移除流动性

- `DECREASE_LIQUIDITY`（或 `BURN_POSITION`）+ `TAKE_PAIR`：`modifyLiquidity(-L)` → Counter 的 `beforeRemoveLiquidity` 计数 +1 → PositionManager 的 delta 变为正值（本金 + 累积手续费）→ `TAKE_PAIR` 把两个币转给接收者，delta 归 0 [11] `_decrease/_burn/_takePair`；[1] `#L145-L184`。
- 注意：`liquidityDelta == 0` 的 “poke”（只领手续费）也会走 remove 分支，触发 `beforeRemoveLiquidity` [2] `#L202`。

**不确定之处**：Counter 不改任何经济参数，所以它的 lifecycle 体现不出 return delta 的结清路径。带 return delta 的例子（如 hook 收费，需要 hook 在回调里 `take` 或 `mint` 结清）放在 2.5 节，用推理说明。

---

## Q4 gas：v4 相对 v3

**答案**
- **建池**：v4 `initialize` 51,532 gas [9]，v3 `createPool` 4,557,092 gas [16]，下降约 98.9%。官方博客的说法是“up to 99.99% cheaper”[25]，2023 年愿景博客写的是“reduces pool creation gas costs by 99%”[26]。
- **多跳**：v4 每多一跳约 +57.5k gas（V4Router ExactIn 1→2→3 跳：136,190 / 193,652 / 251,141）[13]；v3 约 +64.7k（exactInput 1 跳 107,759，2 跳 172,498）[17]。
- **单跳绝对值不可直接比较**：v3 是 Hardhat 交易收据（含 21k intrinsic），v4 是 forge 快照。
- **hook 回调开销**：官方没有单列。

**依据与口径**
- v4：v4-core `snapshots/PoolManagerInitializeTest.json`、`PoolManagerTest.json` [9]；v4-periphery `snapshots/V4RouterTest.json` [13]。
- v3：`v3-core/test/__snapshots__/UniswapV3Factory.spec.ts.snap@d8b1c63`（`#createPool gas` = 4,557,092）[16]；`v3-periphery/test/__snapshots__/SwapRouter.gas.spec.ts.snap@51f8871` [17]。
- hook 额外开销的间接数据：v4-core 中 “simple swap” 123,144 vs “swap with hooks” 132,165（差 +9,021）[9]。两个测试的 hook 配置和池状态未逐一核对，这个差值只能当量级参考（speculative）。

**机制解释（inferred）**
- 每个启用的回调都是一次外部 CALL。要 ABI 编码 `sender + PoolKey(5 字段) + params + hookData`；冷地址首次访问 2,600 gas（EIP-2929），之后 100 gas；hook 内部逻辑另计。
- Counter 每次回调做一次 `mapping++`：首次为 0→非 0 的 SSTORE（约 22.1k），之后约 5k（EIP-2200/2929）。所以 Counter 第一次 swap 要额外多花约 4.4 万 gas，之后每次约 1 万。
- 结论：hook 开销主要由 hook 自己的 storage 写入决定，调用框架本身的开销是千级 gas。

**不确定之处**：“多跳更省”的官方说法 [25] 与上面的边际数据方向一致，但两套测试的 token 数量、冷热状态、计费方式都不同，差值（约 7k/跳）不宜当作精确结论。需要同一链、同一 fork、同一 router 做 A/B 才能定量（开放问题 2）。

---

## 图的素材

**A. v4 架构关系（组件图）**
- 用户 EOA → Router（V4Router / UniversalRouter / hookmate Router04）或 PositionManager（ERC-721 头寸）[10][11]
- Router / PositionManager → PoolManager.unlock → 回调 `unlockCallback` [1] `#L104-L114`
- PoolManager 内部：`_pools[PoolId]`（Pool.State：slot0、liquidity、ticks、positions）[1][8]；transient：Lock、CurrencyDelta、NonzeroDeltaCount、SyncedCurrency [7]；ERC-6909 余额 [1]
- PoolManager → Hook 合约（地址低 14 位 = 权限），在固定点位 CALL [2]
- Hook → PoolManager：可回调 `take/settle/mint/burn/swap`（锁打开时）以及 `updateDynamicLPFee`（任何时候）[1]

**B. 一次 swap 的时序（参与者：User、Router、PoolManager、Hook、Pool 库、Token0、Token1）**
1. User → Router: swapExactIn
2. Router → PoolManager: unlock(data) ｜ PoolManager: tstore(UNLOCKED = true)
3. PoolManager → Router: unlockCallback(data)
4. Router → PoolManager: swap(key, params, hookData)
5. PoolManager → Hook: beforeSwap(sender=Router) → 返回 (selector, BeforeSwapDelta, lpFeeOverride)
6. PoolManager → Pool.swap(amountToSwap, lpFeeOverride) → swapDelta
7. PoolManager → Hook: afterSwap(swapDelta) → 返回 (selector, int128)
8. PoolManager: 记 hookDelta 到 Hook、swapDelta 到 Router（transient）
9. Router → PoolManager: sync(token0) → Token0.transferFrom(User → PoolManager) → settle()
10. Router → PoolManager: take(token1, User, out) → Token1.transfer(PoolManager → User)
11. 回到 unlock：require(NonzeroDeltaCount == 0) → tstore(UNLOCKED = false)

来源：[1] `#L104-L114`、`#L187-L227`；[2] `#L247-L314`；[10]

**C. hook 生命周期状态机**
- `未部署` →[HookMiner 找 salt + CREATE2；构造函数 validateHookPermissions]→ `已部署（地址位固定）`[12][15]
- `已部署` →[PoolManager.initialize(key with hooks)：isValidHookAddress → beforeInitialize → 写 slot0 → afterInitialize]→ `已绑定到池`（可重复绑定多个池）[1][21]
- `已绑定` ⇄ 交易态：add/remove liquidity（before/after*）、swap（before/after）、donate（before/after）[1]
- 动态费池：任何时刻 hook → updateDynamicLPFee [1] `#L339-L346`
- 终态：hook 永远不能从池上卸下；“换 hook”= 建新池 [21]

**D. delta 状态（单币种、单调用者）**
- 0 →[swap 输入 / add liquidity / donate / mint 6909 / take]→ 负（欠池）[1]
- 0 →[swap 输出 / remove liquidity / burn 6909 / settle 多付]→ 正（池欠）[1]
- 负 →[sync + 转账 + settle，或 burn 6909]→ 0；正 →[take，或 mint 6909，或 clear]→ 0 [1]
- unlock 结束条件：所有 (地址, 币种) 都为 0 [1] `#L112`

**E. v3 vs v4 对比维度**

| 维度 | v3 | v4 | 来源 |
|---|---|---|---|
| 池子形态 | 每池一个合约（Factory 部署） | 单例中的一个 mapping 项 | [1][23] |
| 建池 gas | 4,557,092（Hardhat） | 51,532（forge） | [16][9] |
| 多跳中间 token 转账 | 每跳一次 transfer | 无，只在两端结清 | [18][10] |
| 边际一跳 gas | ≈64.7k | ≈57.5k | [17][13]（口径不同） |
| 费率 | 固定档位 | 任意静态费，或动态费（0x800000） | [5][20] |
| 原生 ETH | 需 WETH | address(0) 直接结算 | [1] |
| 扩展点 | 无（oracle 内置） | 10 个回调 + 4 个 return delta | [2][26] |
| 依赖 | — | EIP-1153（Cancun） | [7][27] |

---

## 代码素材

**1. unlock 与结清检查**：`Uniswap/v4-core/src/PoolManager.sol#L104-L113@46c6834`
```solidity
function unlock(bytes calldata data) external override returns (bytes memory result) {
    if (Lock.isUnlocked()) AlreadyUnlocked.selector.revertWith();
    Lock.unlock();
    // the caller does everything in this callback, including paying what they owe via calls to settle
    result = IUnlockCallback(msg.sender).unlockCallback(data);
    if (NonzeroDeltaCount.read() != 0) CurrencyNotSettled.selector.revertWith();
    Lock.lock();
}
```

**2. 权限位**：`Uniswap/v4-core/src/libraries/Hooks.sol#L27-L47@46c6834`
```solidity
uint160 internal constant ALL_HOOK_MASK = uint160((1 << 14) - 1);
uint160 internal constant BEFORE_INITIALIZE_FLAG = 1 << 13;
uint160 internal constant AFTER_INITIALIZE_FLAG = 1 << 12;
uint160 internal constant BEFORE_ADD_LIQUIDITY_FLAG = 1 << 11;
uint160 internal constant AFTER_ADD_LIQUIDITY_FLAG = 1 << 10;
uint160 internal constant BEFORE_REMOVE_LIQUIDITY_FLAG = 1 << 9;
uint160 internal constant AFTER_REMOVE_LIQUIDITY_FLAG = 1 << 8;
uint160 internal constant BEFORE_SWAP_FLAG = 1 << 7;
uint160 internal constant AFTER_SWAP_FLAG = 1 << 6;
uint160 internal constant BEFORE_DONATE_FLAG = 1 << 5;
uint160 internal constant AFTER_DONATE_FLAG = 1 << 4;
uint160 internal constant BEFORE_SWAP_RETURNS_DELTA_FLAG = 1 << 3;
uint160 internal constant AFTER_SWAP_RETURNS_DELTA_FLAG = 1 << 2;
uint160 internal constant AFTER_ADD_LIQUIDITY_RETURNS_DELTA_FLAG = 1 << 1;
uint160 internal constant AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA_FLAG = 1 << 0;
```

**3. 回调签名（节选）**：`Uniswap/v4-core/src/interfaces/IHooks.sol#L103-L121@46c6834`
```solidity
function beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)
    external
    returns (bytes4, BeforeSwapDelta, uint24);

function afterSwap(
    address sender,
    PoolKey calldata key,
    SwapParams calldata params,
    BalanceDelta delta,
    bytes calldata hookData
) external returns (bytes4, int128);
```

**4. beforeSwap 的费率覆盖与 specified delta**：`Uniswap/v4-core/src/libraries/Hooks.sol#L254-L279@46c6834`（节选，删去注释）
```solidity
if (self.hasPermission(BEFORE_SWAP_FLAG)) {
    bytes memory result = callHook(self, abi.encodeCall(IHooks.beforeSwap, (msg.sender, key, params, hookData)));
    if (result.length != 96) InvalidHookResponse.selector.revertWith();
    if (key.fee.isDynamicFee()) lpFeeOverride = result.parseFee();
    if (self.hasPermission(BEFORE_SWAP_RETURNS_DELTA_FLAG)) {
        hookReturn = BeforeSwapDelta.wrap(result.parseReturnDelta());
        int128 hookDeltaSpecified = hookReturn.getSpecifiedDelta();
        if (hookDeltaSpecified != 0) {
            bool exactInput = amountToSwap < 0;
            amountToSwap += hookDeltaSpecified;
            if (exactInput ? amountToSwap > 0 : amountToSwap < 0) {
                HookDeltaExceedsSwapAmount.selector.revertWith();
            }
        }
    }
}
```

**5. afterSwap 合并 hookDelta 并从调用者扣除**：`Uniswap/v4-core/src/libraries/Hooks.sol#L294-L313@46c6834`
```solidity
int128 hookDeltaSpecified = beforeSwapHookReturn.getSpecifiedDelta();
int128 hookDeltaUnspecified = beforeSwapHookReturn.getUnspecifiedDelta();
if (self.hasPermission(AFTER_SWAP_FLAG)) {
    hookDeltaUnspecified += self.callHookWithReturnDelta(
        abi.encodeCall(IHooks.afterSwap, (msg.sender, key, params, swapDelta, hookData)),
        self.hasPermission(AFTER_SWAP_RETURNS_DELTA_FLAG)
    ).toInt128();
}
BalanceDelta hookDelta;
if (hookDeltaUnspecified != 0 || hookDeltaSpecified != 0) {
    hookDelta = (params.amountSpecified < 0 == params.zeroForOne)
        ? toBalanceDelta(hookDeltaSpecified, hookDeltaUnspecified)
        : toBalanceDelta(hookDeltaUnspecified, hookDeltaSpecified);
    // the caller has to pay for (or receive) the hook's delta
    swapDelta = swapDelta - hookDelta;
}
return (swapDelta, hookDelta);
```

**6. PoolManager.swap 主干**：`Uniswap/v4-core/src/PoolManager.sol#L198-L226@46c6834`（节选）
```solidity
BeforeSwapDelta beforeSwapDelta;
{
    int256 amountToSwap;
    uint24 lpFeeOverride;
    (amountToSwap, beforeSwapDelta, lpFeeOverride) = key.hooks.beforeSwap(key, params, hookData);
    swapDelta = _swap(pool, id, Pool.SwapParams({ tickSpacing: key.tickSpacing, zeroForOne: params.zeroForOne,
        amountSpecified: amountToSwap, sqrtPriceLimitX96: params.sqrtPriceLimitX96, lpFeeOverride: lpFeeOverride }),
        params.zeroForOne ? key.currency0 : key.currency1);
}
BalanceDelta hookDelta;
(swapDelta, hookDelta) = key.hooks.afterSwap(key, params, swapDelta, hookData, beforeSwapDelta);
if (hookDelta != BalanceDeltaLibrary.ZERO_DELTA) _accountPoolBalanceDelta(key, hookDelta, address(key.hooks));
_accountPoolBalanceDelta(key, swapDelta, msg.sender);
```

**7. 最小 hook（Counter）**：`Uniswap/v4-template/src/Counter.sol#L52-L68@1fbf955`
```solidity
function _beforeSwap(address, PoolKey calldata key, SwapParams calldata, bytes calldata)
    internal
    override
    returns (bytes4, BeforeSwapDelta, uint24)
{
    beforeSwapCount[key.toId()]++;
    return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
}

function _afterSwap(address, PoolKey calldata key, SwapParams calldata, BalanceDelta, bytes calldata)
    internal
    override
    returns (bytes4, int128)
{
    afterSwapCount[key.toId()]++;
    return (BaseHook.afterSwap.selector, 0);
}
```

**8. 挖地址并部署**：`Uniswap/v4-template/script/00_DeployHook.s.sol#L15-L30@1fbf955`
```solidity
uint160 flags = uint160(
    Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG
        | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
);
bytes memory constructorArgs = abi.encode(poolManager);
(address hookAddress, bytes32 salt) =
    HookMiner.find(CREATE2_FACTORY, flags, type(Counter).creationCode, constructorArgs);
vm.startBroadcast();
Counter counter = new Counter{salt: salt}(poolManager);
vm.stopBroadcast();
require(address(counter) == hookAddress, "DeployHookScript: Hook Address Mismatch");
```

**9. 标准结清**：`Uniswap/v4-periphery/src/base/DeltaResolver.sol#L38-L48@9969eec`
```solidity
function _settle(Currency currency, address payer, uint256 amount) internal {
    if (amount == 0) return;
    poolManager.sync(currency);
    if (currency.isAddressZero()) {
        poolManager.settle{value: amount}();
    } else {
        _pay(currency, payer, amount);
        poolManager.settle();
    }
}
```

---

## 来源

1. **PRIMARY** Uniswap/v4-core @ `46c6834698c48bc4a463a86d8420f4eb1d7f3b75` `src/PoolManager.sol`。证明了单例 `_pools` 映射；unlock/lock 与 `CurrencyNotSettled` 检查；`initialize` 无需 unlock；modifyLiquidity/swap/donate 的 hook 调用顺序；sync/settle/take/clear/mint/burn 的 delta 方向；`updateDynamicLPFee` 只能由该池 hook 调用且无需 unlock。
2. **PRIMARY** 同上 `src/libraries/Hooks.sol`。证明了 14 个标志位的位置；地址有效性规则；selector 与返回长度校验；自调用跳过；beforeSwap 费率覆盖与 specified delta；afterSwap 合并 hookDelta 并从调用者扣除；afterModifyLiquidity 的 return delta。
3. **PRIMARY** 同上 `src/interfaces/IHooks.sol`。证明了 10 个回调的完整签名与返回类型，以及 delta 符号约定（hook 视角：正 = hook 被欠或已拿走）。
4. **PRIMARY** 同上 `src/types/BeforeSwapDelta.sol`。证明了高 128 位为 specified、低 128 位为 unspecified 的打包方式。
5. **PRIMARY** 同上 `src/libraries/LPFeeLibrary.sol`。证明了 `DYNAMIC_FEE_FLAG = 0x800000`、`OVERRIDE_FEE_FLAG = 0x400000`、`MAX_LP_FEE = 1,000,000` pips、动态费池初始费为 0。
6. **PRIMARY** 同上 `src/types/PoolKey.sol`。证明了 PoolKey 的五个字段，hooks 是池子身份的一部分。
7. **PRIMARY** 同上 `src/libraries/Lock.sol`、`CurrencyDelta.sol`、`NonzeroDeltaCount.sol`。证明了锁、delta、非零计数都存在 transient storage（tstore/tload）中，delta 按 (target, currency) 分槽。
8. **PRIMARY** 同上 `src/libraries/Pool.sol`。证明了 `lpFeeOverride` 只在带 override 标志时生效；100% 费率下 exactOut 会 revert；donate 要求流动性 > 0 并累加 feeGrowthGlobal；swapDelta 的构造方式。
9. **PRIMARY** 同上 `snapshots/PoolManagerInitializeTest.json`、`PoolManagerTest.json`、`TestDynamicFees.json`、`CustomAccountingTest.json`、`SkipCallsTest.json`。给出 v4-core 的 forge gas 快照：initialize 51,532；simple swap 123,144；swap with hooks 132,165；native swap 108,434；动态费 139,153 / 147,743；自定义记账 124,402 / 154,572。
10. **PRIMARY** Uniswap/v4-periphery @ `9969eec44cfdf07e24b41de47f40276a58401976` `src/V4Router.sol`、`src/base/BaseActionsRouter.sol`、`src/base/DeltaResolver.sol`。证明了 router 的 unlock → actions 执行模型；多跳不做中间转账；SETTLE_ALL / TAKE_ALL 的滑点检查；per-hop hookData；标准 sync → pay → settle 流程。
11. **PRIMARY** 同上 `src/PositionManager.sol`、`src/base/PoolInitializer_v4.sol`。证明了头寸在 PoolManager 中以 PositionManager 为 owner、tokenId 为 salt；MINT_POSITION / SETTLE_PAIR / TAKE_PAIR 流程；`initializePool` 以 try/catch 吞掉“已初始化”错误。
12. **PRIMARY** 同上 `test/shared/HookMiner.sol`。证明了 CREATE2 挖地址算法、FLAG_MASK 为低 14 位、`MAX_LOOP = 160,444`，以及该文件当前位于 test/shared。
13. **PRIMARY** 同上 `snapshots/V4RouterTest.json`、`PosMGasTest.json`。给出 V4Router 1/2/3 跳 exactIn 分别为 136,190 / 193,652 / 251,141 gas；`multicall_initialize_mint` 为 461,635 gas。
14. **PRIMARY** Uniswap/v4-template @ `1fbf95547791f0821a170b88c750cb2e04e6818b` `src/Counter.sol`、`script/00_DeployHook.s.sol`、`01_CreatePoolAndAddLiquidity.s.sol`、`03_Swap.s.sol`、`script/base/LiquidityHelpers.sol`、`BaseScript.sol`。证明了最小 hook 的写法，以及挖地址 → multicall 建池加流动性 → swap 的完整脚本流程。
15. **PRIMARY** OpenZeppelin/uniswap-hooks @ `e59fe72c110c3862eec9b332530dce49ca506bbb` `src/base/BaseHook.sol`。证明了构造函数里的 `validateHookAddress`、`onlyPoolManager`，以及未实现回调默认 revert `HookNotImplemented`。
16. **PRIMARY** Uniswap/v3-core @ `d8b1c635c275d2a9450bd6a78f3fa2484fef73eb` `test/__snapshots__/UniswapV3Factory.spec.ts.snap`。证明了 v3 `createPool` 为 4,557,092 gas（Hardhat 快照）。
17. **PRIMARY** Uniswap/v3-periphery @ `51f8871aaef2263c8e8bbf4f3410880b6162cdea` `test/__snapshots__/SwapRouter.gas.spec.ts.snap`。证明了 v3 exactInput 1 跳 107,759、2 跳 172,498 gas。
18. **PRIMARY** Uniswap 文档 Flash Accounting（docs.uniswap.org/contracts/v4/concepts/flash-accounting → /docs/protocols/v4/concepts/flash-accounting，访问于 2026-10-06）。证明了 delta 模型、unlock 内可执行的 8 种操作、initialize 无需 unlock、多跳只需两次转账。
19. **PRIMARY** Uniswap 文档 ERC-6909（访问于 2026-10-06）。证明了 claim 机制与适用场景。
20. **PRIMARY** Uniswap 文档 Dynamic Fees（访问于 2026-10-06）。证明了动态费属性在建池时确定且不可变，有 updateDynamicLPFee 与 beforeSwap 返回两种更新方式（图文对两者有混写）。
21. **PRIMARY** Uniswap 文档 Hooks 概念页及 FAQ（访问于 2026-10-06）。证明了一池一 hook、一个 hook 可服务多池；权限编码在地址里；HookMiner 用法；hook 不能添加、移除或替换；测试可用 deployCodeTo。
22. **PRIMARY** Uniswap 文档 Unlock Callback & Deltas（访问于 2026-10-06）。证明了 delta 符号约定、9 种操作的分类，以及 LiquidityAmounts 预估与实际 delta 的差异风险。
23. **PRIMARY** Uniswap 文档 PoolManager（访问于 2026-10-06）。证明了单例取代 v3 Factory 模式，以及 swap / modifyLiquidity 的执行步骤。
24. **PRIMARY** Uniswap 文档 Security Framework（访问于 2026-10-06）。证明了官方对 upgradeability、BeforeSwapDelta / NoOp、transient delta 风险的定性与建议。
25. **PRIMARY** Uniswap Labs 博客《Uniswap v4 is Here》（blog.uniswap.org/uniswap-v4-is-here，访问于 2026-10-06；页面正文未显示日期）。证明了“建池 up to 99.99% cheaper”、多跳与原生 ETH 节省、9 次审计、上线时 150+ hook、10 条链。
26. **PRIMARY** Uniswap Labs 博客《Our Vision for Uniswap v4》（blog.uniswap.org/uniswap-v4，访问于 2026-10-06）。证明了早期估计建池 gas 降 99%、flash accounting 依赖 EIP-1153、核心不可升级、hook 权限在建池时确定。
27. **PRIMARY** EIP-1153（eips.ethereum.org/EIPS/eip-1153，访问于 2026-10-06）。证明了 TLOAD/TSTORE 各 100 gas、交易结束清空、revert 时回滚；测试归在 Cancun。

---

## 开放问题

1. hookmate `UniswapV4Router04`（template 脚本实际使用的 router）的 settle/take 实现，以及它向 hook 暴露真实用户的方式，本 lane 未读源码。
2. 想在同一 fork、同一代币对上做 v3 SwapRouter 与 v4 V4Router/UniversalRouter 的 A/B gas 对比（单跳、2 跳、3 跳、原生 ETH），需要自行跑 forge 测试；现有快照口径不一致。
3. v4-core “swap with hooks” 测试使用的 hook 配置（启用了哪些位、是否写 storage）没有核对，因此“每个回调的框架开销”仍没有官方数字。
4. HookMiner 从 `src/utils` 移到 `test/shared` 的 commit 和原因；官方文档链接是否已失效。
5. 代理式 hook 的地址位校验应当在代理侧怎么做（BaseHook 的自检对代理不成立），有没有官方或 OZ 的推荐模式？
6. 目标链（如 Mantle）是否支持 EIP-1153 与 Solidity 0.8.26 字节码，以及 v4 是否已部署，交给“对 Mantle 的意义”lane 核查。

---

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| M1 | v4 所有池子存于单个 PoolManager 合约的 `mapping(PoolId => Pool.State)`，建池不部署新合约 | [1] PoolManager.sol#L93@46c6834；[23] 文档 PoolManager 页 | observed | |
| M2 | 池子由 PoolKey{currency0, currency1, fee, tickSpacing, hooks} 唯一确定，hook 地址是池子身份的一部分 | [6] PoolKey.sol#L11-L22@46c6834 | observed | |
| M3 | `initialize` 不需要先 unlock，会校验 tickSpacing、币种排序与 hook 地址有效性 | [1] PoolManager.sol#L117-L142（无 onlyWhenUnlocked）；[18] 文档原文 | observed | |
| M4 | `unlock` 回调调用者的 `unlockCallback`，返回后若 NonzeroDeltaCount≠0 则 revert CurrencyNotSettled | [1] PoolManager.sol#L104-L114 | observed | |
| M5 | 锁状态、币种 delta、非零 delta 计数都存在 transient storage（tstore/tload）中 | [7] Lock.sol#L8-L15、CurrencyDelta.sol#L28-L41、NonzeroDeltaCount.sol | observed | |
| M6 | EIP-1153 的 TLOAD/TSTORE 各 100 gas，交易结束清空，属于 Cancun 升级 | [27] eips.ethereum.org/EIPS/eip-1153（2026-10-06） | observed | |
| M7 | v4 核心合约要求链支持 EIP-1153，否则无法运行 | 由 M5、M6 推出：核心路径直接使用 tstore/tload 操作码 | inferred | |
| M8 | 对调用者而言，正 delta 表示 PoolManager 欠调用者，负 delta 表示调用者欠 PoolManager | [3] IHooks.sol#L107-L121 注释；[22] 文档 Unlock Callback & Deltas | observed | |
| M9 | ERC-20 结清顺序是 sync → 转账进 PoolManager → settle，PoolManager 以余额差记正 delta | [1] PoolManager.sol#L279-L288、#L349-L365；[10] DeltaResolver.sol#L38-L48@9969eec | observed | |
| M10 | 原生 ETH 以 address(0) 表示，settle 时按 msg.value 记账，不需要 WETH | [1] PoolManager.sol#L353-L354 | observed | |
| M11 | ERC-6909 `mint` 给调用者记负 delta 并铸 claim，`burn` 烧 claim 并记正 delta | [1] PoolManager.sol#L322-L336；[19] 文档 ERC-6909 | observed | |
| M12 | `clear` 只能放弃与当前正 delta 精确相等的数额 | [1] PoolManager.sol#L310-L319 | observed | |
| M13 | donate 把金额计入在区间内 LP 的 feeGrowthGlobal，流动性为 0 时 revert | [8] Pool.sol donate()；[1] PoolManager.sol#L256-L276 | observed | |
| M14 | 多跳 swap 中间币种不发生 ERC-20 转账，只在输入和输出两端结清 | [18] 文档 flash accounting；[10] V4Router.sol#L115-L130@9969eec | observed | |
| M15 | hook 权限由地址低 14 位决定：bit13..bit4 为 10 个动作位，bit3..bit0 为 4 个 return-delta 位 | [2] Hooks.sol#L27-L47@46c6834；[21] 文档 Hooks FAQ | observed | |
| M16 | 任一 return-delta 位没有对应动作位时，hook 地址无效 | [2] Hooks.sol#L109-L119 | observed | |
| M17 | 无 hook 的池不能是动态费；非零 hook 至少要有一个标志位，或配动态费池 | [2] Hooks.sol#L121-L125 | observed | |
| M18 | 零标志位的 hook 配合动态费池是合法组合，可以只在外部调用 updateDynamicLPFee 来调费 | 由 M17、M30 推出：有效性规则允许零标志位加动态费，updateDynamicLPFee 只校验 msg.sender==hooks | inferred | |
| M19 | hook 地址通过 CREATE2 挖 salt 获得，要求低 14 位等于 flags 且目标地址无代码 | [12] v4-periphery/test/shared/HookMiner.sol#L23-L41@9969eec | observed | |
| M20 | 官方文档链接的 HookMiner 路径是 src/utils，但 periphery @9969eec 中该文件位于 test/shared | [21] 文档 FAQ 链接 vs [12] 文件树 | observed | |
| M21 | BaseHook 在构造函数里校验声明的权限与部署地址位一致，不一致则部署失败 | [15] uniswap-hooks/src/base/BaseHook.sol#L58-L61@e59fe72；[2] Hooks.sol#L83-L103 | observed | |
| M22 | 回调返回的首 4 字节必须等于被调 selector；带 delta 的返回须为 64 字节，beforeSwap 须为 96 字节 | [2] Hooks.sol#L151-L153、#L165、#L258 | observed | |
| M23 | liquidityDelta ≤ 0（包括 0）时走 remove 分支，触发 beforeRemoveLiquidity | [2] Hooks.sol#L200-L204 | observed | |
| M24 | 传给 hook 的 sender 是 PoolManager 的直接调用者（router 或 PositionManager），不是终端用户 | [2] Hooks.sol#L179、#L201、#L255 以 msg.sender 编码 | observed | |
| M25 | 经 PositionManager 的头寸在 PoolManager 中 owner 为 PositionManager、salt 为 tokenId | [11] PositionManager.sol _mint/_increase/_decrease@9969eec | observed | |
| M26 | 准入类 hook 若要识别真实用户，只能信任 router 的 msgSender()，或解析 hookData | 由 M24、M25 推出；[10] BaseActionsRouter 实现 IMsgSender | inferred | |
| M27 | hook 自己调用 PoolManager 时，自己的回调被跳过，避免递归 | [2] Hooks.sol#L170-L174、#L216、#L252、#L292；[9] SkipCallsTest.json | observed | |
| M28 | BeforeSwapDelta 高 128 位为 specified delta，低 128 位为 unspecified delta；符号以 hook 视角，正表示 hook 被欠或已拿走 | [4] BeforeSwapDelta.sol#L4-L16；[3] IHooks.sol#L95-L102 | observed | |
| M29 | beforeSwap 的 specified delta 在曲线计算前修改 amountToSwap，若翻转 exactIn/exactOut 则 revert | [2] Hooks.sol#L265-L279 | observed | |
| M30 | 动态费池可由 hook 随时调用 updateDynamicLPFee 持久改费，该函数无需 unlock | [1] PoolManager.sol#L339-L346 | observed | |
| M31 | 动态费池的 beforeSwap 返回带 0x400000 标志的费率时，只覆盖本次 swap；不带标志则用 slot0 中的费率 | [5] LPFeeLibrary.sol#L19；[8] Pool.sol swap() 中 lpFeeOverride.isOverride() 分支；[2] Hooks.sol#L262 | observed | |
| M32 | LP 费单位是 pips，上限 1,000,000 = 100%；动态费池初始费为 0，需要在 afterInitialize 里设置 | [5] LPFeeLibrary.sol#L25、#L47-L56 | observed | |
| M33 | 动态费属性在建池时确定，之后不可更改 | [20] 文档 Dynamic Fees；由 M2 推出：fee 字段是 PoolKey 的一部分 | observed | |
| M34 | 官方动态费文档把“beforeSwap 内调 updateDynamicLPFee”和“beforeSwap 返回覆盖费率”混写，代码中两者是不同路径 | [20] 文档图文 vs [1] #L339-L346 与 [2] #L262 | observed | |
| M35 | afterSwap 把 hookDelta 记到 hook 名下，并从调用者的 swapDelta 中扣除 | [2] Hooks.sol#L304-L313；[1] PoolManager.sol#L221-L226 | observed | |
| M36 | 带 return delta 的 hook 必须在同一次 unlock 内用 take/settle/mint/burn 结清自己名下的 delta，否则整笔交易 revert | 由 M4、M35 推出：hookDelta 计入 NonzeroDeltaCount | inferred | |
| M37 | afterAdd/RemoveLiquidity 带 return-delta 位时，调用者的 delta = 原 delta − hookDelta | [2] Hooks.sol#L218-L242 | observed | |
| M38 | hookData 原样转给 modifyLiquidity、swap、donate 的回调；initialize 无 hookData；V4Router 多跳的每一跳可带独立 hookData | [1] #L145、#L187、#L256 签名；[3]；[10] V4Router.sol#L119-L120 | observed | |
| M39 | hook 不能从池上添加、移除或替换；换 hook 就是新建一个池子 | [21] 文档 Hooks FAQ；由 M2 推出 | observed | |
| M40 | hook 是否可升级取决于 hook 合约本身（如代理）；官方建议优先不可变，必要时用标准代理加 multisig/timelock | [24] 文档 Security Framework “Upgradeability hazards” | observed | |
| M41 | BaseHook 构造函数的地址自检对代理式 hook 不成立，因为校验的是实现合约地址 | 由 [15] BaseHook#L58-L61 推出，没有官方说明 | speculative | |
| M42 | template 的 Counter hook 启用 beforeSwap/afterSwap/beforeAddLiquidity/beforeRemoveLiquidity，flags = 0x0AC0 | [14] v4-template/src/Counter.sol#L29-L46@1fbf955；00_DeployHook.s.sol#L15-L18 | observed | |
| M43 | template 用 PositionManager.multicall 在一笔交易里完成 initializePool 和 MINT_POSITION+SETTLE_PAIR+SWEEP×2 | [14] 01_CreatePoolAndAddLiquidity.s.sol、LiquidityHelpers.sol@1fbf955 | observed | |
| M44 | PositionManager.initializePool 用 try/catch，池子已初始化时返回 type(int24).max 而不 revert | [11] PoolInitializer_v4.sol@9969eec | observed | |
| M45 | 被他人抢先以异常价格初始化时，multicall 会在该价格继续加流动性，只靠 amount0Max/amount1Max 兜底 | 由 M44、M43 推出：mint 只校验 validateMaxIn | inferred | |
| M46 | 一次 Counter 池 exactIn swap 后，router 名下 c0 delta = −amountIn、c1 delta = +out，经 SETTLE_ALL/TAKE_ALL 归零 | 由 [1] #L226、[10] V4Router.sol#L55-L66、[2] Counter 返回零 delta 推出 | inferred | |
| M47 | template 的 swap 脚本把 amountOutMin 设为 0，并注释为 “Very bad” | [14] 03_Swap.s.sol@1fbf955 | observed | |
| M48 | v4 建池（initialize）gas 快照为 51,532 | [9] v4-core snapshots/PoolManagerInitializeTest.json@46c6834 | observed | |
| M49 | v3 createPool gas 快照为 4,557,092 | [16] v3-core UniswapV3Factory.spec.ts.snap@d8b1c63 | observed | |
| M50 | 按两份快照，v4 建池比 v3 便宜约 98.9%；官方宣传“up to 99.99%”，早期估计 99% | 由 M48、M49 推出：1−51,532/4,557,092；[25][26] | inferred | |
| M51 | V4Router exactIn 1/2/3 跳分别为 136,190 / 193,652 / 251,141 gas，每多一跳约 +57.5k | [13] v4-periphery snapshots/V4RouterTest.json@9969eec | observed | |
| M52 | v3 SwapRouter exactInput 1 跳 107,759、2 跳 172,498 gas，每多一跳约 +64.7k | [17] v3-periphery SwapRouter.gas.spec.ts.snap@51f8871 | observed | |
| M53 | v4 每多一跳的边际成本约比 v3 低 7k gas，但两套快照口径不同，单跳绝对值不可直接比较 | 由 M51、M52 推出；v3 为 Hardhat 收据，v4 为 forge 快照 | speculative | |
| M54 | v4-core 快照中原生 ETH swap 比 ERC-20 swap 少约 14.7k gas（108,434 vs 123,144） | [9] PoolManagerTest.json@46c6834 | observed | |
| M55 | v4-core 快照中 “swap with hooks” 比 “simple swap” 多 9,021 gas，可作 hook 开销的量级参考 | [9] PoolManagerTest.json；两个测试的配置未逐一核对 | speculative | |
| M56 | 每个启用回调的框架开销是千级 gas（外部 CALL 加 ABI 编码），hook 总开销主要由 hook 自身的 storage 写入决定 | 由 M22（每回调一次 CALL）与 EIP-2929/2200 gas 表推出；Counter 每次回调一次 SSTORE | inferred | |
| M57 | 官方 v4 上线博客称：9 次审计、上线时已有 150+ hook、首批部署 10 条链 | [25] blog.uniswap.org/uniswap-v4-is-here（2026-10-06） | observed | |
| M58 | Uniswap 安全框架把 BeforeSwapDelta 吃掉全部输入的情况称为 NoOp swap，即 hook 绕过 CL 曲线自行成交（自定义曲线入口） | [24] 文档 Security Framework；[2] Hooks.sol#L272-L278 | observed | |

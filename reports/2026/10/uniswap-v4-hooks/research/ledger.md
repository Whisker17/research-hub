# 论断台账

每条会出现在 explainer 里的论断，都要在这里有一行。
类型：observed（直接观察到，有一手证据）/ inferred（由证据推出）/ speculative（推测，需在页面上标明）。

编号前缀对应调研分册：M → [notes-mechanism.md](notes-mechanism.md)，V → [notes-v3.md](notes-v3.md)，R → [notes-rwa.md](notes-rwa.md)，O → [notes-others.md](notes-others.md)，G → 用户提供的 GPT Deep Research（[gpt-deep-research.md](gpt-deep-research.md)）中由主会话追到一手来源或复算的论断。证据里的 `[n]` 指该分册“来源”一节的第 n 条；用户资料见 [references.md](references.md)。“页面”列在写稿时填写。

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| M1 | v4 所有池子存于单个 PoolManager 合约的 `mapping(PoolId => Pool.State)`，建池不部署新合约 | [1] PoolManager.sol#L93@46c6834；[23] 文档 PoolManager 页 | observed | A、J |
| M2 | 池子由 PoolKey{currency0, currency1, fee, tickSpacing, hooks} 唯一确定，hook 地址是池子身份的一部分 | [6] PoolKey.sol#L11-L22@46c6834 | observed | A、J |
| M3 | `initialize` 不需要先 unlock，会校验 tickSpacing、币种排序与 hook 地址有效性 | [1] PoolManager.sol#L117-L142（无 onlyWhenUnlocked）；[18] 文档原文 | observed | J、L |
| M4 | `unlock` 回调调用者的 `unlockCallback`，返回后若 NonzeroDeltaCount≠0 则 revert CurrencyNotSettled | [1] PoolManager.sol#L104-L114 | observed | J |
| M5 | 锁状态、币种 delta、非零 delta 计数都存在 transient storage（tstore/tload）中 | [7] Lock.sol#L8-L15、CurrencyDelta.sol#L28-L41、NonzeroDeltaCount.sol | observed | I、J |
| M6 | EIP-1153 的 TLOAD/TSTORE 各 100 gas，交易结束清空，属于 Cancun 升级 | [27] eips.ethereum.org/EIPS/eip-1153（2026-10-06） | observed | I |
| M7 | v4 核心合约要求链支持 EIP-1153，否则无法运行 | 由 M5、M6 推出：核心路径直接使用 tstore/tload 操作码 | inferred | |
| M8 | 对调用者而言，正 delta 表示 PoolManager 欠调用者，负 delta 表示调用者欠 PoolManager | [3] IHooks.sol#L107-L121 注释；[22] 文档 Unlock Callback & Deltas | observed | J |
| M9 | ERC-20 结清顺序是 sync → 转账进 PoolManager → settle，PoolManager 以余额差记正 delta | [1] PoolManager.sol#L279-L288、#L349-L365；[10] DeltaResolver.sol#L38-L48@9969eec | observed | J |
| M10 | 原生 ETH 以 address(0) 表示，settle 时按 msg.value 记账，不需要 WETH | [1] PoolManager.sol#L353-L354 | observed | |
| M11 | ERC-6909 `mint` 给调用者记负 delta 并铸 claim，`burn` 烧 claim 并记正 delta | [1] PoolManager.sol#L322-L336；[19] 文档 ERC-6909 | observed | A、I、J |
| M12 | `clear` 只能放弃与当前正 delta 精确相等的数额 | [1] PoolManager.sol#L310-L319 | observed | |
| M13 | donate 把金额计入在区间内 LP 的 feeGrowthGlobal，流动性为 0 时 revert | [8] Pool.sol donate()；[1] PoolManager.sol#L256-L276 | observed | |
| M14 | 多跳 swap 中间币种不发生 ERC-20 转账，只在输入和输出两端结清 | [18] 文档 flash accounting；[10] V4Router.sol#L115-L130@9969eec | observed | J |
| M15 | hook 权限由地址低 14 位决定：bit13..bit4 为 10 个动作位，bit3..bit0 为 4 个 return-delta 位 | [2] Hooks.sol#L27-L47@46c6834；[21] 文档 Hooks FAQ | observed | A、B、K、S |
| M16 | 任一 return-delta 位没有对应动作位时，hook 地址无效 | [2] Hooks.sol#L109-L119 | observed | B |
| M17 | 无 hook 的池不能是动态费；非零 hook 至少要有一个标志位，或配动态费池 | [2] Hooks.sol#L121-L125 | observed | |
| M18 | 零标志位的 hook 配合动态费池是合法组合，可以只在外部调用 updateDynamicLPFee 来调费 | 由 M17、M30 推出：有效性规则允许零标志位加动态费，updateDynamicLPFee 只校验 msg.sender==hooks | inferred | |
| M19 | hook 地址通过 CREATE2 挖 salt 获得，要求低 14 位等于 flags 且目标地址无代码 | [12] v4-periphery/test/shared/HookMiner.sol#L23-L41@9969eec | observed | B、I、L |
| M20 | 官方文档链接的 HookMiner 路径是 src/utils，但 periphery @9969eec 中该文件位于 test/shared | [21] 文档 FAQ 链接 vs [12] 文件树 | observed | |
| M21 | BaseHook 在构造函数里校验声明的权限与部署地址位一致，不一致则部署失败 | [15] uniswap-hooks/src/base/BaseHook.sol#L58-L61@e59fe72；[2] Hooks.sol#L83-L103 | observed | L |
| M22 | 回调返回的首 4 字节必须等于被调 selector；带 delta 的返回须为 64 字节，beforeSwap 须为 96 字节 | [2] Hooks.sol#L151-L153、#L165、#L258 | observed | K |
| M23 | liquidityDelta ≤ 0（包括 0）时走 remove 分支，触发 beforeRemoveLiquidity | [2] Hooks.sol#L200-L204 | observed | K |
| M24 | 传给 hook 的 sender 是 PoolManager 的直接调用者（router 或 PositionManager），不是终端用户 | [2] Hooks.sol#L179、#L201、#L255 以 msg.sender 编码 | observed | 导语、K、S |
| M25 | 经 PositionManager 的头寸在 PoolManager 中 owner 为 PositionManager、salt 为 tokenId | [11] PositionManager.sol _mint/_increase/_decrease@9969eec | observed | K |
| M26 | 准入类 hook 若要识别真实用户，只能信任 router 的 msgSender()，或解析 hookData | 由 M24、M25 推出；[10] BaseActionsRouter 实现 IMsgSender | inferred | K |
| M27 | hook 自己调用 PoolManager 时，自己的回调被跳过，避免递归 | [2] Hooks.sol#L170-L174、#L216、#L252、#L292；[9] SkipCallsTest.json | observed | O、Q |
| M28 | BeforeSwapDelta 高 128 位为 specified delta，低 128 位为 unspecified delta；符号以 hook 视角，正表示 hook 被欠或已拿走 | [4] BeforeSwapDelta.sol#L4-L16；[3] IHooks.sol#L95-L102 | observed | K、S |
| M29 | beforeSwap 的 specified delta 在曲线计算前修改 amountToSwap，若翻转 exactIn/exactOut 则 revert | [2] Hooks.sol#L265-L279 | observed | K |
| M30 | 动态费池可由 hook 随时调用 updateDynamicLPFee 持久改费，该函数无需 unlock | [1] PoolManager.sol#L339-L346 | observed | K |
| M31 | 动态费池的 beforeSwap 返回带 0x400000 标志的费率时，只覆盖本次 swap；不带标志则用 slot0 中的费率 | [5] LPFeeLibrary.sol#L19；[8] Pool.sol swap() 中 lpFeeOverride.isOverride() 分支；[2] Hooks.sol#L262 | observed | K |
| M32 | LP 费单位是 pips，上限 1,000,000 = 100%；动态费池初始费为 0，需要在 afterInitialize 里设置 | [5] LPFeeLibrary.sol#L25、#L47-L56 | observed | K |
| M33 | 动态费属性在建池时确定，之后不可更改 | [20] 文档 Dynamic Fees；由 M2 推出：fee 字段是 PoolKey 的一部分 | observed | K |
| M34 | 官方动态费文档把“beforeSwap 内调 updateDynamicLPFee”和“beforeSwap 返回覆盖费率”混写，代码中两者是不同路径 | [20] 文档图文 vs [1] #L339-L346 与 [2] #L262 | observed | |
| M35 | afterSwap 把 hookDelta 记到 hook 名下，并从调用者的 swapDelta 中扣除 | [2] Hooks.sol#L304-L313；[1] PoolManager.sol#L221-L226 | observed | K |
| M36 | 带 return delta 的 hook 必须在同一次 unlock 内用 take/settle/mint/burn 结清自己名下的 delta，否则整笔交易 revert | 由 M4、M35 推出：hookDelta 计入 NonzeroDeltaCount | inferred | K |
| M37 | afterAdd/RemoveLiquidity 带 return-delta 位时，调用者的 delta = 原 delta − hookDelta | [2] Hooks.sol#L218-L242 | observed | |
| M38 | hookData 原样转给 modifyLiquidity、swap、donate 的回调；initialize 无 hookData；V4Router 多跳的每一跳可带独立 hookData | [1] #L145、#L187、#L256 签名；[3]；[10] V4Router.sol#L119-L120 | observed | K |
| M39 | hook 不能从池上添加、移除或替换；换 hook 就是新建一个池子 | [21] 文档 Hooks FAQ；由 M2 推出 | observed | J、K |
| M40 | hook 是否可升级取决于 hook 合约本身（如代理）；官方建议优先不可变，必要时用标准代理加 multisig/timelock | [24] 文档 Security Framework “Upgradeability hazards” | observed | K |
| M41 | BaseHook 构造函数的地址自检对代理式 hook 不成立，因为校验的是实现合约地址 | 由 [15] BaseHook#L58-L61 推出，没有官方说明 | speculative | |
| M42 | template 的 Counter hook 启用 beforeSwap/afterSwap/beforeAddLiquidity/beforeRemoveLiquidity，flags = 0x0AC0 | [14] v4-template/src/Counter.sol#L29-L46@1fbf955；00_DeployHook.s.sol#L15-L18 | observed | L |
| M43 | template 用 PositionManager.multicall 在一笔交易里完成 initializePool 和 MINT_POSITION+SETTLE_PAIR+SWEEP×2 | [14] 01_CreatePoolAndAddLiquidity.s.sol、LiquidityHelpers.sol@1fbf955 | observed | L |
| M44 | PositionManager.initializePool 用 try/catch，池子已初始化时返回 type(int24).max 而不 revert | [11] PoolInitializer_v4.sol@9969eec | observed | |
| M45 | 被他人抢先以异常价格初始化时，multicall 会在该价格继续加流动性，只靠 amount0Max/amount1Max 兜底 | 由 M44、M43 推出：mint 只校验 validateMaxIn | inferred | |
| M46 | 一次 Counter 池 exactIn swap 后，router 名下 c0 delta = −amountIn、c1 delta = +out，经 SETTLE_ALL/TAKE_ALL 归零 | 由 [1] #L226、[10] V4Router.sol#L55-L66、[2] Counter 返回零 delta 推出 | inferred | L |
| M47 | template 的 swap 脚本把 amountOutMin 设为 0，并注释为 “Very bad” | [14] 03_Swap.s.sol@1fbf955 | observed | |
| M48 | v4 建池（initialize）gas 快照为 51,532 | [9] v4-core snapshots/PoolManagerInitializeTest.json@46c6834 | observed | D、L |
| M49 | v3 createPool gas 快照为 4,557,092 | [16] v3-core UniswapV3Factory.spec.ts.snap@d8b1c63 | observed | D、L |
| M50 | 按两份快照，v4 建池比 v3 便宜约 98.9%；官方宣传“up to 99.99%”，早期估计 99% | 由 M48、M49 推出：1−51,532/4,557,092；[25][26] | inferred | |
| M51 | V4Router exactIn 1/2/3 跳分别为 136,190 / 193,652 / 251,141 gas，每多一跳约 +57.5k | [13] v4-periphery snapshots/V4RouterTest.json@9969eec | observed | L |
| M52 | v3 SwapRouter exactInput 1 跳 107,759、2 跳 172,498 gas，每多一跳约 +64.7k | [17] v3-periphery SwapRouter.gas.spec.ts.snap@51f8871 | observed | L |
| M53 | v4 每多一跳的边际成本约比 v3 低 7k gas，但两套快照口径不同，单跳绝对值不可直接比较 | 由 M51、M52 推出；v3 为 Hardhat 收据，v4 为 forge 快照 | speculative | L |
| M54 | v4-core 快照中原生 ETH swap 比 ERC-20 swap 少约 14.7k gas（108,434 vs 123,144） | [9] PoolManagerTest.json@46c6834 | observed | |
| M55 | v4-core 快照中 “swap with hooks” 比 “simple swap” 多 9,021 gas，可作 hook 开销的量级参考 | [9] PoolManagerTest.json；两个测试的配置未逐一核对 | speculative | |
| M56 | 每个启用回调的框架开销是千级 gas（外部 CALL 加 ABI 编码），hook 总开销主要由 hook 自身的 storage 写入决定 | 由 M22（每回调一次 CALL）与 EIP-2929/2200 gas 表推出；Counter 每次回调一次 SSTORE | inferred | L |
| M57 | 官方 v4 上线博客称：9 次审计、上线时已有 150+ hook、首批部署 10 条链 | [25] blog.uniswap.org/uniswap-v4-is-here（2026-10-06） | observed | |
| M58 | Uniswap 安全框架把 BeforeSwapDelta 吃掉全部输入的情况称为 NoOp swap，即 hook 绕过 CL 曲线自行成交（自定义曲线入口） | [24] 文档 Security Framework；[2] Hooks.sol#L272-L278 | observed | |
| V1 | v3 每个池子是一个独立合约，由 Factory 经 PoolDeployer 用 CREATE2（salt = token0、token1、fee）部署 | [1] UniswapV3Factory.sol#L35-51、[2] UniswapV3PoolDeployer.sol#L35 @d0831dc | observed | M |
| V2 | v3 Factory 初始只开放 500/3000/10000 三档费率（tickSpacing 10/60/200），新增档位只有 owner 能调 enableFeeAmount，开放后不可改 | [1] UniswapV3Factory.sol#L26-31、#L62-73 @d0831dc | observed | M |
| V3 | v3 池子的 fee 是 immutable，每步 swap 都用它计算，池子无法按笔改费 | [3] UniswapV3Pool.sol#L48、#L662-670 @d0831dc | observed | M |
| V4 | v3 的 mint / swap / flash 回调只回调 msg.sender，作用是收款，池子用前后余额差确认 | [3] UniswapV3Pool.sol#L478-484、#L773-785、#L792-835 @d0831dc | observed | I、M |
| V5 | v3 的 swap 只有 noDelegateCall 修饰，mint 只有 lock，任何合约都可以直接调用 | [3] UniswapV3Pool.sol#L596-602、#L457-463 @d0831dc | observed | I、M、F1 |
| V6 | v3 的 initialize 没有访问控制，只要求尚未初始化 | [3] UniswapV3Pool.sol#L271-272 @d0831dc | observed | M |
| V7 | v3 池内没有供第三方使用的 delta 账本，付款状态靠 lock 加余额检查确定 | [3] UniswapV3Pool.sol#L101-109 注释 “we use balance checks to determine the payment status” | observed | |
| V8 | v3 协议费为 swap 费的 1/N（N=0 或 4…10），只有 Factory owner 能设置 | [3] UniswapV3Pool.sol#L838-846、#L680-685 | observed | |
| V9 | v3 核心没有“池子创建者挂在池上、对所有调用者强制执行”的逻辑入口；v3 回调是调用者的逻辑，不是池子的逻辑 | 由 V4、V5 推出：回调目标恒为 msg.sender，池子对调用者不设限 | inferred | C、M |
| V10 | 只在 router 层做准入能被绕过：自写合约实现 uniswapV3SwapCallback 后直接调 pool.swap，池子只检查余额 | 由 V4、V5 推出：[3] #L596-602 不限调用者，#L776-778 只检查余额 | inferred | C、M、F1 |
| V11 | v3 router 的回调校验（verifyCallback）只保护 router 不被假池子骗，不约束谁调池子 | [4] SwapRouter.sol#L65 @0682387 | observed | |
| V12 | v4 中任何合约都可以自己 unlock 后调 PoolManager.swap，但 swap 内必然调用 hook.beforeSwap，所以准入必须写在 hook 里才有约束力 | [5] PoolManager.sol#L104-114、#L187-191、#L202 @46c6834 | observed | M、F1 |
| V13 | v3 上用代币层许可（transfer 时查 from/to）做准入可以生效，因为每笔 swap 都把输出币真实转给 recipient，付款方也真实转账给池子 | 由 V4 推出：[3] #L774、#L780 safeTransfer，回调里付款方向池子转账 | inferred | C、M、F1 |
| V14 | v4 的 take 仍是一次真实 ERC-20 转账，但 ERC-6909 mint 只记 delta、不转 ERC-20，代币层控制看不到 claim 的流转 | [5] PoolManager.sol#L291-297（take）、#L322-329（mint） | observed | F4 |
| V15 | 用户资料“v4 上 ERC-20 黑名单看不到池内换手”需要细化：最终收款人可见，6909 claim 和多跳中间币不可见 | 由 V14 推出，对照 [28] 05-compliance §3.1 | inferred | F4、U |
| V16 | v4 hook 收到的 sender 是 PoolManager 的 msg.sender（通常是 router），不是终端用户 | [6] Hooks.sol#L256 abi.encodeCall(IHooks.beforeSwap, (msg.sender, …)) @46c6834 | observed | |
| V17 | hook 自己调用 PoolManager 时，不会触发它自己的回调 | [6] Hooks.sol#L170-175 noSelfCall、#L253 | observed | |
| V18 | Algebra Access List 插件用 tx.origin 识别用户，官方承认与账户抽象钱包、relayer 兼容性差；撤流动性不设检查 | [16] Algebra Docs Access List（访问于 2026-10-06） | observed | K、M |
| V19 | v4 动态费有两条路径：beforeSwap 返回 lpFeeOverride，或由 hook 调 updateDynamicLPFee（只有动态费池且调用者是 hook 时允许） | [6] Hooks.sol#L263；[5] PoolManager.sol#L339-346 | observed | |
| V20 | v3 上的动态费只能靠 router 加价（LP 收不到、可被绕过）、多档池子（碎片化）或 fork 核心来近似 | 由 V2、V3、V10 推出 | inferred | C、M |
| V21 | v4 的 beforeSwapReturnDelta 可以改写 amountToSwap，但不能把 exactIn 翻成 exactOut | [6] Hooks.sol#L266-279 | observed | K |
| V22 | v4 的 hookDelta 由 swap 调用者承担（swapDelta = swapDelta - hookDelta） | [6] Hooks.sol#L311-312；[5] PoolManager.sol#L224-226 | observed | K |
| V23 | BeforeSwapDelta 吃掉全部输入就构成 NoOp swap，PoolManager 跳过 CL 数学，相当于 hook 自己实现曲线 | [9] Security Framework “BeforeSwapDelta and NoOp override risks” | observed | K |
| V24 | v3 swap 数学写死在 SwapMath.computeSwapStep，没有自定义曲线或自定义记账的入口 | [3] UniswapV3Pool.sol#L662-670 | observed | C、M |
| V25 | v3 上无法池内毕业：曲线阶段结束后只能把储备迁入一个 v3 池，而 initialize 谁都能抢先调用 | 由 V6、V24 推出；案例见 V26 | inferred | C、M |
| V26 | four.meme 2025-02-11 的 v3 系（PancakeSwap V3）池被抢先以极端价格初始化，损失约 $183K | [27] SlowMist Hacked、DeFiHackLabs FourMeme_exp.sol（经 meme-launchpad notes-mechanism M38 于 2026-10-05 核实） | observed | |
| V27 | v4 单例下建池只是一次状态更新，多跳 swap 不为中间池转币 | [8] Uniswap v4 Architecture（访问于 2026-10-06） | observed | J、M |
| V28 | v3 多跳时中间币先转给 router 托管，再在下一跳付出，每个中间跳多两次 ERC-20 转账 | [4] SwapRouter.sol#L147 “for intermediate swaps, this contract custodies” | observed | J、M |
| V29 | v4 的 unlock 会话结束时，只要还有非零 delta 就 revert CurrencyNotSettled | [5] PoolManager.sol#L104-114 | observed | |
| V30 | 低成本建池和多跳净额结算在 v3 上无法用外部包装近似，只能改核心 | 由 V1、V27、V28 推出 | inferred | M |
| V31 | v3 池子只认 ERC-20（createPool 要求 token0 非零地址），原生 ETH 要靠 router wrap/unwrap WETH9；v4 原生支持 | [1] UniswapV3Factory.sol#L42；[8]；[5] PoolManager.sol#L348-363 | observed | M |
| V32 | v3 上的限价单 / TWAMM 只能靠 range order 或 keeper 外部执行，需要信任 keeper，且执行时机暴露给 MEV | 由 V5、V9 推出：池上没有必经回调，订单执行只能由外部调用触发 | inferred | M |
| V33 | MEV 拍卖 / 排序规则在 v3 池层无法强制，因为未经授权的交易可以直接打池子 | 由 V5、V10 推出 | inferred | M |
| V34 | Algebra Integral 保持每池独立合约，插件由 DEX 管理员 / DAO 控制，不是任何人都能挂 | [14] Algebra “Integral vs. Uniswap V4” | observed | M、F2 |
| V35 | Algebra 插件可以被 Factory owner / POOLS_ADMINISTRATOR 通过 setPlugin 更换，还能经 Beacon Proxy 一次升级所有池子；v4 的 hook 地址属于 PoolKey，不可更换 | [13] Algebra Plugins；[10] ToB Fig.2 PoolKey | observed | M、F2 |
| V36 | Algebra v1.2 的插件可以在 beforeSwap 返回 plugin fee（从 swap 金额扣）和 override fee；插件回调池子时 hook 被禁用 | [15] Algebra Changes v1.2 | observed | M |
| V37 | PancakeSwap Infinity 是 Vault 加多个单例 PoolManager（CL、Bin）；hook 可以部署在任意地址，权限 bitmap 写进 poolKey.parameters，不用挖地址 | [17] PancakeSwap Developer：Overview、AMM Layer、Custom Layer Hook | observed | M、F2 |
| V38 | PancakeSwap Infinity 与 v4 一样有 4 个 return delta 权限和 beforeSwap lpFeeOverride | [17] Custom Layer Hook | observed | M、F2 |
| V39 | Balancer v3 的 hook 在注册池子时由 getHookFlags 固定，onRegister 可以拒绝池子，只能在 after hook 里改 amountCalculated，且 hook 可重入 Vault | [18] Balancer Docs Hooks | observed | M、F2 |
| V40 | PoolManager 只保证 session 结算闭合，不验证 hook 内部账目；Cork 和 Bunni 都不是 v4 核心的问题 | [10] ToB 2026-07-30 开篇与 §3 | observed | 导语、F、F3 |
| V41 | Cork 2025-05-28 被攻击：CorkHook beforeSwap 的 hookData 授权被绕过，3,761 wstETH 被提走；Cork 用的 v4-periphery 版本早于 2025-02-06 加入显式授权检查的提交 | [11] Cork post-mortem（2025-06-04） | observed | E、F3、Q |
| V42 | Cork 的损失约 $12M | [10] ToB “~$12M, May 2025”；[11] 只给出 3,761 wstETH，未给美元口径 | observed | E |
| V43 | v4-periphery 的 onlyPoolManager 要求 msg.sender == poolManager，否则 revert NotPoolManager | [7] ImmutableState.sol#L17-20 @9969eec | observed | Q |
| V44 | Bunni 2025-09-02 被攻击约 $8.4M：44 次微额 withdraw 利用取整，把 USDC active balance 从 28 wei 压到 4 wei | [12] Bunni Exploit Post Mortem | observed | E、F3 |
| V45 | 单步看安全的取整方向，在多步组合下可能失效（Bunni 官方结论） | [12] “all of the rounding directions involved were safe in isolation” | observed | F3 |
| V46 | 建池无许可，hook 若信任调用方提供的 PoolKey，攻击者可以建一个挂该 hook、代币由他选的池子 | [10] ToB §2，Spearbit SVFHook finding | observed | Q |
| V47 | 缺少 afterSwapReturnDelta 权限位时，PoolManager 会忽略 hook 返回的 delta，导致每笔 swap 都 CurrencyNotSettled（Angstrom finding） | [10] ToB §5 | observed | Q |
| V48 | hook 地址的权限位固定，但 proxy 背后的代码可以升级；官方建议优先不可变，否则用多签加时间锁 | [10] ToB §5；[9] Upgradeability hazards | observed | I、Q |
| V49 | after 回调里的非必要逻辑 revert 会连带父操作，可能让 LP 无法撤出 | [10] ToB §6 | observed | Q |
| V50 | 同一个 hook 在多跳路由中可能在一笔交易里被多次调用，跨回调缓存的状态可能被嵌套操作改掉 | [9] “Multi-pool and routing interactions”；[10] §7 | observed | Q |
| V51 | Uniswap 路由默认只收两类池子：无 hook 的，以及 hook 不带 swap 权限、不带 return delta、非动态费的，且费率都要在合理上限内 | [21] v4HooksPoolsFiltering.ts#L147-153 @dfe1baa | observed | F10 |
| V52 | 不满足默认条件的 hook 池子，可以走“非主流交易对、无自定义记账、非动态费”的自动白名单，或者人工显式白名单 | [21] isAutoAllowlistedHook；[22] hooksAddressesAllowlist.ts @dfe1baa | observed | F10 |
| V53 | Uniswap 白名单申请：使用 ReturnsDelta 或 dynamicFees 的 hook、地址以 0x91 开头的 hook 需要申请；审核“not a security audit”，并要求浏览器上已验证源码 | [20] developers.uniswap.org/hook-allowlist（访问于 2026-10-06） | observed | F10 |
| V54 | permissioned hook 的池子在 uniroute 中单独放行，条件是至少一端是该 hook 名下的 adapter 代币，且费率 / tickSpacing 属于规范集合 | [21] isAdmissiblePermissionedPool | observed | F10 |
| V55 | hook 方可以自己跑 UniswapX filler，接 Uniswap interface 的订单流 | [19] Integrated Routing with UniswapX | observed | |
| V56 | 1inch 不会自动路由带 hook 的 v4 池，必须由 Pathfinder 能建模该 hook 的行为 | [23] 1inch Help（访问于 2026-10-06） | observed | F10 |
| V57 | 0x 集成自定义 v4 hook 需要提交申请，由团队审核 | [24] 0x Help（访问于 2026-10-06） | observed | F10 |
| V58 | 方案提出：1inch / UniswapX 默认会跳过认不出 Adapter 的许可池，流动性会因此再裂一道 | [28] 05-compliance-and-permissioning.md §3.4 | observed | |
| V59 | 上条方案判断与聚合器公开规则一致 | 由 V54、V56、V58 推出：两者都要求显式支持后才路由 | inferred | |
| V60 | 截至 2026 年 v4 上已初始化约 9 万个唯一 hook 地址；另有说法为 2026-06 时 4.1 万个、带 hook 池子占 15–20% 成交量 | 仅见二手 [25] CryptoBriefing（时间线自相矛盾）、[26] Beelaa，没有 Dune 查询 ID | speculative | T |
| R1 | v4 PoolManager.swap 只调用 hook 并把 swapDelta 记到调用者名下，函数内没有 ERC-20 转账 | [1] PoolManager.sol#L187-L227@46c6834 | observed | N、F4 |
| R2 | v4 只在 take（PoolManager→to）和 settle 前用户转入时发生代币转账，unlock 只要求回调结束时 delta 清零 | [1] PoolManager.sol#L104-L114、#L291-L297@46c6834 | observed | N、F4 |
| R3 | PoolManager.mint 把正 delta 换成 ERC-6909 余额而不动底层代币，6909 的 transfer 只改内部映射 | [1] #L322-L329；[2] ERC6909.sol#L25-L33@46c6834 | observed | N |
| R4 | 代币层转账规则看得见资产进出 PoolManager，看不见池内的所有权变化（6909 claim、LP 头寸、多跳） | [3] 官方博客原文“never sees what happens inside” | observed | 导语、F、N、F4 |
| R5 | allowlist 型代币无法直接进 v4：PoolManager 作为共享单例无法进入每个发行方的 allowlist，直接持有又会被铸成 6909 claim 绕过 allowlist | [5] Architecture 页“The PoolManager allowlist cannot be enforced directly” | observed | N、F4 |
| R6 | 制裁名单类代币检查在 v4 中只在 settle/take 边界触发，拦不住被制裁地址在池内持有 claim 或 LP 敞口 | 由 R2、R3、R26 推出：转账只发生在边界，claim 与头寸变动不调用代币 | inferred | |
| R7 | Uniswap 官方许可池的正式名称是 Permissioned Pools，由 Permissions Adapter、PermissionsAdapterFactory、PermissionedHooks、Permissioned Position Manager 组成，并需专用 Universal Router | [5] Architecture；[6] Deployment Addresses 表 | observed | N |
| R8 | PermissionedHooks 开启 beforeInitialize、beforeSwap、afterSwap、beforeAddLiquidity 四个回调，afterSwap 只发 Swap 事件 | [8] PermissionedHooks.sol#L65-L70、#L105-L117@e4eabe5 | observed | N |
| R9 | beforeInitialize 要求池中至少一种 currency 是工厂验证过的 adapter，并拒绝未验证的 adapter | [8] #L74-L90@e4eabe5；[5] | observed | N |
| R10 | 准入数据来自发行方部署的 IAllowlistChecker，返回 SWAP_ALLOWED(0x1) 与 LIQUIDITY_ALLOWED(0x2) 两个独立标志 | [6] Step 1；[5] Permissions flags | observed | N |
| R11 | checker 可以接 Securitize DS Protocol、ERC-3643 或自定义注册表，池子只需要判定结果 | [3] “It only needs the verdict” | observed | |
| R12 | PermissionedHooks 信任 router 上报的 msgSender()，因此同时要求 sender 有权限且 router 在 allowedWrappers 中 | [8] 合约注释与 _isAllowed#L139-L155@e4eabe5 | observed | K、N |
| R13 | adapter 只允许 allowedWrappers 铸造虚拟代币，虚拟代币只能由 PoolManager 持有，转出时自动 burn 并释放底层代币 | [9] PermissionsAdapter.sol#L45-L50、#L100-L121@3245c3c | observed | N |
| R14 | 许可池的 allowlist 检查两次：router 在 wrap 输入代币时检查，hook 在 beforeSwap 时检查 | [5] Swap Routing 节 | observed | N |
| R15 | 新 adapter 默认关闭 swap，发行方可以随时暂停，并可用 unwindPosition 强制平仓；资产先退持有人，收不了的才回到该资产自己的发行方 | [5] Security Considerations；[6] Step 6 | observed | N |
| R16 | 许可池的 LP 头寸 NFT 不可转让 | [4] Core Invariants；[5] | observed | N |
| R17 | Uniswap 路由只把许可代币作为交易的输入或输出，不作为中间跳，并要求 UR ≥2.2.0 | [7] Routing Behavior、Set the Universal Router Version | observed | F、F5、S |
| R18 | 许可池要进入 Uniswap 前端和 API 路由，须经 Uniswap Labs 人工审核 allowlist，不能自助完成 | [6] Step 7 | observed | N |
| R19 | 截至 2026-10-06，Permissioned Pools 官方部署地址只覆盖 Ethereum 主网与 Sepolia | [6] Deployment Addresses；[3] “live on Ethereum mainnet and Sepolia today” | observed | N |
| R20 | 第三方聚合器若不是发行方批准的 wrapper，就无法为许可池构造交易 | 由 R12、R13 推出：只有 allowedWrappers 能铸造虚拟代币，hook 也会校验 router | inferred | |
| R21 | Uniswap 称 RWA 池累计成交超过 $9.1B、260 万笔交易、14 万钱包（未注明截止日） | [10] Tokenized securities are live | observed | |
| R22 | Coinbase Verified Pools 是 Base 上的 v4 许可池，hook 检查 EAS 上的 Verified Account + Verified Country 证明及制裁名单 | [11] docs.verifiedpools.com | observed | N |
| R23 | 未找到 Verified Pools hook 的开源代码或审计报告 | 检索 docs.verifiedpools.com、coinbase.com 与搜索结果均未见（访问 2026-10-06） | speculative | N、T |
| R24 | Predicate Hook 用 hookData 携带链下 operator 签名，在 beforeSwap 中把 msgSender、PoolKey、方向、数量编码后验证，并对白名单用户豁免 | [12] PredicateHook.sol#L193-L225@40ad82d | observed | K、N |
| R25 | Predicate Hook 还强制池费为 0、LP 须在白名单、禁止 donate | [12] getHookPermissions、_beforeInitialize、_beforeAddLiquidity、_beforeDonate | observed | N |
| R26 | xStocks 的 EVM 代币层检查暂停与 Chainalysis 制裁名单（from/to），没有 KYC allowlist | [17] BackedTokenImplementation.sol#L298-L301@35859e8 | observed | |
| R27 | UF 向 Predicate 与 Paxos 资助 $325K；Paxos International 的 USDL 为首个生产部署，USDL 用 AutoWrapper 处理 rebase | [13] UF grant update 2025-06-18；[12] README | observed | N |
| R28 | OKXICE 计划在 X Layer 上用许可 v4 池交易 60 多只代币化美股，KYC 后发放 soulbound 授权；截至 2026-10-06 只有公告与通知，未上线 | [15] Crypto Briefing、CryptoTimes（二手，原始 PDF 未能抓取） | speculative | |
| R29 | v4 中 hook 是 PoolKey 的一部分，“同池毕业”只能写成同一个 hook 内部的状态机 | [37] Hooks.sol@46c6834（meme-launchpad M44、M45）；[34] §5 | observed | O |
| R30 | hook 用 beforeSwapReturnDelta 完整吃掉输入后，PoolManager 拿到 amountToSwap=0，原生引擎不改 slot0 | [1] #L200-L217；[37]；[23] _seedPOL 注释 | observed | O |
| R31 | untoll-hook 把曲线放在 beforeSwap 内，quote 以 6909 claim 托管，跨阈值那笔 swap 内原子注入 full-range POL 并 renounceMint | [23] LaunchHook.sol#L590-L607、#L703-L729@b2f381d | observed | O、F6 |
| R32 | untoll-hook 把池子初始化在曲线终点价，使毕业时无需推价即可保证 AMM 开盘价与曲线终点价连续 | [23] _seedPOL 注释（L748 起）、ARCHITECTURE §5 | observed | O |
| R33 | untoll-hook 自称 testnet-bound、未经外部审计，并有 router 作为 sender 的归属缺陷 | [23] README Status、ARCHITECTURE §7 H1 | observed | O、F6 |
| R34 | Pons V2 的曲线是每个 launch 独立的合约，毕业分 graduate 与可重试的 createGraduatedPool 两段，铸 full-range v4 头寸永久锁定 | [24] pons-labs README@44a3db9 | observed | H、O、F6 |
| R35 | PAIR 不设曲线、不迁移，用预言机开盘价注入单边流动性，“毕业”只是信息性标志 | [25] PAIR 新闻稿 2026-08-31 | observed | H、O |
| R36 | pools.trade 的 v4 池不挂 hook，UI 上的“曲线”是单边集中流动性 | [26] Bitquery pools.trade API 文档（二手） | observed | O |
| R37 | Doppler multicurve 以多段市值区间头寸发射，SDK 示例中迁移配置为 noOp | [27] docs.doppler.lol | observed | I、O |
| R38 | Bankr 自 2026-07-20 起支持以 Robinhood 股票代币作 quote 发射，发射时 85% 供应进 Doppler 管理的 v4 池 | [28] Crypto Briefing（二手）+ Bankr Docs（经 notes-agentic） | observed | H、O |
| R39 | 截至 2026-10-06，仍未找到“hook 内曲线 + 同 PoolId 就地翻转”的生产实例，唯一可读的实现在测试网阶段 | 由 R31、R33、R34、R35、R36、R37 推出；检索未穷尽 | speculative | 导语、F、O、F6 |
| R40 | xStocks 在 EVM 上是 rebase：multiplier 更新时 balanceOf 随之变化 | [16] multipliers 页原文；[17] BackedAutoFeeTokenImplementation.sol#L255-L260@35859e8 | observed | F7 |
| R41 | xStocks 新 multiplier 按时间戳自动生效（除息日次日 00:30 UTC），官方建议生效前后各暂停交互约 15 分钟 | [16]；[17] getCurrentMultiplier | observed | F7、F8 |
| R42 | xStocks EVM 合约发出的事件是 MultiplierScheduled / MultiplierUpdated，不是 ERC-8056 的 UIMultiplierUpdated | [17] _updateMultiplier | observed | |
| R43 | Robinhood Stock Tokens 的 raw 余额不变，uiMultiplier 只用于显示（ERC-8056），官方称链上 swap 不受影响 | [18] Corporate actions & the multiplier | observed | F7 |
| R44 | Robinhood 股票喂价 24/5 更新，公司行动期间暂停，oraclePaused 只是建议性标志，应以 staleness 为主防线 | [19] Oracles & Price Feeds | observed | F8 |
| R45 | 把 rebase 型 xStocks 直接作为 v4 池的 quote，会导致 PoolManager 账本与实际余额脱节（正 rebase 出现无主余额，负 rebase 出现负债缺口） | 由 R1、R3、R40 推出：PoolManager 只按收到的数量记账，没有重标接口 | inferred | F7 |
| R46 | 方案提出：股票 quote launchpad 在单个 v4 池内相变，毕业时铸 full-range 头寸送进无出口 locker | tape-design.md §6.3.1 | observed | H、O |
| R47 | 方案提出：休市熔断 hook 在 beforeSwap 读预言机与链上日历，超带宽就 revert，只对扩大偏离的方向加征惩罚费 | tape-design.md §6.4.1 | observed | |
| R48 | 方案提出：公司行动 hook 监听 UIMultiplierUpdated，在 effectiveAt 暂停、调整 tick 参照系并重铸锁仓头寸 | tape-design.md §6.4.2 | observed | O |
| R49 | 方案 §6.4.2 的触发前提与 xStocks EVM 不符：事件名不同，且生效不需要交易；v4 也没有“调整 tick 参照系”的接口 | 由 R42、R41、R30、R48 推出 | inferred | O、U |
| R50 | 方案 §6.3.3 提出的非 rebase qToken 包装与 Predicate/Paxos 的 AutoWrapper 属同类做法，可以把 rebase 挡在池外 | tape-design.md §6.3.3；由 R27、R45 推出 | inferred | O、F7 |
| R51 | 官方 PermissionedHooks 是共享 hook，一个池只能挂一个 hook，因此“曲线 + 熔断 + 准入”要么合进一个自定义 hook，要么放弃曲线 | 由 R7、R29 推出；资料 05 §3.3 同样指出收费与合规 hook 须合并 | inferred | O |
| R52 | PAIR 称接入 AMC 后周末链上价格达真实价的 35 倍；defiprime 称 HIMS 包装币最高高出 NYSE 收盘价 112%，与方案的“4.6 倍”口径不一致 | [25]；[29]；[30]；tape-design.md §6.4.1 | observed | U |
| R53 | 2026-09-01 前后，Robinhood Chain 上 $BONER/$HIMS 池持有链上 HIMS 流通量的 50.4%，股票 quote 池共 432 个 | [29] defiprime 读链（二手） | observed | U |
| R54 | Mantle 主网自 Skadi（v1.3.1）起支持 EIP-1153（TSTORE/TLOAD）、MCOPY、EIP-7702 | [21] Mantle Docs v1.3.1 Skadi changelog | observed | R、F11 |
| R55 | Skadi 主网于 2025-08-27 完成 | [22] 二手；官方 changelog 未写日期 | speculative | |
| R56 | Uniswap 官方部署表（2026-09-22）的 v4 PoolManager 不含 Mantle，Mantle 只有 v3（dao-deployed）与 Universal Router 2.0.0 | [20] deployments.json@a677c0d | observed | D、R、F11 |
| R57 | Mantle 上暂时无法直接使用 Uniswap 官方 Permissioned Pools：既没有 v4，也没有 UR 2.2.0 专用 build | 由 R19、R56 推出 | inferred | R |
| R58 | v4-core PoolManager 的许可证为 BUSL-1.1，fork 或自行部署受许可证约束（Change Date 与 Additional Use Grant 未核实） | [1] PoolManager.sol#L1@46c6834 | observed | R、F11 |
| R59 | 用户资料提出：链层只做制裁级过滤，股票 quote 准入放在资产或池 hook，meme 保持无许可 | 05-compliance-and-permissioning.md §4-§5 | observed | R |
| O1 | 截至 2026-10-06，Uniswap v4 全部池 30 天成交量 $42.45B，累计 $471.0B（DefiLlama 口径，剔除刷量） | [10] DefiLlama summary/dexs/uniswap-v4 | observed | D |
| O2 | 截至 2026-10-06，Angstrom 30 天成交量 $396.0M，累计 $3.249B，只在 Ethereum，DefiLlama 上线日 2025-07-26 | [9] DefiLlama summary/dexs/angstrom | observed | P |
| O3 | Angstrom 30 天成交量约为 v4 同期的 0.93% | 由 O1、O2 推出：396.0M / 42.45B ≈ 0.93% | inferred |  |
| O4 | Angstrom 主网上线（2025-07 下旬），由 Uniswap Foundation 的 Hook Design Lab 支持 | [8] UF Builder Update #31；日期见 BlockBeats/TechFlow 2025-07-26 二手报道 | observed | E |
| O5 | Angstrom hook 要求：before/afterInitialize 至少一个，必须有 beforeAdd、beforeRemove、beforeSwap、afterSwap+afterSwapReturnDelta，必须没有 afterAdd/afterRemove，池费率为 DYNAMIC_FEE_FLAG | [3] UniConsumer.sol#L48-L70@98216596 | observed | P |
| O6 | Angstrom 外部 swap 时，如果本块还没解锁，hookData 必须带节点地址和节点对本块空块证明的签名，否则 revert CannotSwapWhileLocked | [1] UnlockHook.sol#L44-L57；[4] TopLevelAuth unlockWithEmptyAttestation | observed |  |
| O7 | 解锁条件是 _lastBlockUpdated == block.number；execute 由节点调用，每块只能一次 | [4] TopLevelAuth.sol _isUnlocked / _nodeBundleLock | observed |  |
| O8 | Angstrom 对外部 swap 用 OVERRIDE_FEE_FLAG 覆盖 LP 费，afterSwap 把协议费以 6909 mint 给 FEE_COLLECTOR，并作为 int128 delta 从交易者那里扣 | [1] UnlockHook.sol beforeSwap/afterSwap | observed |  |
| O9 | Angstrom bundle 在一次 unlock 内按 take 资产 → 池子 swap → ToB 订单 → 用户订单 → 结清 delta 的顺序执行 | [2] Angstrom.sol unlockCallback；[5] overview "Bundle processing" | observed |  |
| O10 | Angstrom 链上合约依赖质押节点提供价格、成交量和 gas 分摊，安全性靠罚没；恶意 router 可能盗取 beforeRemoveLiquidity 中分发的奖励 | [5] overview.md Assumptions | observed |  |
| O11 | Angstrom 依赖节点活性：没有 bundle 也没有节点签名的块里，外部交易者无法 swap | 由 O6、O7 推出：未解锁时 beforeSwap 一律 revert，解锁只能由节点完成 | inferred |  |
| O12 | 带"节点签名门禁"的池很可能难以被通用聚合器直接路由 | 由 O6 推出：聚合器需要拿到节点签名才能 swap；未见聚合器集成的一手证据 | speculative |  |
| O13 | Angstrom 文档称：每块由节点先执行套利拍卖和统一价批量拍卖，再对外解锁；LP 存取不受锁影响 | [6] docs.angstrom.xyz L1 Architecture | observed | P |
| O14 | Angstrom L2 版不用节点网络，在 beforeSwap 里按超出下限的优先费乘以固定虚拟 gas 收 MEV 税，分给池创建者、协议和 LP；已部署在 Base 与 Unichain | [7] docs.angstrom.xyz/l2/intro | observed | P |
| O15 | Angstrom 核心合约采用 BUSL-1.1 许可，仓库里有 Spearbit 与 Cantina 竞赛审计文件 | [2] SPDX 头；[19a] security-reviews 目录 | observed |  |
| O16 | Bunni v2 hook 只实现了 afterInitialize 和 beforeSwap 两个回调，afterInitialize 只接受 BunniHub 调用 | [11] BaseHook.sol；[12] BunniHookLogic.sol#L84-L92@2b303b8 | observed | P |
| O17 | Bunni v2 在 beforeSwap 里用 LDF 和 BunniSwapMath 自己计算 swap，并返回 BeforeSwapDelta(+input, −output) 接管整笔交易 | [12] BunniHookLogic.sol#L289-L306、L436-L441 | observed | P、F9 |
| O18 | Bunni 的结算路径：hook mint 输入 claim → hub.hookHandleSwap 拉走输入、推出输出 → hook burn 输出 claim | [12] BunniHookLogic.sol#L518-L530 | observed |  |
| O19 | Bunni 池的资金存放在 BunniHub（可部分再质押到 ERC-4626 金库），v4 核心曲线基本不参与成交 | 由 O17、O18 推出：specified 数量已被 delta 全部消耗；[12] 读取 reserve/vault 余额 | inferred | P、F9 |
| O20 | Bunni 的费率优先级为 am-AMM 管理者费 > hooklet 覆盖费 > 动态费（TWAP 偏离二次项 + surge 半衰期） | [12] BunniHookLogic.sol#L358-L387 注释与代码 | observed |  |
| O21 | 2025-09-02 Bunni 在 Ethereum USDC/USDT 和 Unichain weETH/ETH 两个池被利用，损失约 $8.4M | [13] Bunni 官方复盘 | observed | F3 |
| O22 | Bunni 事故根因：withdraw 中 idle balance 递减量向下取整，单次操作安全，但 44 次小额提款叠加后使总流动性被错误压低 84.4%，再被夹击 | [13] 复盘 "What Went Wrong"，含 BunniHubLogic.sol#L478@ad8acfc | observed | F3 |
| O23 | 最大的 Unichain USDC/USD₮0 池没被打，部分原因是 Unichain 上闪电贷资金不足（约需 1,700 万，Euler 约 1,100 万），且 v4 本身在第 2 步要用到，不能同时作为闪电贷来源 | [13] 复盘 "Why Wasn't Unichain…" | observed |  |
| O24 | Bunni v2 累计成交量 $2.48B（Unichain $1.55B），DefiLlama 已标记 deprecated，记录 5 份审计 | [15] DefiLlama summary/dexs/bunni-v2 | observed |  |
| O25 | Bunni 于 2025-10-23 宣布停运，原因是没有资金支持重启；同日仓库改为 MIT 许可并注明勿用于生产 | [16] 二手转引官方 X；[14] README 与 commit 2b303b8（2025-10-23） | observed | E |
| O26 | 用 return delta 接管曲线的 hook，要自己承担全部记账正确性，攻击面明显大于只改费用的 hook | 由 O17、O22 推出：Bunni 事故出在 hook 自有记账，不在 v4 核心 | inferred | F9 |
| O27 | Clanker 基础 hook 的权限位为 beforeInitialize、beforeAddLiquidity、beforeSwap、afterSwap、beforeSwapReturnDelta、afterSwapReturnDelta | [17] ClankerHook.sol#L411-L428@b004c2e | observed | P |
| O28 | Clanker 的 beforeInitialize 直接 revert，池子只能通过 factory 的 initializePool 或公开的 initializePoolOpen 创建；池费率固定为 DYNAMIC_FEE_FLAG | [17] ClankerHook.sol _beforeInitialize、_initializePool | observed |  |
| O29 | Clanker 协议费 = LP 费 × 20%，只对配对币一侧收：配对币 exactIn 时在 beforeSwap 用 specified delta 收，Clanker 币 exactIn 时在 afterSwap 用 unspecified delta 收，都以 6909 mint 给 hook | [17] ClankerHook.sol#L270-L378 | observed |  |
| O30 | Clanker 在下一笔 swap 的 beforeSwap 里把 hook 持有的协议费 6909 burn 后 take 给 factory | [17] ClankerHook.sol _hookFeeClaim | observed |  |
| O31 | Clanker MEV 模块只在建池后 2 分钟内运行，期间 beforeAddLiquidity 禁止加流动性 | [17] MAX_MEV_MODULE_DELAY 与 _beforeAddLiquidity | observed |  |
| O32 | ClankerHookDynamicFee：fee = baseFee + feeControlNumerator·VA²/1e10，上限 maxLpFee（≤30%），baseFee ≥ 0.25%，通过 updateDynamicLPFee 写入 | [18] ClankerHookDynamicFee.sol#L17-L20、L70-L89；[17] MAX_LP_FEE | observed | P |
| O33 | Clanker 用"hook 自调用 PoolManager.swap 后 revert TickReturned"来模拟成交后的 tick，作为波动输入；注释承认结果与实际不完全一致 | [18] _getTicks / simulateSwap | observed |  |
| O34 | Clanker 动态费 hook 每笔 swap 实际执行一次额外的完整 swap 模拟，gas 至少约翻倍 | 由 O33 推出：模拟执行同一条 swap 计算路径后回滚 | inferred | Q |
| O35 | Clanker v4 合约开源，有 Cantina 1 份、Macro 2 份审计，Base 主网 ABI 已发布 | [19] v4-contracts 目录树 | observed | P |
| O36 | 截至 2026-10-06，Clanker 费用口径 30 天 $742.6K、累计 $91.6M（几乎全在 Base）；Flaunch 30 天 $6.7K、累计 $3.60M | [20] DefiLlama fees/clanker；[27] fees/flaunch | observed |  |
| O37 | OZ LimitOrderHook 在当前价格外挂一个 tickSpacing 宽的单边流动性作为限价单，在区间内或方向错误会 revert | [22] _handlePlaceCallback（InRange / CrossedRange） | observed | P |
| O38 | OZ LimitOrderHook 在 afterSwap 里扫描被穿越的 tick 并撤出订单流动性，成交 gas 由触发穿越的交易者承担，大单可能需要拆分 | [22] _afterSwap、_fillCrossedOrders 与 NOTE | observed |  |
| O39 | v4 不回调 hook 自身发起的操作，所以 hook 内部 swap 后必须手动调用成交逻辑 | [22] IMPORTANT 注释 | observed |  |
| O40 | OZ LimitOrderHook 是库实现（v1.2.0，标注 experimental），不支持原生 ETH | [22] 文件头与 NOTE | observed | P |
| O41 | Uniswap 官方 TWAMM 示例的设计是让 TWAMM 订单成为每块第一笔池操作以避免抢跑；博客链接的示例文件在 v4-periphery main 分支已 404 | [23] Uniswap Blog；raw 路径返回 404（2026-10-06） | observed |  |
| O42 | 未找到有规模的生产级 TWAMM 或限价单 hook | 由 O40、O41 推出，加上本轮检索只找到个人 GitHub 实现；未穷举 | speculative |  |
| O43 | Doppler 用 afterInitialize（放初始头寸）、beforeSwap（每 epoch 首笔前再平衡）、afterSwap（累计售出和募集，不计 swap 费）、beforeAddLiquidity（拒绝外部 LP）四个回调 | [24] doppler docs/Doppler.md | observed | P |
| O44 | Doppler 按 epoch 调整曲线：落后时荷兰式下移（每 epoch 最多 (endingTick−startingTick)/epoch 数），超前时上移，并重铺 lower / upper / discovery 三类 slug | [24] Doppler.md "Curve Accumulation"、"Liquidity Placement" | observed |  |
| O45 | Doppler 用"hook 自有头寸的移动"而不是 return delta 来实现曲线，资金仍走 v4 集中流动性 | 由 O43、O44 推出：文档只描述 slug 头寸的放置，没有提到 BeforeSwapDelta | inferred |  |
| O46 | Zora 用 v4 hook + Doppler 多曲线头寸，狙击税 99% 起 10 秒衰减，20% 手续费转为永久流动性 | [25] docs.zora.co/coins（meme-launchpad 已核实） | observed |  |
| O47 | Flaunch 把创作者不拿的手续费每攒满 0.1 ETH 就在现价下方挂一笔单边买单（PBW） | [26] docs.flaunch.gg auto-buybacks | observed |  |
| O48 | Pons V2 的曲线在独立合约里，毕业时铸造全区间 v4 头寸进 locker，singleton hook 只在 quote 一侧收费 | [28] pons-labs README @44a3db9 | observed |  |
| O49 | 二手称截至 2026-06 已初始化 hook 超过 41,000 个 | 仅见于 [29] beelaa 搜索摘要，未取到 Dune/hookrank 一手数据 | speculative | T |
| O50 | 按改动深度排序：只改费用（Clanker DynamicFee）< 自有头寸订单（LimitOrder）< 自有头寸曲线（Doppler）< 准入加离链结算（Angstrom）< 用 delta 替换曲线和记账（Bunni），信任面随之扩大 | 由 O8、O17、O29、O37、O44 推出：依据各自修改的状态与资金托管位置 | inferred | P |
| O51 | 动态费是这些代表 hook 共用的能力：Clanker 用 updateDynamicLPFee，Angstrom 用 DYNAMIC_FEE_FLAG 加 fee override，Bunni 在 beforeSwap 内自算费率并计入 delta | 由 O5、O8、O20、O32 推出 | inferred |  |
| G1 | StablePairHook 是 Uniswap Labs 官方 hook，部署在 Ethereum（ERC1967 代理 0x0000113d…bfcC0，UUPS 升级），owner 与 configManager 是 Uniswap Governance Timelock；USDC/USDT、USDC/USDG 两个池于 2026-09-10 初始化，均为动态费池、tickSpacing 1 | Uniswap/v4-hooks-public README @ `e4eabe5`（2026-09-10），主会话 gh api 读取于 2026-10-06 | observed | E、P |
| G2 | StablePair 代理地址低 14 位为 0x3CC0：启用 before/afterInitialize、before/afterAddLiquidity、before/afterSwap；没有 remove-liquidity 回调，也没有 return-delta 权限 | 由 G1 的地址按 v4-core `Hooks.sol` 权限位（M 分册）计算 | inferred | P |
| G3 | StablePair：带内按 AMM 价与带边界的距离分别设买卖两侧费率（两者之和等于带宽），费率按区块初价计算；带外“继续远离参考价”的交易零费，纠偏交易面对逐块衰减的 Dutch auction 费，起点等于带的远端价 | Uniswap Blog《Keeping Value in the Pool: How StablePair Hook Works》，访问于 2026-10-06 | observed | P |
| G4 | 官方说明：hook 权限编码在地址里，升级不能扩大权限；StablePair 没有 remove-liquidity 回调，任何升级都不能阻止 LP 提款 | 同 G3 “What an upgrade can and can't change” 一节 | observed | I、K、P |
| G5 | Angstrom L2 在 hook 内按优先费收确定性税：tax = swapMEVTaxFactor × 120,000 × (priorityFee − floor)，priorityFee = tx.gasprice − block.basefee；Router 可在 hookData 里带 maxSwapTax；afterSwap 分给创作者、协议和 LP；JIT 流动性税为 1.5 倍；治理可进入 withdrawOnly | Angstrom Docs “Arbitrage Auction”（docs.angstrom.xyz/l2/arbitrage-auction），访问于 2026-10-06 | observed | P |
| G6 | DualPoolHook 源码注释：“JIT quoter with ERC4626 vault rehypothecation and multi-range liquidity distribution. Pricing is fully static”；OpenZeppelin 审计日期 2026-07-14 | Uniswap/v4-hooks-public `src/alf/DualPoolHook.sol` @ `e4eabe5`；同仓库 README Audits 表 | observed | P、F9 |
| G7 | WETHHook 通过 v4 池以 1:1、零费率包装 / 解包 ETH，已部署在 Ethereum、Unichain、Optimism、Base、Arbitrum、Monad；WstETHHook 处理 stETH↔wstETH 的动态汇率；二者由 OpenZeppelin 于 2025-04-24 审计 | Uniswap/v4-hooks-public README @ `e4eabe5` | observed | P |
| G8 | Permissioned Pools 的发布博客活动代码为 2026-07；发布伙伴为 Superstate、Securitize、Dowgo，其中 Dowgo 要在获得欧盟 DLT Pilot Regime 的 DLT TSS 授权后才使用 | Uniswap Blog《Introducing Permissioned Pools on Uniswap v4》（UTM `permissioned-pools-202607`），访问于 2026-10-06；GPT Deep Research 给出的 2026-07-23 未在页面上看到 | observed | E、H、N |
| G9 | v4-periphery `9969eec`（2026-09-18）是 Permissioned Pools 的修复提交：mint / increase 时拒绝未验证的 adapter 与非合约的池币种 | gh api `repos/Uniswap/v4-periphery/commits/9969eec`，提交信息 “fix(perm-pools): reject unverified-adapter and non-contract pool currency on mint/increase (#603)” | observed | E、H |
| G10 | SMBC Nikko 与 Nethermind 于 2026-10-02 宣布在 Uniswap v4 上建 Japan DeFi Gateway：池内 hook 执行 AML/CFT 与投资者保护，目标 2027 年中完成 | Uniswap Blog《SMBC Nikko and Nethermind Are Building a DeFi Gateway for Japan on Uniswap v4》，访问于 2026-10-06；日期取自博客链接的新闻稿文件名 `261002_01e.pdf` | observed | E、H、N |
| G11 | Uniswap Foundation 称 v4 已有 “1,000+ hooks initialized”（Hook Design Lab 发布时） | Uniswap Foundation Blog《Introducing the Uniswap v4 Hook Design Lab》，访问于 2026-10-06；页面未显示日期，GPT Deep Research 称 2025-06-09 | observed | D、T |
| G12 | Mantle v2 Tectonic 起 MNT 是原生代币，gas 以 MNT 计价；v4 中 `address(0)` 代表的原生币在 Mantle 上是 MNT | docs.mantle.xyz/network/llms-full.txt “Native Token Migration” 与 gas 一节，访问于 2026-10-06 | observed | R、F11 |
| G13 | 线性曲线 p(s)=1+0.01s 在 s=100 毕业时 P*=2、募集 R_Q=150；按全区间在 P*=2 注入需要 Q/M=2，即 75 M + 150 Q，若直接注入 100 M + 150 Q（比例 1.5）会造成毕业价格跳变 | 由积分 R_Q=∫₀¹⁰⁰(1+0.01u)du 与全区间头寸两侧价值比推出；例子来自 gpt-deep-research.md §5.6，主会话复算 | inferred | O |
| G14 | 股票代币的美元预言机不能直接判断 meme/股票池价格是否偏离：P_M/USD = P_M/Q × P_Q/USD，缺少 meme 的公允价 | 由价格链式关系推出；gpt-deep-research.md §5.10 | inferred | O、F8 |
| G15 | 因为官方 API 只把许可代币当作交易的输入或输出，USDC → 股票 → meme 这类以许可股票为中间跳的路径不能走官方路由 | 由 R 分册中 Uniswap Docs “Swapping through Permissioned Pools” 的原文推出；gpt-deep-research.md §7.2 | inferred | F5 |
| G16 | “不迁池”不是 v4 独有：从一开始就用集中流动性头寸模拟发行曲线（B 类），v3 也能做到；v4 独有的是“自定义记账曲线 → 原生集中流动性、同一 PoolId”（C 类） | 由 V 分册 v3 能力表、R 分册 4.2 对照表（PAIR、Doppler noOp）推出 | inferred | C、F、O |
| G17 | 跨毕业阈值的订单有三种处理方式：Router 在链上裁剪到剩余容量（最易证明）、同一 unlock 内拆成两笔 swap、单次 beforeSwap 内先吃曲线再把余量交给 CL（untoll-hook 的 no-straddle 属于此类） | gpt-deep-research.md §5.7 的设计分析；R 分册 4.1 untoll-hook L576-607 | inferred | O |
| G18 | PureFi Verifier Hook 是凭证型准入的公开参考实现：issuer 签发数据包、Router 放入 hookData、hook 验证 issuer 与规则 | 仅见于 gpt-deep-research.md §4.7（指向 github.com/purefiprotocol/purefi-verifier-hook），主会话未读源码 | speculative | N、T |
| G19 | GPT Deep Research 使用的 v4-core `59d3ecf`（v1.0.2，2025-05-13）与本报告基准 `46c6834` 之间只差 CI 工作流文件，合约源码相同 | gh api compare `59d3ecf...46c6834`：ahead 9，变更文件全部在 `.github/workflows/` | observed | U |
| G20 | Uniswap 官方 `deployments.json`（generatedAt 2026-09-22）中 v4 PoolManager 部署在 25 条链（含测试网），Mantle（chainId 5000）只有 v3、Permit2 与 Universal Router | 主会话下载 developers.uniswap.org/deployments.json 后按记录 id 统计，2026-10-06 | observed | D、F11 |

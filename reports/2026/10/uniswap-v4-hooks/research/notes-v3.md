# notes-v3：hook 是否依赖 v4 架构、能否在 v3 上实现；工程与安全（brief 研究问题 2、6）

研究问题：v3 的核心里有没有 “hook” 的入口？逐项看 v4 hook 能力在 v3 上能否近似实现、代价是什么；已有的 “v3 系 + 插件” 怎么做；v4 hook 常见漏洞、聚合器路由条件和采用数据。
一句话答案：v3 只有一种回调，它回调的是**调用者自己**（`msg.sender`），用来付款，不是池子挂的逻辑。所以凡是“无论谁来调用都必须执行”的能力，在 v3 核心里都没有入口，包括准入、动态费、改记账和曲线、池内相变。做在 router 层的近似都能被绕过：直接调 `pool.swap` 就行。代币层控制在 v3 上反而有效，因为每笔 swap 都会真实转账。真正离不开 v4 架构的，是三件事：PoolManager 单例（建池便宜、多跳不转中间币）、flash accounting（按差额结算）、return delta（hook 改写记账）。v4 hook 的事故都出在 hook 自己的应用逻辑上，不在 PoolManager。典型是 Cork（缺调用者校验）和 Bunni（取整）。聚合器不会自动路由带 hook 的池子。
口径：v3-core 固定在 `d0831dc`（2026-04-30，相对 `d8b1c63` 只改了 CI），v3-periphery 固定在 `0682387`，v4-core 固定在 `46c6834`，v4-periphery 固定在 `9969eec`，uniroute-public 固定在 `dfe1baa`（2026-10-05）。网页访问日期均为 2026-10-06，另行注明的除外。

---

## Q1 v3 的架构事实：hook 能力在哪里没有入口

**答案**：v3 的结构是每池一个合约（Factory 用 CREATE2 部署）。池子的参数是 immutable，手续费档位由 Factory owner 白名单开放。`swap` / `mint` / `flash` 的回调只回调 `msg.sender`，用途是“你欠多少就在回调里付”，池子靠前后余额差确认收款。池子里没有可供第三方记账的 delta 表。协议费是 swap 费的 1/N（N=4…10），由 Factory owner 设置。因此 v3 里没有“池子创建者挂在池上、对所有调用者强制执行”的逻辑位置。

**依据**
- 每池一个合约：`createPool` 先检查费率档已启用、池子尚不存在，然后 `deploy`。`deploy` 用 `new UniswapV3Pool{salt: keccak256(abi.encode(token0, token1, fee))}()`，也就是 CREATE2 [1 L35-51][2 L27-37]。
- 费用档位固定：构造函数只开放 500/3000/10000 三档，对应 tickSpacing 10/60/200 [1 L26-31]。新增档位只有 owner 能调 `enableFeeAmount`，且档位一经开放不可改 [1 L62-73]。池内的 `fee` 是 `immutable` [3 L48]，每一步 swap 都把它传给 `SwapMath.computeSwapStep` [3 L662-670]。
- 回调只为付款：`mint` 在算出应付额后调用 `IUniswapV3MintCallback(msg.sender).uniswapV3MintCallback`，再用 `balance0Before.add(amount0) <= balance0()` 校验 [3 L478-484]。`swap` 先把输出币 `safeTransfer` 给 `recipient`，再回调 `msg.sender`，最后检查 `'IIA'` [3 L773-785]。`flash` 同理 [3 L792-835]。
- 池子入口不限调用者：`swap` 只有 `noDelegateCall` 修饰 [3 L596-602]；`mint` 只有 `lock` [3 L457-463]；`initialize` 只要求 `sqrtPriceX96 == 0`，没有访问控制 [3 L271-272]。
- 没有池内记账：v3 用 `lock` 互斥加余额检查来确认付款，源码注释写明“we use balance checks to determine the payment status”[3 L101-109]。swap 后只更新 `feeGrowthGlobal` 和 `protocolFees` [3 L755-766]。
- 协议费：`setFeeProtocol` 由 `onlyFactoryOwner` 调用，取值为 0 或 4…10 [3 L838-846]；swap 中按 `feeAmount / feeProtocol` 抽取 [3 L680-685]。
- 回调校验保护的是 router，不是池子：v3 `SwapRouter.uniswapV3SwapCallback` 用 `CallbackValidation.verifyCallback(factory, …)` 确认回调方是正牌池子 [4 L65]。池子本身并不关心是谁来调用。

**不确定之处**：PancakeSwap v3 等 v3 fork 的具体改动没有逐一核对。本节只适用于 Uniswap v3-core 原版。

---

## Q2 逐项判断：能力 → v4 依赖 → v3 上的近似 → 代价与漏洞

**答案（总括）**：九项能力分三类。
- 第一类，**v3 核心完全做不到、外部包装也做不到**：低成本建池、多跳 flash accounting、自定义曲线 / return delta、池内毕业。只能 fork 核心，或者干脆另写一个 AMM。
- 第二类，**只能在 router 或 keeper 层近似、但可被绕过或要额外信任**：动态费、限价单 / TWAMM、MEV 拍卖。
- 第三类，**有可行的非 router 近似**：准入（代币层控制）、native ETH（router 自动 wrap）。

**重点：为什么 router 层准入能被绕过**。
- v3 的 `pool.swap` 对任何调用者开放 [3 L596-602]。攻击者部署一个实现了 `uniswapV3SwapCallback` 的合约，就能直接调池子。池子只检查余额有没有到账 [3 L776-778]，不关心调用方是不是“KYC router”。
- LP 侧同理：`pool.mint` 绕开 NonfungiblePositionManager 直接调用即可 [3 L457-484]。
- v4 也一样：任何合约都能自己 `unlock` 后调 `PoolManager.swap`，它只要求处于 unlocked 状态 [5 L104-114, L187-191]。区别在于 v4 的 `swap` 内部**必然**调用 `key.hooks.beforeSwap` [5 L202]，所以准入只有写进 hook 才有约束力。

| 能力 | v4 依赖什么 | v3 上的近似实现 | 代价与漏洞 |
|---|---|---|---|
| 准入控制（allowlist） | PoolManager 对每次 swap、改流动性、初始化都调用 hook [5 L130, L156, L202]。hook 地址写进 PoolKey，不可更换 [10 Fig.2] | (a) router 层检查；(b) 代币层：许可代币在 `transfer` 时查 from/to。v3 swap 真实转账给 recipient [3 L774, L780]，付款方在回调里向池子转账；(c) fork 核心加插件，如 Algebra Access List [16] | (a) 直接调池子就能绕过，形同虚设；(b) 能用，但必须是发行方控制的代币；它区分不了 swap 和普通转账，池子地址也得进白名单；(c) 要自审核心，并脱离 Uniswap 的路由和流动性 |
| 动态手续费 | 池子 `fee` 带动态标志；`beforeSwap` 第三个返回值 `lpFeeOverride` [6 L263]，或由 hook 调 `updateDynamicLPFee` [5 L339-346] | router 加价；或者开多个费率档池子，由路由去选；或 fork（Algebra dynamic fee / override fee）[13][15] | router 加的费 LP 收不到，直接调池子还能绕开；多档池子会碎片化流动性；新档位要 Factory owner 开放 [1 L62-73] |
| 自定义曲线 / 自定义记账（return delta） | `beforeSwapReturnDelta` 改写 `amountToSwap`，且不允许翻转 exactIn/Out [6 L266-279]；hookDelta 由调用者承担 [6 L311-312]；吃掉全部输入就成了 NoOp swap，跳过 CL 数学 [9] | 没有入口：swap 数学写死在 `computeSwapStep` [3 L662-670]。只能另写 AMM 合约，或 fork | 另写的 AMM 已经不是 v3 池，不共享流动性、路由和审计；fork 要承担核心审计 |
| 池内毕业 / 相变 | hook 持有状态并用 return delta 报曲线价，达标后交还 CL 数学，全程同一个 PoolId（设计模式，见 meme-launchpad notes-mechanism M46） | 做不到。曲线合约毕业后只能把储备迁到一个 v3 池 | 迁移要先建池，但 v3 的 `initialize` 谁都能抢先调用 [3 L271-272]。four.meme 2025-02-11 被抢先以极端价格初始化 PancakeSwap V3 池，损失约 $183K [27] |
| 限价单 / TWAMM | `afterSwap` 能看到 swap 后的 tick，可在同一笔交易里成交挂单；TWAMM 在 `beforeSwap` 结算累计订单 [8][9 “TWAMM-style flows”] | 限价单：用区间外的单边头寸当 range order，但成交后不会自动撤出。TWAMM：外部合约加 keeper 定期打池子 | 需要 keeper（信任、活性、gas）；range order 价格回穿会反向成交；执行时机暴露给 MEV（inferred） |
| MEV 拍卖 / 排序保护 | `beforeSwap` 可以拒绝不满足条件的 swap，例如没拿到本区块授权的交易；hook 对每笔 swap 必经 [5 L202] | router 层检查（可绕过）或 fork 核心 | 池子入口开放 [3 L596-602]，未经授权的交易可以直接打池子，拍卖规则在池层无法强制（inferred） |
| 低成本建池 | 单例：建池只是一次状态更新，不部署合约 [8] | 无法近似：每池一次 CREATE2 部署整份合约 [2 L35] | 部署成本高，链上状态膨胀；具体 gas 差值没有一手数据（见开放问题） |
| 多跳 flash accounting | `unlock` 会话内对 delta 做净额，结束时 `NonzeroDeltaCount != 0` 就 revert [5 L104-114]；多跳不为中间池转币 [8] | 无法近似：v3 `exactInput` 把中间币先打给 router 托管，再在下一跳回调里付出 [4 L147] | 每个中间跳多两次 ERC-20 转账；fee-on-transfer 一类代币会在中间跳出错（inferred） |
| native ETH | `Currency` 可以是 `address(0)`；`_settle` 对原生币直接读 `msg.value` [5 L348-363]；文档称不需要 WETH [8] | router 自动 wrap / unwrap WETH9；池子本身只认 ERC-20，`createPool` 要求 `token0 != address(0)` [1 L42] | 多一次 wrap/unwrap 的 gas；功能上等价 |

**顺带一条（准入方向，与合规 lane 交叉）**：v4 hook 收到的 `sender` 是 PoolManager 的 `msg.sender`，也就是 router，不是终端用户 [6 L256 `abi.encodeCall(IHooks.beforeSwap, (msg.sender, …))`]。所以 hook 层的 allowlist 必须换一种方式识别用户：要么只信任暴露 `msgSender()` 的 router，要么用 `tx.origin`，要么在 hookData 里放签名。Algebra 的 Access List 插件选了 `tx.origin`，并写明代价是对账户抽象钱包和 relayer 的兼容性差 [16]。另外，hook 自己发起的操作不会触发它自己的回调（`noSelfCall` / `msg.sender == address(self)` 时直接返回）[6 L170-175, L253]。

**不确定之处**
- “v4 上代币层黑名单看不到池内换手”这条论断（用户资料 [28] §3.1）需要细化。v4 的 `take` 仍然是一次真实的 ERC-20 转账 [5 L291-297]，代币能看到最终收款人。真正看不到的是：ERC-6909 claim 的铸造和转让（`mint` 只记 delta、不转 ERC-20）[5 L322-329]，以及多跳里净额为零、从不落地的中间币（inferred）。
- 限价单 / TWAMM / MEV 拍卖三行的 v4 侧机制属于其他 lane，这里只列它依赖哪个回调，没有读具体 hook 源码。

---

## Q3 已有的“v3 系 + 插件”与 v4 式 hook 先例（只做对照）

**答案**：三家各自独立走到了类似的回调模型，差别集中在四个维度：池子是否单例、hook 能否更换、权限怎么声明、hook 能否改记账。

| 维度 | Uniswap v4 | Algebra Integral（v3 系插件） | PancakeSwap Infinity | Balancer v3 |
|---|---|---|---|---|
| 池结构 | 单例 PoolManager [8] | 每池独立合约，官方明确“keeps pools separated”[14] | 每种 AMM 一个单例 PoolManager（CL、Bin），共用一个 Vault [17] | Vault 加池合约，hook 是独立合约 [18] |
| 谁能挂 hook | 任何人建池时都可以指定 [5 L117-142] | DEX 管理员 / DAO 控制，“does not grant these rights to just anyone”[14] | 建池时写进 PoolKey [17] | 注册池子时传入，hook 在 `onRegister` 里可以拒绝 [18] |
| 能否更换 | 不能，hook 地址属于 PoolKey 和 PoolId 的一部分 [10] | **能**：Factory owner 或 `POOLS_ADMINISTRATOR` 通过 `setPlugin` 更换；还支持 Beacon Proxy 一次升级所有池子的插件 [13] | 不能，回调权限存在 `poolKey.parameters`，要改只能新建池子 [17] | 不能，注册后不可变 [18] |
| 权限声明 | 地址低 14 位，需要挖 CREATE2 地址 [6 L27-47] | 池内 bitmap 存插件配置，`beforeInitialize` 无条件调用 [13] | hook 可以部署在任意地址，`getHooksRegistrationBitmap()` 的 16 位写进 PoolKey，不用挖地址 [17] | `getHookFlags()` 在注册时读入 Vault [18] |
| 改记账 / 曲线 | 4 个 return-delta 权限，可以完全接管 swap [6 L44-47][9] | v1.2 起只能返回 plugin fee 和 override fee，plugin fee 从 swap 金额里扣 [15]；不改曲线（文档未见此能力） | 与 v4 相同的 4 个 return delta，外加 lpFeeOverride [17] | 只能在 after hook 里改 `amountCalculated`，且要开 `enableHookAdjustedAmounts` [18] |
| 重入 | 由 Lock / unlock 会话约束 [5 L104-114] | 插件回调池子时禁用 hook，防止递归 [15] | 与 v4 相同（inferred） | swap、流动性和动态费 hook 可重入 Vault [18] |

**不确定之处**：PancakeSwap Infinity 的 Vault 结算细节没有读源码。Balancer v3 是否用 transient storage 实现“credit and debt tab”，本 lane 没有核实。

---

## Q4 工程与安全

### 4.1 常见 hook 漏洞类别

**答案**：Trail of Bits 汇总了七类反复出现的模式，Uniswap Foundation 的安全框架给出了对应的风险维度 [9][10]。PoolManager 只保证结算闭合（`NonzeroDeltaCount == 0`），**不验证 hook 内部账目对不对** [5 L112][10 §3]。

| 类别 | 机制 | 证据 / 案例 |
|---|---|---|
| 回调缺少 onlyPoolManager | hook 回调是 external 函数，谁都能直接调 | v4-periphery `ImmutableState.onlyPoolManager` [7 L17-20]。Cork 2025-05-28：攻击合约绕过 CorkHook `beforeSwap` 对 hookData 的授权，伪造 caller 和金额，提走 3,761 wstETH [11]；ToB 估约 $12M [10]。Cork 用的 periphery 版本早于 2025-02-06 加入显式授权检查的提交 [11] |
| 信任任意 PoolKey | 建池无许可，攻击者可以建一个挂你 hook、但代币由他选的池子 | ToB §2；Spearbit 的 SVFHook finding（自定义池子刷积分）[10] |
| delta 记账错误 / 取整 | 结算闭合不等于账目正确 | Bunni 2025-09-02 损失约 $8.4M：闪电贷推价，再做 44 次微额 withdraw，利用取整把 active balance 从 28 wei 压到 4 wei，最后夹自己 [12]。官方结论是“safe in isolation”的取整方向在多步组合下失效 [12] |
| return delta / NoOp 被滥用 | hookDelta 由调用者承担 [6 L311-312]；吃掉全部输入就绕开了 CL 数学 | [9] “BeforeSwapDelta and NoOp override risks”。用户侧唯一的保护是 router 的最小输出（inferred） |
| 权限位与实现不一致 | 少一个 ReturnDelta 位，PoolManager 就把返回的 delta 当成 0 | Cyfrin 的 Angstrom finding：缺 `afterSwapReturnDelta` 位，开启协议费后每笔 swap 都 `CurrencyNotSettled` [10] |
| 可升级 hook、管理员权限 | 地址位固定，但 proxy 背后的代码可以换 | [9] Upgradeability hazards，推荐多签加时间锁；[10] §5。Algebra 插件本身就设计成可更换、可 Beacon 批量升级 [13] |
| 恶意 hook / DoS | after 回调 revert 会连带父操作，LP 可能无法撤出 | [10] §6；0x 转述 Uniswap 的提示：hook 可能是恶意的 [24] |
| 重入、transient state 假设 | hook 外部调用会打开整个执行环境；同一个 hook 服务多个池子；多跳时一笔交易内会被调用多次 | [9] “External calls, reentrancy”“Multi-pool and routing interactions”“Flash accounting and transient state risks”；[10] §7 |

### 4.2 聚合器是否路由带 hook 的池

**答案**：都不自动路由，规则各不相同。
- **Uniswap 自家路由**（uniroute）：只有满足以下全部条件的池子会进入普通 TVL 队列——无 hook，或者 hook 不带 swap 权限、不带 return delta、不是动态费，并且费率在合理上限内 [21 L147-153]。
  - 不满足这些条件的，可以走“自动白名单”（非主流交易对、无自定义记账、非动态费）[21 `isAutoAllowlistedHook`]，或者人工白名单 [22]。
  - 人工白名单申请表写明：地址以 0x91 开头、或使用 ReturnsDelta / dynamicFees 的 hook 需要申请审核，审核“not a security audit”[20]。
  - 许可池（permissioned hook）另有通道，要求池子一端是该 hook 名下的 adapter 代币 [21]。
  - hook 方也可以自己跑 UniswapX filler 来接 interface 的订单流 [19]。
- **1inch**：hook 的行为必须能被 Pathfinder 建模，否则不路由，“not automatically routable … simply because it exists”[23]。
- **0x**：需要提交 Custom v4 Hook Request，由团队审核 [24]。

**用户资料对照**：[28] §3.4 预计 1inch / UniswapX 会跳过认不出 Adapter 的池子。1inch 的公开规则 [23] 和 uniroute 的 adapter 所有权检查 [21] 都支持这个判断。

### 4.3 hook 生态采用数据

**答案**：没有拿到一手的 Dune 数据（dune.com 返回 403），二手数字互相矛盾，统一标 speculative。
- CryptoBriefing 称“超过 90,000 个唯一 hook 地址已初始化并挂在至少一个池子上”，此前约 22,609。但文中时间线自相矛盾：一处说“Early in 2026”，一处又说“By mid-January 2026”[25]。
- Beelaa 称截至 2026-06 有 4.1 万个以上 hook、带 hook 池子占成交量的 15%–20% [26]。
- 两者都没有给出 Dune 查询 ID 或口径。另有转述把 v4 上线时间写成“2025 年 6 月”，与实际（2025-01-31）不符 [25 的转载，cryptomat]。

---

## 图的素材

**A. v3 与 v4 的调用关系对比（参与者、调用顺序）**
- v3 swap：User → Router → `Pool.swap` → Pool `safeTransfer(out → recipient)` → `Router.uniswapV3SwapCallback`（Router 用 `verifyCallback` 确认是正牌池子）→ Router `transferFrom(user → pool)` → Pool 检查 `IIA` 余额 [3 L773-785][4 L65]
- v3 绕过路径：攻击合约 → `Pool.swap` → `攻击合约.uniswapV3SwapCallback` → 付款 → 通过（router 层检查被绕开）[3 L596-602, L776-778]
- v4 swap：User → Router → `PoolManager.unlock` → `Router.unlockCallback` → `PoolManager.swap` → `Hook.beforeSwap`（不可跳过）→ Pool 数学 → `Hook.afterSwap` → 记 delta → Router `settle` / `take` → `unlock` 检查 `NonzeroDeltaCount == 0` [5 L104-114, L187-227]
- v4 “自己 unlock”路径：攻击合约 → `PoolManager.unlock` → `swap` → 仍然调用 `Hook.beforeSwap` [5 L202]

**B. 能力依赖矩阵（行：能力；列：单例 / flash accounting / return delta / 必经回调 / 动态费标志）[5][6][8]**
- 准入：必经回调
- 动态费：必经回调 + 动态费标志
- 自定义曲线：必经回调 + return delta + flash accounting
- 池内毕业：必经回调 + return delta + hook 状态
- 限价单 / TWAMM：必经回调（afterSwap / beforeSwap）
- MEV 拍卖：必经回调
- 低成本建池：单例
- 多跳：单例 + flash accounting
- native ETH：单例结算（`_settle` 的 msg.value 分支）

**C. 插件体系对照维度**：池结构 / 谁能挂 / 能否更换 / 权限声明 / 改记账 / 重入（取值见 Q3 表）[13]-[18]

**D. 事故时间线**
- 2025-01-30：Cork 上线，使用旧版 periphery [11]
- 2025-02-06：v4-periphery 加入显式授权检查 [11]
- 2025-02-11：four.meme 的 v3 系池被抢先初始化（约 $183K）[27]
- 2025-05-28 11:39 UTC：Cork 被攻击，3,761 wstETH [11]
- 2025-09-02：Bunni 被攻击，约 $8.4M [12]
- 2026-07-30：ToB 发布 hook 安全七类模式 [10]

**E. uniroute 判定流程（状态与转移）[21]**
- hook 在 denylist → 拒绝
- 是 permissioned hook → adapter 所有权检查 → 通过或拒绝
- 可路由（无 hook，或无 swap 权限、无 return delta、非动态费，且费率合理）→ 进入 TVL 前 10 队列
- 否则若符合自动白名单（非主流交易对、无 return delta、非动态费）→ 进入另一个 TVL 队列
- 否则若在显式白名单 → 追加
- 都不满足 → 不路由

---

## 代码素材

**1. v3：回调只回调调用者，用余额差确认付款**（Uniswap/v3-core/contracts/UniswapV3Pool.sol#L773-L785@d0831dc6b8a318df3872b6d68f6de135c9f3ec29）
```solidity
if (zeroForOne) {
    if (amount1 < 0) TransferHelper.safeTransfer(token1, recipient, uint256(-amount1));

    uint256 balance0Before = balance0();
    IUniswapV3SwapCallback(msg.sender).uniswapV3SwapCallback(amount0, amount1, data);
    require(balance0Before.add(uint256(amount0)) <= balance0(), 'IIA');
} else {
    if (amount0 < 0) TransferHelper.safeTransfer(token0, recipient, uint256(-amount0));

    uint256 balance1Before = balance1();
    IUniswapV3SwapCallback(msg.sender).uniswapV3SwapCallback(amount0, amount1, data);
    require(balance1Before.add(uint256(amount1)) <= balance1(), 'IIA');
}
```

**2. v3：手续费档位只能由 owner 开放**（Uniswap/v3-core/contracts/UniswapV3Factory.sol#L62-L73@d0831dc）
```solidity
function enableFeeAmount(uint24 fee, int24 tickSpacing) public override {
    require(msg.sender == owner);
    require(fee < 1000000);
    // ...
    require(tickSpacing > 0 && tickSpacing < 16384);
    require(feeAmountTickSpacing[fee] == 0);
    feeAmountTickSpacing[fee] = tickSpacing;
    emit FeeAmountEnabled(fee, tickSpacing);
}
```

**3. v4：swap 内必经 hook，hookDelta 记给 hook、余下记给调用者**（Uniswap/v4-core/src/PoolManager.sol#L198-L226@46c6834698c48bc4a463a86d8420f4eb1d7f3b75，有删节）
```solidity
BeforeSwapDelta beforeSwapDelta;
{
    int256 amountToSwap;
    uint24 lpFeeOverride;
    (amountToSwap, beforeSwapDelta, lpFeeOverride) = key.hooks.beforeSwap(key, params, hookData);
    swapDelta = _swap(pool, id, Pool.SwapParams({ /* amountSpecified: amountToSwap, lpFeeOverride */ }), /* input */);
}
BalanceDelta hookDelta;
(swapDelta, hookDelta) = key.hooks.afterSwap(key, params, swapDelta, hookData, beforeSwapDelta);
if (hookDelta != BalanceDeltaLibrary.ZERO_DELTA) _accountPoolBalanceDelta(key, hookDelta, address(key.hooks));
_accountPoolBalanceDelta(key, swapDelta, msg.sender);
```

**4. v4-periphery：hook 回调的调用者校验**（Uniswap/v4-periphery/src/base/ImmutableState.sol#L17-L20@9969eec44cfdf07e24b41de47f40276a58401976）
```solidity
modifier onlyPoolManager() {
    if (msg.sender != address(poolManager)) revert NotPoolManager();
    _;
}
```

**5. uniroute：哪些 v4 池子默认可路由**（Uniswap/uniroute-public/src/lib/poolCaching/util/v4HooksPoolsFiltering.ts#L147-L153@dfe1baafac9f3c52650b87539b0bd1b53ac4550d）
```ts
return (
  isFeeTierWithinSanityCeiling(pool) &&
  (pool.hooks === ADDRESS_ZERO ||
    (!Hook.hasSwapPermissions(pool.hooks) &&
      !hasCustomAccountingPermissions(pool.hooks) &&
      !isDynamicFeePool(pool, chainId, logger)))
);
```

---

## 来源

1. **PRIMARY** Uniswap/v3-core @ `d0831dc6b8a318df3872b6d68f6de135c9f3ec29` `contracts/UniswapV3Factory.sol`：证明 createPool 无许可、费率档只有 owner 能开放、初始三档、`token0 != address(0)`。
2. **PRIMARY** 同上 `contracts/UniswapV3PoolDeployer.sol`：证明每池用 CREATE2 部署一个合约。
3. **PRIMARY** 同上 `contracts/UniswapV3Pool.sol`：证明 fee immutable、回调只回调 msg.sender 并以余额差确认付款、swap / mint / initialize 不限调用者、协议费的设置与抽取。
4. **PRIMARY** Uniswap/v3-periphery @ `0682387198a24c7cd63566a2c58398533860a5d1` `contracts/SwapRouter.sol`：证明 router 校验回调方是正牌池子、多跳时中间币由 router 托管。
5. **PRIMARY** Uniswap/v4-core @ `46c6834698c48bc4a463a86d8420f4eb1d7f3b75` `src/PoolManager.sol`：证明 unlock / NonzeroDeltaCount 结算、swap 必经 hook、hookDelta 的记账对象、take / 6909 mint、updateDynamicLPFee 只允许 hook 调用、原生币结算。
6. **PRIMARY** 同上 `src/libraries/Hooks.sol`：证明 14 位权限、ReturnDelta 规则、hook 收到的 sender 是 msg.sender、noSelfCall、caller 承担 hookDelta。
7. **PRIMARY** Uniswap/v4-periphery @ `9969eec44cfdf07e24b41de47f40276a58401976` `src/base/ImmutableState.sol`：证明官方 `onlyPoolManager` 的实现。
8. **PRIMARY** Uniswap Developers “Uniswap v4 Architecture”（developers.uniswap.org/docs/protocols/v4/concepts/architecture，访问于 2026-10-06）：证明单例下建池只是状态更新、多跳不转中间币、flash accounting 基于 EIP-1153、原生 ETH、custom accounting 的用途。
9. **PRIMARY** Uniswap Developers “Security Framework”（/docs/protocols/v4/security，访问于 2026-10-06）：证明官方列出的 hook 风险类别（delta、NoOp、权限位、可升级、transient state、多跳）及推荐措施。
10. **PRIMARY（审计方）** Trail of Bits “Building secure Uniswap v4 hooks”（2026-07-30，访问于 2026-10-06）：证明七类漏洞模式、Cork 约 $12M、SVFHook / Angstrom / LiquidityPenaltyHook 等 findings、PoolManager 不验证 hook 内部账目。
11. **PRIMARY（事故方）** Cork “May 28 2025 Exploit Post-Mortem”（cork.tech/blog/post-mortem，2025-06-04，访问于 2026-10-06）：证明 3,761 wstETH、CorkHook beforeSwap 的 hookData 授权被绕过、所用 periphery 版本早于 2025-02-06 的授权检查提交。
12. **PRIMARY（事故方）** Bunni “Exploit Post Mortem”（blog.bunni.xyz，访问于 2026-10-06）：证明约 $8.4M、44 次微额 withdraw、取整方向是根因。
13. **PRIMARY** Algebra Integral Docs “Plugins”（core-logic/plugins，访问于 2026-10-06）：证明插件 hook 列表、bitmap 配置、插件可被更换、Beacon Proxy 批量升级。
14. **PRIMARY** Algebra Docs “Integral vs. Uniswap V4: Key Differences”：证明池子相互独立、插件由管理员 / DAO 控制、插件可更换。
15. **PRIMARY** Algebra Docs “Changes v1.2”：证明 plugin fee / override fee 在 beforeSwap 返回、插件回调池子时禁用 hook。
16. **PRIMARY** Algebra Docs “Access List”：证明准入插件用 tx.origin 识别用户及其代价、撤流动性不设检查。
17. **PRIMARY** PancakeSwap Developer：Infinity Overview、AMM Layer、Custom Layer Hook（访问于 2026-10-06）：证明 Vault + 多个 PoolManager、hook 可部署在任意地址、权限 bitmap 写进 poolKey.parameters、4 个 return delta、lpFeeOverride。
18. **PRIMARY** Balancer Docs “Hooks”（docs.balancer.fi/concepts/core-concepts/hooks.html）：证明 HookFlags 在注册时固定、onRegister 可拒绝、只能改 amountCalculated、hook 可重入 Vault。
19. **PRIMARY** Uniswap Developers “Integrated Routing with UniswapX”（/docs/protocols/v4/concepts/hook-routing）：证明 interface 逐步支持 hook、hook 方可以自己跑 filler。
20. **PRIMARY** Uniswap “v4 Hooks Routing Allowlist” 表单页（developers.uniswap.org/hook-allowlist）：证明哪些 hook 需要申请、审核不等于安全审计、要求源码在浏览器验证。
21. **PRIMARY** Uniswap/uniroute-public @ `dfe1baafac9f3c52650b87539b0bd1b53ac4550d` `src/lib/poolCaching/util/v4HooksPoolsFiltering.ts`：证明默认可路由条件、自动白名单条件、permissioned hook 的 adapter 所有权检查。
22. **PRIMARY** 同上 `hooksAddressesAllowlist.ts`（86,568 字符 / 2,079 行）：证明显式白名单的存在与形态（含 Clanker、Zora、Doppler、Flaunch、limit order、TWAMM 等 hook 地址），以及 ZLCA hook 的每跳 gas 开销估计（如 250k–3M gas）。
23. **PRIMARY** 1inch Help “Why 1inch May Not Route Through Certain Liquidity Pools”（访问于 2026-10-06）：证明带 hook 的池子不会被自动路由，必须由 Pathfinder 支持。
24. **PRIMARY** 0x Help “What are custom Uniswap v4 hooks?”（访问于 2026-10-06）：证明 0x 需要提交申请、经审核后才集成。
25. 二手：CryptoBriefing “Uniswap v4 hits over 90K hooks initialized…”（访问于 2026-10-06）：线索，hook 地址数约 9 万，口径和日期不清。
26. 二手：Beelaa “Uniswap V4 in 2026”（访问于 2026-10-06）：线索，4.1 万 hook，带 hook 池子占成交量 15–20%（2026-06），无口径。
27. **PRIMARY（安全方，经 meme-launchpad notes-mechanism 2026-10-05 核实）** SlowMist Hacked 2025-02-11 条目、DeFiHackLabs `src/test/2025-02/FourMeme_exp.sol`：证明 v3 系池子可被抢先初始化，four.meme 损失约 $183K。
28. 用户资料：`2-meme-launchpad/outputs/05-compliance-and-permissioning.md`（mantle-v3-roadmap @ `b819a33`）§3.1、§3.3、§3.4：用户关于代币黑名单、单 hook 合并、聚合器跳过 adapter 池的判断。

---

## 开放问题

1. v3 `createPool` 与 v4 `initialize` 的实测 gas 差值。官方只给定性说法，需要在同一条链上各跑一次。
2. 带 hook 池子的成交占比与 hook 数量：需要拿到 Uniswap Labs 官方 Dune 看板（v4-launch-metrics-tracker）的查询 ID 和口径，目前被 403 挡住。
3. Uniswap 支持页“Routing for hooked pools”的允许条件全文（403），以及白名单为什么特别点名“0x91 开头”的地址（推测与某个特定权限位组合有关，未核实）。
4. Algebra Integral 能否通过插件改写 swap 金额（类似 return delta）。v1.2 文档只见 plugin fee 和 override fee。
5. PancakeSwap Infinity 与 Balancer v3 的 Vault 是否都用 EIP-1153 transient storage 做净额结算（需要读 infinity-core / balancer-v3-monorepo 源码）。
6. Cork 被绕过的具体代码行：需要对照 v4-periphery `fc37d17` 的 diff 和 CorkHook 源码，确认缺的是 `onlyPoolManager`，还是 hookData 的 caller 授权。

---

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| V1 | v3 每个池子是一个独立合约，由 Factory 经 PoolDeployer 用 CREATE2（salt = token0、token1、fee）部署 | [1] UniswapV3Factory.sol#L35-51、[2] UniswapV3PoolDeployer.sol#L35 @d0831dc | observed | |
| V2 | v3 Factory 初始只开放 500/3000/10000 三档费率（tickSpacing 10/60/200），新增档位只有 owner 能调 enableFeeAmount，开放后不可改 | [1] UniswapV3Factory.sol#L26-31、#L62-73 @d0831dc | observed | |
| V3 | v3 池子的 fee 是 immutable，每步 swap 都用它计算，池子无法按笔改费 | [3] UniswapV3Pool.sol#L48、#L662-670 @d0831dc | observed | |
| V4 | v3 的 mint / swap / flash 回调只回调 msg.sender，作用是收款，池子用前后余额差确认 | [3] UniswapV3Pool.sol#L478-484、#L773-785、#L792-835 @d0831dc | observed | |
| V5 | v3 的 swap 只有 noDelegateCall 修饰，mint 只有 lock，任何合约都可以直接调用 | [3] UniswapV3Pool.sol#L596-602、#L457-463 @d0831dc | observed | |
| V6 | v3 的 initialize 没有访问控制，只要求尚未初始化 | [3] UniswapV3Pool.sol#L271-272 @d0831dc | observed | |
| V7 | v3 池内没有供第三方使用的 delta 账本，付款状态靠 lock 加余额检查确定 | [3] UniswapV3Pool.sol#L101-109 注释 “we use balance checks to determine the payment status” | observed | |
| V8 | v3 协议费为 swap 费的 1/N（N=0 或 4…10），只有 Factory owner 能设置 | [3] UniswapV3Pool.sol#L838-846、#L680-685 | observed | |
| V9 | v3 核心没有“池子创建者挂在池上、对所有调用者强制执行”的逻辑入口；v3 回调是调用者的逻辑，不是池子的逻辑 | 由 V4、V5 推出：回调目标恒为 msg.sender，池子对调用者不设限 | inferred | |
| V10 | 只在 router 层做准入能被绕过：自写合约实现 uniswapV3SwapCallback 后直接调 pool.swap，池子只检查余额 | 由 V4、V5 推出：[3] #L596-602 不限调用者，#L776-778 只检查余额 | inferred | |
| V11 | v3 router 的回调校验（verifyCallback）只保护 router 不被假池子骗，不约束谁调池子 | [4] SwapRouter.sol#L65 @0682387 | observed | |
| V12 | v4 中任何合约都可以自己 unlock 后调 PoolManager.swap，但 swap 内必然调用 hook.beforeSwap，所以准入必须写在 hook 里才有约束力 | [5] PoolManager.sol#L104-114、#L187-191、#L202 @46c6834 | observed | |
| V13 | v3 上用代币层许可（transfer 时查 from/to）做准入可以生效，因为每笔 swap 都把输出币真实转给 recipient，付款方也真实转账给池子 | 由 V4 推出：[3] #L774、#L780 safeTransfer，回调里付款方向池子转账 | inferred | |
| V14 | v4 的 take 仍是一次真实 ERC-20 转账，但 ERC-6909 mint 只记 delta、不转 ERC-20，代币层控制看不到 claim 的流转 | [5] PoolManager.sol#L291-297（take）、#L322-329（mint） | observed | |
| V15 | 用户资料“v4 上 ERC-20 黑名单看不到池内换手”需要细化：最终收款人可见，6909 claim 和多跳中间币不可见 | 由 V14 推出，对照 [28] 05-compliance §3.1 | inferred | |
| V16 | v4 hook 收到的 sender 是 PoolManager 的 msg.sender（通常是 router），不是终端用户 | [6] Hooks.sol#L256 abi.encodeCall(IHooks.beforeSwap, (msg.sender, …)) @46c6834 | observed | |
| V17 | hook 自己调用 PoolManager 时，不会触发它自己的回调 | [6] Hooks.sol#L170-175 noSelfCall、#L253 | observed | |
| V18 | Algebra Access List 插件用 tx.origin 识别用户，官方承认与账户抽象钱包、relayer 兼容性差；撤流动性不设检查 | [16] Algebra Docs Access List（访问于 2026-10-06） | observed | |
| V19 | v4 动态费有两条路径：beforeSwap 返回 lpFeeOverride，或由 hook 调 updateDynamicLPFee（只有动态费池且调用者是 hook 时允许） | [6] Hooks.sol#L263；[5] PoolManager.sol#L339-346 | observed | |
| V20 | v3 上的动态费只能靠 router 加价（LP 收不到、可被绕过）、多档池子（碎片化）或 fork 核心来近似 | 由 V2、V3、V10 推出 | inferred | |
| V21 | v4 的 beforeSwapReturnDelta 可以改写 amountToSwap，但不能把 exactIn 翻成 exactOut | [6] Hooks.sol#L266-279 | observed | |
| V22 | v4 的 hookDelta 由 swap 调用者承担（swapDelta = swapDelta - hookDelta） | [6] Hooks.sol#L311-312；[5] PoolManager.sol#L224-226 | observed | |
| V23 | BeforeSwapDelta 吃掉全部输入就构成 NoOp swap，PoolManager 跳过 CL 数学，相当于 hook 自己实现曲线 | [9] Security Framework “BeforeSwapDelta and NoOp override risks” | observed | |
| V24 | v3 swap 数学写死在 SwapMath.computeSwapStep，没有自定义曲线或自定义记账的入口 | [3] UniswapV3Pool.sol#L662-670 | observed | |
| V25 | v3 上无法池内毕业：曲线阶段结束后只能把储备迁入一个 v3 池，而 initialize 谁都能抢先调用 | 由 V6、V24 推出；案例见 V26 | inferred | |
| V26 | four.meme 2025-02-11 的 v3 系（PancakeSwap V3）池被抢先以极端价格初始化，损失约 $183K | [27] SlowMist Hacked、DeFiHackLabs FourMeme_exp.sol（经 meme-launchpad notes-mechanism M38 于 2026-10-05 核实） | observed | |
| V27 | v4 单例下建池只是一次状态更新，多跳 swap 不为中间池转币 | [8] Uniswap v4 Architecture（访问于 2026-10-06） | observed | |
| V28 | v3 多跳时中间币先转给 router 托管，再在下一跳付出，每个中间跳多两次 ERC-20 转账 | [4] SwapRouter.sol#L147 “for intermediate swaps, this contract custodies” | observed | |
| V29 | v4 的 unlock 会话结束时，只要还有非零 delta 就 revert CurrencyNotSettled | [5] PoolManager.sol#L104-114 | observed | |
| V30 | 低成本建池和多跳净额结算在 v3 上无法用外部包装近似，只能改核心 | 由 V1、V27、V28 推出 | inferred | |
| V31 | v3 池子只认 ERC-20（createPool 要求 token0 非零地址），原生 ETH 要靠 router wrap/unwrap WETH9；v4 原生支持 | [1] UniswapV3Factory.sol#L42；[8]；[5] PoolManager.sol#L348-363 | observed | |
| V32 | v3 上的限价单 / TWAMM 只能靠 range order 或 keeper 外部执行，需要信任 keeper，且执行时机暴露给 MEV | 由 V5、V9 推出：池上没有必经回调，订单执行只能由外部调用触发 | inferred | |
| V33 | MEV 拍卖 / 排序规则在 v3 池层无法强制，因为未经授权的交易可以直接打池子 | 由 V5、V10 推出 | inferred | |
| V34 | Algebra Integral 保持每池独立合约，插件由 DEX 管理员 / DAO 控制，不是任何人都能挂 | [14] Algebra “Integral vs. Uniswap V4” | observed | |
| V35 | Algebra 插件可以被 Factory owner / POOLS_ADMINISTRATOR 通过 setPlugin 更换，还能经 Beacon Proxy 一次升级所有池子；v4 的 hook 地址属于 PoolKey，不可更换 | [13] Algebra Plugins；[10] ToB Fig.2 PoolKey | observed | |
| V36 | Algebra v1.2 的插件可以在 beforeSwap 返回 plugin fee（从 swap 金额扣）和 override fee；插件回调池子时 hook 被禁用 | [15] Algebra Changes v1.2 | observed | |
| V37 | PancakeSwap Infinity 是 Vault 加多个单例 PoolManager（CL、Bin）；hook 可以部署在任意地址，权限 bitmap 写进 poolKey.parameters，不用挖地址 | [17] PancakeSwap Developer：Overview、AMM Layer、Custom Layer Hook | observed | |
| V38 | PancakeSwap Infinity 与 v4 一样有 4 个 return delta 权限和 beforeSwap lpFeeOverride | [17] Custom Layer Hook | observed | |
| V39 | Balancer v3 的 hook 在注册池子时由 getHookFlags 固定，onRegister 可以拒绝池子，只能在 after hook 里改 amountCalculated，且 hook 可重入 Vault | [18] Balancer Docs Hooks | observed | |
| V40 | PoolManager 只保证 session 结算闭合，不验证 hook 内部账目；Cork 和 Bunni 都不是 v4 核心的问题 | [10] ToB 2026-07-30 开篇与 §3 | observed | |
| V41 | Cork 2025-05-28 被攻击：CorkHook beforeSwap 的 hookData 授权被绕过，3,761 wstETH 被提走；Cork 用的 v4-periphery 版本早于 2025-02-06 加入显式授权检查的提交 | [11] Cork post-mortem（2025-06-04） | observed | |
| V42 | Cork 的损失约 $12M | [10] ToB “~$12M, May 2025”；[11] 只给出 3,761 wstETH，未给美元口径 | observed | |
| V43 | v4-periphery 的 onlyPoolManager 要求 msg.sender == poolManager，否则 revert NotPoolManager | [7] ImmutableState.sol#L17-20 @9969eec | observed | |
| V44 | Bunni 2025-09-02 被攻击约 $8.4M：44 次微额 withdraw 利用取整，把 USDC active balance 从 28 wei 压到 4 wei | [12] Bunni Exploit Post Mortem | observed | |
| V45 | 单步看安全的取整方向，在多步组合下可能失效（Bunni 官方结论） | [12] “all of the rounding directions involved were safe in isolation” | observed | |
| V46 | 建池无许可，hook 若信任调用方提供的 PoolKey，攻击者可以建一个挂该 hook、代币由他选的池子 | [10] ToB §2，Spearbit SVFHook finding | observed | |
| V47 | 缺少 afterSwapReturnDelta 权限位时，PoolManager 会忽略 hook 返回的 delta，导致每笔 swap 都 CurrencyNotSettled（Angstrom finding） | [10] ToB §5 | observed | |
| V48 | hook 地址的权限位固定，但 proxy 背后的代码可以升级；官方建议优先不可变，否则用多签加时间锁 | [10] ToB §5；[9] Upgradeability hazards | observed | |
| V49 | after 回调里的非必要逻辑 revert 会连带父操作，可能让 LP 无法撤出 | [10] ToB §6 | observed | |
| V50 | 同一个 hook 在多跳路由中可能在一笔交易里被多次调用，跨回调缓存的状态可能被嵌套操作改掉 | [9] “Multi-pool and routing interactions”；[10] §7 | observed | |
| V51 | Uniswap 路由默认只收两类池子：无 hook 的，以及 hook 不带 swap 权限、不带 return delta、非动态费的，且费率都要在合理上限内 | [21] v4HooksPoolsFiltering.ts#L147-153 @dfe1baa | observed | |
| V52 | 不满足默认条件的 hook 池子，可以走“非主流交易对、无自定义记账、非动态费”的自动白名单，或者人工显式白名单 | [21] isAutoAllowlistedHook；[22] hooksAddressesAllowlist.ts @dfe1baa | observed | |
| V53 | Uniswap 白名单申请：使用 ReturnsDelta 或 dynamicFees 的 hook、地址以 0x91 开头的 hook 需要申请；审核“not a security audit”，并要求浏览器上已验证源码 | [20] developers.uniswap.org/hook-allowlist（访问于 2026-10-06） | observed | |
| V54 | permissioned hook 的池子在 uniroute 中单独放行，条件是至少一端是该 hook 名下的 adapter 代币，且费率 / tickSpacing 属于规范集合 | [21] isAdmissiblePermissionedPool | observed | |
| V55 | hook 方可以自己跑 UniswapX filler，接 Uniswap interface 的订单流 | [19] Integrated Routing with UniswapX | observed | |
| V56 | 1inch 不会自动路由带 hook 的 v4 池，必须由 Pathfinder 能建模该 hook 的行为 | [23] 1inch Help（访问于 2026-10-06） | observed | |
| V57 | 0x 集成自定义 v4 hook 需要提交申请，由团队审核 | [24] 0x Help（访问于 2026-10-06） | observed | |
| V58 | 方案提出：1inch / UniswapX 默认会跳过认不出 Adapter 的许可池，流动性会因此再裂一道 | [28] 05-compliance-and-permissioning.md §3.4 | observed | |
| V59 | 上条方案判断与聚合器公开规则一致 | 由 V54、V56、V58 推出：两者都要求显式支持后才路由 | inferred | |
| V60 | 截至 2026 年 v4 上已初始化约 9 万个唯一 hook 地址；另有说法为 2026-06 时 4.1 万个、带 hook 池子占 15–20% 成交量 | 仅见二手 [25] CryptoBriefing（时间线自相矛盾）、[26] Beelaa，没有 Dune 查询 ID | speculative | |

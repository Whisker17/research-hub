# notes-rwa：合规 / RWA hook，以及股票 quote launchpad 的池内毕业（brief 研究问题 3、4，对 Mantle 的意义）

研究问题：为什么 v4 上“给 ERC-20 加黑名单”不够；Uniswap 官方和其他项目的合规 / RWA hook 怎么工作；以股票代币作 quote 的 launchpad 如何在同一个 v4 池里完成“曲线 → 集中流动性”的毕业，以及股票 quote 带来的额外 hook 需求；对 Mantle 的约束。
一句话答案：v4 把所有池子的余额放在 PoolManager 单例里，池内的所有权变化（ERC-6909 claim、LP 头寸、同一次 unlock 内的多跳）都不触发代币的 transfer 检查，所以准入必须放在池层。Uniswap 官方的做法是 Permissions Adapter（虚拟代币）+ PermissionedHooks（beforeInitialize / beforeSwap / afterSwap / beforeAddLiquidity）。“hook 内曲线 + 同 PoolId 就地毕业”目前只找到一个测试网开源实现（untoll-hook），没有找到生产实例。股票 quote 最大的技术坑在 xStocks EVM 版：它是 **balanceOf 直接 rebase** 的代币，不能裸放进 v4 池。Mantle 主网自 Skadi 升级起支持 EIP-1153，但 Uniswap 官方部署表里没有 Mantle 的 v4，Permissioned Pools 目前只部署在 Ethereum 主网和 Sepolia。
口径：v4-core 固定 `46c6834`；Permissioned Pools 代码固定 v4-periphery `3245c3c`（官方文档指定的 commit）与 v4-hooks-public `e4eabe5`；网页访问日期均为 2026-10-06，另注明的除外。

---

## Q1 为什么“给 ERC-20 加转账黑名单”在 v4 上不够

**答案**：代币合约只看得见资产**进出 PoolManager 的边界**（settle 时用户→PoolManager，take 时 PoolManager→收款人），看不见 PoolManager **内部**的所有权变化。原因有三：swap 只改 delta 账本；ERC-6909 claim 在 PoolManager 内部记账、可以自由转让；LP 头寸是另一种不经过代币的敞口。如果代币用的是 allowlist，PoolManager 这个共享单例本身就得进白名单，进了以后整个单例内部的流转都不再受代币约束。所以准入只能由池子自己在 hook 里执行。代币层（ERC-3643 / transfer hook / 制裁名单）与池层（hook）是两道互补的闸门，谁也替代不了谁。

**依据**
- `PoolManager.swap` 只调用 hook、计算 `swapDelta`，再调用 `_accountPoolBalanceDelta(key, swapDelta, msg.sender)` 记到调用者的 delta 上，整个函数里没有任何 ERC-20 transfer [1 L187-227]。真正的转账只出现在 `take`（`currency.transfer(to, amount)`）和 settle 前用户自己的转入里 [1 L291-297]。`unlock` 只在回调结束时检查 `NonzeroDeltaCount`，所以同一次 unlock 内的多跳可以只在边界上发生转账 [1 L104-114]。
- `PoolManager.mint` 把正 delta 换成 ERC-6909 余额 `_mint(to, currency.toId(), amount)`，不动底层代币 [1 L322-329]。ERC6909 的 `transfer` 只改 `balanceOf[...]` 映射 [2 L25-33]。也就是说，claim 可以在任意地址间流转，底层代币合约毫不知情。
- Uniswap 官方博客原文：“all balances live in one central contract, the PoolManager. Ownership moves around inside it as virtual ERC6909 balances, and LP positions are NFTs. None of that triggers the token's transfer checks … The token contract still checks every transfer in and out of the pool. It just never sees what happens inside.” [3]
- 官方架构文档给出两条理由：PoolManager 是共享单例，“cannot be added to every issuer's allowlist”；如果许可代币被 PoolManager 直接持有，就“could be minted into an ERC-6909 claim and traded without the allowlist” [5]。
- 代币层能做什么，以 xStocks 的 EVM 实现为例：`BackedTokenImplementation._beforeTokenTransfer` 检查暂停和 Chainalysis 制裁名单（from/to 双向），没有 KYC allowlist [17 BackedTokenImplementation.sol L298-301]。这类检查在 v4 里只会在 settle/take 边界上触发（inferred）。
- 用户资料（vault 笔记）把合规写成“ERC-20 + transfer hooks 或 ERC-3643，要求收发双方都通过检查”，并设想了一个“每笔交易前查询身份注册表”的 permissioned DEX [36 §3.3、§3.6]。官方方案的 pluggable checker 正好能挂接 ERC-3643 或 Securitize DS Protocol [3]。

**不确定之处**
- 上面说的是 Uniswap 官方 PoolManager 的行为。fork 版本若改了 take/mint 语义，结论要重新核对。
- “制裁名单在 take 边界仍然有效”是由代码推出的。这只能拦住把资产取到被制裁地址，拦不住被制裁地址在池内持有 claim 或 LP 敞口（inferred）。

## Q2 Uniswap 官方的合规 / 许可池：Permissioned Pools

**答案**：官方名称是 **Permissioned Pools**，由四个合约组成：Permissions Adapter（同时是虚拟代币）、PermissionsAdapterFactory、PermissionedHooks（Uniswap 部署的共享 hook）、Permissioned Position Manager，另需专用的 Universal Router（≥2.2.0）。准入数据来自发行方自己部署的链上 `IAllowlistChecker`，它返回 `SWAP_ALLOWED(0x1)` / `LIQUIDITY_ALLOWED(0x2)` 两个独立标志。hook 用到四个回调：beforeInitialize（池里必须有经过验证的 adapter）、beforeSwap（检查 SWAP_ALLOWED 和 swappingEnabled）、afterSwap（只发事件）、beforeAddLiquidity（检查 LIQUIDITY_ALLOWED）。准入**检查两次**：router 在 wrap 输入代币时查一次，hook 在 beforeSwap 再查一次。路由上，许可代币只能作为交易的输入或输出，不能当中间跳；进入 Uniswap 前端和 API 路由还要 Uniswap Labs **人工审核** allowlist。截至访问日，只部署在 Ethereum 主网和 Sepolia。

**依据**
- 组件与回调：架构页逐条列出 adapter、hook 的四个回调、两个权限标志，以及 Permissioned Position Manager 的“Non-transferable NFTs”和 `unwindPosition` [5]。源码 `getHookPermissions()` 打开的正是 beforeInitialize / beforeSwap / afterSwap / beforeAddLiquidity，afterSwap 只 `emit Swap` [8 L65-70、L105-117]。
- 准入数据来源：发行方实现 `IAllowlistChecker.checkAllowlist(account, token) → PermissionFlag`（ERC-165）。一个 checker 可以服务多个资产 [6 Step 1]。博客称它可以接 Securitize DS Protocol、Tokeny ERC-3643 或自定义注册表，“The pool never needs to know how the list is built. It only needs the verdict.” [3]
- 虚拟代币机制：`wrapToPoolManager` 只允许 `allowedWrappers` 调用，并把虚拟代币 `_mint(POOL_MANAGER, amount)`。`_update` 规定虚拟代币只能由 PoolManager 持有：从 PoolManager 转出时立刻 `_unwrap`，也就是 burn 后把底层代币 `safeTransfer` 给收款人，同时断言 `balanceOf(POOL_MANAGER) == totalSupply()` [9 L45-50、L100-121]。
- hook 信任 router 上报的 `msgSender()`，所以 `_isAllowed` 同时要求 `isAllowed(sender, permission)` 和 `allowedWrappers(router)` 都成立 [8 L139-155]。源码注释原文：“Trusts wrapper-reported `msgSender()`; wrappers must be registered in adapter `allowedWrappers`.” [8]
- 发行方权力：可以换 checker、增删 wrapper、暂停 swap（新 adapter 默认 swap 关闭）、`unwindPosition` 强制平仓。平仓时资产先退给持有人，持有人收不了的才回到**该资产自己的**发行方，发行方不能拿走另一种资产 [5][6 Step 6]。
- 上线步骤共 7 步，最后一步是向 Uniswap Labs 申请路由 allowlist，“reviewed manually. It is not self-serve”。部署地址只列出 Ethereum 主网与 Sepolia，例如主网 `PermissionedHooks` 为 0x499a…28c0、`PermissionsAdapterFactory` 为 0x7DA9…6452 [6]。博客：“Superstate, Securitize, and Dowgo are already building on the standard, and it's live on Ethereum mainnet and Sepolia today.” [3]
- 聚合与前端：Uniswap API 提供 `/v1/permissions` 端点，返回 `isPermissioned`、`isAllowlisted`、`kycUrl`。“Permissioned tokens are matched only as the input or output of a trade, never as an intermediate hop.” 需要请求头 `x-universal-router-version: 2.2.0` [7]。
- 相邻产品：Uniswap 应用已经上架代币化证券。博客称 RWA 池累计成交超过 $9.1B、260 万笔交易、14 万钱包（未注明统计截止日），并称 v4 hook 支持“issuer-configured transfer restrictions, allowlists, geographic gates, and dynamic fee structures at the pool level” [10]。

**一笔 swap 的完整流程（allowlist 用户用 USDC 买许可代币 X）**：见“图的素材 B”。拒绝点有四个：① router 在 wrap 时校验，非 allowlist 用户的输入侧被拒；② `beforeSwap` → `_isAllowed`，返回 Unauthorized，或在发行方暂停时返回 SwappingDisabled；③ take 时虚拟代币 unwrap，底层代币自己的 transfer 规则检查收款人；④ 前端预检 `/v1/permissions`，只影响 UX，不构成安全边界 [5][7][8][9]。

**对聚合器和流动性的影响**
- 第三方聚合器想走这些池，必须用发行方批准的 wrapper，因为 adapter 只认 `allowedWrappers`。不在名单里的 router 连虚拟代币都造不出来（inferred，由 [8][9] 推出）。
- 许可代币不能当中间跳，所以它的流动性不会被“顺路”用于其他交易对的路由 [7]。
- LP NFT 不可转让，LP 头寸也就没有二级市场 [5]。

**不确定之处**
- 文档提到 adapter 有 `updateAllowedHook`，但文档指定 commit `3245c3c` 的 `PermissionsAdapter.sol` 里没看到这个函数 [6][9]。可能在更新的 commit 里，或在别的合约中，未核实。
- 没找到 Permissioned Pools 的专门审计报告。
- 博客正文没有显示发布日期，UTM 参数是 `permissioned-pools-202608`，推测发布于 2026-08。

## Q3 其他项目的合规 / RWA hook

| 项目 | 是否上线 | 是否开源 | 是否审计 | 准入数据来源 | 回调 |
|---|---|---|---|---|---|
| Coinbase Verified Pools（Base） | 已上线 [11] | 未找到 hook 源码 | 未找到 | 链上 EAS 证明（Coinbase Verified Account + Verified Country）+ 制裁名单 [11] | 文档只写“policy checks on all liquidity operations”，没有列出具体回调 [11] |
| Predicate Institutional Hook（Paxos USDL） | UF 称 Paxos International 为首个生产部署 [13] | 开源 predicatelabs/predicate-paxos [12] | 未找到 | 链下 Predicate operators 评估 policy 后签名，签名放在 `hookData` 里，链上 `_authorizeTransaction` 验证 [12] | beforeInitialize（池费必须为 0）、beforeSwap、beforeAddLiquidity（LP 白名单）、beforeDonate（直接拒绝）[12] |
| OKXICE 代币化证券交易场所（X Layer） | 仅有公告和向 SEC 提交的通知，未上线 [15] | 否 | 否 | 二手报道：KYC/AML 后发放不可转让的 soulbound token，在交易、转账、流动性操作前检查 [15] | 二手报道只说“Uniswap v4 hook”，没有细节 [15] |
| 交易时段类 hook（例如 bennoprice/univ4 TradingHours） | 业余示例 | 开源 | 否 | 时间常量 | beforeSwap（搜索摘要）[31] |

**重点讲两个**

1. **Predicate Hook（链下策略 + 链上验签）**：用户先向 Predicate 请求授权。operator 按存放在链上的 policy（AML、地理围栏、限额等）评估后签出 `PredicateMessage`，放进 `hookData`。hook 在 `_beforeSwap` 里把 `router.msgSender()`、整个 PoolKey、`zeroForOne`、`amountSpecified` 编码进去验签，失败就 `revert PredicateAuthorizationFailed()`。`isAuthorizedSwapper` 名单上的用户可以跳过验签 [12 L193-225]。和官方 Permissioned Pools 一样，它也信任 router 上报的 `msgSender()`，router 地址由 owner 设置 [12]。
   - USDL 本身是 rebasing 代币，所以 Paxos 方案另配一个 AutoWrapper hook：用户看到的是 USDL 的“ghost”池，实际成交在 wUSDL/USDC 的“liquid”池 [12][13]。**这是“rebasing 资产先包装成非 rebasing 份额，再进 v4”的生产先例**，与 Q4 xStocks 的问题直接相关。

2. **Coinbase Verified Pools（链上证明）**：准入凭证是注册在 EAS 上的 Coinbase Verifications。hook 在流动性操作中检查交易钱包是否同时持有“Verified Account + Verified Country”证明，并且不在制裁名单上 [11]。它和 Predicate 的区别在于：凭证在链上、可以被任何合约复读，但只认 Coinbase 一家签发方（inferred）。

**市场上的其他信号**：Robinhood Chain 上 Uniswap v4 约占代币化股票 DEX 流动性的 73%，第三方在做按波动调费、限制同块加池后交易规模等 hook（二手）[31]。

**不确定之处**：Verified Pools 的 hook 地址、源码和审计都没找到。OKXICE 的公开通知 PDF 抓取被拦截，hook 细节只能来自二手报道。

## Q4 重点场景：股票 quote 的 meme launchpad，同池毕业

### 4.1 hook 如何实现池内毕业

**答案**：要在同一个 PoolId 里完成“曲线 → 集中流动性”，状态机必须写在**同一个 hook**里，因为 hook 是 PoolKey 的一部分，建池后不能换 [37]。可行的做法如下，目前唯一可读的完整实现是 untoll-hook：
- **Phase 1 曲线报价**：hook 申请 `beforeSwap` + `beforeSwapReturnDelta`，在 `beforeSwap` 里按曲线算出成交量，返回 `BeforeSwapDelta(+consumedQuote, −tokensOut)`。这样 PoolManager 得到 `amountToSwap = 0`，原生集中流动性引擎不参与 [1 L200-217][37]。
  - 曲线储备的去向：quote 以 ERC-6909 claim 的形式被 hook `take` 走托管；代币侧由 hook 现铸或用回收的 claim 交付 [23 LaunchHook L590-607]。
- **阈值判定**：在跨越阈值的那笔买单的 `beforeSwap` 内判定。超出阈值的部分不在曲线上成交，而是退回 `amountToSwap`，由刚注入的 AMM 头寸按终点价成交，即 no-straddle 规则 [23 L576-607]。
- **切换**：`_graduate` 在同一个 swap 的 unlock 回调里依次执行：phase 设为 Graduating → 用 transient 标志放行 hook 自己的那一次 `modifyLiquidity`（其余所有入口在此期间都 revert）→ 用“托管的 quote + 未售代币”注入 full-range 头寸 → 放弃铸币权 → phase 设为 Graduated。任何一步失败，整笔 swap 回滚 [23 L703-729、ARCHITECTURE §2]。
- **价格连续性的关键技巧**：建池时直接把 `sqrtPriceX96` 初始化在**曲线终点价**。Phase 1 每一笔都被 hook 完整吃掉，`Pool.swap` 收到 0 数量会提前返回、不动 slot0，所以毕业时池价已经等于曲线终点价，不需要额外的“推价” swap [23 L748 起 `_seedPOL` 注释][34 §6-7]。
- **头寸归属**：头寸由 hook 自己持有（salt 绑定 hook），合约里没有任何移除函数，属于协议自有流动性，**不发 NFT** [23 ARCHITECTURE §4]。用户方案写的是“NFT 送进无出口 locker”，那是经过 PositionManager 的做法 [32 §6.3.1]。
- **毕业后**：hook 不再覆盖报价，按普通 v4 池交易，`afterSwap` 继续收费分账 [23 ARCHITECTURE §2]。

**依据**：[1][23][34][37]

**不确定之处**
- untoll-hook 自己声明“testnet-bound”，没有外部审计，并公开承认一个归属缺陷：`sender` 实际上是 router，不是终端用户 [23]。
- 储备比例需要和曲线终点价匹配。untoll 把 35% 留作 POL 代币侧，推导式为 R=(k+1)/(3k+1) [23 L100 附近注释]。换一条曲线需要重新推导。

### 4.2 对照已有实现（再核实“hook 内曲线 + 就地翻转无生产实例”）

| 实现 | 曲线在哪里 | 毕业形态 | 是否迁移 | 股票 quote |
|---|---|---|---|---|
| Pons V2 | 每个 launch 一条独立曲线合约（`PonsV2BondingCurve.sol`），用未来 v4 池的 quote 计价 [24] | 两段且都无需许可：`graduate` + 可重试的 `createGraduatedPool`，铸 full-range v4 头寸进永久 locker，“no router, no swap, and no price oracle” [24] | 资金从曲线合约进入 v4 池（同一资产，无需换汇）；不是同一个 PoolId 的就地翻转 | quote 可以是 ETH 或选定的 ERC-20 `pairToken`（二手称包括股票代币）[24] |
| PAIR | 没有曲线 | 1 笔交易内部署代币 + 1–5 个 v4 池；单边流动性按预言机开盘价注入；“毕业”只是信息性标志 [25] | 不迁移 | 24 只股票代币白名单，可组成篮子 [25] |
| Bankr（股票配对） | 没有曲线；85% 供应进 Doppler 管理的 v4 池 [28] | 上线即交易 | 不迁移 | 2026-07-20 起支持以 90 多只 Robinhood 股票代币作 quote（二手）[28] |
| Zora / Doppler multicurve | 多段按市值区间分布的 LP 头寸（`numPositions`）[27] | SDK 示例 `withMigration({type:'noOp'})` [27] | 可以选择不迁移 | — |
| pools.trade（Uniswap Labs，Robinhood Chain） | “bonding curve”实际是普通 v4 池里的单边集中流动性，`hooks = 0x0` [26] | 无 | 不迁移 | quote 为原生 ETH [26] |
| untoll-hook | 在 hook 的 beforeSwap 里 | 同 PoolId 原子翻转 [23] | 不迁移 | 代码不限 quote；README 写 ETH/USDC [23] |

**结论**：已上线的产品里，“不迁移”都是靠**单边 LP / 多段 LP 头寸**做到的（PAIR、Bankr/Doppler、Zora、pools.trade）；Pons V2 是“独立曲线合约 → 毕业铸头寸”。**hook 内曲线 + 同 PoolId 就地翻转**只找到 untoll-hook，它在测试网阶段、未审计。meme-launchpad 报告“尚无生产实例”的结论这次依然成立，但已经有一个可以对照的开源参考实现（speculative：检索未穷尽）。

### 4.3 股票 quote 的额外 hook 需求（对照用户方案 Tape）

**(a) 公司行动 / multiplier：这是对 Tape 前提影响最大的外部事实**
- **xStocks 在 EVM 上是 rebase**。官方文档：“On EVM chains, the contract handles this automatically — when the multiplier updates, it adjusts all user balances directly, so `balanceOf()` always returns the current equity-adjusted value”，并称它为“onchain rebasing mechanism” [16]。
  - 合约 `balanceOf = shares × currentMultiplier / 1e18`。新 multiplier 在 `newMultiplierActivationTime` 到达时**按时间戳自动生效**，不需要任何交易 [17 BackedAutoFeeTokenImplementation L255-260、L266 起]。
  - 事件是 `MultiplierScheduled(newMultiplier, activationTime)` 和 `MultiplierUpdated`，不是 ERC-8056 的 `UIMultiplierUpdated` [17]。
  - 生效时间是除息日次日 00:30 UTC。官方建议交易场所在生效前后各暂停约 15 分钟 [16]。
  - 合约里还有按周期扣管理费的 `feePerPeriod` 逻辑，会让 multiplier 随时间下降 [17]。xStocks 是否把它设为非零，未核实。
- **Robinhood Stock Tokens 走另一条路**：raw 余额不变，`uiMultiplier()` 只用于显示（ERC-8056）。官方称“Onchain swaps remain unaffected”，Chainlink 喂价直接给出乘过 multiplier 的单币价格，24/5 更新；处理公司行动期间预言机暂停，`oraclePaused()`“is advisory and not enforced on-chain” [18][19]。
- **对 v4 池的含义（inferred）**：PoolManager 内部只记录收到的数量，没有任何“按 multiplier 重标”的接口。xStocks 余额上调时，PoolManager 实际持有的代币多于账本，多出的部分不属于任何池子或 LP；余额下调（反向拆股或管理费）时，PoolManager 的负债会超过实际余额，最后一批取款的人取不到。拆股后，池价仍按旧单位定价，留给套利者一个缺口 [1][16][17]。
- **方案对照**：
  - 方案 §6.1.2 已经把“Multiplier 是 rebase”列为致命风险，§6.3.3 提出用非 rebase 的 qToken 包装 [32]。外部事实证实了这个风险前提，Predicate/Paxos 的 AutoWrapper 是同类先例 [12]。
  - 方案 §6.4.2 设想“监听 UIMultiplierUpdated，在 effectiveAt 暂停并调整 tick 参照系、等价重铸头寸” [32]。这与 xStocks EVM 的事件名和“按时间戳生效”的机制不符；并且 v4 hook 只能通过 swap / modifyLiquidity 改变池子状态，没有“调整 tick 参照系”的接口（inferred）。

**(b) 休市 / 预言机偏离熔断**
- 方案提出：在 beforeSwap 里读 Chainlink `latestRoundData` 和链上市场日历；休市时以收盘价为参考，超带宽就 revert，在警戒带内对**扩大偏离的方向**加征惩罚费；staleness 检查作为主防线 [32 §6.4.1]。
- 外部事实与之一致的部分：Robinhood 股票喂价 24/5 更新，`oraclePaused` 只是建议性标志，staleness 应作为主防线 [19]；xStocks 建议在 multiplier 生效前后暂停交互 [16]。
- 实现约束（inferred）：
  - 按方向加征费用要用动态费池，在 beforeSwap 返回带 override 标志的 LP fee [37]。
  - “池价”如果直接读 slot0，同一笔交易里可以被先行操纵。
  - 熔断该看哪个价格：Tape 的 quote 本身是股票代币，预言机只能锚定“股票代币/美元”这条腿，meme 池内没有可对照的外部价格。因此熔断实际要监控的，是股票代币自身在链上的溢价（相对喂价），而不是 meme/股票的池价。
- 周末脱锚的外部事实：
  - PAIR 新闻稿称接入 AMC 后周末链上价格达到真实价的 35 倍 [25]。
  - defiprime 读链称 HIMS 包装币最高比 NYSE 收盘价高 112%，周一首次增发后两小时内回落；$BONER/$HIMS 池持有链上 HIMS 流通量的 50.4% [29]。
  - 用户方案写的是 HIMS 偏离“4.6 倍”[32 §6.4.1]，The Defiant 的口径是 $132.64 对 $28.84 [30]。各方口径互相矛盾，照实并列。

**(c) 准入**
- xStocks 的 EVM 代币层只有暂停和制裁名单，没有 KYC allowlist [17]。用户资料称 Solana 版用 Token Extensions，具备 transfer hook 等能力 [35 §2]。
- 用户资料（05）提出非对称许可：只许可 quote 腿，meme 腿开放 [33 §3.3]。
- 官方 PermissionedHooks 是共享 hook，一个池只能挂一个 hook [5][37]。所以“曲线 + 熔断 + 准入”要么全部写进同一个自定义 hook（就得自己复刻 adapter 校验），要么用官方 hook 而放弃曲线（inferred）。资料 05 也指出“收费 Hook 和合规 Hook 必须合成同一个合约” [33 §3.3]。

### 4.4 “发射 → 曲线买入 → 触发毕业 → 毕业后 swap”完整时序
见“图的素材 C”。依据 [1][23][37]。由于没有生产实例，具体的步骤编号属于 inferred。

## Q5 对 Mantle 的意义（只陈述事实与约束）

**答案**
- **链层**：Mantle 主网自 Skadi 升级（v1.3.1）起支持 EIP-1153（TSTORE/TLOAD）、MCOPY、EIP-7702 等 Prague 特性 [21]。二手报道称主网完成时间是 2025-08-27 [22]。随后的 Limb（2026-01-14，Osaka）和 Arsia（2026-04-22，OP Stack 分叉对齐）升级都已列入官方文档 [21]。
- **部署层**：Uniswap 官方 `deployments.json`（生成于 2026-09-22，源 Uniswap/contracts @ `a677c0d`）的 v4 PoolManager 列表里**没有 Mantle**。Mantle 只有 v3 系合约（tier 为 `dao-deployed`）和 Universal Router 2.0.0 [20]。Permissioned Pools 需要的专用 Universal Router 2.2.0 build 和工厂、hook 只部署在 Ethereum 主网与 Sepolia [6][7]。
- **分层（事实 + 资料）**：
  - 代币层：xStocks 的 EVM 合约自带制裁名单和暂停 [17]。
  - 池层：v4 的准入只能放在 hook 里 [3][5]。
  - 链层：用户资料提出“链层只做制裁级过滤，股票 quote 准入放资产/池 hook，meme 保持无许可” [33 §4-5]。这是用户方案，不在本 lane 的判断范围内。
- **替代路径（约束而非建议）**：
  - 在 Mantle 部署官方 v4。PoolManager 的许可证是 BUSL-1.1（源码 SPDX 头 [1 L1]），新链部署在官方表中以 `dao-deployed` 或 `labs-supported` 分级出现 [20]，具体许可和治理路径未核实。
  - fork v4，受许可证约束，具体条款未核实。
  - 用现有 v3 系 DEX（Fluxion AMM V3 等，见用户资料 [35 §3]），但 v3 没有 hook，Q1 所说的池内准入和曲线做不到同池实现（inferred）。

**不确定之处**：Mantle 主网 Skadi 激活的精确时间戳没有在官方文档里找到；xStocks 在 Mantle 上的合约是否就是 `BackedAutoFeeTokenImplementation`（以及 `feePerPeriod` 取值）需要读链核对；Mantle 上是否有 xStocks 的 Chainlink 喂价，未核实。

---

## 图的素材

**A. 三层闸门（谁看得见什么）**[1][3][5][17]
- 代币层：只在 settle（用户→PoolManager）、take（PoolManager→to）、mint/burn claim 不触发 → 看得见边界，看不见内部
- 池层（hook）：beforeInitialize / beforeSwap / beforeAddLiquidity，每次操作都执行
- 前端/API：`/v1/permissions` 预检，只影响 UX [7]
- 链层（用户资料）：Sequencer 过滤 / STF 级 txHash 过滤 [33 §2]

**B. Permissioned Pools 一笔 swap 时序（allowlist 用户：USDC → 许可代币 X）**[5][6][7][8][9]
1. 前端 → Uniswap API `/v1/permissions`：isPermissioned=true，isAllowlisted=true（否则显示 kycUrl，阻止提交）
2. 用户 → Universal Router(≥2.2.0)：execute
3. Router → PoolManager.unlock → Router.unlockCallback
4. Router → PoolManager.swap(key{currency=adapter vX, USDC, hooks=PermissionedHooks})
5. PoolManager → PermissionedHooks.beforeSwap：`router.msgSender()` 有 SWAP_ALLOWED，router 属于 allowedWrappers，swappingEnabled → 通过（任一不满足就 revert）
6. Pool.swap 计算 delta → afterSwap 发 Swap 事件
7. Router settle USDC；Router 调 PoolManager.take(vX, user)
8. vX 从 PoolManager 转出 → adapter `_update` → burn vX，并把底层 X `safeTransfer` 给用户（X 自己的转账规则在这里检查收款人）
9. unlock 结束，NonzeroDeltaCount==0
- 反方向（卖出 X）时，第 2 步之后 router 先把 X 转进 adapter，再调 `wrapToPoolManager` 铸出 vX，wrap 时 router 会检查一次 allowlist [5]

**C. 股票 quote launchpad：发射 → 曲线买入 → 毕业 → 毕业后 swap（同 PoolId，参照 untoll 模式）**[1][23][37]
1. 创建者 → Factory：部署 meme 代币（mint 权给 hook）→ PoolManager.initialize(key{meme, qSTOCK, DYNAMIC_FEE?, hooks=LaunchHook}, sqrtPrice=曲线终点价) → hook.beforeInitialize 登记 launch（phase=Bonding）
2. 买家 → Router → unlock → swap(exactIn qSTOCK)
3. hook.beforeSwap（Bonding）：收手续费 → 曲线算 tokensOut → take qSTOCK 为 6909 claim → 交付 meme → 返回 delta(+q, −tokensOut) → amountToSwap=0 → Pool.swap 不动 slot0
4. 跨阈值的那一笔：曲线只成交到阈值，超出部分留在 amountToSwap → `_graduate`：phase=Graduating → transient 标志置位 → hook 调 modifyLiquidity(full-range, 托管 quote + 未售 meme) → 用 claim burn 和现铸代币结算 delta → renounceMint → phase=Graduated
5. 同一笔 swap 继续：超出部分由 Pool.swap 在刚注入的头寸上按终点价成交 → afterSwap 收费
6. 毕业后的买家 → swap：beforeSwap 不再覆盖报价（可以叠加熔断、准入检查）→ Pool.swap 集中流动性成交 → afterSwap 分账
- 失败分支：第 4 步任何一处 revert → 整笔 swap 回滚，phase 仍为 Bonding

**D. 状态机**[23]
- Bonding --(跨阈值买单)--> Graduating（瞬态，只在同一个 unlock 回调内）--(注入 POL + renounceMint 成功)--> Graduated
- Bonding：外部加/撤流动性 revert；Graduating：hook 的所有入口 revert，只放行 `_insideFlip` 那一次加流动性；Graduated：外部 LP 正常

**E. multiplier 两种实现对比**[16][17][18][19]
| 维度 | xStocks（EVM） | Robinhood Stock Tokens |
|---|---|---|
| raw 余额 | 每个地址的 shares 不变 | 不变 |
| balanceOf | 随 multiplier 变化（rebase） | 不变 |
| multiplier 接口 | `getCurrentMultiplier()` | `uiMultiplier()`（ERC-8056） |
| 生效方式 | 按时间戳自动生效（除息日次日 00:30 UTC） | 未写明；处理期间预言机暂停 |
| 对 v4 池 | PoolManager 账本与实际余额脱节（inferred） | 官方称“Onchain swaps remain unaffected” |

**F. 合规 hook 对比维度**[5][8][11][12][15]
| 维度 | Uniswap Permissioned | Predicate | Coinbase Verified Pools | OKXICE（计划中） |
|---|---|---|---|---|
| 回调 | bI / bS / aS / bAL | bI / bS / bAL / bD | 流动性操作（具体回调未公开） | 未公开 |
| 准入来源 | 发行方链上 checker | 链下 operator 签名（hookData） | 链上 EAS 证明 | soulbound token（二手） |
| 改了什么 | 准入 + 虚拟代币 | 准入 + 费率=0 + 禁止 donate | 准入 | 准入 / 暂停（二手） |
| 信任假设 | 发行方 owner、router 上报的 msgSender | Predicate operator、hook owner、router | Coinbase 作为签发方 | 运营方 |
| 主要风险 | 发行方暂停或平仓；路由需人工审核 | owner 可以换 router 或 policy | 只认单一签发方 | 未上线 |

---

## 代码素材

1) 池内换手不触发代币 transfer：`take` 只在边界上转账 — `Uniswap/v4-core/src/PoolManager.sol#L291-L297@46c6834698c48bc4a463a86d8420f4eb1d7f3b75`
```solidity
function take(Currency currency, address to, uint256 amount) external onlyWhenUnlocked {
    unchecked {
        // negation must be safe as amount is not negative
        _accountDelta(currency, -(amount.toInt128()), msg.sender);
        currency.transfer(to, amount);
    }
}
```

2) ERC-6909 claim 可以自由转让，不碰底层代币 — `Uniswap/v4-core/src/ERC6909.sol#L25-L33@46c6834698c48bc4a463a86d8420f4eb1d7f3b75`
```solidity
function transfer(address receiver, uint256 id, uint256 amount) public virtual returns (bool) {
    balanceOf[msg.sender][id] -= amount;
    balanceOf[receiver][id] += amount;
    emit Transfer(msg.sender, msg.sender, receiver, id, amount);
    return true;
}
```

3) 官方 PermissionedHooks 的准入判断 — `Uniswap/v4-hooks-public/src/permissioned-pools/PermissionedHooks.sol#L139-L155@e4eabe526f9b516fff78d98ba781251747f0fd6e`
```solidity
function _isAllowed(address permissionsAdapter, address sender, address router, bytes4 selector) internal view {
    address permissionedToken = PERMISSIONS_ADAPTER_FACTORY.verifiedPermissionsAdapterOf(permissionsAdapter);
    if (permissionedToken == address(0)) return;
    PermissionFlag permission = PermissionFlags.NONE;
    if (selector == this.beforeSwap.selector) {
        permission = PermissionFlags.SWAP_ALLOWED;
        if (!IPermissionsAdapter(permissionsAdapter).swappingEnabled()) revert SwappingDisabled();
    } else if (selector == this.beforeAddLiquidity.selector) {
        permission = PermissionFlags.LIQUIDITY_ALLOWED;
    }
    if (
        !IPermissionsAdapter(permissionsAdapter).isAllowed(sender, permission)
            || !IPermissionsAdapter(permissionsAdapter).allowedWrappers(router)
    ) revert Unauthorized();
}
```

4) 虚拟代币只能由 PoolManager 持有，转出即 unwrap — `Uniswap/v4-periphery/src/hooks/permissionedPools/PermissionsAdapter.sol#L100-L121@3245c3cb99c48fa1dc2459c3b60abc37d4294aba`（行号按 raw 文件计数）
```solidity
function _update(address from, address to, uint256 amount) internal override {
    if (to == address(0)) { super._update(from, to, amount); return; }
    if (from == address(0)) {
        assert(to == POOL_MANAGER);
        super._update(from, to, amount);
        return;
    } else if (from != POOL_MANAGER) {
        revert InvalidTransfer(from, to);
    }
    if (to == POOL_MANAGER) revert InvalidTransfer(from, to);
    super._update(from, to, amount);
    _unwrap(to, amount);
    assert(balanceOf(POOL_MANAGER) == totalSupply());
}
```

5) xStocks EVM 是 rebase 型：balanceOf 随 multiplier 变化 — `backed-fi/backed-token-contract/contracts/BackedAutoFeeTokenImplementation.sol#L255-L260@35859e8c755698eeeef96ef15beef5fcd6b978cc`
```solidity
function balanceOf(
    address account
) public view virtual override returns (uint256) {
    (uint256 currentMultiplier, ,) = getCurrentMultiplier();
    return _getUnderlyingAmountByShares(sharesOf(account), currentMultiplier);
}
```

6) 同 PoolId 就地毕业：在跨阈值的那笔 swap 回调里原子翻转 — `hookwright/untoll-hook/contracts/src/LaunchHook.sol#L703-L716@b2f381d0fcd983915c7dfa89543361f15c186262`（测试网阶段，未审计）
```solidity
function _graduate(PoolId poolId, PoolKey calldata key, Launch storage L) internal {
    L.phase = Phase.Graduating;
    uint256 quoteForPOL = uint256(L.quoteRaised) + _polAccrued(poolId);
    uint256 remainingInventory = _remainingCurveInventory(L);
    _setInsideFlip(true);
    _seedPOL(poolId, key, L, quoteForPOL, remainingInventory);
    _setInsideFlip(false);
    LaunchToken(L.token).renounceMint();
    L.phase = Phase.Graduated;
    // emit Graduated(...)
}
```

7) Predicate：链下签名放在 hookData 里，在 beforeSwap 中验证 — `predicatelabs/predicate-paxos/src/PredicateHook.sol#L193-L225@40ad82dc90f510fd19f6c5c855a1234539ceb32d`（节选）
```solidity
if (isAuthorizedSwapper[router.msgSender()]) {
    return (IHooks.beforeSwap.selector, delta, 0);
}
PredicateMessage memory predicateMessage = abi.decode(hookData, (PredicateMessage));
bytes memory encodeSigAndArgs = abi.encodeWithSignature(
    "_beforeSwap(address,address,address,uint24,int24,address,bool,int256)",
    router.msgSender(), key.currency0, key.currency1, key.fee,
    key.tickSpacing, address(key.hooks), params.zeroForOne, params.amountSpecified
);
if (!_authorizeTransaction(predicateMessage, encodeSigAndArgs, router.msgSender(), 0)) {
    revert PredicateAuthorizationFailed();
}
```

---

## 来源

1. **PRIMARY** Uniswap/v4-core `src/PoolManager.sol` @ `46c6834698c48bc4a463a86d8420f4eb1d7f3b75`：证明 unlock 只在回调末检查 delta 清零（L104-114）、swap 只记 delta 不转账（L187-227）、take 是边界转账（L291-297）、mint 把 delta 换成 6909 余额（L322-329）、SPDX 为 BUSL-1.1（L1）。
2. **PRIMARY** Uniswap/v4-core `src/ERC6909.sol` @ `46c6834`：证明 claim 的 transfer 只改内部映射（L25-33）。
3. **PRIMARY** Uniswap Blog《How Permissioned Pools Work on Uniswap v4》https://blog.uniswap.org/how-permissioned-pools-work-on-uniswap-v4 （访问 2026-10-06）：证明“代币只看到进出池子、看不到池内”、pluggable checker 兼容 DS Protocol / ERC-3643、主网与 Sepolia 已上线、Superstate / Securitize / Dowgo 在接入。
4. **PRIMARY** Uniswap Docs Permissioned Pools Overview https://developers.uniswap.org/docs/protocols/v4-hooks/permissioned-pools/overview （访问 2026-10-06）：证明核心不变量（多跳也拿不到敞口、LP NFT 不可转让、发行方可暂停和平仓）。
5. **PRIMARY** Uniswap Docs Permissioned Pools Architecture https://developers.uniswap.org/docs/protocols/v4-hooks/permissioned-pools/architecture （访问 2026-10-06）：证明四个合约的分工、四个回调、两个权限标志、双重 allowlist 检查、unwind 的资产去向。
6. **PRIMARY** Uniswap Docs Deploy a Permissioned Pool https://developers.uniswap.org/docs/protocols/v4-hooks/permissioned-pools/deploy-a-permissioned-pool （访问 2026-10-06）：证明 7 步上线流程、固定 commit `3245c3c`、主网与 Sepolia 地址、路由 allowlist 需人工审核。
7. **PRIMARY** Uniswap Docs Swapping through Permissioned Pools https://developers.uniswap.org/docs/trading/swapping-api/swapping-permissioned-pools （访问 2026-10-06）：证明 `/v1/permissions` 端点、许可代币不当中间跳、需要 UR 2.2.0。
8. **PRIMARY** Uniswap/v4-hooks-public `src/permissioned-pools/PermissionedHooks.sol` @ `e4eabe526f9b516fff78d98ba781251747f0fd6e`：证明 hook 权限位（L65-70）、beforeInitialize 校验 adapter（L74-90）、beforeSwap（L93-102）、`_isAllowed`（L139-155），以及信任 wrapper 上报的 msgSender。
9. **PRIMARY** Uniswap/v4-periphery `src/hooks/permissionedPools/PermissionsAdapter.sol` @ `3245c3cb99c48fa1dc2459c3b60abc37d4294aba`：证明 `wrapToPoolManager` 只许 allowedWrappers 调用（L45-50）、`_update` 的独占持有与自动 unwrap（L100-121）。
10. **PRIMARY** Uniswap Blog《Tokenized Assets like SpaceX, Apple, Tesla, and NVIDIA are Live on Uniswap》https://blog.uniswap.org/tokenized-securities-are-live （访问 2026-10-06）：证明 RWA 池累计 $9.1B / 260 万笔 / 14 万钱包，以及 v4 hook 支持的池级限制类型。
11. **PRIMARY** Verified Pools Docs https://docs.verifiedpools.com/ 与 /developers/uniswap-v4 （访问 2026-10-06）：证明 Base 上的 KYC 池、EAS 上的 Coinbase Verifications（Verified Account + Verified Country）以及制裁名单检查。
12. **PRIMARY** predicatelabs/predicate-paxos @ `40ad82dc90f510fd19f6c5c855a1234539ceb32d`（README、`src/PredicateHook.sol`）：证明 hookData 签名验证（L193-225）、LP 白名单、禁止 donate、池费为 0，以及 USDL 的 AutoWrapper ghost/liquid 双池结构。
13. **PRIMARY** Uniswap Foundation《Grant Update: Bringing Policy Infrastructure Onchain with the Predicate Institutional Hook》https://paragraph.com/@uniswap-foundation/grant-update-bringing-policy-infrastructure-onchain-with-the-predicate-institutional-hook （2025-06-18，访问 2026-10-06）：证明 $325K 资助、Paxos International 为首个生产部署、USDL 用 rebase + AutoWrapper。
14. **PRIMARY** Predicate Blog《Risk Management Framework for Institutional Liquidity on Uniswap V4》（访问 2026-10-06）：证明白皮书存在及其案例为 Paxos USDL（正文 PDF 未读）。
15. 二手：Crypto Briefing《OKX and NYSE parent ICE seek to launch 24/7 tokenized US stock venue》；CryptoTimes / PANews 2026-10-05（转引 Hayden Adams 的 X 帖）（访问 2026-10-06）：线索为 OKXICE 计划在 X Layer 上用许可 v4 池、soulbound 授权、SEC 2026-09-17 TSV 豁免。原始通知 PDF 抓取被拦截。
16. **PRIMARY** xStocks Docs《How xStocks Handles Dividends & Stock Splits》https://docs.xstocks.fi/developers/multipliers 与《Dividends and Stock Splits》（访问 2026-10-06）：证明 EVM 版 balanceOf 会 rebase、生效时间为除息日次日 00:30 UTC、建议生效前后暂停 15 分钟。
17. **PRIMARY** backed-fi/backed-token-contract @ `35859e8c755698eeeef96ef15beef5fcd6b978cc`：`BackedAutoFeeTokenImplementation.sol` 证明 balanceOf=shares×multiplier（L255-260）、按时间戳生效、MultiplierScheduled/MultiplierUpdated 事件、feePerPeriod；`BackedTokenImplementation.sol` 证明暂停与制裁名单检查（L298-301）。
18. **PRIMARY** Robinhood Chain Docs Stock Tokens https://docs.robinhood.com/chain/stock-tokens/ （访问 2026-10-06）：证明 raw 余额不变、`uiMultiplier()` 遵循 ERC-8056、“Onchain swaps remain unaffected”、只有授权参与者（AP）能一级申购。
19. **PRIMARY** Robinhood Chain Docs Oracles & Price Feeds https://docs.robinhood.com/chain/oracles-and-price-feeds （访问 2026-10-06）：证明喂价含 multiplier、24/5 更新、公司行动期间暂停、`oraclePaused` 只是建议性标志。
20. **PRIMARY** Uniswap `deployments.json` https://developers.uniswap.org/deployments.json （generatedAt 2026-09-22，源 Uniswap/contracts @ `a677c0d4b5fb6e3357cf6d0f0315bcb135a1e1ee`，访问 2026-10-06）：证明 v4 PoolManager 链列表不含 Mantle，Mantle 只有 v3（dao-deployed）与 UR 2.0.0。
21. **PRIMARY** Mantle Docs（https://docs.mantle.xyz/network/llms-full.txt 中的 v1.3.1 Skadi changelog、Limb、Arsia 公告）与 mantle-xyz/mantle-v2 Releases（访问 2026-10-06）：证明 Skadi 引入 EIP-1153 / MCOPY / 7702、Limb 主网 2026-01-14、Arsia 主网 2026-04-22。
22. 二手：globalboost.news 2025-10-07 / Xangle：Skadi 主网于 2025-08-27 完成（官方 changelog 未写日期）。
23. **PRIMARY** hookwright/untoll-hook @ `b2f381d0fcd983915c7dfa89543361f15c186262`（README、docs/ARCHITECTURE.md、contracts/src/LaunchHook.sol）：证明 hook 内曲线 + 同 PoolId 原子翻转的实现（L590-607、L703-729）、终点价建池技巧、“testnet-bound”且未审计。
24. **PRIMARY** ponsdotdev/pons-labs README @ `44a3db9`（meme-launchpad notes-products [21]，2026-10-05 已核实；本次重读 README）：证明 Pons V2 是每个 launch 独立曲线、两段毕业、full-range 头寸永久锁定、无路由 / 无预言机。
25. **PRIMARY（项目新闻稿）** PAIR GlobeNewswire 2026-08-31（经 meme-launchpad notes-products [22]）：证明 PAIR 无曲线、单边、1–5 池、AMC 35 倍、peg guard 未上线。
26. 二手：Bitquery《Pools.trade API》https://docs.bitquery.io/docs/blockchain/robinhood/pools-trade-api/ （访问 2026-10-06）：线索为 pools.trade 的 v4 池 hooks=0x0、“曲线”是单边集中流动性。
27. **PRIMARY** Doppler Docs https://docs.doppler.lol （访问 2026-10-06）：证明 multicurve 是按市值区间设定的多段头寸，示例中 migration 为 noOp。
28. 二手：Crypto Briefing《Bankr launches stock paired tokens on Robinhood Chain》（访问 2026-10-06）+ Bankr Docs（经 meme-launchpad notes-agentic [8]，2026-10-05）：证明 Bankr 自 2026-07-20 起支持股票配对、85% 供应进 Doppler v4 池。
29. 二手（读链分析）：defiprime《Inside the Stock-Paired Memecoin Boom》（数据为区块 51,651,897，约 2026-09-01，访问 2026-10-06）：线索为 432 个股票 quote 池、HIMS 溢价最高 112%、$BONER 池持有 50.4% 的 HIMS 流通量。
30. 二手：The Defiant / Wurrly（经 meme-launchpad notes-products [25]）：HIMS 周末 $132.64 对 $28.84，口径与 [29] 不一致。
31. 二手：Crypto Briefing《Robinhood Chain becomes a playground for Uniswap v4 hook strategies》（访问 2026-10-06）：线索为 v4 约占股票 DEX 流动性的 73%、第三方在做调费类 hook；另含 bennoprice/univ4 TradingHours（搜索摘要）。
32. 用户资料（方案）：`/Users/whisker/Work/research/work/mantlev3-roadmap/2-meme-launchpad/tape-design.md` §6.1.2、§6.3.1、§6.3.3、§6.4.1、§6.4.2。
33. 用户资料：`2-meme-launchpad/outputs/05-compliance-and-permissioning.md` §2–§5。
34. 用户资料：`slides/references/bonding-curve-v4-graduation.md` §6–§7。
35. 用户资料：`2-meme-launchpad/xstocks-inputs.md` §2–§3。
36. 用户资料：vault `Notion/Mantle Research/RWA/How to Build An On-chain Tokenized Stocks Protocol.md` §3.3–§3.6、§4.3。
37. **PRIMARY（经 2026-10-05 核实）** Uniswap/v4-core `src/libraries/Hooks.sol` @ `46c6834`（meme-launchpad notes-mechanism [12]，台账 M44、M45）：证明 hook 权限编码在地址里、beforeSwap 返回 delta 改写 amountToSwap、动态费 override；hook 是 PoolKey 的一部分。

---

## 开放问题
1. Mantle 上 xStocks 的合约是否就是 `BackedAutoFeeTokenImplementation`？`feePerPeriod` 是否为 0？是否启用了额外的 allowlist？需要读 Mantlescan 上的实现合约。
2. Permissioned Pools 是否有审计报告？文档里的 `updateAllowedHook` 在哪个 commit、哪个合约里？
3. Coinbase Verified Pools 的 hook 地址、源码、用到的回调、审计情况。
4. OKXICE 公开通知的原文：hook 细节、交易暂停（trading halts）与公司行动如何处理。
5. Mantle 上是否有 xStocks 的 Chainlink（或其他）喂价？更新节奏是 24/5 还是 24/7？
6. 在 Mantle 部署官方 v4 的许可与治理路径（BUSL-1.1 的 Change Date、Additional Use Grant，以及 dao-deployed 的流程）。
7. untoll-hook 在真实流量下的行为：多池复用 `BaseCustomAccounting` 的隔离性、router 作为 sender 的归属缺陷（作者自列的 H1）。
8. HIMS / AMC 周末偏离的几组口径（4.6 倍、112%、35 倍、72.3 倍）需要统一按链上区块复核。

---

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| R1 | v4 PoolManager.swap 只调用 hook 并把 swapDelta 记到调用者名下，函数内没有 ERC-20 转账 | [1] PoolManager.sol#L187-L227@46c6834 | observed | |
| R2 | v4 只在 take（PoolManager→to）和 settle 前用户转入时发生代币转账，unlock 只要求回调结束时 delta 清零 | [1] PoolManager.sol#L104-L114、#L291-L297@46c6834 | observed | |
| R3 | PoolManager.mint 把正 delta 换成 ERC-6909 余额而不动底层代币，6909 的 transfer 只改内部映射 | [1] #L322-L329；[2] ERC6909.sol#L25-L33@46c6834 | observed | |
| R4 | 代币层转账规则看得见资产进出 PoolManager，看不见池内的所有权变化（6909 claim、LP 头寸、多跳） | [3] 官方博客原文“never sees what happens inside” | observed | |
| R5 | allowlist 型代币无法直接进 v4：PoolManager 作为共享单例无法进入每个发行方的 allowlist，直接持有又会被铸成 6909 claim 绕过 allowlist | [5] Architecture 页“The PoolManager allowlist cannot be enforced directly” | observed | |
| R6 | 制裁名单类代币检查在 v4 中只在 settle/take 边界触发，拦不住被制裁地址在池内持有 claim 或 LP 敞口 | 由 R2、R3、R26 推出：转账只发生在边界，claim 与头寸变动不调用代币 | inferred | |
| R7 | Uniswap 官方许可池的正式名称是 Permissioned Pools，由 Permissions Adapter、PermissionsAdapterFactory、PermissionedHooks、Permissioned Position Manager 组成，并需专用 Universal Router | [5] Architecture；[6] Deployment Addresses 表 | observed | |
| R8 | PermissionedHooks 开启 beforeInitialize、beforeSwap、afterSwap、beforeAddLiquidity 四个回调，afterSwap 只发 Swap 事件 | [8] PermissionedHooks.sol#L65-L70、#L105-L117@e4eabe5 | observed | |
| R9 | beforeInitialize 要求池中至少一种 currency 是工厂验证过的 adapter，并拒绝未验证的 adapter | [8] #L74-L90@e4eabe5；[5] | observed | |
| R10 | 准入数据来自发行方部署的 IAllowlistChecker，返回 SWAP_ALLOWED(0x1) 与 LIQUIDITY_ALLOWED(0x2) 两个独立标志 | [6] Step 1；[5] Permissions flags | observed | |
| R11 | checker 可以接 Securitize DS Protocol、ERC-3643 或自定义注册表，池子只需要判定结果 | [3] “It only needs the verdict” | observed | |
| R12 | PermissionedHooks 信任 router 上报的 msgSender()，因此同时要求 sender 有权限且 router 在 allowedWrappers 中 | [8] 合约注释与 _isAllowed#L139-L155@e4eabe5 | observed | |
| R13 | adapter 只允许 allowedWrappers 铸造虚拟代币，虚拟代币只能由 PoolManager 持有，转出时自动 burn 并释放底层代币 | [9] PermissionsAdapter.sol#L45-L50、#L100-L121@3245c3c | observed | |
| R14 | 许可池的 allowlist 检查两次：router 在 wrap 输入代币时检查，hook 在 beforeSwap 时检查 | [5] Swap Routing 节 | observed | |
| R15 | 新 adapter 默认关闭 swap，发行方可以随时暂停，并可用 unwindPosition 强制平仓；资产先退持有人，收不了的才回到该资产自己的发行方 | [5] Security Considerations；[6] Step 6 | observed | |
| R16 | 许可池的 LP 头寸 NFT 不可转让 | [4] Core Invariants；[5] | observed | |
| R17 | Uniswap 路由只把许可代币作为交易的输入或输出，不作为中间跳，并要求 UR ≥2.2.0 | [7] Routing Behavior、Set the Universal Router Version | observed | |
| R18 | 许可池要进入 Uniswap 前端和 API 路由，须经 Uniswap Labs 人工审核 allowlist，不能自助完成 | [6] Step 7 | observed | |
| R19 | 截至 2026-10-06，Permissioned Pools 官方部署地址只覆盖 Ethereum 主网与 Sepolia | [6] Deployment Addresses；[3] “live on Ethereum mainnet and Sepolia today” | observed | |
| R20 | 第三方聚合器若不是发行方批准的 wrapper，就无法为许可池构造交易 | 由 R12、R13 推出：只有 allowedWrappers 能铸造虚拟代币，hook 也会校验 router | inferred | |
| R21 | Uniswap 称 RWA 池累计成交超过 $9.1B、260 万笔交易、14 万钱包（未注明截止日） | [10] Tokenized securities are live | observed | |
| R22 | Coinbase Verified Pools 是 Base 上的 v4 许可池，hook 检查 EAS 上的 Verified Account + Verified Country 证明及制裁名单 | [11] docs.verifiedpools.com | observed | |
| R23 | 未找到 Verified Pools hook 的开源代码或审计报告 | 检索 docs.verifiedpools.com、coinbase.com 与搜索结果均未见（访问 2026-10-06） | speculative | |
| R24 | Predicate Hook 用 hookData 携带链下 operator 签名，在 beforeSwap 中把 msgSender、PoolKey、方向、数量编码后验证，并对白名单用户豁免 | [12] PredicateHook.sol#L193-L225@40ad82d | observed | |
| R25 | Predicate Hook 还强制池费为 0、LP 须在白名单、禁止 donate | [12] getHookPermissions、_beforeInitialize、_beforeAddLiquidity、_beforeDonate | observed | |
| R26 | xStocks 的 EVM 代币层检查暂停与 Chainalysis 制裁名单（from/to），没有 KYC allowlist | [17] BackedTokenImplementation.sol#L298-L301@35859e8 | observed | |
| R27 | UF 向 Predicate 与 Paxos 资助 $325K；Paxos International 的 USDL 为首个生产部署，USDL 用 AutoWrapper 处理 rebase | [13] UF grant update 2025-06-18；[12] README | observed | |
| R28 | OKXICE 计划在 X Layer 上用许可 v4 池交易 60 多只代币化美股，KYC 后发放 soulbound 授权；截至 2026-10-06 只有公告与通知，未上线 | [15] Crypto Briefing、CryptoTimes（二手，原始 PDF 未能抓取） | speculative | |
| R29 | v4 中 hook 是 PoolKey 的一部分，“同池毕业”只能写成同一个 hook 内部的状态机 | [37] Hooks.sol@46c6834（meme-launchpad M44、M45）；[34] §5 | observed | |
| R30 | hook 用 beforeSwapReturnDelta 完整吃掉输入后，PoolManager 拿到 amountToSwap=0，原生引擎不改 slot0 | [1] #L200-L217；[37]；[23] _seedPOL 注释 | observed | |
| R31 | untoll-hook 把曲线放在 beforeSwap 内，quote 以 6909 claim 托管，跨阈值那笔 swap 内原子注入 full-range POL 并 renounceMint | [23] LaunchHook.sol#L590-L607、#L703-L729@b2f381d | observed | |
| R32 | untoll-hook 把池子初始化在曲线终点价，使毕业时无需推价即可保证 AMM 开盘价与曲线终点价连续 | [23] _seedPOL 注释（L748 起）、ARCHITECTURE §5 | observed | |
| R33 | untoll-hook 自称 testnet-bound、未经外部审计，并有 router 作为 sender 的归属缺陷 | [23] README Status、ARCHITECTURE §7 H1 | observed | |
| R34 | Pons V2 的曲线是每个 launch 独立的合约，毕业分 graduate 与可重试的 createGraduatedPool 两段，铸 full-range v4 头寸永久锁定 | [24] pons-labs README@44a3db9 | observed | |
| R35 | PAIR 不设曲线、不迁移，用预言机开盘价注入单边流动性，“毕业”只是信息性标志 | [25] PAIR 新闻稿 2026-08-31 | observed | |
| R36 | pools.trade 的 v4 池不挂 hook，UI 上的“曲线”是单边集中流动性 | [26] Bitquery pools.trade API 文档（二手） | observed | |
| R37 | Doppler multicurve 以多段市值区间头寸发射，SDK 示例中迁移配置为 noOp | [27] docs.doppler.lol | observed | |
| R38 | Bankr 自 2026-07-20 起支持以 Robinhood 股票代币作 quote 发射，发射时 85% 供应进 Doppler 管理的 v4 池 | [28] Crypto Briefing（二手）+ Bankr Docs（经 notes-agentic） | observed | |
| R39 | 截至 2026-10-06，仍未找到“hook 内曲线 + 同 PoolId 就地翻转”的生产实例，唯一可读的实现在测试网阶段 | 由 R31、R33、R34、R35、R36、R37 推出；检索未穷尽 | speculative | |
| R40 | xStocks 在 EVM 上是 rebase：multiplier 更新时 balanceOf 随之变化 | [16] multipliers 页原文；[17] BackedAutoFeeTokenImplementation.sol#L255-L260@35859e8 | observed | |
| R41 | xStocks 新 multiplier 按时间戳自动生效（除息日次日 00:30 UTC），官方建议生效前后各暂停交互约 15 分钟 | [16]；[17] getCurrentMultiplier | observed | |
| R42 | xStocks EVM 合约发出的事件是 MultiplierScheduled / MultiplierUpdated，不是 ERC-8056 的 UIMultiplierUpdated | [17] _updateMultiplier | observed | |
| R43 | Robinhood Stock Tokens 的 raw 余额不变，uiMultiplier 只用于显示（ERC-8056），官方称链上 swap 不受影响 | [18] Corporate actions & the multiplier | observed | |
| R44 | Robinhood 股票喂价 24/5 更新，公司行动期间暂停，oraclePaused 只是建议性标志，应以 staleness 为主防线 | [19] Oracles & Price Feeds | observed | |
| R45 | 把 rebase 型 xStocks 直接作为 v4 池的 quote，会导致 PoolManager 账本与实际余额脱节（正 rebase 出现无主余额，负 rebase 出现负债缺口） | 由 R1、R3、R40 推出：PoolManager 只按收到的数量记账，没有重标接口 | inferred | |
| R46 | 方案提出：股票 quote launchpad 在单个 v4 池内相变，毕业时铸 full-range 头寸送进无出口 locker | tape-design.md §6.3.1 | observed | |
| R47 | 方案提出：休市熔断 hook 在 beforeSwap 读预言机与链上日历，超带宽就 revert，只对扩大偏离的方向加征惩罚费 | tape-design.md §6.4.1 | observed | |
| R48 | 方案提出：公司行动 hook 监听 UIMultiplierUpdated，在 effectiveAt 暂停、调整 tick 参照系并重铸锁仓头寸 | tape-design.md §6.4.2 | observed | |
| R49 | 方案 §6.4.2 的触发前提与 xStocks EVM 不符：事件名不同，且生效不需要交易；v4 也没有“调整 tick 参照系”的接口 | 由 R42、R41、R30、R48 推出 | inferred | |
| R50 | 方案 §6.3.3 提出的非 rebase qToken 包装与 Predicate/Paxos 的 AutoWrapper 属同类做法，可以把 rebase 挡在池外 | tape-design.md §6.3.3；由 R27、R45 推出 | inferred | |
| R51 | 官方 PermissionedHooks 是共享 hook，一个池只能挂一个 hook，因此“曲线 + 熔断 + 准入”要么合进一个自定义 hook，要么放弃曲线 | 由 R7、R29 推出；资料 05 §3.3 同样指出收费与合规 hook 须合并 | inferred | |
| R52 | PAIR 称接入 AMC 后周末链上价格达真实价的 35 倍；defiprime 称 HIMS 包装币最高高出 NYSE 收盘价 112%，与方案的“4.6 倍”口径不一致 | [25]；[29]；[30]；tape-design.md §6.4.1 | observed | |
| R53 | 2026-09-01 前后，Robinhood Chain 上 $BONER/$HIMS 池持有链上 HIMS 流通量的 50.4%，股票 quote 池共 432 个 | [29] defiprime 读链（二手） | observed | |
| R54 | Mantle 主网自 Skadi（v1.3.1）起支持 EIP-1153（TSTORE/TLOAD）、MCOPY、EIP-7702 | [21] Mantle Docs v1.3.1 Skadi changelog | observed | |
| R55 | Skadi 主网于 2025-08-27 完成 | [22] 二手；官方 changelog 未写日期 | speculative | |
| R56 | Uniswap 官方部署表（2026-09-22）的 v4 PoolManager 不含 Mantle，Mantle 只有 v3（dao-deployed）与 Universal Router 2.0.0 | [20] deployments.json@a677c0d | observed | |
| R57 | Mantle 上暂时无法直接使用 Uniswap 官方 Permissioned Pools：既没有 v4，也没有 UR 2.2.0 专用 build | 由 R19、R56 推出 | inferred | |
| R58 | v4-core PoolManager 的许可证为 BUSL-1.1，fork 或自行部署受许可证约束（Change Date 与 Additional Use Grant 未核实） | [1] PoolManager.sol#L1@46c6834 | observed | |
| R59 | 用户资料提出：链层只做制裁级过滤，股票 quote 准入放在资产或池 hook，meme 保持无许可 | 05-compliance-and-permissioning.md §4-§5 | observed | |

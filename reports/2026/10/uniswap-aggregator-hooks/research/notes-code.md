# notes-code：代码机制与链上数据分册（前缀 C、D）

报告：uniswap-aggregator-hooks｜调研日期：2026-10-24｜主会话直接读源码、跑 `cast` 与 Dune。

固定版本：

- `Uniswap/v4-hooks-public` @ `2264ac8b023011fdca8fd3422ada172dc10184e0`（2026-10-23）。下文 `src/aggregator-hooks/...` 都指这个 commit。
- 子模块 `lib/v4-core` @ `d153b048868a60c2403a3ef5b2301bb247884d46`，`lib/protocol-fees` @ `656096fd382417c9eadc1f54cb45cdd3dd1bc362`。

## Q1 Aggregator Hook 是怎么把外部流动性变成 v4 池的

**答案。** 每个外部来源有一个 hook 合约，hook 只开 4 个权限：`beforeInitialize`、`beforeAddLiquidity`、`beforeSwap`、`beforeSwapReturnDelta`。建池时 hook 把 `PoolKey` 映射到外部池并拒绝 LP；swap 时 hook 在 `beforeSwap` 里直接去外部协议成交，用 `take` 把 swapper 的输入从 PoolManager 送出去，用 `settle` 把输出记回 PoolManager，然后返回一个 `BeforeSwapDelta`：specified 一侧等于 `-amountSpecified`，把 v4 核心的集中流动性计算抵消为 0；unspecified 一侧是外部成交量（扣掉协议费）。v4 核心随后按 hookDelta 给 swapper 记账。只要最终所有 delta 归零，`unlock` 才能成功，否则整笔交易回滚。所以“v4 池”只是路由与结算身份，储备一直留在外部协议里。

### 1.1 v4 核心里起作用的四段代码（v4-core @ d153b04）

- `PoolManager.unlock`（`src/PoolManager.sol` L104–114）：回调结束后 `NonzeroDeltaCount.read() != 0` 就 `CurrencyNotSettled` 回滚。
- `PoolManager.swap`（L187–227）：先 `key.hooks.beforeSwap` 拿到 `amountToSwap` 与 `beforeSwapDelta`，再 `_swap`，再 `afterSwap` 得到 `hookDelta`，分别记到 hook 与调用者。
- `Hooks.beforeSwap`（`src/libraries/Hooks.sol` L248–282）：有 `BEFORE_SWAP_RETURNS_DELTA_FLAG` 时，`amountToSwap += hookDeltaSpecified`，并检查 exact-in / exact-out 不会翻转。
- `Pool.swap`（`src/libraries/Pool.sol` L320）：`amountSpecified == 0` 时直接返回零 delta。
- `Hooks.afterSwap`（L305–313）：`hookDelta` 按 exact-in/out 与方向映射到 currency0/1，`swapDelta = swapDelta - hookDelta`，即“调用者为 hook 的 delta 付款或收款”。
- `take`（L291–297）给调用者记 `-amount` 并转出代币；`settle`（L300）按 `sync` 之后的余额差给调用者记正 delta。
- 权限位在地址低 14 位（`Hooks.sol` L29–47）：beforeInitialize `1<<13`、beforeAddLiquidity `1<<11`、beforeSwap `1<<7`、beforeSwapReturnDelta `1<<3`，合计低位 `0x2888`。

### 1.2 BaseAggregatorHook（`src/aggregator-hooks/BaseAggregatorHook.sol`）

- 权限：L84–89 只开上述 4 个权限。
- 拒绝 LP：`_beforeAddLiquidity` 直接 `revert LiquidityNotAllowed()`（L128–135）。
- `_beforeSwap`（L137–145）→ `_internalSettle`（L205–220）：输出币 = `settleCurrency`，输入币 = `takeCurrency`；调用各适配器实现的 `_conductSwap`，没在里面结算的由基类 `_settle` 把输出送回 PoolManager。
- `_innerBeforeSwap`（L154–186）：`unspecifiedDelta` 来自外部成交（exact-in 取 `-amountOut`，exact-out 取 `+amountIn`）；`specified = -params.amountSpecified`，注释写 `// cancel core`；exact-out 时 `specified = -amountOut`；加上协议费后返回 `toBeforeSwapDelta(specified, unspecifiedDelta)`，LP 费覆盖值为 0。并发出 `HookSwap(poolId, sender, amount0, amount1, protocolFee)` 事件。
- `quote()`（L55–57）= 适配器 `_rawQuote` + 协议费；`IAggregatorHook` 注释说明它不是 view，但应当当作 view 调用（swap 可能被模拟）（`interfaces/IAggregatorHook.sol` L17–23）。
- `pseudoTotalValueLocked(poolId)`：返回外部池里该交易对两种代币的数量，用于路由（`IAggregatorHook.sol` L25–29）。V3 实现就是读外部池地址上的两种代币余额（`UniswapV3Aggregator.sol` L160–166）。

**一笔 exact-in（zeroForOne，卖出 X 个 token0）的记账推演**（由上面代码逐行推出，V3 适配器为例）：

| 步骤 | hook 的 token0 | hook 的 token1 | swapper（路由器） |
|---|---|---|---|
| V3 回调里 `take(token0, v3Pool, X)` | −X | | |
| V3 把 Y 个 token1 打进 PoolManager，hook `settle()` | | +Y | |
| 协议费 `take(token1, tokenJar, f)` | | −f | |
| 返回 delta：specified=+X，unspecified=−(Y−f)；核心 amountToSwap=0 | | | |
| `afterSwap`：hookDelta 记给 hook | +X | −(Y−f) | −X token0，+(Y−f) token1 |
| 合计 | 0 | 0 | 路由器之后 settle X、take Y−f |

如果外部池只成交了一部分（例如只吃掉 X′<X），hook 的 token0 会剩 +(X−X′) 的未结 delta，`unlock` 结束时回滚：部分成交不会悄悄发生。

### 1.3 协议费（`ProtocolFees.sol`）

- 构造时 `ProtocolFees(25)`：`protocolFeeMultiplier = 25`（`BaseAggregatorHook.sol` L37；`ProtocolFees.sol` L21–25）。
- `_getProtocolFee`（L90–100）读 PoolManager 里这个虚拟池 `slot0` 的 protocolFee（按方向取低 / 高 12 位），乘以 25。v4 核心的单向上限是 1000 pips（`ProtocolFeeLibrary.sol` L8），乘以 25 后最高 2.5%。
- `_applyWithProtocolFee`（L45–70）：从 unspecified 一侧算费，`poolManager.take(unspecifiedCurrency, tokenJar, fee)` 直接送进 TokenJar；exact-out 时按“总输入的 X%”算（L72–87）。
- TokenJar 地址来自 PoolManager 的 `protocolFeeController()` 的 `TOKEN_JAR()`（L102–110）。
- 费率分类：`protocolFeeFlags()` 返回 `1 << 11`（`BaseAggregatorHook.sol` L91–94）。`V4FeePolicy` 治理指南写明 `1 << 11` 是 aggregator hook 的约定，也是“目前生产上唯一依赖的约定”（`lib/protocol-fees/docs/V4FeePolicy-governance-guide.md` L177–192）。LitePSM 适配器返回 `1 << 12`（`LitePSMAggregator.sol` L91–93），UniswapX 适配器返回 0（`UniswapXAggregator.sol` L96–97），即分到别的 family 或不分类。
- `protocol-fees` 仓库收录的 UNIfication 提案原文第 4 项：“Launch aggregator hooks, turning Uniswap v4 into an onchain aggregator that collects fees on external liquidity”（`proposals/unification.md` L53、L91–97）。

## Q1（续）适配器逐个看

| 适配器 | 部署形态 | PoolKey → 外部池 | 输入怎么付 | 输出怎么回 | 报价 | 限制 |
|---|---|---|---|---|---|---|
| UniswapV3 | 单例 | `factory.getPool(t0,t1,fee)`，校验 fee、tickSpacing、token 顺序，一个外部池只认一个 PoolKey | 回调里 `take` 直接从 PoolManager 打给 V3 池 | V3 池直接打给 PoolManager，hook `settle` | 调 `swap` 并在回调里 `revert QuoteRevert(deltas)` | 不支持原生 ETH；exact-out 要求输出精确相等 |
| PancakeSwap V3 | 单例 | 继承 V3 | 同 V3 | 同 V3 | 同 V3 | 只多一个 `pancakeV3SwapCallback` |
| Slipstream | 单例 | 继承 V3，按 tickSpacing 查池，要求 `fee = DYNAMIC_FEE_FLAG` | 同 V3 | 同 V3 | 继承 V3 | — |
| Uniswap V2 | 单例 | `getPair`；PoolKey 的 fee、tickSpacing 不参与 | `take` 直接打给 pair | pair 打给 PoolManager | 由 reserves 计算 | exact-in 处理转账扣费代币 |
| Curve StableSwap / NG | 每个 Curve 池一个 hook | MetaRegistry 校验，扫描 `coins(i)` 找索引；工厂一次建出 n(n−1)/2 个 PoolKey | `take` 到 hook，再 `exchange(i,j,dx,0)` | 余额差，基类 `_settle` | `get_dy` | 只支持 exact-in；`min_dy=0` |
| Fluid DexLite / DexT1 | 每个 Fluid 池一个 hook | `DexKey{token0,token1,salt}` / 池地址，经 resolver 校验 | `dexCallback` 里 `take` 直接打给 Fluid | ERC-20 直接给 PoolManager | resolver `estimateSwap*` | 原生 ETH 不支持 exact-out；`amountLimit` 为 0 / max |
| LitePSM（Sky） | 单例 | 只允许 gem/stable 一个 canonical 池 | `take` 到 hook，`sellGem` / `buyGem` | hook `sync → transfer → settle` | `tin`/`tout` 公式，含容量检查 | 不是 AMM，零滑点固定费 |
| Tempo Exchange | 单例 | 两币必须直接相连（quoteToken） | `take` 到 hook | hook 结算 | 预编译的 `quoteSwapExact*` | 只在 Tempo 链 |
| UniswapX（Dutch） | 单例，不存池状态 | 订单放在 `hookData` | Reactor 用 Permit2 把订单方输入拉给 hook | hook 从 PoolManager 拿出订单所需输出 | 不支持路由报价，只有 `quoteWithHookData` | 全成或全不成 |

出处（行号均为 @2264ac8）：
- V3：`implementations/UniswapV3/UniswapV3Aggregator.sol` 回调校验 L67–98（transient 预期池、`poolIdToExternalPool`、`take` 给外部池），报价 L100–157，建池 L168–217，成交 L219–267（`sync` 输出币 → `swap(recipient = PoolManager)` → `settle`）。
- Pancake：`PancakeSwapV3/PancakeSwapV3Aggregator.sol` 全文 17 行，只实现 `pancakeV3SwapCallback` 并转给 `_processCallback`。
- Slipstream：`Slipstream/SlipstreamAggregator.sol` L10–34，只覆盖 `_resolveExternalPool`。README 写 Slipstream 报价走链上 `IQuoterV2`，但这个 commit 的代码没有覆盖 `_rawQuote`，实际继承 V3 的 revert 报价：文档与代码不一致。
- V2：`UniswapV2/UniswapV2Aggregator.sol` L140–159、L189–225。
- Curve：`StableSwap/StableSwapAggregator.sol` 报价 L57–70，建池 L88–144，成交 L147–187（注释 “MinAmountOut is 0 to avoid slippage check because it is checked in the router”）；工厂 `StableSwapAggregatorFactory.sol` L58–118（`createPool` 无访问控制，按 n(n−1)/2 循环 `poolManager.initialize`）。README 解释每个 Curve 池共用一个 hook，是为了让路由器能从“hook 地址相同”识别出同一个 Curve 池（一个方向的成交会影响所有方向）。
- Fluid：`FluidDexLite/FluidDexLiteAggregator.sol` 回调 L66–73，成交 L131–188（注释 “Safe to disable slippage check since these are checked in the router”）；`FluidDexT1/FluidDexT1Aggregator.sol` 回调 L71–77。
- LitePSM：`LitePSM/LitePSMAggregator.sol` 报价 L109–156，建池 L158–179，成交 L181–233。
- UniswapX：`UniswapX/UniswapXAggregator.sol` L20–43 注释、`BaseHookDataAggregator.sol` 全文。
- Tempo：`TempoExchange/TempoExchangeAggregator.sol` L61–181。
- 地址首字节 ID：README “ID System”（C1/C2 Curve、F1/F2/F3 Fluid、71 Tempo、03 V3、A1 Slipstream、93 Pancake V3、95 LitePSM、02 V2、58 UniswapX），随机地址有 1/256 误判；`utils/AggregatorHookMiner.sol` L17–50 同时挖低 14 位权限和首字节。
- 新协议接入要求（README 开头）：严格一对一映射的协议必须是单例且不设工厂；测试要求 100% 单元覆盖、fork 测试、fuzz 测试，fork 测试至少跑一次 USDT 池（`test/aggregator-hooks/README.md`）。

### 1.4 一个容易被忽略的前提：输入从 PoolManager 先借出

hook 在 `beforeSwap` 里就 `take` 出 swapper 的输入，而 v4 路由器一般在 swap 之后才 settle。测试里因此要先给 PoolManager 铸币：`StableSwapFuzz.t.sol` L339 “Seed PoolManager with tokens for swaps”、L360 “must cover max swap amounts”。推论：生产上要么 PoolManager 本来就持有足够的该代币（来自其他 v4 池的储备），要么路由器先 settle 输入再 swap；整个过程在 flash accounting 内原子完成。

## Q2 需要的 hooks 背景

只需要四个概念：单例 PoolManager 与 PoolKey 身份、`unlock` + flash accounting（delta 必须归零）、地址低位权限、`beforeSwapReturnDelta` 自定义记账。详细机制见已有报告 `uniswap-v4-hooks`（台账 M1–M6 等），本报告只引用上面 1.1 的代码行。

## D 链上数据（Dune，2026-10-24 运行）

口径：`HookSwap(bytes32,address,int256,int256,uint24)` 事件（topic0 `0x6150bb53…bc1b`），这是 `BaseAggregatorHook` 自定义的签名；在 Ethereum、Base、Robinhood Chain 的原始日志里按合约统计。少数发出同签名事件的合约没有 `aggregatorHookVersion()`（例如首字节 3D、BE、59），量很小，未剔除。USD 价值按 `prices.day` 给交易对任一侧定价。“上线后”指 2026-10-22 13:00 UTC 之后约 1.5 天。

- 查询：8999857（按首字节汇总，全历史）、8999850（上线前后对比）、8999852（按 hook 的 USD 量）、8999853（虚拟池的协议费设置）、8999858（`ProtocolFeesCollected` 汇总）。链接形如 https://dune.com/queries/8999850 。
- `cast call aggregatorHookVersion()`（publicnode RPC）：Ethereum 上 `0x0359e30d…6888` = “SushiswapV3Aggregator v1.0”（`factory()` = `0xbACEB8eC…9C4F`），`0x0246a430…2888` = “SushiswapV2Aggregator v1.0”，`0x93386447…a888` = “PancakeSwapV3Aggregator v1.0”，`0xf149d236…e888` = “FluidDexT1Aggregator v1.0”，`0xc2d349fb…a888` = “StableSwapNGAggregator v1.0”，`0x958a0904…e888` 等 = “LitePSMAggregator v1.0”（`protocolFeeFlags()` = 4096 = `1<<12`），`0xa176880c…2888` = “SlipstreamAggregator v1.0”；Base 上 `0xa1dfe862…6888`、`0xa1d86604…e888` = “SlipstreamAggregator v1.0”，`0x9388fccc…6888` = “PancakeSwapV3Aggregator v1.0”。Ethereum PoolManager 的 `protocolFeeController()` = `0x89A5D5bF…051dB`。
- 全历史（8999857）：最早的 HookSwap 出现在 2026-04-19（Ethereum，C1 Curve）和 2026-05-01（Base，93 / A1）。Ethereum 上 C2（Curve NG）有 332 个 hook、F1（Fluid T1）89 个；Base 上 93（Pancake V3）32,082 次、A1（Slipstream）17,739 次；Ethereum 上 95（LitePSM）31,302 次。
- 上线前后（8999850，窗口 2026-10-08 起）：

| 链 | 时段 | 交易数 | hook swap 次数 | 其中 tx.to 是 Uniswap Universal Router | USD 量 | 交易 gas 中位数 |
|---|---|---|---|---|---|---|
| Ethereum | 上线前 14.5 天 | 4,632 | 4,890 | 3,270 | 230.9M | 584,701 |
| Ethereum | 上线后 1.5 天 | 490 | 556 | 393 | 18.6M | 550,184 |
| Base | 上线前 14.5 天 | 1,588 | 1,856 | 1,124 | 1.74M | 537,450 |
| Base | 上线后 1.5 天 | 1,381 | 1,738 | 1,217 | 0.63M | 545,614 |
| Robinhood | 上线前 14.5 天 | 102 | 115 | 74 | 0.02M | 501,542 |
| Robinhood | 上线后 1.5 天 | 201 | 244 | 193 | 0.06M | 508,894 |

  Universal Router 地址取自官方部署页（Ethereum `0x66a9893c…`、2.1.1 `0x4c82d1fb…`、2.1.2 `0x23617e59…`；Base `0x6ff5693b…`、`0xfdf682f5…`、`0xd6145b2d…`；Robinhood `0x204faca1…`）。
- 按 hook（8999852）：Ethereum 窗口内 USD 量里，LitePSM 系列 hook（USDC/USDS、DAI/USDC）合计约 248.4M，占 Ethereum 总量（约 249.5M）的 99.6%。Base 上量最大的是 Slipstream（`0xa1dfe862…` 1.77M）。
- 协议费设置（8999853）：Ethereum 上 V2、V3、Pancake、Curve NG、Fluid、Slipstream 的虚拟池 protocolFee 多为 163880（每方向 40 pips × 25 = 1000 pips = 10bp），部分 49164（12 × 25 = 3bp）；Base 上为 49164（3bp）或 16388（4 × 25 = 1bp）；LitePSM 的 9 个池没有 `ProtocolFeeUpdated` 记录，即 protocolFee 为 0。
- 实收协议费（8999858，`ProtocolFeesCollected` 事件）：全历史三条链合计约 2,500 美元；上线后 1.5 天约 433 美元（Ethereum 182、Base 190、Robinhood 61）。
- 上线前（2026-09-01 起）tx.to 里出现过 0x 的 AllowanceHolder `0x0000000000001ff3…2734`（112 笔，Dune 标签 “Zeroex: AllowanceHolder”）以及 ERC-4337 EntryPoint（`0x5ff137d4…`、`0x00000000…da032`）。

## 来源

1. **PRIMARY** Uniswap/v4-hooks-public @ 2264ac8：`src/aggregator-hooks/`（BaseAggregatorHook、ProtocolFees、IAggregatorHook、BaseHookDataAggregator、implementations/*、README、utils/AggregatorHookMiner）与 `test/aggregator-hooks/`。证明：权限、delta 记账、协议费、各适配器实现。https://github.com/Uniswap/v4-hooks-public/tree/2264ac8b023011fdca8fd3422ada172dc10184e0/src/aggregator-hooks
2. **PRIMARY** Uniswap/v4-core @ d153b04：`PoolManager.sol`、`libraries/Hooks.sol`、`libraries/Pool.sol`、`libraries/ProtocolFeeLibrary.sol`。证明：unlock 归零检查、beforeSwap delta 抵消、afterSwap 记账、权限位。https://github.com/Uniswap/v4-core/tree/d153b048868a60c2403a3ef5b2301bb247884d46
3. **PRIMARY** Uniswap/protocol-fees @ 656096f：`docs/V4FeePolicy-governance-guide.md`、`proposals/unification.md`、`src/interfaces/IFeeClassifiedHook.sol`。证明：`1<<11` aggregator 约定、family 机制、UNIfication 原文。https://github.com/Uniswap/protocol-fees/tree/656096fd382417c9eadc1f54cb45cdd3dd1bc362
4. **PRIMARY** Dune 查询 8999850 / 8999852 / 8999853 / 8999857 / 8999858（2026-10-24 运行）。证明：上线前后的量、按 hook 的量、协议费设置与实收。https://dune.com/queries/8999850
5. **PRIMARY** 链上 `cast call`（Ethereum / Base publicnode RPC，2026-10-24）。证明：已部署 hook 的版本字符串、factory、flags、PoolManager 的 protocolFeeController。
6. **PRIMARY** Uniswap Developers，v4 Deployments。证明：各链 Universal Router 地址。https://developers.uniswap.org/docs/protocols/v4/deployments （访问 2026-10-24）

## 开放问题

1. 没有测 gas：只能给出“包含 hook swap 的交易”的整笔 gas 中位数（约 50–58 万），无法和直接调用外部池做同口径对比。需要 fork 测试或同路径对照交易。
2. Universal Router 实际编码里是否先 SETTLE 输入再 SWAP（影响对 PoolManager 库存的依赖），没有核对交易 trace。
3. 有 HookSwap 却无版本号的合约（3D、BE、59、B2、B0 等）是谁部署的，没有追。
4. 上线后只有约 1.5 天数据，结论只能算早期读数。

## 台账

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| C1 | v4 的 `unlock` 在回调结束时检查非零 delta 计数，不为 0 就回滚整笔交易 | [2] PoolManager.sol L104–114@d153b04 | observed |
| C2 | hook 有 beforeSwapReturnDelta 权限时，返回的 specified delta 会加到 amountToSwap 上，可以把核心 swap 量改成 0 | [2] Hooks.sol L266–279@d153b04 | observed |
| C3 | amountToSwap 为 0 时，v4 核心的 Pool.swap 直接返回零 delta，不走集中流动性计算 | [2] Pool.sol L320@d153b04 | observed |
| C4 | hook 返回的 delta 会记到 hook 账上，swapper 的 delta 等于核心 delta 减去 hookDelta | [2] Hooks.sol L305–313；PoolManager.sol L220–226@d153b04 | observed |
| C5 | `take` 给调用者记负 delta 并立即转出代币，`settle` 按 sync 之后的余额差记正 delta | [2] PoolManager.sol L279–302@d153b04 | observed |
| C6 | BaseAggregatorHook 只开 4 个权限：beforeInitialize、beforeAddLiquidity、beforeSwap、beforeSwapReturnDelta | [1] BaseAggregatorHook.sol L84–89 | observed |
| C7 | hook 权限编码在地址低 14 位，aggregator hook 的低位组合是 0x2888 | [2] Hooks.sol L29–47；由 C6 四个 flag 相加 | observed |
| C8 | Aggregator hook 拒绝加流动性，beforeAddLiquidity 直接 revert LiquidityNotAllowed | [1] BaseAggregatorHook.sol L128–135 | observed |
| C9 | beforeSwap 里 hook 先在外部协议成交，再返回 specified = −amountSpecified（注释 “cancel core”）和 unspecified = 外部成交量的 delta | [1] BaseAggregatorHook.sol L137–186 | observed |
| C10 | 基类把输出币叫 settleCurrency、输入币叫 takeCurrency；适配器只需实现 `_conductSwap` 与 `_rawQuote` | [1] BaseAggregatorHook.sol L96–119、L205–220 | observed |
| C11 | 一笔经过 aggregator hook 的 swap 里，hook 的两种币 delta 最终都归零，swapper 付输入、拿外部成交输出减协议费 | 由 C1、C4、C5、C9 推出：notes-code §1.2 逐步记账表 | inferred |
| C12 | 外部池只部分成交时，hook 留下未结 delta，整笔交易在 unlock 结束时回滚，不会悄悄部分成交 | 由 C1、C9、C11 推出 | inferred |
| C13 | “v4 池”只是路由与结算身份：PoolManager 里没有该池的储备，储备和定价一直在外部协议 | 由 C3、C8、C9 与 [1] IAggregatorHook.sol L25–29（pseudoTVL 读外部池）推出 | inferred |
| C14 | 协议费 = PoolManager 中该虚拟池 slot0 的 protocolFee × 25，从 unspecified 一侧 `take` 直接送进 TokenJar | [1] ProtocolFees.sol L45–100；BaseAggregatorHook.sol L37 | observed |
| C15 | v4 核心单向协议费上限 1000 pips，乘 25 后 aggregator hook 最高可收 2.5% | [2] ProtocolFeeLibrary.sol L8；由 C14 计算 | inferred |
| C16 | TokenJar 地址从 PoolManager 的 protocolFeeController 读取 TOKEN_JAR() | [1] ProtocolFees.sol L102–110 | observed |
| C17 | aggregator hook 用 protocolFeeFlags() = 1<<11 自报身份，治理指南称这是生产上唯一依赖的 flag 约定 | [1] BaseAggregatorHook.sol L91–94；[3] governance guide L177–192 | observed |
| C18 | LitePSM 适配器自报 1<<12，UniswapX 适配器自报 0（不参与协议费分类） | [1] LitePSMAggregator.sol L91–93；UniswapXAggregator.sol L96–97 | observed |
| C19 | `quote()` 返回外部原始报价加协议费，函数不是 view，供路由器模拟调用 | [1] BaseAggregatorHook.sol L55–81；IAggregatorHook.sol L17–23 | observed |
| C20 | pseudoTotalValueLocked 读的是外部池里的代币数量，不是 v4 储备 | [1] IAggregatorHook.sol L25–29；UniswapV3Aggregator.sol L160–166 | observed |
| C21 | V3 适配器是单例，建池时用 factory.getPool 解析外部池，校验 fee、tickSpacing、token 顺序，一个外部池只允许一个 canonical PoolKey | [1] UniswapV3Aggregator.sol L168–217 | observed |
| C22 | V3 适配器成交时让外部池把输出直接打给 PoolManager，回调里校验 transient 预期池后用 `take` 把输入从 PoolManager 直接打给外部池 | [1] UniswapV3Aggregator.sol L67–98、L219–267 | observed |
| C23 | V3 适配器的报价是真调外部池 swap，在回调里 revert 带回 delta，再解码 | [1] UniswapV3Aggregator.sol L72–76、L100–157 | observed |
| C24 | V3 适配器不支持原生 ETH，exact-out 要求外部输出与请求量完全相等 | [1] UniswapV3Aggregator.sol L193、L225、L261–263 | observed |
| C25 | PancakeSwap V3 适配器全文 17 行，只多实现 pancakeV3SwapCallback；Slipstream 只覆盖按 tickSpacing 查池 | [1] PancakeSwapV3Aggregator.sol；SlipstreamAggregator.sol L10–34 | observed |
| C26 | README 称 Slipstream 报价用链上 QuoterV2，但该 commit 代码未覆盖 _rawQuote，实际继承 V3 的 revert 报价 | [1] README “Uniswap V3 / Slipstream” 段；SlipstreamAggregator.sol 全文 | observed |
| C27 | Curve 适配器每个 Curve 池一个 hook，工厂一次初始化 n(n−1)/2 个 PoolKey；同一 hook 地址让路由器识别同一 Curve 池 | [1] StableSwapAggregatorFactory.sol L58–118；README Curve 段 | observed |
| C28 | Curve 适配器只支持 exact-in，把输入 take 到 hook 后调用 exchange，min_dy 填 0，注释称滑点由路由器检查 | [1] StableSwapAggregator.sol L147–187 | observed |
| C29 | Fluid 适配器在 dexCallback 里校验 inflight 与调用者后，从 PoolManager 直接把输入打给 Fluid；amountLimit 设为 0 或最大值，注释称由路由器检查 | [1] FluidDexLiteAggregator.sol L66–73、L131–188 | observed |
| C30 | LitePSM 适配器调用 sellGem / buyGem，每次读最新 tin / tout，报价含容量检查，每个 gem/stable 对只允许一个池 | [1] LitePSMAggregator.sol L109–233 | observed |
| C31 | V2 适配器是单例，用 getPair 查池，PoolKey 的 fee 与 tickSpacing 不参与，报价由 reserves 算出 | [1] UniswapV2Aggregator.sol L64–96、L140–225；README V2 段 | observed |
| C32 | UniswapX 适配器把签名订单放在 hookData，hook 充当 filler，v4 swapper 提供对手方，不支持路由报价，全成或全不成 | [1] UniswapXAggregator.sol L20–43；README UniswapX 段 | observed |
| C33 | 适配器地址首字节编码协议（如 03 V3、93 Pancake、A1 Slipstream、C2 Curve NG、F1 Fluid、95 LitePSM），随机地址有 1/256 误判 | [1] README ID System；AggregatorHookMiner.sol L17–50 | observed |
| C34 | Curve 工厂的 createPool 没有访问控制，任何人都能为已注册的 Curve 池部署 hook 并建池 | [1] StableSwapAggregatorFactory.sol L58–65（无修饰符） | observed |
| C35 | 能否进入 Uniswap 生产路由，不取决于 hook 能否部署，而取决于路由端的选择 | 由 C34 与 notes-market M29–M31 推出 | inferred |
| C36 | 测试要先给 PoolManager 铸币，因为 hook 在路由器 settle 之前就从 PoolManager take 输入 | [1] test/aggregator-hooks/StableSwap/StableSwapFuzz.t.sol L339、L360 | observed |
| C37 | 生产上 hook 先借出的输入要靠 PoolManager 已有的代币库存或路由器先 settle，整个过程在 flash accounting 内原子完成 | 由 C1、C5、C36 推出 | inferred |
| C38 | 多个适配器把单跳滑点检查交给路由器，用户保护集中在路由器的最终最小输出 | 由 C28、C29 推出 | inferred |
| C39 | 接入一个新的 V3 分叉主要是换 factory 和回调名：V3 / Pancake / Slipstream 共用一份实现 | 由 C21、C25 与 D1（已部署 SushiswapV3Aggregator）推出 | inferred |
| D1 | 已部署 hook 的版本字符串包括 SushiswapV3、SushiswapV2、PancakeSwapV3、FluidDexT1、StableSwapNG、LitePSM、Slipstream Aggregator v1.0 | [5] cast call aggregatorHookVersion()（Ethereum、Base） | observed |
| D2 | aggregator hook 的 HookSwap 事件最早出现在 2026-04-19（Ethereum）和 2026-05-01（Base），比 10-22 的公告早约半年 | [4] Dune 8999857 | observed |
| D3 | 2026-10-08 到上线前，Ethereum 上经 aggregator hook 的成交约 2.31 亿美元、4,632 笔交易；上线后约 1.5 天 1,860 万美元、490 笔 | [4] Dune 8999850 | observed |
| D4 | 上线后 Base 每日交易数约从 110 笔升到约 900 笔，Robinhood 从约 7 笔升到约 130 笔；Ethereum 每日笔数基本不变（约 320） | [4] Dune 8999850，按窗口天数折算 | observed |
| D5 | 窗口内 Ethereum 的 aggregator hook 成交额 99.6% 来自 LitePSM 系列 hook（USDC/USDS、DAI/USDC） | [4] Dune 8999852 | observed |
| D6 | 约七成的 hook swap 发生在直接调用 Uniswap Universal Router 的交易里（上线后 Ethereum 393/556、Base 1,217/1,738、Robinhood 193/244） | [4] Dune 8999850；[6] 部署页 Universal Router 地址 | observed |
| D7 | 上线前有 0x AllowanceHolder 和 ERC-4337 EntryPoint 发起的交易触及这些 hook | [4] 2026-09-01 起按 tx.to 汇总（Dune 标签 “Zeroex: AllowanceHolder”） | observed |
| D8 | Ethereum 上非 PSM 虚拟池的协议费多设为 10bp（40 pips × 25），部分 3bp；Base 为 3bp 或 1bp；LitePSM 池没有设置协议费 | [4] Dune 8999853（ProtocolFeeUpdated 最新值）；乘数见 C14 | observed |
| D9 | aggregator hook 实收协议费全历史约 2,500 美元，上线后 1.5 天约 433 美元 | [4] Dune 8999858（ProtocolFeesCollected） | observed |
| D10 | 目前量最大的来源（LitePSM）不收协议费，所以 aggregator hook 的成交额和协议费收入严重不成比例 | 由 D5、D8、D9 推出 | inferred |
| D11 | 公告主要是公开与扩面：Uniswap 路由早已在用这些 hook，上线头 1.5 天 Ethereum 没有跳升，Base 与 Robinhood 有明显增长 | 由 D2、D3、D4、D6 推出；只有 1.5 天数据 | inferred |
| D12 | 包含 aggregator hook swap 的交易，整笔 gas 中位数约 50–58 万（Ethereum 上线后 550,184） | [4] Dune 8999850 | observed |
| D13 | 0x 的执行路径在上线前已触及 Uniswap 的 aggregator hook 池，说明第三方路由器在技术上可以、也确实部分用到了它们 | 由 D7 推出；样本小（112 笔），未核对具体路径 | inferred |

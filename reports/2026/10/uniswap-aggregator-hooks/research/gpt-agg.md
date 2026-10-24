---
imported_from: ChatGPT Deep Research
imported_at: 2026-10-24
original_file: gpt-agg.md
---

# Uniswap Aggregator Hooks：如何把外部协议包装成 v4 的“虚拟池”

先给结论：

> Uniswap 的 Aggregator Hooks 并没有把 Curve、Fluid、PancakeSwap V3 或 Sky 的资产搬到 Uniswap v4，也没有把这些协议改造成真正的 v4 LP 池。它做的是：为每个外部流动性源编写一个 v4 Hook，把外部协议的报价、调用、回调和结算过程映射到 v4 `PoolManager` 的记账模型中，让路由器可以把它当作一个 `PoolKey` 来报价和执行。

因此，“外部流动性成为一个 v4 池子”更准确的说法是：

> 外部协议被包装成一个可以被 v4 路由器识别、报价、组合和结算的虚拟池。

官方在 2026 年 10 月宣布 Aggregator Hooks 已接入 Uniswap Web App 和 API，初始支持 Curve、Fluid、PancakeSwap V3、Slipstream、Uniswap V2/V3 分支以及 LitePSM/Sky 等流动性来源，并声称这些来源覆盖相关链上超过 90% 的 DEX 活动。官方路由器会每个区块重新获取报价，在 Uniswap 原生流动性和外部流动性之间构建路径，然后通过一次交易完成结算。[blog.uniswap.org](https://blog.uniswap.org/aggregator-hooks-are-now-live?utm_source=chatgpt.com)

---

## 一、先理解 v4：为什么它可以承载外部协议

### 1. v3 的池子是“独立合约”，v4 的核心是 `PoolManager`

在 Uniswap v3 中，一个池子基本就是一个独立的 `UniswapV3Pool` 合约。池子自己的合约负责：

- 保存 token 储备；
- 保存 tick、价格和流动性；
- 执行 swap；
- 结算 token；
- 管理 LP position。

这种架构非常安全、清晰，但外部协议要想被包装成 v3 池子，通常需要重新实现大量状态和逻辑。

v4 的架构不同：

- 所有池子的核心状态集中在一个 `PoolManager`；
- `PoolKey` 描述池子的身份；
- `PoolId = keccak256(PoolKey)`；
- 池子不再需要部署独立的核心池合约；
- Hook 可以在池子生命周期的不同阶段插入自定义逻辑；
- `PoolManager` 使用 transient storage 和 flash accounting，只在最终结算时完成 token 转移。

官方架构文档将 v4 描述为一个 Singleton `PoolManager`，多个池子的操作可以在同一套记账上下文中完成，跨池路由不需要每跳都进行完整的 ERC-20 中间转账。[Uniswap Developers](https://developers.uniswap.org/docs/protocols/v4/concepts/architecture?utm_source=chatgpt.com)

在 v4 中，池子的核心身份大致是：

```
struct PoolKey {
    Currency currency0;
    Currency currency1;
    uint24 fee;
    int24 tickSpacing;
    IHooks hooks;
}
```

因此，外部协议不需要真的实现 Uniswap 的恒定乘积或集中流动性算法。只要一个 Hook 能够：

1. 接受 v4 的 `beforeSwap` 调用；
2. 通过外部协议完成实际交易；
3. 将实际输入输出转换为 v4 的 delta；
4. 让 `PoolManager` 最终账目归零；

它就可以表现为一个 v4 可路由的虚拟池。

---

### 2. Hook 不是普通回调，而是可以改变 swap 记账结果

v4 Hook 可以在以下阶段执行逻辑：

- `beforeInitialize`
- `afterInitialize`
- `beforeAddLiquidity`
- `afterAddLiquidity`
- `beforeSwap`
- `afterSwap`
- `beforeDonate`
- `afterDonate`

Hook 是否拥有某种权限，由 Hook 地址的低位编码决定。部署时需要通过 CREATE2 找到满足权限位要求的地址。官方 `Hooks.sol` 对这些权限位和地址校验有明确实现。[GitHub](https://github.com/Uniswap/v4-core/blob/main/src/libraries/Hooks.sol?utm_source=chatgpt.com)

Aggregator Hook 最关键的权限是：

```
function getHookPermissions()
    public
    pure
    override
    returns (Hooks.Permissions memory permissions)
{
    permissions.beforeSwap = true;
    permissions.beforeSwapReturnDelta = true;
    permissions.beforeInitialize = true;
    permissions.beforeAddLiquidity = true;
}
```

这段逻辑的含义是：

- `beforeInitialize`：初始化时确认这个 v4 PoolKey 对应哪个外部池子；
- `beforeSwap`：swap 发生前执行外部协议交易；
- `beforeSwapReturnDelta`：允许 Hook 返回自定义 delta，改变 v4 核心 swap 的记账结果；
- `beforeAddLiquidity`：允许 Hook 拦截加流动性操作，Aggregator Hook 通常直接拒绝 LP。

v4 官方的 custom accounting 文档明确说明，Hook 可以通过返回 delta 替换或补充 v4 默认的集中流动性计算。[developers.uniswap.org](https://developers.uniswap.org/docs/protocols/v4/guides/custom-accounting.md?utm_source=chatgpt.com)

这正是 Aggregator Hook 的基础。

---

## 二、Aggregator Hook 不是“真实池子”，而是四层映射

可以把它拆成四层：

|层次|外部协议 Aggregator Hook 的表现|
|---|---|
|逻辑身份|一个 v4 `PoolKey` 和对应 `PoolId`|
|路由身份|路由器可以像读取普通 v4 池一样读取报价|
|结算身份|`PoolManager` 通过 delta、`take`、`settle` 进行统一结算|
|资产托管|资产仍然在 Curve、Fluid、V3、PSM 等原协议中|

所以，外部资产没有被存入 v4 池子。

对于 Curve：

- Curve 合约仍然持有储备；
- Curve 的价格状态仍然由 Curve 自己维护；
- v4 PoolManager 中没有对应的 Curve 储备；
- v4 LP 也没有真正向这个“池子”提供流动性。

对于 Uniswap V3：

- V3 池子仍然持有 token；
- V3 的价格、tick 和 liquidity 仍然由 V3 池子维护；
- Hook 只是把 V3 的 swap 函数包装成一个 v4 `beforeSwap` 流程。

对于 LitePSM：

- 甚至没有传统意义上的 AMM 储备曲线；
- Hook 直接调用 `sellGem` 或 `buyGem`；
- v4 PoolKey 只是给这个兑换合约提供统一的路由身份。

官方仓库中的 `BaseAggregatorHook.sol`、Curve、Fluid、Uniswap V2/V3、PancakeSwap、LitePSM 和 UniswapX 实现都采用了这个思路。

---

## 三、核心执行流程：一次 swap 到底发生了什么

下面以 exact-input 为例。

External DEXAggregator HookPoolManagerRouterExternal DEXAggregator HookPoolManagerRouter#chatgpt-mermaid-_r_uh_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(237, 237, 237);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-_r_uh_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-_r_uh_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-_r_uh_ .error-icon{fill:rgb(48, 48, 48);}#chatgpt-mermaid-_r_uh_ .error-text{fill:rgb(237, 237, 237);stroke:rgb(237, 237, 237);}#chatgpt-mermaid-_r_uh_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-_r_uh_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-_r_uh_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-_r_uh_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-_r_uh_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-_r_uh_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-_r_uh_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_uh_ .marker.cross{stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_uh_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-_r_uh_ p{margin:0;}#chatgpt-mermaid-_r_uh_ .actor{stroke:rgb(31, 78, 148);fill:rgb(19, 33, 54);stroke-width:1;}#chatgpt-mermaid-_r_uh_ rect.actor.outer-path[data-look="neo"]{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_uh_ rect.note[data-look="neo"]{stroke:rgb(58, 132, 63);fill:rgb(48, 48, 48);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_uh_ text.actor>tspan{fill:rgb(237, 237, 237);stroke:none;}#chatgpt-mermaid-_r_uh_ .actor-line{stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_uh_ .innerArc{stroke-width:1.5;stroke-dasharray:none;}#chatgpt-mermaid-_r_uh_ .messageLine0{stroke-width:1.5;stroke-dasharray:none;stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_uh_ .messageLine1{stroke-width:1.5;stroke-dasharray:2,2;stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_uh_ [id$="-arrowhead"] path{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_uh_ .sequenceNumber{fill:#505050;}#chatgpt-mermaid-_r_uh_ [id$="-sequencenumber"]{fill:rgb(175, 175, 175);}#chatgpt-mermaid-_r_uh_ [id$="-crosshead"] path{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_uh_ .messageText{fill:rgb(237, 237, 237);stroke:none;}#chatgpt-mermaid-_r_uh_ .labelBox{stroke:rgba(255, 255, 255, 0.15);fill:rgb(14, 14, 14);filter:none;}#chatgpt-mermaid-_r_uh_ .labelText,#chatgpt-mermaid-_r_uh_ .labelText>tspan{fill:rgb(237, 237, 237);stroke:none;}#chatgpt-mermaid-_r_uh_ .loopText,#chatgpt-mermaid-_r_uh_ .loopText>tspan{fill:rgb(237, 237, 237);stroke:none;}#chatgpt-mermaid-_r_uh_ .sectionTitle,#chatgpt-mermaid-_r_uh_ .sectionTitle>tspan{fill:rgb(237, 237, 237);stroke:none;}#chatgpt-mermaid-_r_uh_ .loopLine{stroke-width:2px;stroke-dasharray:2,2;stroke:rgba(255, 255, 255, 0.15);fill:rgba(255, 255, 255, 0.15);}#chatgpt-mermaid-_r_uh_ .note{stroke:rgb(58, 132, 63);fill:rgb(48, 48, 48);}#chatgpt-mermaid-_r_uh_ .noteText,#chatgpt-mermaid-_r_uh_ .noteText>tspan{fill:rgb(237, 237, 237);stroke:none;font-weight:normal;}#chatgpt-mermaid-_r_uh_ .activation0{fill:rgb(48, 48, 48);stroke:hsl(0, 0%, 8.8235294118%);}#chatgpt-mermaid-_r_uh_ .activation1{fill:rgb(48, 48, 48);stroke:hsl(0, 0%, 8.8235294118%);}#chatgpt-mermaid-_r_uh_ .activation2{fill:rgb(48, 48, 48);stroke:hsl(0, 0%, 8.8235294118%);}#chatgpt-mermaid-_r_uh_ .actorPopupMenu{position:absolute;}#chatgpt-mermaid-_r_uh_ .actorPopupMenuPanel{position:absolute;fill:rgb(19, 33, 54);box-shadow:0px 8px 16px 0px rgba(0,0,0,0.2);filter:drop-shadow(3px 5px 2px rgb(0 0 0 / 0.4));}#chatgpt-mermaid-_r_uh_ .actor-man circle,#chatgpt-mermaid-_r_uh_ line{fill:rgb(19, 33, 54);stroke-width:2px;}#chatgpt-mermaid-_r_uh_ g rect.rect{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));stroke:rgb(31, 78, 148);}#chatgpt-mermaid-_r_uh_ .node .neo-node{stroke:rgb(31, 78, 148);}#chatgpt-mermaid-_r_uh_ [data-look="neo"].node rect,#chatgpt-mermaid-_r_uh_ [data-look="neo"].cluster rect,#chatgpt-mermaid-_r_uh_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-_r_uh_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_uh_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-_r_uh_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-_r_uh_-gradient);stroke-width:1px;}#chatgpt-mermaid-_r_uh_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_uh_ [data-look="neo"].node .neo-line path{stroke:rgb(31, 78, 148);filter:none;}#chatgpt-mermaid-_r_uh_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-_r_uh_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_uh_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-_r_uh_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-_r_uh_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_uh_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-_r_uh_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_uh_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}unlock(callback)swap(PoolKey, SwapParams)beforeSwap(...)quote / external swapcallback / outputtake(input) or settle(output)BeforeSwapDeltafinal token deltassettle / takeunlock succeeds if all deltas are zero

### 第一步：路由器进入 `PoolManager.unlock`

v4 要求外部调用者通过 `PoolManager.unlock` 建立一个临时结算上下文。调用者可以在这个上下文中：

- 执行多跳 swap；
- 调用 Hook；
- 调用外部协议；
- 通过 `take` 获取 token；
- 通过 `settle` 把 token 还回去；
- 最后保证所有 currency delta 归零。

`PoolManager.unlock` 在回调结束时检查未结算的 delta，如果不为零，整笔交易回滚。[GitHub](https://github.com/Uniswap/v4-core/blob/main/src/PoolManager.sol?utm_source=chatgpt.com)

这给了 Aggregator Hook 一个非常重要的能力：

> Hook 可以临时从 PoolManager 获取输入 token，调用外部协议，再把输出 token 结算回 PoolManager；整个过程仍然是原子交易。

这不是传统意义上的借贷，也不是把外部流动性永久迁移到 v4，而是利用 v4 的临时记账完成一次原子路由。

---

### 第二步：`PoolManager.swap` 调用 `beforeSwap`

路由器传入：

```
PoolKey key;
IPoolManager.SwapParams params;
bytes hookData;
```

Aggregator Hook 根据 `PoolId` 找到对应的外部池子：

- Uniswap V3：根据 factory、token0、token1、fee 查找；
- PancakeSwap V3：根据 Pancake factory 查找；
- Curve：PoolKey 映射到 Curve pool 和 token index；
- Fluid：PoolKey 映射到 `DexKey`；
- LitePSM：PoolKey 映射到 gem 和 stable token；
- Uniswap V2：根据 factory 的 `getPair(tokenA, tokenB)` 查找；
- UniswapX：从 `hookData` 中读取某个签名订单。

---

### 第三步：Hook 在外部协议上完成真实交易

`BaseAggregatorHook` 的核心逻辑可以抽象成：

```
function _beforeSwap(
    address sender,
    PoolKey calldata key,
    SwapParams calldata params,
    bytes calldata hookData
)
    internal
    returns (
        bytes4 selector,
        BeforeSwapDelta delta,
        uint24 lpFeeOverride
    )
{
    (int256 amountIn, int256 amountOut) =
        _internalSettle(key, params, hookData);

    return _innerBeforeSwap(
        sender,
        key,
        params,
        amountIn,
        amountOut
    );
}
```

其中：

```
_internalSettle()
```

会调用具体适配器实现的：

```
_conductSwap(...)
```

不同协议只需要实现 `_conductSwap`，负责：

1. 确定输入和输出 currency；
2. 调用外部协议；
3. 处理回调；
4. 确定实际输入输出数量；
5. 把外部结果转换成 v4 能理解的金额。

---

### 第四步：Hook 返回 delta，抵消 v4 默认 CL swap

这是最关键的地方。

对于普通 v4 池，`PoolManager` 会根据池子的当前价格、tick 和 liquidity 执行自己的 swap。

对于 Aggregator Hook，Hook 已经在外部协议上完成了真实交易，因此它不希望 v4 再执行一次集中流动性计算。

所以它会返回一个 delta，令 v4 内部的 swap 数量变成零，或者等效地把 v4 核心计算替换成外部协议的结果。

代码逻辑大致如下：

```
int128 specifiedDelta =
    int128(-params.amountSpecified);

int128 unspecifiedDelta =
    _processAmounts(
        amountIn,
        amountOut,
        params.amountSpecified < 0
    );

if (params.amountSpecified >= 0) {
    specifiedDelta =
        -int128(uint128(amountOut));
}
```

这里：

- exact-input：`amountSpecified < 0`；
- exact-output：`amountSpecified > 0`；
- `specifiedDelta` 用于抵消 PoolManager 原本要执行的指定侧 swap；
- `unspecifiedDelta` 表示外部协议产生的另一侧 token 数量；
- 最终 delta 叠加协议费用。

从效果上看：

```
v4 核心 CL swap
        ↓
被 Hook 返回的 delta 抵消

外部协议实际 swap
        ↓
变成这次 v4 swap 的最终结果
```

因此，v4 的池子身份、路由和结算系统被保留，但 v4 默认的价格曲线被绕过了。

---

## 四、几个关键适配器的代码级实现

官方仓库的目录结构大致是：

```
src/aggregator-hooks/
├── BaseAggregatorHook.sol
├── BaseHookDataAggregator.sol
├── ProtocolFees.sol
├── interfaces/
├── implementations/
│   ├── Curve/
│   ├── Fluid/
│   ├── UniswapV2/
│   ├── UniswapV3/
│   ├── PancakeSwapV3/
│   ├── Slipstream/
│   ├── LitePSM/
│   └── UniswapX/
└── utils/
```

源码入口：

- [`BaseAggregatorHook.sol`](https://github.com/Uniswap/v4-hooks-public/blob/main/src/aggregator-hooks/BaseAggregatorHook.sol)
- [`UniswapV3Aggregator.sol`](https://github.com/Uniswap/v4-hooks-public/blob/main/src/aggregator-hooks/implementations/UniswapV3/UniswapV3Aggregator.sol)
- [`PancakeSwapV3Aggregator.sol`](https://github.com/Uniswap/v4-hooks-public/blob/main/src/aggregator-hooks/implementations/PancakeSwapV3/PancakeSwapV3Aggregator.sol)
- [`StableSwapAggregator.sol`](https://github.com/Uniswap/v4-hooks-public/blob/main/src/aggregator-hooks/implementations/StableSwap/StableSwapAggregator.sol)
- [`FluidDexLiteAggregator.sol`](https://github.com/Uniswap/v4-hooks-public/blob/main/src/aggregator-hooks/implementations/FluidDexLite/FluidDexLiteAggregator.sol)
- [`LitePSMAggregator.sol`](https://github.com/Uniswap/v4-hooks-public/blob/main/src/aggregator-hooks/implementations/LitePSM/LitePSMAggregator.sol)

### 1. Uniswap V3 / PancakeSwap V3：把外部 CL 池包装成 v4 池

Uniswap V3 适配器是最容易理解的一类。

#### 初始化阶段：建立映射

初始化 v4 PoolKey 时，Hook 通过外部 factory 查找：

```
pool = factory.getPool(
    token0,
    token1,
    key.fee
);
```

然后校验：

- 外部池子的 token0/token1 和 PoolKey 一致；
- fee tier 一致；
- tick spacing 一致；
- 一个外部池子不能被多个 canonical PoolKey 重复映射。

最终建立：

```
mapping(PoolId => address) poolIdToExternalPool;
```

这意味着：

```
v4 PoolId
    ↓
Uniswap V3 Pool 地址
```

#### 实际 swap：外部 V3 池把 output 发给 PoolManager

V3 的核心流程是：

1. Hook 设置 transient storage，记录预期的外部池子；
2. Hook 调用外部 V3 pool 的 `swap`；
3. 外部 V3 pool 向 Hook 发起 `uniswapV3SwapCallback`；
4. Hook 校验 `msg.sender` 必须是预期的 V3 pool；
5. Hook 根据 V3 callback 的 delta，判断需要支付哪种输入 token；
6. Hook 调用：

```
poolManager.take(
    tokenOwed,
    externalPool,
    owedAmount
);
```

7. PoolManager 直接把输入 token 发送给外部 V3 pool；
8. 外部 V3 pool 将输出 token 发送给 PoolManager；
9. Hook 调用 `settle()` 完成 PoolManager 的内部记账。

因此，V3 适配器不需要先把输入 token 转到 Hook，再由 Hook 转给 V3。它可以让 PoolManager 直接支付外部池子。

这个结构的好处是减少了一次中间 token 转移，但需要非常严格的 callback 校验。

#### Quote：使用 revert 模拟 V3 swap

V3 适配器的 `_rawQuote` 不会真正执行状态变更，而是：

1. 调用外部 V3 pool 的 `swap`；
2. 传入 `isQuote = true`；
3. callback 中主动 revert；
4. revert payload 中带上 `amount0Delta` 和 `amount1Delta`；
5. Hook 解码这个 revert 数据作为报价。

这相当于用外部 V3 的真实价格、tick 和 liquidity 进行链上模拟，同时利用 revert 回滚所有状态变化。

它比单独在 Hook 中重写 V3 的 tick 遍历更简单，也减少了价格计算重复实现。

#### PancakeSwap V3 为什么只需要很少代码

PancakeSwap V3 的适配器基本复用 Uniswap V3 的实现，只改变 callback ABI：

```
contract PancakeSwapV3Aggregator
    is UniswapV3Aggregator,
       IPancakeSwapV3Callback
{
    function pancakeV3SwapCallback(...) external {
        _processCallback(...);
    }
}
```

这说明 Aggregator Hook 的一个重要设计价值：

> 只要两个外部协议的池子模型、swap 语义和结算流程相似，适配器可以共享大部分逻辑，仅替换 factory、callback selector 和 pool resolution。

---

### 2. Curve：一个 Curve 多币池可以映射成多个 v4 PoolKey

Curve StableSwap 的特点是一个池子可以包含多个 token。

假设 Curve 池中有：

```
USDC / USDT / DAI
```

那么它可以产生：

```
USDC → USDT
USDC → DAI
USDT → USDC
USDT → DAI
DAI  → USDC
DAI  → USDT
```

从 v4 的视角看，相当于：

```
n 个 token
→ n(n - 1) / 2 个无方向 PoolKey
```

但这些 PoolKey 背后共享同一个 Curve pool。

Curve 适配器在初始化阶段会：

1. 通过 MetaRegistry 验证 Curve pool；
2. 遍历 Curve pool 的 `coins(i)`；
3. 将 v4 currency 映射到 Curve token index；
4. 将 token index 保存到 `PoolId`；
5. 对 ERC-20 token 做 approve。

报价使用：

```
pool.get_dy(
    indexIn,
    indexOut,
    amountIn
);
```

执行使用：

```
pool.exchange(
    indexIn,
    indexOut,
    amountIn,
    minAmountOut
);
```

这里有一个值得注意的细节：

- Curve 适配器主要支持 exact-input；
- `minAmountOut` 在适配器内部可能设置为零；
- 真正的用户滑点保护由外层路由器的最终 `amountOutMinimum` 负责。

这意味着，Hook 本身不一定为每个外部协议都实现完全相同的滑点检查模型，路由器和最终结算约束仍然很重要。

Curve 的输出通常先到 Hook，再由 BaseAggregatorHook 通过 `_settle` 发送回 PoolManager。

所以 Curve 与 V3 的 token 流向不同：

|协议|输入 token|输出 token|
|---|---|---|
|Uniswap V3|PoolManager 直接支付外部池|外部池直接发送给 PoolManager|
|Curve|PoolManager `take` 给 Hook|Curve 输出到 Hook，Hook 再 `settle` 给 PoolManager|

---

### 3. Fluid：通过 resolver 和 callback 组合完成交易

Fluid 的适配器比 Curve 更复杂，因为 Fluid 的池子身份不是简单的 token pair。

Fluid 适配器会使用：

```
DexKey {
    token0;
    token1;
    salt;
}
```

并通过 resolver 查询：

- 池子是否存在；
- 当前储备；
- 估算 swap；
- 对应 token 顺序；
- 是否需要反向处理。

报价使用：

```
resolver.estimateSwapSingle(...)
```

Fluid 的一个特殊点是它的 `amountSpecified` 符号和 v4 的语义不同，因此适配器需要转换：

```
v4 exact-input
    ↔
Fluid positive amount

v4 exact-output
    ↔
Fluid negative amount
```

Fluid swap 时可能会回调 Hook 请求 token。Hook 的 callback 逻辑会验证：

```
msg.sender == fluidDexLite
```

并检查当前是否处于一个有效的 inflight swap，然后执行：

```
poolManager.take(
    token,
    address(fluidDexLite),
    amount
);
```

这意味着 Fluid 可以直接从 PoolManager 获取输入资产，Hook 不必自己长期持有资金。

Fluid 适配器还处理：

- 原生 ETH 和 Fluid 原生 token sentinel 的转换；
- token 顺序反转；
- exact-input 和 exact-output；
- ERC-20 输出直接发给 PoolManager；
- native 输出先到 Hook 再转交。

---

### 4. LitePSM/Sky：不是 AMM，而是固定兑换曲线

LitePSM 是一个很好的例子，因为它说明 Aggregator Hook 不要求外部协议必须是 AMM。

它的核心逻辑是：

- gem → stable：调用 `sellGem`；
- stable → gem：调用 `buyGem`；
- 读取 `tin` 和 `tout`；
- 根据 token decimals 转换数量；
- 一个 gem/stable pair 只允许建立一个 canonical v4 PoolKey。

它没有传统意义上的：

- tick；
- liquidity range；
- constant product；
- LP position；
- 多档价格曲线。

但它仍然可以通过 Hook 被表现为：

```
GEM / USDS 的 v4 PoolKey
```

从路由器角度看，LitePSM 就像一个报价和执行都非常简单的池子：

```
输入 token
    ↓
LitePSM conversion
    ↓
输出 token
```

因此，Aggregator Hook 的真正抽象不是“把外部 AMM 变成 v4 AMM”，而是：

> 把任何能完成原子 token conversion 的外部协议，映射成 v4 的池子接口。

---

### 5. UniswapX：没有持久池子，流动性来自 `hookData`

UniswapX 更能说明 Aggregator Hook 的边界。

UniswapX Hook 并不是映射一个固定的外部池子，而是从 `hookData` 中读取一个签名订单：

1. 读取 solver 的签名订单；
2. 调用 UniswapX Reactor；
3. Reactor 通过 Permit2 拉取输入 token；
4. Hook 通过 callback 结算输出；
5. 订单要么完整成交，要么全部回滚。

这类 Hook 没有：

- 持久化 reserve；
- 固定 PoolId 对应的 AMM 状态；
- 传统的 pseudo TVL；
- 连续价格曲线。

它更像“把一个 solver order 临时包装成一个 v4 swap source”。

这说明 Aggregator Hook 可以承载两种完全不同的外部流动性：

|类型|例子|特征|
|---|---|---|
|Persistent source|Curve、Fluid、V3、PSM|有固定外部池子或兑换合约|
|HookData source|UniswapX|每次 swap 携带订单或 solver 结果|

---

## 五、为什么外部协议可以“借用”成 v4 池

关键原因有四个。

### 1. v4 不要求 Hook 使用默认价格曲线

`PoolManager` 不会强制要求每个池子必须使用 v4 默认的集中流动性计算。

Hook 可以：

- 自己计算价格；
- 调用外部协议；
- 调用预言机；
- 调用签名订单；
- 使用固定汇率；
- 使用其他曲线；
- 返回自定义 accounting delta。

只要最后的 token delta 能够结算，PoolManager 就可以接受。

---

### 2. `PoolKey` 是身份抽象，不是流动性证明

一个 v4 PoolKey 主要解决：

- 这个池子是谁；
- token0/token1 是什么；
- fee 和 tickSpacing 是什么；
- 使用哪个 Hook；
- 用哪个 PoolId 记录状态。

它不天然证明：

- PoolManager 里有多少 token；
- 有多少 LP；
- 当前储备是多少；
- 价格由哪个公式决定。

因此，Aggregator Hook 可以让 PoolKey 成为“路由身份”，而不是“资产储备身份”。

---

### 3. `PoolManager` 只关心最终 accounting 是否闭合

在一次 unlock 中，Hook 可以：

```
take(input)
调用外部协议
获得 output
settle(output)
返回 delta
```

PoolManager 最后只需要检查：

```
所有 token delta == 0
```

它不需要知道：

- output 来自 Curve 还是 V3；
- 输入 token 是 Hook 自己持有还是 PoolManager 临时转出；
- 价格来自 tick、StableSwap 公式还是签名订单。

---

### 4. Hook 把外部协议的 callback 语义适配成 PoolManager 语义

不同外部协议的 callback 方式不一样：

- Uniswap V3：池子回调 swap caller；
- PancakeSwap V3：callback selector 不同；
- Fluid：可能要求 callback 提供 token；
- Curve：通常没有类似 V3 的 callback；
- LitePSM：直接调用兑换函数；
- UniswapX：Reactor 依赖 Permit2 和 callback。

Aggregator Hook 的工作就是把这些协议的资金流映射到：

```
PoolManager.take()
PoolManager.sync()
PoolManager.settle()
BeforeSwapDelta
```

所以，“可以借用外部流动性”的本质是：

> v4 Hook 提供了一个足够低层、足够灵活的结算适配层。

---

## 六、它和普通聚合器有什么区别

这里需要区分三类系统：

1. 普通 DEX 聚合器，例如 1inch、0x；
2. Uniswap Aggregator Hooks；
3. UniswapX 这类 intent/solver 系统。

### 对比表

|维度|1inch / 0x 类聚合器|Uniswap Aggregator Hooks|UniswapX|
|---|---|---|---|
|路由决策|主要由 off-chain API/路由器完成|仍由路由器/API 完成|solver/intent 驱动|
|执行入口|聚合器自己的 router|v4 `PoolManager` + Hook|Reactor + filler/solver|
|流动性身份|路径中的 DEX 地址|v4 `PoolKey` / `PoolId`|签名订单|
|是否有持久池子|通常不创建池子|可以映射外部持久池|通常没有持久池|
|是否能进入 v4 多跳|需要额外适配|原生作为 v4 路由的一跳|不是传统 AMM 多跳|
|外部流动性|AMM、RFQ、MM、私有流动性|主要是可适配的链上协议|solver/filler 提供|
|用户授权|依赖聚合器 router 或 Permit2|用户只需授权 v4 路由器/Permit2|通常依赖 Permit2|
|费用捕获|聚合器费、推荐费、spread|可以接入 Uniswap 协议费机制|由订单、solver 和协议机制决定|
|quote 形式|API 返回 calldata 和路径|`PoolKey`、`quote`、pseudo TVL|订单价格和执行条件|
|主要信任点|API、router、源协议|Hook、路由器、外部协议|Reactor、solver、订单验证|

0x 的官方文档将其描述为一个通过 API 聚合数百个流动性来源，并返回可执行交易格式的 DEX 聚合系统。[0x Docs](https://docs.0x.org/docs/introduction/quickstart/swap-tokens-with-0x-swap-api?utm_source=chatgpt.com)

UniswapX 则是另一种架构：它通过 RFQ、Dutch auction、filler 和 Reactor 执行订单，核心是 intent/solver，而不是把每个 solver 看成一个持久 AMM 池。[Uniswap Developers](https://developers.uniswap.org/docs/liquidity/uniswapx/filling/overview?utm_source=chatgpt.com)

### Aggregator Hook 的真正优势

它不是简单地“找更多 DEX”，而是把外部流动性放进 v4 的统一执行环境：

```
Native v4 pool
      +
Curve virtual pool
      +
Fluid virtual pool
      +
Uniswap V3 virtual pool
      +
LitePSM virtual pool
      +
UniswapX order source
      ↓
一次 PoolManager unlock
```

这对多跳交易尤其重要。

例如：

```
USDC → Curve USDC/USDT
USDT → Uniswap v4 USDT/WETH
WETH → Uniswap V3 WETH/DAI
```

路由器可以把每一跳都表示为一个 v4 风格的池子，再在一个统一的 `PoolManager` 结算上下文中完成。

---

## 七、优点：为什么 Uniswap 要做这件事

### 1. 增强 v4 的流动性覆盖

如果一个用户只通过 Uniswap 原生池交易，Uniswap 只能看到自己的流动性。

Aggregator Hooks 让 Uniswap 可以接入：

- Curve 的稳定币深度；
- Fluid 的特殊借贷/DEX 流动性；
- PancakeSwap 的链上流动性；
- Sky/LitePSM 的稳定兑换；
- 各种 Uniswap V2/V3 分支；
- 未来的 RWA、RFQ、solver 和链特有流动性。

Uniswap 的产品从“一个 AMM”变成了“一个流动性执行层”。

---

### 2. 外部协议不需要迁移流动性

Curve 不需要把资产转到 Uniswap。

Fluid 不需要重新部署一个 v4 pool。

PancakeSwap 不需要把自己的 liquidity position 复制一份。

外部协议只需要有一个适配器，就可以接入 Uniswap 的路由和用户流量。

这比建立 wrapper pool 或双重流动性池更节省资本，也避免了两个池子之间的价格同步问题。

---

### 3. 对用户来说不需要新增复杂授权

官方发布强调，用户可以通过现有的 Uniswap 路由和授权流程访问这些流动性，不需要为每一个外部 DEX 单独批准 token。[blog.uniswap.org](https://blog.uniswap.org/aggregator-hooks-are-now-live?utm_source=chatgpt.com)

这里需要区分两层：

- 用户层面：通常只需要授权 Uniswap router 或 Permit2；
- Hook 层面：某些适配器仍然需要对 Curve、PSM 等外部合约设置 approve。

所以“没有新授权”主要是用户体验层面的说法，并不代表底层所有合约都不需要 token allowance。

---

### 4. 统一协议费和价值捕获

`BaseAggregatorHook` 内部有统一的协议费处理逻辑。

对于 external source swap，Uniswap 可以：

- 在输出 token 上扣协议费；
- 在 exact-output 场景中增加输入需求；
- 通过 token jar 或 fee controller 收取费用；
- 将相关收入纳入 UNI 价值捕获机制。

官方发布明确把外部流动性交易产生的协议费用与 UNI burn 联系起来。[blog.uniswap.org](https://blog.uniswap.org/aggregator-hooks-are-now-live?utm_source=chatgpt.com)

这对 Uniswap 很关键，因为它不再只从自己部署的池子获得交易量，而是可以从整个接入网络的交易流量中捕获价值。

---

### 5. 适配器可以复用

Uniswap V3 和 PancakeSwap V3 的实现说明了这一点：

- 通用逻辑包括 callback 校验、token 顺序、exact-input/exact-output、delta 转换；
- 协议特有部分只包括 factory、callback selector 和 pool resolution。

如果未来接入另一个 V3 fork，可能只需要：

```
替换 factory
替换 callback interface
替换 fee/tickSpacing 检查
```

这会显著降低新流动性源的接入成本。

---

## 八、缺点和风险

### 1. Hook 本身变成新的安全边界

Aggregator Hook 不是纯粹的数据适配器，而是可以：

- 控制 token 转移；
- 调用外部协议；
- 接收 callback；
- 读取 transient storage；
- 返回自定义 delta；
- 改变最终结算结果。

因此每个 adapter 都是新的智能合约风险面。

Uniswap 的安全框架也特别强调，Hook 可以引入自定义 accounting、价值提取、不平衡流动和非标准 token 流程，必须单独审计。

---

### 2. 虚拟池没有真正的 v4 LP 和 v4 储备

这会带来一些分析和集成问题：

- `PoolId` 存在，但 PoolManager 中可能没有持久 reserve；
- `pseudoTotalValueLocked` 只是路由元数据，不等于 v4 储备；
- v4 LP position 不代表外部协议的真实 LP 权益；
- 普通区块浏览器可能误判 TVL；
- 价格预言机不能直接假设所有 PoolKey 都有同样的价格状态。

因此，数据索引器必须明确区分：

```
native v4 pool
virtual aggregator pool
hookData-based order source
```

---

### 3. 报价和执行可能不一致

不同适配器的报价机制不同：

- V3 通过模拟 swap/revert 获取报价；
- Curve 使用 `get_dy`；
- Fluid 使用 resolver；
- V2 使用 reserve；
- LitePSM 使用实时 fee；
- UniswapX 使用订单；
- 某些协议可能还依赖外部预言机或动态参数。

报价可能在以下时间窗口发生变化：

```
quote block
    ↓
用户签名
    ↓
交易进入 mempool
    ↓
交易执行
```

因此，路由器仍然需要：

- `amountOutMinimum`；
- `amountInMaximum`；
- deadline；
- exact-output 限制；
- source-specific slippage；
- callback 防重入和预期池校验。

---

### 4. 简单交易不一定更省 gas

对于简单的 ETH/USDC 交易，直接调用一个 Uniswap V3 或 Curve 池，可能比：

```
PoolManager
→ Hook
→ resolver/factory
→ 外部池
→ callback
→ transient storage
→ settle
```

更便宜。

Aggregator Hook 最可能产生明显优势的场景是：

- 多跳；
- 需要同时比较多个协议；
- 原生 v4 与外部协议组合；
- 需要统一用户授权；
- 外部协议本身拥有更深的流动性。

所以不能简单地说“用了 v4 就一定省 gas”。

---

### 5. 路由并不是自动去中心化的

一个 Hook 被部署出来，不代表 Uniswap Web App 就一定会自动使用它。

实际还需要：

- 路由器支持；
- quote 服务支持；
- 池子注册；
- source allowlist；
- 风险审核；
- 链上部署；
- 前端或 API 的配置。

官方 Hook 文档也明确提醒，开发者部署 Hook 并不自动意味着 Uniswap 前端会将交易路由到它。[Uniswap Developers](https://developers.uniswap.org/docs/protocols/v4/concepts/hooks?utm_source=chatgpt.com)

因此当前形态更接近：

```
开放的 Hook 技术
+
Uniswap Labs 维护的生产路由目录
```

而不是一个完全无需许可的流动性市场。

---

## 九、我对市场接受程度的判断

以下是基于架构和当前发布状态的判断，不是已经完成的市场统计。

|维度|预期|判断|
|---|---|---|
|用户体验|4.5/5|用户看到的是一个 Uniswap 交易入口，不需要理解底层 DEX|
|多跳组合能力|4.5/5|外部源可以与原生 v4 池一起进入统一路径|
|流动性覆盖|4/5|稳定币、蓝筹和主要链上协议会明显受益|
|简单交易 gas|2.5/5|Hook 调用和 callback 可能比直接池调用更贵|
|多跳交易 gas|4/5|Singleton 和 flash accounting 有明显价值|
|安全复杂度|2.5/5|每个外部协议都会增加 adapter 和 callback 风险|
|去中心化程度|3/5|技术开放，但生产路由仍需要审核和配置|
|Uniswap 价值捕获|4.5/5|外部流动性交易也可以进入 Uniswap 的协议费体系|

### 近期最容易被接受的来源

最有机会获得流量的是：

1. 深度很大的稳定币池；
2. USDC、USDT、DAI、ETH、WBTC 等蓝筹资产；
3. 价格机制简单、可验证的 V2/V3 fork；
4. 有成熟安全审计和稳定部署的协议；
5. 能够稳定提供 exact-input 和 exact-output 结果的来源。

### 更难被接受的来源

以下类型可能不容易成为第一批生产路由来源：

- 私有 RFQ；
- 需要复杂签名状态的订单；
- 依赖中心化 API；
- 动态风险参数复杂的借贷型 DEX；
- 资产 decimals 非标准；
- 回调流程不规范；
- 交易失败概率高；
- 需要外部 oracle 才能确定价格；
- 只能提供报价但不能原子结算的来源。

---

## 十、它不会取代 1inch、0x 或 UniswapX

更可能的结果是分层共存。

### 1. Aggregator Hook：链上执行适配层

它解决：

```
怎样把外部协议包装成 v4 可调用的一跳？
```

### 2. 1inch/0x：跨来源路由发现层

它们擅长：

```
去哪几个来源找价格？
怎样切分订单？
是否接入 RFQ、MM 和私有流动性？
```

### 3. UniswapX：intent 和 solver 执行层

它擅长：

```
用户只表达意图，谁来完成订单？
solver/filler 如何竞争？
如何把报价风险交给执行者？
```

未来可能出现这样的组合：

```
1inch / Uniswap API
    ↓ 路由选择
v4 PoolManager
    ↓ 统一结算
Aggregator Hook
    ↓
Curve / Fluid / V3 / PSM / Solver Order
```

所以 Aggregator Hook 不是“另一个 1inch”，而是把外部流动性接入 v4 的执行标准。

---

## 十一、对 Uniswap 未来叙事的判断

我认为 Uniswap 正在从：

```
一个 AMM 协议
```

转向：

```
一个可编程的链上流动性结算层
```

未来 Hook 可能形成几类主要叙事。

### 1. Virtual Pool / Aggregator Hook

外部 DEX、RWA、PSM、借贷市场和 solver order 都可以被包装成 PoolKey。

### 2. Dynamic Fee Hook

手续费根据：

- 波动率；
- 订单大小；
- 外部池深度；
- MEV 风险；
- 时间；
- 交易方向；

动态调整。

### 3. Permissioned / Compliance Hook

Hook 可以在：

- 交易前检查地址；
- 检查 token 资格；
- 检查地区；
- 检查 KYC；
- 检查资产白名单；
- 检查合规转账规则。

这会让 v4 适合稳定币、RWA 和机构市场，但也会引入更强的权限治理。

### 4. Intent Hook

Hook 不再连接一个固定 AMM，而是连接：

- RFQ；
- solver；
- Dutch auction；
- batch auction；
- signed order；
- off-chain market maker。

UniswapX 已经展示了这种方向。

### 5. Hook Marketplace

未来最有价值的可能不是单个 Hook，而是：

```
Hook 注册表
+
风险标签
+
报价接口
+
部署证明
+
审计证明
+
流动性元数据
+
路由策略
```

路由器可以根据不同 Hook 的属性决定是否使用：

```
支持 exact-output？
是否有 callback？
是否支持原生 ETH？
是否需要外部 oracle？
是否允许 LP？
是否有升级权限？
是否经过安全审核？
是否存在价格保护？
```

---

## 十二、如果你要自己写一个 Aggregator Hook，最重要的检查项

### 1. 明确 PoolKey 到外部池子的映射

需要决定：

- 一个外部池对应一个 Hook，还是所有池共享 singleton Hook；
- PoolKey 中的 fee/tickSpacing 是否有真实含义；
- token 顺序如何处理；
- 是否允许同一个外部池被多个 PoolId 映射。

### 2. 初始化时阻止无效池子

`beforeInitialize` 至少应该检查：

- token pair；
- decimals；
- 外部 pool 是否存在；
- pool 是否被暂停；
- fee tier；
- tick spacing；
- canonical mapping；
- 原生 token sentinel；
- 是否允许重复注册。

### 3. Quote 和 execution 必须使用一致的符号约定

需要明确：

```
v4 exact-input = negative amountSpecified
v4 exact-output = positive amountSpecified
```

然后转换成外部协议的语义。

Fluid、V3、Curve 和 LitePSM 对 exact-input/exact-output 的支持并不完全相同，不能直接复用参数。

### 4. Callback 必须验证预期外部池

至少验证：

```
msg.sender == expectedExternalPool;
```

同时建议验证：

```
poolIdToExternalPool[poolId] == msg.sender;
```

并使用 transient storage 防止：

- 恶意 callback；
- 跨交易状态污染；
- 重入；
- 错误 pool 调用；
- 外部池地址伪造。

### 5. 处理 native token、WETH 和 decimals

真实项目中最容易出错的地方之一是：

- v4 `Currency.wrap(address(0))`；
- 外部协议的 `0xEeee...` sentinel；
- WETH；
- 6 位稳定币；
- 18 位内部记账；
- LitePSM 的 decimal conversion factor；
- native input 和 native output 的 value 处理。

### 6. 拒绝 LP，或者完整实现 LP 语义

Aggregator Hook 如果只是外部协议适配器，通常应该：

```
beforeAddLiquidity() => revert LiquidityNotAllowed()
```

否则用户可能误以为自己在向一个 v4 池提供 LP，但实际上 Hook 并没有把这些资产接入真正的 v4 liquidity state。

### 7. 给路由器提供 pseudo TVL，但不要把它伪装成真实储备

`pseudoTotalValueLocked` 可以帮助路由器排序和筛选，但索引器必须知道：

```
pseudo TVL ≠ PoolManager reserve
pseudo TVL ≠ LP-owned liquidity
```

### 8. 把协议特有风险暴露给路由器

建议加入明确的 metadata：

```
supportsExactInput
supportsExactOutput
supportsNative
hasCallback
requiresOracle
slippageModel
feeModel
upgradeability
externalPoolAdmin
```

否则不同 Hook 在路由器看来会过于相似，导致错误的路径比较。

---

## 最终判断

Aggregator Hooks 最重要的创新，不是创造了一个新的 AMM 数学公式，而是重新定义了“池子”的边界：

```
池子不一定是一个持有储备的 AMM 合约；
池子也可以是一个 PoolKey + Hook + 外部结算协议。
```

它把 Uniswap v4 的核心能力从：

```
管理自己的流动性
```

扩展到：

```
统一管理不同流动性来源的报价、执行和结算。
```

这会让 Uniswap 更像一个流动性操作系统：

- v4 原生池是默认模块；
- Curve、Fluid、V3、PSM 是外部适配模块；
- UniswapX 是订单/solver 模块；
- Router 是路径选择层；
- PoolManager 是统一结算内核；
- Hook 是可编程的协议边界。

短期内，它最可能在稳定币和蓝筹交易中获得真实使用，因为这些场景同时具备深流动性、明确报价和较低的适配风险。中期内，决定它能否成为行业标准的关键，不是能接入多少协议，而是能否建立一套可信的 Hook 注册、风险标记、报价验证和生产路由机制。

如果这些基础设施成熟，Uniswap 的竞争对象就不再只是其他 AMM，而会逐渐变成：

```
所有链上流动性来源的统一执行入口。
```

但如果 Hook 数量快速增长、质量参差不齐、虚拟池数据被误读、外部 callback 风险频繁暴露，那么它也可能变成一个复杂的适配器网络，最终由 Uniswap Labs 或少数路由器维护一套中心化白名单。

因此，Aggregator Hook 的真正长期叙事不是“Uniswap 接入了几个 DEX”，而是：

> Uniswap 是否能够把 v4 建成一个足够安全、可组合、可验证的链上流动性结算标准。
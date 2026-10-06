---
template: research
title: Uniswap v4 Hooks：机制、v3 可行性、RWA 与同池毕业
subtitle: v4 的关键是把可编程的交易规则接入统一结算。PoolManager 只保证账目结清，hook 的经济模型、合规边界和可路由性要开发者自己证明。
cols: 4
type: 技术调研 · dev 团队内部分享
audience: 懂 Solidity、了解 v2/v3 原理、没写过 v4 hook 的开发者
scope: v4 hook 机制与生命周期、v3 可行性、合规与 RWA hook、股票 quote launchpad 的同池毕业、其他代表性 hook、工程与安全、对 Mantle 的意义
evidence: 248 条论断台账（observed 197 / inferred 39 / speculative 12）；源码固定 commit；网页访问于 2026-10-06
date: 2026-10-06 · v1
---
结论先行：v4 hook 的辨识度不在“swap 前后能跑代码”。它在于 hook 能参与决定交易金额，并和原生集中流动性、跨池净额结算、ERC-6909 内部请求权组合（[F2](#F2)）。准入、动态费这类规则只有写进 hook 才对所有调用者生效（[F1](#F1)）。同时，PoolManager 只检查每个地址、每个币种的欠账都已结清，不检查 hook 的账目对不对（[F3](#F3)）。RWA 方向的关键结论：准入必须放在池层，但池层替代不了代币层（[F4](#F4)）；股票 quote 的同池毕业可以做，但目前没有生产实例（[F6](#F6)）。

## A v4 由哪些部分组成 {sheet meta="components"}
```tree list
`PoolManager` 单例 | 所有池子的状态与资产都在这一个合约里
`PoolKey` 池子身份 | 两个币、费率、tickSpacing、hook 地址
`Hook` 外部合约 | 地址低 14 位就是它的权限
`Router` 调用方 | unlock 后在回调里 swap、付款、取款
`PositionManager` LP 头寸 | 把头寸做成 ERC-721
`ERC-6909` 内部凭证 | 留在 PoolManager 里的资产请求权
```

## B 权限位：10 个回调 + 4 个 return delta {sheet span=2 meta="Hooks.sol"}
```annot
# hook 地址的低 14 位 | 位 13 → 0
[bI aI]{位 13、12：建池前后} [bAL aAL]{位 11、10：加流动性前后} [bRL aRL]{位 9、8：减流动性前后} [bS aS]{位 7、6：swap 前后} [bD aD]{位 5、4：donate 前后} [4 个 RD]{!位 3–0：允许回调返回 delta，改写记账}
> 例：只开 beforeSwap 的 hook，地址低 14 位必须恰好是 0x0080，要用 CREATE2 换 salt 挖出来
```

## C 这些能力离不离得开 v4 {sheet meta="v3 vs v4"}
| 能力 | 原版 v3 能否在池层强制 |
|---|---|
| 准入（allowlist） | no 只能放代币层或 router（可绕过） |
| 动态手续费 | no 费率档位固定 |
| 自定义曲线 / 记账 | no swap 数学写死 |
| 不迁池的发行 | ok 一开始就用 CL 头寸 |
| 自定义曲线 → CL 同池毕业 | no 需要 v4 return delta |

## D 关键数字 {sheet span=2 meta="2026-10"}
| 量 | 值 | 来源 |
|---|---|---|
| 建池 gas | v4 51,532；v3 4,557,092 | 两边官方测试快照 [4][9] |
| v4 30 天成交量 | $42.45B（DefiLlama） | [41] |
| 已初始化 hook | 1,000+（Uniswap Foundation 口径） | [39] |
| 官方 v4 部署 | 25 条链，不含 Mantle | 部署表 [34] |

## E 演进时间线 {sheet span=2 meta="2025–2026"}
```timeline
2025-05 | Cork 被攻击 | hook 的 hookData 授权被绕过，约 $12M
2025-07 | Angstrom 上线 | L1 上的 MEV 保护 hook
*2025-09 | Bunni 被攻击 | 多步操作下取整错误，约 $8.4M，之后停运
2026-07 | Permissioned Pools | Uniswap 官方许可池标准
2026-09 | StablePair 上线 | 官方动态费 hook；同月修复许可池 adapter 校验
*2026-10 | SMBC Nikko 宣布 | 日本合规 DeFi Gateway，2027 年中完成
```

## F 结论 {sheet span=4}
```callout ok 先懂结算，再写 hook
- 机制：hook 能拒绝、改费、改记账；欠账在 unlock 结束前必须结清，但“结清”不等于“账对”。
- v3：回调本身不依赖 v4，真正依赖的是单例、按差额结算和 return delta。
- RWA：准入放池层，转让限制留在代币层；官方许可池不让许可代币当中间跳。
- 同池毕业：可行，难点是毕业价、真实储备、头寸配比和跨阈值订单。先证明多段 CL 不够用，再上自定义曲线。
```

## G 如何阅读 {depth=1}
```callout info 默认你已知道（本文不解释）
- Solidity、ERC-20、合约之间的外部调用
- Uniswap v2 恒定乘积、v3 集中流动性的基本概念
- 交易有 gas，出块有顺序，mempool 中的交易可以被别人看到
```
- **5 分钟**：看总览（A–F）和导语。
- **30 分钟，要上手写 hook**：按顺序读 [前置知识](#panel-I)、[v4 机制](#panel-J)、[回调与记账](#panel-K)、[一个简单 hook](#panel-L)，再看 [工程与安全](#panel-Q)。
- **30 分钟，要评审 RWA / launchpad 方案**：读 [v3 能不能做](#panel-M)、[合规与 RWA](#panel-N)、[同池毕业](#panel-O)、[对 Mantle 的意义](#panel-R)。
- **分享会自测**：[交叉验证问题清单](#panel-S)。
- **完整**：再读 [方法与证据](#panel-U)，它说明调研方法、外部 Deep Research 怎么融合、哪些资料被修正。

## H 背景动机 {depth=2}
**问题**：hook 是近期 DEX 方向讨论最多的设计空间。团队需要能读懂、评审、动手写 hook，也需要判断 RWA 和股票 quote launchpad 这类方案该放在哪一层。

**为什么现在**：
- Uniswap 在 2026-07 发布官方许可池标准，2026-09 修复了它的 adapter 校验；日本券商 SMBC Nikko 在 2026-10 宣布用 v4 hook 做合规交易场所 [23][22][26]。
- Robinhood Chain 上已经出现以股票代币计价的 launchpad（Pons、PAIR、Bankr）[30][31][33]。
- 用户的 Tape 方案提出“股票 quote + 曲线发行 + 单池毕业”[40]。

**范围**：hook 机制与生命周期、v3 可行性、合规 / RWA hook、股票 quote launchpad 的同池毕业、其他代表性 hook、工程与安全、对 Mantle 的意义。

**非目标**：Uniswap 治理与费用开关；投资建议；对具体 hook 的完整代码审计。

**源码基准**：v4-core `46c6834`、v4-periphery `9969eec`、v4-template `1fbf955`、v4-hooks-public `e4eabe5`。文中行号都指这些 commit。

## I 前置知识 {depth=2}
```excalidraw q="读懂 v4 hook 需要先懂哪些概念？按什么顺序？" read="箭头表示先学 → 后学；灰色虚线框是默认已知；绿色是本文主题。" takeaway="B-0、B-2、B-3 讲结算；B-1 讲池子形态；B-4、B-5 讲 hook 怎么部署、能不能被换掉。" name=prereq-map kind=前置知识地图
{"grid": {"w": 300, "h": 120}, "defaults": {"w": 190, "h": 60},
 "nodes": [
   {"id": "v2", "label": "v2/v3 基本原理（已知）", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "sol", "label": "Solidity 调用（已知）", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 v3 回调付款", "col": 1, "row": 0, "color": "blue"},
   {"id": "b1", "label": "B-1 集中/单边流动性", "col": 1, "row": 1, "color": "blue"},
   {"id": "b4", "label": "B-4 CREATE2 地址", "col": 1, "row": 2, "color": "blue"},
   {"id": "b5", "label": "B-5 代理与升级", "col": 1, "row": 3, "color": "blue"},
   {"id": "b2", "label": "B-2 transient storage", "col": 2, "row": 0, "color": "blue"},
   {"id": "b3", "label": "B-3 ERC-6909", "col": 3, "row": 0, "color": "blue"},
   {"id": "mech", "label": "v4 结算与回调", "col": 3, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "app", "label": "RWA 与同池毕业", "col": 3, "row": 3, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "v2", "to": "b0"}, {"from": "v2", "to": "b1"}, {"from": "b0", "to": "b2"},
   {"from": "b2", "to": "b3"}, {"from": "sol", "to": "b4"}, {"from": "sol", "to": "b5"},
   {"from": "b3", "to": "mech"}, {"from": "b1", "to": "mech"}, {"from": "b4", "to": "mech"},
   {"from": "b5", "to": "app"}, {"from": "mech", "to": "app"}
 ]}
```

```prereq B-0 l1 5min
# v3 的回调付款（swap callback）
是什么: v3 池子先把输出币转给收款人，再回调调用者的 `uniswapV3SwapCallback`，调用者在回调里付款；池子只检查余额是否到账。
为什么需要: 这个回调回调的是调用者自己，用途是付款，不是池子挂的规则。所以 v3 核心里没有“对所有调用者强制执行”的入口。
误解: 误解：v3 的 callback 就是 hook。事实：任何人写一个实现了 callback 的合约都能直接调池子，绕过你的 router。
深入: [9] v3-core `UniswapV3Pool.sol` swap 与 mint
```

```prereq B-1 l1 5min
# 集中流动性与单边头寸（concentrated / single-sided liquidity）
是什么: LP 只在一个价格区间内做市。区间整体位于现价一侧时，头寸里只有一种资产，这就是单边头寸。
为什么需要: 很多“不迁池”的发行方案，就是一开始把新币放成单边或多段头寸，用它模拟曲线。这件事 v3 也能做。
误解: 误解：不迁池一定要 v4。事实：只有“自定义曲线 → 原生集中流动性、同一个池”才需要 v4。
深入: [32] Doppler multicurve 文档
```

```prereq B-2 l1 5min
# transient storage（EIP-1153）
是什么: `TSTORE` / `TLOAD` 写读一种只在当前交易内有效的存储，交易结束自动清空，单次操作 100 gas。
为什么需要: v4 把锁状态和每个“地址 × 币种”的欠账记在 transient storage 里，只在 unlock 结束时检查是否结清。部署 v4 的链必须支持这两个指令。
误解: 误解：EIP-1153 是 KYC hook 的前提。事实：它是 v4 结算实现的执行基础，与准入逻辑无关。
深入: [1] v4-core `Lock.sol`、`NonzeroDeltaCount.sol`
```

```prereq B-3 l1 5min
# ERC-6909 claim
是什么: PoolManager 内部的多币种余额。用户可以把应得的币留在 PoolManager 里换成 claim，之后再 burn 掉 claim 来付款。
为什么需要: 频繁交易的做市商和 hook 用它省掉“转出再转入”；claim 在地址之间转让时，底层代币合约完全看不到。
误解: 误解：claim 是 LP 份额。事实：claim 只对应某个币种，不对应某个池子，也没有价格区间。
深入: [1] v4-core `ERC6909.sol`、`PoolManager.mint/burn`
```

```prereq B-4 l1 4min
# CREATE2 挖地址（HookMiner）
是什么: CREATE2 的部署地址由部署者、salt、init code 哈希决定。换 salt 反复计算，直到地址低 14 位等于想要的权限位。
为什么需要: PoolManager 不查注册表，直接看 hook 地址的低位决定调用哪些回调。精确匹配 14 位平均约 16,384 次尝试。
误解: 误解：部署后还能改权限。事实：权限就是地址，换权限就是换地址，也就是换池子。
深入: [5] v4-periphery `HookMiner.sol`
依赖: B-0
```

```prereq B-5 3min
# 代理合约与可升级（proxy / upgradeability）
是什么: 代理合约把调用转发给一个可以替换的实现合约，地址不变，逻辑可以变。
为什么需要: hook 的地址固定了权限，但如果 hook 是代理，它内部的逻辑仍然可以被升级。LP 要问清谁能升级、能升级什么。
深入: [36] StablePair 博客“What an upgrade can and can't change”
```

## J v4 机制：单例、unlock 与按差额结算 {depth=2}
```excalidraw q="v4 里谁持有资产、谁调用谁？" read="蓝色是 v4 核心；绿色是你写的 hook；灰色虚线是用户与外部代币。" takeaway="所有池子的资产都在 PoolManager 里；hook 是被 PoolManager 在固定位置调用的外部合约，不持有池子的资产。" kind=直觉
{"grid": {"w": 360, "h": 130}, "defaults": {"w": 200, "h": 64},
 "nodes": [
   {"id": "u", "label": "用户", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "r", "label": "Router / PositionManager", "col": 1, "row": 1, "w": 230},
   {"id": "pm", "label": "PoolManager 单例", "col": 2, "row": 1, "color": "blue", "strokeWidth": 3},
   {"id": "pools", "label": "pools[PoolId]", "col": 2, "row": 0, "color": "violet"},
   {"id": "d", "label": "transient 欠账", "col": 2, "row": 2, "color": "violet"},
   {"id": "h", "label": "Hook", "col": 3, "row": 1, "color": "green"},
   {"id": "t", "label": "ERC-20 代币", "col": 1, "row": 2, "color": "gray", "stroke": "dashed"}
 ],
 "edges": [
   {"from": "u", "to": "r", "label": "交易"}, {"from": "r", "to": "pm", "label": "unlock"},
   {"from": "pm", "to": "h", "label": "回调"}, {"from": "pm", "to": "pools", "dashed": true},
   {"from": "pm", "to": "d", "dashed": true}, {"from": "t", "to": "pm", "label": "只在两端"}
 ]}
```

- **单例**：所有池子是 PoolManager 里 `_pools[PoolId]` 的一项。PoolId 是 PoolKey（两个币、费率、tickSpacing、hook 地址）的哈希。建池只写一组状态，不部署合约，也不需要先 unlock [1]。
- **一个池只能有一个 hook**；一个 hook 可以服务多个池，状态必须按 PoolId 分开。改 PoolKey 任一字段就是另一个池；已有池不能换 hook [1][8]。
- **hook 不是被注入的代码**：PoolManager 用外部调用进入 hook，hook 有自己的存储。它影响核心的方式只有四种：拒绝操作、返回费率、返回 delta、在 unlock 期间调用 PoolManager [2]。

**unlock 与结清检查**（`PoolManager.sol#L104-L113`）[1]：

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

- 每个操作（swap、加减流动性、donate）只给“调用者 × 币种”记一笔有符号 [[delta]]，不转账。
- 退出 unlock 前，**每一个**地址、每一个币种的 delta 都必须为 0。“所有账户加总为 0”不够 [1]。
- unlock 禁止嵌套，但不等于禁止重入：在已解锁的上下文里，hook 和其他合约仍然可以调用 PoolManager [1]。

**delta 的符号与结清方式**（站在调用者一侧）[1][5]：

| 操作 | delta 变化 | 实际资产 |
|---|---|---|
| swap 输入、加流动性 | 变负（欠池子） | 无 |
| `sync` + 转账 + `settle` | 负 → 0 | 代币转进 PoolManager |
| swap 输出、减流动性 | 变正（池子欠你） | 无 |
| `take` | 正 → 0 | 代币转出 PoolManager |
| `mint` / `burn` ERC-6909 | 正 → 0 / 负 → 0 | 不动代币，换成 claim |

**多跳**：同一次 unlock 里 A→B→C，中间币 B 的欠账互相抵消，只在两端转账；v3 的多跳要把中间币先转给 router 托管 [1][9]。按差额结算不会凭空产生资金：`take` 仍然需要 PoolManager 真有这么多币。

## K Hook 的回调、return delta 与动态手续费 {depth=2}
| 回调 | 调用时机 | 能改什么 |
|---|---|---|
| before/afterInitialize | 建池写入前后 | 只能拒绝或记录；动态费池可在 after 设初始费 |
| beforeAdd/RemoveLiquidity | 改头寸之前 | 只能拒绝或记录（LP 准入在这里做） |
| afterAdd/RemoveLiquidity | 改头寸之后 | 有 return-delta 位时，返回的 delta 记到 hook 名下 |
| beforeSwap | 计算 swap 之前 | 拒绝；动态费池覆盖本次费率；有 return-delta 位时改写进入曲线的数量 |
| afterSwap | swap 之后 | 有 return-delta 位时，在 unspecified 一侧加收或补贴 |
| before/afterDonate | donate 前后 | 只能拒绝或记录 |

来源：`Hooks.sol#L27-L47`、`#L247-L314`，`IHooks.sol` [2][3]。注意 `liquidityDelta == 0`（只领手续费）也走 remove 分支 [2]。

**hook 收到的 sender 不是用户**：`sender` 是直接调用 PoolManager 的那个合约，也就是 Router 或 PositionManager [2]。PositionManager 的头寸在 PoolManager 里的 owner 是 PositionManager 自己 [5]。所以准入类 hook 要识别真实用户，只能：
1. 信任一组 router 上报的 `msgSender()`（官方许可池的做法）[22]；
2. 验证放在 [[hookData]] 里的签名，签名要绑定池子、方向、数量、收款人、nonce、截止时间（Predicate 的做法）[24]；
3. 用 `tx.origin`（Algebra 的做法），代价是和账户抽象钱包、relayer 不兼容 [10]。

**return delta：hook 参与决定交易金额**

- [[BeforeSwapDelta]] 的坐标是 specified / unspecified，不是 amount0 / amount1。exact-input 时 specified 是输入币。v4 的 `amountSpecified` 负数表示 exact-input，和 v3 相反 [3]。
- 进入集中流动性曲线的数量 = `amountSpecified + hookSpecifiedDelta`，不能翻转 exact-in / exact-out；调用者最终的 delta = 原生 swap delta − hook delta [2]。
- **例子**（教学数字）：用户用 100 Q 买 250 M（exact-input）。hook 返回 specified +100 Q、unspecified −250 M。进入曲线的数量变成 0，这叫 [[NoOp swap]]。结果 Router 欠 100 Q、应得 250 M；hook 应得 100 Q、欠 250 M，hook 要在同一次 unlock 里用 `take` / `settle` 或 `mint` / `burn` claim 结清自己的账。
- 原生数量为 0 时 `slot0` 价格不动，所以自定义曲线的成交价可以和池子的 `slot0` 完全无关；原生 `Swap` 事件也描述不了这笔成交，索引器和聚合器要读 hook 自己的事件 [2][40]。

```solidity
// v4-core Hooks.sol#L254-L279（节选）
if (self.hasPermission(BEFORE_SWAP_FLAG)) {
    bytes memory result = callHook(self, abi.encodeCall(IHooks.beforeSwap, (msg.sender, key, params, hookData)));
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

**动态手续费的两条路径**（只有 `PoolKey.fee == 0x800000` 的池子可以用，建池后不可改）[3][8]：
- **持久修改**：hook 调 `updateDynamicLPFee(key, fee)` 写入池子状态，不需要 unlock。
- **单次覆盖**：`beforeSwap` 返回 `fee | 0x400000`，只对这一笔生效，不写存储。
- 单位是百万分之一：3000 = 0.30%。动态费池的初始费为 0。
- 区分三种“收费”：原生 LP 动态费（进 LP）、hook 用 return delta 收的费（进 hook）、router 加收的费（进 router）。

**hook 能不能换、能不能升级**：不能换，hook 地址是池子身份的一部分。能不能升级取决于 hook 自己：代理型 hook 可以换实现，但地址上的权限位不变，升级不能新增回调 [8][36]。

## L 一个简单 hook 的完整生命周期 {depth=2}
示例用官方模板 `v4-template` 的 Counter hook：开启 beforeSwap、afterSwap、beforeAddLiquidity、beforeRemoveLiquidity，每次只把计数加 1，不返回 delta，费率静态 0.30% [6]。

```solidity
// v4-template src/Counter.sol#L52-L68（1fbf955）
function _beforeSwap(address, PoolKey calldata key, SwapParams calldata, bytes calldata)
    internal override returns (bytes4, BeforeSwapDelta, uint24)
{
    beforeSwapCount[key.toId()]++;
    return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
}

function _afterSwap(address, PoolKey calldata key, SwapParams calldata, BalanceDelta, bytes calldata)
    internal override returns (bytes4, int128)
{
    afterSwapCount[key.toId()]++;
    return (BaseHook.afterSwap.selector, 0);
}
```

**部署**：权限 = 0x80 | 0x40 | 0x800 | 0x200 = `0x0AC0`。脚本用 `HookMiner.find` 求 salt，再 `new Counter{salt: salt}(poolManager)`，最后断言实际地址等于挖出的地址；构造函数里 `BaseHook` 会校验“声明的权限 == 地址位” [6][7]。

```uml q="一个 hook 从部署到被使用，经历哪些状态？" read="“已绑定”可以对多个池子重复发生。" takeaway="hook 一旦绑上某个池子就卸不下来；“换 hook”等于建一个新池子。"
stateDiagram-v2
  state "已部署（地址位固定）" as Deployed
  state "已绑定到池子" as Bound
  state "交易中" as Active
  [*] --> Deployed : HookMiner 求 salt，CREATE2 部署，构造函数校验权限
  Deployed --> Bound : PoolManager.initialize(key 含 hook)
  Bound --> Active : 加流动性 / swap / donate 触发回调
  Active --> Active : 每次操作调用对应的 before / after
  note right of Bound : 只有 initialize 时校验地址有效性
```

**每一步的欠账变化**（以 PositionManager 加流动性、Router 卖 1e18 token0 为例）[1][5]：

| 步骤 | 调用 | 调用者欠账 |
|---|---|---|
| 建池 | `initialize`（不需要 unlock），Counter 没有 init 位，不回调 | 无 |
| 加流动性 | `modifyLiquidity(+L)` → `beforeAddLiquidity` 计数 +1 | 两个币都为负 |
| 付款 | `SETTLE_PAIR`：`sync` → `transferFrom` → `settle` | 回到 0 |
| swap | `swap(-1e18)` → `beforeSwap` +1 → 曲线计算 → `afterSwap` +1 | token0 −1e18，token1 +out |
| 结清 | `SETTLE_ALL(token0)`、`TAKE_ALL(token1, minOut)` | 回到 0，unlock 返回 |

```uml q="一笔 swap 从用户到结清，谁调用谁？" read="以 Counter hook 为例；步骤 4–8 在 PoolManager 内部完成；10–12 是 Router 结清欠账。" takeaway="hook 决定规则，核心计算原生交易，Router 组织付款与取款，PoolManager 最后检查是否结清。"
sequenceDiagram
  autonumber
  participant U as 用户
  participant R as Router
  participant PM as PoolManager
  participant H as Counter hook
  participant T as ERC-20
  U->>R: swapExactIn(1e18, minOut)
  R->>PM: unlock(data)
  PM->>R: unlockCallback(data)
  R->>PM: swap(key, amountSpecified = -1e18)
  PM->>H: beforeSwap(sender = Router)
  H-->>PM: selector, 零 delta, 0
  PM->>PM: 集中流动性计算，扣 0.30%
  PM->>H: afterSwap(swapDelta)
  H-->>PM: selector, 0
  R->>PM: sync(token0)
  R->>T: transferFrom(用户 → PoolManager)
  R->>PM: settle() 与 take(token1, 用户, out)
  PM->>PM: 检查每个地址与币种的欠账为 0
  PM-->>U: 交易完成
```

**gas**：建池 v4 51,532 gas，v3 `createPool` 4,557,092 gas [4][9]。多跳每多一跳 v4 约 +57.5k、v3 约 +64.7k，但两组快照的测试工具和计费口径不同，这个差值不能当精确结论（推测）。hook 开销主要来自 hook 自己的存储写入：Counter 每次回调做一次计数自增，首次约 2.2 万 gas，之后约 5 千 gas（推断）。

## M hook 能不能在 v3 上实现 {depth=2}
判断标准：**这条规则是否必须约束所有访问该池的路径，以及它是否必须参与该池自身的资产记账。**

| 能力 | v4 依赖什么 | v3 上的近似 | 代价 |
|---|---|---|---|
| 准入 | PoolManager 每次 swap / 改流动性都调 hook | router 检查；代币层限制；fork 加插件 | router 可被绕过；代币层分不清 swap 和转账 |
| 动态手续费 | 动态费标志 + 费率覆盖 | router 加价；多个费率档池子 | router 加的费 LP 收不到；流动性分散 |
| 自定义曲线 / 记账 | return delta | 没有入口，只能另写 AMM 或 fork | 不再共享 Uniswap 的路由与审计 |
| 池内毕业 | hook 状态 + return delta，同一个 PoolId | 只能迁到新池 | v3 的 `initialize` 谁都能抢先调用 |
| 限价单 / TWAMM | afterSwap 看到成交后的 tick | 外部合约 + keeper | 需要信任 keeper 的活性 |
| 低成本建池 | 单例 | 每池一次 CREATE2 部署 | 部署成本高 |
| 多跳只结差额 | 按差额结算 | 中间币先转给 router | 每跳多两次转账 |
| 原生 ETH | `address(0)` 直接结算 | router 自动包装 WETH | 多一次包装，功能等价 |

来源：v3-core 与 v4-core 源码 [1][9]；V 分册逐项核对。

```uml q="为什么只在 router 里做 KYC，在 v3 上挡不住人？" read="上半段是正常路径，下半段是攻击者自己写合约直接调池子。" takeaway="v3 池子只检查钱有没有到账，不关心是谁调用；准入必须放在池子一定会执行的位置。"
sequenceDiagram
  autonumber
  participant U as 合规用户
  participant KR as KYC Router
  participant P as v3 池子
  participant A as 攻击者合约
  U->>KR: swap
  KR->>KR: 检查 KYC
  KR->>P: pool.swap
  P->>KR: uniswapV3SwapCallback，付款
  A->>P: pool.swap（不经过 KYC Router）
  P->>A: uniswapV3SwapCallback
  A->>P: 付款，余额到账
  Note over P,A: 池子只检查余额，交易成功
```

```finding F1 high
# 准入只有写进池子一定会执行的位置才有约束力
结论: v3 的 `pool.swap` 对任何调用者开放，router 层的准入能被直接调池子绕过；v4 的 `swap` 内部一定会调用 hook 的 beforeSwap，所以准入写进 hook 才对所有路径生效。
证据: [observed] v3 `swap` 只有 `noDelegateCall` 修饰，只检查余额到账 [9]。[observed] v4 `PoolManager.swap` 内部调用 `key.hooks.beforeSwap` [1]。[observed] v3 上代币层限制反而有效，因为每笔 swap 都真实转账 [9]。
影响: 评审任何“合规池”方案，先问：未授权的人自己写一个合约直接调核心，会不会被拦住。
```

```finding F2 high
# 回调机制本身不依赖 v4，离不开 v4 的是单例、按差额结算和 return delta
结论: Algebra Integral（v3 系）、PancakeSwap Infinity、Balancer v3 都做了池级回调。真正离不开 v4 架构的是三件事：建池只是状态更新、多跳只结差额、hook 用 return delta 改写记账。
证据: [observed] Algebra 插件由管理员挂载、可以更换和批量升级 [10]。[observed] PancakeSwap Infinity 有和 v4 相同的 4 个 return delta 权限 [11]；Balancer v3 只能在 after hook 改结果 [12]。[inferred] v4 hook 不可更换、任何人建池都能指定 hook，这两点和 Algebra 相反。
影响: 结论要写成“v3 上也能做，但要 fork 核心或另写 AMM；要保留标准 PoolManager 的路由和结算接口，用 v4”，不要写成“没有 EIP-1153 就做不了动态费或合规池”。
```

| 维度 | Uniswap v4 | Algebra Integral | PancakeSwap Infinity |
|---|---|---|---|
| 池结构 | 单例 | 每池独立合约 | Vault + 多个单例 |
| 谁能挂 hook | 任何人建池时指定 | DEX 管理员 / DAO | 建池时写进 PoolKey |
| 能否更换 | 不能 | 能，可批量升级 | 不能 |
| 改记账 | 4 个 return delta | 只能返回插件费和覆盖费 | 与 v4 相同 |

## N 合规与 RWA hook {depth=2}
```excalidraw q="代币合约、hook、前端各自看得见什么？" read="代币层只看得见资产进出 PoolManager 的边界；池内的所有权变化只有 hook 看得见。" takeaway="代币层和池层是两道互补的闸门，谁也替代不了谁。" kind=分层
{"grid": {"w": 330, "h": 120}, "defaults": {"w": 220, "h": 60},
 "nodes": [
   {"id": "fe", "label": "前端 / API 预检", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "hook", "label": "池层：hook", "col": 0, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "tok", "label": "代币层：transfer 检查", "col": 0, "row": 2, "color": "blue"},
   {"id": "fe2", "label": "只影响体验", "col": 1, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "hook2", "label": "每次 swap / 加流动性", "col": 1, "row": 1, "color": "green"},
   {"id": "tok2", "label": "只看 settle / take 边界", "col": 1, "row": 2, "color": "blue"},
   {"id": "blind", "label": "看不见：claim、LP 头寸、多跳中间币", "col": 2, "row": 2, "w": 280, "color": "red"}
 ],
 "edges": [
   {"from": "fe", "to": "fe2"}, {"from": "hook", "to": "hook2"}, {"from": "tok", "to": "tok2"},
   {"from": "tok2", "to": "blind", "dashed": true}
 ]}
```

```finding F4 high
# 代币层看不到池内的所有权变化，准入必须放在池层；但池层也替代不了代币层
结论: v4 的 swap 只改欠账。铸造和转让 ERC-6909 claim、持有 LP 头寸，都不触发代币的 transfer 检查。如果代币用允许名单，PoolManager 这个共享单例就得进名单，进去以后单例内部的流转就不再受约束。反过来，用户离开池子以后怎么转让、能否冻结赎回，仍要由代币层管。
证据: [observed] `PoolManager.swap` 只记 delta，`take` 才是一次真实转账 [1]。[observed] 官方架构文档：PoolManager “cannot be added to every issuer's allowlist”，直接持有许可代币会让它“be minted into an ERC-6909 claim and traded without the allowlist” [20]。[inferred] 资料里“代币黑名单看不到池内换手”需要细化：`take` 时代币仍能看到最终收款人。
影响: 合规设计写成五层：资产与 adapter、池层 hook、LP 权利、Router 身份传递、链。每层只负责自己能看见的部分。
```

**官方 Permissioned Pools**（2026-07 发布，伙伴 Superstate、Securitize、Dowgo；目前只部署在 Ethereum 与 Sepolia）[19][20][23]。它不是一个 allowlist hook，而是四个合约的组合：
1. **Permissions Adapter**：托管底层许可代币，同时自己就是池子里交易的“虚拟代币”。虚拟代币只能由 PoolManager 持有，一旦转出 PoolManager，就立刻 burn 并把底层代币交给收款人 [22]。池子的 currency 填 adapter 地址，不填底层代币。
2. **PermissionedHooks**：Uniswap 部署的共享 hook，用四个回调 [20]。
   - beforeInitialize：池里必须有工厂验证过的 adapter。
   - beforeSwap：检查 `SWAP_ALLOWED`，以及发行方是否暂停。
   - afterSwap：只发事件。
   - beforeAddLiquidity：检查 `LIQUIDITY_ALLOWED`。
3. **Permissioned Position Manager**：LP NFT 不可转让；发行方可以 `unwindPosition` 强制平仓，资产先退给持有人，收不了的才回到该资产自己的发行方 [20]。
4. **Universal Router ≥ 2.2.0**：负责包装 / 解包；进入 Uniswap 前端和 API 路由要人工审核 [21]。

```uml q="一个合规用户用 USDC 买许可代币 X，在哪几步可能被拒？" read="红框标出的是链上拒绝点；前端预检只影响体验，不是安全边界。" takeaway="允许名单被查两次：Router 包装时一次，hook 的 beforeSwap 一次；底层代币自己的转账规则在交付时再查一次。"
sequenceDiagram
  autonumber
  participant U as 用户
  participant R as Universal Router 2.2
  participant PM as PoolManager
  participant H as PermissionedHooks
  participant A as Adapter（虚拟 X）
  participant C as 发行方 Checker
  U->>R: 买 X（前端已预检允许名单）
  R->>PM: unlock → unlockCallback
  R->>PM: swap(USDC / 虚拟 X)
  PM->>H: beforeSwap(sender = Router)
  H->>C: router.msgSender() 是否有 SWAP_ALLOWED
  H->>A: Router 是否在 allowedWrappers，swap 是否开启
  rect rgb(255, 235, 235)
    H-->>PM: 任一不满足就 revert
  end
  PM->>PM: 集中流动性计算
  PM->>H: afterSwap：发事件
  R->>PM: settle USDC，take 虚拟 X 给用户
  PM->>A: 虚拟 X 转出
  A->>U: burn 虚拟 X，交付底层 X（X 的转账规则检查收款人）
```

```finding F5 high
# 官方许可池让许可代币只能当交易的起点或终点
结论: Uniswap API 只把许可代币作为交易的输入或输出，不作为中间跳。所以“USDC → 股票代币 → meme”这种以许可股票为中间跳的路径，走不了官方路由。
证据: [observed] 官方文档原文：“Permissioned tokens are matched only as the input or output of a trade, never as an intermediate hop” [21]。[inferred] 股票 quote 的 meme 池即使流动性充足、用户已 KYC，也不代表用户从 USDC 出发能在官方路由里买到 meme。
影响: 股票 quote launchpad 要么自建发行方认可的 Router，要么让用户先持有股票代币再交易；这是产品规则限制，不是 EVM 做不到。
```

**其他合规 hook**：

| 项目 | 准入数据来源 | 状态 | 要点 |
|---|---|---|---|
| Predicate（Paxos USDL） | 链下 operator 按策略签名，放在 hookData | 已有生产部署；开源 | 另配 AutoWrapper：把 rebase 的 USDL 包成非 rebase 份额再进池 [24] |
| Coinbase Verified Pools（Base） | 链上 EAS 证明（已验证账户 + 国家）与制裁名单 | 已上线；未找到 hook 源码和审计 | 凭证可被任何合约复读，但只认 Coinbase 一家签发 [25] |
| SMBC Nikko × Nethermind | 池内 hook 执行 AML/CFT 与投资者保护 | 2026-10-02 宣布，目标 2027 年中 | 方向信号，不是已上线案例 [26] |
| PureFi Verifier Hook | issuer 签发数据包放进 hookData | 公开参考代码（未核实源码） | 凭证型准入的另一种写法（推测） |

## O 股票 quote launchpad：毕业后不迁池 {depth=2}
先把三种架构分清楚。它们都能让用户“感觉不到迁移”，但工程难度差很多：

| 类型 | 发行阶段 | 毕业时 | 代表 |
|---|---|---|---|
| A 外部曲线 → 新池 | 独立曲线合约 | 创建新池并注资 | Pons V2（毕业时铸全区间 v4 头寸进 locker）[30] |
| B 一开始就是 CL 池 | 单边或多段头寸模拟曲线 | 不搬资产，最多改阶段标志 | PAIR、Bankr / Doppler、Zora、pools.trade [31][32][33] |
| C 同一个 v4 池：自定义曲线 → 原生 CL | hook 用 return delta 接管报价 | 储备变成原生头寸，PoolId 不变 | untoll-hook（测试网、未审计）[29] |

```finding F6 high
# 同池毕业（C 类）可行，但目前没有生产实例
结论: 已上线的“不迁池”产品都是 B 类，Pons V2 是 A 类；C 类只找到一个测试网、未审计的开源实现。B 类 v3 也能做，只有 C 类需要 v4。
证据: [observed] Pons V2 每个 launch 一条独立曲线，毕业时铸全区间 v4 头寸进永久 locker [30]。[observed] untoll-hook 在 beforeSwap 里报曲线价，跨阈值时在同一个 unlock 内注入全区间头寸，README 写明“testnet-bound”、未审计 [29]。[speculative] 生产实例的检索没有穷尽。
影响: 对 Tape：先证明 B 类（多段 CL 从一开始运行）满足不了发行经济模型，再承担 C 类的复杂度。
```

**C 类的四个难点**

1. **同一个池不能重新 initialize**。做法是建池时就把价格设在曲线终点价 P*。曲线阶段原生流动性为 0，所有交易由 hook 接管，`slot0` 不动；毕业时直接在 P* 建头寸 [29]。前提：P* 能提前算出；所有 swap 都受 hook 控制；禁止外部提前加流动性。如果毕业阈值按股票的美元价动态变化，P* 就不再确定。
2. **毕业只能用真实储备**。虚拟储备只是定价参数，变不成 LP 资金。阈值按净售出量和实际募集的 quote 判定。不要按累计买入量判定，否则来回买卖就能推进“毕业进度”。曲线阶段的 quote 可以用 ERC-6909 claim 按 PoolId 托管，毕业时 burn claim 偿付头寸的欠账 [29]。
3. **储备配比要和毕业价一致**。例：曲线 p(s)=1+0.01s，卖到 100 M 时毕业，P*=2 Q/M，募集 R_Q=∫₀¹⁰⁰(1+0.01u)du=150 Q。直接把 100 M + 150 Q 放成全区间头寸，比例是 1.5，和终点价 2 不一致。毕业瞬间价格会跳。按 P*=2 应放 75 M + 150 Q。剩下 25 M 按预先公布的规则锁定、销毁或另放区间（G13，主会话复算）。两币精度不同时还要按 10^(d1−d0) 换算原始价格。
4. **跨阈值的订单**。用户出 100 Q，曲线只剩 20 Q 的容量，有三种处理：
   - Router 在链上裁剪到 20 Q，剩下的不收（最容易证明正确，但用户要允许部分成交）；
   - 同一次 unlock 里拆成两笔：20 Q 走曲线，毕业，80 Q 走新头寸；
   - 单次 beforeSwap 内先吃满曲线，余量留给刚注入的头寸（untoll-hook 的 no-straddle 规则就是这样）[29]。

```uml q="同池毕业的阶段怎么切换？" read="Graduating 只存在于同一笔交易的 unlock 回调里。" takeaway="切换要原子完成；任何一步失败，整笔交易回滚，阶段仍是曲线。"
stateDiagram-v2
  state "曲线阶段（hook 报价）" as Curve
  state "毕业中（瞬态）" as Graduating
  state "集中流动性阶段" as AMM
  [*] --> Curve : initialize 在 P*，原生流动性为 0
  Curve --> Graduating : 跨阈值的那一笔
  Graduating --> AMM : 注入头寸并结清，放弃铸币权
  note right of Curve : 买卖按曲线成交，外部加减流动性被拒
  note right of Graduating : 任一步失败，整笔回滚，仍是曲线阶段
  note right of AMM : 市场暂停、发行方暂停要与阶段分开管理
```

```uml q="从发射、曲线买入、触发毕业到毕业后交易，同一个 PoolId 里发生了什么？" read="参照 untoll-hook 的同池毕业模式；quote 是非 rebase 的股票包装份额 qSTOCK。" takeaway="毕业注入的头寸由 hook 自己持有、直接用 claim 结清；hook 自己调用 PoolManager 时，它自己的回调会被跳过，所以毕业函数必须自己检查授权和状态。"
sequenceDiagram
  autonumber
  participant F as Launch Factory
  participant U as 买家
  participant R as Launch Router
  participant PM as PoolManager
  participant H as Launch Hook
  F->>PM: initialize(meme / qSTOCK, hook, 价格 = P*)
  U->>R: 用 qSTOCK 买 meme
  R->>PM: unlock → swap
  PM->>H: beforeSwap：曲线报价
  H->>PM: 收 qSTOCK 为 claim，交付 meme
  H-->>PM: delta 抵消全部输入，原生数量为 0
  R->>PM: settle qSTOCK，take meme
  U->>R: 跨阈值的一笔
  R->>PM: unlock → swap
  PM->>H: beforeSwap：只成交到阈值
  H->>PM: modifyLiquidity：在 P* 注入头寸
  H->>PM: burn claim 结清头寸欠账
  PM->>PM: 余量在新头寸上按集中流动性成交
  R->>PM: 结清，unlock 检查通过
  U->>R: 毕业后交易
  R->>PM: swap：hook 不再接管报价
```

**股票 quote 的额外坑**

```finding F7 high
# xStocks 在 EVM 上是 rebase 代币，不能直接放进 v4 池
结论: xStocks EVM 版的 `balanceOf()` 随拆股、分红的 multiplier 直接变化，并按时间戳自动生效。PoolManager 只按收到的数量记账，无法按 multiplier 重标。余额上调后，多出来的币不属于任何池子。余额下调后，PoolManager 欠出的币会多于实际持有的币。
证据: [observed] xStocks 文档：“On EVM chains, the contract handles this automatically — when the multiplier updates, it adjusts all user balances directly” [27]。[observed] Robinhood Stock Tokens 采用另一种做法：原始余额不变，`uiMultiplier()` 只用于显示 [28]。[inferred] 对 v4 账本的影响由 PoolManager 的记账方式推出 [1]。
影响: 先把股票代币包成非 rebase 的份额再进池；用户 Tape 方案提出的 qToken 包装和 Paxos 的 AutoWrapper 是同类做法 [40][24]。
```

```finding F8 medium
# 股票的美元预言机约束不了 meme / 股票池的价格
结论: P(meme/USD) = P(meme/股票) × P(股票/USD)。知道股票的美元价，并不知道 meme 的公允价，所以预言机不能判断 meme / 股票池是否偏离。休市熔断真正该监控的，是股票代币自身相对喂价的溢价。
证据: [inferred] 由价格链式关系推出（G14）。[observed] Robinhood 股票喂价 24/5 更新，`oraclePaused` 只是建议性标志，不在链上强制 [28]。[observed] xStocks 建议在 multiplier 生效前后各暂停约 15 分钟 [27]。
影响: 熔断规则分两层：股票代币的健康度（溢价、过期、发行方暂停）和 meme 交易的保护（用户限价、单笔额度、价格冲击）。
```

- **一个池只能挂一个 hook**：曲线、熔断、准入要么写进同一个组合 hook，要么用官方许可池 hook 而放弃曲线；两个 hook 地址不能同时放进 PoolKey [1][40]。
- **公司行动**：用户方案设想监听 `UIMultiplierUpdated` 并“调整 tick 参照系”。xStocks EVM 的事件实际是 `MultiplierScheduled` / `MultiplierUpdated`，而且 v4 hook 没有调整 tick 参照系的接口；用非 rebase 包装、以“每份对应多少股”表达倍率更可行（推断）。
- **永久锁 LP 与强制退出冲突**：meme 发射常说“LP 永久锁定”，但 RWA 资产可能需要发行方召回、资格撤销后平仓、到期赎回。要写清楚：“创作者不能抽走 LP”成立，“任何情况下都没人能退出”未必成立。

## P 其他代表性 hook {depth=2}
按 hook 改动的深浅排列：改得越深，需要信任的范围和攻击面越大。

| hook | 改了什么 | 用到的关键权限 | 状态（2026-10） |
|---|---|---|---|
| StablePair（Uniswap 官方） | 费用：按方向动态定价 | 动态费；无减流动性回调、无 return delta | Ethereum 上 2 个池，治理控制升级 [36] |
| WETH / wstETH hook | 记账：包装兑换，没有 LP 库存 | return delta | 已部署多链，OpenZeppelin 审计 [36] |
| Clanker 动态费 | 费用 + 开盘准入 | before/afterSwap 带 return delta | Base 上运行 [38] |
| OpenZeppelin 限价单 | 订单：hook 自有头寸 | afterInitialize、afterSwap | 库实现，未见规模部署 [7] |
| Doppler | 曲线：hook 挪动自有头寸 | afterInitialize、before/afterSwap、beforeAdd | Zora 等在用 [32] |
| DualPool（Uniswap 官方） | 流动性：swap 时临时从 ERC-4626 金库取出部署 | before/afterSwap | 2026-07 审计 [36] |
| Angstrom | 准入与排序：节点批量结算 / L2 优先费税 | 动态费、afterSwap return delta | L1 30 天成交 $396M [37][41] |
| Bunni v2 | 曲线与记账整体替换 | beforeSwap return delta | 2025-09 被攻击后停运 [16] |

**StablePair：把纠偏套利的价值留给 LP**[36]
- 带内：两个方向的费率等于 AMM 价到带边界的距离，两者之和等于带宽；所以买单总在带上沿成交、卖单总在下沿成交，报价按区块初价计算。
- 带外：继续远离参考价的交易零费，它们本来就给了 LP 好价格。纠偏交易要付逐块下降的费用，起点等于带的远端价。第一个愿意接受的人成交，相当于一场 Dutch auction。
- 权限边界：代理地址低 14 位是 0x3CC0，没有减流动性回调和 return delta 权限。官方原话：升级不能扩大权限，也不能阻止 LP 提款（G2、G4）。

**Angstrom：L1 与 L2 是两套机制**[37]
- L1：用户订单发给一组质押节点，节点在链下跑套利拍卖和统一价批量拍卖。每块第一笔交易由节点用一笔 `execute` 原子结算。之后本块剩余时间对外开放。
- L2：不用节点网络。`beforeSwap` 读优先费，按 `tax = 系数 × 120,000 × (优先费 − 下限)` 收确定性税，Router 可在 hookData 里放 `maxSwapTax` 做保护；`afterSwap` 把税分给 LP、池创建者和协议。
- 对 Mantle：如果排序优先权不由优先费表达（例如 preconfirmation、特殊通道），L2 税模型捕获不到同样的价值。

```finding F3 high
# PoolManager 只保证结清，不保证 hook 的账目正确
结论: 两起最大的 hook 事故都出在 hook 自己的应用逻辑上，结算全程闭合、交易都成功了。
证据: [observed] Bunni 2025-09-02：闪电贷推价后做 44 次微额提款，利用取整把活跃余额从 28 wei 压到 4 wei，再反向交易，损失约 $8.4M；官方结论是“safe in isolation”的取整方向在多步组合下失效 [16]。[observed] Cork 2025-05-28：hook 的 beforeSwap 对 hookData 的授权被绕过，3,761 wstETH 被提走 [15]。[observed] Trail of Bits：PoolManager 只保证结算闭合，不验证 hook 内部账目 [13]。
影响: 测试要覆盖多步组合下的取整方向、四种 exact-in/out × 方向组合，以及“结清但被掏空”的场景。
```

```finding F9 medium
# hook 改得越深，信任面和攻击面越大
结论: 只改费用的 hook（StablePair、Clanker）主要风险是参数和升级；接管曲线和记账的 hook（Bunni）把 v4 池降格成一个结算账户，信任对象扩展到外部金库、curator 和 hook owner。
证据: [observed] Bunni 在 beforeSwap 里用自己的流动性密度函数算整笔 swap，资金存放在 BunniHub、可再质押到 ERC-4626 金库 [16]。[observed] DualPool 平时把资产放在 ERC-4626 金库，swap 时临时部署，源码写明“Pricing is fully static” [36]。[inferred] 金库能否即时赎回，决定这类 hook 在 swap 时能否拿到资金。
影响: 股票 quote 资产如果赎回有营业时间或排队，就不能套用“即时从金库取出”的模型。
```

## Q 工程与安全 {depth=2}
| 风险 | 机制 | 案例 / 证据 |
|---|---|---|
| 回调缺少 onlyPoolManager | hook 回调是 external，谁都能直接调 | Cork [15]；periphery `onlyPoolManager` [5] |
| 信任任意 PoolKey | 建池无许可，攻击者能用你的 hook 建一个他选币的池 | Trail of Bits [13] |
| delta 记账或取整错误 | 结清不等于账对 | Bunni [16] |
| 权限位与实现不一致 | 少一个 return-delta 位，返回的 delta 被当成 0 | Angstrom 审计发现 [13] |
| 可升级 hook 与管理员 | 地址位固定，代理背后的逻辑可以换 | Uniswap Foundation 安全框架 [14] |
| 恶意 hook / DoS | after 回调 revert 会连带父操作，LP 可能撤不出 | [14] |
| 自调用跳过回调 | hook 自己调 PoolManager 时，它自己的回调不触发 | `Hooks.sol` noSelfCall [2] |
| 重入与 transient 假设 | 一笔交易里同一个 hook 可能被多个池、多跳调用多次 | [13] |

```finding F10 medium
# 聚合器不会自动路由带 hook 的池子
结论: Uniswap 自家路由只把两类池子放进普通队列：没有 hook 的，以及 hook 不带 swap 权限、不带 return delta、不是动态费的。其余要自动或人工加白名单。1inch 要求 hook 行为能被它建模；0x 要单独提交审核。
证据: [observed] uniroute 的池子准入条件与许可池单独通道 [17]。[observed] 1inch：“not automatically routable … simply because it exists” [18]。[observed] Uniswap Foundation 的 Hook Design Lab 给路由方的 gas 补贴，说明带 hook 池子需要专门争取订单流 [39]。
影响: 写 hook 的同时规划报价接口（quoter）和集成路径；“支持 v4”不等于“支持你的 hook”。
```

**两个常见误判**
- “所有 delta 都结清了，所以没有损失”：错。攻击者可以利用错误的份额价格或取整，以合约认可的方式取走资产，账目仍然完全平衡（Bunni）。
- “hook 地址不变，所以规则不变”：错。代理 hook 的实现、配置、预言机、允许名单检查器都可能变。地址位只限制能调用哪些回调。

**gas 实测分组建议**（推断）：
- 无 hook 基线、只读 beforeSwap、写状态的动态费；
- 合规 hook + checker、签名验证 hook；
- 自定义记账 + claim、金库往返、曲线最后一笔 + 毕业。

要固定编译器、冷热访问和交易大小。在 Mantle 上还要看数据费，不能只比执行 gas。

## R 对 Mantle 的意义 {depth=2}
```finding F11 medium
# Mantle 已支持 v4 依赖的 EIP-1153，但没有官方 v4 部署，原生币是 MNT
结论: Mantle 自 Skadi 升级起支持 EIP-1153；Uniswap 官方部署表里 Mantle 只有 v3、Permit2 和 Universal Router 2.0.0，没有 v4 PoolManager；官方许可池只在 Ethereum 与 Sepolia。
证据: [observed] Mantle 文档 Skadi changelog 引入 EIP-1153、MCOPY、EIP-7702 [35]。[observed] `deployments.json`（2026-09-22 生成）中 v4 PoolManager 部署在 25 条链，不含 Mantle（chainId 5000）[34]。[observed] Mantle v2 Tectonic 起 MNT 是原生代币，gas 以 MNT 计价 [35]。[observed] v4-core PoolManager 的许可证是 BUSL-1.1 [1]。
影响: v4 里 `address(0)` 代表的原生币在 Mantle 上是 MNT，照搬以太坊上 ETH 的例子要改；在 Mantle 部署官方 v4 或 fork 的许可与治理路径要单独核实。
```

**合规规则放在哪一层**（用户资料 05 的分层 + 本文证据）：

| 层 | 负责什么 |
|---|---|
| 资产 / Adapter | 底层托管、持有资格、转让、赎回、公司行动 |
| 池层 hook | 池级准入、市场状态、费率、报价与库存风险 |
| LP 权利 | 头寸转让限制、强制退出 |
| Router / 聚合器 | 用户身份传递、签名意图、路径、滑点 |
| 链 | 正确的 EVM 能力、可预测的排序、制裁级过滤 |

- 用户资料提出：链层只做制裁级过滤，股票 quote 的准入放在资产 / 池 hook，meme 腿保持无许可 [40]。本文的证据与这个切法一致，但它是方案选择，不是本文的结论。
- 与 PropAMM / JIT Router 的结合点（推断）：链和 preconfirmation 负责顺序保证；做市商签发报价；hook 检查报价时效、库存和身份，再把价格转成 delta；Router 组织多跳和限价。路由模拟要考虑同一个池在一笔交易里被访问两次、跨越毕业边界、身份不同导致的结果不同。

## S 交叉验证问题清单 {depth=2}
分享会上可以用这张表快速检查理解。

| 问题 | 正确答案 |
|---|---|
| v4 有 14 个回调吗？ | 10 个回调 + 4 个 return-delta 权限 |
| hook 看到的 `sender` 是谁？ | 直接调用 PoolManager 的合约，通常是 Router |
| EIP-1153 是 KYC hook 的逻辑前提吗？ | 不是，它是 v4 结算的执行基础 |
| 所有 delta 加总为 0 就能退出 unlock 吗？ | 不能，每个地址 × 币种都要为 0 |
| BeforeSwapDelta 是 amount0 / amount1 吗？ | 不是，是 specified / unspecified |
| 自定义报价一定更新 `slot0` 吗？ | 不一定，原生数量为 0 时价格不动 |
| ERC-6909 claim 是 LP 份额吗？ | 不是，是某个币种的请求权 |
| 一个池能挂两个 hook 吗？ | 不能，要写组合 hook |
| 同池毕业能重新 initialize 吗？ | 不能，要提前把价格设在毕业价 |
| 虚拟储备能变成毕业的 LP 资金吗？ | 不能，只能用真实储备 |
| Pons V2 是同池毕业吗？ | 不是，毕业时铸新的 v4 头寸 |
| 股票美元预言机能约束 meme 价格吗？ | 不能 |
| 官方路由会把许可股票当中间跳吗？ | 不会 |
| Mantle 支持 transient storage 等于 v4 已部署吗？ | 不等于 |

## T 局限与开放问题 {depth=2}
- 本文读的是源码与文档，没有逐一核对链上部署字节码、代理实现和审计版本；没有在 Mantle RPC 上实测 transient storage。
- 采用数据不统一：hook 数量有 1,000+（Uniswap Foundation）、4.1 万、9 万几种说法，后两者只有二手来源；带 hook 池子的成交占比没有一手数据。
- PureFi、Coinbase Verified Pools 的源码与审计没有找到或没有读。
- 开放问题：
  1. Mantle 上的 xStocks 合约是哪一个实现？管理费参数是否为 0？有没有 Chainlink 喂价？
  2. 在 Mantle 部署官方 v4 的许可与治理路径（BUSL-1.1 的附加授权、DAO 部署流程）。
  3. 官方许可池是否有专门的审计报告？
  4. 如果合规要求连“可转让的经济请求权”也要限制，ERC-6909 claim 的全部路径需要单独评审。
  5. 同池毕业的真实成本：在同一条链上实测“曲线最后一笔 + 毕业”的最坏 gas。

## U 方法与证据 {depth=3}
- **调研方式**：四路并行（机制、v3 与安全、合规 / RWA / 同池毕业、其他 hook），每路以固定 commit 的源码和官方文档为一手来源；台账 248 条，存放在报告目录的 `research/ledger.md`。
- **外部 Deep Research 的融合**：用户提供的 GPT Deep Research 存为 `research/gpt-deep-research.md`，当作线索处理。它新增的 StablePair、Angstrom L2、DualPool、WETH / wstETH hook、SMBC Nikko、许可池修复提交、Mantle 原生币为 MNT，都已追到一手来源（台账 G 前缀）。本文采纳了它的这些分析：A / B / C 三类架构、毕业价预初始化、储备配比例子、跨阈值订单。股票预言机与路由限制的分析也来自它。它称“没有检索到 Tape 设计文档”，本文以用户资料 `tape-design.md` 为准；它的 v4-core 基准 `59d3ecf` 与本文的 `46c6834` 合约源码相同。
- **主会话抽查**：v4-core 权限位与 unlock 结清检查、许可池四个回调、xStocks 的 rebase、官方部署表不含 Mantle，均与一手来源一致。
- **被修正或细化的资料内容**：
  - “代币黑名单看不到池内换手”：`take` 仍是真实转账，看不到的是 claim、LP 头寸和多跳中间币。
  - Tape 方案设想的公司行动 hook 监听 `UIMultiplierUpdated`，而 xStocks EVM 实现发出的是另外两个事件；v4 hook 也没有调整 tick 参照系的接口。
  - HIMS / AMC 周末偏离有 4.6 倍、112%、35 倍、72.3 倍几种口径，互相矛盾。

## V 术语表 {depth=2}
```glossary
PoolManager | v4 单例合约 | 保存所有池子状态与资产的唯一合约；建池只是一次状态更新。
PoolKey | 池子身份 | 两个币、费率、tickSpacing、hook 地址五个字段；哈希后得到 PoolId。 | 改任一字段就是另一个池
unlock | 解锁会话 | 外部合约调用 PoolManager 的入口；在回调里完成操作，退出前必须结清所有欠账。
delta | 欠账 | 某个地址在某个币种上对 PoolManager 的应收应付，记在 transient storage 里。 | 不是余额
settle | 付款确认 | 先 sync 再把代币转进 PoolManager，settle 按实际到账增加 delta。
take | 取款 | 把 PoolManager 欠你的币转出，减少 delta。
ERC-6909 claim | 内部凭证 | 留在 PoolManager 里、按币种计的资产请求权，可以在地址间转让。 | 不是 LP 份额
hook | 钩子合约 | 建池时绑定、在固定位置被 PoolManager 调用的外部合约。 | 建池后不能更换
权限位 | hook permission bits | hook 地址的低 14 位，决定 PoolManager 调用哪些回调、接受哪些 return delta。
return delta | 返回欠账 | hook 在回调里返回的 delta，用来改写调用者的记账。
BeforeSwapDelta | swap 前的返回欠账 | beforeSwap 返回的 delta，按 specified / unspecified 两个币种计。 | 不是 amount0 / amount1
NoOp swap | 空转 swap | hook 的 delta 吃掉全部输入，原生曲线不参与成交。
hookData | 回调附加数据 | 调用者传给 PoolManager、原样转给 hook 的任意 bytes。 | 不可信输入，不是身份凭证
动态手续费 | dynamic LP fee | PoolKey.fee 为 0x800000 的池子，由 hook 持久修改或逐笔覆盖费率。
transient storage | 交易内存储 | EIP-1153 引入的、只在当前交易内有效的存储。
Permissions Adapter | 许可适配器 | 托管底层许可代币、并在池子里充当虚拟代币的合约。
rebase | 余额自动调整 | 代币合约直接改变持有人余额的机制。 | 与只用于显示的 multiplier 不同
同池毕业 | in-pool graduation | 发行曲线结束后，在同一个 PoolId 里切换到原生集中流动性。
LVR | loss-versus-rebalancing | 价格过期时被套利者拿走的 LP 价值。
ERC-4626 | 金库标准 | 存入资产换取份额的标准化收益金库接口。
```

## W 参考资料 {depth=2}
1. [Uniswap/v4-core `PoolManager.sol` @46c6834](https://github.com/Uniswap/v4-core/blob/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src/PoolManager.sol) — unlock、swap、take、mint、许可证。**PRIMARY**
2. [Uniswap/v4-core `Hooks.sol` @46c6834](https://github.com/Uniswap/v4-core/blob/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src/libraries/Hooks.sol) — 权限位、回调调用与 return delta。**PRIMARY**
3. [Uniswap/v4-core `IHooks.sol`、`BeforeSwapDelta.sol`、`LPFeeLibrary.sol`](https://github.com/Uniswap/v4-core/tree/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src) — 回调签名、delta 坐标、动态费标志。**PRIMARY**
4. [Uniswap/v4-core gas snapshots](https://github.com/Uniswap/v4-core/tree/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/snapshots) — 建池与 swap 的 gas。**PRIMARY**
5. [Uniswap/v4-periphery @9969eec](https://github.com/Uniswap/v4-periphery/tree/9969eec44cfdf07e24b41de47f40276a58401976) — V4Router、PositionManager、DeltaResolver、HookMiner。**PRIMARY**
6. [Uniswap/v4-template @1fbf955](https://github.com/uniswapfoundation/v4-template) — Counter hook 与部署脚本。**PRIMARY**
7. [OpenZeppelin/uniswap-hooks](https://github.com/OpenZeppelin/uniswap-hooks) — BaseHook、LimitOrderHook。**PRIMARY**
8. [Uniswap v4 文档：Hooks、动态费、PoolManager](https://docs.uniswap.org/contracts/v4/concepts/hooks) — 官方概念说明。**PRIMARY**
9. [Uniswap/v3-core](https://github.com/Uniswap/v3-core) — 每池一合约、回调付款、费率档位、gas 快照。**PRIMARY**
10. [Algebra Integral 插件文档](https://docs.algebra.finance/algebra-integral-documentation/algebra-integral-technical-reference/core-logic/plugins) — v3 系插件模型。**PRIMARY**
11. [PancakeSwap Infinity 开发文档](https://developer.pancakeswap.finance/) — Vault + 单例、hook bitmap。**PRIMARY**
12. [Balancer v3 Hooks 文档](https://docs.balancer.fi/concepts/core-concepts/hooks.html) — 注册时固定的 hook。**PRIMARY**
13. [Trail of Bits：Building secure Uniswap v4 hooks](https://blog.trailofbits.com/2026/07/30/building-secure-uniswap-v4-hooks/) — hook 漏洞类别。
14. Uniswap Foundation hook 安全框架 — 风险维度与可升级性建议。
15. Cork post-mortem（2025-06-04）— hookData 授权被绕过。**PRIMARY**
16. [Bunni：Exploit Post Mortem](https://blog.bunni.xyz/posts/exploit-post-mortem/) — 取整事故。**PRIMARY**
17. uniroute-public（Uniswap 路由）— 带 hook 池子的准入条件。**PRIMARY**
18. 1inch 与 0x 的 v4 hook 路由说明 — 不自动路由。
19. [Uniswap Blog：How Permissioned Pools Work on Uniswap v4](https://blog.uniswap.org/how-permissioned-pools-work-on-uniswap-v4) — 代币只看得见进出。**PRIMARY**
20. [Uniswap Docs：Permissioned Pools Architecture](https://developers.uniswap.org/docs/protocols/uniswap-labs-hooks/permissioned-pools/architecture) — 四个合约与回调。**PRIMARY**
21. [Uniswap Docs：Swapping through Permissioned Pools](https://developers.uniswap.org/docs/trading/swapping-api/swapping-permissioned-pools) — 不当中间跳、Router 2.2.0。**PRIMARY**
22. [Uniswap/v4-hooks-public PermissionedHooks](https://github.com/Uniswap/v4-hooks-public/tree/e4eabe5) 与 v4-periphery `9969eec` 修复提交 — 源码与 adapter 校验。**PRIMARY**
23. [Uniswap Blog：Introducing Permissioned Pools](https://blog.uniswap.org/introducing-permissioned-pools-on-uniswap-v4) — 发布与伙伴。**PRIMARY**
24. [predicatelabs/predicate-paxos](https://github.com/predicatelabs/predicate-paxos) — 签名准入与 AutoWrapper。**PRIMARY**
25. [Verified Pools 文档](https://docs.verifiedpools.com/) — EAS 证明准入。**PRIMARY**
26. [Uniswap Blog：SMBC Nikko and Nethermind](https://blog.uniswap.org/smbc-nikko-and-nethermind-are-building-a-defi-gateway-for-japan-on-uniswap-v4) — 日本 DeFi Gateway。**PRIMARY**
27. [xStocks：Dividends & Stock Splits](https://docs.xstocks.fi/developers/multipliers) 与 backed-token-contract — EVM rebase。**PRIMARY**
28. [Robinhood Chain：Stock Tokens、Oracles](https://docs.robinhood.com/chain/stock-tokens/) — uiMultiplier、24/5 喂价。**PRIMARY**
29. [hookwright/untoll-hook](https://github.com/hookwright/untoll-hook) — 同池毕业参考实现（测试网）。**PRIMARY**
30. [Pons V2 文档](https://docs.ponsfamily.com/v2) — 独立曲线、毕业铸头寸。**PRIMARY**
31. PAIR 新闻稿（GlobeNewswire 2026-08-31）— 股票 quote 单边池。
32. [Doppler 文档](https://docs.doppler.lol) — 多段头寸、noOp 迁移。**PRIMARY**
33. [Bankr 文档](https://docs.bankr.bot/token-launching/overview) — 股票计价发射。**PRIMARY**
34. [Uniswap deployments.json](https://developers.uniswap.org/deployments.json) — 各链部署。**PRIMARY**
35. [Mantle 文档](https://docs.mantle.xyz/network) — Skadi 的 EIP-1153、MNT 原生代币。**PRIMARY**
36. [Uniswap/v4-hooks-public README @e4eabe5](https://github.com/Uniswap/v4-hooks-public) 与 [StablePair 博客](https://blog.uniswap.org/keeping-value-in-the-pool-how-stablepair-hook-works) — StablePair、WETH / wstETH、DualPool。**PRIMARY**
37. [Angstrom 文档](https://docs.angstrom.xyz) — L1 架构与 L2 优先费税。**PRIMARY**
38. Clanker v4 hook 源码 — 动态费与协议费。**PRIMARY**
39. [Uniswap Foundation：Hook Design Lab](https://www.uniswapfoundation.org/blog/introducing-the-uniswap-v4-hook-design-lab) — 1,000+ hooks、路由补贴。
40. 用户资料：`mantle-v3-roadmap` 的 `tape-design.md`、`05-compliance-and-permissioning.md`、`xstocks-inputs.md`；GPT Deep Research（`research/gpt-deep-research.md`）— 方案文本与分析框架。
41. DefiLlama：uniswap-v4、angstrom 成交量 — 采用数据。

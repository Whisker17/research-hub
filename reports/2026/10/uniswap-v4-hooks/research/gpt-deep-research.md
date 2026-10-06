---
imported_from: gpt-deep-research
imported_at: 2026-10-06
original_file: gpt-deep-research.md
---

# Uniswap v4 Hooks：机制、v3 可行性、RWA 与同池毕业

> 来源：用户在会话中提供的 GPT Deep Research 输出（2026-10-06）。本文件是主会话整理稿：保留全部论断与部分关键链接，省略了 SizeFeeHook 的完整代码、mermaid 图和大部分逐句引用链接。主会话按 skill 规则把它当作**线索**，关键论断另行追到一手来源，见 `ledger.md` 的 G 前缀行。

**研究基准日：2026 年 10 月 6 日。**

先给出贯穿全文的判断：

> **v4 的关键不只是“在 swap 前后执行代码”，而是把可编程的交易规则接入统一结算系统。**
> 普通回调、动态手续费、白名单，并不在逻辑上依赖 v4；真正有辨识度的是：hook 可以参与交易金额的确定，并与原生集中流动性、跨池净额结算、内部资产请求权组合起来。与此同时，PoolManager 保证的是结算账目闭合，不是 hook 的经济模型正确，更不是资产自动合规。[GitHub](https://raw.githubusercontent.com/Uniswap/v4-core/59d3ecf53afa9264a16bba0e38f4c5d2231f80bc/src/libraries/Hooks.sol)

| 问题 | 结论 |
|---|---|
| v3 能不能做 hooks？ | 原版 v3 不能附加 v4 式池级 hooks；外围包装能做一部分，修改核心的 v3 fork 能做更多。回调机制本身不需要单例或 EIP-1153。 |
| RWA 是否只要给 ERC-20 加黑名单？ | 不够覆盖交易参与权、LP 权利转移、内部记账和受托交易；但池级 hook 也不能替代发行资产自身的转让限制。 |
| 官方 Permissioned Pools 是不是一个 allowlist hook？ | 不只是。它是 Permissions Adapter、Hook、Permissioned Position Manager、兼容 Router 的组合。 |
| Pons V2 是否实现了同池毕业？ | 不是。官方文档明确说曲线阶段不是池，毕业时才创建 v4 池。 |
| “不迁池”是否只能用 v4 实现？ | 不是。从一开始就用集中流动性模拟发行曲线，v3 也能做到；Doppler 的 no-op migration 就体现了这种区别。 |
| 真正的 custom curve → 原生 CL，同一 PoolId，是否可行？ | 可行，但必须解决初始价格、真实储备、LP 配比、边界订单和原子结算。 |
| 股票 quote 最容易遗漏什么？ | 股票美元价格不能直接给 meme/股票交易对定价；而且官方 API 当前不把 permissioned token 当中间路由资产。 |
| Mantle 还缺 EIP-1153 吗？ | 当前客户端源码和升级资料已能支持其具备 EIP-1153 的判断；但这不等于已经确认了官方 v4 部署、外围合约及聚合器接入。 |

## 0. 源码基准与证据边界

| 仓库 | 固定 commit | 主要用途 |
|---|---|---|
| `Uniswap/v4-core` | `59d3ecf53afa9264a16bba0e38f4c5d2231f80bc` | PoolManager、Hooks、delta、核心接口和教学示例 |
| `Uniswap/v4-periphery` | `9969eec44cfdf07e24b41de47f40276a58401976` | Permissioned Pools 的 Adapter、Position Manager 与相关校验 |
| 官方部署教程引用的另一版本 | `3245c3cb99c48fa1dc2459c3b60abc37d4294aba` | 用于辨别文档与实现版本差异 |

第二个 commit 对应 2026 年 9 月 19 日的修复，涉及拒绝未经验证的 adapter 和非合约池币种。

证据边界：核心代码阅读不等于部署字节码验证；教学 Solidity 片段未编译测试；没有检索到 Tape 的实际设计文档，Tape 部分是按目标构造的参考设计。

## 一、v4 Hooks 的底层机制

### 1.1 PoolManager 单例
- PoolManager 保存各池状态，池由 `PoolKey{currency0, currency1, fee, tickSpacing, hooks}` 标识，`PoolId` 是其哈希。
- 一个池只能绑定一个 hook 地址（可以是组合式 hook）；一个 hook 可服务多个池，需按 PoolId 隔离状态；改任一字段就是新 PoolId；已有池不能换 hook，代理 hook 可换实现但地址与权限位不变。
- Hook 不是 delegatecall 注入，核心通过外部调用进入 hook。

### 1.2 权限位：14 个标志，不是 14 个回调
10 个生命周期回调（beforeInitialize 13 … afterDonate 4）+ 4 个 return-delta 权限位（bit 3 beforeSwapReturnDelta、bit 2 afterSwapReturnDelta、bit 1 afterAddLiquidityReturnDelta、bit 0 afterRemoveLiquidityReturnDelta）。CREATE2 挖地址：精确匹配 14 位平均约 2^14 = 16,384 次尝试；CREATE2 deployer、构造参数、creation bytecode、salt 要先固定。`getHookPermissions()` 主要用于部署自检，运行时 PoolManager 读地址位。

### 1.3 unlock
用户 → Router → `PoolManager.unlock` → `Router.unlockCallback` → swap/modifyLiquidity/donate、settle/take/mint/burn → 检查未清 delta。不变量：对每个“地址 × 币种”，Δ(a,c)=0；不是总和为零。unlock 禁止嵌套 unlock，但不等于禁止重入；`initialize` 不要求 unlock。

### 1.4 Flash accounting 与 EIP-1153
Flash accounting 是记账与结算设计；EIP-1153 是让它更便宜的执行能力（交易级生命周期）。原版 v4 字节码使用 transient storage，部署链必须支持相应指令。

### 1.5 Delta 符号与 settle / take
正数：PoolManager 欠该地址；负数：该地址欠 PoolManager。`settle` 增加 delta（确认已转入）；`settleFor`；`take` 减少 delta 并转出；`mint` 把应收转为 ERC-6909 claim；`burn` 消耗 claim 偿付；`clear` 放弃正 delta。ERC-20 付款：`sync` → transferFrom 到 PoolManager → `settle`。Flash accounting 不凭空提供资金。

### 1.6 ERC-6909 claim
跨交易存在；对应 currency 不对应池；不是 LP 头寸。不能把 `PoolManager.balanceOf(hook, id)` 当作某个池的储备。

### 1.7 Return delta
`BalanceDelta` 是 amount0/amount1；`BeforeSwapDelta` 是 specified/unspecified。v4 中 amountSpecified 负数 = exact input，正数 = exact output（与 v3 相反）。amountToSwap = amountSpecified + hookSpecifiedDelta；不能翻转 exactIn/Out；Δcaller = Δnative − Δhook；afterSwap 的 delta 只作用于 unspecified。例：用户 100 Q 买 250 M，hook 返回 (+100 Q, −250 M)，原生执行量为 0。原生执行量为 0 时 slot0 不动，custom curve 成交价可能与 slot0 无关；原生 Swap 事件不足以描述成交（Flaunch 索引文档区分 fair-launch、内部兑换与原生成交）；完全绕过原生 swap 时价格限制不再保护，hook 与 Router 要自己做成交保护。

### 1.8 动态手续费
三种收费：原生动态 LP fee、hook 用 return delta 收费、Router 附加费。动态费池 fee = 0x800000；单笔覆盖返回 fee | 0x400000；单位百万分之一；`updateDynamicLPFee` 只能由该池 hook 调用。

### 1.9 hookData 是不可信输入
hook 收到的 sender 通常是 Router / Position Manager；签名型 hook 应绑定 chainId、hook、poolId、方向、exact-in/out、数量、最低输出、payer、recipient、实际交易主体、deadline、nonce、规则版本。不能用 tx.origin 代替。

## 二、一个简单 hook：SizeFeeHook
只启用 beforeSwap 的动态费 hook：输入不超过阈值收 0.3%，超过收 1%，只支持 exact-input（教学示例，拆单可绕过）。流程：部署 mock ERC-20 → 挖 salt（目标低位 0x0080）→ `initialize(key with DYNAMIC_FEE_FLAG, sqrtPriceX96 = 1<<96)` → `PoolModifyLiquidityTest.modifyLiquidity` → `PoolSwapTest.swap`。时序：用户 → Router → unlock → unlockCallback → swap → beforeSwap 返回 (selector, 0, fee|override) → 原生 CL swap → Router delta → sync/transferFrom/settle → take → 检查 minOut → 检查所有 delta 为 0。一句话：Hook 决定规则，核心计算原生交易，Router 组织执行，PoolManager 检查结算。

（原文附完整 Solidity 示例与 mermaid 时序图，见会话记录。）

## 三、哪些能力依赖 v4
判断标准：规则是否必须约束所有访问该池的路径，以及是否必须参与该池自身的资产记账。逐项表格：Router allowlist（v3 可做但可绕过）、动态 Router 附加费、原生 LP 动态费（v3 fork 可以）、奖励返佣、限价单、TWAMM、自定义曲线（原版 v3 不能，fork 可以）、跨池净额结算、低成本建池、同池发行后继续交易（从一开始就用 CL 时 v3 也可以）、自定义曲线 → 原生 CL 同一 PoolId（v4 custom accounting 是标准化路径）。Algebra Integral 说明 fork 能做到池级插件。v3 swap callback 的职责是付款，不是池永久绑定的规则层。结论措辞：“这个需求在 v3 上也能实现，但需要 fork 核心或独立 AMM；若要求保留同一个标准 PoolManager 的路由与结算接口，v4 更合适。”

## 四、RWA 与合规 hooks
- Permissioned Pools 于 2026-07-23 正式介绍，合作方 Superstate、Securitize、Dowgo（Dowgo 关联授权进度）。架构：Allowlist Checker、Permissions Adapter（托管 underlying，向 PoolManager 表示虚拟余额，管理 wrapper/hook/swap 暂停）、Permissioned Hook、Permissioned Position Manager（不可转让 LP NFT、强制 unwind）、兼容 Universal Router（≥2.2.0）。池中 currency 用 adapter 地址。
- 回调：beforeInitialize（至少一个币种是工厂验证过的 adapter，拒绝未验证 adapter）、beforeSwap、afterSwap（事件）、beforeAddLiquidity；SWAP_ALLOWED 0x0001、LIQUIDITY_ALLOWED 0x0002；新 adapter 默认不开放 swap。
- 固定 periphery commit 修复：一边已验证 adapter、另一边未验证 adapter 不能当普通 ERC-20 跳过检查；拒绝无代码币种地址；获准 operator 不能替已失去 LP 权限的 owner 增仓。
- 双许可池 unwind：资产先返还持有人，不能接收的只回该资产自己的发行人。
- 为什么 ERC-20 黑名单不够：token transfer policy 与 market participation policy 是两个控制面；只有 hook 也不够（离池后的转让、包装资产、冻结赎回、代他人交易）。ERC-6909 claim 路径需单独评审（不是对官方实现发现漏洞的断言）。
- PureFi Verifier Hook：凭证型准入，issuer 签发数据包放入 hookData；公开参考代码，未确认与生产部署一致。
- SMBC Nikko / Nethermind 日本 DeFi Gateway（Uniswap 2026-10-02 介绍），目标 2027 年完成，不是已上线案例。

## 五、股票 quote meme launchpad：同池毕业（参考设计）
- 三类架构：A 外部曲线 → 新 AMM 池；B 从开始就是 CL 池（单边 / 多段 CL 模拟曲线）；C 同一 v4 池，自定义记账 → 原生 CL。建议先认真比较 B。
- PoolKey 五个字段不能变；需要 launchpad + 合规 + 预言机就必须一个组合 hook，不能同时挂官方 Permissioned Hook 与 Launch Hook。
- 状态机 CURVE → GRADUATING → AMM；市场暂停 / 报价异常 / 发行人暂停 / 只允许退出与发行阶段分开。
- 难点一：同池不能重新 initialize。方案：一开始把池初始化在毕业价 P*，曲线阶段原生 CL 流动性为 0、所有交易由 hook 接管；毕业时在 P* 建头寸。依赖：P* 可预先计算、所有 swap 受 hook 控制、禁止提前加 LP、禁止未授权初始化。若毕业阈值随股票美元价动态变化，P* 不再确定。
- 难点二：真实储备。线性曲线 p(s)=p0+ks，买 m 个所需 q = p0·m + k·s·m + k·m²/2；R_Q(s)=∫0^s p(u)du。阈值依赖净状态（netSold 与真实储备），不要用累计买入；虚拟储备不能变成 LP 资金。
- 曲线阶段用 ERC-6909 claim 做库存与储备（按 poolId 记账），毕业时 burn claim 偿付 LP 负 delta。
- 难点三：储备比例 vs 毕业边际价格。CL 公式 x = L(1/z − 1/b)，y = L(z − a)，L = min(x·z·b/(b−z), y/(z−a))。例：p(s)=1+0.01s，s=100 毕业，P*=2，R_Q=150 Q，剩余 100 M；直接全部注入比例 1.5 ≠ 2，价格不连续；全区间应为 75 M + 150 Q，剩余 25 M 按预先规则处理。decimals 换算 P_raw = P_human × 10^(d1−d0)。
- 难点四：跨阈值订单。方案一 Router 链上裁剪（最易证明）；方案二同一 unlock 内拆两笔 swap；方案三单次 beforeSwap 内消费再交给 CL（不建议第一版）。
- 原子毕业：受信 Launch Router 在同一 unlock 内执行最后一笔曲线 swap → finalizeGraduation → 结算。hook 自调用 PoolManager 时自身回调被跳过，finalize 函数必须自己检查授权与状态。hook 直接 modifyLiquidity 时 position owner 是 hook，不会生成 Position Manager NFT。
- 股票 quote 额外需求：股票美元 oracle 不能判断 meme/股票价格是否偏离（P_M/USD = P_M/Q × P_Q/USD）；休市状态细分（正常、盘前盘后、休市、停牌、预言机故障、发行人暂停）；公司行动：非 rebase wrapper 用 sharesPerQuoteUnit 表达，避免双重计算；永久锁 LP 与 RWA 强制退出冲突。
- 对照：Pons V2 独立曲线、毕业创建 v4 池（不是同池）；PAIR 更接近 B；Bankr 支持股票 quote 发射入口；Doppler no-op migration；Zora Coin Hook；Flaunch fair-launch 阶段切换。

## 六、其他代表性 hooks
- StablePair（Uniswap 官方，v4-hooks-public）：参考价附近按方向设费，区间外“远离参考价”的交易可不收费、纠偏交易面对逐块下降费用（Dutch auction）；USDC/USDT、USDC/USDG 池，初始化 2026-09-10；hook 可升级但地址不含 remove-liquidity 回调与 return-delta 权限。
- Angstrom：L1 批量订单 + 套利拍卖后开放本块普通访问；L2 基于 priority fee 的 MEV tax（tax = k·120000·max(priorityFee − floor, 0)），Router 可在 hookData 提供 maxSwapTax。对 Mantle：排序优先权若不由 priority fee 表达，税模型捕获不到同样的价值。
- TWAMM（akshatmittal/v4-twamm-hook）：虚拟订单靠后续池操作触发结算。
- 限价单：触发后的结算、价格回穿、部分成交、gas DoS。
- DualPool（v4-hooks-public `e4eabe5` src/alf/DualPoolHook.sol）：资产平时在 ERC-4626 vault，beforeSwap 临时部署 CL 头寸，afterSwap 移除并存回；静态费率。
- WETH / wstETH hooks：没有 LP 库存，价格来自包装兑换关系，用自定义 delta 结算。
- Clanker、Zora、Flaunch 三种 launchpad 设计重点。

## 七、聚合器与路由
“支持 v4”不等于支持任意 hook；hook registry 不是安全认证。官方 Swapping API：permissioned token 只作为输入或输出，不作为中间 hop——USDC → STOCK → MEME 在官方路由里不默认支持。对 JIT Router：同池重复访问、跨毕业边界、身份一致、执行上下文一致。

## 八、工程与安全
审计面表（回调访问控制、unlockCallback、池绑定、多池隔离、delta 符号、数量边界、自回调跳过、中间态重入、身份与签名、LP 退出、资产异常、可用性）。“所有 delta 归零 ≠ 没有损失”（Bunni）；“hook 地址不变 ≠ 规则不变”（代理）。RWA 特殊威胁：KYC 签发方被攻破、撤销竞态、oracle 与倍率不同步、adapter 升级、强制 unwind 接收方、operator/owner 混淆。异步结算：delta 清零不保证未来交付。Gas：TLOAD/TSTORE 各 100 gas，但不代表 hook 总成本；建议按 8 组场景实测，Mantle 还要看数据费。

## 九、采用数据
2025-06-09 Uniswap Foundation：超过 1,000 个 hooks initialized；2026-06-24 Spark 向 v4 迁入 1.5 亿美元；2026-09-10 StablePair 池；PAIR 2026-08 项目自报。指标需区分独立 hook 地址、策略家族、初始化池、活跃池、原生与自定义成交量、vault 资产等。

## 十、对 Mantle
- EIP-1153：v1.6.3 Elysium 延续 Arsia/Osaka 规则；`mantle-xyz/op-geth v1.6.3` 的 Cancun 指令集启用 EIP-1153。未在 RPC 上实测。
- 官方 v4 部署列表没有 Mantle 5000；需要分别核对 core、Position Manager、Universal Router、Permit2、Quoter、hook 地址；v4-core 为 BUSL。
- Native currency 在 Mantle 是 MNT，不是 ETH。
- 分层：发行资产 / Adapter；Pool Hook；LP 权利层；Router / Aggregator；Mantle 链。
- 与 PropAMM / JIT Router：链 / preconfirmation 负责顺序保证；做市商签发报价；hook 检查报价、时效、库存、身份；Router 组织多跳与限价。

## 十一、交叉验证问题清单
14 个回调？（10 + 4）；sender 是谁？（直接调用 PoolManager 的地址）；EIP-1153 是不是 KYC hook 的逻辑前提？（不是）；delta 总和为零是否足够？（不够）；BeforeSwapDelta 是 amount0/1 吗？（不是）；自定义 swap 一定更新 slot0？（不一定）；ERC-6909 是 LP token？（不是）；一个池能挂两个 hook？（不能）；同池毕业能重新 initialize？（不能）；虚拟储备能成为 LP 资金？（不能）；Pons V2 是同池？（不是）；股票美元 oracle 能约束 meme/股票价格？（不能）；官方路由把 permissioned 股票当中间 hop？（不）；hook 已审计代表代理以后也安全？（不）；Mantle 支持 transient storage 等于 v4 已部署？（不等于）。

## 最终判断
建立三项能力：标准化市场规则；统一交易与结算；明确发行到二级市场的连续性。对 Tape，先判断多段 CL 是否已满足需求，再考虑 custom accounting → CL 的同池相变。v4 让自定义市场接入统一结算成为可能，但偿付能力、权利边界、价格语义与可路由性仍须开发者完整证明。

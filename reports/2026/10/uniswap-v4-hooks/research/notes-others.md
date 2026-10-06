# notes-others：其他有代表性的 hook（brief 研究问题 5）

研究问题：按采用量（成交量 / 费用，注明口径与时间）和设计意义挑 4–6 个 hook 类别，每类选一个代表讲透：用了哪些回调和权限位，改了什么（准入 / 费用 / 记账 / 曲线 / 订单），一笔交易怎么走（谁调用谁、delta 怎么结清），LP 和交易者要信任什么，主要风险和已知事故，是否开源、审计、上线。
一句话答案：选了 5 个代表。按 hook 改动的深浅，从浅到深是：
- **Clanker 动态费 hook**：只改费用。
- **OpenZeppelin LimitOrderHook**：用 hook 自己的头寸实现订单。
- **Doppler**：在 hook 里跑荷兰式拍卖曲线，靠 hook 自己挪头寸实现。
- **Angstrom**：门禁加离链批量结算，改了准入和排序。
- **Bunni v2**：用 return delta 整个替换 v4 的曲线和记账。

改得越深，信任面和攻击面越大。Angstrom 要信任一组质押节点；Bunni v2 在 2025-09-02 因舍入错误损失约 $8.4M，之后于 2025-10 停运。
口径：DefiLlama 数据访问于 2026-10-06（UTC）。行号是按 raw 文件手工数出来的，可能差 ±1 行；commit 固定为访问当天 HEAD。

---

## 0 选型依据（采用量 + 设计意义）

**答案**：按可得数据，带 hook 的生产系统里，成交量最大的单体是 Angstrom，部署数最多的是 launchpad 类（Clanker）。动态费是最常见的 hook 能力：Clanker 用 `updateDynamicLPFee`，Angstrom 用 `DYNAMIC_FEE_FLAG` 加 fee override，Bunni 在 hook 内自己算费率。TWAMM、限价单目前只有示例或库实现，没找到有规模的生产部署。

**依据**
- Uniswap v4 全部池：30 天成交量 $42.45B，累计 $471.0B（DefiLlama `uniswap-v4` dexs，2026-10-06 访问）[10]。
- Angstrom（只部署在 Ethereum L1）：30 天成交量 $396.0M（约为 v4 同期的 0.93%），累计 $3.25B，DefiLlama 上线日 2025-07-26 [9]。
- Bunni v2：累计成交量 $2.48B，其中 Unichain $1.55B；DefiLlama 已标记 `deprecated`，近 30 天为 0 [15]。
- Clanker（Base 为主）：费用口径，30 天 $742.6K，累计 $91.6M [20]。Flaunch：费用口径，30 天 $6.7K，累计 $3.60M [27]。
- 二手：截至 2026-06，已初始化 hook 超过 41,000 个 [29]。Uniswap Labs 的 Dune "v4 Hook Explorer" 和 hookrank.io 都是 JS 渲染，本轮没抓到数据。

**不确定之处**：按 hook 地址统计的成交量排名（hookrank / Dune）没拿到。Clanker 只有费用口径，没有成交量口径。Doppler 的 DefiLlama 端点没有返回数据。

---

## 1 MEV / LVR 保护：Angstrom（Sorella Labs，Ethereum L1）

**答案**：Angstrom 是一个 v4 hook，加上一组链下质押节点。思路是"每块第一笔交易必须由节点打包"：节点在链下跑两种拍卖——套利权拍卖（Top-of-Block，收益分给 LP）和用户订单的统一价批量拍卖，然后用一笔 `execute` 交易在 v4 池上原子结算。结算后池子在本块剩余时间里"解锁"，外部交易者可以像普通 v4 池一样 swap，但要按 Angstrom 设定的费率付费，其中协议那部分由 afterSwap 通过 return delta 收取。

**用到的回调与权限位**
- 部署时强制校验以下权限位，并要求池费率为 `DYNAMIC_FEE_FLAG` [3]：
  - beforeInitialize / afterInitialize 至少一个；
  - beforeAddLiquidity 和 beforeRemoveLiquidity 必须开，afterAdd / afterRemove 必须关；
  - beforeSwap 必须开；
  - afterSwap 与 afterSwapReturnDelta 必须同时开。

**改了什么**
- 准入与排序：块内第一次 swap 必须由节点触发，否则需要节点签名。
- 费用：外部 swap 由 beforeSwap 返回 `unlockedFee | OVERRIDE_FEE_FLAG` 覆盖 LP 费 [1]。
- 记账：afterSwap 计算协议费，以 ERC-6909 mint 给 `FEE_COLLECTOR`，并把它作为 unspecified delta 从交易者那里扣掉 [1]。
- LP 奖励：用类似 v3 feeGrowthOutside 的累加器把拍卖收益按区间分给 LP，在 add/remove liquidity 前更新 [5]。

**一笔交易的流程**
- 批量结算：节点调用 `execute(bundle)`，先 `_nodeBundleLock()` 把 `_lastBlockUpdated` 设为 `block.number`，再调用 `PoolManager.unlock`。之后的 `unlockCallback` 依次执行 `_takeAssets → _updatePools → ToB 订单 → 用户订单 → _saveAndSettle` [2][4][5]。
- 本块后续的外部 swap：`beforeSwap` 检查 `_isUnlocked()`（即 `_lastBlockUpdated == block.number`）。
  - 如果还没解锁，`hookData` 必须带"节点地址 + 节点对本块空块证明的 EIP-712 签名"，否则 revert `CannotSwapWhileLocked` [1][4]。

**信任假设**
- 链上合约为了省 gas 放宽了校验：清算价格、部分成交量、gas 分摊都由"受信任、质押的节点"提供，安全性靠质押罚没和 controller 维护节点集合 [5]。
- LP 必须用"行为正常的 router"。overview 原文："A malicious router could steal rewards distributed in the beforeRemoveLiquidity hook" [5]。
- 不支持 fee-on-transfer / rebase 代币，只部署在 L1 [5]。

**风险**
- 活性：没有节点签名或 bundle 时，外部 swap 会 revert（由 [1] 推出）。
- 节点作恶只能靠罚没事后补偿 [5]。
- 合约为 BUSL-1.1 [2]。

**是否开源 / 审计 / 上线**：源码公开（BUSL-1.1）；仓库里有 `security-reviews/spearbit-1.pdf`、`cantina-competition.pdf` [19a]；2025-07 下旬主网上线，UF Builder Update #31 记为 "angstrom on mainnet"，由 UF Hook Design Lab 支持 [8]。

**同类一句话**
- Angstrom L2：不用节点网络，在 `beforeSwap` 里按交易的优先费（`tx.gasprice − basefee` 超出下限的部分）乘以固定虚拟 gas，收"MEV 税"，afterSwap 把收益分给 LP；已部署在 Base 和 Unichain，工厂合约无许可 [7]。
- Bunni 的 am-AMM：拍卖池子的"管理者"席位，由管理者设定 swap 费率（见第 2 节）[11][12]。

**不确定之处**：没有找到 Angstrom 拍卖收入占 LP 总收入比例的一手数据（DefiLlama 只在方法论里写了 "Auction Fees" 分项）[9]。节点集合的规模和质押额没有核实。

---

## 2 自定义曲线 + 流动性再利用：Bunni v2（已停运）

**答案**：Bunni v2 不使用 v4 自带的集中流动性，而是在 `beforeSwap` 里用自己的"流动性密度函数（LDF）"算出这笔 swap 的输入和输出，用 `BeforeSwapDelta` 把整笔 swap 接管下来，资金存放在 BunniHub。闲置资金可以再质押到 ERC-4626 金库（rehypothecation）。同一个 hook 还叠加了：
- 动态费：按 TWAP 偏离计算的二次项费率；
- surge fee：LDF 移位或金库份额价格变化时临时提费，按半衰期衰减；
- am-AMM：池子管理权拍卖。

2025-09-02 被利用约 $8.4M，根因是多次操作下的舍入方向错误；2025-10 停运，源码改为 MIT 许可并注明"不要直接用于生产"[13][14][16]。

**用到的回调与权限位**：`BaseHook` 只声明了 `afterInitialize` 和 `beforeSwap` 两个回调 [11]。`beforeSwap` 返回非零 `BeforeSwapDelta`，所以地址必须带 beforeSwapReturnDelta 位（由 [12] 推出）。`afterInitialize` 只允许 BunniHub 作为 caller [12]。

**改了什么**：曲线、记账、费用都改了，几乎把 v4 池降格为一个"结算账户"。

**一笔交易的流程**（exactIn）[12]
1. Router → `PoolManager.swap` → `BunniHook.beforeSwap`（`poolManagerOnly`、`nonReentrant`）→ `BunniHookLogic.beforeSwap`；
2. 读 BunniHub 的 `poolState`（含金库里的储备），更新 TWAP 预言机，`queryLDF` 得到总流动性和活跃余额；
3. `BunniSwapMath.computeSwap` 算出 input/output；
4. 按 am-AMM 费 > hooklet 覆盖费 > 动态费的优先级收费；
5. 返回 `toBeforeSwapDelta(+input, −output)`；
6. hook 给自己 `mint` 输入币的 6909 claim；
7. `hub.hookHandleSwap` 拉走输入 claim，把输出币（必要时从金库赎回）推给 PoolManager，再给 hook mint 输出 claim；
8. hook `burn` 输出 claim。

由于 delta 已经吃掉全部 specified 数量，v4 核心曲线基本不再成交（inferred），最后由 router `settle` 输入、`take` 输出。

**信任假设**
- LP 要信任：LDF 合约和参数（curator 设定）、再质押金库的安全性、hook owner 的权限（例如可以手动解除提款阻塞，`withdrawalUnblocked`）[11]。
- 交易者面对的是一条非标准曲线，聚合器必须用 BunniQuoter 报价（由 [14] 部署脚本推出）。

**事故**（2025-09-02，Ethereum USDC/USDT 和 Unichain weETH/ETH 两个池）[13]
1. 闪电贷把价格推到 tick 5000，USDC 活跃余额降到 28 wei；
2. 44 次极小额提款利用 `withdraw` 里 idle balance "向下取整"的舍入方向，把活跃余额从 28 wei 压到 4 wei，总流动性被错误地减少 84.4%；
3. 夹击：流动性恢复时反向交易获利。

官方总结："A rounding direction that's safe in the context of a single operation may not be safe in the context of multiple operations." 最大的 Unichain USDC/USD₮0 池没被打，原因之一是 Unichain 上闪电贷资金不足（约需 1,700 万，Euler 只有约 1,100 万）[13]。

**是否开源 / 审计 / 上线**：开源（现为 MIT）；DefiLlama 记录有 5 份审计 [15]；已停运 [15][16]。

**同类一句话**：OpenZeppelin uniswap-hooks 库里有通用的 `ReHypothecationHook`，另有 `AntiSandwichHook`、`LiquidityPenaltyHook` [22]。

**不确定之处**：停运日期 2025-10-23 只见于二手报道（转引 Bunni 官方 X）[16]；仓库 2025-10-23 的 commit "update license to MIT" 与之吻合 [14]。

---

## 3 动态手续费：Clanker `ClankerHookDynamicFee`（Base）

**答案**：池子以 `DYNAMIC_FEE_FLAG` 初始化。每次 swap 前，hook 先在自身内部用 try/revert 方式"模拟"这笔 swap，拿到成交后的 tick，算出与参考 tick 的偏离，即"波动累加器" VA（带衰减）。LP 费按 `fee = baseFee + feeControlNumerator·VA² / 1e10` 计算，不超过 `maxLpFee`，然后通过 `poolManager.updateDynamicLPFee` 写入 [18]。协议费固定为 LP 费的 20%，用 return delta 额外收取：beforeSwap 和 afterSwap 各覆盖两种 exactIn/exactOut × 方向组合，并且只对非 Clanker 一侧（配对币）收 [17]。

**用到的回调与权限位**：`beforeInitialize`（直接 revert，强制只能走 factory 的 `initializePool` 或 `initializePoolOpen`）、`beforeAddLiquidity`（MEV 模块生效期间禁止加流动性）、`beforeSwap`、`afterSwap`、`beforeSwapReturnDelta`、`afterSwapReturnDelta` [17]。

**改了什么**：费用（动态 LP 费 + 协议加收）；准入（初始化路径、开盘 2 分钟内禁止加 LP，以及 MEV 模块）。

**一笔交易的流程** [17][18]
1. Router → `PoolManager.swap` → `beforeSwap`，依次执行：
   - `_setFee`：模拟 swap，然后 `updateDynamicLPFee`；
   - `_hookFeeClaim`：把上一笔留存的 6909 协议费 `burn` 后 `take` 给 factory；
   - `_lpLockerFeeClaim`：触发 locker 领取 LP 费；
   - `_runMevModule`：只在建池后 2 分钟内执行；
   - 如果是"配对币 exactIn 买 Clanker 币"，返回 `toBeforeSwapDelta(fee, 0)` 并给 hook mint 6909。
2. 核心按动态 LP 费成交。
3. `afterSwap`：如果是"Clanker 币 exactIn 卖出"，从输出的配对币里扣 `amountOut × protocolFee`，作为 unspecified delta 返回并 mint 6909。
4. Router `settle` / `take`。

**信任假设**：LP 费上限 30%（`MAX_LP_FEE = 300_000`），最低 base fee 0.25%（`MIN_BASE_FEE = 2500`）[17][18]。参数在建池时由部署者设定，之后合约里没有修改入口（本轮只读了这两个文件，inferred）。

**风险**
- 每笔 swap 实际执行两次（模拟一次加真实一次），gas 至少翻倍（inferred）。
- 源码注释承认模拟出的 tick 与实际结果不完全一致 [18]。
- 动态费被单笔 swap 的冲击推高，大单会自己给自己加价（inferred）。

**是否开源 / 审计 / 上线**：开源（MIT）；仓库里有 Cantina 1 份、Macro 2 份 v4 审计 [19]；Base 主网 ABI 已发布 [19]。

**同类一句话**
- Bunni：TWAP 偏离二次项 + surge 半衰期 [12]。
- Angstrom：用 fee override 设定固定的解锁费率 [1]。
- Zora：狙击税 99% 起，10 秒衰减 [25]。
- Clanker `ClankerMevDescendingFees`：80% 二次衰减到 5%/30s [21]。

---

## 4 限价单 / TWAMM：OpenZeppelin `LimitOrderHook`（库实现）

**答案**：限价单 = 在当前价格之外的一个 tickSpacing 宽区间挂单边流动性。价格穿过这个区间后，hook 在 `afterSwap` 里把这段流动性撤出，并以 6909 claim 的形式替订单持有人保管，持有人之后 `withdraw` [22]。TWAMM 只有 Uniswap 官方 2023 年博客里的示例（"TWAMM orders are always the first pool action in a block"）；博客链接的 `v4-periphery/contracts/hooks/examples/TWAMM.sol` 在 main 分支已经 404 [23]。两者都没找到有规模的生产部署。

**用到的回调**：`_afterInitialize` 记录基准 tick；`_afterSwap` 调用 `_fillCrossedOrders` [22]。

**改了什么**：订单。hook 是这些头寸的唯一所有人，用 salt 区分买卖方向，内部按每单位流动性记手续费 [22]。

**一笔交易的流程** [22]
- 挂单：`placeOrder` → `PoolManager.unlock` → `_handlePlaceCallback`：`modifyLiquidity`（只能单币、不能在区间内，否则 revert `InRange` 或 `CrossedRange`），然后从下单人 `settle`。
- 普通交易者 swap：在 `afterSwap` 里用位图扫描被穿越的 tick，逐个 `_fillOrder` 撤出流动性。
- 取回：`withdraw` → unlock → 从 claim 发送给持有人。

**信任假设与风险**
- 成交 gas 由触发穿越的那位交易者承担，文档原文："a large swap may need to be split"。
- v4 不会回调 hook 自身发起的操作，子类内部 swap 后必须手动调用 `_fillCrossedOrders`。
- 不支持原生 ETH。
- 标注为 "experimental software" [22]。

**是否开源 / 审计 / 上线**：开源（MIT，v1.2.0），是库而不是一个已部署的产品 [22]。

---

## 5 launchpad 类：Doppler（Whetstone Research）+ 其余一句话

**答案**：Doppler 把整场"流动性启动拍卖"放进 hook。hook 自己是 LP，按 epoch 调整三类头寸（slug）：
- lower slug：在现价下方，放入全部募集款，保证已售代币能卖回；
- upper slug：放入本 epoch 预期售出量；
- price discovery slug：为后续 epoch 预铺。

如果销售进度落后，曲线按荷兰式拍卖下移；如果超前，曲线上移。外部 LP 被 `beforeAddLiquidity` 拒绝 [24]。

**用到的回调**
- `afterInitialize`：放置初始头寸；
- `beforeSwap`：本 epoch 第一笔 swap 前触发再平衡，可补算已错过的 epoch；
- `afterSwap`：累计 `totalTokensSold` 和 `totalProceeds`，不计 swap 费；
- `beforeAddLiquidity`：直接 revert [24]。

**改了什么**：曲线（用 hook 自有头寸的移动来拼出曲线，而不是 return delta）；准入（禁止外部 LP）。

**一笔交易的流程**：买家 → Router → `PoolManager.swap` → `beforeSwap`（如果是新 epoch：hook 在同一个 unlock 内撤出并重铺 slug）→ 核心按 v4 集中流动性成交 → `afterSwap` 记账 → Router 结算。由 [24] 推出：hook 在 swap 回调中修改自身头寸，产生的 delta 记在 hook 名下，必须在同一 unlock 内结清。

**同类一句话**（复用 meme-launchpad 已核实的来源）
- Clanker 基础 hook：用 return delta 收 20% 协议费 + MEV 模块 [17][21]。
- Zora：v4 hook + Doppler 多曲线头寸；狙击税 99%/10s；20% 手续费转为永久流动性 [25]。
- Flaunch：固定价 Fair Launch 窗口，之后用 Progressive Bid Wall 每 0.1 ETH 在现价下方挂一笔单边买单 [26]。
- Pons V2：曲线在独立合约里，毕业时铸造全区间 v4 头寸进 locker，singleton hook 只在 quote 一侧收费 [28]。

**不确定之处**：本轮只读了 Doppler 的设计文档，没有读 hook 源码的权限位和审计；Doppler 的采用量没取到。

---

## 横向对比（统一维度）

| 维度 | Angstrom L1 | Bunni v2 | Clanker DynamicFee | OZ LimitOrder | Doppler |
|---|---|---|---|---|---|
| 回调 | before/afterInit（≥1）、beforeAdd、beforeRemove、beforeSwap、afterSwap+RD [3] | afterInit、beforeSwap(+RD) [11][12] | beforeInit、beforeAdd、beforeSwap+RD、afterSwap+RD [17] | afterInit、afterSwap [22] | afterInit、beforeSwap、afterSwap、beforeAdd [24] |
| 改了什么 | 准入/排序、费用、LP 奖励 | 曲线、记账、费用 | 费用、准入 | 订单 | 曲线（挪头寸）、准入 |
| 是否用 return delta | 是（afterSwap 收协议费） | 是（接管整笔 swap） | 是（20% 协议费） | 否 | 否（文档未提） |
| 信任对象 | 质押节点、controller、router | hook owner、curator、LDF、外部金库 | factory/owner 设定的参数 | 库代码本身 | 拍卖参数 |
| 主要风险 | 活性、节点作恶 | 舍入/记账（已发生） | gas 翻倍、模拟偏差 | 成交 gas 外溢 | 曲线参数被博弈 |
| 现状（2026-10） | 在运行，30 天 $396M [9] | 已停运 [15] | 在运行 [20] | 库 [22] | 在运行（Zora 等）[25] |

---

## 图的素材

**A. Angstrom L1 一个区块内的时序**（参与者：用户、套利者、Angstrom 节点、Angstrom hook/合约、PoolManager、外部交易者 + Router）
1. 用户把签名订单（限价 / flash / standing）发给节点网络；套利者对 ToB 出价 [6]。
2. leader 节点 → `Angstrom.execute(bundle)`：`_nodeBundleLock`（同一块只能执行一次，且只有节点能调）[2][4]。
3. Angstrom → `PoolManager.unlock` → `Angstrom.unlockCallback` [2]。
4. `_takeAssets`：从 PoolManager take 资产（用于结算 swap delta 或作为订单结算的闪电贷）[5]。
5. `_updatePools`：每个池执行一次净额 swap，更新奖励累加器 [5]。
6. ToB 订单：验签、作废 hash、结算 in/out [2]。
7. 用户订单：检查 `price ≥ minPrice`，统一价结算，可选触发订单 hook [2]。
8. `_saveAndSettle`：与 PoolManager 结清全部 delta；DeltaTracker 守恒不变量 [5]。
9. 同一块后续：外部交易者 → Router → `PoolManager.swap` → `beforeSwap`（已解锁，返回 fee override）→ 核心成交 → `afterSwap`（协议费 mint 给 FEE_COLLECTOR，返回 int128）→ Router settle/take [1]。
10. 分支：本块没有 bundle → 外部交易者的 hookData 必须带节点签名的空块证明，否则 revert [1][4]。

**B. Bunni v2 swap 时序**（参与者：交易者/Router、PoolManager、BunniHook、BunniHookLogic、BunniHub、ERC-4626 金库）[12]
Router → PM.swap → Hook.beforeSwap → Logic：读 poolState → 更新预言机 → queryLDF → computeSwap → 算费 → 返回 BeforeSwapDelta(+in, −out) → PM.mint(hook, in) → Hub.hookHandleSwap（拉 in claim；推 out，必要时从金库取）→ PM.burn(hook, out) → （按条件触发 rebalance 订单）→ 回到 PM → Router settle in / take out。

**C. Bunni 事故三步**（数值）[13]
① 闪电贷 3M USDT 推价到 tick 5000，USDC 活跃余额 28 wei → ② 44 次小额提款，活跃余额 28→4 wei，总流动性 5.83e16→9.114e15（−84.4%）→ ③ 大额 swap 推到 tick 839189，流动性回升到 1.065e16（+16.8%），反向交易获利约 1.33M USDC + 1M USDT。

**D. Clanker swap 时序** [17][18]
Router → PM.swap → Hook.beforeSwap：`simulateSwap`（自调用 PM.swap 后 revert `TickReturned`）→ `updateDynamicLPFee` → 领上一笔协议费给 factory → locker 领 LP 费 → MEV 模块（≤2 分钟）→（配对币 exactIn）返回 specified delta 并 mint 6909 → 核心成交 → afterSwap（Clanker 币 exactIn）返回 unspecified delta 并 mint 6909 → Router 结算。

**E. 限价单状态机** [22]
`未初始化` →(placeOrder，区间外单币)→ `挂单中` →(swap 穿越该 tick，afterSwap 执行 _fillOrder)→ `已成交（流动性已撤出，hook 持有 claim）` →(withdraw)→ `已领取`；`挂单中` →(cancelOrder)→ `已撤`。

**F. Doppler epoch 状态** [24]
每个 epoch 第一笔 swap 前判断：卖得落后 → 荷兰式下移（最多 `(endingTick−startingTick)/epoch 数`）；卖得超前 → 上移到预期 tick；然后重铺 lower / upper / discovery 三类 slug。

---

## 代码素材

1) Angstrom：外部 swap 的门禁与费用覆盖 — `SorellaLabs/angstrom/contracts/src/modules/UnlockHook.sol#L44-L67@98216596f3df0e40f9558dada56528f6ae6bb25a`
```solidity
_onlyUniV4();
if (!_isUnlocked()) {
    if (optionalUnlockData.length < 20) {
        if (optionalUnlockData.length == 0) revert CannotSwapWhileLocked();
        revert UnlockDataTooShort();
    } else {
        address node = address(bytes20(optionalUnlockData[:20]));
        bytes calldata signature = optionalUnlockData[20:];
        unlockWithEmptyAttestation(node, signature);
    }
}
StoreKey storeKey = StoreKeyLib.keyFromAssetsUnchecked(_addr(key.currency0), _addr(key.currency1));
swapFee = _unlockedFees[storeKey].unlockedFee | LPFeeLibrary.OVERRIDE_FEE_FLAG;
```
（为压缩篇幅合并了 if 行，逻辑与原文一致。）

2) Angstrom：权限位约束 — `SorellaLabs/angstrom/contracts/src/modules/UniConsumer.sol#L48-L70@98216596…`
```solidity
if (!hook.hasPermission(Hooks.BEFORE_INITIALIZE_FLAG | Hooks.AFTER_INITIALIZE_FLAG)) return false;
if (!hook.hasPermission(Hooks.BEFORE_ADD_LIQUIDITY_FLAG)) return false;
if (hook.hasPermission(Hooks.AFTER_ADD_LIQUIDITY_FLAG)) return false;
if (!hook.hasPermission(Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG)) return false;
if (hook.hasPermission(Hooks.AFTER_REMOVE_LIQUIDITY_FLAG)) return false;
if (!hook.hasPermission(Hooks.BEFORE_SWAP_FLAG)) return false;
if (!(hook.hasPermission(Hooks.AFTER_SWAP_FLAG)
        && hook.hasPermission(Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG))) return false;
return hook.isValidHookAddress(ANGSTROM_INIT_HOOK_FEE); // = DYNAMIC_FEE_FLAG
```

3) Bunni：用 BeforeSwapDelta 接管整笔 swap 并结算 — `Bunniapp/bunni-v2/src/lib/BunniHookLogic.sol#L436-L441, L518-L530@2b303b8c1b9f8afbb169d62ba52da93d6d2171fe`
```solidity
int256 actualInputAmount = FixedPointMathLib.max(-params.amountSpecified, inputAmount.toInt256());
inputAmount = uint256(actualInputAmount);
beforeSwapDelta = toBeforeSwapDelta({
    deltaSpecified: actualInputAmount.toInt128(),
    deltaUnspecified: -outputAmount.toInt256().toInt128()
});
// ...
env.poolManager.mint(address(this), inputToken.toId(), inputAmount);
env.hub.hookHandleSwap(key, params.zeroForOne, hookHandleSwapInputAmount, hookHandleSwapOutputAmount, shouldSurge);
env.poolManager.burn(address(this), outputToken.toId(), outputAmount);
```

4) Bunni 事故行（修复前 / 修复后）— `Bunniapp/bunni-v2/src/lib/BunniHubLogic.sol#L478@ad8acfc30249da5a63450adf4a92c946c260e9de`（引自官方复盘 [13]）
```solidity
- uint256 newBalance = balance - balance.mulDiv(shares, currentTotalSupply);
+ uint256 newBalance = balance - balance.mulDivUp(shares, currentTotalSupply);
```

5) Clanker：动态费公式 — `clanker-devco/v4-contracts/src/hooks/ClankerHookDynamicFee.sol#L70-L89@b004c2edda29fa282a16d5d1441a26484f70b37f`
```solidity
function _setFee(PoolKey calldata poolKey, IPoolManager.SwapParams calldata swapParams) internal override {
    uint256 volAccumulator = _getVolatilityAccumulator(poolKey, swapParams);
    uint24 lpFee = _getLpFee(volAccumulator, poolKey.toId());
    _setProtocolFee(lpFee);
    IPoolManager(poolManager).updateDynamicLPFee(poolKey, lpFee);
}
function _getLpFee(uint256 volAccumulator, PoolId poolId) internal returns (uint24 lpFee) {
    PoolDynamicConfigVars storage _poolConfigVars_ = _poolConfigVars[poolId];
    uint256 variableFee = uint256(_poolConfigVars_.feeControlNumerator) * (volAccumulator ** 2)
        / FEE_CONTROL_DENOMINATOR;
    uint256 fee = variableFee + _poolConfigVars_.baseFee;
    fee = fee > _poolConfigVars_.maxLpFee ? _poolConfigVars_.maxLpFee : fee;
    return uint24(fee);
}
```

6) Clanker：权限位 — `clanker-devco/v4-contracts/src/hooks/ClankerHook.sol#L411-L428@b004c2e…`
```solidity
return Hooks.Permissions({
    beforeInitialize: true,  afterInitialize: false,
    beforeAddLiquidity: true, afterAddLiquidity: false,
    beforeRemoveLiquidity: false, afterRemoveLiquidity: false,
    beforeSwap: true, afterSwap: true,
    beforeDonate: false, afterDonate: false,
    beforeSwapReturnDelta: true, afterSwapReturnDelta: true,
    afterAddLiquidityReturnDelta: false, afterRemoveLiquidityReturnDelta: false
});
```

---

## 来源

- [1] **PRIMARY** SorellaLabs/angstrom `contracts/src/modules/UnlockHook.sol` @98216596f3df0e40f9558dada56528f6ae6bb25a（HEAD 2026-10-01，访问 2026-10-06）。证明了 beforeSwap 的门禁、fee override，以及 afterSwap 用 6909 收协议费并返回 int128 delta。
- [2] **PRIMARY** 同仓库 `contracts/src/Angstrom.sol`。证明了 `execute → unlock → unlockCallback` 的流程、ToB 与用户订单的结算顺序，以及 BUSL-1.1 许可。
- [3] **PRIMARY** 同仓库 `contracts/src/modules/UniConsumer.sol`。证明了 Angstrom 要求的权限位组合和 DYNAMIC_FEE_FLAG。
- [4] **PRIMARY** 同仓库 `contracts/src/modules/TopLevelAuth.sol`。证明了 `_isUnlocked`、`_nodeBundleLock`、`unlockWithEmptyAttestation` 的语义（每块一次、仅限节点、空块签名）。
- [5] **PRIMARY** 同仓库 `contracts/docs/overview.md`。证明了 bundle 的 8 个阶段、节点信任假设、malicious router 风险、不支持 FoT 代币、LP 奖励累加器。
- [6] **PRIMARY** Angstrom Docs Overview 与 L1 Architecture（docs.angstrom.xyz，访问 2026-10-06）。证明了应用层排序、每块初始锁、批量统一价、结算后对外解锁、LP 存取不受影响。
- [7] **PRIMARY** Angstrom Docs L2 Overview（访问 2026-10-06）。证明了 L2 版按优先费收 MEV 税、部署在 Base 和 Unichain、工厂无许可。
- [8] **PRIMARY** Uniswap Foundation Builder Update #31（uniswapfoundation.org，访问 2026-10-06）。证明了 Angstrom 主网上线，并由 UF Hook Design Lab 支持；日期 2025-07-26 来自 BlockBeats/TechFlow 二手报道。
- [9] **PRIMARY**（数据）DefiLlama `summary/dexs/angstrom`（访问 2026-10-06）。证明了 30 天 $396.0M、累计 $3.249B、只在 Ethereum、listedAt 2025-07-26，以及费用口径中含 Auction Fees。
- [10] **PRIMARY**（数据）DefiLlama `summary/dexs/uniswap-v4`（访问 2026-10-06）。证明了 v4 30 天 $42.45B、累计 $471.0B。
- [11] **PRIMARY** Bunniapp/bunni-v2 `src/BunniHook.sol`、`src/base/BaseHook.sol` @2b303b8c1b9f8afbb169d62ba52da93d6d2171fe（访问 2026-10-06）。证明了回调集合、natspec "Uses am-AMM to recapture LVR & MEV"、owner 可以解除提款阻塞。
- [12] **PRIMARY** 同仓库 `src/lib/BunniHookLogic.sol` @2b303b8。证明了 afterInitialize 只接受 hub 调用、beforeSwap 的完整计算与结算路径、费率优先级、surge。
- [13] **PRIMARY** Bunni Blog "Exploit Post Mortem"（blog.bunni.xyz，访问 2026-10-06）。证明了 2025-09-02 约 $8.4M、三步攻击、舍入根因、修复 diff、Unichain 池幸免的原因。
- [14] **PRIMARY** bunni-v2 README @2b303b8（commit 2025-10-23 "update license to MIT"）。证明了"已被利用、未修复、勿用于生产"的声明和 MIT 许可。
- [15] **PRIMARY**（数据）DefiLlama `summary/dexs/bunni-v2`（访问 2026-10-06）。证明了累计 $2.48B、分链数据、`deprecated: true`、记录 5 份审计。
- [16] 二手：Cryptonews、CoinCentral（2025-10，访问 2026-10-06）。转引 Bunni 官方 X，证明 2025-10-23 宣布停运、原因是资金不足以重启。
- [17] **PRIMARY** clanker-devco/v4-contracts `src/hooks/ClankerHook.sol` @b004c2edda29fa282a16d5d1441a26484f70b37f（访问 2026-10-06）。证明了权限位、20% 协议费的 return delta 实现、beforeInitialize 封锁、MEV 模块 2 分钟上限。
- [18] **PRIMARY** 同仓库 `src/hooks/ClankerHookDynamicFee.sol`。证明了波动累加器、二次费率公式、最低 0.25%、模拟 swap 的实现。
- [19] **PRIMARY** 同仓库目录树（GitHub API）。证明了 `audits/` 下有 cantina_v4_audit_1、macro_v4_audit_1/2，以及 base_mainnet_abis。
- [19a] **PRIMARY** SorellaLabs/angstrom 仓库目录（`contracts/security-reviews/`）。证明了 Spearbit 与 Cantina 审计文件的存在（未读内容）。
- [20] **PRIMARY**（数据）DefiLlama `summary/fees/clanker`（访问 2026-10-06）。证明了 Clanker 费用口径：30 天 $742.6K、累计 $91.6M，以及方法论。
- [21] **PRIMARY** Clanker Docs MEV 模块（clanker-devco/DOCS @e533702，meme-launchpad 报告 2026-10-05 已核实）。证明了衰减费 80%→5%/30s。
- [22] **PRIMARY** OpenZeppelin/uniswap-hooks `src/general/LimitOrderHook.sol` 与 `src/general/` 目录 @1f061b8ec0232608900adfb1a2fa8cd5f6c5a5dc（访问 2026-10-06）。证明了限价单机制、回调、局限与 experimental 声明，以及库里另有 ReHypothecation / AntiSandwich / LiquidityPenalty hook。
- [23] **PRIMARY** Uniswap Blog "Uniswap v4 TWAMM Hook"（blog.uniswap.org/v4-twamm-hook，访问 2026-10-06），以及 raw `v4-periphery/main/contracts/hooks/examples/TWAMM.sol` 返回 404。证明了 TWAMM 示例的设计（每块第一笔动作），并说明示例已不在 main 分支。
- [24] **PRIMARY** whetstoneresearch/doppler `docs/Doppler.md`（main，访问时 HEAD 为 5754c7ee01f1bdbd6f07c62be721e1223b725ecd，2026-10-06）。证明了 4 个回调、epoch 荷兰式拍卖、三类 slug。
- [25] **PRIMARY** Zora Docs coins（docs.zora.co/coins，meme-launchpad 报告 2026-10-05 已核实）。证明了 v4 hook + Doppler 多曲线、狙击税 99%/10s、20% 费用转为永久流动性。
- [26] **PRIMARY** Flaunch Docs auto-buybacks（docs.flaunch.gg，meme-launchpad 报告 2026-10-05 已核实）。证明了 PBW 每 0.1 ETH 一档单边买单。
- [27] **PRIMARY**（数据）DefiLlama `summary/fees/flaunch`（访问 2026-10-06）。证明了 Flaunch 费用 30 天 $6.7K、累计 $3.60M。
- [28] **PRIMARY** ponsdotdev/pons-labs README @44a3db9（meme-launchpad 报告 2026-10-05 已核实）。证明了 Pons V2 曲线合约在毕业时铸造全区间 v4 头寸、singleton hook 只在 quote 一侧收费。
- [29] 二手：beelaa.com《Uniswap V4 in 2026》（搜索摘要，访问 2026-10-06）。只作线索：截至 2026-06，已初始化 hook 超过 41,000 个。

---

## 开放问题

1. 按 hook 地址统计的成交量 / TVL 排名（Uniswap Labs Dune "v4 Hook Explorer"、hookrank.io）没有抓到；需要可执行 JS 的抓取，或直接用 Dune API。
2. Angstrom 拍卖收入（Auction Fees）占 LP 收入的比例、节点集合规模与质押额、没有 bundle 的块所占比例（关系到外部 swap 的可用性）。
3. 聚合器（UniswapX、1inch、0x）是否路由 Angstrom 池和 Bunni 池；Angstrom 外部 swap 需要节点签名，推测聚合器路由受限，未核实。
4. Bunni 停运日期的一手出处（官方 X 原帖），以及 2025-09 之后 LP 资金的提取进度。
5. Clanker 动态费 hook 在 Clanker 全部池里的占比（相对静态费 hook），以及模拟 swap 实际多出的 gas。
6. Doppler hook 源码的权限位、审计报告，以及 Zora 现在用的是 Doppler 动态拍卖 hook 还是 multicurve initializer。
7. 有没有生产级 TWAMM 或限价单 hook 达到可观的成交量。
8. 本文件里的行号是手工数的，复核时需要用 `git blame` 或 GitHub 行锚点确认。

---

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| O1 | 截至 2026-10-06，Uniswap v4 全部池 30 天成交量 $42.45B，累计 $471.0B（DefiLlama 口径，剔除刷量） | [10] DefiLlama summary/dexs/uniswap-v4 | observed |  |
| O2 | 截至 2026-10-06，Angstrom 30 天成交量 $396.0M，累计 $3.249B，只在 Ethereum，DefiLlama 上线日 2025-07-26 | [9] DefiLlama summary/dexs/angstrom | observed |  |
| O3 | Angstrom 30 天成交量约为 v4 同期的 0.93% | 由 O1、O2 推出：396.0M / 42.45B ≈ 0.93% | inferred |  |
| O4 | Angstrom 主网上线（2025-07 下旬），由 Uniswap Foundation 的 Hook Design Lab 支持 | [8] UF Builder Update #31；日期见 BlockBeats/TechFlow 2025-07-26 二手报道 | observed |  |
| O5 | Angstrom hook 要求：before/afterInitialize 至少一个，必须有 beforeAdd、beforeRemove、beforeSwap、afterSwap+afterSwapReturnDelta，必须没有 afterAdd/afterRemove，池费率为 DYNAMIC_FEE_FLAG | [3] UniConsumer.sol#L48-L70@98216596 | observed |  |
| O6 | Angstrom 外部 swap 时，如果本块还没解锁，hookData 必须带节点地址和节点对本块空块证明的签名，否则 revert CannotSwapWhileLocked | [1] UnlockHook.sol#L44-L57；[4] TopLevelAuth unlockWithEmptyAttestation | observed |  |
| O7 | 解锁条件是 _lastBlockUpdated == block.number；execute 由节点调用，每块只能一次 | [4] TopLevelAuth.sol _isUnlocked / _nodeBundleLock | observed |  |
| O8 | Angstrom 对外部 swap 用 OVERRIDE_FEE_FLAG 覆盖 LP 费，afterSwap 把协议费以 6909 mint 给 FEE_COLLECTOR，并作为 int128 delta 从交易者那里扣 | [1] UnlockHook.sol beforeSwap/afterSwap | observed |  |
| O9 | Angstrom bundle 在一次 unlock 内按 take 资产 → 池子 swap → ToB 订单 → 用户订单 → 结清 delta 的顺序执行 | [2] Angstrom.sol unlockCallback；[5] overview "Bundle processing" | observed |  |
| O10 | Angstrom 链上合约依赖质押节点提供价格、成交量和 gas 分摊，安全性靠罚没；恶意 router 可能盗取 beforeRemoveLiquidity 中分发的奖励 | [5] overview.md Assumptions | observed |  |
| O11 | Angstrom 依赖节点活性：没有 bundle 也没有节点签名的块里，外部交易者无法 swap | 由 O6、O7 推出：未解锁时 beforeSwap 一律 revert，解锁只能由节点完成 | inferred |  |
| O12 | 带"节点签名门禁"的池很可能难以被通用聚合器直接路由 | 由 O6 推出：聚合器需要拿到节点签名才能 swap；未见聚合器集成的一手证据 | speculative |  |
| O13 | Angstrom 文档称：每块由节点先执行套利拍卖和统一价批量拍卖，再对外解锁；LP 存取不受锁影响 | [6] docs.angstrom.xyz L1 Architecture | observed |  |
| O14 | Angstrom L2 版不用节点网络，在 beforeSwap 里按超出下限的优先费乘以固定虚拟 gas 收 MEV 税，分给池创建者、协议和 LP；已部署在 Base 与 Unichain | [7] docs.angstrom.xyz/l2/intro | observed |  |
| O15 | Angstrom 核心合约采用 BUSL-1.1 许可，仓库里有 Spearbit 与 Cantina 竞赛审计文件 | [2] SPDX 头；[19a] security-reviews 目录 | observed |  |
| O16 | Bunni v2 hook 只实现了 afterInitialize 和 beforeSwap 两个回调，afterInitialize 只接受 BunniHub 调用 | [11] BaseHook.sol；[12] BunniHookLogic.sol#L84-L92@2b303b8 | observed |  |
| O17 | Bunni v2 在 beforeSwap 里用 LDF 和 BunniSwapMath 自己计算 swap，并返回 BeforeSwapDelta(+input, −output) 接管整笔交易 | [12] BunniHookLogic.sol#L289-L306、L436-L441 | observed |  |
| O18 | Bunni 的结算路径：hook mint 输入 claim → hub.hookHandleSwap 拉走输入、推出输出 → hook burn 输出 claim | [12] BunniHookLogic.sol#L518-L530 | observed |  |
| O19 | Bunni 池的资金存放在 BunniHub（可部分再质押到 ERC-4626 金库），v4 核心曲线基本不参与成交 | 由 O17、O18 推出：specified 数量已被 delta 全部消耗；[12] 读取 reserve/vault 余额 | inferred |  |
| O20 | Bunni 的费率优先级为 am-AMM 管理者费 > hooklet 覆盖费 > 动态费（TWAP 偏离二次项 + surge 半衰期） | [12] BunniHookLogic.sol#L358-L387 注释与代码 | observed |  |
| O21 | 2025-09-02 Bunni 在 Ethereum USDC/USDT 和 Unichain weETH/ETH 两个池被利用，损失约 $8.4M | [13] Bunni 官方复盘 | observed |  |
| O22 | Bunni 事故根因：withdraw 中 idle balance 递减量向下取整，单次操作安全，但 44 次小额提款叠加后使总流动性被错误压低 84.4%，再被夹击 | [13] 复盘 "What Went Wrong"，含 BunniHubLogic.sol#L478@ad8acfc | observed |  |
| O23 | 最大的 Unichain USDC/USD₮0 池没被打，部分原因是 Unichain 上闪电贷资金不足（约需 1,700 万，Euler 约 1,100 万），且 v4 本身在第 2 步要用到，不能同时作为闪电贷来源 | [13] 复盘 "Why Wasn't Unichain…" | observed |  |
| O24 | Bunni v2 累计成交量 $2.48B（Unichain $1.55B），DefiLlama 已标记 deprecated，记录 5 份审计 | [15] DefiLlama summary/dexs/bunni-v2 | observed |  |
| O25 | Bunni 于 2025-10-23 宣布停运，原因是没有资金支持重启；同日仓库改为 MIT 许可并注明勿用于生产 | [16] 二手转引官方 X；[14] README 与 commit 2b303b8（2025-10-23） | observed |  |
| O26 | 用 return delta 接管曲线的 hook，要自己承担全部记账正确性，攻击面明显大于只改费用的 hook | 由 O17、O22 推出：Bunni 事故出在 hook 自有记账，不在 v4 核心 | inferred |  |
| O27 | Clanker 基础 hook 的权限位为 beforeInitialize、beforeAddLiquidity、beforeSwap、afterSwap、beforeSwapReturnDelta、afterSwapReturnDelta | [17] ClankerHook.sol#L411-L428@b004c2e | observed |  |
| O28 | Clanker 的 beforeInitialize 直接 revert，池子只能通过 factory 的 initializePool 或公开的 initializePoolOpen 创建；池费率固定为 DYNAMIC_FEE_FLAG | [17] ClankerHook.sol _beforeInitialize、_initializePool | observed |  |
| O29 | Clanker 协议费 = LP 费 × 20%，只对配对币一侧收：配对币 exactIn 时在 beforeSwap 用 specified delta 收，Clanker 币 exactIn 时在 afterSwap 用 unspecified delta 收，都以 6909 mint 给 hook | [17] ClankerHook.sol#L270-L378 | observed |  |
| O30 | Clanker 在下一笔 swap 的 beforeSwap 里把 hook 持有的协议费 6909 burn 后 take 给 factory | [17] ClankerHook.sol _hookFeeClaim | observed |  |
| O31 | Clanker MEV 模块只在建池后 2 分钟内运行，期间 beforeAddLiquidity 禁止加流动性 | [17] MAX_MEV_MODULE_DELAY 与 _beforeAddLiquidity | observed |  |
| O32 | ClankerHookDynamicFee：fee = baseFee + feeControlNumerator·VA²/1e10，上限 maxLpFee（≤30%），baseFee ≥ 0.25%，通过 updateDynamicLPFee 写入 | [18] ClankerHookDynamicFee.sol#L17-L20、L70-L89；[17] MAX_LP_FEE | observed |  |
| O33 | Clanker 用"hook 自调用 PoolManager.swap 后 revert TickReturned"来模拟成交后的 tick，作为波动输入；注释承认结果与实际不完全一致 | [18] _getTicks / simulateSwap | observed |  |
| O34 | Clanker 动态费 hook 每笔 swap 实际执行一次额外的完整 swap 模拟，gas 至少约翻倍 | 由 O33 推出：模拟执行同一条 swap 计算路径后回滚 | inferred |  |
| O35 | Clanker v4 合约开源，有 Cantina 1 份、Macro 2 份审计，Base 主网 ABI 已发布 | [19] v4-contracts 目录树 | observed |  |
| O36 | 截至 2026-10-06，Clanker 费用口径 30 天 $742.6K、累计 $91.6M（几乎全在 Base）；Flaunch 30 天 $6.7K、累计 $3.60M | [20] DefiLlama fees/clanker；[27] fees/flaunch | observed |  |
| O37 | OZ LimitOrderHook 在当前价格外挂一个 tickSpacing 宽的单边流动性作为限价单，在区间内或方向错误会 revert | [22] _handlePlaceCallback（InRange / CrossedRange） | observed |  |
| O38 | OZ LimitOrderHook 在 afterSwap 里扫描被穿越的 tick 并撤出订单流动性，成交 gas 由触发穿越的交易者承担，大单可能需要拆分 | [22] _afterSwap、_fillCrossedOrders 与 NOTE | observed |  |
| O39 | v4 不回调 hook 自身发起的操作，所以 hook 内部 swap 后必须手动调用成交逻辑 | [22] IMPORTANT 注释 | observed |  |
| O40 | OZ LimitOrderHook 是库实现（v1.2.0，标注 experimental），不支持原生 ETH | [22] 文件头与 NOTE | observed |  |
| O41 | Uniswap 官方 TWAMM 示例的设计是让 TWAMM 订单成为每块第一笔池操作以避免抢跑；博客链接的示例文件在 v4-periphery main 分支已 404 | [23] Uniswap Blog；raw 路径返回 404（2026-10-06） | observed |  |
| O42 | 未找到有规模的生产级 TWAMM 或限价单 hook | 由 O40、O41 推出，加上本轮检索只找到个人 GitHub 实现；未穷举 | speculative |  |
| O43 | Doppler 用 afterInitialize（放初始头寸）、beforeSwap（每 epoch 首笔前再平衡）、afterSwap（累计售出和募集，不计 swap 费）、beforeAddLiquidity（拒绝外部 LP）四个回调 | [24] doppler docs/Doppler.md | observed |  |
| O44 | Doppler 按 epoch 调整曲线：落后时荷兰式下移（每 epoch 最多 (endingTick−startingTick)/epoch 数），超前时上移，并重铺 lower / upper / discovery 三类 slug | [24] Doppler.md "Curve Accumulation"、"Liquidity Placement" | observed |  |
| O45 | Doppler 用"hook 自有头寸的移动"而不是 return delta 来实现曲线，资金仍走 v4 集中流动性 | 由 O43、O44 推出：文档只描述 slug 头寸的放置，没有提到 BeforeSwapDelta | inferred |  |
| O46 | Zora 用 v4 hook + Doppler 多曲线头寸，狙击税 99% 起 10 秒衰减，20% 手续费转为永久流动性 | [25] docs.zora.co/coins（meme-launchpad 已核实） | observed |  |
| O47 | Flaunch 把创作者不拿的手续费每攒满 0.1 ETH 就在现价下方挂一笔单边买单（PBW） | [26] docs.flaunch.gg auto-buybacks | observed |  |
| O48 | Pons V2 的曲线在独立合约里，毕业时铸造全区间 v4 头寸进 locker，singleton hook 只在 quote 一侧收费 | [28] pons-labs README @44a3db9 | observed |  |
| O49 | 二手称截至 2026-06 已初始化 hook 超过 41,000 个 | 仅见于 [29] beelaa 搜索摘要，未取到 Dune/hookrank 一手数据 | speculative |  |
| O50 | 按改动深度排序：只改费用（Clanker DynamicFee）< 自有头寸订单（LimitOrder）< 自有头寸曲线（Doppler）< 准入加离链结算（Angstrom）< 用 delta 替换曲线和记账（Bunni），信任面随之扩大 | 由 O8、O17、O29、O37、O44 推出：依据各自修改的状态与资金托管位置 | inferred |  |
| O51 | 动态费是这些代表 hook 共用的能力：Clanker 用 updateDynamicLPFee，Angstrom 用 DYNAMIC_FEE_FLAG 加 fee override，Bunni 在 beforeSwap 内自算费率并计入 delta | 由 O5、O8、O20、O32 推出 | inferred |  |

类型计数：observed 40 / inferred 8 / speculative 3（共 51 行）。

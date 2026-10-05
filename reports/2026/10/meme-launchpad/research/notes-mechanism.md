# notes-mechanism：机制与生命周期（brief 研究问题 1、2 + 两代实现差异）

研究问题：meme launchpad 的核心机制（虚拟储备曲线数学、毕业阈值、费用路由、权限丢弃、反狙击）是什么，一个代币从创建到外盘的完整生命周期每一步发生什么、在哪里会坏，以及“两阶段迁移”和“v4 单池/单边池”两代实现在工程上到底差在哪。
一句话答案：pump.fun 式 launchpad 用一条 **x·y=k + 两个虚拟储备** 的曲线让合约自己当对手盘，所以发币零垫资；毕业是一个**代币数量条件**（曲线可售量售罄），不看美元也不靠预言机；毕业后把真实储备搬进 AMM 并烧掉/锁死 LP，撤池 rug 在技术上就不存在了。两代实现的真正分界线不在“是不是 v4”，而在**毕业时资金是否经过一个任何人都能抢先初始化的外部池**：four.meme 2025-02 被盗的 $183K 正出在这里。v4 系（Clanker / Zora / Flaunch）大多干脆取消了曲线，直接用单边集中流动性头寸模拟曲线；“在 hook 里跑曲线、毕业就地翻转状态”目前只是设计模式，没找到生产实例。
口径：pump.fun 参数以 pump-fun/pump-public-docs @ `cb188ce` 与 pump.fun/docs（访问日期 2026-10-05）为准；Uniswap v4 以 v4-core @ `46c6834` 为准。

---

## Q1 核心机制

### 1.1 虚拟储备曲线的数学

**答案**：pump.fun 曲线就是 Uniswap V2 的恒定乘积公式，只是两侧储备里都加了“虚拟量”：(vSOL)(vTOK)=k。其中 vSOL = 30 SOL（虚拟）+ 已募真实 SOL，vTOK = 1,073,000,000（虚拟）− 已售代币。虚拟储备给出一个非零的开盘价，也让最后一枚可售代币的价格保持有限，所以曲线能卖完、能毕业。

**依据**
- 官方程序文档写明：曲线公式“based on Uniswap V2 and uses synthetic x and y reserves”。Global 账户 `4wTV1Ymi…` 中 `initial_virtual_token_reserves = 1073000000000000`（6 位精度 = 1,073,000,000 枚）、`initial_virtual_sol_reserves = 30000000000`（30 SOL）、`initial_real_token_reserves = 793100000000000`（793,100,000 枚）、`token_total_supply = 1000000000000000`（10 亿枚）。每次 buy 时 virtual/real SOL 同步增加，virtual/real token 同步减少 [1]。官方 bonding-curve 页也写它是 constant-product AMM [8]。
- 买入时程序使用 u128 整数运算，并对 `vTOK'` 做 +1 向上取整，方向偏向池子；卖出时做向下取整 [27 §1.4–1.5，用户链上解码；整数细节未在官方文档中找到]。
- 现价 P = vSOL/vTOK；pump.fun 计算市值时一律用“价格 × 10 亿枚” [7][5]。
- 关于为什么需要虚拟储备：如果用纯真实储备 x·y=k，开盘时 x=0，价格就是 0，第一笔买单能以近乎免费的价格扫空供应；同时当 y→0 时价格趋于无穷，曲线永远卖不完。加上虚拟储备，相当于把双曲线平移到有限、可达的区间 [8][28 02 §3.1.1]。
- 2026 年的接口变化：BondingCurve 账户加了 `quote_mint` 字段，`virtual_sol_reserves` 改名为 `virtual_quote_reserves`；Global 新增 `initial_virtual_quote_reserves`，供非 SOL 计价币使用。自 2026-05-21 起，创作者可以选择 USDC 作为计价资产 [2][7]。

**不确定之处**
- USDC 曲线的 `initial_virtual_quote_reserves` 具体取值没有在文档中找到，需要直接读 Global 账户。
- 公开 README 里的 Global 示例是旧快照：`fee_basis_points = 100`、`creator_fee = 0` [1]，和现行 1.25% 费率（95+30 bps）[7] 不一致。用户 2026-09-06 的链上解码读到的是 95 [27]。应以链上和费用页为准。

### 1.2 价格随售出量变化：可直接代入的数值例子（经典 SOL 曲线）

| 量 | 值 | 来源 |
|---|---|---|
| k | 30 × 1.073e9 = 3.219e10 SOL·token | 由 [1] 的常数推出 |
| 开盘价 P₀ | 30 / 1.073e9 = 2.7959e-8 SOL/token；开盘市值 27.96 SOL | 推出 |
| 售罄时 vTOK | 1.073e9 − 7.931e8 = 2.799e8 | 推出 |
| 售罄时 vSOL | 3.219e10 / 2.799e8 = 115.005 SOL | 推出 |
| 真实募得 | 115.005 − 30 = **85.005 SOL** | 推出；与 [27 §1.7] 的逐步整数模拟一致 |
| 毕业价 / 毕业市值 | 4.1088e-7 SOL/token；**410.88 SOL** | 推出 |
| 全程涨幅 | ≈14.70× | 推出 |
| 曲线前置倾斜程度 | 净入 30 SOL 时已卖出 53.65% 总供应；最后 25 SOL 只卖出 7.8% | [27 §1.8] 阶梯表，可按公式复算 |
| 首笔总支出 1 SOL（1.25% 费） | 入曲线 0.987654 SOL，买到 34,199,203 枚（占总供应 3.42%），相对开盘价滑点 +3.29% | [27 §1.9]，已按公式复核 |
| “$69k 毕业”的来历 | 410.88 SOL × $167.93 ≈ $69,000，本质是汇率换算 | 推出 |

**为什么首块狙击是数学结果**：曲线极度前置倾斜，最早的区块拿到的供应占比最大，所以开盘狙击是曲线形状的必然结果 [27 §1.8；inferred]。

### 1.3 毕业阈值的三种定义方式

**答案**：一共见到三种口径。
1. **按售出比例 / 代币数量**：pump.fun，条件是 `real_token_reserves == 0`。
2. **按 quote 数量**：four.meme，在创建页按计价资产写明募资额，例如 18 BNB、12,000 USDT/USD1。
3. **按“阈值 / 虚拟储备”比值**：Pons V2，可售比例由 `graduationThreshold / phantomQuote` 决定。

三者本质上是同一条曲线方程的不同参数化，选定其中三个自由度，其余量就全部锁死。

**依据**
- pump.fun：`complete` 在 buy 指令末尾、`real_token_reserves == 0` 时置 true [1]。官方用户文档的表述是“market cap hits the graduation threshold” [8]，对经典曲线而言两种说法等价。
- four.meme：创建页按计价资产列出募资额：BNB 18、USDT 12,000、USD1 12,000、NVDAB 60、GMEB 650 等 [22]。较早的 TST 代币页显示的是 24 BNB [22]，说明阈值随 BNB 价格下调过。
- Pons V2：池子预留量 = `supply × phantomQuote ÷ (phantomQuote + threshold)`，文档原话是“only the ratio of threshold to phantom reserve determines what fraction of supply reaches the pool” [18]。第三方索引给出的切分是 5/7 在曲线上卖出、2/7 在毕业时扫入 [19]。

**不确定之处**
- **2026 年 pump.fun 的“85 SOL”已不普遍成立**。用户抽样的 3 笔同日迁移分别只注入 0.086 / 0.76 / 17.58 SOL，代币侧却恒为 2.069 亿枚；其中一枚币总供应 1,925,946,968 ≠ 10 亿 [27 §2.6]。
  - 官方文档出现了 **Mayhem mode**：`create_v2` 带 `is_mayhem_mode` 参数，并需要 Mayhem 程序的 vault 账户 [6]。二手资料称 Mayhem 会额外铸 10 亿枚，由 AI agent 随机买卖 24 小时后销毁剩余部分 [10]。这能解释供应 ≈19.26 亿的现象。
  - 它能否同时解释“低 SOL 也能毕业”，我没有核实（speculative）。
  - 另外，PumpSwap Pool 新增了 `virtual_quote_reserves`（i128），自 2026-09-30 起可以为负 [2][4]，说明毕业后的池子也可能带虚拟储备。它和低 SOL 迁移是否有关，同样未知。

### 1.4 手续费结构与路由（pump.fun，截至 2026-10-05）

**答案**：
- 曲线阶段总费率 1.25%：创作者 0.30% + 协议 0.95% + LP 0%，SOL 与 USDC 计价币相同。
- 毕业后的 canonical PumpSwap 池按市值分档收费（以 SOL 或 USDC 计价的市值）。
- 非 canonical 池固定 0.30%（LP 0.25% + 协议 0.05%）。
- 创建免费；毕业收 0.015 SOL。

**依据**
- 费用页给出上述各项；creator fee 适用于 2025-05-13 起仍在曲线或 PumpSwap 上的币 [7]。
- 动态分档由独立的费率程序实现，2025-09-01 20:00 UTC 起强制启用，适用于曲线和 canonical 池。分档依据：曲线用 vSOL×supply/vTOK 计算市值，池子用 quoteReserve×supply/baseReserve [5]。
- `pool_migration_fee = 15000001` lamports，这是 migrate 时新建账户所需租金的下限 [1]。
- 2025-03-20 之前迁往 Raydium 时收 6 SOL，PumpSwap 上线后降为 0（官方推文“0 migration fees (down from 6 SOL)”）[11]。
- 2026 年新增 holder rewards coin（创作者费改为分给持有人），cashback 模式停止新建 [2][6]。

**用户方案对照**：02-fundamentals 写的“典型 1%，45/45/10 分账”是作者自拟的通用设计，不是 pump.fun 参数 [28 02 §3.3.1]。

### 1.5 权限丢弃与 LP 处置

**答案**：
- pump.fun 的 mint authority 是程序 PDA `["mint-authority"]` [6]。二手资料称创建同一交易内关闭铸币权 [10]，未一手核实。
- 毕业时 `migrate` 建 PumpSwap 池，然后**销毁全部 LP** [1]。
- four.meme 文档写 LP “held by the token's bonding curve contract and cannot be withdrawn” [23]，但 2025-03 的二手报道称它改为销毁 LP [26]，两说并存。
- v4 系通常把 LP 放进无出口 Locker，只保留领手续费的权利：Clanker 用 LpLocker + FeeLocker [15]，Pons 的 locker 写明“No one can withdraw it, including the protocol” [18]。

**依据**：[1][6][15][18][23][26]；链上序列 MintTo 133,094,492,867 → Burn 同量 [27 §2.5]。

**不确定之处**：Mayhem 币存在额外铸造 [10]。“铸币权在创建交易内关闭”与“agent 额外铸 10 亿”在时序上如何同时成立，没找到一手说明。

### 1.6 反狙击手段（机制层）

| 手段 | 参数 | 来源 |
|---|---|---|
| Clanker 2 区块延迟 | 部署后 2 个区块内不可 swap | [15] |
| Clanker 狙击拍卖 | 把首批 swap 拍卖出去，拍卖收入给创作者（适用于按优先费排序的 L2） | [15] |
| Clanker 抛物线衰减费 | 起始 LP fee 最高 80%，衰减时长最长 2 分钟；推荐配置为 80% 在 30 秒内降到 5%；公式 `fee = endingFee + feeRange·(timeDecay/timeToDecay)²`。所有 MEV 模块最晚 2 分钟后失效 | [15] |
| Zora Sniper Tax | 99% 起，10 秒内衰减 | [17] |
| Flaunch 固定价公平发射 | 30 分钟内单一价格、只能买；之后募得 ETH 全部变成 spot 下方的买墙 | [16] |
| four.meme Antisniper 开关 | 创建后最初几个区块收高额手续费（具体数值未披露） | [22] |
| pump.fun | 合约层没有反狙击；只有滑点参数（`max_sol_cost` / `min_sol_output`）[1] | [1] |

### 1.7 解决了传统 DEX 发币的哪些问题

| 传统问题 | 怎么解决的 | 残留 |
|---|---|---|
| 必须双边垫资建池 | 虚拟储备提供开盘价，创作者 0 垫资；pump.fun 创建免费 [7][8] | — |
| 撤池 rug | 曲线阶段没有提款接口；毕业时 LP 销毁或锁死 [1][18] | 风险转成持仓抛售，例如 dev 低位建仓后砸盘 [27 §2.8；inferred] |
| 首块狙击 | pump.fun 没有在协议层解决；v4 系用衰减费、延迟、固定价窗口来缓解 [15][16][17] | 曲线越前置倾斜，狙击收益越大 [27 §1.8] |

---

## Q2 完整生命周期

### 2.1 阶段、参与者、调用

| 阶段 | 状态 | 参与者 | 关键调用（pump.fun） | 失败模式 / 攻击面 |
|---|---|---|---|---|
| ① 创建 | mint 与 BondingCurve PDA 建立；`complete=false`，`real_quote=0` | 创作者；免费创建流程中可由首个买家代为上链（`user ≠ creator`）[1] | `create_v2(name≤32, symbol≤13, uri≤200, creator, is_mayhem_mode, …)`。使用 Token-2022 mint，decimals=6，metadata pointer 指向 mint 自身 [6]；可与 `buy_v2` 同交易执行，即 dev buy [6] | dev 在最低价建仓；元数据仿冒 |
| ② 曲线交易（内盘） | 按 vQ·vT=k 定价 | 交易者、狙击 bot、终端 | `buy / buy_v2 / buy_exact_quote_in_v2 / sell / sell_v2` [1][2] | 首块狙击；三明治（受滑点参数限制）；精度舍入方向 |
| ③ 毕业判定 | 最后一笔 buy 使 `real_token_reserves==0`，`complete=true`，曲线拒绝后续 buy/sell [1] | 推满曲线的那个买家 | 在 buy 内部判定 | 抢“最后一笔”；判定后 buy/sell 失效，交易需转到 AMM |
| ④ 迁移 | 曲线储备（2.069 亿枚 + 真实 SOL）注入 canonical PumpSwap 池，index=0 [3]，LP 全部销毁 [1] | **任何人**（permissionless）；实际多由 `39azUY…` 执行 [1][27] | `migrate(user, mint)`，幂等 [1] | 旧版 `withdraw` 是由链下服务器把资金搬到 Raydium 的中心化路径，现已禁用 [1]；EVM 两阶段迁移存在“预建池”攻击（见 2.2） |
| ⑤ 外盘交易与费用 | PumpSwap 恒定乘积池；canonical 池按市值分档收费 [5][7] | 交易者、聚合器、创作者（领取 creator fee） | PumpSwap `buy / sell`；报价必须用 `effective_quote_reserves = vault + virtual_quote_reserves` [3][4] | 集成方如果把 i128 当 u64 读，会算错（2026-09-30 起该值可为负）[4] |
| ⑥ 长尾 | 绝大多数币停在曲线上或毕业后归零 | — | 迁移时 closeAccount 回收临时账户租金 [27 §2.5] | 状态膨胀：Solana 上账户需付租金押金；v4 的池子只是 PoolManager 里的一次状态更新，不再部署新合约 [14] |

### 2.2 失败模式与攻击面（逐条）

- **迁移时被预建池（four.meme，2025-02-11，约 $183K）**：攻击者抢先用极高的 sqrtPriceX96 在 PancakeSwap V3 上初始化了 meme/WBNB 池。four.meme 迁移时发现池子已存在，没有校验价格，`amount0Min/amount1Min` 也设为 0，直接把流动性加进了这个价格被扭曲的池子，随后被攻击者用少量代币换走 WBNB。约 20 个币以同样手法被攻击 [20][21]。
  - **这不是重入**：04-defects 写成“Helper3 重入被盗（违反 CEI）”[28 04 §3.1.1]，02 写成“伪造代币或重复触发迁移”[28 02 §3.4.1]，都与 SlowMist 和 DeFiHackLabs 的复盘不符。
  - DefiLlama 另记有 2025-03-18 一起 $80K 的访问控制事件 [25]，细节未核实。
- **迁移夹子 / 信息冲击**：在 EVM 上，毕业交易如果独立于建池交易、且经过公开 mempool，就存在抢跑窗口 [inferred]。pump.fun 的 `migrate` 是单笔原子交易，建池和烧 LP 在同一笔内完成 [1][27]。
- **重入**：曲线或 hook 合约在 push 转账（例如直接把费用打给创作者）时会引入外部调用。用户方案提出用 pull 模式记账 [28 02 §3.3.2]。这属于设计建议，不是已发生的事故。
- **精度取整**：pump.fun 买入时对 vTOK' 做 +1 [27 §1.4]；方案提出的铁律是“进池向上取整、出池向下取整” [28 02 §4.1]。
- **首块狙击**：见 1.6；Clanker 文档明确表示衰减费是针对狙击者设计的 [15]。
- **集成侧错误**：2026 年 pump 接口变化频繁（buy_v2、quote_mint、负虚拟储备），终端或 bot 若硬编码常数会出错 [2][4][27 §2.6]。

---

## Q3 两代（实为三类）实现的工程差异

**答案**：“两阶段迁移 vs v4 单池相变”这个二分太粗。按“资金在毕业时走哪条路”看，可以分成三类：

| 类型 | 代表 | 资金路径 | 外部攻击面 |
|---|---|---|---|
| A. 曲线合约 → 外部 DEX | pump.fun 2024–2025-03（Raydium，链下 `withdraw`，收 6 SOL）；four.meme → PancakeSwap | 跨协议建池，需要 Router 或 PositionManager | 预建池或价格操纵（four.meme）；链下执行者是单点 |
| B. 曲线合约 → 自有或同计价资产池，原子执行、不经 Router | pump.fun `migrate` → PumpSwap；Pons V2 `graduation executor` 直接把 full-range v4 头寸铸进 locker，并有 `graduation guard` 校验储备 | 单笔交易内建池、销毁或锁定 LP | 大幅收窄；残留的是毕业瞬间的信息冲击 |
| C. 不设曲线，直接以 AMM 头寸发射 | Clanker：全部供应放进单边 v4 LP；Zora：Doppler 多曲线头寸；Flaunch：30 分钟单一 tick 固定价，之后转 full range | 没有毕业搬运 | 开盘狙击依靠 MEV 模块或税率缓解 |

- “在 hook 的 beforeSwap 里跑虚拟曲线、达标后翻转 `graduated` 标志”在 v4 中技术上可行：hook 有 `beforeSwapReturnDelta` 权限，可以改写 swap 的 specified 数量，实现自定义曲线 [12][14]。但我没找到按这种方式上线的生产产品（speculative）。
- Doppler 用 v4 hook 做按 epoch 重新平衡的拍卖式曲线 [24]，结束后是否迁移在其文档页里没有说明。

**依据**：[1][3][11][12][14][15][16][17][18][24]

**v4 的关键原语**（用来解释 C 类为什么可行）
- 单例 PoolManager：建池只是一次状态更新，不部署新合约。
- flash accounting（EIP-1153）在交易末尾统一结算 [14]。
- hook 的权限编码在地址最低 14 位：beforeSwap = bit 7，beforeSwapReturnDelta = bit 3。若带 ReturnDelta 位却没有对应的动作位，地址视为无效；hook 返回的 delta 不得把 exactIn 改成 exactOut [12]。
- 动态费池可以在 beforeSwap 里返回 LP fee 覆盖值 [12]，这正是 Clanker 和 Zora 实现衰减费的接口。

**不确定之处**：02-fundamentals 说 v4 方案的“资金从未离开 PoolManager”[28 02 §3.4.2]。这只在 hook 用 ERC-6909 claim 托管时才成立，并不是 v4 的固有性质（inferred）。Pons V2 的资金在毕业前存放在每个 launch 自己的曲线合约里 [18]。

---

## 图的素材

**A. 生命周期状态机（pump.fun）[1][3][6]**
- `Created`（`create_v2`；`complete=false`，`real_quote=0`）→ `Trading`（buy/sell 循环）
- `Trading` →[某笔 buy 后 `real_token_reserves==0`]→ `Complete`（buy/sell 被拒）
- `Complete` →[任何人调用 `migrate`，幂等]→ `Migrated`（canonical PumpSwap 池 index=0，LP 已 burn）
- `Migrated` → 外盘交易（canonical 池按市值分档收费）
- 分支：`Trading` 长期停滞 = 死币（没有退出机制）

**B. 时序图：创建 → 交易 → 毕业（pump.fun）**
1. 创作者 → Pump：`create_v2` + `buy_v2`（同一交易，dev buy）[6]
2. bot：通过 Geyser 订阅 CreateEvent → 同 slot 或下一 slot 发出 buy [27 §6.5]
3. 散户 → Pump：buy/sell，费用 1.25% 分给 protocol fee recipient 与 creator vault [7]
4. 最后买家 → Pump：buy → `complete=true` [1]
5. 迁移执行者 → Pump：`migrate` → PumpSwap `create_pool` → LP MintTo → Burn → 剩余 lamports 转给执行者 [1][27 §2.5]
6. 交易者 → PumpSwap：buy/sell，按 effective_quote_reserves 报价 [3]

**C. 时序图：EVM 两阶段迁移的攻击（four.meme）[20][21]**
攻击者在曲线上买入 → 攻击者 `createAndInitializePoolIfNecessary(meme, WBNB, fee, 极高的 sqrtPriceX96)` → 曲线满额（当时 24 BNB）→ four.meme 的 `addLiquidity` 加进已存在的池子（min=0）→ 攻击者 swap 获利

**D. 曲线价格示意数据点（净入 SOL → 已售占比 → 现价 SOL）[27 §1.8，按公式复核]**
0→0%→2.796e-8；1→3.46%→2.985e-8；10→26.82%→4.971e-8；30→53.65%→1.118e-7；60→71.53%→2.516e-7；85.005→79.31%→4.109e-7

**E. 时间线节点**
- 2024-01：pump.fun 上线 [27]
- 2025-02-11：four.meme 被盗约 $183K [20]
- 2025-03-20：PumpSwap 上线，迁移费由 6 SOL 降到 0 [11]
- 2025-05-13：creator fee 生效日 [7]
- 2025-09-01 20:00 UTC：动态费率上线 [5]
- 2026-05-21：USDC 计价上线 [7]
- 2026-09-30：PumpSwap 虚拟储备允许为负 [2][4]

**F. 费用路由**
- pump 曲线：1.25% = creator 0.30 + protocol 0.95 [7]
- PumpSwap 非 canonical 池：0.30% = LP 0.25 + protocol 0.05 [7]
- Clanker：协议抽 LP fee 的 20%，例如创作者 1% → 总费率 1.2% [15]

---

## 来源
1. **PRIMARY** pump-fun/pump-public-docs @ `cb188ce08b5069196eef1f3e4a0c43b70099793b`，`docs/PUMP_PROGRAM_README.md`。证明了 Global 曲线常数、`complete` 的触发条件、`migrate` 无许可且幂等、LP 被销毁、旧 `withdraw` 是链下迁往 Raydium 的路径。访问于 2026-10-05。
2. **PRIMARY** 同一仓库 `README.md`。证明了 buy_v2/sell_v2、quote_mint 与 USDC 计价、PumpSwap 虚拟储备（2026-09-30 起可为负）、holder rewards、cashback 停止新建。
3. **PRIMARY** 同一仓库 `docs/PUMP_SWAP_README.md`。证明了 PumpSwap 是恒定乘积 AMM、canonical index=0、effective_quote_reserves 的定义、admin 可以 disable 操作。
4. **PRIMARY** 同一仓库 `docs/NEGATIVE_VIRTUAL_QUOTE_RESERVES.md`。证明了 i128 可为负，以及“有效储备永不为负”的保证。
5. **PRIMARY** 同一仓库 `docs/FEE_PROGRAM_README.md`。证明了按市值分档的动态费率在 2025-09-01 20:00 UTC 生效，以及市值计算公式。
6. **PRIMARY** 同一仓库 `docs/instructions/COIN_CREATION.md`。证明了 create_v2 的参数与长度上限、Token-2022 mint（decimals=6）、mint_authority PDA、Mayhem 账户、create+buy 可同一交易。
7. **PRIMARY** https://pump.fun/docs/fees （访问于 2026-10-05）。证明了创建免费、毕业 0.015 SOL、曲线 1.25% = 0.30/0.95/0、非 canonical 池 0.3%、USDC 自 2026-05-21 起可用、市值按 10 亿枚计。
8. **PRIMARY** https://pump.fun/docs/bonding-curve （访问于 2026-10-05）。证明了曲线是恒定乘积 AMM、毕业是自动且原子的、流动性归协议所有。
9. **PRIMARY（仅见搜索摘要，抓取失败）** https://pump.fun/docs/mayhem-mode 。证明了 Mayhem 是一个自主 AI 交易 agent，在币的前 24 小时交易，属于 Project Ascend。访问于 2026-10-05。
10. 二手：BloFin Academy《Mayhem Mode Supply Risk》《Coin Supply Is Not Fixed》。线索：Mayhem 币供应 20 亿、24 小时后销毁剩余、铸币权在创建交易内关闭。访问于 2026-10-05。
11. **PRIMARY（经二手转引）** @pumpdotfun 2025-03-20 推文，见 Bitget News / Cointelegraph 转引。证明了 PumpSwap 上线、迁移费从 6 SOL 降到 0、初始 PumpSwap 费率 0.25%（LP 0.20 + 协议 0.05）。访问于 2026-10-05。
12. **PRIMARY** Uniswap/v4-core @ `46c6834698c48bc4a463a86d8420f4eb1d7f3b75`，`src/libraries/Hooks.sol`。证明了 14 位权限标志、beforeSwap 返回 delta 的语义、动态费覆盖、地址有效性规则。
13. **PRIMARY** https://developers.uniswap.org/docs/protocols/v4/concepts/hooks （访问于 2026-10-05）。证明了 hook 按池在 initialize 时指定、权限编码在地址里、有 4 个 return-delta 权限。
14. **PRIMARY** https://developers.uniswap.org/docs/protocols/v4/concepts/architecture 与 get-started/concepts/hooks （访问于 2026-10-05）。证明了单例 PoolManager、建池只是状态更新、flash accounting（EIP-1153）、可用 custom curve 替代集中流动性曲线。
15. **PRIMARY** clanker-devco/DOCS @ `e533702c98f26de389e1188321e9b54c790d7cb7`：`references/core-contracts/v4.md`、`v4/mev-modules.md`、`v4/mev-modules/clankermevdescendingfees.md`、`general/creator-rewards-and-fees.md`。证明了全部供应进单边 v4 LP、协议取 LP fee 的 20%、四种 MEV 模块的参数。
16. **PRIMARY** Flaunch Docs：whitepaper、FAQ、auto-buybacks（docs.flaunch.gg，访问于 2026-10-05）。证明了 30 分钟固定价公平发射、募得 ETH 转为买墙、Progressive Bid Wall。
17. **PRIMARY** Zora Docs：docs.zora.co/coins、/coins/contracts/hook（访问于 2026-10-05）。证明了 v4 hook、Doppler 多曲线头寸、Sniper Tax 99%/10s、10 亿供应。
18. **PRIMARY** https://www.ponsfamily.com/docs/v2 （访问于 2026-10-05）。证明了每个 launch 有独立曲线合约、phantom quote、预留量公式、graduation executor 铸 full-range 头寸进 locker、LP 不可提取。
19. 二手：Bitquery Pons API 文档。证明了 Pons 的 5/7 vs 2/7 供应切分（与 [18] 的公式一致）。访问于 2026-10-05。
20. **PRIMARY（安全方）** SlowMist Hacked 2025-02-11 条目（hacked.slowmist.io）。证明了 four.meme 攻击原理是预建高价 PancakeSwap V3 池、项目方未校验价格。访问于 2026-10-05。
21. **PRIMARY（复现 PoC，含交易哈希）** SunWeb3Sec/DeFiHackLabs `src/test/2025-02/FourMeme_exp.sol`。证明了攻击步骤、sqrtPriceX96 被放大约 3.68e14 倍、24 BNB 时触发迁移、约 20 个币受害。
22. **PRIMARY（搜索摘要）** four.meme 创建页与代币页（four.meme/en/create-token、/en/token/0x86bb…）。证明了按计价资产设定的募资阈值（18 BNB、12,000 USDT 等）、旧 TST 代币为 24 BNB、Antisniper 开关。访问于 2026-10-05。
23. **PRIMARY（搜索摘要；站点 DNS 解析失败）** docs.4.meme/fees-rewards/fee-structure。证明了创建免费、首买收费、毕业后 LP fee 1%、LP 由曲线合约持有不可提取。
24. **PRIMARY** whetstoneresearch/doppler `docs/Doppler.md`（main 分支，访问于 2026-10-05）。证明了 Doppler 使用 afterInitialize / beforeSwap / afterSwap / beforeAddLiquidity 四个 hook，以及按 epoch 再平衡。
25. 二手数据：DefiLlama four.meme 页面。记录了两起事故（2025-02-11 $183K、2025-03-18 $80K）。访问于 2026-10-05。
26. 二手：AiCoin 关于 four.meme 2025-03-31 改用 PancakeSwap V2 并销毁 LP 的报道。
27. 用户资料：`2-meme-launchpad/benchmarks/solana-pumpfun.md`、`solana-baseline.md`（作者在 2026-09-06 对主网做的链上解码）。
28. 用户资料：`2-meme-launchpad/outputs/02-meme-launchpad-fundamentals.md`、`04-defects-and-optimizations.md`（设计方案与缺陷图谱）。

---

## 开放问题
1. USDC 计价曲线的 `initial_virtual_quote_reserves` 取值是多少？USDC 币的毕业阈值是多少？
2. 2026 年低 SOL 迁移（0.086 SOL）的机制：是 Mayhem agent 抽走了曲线 SOL，还是有其他曲线预设？需要拉一枚 Mayhem 币的完整交易序列。
3. PumpSwap `virtual_quote_reserves` 被启用、并在 2026-09-30 允许为负，动机是什么？是否在为“低真实储备毕业”的池子补价？
4. Mayhem 模式下“铸币权已关闭”与“额外铸 10 亿”的时序，需要读 Mayhem 程序或 mint 账户确认。
5. four.meme 2025-03-18 $80K 事件的技术细节，以及 04 资料里“Helper3 重入”的出处。
6. 有没有生产级产品真正实现了“hook 内曲线 + 就地翻转”？Doppler 结束后是否迁移（需要读 Airlock 源码）？
7. pump.fun 链上买入取整（+1）的一手源码：程序闭源，只有用户的解码与 IDL 可参考。

---

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| M1 | pump.fun 曲线是带虚拟（synthetic）储备的 Uniswap V2 式恒定乘积 | [1] PUMP_PROGRAM_README @cb188ce；[8] pump.fun/docs/bonding-curve（2026-10-05） | observed | |
| M2 | pump.fun Global 初始虚拟代币储备为 1,073,000,000 枚（raw 1073000000000000，6 位精度），不是 1,073,000,191 | [1]；[27] solana-pumpfun.md §1.1 链上解码 | observed | |
| M3 | 初始虚拟 SOL 储备为 30 SOL；曲线可售 793,100,000 枚；总供应 10 亿枚 | [1] Global 示例 | observed | |
| M4 | 经典曲线 k = 3.219e10 SOL·token，开盘价 2.7959e-8 SOL/token，开盘市值 27.96 SOL | 由 M2、M3 推出：k=30×1.073e9；P₀=30/1.073e9；×1e9 | inferred | |
| M5 | 售罄时真实募得 85.005 SOL，毕业市值 410.88 SOL，全程涨幅约 14.70× | 由 M2、M3 推出：vT_end=2.799e8，vS_end=k/vT_end=115.005，减去 30；与 [27] §1.7 整数模拟一致 | inferred | |
| M6 | “$69k 毕业”只是 SOL≈$167.93 时的美元换算，毕业线本身以 SOL/代币数量计 | 由 M5 推出：410.88×167.93≈69,000；[1] 毕业条件里没有价格项 | inferred | |
| M7 | 需要虚拟储备，是因为纯真实储备 x·y=k 的开盘价为 0，且最后一枚代币价格趋于无穷 | 由 M1 推出：x=0 时 P=0；y→0 时 P→∞；[8] 原文“solves the cold-start problem” | inferred | |
| M8 | 曲线极度前置倾斜：净入 30 SOL 时已卖出 53.65% 供应，最后 25 SOL 只卖出约 7.8% | [27] solana-pumpfun.md §1.8 阶梯表；可由 M4 公式复算 | observed | |
| M9 | 首块狙击是前置倾斜曲线的数学必然，不是治理问题 | 由 M8 推出：早期单位 SOL 换到的供应最多，抢到第一块的期望收益最高 | inferred | |
| M10 | 首笔总支出 1 SOL（1.25% 费）可买到约 34.2M 枚（3.42% 总供应），相对开盘价滑点约 +3.29% | 由 M4、M16 推出：入曲线 1/1.0125=0.987654 SOL，代入公式；与 [27] §1.9 一致 | inferred | |
| M11 | pump.fun 的 `complete` 在 buy 指令末尾 `real_token_reserves == 0` 时置 true，此后曲线不再交易 | [1] PUMP_PROGRAM_README “Bonding curve”节 | observed | |
| M12 | pump.fun 毕业条件是纯代币数量条件，程序内没有预言机，美元门槛随 SOL 汇率漂移 | 由 M11、M6 推出：条件只涉及 real_token_reserves | inferred | |
| M13 | four.meme 按计价资产设定募资阈值：18 BNB、12,000 USDT/USD1、60 NVDAB、650 GMEB 等 | [22] four.meme/en/create-token 页（搜索摘要，2026-10-05） | observed | |
| M14 | four.meme 的 BNB 阈值曾为 24 BNB（如 TST 代币），现为 18 BNB | [22] TST 代币页显示 24 BNB；创建页显示 18 BNB；[21] PoC 注释“reaches 24 BNB” | observed | |
| M15 | Pons V2 的池子预留量 = supply×phantomQuote/(phantomQuote+threshold)，只有阈值与虚拟储备的比值决定进池比例 | [18] ponsfamily.com/docs/v2（2026-10-05） | observed | |
| M16 | pump.fun 曲线阶段总费率 1.25% = 创作者 0.30% + 协议 0.95% + LP 0%，SOL 与 USDC 计价币相同 | [7] pump.fun/docs/fees（2026-10-05） | observed | |
| M17 | pump.fun 创建免费（0 SOL / 0 USDC），毕业收 0.015 SOL | [7]；[1] pool_migration_fee=15000001 lamports | observed | |
| M18 | 迁往 Raydium 时期迁移费为 6 SOL，2025-03-20 PumpSwap 上线后降为 0 | [11] @pumpdotfun 2025-03-20 推文（经 Bitget/Cointelegraph 转引） | observed | |
| M19 | 按市值分档的动态费率自 2025-09-01 20:00 UTC 起适用于曲线和 canonical PumpSwap 池 | [5] FEE_PROGRAM_README @cb188ce | observed | |
| M20 | 非 canonical PumpSwap 池费率 0.30% = LP 0.25% + 协议 0.05% | [7] | observed | |
| M21 | canonical 池档位：0–420 SOL 市值 125 bps，420 SOL 以上创作者分成跳到 95 bps 并逐档递减到 5 bps（共 25 档） | [27] solana-pumpfun.md §3.4 链上解码；[5] 只确认机制，档位图 fees.png 未逐项核对 | observed | |
| M22 | 公开 README 里 Global `fee_basis_points=100`、`creator_fee=0` 是旧快照，与现行 95+30 bps 不一致 | [1] Global 示例 vs [7] 费用页；[27] §1.1 链上读到 95 | observed | |
| M23 | 2026-05-21 起 pump.fun 支持 USDC 计价；BondingCurve 增加 quote_mint，字段改名为 virtual/real_quote_reserves | [7]；[2] README “New Bonding Curve Trade Instructions” | observed | |
| M24 | `create_v2` 使用 Token-2022 mint（decimals=6）并把元数据内嵌在 mint；name≤32、symbol≤13、uri≤200 | [6] COIN_CREATION.md @cb188ce | observed | |
| M25 | create 与首笔 buy 可放在同一笔交易，即 dev buy | [6] Rust SDK `create_v2_and_buy_instruction`；[27] §2.2 链上样例 | observed | |
| M26 | 免费创建流程中，coin 可由首个买家（user）代创作者（creator）上链，因此 creator 不必签名 | [1] create 指令说明 | observed | |
| M27 | `migrate` 无许可、幂等，任何人都可迁移已 complete 的曲线 | [1] | observed | |
| M28 | 迁移后 PumpSwap LP 全部销毁，pump.fun 自己也无法撤池 | [1] “LP tokens … are then burnt”；[27] §2.5 MintTo=Burn=133,094,492,867 | observed | |
| M29 | 迁移时进入 PumpSwap 的代币侧恒为 206,900,000 枚（1e9−7.931e8） | 由 M3 推出；[27] §2.6 三笔样本验证 | inferred | |
| M30 | 旧 `withdraw` 指令由链下服务器把曲线资金迁往 Raydium，现已禁用 | [1] withdraw 指令说明 | observed | |
| M31 | 2026-09 抽样到注入 SOL 仅 0.086 / 0.76 / 17.58 的迁移，经典“85 SOL”不再普遍成立 | 仅见于 [27] solana-pumpfun.md §2.6，未找到一手说明 | speculative | |
| M32 | Mayhem 模式让币以 20 亿枚供应启动，由 agent 交易 24 小时后销毁剩余，可解释抽样币供应 1.926B≠1B | [6] create_v2 含 is_mayhem_mode 与 Mayhem vault；[9] 官方摘要；[10] 二手给出 2B 数字 | inferred | |
| M33 | Mayhem agent 抽走曲线 SOL 是“低 SOL 毕业”的原因 | 无一手证据；仅由 M31、M32 推测，未验证 | speculative | |
| M34 | PumpSwap Pool 有 i128 `virtual_quote_reserves`，报价须用 vault+virtual；2026-09-30 起可为负 | [3] PUMP_SWAP_README；[4] NEGATIVE_VIRTUAL_QUOTE_RESERVES.md；[2] | observed | |
| M35 | pump.fun 新增 holder rewards coin，创作者费改为分给持有人；cashback 模式停止新建 | [2] README；[6] is_cashback_enabled 已弃用 | observed | |
| M36 | pump.fun mint authority 是程序 PDA `["mint-authority"]`；铸币权在创建交易内关闭 | [6] 只确认 PDA；“创建交易内关闭”仅见于 [10] BloFin，未找到一手来源 | speculative | |
| M37 | pump.fun 合约层没有反狙击机制，只有 max_sol_cost / min_sol_output 滑点保护 | [1] buy/sell 指令签名；文档未见任何开盘限制 | inferred | |
| M38 | four.meme 2025-02-11 损失约 $183K，原因是攻击者预建高价 PancakeSwap V3 池、迁移时未校验价格 | [20] SlowMist Hacked；[21] DeFiHackLabs PoC | observed | |
| M39 | four.meme 迁移调用的 amount0Min/amount1Min 为 0，约 20 个币以同一手法被攻击 | [21] PoC 注释；smartcontractshacking.com 复述 | observed | |
| M40 | 04-defects 写的“four.meme Helper3 重入被盗 $183K（违反 CEI）”与安全方复盘不符 | 04-defects-and-optimizations.md §3.1.1 vs [20][21] | observed | |
| M41 | 两阶段迁移的根本攻击面是“目标池可以被任何人抢先初始化” | 由 M38、M39 推出：攻击不依赖重入，只依赖外部池状态不可信 | inferred | |
| M42 | four.meme 毕业后 LP 由曲线合约持有不可提取；另有报道称 2025-03 起改为销毁，两说并存 | [23] docs.4.meme 摘要；[26] AiCoin 二手 | observed | |
| M43 | Uniswap v4 用单例 PoolManager，建池只是状态更新而不部署合约；flash accounting 基于 EIP-1153 | [14] Uniswap 文档 architecture | observed | |
| M44 | v4 hook 权限编码在地址最低 14 位：beforeSwap=1<<7，beforeSwapReturnDelta=1<<3；带 ReturnDelta 却没有对应动作位的地址无效 | [12] Hooks.sol @46c6834 | observed | |
| M45 | beforeSwap 可返回 delta 改写 swap 的 specified 数量（不得翻转 exactIn/Out），动态费池还可返回 LP fee 覆盖值 | [12] Hooks.beforeSwap 实现 | observed | |
| M46 | 用 beforeSwapReturnDelta 在 hook 内实现虚拟曲线、达标后翻转为普通池，在 v4 中技术上可行 | 由 M45、[14]“custom curves”推出 | inferred | |
| M47 | 目前没有已知生产产品采用“hook 内曲线 + 就地翻转”；Clanker/Zora/Flaunch 不设曲线，Pons V2 是曲线合约 + 毕业铸头寸 | 由 [15][16][17][18] 推出；未穷举检索，有漏检可能 | speculative | |
| M48 | Clanker v4 把全部供应放进单边 Uniswap v4 LP（initial LP），不设 bonding curve | [15] creator-rewards-and-fees.md @e533702 | observed | |
| M49 | Clanker 协议费固定为 LP fee 的 20%，例如创作者 1% 对应总费率 1.2% | [15] creator-rewards-and-fees.md | observed | |
| M50 | Clanker MEV 模块：2 区块延迟、狙击拍卖、抛物线衰减费（起始 ≤80%，时长 ≤2 分钟，推荐 80%→5%/30s），所有模块最晚 2 分钟失效 | [15] mev-modules.md、clankermevdescendingfees.md | observed | |
| M51 | Zora coin 用 v4 hook 加 Doppler 多曲线头寸发射，Sniper Tax 从 99% 起在 10 秒内衰减 | [17] docs.zora.co/coins | observed | |
| M52 | Flaunch 开盘 30 分钟单一 tick 固定价、只能买；结束后募得 ETH 变成 spot 下方的买墙，剩余代币转 full range | [16] Flaunch whitepaper/FAQ | observed | |
| M53 | Pons V2 每个 launch 有独立曲线合约；毕业由 graduation executor 把 full-range v4 头寸直接铸进 locker，任何人包括协议都无法提取 | [18] | observed | |
| M54 | 按资金路径可分三类：A 曲线→外部 DEX、B 曲线→自有/同计价资产池（原子执行、不经 Router）、C 不设曲线直接发 AMM 头寸 | 由 M30、M27、M38、M48、M52、M53 推出 | inferred | |
| M55 | 自建毕业目的地 AMM 能把迁移费变成平台收入并消除外部池攻击面 | 由 M18、M27、M41 推出：PumpSwap 免迁移费，canonical 池由程序原子创建 | inferred | |
| M56 | LP 销毁或锁死消灭了撤池 rug，但风险转为 dev 与内部人的持仓抛售 | 由 M25、M28 推出：dev 在最低价建仓且没有 vesting；[27] §2.8 | inferred | |
| M57 | 方案提出：内盘费用采用 pull 模式记账，以避免恶意创作者合约 revert 或重入 | 02-meme-launchpad-fundamentals.md §3.3.2 | observed | |
| M58 | 方案提出：所有除法偏向池子取整（进池向上、出池向下） | 02-meme-launchpad-fundamentals.md §4.1 | observed | |
| M59 | 方案声称 v4 hook 路径“资金从未离开 PoolManager、零夹子窗口”；该性质只在 hook 用 6909 claim 托管时成立，不是 v4 的固有性质 | 由 [12][14] 与 [18] 推出：Pons V2 资金先在曲线合约；02 §3.4.2 原文 | inferred | |
| M60 | 02-fundamentals 把 pump.fun 的“售罄”与 four.meme 的“$12K 等值”混写为同一个毕业条件，“1%、45/45/10”也不是 pump.fun 参数 | 02 §2.2 步骤三、§3.3.1 vs [1][7][22] | observed | |

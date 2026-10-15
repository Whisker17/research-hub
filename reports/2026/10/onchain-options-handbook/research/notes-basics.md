# Lane B 调研笔记：期权基础（onboarding）

- 范围：brief 研究问题 1——期权基础概念、合约规格字段、定价直觉（BS / Black-76、IV、smile/skew、期限结构、DVOL）、Greeks 与 delta 对冲、put-call parity 与静态复制、常见结构、保证金模型、期权与现货 / 永续 / 永续期权的风险形态差别；以及页面用的统一数值例子和代码片段。
- 不含：具体链上协议（另一路负责）。
- 资料截止：2026-10-16。Deribit 的实时数据抓取时间是 **2026-10-15 约 16:07–16:12 UTC**（取 API 返回的 `usIn` 时间戳）。
- **重要的方法说明**：本次运行环境**没有 shell/bash 工具**，所以 lane 要求“用 python3 计算并贴运行输出”这一点**没能执行**。下面所有数值都是用标准正态表加一阶插值**手算**的，期权价格误差约 ±0.05 USD，Greeks 误差在第 3–4 位有效数字。我做了三项独立交叉校验（见“命令与输出”）：①用同样的手算流程，复算了 Deribit 实时 ETH-30OCT26-2400-C 的 mark 价与 delta，与交易所返回值吻合到 0.02 USD / 1e-5；②Θ = −½σ²S²Γ 恒等式成立；③±10% 跳动的精确重估与 −½Γ(ΔS)² 近似一致。〔主会话补记 2026-10-16：§8 代码已用 python3 运行（research/scripts/bs.py），输出与手算全部一致到 0.01，包括 C2250/P2250 与 Deribit Black-76 复算 114.011。〕

---

## 1. 基本概念与合约规格字段

**答案**：call 是按执行价 K **买入**标的的权利，put 是按 K **卖出**的权利；买方（long/holder）付权利金、拿到权利，卖方（short/writer）收权利金、承担义务。到期 **payoff**：call 为 max(S_T−K,0)，put 为 max(K−S_T,0)；**PnL = payoff − 权利金**（不计融资），所以 long call 的盈亏平衡点是 K+premium，long put 是 K−premium。欧式只能在到期日行权，美式在到期前（含到期日）任何时候都能行权；两者都可以在到期前直接卖出平仓。一份合约至少要写清：标的、执行价、到期时刻（含时区）、行权方式、结算方式（现金 / 实物 / 结算成期货）、乘数、结算价（fixing）规则、公司行动调整规则。

**依据**：
- OIC：期权“conveys to its holder the right, but not the obligation, to buy (call) or sell (put) … at a specified price … on or before a given date”；卖方 “obligated to sell (call) or buy (put)”；股票期权通常一张对应 100 股；拆股、并购时可以调整合约规模、交割物和执行价；期权持有人不享受股东权利（分红、投票）[1]。
- OIC：买方的最大损失限于权利金；卖出 call 的损失“theoretically unlimited”，卖出 put 的损失“substantial” [1]。
- OIC：“American-style options can be exercised at any time … up to and including expiration day. European-style options can be exercised only at expiration”；美国大多数指数期权是欧式 [8]。
- 传统市场的规格样例：Cboe SPX 乘数为 100 [9]；Cboe 产品页写明 SPX 为 “cash settlement, European exercise” [9]（搜索摘要）。
- **Deribit（加密期权事实标准）**，逐项核实：
  - 欧式：inverse 期权“are European options, settled in the base currency (BTC or ETH)”；Linear USDC 期权“are European options, priced and settled in USDC”；两类都在到期时自动行权，到期前可以在市场上平仓 [10][11]。
  - 乘数：inverse 期权乘数为 1，即 1 张 = 1 BTC 或 1 ETH [10]。API 返回 ETH inverse 期权 `contract_size: 1.0`、`settlement_currency: "ETH"`、`instrument_type: "reversed"`；ETH_USDC 期权 `contract_size: 1.0`、`settlement_currency: "USDC"`、`instrument_type: "linear"` [15]。
  - 到期时刻 08:00 UTC：API 返回 ETH-16OCT26 系列的 `expiration_timestamp: 1792137600000`，即 2026-10-16 08:00:00 UTC [15]；Linear 规格页写 “Expiration dates: Daily at 8:00 AM UTC” [11]。
  - 结算价：“time-weighted average of Deribit index as measured between 07:30 and 08:00 UTC” [11][14]；Deribit 指数每 4 秒算一次，结算价是到期前 30 分钟共 450 个指数值的时间加权平均 [14]（搜索摘要）。API 显示 eth_usd 每天都有一个 delivery price，例如 2026-10-15 为 2371.59 [16]。
  - **2026 年的变化（需要更新常识）**：自 2026 年 4 月初起 linear USDC 期权、自 **2026-08-01** 起 inverse 期权，价内（ITM）期权到期时**先按执行价实物交割成同到期日的期货**，该期货再按同一个 30 分钟 TWAP 现金结算；Deribit 称这“completes the change of all Deribit options from cash settled options to futures settled options”，但盈亏金额与结算币种不变，“从交易者角度仍可视为现金结算” [12][13][10][11]。
- Deribit 期权按 coin 计价（inverse，例如 mark 0.0467 ETH），Greeks 以 USD 返回；`interest_rate: 0.0`；`underlying_price` 是对应到期日的期货 / 合成远期价（例如 ETH-27NOV26 为 2452.53，指数为 2441.3） [20]。

**不确定之处**：
- CME 期权规格页（Ether options on futures）两次抓取都超时，没能核到 CME 页面原文。所以本节传统市场的例子改用 Cboe SPX 与 OIC。CME 期权的行权方式、结算细节**未核实**。
- OCC《Characteristics and Risks of Standardized Options》（ODD）抓取返回 403；公司行动调整的细则只引用了 OIC 的概述 [1]。
- Deribit support 站点（support.deribit.com）直接抓取返回 403，/kb 页面是前端渲染、无法抽取。[10][11][14][21][22] 的原文都来自搜索引擎返回的官方页面摘要，[12] 已全文抓取。

---

## 2. 定价直觉：BS / Black-76、IV、smile/skew、期限结构、DVOL

**答案**：Black-Scholes（1973）用 S、K、T、r、σ 给欧式期权定价；Black-76 把 S 换成到期日对应的远期 / 期货价 F，再用 e^{−rT} 折现，是加密期权（以期货 / 远期为标的）的实际工作模型。期权价 = 内在价值 + 时间价值。IV 是让模型价格等于市场价格时反解出的 σ。历史 / 实现波动率是已发生价格变动的年化标准差。IV 随执行价变化（smile/skew）、随期限变化（期限结构）。2026-10-15 的 ETH DVOL（30 天 IV 指数）约 52，BTC 约 39；同一时点 Deribit 的 ETH 历史波动率约 43–45。

**依据**：
- BS 原文：Black & Scholes, JPE 81(3):637–654, 1973 [27]。Black-76：Black, “The pricing of commodity contracts”, JFE 3:167–179, 1976 [28]（只核了书目，未读原文）。
- OIC：BS 的输入为标的价、执行价、剩余期限（年化）、无风险利率、波动率（年化标准差）；“Historical volatility … annualized standard deviation of … daily price changes”；“Implied Volatility … how much the marketplace expects the asset price to move based on the price of the option” [2]。
- 公式（r 为连续复利、无分红）：
  - BS：C = S·N(d1) − K·e^{−rT}·N(d2)，P = K·e^{−rT}·N(−d2) − S·N(−d1)，d1 = [ln(S/K)+(r+σ²/2)T]/(σ√T)，d2 = d1 − σ√T。
  - Black-76：C = e^{−rT}[F·N(d1) − K·N(d2)]，d1 = [ln(F/K)+σ²T/2]/(σ√T)。r=0 且 F=S 时两者相同。
- **Deribit 的 mark 与 Black-76 一致（复算）**：取 ETH-30OCT26-2400-C，F=2444.4（API `underlying_price`），mark_iv=46.53%，T=14.66 天，r=0。手算 Black-76 得 d1=0.2432，N(d1)=0.59608，价格 114.03 USD；API 返回 delta 0.59608、mark 0.0467 ETH × 2441.3 = 114.01 USD [20]（详见“命令与输出”C3）。
- **Smile/skew 与期限结构（2026-10-15 ~16:12 UTC 的 Deribit 实时快照）** [20]：
  - ETH-27NOV26（约 42.7 天，F=2452.53）：2000P（delta −0.124）mark_iv 56.36%；2400C（近 ATM，delta 0.584）49.71%；3000C（delta 0.151）52.47%。两翼都高于 ATM（smile），下行翼更高（put skew）。
  - 近 ATM 的 2400C 期限结构：30OCT26 为 46.53%，27NOV26 为 49.71%，25DEC26 为 50.58%，向上倾斜。
- **DVOL**：Deribit 用相关到期日的 IV smile 合成“30 day annualised implied volatility”。方法：取 30 天两侧最近的两个到期日，舍弃价内期权和 |delta|<5% 的远虚值期权，按 variance swap 方法算出两个到期日的方差，插值到 30 天后开方，再做平滑。粗略换算：日波动 ≈ DVOL/√365（经验法则是除以 20） [17]。
- **DVOL 近 30 天量级**（API 日线，2026-09-16 至 2026-10-15，10-15 为截至 ~16:07 UTC 的盘中值） [18]：
  - ETH DVOL：最新 52.01；区间最低 46.81（10-07 日内），最高 55.19（09-16）。
  - BTC DVOL：最新 39.04；区间 33.09（09-17）–40.10（10-15）。
  - 对照：2025 年同期（2025-09-17 至 2025-10-16）ETH DVOL 在 60–74 之间 [18]（同一 API）。
- ETH 历史波动率（Deribit `get_historical_volatility`，小时序列）：2026-10-15 前后在 42.4–44.9 之间 [19]。IV（≈52）高于近期 HV（≈44）。
- ETH 指数 2441.28（2026-10-15 ~16:07 UTC） [33]。所以示例里的 S=2500、σ=60% 是“接近现实、波动率偏高”的教学参数。

**不确定之处**：
- Deribit `get_historical_volatility` 没有在 API 返回中说明回看窗口长度，HV 数值只能当量级参考。
- skew 快照只取了 3 个执行价、1 个时点，只够画示意图，不能当统计结论。
- Black-76 原文未读，书目来自 DOI（DOI 页面返回 406）。

---

## 3. Greeks 与 delta 对冲 / gamma scalping

**答案**：Delta = ∂V/∂S，Gamma = ∂²V/∂S²，Vega = ∂V/∂σ，Theta = ∂V/∂t，Rho = ∂V/∂r。在 BS 世界（r=0）里 Θ = −½σ²S²Γ，所以 delta 对冲后的期权头寸单步盈亏 ≈ ½Γ(ΔS)² + Θ·Δt = ½ΓS²[(ΔS/S)² − σ_impl²Δt]。也就是说，**long gamma 赚的是“实现波动 > 隐含波动”的差，short gamma 反之**。delta-neutral 只消掉一阶价格风险，Gamma（跳跃）、Vega（IV 变化）、离散对冲误差、交易成本、基差和流动性风险都还在，所以 ≠ 无风险。

**依据**：
- OIC 的单位约定：Vega 是“1% change in volatility”对应的价值变化；Theta 是“one day reduction”对应的变化；Rho 是“1% change in the interest rate”对应的变化；Gamma 是标的变动 1 单位时 Delta 的变化 [2]。Deribit API 的 vega/theta 也按“每 1 vol 点 / 每天、以 USD 计”返回（例如 ETH-27NOV26-2400-C vega 3.27、theta −1.905） [20]。
- Θ = −½σ²S²Γ（r=0）由 BS 偏微分方程 Θ + ½σ²S²Γ + rSΔ − rV = 0 在 r=0 时直接得出 [27]；本例的数值验证见 C2。
- **示例（S=2500，K=2500，T=30/365，σ=60%，r=0）**：卖 1 张 ATM call（收 171.35），买 0.5343 ETH 做 delta 对冲；然后标的瞬间跳 ±10%：

  | 情景 | call 新价 | 期权盈亏（空头） | 对冲盈亏 | 合计 | −½Γ(ΔS)² 近似 |
  |---|---|---|---|---|---|
  | S→2750 | 331.76 | −160.41 | +133.57 | **−26.84** | −28.88 |
  | S→2250 | 67.29 | +104.06 | −133.57 | **−29.51** | −28.88 |

  卖方每天收到的 theta 约 +2.85 USD。日内盈亏平衡的波动幅度 ΔS* = √(2Θ_day/Γ) = √(2×2.849/0.00092426) ≈ 78.5 USD ≈ 3.14% = σ/√365。一次 10% 的跳动造成约 27–30 USD 的 gamma 损失，相当于约 10 天的 theta 收入。
- Deribit 实时 Greeks 的量级可做对照：ETH-27NOV26-2400-C gamma 9.4e−4、vega 3.27 [20]，与本例同一量级。

**不确定之处**：PnL ≈ ½Γ(ΔS)² − θ 的“实现 vs 隐含”表述是标准推导（由 BS PDE 推出），没有单独的一手出处；台账里标为 inferred。

---

## 4. Put-call parity 与静态复制、与 DeFi 借贷的联系

**答案**：同一标的、同一执行价、同一到期日的欧式期权（无分红）满足 **C − P = S − K·e^{−rT}**；以远期表示为 C − P = e^{−rT}(F − K)。所以：long call = long put + 现货 − 借入 PV(K)（即“现货 + 保护性 put”减去现金）；long put = long call − 现货 + 存出 PV(K)；合成多头 = long call + short put（同 K）。Merton（1974）把公司债看成期权：**风险债务价值 = 无风险债务价值 PV(K) − 以公司资产为标的、执行价为面值 K 的 put**；股权 = 资产上的 call。这可以类比到 DeFi 超额抵押借贷：出借方≈无风险贷款 + short put（抵押物不足时承担损失），借款人≈持有抵押物上的 call。清算机制让这个 put 更接近“障碍式”结构。

**依据**：
- Stoll（1969）系统研究了 put 与 call 价格之间的关系 [29]。Merton（1974）基于 Black-Scholes 框架给公司债定价 [30]。BS 原文摘要也说“almost all corporate liabilities can be viewed as combinations of options” [27]。
- 数值核对（r=0）：C2500 − P2500 = 171.35 − 171.35 = 0 = S − K；C2750 − P2750 = 81.76 − 331.76 = −250 = 2500 − 2750 ✓（见 §5 表）。
- Black 对称性的旁证：C(S=2750,K=2500) = P(S=2500,K=2750) = 331.76（r=0 时成立；见 C4）。

**不确定之处**：Stoll 原文针对的是当时的美国 OTC 期权，parity 的精确形式（欧式、无分红、连续复利）是后来的教科书写法；Stoll 与 Merton 的原文我没有通读，只核实了书目和摘要。DeFi 借贷 ≈ short put 的类比是推论：清算阈值、清算罚金、预言机延迟会让真实头寸偏离欧式 put。

---

## 5. 常见结构与统一数值例子

参数：S0=2500，T=30 天（30/365），σ=60%，r=0。价格与 Greeks（手算，已由主会话 python 运行确认一致）：

| 合约 | 价格 | Delta | Gamma | Vega/1vol点 | Theta/天 | Rho/1% |
|---|---|---|---|---|---|---|
| C2500 | 171.35 | 0.5343 | 0.000924 | 2.849 | −2.849 | 0.957 |
| P2500 | 171.35 | −0.4657 | 0.000924 | 2.849 | −2.849 | −1.098 |
| C2750 | 81.76 | 0.3199 | 0.000831 | 2.563 | −2.563 | 0.590 |
| P2750 | 331.76 | −0.6801 | 0.000831 | 2.563 | −2.563 | −1.670 |
| C2250（补充，用于 collar/strangle） | 317.29 | 0.7576 | 0.000727 | 2.240 | −2.240 | 1.296 |
| P2250（补充） | 67.29 | −0.2424 | 0.000727 | 2.240 | −2.240 | −0.553 |

注：本组参数下 Vega/点 与 |Theta/天| 数值恰好相等，这是巧合：r=0 时比值 = σ·100/(2·365T)，当 σ=0.6、T=30/365 时等于 1。页面上应注明，避免读者误以为两者恒等。

**到期 PnL 表（每单位 ETH，USD）**：

| S_T | Long C2500 | Short C2500 | Long P2500 | Long C2750 | Protective put（ETH+P2500） | Covered call（ETH−C2750） | Cash-secured put（−P2500） | Collar A（ETH+P2500−C2750） | Collar B（ETH+P2250−C2750） | Bull call 2500/2750 | Long straddle 2500 | Long strangle 2250/2750 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1500 | −171.35 | 171.35 | 828.65 | −81.76 | −171.35 | −918.24 | −828.65 | −89.59 | −235.53 | −89.59 | 657.30 | 600.95 |
| 1750 | −171.35 | 171.35 | 578.65 | −81.76 | −171.35 | −668.24 | −578.65 | −89.59 | −235.53 | −89.59 | 407.30 | 350.95 |
| 2000 | −171.35 | 171.35 | 328.65 | −81.76 | −171.35 | −418.24 | −328.65 | −89.59 | −235.53 | −89.59 | 157.30 | 100.95 |
| 2250 | −171.35 | 171.35 | 78.65 | −81.76 | −171.35 | −168.24 | −78.65 | −89.59 | −235.53 | −89.59 | −92.70 | −149.05 |
| 2500 | −171.35 | 171.35 | −171.35 | −81.76 | −171.35 | 81.76 | 171.35 | −89.59 | 14.47 | −89.59 | −342.70 | −149.05 |
| 2750 | 78.65 | −78.65 | −171.35 | −81.76 | 78.65 | 331.76 | 171.35 | 160.41 | 264.47 | 160.41 | −92.70 | −149.05 |
| 3000 | 328.65 | −328.65 | −171.35 | 168.24 | 328.65 | 331.76 | 171.35 | 160.41 | 264.47 | 160.41 | 157.30 | 100.95 |
| 3250 | 578.65 | −578.65 | −171.35 | 418.24 | 578.65 | 331.76 | 171.35 | 160.41 | 264.47 | 160.41 | 407.30 | 350.95 |
| 3500 | 828.65 | −828.65 | −171.35 | 668.24 | 828.65 | 331.76 | 171.35 | 160.41 | 264.47 | 160.41 | 657.30 | 600.95 |

payoff（不含权利金）：call = max(S_T−K,0)，put = max(K−S_T,0)。例如 C2500 的 payoff 依次为 0,0,0,0,0,250,500,750,1000；P2500 为 1000,750,500,250,0,0,0,0,0。

**盈亏平衡与极值（到期）**：

| 结构 | 盈亏平衡 | 最大损失 | 最大收益 |
|---|---|---|---|
| Long C2500 | 2671.35 | 171.35 | 无上限 |
| Long P2500 | 2328.65 | 171.35 | 2328.65（S_T=0） |
| Short C2500（裸卖） | 2671.35 | 无上限 | 171.35 |
| Protective put（现货 2500 + P2500） | 2671.35 | 171.35 | 无上限 |
| Covered call（现货 2500 − C2750） | 2418.24 | 2418.24（S_T=0） | 331.76 |
| Cash-secured put（−P2500 + 2500 现金） | 2328.65 | 2328.65（S_T=0） | 171.35 |
| Collar A（+P2500 −C2750，净付 89.59） | 2589.59 | 89.59 | 160.41 |
| Collar B（+P2250 −C2750，净收 14.47） | 2485.53 | 235.53 | 264.47 |
| Bull call spread 2500/2750（净付 89.59） | 2589.59 | 89.59 | 160.41 |
| Long straddle 2500（付 342.70） | 2157.30 / 2842.70 | 342.70 | 无上限（下行到 S_T=0 为 2157.30） |
| Long strangle 2250/2750（付 149.05） | 2100.95 / 2899.05 | 149.05 | 无上限 |

**可以直接用于页面的“等价”事实（由 parity 推出，表中逐行可验证）**：
- Covered call（现货 + short C2750）的每一行都等于 short P2750 的 PnL（收 331.76 − max(2750−S_T,0)）。OIC 把 covered call 与 cash-secured put 列为“Comparable Position”，并称风险曲线“identical” [3][4]。
- Protective put（现货 + P2500）的 PnL 列与 long C2500 完全相同（r=0、K=S0 时；r>0 时差一个 K(1−e^{−rT}) 的利息项）。
- 执行价与 S0 相同的 collar（Collar A）与同执行价的 bull call spread 完全相同。

OIC 公式核对：covered call 最大收益 = 执行价 − 买入价 + 权利金，最大损失 = 买入价 − 权利金，盈亏平衡 = 买入价 − 权利金 [3]；cash-secured put 最大收益 = 权利金，最大损失 = 执行价 − 权利金，盈亏平衡 = 执行价 − 权利金 [4]；collar 最大收益 = call 执行价 − 买入价 ∓ 净权利金，最大损失 = 买入价 − put 执行价 ± 净权利金 [5]；bull call spread 最大收益 = 高执行价 − 低执行价 − 净付出，最大损失 = 净付出，盈亏平衡 = 低执行价 + 净付出 [6]；long straddle 最大损失 = 两份权利金，盈亏平衡 = 执行价 ± 权利金合计 [7]。上表逐项符合这些公式。

**不确定之处**：OIC 的 protective put 页面 URL（/protective-put）返回 404，现行页面名是 protective-put-married-put（collar 页面里有链接），我没有单独抓取。

---

## 6. 保证金：全额抵押 / 标准保证金 / 组合保证金

**答案**：
- **全额抵押**：买方付全额权利金；卖方锁定最大可能支付。现金结算 put 最多锁 K；call spread 锁 K2−K1；裸卖 call 的最大支付没有上限，只能锁标的本身（covered）。
- **标准保证金（strategy/position based）**：每个头寸按固定公式单独计算后加总，不承认头寸之间的对冲。
- **组合保证金（PM）**：在一组价格 × 波动率情景下重估整个组合，取最坏损失，再加各类附加项。资本效率更高，但依赖模型和情景选择。

卖方风险大，是因为损失理论上无上限（call）或很大（put），而且是负 gamma，跳跃时损失呈平方级放大（见 §3）。

**依据**：
- Cboe：strategy-based 保证金“regardless of what other offsetting positions are held”；portfolio margining 按“greatest projected net loss … using multiple pricing scenarios”定保证金；框架是 OCC 的 TIMS，经纪商必须使用 OCC 每日公布的理论价 [24]。
- OCC STANS（2006 年 8 月起）用基于整个组合的 Monte Carlo 模拟计算清算会员的日保证金 [25]（搜索摘要；原页 403）。
- CME SPAN：情景式“scan risk”，多数交易所用 16 个情景，并对深度虚值空头期权设置极端情景 [26]（搜索摘要；PDF 抓取超时）。
- Deribit 标准保证金（inverse 期权，按币计）：long 只付权利金；**short call IM = max(0.15 − max((K−Index)/Index,0), 0.1) + 期权 mark**；short put IM = max(max(0.15 − OTM/Index, 0.1) + mark, MM)；short call MM = 0.075 + mark [21]。示例推算：卖 1 张本例 ATM call（mark 171.35/2500 = 0.0685 ETH），IM ≈ 0.2185 ETH ≈ 546 USD，约为所收权利金的 3.2 倍。
- Deribit 组合保证金（KB，2026-10-12 更新）：两种模式（S:PM / X:PM）；价格区间例如 ±16%，分 9 个等距档；每档跑 vol up/same/down 三种情景；另有扩展表（−66%、−33%、+50%…+500%，只用 vol up、只计部分 PnL、带 dampener）；再加 delta shock 和 roll shock；MM = IM × 0.80 [22]。较早的 PME 文档写的是 BTC/ETH ±15%、vol up 45% / down 30%、IM = 120% × MM [23]，参数已随版本变化。

**不确定之处**：Deribit 当前 PM 的具体参数（price range、vol range）按币种在“margin page”上动态公布 [22]，我没有取到现值；“±16%”是官方文档里的举例。“546 USD”是把 inverse 公式套到本例的推算，没有调用 Deribit 的保证金 API。

---

## 7. 期权 vs 现货 / 永续 / 链上原生变体

**答案**：
- 现货、永续是线性敞口（delta≈1，gamma=0）。永续用 funding 把 mark 拉向 index；long 期权是凸性敞口（gamma>0），代价是 theta（时间价值逐日流失）。
- **Everlasting option**（Paradigm，2021-05）：机制与永续相同，只是 funding = mark − 当前 payoff。它等价于一个持续滚动的期权组合：下一个 funding 时点到期的 ½ 份、再下一个的 ¼ 份、⅛ 份……总数为 1。
- **Power perpetual**（Paradigm，2021-08）：以 ETH^p 为 index 的永续，funding（“premium yield”）= mark − ETH^p；p>1 时具有正凸性，不需要执行价和到期日。ETH² 版本叫 “squeeth”，gamma 恒定。

**依据**：Paradigm 的永续说明：funding = mark − index，long 付给 short [31]；everlasting 的 funding 与等价组合 [31]；power perp 的定义、premium yield、squeeth 恒定 gamma、Opyn 联系方式 [32]。期权 theta 为负、卖方受益于时间流逝，见 OIC [2][3]。

**不确定之处**：Paradigm 两篇文章的发布日期取自 URL 路径（/2021/05、/2021/08），作者署名没有在抽取文本中出现，未核实。

---

## 8. 代码片段（Python；主会话 2026-10-16 已运行，文件 research/scripts/bs.py）

```python
from math import log, sqrt, exp, erf, pi

def N(x):  # standard normal CDF
    return 0.5 * (1.0 + erf(x / sqrt(2.0)))

def n(x):  # standard normal PDF
    return exp(-0.5 * x * x) / sqrt(2.0 * pi)

def bs(S, K, T, r, sigma, kind="call"):
    """European Black-Scholes (no dividends). T in years.
    Greeks: vega per 1 vol point, theta per calendar day, rho per 1% rate."""
    sqT = sqrt(T)
    d1 = (log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * sqT)
    d2 = d1 - sigma * sqT
    df = exp(-r * T)
    if kind == "call":
        price = S * N(d1) - K * df * N(d2)
        delta = N(d1)
        theta = -S * n(d1) * sigma / (2 * sqT) - r * K * df * N(d2)
        rho = K * T * df * N(d2)
    else:
        price = K * df * N(-d2) - S * N(-d1)
        delta = N(d1) - 1.0
        theta = -S * n(d1) * sigma / (2 * sqT) + r * K * df * N(-d2)
        rho = -K * T * df * N(-d2)
    gamma = n(d1) / (S * sigma * sqT)
    vega = S * n(d1) * sqT
    return {"price": price, "delta": delta, "gamma": gamma,
            "vega": vega / 100, "theta": theta / 365, "rho": rho / 100}

def black76(F, K, T, r, sigma, kind="call"):
    sqT = sqrt(T)
    d1 = (log(F / K) + 0.5 * sigma**2 * T) / (sigma * sqT)
    d2 = d1 - sigma * sqT
    df = exp(-r * T)
    if kind == "call":
        return df * (F * N(d1) - K * N(d2))
    return df * (K * N(-d2) - F * N(-d1))

def implied_vol(price, S, K, T, r, kind="call", lo=1e-4, hi=5.0):
    for _ in range(100):  # bisection: price is monotone increasing in sigma
        mid = 0.5 * (lo + hi)
        if bs(S, K, T, r, mid, kind)["price"] > price:
            hi = mid
        else:
            lo = mid
    return 0.5 * (lo + hi)

def payoff(kind, K, ST):
    return max(ST - K, 0.0) if kind == "call" else max(K - ST, 0.0)

if __name__ == "__main__":
    S, T, r, vol = 2500.0, 30 / 365, 0.0, 0.60
    for K in (2500, 2750):
        for kind in ("call", "put"):
            g = bs(S, K, T, r, vol, kind)
            print(K, kind, {k: round(v, 4) for k, v in g.items()})
    c = bs(S, 2500, T, r, vol)["price"]
    print("IV round-trip:", round(implied_vol(c, S, 2500, T, r), 4))
    # delta-hedged short ATM call, instantaneous ±10% jump
    g0 = bs(S, 2500, T, r, vol)
    for S1 in (2750.0, 2250.0):
        c1 = bs(S1, 2500, T, r, vol)["price"]
        pnl = -(c1 - g0["price"]) + g0["delta"] * (S1 - S)
        print(S1, round(pnl, 2), round(-0.5 * g0["gamma"] * (S1 - S) ** 2, 2))
```

**运行输出（主会话 2026-10-16 `python3 research/scripts/bs.py`，与手算一致；price 实际为 171.3485 / 81.7565 / 331.7565）**：
```
2500 call {'price': 171.35, 'delta': 0.5343, 'gamma': 0.0009, 'vega': 2.8488, 'theta': -2.8488, 'rho': 0.957}
2500 put  {'price': 171.35, 'delta': -0.4657, 'gamma': 0.0009, 'vega': 2.8488, 'theta': -2.8488, 'rho': -1.0978}
2750 call {'price': 81.76, 'delta': 0.3199, 'gamma': 0.0008, 'vega': 2.5626, 'theta': -2.5626, 'rho': 0.5901}
2750 put  {'price': 331.76, 'delta': -0.6801, 'gamma': 0.0008, 'vega': 2.5626, 'theta': -2.5626, 'rho': -1.6702}
IV round-trip: 0.6
2750.0 -26.84 -28.88
2250.0 -29.51 -28.88
```

---

## 外部调研 / 用户资料中被修正的地方

1. **lane-B 的前提“Deribit 期权现金结算”需要更新**：自 2026 年 4 月（linear USDC）和 2026-08-01（inverse）起，Deribit 的 ITM 期权到期时先按执行价**实物交割成同到期日的期货**，再按同一个 07:30–08:00 UTC 30 分钟 TWAP 现金结算。官方说法是“futures settled options”，经济上等价于现金结算 [12][13]。欧式、08:00 UTC、30 分钟 TWAP、币本位或 USDC 结算这几项都核实无误 [10][11][15]。
2. **lane-B 写的“Merton 1974：债权 = K − put”缺了折现**：应为 **债务价值 = K·e^{−rT} − Put(V, K, T)**，即无风险债务的现值减去以公司资产为标的的 put [30]。
3. **外部调研把 optionseducation.org 称为“OCC 的期权教育材料”**：该网站属于 Options Industry Council（OIC，由 OCC 资助），引用时应写 OIC。外部调研对 covered call、Greeks 的内容表述与 OIC 原文一致 [1][2][3]。
4. 外部调研完全没有提 Deribit 的结算机制、DVOL 量级，也没有提到“covered call 与 cash-secured put 风险曲线相同”这一 OIC 原文结论 [3][4]。这些不算错误，是本路补充的内容。
5. 外部调研引用 CME QuikVol FAQ，证明“CME 用 Black-76 定价欧式期权”。该页面本次无法访问，**未核实**，不要沿用这条引用；改用 Deribit 实时 mark 与 Black-76 一致这一复算证据（C3）。
6. 外部调研的小例子（110 call，权利金 5，盈亏平衡 115；covered call 在 50 时亏 45）算术正确。

---

## 来源

1. **PRIMARY** OIC, “Options Basics” — 定义 call/put、权利与义务、100 股乘数、拆股 / 并购调整、买方损失限于权利金、卖出 call 损失理论上无上限。https://www.optionseducation.org/optionsoverview/options-basics （访问 2026-10-16）
2. **PRIMARY** OIC, “Volatility & the Greeks” — HV / IV 定义、BS 输入、各 Greek 的定义与单位（vega 每 1%、theta 每天、rho 每 1%）。https://www.optionseducation.org/advancedconcepts/volatility-the-greeks （2026-10-16）
3. **PRIMARY** OIC, “Covered Call (Buy/Write)” — 最大收益 / 损失 / 盈亏平衡公式；Comparable Position 为 cash-secured put。https://www.optionseducation.org/strategies/all-strategies/covered-call-buy-write （2026-10-16）
4. **PRIMARY** OIC, “Cash-Secured Put” — 公式；“risk profile that is identical to the covered call”。https://www.optionseducation.org/strategies/all-strategies/cash-secured-put （2026-10-16）
5. **PRIMARY** OIC, “Collar (Protective Collar)” — collar 最大收益 / 损失公式。https://www.optionseducation.org/strategies/all-strategies/collar-protective-collar （2026-10-16）
6. **PRIMARY** OIC, “Bull Call Spread” — 价差公式。https://www.optionseducation.org/strategies/all-strategies/bull-call-spread-debit-call-spread （2026-10-16）
7. **PRIMARY** OIC, “Long Straddle” — 最大损失 = 两份权利金，盈亏平衡 = K ± 权利金。https://www.optionseducation.org/strategies/all-strategies/long-straddle （2026-10-16）
8. **PRIMARY** OIC, “What is the difference between American-style and European-style options?”（2020-03）— 两种行权方式的定义。https://www.optionseducation.org/news/what-is-the-difference-between-american-style-and （2026-10-16）
9. **PRIMARY** Cboe, SPX Product Specifications — 乘数 100、交易时段；产品页摘要写明欧式、现金结算。https://www.cboe.com/en/tradable-products/sp-500/spx-options/spx-specifications/ （2026-10-16）
10. **PRIMARY** Deribit KB, “Inverse Options” — 欧式、以 base currency 结算、乘数 1、2026-08-01 起结算成期货、short call/put 保证金公式（搜索摘要，原页无法直接抽取）。https://www.deribit.com/kb/options ；https://support.deribit.com/hc/en-us/articles/31424939096093-Inverse-Options （2026-10-16）
11. **PRIMARY** Deribit KB, “Linear USDC Options”（2026-09-15 更新）— 欧式、USDC 计价与结算、delivery price = 07:30–08:00 UTC 指数 TWAP、2026 年 4 月起结算成期货（搜索摘要）。https://support.deribit.com/hc/en-us/articles/31424932728093-Linear-USDC-Options （2026-10-16）
12. **PRIMARY** Deribit Insights, “Change To Inverse Option Delivery Process”（2026-06-24）— inverse 期权自 2026-08-01 起结算成期货；同一 30 分钟 TWAP；盈亏不变（已全文抓取）。https://insights.deribit.com/exchange-updates/change-to-inverse-option-delivery-process （2026-10-16）
13. **PRIMARY** Deribit Insights, “Change To Option Delivery Process”（2026）— “All options on Deribit up to this point have been cash settled”；先在 linear 上推行（搜索摘要）。https://insights.deribit.com/exchange-updates/change-to-option-delivery-process （2026-10-16）
14. **PRIMARY** Deribit Support, “Settlement” / “Features” — 08:00 UTC 到期品种的 delivery price 为 07:30–08:00 的 30 分钟 TWAP；指数每 4 秒一次，共 450 个点（搜索摘要；原页 403）。https://support.deribit.com/hc/en-us/articles/29734325712413-Settlement ；https://support.deribit.com/hc/en-us/articles/25944687755293-Features （2026-10-16）
15. **PRIMARY** Deribit API `public/get_instruments`（ETH 与 USDC，kind=option）— contract_size、settlement_currency、expiration_timestamp=1792137600000（08:00 UTC）。https://www.deribit.com/api/v2/public/get_instruments?currency=ETH&kind=option&expired=false （2026-10-15 ~16:07 UTC）
16. **PRIMARY** Deribit API `public/get_delivery_prices`（eth_usd）— 每日 delivery price，例如 2026-10-15 为 2371.59。https://www.deribit.com/api/v2/public/get_delivery_prices?index_name=eth_usd&offset=0&count=5 （2026-10-15）
17. **PRIMARY** Deribit Insights, “DVOL – Deribit Implied Volatility Index” — 30 天 IV 指数的方法（variance swap、两个到期日插值、5% delta 截断）与 /√365 换算。https://insights.deribit.com/exchange-updates/dvol-deribit-implied-volatility-index （2026-10-16）
18. **PRIMARY** Deribit API `public/get_volatility_index_data`（ETH/BTC，1D，2026-09-16 至 2026-10-15；另取 2025 年同期）— DVOL 日线 OHLC。https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=ETH&start_timestamp=1789516800000&end_timestamp=1792108800000&resolution=1D （2026-10-15）
19. **PRIMARY** Deribit API `public/get_historical_volatility?currency=ETH` — 小时级 HV 序列，约 42–45%。（2026-10-15）
20. **PRIMARY** Deribit API `public/ticker`：ETH-27NOV26-2000-P / 2400-C / 3000-C、ETH-30OCT26-2400-C、ETH-25DEC26-2400-C — mark_iv、Greeks、underlying_price（timestamp 1792080719981 ≈ 2026-10-15 16:12 UTC）。https://www.deribit.com/api/v2/public/ticker?instrument_name=ETH-27NOV26-2400-C （2026-10-15）
21. **PRIMARY** Deribit Support, “Standard Margin”（2026-09-28 更新）与 inverse 期权规格 — 每个头寸单独计算后加总；short option IM/MM 公式（搜索摘要）。https://support.deribit.com/hc/en-us/articles/25944811528477-Standard-Margin （2026-10-16）
22. **PRIMARY** Deribit Support, “Portfolio Margin”（2026-10-12 更新）— S:PM / X:PM、9 档价格、vol 三情景、扩展表、delta/roll shock、MM=0.8×IM（搜索摘要）。https://www.deribit.com/kb/portfolio-margin ；https://statics.deribit.com/files/CrossPortfolioMarginGuide.pdf （2026-10-16）
23. **PRIMARY**（旧版）Deribit, “Portfolio Margin Engine” PDF — 旧参数：±15%、vol up 45% / down 30%、IM=120%×MM（搜索摘要）。https://statics.deribit.com/files/DeribitPortfolioMarginModel.pdf （2026-10-16）
24. **PRIMARY** Cboe, “Portfolio Margining” — strategy-based 与 portfolio margin 的区别；OCC TIMS 框架。https://www.cboe.com/en/markets/us/options/margin/portfolio-margining-rules/ （2026-10-16）
25. **PRIMARY** OCC, “Margin Methodology” — STANS 自 2006 年 8 月起采用全组合 Monte Carlo（搜索摘要；原页 403）。https://www.theocc.com/risk-management/margin-methodology （2026-10-16）
26. **PRIMARY** CME, “SPAN Methodology” PDF — scan risk、多数交易所用 16 个情景、对深度虚值空头期权设极端情景（搜索摘要；PDF 超时）。https://www.cmegroup.com/clearing/files/span-methodology.pdf （2026-10-16）
27. **PRIMARY** Black & Scholes (1973), “The Pricing of Options and Corporate Liabilities,” JPE 81(3):637–654 — BS 模型原文；摘要指出公司负债可视为期权组合。https://www.journals.uchicago.edu/doi/10.1086/260062 （书目与摘要，2026-10-16）
28. Black (1976), “The pricing of commodity contracts,” JFE 3:167–179 — Black-76 原文（只核对书目，DOI 返回 406，未读）。https://doi.org/10.1016/0304-405X(76)90024-6
29. **PRIMARY** Stoll (1969), “The Relationship Between Put and Call Option Prices,” JF 24(5):801–824 — put-call 关系原始文献（书目与首页摘要）。https://onlinelibrary.wiley.com/doi/10.1111/j.1540-6261.1969.tb01694.x （2026-10-16）
30. **PRIMARY** Merton (1974), “On the Pricing of Corporate Debt: The Risk Structure of Interest Rates,” JF 29(2) — 债务的期权视角（书目与摘要）。https://onlinelibrary.wiley.com/doi/10.1111/j.1540-6261.1974.tb03058.x （2026-10-16）
31. **PRIMARY** Paradigm, “Everlasting Options”（2021-05）— 永续 funding = mark − index；everlasting funding = mark − payoff；½、¼、⅛ 的等价组合。https://www.paradigm.xyz/2021/05/everlasting-options （2026-10-16）
32. **PRIMARY** Paradigm, “Power Perpetuals”（2021-08）— ETH^p 指数、premium yield、squeeth 恒定 gamma。https://www.paradigm.xyz/2021/08/power-perpetuals （2026-10-16）
33. **PRIMARY** Deribit API `public/get_index_price?index_name=eth_usd` — 2441.28（2026-10-15 ~16:07 UTC）。

---

## 命令与输出

**环境限制**：本次没有 bash，下面的 python 计算无法执行。数据抓取用 fetch_content（raw 模式）直接请求 Deribit 公共 API；数值计算全部手算。

**A. Deribit API（raw HTTP GET）关键输出**
```
GET /api/v2/public/get_index_price?index_name=eth_usd
→ {"estimated_delivery_price":2441.28,"index_price":2441.28}, usIn=1792080427027026 (≈2026-10-15 16:07 UTC)

GET /api/v2/public/get_instruments?currency=ETH&kind=option&expired=false
→ ETH-16OCT26-2000-C: instrument_type "reversed", contract_size 1.0, settlement_currency "ETH",
  expiration_timestamp 1792137600000 (=2026-10-16 08:00:00 UTC), settlement_period "week"
GET .../get_instruments?currency=USDC&kind=option
→ ETH_USDC-16OCT26-2000-C: instrument_type "linear", contract_size 1.0, settlement_currency "USDC", same expiry

GET /api/v2/public/get_delivery_prices?index_name=eth_usd&count=5
→ 2026-10-15 2371.59; 10-14 2504.81; 10-13 2530.32; 10-12 2563.23; 10-11 2499.08 (records_total 2479)

GET /api/v2/public/get_volatility_index_data?currency=ETH&start=1789516800000&end=1792108800000&resolution=1D
→ first [1789516800000 (09-16), 55.19, 55.19, 52.72, 52.83] … last [1792022400000 (10-15), 52.64, 54.45, 51.93, 52.01]
  min low 46.81 @1791331200000 (10-07)
GET same, currency=BTC → first close 36.19 (09-16), min low 33.09 (09-17), last [10-15, 39.12, 40.10, 38.31, 39.04]
GET same, ETH, 2025-09-17..2025-10-16 → closes 60.30–73.59

GET /api/v2/public/get_historical_volatility?currency=ETH → last points 43.37, 42.97, 44.40, 44.94

GET /api/v2/public/ticker (timestamp 1792080719981)
ETH-27NOV26-2000-P  mark_iv 56.36 delta -0.12406 gamma 4.3e-4 vega 1.717 theta -1.134 underlying 2452.53
ETH-27NOV26-2400-C  mark_iv 49.71 delta  0.58409 gamma 9.4e-4 vega 3.270 theta -1.905 mark 0.0782
ETH-27NOV26-3000-C  mark_iv 52.47 delta  0.15064 gamma 5.3e-4 vega 1.960 theta -1.206
ETH-30OCT26-2400-C  mark_iv 46.53 delta  0.59608 mark 0.0467 underlying 2444.4 interest_rate 0.0
ETH-25DEC26-2400-C  mark_iv 50.58 delta  0.58859 underlying 2460.93
```

**B. 手算（S=2500, T=30/365=0.0821918, √T=0.286691, σ√T=0.172015, r=0）**
```
K=2500: d1=+0.086007 d2=-0.086007 N(d1)=0.534270 φ(d1)=0.397469
        C=P=2500*(0.534270-0.465730)=171.35; Γ=0.397469/430.0375=0.00092426
        Vega=2500*0.397469*0.286691=284.88 (/100=2.849); Θ=-½σ²S²Γ=-1039.8/yr=-2.849/day
        Rho_c=2500*T*N(d2)=95.70 (/100=0.957); Rho_p=-109.78 (/100=-1.098)
K=2750: ln(S/K)=-0.0953102; d1=-0.468074 d2=-0.640089; N(d1)=0.319867 N(d2)=0.261057 φ(d1)=0.357547
        C=799.67-717.91=81.76; P=C+K-S=331.76; Γ=0.00083144; Vega/pt=2.563; Θ/day=-2.563
K=2250: ln(S/K)=+0.1053605; d1=0.698515 d2=0.526500; N(-d1)=0.242428 N(-d2)=0.299271 φ(d1)=0.312578
        P=673.36-606.07=67.29; C=317.29; Γ=0.00072686; Vega/pt=2.240
```
**C. 交叉校验**
```
C1 parity: C2500-P2500=0=S-K; C2750-P2750=-250=S-K ✓
C2 Θ identity: ½·0.36·2500²·0.00092426 = 1039.79 = |Θ_yr| ✓
C3 Deribit reproduction (ETH-30OCT26-2400-C): T=14.66d → √T=0.200417, σ√T=0.093254,
   ln(2444.4/2400)=0.018331, d1=0.24320, d2=0.14994, N(d1)=0.59608 (API delta 0.59608),
   price=2444.4*0.59608-2400*0.559594=114.03 USD vs mark 0.0467*2441.3=114.01 USD ✓
C4 ±10% jump revaluation: C(2750;K2500)=331.76, C(2250;K2500)=67.29
   hedged short-call PnL: +10% → -160.41+0.53427*250=-26.84 ; -10% → +104.06-133.57=-29.51
   gamma approx -½·0.00092426·250² = -28.88 ✓ (asymmetry = 3rd-order term)
C5 break-even daily move: √(2·2.8488/0.00092426)=78.5 USD = 3.14% = 0.60/√365 ✓
```

---

## 开放问题

1. ~~页面上线前跑 §8 代码~~ 已完成（主会话 2026-10-16），数字不变。
2. CME（Ether options on futures）与 OCC ODD 原文没能访问；如果页面要放“传统市场合约规格样例”，需要补核 CME 规格页（行权方式、结算价规则）。
3. Deribit 当前 PM 参数（各币种的 price range 与 vol range 现值）没有取到，只有文档里的示例值。
4. Deribit HV 端点的回看窗口不明。
5. 是否要给页面加 r=4% 版本：r=4% 时 ATM call 约上升 Rho×4 ≈ +3.8，put 约下降 4.4（由 Rho 线性外推，未精算）。

---

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| B1 | 期权赋予持有人在约定价格买入（call）或卖出（put）标的的权利而非义务；卖方承担对应义务 | [1] “Describing Equity Options” 与 “Calls and Puts” 表 | observed | |
| B2 | 美国股票期权一张通常对应 100 股 | [1] | observed | |
| B3 | 拆股、并购时可调整股票期权的合约规模、交割物和执行价 | [1] | observed | |
| B4 | 期权买方的最大损失限于权利金；卖出 call 的损失理论上无上限，卖出 put 的损失可能很大 | [1] “The Options Premium” | observed | |
| B5 | 美式期权可在到期前（含到期日）任何时候行权，欧式只能在到期时行权；美国大多数指数期权为欧式 | [8] | observed | |
| B6 | SPX 期权乘数为 100，欧式、现金结算 | [9] 规格页（乘数）＋产品页摘要（欧式 / 现金结算） | observed | |
| B7 | Deribit inverse 期权为欧式、以 BTC/ETH 结算，乘数为 1，到期自动行权，可提前平仓 | [10]（官方 KB 搜索摘要）；[15] contract_size 1.0、settlement_currency ETH | observed | |
| B8 | Deribit Linear USDC 期权为欧式，以 USDC 计价和结算 | [11]；[15] ETH_USDC-16OCT26-2000-C settlement_currency USDC | observed | |
| B9 | Deribit 期权在 08:00 UTC 到期 | [15] expiration_timestamp 1792137600000 = 2026-10-16 08:00 UTC；[11] | observed | |
| B10 | Deribit 结算价为 07:30–08:00 UTC 相关指数的 30 分钟 TWAP | [11][14]（搜索摘要）；[12] “same 30 minute TWAP” | observed | |
| B11 | Deribit 指数每 4 秒计算一次，结算价是 450 个指数值的时间加权平均 | [14] “Features” 搜索摘要 | observed | |
| B12 | 自 2026 年 4 月初起，Deribit linear USDC 期权的 ITM 部分先按执行价实物交割成期货，再现金结算 | [11][13] | observed | |
| B13 | 自 2026-08-01 起，Deribit inverse 期权也改为先结算成同到期期货；盈亏与结算币种不变 | [12] 全文 | observed | |
| B14 | 在 Deribit 的 2026 年流程下，“欧式、现金结算”仍是正确的经济描述，但合约层面已是 futures-settled | 由 B12、B13 推出；Deribit 原话“can still be thought of as cash settled” [12] | inferred | |
| B15 | 2026-10-15 ETH 的 Deribit delivery price 为 2371.59 | [16] | observed | |
| B16 | BS 模型的输入为标的价、执行价、剩余期限、无风险利率、波动率 | [2]；[27] | observed | |
| B17 | Black-Scholes 原文发表于 JPE 1973 年第 81 卷第 3 期 637–654 页 | [27] | observed | |
| B18 | Black-76 原文为 Black (1976), JFE 3:167–179 | [28]（只核书目，未读原文） | observed | |
| B19 | 历史波动率是价格日变动的年化标准差；IV 是由期权价格反推的市场预期波动 | [2] | observed | |
| B20 | Deribit 的 mark 价与“以到期远期为 F、r=0 的 Black-76”一致（ETH-30OCT26-2400-C 复算 114.03 vs 114.01 USD，delta 0.59608 吻合） | notes “命令与输出” C3；[20] | inferred | |
| B21 | Deribit 期权 Greeks 以 USD、按每 1 vol 点 / 每天返回，interest_rate=0 | [20] ticker 字段；与 vega≈0.4·F·√T/100 量级一致 | inferred | |
| B22 | 2026-10-15 ETH-27NOV26 呈 smile 加 put skew：2000P IV 56.36%、2400C 49.71%、3000C 52.47% | [20] | observed | |
| B23 | 2026-10-15 ETH 近 ATM IV 期限结构向上：30OCT 46.53%、27NOV 49.71%、25DEC 50.58% | [20] | observed | |
| B24 | DVOL 是 Deribit 用 variance swap 方法、在 30 天两侧两个到期日之间插值得到的 30 天年化 IV 指数，舍弃 ITM 与 delta 绝对值小于 5% 的期权 | [17] | observed | |
| B25 | DVOL/√365 约等于预期日波动（经验上可除以 20） | [17] | observed | |
| B26 | 2026-10-15（~16:07 UTC）ETH DVOL 为 52.01，近 30 天区间 46.81–55.19 | [18] | observed | |
| B27 | 2026-10-15 BTC DVOL 为 39.04，近 30 天区间 33.09–40.10 | [18] | observed | |
| B28 | 2025 年同期 ETH DVOL 在约 60–74 之间，高于 2026 年 10 月 | [18] 2025-09-17..2025-10-16 序列 | observed | |
| B29 | 2026-10-15 Deribit ETH 历史波动率约 42–45%，低于同时点 DVOL（约 52） | [19]；[18] | observed | |
| B30 | 2026-10-15 ~16:07 UTC ETH 指数为 2441.28 | [33] | observed | |
| B31 | OIC 的 Greeks 单位：vega 每 1% 波动率、theta 每天、rho 每 1% 利率、gamma 每 1 单位标的 | [2] | observed | |
| B32 | r=0 时 Θ = −½σ²S²Γ；示例中 ½·0.36·2500²·0.00092426 = 1039.8/年 = 2.849/天 | 由 BS PDE [27] 推出；notes C2 | inferred | |
| B33 | delta 对冲后单步 PnL ≈ ½Γ(ΔS)² + ΘΔt = ½ΓS²[(ΔS/S)² − σ²Δt]，long gamma 赚的是“实现波动 > 隐含波动”的差 | 由 B32 推出 | inferred | |
| B34 | 示例：S=2500、K=2500、30 天、σ=60%、r=0 时 ATM call = put = 171.35，delta 0.5343，gamma 0.000924，vega 2.849/点，theta −2.849/天 | notes §5 与 C 节；`python3 research/scripts/bs.py` 输出（主会话 2026-10-16） | observed | |
| B35 | 示例：K=2750 call 81.76（delta 0.3199），put 331.76；K=2250 put 67.29（delta −0.2424），call 317.29 | notes §5；python 运行输出（主会话 2026-10-16） | observed | |
| B36 | 卖 1 张 ATM call 并做 delta 对冲，标的瞬间 +10% / −10% 的盈亏为 −26.84 / −29.51，gamma 近似 −28.88 | notes C4；`python3 research/scripts/bs.py` 输出 `2750.0 -26.84 -28.88` / `2250.0 -29.51 -28.88` | observed | |
| B37 | 示例中对冲后的盈亏平衡日波动 ≈ 78.5 USD ≈ 3.14% = σ/√365；一次 10% 跳动的损失约等于 10 天 theta | 由 B34、B36 推出 | inferred | |
| B38 | delta-neutral ≠ 无风险：仍有 gamma / 跳跃、vega、离散对冲、成本和基差风险 | 由 B33、B36 推出 | inferred | |
| B39 | 欧式 put-call parity：C − P = S − K·e^{−rT}（远期形式 e^{−rT}(F−K)）；示例中逐对成立 | [29]（原始文献）；notes C1 | inferred | |
| B40 | Stoll (1969) “The Relationship Between Put and Call Option Prices” 发表于 JF 24(5):801–824 | [29] | observed | |
| B41 | Merton (1974) 把风险债务看作“无风险债务现值 − 以公司资产为标的的 put”；lane 文本的“K − put”缺少折现 | [30] 摘要（按 BS 思路定价）；[27] 摘要 | inferred | |
| B42 | DeFi 超额抵押借贷中，出借方 ≈ 无风险贷款 + short put，借款人 ≈ 持有抵押物上的 call；清算机制使其偏离欧式 put | 由 B41 类推 | speculative | |
| B43 | Covered call 的到期 PnL 与同执行价 short put（cash-secured put）相同；OIC 称两者风险曲线“identical” | [3][4]；notes §5 表逐行相等 | observed | |
| B44 | K=S0 时，protective put（现货 + ATM put）的 PnL 与 long ATM call 相同（r=0）；示例两列都是 −171.35 → +828.65 | 由 B39 推出；notes §5 表 | inferred | |
| B45 | Covered call 最大收益 = 执行价 − 买入价 + 权利金，最大损失 = 买入价 − 权利金，盈亏平衡 = 买入价 − 权利金 | [3] | observed | |
| B46 | Cash-secured put 最大收益 = 权利金，最大损失 = 执行价 − 权利金，盈亏平衡 = 执行价 − 权利金 | [4] | observed | |
| B47 | Collar 的最大收益与损失由 call / put 执行价和净权利金决定，两端都有界 | [5] | observed | |
| B48 | Bull call spread 最大损失 = 净付出，最大收益 = 执行价差 − 净付出，盈亏平衡 = 低执行价 + 净付出 | [6] | observed | |
| B49 | Long straddle 最大损失 = 两份权利金，盈亏平衡 = K ± 权利金合计，最大收益无上限 | [7] | observed | |
| B50 | 示例盈亏平衡：long C2500 为 2671.35；covered call（2750）为 2418.24（最大收益 331.76）；bull call 2500/2750 为 2589.59（净付 89.59、最大收益 160.41）；straddle 为 2157.30 / 2842.70 | notes §5（由 B34、B35 推出） | inferred | |
| B51 | Strategy-based 保证金按固定公式逐头寸计算、不承认对冲；portfolio margin 按多情景下组合的最大净损失计算，框架为 OCC TIMS | [24] | observed | |
| B52 | OCC 自 2006 年 8 月起用 STANS（全组合 Monte Carlo）计算清算保证金 | [25]（搜索摘要） | observed | |
| B53 | CME SPAN 用情景法计算 scan risk，多数交易所用 16 个情景 | [26]（搜索摘要） | observed | |
| B54 | Deribit 标准保证金：short call IM = max(0.15 − OTM%, 0.1) + mark，MM = 0.075 + mark（以币计）；long 只付权利金 | [10][21]（搜索摘要） | observed | |
| B55 | 按 Deribit 公式，卖 1 张示例 ATM ETH call 的 IM ≈ 0.2185 ETH ≈ 546 USD，约为所收权利金的 3.2 倍 | 由 B34、B54 推出 | inferred | |
| B56 | Deribit 组合保证金：9 档价格（如 ±16%）× vol up/same/down，加扩展表（−66%…+500%）、delta shock、roll shock；MM = 0.8 × IM | [22]（2026-10-12 更新的 KB 搜索摘要） | observed | |
| B57 | Deribit 旧版 PME 参数为 BTC/ETH ±15%、vol up 45% / down 30%、IM = 120% × MM，与现行版本不同 | [23] | observed | |
| B58 | 永续 funding = mark − index，由多头付给空头（Paradigm 的简化描述） | [31] | observed | |
| B59 | Everlasting option 的 funding = mark − 当前 payoff，等价于按 ½、¼、⅛… 持有逐期到期期权的滚动组合 | [31] | observed | |
| B60 | Power perpetual 以 ETH^p 为 index，funding（premium yield）= mark − ETH^p；ETH² 版（squeeth）gamma 恒定 | [32] | observed | |

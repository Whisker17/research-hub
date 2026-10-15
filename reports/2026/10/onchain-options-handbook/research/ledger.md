# 论断台账

每条会出现在 explainer 里的论断，都要在这里有一行。
类型：observed（直接观察到，有一手证据）/ inferred（由证据推出）/ speculative（推测，需在页面上标明）。

本台账由四路调研合并而成。前缀对应分册，证据里的 `[n]` 指该分册“来源”一节的第 n 条：
- **B** → `research/notes-basics.md`（期权基础）
- **E** → `research/notes-ecosystem.md`（Jeff Yan 观点与链上期权生态）
- **W** → `research/notes-worldmarkets.md`（World Markets 论文解读与核查）
- **X** → `research/notes-mantle.md`（Mantle 机会）
- **S** → 主会话综合（`research/notes.md` §综合），类型都是 inferred 或 speculative

主会话已用 python 复算 B、W 两路的手算数值（`research/scripts/`），相应行已改为 observed。

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| B1 | 期权赋予持有人在约定价格买入（call）或卖出（put）标的的权利而非义务；卖方承担对应义务 | [1] “Describing Equity Options” 与 “Calls and Puts” 表 | observed | F1 |
| B2 | 美国股票期权一张通常对应 100 股 | [1] | observed | |
| B3 | 拆股、并购时可调整股票期权的合约规模、交割物和执行价 | [1] | observed | |
| B4 | 期权买方的最大损失限于权利金；卖出 call 的损失理论上无上限，卖出 put 的损失可能很大 | [1] “The Options Premium” | observed | F1 |
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
| B20 | Deribit 的 mark 价与“以到期远期为 F、r=0 的 Black-76”一致（ETH-30OCT26-2400-C 复算 114.03 vs 114.01 USD，delta 0.59608 吻合） | notes “命令与输出” C3；[20] | inferred | F2 |
| B21 | Deribit 期权 Greeks 以 USD、按每 1 vol 点 / 每天返回，interest_rate=0 | [20] ticker 字段；与 vega≈0.4·F·√T/100 量级一致 | inferred | |
| B22 | 2026-10-15 ETH-27NOV26 呈 smile 加 put skew：2000P IV 56.36%、2400C 49.71%、3000C 52.47% | [20] | observed | F2 |
| B23 | 2026-10-15 ETH 近 ATM IV 期限结构向上：30OCT 46.53%、27NOV 49.71%、25DEC 50.58% | [20] | observed | F2 |
| B24 | DVOL 是 Deribit 用 variance swap 方法、在 30 天两侧两个到期日之间插值得到的 30 天年化 IV 指数，舍弃 ITM 与 delta 绝对值小于 5% 的期权 | [17] | observed | |
| B25 | DVOL/√365 约等于预期日波动（经验上可除以 20） | [17] | observed | |
| B26 | 2026-10-15（~16:07 UTC）ETH DVOL 为 52.01，近 30 天区间 46.81–55.19 | [18] | observed | F2、B |
| B27 | 2026-10-15 BTC DVOL 为 39.04，近 30 天区间 33.09–40.10 | [18] | observed | |
| B28 | 2025 年同期 ETH DVOL 在约 60–74 之间，高于 2026 年 10 月 | [18] 2025-09-17..2025-10-16 序列 | observed | |
| B29 | 2026-10-15 Deribit ETH 历史波动率约 42–45%，低于同时点 DVOL（约 52） | [19]；[18] | observed | F2、B |
| B30 | 2026-10-15 ~16:07 UTC ETH 指数为 2441.28 | [33] | observed | |
| B31 | OIC 的 Greeks 单位：vega 每 1% 波动率、theta 每天、rho 每 1% 利率、gamma 每 1 单位标的 | [2] | observed | |
| B32 | r=0 时 Θ = −½σ²S²Γ；示例中 ½·0.36·2500²·0.00092426 = 1039.8/年 = 2.849/天 | 由 BS PDE [27] 推出；notes C2 | inferred | F2 |
| B33 | delta 对冲后单步 PnL ≈ ½Γ(ΔS)² + ΘΔt = ½ΓS²[(ΔS/S)² − σ²Δt]，long gamma 赚的是“实现波动 > 隐含波动”的差 | 由 B32 推出 | inferred | F2 |
| B34 | 示例：S=2500、K=2500、30 天、σ=60%、r=0 时 ATM call = put = 171.35，delta 0.5343，gamma 0.000924，vega 2.849/点，theta −2.849/天 | notes §5 与 C 节；`python3 research/scripts/bs.py` 输出（主会话 2026-10-16） | observed | F1、F2、A |
| B35 | 示例：K=2750 call 81.76（delta 0.3199），put 331.76；K=2250 put 67.29（delta −0.2424），call 317.29 | notes §5；python 运行输出（主会话 2026-10-16） | observed | F1 |
| B36 | 卖 1 张 ATM call 并做 delta 对冲，标的瞬间 +10% / −10% 的盈亏为 −26.84 / −29.51，gamma 近似 −28.88 | notes C4；`python3 research/scripts/bs.py` 输出 `2750.0 -26.84 -28.88` / `2250.0 -29.51 -28.88` | observed | F2 |
| B37 | 示例中对冲后的盈亏平衡日波动 ≈ 78.5 USD ≈ 3.14% = σ/√365；一次 10% 跳动的损失约等于 10 天 theta | 由 B34、B36 推出 | inferred | F2 |
| B38 | delta-neutral ≠ 无风险：仍有 gamma / 跳跃、vega、离散对冲、成本和基差风险 | 由 B33、B36 推出 | inferred | F2 |
| B39 | 欧式 put-call parity：C − P = S − K·e^{−rT}（远期形式 e^{−rT}(F−K)）；示例中逐对成立 | [29]（原始文献）；notes C1 | inferred | A |
| B40 | Stoll (1969) “The Relationship Between Put and Call Option Prices” 发表于 JF 24(5):801–824 | [29] | observed | |
| B41 | Merton (1974) 把风险债务看作“无风险债务现值 − 以公司资产为标的的 put”；lane 文本的“K − put”缺少折现 | [30] 摘要（按 BS 思路定价）；[27] 摘要 | inferred | |
| B42 | DeFi 超额抵押借贷中，出借方 ≈ 无风险贷款 + short put，借款人 ≈ 持有抵押物上的 call；清算机制使其偏离欧式 put | 由 B41 类推 | speculative | |
| B43 | Covered call 的到期 PnL 与同执行价 short put（cash-secured put）相同；OIC 称两者风险曲线“identical” | [3][4]；notes §5 表逐行相等 | observed | F1 |
| B44 | K=S0 时，protective put（现货 + ATM put）的 PnL 与 long ATM call 相同（r=0）；示例两列都是 −171.35 → +828.65 | 由 B39 推出；notes §5 表 | inferred | F1 |
| B45 | Covered call 最大收益 = 执行价 − 买入价 + 权利金，最大损失 = 买入价 − 权利金，盈亏平衡 = 买入价 − 权利金 | [3] | observed | F1 |
| B46 | Cash-secured put 最大收益 = 权利金，最大损失 = 执行价 − 权利金，盈亏平衡 = 执行价 − 权利金 | [4] | observed | F1 |
| B47 | Collar 的最大收益与损失由 call / put 执行价和净权利金决定，两端都有界 | [5] | observed | |
| B48 | Bull call spread 最大损失 = 净付出，最大收益 = 执行价差 − 净付出，盈亏平衡 = 低执行价 + 净付出 | [6] | observed | |
| B49 | Long straddle 最大损失 = 两份权利金，盈亏平衡 = K ± 权利金合计，最大收益无上限 | [7] | observed | |
| B50 | 示例盈亏平衡：long C2500 为 2671.35；covered call（2750）为 2418.24（最大收益 331.76）；bull call 2500/2750 为 2589.59（净付 89.59、最大收益 160.41）；straddle 为 2157.30 / 2842.70 | notes §5（由 B34、B35 推出） | inferred | F1、A |
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
| E1 | Empire 节目《Jeff Yan On Hyperliquid's Plan To Bring All Finance Onchain》于 2026-10-07 发布，嘉宾是 Hyperliquid Labs CEO Jeff Yan | [1] 节目页；[3] YouTube 30:36 | observed | F6 |
| E2 | 节目章节 11:46 为“Better Trading Through Fees And Options” | [1] TIMESTAMPS | observed | F6 |
| E3 | 节目约 04:30，Jeff 说 perps 并不比期权好，两者“very complementary”、用途不同 | [2] 转写 00:04:30 段（机器转写） | observed | F6 |
| E4 | Jeff 称 HIP-4 是“options or option-like payout curves”可以搭建并扩展到对用户有用的原语，并希望这是“yet to unfold”的故事 | [2] 00:04:30–00:05:07 | observed | F6 |
| E5 | 被问“不做基础设施会做什么”时，Jeff 称此刻可能研究期权，因为很多人想交易期权 | [4][5][6] 媒体转述 | observed | F6、H |
| E6 | Jeff 称 HIP-4 是构建期权协议的清晰路径：可继承现货、订单簿、组合保证金，并用 perps 对冲期权 delta | [4] KuCoin（火星财经）；[5] Binance（Odaily），均为媒体转述 | observed | F6 |
| E7 | Jeff 认为加密领域尚无期权 / 凸性收益产品达到“escape velocity”，而 TradFi 已经做到 | [4] 媒体转述 | observed | F6 |
| E8 | E5–E7 的问答位于 11:46–18:19 章节内 | 由 E2 推测，无时间戳证据 | speculative | F6 |
| E9 | “Hyperliquid 将在自身平台上线期权”的报道与访谈内容不符，不能视为官方计划 | [7] 对比 [2][4][5]；HIPs 目录 [8] 无期权 HIP | speculative | F6、U |
| E10 | HIP-4 outcomes 是全额抵押、在固定区间结算的合约，官方称适用于预测市场和“bounded options-like instruments”，无杠杆、无清算 | [8] Overview | observed | F6、U |
| E11 | HIP-4 首个市场是每日 06:00 UTC 按 HyperCore BTC mark price 结算的循环二元合约 | [8]；[9] Recurring outcomes | observed | F6 |
| E12 | 循环二元合约以结算时刻前后两次 mark 更新的线性插值与 targetPrice 比较来决定 YES / NO | [9] Binary 段 | observed | F6 |
| E13 | HIP-4 的 Yes 与 No 订单簿合并：在 p 买 Yes 等价于在 1−p 卖 No | [8] Mechanics | observed | F6 |
| E14 | HIP-4 于 2026-02-02 宣布、2026-05-02 主网上线 | [14]（媒体）；[9] 示例 expiry 20260503 | observed | F6、D |
| E15 | 2026-08-14 起 HIP-4 只在平仓 / 结算时收费，开仓免费，平均费率为现货的一半；docs 页仍写“fees zero”，已过时 | [11] 公告；[8] 末段 | observed | |
| E16 | Hyperliquid 组合保证金于 2025-12 上线，2026-06-25 进入 beta 并提高限额，可用于 perps、spot、outcome | [13]；[12] | observed | F6 |
| E17 | Hyperliquid PM 中 HYPE 的 LTV 为 0.65、BTC 为 0.5；portfolio_margin_ratio > 0.95 时可被清算 | [10] LTV / Liquidations 段 | observed | |
| E18 | 截至 2026-10-16，Hyperliquid 官方 docs 与公告中没有原生香草期权产品或 HIP | [8] HIPs 目录（HIP-1~4）；[11][12] | inferred | F6 |
| E19 | HIP-3 由部署者负责市场定义、预言机与结算，主网质押要求 500k HYPE | [16] Spec 1 | observed | |
| E20 | Rysk V12 部署在 HyperEVM（Hyperliquid L1），近 30 天名义成交 $145.7M | [17] Rysk V12 breakdown30d hyperliquid；[48] hyperevmscan 地址 | observed | |
| E21 | DefiLlama 链上期权近 30 天名义成交约 $5.07B，近 1 年约 $21.0B | [17] total30d=5074065817.93、total1y=21042885743.67 | observed | F4、B |
| E22 | DefiLlama 链上期权近 30 天权利金约 $88.2M，近 1 年约 $543M | [18] total30d=88195379.12、total1y=542856136.15 | observed | F4 |
| E23 | Derive（V2 + V3）占近 30 天链上期权名义成交约 83.7% | 由 [17] 手算：(3361632714+884078883)/5074065818，见“命令与输出” | inferred | F4、B |
| E24 | Derive（V2 + V3）占近 30 天链上期权权利金约 91.2% | 由 [18] 手算：80423532/88195379 | inferred | F4、B |
| E25 | Paradex 期权近 30 天名义 $484M（约 9.5%），是第二大链上期权场所 | [17] Paradex Options total30d | observed | F4 |
| E26 | Stryke CLAMM 与 Kyan Blue Options 近 30 天名义成交为 0；Ithaca 近 30 天权利金只有 $1,999 | [17][18] | observed | F4、U |
| E27 | Derive Q3 2026 期权名义 $7.45B，环比 +89.6%，链上权利金份额 90.4% | [25] Alea（二手，披露维护 Derive Data Room） | observed | F4、U |
| E28 | Derive Q3 成交笔数仅 +6.2%，平均单笔从 $47K 增至 $84K，增长主要来自大单 | [25] | observed | F4 |
| E29 | 2026-10-01，Derive 期权 OI 约占 Deribit、OKX、Bybit、Binance、Derive 合计 $44.7B 的 3.1%，Deribit 约 78.2%，是 Derive 的 25.3 倍 | [25]（二手，venue API） | observed | F4、B |
| E30 | Deribit BTC 期权 OI 名义约 $31.2B、ETH 约 $3.7B | [56] 统计页（快照时刻未标） | observed | F4 |
| E31 | Coinbase 于 2025-05-08 宣布以约 $2.9B（$700M 现金 + 1,100 万股）收购 Deribit，2025-08-14 完成 | [53]；[54] | observed | |
| E32 | 收购完成时 Deribit OI 约 $60B，2025 年 7 月成交 >$185B，2024 年成交 >$1T | [54] | observed | |
| E33 | CME 2026 Q3 加密期货 + 期权 ADV 19.6 万张、总名义 $469.5B，官方报告未单列期权 | [57] 表格 | observed | |
| E34 | 学术研究估计 DEX 约占期权成交量 1%，链上（Lyra V2）IV 系统性高于 Deribit | [29] SSRN 摘要与 AEA 海报 | observed | F4 |
| E35 | Opyn 2020-08-04 ETH put 遭“double exercise”攻击，被盗 371,260 USDC，卖方获全额补偿 | [30] post-mortem；[31] | observed | F3、D |
| E36 | Squeeth 于 2022-01-18 主网上线，2024-11-04 16:00 UTC 关停 | [32] GitHub release；[33] | observed | |
| E37 | Ribbon（DOV）于 2021-04 上线；RGP-33 于 2023-07-25 通过并入 Aevo，RBN 按 1:1 迁移到 AEVO | [38]（媒体）；[34]；[35] | observed | D |
| E38 | Ribbon 遗留 DOV 于 2025-12-12 因 12-06 预言机升级（任何人可为新资产设价）被盗约 $2.7M，随后下线 | [36]（媒体） | observed | F3 |
| E39 | Ribbon 部分 vault 前端显示累计收益为负（T-WBTC-C −21.32%，T-sAVAX-C −48.22%） | [37] app 页面（快照时间未知） | observed | F3 |
| E40 | DOV 收益的相当部分被拍卖中的做市商以低于公允价拿走 | 无一手量化证据，仅为行业常见说法 | speculative | F3 |
| E41 | Rysk 官方认为 DOV 证明了需求，但因池化风险与僵化设计无法扩张 | [48] Problem 页 | observed | F3 |
| E42 | Hegic LP 自上线以来已实现 PnL 一直为负，依赖流动性挖矿补贴 | [39] Albaron 报告（二手研究，2021） | observed | F3 |
| E43 | Lyra 自述前代期权 AMM 因静态波动率与不精确定价导致 LP 持续亏损，且缺乏原生对冲 | [28] Introducing Lyra | observed | F3 |
| E44 | Lyra 于 2024-08-28 更名 Derive，DRV 于 2025-01-15 上线（LYRA 按 1:1 迁移） | [26]；[27] | observed | |
| E45 | Derive V3 于 2026-10-07 上线，用 ZK 交易所替换 Derive Chain，在 Ethereum L1 验证证明与结算 | [19]；[20] | observed | F5、U、D |
| E46 | Derive V3 提供 Standard（SM）与 Portfolio（PM2，情景网格）两种保证金管理器，并按 risk universe 隔离损失 | [22] | observed | F5 |
| E47 | Derive V3 期权默认 08:00 UTC 结算，美股标的可设为纽约时间下午 4 点 | [23] Option 段 | observed | |
| E48 | Derive 于 2026-07-24 上线 XAUT 期权，为其首个 RWA 期权市场 | [24]（Alea [25] 写为 7-23） | observed | D |
| E49 | Derive V3 期权为现金结算 | 由 [23]“quote 币种 = universe 的 settlement (cash) currency”推出 | inferred | |
| E50 | Paradex Dated Options 为欧式、USDC 现金结算，08:00 UTC 按 30 分钟现货预言机 TWAP 结算，于 2026-04 公测 | [44]；[45] | observed | |
| E51 | Paradex 于 2026-09 中接入 Paradigm RFQ 后期权 OI 升至 $202M | [46]（媒体） | observed | |
| E52 | Rysk V12 为欧式、实物交割、逐笔全额抵押，RFQ 有 2 秒聚合窗口，到期日与 Deribit 对齐（周五 08:00 UTC） | [48] Makers RFQ 页 | observed | F5 |
| E53 | Thetanuts V4 OptionBook 在 Base 上：做市商链下签名订单，taker 链上调用 `fillOrder(order, signature, referrer)`，每笔成交部署新的期权合约并锁定抵押 | [47] Overview / Executing Trades | observed | F5 |
| E54 | Thetanuts RFQ Factory 用 EIP-712 签名加 ECDH 加密的密封报价；费用为名义的 0.06%，上限为权利金的 12.5% | [47] RFQ Lifecycle | observed | |
| E55 | Thetanuts 文档中做市商报价 = 交易所 bid/ask ± 抵押资金成本（APR：cbBTC 1%、WETH 4%、USDC 7%） | [47] Offer Calculation | observed | F5 |
| E56 | Derive RFQ 中 send_rfq 是未签名 intent；maker 的 quote 与 taker 的 execute 都是 EIP-712 签名动作，整包原子结算 | [21] Signed actions / Taker flow | observed | F5 |
| E57 | Aevo 组合保证金 = 15 个现货 / IV 情景的 scenario margin + floor margin，ETH 初始参数为 ±20% spot、IV +50% / −25% | [49] | observed | |
| E58 | Panoptic 于 2024-12-18 在 Ethereum 上线，基于 Uniswap LP 提供永续期权 | [42] | observed | D |
| E59 | Premia 于 2025-06 更名 Kyan（期权 + perps + 组合保证金） | [43] | observed | |
| E60 | Typus（Sui）于 2025-10-15 因 TLP 合约预言机缺权限检查被盗约 $3.44M，DOV 未受影响 | [58]（媒体，引官方 post-mortem） | observed | F3 |
| E61 | Ithaca 采用频繁批量拍卖加 RSBB 分解和 MILP 撮合 | [51] | observed | |
| E62 | 链上期权难做的核心是做市商的对冲与资本成本：全额抵押把资金成本直接计入报价，而 perps 对冲加组合保证金是降低成本的主路径 | 由 E6、E46、E55、E57 推出 | inferred | F5 |
| E63 | 结算价 / 预言机路径是链上期权最常出事的环节 | 由 E35、E38、E60 推出 | inferred | F3 |
| E64 | 当前头部场所都是“链下撮合 + 链上结算”，而不是链上撮合 | 由 E45（Derive 亚毫秒撮合 + ZK）、[35]（Aevo 链下订单簿）、[44]（Paradex）推出 | inferred | F5 |
| E65 | Stryke CLAMM 在 DefiLlama 中列有 Mantle 链部署，但近 30 天成交为 0 | [17] Stryke CLAMM chains / breakdown30d | observed | S |
| W1 | 论文题为《The Economics of Composable Options Markets》，署名 World Markets Research，2026-10，共 12 页 | [1] p1 标题与作者行 | observed | U、D |
| W2 | 到期恒等式 C_T − P_T = S_T − K；定价关系 C − P = S − B(K,T) | [1] p1 式 1–2 | observed | F7 |
| W3 | 静态精确复制期权需要凸性来源：反向期权，或具有相同或有支付的债权；普通追索贷款只提供融资腿 | [1] p2 §2.1、p11 §9 | observed | F7 |
| W4 | 到期结算的无追索贷款中，出借人债权 = min(S_T, K) = K − put，借款人权益 = call；论文声明这不等于可清算的 DeFi 贷款内含可交易 put | [1] p2 式 3 | observed | F7 |
| W5 | 合成 call 的 ask = S^a + P^a − B_borrow，bid = S^b + P^b − B_lend | [1] p3 式 5–6 | observed | F7 |
| W6 | 论文示例：合成 call 3.50/4.40 优于原生 3.25/4.80，是假设报价的算术 | [1] p3 §3.1；手算 100.20 + 4.00 − 99.80 = 4.40，99.80 + 3.60 − 99.90 = 3.50 | observed | F7 |
| W7 | 合成深度 ≤ min(现货量, 反向期权量, 融资量)；示例 150/80/60 → 60，加原生 40 共 100 | [1] p3 式 7、Fig.3 | observed | F7 |
| W8 | 共享成分不去重会导致报价深度被重复计算 | [1] p3 §3.2、p7、p10 §8 | observed | F7 |
| W9 | 组合保证金定义为 M(Π) = 情景集合上的最大亏损 | [1] p4 式 9 | observed | F7 |
| W10 | §4.2 示例中，定期债权入账使总资本从 $1.15M 降到 $1.00M（−13.04%） | [1] p4–5 Table 2；0.15/1.15 = 0.1304 | observed | F7 |
| W11 | 3.18x = 9.53/3.00，其中 9.53 = (0.45 + 0.98)/0.15 | [1] p4、p8；notes §3.1 复算 | inferred | F7 |
| W12 | 2.00x = min(9.53, 6)/min(3, 6)；对冲额度 H 降到 $1M 时增益消失 | [1] p8 式 15；notes §3.1 | inferred | F7 |
| W13 | 论文 Table 3 输入：DEX 30 天成交 $246.593B，Aave V3 $12.15B，Morpho $5.78B，期权 $4.881B，Derive $4.236B，Derive V3 OI $1.655B（均为 2026-10-12） | [1] p6 Table 3 | observed | |
| W14 | 50.5x、10.8x、86.8% 是对上述输入的简单比值，论文自承不代表可执行深度或可复用抵押 | [1] p5 式 11–13；复算 50.52/10.83/86.79% | observed | |
| W15 | DefiLlama 上 Derive V3 期权 OI 在 2026-10-12 为 $1,655,413,130，与论文一致 | [14] totalDataChart [1791763200,1655413130]；notes C3 | observed | |
| W16 | 2026-10-16 时 Derive 30 天名义成交约 $4.246B（V2 $3.362B + V3 $0.884B），与论文的 $4.236B 量级一致 | [13]；notes C2 | observed | |
| W17 | 2026-10-16 时全部链上期权 30 天名义成交 $5.074B，Derive 份额约 83.7% | [13]；notes C2 | observed | |
| W18 | 2026-10-16 时 DefiLlama DEX 30 天成交 $289.2B，比论文的 $246.593B 高约 17%，原因不明 | [12]；notes C1、§3.2 | observed | |
| W19 | 论文的 Aave、Morpho 在贷余额：本路因 API 响应过大未能核实，主会话已用 curl 核实一致（见 S2） | notes-worldmarkets §3.2；notes.md S-核查 | observed | |
| W20 | DefiLlama 记录 Derive V3 于 2026-10-08 上线（从 Derive Chain 迁到 Ethereum L1），Derive V2 期权最近一周无成交 | [14] hallmark；[13] Derive Options total7DaysAgo = 0 | observed | F8 |
| W21 | gist 数据显示，2026-09-24 Derive ETH-20261002-2700-C 最优 ask 为 $67.2 × 90、最优 bid 为 $63.3 × 82.8 | [10] liquidity.json；notes C5 | observed | |
| W22 | gist 中的 90/82.8 只是最优一档数量，盘口有 4 档 ask、7 档 bid，没有加总；数据标注为非 firm RFQ 的可见深度 | [10] levels、classification、limitation 字段 | observed | |
| W23 | 定价余量 $1.95 = ask $67.20 − 中点 $65.25 | [1] p7；(67.2 + 63.3)/2 = 65.25 | observed | |
| W24 | 区块 26,189,586 的时间为 2026-10-14 08:36:59 UTC，与论文一致 | [11]；notes C6 | observed | |
| W25 | 现货对冲：40 ETH（5bp 池）+ 20 ETH（1bp 池），参考价 2510.8339，现金 $150,808.54，其中费用 + 冲击 $158.51 | [1] p6；60 × 2510.8339 + 158.51 = 150,808.54 | observed | |
| W26 | Uniswap 模拟只部分可复现：论文没有给池地址或脚本，gas 设为 0 | [1] p6、p5 | observed | |
| W27 | 在 7 天、IV 50%、r = 0、K_ATM = S 下，净 delta 0.1126/0.0570/0.0229 可复现 | notes §3.1、C8（手算 0.11257/0.05700/0.02290）；主会话 python 复算一致（C10） | observed | F7、F8 |
| W28 | 532/1,052/2,620 张 = 60 ETH ÷ 净 delta 后向下取整，分别为 90 张的 5.9×/11.7×/29.1× | notes C8；[1] p7 Table 4a；主会话 python 复算一致（C10） | observed | F7、F8、B |
| W29 | 每张现货执行成本 $0.30/$0.15/$0.06 = $158.51 ÷ 张数 | [1] p7；notes §2 | inferred | |
| W30 | Table 4b 的每张准备金 $35.59/$17.49/$6.88 可按论文网格精确复算，最坏情景为 spot −20%、IV 75%、剩余 7 天，是纯盯市压力亏损、不含摩擦与融资 | `python3 research/scripts/wm_check.py` 输出（notes C10，2026-10-16 主会话运行） | observed | F8、U |
| W31 | 三种配置的合计准备金都约 $19k，原因是对冲现货都约 60 ETH，且网格边界固定在 −20% | 由 W30 推出；[1] p8 Fig.5 | inferred | |
| W32 | 每张融资成本 $0.25/$0.13/$0.05 = 约 $139k × 5% × 7/365 ÷ 张数 | [1] p7–8 Table 4c；notes C8 | inferred | |
| W33 | 立即成交比例 1 − e^{−Q/µ}：Q = $224k 时 89.354%，Q = $1M 时 99.995%，每 $1B 需求多 $106.4M，θ = 50% 时新增 $53.2M | [1] p8–9 式 16–18；notes §3.1 复算；主会话 python 复算一致（C10） | observed | F8 |
| W34 | Q_D = $224k 来自历史 bid 82.8 张 × 行权价 $2,700（约 $223.6k）；Q_U = $1M 是假设 | [1] p6 Table 3、p8 | inferred | |
| W35 | µ = $2M 时 77.69%/95.02%，多 $173.3M，新增 $86.7M | [1] p9；1 − e^{−1.5}、1 − e^{−3} 复算 | inferred | |
| W36 | 论文自承 hedge call 的可得数量和价格是假设，例如 $25 配置需要 1,052 张可成交的 hedge call | [1] p6–7 | observed | F8 |
| W37 | Table 7 / Fig.8 的资本占用对比（如 covered call：Derive $19k，World V2 $7k）是“provisional supplied estimates” | [1] p10 Table 7、p11 Fig.8 图注 | observed | F8 |
| W38 | 摘要写“6–12x increase in top of book liquidity is possible”，正文把同一数字限定为“conditional quotation capacity”，措辞强于正文 | [1] p1 摘要与 p5 §5.3 对比 | inferred | F8 |
| W39 | 论文的比较基准是已迁移场所（Derive V2）的历史最优一档挂单，不是 Derive V3 的盘口或 RFQ 深度 | 由 W20、W22 与 [1] p5、p10 推出 | inferred | F8 |
| W40 | 合成路由把“缺期权流动性”的问题部分转移到 hedge 期权腿：静态或价差路径的容量受反向期权供给约束 | 由 [1] p3 式 7、p7“decisive empirical input”推出 | inferred | F8 |
| W41 | World Markets 文档写明出借债权按 98% 计入可用保证金 | [2] Calculation Details；[3] Loans；[9] | observed | F7 |
| W42 | World Markets 的贷款固定 10 天、期间固定利率，全部市场（含借贷）为 CLOB，RFQ 集成在订单簿中 | [3]、[4] | observed | F7 |
| W43 | World Markets 是现货、永续、借贷合一的全链上交易所，风险引擎为 ATLAS，文档写明部署在 MegaETH | [6]、[7] | observed | |
| W44 | World Markets 处于 Beta：合约可升级，源码在“达到足够流动性后”才公开 | [7]、[6] | observed | |
| W45 | World Markets 的期权功能未上线，文档 Options 页写“Coming soon.” | [5] | observed | F8 |
| W46 | 没有找到 World Markets V2 +Options 已发布的一手证据；官网标注“on Ethereum”“Trade Coming Soon”，MegaETH 页已归入 Legacy | [9]、[8]、[5] | observed | |
| W47 | World Markets 可能正把 V2 迁往以太坊主网 | 由 W46 推出 | speculative | |
| W48 | World Markets 团队：CEO/联创 Lucas Gaylord，CTO/联创 Moh Rezaei，COO & GC Gareth Rhodes，CBO Joe Cox | [9] 团队栏 | observed | |
| W49 | World 于 2025-03 在 MegaETH 测试网私测，并完成 Zellic 审计 | [8] Changelog | observed | |
| W50 | World Markets 约在 2026-05-01 于 MegaETH 主网上线 Mega Terminal（媒体/镜像报道） | [23] 二手镜像 | speculative | |
| W51 | World 官网列出 Ondo 代币化股票、xStocks、Midas、Centrifuge、XAUT 等 RWA，可作现货、借贷和抵押，多数标的尚未标注 Live | [9] | observed | |
| W52 | Derive V2 有组合保证金（PMRM）和跨资产抵押（初始保证金 ETH 按 80%、BTC 按 75%） | [15] | observed | |
| W53 | Derive 的借贷是浮动利率；论文的增量主张是把定期债权计入保证金 | [16]；[1] p4 §4.1 | observed | |
| W54 | 论文 §1 用 [11,12] 支撑“Derive 有 RFQ”，这两篇引文都没有讲 RFQ | [15]、[16] 正文；[1] p1 | observed | |
| W55 | BIS：2025 年 4 月场外 FX 期权日均成交 $634B | [17] | observed | |
| W56 | BIS commentary 写利率期权“$245 billion”，论文写 $245.8B | [18]；[1] p10 Table 6 | observed | |
| W57 | FIA：2025 年全球期权成交 88.65B 张，同比 −50.3% | [19] | observed | |
| W58 | Benos 等人估算 LCH 卖方承担的清算碎片化成本约 $80M/日 | [20] | observed | |
| W59 | OCC $700M/日、54% 与 CME $8.4B 本次未核实 | notes §3.7、[21] | observed | |
| W60 | 本次没有找到针对该论文的 X 或社区讨论记录 | notes §4 检索记录 | observed | F8 |
| W61 | 只有现货和借贷的链只具备 parity 中的两条腿，期权流动性仍需凸性来源（反向期权或或有债权） | 由 W3、W7 推出 | inferred | |
| W62 | 要实现论文式合成路由，需要同一保证金账本、原子多腿执行与去重、定期固定利率借贷，以及期权簿或 RFQ | 由 [1] p3、p4、p10 §8 推出 | inferred | F7 |
| W63 | Mantle 上的 RWA 若同时有现货簿和定期借贷，可尝试 covered call / 合成 call 类构造，但现货深度、休市和公司行动会约束容量与结算 | 由 W51、W61、W62 推出 | speculative | |
| X1 | xStocks 原生发行链包括 Ethereum、Solana、Arbitrum、Mantle、TON、Ink 等 | [1] docs.xstocks.fi/docs “Multi-Chain”；[2] FAQ | observed | F10 |
| X2 | xStocks 于 2026-04-10 在 Mantle 上线，经 Fluxion 交易，充提仅通过 Bybit | [9] Mantle 新闻稿转载（2026-04-10）：“exclusively through Bybit” | observed | F10、S |
| X3 | 2026-05-07 xStocks 在 Mantle 激活 xChange Atomic RFQ，可直接向发行方铸造和赎回 | [8] xStocks News《Introducing xStocks on Mantle》 | observed | F10、S |
| X4 | xStocks 公共 API 显示至少约 100 个标的有 Mantle 部署，结算币为 Mantle USDC 0x09bc…0df9 | [6] /public/assets?network=Mantle 检索命中数（工具截断，作为下限） | observed | F10、B |
| X5 | 每个 Mantle 上的 xStock 部署都带 wrapperAddressV2（ERC-4626 非 rebasing 封装） | [6] API 字段；[7] WrappedBackedTokenImplementation.sol@35859e8c75 注释 | observed | F10、E |
| X6 | USPXx 只在 Fluxion 交易（2026-06-24 上线） | [10] Mantle 新闻稿转载 “trades exclusively on Fluxion” | observed | |
| X7 | DefiLlama 桥接口径下 Mantle 上的 xStocks：SNDKX $16.1M、HOODX $10.7M、NVDAX $9.1M、SPYX $7.7M、QQQX $7.2M | [18] DefiLlama bridged/mantle 搜索快照（聚合数据） | observed | |
| X8 | mStocks 由 Bybit 与 Mantle 合作，目标 2026-11 上线，1:1 实股支持，可在 Mantle AMM 交易，可作 Bybit UTA 抵押 | [11] Gate News 转引 PANews、Bybit 新闻稿转载（媒体） | observed | H |
| X9 | mStocks 发行人为 BVI 的 Halo Prime Limited，性质为 limited-recourse debt obligations，Bybit 不是发行人或托管人 | [11] CryptoBriefing 2026-10-13（媒体报道，无一手原文） | speculative | |
| X10 | 没有查到 Ondo Stocks（原 Ondo Global Markets）部署在 Mantle 的证据 | [13] Ondo 地址页 Mantle 段只有 USDY、mUSD、Oracle、Blocklist | observed | |
| X11 | Mantle 上的 USDY 为 0x5bE2…c5A6，mUSD（0xab57…7cF3）是它在 Mantle 上的 rebasing 版本，另有 Blocklist 合约 | [13] docs.ondo.finance/addresses.md Mantle 表 | observed | |
| X12 | USDY 依 Reg S 只面向非美国人，新申购有至少 40 天受限期 | [14] Ondo How it Works、Eligibility | observed | |
| X13 | DefiLlama 桥接口径：Mantle 上 mETH $153.1M、cmETH $25.6M、FBTC $20.0M、USDY $13.5M、XAUT $43.7M | [18] bridged/mantle 搜索快照 | observed | |
| X14 | mETH 赎回最少 12 小时，最长可能 40 天以上；cmETH 赎回最长约 7 天 | [16] Mantle Docs mETH Protocol | observed | |
| X15 | MI4 是 BTC/ETH/SOL/美元稳定币的加密指数基金，Mantle Treasury 承诺 $400M 锚定投资；DefiLlama 记 TVL $110.5M | [21] Securitize 新闻稿；[18] DefiLlama 链页快照 | observed | |
| X16 | Aave V3 于 2026-02-11 在 Mantle 主网上线，配 8M MNT 和 1.5M GHO 激励 | [20] 新闻稿转载；Aave changelog | observed | F10、S |
| X17 | Aave Mantle 供应 $330.4M、借出 $144.0M，资产为 USDT0、sUSDe、syrupUSDT、USDe、FBTC、USDC、GHO、WETH、WMNT、wrsETH，不含 xStocks 和 mETH | [19] aavetracker（读 Aave API，2026-10-15 16:05 UTC，第三方） | observed | F10、S |
| X18 | DefiLlama 链页把 Aave V3 在 Mantle 的 TVL 记为 $89.47M，与 aavetracker 口径冲突 | [18] 链页快照；[19] | observed | |
| X19 | DefiLlama Mantle TVL：Lendle $0.18M、INIT $1.81M、Agni $16.3M、Merchant Moe $12.1M、Fluxion $7.05M | [17] api.llama.fi currentChainTvls / tvl | observed | |
| X20 | Fluxion 是 AMM v2/v3 与订单簿（RFQ）的混合 DEX，30 天成交约 $24.9M | [18] DefiLlama Fluxion 页快照；[9] | observed | |
| X21 | Mantle 全链 DEX 日成交约 $1–5M，永续 24h 和 7d 成交均为 $0 | [18] DefiLlama 链页两个快照 | observed | F10、B |
| X22 | Mantle 全链 TVL：API 为 $95.4M，链页快照为 $146M，口径和时点不一 | [17] /v2/chains；[18] | observed | |
| X23 | Mantle 官方 dApp 页列出 MethLab（固定利率、固定期限、无清算、无预言机） | [40] mantle.xyz/dapp 搜索快照 | observed | |
| X24 | Chainlink v10 tokenized-asset 报告同时含 price、tokenizedPrice、marketStatus、currentMultiplier、newMultiplier、activationDateTime | [22] Report Schema v10 字段表 | observed | F9、E |
| X25 | Chainlink v10 的 price 周末不更新，tokenizedPrice 用 CEX 交易持续更新 | [22] v10 Weekend Usage Disclaimer | observed | F9、R |
| X26 | Chainlink 是 xStocks 的官方预言机，但其生态页 xStocks 条目只列 Solana 和 Ethereum | [23] xStocks News；chainlinkecosystem.com/ecosystem/xstocks | observed | |
| X27 | 没有查到 Mantle 上已开通 xStocks 或股票 Data Streams 的证据 | 由 X26 与 [24]（Mantle 只查到 XAU/USD、MNT/USD feed）推出；否定性结论 | speculative | F10、S |
| X28 | Mantle 官方 Oracles 文档至 2026-10-16 仍无 Chainlink；Pyth Core 在 Mantle 仍未升级 | [25][26] 重新抓取；转引自 papertrade-deep-dive notes-mantle X24、X26 | observed | F10、S |
| X29 | DefiLlama 在 Mantle 的期权分类下只有 Stryke CLAMM，TVL 和成交均为 $0 | [18] defillama.com/protocols/options/mantle 搜索快照 | observed | F10、B |
| X30 | Rysk V12 只部署在 HyperEVM 和 Ethereum，不在 Mantle | [36] Rysk Important Contracts；DefiLlama Rysk 页 | observed | F10 |
| X31 | Thetanuts V4 SDK 只支持 Base（完整）和 Ethereum（vault），不在 Mantle | [37] Thetanuts SDK Supported Chains | observed | F10 |
| X32 | xStocks 二级市场 24/7，向发行方申购和赎回只在 24/5 | [2] FAQ | observed | F9、R |
| X33 | Mantle 上 xChange 按时段设单笔上限：market / extended $10M、overnight $1M、closed $0，最低 $1,000 | [6] API limitsPerPeriod | observed | F9、R |
| X34 | Chainlink 建议 marketStatus=1（休市）时保持市场关闭，休市期间重复使用收盘价 | [22] Handling Market Events | observed | F9 |
| X35 | xStocks 用链上 multiplier 处理分红（税后再投资）、拆股和反向拆股；EVM 上 balanceOf 自动调整 | [3][4] xStocks Docs | observed | F9、R |
| X36 | xStocks 合约在 feePerPeriod>0 时会按期下调 multiplier，管理费也通过 multiplier 体现 | [7] BackedAutoFeeTokenImplementation.sol@35859e8c75 getCurrentMultiplier | observed | F9、R |
| X37 | xStocks 合约同一时间只允许一个待生效的 multiplier 更新，后提交的覆盖前一个 | [7] _storeScheduledMultiplierUpdate 注释 | observed | F9 |
| X38 | multiplier 激活时点三处说法不一：xStocks 文档 00:30 UTC、Chainlink 文档 00:00 UTC、SPYx 实测 23:55 / 00:15 / 04:00 UTC | [3][22][6] multiplier/history | observed | F9、R |
| X39 | xStocks 建议在 multiplier 激活前后各暂停约 15 分钟 | [4] Multiplier Updates 节 | observed | F9 |
| X40 | Chainlink 警告：休市时激活 multiplier，在价格调整前不得计算理论价，应保持暂停 | [22] Handling Stock Splits | observed | F9 |
| X41 | xStocks EVM 合约有 pauser（可暂停全部转账）和 Chainalysis 制裁名单（拦截 from、to、spender），owner 可更换 | [7] BackedTokenImplementation.sol@35859e8c75 | observed | F9、R |
| X42 | xStocks 官网“Permissionless、无技术转让限制”的说法与合约中的 pause 和制裁权限存在张力 | 由 X41 与 [1] 推出 | inferred | |
| X43 | 锁在期权合约里的 xStocks 抵押品可能因发行方 pause 或制裁而无法交割 | 由 X41、X5（封装继承制裁检查）推出 | inferred | F9 |
| X44 | 向 xStocks 发行方直接申赎需要 KYC，最低 $5,000，不面向美国 | [2] FAQ | observed | F9、R |
| X45 | 没有找到 Mantle 上 xStocks 与标的股价之间基差的公开数据；可用 v10 的 price 与 tokenizedPrice 或发行方报价测量 | [22][6]；本次未采样 | inferred | |
| X46 | OCC 2025 年清算期权 152.1 亿张（+24.4%），其中个股 82.7 亿、ETF 56.8 亿、指数 12.6 亿 | [28] OCC newsroom 搜索快照 | observed | |
| X47 | 2025 年 12 月 SPX 0DTE ADV 2.3M，占 SPX 成交 59%；Cboe 称零售约占全市场日成交近一半 | [29] Cboe IR 摘要；Cboe Q3 2025 文章 | observed | |
| X48 | Bybit 于 2026-06-12 上线 XAUT 期权（Orbit Markets 做市，带 RFQ）；Derive 于 2026-07-24 上线 XAUT 期权；Coincall 于 2026-08-26 上线 SPY / QQQ / XAG 期权 | [30][31][32] | observed | F11、U、D |
| X49 | Bybit 于 2026-07-22 把 xStocks 纳入 Dual Asset 结构化产品（6 个标的，期限 8 小时 / 1 天 / 7 天） | [33] Bybit Press | observed | F11 |
| X50 | 截至 2026-10-16，没有看到以 tokenized 个股为标的、链上结算且有规模的期权市场 | 由 X29、X30、X31、X48 与 [38] 推出；否定性结论 | speculative | F11 |
| X51 | Mantle 已具备“标的 + 结算币 + 现货 RFQ”，但缺少期权的风险承接层（期权协议、永续、可做空的借贷） | 由 X3、X4、X17、X21、X29–X31 推出 | inferred | F10 |
| X52 | 全额抵押的保护 / 收益结构 + RFQ（方向 a）不需要组合保证金和链上深度现货，在 Mantle 上前置条件缺口最小 | 由 X51、X49（CEX 端已有 xStocks 结构化需求）推出 | inferred | F11 |
| X53 | RWA 结算与公司行动适配层（方向 b）是方向 a 的前置条件，且各发行方规则不统一，值得作为共享基础设施 | 由 X35–X40 推出 | inferred | F11 |
| X54 | 复制型 / 组合保证金 venue（方向 c）在 Mantle 现阶段前置条件最缺，应后置 | 由 X17（不能借 xStocks 做空）、X21（永续 $0、DEX 薄）推出 | inferred | F11 |
| X55 | 优先级建议：a 与 b 并行 > d > e > c（是建议，不是 Mantle 路线） | 由 X52–X54、X14、X12、X48 推出；需求与做市意愿未验证 | speculative | F11 |
| X56 | 以 mETH / USDY 为抵押的结构化产品（方向 e）受赎回延迟、Reg S 和 Aave 不收 mETH 的限制 | 由 X12、X14、X17 推出 | inferred | F11 |
| X57 | Mantle 官网显示 Treasury $2,255,065,530（As of 2026-10-15 15:56 UTC）、Real World Capital $759M | [39] mantle.xyz 首页 | observed | |
| X58 | Hyperliquid HIP-3 第三方股票永续在标的休市时以内部价格锚定最后一次外部报价 | [34] HyperAcademy（第三方描述） | observed | |
| X59 | GPT 称“USDY 与 rUSDY 列出 Mantle 部署”不准确：Mantle 上是 USDY 与 mUSD | [13] 对照 [42] §8.1 | observed | U |
| S1 | 论文 Table 3 的 DEX 30 天成交 $246.593B 与 DefiLlama 现值不符：同一窗口（截至 2026-10-12）按日加总为 $288.04B，约高 17% | notes.md S-核查：`curl api.llama.fi/overview/dexs` 按日加总（2026-10-16 主会话运行） | observed | F8、U |
| S2 | 论文的 Aave V3 在贷 $12.15B、Morpho $5.78B 与 DefiLlama 2026-10-12 的 borrowed（$12.11B、$5.77B）一致 | notes.md S-核查：`curl api.llama.fi/protocol/aave-v3`、`/protocol/morpho` | observed | F8 |
| S3 | 论文的模型数字（Table 4a、4b、式 16–18、3.18x、2.00x）全部可复算；但决定结果的输入（等量对冲期权可得、$1M 新 bid、θ=50%、15% 保证金系数）是假设 | 由 W27–W30、W33、W36 推出 | inferred | F8 |
| S4 | 链上期权的主要瓶颈是做市商的对冲渠道与资本成本（风险承接），而不是撮合 | 由 E 难点分析（notes-ecosystem §3.4）、W 容量公式（式 10）与 Derive V3 / Paradex 已链下撮合推出 | inferred | F5 |
| S5 | 在 put-call parity 视角下，Mantle 有现货与借贷两条腿，但缺凸性来源（无期权、无永续流动性），World 式组装流动性在 Mantle 上暂无原料 | 由 W 借鉴 1（notes-worldmarkets §5）与 X 能力对照（期权协议 $0、永续 $0）推出 | inferred | F10 |
| S6 | 全额抵押、最大支付有界的结构（covered call、cash-secured put、价差、collar）+ RFQ 是 Mantle 可行的起点：不需要组合保证金，也不依赖链上现货深度 | 由 B 保证金（notes-basics §6）、E 的 Rysk / Thetanuts 流程（§3.5）、X-Q4 推出 | inferred | F11 |
| S7 | RWA 期权在合约层必须显式规定三件事：fixing 时钟、合约单位（multiplier / 封装）、发行人权限异常（pause / 制裁）的处理 | 由 X-Q2a–X-Q2d 推出 | inferred | F9 |
| S8 | Mantle 可以参照 Hyperliquid“先做原语、期权留给 builder”的路线，先提供 RWA 结算适配层与 RFQ 结算合约 | 类比 E10–E16 与 X-Q4；未验证 Mantle 意愿或 builder 需求 | speculative | F11 |
| S9 | 例子参数下，把 IV 从 60% 改为 52%，30 天 ATM call 价格从 $171.35 降到 $148.55 | `python3 -c "from bs import bs; print(bs(2500,2500,30/365,0,0.52))"` → 148.5476（主会话 2026-10-16） | observed | I |
| S10 | 用 call 价差代替裸卖 call 后，每张客户期权需要的初始现货对冲从约 0.5 ETH 降到 0.02–0.11 ETH | 论文 [1] p6 “A standalone short call with delta near 0.50 requires approximately half an ETH”；净 delta 0.0229–0.1126 由 W27 复算 | observed | F7 |
| S11 | 链上 DEX 近 30 天现货成交约 $288B（截至 2026-10-12 的窗口） | 同 S1：`curl api.llama.fi/overview/dexs` 按日加总 | observed | H |

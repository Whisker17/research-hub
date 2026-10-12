# notes-peers：同类 vault 对手方永续对照（lane = peers，前缀 P）

> 产出说明：子 agent 把本文件写到了它自己的产物目录，主会话已原样搬到 `research/` 下。
> 调研时间：2026-10-13（UTC+8）。网页来源访问日期除注明外均为 2026-10-13。

**一句话总结**：Papertrade 的“交易者 vs 金库、预言机定价”结构直接继承自 GMX v1 / gTrade / Rollbit 这一系；“只向赢家收费”的 asymmetric impact 公式几乎逐项照搬自 Rollbit 公开的 market-impact 公式（只把 Rollbit 公式中随仓位名义值变化的那一项换成了每个市场固定的 referenceNotional，并把指数固定为 1）。它真正新的东西有三项：一是完全没有外部 LP 存款，资金池从 0 开始，付不出的盈利进入 FIFO 队列，没有赔付上限也不做 ADL；二是按亏损额铸币，代币发给亏损者，作为 LP 的收益权凭证；三是在同一条 L1 上直接读取订单簿 BBO 作为价格。同时，它放弃了同类产品经过事故才陆续加上的几乎所有防线：多源价格与偏离熔断、按 OI 偏斜收取的 price impact、funding/borrow、延迟执行或平仓费衰减、最大盈利与 ADL。GMX 2022 年的 AVAX 事件和 HLP 2025 年的 JELLY 事件都显示，“零 impact + 价格可被推动 + 名义敞口远大于源市场深度”这一组合迟早会被利用。Papertrade 上线次日就遇到了同类问题。

---

## P-Q1 逐个产品对照（统一维度）

**选择与排序理由**：Rollbit 是 Papertrade 自己写明的 impact 公式来源 [1][3]；GMX v1 是“外部 LP + 预言机 + 零 impact”模式的原型，v2 是它的修补版；gTrade 是同样做金库对手方的合成永续，杠杆高，还用代币做兜底，和 PAPER 最接近；Jupiter Perps 在官方文档里明确写到“有人在其他交易所推价格来攻击 JLP”的风险；Avantis（2026-09-14 起更名为 Veranta）是“只在盈利时收费”的链上版本；Ostium 在 2026 年转向链下对冲加劣后缓冲，正好和 Papertrade 方向相反，适合作对照；HLP 不是合成对手方，但 JELLY 和 ETH 鲸鱼两次事件是“金库被动承接仓位”最典型的教训。**没有找到**此前部署过 Martingaler 机制的项目（见“开放问题”）。

### 1. Rollbit（1000x Futures，中心化）

**答案**：Rollbit 是中心化、托管型的赌场兼合约平台。交易者的对手方是平台自己（house），价格来自 Rollbit 自建的多交易所指数。手续费有两种模式可选：“PnL Cut”只从盈利里抽成，“Flat Fee”按名义值收费。前者的 market-impact 公式就是 Papertrade asymmetric impact 的原型。

**依据**
- **定价源**：官方博客写道，“Rollbit uses a unique price-formulation strategy, which makes the Rollbit index robust to market manipulation… on individual exchanges” [4]。也就是说，Rollbit 用的是聚合多个交易所的指数，具体由哪些交易所组成在本轮没有核实（价格说明页直接抓取返回 403，见“命令与输出”）。
- **原始 market-impact 公式**（Rollbit 价格说明页，经搜索索引取得正文）[3]：“Rollbit instead uses a market impact formula to set the closing price for winning trades (losing manually-closed trades are unaffected)… P_close(T) = P(t) + ((1 - base_rate) / (1 + 1/abs((P(T)/P(t) - 1)*rate_multiplier)^rate_exponent + bet_amount*bet_multiplier/(10^6*abs(P(T)/P(t) - 1)*position_multiplier)))*(P(T) - P(t))”。参数会“按当前市场条件设定”，当前取值在另一页面，本轮没能读到。
- **成本结构**：PnL Cut 模式下开平仓不收费，只在盈利时按仓位大小、持仓时间和杠杆抽取一定比例的盈利；Flat Fee 模式下开仓和平仓各收 4 bps，另加一笔随仓位大小变化的滑点费 [4]。持仓超过 8 小时后可能按小时收付 funding，8 小时内平仓不产生 funding [3][4]。
- **爆仓**：“Rollbit guarantees that busts and stop loss trades will consistently be filled at a price predetermined at entry. Bust losses are limited to the original bet amount” [3]。这与 Papertrade 的 hard bust（触及爆仓价即没收全部保证金）是同一种语义。
- **风控**：默认每个用户的总持仓上限为 $1,000,000，部分山寨币为 $300,000，可以申请提额；波动大时会临时下调最高杠杆 [4]（2023-07 的博客，当前参数没有核实）。
- **LP 资本来源 / 偿付**：资金是平台自有的 bankroll，没有外部 LP，也没有链上可以核实的储备。Martingaler 白皮书点名说 Rollbit “continue to suffer from this [solvency] concern” [2]。
- **踩过的坑**：没有找到官方 post-mortem。第三方链上监测站 Tekel Data 报告，Rollbit 被追踪到的储备在 2026-08 的约 7 天内从约 $20.2M 降到约 $1.9M，但它自己声明“not a statement on solvency”，而且只覆盖部分钱包 [36]。论坛和博客上有不少“盈利后提现被冻结”的指控，多数和赌场、体育博彩有关，未经核实 [37]。

**不确定之处**：公式参数的当前取值、指数由哪些交易所组成、`bet_amount × bet_multiplier` 是否就等于名义仓位（Papertrade 文档说 Rollbit 的 term2 随“actual position notional”变化 [1]，与这一理解一致，但 Rollbit 自己的页面没有明说）、价格说明页的全文（403）。

### 2. gTrade（Gains Network）

**答案**：gTrade 是链上的合成永续，交易者以 gToken 金库（gUSDC、gDAI、gETH 等，遵循 ERC‑4626）为对手方。价格取自定制 Chainlink DON 返回的多源中位数，执行时要等预言机回调。成本包括开平仓费、固定价差、price impact（按流动性和偏斜计算）、funding 和 borrow，平仓费在开仓后约 10 秒内还会成倍放大。金库抵押率低于 100% 时会铸造 GNS 卖出来补充金库，这是“用代币兜底 LP”的先例。

**依据**
- **定价**：“Orders request on-demand spot prices from a custom Chainlink DON… fetch the median spot price for each trading order”，DON 会过滤掉单一交易所的异常价格 [17]；PriceAggregator 合约有 `_minAnswers`，凑够这么多个回答后取中位数执行 [17]。
- **成本（2026-09-30 版文档）**：BTC/ETH 开平仓各 0.035%，固定价差每边 0.005%；Degen 交易对固定 500x，开平仓各 0.02%。总 price impact = 固定价差 + 流动性 impact + 偏斜 impact，其中流动性 impact 按 Binance 1% 深度分档计算。funding 在多空之间互付，borrow 由 OI 较大的一方支付给金库 [15]。
- **平仓费衰减**：开仓或加仓后，平仓费乘数从 30x 开始逐块下降，约 10 秒（Arbitrum 上 40 个区块）后回到 1x。官方给的理由是“protects the vault against round trips held for only a few seconds, which trade on the short delay before a price move settles on chain” [15]。
- **最高杠杆**：当前文档写的是加密货币最高 500x、外汇 1000x、商品 250x [17]。“Degen 模式 1000x”在当前文档里**并不存在**，Degen 交易对是固定 500x [15]。
- **LP 与偿付**：金库是所有交易的对手方，获得 15% 的手续费 [15][16]；PnL 按 epoch 快照记账，LP 提现要等 1–3 个 epoch，抵押率越高等待越短 [16]。抵押率超过 100% 时，部分交易者亏损用于 OTC 回购并销毁 GNS；低于 100% 时铸造 GNS 在 OTC 卖出来补充金库，每 24 小时最多铸造总量的 0.05%（年化 18.25%）[16]。
- **风控**：最大 OI 按交易对和相关交易对组分别封顶，金库 maxOi 由 TVL、过度抵押部分、ATR 和 GNS 市值共同决定 [19]；交易激励中“手续费”这一类的奖励封顶为协议手续费的 75% [18]。
- **踩过的坑**：没有找到资金被盗的 post-mortem。Pashov 的审计发现过 v9.2 之前开的仓位在“加仓后平仓”时只付一半价差和 impact 的记账漏洞（审计发现，不是线上事故）[38]。

**不确定之处**：常被转述的“单笔最高盈利 900%”上限在当前文档中没有找到（只在 Bybit Learn 的二手文章里出现），本轮不采用。

### 3a. GMX v1（GLP）

**答案**：外部 LP 把资产存入 GLP 多资产池，作为所有交易的对手方。价格以 Chainlink 为参考，keeper 推送快速价格（新版合约改从 Pyth 读取），快速价格偏离参考价过多时会自动拉开买卖价差。对外宣传“minimal spread and zero price impact”。2022-09 发生 AVAX 价格操纵事件，2025-07 GLP 的 AUM 计算被重入攻击，损失约 $42M。

**依据**
- **定价**：`FastPriceFeed.getPrice()` 平时返回 keeper 推送的 fastPrice；如果它与 Chainlink refPrice 的偏离超过 `maxDeviationBasisPoints`，或 watcher 投票标记了问题，或累计偏差超过 `maxCumulativeDeltaDiffs`，就改为返回两者中对交易者不利的那个价格（即产生价差）；快速价格超过 `priceDuration` 没有更新时，退回 refPrice 并加上 spread [9]。这正是 Papertrade PriceOracle 所没有的“偏离熔断”[1]。
- **零 impact 与 AVAX 事件（2022-09-18）**：GMX 官方推文（Cointelegraph 转引）：“We were notified of price manipulation of AVAX/USD on reference exchanges… open-interest for AVAX has been capped at $2m long / $1m short” [10]。据 Joshua Lim（Genesis）的分析，攻击者以每轮 $4–5M 的规模在 GMX 上零滑点开仓，同时在 CEX 上推高 AVAX 价格，循环 5 轮，净利约 $565k。他称这是“GMX working as designed”[10]（媒体报道，金额未经独立核实）。
- **2025-07-09 V1 被攻击**：CertiK 的分析说，攻击者通过重入绕过 ShortsTracker，使全局空头均价没有被更新，GLP 的 AUM 因此被高估，再赎回 GLP 获利，约 $42M [11][14]。治理论坛的“GLP Distribution – Plan of Action”提议分发追回的资金，并由 DAO 金库出 $2.0M 补缺口 [12]。The Block 报道约 $44M 以 GLV 形式分发，“making all impacted Arbitrum GLP holders whole”[13]。

**不确定之处**：v1 的历史费率、最高杠杆（常说 50x）本轮没有找到一手文档（gitbook 无法抓取），因此不写入台账。

### 3b. GMX v2（GM / GLV 池）

**答案**：仍然由外部 LP 做对手方，但按市场分池（GM），价格改用 Chainlink Data Streams，执行采用“用户下单 → keeper 执行”两步。新增了按 OI 不平衡计算的 price impact（有上限，超出部分在 5 天后可领回）、自适应 funding、按利用率计算的 borrow，以及 reserve factor、MAX_PNL_FACTOR 和 ADL。最高杠杆 100x。

**依据**
- 开平仓费为仓位的 0.04% 或 0.06%，取决于这笔交易是缩小还是扩大多空不平衡；price impact 公式为 `(initialImbalance^exponent × factor) − (finalImbalance^exponent × factor)`；主流市场负向 impact 上限 50 bps，正向上限 40 bps；超出上限的负 impact 在 5 天后可作为返还领取，“The delay protects against manipulation”[5]。另外，单资产池 BTC/USD[WBTC.e‑WBTC.e] 和 ETH/USD[WETH‑WETH] 的 position impact 系数被设为 0，“no price impact of any kind”[5]。
- funding 按多空比自适应，borrow 用来防止有人“reserving all pool liquidity by opening equal long and short positions at minimal cost”[5]。
- 未实现盈亏与池子价值之比超过 `MAX_PNL_FACTOR_FOR_ADL` 时，盈利仓位会被自动减仓 [6]；`available liquidity = pool tokens × reserve factor − reserved tokens`，reserve factor 一般在 0.5–0.95，另有每侧 MAX_OPEN_INTEREST 上限和 MAX_POOL_AMOUNT 上限 [7]。
- 价格源为 Chainlink Data Streams；最高 100x；LP 获得 63% 的手续费 [8]。

**不确定之处**：GLV 和各池的实时参数（Monitor 页面）没有读取。

### 4. Jupiter Perps（JLP，Solana）

**答案**：JLP 池（SOL、ETH、wBTC、USDC 等）作为对手方，价格以 Edge by Chaos Labs 为主源、Chainlink 和 Pyth 作校验与后备，执行同样是“请求 → keeper 执行”两笔交易。成本包括 0.06% 开平仓费、price impact 费、按小时计的 borrow 费。最高 250x。

**依据**
- 文档原文：“Token prices are sourced from three independent oracles: Edge by Chaos Labs (primary), Chainlink, and Pyth”；“Every trade on a JLP market requires two onchain transactions”；最高杠杆 250x；LP 获得 75% 的手续费 [20]。
- 费用：开仓和平仓各 0.06%，另有线性 price impact 费和 OI 不平衡时额外加收的 impact 费；borrow 按小时，计算方式为利用率 × 小时费率 × 仓位大小 [21][22]。
- 官方帮助中心直接写出了引入 price impact 费的原因：“It also opens up the possibility for attackers to target Jupiter Perpetuals by moving prices on other exchanges and opening positions in Jupiter Perpetuals to profit from the price movement because price impact fees are not charged” [22]。

**不确定之处**：没有找到 JLP 层面的价格操纵事件 post-mortem，本轮没有深入调查 JLP 的历史损失。

### 5. Ostium（Arbitrum，以 RWA 为主）

**答案**：2026-04 之前，Ostium 的 OLP 金库按抵押率（c-ratio）给交易者兑付盈亏。2026-04 升级之后，变成“链上金库即时兑付 + 链下对冲”：方向性头寸在链下通过做市商、主经纪商对冲，链上金库分为两层，劣后的 buffer 由 Ostium 关联方和战略伙伴出资，交易者盈亏先由 buffer 全额吸收，OLP 处于优先档。价格来自自建的共识预言机（旧文档写的是：RWA 用 Stork 节点，加密资产用 Chainlink Data Streams）。最高 200x。

**依据**
- 原文：“OLP capital sits in the senior loss position, protected by a buffer that absorbs trader PnL first… buffer of junior capital posted by Ostium affiliates and strategic partners”；buffer 每天在结算时用链下对冲盘的收益补足 [23]。术语表写着“Post-upgrade, directional trader flow is hedged offchain”，并说 OC（过度抵押）是“pre-April 2026 model”的说法 [23]。
- 价格：“Ostium's in-house consensus oracle… Multiple independent publishers… cryptographically sign it”；最高 200x；75 个交易对 [24]。旧版（已标为 deprecated 的）文档写的是 RWA 用 Stork、加密资产用 Chainlink Data Streams [25]。

**不确定之处**：buffer 的规模、链下对冲对手方的信用风险、升级前后的历史事故，本轮都没有核实。

### 6. Avantis → Veranta（Base）：Upside Perps（原 “Zero Fee Perps”）

**答案**：Avantis 已于 2026-09-14 更名为 Veranta，合约和协议不变。它的“只在盈利时收费”产品现在叫 Upside Perps：没有开平仓费和 borrow 费，亏损时不收交易费，盈利时交易者保留 75–95% 的利润，收益率越高保留比例越高。覆盖 BTC、SOL、ETH、XRP、HYPE，最高 250x。价格来自 Pyth Pro（Lazer）低延迟价格加 Chainlink，对手方是 USDC 金库。

**依据**
- Upside Perps 页面：“no fee to open, no fee to close, and no borrow fee, ever. If your trade loses, you pay nothing. If it wins, you keep 75 to 95% of the profit… up to 250x” [26]。
- 关于持仓成本，同一家的文档前后矛盾。Upside 页面说“the position costs nothing to hold while you wait”[26]，而 Fees 页面说“Funding still accrues while you hold”，费率表也写着 “holding costs (funding fee) still applies” [27]。
- 更名：“Avantis rebranded to Veranta on September 14, 2026. The protocol, the contracts… are all unchanged” [28]。
- 定价：“Avantis uses Pyth Pro's low latency price feeds and Chainlink's decentralized network”；“The avUSDC vault takes the other side” [29]。

**不确定之处**：利润分成曲线的具体公式（“Profit sharing”子页面没有读取）；LP 是否分层（tranche）只在一个疑似非官方的域名 avantisfi.org 上看到，没有采用。另外，搜索结果中出现了明显的钓鱼域名 app.avantlsfl.com，引用时要小心。

### 7. Hyperliquid HLP（订单簿做市金库，不是合成对手方）

**答案**：HLP 是协议所有、社区出资的金库，在 HyperCore 订单簿上用多种做市策略提供流动性，并负责承接清算，存款锁定 4 天。它不是合成对手方，但在清算接管仓位时会被动承担方向性风险。2025-03 的两次事件都是“金库被动承接仓位”造成的。

**依据**
- 原文：“HLP is a protocol vault that provides liquidity to Hyperliquid through multiple market making strategies, performs liquidations…”，存款锁定 4 天 [30]。
- **ETH 鲸鱼事件（2025-03-12）**：CoinDesk 引述 Hyperliquid 的说法：“This user had unrealized PNL, withdrew, which lowered their margin, and was liquidated. They ended with ~$1.8M in PNL. HLP lost ~$4M”，随后 BTC 和 ETH 的最高杠杆分别下调到 40x 和 25x [32]（媒体转引）。现行保证金文档规定，提取未实现盈利后，剩余保证金必须满足 `transfer_margin_required = max(initial_margin_required, 0.1 * total_position_value)` [31]。这条规则与该事件的因果关系是推论。
- **JELLY 事件（2025-03-26）**：交易者在 Hyperliquid 上开 JELLY 空单，同时在链上买入现货推高价格，让自己的空单被清算，空头仓位因此转给 HLP；HLP 的未实现亏损一度约为 $13.5M（Lookonchain 数据，CoinDesk 报道）。验证者“convened and voted to delist JELLY perps”，以 $0.0095 强制结算（当时预言机喂价约 $0.50），“All users apart from flagged addresses will be made whole from the Hyper Foundation” [33][34]（媒体转引 Hyperliquid 的 X 帖）。

**不确定之处**：HLP 当前的最高杠杆和风控参数没有逐项核对；JELLY 事件中 HLP 最终的损益以 Hyperliquid 的说法为准（据称没有亏损，24 小时净收入约 $700k [34]），没有独立核算。

### 8. Papertrade（作为对照基线，仅列与本节相关的事实）

- **定价**：同一条 L1 上的 HyperCore BBO 预编译，取买一卖一的中间价；没有偏离、TWAP 或回看熔断，只在返回零或盘口交叉时 revert [1]。
- **成本**：没有名义手续费、价差、funding 和 borrow；盈利平仓依次经过 0.2 bps 死区、asymmetric impact、2% 盈利费 [1]。
- **LP**：从 $0 开始，不接受直接存款；PAPER 按亏损铸造 [1]。
- **偿付**：付不出的盈利进入 FIFO 队列，没有上限，不做 ADL [1]。
- **风控**：单仓名义值上限 $10M；每侧 OI cap 的目标是“当前 OI + $1B”的余量；5 bps 爆仓缓冲；可永久下架某个市场 [1]。
- **最高杠杆**：1000x [1]。
- **踩过的坑**：2026-10-11 团队承认出现 BBO 操纵尝试，并开始收紧 OI cap [35]（媒体转述官方 X 帖）。

---

## P-Q2 演进线

**答案**：沿着这条线，大家依次在补同一个缺口：预言机定价让交易者拿到了“免费的流动性期权”，而 LP 承担了逆向选择。GMX v1 用“零 impact”换来了好体验，也因此暴露了漏洞；v2、gTrade、Jupiter 先后补上 price impact、偏斜费、延迟执行和 ADL；Rollbit 和 Avantis 把成本从名义值挪到“盈利”上。Papertrade 沿用了“只对盈利收费”和金库对手方模式，真正新的地方在于**资本侧**（零启动资本、队列、按亏损铸币）和**价格侧**（同链读取订单簿 BBO），但它在价格防线上反而比 GMX v1 还退了一步。

**依据（逐步）**
1. **外部 LP + 预言机 + 零 impact（GMX v1，2021 起）**：解决了不需要做市商也能有深度的问题，用 LP 资金承接任意规模、零滑点的交易 [10]。引入的问题是：参考价格可以在别的交易所被推动，LP 无偿卖出了这份期权（AVAX 2022 [10]）。v1 有 fastPrice 对 Chainlink 的偏离价差机制 [9]，但没有挡住 AVAX 这类真实推价，因为两个价格源同时被推动了（推论）。
2. **加 price impact / 偏斜费 / 延迟执行 / ADL（GMX v2、gTrade、Jupiter）**：price impact 按 OI 不平衡计费且有上限 [5]；gTrade 再叠加按 Binance 深度计算的流动性 impact 和偏斜 impact [15]；Jupiter 明确是为了防止“在别处推价再来开仓”[22]；执行都是两步加 keeper [5][20]；ADL 和 MAX_PNL_FACTOR 给 LP 的最大负债设了上限 [6][7]；gTrade 还用平仓费衰减专门对付“预言机延迟窗口内的来回交易”[15]。代价是成本更高、费用结构更复杂，“零滑点”也名存实亡（GMX 只在单资产 BTC/ETH 池保留零 impact [5]）。
3. **只对盈利收费（Rollbit PnL Cut、Avantis/Veranta Upside）**：把成本放到赢家的盈利上，亏损者不额外付费，这在高杠杆下有吸引力。Rollbit 按“价格变动幅度 × 仓位大小”调整 haircut，小幅变动的盈利被扣得最多 [3]；Upside 的赢家保留 75–95% [26]。引入的问题是：LP 的收入几乎全部来自“交易者亏损 + 赢家折扣”，与交易者总体的胜率直接绑定。
4. **代币兜底 LP（gTrade GNS 铸币）**：金库抵押率低于 100% 时铸 GNS 卖给市场来补充金库，每天有上限 [16]。这是“用代币稀释换 LP 偿付能力”的先例。
5. **零启动资本 + 队列 + 亏损铸币（Papertrade）**：没有外部 LP，付不出的盈利排进 FIFO 队列，PAPER 按亏损铸造，作为 LP 收益权 [1][2]。和第 4 步相比有两点不同：铸出的代币发给亏损者而不是卖给市场；它不承诺即时偿付，而是把“即时偿付”换成了“最终偿付”。
6. **反方向的 Ostium（2026-04）**：把方向性风险对冲到链下，由劣后 buffer 先吸收交易者盈亏 [23]，说明另一派正在把风险推出金库。

**Papertrade 真正新的地方**（由 P‑Q1 各节推出）
- (a) 完全没有外部 LP 存款，以 FIFO 队列替代即时偿付，没有赔付上限也不做 ADL。在找到的永续产品中，这一点是独有的；理论来自 Martingaler 白皮书，白皮书原本针对的是“游戏”[2]。
- (b) 亏损铸币：PAPER 按亏损额发给亏损者，作为 LP 收益权凭证 [1]。gTrade 的 GNS 铸币是卖给市场来补金库 [16]，两者的机制不同。
- (c) 同链读取订单簿 BBO 作为价格：在这些产品中唯一一个以单一场所的盘口中间价、按区块读取作为结算价的 [1]。其他产品都用多源中位数或聚合指数 [4][8][17][20][24][29]。
- (d) asymmetric impact 中把仓位项固定为 referenceNotional，haircut 因此与单笔仓位大小无关 [1]；Rollbit 原式的这一项随仓位变化 [3]。

**沿用的部分**：金库对手方模式（GMX/gTrade/JLP）；只对盈利收费（Rollbit/Avantis）；impact 公式本身（Rollbit）；hard bust 语义（Rollbit [3]）；每侧 OI cap；keeper 清算。

**放弃的部分**：多源价格与偏离熔断（GMX v1 [9]）；按 OI 偏斜收费、funding/borrow（GMX v2 [5]、gTrade [15]）；延迟执行与平仓费衰减（gTrade [15]）；ADL 和最大 PnL 上限（GMX v2 [6]）。

**不确定之处**：“所有已知永续产品中唯一”只是对本轮检索范围的判断（标为 speculative）；Rollbit 的参数不公开，所以 Papertrade 去掉仓位项后 haircut 是变宽还是变严，无法定量比较。

---

## P-Q3 共通教训（每条配一个事件）

**答案**：一共六条教训。(1) 零 impact 加上可被推动的参考价格，等于把期权白送给攻击者；(2) 金库被动接仓 + 薄市场 = 被定向挤压；(3) 名义敞口远大于源市场深度或 LP 规模时，赔付由流动性而不是由“公平价格”决定；(4) LP 的期望收益完全来自交易者亏损和费用，一旦出现有信息优势的流量，就要靠 impact、延迟或费用来补偿；(5) 最大盈利上限和 ADL 是金库保持偿付能力的最后防线，Papertrade 用排队取代了它们；(6) 激励一旦与交易量或亏损挂钩，就需要设上限，否则会被刷量。

**依据**
1. **预言机 / 价格操纵——GMX AVAX（2022-09-18）**：零滑点开仓 + 在参考交易所推价，每轮 $4–5M，净利约 $565k（媒体报道 [10]）。GMX 事后把 AVAX 的 OI 限制为多 $2M、空 $1M [10]。Papertrade 2026-10-11 的事件模式相同：团队承认有人尝试操纵 BBO，随后收紧 OI cap（DeFi Prime 转述 [35]）；The Block 报道约 $1.28M 的数字时，自己注明无法独立核实。Papertrade 文档也承认，OI cap “not… a loss ceiling”[1]。
2. **薄市场 + 金库被动接仓——HLP JELLY（2025-03-26）**：攻击者先让自己的空单被清算，把仓位转给 HLP，再在链上推高现货价格，HLP 未实现亏损一度约 $13.5M；最后靠验证者投票下架并以 $0.0095 强制结算才止损（媒体报道 [33][34]）。对 Papertrade 的意义（推论）：BBO 来自 Hyperliquid 主流 BTC/ETH 盘口，深度远好于 JELLY，但 Papertrade 每单最高 $10M、OI cap 余量按 $1B 设定，而 LP 只有约 $5M（团队 2026-10-11 自述 [35]），名义敞口与 LP 的比例比 HLP 极端得多。
3. **名义敞口与真实流动性不匹配——HLP ETH 鲸鱼（2025-03-12）**：提走未实现盈利后故意让仓位被清算，把平仓的滑点转嫁给 HLP，HLP 亏损约 $4M（媒体转引官方 [32]）。Hyperliquid 的修补是降低最高杠杆，并规定提取后剩余保证金至少为仓位价值的 10% [31][32]。Papertrade 的仓位无法追加或提取保证金，也不会在 HL 上真实平仓 [1]，所以这一具体路径不存在；但“源市场深度 ≠ 合成敞口的承受能力”这个问题依然存在（推论）。
4. **LP 的期望收益来源**：gTrade 自己写明“As long as fees earned is greater than PnL payouts, stakers earn a positive return”[16]；JLP 和 GM 池的 LP 分别拿 75% 和 63% 的手续费 [8][20]。Papertrade 的 LP 只有三项收入：交易者亏损（扣除队列为空时那 2% 的费用后的部分）、赢家被扣掉的 impact、以及赢家的死区 [1]。它的 2% 费用全部分给质押者和开发者 [1]，不像 GMX、JLP 那样把大部分手续费分给 LP（推论）。
5. **最大盈利与 ADL**：GMX v2 在 PnL/池值超过阈值时自动减仓盈利仓位 [6]；Ostium 用劣后 buffer 先吸收 [23]。Papertrade 不设上限，也不做 ADL，超出的部分全部排队，等未来的亏损来偿还 [1][2]。效果上相当于“时间维度上的 ADL”：盈利不被削减，只被推迟（推论）。
6. **延迟套利**：gTrade 用平仓费衰减防范“价格变动还没在链上结算之前的几秒内来回交易”[15]；GMX v2 把超出上限的 impact 返还延后 5 天，明确是为了防操纵 [5]。Papertrade 在同一区块读取 BBO，没有预言机延迟，但同一区块的盘口可以被直接推动 [1]（推论：这是把“延迟套利”换成了“直接操纵”）。
7. **刷量与激励**：gTrade 的 ARB 交易激励中，“手续费”类奖励封顶为协议手续费的 75% [18]，从结构上保证刷量的成本高于所得奖励。Papertrade 的 PAPER 在 LP 低于 $2M 时按亏损每 $1 铸 100 枚，没有与费用挂钩的上限 [1]（多空对冲刷 PAPER 的成本测算属于 economics 路，本路只指出这一结构差异）。
8. **合约记账（补充）**：GMX v1 2025-07 被攻击的根因是 AUM 计算被操纵，用于 GLP 的铸造和赎回 [11]。Papertrade 没有 LP 份额的铸造与赎回，不存在这一类攻击面（推论）；但它的合约是可升级代理，所有者操作要经过 7 天 timelock 和 2-of-3 多签 [1]。

**不确定之处**：各事件中的金额主要来自媒体或第三方安全公司，只有 GMX 的赔付有治理论坛作为一手来源；Papertrade 事件的完整链上复盘属于另一路。

---

## 外部调研 / 用户资料中被修正的地方

1. **grok：“相比 Chainlink 类预言机或 TWAP，这套价格（BBO mid）更贴近真实可成交的市场中间价……高质量预言机”**：同类产品恰恰是为了抗操纵才放弃单一场所的价格。gTrade 用 DON 多源中位数并过滤单一交易所的异常 [17]；GMX v1 有 fastPrice 对 Chainlink 的偏离价差 [9]；Jupiter 用三家预言机互相校验 [20]；Rollbit 用多交易所聚合指数 [4]。Papertrade 自己的文档也承认没有偏离熔断 [1]。“贴近真实可成交价”与“不可被操纵”是两回事。
2. **grok：“因为没有真实 perp 仓位在 HL 上打开，也就没有 funding”**：GMX v2、gTrade 同样不在外部开仓，但照样收 funding 和 borrow [5][15]；Rollbit 是中心化的合成产品，也有 funding [3]。不收 funding 是 Papertrade 自己的设计选择，不是合成结构的必然结果（GPT 调研 §3.4 已有类似表述，这里用同类产品作为证据补强）。
3. **lane 说明 / 常见说法：“gTrade Degen mode 1000x”**：当前文档中 Degen 交易对是固定 500x，加密货币最高 500x，只有外汇到 1000x [15][17]。
4. **lane 说明：“Avantis（Base；zero-fee perps）”**：Avantis 已于 2026-09-14 更名为 Veranta [28]，产品现在叫 Upside Perps，赢家保留 75–95% 的盈利，最高 250x [26]。它的文档在持仓成本上前后矛盾 [26][27]。
5. **lane 说明：“Ostium（OLP 与流动性缓冲）”**：2026-04 之后，Ostium 的方向性流量在链下对冲，buffer 是关联方和伙伴出资的劣后档，OLP 是优先档 [23]。它已不是纯粹的金库对手方模型。
6. **lane 说明：“GMX v1 Chainlink + 快速价格”**：基本正确，但当前仓库里的 `FastPriceFeed` 从 Pyth 读取快速价格，并以 Chainlink 价格作为偏离参考 [9]（master 分支，部署历史上是否始终如此没有核实）。
7. **Papertrade 文档（Martingaler LP 页）把 Rollbit 和 SatoshiDice 等并列为“需要预先注资 LP 的游戏”**：Rollbit 的合约产品是中心化、托管型的，资金来自平台自有的 bankroll [3][4]；把它和链上游戏放在一起比较，“LP 被抽干”的含义并不相同（白皮书举的 LP 被抽干例子是 EtherCrash [2]）。
8. **GPT 调研 / 用户草稿**没有涉及同类产品的事实，本路没有其他需要修正的地方。

---

## 来源

1. **PRIMARY** Papertrade Docs 快照（《Asymmetric impact PnL》《Pricing: BBO precompile》《Risk》《Solvency & queue》《FAQ》《Martingaler LP》《PAPER mint curve》《Contract addresses》），原站 https://docs.papertrade.xyz/#/how/risk 等；本地快照 research/references/papertrade-docs-2026-10-12.md（访问 2026-10-12）。证明 Papertrade 的定价、成本、队列、风控、Rollbit 来源，以及 term2 的修改。
2. **PRIMARY** Martingaler 白皮书 https://docs.papertrade.xyz/martingaler-whitepaper.pdf（本地 txt，访问 2026-10-12）。证明队列机制、SRI，以及对 Rollbit 和 EtherCrash 的表述。
3. **PRIMARY** Rollbit《1,000x Leverage Trading with Instant Execution》https://rollbit.com/trading/price-formulation （直接抓取返回 403；正文经 parallel 搜索索引取得，访问 2026-10-13）。证明原始 market-impact 公式、爆仓语义、funding 规则。
4. **PRIMARY** Rollbit Blog《1,000x Leverage Crypto Futures》https://blog.rollbit.com/1000x-leverage-crypto-futures/ （2023-07，访问 2026-10-13）。证明 PnL Cut 与 Flat Fee（4 bps）、$1M 默认限额、指数定价。
5. **PRIMARY** GMX Docs《Fees》https://docs.gmx.io/docs/trading/fees/ （访问 2026-10-13）。证明 0.04/0.06% 费率、price impact 公式及上限、5 天返还、funding 与 borrow。
6. **PRIMARY** GMX Docs《Liquidations and ADL》https://docs.gmx.io/docs/trading/liquidations/ （搜索摘录，访问 2026-10-13）。证明 MAX_PNL_FACTOR_FOR_ADL。
7. **PRIMARY** GMX Docs《Providing liquidity》https://docs.gmx.io/docs/providing-liquidity/ （搜索摘录）。证明 reserve factor、OI cap、MAX_PNL_FACTOR。
8. **PRIMARY** GMX Docs 首页 https://docs.gmx.io/ 与 /docs/intro（访问 2026-10-13）。证明 100x、Chainlink Data Streams、LP 获得 63% 的手续费。
9. **PRIMARY** gmx-io/gmx-contracts `contracts/oracle/FastPriceFeed.sol`（master，raw.githubusercontent.com，访问 2026-10-13，未固定 commit），`getPrice()` / `favorFastPrice()`。证明 v1 有偏离价差机制。
10. Cointelegraph 2022-09-19《Decentralized exchange GMX suffers $565K price manipulation ‘exploit’》https://cointelegraph.com/news/decentralized-exchange-gmx-suffers-565k-price-manipulation-exploit （转引 GMX 推文 status/1571439325413511169 及 Joshua Lim 的分析）。媒体报道。
11. CertiK《GMX Incident Analysis》https://www.certik.com/blog/gmx-incident-analysis 。安全公司的分析，证明 2025-07 的根因（重入 + 空头均价未更新 → AUM 被高估）。
12. **PRIMARY** GMX 治理论坛《GLP Distribution – Plan of Action》https://gov.gmx.io/t/glp-distribution-plan-of-action/4703 （2025-07-22）。证明 DAO 出 $2.0M 补缺口、按 GLV 分发。
13. The Block 2025-08-14《GMX finalizes $44 million plan…》https://www.theblock.co/news/ecosystems/2025-08-14-gmx-44-million-compensation-plan-366890 。媒体报道约 $44M 的分发。
14. CoinDesk 2025-07-09《GMX Exploited for $42M》https://www.coindesk.com/business/2025/07/09/decentralized-exchange-gmx-exploited-for-usd42m-offers-hacker-10-white-hat-bounty 。媒体报道。
15. **PRIMARY** Gains Docs《Fees & Spread》https://docs.gains.trade/gtrade-leveraged-trading/fees-and-spread （参数截至 2026-09-30，访问 2026-10-13）。证明费率、Degen 500x、impact 构成、平仓费衰减。
16. **PRIMARY** Gains Docs《gToken Vaults》https://docs.gains.trade/liquidity-farming-pools/gtoken-vaults 。证明金库是对手方、epoch 机制、GNS 铸币与销毁兜底。
17. **PRIMARY** Gains Docs《Overview》https://docs.gains.trade/gtrade-leveraged-trading/overview 及 GNSPriceAggregator 参考页（搜索摘录）。证明 DON 中位数定价、500x/1000x/250x。
18. **PRIMARY** Gains Docs《Trading Incentives》https://docs.gains.trade/gtrade-leveraged-trading/incentives/trading-incentives 。证明“手续费”类奖励封顶为手续费的 75%。
19. **PRIMARY** Gains Docs《Trade Collaterals》https://docs.gains.trade/gtrade-leveraged-trading/trade-collaterals 。证明 maxOi 公式。
20. **PRIMARY** Jupiter Docs《Jupiter Perps》https://docs.jup.ag/user-docs/trade/perps （访问 2026-10-13）。证明三家预言机、两笔交易执行、250x、LP 获得 75%。
21. **PRIMARY** Jupiter Docs《Fees》https://docs.jup.ag/user-docs/trade/perps/fees （搜索摘录）。证明 0.06% 费率与 impact 费。
22. **PRIMARY** Jupiter 帮助中心《Fees》https://jupiverse.zendesk.com/hc/en-us/articles/18735045234588-Fees 。证明引入 impact 费是为了防止外部推价攻击，以及 borrow 公式。
23. **PRIMARY** Ostium Docs《Vault Overview》https://docs.ostium.com/vault/overview 及《Glossary》。证明 buffer 劣后档、链下对冲、2026-04 的升级。
24. **PRIMARY** Ostium Docs《How Ostium Works》https://docs.ostium.com/protocol/how-ostium-works.md 。证明自建共识预言机、200x。
25. **PRIMARY**（已标为 deprecated）Ostium GitBook《Price Oracle》https://ostium-labs.gitbook.io/ostium-docs/supporting-infrastructure/price-oracle 。证明旧版是 Stork（RWA）+ Chainlink Data Streams（加密）。
26. **PRIMARY** Avantis/Veranta Docs《Upside Perps》https://docs.avantisfi.com/trading/upside-perps （正文已指向 docs.veranta.xyz，访问 2026-10-13）。证明赢家保留 75–95%、250x、不收开平仓费，以及“costs nothing to hold”的说法。
27. **PRIMARY** Avantis Docs《Fees》https://docs.avantisfi.com/trading/fees 与《Fee Schedule by Asset Class》（搜索摘录）。证明 Upside 仍会产生 funding（与 [26] 矛盾）。
28. **PRIMARY** Veranta SDK《Avantis is now Veranta》https://sdk.veranta.xyz/migration/rename 。证明 2026-09-14 更名、合约不变。
29. **PRIMARY** Avantis Docs《Trading》《Overview》https://docs.avantisfi.com/trading 、/trading/overview （搜索摘录）。证明 Pyth Pro + Chainlink、avUSDC 金库作为对手方。
30. **PRIMARY** Hyperliquid Docs《Protocol vaults》https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/vaults/protocol-vaults 。证明 HLP 的职能、4 天锁定。
31. **PRIMARY** Hyperliquid Docs《Margining》https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margining 。证明提取保证金时剩余 ≥ 10% 仓位价值的规则。
32. CoinDesk 2025-03-12《Hyperliquid Loses $4M After Whale's Over $200M Ether Trade Unwinds》https://finance.yahoo.com/news/hyperliquid-loses-4m-whales-over-124005325.html （转引 Hyperliquid 的 X 帖）。媒体报道。
33. CoinDesk 2025-03-26《HyperLiquid Delists JELLY After Vault Squeezed in $13M Tussle》https://sg.finance.yahoo.com/news/hyperliquid-delists-jelly-vault-squeezed-160020190.html 。媒体报道。
34. Cointelegraph 2025-03-26《Hyperliquid delists JELLY perps, citing ‘suspicious’ activity》https://cointelegraph.com/news/hyperliquid-delists-jelly-perps-citing-suspicious-activity 。媒体报道（转引官方表态与 HLP 约 $700k 的 24 小时收入）。
35. DeFi Prime《Papertrade Tightens OI Caps After BBO Manipulation Attempts》https://defiprime.com/papertrade-tightens-caps-after-bbo-manipulation （转述 Papertrade X status/2109308773231911359，访问 2026-10-13）。媒体报道，证明团队承认操纵尝试并收紧 cap、自述 LP 约 $5M。（The Block 2026-10-11 的原文返回 403，没有核对。）
36. Tekel Data《Rollbit tracked reserves down -90.5% (~7d)》https://tekeldata.com/incidents/815 （2026-08-12）。第三方链上观察，自己声明不对偿付能力下结论。
37. ltccasino《The Rollbit Files TLDR》https://ltccasino.com/cryptocasino/rollbit-files 。汇总的指控，未经核实，仅作线索。
38. Pashov Audit Group《GainsNetwork-security-July2》https://github.com/pashov/audits/blob/master/team/md/GainsNetwork-security-July2.md 。审计发现（不是线上事故）。

---

## 命令与输出

- `fetch_content https://rollbit.com/trading/price-formulation` → `HTTP 403: Forbidden`。公式正文改从 web_search（parallel）索引摘录取得（responseId mv5h6hhnr0jr48）。
- `fetch_content https://www.theblock.co/news/defi/2026-10-11-...-418239` → `HTTP 403`，未核对。
- `fetch_content raw https://raw.githubusercontent.com/gmx-io/gmx-contracts/master/contracts/oracle/FastPriceFeed.sol` → 成功（master，未固定 commit）。关键注释原文：“there will be a spread from the _refPrice to the fastPrice in the following cases: … in case the maxDeviationBasisPoints between _refPrice and fastPrice is exceeded”。
- **手工核算 Papertrade 的 asymmetric impact**（按文档 BTC 参数：baseRate 0.10，rateMultiplier 15,000，referenceNotional 100,000，positionMultiplier 814.598，死区 0.2 bps）[1]：
  - 价格变动 1%：死区后 move = 0.00998；term1 = 1/(0.00998×15000) = 0.00668；term2 = 100000/(1e6×0.00998×814.598) = 0.01230；scale = 0.9/1.01898 = 0.8832；乘以死区后的保留比例 0.998，约为 **0.881** 的原始盈利，与文档的“about 88%”一致。
  - 价格变动 0.1%：move = 0.00098；term1 = 0.0680；term2 = 0.1253；scale = 0.9/1.1933 = 0.7542；乘以 0.98，约为 **0.739**，与文档的“about 74%”一致。
  - **与 Rollbit 原式的结构对照**：Rollbit 的 term2 = bet_amount·bet_multiplier/(1e6·|r|·position_multiplier) [3]，Papertrade 的 term2 = referenceNotional/(1e6·move·positionMultiplier) [1]，即把 bet_amount·bet_multiplier 换成常数，同时 rate_exponent 取 1。**示意（推论，借用 Papertrade 的参数，不代表 Rollbit 的实际参数）**：如果 term2 随名义值变化，那么名义值 $1M、价格变动 0.1% 时 term2 = 1/(0.00098×814.598) ≈ 1.25，scale ≈ 0.9/2.32 ≈ 0.39；Papertrade 固定为 $100k 后 scale ≈ 0.754。也就是说，对大仓位，Papertrade 的版本要宽松得多。

---

## 开放问题

1. Rollbit 公式参数的当前取值（base_rate、rate_multiplier、rate_exponent、bet_multiplier、position_multiplier）和指数的构成：需要能打开 rollbit.com 的环境。没有这些数据，就无法定量比较 Papertrade 与 Rollbit 的 haircut 宽严。
2. 有没有项目在 Papertrade 之前部署过 Martingaler 队列机制？白皮书作者署名为 “Jez @izebel_eth” 和 “Blurr, Refund Contract Deployer”，“Refund Contract” 是否指某个已部署的游戏合约，本轮检索没有结果。
3. gTrade 的“900% 最高盈利上限”在当前版本中是否仍然存在（本轮只在二手资料里看到）。
4. Veranta Upside 的利润分成曲线公式，以及持仓期间到底是否收 funding（文档自相矛盾）。
5. Ostium 劣后 buffer 的规模和链下对冲对手方，以及 2026-04 升级前是否发生过 OLP 亏损事件。
6. HLP 当前各资产的最高杠杆，以及 JELLY 事件后 Hyperliquid 是否有正式的书面规则改动（例如上新或下架的 OI 限额），本轮只核实了保证金提取的 10% 规则。
7. Papertrade 的 OI cap 实际下调到多少（链上的 `setOICap` 事件），留给 events / onchain 路。

---

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| P1 | Papertrade 文档自述 asymmetric impact 改编自 Rollbit 的 market-impact 模型 | [1]《Asymmetric impact PnL》§Inspiration | observed | |
| P2 | Rollbit 公开的公式只对盈利交易调整平仓价，亏损的手动平仓不受影响 | [3] “market impact formula to set the closing price for winning trades (losing manually-closed trades are unaffected)” | observed | |
| P3 | Rollbit 原式含 base_rate、rate_multiplier^rate_exponent，以及 bet_amount·bet_multiplier/(1e6·\|r\|·position_multiplier) 三项 | [3] P_close(T) 公式原文 | observed | |
| P4 | Papertrade 公式 = Rollbit 原式取 rate_exponent=1，并把 bet_amount·bet_multiplier 换成每个市场固定的 referenceNotional | 由 P3 与 [1]《The formula》对比推出：两式逐项对应，只有这两处不同 | inferred | |
| P5 | 按文档 BTC 参数，1% 和 0.1% 的价格变动分别保留约 88% 和 74% 的原始盈利，手工复算一致 | notes §命令与输出 核算；[1] | observed | |
| P6 | 若 term2 随名义值变化，大仓位的 haircut 会明显加重；Papertrade 固定之后，对大仓位更宽松 | 由 P3、P5 推出：$1M 名义值、0.1% 变动时 scale 约 0.39，对比 0.754（借用 Papertrade 参数作示意） | inferred | |
| P7 | Rollbit 提供 PnL Cut（只从盈利中抽成）和 Flat Fee（开平仓各 4 bps 加滑点费）两种收费方式 | [4] §Fees | observed | |
| P8 | Rollbit 持仓超过 8 小时可能按小时收付 funding，8 小时内平仓不收 | [3] Funding Payments 段；[4] | observed | |
| P9 | Rollbit 的爆仓按开仓时确定的价格成交，亏损以本金为限（hard bust 语义） | [3] “busts… filled at a price predetermined at entry” | observed | |
| P10 | Rollbit 的价格来自自建的多交易所指数（具体构成未核实） | [4] §Price Formulation | observed | |
| P11 | Rollbit 是平台自有资金做对手方，没有链上可核实的储备；白皮书称它仍有偿付能力方面的疑虑 | [2] §1.2；[3][4]（没有外部 LP 的说明）；[36] 第三方观察到储备下降（自己声明不对偿付下结论） | inferred | |
| P12 | gTrade 以定制 Chainlink DON 的多源中位数定价，可过滤单一交易所的异常价格 | [17] Overview “median spot price… filters out outlier price action” | observed | |
| P13 | gTrade BTC/ETH 开平仓各 0.035%，固定价差每边 0.005%；Degen 交易对固定 500x，开平仓各 0.02% | [15] §Cryptocurrencies、§Degen（截至 2026-09-30） | observed | |
| P14 | gTrade 当前最高杠杆：加密货币 500x、外汇 1000x，并不存在“Degen 1000x” | [17] Summary；[15] §Degen | observed | |
| P15 | gTrade 的 price impact = 固定价差 + 流动性 impact（依据 Binance 1% 深度）+ 偏斜 impact，另收 funding 和 borrow | [15] §Price Impact、§Holding Fees | observed | |
| P16 | gTrade 平仓费在开仓后约 10 秒内从 30x 逐块降到 1x，用来防止利用预言机延迟来回交易 | [15] §Closing Fee Decay | observed | |
| P17 | gToken 金库是对手方，抵押率低于 100% 时铸 GNS 卖出补充金库，每天最多铸总量的 0.05% | [16] gToken 段 | observed | |
| P18 | gTrade 的交易激励中，“手续费”类奖励封顶为协议手续费的 75% | [18] Fees 段脚注 | observed | |
| P19 | GMX v1 的 FastPriceFeed 在快速价格偏离 Chainlink 参考价超过 maxDeviationBasisPoints 时，返回对交易者不利的那个价格 | [9] FastPriceFeed.sol getPrice()（master，未固定 commit） | observed | |
| P20 | 2022-09-18 GMX 官方宣布发现 AVAX 参考交易所价格被操纵，并把 AVAX 的 OI 限制为多 $2M、空 $1M | [10] 转引 GMX 推文 1571439325413511169 | observed | |
| P21 | 媒体报道 AVAX 攻击者每轮 $4–5M、共 5 轮、净利约 $565k，并称这是“GMX working as designed” | [10] Joshua Lim 的分析（未经独立核实） | observed | |
| P22 | 2025-07-09 GMX v1 因重入导致空头均价没有更新、GLP 的 AUM 被高估，损失约 $42M | [11] CertiK；[14] CoinDesk | observed | |
| P23 | GMX DAO 用金库 $2.0M 补缺口，以 GLV 赔付受影响的 GLP 持有人，媒体报道约 $44M 已分发 | [12] 治理论坛；[13] The Block | observed | |
| P24 | GMX v2 开平仓费 0.04/0.06%，按是否改善多空不平衡区分；price impact 按 OI 不平衡计算且有上限，主流市场负向上限 50 bps | [5] §Open/close fees、§Price impact caps | observed | |
| P25 | GMX v2 超出上限的负 impact 在 5 天后才可领回，官方说明这是为了防操纵 | [5] “The delay protects against manipulation” | observed | |
| P26 | GMX v2 在 PnL/池值超过 MAX_PNL_FACTOR_FOR_ADL 时自动减仓盈利仓位，另有 reserve factor 和每侧 OI cap | [6]；[7] | observed | |
| P27 | GMX v2 使用 Chainlink Data Streams，最高 100x，LP 获得 63% 的手续费 | [8] | observed | |
| P28 | Jupiter Perps 以 Edge by Chaos Labs 为主价格源、Chainlink 和 Pyth 作校验与后备，每笔交易分两步、由 keeper 执行，最高 250x | [20] Price Oracles、Execution Model、Key Parameters | observed | |
| P29 | Jupiter 开平仓各收 0.06%，另有 impact 费和按小时计的 borrow；JLP 获得 75% 的手续费 | [20]；[21]；[22] | observed | |
| P30 | Jupiter 官方说明 impact 费是为了防止有人在其他交易所推价后到 Jupiter 开仓获利 | [22] “attackers to target Jupiter Perpetuals by moving prices on other exchanges” | observed | |
| P31 | Ostium 在 2026-04 之后把方向性流量对冲到链下，由关联方和伙伴出资的劣后 buffer 先吸收交易者盈亏，OLP 为优先档 | [23] Vault Overview、Glossary | observed | |
| P32 | Ostium 使用自建的共识预言机，最高 200x；旧文档为 Stork（RWA）+ Chainlink Data Streams（加密） | [24]；[25] | observed | |
| P33 | Avantis 于 2026-09-14 更名为 Veranta，合约不变 | [28] | observed | |
| P34 | Upside Perps 不收开平仓费和 borrow 费，亏损不收交易费，赢家保留 75–95%，最高 250x | [26] | observed | |
| P35 | Veranta 文档在 Upside 是否收持仓 funding 上前后矛盾 | [26] “costs nothing to hold” 对比 [27] “Funding still accrues while you hold” | observed | |
| P36 | Avantis/Veranta 使用 Pyth Pro（Lazer）与 Chainlink 价格，avUSDC 金库作为对手方 | [29] | observed | |
| P37 | HLP 是协议金库，负责做市和清算，存款锁定 4 天，不是合成对手方 | [30] | observed | |
| P38 | 媒体转引 Hyperliquid：2025-03-12 ETH 鲸鱼提走未实现盈利后被清算，HLP 亏损约 $4M，随后 BTC/ETH 最高杠杆降为 40x/25x | [32] | observed | |
| P39 | Hyperliquid 现行规则要求提取后剩余保证金至少为 max(初始保证金, 10% 仓位价值) | [31] Unrealized PNL and transfer margin requirements | observed | |
| P40 | 媒体报道 2025-03-26 JELLY 事件中 HLP 接手空单后未实现亏损约 $13.5M，验证者投票下架并以 $0.0095 结算，基金会赔偿未被标记的用户 | [33]；[34] | observed | |
| P41 | 团队 2026-10-11 承认 Papertrade 遭遇 BBO 操纵尝试并收紧 OI cap，自述 LP 约 $5M | [35] DeFi Prime 转述 Papertrade X 帖 | observed | |
| P42 | Papertrade 的 PriceOracle 没有偏离、TWAP 或回看熔断，OI cap 也不是亏损上限 | [1]《Pricing: BBO precompile》§No deviation breaker；《Risk》 | observed | |
| P43 | 在这几个同类产品中，Papertrade 是唯一以单一场所盘口中间价、按区块读取作为结算价的，其他都用多源或聚合价格 | 由 P10、P12、P19、P27、P28、P32、P36、P42 推出 | inferred | |
| P44 | Papertrade 放弃了同类产品经事故后加上的偏离熔断、偏斜 impact、funding/borrow、延迟或平仓费衰减、ADL | 由 P16、P19、P24、P25、P26、P42 与 [1]（无 funding、无 spread、只对盈利收费）推出 | inferred | |
| P45 | 没有外部 LP、以 FIFO 队列替代即时偿付且不设赔付上限，是 Papertrade 在本轮考察的永续产品中独有的设计 | 由 P11、P17、P26、P29、P31、P36、P37 与 [1][2] 推出；检索范围有限 | speculative | |
| P46 | gTrade 铸 GNS 补金库是“代币兜底 LP”的先例，但代币卖给市场；PAPER 则发给亏损者，作为收益权凭证 | 由 P17 与 [1]《Paper Emissions》推出 | inferred | |
| P47 | Papertrade 的队列在效果上相当于“时间维度上的 ADL”：盈利不被削减，只被推迟 | 由 P26 与 [1]《Solvency & queue》推出 | inferred | |
| P48 | Papertrade 2026-10 的事件与 GMX AVAX 2022 同一类型：零 impact + 可被推动的参考价格 + 事后靠 OI cap 止血 | 由 P20、P21、P41、P42 推出 | inferred | |
| P49 | Papertrade 的名义敞口与 LP 之比（单仓 $10M、cap 余量 $1B，对比 LP 约 $5M）比 HLP 事件时更极端 | 由 P40、P41 与 [1]（$10M 单仓、$1B 余量）推出；HLP 规模未核实 | speculative | |
| P50 | Papertrade 的 LP 不分享 2% 费用（全部归质押者和开发者），而 GMX 和 JLP 的 LP 拿大部分手续费 | 由 P27、P29 与 [1]《Staking Dividends》推出 | inferred | |
| P51 | grok 关于 BBO mid 比 Chainlink 或 TWAP 更适合作预言机的说法，忽略了同类产品都用多源价格来抗操纵 | 由 P12、P19、P28、P42、P43 推出 | inferred | |
| P52 | 合成永续不在外部开仓并不意味着没有 funding，GMX v2、gTrade、Rollbit 都收取；Papertrade 不收是设计选择 | 由 P8、P15、P24 与 [1] 推出 | inferred | |
| P53 | Papertrade 没有 LP 份额的铸造与赎回，因此不存在 GMX v1 那种 AUM 操纵攻击面 | 由 P22 与 [1]《The LP and the payout queue》（不可直接存入 LP）推出 | inferred | |

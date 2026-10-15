# Lane X：Mantle 在期权方向的机会（notes-mantle）

> 本路范围：回答 brief 研究问题 5。包括：Mantle 现有与期权相关的资产和基础设施；RWA 期权特有的难题；传统股票期权市场作为参照；候选方向及其前置条件；Mantle 能力逐项对照。
> **本文的“方向 / 优先级 / 建议”都是调研建议，不代表 Mantle 现网已有的能力，也不是 Mantle 的路线承诺。**
> 访问日期：网页与 API 来源均在 2026-10-16（UTC+8）访问，另注明的除外。凡写“搜索快照”的，表示原页直接抓取被拒（403 或超时），内容取自搜索引擎索引的页面文本，时点可能早于访问日。
> 本次运行环境没有 bash，无法跑 python 或 cast。凡是数字，都来自页面或 API 原文，没有本地复算。

**一句话总结**：
- **已有的**：Mantle 有期权所需的“标的 + 结算币 + 现货 RFQ”雏形。具体是：xStocks 原生发行在 Mantle 上，并已接入发行方 Atomic RFQ（xChange）；稳定币有 USDT0、USDC、USDG；Aave V3 已在 Mantle 上线；Chainlink v10 tokenized-asset 报告和 xStocks 合约本身都给出了公司行动 multiplier。
- **缺的**：期权所需的“风险承接层”几乎为零。DefiLlama 在 Mantle 上只列出 1 个期权协议（Stryke CLAMM），TVL 为 $0；永续成交为 $0；Rysk V12 和 Thetanuts V4 都没有部署在 Mantle；Aave Mantle 市场不接受 xStocks 或 mETH 作抵押，也不能借出 xStocks 用于做空对冲。
- **优先级判断（inferred）**：最值得先做的是“持仓者保护 / 收益结构 + RFQ（全额抵押）”，同时做“RWA 结算与公司行动适配层”。复制型 / 组合保证金 venue 现阶段前置条件缺得最多。

---

## X-Q1 Mantle 现有与期权相关的资产与基础设施（截至 2026-10-16）

### X-Q1a 代币化股票

**答案**：
- **xStocks**：已在 Mantle 原生发行。
  - 时间线：2026-04-10 上线（经 Fluxion 交易，充提仅限 Bybit）；2026-05-07 接入 xChange Atomic RFQ，可以向发行方直接铸造和赎回。
  - 标的数量：xStocks 公共 API 显示，至少约 100 个标的有 Mantle 部署。DefiLlama 上 Mantle 桥接资产里，xStocks 单只最大约 $16M（SNDKx）。
- **mStocks**（Bybit × Mantle）：仍是计划，目标 2026-11 上线。目前只有媒体转述和 Bybit 新闻稿的转载，我没有直接抓到 Bybit 或 Mantle 官方原文。
- **Ondo Stocks（原 Ondo Global Markets）**：没有查到在 Mantle 部署的证据。

**依据**：
- **xStocks 链列表**：官方文档写明“natively on Ethereum, Solana, Arbitrum, Mantle, TON, Ink, and other EVM-compatible networks”[1][2]。
- **上线公告**：
  - 2026-04-10 Mantle 新闻稿：xStocks 经 Fluxion 交易；“one of the few chains with direct deposit and withdrawal support for xStocks exclusively through Bybit”；Flowdesk 参与 [9]。
  - 2026-05-07 xStocks 官方：“xStocks has activated Atomic Request for Quote (RFQ) on Mantle … integrated via Fluxion in collaboration with Bybit”[8]。
- **xStocks 公共 API**（`/api/v2/public/assets?network=Mantle`）[6]：
  - 检索字符串 `"network":"Mantle","wrapperAddressV2"` 时，检索工具在第约 100 次命中处截断，所以“≥约 100”是下限。
  - 每个 Mantle 部署都带有 `wrapperAddressV2`（ERC-4626 封装，见 X-Q2c）、`supportsAtomicSwaps: true`，结算币是 Mantle 上的 USDC `0x09bc…0df9`。
  - 例：AEHRx 的 Mantle 地址为 `0x9443…ac3f`。
- **Mantle 上的具体上新**：USPXx（Franklin Templeton USPX ETF 的 xStock）2026-06-24 上线，“trades exclusively on Fluxion”；SPCXx（SpaceX）在 IPO 当日上线 [10]。
- **桥接规模**：DefiLlama“Mantle Bridged TVL”（搜索快照）列出 SNDKX $16.1M、HOODX $10.7M、NVDAX $9.1M、SPYX $7.7M、QQQX $7.2M、METAX $7.5M [18]。
- **mStocks**：
  - 媒体（Gate News 转引 PANews，2026-10-13）：Ben Zhou 称 Bybit 与 Mantle 合作的 mStocks“set to launch next month”。具体内容：1:1 实股支持；可在 Bybit 平台 24/7 与实股互转；可在 Mantle 的 AMM 池交易；可存入 Bybit UTA 作为交易抵押 [11]。
  - CryptoBriefing（2026-10-13）：发行人是 Halo Prime Limited（BVI），性质为“limited-recourse debt obligations”；Bybit 只提供界面并“operate the smart contract functions”，不担任发行人或托管人 [11]。
  - Bybit 新闻稿转载（aihqyc.com）：“trading will be supported by automated market makers (AMM) in the liquidity pool through Mantle. According to the applicable terms and conditions, the converted mStocks is also expected to be able to be transferred into Bybit's UTA for use as trading collateral”[11]。
  - Bybit Help Center《Introduction to Bybit Stocks》（2026-10-08 更新，搜索快照）：Direct Stocks 和 mStocks 都“backed 1:1 by real underlying shares held in custody”；Direct Stocks 需要 Advanced KYC，交易时间 5×24，不支持链上转账和 DeFi [12]。
- **Ondo**：Ondo 地址页在 Mantle 下只列出 USDY、mUSD、Redemption Price Oracle、Blocklist，没有股票代币 [13]。媒体报道的 Ondo Global Markets 部署链是 Ethereum、Solana、BNB Chain [见 X-Q1 搜索记录，媒体]。

**不确定之处**：
- xStocks 在 Mantle 上的确切标的数，需要用脚本对 API 去重计数，本次没有 bash。各标的在 Fluxion 上的池子深度也未测。
- mStocks 的标的清单、资格（KYC / 地区）、链上合约权限、在 Mantle 上的预言机方案，都**没有一手原文**。GPT 引用的 Bybit 新闻稿 URL 两次抓取都超时。
- Gate News 2026-10-14 的标题写“Bybit Launches … mStocks … on October 14”，与“next month 上线”矛盾。实际应是 10-14 宣布，不是 10-14 上线。

### X-Q1b RWA / 收益资产

**答案**：
- **USDY / mUSD**：USDY 在 Mantle 原生部署，mUSD 是它在 Mantle 上的 rebasing 版本。DefiLlama 桥接口径下 Mantle 上的 USDY 约 $13.5M，在 USDY 总规模（约 $2.3B）里很小。
- **mETH / cmETH**：mETH 在 Mantle 上约 $153M，cmETH 约 $25.6M（桥接口径）。mETH Protocol 本身 TVL 约 $567M（DefiLlama API，以以太坊 L1 为主）。
- **FBTC**：在 Mantle 上约 $20M（桥接口径）。
- **MI4**（Mantle Index Four）：是加密指数基金（BTC / ETH / SOL / 美元稳定币），不是股票类 RWA。DefiLlama 记 $110.5M，RWA.xyz 记约 $152M。

**依据**：
- **Ondo 合约地址（Mantle）**[13]：
  - USDY `0x5bE2…c5A6`；
  - mUSD `0xab57…7cF3`，“rebasing counterpart of USDY on Mantle”；
  - Redemption Price Oracle `0xA96a…882f`；
  - Blocklist `0xdBd7…c5e6`。
- **USDY 资格与申赎**：
  - Reg S，仅限非美国人；受限期“at least 40 days”[14]；
  - Ondo 官网显示 USDY 流通约 $2.06B（2026-10-05 EDT）[14]；
  - 在 Mantle 上铸造和赎回 USDY 需要联系 support [14]。
- **桥接规模**：DefiLlama 桥接快照为 METH $153.13M、CMETH $25.55M、FBTC $20.01M、USDY $13.48M、XAUT $43.67M、USDT $465.71M [18]。
- **mETH Protocol 机制**（Mantle Docs）[16]：
  - mETH 赎回走 FIFO 队列，最少 12 小时延迟，最长取决于验证者退出队列，“could take 40+ days”；
  - cmETH 赎回“Up to ~7 day delay”，cmETH 是 LayerZero OFT；
  - cmETH 在 Mantle 上的地址为 `0xE682…e8fA`。
- **mETH Protocol TVL**：`api.llama.fi/tvl/meth-protocol` → 566860118.39 [17]。
- **MI4**：Securitize 新闻稿称 Mantle Treasury 承诺 $400M 锚定投资，底层是 BTC、ETH、SOL、USD 稳定币和合成美元，按季度再平衡 [21]；DefiLlama 链页快照 MI4 TVL $110.54M（1 个月 -25%）[18]。

**不确定之处**：
- “桥接 TVL”统计的是 Mantle 上的代币总量，不等于在 DeFi 里被使用的量。
- RWA.xyz 的 USDY 页面里，Mantle 行显示 319,913 枚，与 DefiLlama 的 $13.5M 不一致。可能口径不同，或者部分行被截断。没有核链上 totalSupply。

### X-Q1c 借贷与 DEX

**答案**：
- **借贷**：
  - Aave V3 于 2026-02-11 在 Mantle 主网上线，是 Mantle 最大的借贷市场。aavetracker（取自 Aave API）显示供应 $330.4M、借出 $144.0M、10 个资产。
  - 抵押品里**没有 xStocks，也没有 mETH / cmETH**。可借资产全部是稳定币、WETH、GHO。
  - Lendle 约 $0.18M，INIT Capital 约 $1.81M，都很小。
- **DEX**：Agni 约 $16.3M、Merchant Moe 约 $12.1M、Fluxion 约 $7.1M（TVL）。Fluxion 30 天成交约 $24.9M。全链 DEX 日成交只有约 $1–5M 量级。
- **定期借贷**：Mantle 官方 dApp 页列出 MethLab（固定利率、固定期限、无清算、无预言机）。Pendle 据第三方说明支持 Mantle。两者规模都没有核实。

**依据**：
- **Aave 上线**：Bybit / Mantle / Aave 新闻稿（2026-02-11）写明“official Mainnet launch of Aave V3 on Mantle”，并有 8M MNT 和 1.5M GHO 的六个月激励 [20]。Aave changelog 列有“Aave v3 Mantle Market”[20]。
- **Aave Mantle 资产明细**（aavetracker 2026-10-15 16:05 UTC，第三方读取 Aave API）[19]：
  - USDT0 $160.1M（借出 $141.0M，利用率 88.1%）；
  - sUSDe $81.6M、syrupUSDT $45.9M、USDe $27.5M、FBTC $11.0M、USDC $2.4M、GHO $1.4M、WETH $0.26M、WMNT $0.2M；
  - wrsETH 已冻结；
  - Pool 地址 `0x458F…1422`。
- **DefiLlama `currentChainTvls`**[17]：Lendle Mantle 183,097；INIT Mantle 1,810,411；Agni 16,288,860；Merchant Moe 12,130,104；Fluxion（`/tvl/fluxion-network`）7,054,740。
- **Fluxion**：DefiLlama 页（搜索快照）描述为“A RWA-optimized Native DEX on Mantle. AMM v2/v3 and order book hybrid”，30 天 DEX 成交 $24.87M [18]。Mantle 新闻稿称 Fluxion 为“hybrid AMM and RFQ infrastructure”[9]。
- **全链 DEX 成交**：DefiLlama 链页两个快照分别为 24h $1.28M / 7d $26.4M 和 24h $4.86M / 7d $27.31M；Perps 24h 和 7d 均为 $0 [18]。
- **定期借贷**：Mantle dApp 页（搜索快照）列出 MethLab，描述为“liquidation-free, and oracle-less lending/borrowing protocol that enables fixed-rate/fixed-term positions on Mantle”[40]。

**不确定之处**：
- Aave Mantle 的 TVL 口径冲突：DefiLlama 链页快照为 $89.47M（1 个月 -32%），aavetracker 的“供应 − 借出”约为 $186M。时点和口径都不同，没有核链上数据。
- Mantle 全链 TVL 也不一致：`api.llama.fi/v2/chains` 为 $95.38M（本次 API），链页快照为 $146M。
- MethLab 和 Pendle 在 Mantle 上的实际规模都没有核到。

### X-Q1d 预言机（股票 / RWA 价格源）

**答案**：
- **Chainlink**：
  - 已有面向股票和 tokenized 资产的 Data Streams。v10（Tokenized Asset）同时给出 `price`（标的市场价）、`tokenizedPrice`（CEX 上 token 的聚合价）、`marketStatus`、`currentMultiplier / newMultiplier / activationDateTime`。
  - Chainlink 是 xStocks 的“official oracle infrastructure”。
  - Data Streams 支持 Mantle 网络（转引）。
  - **但没有查到 Mantle 上已有 xStocks 或股票 stream 的部署证据**：Chainlink 生态页的 xStocks 条目只写 Solana 和 Ethereum；Mantle 上只查到 XAU/USD、MNT/USD 等推送 feed。
- **Pyth**：Mantle 官方 Oracles 文档说 Pyth 提供美股价格源；但 Mantle 上的 Pyth Core 仍是未升级的旧合约（本次抽查仍成立）。
- **RedStone / API3**：在 Mantle 上有没有股票源，未核实。

**依据**：
- **Chainlink 文档**[22]：
  - v10 schema 字段表；
  - “The `price` field does not update during weekends … the `tokenizedPrice` field continues to update as it reflects trading activity on centralized exchanges (CEXs)”。
- **xStocks 官宣**：Chainlink 加入 xStocks Alliance，“as the official oracle infrastructure and developing xStocks Data Streams”[23]。Chainlink 生态页 xStocks 条目：Chains = Solana, Ethereum [23]。
- **Mantle feed**：data.chain.link 有 Mantle 的 XAU/USD 和 MNT/USD feed（搜索快照）[24]。
- **抽查（2026-10-16 重新抓取）**：
  - Mantle Docs《Oracles》仍列出 API3（200+ feeds）、Chronicle、ORA、Pyth、RedStone、Supra，**仍无 Chainlink**[25]；
  - Pyth 升级合约表里 Mantle 行仍为 `0xA2aa…5B5729 | — | —`[26]；
  - 以上与转引自 papertrade-deep-dive notes-mantle X26、X24 一致 [27]。
- **Data Streams 支持 Mantle**：转引自 papertrade-deep-dive notes-mantle X16–X20 [27]。

**不确定之处**：
- Chainlink tokenized-equity streams 能否在 Mantle 上验证（VerifierProxy 已部署，但具体 feed 是否开通）未核。
- Pyth 旧合约在 Mantle 上对股票 feed 的更新是否持续，未核。

### X-Q1e Mantle 生态里已有或曾有的期权、结构化产品

**答案**：
- **期权协议**：DefiLlama 的 options 分类在 Mantle 链下只列出 **Stryke CLAMM**，TVL、权利金和名义成交全部为 $0。
- **主流 RFQ 期权协议**：Rysk V12 只在 HyperEVM 和 Ethereum；Thetanuts V4 的 SDK 只支持 Base（完整）和 Ethereum（只有 vault）。**两者都不在 Mantle**。
- **结构化产品**：以 xStocks 为标的的结构化产品，目前只在 Bybit 中心化平台上有（Dual Asset，2026-07-22）。链上 Mantle 原生的版本没有找到。

**依据**：
- **DefiLlama Mantle options 页**（搜索快照）：“Options on Mantle — TVL $0 … Stryke CLAMM 5 chains | $0”[18]。
- **Rysk**：官方合约页只有 HyperEVM 和 Ethereum Mainnet 两组地址 [36]；DefiLlama 记录 Rysk V12 TVL $63M（Hyperliquid L1 $53.1M、Ethereum $9.9M）[36]。
- **Thetanuts**：SDK 文档“Supported Chains”表为 Base Mainnet 8453（完整）、Ethereum 1（WheelVault only）[37]。
- **Bybit xStocks Dual Asset**（2026-07-22）：6 个 xStocks 标的，期限 8 小时、1 天、7 天，每单 30–200,000 USDT [33]。

**不确定之处**：DefiLlama 没有收录的小协议可能存在。例如 xStockFi 网站自称“On-chain options on tokenized stocks”，但部署链和合约地址都写“TBA”，无法核实 [38]。

---

## X-Q2 RWA 期权的特有难题（一手来源）

### X-Q2a 交易时段：链上 24/7，标的 24/5

**答案**：
- **四个时段各不相同**：
  - xStocks 二级市场 24/7；
  - 向发行方申购、赎回只在 24/5；
  - Mantle 上的 xChange RFQ 在“closed”时段单笔上限为 0；
  - Chainlink v10 的 `price` 周末不更新，只有 `tokenizedPrice`（CEX 聚合价）继续更新。
- **后果（inferred）**：期权 fixing 时点、mark 价和对冲窗口都必须显式选定时钟。

**依据**：
- **xStocks FAQ**：“traded on secondary markets 24/7 … Issuance and redemption … limited to business days when the US market is open, normally 24/5”[2]。
- **xStocks API 交易字段**[6]：
  - `"tradingHoursMode":"TwentyFourFive"`；
  - `limitsPerPeriod`：market / extended 时段 maxOrderFiatValue 为 10,000,000，overnight 为 1,000,000，closed 为 0；
  - minOrderFiatValue 为 1000。
- **Chainlink**：
  - v10 周末警告 [22]；
  - 《Handling Market Events》：休市时“Closing price is repeated until market open”，用户应“Keep markets closed while `marketStatus = 1`”[22]。
- **Kraken**：xStocks 在 Kraken 上 24/5 交易，“When withdrawn to a self-hosted wallet, xStocks can be traded 24/7 on-chain”[41]。
- **HIP-3 股票永续的做法**（第三方 HyperAcademy 描述）：标的休市时，“the oracle stops using external quotes and advances an internal price anchored to the last external print”[34]。

### X-Q2b 公司行动

**答案**：
- **xStocks 怎么处理**：用链上 multiplier 处理分红（税后再投资）、拆股和反向拆股。EVM 上 `balanceOf()` 会自动变化，内部 `sharesOf()` 不变。
- **期权按什么调整（inferred）**：
  - 如果期权按“token 数量”定义，拆股后合约单位会被动改变；
  - 如果按“shares”或固定的 multiplier 定义，就需要显式调整行权价 K 和数量 Q；
  - 分红再投资会让 multiplier 持续缓慢上升，相当于连续的小幅调整，股票期权标准做法通常不对普通现金分红做调整，这里需要在产品规则里写明。
- **激活时点在不同来源之间矛盾**：
  - xStocks 文档写“00:30 UTC on the day immediately following the Ex-Date”；
  - Chainlink 文档写 xStocks 默认“00:00 UTC on the effective date”；
  - SPYx 实际 multiplier 历史的激活时间分别是 2025-10-31 23:55、2026-01-30 23:55、2026-05-01 00:15、2026-06-18 04:00（UTC），并不统一。

**依据**：
- **xStocks 文档**[3][4]：
  - multiplier 例子（分红 1.0→1.008；4:1 拆股 →4.032；2:1 反向拆股 →2.016）；
  - 建议在激活前后各暂停约 15 分钟；
  - API 端点 `/assets/{SYMBOL}/multiplier`、`/multiplier/history`；
  - webhook 通知“forthcoming”。
- **合约源码**（backed-fi/backed-token-contract@35859e8c75）[7]：
  - `BackedAutoFeeTokenImplementation.sol`：`getCurrentMultiplier()`、`updateMultiplierValue(...)`（`onlyMultiplierUpdater`）、`newMultiplierActivationTime`。
  - 同一合约里，`feePerPeriod > 0` 时 multiplier 会按期**下调**，即管理费也通过 multiplier 体现：
    `currentMultiplier = currentMultiplier * (1e18 - feePerPeriod) / 1e18`
  - `_storeScheduledMultiplierUpdate`：同一时间只允许一个待生效的更新，后提交的会覆盖前一个。
- **API 实测**[6]：
  - `SPYx/multiplier?network=Mantle` → `{"currentMultiplier":1.005714560286254,"newMultiplier":0,"activationDateTime":0}`；
  - `/multiplier/history` 返回 4 条，`reason` 都是 `"Dividend"`，激活时间如上。
- **Chainlink《Handling Stock Splits》**[22]：
  - 理论价格 = `price * currentMultiplier`；
  - “If activation occurs while the underlying market is closed, prices may still show the pre‑event last trade. Do not compute the Theoretical Price during this pre-adjustment window”；
  - “the xStocks default activationDateTime is 00:00 UTC on the effective date”。

**不确定之处**：
- Mantle 部署的 xStocks 合约是否就是这个仓库 HEAD 的实现、`feePerPeriod` 是否为 0，都没有用 cast 读链上数据核实。
- SPYx 的 multiplier history 是按产品记录，还是只记 Mantle 链，未确认：最早一条早于 Mantle 上线日。

### X-Q2c 发行人权限（冻结、黑名单、转让限制）

**答案**：xStocks 的 EVM 合约有以下权限角色：
- pauser：可以暂停**全部**转账；
- 制裁名单（Chainalysis 接口）：拦截名单内地址作为发送方、接收方或 spender；
- minter / burner / multiplierUpdater：由 owner 设置；
- owner：可以更换以上所有角色和制裁名单指针。

这与官网所说的“Permissionless … without … technical transfer restrictions”存在张力（inferred）。具体影响：
- 锁在期权合约里的抵押品可能被暂停转出；
- 期权合约或交易对手的地址可能被列入制裁名单。

USDY 在 Mantle 上也有独立的 Blocklist 合约。

**依据**：
- `BackedTokenImplementation.sol@35859e8c75`[7]：
  - 合约注释：“A pauser, that can pause or restore all transfers … An owner, that can set the three above, and also the sanctionsList pointer”；
  - `_beforeTokenTransfer` 中有 `require(!isPaused…)` 和 `isSanctioned(from/to)` 检查；
  - `_spendAllowance` 检查 spender。
- 合约头部免责声明写明代币“may not be offered, sold or delivered within the United States … only to transferees that are Non-United States Persons”[7]。
- xStocks 官网的“Permissionless”表述 [1]。
- Ondo Mantle Blocklist 地址 [13]。

### X-Q2d 封装器（对期权有利的既有组件）

**答案**：xStocks 的每个 Mantle 部署都带有 `wrapperAddressV2`，对应 `WrappedBackedTokenImplementation`。这是一个 ERC-4626 封装，按 underlying 的 shares 1:1 发行，自身余额不 rebase。好处是期权抵押品的数量不会因为 multiplier 变化而变（inferred）；代价是封装会继承 underlying 的 pause 和制裁检查。

**依据**：
- API 返回的 `wrapperAddressV2` 字段 [6]。
- commit 35859e8c75 中 `WrappedBackedTokenImplementation.sol` 的注释：“It translates the shares of the underlying IBackedAutoFeeToken to an amount of assets, using the current multiplier … 1:1 ratio between wrapper token and the shares”。
- `_beforeTokenTransfer` 调用 `IBackedToken(asset()).sanctionsList().isSanctioned(...)`[7]。

### X-Q2e 基差（token 价格与股票价格的差）

**答案**：没有找到 Mantle 上 xStocks 基差的公开数据集。可以用来测量的现成数据有三类：
- Chainlink v10 同一份报告里的 `price` 与 `tokenizedPrice`；
- xStocks API 的 `price-data`（发行方报价）；
- Fluxion 池价格。

**依据**：
- v10 字段定义 [22]。
- `SPYx/price-data` → `{"quote":769.9025}`（2026-10-16 访问）[6]。
- xStocks 开发者文档：价格数据“sourced from onchain providers (cached) and Nasdaq (Blue Ocean for overnight/extended hours pricing)”[5]。

**不确定之处**：没有采样，没有计算任何基差数值。

### X-Q2f 申赎资格

**答案**：
- **xStocks**：不面向美国销售；向发行方直接申赎需要 KYC，最低 $5,000；铸造入口是 xChange、Market Flow 和 xPort（需要在 Alpaca 开户）。
- **USDY**：Reg S，仅限非美国人；新申购有至少 40 天受限期。
- **mStocks**：需要 Bybit 账户与 KYC（对 Direct Stocks 已确认；mStocks 的细节缺原文）。
- **对期权的含义（inferred）**：做市商要用一级市场套利基差，就必须先完成发行方 onboarding。实物交割期权的接收方本身不受限，因为二级市场转账无需许可，但仍受制裁名单约束。

**依据**：
- xStocks FAQ：“not marketed, offered, or solicited in the United States”；“Retail users are legally permitted to redeem directly with the issuer, subject to KYC requirements and the $5,000 minimum”[2]。
- xStocks 开发者文档：三种申赎流程 [5]。
- Ondo 文档：资格、受限期 [14]。
- Bybit Help Center [12]。

---

## X-Q3 传统市场参照

**答案**：
- **市场规模**：OCC 2025 年清算期权 152.1 亿张（+24.4%），其中个股期权 82.7 亿张、ETF 期权 56.8 亿张、指数期权 12.6 亿张。2026 年至今日均约 7092 万张（OCC 首页）。
- **0DTE 与零售**：0DTE 是 SPX 期权的主体，2025 年 12 月占 SPX 成交 59%，2025 年 8 月曾达 62.4%。Cboe 称零售约占全市场日成交的近一半。
- **链下 / 中心化 RWA 期权已经有人做**：
  - Bybit XAUT 期权，2026-06-12，自称“first crypto exchange to offer options on a tokenized RWA”，由 Orbit Markets 做市，带 RFQ；
  - Derive XAUT 期权，2026-07-24，Derive 的第一个 RWA 期权；
  - Coincall SPY / QQQ / XAG 期权，2026-08-26；
  - Bybit xStocks Dual Asset，2026-07-22；
  - Hyperliquid HIP-3 上有第三方部署的股票永续。
- **尚未看到的**：**以 xStocks 等 tokenized 个股为标的、在链上结算的期权市场**，目前没有看到有规模的一手证据。

**依据**：
- **OCC**：
  - 新闻页（搜索快照，直接抓取 403）：Equity 8,269,693,680、ETF 5,679,730,264、Index 1,257,739,610、Total Options 15,207,163,554 [28]；
  - 年报：15.3B 合约（含期货），年末期权 OI 585M [28]；
  - 首页（搜索快照）：“2026 Daily Average 70,920,000”[28]。
- **Cboe**：
  - Q3 2025 文章：SPX ADV 3.8M 中 2.15M（57%）为 0DTE；“retail traders were responsible for nearly half the total daily options volume”[29]；
  - IR 新闻稿摘要：12 月 0DTE ADV 2.3M，占 59% [29]；
  - 2025 年 8 月博客：62.4% [29]。
- **RWA 期权与结构化产品**：Bybit 公告 [30]、Derive 博客 [31]、Coincall 公告 [32]、Bybit Dual Asset 新闻稿 [33]。
- **HIP-3 股票永续**：第三方描述 [34]。
- **TradFi 动向**（媒体）：Cboe 与 S&P DJI 续约到 2051，并提到“blockchain-based tokenized options”是潜在合作方向 [35]。

**不确定之处**：
- “零售近一半”是 Cboe 自己的口径，不是 OCC 数据。
- 链上个股期权“没有规模”是基于 DefiLlama 和本次检索得出的，属于否定性结论，可能遗漏。

---

## X-Q4 候选方向与前置条件（建议，不是路线承诺）

| 方向 | 需求方 | 卖方 / 做市方 | 需要的 Mantle 能力 | 现状 | 主要风险 |
|---|---|---|---|---|---|
| a. 持仓者保护与收益结构（protective put、covered call、collar）+ RFQ，模式参照 Rysk V12 和 Thetanuts V4，全额抵押、实物或现金结算 | 持有 xStocks / mStocks / FBTC / mETH 的用户；Bybit 的 xStocks Dual Asset 说明 CEX 端已有对 xStocks 结构化收益的需求 [33] | 专业期权做市商（需要在链下对冲美股），以及 covered call 卖方（持币用户） | 标的 token（有）；USDC / USDT0 结算（有）；带 multiplier 的价格源（部分有：Chainlink v10 的 schema 有，Mantle 上是否部署未核）；RFQ 结算合约（缺：xChange 只做现货）；做市商在 Mantle 的接入（缺） | **部分有** | 做市商在美股休市时无法对冲；基差；发行方 pause 或制裁导致交割失败；需求未验证 |
| b. RWA 结算与公司行动适配层（multiplier 读取、`marketStatus` 闸门、fixing 规则、ERC-4626 封装、暂停窗口），作为共享库给多个期权应用复用 | 所有在 Mantle 上用 RWA 做衍生品或借贷的应用，包括 Aave 未来如果要上架 xStocks | 不涉及 | xStocks multiplier 链上接口（有）、xStocks API（有）、Chainlink v10（部分有）、发行方 webhook（文档写“forthcoming”） | **部分有** | 各发行方规则不统一（激活时点已有三种说法）；mStocks 规则未知；需要发行方配合 |
| c. 复制型 / 组合保证金 venue（现货 DEX + 借贷 + 期权在同一个保证金账本） | 专业交易者 | 做市商 | 有深度的现货（DEX 日成交只有约 $1–5M）；可以借出标的来做空（Aave Mantle 不支持 xStocks）；永续（$0）；组合风险引擎（缺） | **缺** | 前置条件缺得最多；在流动性不足时，组合保证金会放大坏账 |
| d. 接入外部成熟期权市场做分发 vs 在 Mantle 原生结算 | Mantle 用户 | Derive、Bybit 等 | 跨链与分发：CCIP Super Portal（有，转引）；Bybit 账户体系 | **部分有** | 外部市场目前只有 XAUT、SPY、QQQ 等，**没有 xStocks 期权**；分发不会给 Mantle 链上留下结算和 TVL |
| e. 以 mETH / cmETH、USDY 作抵押或收益来源的结构化产品（例如“收益付权利金”的保本型结构） | 稳健型持币者 | 做市商 | Mantle 上的 mETH 约 $153M（有）；USDY 在 Mantle 约 $13.5M（量小）；mUSD 的 rebasing 版本（有） | **部分有** | mETH 赎回最长 40 天以上，cmETH 约 7 天；USDY 有 Reg S 限制和 Blocklist；Aave Mantle 不接受 mETH，抵押品无法再利用 |

**优先级判断**（推论型或推测型，理由见台账 X50–X55）：
1. **a + b 并行（最高）**：
   - 资产、结算币、发行方 RFQ 都已在 Mantle 上；
   - 全额抵押产品不需要组合保证金，也不依赖链上有深度的现货；
   - b 是 a 的前置条件，能被多个应用复用，而且主要是工程问题，Mantle 可以自主推进。
2. **d（中）**：适合用来快速验证需求，但现有外部市场没有 xStocks 期权，验证面有限。
3. **e（中低）**：资产有，但赎回期长、资格受限，并且无法在 Mantle 借贷里再利用。
4. **c（低，后置）**：现货深度、做空渠道和永续三项前置条件都缺。

---

## X-Q5 Mantle 能力逐项对照表

| 能力 | 期权需要它做什么 | Mantle 现状 | 判定 | 来源 |
|---|---|---|---|---|
| 可代币化的标的 | 作为期权标的、抵押品或交割物 | xStocks 原生发行在 Mantle，至少约 100 个标的；mStocks 计划 2026-11 上线；XAUT 约 $43.7M | 有（mStocks 尚缺） | [1][6][11][18] |
| 标的的一级市场与 RFQ | 做市商套利基差、补库存 | xChange Atomic RFQ 已在 Mantle 激活（2026-05-07）；24/5；closed 时段上限为 0 | 部分有 | [6][8] |
| 二级市场流动性 | 对冲、mark 价、实物交割后的退出 | Fluxion（AMM / RFQ 混合），30 天成交约 $24.9M；全链 DEX 日成交约 $1–5M | 部分有（薄） | [17][18] |
| 结算稳定币 | 权利金、现金结算 | USDT0（约 $440M，转引）、桥接 USDC（xStocks 结算币）、USDG | 有 | [6][27] |
| 带公司行动的价格源 | mark / fixing / 拆股闸门 | Chainlink v10 schema 有；Data Streams 支持 Mantle（转引）；Mantle 上的股票 stream 未核；Pyth Core 未升级 | 部分有 | [22][23][25][26][27] |
| 公司行动链上数据 | 调整 K / Q、暂停窗口 | xStocks `getCurrentMultiplier`、待生效 multiplier 与激活时间、API 历史 | 有 | [4][6][7] |
| 非 rebasing 封装 | 作为期权抵押品时数量不变 | xStocks `wrapperAddressV2`（ERC-4626） | 有 | [6][7] |
| 期权协议 / RFQ 结算合约 | 开仓、锁定抵押、到期结算 | DefiLlama 只有 Stryke CLAMM（$0）；Rysk 和 Thetanuts 都未部署 | 缺 | [18][36][37] |
| 借贷（融资与做空对冲） | 做市商借标的做空、杠杆 | Aave V3 供应 $330M，但 xStocks、mETH 都不在列表；Lendle、INIT 很小 | 部分有（不覆盖 RWA） | [19][17] |
| 永续（delta 对冲） | 链上对冲 | Mantle 永续成交为 $0 | 缺 | [18][27] |
| 定期利率 | 远期价格中的 r、借贷期限匹配 | MethLab（官方 dApp 页列出）；Pendle（第三方说明） | 部分有（未核规模） | [40] |
| 排序与预确认 | 报价不陈旧、多腿原子成交 | 2 秒出块；小费排序；白名单 preconf 车道是否在主网启用未知 | 部分有 | [27] |
| 免 gas / AA | 一键签 RFQ | 7702 已激活；Pimlico / ZeroDev 等支持 | 有 | [27] |
| 发行方权限的可观测性 | 预判冻结或制裁风险 | 合约事件可监听（PauseModeChange、NewSanctionsList）；USDY 有 Blocklist 合约 | 有（需要应用自己处理） | [7][13] |

---

## 外部调研 / 用户资料中被修正的地方

1. **GPT §8.1“xStocks 当前的网络支持包含 Mantle”**：对。需要补充三点：Mantle 上线是 2026-04-10；05-07 接入 xChange RFQ；充提仅限 Bybit [8][9]。GPT 引用的是 docs.xstocks.fi/docs/exchange-integration，本次用的是 Introduction 和 FAQ 页，内容一致。
2. **GPT §8.1“Ondo 的 USDY 与 rUSDY 也列出了 Mantle 部署”**：**不准确**。Ondo 地址页在 Mantle 下列出的是 USDY 和 **mUSD**（Mantle 上的 rebasing 版本），不是 rUSDY；rUSDY 是以太坊上的 rebasing 版本 [13]。
3. **GPT §8.1 mStocks“Bybit 2026 年 10 月的官方公告……目标放在 2026 年 11 月”**：
   - 方向对，但 GPT 引用的 Bybit 新闻稿 URL 本次两次抓取都超时，只能从转载和媒体核对 [11]；
   - GPT 没写的关键结构：发行人是 BVI 的 Halo Prime Limited，“limited-recourse debt obligations”，Bybit 不是发行人也不是托管人（媒体）[11]。这直接影响期权交割物的信用风险。
4. **GPT §7.3“xStocks 官方还建议集成方在 multiplier 激活附近采取交互暂停”**：对 [4]。需要补充：
   - 激活时点在三个来源之间不一致：xStocks 文档 00:30 UTC、Chainlink 文档 00:00 UTC、实测历史 23:55 / 00:15 / 04:00 UTC [3][22][6]；
   - multiplier 还会因为管理费（`feePerPeriod`）**向下**变化，不只因为公司行动 [7]；
   - GPT 说“分红的处理还不能机械套用拆股规则”是对的。xStocks 的做法是**税后再投资**，所以分红体现为 multiplier 上升 [3]。
5. **GPT §5.4“Derive 2026 年 7 月 24 日发布 XAUT 期权……平台首个 RWA 期权市场”**：对 [31]。但 GPT 没提 **Bybit 早在 2026-06-12 就上线了 XAUT 期权**，并自称是第一家提供 tokenized RWA 期权的加密交易所 [30]。另外还有 Coincall SPY / QQQ / XAG 期权 [32]。“RWA 期权不是空白市场”这一结论因此更强。
6. **GPT §7.4“xPort 流程明确要求在发行人和 Alpaca 完成 onboarding”**：与开发者文档一致 [5]。需要补充：Mantle 上 xChange 按时段设置单笔上限（closed 时段为 0）[6]。
7. **GPT §8.2 把“生息 RWA 作为期权抵押品”放在“中，后置”**：本 lane 同意，并补充一个新事实：Aave Mantle 根本不接受 mETH 或 xStocks 作抵押 [19]。
8. **GPT 没提的现成组件**：xStocks 的 ERC-4626 非 rebasing 封装（`wrapperAddressV2`），以及 Chainlink v10 同时提供 `price` 与 `tokenizedPrice`、可以直接测基差 [6][7][22]。
9. **转引 papertrade-deep-dive notes-mantle 的事实，本次抽查仍成立**：
   - Mantle Oracles 文档无 Chainlink（X26）；
   - Pyth Mantle 未升级（X24）。
   其余转引（USDT0、7702、排序）没有逐条重查。

## 来源

1. **PRIMARY** xStocks Docs《Introduction》，https://docs.xstocks.fi/docs （访问 2026-10-16）。证明 xStocks 原生发行于 Mantle 等链、1:1 抵押、二级市场 24/7 而申赎 24/5、自称“Permissionless”。
2. **PRIMARY** xStocks Docs《Frequently Asked Questions》，https://docs.xstocks.fi/docs/frequently-asked-questions （2026-10-16）。证明 tracker certificate 不含投票权、不面向美国、直接申赎需 KYC 且最低 $5,000、24/7 与 24/5 的区分。
3. **PRIMARY** xStocks Docs《Dividends and Stock Splits》，https://docs.xstocks.fi/docs/dividends-and-stock-splits （2026-10-16）。证明 multiplier 机制、分红税后再投资、激活时间为“00:30 UTC on the day immediately following the Ex-Date”。
4. **PRIMARY** xStocks Docs《How xStocks Handles Dividends & Stock Splits》，https://docs.xstocks.fi/developers/multipliers （2026-10-16）。证明 EVM 上 `balanceOf` 自动调整、`sharesOf` 和 `getCurrentMultiplier`、建议前后各暂停约 15 分钟、API 端点。
5. **PRIMARY** xStocks Docs《For Developers》，https://docs.xstocks.fi/developers （2026-10-16）。证明 xChange、Market Flow、xPort（Alpaca）三种申赎方式，价格数据来源（Nasdaq 与 Blue Ocean），CCIP 桥。
6. **PRIMARY** xStocks 公共 API：`/api/v2/public/assets?network=Mantle`、`/assets/SPYx/multiplier?network=Mantle`、`/assets/SPYx/multiplier/history?network=Mantle`、`/assets/SPYx/price-data`（2026-10-16）。证明 Mantle 部署（约 100 个以上）、`wrapperAddressV2`、按时段的单笔上限、SPYx 当前 multiplier 与历史激活时间、发行方报价。
7. **PRIMARY** backed-fi/backed-token-contract @ `35859e8c755698eeeef96ef15beef5fcd6b978cc`（2026-06-25 合并）：`contracts/BackedTokenImplementation.sol`（pauser、sanctionsList、`_beforeTokenTransfer`）、`contracts/BackedAutoFeeTokenImplementation.sol`（`getCurrentMultiplier`、`updateMultiplierValue`、`feePerPeriod`、`_storeScheduledMultiplierUpdate`）、`contracts/WrappedBackedTokenImplementation.sol`（ERC-4626 封装）。证明发行方权限、multiplier 与费用机制、封装语义。行号未记录，raw 抓取不带行号。
8. **PRIMARY** xStocks News《Introducing xStocks on Mantle》（2026-05-07），https://xstocks.fi/us/news/introducing-xstocks-on-mantle ；PR Newswire 同日新闻稿。证明 Atomic RFQ（xChange）在 Mantle 经 Fluxion 激活。
9. Mantle 新闻稿（2026-04-10，PR Newswire，经 Manila Times 和 tmcnet 转载）。证明 xStocks 在 Mantle 上线、Fluxion 为“hybrid AMM and RFQ”、充提仅限 Bybit、Flowdesk 参与。属于官方新闻稿的转载。
10. Mantle 新闻稿（2026-06-24，经 AAP 转载）。证明 USPXx 只在 Fluxion 交易、SPCXx 上线。属于官方新闻稿的转载。
11. mStocks 相关媒体：Gate News（2026-10-13、10-14，转引 PANews）、CryptoBriefing（2026-10-13）、Cryptonomist（2026-10-13）、TradingView News、Lookonchain，以及 aihqyc.com 对 Bybit 新闻稿的转载；GPT 引用的 Bybit 新闻稿 URL 两次抓取超时。证明 mStocks 目标 2026-11、1:1、可在 Mantle AMM 交易、可作 UTA 抵押、发行人为 Halo Prime。属于媒体报道。
12. Bybit Help Center《Introduction to Bybit Stocks》（2026-10-08 更新，搜索快照；直接抓取超时），https://www.bybit.com/en/help-center/article/Introduction-to-Bybit-Stocks 。证明 Direct Stocks 和 mStocks 都由托管中的实股 1:1 支持，Direct Stocks 需 KYC、5×24、不可上链。
13. **PRIMARY** Ondo Docs《Smart Contract Addresses》，https://docs.ondo.finance/addresses.md （2026-10-16）。证明 Mantle 上的 USDY、mUSD、Redemption Price Oracle、Blocklist 地址。
14. **PRIMARY** Ondo：https://ondo.finance/usdy 、docs《How it Works》《Eligibility》（2026-10-16）。证明 Reg S 仅限非美国人、至少 40 天受限期、USDY 流通约 $2.06B、禁止地区名单。
15. RWA.xyz《USDY》，https://app.rwa.xyz/assets/USDY （第三方）。证明 USDY 总值约 $2.35B，以及 Mantle 行 319,913 枚（口径存疑）。
16. **PRIMARY** Mantle Docs《mETH Protocol》，https://docs.mantle.xyz/meth （2026-10-16）。证明 mETH / cmETH 的赎回延迟、cmETH 为 OFT 及其地址、手续费。
17. **PRIMARY**（聚合数据 API）DefiLlama API：`/v2/chains`（Mantle tvl 95,378,982）、`/tvl/meth-protocol`（566,860,118）、`/tvl/fluxion-network`（7,054,740）、`/protocol/{lendle,init-capital,agni-finance,merchant-moe}` 的 `currentChainTvls`（2026-10-16）。证明 Mantle 各协议的 TVL 量级。
18. DefiLlama 页面（搜索快照，直接抓取 403）：`/chain/Mantle`、`/bridged/mantle`、`/protocols/options/mantle`、Fluxion 和 Rysk V12 协议页。证明桥接资产量、MI4 和 Aave 在 Mantle 的 TVL、DEX 成交、永续为 $0、期权只有 Stryke CLAMM（$0）。属于聚合数据，时点不一。
19. aavetracker.com《Markets》《Aave Mantle》（2026-10-15 16:05 UTC，读 Aave API），https://aavetracker.com/markets/mantle/ 。证明 Aave Mantle 供应 $330.4M、借出 $144.0M、10 个资产，且不含 xStocks 和 mETH。属于第三方工具。
20. Bybit / Mantle / Aave 新闻稿（2026-02-11，经 Manila Times 转载）；Aave Docs changelog，https://aave.com/docs/resources/changelog.md ；Aave 治理 ARFC“Deploy Aave v3 on Mantle”。证明 Aave V3 Mantle 主网上线及激励。
21. Securitize 新闻稿《Securitize and Mantle Launch … MI4》；RWA.xyz MI4 页。证明 MI4 是加密指数基金、Treasury 锚定投资 $400M、规模约 $110–152M。
22. **PRIMARY** Chainlink Docs：《Tokenized Asset Data Streams》《Report Schema v10》《Handling Stock Splits》《Handling Market Events》，https://docs.chain.link/data-streams/... （2026-10-16）。证明 v10 字段、周末行为、拆股处理与 xStocks 默认激活时间、休市闸门。
23. **PRIMARY** Chainlink 生态页 xStocks 条目 https://www.chainlinkecosystem.com/ecosystem/xstocks ；xStocks News《xStocks are going Live》；Chainlink Blog《Data Streams for U.S. Equities and ETFs》。证明 Chainlink 是 xStocks 官方预言机、生态页只列 Solana 和 Ethereum、股票 Data Streams 已上线。
24. **PRIMARY** data.chain.link Mantle feeds（XAU/USD、MNT/USD，搜索快照）。证明 Mantle 上有推送 feed。
25. **PRIMARY** Mantle Docs《Oracles》，https://docs.mantle.xyz/network/for-developers/resources-and-tooling/oracles.md （2026-10-16 重新抓取）。证明仍无 Chainlink；Pyth 提供美股价格源。
26. **PRIMARY** Pyth Docs《Upgraded contracts》，https://docs.pyth.network/price-feeds/core/upgrade/contracts （2026-10-16 重新抓取）。证明 Mantle 仍未升级。
27. research-hub papertrade-deep-dive `research/notes-mantle.md`（2026-10-13）。转引 X11–X16、X19–X20、X24、X26、X30–X34、X40、X43（排序、预言机、AA、稳定币、CCIP）。
28. **PRIMARY** OCC：newsroom《OCC Annual 2025 and December 2025 Volume》（搜索快照，直接抓取 403）；2025 Annual Report https://annualreport.theocc.com/ ；theocc.com 首页（搜索快照）。证明 2025 年各类期权张数和 2026 年日均成交。
29. **PRIMARY** Cboe：《The State of the Options Industry: Q3 2025》；IR《Trading Volume for December and Full Year 2025》（摘要）；《SPX 0DTE … Record 62% Share in August》。证明 0DTE 占比和零售近半（Cboe 口径）。
30. **PRIMARY** Bybit 公告《Bybit launches industry-first XAUT options for tokenized gold》（2026-06-12）。证明 CEX 上的 RWA 期权、Orbit Markets、RFQ。
31. **PRIMARY** Derive Insights《XAUT Options Are Live on Derive》（2026-07-24）。证明 Derive 的第一个 RWA 期权。
32. **PRIMARY** Coincall 公告《RWA Options Trading Week: SPY, QQQ & XAG Options Are Live!》（2026-08-26）。证明 CEX 上的 ETF 期权。
33. **PRIMARY** Bybit Press《Bybit Expands Fixed-Return Dual Asset Product Beyond Crypto With xStocks》（2026-07-22）。证明 xStocks 结构化产品在 CEX 端已上线。
34. HyperAcademy《AVGO (para) … on Hyperliquid》（第三方）。证明 HIP-3 第三方股票永续及其休市时的定价方式。
35. Gate News（2026-09-30，媒体）。证明 Cboe 与 S&P DJI 提到 tokenized options 的探索方向。
36. **PRIMARY** Rysk Docs《Solution: Rysk V12》《Important Contracts》；DefiLlama Rysk V12 页（快照）。证明 RFQ、实物结算、全额抵押，部署只在 HyperEVM 和 Ethereum。
37. **PRIMARY** Thetanuts Docs（`llms-full.txt`、for-builders overview）及 SDK README。证明 OptionBook 在 Base、SDK 只支持 Base 和 Ethereum（vault）。
38. xStockFi 官网 https://www.xstockfi.finance/ （项目自述，未核实）。证明有项目自称做 tokenized stock 链上期权，合约地址“TBA”。
39. **PRIMARY** mantle.xyz 首页（2026-10-16 抓取）。证明 Treasury $2,255,065,530（As of Oct 15, 2026 15:56 UTC）、Real World Capital $759M。
40. Mantle dApp 页（搜索快照）https://www.mantle.xyz/dapp ；Pendle 链覆盖（第三方 Apify 和 Crawlux）。证明 MethLab 定期借贷列于官方页；Pendle 覆盖 Mantle 只有第三方说法。
41. **PRIMARY** Kraken《xStocks》页与 Support《Getting started with xStocks》。证明 Kraken 上 24/5 交易、链上 24/7。
42. 外部调研（ChatGPT Deep Research）`research/onchain-options-handbook.md` §7–9。只作线索。

## 命令与输出

本次运行环境没有 bash，没有 python、cast 或 curl 记录。关键 fetch 记录如下：
- `fetch_content(raw) https://api.xstocks.fi/api/v2/public/assets/SPYx/multiplier?network=Mantle`
  → `{"currentMultiplier":1.005714560286254,"newMultiplier":0,"activationDateTime":0,"reason":null}`
- `fetch_content(raw) …/SPYx/multiplier/history?page=0&pageSize=5&network=Mantle` → 4 条 Dividend：
  - 2025-10-31T23:55Z（1→1.00099942）
  - 2026-01-30T23:55Z（→1.00256076）
  - 2026-05-01T00:15Z（→1.00390924）
  - 2026-06-18T04:00Z（→1.00571456）
- `fetch_content(raw) …/SPYx/price-data` → `{"quote":769.9025}`
- `fetch_content(raw) https://api.xstocks.fi/api/v2/public/assets?network=Mantle`
  - 返回 606,220 字符；
  - 对 `"network":"Mantle","wrapperAddressV2"` 做精确检索，工具截断前命中约 100 次；
  - 首条 AEHRx：Mantle `0x9443…ac3f`，wrapper `0xe8cb…8fe2`，`tradingHoursMode: TwentyFourFive`，`limitsPerPeriod.closed.maxOrderFiatValue: 0`。
- `fetch_content(raw) https://api.github.com/repos/backed-fi/backed-token-contract/commits/main` → sha `35859e8c755698eeeef96ef15beef5fcd6b978cc`（2026-06-25）。
- `fetch_content(raw) https://api.llama.fi/v2/chains` → Mantle `"tvl":95378982.2237359`。
- `fetch_content(raw) https://api.llama.fi/tvl/meth-protocol` → `566860118.3950438`；`/tvl/fluxion-network` → `7054740.161238027`。
- `/protocol/lendle` → `"currentChainTvls":{"Mantle":183097,…}`；`/protocol/init-capital` → `"Mantle":1810410.89762`；`/protocol/agni-finance` → `"Mantle":16288860.3564`；`/protocol/merchant-moe` → `"Mantle":12130104`。
- `fetch_content https://aavetracker.com/markets/mantle/` → 供应 $330.4M / 借出 $144.0M / 10 个资产（列表如 X-Q1c）。
- 抓取失败：
  - 超时：`bybit.com/en/press/post/bybit-expands-beyond-crypto…`、`bybit.com/en/help-center/article/Introduction-to-Bybit-Stocks`；
  - 403：`defillama.com/chain/mantle`、`theocc.com/newsroom/...`、`ir.cboe.com/...`。

## 开放问题

1. mStocks 的一手条款：发行文件、标的清单、链上合约（是否有 pause、黑名单、multiplier）、资格地区、在 Mantle 上的价格源。
2. Chainlink v10 tokenized-asset streams 和股票 streams 是否已在 Mantle 开通（VerifierProxy 加 feedId）。
3. Mantle 上 xStocks 的确切标的数、各池深度、Fluxion 与发行方报价之间的基差时间序列（建议用 v10 的 `price` 与 `tokenizedPrice` 采样）。
4. Mantle 部署的 xStocks 实现版本、`feePerPeriod` 是否为 0、pauser 和 owner 是谁（需要 cast 读链）。
5. Aave Mantle 上架 xStocks 或 mETH 的治理进展；有没有协议提供 xStocks 借出（做空对冲）。
6. 有没有期权做市商（Orbit Markets、Flowdesk 等）愿意在 Mantle 上为 xStocks RFQ 报价，休市时段如何处理。
7. MethLab、Pendle 在 Mantle 的实际规模；DefiLlama 与 aavetracker 的 Aave TVL 口径差异。
8. 主网 preconf 车道是否可供 RFQ 结算使用（承接 papertrade notes 开放问题 3）。

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| X1 | xStocks 原生发行链包括 Ethereum、Solana、Arbitrum、Mantle、TON、Ink 等 | [1] docs.xstocks.fi/docs “Multi-Chain”；[2] FAQ | observed | |
| X2 | xStocks 于 2026-04-10 在 Mantle 上线，经 Fluxion 交易，充提仅通过 Bybit | [9] Mantle 新闻稿转载（2026-04-10）：“exclusively through Bybit” | observed | |
| X3 | 2026-05-07 xStocks 在 Mantle 激活 xChange Atomic RFQ，可直接向发行方铸造和赎回 | [8] xStocks News《Introducing xStocks on Mantle》 | observed | |
| X4 | xStocks 公共 API 显示至少约 100 个标的有 Mantle 部署，结算币为 Mantle USDC 0x09bc…0df9 | [6] /public/assets?network=Mantle 检索命中数（工具截断，作为下限） | observed | |
| X5 | 每个 Mantle 上的 xStock 部署都带 wrapperAddressV2（ERC-4626 非 rebasing 封装） | [6] API 字段；[7] WrappedBackedTokenImplementation.sol@35859e8c75 注释 | observed | |
| X6 | USPXx 只在 Fluxion 交易（2026-06-24 上线） | [10] Mantle 新闻稿转载 “trades exclusively on Fluxion” | observed | |
| X7 | DefiLlama 桥接口径下 Mantle 上的 xStocks：SNDKX $16.1M、HOODX $10.7M、NVDAX $9.1M、SPYX $7.7M、QQQX $7.2M | [18] DefiLlama bridged/mantle 搜索快照（聚合数据） | observed | |
| X8 | mStocks 由 Bybit 与 Mantle 合作，目标 2026-11 上线，1:1 实股支持，可在 Mantle AMM 交易，可作 Bybit UTA 抵押 | [11] Gate News 转引 PANews、Bybit 新闻稿转载（媒体） | observed | |
| X9 | mStocks 发行人为 BVI 的 Halo Prime Limited，性质为 limited-recourse debt obligations，Bybit 不是发行人或托管人 | [11] CryptoBriefing 2026-10-13（媒体报道，无一手原文） | speculative | |
| X10 | 没有查到 Ondo Stocks（原 Ondo Global Markets）部署在 Mantle 的证据 | [13] Ondo 地址页 Mantle 段只有 USDY、mUSD、Oracle、Blocklist | observed | |
| X11 | Mantle 上的 USDY 为 0x5bE2…c5A6，mUSD（0xab57…7cF3）是它在 Mantle 上的 rebasing 版本，另有 Blocklist 合约 | [13] docs.ondo.finance/addresses.md Mantle 表 | observed | |
| X12 | USDY 依 Reg S 只面向非美国人，新申购有至少 40 天受限期 | [14] Ondo How it Works、Eligibility | observed | |
| X13 | DefiLlama 桥接口径：Mantle 上 mETH $153.1M、cmETH $25.6M、FBTC $20.0M、USDY $13.5M、XAUT $43.7M | [18] bridged/mantle 搜索快照 | observed | |
| X14 | mETH 赎回最少 12 小时，最长可能 40 天以上；cmETH 赎回最长约 7 天 | [16] Mantle Docs mETH Protocol | observed | |
| X15 | MI4 是 BTC/ETH/SOL/美元稳定币的加密指数基金，Mantle Treasury 承诺 $400M 锚定投资；DefiLlama 记 TVL $110.5M | [21] Securitize 新闻稿；[18] DefiLlama 链页快照 | observed | |
| X16 | Aave V3 于 2026-02-11 在 Mantle 主网上线，配 8M MNT 和 1.5M GHO 激励 | [20] 新闻稿转载；Aave changelog | observed | |
| X17 | Aave Mantle 供应 $330.4M、借出 $144.0M，资产为 USDT0、sUSDe、syrupUSDT、USDe、FBTC、USDC、GHO、WETH、WMNT、wrsETH，不含 xStocks 和 mETH | [19] aavetracker（读 Aave API，2026-10-15 16:05 UTC，第三方） | observed | |
| X18 | DefiLlama 链页把 Aave V3 在 Mantle 的 TVL 记为 $89.47M，与 aavetracker 口径冲突 | [18] 链页快照；[19] | observed | |
| X19 | DefiLlama Mantle TVL：Lendle $0.18M、INIT $1.81M、Agni $16.3M、Merchant Moe $12.1M、Fluxion $7.05M | [17] api.llama.fi currentChainTvls / tvl | observed | |
| X20 | Fluxion 是 AMM v2/v3 与订单簿（RFQ）的混合 DEX，30 天成交约 $24.9M | [18] DefiLlama Fluxion 页快照；[9] | observed | |
| X21 | Mantle 全链 DEX 日成交约 $1–5M，永续 24h 和 7d 成交均为 $0 | [18] DefiLlama 链页两个快照 | observed | |
| X22 | Mantle 全链 TVL：API 为 $95.4M，链页快照为 $146M，口径和时点不一 | [17] /v2/chains；[18] | observed | |
| X23 | Mantle 官方 dApp 页列出 MethLab（固定利率、固定期限、无清算、无预言机） | [40] mantle.xyz/dapp 搜索快照 | observed | |
| X24 | Chainlink v10 tokenized-asset 报告同时含 price、tokenizedPrice、marketStatus、currentMultiplier、newMultiplier、activationDateTime | [22] Report Schema v10 字段表 | observed | |
| X25 | Chainlink v10 的 price 周末不更新，tokenizedPrice 用 CEX 交易持续更新 | [22] v10 Weekend Usage Disclaimer | observed | |
| X26 | Chainlink 是 xStocks 的官方预言机，但其生态页 xStocks 条目只列 Solana 和 Ethereum | [23] xStocks News；chainlinkecosystem.com/ecosystem/xstocks | observed | |
| X27 | 没有查到 Mantle 上已开通 xStocks 或股票 Data Streams 的证据 | 由 X26 与 [24]（Mantle 只查到 XAU/USD、MNT/USD feed）推出；否定性结论 | speculative | |
| X28 | Mantle 官方 Oracles 文档至 2026-10-16 仍无 Chainlink；Pyth Core 在 Mantle 仍未升级 | [25][26] 重新抓取；转引自 papertrade-deep-dive notes-mantle X24、X26 | observed | |
| X29 | DefiLlama 在 Mantle 的期权分类下只有 Stryke CLAMM，TVL 和成交均为 $0 | [18] defillama.com/protocols/options/mantle 搜索快照 | observed | |
| X30 | Rysk V12 只部署在 HyperEVM 和 Ethereum，不在 Mantle | [36] Rysk Important Contracts；DefiLlama Rysk 页 | observed | |
| X31 | Thetanuts V4 SDK 只支持 Base（完整）和 Ethereum（vault），不在 Mantle | [37] Thetanuts SDK Supported Chains | observed | |
| X32 | xStocks 二级市场 24/7，向发行方申购和赎回只在 24/5 | [2] FAQ | observed | |
| X33 | Mantle 上 xChange 按时段设单笔上限：market / extended $10M、overnight $1M、closed $0，最低 $1,000 | [6] API limitsPerPeriod | observed | |
| X34 | Chainlink 建议 marketStatus=1（休市）时保持市场关闭，休市期间重复使用收盘价 | [22] Handling Market Events | observed | |
| X35 | xStocks 用链上 multiplier 处理分红（税后再投资）、拆股和反向拆股；EVM 上 balanceOf 自动调整 | [3][4] xStocks Docs | observed | |
| X36 | xStocks 合约在 feePerPeriod>0 时会按期下调 multiplier，管理费也通过 multiplier 体现 | [7] BackedAutoFeeTokenImplementation.sol@35859e8c75 getCurrentMultiplier | observed | |
| X37 | xStocks 合约同一时间只允许一个待生效的 multiplier 更新，后提交的覆盖前一个 | [7] _storeScheduledMultiplierUpdate 注释 | observed | |
| X38 | multiplier 激活时点三处说法不一：xStocks 文档 00:30 UTC、Chainlink 文档 00:00 UTC、SPYx 实测 23:55 / 00:15 / 04:00 UTC | [3][22][6] multiplier/history | observed | |
| X39 | xStocks 建议在 multiplier 激活前后各暂停约 15 分钟 | [4] Multiplier Updates 节 | observed | |
| X40 | Chainlink 警告：休市时激活 multiplier，在价格调整前不得计算理论价，应保持暂停 | [22] Handling Stock Splits | observed | |
| X41 | xStocks EVM 合约有 pauser（可暂停全部转账）和 Chainalysis 制裁名单（拦截 from、to、spender），owner 可更换 | [7] BackedTokenImplementation.sol@35859e8c75 | observed | |
| X42 | xStocks 官网“Permissionless、无技术转让限制”的说法与合约中的 pause 和制裁权限存在张力 | 由 X41 与 [1] 推出 | inferred | |
| X43 | 锁在期权合约里的 xStocks 抵押品可能因发行方 pause 或制裁而无法交割 | 由 X41、X5（封装继承制裁检查）推出 | inferred | |
| X44 | 向 xStocks 发行方直接申赎需要 KYC，最低 $5,000，不面向美国 | [2] FAQ | observed | |
| X45 | 没有找到 Mantle 上 xStocks 与标的股价之间基差的公开数据；可用 v10 的 price 与 tokenizedPrice 或发行方报价测量 | [22][6]；本次未采样 | inferred | |
| X46 | OCC 2025 年清算期权 152.1 亿张（+24.4%），其中个股 82.7 亿、ETF 56.8 亿、指数 12.6 亿 | [28] OCC newsroom 搜索快照 | observed | |
| X47 | 2025 年 12 月 SPX 0DTE ADV 2.3M，占 SPX 成交 59%；Cboe 称零售约占全市场日成交近一半 | [29] Cboe IR 摘要；Cboe Q3 2025 文章 | observed | |
| X48 | Bybit 于 2026-06-12 上线 XAUT 期权（Orbit Markets 做市，带 RFQ）；Derive 于 2026-07-24 上线 XAUT 期权；Coincall 于 2026-08-26 上线 SPY / QQQ / XAG 期权 | [30][31][32] | observed | |
| X49 | Bybit 于 2026-07-22 把 xStocks 纳入 Dual Asset 结构化产品（6 个标的，期限 8 小时 / 1 天 / 7 天） | [33] Bybit Press | observed | |
| X50 | 截至 2026-10-16，没有看到以 tokenized 个股为标的、链上结算且有规模的期权市场 | 由 X29、X30、X31、X48 与 [38] 推出；否定性结论 | speculative | |
| X51 | Mantle 已具备“标的 + 结算币 + 现货 RFQ”，但缺少期权的风险承接层（期权协议、永续、可做空的借贷） | 由 X3、X4、X17、X21、X29–X31 推出 | inferred | |
| X52 | 全额抵押的保护 / 收益结构 + RFQ（方向 a）不需要组合保证金和链上深度现货，在 Mantle 上前置条件缺口最小 | 由 X51、X49（CEX 端已有 xStocks 结构化需求）推出 | inferred | |
| X53 | RWA 结算与公司行动适配层（方向 b）是方向 a 的前置条件，且各发行方规则不统一，值得作为共享基础设施 | 由 X35–X40 推出 | inferred | |
| X54 | 复制型 / 组合保证金 venue（方向 c）在 Mantle 现阶段前置条件最缺，应后置 | 由 X17（不能借 xStocks 做空）、X21（永续 $0、DEX 薄）推出 | inferred | |
| X55 | 优先级建议：a 与 b 并行 > d > e > c（是建议，不是 Mantle 路线） | 由 X52–X54、X14、X12、X48 推出；需求与做市意愿未验证 | speculative | |
| X56 | 以 mETH / USDY 为抵押的结构化产品（方向 e）受赎回延迟、Reg S 和 Aave 不收 mETH 的限制 | 由 X12、X14、X17 推出 | inferred | |
| X57 | Mantle 官网显示 Treasury $2,255,065,530（As of 2026-10-15 15:56 UTC）、Real World Capital $759M | [39] mantle.xyz 首页 | observed | |
| X58 | Hyperliquid HIP-3 第三方股票永续在标的休市时以内部价格锚定最后一次外部报价 | [34] HyperAcademy（第三方描述） | observed | |
| X59 | GPT 称“USDY 与 rUSDY 列出 Mantle 部署”不准确：Mantle 上是 USDY 与 mUSD | [13] 对照 [42] §8.1 | observed | |

# notes-ecosystem — Lane E：Jeff Yan 观点 + 链上期权生态

- 本路范围：brief 研究问题 2（Jeff Yan / Hyperliquid 在期权或类期权上的观点、计划、已上线产品）和问题 3（链上期权演进史与踩过的坑、当前协议对照、市场数据与 CEX 对比、为什么难做、RFQ 交易流程）。
- 资料截止：2026-10-16。所有网页访问日期均为 2026-10-16（另有说明的除外）。
- 台账前缀：E。
- 工具限制：本次运行环境**没有 bash / python / curl**。DefiLlama API 是用 `fetch_content`（raw 模式，直接 HTTP）拉取的；所有百分比和比值都是**手算**，过程列在“命令与输出”里，页面引用前建议用 python 复算一遍。

---

## 问题 2：Jeff Yan 的观点 / Hyperliquid

### 2.1 Empire 节目（2026-10-07）里他对期权说了什么

**答案**：节目真实存在：Blockworks Empire，《Jeff Yan On Hyperliquid's Plan To Bring All Finance Onchain》，2026-10-07 发布，时长约 30–31 分钟，主持人是 Blockworks 研究员 Shaunda Devens，录制于 DAS 2026 Asia。章节 `11:46 Better Trading Through Fees And Options` 专门讨论期权 [1]。我拿到两段接近原话的内容：
(a) **04:30–05:07**（机器转写，一手音频的第三方转写 [2]）：他说常有人问 Hyperliquid 为什么不能交易期权；他的回答不是“perps 比期权好”，两者“very complementary（高度互补）、用途不同”；HIP-4 是“options or option-like payout curves can be built and scaled to a point where it's useful for users（期权或类期权收益曲线可以在其上搭建并做到对用户有用的规模）”的原语，“I hope that's another story that has yet to unfold（希望这会是另一个尚待展开的故事）”。
(b) 回答“如果你是 builder、不许做基础设施，你会做什么”时（时间戳未核实），据火星财经 / Odaily 的转述 [4][5]：此刻他“可能会去研究期权”，因为很多人想交易期权；perps 已满足大部分用户，但部分用户仍无法完整表达市场观点；**“HIP-4 是构建期权协议的一条很清晰的路径”**，可以继承现货、订单簿和组合保证金，做市方还能用 perps 对冲期权 delta；关键在于把它做成大众愿意用的产品；他认为加密领域里还没有哪种期权或凸性收益产品真正达到“escape velocity”，而 TradFi 里已经做到了。

**依据**：[1] 节目页与章节；[2] Podscan 转写（只公开前 ~6.5 分钟）；[3] YouTube 版本 e0xi_NeVk4w（30:36）；[4][5][6] 媒体转述。

**不确定之处**：
- 没拿到 11:46–18:19 段的逐字稿（YouTube 字幕抓取失败，Podscan 完整转写需要注册）。(b) 段是**中文媒体转述再回译成英文**的内容，措辞只能算“接近原话”，所在时间段也没核实（推测在 11:46 段或 27:05 段）。
- 节目里他把期权定位为**第三方 builder 可以在 HIP-4 上做的方向**，而不是 Hyperliquid Labs 自己的产品路线。CryptoBriefing（经 KuCoin 转载）[7] 写成“Hyperliquid to add options to platform”，并说他“announced the move”，这和 [2][4][5] 对不上，应视为误读，不能当作 Hyperliquid 的期权路线承诺。
- 另据 CoinDesk / Bloomberg（2026-10-15）[60]，他在 Bloomberg 访谈中主张监管应落在“deployers”（市场部署方）而不是底层链。这与期权无直接关系，但能说明他把市场部署方当作承担合规责任的一层。

### 2.2 Hyperliquid 在期权 / 类期权方向已公开的计划与已上线产品

**答案**：
- **HIP-4 = Outcome markets（结果合约）**，不是期权本身。官方定义：全额抵押、在固定区间内结算的合约，“useful for applications such as prediction markets and bounded options-like instruments（适用于预测市场和有界的类期权工具）”，带来“non-linearity, dated contracts（非线性、带到期日）”，没有杠杆，也没有清算 [8]。
- 首个市场是**每日循环的 BTC 二元合约**，06:00 UTC 按 HyperCore 的 BTC mark price 结算 [8][9]。合约规格示例：`class:priceBinary|underlying:BTC|expiry:20260503-0600|targetPrice:78213|period:1d`；结算价取结算时刻前后两次 mark 更新之间的线性插值，插值 ≥ targetPrice 则 YES [9]。另有三档的 `priceBucket` 多结果合约 [9]。
- Yes/No 两边的订单簿合并共享流动性：在 p 买入 Yes 等价于在 1−p 卖出 No；支持 split / merge / negate [8]。
- 时间线：2026-02-02 宣布，2026-05-02 主网上线（媒体 [14]，与 [9] 示例里的 expiry 20260503 一致）。2026-08-14 官方公告启用费用：只在平仓或结算时收费，开仓免费，平均费率是现货的一半 [11]。注意 docs 页 [8] 仍写着“Fees are currently zero”，已经过时。
- **HIP-3（builder 部署的 perps）**：部署者负责市场定义、预言机和结算，主网质押要求 500k HYPE [16]。它是永续，不是期权。
- **Portfolio margin（组合保证金）**：2025-12 上线 [13]，2026-06-25 进入 beta 并提高限额 [12]。现货、perps 以及 outcomes 统一保证金；BTC / HYPE 可作抵押借 USDC / USDT（LTV 分别为 0.5 / 0.65）；portfolio_margin_ratio > 0.95 时可被清算 [10][12]。
- **官方 docs 和公告里没有“原生香草期权”产品或路线**（截至 2026-10-16，只检索了 HIPs 目录 [8] 和公告）。

**依据**：[8][9][10][11][12][13][14][16]。

**不确定之处**：HIP-4 宣布日和上线日来自媒体与第三方指南 [14][15]，没有找到 Hyperliquid 官方的上线公告原文。Kalshi 人员参与 HIP-4 提案的说法只在第三方博客里出现，未采用。

### 2.3 Hyperliquid 现有能力里对期权有用的部分

**答案**：
1. **HIP-4**：可以直接表达有界收益（二元、区间桶）；把多个 strike 的二元合约拼起来，可以近似 capped call / call spread。这一点是推论，Jeff 自己的说法是“option-like payout curves” [2]。
2. **Portfolio margin**：现货、perps、outcomes 统一保证金，正好是做市商对冲期权 delta 需要的条件 [10]。
3. **HIP-3 perps**：可对冲 RWA / 股指等非加密标的；而且 2026-08 末首批第三方 HIP-4 市场就建在 trade.xyz 的 HIP-3 指数 perps 上（第三方指南 [15]）。
4. **HyperEVM 上已有期权协议**：Rysk V12 部署在 HyperEVM。DefiLlama 显示它 30 天名义成交 $145.7M，Rysk 的 TVL 84% 在 Hyperliquid L1 [17][48]。Hypersurface、Racks 也在 Hyperliquid L1 上，但近 30 天基本没有成交 [17]。

**不确定之处**：outcome 头寸在 portfolio margin 里能抵扣多少保证金，docs 没有给公式。

---

## 问题 3：链上期权生态

### 3.1 演进时间线（每项都有来源）与踩过的坑

**答案**：链上期权经历了五代路线：保险式全额抵押期权（Opyn v1、Hegic 池）→ DOV 金库卖波动率（Ribbon、Dopex SSOV、Thetanuts V3）→ AMM + delta 对冲（Lyra v1）→ 永续 / 凸性产品（Squeeth、Panoptic）→ 链下撮合、链上结算的订单簿 / RFQ + 组合保证金（Aevo、Derive V2/V3、Paradex、Rysk V12、Thetanuts V4）。几个代表性的坑：
- 合约漏洞：Opyn 2020 年的“double exercise”；Ribbon 遗留 vault 2025 年因预言机升级被盗；Typus 2025 年预言机缺权限检查。
- LP / 卖方长期亏损：Hegic LP 已实现 PnL 为负；Lyra 在其介绍文里点名“静态波动率导致 LP 持续亏损”；Ribbon 部分 vault 累计收益为负。
- 机制过于复杂：Dopex rDPX v2 的多层代币加算法稳定，被审计方点名在极端行情下有风险。
- 难以扩张：Ribbon 被 Blockworks 报道为“struggled to scale”，最后转向 Aevo。

时间线数据：

| 年份 / 日期 | 事件 | 来源 | 类型 |
|---|---|---|---|
| 2020 | Hegic 上线：peer-to-pool，LP 池作为卖方，ETH put 用 DAI 全额锁定 | [39] Hegic v1 站点 | observed |
| 2020-08-04 | Opyn v1（Convexity）ETH put 遭“double exercise”攻击，被盗 371,260 USDC；白帽追回 ~439k USDC；卖方被全额补偿 | [30] 官方 post-mortem；[31] | observed |
| 2021-04 | Ribbon Finance 上线 Theta Vault（DOV），每周卖 OTM covered call / put，期权通过 Opyn 铸造 | [38]（媒体） | observed |
| 2021 | Lyra 发布：L2 上的期权 AMM，用 Synthetix 做 delta 对冲；介绍文点名旧 AMM“静态波动率 → LP 持续亏损、无对冲 → 极端风险、流动性低” | [28] | observed |
| 2021 | Paradigm 发表 Everlasting Options（永续期权的 funding 机制） | [52] | observed（年份见不确定处） |
| 2022-01-18 | Opyn Squeeth（ETH² power perp）主网上线 | [32] GitHub release | observed |
| 2023-06 / 2023-07-25 | Aevo 主网（OP Stack L2，链下订单簿）；RGP-33 通过，Ribbon 并入 Aevo，RBN 按 1:1 迁移到 AEVO；报道称 Ribbon“struggled to scale” | [34][35] | observed |
| 2023-10 | Dopex rDPX v2 审计：多层代币加算法稳定机制“could be problem in extreme market situations” | [41] | observed |
| 2024-02 | Dopex 更名 Stryke（SYK），SSOV / rDPX v2 落日，只保留 CLAMM | [40]（日期来自二手） | observed |
| 2024-08-28 | Lyra 更名 Derive | [26] | observed |
| 2024-11-04 | Squeeth 关停，按结算价赎回 | [33] | observed |
| 2024-12-18 | Panoptic 在 Ethereum 主网上线（基于 Uniswap v3/v4 LP 的永续期权） | [42] | observed |
| 2025-01-15 | DRV 代币上线（LYRA 按 1:1 迁移） | [27] | observed |
| 2025-05-08 / 2025-08-14 | Coinbase 宣布 / 完成收购 Deribit（约 $2.9B） | [53][54] | observed |
| 2025-06 | Premia 更名 Kyan（v4：期权 + perps + 组合保证金） | [43] | observed |
| 2025-10-15 | Typus（Sui，DOV 及其他产品）TLP 合约预言机缺权限检查，被盗 ~$3.44M（DOV 未受影响） | [58]（媒体，引官方 post-mortem） | observed |
| 2025-12-12 | Aevo 遗留的 Ribbon DOV vault 因 12-06 预言机升级（任何人可为新资产设价）被盗 ~$2.7M，vault 下线 | [36]（媒体） | observed |
| 2026-02-02 / 2026-05-02 | Hyperliquid HIP-4 宣布 / 主网 | [14][8] | observed |
| 2026-04 | Paradex Dated Options 公测（欧式、USDC 现金结算） | [45][44] | observed |
| 2026-07-24 | Derive 上线 XAUT 期权，“first RWA options market on Derive” | [24] | observed |
| 2026-09 中 | Paradex 接入 Paradigm RFQ，期权 OI 升至 $202M | [46]（媒体） | observed |
| 2026-10-07 | Derive V3 上线：用 ZK 交易所替换 Derive Chain，结算在 Ethereum L1 | [19][20] | observed |

**踩过的坑（每条有来源）**：
1. **合约 / 预言机安全**：Opyn 2020 年的 `exercise()` 多 vault 重复计数 [30]；Ribbon 遗留 vault 的预言机升级让任何人都能给新资产定到期价 [36]；Typus 预言机缺 authority check [58]。共同点是**结算价（fixing）路径是最脆弱的一环**。
2. **卖方 / LP 长期吃亏**：Hegic LP 自上线以来已实现 PnL 一直为负，靠流动性挖矿补贴（2021 年研究报告，二手）[39]；Lyra 自己说旧 AMM“static volatilities and imprecise pricing, leading to consistent losses for LPs”[28]；Ribbon 前端显示 T-WBTC-C 累计收益 −21.32%、T-sAVAX-C −48.22%（快照时间未知）[37]。
3. **DOV 规模化失败**：Rysk 官方总结“DOVs proved user demand but could not scale due to pooled risk and rigid design”[48]；Ribbon“struggled to scale”[35]。“DOV 收益被做市商在拍卖中吃掉”这一点**没有找到一手量化证据**（见台账 speculative）。
4. **机制过度复杂**：rDPX v2 [41]；Squeeth 关停 [33]。
5. **链上 IV 系统性偏高 / 不具竞争力**：Andolfatto & Schönleber 发现链上（Lyra V2）期权 IV 高于 Deribit，归因于费用结构、成交量和净买压，并指出 DEX 只占期权成交量约 1% [29]。

**不确定之处**：Lyra v1 上线月份（官方介绍文发布于 2021 年；Delphi 称 v1 于 2021-11 上线，但 Delphi 是付费二手报告）；Dopex SSOV 的首发年份（推断为 2021，未找到一手来源）；Everlasting Options 的确切发表日期（页面没显示，记忆中是 2021 年，未核实）；Zeta（Solana）期权的历史时间线没核实，只确认前端显示“Trading on Zeta Markets has been halted”[59]；Drift **没有找到期权产品的证据**。

### 3.2 当前主要协议对照（截至 2026-10-16）

**答案**：订单簿 / RFQ + 组合保证金的专业场所（Derive、Paradex、Aevo）占了绝大部分成交。全额抵押 RFQ（Rysk、Thetanuts V4、SOFA）走结构化收益 / 嵌入式路线。AMM / CLAMM / 批量拍卖路线（Stryke、Kyan、Ithaca、Hegic）基本停滞。RWA 期权已有先例：Derive 的 XAUT（2026-07）；Derive V3 docs 已为美股标的预留了 4pm 纽约时间的结算设定 [23]。

协议对照表（每行：协议 / 链 / 架构 / 保证金 / 结算 / 标的 / 现状 / 来源；“30d”指 DefiLlama 截至 2026-10-16 的 30 天名义成交）：

| 协议 | 链 | 架构 | 保证金 | 结算 | 主要标的 | 现状（30d 名义） | 来源 |
|---|---|---|---|---|---|---|---|
| Derive V3 | Derive V3（ZK 交易所，结算到 Ethereum L1；2026-10-07 前为 Derive Chain，chain id 957） | 链下低延迟订单簿 + RFQ（多腿、原子执行）+ vault | Standard（SM，跨抵押）或 Portfolio（PM2，情景网格）；按 risk universe 隔离损失 | 欧式；默认 08:00 UTC 结算，美股标的为 4pm NY；按 universe 的 cash 币种结算（现金结算是推论） | BTC、ETH、SOL、HYPE、ZEC、XRP、XAUT 等 | 活跃；V2 $3.36B + V3 $0.88B = $4.25B | [17][19][20][21][22][23][24] |
| Paradex | Paradex（Starknet appchain） | 订单簿 + Paradigm RFQ；另有永续期权 | 组合保证金（已有 PM 账户功能） | 欧式，USDC 现金结算，08:00 UTC，30 分钟 TWAP | BTC、ETH 等 | 活跃；$484M | [17][44][45][46] |
| Aevo | Aevo L2（OP Stack）；DefiLlama 记在 Ethereum | 链下订单簿 + OTC | Standard / Portfolio（15 个情景加 floor margin） | 欧式（未逐字核实） | ETH、BTC 等 | 活跃但小；$66.6M | [17][35][49] |
| Rysk V12 | HyperEVM（Hyperliquid L1） | 逐笔 RFQ（2 秒聚合），非池化 vault | 全额抵押（逐笔锁定） | 欧式，**实物交割**；周五 08:00 UTC，与 Deribit 对齐；Stork + Pyth 指数 | HYPE、ETH、BTC、LST/LRT 等 | 活跃；$145.7M | [17][48] |
| Thetanuts V4 | Base（另有 Ethereum、Robinhood Chain） | OptionBook（链下签名挂单，链上 `fillOrder`）+ RFQ Factory（ECDH 加密密封报价） | 全额抵押（spread 锁宽度） | 到期由预言机结算；OptionBook 每日结算；RFQ 支持实物期权 | ETH、BTC（USDC / WETH / cbBTC 抵押） | 活跃但很小；$0.48M | [17][47] |
| Panoptic V2 | Ethereum、Robinhood Chain | 基于 Uniswap LP 的永续期权（streaming premium） | 协议内抵押与杠杆（细节未核实） | 永续，无到期 | 任意 Uniswap 交易对 | 活跃但小；$28.7M | [17][42] |
| SOFA.org | Ethereum、Arbitrum、BSC、Polygon、Sei | 做市商报价的结构化产品（Rangebound / Trend），ERC-1155 头寸 | 双方资产全额锁入 vault | 到期领取赔付 | BTC、ETH 等 | 小；30d 权利金 $0.22M | [18][50] |
| CallPut | Base | 未核实 | 未核实 | 未核实 | 未核实 | 活跃；$97.8M | [17] |
| Hegic | Arbitrum | 池卖方（peer-to-pool）+ 策略 | 池全额抵押 | 现金结算、美式（据二手） | ETH、BTC | 很小；$1.52M | [17][39] |
| Stryke（ex-Dopex）CLAMM | Arbitrum、Sonic、Base、Blast、**Mantle** | 集中流动性期权 AMM（借 Uniswap v3 LP） | LP 资产作抵押 | 美式（二手） | ETH、ARB、BTC | **停滞**；30d = 0 | [17][40] |
| Kyan（ex-Premia） | Arbitrum | 期权 + perps + 组合保证金 | PM | 未核实 | — | **停滞**；Kyan Blue Options 30d = 0 | [17][43] |
| Ithaca | Arbitrum | 频繁批量拍卖 + RSBB 分解 + MILP 撮合 | 抵押优化引擎 | 未核实 | — | **近乎停滞**；30d 权利金 $1,999 | [18][51] |
| Typus DOV | Sui | DOV | 全额 | — | SUI 等 | 近乎停滞；$16k | [17][58] |
| Opyn Squeeth | Ethereum | Power perp | — | — | ETH² | **已关闭**（2024-11-04） | [33] |
| Ribbon DOV | Ethereum | DOV | 全额 | — | — | **已关闭**（2025-12 下线） | [36] |
| Zeta | Solana | （早期为期权，后转 perps，未核实） | — | — | — | **前端显示交易已停止** | [59] |

是否支持 RWA：Derive 支持 XAUT [24]，V3 预留了美股结算时间 [23]；HIP-4 的第三方市场有基于 trade.xyz 指数 perps 的二元合约（第三方信息）[15]。其他协议没有找到 RWA 期权的一手证据。

**不确定之处**：Aevo 的行权方式和结算细节、Panoptic V2 的保证金模型、CallPut 的架构都没读 docs；Derive V3 是现金结算这一点是从“quote 必须等于 universe 的 settlement (cash) currency”推出来的 [23]，不是明文。

### 3.3 市场数据（DefiLlama + CEX 对比）

**答案**：截至 2026-10-16，DefiLlama 统计的链上期权近 30 天名义成交约 **$5.07B**，权利金约 **$88.2M**；近 1 年名义约 **$21.0B**，权利金约 **$543M**。Derive（V2 + V3）占 30 天名义的 **~83.7%**、30 天权利金的 **~91.2%**、1 年名义的 **~83.8%**。按 Alea 的统计，2026-10-01 Derive 期权 OI 约占“Deribit、OKX、Bybit、Binance、Derive 合计 $44.7B”的 3.1%（约 $1.39B），Deribit 占 78.2%（约 $35B），是 Derive 的 **25.3 倍** [25]。Deribit 自家统计页显示 BTC 期权 OI 名义约 $31.2B、ETH 约 $3.7B（快照时刻未标明）[56]。学术研究估计 DEX 只占期权成交量约 **1%** [29]。

明细（DefiLlama，30 天名义 / 30 天权利金）[17][18]：

| 协议 | 30d 名义 | 份额 | 30d 权利金 | 份额 |
|---|---|---|---|---|
| Derive Options（V2，Derive Chain） | $3,361.6M | 66.3% | $57.59M | 65.3% |
| Derive V3 Options（10-07 起） | $884.1M | 17.4% | $22.83M | 25.9% |
| **Derive 合计** | **$4,245.7M** | **83.7%** | **$80.42M** | **91.2%** |
| Paradex Options | $484.0M | 9.5% | $4.07M | 4.6% |
| Rysk V12 | $145.7M | 2.9% | $1.53M | 1.7% |
| CallPut | $97.8M | 1.9% | $0.35M | 0.4% |
| Aevo Options | $66.6M | 1.3% | $1.50M | 1.7% |
| Panoptic V2 | $28.7M | 0.6% | $0.02M | — |
| 全市场 | $5,074.1M | 100% | $88.20M | 100% |

- Derive 的 Q3 2026 数据（Alea [25]，作者披露“Alea maintains Derive's Data Room”，存在利益关系）：期权名义 $7.45B，环比 +89.6%；链上权利金份额 90.4%；成交笔数 +6.2%；平均单笔从 $47K 升到 $84K；每 $1 名义的权利金从 3.16¢ 降到 2.35¢；BTC + ETH OI 季末 $528M + $795M；Q3 费用 $1.35M。
- 链上期权的 OI 没有 DefiLlama 汇总，只能用 Derive 的 OI 近似。Paradex 期权 OI $202M（2026-09，媒体）[46]。
- CEX 对比：Coinbase 2025-05-08 宣布以约 $2.9B（$700M 现金 + 1,100 万股 COIN）收购 Deribit [53]，2025-08-14 完成；当时 Deribit OI 约 $60B，2025 年 7 月成交 >$185B，2024 年全年 >$1T [54]。2026-10-15 Coinbase 市场数据页显示 Deribit 全品种衍生品 OI $38.48B、24h 成交 $12.92B，但没有拆分期权 [55]。CME 2026 Q3 加密期货 + 期权 ADV 19.6 万张，总名义 $469.5B，**没有单列期权** [57]。

**不确定之处**：DefiLlama 有当天未结束的数据（total24h 会变）；V2 与 V3 交接期存在跨协议拼接；Deribit 统计页的 OI 快照时刻不明，与 Alea 的 10-01 数字（~$35B）量级一致；没有拿到 Deribit 近 30 天**期权**成交额，所以链上 / Deribit 的成交量比只能引用 [29] 的约 1%，或用 OI 比（3.1% 份额、Deribit 是 Derive 的 25.3 倍）近似。

### 3.4 为什么链上期权一直难做（有来源的论证）

**答案**：核心是**做市商的风险和资本成本**，不是撮合本身：
1. **系列数爆炸 → 流动性碎片化**：每个（标的 × 到期 × 行权价 × C/P）都是独立盘口。Rysk 把“markets are fragmented”列为前代失败原因 [48]；Rysk 选择与 Deribit 的行权价和到期日对齐（周五 08:00 UTC）[48]，说明链上场所需要借 CEX 的标准化系列来集中流动性（推论）。
2. **做市商需要外部对冲和资本效率**：Thetanuts 文档里做市商的报价 = 交易所（Deribit 等）bid/ask + 抵押资金成本，抵押 APR 为 cbBTC 1%、WETH 4%、USDC 7% [47]。全额抵押把资金成本直接加进价格。Jeff Yan 的论点是用 perps 对冲期权 delta，再用组合保证金统一 [4][5]；Derive 和 Aevo 用情景式组合保证金降低对冲组合的保证金 [22][49]。
3. **AMM 需要 IV 曲面，否则 LP 被逆向选择**：Lyra 的论述 [28]；链上 IV 系统性高于 Deribit [29]。
4. **预言机 / 结算是最常出事的环节**：Opyn、Ribbon、Typus 的事故 [30][36][58]；Paradex 用 30 分钟 TWAP 并提示 TWAP 期间 delta 会衰减 [44]；Hyperliquid 用 mark 插值 [9]。
5. **gas 与撤单成本**：Lyra 说复杂定价在 L1 上 gas 太贵，所以上 L2 [28]；现在的头部场所都是链下撮合（Derive 亚毫秒撮合 + ZK 证明结算 [19]）。做市商还需要 MMP、cancel-on-disconnect、price banding 等保护工具 [21 的相关页面 / llms.txt]。
6. **需求结构**：零售和 DOV 天然是“卖方”（卖波动率换收益），真实买方不足。Rysk 自述的定位是“users selling volatility and counterparties buying it” [48]；Alea 显示 Derive 的增长主要来自单笔变大，不是笔数增加 [25]，即机构化。

**不确定之处**：第 6 点“零售以卖方为主”只有协议定位和间接数据支撑，没有找到链上买卖方向的统计（标 inferred）。

### 3.5 一笔 RFQ 期权交易的典型流程（供时序图使用）

**A. Derive V3 RFQ（链下 RFQ + 签名 + 引擎原子执行，ZK 证明到 Ethereum）**[21][22]
1. Taker 调用 `private/send_rfq`，参数为 legs（`instrument_name`、`amount`、`direction`）以及可选的 `counterparties`、`max_total_cost` / `min_total_cost`、`partial_fill_step`。**这一步是未签名的 intent，不动资金**；RFQ 默认 30 分钟内可报价（`valid_until`）。
2. Maker 用 `private/poll_rfqs` 或订阅 `{wallet}.rfqs` 发现 RFQ，然后调用 `private/send_quote` 提交带价格的 legs、`direction`、`max_fee`，附 **EIP-712 签名**（`signer`、`signature`、`nonce`、`signature_expiry_sec`）；可开启 MMP。可以用 `replace_quote` 原子替换报价。
3. Taker 用 `private/poll_quotes`、`{subaccount_id}.best.quotes` 或 `private/rfq_get_best_quote` 选出最优报价（cost limit 只在 best-quote 路径上生效）。
4. Taker 调用 `private/execute_quote(rfq_id, quote_id, …)`，同样是 **EIP-712 签名**；引擎重新读取 RFQ 与 quote，**整包原子结算**（all-or-nothing，按 `partial_fill_step` 部分成交）。
5. 约束：交易双方必须在同一个 risk universe，否则拒单；保证金按 SM 或 PM2 计算。

**B. Thetanuts V4 OptionBook（链下签名挂单、链上吃单）**[47]
1. Maker 在链下签名 `OptionBook.Order{maker, orderExpiryTimestamp, collateral, isCall, priceFeed, implementation, isLong, maxCollateralUsable, strikes[], expiry, price, numContracts, extraOptionData}`，由 API 聚合发布。
2. Taker `approve` USDC 后，链上调用 `fillOrder(order, signature, referrer)`，返回 `optionAddress`。**订单字段不能改**，否则签名失效。
3. 每笔成交部署一个新的期权合约并锁定抵押；Thetanuts 每日处理结算。
- 另一种是 **RFQ Factory**（密封报价）：用户调用 `requestForQuotation`（买方托管 reservePrice × 数量，卖方只 approve 抵押）→ 做市商监听 `QuotationRequested`，按 Deribit 价格加抵押成本算价，**EIP-712 签名并用 ECDH 加密**，链上调用 `makeOfferForQuotation()` 只存签名 → reveal 期公开报价金额，最优者胜出（或用户解密后调用 `settleQuotationEarly`）→ 结算时以 EIP-1167 克隆期权合约，抵押转入，权利金转给卖方（费用为名义的 0.06%，上限为权利金的 12.5%）→ 到期预言机定价，ITM 时从抵押中赔付。

**C. Rysk V12（WebSocket JSON-RPC RFQ、2 秒竞价、HyperEVM 结算）**[48]
1. Taker 提交 Request `{asset, chainId, expiry, isPut, isTakerBuy, quantity(e18), strike(e8), taker, usd, collateralAsset}`。
2. 进入 **2 秒聚合窗口**，做市商提交带签名的 Quote（必须逐字段匹配 Request，另加 `maker`、`nonce`、`price(e18)`、`validUntil`、`signature`）；系统先确认做市商在结算合约里有足够的 USDT0。
3. Taker 确认后触发链上结算：会计合约从做市商账户扣出报价金额转给 taker，同时给做市商记入代表期权的 oTokens（Opyn/Rysk Gamma 合约）。
4. 到期按 Stork + Pyth 指数定价，**实物交割**；ITM 买方需要在 EOA 上准备 strike × 数量的 USDT0 并 approve。

---

## 外部调研 / 用户资料中被修正的地方

1. **Jeff Yan 访谈**：外部调研只核实到章节，没有引述。本路补到两段接近原话的内容（04:30 机器转写 [2]；builder 问答的媒体转述 [4][5]）。另外指出 CryptoBriefing“Hyperliquid 将上线期权”[7] 是误读。
2. **外部调研完全没提 HIP-4**：Hyperliquid 的“类期权”就是 HIP-4 outcome markets（有界、全额抵押、二元 / 区间桶），2026-05-02 主网上线 [8][9][14]，Jeff 本人把它当作期权的落地原语 [2]。
3. **Derive 架构已过时**：外部调研说“Derive 旧版官方架构文档……订单簿由运营实体管理”，引的是 V2 / Derive Chain 页面；PM2 链接也是 V2 docs。2026-10-07 Derive V3 上线，用 ZK 交易所替换了 Derive Chain，直接结算到 Ethereum L1，并引入 SM / PM2 加 risk universe [19][20][22]。
4. **Alea 数据**：数字核对一致（$7.45B、+89.6%、90.4%、+6.2%、$47K → $84K）[25]，但外部调研**漏掉了利益披露**（“Alea maintains Derive's Data Room”），而且 Alea 把 XAUT 上线写成 7-23，Derive 原帖是 7-24 [24]。
5. **Ithaca / Stryke / Premia 被当作现行设计介绍**：DefiLlama 显示 Stryke CLAMM 和 Kyan Blue Options 近 30 天成交为 0，Ithaca 30 天权利金只有 $1,999 [17][18]，应标为停滞；Premia 已在 2025 年更名 Kyan [43]。
6. **Rysk V12** 的描述（逐笔 RFQ、独立抵押、实物结算）正确，但外部调研没指出它**跑在 HyperEVM 上**，这和问题 2 直接相关 [48][17]。
7. **Paradex**：外部调研说“已有欧式到期期权”正确；补充公测时间是 2026-04 [45]，2026-09 接入 Paradigm RFQ [46]。
8. 外部调研没有市场集中度的独立核算。本路用 DefiLlama 算出 Derive 占 30 天名义 ~83.7%、权利金 ~91.2%，与 Alea 季度口径（权利金 90.4%）一致。

---

## 来源

1. **PRIMARY** Blockworks Empire 节目页《Jeff Yan On Hyperliquid's Plan To Bring All Finance Onchain》（2026-10-07）——证明节目存在、日期和章节（11:46 Better Trading Through Fees And Options）。https://blockworks.com/podcast/empire/bc375300-c276-11f1-925c-cbee0c7ea3ff （访问 2026-10-16）
2. Podscan 节目转写页（机器转写一手音频，公开部分约到 06:30）——给出 01:31 主持人列举的 HIP-4 / PM 已上线，以及 04:30–05:07 Jeff 关于期权与 HIP-4 的原话。https://www.podscan.fm/podcasts/empire-1/episodes/jeff-yan-on-hyperliquids-plan-to-bring-all-finance-onchain （2026-10-16）
3. **PRIMARY** YouTube 版本（30:36，2026-10-07）——视频存在；字幕没抓到。https://www.youtube.com/watch?v=e0xi_NeVk4w （2026-10-16）
4. KuCoin 快讯（转载火星财经，2026-10-08）——builder 问答的长段转述（媒体）。https://www.kucoin.com/news/flash/hyperliquid-founder-jeff-yan-considers-options-research-for-future-venture （2026-10-16）
5. Binance News（转载 Odaily，2026-10-08）——同一问答的简述（媒体）。https://www.binance.com/en/square/post/10-08-2026-hyperliquid-founder-jeff-yan-says-he-would-study-options-if-he-started-over-375035629839445 （2026-10-16）
6. Gate News（Bloomingbit / GateNews，2026-10-08）——同一问答的转述（媒体）。https://www.gate.com/news/detail/hyperliquid-founder-jeff-yan-says-he-would-research-options-if-starting-24822479 （2026-10-16）
7. KuCoin 转载 CryptoBriefing（2026-10-07）“Hyperliquid to Add Options to Platform”——与 [2][4] 矛盾的报道（媒体，判定为误读）。https://www.kucoin.com/news/flash/hyperliquid-to-add-options-to-platform-expanding-derivatives-offerings （2026-10-16）
8. **PRIMARY** Hyperliquid Docs HIP-4: Outcome markets——定义、bounded options-like、合并订单簿、split / merge / negate。https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets （2026-10-16）
9. **PRIMARY** Hyperliquid Docs Contract specifications（Recurring outcomes）——priceBinary / priceBucket 规格与插值结算规则。https://hyperliquid.gitbook.io/hyperliquid-docs/trading/contract-specifications.md （2026-10-16）
10. **PRIMARY** Hyperliquid Docs Portfolio margin——统一保证金、LTV、清算公式、限额。https://hyperliquid.gitbook.io/hyperliquid-docs/trading/portfolio-margin （2026-10-16）
11. **PRIMARY** Hyperliquid 公告“Outcome (HIP-4) fees will be enabled”（2026-08-14）——收费规则。https://app.hyperliquid.xyz/announcement/tm2eqyd9aa （2026-10-16）
12. **PRIMARY** Hyperliquid 公告“Portfolio margin enters beta with increased limits”（2026-06-25）——PM 上线已六个月，可交易 perps、spot、outcome。https://app.hyperliquid.xyz/announcement/bbusml4dh5r （2026-10-16）
13. **PRIMARY** hyperliquid.xyz 文章 Portfolio margin（Product Update Dec 2025）——PM 上线时间。https://hyperliquid.xyz/article/portfolio-margin （2026-10-16）
14. Bitcoin.com News（2026-05-02）——HIP-4 于 2026-05-02 主网上线、2026-02-02 宣布；HIP-3 于 2025-10-13 主网（媒体）。https://news.bitcoin.com/hyperliquid-launches-hip-4-and-targets-polymarket-with-zero-fee-outcome-markets （2026-10-16）
15. hyperliquidguide.com HIP-4 指南 / 无许可部署页——第三方整理的时间线；首批第三方 HIP-4 市场基于 trade.xyz 指数 perps（第三方）。https://hyperliquidguide.com/ecosystem/hip-4-outcome-trading ；https://hyperliquidguide.com/ecosystem/hip-4-permissionless-deployment （2026-10-16）
16. **PRIMARY** Hyperliquid Docs HIP-3: Builder-deployed perpetuals——部署者职责、500k HYPE 质押。https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-3-builder-deployed-perpetuals.md （2026-10-16）
17. **PRIMARY（数据）** DefiLlama API options overview（dailyNotionalVolume）——各协议 24h / 7d / 30d / 1y 名义成交与链分布。https://api.llama.fi/overview/options?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyNotionalVolume （2026-10-16）
18. **PRIMARY（数据）** DefiLlama API options overview（dailyPremiumVolume）——各协议权利金。https://api.llama.fi/overview/options?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyPremiumVolume （2026-10-16）
19. **PRIMARY** Derive Insights“Derive V3 is live”（2026-10-07）——ZK 交易所替换 Derive Chain，在 Ethereum 上验证证明；可借 ETH / WBTC / HYPE；risk universe 隔离。https://insights.derive.xyz/v3 （2026-10-16）
20. **PRIMARY** Derive Docs v3 DevEx improvements——交易所与 Derive Chain 合并为单一 ZK 应用并结算到 Ethereum L1；EOA / 多签直接持有账户。https://docs.derive.xyz/migrating/v3-improvements.md （2026-10-16）
21. **PRIMARY** Derive Docs RFQ Trading——taker / maker 流程、方法名、EIP-712 签名、原子执行；以及 llms.txt 中的 MMP、Price Banding、Cancel on Disconnect。https://docs.derive.xyz/trading/rfq.md ；https://docs.derive.xyz/llms.txt （2026-10-16）
22. **PRIMARY** Derive Docs Managers & Risk Universes——SM / PM2；跨 universe 的交易被拒；损失只在 universe 内社会化。https://docs.derive.xyz/trading/managers-and-risk-universes.md （2026-10-16）
23. **PRIMARY** Derive Docs Instrument Names——期权默认 08:00 UTC 结算，美股标的为 4pm NY；quote 必须等于 universe 的 settlement (cash) currency。https://docs.derive.xyz/trading/instrument-names.md （2026-10-16）
24. **PRIMARY** Derive Insights“XAUT Options Are Live on Derive”（2026-07-24）——Derive 首个 RWA 期权。https://insights.derive.xyz/xaut-options-are-live-on-derive （2026-10-16）
25. Alea Research“Twice the Exposure, a Quarter Cheaper”（Q3 2026；披露维护 Derive Data Room）——Derive Q3 数据、链上权利金份额、CEX OI 份额（二手研究）。https://alearesearch.io/newsletters/twice-the-exposure-a-quarter-cheaper （2026-10-16）
26. **PRIMARY** Derive blog“Lyra is now Derive”（2024-08-28）——更名。https://blog.derive.xyz/derive （2026-10-16）
27. **PRIMARY** Derive Help Center LYRA→DRV Migration——DRV 于 2025-01-15 上线，按 1:1 迁移。https://help.derive.xyz/en/articles/9219427-lyra-to-drv-migration （2026-10-16）
28. **PRIMARY** Derive / Lyra blog“Introducing Lyra: Crypto Options”（2021）——前代 AMM 的问题（静态波动率导致 LP 亏损、无对冲、流动性低）以及 L2 + Synthetix 对冲的方案。https://blog.derive.xyz/introducing_lyra （2026-10-16）
29. **PRIMARY（学术）** Andolfatto & Schönleber,“Decentralized and Centralized Options Trading”, SSRN 4822783（2024-05，2026-07 修订）——DEX 约占期权成交 1%；链上 IV 高于 CEX。https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4822783 （2026-10-16）
30. **PRIMARY** Opyn“ETH Put Exploit Post Mortem”（2020-08-11）——漏洞机制与补偿。https://medium.com/opyn/opyn-eth-put-exploit-post-mortem-1a009e3347a8 （2026-10-16）
31. The Block（2020-08-04）——被盗 371,260 USDC、白帽追回 439,170 USDC（媒体，引官方）。https://www.theblock.co/news/defi/2020-08-04-opyn-uniswap-liquidity-exploit-eth-73935 （2026-10-16）
32. **PRIMARY** GitHub opynfinance/squeeth-monorepo release“Mainnet launch, Jan 18, 2022”；CoinDesk 2022-01-18 报道。https://github.com/opynfinance/squeeth-monorepo ；https://www.coindesk.com/markets/2022/01/18/opyns-new-squeeth-raises-ether-trading-to-the-power-of-two （2026-10-16）
33. **PRIMARY** squeeth.opyn.co 关停公告——2024-11-04 16:00 UTC 关停。https://squeeth.opyn.co/squeeth （2026-10-16）
34. **PRIMARY** Ribbon 治理 RGP-33: Merge Ribbon Finance into Aevo——合并方案，RBN 按 1:1 迁移到 AEVO。https://gov.ribbon.finance/t/rgp-33-merge-ribbon-finance-into-aevo/709 （2026-10-16）
35. Blockworks（2023-07-26）——RGP-33 通过；Ribbon“struggled to scale”；Aevo 是 OP Stack L2、链下订单簿，2023-06 主网（媒体）。https://blockworks.com/news/ribbon-finance-governance-approves-aevo-brand-merger （2026-10-16）
36. The Block（2025-12-14）——Ribbon 遗留 DOV 被盗 ~$2.7M，原因是 12-06 预言机升级（媒体）。https://www.theblock.co/post/382461/aevos-legacy-ribbon-dov-vaults-exploited-for-2-7-million-following-oracle-upgrade （2026-10-16）
37. **PRIMARY（应用 UI）** Ribbon app vault 页——T-WBTC-C 累计收益 −21.32%、T-sAVAX-C −48.22%（快照时间未知）。https://app.ribbon.finance/v2/theta-vault/T-WBTC-C ；https://app.ribbon.finance/v2/theta-vault/T-sAVAX-C （2026-10-16）
38. CoinDesk（2021-09-30）——Ribbon 于 2021-04 上线，通过 Opyn / Airswap 每周卖 call（媒体）。https://www.coindesk.com/markets/2021/09/30/move-over-carry-trade-these-retail-friendly-defi-options-strategies-yield-12-30 （2026-10-16）
39. **PRIMARY** Hegic v1 站点（DAI 池全额锁定、IV 参数化定价）；Albaron Ventures Hegic 报告（二手，2021：LP 已实现 PnL 为负）。https://v1.hegic.co/ ；https://albaronventures.com/hegic-analysis-report （2026-10-16）
40. **PRIMARY** Stryke blog“SYK is Here!”（DPX / rDPX 迁移到 SYK）；web3.new 协议卡（二手：2024-02 更名，SSOV 落日）。https://blog.stryke.xyz/articles/syk-is-here ；https://www.web3.new/protocols/dopex （2026-10-16）
41. **PRIMARY** yAudit Dopex rDPX v2 Review（2023-10）——机制复杂，在极端行情下有风险。https://reports.yaudit.dev/pdf/2023-10-Dopex-rDPX-v2-yAudit-Report.pdf （2026-10-16）
42. **PRIMARY** Panoptic“Panoptic Launches on Ethereum”（2024-12-18）。https://panoptic.xyz/blog/panoptic-launch （2026-10-16）
43. **PRIMARY** Premia / Kyan blog“From Premia to Kyan”（2025-06-06）。https://blog.premia.blue/p/from-premia-to-kyan （2026-10-16）
44. **PRIMARY** Paradex Docs Dated Options overview——欧式、USDC 现金结算、08:00 UTC、30 分钟 TWAP。https://docs.paradex.trade/trading/dated-options/overview （2026-10-16）
45. **PRIMARY** Paradex Docs Roadmap——2026-04 Dated Options 公测；PM 账户；规划中的 Paradigm RFQ。https://docs.paradex.trade/docs/getting-started/roadmap （2026-10-16）
46. Crypto Briefing（2026-09-19）——Paradex 接入 Paradigm RFQ 后期权 OI 升至 $202M（媒体）。https://cryptobriefing.com/paradex-options-oi-surge-rfq-launch/ （2026-10-16）
47. **PRIMARY** Thetanuts Docs（V4 overview、Executing Trades、RFQ Lifecycle、Thetanuts V4）——OptionBook 与 RFQ Factory 流程、Order 结构、费用、做市商定价。https://docs.thetanuts.finance/for-builders/overview ；https://docs.thetanuts.finance/for-builders/executing-trades.md ；https://docs.thetanuts.finance/sdk/rfq-factory/lifecycle.md ；https://docs.thetanuts.finance/thetanuts-v4.md （2026-10-16）
48. **PRIMARY** Rysk Docs（Solution: Rysk V12；Makers RFQ；Problem）——RFQ、实物交割、全额抵押、HyperEVM、2 秒窗口、费用；DOV 失败原因。https://docs.rysk.finance/getting-started/solution-rysk-v12 ；https://docs.rysk.finance/getting-started/protocol-and-product/makers-how-to-integrate-in-the-rfq.md ；https://docs.rysk.finance/getting-started/problem.md （2026-10-16）
49. **PRIMARY** Aevo Docs Portfolio Margin——15 情景 + floor margin，ETH 初始参数 ±20% spot、IV +50% / −25%。https://docs.aevo.xyz/aevo-products/aevo-exchange/trading-on-aevo/options-specifications/portfolio-margin （2026-10-16）
50. **PRIMARY** SOFA.org Docs（中文）——做市商报价、双方资产锁入 vault、ERC-1155 头寸代币。https://docs.sofa.org/zh/protocols/ （2026-10-16）
51. **PRIMARY** Ithaca Docs Pre-Match Processing——FBA、RSBB、MILP、Portfolio Dominance。https://docs.ithacaprotocol.io/docs/architecture/pre-match-processing （2026-10-16）
52. **PRIMARY** Paradigm“Everlasting Options”——永续期权与 funding 定价。https://www.paradigm.xyz/writing/everlasting-options （2026-10-16）
53. **PRIMARY** Coinbase blog“Coinbase to Acquire Deribit”（2025-05-08）——约 $2.9B、OI 约 $30B。https://www.coinbase.com/en-pt/blog/coinbase-to-acquire-deribit-becoming-the-most-comprehensive-global-crypto-derivatives-platform （2026-10-16）
54. **PRIMARY** Coinbase IR“Deribit Joins Coinbase”（2025-08-14）——收购完成；7 月成交 >$185B；OI 约 $60B；2024 年 >$1T。https://investor.coinbase.com/news/news-details/2025/Deribit-Joins-Coinbase-Unlocking-the-Future-of-Global-Crypto-Derivatives （2026-10-16）
55. **PRIMARY** Coinbase Market Data Derivatives——2026-10-15 Deribit 全品种 OI $38.48B、24h $12.92B。https://www.coinbase.com/market-data/derivatives （2026-10-16）
56. **PRIMARY** Deribit Statistics Options（BTC / ETH）——OI 名义约 $31.2B / $3.68B（快照时刻未标）。https://www.deribit.com/statistics/BTC/metrics/options?index=BTC ；https://www.deribit.com/statistics/ETH/metrics/options （2026-10-16）
57. **PRIMARY** CME Crypto Catch-Up Q3 2026——加密 F&O ADV 19.6 万张、总名义 $469.5B（期权未单列）。https://www.cmegroup.com/newsletters/quarterly-cryptocurrencies-report/2026-q3-cryptocurrency-highlights.html （2026-10-16）
58. Coinspeaker 经 Bitget News（2025-10-15）——Typus 被盗 $3.44M，未审计的 TLP 合约与预言机缺权限检查，DOV 未受影响（媒体，引官方 post-mortem）。https://www.bitget.com/news/detail/12560605019266 （2026-10-16）
59. **PRIMARY（应用 UI）** Zeta Markets 前端——“Trading on Zeta Markets has been halted”。https://dex.zeta.markets/trade/SOL-PERP （2026-10-16）
60. CoinDesk（2026-10-15，引 Bloomberg 访谈）——Jeff Yan 主张监管落在 deployer 层（媒体，背景）。https://www.coindesk.com/policy/2026/10/15/hyperliquid-founder-wants-u-s-oversight-of-trading-platforms-not-his-blockchain （2026-10-16）

---

## 命令与输出

> 环境没有 bash，用 `fetch_content` 的 raw 模式代替 curl。

1. `fetch_content(mode=raw, url="https://api.llama.fi/overview/options?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyNotionalVolume")`
   关键输出：`total24h=230448646`, `total7d=882888806.8`, `total30d=5074065817.93`, `total1y=21042885743.67`, `totalAllTime=81382449467.67`；
   - Derive Options（lyra-v2，Derive Chain）：`total30d=3361632714`, `total1y=16745831691`, `total7d=null`, `total7DaysAgo=0`（说明 V2 已停止产生新数据）
   - Derive V3 Options：`total30d=884078883`, `total7d=769514536`, `total24h=220721836`, `totalAllTime=1104800719`
   - Paradex Options `total30d=484049093`；Rysk V12 `145690276`（hyperliquid）；CallPut `97801450`（base）；Aevo Options `66600022`；Panoptic V2 `28684519`；Hegic `1520788.49`；Thetanuts `482676`；Typus DOV `16361`；Stryke CLAMM `0`（chains 含 Mantle）；Kyan Blue Options `0`；Hypersurface `1835`；Racks `0`。
   - `allChains` 中含 "Mantle"（来自 Stryke CLAMM 的 chains 列表）。
2. `fetch_content(mode=raw, url="…dataType=dailyPremiumVolume")`
   关键输出：`total30d=88195379.12`, `total1y=542856136.15`；Derive Options `total30d=57592327`, `total1y=449173246`；Derive V3 `total30d=22831205`；Paradex `4074827`；Rysk V12 `1534719`；Aevo `1495971`；CallPut `345667`；SOFA.org `221159`；Ithaca `1999`；Panoptic V2 ≈ `21442`。
3. 手算（需要用 python 复核）：
   - Derive 30d 名义 = 3,361,632,714 + 884,078,883 = 4,245,711,597；÷ 5,074,065,817.93 = 0.8367 → 83.7%
   - V2 份额 3,361,632,714 / 5,074,065,818 = 0.6625；V3 份额 0.1742；Paradex 0.0954；Rysk 0.0287；CallPut 0.0193；Aevo 0.0131
   - Derive 30d 权利金 = 57,592,327 + 22,831,205 = 80,423,532；÷ 88,195,379 = 0.9119 → 91.2%；Paradex 0.0462；Rysk 0.0174；Aevo 0.0170
   - Derive 1y 名义 = 16,745,831,691 + 884,078,883 = 17,629,910,574；÷ 21,042,885,744 = 0.8378 → 83.8%
   - Derive 30d 权利金 / 名义 = 80.42 / 4,245.7 = 1.89%；全市场 88.20 / 5,074.1 = 1.74%
   - Alea OI：Derive 3.1% × $44.7B ≈ $1.39B；Deribit 78.2% × $44.7B ≈ $34.96B；34.96 / 1.39 ≈ 25.2（Alea 写的是 25.3，差异来自四舍五入）
4. YouTube 字幕：`fetch_content(url="https://www.youtube.com/watch?v=e0xi_NeVk4w")` → 报错“Could not extract YouTube video content”（需要 Google 登录或 GEMINI_API_KEY）。
5. `fetch_content(url="https://www.derive.xyz/stats")` → JS 渲染，失败。

---

## 开放问题

1. 11:46–18:19 段的逐字稿（需要可用的 YouTube 字幕或 Podscan 账号）：Jeff 是否谈到 Hyperliquid Labs 自己会不会做香草期权？builder 问答的准确时间戳？
2. HIP-4 outcome 头寸在 portfolio margin 中的保证金处理（是否计入 portfolio_liquidation_value？），docs 没写。
3. Derive V3 期权是现金结算还是实物交割、结算价规则（V3 docs 只看了命名页）；美股标的期权是否已上线（docs 预留了 4pm NY 结算）。
4. Deribit 近 30 天期权成交额（需要 Deribit API 或 The Block 数据）；CME 加密期权单独的 ADV。
5. 链上期权买卖方向结构（零售净卖方的假设）没有数据。
6. DOV 拍卖收益被做市商拿走的一手量化（例如 Ribbon 拍卖成交价对比 Deribit mid），未找到。
7. Zeta 期权的历史、Drift 是否做过期权、Lyra v1 主网的确切月份、Dopex SSOV 的首发日期，都缺一手来源。
8. CallPut（Base，30 天名义 $97.8M）的架构没读 docs。

---

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| E1 | Empire 节目《Jeff Yan On Hyperliquid's Plan To Bring All Finance Onchain》于 2026-10-07 发布，嘉宾是 Hyperliquid Labs CEO Jeff Yan | [1] 节目页；[3] YouTube 30:36 | observed | |
| E2 | 节目章节 11:46 为“Better Trading Through Fees And Options” | [1] TIMESTAMPS | observed | |
| E3 | 节目约 04:30，Jeff 说 perps 并不比期权好，两者“very complementary”、用途不同 | [2] 转写 00:04:30 段（机器转写） | observed | |
| E4 | Jeff 称 HIP-4 是“options or option-like payout curves”可以搭建并扩展到对用户有用的原语，并希望这是“yet to unfold”的故事 | [2] 00:04:30–00:05:07 | observed | |
| E5 | 被问“不做基础设施会做什么”时，Jeff 称此刻可能研究期权，因为很多人想交易期权 | [4][5][6] 媒体转述 | observed | |
| E6 | Jeff 称 HIP-4 是构建期权协议的清晰路径：可继承现货、订单簿、组合保证金，并用 perps 对冲期权 delta | [4] KuCoin（火星财经）；[5] Binance（Odaily），均为媒体转述 | observed | |
| E7 | Jeff 认为加密领域尚无期权 / 凸性收益产品达到“escape velocity”，而 TradFi 已经做到 | [4] 媒体转述 | observed | |
| E8 | E5–E7 的问答位于 11:46–18:19 章节内 | 由 E2 推测，无时间戳证据 | speculative | |
| E9 | “Hyperliquid 将在自身平台上线期权”的报道与访谈内容不符，不能视为官方计划 | [7] 对比 [2][4][5]；HIPs 目录 [8] 无期权 HIP | speculative | |
| E10 | HIP-4 outcomes 是全额抵押、在固定区间结算的合约，官方称适用于预测市场和“bounded options-like instruments”，无杠杆、无清算 | [8] Overview | observed | |
| E11 | HIP-4 首个市场是每日 06:00 UTC 按 HyperCore BTC mark price 结算的循环二元合约 | [8]；[9] Recurring outcomes | observed | |
| E12 | 循环二元合约以结算时刻前后两次 mark 更新的线性插值与 targetPrice 比较来决定 YES / NO | [9] Binary 段 | observed | |
| E13 | HIP-4 的 Yes 与 No 订单簿合并：在 p 买 Yes 等价于在 1−p 卖 No | [8] Mechanics | observed | |
| E14 | HIP-4 于 2026-02-02 宣布、2026-05-02 主网上线 | [14]（媒体）；[9] 示例 expiry 20260503 | observed | |
| E15 | 2026-08-14 起 HIP-4 只在平仓 / 结算时收费，开仓免费，平均费率为现货的一半；docs 页仍写“fees zero”，已过时 | [11] 公告；[8] 末段 | observed | |
| E16 | Hyperliquid 组合保证金于 2025-12 上线，2026-06-25 进入 beta 并提高限额，可用于 perps、spot、outcome | [13]；[12] | observed | |
| E17 | Hyperliquid PM 中 HYPE 的 LTV 为 0.65、BTC 为 0.5；portfolio_margin_ratio > 0.95 时可被清算 | [10] LTV / Liquidations 段 | observed | |
| E18 | 截至 2026-10-16，Hyperliquid 官方 docs 与公告中没有原生香草期权产品或 HIP | [8] HIPs 目录（HIP-1~4）；[11][12] | inferred | |
| E19 | HIP-3 由部署者负责市场定义、预言机与结算，主网质押要求 500k HYPE | [16] Spec 1 | observed | |
| E20 | Rysk V12 部署在 HyperEVM（Hyperliquid L1），近 30 天名义成交 $145.7M | [17] Rysk V12 breakdown30d hyperliquid；[48] hyperevmscan 地址 | observed | |
| E21 | DefiLlama 链上期权近 30 天名义成交约 $5.07B，近 1 年约 $21.0B | [17] total30d=5074065817.93、total1y=21042885743.67 | observed | |
| E22 | DefiLlama 链上期权近 30 天权利金约 $88.2M，近 1 年约 $543M | [18] total30d=88195379.12、total1y=542856136.15 | observed | |
| E23 | Derive（V2 + V3）占近 30 天链上期权名义成交约 83.7% | 由 [17] 手算：(3361632714+884078883)/5074065818，见“命令与输出” | inferred | |
| E24 | Derive（V2 + V3）占近 30 天链上期权权利金约 91.2% | 由 [18] 手算：80423532/88195379 | inferred | |
| E25 | Paradex 期权近 30 天名义 $484M（约 9.5%），是第二大链上期权场所 | [17] Paradex Options total30d | observed | |
| E26 | Stryke CLAMM 与 Kyan Blue Options 近 30 天名义成交为 0；Ithaca 近 30 天权利金只有 $1,999 | [17][18] | observed | |
| E27 | Derive Q3 2026 期权名义 $7.45B，环比 +89.6%，链上权利金份额 90.4% | [25] Alea（二手，披露维护 Derive Data Room） | observed | |
| E28 | Derive Q3 成交笔数仅 +6.2%，平均单笔从 $47K 增至 $84K，增长主要来自大单 | [25] | observed | |
| E29 | 2026-10-01，Derive 期权 OI 约占 Deribit、OKX、Bybit、Binance、Derive 合计 $44.7B 的 3.1%，Deribit 约 78.2%，是 Derive 的 25.3 倍 | [25]（二手，venue API） | observed | |
| E30 | Deribit BTC 期权 OI 名义约 $31.2B、ETH 约 $3.7B | [56] 统计页（快照时刻未标） | observed | |
| E31 | Coinbase 于 2025-05-08 宣布以约 $2.9B（$700M 现金 + 1,100 万股）收购 Deribit，2025-08-14 完成 | [53]；[54] | observed | |
| E32 | 收购完成时 Deribit OI 约 $60B，2025 年 7 月成交 >$185B，2024 年成交 >$1T | [54] | observed | |
| E33 | CME 2026 Q3 加密期货 + 期权 ADV 19.6 万张、总名义 $469.5B，官方报告未单列期权 | [57] 表格 | observed | |
| E34 | 学术研究估计 DEX 约占期权成交量 1%，链上（Lyra V2）IV 系统性高于 Deribit | [29] SSRN 摘要与 AEA 海报 | observed | |
| E35 | Opyn 2020-08-04 ETH put 遭“double exercise”攻击，被盗 371,260 USDC，卖方获全额补偿 | [30] post-mortem；[31] | observed | |
| E36 | Squeeth 于 2022-01-18 主网上线，2024-11-04 16:00 UTC 关停 | [32] GitHub release；[33] | observed | |
| E37 | Ribbon（DOV）于 2021-04 上线；RGP-33 于 2023-07-25 通过并入 Aevo，RBN 按 1:1 迁移到 AEVO | [38]（媒体）；[34]；[35] | observed | |
| E38 | Ribbon 遗留 DOV 于 2025-12-12 因 12-06 预言机升级（任何人可为新资产设价）被盗约 $2.7M，随后下线 | [36]（媒体） | observed | |
| E39 | Ribbon 部分 vault 前端显示累计收益为负（T-WBTC-C −21.32%，T-sAVAX-C −48.22%） | [37] app 页面（快照时间未知） | observed | |
| E40 | DOV 收益的相当部分被拍卖中的做市商以低于公允价拿走 | 无一手量化证据，仅为行业常见说法 | speculative | |
| E41 | Rysk 官方认为 DOV 证明了需求，但因池化风险与僵化设计无法扩张 | [48] Problem 页 | observed | |
| E42 | Hegic LP 自上线以来已实现 PnL 一直为负，依赖流动性挖矿补贴 | [39] Albaron 报告（二手研究，2021） | observed | |
| E43 | Lyra 自述前代期权 AMM 因静态波动率与不精确定价导致 LP 持续亏损，且缺乏原生对冲 | [28] Introducing Lyra | observed | |
| E44 | Lyra 于 2024-08-28 更名 Derive，DRV 于 2025-01-15 上线（LYRA 按 1:1 迁移） | [26]；[27] | observed | |
| E45 | Derive V3 于 2026-10-07 上线，用 ZK 交易所替换 Derive Chain，在 Ethereum L1 验证证明与结算 | [19]；[20] | observed | |
| E46 | Derive V3 提供 Standard（SM）与 Portfolio（PM2，情景网格）两种保证金管理器，并按 risk universe 隔离损失 | [22] | observed | |
| E47 | Derive V3 期权默认 08:00 UTC 结算，美股标的可设为纽约时间下午 4 点 | [23] Option 段 | observed | |
| E48 | Derive 于 2026-07-24 上线 XAUT 期权，为其首个 RWA 期权市场 | [24]（Alea [25] 写为 7-23） | observed | |
| E49 | Derive V3 期权为现金结算 | 由 [23]“quote 币种 = universe 的 settlement (cash) currency”推出 | inferred | |
| E50 | Paradex Dated Options 为欧式、USDC 现金结算，08:00 UTC 按 30 分钟现货预言机 TWAP 结算，于 2026-04 公测 | [44]；[45] | observed | |
| E51 | Paradex 于 2026-09 中接入 Paradigm RFQ 后期权 OI 升至 $202M | [46]（媒体） | observed | |
| E52 | Rysk V12 为欧式、实物交割、逐笔全额抵押，RFQ 有 2 秒聚合窗口，到期日与 Deribit 对齐（周五 08:00 UTC） | [48] Makers RFQ 页 | observed | |
| E53 | Thetanuts V4 OptionBook 在 Base 上：做市商链下签名订单，taker 链上调用 `fillOrder(order, signature, referrer)`，每笔成交部署新的期权合约并锁定抵押 | [47] Overview / Executing Trades | observed | |
| E54 | Thetanuts RFQ Factory 用 EIP-712 签名加 ECDH 加密的密封报价；费用为名义的 0.06%，上限为权利金的 12.5% | [47] RFQ Lifecycle | observed | |
| E55 | Thetanuts 文档中做市商报价 = 交易所 bid/ask ± 抵押资金成本（APR：cbBTC 1%、WETH 4%、USDC 7%） | [47] Offer Calculation | observed | |
| E56 | Derive RFQ 中 send_rfq 是未签名 intent；maker 的 quote 与 taker 的 execute 都是 EIP-712 签名动作，整包原子结算 | [21] Signed actions / Taker flow | observed | |
| E57 | Aevo 组合保证金 = 15 个现货 / IV 情景的 scenario margin + floor margin，ETH 初始参数为 ±20% spot、IV +50% / −25% | [49] | observed | |
| E58 | Panoptic 于 2024-12-18 在 Ethereum 上线，基于 Uniswap LP 提供永续期权 | [42] | observed | |
| E59 | Premia 于 2025-06 更名 Kyan（期权 + perps + 组合保证金） | [43] | observed | |
| E60 | Typus（Sui）于 2025-10-15 因 TLP 合约预言机缺权限检查被盗约 $3.44M，DOV 未受影响 | [58]（媒体，引官方 post-mortem） | observed | |
| E61 | Ithaca 采用频繁批量拍卖加 RSBB 分解和 MILP 撮合 | [51] | observed | |
| E62 | 链上期权难做的核心是做市商的对冲与资本成本：全额抵押把资金成本直接计入报价，而 perps 对冲加组合保证金是降低成本的主路径 | 由 E6、E46、E55、E57 推出 | inferred | |
| E63 | 结算价 / 预言机路径是链上期权最常出事的环节 | 由 E35、E38、E60 推出 | inferred | |
| E64 | 当前头部场所都是“链下撮合 + 链上结算”，而不是链上撮合 | 由 E45（Derive 亚毫秒撮合 + ZK）、[35]（Aevo 链下订单簿）、[44]（Paradex）推出 | inferred | |
| E65 | Stryke CLAMM 在 DefiLlama 中列有 Mantle 链部署，但近 30 天成交为 0 | [17] Stryke CLAMM chains / breakdown30d | observed | |

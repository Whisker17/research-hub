# Lane：主要产品复盘与结构性缺陷（notes-products）

研究问题：(Q1) pump.fun / four.meme / Base 系（Clanker、Zora、Flaunch）/ Robinhood Chain 系（Pons、LONG、PAIR）/ Mantle 本地（Funny Money、Printr）按统一维度怎么做、改了什么、踩了什么坑、2026-10 现状如何；(Q2) 跨产品能抽出哪些结构性缺陷与设计公理；(Q3) 一条可画图的演进时间线。
一句话答案：三条技术路线（虚拟储备曲线→外部迁移；单边 LP 无曲线；同 quote 曲线→池内毕业）逐步消掉了"迁移"这一攻击面和夹子窗口，创作者分成从"一次性 0.5 SOL"变成"按成交量永续分成"；但每一代都没解决单币价值衰减、补贴/分发退出后的流量崩塌、多 quote 碎片化。到 2026-10，Base 社交发币路线已被官方承认失败，Robinhood Chain 的 meme 热潮在 gas 补贴 2026-09-29 到期后明显降温，Mantle 上的 Funny Money 与 Printr 均已停止运营。
说明：资料里多处数字与事件已被一手来源推翻或修正，见各节"不确定之处"与台账 P14、P23、P24、P50、P53。日期一律为 UTC 日历日；网页访问日期均为 2026-10-05。

---

## Q1 产品逐个拆解

### 1.1 pump.fun（Solana）+ PumpSwap

**答案**：虚拟储备恒定乘积曲线（30 SOL / 1.073B 虚拟储备，曲线可售 793.1M）+ 打满约 85 SOL 毕业。2025-03-20 起毕业目的地从 Raydium 换成自家 PumpSwap，迁移费 6 SOL 降到 0；2025-05-13 起创作者能分到每笔交易费，2025-09 Project Ascend 改成按市值分档的动态费。截至 2026-10 官方费率：曲线阶段 1.25%（创作者 0.30% / 协议 0.95%），毕业费 0.015 SOL；2026-05-21 起支持 USDC 作 quote。

**依据**
- 曲线参数：Global 账户 `initial_virtual_token_reserves=1,073,000,000(×1e6)`、`initial_virtual_sol_reserves=30 SOL`、`initial_real_token_reserves=793,100,000(×1e6)`、`token_total_supply=1e9`，当时 `fee_basis_points=100`（1%）[1]。毕业约 85 SOL 是从这些参数推出来的（30·1073/(1073−793.1)−30≈85.0），官方文档只写"达到毕业阈值"[3]。
- 创作者激励的演进：2024-08-09 起建币免费（建币费转给第一个买家），代币完成曲线时奖励创作者 0.5 SOL，迁移费 1.5 SOL [4]；2025-03-20 推出 PumpSwap，迁移费从 6 SOL 降到 0，PumpSwap 交易费 0.25%（LP 0.20% / 协议 0.05%）[6]；创作者费 2025-05-13 起为 0.05%，Project Ascend（2025-09）后为 0.30% [7][2]。
- 当前费率（官方 fees 页）：建币 0；毕业到 PumpSwap 收 0.015 SOL；曲线阶段创作者 0.300% + 协议 0.95% = 1.25%；规范池费率按市值分档；非规范池 0.3% [2]。官方说毕业"原子迁移、自动、不可逆"，迁移后的池"归协议所有"[3]。
- 安全事件：2024-05-16 一名前员工利用掌握的 withdraw authority 权限，借闪电贷把曲线打满后取走流动性，损失约 12.3K SOL（约 $1.9M，当时曲线总流动性约 $45M）。根因是内部权限/私钥失控，合约本身没有漏洞 [5]。
- 协议回购：DefiLlama 的口径注明 2025-07-14 起协议收入 100% 进入 PUMP 回购，2026-04-28 起改为 50% [7]。

**不确定之处**：上线日期（资料写 2024-01）本轮没找到一手来源；PumpSwap 当前分档费率表官方页面是图片，没有抓到文本；资料说"2026-05-26 pump.fun 扩展到 Base"，没有核实。

### 1.2 four.meme（BSC）

**答案**：和 pump.fun 同构的虚拟储备曲线，但支持多种 quote，毕业阈值按约 $1.2 万等值校准，毕业后迁到 PancakeSwap。两次被黑都发生在 **2025 年**：2025-02-11 约 $183K，2025-03-18 约 200 BNB。根因都是"迁移目标池可以被攻击者预先创建或污染"，不是资料 outputs/03 说的"Helper3 重入、违反 CEI、2025-09 与 2026 初"。2025-03-31 官方改为迁移到 PancakeSwap V2 并销毁 LP，新币地址统一以 4444 结尾。

**依据**
- 事故 1（2025-02-11，约 $183K）：迁移时如果目标 V3 池已经存在，合约不校验池子的 `sqrtPriceX96` 就直接使用。攻击者预先建了一个价格约为正确值 3.68e14 倍的假池，four.meme 把 200,000,000 枚代币和约 24 WBNB 注入后，攻击者用很少的代币把 WBNB 全部取走 [8]。
- 事故 2（2025-03-18）：攻击者在内盘阶段通过函数 `0x7f79f6df` 买入少量代币，转到一个地址可以预先算出、但尚未创建的 PancakeSwap Pair，绕过 `MODE_TRANSFER_RESTRICTED`，然后自建 pair 并以错误价格加流动性，把池子抽干。官方暂停 launch 功能并承诺赔偿 [9]。
- 架构调整（2025-03-31 官方公告）：新币地址以 4444 结尾；毕业后自动在 PancakeSwap **V2** 加流动性，LP 代币销毁 [10]。
- 2026-09 的参数与数据（链上 BNB 池阈值 18 BNB、曲线 80% 可售、毕业时入池 98%、日发币约 13.7K、毕业率约 0.07%、DefiLlama 24h 费用 $9,578）都来自资料作者的实测 [U1][U2]，本轮没有复核。

**不确定之处**：资料说毕业时"隐性 2% seeding fee"、约 163M 枚未售代币去向不明，属于资料自测，没有官方条款；阈值从 24 BNB 改为 18 BNB 的生效日期，没有找到官方公告。

### 1.3 Clanker（Base 等）

**答案**：没有 bonding curve。100B 固定供应作为单边集中流动性一次性放进 Uniswap v3/v4 池（v4 起），LP NFT 交给一个没有 withdraw 函数的 locker 永久锁定。协议费 = 创作者 LP 费 × 20%，加收在创作者费之上（例如 1% + 0.2% = 1.2%）。防狙击靠可插拔 MEV 模块：v4.0 的 2 区块延迟和狙击拍卖，v4.1 的抛物线衰减费（起始最高 80%，推荐配置 30 秒内降到 5%）。所有权两次变更：2025-10 被 Farcaster（Merkle）收购，2026-01-21 随 Farcaster 一起被 Neynar 收购运营。

**依据**
- 费用：官方文档写"Clanker fee is fixed at 20% of LP fees … in addition to creator LP fees"，附 1%/0.2%/1.2% 示例表；持有者自建的 LP 或新池不给创作者分成 [11]。DefiLlama 口径相同，并单列"CLANKER 回购"作为 Holders Revenue [34]。
- 防狙击：`ClankerMevDescendingFees` 的起始 LP 费最高 80%，衰减时间最长 2 分钟，公式 `fee = endingFee + feeRange × (timeDecay/timeToDecay)²`，推荐 80%→5%/30s；默认起始市值 $40K，80% 费率下狙击者的等效入场市值为 $200K [12]。
- 所有权：Dan Romero 在 Farcaster 宣布"Clanker is joining Farcaster"，同时宣布协议费改为买入并持有 $CLANKER、烧掉 v0–v3.1 费用金库里的代币、约 7% 供应锁进单边 LP [13]；PANews 2025-10-28 报道称 2/3 协议收入用于回购 [13]。2026-01-21 Neynar 宣布收购 Farcaster 并运营 Clanker，Jack Dishman（@dish）和部分 Clanker 团队加入 Neynar，Neynar 否认"Clanker 关停"的传言 [14]。
- 数据：资料用 DefiLlama + clanker.world API 统计，单币手续费从 2024-12 的 $1,371 降到 2026-08 的 $53；2026-02 由 AI agent（Moltbook）带来第二波，当月 261,047 枚、手续费 $22.39M [U3]。本轮没有复核。

**不确定之处**：资料（benchmarks/base-ecosystem.md §1.6）把"Clanker 被 Farcaster/Neynar 收购"标为"很可能不实"，已过时，两次收购都有一手公告。outputs/03 说 Clanker 发 "Fee Key NFT"，与官方文档不符：Clanker 的分成通过 locker 的 `rewardBps` 槽位和 `rewardAdmin` 管理，文档里没有可转让 NFT 一说。真正可转让的收益权 NFT 是 Flaunch 的 Memestream。

### 1.4 Zora（content / creator / trend coins）

**答案**：没有曲线。每个币固定 1B 供应，直接进带自定义 hook 的 Uniswap v4 池，初始多曲线流动性由 Doppler 布置。三种币：Creator Coin（创作者拿 50%，5 年释放）、Content Coin（以该创作者的 Creator Coin 作 quote，创作者即时拿 10M）、Trend Coin（0.01% 费率，无创作者分配，手续费全归协议）。狙击税从 99% 起，10 秒线性衰减；20% 手续费锁成永久池深度；手续费经多跳兑换后以 ZORA 支付。2026 年 Zora 已扩展到 Solana（2026-02-17 推出 attention markets）。Base 官方 2026-07 承认 creator coins 路线失败。

**依据**：官方文档的四条机制写得很明确（99%→10s 狙击税、20% 费用转为永久流动性、多跳换成 ZORA 支付、Doppler 多曲线），Creator/Content/Trend 的分配与费率也在文档里 [15]。2026-02-09 Base App 下线 Creator Rewards 和 Farcaster 的 Talk feed，7 个月共发放约 $450K 给约 17K 名创作者，人均约 $26，最终发放日 2026-02-18 [17]。2026-07-15 Pollak 发帖："Farcaster, Zora, miniapps, and yes, creator coins—disintegrated completely … I was definitively wrong"，并把 Base App 交给 Cobie [18]。The Block 同日报道称 "Zora pivoted to Solana"；CoinDesk 与 The Block 2026-02-17/18 报道了 Zora 在 Solana 推出 attention markets [18][19]。

**不确定之处**：资料说 Pollak "辞职"，实际他只是不再负责 Base App，仍继续负责 Base 链 [18]；资料说 Creator Rewards 关停是因为"发出的币全部归零"，官方给出的理由是聚焦交易（"do less, better"）[17]。Zora 2026-08 的 "Custom Pairs" 和 2026-09 的 CEO 更换只见于 CMC AI 摘要，属低可信。

### 1.5 Flaunch（Base）

**答案**：同样没有连续曲线，采用"固定价格 Fair Launch 窗口（默认 30 分钟）→ 全区间 AMM"两段式，全程在 Uniswap v4。1% 交易费中，创作者份额在发币时定为 0–100%，之后不可改，创作者不拿的部分全部进入 Progressive Bid Wall（PBW）。PBW 每攒满 0.1 ETH 手续费，就在现价正下方挂一笔单边限价买单，价格上涨时跟着上移。创作者收益权铸成可转让的 ERC-721（Memestream）。

**依据**：官方文档"Whatever the dev doesn't take … goes to the PBW"、"A new PBW is created for every 0.1 ETH of trading fees … limit order immediately below spot"，Memestream 持有者可以关闭 PBW [16]。Fair Launch、Memestream、Game Mode 的细节见资料 [U3]（引用 docs.flaunch.gg 各页）。

**不确定之处**：手续费从峰值下降 99.97%（2025-01 $1.12M/月 → 2026-08 $283）只见于资料的 DefiLlama 拉取 [U3]；Game Mode "目前在 Robinhood Chain 上线"，本轮没有核实。

### 1.6 Robinhood Chain 系（Pons / LONG / PAIR）

链背景只点到（合规细节不展开）：2026-07-01 公开主网，Arbitrum Orbit L2，ETH 作 gas，目标 100ms 出块，同日上线 Stock Tokens（120+ 国家可用）[20]。Robinhood Wallet 的 gas 补贴随主网上线，为期 90 天；适用门槛最初是 >$5 的 swap，2026-08-08 降到 $0.5，到 **2026-09-29** 结束 [24]。

**Pons**
- 答案：V1（2026-07-13/14 上线）用单边 Uniswap V3 头寸，没有曲线；V2（2026-08 初上线）每次 launch 部署一条恒定乘积曲线，曲线**用未来 v4 池同一种 quote 资产**计价，所以毕业时"no router, no swap, and no price oracle"，直接铸造全区间 v4 头寸，放进没有出口的 locker；singleton hook 只在 quote 一侧收费，30% 协议 / 35% 创作者 / 35% 回购金库，回购的 meme 币 5 年线性解锁，不销毁 [21]。quote 可以是 ETH、USDG、cbBTC 或股票/ETF 代币 [32]。
- 依据：GitHub README（ponsdotdev/pons-labs，commit 44a3db9，2026-10-01）的 V1/V2 对比表和 V2 说明，原文"Buybacks … five-year linear vest instead of a burn"；毕业分两段且都无需许可（`graduate` + 可重试的 `createGraduatedPool`）[21]。
- 现状：官网 Explore 页显示累计发币 4,228,127，并挂着"Degraded performance … upgrading the backend"提示（访问 2026-10-05）[35]。二手报道称 2026-09-29 到 10-02 之间 Pons 日费从 $6.87M 降到 $1.48M（−78%），PONS 从高点下跌 58% [26]。
- 不确定之处：资料说 V2 的反狙击是"99% 起始税 / 15 秒衰减"（factory 常量），但 README 对比表里 V2 的 anti-snipe 写的是"Curve price impact + reserved pool allocation"，两者矛盾，需要读字节码确认。$PONS 用协议份额的 80% 做 TWAP 回购销毁只见于二手（WEEX），是团队政策，不在合约里。

**LONG（long.xyz）**
- 答案：强制以单只 Robinhood 股票代币作 quote，例如 Artificial Inu/NVDA。GeckoTerminal 描述的费用路由是：NVDA 计价的费用进社区金库，AI 计价的费用销毁或锁定 [31]。2026-09-01 推出 LongX，把 Lighter 上的 NVDA 3x 杠杆仓位包装成 ERC-20 [31]。
- 教训：单股池会把一只股票代币的链上流通量吸干。BONER/HIMS 池持有 31,198 / 58,714 枚代币化 HIMS，休市期间价格达 $132.64，而周五收盘价是 $28.84；另一份研究给出的口径是约 81%、小时高点 4.25 倍，两组口径不一致 [25]。
- 不确定之处：LONG 没有开源仓库，机制细节主要来自二手资料。

**PAIR（pair.fund）**
- 答案：一笔原子交易内部署 1B 固定供应代币，创建 1–5 个 Uniswap v4 池（quote 从 24 只白名单股票代币中选，权重合计 100%），按预言机给出的开盘价注入单边集中流动性，LP 永久锁进 PairV4Locker。没有曲线、没有迁移、没有价格上限。"毕业"只是 4.2 ETH×ETH/USD 的信息性标志，翻转后不移动任何流动性。发射块加之后 5 个区块内，单笔买入 ≤5.5%、单钱包持仓 ≤5.0%，卖出不受限。每笔 1% 交易费，70% 归创作者、30% 归协议；$PAIR 用协议费的 90% 回购 [22]。
- 事故与补丁：2026-08-30 接入 AMC 后，周末链上价格冲到真实价格的 35 倍。PAIR 的回应是"篮子分散"，另加 peg guard（偏离过大时只**暂停新发射**）和风险标签，都还没上线 [22]。另一份研究称 AMC 小时高点为 72.3 倍 [25]。

**同链竞品 pools.trade（Uniswap Labs，2026-08-05）**：不收 launchpad 费，0.25% v4 LP 费自动复投，创作者可选拿 0.05%；有两种模式，Crowd Launch（4 小时竞价，TWAP 定价）和 Instant Launch（曲线）[23]。

### 1.7 Mantle 本地：Funny Money、Printr

**答案**：两者都已停止运营，但都**不是**"Mantle 原生的通用 meme 曲线"。Funny Money 由 Mantle 在 2025-02-18 推出，定位是"AI agent launchpad & DeFAI terminal"，100 万 MNT 是配套**交易竞赛**的奖池；官网现在只剩"sunsetting its trading platform"一句话，停止日期没有一手出处。Printr 是一个多链（omnichain）launchpad，Bybit Venture Studio 首个孵化项目，2025-10-21 宣布融资合计 $4.5M（$2.5M pre-seed + $2M seed extension，Mantle EcoFund 是 seed extension 投资方之一）；2026-08-17 宣布进入 wind-down，2026-08-18 开始自动解押，2026-08-31 前停止全部运营，并取消 TGE 和空投，官方给出的原因是"没有足够的资本或分发支持"。

**依据**：[27][28][29][30]。

**不确定之处**：README 写的"Funny Money 2026-08-16 关停 / Printr 2026-08-18 关停"中，Printr 的 08-18 是 wind-down 开始日，不是关停日；Funny Money 的 08-16 没有找到一手来源。README 把"通用 meme 是纯内生注意力经济"写成两者失败的根因，这是资料作者的推断；Printr 官方原因是资本与分发。

---

## Q2 结构性缺陷与设计公理

格式：现象 → 根因 → 已有解法 → 残留问题。

1. **迁移攻击面（迁移夹子与迁移漏洞）**
   - 现象：four.meme 2025-02 / 2025-03 两次被黑；pump.fun 早期毕业后迁到 Raydium，需要单独的迁移步骤 [8][9][6]。
   - 根因：资金要从 A 合约搬到 B 合约里由外部 DEX 建的池子，而目标池的地址或初始价格可以被第三方抢先确定。four.meme 两次都是这个原因：一次没校验已存在池子的价格，一次是可预测的 pair 地址被抢先注资。
   - 已有解法：
     - 退回不需要外部价格参数的 V2 池并销毁 LP（four.meme 2025-03-31）[10]；
     - 迁到自家 DEX 并原子迁移（pump.fun→PumpSwap）[3][6]；
     - 根本不做迁移：单边 LP（Clanker、Zora、PAIR）[11][15][22]；
     - 同 quote 曲线在池内毕业（Pons V2）[21]。
   - 残留问题：pump.fun 毕业仍是一个公开可见的时点，"毕业瞬间的信息冲击"依然存在（推断）；Pons 毕业仍分两段（`graduate` 后才 `createGraduatedPool`），失败时靠可重试和 7 天 rescue 兜底 [21][U4]。

2. **开盘狙击**
   - 现象：单边池开盘时池里没有配对资金，第一个买入者优势极大。
   - 根因：价格从最低 tick 开始，出块越快、越可预测，bot 越占优。
   - 已有解法：
     - 硬延迟和首块拍卖（Clanker v4.0）；
     - 衰减高费（Clanker 80%→5%/30s，Zora 99%→10s）[12][15]；
     - 硬上限（PAIR，5 个区块内 5.5%/5.0%）[22]；
     - 固定价格窗口和 PBW（Flaunch）[16]；
     - 竞价模式（pools.trade Crowd Launch，4 小时）[23]。
   - 残留问题：衰减费的粒度取决于出块时间（资料推断 2 秒出块下只有 7–8 档）[U4]；硬上限挡不住多钱包 sybil（推断）。

3. **dev 砸盘 / 老鼠仓**
   - 现象：早期创作者只能靠自己预买的仓位获利。
   - 根因：协议没有给创作者持续的合法现金流。pump.fun 2024-08 前创作者没有任何奖励，之后也只是一次性 0.5 SOL [4]。
   - 已有解法：按成交量永续分成，例如 pump.fun 2025-05 起 0.05%、Ascend 后 0.30% [7]，Clanker 的 creator LP fee [11]，Zora 创作者拿 50% 份额 [15]，Pons 35%、PAIR 70% [21][22]；收益权可转让（Flaunch Memestream）[16]；Pons 把回购的 meme 锁 5 年 [21]。
   - 残留问题：如果投机流量消失，分成也随之归零（Base Creator Rewards 人均 $26）[17]；"分成能消灭老鼠仓"只是推断，没有量化证据。

4. **多 quote 碎片化**
   - 现象：four.meme 每种 quote 资产单独配一套曲线参数；PAIR 一个代币开 5 个池；LONG 单股池可以把一只股票代币吸干 [U1][22][25]。
   - 根因：每个池单独沉淀 quote 资产，聚合器只为单笔交易优化路径，不做池间再平衡。
   - 已有解法：只有 PAIR 的 USDG 聚合路由（拒绝 >15% 价格冲击的路径）[22]。
   - 残留问题：休市期间套利者缺席；PAIR 只暂停新发射，存量池没有任何熔断 [22]。

5. **补贴退出暴跌（补贴或分发退出后流量崩塌）**
   - 现象：
     - Base App 接入 Zora 后发币量暴涨，一年后跌 99%+ [U3]；
     - Base Creator Rewards 2026-02 下线 [17]；
     - Robinhood Chain 的 gas 补贴 2026-09-29 到期，到期前后 launchpad 成交与 Pons 费用明显回落 [24][26]。
   - 根因：用补贴或分发换来的是"发币动作"，不是持续的买盘（推断）。
   - 已有解法：没有。
   - 残留问题：Robinhood Q3 财报（2026-10 下旬）之前，补贴退出后的稳态数据还不完整。

6. **社交图谱发币的价值衰减**
   - 现象：Pollak 公开承认失败；Clanker 单币手续费下降 96%（资料口径）[18][U3]。
   - 根因：发币零门槛，供给可以被 bot/agent 无限刷，单币价值被稀释（推断）。
   - 已有解法：Zora 用 Trend Coin 放弃创作者分配、把费率压到 0.01% [15]；Zora 转向 Solana 的 attention markets [19]。
   - 残留问题：没有一家证明社交发币能维持留存。

7. **高频 revert 与状态膨胀**
   - 现象：资料称热点开盘时大量交易 revert，pump.fun 上有数百万个僵尸币（Pons 官网显示累计 4.2M 个代币）[U5][35]。
   - 根因：单曲线账户是写热点；建币免费。
   - 已有解法：Base 的 Flashblocks 自带 revert protection（资料）[U3]；Robinhood Chain 采用 FCFS、不设优先费拍卖（资料）[U4]。
   - 残留问题：资料里"50%+ revert""99% 僵尸"没有一手量化来源。

8. **第三方信任与权限**
   - 现象：pump.fun 2024-05 前员工利用 withdraw authority 作案 [5]；Flaunch 第一版 PositionManager 的收款人写死为 Flayer 基金会多签（资料）[U3]。
   - 根因：管理员权限或不可变的收款人指针。
   - 已有解法：Pons locker 不暴露 `collectFees`/提取/任意调用 [21]；Clanker 核心不可升级，模块走白名单 [U3]。
   - 残留问题：回购比例（PONS 80%）仍是团队政策，不在合约里。

**由上推出的设计公理**（均为 inferred）：
- (A1) 不要依赖外部建池的迁移，用单边 LP 或同 quote 池内毕业；
- (A2) 防狙击要和出块粒度匹配，或改用额度/竞价门禁；
- (A3) 创作者分成写进合约并随成交量流动，但别把它当留存手段；
- (A4) 多 quote 必须有统一路由，休市期间要有熔断；
- (A5) 补贴和分发只能买到冷启动，KPI 看毕业数和存活率，不看发币数；
- (A6) 关键比例和收款人写进合约，并保留可治理的指针。

---

## Q3 演进时间线（年月 + 事件 + 意义）

| 日期 | 事件 | 意义 | 来源 |
|---|---|---|---|
| 2024-01（资料） | pump.fun 上线 | 虚拟储备曲线范式 | [U5] |
| 2024-05-16 | pump.fun 前员工权限滥用，损失约 $1.9M | 管理员权限是风险点 | [5] |
| 2024-08-09 | pump.fun 建币免费 + 毕业奖励创作者 0.5 SOL | 第一次给创作者激励 | [4] |
| 2024-11-08（资料） | Clanker v0 上线 | 社交发币、单边 LP | [U3] |
| 2025-02-11 | four.meme V3 迁移漏洞，损失约 $183K | 迁移攻击面 | [8] |
| 2025-02-18 | Mantle 推出 Funny Money | Mantle 第一次试水 | [27] |
| 2025-03-18 | four.meme 第二次被黑（可预测 pair 地址被抢先注资） | 同上 | [9] |
| 2025-03-20 | PumpSwap 上线，迁移费 6→0 SOL | 自家 DEX 承接毕业 | [6] |
| 2025-03-31 | four.meme 改迁 V2 + 销毁 LP + 4444 地址 | 用简化换安全 | [10] |
| 2025-05-13 | pump.fun 开始给创作者分交易费 | 一次性奖励→永续分成 | [2][7] |
| 2025-09 | pump.fun Project Ascend 动态费 | 创作者费 0.30% | [7] |
| 2025-10 | Farcaster 收购 Clanker；Printr 融资 $4.5M | 所有权变更 | [13][29] |
| 2026-01-21 | Neynar 收购 Farcaster，接手运营 Clanker | 所有权再次变更 | [14] |
| 2026-02-09/18 | Base App 下线 Creator Rewards（$450K/17K 人） | 补贴退出 | [17] |
| 2026-02-17 | Zora 在 Solana 推出 attention markets | Base 系外迁 | [19] |
| 2026-05-21 | pump.fun 支持 USDC 作 quote | 稳定币 quote | [2] |
| 2026-07-01 | Robinhood Chain 主网 + Stock Tokens | 股票 quote 的前提 | [20] |
| 2026-07-13/14 | Pons V1 上线 | RH 链上的 pump.fun 式产品 | [21][U4] |
| 2026-07-15 | Pollak 承认社交路线"definitively wrong" | 社交发币路线终结 | [18] |
| 2026-07-21 | PAIR 首版上线（单配对，v3） | 股票 quote | [22] |
| 2026-08 初 | Pons V2 上线（同 quote 曲线→v4） | 池内毕业 | [21] |
| 2026-08-05 | Uniswap pools.trade 上线 | DEX 下场做 launchpad、价格战 | [23] |
| 2026-08-17/31 | Printr 宣布 wind-down，8-31 停止运营 | Mantle 生态试水失败 | [30] |
| 2026-08-26 | PAIR V5 multipool 上线 | 股票篮子作 quote | [22] |
| 2026-08-29~09-01 | HIMS/AMC 周末脱锚 | 真实资产耦合风险 | [22][25] |
| 2026-09-29 | RH Wallet gas 补贴到期 | 补贴退出测试 | [24] |
| 2026-10-02/04 | Pons 日费 −78%，PONS 从高点 −58%（二手） | 补贴退出后降温 | [26] |

---

## 图的素材

**A. 三种毕业形态对比（状态机）**
- pump.fun：`Curve(交易中)` →（`real_sol_reserves`≈85 SOL，`complete=true`）→ `原子迁移到 PumpSwap`（0.015 SOL 毕业费）→ `规范池（协议所有）` [1][2][3]。
- four.meme（2025-03-31 以后）：`Curve` →（达到阈值）→ `在 PancakeSwap V2 加流动性` → `LP 销毁` [10]。
- Clanker / Zora / PAIR：`部署` 即 `单边 LP 已在最终池`，没有毕业状态；PAIR 只有信息性 flag `graduated`（4.2 ETH×ETH/USD）[11][15][22]。
- Pons V2：`Curve(同 quote)` →（跨阈值的那笔买单在内部触发 `graduate`）→ `储备交给 factory` →（`createGraduatedPool`，可重试）→ `全区间 v4 头寸锁进 locker` [21]。

**B. four.meme 事故 1 时序（参与者：攻击者、four.meme 迁移合约、PancakeSwap V3）**[8]
1. 攻击者预先创建 V3 池，`sqrtPriceX96` 约为正确值的 3.68e14 倍；
2. 攻击者刷单把自己的币推到毕业；
3. four.meme 发现池已存在，不校验价格直接注入 200M 代币 + 约 24 WBNB；
4. 攻击者用少量代币取走全部 WBNB。

**C. four.meme 事故 2 时序** [9]：内盘调用 `0x7f79f6df` 买币 → 转到尚未创建的 pair 地址 → 攻击者自建 pair 并加流动性 → 以异常价格抽干池子。

**D. 防狙击参数示例（数值）**
- Clanker：起始 80%（LP 66% + 20% 协议加收），30s 内降到 5%，公式为二次曲线；$40K 起始市值 ×（1/(1−0.8)）= 狙击者等效入场市值 $200K [12]。
- Zora：99% → 1%（Trend 降到 0.01%），10s 线性 [15]。
- PAIR：发射块 + 5 块内，单笔 ≤5.5%、单钱包 ≤5.0% [22]。
- pools.trade Crowd Launch：4 小时竞价，TWAP 定价，最低 FDV $10K [23]。

**E. 费用分配对比（每笔交易）**
- pump.fun 曲线阶段：1.25% = 创作者 0.30 + 协议 0.95 [2]。
- Clanker：创作者 x%，另加协议 0.2x%（如 1% + 0.2%）[11]。
- Zora Creator/Content：1% = 创作者 50% / 平台推荐 20% / LP 永久化 20% / 交易推荐 4% / 协议 5% / Doppler 1%（拆分比例来自资料，文档只写"split across"）[15][U3]。
- Flaunch：1%，创作者 0–100%（UI 默认 80%），其余进 PBW [16][U3]。
- Pons V2：1% = 协议 30 / 创作者 35 / 回购金库 35（5 年解锁）[21][U4]。
- PAIR：1% = 创作者 70 / 协议 30；$PAIR 用协议费的 90% 回购 [22]。
- pools.trade：0.25% LP 费自动复投，可选 0.05% 给创作者，不收 launchpad 费 [23]。

**F. pump.fun 曲线数值**：x0 = 30 SOL，y0 = 1.073B，可售 793.1M，总量 1B → 毕业时约 85 SOL 真实储备 [1]。

---

## 来源

- [1] **PRIMARY** pump-fun/pump-public-docs `docs/PUMP_PROGRAM_README.md` @ commit 7a304c9e60005b7034b38575bb63fe3b0fca1ed0（https://github.com/pump-fun/pump-public-docs/blob/7a304c9e60005b7034b38575bb63fe3b0fca1ed0/docs/PUMP_PROGRAM_README.md ，访问 2026-10-05）——证明曲线初始虚拟/真实储备、总量、1% 费率字段。
- [2] **PRIMARY** pump.fun Fees（https://pump.fun/docs/fees ，访问 2026-10-05）——证明当前 1.25% 拆分、0.015 SOL 毕业费、2025-05-13 起有创作者费、2026-05-21 起支持 USDC quote。
- [3] **PRIMARY** pump.fun Bonding curve（https://pump.fun/docs/bonding-curve ，访问 2026-10-05）——证明恒定乘积、原子迁移到 PumpSwap、池归协议所有。
- [4] The Block 2024-08-09（https://www.theblock.co/news/markets/2024-08-09-pump-fun-cuts-fees-and-unveils-80-incentive-310376 ，访问 2026-10-05）——转述官方公告：0.5 SOL 创作者奖励、1.5 SOL 迁移费、建币免费。
- [5] The Block 2024-05-16（https://www.theblock.co/post/295029/pump-fun-post-mortem ，访问 2026-10-05）——引用官方 post-mortem：前员工利用 withdraw authority，约 12.3K SOL / $1.9M。
- [6] **PRIMARY**（官方推文，经 Cryptonews 2025-03-20 转引）https://x.com/pumpdotfun/status/1902762309950292010 ；https://cryptonews.com/news/pump-fun-launches-pumpswap-dex-to-rival-solanas-amms （访问 2026-10-05）——证明 PumpSwap 上线、迁移费 6→0、0.25% 费率拆分。
- [7] **PRIMARY**（数据方法论）DefiLlama pump.fun fees adapter（https://api.llama.fi/summary/fees/pump.fun?dataType=dailyRevenue ，访问 2026-10-05）——证明创作者费分期（2025-05-13 0.05%、Ascend 后 0.30%）与回购比例分期。
- [8] **PRIMARY**（审计方复盘）Verichains《Four.meme Hack Analysis》2025-02-21（https://blog.verichains.io/p/fourmeme-hack-analysis ，访问 2026-10-05）——证明 2025-02-11 事故的金额与根因。
- [9] Decrypt 2025-03-18（https://decrypt.co/310388/meme-coin-launchpad-four-meme-falls-victim-to-another-exploit ）引 SlowMist / QuillAudits 及 four.meme 官方推文；lunaray 复盘（https://lunaray.medium.com/four-meme-hack-analysis-7f320dc99b9e ，访问 2026-10-05）——证明第二次事故的机制。
- [10] **PRIMARY** four.meme 官方 Binance Square 公告（https://www.binance.com/en/square/post/22287851440922 ，访问 2026-10-05）——证明改迁 V2、销毁 LP、地址以 4444 结尾。
- [11] **PRIMARY** Clanker DOCS `general/creator-rewards-and-fees.md`（https://github.com/clanker-devco/DOCS/blob/main/general/creator-rewards-and-fees.md ，main 分支，访问 2026-10-05，未固定 commit）——证明协议费为创作者费的 20% 并加收在其上。
- [12] **PRIMARY** Clanker docs ClankerMevDescendingFees（https://clanker.gitbook.io/documentation/references/core-contracts/v4/mev-modules/clankermevdescendingfees.md ，访问 2026-10-05）——证明衰减公式、80%→5%/30s、$200K 等效入场市值。
- [13] **PRIMARY** Dan Romero Farcaster cast "Clanker is joining Farcaster"（https://farcaster.xyz/dwr/0x0bc1c207 ）；PANews 2025-10-28（https://www.gate.com/news/detail/15380984 ，访问 2026-10-05）——证明 Farcaster 收购 Clanker 以及回购/销毁安排。
- [14] **PRIMARY** Neynar blog 2026-01-21（https://neynar.com/blog/neynar-is-acquiring-farcaster ，访问 2026-10-05）——证明 Neynar 接手运营 Clanker。
- [15] **PRIMARY** Zora Coins docs（https://docs.zora.co/coins ，访问 2026-10-05）——证明三种币的供应/费率/狙击税/20% 永久流动性/Doppler。
- [16] **PRIMARY** Flaunch docs Auto Buybacks（https://docs.flaunch.gg/features/auto-buybacks.md ，访问 2026-10-05）——证明 PBW 每 0.1 ETH 一档、创作者不拿的份额进 PBW。
- [17] Cointelegraph 2026-02-10（https://cointelegraph.com/news/base-app-sunset-creator-rewards-program ，转引 @baseapp 2026-02-09 推文，访问 2026-10-05）——证明 Creator Rewards 下线、$450K/17K 人、原因是聚焦交易。
- [18] CoinDesk 2026-07-15（https://www.coindesk.com/business/2026/07/15/coinbase-s-jesse-pollak-steps-back-from-base-app-leadership-after-admitting-his-crypto-social-strategy-failed ）；The Block 2026-07-15（访问 2026-10-05）——转引 Pollak X 原帖，证明其"definitively wrong"表态与卸任 App 负责人。
- [19] The Block 2026-02-17 / CoinDesk 2026-02-18（https://www.theblock.co/news/web3/2026-02-17-zora-launches-attention-markets-solana-390249 ，访问 2026-10-05）——证明 Zora 在 Solana 推出 attention markets。
- [20] **PRIMARY** Robinhood Newsroom 2026-07-01（https://robinhood.com/us/en/newsroom/robinhood-accelerates-global-expansion-robinhood-chain-mainnet-stock-tokens-agentic-trading/ ，访问 2026-10-05）——证明主网与 Stock Tokens 上线日期。
- [21] **PRIMARY** Pons 合约仓库 README（github.com/ponsdotdev/ponsfamily → 已重定向到 ponsdotdev/pons-labs，HEAD commit 44a3db9193c365f6c25cf0d4c2efc396e6de0df5，2026-10-01，访问 2026-10-05）——证明 V1/V2 机制、factory 地址、5 年回购金库、无路由毕业。
- [22] **PRIMARY**（项目方新闻稿）PAIR GlobeNewswire 2026-08-31（https://www.globenewswire.com/news-release/2026/08/31/3353221/0/en/ ，访问 2026-10-05）——证明 multipool 机制、反狙击上限、70/30 分成、AMC 35x、peg guard 尚未上线。
- [23] Gate News 2026-08-06（https://www.gate.com/news/detail/uniswap-launches-pools-token-launchpad-for-robinhood-chain-23246650 ）；WEEX 文章（访问 2026-10-05）——证明 pools.trade 的费率与两种发射模式、首日发币数。
- [24] crypto.news 2026-09-04（https://crypto.news/robinhood-chain-flipped-solana-revenue-gas-subsidy-expires/ ）；Gate News 2026-08-08（访问 2026-10-05）——证明 90 天 gas 补贴、门槛 $5→$0.5、09-29 到期。
- [25] The Defiant（BONER/HIMS，https://thedefiant.io/news/tokens/a-memecoin-called-boner-has-cornered-half-the-tokenized-hims-and-hers-float ）；Wurrly Research（https://www.wurrly.org/research/robinhood ，访问 2026-10-05）——二手；HIMS 被吸占比与 AMC 倍数两组口径互相矛盾。
- [26] Gate News 2026-10-04（转引 BlockBeats/GMGN，访问 2026-10-05）——二手：补贴到期后 Pons 日费 −78%。
- [27] **PRIMARY** Mantle Blog 2025-02-18（https://www.mantle.xyz/blog/announcements/funny-money-mantle-network-ai-defai-launchpad ，访问 2026-10-05）——证明 Funny Money 的定位与 1M MNT 交易竞赛。
- [28] **PRIMARY** funny.money 官网（https://funny.money/ ，访问 2026-10-05）——证明"sunsetting its trading platform"。
- [29] **PRIMARY** Printr PR Newswire 2025-10-21（https://www.prnewswire.com/news-releases/printr-raises-4-5m-partners-with-bybit-mantle--byreal-and-officially-launches-the-first-every-chain-token-launchpad ，访问 2026-10-05）——证明融资结构与 Bybit Venture Studio 孵化。
- [30] Crypto Briefing 2026-08-17（https://cryptobriefing.com/printr-shuts-down-cancels-token-airdrop ，转引 @printr 2026-08-17 推文，访问 2026-10-05）——证明 wind-down 时间表与原因。
- [31] GeckoTerminal AI 池页面；Gate News 2026-09-01 LongX（访问 2026-10-05）——二手：LONG 的费用路由与 LongX。
- [32] Bitquery Pons API docs（https://docs.bitquery.io/docs/blockchain/robinhood/pons-api/ ，访问 2026-10-05）——二手：Pons V2 的 quote 资产与合约地址表。
- [34] **PRIMARY**（数据方法论）DefiLlama clanker adapter（https://github.com/DefiLlama/dimension-adapters/blob/master/fees/clanker.ts ，master 分支，访问 2026-10-05）——证明 Clanker 费用口径与 Holders Revenue 即回购。
- [35] **PRIMARY** Pons 官网 Explore（https://www.ponsfamily.com/launchpad ，访问 2026-10-05）——证明累计发币 4,228,127 与"Degraded performance"提示。
- 用户资料：[U1] `2-meme-launchpad/benchmarks/bsc-fourmeme.md`；[U2] `2-meme-launchpad/benchmarks/gen2-bsc-base.md`；[U3] `2-meme-launchpad/benchmarks/base-ecosystem.md`；[U4] `2-meme-launchpad/benchmarks/robinhood-chain.md` 与 `robinhood-notes.md`；[U5] `2-meme-launchpad/outputs/03-launchpad-evolution-and-pitfalls.md`；[U6] `2-meme-launchpad/README.md`；[U7] `2-meme-launchpad/references/launchpad-evolution-analysis.md`；[U8] `2-meme-launchpad/outputs/04-defects-and-optimizations.md`、`04-robinhood-two-weeks.md`（均在 `/Users/whisker/Work/research/work/mantlev3-roadmap/` 下）。
- 说明：read 工具没有返回行号，下文台账中资料位置用"§节号（≈L行）"表示，行号为估计值。

---

## 开放问题

1. Pons V2 的反狙击到底是什么：factory 常量 99%/15s（资料）还是 README 写的"曲线价格冲击 + 预留"？需要读已验证字节码。
2. Pons、PAIR、pools.trade 的毕业率，以及补贴到期后的稳态日费与发币量：一手数据（DefiLlama/Dune）本轮没有拉取；Robinhood 2026-10 下旬的 Q3 财报可能给出链收入口径。
3. Funny Money 的确切停运日期和原因（官网只有一句话）。
4. four.meme 毕业"98% 入池 / 2% 留存"以及约 163M 未售代币去向，需要用一笔毕业交易的 Transfer 事件复核。
5. Zora 2026 下半年状态（Custom Pairs、CEO 更换）缺一手来源。
6. LONG 的合约与费用参数没有开源，需要找已验证合约。
7. pump.fun PumpSwap 当前分档费率表（官方页是图片），以及"2026-05 扩展到 Base"是否属实。
8. HIMS/AMC 事件两组口径（53% vs 81%，35x vs 72.3x）谁对，需要链上复核。

---

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| P1 | pump.fun 曲线初始虚拟储备为 30 SOL / 1.073B 代币，可售真实储备 793.1M，总量 1B，当时交易费 100 bps | [1] pump-public-docs PUMP_PROGRAM_README @7a304c9 的 Global 账户字段 | observed |  |
| P2 | 按 P1 参数，打满可售代币约需 85 SOL 真实储备，即毕业阈值约 85 SOL（SOL 计价，与美元无关） | 由 P1 推出：30×1.073/(1.073−0.7931)−30≈85.0 SOL | inferred |  |
| P3 | 截至 2026-10，pump.fun 曲线阶段总费 1.25%（创作者 0.300% + 协议 0.95%），建币 0 费，毕业到 PumpSwap 收 0.015 SOL | [2] pump.fun/docs/fees（访问 2026-10-05） | observed |  |
| P4 | pump.fun 自 2026-05-21 起允许 USDC 作为 quote 资产 | [2] pump.fun/docs/fees | observed |  |
| P5 | 2024-08-09 起 pump.fun 建币免费，代币完成曲线时奖励创作者 0.5 SOL，迁移费为 1.5 SOL | [4] The Block 2024-08-09 转述官方公告 | observed |  |
| P6 | 2025-03-20 PumpSwap 上线，毕业代币直接迁入，迁移费从 6 SOL 降到 0，PumpSwap 初始费率 0.25%（LP 0.20%/协议 0.05%） | [6] pump.fun 官方推文（经 Cryptonews 转引） | observed |  |
| P7 | pump.fun 创作者费 2025-05-13 起为 0.05%，2025-09 Project Ascend 后为 0.30% | [7] DefiLlama pump.fun adapter 方法论；[2] 官方确认 2025-05-13 起有创作者费 | observed |  |
| P8 | 2024-05-16 pump.fun 被前员工利用 withdraw authority 盗走约 12.3K SOL（约 $1.9M，曲线总流动性约 $45M），根因是内部权限而非合约漏洞 | [5] The Block 引官方 post-mortem | observed |  |
| P9 | pump.fun 毕业是原子、自动、不可逆的迁移，迁移后的 PumpSwap 规范池归协议所有 | [3] pump.fun/docs/bonding-curve | observed |  |
| P10 | 资料称 pump.fun 于 2024-01 上线 | 仅见于 2-meme-launchpad/benchmarks/robinhood-chain.md §3.7.2（≈L800），未找到一手来源 | speculative |  |
| P11 | four.meme 2025-02-11 被盗约 $183K：迁移时目标 V3 池已存在则不校验 sqrtPriceX96，攻击者预建价格约为正确值 3.68e14 倍的池，诱导注入 200M 代币 + 约 24 WBNB 后取走 WBNB | [8] Verichains 2025-02-21 复盘 | observed |  |
| P12 | four.meme 2025-03-18 第二次被黑：内盘用 0x7f79f6df 把代币转到可预测但尚未创建的 PancakeSwap pair，绕过 MODE_TRANSFER_RESTRICTED，以异常价格建池并抽干 | [9] Decrypt 引 SlowMist/QuillAudits；lunaray 复盘 | observed |  |
| P13 | four.meme 2025-03-31 宣布：新币地址以 4444 结尾，毕业后在 PancakeSwap V2 加流动性并销毁 LP | [10] four.meme 官方 Binance Square 公告 | observed |  |
| P14 | 资料 outputs/03 所称"four.meme 2025-09 与 2026 初 Helper3 重入、违反 CEI 被盗 $183K"与一手复盘不符，属于错误 | 由 P11、P12 推出：两次事故均在 2025-02/03，根因是池价未校验和可预测 pair 地址，不是重入；资料位置 outputs/03 §2.2.2（≈L150） | inferred |  |
| P15 | four.meme 两次事故的共同根因是"迁移目标池的地址或价格可被第三方抢先确定" | 由 P11、P12 推出：一次复用已存在的假池，一次抢先注资可预测 pair | inferred |  |
| P16 | four.meme 截至 2026-09-06 BNB 池毕业阈值 18 BNB、曲线可售 80%、买卖费 1%，毕业时入池为阈值的 98%（隐性 2%） | 仅见于 2-meme-launchpad/benchmarks/bsc-fourmeme.md §1.3–§1.4（≈L80–L140）资料作者链上实测，本轮未复核 | speculative |  |
| P17 | four.meme 2026-09 日发币约 13.7K、毕业率约 0.07%，DefiLlama 24h 费用 $9,578（2025-10-08 峰值单日收入 $1.43M） | 仅见于 bsc-fourmeme.md §3.1–§3.3（≈L230–L290），未复核 | speculative |  |
| P18 | Clanker 协议费固定为创作者 LP 费的 20%，加收在创作者费之上（1% 创作者费→交易者实付 1.2%） | [11] Clanker DOCS creator-rewards-and-fees；[34] DefiLlama 方法论 | observed |  |
| P19 | Clanker 部署时全部供应作为单边 v4 LP（initial LP）放入池中，持有者自建的 LP 或新池不给创作者分成 | [11] Clanker DOCS | observed |  |
| P20 | ClankerMevDescendingFees 起始 LP 费最高 80%、衰减最长 2 分钟、二次曲线衰减，推荐 80%→5%/30s，$40K 起始市值下狙击者等效入场市值 $200K | [12] Clanker docs | observed |  |
| P21 | Farcaster（Merkle）收购 Clanker，同时宣布协议费用于买入并持有 $CLANKER、烧毁 v0–v3.1 费用金库代币、约 7% 供应锁入单边 LP | [13] Dan Romero Farcaster cast；PANews 2025-10-28 | observed |  |
| P22 | 2026-01-21 Neynar 宣布收购 Farcaster，接手运营 Clanker，Clanker 创始人 Jack 和部分团队加入 Neynar | [14] Neynar blog 2026-01-21 | observed |  |
| P23 | 资料 base-ecosystem.md 把"Clanker 被 Farcaster/Neynar 收购"标为"很可能不实"，已过时 | 由 P21、P22 推出；资料位置 base-ecosystem.md §1.6（≈L210）、§8.2 第 7 条（≈L1390） | inferred |  |
| P24 | 资料称 Clanker 发放"Fee Key NFT"，与官方文档不符：Clanker 文档描述的是 locker 的 rewardBps 槽位分成，未见可转让收益权 NFT；可转让收益权 NFT 是 Flaunch Memestream | 由 P18、P19、P30 推出；资料位置 outputs/03 §2.2.1 迭代 4（≈L120） | inferred |  |
| P25 | Clanker 单币手续费从 2024-12 的 $1,371 降到 2026-08 的 $53（−96%），2026-02 单月部署 261,047 枚、手续费 $22.39M（AI agent 浪潮） | 仅见于 base-ecosystem.md §1.8（≈L300–L330）资料 DefiLlama/clanker API 拉取，本轮未复核 | speculative |  |
| P26 | Zora 每个币固定 1B 供应，进带 hook 的 Uniswap v4 池；狙击税 99% 起 10 秒衰减；20% 手续费锁为永久池深度；费用多跳兑换后以 ZORA 支付；初始流动性由 Doppler 多曲线布置 | [15] docs.zora.co/coins | observed |  |
| P27 | Zora Creator Coin 50% 给创作者、5 年释放；Content Coin 以创作者币作 quote，创作者即时得 10M；Trend Coin 费率 0.01%、无创作者分配、手续费全归协议 | [15] docs.zora.co/coins | observed |  |
| P28 | Base App 2026-02-09 宣布下线 Creator Rewards 与 Talk feed，7 个月约 $450K 发给约 17K 名创作者（人均约 $26），最终发放日 2026-02-18，理由是聚焦交易 | [17] Cointelegraph 2026-02-10 转引 @baseapp | observed |  |
| P29 | 2026-07-15 Pollak 公开承认 Farcaster/Zora/miniapps/creator coins 路线"disintegrated completely … definitively wrong"，把 Base App 交给 Cobie，本人继续负责 Base 链 | [18] CoinDesk、The Block 2026-07-15 转引 X 原帖 | observed |  |
| P30 | Flaunch 创作者不拿的手续费份额全部进入 Progressive Bid Wall，每攒满 0.1 ETH 在现价正下方挂一笔限价买单，价格上涨时跟随上移；Memestream 持有者可关闭 PBW | [16] docs.flaunch.gg auto-buybacks | observed |  |
| P31 | Zora 于 2026-02-17 在 Solana 推出 attention markets，开始离开 Base 单链 | [19] The Block 2026-02-17 / CoinDesk 2026-02-18 | observed |  |
| P32 | Robinhood Chain 公开主网与新版 Stock Tokens 于 2026-07-01 上线 | [20] Robinhood Newsroom | observed |  |
| P33 | Robinhood Wallet 的 gas 补贴随主网上线、为期 90 天，门槛最初为 >$5 的 swap，2026-08-08 降到 $0.5，2026-09-29 到期 | [24] crypto.news 2026-09-04；Gate News 2026-08-08 | observed |  |
| P34 | Pons V1 是 CREATE2 工厂 + 单边 Uniswap V3 头寸 + 可配置 locker；V2 是同 quote 恒定乘积曲线，毕业为全区间 v4 头寸并永久锁定（"no router, no swap, and no price oracle"） | [21] Pons 仓库 README @44a3db9 | observed |  |
| P35 | Pons V2 回购金库对买回的代币 5 年线性解锁，不销毁；毕业分两段且都无需许可（graduate + 可重试的 createGraduatedPool） | [21] Pons 仓库 README @44a3db9 | observed |  |
| P36 | Pons V2 默认 1% 费用拆为协议 30% / 创作者 35% / 回购金库 35% | 资料 robinhood-notes.md §3.5（≈L430）称来自 GitHub 源码，README 只写"split protocol / creator / buyback"，比例未在 README 中直接看到 | speculative |  |
| P37 | Pons V2 反狙击为 99% 起始税、15 秒衰减（factory 常量），与 README 表格写的"Curve price impact + reserved pool allocation"矛盾 | 仅见于 robinhood-notes.md §3.4（≈L400）；[21] README 表格给出另一种描述 | speculative |  |
| P38 | Pons V2 可用 ETH、USDG、cbBTC 或股票/ETF 代币作 quote | [32] Bitquery Pons docs（二手）；[21] README 写 quote 可为 native ETH 或所选 ERC-20 pairToken | observed |  |
| P39 | 截至 2026-10-05，Pons 官网显示累计发币 4,228,127，并挂"Degraded performance … upgrading the backend"提示 | [35] ponsfamily.com/launchpad | observed |  |
| P40 | 补贴到期后 Pons 日费从 2026-09-29 的 $6.87M 降到 10-02 的 $1.48M（−78%），PONS 从高点下跌 58% | 仅见于 [26] Gate News 转引 BlockBeats/GMGN（二手），未找到 DefiLlama 一手数据 | speculative |  |
| P41 | PAIR 在一笔原子交易内部署 1B 固定供应代币 + 1–5 个 v4 池（24 只白名单股票代币，权重合计 100%），按预言机开盘价注入单边流动性，LP 永久锁入 PairV4Locker | [22] PAIR GlobeNewswire 2026-08-31 | observed |  |
| P42 | PAIR 没有曲线、没有迁移；"毕业"只是 4.2 ETH×ETH/USD 的信息性 flag，不移动流动性 | [22] PAIR 新闻稿 | observed |  |
| P43 | PAIR 反狙击：发射块 + 后 5 块内单笔买入 ≤5.5%、单钱包 ≤5.0%，卖出不受限；1% 交易费 70% 归创作者、30% 归协议；$PAIR 用协议费的 90% 回购 | [22] PAIR 新闻稿 | observed |  |
| P44 | 2026-08-30 PAIR 接入 AMC 后，周末链上价格冲到真实价的 35 倍；peg guard 只暂停新发射，宣布时尚未上线 | [22] PAIR 新闻稿；另一口径 72.3x 见 [25] Wurrly（互相矛盾） | observed |  |
| P45 | BONER/HIMS 池持有 31,198/58,714 枚代币化 HIMS，休市期间价格达 $132.64，而周五收盘价为 $28.84；另一口径为约 81%、4.25 倍 | [25] The Defiant 与 Wurrly（二手，口径互相矛盾） | observed |  |
| P46 | LONG 强制以单只股票代币作 quote，AI/NVDA 的 NVDA 计价费用进社区金库，AI 计价费用销毁或锁定 | [31] GeckoTerminal 池描述（二手） | observed |  |
| P47 | Uniswap Labs 的 pools.trade 于 2026-08-05 在 Robinhood Chain 上线：不收 launchpad 费，0.25% LP 费自动复投，创作者可选 0.05%，有 Crowd Launch（4 小时竞价/TWAP）与 Instant Launch（曲线）两种模式 | [23] Gate News 2026-08-06（二手） | observed |  |
| P48 | Funny Money 于 2025-02-18 由 Mantle 推出，定位"AI agent launchpad & DeFAI terminal"，1M MNT 是配套交易竞赛奖池 | [27] Mantle Blog 2025-02-18 | observed |  |
| P49 | 截至 2026-10-05，funny.money 官网只显示"sunsetting its trading platform" | [28] funny.money 官网 | observed |  |
| P50 | 资料称 Funny Money 于 2026-08-16 关停 | 仅见于 2-meme-launchpad/README.md §1（≈L10），未找到一手来源 | speculative |  |
| P51 | Printr 是 Bybit Venture Studio 首个孵化的多链 launchpad，2025-10-21 宣布融资合计 $4.5M（$2.5M pre-seed + $2M seed extension，Mantle EcoFund 为 seed extension 投资方之一） | [29] Printr PR Newswire 2025-10-21 | observed |  |
| P52 | Printr 2026-08-17 宣布 wind-down，08-18 开始自动解押，08-31 前停止运营，取消 TGE 与空投，原因是缺乏资本或分发支持 | [30] Crypto Briefing 转引 @printr 2026-08-17 推文 | observed |  |
| P53 | 资料 README 把"Printr 2026-08-18 关停"和"两者都失败于纯内生注意力"写成事实；08-18 只是 wind-down 开始日，官方原因是资本与分发 | 由 P52 推出；资料位置 README.md §1（≈L10–L13） | inferred |  |
| P54 | 迁移攻击面可以靠"不迁移"（单边 LP）或"同 quote 池内毕业"在结构上消除，但会失去曲线阶段与"毕业"这一注意力事件 | 由 P15、P19、P34、P42 推出：Clanker/PAIR 无毕业动作，Pons V2 毕业无路由或预言机 | inferred |  |
| P55 | 创作者激励从 0.5 SOL 一次性奖励演进为按成交量永续分成（pump.fun 0.30%、Pons 35%、PAIR 70%），但投机流量退潮后分成随之归零 | 由 P5、P7、P28、P36、P43 推出：分成规模 = 成交量 × 比例，Base Creator Rewards 人均仅 $26 | inferred |  |
| P56 | 补贴和分发只能买到冷启动、买不到留存，Base App（2026-02）与 Robinhood Chain（2026-09-29）先后验证 | 由 P28、P33、P40 推出：补贴或分发退出前后活动量都明显下降；其中 P40 为二手 | inferred |  |
| P57 | 多 quote 碎片化在 2026-10 仍无生产级解法：PAIR 聚合器不做池间再平衡，peg guard 不熔断存量池 | 由 P43、P44 推出，加上 PAIR 新闻稿对聚合器功能的描述 [22] | inferred |  |

类型计数：observed 39 / inferred 10 / speculative 8（共 57 行）。

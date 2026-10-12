# Lane X：Papertrade 类产品在 Mantle 复现的前序需求与能力对照（notes-mantle）

> 产出说明：子 agent 把本文件写到了它自己的产物目录，主会话已原样搬到 `research/` 下。
> 访问日期：网页来源均为 2026-10-13（UTC+8）访问，另注明者除外。Papertrade 文档以快照 `research/references/papertrade-docs-2026-10-12.md`（访问于 2026-10-12）为准。
> Mantle 网络 / 排序部分直接引用 research-hub 报告 application-specific-sequencing 的 `research/notes-mantle.md`（下称“ASS notes-mantle”），其一手来源（mantle-v2@da45c315d8、op-geth@e33cd26cda、mantle-xyz/reth@f022de0f62、Mantle Docs Roadmap 等）保留在该文件中，本文只转引编号。

**一句话总结**：Papertrade 只有一项能力**必须**由 HyperCore 原生提供：合约内同步、免费、无签名者地读取同链订单簿 BBO。其余能力都是应用自建或第三方提供：relayer 代付加 session key、CREATE2 存款地址、keeper 清算、零种子 LP 队列，以及 CCTP / Across 入金。对照 Mantle，截至 2026-10：
- **免 gas / 一键交易**：有。EIP-7702 已随 Skadi 激活，Pimlico、ZeroDev、Etherspot、Particle 都支持 Mantle。
- **执行与排序**：部分有。2 秒出块；私有交易池按有效小费排序；白名单 FIFO preconf 车道已写进客户端，但主网是否启用未知；Flashblocks 仍在路线图上。
- **价格输入**：部分有。Chainlink Data Streams、Pyth Core、RedStone、API3、Chronicle 都可用，但都是“签名报告 / 推送价格”，不是同链原生订单簿状态。Mantle 链上没有可读的原生撮合状态，也没有官方 Bybit 价格 feed。
- **出入金**：部分有，USDC 一项缺。Mantle 上的 USDC 经 OP 式标准桥从以太坊桥接而来，Circle 不在 Mantle 原生发行，CCTP 也不支持 Mantle。主力稳定币是 USDT0（LayerZero OFT）。
- **永续需求**：弱。现存 Mantle 永续协议 TVL 很小，多家已停运。

---

## X-Q1 前序需求清单（从 Papertrade 架构反推）

**答案**：把 Papertrade 拆成 6 层后，只有“价格输入”一层的核心部分是 HyperCore 原生提供的：BBO 预编译，加上 HyperCore 账本和 CoreWriter。执行、排序和清算优先依赖 HyperEVM 链本身的出块和排序。免 gas、session key、relayer、keeper、CREATE2 存款地址、LP 队列和 PAPER 都是应用自建。跨链入金用的是第三方 Circle CCTP 和 Across。风险资本按设计来自用户亏损，没有种子资金。

**依据（按层，标明提供方）**：

| 层 | Papertrade 的具体依赖 | 提供方 | 来源 |
|---|---|---|---|
| 价格输入：来源 | HyperCore 原生订单簿 BBO，`price = (bid+ask)/2`，执行价就是 mid | **HyperCore 原生**（BBO 预编译 `0x…080e`）；Mark `0x…0806` 和 Oracle `0x…0807` 只读不用 | [2][1] |
| 价格输入：能否在合约里同步读 | 能。任意 HyperEVM 合约可 `staticcall` 读 L1 状态。官方文档说读到的值“guaranteed to match the latest HyperCore state at the time the EVM block is constructed” | HyperCore 原生 | [9][2] |
| 价格输入：抗操纵 | 弱。PriceOracle 只拒绝 0 值和交叉盘口（ask<bid），**没有**偏离、TWAP 或回看熔断；只靠 0.2 bps 死区、asymmetric impact 和 OI cap 降低收益 | 应用自建（缓解手段） | [2][3] |
| 价格输入：成本 / 签名者 | 读预编译 gas = `2000 + 65*(input_len+output_len)`，不需要预言机费，也没有价格签名者 | HyperCore 原生 | [9][2] |
| 执行与排序：出块 | HyperEVM 双块：快块 1 秒 / 3M gas，慢块 1 分钟 / 30M gas | HyperEVM 链级 | [10] |
| 执行与排序：开平仓 | 只接受 relayer 经 BatchExecutor 提交的批量意图；一笔 EVM 交易可以包含多个用户的意图 | 应用自建 | [1] |
| 清算 keeper 优先级 | 项目方自营清算 keeper，“paying a higher priority fee than any other protocol transaction so liquidations land first”。清算本身是公开维护路径，任何人都能调用 | keeper 应用自建；“小费高者先上链”依赖 HyperEVM 的排序规则 | [4][3] |
| 免 gas / 一键交易 | 用户签一次注册 session key（有效 30 天，单笔意图 1 小时内有效）；relayer 代付 gas；session key 不能提现、不能质押；撤销要用户钱包直接发交易，付 HYPE gas | 应用自建（SessionKeyManager、relayer） | [6][1] |
| 出入金：存款地址 | 用 CREATE2 按用户派生确定性的存款地址；relayer 在到账满 10 USDC 后部署 proxy；sweeper 执行 `requestSweep` / `finalizeSweep`；proxy 通过 CoreWriter 把 USDC 推进 Exchange 的 HyperCore 账户 | 应用自建，加上 HyperCore 原生 CoreWriter | [5][1] |
| 出入金：跨链路由 | Hyperliquid 内部转账、Circle CCTP、来自 Robinhood Chain 的 Across 填单，资金都落在该地址的 HyperCore 侧。可入金来源：Hyperliquid、HyperEVM、Ethereum、Arbitrum、Solana 的 USDC，以及 Robinhood Chain 的 USDG | 第三方（Circle、Across）；HyperEVM 上的 USDC 是 Circle 原生发行 | [5][8][28] |
| 风险资本 | LP 从 0 开始，不接受外部存入，靠用户亏损积累；付不出的赢利进入 FIFO 队列 | 应用（Martingaler 机制） | [7] |
| 需求来源 | 链上能力无法提供，见其他 lane（为什么火）；本 lane 只对照 Mantle 现有永续需求 | — | — |

**不确定之处**：
- HyperEVM 是否按 priority fee 排序同一块内的交易？[10] 没有说明。Papertrade 文档声称更高 priority fee 能让清算先上链 [4]，本 lane 未独立核实 HyperEVM 的块内排序规则（留给 HyperEVM lane）。
- “BBO 对应哪个时点”：只引用了 Hyperliquid 文档的“EVM 块构建时最新 HyperCore 状态”，没有做链上测量。

## X-Q2 Mantle 现有能力逐项对照（截至 2026-10）

### X-Q2a 网络与排序（转引 ASS notes-mantle）

**答案**：
- **基本参数**：Mantle 是单一 sequencer、2 秒出块（`block_time: 2`）、私有交易池。
- **排序规则**：op-geth 按“有效小费降序，同价按到达时间”排序。在此之前有一条白名单（from×to）FIFO preconf 车道，车道里的交易排在所有按小费排序的交易之前，并通过 `eth_sendRawTransactionWithPreconf` 返回预确认回执。Sepolia 已开放这个 RPC，主网是否启用没有一手来源。
- **Arsia 的影响**：Arsia 之后恢复了动态 EIP-1559，“小费高者先”才有竞价意义。
- **路线图（2026 H2，均未勾选）**：Flashblocks 亚秒级预确认、pure Reth 切换、Prop AMM 撤单优先。

由此推论（inferred）：Papertrade 式的“清算 keeper 出更高小费以先上链”在 Mantle 现网的普通车道里可以成立。前提是 preconf 车道没有对外开放给竞争者；如果开放，车道里的交易无论出多少小费，都排在小费排序之前。

**依据**：ASS notes-mantle M-Q1、M-Q2、M-Q2b、M-Q3，以及台账 M4、M5、M6、M13、M14、M16–M19、M21、M26–M28 [11]。

**不确定之处**：
- 主网 preconf 车道是否启用、白名单是谁，见 ASS notes-mantle 开放问题 1。
- 主网 sequencer 当前跑的是 op-geth 还是 reth（开放问题 2）。
- 2 秒出块对 1000× 杠杆意味着什么：保证金只有 10 bps，执行窗口内的价格变动风险需要实测。本 lane 未测。

### X-Q2b 预言机

**答案**：
- **Chainlink**：Data Feeds（推送）和 Data Streams（拉取）都在 Mantle 上。Mantle 官方博客 2025-02-13 宣布加入 Chainlink Scale，称二者“Now Live”。Chainlink 生态页把此事记为 2025-02-14（另有 2025-02-07 的“Mantle integrates…”条目），并列出 CCIP（2024-12-03）、CRE（2026-03-20）、MNT 迁到 CCIP（2026-07-09）。
  - Data Streams 在 Mantle 上只能“链下拉取报告 → 链上 VerifierProxy 验证”。基于 Automation `StreamsLookup` 的 Streams Trade 实现只支持 Arbitrum、Avalanche、Base、BNB、Ethereum、Optimism、Polygon，**不含 Mantle**。
  - v3 报告的 bid/ask 定义为“Simulated buy/sell impact price at X% liquidity depth”，不是单一交易所的盘口。
  - Mantle 上可见的推送 feed 有 MNT/USD、USDe/USD，偏离阈值均为 0.5%。
- **Pyth**：官方 EVM 地址表列出 Mantle 主网 Pyth Core（current）`0xA2aa501b19aff244D90cc15a4Cf739D2725B5729`，但 Mantle**不在** 2026-08-26 Pyth Core 升级名单里，“upgraded”和 Pyth Pro 两栏均为“—”。Hermes 自 cutover 起要求 API key。
- **其他**：RedStone（2023 年起接入 Mantle）、API3（Mantle 文档称 200+ feeds）、Chronicle、Supra、ORA 都列在 Mantle 官方 Oracles 页。该页**没有列出 Chainlink**。Stork 的 EVM 地址表里没有 Mantle。

**依据**：[12][13][14][15][16][17][18][19][20][21][22]。

**不确定之处**：
- Chainlink Data Streams 在 Mantle 上的 VerifierProxy 地址：supported-networks 页的地址表是动态渲染的，本次没有抓到，只有 changelog 的网络列表里出现 Mantle [17]。
- Data Feeds 在 Mantle 上是否有 BTC/USD、ETH/USD，以及它们的阈值，本次没有核到。
- Pyth 旧合约在“未升级链”上是否仍持续收到价格更新：[19] 没有说明。
- 各家在 Mantle 上的实测延迟未测；“sub-second”只是 Chainlink / Mantle 的宣传口径 [12]。
- Chainlink 文档提到部分 crypto stream 来自单一交易所的 top-of-book [15 页面附注]，但没有查到任何 Bybit 来源的 stream。

### X-Q2c 原生订单簿 / 交易所价格

**答案**：Mantle 链上**没有**类似 HyperCore 的原生撮合状态，也没有可供合约读取的预编译。Mantle 与 Bybit 的公开合作集中在 Super Portal（MNT 跨链，2026-07 迁到 CCIP）和 USDT0 充提。**没有查到** Bybit 价格的官方链上 feed。

**依据**：
- ASS notes-mantle 读过 op-geth / mantle-reth / op-node 源码，没有提到任何读交易所状态的预编译 [11]。Mantle 的 Differences 和 Architecture 文档也没有这方面描述 [11]。
- Super Portal 由 Mantle 与 Bybit 共建，2026-07-09 从 LayerZero 迁到 CCIP [33]。
- Bybit 支持 Mantle 上的 USDT0 充提（2025-11-27 新闻稿）[31]。
- 路线图里唯一与撮合相关的是 Prop AMM“high-priority cancellations (Cancel) and dedicated matching paths”（2026 H2，未勾选）[11]。

**不确定之处**：“没查到”不等于不存在；Bybit 可能通过 Chainlink / Pyth 发布者身份间接贡献价格，这一点没有核实。

### X-Q2d 账户抽象与免 gas

**答案**：
- **EIP-7702**：在 Mantle 主网激活。Skadi 升级（v1.3.1，“required upgrade for all operators of Mantle mainnet”）对齐以太坊 Prague，op-geth 的 changelog 写明“EIP-7702: Supports SetCode TX”。主网激活日期据 Messari 和二手转引的 @0xMantleDevs 推文为 2025-08-27。
- **4337**：Pimlico 的 supported-chains 列出 Mantle（5000）和 Mantle Sepolia；ZeroDev 列出 Mantle 主网和测试网；Mantle 官方 AA 页推荐 Etherspot（4337）和 Particle。
- **原生代付**：Mantle op-geth 还保留原生 meta-tx 代付（`MetaTxParams`）。
- **小结**：session key 和 relayer 在 Papertrade 里本来就是应用自建，可以原样迁移；relayer 用 MNT 付 gas。

**依据**：
- Skadi v1.3.1 changelog [23]；日期 [24]。
- `batches.go:176-189` 在 Skadi/Isthmus 之前禁止 SetCode 交易，之后允许 [11]（ASS notes-mantle M11）。
- Pimlico [26]、ZeroDev [27]、Mantle AA 页 [25]。
- meta-tx 见 ASS notes-mantle M-Q6（`state_transition.go:275,602-612`）[11]。

**不确定之处**：
- Pimlico 在 Mantle 上的 entrypoint 版本和 7702 支持细节表，本次没有抓到 Mantle 段落。
- 没有用 RPC 实测 type-4 交易。

### X-Q2e 稳定币与出入金

**答案**：
- **USDC**：Mantle 上的 USDC（`0x09Bc…0dF9`）是经 OP 式标准桥从以太坊 USDC 桥接来的。Mantle token list 写明 `optimismBridgeAddress` L1 `0x95fC…3012` / L2 `0x4200…0010`。Circle 的原生 USDC 地址表**没有 Mantle**，CCTP 支持链和 domain 表也**没有 Mantle**（HyperEVM 是 domain 19）。
- **USDT**：两种。USDT0（LayerZero OFT，`0x779D…3736`），官方页显示当前供应量 $439.91M（访问时）；另有旧的标准桥 USDT。
- **其他稳定币**：USDe / sUSDe 走 LayerZero / Stargate；Paxos 的 USDG 于 2026-09 上线。
- **跨链**：MNT 的 Super Portal 用 CCIP。Across 的链表（legacy docs）没有 Mantle，0x 的跨链表也把 Mantle 的 Across 标为 ❌；Relay、CCIP、OFT 标为 ✅（0x 是第三方整理）。

**依据**：[28][29][30][31][32][33][34][40]。

**不确定之处**：
- Across 新版文档是否已加入 Mantle：只看到 legacy 列表和 0x 第三方表。
- 桥接 USDC 在 Mantle 上的流通量：usdc.cool 第三方快照显示 Mantle Bridge 约 $12.8M [40]，未核链上数据。

### X-Q2f Mantle 上现有 / 曾有的永续协议与产品方向

**答案**：
- **现存协议规模都很小**：DefiLlama 系数据快照显示，KTX Perps（GMX 式 KLP 池做对手方）在 Mantle 的 TVL 约 $14.5K，但累计永续成交量中 Mantle 占 $6.511B；TsunamiX 的 Mantle TVL 约 $4.9K；SYMMIO 约 $61K；Apex Omni 约 $1.2M。
- **已停运的**：IntentX（SYMMIO 前端，2026-01-08 停止交易）；Vertex（含 Mantle 的 Edge 实例，2025-08-14 停运，来源为二手）。
- **用什么预言机**：KTX 和 TsunamiX 用什么预言机，本次**没有拿到一手来源**。
- **官方方向**：没有找到明确以 perps 为方向的公开表述。路线图与交易相关的条目是 Prop AMM 撤单优先和 2D nonce（“high-frequency payment and trading scenarios”）；官网定位是“Institutional Onchain Finance”。

**依据**：[35][36][37][38][11][34]。

**不确定之处**：TVL 数据来自聚合站，口径和时点不一，只能当作量级参考，不能用作精确值。

## X-Q3 缺口：逐项“有 / 部分有 / 缺”

**答案**：真正属于链级、应用无法自建的缺口只有两类：
1. **同链、原生、无签名者可同步读取的交易所价格状态**：Mantle 没有；
2. **原生 USDC / CCTP**：取决于 Circle，不是 Mantle 自己能决定的链级能力。

其余要么已有（AA、7702、paymaster、CREATE2、按小费排序），要么应用可以自建（relayer、session key、keeper、队列式 LP）。排序层是“部分有”：要给清算提供可预期的优先，Mantle 已有 preconf 车道雏形，但没有面向应用的公开接口。

| 需求 | Papertrade 中谁提供 | Mantle 现状 | 判定 | 缺的是什么 |
|---|---|---|---|---|
| 同链原生价格状态（同步读、无签名者） | HyperCore 原生 | 无原生订单簿或预编译 | **缺** | 链级（也可以理解为“没有自己的 venue”）；应用只能改用预言机 |
| 低延迟可验证价格 | HyperCore 原生 | Chainlink Data Streams（拉取 + 链上验证，v3 带模拟冲击 bid/ask）、Pyth Core（旧合约，未升级）、RedStone pull | **部分有** | 应用自建集成；签名报告带来“选价”问题，需要应用协议约束（inferred） |
| 抗操纵 | 应用缓解（死区、impact、OI cap） | 预言机本身做多源聚合；HL 式“单 venue 盘口挂单”攻击面不直接存在（inferred） | 有（性质不同） | — |
| 出块与执行 | HyperEVM 1s / 1min 双块 | 2s 单一 sequencer、私有池 | **部分有** | 链级；Flashblocks 在路线图上（未勾选） |
| 清算优先上链 | keeper 应用自建 + 链排序 | op-geth 按有效小费排序（Arsia 后有竞价意义）；preconf FIFO 车道排在最前（白名单） | **部分有** | 应用 keeper 可以自建；“结构性优先”要靠 sequencer 车道（链级运营） |
| 免 gas / session key / relayer | 应用自建 | 7702（Skadi）、Pimlico / ZeroDev / Etherspot / Particle、原生 meta-tx | **有** | — |
| CREATE2 存款地址与 sweeper | 应用自建 + HyperCore CoreWriter | 标准 EVM CREATE2 可用；没有 CoreWriter 之类“双账本”，普通 ERC-20 转账即可 | **有** | 应用自建 |
| 原生 USDC + CCTP 入金 | 第三方 Circle（HyperEVM 是原生 USDC、CCTP domain 19） | USDC 为标准桥桥接版；没有 CCTP | **缺** | 生态 / 发行方层面；替代路径是 USDT0（OFT）、USDe、USDG |
| 快速跨链填单（Across 类） | 第三方 Across | Across 不支持（legacy 表、0x 表）；Relay 支持 | **部分有** | 第三方 |
| 风险资本 | 应用（零种子、队列） | 机制可以原样部署；Mantle 国库 $2.34B（2026-10-12）可作为潜在种子来源（speculative） | **有（机制）** | 应用 / 治理决策 |
| 需求 | HL 用户和 HyperEVM 热度（见其他 lane） | 现存 perps TVL 很小，多家停运 | **缺** | 不是链能力问题 |

**依据**：X-Q1、X-Q2 各节。

**不确定之处**：判定基于文档和列表，不是实测。尤其“部分有”的排序一项，取决于主网 preconf 车道的实际配置。

---

## 外部调研 / 用户资料中被修正的地方

1. **GPT：“Mantle 官方早在 2025 年 2 月 13 日就宣布 Chainlink Data Feeds 和 Data Streams 上线”**。基本正确，需补两点：
   - 引用的 URL（mantle.xyz/blog/announcements/mantle-network-joins-chainlink-scale）在 2026-10-13 直接访问时返回的是**首页**（canonical 为 www.mantle.xyz），原文只能从搜索引擎缓存看到。缓存显示“13 Feb, 2025 … Chainlink Data Feeds & Data Streams Now Live”。Chainlink 生态页把同一事件记为 2025-02-14 [12][13]。
   - Mantle 官方 Oracles 文档页至今没有列出 Chainlink [20]。
2. **GPT：“Pyth 官方 EVM 部署列表也列出了 Mantle”**。列出了，但：
   - 该句在 GPT 正文里引用的是 Mantle 博客，不是 Pyth 文档，属于引用错配；
   - **已过时**：Mantle 不在 2026-08-26 的 Pyth Core 升级名单里，没有 upgraded Core 地址，也没有 Pyth Pro 地址；Hermes 自 cutover 起要 API key [18][19]。
3. **GPT：“Chainlink Data Streams，包括低延迟数据与流动性加权买卖价信息”**。需要更精确：v3 schema 里的 bid/ask 是“Simulated buy/sell impact price at X% liquidity depth”，不是像 HyperCore BBO 那样的盘口最优价 [15]。另外 Streams Trade（StreamsLookup / Automation 链上取数）不支持 Mantle，Mantle 上只能链下拉取再链上验证 [14]。
4. **GPT 没提到入金路径的关键差异**。Papertrade 的跨链入金依赖 Circle CCTP（HyperEVM 是原生 USDC、CCTP domain 19），而 Mantle 上的 USDC 是标准桥桥接版，CCTP 不支持 Mantle [28][29][30]。GPT §5–6 说“Mantle 已经有价格基础”，却没有提出出入金这一项缺口。
5. **GPT 的“共享价格源需要生态层风险监测”等设计建议**：是建议，不是现网能力，本 lane 不作为事实采用。
6. **Grok：“这在大多数链上很难做到（直接、可信地读取实时订单簿状态）”**。对 Mantle 成立：Mantle 没有原生订单簿状态可读（X-Q2c）。
7. **GPT：“Vault perps 与 fully onchain perps 不互斥”**：属于观点，与事实无冲突，不修正。

## 来源

1. **PRIMARY** Papertrade Docs《Architecture overview》，https://docs.papertrade.xyz/ （快照 papertrade-docs-2026-10-12.md，访问 2026-10-12）。证明合约组成、BatchExecutor 只接受 relayer、PriceOracle 封装 BBO / Mark / Oracle 预编译、CoreWriter 用法。
2. **PRIMARY** Papertrade Docs《Pricing: BBO precompile》（同上）。证明 BBO 预编译 `0x…080e`、mid 计算、无偏离熔断、只拒绝 0 值和交叉盘口。
3. **PRIMARY** Papertrade Docs《Risk》（同上）。证明 BBO jitter 风险、OI cap 策略、公开维护路径、管理角色。
4. **PRIMARY** Papertrade Docs《Liquidations》（同上）。证明 hard bust、约 5 bps 缓冲、项目方 keeper 付更高 priority fee 以优先上链。
5. **PRIMARY** Papertrade Docs《Deposits: CREATE2 proxies》《Deposits and withdrawals》《Quick start》（同上）。证明 CREATE2 存款地址、sweeper 流程、CCTP / Across 路由和支持的来源链。
6. **PRIMARY** Papertrade Docs《Session keys》《FAQ》（同上）。证明 session key 权限（30 天 / 1 小时）、relayer 代付、撤销需 HYPE。
7. **PRIMARY** Papertrade Docs《The LP and the payout queue》《Solvency & queue》（同上）。证明 LP 从 0 自举、不接受直接存入、FIFO 队列。
8. **PRIMARY** Papertrade Docs《Contract addresses》（同上）。证明抵押品是 HyperEVM 上的 Circle 原生 USDC `0xb883…630f`。
9. **PRIMARY** Hyperliquid Docs《Interacting with HyperCore》，https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm/interacting-with-hypercore 。证明读预编译的语义（块构建时最新 HyperCore 状态）和 gas 公式。
10. **PRIMARY** Hyperliquid Docs《Dual-block architecture》，https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm/dual-block-architecture 。证明快块 1s / 3M gas、慢块 1min / 30M gas；该页不涉及块内排序。
11. research-hub 报告 application-specific-sequencing 的 notes-mantle.md（其一手来源见该文件 [1]–[19]，访问 2026-10-11）。证明 Mantle 2s 出块、私有池、小费排序、preconf FIFO 车道、Arsia、路线图、meta-tx、Skadi 后允许 SetCode。
12. **PRIMARY** Mantle Blog “Mantle Network Joins Chainlink Scale: Chainlink Data Feeds & Data Streams Now Live”（13 Feb 2025），https://www.mantle.xyz/blog/announcements/mantle-network-joins-chainlink-scale 。原文经搜索引擎缓存读取；2026-10-13 直接访问返回首页。证明 2025-02-13 官方宣布 Data Feeds 和 Data Streams 上线，以及“sub-second”“Liquidity-weighted bid-ask spreads”等宣传口径。
13. **PRIMARY** Chainlink Ecosystem — Mantle，https://www.chainlinkecosystem.com/ecosystem/mantle （搜索索引快照；直接抓取只拿到通用页面）。证明集成时间线：CCIP 2024-12-03、Data Feeds/Streams 2025-02-07 和 02-14、CRE 2026-03-20、CCIP 迁移 2026-07-09。
14. **PRIMARY** Chainlink Docs《Data Streams Supported Networks》，https://docs.chain.link/data-streams/supported-networks 。证明 Streams Trade 只支持 7 条链，不含 Mantle；Verifier 地址表为动态渲染，未抓到。
15. **PRIMARY** Chainlink Docs《Report Schema v3》，https://docs.chain.link/data-streams/reference/report-schema-v3 。证明 v3 字段，以及 bid/ask 是“模拟 X% 深度冲击价”。
16. **PRIMARY** Chainlink Data — MNT/USD 和 USDe/USD（Mantle Mainnet），https://data.chain.link/feeds/mantle/mantle/mnt-usd 、…/usde-usd （搜索快照）。证明 Mantle 上有推送 feed，偏离阈值 0.5%。
17. **PRIMARY** Chainlink Changelog，https://dev.chain.link/changelog （Data Streams 条目的网络列表含 Mantle）。证明 Mantle 在 Data Streams 支持网络之列。
18. **PRIMARY** Pyth Docs《Contract Addresses on EVM》《Upgraded contracts》，https://docs.pyth.network/price-feeds/core/contract-addresses/evm 、https://docs.pyth.network/price-feeds/core/upgrade/contracts 。证明 Mantle 的 Core（current）地址是 `0xA2aa…5B5729`，Mantle 不在升级名单，没有 Pro 部署。
19. **PRIMARY** Pyth Docs《Preparing for the upgrade》，https://docs.pyth.network/price-feeds/core/upgrade/preparing 。证明 cutover 时间 2026-08-26 16:00 UTC、Hermes 需要 API key；未说明未升级链的处置。
20. **PRIMARY** Mantle Docs《Oracles》，https://docs.mantle.xyz/network/for-developers/resources-and-tooling/oracles.md 。证明官方列出的是 API3、Chronicle、ORA、Pyth、RedStone、Supra，没有 Chainlink。
21. **PRIMARY** Stork Docs《EVM contract addresses》，https://docs.stork.network/resources/contract-addresses/evm 。证明表中没有 Mantle。
22. **PRIMARY** RedStone Blog“#RedStonePowered ep.10: Mantle”（2023-01-18）。证明 RedStone 已接入 Mantle（pull 模型）。
23. **PRIMARY** Mantle Docs《Mantle v2 v1.3.1 – Skadi Upgrade》，https://docs.mantle.xyz/network/for-node-operators/network-updates/changelogs/mantle-v2-v1.3.1-skadi-upgrade.md 。证明 Skadi 对齐 Prague、包含 EIP-7702、是主网必升版本。
24. Messari Intel“v1.3.1 Mantle Network Mainnet Skadi Upgrade”（Event Date 2025-08-27），以及 Bitget News 转引的 @0xMantleDevs 推文（2025-08-27）。证明 Skadi 主网完成日期（二手来源）。
25. **PRIMARY** Mantle Docs《Account Abstraction》，https://docs.mantle.xyz/network/for-developers/resources-and-tooling/account-abstraction.md 。证明官方推荐 Etherspot（4337）和 Particle。
26. **PRIMARY** Pimlico Docs《Supported Chains》，https://docs.pimlico.io/guides/supported-chains 。证明 bundler / paymaster 支持 Mantle 5000 和 Mantle Sepolia 5003。
27. **PRIMARY** ZeroDev Docs《Supported Networks》，https://docs.zerodev.app/sdk/faqs/chains 。证明支持 Mantle 主网和测试网。
28. **PRIMARY** Circle Docs《CCTP Supported blockchains and domains》，https://developers.circle.com/cctp/concepts/supported-chains-and-domains 。证明 CCTP 不含 Mantle，HyperEVM 是 domain 19。
29. **PRIMARY** Circle Docs《USDC contract addresses》，https://developers.circle.com/stablecoins/usdc-contract-addresses.md 。证明原生 USDC 列表中没有 Mantle。
30. **PRIMARY** Mantle Token List，https://token-list.mantle.xyz/mantle.tokenlist.json （timestamp 2026-09-24）。证明 USDC 走标准桥映射，USDT 有标准桥和 USDT0 两种，USDe 走 LayerZero / Stargate。
31. **PRIMARY** USDT0《Tether, on Mantle》，https://usdt0.to/ecosystem/mantle ；以及 Bybit 新闻稿（2025-11-27，EQS / PRNewswire）。证明 USDT0 地址、当前供应 $439.91M、LayerZero 和 Attestation 安全模型、Bybit 支持 Mantle USDT0 充提。
32. **PRIMARY** Across legacy docs《Supported Chains》，https://legacy-docs.across.to/reference/supported-chains ；0x Docs《Supported Chains and Providers》，https://docs.0x.org/docs/introduction/supported-chains （第三方整理）。证明 Across 链表没有 Mantle，0x 表中 Mantle 的 Across 为 ❌、Relay / CCIP / OFT 为 ✅。
33. Mantle 新闻稿（PR Newswire 2026-07-09，经 Manila Times 转载）与 CoinDesk 2026-07-09 报道。证明 Super Portal（与 Bybit 共建）从 LayerZero 迁到 CCIP。属于官方新闻稿加媒体报道。
34. **PRIMARY** mantle.xyz 首页（2026-10-13 抓取）。证明国库 $2,340,872,192（As of Oct 12, 2026 15:47 UTC）、Real World Capital $771M、USDG / USDT0 / USDC 相关动态。
35. DefiLlama（KTX.Finance perps 页 https://defillama.com/protocol/perps/ktx.finance ；TsunamiX https://investors.defillama.com/protocol/tsunamix ）及 three.ws 的 Mantle 协议榜（转引 DefiLlama）。证明 Mantle 永续协议的 TVL / 成交量量级。属于聚合数据。
36. IntentX App 公告，https://app.intentx.io/account/overview 。证明 IntentX 2026-01-08 停止交易。
37. truenorth-lj/crypto-project-security-skill `docs/examples/vertex-perps.md`（二手）。证明 Vertex（含 Mantle 实例）2025-08-14 停运。未找到一手公告。
38. **PRIMARY** KTX.Finance 官网，https://www.ktx.finance/ 。证明 KLP 池做交易对手方，支持 MNT 等市场。
39. 外部调研（ChatGPT Deep Research）`research/papertrade-deep-dive.md`。只作线索，见“被修正的地方”。
40. usdc.cool《Mantle Bridge | Bridged USDC》，https://usdc.cool/bridges/mantle-bridge 。证明 Mantle Bridge 上桥接 USDC 约 $12.8M（第三方快照）。

## 命令与输出

无 bash。关键抓取记录：
- `fetch_content(raw) https://www.mantle.xyz/blog/announcements/mantle-network-joins-chainlink-scale` → 返回首页 HTML，`<link rel="canonical" href="https://www.mantle.xyz"/>`，标题 “Mantle | Institutional Infrastructure for Real-World Assets”（2026-10-13）。
- `fetch_content https://docs.pyth.network/price-feeds/core/upgrade/contracts` → Mantle 行：Core (current) `0xA2aa...5B5729` | Core (upgraded) `—` | Pyth Pro `—`。
- `fetch_content https://developers.circle.com/cctp/concepts/supported-chains-and-domains` → domain 表 0–37，不含 Mantle；`19 | HyperEVM`。
- `fetch_content https://token-list.mantle.xyz/mantle.tokenlist.json` → USDC 5000：`0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9`，`optimismBridgeAddress: 0x4200…0010`。
- `fetch_content(raw) https://raw.githubusercontent.com/mantle-xyz/networks/main/mainnet/rollup.json` → `"block_time": 2`、`"l2_chain_id": 5000`，没有 skadi_time 字段。

## 开放问题

1. Chainlink Data Streams 在 Mantle 上的 VerifierProxy 地址、可用 stream 列表（BTC/USD、ETH/USD 是否有 v3）、实测端到端延迟。
2. Pyth 旧 Core 合约在未升级链（含 Mantle）上是否仍持续更新、何时下线？Mantle 是否计划加入升级或部署 Pyth Pro？
3. 主网 preconf FIFO 车道是否启用，能否开放给清算 keeper 或应用级车道（承接 ASS notes-mantle 开放问题 1）。
4. HyperEVM 块内是否真的按 priority fee 排序（Papertrade 清算优先的前提），需要 HyperEVM lane 核实。
5. Circle 是否有在 Mantle 原生发行 USDC、接入 CCTP 的公开计划（未查到）。
6. KTX、TsunamiX 在 Mantle 上用的预言机（未拿到一手来源）。
7. 是否存在 Bybit 来源的链上价格 feed，或 Chainlink 单交易所 top-of-book stream 中的 Bybit 选项。
8. Mantle 上 1000× 杠杆可承受的“价格年龄 + 执行窗口”，需要实测 2s 出块下预言机报告到上链的 P95 / P99。

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| X1 | Papertrade 执行价是 HyperCore BBO 预编译（0x…080e）返回的 (bid+ask)/2 | [2] Papertrade Docs《Pricing: BBO precompile》代码段 | observed | |
| X2 | Papertrade PriceOracle 只拒绝 0 值和交叉盘口，没有偏离、TWAP 或回看熔断 | [2]《Pricing》“No deviation breaker”节 | observed | |
| X3 | HyperEVM 读预编译的值与 EVM 块构建时最新的 HyperCore 状态一致 | [9] Hyperliquid Docs《Interacting with HyperCore》原文 | observed | |
| X4 | HyperEVM 快块 1 秒 / 3M gas，慢块 1 分钟 / 30M gas | [10] Hyperliquid Docs《Dual-block architecture》 | observed | |
| X5 | Papertrade 清算 keeper 由项目方运营，付比其他协议交易更高的 priority fee 以优先上链 | [4]《Liquidations》“Who runs the keepers” | observed | |
| X6 | Papertrade 的开平仓只能经 relayer 和 BatchExecutor 提交；session key 和 relayer 代付都是应用自建 | [1]《Architecture overview》；[6]《Session keys》 | observed | |
| X7 | Papertrade 存款用 CREATE2 per-user proxy，sweeper 经 CoreWriter 把 USDC 推进 Exchange 的 HyperCore 账户 | [5]《Deposits: CREATE2 proxies》 | observed | |
| X8 | Papertrade 跨链入金依赖 Circle CCTP 和 Across（Robinhood Chain 来源） | [5]《Deposits: CREATE2 proxies》“Your own deposit address” | observed | |
| X9 | Papertrade 抵押品是 HyperEVM 上的 Circle 原生 USDC（0xb883…630f） | [8]《Contract addresses》；[29] Circle 地址表 HyperEVM 行 | observed | |
| X10 | 在 Papertrade 各依赖中，只有同链原生订单簿价格读取（及 CoreWriter 账本）必须由 HyperCore 提供，其余为应用自建或第三方 | 由 X1、X3、X6、X7、X8 推出：只有价格读取和 CoreWriter 依赖 HyperCore，其余组件均写明是应用或第三方 | inferred | |
| X11 | Mantle 主网 2 秒出块、单一 sequencer、私有交易池 | [11] ASS notes-mantle M4、M5；rollup.json `"block_time": 2`（本次 raw 抓取） | observed | |
| X12 | Mantle op-geth 普通交易按有效小费降序、同价按到达时间排序；Arsia 后才有竞价意义 | [11] ASS notes-mantle M6、M14 | observed | |
| X13 | Mantle 客户端已有白名单 from×to 的 FIFO preconf 车道，排在小费排序交易之前；主网是否启用无一手来源 | [11] ASS notes-mantle M13、M17、M18、M21、M22 | observed | |
| X14 | Papertrade 式“清算付更高小费以先上链”在 Mantle 普通车道可成立，但 preconf 车道交易会排在其前 | 由 X12、X13 推出：小费只在非 preconf 部分决定顺序 | inferred | |
| X15 | Mantle 路线图 2026 H2（未勾选）列出 Flashblocks 亚秒预确认、pure Reth、Prop AMM 撤单优先 | [11] ASS notes-mantle M26–M28 | observed | |
| X16 | Mantle 官方博客 2025-02-13 宣布加入 Chainlink Scale，Data Feeds 和 Data Streams “Now Live” | [12] 博客原文（搜索缓存）“13 Feb, 2025 … Now Live” | observed | |
| X17 | 上述 Mantle 博客 URL 在 2026-10-13 直接访问返回首页，原文只能从缓存核对 | 命令与输出：raw 抓取 canonical=https://www.mantle.xyz | observed | |
| X18 | Chainlink 生态页把 Mantle 加入 Scale 记为 2025-02-14，另有 2025-02-07 “Mantle integrates Chainlink Data Feeds and Data Streams” | [13] Chainlink Ecosystem Mantle 页时间线（搜索快照） | observed | |
| X19 | Chainlink Streams Trade（StreamsLookup / Automation 链上取数）只支持 Arbitrum、Avalanche、Base、BNB、Ethereum、Optimism、Polygon，不含 Mantle | [14] Data Streams Supported Networks “Streams Trade implementation” 节 | observed | |
| X20 | 在 Mantle 上用 Data Streams 只能链下拉取报告、再由链上 VerifierProxy 验证 | 由 X16、X19 推出：Data Streams 已支持 Mantle，但不含 Streams Trade | inferred | |
| X21 | Data Streams v3 的 bid/ask 定义为“Simulated buy/sell impact price at X% liquidity depth”，不是单一盘口最优价 | [15] Report Schema v3 字段表 | observed | |
| X22 | Chainlink 在 Mantle 主网有推送 feed MNT/USD、USDe/USD，偏离阈值 0.5% | [16] data.chain.link Mantle feed 页（搜索快照） | observed | |
| X23 | Pyth EVM 地址表列出 Mantle 主网 Core（current）0xA2aa501b19aff244D90cc15a4Cf739D2725B5729 | [18] Pyth Contract Addresses EVM 页 Mantle 行 | observed | |
| X24 | Mantle 不在 2026-08-26 Pyth Core 升级名单中，也没有 Pyth Pro 部署 | [18] Upgraded contracts 页 Mantle 行 “— / —”；EVM 页列于 “Chains not in the upgrade” | observed | |
| X25 | Pyth 自 2026-08-26 16:00 UTC cutover 起 Hermes 需要 API key | [19] Preparing for the upgrade 原文 | observed | |
| X26 | Mantle 官方 Oracles 文档列出 API3、Chronicle、ORA、Pyth、RedStone、Supra，没有列出 Chainlink | [20] Mantle Docs《Oracles》 | observed | |
| X27 | Stork 的 EVM 地址表没有 Mantle | [21] Stork Docs EVM contract addresses | observed | |
| X28 | Mantle 链上没有类似 HyperCore 的原生撮合状态或读预编译 | 由 X11–X13 及 [11] 源码阅读推出：Mantle 客户端改动只涉及 preconf、费用、BVM_ETH、meta-tx，无交易所状态预编译 | inferred | |
| X29 | 未找到 Bybit 价格的官方链上 feed | [33][31] Mantle–Bybit 合作公开内容仅为 Super Portal 和 USDT0；本次检索无结果 | speculative | |
| X30 | Skadi（v1.3.1）是 Mantle 主网必升版本，对齐 Prague，op-geth 包含 EIP-7702 SetCode TX | [23] Mantle Docs Skadi v1.3.1 changelog | observed | |
| X31 | Skadi 主网于 2025-08-27 完成 | [24] Messari Event Date；Bitget 转引 @0xMantleDevs 推文（二手） | observed | |
| X32 | Mantle 派生规则在 Skadi/Isthmus 之后允许 SetCode 交易 | [11] ASS notes-mantle M11（batches.go:176-189@da45c315d8） | observed | |
| X33 | Pimlico 的 bundler / paymaster 支持 Mantle（5000）和 Mantle Sepolia（5003） | [26] Pimlico Supported Chains 表 | observed | |
| X34 | ZeroDev 支持 Mantle 主网和测试网；Mantle 官方 AA 页推荐 Etherspot（4337）和 Particle | [27] ZeroDev Supported Networks；[25] Mantle Docs《Account Abstraction》 | observed | |
| X35 | Papertrade 的 session key + relayer 代付模式可原样迁移到 Mantle，gas 由 relayer 用 MNT 支付 | 由 X6、X30、X33 推出：这些是应用自建组件，Mantle 具备 7702 和 4337 基础设施 | inferred | |
| X36 | Mantle 上的 USDC（0x09Bc…0dF9）经 OP 式标准桥从以太坊 USDC 桥接而来 | [30] Mantle token list USDC 条目 optimismBridgeAddress | observed | |
| X37 | Circle 原生 USDC 地址表不含 Mantle | [29] Circle USDC contract addresses 主网表 | observed | |
| X38 | Circle CCTP 支持链和 domain 表不含 Mantle；HyperEVM 是 domain 19 | [28] Circle CCTP Supported blockchains and domains | observed | |
| X39 | Papertrade 依赖的“原生 USDC + CCTP 入金”在 Mantle 缺失 | 由 X8、X36–X38 推出 | inferred | |
| X40 | Mantle 上的 USDT0（0x779D…3736）为 LayerZero OFT，官方页显示当前供应约 $439.91M（2026-10-13 访问） | [31] usdt0.to Mantle 页；[30] token list USDT0 条目 | observed | |
| X41 | Mantle 上的 USDe / sUSDe 经 LayerZero / Stargate 映射 | [30] token list USDe 条目 thirdparty 扩展 | observed | |
| X42 | Across 的链表（legacy docs）不含 Mantle；0x 第三方表中 Mantle 的 Across 为 ❌、Relay / CCIP / OFT 为 ✅ | [32] Across legacy Supported Chains；0x Supported Chains and Providers | observed | |
| X43 | Mantle Super Portal（与 Bybit 共建）于 2026-07-09 起从 LayerZero 迁到 Chainlink CCIP（MNT 采用 CCT 标准） | [33] Mantle 新闻稿（PR Newswire 2026-07-09）；CoinDesk 同日报道 | observed | |
| X44 | Mantle 官网显示国库约 $2.34B（As of 2026-10-12 15:47 UTC） | [34] mantle.xyz 首页 Treasury 数字 | observed | |
| X45 | Mantle 国库可作为 Papertrade 式 LP 的种子资本来源 | 未验证的设想，基于 X44；无任何官方表述 | speculative | |
| X46 | KTX.Finance 以 KLP 池作为交易对手方（GMX 式 vault 对手方永续），部署在 Mantle 等链 | [38] KTX 官网“LPs act as a counterparty to traders” | observed | |
| X47 | 按 DefiLlama 数据，KTX 累计永续成交量 Mantle 占 $6.511B，但 Mantle 上 TVL 只有约 $14.5K | [35] DefiLlama KTX perps 页；three.ws 转引 DefiLlama 榜单（聚合数据，时点不一） | observed | |
| X48 | IntentX（SYMMIO 前端，曾在 Mantle）于 2026-01-08 永久停止交易 | [36] IntentX App 公告 | observed | |
| X49 | Vertex（含 Mantle Edge 实例）于 2025-08-14 停运 | [37] 二手审计文档；未找到一手公告 | speculative | |
| X50 | Mantle 当前永续需求很弱，不足以作为复现的现成需求来源 | 由 X47、X48 推出：现存协议 TVL 很小、多家停运 | inferred | |
| X51 | KTX 和 TsunamiX 在 Mantle 上使用的预言机本次没有一手来源 | [38][35] 官网和聚合页均未说明预言机 | observed | |
| X52 | 对照结果：同链原生价格状态“缺”（链级）；原生 USDC / CCTP “缺”（取决于发行方）；价格可验证输入、排序、快速跨链“部分有”；AA / 7702 / paymaster、CREATE2 “有” | 由 X10、X14、X20、X28、X35、X39、X42 推出 | inferred | |
| X53 | Papertrade 那种“攻击者在单一 venue 挂单扭曲 BBO”的攻击面，在改用多源聚合预言机后不直接存在，但会换成报告选择和延迟类风险 | 由 X2、X20、X21 推出：预言机为多源 DON 中位数和签名报告，应用可以选择提交哪份报告 | inferred | |
| X54 | GPT 调研中“Pyth 官方 EVM 部署列表列出 Mantle”一句，引用的链接实为 Mantle 博客，属于引用错配 | [39] GPT 调研 §5.2 原文与链接 | observed | |

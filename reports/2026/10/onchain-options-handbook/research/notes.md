# notes：Onchain Options Handbook（索引与综合）

本报告的调研分四路，外加主会话的核查与综合。台账前缀对应如下：
- **B** → `notes-basics.md`：期权基础（规格、定价、Greeks、parity、结构、保证金），Deribit 实时数据
- **E** → `notes-ecosystem.md`：Jeff Yan / Hyperliquid HIP-4，链上期权演进、协议对照、市场数据、难点、RFQ 流程（子 agent 写入落在产物目录，由主会话复制）
- **W** → `notes-worldmarkets.md`：World Markets 论文逐节解读、数字分级、复算与核查
- **X** → `notes-mantle.md`：Mantle 资产与基础设施、RWA 期权难题、传统市场参照、候选方向与能力对照
- **S** → 本文件 §综合：主会话的补充核查（observed）与跨路推论（inferred / speculative）

外部调研 `onchain-options-handbook.md`（ChatGPT Deep Research）只当线索使用。四路子 agent 的运行环境没有 shell，数值是手算的；主会话已用 python 运行 `scripts/bs.py`、`scripts/wm_check.py` 全部复核（B34–B36、W27–W30、W33 改为 observed）。

## 每个研究问题的一句话答案

1. **期权入门**：期权把“方向”之外的“收益形状”变成可交易对象；价格 = 内在价值 + 时间价值，由 IV 决定；卖方的风险来自 gamma，delta 对冲后盈亏 ≈ ½ΓS²(实现方差 − 隐含方差)。统一示例（ETH 2500、30 天、σ 60%）：ATM call = put = $171.35；covered call ≡ short put（B 全路）。
2. **Jeff Yan**：他没有宣布 Hyperliquid 做期权。他说期权与 perps“高度互补”，凸性产品在加密里还没达到 escape velocity；HIP-4（outcome markets，2026-05-02 主网，全额抵押、有界、无清算）是“构建期权协议的一条清晰路径”，由第三方 builder 去做（E1–E9）。
3. **链上期权生态**：五代路线（保险式 → DOV → AMM+对冲 → 永续/凸性 → 链下撮合链上结算 + 组合保证金）。2026-10 链上期权 30 天名义 $5.07B，Derive 占 83.7%（权利金 91.2%）；Deribit OI 约是 Derive 的 25 倍。难点在做市商的风险与资本成本，不在撮合（E10–E65）。
4. **World Markets 论文**：核心是“期权流动性可以由现货 + 定期融资 + 反向期权组装”，组合保证金让做市商只为剩余风险出资本。模型数字全部能复算（含 Table 4b），但关键前提（等量对冲期权可得）是假设，基准是已迁移的 Derive V2 最优一档；World 的期权仍是 “Coming soon”。没找到社区讨论的证据（W 全路、S1–S3）。
5. **Mantle 机会**：Mantle 有“标的 + 结算币 + 现货 RFQ”（xStocks 原生发行、xChange RFQ、Aave V3），缺“风险承接层”（期权协议 $0、永续 $0、Aave 不收 xStocks/mETH）。建议：全额抵押的持仓者保护/收益结构 + RFQ，与 RWA 结算/公司行动适配层并行；复制型组合保证金 venue 后置（X 全路、S4–S8）。

## 资料中被修正的地方（汇总）

- **GPT 没读到论文**：已取得全文（W）。
- **GPT 漏了 HIP-4**：Hyperliquid 的“类期权”就是 HIP-4 outcome markets（E10–E14）。
- **CryptoBriefing“Hyperliquid 将上线期权”**：与访谈不符，是误读（E9）。
- **Derive 架构已过时**：Derive V3 于 2026-10-07 上线，ZK 交易所 + Ethereum L1 结算；V2 期权最近一周无成交（E、W）。
- **Alea 的利益披露**：Alea 维护 Derive 的 Data Room，GPT 没提（E）。
- **Ithaca / Stryke / Premia** 被当作现行设计：前两者近 30 天几乎无成交，Premia 已更名 Kyan（E）。
- **“首个 RWA 期权”**：Bybit 2026-06-12 早于 Derive 07-24 上线 XAUT 期权；Coincall 有 SPY/QQQ 期权（X）。
- **USDY on Mantle**：是 USDY + mUSD，不是 rUSDY（X）。
- **mStocks**：只有媒体与转载来源；媒体称发行人为 Halo Prime（BVI），limited-recourse 结构（X9，speculative）。
- **Merton 关系**：债权 = PV(K) − put，不是 K − put（B）。
- **Deribit 结算**：2026 年起 ITM 期权先结算成期货再现金结算，经济上等价（B）。
- **lane W 的手算推断“Table 4b 含摩擦与融资”是错的**：python 精确复算表明是纯盯市压力亏损（W30）。
- **论文 DEX 输入**：同一 30 天窗口（截至 10-12）DefiLlama 现值约 $288.0B，论文写 $246.6B，相差约 17%，原因不明（S1）。

## 综合（S）

### S-核查（主会话 2026-10-16 运行）

```
curl -s "https://api.llama.fi/overview/dexs?excludeTotalDataChartBreakdown=true"  → 按日加总 totalDataChart
  截至 2026-10-11: $286.15B；截至 10-12: $288.04B；截至 10-15: $287.80B
curl -s https://api.llama.fi/protocol/aave-v3   → chainTvls.borrowed: 10-12 $12.112B（论文 $12.15B）
curl -s https://api.llama.fi/protocol/morpho    → chainTvls.borrowed: 10-12 $5.767B（论文 $5.78B）
curl -s "https://api.llama.fi/overview/options?...&dataType=dailyNotionalVolume" → total30d 5,074,065,817.93；Mantle 链下只有 Stryke CLAMM（0）
HIP-4 docs（hyperliquid.gitbook.io）："useful for applications such as prediction markets and bounded options-like instruments"
docs.world.inc ATLAS："lent capital contributes 98% of its value to your available margin"
python3 scripts/bs.py / scripts/wm_check.py → 见 notes-basics §8、notes-worldmarkets C10
```

### S-推论

- **S4 瓶颈在风险承接**：链上期权的撮合问题已被链下撮合 + 链上结算解决（Derive V3、Paradex），剩下的约束是做市商的对冲渠道与资本成本（E 的难点分析、W 的容量公式 min(对冲期权, 现货, 融资, 剩余风险)）。
- **S5 parity 视角下 Mantle 缺的是“凸性来源”**：Mantle 有现货（薄）与借贷（不收 RWA），没有任何期权或永续流动性，因此 World 式“组装流动性”在 Mantle 上没有原料可组装（由 W 借鉴 1、X 对照表推出）。
- **S6 全额抵押、有界收益结构是 Mantle 的可行起点**：不需要组合保证金、不依赖链上深度现货；做市商在链下（CEX/券商）定价与对冲，链上只验证签名、锁抵押、按规则结算（由 B 的保证金、E 的 Rysk/Thetanuts 流程、X 的能力对照推出）。
- **S7 RWA 期权的工程重点是“时钟”和“单位”**：fixing 时钟（24/7 链上 vs 24/5 标的 vs 周末不更新的 price）、单位（multiplier、ERC-4626 封装）、权限（pause、制裁名单）必须写进合约规格（由 X-Q2 推出）。
- **S8 Hyperliquid 路线的启示（推测）**：Hyperliquid 先做通用原语（HIP-3、HIP-4、组合保证金），把期权留给 builder；Mantle 的对应物可能是“RWA 结算适配层 + RFQ 结算合约”这类原语，再吸引期权 builder。这是类比推测，没有证据表明 Mantle 采用这一策略。

## 开放问题

1. 访谈 11:46–18:19 段的逐字稿没拿到；Jeff 的“builder 会做期权”只有中文媒体转述。
2. 论文 DEX 输入与 DefiLlama 现值相差 17% 的原因。
3. Mantle 上 xStocks 的期权需求与做市意愿：没有任何一手数据，需要访谈做市商（Orbit Markets 等已在 Bybit 为 XAUT 期权做市）。
4. Chainlink 股票 Data Streams 是否在 Mantle 开通；mStocks 的规格与权限。
5. 链上期权买卖方向结构（零售是否以卖方为主）缺统计。

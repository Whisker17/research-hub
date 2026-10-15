# Lane X：Mantle 机会 —— 前缀 X，产出 notes-mantle.md

先读 lane-common.md。本路回答 brief 研究问题 5。读者是 Mantle 的研究员与开发者；建议要标明是建议，不是 Mantle 现网能力或路线承诺。

## 必读
- <报告目录>/../papertrade-deep-dive/research/notes-mantle.md：上一份报告（2026-10）已核查过的 Mantle 能力（排序、预言机、AA、稳定币/CCTP 等）。可以转引，但关键事实请抽查是否仍成立，并注明“转引自 papertrade-deep-dive notes-mantle Xn”。
- 外部调研 research/onchain-options-handbook.md 第七、八、九节（RWA 期权难点与 Mantle 建议）——当线索。

## 要回答
1. Mantle 现有与期权相关的资产与基础设施（截至 2026-10-16，每项一手来源）：
   - 代币化股票：xStocks（Backed/Kraken）在 Mantle 的部署与可用标的；mStocks（Bybit × Mantle，计划 2026-11 上线？核实 Bybit/Mantle 官方公告原文与条件）；其他 tokenized stocks/ETF（如 Ondo Global Markets 是否在 Mantle）。
   - RWA/收益资产：USDY / mUSD（Ondo）、mETH/cmETH（Mantle LSP）、FBTC、Mantle Index Four (MI4) 或其他 Mantle RWA 叙事产品；它们的 TVL 量级（DefiLlama）。
   - 借贷与 DEX：Mantle 上主要借贷（Aave 是否部署在 Mantle？Lendle、Init Capital 等）、DEX（Agni、Merchant Moe、Fluxion 等）的 TVL/成交量级；是否有定期借贷市场。
   - 预言机：Chainlink/Pyth/RedStone/API3 等对股票/RWA 价格源的支持情况。
   - Mantle 生态里已有/曾有的期权或结构化产品（搜 DefiLlama options 分类 chain=Mantle、Mantle 生态页、项目公告），没有就写没有。
2. RWA 期权的特有难题（用一手来源支撑）：交易时段与 24/7 链上价格（xStocks 的 24/7 交易与价格源说明）、公司行动（xStocks multiplier 文档：拆股/分红如何反映）、发行人权限（冻结/黑名单/转让限制，看 xStocks / Backed 合约或文档）、基差（token 与股票价格差，有无数据）、申赎资格（KYC/非美国人限制）。
3. 传统市场参照：美国个股/ETF 期权市场的规模与零售结构（OCC 年度数据、0DTE 占比），说明“股票期权需求大”这件事的来源；以及链下 tokenized stock 期权是否已有人做（例如 Derive/其他平台上的股票或 RWA 期权、CEX 的股票期权或 TradFi perps 动向）。
4. 候选方向与前置条件：对每个方向列出 需求方 / 卖方或做市方 / 需要的 Mantle 能力 / 现状（有·部分有·缺）/ 主要风险：
   a. 持仓者保护与收益结构（protective put、covered call、collar）+ RFQ（参照 Rysk V12、Thetanuts V4 的模式）；
   b. RWA 结算与公司行动适配层（作为基础设施供多个期权应用复用）；
   c. 复制型/组合保证金 venue（World Markets 论文思路：现货 DEX + 借贷 + 期权同一保证金账本）；
   d. 接入外部成熟期权市场（Derive 等）做分发 vs 原生在 Mantle 结算；
   e. 以 mETH/cmETH、USDY 为抵押或收益来源的结构化产品。
   给出你的优先级判断（inferred/speculative，写明理由）。
5. Mantle 能力逐项对照表数据（能力 / 期权需要它做什么 / Mantle 现状 / 有·部分有·缺 / 来源）。

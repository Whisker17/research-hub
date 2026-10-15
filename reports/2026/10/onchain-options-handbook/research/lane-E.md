# Lane E：Jeff Yan 观点 + 链上期权生态 —— 前缀 E，产出 notes-ecosystem.md

先读 lane-common.md。本路回答 brief 研究问题 2 和 3。

## 问题 2：Jeff Yan / Hyperliquid
- 核实 Blockworks Empire 节目《Jeff Yan On Hyperliquid's Plan To Bring All Finance Onchain》（约 2026-10-07）：找节目页、YouTube 版本、文字稿或可靠摘要（X 上的剪辑/引述）。尽量拿到他关于期权（options）原话或接近原话的内容与时间戳。可尝试 fetch_content 拉 YouTube 字幕（fetch_content 支持 YouTube transcripts）。拿不到原话就如实写“只核实到章节标题”。
- Hyperliquid 是否有已公开的期权/类期权计划或产品：HIP-3（builder-deployed perps）、HIP-4（outcome/事件合约？请核实编号与内容）、任何官方 docs / 公告中关于 options 的内容。只写有来源的。
- Hyperliquid 现有能力中对期权有用的部分（portfolio margin、HyperEVM 上的期权协议，如有）。

## 问题 3：链上期权生态
1. 演进时间线（每项给年份与一手来源）：Opyn（v1 2020 保险型 put → Squeeth 2022 power perp → 后续）、Hegic（AMM 池卖方）、Ribbon（DOV，2021 爆发，后并入 Aevo）、Lyra（AMM + delta hedge，后改名 Derive，迁移到 Derive Chain / 订单簿 + RFQ）、Dopex（SSOV → CLAMM → 改名 Stryke）、Premia、Panoptic（基于 Uniswap v3 LP 的永续期权，主网上线时间）、Aevo、Paradex（永续期权 → dated options？请核实）、Thetanuts（V3 vault → V4 OptionBook）、Rysk（V12 RFQ）、Ithaca、SOFA、Zeta/Drift（Solana）、Typus（Sui）等。重点：每条路线**踩过的坑**（DOV 收益被做市商吃掉 / 卖波动率长期负收益、Lyra LP 亏损、Dopex rDPX 设计问题、Hegic 池亏损、Opyn 2020 漏洞事件等），每个坑要有来源。
2. 当前主要协议对照（截至 2026-10）：架构（订单簿/RFQ/AMM/DOV/永续期权/批量拍卖）、所在链、保证金模型（全额/组合）、结算（现金/实物；欧式/美式）、主要标的、是否支持 RWA（如 Derive 的 XAUT 期权，2026-07-24，请核实）。每项尽量来自官方 docs。
3. 市场数据：DefiLlama options 页（https://defillama.com/options 及 notional-volume / premium-volume）、Derive 协议页的 30 天成交、OI；链上期权集中度（Derive 份额）。与 CEX 对比：Deribit 期权成交量与 OI 量级（官方或 Coinbase/Deribit 公告；Deribit 2025 年被 Coinbase 收购请核实）、CME 加密期权。Alea Research 的 Q3 报告（GPT 结果里引用）当线索，能核实就核实。可以用 curl 调 DefiLlama API（例如 https://api.llama.fi/overview/options?dataType=dailyNotionalVolume 、 https://api.llama.fi/summary/options/derive?dataType=dailyNotionalVolume ——端点名请自己试，记录命令和输出）。
4. 为什么链上期权一直难做：流动性碎片化（系列数爆炸）、做市商需要对冲与资本效率、AMM 定价需要 IV 曲面、预言机/结算、gas 与撤单成本、零售需求结构（卖方 vs 买方）。找有来源的论证（Paradigm、Derive/Lyra 博客、学术论文、协议复盘）。
5. 一笔 RFQ 期权交易的典型流程（以 Derive RFQ 或 Thetanuts V4 OptionBook / Rysk 为例，按官方文档写出步骤、签名对象、链上执行函数），供页面时序图使用。

## 产出要求补充
- 给出“协议对照表”的完整数据（每行：协议 / 链 / 架构 / 保证金 / 结算 / 标的 / 现状（活跃 / 停滞 / 关闭）/ 来源）。
- 给出“演进时间线”数据（年份 / 事件 / 来源）。

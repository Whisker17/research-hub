---
title: Onchain Options Handbook
summary: 面向开发者，由浅入深讲清期权基础、链上期权生态现状与设计取舍、World Markets《The Economics of Composable Options Markets》的核心论点，并判断 Mantle（RWA / tokenized assets）在期权方向上的机会
slug: onchain-options-handbook
domain: crypto
tags: [options, rwa, mantle]
visibility: private
---

# Onchain Options Handbook

## 想知道什么
1. 期权入门（给开发者的 onboarding）：call/put、long/short、payoff；合约规格字段（行权方式、结算方式、fixing、乘数）；定价直觉（Black-Scholes/Black-76、IV、smile/skew、期限结构）；Greeks 与 delta 对冲的局限；put-call parity；常见结构（protective put、covered call、collar、spread）；保证金（全额抵押 / 组合保证金）；期权与现货、永续在风险形态上的区别。
2. Jeff Yan 的观点：核实 Empire 节目（2026-10-07）里他对期权方向说了什么；Hyperliquid 在期权或类期权产品上已公开的计划或已上线的产品（只写有来源的）。
3. 链上期权生态现状：演进史（Opyn、Hegic、Ribbon/DOV、Lyra→Derive、Dopex→Stryke、Premia、Panoptic 等）及踩过的坑；当前主要协议（Derive、Aevo、Paradex、Rysk、Thetanuts、Ithaca、SOFA 等）的架构路线（订单簿 / RFQ / AMM / DOV / 永续期权 / 批量拍卖）与保证金模型；市场数据（链上期权成交量、OI、集中度，与 Deribit/CEX 的量级对比）；为什么链上期权一直难做起来（流动性碎片化、做市、预言机、资本效率）。
4. World Markets 论文：提炼核心论点（复制定价、合成路由、组合保证金带来的流动性提升）；拆它的数字哪些是实测、哪些是模型或假设；核对关键输入（DefiLlama 数据、Derive V2 盘口快照、Uniswap 模拟）；它的局限与利益相关（World Markets 的产品叙事）；对开发者和 Mantle 值得借鉴的地方。
5. Mantle 机会：Mantle 现有资产与基础设施中与期权相关的部分（xStocks、mStocks（与 Bybit 合作，计划中）、USDY、mETH/cmETH、FBTC、借贷与 DEX 流动性、预言机）；Mantle 上已有的期权或结构化产品；RWA 期权的特有难题（休市、公司行动、基差、发行人权限）；候选方向的优先级与前置条件（持仓者的保护/收益结构 + RFQ、RWA 结算与公司行动适配层、复制型/组合保证金 venue 等）。标明是建议，不是 Mantle 现网能力或路线承诺。

## 为什么现在
Jeff Yan 在访谈中把期权当作一个有意思的方向；World Markets 的论文最近引发讨论；Mantle 正在推进 RWA / tokenized stocks（mStocks 等）。我要给 dev 读者做一份期权 onboarding，并判断 Mantle 在这个方向能抓住什么。

## 范围
- 包括：期权基础知识；截至 2026-10-16 的链上期权协议、数据与历史；World Markets 论文解读与核查；Mantle 能力对照与机会建议。
- 不包括：投资或交易建议；协议合约审计；完整的定价或做市实现；Mantle 正式路线承诺；完整定量仿真（只做示例性计算）。

## 读者
懂 EVM / DeFi（AMM、借贷、永续）的开发者与 Mantle 协议 / 产品研究员；没有系统学过期权。

## 已有资料
- `Research Briefs/drafts/onchain-options-handbook.md`：我的原始想法。
- `Research Briefs/references/onchain-options-handbook.md`：GPT Deep Research 结果，只当线索，论断要追到一手来源（它没有读到 Drive 文章）。
- World Markets,《The Economics of Composable Options Markets》（2026-10，PDF，https://drive.google.com/file/d/1_BQFFAVxBYwypmjQ22Coju5QmXzoEJVn/view）。
- research-hub 已有报告（交叉引用）：papertrade-deep-dive、propamm-active-liquidity-paper、mantle-best-routing-report。
- 资料之外：允许补查一手来源（协议文档、源码、DefiLlama / 链上数据、Mantle 官方文档与公告、访谈原文）。

## 交付要求
- research 模式 explainer，由浅入深：5 分钟拿到结论，30 分钟能讲清期权基础和生态，完整阅读能复核。
- 必须有图：payoff 图（call/put/常见结构）；Greeks 或 delta 对冲示意；put-call parity / 合成复制；链上期权演进时间线与架构路线图；一笔 RFQ 交易时序；World Markets 合成路由与组合保证金机制图；Mantle 机会地图或能力对照。
- 对比表：主要链上期权协议（架构、保证金、结算、标的、数据）；论文数字的"实测 / 模型 / 假设"分级；Mantle 能力逐项对照（有 / 部分有 / 缺）。
- 关键代码片段：payoff / Black-Scholes 计算、RFQ 报价结构。
- 区分官方文档、链上可核实事实、媒体报道与推论。中英双语。

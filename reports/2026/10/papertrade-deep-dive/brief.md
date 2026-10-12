---
title: Papertrade 深度拆解：Vault 对手方永续、亏损铸币与 Mantle 复现条件
summary: 讲清 Papertrade 的交易、定价、偿付队列与 PAPER 发行机制及上线后暴露的风险，对照同类 vault 对手方永续，并判断这类产品在 Mantle 上复现需要哪些前序能力、Mantle 能否提供
slug: papertrade-deep-dive
domain: crypto
tags: [perps, hyperliquid, mantle, security]
visibility: private
---

# Papertrade 深度拆解：Vault 对手方永续、亏损铸币与 Mantle 复现条件

## 想知道什么
1. 产品原理：一笔交易的完整链路（session key → relayer → BatchExecutor → Exchange → BBO 预编译 → 结算 → PAPER 铸造）；仓位模型（独立仓位、hard bust 清算与 5 bps 缓冲）；定价（BBO mid、无偏离熔断）；成本结构（0.2 bps 死区、asymmetric impact、2% win fee，与 Rollbit 原模型对照）；三桶账本（LP cash / sideBucket / payout queue）与 debt-funded 仓位；PAPER 铸币曲线与质押分红；管理权限。尽量与合约 / 链上状态核对。
2. 经济模型：检验“项目方没有 token supply，所有 token 都是亏损后 mint”的说法；Martingaler 白皮书的假设与 Papertrade 实际部署的差异；“零资金启动”的资本实际由谁提供；loss-to-mint 的激励问题（例如多空对冲刷 PAPER 的净成本）；偿付能力与队列风险。
3. 为什么火：检验我的两个判断（经济模型不同、HyperEVM 的 hype / FOMO），用上线后的数据（成交量、OI、用户数、LP / 队列规模、PAPER 铸造量）区分激励驱动与真实需求。
4. 为什么必须在 HyperEVM 上：检验 grok 的分析——HyperCore 预编译（BBO / Mark / Oracle / CoreWriter）提供了什么、读取语义（对应哪个时点的状态）、“共识验证”的含义与边界；上线后 BBO 操纵事件的经过、攻击数学与项目方的应对。
5. 同类 vault 对手方永续对照（独立一节）：Rollbit、GMX（v1 GLP / v2 GM）、gTrade、Jupiter Perps、Ostium、HLP 等——每个产品的定价源、成本结构、LP 资本来源、偿付方式、风控手段，以及踩过的坑（预言机操纵、LP 亏损、对冲 / 刷量等事件）；Papertrade 在这条演进线上改了什么。
6. Mantle 复现：这类产品的核心前序需求清单（价格输入、执行与排序、清算 keeper、免 gas / session key、出入金、风险资本、需求来源）；Mantle 现有能力逐项对照（预言机、出块与排序、AA / paymaster、稳定币与桥）；缺口、可行的设计路线，以及与 application-specific sequencing 报告的关系。

## 为什么现在
Papertrade 于 2026-10 在 HyperEVM 上线后很火，并很快出现 BBO 操纵事件。我是 Mantle researcher，想弄清它的原理与火的原因，判断这类产品在 Mantle 上能否复现、需要哪些前序能力。

## 范围
- 包括：截至 2026-10-12 的 Papertrade 机制、数据与事件；HyperCore / HyperEVM 中与它相关的能力；同类 vault 对手方永续的机制与事故对照（独立一节）；Mantle 能力对照与设计建议（标明是建议，不是现网能力）。
- 不包括：投资建议与 PAPER 价格分析；完整合约审计；Mantle 正式路线承诺；完整的定量仿真（只做示例性测算，并给出需要测的指标）。

## 读者
Mantle 的协议 / 产品研究员与开发者：懂 EVM 和 perps 基础，不熟悉 HyperCore / HyperEVM 与 Martingaler 机制。

## 已有资料
- `Research Briefs/drafts/papertrade-deep-dive.md`：我的原始想法（含 grok 分析）。
- `Research Briefs/references/papertrade-deep-dive.md`：GPT Deep Research 结果，只当线索，论断要追到一手来源。
- https://docs.papertrade.xyz/ 与 Martingaler 白皮书；The Block、DeFi Prime 关于 BBO 操纵事件的报道。
- research-hub 已有报告（线索与交叉引用）：application-specific-sequencing。
- 资料之外：允许补查一手来源（官方文档、HyperEVM 合约与链上数据、Hyperliquid 文档、Mantle 官方文档与公告）。

## 交付要求
- research 模式 explainer：5 分钟拿到结论，30 分钟能讲清机制，完整阅读能复核。
- 必须有图：合约架构与一笔交易的时序；三桶账本资金流；asymmetric impact 曲线；PAPER 铸币曲线；BBO 操纵攻击时序；同类产品演进 / 对照图；Mantle 复现的能力对照 / 架构图。
- 对比表：Papertrade 与同类 vault 对手方永续（定价源、成本、LP 来源、偿付方式、风控、事故）；Mantle 能力逐项对照（有 / 部分有 / 缺）。
- 关键代码片段：BBO 预编译读取、impact 公式、铸币曲线、队列结算。
- 区分官方文档机制、链上可核实事实、媒体报道与推论。

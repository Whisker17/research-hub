---
title: 应用特定排序（ASS / ACE）：跨生态实现与 Mantle 的区块空间再分配
summary: 盘点各生态（重点 EVM）应用特定排序的实现方式、强制力来自哪一层、代价是什么，并据此为 Mantle 设计按应用 / 操作分配区块空间与排序规则的方案
slug: application-specific-sequencing
domain: crypto
tags: [mantle, mev, payment, dex]
visibility: private
---

# 应用特定排序（ASS / ACE）：跨生态实现与 Mantle 的区块空间再分配

## 想知道什么
1. 概念与分类：ASS（application-specific sequencing）和 ACE（application-controlled execution，指 ethresear.ch 文章提出的能力范式，不是某个具体项目）分别指什么？按“排序规则由谁强制”（链共识 / sequencer·builder / 链下批处理网络 / 合约入口与经济激励）把现有实现分类；每类的信任假设、组合性代价（同块原子 / 下一块 / 批次后结算）和抗审查边界是什么？
2. EVM 上的实现（重点）：每个实现做什么、怎么做（关键合约 / 客户端代码、一笔交易的完整流程）、强制力来自哪里、当前状态（主网 / 测试网 / 提案 / 已废弃）。候选：Sorella Angstrom（L1 批处理网络 + hook 锁；L2 MEV tax）、Paradigm “Priority is all you need” 的 MEV tax 前提、Unichain / Rollup-Boost / op-rbuilder（优先排序、Flashblocks、TEE）、Arbitrum Timeboost、Flashbots PUR（Priority Update Registry）、FastLane Atlas、Pyth Express Relay、Chainlink SVR、UniswapX priority 路径、Tempo Payment Lane、BSC Payment Lane 与 BAP-710，以及 ethresear.ch 上 EVM 原生排序规则 / PEPC 等提案。
3. 其他生态可借鉴的机制：Solana（BAM maker plugin、Temporal AMQ、Prop AMM 通过 Jito tip 获得的“经济型 cancel priority”）、Hyperliquid（cancel / post-only 优先）、Cosmos（Skip Block SDK lanes、dYdX、Injective 频繁批量拍卖）、Sui 局部费用市场等。只讲机制和对 Mantle 的可借鉴点。
4. 边界与代价：应用排序规则之间的冲突（ACE 文中的 REMOVE/SWAP 循环依赖）、建块复杂度、排序正确 ≠ 没有审查、容量隔离 ≠ 费用隔离、AA 批处理下 `tx.gasprice` 失真等问题，哪些是根本限制，哪些可以缓解？
5. 为 Mantle 设计：针对 Mantle 的产品方向（meme launchpad、perps、DeFi、payment），检验我的假设“payment 需要 FCFS，DeFi 需要 tips 优先，所以要对整个区块空间再分配”，并给出设计方案：
   - 外层：区块空间如何分给不同类别（预留 / 上限 / 借用），交易如何被可信地分类；
   - 内层：每个类别 / 市场用什么排序规则（FCFS、优先费拍卖、phase-first、批量清算）；
   - 强制力放在哪一层：合约、sequencer / builder（Mantle 现有出块路径与计划中的 Reth / Flashblocks）、协议有效性规则；
   - 落地路径、需要测量的指标、失败时如何安全降级。

## 为什么现在
我是 Mantle researcher，欣赏 application specific sequencing 的理念。EVM 上已有 Sorella 等实现，Solana 上也有类似设计；Mantle 的产品方向（meme launchpad、perps、DeFi、payment）对排序的需求不同，我想为 Mantle 设计一套按应用提供不同排序方式的功能，对完整区块空间做再次分配。

## 范围
- 包括：截至 2026-10-11 各生态的 ASS / ACE 实现与提案（重点 EVM）；Mantle 现有出块路径（sequencer、计划中的 Reth / Flashblocks）中可以插入排序规则的位置；Mantle 方案设计（标明是设计建议，不是现网能力）。
- 不包括：投资建议；完整代码审计；Mantle 正式路线图承诺；共享 sequencer / based rollup 的完整对比（最多一节说明它们解决的是不同问题）；具体参数的定量仿真（只给出需要测的指标）。

## 读者
Mantle 的协议 / 基础设施开发者与研究员：懂 EVM 和 OP Stack 出块流程，没有系统看过排序机制与 MEV 拍卖设计。

## 已有资料
- `Research Briefs/drafts/ass-deep-dive.md`：用户的原始想法。
- `Research Briefs/references/ass-deep-dive.md`：GPT Deep Research 的结果，只当线索，论断要追到一手来源。
- https://ethresear.ch/t/application-controlled-execution-a-case-study-on-cancel-prioritization/23977/3
- research-hub 已有报告（作为线索与交叉引用）：bsc-recent-development（Payment Lane、Tempo、BAP-710、PUR）、meme-launchpad、native-aa-eip-8130-8141。
- 资料之外：允许补查一手来源（规范、源码固定 commit、官方文档、ethresear.ch / 论文原文）。

## 交付要求
- research 模式 explainer：5 分钟拿到结论，30 分钟能讲清机制，完整阅读能复核。
- 必须有图：按“强制力所在层”组织的全景图；Angstrom L1 / L2、BAM maker plugin、PUR、Tempo / BSC lane 的交易流程；ACE 规则冲突示例；Mantle 分层调度器架构；一个 Mantle 区块的排序示例（payment + perps + launchpad + DeFi 同时到达）。
- 对比表：各实现的“控制范围 / 强制力来源 / 组合性代价 / 状态”；payment / DeFi / launchpad / perps 各自适合的排序规则。
- 关键代码片段：Angstrom L2 MEV tax 计算、op-rbuilder 排序、PUR 接口、payment 分类规则。
- 区分“已上线”“已实现未激活”“只是提案”；Mantle 方案部分明确标为设计建议。

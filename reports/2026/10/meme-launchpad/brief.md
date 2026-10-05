---
title: Meme Launchpad：原理、演进与 Agentic 设计
summary: 讲清 meme launchpad 的机制与完整生命周期，复盘主要产品，并推导 Mantle 上 agent 第一公民的 launchpad 为什么这样设计
slug: meme-launchpad
domain: crypto
tags: [meme, ai-agent, mantle, account-abstraction]
visibility: private
---

# Meme Launchpad：原理、演进与 Agentic 设计

## 想知道什么
1. Meme launchpad 的核心机制是什么：虚拟储备 bonding curve 的数学、定价与毕业阈值、手续费路由、权限丢弃；它解决了传统 DEX 发币的哪些问题？
2. 一个代币的完整生命周期：创建 → 曲线交易（内盘）→ 毕业判定 → 迁移或池内相变 → 外盘交易与费用分配。每个阶段的状态、参与者、合约调用和失败模式是什么（要有图：生命周期状态图、关键时序图）？
3. 主要产品怎么做、改了什么、踩了什么坑：pump.fun（含 PumpSwap）、four.meme、Base 系（Clanker / Zora / Flaunch）、Robinhood Chain 系（Pons / LONG / PAIR）；agentic 对照物（Bankr、Virtuals、ElizaOS / daos.fun）。
4. 从演进中能抽出哪些结构性缺陷和设计公理（迁移夹子、开盘狙击、dev 砸盘、多 quote 碎片化、补贴退出、状态膨胀等）？
5. Agentic meme launchpad：为什么要把 agent 设为第一公民，它解决了什么问题、带来什么好处、引入什么新风险？产品形态（发币零门槛、交易硬限权）、权限模型（session key、白名单、额度、撤销）、发行机制、经济闭环（手续费养推理）、双轨 onboarding、对 Mantle 链级能力的需求（7702 / Paymaster / 2D nonce），以及何时需要 L3？

## 为什么现在
Mantle 正在规划 v3 资本市场路线，之前两次通用 meme launchpad（Funny Money、Printr）已关停；agent 驱动的发币与交易（Bankr、Clanker）在 Base 上跑通。需要一份让开发者能快速 onboarding 这个领域、并理解 agentic 方案设计依据的材料。

## 范围
- 包括：机制原理与数学、完整生命周期、主要产品复盘与对比、结构性缺陷、agentic launchpad 的设计思路与取舍。
- 不包括：Tape（xStocks 计价的 launchpad 方案）；合规细节（ArbOS 交易过滤等，最多点到）；具体排期与 KPI；投资建议。

## 读者
懂 EVM / Solidity 的开发者，第一次接触 meme launchpad 和 agent 钱包。读完要能讲清机制、看懂主要产品的合约设计取舍，并能参与 agentic launchpad 的设计讨论。

## 已有资料
- `~/Work/research/work/mantlev3-roadmap/2-meme-launchpad/`：原理全解（outputs/02）、代际演进与避坑（outputs/03、references/）、缺陷与优化（outputs/04）、各链竞品基准（benchmarks/）、链级优化（chain-infra/）。
- `~/Work/research/work/mantlev3-roadmap/7-agent-meme-launchpad/`：**product.md 是 agentic 部分的主线**；调研报告与 L2/L3 设计（agent-meme-launchpad-report.md、outline.md、notes/）提供设计论证；来源索引 sources.md。
- 资料之外：允许补查一手来源（官方文档、合约源码、链上数据、事故复盘），用于核实资料里的数字与事实，并更新到 2026-10 的现状。查不到的标 speculative。

## 交付要求
- 一页 research 模式 explainer：5 分钟拿到结论，30 分钟能讲清机制，完整阅读能复核。
- 必须有图：生命周期状态图、创建→交易→毕业时序图、曲线价格示意、产品演进时间线、agentic 方案的权限 / 资金流图。
- 产品复盘用统一维度对比（曲线、毕业、费用、防狙击、创作者激励、安全事件）。
- Agentic 部分讲清“为什么”，不只讲“是什么”；product.md 与调研报告冲突处（quote 资产、曲线 vs 单边池等）作为取舍并列说明。

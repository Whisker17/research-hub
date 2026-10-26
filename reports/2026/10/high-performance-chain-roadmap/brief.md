---
title: 高性能链系统设计与 Mantle 工程路线
summary: 自上而下拆解一条链（区分 L1 / L2）的组件和各自的性能限制，逐个组件给出问题、优化方向和现实项目的做法，最后结合 mStocks 叙事为 Mantle 排出短 / 中 / 长期工程计划
slug: high-performance-chain-roadmap
domain: crypto
tags: [high-performance, mantle, evm]
visibility: private
---

# 高性能链系统设计与 Mantle 工程路线

## 想知道什么
1. 作为一条链，自上而下有哪些组件？每个组件分别怎样限制性能（吞吐、延迟、尾延迟、状态新鲜度、持续能力）？L1 和 L2 在每个组件上有什么不同的限制和缺陷？
2. 深入每个组件：
   1. 这个组件会产生什么问题；
   2. 优化方向有哪些；
   3. 现实中的项目方（Monad、MegaETH、Solana、Base、RISE、Sei、Hyperliquid、Aptos/Sui、Arbitrum 等）是怎么优化的，提供了什么方案，2026 年的最新状态是什么。
3. 去年（2025）的内部高性能研究中，哪些结论仍然成立，哪些已经过时或需要修正？
4. 结合 Mantle 当前的技术基线和叙事（mStocks 资产发行体验、不同用户的交易体验：native AA、提升交易执行质量），按“收益 × 复杂度”给出短期 / 中期 / 长期的目标与任务，并说明依赖关系。

## 为什么现在
高性能链的内部研究集中在 2025 年，时效性下降；Mantle 的产品叙事已转向 mStocks 与交易体验，需要一份新的系统性总结，既作为开发者 onboarding 教程，也作为工程排期的依据。

## 范围
- 包括：通用链系统模型（账户与准入、网络、排序/共识/区块构建、执行、状态存储、DA、验证与结算、RPC/索引、费用与资源计量）；L1 与 L2（以 OP Stack 系 Rollup 为主）的差异；主流高性能项目的方案与最新进展；Mantle 当前基线与路线规划。
- 不包括：代币经济、市场行情、给其他公司的建议；非 EVM 生态只作为设计参考，不做完整评测。

## 读者
新加入 Mantle 的协议 / 基础设施工程师：懂 EVM 和 OP Stack 的基本概念，但没有系统学过高性能链设计。

## 已有资料
- 作者想法（Notion drafts）：https://app.notion.com/p/4052f04c436c80eba647ca34d5f5d16a
- GPT Deep Research 结果（Notion references）：https://app.notion.com/p/4052f04c436c804ba896e5bda1401850
- 2025 年内部高性能研究（Notion「Lark 迁移研报」数据库中标签为“高性能”的约 30 篇）：https://app.notion.com/p/b3e8e6379b574b2fbdd38ba21a24e4a0
- research-hub 已有相关报告：revm-vs-evm2、native-aa-eip-8130-8141、application-specific-sequencing、atomic-synchronous-composability
- 资料之外：允许补查一手来源（官方文档、规范、源码、论文、发布记录）

## 交付要求
- 先给系统全景图（组件 + L1/L2 差异），再逐组件深入（问题 → 优化方向 → 项目方案例），最后给 Mantle 的短 / 中 / 长期路线（目标、任务、依赖、优先级理由）。
- 作为 onboarding 教程：概念讲清楚、有图，新人读完能从现象反推瓶颈。
- 标明哪些结论是推断、哪些排期是建议而非 Mantle 已批准的路线。
- 中英双语。

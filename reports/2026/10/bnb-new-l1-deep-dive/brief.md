---
title: BNB New L1 全面解构：Native AA、异步执行、20ms 子区块、隐私池与格哈希状态承诺
summary: 全面解构 BNB Chain 的 New L1：它和 BSC 是什么关系，Native AA、并行 / 异步执行、200ms 区块与 20ms 子区块、Shielded 隐私交易、LtHash 状态承诺与共识分别怎么做，和 EIP-8130 / Tempo、应用特定排序有什么异同
slug: bnb-new-l1-deep-dive
domain: crypto
tags: [bsc, account-abstraction, privacy, post-quantum, mev]
visibility: private
---

# BNB New L1 全面解构

> **专题关联**：`bsc-recent-development`（BSC 近期开发方向：CAS20、Payment Lane、Jenner）讲的是现有 BSC；`native-aa-eip-8130-8141` 讲 EIP-8130 / 8141；`application-specific-sequencing` 讲应用特定排序；`pq-signature-selection` 讲后量子签名选型。本篇只讲 New L1，相关背景引用前文，不重复展开。

## 想知道什么
1. **定位**：BNB 是要开一条新的 L1 并放弃 BSC 吗（存疑）？New L1 与 BSC 的关系、时间线（devnet / testnet / mainnet）、目前的成熟度（哪些已经跑起来，哪些还在设计）。
2. **Native AA**：它怎么做的？和目前市面上主流的 EIP-8130、Tempo 的账户模型有什么区别（以 EIP-7702 / ERC-4337 作参照）？
3. **并行 EVM（执行层优化）**：基于什么做的？BNB 之前在 BSC 上做过哪些相关的调研和实现（Parallel EVM、BEP、TxDAG、BAL、reth 客户端等），和 New L1 的做法是什么关系？
4. **隐私交易（shielded tx）**：能做什么、怎么做？是否有 DeFi 可组合性，还是仅仅是 private payment？
5. **PQ**：所谓 lattice-based 的 state commitment 选的是什么？是 Falcon 吗？New L1 整体的密码学栈里哪些部分是后量子的？
6. **Order / Execution Separation**：和我们之前想做的 application-specific sequencing 有没有相关性，还是仅仅是排序与执行的解耦？
7. **200ms 区块 + 20ms 子区块**：这些 block 是怎么做的？各自承诺什么、不承诺什么？没有全局 mempool 时交易怎么走？
8. **共识**：作为一条 L1，共识算法有没有变化？还是像 BSC 那样的 PoSA（Parlia）？

## 为什么现在
BNB Chain 在 H2 2026 技术路线图（2026-07-08）里宣布在做一条面向高频交易、支付、隐私金融与 agent 的新 L1，计划 2026 年底 testnet、2027 年初 mainnet；2026-10 官方文档站上线了 New L1 的完整设计文档（devnet 阶段）。需要整理一篇准确的研究报告，让老板知道这件事。

## 范围
- 包括：截至 2026-10-24 的公开资料：docs.bnbchain.org/newl1 全部页面、BNB Chain 博客与路线图、BEP 仓库与 BNB 论坛、bnb-chain GitHub 组织下的公开代码；EIP-8130、EIP-7702、ERC-4337 规范与 Tempo 文档（对比用）；Solana SIMD-0215 与 LtHash 相关论文（对比用）；BSC 现有文档（共识参数对比用）。
- 不包括：代币价格与投资建议；对任何公司的建议；独立跑 devnet 或 benchmark；opBNB / Greenfield；EIP-8130 / Tempo / ASS / PQ 签名本身的完整展开（引用前文）。

## 读者
老板与团队（懂 EVM 和 L2 架构，没跟过 New L1 的文档）。5 分钟拿到结论，30 分钟讲清各模块机制，完整阅读能复核。

## 已有资料
- `Research Briefs/drafts/BNB-new-L1-deep-dive.md`：我的想法，研究问题的原话出处。
- `Research Briefs/references/BNB-new-L1-deep-dive.md`：GPT Deep Research 结果（2026-10-24），只作线索，论断要追到一手来源。
- https://docs.bnbchain.org/newl1/overview/ ：官方文档入口。
- 前文：`reports/2026/10/bsc-recent-development/`、`native-aa-eip-8130-8141/`、`application-specific-sequencing/`、`pq-signature-selection/`。
- 资料之外：允许补查一手来源，查不到的标 speculative。

## 交付要求
- research 模式 explainer，中英双语 + 推特卡片。
- 严格区分“devnet 已跑 / 文档提出的设计 / 尚未实现”，每条论断都能追到官方文档或代码。
- 图：New L1 分层架构；一笔交易从 gateway 到执行最终化的时间线（20ms 子区块 → 200ms 区块 → 排序最终 → ExecutionCommitment → 执行最终）；BSC 并行执行研究到 New L1 的演进；隐私池 atomic call 流程。
- 对比表：New L1 `0x76` vs EIP-8130 vs Tempo（vs 7702 / 4337）；Order/Execution Separation vs 应用特定排序；New L1 vs BSC（共识、出块、状态、mempool）；各组件密码学与 PQ 状态。
- 有一节“对我们的意义”（Mantle 视角，只写事实前提与推论，不写给其他公司的建议）。

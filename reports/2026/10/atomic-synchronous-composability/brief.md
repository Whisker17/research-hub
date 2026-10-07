---
title: 原子同步可组合交易（EEZ）：原理、首笔主网交易与 Mantle L2↔L3
summary: 讲清 L1↔L2 原子同步（AS）交易怎么实现、要改哪些 infra，解码 2026-10-05 的首笔主网交易，对比其他同步可组合路线，并分析对 Mantle L2↔L3 的意义
slug: atomic-synchronous-composability
domain: crypto
tags: [mantle, interop]
visibility: private
---

# 原子同步可组合交易（EEZ）：原理、首笔主网交易与 Mantle L2↔L3

## 想知道什么
1. AS 交易的技术细节与原理：让看报告的 devs 明白 AS 交易是怎么实现的、需要修改 infra 的哪些内容。包括必要的背景科普：异步桥 vs 同步可组合；atomic / synchronous / finality 的区别；EEZ 的组件（L1 manager、CrossChainProxy、execution table、rolling hash、proof system、composer、L2 系统交易、deriver）与一笔 AS 交易的完整生命周期。
2. 代入 2026-10-05 的主网交易 `0xd0cbfef7df37b362839d7bf91a91bccc09b1510625919b7bcdaa291153920a02`（https://explorer.blockscout.com/chain/ethereum/tx/0xd0cbfef7df37b362839d7bf91a91bccc09b1510625919b7bcdaa291153920a02?tab=index）：这笔交易做了哪些操作（调用树、事件、资金流、用的哪个 proof system）？实现了一个什么样的效果？
3. AS 交易实现后对生态有什么意义：
   - Mantle L2 ↔ L3：Mantle L3 上的 appchain 可以使用 Mantle L2 的流动性，而流动性依然锁在 Mantle L2 上，比如 Vault 以及 DeFi 的流动性，甚至 meme launchpad 的流动性迁移也可以成为 AS 的。
   - 外部观点：搜集别人对 AS 实现后能做什么的看法（ethresear.ch、EF / Vitalik、Gnosis GIP-153 等）。
4. 其他同步可组合路线的对比：shared sequencer、based rollup、real-time proving、AggLayer、OP Superchain interop 等路线的机制、信任假设、同步 / 原子程度和进展，与 EEZ 的异同。

## 为什么现在
2026-10-05 我们看到了第一笔在 Ethereum 和 L2 之间的同步可组合交易。结合之前的思路，考虑把这个方向作为 Mantle 在 L2 ↔ L3 上的同步可组合交易能力推出。

## 范围
- 包括：AS 机制与背景、infra 改造清单、首笔主网交易解码、各路线对比、Mantle L2 ↔ L3 的映射与生态意义、主要风险与边界。
- 不包括：投资建议；完整代码审计；Mantle 正式路线图承诺。

## 读者
Mantle devs：懂 EVM 和 rollup 基础，没接触过同步可组合。这篇报告主要用于让 devs onboarding 这个 topic。

## 已有资料
- `Research Briefs/drafts/atomic-synchronous-tx.md`：用户的原始想法与需求。
- `Research Briefs/references/atomic-synchronous-tx.md`：GPT Deep Research 结果，作为线索，论断需追到一手来源。
- https://github.com/eez-association/eez-core-protocol
- https://ethresear.ch/t/synchronous-composability-between-rollups-via-realtime-proving/23998
- 资料之外：允许补查一手来源（源码固定 commit、链上数据、官方文档）。

## 交付要求
- research 模式 explainer：5 分钟拿到结论，30 分钟能讲清机制，完整阅读能复核。
- 必须有图：EEZ 架构、一笔 AS 交易的时序、首笔主网交易的调用树、各路线对比、Mantle L2 ↔ L3 架构。
- 要有关键代码片段（execution entry、proxy、rolling hash 等）。

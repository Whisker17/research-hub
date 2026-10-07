---
title: Arbitrum 冻结黑客资产：机制拆解、审查争议与各链先例
summary: 讲清 Arbitrum 在 KelpDAO 事件中冻结并转移黑客 ETH 的技术路径（逐步解析交易）和 ArbOS 61 交易过滤，汇总社区对“审查用户”的争论，对比其他 L1/L2 的类似机制，并评估 Mantle 能否采用
slug: arbitrum-asset-freeze
domain: crypto
tags: [mantle, security]
visibility: private
---

# Arbitrum 冻结黑客资产：机制拆解、审查争议与各链先例

## 想知道什么
1. 机制：Arbitrum 冻结 KelpDAO 黑客资产，用的到底是什么机制？
   - 核实“ArbOS 升级引入的 sequencer 级操作”和“Security Council 临时升级 L1 Inbox”这两种说法，并讲清 ArbOS 61 Compliance Filtering 和这次操作的区别。
   - 必要背景：Arbitrum Nitro 架构、sequencer 与 delayed inbox、force inclusion、ArbOS / STF、unsigned tx 与地址 aliasing、Security Council 权限和宪法。
2. 逐步解析这次冻结：L1 治理交易 `0x079984c56c5670108f5c6f664904178f9b364340351949a42e4637d1f645f770` → L2 交易 `0x5618044241dade84af6c41b7d84496dc9823700f98b79751e257608dac570f6b`。
   - 每一步做了什么：调用树、合约升级、消息入队、L2 派生与执行、金额与 gas 细节。
   - 后续资产去向：释放投票、法院命令、6 月的划转。
3. 社区与 KOL 观点：是否认为这是在审查（censor）用户、会不会成为隐患；引入冻结能力的利弊权衡。
4. 其他 L1 / L2 是否有类似的锁定资产机制或先例（如 Sui/Cetus、Linea/Velocore、BNB Chain、Ethereum DAO 分叉、发行方冻结等）；这类行为在公众眼中是否被认可。
5. 对 Mantle 的意义：Mantle（OP Stack + OP Succinct）上有没有类似路径，需要什么前提，有哪些风险。只做机制可行性分析，不针对具体事件。

## 为什么现在
KelpDAO 事件中 Arbitrum 通过治理冻结了黑客资产；近期 Mantle 上也发生了被盗事件，黑客还没有转移资产，需要评估类似操作是否适用。

## 范围
- 包括：两套机制的原理与源码、冻结交易逐步解析、后续资产去向、社区观点与利弊、跨链先例对比、Mantle 适用性分析。
- 不包括：法律意见；投资建议；Mantle 的正式决策或路线承诺；可以直接在主网执行的操作手册；Mantle 具体被盗事件的分析（没有公开的地址和交易）。

## 读者
devs：懂 EVM 和 rollup 基础，不熟悉 Arbitrum 内部（Nitro、ArbOS、delayed inbox）。报告要能让 devs onboarding 这个机制。

## 已有资料
- `Research Briefs/drafts/censor-users-on-arbitrum.md`：用户的原始想法与需求。
- `Research Briefs/references/censor-users-on-arbitrum.md`：GPT Deep Research 结果，只当线索，论断要追到一手来源。
- 资料之外：允许补查一手来源（源码固定 commit、链上数据、治理论坛、官方文档）。

## 交付要求
- research 模式 explainer：5 分钟拿到结论，30 分钟能讲清机制，完整阅读能复核。
- 必须有图：干预层次分类、Arbitrum 输入路径（sequencer / delayed inbox / force inclusion）、冻结操作 L1→L2 时序、L1 调用树、Compliance Filtering 两层结构、各链先例对比。
- 要有关键代码片段（Inbox override、ArbitrumUnsignedTx、ArbFilteredTransactionsManager 等）。

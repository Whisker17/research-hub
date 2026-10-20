---
title: 后量子签名选型：Hash-based vs Lattice-based，从 XMSS + leanVM、Falcon + Aerie 到 EIP-8288
summary: 拆解 Ethereum / Starknet 偏好的哈希路线与 a16z / LayerZero / Algorand 偏好的格路线在原理、聚合、成本与安全假设上的差异，讲清 XMSS + leanVM 怎么运作、EIP-8288 怎样改变 Ethereum 的 PQ 接入方式，并据此修订前两篇对 Mantle 的建议
slug: pq-signature-selection
domain: crypto
tags: [post-quantum, eip, security, starknet, mantle]
visibility: private
---

# 后量子签名选型：Hash-based vs Lattice-based

> **专题关联**：Mantle 后量子专题第三篇（选型篇）。
> - 第一篇《后量子从入门到路线》（`post-quantum-mantle`）：哪些密码学组件需要迁移、各项目路线、Mantle 能主动做什么。
> - 第二篇《后量子在 Mantle 的工程落地》（`pq-in-mantle`）：合约级 PQ 智能账户 + 验签预编译 + 7702 局限。
> - 本篇：当 PQ 签名要成为常规基础设施时，签名算法、聚合证明系统、协议接口三层怎么选；并回头检查前两篇的建议哪些要修订。

## 想知道什么
1. **Hash-based 与 Lattice-based 的原理与取舍**：两类签名各自依赖什么安全假设？XMSS（有状态）/ SLH-DSA（无状态）与 Falcon / ML-DSA 在尺寸、签名端与验证端复杂度、状态管理、侧信道、标准化进度上的差异。讲到有一定技术背景的开发者能理解的程度，不做数学推导。
2. **聚合为什么成了核心问题**：BLS 聚合退役之后，两条路线分别怎样“聚合”大量 PQ 签名？
   - Ethereum：XMSS（leanSig）+ leanVM / leanMultisig 是怎么运作的（onboard 式讲解：谁签名、谁证明、递归怎么合并、EIP-8292 的角色划分、当前成熟度）。
   - a16z / LayerZero：Aerie（Falcon + Akita 格承诺 SNARK）做了什么、基准数字怎么读（0.65s / 32K、66 KiB vs 1.3 MiB、“比 leanVM 快 29 倍”的口径）、共同盐模式的额外假设。
3. **各生态的立场与理由**：Ethereum（Vitalik、EF PQ 团队）、Starknet（Eli Ben-Sasson）偏向 hash-based 的理由；a16z、LayerZero、Algorand 偏向 lattice（Falcon）的理由。逐条解析双方论点，区分“签名选择 / 证明系统选择 / 协议应原生支持多少密码学”三种不同争论，给出优劣势对比。
4. **EIP-8288 是什么**：与 EIP-8141（Frame Tx）、EIP-8292 的关系；dependency frame 怎样把验签变成交易依赖、由区块级证明满足；为什么 Vitalik 认为最终形态是“非 precompile”的；当前草案支持什么、不支持什么；对 Ethereum PQ 路线（以及 PQ 验签预编译 EIP-7885 / 8051 / 8052 / 8355）意味着什么。
5. **对前两篇的修订与对 Mantle 的意义**：前两篇“合约 AA + ML-DSA-65 预编译”的近期建议在这场争论与 EIP-8288 出现后是否还成立？哪些需要修正或补充（例如接口与算法解耦、Falcon 实验线、基准方法）？

## 为什么现在
a16z 发布了基于格 SNARK 的快速 PQ 签名聚合（Aerie），引发了 lattice vs hash 的大量讨论；Eli Ben-Sasson 发推回应哈希路线的理由；Vitalik 提到 PQ 签名验证的最终形态应是非 precompile 的，通过 EIP-8288 引入。前两篇报告已建立威胁清单和近期工程方案，需要一篇把签名选型讲透、并把整个 PQ 专题串起来的文章。

## 范围
- 包括：截至 2026-10-20 的公开资料：a16z / LayerZero Aerie 博客、论文与仓库；EIP-8141 / 8288 / 8292 及 Ethereum Magicians 讨论；leanSig / leanVM / leanMultisig 仓库与 ethresear.ch 帖子；NIST FIPS 204 / 205 与 FN-DSA（FIPS 206）进展；StarkWare、Algorand 官方材料；相关推文（Eli、Vitalik）。
- 不包括：格与哈希密码学的安全性证明和底层数学推导；对 Aerie / leanVM 基准的独立复现；投资建议；Mantle 内部未公开架构。

## 读者
Mantle 的开发者和老板：懂 EVM 与 rollup，读过前两篇或至少知道 PQ 的基本威胁模型，但对 XMSS、leanVM、格 SNARK、EIP-8288 没有背景。

## 已有资料
- `Research Briefs/drafts/pq-signature-selection.md`：我的原始想法。
- `Research Briefs/references/pq-signature-selection.md`：GPT Deep Research 结果，只当线索。
- https://a16zcrypto.com/posts/article/fast-post-quantum-signature-aggregation-with-lattice-snarks ：触发事件。
- https://x.com/EliBenSasson/status/2111772220389245426 ：Eli 的哈希路线理由。
- https://x.com/VitalikButerin/status/2112015118418473358 ：Vitalik 关于非 precompile 最终形态与 EIP-8288。
- 前两篇报告：`reports/2026/10/post-quantum-mantle/`、`reports/2026/10/pq-in-mantle/`。
- 资料之外：允许补查一手来源。

## 交付要求
- research 模式 explainer，中英双语；5 分钟拿到结论，30 分钟讲清机制，完整阅读能复核。
- 必须有图：签名 / 聚合 / 协议接口三层拆分图；哈希签名（WOTS → XMSS Merkle 树）与 Falcon 验证直觉图；XMSS + leanVM 聚合流程（叶子证明 → 递归 → 区块）；Aerie 证明边界对比；EIP-8288 交易生命周期（钱包 → mempool → builder → 验证节点）；PQ 专题三篇的关系与 Mantle 路线修订图。
- 对比表：hash vs lattice 多维对比；各生态立场 × 理由 × 实际部署；Aerie vs leanVM 基准口径；预编译 vs EIP-8288。
- 必须有“系列导航”：说明三篇各回答什么，并列出本篇对前两篇建议的修订。
- 区分：已上线 / 主网演示 / 标准 / 草案 / 研究 / 推论；对 Mantle 的建议标为推论或推测。

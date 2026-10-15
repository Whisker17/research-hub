---
title: 后量子（PQ）从入门到路线：Ethereum / Starknet / Aztec 怎么做，Mantle 能主动做什么
summary: 从 EVM 链今天的密码学依赖讲起，说明量子计算与 AI 密码分析分别威胁什么、PQ 方案有哪些取舍，对比 Ethereum、Starknet、Aztec 等项目的 PQ 路线与真实进度，最后给出 Mantle 在 Ethereum 2029 目标之前可以主动推进的工作
slug: post-quantum-mantle
domain: crypto
tags: [post-quantum, mantle, security, starknet, eip]
visibility: private
---

# 后量子（PQ）从入门到路线：从 Aztec PQ 到 Mantle PQ

## 想知道什么
1. **EVM 链今天的密码学现状**：一条 EVM 链（Ethereum L1 + Mantle 这样的 EVM-equivalent L2）在各层分别依赖什么密码学？包括账户签名（secp256k1 ECDSA、EIP-7702、P-256 预编译）、哈希与状态（Keccak、MPT）、共识（BLS）、DA（blob / KZG）、证明与验证（BN254 预编译、Groth16 / PLONK 包装）、桥与多签 / 升级权限。Mantle 当前实际部署的架构是什么（证明系统、DA、桥、权限），要用公开资料逐项核对。
2. **量子计算机出现后会出什么问题**：Shor 与 Grover 分别影响什么；哪些组件会被直接攻破（伪造签名、伪造证明、KZG 绑定性），哪些只是安全余量降低；公钥暴露、“先收集后解密（HNDL）”对公开链和隐私链有什么不同；目前对“Q-day”的资源估计和时间判断有哪些（例如 Google 2026 年对 256 位 ECDLP 的估计），它们的置信度如何。
3. **近期 AI 破解带来哪些隐患**：AI 辅助密码分析的实际进展（如 Anthropic 对 HAWK、缩减轮数 AES 的攻击）和它的边界；AI 审计发现实现漏洞（如 Aztec 的说法）；小域 Poseidon 被攻破等事件。这些对“选哪种 PQ 方案、迁移要多快”意味着什么。
4. **PQ 是什么（high level）**：NIST 标准（ML-KEM、ML-DSA、SLH-DSA、FN-DSA / Falcon）与几大类方案（格、哈希、同源等）；签名 / 公钥尺寸与链上成本的直觉；混合方案为什么必须是 AND 而不是 OR；PQ 证明系统（哈希型 STARK、格型 SNARK）与 PQ 签名是两件事。
5. **各项目怎么选、做到哪了**：
   - Ethereum：pq.ethereum.org 的路线与 2029 目标，账户（EIP-8141 / 7885 / 8051 / 8052）、共识（leanSig / leanVM / EIP-8292）、DA（PQ blobs）、紧急预案；哪些是 Draft / 研究，哪些已定。
   - Starknet：复用之前报告的结论，补上 10-14 之后的进展。
   - Aztec：2026-10-15 博客的路线（2027-02 / 2030 两个目标、2027 年三个选型节点）及其背后的取舍。
   - 其他有深度研究的项目：至少看 Optimism / Superchain、Algorand、Bitcoin（BIP-360 等）、Solana、Zcash、Succinct / SP1、Jolt / Akita，按“已上线 / 主网演示 / 草案 / 研究”分级。
6. **Mantle 能主动做什么**：检验“只能等 Ethereum 选好路线再 rebase”这个判断。哪些必须继承 Ethereum、哪些要和上游（OP Stack / Succinct / DA 提供方）协同、哪些 Mantle 可以自主推进；在 2026–2029 这三年里，给出具体、可验收的主动建议（防哪些攻击、先保护什么、怎么排优先级）。

## 为什么现在
Aztec 在 2026-10-15 发布了 PQ 路线博客；前几天刚调研完 Starknet 的 PQ 迁移；Ethereum 的 PQ 目标是 2029 年。Mantle 作为 EVM-equivalent L2，在 PQ 方面研究储备很少，目前的默认策略是被动等 Ethereum 定好路线再跟进。我想在接下来的三年里找到可以主动做的事。

## 范围
- 包括：截至 2026-10-16 的公开资料，即 NIST 标准、Ethereum 官方路线与 EIP、各项目官方博客 / 文档 / 源码、论文、L2BEAT 与 Mantle 公开文档 / 合约；必要的密码学背景（讲到能理解取舍为止）。
- 不包括：密码学方案的安全性证明与底层数学推导；完整安全审计；Mantle 内部未公开的架构或密钥管理信息（只基于公开资料，需内部核对的地方标出）；投资建议。

## 读者
Mantle 的开发者和老板：有技术背景、懂 EVM 和 rollup 的基本概念，但不熟悉密码学和 PQ。背景知识要补，但不要太深奥、太底层。

## 已有资料
- `Research Briefs/drafts/from-aztec-pq-to-mantle-pq.md`：我的原始想法。
- `Research Briefs/references/from-aztec-pq-to-mantle-pq.md`：GPT Deep Research 的结果，只当线索，论断要追到一手来源。
- https://aztec.network/blog/post-quantum-aztec ：Aztec PQ 博客（触发事件）。
- research-hub 已有报告：starknet-account-model（Starknet PQ 迁移台账）、native-aa-eip-8130-8141（EVM Native AA）。
- 资料之外：允许补查一手来源。

## 交付要求
- research 模式 explainer，从入门到深入：5 分钟拿到结论，30 分钟能讲清机制，完整阅读能复核。
- 必须有图：EVM 链（L1 + Mantle）密码学组件地图与量子威胁标注；Shor / Grover / HNDL 威胁示意；PQ 方案分类与尺寸对比；各项目 PQ 时间线（Ethereum 2029、Starknet、Aztec 2027 / 2030、Optimism 等）；Mantle 依赖与责任边界图（自主 / 协同 / 继承）；Mantle 2026–2029 行动路线。
- 对比表：组件 × 算法 × 量子影响；PQ 签名方案尺寸与成本；项目 × 组件 × 进度（已上线 / 演示 / 草案 / 研究）。
- 区分：已上线 / 主网演示 / 标准草案 / 路线图 / 推论；对 Mantle 的建议标为推论或推测。
- 中英双语。

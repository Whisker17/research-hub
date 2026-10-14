---
title: Starknet 账户模型、后量子迁移与 STRK20 / Shadow Account
summary: 拆解 Starknet 原生账户模型与 EVM 的差异、它的密码学选型与 PQ 迁移路线（检验“2027 年成为 PQ L1”的底气），以及 STRK20 隐私协议与 Shadow Account 的工作原理
slug: starknet-account-model
domain: crypto
tags: [starknet, account-abstraction, post-quantum, privacy]
visibility: private
---

# Starknet 账户模型、后量子迁移与 STRK20 / Shadow Account

## 想知道什么
1. 账户模型：Starknet 原生账户（`__validate__` / `__execute__`、deploy_account、nonce、验证资源限制、`is_valid_signature`、升级）与一般 EVM 账户模型（EOA、ERC-4337、EIP-7702，以及 Native AA 提案）的区别，做了哪些优化、接受了哪些限制。尽量对到协议文档与 OZ / Argent 等账户源码。
2. 密码学选型与 PQ 迁移：Starknet 在哪些组件用了哪些算法（STARK / S-two 证明、Stark 曲线 ECDSA、Pedersen / Poseidon / BLAKE2s、状态树、地址派生、class / OS hash、共识签名、L1 桥与 blob/KZG）；哪些已经抗量子、哪些在迁移、哪些依赖外部。Falcon-512 账户的实现、变体（SHAKE / BLAKE2s / Poseidon hash-to-point）、成本与标准化状态（FIPS 206）。
3. 为什么他们觉得 2027 年就能成为 PQ L1：L1 转型的官方表述与状态，三阶段路线图的实际进度（已上线 / 进行中 / 研究阶段），转成 L1 需要额外补齐什么（共识、DA、桥、旧状态迁移）；与 Ethereum 2029 年三层 PQ 目标做口径一致的对比。
4. 隐私协议：STRK20 的原理——privacy pool、note / nullifier / channel、viewing key 与 auditor、virtual OS 执行证明与 proof facts、relayer / paymaster、discovery；对谁保密、对谁不保密；它本身的密码学是否抗量子（如 ECDH）。
5. Shadow Account：工作原理（与主钱包的关系、地址派生、anonymizer、授权链、一次 DeFi 操作的生命周期），检验“它像 private sub account”的判断，以及它的隐私边界。

## 为什么现在
Starknet 近期很活跃：2026-10-08 表示正在考虑从 L2 转为 L1，目标 2027 年成为第一条完全抗量子的网络（Ethereum L1 的目标是 2029 年底）；同期推出了 Shadow Account。我想知道他们的底气来自哪里，以及隐私产品怎么做。

## 范围
- 包括：截至 2026-10-14 的官方文档、Quantum Hub / Migration Register、官方博客与公告、源码（固定 commit）与可核实的主网记录；与 EVM 账户模型及 Ethereum PQ 路线的对比。
- 不包括：投资建议与 STRK 价格；完整安全审计；Cairo / Lean 测试的本地复跑（如果能低成本复跑就复跑，并注明）；密码学方案本身的安全性证明。

## 读者
Mantle Engineering Team 的研究员和开发者：懂 EVM、AA 和 rollup，不熟悉 Cairo / Starknet，也不熟悉 PQ 密码学。

## 已有资料
- `Research Briefs/drafts/starknet-account-model.md`：我的原始想法。
- `Research Briefs/references/starknet-account-model.md`：GPT Deep Research 结果，只当线索，论断要追到一手来源。
- research-hub 已有报告（线索与交叉引用）：native-aa-eip-8130-8141（EVM Native AA 对照）。
- 资料之外：允许补查一手来源（docs.starknet.io、quantum.starkware.co、strk20.starknet.io、starkware-libs / OpenZeppelin / s2morrow 源码、SNIP、NIST、Ethereum 官方博客与 EIP、区块浏览器）。

## 交付要求
- research 模式 explainer：5 分钟拿到结论，30 分钟能讲清机制，完整阅读能复核。
- 必须有图：Starknet 与 EVM（EOA / 4337 / 7702）交易验证流程对照；Starknet 密码学组件清单与 PQ 状态图；三阶段迁移路线与 Ethereum 2029 时间线对照；STRK20 一笔私有转账的时序；Shadow Account 授权链与一次 DeFi 操作的生命周期。
- 对比表：账户模型对照；组件 × 算法 × PQ 状态；隐私保证按观察者分列。
- 关键代码片段：账户 `__validate__` / `__execute__`、Falcon 验证核心、STRK20 nullifier / note 派生、Shadow Account execute 与地址派生。
- 区分：源码已实现 / 主网已上线 / 路线图 / 媒体报道 / 推论。

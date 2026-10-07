---
title: NEAR 深度拆解：分片链架构、Intents / Privacy / AI 产品栈与生态
summary: 讲清 NEAR 的 L1 架构及其取舍，拆解 Intents、Confidential Intents、NEAR AI 的原理和它们与链基础设施的配合方式，调研用户实际在用什么，并总结 Mantle 能学到什么
slug: near-deep-dive
domain: crypto
tags: [near, mantle, interop, ai-agent]
visibility: private
---

# NEAR 深度拆解：分片链架构、Intents / Privacy / AI 产品栈与生态

## 想知道什么
1. 技术架构 deep dive：NEAR 怎样把 Privacy、Intents、AI 这些叙事装进同一套基础设施？做了哪些优化，又接受了哪些 tradeoff？
   - L1：账户模型（命名账户、Full-Access / Function-Call key、gas keys）、异步 receipt 执行与跨合约调用、Nightshade 分片与 stateless validation、动态 resharding、拥塞控制、yield/resume、global contracts、出块与 finality、1M TPS 基准的条件、SPICE 路线（区分已上线和计划）。
   - 链抽象层：Chain Signatures（MPC 网络、密钥派生、签名流程、信任假设）、CKD、跨链桥（Omni / PoA / HOT）。
   - 讲清“哪些是一条链上的能力，哪些是链外 / 别的执行环境”，每层的信任边界。
2. 核心产品 deep research：每个产品的逻辑与原理，以及它用到了哪些 NEAR infra 设计。
   - NEAR Intents：verifier 合约（`intents.near`）、`token_diff` 等 intent 类型、solver / Message Bus、1Click API、一笔跨链 swap 的完整生命周期、费用、出入金桥。
   - Privacy：Confidential Intents（FAR 私有链、shield / unshield、私有 relay、TEE）、对谁保密 / 不对谁保密、SHIELD 合规层。
   - AI：NEAR AI Cloud（TEE 机密推理与 attestation）、IronClaw agent runtime、Shade Agents（已停止维护）、agent 支付。
3. 生态：NEAR 用户实际在用什么产品？链上活跃度、头部应用（Intents 分发渠道、HOT、RHEA、LST、Sweat 等）、指标口径；NEAR 给用户提供的哪些功能真正被接受。
4. Mantle 能学到什么：NEAR 是否是“产品驱动 chain infra 迭代”的典型例子（用叙事 / 产品 → infra 升级的时间线检验）；链项目方应该如何开发和运营。

## 为什么现在
NEAR 一直在不同叙事之间切换、能追实时热点，用户量大，目前核心产品是 Privacy、Intent-based swap / bridge 和 AI。希望从它的经验中总结出链项目方应该如何开发和运营，给 Mantle 做参考。

## 范围
- 包括：L1 与链抽象层架构及取舍、三条核心产品线的原理与 infra 映射、生态使用数据与口径、叙事与 infra 演进时间线、近期安全事件（2026-10-01 Intents 事件）作为组合风险案例、对 Mantle 的启示（可结合 mStocks、PropAMM / JIT Router、preconfirmation 等方向作为背景，只用公开或已确认的信息）。
- 不包括：投资建议与代币价格分析；完整代码审计；Mantle 正式路线承诺；NEAR 治理与基金会财务细节。

## 读者
Mantle devs：懂 EVM 和 rollup 基础，不熟悉 NEAR（分片、异步执行、账户模型）。报告要技术向、用词精准，能让 devs onboarding NEAR 的设计。

## 已有资料
- `Research Briefs/drafts/near-deep-dive.md`：用户的原始想法与需求。
- `Research Briefs/references/near-deep-dive.md`：GPT Deep Research 结果，只当线索，论断要追到一手来源。
- 资料之外：允许补查一手来源（nearcore / intents 合约 / MPC 源码固定 commit、NEP、官方文档、链上与面板数据、官方公告）。

## 交付要求
- research 模式 explainer：5 分钟拿到结论，30 分钟能讲清机制，完整阅读能复核。
- 必须有图：NEAR 分层产品栈与信任边界、异步 receipt / 跨合约调用时序、stateless validation 角色分工、Chain Signatures 签名流程、Intents 一笔跨链 swap 时序、Confidential Intents shield → 私有交换 → unshield、NEAR AI 组件关系、叙事 / 产品与 infra 升级的时间线。
- 要有关键代码片段（跨合约 Promise + callback、`token_diff` intent、Chain Signatures `sign` 请求、1Click quote 请求等）。
- 生态数据写明来源、时间点和口径。

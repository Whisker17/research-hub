---
title: BSC 近期开发方向：CAS20、Payment Lane 与 Jenner 升级
summary: 讲清 BSC 近几个月在开发的 CAS20 原生资产、Payment Lane 支付预留空间等功能是做什么的、怎么实现、进度到哪，并与 Base B20、Tempo 对比
slug: bsc-recent-development
domain: crypto
tags: [bsc, payment, rwa, propamm]
visibility: private
---

# BSC 近期开发方向：CAS20、Payment Lane 与 Jenner 升级

## 想知道什么
1. CAS20 precompile：它做什么、怎么做（stateful precompile 执行路径、Factory 与地址编码、Asset / Stablecoin 变体、角色 / 策略 / 扣押、gas 计量、Activation Registry 激活）？它和 Base B20 precompile 是什么关系：fork、参考设计后重写，还是各自独立？差异在哪里？
2. Payment Lane：它做什么、怎么做（payment 交易如何分类、quota 如何计算与校验、读 parent state 与 live state 的分工、在出块 / 验块流水线中的位置）？它和 Tempo 的 payment lane 是否是同类设计？异同在哪里？
3. 我没注意到的其他开发方向：盘点 bsc / reth-bsc / BEPs 仓库近期的主要开发线（例如 Jenner 范围内的其他 BEP、Builder Blind Signing / BidBlock、上游 geth 同步与回撤、BAP-710 PropAMM Relayer 等），每条讲清做什么、怎么做、原理和工作流程。
   - （2026-10-09 补充）BAP-710 的 relayer 为什么存在：是不是为了减少做市商与多个聚合器之间的重复集成？它和以太坊上 Flashbots 的 PUR（Priority Update Registry）合约是什么关系？
4. 进度：每个功能分别处于 规范 → Go / Rust 实现合并 → release → 测试网 / 主网硬分叉 → 治理或管理员激活 的哪一步？
5. 合起来看，BSC 近期的发展方向是什么？

## 为什么现在
我用 bot 追踪 BSC 仓库的 commit，最近看到 CAS20 precompile 和 payment lane 等改动，想全面了解 BSC 近期的开发方向。

## 范围
- 包括：2026 年 6 月（Pasteur 前后）至 2026-10-09 的 bsc（Go）、reth-bsc（Rust）、BEPs / BAPs 仓库的开发；Jenner 硬分叉；对比对象 Base B20、Tempo payment lane；官方路线图只作背景。
- 不包括：代币价格与投资建议；完整代码审计；BNB Chain 生态应用数据；opBNB / Greenfield；对 Mantle 的启示；commit bot 追踪建议；仓库之外的方向（Agent Lifecycle Protocol / Agent Studio、隐私框架）最多一句带过。

## 读者
懂 EVM 和以太坊客户端基础的开发者，没有细读过 BSC 的 Parlia / MEV builder 流程。

## 已有资料
- `Research Briefs/drafts/bsc-development-research.md`：用户的原始想法。
- `Research Briefs/references/bsc-development-research.md`：GPT Deep Research 的结果，只当线索，论断要追到一手来源。
- 资料之外：允许补查一手来源（BEP 原文、bsc / reth-bsc 源码固定 commit、PR、release notes、官方公告、Base B20 与 Tempo 的规范和源码）。

## 交付要求
- research 模式 explainer：5 分钟拿到结论，30 分钟能讲清机制，完整阅读能复核。
- 必须有图：近期开发全景（按层：资产 / 资源配额 / 出块流水线 / 共识）、ERC-20 与 CAS20 调用路径对比、CAS20 创建时序、Payment Lane 分类决策树与配额示例、出块 / 验块流水线（标出 Payment Lane 检查发生在哪一步）、功能进度时间线。
- 对比表：CAS20 vs Base B20；BSC Payment Lane vs Tempo。
- 关键代码片段：stateful precompile 接口、CAS20 创建调用、payment 分类函数、配额校验。
- 区分“已上线”“已合并未激活”“只是提案”。

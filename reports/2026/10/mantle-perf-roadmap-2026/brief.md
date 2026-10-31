---
title: 2026 Mantle 性能优化路线：评审与实验方案
summary: 评审作者起草的 2026 Mantle 性能优化路线和出块路径实验 E1–E8，核对外部评审与一手来源，给出可执行的实验设计、判读规则和短 / 中 / 长期排期
slug: mantle-perf-roadmap-2026
domain: work
tags: [high-performance, mantle]
visibility: private
---

# 2026 Mantle 性能优化路线：评审与实验方案

## 想知道什么
1. Mantle 当前（2026-10-31）的性能相关基线是什么：主网参数（区块时间、gas target / limit、EIP-1559 参数）、执行客户端与版本、预确认（preconf）与 eager build 的实现与默认配置、DA 路径、证明路径？哪些能从公开源码和链上确认，哪些只能当假设？
2. 草稿路线里的每个方向（网络广播、出块路径、更短区块、区块空间分配与排序规则、revm → evm2、Parallel EVM、commitment 结构、DB、state expiry、DA、多证明系统）：外部最新状态是什么，对 Mantle 是否适用，草稿给出的紧急程度是否合理？
3. 出块路径实验 E1–E8 的设计能否支持草稿里“结果 → 优化举措”的结论：对照组、样本量、指标口径、阈值是否成立？需要补哪些实验？
4. 外部 Deep Research（GPT）的评审意见里，哪些代码发现和外部论断属实，哪些错误或过时（例如 preconf journal 的持久化、`--preconf.all` 对对照组的影响、Reth evm2 发布、BPO2 数字、Base 200ms 区块、EIP-1559 参数方向）？
5. 综合以上，重排后的短 / 中 / 长期路线是什么：每一项的进入条件、实验、继续 / 停止判据和依赖关系。

## 为什么现在
作者起草了 2026 Mantle 性能优化路线和一组出块路径实验，准备作为开发排期与上线判据；同时 Reth 切换到 evm2、Base 原生 200ms 区块进入测试网、Mantle 公开代码引入了预确认子系统和 eager build，需要在排期前核实这些事实并修正实验设计。

## 范围
- 包括：草稿路线表与 §2.1 出块路径实验；Mantle 公开源码（mantle-v2、reth、op-geth、op-succinct、kona）与主网链上参数；外部项目（Base、OP、Arbitrum、MegaETH、Monad、Sei、RISE、Tempo、BSC、zkSync、Succinct）的一手资料；实验方法（排队、尾延迟统计、对照）。
- 不包括：实际在 QA 链上运行实验；代币经济与行情；给其他公司的建议；Mantle 内部未公开的生产配置（只标为待核实）。

## 读者
Mantle 协议 / 基础设施工程师和本路线的负责人：熟悉 OP Stack、reth、预确认的基本概念，要拿这份报告排期和设计实验。

## 已有资料
- 作者草稿（Notion drafts）：https://app.notion.com/p/40a2f04c436c80d5b8faced5ebb2d5ed
- GPT Deep Research 评审（Notion references）：https://app.notion.com/p/40a2f04c436c8053b3b9daa3932f6505
- research-hub 已有相关报告：high-performance-chain-roadmap（组件全景与 2026 基线）、revm-vs-evm2、application-specific-sequencing
- 资料之外：允许补查一手来源（官方文档、规范、源码、链上数据、发布记录）

## 交付要求
- 先给结论：哪些方向保留、哪些改写、哪些提前或后置；再逐项给出实验设计与“观察 → 结论 → 措施”判读表。
- 区分“公开代码 / 链上可确认的事实”“需要内部核实的假设”“建议”。
- 排期是建议，不是 Mantle 已批准的路线。
- 中英双语。

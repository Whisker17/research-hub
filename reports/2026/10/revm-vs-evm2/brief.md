---
title: EVM 执行引擎工程调研：revm、evm2 与 Mantle 的执行层选择
summary: 从代码层面拆解 evm2 相对 revm 的工程优化与代价，核实 Base / RISE / MegaETH 的真实迁移状态，并对照主流 EVM 实现，列出 Mantle 执行层可改进的点。
slug: revm-vs-evm2
domain: crypto
tags: [evm, mantle]
visibility: private
---

# EVM 执行引擎工程调研：revm、evm2 与 Mantle 的执行层选择

## 想知道什么
1. **evm2 的优势是什么**：从工程角度详细拆解 evm2（alloy-rs/evm2）相对 revm（bluealloy/revm）的每一个优化点（解释器热路径、dispatch、类型与扩展边界、JIT/AOT、异步 host、并行 / BAL 等），每一点都要有源码（`repo/path:line@commit`）或官方文档级别的证据。
2. **为什么会有从 revm 切换到 evm2 的需求**：revm 本身存在哪些问题和限制？哪些是设计取舍（通用性、顺序执行、抽象层），哪些是可以在 revm 内部修掉的？
3. **业界真实动态**：gakonst 关于“新 EVM、内置 JIT、刚完成审计”的推文；Base 从 revm 切到 evm2 的公开状态；RISE 对 revm 的处理（原始资料说是“降级版本”，需要核实）；MegaETH 是否有切换计划（内部信息拿不到时，以公开代码为准并标明）。
4. **其他活跃且被广泛使用的 EVM 实现**：geth core/vm、evmone、Nethermind、Besu、ethrex LEVM、revmc 等，各自的热路径设计与可借鉴之处。
5. **Mantle 当前使用的 revm 与这些实现相比的缺失**：Mantle 栈里 revm 具体用在哪（执行客户端、证明 / kona、其他工具）、版本是否落后，以及可以改进和优化的点，按优先级给出。

## 为什么现在
- 2026-10-25 gakonst（Paradigm）发推：新 EVM 刚完成审计、内置 JIT，将成为 Foundry / Reth / Tempo 的未来。
- Base 的仓库已引入 evm2；RISE 宣布把 revm 下游化为自有 RISE VM；MegaETH 据说有内部迁移计划。
- Mantle 需要判断：是否跟进 evm2，以及在不迁移的情况下 revm 栈有哪些可以先做的改进。

## 范围
- 包括：revm 与 evm2 的架构与源码对比；revm 的限制；Base / RISE / MegaETH 的公开证据；其他主流 EVM 实现的热路径设计；Mantle 执行层的改进点与迁移路线。
- 不包括：完整执行客户端的 P2P、同步、数据库选型的深入对比；非 EVM 虚拟机（SVM、MoveVM）；对 Mantle 之外公司的建议。

## 读者
Mantle 的 devs / CTO：熟悉 EVM 与 Rust，需要在前面看到 high level 的工程对比与优劣势总结，后面按优化点逐项深入。

## 已有资料
- Notion drafts（用户想法）：https://app.notion.com/p/drafts-4042f04c436c80bd9d07da2d08903d6e
- Notion references（GPT Deep Research 结果，2026-10-25）：https://app.notion.com/p/references-4042f04c436c8054900fe68107506537
- https://github.com/bluealloy/revm 、https://github.com/alloy-rs/evm2
- https://x.com/gakonst/status/2114190575486538225 、https://x.com/hai_rise/status/2112498280294924768
- 资料之外：允许并要求补查一手来源（源码、官方文档）；GPT 结果只当线索。

## 交付要求
- 最前面是 high level 的工程对比与优劣势总结表；之后对每个优化点逐项分析。
- 所有内容都要有代码佐证，没有代码时至少有官方文档级别的 reference；务必准确、技术向。
- 单独一节：Mantle 的 revm 与其他实现相比的改进与优化点。

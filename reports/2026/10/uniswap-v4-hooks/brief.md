---
title: Uniswap v4 Hooks：机制、v3 可行性与 RWA 应用
summary: 讲清 v4 hook 的机制与生命周期，判断哪些能力依赖 v4 架构、能否在 v3 上实现，并解析合规 / RWA 与其他代表性 hook 的交易流程
slug: uniswap-v4-hooks
domain: crypto
tags: [uniswap, rwa, dex]
visibility: private
---

# Uniswap v4 Hooks：机制、v3 可行性与 RWA 应用

## 想知道什么
1. Hook 的机制与原理：PoolManager 单例、unlock 回调与 flash accounting（EIP-1153 transient storage）、delta 记账与 settle / take、ERC-6909 claim、hook 权限位编码在地址里（CREATE2 挖地址）、各个回调（before/after initialize、add/remove liquidity、swap、donate）、return delta（自定义记账 / 自定义曲线）、动态手续费、hookData。用一个简单的 hook 例子，从部署到 initialize、加流动性、swap，完整走一遍工作流程和 lifecycle（要有图和代码片段）。
2. Hook 依赖 v4 本身的哪些优化？能不能直接在 v3 上实现？逐项判断：哪些能力离不开单例 + flash accounting + delta 记账（例如自定义曲线、池内记账、低成本建池），哪些在 v3 上可以用外部包装（router / periphery）、fork（例如 v3 系的插件式 AMM）近似实现，代价是什么。
3. 合规与 RWA 方向的 hook：Uniswap 官方文档和 blog 里的合规 / 许可池 / RWA 相关例子（例如 permissioned pools），以及其他项目的 KYC、allowlist、代币化股票、预言机 / 休市保护类 hook。每个 hook 讲清机制原理、lifecycle 和一笔交易的完整流程；为什么在 v4 上“给 ERC-20 加黑名单”不够、必须做在池子层；对聚合器路由和流动性的影响。
4. 重点场景：以代币化股票作 quote 的 meme launchpad。发射时用股票代币计价，曲线阶段结束（毕业）后不做流动性迁移，直接在同一个 v4 池里继续交易。讲清 hook 怎么实现“池内毕业 / 相变”（曲线报价、阈值判定、切换到集中流动性、储备如何换算成 LP 头寸），股票 quote 带来的额外 hook 需求（休市期间的预言机偏离熔断、拆股分红等公司行动、准入与合规），并对照已有实现（Pons V2、PAIR、Bankr 的股票计价发射、Zora / Doppler）和用户资料里的 Tape 设计。要有完整的交易时序图。
5. 其他有代表性的 hook：按采用量和设计意义挑选，例如动态手续费、MEV / LVR 保护（拍卖类）、TWAMM、限价单、launchpad 类（Clanker、Zora / Doppler、Flaunch、Pons，可与 meme-launchpad 报告互相引用）、流动性再利用类。同样讲清机制与交易流程。
6. 工程与安全：常见 hook 漏洞与审计要点（回调访问控制、delta 记账错误、可升级 hook 对 LP 的风险、恶意 hook）、gas 开销、聚合器是否路由带 hook 的池、hook 生态的采用数据。

## 为什么现在
Hooks 是近期 DEX 方向最受关注的设计空间，RWA / 代币化股票的合规交易也开始落在 v4 hook 上。需要给 dev 团队做一次内部技术分享，让大家能读懂、评审、动手写 hook。

## 范围
- 包括：v4 hook 机制与原理、简单 hook 的完整生命周期、v3 可行性分析、合规 / RWA hook、股票 quote launchpad 的池内毕业 hook、其他代表性 hook 的机制和交易流程、工程与安全要点、对 Mantle 的意义（合规和 RWA 池放在哪一层、链需要支持什么，例如 EIP-1153、v4 在 Mantle 上的部署现状）。
- 不包括：Uniswap 治理与费用开关；投资建议；对具体 hook 的完整代码审计。

## 读者
Mantle dev 团队：懂 Solidity，了解 Uniswap v2 / v3 的基本原理（恒定乘积、集中流动性），没有写过 v4 hook。读完要能讲清 hook 的执行流程、判断一个 hook 设计是否必须用 v4，并能评审合规类 hook 的设计。

## 已有资料
- `~/Work/research/work/mantlev3-roadmap/2-meme-launchpad/outputs/05-compliance-and-permissioning.md`：合规分层与 Uniswap v4 Permissioned Pools（为什么代币转账黑名单看不到池内换手）。
- `~/Work/research/work/mantlev3-roadmap/slides/references/bonding-curve-v4-graduation.md`：bonding curve 与 v4 毕业的机制核对。
- vault `Notion/Mantle Research/RWA/How to Build An On-chain Tokenized Stocks Protocol.md`：ERC-20 transfer hook 与 ERC-3643 的合规思路。
- `~/Work/research/work/mantlev3-roadmap/2-meme-launchpad/tape-design.md`：股票 quote launchpad 的 Mantle 设计（单池相变、休市熔断 hook、公司行动 hook），作为重点场景的方案对照；`xstocks-inputs.md`：xStocks 资产约束（multiplier 等）。
- research-hub 报告 `meme-launchpad`（含 `research/notes-*.md`）：launchpad 类 hook（Clanker、Zora、Pons、PAIR）的机制与 v4 hook 原语。
- 资料之外：以一手来源为主——Uniswap v4-core / v4-periphery 源码（固定 commit）、官方文档与 blog、hook 项目的源码与审计报告。查不到的标 speculative。

## 交付要求
- 一页 research 模式 explainer：5 分钟拿到结论，30 分钟能讲清机制，完整阅读能复核。
- 必须有图：v4 架构（PoolManager、hook、router 的关系）、一次 swap 的完整时序（unlock → 回调 → beforeSwap → 计算 → afterSwap → settle / take）、hook 生命周期、v3 与 v4 的对比、每个重点 hook 的交易时序、股票 quote launchpad 从发射到池内毕业再到继续交易的时序。
- 要有代码片段：简单 hook 示例，以及关键接口（权限位、回调签名、return delta）。
- 每个 hook 用统一维度对比：用到哪些回调、改了什么（准入 / 费用 / 记账 / 曲线）、对 LP 和交易者的信任假设、主要风险。

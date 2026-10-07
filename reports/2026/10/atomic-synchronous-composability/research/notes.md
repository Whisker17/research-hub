# 调研笔记索引：原子同步可组合交易（EEZ）

调研分四册完成（2026-10-06；网页来源均在当天访问；源码固定 eez-core-protocol @ `6ae4110`、eez-rollup0 @ `6ff63ec`）。合并台账见 [ledger.md](ledger.md)（200 行：observed 165 / inferred 31 / speculative 4）。外部调研（ChatGPT Deep Research）已用 `rh import research` 存为 [atomic-synchronous-tx.md](atomic-synchronous-tx.md)，只当线索使用。

| 分册 | brief 研究问题 | 一句话答案 |
|---|---|---|
| [notes-mechanism.md](notes-mechanism.md)（M） | 1 机制、组件、生命周期、infra 改造 | EEZ 不让 L1 在执行中去读 L2，而是**先算后验**。composer 链下同时模拟 L1 和 L2，把结果写成 execution table，由 proof system 背书后通过 `postAndVerifyBatch` 上链。同一 L1 区块内，代理调用逐条消费 entry：先核对前置 root，再真实执行 L1 调用，用 rolling hash 核对交互轨迹，核对 ETH 守恒，最后推进 root；任何一项对不上就回滚。Ethereum 不需要硬分叉，但 L2 客户端（`0x76` 系统交易、预部署、全新 genesis）、composer、signer、L1 builder（同块 bundle）和 deriver 都要改。 |
| [notes-tx.md](notes-tx.md)（T，主会话） | 2 首笔主网交易 | 这是一笔“L1 用户向自己在 rollup 1 上的地址转 0.001 ETH”的同步存款，由同一区块里相邻的两笔交易组成：tx31 由 composer 调用 `postAndVerifyBatch`（1 个 blob、1 个 ECDSA 签名、2 条 entry），tx32 由用户向 CrossChainProxy 转账，并消费 entry1，把 rollup 1 的 root 从 `0x30d8…` 推进到 `0x5452…`。三个哈希都在本地复现。没有演示返回值、L2→L1 调用、嵌套或 ZK。 |
| [notes-alternatives.md](notes-alternatives.md)（A） | 4 其他路线对比 | 能做到 L1↔L2 带返回值真同步的，只有“预计算 + 同 slot 验证 + builder 原子打包”这一族（EEZ、Gwyneth ULTRA TX、SCOPE、Vitalik 的混合方案）。shared sequencer 只保证原子包含；OP interop 和 AggLayer 是消息传递；intents 是结果原子、过程异步。截至 2026-10-06，只有 EEZ 在主网跑通过，而且用的是签名证明。 |
| [notes-ecosystem.md](notes-ecosystem.md)（E） | 3 生态意义、外部观点、Mantle L2↔L3 | 外部观点集中在统一流动性、deploy once、跨 rollup 闪电贷 / 套利 / 清算、L2 直接调用 L1 流动性；质疑集中在 composer / builder 中心化、跨域 MEV 和 non-interleaving。GIP-153 已于 2026-08-19 通过，首版用 TEE、中心化 composer、单向组合。Mantle 已是 OP Stack + OP Succinct + Ethereum blobs，原生币 MNT，2 秒出块，支持 EIP-1153。把父链换成 Mantle L2 是可行的设计方向，但要解决 MNT 原生币语义、`0x4200…0007` 预部署冲突、L2 上没有 blob 路径、排序器配合同块打包这几件事。 |

## 主会话抽查（2026-10-06）

- E12–E17（GIP-153）：投票结果、TEE 过渡证明、Gnosis Ltd 中心化运营 composer、上线时单向组合、2027 年完整规范，与 Gnosis 论坛原文和 DAO 8 月月报一致。
- M（原帖）：作者 Jordi Baylina；“~12 GPUs、~7 seconds”；“No L1 Fork Required”；Action / nextAction 表结构；`REVERT` / `REVERT_CONTINUE`。与 ethresear.ch 原文一致。
- T4：主网实现的已验证源码与 `6ae4110` 的四个核心文件逐字节相同，因此 M 分册基于该 commit 的源码分析适用于主网部署。
- T14、T15：proxyEntryHash 与 rollingHash 用源码公式本地复算，结果与链上一致。

## 资料（外部调研）中被修正或补充的地方

- 外部调研 §8 把发送者、目标合约、proof 类型、是否同一交易信封都列为“未核实”。现已全部核实：目标是 CrossChainProxy；proof 用 ECDSAProofSystem，threshold 1；验证与消费是**同一区块里相邻的两笔交易**，不是同一个交易信封（T 分册）。
- 外部调研 §9.3 引用 GIP-153 时没有给出投票结果，也漏掉了“上线时只有单向 L2→L1”这个关键限制（E 分册）。
- 外部调研把 Gnosis 博客的“No new trust assumptions”与 GIP 原文混在一起；GIP 原文承认过渡证明会增加信任假设，以 GIP 原文为准（E 分册）。
- 当前 L1 接口里不存在 `RollupStateUpdate` 这个名称；L1 用 `RollupUpdate` / `L2ToL1Call`，`CrossChainCall` 是 L2 侧的名称（M 分册）。
- rollup0 的 signer SPEC 钉住的是 core 的旧 commit（`6fcc90b6`），而且要求 `blobIndices` 为空、`blockNumber=0`；主网 batch 用了 blob，并绑定最新区块。所以公开 SPEC 与主网运行的栈不是同一版本（T27）。
- Astria 已于 2025-12 停机；OP interop（Lagoon）仍未定档（A 分册）。

## 开放问题

- rollup 1 的 L2 chain ID、L2 RPC 或浏览器、与本交易对应的 L2 交易，没有找到公开入口；blob 里 142 字节的 L2 数据没有解码。
- 主网首笔交易的 L1 builder 是谁、是否走了私有 bundle 通道，没有核实。
- ECDSA 签名对应的 publicInputsHash 没有在本地复算。
- outbound entry 被跳过后，L2 节点如何重组到 L1 实际停留的前缀（M54，speculative）。
- Mantle：L2 是否接受 blob 交易（E45，speculative）；Mantle 没有任何 L2↔L3 同步组合的官方计划（E58）。

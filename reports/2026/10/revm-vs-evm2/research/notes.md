# notes：调研索引

调研日期 2026-10-25。路径 C（外部调研）：`gpt-deep-research.md`（ChatGPT Deep Research）只当线索；全部论断追到源码 / 官方 PR / 官方文档，见四个分册。台账合并在 `ledger.md`（H / X / A / M 前缀，176 行：observed 141 / inferred 24 / speculative 11）。

主会话抽查（2026-10-25）：
- paradigmxyz/reth#25002 “refactor!: replace revm with evm2”：MERGED 2026-10-24T09:15:08Z，221 files，+17698/−10870（`gh pr view`）。✓ A8 / M26
- alloy-rs/evm2#384：Ryzen 9 7950X、revm 42.0.1、10 主网区块回放，TCO 1.19× / packed 1.10×（维护者编辑段），Apple M5 Pro 初测 1.14× raw。✓ H35
- `evm2/crates/evm2/src/evm/config.rs:20@c8bb5a2` “TODO: Custom hosts aren't that well supported yet.” ✓ X10
- `evm2/crates/jit/runtime/src/runtime/config.rs:211,372@c8bb5a2` `enabled: false`、`jit_hot_threshold: 8`。✓ H25
- `base/base/crates/common/evm2/README.md:15-18@bcd96e2` “intentionally **not** wired into the node”。✓ A20
- `mantle-xyz/revm` v107-mantle-arsia.2 `crates/context/src/cfg.rs` “[MANTLE] disable tx gas limit cap for EIP-7825” → `unwrap_or(u64::MAX)`；run 35086043320 失败用例 `osaka/eip7825_transaction_gas_limit_cap/*`，期望 `GAS_LIMIT_EXCEEDS_MAXIMUM`。✓ M6 / M8

## 各研究问题的答案

1. **evm2 的优势**（`notes-hotpath.md`、`notes-extension.md`）：真实优势集中在解释器热路径——编译期选定的 dispatch 后端（nightly 上 TCO 尾跳，stable 上 packed 寄存器传参）、每个 spec 一张编译期常量指令表（去掉运行时 spec 检查与 gas 查表）、pc / 栈长度 / 剩余 gas 留在寄存器、32B 对齐栈、递归 CALL 不分配 Box；以及同仓的 JIT/AOT（revmc 移植，默认关闭，只支持 `BaseEvmTypes`）。唯一公开的对 revm 正面实测是 1.10–1.19×（evm2#384），README 的“up to 2x”没有公开数据。BAL、异步 DB、account-ext 在 revm main 也有；evm2 的组件边界（DB / 预编译 / Inspector / tx handler）反而是运行时 `dyn`，自定义 host 尚不支持。
2. **revm 的问题和限制**（`notes-hotpath.md` H-Q5、`notes-extension.md` X-Q7）：设计取舍——中心循环 + `&mut Interpreter` 的 handler 签名、运行时可变的 Box 指令表、运行时 spec 检查、共享内存 + 非递归 frame 栈、类型参数外溢、owned `TxEnv`、顺序执行的 Journal、公共 trait 暴露解释器内部（#3776）。TCO 等技术 revm 能做（#3556 已实现），但三次尝试都没合入，SharedMemory 替换被维护者拒绝；evm2 仓库在 #3601 被拒一周后创建。破坏性版本节奏约每月 1.35 个主版本。
3. **业界动态**（`notes-adoption.md`）：reth main 已在 2026-10-24 用 evm2 替换 revm（未发布）；gakonst 推文未点名，推断即 evm2；Foundry draft、Tempo PR 未合并；审计只有 SIGP-xxx 修复项、无公开报告。Base：并行开发 + 差分测试，未接入节点。RISE：下游化 revm 为闭源 RISE VM，pevm 的 revm 只升不降，“降级”说法无证据；2× 指整节点 payload p95。MegaETH：公开代码仍是 revm 40.0.3 + 自建 revm fork；有工程师原型移植 L2 到 evm2 的信号，迁移计划未公开。
4. **其他 EVM 实现**（`notes-mantle.md` M-Q2）：geth（生成 switch + PGO、两级 jumpdest 缓存、并行 prefetcher、新旧循环 CI 差分）、evmone（baseline + cgoto / advanced 块级预计算）、Nethermind（函数指针、栈池、并行预热、BAL 并行校验）、Besu（实验性 EVM v2，`long[]` 栈，v1↔v2 差分测试）、ethrex LEVM、revmc。EIP-7904 现行结论：6 个完整客户端在 100 Mgas/s 目标下不调 gas。
5. **Mantle 的缺口与改进点**（`notes-mantle.md` M-Q1、M-Q3）：同一份 fork（revm 38 / op-revm 19）用在 reth 与 OP Succinct 证明路径；文档化 sequencer 是 op-geth。落后 upstream 5 个 revm 主版本；op-revm 已迁到 optimism monorepo；fork 的 EEST 与 cargo-deny CI 均为红（EIP-7825 核心补丁、ruint advisory）；没有持续的 op-geth↔op-revm 差分与执行层基准。按 P0–P2 给出 9 条改进点。

## 资料中被修正的地方（汇总，详见各分册）

- 漏掉 reth main 已切 evm2、op-revm 已迁出 bluealloy/revm 两件结构性事实。
- “evm2 更编译期、revm 靠运行时 + wrapper”方向不准：revm 组件全泛型单态化；evm2 只把类型族与指令表编译期化，组件走 `dyn`。
- “typed host boundary”：evm2 源码自承自定义 host 尚不支持。
- BAL、异步 DB 被当成 evm2 差异点：revm v107 已有 BAL API，main（v116）已有同作者的 fiber 异步。
- packed cursor 没有“dispatch metadata”；`EVM2_DISPATCH_BACKEND` 是构建期变量；“handler 返回剩余 gas”只对 packed 且 2026-10-23 才改。
- 没指出唯一公开对比只有 1.10–1.19×。
- Base revm 版本是 43.0.3（不是 42.0.1）；“官方 docs index”找不到，同义表述来自 crate README 且部分过时。
- RISE：不是“降级 revm”；2× 是整节点 payload p95；GPT 把并行状态 / 调度器加进了推文没说的因果链。
- 建议自建 `MantleEvm` trait：Mantle 已经经由 alloy-evm `EvmFactory` 接入，但该层本身是 revm 形状，换不了 VM；reth 的做法是整体替换。
- P1 “可吸收的优化”（帧 / 栈复用、jumpdest 缓存、prewarm、precompile cache）在 revm 38 / reth v2.2.0 大多已有。
- EIP-7904：把旧的 7 个独立 EVM 报告（revm 18）与现行 6 个完整客户端的结论混在一起。
- PropAMM / JIT Router 相关建议无一手来源，未采用。

## 开放问题（汇总）

见各分册“开放问题”。最影响决策的三条：
1. Mantle 主网 sequencer 的执行层与 reth 的生产角色（需运维一手材料）。
2. OP upstream（op-reth / op-revm）是否、何时跟进 evm2。
3. Mantle 实际负载下 EVM 解释器在区块处理时间中的占比（需要回放基准）。

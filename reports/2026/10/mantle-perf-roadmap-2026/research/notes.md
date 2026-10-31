# notes：调研索引

调研日期 2026-10-31。路径 B + C：作者草稿（Notion drafts）+ 外部调研 `gpt-deep-research.md`（ChatGPT Deep Research，只当线索）。三路并行调研 + 主会话核对，台账合并在 `ledger.md`（K / P / X / D / U / G / R 前缀，317 行：observed 212 / inferred 93 / speculative 12）。

| 分册 | 内容 | 行 |
|---|---|---|
| `notes-main.md` | 生产部署画像、链上参数、内部证明网络与压测工具、方法学计算 | K1–K40 |
| `notes-preconf.md` | reth 与 op-geth 两套预确认、eager build、E1–E6 评审、短区块、网络、读路径 | P1–P88 |
| `notes-exec.md` | reth 依赖基线、evm2、state root 与持久化、builder 路径、pEVM、commitment / DB、zkVM 中的 MPT、state expiry | X1–X88 |
| `notes-da-proof.md` | blob 容量、Mantle batcher、Jovian DA footprint、EIP-1559 参数、证明流水线、多证明、lanes | D1–D70 |
| `notes-synthesis.md` | 草稿陈述、GPT 核对、路线综合 | U1–U5、G1–G9、R1–R17 |

主会话抽查（2026-10-31）：P45 eager build 默认 true ✓（`op-node/flags/flags.go:275-278`）；X39 op-reth builder `finish(state_provider, None)` ✓；P23 journal 追加失败仍返回 ✓（`rpc.rs:245-254`）；X15/X17 v2.9.0 发布说明 ✓（`gh release view`）；D23 DA footprint scalar 0x190 ✓（区块 0x61e2cd7 的用户交易回执）。

## 各研究问题的答案

1. **当前基线**：主网 sequencer 仍是 op-geth v1.6.3，reth（mantle-v1.6.2，上游 v2.2.0）是候选 sequencer，Sepolia 上 reth 才是 sequencer（K2、K3）。主网 2 s / 60M / target 15M / denominator 50 / elasticity 4 / min base fee 50 gwei，24 h 平均利用率 0.32%（K16、K18）。DA 是 Ethereum blob，约 7.5 分钟 1 个 blob，装载率约 5%（D12、D13）。证明是 OP Succinct validity 模式（SP1 6.4.0），每 1800 块一个 range，默认走自建 8×GPU 集群（D38、D41、K19）。
2. **路线逐项**：保留出块路径测量主线；E4、证明流水线、存储 / 持久化盘点、DA 计量校准提前到短期；evm2 改为“追平 + 对照”；短区块是协议级改造放中期；网络行改写为 L2 数据分发；LFM / lanes / pEVM / commitment / state expiry / multiproof 维持中长期（R3–R15）。
3. **E1–E8 设计**：E1 漏 5 段等待；E3 在 `--preconf.all` 下没有对照组；E4 要加故障矩阵并分两条 EL 路径；E7 的 DA footprint 判读过头；E8 的 1559 参数方向写反；40 个满块不能估计 p99；200 ms 封块阈值没有出处（P、D、K 各行）。
4. **GPT 核对**：代码发现属实（G1、G2）；漏了 op-geth 主网、builder 不接 sparse trie、每块持久化（G3、G9）；Base pending-state 参考已过时（G5）；BSC Payment Lane 时间不准（G7）。
5. **路线重排**：见 `explainer.md` 路线面板与 R 行。

## 资料中被修正的地方

- 草稿：E3 对照组、E7 DA 判读、E8 参数方向、样本量、“随上游引入 evm2”、“Reth 2.0 root 1–2 ms”当作出块背景、“MegaETH 全内存 → state expiry”、“Binance New L1”指代、“考虑压缩效率”（实际已用 Brotli、blob 只装 5%）。
- GPT：见 G 行。
- 姊妹报告 revm-vs-evm2（10-25）“reth main 已切换但未发布”已过时（X23）。

## 开放问题（最影响决策的）

1. 主网 op-geth sequencer 是否开启预确认（白名单 / all），对外宣称的承诺等级（K12）。
2. 候选 reth 与 Sepolia reth 的 `--preconf.*` 取值（all 还是白名单、预算）（P 开放问题 1）。
3. 生产节点 Storage v1 / v2，`persistence-backpressure-threshold` 与 share / suppress 参数（X 开放问题 1–2）。
4. 单个证明 range 在 8×GPU 上的墙钟时间与证明滞后分布（D 开放问题 6，K40）。
5. 路线图“分布式 GPU 证明网络等待主网”与生产自建集群的关系（D43）。

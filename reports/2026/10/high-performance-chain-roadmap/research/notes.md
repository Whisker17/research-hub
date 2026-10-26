# notes：调研索引

调研日期 2026-10-27。路径 B + C：用户资料（Notion drafts、2025 年内部高性能研究 29 篇）+ 外部调研 `gpt-deep-research.md`（ChatGPT Deep Research，只当线索）。四路并行调研 + 主会话核对，台账合并在 `ledger.md`（S / B / E / M / K / R 前缀，288 行：observed 221 / inferred 60 / speculative 7）。

| 分册 | 内容 | 行数 |
|---|---|---|
| `notes-system.md` | 系统模型、网络传播、共识与排序、执行与共识解耦、L1 扩容基线、L1 vs L2 | S1–S60 |
| `notes-l2.md` | OP Stack 出块流水线、预确认（Flashblocks / Subblocks / Denim / mini-block / PGA）、DA、证明、费用计量、读路径 | B1–B66 |
| `notes-exec.md` | 执行瓶颈分类、并行执行、VM/JIT、状态存储、state root、状态增长、硬件路线 | E1–E73 |
| `notes-mantle.md` | Mantle 升级时间线与基线、mStocks、2025 研究复核、改动级别 A–D | M1–M60 |
| `notes-mainsession.md` | 主会话：链上参数（RPC）、batcher（L1）、内部压测结果、官方路线图、抽查记录 | K1–K12 |
| （台账内） | 主会话综合推导，路线图依据 | R1–R17 |

主会话抽查（2026-10-27，见 `notes-mainsession.md` §7）：B13 Base Denim ✓、B16 OP Subblocks ✓、S22/S14 Alpenglow ✓、E5 Reth 2.0 ✓、M23/M30 Mantle 路线图 ✓。

## 各研究问题的答案

1. **组件与 L1/L2 差异**：8 个职责层 + 横切费用/计量（S-Q1 表）。L2 把实时路径（sequencer → unsafe，约 2 秒）和安全路径（batcher → L1 DA → 派生 → 证明）拆开；L1 的上限来自“最慢合格验证者能否重放与追赶”和投票轮次下界，L2 的持续能力 ≤ min(执行, DA, 证明)（S59、S60）。
2. **逐组件深入**：
   - 网络：纠删码 + 分层转发（Turbine、RaptorCast）；Rotor 未上线（S11–S18）。
   - 共识：Alpenglow Votor 2026-10-21 上线、MonadBFT 300ms/600ms、Mysticeti v2、Raptr；正常路径轮次有理论下界（S21–S40）。
   - 解耦：Monad D=3 + reserve balance；以太坊 Glamsterdam 选 ePBS 而非延迟执行（S41–S46）。
   - L2 出块：尾延迟来自 state root 与存储 IO；预确认在 2026 年从 sidecar 收回到协议或自研（Base Denim 200ms canonical、OP Subblocks、MegaETH 10ms mini-block、Arbitrum PGA）（B1–B27）。
   - DA：blob target 约 152 KB/s，所有 L2 共享；对小额交易先于 gas 成为约束（B28–B40）。
   - 证明：TEE/optimistic + 按需 ZK 成为主流；OP Succinct 公开成本过时（B41–B50）。
   - 费用：Jovian DA footprint 把 DA 写进 base fee；多维费用多数仍未落地（B51–B61）。
   - 执行/状态：Reth 2.0 把 root 尾巴降到 1–2 ms，剩余瓶颈是冷读；真实可并行度中位 <2；JIT 在主网只有个位数收益；QMDB/NOMT 是作者自测（E1–E69）。
3. **2025 研究复核**：“root 是执行的 6–10 倍”“Verkle 2025”“JIT 2 倍”“Base 下调 gas limit”“RISE 2025 上线”均过时或需修正；49.1% 是启发式口径（E70–E72、B66、M43–M54）。
4. **Mantle 路线**：Mantle 主网利用率约 0.17%，当前约束不是吞吐（K3、R1）。按改动级别 A（只改 sequencer）/ B（SystemConfig 参数）/ C（硬分叉，改 op-node + 两个 EL + kona + vkey）/ D（结算接口）排期（M-Q4、R1–R17）。

## 资料中被修正的地方（汇总）

- GPT：EIP-7928 已是 Last Call 且列入 Glamsterdam；Alpenglow 已上线但 Rotor 未上线；Glamsterdam 用 ePBS 不是延迟执行；Flashblocks 参考架构已退场（Base Denim、OP Subblocks）；漏掉 Jovian DA footprint、Arbitrum PGA、Base TEE+ZK 多证明、Kailua；“state root 会成为瓶颈”对 2026 年的 reth 方向相反；Mantle eager construction 只确认发布、未确认主网；引用错位（49.10%、Arsia 压测、mStocks 路线）；“旧压测已覆盖预确认/batcher/证明”无结果支持（主会话另在私有仓库找到 2026-06 的清算压测结果，K7–K10）。
- 2025 内部研究：见 `notes-mantle.md` M-Q3 表、`notes-exec.md` 与 `notes-l2.md` 的“内部研究需修正”。

## 开放问题（最影响决策的）

1. 主网 sequencer 的 op-node 版本（是否已开 eager build）、执行客户端、preconf 车道是否启用（K5、M15、M24）。
2. Mantle 的证明时延 / 证明区间（M26）。
3. Mantle 实际负载下执行、冷读、root、持久化的时间占比；slot 级依赖图（E-Q1、M45）。
4. mStocks 发行方与转换流程的一手条款（M36）。

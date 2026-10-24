# 调研索引：BNB New L1 全面解构

调研日期 2026-10-24。四路并行（researcher agent），每路一个分册；台账已合并到 `ledger.md`（前缀 C / X / A / P，共 210 行：observed 174、inferred 31、speculative 5，含主会话 M 行）。外部调研 `BNB-new-L1-deep-dive.md`（ChatGPT Deep Research）只作线索。主要一手来源是官方文档固定快照 `references/newl1-docs@ef5a632/`（`bnb-chain/bnb-chain.github.io` `docs/newl1/`，2026-10-22 唯一提交）。New L1 客户端源码未公开，所以全部机制论断来自文档，没有源码或链上实测。

| 分册 | 研究问题 | 一句话答案 |
|---|---|---|
| `notes-consensus.md`（C） | Q1 定位 | 不是放弃 BSC：论坛置顶帖原话 “complements BSC rather than replacing it”；BNB 是唯一原生资产、不发新币、经官方桥（开发中）进入。现在只有内部多验证者 devnet；路线图计划 2026 年底 testnet、2027 年初 mainnet。 |
| `notes-consensus.md`（C） | Q7 区块 / 子区块 | 200 ms 区块、每个 proposer 连出 16 块。SubBlock 是当前出块者对“交易已纳入、位置是第几”的签名切片（~20 ms 目标，路线图写 sub-50ms，论坛写 20–50 ms），不碰 fork choice 和最终性，可被 aborted / superseded；论坛作者称它“not implemented at the protocol level … a reputational commitment”。没有全局 mempool：Gateway（普通全节点）单跳把交易交给即将出块的 producer。 |
| `notes-consensus.md`（C） | Q8 共识 | 仍是 Parlia PoSA + BLS 快速最终性（同 BEP-126），改动是 200 ms、最多 64 个验证者、投票只签排序、本地执行证伪 ExecutionCommitment 时弃权；约 +2 块（~0.5 s）排序最终。Parlia 只是 “current default”，Minimmit 是 Consensus 2.0 候选。 |
| `notes-execution.md`（X） | Q3 并行 EVM | 已成形的是**异步执行**：区块头不带执行结果，N 块的结果以 ExecutionCommitment 写进 N+D 块（D 自适应，1…D_MAX）；为堵住滞后状态带来的白嫖，按声明 gas_limit 收费、不退款。“Parallel EVM”只有一句话：基于 access list，“Detailed design is in progress”。 |
| `notes-execution.md`（X） | Q3' BSC 前史 | PEVM 1.0（BEP-130）/ 2.0（只 full sync）/ 3.0（规划，2023 年“take a break and rethink”）、TxDAG（BEP-396 Draft，只在 opBNB 链上数据与 op-geth beta）、BEP-592 BAL（2026-05 删除，改跟上游 EIP-7928）；132 个 bsc release 里没有一个启用 PEVM / TxDAG。BEP-684 是 BSC 自己的“投票与执行解耦”草案。New L1 的新东西是时间结构（排序先、执行后），区块内并行仍在设计。 |
| `notes-execution.md`（X） | Q6 OES vs ASS | 排序–执行分离只是共识与执行的时间解耦：排序权仍归当前出块者，没有应用排序 API，lane 内仍按费用优先；与应用特定排序正交，只能当它的底座。Multi-Lane 是按 `to` 地址的容量保底，不是排序权。 |
| `notes-account.md`（A） | Q2 Native AA | `0x76` 协议原生 AA：1–64 原子调用、secp256k1 / P256 / WebAuthn、root / admin / access 三级 key（AccountKeychain 预编译）、代付与 token_fee。它与 Tempo Transaction 同类型号 `0x76`、12 个同名字段、同名 AccountKeychain、相同的 Keychain 摘要与 gas 常量——是 Tempo 设计的 BNB 变体（inferred）；去掉了 fee_token 与 7702 式委托，2D nonce 未启用，花费上限只限原生币。EIP-8130 已收窄为 “Keystore Accounts”（交易类型拆到 EIP-8430 草案），验证器可插拔，New L1 的签名方案是协议固定的。 |
| `notes-privacy.md`（P） | Q4 隐私 | ShieldedPool：note + Merkle + nullifier，两个 BN254 PLONK 证明（pool + auth），只支持原生 BNB，`0x77` 无发送方交易或 relayer 提交；导入公共 SRS、电路未审计。atomic call 能“用池内余额触发一次公开调用、结果以 open note 回池”，所以不只是支付，但不是隐私执行 / confidential DeFi。 |
| `notes-privacy.md`（P） | Q5 PQ | “lattice hash” 是 LtHash 状态承诺（BLAKE3 XOF → 1024×u16 求和，同 Solana SIMD-0215），不是签名，更不是 Falcon；共识 BLS、账户 secp256k1 / P256 / WebAuthn、隐私证明 BN254 都不是 PQ，PQ 授权只是“预留、未实现”。ePrint 2026/2083（2026-09-18）对同参数 LtHash16 给出约 2^81 查询的碰撞攻击，SIMD-0215 已改写安全论证，New L1 文档仍写 “~128-bit”。 |

## 资料中被修正的地方（外部调研）

1. 验证者“约 64 个”应为“最多 64 个”（C31）；`ordered` 不等于排序不可逆（C27、C34）；~20 ms 预确认是目标值不是测量值（C11、C13）。
2. 漏掉了“投票只签排序 + 执行被证伪时弃权”（C33、C36）、Minimmit / Consensus 2.0（C39）、TEE Gateway 论坛提案（C26）、“complements … rather than replacing” 原话（C1）。
3. “parallel scheduler 标为 in progress”不准确：标 in progress 的是整个 access-list 并行 EVM（X2）；adaptive lag 是写成机制的（X6、X7、X11）。
4. BSC 并行执行史缺结局：PEVM / TxDAG 从未进官方 release（X29），BEP-592 已删除（X32、X33），漏了 BEP-684（X35）。
5. AA：不是“Root / Admin / Delegated / Sponsor 四层”，代付人是另一个账户（A11、A21）；token_fee 在用户调用**之前**执行（A23）；花费上限只限原生币（A16）；严重低估了与 Tempo 的相似度（A34–A37）；EIP-8130 描述过时（A44、A45）；“paymaster / 4337 未实现”是隐私池的条目，不是 AA（A31）。
6. 隐私：漏了 split proof 与 BN254（P5、P6）；atomic call 的结果是 open note，回滚时花费不撤销（P18、P19）；“约 128-bit”已被 ePrint 2026/2083 质疑（P33–P35）；“PQ 组件 = LtHash”不是官方表述（P45）；accumulator-native 证明是计划不是现状（P38）。
7. 我们自己的前文 `native-aa-eip-8130-8141`（2026-10-04）把 `0x79` 信封写在 8130 名下，已过时（A44、A45）；`bsc-recent-development` F10 关于 BEP-592 删除所在版本的说法应以 release notes 为准（v1.7.6 / v1.7.7，见 notes-execution “矛盾记录”）。

## 矛盾

- 预确认延迟：文档 ~20 ms vs 路线图 sub-50ms vs 论坛 20–50 ms（C11）。
- 排序最终性用几个区块：+2 块（consensus.md）vs “roughly one block interval”（API 页）vs “1–few”（状态阶梯）。
- `eth_subscribe("newHeads")` 跟 ordered 还是 executed tip：async-execution.md L90 与 transaction-lifecycle.md L177 相反。
- 验证者上限 64 vs `eth_getFinalizedHeader` 参数 `[2, 21]`（C44）。
- 迁移文档“约 3.75×”用的是 BSC 750 ms 旧基准，现应约 2.25×（C43）。
- Multi-Lane “no equivalent on BNB Smart Chain” vs BSC Payment Lane（BEP-703，Jenner 未激活）：同类但不同设计（X47、X48）。
- 性能目标演变：Tech Roadmap 2026 “约 1M TPS、150 ms” vs H2 路线图 “100K+ TPS、sub-50ms”。

## 开放问题（汇总）

1. 客户端源码何时公开；devnet 实际验证者数量与跨地域 200 ms + BLS 聚合的实测。
2. access-list 并行 EVM 的设计（谁声明、漏报依赖怎么办、是否沿用 EIP-7928）；D_MAX 取值；积压超限怎么处理；ExecutionCommitment 出错除弃权外有没有问责。
3. Gateway 发给几个 producer、leader 失效时如何重路由；TEE Gateway 会不会落地。
4. `0x76` 与 Tempo 能否字节级兼容（类型号相同、字段不同，工具误用风险）；2D nonce 何时启用；AA 有没有 PQ 签名路线。
5. 导入的是哪份 SRS；审计与仪式时间；atomic call 有无 target 限制；ERC-20 shielding 何时上。
6. New L1 是否回应 ePrint 2026/2083（参数或条目数上界论证）；accumulator-native 包含证明与 BSC↔New L1 桥的验证方式。
7. Minimmit / Consensus 2.0 时间表；治理时间常数实际值。

## 运行记录

- 四路 researcher 并行；account / execution / privacy 三路把文件写到了 runtime 的产物目录，主会话复制进 `research/`。
- consensus 路没有 shell，C50 由主会话用 `gh` 补证升为 observed；X29 由主会话检索 bsc 全部 132 个 release 说明补证升为 observed。
- 主会话抽查记录见 `ledger.md` 表头。

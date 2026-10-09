# notes：BSC 近期开发方向（索引）

调研截止 2026-10-09。三路并行，分册如下（台账已合并进 `ledger.md`，前缀 C / P / J / S）：

| 分册 | 范围 | 台账行 |
|---|---|---|
| `notes-cas20.md` | CAS20（BEP-702）机制、激活、与 Base B20 的关系、reth-bsc 移植 | C1–C44 |
| `notes-payment.md` | Payment Lane（BEP-703）分类、配额、流水线、规范演进、与 Tempo 对比 | P1–P45 |
| `notes-jenner.md` | Jenner 其他功能（BEP-706 / 714 / 718、0x68）、BEP-675 BidBlock 与加固、geth 上游同步、reth-bsc、BAP-710、进度总表 | J1–J42 |
| 本文件 §综合 | 研究问题 5：合起来的方向 | S1–S5 |

固定版本：bsc develop `8cc60b246c`、reth-bsc develop `349f55c`、BEPs master `e9b2be3b00`、base-std `a2954a8d57`、base `f1f40baf23`、tempo `feb5dff7da`、bsc-genesis-contract `2620fb411b`（经 `gh api`）。外部调研 `bsc-development-research.md`（ChatGPT Deep Research）只当线索。

## 每个研究问题一句话答案

1. **CAS20**：Jenner 后由客户端原生执行的合规代币标准（stateful precompile，`0xCA52…` 前缀地址，Asset / Stablecoin 两个变体，角色 + 共享策略 + 扣押 + multiplier），状态写在代币账户自己的 storage 里，计费复刻 EIP-2200/2929/3529。它的接口、地址方案、存储布局逐项沿用 Base B20 / base-std（开发 commit 里直接写着 base-std / IB20 / “reference implementation's prefix 0xb2…”），代码是独立的 Go 实现，不是 Base Rust 代码的 fork。（C1–C44）
2. **Payment Lane**：每块按治理比例（默认 5%，上限 10%）给“支付类交易”保底 gas，有效性条件 `N + max(P,Q) ≤ G`；支付 = 治理名单里的顶层 `to`（按地址，初始为空）或“value>0 且接收方此刻没有代码”。比例 / 名单读父状态，code 读实时状态。和 Tempo 是同类设计（都是“普通交易封顶”），但分类、参数来源、比例倾向都不同，没有移植证据。（P1–P45）
3. **其他方向**：BEP-675 BidBlock（validator 封块前不重放 builder 的块，广播后再验证，失败撤销 builder）及其加固和 gRPC；BEP-706（0x70 毫秒时间戳预编译）；BEP-714（备用验证者初始等待 2s→1s）；0x68 按字节计价（代码绑定 Jenner，清单未列）；geth v1.17.3 同步并删除 superinstruction / incr snapshot / multidb；reth-bsc 双客户端；BAP-710 应用层 PropAMM relayer。（J1–J42）
4. **进度**：Jenner 全部功能 Go 与 Rust 都已合并，**没有任何 release 包含它们**，主网 / Chapel `JennerTime=nil`，官方计划测试网 10 月下旬、主网 11 月下旬。CAS20 之后还要治理任命 admin、admin 开启 feature；Payment Lane 名单要治理添加。主网已经能感知的变化只有 BEP-675（约 98% 区块走 BidBlock）和 gas limit 70M。（J8 表、C29–C30、P36–P37）
5. **合起来的方向**（S1–S5，inferred）：执行引擎回归上游 geth，差异化移到协议层的金融基础设施——原生资产（CAS20）、支付容量保障（Payment Lane）、builder 出块流水线与更大区块（BEP-675 + gRPC + gas limit）、细时间粒度给 RFQ / PropAMM（BEP-706、BAP-710）。这些部件之间没有自动连接。

## 综合（S 行的推理）

- S1 分层：把 J8 进度表和 BAP 提案按“作用在哪一层”归类：资产执行（C）、区块资源配额（P）、出块流水线（J9–J20、J41）、共识参数（J23）、合约可见能力（J21、J6）、链下接入（J35）。
- S2 方向：同一时间窗口里，自研执行 / 存储优化被删（J26、J27），新增的全是协议层功能（C、P、J9）。路线图（J9-Q9 背景）仍把被删项算作成果，说明这是 2026 年中的转向。
- S3 无自动连接：Payment Lane 只看顶层 `to` 且名单初始为空（P6、P10）；CAS20 的开关不碰 lane（C26）；BAP-710 是应用层 bundle（J35）。
- S4 参考方式不同：C41（有代码痕迹的沿用）对比 P43–P44（形状相同、无血缘证据）。
- S5 状态：J3、J17、J19、J32、C30、P36。

## 资料中被修正的地方（外部调研）

完整清单见各分册“外部调研的修正”。最重要的几条：
- **Tempo 支付识别**：“按 TIP-20 地址前缀”已过时，Tempo 主网 2026-06-09（T5）起按 TIP-1045 的 target + selector 白名单；sub-block 已在 T4 停用、代码已删。（P40、P41）
- **Tempo 参数**：`general_gas_limit` 是区块头字段，T1 起固定 30M；Tempo 给“非支付”封顶约 6%，BSC 给“支付”保底 5%，倾向相反。（P39、P43）
- **CAS20 transferFrom 检查顺序**：pause 最先，且顺序属于共识。（C15）
- **规范落后于代码**：BEP-702 master 仍写“事件最后、initCalls 的 msg.sender 是 creator、SEIZE_HOLDER_POLICY”；代码已改，修订 PR BEPs#716 仍 open。（C13）
- **B20 的 ERC-8056 定时 multiplier** 已随 Base Cobalt 于 2026-09-30 上主网，不是“在演进中”。（C34）
- **Payment Lane 规范演进**：博客（09-01）描述的动态方案 09-08 被删；草案曾复用 `header.UncleHash`；“PaymentGasLimit”只是博客用词。（P30–P33）
- **BEP-675 加固**：撤销持久化、跨验证者证据、零 root 拒绝已合并（未 release），不只是“计划”；98% / +28% 的窗口是截至 09-01 的三天。（J15、J17、J18）
- **遗漏**：BEP-718、0x68 重新计价、BEP-714 范围缩减、#3808 区块哈希可篡改修复、主网 gas limit 已是 70M。（J1、J6、J25、J29、J19）

## 主会话抽查（2026-10-09）

- `bsc/params/config.go:256,311` → `JennerTime: nil` ✓（C29 / J3）
- `bsc/core/paymentlane/classify.go:34-58` 判定顺序 ✓（P5）
- `gh api repos/bnb-chain/bsc/commits/57d98c2` patch 含 `base-std's published value` / `IB20` / `the reference implementation's prefix 0xb2…` ✓（C31）
- `tempo/crates/primitives/src/header.rs:39` `general_gas_limit` 头字段、`hardfork/src/constants.rs:77` T1 30M ✓（P39）
- `bsc/core/vm/contracts.go:1983-1989` 0x68 Jenner 计价 ✓（J6）；`consensus/parlia/parlia.go:2361-2370` BEP-714 restore ✓（J23）
- 主网 RPC `eth_getBlockByNumber latest`（块 126602772）：gasLimit 70,000,000，`requestsHash` 末尾为版本 `02` + builder 地址 ✓（J19、J20）

## 开放问题（汇总）

1. BEPs#716 何时合并；合并前 BEP-702 文本与两个客户端行为不一致。
2. CAS20 ActivationRegistry admin 由谁担任、何时提案；Payment Lane 首批名单提案何时提交。
3. BEP-702 §3.14 要求的激活前整块对抗性计时测量由谁做、何时公开；目前只有 reth 微基准。
4. Payment Lane 为什么在 09-08 放弃动态模型（P45，speculative）。
5. QANet 是否已在 10-05 激活 Jenner（J5，speculative）；Jenner release 是否基于 v1.8 代码线（J40，speculative）。
6. 是否有主网验证者在运行 reth-bsc；Rust BidBlock 系统交易候选检查是否与 Go #3773 一致。
7. BSC 是否会跟进 B20 Denim 的三项改动（需要按 fork 版本化，bsc 目前没有）。

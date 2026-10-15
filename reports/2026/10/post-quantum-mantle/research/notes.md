# notes：后量子（PQ）从入门到路线，Ethereum / Starknet / Aztec 到 Mantle（索引与综合）

调研日期 2026-10-16（UTC+8）。调研分五路并行，另外有主会话的链上复核和跨路综合。台账前缀：
- **T** → `notes-threat.md`：Shor / Grover、攻击面、Q-day 估计、AI 密码分析
- **P** → `notes-primer.md`：NIST 标准、方案分类、尺寸与 gas、混合签名、PQ 证明系统
- **E** → `notes-ethereum.md`：EVM 密码学现状、Ethereum 三层 PQ 路线、对 L2 的含义
- **O** → `notes-projects.md`：Starknet、Aztec、Optimism、Algorand、Bitcoin、Solana、Zcash、SP1、Jolt、Sui、QRL
- **M** → `notes-mantle.md`：Mantle 架构与组件 → 密码学映射（公开资料）
- **K** → `notes-chain.md`：主会话用 cast / RPC 做的链上复核（2026-10-16）
- **X** → 本文件 §跨路综合（主会话的推论与建议）

外部调研 `from-aztec-pq-to-mantle-pq.md`（ChatGPT Deep Research）只作线索。

## 每个研究问题的一句话答案

1. **EVM 链今天的密码学**：Ethereum 在四个位置依赖离散对数类假设，Shor 都能破：账户（secp256k1 ECDSA、7702 授权、P-256）、共识（BLS12-381）、DA（KZG）、L2 证明验证（BN254 预编译）。哈希（Keccak）只是安全余量下降（E1–E17）。Mantle 的情况是 2026-10-15 的链上实测（K1–K20）：
   - 状态根由 EOA proposer 提交，证明经 Succinct 的 Gateway 路由到 SP1 v6.1.0 的 PLONK（BN254）验证器；
   - DA 用 Ethereum blob；
   - 全部 L1 合约由 6/14 Safe 无时间锁升级。
2. **量子计算机来了会怎样**：
   - **直接被攻破**：签名可伪造（发过交易的 EOA 和全部多签签名人），KZG / Groth16 / PLONK 的可信设置可被算出陷门、证明可伪造（on-setup），BLS 共识可被冒充。
   - **只是余量下降**：Keccak / SHA-256 / AES。
   - **只影响机密性**：HNDL（T1–T31）。
   - **资源估计**：Google 2026-03 估计 ECDLP-256 需 <1,200 / 1,450 逻辑比特、<50 万物理比特、约 18–23 分钟。公开硬件是 105 比特。专家调查给出 10 年内出现 CRQC 的概率 28–49%（T35–T48）。
3. **AI 破解**：
   - 算法层：AI 把 HAWK 攻到团队撤回；对 7 轮 AES 的攻击总体复杂度没有改善。
   - 实现层：AI 找到了人工审计漏掉的漏洞。
   - 各方的结论是“保守选型 + 形式化验证”，不是“越快迁移越好”（T50–T66）。
4. **PQ 入门**：
   - 标准：FIPS 203 / 204 / 205 已定稿，FIPS 206（Falcon）仍未发布草案，HAWK 撤回（P1–P23）。
   - 尺寸：PQ 签名比 ECDSA 大 10–121 倍。
   - EVM 合约验签成本：0.65M–8M gas，Draft 预编译可降到 3,000–4,500 gas（P24–P37）。
   - 混合签名必须用 AND（P38–P40）。
   - PQ 证明系统与 PQ 签名是两回事；生产 zkVM 上链前都包一层 BN254 SNARK（P44–P59）。
5. **各项目**：
   - Ethereum：目标是 2029-12 实现三层 PQ，指的是 L1 协议能力。已排期的只有 EIP-8141（Hegotá，预计 2027 Q2）。PQ 预编译未排期；共识（leanXMSS + leanVM）与 DA（leanDA）仍在研究或 devnet 阶段（E18–E58）。
   - Starknet：10-14 之后没有新进展（O1–O3）。
   - Aztec：2027-02 交付防 HNDL 的库，2027 年依次选定签名、加密、证明系统，2030 年完成迁移（O4–O16）。
   - Optimism：2036-01 弃用 ECDSA EOA，需治理批准（O17–O22）。
   - Algorand：原生 Falcon 账户已上主网（O23–O29）。
   - Zcash：可恢复 note 已生效（O44–O46）。
   - 其余项目都还是路线图或草案（O30–O52）。
6. **Mantle 能做什么**：“等 Ethereum 再 rebase”只覆盖继承层。证明验证器、L1 权限密钥、L2 账户规则都要 Mantle 自己做，或与 Succinct 协同（X1–X18）。

## 跨路综合（X）

- **X1–X3 责任边界与最大风险**：L1 升级只替 Mantle 解决共识与 blob。Mantle 的状态安全最终落在两处：
  - 一个 BN254 PLONK 验证；
  - 一组 ECDSA 多签签名人。

  这两处都不在 Ethereum 的路线上。Google 白皮书把“管理员密钥”列为攻破最快、杠杆最高的一类（T16、T17）。
- **X4 路由语义**：SP1VerifierGateway 接受任何未冻结路由。将来加入 PQ 路由时，必须冻结旧的 BN254 路由，否则语义是 OR（K7、K9）。历史上 Succinct 有 11 次冻结记录（K8），说明这个操作可行。
- **X5–X7 Mantle 可以先于 L1 做的事**：
  - 先例：Mantle 在 L1 之前就通过 RIP-7212 上线了 P-256 预编译（M33）。
  - PQ 预编译与 k1 退役机制在技术上可以由 Mantle 的命名硬分叉提前上线。
  - 风险：FIPS 206 未定稿（P6、P7）。
  - 7702 账户必须配合协议级的 ECDSA 退役，否则 PQ 模块可被绕过（E5、E33）。
- **X8 证明成本**：直接在 L1 验证 PQ STARK 约千万 gas，是当前 43 万 gas 的 20 倍以上（K4、E53、P49），所以需要 Succinct 的哈希型包装（VEIL）与 L1 聚合（EIP-8288）一起推进。
- **X9–X18**：其余几条综合：
  - 披露（X9）；
  - HNDL 的定位（X10）；
  - 时间窗口（X11，speculative）；
  - 经典收益（X12）；
  - challenger 窗口（X13）；
  - Succinct 协同（X14）；
  - 建议路线（X15，speculative）；
  - 跨项目共性（X16）；
  - OP 路线的覆盖缺口（X17）；
  - AI 审计（X18）。

## 资料中被修正的地方（汇总）

- **GPT“EIP-8141 仍是 Draft”**：不完整。8141 已在 Hegotá 定为 SFI，Hegotá 预计 2027 Q2（E23、E24）。
- **GPT 把 7885 / 8051 / 8052 列为值得跟踪的方向**：漏了两点：它们都不在 Hegotá 任何列表；另一份 ML-DSA 预编译 EIP-8355 被拒，EF 评语为“premature standardization”（E27、E28）。
- **GPT“HAWK 是候选方案”**：已过时，HAWK 于 2026-07-29 撤回（P11、T53）。
- **GPT“SP1 内部存在 STARK”**：不完整。Hypercube 内存论证也依赖扩域椭圆曲线的 DLP（P56、M43、O36）。
- **GPT / L2BEAT 关于 Mantle 证明路径**：
  - L2BEAT mantle.ts 注释写的是 Groth16 网关；
  - 实测最近一次提交走的是 PLONK v6.1.0（K2）；
  - L2BEAT 05-05 称旧 sp1turbo 路由仍登记，实测已于 2026-10-09 冻结（K8、M8）。
- **GPT“Mantle 有 blob / calldata 两种发布方式”**：calldata 是 L2BEAT 的模板文字，实测只有 blob（M23、K14）。
- **GPT 引用的 Optimism 范围**：原文不含 proposer 与 L1 权限（O21）。
- **GPT 引用 Algorand v5.0.0**：引用错位（O56）。
- **ethereum.org“KZG 可信设置对量子也安全”**：与 Google §V.5、Vitalik、leanDA 帖矛盾，按 KZG 结构判断为错误（T23、E51、E52）。
- **ethereum.org 的 8141 时间与 PQ 签名尺寸**：已过时（E67、E68）。
- **Aztec 原文里 MIKE 的链接域名**：写成 .asia，应为 .org（P60、O16）。
- **用户草稿“唯一能做的就是等待”**：不成立。见 X1、X5–X7、X9、X12。

## 开放问题

1. Mantle 的 batcher / proposer / unsafe signer 是否托管在 HSM / KMS；Safe 签名人的密钥形态（内部核对，M59）。
2. Mantle 是否参与 Optimism 的 PQ 硬分叉（M60）。
3. Succinct 去掉 BN254 包装的时间表与 L1 验证路径（M50、M51、O38）。
4. SP1 内存论证中的扩域 ECDLP 在量子下对 soundness 的实际影响（P59、M45）。
5. 链上 implementation `0x4059…6f50` 与 `mantle-v1.6.1` 源码是否一致（未做字节码比对）。
6. calldata DA 回退是否可用、是否演练过。
7. FIPS 206 何时发布草案；EIP-8052 与 FN-DSA 的兼容性。
8. Ethereum 的“规范哈希函数”何时确定（E48）。

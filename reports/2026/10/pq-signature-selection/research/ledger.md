# 论断台账

每条会出现在 explainer 里的论断，都要在这里有一行。
类型：observed（直接观察到，有一手证据）/ inferred（由证据推出）/ speculative（推测，需在页面上标明）。

本台账合并自三路调研分册，编号前缀对应分册：
- **H**：`notes-hash.md`（哈希路线：WOTS/XMSS/SLH-DSA、leanXMSS + leanVM、EIP-8292、Ethereum / Starknet 的理由）
- **L**：`notes-lattice.md`（格路线：Falcon / ML-DSA / FN-DSA、Aerie + Akita、a16z / LayerZero / Algorand / Solana 的理由、HAWK）
- **E**：`notes-eip.md`（EIP-8288 / 8141 / PQ 预编译、对前两篇的修订、对 L2 的含义）
- **S**：主会话补充（系列衔接与综合判断），证据指向本文件引用的 H/L/E 行或前两篇报告。

证据中的 `[n]` 指该分册“来源”一节的第 n 条。资料截止 2026-10-20。

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| H1 | 有状态哈希签名的安全性只依赖底层哈希的原像 / 第二原像困难性，大规模量子计算机预期不会破坏它 | [34] SP 800-208 §1 第 1 段 | observed | F2 |
| H2 | SP 800-208 要求有状态 HBS 的密钥与签名生成在不可导出私钥（加密形式也不行）的硬件模块里进行，并称其“not suitable for general use” | [34] §1 末段、§1.1 | observed | |
| H3 | 同一 OTS 密钥签两条不同消息，攻击者就能伪造任意消息的签名 | [34] §1.2 | observed | F2 |
| H4 | leanXMSS 是两层高 16 的 XMSS over WOTS+C，一把密钥可签 2^32 个 leaf index，公钥 32 B，签名 2,404 B，验证 201 次 BLAKE2s 压缩 | [8] Abstract 与 §5；[7] PR #640 说明 | observed | F2、F3、R |
| H5 | leanXMSS 的一次性密钥是 58 条长度为 4 的链，靠 grinding 使摘要数字和等于 106，以此取代 Winternitz 校验和，平均每次签名约 2^20 次尝试 | [8] §2–§3、§5 Signing cost | observed | |
| H6 | leanXMSS 已证明 127 位经典 SUF-CMA 安全（ROM，Lean 4），量子安全只是“expect about 64 quantum bits”的推测 | [8] §6 Theorem 1 与 Quantum security 段；[7] | observed | |
| H7 | leanXMSS 规范明确：一个 leaf index 不得签两条不同的消息，定理只覆盖每个 index 最多用一次的签名者，这要由签名者的状态来保证 | [8] §5、§6 “Using a key” | observed | |
| H8 | leanXMSS 的签名是确定性的，同一 index 重签同一条消息得到同一个签名 | [8] §3 Signing、§6 | observed | |
| H9 | 在 leanXMSS 下，验证者同一 slot 签两条不同投票（双签）不只会被罚没，还会泄露该 index 的一次性密钥材料；备份恢复、多实例运行这类事故的后果比 BLS 更重 | 由 H7、H8、H12 推出：两个不同码字会暴露每条链的较小位置 | inferred | |
| H10 | leanSPHINCS 是无状态方案：公钥 32 B，签名 4,276 B，验证 307 次压缩，经典 ROM 127 位，满树寿命约 13 亿次签名，QROM 64 位只是目标、没有证明 | [9] Abstract、§5.4、§6 | observed | F2 |
| H11 | FIPS 205 中 SLH-DSA-128s / 128f / 256s 的签名分别为 7,856 / 17,088 / 29,792 B，公钥 32 / 32 / 64 B | [35] Table 2（与第一篇 P25 一致） | observed | F2 |
| H12 | Ethereum 共识用 slot 号充当签名状态（leaf index / epoch） | [10] epoch 接口；[8] §8 “per year of 12-second slots”；[1] “slot number itself can serve as the signing state” | inferred | |
| H13 | 2^32 个 index 按 12 s 一个 slot 约可用 1,600 年；一棵下层树（2^16 个 index）约 9.1 天用完，签名者在首次签名时才构建它 | 由 H4、H12 与 [8] §5 “the signer builds each bottom tree when it first signs in it” 推出 | inferred | |
| H14 | SPHINCS- 的硬件钱包友好变体在 Ledger Nano S+（ST33K1M5）上签名，C11 要 390 s，C12 要 47.5 s | [27] §5 表下段 | observed | F5 |
| H15 | SPHINCS- C13 签名 3,704 B、链上验证 127K gas，但签名约需 430 万次哈希调用；SLH-DSA-SHA2-128-24 需约 10.7 亿次 | [27] §5 Variant 表 | observed | |
| H16 | leanSig 是原型实现，未审计，不得用于生产；同一 (sk, epoch) 不得重复签名；硬编码实例用 Poseidon1 | [10] Disclaimers、Signature Interface、Schemes 节 @c08a3bae | observed | |
| H17 | leanVM 自述是“minimal hash-based zkVM”，用 192-bit 二进制域、WHIR、Flock；BLAKE2s 是占位，SHA2 / SHA3 / BLAKE3 在考虑中；计划从 leanISA 迁到 RISC-V rv64im；ZK 支持在计划中 | [6] README @3a37fb6e “work in progress”“SNARK machinery” | observed | F3、F5 |
| H18 | leanVM 在改用二进制域之前用 KoalaBear + Poseidon，旧设计保留在 koalabear 分支 | [5][6] README note | observed | |
| H19 | leanVM README 声称“128-bit ROM (64-bit QROM) soundness”，并写明“not (yet) production ready”，形式化验证仍在进行 | [6] README security 节 | observed | F3、F4、F8 |
| H20 | EIP-8292 写的是当前 leanVM 实例约 124 位经典、62 位量子安全，未达 NIST Level 1，与 README 的 128/64 不一致 | [4] Security Considerations “Proof soundness”；[6] | observed | F4、T |
| H21 | leanVM @127510d1 的 XMSS 基准：M4 Max，900 签名，0.545 s，317.4 KiB，1,651.7 签名/秒，验证 3.977 ms | [5] README XMSS aggregation | observed | F3 |
| H22 | leanVM HEAD @3a37fb6e 的基准：1,290 个 leanXMSS 签名，0.947 s，318.4 KiB，峰值 15.5 GiB，1,362.5 签名/秒，验证 5.387 ms | [6] README leanXMSS aggregation | observed | L、F3 |
| H23 | 2026-10-17 的 PR #640 把单层 XMSS 换成两层 leanXMSS，使 README 的 XMSS 吞吐从 1,651 降到 1,362 签名/秒；a16z 用的“1,770”和 GPT 引的“1,362”分别测的是不同的签名方案 | 由 H21、H22 与 [7]、[1] 推出 | inferred | F3、U |
| H24 | leanVM 的 2-to-1 递归（叶子各 900 签名）在 HEAD 上用时 0.291 s，proof 201.5 KiB，验证 6.271 ms | [6] README recursion | observed | L |
| H25 | leanSPHINCS 聚合：@127510d1 为 817.7 签名/秒，HEAD 为 850.1 签名/秒（850 签名，约 1 s） | [5][6] README SPHINCS aggregation | observed | L |
| H26 | leanSpec（2026-09-02）的 XMSS 密钥 / 签名仍按 KoalaBear 域元素编码，与 leanVM 主干的二进制域 / BLAKE2s 不一致 | [11] commit message；[6] | observed | F5 |
| H27 | leanMultisig 已改名为 leanVM（GitHub API 返回同一个 repo） | [12] repo id 1020551292 | observed | |
| H28 | EIP-8292 把聚合者定义为自愿参与、不设质押门槛的高配角色；质押达到 SUBNET_COMMITTEES×32 ETH 的节点 SHOULD 当 super-aggregator | [4] “The aggregator role” | observed | F3 |
| H29 | EIP-8292 规定叶子聚合与递归聚合属于聚合者，区块级折叠是提议者职责，每个区块最多 8 条不同的 attestation 消息 | [4] “Levels of aggregation”、Constants 表 | observed | L、F3 |
| H30 | EIP-8292 的非规范性目标：proof 硬上限 512 KiB，典型 185–230 KiB，约 256 KiB 的 proof 在 1 秒内传播；1,000 个签名在 16 核上约 2.6 s、2 核上约 11 s | [4] “Aggregation targets” 表 | observed | F3 |
| H31 | EIP-8292 认为证明集中在少数高配聚合者手里是主要的去中心化风险，目前没有显式的协议激励，也没有强制的最低硬件 | [4] Rationale 与 Open questions | observed | |
| H32 | a16z 所说“每个 leanVM proof 约覆盖 900 个签名”是 README 的基准批量，不是协议参数；递归策略由 leanSpec 定义 | 由 H21、H22 与 [4] “the recursion strategy … are defined by leanSpec” 推出 | inferred | |
| H33 | Lean Consensus 2026 计划的目标是每秒聚合 1,000 个 XMSS 签名、2-to-1 递归约 200 ms；当时的设计是 KoalaBear + Poseidon2 | [13] “LeanVM Performance Targets”“Poseidon2 Integration” | observed | |
| H34 | 截至 HEAD，leanVM 的吞吐已超过 1,000 签名/秒的目标，但 2-to-1 递归（0.291 s）还没达到 200 ms | 由 H22、H24、H33 推出 | inferred | |
| H35 | 递归签名聚合已在 2026-04-06 合入 leanSpec（PR #496） | [14] Coratger 推文 | observed | |
| H36 | ethereum.org 给的 PQ 签名口径是约 3,000 B、leanVM 压缩 250 倍，与 EIP-8292 的 1.17 KiB、leanXMSS 现规范的 2,404 B 都不同 | [15] “Consensus-layer BLS signatures” 段；[4]；[8] | observed | |
| H37 | Vitalik 在 EIP-8288 帖（2026-06-15）称要依赖最小化，强烈倾向基础层纯哈希，并且少维护基础设施 | [20] 第 5 楼 | observed | N、F9 |
| H38 | Vitalik（2026-10-07）认为 AI 加速数学的新风险集中在 ML-DSA / FHE / 格，并称 lean 路线“no lattices, no ML-DSA, no Falcon, no lattice-based commitments inside ZK proofs” | [18] 推文正文 | observed | N、F9 |
| H39 | Vitalik 承认公钥加密不能只靠哈希实现，建议隐私协议不要把加密 note 放上链 | [18] 正文与 TLDR 第 3 条 | observed | F9 |
| H40 | Justin Drake（2026-10-07）呼吁“bunker mode”，主张全面转向哈希型密码学、避开曲线 / 格 / 同源等结构化假设，并要求加速 strawmap 时间表 | [19] 推文正文 | observed | N、F9 |
| H41 | strawmap 的五个 north star 包括“post quantum L1 … via hash-based schemes”和“private L1 … via L1 shielded transfers” | [17] “What are some of the highlights?” | observed | F9 |
| H42 | Vitalik（2026-10-19）主张让任意签名在本地 STARK 化、经 EIP-8288 聚合入块，“Ethereum can then never add a new precompile again”，并称之为“EIP-8288 maximalism” | [21]；[22] | observed | F11 |
| H43 | pq.ethereum.org（2026-06-27）仍把 Falcon、Dilithium、SPHINCS+ 列为执行层候选，并规划 PQ 签名预编译（J*） | [16] Execution Layer 与 FAQ “Ethereum's Approach” | observed | F9 |
| H44 | Ethereum 的“哈希偏好”是协议层偏好，研究范围仍包括格方案（PSE 的 LaBRADOR 基准、EF 页面的候选列表）；EF 各文本之间没有公开调和 | 由 H37、H38、H43 与 [28] 推出 | inferred | F9 |
| H45 | PSE 的 LaBRADOR 基准：10k 个 Falcon-512 签名，proof 74.07 KB，证明 5.95 s，验证 2.65 s（单线程 i5-11400H） | [28] Key-takeaway | observed | F9 |
| H46 | Khovratovich（2026-09-23）称，Flock 出现后 Ethereum 不再需要电路友好的哈希；按风险最小化排序，SHA-3 第一，BLAKE2s 与 SHA-2 变体并列第 2–3 | [26] Introduction 与 Rankings | observed | |
| H47 | Eli 的原文论点是：格有可供 AI 攻击的数学结构，基于 Module-SIS 的简洁方案“only around since 2012”，建议再等 3–5 年再托付大额资金 | [24] 推文正文 | observed | N、U |
| H48 | Module-SIS / Module-LWE 由 Langlois–Stehlé 在 ePrint 2012/090 中首次定义 | [29] 摘要 | observed | N |
| H49 | Eli 的“2012 / Module-SIS”批评主要针对 Aerie 使用的 Akita 格承诺（简洁论证层），不直接针对基于 NTRU 的 Falcon 签名 | 由 H47、H48 与 [1] “Akita (the lattice-based polynomial commitment scheme)” 推出 | speculative | C、F10 |
| H50 | StarkWare 称 STARK 的承诺只依赖哈希，并称 S2morrow 与 OpenZeppelin 已发布 Falcon-512 账户实现（OZ 的未审计） | [30] 首段与 “Quantum-resistant wallets exist today” | observed | F10、F1、R |
| H51 | StarkWare 路线图把“implementing consensus signatures onchain using PQ signature schemes, such as Falcon-512”列为新功能方向 | [31] Phase 1 末段 | observed | F10、R |
| H52 | Starknet 的立场是“证明层哈希、账户层（甚至共识签名）可以用 Falcon”，不是反 Falcon | 由 H50、H51 与 [33] 推出 | inferred | C、F10 |
| H53 | OpenZeppelin 的 cairo-pq-verifiers 提供 Falcon-512（三种 hash-to-point）、ML-DSA-44、Poseidon-WOTS 验证器和可部署账户，README 标“Experimental and unaudited” | [33] README 与目录结构 | observed | C、F10 |
| H54 | a16z 主张：递归复杂易出错，每一步都在证明用于 Fiat-Shamir 的那个哈希，因此“security … can’t be established even in the random oracle model” | [1] “A simpler design space” 节 | observed | F4 |
| H55 | 学界承认递归 STARK 的安全分析需要把随机预言实例化（启发式步骤），只有理想化模型下的启发式证据；作者之一来自 StarkWare | [37] 摘要与引言 | observed | F4 |
| H56 | Aerie 只在经典 ROM 下证明知识可靠性，没有给出 QROM 证明 | [2] 摘要 | observed | |
| H57 | 截至 2026-10-20，没检索到 EF / leanVM 团队（Coratger、Wambsgans、Drake、Vitalik）对 a16z 递归安全论点的直接回应 | [43] 时间线检索；ethresear.ch / Magicians 检索没有结果 | observed | F4、T |
| H58 | a16z 称证明哈希一般比原生计算多 100 倍以上开销；leanVM 的 Flock 约 48.6 万次 BLAKE2s 压缩/秒（16 核），而原生单核约 700 万次/秒，按核平摊同为两个数量级 | [1]；[6] hashing 节；[26] Performance summary；比值为推算 | inferred | |
| H59 | Poseidon2 的 round-skipping 攻击侵蚀了安全余量，但不破推荐参数，Poseidon Initiative 因此转向 Poseidon1 | [39] 幻灯片第 6 页 | observed | F5 |
| H60 | 在 Ethereum Poseidon Initiative 设定（KoalaBear，t=24，α=3）下，Poseidon 的 CICO-1 问题被实验求解到 28/31 轮 | [40] 摘要 | observed | F5 |
| H61 | “小域 Poseidon 被攻破”应收窄为“缩减轮数攻击 + 安全余量被侵蚀”；Ethereum 已转向不依赖电路友好哈希的二进制域方案 | 由 H59、H60、H17、H46 推出 | inferred | F5 |
| H62 | EF 研究员 asanso 的 Daisugi v0.3 用 LeanSPHINCS + LeanVM 把 20 个交易签名聚合成一个 proof（2026-10-15） | [42] 推文 | observed | |
| H63 | leanXMSS 与 leanSPHINCS 曾从同一个种子派生出重合的一次性密钥，10-17 的 commit 加了域分离；说明 lean 系列签名仍在早期迭代 | [7] commit message “Domain-separate the seeds” | observed | |
| L1 | Module-SIS / Module-LWE 由 Langlois–Stehlé 于 2012 年（ePrint 2012/090）首次定义 | [15] ePrint 2012/090 摘要 | observed | G、F9、F13、R、F16、S、X |
| L2 | ML-DSA 的安全性基于 R_q 上的 MLWE 和非标准变体 SelfTargetMSIS，构造为 Fiat–Shamir with aborts | [14] FIPS 204 §3.2–3.3 | observed | J、F1、Q、F16、W |
| L3 | ML-DSA-44/65/87 公钥 1,312/1,952/2,592 B，签名 2,420/3,309/4,627 B，对应 NIST 类别 2/3/5 | [14] FIPS 204 Table 1–2 | observed | J |
| L4 | Falcon-512/1024 公钥 897/1,793 B，带填充签名 666/1,280 B（含 1 B 头 + 40 B 盐），q = 12,289 | [4] specs/falcon.md §2.1 参数表 | observed | F6 |
| L5 | Falcon 验证 = 由盐和消息算 HashToPoint 目标 c，检查 s1 + h·s2 ≡ c (mod q)、‖(s1,s2)‖² ≤ ⌊β²⌋、s2 可规范解码 | [4] specs/falcon.md §2.2 | observed | |
| L6 | M4 Max 单核：Falcon-512 验证约 15.8 µs、签名约 96 µs（PQClean aarch64） | [2] 论文 §6.3 | observed | F6 |
| L7 | Falcon 签名依赖浮点：部分平台无 FPU，浮点除法常非常数时间，嵌入式掩码困难；定点实现约慢 2 倍，精度分析部分依赖经验 | [8] ePrint 2026/1531 摘要 | observed | F6 |
| L8 | Pornin 新实现把 Falcon-512 签名 RAM 从约 31 kB 降到约 11 kB，Cortex-M4 平均 13.45 M cycles | [9] ePrint 2026/1915 摘要 | observed | |
| L9 | 对“只掩码原像计算”的 Falcon 的功耗攻击，4,000 条迹线成功率 98.3%（ELMO 模拟 Cortex-M0） | [10] ePrint 2026/2313 摘要 | observed | F6 |
| L10 | NIST 于 2026-09-28 宣布 FN-DSA 计划：keygen 和签名强制定点（32.32 / 64.64），只规定单一 KAT 签名过程 | [11] pqc-forum Perlner 帖 | observed | F6、U |
| L11 | NIST 称“目前已批准的 FN-DSA 签名过程版本数为 0” | [11] Perlner 2026-09-29 回复 | observed | F6 |
| L12 | 截至 2026-10-20，FIPS 206 没有出现在 NIST PQC 出版物列表中，ipd URL 返回 404 | [12] PQC Publications 页 \| 404 检查 | observed | F6、U |
| L13 | 由 L10、L11、L12 推出：FN-DSA 尚无公开草案，最终编码和 framing 仍可能变化 | 由 L10、L11、L12 推出 | inferred | F6 |
| L14 | NIST 2025 年计划 FN-DSA 只允许随机化签名，认为确定性签名可能危险 | [13] Perlner 2025-09 幻灯片 | observed | |
| L15 | Aerie 证明的命题：每条记录都存在满足 Falcon 环方程、范数上界、规范压缩编码的签名；HashToPoint 由 verifier 自己计算 | [3] README “What a proof shows” | observed | M |
| L16 | “公开盐、由 verifier 算哈希”的思路来自 Aardal 等 2024（LaBRADOR 聚合），不是 Aerie 首创 | [2] 论文 §1、[5] LayerZero 博客 | observed | U |
| L17 | Aerie 用 Akita（Module-SIS 多项式承诺）+ 三段 sum-check + 一次批量 opening，没有递归 | [2] 论文 §1.3、Fig.3 | observed | M |
| L18 | Akita 基于标准 Module-SIS，证明 58–68 KB，修订版日期 2026-10-15 | [7] ePrint 2026/1983 | observed | |
| L19 | Aerie 在 M4 Max（16 线程、无 GPU）上 0.645 s 证明 32,768 条 Falcon-512 签名 | [3] README Results 表 \| [2] Table 2 | observed | M、F7 |
| L20 | 32K Falcon-512：单线程验证 53.6 ms，16 线程 11.6 ms，峰值内存 2,113 MiB | [2] Table 2 \| [3] README | observed | F7 |
| L21 | 32K Falcon-512 聚合物 1,346.4 KiB（42.1 B/sig，其中 40 B 是盐）；共同盐约 66.4 KiB 是由实测减去盐得到的估算值 | [2] Table 2 注 \| §6.2 | observed | F7 |
| L22 | Aerie 单线程验证比 PQClean 逐条验证（519 ms）快约 10 倍；16 线程只快 3.7 倍（42.9 vs 11.6 ms） | [2] §6.3、Table 4 | observed | F7 |
| L23 | Aerie 单线程证明 4.3 s，约为原生验证的 8 倍、原生签名的 1.4 倍 | [2] §6.3 | observed | M |
| L24 | Aerie verifier 70% 的时间花在公钥哈希和 HashToPoint，成本随批量线性增长 | [2] §6.2–6.3 | observed | |
| L25 | 同一台 Zen 5 AVX-512 服务器单核：对 Orthus，证明快 1.5–1.6 倍，验证快 33–52 倍，proof 小 1.7 倍；但 Orthus 证明的是更受限的命题（共同盐、预处理公钥、不验证编码） | [2] Table 6、§1.2 | observed | |
| L26 | 同一台 M4 Max 上，对 leanVM@127510d1，Aerie 吞吐为 29 倍（全核）/ 39 倍（单线程）；leanVM 递归证明验证 5.9–6.5 ms，更快 | [2] §6.3 | observed | M、F7 |
| L27 | 论文建模 leanVM 聚合 33,300 条：每节点一台机器、不计网络，最佳延迟 2.0 s，总工作约 29 机器秒 | [2] Table 5 | observed | M、F7 |
| L28 | leanVM README@127510d 自报 900 XMSS 0.545 s（1,651/s）、SPHINCS 817.7/s，“128-bit ROM (64-bit QROM)”，非生产就绪 | [16] README benchmarks \| security | observed | |
| L29 | 三方吞吐绝对数不一致：50,800/1,770（a16z / 论文）、46,000/1,600（LayerZero）、1,651（README），比值都约 29 倍 | [1] \| [2] \| [5] \| [16] | observed | F7、T |
| L30 | Aerie 的安全性是经典 ROM 下的知识可靠性，并把聚合伪造归约到 FN-DSA EUF-CMA；不做任何 QROM 声明 | [2] Thm 5.9 / 5.11 \| [4] §10.1 “no QROM claim” | observed | F7 |
| L31 | 抽取器期望运行 prover (Q+2)·K̂ 次（2^21.4 < K̂ < 2^39.7），Akita 参数估计未计入这一因子 | [2] Thm 5.9 后文 | observed | |
| L32 | 共同盐模式下，固定目标签名者的不可伪造性是额外假设：没有已知的标准格归约，也没有已知攻击；仓库不含共同盐签名器 | [3] README “Signers” | observed | F7 |
| L33 | Lazar–Peikert 确定性 Falcon（用 Falcon 私钥派生随机性）不在 Aerie 去随机化定理的覆盖范围内 | [4] specs/falcon.md §10.2 | observed | |
| L34 | 由 L32、L33 和 Aerie 不支持 r‖m framing 推出：“Algorand 签名直接以 66 KiB 聚合”需要改代码并接受额外假设 | 由 L32、L33、[3] framing 说明推出 | inferred | |
| L35 | Aerie 是 research release，两个参数集都未通过生产验收，不声称零知识，不声称兼容最终 FIPS 206 | [3] README Status | observed | F8 |
| L36 | 两个 Aerie 聚合物不能合并；递归 verifier 会重新引入公开盐方案所避开的启发式步骤 | [2] §7 “Merging Aggregates” | observed | F7 |
| L37 | a16z 称正在扩展 ML-DSA、去盐、格 + EC 混合签名，“可能达不到 5 万/秒” | [1] 博客 “Why Falcon” 节 | observed | J |
| L38 | LayerZero 称 ML-DSA 聚合“已在 Aerie 内高性能运行，细节待公布”，目前无代码或数字支撑 | [5] LayerZero 博客 | observed | |
| L39 | Aerie 论文披露：实现、基准，以及安全证明和投影定理的推导大量使用了 AI 模型 | [2] “AI Assistance” 节 | observed | F8 |
| L40 | a16z 论点 (b)：递归每一步都要证明关于 FS 哈希本身的命题，因此“连在 ROM 里都无法建立安全性” | [1] “A simpler design space” 节 \| [2] §1.2 | observed | N |
| L41 | 由 L28、L40 推出：递归缺口是证明模型层面的批评，不是对 leanVM 的具体攻击；leanVM 自己声明 128-bit ROM | 由 L28、L40 推出 | inferred | F4、N |
| L42 | a16z 论点 (c)：Ethereum 的共识和账户签名是 NIST 之外的定制方案，底层哈希未定，限制硬件钱包、HSM 和托管支持 | [27] 推文配图 \| [1] | observed | N |
| L43 | leanVM 哈希 BLAKE2s 是占位，XMSS / SPHINCS 参数“不是最终参数集” | [16] README | observed | N |
| L44 | 由 L12、L35、L42 推出：“非标准”批评对 Falcon + Aerie 同样部分适用，因为 FN-DSA 无草案、Aerie 未达生产 | 由 L12、L35、L42 推出 | inferred | N |
| L45 | a16z 论点 (d)：公钥加密不能由哈希黑盒构造（Impagliazzo–Rudich），隐私链终将依赖格（ML-KEM） | [1] “privacy case” 节 | observed | N |
| L46 | Vitalik 2026-10-07 承认 PKE 不能只靠哈希，建议加密 note 放链下；称 lean Ethereum “no lattices… no lattice-based commitments inside ZK proofs” | [30] Vitalik 推文 | observed | N |
| L47 | Thaler 称格去掉了递归和定制哈希签名，这一具体收益应与“更推测性的”格攻击风险相权衡 | [29] Thaler 推文 9/ | observed | N |
| L48 | Algorand 原生 Falcon-1024 PQ 账户属于 v42 共识升级，随 algod v5.0.0 发布（GitHub release 2026-08-12） | [17] 开发者文档 \| [18] release API | observed | N、F10 |
| L49 | Algorand 用确定性 Falcon 变体，与 FN-DSA 草案不同；Falcon-512（f5）已定义未启用；PQ 签名最低费用 3,000 µAlgo | [17] 开发者文档 | observed | C、F10 |
| L50 | Algorand 原生 PQ 账户不改变共识参与密钥，也不支持 PQ 原生 multisig | [17] Limitations 节 | observed | C、F10 |
| L51 | Algorand 的 State Proofs 用 Falcon-1024（每 256 轮），AVM v12 有 `falcon_verify`；官方理由是紧凑、验证快、确定性算术、与 State Proofs 的延续性 | [19] 技术简报 | observed | N |
| L52 | v42 在 Algorand 主网激活的具体日期，本路未找到一手来源（前序报告写“2026-08 主网激活”待核） | [18] release 仅写“包含协议升级” | speculative | T |
| L53 | Solana 的 Anza 与 Firedancer 各自做了 Falcon 原型，但官方定位是“继续评估 Falcon 及其替代方案” | [20] Solana quantum readiness | observed | C、F10 |
| L54 | Solana Alpenglow 计划于 epoch 1064（2026-10-21 约 13:20 UTC）主网激活（截至 2026-10-20 尚未激活），投票聚合为证书（BLS pubkey） | [21] Alpenglow 页面 | observed | C、F10 |
| L55 | Eli 2026-10-18：格结构丰富、易受 AI 攻击，module-SIS 版 succinct 方案太新（2012），建议再等 3–5 年 | [28] Eli 推文 | observed | |
| L56 | 由 L1、L2、L18 推出：Eli 的“module-SIS”批评主要打在 Aerie 的承诺层（以及 ML-DSA）；Falcon 签名基于 NTRU | 由 L1、L2、L18 推出 | inferred | |
| L57 | Claude Mythos 改进了 HAWK 密钥恢复（有效密钥减半，仍是指数时间）；HAWK 基于 LIP，Anthropic 称不影响一般格密码 | [22] Anthropic 博文 | observed | N |
| L58 | HAWK 团队于 2026-07-29 撤回算法 | [23] NIST 新闻脚注 | observed | N |
| L59 | 本路没有找到 2026 年针对 SIS / LWE / NTRU / Falcon / ML-DSA 本体的公开 AI 攻击 | 检索 [22][25][26] 等后未发现 | speculative | N |
| L60 | 截至 2026-10-20，没有找到 EF / leanVM 团队对 Aerie 基准或递归安全批评的正式回应；a16z 的“完整论证”尚未发布 | 检索 ethresear.ch / X / a16z 后未发现；[31][32] 不是对 Aerie 的技术回应 | speculative | T |
| E1 | EIP-8288 标题为 “In-mempool signature and proof aggregation”，作者 Vitalik Buterin、Thomas Coratger，created 2026-06-03，status Draft，requires 2718、8141 | [1] 文件头 @72ca2dd | observed | P |
| E2 | eip-8288.md 的最新提交是 72ca2dd（2026-10-15），内容为零 data_hash 代表交易签名哈希 | [2] commits API | observed | |
| E3 | DEP_VERIFY_FRAME_MODE = 4，于 2026-10-07 的提交 00afdc8 改定 | [1] Constants；[2] | observed | P |
| E4 | 依赖三元组为 scheme(31 个零字节 + 1 字节) ‖ data_hash ‖ verification_key_hash，每个 96 字节，每帧 1–256 个 | [1] “New Frame Mode” | observed | |
| E5 | 当前只接受 LEANSPHINCS_SCHEME 0x10；LEANSTARK_SCHEME 0x11 是预留值，使用它的帧在 get_deps_hash 定义前无效 | [1] “Validity constraints” | observed | F1、F12 |
| E6 | leanSPHINCS 的 verification_key_hash 字段直接放 32 字节公钥（root16 ‖ param16），不再哈希 | [1] payload encoding | observed | |
| E7 | data_hash = 0^32 在 dependencies(tx) 中被替换为 EIP-8141 的 compute_sig_hash(tx)，帧原始字节保持为零 | [1] “Transaction Dependencies” | observed | |
| E8 | AGGREGATED_VK、DEPS_HASH 为 TBD，Reference Implementation 为 TBD | [1] Constants、Reference Implementation | observed | F12 |
| E9 | 区块头新增 recursive_stark = [stark_proof, block_deps_hash]；节点从交易重算依赖并比对，再用固定的 AGGREGATED_VK 验证 STARK | [1] “Block Validity” | observed | |
| E10 | DEPS_HASH 当前工具链用 BLAKE2s，BLAKE3 是首选替代 | [1] Security Considerations | observed | |
| E11 | 依赖帧要求 target 为 None、value = 0、flags = 0，不能放进 atomic batch，limits.state = 0 | [1] Validity constraints | observed | |
| E12 | 依赖帧不执行代码，receipt 为 status 1、gas_used.execution 等于 limit、没有日志 | [1] Receipt | observed | |
| E13 | 每个 leanSPHINCS 依赖执行 gas 3,000，每个 leanSTARK 依赖 30,000；另外每个声明加 30,000 intrinsic gas | [1] Gas Accounting | observed | P |
| E14 | 由 E13 推出：一个 leanSPHINCS 依赖合计约 33,000 gas，一个 leanSTARK 依赖约 60,000 gas（不含数据费和每帧 475） | 由 E13、[3] FRAME_TX_PER_FRAME_COST 推出 | inferred | P、U |
| E15 | 依赖 gas 在交易回滚时仍全额收取，重复声明重复收费 | [1] Gas Accounting | observed | P |
| E16 | wrapper 分 mode 0（逐条证明）与 mode 1（一个递归 STARK）；两种都要求 deps 等于各交易依赖的去重排序并集；mode 1 的这项检查于 2026-10-15 补入 | [1] Mempool Wrapper；[2] 7604300；[4] Chugar 2026-09-20 帖 | observed | |
| E17 | 规范中 AGGREGATION_INTERVAL = 1,000 ms；每笔交易最多 16 个 leanSPHINCS 依赖、1 个 leanSTARK 依赖 | [1] Constants | observed | |
| E18 | 规范认为只有 leanSPHINCS 时，直接拼接签名在约 100 个以内比证明更省空间 | [1] Mempool Wrapper | observed | F16 |
| E19 | mempool 节点、FOCIL 生成者、builder 的聚合任务完全相同；builder 对实际入块交易重新递归 | [1] Builder Workflow | observed | |
| E20 | 8141 只有 mode 0 DEFAULT、1 VERIFY、2 SENDER，新增 mode 由扩展 EIP 加入；合约通过 FRAMEPARAM（0xb3）和 FRAMEDATACOPY 读取依赖 | [3] mode 表、FRAMEPARAM 表；[1] | observed | F15 |
| E21 | 8141 自带 signatures 列表（ARBITRARY / SECP256K1 / P256，0x3–255 保留），协议验证的签名原始字节不可内省，以便将来聚合 | [3] “Transaction Signatures” | observed | |
| E22 | EIP-8292 是共识层聚合者角色，“The execution layer is unchanged by this EIP” | [18] Specification | observed | |
| E23 | 规范的 Gas 一节仍按 KoalaBear 域描述上限，而 leanVM 已改为二进制域，规范与实现口径不一致 | 由 [1] Gas costs 与 [19] note 推出 | inferred | F12 |
| E24 | Alice 的 PQ 转账在 8288 下为：钱包三帧（DEP / VERIFY / SENDER）→ 首跳 mode 0 带签名 → 后续跳 mode 1 只带递归 STARK → builder 重新递归写入区块头 → 验证节点只验一个 STARK 后执行 | 由 E7、E9、E16、E19 与 [1] Test Case 1 推出 | inferred | |
| E25 | 8288 下验证节点看不到原始签名，签名数据不上链 | [1] stark_proof 不含依赖与公钥；[8] | observed | |
| E26 | Vitalik（2026-10-19）：“The ideal route to support everyone's cryptography is imo through 8288 … then STARK it … Ethereum can then never add a new precompile again.” | [5] | observed | F11、R |
| E27 | 该回复针对 lex_node 的“could still ultimately do Lattice stuff … through a precompile if it is proved to be AI-secure” | [6]；[5] replying_to | observed | F11 |
| E28 | Vitalik 在 Magicians 回复格签名问题：“strong preference to keep the base layer purely hash-based … maintain less total infrastructure” | [4] 5 楼（2026-06-15） | observed | F11 |
| E29 | Vitalik 希望 8288 进入 “I-star (the fork after Hegota)”，并称 Falcon、ML-DSA 等可以“wrap it client-side in a STARK”，链上成本为低几万 gas | [8] | observed | F1、F11、F13 |
| E30 | Vitalik 估计链上开销为“one STARK (100-300 kB), plus 96 bytes for each statement”，递归 STARK 的 ISA 首选 RISC-V | [8] | observed | P、U |
| E31 | 按当前草案，“自选签名再 STARK”这条路不可用，因为 leanSTARK 0x11 无效、VK 没有注册机制、ISA 未定 | 由 E5、E8、E30 与 [1]“STARK verification keys … up to users”推出 | inferred | F12 |
| E32 | 规范称客户端 STARK 为 128 kB 起，追求快速生成时可达 512 kB；mode 0 wrapper 最多带 1 个 leanSTARK | [1] Motivation、Constants | observed | |
| E33 | leanVM @3a37fb6 在 M4 Max 上聚合 850 个 leanSPHINCS：1.0 s，峰值 16.1 GiB，证明 325.8 KiB，验证 5.1 ms；自述 “not (yet) production ready” | [19] | observed | F16 |
| E34 | 手机或钱包端本地为 Falcon / ML-DSA 生成 STARK 的成本没有公开基准，可行性未经证实 | 检索 [19][8][1] 均无相关数据 | speculative | F12 |
| E35 | 社区在 leanVM 中做出“任意 leanSTARK 程序绑定 VK 承诺”的原型，候选 AGGREGATED_VK 取决于自递归 guest 的稳定身份 | [4] Chugar 2026-09-10 帖 | observed | |
| E36 | EIP-8355：ML-DSA-44/65/87 在 0x12–0x14，消息为末尾变长字节，ML-DSA-65 基础 gas 9,000 + 每字 6，created 2026-07-30 | [13] | observed | Q、R、F14 |
| E37 | EF 分级把 8355 评为 C 档，理由是 “premature standardization”；8081 在 ACDC 189 后把 8355 列为 Declined for Inclusion | [11]；[10] @6e69e49 | observed | F13、R、U |
| E38 | EIP-7885、8051、8052 不在 EIP-8081 的 SFI / CFI / PFI / DFI 任何一栏；8288 也不在 | [10] | observed | F13 |
| E39 | EIP-8052 的 Falcon 预编译地址 “TBD by ACD”，并明确避开 RIP 区间 0x0100–0x01FF | [15] Addresses | observed | R |
| E40 | EIP-8141 是 Hegotá 的 SFI 与 S 档执行层主打项，EF 称它是“a path to PQ signature schemes without a fork per scheme” | [10]；[11] | observed | F13、R、F14、U |
| E41 | ethereum.org 预计 Hegotá 在 2027 Q2 上主网（日期未确认）；bogota devnet 测试版于 2026-10-09 发布 | [22]；[23] | observed | F13、R、F14 |
| E42 | EIP-8081 当前激活表的 Sepolia 2026-10-06 / Hoodi 2026-10-26 与 Glamsterdam 的日期一致，疑似误写，不能当作 Hegotá 日期 | 由 [10] 与 [28]、[22] 对照推出 | inferred | |
| E43 | 预编译路线是每个节点在 EVM 中逐笔验签、逐笔携带 pk+sig；8288 路线是只有首跳与 builder 验原始签名、全网只验每块一个 STARK | 由 [13][14] 与 E9、E19、E25 推出 | inferred | Q |
| E44 | 第二篇说 8355 的消息为“32 B digest”，有误；8355 明确反对固定 32 字节预哈希 | [13] Motivation、Input format；第二篇面板 K | observed | R、F14 |
| E45 | EIP-7587（Final）把 0x0100–0x01ff 保留给 RIP 流程，第二篇所说 0x0101 “专有命名空间”实际位于 RIP 共享区间 | [17]；第二篇 F15 | observed | R、F14、S |
| E46 | 第二篇台账 #47（Native AA 2028–29 年前难以定稿）已过时，与 8141 排进 2027 Q2 的 Hegotá 不符 | 由 E40、E41 推出 | inferred | R、F14 |
| E47 | 第二篇的 ML-DSA-65 预编译方案应定位为近期容灾或过渡工具，而非终局 | 由 E26、E37 推出 | inferred | R、F14 |
| E48 | 账户适配层应抽象“验证后端”（预编译 / SP1 内验证 / 8288 依赖内省）；8288 只对 8141 帧交易有效，4337 账户不能直接声明依赖帧 | 由 E20、E1 推出 | inferred | R、F15 |
| E49 | 第一篇所说“L1 侧聚合（如 EIP-8288）”不能直接用于 Mantle 的 SP1 证明，因为 8288 只聚合 leanSPHINCS 和尚未定义的 leanSTARK | 由 E5、E31 推出 | inferred | R |
| E50 | leanVM 已改为 192 位二进制域 + WHIR，BLAKE2s 为占位，计划迁到 RISC-V rv64im，KoalaBear + Poseidon 为历史分支 | [19] | observed | F12、R |
| E51 | leanSPHINCS 签名约 3 kB、聚合证明约 320 KiB，要每个证明覆盖约 100 个以上签名，DA 才会减少 | 由 E18、E33 与 [8] 推出 | inferred | F16 |
| E52 | 在单一 sequencer 的 L2 上，8288 的多跳 mempool 递归退化为 sequencer 单点聚合，证明时间计入出块延迟 | 由 E19、E33 推出 | inferred | F16 |
| E53 | 把 8288 式区块证明放进 OP Stack，需要改 batch 格式和派生规则，或改由 OP Succinct 证明兜底 | 由 E9 与第一篇对 Mantle 派生和证明路径的描述推出 | inferred | |
| E54 | 在 SP1（Kona）里验证 leanVM STARK 的成本未知，可能成为 Mantle 采用 8288 式聚合的瓶颈 | 无公开基准 | speculative | F16、T |
| E55 | Base 曾宣布与 Optimism 等合作，把 EIP-8130 原生 AA 带到 Base（Cobalt）和“all OP Stack chains later this year” | [24] | observed | T |
| E56 | Base 的 Cobalt 于 2026-09-30 在主网激活，特性不含 8130；Everest 改为引入 EIP-8430，日期 TBD | [25] | observed | T |
| E57 | 没有找到 Optimism 官方采纳 8141 或 8288 的公开计划 | 检索 Optimism 博客、specs 与 Base 文档 [24][25] 均无 | observed | T |
| E58 | Mantle 近期在 L2 先行采用 8288 式设计不现实，因为 8141 未上线、leanVM 未生产就绪、AGGREGATED_VK 为 TBD | 由 E8、E33、E41 推出 | inferred | F16 |
| E59 | Falcon 用 LaBRADOR 聚合时，约 N≈200 笔才比 key-recovery、不聚合更省，在约 250 笔 / 块时收益不大 | [27] Results | observed | F16 |
| S1 | 签名层、聚合证明层、协议接口层可以独立选择并混搭（例如 Starknet 的“证明层哈希 + 账户层 Falcon”，8288 的“协议只验哈希型证明 + 账户自选签名”） | 由 H50、H52、E5、E29 推出 | inferred | F1 |
| S2 | a16z 称 Aerie 单机能聚合“roughly an Ethereum slot's worth of signatures” | notes-lattice [1] a16z 博客 “Aerie numbers at a glance” | observed | K、F10、R |
| S3 | 两条聚合路线都没有消除验签计算，只是改变了计算位置、证明传播方式和重复计算的节点数 | 由 H28–H30、L17、L36 推出 | inferred | K |
| S4 | 面板 O 的对比表是基于 H/L 各行的工程归纳，不是对整个算法家族的评分 | 由 H4、H10、H19、H22、L4、L19–L21、L30、L35、L36 汇总 | inferred | O |
| S5 | 把 Falcon 包进 STARK 后，安全性仍依赖 Falcon 的不可伪造性，外加 STARK 与递归的可靠性 | 由 E29、E31 与 notes-eip E-Q2“不确定之处”推出 | inferred | Q |
| S6 | Mantle 应单列 Falcon / ML-DSA 实验线，实测它们在 op-geth、Kona 和 SP1 中的验签成本；Aerie 只在需要批量聚合时才相关 | 由 L19、L36、E54 与第二篇 F5、F12 推出 | inferred | R、S |
| S7 | 能同时登记多把不同算法公钥（如 ML-DSA 与 leanSPHINCS）的账户，可在后端切换时不迁移账户 | 由 E5（8288 只原生支持 leanSPHINCS）、E48 推出 | inferred | F15、S |
| S8 | 值得跟踪的信号：8141 激活、8288 是否进入 I* 与 leanSTARK 定义、FN-DSA 草案、leanVM 哈希选择、a16z 完整论证与 EF 回应 | 由 E8、E29、E41、L12、L60、H17、H57 汇总 | inferred | S |
| S9 | Aerie 的“任何节点可重做证明、更多人能当聚合者”以单节点收齐全部签名为前提，签名在网络中如何汇聚未被建模 | notes-lattice L-Q3 (a)；[2] 论文 §7 只建模了证明时间 | inferred | N |
| S10 | 32,768 个 Falcon-512 签名逐个传输约 21 MB（32,768 × 666 B），Aerie 聚合后约 1.3 MB（含盐） | 由 L4、L21 计算 | inferred | B-0 |
| S11 | ML-DSA-65 每笔公钥 + 签名约 5.3 KB（1,952 + 3,309 B） | 由 L3 计算 | inferred | Q |
| S12 | 目前没有已知的 PQ 签名方案能像 BLS 那样直接聚合（相加成一个短签名） | notes-lattice [1] a16z 博客开头：“no known post-quantum signature scheme aggregates this way” | observed | B-0、推特卡片 |

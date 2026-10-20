# notes-lattice：格（Lattice）路线——原理、Falcon + Aerie、a16z / LayerZero / Algorand 的理由与弱点

> 本路前缀 L。资料截止 2026-10-20，网页访问日期均为 2026-10-20（除非另注）。
> 固定版本：a16z/aerie `main` @ `49b6c212c209286c536196f53618823ffdf0e899`（README + `specs/falcon.md`，spec 自注 “Last reviewed 2026-10-15”）；论文 = ePrint 2026/2501（2026-10-15 收稿、2026-10-17 上线），论文自称测的是 Aerie release v0.2.0 + Akita `e023b6a4`；leanVM README @ `127510d14c98ade4e8a97646c44fa7f1ff5e752d`。

---

## L-Q1 格签名原理（直觉级）与 Falcon / ML-DSA / FN-DSA 现状

**答案。** 格签名的安全性来自“在高维格里找短向量很难”（SIS / LWE / NTRU 一族问题）；module 结构把大矩阵换成多项式环上的小矩阵，从而让密钥和签名变小、运算变快。Falcon 是 “hash-and-sign”：用 NTRU 陷门 + 高斯采样直接找一个“满足方程又足够短”的解，验证 = 一条环方程 + 一个范数上界 + 规范编码检查；ML-DSA 是 “Fiat–Shamir with aborts”（类 Schnorr + 拒绝采样），基于 MLWE 和非标准变体 SelfTargetMSIS。Falcon 签名小、验证快，但签名端依赖浮点高斯采样，实现、侧信道、内存都难；2026 年这些难点在快速收敛（定点实现、11 kB RAM），NIST 已在 2026-09-28 宣布 FN-DSA 将强制定点，但 **FIPS 206 至今没有发布初始公开草案（IPD）**。

**依据。**
- 直觉：SIS = 给定随机矩阵 A，找短的非零 t 使 At = 0；LWE = 从 As + e（e 很小）中恢复 s；把 ℤ_q 换成环 R_q 上的模就是 MSIS / MLWE。FIPS 204 §3.2 原文这样定义，并写明 “ML-DSA 的安全性基于 R_q 上的 MLWE 和非标准 MSIS 变体 SelfTargetMSIS” [14]。Module-SIS / Module-LWE 这两个名字由 Langlois–Stehlé 在 ePrint 2012/090 中首次定义 [15]（这就是 Eli 说的“2012”）。
- ML-DSA 构造：FIPS 204 §3.3 说明它是 “Schnorr-like”，在 Fiat–Shamir 框架里对 z 做拒绝采样，否则会泄露私钥；签名主循环期望重复 4.25 / 5.1 / 3.85 次（44/65/87）[14]。
- ML-DSA 尺寸（FIPS 204 Table 2）：ML-DSA-44 pk 1,312 / sig 2,420；ML-DSA-65 pk 1,952 / sig 3,309；ML-DSA-87 pk 2,592 / sig 4,627（字节），分别对应 NIST 类别 2/3/5 [14]。
- Falcon 尺寸（Aerie spec 参数表，与 Falcon v1.2 一致）：Falcon-512 pk 897 / 带填充签名 666（含 1 B 头 + 40 B 盐）；Falcon-1024 pk 1,793 / sig 1,280；q = 12,289，环 ℤ_q[X]/(X^n+1)，n = 512 / 1024，分别对应 NIST 类别 I / V [4][2]。
- Falcon 验证三件事（spec §2.2）：用 `HashToPoint(盐 ‖ SHAKE256(pk,64) ‖ 0x00 ‖ 0x00 ‖ 消息)` 算目标 c；算 s1 = c − h·s2 mod q；检查 ‖s1‖² + ‖s2‖² ≤ ⌊β²⌋（Falcon-512 为 34,034,726）；并且 s2 必须能正确解码成规范压缩编码 [4]。
- 速度量级（论文 §6.3，Apple M4 Max 单核，PQClean aarch64 实现，round-3 framing）：Falcon-512 验证约 15.8 µs/次、签名约 96 µs/次；fn-dsa 0.3.0 是 16.4 µs / 106 µs [2]。Algorand 技术简报的口径是“验证在现代 CPU 上通常低于 100 µs” [19]。ML-DSA 的速度本路没有拿到同机一手数据，不在这里给数字。
- 签名端难点：ePrint 2026/1531 摘要写明 Falcon “主要缺点是依赖浮点运算，而浮点对安全分析至关重要”：有些平台没有 FPU，很多处理器上浮点除法不是常数时间，嵌入式设备上对浮点做掩码防护尤其难；该文给出定点实现（签名约比浮点原版慢 2 倍，比整数模拟浮点快一个数量级），但精度分析“目前仍部分依赖经验” [8]。ePrint 2026/1915（Pornin）把 Falcon-512 签名 RAM 从约 31 kB 降到约 11 kB，Cortex-M4 上平均签名 13.45 M cycles，去掉了一半以上的浮点运算，“足以用于智能卡等小型嵌入式系统” [9]。ePrint 2026/2313 在 ELMO 模拟的 ARM Cortex-M0 上，对“只掩码了原像计算”的 Falcon 做功耗分析，4,000 条迹线成功率 98.3%；完全掩码可以防住，作者另提出基于拒绝采样的对策 [10]。
- NIST 计划：Ray Perlner 代表 FIPS 206 团队于 2026-09-28 在 pqc-forum 发帖 “New plan for FN-DSA”：(1) 只规定一个可以用 KAT 逐字节对齐的签名过程；(2) 密钥生成和签名都用定点（keygen 用 32.32，签名用 64.64，来自 2026/1531）；(3) 以后可用 SP 增补兼容的签名变体。追问时他确认 “FIPS 只允许这些定点类型”，并说 “目前我们批准的签名过程版本数为 0” [11]。
- FIPS 206 状态：NIST PQC 出版物列表（页面更新于 2026-08-05）列出了 FIPS 203/204/205 的终版，以及 IR 8610、SP 800-230 草案等，**没有 FIPS 206 任何版本**；`csrc.nist.gov/pubs/fips/206/ipd` 返回 404 [12]。2025-09-25 的 NIST 报告曾说 IPD “基本写完，等待批准”，当时的计划是“签名用 IEEE-754 binary64、必须逐字节匹配 KAT、只允许随机化签名（确定性签名可能危险）” [13]。2026-09 的新计划实际改写了这些内容。

**不确定之处。**
- “FIPS 206 IPD 未发布”的依据是 NIST 列表里没有 + URL 404。不排除有尚未进入列表的新页面，但 2026-09-28 的论坛帖仍在讨论“要做一个草案”，可以佐证 IPD 尚未发布。
- 2026/1531、2026/1915、2026/2313 的确切上线日期没有取到（ePrint 版本页返回 403）。NIST 帖子说 2026/1531 “发表于 Crypto”，2026/1915 “已在 PQC 论坛公布”。
- 论坛参与者 conner webber 提到 falcon-rust v0.1.3 的 ApproxExp 精度缺陷（CVE-2026-77382），该缺陷大约每 2^33 次采样才改变一次接受/拒绝判定，仍能通过官方 KAT [11]。这是论坛参与者的说法，本路没有核对 CVE 原文。

---

## L-Q2 Aerie 是什么、怎么工作（onboard 式）

**答案。** Aerie 是一个专门证明“这一批 Falcon 签名全部有效”的格 SNARK。prover 手里有 N 条（公钥, 消息, 签名），输出“盐 + 一份约 66 KiB 的证明”。verifier 拿到公钥、消息和盐，自己算每条签名的 HashToPoint 目标 c_i，再检查证明，证明里只涵盖代数部分：环方程、范数、规范编码。承诺用 Akita（基于 Module-SIS 的多项式承诺），协议主体是三段 sum-check 加一次批量 Akita opening，**没有递归**。它的定位是研究发布：未达生产验收；默认每条签名留 40 B 盐，聚合物大小随 N 线性增长；不能合并别人做好的证明；ML-DSA 和混合签名还在扩展中。

**怎么工作（逐步）。**
1. **输入。** 每条记录 = (公钥 pk_i, 消息 m_i, 40 B 盐 r_i)。一份证明只能装同一参数集（512 和 1024 不能混），1 ≤ N ≤ 65,536，N 会填充到 2 的幂（Falcon-512 最少 8 行）[3][4]。
2. **为什么哈希可以留在证明外。** Falcon 的哈希输入只有盐和消息（当前实现还带公钥哈希前缀），不依赖签名本体。只要把盐公开，verifier 就能自己算出目标 c_i，证明只需涵盖 “s1 + h·s2 ≡ c (mod q)、范数、编码” [1][2]。这个“公开盐”思路出自 Aardal 等人（ePrint 2024/311，CRYPTO 2024 的 LaBRADOR 聚合），LayerZero 博客和论文都写明了这一点 [2][5]。Aerie 的贡献是把这个模板做得很快，并把编码检查补进证明。
3. **见证与“虚拟多项式”。** prover 只承诺 s1、四平方松弛向量 e（把“≤ β²”变成“= β²”：任何非负整数都能写成四个平方和）、s2 的符号位与三段幅值数字 (a0, a1, a2, σ)，以及“剩余编码长度”的数字 (u0, u1, u2)，一共四个 Akita 承诺组。s2 本身、模 q 的残差 Δ 等都是“虚拟多项式”，不单独承诺 [2][4]。
4. **两个随机投影替代商多项式。** 范数用结构化随机投影（输出 156 个值）检查平方和不超过阈值；“残差能被 q 整除”用另一个投影（输出 31 个值）检查。固定输入的作弊通过概率上界分别为 2^-136 和 2^-142 [2]。
5. **三段 sum-check + 一次 opening。** 所有恒等式（环方程、范数等式、编码长度、σ² = 1、数字范围）用随机权重合并，经三段 sum-check 归约为 9 个承诺多项式在 3 个点上的取值，最后用一次批量 Akita opening 证明 [2][4]。
6. **规范编码也被证明。** 数字范围保证 |s2_j| ≤ 2047，“Σ⌊|s2_j|/128⌋ ≤ L” 保证能塞进 666 B / 1,280 B 的填充格式（Lemma 3.1：满足关系 ⇒ EncodePadded 输出能被标准 Falcon 验证接受）。论文和 a16z 博客都强调，先前方案（LaBRADOR 聚合、Orthus）没有做这一项，所以可能接受标准 verifier 会拒绝的签名 [1][2]。
7. **Fiat–Shamir 绑定。** transcript 绑定有序记录 (hpk_i, r_i, m_i)、记录数和盐模式，部分挑战前加工作量证明 nonce（grinding）[2][4]。

**Akita 是什么。** Akita 是 LayerZero Labs 和 a16z 合作的格多项式承诺（ePrint 2026/1983，2026-10-15 修订版），安全性来自标准 Module-SIS；证明 58–68 KB；验证比 Greyhound 快 22.1–108.7 倍；已集成进 Jolt [7]。LayerZero 的 Akita 博客称它是“同类中第一个 production-ready 的原语” [6]，但 Aerie 仓库本身声明自己只是 research release [3]，两者口径不同。

**基准（逐条带口径）。** 下列数字来自论文 Table 2/4/5/6 和 README。机器为 Apple M4 Max（12P+4E，64 GiB），macOS 27.0.1，Rust 1.95，无 GPU，16 worker 线程，取 7 次中位数；只计聚合，不计签名生成和密钥生成；尺寸含盐和头，不含 verifier 自带的公钥和消息 [2][3]。
- **32,768 × Falcon-512**：证明 0.645 s（约 50,800 sig/s）；单线程验证 53.6 ms；16 线程验证 11.6 ms；峰值内存 2,113 MiB（输入本身约 50 MiB，峰值约为输入的 42 倍）；聚合物 1,346.4 KiB（约 42.1 B/sig，其中 40 B 是盐）；共同盐模式约 66.4 KiB（**估算值**：从实测值中减去 40·(N−1) 字节）[2][3]。
- **16,384 × Falcon-1024**：证明 0.63 s；单线程验证 49.4 ms；聚合物 706 KiB（44.1 B/sig）；峰值 2,106 MiB [2]。
- **对比原生**（同机单核，PQClean）：逐条验证 32K 需 519 ms，16 线程需 42.9 ms；Aerie 单线程验证快约 10 倍，16 线程只快 3.7 倍；单线程证明需 4.3 s，约为原生验证的 8 倍、原生签名（3.2 s）的 1.4 倍 [2]。单线程验证的时间里，70% 花在给公钥做哈希和算 HashToPoint，Akita opening 占 14% [2]。所以 **verifier 的成本仍随 N 线性增长**。
- **对比 Orthus**（ePrint 2026/398）：两者跑在同一台 AMD Ryzen 9 9900X（Zen 5，AVX-512）的单核上，取 3 次中位数。32K 时证明 5.63 s 对 8.24 s（1.5–1.6 倍），验证 41.1 ms 对 1,574 ms（全区间 33–52 倍），proof 66.4 KiB 对 112.7 KiB（1.7 倍，Aerie 一方取共同盐估算值），内存约 1/3。注意 Orthus 证明的是更受限的命题（共同盐、公钥预处理、不检查编码），论文自己说这个工作负载比较“偏向 Orthus” [2]。
- **对比 LaBRADOR / PSE**：a16z 引用 PSE 在 ethresear.ch 上的基准，1 万条签名约 74 KB，验证需秒级 [1]。论文引用的 Dachshund 实现在 i5-11400H 单核上，1 万条 Falcon-512 证明 5.96 s、验证 2.65 s [2]。
- **对比 leanVM**（XMSS，固定 revision `127510d1`，同一台 M4 Max）：leanVM 的 900 条 XMSS 全核证明 0.51 s、单线程 4.7 s，所以 Aerie 吞吐是它的 **29 倍（全核）/ 39 倍（单线程）**；leanVM 递归证明的验证更快：2 子 5.9 ms、16 子 6.5 ms，Aerie 的 54 ms / 11.6 ms 分别是它的 9 倍 / 1.8 倍 [2]。论文 Table 5 把 leanVM 聚合 33,300 条（37 片叶子）的递归树建模：每个节点各用一台 M4 Max、不计网络时间，最佳延迟 2.0 s（每次合并 4 个证明），总工作量约 29 机器秒；Aerie 单机 0.65 s，对比为 3.1 倍延迟、44 倍总工作量。论文同时承认 leanVM 可以把工作分给多人、合并他人的证明，而 Aerie 不行 [2]。leanVM README（同一 commit）自报 900 条 XMSS 0.545 s ≈ 1,651 sig/s，SPHINCS 为 817.7 sig/s [16]。a16z 据此说“约 820/s，约慢 60 倍”[1]。
- **吞吐口径不一致（必须注明）。** a16z 博客和论文写 “约 50,800 vs 1,770” [1][2]；LayerZero 博客写 “Aerie 约 46,000 vs leanVM 约 1,600 leanXMSS/s” [5]；leanVM README 自报 1,651/s [16]。比值都在约 29 倍附近，但绝对数各不相同，引用时应写明出处。

**安全模型。**
- 论文 Theorem 5.9 是 **经典随机预言机模型（classical ROM）下的知识可靠性（knowledge soundness）**，覆盖两个参数集的所有批大小；Theorem 5.11 把“选择公钥（chosen-key）下的聚合伪造”归约到 FN-DSA 的 EUF-CMA，不需要 proof-of-possession [2]。spec §10.1 明写：“it makes no QROM claim” [4]。
- 误差项包括：每次 prover 哈希查询最多 2^-128（verifier 地址项合计约 2^-117.8，对应 Q = 0 时）、Module-SIS 优势项等。抽取器期望运行 prover (Q+2)·K̂ 次，2^21.4 < K̂ < 2^39.7，而**选 Akita 参数时用的格估计没有计入这个因子** [2]。
- 每条签名独立盐模式下，签名者是 FN-DSA / fn-dsa 0.3.0（每次尝试都取新盐），其不可伪造性由 Fouque 等（ePrint 2024/1769，EUROCRYPT 2026）在 ROM 中归约到格假设 [2][3]。
- **共同盐 / 确定性模式**，README 原话：“Unforgeability of this fixed-target signer is an assumption of common-salt mode. No reduction to a standard lattice assumption is known, and no attack is known.”，并且 “Aerie includes no common-salt signer” [3]。spec §10.2 还要求：签名随机性必须由独立的秘密密钥 + 盐 + 消息确定性派生；同一密钥只能用一个实现、版本和 feature 集签名，因为 fn-dsa 的版本和 `shake256x4` feature 都会改变输出 [4]。论文对共同盐模式另有一个**有条件的** classical-ROM 归约（Assumption C.8），并带一个 ρ_S ≤ e(Q_S+1) 的损失因子 [2]。
- **Algorand 免盐的说法**：a16z 称 Algorand 的确定性 Falcon 用固定值替换盐，“聚合时不需要任何盐，只要 66 KiB proof，但要对盐和签名编码的处理做小改动” [1]。spec 指出，Lazar–Peikert 的确定性 Falcon 用 Falcon 私钥本身来派生随机性，**这不在 Aerie 论文的去随机化定理覆盖范围内** [4]；Aerie 也不支持原始 `r‖m` framing [3]。所以目前“Algorand 签名 + Aerie 66 KiB”还只是一个需要改代码、并接受额外假设的设想。

**当前不能做的 / 声明。**
- README：“Status: research release… Neither parameter set has passed the production acceptance criteria”；wire v1 已冻结；“zero knowledge is not claimed” [3]。spec §12.2 列出的未完成义务包括：生产验收证据；PCS 抽取边界和具体 MSIS / sampler 假设；外部形式化（未公开的 certified-projections 库）不可复现；Falcon-1024 四平方的全区间穷举证据 [4]。
- 论文 §7：“two aggregates cannot be combined”。要么设计合并方法，要么做递归 verifier，而后者“会重新引入公开盐方案所避开的那一步启发式” [2]。
- 正在做的扩展（a16z 博客）：ML-DSA（它的哈希依赖签名本身，所以必须在证明里证哈希）；在 SNARK 内证明 Falcon 哈希以去掉盐（LaBinius，ePrint 2026/2103）；格 + 椭圆曲线的混合签名。a16z 说这些扩展“可能达不到 5 万/秒” [1]。LayerZero 博客的说法更强：“ML-DSA 聚合已经在 Aerie 内高性能运行，具体数字待公布” [5]。目前没有代码或数字支撑这一说法。
- 兼容性：只支持 Falcon v1.2 填充格式 + 带公钥前缀的 framing（raw mode，空 context，与 fn-dsa 0.3.0 一致），“不声称兼容最终 FIPS 206” [3][4]。
- 论文披露：实现、基准，以及“推导投影定理和安全证明”都大量使用了 OpenAI 和 Anthropic 的模型，作者对正确性负全责 [2]。

**不确定之处。** 66 KiB 共同盐数字是估算值，不是实测；没有独立复现；QROM 下的安全性没有任何声明（leanVM README 至少声明了 “64-bit QROM”[16]）。这对一个“后量子”聚合方案是值得点出的空白（inferred）。

---

## L-Q3 a16z / LayerZero 偏向格的理由（逐条拆）

**答案。** a16z 的论证可以拆成四条：(a) 性能：单机就能聚合整个 slot，不需要递归，于是更简单、更多人能当聚合者、出故障也容易恢复；(b) 安全：递归哈希证明“连在 ROM 里都无法建立安全性”；(c) 标准化：lean 系列是 NIST 之外的定制方案，哈希函数也还没定，硬件钱包、HSM、托管机构难以支持；(d) 隐私：公钥加密不能用黑盒方式从哈希构造（Impagliazzo–Rudich），隐私 L1 最终还是要依赖格（ML-KEM），所以在签名和证明里避开格是“只付成本、不拿收益”。a16z 说完整论证会另写一篇，截至 2026-10-20 本路没有找到这篇。

**依据与逐条核对。**
- (a) 博客原文：“leanVM 每个证明只覆盖约 900 个签名，覆盖全 slot 需要多轮递归合并”；Aerie 则让“更多参与者能聚合、恢复更简单：聚合者失败时，任何持有同一批签名的节点都能出替代证明” [1]。事实部分：900 / 递归与 leanVM README 一致 [16]；论文自己也承认 Aerie 必须由单个节点持有整批签名，不能合并 [2]。去中心化的好处取决于签名怎样汇聚到单个节点，这一点论文没有建模（inferred）。
- (b) 博客原文：“each recursive step proves statements about the very hash function used to make the proofs non-interactive. So the security of the resulting proofs can't be established even in the random oracle model.” [1]。论文 §1.2 的依据更具体：ROM 中不存在能证明“自身查询 oracle 的计算”的 succinct 论证（Barbara–Chiesa–Guan，ePrint 2024/728）；已知的递归分析要依赖不可证伪的非黑盒抽取器假设，没有具体界，损失随深度指数增长；实践中参数按“组合不损失安全”来设；Khovratovich–Rothblum–Soukhanov（ePrint 2025/118）的实用 Fiat–Shamir 攻击正好落在“电路里计算自己的 FS 哈希”这一场景 [2]。这是证明模型层面的缺口，**不是对 leanVM 的攻击**（inferred）。另一面，leanVM README 声明 “128-bit ROM (64-bit QROM) soundness”，并说“端到端形式化验证进行中、尚未生产就绪” [16]。双方对“ROM 安全”的说法口径不同，需要并列呈现。
- (c) 推文配图逐字：“Ethereum's planned consensus and account signatures are custom schemes outside NIST's standards, with the underlying hash still undecided. This limits support from hardware wallets… and from the hardware security modules and custody systems” [27][1]。事实部分：leanVM README 写 “BLAKE2s is a placeholder. SHA2, SHA3, BLAKE3 are actively considered”，XMSS 和 SPHINCS 参数都标 “This is not the definitive parameter set” [16]。反过来看：FN-DSA 本身也还不是 NIST 标准（FIPS 206 无 IPD，见 L-Q1）[12]；Aerie 也只是 research release [3]。所以“标准化”这条对 Falcon 同样不完全成立（inferred）。
- (d) 博客：Impagliazzo–Rudich 证明公钥加密不能由哈希黑盒构造；Merkle puzzles 只有二次优势，并且在 RO 模型下最优；“Even advocates of hash-only designs acknowledge this”，链接到 Vitalik 2026-10-07 的帖子 [1]。核对：Vitalik 原帖确实写了 “long-standing mathematical theorems showing why public-key encryption cannot be done with hashes alone”，他给的对策是“隐私协议强烈倾向于不把加密 note 放上链，改走链下第三方渠道” [30]。a16z 的反驳是：链下渠道同样要加密，并且会迁移到 ML-KEM，还有可用性和元数据问题 [1]。注意 a16z 的措辞限定在“黑盒”，是准确的；EF strawmap 有“五个 north star”的说法本路没有核对。
- Justin Thaler 推文串（2026-10-16）：9/ “lattices remove the need for recursion and custom hash-based signatures… That concrete benefit has to be weighed against the far more speculative possibility of new attacks on standard lattice assumptions”；10/–11/ 是隐私论点 [29]。
- LayerZero 两篇博客的措辞：Aerie 篇强调“8x overhead over native”、单机消费级硬件、“low-latency post-quantum consensus without requiring specialized proving hardware” [5]；Akita 篇列出格相对哈希的好处：证明小 2–8 倍、稀疏负载快、“与后量子互联网其余部分更容易集成” [6]。
- 背景：a16z 早在 2026-09-09 发布 Lattice Jolt（“格 SNARK 更快、更紧凑”）[35]；Aerie 是这条路线的延续。

**不确定之处。** “完整论证另文”尚未发布；LayerZero 的 ML-DSA 说法未经证实；单机聚合对网络层（签名怎样汇聚到一个节点）的影响没有实测。

---

## L-Q4 Algorand 的选择；Solana；其他

**答案。** Algorand 是格路线唯一有主网部署的大链。它分三步走：State Proofs 用 Falcon-1024 签名（每 256 轮一次）；AVM v12 加入 `falcon_verify` 操作码，用 LogicSig 包装 Falcon 账户，并做过主网首笔 PQ 交易；go-algorand v5.0.0（v42 共识升级，GitHub release 发布于 2026-08-12）引入原生 `pqsig` Falcon-1024 账户。它用的是**确定性 Falcon 变体，与 FN-DSA 草案不同**。官方理由是签名紧凑、验证快、整数验证可确定性复现，并且可以复用 State Proofs 已有的 Falcon 代码。另外，Falcon 的 GPV 理论来源、Falcon 提交团队和确定性模式作者都与 Algorand 有直接人事联系。Solana 方面，Anza 和 Firedancer 各自做了 Falcon 原型，但只是“继续评估”；共识层则在 2026-10-21 切换到 Alpenglow，其投票证书用的是 BLS。

**依据。**
- Algorand 开发者文档：Falcon-1024 原生 PQ 账户属于 “v42 consensus upgrade, shipped in algod v5.0.0”；`pqsig` 是与方案无关的封装（`sch` = `f1` 表示 Falcon-1024，是当前唯一启用的方案；`f5` 预留给 Falcon-512，已定义但未启用），可按方案用共识参数开关；Falcon 签名额外收 2 倍基础费，所以最低费用是 3,000 µAlgo，对比 Ed25519 的 1,000；迁移方式是 rekey；不支持 PQ 原生 multisig，**共识参与密钥不变**；文中写 “Algorand uses a deterministic variant of Falcon, which differs from the draft FN-DSA” [17]。
- v5.0.0 release：“native Falcon-1024 account signatures, PQ delegated LogicSigs”，同时引入 AVM v13 的 `poseidon2`；GitHub API 显示 published_at 2026-08-12 [18]。
- 技术简报：主网首笔 PQ 交易走的是 LogicSig + `falcon_verify`（AVM v12）；State Proofs 用 Falcon-1024，“每 256 轮”一次；选择理由是 “compact signature size and high verification speed”、“deterministic arithmetic”、与 State Proofs 的延续性；简报承认 Falcon “仍是实验性的”，账户保护不等于共识升级；人事上，GPV 作者 Gentry / Peikert / Vaikuntanathan 与 Algorand 有关联，Zhenfei Zhang 参与了 Falcon 提案，确定性模式由 Lazar 和 Peikert 设计 [19]。
- NIST 2025 年的计划曾写 FN-DSA “Only allows randomized signing… Deterministic signing could be dangerous” [13]。这与 Algorand 的确定性变体，以及 Aerie 的共同盐模式，都存在张力（inferred）。
- Solana：官方文章说 Anza 和 Firedancer 独立得出“需要紧凑 PQ 签名”的结论，指向 Falcon，并各自有初步实现（firedancer PR #9446、anza solana-sdk PR #537）；路线图第 1 步是“继续研究、继续评估 Falcon 及其替代方案”；生态里已有 Blueshift 的 Winternitz Vault [20]。Alpenglow 页面写明主网在 epoch 1064（2026-10-21 约 13:20 UTC）激活，投票会被聚合成 certificate，并链接 “BLS Pubkeys and the Validator Admission Ticket” 一页 [21]。a16z 和 Aerie 论文据此说“Solana 也在采用 BLS 聚合” [1][2]。
- Cardano：只有 CPS-0027 / CPS-0030 等“问题陈述”文档，列出 ML-DSA / FN-DSA 等候选，没有做出选型 [36]。QRL 没有找到可引用的一手来源，不写。

**对前序报告的核对。** 第二篇 notes-chains 写 “v5.0.0（共识 v42）2026-08 主网正式激活”。v42 和 2026-08 发布可以确认 [17][18]，但**主网激活的具体日期本路没有找到一手来源**，release 页只说“包含协议升级”。同篇说“约 2 倍以上最低费用”，准确说法是“额外 2 倍基础费，最低 3,000 µAlgo”[17]。

**不确定之处。** 主网激活日期；Algorand 原生账户 framing 与 Aerie framing 的差异有多大（a16z 说“小改动”）。

---

## L-Q5 格路线的弱点（公平地写）

**答案。** 弱点分三层。(1) 假设层：格问题有丰富的代数结构，Vitalik、Drake、Eli 都把它视为 AI 加速数学的主要风险面。2026 年确实出现了 AI 辅助的格类方案攻击：Claude Mythos 改进了对 HAWK 的密钥恢复，HAWK 于 2026-07-29 撤回。但 HAWK 基于格同构问题（LIP），不是 SIS / LWE / NTRU；Anthropic 明说该攻击不影响一般的格密码。Eli 说 “module SIS 2012 年才有” 在事实上成立（Langlois–Stehlé 2012）；而 Aerie 依赖的“succinct 版本”，即格多项式承诺，比 2012 还要新得多（Akita 是 2026 年的）。(2) 实现层：Falcon 签名端的浮点、采样、侧信道和内存问题仍在解决中，FN-DSA 尚未定稿，并且刚刚改成定点。(3) 系统层：Aerie 未审计、未达生产验收，默认非常数大小，共同盐依赖非标准假设，没有 QROM 声明，不能合并证明。

**依据。**
- Eli 2026-10-18 原文（fxtwitter 核对）：“Lattices have juicy mathematical structure, ripe for AI to attack. And the succinct versions based on module SIS are too new -- only around since 2012. I recommend waiting another 3-5 years…” [28]。“2012” 对应 ePrint 2012/090 首次定义 Module-SIS / LWE [15]。Falcon 不基于 Module-SIS（它基于 NTRU，其不可伪造性按 Fouque 等归约到格假设）；Akita / Aerie 的承诺基于 Module-SIS [2][7]；ML-DSA 基于 MLWE + SelfTargetMSIS [14]。所以 Eli 这句话主要打中的是 Aerie 的**证明系统**（以及 ML-DSA），不完全是 Falcon 签名本身（inferred）。
- Vitalik 2026-10-07：“The core new area of risk from this viewpoint is, unfortunately, ML-DSA / FHE / lattices”，并称 lean Ethereum “no lattices, no ML-DSA, no Falcon, no lattice-based commitments inside ZK proofs”；建议对格“在参数上更偏执”（他的推断是“key sizes ×10”）[30]。Justin Drake 同日发帖呼吁 “bunker mode”，倾向“all-in hash-based” [33]。反方 Charles Hoskinson 10-09 的长文认为：格攻击（LLL、BKZ、筛法）早已计入参数，LWE 有最坏情况到平均情况的归约而 SHA-256 没有，哈希路线自己也依赖 Poseidon 和 proximity-gap 猜想 [34]（二手存档，仅作反方观点的线索）。
- HAWK 事件：Anthropic 博文说，Mythos 在约 60 小时内改进了 HAWK 的最佳已知攻击，“有效密钥长度减半”，攻击来自一个此前未被利用的非平凡自同构，仍是指数时间；“It is specific to HAWK and does not impact other NIST post-quantum signature candidates or lattice-based cryptography in general”；HAWK 的安全性基于 Lattice Isomorphism Problem [22]。NIST 新闻脚注：“On July 29, 2026, the HAWK development team withdrew its algorithm… following an announcement by Anthropic” [23]。NIST IR 8610 曾把 HAWK 选入第三轮，理由是“签名比 Falcon 小且不需要浮点” [24]。同期的人类工作：ePrint 2026/1318 先声称在启发式下多项式时间恢复 HAWK 密钥，6/30 更正为“似乎是超多项式”[25]；Aerie 合作者 Quang Dao 在 ePrint 2026/1298 打破了 HAWK 的 BUFF 性质 [26]。本路没有找到 2026 年针对 SIS / LWE / NTRU / Falcon / ML-DSA 本体的公开 AI 攻击。
- Falcon 实现复杂度与 FN-DSA 未定稿：见 L-Q1 [8][9][10][11][12]。
- Aerie 的系统弱点：见 L-Q2 [2][3][4]。补充一点：verifier 需要全部公钥。32,768 × 897 B ≈ 28 MiB，在共识场景下公钥属于状态，但这对“聚合物只有 1.3 MB”的叙述是重要口径（inferred，自行计算）。
- Aerie 发布后（2026-10-16 之后）的公开回应：Eli（10-18）[28]；@lex_node（10-18，律师，非研究者）认为哈希路线让 Ethereum “现在全速推进”，格可以以后通过预编译用于账户 [31]；Vitalik（10-19）的回复不针对 Aerie 本身，而是主张通过 EIP-8288 “本地生成任意签名再 STARK 它”，“Ethereum can then never add a new precompile again” [32]。**本路没有找到 EF / leanVM 团队对 Aerie 基准或递归安全批评的正式回应**（ethresear.ch 或推文）。

**不确定之处。** 2026 年 10 月“OpenAI 数学发布”的具体内容，以及它是否涉及格，本路没有核对（Drake 帖子提到 722 个结果中密码学结果“明显偏少”）[33]。AI 风险对格的真实影响属于推测，双方都没有可证伪的证据。

---

## 对外部调研（GPT）的修正

1. **FN-DSA 状态引错来源、表述不精确。** GPT 把“2026 年 9 月 NIST 新计划改用定点”挂在 FIPS 204 页面上；正确来源是 pqc-forum 2026-09-28 Perlner 的帖子 [11]。GPT 也没有指出 **FIPS 206 至今没有 IPD**：NIST 列表里没有，ipd URL 返回 404 [12]。前序报告 notes-algorithms 写的 “Draft FIPS 206” 同样不准确，应改为“标准制定中，尚无公开草案；计划强制定点”。
2. **“29 倍”口径不全。** 29 倍是全核吞吐；单线程是 39 倍。论文还给了递归树模型（2.0 s 延迟、29 机器秒，对比 Aerie 的 3.1 倍 / 44 倍）[2]。三方的绝对数不一致：50,800/1,770（a16z / 论文）、46,000/1,600（LayerZero）、1,651（leanVM README @127510d）[1][5][16]。GPT 说“当前 README 约 1,362/s”，本路没有核实（固定 commit 上是 1,651/s）。
3. **把“公开盐、哈希留在证明外”归为 Aerie 的突破不准确。** 这个思路来自 Aardal 等 2024（LaBRADOR 聚合），LayerZero 和论文都写明了 [2][5]。Aerie 的新东西是结构化投影、去商多项式、编码证明和 Akita。
4. **安全模型补充。** GPT 正确写了“经典 ROM 知识可靠性”，但漏了：spec 明写 “no QROM claim” [4]；抽取损失因子 (Q+2)·K̂（最大约 2^39.7）没有计入 Akita 参数估计 [2]；安全证明部分借助 AI 推导、外部形式化不可复现 [2][4]。
5. **Orthus 对比的口径。** GPT 没提到 Orthus 证明的是更受限的命题（共同盐、预处理公钥、不验证编码），也没提到 66.4 KiB 是估算值 [2]。
6. **LayerZero 的 ML-DSA 说法。** GPT 没有提到 LayerZero 博客声称 “ML-DSA 聚合已在 Aerie 内运行” [5]。这与 a16z 的“正在扩展”说法 [1] 口径不同，应标为未证实。
7. **Algorand。** GPT 引用的是 algorand.co learn 页面。一手的理由应取技术简报和开发者文档 [17][19]。另需补充：Algorand 的原生 PQ 账户**不改变共识参与密钥**，没有 PQ 原生 multisig，Falcon-512 已定义但未启用 [17]；NIST 2025 年计划只允许随机化签名，与 Algorand 的确定性变体有张力 [13]。
8. **“Falcon 永远依赖浮点已不准确”**：方向正确，但应该说得更精确：NIST 计划在 FIPS 中**只允许**定点（keygen 32.32、sign 64.64）[11]；定点 Falcon 的精度分析“目前部分基于经验” [8]。
9. **资料边界。** GPT 没抓到 X 原帖。本路已经用 fxtwitter 核对了 Eli、a16z（配图全文）、Thaler 9/、Vitalik 10-07、lex_node、Drake 10-07 的原文和时间戳 [27][28][29][30][31][33]。

---

## 来源

1. **PRIMARY** a16z crypto，“Fast post-quantum signature aggregation with lattice SNARKs”，2026-10-16。证明 a16z 的四条理由、基准摘要、ML-DSA / 去盐 / 混合扩展计划、Algorand 免盐说法、“完整论证另文”。https://a16zcrypto.com/posts/article/fast-post-quantum-signature-aggregation-with-lattice-snarks （访问 2026-10-20）
2. **PRIMARY** Centelles, Dao, Badakhshan, Thaler，《Aerie: Efficient Aggregation of Falcon Signatures》，ePrint 2026/2501（2026-10-15 收稿，10-17 上线）；PDF：https://assets.layerzero.network/pdf/aerie.pdf 。证明协议、Thm 5.9 / 5.11（classical ROM）、Table 2–6 基准与口径、leanVM / Orthus 对比、§7 局限、AI 使用披露。（访问 2026-10-20）
3. **PRIMARY** a16z/aerie README @ `49b6c212c209286c536196f53618823ffdf0e899`。证明“research release”状态、证明命题、共同盐假设原话、无共同盐签名器、framing 限制、README 基准表。https://github.com/a16z/aerie （访问 2026-10-20）
4. **PRIMARY** a16z/aerie `specs/falcon.md` @ 同一 commit（Last reviewed 2026-10-15）。证明参数表、验证关系、“no QROM claim”、§10.2 共同盐签名器要求、§12.2 未完成义务。
5. **PRIMARY**（厂商）LayerZero，“Introducing Aerie”。证明 LayerZero 的表述：46,000 vs 1,600 口径、ML-DSA “已在运行”的说法、承认公开盐思路源自 Aardal 等。https://layerzero.network/blog/introducing-aerie （访问 2026-10-20）
6. **PRIMARY**（厂商）LayerZero，“Introducing Akita”。证明 Akita 被描述为“production-ready”、首先部署于 Jolt、格相对哈希的好处列表。https://layerzero.network/blog/introducing-akita
7. **PRIMARY** Dao 等，《Akita》，ePrint 2026/1983（2026-10-15 修订）。证明 Akita 基于标准 Module-SIS、证明 58–68 KB、验证速度对比。https://eprint.iacr.org/2026/1983
8. **PRIMARY** De Almeida Braga, Fouque, Lachguel, Prest，ePrint 2026/1531（定点 Falcon）。证明浮点难点清单、定点签名约慢 2 倍、精度分析部分基于经验。https://eprint.iacr.org/2026/1531
9. **PRIMARY** Pornin，ePrint 2026/1915。证明 Falcon-512 签名 RAM 31 kB→约 11 kB，Cortex-M4 上 13.45 M cycles。https://eprint.iacr.org/2026/1915
10. **PRIMARY** Keng-Yu Chen，ePrint 2026/2313。证明对部分掩码 Falcon 的功耗攻击：4,000 条迹线、98.3%（ELMO 模拟 Cortex-M0）。https://eprint.iacr.org/2026/2313
11. **PRIMARY** NIST pqc-forum，Ray Perlner，“New plan for FN-DSA”，2026-09-28 及后续回复。证明强制定点、单一 KAT 签名过程、“已批准签名版本数为 0”。https://groups.google.com/a/list.nist.gov/g/pqc-forum/c/7z-y5qp-W2Y
12. **PRIMARY** NIST CSRC，PQC Project Publications（页面更新 2026-08-05）；以及 `https://csrc.nist.gov/pubs/fips/206/ipd` → 404。证明 FIPS 206 未出现在出版物列表。https://csrc.nist.gov/Projects/post-quantum-cryptography/publications
13. **PRIMARY** NIST，Perlner，“FIPS 206 Status Update”，第六届 PQC 标准化会议，2025-09-25。证明当时的计划：IPD “基本写完”、binary64 浮点、只允许随机化签名。https://csrc.nist.gov/csrc/media/presentations/2025/fips-206-fn-dsa-(falcon)/images-media/fips_206-perlner_2.1.pdf
14. **PRIMARY** NIST FIPS 204（ML-DSA，2024-08-13）。证明 §3.2 / §3.3 的假设与构造、Table 1 / Table 2 尺寸。https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.204.pdf
15. **PRIMARY** Langlois, Stehlé，ePrint 2012/090。证明 Module-SIS / LWE 于 2012 年定义。https://eprint.iacr.org/2012/090
16. **PRIMARY** leanEthereum/leanVM README @ `127510d14c98ade4e8a97646c44fa7f1ff5e752d`。证明 900 XMSS 0.545 s（1,651/s）、SPHINCS 817.7/s、“128-bit ROM (64-bit QROM)”、BLAKE2s 是占位、非生产就绪。https://github.com/leanEthereum/leanVM/blob/127510d14c98ade4e8a97646c44fa7f1ff5e752d/README.md
17. **PRIMARY** Algorand Developer Portal，“Post-Quantum Accounts”。证明 v42 / v5.0.0、`pqsig`、确定性变体不同于 FN-DSA 草案、费用、局限。https://dev.algorand.co/concepts/accounts/post-quantum/
18. **PRIMARY** algorand/go-algorand Release v5.0.0-stable（GitHub API published_at 2026-08-12T14:30:21Z）。证明原生 Falcon-1024 账户随该 release 发布。https://github.com/algorand/go-algorand/releases/tag/v5.0.0-stable
19. **PRIMARY** Algorand Foundation，“Technical Brief: Quantum-resistant transactions on Algorand with Falcon signatures”（约 2025 年末）。证明 State Proofs 用 Falcon-1024、`falcon_verify`（AVM v12）、选型理由、人事关联。https://algorand.co/blog/technical-brief-quantum-resistant-transactions-on-algorand-with-falcon-signatures
20. **PRIMARY** Solana Foundation，“Solana's Proactive Preparation for Quantum”。证明 Anza / Firedancer 的 Falcon 原型与“继续评估”的定位。https://solana.com/news/quantum-readiness
21. **PRIMARY** Solana，“Alpenglow”（Updated October 2026）。证明主网于 epoch 1064（2026-10-21）激活、投票聚合为证书、BLS pubkey 页面。https://solana.com/upgrades/alpenglow
22. **PRIMARY** Anthropic，“Discovering cryptographic weaknesses with Claude”（2026-07 末）。证明 Mythos 对 HAWK 的攻击（LIP，有效密钥减半，“不影响一般格密码”）。https://www.anthropic.com/research/discovering-cryptographic-weaknesses
23. **PRIMARY** NIST 新闻，“Nine Candidates Advance to the Third Round…”（2026-05-14，含脚注）。证明 HAWK 于 2026-07-29 撤回。https://www.nist.gov/news-events/news/2026/05/nine-candidates-advance-third-round-additional-digital-signatures-pqc
24. **PRIMARY** NIST IR 8610（2026-05）。证明 HAWK 是第三轮唯一的格候选、优势是不需要浮点。https://csrc.nist.gov/pubs/ir/8610/final
25. **PRIMARY** Nelson, Limbrey, Ling, Mendelsohn，ePrint 2026/1318。证明人类团队对 HAWK 的多项式时间说法后更正为超多项式。https://eprint.iacr.org/2026/1318
26. **PRIMARY** Quang Dao，ePrint 2026/1298。证明 HAWK 的 BUFF 性质被弱密钥打破（2026-06）。https://eprint.iacr.org/2026/1298
27. **PRIMARY** @a16zcrypto，“The case for lattices 👇”，2026-10-16 23:11 UTC（配图为博客“非标准构造”两段）。https://x.com/a16zcrypto/status/2111233645948342778 （经 api.fxtwitter.com 读取）
28. **PRIMARY** @EliBenSasson，2026-10-18 10:51 UTC。https://x.com/EliBenSasson/status/2111772220389245426 （fxtwitter）
29. **PRIMARY** @SuccinctJT（Justin Thaler）Aerie 推文串，2026-10-16 16:44 UTC，第 9 条经 fxtwitter 核对；第 1/3/5/6/8/10/11 条取自搜索快照。https://x.com/SuccinctJT/status/2111136133623251316
30. **PRIMARY** @VitalikButerin，2026-10-07 23:28 UTC（AI 与格风险、PKE 不能只靠哈希、加密 note 放链下）。https://x.com/VitalikButerin/status/2107976296320106851 （fxtwitter）
31. **PRIMARY** @lex_node，2026-10-18 14:11 UTC。https://x.com/lex_node/status/2111822591123927371 （fxtwitter）
32. **PRIMARY** @VitalikButerin，2026-10-19（EIP-8288、“never add a new precompile again”）。https://x.com/VitalikButerin/status/2112015118418473358 （文本由主会话提供）
33. **PRIMARY** @drakefjustin，“bunker mode”，2026-10-07。https://x.com/drakefjustin/status/2107837081313505768 （fxtwitter）
34. 二手：Post-Cutoff 对 Charles Hoskinson 2026-10-09 长文的存档。证明存在反方论点（格攻击已计入参数等）。https://postcutoff.com/p/2026-10-09-iohk-charles-lattices-rebuttal/
35. **PRIMARY** a16z crypto，“Entering the era of lattice SNARKs – with a faster, post-quantum Jolt”，2026-09-09（搜索快照）。证明 a16z 格 SNARK 路线的前序。https://a16zcrypto.com/posts/article/lattice-snarks-jolt-post-quantum-faster
36. **PRIMARY** Cardano CPS-0027 / CPS-0030。证明 Cardano 只有问题陈述，尚未选型。https://cips.cardano.org/cps/CPS-0030
37. 内部：第二篇报告 research/notes-chains.md、notes-algorithms.md（pq-in-mantle），用于核对。
38. 线索：research/gpt-pq-signature-selection.md（ChatGPT Deep Research）。

---

## 开放问题

1. a16z 承诺的“格路线完整论证”什么时候发、包含什么内容？会不会量化“递归安全缺口”和“格 AI 风险”的相对大小？
2. LayerZero 说的 Aerie-ML-DSA“已在运行”：吞吐、证明大小、需要证明的哈希量是多少？
3. FIPS 206 IPD 什么时候发布？定点规范定稿后，FN-DSA 签名格式和 framing 会不会与 fn-dsa 0.3.0、Aerie wire v1 不兼容？Algorand 确定性变体是否会因此长期游离于标准之外？
4. Aerie 在 QROM 下的安全性能否证明？抽取损失 (Q+2)·K̂ 计入后，Akita 的 Module-SIS 参数还剩多少余量？
5. Aerie 不能合并证明。在真实 P2P 网络里“单节点汇聚 32K 签名”的带宽和延迟是多少？与 leanVM 递归树（论文模型 2.0 s，不计网络）怎么比？
6. EF / leanVM 团队会不会正式回应“递归在 ROM 下无法分析”的批评？leanVM 的 “128-bit ROM” 声明是否涵盖递归组合？
7. Algorand v42 主网激活的确切日期（一手来源）。
8. 2026 年有没有针对 SIS / LWE / NTRU 本体（而不是 LIP）的 AI 辅助密码分析进展？

---

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| L1 | Module-SIS / Module-LWE 由 Langlois–Stehlé 于 2012 年（ePrint 2012/090）首次定义 | [15] ePrint 2012/090 摘要 | observed |
| L2 | ML-DSA 的安全性基于 R_q 上的 MLWE 和非标准变体 SelfTargetMSIS，构造为 Fiat–Shamir with aborts | [14] FIPS 204 §3.2–3.3 | observed |
| L3 | ML-DSA-44/65/87 公钥 1,312/1,952/2,592 B，签名 2,420/3,309/4,627 B，对应 NIST 类别 2/3/5 | [14] FIPS 204 Table 1–2 | observed |
| L4 | Falcon-512/1024 公钥 897/1,793 B，带填充签名 666/1,280 B（含 1 B 头 + 40 B 盐），q = 12,289 | [4] specs/falcon.md §2.1 参数表 | observed |
| L5 | Falcon 验证 = 由盐和消息算 HashToPoint 目标 c，检查 s1 + h·s2 ≡ c (mod q)、‖(s1,s2)‖² ≤ ⌊β²⌋、s2 可规范解码 | [4] specs/falcon.md §2.2 | observed |
| L6 | M4 Max 单核：Falcon-512 验证约 15.8 µs、签名约 96 µs（PQClean aarch64） | [2] 论文 §6.3 | observed |
| L7 | Falcon 签名依赖浮点：部分平台无 FPU，浮点除法常非常数时间，嵌入式掩码困难；定点实现约慢 2 倍，精度分析部分依赖经验 | [8] ePrint 2026/1531 摘要 | observed |
| L8 | Pornin 新实现把 Falcon-512 签名 RAM 从约 31 kB 降到约 11 kB，Cortex-M4 平均 13.45 M cycles | [9] ePrint 2026/1915 摘要 | observed |
| L9 | 对“只掩码原像计算”的 Falcon 的功耗攻击，4,000 条迹线成功率 98.3%（ELMO 模拟 Cortex-M0） | [10] ePrint 2026/2313 摘要 | observed |
| L10 | NIST 于 2026-09-28 宣布 FN-DSA 计划：keygen 和签名强制定点（32.32 / 64.64），只规定单一 KAT 签名过程 | [11] pqc-forum Perlner 帖 | observed |
| L11 | NIST 称“目前已批准的 FN-DSA 签名过程版本数为 0” | [11] Perlner 2026-09-29 回复 | observed |
| L12 | 截至 2026-10-20，FIPS 206 没有出现在 NIST PQC 出版物列表中，ipd URL 返回 404 | [12] PQC Publications 页 \| 404 检查 | observed |
| L13 | 由 L10、L11、L12 推出：FN-DSA 尚无公开草案，最终编码和 framing 仍可能变化 | 由 L10、L11、L12 推出 | inferred |
| L14 | NIST 2025 年计划 FN-DSA 只允许随机化签名，认为确定性签名可能危险 | [13] Perlner 2025-09 幻灯片 | observed |
| L15 | Aerie 证明的命题：每条记录都存在满足 Falcon 环方程、范数上界、规范压缩编码的签名；HashToPoint 由 verifier 自己计算 | [3] README “What a proof shows” | observed |
| L16 | “公开盐、由 verifier 算哈希”的思路来自 Aardal 等 2024（LaBRADOR 聚合），不是 Aerie 首创 | [2] 论文 §1、[5] LayerZero 博客 | observed |
| L17 | Aerie 用 Akita（Module-SIS 多项式承诺）+ 三段 sum-check + 一次批量 opening，没有递归 | [2] 论文 §1.3、Fig.3 | observed |
| L18 | Akita 基于标准 Module-SIS，证明 58–68 KB，修订版日期 2026-10-15 | [7] ePrint 2026/1983 | observed |
| L19 | Aerie 在 M4 Max（16 线程、无 GPU）上 0.645 s 证明 32,768 条 Falcon-512 签名 | [3] README Results 表 \| [2] Table 2 | observed |
| L20 | 32K Falcon-512：单线程验证 53.6 ms，16 线程 11.6 ms，峰值内存 2,113 MiB | [2] Table 2 \| [3] README | observed |
| L21 | 32K Falcon-512 聚合物 1,346.4 KiB（42.1 B/sig，其中 40 B 是盐）；共同盐约 66.4 KiB 是由实测减去盐得到的估算值 | [2] Table 2 注 \| §6.2 | observed |
| L22 | Aerie 单线程验证比 PQClean 逐条验证（519 ms）快约 10 倍；16 线程只快 3.7 倍（42.9 vs 11.6 ms） | [2] §6.3、Table 4 | observed |
| L23 | Aerie 单线程证明 4.3 s，约为原生验证的 8 倍、原生签名的 1.4 倍 | [2] §6.3 | observed |
| L24 | Aerie verifier 70% 的时间花在公钥哈希和 HashToPoint，成本随批量线性增长 | [2] §6.2–6.3 | observed |
| L25 | 同一台 Zen 5 AVX-512 服务器单核：对 Orthus，证明快 1.5–1.6 倍，验证快 33–52 倍，proof 小 1.7 倍；但 Orthus 证明的是更受限的命题（共同盐、预处理公钥、不验证编码） | [2] Table 6、§1.2 | observed |
| L26 | 同一台 M4 Max 上，对 leanVM@127510d1，Aerie 吞吐为 29 倍（全核）/ 39 倍（单线程）；leanVM 递归证明验证 5.9–6.5 ms，更快 | [2] §6.3 | observed |
| L27 | 论文建模 leanVM 聚合 33,300 条：每节点一台机器、不计网络，最佳延迟 2.0 s，总工作约 29 机器秒 | [2] Table 5 | observed |
| L28 | leanVM README@127510d 自报 900 XMSS 0.545 s（1,651/s）、SPHINCS 817.7/s，“128-bit ROM (64-bit QROM)”，非生产就绪 | [16] README benchmarks \| security | observed |
| L29 | 三方吞吐绝对数不一致：50,800/1,770（a16z / 论文）、46,000/1,600（LayerZero）、1,651（README），比值都约 29 倍 | [1] \| [2] \| [5] \| [16] | observed |
| L30 | Aerie 的安全性是经典 ROM 下的知识可靠性，并把聚合伪造归约到 FN-DSA EUF-CMA；不做任何 QROM 声明 | [2] Thm 5.9 / 5.11 \| [4] §10.1 “no QROM claim” | observed |
| L31 | 抽取器期望运行 prover (Q+2)·K̂ 次（2^21.4 < K̂ < 2^39.7），Akita 参数估计未计入这一因子 | [2] Thm 5.9 后文 | observed |
| L32 | 共同盐模式下，固定目标签名者的不可伪造性是额外假设：没有已知的标准格归约，也没有已知攻击；仓库不含共同盐签名器 | [3] README “Signers” | observed |
| L33 | Lazar–Peikert 确定性 Falcon（用 Falcon 私钥派生随机性）不在 Aerie 去随机化定理的覆盖范围内 | [4] specs/falcon.md §10.2 | observed |
| L34 | 由 L32、L33 和 Aerie 不支持 r‖m framing 推出：“Algorand 签名直接以 66 KiB 聚合”需要改代码并接受额外假设 | 由 L32、L33、[3] framing 说明推出 | inferred |
| L35 | Aerie 是 research release，两个参数集都未通过生产验收，不声称零知识，不声称兼容最终 FIPS 206 | [3] README Status | observed |
| L36 | 两个 Aerie 聚合物不能合并；递归 verifier 会重新引入公开盐方案所避开的启发式步骤 | [2] §7 “Merging Aggregates” | observed |
| L37 | a16z 称正在扩展 ML-DSA、去盐、格 + EC 混合签名，“可能达不到 5 万/秒” | [1] 博客 “Why Falcon” 节 | observed |
| L38 | LayerZero 称 ML-DSA 聚合“已在 Aerie 内高性能运行，细节待公布”，目前无代码或数字支撑 | [5] LayerZero 博客 | observed |
| L39 | Aerie 论文披露：实现、基准，以及安全证明和投影定理的推导大量使用了 AI 模型 | [2] “AI Assistance” 节 | observed |
| L40 | a16z 论点 (b)：递归每一步都要证明关于 FS 哈希本身的命题，因此“连在 ROM 里都无法建立安全性” | [1] “A simpler design space” 节 \| [2] §1.2 | observed |
| L41 | 由 L28、L40 推出：递归缺口是证明模型层面的批评，不是对 leanVM 的具体攻击；leanVM 自己声明 128-bit ROM | 由 L28、L40 推出 | inferred |
| L42 | a16z 论点 (c)：Ethereum 的共识和账户签名是 NIST 之外的定制方案，底层哈希未定，限制硬件钱包、HSM 和托管支持 | [27] 推文配图 \| [1] | observed |
| L43 | leanVM 哈希 BLAKE2s 是占位，XMSS / SPHINCS 参数“不是最终参数集” | [16] README | observed |
| L44 | 由 L12、L35、L42 推出：“非标准”批评对 Falcon + Aerie 同样部分适用，因为 FN-DSA 无草案、Aerie 未达生产 | 由 L12、L35、L42 推出 | inferred |
| L45 | a16z 论点 (d)：公钥加密不能由哈希黑盒构造（Impagliazzo–Rudich），隐私链终将依赖格（ML-KEM） | [1] “privacy case” 节 | observed |
| L46 | Vitalik 2026-10-07 承认 PKE 不能只靠哈希，建议加密 note 放链下；称 lean Ethereum “no lattices… no lattice-based commitments inside ZK proofs” | [30] Vitalik 推文 | observed |
| L47 | Thaler 称格去掉了递归和定制哈希签名，这一具体收益应与“更推测性的”格攻击风险相权衡 | [29] Thaler 推文 9/ | observed |
| L48 | Algorand 原生 Falcon-1024 PQ 账户属于 v42 共识升级，随 algod v5.0.0 发布（GitHub release 2026-08-12） | [17] 开发者文档 \| [18] release API | observed |
| L49 | Algorand 用确定性 Falcon 变体，与 FN-DSA 草案不同；Falcon-512（f5）已定义未启用；PQ 签名最低费用 3,000 µAlgo | [17] 开发者文档 | observed |
| L50 | Algorand 原生 PQ 账户不改变共识参与密钥，也不支持 PQ 原生 multisig | [17] Limitations 节 | observed |
| L51 | Algorand 的 State Proofs 用 Falcon-1024（每 256 轮），AVM v12 有 `falcon_verify`；官方理由是紧凑、验证快、确定性算术、与 State Proofs 的延续性 | [19] 技术简报 | observed |
| L52 | v42 在 Algorand 主网激活的具体日期，本路未找到一手来源（前序报告写“2026-08 主网激活”待核） | [18] release 仅写“包含协议升级” | speculative |
| L53 | Solana 的 Anza 与 Firedancer 各自做了 Falcon 原型，但官方定位是“继续评估 Falcon 及其替代方案” | [20] Solana quantum readiness | observed |
| L54 | Solana Alpenglow 于 epoch 1064（2026-10-21 约 13:20 UTC）主网激活，投票聚合为证书（BLS pubkey） | [21] Alpenglow 页面 | observed |
| L55 | Eli 2026-10-18：格结构丰富、易受 AI 攻击，module-SIS 版 succinct 方案太新（2012），建议再等 3–5 年 | [28] Eli 推文 | observed |
| L56 | 由 L1、L2、L18 推出：Eli 的“module-SIS”批评主要打在 Aerie 的承诺层（以及 ML-DSA）；Falcon 签名基于 NTRU | 由 L1、L2、L18 推出 | inferred |
| L57 | Claude Mythos 改进了 HAWK 密钥恢复（有效密钥减半，仍是指数时间）；HAWK 基于 LIP，Anthropic 称不影响一般格密码 | [22] Anthropic 博文 | observed |
| L58 | HAWK 团队于 2026-07-29 撤回算法 | [23] NIST 新闻脚注 | observed |
| L59 | 本路没有找到 2026 年针对 SIS / LWE / NTRU / Falcon / ML-DSA 本体的公开 AI 攻击 | 检索 [22][25][26] 等后未发现 | speculative |
| L60 | 截至 2026-10-20，没有找到 EF / leanVM 团队对 Aerie 基准或递归安全批评的正式回应；a16z 的“完整论证”尚未发布 | 检索 ethresear.ch / X / a16z 后未发现；[31][32] 不是对 Aerie 的技术回应 | speculative |

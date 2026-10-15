# notes-primer：PQ 密码学入门与 PQ 证明系统（lane = primer，前缀 P）

> 调研日期 2026-10-16（UTC+8）。只读网页、标准、论文与源码 README，没有运行任何代码。本文件对应任务说明里的 `research/notes-primer.md`。按运行指令，产出写到了指定的 task-2.md 路径。

**一句话总结**：截至 2026-10-16，NIST 已定稿的 PQ 标准有三份：FIPS 203 ML-KEM、FIPS 204 ML-DSA、FIPS 205 SLH-DSA（都在 2024-08-13 发布）。FIPS 206（FN-DSA / Falcon）仍是 “in development / FIPS coming soon”，连初始公开草案（IPD）都没有在 CSRC 上发布。HQC 于 2025-03-11 被选为备用 KEM，同样是 “FIPS coming soon”。附加签名征集（onramp）第 3 轮在 2026-05-14 公布了 9 个候选；HAWK 因 Anthropic 用 AI 辅助发现的攻击，于 2026-07-29 由提交团队撤回，现剩 8 个。PQ 签名的尺寸是 ECDSA 的几十到上百倍，在 EVM 上纯合约验签目前约 0.65M–8M gas。有两份 Draft EIP 提议用预编译把成本压到 3,000–4,500 gas。PQ 证明系统和 PQ 签名是两件事：哈希型 STARK 的“抗量子”只是 plausible，有 QROM 理论支撑；生产中的 zkVM（SP1、RISC Zero）上链前会包一层 BN254 Groth16 / PLONK，这一层不抗量子。

- **P-Q1**：三份 FIPS 已定稿；FIPS 206 仍在制定中，没有 IPD；HQC 已选定但还没有草案；onramp 第 3 轮剩 8 个候选（HAWK 已撤回）；SP 800-208（XMSS / LMS，2020-10）是有状态哈希签名的现行规范。
- **P-Q2**：格（ML-KEM / ML-DSA / Falcon）是主力；哈希（SLH-DSA、XMSS / LMS / leanSig）假设最保守，但尺寸大，或者需要管理状态；同源（SQIsign、MIKE）最紧凑，但最年轻、参数仍在被攻击后调整；多变量和编码类处于候选或备用位置。
- **P-Q3**：ECDSA 签名 65 B、公钥 64 B；ML-DSA-44 是 1312 / 2420 B；Falcon-512 是 897 / 666 B；SLH-DSA-128s 是 32 / 7856 B；SQIsign-I 是 83 / 200 B。EVM 验签：ecrecover 3,000 gas；Falcon 合约实现 0.65M–3.9M；ML-DSA-44 合约实现 1.23M–8.1M。尺寸表不等于同等安全下的性能排名。
- **P-Q4**：混合签名要用 AND。IETF 复合签名草案 -19 写明 “strict AND mode”。TLS 层的混合 KEM X25519MLKEM768 已是主流浏览器默认：Cloudflare 2026-09-29 称约 70% 的浏览器流量走 PQ。
- **P-Q5**：哈希型证明 plausibly PQ，安全性落在“哈希 + ROM / QROM + 参数”上。快的 PQ 证明约 300 KB，上链验证要数百万 gas。格型 SNARK（Lattice Jolt / Akita，2026-09-09）证明 < 100 KB，但还没有 ZK。SP1 / RISC Zero 链上验证的是 BN254 SNARK，所以最终验证不抗量子。

---

## P-Q1 标准现状

### 答案
FIPS 203 / 204 / 205 于 2024-08-13 发布，是现行标准 [1][3]。FN-DSA（Falcon）将以 FIPS 206 发布，但截至 2026-10-16，NIST 两个页面（都更新于 2026-08-05）仍分别写 “FIPS 206 (in development)” 和 “FIPS coming soon”。CSRC 的 FIPS 列表里没有 206，`/pubs/fips/206/ipd` 返回 404 [1][2][3]。HQC 于 2025-03-11 被选为 ML-KEM 的备用 KEM，同样是 “FIPS coming soon” [1][2]。onramp 第 3 轮 9 个候选于 2026-05-14 公布；HAWK 于 2026-07-29 被撤回 [7][8][10]。

### 依据
- **三份 FIPS**：“FIPS 203, FIPS 204, and FIPS 205 … were published August 13, 2024. FALCON was also selected and will be published in FIPS 206 (in development).” 页面 “Updated August 05, 2026” [1]。CSRC FIPS 列表中 203 / 204 / 205 都是 Final 8/13/2024，没有 206 [3]。
- **Selected Algorithms 页**：FALCON (2022) 写 “FIPS coming soon”，HQC (2025) 写 “FIPS coming soon.”，页面同样更新于 2026-08-05 [2]。
- **FIPS 206 的预期内容**：NIST 2025 年的演讲稿写着 “We expect to release an Initial Public Draft soon … basically written, awaiting approval”。预告的变化有：只允许随机化签名、使用 SHAKE、加入 BUFF 变换、在 L2 范数之外再限制无穷范数 [46]。IETF LAMPS 草案（2026-05-20）称 FIPS 206 为 “forthcoming”，并写明 “FN-DSA and Falcon are not compatible” [47]。
- **HQC**：“HQC was selected for standardization on March 11, 2025”（见 NIST IR 8545）[1]。NIST 2025 年的演讲稿提到 “FIPS 207 – in 2026”[48]，但本次没有找到已发布的 HQC 草案（见“不确定之处”）。
- **onramp（附加签名）**：2022-09 发起，40 个一轮候选，14 个二轮候选，二轮持续到 2026-05。NIST 特别希望征集“不基于结构化格”且“签名短、验证快”的方案 [7]。NIST IR 8610（2026-05）选出 9 个第 3 轮候选：FAEST、HAWK、MAYO、MQOM、QR-UOV、SDitH、SNOVA、SQIsign、UOV [9]。第 3 轮页面（更新于 2026-10-13）把 HAWK 标为 “withdrawn”，并按类别列出：同源 SQIsign；格 HAWK（已撤回）；MPC-in-the-Head 的 MQOM、SDitH；多变量 MAYO、QR-UOV、SNOVA、UOV；对称原语 FAEST [8]。
- **HAWK 撤回过程**：Anthropic 在 pqc-forum 公布攻击（帖子时间 2026-07-29）。在 AGPS'20 门计数模型下，HAWK-512 的密钥恢复成本从 2^150 降到 2^108，HAWK-1024 从 2^288 降到 2^182；HAWK-256 的私钥能在单台服务器上几小时内恢复 [10]。HAWK 团队（Léo Ducas）同日回帖：“we withdraw our candidate HAWK”。NIST（Dustin Moody）随后更新了第 3 轮页面 [10]。Anthropic 博客称攻击 “specific to HAWK and does not impact other NIST post-quantum signature candidates or lattice-based cryptography in general”，“no production software will have to change” [11]。
- **SQIsign 也在被攻击后调整参数**：SQIsign v3.0 规范（2026-09-01）§1.4 说明，针对 [Wes26] 的攻击提高了参数尺寸 [16]。MIKE 作者在 pqc-forum 提到同一攻击（eprint 2026/1486）让他们重新评估了参数 [10]。
- **SP 800-208（2020-10）**：规定 LMS / HSS 与 XMSS / XMSS^MT 两类有状态哈希签名 [12]。
- **SP 800-230 ipd（2026-04-13，意见征集已于 06-12 截止）**：为 SLH-DSA 增加 6 个参数集，限制每把密钥最多签 2^24 次，以换取更小的签名和更快的验证，“not approved for general-purpose use” [13]。

### 不确定之处
- FIPS 206 IPD 是否已在 CSRC 以外的渠道（例如 Federal Register）发布：本次只核对了 CSRC 页面（更新于 08-05）和 IPD 的 URL（404）。08-05 到 10-16 之间如有发布，CSRC 列表应当会出现，但列表页可能只显示 Final 版本，无法完全排除。
- HQC 草案（FIPS 207）是否已发布：只看到 NIST 2025 年演讲稿里的计划（来自搜索摘要，没有打开 PDF 原文）和第三方 Go 库 “pre-FIPS” 的说法，没有找到 NIST 发布页。

---

## P-Q2 方案分类与白话解释

### 答案
PQ 签名和 KEM 按“靠什么数学难题”分成五大类：格、哈希、同源、多变量、编码。NIST 已标准化的主力是格（ML-KEM / ML-DSA / 即将发布的 FN-DSA）。哈希型（SLH-DSA 无状态；XMSS / LMS / leanSig 有状态）作为假设最保守的备份。同源（SQIsign、MIKE）尺寸最小，但最年轻：2022 年 SIKE 被完全攻破，2026 年 SQIsign 刚因新攻击调大参数。多变量（UOV、MAYO 等）与 MPC-in-the-Head / 编码类（SDitH、FAEST、HQC）是多样化备份。

### 依据
- NIST 自述：已选的签名里，除 SPHINCS+ 外都基于结构化格。NIST 因此专门征集非结构化格的附加签名，以实现多样化 [7]。
- 格：ML-KEM 与 ML-DSA 基于 module lattice（FIPS 203 / 204 的标题 “Module-Lattice-Based …”）[3]。Falcon / FN-DSA 基于 NTRU 格，采用 hash-then-sign。它需要浮点运算，实现与侧信道防护更难 [46]。Akita 基于 Module-SIS [33]。Aztec 博客认为：“the fundamental short-integer-solution hardness assumption has had decades of cryptanalysis”，格密码声誉受损，来自一些协议叠加的额外弱假设 [32]。
- 哈希：SLH-DSA 无状态 [5]。XMSS 有状态：“If a secret key state is used twice, no cryptographic security guarantees remain”，并且 “MUST NOT output the signature before the private key is updated” [14]。Ethereum 的 leanSig 是 XMSS 变体，用于替代 BLS 的多签和聚合，安全证明不依赖随机预言（standard model）[18]。
- 同源：SQIsign 公钥 83 B、签名 200 B（NIST-I，v3.0）[16]。MIKE（eprint 2026/2377）是同源型非交互密钥交换：80 B 公钥，在 3.3 GHz AMD 上含公钥验证的共享密钥计算 4.9 ms，NIST level 1 [17]。Anthropic 博客回顾说 SIKE 曾 “completely broken in an hour on a laptop” [11]。
- 多变量与 MPCitH：UOV、MAYO、QR-UOV、SNOVA、MQOM、SDitH、FAEST 都在第 3 轮 [8]。
- 编码：HQC 是基于 Hamming Quasi-Cyclic 码的 KEM，已被选为备用 [1][2]。

### 不确定之处
- 各类假设“成熟度”的排序没有官方量化指标。上述排序综合了 NIST 的多样化表述 [7]、攻击史 [10][11][16] 和 Aztec 的观点 [32]，属于推论。
- MIKE 的新假设（rank-2 Hermitian module action 上的 CDH）的成熟度没有官方评估。pqc-forum 上有人质疑它的性能 [10]。

---

## P-Q3 尺寸与成本

### 答案
见下表。尺寸来自标准原文或规范。gas 数据来自 Draft EIP 的定价和开源实现的 README，都是“研究 / 草案”级，没有经过审计。各参数集的 NIST 安全类别不同（ML-DSA-44 是类别 2，Falcon-512、SLH-DSA-128s、SQIsign-I 是类别 1 / Level I），所以**这是尺寸表，不是同等安全下的性能排名**。

### 依据：尺寸表（字节）

| 方案 / 参数集 | NIST 类别 | 公钥 | 签名（或密文） | 来源 |
|---|---|--:|--:|---|
| ECDSA secp256k1（Ethereum） | 非 PQ | 64（去掉 0x04 前缀的未压缩公钥；压缩形式 33） | 65（r‖s 64 + recovery id 1） | [19]；33 为推论 |
| ML-DSA-44 | 2 | 1,312 | 2,420 | FIPS 204 Table 2 [4] |
| ML-DSA-65 | 3 | 1,952 | 3,309 | [4] |
| ML-DSA-87 | 5 | 2,592 | 4,627 | [4] |
| Falcon-512（round-3 规范 v1.2，padded） | I | 897（含 1 B 头） | 666（固定，padded） | Falcon spec Table 3.3 [15] |
| Falcon-1024 | V | 1,793 | 1,280 | [15] |
| SLH-DSA-SHA2-128s | 1 | 32 | 7,856 | FIPS 205 Table 2 [5] |
| SLH-DSA-SHA2-128f | 1 | 32 | 17,088 | [5] |
| SLH-DSA-SHA2-256s | 5 | 64 | 29,792 | [5] |
| XMSS-SHA2_10_256（2^10 次签名） | — | 68（含 4 B OID） | 2,500 | RFC 8391 §4.1.7 / 4.1.8、Table 3 [14] |
| XMSS-SHA2_20_256（2^20 次签名） | — | 68 | 2,820 | [14] |
| SQIsign NIST-I（v3.0，2026-09） | I | 83 | 200 | SQIsign spec Table 1 / 12 [16] |
| SQIsign NIST-V | V | 169 | 406 | [16] |
| ML-KEM-768（KEM，对照） | 3 | 1,184（封装密钥） | 1,088（密文） | FIPS 203 Table 3 [6] |

补充：FIPS 204 允许 ML-DSA-44 的类别降为 1，条件是密钥生成所用 RBG 只有 128 bit 强度 [4]。EIP-8052 里的 Falcon-512 公钥写成 896 B，因为去掉了 1 B 头 [22]。

### 依据：EVM 验签成本（gas）

| 方案 | 实现 / 提案 | gas | 状态 / 条件 | 来源 |
|---|---|--:|---|---|
| ECDSA secp256k1 | ecrecover 预编译 0x01 | 3,000 | 主网 | [20] |
| P-256 | P256VERIFY 0x100 | 6,900 | geth 参数（EIP-7951） | [20] |
| Falcon-512（NIST） | ZKNOX `ZKNOX_falcon`（main） | ≈3.9M（3,910,833） | 实验性、未审计 | [24] |
| Falcon-512（EVM 友好，Keccak） | ZKNOX `ethfalcon` | ≈1.5M | 同上，偏离 NIST 规范 | [24] |
| Falcon-512（NIST） | ZKNOX `falcon8`（实验分支） | 650,345 | 需要一次性部署 Keccak-f helper（约 4.3M gas） | [24] |
| Falcon-512 | EIP-7885 NTT 预编译（OP Stack 测试网） | 479,341 | Draft EIP | [23] |
| Falcon-512 | EIP-8052 三个预编译 | 3,000（1,000 H2P + 2,000 core） | Draft，地址待 ACD 定 | [22] |
| ML-DSA-44（NIST） | ZKNOX ETHDILITHIUM（main） | ≈8.1M | 实验性、未审计 | [25] |
| ML-DSA-44（ETH 变体） | ZKNOX ETHDILITHIUM | ≈4.9M | 同上 | [25] |
| ML-DSA-44（NIST） | ZKNOX packed 分支 | 1,196,707 | 实验分支 | [25] |
| ML-DSA-44（NIST） | Fireblocks evm-ml-dsa-verifier | 1,226,311（另需约 4.11M 部署 20,545 B 的预处理公钥） | 研究代码、未审计 | [26] |
| ML-DSA-44 | EIP-8051 预编译 | 4,500 | Draft；输入是 20,512 B 的展开公钥 | [21] |
| 哈希型签名（泛指） | EIP-8288 动机段 | 约 150k–200k，签名约 2–3 kB | Draft 作者的估计 | [27] |

### 不确定之处
- ZKNOX 与 Fireblocks 的 README 在 main 分支，本次没能固定 commit（只记录访问日期）。各实现的编译器设置不同；Fireblocks README 说明 ZKNOX kernel 在 legacy codegen 下会高 7–9% [26]。
- EIP-8051 / 8052 的 gas 是按 “keccak 调用次数线性外推” 或 SUPERCOP 经验估算的定价，不是实测 [21][22]。EIP-7885 文中自相矛盾：称 Falcon 可降到 1,500 gas，实测表却是 479,341；纯 Solidity 基线一处写 3.6M、一处写 1.8M [23]。
- 链上 Falcon 实现大多基于 round-3 Falcon。FN-DSA 定稿后与 Falcon 不兼容 [47]，现有合约与 EIP-8052 可能要改（推论）。

---

## P-Q4 混合（hybrid）签名的组合逻辑与 Web2 先例

### 答案
“混合”指同时用一个传统算法和一个 PQ 算法。它要提供“攻击者必须同时攻破两者”的保证，验证规则就必须是 **AND**：每个组件签名都有效才接受。IETF LAMPS 的复合签名草案（-19，2026-04-21，Internet-Draft，还不是 RFC）明确采用 “strict AND mode”，并把 OR 型归为只提供“迁移灵活性”的另一种用途。Web2 已经在密钥交换层大规模部署混合 KEM X25519MLKEM768：Chrome 131+、Edge 131+、Firefox 132+ 支持；Cloudflare 在 2026-09-29 称约 70% 的浏览器流量已受 PQ 保护，但只有约 15% 的源站支持。

### 依据
- 草案 §3.3：“MUST output ‘Valid signature’ (true) if and only if all component signatures were successfully validated”。§9.1：“The composites presented in this specification do not provide this since they operate in a strict ‘AND’ mode”。同节区分 “Dual-algorithm security” 与 OR 型的 “Migration flexibility” [28]。PQ/T Hybrid 的定义引自 RFC 9794 [28]。草案还用 label / domain separation 防止组件签名被剥离出来单独使用（weak non-separability）[28]。
- TLS：X25519MLKEM768 同时执行 X25519 ECDHE 与 ML-KEM，再合并两个共享秘密 [29]。“about 70% of browser-generated traffic … protected with post-quantum encryption using hybrid ML-KEM … just about 15% of origins”（2026-09-29）[29]。Radar 页写 “Chrome 131+, Edge 131+, and Firefox 132+ support post-quantum key agreements” [30]。Cloudflare 2025 年博客称 2025-10 最后一周，过半人类流量已经走 PQ 加密 [31]。

### 不确定之处
- 70% 的口径是 “browser-generated traffic”，不是全部 HTTPS 流量 [29]。Radar 实时数值本次抓取被 403 拦截。
- KEM 的“合并秘密”与签名的 AND 在形式上不同：前者是两个秘密都被攻破才泄露，后者是两个签名都要验过。把它们并列为“同一思想”属于推论。

---

## P-Q5 PQ 证明系统与 PQ 签名的区别

### 答案
PQ 签名保护“谁授权了”，PQ 证明系统保护“计算对不对”。两者可以独立选型，也可能独立失效。哈希型证明（FRI / STARK、Circle STARK、WHIR、Binius、Flock）只依赖哈希与随机预言模型，因此 “plausibly PQ”：已有 QROM 下的理论结果，但实际安全位数取决于参数，量子口径通常更低（leanVM 是 128-bit ROM / 64-bit QROM）。代价是证明较大（快的方案约 300 KB），在 EVM 上直接验证要数百万 gas。格型 SNARK（LaBRADOR、Greyhound、Lattice Jolt / Akita）证明更小（< 100 KB），但更年轻，Lattice Jolt 还没有 ZK。今天的生产 zkVM 内部是 STARK，但上链前包成 BN254 Groth16 / PLONK，链上验证器靠的是配对和可信设置，Shor 可破。SP1 Hypercube 的内部 STARK 还用到一条扩域椭圆曲线做内存论证。

### 依据
- **理论**：Chiesa–Manohar–Spooner 指出，ROM 下的 SNARG 被“widely believed to be post-quantum secure … No formal evidence, however, supports this belief”，并首次证明 Micali 构造以及具备 round-by-round soundness 的 IOP 型 SNARG 在 QROM 下安全 [39]。
- **leanVM**（Ethereum 的 PQ 签名聚合 zkVM）：“128-bit ROM (64-bit QROM) soundness … no proximity gap conjecture”，形式化验证仍在进行，“not (yet) production ready”，ZK 尚在计划中。它用 192-bit 二进制域、WHIR PCS 和 Flock 哈希证明，BLAKE2s 只是占位。在 M4 Max 上聚合 900 个 XMSS 签名：证明 317.4 KiB，验证 3.977 ms。这套 XMSS 参数 “not the definitive parameter set” [38]。
- **Aztec**：“Post-quantum proof systems (the fast ones) … have proofs of ~300KB”，而 Aztec 现在的证明约 20 KB [32]。
- **EIP-8288（Draft，2026-06-03，Buterin 与 Coratger）**：“STARKs all take over 128 kB, or as much as 512 kB if fast generation is a goal … a STARK will take many millions of gas to verify”。因此提议把验证放到 mempool / builder 链下聚合，对应的 gas 常量是 LEANSTARK 30,000、LEANSPHINCS 3,000 [27]。
- **Flock**（eprint 2026/1329，Bünz、Rothblum、Wang）：哈希型 SNARK，面向批量布尔电路。单核 M4 Max 每秒可证明 82k 次 BLAKE3 压缩，十核超过 660k。SHA-256 上比 Binius64 快 9 倍以上。实现是 “proof-of-concept … co-designed by coding agents” [34]。
- **Lattice Jolt / Akita**（a16z crypto，2026-09-09，作者 Georghiades、Thaler、Tretyakov、Zhu）：用 Module-SIS 的 Akita 替换椭圆曲线承诺 Dory，目标 128-bit 安全，证明 “under 100 KB today”。CPU 上每秒超过 200 万 RV64IMAC cycle，Metal GPU 上超过 1000 万。ZK 由 “companion paper, coming shortly” 补上。文章没有给出 EVM 验证成本 [33]。
- **其他格型构造**：LaBRADOR 对 2^20 约束的 R1CS 证明为 58 KB [43]；Greyhound 是格多项式承诺，N=2^30 时评估证明 53 KB [44]。
- **其他哈希型构造**：WHIR 可替代 FRI，验证只需几百微秒 [40]；还有 Circle STARKs [41] 与 Binius（二进制塔域）[42]。
- **SP1 的包装**：“SP1 utilizes Gnark's implementation of Groth16 or PLONK over the BN254 curve to compress a STARK proof into a SNARK proof, which is then used for on-chain verification”，并依赖可信设置（PLONK 用 Aztec Ignition，Groth16 用 Succinct 自办的仪式）[36]。Groth16 约 260 B、约 270k gas；PLONK 约 868 B、约 300k gas [35]。SP1 Hypercube 用 KoalaBear 上的 Poseidon2，但内存论证 “assumes that the discrete logarithm problem on the elliptic curve over the degree-7 extension of KoalaBear is computationally hard” [36]。
- **RISC Zero**：安全表把 RISC-V Prover 与 Recursion Prover 标为 “Quantum Safe? Yes”（96 / 99 bits），把 STARK-to-SNARK Prover 标为 “No”。原文：“uses a Groth16 prover over the BN254 pairing-friendly curve … vulnerable to attacks from quantum computers” [37]。
- **BN254 配对预编译**：45,000 + 34,000·k gas [20]。

### 不确定之处
- 哈希型证明“抗量子”的程度没有统一口径。RISC Zero 给的 96 / 99 bits 和 leanVM 的 64-bit QROM 口径不同，不能直接比较 [37][38]。
- “在 EVM 上直接验证一个约 300 KB 的 STARK 要多少 gas”，本次只找到 EIP-8288 的定性说法（many millions）和下面的 calldata 推算，没有可复现的单一实测数据点。
- SP1 内存论证中的扩域椭圆曲线在量子攻击下会怎样（是否让内部 STARK 也失去 PQ 性），官方没有说明，下文标为推论。

---

## 图与白话素材

### A. 概念一句话白话
- **PQC（后量子密码）**：在普通电脑上运行、设计目标是连量子计算机也破不了的密码算法，不需要量子硬件 [7]。
- **KEM（密钥封装）**：双方在公开网络上“递一个只有对方能拆的信封”，拿到共享密钥。它不能拿来签交易 [6]。
- **格（lattice）**：在高维网格里找“最短 / 最近的点”非常难。ML-KEM、ML-DSA、Falcon 都靠这个 [3][46]。
- **哈希签名**：只靠哈希函数“不可逆”。假设最朴素，代价是签名大（SLH-DSA）或需要记账（XMSS）[5][14]。
- **有状态签名（XMSS / LMS）**：一把钥匙预先切成很多张“一次性邮票”，每张只能用一次。记账出错、同一张用两次，就能被伪造 [14]。
- **同源（isogeny）**：利用椭圆曲线之间的“映射”难以反推。尺寸极小，但这个家族 2022 年出过 SIKE 被笔记本一小时攻破的事故 [11][16]。
- **混合签名 AND**：新旧两把锁都要打开才放行；OR 等于只看较弱的那把锁 [28]。
- **STARK / 哈希型证明**：用哈希给计算过程“盖指纹、随机抽查”，不依赖椭圆曲线，所以 plausibly 抗量子；代价是证明大 [38][39]。
- **ROM / QROM**：把哈希当作“完美随机黑盒”来分析安全性；QROM 是量子对手可以“叠加态查询”这个黑盒时的版本，通常安全位数更低 [38][39]。
- **wrap（包装）**：先用 STARK 证明，再用一个小的 Groth16 / PLONK 证明“我验过那个 STARK”，让链上更便宜。链上最终只看外层，外层是椭圆曲线配对，量子可破 [36][37]。

### B. 方案分类图（类别 → 代表 → 标准状态 → 尺寸量级）
- 格：ML-KEM（FIPS 203 Final）[1]；ML-DSA（FIPS 204 Final，签名 2.4–4.6 KB）[4]；FN-DSA / Falcon（FIPS 206 制定中，签名 0.7–1.3 KB）[1][15]；HAWK（已撤回）[8]
- 哈希：SLH-DSA（FIPS 205 Final，签名 7.9–49.9 KB）[5]；XMSS / LMS（SP 800-208，签名约 2.5–2.8 KB，有状态）[12][14]；leanSig（XMSS 变体，研究）[18]；SP 800-230 受限次数参数集（ipd）[13]
- 同源：SQIsign（第 3 轮，签名 200–406 B）[16]；MIKE（NIKE 论文，公钥 80 B）[17]
- 多变量：UOV、MAYO、QR-UOV、SNOVA（第 3 轮）[8]
- 编码 / MPCitH / 对称：HQC（KEM，已选，FIPS 待发）[2]；SDitH、MQOM、FAEST（第 3 轮）[8]

### C. 时间线
- 2020-10：SP 800-208（XMSS / LMS）[12]
- 2022-09：NIST 发起附加签名征集 [7]
- 2024-08-13：FIPS 203 / 204 / 205 发布 [1]
- 2025-03-11：HQC 被选为备用 KEM [1]
- 2025-10 最后一周：Cloudflare 过半人类流量走 PQ（来自搜索摘要）[31]
- 2026-04-13：SP 800-230 ipd [13]
- 2026-04-21：IETF 复合签名草案 -19 [28]
- 2026-05：NIST IR 8610；2026-05-14 公布第 3 轮 9 个候选 [7][9]
- 2026-06-03：EIP-8288 Draft 创建 [27]
- 2026-07-29：Anthropic 在 pqc-forum 公布 HAWK 攻击；同日 HAWK 团队撤回 [10]
- 2026-08-05：NIST 页面仍为 FIPS 206 “in development” [1]
- 2026-09-01：SQIsign v3.0 规范（调大参数）[16]
- 2026-09-09：Lattice Jolt / Akita 发布 [33]
- 2026-09-29：Cloudflare 公布约 70% 浏览器流量走 PQ [29]
- 2026-10-15：Aztec PQ 博客 [32]

### D. 证明管线对比（参与者与流程）
- SP1：RISC-V 执行 → STARK（Poseidon2 / KoalaBear + FRI；内存论证用扩域 EC）→ 递归压缩 → Gnark Groth16 / PLONK（BN254）→ 链上验证器（约 270k / 300k gas）[35][36]
- RISC Zero：RISC-V Prover（STARK，量子安全 “Yes”）→ Recursion Prover（“Yes”）→ STARK-to-SNARK（Groth16 / BN254，“No”）→ 链上验证器 [37]
- leanVM（Ethereum 研究）：多个 XMSS 签名 → 二进制域 WHIR / Flock 证明（约 300 KiB，验证约 4 ms）→ 由聚合者传播（EIP-8292 / 8288，Draft）[27][38]
- 对比维度：内部证明的假设、最终上链证明的假设、证明大小、链上 gas、是否需要可信设置、是否有 ZK、生产状态

### E. 混合签名逻辑图
- AND：`accept = Verify_classical(m, σ1) ∧ Verify_PQ(m, σ2)`，两个签名绑定同一条消息（加 label 防剥离）[28]
- OR：`accept = V1 ∨ V2`，经典算法一旦被攻破就失效，只适合迁移期的兼容需要 [28]

---

## 外部调研 / 用户资料中被修正或无法核实的地方

1. **GPT §5.3 的尺寸表**：ML-DSA-44 1,312 / 2,420、Falcon-512 897 / 666、SLH-DSA-SHA2-128s 32 / 7,856，三组数字都与标准原文一致 [4][15][5]。需要补正两点。
   - 应引 FIPS 204 / 205 与 Falcon 规范原文，而不是 Open Quantum Safe 页面。
   - 666 B 是 Falcon round-3 规范的**固定 padded 长度**，并非“常见编码”之一；FN-DSA 定稿后编码可能变化，且与 Falcon 不兼容 [15][47]。
   - 另外，三者的 NIST 类别不同（ML-DSA-44 是类别 2，另两者是类别 1）[4][5]。GPT 的免责声明（不是同等安全排名）是对的。
2. **GPT 说“NIST 页面仍将 Falcon 的 FIPS 标为 coming soon”**：截至 2026-10-16 仍然成立。Selected Algorithms 页写 “FIPS coming soon”，标准化主页写 “FIPS 206 (in development)”，两页都更新于 2026-08-05 [1][2]。补充：HQC 同样是 “coming soon” [2]；GPT 没有提 HQC 与 onramp 的现状。
3. **GPT §4 说 HAWK 是“候选签名方案”**：已过时。HAWK 已于 2026-07-29 由提交团队撤回，NIST 页面标为 withdrawn [8][10]。Aztec 博客说攻击 “reduced its security enough to end its candidacy” [32]，与事实一致。
4. **GPT §6.4 说 Jolt / Akita “2026 年 9 月”**：日期正确（2026-09-09）[33]。需要补充：作者自己说明 ZK 待后续论文补上；文章没有 EVM 验证成本；“< 100 KB” 是作者自报，没有给出机器型号与基准程序 [33]。媒体报道里的 “65–80 KB” 没有在原文中找到，不要用。
5. **Aztec 博客对 Flock 的转述**：“660,000 BLAKE3 hashes per second on an M4 mac on ten cores”。论文摘要的口径是 **BLAKE3 压缩函数调用**（不是任意长度消息的完整哈希），机器是 M4 Max；单核是 82k/s [34]。另外，Flock 是批量布尔计算的证明器，作者也是 leanVM 所用的组件 [38]。
6. **Aztec 博客里 MIKE 的链接域名**：写成 `eprint.iacr.asia/2026/2377`，正确地址是 `eprint.iacr.org/2026/2377` [17]。疑似笔误，引用时要用 .org。另外，MIKE 作者在 pqc-forum（2026-09-10）给出的 level 1 密钥交换时间是 7.5 ms（AMD Ryzen 7 PRO 7840U），与摘要里的 4.9 ms 口径不同。参数因 Wesolowski 攻击做过调整 [10][17]。
7. **GPT §7.1 / D 说 “SP1 内部存在 STARK，不能消除外层椭圆曲线证明的量子依赖”**：方向正确 [36]。需要补充：SP1 Hypercube 的内部 STARK 本身也假设了一条扩域椭圆曲线上的 DLP 难度（用于内存论证）[36]，所以“内部是 STARK，所以内部是 PQ”在 SP1 上也不精确（推论）。另外，SP1 安全模型页完全没提量子安全；RISC Zero 的页面则明确标出了 Groth16 层 “Quantum Safe? No” [37]。
8. **GPT §5.3 的“每秒 1000 笔 × 2,420 B ≈ 2.42 MB/s”**：算术正确，属于假设场景，不是测量。
9. **媒体（KuCoin / CryptoBriefing）的说法“Fireblocks 把 ML-DSA-44 验签降到 1.23M gas”**：已用 Fireblocks 仓库 README 核实为 1,226,311 gas（基线 8,094,831）[26]。媒体漏掉了“每把公钥约 4.11M gas 的一次性部署”和“未审计”这两点。媒体说的“SPHINCS+ 衍生方案约 127,000 gas”没有找到一手来源，不使用。

---

## 来源

1. **PRIMARY** NIST CSRC “PQC Standardization Process”，https://csrc.nist.gov/projects/post-quantum-cryptography/post-quantum-cryptography-standardization（Updated August 05, 2026），访问 2026-10-16。证明：FIPS 203 / 204 / 205 于 2024-08-13 发布；FIPS 206 “in development”；HQC 于 2025-03-11 选定。
2. **PRIMARY** NIST CSRC “Selected Algorithms”，https://csrc.nist.gov/projects/post-quantum-cryptography/post-quantum-cryptography-standardization/selected-algorithms（Updated August 05, 2026），访问 2026-10-16。证明：FALCON 与 HQC 都是 “FIPS coming soon”。
3. **PRIMARY** NIST CSRC FIPS 列表，https://csrc.nist.gov/publications/fips；以及 https://csrc.nist.gov/pubs/fips/206/ipd（返回 404），访问 2026-10-16。证明：列表中没有 FIPS 206；203 / 204 / 205 为 Final。
4. **PRIMARY** FIPS 204，https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.204.pdf，§4 Table 1 / Table 2、§3.6.1，访问 2026-10-16。证明：ML-DSA 的尺寸与安全类别。
5. **PRIMARY** FIPS 205，https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.205.pdf，§11 Table 2，访问 2026-10-16。证明：SLH-DSA 的尺寸与类别。
6. **PRIMARY** FIPS 203，https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.203.pdf，Table 3，访问 2026-10-16。证明：ML-KEM 的尺寸；ML-KEM-768 是类别 3。
7. **PRIMARY** NIST “Additional Digital Signature Schemes” 项目页，https://csrc.nist.gov/projects/pqc-dig-sig，访问 2026-10-16。证明：onramp 的背景、40 → 14 → 第 3 轮（2026-05-14）；NIST 想征集非结构化格方案。
8. **PRIMARY** NIST Round 3 Additional Signatures，https://csrc.nist.gov/projects/pqc-dig-sig/round-3-additional-signatures（Updated October 13, 2026），访问 2026-10-16。证明：9 个候选的分类；HAWK 已撤回。
9. **PRIMARY** NIST IR 8610（2026-05），https://csrc.nist.gov/pubs/ir/8610/final，访问 2026-10-16。证明：第 3 轮的 9 个候选名单。
10. **PRIMARY** pqc-forum 讨论串 “HAWK”，https://groups.google.com/a/list.nist.gov/g/pqc-forum/c/2r2u6SbHun4/m/0_I2KOZ_CQAJ，访问 2026-10-16。证明：Anthropic 的攻击数字（2^150→2^108、2^288→2^182）；Ducas 2026-07-29 宣布撤回；Moody 的确认；MIKE 作者 2026-09-10 关于参数与时间的说明；Wesolowski 攻击 eprint 2026/1486。
11. **PRIMARY** Anthropic “Discovering cryptographic weaknesses with Claude”，https://www.anthropic.com/research/discovering-cryptographic-weaknesses（含 “Edit 29 July”），访问 2026-10-16。证明：HAWK 攻击使有效密钥长度减半，攻击只针对 HAWK；不影响生产系统；提到 SIKE 的历史。
12. **PRIMARY** NIST SP 800-208（2020-10），https://csrc.nist.gov/pubs/sp/800/208/final，访问 2026-10-16。证明：LMS / HSS、XMSS / XMSS^MT 是有状态哈希签名的现行建议。
13. **PRIMARY** NIST 新闻 “NIST Releases IPD SP 800-230”（2026-04-13），https://www.nist.gov/news-events/news/2026/04/nist-releases-initial-public-draft-ipd-sp-800-230-additional-slh-dsa，以及 https://csrc.nist.gov/pubs/sp/800/230/ipd（来自搜索结果摘录），访问 2026-10-16。证明：6 个受限次数（2^24）的 SLH-DSA 参数集，不用于通用场景。
14. **PRIMARY** RFC 8391（XMSS），https://datatracker.ietf.org/doc/html/rfc8391，§1.1、§4.1.7–4.1.12、Table 3，访问 2026-10-16。证明：XMSS 的尺寸；状态复用会导致伪造。
15. **PRIMARY** Falcon 规范 v1.2（2020-01-10），https://falcon-sign.info/falcon.pdf，Table 3.3、§3.11.3、§4.5；以及 https://falcon-sign.info/，访问 2026-10-16。证明：Falcon-512 / 1024 的公钥 897 / 1793、签名 666 / 1280（padded 固定长度）。
16. **PRIMARY** SQIsign 规范 v3.0（2026-09-01），https://csrc.nist.gov/csrc/media/Projects/pqc-dig-sig/documents/sqisign_specification.pdf，Table 1 / 11 / 12、§1.4，访问 2026-10-16。证明：SQIsign 的尺寸；因 [Wes26] 调大参数。
17. **PRIMARY** MIKE，eprint 2026/2377，https://eprint.iacr.org/2026/2377，访问 2026-10-16。证明：同源 NIKE，80 B 公钥，4.9 ms，NIST level 1。
18. **PRIMARY** Drake、Khovratovich、Kudinov、Wagner，“Hash-Based Multi-Signatures for Post-Quantum Ethereum”，eprint 2025/055，访问 2026-10-16。证明：leanSig 是 XMSS 变体，standard-model 分析，用 SNARK 聚合。
19. **PRIMARY** go-ethereum `crypto/crypto.go`（master，访问 2026-10-16，没有固定 commit），https://github.com/ethereum/go-ethereum/blob/master/crypto/crypto.go。证明：`SignatureLength = 64 + 1`；地址 = `Keccak256(pubBytes[1:])[12:]`。
20. **PRIMARY** go-ethereum `params/protocol_params.go`（master，访问 2026-10-16），https://github.com/ethereum/go-ethereum/blob/master/params/protocol_params.go。证明：EcrecoverGas 3000、P256VerifyGas 6900、BN254 配对 45000 + 34000k、calldata 16 gas/B、EIP-7623 floor 10 / token（4 token / 非零字节）。
21. **PRIMARY** EIP-8051（Draft，2025-10-15），https://eips.ethereum.org/EIPS/eip-8051，访问 2026-10-16。证明：ML-DSA 预编译 4,500 gas；展开公钥 20,512 B；有 ETH 变体。
22. **PRIMARY** EIP-8052（Draft，2025-10-17），https://eips.ethereum.org/EIPS/eip-8052，访问 2026-10-16。证明：Falcon 预编译共 3,000 gas；地址待定；SHAKE 与 Keccak-PRNG 两种。
23. **PRIMARY** EIP-7885（Draft，2025-02-12），https://eips.ethereum.org/EIPS/eip-7885，访问 2026-10-16。证明：NTT 预编译；OP Stack 测试网实测 ETHFALCON 479,341 gas；文中数字自相矛盾。
24. **PRIMARY** ZKNoxHQ/ETHFALCON README（main，访问 2026-10-16），https://github.com/ZKNoxHQ/ETHFALCON。证明：Falcon 合约验签 3.9M / 1.5M / 0.65M（实验分支）；未审计。
25. **PRIMARY** ZKNoxHQ/ETHDILITHIUM README（main，访问 2026-10-16），https://github.com/ZKNoxHQ/ETHDILITHIUM。证明：ML-DSA 合约验签 8.1M / 4.9M；packed 分支 1.20M；未审计。
26. **PRIMARY** fireblocks-labs/evm-ml-dsa-verifier README（访问 2026-10-16），https://github.com/fireblocks-labs/evm-ml-dsa-verifier。证明：ML-DSA-44 1,226,311 gas；公钥部署约 4.11M；未审计；测试了 FIPS 204 向量。
27. **PRIMARY** EIP-8288（Draft，2026-06-03），https://eips.ethereum.org/EIPS/eip-8288，访问 2026-10-16。证明：作者对哈希签名（2–3 kB、150k–200k gas）与 STARK（>128 kB、many millions gas）的估计；聚合方案及其 gas 常量。
28. **PRIMARY** draft-ietf-lamps-pq-composite-sigs-19（2026-04-21），https://datatracker.ietf.org/doc/draft-ietf-lamps-pq-composite-sigs/，访问 2026-10-16。证明：复合签名采用 strict AND；PQ/T hybrid 的定义；非可分离性。
29. **PRIMARY** Cloudflare 博客 “Is your domain using post-quantum encryption?”（2026-09-29），https://blog.cloudflare.com/post-quantum-visibility/，访问 2026-10-16。证明：约 70% 浏览器流量、约 15% 源站使用混合 ML-KEM；X25519MLKEM768 的机制。
30. **PRIMARY** Cloudflare Radar Post-Quantum 页，https://radar.cloudflare.com/post-quantum（通过搜索结果摘录，直接抓取被 403 拦截），访问 2026-10-16。证明：Chrome 131+、Edge 131+、Firefox 132+ 支持；Cloudflare 全站默认启用。
31. **PRIMARY**（只见搜索摘要）Cloudflare 博客 “State of the post-quantum Internet in 2025”，https://blog.cloudflare.com/pq-2025，访问 2026-10-16。证明：2025-10 最后一周，过半人类流量走 PQ。
32. **PRIMARY** Aztec “Post-Quantum Aztec”（2026-10-15），https://aztec.network/blog/post-quantum-aztec，访问 2026-10-16。证明：快的 PQ 证明约 300 KB；对 Flock、Akita、MIKE 的转述；SIS 的成熟度观点；HAWK 失去候选资格。
33. **PRIMARY** a16z crypto “Entering the era of lattice SNARKs – with a faster, post-quantum Jolt”（2026-09-09，Georghiades / Thaler / Tretyakov / Zhu），https://a16zcrypto.com/posts/article/lattice-snarks-jolt-post-quantum-faster/，访问 2026-10-16。证明：Akita 基于 Module-SIS；证明 < 100 KB；ZK 待做；速度数字。
34. **PRIMARY** Bünz、Rothblum、Wang，“Flock: Fast Proving for Batch Boolean Computations”，eprint 2026/1329（只读了摘要页，PDF 抓取被 403 拦截），访问 2026-10-16。证明：82k/s 单核、>660k/s 十核的 BLAKE3 压缩；PoC 实现。
35. **PRIMARY** Succinct SP1 docs “Proof Types”，https://docs.succinct.xyz/docs/sp1/generating-proofs/proof-types，访问 2026-10-16。证明：Groth16 约 260 B / 约 270k gas，PLONK 约 868 B / 约 300k gas。
36. **PRIMARY** Succinct SP1 docs “Security Model”，https://docs.succinct.xyz/docs/sp1/security/security-model，访问 2026-10-16。证明：STARK 经 Gnark Groth16 / PLONK（BN254）包装后上链；可信设置；Hypercube 的扩域 EC DLP 假设；页面没有提量子安全。
37. **PRIMARY** RISC Zero “Security Model”，https://dev.risczero.com/api/security-model，访问 2026-10-16。证明：STARK 层标 “Quantum Safe Yes”，Groth16 / BN254 层标 “No”；96 / 99 bits。
38. **PRIMARY** leanEthereum/leanVM README（访问 2026-10-16，没有固定 commit），https://github.com/leanEthereum/leanVM。证明：128-bit ROM / 64-bit QROM；未达生产就绪；ZK 在计划中；900 个 XMSS 签名聚合证明 317.4 KiB、验证 3.977 ms。
39. **PRIMARY** Chiesa、Manohar、Spooner，“Succinct Arguments in the Quantum Random Oracle Model”，eprint 2019/834，访问 2026-10-16。证明：ROM SNARG 的 PQ 安全性此前只是“widely believed”；IOP 型 SNARG 在 QROM 下可证安全。
40. **PRIMARY** WHIR，eprint 2024/1586，访问 2026-10-16。证明：可替代 FRI 的哈希型 IOPP，验证只需几百微秒。
41. **PRIMARY** Circle STARKs，eprint 2024/278，访问 2026-10-16。证明：Circle STARK 是哈希型 STARK 变体（只核对了标题与摘要页）。
42. **PRIMARY** “Succinct Arguments over Towers of Binary Fields”（Binius），eprint 2023/1784，访问 2026-10-16。证明：二进制塔域上的哈希型论证（只核对了标题与摘要页）。
43. **PRIMARY** LaBRADOR，eprint 2022/1341，访问 2026-10-16。证明：基于 Module-SIS，2^20 约束的证明 58 KB。
44. **PRIMARY** Greyhound，eprint 2024/1293，访问 2026-10-16。证明：格多项式承诺，N=2^30 时 53 KB。
45. **PRIMARY** ethereum.org “Accounts”，https://ethereum.org/developers/docs/accounts/，访问 2026-10-16。证明：地址是公钥 Keccak-256 的后 20 字节。
46. **PRIMARY** NIST R. Perlner，“FIPS 206 Status Update”（2025 演讲稿），https://csrc.nist.gov/csrc/media/presentations/2025/fips-206-fn-dsa-(falcon)/images-media/fips_206-perlner_2.1.pdf（经搜索结果摘录），访问 2026-10-16。证明：IPD “soon”；浮点实现的难点；计划中的改动。
47. **PRIMARY** draft-ietf-lamps-fn-dsa-certificates-00（2026-05-20），https://www.ietf.org/archive/id/draft-ietf-lamps-fn-dsa-certificates-00.html，访问 2026-10-16。证明：FIPS 206 仍是 “forthcoming”；“FN-DSA and Falcon are not compatible”。
48. **PRIMARY**（只见搜索摘要）NIST D. Moody，“NIST PQC: The Road Ahead”（2025），https://csrc.nist.gov/csrc/media/presentations/2025/nist-pqc-project/nist_pqc_the_road_ahead-moody_1.1.pdf，访问 2026-10-16。证明：NIST 计划 “FIPS 207 – in 2026”（HQC）。
49. 已有台账：见 starknet-account-model 台账 C39（Falcon-512 897 / 666）、C59（FIPS 206 “in development”，2026-10-14）。
50. ChatGPT Deep Research（research/from-aztec-pq-to-mantle-pq.md）。只当线索，不作证据。
51. 媒体：KuCoin / CryptoBriefing、Gate News（2026-09-04，Fireblocks 1.23M gas）。只当线索，已追到 [26]。

---

## 开放问题
1. FIPS 206 IPD 何时发布？定稿后 FN-DSA 的编码（公钥 / 签名长度、哈希方式）与 EIP-8052 的 Falcon round-3 接口差多少？
2. HQC 的 FIPS 207 草案是否已发布、何时发布？
3. onramp 第 3 轮的时间表（NIST IR 8610 正文），以及 SQIsign 在 Wesolowski 攻击后参数是否还会再变。
4. 在 EVM 上直接验证一个约 300 KB 的哈希型证明（例如 leanVM 输出），有没有可复现的实测 gas 数据？有没有项目（如 Starknet 的 L1 验证器）公开了单次 STARK 验证的 gas？
5. SP1 Hypercube 内存论证所用的扩域椭圆曲线，在量子攻击下会怎样影响内部 STARK 的可靠性？Succinct 有没有公开的 PQ 路线（例如去掉 BN254 包装）？
6. Lattice Jolt 加上 ZK 后的证明尺寸与 EVM 验证成本是多少？
7. ZKNOX / Fireblocks 实现的固定 commit 与第三方审计情况。

---

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| P1 | FIPS 203（ML-KEM）、FIPS 204（ML-DSA）、FIPS 205（SLH-DSA）于 2024-08-13 发布 | [1] 正文 “were published August 13, 2024”；[3] FIPS 列表 Final 8/13/2024 | observed | |
| P2 | 截至 NIST 页面最近一次更新（2026-08-05），FIPS 206（FN-DSA / Falcon）状态仍为 “in development” | [1] “FALCON … will be published in FIPS 206 (in development)”，页脚 Updated August 05, 2026 | observed | |
| P3 | NIST Selected Algorithms 页把 FALCON 与 HQC 都标为 “FIPS coming soon” | [2] 数字签名表与 KEM 表 | observed | |
| P4 | CSRC 上没有 FIPS 206 的 IPD 或定稿页面 | [3] FIPS 列表没有 206；/pubs/fips/206/ipd 返回 HTTP 404 | observed | |
| P5 | 截至 2026-10-16，GPT 所说“Falcon FIPS 仍 coming soon”依然成立 | 由 P2、P3、P4 推出：两页均未更新为已发布，也没有 IPD 页面 | inferred | |
| P6 | IETF 草案称 FN-DSA 与 Falcon 不兼容，FIPS 206 仍是 “forthcoming” | [47] §1 “FN-DSA and Falcon are not compatible”；Abstract “the forthcoming, FIPS 206” | observed | |
| P7 | 现有基于 Falcon round-3 的链上验证器与 EIP-8052 接口，在 FIPS 206 定稿后可能需要调整 | 由 P6、P29 推出：ETHFALCON 标注 “legacy NIST round3 compliant”，FN-DSA 又与 Falcon 不兼容 | inferred | |
| P8 | HQC 于 2025-03-11 被选为标准化算法（ML-KEM 的备用 KEM） | [1] “HQC was selected for standardization on March 11, 2025” | observed | |
| P9 | 附加签名征集第 3 轮于 2026-05-14 公布，二轮持续到 2026-05 | [7] 项目页首段与 Background 段 | observed | |
| P10 | NIST IR 8610 选出 9 个第 3 轮候选：FAEST、HAWK、MAYO、MQOM、QR-UOV、SDitH、SNOVA、SQIsign、UOV | [9] Abstract | observed | |
| P11 | HAWK 提交团队于 2026-07-29 撤回 HAWK，NIST 第 3 轮页面标为 withdrawn | [10] Léo Ducas 帖 “we withdraw our candidate HAWK”；[8] HAWK 行 “withdrawn” | observed | |
| P12 | Anthropic 的攻击把 HAWK-512 的密钥恢复成本从 2^150 降到 2^108，HAWK-1024 从 2^288 降到 2^182（AGPS'20 门计数模型） | [10] Steve Weis 帖（2026-07-29） | observed | |
| P13 | Anthropic 称该攻击只针对 HAWK，不影响其他 NIST PQ 候选或一般格密码，也不需要改动生产软件 | [11] Impact 段 “specific to HAWK …”；Summary 段 “no production software will have to change” | observed | |
| P14 | 第 3 轮候选按类别：同源 SQIsign；MPCitH 的 MQOM、SDitH；多变量 MAYO、QR-UOV、SNOVA、UOV；对称原语 FAEST | [8] 分类标题 | observed | |
| P15 | NIST 已选签名中除 SPHINCS+ 外都基于结构化格，附加征集特别想要非结构化格的方案 | [7] Background 段 | observed | |
| P16 | SQIsign v3.0 规范（2026-09-01）的尺寸：NIST-I 公钥 83 B、签名 200 B；NIST-V 公钥 169 B、签名 406 B | [16] Table 1 / Table 12 | observed | |
| P17 | SQIsign 第 3 轮因 [Wes26] 攻击调大了参数尺寸 | [16] §1.4 “Differences from the round-2 SQIsign submission” | observed | |
| P18 | MIKE（eprint 2026/2377）是同源 NIKE：80 B 公钥，含验证的共享密钥计算 4.9 ms（3.3 GHz AMD），NIST level 1 | [17] Abstract | observed | |
| P19 | MIKE 作者 2026-09-10 在论坛给出的 level 1 密钥交换时间为 7.5 ms（Ryzen 7 PRO 7840U），参数因 eprint 2026/1486 调整过 | [10] Damien Robert 帖（2026-09-10） | observed | |
| P20 | SP 800-208（2020-10）规定 LMS / HSS 与 XMSS / XMSS^MT 有状态哈希签名 | [12] 摘要 | observed | |
| P21 | XMSS 复用同一个密钥状态会失去全部安全保证、可被伪造；签名输出前必须先更新私钥 | [14] §1.1 CFRG Note；§4.1.9 “MUST NOT output the signature before the private key is updated” | observed | |
| P22 | XMSS-SHA2_10_256 的签名 2,500 B、公钥 68 B（含 4 B OID）；h=20 时签名 2,820 B | [14] §4.1.7、§4.1.8 公式；§5.3.1 Table 3 | observed | |
| P23 | SP 800-230 ipd（2026-04-13）为 SLH-DSA 加 6 个参数集，每把密钥最多签 2^24 次，不用于通用场景 | [13] NIST 新闻正文 | observed | |
| P24 | ML-DSA-44 / 65 / 87 的公钥 1,312 / 1,952 / 2,592 B，签名 2,420 / 3,309 / 4,627 B，类别 2 / 3 / 5 | [4] §4 Table 1、Table 2 | observed | |
| P25 | SLH-DSA-SHA2-128s 公钥 32 B、签名 7,856 B；128f 签名 17,088 B；256s 签名 29,792 B | [5] §11 Table 2 | observed | |
| P26 | Falcon-512 公钥 897 B（含 1 B 头）、签名 666 B（padded 固定长度）；Falcon-1024 为 1,793 / 1,280 B | [15] Table 3.3、§3.11.3、§3.11.4 | observed | |
| P27 | Ethereum ECDSA 签名长 65 B（64 B 签名 + 1 B recovery id），地址取未压缩公钥去掉前缀后 64 B 的 Keccak256 后 20 B | [19] `SignatureLength = 64 + 1`；`Keccak256(pubBytes[1:])[12:]`；[45] | observed | |
| P28 | ML-DSA-44 签名是 ECDSA 签名的约 37 倍，SLH-DSA-128s 约 121 倍，Falcon-512 约 10 倍 | 由 P24、P25、P26、P27 推出：2420/65≈37.2，7856/65≈120.9，666/65≈10.2 | inferred | |
| P29 | ZKNOX 的 Falcon 合约验签：NIST 版 ≈3.9M gas，EVM 友好版 ≈1.5M，实验分支 falcon8 650,345；未审计 | [24] README BENCHMARKS 表与 “not audited: DO NOT USE IN PRODUCTION” | observed | |
| P30 | ZKNOX 的 ML-DSA 合约验签：NIST 版 ≈8.1M gas、ETH 版 ≈4.9M；packed 分支 NIST 版 1,196,707；未审计 | [25] README BENCHMARKS 表 | observed | |
| P31 | Fireblocks 的 ML-DSA-44 验证器：verify() 1,226,311 gas，另需每把公钥约 4.11M gas 的部署；研究代码、未审计 | [26] README “One verification costs 1,226,311 gas”；“It has not been audited” | observed | |
| P32 | EIP-8051（Draft）把 ML-DSA 预编译定为 4,500 gas，输入为 20,512 B 的展开公钥 | [21] Specification 表与 public key 段 | observed | |
| P33 | EIP-8052（Draft）把 Falcon 验证定为 3,000 gas（hash-to-point 1,000 + core 2,000），地址待 ACD 定 | [22] Gas cost 段；Precompile address 段 “TBD by ACD” | observed | |
| P34 | EIP-7885（Draft）在 OP Stack 测试网实测，NTT 预编译把 ETHFALCON 从 1.8M 降到 479,341 gas；文中另有 1,500 gas 的估计，二者矛盾 | [23] End-to-end 表与 Benchmarks 段 | observed | |
| P35 | ecrecover 3,000 gas；P256VERIFY 6,900 gas；BN254 配对 45,000 + 34,000·k gas | [20] EcrecoverGas、P256VerifyGas、Bn256Pairing*Istanbul | observed | |
| P36 | 不靠预编译，目前最优的 NIST 合规 PQ 合约验签仍比 ecrecover 贵约 200–400 倍 | 由 P29、P31、P35 推出：650,345/3000≈217；1,226,311/3000≈409 | inferred | |
| P37 | 只算 calldata，ML-DSA-44 签名约 38,720 gas（2420×16），ECDSA 约 1,040 gas | 由 P24、P27 推出，calldata 16 gas/非零字节见 [20] TxDataNonZeroGasEIP2028（按全非零字节的上界估算） | inferred | |
| P38 | 复合签名草案 -19 要求所有组件签名都验证通过，即 strict AND | [28] §3.3 “if and only if all component signatures were successfully validated”；§9.1 “strict ‘AND’ mode” | observed | |
| P39 | 草案把 OR 型混合归为“迁移灵活性”，不提供双算法安全 | [28] §9.1 “Why Hybrids?” | observed | |
| P40 | 混合签名若用 OR，经典算法被攻破后攻击者仍能单独通过 | 由 P38、P39 推出：OR 只要求任一组件有效 | inferred | |
| P41 | Cloudflare 2026-09-29 称约 70% 浏览器流量使用混合 ML-KEM，约 15% 源站支持 | [29] 正文 “about 70% of browser-generated traffic … about 15% of origins” | observed | |
| P42 | X25519MLKEM768 同时执行 X25519 与 ML-KEM，再合并两个共享秘密 | [29] 正文 | observed | |
| P43 | Chrome 131+、Edge 131+、Firefox 132+ 支持 PQ 密钥协商 | [30] Radar 页 “Modern browsers like Chrome 131+ …” | observed | |
| P44 | ROM 下 SNARG 的 PQ 安全性此前只是 “widely believed”；IOP 型 SNARG（round-by-round soundness）已被证明在 QROM 下安全 | [39] Abstract | observed | |
| P45 | leanVM 宣称 128-bit ROM / 64-bit QROM soundness，形式化验证进行中，未达生产就绪，ZK 在计划中 | [38] README security 段与 warning、work in progress 段 | observed | |
| P46 | leanVM 在 M4 Max（CPU）上聚合 900 个 XMSS 签名：证明 317.4 KiB，验证 3.977 ms，参数集非最终 | [38] XMSS aggregation 输出 | observed | |
| P47 | Aztec 称快的 PQ 证明约 300 KB，而 Aztec 现有证明约 20 KB | [32] “Getting larger proofs through the network” 节 | observed | |
| P48 | EIP-8288 作者估计 STARK 超过 128 kB（快速生成时达 512 kB），验证需 “many millions of gas”；哈希签名约 2–3 kB、150k–200k gas | [27] Motivation 段 | observed | |
| P49 | 约 300 KiB 的证明只算 calldata 就约 4.9M gas（全非零字节 ×16），按 EIP-7623 floor（40 gas/字节）约 12.3M | 由 P46、P20 的参数推出：307,200×16≈4.92M；307,200×40≈12.29M | inferred | |
| P50 | Flock 单核 M4 Max 每秒证明 82k 次 BLAKE3 压缩，十核超过 660k；是 PoC 实现 | [34] Abstract | observed | |
| P51 | Lattice Jolt（2026-09-09）用基于 Module-SIS 的 Akita 替换 Dory，目标 128-bit 安全，证明 < 100 KB | [33] 正文 “Replacing elliptic curves with lattices” 等段 | observed | |
| P52 | Lattice Jolt 发布时尚无 ZK，由即将发布的配套论文补上；文章没有给出 EVM 验证成本 | [33] “A companion paper, coming shortly, adds zero knowledge” | observed | |
| P53 | LaBRADOR 对 2^20 约束的 R1CS 证明 58 KB；Greyhound 在 N=2^30 时评估证明 53 KB | [43] Abstract；[44] Abstract | observed | |
| P54 | SP1 用 Gnark 的 BN254 Groth16 / PLONK 把 STARK 压缩成 SNARK 上链，依赖可信设置 | [36] “Groth16/PLONK” 与 “Trusted setup” 段 | observed | |
| P55 | SP1 Groth16 证明约 260 B、链上约 270k gas；PLONK 约 868 B、约 300k gas | [35] Proof types | observed | |
| P56 | SP1 Hypercube 的安全模型假设 KoalaBear 7 次扩域上椭圆曲线的 DLP 困难 | [36] Elliptic curve 段 | observed | |
| P57 | RISC Zero 把 STARK 层标为 Quantum Safe “Yes”，把 Groth16 / BN254 的 STARK-to-SNARK 层标为 “No” | [37] 安全表与 “vulnerable to attacks from quantum computers” | observed | |
| P58 | SP1 / RISC Zero 式“STARK 内部 + BN254 外包装”的最终链上验证不抗量子 | 由 P35、P54、P57 推出：链上只验证 BN254 配对型 SNARK，Shor 可破 | inferred | |
| P59 | SP1 的内部 STARK 也不是纯哈希假设，量子对手可能威胁其内存论证的可靠性 | 由 P56 推出：扩域 EC DLP 可被 Shor 求解；官方没有分析其量子影响 | speculative | |
| P60 | Aztec 博客中 MIKE 的链接域名 eprint.iacr.asia 有误，正确的是 eprint.iacr.org/2026/2377 | [32] 链接文本；[17] 实际地址 | observed | |
| P61 | 256 位椭圆曲线（f = 256–383）的经典安全强度是 128 bit，与 AES-128 相当 | NIST SP 800-57 Part 1 Rev. 5 Table 2（p.55），https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-57pt1r5.pdf ，访问 2026-10-16（主会话补查） | observed | |

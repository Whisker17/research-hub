# 论断台账

每条会出现在 explainer 里的论断，都要在这里有一行。
类型：observed（直接观察到，有一手证据）/ inferred（由证据推出）/ speculative（推测，需在页面上标明）。

本表合并六路调研与主会话综合。前缀对应分册，证据里的 `[n]` 指该分册“来源”一节的第 n 条：
- **T** → `notes-threat.md`（量子威胁、Q-day 估计、AI 密码分析）
- **P** → `notes-primer.md`（PQ 标准、方案分类、尺寸与 gas、混合签名、PQ 证明系统）
- **E** → `notes-ethereum.md`（EVM 密码学现状、Ethereum PQ 路线、对 L2 的含义）
- **O** → `notes-projects.md`（Starknet、Aztec、Optimism、Algorand、Bitcoin、Solana、Zcash、SP1、Jolt、Sui 等）
- **M** → `notes-mantle.md`（Mantle 架构与密码学映射，公开资料）
- **K** → `notes-chain.md`（主会话链上复核：cast / RPC，2026-10-16）
- **X** → `notes.md` §跨路综合（主会话推论与建议，类型为 inferred / speculative）

外部调研 `from-aztec-pq-to-mantle-pq.md`（ChatGPT Deep Research）只当线索使用。

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| T1 | NIST IR 8105 把 RSA、ECDSA、ECDH、DSA 评为大规模量子计算机下“No longer secure”，AES 需要更大的密钥，SHA-2 / SHA-3 需要更大的输出 | [8] §1 Table 1 | observed | F1、F3 |
| T2 | Grover 对无结构搜索只有平方加速，不会让密码技术过时 | [8] §1 “proffers a quadratic speedup… does not render cryptographic technologies obsolete” | observed | F3 |
| T3 | NIST 认为 Grover 难以并行，AES-128 “will remain secure for decades to come” | [9] FAQ Grover 条目 | observed | F3 |
| T4 | NIST 不打算在 PQC 迁移中替换对称算法标准 | [7] §2.1.3 “NIST does not expect to need to transition away from these standards” | observed | F3 |
| T5 | SHA-256 / SHA3-256 的原像安全强度属 Category 5，碰撞属 Category 2 | [7] Table 7 与 Table 1 | observed | F3 |
| T6 | NIST 用 MAXDEPTH 计价量子攻击；AES-128 的量子攻击 = 2^170 / MAXDEPTH 个量子门 | [10] MAXDEPTH 段与成本表 | observed | F3 |
| T7 | “Grover 把 256 位哈希原像降到 2^128”只是查询数口径，实际成本远高于此 | 由 T5、T6 推出：NIST 计入深度限制后，SHA-256 原像仍与 AES-256 同级 | inferred | F3 |
| T8 | Bernstein：BHT 的 2^{b/3} 时间需要 2^{b/3} 规模的机器，比经典 vOW 并行碰撞（约 2^{b/4} 时间与面积）更慢 | [11] p.29–32 “giant steps backwards” | observed |  |
| T9 | Google 白皮书认为 Grover 的平方加速几乎被纠错开销抵消，且难以并行（针对 PoW） | [2] §III.4 | observed | F3 |
| T10 | Google 估计 ECDLP 在 alt_bn128（BN254）上的量子成本只比 secp256k1 略高 | [2] §IV “only moderately higher… alt_bn128” | observed |  |
| T11 | ethereum.org 把 ECDSA、BLS、KZG、配对型 ZK 证明列为可被 Shor 高效求解 | [3] “Why post-quantum cryptography matters” | observed | F1 |
| T12 | EOA 地址 = 公钥 Keccak-256 的后 20 字节，签名可推出公钥 | [24] Account creation 段 | observed |  |
| T13 | 发过交易的账户公钥已在链上暴露；只收款、从未发过交易的账户多一层哈希保护 | [3] Account signatures 段；[32] 首帖 | observed |  |
| T14 | Google 定义 at-rest、on-spend、on-setup 三类量子攻击，on-setup 会产生“universal reusable backdoor” | [2] §II.1 | observed |  |
| T15 | Google 估计快时钟 CRQC 攻破 ETH 最多的 1,000 个账户（约 2,050 万 ETH）用时少于 9 天 | [2] §V.1 | observed | K |
| T16 | 前 500 个合约账户中至少 70 个（约 250 万 ETH）存在 Admin Vulnerability，推导这些私钥少于 15 小时 | [2] §V.2 | observed | K |
| T17 | Google 认为桥、预言机等“高杠杆、低 ETH 余额”账户的二阶风险“arguably much larger” | [2] §V.2 | observed | K |
| T18 | Ethereum 共识层升级为量子安全，不会回溯修复已部署合约中的 Code Vulnerability | [2] §V.3 原句 | observed | K |
| T19 | Google 按主要 L2 与桥的 TVS 估计 Code Vulnerability 至少 1,500 万 ETH，并指出部分 L2 用量子脆弱的 zkSNARK | [2] §V.3 | observed |  |
| T20 | KZG 的 toxic waste 是 SRS 中两个椭圆曲线点的离散对数，CRQC 可从公开参数算出，并得到无需再用 CRQC 的永久后门 | [2] §V.5 | observed | F4 |
| T21 | EF KZG 仪式的信任假设是 1-of-N；秘密一旦被提取，攻击者可以对 EIP-4844 数据任意声明 | [25] FAQ “What needs to go wrong…” | observed | F4 |
| T22 | 知道 τ 会破坏 KZG 绑定性以及所有基于它的 SNARK 的可靠性 | [26] ePrint 2025/064 第 3 节段落（搜索摘要原文） | observed |  |
| T23 | 可信设置“有诚实参与者”对量子对手无效，ethereum.org 称其抗量子的说法有误 | 由 T20、T21、T22 推出：量子对手不需要任何参与者泄密，直接由公开 SRS 求出 τ；[3] 原句 “even against quantum computers” | inferred | F4、S |
| T24 | Google 承认自己用于披露的 Groth16 证明，其可靠性对量子攻击脆弱、可被伪造 | [2] App. A.6 原句 | observed | F4 |
| T25 | 在 L1 上以 BN254 Groth16 / PLONK 验证的 rollup 证明，可在 Q-day 后被伪造（on-setup） | 由 T10、T22、T24 推出：BN254 的 DLP 可被 Shor 求解，SRS 陷门可被算出，可靠性失效 | inferred | F4 |
| T26 | 截至 2026-02 约 3,700 万 ETH 质押；20 台早期快时钟 CRQC 推导 2/3 验证者私钥需要 9 个月以上；质押集中会削弱缓冲 | [2] §V.4 | observed |  |
| T27 | BLS 被攻破后，超过 1/3 能阻止终局，超过 1/2 能控制分叉选择，超过 2/3 能终局化冲突链 | [2] §V.4 | observed |  |
| T28 | EF 认为 HNDL 主要影响加密数据而非区块链签名，真实失败模式是盗币和冒充，而非改写已终局的历史 | [4] FAQ “Understanding the Threat” | observed | F6 |
| T29 | Aztec 描述的 HNDL：量子对手可从公告板上的 ECDH 临时公钥推出全部临时私钥，进而解密全网 note | [16] “Traditional messaging” 节 | observed | F6 |
| T30 | NIST IR 8547 提示，应用指南可能要求在经典方案被全面禁用前，先把密钥建立迁到抗量子方案，以缓解 HNDL | [7] §4.1.2 | observed |  |
| T31 | 对 Mantle 这类公开 L2，HNDL 不是核心矛盾，主要风险是授权伪造与证明伪造 | 由 T28、T15、T25 推出 | inferred | F6 |
| T32 | Google 白皮书称约 690 万 BTC 处于脆弱状态（直接暴露公钥的类型 + 仍有余额的复用地址） | [2] §III 图注 | observed |  |
| T33 | Deloitte 的口径是“over 4 million BTC (about 25%)”（P2PK 约 200 万 + 复用 P2PKH 约 250 万） | [31] 正文 | observed |  |
| T34 | EF 估计 Ethereum 长期休眠（遗弃）暴露约 0.1%，Bitcoin 早期遗弃格式约 5%；这不代表 Ethereum 的总暴露 | [4] FAQ “Attack Surface & Risk” | observed |  |
| T35 | Google 估计 ECDLP-256 需要 <1,200 个逻辑比特 + <9,000 万 Toffoli 门，或 <1,450 个逻辑比特 + <7,000 万 Toffoli 门 | [1] 资源估计段；[2] 摘要 | observed | F5 |
| T36 | 在 1e-3 物理错误率、平面连接的超导机器上，用 <50 万物理比特可在约 18 / 23 分钟内完成（10 µs 反应时间、每个 Toffoli 额外 50% 开销） | [2] 摘要与资源估计节 | observed | F5 |
| T37 | Google 称物理比特需求比此前估计降低约 20 倍，并用零知识证明代替公开电路；v2 修补了可破坏该证明可靠性的 bug | [1]；[2] arXiv 版本说明 | observed | F5 |
| T38 | 慢时钟架构（中性原子、离子阱）的基本操作慢 2–3 个数量级，预计无法发动 on-spend 攻击 | [2] §I/II 快慢时钟段 | observed |  |
| T39 | Gidney 2025 估计 RSA-2048 用 <100 万噪声比特、<1 周即可分解（0.1% 门错误、1 µs 周期、10 µs 反应时间） | [17] 摘要 | observed |  |
| T40 | Google Willow（2024-12-09）有 105 个比特，双比特门错误约 0.33%，表面码周期 1.1 µs | [18] 规格表 | observed | F5 |
| T69 | ethereum.org 称当前量子硬件为“a few thousand noisy physical qubits”（未标出处） | notes-threat.md T-Q3 依据与不确定之处；[3] ethereum.org quantum-resistance 页 | observed | F5 |
| T41 | 现有公开硬件与 ECDLP-256 所需的物理比特相差两到三个数量级：Willow 105 个、ethereum.org 所说的“数千个”噪声比特，对比所需的 <50 万 | 由 T36、T40、T69 推出：105 vs 500,000 约 3.7 个数量级；数千 vs 500,000 约 2 个数量级 | inferred | F5 |
| T42 | GRI 2025 报告（2026-03，26 位专家）：10 年内出现 CRQC 的概率 28–49%，15 年内 51–70% | [19] 页面与执行摘要 | observed | F5 |
| T43 | NIST IR 8547 截至 2026-10-16 仍是 2024-11-12 的初始公开草案 | [6] 文档历史只有 11/12/24 | observed |  |
| T44 | IR 8547 草案：ECDSA / RSA 112-bit 在 2030 年后弃用、2035 年后禁用；≥128-bit 在 2035 年后禁用，没有弃用阶段 | [7] Table 2 / Table 4 | observed |  |
| T45 | NSA CNSA 2.0：NSS 在 2035 年前完成迁移；软件 / 固件签名 2030 年前只用 CNSA 2.0；Web / 云 2033 年 | [20] Timing 节 | observed |  |
| T46 | Google 设定 2029 年 PQC 迁移时间表，并认为加密的 HNDL 威胁当下就存在、签名是未来威胁 | [5] 正文 | observed |  |
| T47 | EF：CRQC 不是迫在眉睫，多数工程路线图把密码学相关性放在 2030 年代早中期；L1 升级可能在 2029 年完成 | [4] Overview 与 FAQ | observed | F5 |
| T48 | Vitalik 引 Metaculus：中位数 2040，2030 年底前约 20% | [29] X 帖 2025-08-27（经搜索索引读取） | observed |  |
| T49 | Aztec 博客作者认为 4 年内出现 Q-day 不太可能 | [16] “Why the roadmap extends to 2030” | observed |  |
| T50 | Anthropic 用 Mythos Preview 约 60 小时、约 10 万美元 API 成本，改进了对 HAWK 的已知最佳攻击 | [12] HAWK 节 | observed | L、F7 |
| T51 | HAWK 攻击是经典攻击，把密钥恢复归约到 n/2+1 维 SVP；HAWK-512 从 2^150 降到 2^108，HAWK-1024 从 2^288 降到 2^182 | [13] 摘要与 §6.1 Table 1 | observed | L、F7 |
| T52 | HAWK-256 的密钥可在单台 96 核服务器上几小时内端到端恢复；该构造不能迁移到 Falcon | [13] §6.2 与摘要 | observed | L、F7 |
| T53 | NIST 确认 HAWK 团队撤回，HAWK 不会被标准化或部署；结果不影响 ML-KEM / ML-DSA | [15] nist.gov/pqc 原文 | observed | L、F7 |
| T54 | 对 7 轮 AES-128（完整 10 轮）的攻击：数据量仍为 2^105 个选择明文，时间从 2^99 降到 2^89.3–2^91.4，总体复杂度没有改善 | [14] 摘要、引言、§4.1.1 | observed | L、F7 |
| T55 | Anthropic 声明两项结果都不影响生产系统，不需要修改生产软件 | [12] Introduction “no production software will have to change” | observed | L、F7 |
| T56 | Anthropic 另报告 13 轮 LEA 的实际攻击、6 轮 Serpent，以及对 Poseidon / SHA-1 / Salsa20 不到 10 倍的改进 | [12] Further work | observed | F7 |
| T57 | Aztec 称其 AI 审计工具找到了数月人工内外部审计漏掉的 critical 漏洞，已在 v6 修复 | [16] “The risk of changing cryptography” | observed | F7 |
| T58 | Anthropic 的 SCONE-bench：AI 代理对知识截止后的真实被攻击合约生成了总价值 $4.6M 的 exploit；Mythos 在 2026 年更新集上达到 $35M | [27]；[28] | observed |  |
| T59 | EF 赏金中被认领的 Poseidon / Poseidon2 实例都是缩减轮数，完整轮数的推荐参数没有被攻破 | [23] Slide 4–6、13；[22] 摘要 | observed |  |
| T60 | “Skipping Class”利用 Poseidon2 的非 MDS 矩阵，对一组 128-bit 推荐参数把代数碰撞攻击改进 2^106 倍，但不低于其宣称的安全级别 | [21] 摘要；[23] Slide 6 | observed |  |
| T61 | EF 的 Poseidon 计划因此在 2026 年赏金中从 Poseidon2 转向 Poseidon1（KoalaBear） | [23] Slide 6 | observed |  |
| T62 | Aztec 认为 BN254 上的 Poseidon2 目前安全，但计划长期换成 BLAKE2s / BLAKE3，并跟随 EF 的 hash 选择 | [16] “Hash functions belong in the migration too” | observed |  |
| T63 | Aztec 默认的密码学变更策略是保守，要求极强的密码分析和形式化验证的实现 | [16] 原文 “conservative… formally-verified implementations” | observed | F7、F14 |
| T64 | EF 认为仓促部署不成熟的 PQ 密码可能带来比它消除的更多的风险 | [4] FAQ “Common misconceptions” | observed | F7 |
| T65 | Vitalik 2026-10-07 称 AI 数学可能在两年内严重削弱格的具体安全性，并主张同时减少对“AI 脆弱密码”的暴露 | [30] Decrypt 转述与嵌入引文（X 原帖 403） | speculative | L |
| T66 | 对 Mantle 来说，AI 带来的近期风险更多在实现与集成层（合约、验证器、桥），而不是对已标准化 PQ 算法的数学攻破 | 由 T53、T55、T57、T58 推出 | inferred | F7 |
| T67 | 2026-06 的 EO 14412 / OMB M-26-15 把 IR 8547 的 2030 节点变成了联邦合规期限 | 只见于 [33] 媒体，未找到一手原文 | speculative | R |
| T68 | Aztec 所说的“small-field Poseidon breaks”指 EF 赏金中 31-bit 缩减轮数实例的求解以及“Skipping Class” | Aztec 原文无链接 [16]；时间与内容和 [21][22][23] 吻合 | speculative | R |
| P1 | FIPS 203（ML-KEM）、FIPS 204（ML-DSA）、FIPS 205（SLH-DSA）于 2024-08-13 发布 | [1] 正文 “were published August 13, 2024”；[3] FIPS 列表 Final 8/13/2024 | observed |  |
| P2 | 截至 NIST 页面最近一次更新（2026-08-05），FIPS 206（FN-DSA / Falcon）状态仍为 “in development” | [1] “FALCON … will be published in FIPS 206 (in development)”，页脚 Updated August 05, 2026 | observed | M |
| P3 | NIST Selected Algorithms 页把 FALCON 与 HQC 都标为 “FIPS coming soon” | [2] 数字签名表与 KEM 表 | observed | M |
| P4 | CSRC 上没有 FIPS 206 的 IPD 或定稿页面 | [3] FIPS 列表没有 206；/pubs/fips/206/ipd 返回 HTTP 404 | observed | M |
| P5 | 截至 2026-10-16，GPT 所说“Falcon FIPS 仍 coming soon”依然成立 | 由 P2、P3、P4 推出：两页均未更新为已发布，也没有 IPD 页面 | inferred | M |
| P6 | IETF 草案称 FN-DSA 与 Falcon 不兼容，FIPS 206 仍是 “forthcoming” | [47] §1 “FN-DSA and Falcon are not compatible”；Abstract “the forthcoming, FIPS 206” | observed | M |
| P7 | 现有基于 Falcon round-3 的链上验证器与 EIP-8052 接口，在 FIPS 206 定稿后可能需要调整 | 由 P6、P29 推出：ETHFALCON 标注 “legacy NIST round3 compliant”，FN-DSA 又与 Falcon 不兼容 | inferred |  |
| P8 | HQC 于 2025-03-11 被选为标准化算法（ML-KEM 的备用 KEM） | [1] “HQC was selected for standardization on March 11, 2025” | observed | M |
| P9 | 附加签名征集第 3 轮于 2026-05-14 公布，二轮持续到 2026-05 | [7] 项目页首段与 Background 段 | observed |  |
| P10 | NIST IR 8610 选出 9 个第 3 轮候选：FAEST、HAWK、MAYO、MQOM、QR-UOV、SDitH、SNOVA、SQIsign、UOV | [9] Abstract | observed | M |
| P11 | HAWK 提交团队于 2026-07-29 撤回 HAWK，NIST 第 3 轮页面标为 withdrawn | [10] Léo Ducas 帖 “we withdraw our candidate HAWK”；[8] HAWK 行 “withdrawn” | observed | M、S |
| P12 | Anthropic 的攻击把 HAWK-512 的密钥恢复成本从 2^150 降到 2^108，HAWK-1024 从 2^288 降到 2^182（AGPS'20 门计数模型） | [10] Steve Weis 帖（2026-07-29） | observed |  |
| P13 | Anthropic 称该攻击只针对 HAWK，不影响其他 NIST PQ 候选或一般格密码，也不需要改动生产软件 | [11] Impact 段 “specific to HAWK …”；Summary 段 “no production software will have to change” | observed |  |
| P14 | 第 3 轮候选按类别：同源 SQIsign；MPCitH 的 MQOM、SDitH；多变量 MAYO、QR-UOV、SNOVA、UOV；对称原语 FAEST | [8] 分类标题 | observed |  |
| P15 | NIST 已选签名中除 SPHINCS+ 外都基于结构化格，附加征集特别想要非结构化格的方案 | [7] Background 段 | observed |  |
| P16 | SQIsign v3.0 规范（2026-09-01）的尺寸：NIST-I 公钥 83 B、签名 200 B；NIST-V 公钥 169 B、签名 406 B | [16] Table 1 / Table 12 | observed |  |
| P17 | SQIsign 第 3 轮因 [Wes26] 攻击调大了参数尺寸 | [16] §1.4 “Differences from the round-2 SQIsign submission” | observed |  |
| P18 | MIKE（eprint 2026/2377）是同源 NIKE：80 B 公钥，含验证的共享密钥计算 4.9 ms（3.3 GHz AMD），NIST level 1 | [17] Abstract | observed |  |
| P19 | MIKE 作者 2026-09-10 在论坛给出的 level 1 密钥交换时间为 7.5 ms（Ryzen 7 PRO 7840U），参数因 eprint 2026/1486 调整过 | [10] Damien Robert 帖（2026-09-10） | observed |  |
| P20 | SP 800-208（2020-10）规定 LMS / HSS 与 XMSS / XMSS^MT 有状态哈希签名 | [12] 摘要 | observed |  |
| P21 | XMSS 复用同一个密钥状态会失去全部安全保证、可被伪造；签名输出前必须先更新私钥 | [14] §1.1 CFRG Note；§4.1.9 “MUST NOT output the signature before the private key is updated” | observed |  |
| P22 | XMSS-SHA2_10_256 的签名 2,500 B、公钥 68 B（含 4 B OID）；h=20 时签名 2,820 B | [14] §4.1.7、§4.1.8 公式；§5.3.1 Table 3 | observed |  |
| P23 | SP 800-230 ipd（2026-04-13）为 SLH-DSA 加 6 个参数集，每把密钥最多签 2^24 次，不用于通用场景 | [13] NIST 新闻正文 | observed |  |
| P24 | ML-DSA-44 / 65 / 87 的公钥 1,312 / 1,952 / 2,592 B，签名 2,420 / 3,309 / 4,627 B，类别 2 / 3 / 5 | [4] §4 Table 1、Table 2 | observed | F8 |
| P25 | SLH-DSA-SHA2-128s 公钥 32 B、签名 7,856 B；128f 签名 17,088 B；256s 签名 29,792 B | [5] §11 Table 2 | observed | F8 |
| P26 | Falcon-512 公钥 897 B（含 1 B 头）、签名 666 B（padded 固定长度）；Falcon-1024 为 1,793 / 1,280 B | [15] Table 3.3、§3.11.3、§3.11.4 | observed | F8 |
| P27 | Ethereum ECDSA 签名长 65 B（64 B 签名 + 1 B recovery id），地址取未压缩公钥去掉前缀后 64 B 的 Keccak256 后 20 B | [19] `SignatureLength = 64 + 1`；`Keccak256(pubBytes[1:])[12:]`；[45] | observed | F8 |
| P28 | ML-DSA-44 签名是 ECDSA 签名的约 37 倍，SLH-DSA-128s 约 121 倍，Falcon-512 约 10 倍 | 由 P24、P25、P26、P27 推出：2420/65≈37.2，7856/65≈120.9，666/65≈10.2 | inferred | F8 |
| P29 | ZKNOX 的 Falcon 合约验签：NIST 版 ≈3.9M gas，EVM 友好版 ≈1.5M，实验分支 falcon8 650,345；未审计 | [24] README BENCHMARKS 表与 “not audited: DO NOT USE IN PRODUCTION” | observed | F8 |
| P30 | ZKNOX 的 ML-DSA 合约验签：NIST 版 ≈8.1M gas、ETH 版 ≈4.9M；packed 分支 NIST 版 1,196,707；未审计 | [25] README BENCHMARKS 表 | observed | F8 |
| P31 | Fireblocks 的 ML-DSA-44 验证器：verify() 1,226,311 gas，另需每把公钥约 4.11M gas 的部署；研究代码、未审计 | [26] README “One verification costs 1,226,311 gas”；“It has not been audited” | observed | F8、F15 |
| P32 | EIP-8051（Draft）把 ML-DSA 预编译定为 4,500 gas，输入为 20,512 B 的展开公钥 | [21] Specification 表与 public key 段 | observed | F8 |
| P33 | EIP-8052（Draft）把 Falcon 验证定为 3,000 gas（hash-to-point 1,000 + core 2,000），地址待 ACD 定 | [22] Gas cost 段；Precompile address 段 “TBD by ACD” | observed | F8 |
| P34 | EIP-7885（Draft）在 OP Stack 测试网实测，NTT 预编译把 ETHFALCON 从 1.8M 降到 479,341 gas；文中另有 1,500 gas 的估计，二者矛盾 | [23] End-to-end 表与 Benchmarks 段 | observed |  |
| P35 | ecrecover 3,000 gas；P256VERIFY 6,900 gas；BN254 配对 45,000 + 34,000·k gas | [20] EcrecoverGas、P256VerifyGas、Bn256Pairing*Istanbul | observed |  |
| P36 | 不靠预编译，目前最优的 NIST 合规 PQ 合约验签仍比 ecrecover 贵约 200–400 倍 | 由 P29、P31、P35 推出：650,345/3000≈217；1,226,311/3000≈409 | inferred | F8 |
| P37 | 只算 calldata，ML-DSA-44 签名约 38,720 gas（2420×16），ECDSA 约 1,040 gas | 由 P24、P27 推出，calldata 16 gas/非零字节见 [20] TxDataNonZeroGasEIP2028（按全非零字节的上界估算） | inferred |  |
| P38 | 复合签名草案 -19 要求所有组件签名都验证通过，即 strict AND | [28] §3.3 “if and only if all component signatures were successfully validated”；§9.1 “strict ‘AND’ mode” | observed | M、F9 |
| P39 | 草案把 OR 型混合归为“迁移灵活性”，不提供双算法安全 | [28] §9.1 “Why Hybrids?” | observed | M、F9 |
| P40 | 混合签名若用 OR，经典算法被攻破后攻击者仍能单独通过 | 由 P38、P39 推出：OR 只要求任一组件有效 | inferred | M |
| P41 | Cloudflare 2026-09-29 称约 70% 浏览器流量使用混合 ML-KEM，约 15% 源站支持 | [29] 正文 “about 70% of browser-generated traffic … about 15% of origins” | observed | M |
| P42 | X25519MLKEM768 同时执行 X25519 与 ML-KEM，再合并两个共享秘密 | [29] 正文 | observed |  |
| P43 | Chrome 131+、Edge 131+、Firefox 132+ 支持 PQ 密钥协商 | [30] Radar 页 “Modern browsers like Chrome 131+ …” | observed |  |
| P44 | ROM 下 SNARG 的 PQ 安全性此前只是 “widely believed”；IOP 型 SNARG（round-by-round soundness）已被证明在 QROM 下安全 | [39] Abstract | observed |  |
| P45 | leanVM 宣称 128-bit ROM / 64-bit QROM soundness，形式化验证进行中，未达生产就绪，ZK 在计划中 | [38] README security 段与 warning、work in progress 段 | observed |  |
| P46 | leanVM 在 M4 Max（CPU）上聚合 900 个 XMSS 签名：证明 317.4 KiB，验证 3.977 ms，参数集非最终 | [38] XMSS aggregation 输出 | observed |  |
| P47 | Aztec 称快的 PQ 证明约 300 KB，而 Aztec 现有证明约 20 KB | [32] “Getting larger proofs through the network” 节 | observed | M |
| P48 | EIP-8288 作者估计 STARK 超过 128 kB（快速生成时达 512 kB），验证需 “many millions of gas”；哈希签名约 2–3 kB、150k–200k gas | [27] Motivation 段 | observed |  |
| P49 | 约 300 KiB 的证明只算 calldata 就约 4.9M gas（全非零字节 ×16），按 EIP-7623 floor（40 gas/字节）约 12.3M | 由 P46、P20 的参数推出：307,200×16≈4.92M；307,200×40≈12.29M | inferred | F16 |
| P50 | Flock 单核 M4 Max 每秒证明 82k 次 BLAKE3 压缩，十核超过 660k；是 PoC 实现 | [34] Abstract | observed |  |
| P51 | Lattice Jolt（2026-09-09）用基于 Module-SIS 的 Akita 替换 Dory，目标 128-bit 安全，证明 < 100 KB | [33] 正文 “Replacing elliptic curves with lattices” 等段 | observed | M |
| P52 | Lattice Jolt 发布时尚无 ZK，由即将发布的配套论文补上；文章没有给出 EVM 验证成本 | [33] “A companion paper, coming shortly, adds zero knowledge” | observed | M |
| P53 | LaBRADOR 对 2^20 约束的 R1CS 证明 58 KB；Greyhound 在 N=2^30 时评估证明 53 KB | [43] Abstract；[44] Abstract | observed |  |
| P54 | SP1 用 Gnark 的 BN254 Groth16 / PLONK 把 STARK 压缩成 SNARK 上链，依赖可信设置 | [36] “Groth16/PLONK” 与 “Trusted setup” 段 | observed | F10 |
| P55 | SP1 Groth16 证明约 260 B、链上约 270k gas；PLONK 约 868 B、约 300k gas | [35] Proof types | observed |  |
| P56 | SP1 Hypercube 的安全模型假设 KoalaBear 7 次扩域上椭圆曲线的 DLP 困难 | [36] Elliptic curve 段 | observed | F10、S |
| P57 | RISC Zero 把 STARK 层标为 Quantum Safe “Yes”，把 Groth16 / BN254 的 STARK-to-SNARK 层标为 “No” | [37] 安全表与 “vulnerable to attacks from quantum computers” | observed | F10 |
| P58 | SP1 / RISC Zero 式“STARK 内部 + BN254 外包装”的最终链上验证不抗量子 | 由 P35、P54、P57 推出：链上只验证 BN254 配对型 SNARK，Shor 可破 | inferred | F10 |
| P59 | SP1 的内部 STARK 也不是纯哈希假设，量子对手可能威胁其内存论证的可靠性 | 由 P56 推出：扩域 EC DLP 可被 Shor 求解；官方没有分析其量子影响 | speculative | F10、R |
| P60 | Aztec 博客中 MIKE 的链接域名 eprint.iacr.asia 有误，正确的是 eprint.iacr.org/2026/2377 | [32] 链接文本；[17] 实际地址 | observed |  |
| P61 | 256 位椭圆曲线（f = 256–383）的经典安全强度是 128 bit，与 AES-128 相当 | NIST SP 800-57 Part 1 Rev. 5 Table 2（p.55），https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-57pt1r5.pdf ，访问 2026-10-16（主会话补查） | observed | I |
| E1 | Ethereum 地址定义为 keccak(priv_to_pub(k))[12:]，发过一次交易就会暴露公钥 | [24] 正文第 3 段“An Ethereum address is defined as…” | observed | F1 |
| E2 | EIP-7702 用 ecrecover 从授权元组恢复 authority，消息为 keccak(MAGIC‖rlp([chain_id,address,nonce])) | [25] Behavior 第 3 步 | observed | F1、J |
| E3 | EIP-7702 允许已委托账户再次委托，address 为 0 时清除代码 | [25] Behavior 第 5、8 步 | observed | F1、J |
| E4 | EIP-7702 委托后的 EOA 仍可用原私钥发起交易 | [25] “Transaction origination”一节 | observed | F1、J |
| E5 | 只要原 ECDSA 私钥被量子恢复，7702 账户上挂的 PQ 验证模块就可被绕过（重写 / 清除委托或直接发交易） | 由 E2、E3、E4 推出：授权根始终是 secp256k1 私钥 | inferred | F1、J |
| E6 | EIP-7702 与 EIP-2537 随 Pectra 上主网，时间戳 1746612311（2025-05-07 10:05:11 UTC） | [28] Included EIPs 与 Activation 表 | observed | F1 |
| E7 | P-256 预编译 EIP-7951（0x100，6900 gas）随 Fusaka 于 2025-12-03 21:49:11 UTC 上主网，取代 RIP-7212 | [26] Precompile 节与“supersedes RIP-7212”；[27] Included EIPs 与 Mainnet 行 | observed | F1、F15 |
| E8 | EIP-7951 与 RIP-7212 接口相同，但 gas 不同（6900 vs 3450），原文称“does not maintain compatibility with L2s” | [26] Interface Compatibility、Gas Cost Justification | observed | F1 |
| E9 | 信标链签名用 BLS12-381（公钥 48B 在 G1，签名 96B 在 G2），按 IETF BLS 草案 v4 | [33] phase0/beacon-chain.md 的 BLSPubkey / BLSSignature 与“BLS signatures”节 @12c8b24b | observed | F1 |
| E10 | RANDAO reveal 由提议者的 BLS 签名验证 | [33] process_randao 中 bls.Verify(... body.randao_reveal) | observed | F1 |
| E11 | EIP-4844 blob 用 BLS12-381 上的 KZG 承诺，point evaluation 预编译在 0x0A，50000 gas | [30] Parameters 表与 Point evaluation precompile 节 | observed | F1 |
| E12 | KZG 仪式有 14 万多次贡献，blob 于 2024-03 随 Dencun 上线 | [34] “What was the KZG Ceremony?”与 Current progress | observed | F1 |
| E13 | PeerDAS（EIP-7594，Fusaka）引入 cell KZG proofs，由 blob 交易发送者计算 | [31] Networking 节；[27] Included EIPs | observed | F1 |
| E14 | BN254 预编译（EIP-196/197，0x6–0x8）是为链上 zkSNARK 验证而加的 | [32] EIP-197 Simple Summary 与 Address: 0x8 | observed | F1 |
| E15 | EIP-2537 作者称 BN254 只有约 80 bit 经典安全，BLS12-381 有 120+ bit | [29] Motivation 原文 | observed |  |
| E16 | EIP-7864 binary tree 的哈希函数未定，候选为 BLAKE3 / Keccak / Poseidon2，原文要求不要假定 BLAKE3 | [35] 摘要下 Note 段与 Rationale 候选列表 | observed |  |
| E17 | EIP-7864 放弃 Verkle 的理由之一是 Verkle 依赖不抗量子的椭圆曲线 | [35] Rationale“Verkle Trees … rely on elliptic curves that aren’t post-quantum secure” | observed |  |
| E18 | EF Protocol 目标：2029 年 12 月 L1 在执行、共识、数据三层抗量子，至少到 2027 年 1 月不改 | [3] “I. The north star” | observed | N |
| E19 | pq.ethereum.org 写“L1 protocol upgrades could be completed by 2029”，执行层完整迁移还要更多年 | [1] FAQ“Implementation & Timeline” | observed | N |
| E20 | ethereum.org 写核心 PQ 基础设施约 2029 年完成，执行层与生态迁移在此之后 | [2] Migration milestones 的“Target”段 | observed | N |
| E21 | “Ethereum 2029”指 L1 协议具备 PQ 能力，不代表所有账户 / 资产已迁移 | 由 E18、E19、E20 推出：三份 EF 文本都把用户迁移放在协议完成之后 | inferred | N |
| E22 | EF 原话“Hegotá is not the PQ fork”，Hegotá 已排期的只有 FOCIL（EIP-7805）与 Frame Transaction（EIP-8141） | [3] V 节；[7] EIPs Scheduled for Inclusion | observed | F11 |
| E23 | EIP-8141 在 eips 网站上仍是 Draft（Created 2026-01-29），但在 Hegotá meta 里是 Scheduled for Inclusion | [9] 页头“Draft”；[7] Scheduled 列表 | observed | F11、S |
| E24 | Hegotá 预计 2027 Q2 上主网，日期未确认；Glamsterdam 预计 2026 Q4、未确认 | [8] 两页的 Upgrade status | observed | F11、S |
| E25 | EIP-8141 的协议级签名 scheme 只有 ARBITRARY(0x0) / SECP256K1(0x1, 2800 gas) / P256(0x2, 6700 gas)，暂无 PQ scheme | [9] Transaction Signatures 节 scheme 表 | observed | F11 |
| E26 | EIP-8141 让协议校验的签名字节不可被 EVM 内省，为日后聚合留出空间 | [9] Transaction Signatures 节“intentionally not introspectable … future aggregation” | observed |  |
| E27 | EIP-7885、8051、8052 均为 Draft，不在 Hegotá meta 的任何列表里 | [10][11][12] 页头 Draft；[7] 四个列表都没有这三号 | observed | F11、S |
| E28 | ML-DSA 预编译 EIP-8355 已被 Hegotá Declined，EF 评 C 级，原话“premature standardization” | [7] Declined 列表；[4] 分级表 8355 行 | observed | F11、S |
| E29 | EIP-8051 定义 FIPS-204 合规版与偏离 FIPS-204 的 Keccak 变体（0x12 / 0x13，各 4500 gas），只覆盖 ML-DSA-44 | [11] Abstract 与 Specification 表 | observed |  |
| E30 | EIP-8052 定义 Falcon-512 的 SHAKE256（NIST 合规）与 KeccakPRNG（EVM 友好）两种 hash-to-point，并面向 rollup 集成 | [12] Abstract | observed |  |
| E31 | EIP-7932 与 EIP-8051 的 Draft 都写到预编译地址 0x12，PQ 预编译地址尚未协调 | [13] Parameters 表；[11] Specification 表 | observed |  |
| E32 | EIP-8288（Draft，2026-06-03）在 8141 上加依赖帧，用区块级递归 STARK 聚合 leanSPHINCS 签名（3000 gas）与 leanSTARK（30000 gas） | [15] Abstract 与 Constants 表 | observed |  |
| E33 | EIP-8151 指出迁移后旧 k1 私钥仍可经 ecrecover（如 ERC-2612 permit）授权，提议在账户有代码时让 ecrecover 返回 0；状态为 Hegotá CFI | [16] Motivation；[7] Considered 列表 | observed |  |
| E34 | EF 把 EIP-8151 与 EIP-8298 合称“k1 exit”包，把 EIP-8365 称为“The one PQ item that belongs in Hegotá” | [4] 分级表 8151、8298、8365 行 | observed | F11 |
| E35 | strawmap 于 2026-08-19 在 J* 加入 MV-PQ（PQ heartbeat、leanDA、leanSPHINCS） | [6] Aug 19 条目；[3] “Two cadences”段 | observed | N |
| E36 | strawmap 2026-10-05 标注 I*=2028、J*=2028–29、K*=2029、L*=2029–30 | [6] Oct 5 条目“dates” | observed | N |
| E37 | strawmap 2026-10-09 把“post quantum L1”和“leanXMSS PQ attestations”从 L* 移到 K* | [6] Oct 9 条目 | observed | N |
| E38 | pq.ethereum.org 的路线表（2026-06-27，I*→J*→L*→M*）落后于 strawmap 之后的调整 | 由 E35、E37 与 [1] Roadmap 表 / Last updated 推出 | inferred | N |
| E39 | strawmap 自述为 strawman、“not a prediction”，最终方向由 ACD 决定 | [5] “Why the strawmap name”；[1] 路线表下方声明 | observed | N |
| E40 | EF 认为共识层不能依赖密码学敏捷性，组件要等完整 PQ 设计后再上线 | [3] III 节 Post-quantum 段 | observed |  |
| E41 | MV-PQ 是“temporary safeguard … with reduced guarantees”，完整经济终局性还需要 PQ attestations | [3] “MV-PQ is a temporary safeguard” | observed |  |
| E42 | EIP-8292（Draft，2026-06-07）设立 opt-in 聚合者，用 leanVM 证明替代 BLS 聚合；当前签名约 1.17 KiB，聚合证明 127–344 KiB | [18] Abstract 与 Motivation | observed |  |
| E43 | leanVM README 写“128-bit ROM (64-bit QROM) soundness”，并写明“not (yet) production ready” | [19] README security 节 @127510d1 | observed | F11 |
| E44 | leanVM 的哈希“BLAKE2s is a placeholder”，ZK 支持在规划中，已从 KoalaBear / Poseidon 迁到 192-bit 二进制域 + WHIR | [19] README“work in progress”与“SNARK machinery”节 | observed | F11 |
| E45 | leanVM 基准（M4 Max）：900 个 XMSS 聚合，证明 317.4 KiB、0.545 s、验证 3.977 ms，参数非最终 | [19] README“XMSS aggregation”节 | observed |  |
| E46 | leanSig@c08a3bae 用 KoalaBear 域上的 Poseidon1，自述原型、未审计、不应用于生产 | [20] README Disclaimers / Schemes；src/lib.rs 的 type F = KoalaBear | observed |  |
| E47 | Vitalik 称所选哈希可能是“Ethereum’s last hash function”，候选为 Poseidon2 加额外轮数、Poseidon1、BLAKE3 | [23] “Consensus-layer signatures”段 | observed |  |
| E48 | Ethereum 的“规范哈希函数”尚未选定，签名库与 leanVM 当前用的哈希不一致 | 由 E16、E44、E46、E47 推出 | inferred | F11 |
| E49 | PQ DA 的替代方案仍在研究，leanDA 用 RS 码 + Poseidon Merkle 承诺 + leanVM 证明编码正确 | [2] DA 节“still being researched”；[22] §1、§3 | observed |  |
| E50 | Vitalik 把 KZG 承诺与证明、应用层 ZK 证明（KZG 或 Groth16）列为量子脆弱面 | [23] 开头列表 | observed |  |
| E51 | ethereum.org 称 KZG 可信设置对事后量子攻击也安全，与 E50 及 leanDA 帖矛盾 | [2] DA 节“Current mitigation”；[23]；[22] §1 | observed | F4 |
| E52 | 量子攻击者可从公开的 τ·G1（g1_monomial）用 Shor 求出 τ，从而破坏 KZG 绑定性；仪式只防经典攻击者 | 由 E11、E50 与 [33] trusted_setup_4096.json 的 g1_monomial 推出：KZG 陷门是离散对数 | inferred | F4、S |
| E53 | Vitalik 给出的 gas 量级：ECDSA 验签 3000，哈希签名约 200k，SNARK 300–500k，PQ STARK 约 10M（对 L2 不可接受） | [23] “EOA signatures”与“Proofs”段 | observed | F16 |
| E54 | EF 的实时证明定义要求 ≥128 bit、≤300KiB，且不得使用带可信设置的递归包装 | [37] “working definition”列表与前一段 | observed |  |
| E55 | EF zkEVM 128-bit 可证明安全里程碑 M3 改到 2026-12 初 | [38] zkevm.ethereum.foundation 2026-02-11“M3 Deadline Updated” | observed |  |
| E56 | Vitalik 2024-03 的紧急分叉方案：回滚、禁用 EOA 交易、引入合约钱包交易、用 STARK 证明哈希原像与地址的对应关系后迁移 | [24] 编号列表 1–4 | observed | N |
| E57 | ethereum.org 写 EF 于 2026-01 成立 PQ Security 团队（Thomas Coratger 领导），设 $1M Poseidon Prize | [2] “The Ethereum Foundation's approach”与 Current activity | observed |  |
| E58 | “EF 200 万美元 PQ 团队”是媒体把两个 100 万美元奖项合计后的说法，没有官方团队预算 | [39] 各媒体正文；[2] 只列 Poseidon Prize $1M | observed |  |
| E59 | pq.ethereum.org 给 L2 的建议是保护排序器 / 管理员密钥、桥与跨链消息、AA 用户账户、zk-rollup 的证明系统，并称协议演进“chain-specific” | [1] FAQ“Ecosystem & Broader Context” | observed | F12 |
| E60 | ethereum.org 对应用层 ZK 证明的方案是依靠生态自然转向 STARK，不在 L1 协议里替代 | [2] “4. Application-layer ZK-proofs”的 approach 段 | observed | F12 |
| E61 | EIP-4844 用版本化哈希为“Merkle + STARK”的 PQ 切换预留接口，rollup 无需 EVM 级改动，只需切换交易类型 | [30] Rationale“Versioned hashes & precompile return data” | observed | F12、Q |
| E62 | EIP-8151 说明：L2 故障证明若在 L1 重执行 ecrecover 会出错，L2 采纳时须用自身账户代码做检查 | [16] “Cross-Domain / L2 Fault Proof Implications” | observed | F12 |
| E63 | L2 会随 L1 自动获得共识层与 blob DA 的 PQ 升级，前提是继续在 L1 结算、用 blob，并切换到新的 blob 交易 / 承诺版本 | 由 E40、E49、E61 推出 | inferred | F12 |
| E64 | L2 在 L1 上的 Groth16 / PLONK（BN254）验证器、L2 自身账户规则、桥与升级合约的管理密钥不会因 L1 升级而自动 PQ 化 | 由 E14、E50、E59、E60 推出：L1 路线只覆盖 L1 协议层，并把这些点列为 L2 自己的责任 | inferred | F12 |
| E65 | EVM-equivalent L2 若要获得 8141 / 8151 这类账户层 PQ 能力，需要在自己的链上硬分叉跟进 | 由 E23、E33、E62 推出：这些是执行层协议改动，L2 执行客户端须自行激活 | inferred | F12、Q |
| E66 | 在协议层聚合（如 EIP-8288）落地前，L2 若把最终证明直接换成 PQ STARK 在 L1 验证，成本约 10M gas 量级 | 由 E32、E53 推出；EIP-8288 尚未进入任何分叉，落地时间不确定 | speculative |  |
| E67 | ethereum.org 写 8141“being considered for Hegotá in second half of 2026”，已过时 | [2] EOA 节；对照 [7] SFI 与 [8] Q2 2027 | observed |  |
| E68 | ethereum.org 写哈希签名“roughly 3,000 bytes”、leanVM 压缩 250x，与 EIP-8292 的约 1.17 KiB 口径不一致 | [2] Consensus 节；[18] Motivation | observed | R |
| O1 | 截至 2026-10-16，Starknet Migration Register 仍标“Last updated: 19 August 2026” | [4] 页面页脚“Last updated: 19 August 2026.” | observed | O、F13 |
| O2 | starknet.io 博客最新一篇为 2026-08-07《Starknet’s Upgrade to Quantum Resistance》，10 月没有新文章 | [5] 列表首条“Aug 7, 2026” | observed | O |
| O3 | Starknet 官方不认为整条链抗量子；已上主网的 PQ 相关项只有 v0.14.3 的 OS hash（BLAKE2s），外加 Falcon 账户主网演示 | 见 starknet-account-model 台账 C1、C22、R19、R28 | observed | O、F13 |
| O4 | Aztec PQ 博客发布于 2026-10-15，作者 Zac Williamson、Mike Connor | [1] 页面 HTML“Oct 15th, 2026”“Written by Zac Williamson, Mike Connor” | observed |  |
| O5 | Aztec 两个目标：2027-02 交付强化库与防 HNDL 的开发模式，2030 完成全面 PQ 迁移 | [1] “February 2027: Hardened libraries…”；“2030: a full post-quantum migration.” | observed | O、F14 |
| O6 | Aztec 选型节点：2027-03 签名、2027-07 公钥加密（含 constrained delivery 基准）、2027-11 证明系统 | [1] “Our proposed selection milestones are: March 2027…July 2027…November 2027…” | observed | O、F14 |
| O7 | Aztec 列出的 Ethereum 层需求：不用 BLS12-381 KZG 的 DA、替代 BN254 预编译的廉价 PQ SNARK 验证原语、EOA 与 BLS 密钥 | [1] “Ethereum changes required” 一节 | observed | F13 |
| O8 | Aztec 称快速 PQ 证明系统的证明约 300KB，而它当前证明约 20kb | [1] “Aztec’s 20kb proofs are ‘ok’…Post-quantum proof systems (the fast ones)…~300KB” | observed | O |
| O9 | Aztec 作者估计 2-to-1 证明聚合需在现代 CPU 上约 20–100ms 才可行 | [1] “two-to-one aggregation in roughly 20–100 milliseconds on a modern CPU could make it practical” | observed | O |
| O10 | Aztec 计划把地址里的密钥外置到 canonical keystore registry，地址变为单纯的哈希 | [1] “Baking Bad” 一节 | observed | O |
| O11 | Aztec 计划长期用 Blake2s 或 Blake3 替换 Poseidon2，并大概率跟随 EF 的选择 | [1] “We will likely replace it with either Blake2s or Blake3…follow their lead” | observed | O |
| O12 | Aztec 作者认为 4 年内出现 Q-day 不太可能 | [1] “I think Q-day within four years is unlikely” | observed | O |
| O13 | Aztec 已支持链下 note 投递与 constrained delivery，大多数协议公钥被哈希且不对合约暴露 | [1] “Aztec Public Keys are hashed”“offchain note delivery”“Constrained Delivery” 各节 | observed | F14 |
| O14 | Aztec 的 6 类协议密钥都在 Grumpkin 曲线上且不可轮换；签名密钥由账户合约定义、可轮换 | [2] Key Types 表“Rotatable: No”；“All keys use elliptic curve cryptography on the Grumpkin curve” | observed |  |
| O15 | Aztec 地址 = (pre_address·G + Ivpk_m).x，只有 Ivpk_m 仍以椭圆曲线点参与地址派生 | [2] Address Derivation 一节 | observed |  |
| O16 | Aztec 博客中 MIKE 论文的链接域名为 eprint.iacr.asia，论文实际位于 eprint.iacr.org/2026/2377 | [1] 正文 MIKE 链接；[38] | observed |  |
| O17 | Optimism Superchain PQ 路线由 Karl Floersch 于 2026-01-14 发布 | [3] 页面 HTML 作者与“January 14, 2026” | observed |  |
| O18 | OP Labs 承诺到 2036-01 弃用 ECDSA 签名的 EOA 交易，但需经治理批准 | [3] “10‑year timeline…subject to governance approval. By January 2036…” | observed | O |
| O19 | Optimism 路线中 L2 sequencer 与 batch submitter 将改用 PQ 签名 | [3] “The L2 sequencer and batch submitter will transition off ECDSA signatures to post‑quantum signatures.” | observed | O、F13 |
| O20 | Optimism 尚未选定具体 PQ 签名方案 | [3] “The specific post‑quantum signature scheme is not yet decided.” | observed | O、F13 |
| O21 | Optimism 路线原文没有提到 proposer / challenger、故障证明或 L1 合约升级权限的 PQ 计划 | [3] 全文只列 EOA、sequencer、batch submitter、Ethereum BLS/KZG | observed | O、F13、S |
| O22 | Mantle 若跟随 Superchain 路线，其 proposer、L1 合约 owner 与 verifier 更换权限的 PQ 化需自行补充 | 由 O21、O33 推出：OP 路线不覆盖这些角色，OP Succinct 合约又引入 owner 与 proposer | inferred |  |
| O23 | Algorand 原生 Falcon-1024 账户随 algod v5.0.0（共识 v42）上线主网，时间为 2026-08 | [9] “part of the v42 consensus upgrade, shipped in algod v5.0.0”；[11] “live on Mainnet as of August 2026” | observed | F13 |
| O24 | Algorand v5.0.0 于 2026-08-12 发布，2026-08-15 达到 90% 支持阈值，之后需约 7 天冷却 | [13] published_at 2026-08-12T14:30:21Z；[8] “90% support threshold on August 15…208,000 round (~7 day)” | observed |  |
| O25 | Algorand 原生 PQ 账户的主网激活日约为 2026-08-22 | 由 O24 推出：8-15 加约 7 天冷却期 | inferred |  |
| O26 | Algorand rekey 到 PQ 地址后地址不变，且只有 Falcon 密钥能授权 | [9] “Your public address stays the same; from that point on, only the Falcon key can authorize” | observed | O |
| O27 | Algorand 自 2022 年起用 Falcon 签名 State Proofs（每 256 轮一次） | [11] State Proofs 段落 | observed | F13 |
| O28 | Algorand 的 VRF 与参与密钥仍基于椭圆曲线 / Ed25519，PQ VRF 论文目标 2027 年初 | [11] VRF 段落与“Participation relies on…Ed25519” | observed |  |
| O29 | Algorand 于 2026-06-18 宣布到 2027 年底实现“broad quantum resilience” | [12] 新闻稿首段 | observed |  |
| O30 | BIP-360 现名 P2MR，状态 Draft，不引入 PQ 签名，只防长暴露攻击 | [14] 头部、Changelog 0.11.0、Abstract“does not include the introduction of post-quantum signature schemes” | observed |  |
| O31 | BIP-361 为 Draft / Informational：激活后约 3 年禁止向旧脚本付款，再过 2 年限制 ECDSA/Schnorr 花费、改走救援协议 | [15] Specification 表 Phase A、B | observed |  |
| O32 | 暴露公钥的 BTC 规模各方口径差异大（1.7M–8.18M），不能当作单一事实 | [16] Risq List 8,177,337 BTC；[17] 约 1.7M（P2PK）；Project Eleven 早期 6.2M | observed | R |
| O33 | OP Succinct 的 L1 合约通过 ISP1Verifier.verifyProof 验证聚合证明，verifier 地址可由 owner 更换 | [30] proposeL2Output 中的 verifyProof 调用；`updateVerifier … onlyOwner` @e5b6687 | observed |  |
| O34 | OP Succinct 的 proposer 按 tx.origin 白名单判断，超时后允许任何人提交 | [30] `approvedProposers[tx.origin] \|\| approvedProposers[address(0)] \|\| (block.timestamp - lastProposalTimestamp() > fallbackTimeout)` | observed |  |
| O35 | SP1 用 Gnark 的 BN254 Groth16/PLONK 包装 STARK 证明，供链上验证 | [26] “Groth16, PLONK, and the Zero-Knowledgeness of SP1” 一节 | observed | F10 |
| O36 | SP1 Hypercube 假设 KoalaBear 七次扩域上椭圆曲线的离散对数困难 | [26] “SP1 assumes that the discrete logarithm problem on the elliptic curve over the degree-7 extension of KoalaBear is computationally hard” | observed | F10、S |
| O37 | SP1 当前的端到端链上验证路径不具备 PQ 安全 | 由 O35、O36 推出：外层 BN254 配对与内层椭圆曲线离散对数都会被 Shor 攻破 | inferred | F10 |
| O38 | Succinct 计划把 VEIL 集成进 SP1，以哈希型包装替换 Groth16 包装，但没有给出日期 | [27] “Once integrated into SP1, VEIL will replace the Groth16 wrapper with a hash-based one.” | observed | F16 |
| O39 | ZKsync Airbender 在链上验证的是 FFLONK 包装后的证明，端到端同样依赖椭圆曲线 | [35] “Stage 6 - SNARK Wrapper…FFLONK proof which gets posted and verified onchain” | observed |  |
| O40 | Lattice Jolt 于 2026-09-09 发布：Akita 基于 Module-SIS，证明 <100KB，零知识尚未完成 | [31] datePublished 2026-09-09；正文“under 100 KB”“A companion paper, coming shortly, adds zero knowledge” | observed |  |
| O41 | Solana Foundation 称 Anza 与 Firedancer 都选中 Falcon；三步路线没有时间表，属研究阶段 | [18] Falcon 段落与“Recap of the current quantum roadmap” | observed |  |
| O42 | Anza 提议把 Alpenglow 的 BLS 投票签名换成 Falcon 等 PQ 方案，并声明不构成承诺 | [19] Consensus 段落；免责声明“None of this constitutes a commitment” | observed |  |
| O43 | Solana Winternitz Vault 是应用层的一次性哈希签名金库，作者自述未审计 | [20] README 机制说明与免责声明 | observed |  |
| O44 | Zcash NU6.3 于主网高度 3,428,143 激活，ZIP 2005 的可恢复 note 自此对 Ironwood 池强制生效 | [24] ACTIVATION_HEIGHT 3428143；[23] “enforced from NU6.3” | observed | F13 |
| O45 | NU6.3 的激活日期为 2026-07-28 | [25] S-1 原文“On July 28, 2026, Zcash developers activated…(NU6.3)” | observed | F13 |
| O46 | ZIP 2005 本身不让 Zcash 抗量子，Recovery Protocol 尚未进入共识，Sapling/Orchard 资金在旧池关闭后无法恢复 | [23] Abstract 与“It is not required to add support for the Recovery Protocol…” | observed | F13 |
| O47 | Sui 计划 2026 年 SLH-DSA 金库上主网、ML-DSA-65 年底上测试网、原生 PQ 账户最晚 2027Q1 上主网；地址别名已部署 | [32] “Status and timeline” 段原文 | observed |  |
| O48 | EdDSA 链可以通过零知识证明种子知识迁移到 PQ 密钥且不换地址，ECDSA 链不具备这一结构 | [33] Abstract 与 Figure 1 说明 | observed |  |
| O49 | EVM 链（ECDSA）无法直接套用 Sui/Solana 的种子证明迁移，旧账户救援需要依赖 BIP-32 hardened 派生之类的其他凭据 | 由 O48、O31 推出：ECDSA 私钥不是由种子哈希派生；BIP-361 救援示例为 BIP-32 hardened 派生证明 | inferred |  |
| O50 | QRL 主网自 2018 年起使用 XMSS；QRL 2.0 尚无主网日期 | [34] “We have not yet set a mainnet date.” | observed |  |
| O51 | 未找到 Arbitrum / Offchain Labs 的官方 PQ 路线，只有其研究者的 BLS 瞬时量子安全论文 | [37] eprint 2026/1660；Offchain/Arbitrum 官方渠道的检索结果中未见路线文档 | speculative | R |
| O52 | 未找到 Polygon 与 Scroll 的公开 PQ 计划 | 本路对 polygon.technology 博客与 docs.scroll.io 的检索结果中未见（检索有限） | speculative | R |
| O53 | Algorand 的 rekey 让旧 Ed25519 钥匙失去授权权，EIP-7702 委托后旧 ECDSA 钥匙仍有权限，因此 OP 路线需要靠协议级弃用 ECDSA 交易兜底 | 由 O26、O18 及 starknet-account-model 台账 A55–A56 推出 | inferred | O |
| O54 | 截至 2026-10-16，没有任何调研项目实现全栈 PQ；已上主网的只有账户层、历史证明或可恢复格式等局部组件 | 由 O3、O23、O27、O28、O30、O37、O41、O44、O46 推出 | inferred | O、F13 |
| O55 | 各项目都把共识签名聚合、DA 承诺与 L1 结算排在最后或交给 Ethereum | 由 O7、O19–O21、O28、O42 及台账 R18 推出 | inferred | F13 |
| O56 | GPT 为“Algorand v5.0.0 上线”引用的 Falcon 技术简报不支持该说法，属引用错位 | [40] §6.4 引用链接；对照 [8][11] | observed | S |
| O57 | Mantle 可以在不等 Ethereum 的情况下，在应用层先提供防 HNDL 的库与模式（参照 Aztec 2027-02 目标） | 由 O5、O13 推出：这部分属于应用层，Aztec 也不依赖 Ethereum 完成；能否适用于 Mantle 的业务需评估 | speculative |  |
| M1 | 截至 2026-10-16，L2BEAT 把 Mantle 归为 Stage 0 的 ZK Rollup，gas token 为 MNT | [1] Summary：“Stage: Stage 0”“Type: ZK Rollup”“Gas token: MNT” | observed |  |
| M2 | Mantle 于 2025-09-16 开始用 OP Succinct 的 ZK 证明提交状态根 | [3] Phase 1 “After Sep 16, 2025 ~15:00 UTC… ZK proofs”；[1] Milestones 2025-09-16 | observed |  |
| M3 | 2025-09-23 起提款最终化期从 7 天改为 12 小时，官方称 12 小时是应急安全缓冲 | [3] “From a 7-Day to a 12-Hour Withdrawal” 与 “Why do we choose 12 hours?” | observed |  |
| M4 | Mantle 当前在 L1 用 SP1Verifier `0xc3c6dDDAc8829b233Dc6536Ec024775a57b0AF2A` 验证证明 | [1] Prover 一节 Onchain verifiers；[1] Smart contracts “SP1Verifier (v6.1.0)” | observed |  |
| M5 | 该 verifier 是 SP1 Hypercube v6.1.0 的 gnark PLONK 包装，曲线为 BN254 | [2] “Plonk: Gnark – SP1 Hypercube Plonk v6.1.0 … Known deployments 0xc3c6… used in Mantle”；Final wrap “BN254 (curve)” | observed |  |
| M6 | Mantle 的 PLONK 包装用 Aztec Ignition（2019，176 人）作为 KZG trusted setup | [2] Trusted setups “Aztec Ignition … KZG commitment over BN254 … 176 participants”；[17] Trusted Setup 一节 | observed |  |
| M7 | 2026-05-05 起，Oracle 通过 SP1VerifierGateway `0x3B6041173B80E77f038f3F2C0f9744f04837185e` 按路由验证证明 | [1] Ossification 2026-05-05 “moved from a single SP1Verifier to a gateway-based verification system” | observed |  |
| M8 | L2BEAT 2026-05-05 的记录称网关仍登记着旧的 sp1turbo verifier（`0x0459d576…`）；该记录已过时，见 K8 | [1] 2026-05-05 更新 “legacy sp1turbo verifier … still registered in the gateway's activeVerifiers” | observed | R |
| M9 | SP1VerifierGateway 的 owner 是 Succinct 共享的 2/3 Safe `0xCafEf00d348Adbd57c37d1B77e0619C6244C6878`，可以添加或冻结路由 | [1] Permissions “SP1VerifierGatewayMultisig … 2/3 … add and freeze verifier routes”；Used in Celo、Lens 等 | observed |  |
| M10 | Mantle fork 的 Oracle 只允许 challenger 开关 optimistic 模式，开启时 finalization ≥ 7 天，关闭时 ≥ 1 小时 | [14] `enableOptimisticMode` / `disableOptimisticMode` 中的 `require(msg.sender == challenger)` 与 `>= 7 days` / `>= 1 hours` | observed |  |
| M11 | optimistic 模式下的 proposeL2Output 不验证任何证明 | [14] `proposeL2Output(bytes32,uint256,bytes32,uint256) whenOptimistic`，函数体中没有 verifyProof | observed |  |
| M12 | ZK 模式下的 proposeL2Output 调用 verifier.verifyProof(aggregationVkey, publicValues, proof)，publicValues 绑定 l1Head、前后状态根、rollupConfigHash 和 rangeVkeyCommitment | [14] proposeL2Output(bytes32,uint256,uint256,bytes) 函数体 | observed | F2 |
| M13 | Oracle owner 可以单方面更换 verifier 地址、vkey、rollupConfigHash 和 proposer 白名单 | [14] `updateVerifier`、`updateAggregationVkey`、`updateRangeVkeyCommitment`、`updateRollupConfigHash`、`addProposer` 均为 onlyOwner；[1] Oracle owner = MantleSecurityMultisig | observed | F2 |
| M14 | 上游 op-succinct main 由 onlyOwner 切换 optimistic 模式并带 fallbackTimeout，Mantle fork 与之不同 | [15] `enableOptimisticMode … onlyOwner`、`fallbackTimeout`；对比 [14] | observed |  |
| M15 | L2BEAT 认为 SecurityMultisig 也能切换 optimistic 模式，这与 fork 代码只允许 challenger 不一致 | 由 M10、[1] Permissions “MantleSecurityMultisig … can toggle between the optimistic mode” 推出：可能是 owner 通过升级间接实现，或 L2BEAT 描述不精确 | inferred |  |
| M16 | MantleSecurityMultisig `0x4e59e778a0fb77fBb305637435C62FaeD9aED40f` 是 6/14 的 Safe | [1] Permissions “A Multisig with 6/14 threshold”；2026-01-21 更新 “threshold now 6 of 14” | observed |  |
| M17 | SecurityMultisig 经 ProxyAdmin `0xca35…7794` 无延迟升级 Oracle、SystemConfig、L1CrossDomainMessenger、L1StandardBridge、OptimismPortal | [1] Permissions “Can upgrade with no delay” 列表 | observed |  |
| M18 | L2BEAT 判定 Mantle 没有退出窗口，恶意升级可直接盗取资金（CRITICAL） | [1] Risk summary 1 与 Exit window “None” | observed | F2、Q |
| M19 | MantleEngineeringMultisig `0x2F44BD2a54aC3fB20cd7783cF94334069641daC9` 是 3/7 Safe，担任 Oracle challenger 和 OptimismPortal guardian（可暂停提款） | [1] Permissions MantleEngineeringMultisig 一节；OPSuccinctL2OutputOracle Roles “challenger”；OptimismPortal Roles “guardian” | observed |  |
| M20 | batcher 是单个 EOA `0x2f40D796917ffB642bD2e2bdD2C762A5e40fd749`，proposer 是单个 EOA `0x6667961f5e9C98A76a48767522150889703Ed77D` | [1] Permissions EOA 1 / EOA 2；Tracked transactions | observed |  |
| M21 | 只有白名单 proposer 能发布状态根，proposer 停摆时提款会冻结 | [1] Proposer failure “Cannot withdraw”；[14] approvedProposers 检查，没有 fallbackTimeout | observed |  |
| M22 | MNT 代币合约由 SecurityMultisig 经 1 天 Timelock 升级，owner 可每年增发至多 2% | [1] Permissions “L1MantleToken [via: TimelockController with 1d delay]”“mint new MNT (up to 2% of supply per year)” | observed |  |
| M23 | 当前 DA 只有 Ethereum blobs，blob 提交到 inbox `0xFFEEDDCcBbAA0000000000000000000000000000` | [1] Badges “Ethereum with blobs”；Data posted 一节；Milestone 2026-04-16 “DA is Ethereum only” | observed | S |
| M24 | 2025-03-19 Mantle 用 EigenDA 替代 MantleDA | [1] Milestone 2025-03-19；[13] v1.1.1 “activating EigenDA on the Mantle mainnet, replacing the MantleDA” | observed |  |
| M25 | 2026-01-21/22 起 blobs 成为主 DA，但当时仍可经 Hydro 在链下发往 EigenDA | [1] 2026-01-21 更新 “isUsingEigenDA: false … can still post to EigenDA offchain via Hydro”；[24] 2026-01-22 “Ethereum blobs as its primary DA layer” | observed |  |
| M26 | Arsia 的证明程序删除了 EigenDA 路径，只保留 Ethereum 路径 | [1] 2026-04-16 更新 “programs/range/eigenda/ … are gone, only programs/range/ethereum/ remains” | observed |  |
| M27 | Arsia 在 L2 主网的激活时间是 2026-04-22 07:00 UTC，L1 SystemConfig 升级交易在 2026-04-16 | [6] “timestamp 1776841200 … April 22, 2026, 07:00:00 UTC”；[1] Past upgrades 2026-04-16 06:58 UTC | observed |  |
| M28 | Mantle 官方 Overviews 页仍把 EigenDA 写成 DA 模块，属于过时描述 | [12] Overviews “Independent DA modules, such as EigenDA … more than 90%”；对比 M23 | observed |  |
| M29 | Mantle 的提款证明只依赖 keccak 哈希和 output root，不依赖签名 | [23] proveWithdrawalTransaction “keccak256 hash of the outputRootProof … inclusion proof” | observed |  |
| M30 | OptimismPortal proxy 为 `0xc54cb22944F2bE476E02dECfCD7e3E7d3e15A8Fb`，L1StandardBridge proxy 为 `0x95fC37A27a2f68e3A647CDc081F0A89bb47c3012` | [1] Smart contracts 一节 | observed |  |
| M31 | Skadi 升级让 Mantle 支持 Prague，包括 EIP-7702 SetCode 交易 | [8] “support all features of the Ethereum Prague upgrade … EIP-7702: Supports SetCode TX” | observed |  |
| M32 | Skadi 主网发布在 2025 年 8 月（GitHub release 2025-08-15；Messari 记为 08-27） | [13] “1.3.1 Mainnet Skadi 15 Aug”；[29] Event Date August 27, 2025 | observed |  |
| M33 | Mantle 先用 RIP-7212 启用 P-256 预编译，Limb（2026-01-14）改为 EIP-7951，gas 从 3450 调到 6900 | [9] EIP-7951 条目原文与 “scheduled to occur at 2026-01-14 07:00:00 UTC” | observed | F15 |
| M34 | 当前生产执行客户端是 Mantle 的 op-geth fork（Arsia 时为 v1.5.4），op-node rebase 到 OP v1.16.3 | [6] “Bumped op-geth to v1.5.4”；[5] “rebased on Optimism op-node v1.16.3” | observed |  |
| M35 | Elysium 只在测试网，EL 基于 go-ethereum v1.17.3，不激活 Amsterdam EVM | [11] Overview 与 “Ethereum L1 Glamsterdam Compatibility” 一节 | observed |  |
| M36 | Mantle 的 Rust 栈（kona / mantle-xyz/reth）只在源码层推进，没有看到上线主网的公告 | [30] MANTLE_CHANGES.md Phase 表（Phase 2 op-succinct ⏸️）；[6] 生产仍用 op-geth | inferred |  |
| M37 | Mantle 不是 Superchain 成员 | [22] chainList.json 中没有 chainId 5000 / Mantle | observed | O |
| M38 | Optimism 2026-01-14 宣布在 2036 年 1 月前弃用 ECDSA EOA（需治理批准），PQ 签名方案未定 | [21] “10‑year timeline … subject to governance approval”“By January 2036”“not yet decided” | observed |  |
| M39 | Optimism 计划把 L2 sequencer 和 batcher 的签名迁到 PQ，并对 “participating OP Stack chains” 协调硬分叉 | [21] Consensus 一节与 “How we'll ship this” 第 2 条 | observed |  |
| M40 | Optimism 的 PQ 路线不会自动约束 Mantle，Mantle 只能在继续 rebase OP Stack 代码时复用相关改动 | 由 M37、M39、[5] Arsia 自行命名并一次性追平 OP 分叉推出 | inferred | O |
| M41 | SP1 用 gnark 的 Groth16 或 PLONK（BN254）把 STARK 压成 SNARK 后在链上验证，并依赖其全部假设 | [17] “Groth16, PLONK, and the Zero-Knowledgeness of SP1” 一节 | observed |  |
| M42 | SP1 Hypercube 的内层哈希是 KoalaBear 域上的 Poseidon2，FRI 依赖已证明的 proximity gap 定理 | [17] “Hash Functions and the Random Oracle Model”“Conjectures for FRI's Security” | observed |  |
| M43 | SP1 Hypercube 的内存论证假设 KoalaBear 7 次扩域上的椭圆曲线 DLP 困难 | [17] “Security of Elliptic Curves over Extension Fields … used in our new memory argument” | observed |  |
| M44 | SP1 内层不是纯哈希型，它的 ECDLP 假设在 Shor 下不成立 | 由 M43 推出：DLP 类假设是 Shor 的直接目标（量子依据见 threat 路） | inferred |  |
| M45 | 扩域 ECDLP 被量子攻破后，SP1 的 STARK 层证明可以被实际伪造 | 没有找到公开分析，仅由 M44 引出的猜测 | speculative | R |
| M46 | Mantle 的最终 L1 验证依赖 BN254 配对与 KZG，在量子下可能被伪造证明 | 由 M5、M6、M41 推出：PLONK/KZG 属于配对 / 离散对数类假设（量子依据见 threat 路）；[19] Succinct 也承认 “L2s … proofs rely on the same quantum-vulnerable cryptographic primitives” | inferred |  |
| M47 | Mantle 的所有升级和关键开关最终都归结为 Safe 签名人的 secp256k1 ECDSA 私钥 | 由 M13、M17、M19、M9 推出：升级、换 verifier、切 optimistic、暂停提款、改路由都只需多签授权 | inferred |  |
| M48 | Mantle 用户的 7702 委托不会消除原 EOA 私钥的量子风险 | 由 M31 与 starknet-account-model 台账 A53–A56 推出（7702 授权用 ecrecover，委托后原私钥仍能发交易和重新委托） | inferred |  |
| M49 | Mantle 的 DA 继承 Ethereum blob KZG（BLS12-381），v1.4.2 节点用 KZG 承诺校验 blob | [9] op-node “update the blob verification logic to use KZG commitments”；[27] KZG “rely on elliptic curve pairings” | observed |  |
| M50 | 没有找到 Succinct 公开的“替换 BN254 包装 / 在 L1 直接验证 PQ 证明”时间表 | [17] 仍只描述 BN254 包装；[18] 文章列表中只有 VEIL、Flock 等研究；[20] cuPQC 是 GPU 原语加速 | observed |  |
| M51 | Succinct 的 VEIL / Flock 未来会成为 SP1 生产版的 PQ L1 验证路径 | [28] 第三方 qrindex 把 VEIL 视为路线信号；Succinct 没有给出时间表 | speculative | R |
| M52 | EigenLayer / EigenDA 的 BLS 实现基于 BN254 | [25] BN254.sol “Contains BN254 parameters … and BLS signature functionality” | observed |  |
| M53 | EigenDA 的 KZG 承诺也在 BN254 上 | [26] 仓库目录 `crypto/ecc/bn254`、`encoding/kzg`，由此推断 | inferred |  |
| M54 | EigenDA 已不在 Mantle 的 DA 关键路径上，它的密码学对 Mantle 当前状态安全没有直接影响 | 由 M26、M23 推出 | inferred |  |
| M55 | 在 Mantle 官方文档、官网和新闻稿中没有找到任何 PQ / 量子相关的路线或表态 | [12] llms.txt 索引中没有相关条目；对 mantle.xyz / forum.mantle.xyz 的 quantum 检索无结果 | observed |  |
| M56 | 第三方 qrindex 把 Mantle 评为 PQ 迁移 Stage 0（Unaware），QRI 27/100（2026-06-05） | [28] “LayerQu independently scores Mantle at Migration Stage 0 (Unaware) with QRI 27/100 as of 2026-06-05” | observed |  |
| M57 | L2BEAT 的 TVS 中约 48.6% 带有额外信任假设（外部桥或原生铸造） | [1] Summary “48.6% with additional trust assumptions” | observed |  |
| M58 | 量子攻击者若拿到 3/7 EngineeringMultisig 的阈值密钥，可以把系统切到无证明模式，但至少要等 7 天 finalization 才能兑现 | 由 M10、M11、M19 推出 | inferred |  |
| M59 | Mantle 的 batcher、proposer 等运营密钥托管在 HSM/KMS 中 | 只有 [6] v1.5.4 “Fixes to … HSM signer” 这一间接线索，部署情况没有公开 | speculative | R |
| M60 | Mantle 会跟随 Optimism 的 PQ 硬分叉节奏 | 没有找到任何公开信息，与 M37 相反的方向也没有证据 | speculative | R |
| K1 | Mantle 的 L1 状态提交合约是 OPSuccinctL2OutputOracle（0x31d5…f481，version 2.0.1），当前 optimisticMode = false | `cast call` version() / optimisticMode()，2026-10-16 [2]；L2BEAT discovered.json [1] | observed | F2 |
| K2 | 2026-10-15 的最近一次状态提交附带 964 字节证明，路由到 SP1 v6.1.0 的 PLONK verifier（0xc3c6…AF2A） | tx 0xeae80e60…；gateway routes(0x5a093a2f)；VERSION()=v6.1.0；Sourcify `SP1VerifierPlonk.sol` [2][4] | observed | F10、F2、S |
| K3 | Mantle 在 L1 上最终验证的是 BN254 上的 PLONK 证明，验证依赖 BN254 配对预编译 | 由 K2 与 Sourcify 合约名 SP1VerifierPlonk、字节码含 0x08 预编译调用 [4] 推出 | inferred | F10、F2 |
| K4 | 一次状态提交在 L1 消耗约 43 万 gas（2026-10-15 样本 431,530） | `cast receipt 0xeae80e60… gasUsed` [2] | observed | F16 |
| K5 | 状态根由一个被批准的 EOA proposer（0x6667…Ed77D）提交，不是无许可提交 | approvedProposers(0x6667…)=true、approvedProposers(0x0)=false、`cast code` 为空 [2] | observed | F4、F2 |
| K6 | SP1VerifierGateway 由 Succinct 的 2/3 Safe（0xCafE…6878）拥有，它可以随时添加或冻结验证器路由 | owner() / getThreshold() / getOwners() [2]；SP1VerifierGateway.sol 的 onlyOwner addRoute / freezeRoute [3] | observed | F16 |
| K7 | Gateway 接受任何“已添加且未冻结”的路由；证明用前 4 字节自选路由 | SP1VerifierGateway.sol `verifyProof` [3] | observed | F9、F16 |
| K8 | 该 Gateway 历史上添加过 12 个路由、冻结了 11 个，目前只有 v6.1.0 一个路由有效；v5.0.0、v6.0.0 在 2026-10-09 前后被冻结 | Blockscout getLogs RouteAdded / RouteFrozen，区块 20233410–26152991 [2] | observed | F9、R、S |
| K9 | 如果将来加入 PQ verifier 路由而不冻结旧的 PLONK 路由，Gateway 的接受逻辑等同于“旧证明 OR 新证明” | 由 K7 推出：路由之间没有 AND 关系，任一未冻结路由通过即接受 | inferred | F9 |
| K10 | Mantle 全部 L1 核心合约（Portal、Bridge、Messenger、SystemConfig、Oracle）的升级权在 ProxyAdmin，其 owner 是 6/14 的 MantleSecurityMultisig | ProxyAdmin.owner()；Safe getThreshold()=6、owners=14；discovered.json 中各合约 $admin=ProxyAdmin [1][2] | observed | F2 |
| K11 | ProxyAdmin 的 owner 直接是 Safe，链上没有升级时间锁；L2BEAT 列出的 TimelockController 只管 MNT 代币的 ProxyAdmin | ProxyAdmin.owner() 返回 Safe 地址；discovered.json 中 TimelockController 仅作为 MantleTokenProxyAdmin owner [1][2] | observed | F2 |
| K12 | MantleEngineeringMultisig（3/7 Safe）同时是状态提交的 challenger 和 OptimismPortal 的 Guardian | challenger() [2]；discovered.json OptimismPortal GUARDIAN [1]；getThreshold()=3、owners=7 [2] | observed |  |
| K13 | batcher（0x2f40…d749）与 sequencer 的 unsafe block signer（0xAAC9…66dc）都是 EOA | SystemConfig batcherHash / unsafeBlockSigner [2]；`cast code` 为空、L2BEAT 标为 EOA [1] | observed | F2 |
| K14 | Mantle 当前把交易数据以 type-3 blob 交易发到 Ethereum（2026-10-15 样本：1 个 blob） | batcher tx 0xf382f5d7… type 0x3、blobVersionedHashes 1 个 [2] | observed | S |
| K15 | Mantle 在 2026-04-16 的 Arsia 升级中移除 EigenDA 代码路径，DA 只用 Ethereum | L2BEAT mantle.ts milestones “Arsia upgrade: full Ethereum DA”（含 etherscan tx 0xa9f65671…）[1] | observed |  |
| K16 | Mantle 在 2025-09-16 升级到 OP Succinct（SP1 有效性证明） | L2BEAT mantle.ts milestones “Upgrade to OP Succinct” [1] | observed |  |
| K17 | Mantle 的 proposer、batcher、sequencer 签名密钥，以及两个 Safe 的全部签名人，都依赖 secp256k1 ECDSA | 由 K5、K10、K12、K13 推出：EOA 与 Safe 签名人都用 secp256k1 ECDSA 授权 | inferred | F2 |
| K18 | Mantle L2 提供 P-256（secp256r1）验证预编译 0x100 | RIP-7212 有效测试向量 `cast call` 返回 1（Mantle RPC，2026-10-16）[5] | observed |  |
| K19 | Mantle L2 节点接受 EIP-7702 的 type-4 交易 | `eth_estimateGas` type 0x4 + authorizationList 返回 46,462 gas（Mantle RPC，2026-10-16）[5] | observed |  |
| K20 | Mantle L2 执行客户端报告为 Geth v1.17.3 分支 | `cast client --rpc-url https://rpc.mantle.xyz` [5] | observed |  |
| K21 | Safe 多签支持合约作为 owner：签名类型 v=0 时，Safe 调用该合约的 EIP-1271 `isValidSignature` 验证任意长度的签名数据 | Safe 文档 “Smart account signatures” 的 “Contract signature (EIP-1271)” 一节（https://docs.safe.global/advanced/smart-account-signatures ，访问 2026-10-16）[6] | observed | F15 |
| K22 | Mantle 的 P-256 预编译（0x100）在 2025-05-24（区块 80,000,000）与 2025-10-31（区块 86,900,000）已可用，早于 Ethereum Fusaka（2025-12-03） | `cast call 0x…0100 --data <RIP-7212 测试向量> --block 80000000 / 86900000 --rpc-url https://rpc.mantle.xyz` 均返回 `0x…01`（2026-10-16 实测）[5] | observed | F15 |
| X1 | “等 Ethereum 选好路线再 rebase”只能覆盖继承层（L1 共识 BLS、blob KZG）；Mantle 的证明验证器、L1 合约权限密钥、L2 账户规则不会随 L1 升级自动 PQ 化 | 由 E59、E63、E64、K3、K10、K17 推出 | inferred |  |
| X2 | Mantle 量子攻击面里杠杆最高的是 6/14 Safe 签名人的 ECDSA 密钥：它们无时间锁地控制核心 rollup L1 合约的升级，并作为 Oracle owner 控制 verifier 地址与 vkey（MNT 代币另有 1 天时间锁） | 由 K10、K11、M13、M22、M17、T16、T17 推出：Google 也把管理员密钥列为攻破最快、影响最大的一类 | inferred | F2 |
| X3 | 对 Mantle 来说，“伪造状态”比“伪造单个用户签名”影响更大：最外层 PLONK（BN254 / KZG SRS）一旦可伪造，经由白名单 proposer 提交的错误状态根就能通过 L1 验证；proposer 是公钥已暴露的 ECDSA EOA，同样可被 Shor 攻破 | 由 K2、K3、K5（proposer nonce 51,895，已发过交易）、T13、M21、T20、T22、T25、M46 推出 | inferred | F4、F2 |
| X4 | 迁移证明验证器时，必须冻结旧的 BN254 路由，否则 Gateway 的语义是“旧证明 OR 新证明”，PQ 路由不提供额外安全 | 由 K7、K9、P38–P40 推出 | inferred | F9、Q |
| X5 | Mantle 已有在 Ethereum 之前启用密码学预编译的先例：RIP-7212 的 P-256 预编译早于 L1 的 EIP-7951 | 由 K22、M33、E7 推出：Mantle 在 Limb 之前已通过 RIP-7212 启用 P-256，L1 到 Fusaka（2025-12-03）才上线 | inferred | F15 |
| X6 | Mantle 能通过自己的命名硬分叉提前上线 PQ 验签预编译（如 EIP-8052 / 8051 / 7885 的 Draft 设计），但在 FIPS 206 定稿前上线 Falcon 接口有返工风险 | 由 X5、E30、P6、P7 推出 | inferred | F15、Q |
| X7 | 在 Mantle 上，7702 账户挂 PQ 验证模块不能移除原 ECDSA 根权限；要得到 PQ 授权，需要 Mantle 自己在协议层引入类似 EIP-8151 / 8141 的 k1 退役机制，或让用户迁到没有 ECDSA 根的合约账户 | 由 E5、E33、E65、K19、M48、O53 推出 | inferred | F15、Q |
| X8 | 只靠 PQ 签名替换 Mantle 的证明包装不现实：直接在 L1 验证 PQ STARK 约千万 gas 量级，是当前 PLONK 提交（约 43 万 gas）的 20 倍以上；需要 Succinct 的哈希型包装与 L1 侧聚合（如 EIP-8288）一起推进 | 由 K4、E53、P49、O38、E32 推出 | inferred | F16、Q |
| X9 | Mantle 目前没有公开任何 PQ 清单或路线，第一步可以先发布组件级的密码学依赖清单（类似 Starknet Migration Register） | 由 M55、M56、O1、O3 推出 | inferred | Q |
| X10 | 对 Mantle 这样的公开 L2，HNDL 不是首要矛盾；需要单独评估的是应用层的加密数据（隐私应用、加密备份、机构通信） | 由 T28、T31、O13、O57 推出 | inferred | F6 |
| X11 | 若 Ethereum 在 2029-12 完成 L1 PQ、CRQC 在 2030 年代早中期出现，L2 跟进 L1 再迁移的窗口只有数年，被动等待会把 Mantle 的迁移压到最后 | 由 E18、E21、T47、T42 推出；时间判断本身不确定 | speculative | Q |
| X12 | 收紧权限（升级加时间锁、减少单 EOA 角色、冻结旧路由）即使不考虑量子，也能降低今天的经典风险 | 由 K11、K13、M18、M21 推出：L2BEAT 已把无延迟升级列为 CRITICAL | inferred | Q |
| X13 | Mantle 的 12 小时最终化窗口与 challenger 可以在“伪造证明”事件中提供响应时间，但 challenger 本身是 3/7 ECDSA 多签，在 Q-day 后不可单独依赖 | 由 K1、K12、M10、M19 推出 | inferred | Q |
| X14 | Mantle 的 SP1 Gateway 由 Succinct 的 2/3 Safe 管理，可以在不经 Mantle 签名的情况下添加新路由；PQ 迁移和路由冻结都需要与 Succinct 协同 | 由 K6、K7、K8 推出 | inferred | F16、Q |
| X15 | 建议的 Mantle 2026–2029 分阶段路线（清单 → 权限收紧 → PQ 账户与预编译原型 → 证明路径联合设计 → 跟随 L1 切换）是本报告的建议，不是 Mantle 的既定计划 | 本报告基于 X1–X14 的建议，未经 Mantle 内部评审 | speculative | Q |
| X16 | Ethereum、Starknet、Aztec、Optimism、Algorand 都先做“账户可换签名”与“哈希型证明”，把共识聚合、DA、L1 结算放到后面；在 Ethereum 上结算的 L2 还依赖 Ethereum 的共识与 DA 迁移；Mantle 的可行顺序与之一致 | 由 O54、O55、E40、E49 推出 | inferred | F13 |
| X17 | Optimism 的 2036 路线覆盖 EOA、sequencer、batcher，但不覆盖 Mantle 特有的 OP Succinct proposer、verifier 更换权限和 L1 多签；即使 Mantle 跟随 OP，也要自行补齐 | 由 O21、O22、M37、M40 推出 | inferred |  |
| X18 | 量子之外，AI 带来的近期风险主要在实现与集成层，Mantle 的 PQ 迁移计划应当同时包含 AI 辅助审计与形式化验证要求 | 由 T57、T58、T63、T66 推出 | inferred | F7、Q |
| X19 | Mantle 的 L1 多签不必等 Ethereum 的 AA：可以把 Safe 签名人逐步换成在合约里验证 PQ 签名的 EIP-1271 owner；按约 120 万 gas / 次 ML-DSA-44 计，6 人签名约 700 万 gas，对低频的管理操作可以接受；前提是这些 owner 合约本身没有 ECDSA 后门 | 由 K21、P31、K10 推出；未做原型，gas 为合约实现的上界估计 | inferred | F15、Q |


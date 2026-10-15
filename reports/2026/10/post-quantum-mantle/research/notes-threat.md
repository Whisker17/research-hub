# notes-threat：量子威胁与 AI 密码分析（lane = threat，前缀 T）

> 调研日期 2026-10-16（UTC+8）。只读网页与论文，未运行 rh、未提交 git。
> 说明：任务文件要求写到 `reports/2026/10/post-quantum-mantle/research/notes-threat.md`，但本次运行的输出指令把本文件路径定为唯一的权威路径，所以内容写在这里，由主会话决定是否拷贝过去。

**一句话总结**：量子计算机会**直接攻破** EVM 链上所有基于椭圆曲线 / 配对的组件：ECDSA、BLS、KZG、BN254 上的 Groth16 / PLONK、ECDH。KZG / Groth16 的可信设置会被一次性算出 τ，变成可以反复使用的后门。哈希和 AES 只是安全余量下降，NIST 认为 AES-128 和 SHA-256 仍可继续使用。Google 2026-03 的估计是：破解 256 位 ECDLP 需要 <1,200 个逻辑比特 + <9,000 万 Toffoli 门，或 <1,450 个逻辑比特 + <7,000 万 Toffoli 门；在 0.1% 错误率的超导硬件上，用 <50 万物理比特、约 18–23 分钟可以跑完。专家调查给出 10 年内出现 CRQC 的概率为 28–49%。另一条独立的威胁线是 AI 密码分析：2026-07 Anthropic 用 AI 把 NIST 候选签名 HAWK 削弱到其团队撤回参选。不过 AI 对完整 AES、ML-DSA 和标准参数下的 Poseidon2 都没有形成实际攻破。

- **T-Q1 答案**：Shor 解决因数分解和（椭圆曲线 / 有限域）离散对数，所以 RSA、ECDSA、ECDH、BLS、BN254 / BLS12-381 配对、KZG、Groth16 / PLONK 都被**直接攻破**。Grover 只对无结构搜索有平方加速，而且难以并行，所以 Keccak / SHA-256 / AES 只是**余量下降**。量子碰撞算法（BHT）按硬件成本计算，并不比经典并行碰撞搜索更便宜。
- **T-Q2 答案**：EOA 只要发过一笔交易，公钥就永久暴露（at-rest 攻击）。可信设置会被攻破成通用后门（on-setup 攻击：KZG、Groth16）。BLS 被攻破会威胁 PoS 的终局性和分叉选择。HNDL 只威胁机密性，所以对公开链影响小，对隐私链影响大。
- **T-Q3 答案**：资源估计在持续下降（Google 2026-03 估计 ECDLP-256 的物理比特数下降约 20 倍）。硬件仍差几个数量级（Willow 有 105 个物理比特）。官方时间表集中在 2029–2035：Google 2029、NIST 草案 2030 / 2035、NSA 2030–2035、EF 的 L1 目标约 2029。EF 自己的判断是 CRQC “early-to-mid 2030s”。
- **T-Q4 答案**：AI 已经能在**算法层面**改进攻击（HAWK、7 轮 AES、13 轮 LEA），也能在**实现层面**找到人工审计漏掉的漏洞（Aztec、Anthropic 的密码库与合约漏洞）。来源明确给出的含义是“保守选型 + 形式化验证 + 更大的安全余量”，而不是“越快迁移越好”。

---

## T-Q1 Shor 与 Grover：各自攻破什么

### 答案
Shor 在多项式时间内解决因数分解和离散对数，所有基于 RSA、有限域 DH 或椭圆曲线（包括配对友好曲线）的方案都会“不再安全”。Grover 对无结构搜索只有平方加速。NIST 的口径是“对称算法需要更大的密钥 / 输出”，同时又说 AES-128 “will remain secure for decades”，并且不打算在 PQC 迁移中替换对称算法和哈希。量子碰撞搜索（BHT）理论上是 2^{n/3} 次查询，但它需要同等规模的量子存储；Bernstein 按“时间 × 面积”计算后结论是它比经典并行 rho 更慢。

### 依据
- NIST IR 8105（2016-04）Table 1：AES →“Larger key sizes needed”；SHA-2 / SHA-3 →“Larger output needed”；RSA、ECDSA、ECDH、DSA →“No longer secure”[8]。原文：Grover “proffers a quadratic speedup on unstructured search problems… does not render cryptographic technologies obsolete”[8 §1]。
- NIST PQC FAQ：Grover 的全部平方加速要求串行执行（Zalka 1997）；“it is quite likely that Grover's algorithm will provide little or no advantage in attacking AES, and AES 128 will remain secure for decades to come”[9]。
- NIST 2016 评估准则：量子攻击按 MAXDEPTH（2^40–2^96 个逻辑门）限制深度来计价。例如 AES-128 的量子攻击成本 = 2^170 / MAXDEPTH 个量子门；准则还提醒“the security categories… provide substantially more quantum security than a naïve analysis might suggest”[10]。
- NIST IR 8547 ipd（2024-11）：对称算法 “NIST does not expect to need to transition away from these standards as part of the PQC migration”[7 §2.1.3]。SHA-256 / SHA3-256 的**原像**安全强度为 256 bit（Category 5，与 AES-256 密钥搜索同级），**碰撞**安全强度为 128 bit（Category 2）[7 Table 7 / Table 1]。
- Bernstein（SHARCS 2009）：BHT 的“time 2^{b/3}”需要 2^{b/3} 规模的机器；经典 van Oorschot–Wiener 用约 2^{b/4} 的面积、约 2^{b/4} 的时间就能完成，原话 “All known quantum algorithms are fundamentally slower than traditional collision circuits”[11]。
- Google 白皮书：“the quadratic quantum speedup from Grover's algorithm is all but consumed by the overheads of quantum error correction… Grover's algorithm does not parallelize well”（III.4，针对 PoW 挖矿）[2]。
- ethereum.org 也把 ECDSA、BLS、KZG、配对型 ZK 证明列为 Shor 可破的对象；对哈希的定性是 “weaken but do not break”[3]。
- 配对曲线：Google 白皮书说 BLS 依赖配对友好曲线；ECDLP 在 alt_bn128（BN254）上的量子成本 “only moderately higher” 于 secp256k1，而这条曲线正是 Ethereum 预编译和 zk-rollup 在用的 [2 §IV]。

### 组件 × 影响（汇总，供图表）
| 组件 | 困难问题 | 量子影响 | 依据 |
|---|---|---|---|
| ECDSA secp256k1（EOA）、secp256r1 | ECDLP | **直接攻破**（由公钥求私钥） | [2][3][8] |
| BLS12-381 BLS（共识） | 配对群上的 DLP | **直接攻破** | [2 §V.4][3] |
| KZG（blob，BLS12-381） | 配对 + 由 SRS 求 τ 的 DLP | **直接攻破**，并留下可复用的后门 | [2 §V.5][25] |
| Groth16 / PLONK（BN254 + KZG / SRS） | 配对 + 离散对数类假设 | **可靠性被破**（可伪造证明） | [2 App. A.6][26] |
| ECDH（加密、隐私链 note 交付） | ECDLP | **直接攻破**，并有 HNDL 风险 | [7 Table 4][16] |
| RSA | 因数分解 | **直接攻破** | [8][17] |
| Keccak-256 / SHA-256 | 原像 / 碰撞 | 余量下降：原像仍属 Category 5，碰撞属 Category 2 | [7][10][11] |
| AES-128 / 256 | 密钥搜索 | 余量下降；NIST 认为 AES-128 仍安全 | [9][10] |
| Pedersen hash（Starknet） | ECDLP | Shor 可构造碰撞 | 见 starknet-account-model 台账 C11 |

### 不确定之处
- “Grover 把 256 位哈希原像降到 2^128”只在**查询次数**口径下成立。NIST 计价把深度限制和量子门成本算进去，SHA-256 原像仍属 Category 5。报告里应写成“理论查询数减半，实际成本远高于 2^128”。
- 本次没有打开 Bernstein 论文正文（cr.yp.to 无法访问），用的是同作者 SHARCS 2009 幻灯片 [11]。
- BN254 在经典攻击下本身只有约 100 bit 的安全性（exTNFS），本次未核对一手来源，不写入台账。

---

## T-Q2 对区块链的具体攻击面

### 答案
1. **公钥暴露**：EOA 地址 = Keccak-256(pubkey) 的后 20 字节；签名可以恢复出公钥。所以账户只要发过一笔交易，公钥就永久上链，可以离线、不限时地被攻击（at-rest）。只收款、从未发过交易的地址多一层哈希保护。Ethereum 的账户模型会复用地址，这层保护在实践中覆盖不了大部分活跃资产。
2. **伪造证明 / 承诺**：可信设置的 τ 可以从公开 SRS 中以离散对数的形式算出来，所以“1-of-N 诚实参与者”假设对量子对手无效。算出 τ 之后，攻击者在经典计算机上就能任意伪造 KZG 打开和 Groth16 证明（on-setup 攻击）。
3. **HNDL**：只威胁机密性。公开链的签名不存在“先收集后解密”问题；隐私链（ECDH 交付 note）、加密备份、机构通信才受影响。
4. **共识**：BLS 私钥被批量推导出来后，可以伪造验证者投票：超过 1/3 能阻止终局，超过 1/2 能控制分叉选择，超过 2/3 能终局化相互冲突的链。Google 估计早期机器批量推导需要数月，但质押集中会削弱这层缓冲。

### 依据
- 地址派生：“taking the last 20 bytes of the Keccak-256 hash of the public key”；“Others can then take the signature to derive your public key”[24]。
- ethereum.org：“For any account that has sent a transaction, the public key is exposed onchain… Accounts that have only received ether and never sent a transaction have not exposed their public key”[3]。
- Google 白皮书 §II.1 定义了三类攻击。on-spend：在交易上链前的时间窗口内推导私钥；at-rest：针对长期暴露的公钥；on-setup：针对固定的公开参数，“produce a universal reusable backdoor”[2]。
- Google §V.1：估计用快时钟 CRQC 攻破资产最多的 1,000 个 Ethereum 账户（约 2,050 万 ETH）需要“less than nine days”[2]。
- Google §V.2：前 500 个合约账户中，至少 70 个、约 250 万 ETH 存在 Admin Vulnerability，推导这些管理员私钥 “less than 15 hours”。另有约 2,000 亿美元的稳定币 / RWA 处在管理员可被攻击的合约中；桥、预言机等“high-leverage low ETH accounts”的二阶风险“arguably much larger”[2]。
- Google §V.3：Code Vulnerability 指 Ethereum 上没有 PQ 原语的预编译；“some L2 solutions use quantum-vulnerable zkSNARKs”；按 Arbitrum、Base、Optimism 等的 TVS 估计至少 1,500 万 ETH。原文：“The eventual upgrade of the Ethereum base layer to quantum-secure consensus does not retroactively fix this Code Vulnerability embedded in existing smart contracts”[2]。
- Google §V.4：截至 2026-02 约 3,700 万 ETH 质押；假设早期快时钟 CRQC 解 BLS12-381 的 ECDLP 与解 secp256k1 一样快，20 台这样的机器推导出 2/3 验证者私钥需要“more than nine months”；Lido 约占 20%，集中度会削弱这一缓冲 [2]。
- Google §V.5：“the toxic waste can be recovered as the discrete logarithm of two elliptic curve points in the SRS, so a CRQC can compute it from publicly available parameters… a persistent, universal backdoor allowing them to forge data availability proofs… with no further need for a CRQC”[2]。
- EF KZG 仪式 FAQ：信任假设为 1-of-N；“Should the secret somehow be extracted from the Powers of Tau, an attacker would be able to make arbitrary claims about the data in EIP-4844”[25]。
- SoK（ePrint 2025/064）：“Knowledge of the trapdoor τ completely undermines the binding property, which in turn breaks the soundness of every SNARK proof system built on it”[26]（这段只读到搜索摘要中的原文段落）。
- Google 附录 A.6 承认自己用于披露的 SP1 + Groth16 证明：“its soundness is inherently vulnerable to the very quantum attacks… one could use a sufficiently large, fault-tolerant quantum computer to forge this zero-knowledge proof”[2]。
- Aztec：“A post-quantum adversary might be able to forge proofs”；HNDL：攻击者可以从公告板上的 ECDH 临时公钥推出所有临时私钥，再解密全网消息 [16]。
- pq.ethereum.org：“'Harvest now, decrypt later' mainly affects encrypted data, not blockchain signatures”；“The realistic failure mode is stolen funds and impersonation, not rewriting finalized history”[4]。
- NIST IR 8547：为了缓解 HNDL，针对具体应用的指南“may require or recommend migration to quantum-resistant key establishment schemes before the classical schemes are generally disallowed”[7 §4.1.2]。Google 也认为加密面临的 HNDL 威胁“relevant today”，而签名是“future threat”[5]。
- **已暴露资产比例**：
  - Bitcoin：Google 白皮书称“at the time of writing ∼6.9M total bitcoin across all protocols are vulnerable”。口径是 P2PK / P2TR 等直接暴露公钥的类型，加上“出现在输入中且仍持有余额”的复用地址，数据来自 BigQuery [2 §III]。Deloitte（较早的研究）口径是 P2PK 约 200 万 + 复用 P2PKH 约 250 万，即“over 4 million BTC (about 25%)”[31]。
  - pq.ethereum.org：Bitcoin 约 5% 的供应量位于“早期、普遍认为已被遗弃”的地址格式中；Ethereum 对应的长期休眠暴露“closer to 0.1% (an EF estimate)”。原文强调这只指遗弃资金，“not Ethereum's total quantum exposure”[4]。

### 不确定之处
- Ethereum 上“已暴露公钥的 ETH 总比例”没有找到一手统计。Google 只给了头部 1,000 个账户和合约的数字，EF 只给了“遗弃部分 ~0.1%”。
- 链上 Groth16 / PLONK 验证器（例如 SP1 的 BN254 包装）在量子下的具体伪造路径：Google 的 V.3 没有展开；可信设置的伪造机制由 [2 §V.5][25][26] 推出。PLONK 用的是 universal SRS，Groth16 还有电路相关的 phase 2；两者都依赖 τ 等陷门保密（推论）。
- Mantle 当前是否以 SP1 → Groth16 / PLONK（BN254）在 L1 上验证：GPT 资料引用 L2BEAT 说是，本路未核实，交给架构那一路。

---

## T-Q3 Q-day 的时间与资源估计

### 答案
最新的一手估计（Google Quantum AI，arXiv 2603.28846，v1 2026-03-30，v2 2026-04-15）：ECDLP-256 需要 <1,200 个逻辑比特 + <9,000 万 Toffoli 门，或 <1,450 个逻辑比特 + <7,000 万 Toffoli 门；在“1e-3 物理错误率、平面连接、10 µs 反应时间”的超导机器上，用 <50 万物理比特可以在约 18 / 23 分钟内完成，物理比特数比此前的估计降低约 20 倍。RSA-2048 的估计（Gidney 2025-05）是 <100 万噪声比特、<1 周。硬件现状是 Google Willow，105 个物理比特（2024-12）。时间判断如下：
- GRI 专家调查（2026-03 发布的 2025 报告）：10 年内出现 CRQC 的概率 28–49%，15 年内 51–70%。
- EF：“early-to-mid 2030s”。
- Vitalik 引用 Metaculus：2030 年底前约 20%，中位数 2040。
- Aztec 作者认为 4 年内出现 Q-day “unlikely”。
- 政策时间表：Google 2029；NIST IR 8547 **仍是初始公开草案**，112-bit 参数 2030 年后弃用，所有经典公钥算法 2035 年后禁用；NSA CNSA 2.0 要求国家安全系统在 2030–2035 年完成。

### 依据
- Google Research 博客（2026-03-31，Babbush & Neven）列出两套电路的数字；“fewer than 500,000 physical qubits in a few minutes”；“approximately 20-fold reduction in the number of physical qubits”；为避免泄露攻击细节，用零知识证明验证上述结论；与“our 2029 timeline”并列提到 Coinbase、Stanford、EF [1]。
- arXiv 摘要：“<1200 logical qubits and <90 million Toffoli gates or <1450 logical qubits and <70 million Toffoli gates… 1e-3 physical error rates and planar connectivity… in minutes using fewer than half a million physical qubits”；v2 “patches software bug enabling exploit against ZKP soundness”[2]。
- 正文：假设反应时间 10 µs、每个 Toffoli 额外 50% 开销，“70 or 90 million Toffoli gates can be resolved in 18 or 23 minutes”；在 on-spend 情境下（图 6）约 9 分钟推导出私钥；快时钟（超导、光子）与慢时钟（中性原子、离子阱）的基本操作速度差“two to three orders of magnitude”，慢时钟机器预计无法发动 on-spend 攻击 [2]。
- Gidney arXiv 2505.15917（2025-05-21）：“less than a week by a quantum computer with less than a million noisy qubits”；假设门错误率 0.1%、表面码周期 1 µs、反应时间 10 µs；2019 年的旧估计是 2,000 万比特、8 小时 [17]。
- Willow 规格表（2024-12-09）：105 个比特；双比特门错误 0.33%（QEC 芯片）；表面码周期 1.1 µs；Λ = 2.14 [18]。
- GRI《Quantum Threat Timeline Report 2025》（发布于 2026-03-09，Mosca & Piani，26 位专家）：“quite possible (28-49%)… in the next 10 years, and likely (51-70%) in the next 15”[19]。
- NIST IR 8547 ipd（2024-11-12）：CSRC 页面的文档历史只有 11/12/24 这一版（Draft），截至 2026-10-16 没有定稿 [6]。Table 2：ECDSA / RSA 112-bit “Deprecated after 2030 / Disallowed after 2035”；≥128-bit “Disallowed after 2035”（没有弃用阶段）[7]。
- NSA CNSA 2.0：NSS 预计 2035 年前完成迁移；软件 / 固件签名 2030 年前只用 CNSA 2.0；Web / 云 2033 年；网络设备 2030 年 [20]。
- Google（blog.google）：“introducing a 2029 timeline”；“The threat to encryption is relevant today with store-now-decrypt-later attacks, while digital signatures are a future threat”；Android 17 集成 ML-DSA [5]。
- pq.ethereum.org：“We do not believe a cryptographically relevant quantum computer is imminent… Most engineering roadmaps place cryptographic relevance in the early-to-mid 2030s… Even if a cryptographically relevant machine is 8–12 years away, preparation must happen now”；L1 升级“could be completed by 2029”[4]。
- ethereum.org：引用 Google 约 1,200 个逻辑比特的估计；称当前硬件是“a few thousand noisy physical qubits”[3]。
- Vitalik：2025-08-27 的 X 帖子：“Metaculus's median date… is 2040… Seemingly about a 20% chance it will be before end of 2030”[29]（直接抓取返回 403，原文来自搜索引擎对 x.com 页面的索引）。2024-03-09 在 ethresear.ch 发帖，提出“quantum emergency”恢复硬分叉：回滚 + 用 STARK 证明种子原像 [32]。
- Aztec（2026-10-15）：“I think Q-day within four years is unlikely”[16]。

### 不确定之处
- Google 白皮书的“分钟级”运行时间依赖反应时间 10 µs 等假设，而电路本身没有公开，只能通过零知识证明来核验，而且 v1 的证明系统曾有可被利用的 bug（v2 已修补）[2]。
- 本次没有核实 Willow 之后 Google 或其他厂商是否有更新的芯片。ethereum.org 写的“a few thousand noisy physical qubits”没有标出处。
- postquantum.com 称 2026-06 的 EO 14412 / OMB M-26-15 把 IR 8547 的 2030 节点变成了联邦合规期限 [33]。本次没有找到白宫或 OMB 的原文，标为 speculative。
- Devconnect 2025-11 上“椭圆曲线可能在 2028 年大选前被破”的说法只见于媒体转述，没有一手录音或文字稿。

---

## T-Q4 AI 与密码学

### 答案
- **算法层**：Anthropic 2026-07-28 公布，用 Claude Mythos Preview 半自主约 60 小时、约 10 万美元 API 成本，找到 HAWK 格中此前未被利用的非平凡自同构，把密钥恢复归约到 n/2+1 维的 SVP：
  - HAWK-512 的密钥恢复成本从 2^150 降到 2^108，HAWK-1024 从 2^288 降到 2^182（AGPS20 门计数）。
  - HAWK-256（挑战参数）可以在单台服务器上几小时内端到端恢复密钥。
  - 这是纯经典攻击，不能迁移到 Falcon。
  - NIST 页面确认 HAWK 团队随后**撤回**，HAWK 不会被标准化；NIST 同时声明这一结果不影响 ML-KEM / ML-DSA。
- **7 轮 AES-128**（完整版为 10 轮）：数据量保持 2^105 个选择明文不变，时间从 2^99 降到 2^89.3–2^91.4（博客称快 200–800 倍）。论文自己承认“data remains the bottleneck… overall complexity of our attack has not improved”。
- 其他结果：13 轮 LEA（共 24 轮）的实际攻击、6 轮 Serpent（共 32 轮）、对 Poseidon / SHA-1 / Salsa20 的 <10× 改进。
- **实现层**：Aztec 称其 AI 审计工具找到了“months of expert human internal and external audits didn't find”的 critical 漏洞，已在 v6 修复。Anthropic 称 Mythos 在多个主流密码库中找到实现漏洞；SCONE-bench 显示 AI 能对真实被攻击过的合约生成可用 exploit。
- **小域 Poseidon**：所谓“breaks”，实际包括两类：
  - EF Poseidon 赏金中**缩减轮数**实例（31-bit KoalaBear / Mersenne-31、Goldilocks、BLS12-381）被求解；
  - “Skipping Class”（ePrint 2026/306）利用 Poseidon2 的非 MDS 内部矩阵跳过约 t/4 轮，对一组推荐的 128-bit 参数把代数碰撞攻击改进了 2^106 倍，但“does not mean the primitive falls short of its claimed security level”。

  没有完整轮数的推荐参数被攻破。EF 因此在 2026 年的赏金中转向 Poseidon1（KoalaBear）。Aztec 认为 BN254 上的 Poseidon2 “secure for our chosen domain”，但长期会换成 BLAKE2s / BLAKE3，并跟随 EF 的选择。
- **对迁移的含义（来源原话）**：
  - Aztec：“Rushing headfirst into new cryptography… would expose users to immediate risks, greater than the speculative risks of quantum computers”；默认保守，并要求“formally-verified implementations”。
  - pq.ethereum.org：“rushed deployment of immature cryptography can introduce more risk than it removes”。
  - Vitalik（2026-10-07，Decrypt 转述 / 嵌入）：格的具体安全性“will take serious hits from the next two years of AI math”，应同时减少对“AI-vulnerable cryptography”的暴露。

### 依据
见 [12][13][14][15][16][21][22][23][27][28][30]；具体数字见台账 T38–T55。

### 不确定之处
- 博客写 HAWK-256 是“2^64 → 2^38”，论文 Table 1 写的是 Core-SVP 2^62 → 2^38、AGPS20 2^74 → 2^52（HAWK-256 是挑战参数集，规范没有给门计数）。口径不一致，报告应引用论文里 HAWK-512 的数字。
- NIST 页面没有给出 HAWK 撤回的具体日期 [15]。
- Aztec 说的“recent breaks over small-field Poseidon”具体指哪篇论文，原文没有链接，所以对应 [21][22][23] 属于推论。
- Vitalik 2026-10-07 的帖子只拿到 Decrypt 的转述和嵌入引文，X 原帖返回 403。Justin Drake 的“bunker mode”同样只有媒体转述。

---

## 图与白话素材

### A. 概念白话（一句话）
- **Shor 算法**：量子计算机解“由公钥反推私钥”这类数学题的捷径，把“宇宙寿命级”的难度降到“几分钟到几天” [1][8]。
- **Grover 算法**：把“大海捞针”的次数开平方，但必须一步接一步地串行跑，没法靠堆机器加速，所以对哈希和 AES 只是“打个折” [9][10]。
- **BHT 碰撞算法**：理论上比 Grover 找碰撞更快，但需要一台跟问题一样大的量子存储器，算总账后反而不如普通电脑集群 [11]。
- **逻辑比特 vs 物理比特**：物理比特是真实硬件，会出错；几百个物理比特经过纠错才凑成 1 个可靠的逻辑比特 [1]。
- **Toffoli 门**：量子计算里最贵的基本操作，数量基本决定运行时间 [1]。
- **CRQC**：能实际破解当前密码的量子计算机 [1][2]。
- **at-rest / on-spend / on-setup**：分别是攻击“长期挂在链上的公钥”“正在广播、尚未上链的交易”“系统的公共参数（一次破解、永久后门）” [2]。
- **可信设置 / toxic waste τ**：KZG / Groth16 的公共参数里藏着一个秘密数 τ。经典世界里只要有一个参与者把自己那份销毁，大家就安全；量子计算机可以直接从公开参数里把 τ 算出来 [2 §V.5][25]。
- **HNDL（先收集后解密）**：今天截获密文，等有了量子机再解密。只影响“保密”，不影响“签名授权” [4][5]。
- **缩减轮数**：密码算法重复同一个步骤 N 轮。研究人员先攻少几轮的“简化版”来摸底，攻破简化版不等于攻破完整版 [12]。
- **CICO 问题**：衡量 Poseidon 这类“电路友好哈希”强度的标准难题，求解缩减轮数实例是在测安全余量 [22][23]。

### B. 威胁示意图结构（Shor / Grover / HNDL）
- 左栏 Shor → 被直接攻破：ECDSA（EOA）、BLS（验证者）、KZG（blob）、BN254 Groth16 / PLONK（rollup 证明）、ECDH（隐私交付）、RSA [2][3][8]。
- 中栏 Grover / BHT → 余量下降：Keccak-256、SHA-256、AES、Poseidon2 / BLAKE（与量子攻击无关的经典密码分析另算）[7][9][11]。
- 右栏 HNDL → 只影响机密性：ECDH 密文、加密备份、TLS 流量；公开链签名不受影响 [4][5][7]。
- 叠加层“AI 密码分析”：作用于所有算法，包括 PQ 算法（HAWK）[12][15]。

### C. 攻击模式 × EVM 组件（图的表格素材）
| 攻击模式 | 目标 | 对 EVM / L2 的例子 | 来源 |
|---|---|---|---|
| at-rest | 已暴露的公钥 | 发过交易的 EOA、多签 owner、桥 / 升级管理员 | [2 §V.1–V.2][3] |
| on-spend | mempool 中的交易 | 第一代快时钟 CRQC 约需 9–23 分钟，远超 Ethereum 的 12 s slot（推论） | [2] |
| on-setup | 固定公共参数 | KZG SRS（blob）、Groth16 / PLONK SRS（zk 证明的 L1 验证） | [2 §V.5][25][26] |
| 共识 | 验证者 BLS 私钥 | 超过 1/3 阻止终局、超过 1/2 控制分叉选择、超过 2/3 终局化冲突链 | [2 §V.4] |
| HNDL | 密文 | 隐私应用、链下通信 | [4][16] |

### D. 时间线条目
- 1994 Shor [8]；2016-04 NIST IR 8105 [8]；2016-12 NIST PQC 征集 [10]
- 2019 Gidney+Ekerå：RSA-2048，2,000 万比特、8 小时 [17]
- 2022-09 NSA CNSA 2.0 [20]
- 2024-03-09 Vitalik 量子紧急硬分叉帖 [32]
- 2024-08-13 FIPS 203 / 204 / 205 [3]
- 2024-11-12 NIST IR 8547 草案 [6]
- 2024-11 EF Poseidon 赏金启动 [22]
- 2024-12-09 Google Willow，105 比特 [18]
- 2025-05-21 Gidney：RSA-2048 用 <100 万比特、<1 周 [17]
- 2025-08-27 Vitalik 引 Metaculus：2030 年前约 20% [29]
- 2025-12 Anthropic SCONE-bench [27]
- 2026-02 “Skipping Class” ePrint 2026/306 [21][23]
- 2026-03-09 GRI 2025 报告 [19]
- 2026-03-30 / 31 Google ECDLP-256 白皮书与博客 [1][2]（v2 2026-04-15）
- 2026-05-22 Anthropic exploit-evals（Mythos 在 SCONE 更新集上 $35M）[28]
- 2026-07-28 Anthropic HAWK / AES 结果；随后 HAWK 撤回 [12][15]
- 2026-10-07 Vitalik：AI 对格的担忧（媒体转述）[30]
- 2026-10-15 Aztec PQ 博客 [16]
- 2029 Google 迁移目标 / EF L1 目标 [4][5]
- 2030 NIST 112-bit 弃用（草案）；CNSA 2.0 软件签名截止 [7][20]
- 2035 NIST 禁用经典公钥（草案）；NSS 全面迁移 [7][20]

### E. 资源估计对比条目
| 目标 | 逻辑比特 | Toffoli | 物理比特 | 时间 | 假设 | 来源 |
|---|---|---|---|---|---|---|
| ECDLP-256（电路 A） | <1,200 | <9,000 万 | <50 万 | 约 23 分钟 | 1e-3 错误率、平面连接、10 µs 反应时间 | [1][2] |
| ECDLP-256（电路 B） | <1,450 | <7,000 万 | <50 万 | 约 18 分钟 | 同上 | [1][2] |
| RSA-2048（2025） | <1,600（每次 shot） | — | <100 万 | <1 周 | 0.1% 门错误、1 µs 周期 | [17] |
| RSA-2048（2019） | — | 约 30 亿 | 2,000 万 | 8 小时 | 同上 | [17] |
| 现有硬件：Willow | — | — | 105 | — | 双比特门错误 0.33% | [18] |

---

## 外部调研 / 用户资料中被修正或无法核实的地方

1. **GPT §3.1“Google 等研究者公布……显著降低资源门槛”**：属实，但缺少数字和硬件假设。应补上 <1,200 / <1,450 个逻辑比特、<9,000 万 / <7,000 万 Toffoli、<50 万物理比特、18–23 分钟，以及“1e-3 错误率、10 µs 反应时间”[1][2]。另外，该估计的电路没有公开，只通过 SP1 + Groth16 的零知识证明来核验，而 v1 的证明系统有可被利用的 bug，v2 才修补 [2]。
2. **GPT §3.2 用 arXiv 2603.28846 来支撑“Shor 改变解题方法”**：这个来源可以接受，但 Shor 的权威出处应引 NIST IR 8105 [8]。
3. **GPT §3.2“256 位哈希原像从 2^256 降到约 2^128 次量子查询”**：查询数口径没错，GPT 也加了限定。但应补充 NIST 的口径：SHA-256 原像仍属 Category 5（与 AES-256 同级），碰撞属 Category 2；BHT 碰撞算法在实际成本上不比经典更好 [7][10][11]。
4. **GPT §3.4“可信设置仪式有诚实参与者也不能让 KZG 抗量子”，引用 arXiv**：结论正确，出处是 Google §V.5（“toxic waste can be recovered as the discrete logarithm…”）[2]。**ethereum.org 的说法与此相反**：它写道只要有一个诚实参与者，设置就是安全的，“even against quantum computers attempting to reverse-engineer it after the fact”[3]。按 KZG 的数学结构，τ 就是 SRS 中 [τ]G 的离散对数（[2][25][26]），ethereum.org 这句应视为错误（inferred）。
5. **GPT §4.1 HAWK 那一行**：漏了最关键的结果，即 HAWK 团队已撤回、不会被标准化（NIST 页面）[15]；也没给出数字（HAWK-512 从 2^150 到 2^108）[13]。“不能推出所有格密码被破解”的边界属实，NIST 与 Anthropic 都有声明 [12][15]。
6. **GPT §4.1 的 AES 那一行**：“7 轮 / 完整 10 轮”“极高数据规模”“不需要修改生产软件”都属实 [12]。补充：数据量为 2^105 个选择明文，时间从 2^99 降到 2^89.3–2^91.4；论文承认总体复杂度没有改善，因为瓶颈在数据量 [14]。
7. **GPT §3.5 引 Google 迁移说明“加密与签名的紧迫性不同”**：属实 [5]。
8. **GPT §4.2 关于 Aztec AI 审计**：属实。原文是“found critical vulnerabilities, including ones that months of expert human internal and external audits didn't find… patched in the upcoming v6”[16]。
9. **ethereum.org“NIST anticipates deprecating ECDSA by 2030 and disallowing it by 2035”**：不够精确。IR 8547 仍是**草案**，而且只有 112-bit 参数是“2030 年后弃用”；secp256k1 / P-256 这类 ≥128-bit 参数是“2035 年后禁用”，没有弃用阶段 [6][7]。
10. **“Bitcoin 约 25% / 600 万 BTC 暴露”的流行说法**：混合了两个口径。Deloitte 写的是“over 4 million BTC (about 25%)”（P2PK 约 200 万 + 复用 P2PKH 约 250 万，属于较早的数据）[31]；Google 2026 写的是约 690 万 BTC [2]。EF 的“~5%”只指被认为已遗弃的早期地址 [4]。三个数字不能混用。
11. **GPT 和用户草稿都没有提 Ethereum 的“长期休眠暴露约 0.1%（EF 估计）”和 Google 对 ETH 的定量估计**（前 1,000 账户 2,050 万 ETH、<9 天；管理员合约 250 万 ETH、<15 小时；L2 / 桥至少 1,500 万 ETH）[2][4]。这些对 Mantle 的“先保护管理员和桥密钥”判断很重要。
12. **媒体流传的“EO 14412 把 IR 8547 的 2030 变成合规期限”**：只见于 postquantum.com，没有找到一手原文，无法核实 [33]。

---

## 来源

1. **PRIMARY** Google Research 博客 “Safeguarding cryptocurrency by disclosing quantum vulnerabilities responsibly”（2026-03-31，Babbush、Neven），https://research.google/blog/safeguarding-cryptocurrency-by-disclosing-quantum-vulnerabilities-responsibly/ ，访问 2026-10-16。证明：ECDLP-256 资源估计、约 20 倍降幅、零知识披露方式、Google 2029 时间表。
2. **PRIMARY** Babbush et al., “Securing Elliptic Curve Cryptocurrencies against Quantum Vulnerabilities: Resource Estimates and Mitigations”, arXiv:2603.28846v2（v1 2026-03-30；v2 2026-04-15），https://arxiv.org/abs/2603.28846 、HTML v2，访问 2026-10-16。证明：资源与硬件假设、at-rest / on-spend / on-setup 定义、Ethereum 五类脆弱性（§V.1–V.5）的量化、6.9M BTC、Groth16 证明本身不抗量子（A.6）、Grover 对挖矿无实际威胁（III.4）。
3. **PRIMARY** ethereum.org “Post-quantum cryptography on Ethereum”，https://ethereum.org/roadmap/security/quantum-resistance/ ，访问 2026-10-16。证明：四个脆弱领域、对公钥暴露的说明、对 KZG 抗量子的（有误的）说法、对 NIST 时间的转述。
4. **PRIMARY** EF pq.ethereum.org，https://pq.ethereum.org/ ，访问 2026-10-16。证明：CRQC “early-to-mid 2030s”、HNDL 主要影响加密、真实失败模式是盗币而非改写历史、遗弃暴露约 0.1% vs BTC 约 5%、L1 约 2029 完成、过早部署的风险。
5. **PRIMARY** Google（blog.google）“Quantum frontiers may be closer than they appear”，https://blog.google/innovation-and-ai/technology/safety-security/cryptography-migration-timeline/ ，访问 2026-10-16（页面未显示日期）。证明：Google 2029 迁移时间表；加密面临现实的 HNDL 威胁、签名是未来威胁；Android 17 集成 ML-DSA。
6. **PRIMARY** NIST CSRC IR 8547 ipd 页面，https://csrc.nist.gov/pubs/ir/8547/ipd ，访问 2026-10-16。证明：2024-11-12 发布的初始公开草案，文档历史中没有定稿版本。
7. **PRIMARY** NIST IR 8547 ipd PDF，https://nvlpubs.nist.gov/nistpubs/ir/2024/NIST.IR.8547.ipd.pdf ，访问 2026-10-16。证明：Table 2 / 4 的弃用与禁用口径；对称算法不迁移（§2.1.3）；Table 1 / 7 的哈希原像与碰撞类别；HNDL 指南（§4.1.2）。
8. **PRIMARY** NIST IR 8105（2016-04），https://nvlpubs.nist.gov/nistpubs/ir/2016/NIST.IR.8105.pdf ，访问 2026-10-16。证明：Table 1 量子影响；Shor 与 Grover 的定性。
9. **PRIMARY** NIST CSRC PQC FAQ，https://csrc.nist.gov/projects/post-quantum-cryptography/faqs ，访问 2026-10-16。证明：Grover 难以并行，AES-128 “will remain secure for decades”。
10. **PRIMARY** NIST CSRC PQC 评估准则（安全），https://csrc.nist.gov/Projects/Post-Quantum-Cryptography/Post-Quantum-Cryptography-Standardization/Evaluation-Criteria/Security-(Evaluation-Criteria) ，访问 2026-10-16。证明：MAXDEPTH 计价；AES 量子门成本；类别比朴素分析更安全。
11. **PRIMARY** D. J. Bernstein, “Cost analysis of hash collisions: will quantum computers make SHARCS obsolete?” SHARCS 2009 幻灯片，http://www.hyperelliptic.org/tanja/SHARCS/slides09/07-bernstein.pdf （论文 https://cr.yp.to/hash/collisioncost-20090823.pdf 无法访问），访问 2026-10-16。证明：BHT 按成本计算慢于经典并行 rho。
12. **PRIMARY** Anthropic “Discovering cryptographic weaknesses with Claude”（2026-07-28；07-29 修订作者单位），https://www.anthropic.com/research/discovering-cryptographic-weaknesses ，访问 2026-10-16。证明：HAWK 与 7 轮 AES 结果、60 小时 / 约 10 万美元、边界声明、LEA / Serpent / Poseidon 等后续结果、密码库实现漏洞。
13. **PRIMARY** Straznickas & Weis, “HAWK-n Key Recovery Reduces to SVP in Dimension n/2+1”, https://anthropic.com/document/hawk_key_recovery.pdf ，访问 2026-10-16。证明：HAWK-512 / 1024 成本降幅、HAWK-256 的实际恢复、纯经典攻击、不能迁移到 Falcon。
14. **PRIMARY** Nasr & Carlini, “Cryptanalysis of 7-Round AES via the Algebraic Structure of its S-box”, https://anthropic.com/document/aes_mobius_bridge.pdf ，访问 2026-10-16。证明：2^105 数据、2^99 → 2^89.3–2^91.4 时间、总体复杂度没有改善。
15. **PRIMARY** NIST “Post-quantum cryptography” 页面，https://www.nist.gov/pqc ，访问 2026-10-16。证明：HAWK 团队撤回、不会被标准化；结果不影响 ML-KEM / ML-DSA。
16. **PRIMARY** Aztec “Post-quantum Aztec”（2026-10-15），https://aztec.network/blog/post-quantum-aztec ，访问 2026-10-16。证明：AI 审计发现 critical 漏洞；HAWK 退出；保守加形式化验证的立场；ECDH 的 HNDL 机制；Poseidon2 的立场；“Q-day within four years is unlikely”。
17. **PRIMARY** Gidney, “How to factor 2048 bit RSA integers with less than a million noisy qubits”, arXiv:2505.15917v1（2025-05-21），访问 2026-10-16。证明：RSA-2048 资源估计与硬件假设。
18. **PRIMARY** Google Quantum AI Willow 规格表（2024-12-09），https://quantumai.google/static/site-assets/downloads/willow-spec-sheet.pdf （经搜索结果读取），访问 2026-10-16。证明：105 个比特、错误率、表面码周期。
19. **PRIMARY** Global Risk Institute《Quantum Threat Timeline Report 2025》（2026-03-09）页面与执行摘要，https://globalriskinstitute.org/publication/quantum-threat-timeline-report-2025b/ ，访问 2026-10-16（经搜索结果读取）。证明：26 位专家；10 年内 28–49%，15 年内 51–70%。
20. **PRIMARY** NSA CNSA 2.0 CSA（2022-09 原版；2025-05 重发的 PDF）与 CNSA 2.0 FAQ（2024-12 v2.1），https://media.defense.gov/2025/May/30/2003728741/-1/-1/0/CSA_CNSA_2.0_ALGORITHMS.PDF ，访问 2026-10-16（经搜索结果读取）。证明：2030 / 2033 / 2035 时间表。
21. **PRIMARY** Merz & Rodríguez García, “Skipping Class…”, ePrint 2026/306，https://eprint.iacr.org/2026/306 ，访问 2026-10-16。证明：Poseidon2 碰撞攻击改进 2^106 倍，但未低于宣称的安全级别。
22. **PRIMARY** Bak et al., “Claiming bounties on small scale Poseidon and Poseidon2 instances…”, ePrint 2026/150，https://eprint.iacr.org/2026/150 ，访问 2026-10-16。证明：EF 2024-11 赏金；求解了 31-bit 缩减轮数实例。
23. **PRIMARY** Khovratovich（EF）“Poseidon Cryptanalysis Initiative 2024–2026”，SPRING 2026-05-10 幻灯片，https://pis147879.github.io/SPRING2026/slides/khovratovich.pdf ，访问 2026-10-16。证明：被认领的实例都是缩减轮数；推荐参数未被攻破；EF 转向 Poseidon1 KoalaBear；赏金预算。
24. **PRIMARY** ethereum.org Accounts，https://ethereum.org/developers/docs/accounts/ ，访问 2026-10-16。证明：地址 = Keccak-256(pubkey) 后 20 字节；签名可推出公钥。
25. **PRIMARY** ethereum/kzg-ceremony FAQ.md，https://github.com/ethereum/kzg-ceremony/blob/main/FAQ.md （未固定 commit），访问 2026-10-16。证明：1-of-N 假设；秘密被提取后可对 EIP-4844 数据任意声明。
26. **PRIMARY** “SoK: Trusted setups for powers-of-tau strings”, ePrint 2025/064，https://eprint.iacr.org/2025/064.pdf （只读到搜索摘要中的原文段落），访问 2026-10-16。证明：知道 τ 就破坏绑定性和所有基于它的 SNARK 的可靠性。
27. **PRIMARY** Anthropic “AI agents find $4.6M in blockchain smart contract exploits”（2025-12），https://www.anthropic.com/research/smart-contracts （经搜索结果读取），访问 2026-10-16。证明：SCONE-bench 405 个合约；知识截止日之后的 exploit 价值 $4.6M。
28. **PRIMARY** Anthropic “Measuring LLMs' ability to develop exploits”（2026-05-22），https://www.anthropic.com/research/exploit-evals （经搜索结果读取），访问 2026-10-16。证明：Mythos 在 12 个知识截止后的 exploit 上取得 $35M。
29. **PRIMARY（读取受限）** Vitalik X 帖子 2025-08-27，https://x.com/VitalikButerin/status/1960844208790757894 （直接抓取 403，文本来自搜索索引），访问 2026-10-16。证明：引 Metaculus：中位数 2040，2030 年底前约 20%。
30. 媒体 Decrypt “Will AI Break Crypto Encryption?…”（2026-10），https://decrypt.co/380503/ai-break-crypto-encryption-ethereum-vitalik-buterin-bunker-mode ，访问 2026-10-16。证明：转述并嵌入 Vitalik 2026-10-07 的 X 帖（原帖 403）；转述 Justin Drake 的“bunker mode”。
31. Deloitte “Quantum computers and the Bitcoin blockchain”，https://www.deloitte.com/nl/en/services/risk-advisory/perspectives/quantum-computers-and-the-bitcoin-blockchain.html （经搜索结果读取，页面日期未核），访问 2026-10-16。证明：“over 4 million BTC (about 25%)”的口径。
32. **PRIMARY** Vitalik, “How to hard-fork to save most users' funds in a quantum emergency”, ethresear.ch（2024-03-09），https://ethresear.ch/t/how-to-hard-fork-to-save-most-users-funds-in-a-quantum-emergency/18901 （经搜索结果读取），访问 2026-10-16。证明：未发过交易的地址仍安全；发过交易即暴露；恢复分叉的设想。
33. 媒体 postquantum.com “NIST IR 8547: A Roadmap…”，https://postquantum.com/security-pqc/nist-ir-8547-ipd/ ，访问 2026-10-16。只用来记录它提到的 EO 14412 / OMB M-26-15，未核实。
34. ePrint 2026/1905 Bak & Hostettler, “A Better Bivariate Resultant Attack on Round-Reduced Poseidon”（2026-09），https://eprint.iacr.org/2026/1905 （经搜索结果读取），访问 2026-10-16。证明：EF 赏金 CICO-2 方向的后续改进，仍是缩减轮数。
35. ChatGPT Deep Research（research/from-aztec-pq-to-mantle-pq.md）。只当线索，不作证据。

## 开放问题
1. Ethereum 上“已暴露公钥的 ETH 占比”（不只是遗弃部分）有没有 EF 或学术的一手统计？Mantle 上同口径的数字可以用链上数据自己算。
2. Google 白皮书只给了 secp256k1 的估计；BLS12-381、BN254 的具体量子资源只说“moderately higher”，没有数字。
3. NIST IR 8547 何时定稿？EO 14412 / OMB M-26-15 是否真实存在、内容是什么？
4. Willow 之后（2025–2026）各家硬件的最新物理比特数与错误率（本路未查）。
5. HAWK 撤回的正式日期与 NIST pqc-forum 原帖。
6. Aztec 所说“recent breaks over small-field Poseidon”具体指哪篇论文？“Skipping Class”对 BN254 上小 t（t=3/4）的 Poseidon2 实例影响多大？
7. Mantle 实际的 L1 验证路径（SP1 → Groth16 / PLONK，BN254；用哪个 SRS）需要架构那一路确认，以便判断 on-setup 攻击是否直接适用。
8. Vitalik 2026-10-07 帖子原文，以及 EF 是否就“AI 对格的威胁”调整了签名选型（例如更偏向哈希签名）。

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| T1 | NIST IR 8105 把 RSA、ECDSA、ECDH、DSA 评为大规模量子计算机下“No longer secure”，AES 需要更大的密钥，SHA-2 / SHA-3 需要更大的输出 | [8] §1 Table 1 | observed | |
| T2 | Grover 对无结构搜索只有平方加速，不会让密码技术过时 | [8] §1 “proffers a quadratic speedup… does not render cryptographic technologies obsolete” | observed | |
| T3 | NIST 认为 Grover 难以并行，AES-128 “will remain secure for decades to come” | [9] FAQ Grover 条目 | observed | |
| T4 | NIST 不打算在 PQC 迁移中替换对称算法标准 | [7] §2.1.3 “NIST does not expect to need to transition away from these standards” | observed | |
| T5 | SHA-256 / SHA3-256 的原像安全强度属 Category 5，碰撞属 Category 2 | [7] Table 7 与 Table 1 | observed | |
| T6 | NIST 用 MAXDEPTH 计价量子攻击；AES-128 的量子攻击 = 2^170 / MAXDEPTH 个量子门 | [10] MAXDEPTH 段与成本表 | observed | |
| T7 | “Grover 把 256 位哈希原像降到 2^128”只是查询数口径，实际成本远高于此 | 由 T5、T6 推出：NIST 计入深度限制后，SHA-256 原像仍与 AES-256 同级 | inferred | |
| T8 | Bernstein：BHT 的 2^{b/3} 时间需要 2^{b/3} 规模的机器，比经典 vOW 并行碰撞（约 2^{b/4} 时间与面积）更慢 | [11] p.29–32 “giant steps backwards” | observed | |
| T9 | Google 白皮书认为 Grover 的平方加速几乎被纠错开销抵消，且难以并行（针对 PoW） | [2] §III.4 | observed | |
| T10 | Google 估计 ECDLP 在 alt_bn128（BN254）上的量子成本只比 secp256k1 略高 | [2] §IV “only moderately higher… alt_bn128” | observed | |
| T11 | ethereum.org 把 ECDSA、BLS、KZG、配对型 ZK 证明列为可被 Shor 高效求解 | [3] “Why post-quantum cryptography matters” | observed | |
| T12 | EOA 地址 = 公钥 Keccak-256 的后 20 字节，签名可推出公钥 | [24] Account creation 段 | observed | |
| T13 | 发过交易的账户公钥已在链上暴露；只收款、从未发过交易的账户多一层哈希保护 | [3] Account signatures 段；[32] 首帖 | observed | |
| T14 | Google 定义 at-rest、on-spend、on-setup 三类量子攻击，on-setup 会产生“universal reusable backdoor” | [2] §II.1 | observed | |
| T15 | Google 估计快时钟 CRQC 攻破 ETH 最多的 1,000 个账户（约 2,050 万 ETH）用时少于 9 天 | [2] §V.1 | observed | |
| T16 | 前 500 个合约账户中至少 70 个（约 250 万 ETH）存在 Admin Vulnerability，推导这些私钥少于 15 小时 | [2] §V.2 | observed | |
| T17 | Google 认为桥、预言机等“高杠杆、低 ETH 余额”账户的二阶风险“arguably much larger” | [2] §V.2 | observed | |
| T18 | Ethereum 共识层升级为量子安全，不会回溯修复已部署合约中的 Code Vulnerability | [2] §V.3 原句 | observed | |
| T19 | Google 按主要 L2 与桥的 TVS 估计 Code Vulnerability 至少 1,500 万 ETH，并指出部分 L2 用量子脆弱的 zkSNARK | [2] §V.3 | observed | |
| T20 | KZG 的 toxic waste 是 SRS 中两个椭圆曲线点的离散对数，CRQC 可从公开参数算出，并得到无需再用 CRQC 的永久后门 | [2] §V.5 | observed | |
| T21 | EF KZG 仪式的信任假设是 1-of-N；秘密一旦被提取，攻击者可以对 EIP-4844 数据任意声明 | [25] FAQ “What needs to go wrong…” | observed | |
| T22 | 知道 τ 会破坏 KZG 绑定性以及所有基于它的 SNARK 的可靠性 | [26] ePrint 2025/064 第 3 节段落（搜索摘要原文） | observed | |
| T23 | 可信设置“有诚实参与者”对量子对手无效，ethereum.org 称其抗量子的说法有误 | 由 T20、T21、T22 推出：量子对手不需要任何参与者泄密，直接由公开 SRS 求出 τ；[3] 原句 “even against quantum computers” | inferred | |
| T24 | Google 承认自己用于披露的 Groth16 证明，其可靠性对量子攻击脆弱、可被伪造 | [2] App. A.6 原句 | observed | |
| T25 | 在 L1 上以 BN254 Groth16 / PLONK 验证的 rollup 证明，可在 Q-day 后被伪造（on-setup） | 由 T10、T22、T24 推出：BN254 的 DLP 可被 Shor 求解，SRS 陷门可被算出，可靠性失效 | inferred | |
| T26 | 截至 2026-02 约 3,700 万 ETH 质押；20 台早期快时钟 CRQC 推导 2/3 验证者私钥需要 9 个月以上；质押集中会削弱缓冲 | [2] §V.4 | observed | |
| T27 | BLS 被攻破后，超过 1/3 能阻止终局，超过 1/2 能控制分叉选择，超过 2/3 能终局化冲突链 | [2] §V.4 | observed | |
| T28 | EF 认为 HNDL 主要影响加密数据而非区块链签名，真实失败模式是盗币和冒充，而非改写已终局的历史 | [4] FAQ “Understanding the Threat” | observed | |
| T29 | Aztec 描述的 HNDL：量子对手可从公告板上的 ECDH 临时公钥推出全部临时私钥，进而解密全网 note | [16] “Traditional messaging” 节 | observed | |
| T30 | NIST IR 8547 提示，应用指南可能要求在经典方案被全面禁用前，先把密钥建立迁到抗量子方案，以缓解 HNDL | [7] §4.1.2 | observed | |
| T31 | 对 Mantle 这类公开 L2，HNDL 不是核心矛盾，主要风险是授权伪造与证明伪造 | 由 T28、T15、T25 推出 | inferred | |
| T32 | Google 白皮书称约 690 万 BTC 处于脆弱状态（直接暴露公钥的类型 + 仍有余额的复用地址） | [2] §III 图注 | observed | |
| T33 | Deloitte 的口径是“over 4 million BTC (about 25%)”（P2PK 约 200 万 + 复用 P2PKH 约 250 万） | [31] 正文 | observed | |
| T34 | EF 估计 Ethereum 长期休眠（遗弃）暴露约 0.1%，Bitcoin 早期遗弃格式约 5%；这不代表 Ethereum 的总暴露 | [4] FAQ “Attack Surface & Risk” | observed | |
| T35 | Google 估计 ECDLP-256 需要 <1,200 个逻辑比特 + <9,000 万 Toffoli 门，或 <1,450 个逻辑比特 + <7,000 万 Toffoli 门 | [1] 资源估计段；[2] 摘要 | observed | |
| T36 | 在 1e-3 物理错误率、平面连接的超导机器上，用 <50 万物理比特可在约 18 / 23 分钟内完成（10 µs 反应时间、每个 Toffoli 额外 50% 开销） | [2] 摘要与资源估计节 | observed | |
| T37 | Google 称物理比特需求比此前估计降低约 20 倍，并用零知识证明代替公开电路；v2 修补了可破坏该证明可靠性的 bug | [1]；[2] arXiv 版本说明 | observed | |
| T38 | 慢时钟架构（中性原子、离子阱）的基本操作慢 2–3 个数量级，预计无法发动 on-spend 攻击 | [2] §I/II 快慢时钟段 | observed | |
| T39 | Gidney 2025 估计 RSA-2048 用 <100 万噪声比特、<1 周即可分解（0.1% 门错误、1 µs 周期、10 µs 反应时间） | [17] 摘要 | observed | |
| T40 | Google Willow（2024-12-09）有 105 个比特，双比特门错误约 0.33%，表面码周期 1.1 µs | [18] 规格表 | observed | |
| T41 | 现有公开硬件的物理比特数与 ECDLP-256 所需相差三个数量级以上 | 由 T36、T40 推出：105 vs <500,000 | inferred | |
| T42 | GRI 2025 报告（2026-03，26 位专家）：10 年内出现 CRQC 的概率 28–49%，15 年内 51–70% | [19] 页面与执行摘要 | observed | |
| T43 | NIST IR 8547 截至 2026-10-16 仍是 2024-11-12 的初始公开草案 | [6] 文档历史只有 11/12/24 | observed | |
| T44 | IR 8547 草案：ECDSA / RSA 112-bit 在 2030 年后弃用、2035 年后禁用；≥128-bit 在 2035 年后禁用，没有弃用阶段 | [7] Table 2 / Table 4 | observed | |
| T45 | NSA CNSA 2.0：NSS 在 2035 年前完成迁移；软件 / 固件签名 2030 年前只用 CNSA 2.0；Web / 云 2033 年 | [20] Timing 节 | observed | |
| T46 | Google 设定 2029 年 PQC 迁移时间表，并认为加密的 HNDL 威胁当下就存在、签名是未来威胁 | [5] 正文 | observed | |
| T47 | EF：CRQC 不是迫在眉睫，多数工程路线图把密码学相关性放在 2030 年代早中期；L1 升级可能在 2029 年完成 | [4] Overview 与 FAQ | observed | |
| T48 | Vitalik 引 Metaculus：中位数 2040，2030 年底前约 20% | [29] X 帖 2025-08-27（经搜索索引读取） | observed | |
| T49 | Aztec 博客作者认为 4 年内出现 Q-day 不太可能 | [16] “Why the roadmap extends to 2030” | observed | |
| T50 | Anthropic 用 Mythos Preview 约 60 小时、约 10 万美元 API 成本，改进了对 HAWK 的已知最佳攻击 | [12] HAWK 节 | observed | |
| T51 | HAWK 攻击是经典攻击，把密钥恢复归约到 n/2+1 维 SVP；HAWK-512 从 2^150 降到 2^108，HAWK-1024 从 2^288 降到 2^182 | [13] 摘要与 §6.1 Table 1 | observed | |
| T52 | HAWK-256 的密钥可在单台 96 核服务器上几小时内端到端恢复；该构造不能迁移到 Falcon | [13] §6.2 与摘要 | observed | |
| T53 | NIST 确认 HAWK 团队撤回，HAWK 不会被标准化或部署；结果不影响 ML-KEM / ML-DSA | [15] nist.gov/pqc 原文 | observed | |
| T54 | 对 7 轮 AES-128（完整 10 轮）的攻击：数据量仍为 2^105 个选择明文，时间从 2^99 降到 2^89.3–2^91.4，总体复杂度没有改善 | [14] 摘要、引言、§4.1.1 | observed | |
| T55 | Anthropic 声明两项结果都不影响生产系统，不需要修改生产软件 | [12] Introduction “no production software will have to change” | observed | |
| T56 | Anthropic 另报告 13 轮 LEA 的实际攻击、6 轮 Serpent，以及对 Poseidon / SHA-1 / Salsa20 不到 10 倍的改进 | [12] Further work | observed | |
| T57 | Aztec 称其 AI 审计工具找到了数月人工内外部审计漏掉的 critical 漏洞，已在 v6 修复 | [16] “The risk of changing cryptography” | observed | |
| T58 | Anthropic 的 SCONE-bench：AI 代理对知识截止后的真实被攻击合约生成了总价值 $4.6M 的 exploit；Mythos 在 2026 年更新集上达到 $35M | [27]；[28] | observed | |
| T59 | EF 赏金中被认领的 Poseidon / Poseidon2 实例都是缩减轮数，完整轮数的推荐参数没有被攻破 | [23] Slide 4–6、13；[22] 摘要 | observed | |
| T60 | “Skipping Class”利用 Poseidon2 的非 MDS 矩阵，对一组 128-bit 推荐参数把代数碰撞攻击改进 2^106 倍，但不低于其宣称的安全级别 | [21] 摘要；[23] Slide 6 | observed | |
| T61 | EF 的 Poseidon 计划因此在 2026 年赏金中从 Poseidon2 转向 Poseidon1（KoalaBear） | [23] Slide 6 | observed | |
| T62 | Aztec 认为 BN254 上的 Poseidon2 目前安全，但计划长期换成 BLAKE2s / BLAKE3，并跟随 EF 的 hash 选择 | [16] “Hash functions belong in the migration too” | observed | |
| T63 | Aztec 默认的密码学变更策略是保守，要求极强的密码分析和形式化验证的实现 | [16] 原文 “conservative… formally-verified implementations” | observed | |
| T64 | EF 认为仓促部署不成熟的 PQ 密码可能带来比它消除的更多的风险 | [4] FAQ “Common misconceptions” | observed | |
| T65 | Vitalik 2026-10-07 称 AI 数学可能在两年内严重削弱格的具体安全性，并主张同时减少对“AI 脆弱密码”的暴露 | [30] Decrypt 转述与嵌入引文（X 原帖 403） | speculative | |
| T66 | 对 Mantle 来说，AI 带来的近期风险更多在实现与集成层（合约、验证器、桥），而不是对已标准化 PQ 算法的数学攻破 | 由 T53、T55、T57、T58 推出 | inferred | |
| T67 | 2026-06 的 EO 14412 / OMB M-26-15 把 IR 8547 的 2030 节点变成了联邦合规期限 | 只见于 [33] 媒体，未找到一手原文 | speculative | |
| T68 | Aztec 所说的“small-field Poseidon breaks”指 EF 赏金中 31-bit 缩减轮数实例的求解以及“Skipping Class” | Aztec 原文无链接 [16]；时间与内容和 [21][22][23] 吻合 | speculative | |
| T69 | ethereum.org 称当前量子硬件为“a few thousand noisy physical qubits”（未标出处） | [3] ethereum.org quantum-resistance 页 | observed | |

# notes-recursion：递归证明是不是一个有问题的设计？

调研日期：2026-10-21。台账前缀 R。本地一手文件引用写 `文件名:L行号`；论文写 ePrint 编号；网页写访问日期 2026-10-21。
限制：本机对 eprint.iacr.org 全文抓取被拒（HTTP 403 / IP blocked），论文内容只来自 ePrint 摘要页（经搜索引擎抓取的原文摘要与元数据）与少量 PDF 片段；节号无法逐一核对，凡写“摘要”处即只核对到摘要层。后半程搜索服务限流，部分补查未完成（见“开放问题”）。

## 总结（三层结论）

- **(a) 理论模型 / 安全证明的缺口：存在，且是双方都承认的。** 递归 SNARK/STARK 在普通随机预言机模型（ROM）里没有已知的安全证明；“相对化 SNARK”路线在 ROM 中已被证明不可能（ePrint 2024/728）；标准（倒带式）提取器证明只能支撑常数深度（BCCT13），而能消除深度膨胀的证明都放在比 ROM 更理想化的预言机模型里（2023/1646、2025/1663 等）。leanVM 自己的形式化验证项目 leanerVM 也把“递归提取桥”（T6）列为**开放研究问题**，端到端定理 T7 目前只是条件化的“目标模式”。
- **(b) 已知的具体攻击：有针对 Fiat–Shamir 的具体攻击，但没有找到针对“SNARK 递归本身”的已知攻击。** KRS（ePrint 2025/118）对 GKR 类协议在任意具体 FS 哈希下构造了“证明假命题”的电路，其关键就是电路在内部计算自己的 FS 挑战——与递归“在电路里算验证者哈希”同形。后续工作把这类攻击扩展到“由程序生成实例”的 Spartan/Aurora 变体（2026/1838）以及 PlonK 等（Brzuska–Hubáček–Kalsta, PKC 2026）。Thaler 本人也说“不知道任何对 SNARK 递归的直接攻击”。
- **(c) 对 EIP-8288 的可利用漏洞：没有找到。** 当前草案只接受 leanSPHINCS 依赖，用户自带 STARK（`LEANSTARK_SCHEME`）仍是保留值；递归只发生在协议固定的 `AGGREGATED_VK` 电路自身上。已出现的“递归聚合”真实漏洞（ZisK、SP1）都是**实现层**的 Fiat–Shamir 绑定 / 空子证明错误，不是对递归理论的攻击，也不针对 leanVM/EIP-8288。

一句话：递归不是“已被攻破的设计”，但“hash-only = 只依赖哈希”的说法确实漏掉了一个**目前没有被证明、只被广泛相信**的假设（递归 FS-SNARK 的 soundness）；EIP-8288 自己在 Security Considerations 中承认了这一点。

---

## Q1 逐条拆解 Justin Thaler 的论点

身份（observed）：Justin Thaler 是 a16z crypto research 的 Research Partner、Georgetown 计算机系副教授（目前休假在 a16z），著有《Proofs, Arguments, and Zero-Knowledge》，是 Jolt（Arun, Setty, Thaler, ePrint 2023/1217）合著者 [7][8]。他是 Aerie 论文的四位作者之一（ePrint 2026/2501；Centelles, Dao, Badakhshan, Thaler）[6]——**利益相关需要标注**：他批评的是与自己方案竞争的路线。

### 论点 A：“hash-only 其实是 hashes + 深度 SNARK 递归的 soundness”；Aerie 一台笔记本不递归就能证明一个 slot 的签名
- 答案：前半句**有一手支持**——EIP-8288 自己把“Soundness of recursive STARKs”列为第 3 条信任假设，独立于哈希函数 soundness（第 2 条）。后半句**作者自测数据支持**：Aerie README 报告 M4 Max 16 线程 645 ms 证明 32,768 个 Falcon-512 签名、单个证明、无递归。
- 依据：[1] eip-8288@5a4387b.md:L521-523；[4] aerie-README@49b6c21.md 结果表（Falcon-512 32,768 行）；[6] ePrint 2026/2501 摘要 “A single proof covers the whole batch, with no recursion”。
- 反方 / 限定：(i) “一个 slot 的签名”前提是这些签名都已送到一台机器；共识层签名收集本身的网络流程不在 benchmark 里（研究者推断）。(ii) leanVM README 显示 2→1 递归一次 0.29 s，递归是 leanVM 的设计目标而不是意外负担 [3]。(iii) Aerie 的 32,768 签名是默认独立 salt 模式；66 KiB 的小体积需要共用 salt 模式及额外假设 [4]:L57-65。

### 论点 B：所有已部署 PQ SNARK 都靠 ROM（Fiat–Shamir）；存在“任何具体哈希实例化都完全不安全”的反例；反例来自关于验证者自身哈希的自指命题；递归恰好就是这类命题 → 递归 SNARK 的安全性在 ROM 中无法建立
- 答案：**大体有文献支持，但最后一句比定理说得更强。**
  - “ROM 中安全、但任何实例化都不安全”的反例：CGH 1998 对签名/加密给出（observed，[10] 摘要）；KRS 2025/118 对“标准、流行、实际使用过”的 GKR 类论证给出：对每一种 FS 哈希都能构造一个电路证明假命题（adaptive soundness 失效）[11]。
  - “自指”机制：Fenzi（2026/1838）复述 KRS 时写明攻击电路“internally computes its own first Fiat–Shamir challenge”[12]。这与递归“在电路里重算内层验证者的 FS 哈希”是同一种结构（研究者解读；Thaler 推文 L19-21 与 a16z Aerie 博客 [5] 也这样表述）。
  - “递归安全性在 ROM 中无法建立”：ePrint 2024/728（Barbara, Chiesa, Guan；TCC 2025）证明 **relativized** succinct argument 在 ROM 中不存在，并明确“rule out this approach for IVC and PCD in the ROM”；但同一篇也写明“Ruling out the existence of standard (non-relativized) IVC and PCD in the ROM remains an open problem”[13]。因此准确说法是：**目前没有在普通 ROM 中的递归安全证明，最自然的路线已被证明走不通**；不是“已证明不可能建立”。
  - “所有已部署 PQ SNARK 都靠 ROM”：对哈希型 STARK 成立（leanVM 写的就是“128-bit ROM (64-bit QROM) soundness”[3]:L47）；对 Aerie 也成立——论文“prove knowledge soundness of Aerie in the classical random-oracle model”[6]，Akita 开放证明使用 Spongefish 证明流（FS 转录）[4]。所以论点 B 的前半句同样适用于格方案；Thaler 的区分点在于 Aerie **不递归**、HashToPoint 由验证者在电路外计算（[4]:L37-39），因此不需要“在电路里证明关于 FS 哈希的命题”。
- 反方回应：(i) 已知反例都需要攻击者能选择（或构造）一个依赖于哈希代码的电路；EIP-8288 当前只允许协议固定电路 + leanSPHINCS，攻击者不能自选被证明的程序（研究者推断，基于 [1]:L74 与递归电路伪代码）。(ii) Fenzi 给出可证明的缓解：从“生成出的实例”而不是“生成它的程序”派生首个 FS 挑战，可把 soundness 归约回底层协议 [12]——说明部分攻击面可以通过设计消除。(iii) Arnon–Yogev 提出 XFS 以防 KRS 型攻击，但 Brzuska–Hubáček–Kalsta（PKC 2026）又给出了 XFS 的人为反例 [14]——缓解方案本身也在攻防中，属于开放问题。

### 论点 C：标准递归安全证明的提取器运行时间随深度指数膨胀；EIP-8288 允许无限深度递归，同时把 recursive SNARK soundness 列为信任假设
- 答案：**两半都有一手支持。**
  - 膨胀：BCCT13 明确“security based on recursive knowledge extraction will work for only a constant number of recursive compositions (due to the polynomial blowup in extractor size for each such composition)”[15]——每层多项式膨胀，叠 d 层即随 d 指数增长（研究者把“每层多项式 → d 层指数”串起来，原文表述是“只支持常数深度”）。Chiesa–Guan–Samocha–Yogev（2023/1646）摘要：“known security analyses incur expensive blowups, which practitioners have disregarded”[16]；Maller–Mohnblatt–Zapico（2025/1663）摘要：“Recursive composition may quickly lead to a blowup in extraction time”[17]。
  - EIP-8288：“To enable unlimited-depth recursion, we need to pass the AGGREGATED_VK in as an input to the proof itself.”（[1]:L217）；Trust Assumption 3：“a STARK of a STARK of ... of a STARK must be sound. This is widely believed to be true ... However, this adds difficulty to end-to-end formally proving ... may potentially have unlimited recursion depth.”（[1]:L523）。
  - 额外佐证（本路新发现）：leanerVM 审计 leanVM @a386121 时写明“No public decreasing recursion-depth measure was found ... MAX_RECURSIONS bounds child arity, not depth”，因此递归提取需要先补一个良基性论证 [19]。
- 反方 / 限定：(i) “证明松”≠“有攻击”：提取器膨胀是**证明技术**的损失，不是已知攻击的成功率（Thaler 自己用的是“suggesting that security may degrade”，推文 L23）。(ii) mempool 递归深度在实践中随交易在 mempool 停留的 `AGGREGATION_INTERVAL` 轮数增长（每轮节点优先折叠“自己上一轮的聚合”，[1] Recursive Mempool Aggregation 节），因此深度无界（研究者推断，规范未给出上界）。

### 论点 D：更理想化模型里的证明避开了膨胀，但只说明攻击必须利用具体哈希——而 FS 攻击正是这样做的
- 答案：**前半句 observed，后半句是合理解读。** 2023/1646：若 SNARK 有 straightline knowledge soundness，PCD 安全性“essentially the same as the underlying SNARK”，并“offers an idealized model that provides new, albeit heuristic, insights for the concrete security of recursive STARKs … partial evidence justifying the parameter choices”[16]（作者含 StarkWare 的 Shahar Samocha）。2025/1663 的 osROM“strictly harder to instantiate than the ROM”，能对多项式深度给出可证明安全，但分析对象是 HyperNova 椭圆曲线二循环，不是哈希型 STARK [17]。2024/728 列出在 SROM / LDROM / AROM 中已有 relativized SNARK 构造 [13]。
- 解读：这些模型把哈希理想化得更强（可在电路中“算”预言机或给预言机签名），所以它们说明“通用攻击必须利用具体哈希的结构”——与 KRS 型攻击的方式一致。这一步是 Thaler 的论证，也是 2023/1646 作者自己用“heuristic”“partial evidence”所承认的范围。

### 论点 E：没有已知的对 SNARK 递归的直接攻击；AI 可能加速密码分析
- 答案：前半句 **observed（Thaler 原话 L25）且本路未找到反例**；后半句 **speculative**（无法验证的预测）。
- 相关但不同类的证据：递归聚合的**实现 bug** 真实存在——ZisK v1.3.2-alpha 修复 GHSA-3j5v-j2rm-9c5f：证明者可把所有子证明标成 null 以跳过 STARK 检查，最终证明会对“从未被证明的执行”被接受 [20]；SP1 v3.0.0 前递归验证电路 `verify_shard` 在采样 zeta 前未把累积和写入 FS 转录（GHSA-8m24-3cfx-9fjw，2024-10-15 修复）[21]。这类漏洞支持 a16z 博客“recursion is intricate and bug-prone”[5]，但不是论点 B/C 所说的理论缺口。
- Matthew Green 对 KRS 的解读提出更坏的设想：递归树里一个恶意程序的“bugdoor”可能跨程序边界破坏整棵树的安全性——他明确把这写成可能性，不是已知结果 [22]。

### 论点 F：leanVM 是为哈希签名与递归设计的极简 VM，不是通用计算；二进制域 SNARK 证明整数乘法慢
- 答案：**前半句有一手支持，后半句本路无一手 benchmark。**
  - leanVM README 自述“minimal hash-based zkVM, for post-quantum Ethereum”（[3]:L7）；ISA 计划从 leanISA 迁到 RISC-V rv64im（[3]:L59）；零知识尚未支持（[3]:L60）。leanerVM 审计：当前 ISA 只有 6 个 opcode（XOR、MUL_NATIVE、SET_CONSTANT、DEREF、JUMP、BLAKE2S）[19]。
  - 第三方实验：ERC-8403 作者在 leanVM b977f5fa 上跑过“签名 + Merkle 成员”程序，并写明“leanvm’s recursion guest verifies raw signatures and proofs of itself today, not proofs of another program”[23]。这直接支持“把任意 client-side STARK 送进 8288 管线”目前尚未打通。
  - “二进制域证明整数乘法慢”：leanVM README 的 Fibonacci benchmark 是 mod 2^64−1 的乘法，6.2M cycles/s（[3] Fibonacci 节），但没有格运算（模 q 多项式乘法）的 benchmark；本路没有找到可比数据 → 保持 speculative。

### 论点 G：“密码学僵化从来不安全”的双重标准；隐私链需要公钥加密，哈希做不到
- 答案：**这是价值/系统层论证，不是可检验的事实陈述**，只能记录原意。可检验的子命题“公钥加密不能以黑盒方式仅从哈希（单向函数/随机预言机）构造”是经典结果（Impagliazzo–Rudich 1989 型黑盒分离），本路未抓取原文核实，标 speculative。
- 反方：EIP-8288 一方的论证是“把应用密码学移出基础层”，隐私协议可以在 client-side STARK 里用格加密，基础层仍 hash-only（Vitalik 2026-10-19 推文，见 decentrek_status_2112535053188145367.md 引文）；但这恰好又回到论点 F 的工程障碍与论点 B/C 的递归假设。

---

## Q2 理论背景与文献（核实结果）

| 文献 | 作者 / 单位（核实） | 结论（摘要层） | 与递归争论的关系 |
|---|---|---|---|
| CGH, ePrint 1998/011 | Canetti, Goldreich, Halevi | 存在 ROM 中安全、任何实例化都不安全的签名与加密方案 [10] | ROM 方法论有反例的源头；方案是人为构造的 |
| BCCT13, ePrint 2012/095（STOC 2013） | Bitansky, Canetti, Chiesa, Tromer | 递归组合每层提取器多项式膨胀，仅支持常数深度（或用深度约简） [15] | “提取器随深度膨胀”说法的出处 |
| 2023/1646（TCC 2024） | Chiesa, Guan (EPFL), Samocha (StarkWare), Yogev (Bar-Ilan) | straightline KS 下 PCD 几乎无安全损失；对递归 STARK 是“理想化、启发式”的部分证据 [16] | 支持递归一方最强的理论回应，作者自己限定了范围 |
| 2024/728（TCC 2025） | Barbara (Bocconi), Chiesa, Guan (EPFL) | ROM 中 relativized succinct argument 不存在；排除了 ROM 中经此路线得到 IVC/PCD；非相对化 IVC/PCD 是否存在仍开放 [13] | Thaler“ROM 中无法建立”的最直接依据，但比他的措辞弱 |
| 2025/118（CRYPTO 2025） | Khovratovich (EF), Rothblum (Succinct), Soukhanov (EF) | 对 GKR 类协议，任意 FS 哈希都能构造证明假命题的电路；还可把任意电路 C 改写成功能等价的 C*；非自适应版本要么深度极大、要么需额外假设 [11] | “具体 FS 攻击”的主要证据；攻击对象不是 FRI/STARK，也不是递归 |
| 2025/1663（ASIACRYPT 2025） | Maller (EF, PQShield), Mohnblatt (Bain Capital Crypto, zkSecurity), Zapico (EF) | osROM 比 ROM 更难实例化，但可对多项式深度给出可证明的 IVC 安全；分析 HyperNova（曲线循环） [17] | EF 研究者自己承认“theoretical challenges limit the provable security of known IVC constructions” |
| 2026/1838 | Fenzi (EPFL) | KRS 扩展到“程序生成实例”的 R1CS 系统（Spartan、Aurora 变体）；给出可证明的缓解 [12] | 攻击面扩大 + 缓解思路 |
| Brzuska–Hubáček–Kalsta, PKC 2026 | Brzuska, Hubáček, Kalsta | 简化 BBHMR 攻击，PlonK 等也可受 GKR 式攻击；给出 XFS 的人为反例 [14] | 缓解方案仍在攻防 |
| 2023/1071 | （FRI 的 FS 安全） | 证明 FRI 等协议的 round-by-round soundness，从而 BCS 编译在 ROM 中安全 [18] | 单层 STARK 在 ROM 中有证明；不覆盖递归 |

不确定之处：未能读论文正文核对主定理编号与 limitations 节；KRS 是否讨论递归 / STARK 的适用性未核实（只读到摘要与 Fenzi、Green 的转述）。

## Q3 实际系统怎么处理递归风险

- 答案：**本路证据显示：部署方普遍依赖“参数按单层 ROM 安全设定 + 递归不单独计损”的工程惯例，EIP-8288 没有限制深度。**
- 依据：
  - EIP-8288：递归 STARK 由固定 `AGGREGATED_VK` 验证，VK 作为公开输入以支持无限深度（[1]:L215-217）；只接受 leanSPHINCS，leanSTARK 保留（[1]:L74）；`DEPS_HASH` 目前是 BLAKE2s，BLAKE3 为首选替代（[1]:L522）。
  - leanVM：128-bit ROM / 64-bit QROM、无 proximity gap 猜想、BLAKE2s 为占位、形式化验证进行中、未达生产（[3]:L43-58）。leanerVM：FS 一节规范为 TODO，每级 WHIR grinding 17 bits；T6 递归提取桥开放；MAX_RECURSIONS 只限分叉数不限深度 [19]。
  - 2023/1646 摘要：从业者“disregarded”已知分析的膨胀，因为按其设参数代价过高 [16]——这是“工程惯例”的直接证据。
  - Stwo README：哈希通道 Blake2s（默认）/Blake3/Poseidon252/Keccak；soundness 参数“MUST be chosen for the target security level by the consumer”[24]。
- 不确定之处：SP1、RISC Zero、Plonky2/3 的递归深度是否有界、递归层是否单独计损，本路未能核实（搜索限流）。

## Q4 Aerie 一方的假设

- 答案：**Aerie 不递归，但同样依赖 FS/ROM（经典 ROM，而非 QROM）、Falcon 在 ROM 中的格假设归约，共用 salt 模式还要一个没有标准归约的额外假设，且是研究发布。**
- 依据：knowledge soundness 在 classical ROM 中证明 [6]；默认模式签名者的不可伪造性由 Fouque et al. 在 ROM 中归约到格假设（[4]:L52-55）；共用 salt 模式：“No reduction to a standard lattice assumption is known, and no attack is known.”（[4]:L64-65）；“research release … Neither parameter set has passed the production acceptance criteria”（[4]:L20-24）；不声称零知识（[4]:L40-41）。
- 解读：Thaler 论点 B 的“所有 PQ SNARK 都靠 ROM”同样覆盖 Aerie；Aerie 与 leanVM 的差别在“是否需要在电路里证明关于 FS 哈希的命题（递归）”，以及“经典 ROM 证明 vs 声称 64-bit QROM”。两者都没有完成端到端的量子模型安全证明（研究者推断，基于 [3]:L47、[6]）。

## Q5 证据层面的结论：论点 × 反驳 × 证据强度

| 论点 | 最强反驳 | 证据强度 | 归层 |
|---|---|---|---|
| A hash-only 还依赖递归 soundness | 递归 STARK 已在链上长期运行、被“广泛相信” | 强（EIP-8288 自己列为假设） | 共识 |
| A' Aerie 单机无递归覆盖一个 slot | 只计证明时间，不计收集；单一参数/模式 | 中（作者自测） | 工程事实 |
| B 递归安全在 ROM 中无法建立 | 2024/728 只排除相对化路线；非相对化开放 | 中强（定理 + leanerVM 承认） | (a) 理论缺口 |
| B' 存在实用 FS 攻击 | 攻击需攻击者自选依赖哈希的电路；GKR/R1CS 类，非 FRI；有缓解 | 强（KRS、Fenzi、BHK） | (b) 已知攻击，但不针对递归/STARK |
| C 提取器随深度膨胀；8288 允许无限深度 | 膨胀是证明损失非攻击；理想化模型中无损 | 强（BCCT13、8288 原文、leanerVM） | (a) |
| D 理想化证明只说明攻击须利用具体哈希 | 2023/1646 作为部分证据支持现行参数 | 中（解读） | (a) |
| E 无已知递归攻击 / AI 加速分析 | — | 前半强，后半无法验证 | (b)/推测 |
| F leanVM 非通用；格运算慢 | 计划迁 RISC-V；Thaler 自己也说“optimistic” | 前半强，后半无 benchmark | 工程 |
| G 双重标准；隐私需 PKE | 可把格放在应用层 STARK 内 | 价值判断 | 非事实 |
| 对 EIP-8288 的可利用漏洞 | — | 未发现 | (c) 无 |

**社区共识（双方文本都承认）**：递归 FS-SNARK 在普通 ROM 中没有安全证明；标准证明不支撑任意深度；实践中靠启发式与“未见攻击”。
**开放问题**：是否存在对“协议固定递归电路”（攻击者不能自选程序）的 FS 攻击；QROM 下的递归；EIP-8288 引入用户自带 STARK 后攻击者能否构造 KRS/Fenzi 型“自指”程序。

---

## 概念入门

- **Fiat–Shamir 变换**：把交互式证明里验证者的随机挑战换成“对目前为止的转录求哈希”，从而得到一个可以离线发送的非交互证明。几乎所有实用 SNARK/STARK（包括 leanVM 和 Aerie）都靠它。它的安全性通常只在把哈希理想化后才能证明。
- **随机预言机模型（ROM）/ QROM**：分析时把哈希当成一个所有人只能“查询”、输出完全随机的黑盒。真实哈希有简短代码，不可能真的是随机函数，所以 ROM 证明是启发式。QROM 允许攻击者以量子叠加方式查询，是量子攻击者下更合适的模型，安全位数通常更低（leanVM：128 位 ROM / 64 位 QROM）。
- **递归证明 / IVC / PCD**：递归就是“证明我验证了另一个证明”。IVC 是一条链上逐步累积（每步证明前一步正确），PCD 推广到任意有向图/树，多个互不信任的参与者各自产出、合并证明——EIP-8288 的 mempool 聚合树就是 PCD 形态。
- **Knowledge soundness 与提取器**：soundness 只要求“假命题过不了”；knowledge soundness 要求“凡能让验证者接受的证明者，都可以被一个提取器算法从中取出见证（例如签名）”。对签名聚合必须用后者，因为“某公钥存在有效签名”本身常常是真命题。
- **提取器膨胀与 straightline 提取**：标准提取器通过“倒带”证明者多次运行来取见证，递归每多一层就要对内层再倒带，耗时成倍叠加，所以只能支撑常数深度。straightline 提取器只看证明者的预言机查询记录、不倒带，可以无损地逐层组合，但通常只在理想化预言机模型中成立。
- **相对化（relativized）SNARK**：能证明“本身包含预言机查询的计算”的 SNARK。递归验证电路必须重算内层的 FS 哈希，所以在预言机模型里分析递归需要相对化 SNARK；2024/728 证明它在 ROM 中不存在。
- **自指 FS 攻击（KRS 型）**：攻击者构造一个在内部计算 FS 哈希的电路，提前“知道”挑战值，从而为假命题造出被接受的证明。它只在具体哈希下成立（ROM 中哈希没有代码可算），说明 ROM 证明与现实之间的缝隙在实用协议中也会被利用。

## 资料中被修正的地方

1. 任务说明把 ePrint 2024/728 作者猜为“Chiesa & Yogev?”——实为 Annalisa Barbara、Alessandro Chiesa、Ziyi Guan（TCC 2025 大修订版）[13]。2023/1646 作者猜测正确（Chiesa, Guan, Samocha, Yogev）。
2. 外部调研 §5.3 对 2024/728 的转述基本正确，但没写出论文自己的边界：**非相对化 IVC/PCD 在 ROM 中是否存在仍开放**。Thaler 推文“can’t be established even in the ROM”同样比定理更强。
3. 外部调研 §5.4 把 2025/1663（osROM）当作“支持递归一方的实质回应”。论文的分析对象是 HyperNova 椭圆曲线二循环（非 PQ、非哈希型 STARK），且 osROM 比 ROM 更难实例化；它更像是“EF 研究者承认 IVC 可证安全性受限并提出新模型”，不是对递归 STARK 的直接背书。
4. 外部调研未提及 leanVM 官方形式化项目 leanerVM 已把递归提取（T6）列为开放问题、并指出 leanVM 没有递减深度度量——这是 Ethereum 一方对论点 B/C 的一手承认，比外部调研引用的任何材料都直接。
5. 外部调研 §5.5 说 KRS 作者“来自 Ethereum Foundation 和 Succinct”——与 ePrint 页一致（Rothblum 同时是 Technion 副教授）。注意：Succinct 是 SP1 的公司，Thaler 的推特账号名 @SuccinctJT 与该公司无关（研究者备注，避免混淆）。
6. 任务说明称 Thaler 为“Jolt 作者”——准确说是 Jolt 合著者（Arun, Setty, Thaler）[8]。
7. 外部调研称“[X 链接]未能直接读取”，因此没有覆盖 Thaler 推文点名 EIP-8288“允许无限深度递归，同时列为信任假设”这一具体论断；本路已用 [1]:L217、L523 核实为准确。

## 来源

1. **PRIMARY** eip-8288@5a4387b.md（ethereum/EIPs @5a4387b）——递归电路伪代码、无限深度、信任假设第 3 条、当前只接受 leanSPHINCS。
2. **PRIMARY** SuccinctJT_status_2112706944548880442.md（Justin Thaler 推文，2026-10-21）——论点 A–G 原文。
3. **PRIMARY** leanVM-README@3a37fb6.md——128-bit ROM / 64-bit QROM、BLAKE2s 占位、未达生产、极简 VM、递归 benchmark。
4. **PRIMARY** aerie-README@49b6c21.md——研究发布、HashToPoint 不在证明内、Fouque ROM 归约、共用 salt 额外假设、benchmark。
5. **PRIMARY** a16z crypto, “Fast post-quantum signature aggregation with lattice SNARKs”（2026-10-16，访问 2026-10-21）https://a16zcrypto.com/posts/article/fast-post-quantum-signature-aggregation-with-lattice-snarks ——a16z 对递归“bug-prone、ROM 中无法建立”的正式表述。
6. **PRIMARY** ePrint 2026/2501 Aerie 摘要页（Centelles, Dao, Badakhshan, Thaler）——经典 ROM 下的 knowledge soundness、无递归。
7. **PRIMARY** a16z crypto 团队页 https://www.a16zcrypto.com/team/justin-thaler ——Thaler 身份。
8. **PRIMARY** Georgetown 个人页 https://people.cs.georgetown.edu/jthaler ——Research Partner + 副教授（休假）、Jolt 合著。
9. **PRIMARY** decentrek_status_2112535053188145367.md（内含 Vitalik 2026-10-19 推文）——“EIP-8288 maximalism”、任意密码学 client-side STARK 化。
10. **PRIMARY** ePrint 1998/011 CGH 摘要——ROM 方法论反例。
11. **PRIMARY** ePrint 2025/118 KRS 摘要页——GKR 类协议 FS 攻击的范围与条件、作者单位。
12. **PRIMARY** ePrint 2026/1838 Fenzi 摘要与 PDF 片段——KRS 机制（电路内部计算自己的 FS 挑战）、扩展到 Spartan/Aurora、缓解。
13. **PRIMARY** ePrint 2024/728 摘要与 PDF 片段——ROM 中 relativized SNARK 不存在；非相对化 IVC/PCD 开放。
14. **PRIMARY** Brzuska, Hubáček, Kalsta, “Simple Attacks against (Extended) Fiat-Shamir”, PKC 2026（Aalto 研究门户页）——GKR 式攻击扩展、XFS 反例。
15. **PRIMARY** ePrint 2012/095 BCCT PDF 片段——提取器每层多项式膨胀、仅常数深度。
16. **PRIMARY** ePrint 2023/1646 摘要——straightline KS 下 PCD 无损；对递归 STARK 是启发式部分证据；从业者忽略已知膨胀。
17. **PRIMARY** ePrint 2025/1663 摘要——递归组合提取时间膨胀、osROM、多项式深度可证安全（HyperNova）。
18. ePrint 2023/1071 “Fiat-Shamir Security of FRI and Related SNARKs”（搜索片段）——单层 FRI 类协议的 FS/ROM 安全。
19. **PRIMARY** Verified-zkEVM/leanerVM docs/architecture.md（最后修改 commit 28bbeb9，2026-10-20）与 docs/leanvm-target.md（main，访问 2026-10-21；审计基线 leanVM @a386121）——T6 递归提取桥开放、T7 只是条件化目标、无递减深度度量、FS 规范 TODO。leanVM README 的“in progress”链接指向此仓库。
20. **PRIMARY** 0xPolygonHermez/zisk Release v1.3.2-alpha（访问 2026-10-21）——递归聚合 soundness bug（GHSA-3j5v-j2rm-9c5f）。
21. zksecurity/zkbugs 数据集条目（转述 SP1 GHSA-8m24-3cfx-9fjw）——SP1 递归验证电路 FS 转录遗漏；未直接打开 GitHub advisory 原页。
22. Matthew Green, “How to prove false statements? (Part 1)”（2025-02-04，访问 2026-10-21）——对 KRS 的解读与“递归树跨程序 bugdoor”的设想（明确为可能性）。
23. **PRIMARY** ethresear.ch “ERC-8403: an account as one hash, and post-quantum keys”（Daniil Ankushin，2026-10-11）——leanVM b977f5fa 实验；递归 guest 目前只验证原始签名和自身证明。
24. **PRIMARY** starkware-libs/stwo README（搜索片段，访问 2026-10-21）——哈希通道选项、soundness 参数由使用者选择。

## 开放问题

1. 是否存在针对“协议固定的递归电路”（攻击者不能自选被证明程序）的 FS 攻击？KRS/Fenzi 型攻击都需要攻击者控制电路或程序。
2. EIP-8288 一旦启用 `LEANSTARK_SCHEME`（用户自带 VK / 程序），攻击者能否提交在内部计算 leanVM FS 哈希的“自指”程序？Fenzi 的“从生成实例派生挑战”缓解是否适用于 leanVM 的转录设计？
3. 递归在 QROM 下的安全性：leanVM 的 64-bit QROM 是单层数字还是含递归？README 未说明。
4. SP1 / RISC Zero / Plonky3 / Stwo 生产部署的递归深度是否有界、是否对递归单独计损——本路未核实。
5. 对 Thaler 2026-10-21 推文的实质性回应（EF、StarkWare、leanEthereum 研究者）——本路检索未找到（搜索后段限流，且 x.com 不可直接检索回复）。
6. KRS 论文正文是否讨论其对 FRI/STARK 及递归的适用性——ePrint 全文无法抓取。
7. 二进制域 SNARK 证明格运算（模 q 多项式乘法）的实际开销——无可比 benchmark。

## 台账

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| R1 | Justin Thaler 是 a16z crypto research 的 Research Partner，同时是 Georgetown 计算机系副教授（休假中） | [7] a16z 团队页；[8] Georgetown 个人页 About Me | observed |
| R2 | Thaler 是 Aerie 论文的作者之一，批评的是与自己方案竞争的路线 | [6] ePrint 2026/2501 作者列表 | observed |
| R3 | EIP-8288 把“递归 STARK 的 soundness”列为独立的信任假设，与哈希函数 soundness 分开 | [1] eip-8288@5a4387b.md:L521-523 | observed |
| R4 | EIP-8288 自述该假设“widely believed to be true”，且“adds difficulty to end-to-end formally proving the scheme” | [1] eip-8288@5a4387b.md:L523 | observed |
| R5 | EIP-8288 把 AGGREGATED_VK 作为证明的公开输入，目的就是支持无限深度递归 | [1] eip-8288@5a4387b.md:L191、L217 | observed |
| R6 | EIP-8288 规范没有给递归深度设上限；mempool 每轮会把自己上一轮的聚合再折叠，深度随交易在 mempool 的停留轮数增长 | 由 R5 与 [1] Recursive Mempool Aggregation 节（优先级第 1 项）推出：每个 AGGREGATION_INTERVAL 都在上一轮证明之上再包一层 | inferred |
| R7 | 当前草案只接受 leanSPHINCS 依赖，用户自带 STARK（LEANSTARK_SCHEME）仍是保留值 | [1] eip-8288@5a4387b.md:L74 | observed |
| R8 | 因此在当前草案里，攻击者不能把自己选的程序放进递归树，被递归证明的只有协议固定电路 | 由 R7 与 [1] Recursive STARK Proof Structure 推出：电路只验证 leanSPHINCS 签名和同一 AGGREGATED_VK 的子证明 | inferred |
| R9 | leanVM 声称 128 位 ROM、64 位 QROM soundness，形式化验证进行中、尚未达到生产就绪 | [3] leanVM-README@3a37fb6.md:L43-52 | observed |
| R10 | Aerie 的 knowledge soundness 是在经典随机预言机模型中证明的，所以它同样依赖 Fiat–Shamir/ROM | [6] ePrint 2026/2501 摘要；[4] aerie-README 致谢中的 Spongefish 证明流 | observed |
| R11 | Aerie 的 HashToPoint 由验证者在证明之外计算，证明里不包含哈希 | [4] aerie-README@49b6c21.md:L37-39 | observed |
| R12 | Aerie 与 leanVM 的安全差别不在“是否依赖 ROM”，而在“是否需要在电路内证明关于 FS 哈希的命题” | 由 R9、R10、R11 推出：两者都靠 ROM，只有递归方案要在电路里重算验证者哈希 | inferred |
| R13 | Aerie 在 M4 Max 上用 16 线程约 645 ms 证明 32,768 个 Falcon-512 签名，单个证明，无递归 | [4] aerie-README Falcon-512 结果表；[6] 摘要 | observed |
| R14 | Aerie 的共用 salt 模式依赖一个没有已知标准格假设归约的额外假设（也没有已知攻击） | [4] aerie-README@49b6c21.md:L57-65 | observed |
| R15 | Aerie 是研究发布，两套参数都未通过其发布政策的生产准入标准 | [4] aerie-README@49b6c21.md:L20-24 | observed |
| R16 | 存在 ROM 中可证安全、但任何具体哈希实例化都不安全的签名与加密方案（人为构造） | [10] ePrint 1998/011 摘要 | observed |
| R17 | KRS 证明：对一种标准且实际用过的 GKR 类论证，任意 FS 哈希都能构造出可证明假命题的电路 | [11] ePrint 2025/118 摘要 | observed |
| R18 | KRS 攻击的关键是电路在内部计算自己的首个 Fiat–Shamir 挑战 | [12] ePrint 2026/1838 引言对 KRS 的复述 | observed |
| R19 | KRS 的非自适应版本要么电路深度极大、要么需要额外假设 | [11] ePrint 2025/118 摘要末段 | observed |
| R20 | KRS 作者中 Khovratovich 与 Soukhanov 署名 Ethereum Foundation，Rothblum 署名 Succinct | [11] ePrint 2025/118 作者单位 | observed |
| R21 | Fenzi 把 KRS 型攻击扩展到“由程序生成实例”的 R1CS 系统（Spartan、Aurora 的变体） | [12] ePrint 2026/1838 摘要 | observed |
| R22 | Fenzi 证明：从生成出的实例而非生成它的程序派生首个 FS 挑战，可把 soundness 归约回底层协议 | [12] ePrint 2026/1838 摘要 | observed |
| R23 | 为防 KRS 型攻击提出的扩展 FS（XFS）已有人为构造的反例 | [14] Brzuska–Hubáček–Kalsta PKC 2026 摘要 | observed |
| R24 | 已知的实用 FS 攻击都针对 GKR/R1CS 类协议，且需要攻击者能选择依赖哈希的电路；本路没找到针对 FRI 型 STARK 或递归本身的同类攻击 | 由 R17、R19、R21 推出，并结合本路检索结果（未找到反例） | inferred |
| R25 | 在 ROM 中，能证明“含预言机查询的计算”的相对化 succinct argument 不存在，这一路线下的 IVC/PCD 被排除 | [13] ePrint 2024/728 摘要 | observed |
| R26 | 2024/728 明确写道：非相对化 IVC/PCD 在 ROM 中是否存在仍是开放问题 | [13] ePrint 2024/728 PDF §1 片段 | observed |
| R27 | Thaler 说递归 SNARK 的安全性“在 ROM 中也无法建立”，这比定理更强；准确说法是目前没有 ROM 中的证明，且最自然的路线已被排除 | 由 R25、R26 推出 | inferred |
| R28 | 基于递归知识提取的标准证明只对常数次递归组合有效，原因是每层提取器都会多项式膨胀 | [15] ePrint 2012/095 BCCT “Challenge 2” 段 | observed |
| R29 | 每层多项式膨胀叠加 d 层，提取器开销随递归深度指数增长，与 Thaler 的说法一致 | 由 R28 推出：多项式的 d 次复合是 d 的指数 | inferred |
| R30 | 已知 PCD 安全分析会带来昂贵的膨胀，而从业者因按其设参数代价过高而忽略了它 | [16] ePrint 2023/1646 摘要 | observed |
| R31 | 若底层 SNARK 有 straightline knowledge soundness，PCD 安全性与底层 SNARK 基本相同，但只在理想化预言机模型中成立，作者称之为对递归 STARK 参数的“启发式、部分”证据 | [16] ePrint 2023/1646 摘要 | observed |
| R32 | osROM 比 ROM 更难实例化，可对多项式深度给出可证明的 IVC 安全，分析对象是椭圆曲线二循环上的 HyperNova | [17] ePrint 2025/1663 摘要 | observed |
| R33 | EF 研究者在 2025/1663 中承认“理论挑战限制了已知 IVC 构造的可证明安全性” | [17] ePrint 2025/1663 摘要首段 | observed |
| R34 | leanVM 的官方形式化项目把递归提取桥（T6）列为开放研究问题，端到端 soundness 定理（T7）在 T6 解决之前只是条件化的目标模式 | [19] leanerVM docs/architecture.md @28bbeb9 “Target theorem ladder” T6、T7 | observed |
| R35 | leanerVM 审计指出 leanVM 没有公开的递减递归深度度量，MAX_RECURSIONS 只限制子证明数量，不限制深度 | [19] leanerVM docs/leanvm-target.md “Concrete target map” | observed |
| R36 | leanerVM 明确禁止把 ROM 知识可靠性当作公理换成普通模型知识可靠性，并要求非 straightline 提取器给出有意义的深度上限 | [19] leanerVM docs/architecture.md T6 条目 | observed |
| R37 | 递归 FS-SNARK 在普通 ROM 中没有安全证明，这一点 Ethereum 一方的规范与形式化项目都承认，不只是 a16z 的说法 | 由 R4、R33、R34 推出 | inferred |
| R38 | Thaler 本人承认不知道任何对 SNARK 递归的直接攻击 | [2] SuccinctJT_status_2112706944548880442.md:L25 | observed |
| R39 | 本路没有找到针对 EIP-8288 的可利用漏洞，也没有找到对 leanVM 递归的已发表攻击 | 由 R24、R38 推出，并结合本路检索结果（覆盖不完整，见开放问题 5–6） | inferred |
| R40 | 其他 zkVM 的递归聚合出现过实现层 soundness bug：ZisK 允许把所有子证明标成 null 以跳过 STARK 检查 | [20] zisk Release v1.3.2-alpha（GHSA-3j5v-j2rm-9c5f） | observed |
| R41 | 这些递归实现 bug 属于工程层错误，不是对递归理论模型的攻击 | 由 R40 推出：根因是空子证明处理与 FS 转录绑定遗漏，修复后协议不变 | inferred |
| R42 | leanVM 自述是“极简、基于哈希的 zkVM”，计划从 leanISA 迁移到 RISC-V | [3] leanVM-README@3a37fb6.md:L7、L59 | observed |
| R43 | 截至 2026-10-11，leanVM 的递归 guest 只验证原始签名和自身证明，还不能验证其他程序的证明 | [23] ethresear.ch ERC-8403 帖（Ankushin，leanVM b977f5fa） | observed |
| R44 | 二进制域 SNARK 证明格运算的整数乘法很慢 | Thaler 推文 [2]:L32 的论断；leanVM README 只有 mod 2^64−1 的 Fibonacci 数据，无格运算对照，本路无法验证 | speculative |
| R45 | AI 会加速对 Fiat–Shamir 和递归的密码分析 | Thaler 推文 [2]:L25；这是对未来的预测，无法用现有证据验证 | speculative |
| R46 | 公钥加密不能以黑盒方式只从哈希构造 | Thaler 推文 [2]:L36；这是经典黑盒分离结果，但本路未抓取原文（Impagliazzo–Rudich 1989）核实 | speculative |
| R47 | 用户把任意程序放进递归树后，一个恶意程序的 bugdoor 可能跨程序边界破坏整棵树 | [22] Matthew Green 博客中明确作为可能性提出；无已知构造，只能当风险类别 | speculative |

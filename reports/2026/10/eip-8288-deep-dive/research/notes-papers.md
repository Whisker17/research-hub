# 论文全文核对（lane: papers，台账前缀 R，新增 R49 起）

日期：2026-10-21。来源：`/tmp/eip8288/papers/*.txt`。这些文本由 Internet Archive 快照的 ePrint PDF 转出，原始 URL 见 `/tmp/eip8288/papers/SOURCES.md`。页码取 PDF 页脚印的页码，节号和定理号照论文原文。英文引文为逐字摘录，每处不超过 2 句。

范围与限制：
- 8 篇全文中，主结果、引言、技术概述和作者讨论（结论 / 缓解措施）都读过。各篇的长证明附录没有逐行读完，分别是 2024/728 §4–7、BCCT §6–9、2023/1646 §3–7、KRS 附录 A、2025/1663 §3 之后、Fenzi §3–6、Aerie 附录。所以文中“全文未提到 X”一律只指已读部分。
- Brzuska–Hubáček–Kalsta（PKC 2026）仍然只有摘要，R23 继续保持“摘要层”。
- 本文件没有渲染，也没有提交 git。

---

## 1. 逐篇核对

### 1.1 CGH，ePrint 1998/011：“The Random Oracle Methodology, Revisited”（Canetti、Goldreich、Halevi；STOC 1998，修订版 2002-08-06）

**主结果。** 摘要（p.1）：“The main result of this paper is a negative one: There exist signature and encryption schemes that are secure in the Random Oracle Model, but for which any implementation of the random oracle results in insecure schemes.” 正式结论是 Theorems 4.4、4.6（§4，§6.3 有引用）。构造方法是以 correlation intractability 为核心的对角化，再结合 CS proofs（关键词：“diagonalization, application of CS-Proofs”，p.1；§2.2）。

**与本报告相关的限定。**
- 反例是刻意构造的签名和加密方案。CGH 摘要本身没有用 “contrived” 一词；这个定性来自 KRS 摘要：“So far, all of these examples have been contrived protocols that were specifically designed to fail.”
- 作者三人在 §6 各写了一份结论，意见并不一致。Canetti（§6.1，p.30）的说法最强：“the methods described in this work can be used to turn practically any idealized protocol described in the literature into a protocol that remains just as secure in the idealized model, but has no secure implementations.”

**对 Thaler 的意义。** 这篇支持 Thaler 的前提“ROM 证明不等于真实安全”。它的反例本身就是“让方案对自身所用哈希做对角化”，与 Thaler 说的 “contrived, self-referential statements about the very hash function” 一致。

### 1.2 BCCT，ePrint 2012/095：“Recursive Composition and Bootstrapping for SNARKs and Proof-Carrying Data”（Bitansky、Canetti、Chiesa、Tromer；STOC 2013）

**主结果。**
- Theorem 1（SNARK Recursive Composition，informal，§2.2，p.13）：“Any publicly-verifiable SNARK can be efficiently transformed into a corresponding publicly-verifiable PCD system for constant-depth compliance predicates.”
- 总定理（§1.2，p.6）把 PCD 限定为 “distributed computations of constant depth or over paths of polynomial depth”。

**“只支持常数深度”的原文。**
- §1.4 “Challenge 2: extractor efficiency and the depth of the computation”（p.10）：“a proof of security based on recursive knowledge extraction will work for only a constant number of recursive compositions (due to the polynomial blowup in extractor size for each such composition).”
- §2.2 “Why only constant depth?”（p.14–15，指向 Remark 6.3）：“The recursion works for at most a constant number of times, because each extraction potentially blows up the size of the extractor by a polynomial, and that is why we need d(C) = O(1).”

**绕开办法。**
1. 沿用 Valiant 的思路，但不用他的“极高效提取器”假设，改为在常数深度的“宽证明树”上聚合（p.10）：“We avoid Valiant's assumption by extending his idea into aggregating proofs along 'wide proof trees' of constant depth”。
2. Theorem 2（PCD Depth Reduction，§2.3，p.15）：“Any PCD system for constant-depth compliance predicates can be efficiently transformed into a corresponding path PCD system for polynomial-depth compliance predicates.” 做法是由合规谓词 TREE_C 强制计算呈 k 叉、深度为常数 c 的树形，再在其上建一棵浅而宽的“证明 Merkle 树”。前提是存在抗碰撞哈希。

**模型。** BCCT 在 plain model 下工作，依靠知识假设（例如 knowledge-of-exponent），不在 ROM 下。

**对 Thaler 的意义。**
- Thaler 说 “standard security proofs for recursion (in other models) suffer an 'extractor runtime' blowup that is exponential in the recursion depth”。这个说法与原文一致，括号里的 “in other models” 也准确。
- BCCT 自己只写“每层多项式膨胀，所以只能常数深度”，没有写 “exponential”。写明“随深度指数增长”的是 2023/1646 §1（p.3）和 2024/728 §1（p.3），见 1.4 和 1.3。所以 R29 可以从 inferred 升为 observed（换证据源）。
- 精确地说，2023/1646 给的形式是 $n^{c^d}$：指数部分随 d 指数增长（p.9）。
- 研究者推断：8288 的 mempool 聚合树没有用 BCCT 那种“谓词强制的常数深度宽树”。深度随 mempool 轮数增长（R6），所以 BCCT 的深度约简不能直接套用到 8288。这一条是推断，见 R62。

### 1.3 Barbara–Chiesa–Guan，ePrint 2024/728：“Relativized Succinct Arguments in the ROM Do Not Exist”（文本版本 2025-09-23；Aerie 参考文献标为 TCC 2025）

**“relativized succinct argument”的定义要点。**
- 摘要（p.1）：“A relativized succinct argument in the random oracle model (ROM) is a succinct argument in the ROM that can prove/verify the correctness of computations that involve queries to the random oracle.”
- 作者特意用了一个很弱的“简洁”标准。对 DTIME，只要求验证者对预言机的查询数 vq = o(t)；验证时间和证明长度都可以是 poly(t)（p.4）。对 NTIME，只要求证明长度 as = o(t)。
- 完备性和可靠性误差都允许是常数（§2.1，p.7）。

**主定理。**
- Theorem 1（informal，§1.1，p.4）：$\mathrm{DTIME}^O[t] \not\subseteq \mathrm{NARG}^O[vq = o(t)]$。
- Theorem 2（informal，p.4）：$\mathrm{NTIME}^O[t] \not\subseteq \mathrm{NARG}^O[as = o(t)]$。
- Lemma 1（informal，p.5）把结论推广到交互式论证。§2.7（p.14）进一步推广到只有计算可靠性的情形：“All negative results that we discussed so far hold even if the (non-interactive or interactive) argument is merely computationally sound”。

**对 IVC/PCD 的推论（p.5）。** “our results imply that relativized IVC and PCD in the ROM do not exist.” 紧接着一句是 “Ruling out the existence of standard (non-relativized) IVC and PCD in the ROM remains an open problem.” 同一段还写道：“it is not known how to achieve IVC and PCD in the ROM based on falsifiable assumptions.”

**关于递归分析的背景，作者原话（§1，p.3）：** “the security analysis works only for a constant number of recursions [BCCT13; BCTV14; COS20] because each invocation of the underlying SNARK extractor incurs a polynomial blow-up in size/time relative to the prior invocation (leading to an exponential blowup in the number of recursions).”

**关于实际系统。** 已读部分（§1–§2.8）没有提到 STARK 或任何部署系统。唯一相关的一句在 §1.2（p.6）：“this observation can be used towards studying the concrete security of hash-based PCD constructions [CGSY24]”，也就是把读者指向 2023/1646。

**对 Thaler 的意义。**
- Thaler 原话是 “That's why the security of recursive SNARKs can't be established even in the random oracle model”。如果把它读作“纯 ROM 无法直接刻画递归这一步，最自然的相对化路线已被证否”，那么它与 2024/728、2023/1646 §1.1.2、Aerie §1.1 的原文一致。
- 如果把它读作“已经证明不可能”，就过头了：作者明确写着非相对化 IVC/PCD 在 ROM 中仍是开放问题。
- 结论：原台账 R27 “比定理更强”的判断成立，但应改为“偏强”，不是“错”。

### 1.4 Chiesa–Guan–Samocha–Yogev，ePrint 2023/1646：“Security Bounds for Proof-Carrying Data from Straightline Extractors”（文本版本 2024-09-11；TCC 2024。作者 Samocha 署名 StarkWare）

**主定理。** Theorem 1（informal，§1.1，p.4）：如果相对化论证 ARG 有 straightline 提取器，误差为 κ_ARG(λ,q,s)、提取时间为 t_ARG，那么由它规范构造的 PCD 满足：
- “knowledge soundness error κPCD(λ, q, s, N) ≤ κARG(λ, q, s′) where s′ := s + O(N · tARG(λ, q))”
- 提取时间 ≤ O(N·t_ARG)。

在纯 ROM 中，对手规模无关紧要，所以 “κPCD(λ, q, N) ≤ κARG(λ, q) which is independent of N”（p.6–7）。

**模型。** 定理在“预言机模型中的相对化论证”框架下成立，具体适用于 AROM、SROM（§2.2）和 ROM（§2.3、§6.3）。

用到真实的哈希型递归 STARK 时，作者的做法分两步（§2.3，p.12–14）：
1. 在 ROM 里构造一个“弱”相对化论证：把被证明计算的预言机查询-应答对直接附在证明里，由验证者自己去查。这样得到的是不简洁的 NARK 和不简洁的 PCD，可以由 Theorem 1 给出严格界。
2. 把这个“非简洁 PCD in ROM”当作真实递归 STARK 的理想化。这一步是启发式的。

STARK 的具体界（p.14）：$\kappa_{PCD} \le \kappa_{ARG} \le q\cdot\kappa_{IOP} + 4q^2/2^\lambda$。

**作者对递归 STARK 的原话和限定。**
- 摘要（p.1）：“our work offers an idealized model that provides new, albeit heuristic, insights for the concrete security of recursive STARKs used in blockchain systems. Our work could be viewed as partial evidence justifying the parameter choices for recursive STARKs made by practitioners.”
- §2.3（p.14）：“This is tantamount to conjecturing that attacks against (P̂, V̂) are no more effective than attacks against (P, V). More precisely, either an attack against (P̂, V̂) reduces to an attack against (P, V) (inheriting its security), or an attack (usefully) exploits the instantiation (and non-black-box use of) the concrete hash function, which remains an open problem.”
- §1（p.3）谈已知分析：“Overall this state of affairs implies that one is unable to set security parameters, and that the security loss is exponential in the recursion depth.”
- §1.1.2（p.5）：“the common practice is to set security parameters as if the security reduction incurred no costs.”
- §2.4（p.15–16）以 StarkWare 的递归 STARK（SHARP 类）为例。用户提交任意程序作为局部数据；合规谓词 “does not impose any bound on the depth (or size)”。作者写道：“In that system, security in the recursive composition of the STARK is assumed to equal the security of a standalone (non-recursive) use of the STARK”。

**关于 Fiat–Shamir 的具体哈希实例化。** 论文没有分析具体 FS 哈希。它只提到 SW21 里消息哈希 h 用的是 blake2s（p.16），并提醒随机预言机方法 “must, nevertheless, be applied with caution because it does not work for every protocol [CGH04]”（脚注 5，p.5），还引用了 BBHMR19。

**对 Thaler 的意义。**
- Thaler 的论点 D（“Proofs in more idealized models avoid the blowup, but they mainly tell us that an attack on SNARK recursion would have to exploit the concrete hash function”）几乎就是 p.14 那句 “either … or …” 的转述，应定为与原文一致。
- 原台账 R31 写“只在理想化预言机模型中成立”，不够准确。准确说法是：严格证明对象是 ROM 中的一个非简洁理想化版本；把结论套到真实递归 STARK 上，是与随机预言机方法同类的猜想。
- §2.4 的场景是“用户提交任意程序、深度不受限的递归 STARK”。这正是 8288 开放 `LEANSTARK_SCHEME` 后的形态（研究者推断）。

### 1.5 Khovratovich–Rothblum–Soukhanov（KRS），ePrint 2025/118：“How to Prove False Statements: Practical Attacks on Fiat-Shamir”（文本版本 2025-12-11；Fenzi 记为 CRYPTO 2025）

**作者单位（p.1 脚注）。** Khovratovich、Soukhanov 署名 Ethereum Foundation；Rothblum 署名 Succinct。R20 确认。

**攻击对象。** 基于 GKR 的简洁论证 Π_{comm,d}：GKR 加多线性多项式承诺（MLPCS），面向非确定性、深度有界的算术电路。p.3：“lies at the heart of practical deployed systems such as Expander [Pol24]”。承诺方案是泛化的（“For every hash function h and MLPCS comm”），不专指 KZG。

**攻击条件。**
- Theorem 1（Basic Attack，§1.1.2，p.4）：“for every d ≥ dcomm + dh + O(1) the FSh(Πcomm,d) protocol is not adaptively sound”。攻击电路 C* 依赖 comm 和 h：“if these involve some parametrization (e.g., a salt …) then these must be known to the cheating prover … As such, the attack breaks the adaptive soundness of the scheme.”
- Theorem 2（Extended Attack，p.5）：对任意电路 C，可以构造一个功能完全相同的 C*（“C computes the same function as C*”），用它证明任意输出。原文：“we can insert a 'backdoor' into it which allows us to prove any desired statement.”
- 非自适应版本（§4）：
  - Theorem 9（p.14）用通用图灵机电路加 quine。攻击程序作为见证传入，电路本身固定、不依赖密码学参数。代价是 M = poly(N)，作者自己说 “this construction is not efficient”。
  - 适用条件：承诺方案的代码比输入短，“including hash-based commitment schemes (FRI) and the seeded Pedersen commitment scheme”。KZG 这类结构化参考串的方案原则上不在此列。
  - Theorem 10（p.15）针对加法同态承诺。对 FRI，作者的原话是：“While we are unable to directly mount this attack against FRI-based schemes, it should be noted that many modern FRI-based protocols use batching … Against such protocols, this attack can be mounted.”
  - 注意：上述非自适应攻击攻击的仍是 FS 变换后的 GKR 协议，FRI 只是作为承诺方案出现。被攻击的不是 STARK（AIR + FRI）。

**是否讨论 STARK/FRI 与递归。**
- 关于递归（p.4–5）：“we remark that circuits that invoke these underlying primitives are actually quite common in practice. In particular, in the context of recursive proof composition [Val08, BCCT13, BCTV14].”
- 关于 FRI：只出现在 §4 的承诺条件里（见上），没有攻击 STARK 本身。

**结构性原因与缓解（§5，p.16）。**
- 原因：“the GKR-based protocol … has the key property that the prover does not commit to the full computation trace … Unfortunately, the fact that the computation is not committed to also enables our attack”。
- 缓解：“ensure that the circuit family considered is not powerful enough to compute the hash function … increase the depth of the hash function used … or reducing the depth of the circuit in question (possibly by committing to some of the intermediate values).” Arnon–Yogev [AY25] 另提出 XFS，但 KRS 说 “their model fails to capture our attack”。
- 保留意见：“while we do not know attacks for protocols that do not satisfy these properties, this does not mean that such attacks do not exist.”
- Expander 已部署缓解（p.3 脚注 4）。Remark 3（p.6）：GKR 用于 grand product 等规范简单的电路时，攻击 “does not seem to be applicable”。

**对 Thaler 的意义。**
- 它支持“实用 FS 攻击存在，且与递归电路的形态相关”。
- 攻击的结构前提是“不承诺完整计算轨迹”，并且攻击者要决定被证明的计算：在自适应版本里自造电路，在非自适应版本里往通用电路的见证中放程序。全量承诺轨迹的 STARK 不满足第一个前提。作者明确说这不等于其他协议安全。

### 1.6 Maller–Mohnblatt–Zapico，ePrint 2025/1663：“IVC in the Open-and-sign Random Oracle Model”

**作者单位（p.1）。** Maller 署名 Ethereum Foundation 与 PQShield；Mohnblatt 署名 Bain Capital Crypto；Zapico 署名 Ethereum Foundation。

**osROM 定义要点（§1.1，p.2–3）。** osROM 在 Chiesa–Tromer 的 signed ROM（SROM）上扩展：
- 查询形如 ([A_i, a⃗_i], aux)，其中 a⃗_i 必须是椭圆曲线承诺 A_i 的合法原像。只有这样，预言机才返回随机应答 α，以及对 (([A_i]), aux, α) 的签名 σ。
- 签名使验证者不必查询预言机，因此可以把它写成算术电路，实现相对化。
- 记录承诺原像，使 straight-line 提取成为可能。作者称这一点 “reminiscent of the algebraic group model (AGM)”。
- 摘要：“This model, while strictly harder to instantiate than the Random Oracle Model, allows the design of protocols that can efficiently verify calls to the oracle and support straight-line extractors.”
- 作者也承认模型本身不解决问题，只是把问题推迟到实例化：“While our model does not solve the above issues, it provides a framework in which protocols can be proven secure while deferring the challenges to the instantiation of the oracle.”（p.2）

**主结果。** 摘要：“we analyze the HyperNova (CRYPTO '24) IVC scheme in the osROM and show that it is secure over a two-cycle of elliptic curves, for polynomial depths of computation.” 分析对象是 folding 型、基于椭圆曲线的 IVC，不是哈希型 STARK。

**关于递归深度与提取的原话。**
- p.2，Challenge 2：“Composing arguments of knowledge may lead to protocols for which we do not know how to construct polynomial-time extractors. As noted by Bitansky et al. [5], this limits the depth of composition … to a constant. However, if the argument of knowledge admits a straight-line extractor, then composition may be performed securely for polynomial depth.”
- p.5：“Real-world deployments of IVC make the assumption that the chain of computation can be extended almost endlessly. However, most of our security proofs only allow for a constant number of computation steps.”
- 摘要首段：“Unfortunately, theoretical challenges limit the provable security of known IVC constructions.” R33 确认。
- p.2 还说，证明关于 NIFS 验证器的命题 “requires proving calls to the random oracle, contradicting the fact that succinct arguments in the ROM that prove statements about the random oracle do not exist [2], or heuristically instantiating the oracle, thus losing proven security.” 这里的 [2] 就是 2024/728。

**对 Thaler 的意义。** 这篇支持“现有递归/IVC 的可证明安全有理论缺口”，作者包括 EF 研究者。它给出的正面结果需要比 ROM 更强、更难实例化的模型，而且对象是椭圆曲线 IVC，不能当作对递归 STARK 的背书。

**留意。** p.6 提到并行工作 Bünz 等 [14] “their analysis is done in the 'pure-ROM' … focuses on Merkle-tree commitments”。这条线可能与“普通 ROM 中递归无证明”的措辞有关，本次没有核对，见第 4 节。

### 1.7 Fenzi，ePrint 2026/1838：“How to prove more false statements: Fiat–Shamir limitations on (generated) R1CS”（文本版本 2026-08-30；作者署名 EPFL，致谢中写明部分由 Ethereum Foundation 资助）

**攻击扩展的对象。**
- “generated relations”：实例 x = (1^T, …, s)，其中 s 是一个程序，运行后生成 R1CS 或电路实例。
- 摘要：“We show that, when the conversion process is 'expressive enough', an adversary controlling the program code can break soundness of the non-interactive proof system … We show that variants of the Spartan (CRYPTO 2020) and Aurora (EUROCRYPT 2019) proof systems for R1CS fall in this class.”
- §7（p.24）：被攻击的单变量 IOP “underlies protocols such as Aurora [BCRSVW19] and STIR [ACFY24]”。它用 Merkle 承诺和 RS 编码，经 BCS 编译（Corollary 7.6 中 h = (h_MT, h_FS)）。

**攻击条件。**
- Theorem 2（p.5）：“If V is a semantic verifier for c-generated CSAT that is fooled by delayed statement choice, then V_ARG^h … is not adaptively sound for any sufficiently efficient hash function h.”
- 关键在于 FS 首个挑战只哈希了程序 s，没有哈希生成出来的实例。p.6：“if the Fiat–Shamir hash contains only s (or a commitment to s in the preprocessing case) the protocol may be vulnerable.”
- 攻击是自适应的：攻击者知道具体哈希，并控制程序。

**缓解（p.6；正式结论为 Theorem 5.5）。**
- “If the R1CS matrices are included in the first Fiat–Shamir hash in Equation 1, then the attacks that we describe do not apply. In fact, hashing the generated statement provably reduces adaptive soundness to that of the underlying non-generated protocol (Theorem 5.5).”
- “We recommend caution and careful audits in any setting in which such computations are fully or partially under the control of third parties (e.g. when compiling user code, automatic precompiles, AI-generated circuits, and similar).”
- 关于 XFS：“To our knowledge, the security proofs in [AY25] do not give provable guarantees that XFS prevents variants of the attacks in the paper.”

**是否讨论递归或 STARK。** 全文已读部分没有直接讨论递归，也没有攻击 STARK/AIR。但 p.6 写道：“We thus believe our attacks apply to other relations and designs, such as proof systems for virtual machines, as long as the relation is (partially or fully) generated.” 这是作者的信念，不是定理。

**对 KRS 的复述（p.2）。** “A malicious prover can exploit this flexibility to construct a circuit that internally computes its own first Fiat–Shamir challenge and then uses the knowledge of the challenge to violate soundness.” R18 确认。

注意一处小出入：Fenzi 把 KRS 描述为 GKR 加 “[KZG10]”，而 KRS 原文针对任意 MLPCS，见第 3 节。

**对 Thaler 的意义。**
- 原台账写“这些攻击都不针对 FRI 型 STARK”。全文显示这句要改：Fenzi 的对象包含哈希型（Merkle/RS）IOP，即 Aurora/STIR 型。准确的说法是“未见针对固定 AIR 的 STARK 或递归验证电路的攻击”。
- 研究者推断：对 8288 而言，开放 `LEANSTARK_SCHEME` 后，用户提交程序（以 VK 哈希标识），正好落入 Fenzi 说的 “adversary controlling the program code” 场景。leanVM 的 FS 是否把“生成后的语句”绑进首个挑战，是一个具体的审计问题，本次没有核实。

### 1.8 Aerie，ePrint 2026/2501（Centelles、Dao、Badakhshan、Thaler）

**作者与披露。** Centelles 署名 Imperial College London 与 a16z crypto research；Dao 署名 CMU，部分工作在 LayerZero Labs 完成；Badakhshan 署名 LayerZero Labs；Thaler 署名 a16z crypto research。p.26 有 Disclosures：Thaler 是 a16z crypto 的 Research Partner。p.26 的 AI Assistance 一节写道，模型被用于 “derive the projection theorems and the security proofs”，作者对正确性负全责。

**知识可靠性的模型。**
- Definition 5.6（§5.6，p.18）：“We work in the classical ROM with the independent oracle families H = (Htr, Hexp, G, Hcmp, Hpk, Hdig, Hsetup)”。
- Theorem 5.9（Classical-ROM Knowledge Soundness，p.19）给出 ε_ext^ROM，其中包含 Module-SIS 项。摘要：“We prove knowledge soundness of Aerie in the classical random-oracle model and derive aggregate unforgeability from Falcon's security.”
- 已读部分（§1–§7）没有 QROM 定理，也没有 QROM 讨论。附录没有全部读完。
- FS 用 cSHAKE256 / SHAKE256（§6.1，p.21）。

**提取损失与参数（p.20）。** “The factor Qwrap + 2 is the expected run count of the Fiat–Shamir extractor [AFK21], and K̂ bounds the number of transcripts that the Akita extractor combines. The lattice estimates used to choose Akita's parameters exclude this factor (Qwrap + 2)K̂.” 其中 2^21.4 < K̂ < 2^39.7（p.19）。
- 研究者推断：Aerie 的参数选择同样没有计入自身归约的损失。这与 2023/1646 批评的递归实践（“as if the security reduction incurred no costs”）属于同一类做法，只是规模不同，而且与递归无关。

**对递归的批评原话。**
- §1.1（p.3）：“Avoiding recursion also avoids a gap in the security analysis. In recursive aggregation, each proof shows that the SNARK verifier accepts the proofs it combines, so the proven computation runs that verifier, including its hash function. The random-oracle model cannot describe this computation, and known analyses of recursion rest instead on non-falsifiable assumptions without concrete bounds (Section 1.2).”
- §1.2（p.4）：“This assumption is not falsifiable and gives no concrete bound, and the security loss of the composed proof is exponential in the recursion depth [BCCT12, CGSY23].” 以及 “Proofs in oracle models designed for recursion avoid the extractor assumption [CCG+23, CGSY23], but it is a conjecture that a concrete hash function instantiates these models. Circuits that evaluate their own Fiat–Shamir hash, as recursive verifiers do, are also the setting of the practical Fiat–Shamir attack of Khovratovich et al. [KRS25].”

**“不递归”的理由。** 理由有两条：一是性能，一台机器在一个 slot 内即可完成聚合，不需要多证明者协调（p.2–3）；二是上面那段安全理由。

作者也承认代价。§6.3（p.24）：“In exchange, leanVM can spread this work over many provers and merge proofs made by others, which Aerie cannot.” §7（p.25）：“Deployments that collect signatures across a network, as in leanVM's recursive design, would need either a way to merge Aerie proofs or a recursive verifier for them, and the second reintroduces the heuristic step that public salts avoid.”

**共用 salt 模式的假设（§3.2，p.9–10；§5.7，p.21；Assumption C.8）。** 共用 salt 时，签名者使用 “fixed-target signer”。原文：“The reduction assumes that this fixed-target signer is unforgeable (Assumption C.8). Fouque et al. prove unforgeability only for FN-DSA's fresh salts [FGdG+26], and we know of no attack on fixed-target retries.” 共用 salt 的大小只是估算值（“We report common-salt sizes only as estimates”）。框架用的是 key-prefixed，而 “the standard is not final”（p.9）。

**对 Thaler 的意义。**
- “Aerie 同样依赖 ROM”在全文层面成立：经典 ROM，加 Module-SIS 与 Falcon。
- Aerie 与递归方案的差别在于“被证明的关系里不计算哈希”（p.3：“Aerie's relation evaluates no hash function”），而不在于是否依赖 ROM。
- 新增两点值得在页面上中立呈现：其一，Aerie 只有经典 ROM 证明，正文没有 QROM 分析；其二，它的参数估计同样没有计入归约损失。

---

## 2. 台账修订建议

判定：确认 / 改写 / 降级 / 删除 / 新增。证据中的“文件”指 `/tmp/eip8288/papers/<id>.txt`，页码为 PDF 页脚页码。

| 行号 | 现在的论断（摘） | 判定 | 新论断（如改） | 新证据（文件 + 定理/节/页） | 类型 |
|---|---|---|---|---|---|
| R2 | Thaler 是 Aerie 作者之一 | 确认 | — | 2026-2501 p.1 作者栏；p.26 Disclosures | observed |
| R8 | 当前草案攻击者不能把自选程序放进递归树，只有协议固定电路 | 改写 | 当前草案中被递归证明的程序固定（`AGGREGATED_VK`），攻击者只能控制见证和依赖内容（签名、公钥、子证明），不能决定被证明的计算。已公开的 FS 攻击都需要攻击者决定被证明的计算（自造电路，或在通用电路的见证中放程序） | eip-8288@5a4387b.md:L168–219；2025-118 Thm 1/2（p.4–5）、Thm 9（p.14）；2026-1838 摘要 | inferred |
| R10 | Aerie 知识可靠性在经典 ROM 中证明，同样依赖 FS/ROM | 确认 | — | 2026-2501 Def 5.6、Thm 5.9（§5.6，p.18–19）；§6.1 cSHAKE256（p.21） | observed |
| R11 | Aerie 的 HashToPoint 由验证者在证明外计算 | 确认 | — | 2026-2501 §3.2（p.9）；p.3 “Aerie's relation evaluates no hash function” | observed |
| R13 | Aerie 约 645 ms、32,768 个 Falcon-512、单证明、无递归 | 确认 | — | 2026-2501 摘要；Table 2（p.22，0.65 s，16 线程） | observed |
| R14 | 共用 salt 依赖一个没有已知标准格假设归约的额外假设 | 改写 | 共用 salt 模式假设“fixed-target signer”不可伪造（Assumption C.8）；Fouque 等只证明了 fresh salt 的情形；作者称不知道有攻击；共用 salt 的大小只是估算 | 2026-2501 §3.2（p.9–10）、§5.7 “Common Salts”（p.21）、§6.2（p.23） | observed |
| R16 | 存在 ROM 安全但任何实例化都不安全的签名与加密（人为构造） | 改写 | CGH 证明存在在 ROM 中安全、但任何具体实现都不安全的签名与公钥加密方案（Thm 4.4、4.6）。构造方法是基于 correlation intractability 与 CS proofs 的对角化；“人为构造”的定性来自 KRS 摘要 | 1998-011 摘要（p.1）、§6.1（p.30）；2025-118 摘要 | observed |
| R17 | KRS：对一种 GKR 类论证，任意 FS 哈希都能构造出证明假命题的电路 | 改写 | KRS 证明：对 GKR + 任意 MLPCS 的论证，只要电路深度 d ≥ d_comm + d_h + O(1)，FS 编译后不具备自适应可靠性。攻击者需要知道哈希与承诺的参数，并据此构造电路（Thm 1）；还可以把任意电路改成功能等价、但带“后门”的电路（Thm 2） | 2025-118 Thm 1（§1.1.2，p.4）、Thm 2（p.5） | observed |
| R18 | KRS 关键是电路内部计算自己的首个 FS 挑战 | 确认 | — | 2026-1838 §1（p.2）原句；2025-118 p.4 | observed |
| R19 | KRS 非自适应版本要么深度极大、要么需要额外假设 | 改写 | 非自适应版本有两种：一是通用图灵机电路加 quine，攻击程序作为见证传入，代码更短的承诺（含 FRI）都适用，但作者称其 “not efficient”（Thm 9）；二是加法同态承诺，或做了批量处理的 FRI（Thm 10，非正式）。两者攻击的都是 GKR 协议 | 2025-118 摘要；§4.1 Thm 9（p.14）；§4.2 Thm 10（p.15） | observed |
| R20 | KRS 两位署名 EF、一位署名 Succinct | 确认 | — | 2025-118 p.1 脚注 | observed |
| R21 | Fenzi 把 KRS 型攻击扩展到“由程序生成实例”的 R1CS（Spartan、Aurora 变体） | 改写 | 补充：被攻击的单变量 IOP 是 Aurora 与 STIR 的基础，属于 Merkle 承诺、RS 编码、经 BCS 编译的哈希型 IOP。攻击前提是首个 FS 挑战只哈希程序、不哈希生成后的实例，并且攻击者控制程序 | 2026-1838 摘要；Thm 2（p.5）；p.6；§7（p.24、Cor 7.6–7.7） | observed |
| R22 | Fenzi：从生成实例派生首个挑战，可把可靠性归约回底层协议 | 确认 | — | 2026-1838 摘要；p.6 第 1 条（Theorem 5.5） | observed |
| R23 | XFS 已有人为构造的反例（BHK PKC 2026） | 确认（仍为摘要层） | — | BHK 摘要。旁证：2026-1838 p.2 把 [BHK26] 列为 “relatively contrived” 的反例工作（是否针对 XFS 未从全文确认） | observed |
| R24 | 已知实用 FS 攻击都针对 GKR/R1CS 类、需自选依赖哈希的电路；没找到针对 FRI 型 STARK 或递归本身的同类攻击 | 改写 | 已知实用 FS 攻击都需要攻击者决定被证明的计算：KRS 是自造电路或在通用电路中放程序，Fenzi 是控制生成实例的程序。对象是 GKR 类论证，以及“由程序生成实例”的 R1CS IOP，其中包括 Aurora/STIR 型的哈希型（Merkle/RS）IOP。没有找到针对固定电路（固定 AIR）的 STARK 或递归验证电路的已发表攻击。KRS 作者明确说，不知道攻击不等于不存在 | 2025-118 Thm 1/2/9/10、§5（p.16）；2026-1838 p.5–6、§7；R18 | inferred |
| R25 | ROM 中相对化 succinct argument 不存在，经此路线的 IVC/PCD 被排除 | 确认 | — | 2024-728 Thm 1、Thm 2（§1.1，p.4）、Lemma 1 与 IVC/PCD 段（p.5）、§2.7（p.14） | observed |
| R26 | 2024/728 写明非相对化 IVC/PCD 在 ROM 中仍开放 | 确认 | — | 2024-728 §1.1 末段（p.5）原句 | observed |
| R27 | Thaler 的“无法建立”比定理更强 | 改写 | Thaler 的说法若读作“纯 ROM 无法直接刻画递归这一步，最自然的相对化路线已被证否”，与 2024/728、2023/1646、Aerie 原文一致；若读作“已证明不可能”则偏强，因为非相对化 IVC/PCD 在 ROM 中仍开放，2023/1646 也在 ROM 中证明了非简洁理想化版本的紧界 | 2024-728 p.5；2023-1646 §1.1.2（p.5）、§2.3（p.12–14）；2026-2501 p.3 | inferred |
| R28 | 递归知识提取的标准证明只对常数次组合有效（每层多项式膨胀） | 确认 | — | 2012-095 §1.4 Challenge 2（p.10）、§2.2 “Why only constant depth?”（p.14–15） | observed |
| R29 | 每层多项式膨胀叠加 d 层 → 随深度指数增长，与 Thaler 一致 | 改写（升级） | 已知 PCD 安全分析的损失随递归深度指数增长：提取器规模约为 $n^{c^d}$。这是 2023/1646 与 2024/728 的原话，Thaler 的说法与之一致。这是证明技术的损失，不是攻击 | 2023-1646 §1（p.3）、§2.1（p.8–9）；2024-728 §1（p.3）；2026-2501 §1.2（p.4） | observed |
| R30 | 已知 PCD 分析有昂贵膨胀，从业者忽略 | 确认 | — | 2023-1646 摘要；§1.1.2（p.5） | observed |
| R31 | straightline 知识可靠性 → PCD 安全与底层相同，只在理想化预言机模型中成立；作者称“启发式、部分”证据 | 改写 | Theorem 1：底层相对化论证若有 straightline 提取器，则 κ_PCD ≤ κ_ARG(λ,q,s+O(N·t_ARG))，在纯 ROM 中与节点数 N 无关。对哈希型递归 STARK，严格证明的对象是 ROM 中的非简洁理想化版本（证明里附上查询-应答对）。把它当作真实系统的安全等级，是与随机预言机方法同类的猜想（“heuristic”“partial evidence”） | 2023-1646 摘要；Thm 1（§1.1，p.4）；§2.3（p.12–14） | observed |
| R32 | osROM 更难实例化，可对多项式深度给出 IVC 安全，对象是 HyperNova | 确认 | （可补充：osROM 扩展自 SROM，靠签名实现相对化，靠记录承诺原像实现 straight-line 提取） | 2025-1663 摘要；§1.1（p.2–3） | observed |
| R33 | EF 研究者承认理论挑战限制已知 IVC 的可证明安全 | 改写（措辞） | 2025/1663（作者 Maller、Zapico 署名 EF，Mohnblatt 署名 Bain Capital Crypto）写道：“theoretical challenges limit the provable security of known IVC constructions” | 2025-1663 p.1 作者单位与摘要 | observed |
| R37 | 递归 FS-SNARK 在普通 ROM 中无安全证明，Ethereum 一方也承认 | 确认 | （可补充：2023/1646 有 StarkWare 合著者，也写明实践中“as if the security reduction incurred no costs”） | 原证据 + 2023-1646 p.5、p.15 | inferred |
| R38 | Thaler 承认不知道对递归的直接攻击 | 确认 | — | SuccinctJT 推文 L25 | observed |
| R39 | 未发现对 8288 的可利用漏洞，未见对 leanVM 递归的已发表攻击 | 确认 | — | 全文核对未发现针对 leanVM 的内容 | inferred |
| R44 | 二进制域 SNARK 证明格运算慢 | 保持 | 论文中无相关内容 | — | speculative |
| R45 | AI 会加速 FS 与递归的密码分析 | 保持 | — | — | speculative |
| R46 | 公钥加密不能黑盒地只从哈希构造 | 保持 | 本批论文不含 Impagliazzo–Rudich | — | speculative |
| R47 | 恶意程序的 bugdoor 可能跨程序破坏整棵树 | 改写 | 对 GKR 类协议，KRS Theorem 2 给出具体构造：功能等价、但带“后门”、可证明任意输出的电路。对“多程序递归树中跨程序破坏”，仍没有已知构造 | 2025-118 Thm 2（p.5）；Green 博客 | speculative（跨程序部分）；Thm 2 本身见 R52 |
| C9 | 技术焦点是递归 FS 证明的 soundness，不是哈希与格谁更安全 | 确认 | 补充依据：Aerie 论文 §1.1 自己就把“避免递归 = 避免安全分析缺口”列为理由，并承认依赖经典 ROM | 2026-2501 p.3、p.18–19 | inferred |
| R49 | （新增）2023/1646 作者原话：对哈希型 PCD，要么攻击可归约到理想化 PCD，要么攻击利用具体哈希的实例化，后者是开放问题；Thaler 的论点 D 与此一致 | 新增 | — | 2023-1646 §2.3（p.14） | observed |
| R50 | （新增）2023/1646 以 StarkWare 递归 STARK 为例：用户提交任意程序，合规谓词不限深度和规模；该系统假设递归后的安全等于单个 STARK 的安全 | 新增 | — | 2023-1646 §2.4（p.15–16） | observed |
| R51 | （新增）KRS 指出，调用 FS 哈希与承诺的电路在实践中常见，尤其在递归证明组合中 | 新增 | — | 2025-118 p.4–5 | observed |
| R52 | （新增）KRS Theorem 2：任意电路都可改写为功能等价、但能证明任意输出的电路，所以安全性取决于电路的具体实现，而不只是它的功能 | 新增 | — | 2025-118 Thm 2（§1.1.3，p.5） | observed |
| R53 | （新增）KRS 非自适应攻击：通用电路加 quine 的版本适用于代码较短的承诺（含 FRI），但效率低；作者无法直接攻击不做批量处理的 FRI，做了批量处理的 FRI 可以攻击；两者攻击的都是 GKR 协议 | 新增 | — | 2025-118 Thm 9（p.14）、Thm 10 与其后段落（p.15） | observed |
| R54 | （新增）KRS 认为攻击依赖 GKR“不承诺完整计算轨迹”；缓解是让电路不足以计算哈希（深度、承诺中间值），或采用 XFS；作者说不知道攻击不等于不存在 | 新增 | — | 2025-118 §5（p.16） | observed |
| R55 | （新增）Fenzi 认为攻击可能适用于“虚拟机的证明系统，只要关系是（部分）生成的”，并建议在第三方控制计算（编译用户代码、自动预编译、AI 生成电路）时审慎审计 | 新增 | — | 2026-1838 p.6 | observed |
| R56 | （新增）开放 `LEANSTARK_SCHEME` 后，8288 会进入 Fenzi 说的“攻击者控制程序代码”场景；leanVM 的 FS 是否把生成后的语句绑进首个挑战，本次未核实 | 新增 | — | 由 R55、E6、eip-8288@5a4387b.md:L523 推出 | inferred |
| R57 | （新增）Aerie 的知识可靠性定理只在经典 ROM 中陈述；正文（§1–§7）没有 QROM 分析 | 新增 | — | 2026-2501 Def 5.6、Thm 5.9（p.18–19）。附录未读完 | observed |
| R58 | （新增）Aerie 的提取器要运行证明者 (Q+2)·K̂ 次（K̂ 最高约 2^39.7）；Akita 的格参数估计没有计入这一因子 | 新增 | — | 2026-2501 Thm 5.9 与其后段落（p.19–20） | observed |
| R59 | （新增）Aerie 不递归的理由有两条：单机即可完成一个 slot 的聚合；以及“避免递归也避免了安全分析中的缺口，因为 ROM 无法描述验证者自身的哈希计算” | 新增 | — | 2026-2501 §1.1（p.2–3）、§1.2（p.4） | observed |
| R60 | （新增）Aerie 承认两个聚合不能合并；要在网络中分布式收集，需要合并方法或递归验证器，而后者“reintroduces the heuristic step”；leanVM 可以把工作分给多个证明者，Aerie 不能 | 新增 | — | 2026-2501 §6.3（p.24）、§7（p.25） | observed |
| R61 | （新增）BCCT 的绕开办法：在常数深度的宽证明树上聚合；PCD 深度约简定理（基于 CRH）把常数深度 PCD 变为多项式深度的路径 PCD | 新增 | — | 2012-095 §1.4（p.10）、Thm 2（§2.3，p.15） | observed |
| R62 | （新增）8288 的 mempool 聚合树没有由谓词强制的常数深度结构，深度随轮数增长，所以不能直接援引 BCCT 的深度约简 | 新增 | — | 由 R6、R61 推出 | inferred |
| R63 | （新增）2025/1663 写道：有 straight-line 提取器时，组合可在多项式深度下安全；现实中的 IVC 假设计算链可几乎无限延长，但多数证明只覆盖常数步 | 新增 | — | 2025-1663 p.2 Challenge 2；p.5 “Straight-line extraction” | observed |
| R64 | （新增）XFS（AY25）的现状：KRS 称其模型无法刻画 KRS 攻击；Fenzi 称 XFS 能挡住其论文中的攻击，但没有可证明的保证能挡住变体 | 新增 | — | 2025-118 §5（p.16）；2026-1838 p.6 第 3 条 | observed |

**计数。**
- 确认 17：R2、R10、R11、R13、R18、R20、R22、R23、R25、R26、R28、R30、R32、R37、R38、R39、C9。
- 改写 12：R8、R14、R16、R17、R19、R21、R24、R27、R29（同时由 inferred 升为 observed）、R31、R33、R47。
- 降级 0；删除 0。
- 新增 16：R49–R64。
- 保持不变 3：R44、R45、R46。

---

## 3. 页面修订建议

> **已被取代（2026-10-21）**：本节是调研时的建议稿。最终措辞以 explainer.md / explainer.en.md 为准，sol 与 astra-6 第三、四轮审查又修订了其中几处（例如 F14 保留 Aerie 的两种扩展、攻击范围限定为“所核对的 KRS/Fenzi 型攻击”、F12 区分非简洁 ROM 构造）。不要直接复用本节文字。（explainer.md；英文版的对应句同步处理）

**① 导语第 4 点。**
- 原句：“但本次核对的实用 Fiat–Shamir 攻击都要求攻击者自选电路或程序，当前草案不允许这样做。”
- 建议：“但已公开的实用 Fiat–Shamir 攻击，都需要攻击者决定被证明的计算本身（自造电路，或提交程序）；当前草案的递归程序是固定的，攻击者只能提供签名和子证明。”
- EN：“Every published practical Fiat–Shamir attack needs the attacker to choose the computation being proved (a circuit or a program); in the current draft the recursive program is fixed and attackers only supply signatures and sub-proofs.”
- 依据：R8、R24。

**② 面板 E 第二行与面板 A 的树。**
- 原句：“warn 本次核对的 Fiat–Shamir 攻击都要攻击者自选电路，目标是 GKR 类”
- 建议：“warn 攻击都要攻击者决定被证明的计算；目标是 GKR 类和‘由程序生成实例’的 R1CS IOP（含 Aurora/STIR 型哈希 IOP）；未见针对固定电路 STARK 递归的攻击”。主要依据一栏加上 2026/1838。
- 面板 A：“FS 攻击要自选电路” → “FS 攻击要攻击者决定被证明的计算”。
- 依据：R21、R24、R55。

**③ F13 claim（最重要）。**
- 原句：“这些攻击都不针对 FRI 型 STARK 或递归本身。”
- 建议：“Fenzi 攻击的 Aurora/STIR 型 IOP 同样是 Merkle 承诺、RS 编码的哈希型 IOP，前提是实例由程序生成、且 FS 只哈希程序。KRS 的通用电路版本在做了批量处理的 FRI 承诺下也可实施，但被攻击的仍是 GKR 协议。没有已发表的攻击针对固定电路的 STARK 或递归验证电路。Fenzi 认为攻击可能适用于‘虚拟机的证明系统，只要关系是（部分）生成的’。”
- implication 加一句：“开放 leanSTARK 后，Fenzi 给出的可证明缓解（把生成后的语句哈希进首个挑战）就是具体的审计项。”
- EN：“Fenzi's targets include hash-based (Merkle, Reed–Solomon) IOPs of the Aurora/STIR type, when the instance is generated by a program and Fiat–Shamir hashes only the program. No published attack targets a fixed-circuit STARK or a recursive verifier.”
- evidence 加 2026/1838 §7、p.6，以及 R53–R56。

**④ F12 标题与 claim。**
- 标题原句：“Thaler 的措辞比定理更强：‘无法建立’应读作‘目前没有证明，最自然的路线已被排除’”
- 建议标题：“Thaler 的说法基本有据，但‘无法建立’不等于‘已证明不可能’”。
- claim 中原句：“但这只在理想化预言机模型中成立，作者自称是对递归 STARK 参数的‘启发式、部分’证据”
- 建议：“严格证明的对象，是 ROM 中把哈希查询-应答直接附在证明里的非简洁版本；把结论套到真实递归 STARK 上，属于与随机预言机方法同类的猜想。作者自称‘heuristic’‘partial evidence’。作者之一来自 StarkWare；§2.4 分析的正是用户提交任意程序、深度不受限的递归 STARK。”
- EN 标题：“Thaler's claim is broadly supported, but 'cannot be established' is not the same as 'proven impossible'”。
- 依据：R27、R31、R50。

**⑤ 面板 O 论点表。**
- B 行强度：“warn 中强，措辞过头” → “warn 中强，措辞偏强（纯 ROM 无法直接刻画递归这一步；不可能性未被证明）”。
- C 行证据：加上“2023/1646 §1 原文：security loss ‘exponential in the recursion depth’”。
- D 行强度：“warn 中（解读）” → “ok 与原文一致：2023/1646 §2.3 写明‘要么归约到理想化模型，要么利用具体哈希——后者是开放问题’”。最强反驳一栏保留“这些证据部分支持现行参数选择（作者原话 partial evidence）”。
- B' 行最强反驳：“攻击要自选依赖哈希的电路；目标是 GKR / R1CS 类” → “攻击要攻击者决定被证明的计算；目标是 GKR 类与程序生成实例的 R1CS IOP，不是固定电路的 STARK 递归”。
- 依据：R29、R49、R24。

**⑥ F14。** claim 末尾增补两句（中立、对称）：
- “Aerie 的定理只在经典 ROM 中陈述，正文没有 QROM 分析（leanVM README 则同时报了 QROM 位数）。它的提取器损失 (Q+2)·K̂ 也没有计入 Akita 的参数估计。”
- implication 增补：“Aerie 论文自己承认，聚合结果不能合并；若要在网络中分布式收集签名，就需要递归验证器，而那会‘reintroduces the heuristic step’。”
- EN：“Aerie states its theorem only in the classical ROM (no QROM analysis in the main text), and its own extraction loss is excluded from Akita's parameter estimates.”
- 依据：R57、R58、R60。

**⑦ B-4 卡片。**
- example 原句：“标准提取器把证明者‘倒带’重跑……每多一层递归，就要对内层再倒带一次。”
- 建议：“标准模型下，提取器由知识假设保证存在；每层规模多项式膨胀，d 层后约为 $n^{c^d}$（2023/1646 §2.1）。ROM 中的 straightline 提取器只读证明者的哈希查询记录，不用重跑证明者，所以没有这种膨胀；可它又描述不了‘电路里算哈希’这一步。”
- deeper 改为“[26] ePrint 2023/1646 §1、§2.1”。
- 依据：R29、R31。

**⑧ B-3 卡片 misconception。**
- 原句后补一句：“2025 年起出现了针对自然、已部署协议（GKR 类）的同类攻击 [28]（R17）。”
- deeper 维持 2024/728 §1。

**⑨ 面板 Q 第二条与面板 R 方法、front matter。**
- 面板 Q 原句：“论文只核对到摘要：ePrint 对本机全文抓取返回 403……”
- 建议：“论文经 Internet Archive 快照取得全文，核对了主定理、引言与作者讨论；长证明附录未逐行读；Brzuska–Hubáček–Kalsta（PKC 2026）仍只有摘要。”
- front matter 的 evidence 与面板 R 中的“ePrint 论文摘要与 PDF 片段”改为“ePrint 论文全文（Internet Archive 快照）”。
- 台账总行数要相应更新：148 + 16 = 164 行，类型计数也要重算。

**⑩ 面板 O“顺带一提”段。** 可补一句：“Fenzi 的研究部分由 EF 资助；2023/1646 有 StarkWare 合著者；2025/1663 有两位 EF 作者。” 依据：各论文 p.1 和致谢。

**⑪ 时间线 2024-05 一行。** 本次文本是 2025-09-23 修订版，从全文无法核实 2024-05 的首发日期，日期保留但需另行核对。时间线中 2025/118 的条目可以补“CRYPTO 2025”，依据是 Fenzi p.2。

**⑫ card.yml。**
- figure 节点 a：“Attacker picks\nthe circuit” → “Attacker picks\nwhat is proved”。
- tweet 第二个圆点原句：“Known attacks (KRS, 2025/118) target GKR-style protocols and require attacker-chosen circuits; no matching attack on FRI-style STARK recursion was found.”
- 建议：“Known attacks (KRS 2025/118, Fenzi 2026/1838) need the attacker to choose what is proved, a circuit or a program. None targets fixed-circuit STARK recursion.”
- 原文的 “FRI-style” 与 Fenzi 的 Aurora/STIR 结果有冲突，应删去。
- Caveat 可改为 “lattice SNARKs like Aerie also rely on the (classical) ROM.”
- 改完后需要重新按 `cardTweetMax` 计数，并请 astra-6 复审。

---

## 4. 仍未核实

1. **Brzuska–Hubáček–Kalsta（PKC 2026）全文。** 仍只有摘要。R23 中“针对 XFS 的反例”这一点，没能从全文确认。
2. **2024/728 的首发日期（2024-05）。** 本地文本是 2025-09-23 修订版。时间线的日期需要另行核对 ePrint 版本历史。
3. **Aerie 是否在附录中讨论 QROM。** 正文没有；附录 A–C 没有读完。
4. **leanVM 的 FS 是否把“生成后的语句”绑进首个挑战。** 这个问题针对开放 leanSTARK 之后（R56），本次没有读 leanVM 源码。
5. **Bünz 等的“纯 ROM” IVC/累积工作。** 2025/1663 p.6 提到这一并行工作。它是否构成“普通 ROM 中的递归安全证明”，会影响“普通 ROM 中尚无已知证明”这句话的边界。本次没有核对，建议做一次定向检索。
6. **KRS Theorem 10 对批量 FRI 的适用性。** 只是 “Informally Stated” 的草图，原文没有给出完整证明。
7. **Impagliazzo–Rudich（R46）。** 不在本批论文中。
8. **2023/1646 §6.3（ROM 中的直线提取）和 §7 的形式化细节。** 没有逐行读；本文只引用了 §1–§2 的非正式陈述。
9. **8288 固定的递归电路能否被构造成“预测自己外层挑战”的对角化。** 已有论文没有讨论，属于推测，不写入页面。

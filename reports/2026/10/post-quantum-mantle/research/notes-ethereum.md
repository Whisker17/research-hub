# notes-ethereum：EVM 密码学现状与 Ethereum 的 PQ 路线（lane = ethereum，前缀 E）

> 访问日期统一为 2026-10-16（UTC+8），另有注明的除外。按本次运行的输出要求，本文件写到 task-3.md；内容对应 notes-ethereum.md。

**一句话总结**：今天 Ethereum 每一层都有依赖椭圆曲线的组件：账户用 secp256k1 ECDSA / ecrecover、EIP-7702 授权和 P-256，共识用 BLS12-381 与 RANDAO，DA 用 KZG，L2 证明验证用 BN254 配对。EF 设定的目标是“2029 年 12 月 L1 三层（执行 / 共识 / 数据）抗量子”。不过 EF 自己的几份文档把它说成“L1 协议升级完成”，并没有说“所有账户迁移完成”。目前唯一排进具体分叉的 PQ 相关基础设施是 EIP-8141 Frame Transaction（Hegotá，状态 SFI，EIP 本身仍是 Draft，预计 2027 Q2 上主网但日期未定）。PQ 签名预编译（8051 / 8052 / 7885）不在 Hegotá 名单里，EF 认为过早；共识层（leanXMSS + leanVM 聚合）和 DA 层（leanDA）都还处于研究或 devnet 阶段，用哪个哈希函数也没定。

**本路问题的一句话答案**：
- E-Q1：EVM 链的“授权、共识、DA 承诺、SNARK 验证”四类都依赖离散对数类假设（Shor 可破）。哈希（Keccak / SHA-256）只是安全余量下降。
- E-Q2：Ethereum 的路线是“执行层靠 AA 换签名（8141），共识层整体替换为哈希签名 + STARK 聚合，DA 层换哈希承诺”。日期上，只有 8141 进了 Hegotá，其余 PQ 里程碑都在 I*～L* 等占位分叉里（strawmap 2026-10 版标注 2028–2030），且明确“可变”。
- E-Q3：EF 只对 L2 给出“清单式建议”（排序器 / 管理员密钥、桥与跨链消息、AA 账户、zk-rollup 的证明系统），协议层面不会替 L2 做。L2 能“自动继承”的只有 L1 共识与 blob DA 的升级，而且即使是 DA，也要切换交易 / 承诺版本。L2 的证明验证器、账户、桥与升级密钥都得自己迁移。最后这一点是推论。

---

## E-Q1 Ethereum L1 / EVM 今天各层用的密码学

**答案**：账户层是 secp256k1 ECDSA（地址 = keccak(pubkey)[12:]，ecrecover 预编译 0x01）。EIP-7702 的授权元组由 ecrecover 恢复，同一私钥随时能改写或清除委托。P-256 预编译（EIP-7951，0x100，6900 gas）已随 Fusaka 于 2025-12-03 上主网。ERC-4337 / ERC-1271 合约账户可以在合约里自定义验签。状态层是 Keccak-256 + MPT，计划中的 binary tree（EIP-7864，Draft）还没选定哈希（BLAKE3 / Keccak / Poseidon2 三选）。共识层是 BLS12-381（IETF BLS 草案 v4），RANDAO reveal 也是 BLS 签名。Pectra（2025-05-07 主网）加入了 EIP-2537 BLS 预编译。DA 层：EIP-4844 的 blob 用 BLS12-381 上的 KZG 承诺，依赖 14 万+ 次贡献的可信设置仪式；Fusaka 的 PeerDAS（EIP-7594）引入 cell KZG proofs。ZK 验证层：EIP-196 / 197 的 BN254（alt_bn128）预编译是链上 Groth16 / PLONK 验证的基础。

**依据**
- 账户：
  - Vitalik 原文写明“An Ethereum address is defined as `keccak(priv_to_pub(k))[12:]`”，并说明“signature of that transaction reveals the public key” [24]。
  - ecRecover 位于 0x01、3000 gas，见 EIP-8151 的规范段 [16]。
- EIP-7702（Final，Pectra 引入）[25][28]：
  - Behavior 第 3 步：`authority = ecrecover(msg, y_parity, r, s)`，其中 `msg = keccak(MAGIC || rlp([chain_id, address, nonce]))`。
  - 第 5 步允许“already delegated”的账户再次委托；第 8 步规定 address 为 0 时清除代码。
  - “Transaction origination”一节允许带委托指示符的 EOA 继续发起交易。
  - 结论：只要原 ECDSA 私钥在，就能直接发交易，也能重写或清除 delegation（与 starknet-account-model 台账 A53–A56 一致）。
- P-256（EIP-7951，Final）[26][27]：
  - `P256VERIFY` 位于 0x100，6900 gas。
  - “supersedes RIP-7212 … without the vulnerability”，修复了点在无穷远检查与模比较两个漏洞。
  - 接口与 RIP-7212 相同，但 gas 不同：“3450 gas vs 6900 gas”。
  - Fusaka meta EIP-7607 列出 EIP-7951，主网激活时间 2025-12-03 21:49:11 UTC。
- 合约账户：ERC-4337 与 ERC-1271 均为 Final [36]。
- 状态（EIP-7864，Draft，2025-01-20 创建）[35]：
  - 原文：“The hash function used in the current draft is not final … uses BLAKE3 … Other potential candidates include Keccak and Poseidon2 … Do not assume BLAKE3 is a final decision.”
  - 理由之一：Verkle “relies on elliptic curves that aren’t post-quantum secure”，而 binary tree “only depends on hash functions”。
- 共识 [33]：
  - consensus-specs phase0：`BLSPubkey` 是“A BLS12-381 public key … G1”（48 字节），`BLSSignature` 是 G2（96 字节）。
  - 签名采用 IETF BLS 草案 v4，ciphersuite `BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_`。
  - `process_randao` 里有 `bls.Verify(proposer.pubkey, signing_root, body.randao_reveal)`。
- BLS 预编译：EIP-2537 是 Final，地址 0x0b–0x11；动机原文为“120+ bits of security … compared to the existing BN254 precompile that only provides 80 bits” [29]。Pectra meta EIP-7600 包含 EIP-2537 和 EIP-7702，主网时间戳 1746612311（2025-05-07 10:05:11 UTC）[28]。
- DA：
  - EIP-4844（Final）：`KZGCommitment` 为 Bytes48；point evaluation 预编译在 0x0A，50000 gas；`kzg_to_versioned_hash` 由版本字节 0x01 加 sha256(commitment)[1:] 组成 [30]。
  - ethereum.org 写道 KZG 仪式“over 140,000 contributions”，Dencun 于 2024-03 上线 [34]。
  - EIP-7594（Final，Fusaka）：“cell KZG proofs … prove that a KZG commitment opens to a cell”，并由 blob 发送者计算 `cell_proofs` [31][27]。
- ZK 验证：EIP-197（Final，2017-02-06）原文为“Precompiled contracts for elliptic curve pairing operations are required in order to perform zkSNARK verification”，地址 0x8；EIP-196 是 ecAdd / ecMul [32]。

**不确定之处**
- 本路没有核对 Glamsterdam 是否改动这些原语。ethereum.org 显示 Glamsterdam 仍在 devnet 测试，预计 2026 Q4，“Date not yet confirmed”[8]。
- ecrecover 的 0x01 地址和 3000 gas 引自 EIP-8151 的复述，没有回到 Yellow Paper 原文。
- “BN254 只有约 80 bit 经典安全”是 EIP-2537 作者的说法，本路没有追到密码分析原文。

## E-Q2 Ethereum 的 PQ 路线

### 2.1 “2029”的原话与范围

**答案**：EF 自己的几份文档口径不同。最强的表述来自 EF Protocol 博客（2026-09-07）：“aiming for Ethereum L1 to be quantum-resistant across all three layers (execution, consensus, and data) by December 2029”，承诺“non-negotiable at least until January 2027”。pq.ethereum.org（最后更新 2026-06-27）和 ethereum.org 都写成“L1 协议升级 / 核心基础设施约在 2029 年完成，执行层与生态的完整迁移还要更多年”。所以“2029”指 **L1 协议具备 PQ 能力**，不是“所有账户都已迁移”。

**依据**
- EF 博客 [3] 原文：
  - “December 2029”和“plan for Q-day happening as early as 2030”，并说明这是“deliberately aggressive assumption”。
  - 这一日期“lines up with the 2029 migration targets independently set by Google, Cloudflare, and Microsoft”。
- pq.ethereum.org FAQ [1]：“No single fixed date … L1 protocol upgrades could be completed by 2029, with full execution-layer migration taking additional years beyond that.”
- ethereum.org [2]：“target the completion of core post-quantum infrastructure by approximately 2029. Full execution-layer and ecosystem migration extends beyond that.”
- EF 博客 [3] 的 MV-PQ 段：J* 的 MV-PQ 是“temporary safeguard … with reduced guarantees”。

### 2.2 分阶段计划与 fork 安排

**答案**：
- Glamsterdam：预计 2026 Q4，没有 PQ 项。
- Hegotá：已排期的只有 FOCIL 与 EIP-8141，EF 原话“Hegotá is not the PQ fork”。Hegotá 里唯一被 EF 视为 PQ 项的是 EIP-8365（退役 BLS 提款凭证，目前仅为 Proposed）。另有 EIP-8151 + EIP-8298 构成“k1 退役包”（Considered）。
- 后续分叉都是占位名：I*（PQ 公钥注册、leanSPHINCS 交易），J*（MV-PQ），K* / L*（PQ attestations、强制执行证明）。
- strawmap 2026-10-05 把 I* 标为 2028，J* 为 2028–29，K* 为 2029，L* 为 2029–30。10-09 又把“post quantum L1”和“leanXMSS PQ attestations”从 L* 移到 K*。
- pq.ethereum.org 的表格（I*→J*→L*→M*）比 strawmap 旧。

**依据**
- EIP-8081（Hegotá meta，Draft）[7]：
  - Scheduled：EIP-7805、EIP-8141。
  - Considered：EIP-8151、EIP-8298、EIP-8250、EIP-8272 等。
  - Proposed：EIP-8365。
  - Declined：EIP-8355（ML-DSA 预编译）。
  - EIP-7885、EIP-8051、EIP-8052 均不在任一列表中。
- EF Hegotá 分级 [4]：
  - EIP-8355 评为 C，原文：“Enshrines a specific PQ verification scheme ahead of a dedicated cryptographic adjudication: premature standardization.”
  - EIP-8365 评为 A，原文：“The one PQ item that belongs in Hegotá.”
  - EIP-8151 与 EIP-8298 合称“k1 exit”包。
- EF 博客 [3]：
  - “Client teams can realistically begin Hegotá implementation in late Q4 2026.”
  - 按 July Strawmap，完整 PQ 在 L*，需要“7.2 months per fork”；若 K* 与 L* 对调，完整 PQ 在 K*，需要 9 个月节奏。
- strawmap 变更记录 [6]：
  - 2026-08-19：J* 加入 MV-PQ。
  - 2026-09-26：leanSPHINCS PQ txs 由 J* 移到 I*。
  - 2026-10-05：各分叉标注年份。
  - 2026-10-09：“leanXMSS PQ attestations: move from L* to K*”和“post quantum L1: move from L* to K*”。
- strawmap.org [5] 自述“not a prediction”，由 EF Architecture 维护，“seven forks by 2029”。
- ethereum.org [8]：Hegotá“Expected on mainnet Q2 2027 · Date not yet confirmed”；Glamsterdam“Q4 2026 · Date not yet confirmed”。
- pq.ethereum.org [1] 的表：I* PQ key registry；J* PQ sig precompiles；L* PQ attestations + real-time CL proofs + leanVM；M* PQ sig aggregation + PQ blobs；Longer term 为 Full PQ consensus / PQ transactions / PQ sampling。页面最后更新于 2026-06-27。

**不确定之处**
- strawmap 是 EF Architecture 的“strawman”，最终由 ACD 决定 [1][5]。10-09 的 K* 调整只是图的修改，不是 ACD 决议。
- strawmap 当前是否仍保留“PQ sig precompiles”这一格，本路没有看原图（Google Drawing）核实。

### 2.3 账户层 EIP 状态

**答案**：
- 8141 在 eips 网站上是 Draft，但已在 Hegotá 状态为 SFI。规范本身没有 PQ scheme，只有 `ARBITRARY`(0x0) / `SECP256K1`(0x1) / `P256`(0x2)，PQ 签名需要走 ARBITRARY 在 EVM 里验，或由后续 EIP 扩展。
- EIP-8288 给 8141 加了 leanSPHINCS / leanSTARK 的“依赖帧 + 区块级递归 STARK 聚合”，目前 Draft，strawmap 放在 I*。
- 7885 / 8051 / 8052 / 7932 / 8355 均为 Draft，都未排期。

**依据**
- EIP-8141 [9]：
  - Created 2026-01-29。
  - Motivation 首条：“native off-ramp from the elliptic curve based cryptographic system … to post-quantum”。
  - scheme 表：ARBITRARY 100 gas、SECP256K1 2800、P256 6700、0x3..255 reserved。
  - “raw signature byte strings of protocol-validated schemes are intentionally not introspectable … to allow future aggregation schemes”。
- 8141 进入 SFI 的依据：Hegotá meta [7]；native-aa 报告记为 ACDE #244 定为 SFI [40]；媒体转述日期为 2026-08-27 [42]。
- EIP-8288 [15]：Created 2026-06-03，作者 Vitalik、Coratger。参数 `LEANSPHINCS_SCHEME 0x10`（3000 gas）、`LEANSTARK_SCHEME 0x11`（30000 gas）。动机原文：“hash-based signatures … ~2-3 kB and ~150,000 to 200,000 gas … STARKs all take over 128 kB”。
- EIP-7885 [10]：Created 2025-02-12。4 个预编译（NTT_FW / NTT_INV 各 600 gas，VECMULMOD / VECADDMOD），地址 TBD。动机是“agility, as DILITHIUM or FALCON … can be implemented”，并可用于 STARK 验证。
- EIP-8051 [11]：Created 2025-10-15，Requires EIP-7932。定义 `VERIFY_MLDSA`（0x12，FIPS-204）与 `VERIFY_MLDSA_ETH`（0x13，“Keccak-based PRNG … deviating from FIPS-204”），各 4500 gas，只覆盖 ML-DSA-44。
- EIP-8052 [12]：Created 2025-10-17。Falcon-512，拆为 `FALCON_HASH_TO_POINT_SHAKE256`（合规）、`FALCON_HASH_TO_POINT_KECCAKPRNG`（EVM 友好）和 `FALCON_CORE`。原文“666 bytes for Falcon-512”，并称“This allows any EVM chain – principally Ethereum roll-ups – to integrate”。
- EIP-7932 [13]：Created 2025-04-12。算法注册表 + `sigrecover` 预编译，地址 `0x12`、基础 3000 gas。注意它和 EIP-8051 的 0x12 冲突，几份 Draft 的地址都没定。
- EIP-8355 [14]：Created 2026-07-30。ML-DSA-44 / 65 / 87 三个预编译，已被 Hegotá Declined [7]。
- EIP-8151 [16]：Created 2026-02-09。动机：迁移后 EIP-3607 已经禁止 ECDSA 发交易，但“ecRecover ignores account state”，旧私钥仍可通过 ERC-2612 `permit` 授权。
- 背景旁证：Vitalik 2026-02-26 写道“ECDSA signature verification costs 3000 gas … hash-based signatures … ~200k gas”，并称格签名可借助向量化预编译降到相近量级 [23]。

**不确定之处**：RIP-7560 本路没有重新核对（starknet-account-model 台账 A59 记为 Draft）。8141 规范仍在频繁修改，以上常量对应访问日的版本。

### 2.4 共识层：leanSig / leanVM / EIP-8292

**答案**：
- 方向：用有状态哈希签名（leanXMSS，XMSS 变体）替换 BLS，再用最小 zkVM（leanVM）以 SNARK / STARK 证明聚合签名。EIP-8292（Draft，2026-06-07）为此单独设立 opt-in 的“聚合者”角色。
- leanSig@c08a3bae（2026-04-29）用的是 **KoalaBear + Poseidon1**，自述“prototypical … not audited … not meant to be used in production”。
- leanVM 主干@127510d1（2026-10-15）已改为 **192-bit 二进制域 + WHIR**，哈希“BLAKE2s is a placeholder”，SHA2 / SHA3 / BLAKE3 都在考虑中。README 写“128-bit ROM (64-bit QROM) soundness”“not (yet) production ready”“Support for zero-knowledge is planned”。
- 也就是说，lane 说明里的“Poseidon2 / KoalaBear”已经不准确：签名库用 Poseidon1，VM 已离开 KoalaBear。“以太坊最后一个哈希函数”仍未定。

**依据**
- leanVM README @127510d1 [19]：
  - “minimal hash-based zkVM, for post-quantum Ethereum”。
  - security 节：“128-bit ROM (64-bit QROM) soundness · no proximity gap conjecture · end-to-end formal verification · a traditional hash function”，并附“Formal verification is in progress … not (yet) production ready”。
  - work in progress 节：“BLAKE2s is a placeholder … migration from leanISA to RISC-V (rv64im) is planned … Support for zero-knowledge is planned”。
  - note 节：“Prior to binary fields leanVM used KoalaBear and Poseidon”。
  - M4 Max 基准：900 个 XMSS 聚合，证明 317.4 KiB，0.545 s，峰值内存 7.4 GiB，验证 3.977 ms；README 注明“This is not the definitive parameter set”。
- leanSig @c08a3bae [20]：
  - README：“prototypical … has not been audited and is not meant to be used in production”；“Hardcoded instantiations … (using Poseidon1)”。
  - `src/lib.rs` 中 `type F = KoalaBear`、`Poseidon1KoalaBear<24>`。
- leanSpec README [21]：crypto 子规范包括“poseidon, koalabear, xmss”，测试用 fork 名为 `Lstar`。
- EIP-8292 [18]：
  - 原文：“an aggregate of many BLS signatures … is still only 96 bytes”。PQ 签名“the instance currently used by the leanVM aggregation engine is about 1.17 KiB”。
  - 聚合证明“127–344 KiB”，网络目标是“propagate a roughly 256 KiB proof in under one second”。
  - 聚合者为 opt-in、“higher-specification participant”；“The execution layer is unchanged by this EIP”。
- pq.ethereum.org [1]：“leanXMSS … leanSig … leanMultisig … leanSpec currently used by approximately ten client teams”。
- EF 博客 [3]：“The consensus layer, however, cannot rely on cryptographic agility … consensus components wait for the complete PQ design instead of shipping one at a time.”
- Vitalik [23]：哈希函数“may be ‘Ethereum’s last hash function’ … the most aggressive forms of Poseidon have taken hits”。他列出的候选为 Poseidon2 加额外轮数、Poseidon1、BLAKE3。

**不确定之处**
- ethereum.org [2] 写 PQ 签名“roughly 3,000 bytes compared to 96 bytes”、leanVM 压缩“250x”，与 EIP-8292 的“约 1.17 KiB”口径不一致，参数集尚未定。
- leanVM 的 ROM / QROM 位数是 README 的自述，本路没有读 leanVM.pdf 里的证明。

### 2.5 DA 层：PQ blobs

**答案**：仍在研究。官方给出的候选是哈希型（STARK / Merkle）或格型承诺。目前最具体的是 leanDA：Reed-Solomon + Poseidon Merkle 承诺 + leanVM 证明编码正确，属“Encode + Prove”范式，已在 ethresear.ch 发布设计与基准。strawmap 把“leanDA PQ sampling”列为 J* 的 MV-PQ 组件。

**依据**
- ethereum.org [2]：“two leading candidates … STARK-based commitments … Lattice-based commitments … Both approaches are still being researched”。
- Vitalik [23]：“we rely pretty heavily on KZG … STARKs … don’t have [linearity] … a STARK is … bigger than a blob … it’s manageable, but there’s a lot of engineering work to do”。
- leanDA 帖 [22]：原文“current DAS protocol based on KZG … needs post-quantum alternatives”；方案为 Poseidon、KoalaBear 五次扩域、Merkle 承诺与 LeanVM。帖中排除 FRIDA / ZODA，理由是它们“do not satisfy … repairability”。strawmap 于 2026-08-11 链接该帖 [6]。
- EF 博客 [3]：leanDA sampling 在 J*。

**不确定之处**：PQ blobs 什么时候替换 KZG 承诺，pq.ethereum.org 写的是 M*，strawmap 的最新位置本路未逐格核实。

### 2.6 执行层 / 证明：L1 zkEVM 与 PQ

**答案**：EF 的“实时证明”定义要求证明“≤300KiB with no trusted setups”、不得依赖带可信设置的递归包装（即不能用 Groth16 收尾）、≥128-bit 安全。安全里程碑 M3（128-bit 可证明安全）的截止时间改为 2026-12 初。zkEVM 弧线要把执行证明从可选推进到强制（当前在 K*，可能与 PQ attestations 对调到 L*）。EF 称 zkEVM 形式化验证项目为期 3 年、规模 2,000 万美元，并会给 PQ 聚合用到的 SNARK 原语提供支撑。

**依据**
- EF 博客 2025-07-10 [37]（检索摘录）：原文“must not rely on recursive wrappers that use trusted setups”“Security: >= 128 bits”。
- EF 博客 2025-12-18 [38]：M2 定于 2026 年 5 月底，要求 100-bit；M3 为 H-star，要求 128-bit、≤300 KiB。zkevm.ethereum.foundation 2026-02-11 更新：“moved the M3 deadline to early December 2026”。
- EF 博客 [3]：zkEVM 弧线“mandatory proofs arrive in K* … One reordering is in review”。
- pq.ethereum.org [1]：“zkEVM Formal Verification Project — a $20M, three-year initiative … including the SNARK primitives that underpin post-quantum signature aggregation”。

**不确定之处**：[37][38] 是通过检索摘录读到的 blog.ethereum.org 原文片段，没有整页抓取。

### 2.7 紧急预案

**答案**：Vitalik 2024-03-09 在 ethresear.ch 发帖，提出量子紧急情况下的恢复分叉。整个设计是研究帖，没有对应的 EIP。四步如下：
1. 回滚到大规模盗窃开始之前的区块；
2. 禁用传统 EOA 交易；
3. 引入智能合约钱包交易类型（如 RIP-7560）；
4. 用户提交 STARK，证明知道私有原像 x、批准的哈希函数 ID i 和地址 A，满足 `keccak(priv_to_pub(hashes[i](x)))[12:] = A`（适用于 BIP-32 等由哈希派生私钥的情形）。证明通过后，账户切换到新的验证代码。可以批量证明（STARK-of-STARKs）。

**依据**：[24] 原文四步与“most users’ private keys are themselves the result of a bunch of hash calculations”。pq.ethereum.org 提到执行层工作包括“emergency preparedness”[1]；对不迁移的资金是“do nothing, or freeze”，属治理问题，EF 估计长期休眠暴露“closer to 0.1%”[1]。

**不确定之处**：回滚的社会可行性在帖子回复里有人反对（domothy）[24]。EF 当前的应急方案本路没找到正式文本。

### 2.8 EF PQ 团队 / 资金

**答案**：ethereum.org 写明 EF 于 2026 年 1 月成立 Post-Quantum Security team，由 Thomas Coratger 领导。该团队隶属 Protocol cluster，维护 pq.ethereum.org。资金方面，ethereum.org 只提到 100 万美元的 Poseidon Prize；“200 万美元团队”是媒体合并两个 100 万美元奖项后的说法。

**依据**：
- ethereum.org [2]：“formed a dedicated Post-Quantum Security team in January 2026, led by Thomas Coratger”，同时列出 Poseidon Prize $1M、10+ 客户端团队、第二届 PQ Research Retreat（2026-10-09～12）。
- pq.ethereum.org [1]：“maintained by the Post-Quantum team within the Ethereum Foundation’s Protocol cluster”。
- 媒体 [39] 转述 Justin Drake 2026-01-23 的 X 帖：Poseidon Prize $1M 与 Proximity Prize $1M。Yahoo / Cryptonews 的标题写成“$2M team”。

**不确定之处**：Drake 原帖本路没有抓到，团队预算没有官方数字。

## E-Q3 对 L2 的含义

**答案**：
- EF 文本对 L2 只有建议，没有协议要求。pq.ethereum.org 写道 L2 准备工作是保护“高杠杆信任点”：排序器 / 管理员等运营密钥、桥与跨链消息、通过 AA 迁移的用户账户、zk-rollup 的证明系统本身；“Protocol-level evolution will remain chain-specific”。ethereum.org 对应用层 ZK 证明的态度是“自然的生态采用”，不在 L1 协议里替它们做。
- 可以继承的：L1 共识（BLS→leanXMSS）和 blob DA 的 PQ 化，L2 只要继续在 L1 结算、用 blob 就会受益。EIP-4844 设计了版本化哈希，日后换成 Merkle + STARK 时，“sequencers would simply have to switch over to using a new transaction type”。
- 不会自动继承的（推论）：
  - L2 在 L1 上的 SNARK 验证器（BN254 / Groth16 / PLONK）；
  - L2 自己的 EVM 账户（8141 / 8151 这类协议改动需要 L2 自己硬分叉跟进）；
  - L1 上桥与升级合约的管理密钥（这些多签成员本身是 L1 EOA，要靠 L1 的 AA 迁移）。
- 另有两个具体的兼容坑：
  - EIP-8151 明说 L2 故障证明若在 L1 重执行 ecrecover，会因为它不再是纯函数而出错。
  - EIP-7951 与 RIP-7212 在 0x100 的 gas 不同（6900 vs 3450）。

**依据**
- pq.ethereum.org FAQ“Ecosystem & Broader Context”[1]：“L2 preparedness means securing high-leverage trust points: operational keys (sequencer, admin), bridges and cross-chain messaging, user accounts (via account abstraction), and for zk-rollups, the proof system itself.”
- ethereum.org [2] 的第 4 项：“Many popular ZK-proof systems (SNARKs using elliptic curve pairings) rely on quantum-vulnerable assumptions … Natural ecosystem adoption of STARK-based systems is already providing post-quantum security at the application layer.”
- Vitalik [23]：“Application-layer ZK proofs (KZG or groth16)”被列为四个量子脆弱面之一；“a ZK-SNARK costs ~300-500k gas. A quantum-resistant STARK is more like 10m gas … unacceptable for … L2s”；解决方向是协议层递归聚合（即 EIP-8288 的 leanSTARK 依赖，30000 gas [15]）。
- EIP-4844 Rationale [30]：“if we need to switch to Merkle trees + STARKs for quantum-safety reasons … Rollups would not have to make any EVM-level changes”。同一节还写到 ZK rollup 用 point evaluation 预编译做“proof of equivalence”。
- EIP-8151 Security Considerations [16]：原文“L2 fault proof systems that obtain the final ecrecover result by executing the L1 precompile may become incorrect … An L2 adopting this EIP must … apply the account-code check … using its own raw account code”。
- EIP-8052 [12]：原文“any EVM chain – principally Ethereum roll-ups”。
- EIP-7951 [26]：原文“The 6900 gas cost does not maintain compatibility with L2s”。

**不确定之处**
- EIP-4844 那句“Rollups would not have to make any EVM-level changes”写于 2022–2024，针对的是版本化哈希接口。凡是在合约里调用 0x0A 做 KZG 等价证明的 rollup，迁移时仍要改验证逻辑（推论）。
- 本路没有找到 EF 对 L2 的时间要求。

---

## 图与白话素材

### 组件 × 算法 × 量子影响（L1 / EVM）
| 层 | 组件 | 算法 / 参数 | 状态 | 量子影响 | 来源 |
|---|---|---|---|---|---|
| 账户 | EOA 签名 | secp256k1 ECDSA；地址 = keccak(pubkey)[12:] | 主网（创世） | Shor：从公钥求私钥，签过名的账户公钥已暴露 | [24][1] |
| 账户 | ecrecover | 0x01，3000 gas | 主网 | 同上；迁移后旧私钥仍可 permit（EIP-8151 要修） | [16] |
| 账户 | EIP-7702 授权 | ecrecover 恢复 authority，可改写 / 清除 | 主网 Pectra 2025-05-07 | 原私钥始终是“万能钥匙” | [25][28] |
| 账户 | P-256 | EIP-7951，0x100，6900 gas | 主网 Fusaka 2025-12-03 | Shor 可破（同为 ECC） | [26][27] |
| 账户 | 合约账户 | ERC-4337 / ERC-1271，自定义验签 | Final | 取决于账户里写的算法（可放 PQ） | [36] |
| 状态 | MPT | Keccak-256 | 主网 | Grover：余量下降，不是“被破” | [35] |
| 状态 | binary tree | EIP-7864，哈希 TBD（BLAKE3 / Keccak / Poseidon2） | Draft | 只依赖哈希，被定位为 PQ 友好 | [35] |
| 共识 | 验证者签名 | BLS12-381（pk 48B，sig 96B，可聚合） | 主网 | Shor 可破；PQ 替代品不能原生聚合 | [33][18] |
| 共识 | RANDAO | randao_reveal = BLS 签名 | 主网 | 随 BLS 一并受影响 | [33] |
| EVM | BLS 预编译 | EIP-2537，0x0b–0x11 | 主网 Pectra | Shor 可破 | [29][28] |
| DA | blob 承诺 | KZG over BLS12-381；point evaluation 0x0A | 主网 Dencun 2024-03 | 存在冲突说法，见“修正”一节 | [30][34][23] |
| DA | PeerDAS | cell KZG proofs | 主网 Fusaka | 同 KZG | [31][27] |
| ZK 验证 | BN254 预编译 | EIP-196/197，0x6/0x7/0x8 | 主网 Byzantium | Shor 可破；经典安全约 80 bit（EIP-2537 说法） | [32][29] |

### Ethereum PQ 时间线（只列有一手来源的条目）
- 2024-03-09：Vitalik 发表量子紧急硬分叉帖 [24]
- 2025-02-12 / 04-12 / 10-15 / 10-17：EIP-7885 / 7932 / 8051 / 8052 创建（均为 Draft）[10][13][11][12]
- 2025-12-03：Fusaka 主网（PeerDAS、P-256 预编译）[27]
- 2026-01：EF 成立 PQ 团队（Coratger 领导）[2]
- 2026-01-29：EIP-8141 创建 [9]
- 2026-02-26：Vitalik 发布“quantum resistance roadmap”帖 [23]
- 2026-06-03：EIP-8288 创建；2026-06-07：EIP-8292 创建 [15][18]
- 2026-06-27：pq.ethereum.org 最后更新 [1]
- 2026-08-19：strawmap 在 J* 加入 MV-PQ [6]
- 约 2026-08-27：8141 定为 Hegotá SFI [7][40][42]
- 2026-09-07：EF 宣布“2029 年 12 月三层抗量子”目标 [3]
- 2026-10-05 / 10-09：strawmap 标注年份，PQ L1 由 L* 移到 K*（2029）[6]
- 2026 Q4（计划）：Glamsterdam，无 PQ 项 [8]
- 2026-12 初：zkEVM 128-bit 可证明安全里程碑 M3 [38]
- 2027-01：EF 重新评估 2029 deadline [3]
- 2027 Q2（预计，未确认）：Hegotá（FOCIL + 8141）[8]
- I*（约 2028）：PQ 公钥注册、leanSPHINCS 交易、leanVM [6][3]
- J*（约 2028–29）：MV-PQ（PQ heartbeat + leanDA 采样 + leanSPHINCS）[3][6]
- K*（约 2029）：PQ attestations / post quantum L1（10-09 调整后）[6]
- L*（约 2029–30）：强制执行证明（若对调成立）[3][6]

### 三层路线对比
| 层 | 今天 | 目标 | 关键件 | 当前成熟度 |
|---|---|---|---|---|
| 执行 | ECDSA EOA | 账户自选签名（AA），旧 k1 退役 | 8141（SFI）、8151 / 8298（Considered）、8288（Draft）、PQ 预编译（未排期） | 8141 进入 Hegotá，其余为 Draft [7][9][15][16] |
| 共识 | BLS 聚合 | leanXMSS + leanVM 证明聚合 | leanSig、leanVM、leanSpec、EIP-8292 | devnet / 原型，“not production ready” [19][20][18] |
| 数据 | KZG | 哈希承诺 + 证明（leanDA） | leanDA | 研究帖 + 基准 [22] |

### 白话解释
- **ECDSA / secp256k1**：钱包签名用的数学锁。公钥能被量子计算机“倒推”出私钥 [24][1]。
- **ecrecover**：EVM 里的验章机，从一个签名推出“谁签的” [16]。
- **EIP-7702**：让老 EOA 挂上合约代码，但老钥匙始终能把代码换掉 [25]。
- **BLS 聚合**：几十万验证者的投票签名能压成 96 字节的一个签名，哈希签名做不到 [18]。
- **leanXMSS**：一次性哈希签名的“树状账本”，每个时段只能签一次，签过的格子不能再用 [20]。
- **leanVM**：专门用来“证明一大批签名都验过了”的小型证明机，用一张证明代替一大堆签名 [19][18]。
- **KZG 承诺**：给 blob 拍一张可抽查的“数学指纹”，依赖一次多方仪式生成的秘密参数 [30][34]。
- **PQ blobs / leanDA**：把指纹换成哈希树 + 证明，不再需要秘密参数 [22]。
- **BN254 预编译**：L2 在 L1 上验 Groth16 / PLONK 证明用的计算器，也是椭圆曲线 [32]。
- **Frame Transaction（8141）**：交易拆成“验证帧 / 付费帧 / 执行帧”，验证规则由账户自己写，所以能换成任意签名 [9]。
- **MV-PQ**：“最低限度能扛过 Q-day”的版本，保障打折扣，是保底而不是终点 [3]。
- **strawmap**：EF 架构组画的“草稿路线图”，不是承诺 [5]。

---

## 外部调研 / 用户资料中被修正或无法核实的地方

1. **GPT §6.1“EIP-8141 仍处于 Draft，不能当作已经上线”**：表述没错但不完整。8141 在 eips 网站上是 Draft，但已在 Hegotá meta 里定为 Scheduled for Inclusion，而 Hegotá 预计 2027 Q2 上线、日期未定 [7][8][9]。GPT 漏了“已排期”这一点。
2. **GPT §6.1 表格把 7885 / 8051 / 8052 当作“值得跟踪的方案级预编译方向”**：没说清它们**都不在 Hegotá 的任何列表里**；另一份 ML-DSA 预编译 EIP-8355 已被 Declined，EF 评语是“premature standardization”[7][4]。GPT 也没提 EIP-8288（PQ 签名 / STARK 的 mempool 聚合）和 EIP-8151 / 8298（k1 退役包），这两者才是 EF 当前更看重的执行层 PQ 路径 [3][4][15][16]。
3. **GPT §6.1 leanVM“128-bit ROM、64-bit QROM soundness，形式化验证进行中，尚非生产就绪，零知识仍在规划”**：已核实，与 README@127510d1（2026-10-15）一致 [19]。要补充：README 还写着“BLAKE2s is a placeholder”，VM 已从 KoalaBear / Poseidon 迁到二进制域，基准参数“not the definitive parameter set”[19]。
4. **lane 说明 / 常见说法“leanSig 用 Poseidon2 / KoalaBear”**：不准确。leanSig@c08a3bae 用的是 **Poseidon1** over KoalaBear [20]。Vitalik 2026-02 的帖子提到 Poseidon2 的激进参数“taken hits”[23]。
5. **GPT §6.1 共识段说“EIP-8292 正在讨论相关聚合者角色，但仍属于草案”**：正确（Draft，2026-06-07）[18]。GPT 的链接带 utm 参数。
6. **GPT §1 / 用户草稿“Ethereum 的目标是 2029 年”**：要说清口径。EF Protocol 博客是“December 2029、三层”，且承诺“at least until January 2027”不变 [3]；pq.ethereum.org 和 ethereum.org 写的是“L1 协议升级约 2029，执行层完整迁移还要更多年”[1][2]。“2029”不等于“用户都迁移完”。
7. **ethereum.org PQ 页（EF 官网）的几处说法过时或与其他 EF 来源矛盾**：
   - (a) 写 8141“being considered for Hegotá in second half of 2026”，但实际已 SFI，Hegotá 预计 2027 Q2 [2][7][8]。
   - (b) 写可信设置“secure, even against quantum computers attempting to reverse-engineer it after the fact”。这与 Vitalik 把“KZG commitments+proofs”列为量子脆弱面 [23]、leanDA 帖“KZG … needs post-quantum alternatives”[22] 相矛盾。按 KZG 结构推论：公开参数含 τ·G1（`trusted_setup_4096.json` 的 `g1_monomial`）[33]，Shor 解离散对数即可求出 τ，进而伪造打开证明。所以仪式只防“经典攻击者”。
   - (c) PQ 签名“roughly 3,000 bytes”、压缩“250x”，与 EIP-8292 的“约 1.17 KiB”不一致 [2][18]。
8. **pq.ethereum.org 路线表（I*→J*→L*→M*，2026-06-27）已落后于 strawmap**：2026-08-19 加了 J* MV-PQ，09-26 把 leanSPHINCS 交易移到 I*，10-09 把 post quantum L1 移到 K* [1][6]。引用时要写明版本日期。
9. **GPT §6.1“Ethereum 的路线包含 PQ blobs，但不能描述为替代算法已定案”**：正确。可以补上最具体的候选 leanDA（RS + Poseidon Merkle + leanVM）[22]。
10. **媒体“EF 成立 200 万美元 PQ 团队”**：200 万是两个 100 万美元奖项（Poseidon、Proximity）的合计，不是团队预算；ethereum.org 只列了 Poseidon Prize $1M [2][39]。
11. **媒体（Gate）称“Glamsterdam … went live ahead of schedule”**：与 ethereum.org 不符，后者写 Glamsterdam 仍在 devnet，预计 2026 Q4 [8][42]。媒体说法有误或时间错位。

---

## 来源

1. **PRIMARY** pq.ethereum.org（EF Protocol PQ 团队，Last updated 2026-06-27，访问 2026-10-16）：证明三层路线表、“L1 protocol upgrades could be completed by 2029”、L2 准备清单、攻击面优先级、0.1% 休眠估计，以及 2,000 万美元形式化验证项目。
2. **PRIMARY** https://ethereum.org/roadmap/security/quantum-resistance/ （访问 2026-10-16）：证明 EF 2026-01 成立 PQ 团队（Coratger）、四个脆弱面、“approximately 2029”、Poseidon Prize $1M，以及本文指出的 8141 / KZG / 尺寸等不一致说法。
3. **PRIMARY** EF Protocol“Current and Emerging Priorities” https://blog.ethereum.org/2026/09/07/protocol-priorities （2026-09-07，访问 2026-10-16）：证明“December 2029 三层”、MV-PQ、分叉节奏、“Hegotá is not the PQ fork”、共识层不走敏捷性路线。
4. **PRIMARY** EF Protocol“The Hegotá EIP Opinion Post and Tier List” https://blog.ethereum.org/2026/09/07/protocol-hegota-eips （访问 2026-10-16）：证明 EIP-8355 评 C（premature standardization）、EIP-8365 是“the one PQ item”、8151 + 8298 构成 k1 退役包。
5. **PRIMARY** https://strawmap.org/ （访问 2026-10-16）：证明 strawmap 的性质（strawman、EF Architecture 维护、非预测）和“post quantum L1 … via hash-based schemes”。
6. **PRIMARY** GitHub ethereum/strawmap issue #6“drawing changelog”（Justin Drake，访问 2026-10-16）：证明 08-19 加入 MV-PQ、09-26 leanSPHINCS 移到 I*、10-05 分叉年份、10-09 PQ L1 移到 K*。
7. **PRIMARY** EIP-8081 Hardfork Meta – Hegotá https://eips.ethereum.org/EIPS/eip-8081 （Draft，访问 2026-10-16）：证明 SFI / CFI / PFI / DFI 各列表（8141 SFI、8151 CFI、8365 PFI、8355 Declined；7885 / 8051 / 8052 不在列表中）。
8. **PRIMARY** https://ethereum.org/roadmap/hegota/ 与 https://ethereum.org/roadmap/glamsterdam/ （访问 2026-10-16）：证明 Hegotá“Q2 2027 · Date not yet confirmed”、Glamsterdam“Q4 2026”。
9. **PRIMARY** EIP-8141 https://eips.ethereum.org/EIPS/eip-8141 （Draft，Created 2026-01-29，访问 2026-10-16）：证明 PQ 动机、scheme 表（ARBITRARY / SECP256K1 / P256），以及签名不可内省是为了日后聚合。
10. **PRIMARY** EIP-7885 https://eips.ethereum.org/EIPS/eip-7885 （Draft，2025-02-12）：证明 NTT 预编译的设计、gas 和地址 TBD。
11. **PRIMARY** EIP-8051 https://eips.ethereum.org/EIPS/eip-8051 （Draft，2025-10-15）：证明 ML-DSA / ML-DSA-ETH 两个预编译、4500 gas、只覆盖 ML-DSA-44。
12. **PRIMARY** EIP-8052 https://eips.ethereum.org/EIPS/eip-8052 （Draft，2025-10-17）：证明 Falcon-512 的三段式预编译、SHAKE256 与 KeccakPRNG 两个变体，以及面向 rollup 的表述。
13. **PRIMARY** EIP-7932 https://eips.ethereum.org/EIPS/eip-7932 （Draft，2025-04-12）：证明算法注册表与 sigrecover 预编译（0x12）。
14. **PRIMARY** EIP-8355 https://eips.ethereum.org/EIPS/eip-8355 （Draft，2026-07-30）：证明另一份 ML-DSA 预编译提案（44 / 65 / 87）。
15. **PRIMARY** EIP-8288 https://eips.ethereum.org/EIPS/eip-8288 （Draft，2026-06-03）：证明 leanSPHINCS / leanSTARK 依赖帧、区块级递归 STARK，以及 3000 / 30000 gas 等参数。
16. **PRIMARY** EIP-8151 https://eips.ethereum.org/EIPS/eip-8151 （Draft，2026-02-09）：证明“迁移后旧 k1 仍可通过 permit 授权”的问题和对 L2 故障证明的影响。
17. **PRIMARY** EIP-8365 https://eips.ethereum.org/EIPS/eip-8365 （Draft，访问 2026-10-16）：证明该提案（禁止新的 0x00 验证者、退役 BLS 提款凭证）存在且为 Draft。
18. **PRIMARY** EIP-8292 https://eips.ethereum.org/EIPS/eip-8292 （Draft，2026-06-07）：证明聚合者角色、约 1.17 KiB 签名、127–344 KiB 证明、执行层不变。
19. **PRIMARY** leanEthereum/leanVM README @127510d14c98ade4e8a97646c44fa7f1ff5e752d（commit 2026-10-15）：证明 128-bit ROM / 64-bit QROM、not production ready、BLAKE2s 占位、二进制域 + WHIR，以及 XMSS 聚合基准。
20. **PRIMARY** leanEthereum/leanSig @c08a3bae74b0d85379cab72dcbefa4091546ecbb（2026-04-29）README、Cargo.toml、src/lib.rs：证明原型状态、未审计、KoalaBear + Poseidon1。
21. **PRIMARY** leanEthereum/leanSpec README（main，访问 2026-10-16，未固定 commit）：证明 crypto 子规范包含 poseidon / koalabear / xmss，测试 fork 为 Lstar。
22. **PRIMARY** ethresear.ch“LeanDA: Design and Benchmark” https://ethresear.ch/t/leanda-design-and-benchmark/25642 （访问 2026-10-16）：证明 PQ-DAS 的 Encode + Prove 设计与选型理由。
23. **PRIMARY** Vitalik X 帖 https://x.com/VitalikButerin/status/2027075026378543132 （2026-02-26 17:35 UTC，经 api.fxtwitter.com 读取，访问 2026-10-16）：证明四个脆弱面、哈希函数候选、gas 量级（ECDSA 3000、哈希签名约 200k、SNARK 300–500k、STARK 约 10M），以及“8141 + 递归聚合”的路线。
24. **PRIMARY** Vitalik，ethresear.ch“How to hard-fork to save most users' funds in a quantum emergency” https://ethresear.ch/t/18901 （2024-03-09，访问 2026-10-16）：证明地址定义与四步恢复机制。
25. **PRIMARY** EIP-7702 https://eips.ethereum.org/EIPS/eip-7702 （Final）：证明 ecrecover 授权、可重新委托与清除、委托后 EOA 仍能发交易。
26. **PRIMARY** EIP-7951 https://eips.ethereum.org/EIPS/eip-7951 （Final，2025-05-27）：证明 P256VERIFY 位于 0x100、6900 gas、取代 RIP-7212（3450 gas）。
27. **PRIMARY** EIP-7607 Fusaka meta https://eips.ethereum.org/EIPS/eip-7607 （Final）：证明 Fusaka 包含 7594 与 7951，主网时间 2025-12-03 21:49:11 UTC。
28. **PRIMARY** EIP-7600 Pectra meta https://eips.ethereum.org/EIPS/eip-7600 （Final）：证明 Pectra 包含 2537 与 7702，主网时间戳 1746612311（2025-05-07 10:05:11 UTC）。
29. **PRIMARY** EIP-2537 https://eips.ethereum.org/EIPS/eip-2537 （Final）：证明 BLS12-381 预编译，以及“BN254 … only provides 80 bits”的说法。
30. **PRIMARY** EIP-4844 https://eips.ethereum.org/EIPS/eip-4844 （Final）：证明 KZG 承诺、0x0A 预编译、版本化哈希的前向兼容设计，以及 rollup 的使用方式。
31. **PRIMARY** EIP-7594 https://eips.ethereum.org/EIPS/eip-7594 （Final）：证明 PeerDAS 的 cell KZG proofs。
32. **PRIMARY** EIP-196 / EIP-197 https://eips.ethereum.org/EIPS/eip-197 （Final，2017）：证明 BN254 预编译是为 zkSNARK 验证而设，地址 0x8。
33. **PRIMARY** ethereum/consensus-specs master @12c8b24bc09b12f62688d439ba20ef00b1fdfe1f（2026-10-13）`specs/phase0/beacon-chain.md` 与 `presets/mainnet/trusted_setups/trusted_setup_4096.json`：证明 BLS12-381 类型、IETF BLS ciphersuite、randao_reveal 的 BLS 验证，以及公开参数含 `g1_monomial`。
34. **PRIMARY** https://ethereum.org/roadmap/danksharding/ （访问 2026-10-16）：证明 KZG 仪式“over 140,000 contributions”、Dencun 2024-03 上线。
35. **PRIMARY** EIP-7864 https://eips.ethereum.org/EIPS/eip-7864 （Draft，2025-01-20）：证明 binary tree 的哈希未定，以及 Verkle 因椭圆曲线不 PQ 而被放弃的理由。
36. **PRIMARY** ERC-4337 / ERC-1271（eips.ethereum.org，均为 Final，访问 2026-10-16）：证明合约账户与合约验签标准的状态。
37. **PRIMARY（检索摘录）** EF 博客“Shipping an L1 zkEVM #1: Realtime Proving” https://blog.ethereum.org/2025/07/10/realtime-proving ：证明实时证明定义（≥128 bit、≤300KiB、不得使用带可信设置的递归包装）。
38. **PRIMARY（检索摘录）** EF 博客“Shipping an L1 zkEVM #2” https://blog.ethereum.org/2025/12/18/zkevm-security-foundations ，以及 https://zkevm.ethereum.foundation/blog/cryptography-research-update （2026-02-11）：证明 M1–M3 安全里程碑，M3 改到 2026-12 初。
39. 媒体：The Block / CoinDesk / Cointelegraph / Yahoo（Cryptonews），2026-01-24：转述 Justin Drake 2026-01-23 X 帖（PQ 团队成立、两项 100 万美元奖项、PQ 交易双周会）。
40. 已有报告：native-aa-eip-8130-8141/explainer.md（2026-10-04）：记录 8141 于 ACDE #244 定为 SFI，与本路一致。
41. 已有报告：starknet-account-model 台账 R40–R47、A53–A60：EF 博客与 pq.ethereum.org 的早前核对结果，以及 7702 授权路径。
42. 媒体：Gate News（2026-08-28 / 09-01）：转述 2026-08-27 ACD 将 8141 定为 SFI；其“Glamsterdam 已提前上线”的说法有误。

## 开放问题

1. strawmap 最新图上，“PQ sig precompiles”是否还在某个分叉格里？PQ blobs 现在在 K*、L* 还是更后？需要打开 Google Drawing 原图核对。
2. leanXMSS 生产参数用哪个哈希？leanSig 用 Poseidon1 / KoalaBear，leanVM 用 BLAKE2s 占位，两者谁随谁改？EF 何时公布“canonical hash function”的决定？
3. 8141 进入 Hegotá 时会不会带上 PQ scheme（如 8288 的 0x10），还是只保留 ARBITRARY？8151 / 8298 最终能否进 Hegotá？
4. EF 是否会对 L2 提出时间表，或推出共享标准（签名、密钥管理）？pq.ethereum.org 只说“shared standards where interoperability matters”。
5. KZG 的量子风险：EF 是否会更正 ethereum.org 上“仪式对量子也安全”的说法？
6. MV-PQ 的“reduced guarantees”具体指什么？EF 原话是“Researchers are still defining”。
7. 2027-01 的 deadline 重新评估，结果会怎样？

---

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| E1 | Ethereum 地址定义为 keccak(priv_to_pub(k))[12:]，发过一次交易就会暴露公钥 | [24] 正文第 3 段“An Ethereum address is defined as…” | observed | |
| E2 | EIP-7702 用 ecrecover 从授权元组恢复 authority，消息为 keccak(MAGIC‖rlp([chain_id,address,nonce])) | [25] Behavior 第 3 步 | observed | |
| E3 | EIP-7702 允许已委托账户再次委托，address 为 0 时清除代码 | [25] Behavior 第 5、8 步 | observed | |
| E4 | EIP-7702 委托后的 EOA 仍可用原私钥发起交易 | [25] “Transaction origination”一节 | observed | |
| E5 | 只要原 ECDSA 私钥被量子恢复，7702 账户上挂的 PQ 验证模块就可被绕过（重写 / 清除委托或直接发交易） | 由 E2、E3、E4 推出：授权根始终是 secp256k1 私钥 | inferred | |
| E6 | EIP-7702 与 EIP-2537 随 Pectra 上主网，时间戳 1746612311（2025-05-07 10:05:11 UTC） | [28] Included EIPs 与 Activation 表 | observed | |
| E7 | P-256 预编译 EIP-7951（0x100，6900 gas）随 Fusaka 于 2025-12-03 21:49:11 UTC 上主网，取代 RIP-7212 | [26] Precompile 节与“supersedes RIP-7212”；[27] Included EIPs 与 Mainnet 行 | observed | |
| E8 | EIP-7951 与 RIP-7212 接口相同，但 gas 不同（6900 vs 3450），原文称“does not maintain compatibility with L2s” | [26] Interface Compatibility、Gas Cost Justification | observed | |
| E9 | 信标链签名用 BLS12-381（公钥 48B 在 G1，签名 96B 在 G2），按 IETF BLS 草案 v4 | [33] phase0/beacon-chain.md 的 BLSPubkey / BLSSignature 与“BLS signatures”节 @12c8b24b | observed | |
| E10 | RANDAO reveal 由提议者的 BLS 签名验证 | [33] process_randao 中 bls.Verify(... body.randao_reveal) | observed | |
| E11 | EIP-4844 blob 用 BLS12-381 上的 KZG 承诺，point evaluation 预编译在 0x0A，50000 gas | [30] Parameters 表与 Point evaluation precompile 节 | observed | |
| E12 | KZG 仪式有 14 万多次贡献，blob 于 2024-03 随 Dencun 上线 | [34] “What was the KZG Ceremony?”与 Current progress | observed | |
| E13 | PeerDAS（EIP-7594，Fusaka）引入 cell KZG proofs，由 blob 交易发送者计算 | [31] Networking 节；[27] Included EIPs | observed | |
| E14 | BN254 预编译（EIP-196/197，0x6–0x8）是为链上 zkSNARK 验证而加的 | [32] EIP-197 Simple Summary 与 Address: 0x8 | observed | |
| E15 | EIP-2537 作者称 BN254 只有约 80 bit 经典安全，BLS12-381 有 120+ bit | [29] Motivation 原文 | observed | |
| E16 | EIP-7864 binary tree 的哈希函数未定，候选为 BLAKE3 / Keccak / Poseidon2，原文要求不要假定 BLAKE3 | [35] 摘要下 Note 段与 Rationale 候选列表 | observed | |
| E17 | EIP-7864 放弃 Verkle 的理由之一是 Verkle 依赖不抗量子的椭圆曲线 | [35] Rationale“Verkle Trees … rely on elliptic curves that aren’t post-quantum secure” | observed | |
| E18 | EF Protocol 目标：2029 年 12 月 L1 在执行、共识、数据三层抗量子，至少到 2027 年 1 月不改 | [3] “I. The north star” | observed | |
| E19 | pq.ethereum.org 写“L1 protocol upgrades could be completed by 2029”，执行层完整迁移还要更多年 | [1] FAQ“Implementation & Timeline” | observed | |
| E20 | ethereum.org 写核心 PQ 基础设施约 2029 年完成，执行层与生态迁移在此之后 | [2] Migration milestones 的“Target”段 | observed | |
| E21 | “Ethereum 2029”指 L1 协议具备 PQ 能力，不代表所有账户 / 资产已迁移 | 由 E18、E19、E20 推出：三份 EF 文本都把用户迁移放在协议完成之后 | inferred | |
| E22 | EF 原话“Hegotá is not the PQ fork”，Hegotá 已排期的只有 FOCIL（EIP-7805）与 Frame Transaction（EIP-8141） | [3] V 节；[7] EIPs Scheduled for Inclusion | observed | |
| E23 | EIP-8141 在 eips 网站上仍是 Draft（Created 2026-01-29），但在 Hegotá meta 里是 Scheduled for Inclusion | [9] 页头“Draft”；[7] Scheduled 列表 | observed | |
| E24 | Hegotá 预计 2027 Q2 上主网，日期未确认；Glamsterdam 预计 2026 Q4、未确认 | [8] 两页的 Upgrade status | observed | |
| E25 | EIP-8141 的协议级签名 scheme 只有 ARBITRARY(0x0) / SECP256K1(0x1, 2800 gas) / P256(0x2, 6700 gas)，暂无 PQ scheme | [9] Transaction Signatures 节 scheme 表 | observed | |
| E26 | EIP-8141 让协议校验的签名字节不可被 EVM 内省，为日后聚合留出空间 | [9] Transaction Signatures 节“intentionally not introspectable … future aggregation” | observed | |
| E27 | EIP-7885、8051、8052 均为 Draft，不在 Hegotá meta 的任何列表里 | [10][11][12] 页头 Draft；[7] 四个列表都没有这三号 | observed | |
| E28 | ML-DSA 预编译 EIP-8355 已被 Hegotá Declined，EF 评 C 级，原话“premature standardization” | [7] Declined 列表；[4] 分级表 8355 行 | observed | |
| E29 | EIP-8051 定义 FIPS-204 合规版与偏离 FIPS-204 的 Keccak 变体（0x12 / 0x13，各 4500 gas），只覆盖 ML-DSA-44 | [11] Abstract 与 Specification 表 | observed | |
| E30 | EIP-8052 定义 Falcon-512 的 SHAKE256（NIST 合规）与 KeccakPRNG（EVM 友好）两种 hash-to-point，并面向 rollup 集成 | [12] Abstract | observed | |
| E31 | EIP-7932 与 EIP-8051 的 Draft 都写到预编译地址 0x12，PQ 预编译地址尚未协调 | [13] Parameters 表；[11] Specification 表 | observed | |
| E32 | EIP-8288（Draft，2026-06-03）在 8141 上加依赖帧，用区块级递归 STARK 聚合 leanSPHINCS 签名（3000 gas）与 leanSTARK（30000 gas） | [15] Abstract 与 Constants 表 | observed | |
| E33 | EIP-8151 指出迁移后旧 k1 私钥仍可经 ecrecover（如 ERC-2612 permit）授权，提议在账户有代码时让 ecrecover 返回 0；状态为 Hegotá CFI | [16] Motivation；[7] Considered 列表 | observed | |
| E34 | EF 把 EIP-8151 与 EIP-8298 合称“k1 exit”包，把 EIP-8365 称为“The one PQ item that belongs in Hegotá” | [4] 分级表 8151、8298、8365 行 | observed | |
| E35 | strawmap 于 2026-08-19 在 J* 加入 MV-PQ（PQ heartbeat、leanDA、leanSPHINCS） | [6] Aug 19 条目；[3] “Two cadences”段 | observed | |
| E36 | strawmap 2026-10-05 标注 I*=2028、J*=2028–29、K*=2029、L*=2029–30 | [6] Oct 5 条目“dates” | observed | |
| E37 | strawmap 2026-10-09 把“post quantum L1”和“leanXMSS PQ attestations”从 L* 移到 K* | [6] Oct 9 条目 | observed | |
| E38 | pq.ethereum.org 的路线表（2026-06-27，I*→J*→L*→M*）落后于 strawmap 之后的调整 | 由 E35、E37 与 [1] Roadmap 表 / Last updated 推出 | inferred | |
| E39 | strawmap 自述为 strawman、“not a prediction”，最终方向由 ACD 决定 | [5] “Why the strawmap name”；[1] 路线表下方声明 | observed | |
| E40 | EF 认为共识层不能依赖密码学敏捷性，组件要等完整 PQ 设计后再上线 | [3] III 节 Post-quantum 段 | observed | |
| E41 | MV-PQ 是“temporary safeguard … with reduced guarantees”，完整经济终局性还需要 PQ attestations | [3] “MV-PQ is a temporary safeguard” | observed | |
| E42 | EIP-8292（Draft，2026-06-07）设立 opt-in 聚合者，用 leanVM 证明替代 BLS 聚合；当前签名约 1.17 KiB，聚合证明 127–344 KiB | [18] Abstract 与 Motivation | observed | |
| E43 | leanVM README 写“128-bit ROM (64-bit QROM) soundness”，并写明“not (yet) production ready” | [19] README security 节 @127510d1 | observed | |
| E44 | leanVM 的哈希“BLAKE2s is a placeholder”，ZK 支持在规划中，已从 KoalaBear / Poseidon 迁到 192-bit 二进制域 + WHIR | [19] README“work in progress”与“SNARK machinery”节 | observed | |
| E45 | leanVM 基准（M4 Max）：900 个 XMSS 聚合，证明 317.4 KiB、0.545 s、验证 3.977 ms，参数非最终 | [19] README“XMSS aggregation”节 | observed | |
| E46 | leanSig@c08a3bae 用 KoalaBear 域上的 Poseidon1，自述原型、未审计、不应用于生产 | [20] README Disclaimers / Schemes；src/lib.rs 的 type F = KoalaBear | observed | |
| E47 | Vitalik 称所选哈希可能是“Ethereum’s last hash function”，候选为 Poseidon2 加额外轮数、Poseidon1、BLAKE3 | [23] “Consensus-layer signatures”段 | observed | |
| E48 | Ethereum 的“规范哈希函数”尚未选定，签名库与 leanVM 当前用的哈希不一致 | 由 E16、E44、E46、E47 推出 | inferred | |
| E49 | PQ DA 的替代方案仍在研究，leanDA 用 RS 码 + Poseidon Merkle 承诺 + leanVM 证明编码正确 | [2] DA 节“still being researched”；[22] §1、§3 | observed | |
| E50 | Vitalik 把 KZG 承诺与证明、应用层 ZK 证明（KZG 或 Groth16）列为量子脆弱面 | [23] 开头列表 | observed | |
| E51 | ethereum.org 称 KZG 可信设置对事后量子攻击也安全，与 E50 及 leanDA 帖矛盾 | [2] DA 节“Current mitigation”；[23]；[22] §1 | observed | |
| E52 | 量子攻击者可从公开的 τ·G1（g1_monomial）用 Shor 求出 τ，从而破坏 KZG 绑定性；仪式只防经典攻击者 | 由 E11、E50 与 [33] trusted_setup_4096.json 的 g1_monomial 推出：KZG 陷门是离散对数 | inferred | |
| E53 | Vitalik 给出的 gas 量级：ECDSA 验签 3000，哈希签名约 200k，SNARK 300–500k，PQ STARK 约 10M（对 L2 不可接受） | [23] “EOA signatures”与“Proofs”段 | observed | |
| E54 | EF 的实时证明定义要求 ≥128 bit、≤300KiB，且不得使用带可信设置的递归包装 | [37] “working definition”列表与前一段 | observed | |
| E55 | EF zkEVM 128-bit 可证明安全里程碑 M3 改到 2026-12 初 | [38] zkevm.ethereum.foundation 2026-02-11“M3 Deadline Updated” | observed | |
| E56 | Vitalik 2024-03 的紧急分叉方案：回滚、禁用 EOA 交易、引入合约钱包交易、用 STARK 证明哈希原像与地址的对应关系后迁移 | [24] 编号列表 1–4 | observed | |
| E57 | ethereum.org 写 EF 于 2026-01 成立 PQ Security 团队（Thomas Coratger 领导），设 $1M Poseidon Prize | [2] “The Ethereum Foundation's approach”与 Current activity | observed | |
| E58 | “EF 200 万美元 PQ 团队”是媒体把两个 100 万美元奖项合计后的说法，没有官方团队预算 | [39] 各媒体正文；[2] 只列 Poseidon Prize $1M | observed | |
| E59 | pq.ethereum.org 给 L2 的建议是保护排序器 / 管理员密钥、桥与跨链消息、AA 用户账户、zk-rollup 的证明系统，并称协议演进“chain-specific” | [1] FAQ“Ecosystem & Broader Context” | observed | |
| E60 | ethereum.org 对应用层 ZK 证明的方案是依靠生态自然转向 STARK，不在 L1 协议里替代 | [2] “4. Application-layer ZK-proofs”的 approach 段 | observed | |
| E61 | EIP-4844 用版本化哈希为“Merkle + STARK”的 PQ 切换预留接口，rollup 无需 EVM 级改动，只需切换交易类型 | [30] Rationale“Versioned hashes & precompile return data” | observed | |
| E62 | EIP-8151 说明：L2 故障证明若在 L1 重执行 ecrecover 会出错，L2 采纳时须用自身账户代码做检查 | [16] “Cross-Domain / L2 Fault Proof Implications” | observed | |
| E63 | L2 会随 L1 自动获得共识层与 blob DA 的 PQ 升级，前提是继续在 L1 结算、用 blob，并切换到新的 blob 交易 / 承诺版本 | 由 E40、E49、E61 推出 | inferred | |
| E64 | L2 在 L1 上的 Groth16 / PLONK（BN254）验证器、L2 自身账户规则、桥与升级合约的管理密钥不会因 L1 升级而自动 PQ 化 | 由 E14、E50、E59、E60 推出：L1 路线只覆盖 L1 协议层，并把这些点列为 L2 自己的责任 | inferred | |
| E65 | EVM-equivalent L2 若要获得 8141 / 8151 这类账户层 PQ 能力，需要在自己的链上硬分叉跟进 | 由 E23、E33、E62 推出：这些是执行层协议改动，L2 执行客户端须自行激活 | inferred | |
| E66 | 在协议层聚合（如 EIP-8288）落地前，L2 若把最终证明直接换成 PQ STARK 在 L1 验证，成本约 10M gas 量级 | 由 E32、E53 推出；EIP-8288 尚未进入任何分叉，落地时间不确定 | speculative | |
| E67 | ethereum.org 写 8141“being considered for Hegotá in second half of 2026”，已过时 | [2] EOA 节；对照 [7] SFI 与 [8] Q2 2027 | observed | |
| E68 | ethereum.org 写哈希签名“roughly 3,000 bytes”、leanVM 压缩 250x，与 EIP-8292 的约 1.17 KiB 口径不一致 | [2] Consensus 节；[18] Motivation | observed | |

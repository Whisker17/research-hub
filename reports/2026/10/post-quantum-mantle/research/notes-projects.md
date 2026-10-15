# notes-projects：Starknet / Aztec / 其他项目的 PQ 路线（lane = projects，前缀 O）

> 调研日期 2026-10-16（UTC+8）。网页来源的访问日期均为 2026-10-16。GPT Deep Research 只当线索使用，所有论断已追到一手来源，追不到的标为 speculative。

**一句话总结**：截至 2026-10-16，没有哪个项目完成了“全栈 PQ”。真正上了主网的 PQ 组件只有这几样：Algorand 的 Falcon 状态证明（2022）和原生 Falcon-1024 账户（v5.0.0，2026-08）；Starknet 的 OS hash 改用 BLAKE2s（v0.14.3），外加一笔 Falcon 账户演示交易；Zcash Ironwood 池的“量子可恢复”note 格式（NU6.3，2026-07-28）；QRL 自 2018 年起的 XMSS；以及 Solana 上的应用层 Winternitz 金库。其余（Optimism 的 2036 年时间表、Aztec 的 2027 年选型节点、BIP-360/361、Solana Falcon、Sui ML-DSA、SP1 去掉 Groth16 包装）都还是路线图、草案或研究。

**本路问题的一句话答案**：项目普遍先做“账户可换签名”与“哈希型证明”，最难的三块是共识签名聚合、DA 承诺和 L1 结算，各家都排在最后，并且都依赖 Ethereum。对 Mantle 最直接的参照有两个：Optimism 的 Superchain 路线（同属 OP Stack），以及 Mantle 自己所用 OP Succinct / SP1 的 L1 验证路径（BN254 包装、可替换的 verifier、ECDSA 的 owner/proposer 密钥）。

---

## O-Q1 Starknet（复用 starknet-account-model 报告，并补查 10-14 之后的进展）

**答案**：10-14 之后没有新的官方进展。Migration Register 仍写“Last updated: 19 August 2026”。starknet.io 博客最新一篇是 2026-08-07 的《Starknet’s Upgrade to Quantum Resistance》，10 月没有新文章。

**依据（摘要，引用既有台账）**：
- 官方定性：Quantum Hub 对“Is Starknet quantum-resistant?”的回答是“No. Not as a single system-wide claim.”（见 starknet-account-model 台账 C1/R29）。
- 已上主网：v0.14.3（2026-07-08 完成升级）把 OS program/config hash 从 Pedersen 换成 BLAKE2s（C21–C23、R19–R21）；compiled class hash 自 v0.14.1 起改用 Blake，但官方给的动机是证明效率，不是 PQ（R57）。
- 主网演示：OZ Falcon512ShakeDirectAccount 于 2026-07-22 在主网完成一笔 0.01 STRK 转账，标注实验性、未审计（A46、C53–C56、R28）。
- 未上线：合约树 / 存储树、合约地址派生仍用 Pedersen；路线图估计“约两个月”完成，实际已延期（C14–C17、R22–R26）。旧合约存储迁移工具处于研究阶段，没有规范（C19、R27）。
- 依赖 Ethereum：blob KZG、桥的 secp syscall（R18、C28、C30–C32）。共识投票当前没有签名，“PQ 共识签名”只是对新功能的要求（R16、R34、R36）。
- 2026-10-08“考虑成为 L1，2027 为目标”只是考虑加目标年份，没有规范，也没有治理流程（R1–R12）。
- 新核对：Register 页脚“Last updated: 19 August 2026”[4]。starknet.io/blog/all 最新一篇是 Aug 7, 2026 [5]。

**不确定之处**：StarkWare 自己的 blog（starkware.co）与 X 账号可能有 10-14 之后的帖子，本路没有逐条检索。

## O-Q2 Aztec

**答案**：《Post-Quantum Aztec》于 2026-10-15 发布，作者 Zac Williamson、Mike Connor，编辑 David Steinrueck [1]。文章设了两个目标（2027-02 强化库与开发模式、2030 完成全面迁移）和三个选型节点（2027-03 签名、2027-07 公钥加密、2027-11 证明系统）。核心判断是：隐私数据的 HNDL 防护现在就能在应用层做，证明系统和协议密钥则需要时间。

**依据**：
- 两个目标，原文：“February 2027: Hardened libraries and better off-the-shelf contract development patterns that protect against harvest-now-decrypt-later attacks”；“2030: a full post-quantum migration.” 第二个目标“reaches into the proving system, account authentication, key derivation, validator signatures and Ethereum settlement”[1]。
- 三个选型节点，原文：“March 2027: choose a post-quantum signature scheme. July 2027: choose a post-quantum public-key encryption scheme, with constrained note delivery benchmarked in the leading proof systems. November 2027: choose a post-quantum proving system.”[1]
- 需求清单 [1]：
  - 协议层：PQ 零知识证明系统；地址与公钥（目前都是椭圆曲线点）；验证者 attestation 的 PQ 签名；采纳 Ethereum 的相关变更。
  - 应用层：PQ 签名、PQ KEM、PQ 公钥加密。文章称这些“not on Ethereum’s post-quantum roadmap”。
  - Ethereum 层：不用 BLS12-381 KZG 的 DA；替代 BN254 预编译的廉价 PQ SNARK 验证原语；EOA 公钥与签名；BLS 密钥。
- HNDL 防护 [1]：
  - 大多数协议公钥经过哈希处理，不对合约暴露。对 nullifier 公钥做哈希，可以防“harvest now; link later”。
  - 支持 offchain note delivery（链下投递 note）。
  - constrained delivery：在电路里约束接收方一定能发现并解密；协议保证 private log 原样进入 Ethereum blob。
- 证明系统需求：手机或浏览器能证明、“Actual zero-knowledge”、快速客户端递归、客户端证明小、L1 验证便宜、简单可维护。当前 CHONK 基于椭圆曲线和配对，证明约 20kb。快的 PQ 证明系统证明约 300KB，“not ok”。作者的工作估计是 2-to-1 聚合需在现代 CPU 上约 20–100ms 内完成才可行 [1]。
- 候选证明系统：二进制域 / 小素数域上的哈希型系统（引用 Flock：M4 Mac 十核每秒 660,000 次 BLAKE3）、格型系统（引用 Jolt/Akita）、混合表示。结论：“choosing a winner today premature”[1]。
- keystore registry：正在探索把地址原像里的密钥外置到“canonical keystore registry”，届时地址只是哈希，不再是椭圆曲线公钥 [1]。
- 哈希函数：Poseidon2 “is technically post-quantum secure”，但鉴于小域 Poseidon 近期被攻破，长期“will likely replace it with either Blake2s or Blake3”，并且“more than likely follow [EF’s] lead”[1]。
- Q-day 判断，原文：“I think Q-day within four years is unlikely”，并说如果有证据显示硬件进展更快，会抽调资源加速 [1]。
- 实现风险：AI 审计工具发现了人工审计没发现的严重漏洞，已在即将发布的 v6 中修复。默认方针是“conservative”，要求“formally-verified implementations”[1]。
- Aztec 账户密钥（docs）[2]：
  - 协议密钥共 6 类：Nullifier、Incoming Viewing、Outgoing Viewing、Tagging、Message-Signing、Fallback，均“Rotatable: No”。
  - 签名密钥由账户合约定义，可轮换。
  - 所有协议密钥都在 Grumpkin 曲线上。
  - 地址 = (pre_address·G + Ivpk_m).x，其中只有 Ivpk_m 仍以椭圆曲线点参与计算，其余 5 个以哈希形式进入 public_keys_hash。
  - 协议密钥“embedded in the address … If compromised, a new account must be deployed”。

**不确定之处**：
- 文中“2030”是否指 2030 年底：原文另有“end of year 2030”一句，倾向年底。
- 文中 MIKE 论文链接用的是 eprint.iacr.**asia** 域名，真实地址是 eprint.iacr.org/2026/2377 [38]。可能是笔误，引用时应改用 .org。
- “6 October 发布”这一日期没能在 eprint 页面核实。

## O-Q3 Optimism / Superchain

**答案**：《A Post-Quantum Roadmap for the Superchain》，作者 Karl Floersch，发布于 2026-01-14 [3]。核心内容：
- OP Labs 承诺以 10 年为期，在 OP Mainnet 与 Superchain 上弃用 ECDSA EOA，“subject to governance approval”；到 2036 年 1 月，所有 ECDSA EOA 须已把密钥管理委托给 PQ 智能账户。
- sequencer 与 batch submitter 将改用 PQ 签名。
- 具体签名方案未定。
- 通过硬分叉落地，迁移期内 ECDSA 与 PQ 双路径并行。

**依据（原文要点）[3]**：
- “OP Labs is committing to a 10‑year timeline to deprecate ECDSA‑based externally owned accounts (EOAs) on OP Mainnet and across the Superchain, subject to governance approval. By January 2036: ECDSA-signed EOA transactions will be deprecated. Every ECDSA EOA must have delegated its key management to a post‑quantum smart contract account.”
- 迁移路径：“Smart wallet migration via EIP‑7702 or future AA standard”；10 年窗口结束后“OP Stack chains are expected to deprecate raw ECDSA-signed EOA transactions”。
- 方案未定：“The specific post‑quantum signature scheme is not yet decided. We don’t yet know whether the NIST‑standardized lattice‑based signatures are the best long‑term choice”。
- 基础设施：“The L2 sequencer and batch submitter will transition off ECDSA signatures to post‑quantum signatures.”“OP Stack chains will inherit a common roadmap”。
- 对 Ethereum 的立场：主张 Ethereum 承诺时间表，把验证者从 BLS、DA 从 KZG 迁走；“PQ‑safe consensus is not optional”。
- 交付方式：方案收敛后“Specify the upgrade … including wallet patterns, sequencer keys, and onchain validation rules”→“Schedule and coordinate a hardfork across OP Mainnet and participating OP Stack chains”→“Run overlapping support for ECDSA and post‑quantum paths”。
- 原文**没有**提到 proposer / challenger（故障证明）密钥、L1 桥 / 升级权限（ProxyAdmin、Security Council 多签）的 PQ 计划，也没有提到证明系统或故障证明 VM。
- 本路在 gov.optimism.io 首页和搜索中没有找到对应的治理提案（检索有限）。

**不确定之处**：
- “participating OP Stack chains”是否包括 Mantle，原文没说。Mantle 是否参与 Superchain 共同路线需要内部确认。
- 这份承诺目前是 OP Labs 单方面声明，治理尚未批准。

## O-Q4 Algorand

**答案**：Algorand 是目前进度最靠前的 L1，但同样没有完成全链迁移：
- 2022 年起 State Proofs 使用 Falcon 签名（主网）。
- 2025-11 起可用 LogicSig 实现 Falcon 账户（主网）。
- algod v5.0.0（共识 v42）引入原生 Falcon-1024 账户：GitHub 发布于 2026-08-12，2026-08-15 达到 90% 支持阈值，之后经约 7 天（208,000 轮）冷却期激活。
- 共识层的 VRF 与参与密钥仍基于 Ed25519 和椭圆曲线；PQ VRF 论文目标是 2027 年初。

**依据**：
- v5.0.0：“post-quantum accounts are now a native part of the Algorand protocol”“reached the needed 90% support threshold on August 15 … go live on mainnet after a mandatory 208,000 round (~7 day) cooldown”[8]。GitHub release v5.0.0-stable 的 published_at 为 2026-08-12T14:30:21Z [13]。技术页写“live on Mainnet as of August 2026”[11]。
- 原生账户机制 [9]：
  - 地址 = SHA512-256("PQA"‖scheme‖salt‖pk)。
  - Falcon-1024 签名约 1.2KB、公钥约 1.8KB。
  - 最低费用 3,000 µAlgo，Ed25519 为 1,000 µAlgo。
  - 迁移方式是 rekey，原话：“Your public address stays the same; from that point on, only the Falcon key can authorize its transactions.”
- Falcon 规格 [10]：公钥 1793 字节，压缩签名最大 1423 字节，State Proofs 与 PQ 账户使用同一实现。
- State Proofs [11]：每 256 轮一次，“signed by Algorand node runners composing a supermajority of the stake … they use Falcon signatures”。
- 路线图 [12]：2026-06-18 新闻稿称“committing to advance broad quantum resilience by the end of 2027”。
- 剩余工作 [11]：
  - 原生多签尚未覆盖，暂用 LogicSig 过渡。
  - VRF“derives its randomness and uniqueness guarantees from elliptic-curve cryptography that is not quantum-resistant”，目标是“present a research paper on a PQ VRF in early 2027”。
  - 参与（共识）密钥“all based on the classical elliptic-curve signature scheme Ed25519”。
  - Falcon-512 计划年底支持。

**不确定之处**：
- 主网激活的确切日期与轮次没有在官方页面找到。按 8-15 加约 7 天推算约为 2026-08-22，属推论。
- v5.0.0 博客自相矛盾：一处说原生账户“not a first step”，另一处又说是“first roadmap deliverable”。

## O-Q5 Bitcoin

**答案**：两份 BIP 都还是 Draft，均未激活。
- BIP-360 名称已从 P2QRH 改为 P2TSH，再改为 **P2MR（Pay-to-Merkle-Root）**。它是去掉 key path 的类 Taproot 输出，本身**不引入** PQ 签名，只防“长暴露攻击”。
- BIP-361《Post Quantum Migration and Legacy Signature Sunset》（Lopp 等 6 人，Informational）提出：激活后约 3 年禁止向旧脚本付款（Phase A）；再过 2 年限制 ECDSA/Schnorr 花费，必须通过量子安全的救援协议（Phase B）。无法救援的币（如 P2PK）实际上会被冻结。

**依据**：
- BIP-360 [14]：作者 Hunter Beast、Ethan Heilman、Isabel Foxen Duke；Status Draft；Assigned 2024-12-18；v0.12.1（2026-07-24）。原文：“this proposal does not include the introduction of post-quantum signature schemes”；P2MR 输出“only resistant to ‘long exposure attacks’”；“does not, by itself, protect against short exposure quantum attacks”。
- BIP-361 [15]：Assigned 2026-02-11；Requires“TBD Post Quantum Signature BIP”。Phase A“160,000 blocks (~3 years) after BIP-361 activation”；Phase B“2 years after Phase A”，即激活后 5 年的 flag-day。作者称 P2PK“not currently believed possible to construct a rescue protocol”。救援协议的示例包括 BIP-32 hardened 派生知识证明、ZK-STARK、commit/reveal。
- 媒体：Cointelegraph 报道 Lopp 称 BIP-361“not currently in a position to be adopted … a rough sketch”[17]。
- 暴露公钥规模：Project Eleven 的“Risq List”页面显示 8,177,337 BTC（LAST UPDATED 9/14/2026，block 966,848）[16]。它的早期博客写约 6.2M BTC；Cointelegraph 写约 1.7M BTC 在早期 P2PK 地址。口径（是否计入地址复用、P2SH 复用、交易所冷钱包）差异很大。

**不确定之处**：暴露 BTC 数量没有权威一手链上统计，第三方口径差异达数倍，报告里只能给区间并注明口径，标 speculative。

## O-Q6 Solana

**答案**：
- 没有已上线的协议级 PQ。Solana Foundation 于 2026-04-27 发文，称 Anza 与 Firedancer 各自独立选中 Falcon，并已有初始实现。路线分三步：继续研究；威胁可信时新钱包采用 PQ；再迁移旧钱包。没有时间表。
- Anza 同日的博客讨论了 Falcon 账户、通过 ZK 证明种子知识实现保留地址的迁移、Alpenglow 的 BLS 投票改用 Falcon，但明确“None of this constitutes a commitment”。
- 应用层已有 Dean Little 的 Winternitz Vault（2025-01，未审计）。

**依据**：
- Foundation 博客 [18] 三步路线原文：“Continue quantum research and keep evaluating Falcon, and its alternatives / If quantum becomes a credible threat, adopt a post-quantum scheme for new wallets / Migrate existing wallets”。实现链接为 firedancer PR #9446、anza-xyz/solana-sdk PR #537。日期取自 CoinDesk 2026-04-27 的报道 [22]，因为页面正文没有日期。
- Anza [19]（Max Resnick、Sam Kim，2026-04-27）：
  - 迁移证明原型约 400 kB、约 55ms。
  - 交易扩容提案 SIMD-0296/0385（扩到 4096 字节）；Falcon 预编译提案 SIMD-0461。
  - 共识：“Alpenglow uses BLS signatures … vote messages need to replace BLS signatures with a post-quantum secure alternative such as FALCON”。
  - 风险估计：五年内能破解 ECDLP-256 的概率为 3–5%。
- Winternitz Vault [20]：用 WOTS 一次性签名，Keccak256 截断到 224 位；README 自称“larping as a cryptographer”，没有审计。另一处提醒：如果程序的 upgrade authority 是普通密钥，资金仍然暴露。
- 2026-08-06 的官方 changelog 提到“Anza shared a post-quantum improvement to Alpenglow”[39]（只看到摘要）。

**不确定之处**：Alpenglow 的 PQ 改进内容没有读到原文。

## O-Q7 Zcash

**答案**：Zcash 的做法是先保证“可恢复”，而不是直接上 PQ。
- ZIP 2005《Ironwood Quantum Recoverability》（Status: Proposed，Created 2025-03-31）随 NU6.3 生效，2026-07-28 在主网高度 3,428,143 激活。此后每个 Ironwood 池输出的 note 都是“可恢复 note”，将来可以通过一个对抗量子的 Recovery Protocol 取回资金。
- 它“does not by itself make the protocol secure against quantum adversaries”，Recovery Protocol 本身尚未加入共识。
- Sprout / Sapling / Orchard 池在被关闭后资金将无法恢复。
- 透明地址不在这份 ZIP 的范围内。

**依据**：
- ZIP 2005 [23]：“Critically, the note commitment algorithms used by the Sapling and Orchard shielded protocols are not post-quantum binding”；“This change is enforced from NU6.3: every Ironwood-pool output note is a recoverable note”；“It is not required to add support for the Recovery Protocol to consensus rules now”；“The situation with respect to Privacy is unchanged for any pool”；“Attacks on transparent spend authentication are not addressed”。
- ZIP 258（NU6.3 部署，Draft）[24]：主网 ACTIVATION_HEIGHT 3428143，共识来源列出 ZIP 2005；Orchard 改为只能花出。
- 激活日期：一份 SEC S-1 文件写“On July 28, 2026, Zcash developers activated … ‘Ironwood’ (NU6.3)”[25]。另有背景：Ironwood 的直接起因是 2026-05 在 Orchard 电路发现的 soundness bug（同一来源）。
- Aztec 原文也把 Zcash Sapling/Orchard 作为“密钥烘焙进地址”的同类例子 [1]。

**不确定之处**：
- ZIP 2005 / 258 的文档状态仍是 Proposed / Draft，与“已激活”并存，是文档状态滞后。
- GPT 和 brief 提到的“Tachyon”本路未核查。

## O-Q8 Succinct / SP1 与 OP Succinct

**答案**：SP1 目前**不是**端到端 PQ。
- 链上验证用 Gnark 的 BN254 Groth16/PLONK 包装，依赖可信设置。
- 内层 SP1 Hypercube 也有一处椭圆曲线离散对数假设：内存论证使用 KoalaBear 七次扩域上的椭圆曲线。
- Succinct 的公开方向是 2026-05-01 的 VEIL 博客：“Once integrated into SP1, VEIL will replace the Groth16 wrapper with a hash-based one”，并称这让 SP1“on the path to full post-quantum security”。这是路线图，没有日期。
- OP Succinct 的 L1 路径：proposer 提交聚合证明 → `OPSuccinctL2OutputOracle.proposeL2Output` 调用 `ISP1Verifier(verifier).verifyProof(config.aggregationVkey, …)`。`verifier` 地址可由 owner 通过 `updateVerifier` 更换；proposer 需在 `approvedProposers[tx.origin]` 白名单内，或超过 fallbackTimeout 后任何人都可提交。

**依据**：
- SP1 安全模型 [26]：
  - “SP1 utilizes Gnark's implementation of Groth16 or PLONK over the BN254 curve to compress a STARK proof into a SNARK proof, which is then used for on-chain verification.”
  - Hypercube 用“Poseidon2 hash function over the Koalabear field”；“SP1 assumes that the discrete logarithm problem on the elliptic curve over the degree-7 extension of KoalaBear is computationally hard”，至少 100 bit 经典安全。
  - “individual STARK proofs in SP1 do not currently satisfy the zero-knowledge property”。
  - Groth16 采用电路专用可信设置；PLONK 用 Aztec Ignition。
  - 页面没有任何关于 quantum 的表述。
- VEIL [27]：给哈希型多线性证明系统加 ZK，开销约 3%；“This removes another dependency on elliptic curve cryptography”；“will replace the Groth16 wrapper with a hash-based one”。
- Google Quantum AI 在 2026-03-30/31 的论文中用 SP1 生成零知识证明，证明其量子电路存在而不公开电路 [28]。
- OP Succinct 架构 [29]：“Combine range proofs into a single aggregationproof that is cheaply verifiable on-chain”；只升级“a single on-chain contract and the op-proposer”。
- 合约源码 [30]（文件最近一次提交 e5b6687，2025-12-23）：`ISP1Verifier(verifier).verifyProof(config.aggregationVkey, abi.encode(publicValues), _proof)`；`function updateVerifier(address _verifier) external onlyOwner`；`approvedProposers[tx.origin] || approvedProposers[address(0)] || (block.timestamp - lastProposalTimestamp() > fallbackTimeout)`；有 `whenNotOptimistic` 修饰符，即存在 optimistic 模式开关。
- 对照 ZKsync Airbender [35]：STARK/FRI、Mersenne31、Blake2s+Blake3，但“Stage 6 - SNARK Wrapper: Wrap the final FRI proof into a final FFLONK proof which gets posted and verified onchain”，同样是椭圆曲线包装。Airbender Prime 于 2026-10-13 发布（博客列表）[36]。

**不确定之处**：
- VEIL 所说的“hash-based wrapper”是否意味着在 Ethereum 上直接验证哈希型证明（gas 与证明大小会显著上升），还是仍需某种 L1 侧 PQ 验证原语，原文没有说明。
- Mantle 实际部署的 verifier 是 Groth16 还是 PLONK、SP1 是哪个版本、owner 是谁，归 Mantle 架构那一路核对。
- Hypercube 内存论证所用的椭圆曲线是否有计划替换，未找到公开说明。

## O-Q9 其他项目（有一手来源的才记录）

- **Jolt / Akita（a16z）**：2026-09-09 发布 Lattice Jolt，作者 Georghiades、Thaler、Tretyakov、Zhu。用基于 Module-SIS 的 Akita 替换椭圆曲线承诺 Dory。原文：“targets a full 128 bits of security”；证明“under 100 KB”；“A companion paper, coming shortly, adds zero knowledge”[31]。状态：开源发布，零知识尚未完成，未提审计。
- **Sui**：2026-08-18 博客（Chalkias、Sedaghat）[32] 宣布原生账户用 ML-DSA-65，高价值金库用 SLH-DSA-SHA2-128s。
  - 计划：“Quantum-safe vaults are targeted for Mainnet this year, native ML-DSA-65 accounts for Testnet by end of year, and native account authentication on Mainnet in Q1 2027 as a worst case”。
  - 已部署：“Address aliases, already deployed”，可让账户换成 PQ 授权密钥而保留地址。
  - zkPQ-EdDSA（用种子做 ZK 迁移）被定位为“killswitch rather than a launch feature”。论文 eprint 2025/1368（FC 2026）[33]：Ligetron 原型证明 6.2s、证明 5.4MB，并论证 EdDSA 链相对 ECDSA 链有结构性优势。
- **QRL**：主网自 2018-06 起用 XMSS。QRL 2.0（Zond）为 EVM 兼容 PoS，Testnet V2 于 2026 Q1 上线，“We have not yet set a mainnet date”[34]。签名方案说法不一：官方站点提到 ML-DSA，2025-07 的博客称转向 SLH-DSA，未核实最终选择。
- **ZKsync**：Airbender 是 STARK 加 FFLONK 链上包装 [35]，官网称“resilient against quantum attacks”。由于最外层仍是椭圆曲线 SNARK，这一说法不精确（推论）。
- **Arbitrum / Offchain Labs**：未找到官方 PQ 路线。有 Offchain Labs 研究者的论文 eprint 2026/1660《Transient Quantum Resistance》，研究在 Q-day 后有界时间内继续使用 BLS [37]。社区论坛有第三方帖子。
- **Polygon、Scroll**：本次检索未找到公开 PQ 计划，检索有限。

---

## 图与白话素材

### A. 项目 × 组件 × 状态（截至 2026-10-16）

| 项目 | 账户签名 | 证明系统 | 共识 / 验证者签名 | DA / 结算依赖 | 隐私加密 |
|---|---|---|---|---|---|
| Starknet | Falcon-512 账户**主网演示**（2026-07-22，实验、未审计）；默认账户仍为 Stark-ECDSA（台账 A46/C27） | STARK（S-two），官方称结构性 PQ，无组件级证据记录（C3、C6） | 投票目前无签名；PQ 共识签名只是对新功能的要求（R16、R34） | blob KZG 与桥继承 Ethereum（R18） | STRK20 用 Stark 曲线 ECDH，存在 HNDL 暴露（S34–S38） |
| Aztec | 签名由账户合约自定义，今天即可用 PQ；6 类协议密钥在 Grumpkin 上、不可轮换 [1][2] | CHONK（椭圆曲线 / 配对）；2027-11 选 PQ 证明系统（**路线图**）[1] | 验证者 attestation 需 PQ 签名（**路线图**）[1] | BLS12-381 KZG、BN254 预编译依赖 Ethereum [1] | 哈希公钥与链下投递**已可用**；2027-07 选 PQ 公钥加密，2027-02 交付强化库（**路线图**）[1] |
| Optimism / Superchain | 2036-01 弃用 ECDSA EOA（**路线图**，待治理批准）；方案未定 [3] | 未提及 [3] | sequencer / batcher 签名迁 PQ（**路线图**）[3] | 主张 Ethereum 迁离 BLS/KZG [3] | — |
| Algorand | 原生 Falcon-1024 账户**已上线主网**（v5.0.0，2026-08）[8][9][13] | — | State Proofs 用 Falcon（**主网，2022**）；VRF 与参与密钥仍是 Ed25519/EC，PQ VRF 论文目标 2027 初（**研究**）[11] | 自身是 L1 | — |
| Bitcoin | BIP-360 P2MR（**Draft**，不含 PQ 签名）；BIP-361 迁移与旧签名退场（**Draft**）[14][15] | — | PoW（哈希） | — | — |
| Solana | Falcon 选定、有实现 PR（**研究 / 源码**）；Winternitz Vault（**应用层主网**，未审计）[18][19][20] | — | Alpenglow BLS 投票改 Falcon（**提议**）[19] | 自身是 L1 | — |
| Zcash | 透明地址未处理 [23] | Ironwood 可恢复 note **主网生效**（NU6.3，2026-07-28），Recovery Protocol 未上线 [23][24][25] | PoW | 自身是 L1 | 面对 PQ 对手时隐私性“unchanged”[23] |
| SP1 / OP Succinct | — | Hypercube（Poseidon2/KoalaBear，另有 EC 离散对数假设）加 BN254 Groth16/PLONK 包装（**主网**）；VEIL 换掉 Groth16（**路线图**）[26][27] | — | L1 verifier 可由 owner 更换，proposer 有白名单 [30] | — |
| Jolt | — | Akita 格型 PCS（**开源发布**，无 ZK）[31] | — | — | — |
| Sui | SLH-DSA 金库 2026 主网、ML-DSA-65 测试网年底、主网最晚 2027Q1（**计划**）；地址别名**已部署**[32] | — | 文中未涉及 | 自身是 L1 | — |
| QRL | XMSS（**主网，自 2018**）；Zond 测试网 [34] | — | — | 自身是 L1 | — |

### B. 时间线条目（用于“各项目 PQ 时间线”图）
- 2018-06：QRL 主网上线，使用 XMSS [34]
- 2022：Algorand State Proofs 采用 Falcon（主网）[11]
- 2025-01-03：Solana Winternitz Vault 发布（GitHub / 媒体）[20][21]
- 2025-11：Algorand 基于 LogicSig 的 Falcon 账户上主网 [11]
- 2026-01-14：Optimism 发布 Superchain PQ 路线，目标 2036-01 [3]
- 2026-02-11：BIP-361 获分配编号 [15]
- 2026-04-27：Solana Foundation / Anza 发布 Falcon 路线讨论 [18][19]
- 2026-05-01：Succinct 发布 VEIL [27]
- 2026-06-18：Algorand 宣布“2027 年底前广泛量子韧性”路线 [12]
- 2026-06-30：Starknet 三阶段路线图（台账 R13）
- 2026-07-08：Starknet v0.14.3 上主网，OS hash 改用 BLAKE2s（C23）
- 2026-07-22：Starknet Falcon 账户主网演示（C53）
- 2026-07-28：Zcash NU6.3 Ironwood 激活，可恢复 note 生效 [24][25]
- 2026-08-12 / 08-15：Algorand v5.0.0 发布 / 达到批准阈值，约 7 天后激活 [13][8]
- 2026-08-18：Sui 公布 ML-DSA-65 / SLH-DSA 选型 [32]
- 2026-09-09：a16z 发布 Lattice Jolt [31]
- 2026-10-08：Starknet 称“考虑成为 L1，2027 为目标”（R1）
- 2026-10-15：Aztec 发布 PQ 路线 [1]
- 2027-02 / 03 / 07 / 11：Aztec 的库交付与三个选型节点 [1]
- 2027 年底：Algorand 目标 [12]
- 2027Q1（最晚）：Sui 原生 PQ 账户上主网 [32]
- 2030（年底）：Aztec 完成全面迁移 [1]
- 2036-01：Superchain 弃用 ECDSA EOA [3]

### C. 参与者与流程素材
- **OP Succinct 的 L1 验证流程** [29][30]：range 证明 → 聚合证明 → OP Succinct proposer（须在 approvedProposers 白名单，按 tx.origin 判断，用 ECDSA 发交易）→ `OPSuccinctL2OutputOracle.proposeL2Output` → `ISP1Verifier.verifyProof(aggregationVkey, publicValues, proof)`（BN254 Groth16/PLONK）→ 更新 output root，供提款使用。owner 可以 `updateVerifier`，也可以增删 OpSuccinctConfig（vkey）。
  量子视角下有三处椭圆曲线依赖：BN254 包装、owner/upgrade 密钥、proposer 密钥（推论）。
- **Algorand rekey 迁移**：生成 PQ 账户 → 旧账户发 rekey 交易，把 authorized address 设为 PQ 地址 → 地址不变，“only the Falcon key can authorize”[9]。
  对比 EIP-7702：委托之后原 ECDSA 私钥仍能发交易、重新委托（starknet-account-model 台账 A53–A56）。
- **Aztec 的三层责任**：应用层（签名 / KEM / 加密，由开发者自选）、协议层（证明系统、地址与密钥、验证者签名）、Ethereum 层（DA、验证原语、EOA 与 BLS 密钥）[1]。

### D. 白话解释
- **长暴露 vs 短暴露攻击**：公钥在链上公开了很久（比如复用地址）叫长暴露，攻击者有充足时间慢慢算；只在交易进 mempool 到上链这几分钟暴露叫短暴露，需要非常快的量子机。P2MR 只防前者 [14]。
- **P2MR**：把“用一个公钥直接花钱”的路径删掉，只留“按事先承诺的脚本花钱”。今天还是用老签名，但给将来接入 PQ 签名留了插槽 [14]。
- **rekey（换锁不换门牌）**：地址不变，把有权签名的钥匙换成 PQ 钥匙，旧钥匙就此失效 [9]。
- **State Proof**：每 256 个区块，由多数质押者联合签一份“这段历史的摘要”，签名用的是 Falcon [11]。
- **量子可恢复（Zcash）**：现在先把 note 的格式做成“将来可以用抗量子的方式证明这是我的”，真出事时先关掉旧协议，再让用户把钱取出来 [23]。
- **keystore registry（Aztec）**：地址只是一个查表编号，真正的各种公钥放在登记表里，以后可以换成 PQ 公钥而不用换地址 [1]。
- **Groth16/PLONK 包装**：把又大又慢的 STARK 证明压成一个很小的椭圆曲线证明，方便以太坊便宜地验证。代价是最后这一层依赖椭圆曲线，量子机可以伪造 [26]。
- **HNDL（先存后解）**：今天把密文存下来，等将来有量子机再解密。隐私链的链上数据天然面临这个问题 [1]。
- **constrained delivery**：在电路里强制保证“接收方一定收得到、解得开”，防止发送方故意发一堆乱码 [1]。
- **WOTS / Winternitz**：基于哈希的一次性签名，每把钥匙只能签一次，签完就换新的 [20]。
- **zk 证明种子（EdDSA 链）**：Ed25519 私钥由种子经哈希派生而来，量子机能算出私钥标量，却算不出种子。用户可以零知识地证明“我知道种子”，把账户绑定到新的 PQ 公钥 [33][19]。

### E. 对 Mantle 可借鉴的素材（均为 inferred）
1. Optimism 的承诺只覆盖 EOA、sequencer 和 batcher。Mantle 的 proposer、L1 合约 owner / 升级多签、OP Succinct verifier 的更换权限都不在其中，需要 Mantle 自己列入清单。
2. SP1 的 PQ 化分两步：先替换 Groth16 包装（VEIL 路线），再处理 Hypercube 的椭圆曲线内存论证。即使 SP1 完成，L1 上还需要一个能便宜验证哈希型证明的路径。这一项需要与 Succinct 协同，没有日期。
3. Algorand 的 rekey 语义是旧钥匙**失效**。Optimism 走 EIP-7702 迁移，但 7702 不会让旧钥匙失效，所以 2036 年还需要“协议级弃用 ECDSA 交易”这一步兜底。Mantle 若提前做，必须设计同等的弃用步骤。
4. Starknet 的 Migration Register 和 Aztec 的分层需求清单，都是“公开披露每个组件的 PQ 状态”的现成模板。
5. 隐私或加密数据面临的 HNDL 风险，在应用层今天就能处理（参照 Aztec 2027-02 的强化库），不必等 L1。

---

## 外部调研 / 用户资料中被修正或无法核实的地方

1. **GPT §6.4 Optimism**：日期 2026-01-14、2036-01 均正确 [3]。但 GPT 说“承认需要处理排序、批提交及 L1 依赖”，原文只提 sequencer 与 batch submitter，**没有** proposer、故障证明或 L1 合约权限。brief 写的“sequencer / batcher / proposer 密钥”中，proposer 一项原文没有。另外，原文是 OP Labs 的单方承诺“subject to governance approval”，GPT 没有点明这一点。
2. **GPT §6.4 Algorand**：“2026 年 8 月随 v5.0.0 于主网上线”正确 [8][11][13]。但 GPT 为这句话引用的是 2025 年的 Falcon 交易技术简报（带 utm 参数），那篇文章不支持 v5.0.0 的说法，属引用错位。应改引 v5.0.0 博客与开发者文档。“2025 年 Falcon 交易演示”按官方技术页应为 2025-11 [11]。
3. **GPT §6.4 Jolt/Akita**：确切日期是 2026-09-09，作者 Georghiades / Thaler / Tretyakov / Zhu。“零知识仍有后续工作”正确，原文是“A companion paper, coming shortly, adds zero knowledge”[31]。
4. **GPT §6.2 Starknet**：Register 2026-08-19 的更新日期正确，到 10-16 仍未变 [4]。
5. **GPT §7.1 SP1**：“内部存在 STARK，不能消除外层椭圆曲线证明的量子依赖”正确，但不完整。SP1 Hypercube 内层也假设了 KoalaBear 七次扩域上椭圆曲线的离散对数困难 [26]，所以“内层是 PQ”这个隐含前提也不精确。GPT 引用的 SP1 安全模型页面本身完全没有提到 quantum。
6. **GPT §6.3 Aztec**：“2027 年分别选择签名、加密和证明系统”，精确说法是签名（2027-03）、**公钥加密**（2027-07，含 constrained delivery 基准）、证明系统（2027-11）[1]。另外，GPT 没提 Aztec 自己的判断“Q-day within four years is unlikely”和 Poseidon2 → BLAKE2s/3 的计划。
7. **brief 中“BIP-360（P2QRH / P2TSH？）”**：现名为 **P2MR**，0.11.0 版改名，Status Draft，并且不含 PQ 签名 [14]。“Jameson Lopp 的冻结提案”现为 **BIP-361**（Draft / Informational）[15]。
8. **Aztec 原文的链接错误**：MIKE 论文链接域名写成 eprint.iacr.**asia**，正确地址是 eprint.iacr.org/2026/2377 [38]。
9. **“暴露公钥的 BTC 数量”**：常见数字有 1.7M（只算 P2PK）、6.2M / 6.99M（Project Eleven 早期口径）、8.18M（Risq List 2026-09-14）[16][17]，口径各不相同，不能当成单一事实引用。
10. **ZKsync / 媒体称 Airbender “post-quantum”**：链上验证的是 FFLONK 包装 [35]，端到端并非 PQ。属推论，引用媒体说法时要加限定。
11. **用户草稿**：“唯一能做的就是等待 Ethereum”这个判断，与 Optimism（同为 OP Stack 系）已单方面公布时间表、Algorand / Sui 在 L1 选型前就交付账户层这些事实不符。账户、权限和证明包装都有可以自主或协同推进的部分。这一条是推论。

---

## 来源

1. **PRIMARY** Aztec, “Post-Quantum Aztec”, Zac Williamson & Mike Connor（编辑 David Steinrueck），Oct 15th, 2026。https://aztec.network/blog/post-quantum-aztec （访问 2026-10-16）。证明：两个目标、三个选型节点、三层需求、HNDL 防护、证明系统需求、keystore registry、Poseidon2 → BLAKE、Q-day 判断；日期和作者取自页面 HTML。
2. **PRIMARY** Aztec Docs, “Keys”。https://docs.aztec.network/developers/docs/foundational-topics/accounts/keys （访问 2026-10-16）。证明：6 类协议密钥不可轮换、在 Grumpkin 曲线上、地址派生公式。
3. **PRIMARY** Optimism, “A Post‑Quantum Roadmap for the Superchain”, Karl Floersch, January 14, 2026。https://optimism.io/blog/a-post-quantum-roadmap-for-the-superchain （访问 2026-10-16）。证明：2036-01 弃用 ECDSA EOA、sequencer / batcher 迁移、方案未定、通过硬分叉落地。
4. **PRIMARY** StarkWare Quantum Hub, Migration Register。https://quantum.starkware.co/migration-register （访问 2026-10-16）。证明：“Last updated: 19 August 2026”及五个迁移面的状态。
5. **PRIMARY** Starknet Blog 列表。https://www.starknet.io/blog/all （访问 2026-10-16）。证明：最新文章为 2026-08-07，10 月无新文章。
6. **PRIMARY** Starknet, “Starknet’s Upgrade to Quantum Resistance”, 2026-08-07。https://www.starknet.io/blog/quantum-resistance/ （访问 2026-10-16，通过搜索摘要读取）。证明：官方博客对 Falcon 演示的叙述。
7. starknet-account-model 台账（本仓库 reports/2026/10/starknet-account-model/research/ledger.md）。证明：O-Q1 引用的 A / C / R 各行。
8. **PRIMARY** Algorand, “Algorand v5.0.0 is here. Here’s what it means for you.” https://algorand.co/blog/algorand-v5.0.0-is-here.-heres-what-it-means-for-you （访问 2026-10-16）。证明：原生 PQ 账户、8-15 达到 90% 阈值、约 7 天冷却期。
9. **PRIMARY** Algorand Developer Portal, “Post-Quantum Accounts”。https://dev.algorand.co/concepts/accounts/post-quantum （访问 2026-10-16）。证明：v42 / algod v5.0.0、地址派生、尺寸、费用、rekey 迁移。
10. **PRIMARY** Algorand Specifications, “FALCON”。https://specs.algorand.co/crypto/crypto-falcon （访问 2026-10-16）。证明：Falcon-1024 公钥 1793 字节，压缩签名最大 1423 字节。
11. **PRIMARY** Algorand, “Post-Quantum Technology”。https://algorand.co/technology/post-quantum （访问 2026-10-16）。证明：State Proofs 2022、2025-11 的 LogicSig Falcon 账户、2026-08 主网、VRF 与参与密钥的剩余工作。
12. **PRIMARY** Algorand Foundation 新闻稿，2026-06-18。https://algorand.co/blog/algorand-foundation-announces-post-quantum-security-roadmap-targets-broad-quantum-resilience-by-2027 （访问 2026-10-16）。证明：“broad quantum resilience by the end of 2027”。
13. **PRIMARY** GitHub API, algorand/go-algorand releases。https://api.github.com/repos/algorand/go-algorand/releases （访问 2026-10-16）。证明：v5.0.0-stable 于 2026-08-12T14:30:21Z 发布。
14. **PRIMARY** BIP-360 “Pay-to-Merkle-Root (P2MR)”。https://github.com/bitcoin/bips/blob/master/bip-0360.mediawiki （master，访问 2026-10-16）。证明：名称、Draft 状态、不含 PQ 签名、只防长暴露攻击。
15. **PRIMARY** BIP-361 “Post Quantum Migration and Legacy Signature Sunset”。https://github.com/bitcoin/bips/blob/master/bip-0361.mediawiki （访问 2026-10-16）。证明：Phase A / B 的内容与时限、Draft 状态、P2PK 无法救援。
16. Project Eleven, Bitcoin Risq List。https://www.projecteleven.com/bitcoin-risq-list （访问 2026-10-16，第三方数据）。证明：其口径下 8,177,337 BTC（2026-09-14）。
17. Cointelegraph, 2026-04-15 关于 BIP-361 的报道（媒体）。https://cointelegraph.com/news/bitcoin-devs-and-researchers-propose-freezing-quantum-vulnerable-coins-bip-361 。证明：转述 Lopp 称该提案“not currently in a position to be adopted”。
18. **PRIMARY** Solana Foundation, “Solana’s Proactive Preparation for Quantum”。https://solana.com/news/quantum-readiness （访问 2026-10-16）。证明：Falcon 选择、三步路线、Winternitz Vault。
19. **PRIMARY** Anza, “Securing Solana against a powerful quantum adversary”, Max Resnick & Sam Kim, 2026-04-27。https://www.anza.xyz/blog/securing-solana-against-a-powerful-quantum-adversary （访问 2026-10-16）。证明：账户与 Alpenglow 的提议、原型数据、“not a commitment”。
20. **PRIMARY** deanmlittle/solana-winternitz-vault README。https://github.com/deanmlittle/solana-winternitz-vault （访问 2026-10-16）。证明：WOTS 金库机制、截断 Keccak、未审计。
21. Cointelegraph, 2025-01-04, “Solana is now quantum-resistant, Solana dev claims”（媒体）。证明：发布时间为 2025-01-03。
22. CoinDesk, 2026-04-27（媒体）。https://www.coindesk.com/tech/2026/04/27/solana-developers-outline-plan-to-protect-network-from-quantum-threats 。证明：Solana Foundation 博客的发布日期。
23. **PRIMARY** ZIP 2005 “Ironwood Quantum Recoverability”。https://zips.z.cash/zip-2005 （访问 2026-10-16）。证明：可恢复 note 的设计、不保证 PQ 安全、旧池资金无法恢复。
24. **PRIMARY** ZIP 258 “Deployment of the NU6.3 Network Upgrade”。https://zips.z.cash/zip-0258 （访问 2026-10-16）。证明：主网高度 3428143，ZIP 2005 包含在内。
25. SEC EDGAR S-1（tm2626975-1_s1）。https://www.sec.gov/Archives/edgar/data/2158471/000110465926113940/tm2626975-1_s1.htm （监管文件，访问 2026-10-16）。证明：NU6.3 于 2026-07-28 激活。
26. **PRIMARY** Succinct Docs, “Security Model”。https://docs.succinct.xyz/docs/sp1/security/security-model （访问 2026-10-16）。证明：BN254 Groth16/PLONK 包装、Poseidon2/KoalaBear、扩域椭圆曲线离散对数假设、STARK 层无 ZK。
27. **PRIMARY** Succinct, “VEIL: Adding Zero-Knowledge to Hash-based Proof Systems”, 2026-05-01。https://blog.succinct.xyz/veil/ （访问 2026-10-16）。证明：计划用哈希型包装替换 Groth16。
28. **PRIMARY** Succinct, “Google Uses SP1 to Prove Quantum Security Threat”, 2026-03-31。https://blog.succinct.xyz/google-sp1-quantum-threat （访问 2026-10-16）。证明：Google 用 SP1 做负责任披露。
29. **PRIMARY** OP Succinct Book, Architecture。https://succinctlabs.github.io/op-succinct/architecture.html （访问 2026-10-16）。证明：range → aggregation → 链上验证的流程。
30. **PRIMARY** OPSuccinctL2OutputOracle.sol（succinctlabs/op-succinct，文件最近一次提交 e5b6687a3fe6db26a830448af36b3982910f51c2，2025-12-23）。https://github.com/succinctlabs/op-succinct/blob/e5b6687a3fe6db26a830448af36b3982910f51c2/contracts/src/validity/OPSuccinctL2OutputOracle.sol 。证明：verifyProof 调用、updateVerifier、approvedProposers、whenNotOptimistic。
31. **PRIMARY** a16z crypto, “Entering the era of lattice SNARKs – with a faster, post-quantum Jolt”, 2026-09-09。https://a16zcrypto.com/posts/article/lattice-snarks-jolt-post-quantum-faster （访问 2026-10-16）。证明：Akita、128-bit 目标、证明 <100KB、ZK 未完成。
32. **PRIMARY** Sui, “From the cryptographer’s desk: how we chose Sui’s post-quantum signature schemes”, 2026-08-18。https://www.sui.io/blog/suis-post-quantum-signature-schemes （访问 2026-10-16）。证明：ML-DSA-65 / SLH-DSA 选型与时间表、地址别名已部署。
33. **PRIMARY** Baldimtsi, Chalkias, Roy, Sedaghat, “Post-Quantum Readiness in EdDSA Chains”, eprint 2025/1368（最后修订 2026-03-20）。https://eprint.iacr.org/2025/1368 。证明：用 EdDSA 种子做 ZK 迁移；原型 6.2s / 5.4MB。
34. **PRIMARY** QRL, “QRL 2.0 (Project Zond)”。https://www.theqrl.org/zond/ （访问 2026-10-16）。证明：XMSS 自 2018；Testnet V2 2026Q1；主网日期未定。
35. **PRIMARY** ZKsync Docs, “Airbender Overview”。https://docs.zksync.io/zk-stack/components/zksync-airbender （访问 2026-10-16）。证明：STARK/FRI 加 FFLONK 链上包装。
36. **PRIMARY** ZKsync Blog 列表。https://www.zksync.io/blog （访问 2026-10-16）。证明：“Introducing Airbender Prime, Oct 13, 2026”。
37. **PRIMARY** Anchuri, Campanelli, Gennaro（Offchain Labs），eprint 2026/1660。https://eprint.iacr.org/2026/1660 。证明：Offchain Labs 研究者关于 BLS“瞬时量子安全”的研究。
38. **PRIMARY** Basso et al., “MIKE: a fast and compact post-quantum NIKE”, eprint 2026/2377。https://eprint.iacr.org/2026/2377 。证明：论文存在于 .org 域名；公钥 80B、4.9ms、NIST L1。
39. **PRIMARY** Solana Changelog, August 6, 2026。https://solana.com/news/solana-changelog-august-6-2026 （访问 2026-10-16，只读到摘要）。证明：Firedancer 发布 Falcon 验证实现、Anza 分享 Alpenglow 的 PQ 改进。
40. GPT Deep Research（本仓库 research/from-aztec-pq-to-mantle-pq.md）。只作线索，被修正之处见上一节。

---

## 开放问题
1. Mantle 是否属于 Optimism 原文中的“participating OP Stack chains”，是否会跟随 2036 时间表与共同硬分叉？需要内部确认。
2. Mantle 当前 OP Succinct 部署实际使用哪个 SP1 版本和 verifier 路由（Groth16 / PLONK）？owner / proposer / challenger 分别是什么密钥形态（EOA 还是多签）？归 Mantle 架构那一路核对。
3. VEIL 集成进 SP1 后，Ethereum 上的验证路径是什么？是直接验证哈希型证明，还是等待 EVM 提供 PQ 验证原语？要到什么时候？Succinct 尚无公开时间表。
4. SP1 Hypercube 内存论证中的扩域椭圆曲线有没有替换计划？
5. Algorand v5.0.0 主网激活的确切轮次和日期。
6. Solana 2026-08 那条“Alpenglow PQ 改进”的具体内容。
7. Zcash 的 Tachyon 与 PQ 是什么关系（本路未查）。
8. Polygon、Scroll、Arbitrum 是否有未被检索到的官方 PQ 文档。
9. Aztec“2030 full migration”在 Ethereum 未按 2029 完成 DA / 验证原语迁移时如何处理，原文只说“has to account for Ethereum’s upgrades”。

---

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| O1 | 截至 2026-10-16，Starknet Migration Register 仍标“Last updated: 19 August 2026” | [4] 页面页脚“Last updated: 19 August 2026.” | observed | |
| O2 | starknet.io 博客最新一篇为 2026-08-07《Starknet’s Upgrade to Quantum Resistance》，10 月没有新文章 | [5] 列表首条“Aug 7, 2026” | observed | |
| O3 | Starknet 官方不认为整条链抗量子；已上主网的 PQ 相关项只有 v0.14.3 的 OS hash（BLAKE2s），外加 Falcon 账户主网演示 | 见 starknet-account-model 台账 C1、C22、R19、R28 | observed | |
| O4 | Aztec PQ 博客发布于 2026-10-15，作者 Zac Williamson、Mike Connor | [1] 页面 HTML“Oct 15th, 2026”“Written by Zac Williamson, Mike Connor” | observed | |
| O5 | Aztec 两个目标：2027-02 交付强化库与防 HNDL 的开发模式，2030 完成全面 PQ 迁移 | [1] “February 2027: Hardened libraries…”；“2030: a full post-quantum migration.” | observed | |
| O6 | Aztec 选型节点：2027-03 签名、2027-07 公钥加密（含 constrained delivery 基准）、2027-11 证明系统 | [1] “Our proposed selection milestones are: March 2027…July 2027…November 2027…” | observed | |
| O7 | Aztec 列出的 Ethereum 层需求：不用 BLS12-381 KZG 的 DA、替代 BN254 预编译的廉价 PQ SNARK 验证原语、EOA 与 BLS 密钥 | [1] “Ethereum changes required” 一节 | observed | |
| O8 | Aztec 称快速 PQ 证明系统的证明约 300KB，而它当前证明约 20kb | [1] “Aztec’s 20kb proofs are ‘ok’…Post-quantum proof systems (the fast ones)…~300KB” | observed | |
| O9 | Aztec 作者估计 2-to-1 证明聚合需在现代 CPU 上约 20–100ms 才可行 | [1] “two-to-one aggregation in roughly 20–100 milliseconds on a modern CPU could make it practical” | observed | |
| O10 | Aztec 计划把地址里的密钥外置到 canonical keystore registry，地址变为单纯的哈希 | [1] “Baking Bad” 一节 | observed | |
| O11 | Aztec 计划长期用 Blake2s 或 Blake3 替换 Poseidon2，并大概率跟随 EF 的选择 | [1] “We will likely replace it with either Blake2s or Blake3…follow their lead” | observed | |
| O12 | Aztec 作者认为 4 年内出现 Q-day 不太可能 | [1] “I think Q-day within four years is unlikely” | observed | |
| O13 | Aztec 已支持链下 note 投递与 constrained delivery，大多数协议公钥被哈希且不对合约暴露 | [1] “Aztec Public Keys are hashed”“offchain note delivery”“Constrained Delivery” 各节 | observed | |
| O14 | Aztec 的 6 类协议密钥都在 Grumpkin 曲线上且不可轮换；签名密钥由账户合约定义、可轮换 | [2] Key Types 表“Rotatable: No”；“All keys use elliptic curve cryptography on the Grumpkin curve” | observed | |
| O15 | Aztec 地址 = (pre_address·G + Ivpk_m).x，只有 Ivpk_m 仍以椭圆曲线点参与地址派生 | [2] Address Derivation 一节 | observed | |
| O16 | Aztec 博客中 MIKE 论文的链接域名为 eprint.iacr.asia，论文实际位于 eprint.iacr.org/2026/2377 | [1] 正文 MIKE 链接；[38] | observed | |
| O17 | Optimism Superchain PQ 路线由 Karl Floersch 于 2026-01-14 发布 | [3] 页面 HTML 作者与“January 14, 2026” | observed | |
| O18 | OP Labs 承诺到 2036-01 弃用 ECDSA 签名的 EOA 交易，但需经治理批准 | [3] “10‑year timeline…subject to governance approval. By January 2036…” | observed | |
| O19 | Optimism 路线中 L2 sequencer 与 batch submitter 将改用 PQ 签名 | [3] “The L2 sequencer and batch submitter will transition off ECDSA signatures to post‑quantum signatures.” | observed | |
| O20 | Optimism 尚未选定具体 PQ 签名方案 | [3] “The specific post‑quantum signature scheme is not yet decided.” | observed | |
| O21 | Optimism 路线原文没有提到 proposer / challenger、故障证明或 L1 合约升级权限的 PQ 计划 | [3] 全文只列 EOA、sequencer、batch submitter、Ethereum BLS/KZG | observed | |
| O22 | Mantle 若跟随 Superchain 路线，其 proposer、L1 合约 owner 与 verifier 更换权限的 PQ 化需自行补充 | 由 O21、O33 推出：OP 路线不覆盖这些角色，OP Succinct 合约又引入 owner 与 proposer | inferred | |
| O23 | Algorand 原生 Falcon-1024 账户随 algod v5.0.0（共识 v42）上线主网，时间为 2026-08 | [9] “part of the v42 consensus upgrade, shipped in algod v5.0.0”；[11] “live on Mainnet as of August 2026” | observed | |
| O24 | Algorand v5.0.0 于 2026-08-12 发布，2026-08-15 达到 90% 支持阈值，之后需约 7 天冷却 | [13] published_at 2026-08-12T14:30:21Z；[8] “90% support threshold on August 15…208,000 round (~7 day)” | observed | |
| O25 | Algorand 原生 PQ 账户的主网激活日约为 2026-08-22 | 由 O24 推出：8-15 加约 7 天冷却期 | inferred | |
| O26 | Algorand rekey 到 PQ 地址后地址不变，且只有 Falcon 密钥能授权 | [9] “Your public address stays the same; from that point on, only the Falcon key can authorize” | observed | |
| O27 | Algorand 自 2022 年起用 Falcon 签名 State Proofs（每 256 轮一次） | [11] State Proofs 段落 | observed | |
| O28 | Algorand 的 VRF 与参与密钥仍基于椭圆曲线 / Ed25519，PQ VRF 论文目标 2027 年初 | [11] VRF 段落与“Participation relies on…Ed25519” | observed | |
| O29 | Algorand 于 2026-06-18 宣布到 2027 年底实现“broad quantum resilience” | [12] 新闻稿首段 | observed | |
| O30 | BIP-360 现名 P2MR，状态 Draft，不引入 PQ 签名，只防长暴露攻击 | [14] 头部、Changelog 0.11.0、Abstract“does not include the introduction of post-quantum signature schemes” | observed | |
| O31 | BIP-361 为 Draft / Informational：激活后约 3 年禁止向旧脚本付款，再过 2 年限制 ECDSA/Schnorr 花费、改走救援协议 | [15] Specification 表 Phase A、B | observed | |
| O32 | 暴露公钥的 BTC 规模各方口径差异大（1.7M–8.18M），不能当作单一事实 | [16] Risq List 8,177,337 BTC；[17] 约 1.7M（P2PK）；Project Eleven 早期 6.2M | observed | |
| O33 | OP Succinct 的 L1 合约通过 ISP1Verifier.verifyProof 验证聚合证明，verifier 地址可由 owner 更换 | [30] proposeL2Output 中的 verifyProof 调用；`updateVerifier … onlyOwner` @e5b6687 | observed | |
| O34 | OP Succinct 的 proposer 按 tx.origin 白名单判断，超时后允许任何人提交 | [30] `approvedProposers[tx.origin] \|\| approvedProposers[address(0)] \|\| (block.timestamp - lastProposalTimestamp() > fallbackTimeout)` | observed | |
| O35 | SP1 用 Gnark 的 BN254 Groth16/PLONK 包装 STARK 证明，供链上验证 | [26] “Groth16, PLONK, and the Zero-Knowledgeness of SP1” 一节 | observed | |
| O36 | SP1 Hypercube 假设 KoalaBear 七次扩域上椭圆曲线的离散对数困难 | [26] “SP1 assumes that the discrete logarithm problem on the elliptic curve over the degree-7 extension of KoalaBear is computationally hard” | observed | |
| O37 | SP1 当前的端到端链上验证路径不具备 PQ 安全 | 由 O35、O36 推出：外层 BN254 配对与内层椭圆曲线离散对数都会被 Shor 攻破 | inferred | |
| O38 | Succinct 计划把 VEIL 集成进 SP1，以哈希型包装替换 Groth16 包装，但没有给出日期 | [27] “Once integrated into SP1, VEIL will replace the Groth16 wrapper with a hash-based one.” | observed | |
| O39 | ZKsync Airbender 在链上验证的是 FFLONK 包装后的证明，端到端同样依赖椭圆曲线 | [35] “Stage 6 - SNARK Wrapper…FFLONK proof which gets posted and verified onchain” | observed | |
| O40 | Lattice Jolt 于 2026-09-09 发布：Akita 基于 Module-SIS，证明 <100KB，零知识尚未完成 | [31] datePublished 2026-09-09；正文“under 100 KB”“A companion paper, coming shortly, adds zero knowledge” | observed | |
| O41 | Solana Foundation 称 Anza 与 Firedancer 都选中 Falcon；三步路线没有时间表，属研究阶段 | [18] Falcon 段落与“Recap of the current quantum roadmap” | observed | |
| O42 | Anza 提议把 Alpenglow 的 BLS 投票签名换成 Falcon 等 PQ 方案，并声明不构成承诺 | [19] Consensus 段落；免责声明“None of this constitutes a commitment” | observed | |
| O43 | Solana Winternitz Vault 是应用层的一次性哈希签名金库，作者自述未审计 | [20] README 机制说明与免责声明 | observed | |
| O44 | Zcash NU6.3 于主网高度 3,428,143 激活，ZIP 2005 的可恢复 note 自此对 Ironwood 池强制生效 | [24] ACTIVATION_HEIGHT 3428143；[23] “enforced from NU6.3” | observed | |
| O45 | NU6.3 的激活日期为 2026-07-28 | [25] S-1 原文“On July 28, 2026, Zcash developers activated…(NU6.3)” | observed | |
| O46 | ZIP 2005 本身不让 Zcash 抗量子，Recovery Protocol 尚未进入共识，Sapling/Orchard 资金在旧池关闭后无法恢复 | [23] Abstract 与“It is not required to add support for the Recovery Protocol…” | observed | |
| O47 | Sui 计划 2026 年 SLH-DSA 金库上主网、ML-DSA-65 年底上测试网、原生 PQ 账户最晚 2027Q1 上主网；地址别名已部署 | [32] “Status and timeline” 段原文 | observed | |
| O48 | EdDSA 链可以通过零知识证明种子知识迁移到 PQ 密钥且不换地址，ECDSA 链不具备这一结构 | [33] Abstract 与 Figure 1 说明 | observed | |
| O49 | EVM 链（ECDSA）无法直接套用 Sui/Solana 的种子证明迁移，旧账户救援需要依赖 BIP-32 hardened 派生之类的其他凭据 | 由 O48、O31 推出：ECDSA 私钥不是由种子哈希派生；BIP-361 救援示例为 BIP-32 hardened 派生证明 | inferred | |
| O50 | QRL 主网自 2018 年起使用 XMSS；QRL 2.0 尚无主网日期 | [34] “We have not yet set a mainnet date.” | observed | |
| O51 | 未找到 Arbitrum / Offchain Labs 的官方 PQ 路线，只有其研究者的 BLS 瞬时量子安全论文 | [37] eprint 2026/1660；Offchain/Arbitrum 官方渠道的检索结果中未见路线文档 | speculative | |
| O52 | 未找到 Polygon 与 Scroll 的公开 PQ 计划 | 本路对 polygon.technology 博客与 docs.scroll.io 的检索结果中未见（检索有限） | speculative | |
| O53 | Algorand 的 rekey 让旧 Ed25519 钥匙失去授权权，EIP-7702 委托后旧 ECDSA 钥匙仍有权限，因此 OP 路线需要靠协议级弃用 ECDSA 交易兜底 | 由 O26、O18 及 starknet-account-model 台账 A55–A56 推出 | inferred | |
| O54 | 截至 2026-10-16，没有任何调研项目实现全栈 PQ；已上主网的只有账户层、历史证明或可恢复格式等局部组件 | 由 O3、O23、O27、O28、O30、O37、O41、O44、O46 推出 | inferred | |
| O55 | 各项目都把共识签名聚合、DA 承诺与 L1 结算排在最后或交给 Ethereum | 由 O7、O19–O21、O28、O42 及台账 R18 推出 | inferred | |
| O56 | GPT 为“Algorand v5.0.0 上线”引用的 Falcon 技术简报不支持该说法，属引用错位 | [40] §6.4 引用链接；对照 [8][11] | observed | |
| O57 | Mantle 可以在不等 Ethereum 的情况下，在应用层先提供防 HNDL 的库与模式（参照 Aztec 2027-02 目标） | 由 O5、O13 推出：这部分属于应用层，Aztec 也不依赖 Ethereum 完成；能否适用于 Mantle 的业务需评估 | speculative | |

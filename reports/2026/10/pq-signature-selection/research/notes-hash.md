# notes-hash：哈希签名路线：原理、XMSS + leanVM，以及 Ethereum / Starknet 的理由（lane = hash，前缀 H）

> 调研日期 2026-10-20（Asia/Shanghai），所有网页的访问日期都是这一天，另有注明的除外。本次只读了网页、规范、论文和源码 README / commit message，没有运行代码，也没有复现任何基准。外部调研（GPT）只当线索用。

**一句话总结**：Ethereum 共识层的 PQ 方案是“每个验证者每个 slot 用有状态哈希签名 leanXMSS 签一次 → 自愿参与的聚合者用 leanVM 把一批签名证明成一个 proof → 递归合并 → 提议者折叠成区块级证明”（EIP-8292，Draft）。这条路线在 10-16 之后仍在快速变化，有三点要注意：
1. 10-17，leanVM 主干把 leanXMSS 换成两层 XMSS。新方案的密钥寿命是 2^32 个 leaf index，签名 2,404 B，验证要 201 次 BLAKE2s 压缩；README 的基准从 1,651 降到 1,362 签名/秒。
2. 共识规范 leanSpec 仍按 KoalaBear 域元素编码 XMSS 密钥，而 leanVM 已经改到二进制域 + BLAKE2s（BLAKE2s 只是占位）。哈希函数和参数集都没定。
3. a16z 提出“递归之后的安全性连 ROM 下都无法建立”。截至 10-20，我没找到 EF / leanVM 团队的直接回应。

Ethereum 和 Starknet 的理由不完全相同：
- **Ethereum**：Vitalik 的公开理由有两条，一是“协议依赖最小化、少维护基础设施”，二是“AI 加速数学可能削弱有结构的假设”。但 EF 自己的页面仍把 Falcon / Dilithium 列为执行层候选。
- **Starknet**：证明层是哈希型 STARK，账户层允许 Falcon。StarkWare 的路线图甚至提到用 Falcon-512 做链上共识签名。所以 Eli 反对的是“现在就把大额资金押在年轻的 Module-SIS 简洁论证上”，不是反对格签名本身。最后这一点是推论。

---

## H-Q1 哈希签名原理、尺寸与有状态风险

### 答案
哈希签名只依赖哈希函数的单向性、抗（第二）原像和抗碰撞，不依赖任何代数结构。量子计算机只能用 Grover 做平方根级的加速，所以 128 位摘要大致对应 64 位量子安全，也就是 NIST 类别 1 [8][34][35]。三代结构的思路：
- **Lamport / WOTS**：公开一个秘密的哈希链位置，只能签一次。
- **XMSS**：用 Merkle 树把大量一次性公钥压成一个根，签名附带认证路径。代价是有状态，同一个 index 绝不能签两条不同的消息。
- **SLH-DSA / SPHINCS+**：用 hypertree 加 few-time 签名（FORS），由消息哈希随机挑选叶子，因此无状态。代价是签名大、签名慢。

Ethereum 当前两个自研参数集的数据：
- **leanXMSS**（共识用）：公钥 32 B，签名 2,404 B，寿命 2^32 个 index，验证 201 次 BLAKE2s 压缩 [8]。
- **leanSPHINCS**（交易用）：公钥 32 B，签名 4,276 B，验证 307 次压缩，满树寿命约 13 亿次签名 [9]。

### 依据
- **安全假设与 Grover**：SP 800-208 写明，有状态 HBS 的安全性“depends only on the security of the underlying hash functions—in particular, the infeasibility of finding a preimage or a second preimage”，并且大规模量子计算机不会破坏哈希 [34]。leanXMSS 规范对量子安全的说法是：“We expect about 64 quantum bits, NIST category 1”，并明确“Only the classical bound is proved”[8]。
- **WOTS / WOTS+C 直觉**：leanXMSS 的一次性密钥有 58 条长度为 4 的哈希链，签名揭示每条链上由摘要数字指定的位置。签名者要不断换随机数（grinding），直到摘要各位数字之和恰好等于 106，这就取代了 Winternitz 校验和。原文：“Distinct codewords are incomparable … so the chain values revealed for one codeword never sign another”[8]。
- **XMSS 树与认证路径**：leanXMSS 是两层高 16 的 XMSS。上层树的每个叶子签下层一棵树的根。签名由 idx、两层各自的一次性签名和两条认证路径组成，长度 4 + 1200 + 1200 = 2404 B。验证者沿路径算回公钥根 [8]。
- **有状态的硬约束**：
  - leanXMSS 原文：“A leaf index must never sign two different messages: their two codewords would reveal every chain at the smaller of their two positions”；“The theorem covers a signer that uses each leaf index at most once, which the signer’s state must enforce”[8]。
  - 签名是确定性的，同一 index 重签同一条消息会得到同一个签名 [8]。
- **SP 800-208 的要求**：
  - 密钥和签名生成必须在“hardware cryptographic modules that do not allow secret keying material to be exported, even in encrypted form”中进行。
  - 有状态 HBS “not suitable for general use because they require careful state management”，主要面向固件签名这类长寿命场景。
  - 一旦同一个 OTS 密钥签了两条消息，“it would become computationally feasible for that attacker to forge signatures on arbitrary messages”[34]。
- **SLH-DSA（FIPS 205 Table 2）尺寸**：
  - 128s：公钥 32 B / 签名 7,856 B；128f：17,088 B。
  - 192s：48 B / 16,224 B；192f：35,664 B。
  - 256s：64 B / 29,792 B；256f：49,856 B [35]。
- **XMSS（RFC 8391）典型尺寸**：XMSS-SHA2_10_256 签名 2,500 B、公钥 68 B；h=20 时签名 2,820 B [36]。
- **leanSPHINCS**：
  - 公钥 32 B，签名 4,276 B，验证 307 次 BLAKE2s 压缩，经典 ROM 安全 127 位，QROM 约 64 位只是目标，“No quantum security bound is proved here”[9]。
  - 寿命与密钥生成成本挂钩：满树 b=26 时 13 亿次签名、160 亿次压缩；b=12 时 12 万次签名、99 万次压缩 [9]。
  - 签名“deterministic and changes no secret state”，也就是无状态 [9]。
- **SPHINCS- 的数据**（ethresear.ch，nconsigny）[27]：
  - C13：3,704 B，链上验证 127K gas，签名约 430 万次哈希调用。
  - C12：6,512 B，276K gas，3.66 万次哈希调用。
  - SLH-DSA-SHA2-128-24：3,856 B，142K gas，约 10.7 亿次哈希调用；它的 Keccak 版本是 94K gas。
  - 在 Ledger Nano S+ 的 ST33K1M5 安全芯片上，C11 签名要 390 s，C12 要 47.5 s [27]。
- **leanSig（devnet 用的 Rust 实现）**：README 写道“each pair of secret key and epoch must not be used twice”，私钥要按 epoch 顺序调用 `advance_preparation()` 预先准备 [10]。

### 不确定之处
- FIPS 205 的完整尺寸表引自标准 Table 2 的公认数值。第一篇报告核对过 128s / 128f / 256s 三行，192 和 256f 两行本次没有重新打开 PDF。
- leanSig 仓库里 devnet 实际使用哪个 lifetime 参数（2^18 / 2^20 / 2^32），README 没写死，本次没有读 `src/`。
- leanSPHINCS 寿命表中，各行对应“128 位安全”的具体口径（每行 q/2^127）来自规范第 6 节；本次没有检查 Lean 证明。

---

## H-Q2 Ethereum 共识的 XMSS + leanVM 怎么运作

### 答案（onboard 版）
1. **签名者（每个验证者）**：每个 slot 用自己的 leanXMSS 密钥签一次投票，leaf index 取当前 slot（推论，见下）。随后把签过名的 attestation 发到所属的 gossip 子网 [4][8]。
2. **叶子聚合者（自愿报名的高配节点）**：对同一条投票消息，收集子网里的签名，在 leanVM 里运行“逐个验证 leanXMSS”的 guest 程序，产出一个 proof。证明大小基本不随签名数增长，EIP 给出的典型值是 185–230 KiB [4][6]。
3. **递归聚合者**（同一角色）：把同一条消息的多个部分聚合再证明一次，得到“聚合的聚合”（2-to-1 递归）[4][6]。
4. **提议者**：把多条不同消息的聚合折叠进一个区块级证明，每个区块最多 8 条不同的 attestation 消息（MAX_ATTESTATIONS_DATA）[4]。
5. **普通节点**：只验证这个证明，单线程几毫秒（README 给出 3–6 ms 级）[5][6]。

当前成熟度：
- EIP-8292 是 Draft。
- leanVM 自述“not (yet) production ready”，哈希 BLAKE2s 只是占位，零知识支持在计划中，计划把 ISA 迁到 RISC-V rv64im [6]。
- 签名方案和 leanVM 的参数都“not the definitive parameter set”[6]。

### 依据

**(a) leanSig / leanXMSS 与“slot 当 index”**
- leanSig README：这是“*prototypical* … *not been audited and is not meant to be used in production*”的实现，采用“(synchronized) signatures”，接口里是 `sign(sk, epoch, message)` [10]。
- @c08a3bae（2026-04-29，commit “Devnet 4”）使用“Hardcoded instantiations … (using Poseidon1)”[10]，第一篇报告记录的域是 KoalaBear。
- leanXMSS 规范在门限签名一节给出的成本口径是“7.3 GB per year of 12-second slots”，用 slot 数换算 index 的用量 [8]。
- a16z 也写：“each validator signs at most one message per slot, so the slot number itself can serve as the signing state”[1]。
- 推论（见台账 H12）：2^32 个 index 按 12 s 一个 slot 约可用 1,600 年，按 4 s 约 540 年；一棵下层树有 2^16 个 index，12 s slot 下约 9.1 天用完。

**(b) leanVM 当前形态（核实外部调研）**

| 项 | @127510d1（2026-10-15，a16z 与第一篇报告引用的版本） | @3a37fb6e（2026-10-18，HEAD） | 来源 |
|---|---|---|---|
| 定位 | “minimal hash-based zkVM, for post-quantum Ethereum” | 同左 | [5][6] |
| 域 / PCS | 192-bit 二进制域（64-bit 域上的 3 次塔）、WHIR（Ligerito）、Flock 哈希证明、Binius 系 ring switching | 同左 | [5][6] |
| 哈希 | “BLAKE2s is a placeholder. SHA2, SHA3, BLAKE3 are actively considered.” | 同左 | [5][6] |
| ISA | leanISA，计划迁移到 RISC-V rv64im | 同左 | [5][6] |
| 历史 | “Prior to binary fields leanVM used KoalaBear and Poseidon”（koalabear 分支） | 同左 | [5][6] |
| 安全 | “128-bit ROM (64-bit QROM) soundness”；“not (yet) production ready” | 同左 | [5][6] |
| XMSS 基准（M4 Max，12P+4E，48GB，不用 GPU） | 900 签名，0.545 s，317.4 KiB，峰值 7.4 GiB，验证 3.977 ms，**1,651.7 签名/秒** | 1,290 个 leanXMSS 签名，0.947 s，318.4 KiB，峰值 15.5 GiB，验证 5.387 ms，**1,362.5 签名/秒** | [5][6] |
| SPHINCS 基准 | 850 签名，1.04 s，331.9 KiB，817.7 签名/秒 | 850 签名，1.0 s，325.8 KiB，850.1 签名/秒 | [5][6] |
| 2-to-1 递归 | 0.272 s，190.2 KiB（叶子各 900 签名，log-inv-rate 2） | 0.291 s，201.5 KiB | [5][6] |
| 签名方案 | 单层 XMSS，验证 144 次压缩 | 两层 leanXMSS，验证 201 次压缩，签名 2,404 B | [5][6][7] |

- 10-17 的 PR #640 “Double XMSS” 有两处主要改动 [7]：
  - 把单层 XMSS 换成“two layers of XMSS of height 16 over WOTS+C … a key signs at 2^32 leaf indices while generating 2^16 one-time keys up front”，公钥 32 B，签名 2,404 B，验证 201 次压缩。
  - 新增 Lean 4 机器检查证明“127-bit SUF-CMA … in the random-oracle model”。
- 同一个 commit 还给 leanXMSS 和 leanSPHINCS 的种子加了域分离。原因是之前两者从同一个种子派生时，一次性密钥会重合 [7]。
- 仓库改名：`leanEthereum/leanMultisig` 的 GitHub API 返回的就是 `leanEthereum/leanVM`（同一 repo id 1020551292），说明 leanMultisig 已改名为 leanVM [12]。leanSig README 里指向 leanVM 的链接仍写作 leanMultisig [10]。
- 规范与实现分叉：leanSpec 在 2026-09-02 的 commit 0b7d33ec 中写道“The KoalaBear field element … every XMSS key, signature and registry root would move”，说明共识规范的 XMSS 仍按 KoalaBear 元素编码 [11]，而 leanVM 主干已是 BLAKE2s / 二进制域 [6]。

**(c) EIP-8292（Draft，2026-06-07，作者 10 人，含 Coratger、Drake、Wambsgans）[4]**
- 角色：
  - 验证者按 `SUBNET_COMMITTEES`（TBD）分子网签名并 gossip。
  - 任何节点可以设 `is_aggregator` 自愿成为聚合者，“MUST NOT be gated on a protocol-defined stake threshold”。
  - 质押达到 `SUBNET_COMMITTEES × 32 ETH` 的节点 SHOULD 当 super-aggregator，覆盖全部子网。
- 层级：叶子聚合与递归聚合属于聚合者；区块级折叠“is explicitly a proposer duty”。
- 为什么是自愿的高配角色：证明“heavier than a typical home-staking machine should be expected to do on the slot’s critical path”，分离出去之后，普通验证者只需要便宜地验证。
- 目标（非规范性）：
  - proof 硬上限 512 KiB，典型 185–230 KiB。
  - 125 / 250 / 500 / 1000 个签名对应约 185 / 194 / 206 / 227 KiB。
  - 约 256 KiB 的 proof 要在 1 秒内传播完。
- 1,000 个签名的证明时间：2 核 / 15 GiB 约 11.0 s；8 核 / 59 GiB 约 3.7 s；16 核 / 118 GiB 约 2.6 s。内存需求 1.5–6.6 GiB。
- 签名尺寸写的是“about 1.17 KiB”，对应写 EIP 时 leanVM 使用的实例。
- 安全：“The current leanVM instantiation is reported to provide roughly 124-bit classical and 62-bit quantum security, short of the NIST Level 1 target”。这与 README 的“128-bit ROM (64-bit QROM)”不一致。
- 未决：没有显式激励；没有强制的最低硬件；slot 内的聚合时间窗交给 leanSpec 定义。

**(d) 每个 proof 覆盖多少签名，以及 2026 年的目标**
- a16z 说“each proof from leanVM covers only about 900 signatures”[1]。900 是 README 的基准批量（@127510d1）[5]；HEAD 的基准用 1,290 [6]；EIP-8292 的表格测到 1,000 [4]。EIP-8292 明确把“recursion strategy”交给 leanSpec [4]。所以“900”应读作基准配置，不是协议参数（推论）。
- Lean Consensus 2026 计划（hackmd，tcoratger）[13]：
  - 目标“Aggregate **1,000 XMSS signatures per second**”和“2-to-1 recursive proof aggregation in approximately **200ms**”。
  - 当时的设计还是 KoalaBear + Poseidon2。
- 对照 HEAD：吞吐 1,362 签名/秒已超过目标；2-to-1 递归 0.291 s，尚未达到 200 ms [6]（推论）。
- 递归聚合已经在 2026-04-06 合进 leanSpec（Coratger 推文，指向 leanSpec PR #496）[14]。

**(e) ethereum.org 与 pq.ethereum.org 的说法**
- ethereum.org [15]：“Ethereum will replace BLS signatures with leanXMSS … leanVM … SNARK-based signature aggregation”。它给的口径是签名“roughly 3,000 bytes compared to 96 bytes for BLS”，leanVM“compressing the data by 250x”。这与 EIP-8292 的 1.17 KiB、leanXMSS 现规范的 2,404 B 都不同。
- pq.ethereum.org（Last updated 2026-06-27）[16]：共识层“specifically hash-based signatures (leanXMSS)”，路线是 I* PQ key registry → L* PQ attestations + real-time CL proofs → 更长期的 full PQ consensus。

### 不确定之处
- 规范层面，slot 和 leaf index 的确切映射（是否有 epoch 偏移、密钥激活区间）我没在 leanSpec 里定位到原文。“slot = index”依据的是 leanSig 的 epoch 接口、leanXMSS 规范的成本口径和 a16z 的转述。
- slot 时间预算和聚合时间窗没有读到 leanSpec 的常量。hackmd 计划把“faster slots e.g. 4 seconds”列为 P2 [13]，不能当成已定的值。
- EIP-8292 的 124/62 位与 README 的 128/64 位，哪个代表当前主干，没有进一步的一手说明。

---

## H-Q3 为什么 Ethereum 偏好哈希路线

### 答案
公开理由分三层。
1. **协议最小依赖 / 少维护**：Vitalik 2026-06-15 在 EIP-8288 讨论帖里说：“We want to be minimalistic with dependencies, and have a strong preference to keep the base layer purely hash-based … It also means we have to maintain less total infrastructure”[20]。
2. **AI 密码分析风险**：
   - Vitalik 2026-10-07 发推：“The core new area of risk from this viewpoint is, unfortunately, ML-DSA / FHE / lattices”，并说 lean 路线“no lattices, no ML-DSA, no Falcon, no lattice-based commitments inside ZK proofs”[18]。
   - Justin Drake 同日呼吁“bunker mode”，主张“go all-in on hash-based cryptography and avoid structured mathematical assumptions entirely”[19]。
3. **长期目标**：strawmap 的五个 north star 之一是“post quantum L1: centuries-long cryptographic security, via hash-based schemes”[17]。

这只是协议偏好，研究范围要宽得多：
- PSE 在 ethresear.ch 发过 Falcon + LaBRADOR 的格聚合基准 [28]。
- pq.ethereum.org（06-27）仍把“Falcon, Dilithium, SPHINCS+”列为执行层候选，并提到 vector math 预编译 [16]。
- 10-19，Vitalik 把方向进一步推到“8288 maximalism”：任何签名都在本地 STARK 化，再通过聚合器入块，“Ethereum can then never add a new precompile again”[21][22]。

### 依据
- **Vitalik 的 AI 论证**（2026-10-07）[18]：
  - 类比：“naive factoring -> GNFS”。
  - 推断：“if you want to make something plausibly long-term secure, multiply the key sizes by 10”，而在更大的格尺寸下，“hash-based constructions will beat lattice-based constructions on concrete efficiency in every use case where hash-based constructions are possible at all”。
  - 同时承认公钥加密不能只靠哈希（“long-standing mathematical theorems”），并建议隐私协议“strongly favor NOT putting encrypted notes onchain”。
- **a16z 的反驳**：Impagliazzo–Rudich 的结论说明隐私链总要用到结构化密码学；链下投递 note 也离不开 ML-KEM [1]。这一点在 a16z 博客里专门有一节 [1]。
- **Justin Drake**（2026-10-07）[19]：
  - “A single battle-tested hash (e.g. from the SHA or BLAKE families) yields plausible post-AI security”。
  - “The Ethereum roadmap on strawmap[.]org fully embraces hash-based cryptography with end-to-end formal verification … Those timelines must now be revisited and accelerated”。
- **Khovratovich 的 Post-Poseidon 帖**（2026-09-23）[26]：
  - “With the emergence of Flock as a PQ proof system for binary circuits (esp. hashes), Ethereum no longer requires specific circuit-friendly hashes”。
  - 比较 SHA-2 / SHA-3 / BLAKE2s / BLAKE3 / K12 后给出风险排序：SHA-3 第一，BLAKE2s 与 SHA-2 变体并列第 2–3。
  - 原文：“Such proof systems are supposed to use recursion, so that the same hash function is both used within a commitment scheme and proven within a collection of Merkle paths”。这说明 EF 清楚递归里“证明自身哈希”的结构。
- **EIP-8288 帖**：有人问“Are lattice-based signatures being considered”，Vitalik 回复了上面那段话 [20]。
- **lex_node → Vitalik**（10-18、10-19）：lex_node 认为格签名可以等证明“AI-secure”之后再走预编译 [23]。Vitalik 回应：“The ideal route … is imo through 8288. You make whatever signature you want locally, then STARK it”[21]；随后补充“precompiles and EVM are both the wrong place … EIP-8288 maximalism”[22]。
- **执行层实际在推进的工作**：EF 的 asanso 2026-10-15 发布 Daisugi v0.3，用 LeanSPHINCS + LeanVM 把 20 个交易签名聚合成一个 proof，Vitalik 转推 [42]。
- **研究范围的证据**：PSE 的 LaBRADOR 基准是 10k 个 Falcon-512 签名，proof 74.07 KB，证明 5.95 s，验证 2.65 s（单线程 i5-11400H）[28]。

### 不确定之处
- a16z 链接的 Vitalik YouTube（k_CoOoDsZ5Y）本次没有抓取。
- 这些“理由”都来自个人推文或论坛回复，不是 EF 正式决议。pq.ethereum.org 的执行层候选与 Vitalik 10-07 的“no Falcon”之间存在张力，EF 没有公开调和。

---

## H-Q4 Starknet / StarkWare / Eli 的理由

### 答案
Eli 10-18 的推文原文：“Lattices have juicy mathematical structure, ripe for AI to attack. And the succinct versions based on module SIS are too new -- only around since 2012. I recommend waiting another 3-5 years”[24]。“2012”最贴近的出处是 Langlois–Stehlé 的 ePrint 2012/090，这篇论文首次定义了 Module-SIS / Module-LWE [29]。Aerie 用的 Akita 承诺正是基于 Module-SIS [1]，所以 Eli 的批评主要落在“格型简洁论证 / 承诺”这一层（推论）。

Starknet 的实际做法是“证明层纯哈希、账户层算法自由”：
- STARK 的承诺只依赖哈希 [30][32]。
- 原生 AA 已经有 S2morrow 的 Falcon-512 账户，OpenZeppelin 也公开了可部署（未审计）的 Falcon-512 / ML-DSA-44 / WOTS 验证器与账户合约 [30][33]。
- StarkWare 路线图写道，新功能包括“implementing consensus signatures onchain using PQ signature schemes, such as Falcon-512”[31]。

所以 Starknet 并不“反 Falcon”。

### 依据
- **Eli 推文**：2026-10-18 10:51 UTC，引用 a16z 的“The case for lattices 👇”（2026-10-16 23:11 UTC）[24][25]。
- **Langlois–Stehlé 2012/090** 摘要：“we define the Module-SIS and Module-LWE problems, which bridge SIS with Ring-SIS, and LWE with Ring-LWE” [29]。
- **StarkWare “Quantum Edge”**（页面无可见日期，图片路径为 2026/07）[30]：
  - “STARKs … rely only on post-quantum secure hash functions for their cryptographic commitments”。
  - “Working Falcon-512 … account implementations already exist, published by S2morrow and OpenZeppelin”。
  - 两处保留：OZ 合约“haven’t been audited yet”；“As an Ethereum Layer 2, Starknet’s full-stack quantum safety depends on Ethereum completing its own transition”。
- **StarkWare 路线图**（图片路径 2026/06）[31]：
  - Phase 1 把 Pedersen 换成 BLAKE2（状态承诺、地址派生、OS config hash）。
  - Phase 2 处理遗留合约存储。
  - Phase 3 依赖 Ethereum：secp syscall 与 blob KZG。
- **How STARKs Work Part 6**（StarkWare 博客）[32]：“This is the place, and the only place, where we make a cryptographic assumption – that the hash we use is safe”。
- **OpenZeppelin `cairo-pq-verifiers`** [33]：README 写“Experimental and unaudited”。crates 包括 falcon_512（SHAKE / Poseidon / BLAKE 三种 hash-to-point）、ml_dsa_44、poseidon_wots，以及 pq-accounts 合约和 Sepolia 说明。
- **StarkWare 与递归安全**：StarkWare 研究员 Shahar Samocha 是 TCC 2024《Security Bounds for PCD from Straightline Extractors》的合著者。论文给递归 STARK 提供了“new, albeit heuristic, insights”，同时承认递归构造要“instantiating the oracle (a heuristic step)”[37]。

### 与第一篇报告对照（过时点）
- 第一篇写的是 Starknet “1 笔 Falcon 账户演示”。现在 StarkWare 博客写的是 S2morrow 和 OpenZeppelin 两家都有 Falcon-512 账户实现，OZ 的仓库能部署到 Sepolia（未审计）[30][33]。
- 第一篇说 Starknet 的“共识”在路线图里，但没提到 StarkWare 明说过考虑用 Falcon-512 做共识签名 [31]。这一点对“Starknet 立场”的定性很关键。
- 第一篇“Migration Register 仍是 2026-08-19 版”，本次没有重新核对 Register。

### 不确定之处
- Eli 说的“2012”也可能指 Lyubashevsky 2012 的“Lattice signatures without trapdoors”。那篇基于 (Ring-)SIS，不是 Module-SIS，Eli 没有给出处。
- “How STARKs Work Part 6”是否 Eli 本人所写，页面没有显示作者署名。GPT 把它归给 Eli，证据不足。
- Starknet 的共识签名用 Falcon-512 目前只是路线图里的“as we continue to develop … new features”，没有时间表 [31]。

---

## H-Q5 哈希路线的弱点

### 答案
弱点有六条。
1. **签名大**：leanXMSS 2,404 B，约为 BLS 96 B 的 25 倍 [8][4]。
2. **有状态运维风险**：一个 index 签了两条不同消息，私钥就会泄露 [8][34]。
3. **证明开销**：每个签名的验证要几百次哈希，证明这些哈希的开销很高。a16z 称一般超过 100 倍 [1]。
4. **递归带来的复杂度与证明模型问题**：a16z 的原话是“the security of the resulting proofs can’t be established even in the random oracle model”[1]。学界确有“relativized succinct arguments in the ROM do not exist”的结果，实践中的参数靠启发式支撑 [37][38]。截至 10-20，我没找到 EF 方面的直接回应。
5. **非标准、哈希未定**：leanXMSS / leanSPHINCS 都不是 NIST 参数集，BLAKE2s 只是占位，leanSpec 与 leanVM 还在用不同的域 / 哈希 [6][11]。
6. **硬件钱包支持弱**：轻量 SPHINCS- 在 Ledger 上签名要 47.5–390 s [27]。

“小域 Poseidon 被攻破”这一说法要收窄：公开结果是 Poseidon2 的 round-skipping 攻击侵蚀了安全余量（Poseidon Initiative 因此转向 Poseidon1），以及 KoalaBear t=24 的 Poseidon 在 31 轮中有 28 轮被 CICO-1 求解。推荐参数没有被完全攻破 [39][40]。

### 依据
- **a16z 的论点** [1]：
  - “Recursion also adds risk: It is intricate and bug-prone, and each recursive step proves statements about the very hash function used to make the proofs non-interactive.”
  - “Ethereum’s planned consensus and account signatures are custom schemes outside NIST’s standards, with the underlying hash still undecided.”
  - “hashing is expensive to prove, typically adding over 100x overhead”。
- **Thaler 的推文串**：“That concrete benefit has to be weighed against the far more speculative possibility of new attacks on standard lattice assumptions”[3]。
- **学界背景** [37][38]：
  - Chiesa–Guan–Samocha–Yogev 认为，用 straightline extractor 的 PCD 安全性基本等于底层 SNARK，但这是在“relativized”模型下；对实际的递归 STARK 只是“heuristic … partial evidence justifying the parameter choices”。
  - 同文引用 Barbara–Chiesa–Guan ePrint 2024/728，标题即“Relativized succinct arguments in the ROM do not exist”。
- **Aerie 自身的证明模型**：“We prove knowledge soundness of Aerie in the classical random-oracle model”。不是 QROM，但因为不递归，ROM 证明可以直接适用 [2]。
- **EF 方面的反证材料**（不是对 a16z 的直接回应）：
  - leanXMSS 在 10-17 获得 127 位经典 ROM 的机器检查证明 [7][8]。
  - leanVM README 列出“end-to-end formal verification”，并链接 Verified-zkEVM/leanerVM，状态是“in progress”[6]。
  - pq.ethereum.org 提到 2,000 万美元、3 年的 zkEVM 形式化验证项目，覆盖“the SNARK primitives that underpin post-quantum signature aggregation”[16]。
- **我查过的“回应”渠道**：
  - Coratger 10-16 至 10-19 的推文：只谈 Cambridge workshop、EthLib，以及“Verification Theatre”（ePrint 2026/2441），没有正面回应 Aerie [43]。
  - Wambsgans、Drake 的近期时间线里没有出现 Aerie / recursion 相关内容 [43]。
  - Vitalik 10-17 至 10-19 只发了 8288 相关推文 [21][22]。
  - ethresear.ch 和 Magicians 上没有搜到 10-16 之后的回应帖。
- **证明开销的数量感**（推论）：
  - leanVM 的 Flock 证明 BLAKE2s 压缩约 48.6 万次/秒（16 核 M4 Max）[6]。
  - Khovratovich 给出原生 BLAKE2s 单核约 700 万次压缩/秒（2.2 GHz）[26]。
  - 按核数平摊，证明一次压缩比算一次压缩慢约两个数量级，与 a16z 说的“>100x”同量级。
- **硬件钱包**：SPHINCS- 在 ST33K1M5 上 C11 要 390 s、C12 要 47.5 s。作者预告 JARDIN 可以“reduces compact signing to 3 seconds”，但尚未发表 [27]。
- **Poseidon**：
  - Khovratovich 的 Poseidon Initiative 2026 幻灯片：“Why We Moved from Poseidon2: Round Skipping Attack … Does not break recommended parameters outright, but substantially erodes the security margin → Poseidon Initiative pivots to Poseidon1”[39]。
  - ePrint 2026/1692：“experimental solutions to the CICO-1 problem over 28 out of 31 rounds … in the setting set by the Ethereum Poseidon initiative (KoalaBear, t=24, α=3)”[40]。
- **有状态风险落到共识上**（推论）：leanXMSS 签名是确定性的，节点崩溃后对同一条消息重签是安全的 [8]。但同一 slot 签两条不同的投票（即可罚没的双签），不只会被罚没，还会泄露该 index 上一次性密钥的链值。备份恢复、多实例运行这类常见的运维事故，在哈希签名下的后果比在 BLS 下更重。
- **集中化**：EIP-8292 自认“the main decentralization risk”是证明集中在少数高配聚合者手里，并且目前没有显式激励 [4]。

### 不确定之处
- a16z 的“递归无法在 ROM 下建立安全性”是否有人从 EF 一侧给出过正式反驳（比如 PCD-in-ROM 的新结果），我没找到，不能排除存在没被检索到的回应。
- 2024/728 只从参考文献列表里读到标题，没有读正文。
- 双签泄露密钥的影响依据的是 leanXMSS 规范的原话，leanSpec 有没有对应的防护（例如本地 slashing DB）没有核对。

---

## 对外部调研（GPT）的修正

1. **“leanVM 当前是基于二进制域的最小哈希 zkVM，BLAKE2s 占位，KoalaBear + Poseidon 是历史分支”**：核实属实，@127510d1 与 HEAD @3a37fb6e 的 README 都是这么写的 [5][6]。但 GPT 漏了 10-17 的 PR #640：签名方案换成了两层 leanXMSS（2^32 个 index，2,404 B，201 次压缩）[7][8]。还漏了一点：共识规范 leanSpec 仍按 KoalaBear 元素编码 XMSS [11]。“历史分支”只对 leanVM 成立，对 leanSig / leanSpec 不成立。
2. **“当前 README 给出约 1,362 个 XMSS 签名／秒”**：数字准确（@3a37fb6e）[6]，但口径没说清。1,362 是在新的两层 leanXMSS（每个签名 201 次压缩）上测的，a16z 比较时用的是旧的单层 XMSS（144 次压缩）。两者不仅不能混算，签名方案本身就不同 [6][7]。
3. **“128-bit 必须带上模型（128-bit ROM / 64-bit QROM）”**：README 原文确实如此 [6]，但 GPT 漏了 EIP-8292 安全一节的不同说法：当前实例约 124 位经典、62 位量子，“short of the NIST Level 1 target”[4]。
4. **“共识讨论 leanXMSS、执行层依赖聚合讨论 leanSPHINCS”引 EIP-8292**：EIP-8292 根本没提 leanSPHINCS。执行层 leanSPHINCS 的出处应是 EIP-8288、leanSPHINCS 规范和 Vitalik 推文 [9][21]。
5. **Ethereum 的理由只引了 Magicians 回复**：漏了更强、更新的一手表态。Vitalik 2026-10-07 说“no lattices, no ML-DSA, no Falcon”，并给出 AI 论证 [18]；Justin Drake 同日发“bunker mode”帖 [19]；Vitalik 10-19 推“8288 maximalism”[22]。
6. **“Eli 在其 STARK 解释文章中强调…”**：“How STARKs Work Part 6”是 StarkWare 博客文章，页面上没有作者署名 [32]，归给 Eli 证据不足。Eli 本人的论点（AI、Module-SIS 自 2012、等 3–5 年）现在可以直接引用他的推文 [24]，GPT 的“资料边界”这一条已经解决。
7. **Starknet 是“证明层哈希、账户层可选 Falcon”**：方向正确，但不完整。StarkWare 路线图明确考虑用 Falcon-512 做链上共识签名 [31]；OZ 的仓库同时有 ML-DSA-44 和 WOTS 验证器 [33]。
8. **递归安全质疑“不是已经发现 leanVM 可被伪造的证据”**：这个判断成立。可以补上学术背景：Chiesa 等人（含 StarkWare 研究员）承认递归实例化是启发式的 [37]；另有“relativized succinct arguments in the ROM do not exist”的结果 [38]。
9. **GPT 没提的状态风险细节**：leanXMSS 的确定性签名意味着同一 index 重签同一条消息是安全的，签不同的消息则会破坏密钥 [8]；SP 800-208 要求在不可导出私钥的硬件模块里签名 [34]。这两点都是“slot 当状态”方案仍要处理的运维约束。

---

## 来源

1. **PRIMARY** a16z crypto，“Fast post-quantum signature aggregation with lattice SNARKs”（2026-10-16），https://a16zcrypto.com/posts/article/fast-post-quantum-signature-aggregation-with-lattice-snarks ，访问 2026-10-20。证明：a16z 对 leanVM 的“约 900 签名/proof”“递归在 ROM 下无法建立安全”“>100x 哈希证明开销”“29x / 60x”“SPHINCS- 在 Ledger 签名 47 s 到 6 分钟”“1,000 sig/s 目标”等论点，以及它比较时用的 commit @127510d1。
2. **PRIMARY** Centelles、Dao、Badakhshan、Thaler，“Aerie: Efficient Aggregation of Falcon Signatures”，ePrint 2026/2501（摘要页，2026-10-17 approved），https://eprint.iacr.org/2026/2501 。证明：Aerie 的知识可靠性只在经典 ROM 下证明。
3. **PRIMARY** Justin Thaler X 推文串（2026-10-16），https://x.com/SuccinctJT/status/2111136119593082925 （经检索页摘录）。证明：a16z 方面的“推测性格攻击 vs 递归复杂性”权衡论述。
4. **PRIMARY** EIP-8292 “Post-Quantum Attestation Aggregators”（Draft，Created 2026-06-07），https://eips.ethereum.org/EIPS/eip-8292 ，访问 2026-10-20。证明：聚合者角色、层级、自愿高配、proof 尺寸与证明时间表、1.17 KiB 签名、124/62 位安全说明、开放问题。
5. **PRIMARY** leanEthereum/leanVM README @127510d14c98ade4e8a97646c44fa7f1ff5e752d（2026-10-15），https://github.com/leanEthereum/leanVM/blob/127510d14c98ade4e8a97646c44fa7f1ff5e752d/README.md 。证明：旧 XMSS 基准（900 签名、0.545 s、1,651.7/s）、SPHINCS 817.7/s、二进制域 / WHIR / Flock、BLAKE2s 占位、128/64 位、not production ready。
6. **PRIMARY** leanEthereum/leanVM README @3a37fb6e1c7423e36b67d1cac4eda70c3ad4dd45（HEAD，2026-10-18），https://github.com/leanEthereum/leanVM/blob/3a37fb6e1c7423e36b67d1cac4eda70c3ad4dd45/README.md 。证明：新 leanXMSS 基准（1,290 签名、0.947 s、1,362.5/s、318.4 KiB）、leanSPHINCS 850/s、递归 0.291 s、Flock 48.6 万次压缩/秒。
7. **PRIMARY** leanVM commit 55f8b0389c6cceab02dee82a003e40f7d80d0699 “Double XMSS (#640)”（2026-10-17），https://github.com/leanEthereum/leanVM/commit/55f8b0389c6cceab02dee82a003e40f7d80d0699 。证明：两层 leanXMSS（2^32 个 index、2,404 B、201 次压缩）、127 位 SUF-CMA Lean 4 证明、种子域分离。
8. **PRIMARY** leanXMSS 规范草案（leanVM release “doc-latest”，leanXMSS.pdf），https://github.com/leanEthereum/leanVM/releases/download/doc-latest/leanXMSS.pdf ，访问 2026-10-20（随主干更新，没有固定版本）。证明：方案结构、尺寸、验证与签名成本、一个 index 只能签一条消息、q/2^127 定理、量子安全只是预期、12 秒 slot 的成本口径、门限签名草图。
9. **PRIMARY** leanSPHINCS 规范（leanVM release “doc-latest”，leanSPHINCS.pdf），https://github.com/leanEthereum/leanVM/releases/download/doc-latest/leanSPHINCS.pdf ，访问 2026-10-20。证明：4,276 B、307 次压缩、32 B 公钥、寿命与密钥生成表、无状态、QROM 只是目标。
10. **PRIMARY** leanEthereum/leanSig README @c08a3bae74b0d85379cab72dcbefa4091546ecbb（2026-04-29，“Devnet 4”），https://github.com/leanEthereum/leanSig 。证明：原型、未审计、epoch 接口、同一 (sk, epoch) 不得重复、Poseidon1 实例化。
11. **PRIMARY** leanEthereum/leanSpec commit 0b7d33ecbc9ee2435759c92de4da4d08d7faf1c8（2026-09-02），https://github.com/leanEthereum/leanSpec/commit/0b7d33ecbc9ee2435759c92de4da4d08d7faf1c8 。证明：共识规范的 XMSS 密钥 / 签名按 KoalaBear 域元素编码。
12. **PRIMARY** GitHub API `repos/leanEthereum/leanMultisig`（返回 leanEthereum/leanVM，id 1020551292），访问 2026-10-20。证明：leanMultisig 已改名为 leanVM。
13. **PRIMARY** Thomas Coratger，“Lean Consensus: 2026 Plan”，https://hackmd.io/@tcoratger/ryS1ElrWbx ，访问 2026-10-20。证明：1,000 XMSS 签名/秒、2-to-1 递归约 200 ms 的目标；当时的设计是 KoalaBear + Poseidon2；4 秒 slot 列为 P2。
14. **PRIMARY** Coratger X 推文（2026-04-06），https://x.com/tcoratger/status/2041112276116079002 （经 api.fxtwitter.com）。证明：递归签名聚合已合入 leanSpec（PR #496）。
15. **PRIMARY** ethereum.org “Post-quantum cryptography on Ethereum”，https://ethereum.org/roadmap/security/quantum-resistance/ ，访问 2026-10-20。证明：leanXMSS 替换 BLS、leanVM 聚合；“约 3,000 B”“250x”的口径。
16. **PRIMARY** pq.ethereum.org（Last updated 2026-06-27），访问 2026-10-20。证明：共识层用 leanXMSS；执行层候选含 Falcon / Dilithium / SPHINCS+；2,000 万美元形式化验证项目。
17. **PRIMARY** strawmap.org FAQ，访问 2026-10-20。证明：north star 中的“post quantum L1 … via hash-based schemes”与“private L1”。
18. **PRIMARY** Vitalik X 推文（2026-10-07 23:28 UTC），https://x.com/VitalikButerin/status/2107976296320106851 （经 api.fxtwitter.com）。证明：AI 论证、“no lattices, no ML-DSA, no Falcon”、“Signatures in lean ethereum are all hash-based, either WOTS or SPHINCS-”、公钥加密需要结构。
19. **PRIMARY** Justin Drake X 推文（2026-10-07 14:14 UTC），https://x.com/drakefjustin/status/2107837081313505768 （经 api.fxtwitter.com）。证明：“bunker mode”与“all-in on hash-based cryptography”。
20. **PRIMARY** Ethereum Magicians，EIP-8288 帖第 5 楼（vbuterin，2026-06-15 13:50 UTC），https://ethereum-magicians.org/t/eip-8288-frame-type-for-pq-sig-and-stark-aggregation/28723/5 （经 /t/28723.json 核对时间）。证明：“minimalistic with dependencies … purely hash-based … less total infrastructure”。
21. **PRIMARY** Vitalik X 推文（2026-10-19 02:56 UTC），https://x.com/VitalikButerin/status/2112015118418473358 。证明：“The ideal route … through 8288 … never add a new precompile again”。
22. **PRIMARY** Vitalik X 推文（2026-10-19 04:04 UTC），https://x.com/VitalikButerin/status/2112032009413439704 （经 api.fxtwitter.com）。证明：“EIP-8288 maximalism”，以及 calldata 上限约 8 MB/s 的理由。
23. **PRIMARY** lex_node X 推文（2026-10-18 14:11 UTC），https://x.com/lex_node/status/2111822591123927371 。证明：Vitalik 所回复的“格签名可以等证明 AI-secure 后再走预编译”的原话。
24. **PRIMARY** Eli Ben-Sasson X 推文（2026-10-18 10:51 UTC），https://x.com/EliBenSasson/status/2111772220389245426 （经 api.fxtwitter.com）。证明：Eli 论点原文。
25. **PRIMARY** a16z crypto X 推文（2026-10-16 23:11 UTC），https://x.com/a16zcrypto/status/2111233645948342778 。证明：Eli 引用的对象，“The case for lattices”。
26. **PRIMARY** Dmitry Khovratovich，“Post-Poseidon: Hash Function Variants for Ethereum”（ethresear.ch，2026-09-23），https://ethresear.ch/t/post-poseidon-hash-function-variants-for-ethereum/26071 。证明：Flock 让 Ethereum 不再需要电路友好哈希；候选哈希的风险排序；递归中“同一哈希既用于承诺又被证明”；原生压缩速度。
27. **PRIMARY** nconsigny，“SPHINCS minus”（ethresear.ch），https://ethresear.ch/t/sphincs-minus-efficient-stateless-post-quantum-signature-verification-on-the-evm/25165 ，访问 2026-10-20。证明：SPHINCS- 各变体的尺寸 / gas / 签名哈希数，Ledger 上 390 s / 47.5 s，leanSPHINCS 的定位。
28. **PRIMARY** Nevado、Kim、Stopar（PSE），“Lattice-based signature aggregation”（ethresear.ch），https://ethresear.ch/t/lattice-based-signature-aggregation/22282 （发帖日期本次没能核对）。证明：Ethereum 研究社区做过 Falcon + LaBRADOR 的格聚合基准。
29. **PRIMARY** Langlois、Stehlé，“Worst-Case to Average-Case Reductions for Module Lattices”，ePrint 2012/090，https://eprint.iacr.org/2012/090 。证明：Module-SIS / Module-LWE 在 2012 年首次定义。
30. **PRIMARY** StarkWare，“Starknet’s Quantum Edge: STARKs and Native Account Abstraction”，https://starkware.co/blog/starknets-quantum-edge-starks-and-native-account-abstraction/ ，访问 2026-10-20。证明：证明层纯哈希、Falcon-512 账户（S2morrow、OZ）、未审计、依赖 Ethereum。
31. **PRIMARY** StarkWare，“The Architecture Advantage: Starknet’s Quantum Readiness Roadmap”，https://starkware.co/blog/the-architecture-advantage-starknets-quantum-readiness-roadmap/ ，访问 2026-10-20。证明：三阶段路线；新功能含“consensus signatures onchain using PQ signature schemes, such as Falcon-512”。
32. **PRIMARY** StarkWare，“How STARKs Work Part 6”，https://starkware.co/blog/how-starks-work-part-6/ ，访问 2026-10-20。证明：STARK 唯一的密码学假设是哈希。
33. **PRIMARY** OpenZeppelin/cairo-pq-verifiers README（main，访问 2026-10-20，没有固定 commit），https://github.com/OpenZeppelin/cairo-pq-verifiers 。证明：Starknet 上有 Falcon-512 / ML-DSA-44 / WOTS 验证器与可部署账户，均未审计。
34. **PRIMARY** NIST SP 800-208（2020-10）§1、§1.1、§1.2，https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-208.pdf 。证明：安全只依赖哈希；必须在不可导出私钥的硬件模块里签名；不适合通用场景；OTS 重用会导致任意伪造。
35. **PRIMARY** NIST FIPS 205 Table 2（2024-08），https://csrc.nist.gov/pubs/fips/205/final 。证明：SLH-DSA 各参数集的尺寸（128s / 128f / 256s 已由第一篇 P25 核对，其余是标准公认值）。
36. **PRIMARY** RFC 8391（XMSS）§4.1.7–4.1.8 与 Table 3（经第一篇报告 P22 记录）。证明：XMSS 的典型尺寸。
37. **PRIMARY** Chiesa、Guan、Samocha、Yogev，“Security Bounds for Proof-Carrying Data from Straightline Extractors”，ePrint 2023/1646（TCC 2024），https://eprint.iacr.org/2023/1646 。证明：递归 STARK 的具体安全性只有启发式依据，实例化随机预言是启发式步骤。
38. **PRIMARY**（只读到标题）Barbara、Chiesa、Guan，“Relativized succinct arguments in the ROM do not exist”，ePrint 2024/728（经 [37] 的参考文献列表）。证明：a16z 论点在理论上有先例。
39. **PRIMARY** D. Khovratovich，“Poseidon Cryptanalysis Initiative 2024–2026 – State of the Art”（SPRING2026 幻灯片），https://pis147879.github.io/SPRING2026/slides/khovratovich.pdf （经检索摘录）。证明：Poseidon2 round-skipping 攻击侵蚀余量但不破推荐参数；项目转向 Poseidon1。
40. **PRIMARY** Bhati、Tariq、Ashur，ePrint 2026/1692（2026-08-15），https://eprint.iacr.org/2026/1692 。证明：在 Ethereum Poseidon Initiative 的设定下，CICO-1 求解到 28/31 轮。
41. **PRIMARY** Drake、Khovratovich、Kudinov、Wagner，“Hash-Based Multi-Signatures for Post-Quantum Ethereum”，ePrint 2025/055（经 leanSig README 与 leanXMSS 参考文献）。证明：leanSig / leanXMSS 的理论基础。
42. **PRIMARY** asanso X 推文（2026-10-15，Vitalik 转推），https://x.com/asanso/status/2110726152192983148 。证明：Daisugi v0.3 用 LeanSPHINCS + LeanVM 聚合了 20 个交易签名。
43. **PRIMARY**（不存在性证据）api.fxtwitter.com 上 tcoratger、TomWambsgans、drakefjustin、VitalikButerin 的近期时间线，访问 2026-10-20。证明：10-16 至 10-20 期间没检索到他们对 Aerie 递归论点的直接回应。
44. 已有报告：post-quantum-mantle/research/notes-ethereum.md、notes-primer.md，以及 explainer.md 的 Starknet 段（2026-10-16）。只当线索和对照。
45. 媒体：crypto.news，“LayerZero unveils Aerie…”（2026-10）。只当线索；它转述的 Aerie 论文 §6.3 是 leanVM 900 个 XMSS 签名用时 0.51 s，与 a16z 的“1,770/s”相符。

---

## 开放问题

1. leanSpec（KoalaBear / Poseidon 编码）与 leanVM 主干（二进制域 / BLAKE2s，两层 leanXMSS）什么时候对齐？devnet 用的签名方案会不会切到 2,404 B 的 leanXMSS？最终哈希会在 SHA-3、BLAKE2s、SHA-2 变体里选哪个？
2. EIP-8292 的“124/62 位”与 README 的“128/64 位”，哪个代表当前主干？“closing that gap (for example with larger digests)”会不会再增大签名和 proof？
3. EF 会不会正式回应 a16z 的“递归安全在 ROM 下无法建立”？会不会给出 PCD 级别的安全论证（例如在 leanVM 的 Lean 形式化里覆盖递归层）？
4. leanSpec 里 slot 与 leaf index 的映射、slot 时间（12 s 还是 4 s）以及聚合时间窗的具体常量是什么？
5. 验证者同一 slot 双签导致密钥泄露的情形，客户端层面有没有强制防护（例如 slashing protection DB 写盘必须先于签名输出）？
6. StarkWare 用 Falcon-512 做共识签名的计划有没有时间表？这与 Eli“等 3–5 年”的建议是否矛盾？我的推论是不矛盾：Eli 针对的是 Module-SIS 简洁论证，Falcon 基于 NTRU，但需要 StarkWare 确认。
7. EF 页面（pq.ethereum.org 执行层候选含 Falcon / Dilithium，J* 有 PQ 签名预编译）会不会按 Vitalik 10-07 / 10-19 的“no lattices / 8288 maximalism”更新？

---

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| H1 | 有状态哈希签名的安全性只依赖底层哈希的原像 / 第二原像困难性，大规模量子计算机预期不会破坏它 | [34] SP 800-208 §1 第 1 段 | observed |
| H2 | SP 800-208 要求有状态 HBS 的密钥与签名生成在不可导出私钥（加密形式也不行）的硬件模块里进行，并称其“not suitable for general use” | [34] §1 末段、§1.1 | observed |
| H3 | 同一 OTS 密钥签两条不同消息，攻击者就能伪造任意消息的签名 | [34] §1.2 | observed |
| H4 | leanXMSS 是两层高 16 的 XMSS over WOTS+C，一把密钥可签 2^32 个 leaf index，公钥 32 B，签名 2,404 B，验证 201 次 BLAKE2s 压缩 | [8] Abstract 与 §5；[7] PR #640 说明 | observed |
| H5 | leanXMSS 的一次性密钥是 58 条长度为 4 的链，靠 grinding 使摘要数字和等于 106，以此取代 Winternitz 校验和，平均每次签名约 2^20 次尝试 | [8] §2–§3、§5 Signing cost | observed |
| H6 | leanXMSS 已证明 127 位经典 SUF-CMA 安全（ROM，Lean 4），量子安全只是“expect about 64 quantum bits”的推测 | [8] §6 Theorem 1 与 Quantum security 段；[7] | observed |
| H7 | leanXMSS 规范明确：一个 leaf index 不得签两条不同的消息，定理只覆盖每个 index 最多用一次的签名者，这要由签名者的状态来保证 | [8] §5、§6 “Using a key” | observed |
| H8 | leanXMSS 的签名是确定性的，同一 index 重签同一条消息得到同一个签名 | [8] §3 Signing、§6 | observed |
| H9 | 在 leanXMSS 下，验证者同一 slot 签两条不同投票（双签）不只会被罚没，还会泄露该 index 的一次性密钥材料；备份恢复、多实例运行这类事故的后果比 BLS 更重 | 由 H7、H8、H12 推出：两个不同码字会暴露每条链的较小位置 | inferred |
| H10 | leanSPHINCS 是无状态方案：公钥 32 B，签名 4,276 B，验证 307 次压缩，经典 ROM 127 位，满树寿命约 13 亿次签名，QROM 64 位只是目标、没有证明 | [9] Abstract、§5.4、§6 | observed |
| H11 | FIPS 205 中 SLH-DSA-128s / 128f / 256s 的签名分别为 7,856 / 17,088 / 29,792 B，公钥 32 / 32 / 64 B | [35] Table 2（与第一篇 P25 一致） | observed |
| H12 | Ethereum 共识用 slot 号充当签名状态（leaf index / epoch） | [10] epoch 接口；[8] §8 “per year of 12-second slots”；[1] “slot number itself can serve as the signing state” | inferred |
| H13 | 2^32 个 index 按 12 s 一个 slot 约可用 1,600 年；一棵下层树（2^16 个 index）约 9.1 天用完，签名者在首次签名时才构建它 | 由 H4、H12 与 [8] §5 “the signer builds each bottom tree when it first signs in it” 推出 | inferred |
| H14 | SPHINCS- 的硬件钱包友好变体在 Ledger Nano S+（ST33K1M5）上签名，C11 要 390 s，C12 要 47.5 s | [27] §5 表下段 | observed |
| H15 | SPHINCS- C13 签名 3,704 B、链上验证 127K gas，但签名约需 430 万次哈希调用；SLH-DSA-SHA2-128-24 需约 10.7 亿次 | [27] §5 Variant 表 | observed |
| H16 | leanSig 是原型实现，未审计，不得用于生产；同一 (sk, epoch) 不得重复签名；硬编码实例用 Poseidon1 | [10] Disclaimers、Signature Interface、Schemes 节 @c08a3bae | observed |
| H17 | leanVM 自述是“minimal hash-based zkVM”，用 192-bit 二进制域、WHIR、Flock；BLAKE2s 是占位，SHA2 / SHA3 / BLAKE3 在考虑中；计划从 leanISA 迁到 RISC-V rv64im；ZK 支持在计划中 | [6] README @3a37fb6e “work in progress”“SNARK machinery” | observed |
| H18 | leanVM 在改用二进制域之前用 KoalaBear + Poseidon，旧设计保留在 koalabear 分支 | [5][6] README note | observed |
| H19 | leanVM README 声称“128-bit ROM (64-bit QROM) soundness”，并写明“not (yet) production ready”，形式化验证仍在进行 | [6] README security 节 | observed |
| H20 | EIP-8292 写的是当前 leanVM 实例约 124 位经典、62 位量子安全，未达 NIST Level 1，与 README 的 128/64 不一致 | [4] Security Considerations “Proof soundness”；[6] | observed |
| H21 | leanVM @127510d1 的 XMSS 基准：M4 Max，900 签名，0.545 s，317.4 KiB，1,651.7 签名/秒，验证 3.977 ms | [5] README XMSS aggregation | observed |
| H22 | leanVM HEAD @3a37fb6e 的基准：1,290 个 leanXMSS 签名，0.947 s，318.4 KiB，峰值 15.5 GiB，1,362.5 签名/秒，验证 5.387 ms | [6] README leanXMSS aggregation | observed |
| H23 | 2026-10-17 的 PR #640 把单层 XMSS 换成两层 leanXMSS，使 README 的 XMSS 吞吐从 1,651 降到 1,362 签名/秒；a16z 用的“1,770”和 GPT 引的“1,362”分别测的是不同的签名方案 | 由 H21、H22 与 [7]、[1] 推出 | inferred |
| H24 | leanVM 的 2-to-1 递归（叶子各 900 签名）在 HEAD 上用时 0.291 s，proof 201.5 KiB，验证 6.271 ms | [6] README recursion | observed |
| H25 | leanSPHINCS 聚合：@127510d1 为 817.7 签名/秒，HEAD 为 850.1 签名/秒（850 签名，约 1 s） | [5][6] README SPHINCS aggregation | observed |
| H26 | leanSpec（2026-09-02）的 XMSS 密钥 / 签名仍按 KoalaBear 域元素编码，与 leanVM 主干的二进制域 / BLAKE2s 不一致 | [11] commit message；[6] | observed |
| H27 | leanMultisig 已改名为 leanVM（GitHub API 返回同一个 repo） | [12] repo id 1020551292 | observed |
| H28 | EIP-8292 把聚合者定义为自愿参与、不设质押门槛的高配角色；质押达到 SUBNET_COMMITTEES×32 ETH 的节点 SHOULD 当 super-aggregator | [4] “The aggregator role” | observed |
| H29 | EIP-8292 规定叶子聚合与递归聚合属于聚合者，区块级折叠是提议者职责，每个区块最多 8 条不同的 attestation 消息 | [4] “Levels of aggregation”、Constants 表 | observed |
| H30 | EIP-8292 的非规范性目标：proof 硬上限 512 KiB，典型 185–230 KiB，约 256 KiB 的 proof 在 1 秒内传播；1,000 个签名在 16 核上约 2.6 s、2 核上约 11 s | [4] “Aggregation targets” 表 | observed |
| H31 | EIP-8292 认为证明集中在少数高配聚合者手里是主要的去中心化风险，目前没有显式的协议激励，也没有强制的最低硬件 | [4] Rationale 与 Open questions | observed |
| H32 | a16z 所说“每个 leanVM proof 约覆盖 900 个签名”是 README 的基准批量，不是协议参数；递归策略由 leanSpec 定义 | 由 H21、H22 与 [4] “the recursion strategy … are defined by leanSpec” 推出 | inferred |
| H33 | Lean Consensus 2026 计划的目标是每秒聚合 1,000 个 XMSS 签名、2-to-1 递归约 200 ms；当时的设计是 KoalaBear + Poseidon2 | [13] “LeanVM Performance Targets”“Poseidon2 Integration” | observed |
| H34 | 截至 HEAD，leanVM 的吞吐已超过 1,000 签名/秒的目标，但 2-to-1 递归（0.291 s）还没达到 200 ms | 由 H22、H24、H33 推出 | inferred |
| H35 | 递归签名聚合已在 2026-04-06 合入 leanSpec（PR #496） | [14] Coratger 推文 | observed |
| H36 | ethereum.org 给的 PQ 签名口径是约 3,000 B、leanVM 压缩 250 倍，与 EIP-8292 的 1.17 KiB、leanXMSS 现规范的 2,404 B 都不同 | [15] “Consensus-layer BLS signatures” 段；[4]；[8] | observed |
| H37 | Vitalik 在 EIP-8288 帖（2026-06-15）称要依赖最小化，强烈倾向基础层纯哈希，并且少维护基础设施 | [20] 第 5 楼 | observed |
| H38 | Vitalik（2026-10-07）认为 AI 加速数学的新风险集中在 ML-DSA / FHE / 格，并称 lean 路线“no lattices, no ML-DSA, no Falcon, no lattice-based commitments inside ZK proofs” | [18] 推文正文 | observed |
| H39 | Vitalik 承认公钥加密不能只靠哈希实现，建议隐私协议不要把加密 note 放上链 | [18] 正文与 TLDR 第 3 条 | observed |
| H40 | Justin Drake（2026-10-07）呼吁“bunker mode”，主张全面转向哈希型密码学、避开曲线 / 格 / 同源等结构化假设，并要求加速 strawmap 时间表 | [19] 推文正文 | observed |
| H41 | strawmap 的五个 north star 包括“post quantum L1 … via hash-based schemes”和“private L1 … via L1 shielded transfers” | [17] “What are some of the highlights?” | observed |
| H42 | Vitalik（2026-10-19）主张让任意签名在本地 STARK 化、经 EIP-8288 聚合入块，“Ethereum can then never add a new precompile again”，并称之为“EIP-8288 maximalism” | [21]；[22] | observed |
| H43 | pq.ethereum.org（2026-06-27）仍把 Falcon、Dilithium、SPHINCS+ 列为执行层候选，并规划 PQ 签名预编译（J*） | [16] Execution Layer 与 FAQ “Ethereum's Approach” | observed |
| H44 | Ethereum 的“哈希偏好”是协议层偏好，研究范围仍包括格方案（PSE 的 LaBRADOR 基准、EF 页面的候选列表）；EF 各文本之间没有公开调和 | 由 H37、H38、H43 与 [28] 推出 | inferred |
| H45 | PSE 的 LaBRADOR 基准：10k 个 Falcon-512 签名，proof 74.07 KB，证明 5.95 s，验证 2.65 s（单线程 i5-11400H） | [28] Key-takeaway | observed |
| H46 | Khovratovich（2026-09-23）称，Flock 出现后 Ethereum 不再需要电路友好的哈希；按风险最小化排序，SHA-3 第一，BLAKE2s 与 SHA-2 变体并列第 2–3 | [26] Introduction 与 Rankings | observed |
| H47 | Eli 的原文论点是：格有可供 AI 攻击的数学结构，基于 Module-SIS 的简洁方案“only around since 2012”，建议再等 3–5 年再托付大额资金 | [24] 推文正文 | observed |
| H48 | Module-SIS / Module-LWE 由 Langlois–Stehlé 在 ePrint 2012/090 中首次定义 | [29] 摘要 | observed |
| H49 | Eli 的“2012 / Module-SIS”批评主要针对 Aerie 使用的 Akita 格承诺（简洁论证层），不直接针对基于 NTRU 的 Falcon 签名 | 由 H47、H48 与 [1] “Akita (the lattice-based polynomial commitment scheme)” 推出 | speculative |
| H50 | StarkWare 称 STARK 的承诺只依赖哈希，并称 S2morrow 与 OpenZeppelin 已发布 Falcon-512 账户实现（OZ 的未审计） | [30] 首段与 “Quantum-resistant wallets exist today” | observed |
| H51 | StarkWare 路线图把“implementing consensus signatures onchain using PQ signature schemes, such as Falcon-512”列为新功能方向 | [31] Phase 1 末段 | observed |
| H52 | Starknet 的立场是“证明层哈希、账户层（甚至共识签名）可以用 Falcon”，不是反 Falcon | 由 H50、H51 与 [33] 推出 | inferred |
| H53 | OpenZeppelin 的 cairo-pq-verifiers 提供 Falcon-512（三种 hash-to-point）、ML-DSA-44、Poseidon-WOTS 验证器和可部署账户，README 标“Experimental and unaudited” | [33] README 与目录结构 | observed |
| H54 | a16z 主张：递归复杂易出错，每一步都在证明用于 Fiat-Shamir 的那个哈希，因此“security … can’t be established even in the random oracle model” | [1] “A simpler design space” 节 | observed |
| H55 | 学界承认递归 STARK 的安全分析需要把随机预言实例化（启发式步骤），只有理想化模型下的启发式证据；作者之一来自 StarkWare | [37] 摘要与引言 | observed |
| H56 | Aerie 只在经典 ROM 下证明知识可靠性，没有给出 QROM 证明 | [2] 摘要 | observed |
| H57 | 截至 2026-10-20，没检索到 EF / leanVM 团队（Coratger、Wambsgans、Drake、Vitalik）对 a16z 递归安全论点的直接回应 | [43] 时间线检索；ethresear.ch / Magicians 检索没有结果 | observed |
| H58 | a16z 称证明哈希一般比原生计算多 100 倍以上开销；leanVM 的 Flock 约 48.6 万次 BLAKE2s 压缩/秒（16 核），而原生单核约 700 万次/秒，按核平摊同为两个数量级 | [1]；[6] hashing 节；[26] Performance summary；比值为推算 | inferred |
| H59 | Poseidon2 的 round-skipping 攻击侵蚀了安全余量，但不破推荐参数，Poseidon Initiative 因此转向 Poseidon1 | [39] 幻灯片第 6 页 | observed |
| H60 | 在 Ethereum Poseidon Initiative 设定（KoalaBear，t=24，α=3）下，Poseidon 的 CICO-1 问题被实验求解到 28/31 轮 | [40] 摘要 | observed |
| H61 | “小域 Poseidon 被攻破”应收窄为“缩减轮数攻击 + 安全余量被侵蚀”；Ethereum 已转向不依赖电路友好哈希的二进制域方案 | 由 H59、H60、H17、H46 推出 | inferred |
| H62 | EF 研究员 asanso 的 Daisugi v0.3 用 LeanSPHINCS + LeanVM 把 20 个交易签名聚合成一个 proof（2026-10-15） | [42] 推文 | observed |
| H63 | leanXMSS 与 leanSPHINCS 曾从同一个种子派生出重合的一次性密钥，10-17 的 commit 加了域分离；说明 lean 系列签名仍在早期迭代 | [7] commit message “Domain-separate the seeds” | observed |

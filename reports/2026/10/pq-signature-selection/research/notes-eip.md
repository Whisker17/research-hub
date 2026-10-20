# notes-eip：EIP-8288 / 8141 / 预编译之争，对前两篇的修订与 Mantle 含义

> 本路：E。台账前缀 E。资料截止 2026-10-20，所有网页访问日期均为 2026-10-20（另注者除外）。
> 外部调研（GPT）只作线索，下面每个论断都追到了一手来源；追不到的标为 speculative。

---

## E-Q1 EIP-8288 规范逐节读

### 答案
EIP-8288（标题 “In-mempool signature and proof aggregation”，作者 Vitalik Buterin、Thomas Coratger，created 2026-06-03，status **Draft**，requires 2718、8141）在 EIP-8141 上新增 `mode = 4` 的“依赖验证帧”。交易在帧里声明 `(scheme, data_hash, verification_key_hash)` 三元组（每个 96 字节），**不在 EVM 里执行验签**；区块头新增 `recursive_stark` 字段，区块有效的前提是这份递归 STARK 证明了全区块所有依赖都成立。当前只接受 leanSPHINCS（`0x10`）；leanSTARK（`0x11`）是预留值，使用它的帧目前无效；`AGGREGATED_VK`、`DEPS_HASH` 仍是 TBD，参考实现也是 TBD [1][2]。

### 依据（按规范各节）
**版本**：GitHub `ethereum/EIPs` 上 `EIPS/eip-8288.md` 的最新提交是 `72ca2dd`（2026-10-15，“let a zero data_hash stand for the transaction signature hash”）。此前几次关键修改 [2]：
- `7604300`（2026-10-15）：mode 1 wrapper 也必须检查依赖并集；
- `00afdc8`（2026-10-07）：`DEP_VERIFY_FRAME_MODE` 改为 4；
- `c2fb476`（10-07）：规定依赖帧也要有 receipt；
- `bc2d97c`（10-07）：依赖帧不能放进 atomic batch；
- `877f038`（10-07）：`block_deps_hash` 绑定到聚合电路的摘要；
- `9ee171b`（10-07）：`recursive_stark_gas` 记到交易头上。

**常量** [1]：

| 常量 | 值 |
|---|---|
| `DEP_VERIFY_FRAME_MODE` | 4 |
| `MAX_DEPENDENCIES_PER_FRAME` | 256 |
| `LEANSPHINCS_SCHEME` / `LEANSTARK_SCHEME` | `0x10` / `0x11` |
| `LEANSPHINCS_VERIFICATION_GAS` / `LEANSTARK_VERIFICATION_GAS` | 3,000 / 30,000 |
| `AGGREGATED_VK`、`DEPS_HASH` | TBD |
| `AGGREGATION_INTERVAL` | 1,000 ms |
| `MAX_SIGS_PER_TX` / `MAX_STARKS_PER_TX` | 16 / 1 |
| `MAX_LEANSIG_DEPS_PER_WRAPPER` / `MAX_LEANSTARK_DEPS_PER_WRAPPER` | 16 / 1 |

**依赖帧** [1]：
- **编码**：`data` 是 `96·k` 字节，每组为 `scheme`（31 个零字节 + 1 字节方案号）‖ `data_hash` ‖ `verification_key_hash`。
  - leanSPHINCS：`data_hash` 是消息哈希；`verification_key_hash` 直接放 32 字节公钥 `root(16) ‖ public parameter(16)`，不再哈希一次。
  - leanSTARK：`data_hash` 是 `pub_input_hash`，`verification_key_hash` 是 `vk_hash`。
- **约束**：
  - `target` 必须为 None（不是零地址），`value = 0`，`flags = 0`，不能属于 atomic batch；
  - `limits.execution` 必须等于逐项 gas 之和，`limits.state = 0`；
  - 依赖条数在 1 到 256 之间；
  - 使用 `LEANSTARK_SCHEME` 的帧“invalid until `get_deps_hash` is defined for it”。
- **receipt**：`status = 1`，`gas_used.execution = limits.execution`，没有日志。

**哨兵值** [1]：`dependencies(tx)` 把 `data_hash == 0^32` 替换成 EIP-8141 的 `compute_sig_hash(tx)`。原因是交易无法在帧里写入自己的签名哈希，因为签名哈希本身覆盖了帧数据。帧的原始字节保持为零，`FRAMEDATACOPY` 读出来的也是零。交易内与区块内的依赖都要先去重、再排序。

**合约可见性** [1][3]：合约通过 8141 的内省指令读取依赖：
- `FRAMEPARAM(0x02,i)` 取 mode；
- `FRAMEPARAM(0x04,i)` 取 `len(data)`；
- `FRAMEDATACOPY` 复制三元组。

8141 中 `FRAMEPARAM` 的操作码是 `0xb3`。

**区块有效性** [1]：
1. 区块头新增 `recursive_stark = [stark_proof, block_deps_hash]`，其中 `block_deps_hash = get_deps_hash(dependencies(block))`。
2. `get_deps_hash` 对 `data_hash ‖ verification_key_hash` 的拼接做 `DEPS_HASH`。目前只为 leanSPHINCS 定义；当前工具链用 BLAKE2s，BLAKE3 是首选替代。
3. 三条有效性规则：
   - 头里的摘要等于节点从交易重算的结果；
   - 依赖非空时，STARK 对 `AGGREGATED_VK` 验证通过（依赖为空时证明也为空）；
   - 所有交易满足常规 8141 规则。
4. 证明本身不携带依赖与公钥，验证者从区块里重算。

**递归电路** [1]：
- 公开输入为 `[deps_hash, AGGREGATED_VK]`；
- 逻辑是“验证直接依赖 → 验证子递归证明并并入其依赖 → 删除 discards → 去重排序 → 比对 deps_hash”；
- 电路不理解交易与区块，只遍历平铺的三元组；
- 规范假设验证器统一改写成 `verify(msg, hash(pub), (pub, sig))`，把完整公钥或 VK 放进见证。

**mempool wrapper** [1]：
- 格式为 `[transactions, mode, content]`：
  - mode 0 携带 `[deps, proofs]`（逐条原始签名或 STARK）；
  - mode 1 携带 `[deps, recursive_stark]`。
- 两种模式都要检查 `deps` 等于各交易依赖的去重排序并集。mode 1 的这条检查是 2026-10-15 才写明的 [2][4]。
- 每个 `AGGREGATION_INTERVAL`，节点广播一个 mode 1 wrapper，覆盖当前全部活跃交易；之前已发送的交易只发哈希。
- 证明预算不够时的优先级：自己上一轮的聚合 → 需要删除的项 → 他人聚合（按新增交易数）→ 用户交易（按小费）。
- 只有 leanSPHINCS 时，“naively concatenating … may be more space-efficient up to about a hundred leanSPHINCS signatures”。

**builder** [1]：
1. 从 FOCIL 和 mempool wrapper 收集依赖与证明；
2. 决定要打包的交易；
3. 取并集，删掉未入块交易的依赖；
4. 重新递归包一层；
5. 把结果写进 `recursive_stark`。

规范强调：mempool 节点、FOCIL 生成者、builder 做的是“exactly the same task”。

**gas** [1]：
- 依赖帧的执行 gas 为每个 leanSPHINCS 依赖 3,000、每个 leanSTARK 依赖 30,000；
- 另外每个声明（重复也算）都加 `LEANSTARK_VERIFICATION_GAS × 声明数`（即每条 30,000）到 intrinsic gas；
- 因此一个 leanSPHINCS 依赖合计 33,000 gas，一个 leanSTARK 依赖合计 60,000 gas，此外还有 96 字节的帧数据费和 8141 的每帧 475 gas；
- 即使交易回滚也全额收取。

规范说这个价格代表“expected cost”：STARK 实际由 builder 与 mempool 验证，而不是所有验证节点逐条验证。

**安全假设** [1]：
1. Lean Ethereum 电路的可靠性；
2. `DEPS_HASH` 的可靠性；
3. 递归 STARK 的可靠性。规范承认后者“adds difficulty to end-to-end formally proving”，并且用户提交的 STARK VK 由用户决定，递归深度可能不受限。

**与 8141、8292 的关系** [1][3][18]：
- 8288 只是给 8141 增加一个 mode。8141 规范写明有效 mode 只有 0 DEFAULT、1 VERIFY、2 SENDER，“An EIP that extends frame transactions with a new mode adds its value to this set”。
- 8141 自己另有一个 `signatures` 列表，scheme 目前为 ARBITRARY / SECP256K1 / P256，0x3–255 保留。协议验证的签名原始字节“intentionally not introspectable … to allow future aggregation schemes”。也就是说，8141 预留了另一条聚合钩子，8288 没有用它。
- EIP-8292 是共识层聚合者角色，规范原文为 “The execution layer is unchanged by this EIP”。8288 称同一个 STARK 后端可以同时服务共识层签名聚合与执行层依赖验证。

### Alice→Bob 的 PQ 转账（只依据规范；对应规范 Test Case 1）
1. **钱包**：Alice 的账户是 8141 下 `sender` 处有代码的账户，存储里放着她的 leanSPHINCS 公钥。钱包构造三帧：
   - 帧 0：`mode=4`，target None，`data = (0x00…10, 0^32, pk)`，`limits.execution = 3000`；
   - 帧 1：`VERIFY`，target 为 sender，账户代码用 `FRAMEPARAM` 找到 mode 4 的帧，用 `FRAMEDATACOPY` 读出三元组，检查 scheme 为 `0x10`、`data_hash` 为零（代表“本交易签名哈希”）、`vk` 等于存储里的公钥，然后调用 `APPROVE(APPROVE_EXECUTION_AND_PAYMENT)`；
   - 帧 2：`SENDER`，target 为 Bob，value 为转账额。

   帧 0 存的是零，因此不存在自引用。钱包算出 `compute_sig_hash(tx)` 并用 leanSPHINCS 签名 [1][3]。
2. **mempool（首跳）**：钱包发出 mode 0 wrapper，内容是 `[[tx], 0, [[(0x10, sighash, pk)], [sig]]]`。收到的节点检查：
   - `deps` 等于重算并集；
   - leanSPHINCS 依赖数不超过 16；
   - 逐条验签；
   - 常规 8141 验证前缀 [1]。
3. **mempool（之后各跳）**：每 1,000 ms，节点把 Alice 的交易和其他有效交易并入一个 mode 1 wrapper，只附一个递归 STARK。从这一跳开始，Alice 的签名不再传播 [1]。
4. **builder**：收齐 wrapper 与 FOCIL，选定交易，删除未入块交易的依赖，生成新的递归 STARK，写入区块头的 `recursive_stark` [1]。
5. **验证节点**：
   - 从区块交易重算 `dependencies(block)`（把零替换成各交易的 sighash），算 `get_deps_hash`，与头部比对；
   - 用固定的 `AGGREGATED_VK` 验证 STARK；
   - 再执行交易：帧 0 只产生一个 receipt，帧 1 做账户授权检查，帧 2 完成转账。

   验证节点从头到尾看不到 Alice 的原始签名 [1]。

### 不确定之处
- `AGGREGATED_VK`、`DEPS_HASH`、leanSTARK 的 `get_deps_hash`、参考实现都还是 TBD [1]。
- 规范的 Gas 一节仍写着 “current design (KoalaBear field, fixed trace width) … `2**24` trace length limit”，而 leanVM 当前 README 已改为二进制域，KoalaBear 被归入历史分支 [19]。规范与实现的口径不一致。
- 依赖帧在 8141 mempool “validation prefix” 规则里应该放在哪个位置，8288 没有写明，Test Case 1 只是把它放在 VERIFY 帧之前。
- `AGGREGATION_INTERVAL` 在规范里是 1,000 ms，Vitalik 的 ethresear.ch 帖与推文用的是 “eg. 500ms” [8][9]。

---

## E-Q2 Vitalik 的“最终形态非 precompile”

### 答案
**原话**：2026-10-19，Vitalik 回复 @lex_node。lex_node 的原话是 “could still ultimately do Lattice stuff … through a precompile if it is proved to be AI-secure”。Vitalik 回复：“The ideal route to support everyone's cryptography is imo through 8288 … make whatever signature you want locally, then STARK it … Don't need any calldata onchain. Ethereum can then never add a new precompile again.”[5][6]

**理由**：在 Magicians 讨论帖里，被问到“是否考虑格签名”时，他答：“We want to be minimalistic with dependencies, and have a strong preference to keep the base layer purely hash-based … It also means we have to maintain less total infrastructure.”[4]

**当前草案能否做到**：做不到。用户自选签名再“STARK it”，要走 leanSTARK 依赖，而 `0x11` 当前无效。VK 也没有注册机制，由账户合约自己认定接受哪个 `vk_hash`。用于定义语句的 ISA 也未定：Vitalik 称 RISC-V 是首选，leanVM 目前用 leanISA，计划迁到 rv64im [1][8][19]。

### 依据
- **推文原文与时间**：
  - Vitalik：2026-10-19 02:56 UTC [5]；
  - lex_node：2026-10-18 14:11 UTC，他把 a16z 的格路线称作 alt-L1 的“narrative edge”[6]；
  - Eli：2026-10-18 10:51 UTC，“Strong disagree … module SIS … only around since 2012 … waiting another 3-5 years”[7]。
- **Magicians 帖 28723**（访问 2026-10-20 时共 13 楼）[4]：
  - Vitalik 只有两次发言：1 楼（2026-06-05）给出动机，原话是 “supports signatures and STARKs (for privacy or for eg. L2s)”；5 楼（2026-06-15）回复 albert_g 的格签名问题，即上面的“纯哈希”原话；
  - 其余为社区讨论：
    - omission accountability：pipavlo82、OBA Research 认为应在 8288 之外另做“hash-only receipt”；
    - narrow-waist 架构：KBryan；
    - Chugar 在 2026-09-10 报告，在 leanVM 递归中把任意 leanSTARK 程序绑定到 VK 承诺的原型已通过，并指出候选 `AGGREGATED_VK` 取决于“single self-recursive 8288 guest”的稳定身份；
    - Chugar 在 2026-09-20 指出 mode 1 缺少并集检查，该问题在 10-15 的提交 `7604300` 中修正 [2]；
    - ArikG 在 2026-10-19 提出用 STARK 聚合器继续使用 ECDSA/EdDSA 签名、作为“partially PQ secure”过渡（Hybrid Provable Signing 草稿）。
- **Vitalik 2026-09-09 推文**“A note on recursive STARK mempools (EIP-8288)”[8]：
  - 希望把 8288 放进 “I-star (the fork after Hegota)”；
  - SPHINCS- 签名约 3 kB，不必上链；
  - 原话 “Whatever you use (Falcon, ML-DSA … isogeny-based …), you can just wrap it client-side in a STARK, onchain gas cost low tens of thousands … Hopefully, Ethereum will never need ‘please support my favorite cryptographic algo’ politics again”；
  - 每节点每 tick 外发一个 STARK（约 100–300 kB）；
  - 链上开销为“one STARK (100-300 kB), plus 96 bytes for each statement”；
  - 需要约定 ISA，“leading candidate is RISC-V”。
- **前身研究帖**（Vitalik，ethresear.ch，2026-01-12，“Recursive-STARK-based bandwidth-efficient mempool”）[9]：
  - STARK 即使极致压缩也要 128 kB；
  - 每 tick（例如 500 ms）递归一次；
  - 8 个 peer 时每节点额外带宽约 128 kB × 8 / 0.5 s = 2 MB/s，且与对象数量无关。
- **规范自述** [1]：“Users who want to use quantum-resistant signature schemes other than leanSPHINCS signatures will have to either use them in the clear, and accept the onchain gas costs of doing so, or wrap them client-side in a STARK, and then reuse the leanSTARK route.”
- **成本与 UX 的现有数据**：
  - 规范：“STARKs all take over 128 kB, or as much as 512 kB if fast generation is a goal (which it is client-side)”[1]；
  - leanVM @3a37fb6，M4 Max（12P + 4E 核，48 GB，未用 GPU）[19]：
    - 聚合 850 个 leanSPHINCS：1.0 s，峰值内存 16.1 GiB，证明 325.8 KiB，验证 5.1 ms；
    - 2→1 递归：0.29 s，14.7 GiB，201.5 KiB；
    - 约 213 万周期的 Fibonacci：0.34 s，5.2 GiB。
  - 在 leanVM 里证明一次 Falcon / ML-DSA 验签要多少周期，或在手机上要多久，**没有找到公开基准**。

### 不确定之处
- “Don't need any calldata onchain”指的是签名不上链。按规范，每个依赖仍有 96 字节帧数据，区块头还要放一个 100–300 kB 的 STARK [1][8]。
- 手机端本地生成 STARK 是否可行，没有一手基准（speculative）。
- 一个依赖对应一个用户 STARK，mode 0 的 wrapper 最多带 1 个 leanSTARK，所以首跳带宽是每笔交易 128–512 kB（由规范常量推出）。
- 把 Falcon 包进 STARK 后，安全性仍然依赖 Falcon 的不可伪造性，外加 STARK 的可靠性（inferred）。

---

## E-Q3 PQ 验签预编译路线的现状，以及与 8288 的对比

### 答案
各 PQ 验签预编译提案目前都是 **Draft**，没有任何一个排进 Hegotá：
- EIP-8355（ML-DSA，作者 Danno Ferrin）被 EF Protocol 评为 C 档，评语是 “premature standardization”；随后在 EIP-8081 中列为 **Declined for Inclusion**；
- EIP-7885 / 8051 / 8052 不在 8081 的任何一栏 [10][11][13]。

EIP-8141 是 Hegotá 的 SFI，也是 EF 分级中的 S 档执行层主打项。ethereum.org 预计 Hegotá 在 2027 Q2 上主网。8288 不在 8081 的任何一栏，作者 Vitalik 希望进入 I* [8][10][11][22]。

### 依据
**预编译提案逐个看** [13][14][15][16]：

| EIP | 内容 | 地址 | gas | 状态 / 日期 |
|---|---|---|---|---|
| 8355 | ML-DSA-44/65/87 三个预编译；输入为 `pk ‖ sig ‖ message`，消息变长、放在末尾；空上下文；返回 32 字节；从不 revert | 0x12 / 0x13 / 0x14 | 基础 6,500 / 9,000 / 13,500，每个消息字另加 6 | created 2026-07-30；合入 2026-09-01 |
| 8051 | ML-DSA-44 与 ML-DSA-ETH（Keccak PRNG、NTT 域公钥）；requires EIP-7932 | 0x12 / 0x13 | 各 4,500 | created 2025-10-15 |
| 8052 | Falcon-512：两个 HashToPoint（SHAKE256 / Keccak-PRNG）+ `FALCON_CORE` | “TBD by ACD”，并明确避开 `0x0100–0x01FF` RIP 区间 | — | created 2025-10-17 |
| 7885 | NTT_FW / NTT_INV / VECMULMOD / VECADDMOD | TBD | NTT 各 600 | created 2025-02-12 |

**EF 的分级与理由** [11][12]：
- **8355**：C 档，均分 1，9 个评分，评语 “Enshrines a specific PQ verification scheme ahead of a dedicated cryptographic adjudication: premature standardization”。8081 在 ACDC 189 之后（提交 `6e69e49`，2026-10-19）把它列为 Declined [10]。
- **8141**：S 档，评语 “a path to PQ signature schemes without a fork per scheme, aggregation so PQ verification can be priced, and a route to retiring k1 keys”。
- **8151 / 8298**：A 档的“k1-retirement package”，在 8081 中为 CFI。
- priorities 博客：“native account abstraction lets signature schemes be swapped without a hard fork per scheme”。

**Hegotá 进度** [10][22][23]：
- 8081 中 SFI 只有 EIP-7805（FOCIL）与 EIP-8141；
- ethereum.org Hegotá 页（2026-10-02 更新）写 “Expected on mainnet Q2 2027 · Date not yet confirmed”；
- execution-specs 在 2026-10-09 发布 `tests-bogota-devnet@v1.0.0`，覆盖 8141 + 8250 + 8272 + 7906。

**8081 激活表的异常** [10][28]：8081 当前的激活表写着 Sepolia 2026-10-06、Hoodi 2026-10-26。这两个日期与 EtherWorld 对 ACDE #247 报道里 **Glamsterdam** 的 Sepolia / Hoodi 日期完全一致，也与 ethereum.org “Hegotá 2027”矛盾。很可能是编辑错误，**不能当作 Hegotá 的日期**。

### 预编译路线 vs 8288 路线

| 维度 | PQ 验签预编译（8355/8051/8052） | EIP-8288 依赖帧 + 区块递归 STARK |
|---|---|---|
| 谁承担验证 | 每个全节点在 EVM 里逐笔验签 | 首跳 mempool 与 builder 验原始签名；所有验证节点只验每块一个 STARK（leanVM 实测约 5 ms）[1][19] |
| 链上数据 | 每笔带 pk + sig（ML-DSA-65 为 5,261 B；Falcon-512 签名 666 B + 公钥 897 B） | 每个依赖 96 B，加上每块一个 100–300 kB 的 STARK [1][8] |
| 执行 gas（不含数据） | 8355 的 ML-DSA-65 约 9,000；8051 为 4,500 | leanSPHINCS 每个依赖 33,000；leanSTARK 每个依赖 60,000 [1] |
| 算法敏捷性 | 每加一种算法要一次硬分叉，属于 EF 所说的“algo politics” | leanSPHINCS 原生支持；其他算法走 leanSTARK（尚未定义），不需要改 EVM；但改 `AGGREGATED_VK` 或 ISA 仍要分叉 [1][8] |
| 客户端维护 | 每种算法都要在每个客户端里做共识级实现 | 一个 leanVM 验证器加递归电路；但 mempool 节点与 builder 要承担重型证明（每次聚合 16 GiB 量级）[19] |
| 成熟度 | Draft；8355 被拒；其余未进 Hegotá 任何列表 | Draft；不在 Hegotá；参考实现 TBD；leanVM 自述 “not (yet) production ready” [1][19] |
| 对 L2 的可移植性 | 高：L2 可以自加预编译，有 RIP-7212 的先例 | 低：依赖 8141、区块头字段、聚合基础设施，L2 的派生与证明都要改（见 E-Q5） |
| 安全假设 | 只依赖所选签名方案本身 | leanSPHINCS 加 leanVM STARK 与递归的可靠性，再加 `DEPS_HASH`；走 leanSTARK 路线时还要加上用户方案的假设 [1] |

### 不确定之处
- 表中 8288 的 gas 是草案参数，规范自己就讨论了改为按证明大小计价的可能 [1]。
- 预编译一侧，实际交易中数据费远大于验签 gas。按 8141 引用的 EIP-7976 参数，非零字节 16 gas，5,261 B 约 84k gas，触发 floor 时更高。这是 inferred，未实测。
- 8288 何时进入哪个分叉，只有作者的期望（I*），没有 ACD 决定。

---

## E-Q4 对前两篇报告的修订

### 答案
第二篇的近期方案（合约 AA + 自定义 ML-DSA 验签预编译 + 版本化适配器）作为**近期容灾工具**仍然成立，但要改四处：
1. 定位：预编译是过渡手段，不是终局；
2. 事实：8355 的接口与地址描述有误；
3. 地址空间：`0x0100+` 是 RIP 共享区间，不是 Mantle 专有；
4. 时间线：L1 原生 AA 不是 2028–29，而是 8141 已排进 2027 Q2 的 Hegotá。

第一篇对 Ethereum 路线的大框架没有被推翻。要补充的有三点：8288 进入作者的 I* 计划；leanVM 已换成二进制域架构；8288 不能直接用来聚合 Mantle 的 SP1 证明。

### 依据与修订清单（原说法 → 现在的判断 → 依据）

| # | 原说法（出处） | 现在的判断 | 依据 |
|---|---|---|---|
| R1 | 第二篇：Mantle 首期在 op-geth + Kona 同步引入独立的 ML-DSA-65 预编译 | **保留**，但改为“近期容灾 / 过渡工具”。EF 认为 L1 上的同类做法“premature standardization”；Vitalik 的终局是“never add a new precompile again”。L2 加预编译不受 L1 分级约束，但应预期 L1 不会提供同名标准接口 | [5][11][10] |
| R2 | 第二篇：借鉴 EIP-8355 接口，“message (32 B digest)” | **事实错误**。8355 的消息是末尾变长字节，按 FIPS 204 对原始消息验证，ctx 为空；它批评 8051 把消息固定为 32 字节预哈希。ML-DSA-65 基础 gas 9,000 + 每字 6。8355 在 8081 中已为 Declined | [13][10] |
| R3 | 第二篇：放在 `>0x0100`（例如 `0x0101`）的“专有扩展命名空间”，可以“彻底隔离” | **需修订**。EIP-7587（Final）把 `0x0100–0x01ff` 保留给 RIP 流程，RIP-7212 的 P256 就在 `0x100`。Mantle 自用 `0x0101` 可能与未来的 RIP 分配冲突，应当走 RIP 注册，或先核对 RIP 注册表再选地址。8052 也明确避开这个区间 | [17][15] |
| R4 | 第二篇台账 #47：以太坊 Native AA 预计 2028–2029 年前难以定稿（speculative） | **过时**，并与第一篇自相矛盾。8141 是 Hegotá 的 SFI 与 S 档主打项，ethereum.org 预计 2027 Q2 上主网，frames 与 bogota devnet 测试已在进行 | [10][11][22][23] |
| R5 | 第二篇：版本化适配器 `PQVerifierAdapterV1` 屏蔽预编译地址 | **保留并扩展**：抽象对象应从“预编译地址”扩大到“验证后端”。后端可以是预编译、SP1 内验证，或将来 8288 式依赖内省（`FRAMEPARAM` / `FRAMEDATACOPY` 检查依赖三元组）。注意 8288 只对 8141 帧交易有效，ERC-4337 合约账户不能直接声明依赖帧 | [1][3]；inferred |
| R6 | 第二篇：Falcon-512 只作紧凑对照，待 FIPS 206 定稿 | **补充**：另设 Falcon 实验线。Aerie 给出了 Falcon 批量证明的数据；EIP-8052 是 Falcon 预编译草案；Vitalik 的 8288 路线也允许 Falcon“STARK it”。三条路都需要 Mantle 自己测 SP1 内的成本 | [15][20][8] |
| R7 | 第二篇：初期在 Kona 里用纯 Rust 验签，不定制 SP1 电路 | **保留**。要补的是：如果将来改走 8288 式聚合，SP1 要证明的就从“N 次验签”变成“验证一个 leanVM（二进制域 WHIR + BLAKE2s）STARK”，成本未知，需要基准 | [19]；speculative |
| R8 | 第一篇 F16 / X14：Mantle 证明路径需要“L1 侧聚合（如 EIP-8288）” | **需加限定**。8288 能聚合的是 leanSPHINCS 签名与 leanSTARK（尚未定义）。Mantle 的 SP1 证明不是 leanSTARK，不能直接作为依赖。只有 L2 证明本身用规范 ISA 写成 leanSTARK、并且 `0x11` 定义完成之后，“L2 证明经 8288 聚合”才可行 | [1][4] |
| R9 | 第一篇 F11 / E 部分：PQ 预编译未排期，8355 被拒；leanVM “not production ready”，哈希未定 | **仍成立**，补充三点：① 8355 先在 EF 分级中得 C，后在 8081 中为 DFI；② leanVM @3a37fb6 已改为 192 位二进制域、WHIR、Flock，BLAKE2s 是占位哈希，计划迁到 RISC-V rv64im，KoalaBear + Poseidon 成为历史分支；③ leanSPHINCS 聚合 850/s | [10][11][19] |
| R10 | 第一篇时间线：I* 占位“PQ 公钥注册、leanSPHINCS 交易” | **补充**：Vitalik 公开希望 8288 进入 I*；这只是作者期望，8081 没有任何记录 | [8][10] |
| R11 | 第二篇：推荐 ERC-4337 机构账户，“待 L1 标准定稿后平滑迁移” | **补充**：OP Stack 的原生 AA 方向不确定（见 E-Q5）：Base 先宣布 EIP-8130，后改为 EIP-8430（Everest，日期 TBD）。迁移目标可能是 8141，也可能是 OP Stack / Base 的方案，账户设计应同时兼容 | [24][25]；inferred |
| R12 | 第一篇对 Starknet、Algorand 的描述 | 本路未发现推翻它们的新资料，未复查（交给其他分路） | — |

### 不确定之处
- R3：没有逐条核对 RIP 注册表里 `0x0101` 之后的现有分配。
- R7：在 SP1 里验证 leanVM 证明的成本没有任何公开数据。

---

## E-Q5 对 L2（OP Stack / Mantle）的含义

### 答案
8288 式的“区块级聚合证明”能为 L2 省下的是 DA 和 EVM 验签开销。代价是三件事：sequencer 要做重型证明；批次格式和派生规则要改；OP Succinct 证明要覆盖一个新的 STARK 验证。

在单一 sequencer 的 L2 上，“mempool 递归聚合”退化成“sequencer 一次性聚合”。DA 上要每个证明覆盖约 100 个以上的 PQ 签名才划算。

OP Stack 方面没有找到 Optimism 采纳 8141 的公开计划。Base 和 Optimism 曾宣布把 EIP-8130 带到所有 OP Stack 链，后来 Base 把 8130 移出 Cobalt，改推 EIP-8430（Everest，日期 TBD）。L2 先行采用 8288 式设计，近期并不现实：8141、leanVM、`AGGREGATED_VK` 都还没就绪。

### 依据
- **盈亏平衡点** [1][8][19]：
  - 规范自己写到，只有 leanSPHINCS 时，直接拼接签名在约 100 个以内更省空间；
  - leanSPHINCS 签名约 3 kB（Vitalik），leanVM 聚合证明约 318–326 KiB；
  - 由此推出：每个证明要覆盖大约 100 个以上签名，DA 才会减少（inferred）。
- **Falcon 场景的旁证** [27]：Sanso、Thiery、Wagner 在 ethresear.ch 上测算，Falcon 用 LaBRADOR 聚合时，约 N≈200 笔才比“key-recovery、不聚合”更省；在约 250 笔 / 块时只省一点。他们的结论是“Case 1 … could be a practical sweet spot”。
- **sequencer 即 builder** [1]：规范说 builder 的任务和 mempool 节点“exactly the same”，FOCIL 与公开 mempool 是这个设计的前提。Mantle 的交易直接发给 sequencer，因此没有多跳递归，只剩 sequencer 单点证明。证明时间（leanVM 每次聚合约 1 s、峰值约 16 GiB）直接进入出块延迟（inferred）。
- **派生与 DA** [1]：8288 把证明放在区块头。OP Stack 的 L2 区块从 L1 上的 batch 派生，所以要么把证明写进 batch（增加 DA），要么不发布证明、让全节点信任 sequencer，再由 OP Succinct 的有效性证明兜底（inferred）。后一种做法下，原始签名和聚合证明都不上 DA，任何人都无法独立复验单笔授权，只能依赖 SP1 证明（speculative）。
- **OP Succinct** [1][19]：Kona 在 SP1 里要么验证 leanVM STARK（RISC-V 中验证二进制域 WHIR + BLAKE2s），要么逐笔验原始签名（这要求签名在 DA 上）。两种成本都没有公开数据（speculative）。
- **OP Stack 的 AA 路线** [24][25][26]：
  - Base 博客：“partnering with Optimism, Coinbase, and WalletConnect to bring Native Account Abstraction (EIP-8130) … launch on Base, as part of the Cobalt upgrade coming this September, and on all OP Stack chains later this year”，并把“Quantum Ready”列为卖点；
  - Base 文档当前显示：Cobalt 于 2026-09-30 在主网激活，特性列表**不含** 8130；新的 Everest 引入 “Base Transactions (EIP-8430)”，日期 TBD；
  - EIP-8130 的 L2 profile 允许“the set MAY be extended as new algorithms are adopted (e.g., post-quantum) through the companion ERC process and node configuration”。
- **以太坊 L1 PQ 交易进入 OP Stack 的时点** [3][10]：8141 是 Hegotá 的 SFI。OP Stack 过去能在 L1 分叉后很快跟进（例如 Isthmus 跟 Pectra），所以 8141 进入 OP Stack 最早也要在 Hegotá 之后（inferred）。Mantle 不在 superchain-registry 中，要自己决定是否跟进（第一篇 M37/M40）。

### 对 Mantle 的推论（标注类型）
- **inferred**：近期最划算的 PQ 授权路径仍是“合约账户 + 原始签名 + 预编译 / SP1 内验签”。8288 式聚合只有在 PQ 交易量达到每批次数百笔时才在 DA 上划算。
- **speculative**：Mantle 可以研究“批次级聚合”：sequencer 每个 L1 batch（覆盖多个 L2 块）生成一个 leanVM 或 SP1 证明，替代逐笔签名的 DA；这需要自定义派生规则和证明逻辑。
- **inferred**：账户层应当准备一个“依赖内省后端”。如果 Mantle 跟进 8141，验证逻辑可以从“调用预编译”切换为“检查依赖帧”，不必迁移账户。

### 不确定之处
- 没有找到 Optimism 官方对 8141 或 8288 的表态。“8130 进入所有 OP Stack 链”目前只有 Base 的博客为证，Optimism 一侧没有一手资料。Base 已转向 8430，这项承诺的现状不明。
- Mantle 的 PQ 交易量没有任何预测，盈亏平衡点只是量级估算。

---

## 对外部调研（GPT）的修正

1. **gas 口径**：GPT 写“每个 leanSPHINCS 依赖 3,000 gas … 另外每个声明元组 30,000 intrinsic gas”。数字对，但要补三点：
   - 合计每个 leanSPHINCS 依赖 33,000，每个 leanSTARK 依赖 60,000；
   - 交易回滚也全额收；
   - 重复声明重复收费 [1]。
2. **漏了区块头里的证明体积**：GPT 说“8288 省掉的是重复密码学工作”，但没有提区块头要放一个 100–300 kB 的 STARK [1][8]。Vitalik 说的“不需要 calldata”指的是签名不上链，不是零开销。
3. **漏了 mode 1 并集检查的修订**：GPT 写 \(D_{proof}=D_{included}\)。这条约束对区块成立，但 mode 1 wrapper 的并集检查是 2026-10-15（提交 `7604300`）才补上的，此前社区指出过漏洞 [2][4]。
4. **漏了作者对分叉时点的期望**：GPT 没有提 Vitalik 2026-09-09 公开的 “I-star” 期望，也没有提 ISA（RISC-V）问题 [8]；只说“当前仍是 Draft”。
5. **漏了 8141 自带的聚合钩子**：GPT 没有提 8141 的 `signatures` 列表。其中协议验证的签名原始字节“不可内省，以便将来聚合”，是与依赖帧并列的另一条聚合钩子 [3]。
6. **预编译现状**：GPT 只把 7885 / 8051 / 8052 / 8355 当作“PQ 验签预编译”一并提到，没有区分状态。应写明：8355 先被 EF 评为 C 档（premature standardization），后在 8081 中为 Declined；其余不在 Hegotá 任何列表 [10][11]。
7. **Mantle 地址**：GPT 本身没有犯错，但它沿用的第二篇方案有 `0x0100+` 地址的问题，见 R3 [17]。
8. **leanVM 基准**：GPT 引用 “1,362 XMSS 签名/秒”，与当前 README 一致。但 8288 用的是 leanSPHINCS，对应数字是 850/s、325.8 KiB、16.1 GiB [19]。GPT 没有区分这两种签名的口径。
9. **资料边界**：GPT 没抓到 X 原帖。本路用 fxtwitter API 拿到了 Vitalik、lex_node、Eli、a16z 推文的原文与 UTC 时间 [5][6][7][21]。

---

## 来源

1. **PRIMARY** EIP-8288 原文，`ethereum/EIPs` `EIPS/eip-8288.md` @ `72ca2dd7919259a408eaf46aa127adf98cfd4ae3`（2026-10-15）。证明常量、依赖帧、哨兵值、区块头字段、wrapper、builder 流程、gas、安全假设与 TBD 项。https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-8288.md （访问 2026-10-20）
2. **PRIMARY** GitHub API：eip-8288.md 的提交历史。证明各修订的日期与内容，包括 mode 改为 4、mode 1 并集检查、零哨兵。https://api.github.com/repos/ethereum/EIPs/commits?path=EIPS/eip-8288.md （访问 2026-10-20）
3. **PRIMARY** EIP-8141 原文（最新提交 `af3a780`，2026-10-09）。证明 mode 0/1/2、`signatures` 列表与 scheme 表、`compute_sig_hash`、`FRAMEPARAM`（`0xb3`）、`APPROVE` 语义。https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-8141.md （访问 2026-10-20）
4. **PRIMARY** Ethereum Magicians 帖 28723 全部 13 楼（JSON）。证明 Vitalik 的“purely hash-based / less infrastructure”回复，以及社区的 omission、mode 1、任意 leanSTARK 原型、HPS 讨论。https://ethereum-magicians.org/t/28723.json （访问 2026-10-20）
5. **PRIMARY** Vitalik 推文 2026-10-19 02:56 UTC（经 api.fxtwitter.com）。证明“ideal route … through 8288 … never add a new precompile again”的原文。https://x.com/VitalikButerin/status/2112015118418473358
6. **PRIMARY** @lex_node 推文 2026-10-18 14:11 UTC。证明被回复的原话（“through a precompile if it is proved to be AI-secure”）。https://x.com/lex_node/status/2111822591123927371
7. **PRIMARY** Eli Ben-Sasson 推文 2026-10-18 10:51 UTC。证明“module SIS … since 2012 … wait 3-5 years”的原文。https://x.com/EliBenSasson/status/2111772220389245426
8. **PRIMARY** Vitalik 推文 2026-09-09 15:39 UTC “A note on recursive STARK mempools (EIP-8288)”。证明 I* 期望、约 3 kB 签名、100–300 kB STARK、每条语句 96 B、“wrap it client-side in a STARK”、RISC-V ISA。https://x.com/VitalikButerin/status/2097711433073172837
9. **PRIMARY** Vitalik，ethresear.ch “Recursive-STARK-based bandwidth-efficient mempool”（2026-01-12）。证明 128 kB STARK、500 ms tick、2 MB/s 带宽估算。https://ethresear.ch/t/recursive-stark-based-bandwidth-efficient-mempool/23838
10. **PRIMARY** EIP-8081 Hegotá meta @ `6e69e49`（2026-10-19，ACDC 189 决定）。证明 SFI 只有 7805 与 8141；8151、8298 为 CFI；8355 为 Declined；8288、7885、8051、8052 不在任何一栏；激活表的日期疑似错误。https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-8081.md
11. **PRIMARY** EF 博客 “Hegotá EIP tier list”（2026-09-07，9-08 更新）。证明 8141 为 S、8355 为 C 且被评“premature standardization”、8151/8298 为 A 档 k1 退役包。https://blog.ethereum.org/2026/09/07/protocol-hegota-eips
12. **PRIMARY** EF 博客 “Current and Emerging Priorities”（2026-09-07）。证明“signature schemes be swapped without a hard fork per scheme”与 Frames 支持签名聚合的定位。https://blog.ethereum.org/2026/09/07/protocol-priorities
13. **PRIMARY** EIP-8355（Danno Ferrin，created 2026-07-30，首次合入 `54e1f09` 2026-09-01）。证明 0x12–0x14 地址、变长末尾消息、9,000 基础 gas、不 revert。https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-8355.md
14. **PRIMARY** EIP-8051。证明 ML-DSA-44 / ML-DSA-ETH 预编译在 0x12 / 0x13、各 4,500 gas、requires 7932。https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-8051.md
15. **PRIMARY** EIP-8052。证明 Falcon 的三个预编译、地址 “TBD by ACD” 并避开 `0x0100–0x01FF`。https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-8052.md
16. **PRIMARY** EIP-7885。证明 NTT 预编译、地址 TBD、NTT 600 gas。https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-7885.md
17. **PRIMARY** EIP-7587（Final）。证明 `0x0100–0x01ff` 保留给 RIP 流程。https://eips.ethereum.org/EIPS/eip-7587
18. **PRIMARY** EIP-8292（Draft，created 2026-06-07）。证明它是共识层聚合者角色，“The execution layer is unchanged by this EIP”。https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-8292.md
19. **PRIMARY** leanEthereum/leanVM README @ `3a37fb6`（2026-10-18）。证明二进制域、BLAKE2s 占位、计划迁到 RISC-V、未生产就绪，以及 leanSPHINCS 850/s、325.8 KiB、16.1 GiB、5.1 ms 等基准（M4 Max，未用 GPU）。https://github.com/leanEthereum/leanVM
20. **PRIMARY** a16z crypto “Fast post-quantum signature aggregation with lattice SNARKs”（2026-10-16）。证明 Aerie 的立场与数字。全文未提 8288 或预编译；对比的 leanSPHINCS 为约 820/s（@127510d1）。https://a16zcrypto.com/posts/article/fast-post-quantum-signature-aggregation-with-lattice-snarks
21. **PRIMARY** a16z 推文 2026-10-16 23:11 UTC “The case for lattices 👇”。证明触发推文的时间与正文。https://x.com/a16zcrypto/status/2111233645948342778
22. **PRIMARY** ethereum.org Hegotá 页（页面 2026-10-02 更新，经搜索快照）。证明 “Expected on mainnet Q2 2027 · Date not yet confirmed”。https://ethereum.org/roadmap/hegota/
23. **PRIMARY** ethereum/execution-specs Releases：`tests-bogota-devnet@v1.0.0`（2026-10-09）。证明 8141、8250、8272、7906 已进入 devnet 测试。https://github.com/ethereum/execution-specs/releases
24. **PRIMARY** Base 博客 “Native Account Abstraction”。证明 Base 与 Optimism 宣布 EIP-8130、计划“all OP Stack chains later this year”、把“Quantum Ready”列为卖点。https://www.base.org/blog/native-account-abstraction
25. **PRIMARY** Base 文档 Upgrades 页。证明 Cobalt 2026-09-30 在主网激活且特性不含 8130；Everest 引入 EIP-8430，日期 TBD。https://docs.base.org/upgrades/overview
26. **PRIMARY** EIP-8130。证明 L2 profile 可以通过 ERC 与节点配置扩展 PQ authenticator。https://eips.ethereum.org/EIPS/eip-8130
27. **PRIMARY** Sanso、Thiery、Wagner，ethresear.ch “Revisiting Falcon signature aggregation for PQ mempools”（2026，帖 24431）。证明 Falcon 聚合约 N≈200 才划算、在约 250 笔 / 块时收益不大。https://ethresear.ch/t/revisiting-falcon-signature-aggregation-for-pq-mempools/24431
28. EtherWorld “Ethereum Protocol Update: ACDE #247”（2026-10-08，二手）。只用来确认 10-06 / 10-26 是 Glamsterdam 的 Sepolia / Hoodi 日期。https://etherworld.co/ethereum-protocol-update-acde-247/
29. 前两篇报告：`post-quantum-mantle/explainer.md`（F11、F16、时间线）、`pq-in-mantle/explainer.md`（F5、F11、F13–F15）及其台账 #28–#30、#35–#36、#47。修订清单的“原说法”取自这里。
30. ChatGPT Deep Research `research/gpt-pq-signature-selection.md`。只作线索，修正见上一节。

---

## 开放问题
1. `AGGREGATED_VK`、`DEPS_HASH`（BLAKE2s 还是 BLAKE3）、leanSTARK 的 `get_deps_hash`，什么时候定？谁来定（规范作者、leanVM 团队，还是 ACD）？
2. 8288 用的 ISA：现在是 leanISA，Vitalik 说 RISC-V 是首选，leanVM 计划迁到 rv64im。迁移以后，用户已登记的 `vk_hash` 怎么办？
3. 依赖帧在 8141 公共 mempool validation prefix 规则里的位置与上限：`MAX_VERIFY_GAS` 是否把依赖帧的 3,000 / 30,000 计进去？
4. 在手机或硬件钱包上把 Falcon / ML-DSA 验签“STARK 一下”需要多少周期、时间和内存？目前没有基准。
5. 在 SP1 里验证一个 leanVM（二进制域 WHIR）STARK 要多少周期？这决定了 Mantle 能否用“批次级聚合”。
6. Optimism 对 8141、8130、8430 的正式立场；OP Stack 下一次 L1 对齐分叉会不会包含 8141。
7. 8288 会不会在 I* 的 PFI / CFI 列表出现；“leanSPHINCS 交易”与 strawmap 占位分叉的对应关系。
8. EIP-8081 激活表里的 Sepolia / Hoodi 日期是否是误写，需要等后续提交更正。

---

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| E1 | EIP-8288 标题为 “In-mempool signature and proof aggregation”，作者 Vitalik Buterin、Thomas Coratger，created 2026-06-03，status Draft，requires 2718、8141 | [1] 文件头 @72ca2dd | observed |
| E2 | eip-8288.md 的最新提交是 72ca2dd（2026-10-15），内容为零 data_hash 代表交易签名哈希 | [2] commits API | observed |
| E3 | DEP_VERIFY_FRAME_MODE = 4，于 2026-10-07 的提交 00afdc8 改定 | [1] Constants；[2] | observed |
| E4 | 依赖三元组为 scheme(31 个零字节 + 1 字节) ‖ data_hash ‖ verification_key_hash，每个 96 字节，每帧 1–256 个 | [1] “New Frame Mode” | observed |
| E5 | 当前只接受 LEANSPHINCS_SCHEME 0x10；LEANSTARK_SCHEME 0x11 是预留值，使用它的帧在 get_deps_hash 定义前无效 | [1] “Validity constraints” | observed |
| E6 | leanSPHINCS 的 verification_key_hash 字段直接放 32 字节公钥（root16 ‖ param16），不再哈希 | [1] payload encoding | observed |
| E7 | data_hash = 0^32 在 dependencies(tx) 中被替换为 EIP-8141 的 compute_sig_hash(tx)，帧原始字节保持为零 | [1] “Transaction Dependencies” | observed |
| E8 | AGGREGATED_VK、DEPS_HASH 为 TBD，Reference Implementation 为 TBD | [1] Constants、Reference Implementation | observed |
| E9 | 区块头新增 recursive_stark = [stark_proof, block_deps_hash]；节点从交易重算依赖并比对，再用固定的 AGGREGATED_VK 验证 STARK | [1] “Block Validity” | observed |
| E10 | DEPS_HASH 当前工具链用 BLAKE2s，BLAKE3 是首选替代 | [1] Security Considerations | observed |
| E11 | 依赖帧要求 target 为 None、value = 0、flags = 0，不能放进 atomic batch，limits.state = 0 | [1] Validity constraints | observed |
| E12 | 依赖帧不执行代码，receipt 为 status 1、gas_used.execution 等于 limit、没有日志 | [1] Receipt | observed |
| E13 | 每个 leanSPHINCS 依赖执行 gas 3,000，每个 leanSTARK 依赖 30,000；另外每个声明加 30,000 intrinsic gas | [1] Gas Accounting | observed |
| E14 | 由 E13 推出：一个 leanSPHINCS 依赖合计约 33,000 gas，一个 leanSTARK 依赖约 60,000 gas（不含数据费和每帧 475） | 由 E13、[3] FRAME_TX_PER_FRAME_COST 推出 | inferred |
| E15 | 依赖 gas 在交易回滚时仍全额收取，重复声明重复收费 | [1] Gas Accounting | observed |
| E16 | wrapper 分 mode 0（逐条证明）与 mode 1（一个递归 STARK）；两种都要求 deps 等于各交易依赖的去重排序并集；mode 1 的这项检查于 2026-10-15 补入 | [1] Mempool Wrapper；[2] 7604300；[4] Chugar 2026-09-20 帖 | observed |
| E17 | 规范中 AGGREGATION_INTERVAL = 1,000 ms；每笔交易最多 16 个 leanSPHINCS 依赖、1 个 leanSTARK 依赖 | [1] Constants | observed |
| E18 | 规范认为只有 leanSPHINCS 时，直接拼接签名在约 100 个以内比证明更省空间 | [1] Mempool Wrapper | observed |
| E19 | mempool 节点、FOCIL 生成者、builder 的聚合任务完全相同；builder 对实际入块交易重新递归 | [1] Builder Workflow | observed |
| E20 | 8141 只有 mode 0 DEFAULT、1 VERIFY、2 SENDER，新增 mode 由扩展 EIP 加入；合约通过 FRAMEPARAM（0xb3）和 FRAMEDATACOPY 读取依赖 | [3] mode 表、FRAMEPARAM 表；[1] | observed |
| E21 | 8141 自带 signatures 列表（ARBITRARY / SECP256K1 / P256，0x3–255 保留），协议验证的签名原始字节不可内省，以便将来聚合 | [3] “Transaction Signatures” | observed |
| E22 | EIP-8292 是共识层聚合者角色，“The execution layer is unchanged by this EIP” | [18] Specification | observed |
| E23 | 规范的 Gas 一节仍按 KoalaBear 域描述上限，而 leanVM 已改为二进制域，规范与实现口径不一致 | 由 [1] Gas costs 与 [19] note 推出 | inferred |
| E24 | Alice 的 PQ 转账在 8288 下为：钱包三帧（DEP / VERIFY / SENDER）→ 首跳 mode 0 带签名 → 后续跳 mode 1 只带递归 STARK → builder 重新递归写入区块头 → 验证节点只验一个 STARK 后执行 | 由 E7、E9、E16、E19 与 [1] Test Case 1 推出 | inferred |
| E25 | 8288 下验证节点看不到原始签名，签名数据不上链 | [1] stark_proof 不含依赖与公钥；[8] | observed |
| E26 | Vitalik（2026-10-19）：“The ideal route to support everyone's cryptography is imo through 8288 … then STARK it … Ethereum can then never add a new precompile again.” | [5] | observed |
| E27 | 该回复针对 lex_node 的“could still ultimately do Lattice stuff … through a precompile if it is proved to be AI-secure” | [6]；[5] replying_to | observed |
| E28 | Vitalik 在 Magicians 回复格签名问题：“strong preference to keep the base layer purely hash-based … maintain less total infrastructure” | [4] 5 楼（2026-06-15） | observed |
| E29 | Vitalik 希望 8288 进入 “I-star (the fork after Hegota)”，并称 Falcon、ML-DSA 等可以“wrap it client-side in a STARK”，链上成本为低几万 gas | [8] | observed |
| E30 | Vitalik 估计链上开销为“one STARK (100-300 kB), plus 96 bytes for each statement”，递归 STARK 的 ISA 首选 RISC-V | [8] | observed |
| E31 | 按当前草案，“自选签名再 STARK”这条路不可用，因为 leanSTARK 0x11 无效、VK 没有注册机制、ISA 未定 | 由 E5、E8、E30 与 [1]“STARK verification keys … up to users”推出 | inferred |
| E32 | 规范称客户端 STARK 为 128 kB 起，追求快速生成时可达 512 kB；mode 0 wrapper 最多带 1 个 leanSTARK | [1] Motivation、Constants | observed |
| E33 | leanVM @3a37fb6 在 M4 Max 上聚合 850 个 leanSPHINCS：1.0 s，峰值 16.1 GiB，证明 325.8 KiB，验证 5.1 ms；自述 “not (yet) production ready” | [19] | observed |
| E34 | 手机或钱包端本地为 Falcon / ML-DSA 生成 STARK 的成本没有公开基准，可行性未经证实 | 检索 [19][8][1] 均无相关数据 | speculative |
| E35 | 社区在 leanVM 中做出“任意 leanSTARK 程序绑定 VK 承诺”的原型，候选 AGGREGATED_VK 取决于自递归 guest 的稳定身份 | [4] Chugar 2026-09-10 帖 | observed |
| E36 | EIP-8355：ML-DSA-44/65/87 在 0x12–0x14，消息为末尾变长字节，ML-DSA-65 基础 gas 9,000 + 每字 6，created 2026-07-30 | [13] | observed |
| E37 | EF 分级把 8355 评为 C 档，理由是 “premature standardization”；8081 在 ACDC 189 后把 8355 列为 Declined for Inclusion | [11]；[10] @6e69e49 | observed |
| E38 | EIP-7885、8051、8052 不在 EIP-8081 的 SFI / CFI / PFI / DFI 任何一栏；8288 也不在 | [10] | observed |
| E39 | EIP-8052 的 Falcon 预编译地址 “TBD by ACD”，并明确避开 RIP 区间 0x0100–0x01FF | [15] Addresses | observed |
| E40 | EIP-8141 是 Hegotá 的 SFI 与 S 档执行层主打项，EF 称它是“a path to PQ signature schemes without a fork per scheme” | [10]；[11] | observed |
| E41 | ethereum.org 预计 Hegotá 在 2027 Q2 上主网（日期未确认）；bogota devnet 测试版于 2026-10-09 发布 | [22]；[23] | observed |
| E42 | EIP-8081 当前激活表的 Sepolia 2026-10-06 / Hoodi 2026-10-26 与 Glamsterdam 的日期一致，疑似误写，不能当作 Hegotá 日期 | 由 [10] 与 [28]、[22] 对照推出 | inferred |
| E43 | 预编译路线是每个节点在 EVM 中逐笔验签、逐笔携带 pk+sig；8288 路线是只有首跳与 builder 验原始签名、全网只验每块一个 STARK | 由 [13][14] 与 E9、E19、E25 推出 | inferred |
| E44 | 第二篇说 8355 的消息为“32 B digest”，有误；8355 明确反对固定 32 字节预哈希 | [13] Motivation、Input format；第二篇面板 K | observed |
| E45 | EIP-7587（Final）把 0x0100–0x01ff 保留给 RIP 流程，第二篇所说 0x0101 “专有命名空间”实际位于 RIP 共享区间 | [17]；第二篇 F15 | observed |
| E46 | 第二篇台账 #47（Native AA 2028–29 年前难以定稿）已过时，与 8141 排进 2027 Q2 的 Hegotá 不符 | 由 E40、E41 推出 | inferred |
| E47 | 第二篇的 ML-DSA-65 预编译方案应定位为近期容灾或过渡工具，而非终局 | 由 E26、E37 推出 | inferred |
| E48 | 账户适配层应抽象“验证后端”（预编译 / SP1 内验证 / 8288 依赖内省）；8288 只对 8141 帧交易有效，4337 账户不能直接声明依赖帧 | 由 E20、E1 推出 | inferred |
| E49 | 第一篇所说“L1 侧聚合（如 EIP-8288）”不能直接用于 Mantle 的 SP1 证明，因为 8288 只聚合 leanSPHINCS 和尚未定义的 leanSTARK | 由 E5、E31 推出 | inferred |
| E50 | leanVM 已改为 192 位二进制域 + WHIR，BLAKE2s 为占位，计划迁到 RISC-V rv64im，KoalaBear + Poseidon 为历史分支 | [19] | observed |
| E51 | leanSPHINCS 签名约 3 kB、聚合证明约 320 KiB，要每个证明覆盖约 100 个以上签名，DA 才会减少 | 由 E18、E33 与 [8] 推出 | inferred |
| E52 | 在单一 sequencer 的 L2 上，8288 的多跳 mempool 递归退化为 sequencer 单点聚合，证明时间计入出块延迟 | 由 E19、E33 推出 | inferred |
| E53 | 把 8288 式区块证明放进 OP Stack，需要改 batch 格式和派生规则，或改由 OP Succinct 证明兜底 | 由 E9 与第一篇对 Mantle 派生和证明路径的描述推出 | inferred |
| E54 | 在 SP1（Kona）里验证 leanVM STARK 的成本未知，可能成为 Mantle 采用 8288 式聚合的瓶颈 | 无公开基准 | speculative |
| E55 | Base 曾宣布与 Optimism 等合作，把 EIP-8130 原生 AA 带到 Base（Cobalt）和“all OP Stack chains later this year” | [24] | observed |
| E56 | Base 的 Cobalt 于 2026-09-30 在主网激活，特性不含 8130；Everest 改为引入 EIP-8430，日期 TBD | [25] | observed |
| E57 | 没有找到 Optimism 官方采纳 8141 或 8288 的公开计划 | 检索 Optimism 博客、specs 与 Base 文档 [24][25] 均无 | observed |
| E58 | Mantle 近期在 L2 先行采用 8288 式设计不现实，因为 8141 未上线、leanVM 未生产就绪、AGGREGATED_VK 为 TBD | 由 E8、E33、E41 推出 | inferred |
| E59 | Falcon 用 LaBRADOR 聚合时，约 N≈200 笔才比 key-recovery、不聚合更省，在约 250 笔 / 块时收益不大 | [27] Results | observed |

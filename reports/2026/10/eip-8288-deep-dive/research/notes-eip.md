# notes-eip：EIP-8288 设计、愿景对照、支持者论点前提、leanVM 现状

> 本路：eip，台账前缀 E。调研日期 2026-10-21，网页访问日期均为 2026-10-21。
> 一手资料优先读本地固定版本（`research/references/`），引用写“文件名:行号”。外部调研（GPT）和上一篇 notes-eip 只作线索。
> 行号以本地文件为准，已逐段抽查（如 eip-8288@5a4387b.md:L37 = `DEP_VERIFY_FRAME_MODE`，L259 = mode 1 的 16 条上限，L407 = “~256 kB”，L521–523 = Trust Assumptions）。

---

## Q1 EIP-8288 的设计与原理

### 答案
EIP-8288（Draft）给 EIP-8141 的 frame 交易加一种 `mode = 4` 的“依赖验证帧”。帧里只写 96 字节的三元组 `(scheme, data_hash, verification_key_hash)`，不在 EVM 里执行。原始签名/证明在 mempool 里由节点每 1,000 ms 递归聚合成一个 STARK。builder 对实际入块的交易再聚合一次，结果写进新增的区块头字段 `recursive_stark`；验证节点从区块交易重新算出依赖摘要，再用固定的 `AGGREGATED_VK` 验这一个证明。当前草案**只接受 leanSPHINCS**：leanSTARK（`0x11`）是保留值，用了就无效；`AGGREGATED_VK`、`DEPS_HASH`、参考实现都还是 TBD [1]。

### 依据（按规范各节）

**文件头**：标题 “In-mempool signature and proof aggregation”，作者 Vitalik Buterin、Thomas Coratger，status Draft，created 2026-06-03，requires 2718、8141 [1]:L1–11。created 日期早于首次合入（2026-09-09），因为 PR #11772 是 2026-06-05 开的，到 09-09 才合入 [11 楼1 onebox][2]。

**依赖验证帧** [1]:L51–81
- 规范把 `DEP_VERIFY_FRAME_MODE` 加进 8141 对 `frame.mode` 的静态约束集合（L57）。8141 写明：有效 mode 只有 0/1/2，扩展 EIP 可以往这个集合里加值 [4]:L130–136。
- 编码：`data` = `96·k` 字节，每组 = `scheme`（31 个零字节 + 1 字节）‖ `data_hash`（32）‖ `verification_key_hash`（32）（L59–63）。
  - leanSPHINCS：`data_hash` = msghash；第三个字段**直接放公钥** `root(16) ‖ public parameter(16)`，不再做哈希（L63）。
  - leanSTARK：`data_hash` = `pub_input_hash`，第三个字段 = `vk_hash`。
- 约束（L73–81）：
  - 每组的 scheme 字节**必须是** `LEANSPHINCS_SCHEME`；“`LEANSTARK_SCHEME` is reserved: a frame that uses it is invalid until `get_deps_hash` is defined for it”（L74）；
  - 每帧 1–256 条；
  - `target` 为 None（8141 的“缺省 target”，不是零地址），`value = 0`，`flags = 0`；
  - 不能属于 8141 的 atomic batch（前一帧不能带 `ATOMIC_BATCH_FLAG`）；
  - `limits.execution` 必须等于逐条 gas 之和，`limits.state = 0`。
- receipt：`status = 1`，`gas_used.execution = limits.execution`，没有日志（L69）。之所以保留 receipt，是为了不打乱后续帧按下标读取的结果（L441–443）。

**依赖集合与零哨兵** [1]:L87–119
- `dependencies(tx)` 是该交易所有依赖帧三元组的**去重排序**；`dependencies(block)` 再对全块去重排序。
- `data_hash` 全零时，表示“本交易的 `compute_sig_hash(tx)`”（L97、L119）。原因：交易无法在帧里写自己的签名哈希，因为签名哈希覆盖了帧数据。帧原始字节仍为零，`FRAMEDATACOPY` 读出的也是零。8141 的 `compute_sig_hash` = `keccak(FRAME_TX_TYPE ‖ rlp(tx))`，只剔除 `msg` 为空的签名字节 [4]:L249–260。

**账户如何确认“这条依赖是我的授权”** [1]:L121–135、L460
- 合约用 `FRAMEPARAM(0x02,i)` 找 mode 4 的帧，用 `FRAMEPARAM(0x04,i)` 取长度，用 `FRAMEDATACOPY` 读三元组。
- Test Case 1：一个依赖帧 `(LEANSPHINCS_SCHEME, 0, pubkey)`，后面跟一个 `VERIFY` 帧。VERIFY 帧检查“存在一条依赖，其公钥等于存储里的公钥、`data_hash` 为零（即本交易签名哈希）”（L460）。
- 规范**不替账户做绑定**：证明只说明“这个公钥对这个哈希签过名”；“这是不是我的授权”要由账户代码对比自己存储的公钥和 data_hash 来判断（inferred，由 L125–135、L460 推出）。

**区块头与验证** [1]:L137–225
- 新增区块头字段 `recursive_stark = [stark_proof, block_deps_hash]`（L148）。`stark_proof` 不带依赖和公钥，验证者从区块里重算；依赖为空时证明为空（L151）。
- `get_deps_hash(deps) = DEPS_HASH(concat(data_hash ‖ verification_key_hash))`（L155–158）。注意**不包含 scheme 字节**，并且“is defined for lists of `LEANSPHINCS_SCHEME` dependencies”（L161）。这正是 leanSTARK 暂时无效的原因。
- 区块有效当且仅当（L221–225）：
  1. 头里的 `block_deps_hash` 等于节点从交易重算的结果；
  2. 依赖非空时，证明对 `block_deps_hash` 和固定的 `AGGREGATED_VK` 验证通过；
  3. 所有交易满足常规（8141 等）有效性规则。
- 递归电路（L167–203）：
  - 公开输入为 `[deps_hash, AGGREGATED_VK]`；
  - 逐条验证直接依赖（leanSPHINCS 或 leanSTARK）；
  - 子证明用 `AGGREGATED_VK` 验证，并把它们的依赖并入；
  - 按 `discards` 删除，再去重排序，最后比对 `deps_hash`。
- 电路不理解交易和区块（L213）；“To enable unlimited-depth recursion, we need to pass the `AGGREGATED_VK` in as an input to the proof itself”（L217）。
- 规范假设验证器统一改写成 `verify(msg, hash(pub), (pub, sig))`，把完整公钥或 VK 放进见证；leanSPHINCS 公钥本身就是 32 字节，所以直接使用（L211）。

**网络 wrapper（Vitalik 推文里叫 envelope）** [1]:L227–267
- 格式 `[transactions, mode, content]`。已发送过的交易只发哈希（L243）。
  - **mode 0**（直接依赖）：`[deps, proofs]`，逐条附原始签名或 STARK。规范说主要给客户端首发使用（L265）。
  - **mode 1**（递归 STARK）：`[deps, recursive_stark]`。
- 两种 mode 都要检查 `deps` 等于各交易依赖的去重排序并集（L250、L261）。mode 1 的这条检查是 2026-10-15 才补上的（`7604300`），起因是 Chugar 在 2026-09-20 给出的反例：wrapper 带着交易 T（依赖 A），却附上一个对 {B} 的有效证明 [2][11 楼10]。
- 两种 mode 都限制 leanSPHINCS 依赖 ≤ `MAX_LEANSIG_DEPS_PER_WRAPPER`（16）、leanSTARK 依赖 ≤ 1（L251–252、L259–260）。
- 但同一节又写：“Per `AGGREGATION_INTERVAL`, a mempool node broadcasts exactly one wrapper containing all currently active transactions”（L263）。两处放在一起，字面意思是每个节点每轮的聚合最多覆盖 16 个签名。见“不确定之处”。
- 只有 leanSPHINCS 时，节点可以直接拼接签名转发，“more space-efficient up to about a hundred leanSPHINCS signatures”（L265）。

**mempool 聚合循环** [1]:L269–296
- 收到 wrapper 先验证，通过才接受；
- 交易变得不可打包（同一发送者的另一笔已上链，或其他过期规则）时，记下要删除它的依赖；
- 每 `AGGREGATION_INTERVAL`（1,000 ms，L45）生成一个新的 mode 1 wrapper，覆盖所有仍有效的交易，并转发给 peer；
- 证明时间不够时的优先级（L281–284）：自己上一轮的聚合 → 需要删除的项 → 他人的聚合（按新增交易数）→ 用户交易（按小费）。
- 每交易上限：leanSPHINCS ≤ 16、leanSTARK ≤ 1（L292）。DoS 论证是“最坏情况等价于把同样数据明文发送”（L294）。

**builder 与 FOCIL** [1]:L298–350
- FOCIL 数据结构扩展为 `[transactions, recursive_stark]`；attester 要验证每个 FOCIL 里的递归证明（L308、L320）。
- builder 流程（L326–336）：
  1. 收 FOCIL 和 wrapper，验证它们的证明；
  2. 决定入块交易，FOCIL 交易必须全部包含；
  3. 取并集，删掉未入块交易的依赖；
  4. 生成新的递归 STARK，写进区块头。
- “mempool actor … FOCIL creator … builder … are exactly the same task”（L338）。
- Censorship Resistance 一节断言（L344–346）：
  - 不引入 FOCIL 之外的新中心化压力；
  - “The bandwidth overhead of recursive STARKs is constant per peer, regardless of the number of transactions”。
  规范没有给出推导。
- 共识层集成（L350）：同一个 STARK 后端和验证基础设施可以同时用于 CL 签名聚合和 EL 依赖验证。

**gas** [1]:L368–391、L424–433
- 依赖帧 `limits.execution`：每条 leanSPHINCS 3,000，每条 leanSTARK 30,000（L373–376）。
- `recursive_stark_gas(tx) = LEANSTARK_VERIFICATION_GAS × len(dependency_triples(tx))`（L384）：**每条声明（重复也算）一律 30,000**，即使是 leanSPHINCS 也按 `LEANSTARK_VERIFICATION_GAS` 计。这笔 gas 计入 8141 的 intrinsic gas，也计入交易与区块的 `gas_used`；区块对 `recursive_stark` 字段不再另收费（L387）。
- 交易回滚也全额收取（L389），重复声明重复收费（L391）。
- 因此单条 leanSPHINCS 依赖的边际 gas = 3,000（帧执行）+ 30,000（intrinsic 分摊）= **33,000**，另有 96 字节帧数据费（按 8141/EIP-7976 规则，本路未逐项核算）；若为它新开一个帧，再加 8141 的 `FRAME_TX_PER_FRAME_COST` 475 [4]:L39。这是“按依赖条数**定额**计费”，**不是**按区块实际依赖数把一个证明的成本摊开（inferred，由 L384–387 推出）。
- 规范自己说这是 “_expected_ cost … not the actual cost”（L379），并讨论将来可能按 k-time / 证明大小改为变动计价（L430–433）。

**修订历史**（GitHub API，10 个提交）[2][3]

| 提交 | 日期 | 变化 |
|---|---|---|
| `1f373da` | 2026-09-09 | 首次合入。标题 “Frame Type for PQ Sig and STARK Aggregation”；mode = **3**；leanSTARK **允许**使用；第三字段为 `pubkey_hash`；deps 只排序、不去重；`block_deps_hash` 的哈希**包含 scheme**；每交易 16/1 上限写在**区块有效性规则**里；`recursive_stark_gas` 按全块依赖数“charged as part of the block's base fee”；mode 1 **没有**并集检查；Test Case 1 用 `TXPARAM` 取签名哈希（自引用问题）；安全一节只写 “leading choice is BLAKE3” |
| `ef1abf4` | 09-09 | 未细看 diff |
| `c4f6cf4` | 09-12 | 改标题为 “In-mempool signature and proof aggregation” |
| `9ee171b` | 10-07 | `recursive_stark_gas` 改由交易承担（计入 intrinsic） |
| `877f038` | 10-07 | `block_deps_hash` 绑定聚合电路的摘要（`DEPS_HASH`，不含 scheme） |
| `bc2d97c` | 10-07 | 依赖帧不能放进 atomic batch |
| `c2fb476` | 10-07 | 依赖帧要有 receipt |
| `00afdc8` | 10-07 | mode 改为 4 |
| `7604300` | 10-15 | mode 1 也要做并集检查 |
| `72ca2dd` | 10-15 | 零 `data_hash` 代表本交易签名哈希。ethresear.ch 的 ISA 帖（10-08）指出原例子“can never be built”，并建议的正是这个改法 [12] |

另外，“leanSPHINCS 第三字段直接放公钥”“leanSTARK 改为保留值”“上限从区块规则移到 mempool 规则”“依赖为空时证明为空”都出现在 1f373da 与当前版本之间。对应哪个提交没有逐个对 diff（不确定）。

**与 8141 / 8292 的关系**
- 8141：status Draft [4]:L7，在 EIP-8081（Hegotá meta）当前 master 中列为 **Scheduled for Inclusion**，同列的只有 EIP-7805（FOCIL）[6]。8288 不在 8081 的任何一栏 [6]。
- 8141 自带 `signatures` 列表，其中协议验证签名的原始字节 “intentionally not introspectable by EVM code to allow future aggregation schemes” [4]:L211。8288 没有用这条钩子，另开了依赖帧。
- 8292：共识层聚合者角色，“The execution layer is unchanged by this EIP” [5]。它和 8288 共用 leanVM 后端思路（8288 [1]:L350、L415–418）。
- FOCIL：8288 要**修改** FOCIL 的数据结构（加入 `recursive_stark`），并要求 attester 验证 FOCIL 内的证明 [1]:L304–320。FOCIL 已排进 Hegotá，8288 是作者希望放进下一个分叉（I-star）。所以 8288 落地时等于去改一个已经上线的 FOCIL 格式（inferred）。

**安全假设原文** [1]:L521–523
1. “Soundness of Lean Ethereum circuits”；
2. `DEPS_HASH` 的可靠性：“BLAKE2s in the current tooling, with BLAKE3 the leading choice to replace it”；
3. “Soundness of recursive STARKs: a STARK of a STARK of ... of a STARK must be sound. This is widely believed to be true … However, this adds difficulty to end-to-end formally proving … the STARK verification keys that users put in to this system are up to users, and may potentially have unlimited recursion depth.”

### 不确定之处
- **mode 1 的 16 条上限**：L259–260 与 L263 字面上矛盾。可能的解释有三种：
  - 上限本意只对 mode 0；
  - 上限是“每个 wrapper”，而一个节点每轮可以发多个 wrapper；但 L263 写的是 “exactly one wrapper”；
  - 规范笔误。
  规范和讨论帖都没有澄清（speculative）。
- `AGGREGATED_VK`、`DEPS_HASH`、leanSTARK 的 `get_deps_hash`、参考实现仍是 TBD。
- 依赖帧在 8141 mempool “validation prefix” 中的位置没有写明：
  - 规范 Test Case 1 把依赖帧放在 VERIFY **之前**（L460）；
  - ethresear.ch ISA 帖把它放在 VERIFY **之后**，理由是“keeps a validation prefix the public mempool recognizes” [12]。
- Gas 一节仍按 KoalaBear 的 `2**24` trace 上限描述（L428），而 leanVM README 已说明 KoalaBear 是历史设计、现在用二进制域 [14]:L62。规范与实现的口径不一致。
- `ef1abf4` 的 diff 没有看。

---

## Q2 Vitalik 的愿景 vs 规范现状

### 答案
已经写进规范的是“机制骨架”：依赖帧、envelope（mode 0/1）、每 tick 递归聚合、builder 当作“又一个 mempool 节点”、区块里放一个 STARK 外加每条 96 B。还停留在愿景层面的是“价值主张”：任意签名/证明 client-side 包成 STARK、隐私协议降到低几万 gas、私有 AA、选定 ISA（RISC-V）、“再也不加预编译”、I-star 时间表。原因是 leanSTARK 路线在当前草案中无效，ISA 没有选定，规范也完全没有提到私有 AA 和 ISA。数字方面，tick（推文“eg. 500ms”vs 规范 1,000 ms）和签名名称（推文“SPHINCS-”vs 规范 leanSPHINCS）与规范不一致 [1][7][8][13]。

### 逐条对照（2026-09-09 推文 [7]、2026-10-19 推文 [8]）

| 推文说法 | 规范现状 | 判断 |
|---|---|---|
| 希望进入 “I-star (the fork after Hegota)” | 规范无时间表；8081 中没有 8288 [6] | 只是作者期望 |
| “SPHINCS-” 签名约 3 kB，不必上链 | 规范的原生方案叫 **leanSPHINCS**（L39、L74）；Motivation 写哈希签名约 2–3 kB（L20）。SPHINCS- 作者说明：SPHINCS- 用 keccak，**只有 leanSPHINCS 能在聚合电路内原生验证**，“A keccak-based SPHINCS- signature could still ride the pipeline, but must first be STARK-wrapped client-side”。SPHINCS- 变体签名为 3,704–6,512 B [13] | 名称混用；“签名不上链”与规范一致 |
| 隐私交易从约 300k / 约 10M gas 降到“low tens of thousands” | 隐私证明要走 leanSTARK，而 `0x11` 当前无效（L74）。按现有定价，一条 leanSTARK 依赖 = 30,000 + 30,000 = 60,000 gas（L373–384），还不含交易其他成本 | 愿景；规范的定价是“几万”量级，但这条路目前走不通 |
| Falcon / ML-DSA 等“wrap it client-side in a STARK”，不需要改 EVM | 规范 Rationale 原话同意这条路线（L422），但 leanSTARK 无效；VK 只是 hash，没有注册；ISA 未定 | 愿景 |
| 私有 AA（私密账户逻辑，一笔交易转移全部所有权） | 规范全文没有提到 | 愿景 |
| 每个节点循环：等一个 tick（eg. 500ms）→ 聚合 → 删除过期 → 递归证明 → 发新 envelope | 规范的循环一致（L275–277），但 `AGGREGATION_INTERVAL = 1000` ms（L45） | 机制已写入；数字不同 |
| 每节点每 tick 外发一个 STARK（约 100–300 kB），外加每笔交易全网广播一次 | 规范：builder 每个间隔的 STARK 开销固定约 256 kB（L407）；已广播交易只发哈希（L243） | 一致（256 落在 100–300 区间） |
| builder 是“yet another mempool node” | “exactly the same task”（L338） | 一致 |
| 链上开销：一个 STARK（100–300 kB）加每条语句 96 字节 | 区块头 `recursive_stark`（L148）、96 B 三元组（L59）；规范承认“increase the block header size greatly”（L405） | 一致；规范未写证明大小 |
| “The Proof Singularity” | 规范没有出现 | 修辞 |
| 需要约定 ISA，首选 RISC-V | 规范没有提 ISA，只说用 Lean Ethereum tooling（L352–366）。leanVM 计划从 leanISA 迁到 rv64im [14]:L59 | 未决 |
| 10-19：“EIP-8288 maximalism”，calldata 在 PeerDAS + blocks-in-blobs 下实际上限约 8 MB/s，“we never need to add more precompiles again” | 规范没有这些内容；8 MB/s 是作者的估计 | 观点 |
| 10-19：client-side STARK “quickly getting faster and faster, even on phones” | 没有找到 leanVM 在手机上证明 Falcon / ML-DSA 验签的一手基准 | 未经证实 |

**Ethereum Magicians 讨论帖 28723**（13 楼，最后一楼 2026-10-19）[11]
- **Vitalik 只发言两次**：
  - 1 楼（06-05）：动机是 “supports signatures and STARKs (for privacy or for eg. L2s)”；
  - 5 楼（06-15）回答 albert_g“是否考虑格签名”：“We want to be minimalistic with dependencies, and have a strong preference to keep the base layer purely hash-based for that reason. It also means we have to maintain less total infrastructure.”
- **全帖没有讨论递归深度或递归 soundness**（任务要求查找的“递归深度/安全讨论”在该帖中不存在）。
- 其他实质性回复：
  - pipavlo82（3、6、8 楼）与 OBA Research（11 楼）讨论 **omission accountability**：聚合证明只证明“已纳入的依赖有效”（inclusion validity），不证明“builder 收到的有效依赖都被纳入了”（admission-relative completeness）。他们建议在 8288 之外另做 hash-only receipt。
  - Chugar（9 楼，09-10）报告原型：在 leanVM 递归里把任意 leanSTARK 程序绑定到经认证的程序承诺，`ARBITRARY_VERIFY_SUB_PASS=true` 等测试通过。候选 `AGGREGATED_VK` 取决于“single self-recursive 8288 guest”的稳定身份。这是社区自报，未独立复核。
  - Chugar（10 楼，09-20）发现 mode 1 缺少并集检查，10-15 已修。
  - Chugar（12 楼，09-30）：有效证明还必须对上协议授权的 `AGGREGATED_VK`。
  - ArikG（13 楼，10-19）：建议用 STARK 聚合器让 ECDSA/EdDSA 以“partially PQ secure”的方式继续使用（HPS 草稿）。

**ethresear.ch “Exposing an ISA for post-quantum proofs on Ethereum”**（soispoke，2026-10-08；致谢 Justin Drake、Vitalik 等）[12]，核心主张：
1. 8288 目前用 VK hash 标识证明背后的计算，这只是“a placeholder until Ethereum decides what to expose”。证明系统层面的 VK 会随 leanVM 每次升级而变化，会让不可升级的隐私池失效。
2. 应把 `0x11` 换成 **program scheme**：第三字段放 `program_id = hash(ISA version, program bytes)`，`data_hash` 是程序的公开输出，每个分叉规定验证器。
3. 对比三种 ISA：
   - EVM：手写字节码、重活由预编译承担时约为 RISC-V 的 2× 周期；BLAKE2s 用 EVM 代码写时为 78–163×；
   - RISC-V（RV64IM）：原生速度，但要补规范（例如内存布局）；
   - 为证明设计的 eISA：未测量，社会共识最难。
   哪个合适主要取决于 leanVM 原生运行什么。
4. “wrapping”替代方案（h/t Vitalik）：旧证明系统一旦被攻破，外层证明只能确认“旧验证器接受了伪造证明”。
5. 作者在回复中自称“we don't have nearly enough info/data to make decisions today”。matt 反对把 RISC-V 直接暴露给用户。

### 不确定之处
- 2026-10-19 Vitalik 有两条相关推文：本报告资料中的 `2112032009413439704`（04:04 UTC，“EIP-8288 maximalism”），以及上一篇 notes 引用的 `2112015118418473358`（02:56 UTC，回复 lex_node）。两条措辞不同，结论相同。
- “low tens of thousands gas”是否包含 8141 基础 intrinsic（12,000）和数据费，推文没有说明。

---

## Q3 支持者论点的前提（decentrek 两条推文 [9][10]）

### 答案
五条论点在规范里都有对应的**机制**，但成立都依赖规范没有保证的前提：
- “证明带宽恒定”只对证明部分成立；
- “builder 不是瓶颈”取决于 builder 最后一次递归能否在 slot 内完成；
- “节点越多容量越大”在规范中**没有**分工机制支撑：每个节点都尝试聚合整个活跃池，也没有激励；
- “验证者只验一个证明”成立；
- “任意签名经 STARK 包装”在当前草案中**不可用**。
“每秒数万笔 PQ / 隐私交易”没有一手依据。

### 逐条

| decentrek 论点 | 规范 / 机制依据 | 成立需要的前提 | 类型 |
|---|---|---|---|
| ① 每个节点的证明带宽恒定，网络因此保持去中心化 | L346（constant per peer）、L407（约 256 kB / 间隔） | 只有**证明**这部分恒定。交易正文仍要全网广播一次 [7]；每个 wrapper 带 96 B × 依赖数的 `deps` 列表和交易哈希列表（L243–244），随交易量线性增长；首跳 mode 0 要带原始签名或 STARK（leanSTARK 每个 128–512 kB，L20） | inferred |
| ② builder 先拿到预聚合证明，硬件要求不必随吞吐上升 | L326–336、L338 | builder 仍要验证所有收到的聚合，并在 slot 内对“选中子集 + 删除项”再证明一次。leanVM 2→1 递归 0.29 s / 14.7 GiB（M4 Max）[14]:L129–133。子证明更多时的成本没有公开数据 | inferred |
| ③ mempool 节点越多，能处理的签名 / 证明越多（“decentralization makes scaling easier”） | 规范只说每个节点聚合“all currently active transactions”（L263、L277） | 规范**没有**把工作分片给不同节点，每个节点都在证明整个池（存在冗余）。单节点每 tick 能证明的量受硬件限制：8292 实测 1,000 个签名单消息聚合，2 核约 11 s、8 核约 3.7 s、16 核约 2.6 s [5]:L88–93（XMSS / CL 场景），都超过 1,000 ms 的间隔。规范**没有**任何证明激励（全文未提），8292 也承认 CL 聚合者没有显式奖励 [5] Open questions。另外 mode 1 的 16 条上限（L259）与此冲突。“更多节点”能带来的，至多是更多来源的部分聚合被 builder 合并；这是否扩容，取决于 builder 的合并成本 | inferred |
| ④ 验证者只验一个聚合证明，硬件要求低 | 区块有效性规则 L221–225；leanVM 验证约 5 ms [14]:L103 | 成立。前提是验证者还要重算 `dependencies(block)` 的摘要，并下载 100–300 kB 的区块头证明；可靠性完全依赖 leanVM 与递归 soundness（L521–523） | observed（机制） |
| ⑤ 不只聚合原生签名，也聚合 STARK，所以任意签名都能经 STARK 包装 | L422 | leanSTARK 当前无效（L74）；ISA / program_id 未定 [12]；客户端证明成本没有基准；Thaler 认为 leanVM“not general-purpose computation”，二进制域证明整数乘法（格运算）慢 [15] | inferred |
| “每秒数万笔 PQ / 隐私交易” | 无 | 按当前定价，每条 leanSPHINCS 依赖 33,000 gas。假设 12 s slot、每笔 1 条依赖，1 万笔 / 秒要求每块约 12 万条依赖，仅依赖 gas 就约 4×10⁹。证明端：leanVM 单机约 850 签名 / 秒 [14]:L102 | speculative（无依据）；算式为 inferred |
| “即使原始签名 / 证明很大（数百 KB），每笔只收很少 gas” | 每条依赖定额 3,000 / 30,000 + 30,000（L373–384） | 成立，但定价是“expected cost”的设定，不是测量（L379） | observed |

**延迟**：交易要先等首跳（mode 0），再经过若干个 1,000 ms 的递归轮次，最后由 builder 证明。规范没有给出端到端的入块延迟（inferred：至少增加一个间隔加 builder 的证明时间）。

**谁出算力**：规范把成本表述为“only paid by the builder and the mempool, not by all validating nodes”（L379），但没有给 mempool 节点任何补偿机制（observed：全文没有激励条款）。

---

## Q4 leanVM / leanSPHINCS 现状（只取与 8288 相关的）

### 答案
leanVM 自我定位为 “minimal hash-based zkVM, for post-quantum Ethereum”。README 首页的基准都是签名聚合、递归和 DA，不是通用计算。安全声明为 “128-bit ROM (64-bit QROM) soundness”，同时写明 “Formal verification is in progress … not (yet) production ready”。哈希（BLAKE2s 占位）、ISA（leanISA → 计划迁到 rv64im）和零知识（计划中）都还会变 [14]。EIP-8292 给出的当前实例安全水平更低：约 124 位经典 / 62 位量子 [5]:L163。leanSPHINCS 是 Lean Ethereum 的无状态（many-time）SPHINCS 变体，用 ZK 友好的哈希，参数“not the definitive parameter set”。README 没有写签名大小。

### 依据
- **定位** [14]:L7：“minimal hash-based zkVM, for post-quantum Ethereum”。
- **安全** [14]:L47–52：
  - 128-bit ROM（64-bit QROM）soundness；
  - “no proximity gap conjecture”；
  - 目标是端到端形式化验证；
  - 使用“traditional hash function”；
  - 警告：形式化验证进行中，尚未生产就绪。
- **会变的部分** [14]:L58–62：BLAKE2s 是占位（SHA2、SHA3、BLAKE3 在考虑）；计划从 leanISA 迁到 RISC-V rv64im；零知识计划中；KoalaBear + Poseidon 是历史设计。
- **证明机制**：192 位二进制域、WHIR、Flock、Binius 系 ring switching [14] 末节。
- **基准**（M4 Max，12P + 4E 核，48 GB，未用 GPU）[14]：

  | 场景 | 时间 | 峰值内存 | 证明大小 | 验证 |
  |---|---|---|---|---|
  | 聚合 850 个 leanSPHINCS | 1.0 s | 16.1 GiB | 325.8 KiB | 5.1 ms |
  | 聚合 1,290 个 leanXMSS | 0.947 s | 15.46 GiB | 318.4 KiB | — |
  | 2→1 递归 | 0.291 s | 14.7 GiB | 201.5 KiB | 6.3 ms |

  leanSPHINCS 的参数“is not the definitive parameter set”，ROM 安全证明用 Lean 4 写成 [14]:L90。
- **与 8288 规范的衔接**：
  - 规范说 Lean Ethereum tooling “has full formal verification in progress”（L413），与 README 一致；
  - 规范 Gas 一节仍按 KoalaBear 描述上限（L428），与 README 不一致。
- **leanSPHINCS / leanXMSS / SPHINCS- 的区别**：
  - 8288 用无状态、可多次签名的 leanSPHINCS；CL 用有状态的 leanXMSS（规范 L418）。
  - SPHINCS-（nicocsgy，2026-06-12）是**另一套** keccak 版、面向 EVM 直接验证的 SPHINCS+ 变体：签名预算 2^14–2^20，签名 3,704–6,512 B，EVM 内验证 94K–276K gas。作者说明，未来改用 ZK 友好哈希的版本才命名为 “leanSPHINCS” [13]。
  - Vitalik 推文里的“SPHINCS- 约 3 kB”与 SPHINCS- 帖子的数字同一量级，但与 8288 的原生方案不是同一个东西（inferred）。
- **安全数字的矛盾**：README 写 128 / 64 位 [14]:L47；8292 写“current leanVM instantiation … roughly 124-bit classical and 62-bit quantum security, short of the NIST Level 1 target” [5]:L163。见“矛盾”。

### 不确定之处
- leanSPHINCS 的确切签名大小没有查到一手数字（leanSPHINCS.pdf 未读）。
- leanVM 的 RISC-V 分支（`riscv-exploration`）的性能没有核实。

---

## 概念入门（供“前置知识”面板）

- **Frame transaction（EIP-8141）**：一种新交易类型（`0x06`），把交易拆成若干“帧”。每帧有 mode：DEFAULT 以入口点身份执行，VERIFY 做验证并可调用 `APPROVE` 批准执行和付费，SENDER 以 sender 身份执行。账户就是“有代码的地址”，验证逻辑由账户自己定义，所以换签名算法不需要分叉。合约可以用 `FRAMEPARAM` / `FRAMEDATACOPY` 读取同一交易里其他帧的内容。
- **依赖帧（8288，mode 4）**：一帧里只放若干 96 字节的声明“某方案下，某数据哈希对某公钥 / 某 VK 成立”，不执行代码。签名或证明本体不进区块，由网络证明“这些声明都成立”。账户代码只需检查“交易里存在我要的那条声明”。
- **递归 STARK / 递归聚合**：STARK 是基于哈希、无需可信设置的简洁证明。“递归”指在一个证明里验证另一个（或多个）证明，使任意多个证明可以逐层合并成一个，大小基本不变。8288 的电路做的是“验证输入 → 合并 → 丢弃 → 去重”，每一层都用同一个固定验证键 `AGGREGATED_VK`，所以理论上可以无限层嵌套。
- **Mempool wrapper / envelope**：网络层的打包对象，不是交易。mode 0 携带逐条原始签名或证明（用户首发），mode 1 携带一个覆盖全部依赖的递归 STARK（节点转发）。节点每 1 秒重新聚合一次，已发过的交易只发哈希。
- **`AGGREGATED_VK` 与 `DEPS_HASH`**：前者是协议固定的“聚合电路身份”，验证者只认这一个；后者是把依赖列表压成 32 字节摘要的哈希（当前 BLAKE2s）。两者在 8288 中都还是 TBD。
- **FOCIL（EIP-7805）**：由 fork choice 强制的包含列表。一组验证者发布“必须包含的交易”，attester 会拒绝不包含它们的区块，以此抗审查。8288 让包含列表也带一个递归证明。
- **ISA 与 program_id**：用户在客户端证明“某程序正确运行”时，协议必须约定程序用哪种指令集（EVM、RISC-V 或专门设计的 eISA）。用 `program_id = hash(ISA 版本, 程序字节)` 代替会随证明系统升级而变化的 VK 哈希，才能让不可升级的合约长期有效。
- **leanVM / leanSPHINCS / leanXMSS**：leanVM 是 Lean Ethereum 的极简哈希型 zkVM（二进制域 + WHIR），专门用于签名聚合和递归。leanXMSS 是共识层用的有状态哈希签名（一个 slot 只签一次）。leanSPHINCS 是执行层用户用的无状态哈希签名，可以无限次签名、无需记录状态。

---

## 资料中被修正的地方

外部调研（GPT，2026-10-21）：
1. **mode 1 的 16 条上限没有提**。GPT 把 wrapper 描述成可以持续合并、覆盖大量交易，但规范把 mode 1 也限制在 ≤16 个 leanSPHINCS、≤1 个 leanSTARK 依赖（L259–260），与“一个 wrapper 覆盖全部活跃交易”（L263）冲突。这一点会直接影响“mempool 聚合扩容”的论证。
2. **gas 的口径要补充**：GPT 的 33,000 gas 正确，但没有说明这 30,000 是按声明**定额**收取、而且用的是 `LEANSTARK_VERIFICATION_GAS`；首版草案是按全块依赖数算进 base fee 的（`9ee171b` 才改）。
3. **没有提修订历史**：mode 3→4、leanSTARK 从允许变为保留、`block_deps_hash` 去掉 scheme、mode 1 并集检查、零哨兵，都是 2026-10 的修改。GPT 说“读取旧讨论时需要注意”，但没有列出这些变化。
4. **leanVM 安全位数只引了 README 的 128 / 64**，没有提 EIP-8292 写的约 124 / 62 位、低于 NIST Level 1 [5]:L163。
5. **SPHINCS- 与 leanSPHINCS 混为一谈**：GPT 没有区分。Vitalik 推文说的“SPHINCS-”按其作者的说法需要 client-side STARK 包装才能进 8288 [13]。
6. **资料边界已过时**：GPT 称“四条 X 链接未能读取”。本路已有四条推文的原文（fxtwitter），包括 Vitalik 2026-10-19 的 “EIP-8288 maximalism” 原话 [8]。
7. **FOCIL 修改没有提**：GPT 写了 FOCIL 兼容，但没有指出 8288 要修改 FOCIL 的数据结构，并要求 attester 验证 FOCIL 内的递归证明；而 FOCIL 已排进 Hegotá，早于 8288 的目标分叉。

上一篇 notes-eip（2026-10-20）：
8. 上一篇的 E42 说“EIP-8081 激活表的 Sepolia / Hoodi 日期疑似误写”。当前 master 的激活表**已清空** [6]，该异常已不存在。
9. 上一篇说 Vitalik 2026-10-19 推文为 `2112015118418473358`。本篇引用的是同日另一条 `2112032009413439704`（“EIP-8288 maximalism”），两条都存在，不矛盾。
10. 上一篇写 Vitalik 在 Magicians 帖中“只有两次发言”，与本次核对一致；补充说明：全帖 13 楼，没有关于递归深度或 soundness 的讨论。

---

## 矛盾（照实记录，未裁决）
- **leanVM 安全位数**：README 写“128-bit ROM (64-bit QROM)” [14]:L47；EIP-8292 写“roughly 124-bit classical and 62-bit quantum … short of the NIST Level 1 target” [5]:L163。两者的模型或参数可能不同，未能确认哪个对应 @3a37fb6。
- **聚合间隔**：规范 1,000 ms [1]:L45；Vitalik 推文“eg. 500ms” [7]。
- **依赖帧位置**：规范 Test Case 1 放在 VERIFY 之前 [1]:L460；ISA 帖放在 VERIFY 之后 [12]。
- **签名方案名**：推文写 SPHINCS- [7]；规范写 leanSPHINCS [1]；SPHINCS- 作者说两者不同 [13]。
- **规范内部**：mode 1 的 16 条上限 [1]:L259 与“每轮一个 wrapper 覆盖全部活跃交易”[1]:L263。
- **规范与实现**：Gas 一节用 KoalaBear 描述上限 [1]:L428；leanVM 已改为二进制域 [14]:L62。

---

## 来源
1. **PRIMARY** `research/references/eip-8288@5a4387b.md`（ethereum/EIPs @5a4387b，文件最后修改 `72ca2dd` 2026-10-15）。证明规范全部机制、常量、TBD 项、gas、安全假设。
2. **PRIMARY** GitHub API `repos/ethereum/EIPs/commits?path=EIPS/eip-8288.md`（访问 2026-10-21）。证明 10 个提交的日期、作者和提交说明。
3. **PRIMARY** `raw.githubusercontent.com/ethereum/EIPs/1f373da…/EIPS/eip-8288.md`（首版）。证明首版的 mode 3、旧标题、leanSTARK 允许、gas 计入 base fee、没有 mode 1 并集检查、TXPARAM 自引用测试。
4. **PRIMARY** `research/references/eip-8141@5a4387b.md`。证明 Draft 状态、mode 0/1/2 与扩展规则（L130–136）、`compute_sig_hash`（L249–260）、签名字节不可内省以便将来聚合（L211）、`FRAME_TX_PER_FRAME_COST` 475（L39）。
5. **PRIMARY** `research/references/eip-8292@5a4387b.md`。证明 CL 聚合者角色、“execution layer is unchanged”、1,000 签名的证明时间（L88–93）、约 124 / 62 位安全（L163）、没有显式激励。
6. **PRIMARY** EIP-8081 当前 master（raw，访问 2026-10-21）。证明 Hegotá SFI 只有 7805 与 8141；8288 不在任何一栏；8355 为 DFI；激活表为空。
7. **PRIMARY** `research/references/VitalikButerin_status_2097711433073172837.md`（2026-09-09）。证明 I-star 期望、SPHINCS- 约 3 kB、300k / 10M → 低几万 gas、私有 AA、500 ms tick、100–300 kB、96 B、RISC-V ISA、“Proof Singularity”。
8. **PRIMARY** Vitalik 2026-10-19 推文 `2112032009413439704`（原文收在 `decentrek_status_2112535053188145367.md` 的引用推文中）。证明“EIP-8288 maximalism”、约 8 MB/s、“never need to add more precompiles again”、“even on phones”。
9. **PRIMARY** `research/references/decentrek_status_2098392867773509799.md`（2026-09-11）。证明“第四个扩容维度”“builder 瓶颈”“节点越多越能扩容”。
10. **PRIMARY** `research/references/decentrek_status_2112535053188145367.md`（2026-10-20）。证明五条论点和“tens of thousands of PQ and private transactions per second”。
11. **PRIMARY** Ethereum Magicians `t/28723.json`（13 楼，访问 2026-10-21）。证明 Vitalik 的两次发言、omission accountability 讨论、Chugar 的原型与 mode 1 漏洞、HPS 提议；没有递归深度讨论；PR #11772 于 2026-06-05 开出。
12. **PRIMARY** ethresear.ch `t/26136.json`（soispoke，2026-10-08，含 matt 的回复）。证明 VK hash 是占位、program scheme 提案、三种 ISA 对比数字、wrapping 的风险、零 `data_hash` 建议。
13. **PRIMARY** ethresear.ch `t/25165.json`（nicocsgy，“SPHINCS minus”，2026-06-12）。证明 SPHINCS- 是 keccak 版、签名 3,704–6,512 B，需要 STARK 包装才能进 8288，以及 leanSPHINCS 命名的由来。
14. **PRIMARY** `research/references/leanVM-README@3a37fb6.md`。证明定位、128 / 64 位声明、未生产就绪、BLAKE2s 占位、rv64im 迁移计划、各项基准。
15. **PRIMARY** `research/references/SuccinctJT_status_2112706944548880442.md`（2026-10-21）。证明 Thaler 的论点：8288“enables unlimited-depth recursion”；leanVM 不是通用 VM；二进制域证明整数乘法慢。
16. 线索：`reports/2026/10/pq-signature-selection/research/notes-eip.md`（2026-10-20）。修订提交的初步列表，以及 Vitalik ethresear.ch 1 月帖（128 kB、500 ms、约 2 MB/s）的转述（本次未重新抓取）。
17. 线索：`research/eip-8288-deep-dive.md`（GPT Deep Research，2026-10-21）。修正见上文。

---

## 开放问题
1. mode 1 wrapper 的 16 条上限是否为笔误？作者或 PR 讨论中有没有澄清？（建议查 PR #11772 及之后的 PR 评论。）
2. `AGGREGATED_VK`、`DEPS_HASH`（BLAKE2s / BLAKE3 / SHA-2）、leanSTARK 的 `get_deps_hash` 何时、由谁确定？是否会按 ISA 帖的建议改成 program scheme？
3. leanVM 当前实例的安全位数到底是 128 / 64 还是 124 / 62？
4. 依赖帧在 8141 公共 mempool validation prefix 中的位置，以及 `MAX_VERIFY_GAS` 是否计入依赖帧的 gas。
5. 单个节点每 1,000 ms 的实际证明吞吐（leanSPHINCS、普通硬件），以及 builder 合并 N 个子聚合的成本曲线。目前只有 M4 Max 的单点数据和 8292 的 XMSS 数据。
6. mempool 证明者的激励：规范完全没有；节点不去证明时，退化为 mode 0 明文转发（约 100 个签名以内更省空间），带宽会怎样变化？
7. 手机或硬件钱包上 client-side 证明 Falcon / ML-DSA / 隐私电路的成本。
8. leanSPHINCS 的签名大小与参数（leanSPHINCS.pdf 未读）。

---

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| E1 | EIP-8288 标题为 “In-mempool signature and proof aggregation”，作者 Vitalik Buterin 与 Thomas Coratger，status Draft，requires 2718、8141 | [1] eip-8288@5a4387b.md:L1–11 | observed |
| E2 | eip-8288.md 共 10 个提交，首次合入 1f373da（2026-09-09，原标题 “Frame Type for PQ Sig and STARK Aggregation”），最新为 72ca2dd（2026-10-15）；文件头 created 2026-06-03 对应 PR #11772 于 06-05 开出 | [2] commits API；[3] 首版文件头；[11] 1 楼 onebox | observed |
| E3 | 依赖验证帧 mode = 4（首版为 3，00afdc8 于 10-07 改为 4），不作为 EVM 代码执行 | [1]:L37、L57；[3]；[2] | observed |
| E4 | 每条依赖是 96 字节三元组：31 个零字节 + 1 字节 scheme ‖ 32 字节 data_hash ‖ 32 字节 verification_key_hash，每帧 1–256 条 | [1]:L59–63、L73–75 | observed |
| E5 | leanSPHINCS 的第三字段直接放 32 字节公钥（root16 ‖ param16），不再哈希；首版写的是 pubkey_hash | [1]:L63；[3] | observed |
| E6 | 当前只接受 LEANSPHINCS_SCHEME；LEANSTARK_SCHEME 为保留值，使用它的帧在 get_deps_hash 定义前无效（首版允许使用） | [1]:L74；[3] | observed |
| E7 | 依赖帧要求 target 为 None（不是零地址）、value 0、flags 0、limits.state 0，并且不能属于 atomic batch | [1]:L76–81 | observed |
| E8 | data_hash 全零表示本交易的 compute_sig_hash(tx)，以解决签名哈希覆盖帧数据造成的自引用；ethresear.ch ISA 帖于 10-08 提出该问题，72ca2dd 于 10-15 采纳 | [1]:L97、L119；[12] 末段；[2] | observed |
| E9 | 账户通过 FRAMEPARAM(0x02/0x04) 和 FRAMEDATACOPY 读取依赖三元组；Test Case 1 由 VERIFY 帧比对存储里的公钥与零 data_hash | [1]:L125–131、L460 | observed |
| E10 | 聚合证明只证明“该公钥对该哈希签过名”，把它解释为对本交易的授权由账户代码负责 | 由 E9 与 [1]:L213（电路不理解交易）推出 | inferred |
| E11 | 区块头新增 recursive_stark = [stark_proof, block_deps_hash]；证明不带依赖，验证者从区块交易重算摘要；依赖为空时证明为空 | [1]:L148–152、L221–225 | observed |
| E12 | get_deps_hash 只对 data_hash ‖ verification_key_hash 求 DEPS_HASH，不含 scheme，且只为 leanSPHINCS 定义（首版的哈希包含 scheme） | [1]:L155–161；[3] | observed |
| E13 | 递归电路的公开输入为 [deps_hash, AGGREGATED_VK]，逻辑为验证直接依赖、用 AGGREGATED_VK 验证子证明、合并、丢弃、去重后比对 | [1]:L167–203 | observed |
| E14 | 规范明确为“unlimited-depth recursion”设计，并承认用户提交的 STARK VK 可能有无限递归深度 | [1]:L217、L523 | observed |
| E15 | AGGREGATED_VK、DEPS_HASH 与参考实现都是 TBD | [1]:L43–44、L513 | observed |
| E16 | 规范列出三项信任假设：Lean Ethereum 电路可靠性、DEPS_HASH（当前 BLAKE2s，首选替代 BLAKE3）、递归 STARK 可靠性，并承认后者增加端到端形式化证明的难度 | [1]:L521–523 | observed |
| E17 | wrapper 分 mode 0（逐条证明）与 mode 1（一个递归 STARK），两者都要求 deps 等于各交易依赖的去重排序并集；mode 1 的这项检查在 Chugar 09-20 报告后于 10-15 补入 | [1]:L234–261；[2] 7604300；[11] 10 楼 | observed |
| E18 | mempool 节点每 1,000 ms 生成一个覆盖全部仍有效交易的 mode 1 wrapper，删除不可打包交易的依赖，并对已发送交易只发哈希 | [1]:L45、L243、L263、L275–277 | observed |
| E19 | 规范同时把 mode 1 wrapper 限制在至多 16 个 leanSPHINCS、1 个 leanSTARK 依赖 | [1]:L259–260、L48–49 | observed |
| E20 | 按字面读，E18 与 E19 合起来使每个节点每轮的聚合最多覆盖 16 个签名，与“每 slot 处理数千个签名”的目标冲突 | 由 E18、E19 与 [1]:L415 推出 | inferred |
| E21 | builder 收集 FOCIL 与 wrapper 的证明，删掉未入块交易的依赖后重新递归，写入区块头；规范称这与 mempool 节点、FOCIL 生成者是“exactly the same task” | [1]:L326–338 | observed |
| E22 | 8288 把 FOCIL 扩展为 [transactions, recursive_stark]，要求 attester 验证 FOCIL 内的递归证明 | [1]:L304–320 | observed |
| E23 | 每条依赖的帧执行 gas 为 3,000（leanSPHINCS）或 30,000（leanSTARK），另按每条声明（含重复）收 30,000 计入 intrinsic；交易回滚也照收 | [1]:L373–391 | observed |
| E24 | 一条 leanSPHINCS 依赖的边际 gas 为 33,000（另有 96 字节数据费，新开帧再加 475），且按声明定额收取，不随区块依赖数分摊 | 由 E23 与 [4]:L39 推出 | inferred |
| E25 | 首版把 recursive_stark_gas 按全块依赖数计入区块 base fee，9ee171b（10-07）改为由交易承担 | [3] Gas Accounting；[2] | observed |
| E26 | EIP-8141 为 Draft，在 EIP-8081 中是 Hegotá 的 SFI（同列只有 EIP-7805）；8288 不在 8081 任何一栏 | [4]:L7；[6] | observed |
| E27 | EIP-8292 规定共识层聚合者角色，“The execution layer is unchanged”；8288 称同一 STARK 后端可同时服务 CL 与 EL | [5] Specification；[1]:L350 | observed |
| E28 | 规范 Gas 一节仍按 KoalaBear 的 2^24 trace 上限描述，而 leanVM README 已把 KoalaBear 列为历史设计，两者口径不一致 | 由 [1]:L428 与 [14]:L62 对照推出 | inferred |
| E29 | Vitalik（09-09）希望 8288 进入 I-star，描述 tick 约 500 ms、每 tick 外发一个 100–300 kB STARK、链上开销为一个 STARK 加每条 96 字节，并称需要约定 ISA（首选 RISC-V） | [7] | observed |
| E30 | 规范的聚合间隔为 1,000 ms，builder 每间隔的 STARK 开销约 256 kB，与推文的 500 ms、100–300 kB 分别不同和吻合 | [1]:L45、L407；[7] | observed |
| E31 | 私有 AA、“Proof Singularity”、ISA 选择、“不再加预编译”都没有出现在 8288 规范中 | [1] 全文通读 | observed |
| E32 | SPHINCS- 是 keccak 版 SPHINCS+ 变体（签名 3,704–6,512 B），作者说明只有 leanSPHINCS 能在聚合电路中原生验证，SPHINCS- 需要 client-side STARK 包装 | [13] §5–§6 | observed |
| E33 | 按当前草案，“自选签名或隐私证明经 client-side STARK 进入 8288”不可用，因为 leanSTARK 无效、VK 只是 hash、ISA 未定 | 由 E6、E15 与 [12] 推出 | inferred |
| E34 | Vitalik（10-19）称预编译和 EVM 是放密码学的错误位置，calldata 实际上限约 8 MB/s，并主张“EIP-8288 maximalism”与不再新增预编译 | [8] | observed |
| E35 | 在手机端为 Falcon / ML-DSA / 隐私电路做 client-side leanVM 证明的成本，没有找到一手基准 | 检索 [14][12][1] 均无；推文 [8] 仅为断言 | speculative |
| E36 | Magicians 帖中 Vitalik 对格签名的回答是“strong preference to keep the base layer purely hash-based … maintain less total infrastructure”；全帖 13 楼没有递归深度或 soundness 的讨论 | [11] 5 楼与全帖 | observed |
| E37 | 社区指出聚合证明只证明已纳入依赖有效，不证明 builder 没有遗漏收到的有效依赖（omission accountability） | [11] 3、8、11 楼 | observed |
| E38 | ethresear.ch ISA 帖认为 vk_hash 是占位，证明系统级 VK 会随 leanVM 升级变化、破坏不可升级合约，并建议把 0x11 换成以 program_id = hash(ISA 版本, 程序字节) 标识的 program scheme | [12] 正文 | observed |
| E39 | decentrek 声称 8288 使“节点越多、可处理的签名/证明越多”、每节点证明带宽恒定、builder 硬件要求不升、验证者只验一个证明、任意签名可经 STARK 包装 | [9]；[10] | observed |
| E40 | “带宽恒定”只对证明部分成立：交易正文仍要广播一次，wrapper 中的依赖列表与交易哈希随交易量线性增长，首跳还要携带原始签名或 STARK | 由 E17、E18、[1]:L346 与 [7] 推出 | inferred |
| E41 | 规范没有把聚合工作分配给不同节点，每个节点都聚合整个活跃池，也没有任何证明激励，所以“节点越多容量越大”缺少机制支撑 | 由 E18 与 [1] 全文（无激励条款）推出；[5] Open questions 承认 CL 也无显式奖励 | inferred |
| E42 | 按 EIP-8292 的实测，1,000 个签名的单消息聚合在 2 / 8 / 16 核机器上分别约需 11 / 3.7 / 2.6 s，都超过 8288 的 1,000 ms 间隔（XMSS / CL 场景） | [5]:L88–93 | observed |
| E43 | “每秒数万笔 PQ / 隐私交易”没有一手依据；按 33,000 gas/条、12 s slot 计，1 万笔/秒仅依赖 gas 就约需每块 4×10⁹ | 由 E24 推算；[10] 无来源 | speculative |
| E44 | leanVM 自述为“minimal hash-based zkVM”，声称 128-bit ROM（64-bit QROM），形式化验证进行中、尚未生产就绪，BLAKE2s 是占位，计划迁到 rv64im 并加入 zk | [14]:L7、L47–60 | observed |
| E45 | EIP-8292 称当前 leanVM 实例约为 124 位经典、62 位量子安全，低于 NIST Level 1，与 README 的 128 / 64 位不一致 | [5]:L163；[14]:L47 | observed |

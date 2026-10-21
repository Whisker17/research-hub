# notes-agglayer：AggLayer 与 EIP-8288 对照（lane: agglayer，台账前缀 G）

> 调研日期 2026-10-21。源码以本地浅克隆 agglayer/agglayer @9f8e6c4（2026-10-19）为准，引用格式 `agglayer/<path>:Lx@9f8e6c4`。EIP-8288 以 `eip-8288@5a4387b.md` 为准。L1 合约取 agglayer-contracts `contracts/AgglayerManager.sol`，该文件在 main 上最后一次修改的 commit 是 1c00e15（2025-09-23，通过 GitHub API 查到；用 readable 模式抓取，没有行号，按函数名引用）。

---

## Q1 “AggLayer 也在做类似 EIP-8288 的事”是否成立？

**答案**：部分成立。相似的只有“在一个证明程序里验证另一份证明”这个技术手段：AggLayer 的 pessimistic proof（PP）程序在 SP1 里调用 `verify_sp1_proof`，验证链方提交的 aggchain proof。不相似的有三点：拓扑（固定的一层组合，逐链、逐证书各出一份证明，各自上 L1）、目的（跨链桥记账与状态认证，不是交易签名/证明的 mempool 聚合）、执行者（一个持有 trusted-aggregator 权限的 AggLayer 节点加 SP1 prover network，不是去中心化的 mempool 节点）。在 @9f8e6c4 的源码里，**没有**找到“把多条链的证书聚成一份证明再上 L1”的路径。

**依据**
- 证明套证明：`AggchainProof::verify_aggchain_proof` 先拼出公开值（前后 local exit root、l1_info_root、origin_network、aggchain_params、imported bridge exits 承诺），再在 zkVM 里调用 `sp1_zkvm::lib::verify::verify_sp1_proof(&self.aggchain_vkey, &public_values.hash())`（agglayer/crates/pessimistic-proof-core/src/aggchain_data/aggchain_proof.rs:L21-38@9f8e6c4）。SP1 官方文档把这个 syscall 定义为“在 SP1 里验证 SP1 证明”的聚合/递归接口 [15]。
- 逐证书结算：`CertificateTask::build_settlement_job` 从**单个**证书的 SP1 证明里取出 `PessimisticProofOutput`，按 `rollup_id = output.origin_network` 构造 `verifyPessimisticTrustedAggregator(rollup_id, …, proof, custom_chain_data)` 的 calldata，作为一个 settlement job 提交（agglayer/crates/agglayer-certificate-orchestrator/src/certificate_task.rs:L379-446@9f8e6c4，calldata 在 L431-438）。L1 函数签名同样一次只收一个 `rollupID` 和一个 `proof` [12]。
- 同一条链同时只有一个证书在处理：源码注释写 “until we update the storage we cannot have multiple certificates inflight”（certificate_task.rs:L254-258@9f8e6c4）。
- PP 程序的入口一次只读一个 `NetworkState` 和一个 `MultiBatchHeader`，提交一份输出（agglayer/crates/pessimistic-proof-program/src/main.rs:L8-19@9f8e6c4）。

**不确定之处**
- 只查了 agglayer 主仓库这一个 commit，以及 AgglayerManager 的这一个函数。别的仓库（例如 agglayer/provers、aggkit）或路线图里是否计划做跨链聚合，没有查到一手说明。
- “AggLayer 在做类似的事”这个说法最初出自哪里，在 brief 给的四条推文里都没有找到（推文原文里没有提到 AggLayer）。

---

## Q2 AggLayer 怎么做

### 2.1 Pessimistic proof 证明什么
**答案**：给定一条链的旧状态（Local Exit Tree、Local Balance Tree、Nullifier Tree 的根）和一份证书（出桥的 bridge exits、入桥的 imported bridge exits、余额证明），PP 证明“把这些操作作用到旧状态上，得到声明的新状态”，并且做到以下几点：入桥记录必须在 L1 info root 里有包含证明；nullifier 不能重复；非本链原生代币的余额不能下溢（不能提走超过存入的数额）；链的认证数据（ECDSA / 多签 / aggchain proof）有效。

**依据**
- 状态的三棵树：`NetworkState { exit_tree, balance_tree, nullifier_tree }`（agglayer/crates/pessimistic-proof-core/src/local_state/mod.rs:L21-29@9f8e6c4）。
- 入桥：在 L1 info root 下验证包含路径（L85-91），用 nullifier 的非包含证明更新 nullifier 树（L93-96），本链原生代币跳过余额记账（L100-104）。
- 出桥：余额 `checked_sub`，下溢时报 `BalanceUnderflowInBridgeExit`（L157-161），最后用旧余额和 Merkle 路径更新余额树（L165-173）。
- 总流程：`generate_pessimistic_proof` 依次执行 `apply_batch_header` → 构造 `ConstrainedValues` → `aggchain_data.verify(...)` → 算出新的 pessimistic root，输出 `PessimisticProofOutput`（agglayer/crates/pessimistic-proof-core/src/proof.rs:L236-284@9f8e6c4，aggchain 验证在 L254）。
- 公开输出包含 prev_local_exit_root、prev_pessimistic_root、l1_info_root、origin_network、aggchain_hash、new_local_exit_root、new_pessimistic_root（proof.rs:L153-171@9f8e6c4）。
- 官方文档：先用原生 Rust 跑一遍（Step 2），通过后用同样的程序和输入在 SP1 里证明（Step 3，经 Succinct 的 SP1 Prover Network），AggLayer 节点在本地用 SP1 verifier 验证返回的证明（Step 4）。安全目标是“被攻破的链提走的不能超过它的存款”[13]。

### 2.2 链上验证与证明形态
**答案**：最终上 L1 的是 SP1 证明的 **PLONK 包装**（BN254）。L1 合约 `AgglayerManager.verifyPessimisticTrustedAggregator` 只允许持有 `TRUSTED_AGGREGATOR_ROLE` 的地址调用。合约自己重算公开输入：上一次的 LER 和 PP root、l1InfoRoot、rollupID、从该链 aggchain 合约读出的 `getAggchainHash(aggchainData)`、新 LER、新 PP root。然后，ALGateway 类型的链经 `aggLayerGateway.verifyPessimisticProof` 验证（证明前 4 字节是 PP selector），Pessimistic 类型的链经 `ISP1Verifier(rollup.verifier).verifyProof(rollup.programVKey, …)` 验证 [12]。

**依据**
- 合约 NatSpec 写的是 `@param proof SP1 proof (Plonk)`，函数修饰符是 `onlyRole(_TRUSTED_AGGREGATOR_ROLE) nonReentrant` [12]。
- 节点端按 verifier type 决定要不要在证明前加 `PESSIMISTIC_PROOF_PROGRAM_SELECTOR`；遇到 `StateTransition` 类型直接拒绝（certificate_task.rs:L412-424@9f8e6c4）。
- 节点支持的 SP1 证明模式有 Core / Compressed / Plonk / Groth16（agglayer/crates/agglayer-sp1/src/mode.rs:L5-10@9f8e6c4）。当前接受策略是“可读 v5、v6，只执行、只写 v6”（agglayer/crates/agglayer-sp1/src/policy.rs:L13-17@9f8e6c4）。SP1 文档说 V6 引入了 Hypercube [17]，所以可以推断 @9f8e6c4 生成的是 SP1 Hypercube 证明（inferred）。
- SP1 安全模型：用 gnark 的 Groth16 或 PLONK over BN254 把 STARK 压成 SNARK，再拿去链上验证；PLONK 用的是 Aztec Ignition 通用可信设置 [16]。
- README：PP 的二进制在 L1 上由 vkey selector 唯一标识，selector 由 `pessimistic-proof-program` 的主版本号派生（agglayer/README.md:L173-175@9f8e6c4）。

### 2.3 Certificate 与节点处理流程
**答案**：链（通过 aggkit 的 AggSender）提交 certificate。节点里的 `CertificateTask` 把它从 Pending 推进到 Proven（certifier 生成 PP），再到 Candidate（构造 `verifyPessimisticTrustedAggregator` calldata，交给 settlement service），最后到 Settled（L1 交易成功）。Settlement service 负责 nonce、重试、重组处理，还提供管理员干预接口。

**依据**
- 状态机：`process_from_pending → certify_pending → process_from_proven → build_settlement_job → submit_settlement_job → process_from_candidate → wait_for_settlement → finalize_settlement`（certificate_task.rs:L263-376、L379-446@9f8e6c4）。
- Settlement service 的管理员接口包括 abort、reload、插入外部 attempt、强制删除结果。源码注释说，强制删除一个真实结果之后，“只剩结算合约的重放保护挡在作业和双重结算之间”（agglayer/crates/agglayer-settlement-service/src/settlement_service.rs，`admin_force_remove_settlement_job_result` 的注释@9f8e6c4）。
- AggSender 每个 epoch 收集桥事件、构造证书、签名后提交给 AggLayer 生成 PP（Polygon 文档 aggkit components，只当线索，没有深读）。

### 2.4 Aggchain data 的三种模式
**答案**：`AggchainData` 是一个枚举，有三种取值：`LegacyEcdsa { signer, signature }`、`MultisigOnly(MultiSignature)`、`MultisigAndAggchainProof { multisig, aggchain_proof }`。注释写明它“禁止两者都没有”。aggchain proof 只出现在第三种里，和多签一起出现；多签可以是空集、阈值 0（有专门的 `EMPTY_MULTISIG_HASH`），所以“只有 aggchain proof”在编码上等于“空多签 + aggchain proof”。

**依据**
- 枚举定义：agglayer/crates/pessimistic-proof-core/src/aggchain_data/mod.rs:L31-51@9f8e6c4。
- 验证分派：LegacyEcdsa → `legacy_ecdsa`（L66-68）；MultisigOnly → 对 v3 承诺验多签（L69-79）；MultisigAndAggchainProof → 多签签的是带 `aggchain_params` 的承诺（注释 “signs the same used by the stark”），然后 `aggchain_proof.verify_aggchain_proof(...)`，失败时 panic（L80-97，调用在 L95）。
- 多签：签名数不能多于登记的签名者、有效签名数不能少于阈值，逐个用 ECDSA 从 prehash 恢复地址并与登记的签名者比对（agglayer/crates/pessimistic-proof-core/src/aggchain_data/multisig.rs:L61-97@9f8e6c4）。
- aggchain_hash：三种模式都按 “ConsensusType1” 计算，结果是 `keccak(consensus_type=1 ‖ aggchain_vkey ‖ aggchain_params ‖ multisig_hash)`；LegacyEcdsa 被映射成 1-of-1 多签（agglayer/crates/pessimistic-proof-core/src/aggchain_data/aggchain_hash.rs:L43-71、L76-85@9f8e6c4；空多签哈希常量在 L31-34）。L1 合约从链的 aggchain 合约里读 `getAggchainHash`，写进公开输入 [12]，这样链在 L1 上登记的 vkey / 多签集合就和 PP 绑在了一起（interpretation）。

### 2.5 PQ 定位
**答案**：没有找到 AggLayer 面向后量子的设计。端到端的验收路径里至少有三处非 PQ 组件：(a) 链上验收的是 BN254 上的 PLONK（基于配对）；(b) 链方认证用 secp256k1 ECDSA（单签或多签）；(c) SP1 Hypercube 的内存论证假设 KoalaBear 7 次扩域上椭圆曲线的离散对数是难的 [16]，所以 SP1 证明内部也不只依赖哈希（这是 inferred：Shor 算法对一般椭圆曲线群的 DLP 都有效）。

**依据**：[16] 中 “Security of Elliptic Curves over Extension Fields” 与 “Groth16, PLONK” 两节；multisig.rs:L82-84 的 `recover_address_from_prehash`；[12] 的 PLONK 注释。搜索 “agglayer post-quantum” 没有找到一手材料。

**不确定之处**：SP1 Hypercube 内存论证里的 ECDLP 假设被量子攻破后，对 soundness 的具体影响（能不能伪造证明、需要多大代价），没有一手分析；这里只能说“这个假设不是 PQ 的”。

---

## Q3 与 EIP-8288 的多维对比

| 维度 | EIP-8288（Draft @5a4387b） | AggLayer（@9f8e6c4 + AgglayerManager@1c00e15） |
|---|---|---|
| 目标 | 让 PQ 签名和 STARK 不再逐个上链验证，区块只带一份递归 STARK [1] L14-29 | 跨链桥记账安全（单链的损失不超过它的存款）加上链状态认证 [13] |
| 叶子对象 | `(scheme, data_hash, vk_hash)` 依赖三元组 + witness（签名或 STARK）[1] L167-203 | 一条链一次证书对应的状态转换（exit/balance/nullifier 树）+ 链的认证（ECDSA/多签/aggchain proof）[2][3][7] |
| 谁在何时组合 | mempool 节点每 `AGGREGATION_INTERVAL`（1000ms）各自递归聚合，FOCIL 创建者和 builder 做“同一件事”[1] L276-287、L338 | AggLayer 节点在收到证书后，把 PP 证明外包给 SP1 Prover Network；aggchain proof 由链方事先生成 [13][9] |
| 组合深度 | 结构上不限深度（`AGGREGATED_VK` 作为公开输入）[1] L219 | 应用层固定一层（PP ⊃ aggchain proof）；SP1 内部的分片递归另算 [2][15] |
| 组合语义 | 并集 + 去重 + 丢弃（discard），最后的 deps_hash 必须等于区块依赖的哈希；电路不理解交易 [1] L195-215、L221-227 | 状态连续性（prev root → new root）+ 余额不下溢 + nullifier 不重复 + 认证；依赖链的业务语义（application-aware）[6][7] |
| 跨主体聚合 | 有：不同用户、不同节点的证明合并成一份 | 没有：逐链、逐证书，各自一份 PP、一笔 L1 交易 [9][12] |
| 最终验收者 | 所有验证节点，作为区块有效性条件 [1] L221-227 | L1 合约 `verifyPessimisticTrustedAggregator`，只有 trusted aggregator 能调用 [12] |
| 证明系统 / PQ | leanSTARK / leanSPHINCS（以哈希为基础）；AGGREGATED_VK、DEPS_HASH 仍是 TBD [1] L37-49 | SP1 Hypercube STARK（内存论证含 ECDLP 假设）→ PLONK/BN254 上链；ECDSA 认证；非 PQ [16][12] |
| 递归安全假设 | 明确写出“递归 STARK 必须 sound……广泛相信成立”，承认这给端到端形式化带来困难 [1] L523 | SP1 明确假设“递归步数增加不带来安全损失”，并通过限制电路深度来避开 2025/118 那类攻击 [16] |
| 信任 / 活性 | 去中心化 mempool + builder + FOCIL；规范说没有新增中心化压力（这是作者的说法）[1] L341-346 | 单一 trusted aggregator 角色控制结算（活性/审查）；证明外包给 Succinct 网络；合约可升级（reinitializer）；vkey 由 L1 的 selector/rollup 配置管理 [12][11][13] |
| 成熟度 | Draft，Reference Implementation 写着 TBD [1] L5、L513 | PP 自 2025-02-03 起在主网上线 [18]；README 仍警告“代码仍在审计中”[11] L58-59 |

**不确定之处**：AgglayerManager 的升级管理员、`TRUSTED_AGGREGATOR_ROLE` 持有者、`AgglayerGateway` 的 selector 管理权限，在主网上分别由谁控制，没有查链上状态。

---

## Q4 其他“很多证明聚合成一个”的项目（对照）

| 项目 | 做法（一手来源） | 和 8288 的区别 |
|---|---|---|
| SP1 proof aggregation | 用 `verify_sp1_proof` 在 SP1 程序里验证 compressed 证明，可以把不同参与方的证明合成一份以降低上链成本；文档同时提醒：一般情况下证明单个程序比“多证明再聚合”更快更省 [15] | 这是工具层能力，没有网络协议；聚合由应用方或 prover 自己组织 |
| Aligned Proof Aggregation Service | 开发者把证明提交给服务，服务用递归把它们聚成一份证明，在 Ethereum 上验证 [19] | 链下的集中服务，按批次聚合；不是区块有效性条件，也不在 mempool 里分布式进行 |
| NEBRA UPA | 聚合 Groth16 证明（批大小 32），由**单一许可制** aggregator 生成聚合证明，提交给 UPA 合约；用链上提交顺序加惩罚机制提供抗审查 [20] | 单一 aggregator；按应用合约查询“是否已验证”；没有 discard 语义 |
| Starknet SHARP / applicative recursion | 每个语句一到就证明，用 Cairo verifier 两两递归合并，最后把根证明交给 Solidity verifier；“applicative recursion”在合并证明的同时按应用语义合并输入（例如 A→B、B→C 合成 A→C）[21][22] | 由 StarkWare 运营的集中 prover；“applicative”这一支在语义上更接近 AggLayer 的状态连续性，而不是 8288 的“并集 + 丢弃” |

研究者推论（inferred）：这些方案都是“单个运营方 + 链上验证合约”的模式。8288 的独特之处在于两点：把聚合写进协议，作为区块有效性条件；让无许可的 mempool 节点分布式地做递归。还没有找到生产环境里的同类先例。

---

## 概念入门

- **Pessimistic proof（悲观证明）**：AggLayer 假设每条接入链的 prover 都可能出错甚至作恶，于是对每次跨链状态更新单独证明“这条链没有提走超过它在统一桥里余额的资产”。这样一条链被攻破时，损失的上限是它自己的存款（“爆炸半径”），不会扩散到别的链。它保护的是桥的账本，不保证链内交易都正确。
- **Local Exit Tree / Local Balance Tree / Nullifier Tree**：一条链在 AggLayer 视角下的三棵 Merkle 树，分别记录出桥记录、各代币余额、已领取的入桥记录（防重复领取）。PP 证明的是这三棵树的根从旧值正确地变到新值。
- **Certificate（证书）**：链定期提交给 AggLayer 的一个数据包，包含出入桥记录、余额证明和认证数据（签名或 aggchain proof）。AggLayer 节点为每个证书生成一份 PP，然后单独结算到 L1。
- **Aggchain proof**：链自定义的证明（例如对 OP Stack 链做全执行证明）。它的公开值和 PP 的约束值绑定（前后 LER、L1 info root 等），由 PP 程序在 SP1 里用 `verify_sp1_proof` 验证，是“证明里验证证明”的一个具体例子。
- **SP1 递归 / deferred proof verification**：SP1 把长程序切成分片，分别证明后递归压缩成一份证明；应用还可以在程序里调用 `verify_sp1_proof` 验证另一份 compressed 证明。被验证的证明是“延后”验证的，最终证明必须用能完成这一步的模式（Core 模式不行）[16]。
- **STARK→SNARK 包装（wrap）**：STARK 证明较大、在 EVM 上验证很贵，所以通常最后再用 Groth16 或 PLONK（BN254 曲线）证明“STARK verifier 接受了它”。链上只验证这份小 SNARK。代价是引入配对密码学和可信设置，而这两者都不是后量子安全的。
- **Trusted aggregator**：L1 合约里有权调用结算函数的角色。证明能保证提交内容的正确性（安全性），但“交不交、什么时候交”（活性、抗审查）由持有这个角色的一方决定。
- **Applicative recursion（应用感知递归）**：递归合并时不只把两份证明压成一份，还按应用语义把两份公开输入合成一份（如 A→B、B→C 合成 A→C）。与之相对的是“应用无关”的递归，它只减少证明的数量，输入数量保持不变 [22]。

---

## 资料中被修正的地方（对照外部调研 eip-8288-deep-dive.md）

1. **“没有据此推断所有接入链按同一批次聚成一份”** → 现在可以说得更确定：@9f8e6c4 是逐证书、逐 rollup 调用 `verifyPessimisticTrustedAggregator`，没有跨链单一证明（certificate_task.rs:L379-446；[12]）。外部调研对此留了口子，结论应当收紧。
2. **“SP1 内部使用 STARK，不足以推出端到端 PQ”** → 方向对，但说得不够：SP1 Hypercube 的内存论证本身依赖扩域椭圆曲线上的 ECDLP [16]，所以连“内层 STARK 是 PQ 的”这一前提也不成立（inferred）。外部调研的“PQ 内层证明 + 非 PQ 外层验收”框架不适用于 SP1 Hypercube。
3. **外层封装**：外部调研只说“包含 Groth16 和 PLONK 路径”；L1 合约的 NatSpec 明确写着 AggLayer 的 PP 用 **PLONK** [12]。
4. **“最终验收：相关验证器与桥接结算合约”** 太笼统：应该具体写成 `AgglayerManager.verifyPessimisticTrustedAggregator`，它只允许 `TRUSTED_AGGREGATOR_ROLE` 调用，并且用从 aggchain 合约读出的 `getAggchainHash` 重算公开输入 [12]。外部调研的对比表没有体现 trusted aggregator 这一信任/活性假设。
5. **“AggLayer 已采用证明组合来统一跨链验证；EIP-8288 希望把类似能力提升为通用协议机制”** 有些过头：AggLayer 的应用层组合是固定的一层，不做跨主体聚合；8288 的核心是不限深度、多方、并集+丢弃。两者的“类似”只停留在“证明里验证证明”这个原语上。
6. **引用没有固定版本**：外部调研引用的是 `raw.githubusercontent.com/.../main/...`，没有 commit。本次在 @9f8e6c4 核对过，代码片段一致。
7. **没有提到 SP1 自己的递归安全假设**：SP1 文档明确假设“递归步数增加不带来安全损失”，并通过限制电路深度来避开 ePrint 2025/118 的攻击 [16]。这直接关系到 brief 的 Q4，外部调研没有引用。
8. **官方文档和源码不一致（不是外部调研的错误，在这里记录）**：Polygon 的 Aggchain Proof 文档写的是 `CONSENSUS_TYPE = 0`（ECDSA）和 `= 1`（generic）两种 [14]；@9f8e6c4 源码里三种模式都按 ConsensusType1 计算哈希，ECDSA 被当作 1-of-1 多签（aggchain_hash.rs:L76-85）。另外 `aggchain_data/mod.rs:L3-7` 的模块注释仍写着“只能是一个 ECDSA 签名或一个 SP1 stark 证明”，和下方三种模式的枚举对不上，这条注释已经过时。

---

## 来源

1. **PRIMARY** eip-8288@5a4387b.md（ethereum/EIPs @5a4387b）：8288 的规范文本，包括依赖三元组、递归语句、mempool 聚合、区块有效性、信任假设、Draft/TBD 状态。
2. **PRIMARY** agglayer/crates/pessimistic-proof-core/src/aggchain_data/aggchain_proof.rs@9f8e6c4：PP 程序里用 `verify_sp1_proof` 验证 aggchain proof，以及公开值的构成。
3. **PRIMARY** agglayer/crates/pessimistic-proof-core/src/aggchain_data/mod.rs@9f8e6c4：三种 AggchainData 模式及其验证分派。
4. **PRIMARY** agglayer/crates/pessimistic-proof-core/src/aggchain_data/multisig.rs@9f8e6c4：多签的阈值规则和 ECDSA 恢复。
5. **PRIMARY** agglayer/crates/pessimistic-proof-core/src/aggchain_data/aggchain_hash.rs@9f8e6c4：aggchain_hash 的构成；所有模式都按 ConsensusType1 计算。
6. **PRIMARY** agglayer/crates/pessimistic-proof-core/src/proof.rs@9f8e6c4：`generate_pessimistic_proof` 的流程和 PP 公开输出。
7. **PRIMARY** agglayer/crates/pessimistic-proof-core/src/local_state/mod.rs@9f8e6c4：三棵树，以及余额下溢、nullifier、包含证明这些检查。
8. **PRIMARY** agglayer/crates/pessimistic-proof-program/src/main.rs@9f8e6c4：SP1 入口一次处理一个网络状态和一个 batch header。
9. **PRIMARY** agglayer/crates/agglayer-certificate-orchestrator/src/certificate_task.rs@9f8e6c4：证书状态机；逐证书构造 `verifyPessimisticTrustedAggregator` calldata。
10. **PRIMARY** agglayer/crates/agglayer-sp1/src/{mode.rs,policy.rs}@9f8e6c4：SP1 证明模式；只执行、只写 v6。
11. **PRIMARY** agglayer/README.md@9f8e6c4：服务定位（接收 → 验证 → 交给 L1 结算）、仍在审计的警告、依赖 Succinct Prover Network、vkey selector 版本策略。
12. **PRIMARY** agglayer-contracts `contracts/AgglayerManager.sol`（main，最后修改 1c00e15，2025-09-23；访问日期 2026-10-21）：L1 验证入口、TRUSTED_AGGREGATOR_ROLE、PLONK 注释、公开输入重算、Gateway/ISP1Verifier 分支。
13. **PRIMARY** Polygon Docs “Pessimistic Proof – Architecture Overview”（https://docs.polygon.technology/interoperability/agglayer/core-concepts/pessimistic-proof/architecture ，访问日期 2026-10-21）：Step 0–4 流程、SP1 Prover Network、财务隔离目标。
14. **PRIMARY**（部分内容过时）Polygon Docs “Aggchain Proof”（https://docs.polygon.technology/interoperability/agglayer/core-concepts/state-transition-proof/aggchain-proof ，2026-10-21）：aggchain proof 的公开值、FEP 验证，以及 CONSENSUS_TYPE 0/1 的描述。
15. **PRIMARY** Succinct Docs “Proof Aggregation”（https://docs.succinct.xyz/docs/sp1/writing-programs/proof-aggregation ，2026-10-21）：`verify_sp1_proof` 的语义、需要 compressed 证明、什么时候不必聚合。
16. **PRIMARY** Succinct Docs “Security Model”（https://docs.succinct.xyz/docs/sp1/security/security-model ，2026-10-21）：ROM/Poseidon2 假设、“递归不损失安全”假设、为避开 2025/118 而限制深度、ECDLP 内存论证、Groth16/PLONK over BN254、可信设置、deferred proof 必须用能完成验证的模式。
17. **PRIMARY** Succinct Docs “Introduction”（https://docs.succinct.xyz/docs/sp1/introduction ，2026-10-21）：“SP1 V6 introduces Hypercube”。
18. **PRIMARY**（官方博客）agglayer.dev “Pessimistic Proofs Live on Agglayer Mainnet”（2025-02-03，https://www.agglayer.dev/blogs/major-development-upgrade-for-a-multistack-future-pessimistic-proofs-live-on-agglayer-mainnet ）：PP 主网上线的时间。
19. **PRIMARY** Aligned Docs “Proof Aggregation Service”（https://docs.alignedlayer.com/architecture/2_aggregation_mode ，2026-10-21）：递归聚合服务的做法。
20. **PRIMARY** NEBRA “UPA protocol specification” / “How it works”（https://docs.nebra.one/upa-protocol-specification ，2026-10-21）：单一许可制 aggregator、Groth16 批量聚合、抗审查机制。
21. **PRIMARY** Starknet Docs “SHARP”（https://docs.starknet.io/learn/protocol/sharp ，2026-10-21）：递归树模型，最终交给 Solidity verifier。
22. **PRIMARY**（StarkWare 官方博客）“Recursive STARKs”（https://www.starknet.io/blog/recursive-starks/ ，2026-10-21）：applicative recursion 的定义。
23. 线索：research/eip-8288-deep-dive.md（ChatGPT Deep Research，2026-10-21）。

暂不采用：L2BEAT 的 SP1 Hypercube 页面（二手，只作为线索：它称 Hypercube 有“98 bits proven security”，这里不采用）；theblock 的旧新闻（2024 年，已过时）。

---

## 开放问题

1. 主网上 `TRUSTED_AGGREGATOR_ROLE`、AgglayerManager 升级管理员、AgglayerGateway selector/verifier 路由，分别由谁控制？有没有 timelock？（需要查链上状态）
2. AggLayer 是否计划把多链证书聚合成一份 L1 证明？在 agglayer/provers、aggkit 或官方路线图里，有没有一手说明？
3. 主网上当前有多少条链用 `MultisigAndAggchainProof` 模式，有多少还在用 LegacyEcdsa？也就是说，aggchain proof 这条“证明套证明”的路径实际用到了什么程度？
4. SP1 Hypercube 的 ECDLP 假设在量子攻击下对 soundness 的影响，有没有 Succinct 或第三方的分析？
5. SP1 说“递归不损失安全”是一个假设；它和 Thaler 批评的 ROM/递归问题怎么对应，交给递归安全那一路做交叉核对。

---

## 台账

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| G1 | AggLayer 的 PP 程序在 SP1 zkVM 里调用 `verify_sp1_proof` 验证 aggchain proof，属于“证明里验证证明” | [2] aggchain_proof.rs:L32-38@9f8e6c4 | observed |
| G2 | 被验证的 aggchain proof 的公开值包括前后 local exit root、l1_info_root、origin_network、aggchain_params 和 imported bridge exits 承诺 | [2] aggchain_proof.rs:L21-30@9f8e6c4 | observed |
| G3 | AggchainData 只有三种模式：LegacyEcdsa、MultisigOnly、MultisigAndAggchainProof | [3] mod.rs:L31-51@9f8e6c4 | observed |
| G4 | aggchain proof 只能和多签一起出现，多签签的是包含 aggchain_params 的承诺 | [3] mod.rs:L80-95@9f8e6c4 | observed |
| G5 | 多签允许空集、阈值 0（有专门的 EMPTY_MULTISIG_HASH），所以“只有 aggchain proof”在编码上是空多签加 aggchain proof | 由 G4 和 [5] aggchain_hash.rs:L31-34 推出：空多签有约定的哈希值，阈值 0 时阈值检查 [4] multisig.rs:L69-75 能通过 | inferred |
| G6 | 多签按阈值验证，用 ECDSA 从 prehash 恢复地址，再与登记的签名者比对 | [4] multisig.rs:L61-97@9f8e6c4 | observed |
| G7 | 源码里三种模式的 aggchain_hash 都按 ConsensusType1 计算，LegacyEcdsa 被映射为 1-of-1 多签 | [5] aggchain_hash.rs:L43-71、L76-85@9f8e6c4 | observed |
| G8 | Polygon 文档把 ECDSA 写成 CONSENSUS_TYPE 0，和 @9f8e6c4 源码的哈希方式不一致 | [14] Aggchain Proof 页；对照 G7 | observed |
| G9 | PP 证明的是：一份证书作用到旧的 exit/balance/nullifier 树上，得到新的状态承诺和新的 pessimistic root | [6] proof.rs:L236-284@9f8e6c4；[7] local_state/mod.rs:L21-29 | observed |
| G10 | PP 对出桥做余额 checked_sub，下溢时拒绝，以此防止提走超过余额的资产 | [7] local_state/mod.rs:L157-161@9f8e6c4 | observed |
| G11 | PP 对入桥检查 L1 info root 下的包含证明，并用 nullifier 树防止重复领取 | [7] local_state/mod.rs:L85-96@9f8e6c4 | observed |
| G12 | 本链原生代币的出入桥不计入余额树约束 | [7] local_state/mod.rs:L100-104、L144-147@9f8e6c4 | observed |
| G13 | 官方文档说明 PP 先用原生 Rust 执行，再经 SP1 Prover Network 证明，然后由 AggLayer 节点本地验证 | [13] Architecture Overview Step 2–4 | observed |
| G14 | PP 的安全目标是：被攻破的链损失的上限是它自己的存款，不保证链内交易都正确 | [13] Security Guarantees；后半句由 G9、G10 推出：PP 只约束桥账本 | inferred |
| G15 | AggLayer 节点为每个证书单独构造一笔 `verifyPessimisticTrustedAggregator(rollupID, …)` 结算交易 | [9] certificate_task.rs:L379-446@9f8e6c4 | observed |
| G16 | 在 @9f8e6c4 中没有把多条链的证书聚合成一份 L1 证明的路径 | 由 G15、[8] main.rs:L8-19（一次一个网络状态）和 [12] 函数签名（一次一个 rollupID）推出 | inferred |
| G17 | 同一网络当前不能同时有多个证书在处理 | [9] certificate_task.rs:L254-258@9f8e6c4 注释 | observed |
| G18 | L1 结算函数只允许 TRUSTED_AGGREGATOR_ROLE 调用 | [12] AgglayerManager.sol@1c00e15 `verifyPessimisticTrustedAggregator` 修饰符 | observed |
| G19 | AggLayer 结算的活性和抗审查依赖 trusted aggregator 角色的持有者；安全性由证明保证 | 由 G18 推出：只有该角色能提交结算，但提交的内容要过证明验证 | inferred |
| G20 | L1 合约用上一次的 LER/PP root、l1InfoRoot、rollupID、aggchain 合约返回的 aggchainHash、新 LER/PP root 重算 PP 公开输入 | [12] `_getInputPessimisticBytes`（ALGateway 分支） | observed |
| G21 | AggLayer 上 L1 的 PP 证明是 SP1 的 PLONK 包装 | [12] NatSpec `@param proof SP1 proof (Plonk)` | observed |
| G22 | SP1 用 gnark 的 Groth16/PLONK over BN254 压缩 STARK 后上链，PLONK 使用 Aztec Ignition 通用可信设置 | [16] Groth16/PLONK 与 Trusted Setup 两节 | observed |
| G23 | AggLayer @9f8e6c4 只执行、只写 SP1 v6 证明 | [10] policy.rs:L13-17@9f8e6c4 | observed |
| G24 | SP1 v6 就是 SP1 Hypercube | [17] Introduction | observed |
| G25 | SP1 Hypercube 的内存论证假设 KoalaBear 7 次扩域上椭圆曲线 DLP 是难的 | [16] “Security of Elliptic Curves over Extension Fields” | observed |
| G26 | AggLayer 当前的端到端验证路径不是后量子安全的（PLONK/BN254、ECDSA、SP1 内部的 ECDLP 假设） | 由 G6、G21、G22、G25 推出：这几个组件都依赖量子可破的离散对数/配对假设 | inferred |
| G27 | 没有找到 AggLayer 面向 PQ 的一手设计材料 | 搜索 “agglayer post-quantum” 没有一手结果；无法证明“不存在”，所以是推测 | speculative |
| G28 | SP1 明确假设递归步数增加不带来安全损失 | [16] “Recursion's Overhead in Security” | observed |
| G29 | SP1 通过让整体电路深度小于 Poseidon 的深度来避开 ePrint 2025/118 的 Fiat–Shamir 攻击 | [16] Hash Functions and ROM 一节 | observed |
| G30 | EIP-8288 在 Security Considerations 中把“递归 STARK 的 soundness”列为信任假设，并承认它增加了端到端形式化的难度 | [1] eip-8288@5a4387b.md:L523 | observed |
| G31 | EIP-8288 的递归电路做的是“验证输入、并集、去重、丢弃”，最终 deps_hash 必须等于区块依赖的哈希 | [1] eip-8288@5a4387b.md:L167-205、L221-227 | observed |
| G32 | EIP-8288 把 AGGREGATED_VK 作为公开输入，以支持不限深度的递归 | [1] eip-8288@5a4387b.md:L219 | observed |
| G33 | EIP-8288 的聚合由 mempool 节点、FOCIL 创建者和 builder 执行同一项任务，mempool 节点每 1000ms 递归一次 | [1] eip-8288@5a4387b.md:L43-45（常量）、L276-287、L338 | observed |
| G34 | AggLayer 的应用层组合是固定的一层（PP 包含 aggchain proof）；8288 结构上允许多方、不限深度的组合 | 由 G1、G3、G16 与 G32、G33 推出 | inferred |
| G35 | AggLayer 的组合语义是状态连续性加余额/nullifier 约束（依赖应用语义），8288 的组合语义与应用无关（并集/丢弃） | 由 G9–G11 与 G31 推出；[1] L215 “电路不理解交易” | inferred |
| G36 | AggLayer 的 PP 自 2025-02-03 起在主网上线 | [18] agglayer.dev 官方博客 | observed |
| G37 | AggLayer README 仍警告“代码仍在审计中、API 可能变化” | [11] README.md:L58-59@9f8e6c4 | observed |
| G38 | EIP-8288 仍是 Draft，Reference Implementation 写着 TBD，AGGREGATED_VK、DEPS_HASH 也是 TBD | [1] eip-8288@5a4387b.md:L5、L43-44、L513 | observed |
| G39 | SP1 文档认为一般情况下证明单个程序比“多证明再聚合”更快更省，聚合只在少数场景有用 | [15] “When should SP1 proof aggregation be used?” | observed |
| G40 | Aligned、NEBRA UPA、Starknet SHARP 都是由单个运营方/aggregator 把多份证明递归或批量聚合成一份，再交给链上合约验证 | [19] Aggregation Service；[20] “single (permissioned) Aggregator”；[21] SHARP recursion | observed |
| G41 | 在已知的生产系统中，还没有像 8288 那样把递归聚合写进 L1 区块有效性、并由无许可 mempool 节点分布式执行的先例 | 只对照了 G40 中的三个系统和 AggLayer，覆盖面不完整，无法断言 | speculative |
| G42 | “AggLayer 在做类似的事”这一说法的出处，在 brief 给的推文里找不到 | 读过 decentrek_status_2112535053188145367.md 等推文原文，没有提到 AggLayer；其他推文没有逐条全文核对 | speculative |

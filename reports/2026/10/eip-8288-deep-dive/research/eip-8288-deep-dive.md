---
imported_from: ChatGPT Deep Research
imported_at: 2026-10-21
original_file: eip-8288-deep-dive.md
---

# EIP-8288、AggLayer 与 lattice PQ：递归证明在解决什么，又把风险放在哪里？

**研究截止日期：2026 年 10 月 21 日。**

这场讨论不应被简化成“Ethereum 选择哈希，a16z 选择格”，更不应被简化成“递归证明安全”或“递归证明已经被攻破”。

真正需要区分的是四个问题：**用什么签名算法、用什么证明系统、如何组织聚合过程，以及将最终证明放在哪个协议层验证。** EIP-8288、AggLayer 和 a16z 的 Aerie，在这四个维度上的选择并不相同。因此，它们既存在竞争关系，也存在可以组合的空间。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

先给出本文的核心判断：

**EIP-8288 最重要的创新，是把昂贵的密码学验证从“每笔交易在 EVM 内单独执行”，转变为“交易声明验证依赖，网络在传播过程中聚合证明，区块统一满足这些依赖”。** 它是验证架构提案，不是某种新的 PQ 签名算法，也不是完整的 Ethereum 后量子迁移方案。当前仍为 Draft。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

**AggLayer 确实采用了相似的证明组合思想，而且源码中存在明确的“在一个证明程序内验证另一个证明”的调用。** 但它主要服务于跨链状态认证与桥接资产隔离，不是在实现 Ethereum 的通用 PQ 交易内存池。两者技术思想相似，证明的对象和安全边界不同。[GitHub](https://raw.githubusercontent.com/agglayer/agglayer/main/crates/pessimistic-proof-core/src/aggchain_data/aggchain_proof.rs)

**a16z 对递归证明的批评有实质性的理论依据，不能当作单纯的路线宣传；但这些依据也不能直接推出“EIP-8288 已存在可利用漏洞”或“所有递归 STARK 都不安全”。** 当前更准确的判断是：递归组合存在真实的安全建模难点、具体参数论证难点和工程攻击面；支持者需要补足这些论证，批评者也需要说明某个攻击如何适用于具体协议。[Cryptology ePrint Archive](https://eprint.iacr.org/2024/728)

> **资料边界：**你提供的四条 X 链接未能直接读取完整内容，因此本文不对这些帖子逐句转述或归因。关于 Vitalik 和 a16z 的主张，分别采用 Vitalik 在 EIP 讨论区的原始回复、a16z 的正式文章以及 Aerie 论文。本文没有独立复现 benchmark；性能数据均注明其来源和适用范围。

---

## 1. 背景：为什么 PQ 讨论会走到“证明聚合”？

### 1.1 后量子迁移不是替换一个签名函数

一条链的密码学依赖分布在不同位置：用户账户的授权签名、验证者的共识签名、数据承诺，以及应用或 Rollup 使用的有效性证明。即使账户换成 PQ 签名，也不能自动解决其他位置的非 PQ 依赖。Ethereum 的量子抗性路线也将这些问题分开处理。[ethereum.org](https://ethereum.org/roadmap/security/quantum-resistance/)

其中，共识签名尤其依赖聚合：BLS 的一个重要优势，是能将大量验证者签名聚合成很小的对象。但 BLS 不具备后量子安全性，而候选 PQ 签名并不能直接保留同样的原生聚合特性。于是，研究者开始考虑：

> 不一定要把很多签名“合成为另一个签名”，也可以生成一份证明，证明这一批签名都有效。[a16z crypto](https://a16zcrypto.com/posts/article/fast-post-quantum-signature-aggregation-with-lattice-snarks/)

这就是从“签名聚合”走向“证明系统”的原因。

### 1.2 必须分开的四个设计维度

|维度|要回答的问题|典型选择|
|---|---|---|
|签名原语|什么机制证明账户或验证者授权了消息？|哈希签名、格签名|
|证明后端|什么机制证明这些签名验证成功？|哈希型 STARK、格型 SNARK|
|聚合拓扑|一次性证明整批，还是先分别证明再合并？|单层批量证明、递归树、持续递归|
|协议位置|谁消费最终证明？|共识层、执行层内存池、桥接合约|

这张表是理解后续讨论的基础。例如，“格签名 + STARK 聚合”在架构上可以成立；“格签名 + 格型 SNARK + 不递归”则是 Aerie 当前展示的组合。**选择某种签名，不等于必须选择同一类证明后端。** EIP-8288 的长期通用证明方向，正是在尝试把应用密码学与基础层验证接口分开。[LayerZero](https://assets.layerzero.network/pdf/aerie.pdf)

### 1.3 哈希签名与格签名：各自保守在哪里？

**哈希型签名**倾向于将安全依赖集中在哈希函数上，但不同方案的使用约束很不一样。NIST 的 SLH-DSA 是基于 SPHINCS+ 的无状态哈希签名；leanSig 一类面向共识的方案则具有状态或 epoch 使用限制，不能把同一密钥与 epoch 的组合任意重复用于签名。不能把所有哈希签名都当成同一种钱包接口。[NIST Computer Security Resource Center](https://csrc.nist.gov/pubs/fips/205/final)

**格型签名**依赖格上的计算困难问题。ML-DSA 已有 NIST FIPS 204 标准；Falcon 被选入标准化路线。它们与新出现的格型证明系统必须分别评估：**一个签名方案经过标准化评审，并不意味着基于它构造的新 SNARK、聚合协议和实现也获得了同样的验证。**[NIST Computer Security Resource Center](https://csrc.nist.gov/pubs/fips/204/final)

这里也不能把“依赖较少”和“实现较简单”画等号。哈希型基础层可能减少密码学原语种类，却仍然需要复杂的证明协议、递归电路、内存池规则和客户端实现。这正是双方分歧的一部分。

### 1.4 聚合与递归并不是一回事

假设有一批消息、公钥和签名：

\[ (pk_1,m_1,\sigma_1),\ldots,(pk_n,m_n,\sigma_n) \]

单层批量证明可以直接证明：

\[ \forall i,\quad \operatorname{VerifySig}(pk_i,m_i,\sigma_i)=1 \]

递归则更进一步：先由多个参与者分别生成小批次证明，再生成另一份证明，证明这些小批次证明全部验证成功。

前者要求一个证明者获得整批所需的原始材料；后者允许后续参与者利用已有证明继续组合，不必再次取得所有叶子签名。SP1 的官方文档也将这种“在程序中验证已有证明”的能力与普通程序执行区分开来。[Succinct Docs](https://docs.succinct.xyz/docs/sp1/writing-programs/proof-aggregation)

另外，**证明压缩不等于零知识**。不把原始签名发给最终验证者，并不能单独证明协议没有泄露其他信息。Aerie 明确不声称零知识；leanVM 当前也把零知识支持列为后续工作。[GitHub](https://github.com/a16z/aerie)

---

## 2. EIP-8288：把验证依赖变成交易的显式组成部分

### 2.1 它与普通预编译合约有什么根本区别？

通过预编译验证 PQ 签名的直观做法是：

> 交易携带完整签名 → 账户调用预编译 → 每个执行节点执行签名验证。

EIP-8288 的思路是：

> 交易声明“我依赖某个密码学命题成立” → 原始签名或证明在网络中被处理、聚合 → 区块携带统一证明 → 账户检查自己的授权条件与声明是否匹配。

它依赖 EIP-8141 的 frame transaction 模型。可以把 frame 理解为一笔交易内部具有明确职责和执行规则的组成部分；8288 增加的是一种专门声明密码学依赖的 frame，而不是在普通执行过程中随时调用的新验证函数。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8141)

这种设计的意义在于：**密码学验证任务在执行 EVM 业务逻辑之前就已经显式可见。** 内存池不必先执行一大段合约代码，才发现还缺少某份昂贵证明；依赖也不会因为后续业务调用 revert 而突然消失。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

### 2.2 用 Alice 的一笔转账理解完整生命周期

以下是根据提案构造的解释性例子，不是完整交易编码。假设 Alice 已经拥有一个能够使用这套规则的账户，希望向 Bob 转账。

#### 第一步：Alice 声明这笔交易需要什么授权

交易中的依赖可以抽象成：

```
scheme                = leanSPHINCS
data_hash             = 本交易的签名消息
verification_key_hash = Alice 的公钥
```

规范中的每个依赖是三个 32 字节字段，共 **96 字节**。这里的 96 字节是**依赖声明大小**，不是 PQ 签名大小，也不是整笔交易大小。对于当前 leanSPHINCS 类型，最后一个字段实际上直接放入其 32 字节公钥，而不是再对公钥做一次哈希。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

Alice 用自己的私钥生成签名，随后将交易与相应签名材料发给网络。私钥并不交给聚合者。

当前规范还处理了一个细节：交易不能在自身字段中直接包含“覆盖这些字段的交易哈希”，否则会产生自引用。因此，`data_hash` 的全零值被定义为“使用本交易的 `compute_sig_hash(tx)`”。读取旧讨论时，需要注意这一点已经在当前草案中明确。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

#### 第二步：账户检查“这份依赖是不是我的授权”

这是很容易被忽略的一层。

证明“某个公钥对某个消息有有效签名”，不等于证明“Alice 授权了这次转账”。账户仍然必须把声明与自己的规则绑定：公钥必须是账户认可的公钥，消息必须绑定本次交易，而不能是攻击者随便找来的其他消息。

8288 允许合约利用 8141 的 frame introspection 机制读取这些声明。**聚合器负责证明密码学命题成立，账户负责解释该命题是否满足自己的授权策略。**[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

用一个反例理解：攻击者可以合法地对“hello”签名。这个签名完全有效，但不能因此获得转走 Alice 资产的权限。证明系统不会自动补上账户代码遗漏的业务绑定。

#### 第三步：内存池节点把签名变成可继续组合的证明

假设节点 A 收到 Alice 和 Charlie 的交易，节点 B 收到 Bob 的另一笔交易。

节点 A 可以生成证明 \(P_A\)，覆盖 Alice 与 Charlie 的依赖；节点 B 生成 \(P_B\)，覆盖 Bob 的依赖。后续节点不必再逐一处理三份原始签名，而可以验证 \(P_A\)、\(P_B\)，并生成覆盖合并集合的新证明。

当前提案的网络 wrapper 支持携带原始材料，也支持携带已聚合证明；递归聚合在内存池传播过程中持续进行，而不是只在 builder 最后出块时才开始。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

#### 第四步：builder 选择交易，并处理不需要的依赖

现在 builder 只想纳入 Alice 和 Bob，不纳入 Charlie。

单纯“只能合并、不能删减”的聚合会很不方便：已有证明可能覆盖了大量不准备入块的交易。8288 因而采用了“验证输入、合并依赖、去重、丢弃不需要的依赖”的组合方式。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

可以将其理解为：

\[ D_{\text{out}} = \left(\bigcup_j D_j \;\cup\; D_{\text{direct}}\right) \setminus D_{\text{discard}} \]

这里的“丢弃”**不意味着免除区块中某笔交易的验证要求**。它只是让 builder 从已证明的大集合中选出子集。

最终还必须满足：

\[ \operatorname{Commit}(D_{\text{out}}) = \operatorname{Commit}(\operatorname{Dependencies}(\text{实际区块})) \]

所以，builder 不能把 Alice 的交易放进区块，却偷偷删掉她所需的签名依赖。

#### 第五步：其他节点验证区块

节点从实际区块交易中重新提取依赖，计算依赖承诺，再用协议规定的聚合验证键检查根证明。同时，交易仍须满足其他正常有效性规则。**不是 builder 声称自己验证过就算通过，也不是其他节点只看一个不与区块内容绑定的证明。**[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

因此，8288 并没有消除验证，而是改变了验证的分工：

**叶子签名和证明被分布式处理；最终节点检查聚合结果，以及它是否准确覆盖本区块的依赖。**

### 2.3 为什么 Vitalik 支持这个方向？

Vitalik 在 EIP 讨论区对 lattice 问题的直接回复是：希望尽量减少基础层依赖，并强烈倾向于让基础层保持纯哈希路线，从而减少长期维护的基础设施。[Fellowship of Ethereum Magicians](https://ethereum-magicians.org/t/eip-8288-frame-type-for-pq-sig-and-stark-aggregation/28723)

结合提案，可以将其设计动机理解为三点。

首先，如果执行层和未来共识层都需要处理大量 PQ 签名，那么复用证明工具链，比两边各自维护一套聚合机制更有吸引力。但两边的具体签名需求仍有区别：提案明确区分面向用户交易的无状态 leanSPHINCS 与共识可利用的有状态 leanXMSS。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

其次，长期的通用证明接口有可能让应用通过“证明某个程序运行正确”引入新的密码学，而不必为每种算法等待一个新的 L1 预编译。相关研究已经进一步讨论：究竟应该暴露验证键、程序身份，还是稳定的指令集接口。[Ethereum Research](https://ethresear.ch/t/exposing-an-isa-for-post-quantum-proofs-on-ethereum/26136)

最后，在网络传播过程中提前聚合，可以让 builder 接收已有验证工作，而不是成为所有昂贵验证工作的唯一汇集点。这是它与“单机证明足够快即可”的另一种优化目标。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

**我的理解是：Vitalik 追求的是较少的长期基础层依赖与可复用接口，不是在声称整个递归系统天然简单。** 后者仍然需要独立证明。

### 2.4 必须区分：长期愿景与当前草案

当前有几处限制会显著影响对提案的判断。

**通用 `leanSTARK` 依赖还不能按愿景直接使用。** 当前有效性规则只接受 `LEANSPHINCS_SCHEME`；`LEANSTARK_SCHEME` 被保留，在相应依赖哈希规则定义之前，使用它的 frame 无效。`AGGREGATED_VK` 与 `DEPS_HASH` 也仍标为待定。因此，“已经支持任意应用密码学”不是对当前规范的准确描述。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

**不能把成本简单宣传成每个签名 3,000 gas。** 按当前草案，一次 leanSPHINCS 声明除 frame 的 3,000 gas 外，还产生按声明数量计的 30,000 gas 聚合字段分摊。因此，单个依赖这两部分合计为 **33,000 gas**，尚未包含其余交易成本。这是当前定价规则，不是 benchmark，也不是已确定的主网费用。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

**根证明较小，不代表全部网络流量恒定。** 交易正文、依赖标识、对等连接数量和内存池更新仍然有成本。提案关于固定规模证明传播的论述，应理解为压缩了证明材料这一部分，而不是让整张网络的流量与交易量脱钩。这个区别直接来自 wrapper 仍需携带交易或交易标识的设计。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

**FOCIL 兼容不等于证明本身实现抗审查。** FOCIL 是由 fork choice 强制执行的包含列表机制；8288 让列表也能携带其交易依赖的聚合证明。但“所有已纳入交易都有有效授权”和“所有应当纳入的交易都被纳入”，是两个不同命题。后者仍依赖包含列表规则、传播时限和可纳入性判断。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

---

## 3. AggLayer 是否在做类似的事？

### 3.1 是，但相似的是证明组合，不是产品职责

AggLayer 的重要组件是 **Pessimistic Proof**。它不是默认相信接入链完全诚实，而是对跨链资产流动施加约束：即使一条链发生故障或被攻破，也不能凭空从统一桥提走超出该链可支配跨链余额的资产。[Polygon Developer Docs](https://docs.polygon.technology/interoperability/agglayer/core-concepts/pessimistic-proof/architecture)

例如，假设链 A 当前有 100 单位可支配跨链余额。即使链 A 内部伪造了一笔“用户拥有 1,000 单位资产”的交易，桥接侧也不应仅凭这条链的声明允许提走 1,000 单位。

但要注意：

> 这保证的是跨链账本约束，不自动保证链 A 内部的所有交易都正确，也不保证链 A 自己的用户不会损失那 100 单位资产。

这是对 Pessimistic Proof 安全边界的解读：它隔离单链风险的前提，是共享的证明程序、验证器和桥接合约自身正确。不能把“隔离接入链的故障”扩展成“共享验证层也不存在系统性风险”。[Polygon Developer Docs](https://docs.polygon.technology/interoperability/agglayer/core-concepts/pessimistic-proof/architecture)

### 3.2 它的证明流程是什么？

公开文档描述的流程是：链提供原有状态承诺、出入桥记录和目标状态；AggLayer 先在原生 Rust 中执行验证，检查余额变化、重复领取等条件；再让同一程序在 SP1 中被证明；收到结果后验证证明及其公开输出，推进所记录的状态。[Polygon Developer Docs](https://docs.polygon.technology/interoperability/agglayer/core-concepts/pessimistic-proof/architecture)

这里有两个不同的验证对象：

**Pessimistic Proof**关注跨链资产账本与相关状态更新。

**Aggchain proof**可以承载链特定的认证或状态转换逻辑。当前源码包含传统 ECDSA、仅多签，以及“多签加 Aggchain proof”等路径，不能将所有接入方式都描述成相同的无信任有效性证明模式。[GitHub](https://raw.githubusercontent.com/agglayer/agglayer/main/crates/pessimistic-proof-core/src/aggchain_data/mod.rs)

### 3.3 源码中的递归证据

在 `aggchain_proof.rs` 中，程序组织了包括前后 Local Exit Root、网络标识、L1 信息根和导入桥记录承诺在内的公开值，然后调用：

```
sp1_zkvm::lib::verify::verify_sp1_proof(
    &self.aggchain_vkey,
    &_aggchain_proof_public_values.hash(),
);
```

这就是直接的代码级证据：**外层证明程序把“另一份 SP1 证明验证成功”作为自己需要证明的计算的一部分。** 它不是仅仅把若干 proof 文件打包在一起。[GitHub](https://raw.githubusercontent.com/agglayer/agglayer/main/crates/pessimistic-proof-core/src/aggchain_data/aggchain_proof.rs)

SP1 自身也支持执行分片与递归压缩。因此，应当区分“zkVM 内部为了证明长程序而做的递归”和“应用显式组合多个独立证明”这两个层次；AggLayer 可以同时涉及它们。[Succinct Docs](https://docs.succinct.xyz/docs/sp1/writing-programs/proof-aggregation)

### 3.4 为什么这不等于 AggLayer 已经是端到端 PQ？

SP1 内部使用 STARK，不足以推出整个验证路径具备 PQ 安全性。其标准证明输出包含 Groth16 和 PLONK 路径，相应官方验证器使用 BN254；AggLayer 的认证路径中也仍有传统签名组件。必须逐一核对某个部署实际选择的外层封装和认证配置。[Succinct Docs](https://docs.succinct.xyz/docs/sp1/generating-proofs/off-chain-verification)

这里的原则是：

**PQ 内层证明 + 非 PQ 外层验收机制，不等于端到端 PQ。**

同样，在一个 PQ 证明里执行旧的非 PQ 验证器，也不会自动修复旧验证器：如果攻击者能伪造旧证明，新系统可能只是正确地证明“旧验证器接受了这个伪造证明”。

### 3.5 与 EIP-8288 的对比

|比较维度|EIP-8288|AggLayer|
|---|---|---|
|首要目标|压缩用户交易的签名和证明验证开销|跨链认证、桥接账本安全与互操作|
|叶子对象|交易声明的密码学依赖|链证书、桥接状态、链特定证明|
|组合位置|内存池、包含列表、builder|证明程序、证明服务与结算流程|
|组合语义|合并、去重、丢弃后覆盖选中依赖|状态连续性、跨链余额约束、认证关系|
|最终验收|作为 L1 区块有效性条件的一部分|相关验证器与桥接结算合约|
|PQ 定位|以哈希型聚合支撑 PQ 路线|不能仅凭内部 STARK 判断端到端 PQ|
|共同风险|公开输入绑定、验证器正确性、递归组合|同样存在，另外还有跨链账本与桥合约风险|

表中比较依据提案、AggLayer 代码和 SP1 文档；它不是两者生产性能的实测对照。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

因此，“AggLayer 在做类似事情”是对的，但精确说法应当是：

> **AggLayer 已采用证明组合来统一跨链验证；EIP-8288 则希望将类似能力提升为交易传播与区块验证的通用协议机制。**

本次核验确认了文档与源码能力，没有据此推断“所有接入链的证明，目前都在生产环境中按同一种全局批次聚成一份证明”。

---

## 4. a16z 的替代方案：Aerie 为什么可以不递归？

### 4.1 它反对的不是 SNARK，而是特定工作负载下的递归架构

a16z 在 10 月 16 日发布的方案是 Aerie：用格型 SNARK 聚合 Falcon 签名。其核心主张是，若单机已经能足够快地证明一整个签名批次，就不必先分发给多个证明者，再等待多轮递归合并。[a16z crypto](https://a16zcrypto.com/posts/article/fast-post-quantum-signature-aggregation-with-lattice-snarks/)

所以争议不是：

> Ethereum 使用证明，a16z 不使用证明。

而是：

> **哈希签名与哈希型证明的组合，是否值得为了基础层依赖最小化，承担较重的证明工作和递归协调？还是应针对签名批处理选择更高效的格型关系？**

这是一个有意义的设计分歧。

### 4.2 为什么 Falcon 验证比较适合这种证明？

简化地看，Falcon 验证包含类似下面的条件：

\[ s_1+h\cdot s_2=H(m,\text{salt},\ldots)\pmod q \]

同时要求：

\[ \|s_1\|^2+\|s_2\|^2\le B^2 \]

还必须满足签名编码和范围约束。这里的乘法发生在特定多项式环中；公式只是帮助理解，不是可直接实现的完整 Falcon 规范。[LayerZero](https://assets.layerzero.network/pdf/aerie.pdf)

Aerie 的关键选择是：**保留公开的 salt，让验证者自己计算消息哈希；证明系统主要处理代数关系、范数和编码条件。**

这不是把必要验证省掉，而是把不同验证任务安排到更适合的位置：不在电路里昂贵地证明公开哈希计算，而用 Akita 格型多项式承诺及相应证明协议证明剩余关系。[LayerZero](https://assets.layerzero.network/pdf/aerie.pdf)

范数约束尤其不能省略。格签名需要的不只是“找到一个满足模方程的解”，而是找到足够短的解。错误的范围或整数约束，可能让证明接受不应被视为有效签名的对象。这也说明：**不用递归，并不意味着协议只剩一个简单方程。**

### 4.3 性能数字很有吸引力，但必须读完整

论文报告，在 Apple M4 Max、无 GPU 加速、16 工作线程下，对 **32,768 个 Falcon-512 签名**：

|指标|作者报告结果|
|---|---|
|生成聚合证明|约 0.65 秒|
|单线程验证|约 53.6 毫秒|
|峰值证明内存|约 2,113 MiB|
|每个签名保留独立 salt 的总大小|约 1,346.4 KiB|
|摊销大小|约 42.1 字节／签名|

这些是作者测量，生成密钥和签名不在计时内；大小不包含验证者另行提供的公钥和消息。[LayerZero](https://assets.layerzero.network/pdf/aerie.pdf)

这里最容易被误读的是“约 66 KiB”。

**默认独立 salt 模式下，整批不是只有 66 KiB，而是约 1.31 MiB。** 约 66 KiB 对应共用 salt 的估算模式；它改变了签名端要求和安全论证。当前项目明确说明，共用 salt 模式需要额外的固定目标签名安全假设，没有已知的标准格假设归约，也没有声称存在已知攻击。不能把这个模式的最小体积与默认模式的安全条件混用。[GitHub](https://github.com/a16z/aerie)

同样，“0.65 秒完成证明”不等于“0.65 秒完成全网络收集、聚合、传播和恢复”。网络收集延迟与掉线恢复是另外的指标。

### 4.4 为什么不能直接拿它宣布 EIP-8288 没有必要？

首先，**工作负载不同**。Aerie 当前针对指定参数集的 Falcon 批量签名验证，而 8288 的长期目标还包括应用产生的 STARK 依赖、不同来源证明的持续组合及子集选择。单层 Falcon 聚合不是这些能力的直接替代品。[GitHub](https://github.com/a16z/aerie)

其次，**网络输入条件不同**。Aerie 的单层聚合者需要取得相应签名；8288 希望后续节点只利用已有聚合结果继续组合。在“所有原始材料都能及时抵达一台机器”的场景中，单层方案很有优势；在材料天然分散、参与者反复转发和选择子集的场景中，递归的价值更明显。这是从两种流程得出的架构判断，不是已有生产 benchmark。

再次，**两边都还不能被当作完成品**。Aerie 当前标注为 research release，两个参数集均未通过项目自身的生产准入标准；leanVM 也明确写着尚不适合生产，形式化验证仍在进行。[GitHub](https://github.com/a16z/aerie)

最后，不能将不同版本、安全参数和签名类型的数字直接相除。Aerie 论文固定了其对照版本；当前 leanVM README 的数据已不同。比较应固定 commit、机器、内存、安全参数和批次构成，而不是复用社交媒体上的某个倍数。[LayerZero](https://assets.layerzero.network/pdf/aerie.pdf)

---

## 5. 核心争议：递归证明到底有没有安全问题？

我的判断是：

**它有真实且重要的问题需要解决，但“有尚未充分闭合的安全论证”与“已经存在可利用攻击”不是同一个结论。**

### 5.1 先排除一种错误理解：递归不是近似误差不断累加

递归证明不是数值模拟，也不是每包装一次就自动“模糊一点”。

在合适的安全定义和组合定理下，外层验证内层可以形成严格的逻辑结构。但关键在于“合适的安全定义和组合定理”：不能仅凭“第一层安全，所以第二层也安全”的口头归纳，就跳过具体协议的可提取性、适应性攻击和哈希模型。递归组合研究正是在处理这些条件。[Cryptology ePrint Archive](https://eprint.iacr.org/2023/1646)

### 5.2 对签名聚合，普通 soundness 还不够

普通 soundness 大致表示：

> 攻击者不能让验证者接受错误的命题。

但签名聚合有一个微妙之处。对于合法公钥和某条消息，“存在一个有效签名”往往本来就是真命题，因为持有私钥的人可以生成它。问题是：**攻击者是否知道这个签名，或能否获得与之等价的授权能力？**

因此，仅仅说“证明了签名存在”不够。需要把聚合证明与签名不可伪造性连接起来。Aerie 为此证明的是 knowledge soundness，并进一步给出聚合不可伪造性的论证。[LayerZero](https://assets.layerzero.network/pdf/aerie.pdf)

递归进一步增加了难度：外层可提取出的可能首先是内层证明，而不是最底层签名。如何沿着多层结构完成有效提取、提取复杂度如何增长，不能省略。相关文献明确指出，朴素组合分析可能产生严重的提取时间膨胀。[Cryptology ePrint Archive](https://eprint.iacr.org/2025/1663)

这属于安全证明的核心问题，而不仅是代码容易写错。

### 5.3 a16z 最有力的批评：普通随机预言机模型无法直接覆盖这类递归

许多非交互证明通过 Fiat–Shamir 变换获得挑战值：

\[ c=H(\text{statement},\text{transcript},\ldots) \]

在随机预言机模型，简称 ROM，中，安全分析将 \(H\) 理想化为随机黑盒。

但递归验证器必须在电路中执行内层验证，而内层验证又包括 Fiat–Shamir 哈希计算。于是，同一个证明分析中出现了两个不同角色：

**哈希既被当作理想黑盒，又要被当作具有具体结构、可在电路中计算的函数。**

不能不加说明地把二者混在一起，然后沿用原本的 ROM 安全结论。a16z 对此的批评并非凭空提出。[a16z crypto](https://a16zcrypto.com/posts/article/fast-post-quantum-signature-aggregation-with-lattice-snarks/)

《Relativized Succinct Arguments in the ROM Do Not Exist》进一步给出了形式化的不可能性结果：在其定义下，普通 ROM 中不存在能够简洁证明“包含对同一随机预言机查询的计算”的 relativized succinct argument。这个结果限制了一类直观的递归安全分析路径。[Cryptology ePrint Archive](https://eprint.iacr.org/2024/728)

但必须保留定理的限定条件。它不是说：

> 任何具体哈希函数上的任何递归证明，都已经存在高效伪造算法。

它说明的是：**不能用那个理想化模型和那类构造方式，得到想要的普遍安全结论。**

### 5.4 支持递归的一方，有什么实质回应？

不是只有“行业用了很多年”。

《Security Bounds for Proof-Carrying Data from Straightline Extractors》研究了在 **straightline knowledge soundness** 条件下的递归组合，得到在相应模型中可以基本保持底层安全性的结果。作者也谨慎地说明，这为实践中的递归 STARK 参数提供了理想化、带启发性的支持，而不是对任意具体哈希实现的无条件保证。[Cryptology ePrint Archive](https://eprint.iacr.org/2023/1646)

《IVC in the Open-and-Sign Random Oracle Model》则引入 osROM，使协议可以处理相关预言机调用和直线式提取，支持对多项式深度递归进行安全分析。但论文明确承认，这个模型比普通 ROM 更难实例化。该工作也不是 EIP-8288 的直接安全证明。[Cryptology ePrint Archive](https://eprint.iacr.org/2025/1663)

所以，更准确的学术图景是：

**递归有条件安全构造与不断发展的理论；但具体部署如何实例化这些条件、对应多少实际安全位数，仍需要逐系统论证。**

“安全归约很松”不自动等于“攻击同样容易”；反过来，“尚未发现攻击”也不能替代安全归约。

### 5.5 是否存在真正的攻击，而不只是理论担忧？

存在。

《How to Prove False Statements: Practical Attacks on Fiat-Shamir》针对一种基于 GKR、此前被广泛研究和使用的协议，构造了在具体 Fiat–Shamir 哈希实例化下能让验证者接受错误命题的攻击。它不是简单发现某个程序忘记了 domain separation，也不只是普通哈希碰撞攻击。[Cryptology ePrint Archive](https://eprint.iacr.org/2025/118)

但它的适用范围不能无限扩张。

该论文**没有证明所有 STARK 都已被攻破，也没有直接展示 EIP-8288 的攻击交易**。要判断某个递归系统是否受影响，必须核对协议结构、允许证明的电路、挑战生成方式、攻击者的电路选择能力和具体实例化条件。

值得注意的是，这项工作的作者来自 Ethereum Foundation 和 Succinct。这也说明，把争论概括为“Ethereum 忽视问题，a16z 揭露问题”，并不符合实际研究脉络。[Cryptology ePrint Archive](https://eprint.iacr.org/2025/118)

### 5.6 “PQ 安全”还必须看量子模型，而不仅看原语名称

Aerie 论文明确给出的 knowledge soundness 结论是在**经典 ROM** 中。它使用 PQ 候选原语，不等于论文已经完成整个聚合协议在量子攻击者模型下的全部安全论证。[LayerZero](https://assets.layerzero.network/pdf/aerie.pdf)

leanVM README 则列出 **128-bit ROM、64-bit QROM soundness** 的设计表述，并同时声明形式化验证尚在进行。也不能把其中的“128-bit”脱离模型，宣传为已经证明的“128 位端到端量子安全”。[GitHub](https://github.com/leanEthereum/leanVM)

双方真正需要交付的都是：

> 从签名、证明协议、递归组合，到最终验收规则的一条完整安全论证，而不只是列出若干被认为抗量子的组件。

---

## 6. 比“递归是否安全”更具体的工程风险

下面是我根据上述机制整理的审查重点。它们是设计评审问题，不是对当前实现已存在漏洞的指控。

|风险|可能出现的错误|应验证什么|
|---|---|---|
|公开输入绑定|证明有效，但对应另一条消息、另一个链或账户|消息、账户、链标识、程序身份与实际交易的绑定|
|验证键认证|攻击者提供一个永远返回成功的验证程序|协议根验证键及应用允许的程序身份不可被替换|
|电路约束遗漏|漏掉范围、编码、状态连续性或余额限制|恶意输入测试、独立实现、形式化约束检查|
|递归与资源消耗|输入有效，却导致极高证明成本或持续重聚合|最坏成本、深度策略、限流、调度和恢复时间|
|数据与恢复|聚合服务失败，其他参与者拿不到原始材料|witness 保存、可重建性、替代证明者接管流程|
|共享验证层故障|单个通用后端错误影响大量应用|独立实现、版本管理、应急迁移与故障隔离|

这些问题中，部分为所有 SNARK 聚合方案共有，不能全部归罪于递归；递归会特别增加组合、调度和跨层绑定的复杂性。

### 6.1 “无限深度递归”不等于“无限深度安全已经证明”

8288 当前结构允许将先前聚合继续包装，并把聚合验证键作为公开输入参与递归。**这是结构能力，不是一个已经给定具体安全损失的无限深度定理。**[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

我会要求实现明确回答：如何处理长期在内存池中反复传播的依赖？是否需要重建聚合或限制某些递归形状？拒绝恶意高成本输入的依据是什么？这些问题直接影响可实施性。

### 6.2 证明有效性与活性必须分别测试

一个系统可以从未接受过错误证明，却因为证明排队或网络协调而让交易长时间无法纳入。

对 8288 而言，尤其需要测试交易替换、过期、重复依赖和包含列表截止时间下的行为。某份签名在密码学上依然有效，不意味着相应交易在当前 nonce、余额和执行状态下仍然可纳入。聚合证明不能替代这些状态相关检查。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

这也不意味着证明服务短暂故障必然让整条链停摆——草案允许无依赖区块使用空证明。准确的风险是：相关交易路径和包含要求可能受到影响，具体后果取决于其他协议规则。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

### 6.3 共享证明后端会形成共同故障点

假设应用同时要求一种哈希签名和一种格签名，但最终只通过同一个聚合验证器验收。两种签名可以提供原语层面的多样性，却不能抵御那个共同聚合验证器自身的不健全。

同样，多客户端如果只是对同一个错误密码学假设做了不同实现，并不能消除这个共同风险。实现多样性、原语多样性和安全论证多样性，需要分别设计。

这不是反对通用验证层，而是提醒：**复用减少了重复基础设施，也集中了一部分故障影响。**

---

## 7. 它们是否必须二选一？真正的“密码学可升级性”在哪里？

### 7.1 应用可选择 lattice，不意味着基础层已对后端中立

在未来通用证明接口成立的前提下，应用可以用 Falcon，随后证明其验证程序运行正确，再由哈希型聚合后端统一处理。这能让应用不必等待专门的 Falcon 预编译。

但它仍然继承外层 STARK 与递归系统的安全依赖，并支付相应证明成本。**这不是直接把 Aerie 的性能搬进 8288。**

反过来，让 L1 直接接受 Aerie 格型聚合证明，会改变基础层验证后端和密码学依赖，需要额外协议设计。应用算法可扩展性与共识验证后端可替换性，是两件不同的事。相关 ISA 讨论已经触及这一边界。[Ethereum Research](https://ethresear.ch/t/exposing-an-isa-for-post-quantum-proofs-on-ethereum/26136)

### 7.2 为什么“验证键哈希”可能成为长期维护问题？

如果不可升级合约固定依赖某个验证键，而证明系统升级导致验证键改变，那么即使业务规则没有变化，合约也可能无法接受新版证明。

10 月 8 日的研究讨论因此提出：是否应该让应用绑定**程序身份与 ISA 版本**，而不是某个证明后端的具体验证键。这样有机会将“业务规则是什么”与“当前用什么后端证明”分离。[Ethereum Research](https://ethresear.ch/t/exposing-an-isa-for-post-quantum-proofs-on-ethereum/26136)

不过，稳定 ISA 也不是免费的。内存模型、系统调用、预编译和版本兼容都需要规范。

更重要的是：

> **替换证明后端可以修复后端问题；继续证明一个已经失效的旧验证规则，并不能修复那个规则。**

例如，旧规则是“某个非 PQ 签名验证通过”。当攻击者已经能伪造该签名时，用更安全的证明系统证明旧规则通过，并不会恢复授权安全。

### 7.3 对 Mantle 研究的直接启示

结合 Mantle 的账户与 PQ 研究，我更倾向于把实验拆成三个可以独立推进的层次：

**账户层**先明确签名替换、混合授权和恢复机制；**接口层**实验显式验证依赖与程序身份；**网络层**再分别评估单层聚合和递归传播是否值得进入出块关键路径。

这是本文的设计建议，不是已确定的路线。它的目的，是避免为了验证某种 PQ 签名，过早绑定整个内存池与证明网络架构；也避免因为完整 8288 尚未成熟，就停止账户层的 PQ 准备。

---

## 8. 最终判断：这场争论应该如何收敛？

### 对 EIP-8288

它值得研究的核心，不是“选对了某个 PQ 算法”，而是**把密码学验证依赖显式化，并让网络能够组合已有验证工作**。这对账户授权、隐私证明和其他重验证场景具有统一接口的潜力。

但当前草案、通用类型和工具链的成熟度，不足以支持“可以直接作为生产级方案采用”的结论。特别是递归安全参数、最坏证明成本、内存池行为和长期程序身份，需要继续形成可审查的规范与证据。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

### 对 AggLayer

它为“证明验证证明”的工程组合提供了实际源码案例，也展示了如何将通用证明技术绑定到清晰的跨链账本规则。

但 AggLayer 的存在既不是 EIP-8288 安全性的证明，也不是端到端 PQ 的证明。它最有参考价值的部分，是**公开输入如何绑定、链特定认证与共享账本约束如何分层，以及证明如何进入结算流程**。[GitHub](https://raw.githubusercontent.com/agglayer/agglayer/main/crates/pessimistic-proof-core/src/aggchain_data/aggchain_proof.rs)

### 对 a16z / Aerie

Aerie 展示了一个重要事实：针对签名验证这一特定关系进行设计，可以显著改变证明成本，并使不递归的聚合架构变得有吸引力。其对 ROM、递归提取和工程复杂性的批评，应当认真进入 Ethereum 的设计评审。[a16z crypto](https://a16zcrypto.com/posts/article/fast-post-quantum-signature-aggregation-with-lattice-snarks/)

但“单层更快”不是“整体已更安全”的充分条件。Aerie 自己也有格型证明假设、签名格式限制、经典与量子模型的区别，以及尚未完成的生产准入要求。[GitHub](https://github.com/a16z/aerie)

### 对“递归证明是不是一个有问题的设计？”

我的结论是：

> **递归证明不是一个可以被整体判死刑的设计；它是一种价值明确、但必须承担额外安全论证与工程成本的组合机制。**
> 
> **a16z 指出了真实问题，但这些问题尚不能直接等同于 EIP-8288 存在已知可利用漏洞。Ethereum 支持者则不能用“只依赖哈希”来跳过递归组合本身的安全证明。**

下一阶段最有价值的比较，不是再比一次“每秒多少签名”，而是在相同安全目标和网络条件下，回答：需要多少原始数据、谁能及时取得它、谁承担证明成本、故障后谁能接管，以及最终验证者究竟依赖哪些假设。

**这场争论真正要选择的，不只是 hash 还是 lattice，而是把复杂性放在哪里、由谁承担，以及用什么证据证明这种安排值得信任。**

这条研究线变化很快；是否需要每周跟踪 EIP-8288 修订、leanVM/Aerie 安全分析与可复现 benchmark 的更新？
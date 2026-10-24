---
imported_from: ChatGPT Deep Research
imported_at: 2026-10-24
original_file: BNB-new-L1-deep-dive.md
---

# BNB New L1 全面解构研究报告

完整报告已整理为 Markdown 文件：

以下是核心结论和技术分析。需要先说明：截至 **2026 年 10 月 24 日**，BNB New L1 仍主要处在多验证者 devnet 和设计验证阶段。官方文档混合描述了已经在 devnet 中运行的功能、拟议的主网设计，以及仍在进行中的模块，因此不能把所有页面内容都当成已经冻结的主网规格。

## 一、先给结论

### 1. BNB 没有公开宣布放弃 BSC

目前没有官方证据表明 BNB 要废弃或迁移 BSC。New L1 的定位是承接 BSC 不适合的低延迟、高频交易、支付、隐私金融和 agent 工作负载；官方仍把 BSC 描述为服务既有生态的 broad-base chain，把 New L1 描述为面向新工作负载的 clean-slate L1。[New L1](https://docs.bnbchain.org/newl1/overview/?utm_source=chatgpt.com)

所以目前更准确的判断是：

> **New L1 是 BSC 的互补链和新工作负载链，而不是 BSC 的替代链。**

BNB 从 BSC 到 New L1 的原生资产桥仍在开发中，New L1 的公共 testnet、mainnet、chain ID 和公共 RPC 也尚未完全发布。[New L1](https://docs.bnbchain.org/newl1/overview/?utm_source=chatgpt.com)

### 2. Native AA 是共识层原生交易，不是 EIP-7702，也不是 ERC-4337

New L1 的核心 AA 交易类型是 `0x76`。节点直接验证交易中的多调用、授权密钥、权限范围、spend limit、有效期、fee payer 和可选 token fee，不需要 ERC-4337 的 bundler、EntryPoint 或 paymaster，也不要求账户先变成智能合约钱包。[New L1](https://docs.bnbchain.org/newl1/core-concepts/account-abstraction/?utm_source=chatgpt.com)

它在产品体验上最接近 Tempo 的“原生账户能力 + access key + 原生代付”方向，但 New L1 更固定、更少可编程，也不采用 EIP-7702 的 EOA code delegation。

### 3. Parallel EVM 的重点是排序与执行解耦

New L1 的关键设计不是简单地把 EVM 改成多线程，而是：

1. 先由共识确认交易顺序；
2. EVM 执行在后台异步完成；
3. 若干区块后，通过 `ExecutionCommitment` 把执行结果绑定回链上；
4. 排序、执行、执行承诺和最终化形成不同阶段。

这套设计是为 200ms block cadence 服务的。它解决的是**共识排序和 EVM 执行之间的时间耦合**，并不等同于 application-specific sequencing。[New L1](https://docs.bnbchain.org/newl1/core-concepts/async-execution/?utm_source=chatgpt.com)

### 4. 20ms sub-block 是 preconfirmation 流，不是另一个共识区块

20ms sub-block 是当前 block producer 对交易顺序和位置做出的带签名承诺。它不提供执行结果，不提供最终性，不独立参与 fork choice；如果 leader 失效、排序被替代或窗口结束，之前的 preconfirmation 可能被撤销。[New L1](https://docs.bnbchain.org/newl1/core-concepts/tx-preconfirmation/?utm_source=chatgpt.com)

### 5. Shielded transaction 已经超过 private payment，但还不是 confidential DeFi

New L1 的 ShieldedPool 支持：

- shielded BNB 转账；
- note、Merkle commitment、nullifier 和 zk-SNARK；
- shielded 余额驱动的原子公开 EVM 调用；
- 例如从隐私余额进入 DEX swap，再把结果重新 shield。

但目前只支持原生 BNB shielding，不支持 ERC-20/BEP-20 shielding。DEX、借贷或其他 DeFi 合约本身仍运行在透明 EVM 中，因此调用目标、公开 calldata、公开状态和部分金额信息依然可见。[New L1](https://docs.bnbchain.org/newl1/core-concepts/privacy/?utm_source=chatgpt.com)

因此它的定位更接近：

> **原生 BNB 的 shielded asset pool + 隐私支付 + 私密余额触发的公开合约调用。**

它不是全链隐私，也不是当前已经实现的隐私 AMM、隐私借贷或隐私订单簿。

### 6. PQ 组件是 lattice-inspired state commitment，不是 Falcon

New L1 的“lattice-based”设计主要出现在状态承诺层：flat KV state 通过累计 LtHash 风格的向量承诺实现增量更新和并行计算。Falcon 是格基数字签名算法，解决的是签名和认证问题；LtHash 解决的是状态承诺问题，两者用途不同。

当前公开资料没有显示 New L1 使用 Falcon。相反，现有文档显示：

- 共识使用 BLS；
- Native AA 支持 secp256k1、P-256、WebAuthn；
- ShieldedPool 使用 EOA/ECDSA 风格的授权证明；
- PQ authorization 仍被列为未实现或预留项。[New L1](https://docs.bnbchain.org/newl1/core-concepts/state-db/?utm_source=chatgpt.com)

所以当前不能把 New L1 称为“端到端后量子 L1”。

### 7. 共识仍然是 PoSA 家族

New L1 使用从 BSC Parlia 派生的 enhanced Parlia：

- BNB 质押选举验证者；
- 目标约 64 个验证者；
- 约 16 个 block 的 proposer turn；
- 约 200ms block interval；
- BLS 跨区块聚合投票；
- stake-based validator election；
- double-sign 等行为可被惩罚。

它不是开放集合、无许可的传统 PoS。简单叫“PoA”不够准确，更准确的说法是：

> **stake-weighted authority consensus，或者 PoSA-derived enhanced Parlia。** [New L1](https://docs.bnbchain.org/newl1/core-concepts/consensus/?utm_source=chatgpt.com)

---

# 二、New L1 的整体定位和系统架构

## 2.1 官方想解决什么问题

New L1 的目标不是重新做一条“通用 EVM 链”，而是针对以下工作负载做协议级优化：

- 高频交易；
- 低延迟支付；
- 订单流和交易撮合；
- 隐私金融；
- agent 自动执行；
- 对交易纳入有强确定性要求的应用。

官方架构把以下能力放在同一条协议里：

|模块|设计|
|---|---|
|账户|Native AA `0x76`|
|隐私|ShieldedPool、隐私交易 `0x77`|
|区块|200ms ordered block、约 20ms preconfirmation sub-block|
|共识|enhanced Parlia、BLS 跨区块投票|
|执行|order/execution separation、异步执行|
|并行|access-list-based parallel EVM 方向|
|资源隔离|Multi-Lane|
|状态|flat KV + LtHash|
|交易路由|无全局 mempool，gateway 直达 proposer|

官方文档把这些模块描述成一个从 genesis 设计的 clean-slate L1，而不是在 BSC 上逐步打开的单一 hard fork。[New L1](https://docs.bnbchain.org/newl1/overview/?utm_source=chatgpt.com)

## 2.2 当前成熟度

当前可以分成三类：

### 官方已确认或已有 devnet 行为

- 200ms block cadence；
- enhanced Parlia 方向；
- Native AA `0x76`；
- ShieldedPool 原生合约；
- 20ms preconfirmation；
- flat KV/LtHash；
- 无全局 mempool；
- execution tip 与 finalized tip 分离。

### 官方已提出但仍需继续验证

- access-list-based parallel EVM 的完整 scheduler；
- adaptive execution lag；
- 生产级 async execution；
- 隐私交易的大规模 proof aggregation；
- BNB 与 BSC 的正式桥；
- mainnet validator set 和治理参数。

### 尚未完成或明确预留

- ERC-20/BEP-20 shielding；
- PQ authorization；
- paymaster/ERC-4337 兼容路径；
- recursive proof aggregation；
- compliance hooks；
- 公共 testnet、mainnet、chain ID 和公共 RPC。

---

# 三、Native AA 深度分析

## 3.1 `0x76` 交易的基本模型

`0x76` 是新的 EIP-2718 typed transaction。它仍然由账户发送，但账户不再局限于“一笔交易、一个 call、一个 root key”的传统模型。

一笔 `0x76` 可以包含：

- 1–64 个有序调用；
- 一个账户级 nonce；
- 一个签名语义；
- 一个 receipt；
- 一个或多个授权 key；
- 代付签名；
- 有效期；
- access list；
- 可选 token fee repayment。

官方字段包括：

- `chain_id`；
- `nonce_key` 和 `nonce`；
- EIP-1559 fee 字段；
- `gas_limit`；
- calls；
- access list；
- valid-after / valid-until；
- inline key authorization；
- fee payer signature；
- token-fee repayment；
- 最大约 128 KiB 的交易编码大小。[New L1](https://docs.bnbchain.org/newl1/core-concepts/account-abstraction/?utm_source=chatgpt.com)

当前 `nonce_key` 被保留，但必须为 0，所以 New L1 虽然为并行 nonce 预留了字段，当前版本并没有真正打开并行 nonce。

## 3.2 密钥层级

New L1 的账户不是只有一个永久 root key，而是有一定的权限层级：

|密钥类型|权限|
|---|---|
|Root key|完整账户控制|
|Admin key|管理授权密钥|
|Delegated/access key|只能访问限定目标、函数、金额或有效期|
|Sponsor/fee payer key|为交易支付 gas，不自动获得账户资产控制权|

授权 key 可以绑定：

- 目标合约；
- 函数选择器；
- 有效期；
- spend limit；
- 交易价值上限；
- gas 支出上限。

官方还定义了 AccountKeychain 和 SignatureVerifier 系统 precompile，用于管理 key 和验证签名。[New L1](https://docs.bnbchain.org/newl1/core-concepts/account-abstraction/?utm_source=chatgpt.com)

## 3.3 代付和 token fee

New L1 有两种主要的代付路径。

第一种是独立的 fee payer：

- sender 负责业务调用和 value；
- sponsor 负责原生 gas；
- sender 和 sponsor 分别签名；
- 两个签名绑定同一交易主体，避免 sponsor 被替换。

第二种是 token fee：

- 交易里指定 token、recipient 和 repayment amount；
- 交易完成后由协议或账户按规则偿还费用；
- 不需要额外的 ERC-20 approve、permit 或 paymaster 交易。

但有一个需要特别注意的地方：New L1 按声明的 `gas_limit` 收费，而不是按实际 gas 使用量退还未使用部分。这样做有利于异步执行和确定性 blockspace accounting，但会让钱包的 gas estimation 和失败成本管理变得更重要。[New L1](https://docs.bnbchain.org/newl1/core-concepts/account-abstraction/?utm_source=chatgpt.com)

---

# 四、New L1 与 EIP-7702、ERC-4337、EIP-8130、Tempo 的区别

## 4.1 和 EIP-7702 的区别

EIP-7702 的核心是给 EOA 写入一个 delegation indicator：

```
0xef0100 || implementation_address
```

之后，EOA 的行为由 delegated contract implementation 决定。EIP-7702 本身提供的是 delegation 机制，batch、sponsorship、权限控制等功能要由 delegated code 实现。[eips.ethereum.org](https://eips.ethereum.org/EIPS/eip-7702?utm_source=chatgpt.com)

New L1 的 `0x76` 没有这个模式：

- 不需要给 EOA 写 delegated code；
- 不需要部署 smart account implementation；
- batch、scope、spend limit、sponsor 都是交易协议内置字段；
- 账户仍然保持普通地址和 `msg.sender` 语义；
- 代价是协议层能力更固定，难以像 delegated contract 那样自由扩展。

## 4.2 和 ERC-4337 的区别

ERC-4337 不修改 EVM 共识交易格式，而是增加：

- UserOperation；
- alternative mempool；
- bundler；
- EntryPoint；
- paymaster；
- smart account validation。

官方 ERC-4337 设计的价值是可以在不改共识的情况下实现账户抽象，但基础设施相对复杂，且 bundler、paymaster、EntryPoint 都要参与整个交易流程。[eips.ethereum.org](https://eips.ethereum.org/EIPS/eip-4337?utm_source=chatgpt.com)

New L1 把常见能力直接放进节点和共识层，因此减少了 bundler 和 EntryPoint 依赖。但它也失去了 ERC-4337 那种由智能合约自定义验证、nonce、paymaster 和执行逻辑的开放性。

## 4.3 和 EIP-8130 的区别

EIP-8130 是一个 draft，核心是把：

- “谁签了名”；
- “这个 actor 被允许做什么”；
- “认证器如何扩展”；

分成不同层次，由 Keystore、actor、authenticator 和 policy 共同表达。它强调 transport-neutral 和 crypto agility，未来可以接入不同的认证器乃至 PQ 方案。[eips.ethereum.org](https://eips.ethereum.org/EIPS/eip-8130?utm_source=chatgpt.com)

New L1 与 EIP-8130 的相似点是：

- root key 与受限 key 分离；
- key 可以有 scope 和 expiry；
- account authorization 与普通交易逻辑分开。

差异是 New L1 的认证器集合和 policy 语义由协议直接固定，扩展空间比 EIP-8130 小，也没有公开实现完整的通用 Keystore abstraction。

## 4.4 和 Tempo 的区别

Tempo 的交易设计同样强调：

- 原生 batch；
- access key；
- expiry；
- fee payer；
- token fee；
- WebAuthn/P256；
- 可并行 nonce；
- EIP-7702 风格 authorization list。

Tempo 的 AccountKeychain 还可以管理 access key、过期和 TIP-20 token spending limit，原生交易提供更丰富的费用和账户能力。[docs.tempo.xyz](https://docs.tempo.xyz/protocol/transactions/eip-7702?utm_source=chatgpt.com)

因此可以这样概括：

> **New L1 是“协议内置、固定型 Native AA”；Tempo 是“协议内置能力 + EIP-7702 风格 delegation + 更丰富账户运行时”；EIP-8130 是“可组合的通用账户授权抽象”；ERC-4337 是“协议外的智能账户基础设施”。**

---

# 五、Parallel EVM：New L1 与 BSC 历史研究的关系

## 5.1 New L1 的 async execution

传统区块链通常需要 proposer 在出块前完成：

1. 收集交易；
2. 决定交易顺序；
3. 执行 EVM；
4. 计算 state root、receipts root、logs bloom；
5. 再把结果交给共识投票。

在 200ms block interval 下，这条同步路径过长。New L1 把这条路径拆成：

1. 交易先进入排序；
2. 共识确认顺序；
3. 后台 scheduler 按顺序执行；
4. 后续区块写入 `ExecutionCommitment`；
5. 执行结果最终化。

官方文档明确描述了 ordered、executed、committed 和 finalized 四个状态阶段。[New L1](https://docs.bnbchain.org/newl1/core-concepts/async-execution/?utm_source=chatgpt.com)

当前官方所描述的 parallel EVM 方向是：

- 交易声明访问依赖；
- scheduler 读取 access list；
- 不冲突交易并行执行；
- 冲突交易按确定性顺序处理；
- 执行 lag 会自适应；
- validators 在后台验证执行 commitment。

但需要强调：

> 官方仍将 parallel scheduler 的详细设计标为 in progress，不能把它理解成已经完成并经过主网压力测试的生产级并行执行器。[New L1](https://docs.bnbchain.org/newl1/core-concepts/async-execution/?utm_source=chatgpt.com)

## 5.2 BSC 之前的并行 EVM 研究

BNB Chain 不是从零开始研究 parallel EVM。BSC 和 BNB 生态之前主要做过以下工作：

### Parallel EVM 1.0 / 2.0

早期设计使用 dispatcher 将交易分配到不同 slot 或 thread：

- 同一个 slot 内仍然顺序执行；
- 不同 slot 尝试并行；
- 通过冲突检测减少状态竞争；
- 通过预读、streaming pipeline、memory pool 和 rollback/reschedule 提高吞吐。

Parallel EVM 2.0 进一步研究了：

- unconfirmed access；
- balance makeup；
- light copy；
- conflict detector；
- parallel KV access；
- 事务重排和重新执行。[BNB Chain Blog](https://www.bnbchain.org/en/blog/new-milestone-the-implementation-of-parallel-evm-2-0?utm_source=chatgpt.com)

### BEP-130

BEP-130 把 parallel transaction execution 作为 execution-layer 模块，允许配置：

- slot 数量；
- dispatcher；
- 冲突降低策略；
- 执行和调度模块。

它的重点是提高执行吞吐，并不改变 BSC 的共识模型。[Build N Build Forum](https://forum.bnbchain.org/t/bep-130-draft-parallel-transaction-execution/54?utm_source=chatgpt.com)

### TxDAG / BEP-396

TxDAG 通过交易运行时的 read/write set 构建依赖 DAG，让执行器提前知道哪些交易存在依赖，避免 optimistic execution 发生冲突后反复重执行。[Build N Build Forum](https://forum.bnbchain.org/t/bep-396-accelerate-block-execution-by-txdag/2869?utm_source=chatgpt.com)

### Block Access Lists / BEP-592

BEP-592 的重点是让节点在导入区块前预取需要的状态。它是非共识优化：

- 不改变执行结果；
- 不改变共识规则；
- 只减少 state I/O 和 cache miss；
- 即使 access list 错误，也不能改变安全性。 [GitHub](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-592.md?utm_source=chatgpt.com)

### BSC Reth 和客户端优化

BNB 生态还研究过：

- parallel sparse trie read/write；
- ASM hash；
- super-instruction；
- prewarm；
- JIT；
- 状态访问热点优化。

这些工作主要在客户端执行性能层面，和 New L1 的 async execution、LtHash state commitment 不是同一层。[BNB Chain Blog](https://www.bnbchain.org/en/blog/bsc-reth-client-the-next-evolution-of-bsc-infrastructure?utm_source=chatgpt.com)

## 5.3 New L1 与 BSC 并行执行研究的真正差异

BSC 早期 parallel EVM 主要是在“一个已确定的区块里如何更快执行”这个问题上优化。

New L1 进一步改变了时间结构：

> **即使一个区块还没执行完，共识也可以继续确认后续交易顺序。**

所以 New L1 的变化不仅是：

```
单线程 EVM → 多线程 EVM
```

而是：

```
排序 + 执行同步完成
→
排序先完成，执行异步追赶
```

它的工程难度也更高，因为必须处理：

- execution lag；
- stale balance；
- in-flight spending；
- execution commitment；
- ordered tip 与 executed tip；
- 执行错误导致的链状态污染；
- reorg 和 rollback；
- 不能退款的 declared gas limit。

---

# 六、Order/Execution Separation 和 Application-Specific Sequencing 的关系

## 6.1 New L1 的 separation 解决什么问题

New L1 的 separation 是链内部架构：

- proposer 负责交易排序；
- 共识负责确认顺序；
- scheduler 在后台执行；
- 后续 block 绑定执行结果。

它没有改变“谁有权决定整条链的交易顺序”，也没有把某个应用的交易排序权交给该应用。

## 6.2 与 application-specific sequencing 的比较

|维度|New L1 order/execution separation|Application-specific sequencing|
|---|---|---|
|主要问题|排序与执行的时间耦合|应用交易如何排序、由谁排序|
|作用范围|整条 L1|某个应用、rollup、交易对或业务域|
|排序规则|L1 proposer、fee policy、lane policy|应用 sequencer、共享 sequencer 或应用协议|
|是否提供应用排序权|没有|核心能力就是提供或约束应用排序权|
|是否关注 MEV/fair ordering|不直接解决|通常是核心设计目标|
|是否必须异步执行|不一定，但 New L1 采用异步|不一定|
|是否可以结合|可以作为底层执行/结算环境|需要额外应用层排序器和规则|

因此，答案是：

> **New L1 的 order/execution separation 与 application-specific sequencing 有关系，但不是同一件事。**

它可以成为 application-specific sequencer 的底层 L1，因为它提供快速全局排序和异步执行；但它自身没有：

- 独立的应用 sequencer；
- 应用级排序权；
- 应用级 FIFO；
- 应用级公平排序；
- 应用级 MEV 分配；
- 应用级交易批处理规则。

## 6.3 Multi-Lane 不是应用排序

Multi-Lane 会为延迟敏感的交易类别预留区块 gas capacity。交易通常根据目标合约地址被映射到 lane，未注册合约进入 default lane。它提供的是容量/QoS 保证，并不保证：

- 每个应用拥有独立 blockspace；
- FIFO 顺序；
- 应用自定义排序；
- 应用拥有 proposer 权限；
- 应用有自己的 MEV policy。 [New L1](https://docs.bnbchain.org/newl1/core-concepts/multi-lane/?utm_source=chatgpt.com)

这和 BSC Payment Lane 的思路也相近：更像资源隔离和 QoS，而不是 application-specific sequencing。

---

# 七、200ms block 和 20ms sub-block 的真实含义

## 7.1 三个层次

|层次|时间|可以相信的内容|
|---|---|---|
|Preconfirmation sub-block|约 20ms|当前 proposer 已接收的交易顺序和位置|
|Ordered block|约 200ms|共识确认了交易排序|
|Execution commitment/finality|后续若干区块|执行结果和状态最终化|

20ms sub-block 是当前 producer 持续生成的带签名交易切片。它包含 signer、交易根、交易位置等信息，客户端可以自行验证。但它不是独立 block height，不进入独立 vote pool，也不独立参与 fork choice。[New L1](https://docs.bnbchain.org/newl1/core-concepts/tx-preconfirmation/?utm_source=chatgpt.com)

## 7.2 它能给应用带来什么

它可以用于：

- 订单簿 UI 的快速反馈；
- 支付收据；
- agent 的快速状态提示；
- 高频交易系统的“当前排序位置”确认；
- 交易进入 proposer 本地队列后的可验证证明。

但是不能直接用它证明：

- EVM 已执行；
- balance 已更新；
- swap 一定成功；
- 跨链消息已经可领取；
- 交易一定会进入最终状态。

如果当前 leader 失败，preconfirmation 可能被撤销或失效。官方文档也明确将其描述为 best-effort promise，而不是 execution/finality guarantee。[New L1](https://docs.bnbchain.org/newl1/core-concepts/tx-preconfirmation/?utm_source=chatgpt.com)

## 7.3 无全局 mempool 的影响

New L1 没有传统的全局 mempool。gateway 会把交易直接转发给当前或即将出块的 proposer，producer 主要维护自己的本地 pool 和 preconfirmation stream。[New L1](https://docs.bnbchain.org/newl1/developers/transaction-lifecycle/?utm_source=chatgpt.com)

这有利于低延迟，但也带来几个新的系统问题：

- gateway 依赖；
- proposer 失效时的交易重路由；
- 不同 producer 之间的交易可见性；
- 审查和排序公平；
- 当前 producer 的流量集中；
- wallet、RPC、indexer 对 ordered/executed/finalized 三个 tip 的兼容。

---

# 八、Shielded Transactions 和 DeFi 可组合性

## 8.1 ShieldedPool 的基本结构

ShieldedPool 使用类似 UTXO 的 note 模型：

- note 是隐私资产承诺；
- Merkle tree 证明 note 属于池子；
- nullifier 防止 double spend；
- PLONK 类 proof 证明价值守恒、输入属于池子、nullifier 正确、spend key 合法；
- view key 让收款人或观察者解密 note；
- EOA authorization proof 把 EOA 身份和 note 中的授权公钥绑定。 [New L1](https://docs.bnbchain.org/newl1/core-concepts/privacy/?utm_source=chatgpt.com)

## 8.2 四种交易流程

### Deposit

公开：

- EOA；
- 金额；
- 资产；
- 存入池子。

隐藏：

- note 的内部 blinding；
- 后续 shielded 持有关系。

### Shielded transfer

shielded-to-shielded 路径可以隐藏：

- sender；
- recipient；
- amount；
- asset；
- note 之间的直接关联。

但直接 gas fee 仍可能公开。

### Withdrawal

通常会公开：

- withdrawal amount；
- asset；
- destination。

但不必公开完整的 note 历史。

### Atomic call

这是它能够超出 private payment 的关键。

流程大致是：

1. 消费 shielded note；
2. 把一笔余额临时释放到公开 EVM 调用；
3. 执行 DEX swap 或其他普通合约调用；
4. 将返回结果重新写入新的 open/shielded note。

## 8.3 为什么它还不是 confidential DeFi

假设用户通过 atomic call 使用 DEX：

- DEX 地址公开；
- calldata 公开；
- 交易对和公开 AMM 状态公开；
- 公开 EVM 内部事件可能公开；
- 调用过程中的公开资产转移可能公开；
- 最终结果是否进入哪个地址，取决于重新 shield 的方式。

所以它隐藏的是：

> 用户的 shielded 余额与公开调用之间的直接关联。

它没有隐藏：

> DEX 的合约逻辑、交易对、公开状态、公开 calldata 和整体 DeFi 执行过程。

当前还存在几个限制：

- 只支持原生 BNB；
- 不支持 ERC-20/BEP-20 shielding；
- note insertion 存在批量延迟；
- trusted setup 和电路第三方审计尚未完全完成；
- PQ authorization 尚未实现；
- paymaster/ERC-4337 兼容尚未实现；
- 没有 network-level anonymity；
- relayer metadata 可能暴露关系。 [New L1](https://docs.bnbchain.org/newl1/core-concepts/privacy/?utm_source=chatgpt.com)

因此建议在研究报告中将其写成：

> **ShieldedPool 是可组合的隐私资产池，但目前的可组合性是“隐私资产触发透明 EVM 调用”，不是“隐私状态上的 DeFi 可组合执行”。**

---

# 九、PQ、LtHash 和 Falcon

## 9.1 Flat KV state

New L1 不再使用传统 MPT，而是把状态表示成 flat key-value：

```
account key  = 0x00 || address
storage key  = 0x01 || address || slot
```

每个状态项经过 BLAKE3 XOF 扩展成一个 2048-byte 向量，也就是 1024 个 `u16`；所有 live entries 做逐元素 wrapping sum，最后再对累计向量做 BLAKE3 得到 32-byte state root。[New L1](https://docs.bnbchain.org/newl1/core-concepts/state-db/?utm_source=chatgpt.com)

这个结构具有几个特点：

- 更新一个账户或 storage slot 时不需要重建整棵 trie；
- `mix_in` / `mix_out` 可以做增量更新；
- 向量加法可交换，适合并行；
- 多个执行 shard 可以在较少锁竞争下合并状态；
- 累计状态一旦分叉，后继 commitment 会持续受到污染。

## 9.2 为什么称为 lattice-inspired

官方将其安全性与 SIS（Short Integer Solution）直觉联系起来，采用 1024 维、`u16` 元素和约 128-bit security 的参数方向，并参考 Bellare–Micciancio 和 Solana SIMD-0215。[New L1](https://docs.bnbchain.org/newl1/core-concepts/state-db/?utm_source=chatgpt.com)

但这应被谨慎表述为：

> **lattice-inspired state accumulator / state commitment。**

它不是一个完整的后量子签名系统，也不是因为使用了 lattice-inspired accumulator 就自动拥有完整的 PQ 安全性。

## 9.3 为什么不是 Falcon

Falcon 是一种格基数字签名方案，作用是：

```
私钥签名 → 公钥验证
```

LtHash 解决的是：

```
一组账户和 storage 状态 → 一个可增量更新的状态承诺
```

两者不是同一层密码原语。

当前 New L1 的公开密码栈更接近：

|位置|当前公开方案|
|---|---|
|共识投票|BLS|
|Native AA|secp256k1、P-256、WebAuthn|
|Shielded authorization|EOA/ECDSA 风格认证|
|状态承诺|BLAKE3 + LtHash 风格累计结构|
|PQ account authorization|预留/尚未实现|

因此目前没有理由写“New L1 采用 Falcon 作为 PQ 方案”。更准确的说法是：

> **New L1 在状态承诺层采用 lattice-inspired 累计结构，但当前共识、账户和隐私授权仍主要依赖经典密码学。**

## 9.4 对跨链和轻客户端的影响

由于 New L1 不使用 MPT：

- `eth_getProof` 不支持；
- 传统 Merkle inclusion proof 不能直接复用；
- snap sync 和现有状态证明生态不能直接复用；
- bridge、light client、indexer、跨链消息需要理解新的 accumulator-native proof；
- 不能简单认为“EVM 兼容”就等于“以太坊状态证明兼容”。 [New L1](https://docs.bnbchain.org/newl1/core-concepts/state-db/?utm_source=chatgpt.com)

---

# 十、共识算法：是不是 PoA？

## 10.1 Enhanced Parlia 的核心

New L1 共识继承 BSC Parlia 的基本思想，但重新调整了：

- block interval；
- proposer rotation；
- BLS attestation；
- finality；
- execution commitment；
- validator 对执行结果的验证责任。

目前公开设计包括：

- 约 64 个验证者；
- 约 16-block proposer turn；
- stake-based validator election；
- epoch-bound validator set；
- in-turn proposer 优先；
- out-of-turn proposer 需要 deterministic backoff；
- BLS 跨区块聚合；
- 至少 2/3 attestation；
- Casper-FFG-like justified/finalized 状态；
- double-sign/slashing。 [New L1](https://docs.bnbchain.org/newl1/core-concepts/consensus/?utm_source=chatgpt.com)

## 10.2 和 BSC 当前参数的区别

BSC 当前官方文档仍描述为：

- 45 个 PoSA validators；
- 21 个 cabinet validators；
- 24 个 candidates；
- 约 0.45 秒 block；
- 约 1.125 秒 fast finality。 [BSC Develop](https://docs.bnbchain.org/bnb-smart-chain/introduction/?utm_source=chatgpt.com)

New L1 的 200ms block、约 64 个 validator、BLS 跨块投票、异步执行和 LtHash 状态承诺，意味着它不是简单把 BSC 的 450ms block interval 改成 200ms，而是重新设计了出块和执行边界。

## 10.3 最准确的术语

我建议报告中写：

> **New L1 uses a PoSA-derived enhanced Parlia consensus with stake-elected authority validators.**

中文可以译成：

> **基于 BSC Parlia 派生的、由质押选举验证者的增强型 PoSA 共识。**

不建议只写“PoA”，因为这会忽略：

- BNB stake election；
- epoch validator rotation；
- slashing；
- BLS attestation；
- stake-weighted validator authority。

---

# 十一、对 Mantle application-specific sequencing 的实际启示

## 可以借鉴的部分

### 1. 20ms preconfirmation

适合：

- 支付；
- 订单簿；
- agent；
- 用户界面的快速确认；
- 交易进入 proposer 队列后的可验证反馈。

但应用必须把它当作：

```
签名的暂时排序承诺
```

而不是：

```
已执行且最终化的状态证明
```

### 2. Async execution

如果 Mantle 未来有独立的 app sequencer、batcher 或撮合器，New L1 可以作为一个底层高吞吐 settlement environment：

- 先快速确认顺序；
- 再异步执行；
- 之后绑定 execution commitment；
- 避免 proposer 必须在单个 200ms window 内完成全部 EVM 执行。

### 3. Multi-Lane

Multi-Lane 可以提供：

- lane capacity；
- 延迟预算；
- 交易类别隔离；
- 特定合约地址的资源保证。

但它无法自动提供：

- 应用独立排序；
- 应用 FIFO；
- 应用级公平性；
- 应用 MEV 规则；
- 应用 sequencer 权限。

### 4. Native AA

对以下场景很有价值：

- session key；
- agent key；
- 支付；
- 钱包代付；
- 交易批量执行；
- 限权交易；
- WebAuthn/passkey；
- 账户级 spend limit。

但如果应用需要复杂的：

- 可升级账户；
- 自定义验证逻辑；
- 多模块 wallet；
- 跨链统一账户代码；
- 定制 paymaster；

仍然需要智能合约账户或额外 account framework。

## 不能直接假设的部分

不能把以下概念混为一谈：

- 20ms preconfirmation ≠ execution finality；
- 200ms ordered block ≠ 200ms 最终状态可读；
- Multi-Lane ≠ application-specific blockspace；
- order/execution separation ≠ application-specific sequencing；
- native AA ≠ EIP-7702 compatibility；
- shielded BNB atomic call ≠ confidential DeFi；
- LtHash ≠ Falcon；
- lattice-inspired state commitment ≠ end-to-end PQ security；
- BSC Parallel EVM 研究 ≠ New L1 已经拥有经过主网验证的并行执行器。

---

# 十二、主网前最值得追踪的问题

## 共识

- 最终 validator 上限是否仍然约为 64？
- stake election、epoch 和 slashing 规则是否与 devnet 一致？
- 2/3 BLS finality 在跨地域网络中的实际延迟是多少？
- order-finalized 和 execution-finalized 的 RPC 语义是否冻结？
- proposer failover 后 preconfirmation 如何处理？

## Parallel EVM

- access list 是强制、建议还是可以由 runtime 自动生成？
- 如果交易漏报访问依赖，协议如何发现和修复？
- scheduler 如何保证 deterministic replay？
- adaptive execution lag 的上限是多少？
- execution lag 超过上限后，交易会延迟、丢弃还是重新排序？
- declared gas 全额收费如何影响钱包、lane quota 和 fee market？

## Privacy

- PLONK circuits 什么时候完成第三方审计？
- trusted setup 是否会重新举行？
- ERC-20/BEP-20 shielding 是否进入主网范围？
- atomic call 对 callback、reentrancy、rollback 和失败重试如何定义？
- relayer metadata、view key 和 registration info 的隐私威胁模型是什么？

## PQ

- 是否会给 validator、bridge、AA 和 shielded authorization 使用统一 PQ signature？
- 候选是 ML-DSA、Falcon、SPHINCS+ 还是其他方案？
- LtHash 是否会经过独立密码分析？
- 是否会公开 accumulator-native proof format？
- bridge 是否支持轻客户端验证，而不是依赖全节点重放？

## 生态

- 最终 chain ID、RPC、explorer、debug/tracing API 何时冻结？
- BSC→New L1 bridge 的信任模型是什么？
- BSC 上的应用是否双链部署，还是有官方迁移激励？
- New L1 的 native AA、隐私交易和多 tip RPC 是否会被主流钱包和 indexer 支持？

---

# 最终判断

BNB New L1 的核心不是某一个孤立功能，而是一套围绕低延迟和金融工作负载组合起来的协议设计：

```
enhanced Parlia
    → 快速确认交易顺序

20ms preconfirmation
    → 低延迟排序反馈

order/execution separation
    → 把执行从共识关键路径中移出

access-list-based parallel EVM
    → 尝试并行处理不冲突交易

flat KV + LtHash
    → 支持异步执行和增量状态承诺

native AA
    → 原生批量调用、授权 key、代付和权限限制

ShieldedPool
    → 原生 BNB 隐私资产与原子公开调用
```

对 BNB 而言，New L1 代表的是一次比 BSC 更激进的架构切换：

- 更快的排序；
- 更快的 preconfirmation；
- 更强的协议原生账户能力；
- 更高程度的执行异步化；
- 新的状态承诺；
- 原生隐私交易；
- 仍然是 stake-weighted authority consensus。

但它目前仍然有较大的验证工作：

- public testnet 和 mainnet 尚未完成；
- parallel scheduler 细节仍在设计；
- privacy circuits 尚未完成完整审计；
- bridge 和 proof infrastructure 尚未冻结；
- active path 还不是端到端 PQ；
- 没有原生提供 application-specific sequencing。

因此给老板的最终判断可以写成：

> **BNB New L1 是一条面向低延迟金融、支付、隐私和 agent 工作负载的高潜力互补 L1。它不是官方宣布的 BSC 替代链。其最重要的系统创新是把共识排序、preconfirmation、异步执行和状态承诺组合起来，而不是单纯提高 EVM 多线程性能。它与 application-specific sequencing 有底层协同关系，但没有直接提供应用级排序权。其隐私能力已经超越 private payment，可以通过 atomic call 与透明 EVM DeFi 组合，但当前仍不是 confidential DeFi。其 PQ 设计目前主要体现在 lattice-inspired state commitment，不能等同于 Falcon 或完整后量子共识。**
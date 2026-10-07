---
imported_from: ChatGPT Deep Research
imported_at: 2026-10-07
original_file: near-deep-dive.md
---

# NEAR 深度研究：从分片公链，到跨链交易与机密计算产品栈

**研究截止：2026 年 10 月 7 日。**

我的核心判断是：**NEAR 并不是把 Privacy、Intents 和 AI 都放进同一条公链的执行环境，而是围绕 NEAR 的账户、结算和授权能力，构建了一个跨越多个执行环境、多个信任边界的产品栈。** 公链、跨链签名网络、solver、私有链和机密推理服务之间存在真实的技术复用，但不能把它们理解为共享同一种安全保证。[NEAR Docs](https://docs.near.org/protocol/network/architecture)

对 Mantle 而言，最值得学习的不是“切换叙事的速度”，而是两件事：

**第一，把底层能力包装成外部用户和渠道愿意使用的产品接口。第二，让真实业务的瓶颈决定下一轮基础设施改造，而不是把所有技术方向都纳入路线图。**

不过，NEAR 不是一个“所有产品都成功”的案例。Intents 已有较强的使用和商业化证据；AI 与隐私产品的成熟度需要分别判断；某些曾经贡献用户叙事的产品，也出现了停止维护或终止现有商业模式的情况。

---

## 一、先建立正确的架构认知：统一的是产品体验，不是执行环境与安全模型

### 1.1 NEAR 的叙事变化，并不都意味着重做底层链

NEAR 在 2023 年推出的 BOS，重点是应用发现、前端组件和用户登录体验；同年推出的 NEAR DA，则把已有区块链的数据可用性能力提供给外部 rollup。它们都可以改变 NEAR 对外销售的产品，却不意味着每次都更换 L1 的核心执行模型。[NEAR Foundation](https://near.foundation/blog/near-blockchain-operating-system-is-now-live-on-near-org/)

今天的 Intents、Privacy 和 AI，也应当按这个思路拆解：

|层次|实际执行在哪里|NEAR 在其中提供什么|不能混淆的边界|
|---|---|---|---|
|**NEAR 公链**|公共分片网络、合约 runtime|账户、状态、授权、公共结算|公链共识只直接保证其自身状态转换|
|**NEAR Intents**|链外询价与 solver；链上 verifier 账本|多资产余额记账、签名验证、交易结算|账本内原子结算不等于多条外链同时原子执行|
|**Chain Signatures 与桥**|NEAR 合约、MPC 网络、各目标链|外部账户控制、跨链资产出入金|MPC、桥和目标链各有独立安全假设|
|**Confidential Intents**|FAR 私有 NEAR 分叉、私有 relay、桥|非公开余额与交换状态、公共/私有资产转换|不是主网普通 Nightshade 分片自动获得隐私|
|**NEAR AI**|链外 CPU/GPU 机密计算、agent runtime|推理服务、工具执行；可结合链上授权、密钥和支付|推理不在公链 VM 内执行，attestation 也不是 zkML|

这些区分分别来自 NEAR 架构文档、Intents verifier/桥接文档、FAR 集成文档与 NEAR AI 的验证文档。[NEAR Docs](https://docs.near.org/protocol/network/architecture)

**真正的融合点，是“账户与授权—资产与结算—外部执行”的接口，而不是一个万能 VM。**

用户可以从同一个入口完成跨链交易、使用机密账户，或者让 agent 发起操作；背后却可能经过不同的签名服务、资产托管合约、私有执行环境和外部链。

这是理解 NEAR 的第一条主线，也是评估其风险的起点。

---

## 二、L1 架构 deep dive：NEAR 的优势与代价来自哪里？

### 2.1 核心模型：账户局部状态 + 异步消息，而不是共享同步调用栈

NEAR 的基础设计是：每个账户属于某个 shard，账户的余额、访问密钥、合约及其状态由对应分片处理。Runtime 执行合约时，只提供该账户可访问的状态；**即使另一个合约恰好位于同一分片，也不会因此变成可同步访问的本地对象。**[NEAR Docs](https://docs.near.org/protocol/network/architecture)

跨合约交互通过 receipt，也就是链内消息实现：

> 用户交易 → 执行账户 A 的逻辑 → 生成发给 B 的 receipt → 执行 B → 再通过 callback 处理结果。

这里最重要的性质不是“跨分片”，而是**跨合约调用本身就是异步的**。调用方、被调用方和 callback 分别执行；后面的调用失败，不会自动撤销前面已经完成的状态变化。等待期间，其他交易仍然可以访问相关合约。[NEAR Docs](https://docs.near.org/smart-contracts/anatomy/crosscontract)

因此，开发者必须把业务写成显式状态机，例如：

`Created → FundsReserved → ExternalCallPending → Completed / RefundPending`

而不能默认：

`调用 A → 调用 B → 调用 C，任何一步失败就整体回滚。`

这一选择的好处，是把局部状态执行与跨分片消息传递解耦，给横向扩展留下空间。代价是应用承担更多复杂性：callback 权限检查、重复消息处理、失败补偿、并发期间的状态保护，以及每一步的 gas 预算。

**对 Mantle 的直接启示：**你们的 PropAMM/JIT Router 很依赖“同笔交易内读到状态、重新计算路由、完成执行”的语义。不能因为 NEAR 的可扩展性叙事，就认为异步执行模型也更适合你们的核心交易路径。

### 2.2 Nightshade 与 stateless validation：减少全状态负担，不是用 ZK 替代执行

NEAR 是一条逻辑上的链，区块中包含不同分片的 chunk。Stateless validation 的关键分工是：

- **Chunk producer** 持有并处理相应分片状态，生成 chunk 和 state witness。
- **Chunk validator** 不必常驻持有完整分片状态，而是利用 witness 重新执行、验证状态转换。
- **Block producer** 收到足够的 chunk endorsements 后，再将对应 chunk 纳入区块。

NEP-509 明确规定，所需 endorsement 门槛的分母是**分配给该分片验证工作的 stake**，不是简单地要求全网三分之二 stake 对每个 chunk 都重新执行。[GitHub](https://github.com/near/NEPs/blob/master/neps/nep-0509.md)

State witness 的作用，是给验证者提供执行所需的局部 trie 数据及其包含证明。它不是 succinct validity proof，验证者仍然需要运行状态转换。

所以这里的取舍是：

> 减少每个验证者长期保存全部状态的需求，换取 witness 的生成、传输和重复执行成本。

这也意味着，“stateless”不等于网络不再需要存储状态，更不等于自动获得隐私。

NEAR 选择这一方案，还有一层工程原因：NEP-509 解释了此前 fraud proof、挑战、状态回滚等机制组合起来过于复杂，因此改为在纳入区块前，通过抽样验证者验证 chunk 的有效性。[GitHub](https://github.com/near/NEPs/blob/master/neps/nep-0509.md)

### 2.3 动态分片解决什么，解决不了什么？

NEAR 在 2026 年 7 月 20 日的主网升级公告中，将基于**分片状态大小阈值**的自动拆分列为已上线能力。这个表述应与“交易量一高，系统就自动把任意热点应用线性扩容”区分开。[PR Newswire](https://www.prnewswire.com/news-releases/near-protocol-brings-quantum-safe-signing-to-mainnet-302829646.html)

由账户状态局部性的设计，可以推导出一个重要限制：

**增加分片，主要扩展能够分散到不同账户的工作负载；它不会自动把一个热点合约内部的状态机拆到多个分片上。**

因此，按当前公开的 verifier 结构，不能仅凭“NEAR 全网增加分片”，就推导 `intents.near` 的单账户结算能力同比例提升。合约层仍可能需要分区、分账户设计，或者减少每笔业务占用的公共结算工作。这里是架构推论，不是对该合约实际容量的压测结论。[NEAR Docs](https://docs.near.org/protocol/network/architecture)

另一个经常被忽略的部分是拥塞控制。异步系统中，源分片产生消息的速度可能超过目标分片处理速度，因此需要根据 receipt 队列与目标分片拥塞情况限制继续发送，避免“本地提交成功，但下游队列无限积压”。Nearcore 对 receipt congestion 有专门机制，而不只是依靠更低 gas 价格吸收流量。[near.github.io](https://near.github.io/nearcore/architecture/how/receipt-congestion.html)

### 2.4 “百万 TPS”应该怎样理解？

Near One 的 2025 年 12 月基准测试，确实展示了百万 TPS 级别的能力，但测试条件非常重要：

**70 个分片、原生代币转账、在 chunk producer 上直接生成交易以排除 RPC 瓶颈；稳定运行阶段为每秒 0.5 个区块。**它不是“主网所有智能合约在 600ms 出块条件下都能达到百万 TPS”的证明。[Near One Blog](https://blog.nearone.org/announcement/2025/12/11/scaling-near-to-1m-tps.html)

该测试披露的优化，比 TPS 标题本身更值得 Mantle 参考：

|优化|获益|代价或适用边界|
|---|---|---|
|提前准备待执行交易|缩短 chunk 生产关键路径|最新到达的交易可能赶不上本轮纳入|
|减少验证节点落盘数据|降低 RocksDB 写入负载|RPC、索引、历史查询仍需其他节点承担|
|Ed25519 批量验签|降低签名验证 CPU 成本|整体提升仍取决于其他瓶颈|
|缓存反序列化结果、调整数据库写入|减少重复计算和 I/O 等待|增加缓存与节点配置管理要求|

这些优化均来自该基准测试的工程说明。[Near One Blog](https://blog.nearone.org/announcement/2025/12/11/scaling-near-to-1m-tps.html)

**其中“提前准备交易”对你们尤其有启发：提高吞吐的优化，可能降低最新行情更新进入下一轮执行的机会。**

对于 maker 更新和 preconfirmation，应该优化的是“报价更新被执行路径看到的延迟”，而不只是平均 TPS。这是产品需求对底层取舍的直接约束。

### 2.5 账户、gas、代码复用和 yield：这些能力怎样服务产品？

**原生多密钥账户。**NEAR 账户支持 Full-Access Key 和 Function-Call Key。后者可限制目标合约、方法和 gas allowance，适合应用授权。但 allowance 是 gas 预算，**不是通用的资产支出上限**；限制调用某个方法，也不等于该方法内部不能操作其他资产。Agent 的额度、收款方和风险限制仍应由合约策略实现。[NEAR Docs](https://docs.near.org/protocol/accounts-contracts/access-keys)

**Gas keys。**Nearcore 2.13 引入了有独立预付 gas 余额、最多 1,024 条 nonce lanes 的访问密钥，适合 relayer、机器人或多个 worker 共用账户并发发交易。它解决的是发交易与 nonce 管理问题，**不是把同一个合约状态变成可无冲突并行写入。**[GitHub](https://github.com/near/nearcore/releases/tag/2.13.0)

**Global contracts。**同一份代码可被多个账户复用，减少重复部署和代码存储成本。共享代码不等于共享状态，也不自动解决跨账户原子性。它适合大量结构相同、状态独立的账户或应用实例。[NEAR Docs](https://docs.near.org/smart-contracts/global-contracts)

**Yield/resume。**合约可以创建等待外部结果的 promise，稍后恢复处理。文档给出的等待上限是 200 个区块，超时进入错误处理。它适合 MPC 签名、外部计算等异步工作，但不是把整个 VM 调用栈冻结并持有一笔跨现实时间的原子交易。[NEAR Docs](https://docs.near.org/smart-contracts/anatomy/yield-resume)

这些能力的共同方向，是降低自动化、多账户、多服务协作的成本。

### 2.6 SPICE：下一阶段优化方向，不能提前当成主网现状

2026 年 9 月 30 日发布的 SPICE 工程介绍，指出当前 NEAR 的排序、执行、数据可用性之间存在较强耦合。SPICE 的方向是让共识主要排序轻量事件与承诺，将数据分发、执行及结果认证从出块关键路径中进一步拆开。[Near One Blog](https://blog.nearone.org/research/2026/09/30/spice-01-intro.html)

但截至本次检索，发布页仍将 **2.13.4** 标为最新稳定版，**2.14.0-rc.x** 标为预发布版本。因此，不能把营销页面上的低延迟目标或多合约原子交互描述，直接当作当前所有主网应用已经获得的能力。[GitHub](https://github.com/near/nearcore/releases)

**对开发团队最稳妥的基线，仍然是当前文档明确的异步 receipt 语义，而不是未来架构的理想状态。**

---

## 三、Chain Signatures：把 NEAR 变成外部账户的控制层

在进入 Intents 之前，需要把 Chain Signatures 单独讲清楚，因为它经常被错误地等同于桥或跨链原子执行。

### 3.1 它实际提供的是外部交易签名能力

Chain Signatures 允许 NEAR 账户或合约，通过 MPC 网络为其他链生成交易签名。

可以概念化为：

\[ P_{\text{derived}} = \operatorname{Derive}(P_{\text{MPC}},\ \text{NEAR调用账户},\ \text{path}) \]

外部地址由派生公钥按目标链规则编码生成。对应私钥不由某一个节点完整持有，而是由 MPC 节点协作完成签名。[NEAR Docs](https://docs.near.org/chain-abstraction/chain-signatures)

实际流程是：应用构造目标链交易，调用 NEAR 上的签名合约，请求 MPC 签名，然后将签名组装进目标链交易并广播。目标链的 nonce、gas、UTXO、交易有效期等问题仍然存在，只是私钥控制与签名策略可以由 NEAR 合约协调。[NEAR Docs](https://docs.near.org/chain-abstraction/chain-signatures/implementation)

一个重要细节：派生绑定的是**发起签名请求的 NEAR 账户**。通过策略合约请求时，控制逻辑可以落在该合约，而不是简单等同于最初发起操作的终端用户。

### 3.2 它不提供哪些保证？

官方文档明确将其称为单向的 outbound 能力：**能够签外部交易，不等于能够验证外部状态。**读取或确认外链事件，需要另一个证明、桥接或验证机制。[NEAR Docs](https://docs.near.org/chain-abstraction/chain-signatures)

因此：

**签名有效 ≠ 外链交易已执行；外链交易已执行 ≠ 达到所需 finality；两个外链交易都可签名 ≠ 两者能共同回滚。**

另外，签名算法的 domain 与外链 chain ID 也不能混淆。签名是否绑定某条链，取决于 payload 本身及派生策略；未正确隔离的 payload 仍可能出现跨网络重放风险。[NEAR Docs](https://docs.near.org/chain-abstraction/chain-signatures)

### 3.3 为什么这是一项真正可复用的基础设施？

同一套能力可以服务不同产品：

交易产品用它控制外链出金；钱包用它管理多链账户；策略合约用它根据规则操作外部资产；agent 则可以在受控授权下执行跨链动作。

但其安全模型始终需要单独审查：MPC 节点集合、阈值、成员变更、签名策略合约，以及节点不可用时的恢复路径，不能用“NEAR L1 有很多验证者”一笔带过。

---

## 四、NEAR Intents：真正的核心是跨链资产的统一结算账本

### 4.1 它不是让大模型替用户执行任意自然语言任务

在目前公开实现中，Intents 的关键组件是部署于 **`intents.near`** 的 verifier 合约。它记录用户存入资产对应的内部余额，并验证、执行用户签署的授权操作。[NEAR Intents](https://docs.near-intents.org/integration/verifier-contract/introduction)

链外 solver 负责报价和资金安排；链上 verifier 负责检查授权与结算是否合法。

这里有三个相互独立的问题：

**谁授权？**用户签名及其账户权限。  
**什么价格成交？**链外询价与 solver 竞争。  
**资产如何交换？**verifier 内部账本的余额变化。

Verifier 本身不是“最优价格证明器”，也不是一个通用 AI planner。

### 4.2 `token_diff`：为什么能在异步公链上完成原子交换？

其核心操作之一是 `token_diff`，即用户授权的资产余额变化。多个参与者的变化可以被放入同一次 verifier 执行中。[NEAR Intents](https://docs.near-intents.org/integration/verifier-contract/intent-types-and-execution)

用一个忽略费用的抽象例子：

|参与者|资产 A 的变化|资产 B 的变化|
|---|---|---|
|用户|−100|+2|
|Solver|+100|−2|
|合计|0|0|

对只涉及交换、没有外部 mint/burn 的结算子过程，可以用两个不变量理解：

\[ \forall a,\quad \sum_u \Delta_{u,a}=0 \]\[ \forall u,a,\quad b_{u,a}+\Delta_{u,a}\geq 0 \]

收取费用时，把费用接收账户也纳入相应资产的记账。

关键在于：**需要原子变化的余额被放进同一个 verifier 状态机里，而不是每次交换都同步调用多个外部 token 合约。**这样可以在本地原子执行范围内完成授权检查和余额结算。[NEAR Intents](https://docs.near-intents.org/integration/verifier-contract/introduction)

这是一个很重要的架构策略：

> 不去消灭全系统的异步性，而是把最需要原子性的那部分状态集中起来。

代价则是共享账本的热点、存入资产的安全边界，以及提现和桥接仍需另行处理。

### 4.3 多链钱包如何使用它？

Verifier 有自己的账户—公钥映射。外部用户可以用现有钱包签署消息，不必先创建并充值一个常规 NEAR 链账户。其签名适配覆盖 NEAR、Ethereum、TRON、Ed25519 钱包和 WebAuthn 等形式。[NEAR Intents](https://docs.near-intents.org/integration/verifier-contract/account-abstraction)

这与 NEAR 原生访问密钥不是同一层：

- 原生访问密钥决定谁能发起某个 NEAR 账户的交易。
- Verifier 内的密钥决定谁能授权某个内部账本账户的操作。

而且，当前文档说明 verifier 注册密钥具有完整账户控制，包括管理其他密钥。**不能因为它支持多密钥，就默认它已经提供按金额、按时间、按收款方限制的 agent session policy。**[NEAR Intents](https://docs.near-intents.org/integration/verifier-contract/account-abstraction)

### 4.4 一笔跨链交换的完整生命周期

以“用户用源链上的 USDC 换取 Bitcoin 地址上的 BTC”为例，一个典型路径如下。具体桥、流动性来源和加速方式会随路由变化。

**第一步：询价。**  
前端向 1Click API 提交来源资产、目标资产、数量、收款地址、退款地址、deadline、滑点容忍度等。Solver 根据库存、对冲成本、跨链成本和风险返回报价。1Click 将这些步骤包装为统一接口。[NEAR Intents](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request)

**第二步：源链入金。**  
用户向返回的 deposit address 转账。这里用户完成的是源链操作，而不是必须先切换到 NEAR 钱包。桥接基础设施处理入金确认和可用于结算的资产表示。[NEAR Intents](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request)

**第三步：verifier 结算。**  
满足条件后，用户与 solver 的内部余额交换。Solver 可以预先持有库存，不必每接一笔订单都即时完成一次外部市场买卖。市场做市和库存补充可以发生在结算路径之外。[NEAR Intents](https://docs.near-intents.org/integration/verifier-contract/introduction)

**第四步：目标链出金。**  
通过对应桥和签名机制，将目标资产发送到收款地址。至此才进入目标链交易传播、确认和最终性阶段。[NEAR Intents](https://docs.near-intents.org/integration/bridging/overview)

所以用户看到的“一次 swap”，实际至少包含：

**源链入金状态 → 内部结算状态 → 目标链出金状态。**

其中只有特定局部状态转换是原子的。不能把 UI 的“一次操作”，当作三个域共享一套 rollback。

### 4.5 为什么它比单纯的 swap aggregator 更有产品价值？

我的判断是，NEAR Intents 的重要进步不只在报价，而在于**统一用户旅程**：

用户不必自行决定用哪座桥、到中间链后换什么 gas token、先桥再换还是先换再桥，以及失败后去哪里查状态。分发渠道接入一个接口，就可以销售跨链交换体验。

这也是为什么它特别适合嵌入钱包，而不是只能在一个 NEAR 原生 DEX 页面里使用。Brave 和 Ledger 都发布了自己的集成公告，Ledger 的路径还经过 SwapKit，体现了渠道与流动性基础设施之间的分层。[Brave](https://brave.com/blog/near-intents/)

### 4.6 主要 tradeoffs：桥、安全、价格与分发权力

**不同资产路径不是同一安全模型。**官方桥接总览列出了 OmniBridge、PoA Bridge 和 HOT Bridge，并明确要求按桥区分信任模型。不能因为入口统一，就把所有支持链都视为经过相同的 light-client 验证。[NEAR Intents](https://docs.near-intents.org/integration/bridging/overview)

**“最终拿到原生资产”不代表内部没有桥接或资产表示风险。**用户可以不长期持有 wrapped token，但入金资产、内部余额与出金资产之间仍需由实际桥接机制维持对应关系。

**价格最优性依赖市场结构。**Solver 数量、库存、报价覆盖、信息优势、渠道分配都会影响执行质量。结算合约只能验证“用户同意的条件被满足”，不能证明“这是整个市场可获得的最好价格”。

**低 L1 gas 不等于低总交易成本。**当前 1Click fee configuration 对普通认证路径列出 20 bps 基础收费，部分稳定币和同资产跨链路径为 1 bp，并有渠道分成及最低收费规则。旧费用总览与新配置页面存在差异，实际集成应以具体报价和合作条件核对，而不是引用一个统一的“协议手续费”。[NEAR Intents](https://docs.near-intents.org/integration/distribution-channels/1click-api/fee-config)

---

## 五、Privacy：Confidential Intents 不是主网自动变成隐私链

### 5.1 实际架构是公共 NEAR + FAR 私有链

技术文档将其描述为两条链：

**公共 NEAR 上的 `intents.near`**，以及  
**FAR 私有 NEAR 分叉上的 `intents.far`**。

FAR 使用小规模许可验证者集合，没有公共网络入口，RPC 通过认证渠道访问。它不是普通主网 shard 上“加一个隐私开关”。[NEAR Intents](https://docs.near-intents.org/integration/market-makers/confidential-intents)

资产进入与退出的过程是：

**Shield：**公共链资产进入 Treasury → Private PoA Bridge 处理 → FAR 上铸造对应 IMT。  
**私有交换：**在 FAR 内通过 `token_diff` 改变余额。  
**Unshield：**销毁 IMT → 桥释放公共链上的 backing assets。

私有 relay 用于询价和收集 solver 签名；它与公共 Message Bus 分开，市场做市商要针对私有流动性报价。[NEAR Intents](https://docs.near-intents.org/integration/market-makers/confidential-intents)

面向用户的产品页面则强调 TEE-based bridge、权限化验证者及选择性披露能力。这里的隐私方案与“用户生成 ZK proof、公共网络验证隐私状态转换”的路线不同。[NEAR Intents](https://intents.near.org/confidential)

### 5.2 隐私究竟对谁成立？

这是比“是否支持 Privacy”更重要的问题。

|观察者|能合理期待什么|不能直接推导什么|
|---|---|---|
|公共链索引器、普通观察者|看不到 FAR 内部完整余额与交换记录|看不到公开链上的入金、出金和时间信息|
|普通 MEV 搜索者|难以直接观察私有执行路径|所有类型 MEV 都被消除|
|接收 RFQ 的 solver|可以根据请求报价|请求内容对 solver 本身完全保密|
|私有执行与基础设施运营方|受到许可、代码与可能的 TEE 机制约束|仅凭“私有 RPC”就能证明运营方无法接触明文|

这张表是根据公开架构做出的威胁模型分析。尤其是最后一行，必须进一步核验真实部署中的 TEE 测量值、密钥释放条件、日志、升级权限和数据访问策略，不能只读产品页上的“confidential”。[NEAR Intents](https://docs.near-intents.org/integration/market-makers/confidential-intents)

**Confidentiality 不等于 anonymity。**即使中间账本不公开，入口与出口的金额、时序、渠道日志、网络元数据仍可能产生关联；“没有公开 mempool”也不能证明受许可参与方无法获得交易信息优势。

### 5.3 这项产品为什么能与 Intents 快速融合？

因为它复用了已有产品抽象：资产标识、签名 intent、solver 报价、余额变化和出入金流程。

1Click 的 API 已把公共余额、机密余额和外链地址纳入同一套 `depositType` / `recipientType` / `refundType` 参数体系，并提供 `confidentiality` 选项。这使隐私可以作为原有交易接口的扩展，而不必重新获得一整套用户和渠道。[NEAR Intents](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request)

**这是很强的产品工程经验：先形成被集成的接口，再将新能力塞进原有用户旅程。**

代价是多了一层私有状态与桥接风险。对开发团队，最关键的核验问题应当是：当 FAR、relay 或桥不可用时，用户的资产退出路径是什么，恢复依赖谁，而不只是正常情况下交易有多快。

### 5.4 隐私产品也存在明确的政策执行层

SHIELD 是 Intents/1Click 的安全策略服务。文档区分了已运行的询价检查与 scoped delay、正在扩展的其他执行路径，以及更长期的 solver/liquidity 控制愿景。它不是所有能力都已部署完成的“全栈冻结开关”。[NEAR Intents](https://docs.near-intents.org/security-compliance/proactive-intents-security)

合规文档也说明，集成的 quote flow 会使用多种地址风险数据进行检查，覆盖程度随路径而异。[NEAR Intents](https://docs.near-intents.org/security-compliance/risk-and-compliance)

因此，产品提供“对公众保密”，并不等于它承诺“任何人都能不受限制地通过所有官方服务执行”。

---

## 六、AI：至少要拆成推理服务、agent runtime、链上授权与支付

### 6.1 NEAR AI Cloud：主要是在链外提供机密推理

NEAR AI Cloud 提供模型 API 和机密计算环境。其验证体系涉及 Intel TDX 的 CPU 侧证据，以及在适用情况下的 NVIDIA GPU attestation。[NEAR AI](https://near.ai/)

从产品角度，客户买到的是“以可验证的机密环境运行推理”，而不是“让公链验证者集体运行 LLM”。

**调用一次模型 API，不必对应一笔 NEAR 交易；推理 token 数、AI 应用 MAU 和链上地址数，也没有直接的一一映射。**

对 devs，需要特别谨慎理解 attestation 的边界。官方验证流程要求检查 fresh nonce、CPU quote、事件日志与测量值、GPU 证据，以及响应签名与预先验证报告的绑定。验证 gateway，不等于已经验证实际模型服务端。[NEAR AI Docs](https://docs.near.ai/cloud/verification/cloud-api/gateway-attestation)

还有一个非常具体的限制：当前文档指出，**同一模型的不同 serving instances，包括测量配置不同的实例，可能共享签名密钥。**因此，仅匹配响应签名者，不能证明某份 attestation 与该次 completion 来自同一个具体实例。[NEAR AI Docs](https://docs.near.ai/cloud/verification/cloud-api/model-attestations)

这意味着不能把 TEE attestation 宣传成：

“数学证明每一次输出由某个特定模型配置正确计算，且结果本身可信。”

它主要提供环境与软件身份相关的保证，不是 zkML，也不能消除模型幻觉、外部数据错误或应用层泄露。

### 6.2 IronClaw：解决 agent 能执行什么，而不只是模型会说什么

IronClaw 是另一类产品：agent runtime。其代码强调 WASM 工具沙箱、能力限制、网络 endpoint allowlist、凭证在宿主边界注入、泄露扫描等机制。它可以本地部署，也可以选择不同模型供应方，因此不能把所有 IronClaw 实例都等同于运行在 NEAR AI TEE 里。[GitHub](https://github.com/nearai/ironclaw)

2026 年 7 月的 1.0 发布，进一步强调将“模型提出决策”和“系统允许执行动作”分开，并对敏感动作设置 guard 和批准机制。[NEAR AI](https://near.ai/blog/introducing-ironclaw-1-0)

这对金融 agent 的启示很直接：

**模型可以建议交易，但决定能否交易的，应是独立、确定性的授权策略。**

对于 Mantle，比“推出一个 AI agent”更值得复用的是这条边界：模型不能仅凭生成一段文本，就获得任意收款方、任意额度和任意合约调用权限。

### 6.3 CKD：AI 与链基础设施之间一个真实的技术连接

Confidential Key Derivation，简称 CKD，是我认为最能说明 NEAR 技术复用的一项能力。

它把已有 MPC 网络扩展成一个分布式密钥管理服务。TEE 应用通过身份与 attestation 检查后，请求一个与应用身份及派生路径绑定的确定性秘密；MPC 节点以加密形式返回结果，使应用在迁移或重启后仍能恢复同一密钥。[Near One Blog](https://blog.nearone.org/research/2026/02/23/mpc-ckd.html)

其设计使用 threshold BLS 等密码学机制，让链上观察者和未达到攻击阈值的单个节点不能直接得到应用密钥。实际用途包括加密持久化数据，而不是把秘密写进公开链状态。[Near One Blog](https://blog.nearone.org/research/2026/02/23/mpc-ckd.html)

这构成了一条有意义的技术演进：

**跨链签名网络 → 更通用的密码学服务 → 机密应用的密钥管理。**

但公开设计说明并不足以证明，所有 NEAR AI 和 FAR 生产部署都使用完全相同的 CKD 路径。这一点需要按产品逐项确认。

### 6.4 私有 agent 支付：产品组合成立，规模仍待验证

NEAR AI 已发布利用 USDC 和 Confidential Intents 进行私有 agent 支付的方案，用于 agent 购买服务、API 或参与 agent marketplace。[NEAR AI](https://near.ai/blog/usdc-confidential-intents-private-agent-payments)

这让三条产品线形成了一个逻辑闭环：

**AI 决策 → 受控工具执行 → 资产授权 → 支付与交易 → 可选机密结算。**

但“接口可以组合”与“存在大规模、持续付费的 agent 经济”是不同命题。本次没有找到足以独立验证后者的付费用户留存、推理利用率或按客户分组收入数据。

### 6.5 一个不能忽略的反例：Shade Agents 已停止独立维护

历史上的 Shade Agents 将 TEE worker、链上验证和 Chain Signatures 组合起来，是理解 NEAR agent 思路的重要参考。

但官方文档明确说明：**2026 年 4 月 19 日之后，Shade Agent Framework 不再作为独立开发工具维护；代码仍开源，使用团队需要自行承担维护责任。**[NEAR Docs](https://docs.near.org/ai/shade-agents/introduction)

因此，不应把 Shade Agents 的历史发布、IronClaw 的当前发布、AI Cloud 的客户集成和 agent 支付方案全部累加，得出“NEAR 已形成成熟统一 AI 生态”的结论。它们解决的问题、部署方式和生命周期都不同。

---

## 七、生态研究：用户真正使用的是什么？

### 7.1 首先纠正指标口径

“NEAR 用户很多”至少可能指四件不同的事：

**NEAR 链活跃账户、某个应用的活跃用户、跨链 Intents 用户、集成渠道可触达的用户。**

这四者不能相加。

特别是在 Intents 中，链上提交者可能是 relayer 或 solver，终端用户身份在签名 payload 或源链地址中；只统计 NEAR transaction sender，既可能漏掉真实用户，也可能把自动化服务账户当成用户。这个判断来自其账户抽象与执行模型。[NEAR Intents](https://docs.near-intents.org/integration/verifier-contract/account-abstraction)

下面是本次抓取到的公开面板快照，而不是已统一到同一时间点的审计数据：

|指标|页面快照|应怎样解释|
|---|---|---|
|NEAR 活跃地址，24h|124,809|活跃地址，不是真实人数|
|NEAR 交易数，24h|909,765|不等于全部终端业务操作数|
|NEAR 链内 DEX 交易额，24h|约 1,788 万美元|与跨链 Intents 交易额口径不同|
|NEAR DeFi TVL|约 2.37 亿美元|受借贷、LST、重复计算设置影响|
|Intents 交易额，30d|约 44.15 亿美元|DefiLlama 的协议统计|
|Intents fees / revenue，30d|约 738 万 / 193 万美元|收费与归集收入，不是公司净利润|

链指标来自 DefiLlama 的 NEAR 页面，Intents 指标来自其协议页面。[DefiLlama](https://defillama.com/chain/near)

需要说明，官方 Intents explorer 同次抓取显示的 30 天交易额约为 **32.64 亿美元**，与 DefiLlama 并不一致。因此，我不会把不同面板的交易额与收费拼接，计算一个看起来精确的统一费率。差异可能涉及更新时间或统计口径，需要进一步对账。[Explorer](https://explorer.near-intents.org/)

### 7.2 最有力的接受度证据：通过外部钱包完成跨链资产交换

这里的用户接受的是：

**“用我现有的钱包，把已有资产换成另一条链上需要的资产。”**

而不是必须接受“迁移到 NEAR 生态”。

官方 explorer 的渠道快照中，SwapKit 对应约 **8,879 笔、1,556 万美元**的 24 小时交易；Rango 对应约 **1,375 笔、286 万美元**。同一页面还能看到 Ledger/SwapKit、THORSwap 等 affiliate 记录。它们不是严格去重用户数，但比单纯展示合作伙伴 logo 更能说明分发渠道正在产生交易。[Explorer](https://explorer.near-intents.org/)

Brave 与 Ledger 自己的公告，则验证了这些产品入口确实存在。**然而，Brave 的浏览器 MAU 或 Ledger 的设备用户数，不能转换成 NEAR Intents 用户数。**[Brave](https://brave.com/blog/near-intents/)

我的判断是：**这是目前 NEAR 最清晰的产品接受度——跨链交易服务被嵌入已有用户入口。**

### 7.3 NEAR 原生 DeFi：RHEA 与质押相关产品仍有实际需求

RHEA 是 Ref Finance 与 Burrow Finance 合并演化后的产品体系，主要功能仍包括 AMM 交易和超额抵押借贷，并向跨链交易、借贷及资产管理扩展。[Rhea Finance Guide](https://guide.rhea.finance/docs/rhea-finance-white-paper)

DefiLlama 的当前快照中，RHEA 有实际 fee/revenue 记录，Meta Pool 与 LiNEAR 也有显著的 LST 存量。这说明 NEAR 生态并非只剩 Intents，但也不能把各协议显示的 TVL 直接相加，作为 NEAR 的无重复总资本规模。[DefiLlama](https://defillama.com/chain/near)

这些用户主要接受的功能比较传统而明确：兑换、借贷、质押收益和资产配置。它们与“AI 链”叙事之间，并不存在必须的因果关系。

### 7.4 HOT：重要的是把复杂基础设施变成钱包功能

HOT Wallet 提供移动端、浏览器扩展与 Telegram 入口，并集成 NEAR 账户、gas/存储体验、RHEA 和 Intents 路由等功能。其价值在于让用户在钱包里完成跨链与 DeFi 操作，而不是要求用户理解每一个底层协议。[Hot Labs](https://hot-labs.org/blog/hot-wallet-the-main-wallet-for-near-protocol)

但这里同样要区分：钱包安装量、激励参与账户、月活用户、产生交易费用的用户，是不同指标。本次没有获得可审计的 HOT 当前活跃用户分解，因此不将其自述规模直接写成 NEAR 的真实用户数。

### 7.5 Sweat：大规模用户入口，不等于商业模式可持续

这是本次研究最值得纳入战略判断的新变化。

Sweat Foundation 宣布，**Sweat Wallet 及 SWEAT 目前的业务形态将在 2026 年 12 月 30 日结束**。公告解释了收入与 treasury 压力、增长放缓、交易所下架及安全事件应对成本等因素，并明确团队未能实现持续盈利。[Sweat](https://update.swe.at/)

需要准确区分：

**SWEAT token 合约仍继续存在；Sweatcoin 应用是另一个业务，并不因为这份公告一同终止。**[Sweatcoin](https://help.sweatco.in/hc/en-us/articles/51460165943569-What-s-Happening-to-Sweat-Wallet-and-Sweat)

对公链运营者，这个案例说明：

> 为大量消费者创建链账户，是分发能力的证明；但能否让他们持续使用、付费并覆盖业务成本，是另一场考试。

KAIKAI、HOT、Sweat 等消费入口，应按各自当前产品、实际链上行为和收入分别评价，不能继续把历史注册账户或设备触达量当作当前健康度。

### 7.6 Privacy 与 AI：已有产品，不宜声称已达到同等级 PMF

Confidential Intents 已有 API、机密账户和 solver 接口，NEAR AI 也有推理、runtime 与支付产品。但本次公开资料尚不足以可靠拆分：

隐私功能的独立复购用户、真实支付意愿、扣除激励后的收入；以及 AI 产品的付费客户留存、推理毛利与对 NEAR 链收入的贡献。

因此，我会把成熟度判断写成：

**Intents 的跨链交易与渠道分发：证据较强。**  
**原生 DeFi 与钱包：有实际使用，但不能统一归入新叙事。**  
**隐私与 AI：产品集成真实，独立商业闭环仍需更多数据。**

这不是否定后两者，而是避免把“发布”“集成”“用户使用”“可持续盈利”混成同一个阶段。

---

## 八、NEAR 的开发与运营方式，哪些值得学，哪些不应美化？

### 8.1 它更像“基础能力复用 + 产品筛选 + 反向优化”，不是纯粹的 PMF-first

从公开资料，可以观察到两种方向同时存在。

一方面，账户模型、分片与异步执行早于今天的核心产品，属于先建设通用基础能力。

另一方面，gas keys 对并发发送者的支持、MPC 向 CKD 的扩展、机密余额进入 1Click 参数体系，表现出很强的具体工作负载导向。[GitHub](https://github.com/near/nearcore/releases/tag/2.13.0)

因此，更准确的表述是：

**NEAR 不是“先找到一个 PMF，再按需从零造链”；而是在已有平台上不断选择产品，把跑出来的工作负载反过来变成基础设施需求。**

公开接口和发布记录可以证明设计上的适配，但不能完全证明团队内部的立项因果。我不会把所有协议升级都倒推成 Intents 或 AI 成功带来的结果。

### 8.2 最值得借鉴的运营能力，是经营分发渠道

Brave、Ledger、SwapKit、钱包和聚合器的意义，不只是“生态伙伴数增加”，而是产品直接进入已有的用户操作路径。

同时，1Click 提供渠道收费、分成和定制合作条件，使渠道有经济动力维护集成，而不只是领取一次性 grant。[Brave](https://brave.com/blog/near-intents/)

由此得到的运营启示是：

**公链生态增长可以从“让开发者来我的链部署”，转向“让已有渠道把它们的用户订单交给我的服务”。**

这两种增长模式需要不同的组织能力。后一种更依赖报价竞争力、接口稳定性、状态追踪、退款体验、渠道结算和支持响应。

### 8.3 收入模型应在应用服务层评估，不能只盯 L1 gas

DefiLlama 对 Intents 收入的定义，是归集进入指定 revenue wallets 的 NEAR/wNEAR，并排除这些钱包之间的内部转移；fees 则包含各集成方收取的协议与分发费用。[DefiLlama](https://defillama.com/protocol/near-intents)

所以这里至少要区分：

**终端用户支付的总费用、solver/渠道分成、协议归集收入、基础设施成本、团队经营利润、代币持有者实际价值捕获。**

这些不是同一个数字。

对 Mantle，比较值得借鉴的是：当核心产品是交易服务时，商业模型可能更多来自交易接口与分发，而不是设法让每个用户多支付几次链 gas。

### 8.4 多产品、多桥组合，也带来了真实接口风险

2026 年 10 月 1 日，NEAR Intents 披露约 **380 万美元**的安全事件。公开报道援引团队说明，将问题描述为 Omni 入金/出金基础设施与 Intents 合约之间的交互缺陷；10 月 2 日更新称，被转移资金已全部归还。[CoinDesk](https://www.coindesk.com/tech/2026/10/01/near-intents-hit-by-usd3-8-million-exploit-as-crypto-s-rough-year-of-hacks-continues)

这里应避免两个错误：

既不能因此断言 NEAR L1 共识被攻破，也不能因为资金归还，就忽略组合系统的安全风险。

在未获得足够完整的技术复盘前，不应擅自把根因归为 MPC 密钥失陷或某一种特定桥算法。**但事件本身提醒了一个非常重要的工程事实：多个单独审计过的模块，组合后仍可能在身份、余额、消息顺序和状态转换接口上出现漏洞。**

---

## 九、Mantle 应该怎么学：优先复制产品接口和迭代方法，而不是复制全栈

结合你正在推进的 mStocks、PropAMM/JIT Router、preconfirmation，以及“资产发行 + 资产交易”的方向，我建议把借鉴重点收敛成下面几项。

### 9.1 先建设“外部资金访问 Mantle 资产”的产品，而不是先建设一个宏大的 Intent OS

理想的用户表达应是：

> 我在某条链有资产 A，希望获得 Mantle 上的资产 B，至少收到多少，失败退到哪里。

这可以被拆成三个边界清晰的系统：

|层次|Mantle 应关注的职责|不应承诺的能力|
|---|---|---|
|**跨链访问层**|源资产接入、路由、目标资产、退款、状态追踪|把所有桥包装成同一种安全保证|
|**Mantle 本地执行层**|PropAMM、AMM、JIT 路由、用户价格约束|用链外报价替代最终执行约束|
|**排序与确认层**|Maker 更新、订单纳入、preconfirmation 语义|把预确认当成跨链原子回滚|

先验证 mStocks 和其他核心资产是否能获得外部订单，再决定是否自建复杂 solver 网络或统一资产账本。

接入已有跨链网络也应作为选项评估，但要逐项核验 Mantle、具体 token、目标链和出入金路径是否受支持，不能从“支持很多链”推导当前已支持你们需要的全部路径。

### 9.2 保留 JIT Router 的本地优势，不必照搬 verifier 托管账本

NEAR 使用统一内部账本，是在其异步合约模型下获得局部原子结算的一种有效办法。

但 Mantle 的本地交易问题不完全相同。你们已经在关注同笔交易内的报价更新、路由重算与执行，因此应优先保留这一能力。

一个可行的设计方向是：

**跨链或链外层提供用户目标和价格边界 → Mantle 本地 JIT Router 在实际状态下决定如何执行 → 最终不得突破用户授权条件。**

不要为了采用“Intents”这个名字，反而不必要地增加资金长期存入统一账本、额外提现与新的升级权限风险。

### 9.3 隐私先从 RFQ、策略与数据访问开始，不必一开始就建私有链

对你们的做市商产品，更值得先验证的需求可能是：

**订单在成交前是否暴露，maker 报价是否泄露库存，策略数据是否被基础设施运营方看到。**

这些问题不一定都要求私有状态机。可以先实验受控 RFQ 分发、请求最小披露、日志策略、加密数据处理或适当的机密计算。

只有当产品确实需要持续隐藏余额、持仓及状态转换时，再评估私有执行环境。届时，必须同步定义公共资产退出机制、验证与升级权限，以及故障时谁能恢复系统。

NEAR 的经验说明私有执行环境可以快速扩展产品，但它也说明：**隐私能力的获得，可能意味着增加信任假设，而不是免费叠加在原有安全性上。**

### 9.4 Agent 的最小有效产品，是受限执行，不是无限自主

对 Mantle，较有价值的初始场景可能是订单管理、再平衡、受限做市辅助或特定 vault 操作，而不是“任意自然语言交易”。

建议将 agent 权限明确落实为：

**资产范围、额度、收款方、目标合约、有效期、撤销机制，以及可审计的执行记录。**

模型、TEE 和 MPC 分别解决不同问题；它们都不应替代资产策略本身。IronClaw 的“决策与动作授权分离”，比笼统的“AI 上链”更有借鉴价值。[NEAR AI](https://near.ai/blog/introducing-ironclaw-1-0)

### 9.5 以三个实验决定下一轮 infra 投入

|实验|要验证的产品问题|达到什么条件才值得升级 infra|
|---|---|---|
|**外部钱包 → Mantle 核心资产**|用户是否愿意从原有入口购买或交易 Mantle 上的资产？|路由成功率、价格或出入金延迟成为明确瓶颈|
|**JIT Router + maker 更新时序**|能否降低报价到执行之间的损失，改善 maker 与用户结果？|实测发现排序、状态可见延迟或纳入承诺限制产品|
|**私有 RFQ / 受限 agent 执行**|用户或 maker 是否愿意为机密性、自动化和权限保障付费？|普通合约与服务无法满足已证实的隐私或执行需求|

这些实验不需要先决定“我们也要做 NEAR 式的全部产品栈”。

真正应该追踪的核心指标是：**有效报价到成交的转化率、含所有费用的执行价格、完成与退款的尾部延迟、非激励重复交易、maker 实际损益，以及订单扣除渠道和执行成本后的贡献。**

账户数、交易数和 TVL 可以作为辅助指标，但不应替代这些产品指标。

---

## 十、最终结论

**NEAR 是一个值得学习的“产品与基础设施共同演化”案例，但不是一个所有热点都被成功整合、所有产品都获得 PMF 的万能链。**

它最成功的技术组合，是把账户授权、链上结算、外部签名、solver 和渠道 API 连成可使用的交易服务；隐私和 AI 则继续复用其中一部分能力，同时引入新的执行环境与信任假设。

它最值得学习的运营方式，是让外部钱包、聚合器和其他已有用户入口分发其服务，而不是要求用户先成为“NEAR 生态用户”。

它最值得警惕的部分，是把统一产品体验误读为统一安全模型，把历史大用户量误读为可持续需求，把多个 AI/隐私产品的发布误读为已经形成商业闭环。

**对 Mantle，我更赞成这样一条路线：先让用户能够方便、可靠、以好价格获取和交易 Mantle 上的核心资产；再用真实订单证明需要哪些链级优化。**

这比复制 NEAR 的叙事集合更有价值，也更符合你正在强调的“先核心产品，再补齐 infra”的迭代方式。
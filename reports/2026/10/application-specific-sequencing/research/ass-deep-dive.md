---
imported_from: ChatGPT Deep Research
imported_at: 2026-10-11
original_file: ass-deep-dive.md
---

# Mantle 的应用特定排序：跨生态调研与架构建议

**我赞成你“重新分配完整区块空间”的方向，但不建议把它实现为简单的“Payment 走 FCFS、DeFi 按 tips 排序”两条队列。**

更适合 Mantle 的目标是：

> **保留统一的 EVM 状态与结算环境，在链层分配不同业务的资源预算，在市场层定义不同操作的排序规则，再为这些规则提供明确的验证与失效处理机制。**

这里有三个需要分别设计的问题：

**哪些交易能获得区块空间；获得空间的交易如何排序；应用根据这个顺序如何成交。** 它们不能被一个 priority fee 统一解决。

下面先梳理现有实现，再提出 Mantle 的设计。调研以截至 **2026 年 10 月 11 日**可核验的官方文档、代码和研究为依据，覆盖主要实现范式，而不把“任何使用优先费的链”都归为 ASS。文中的 Mantle 架构和参数示例是设计建议，不是对现网能力的描述。

---

## 1. 先明确：你真正需要的不只是 application-specific sequencing

你提供的文章中，ACE 指的是 **Application-controlled Execution** 这一能力范式，而不是一个与 Sorella 平级的具体项目。文章讨论的核心是：应用能否约束一批涉及自身的操作的执行顺序，以及这些约束对组合性的影响。[Ethereum Research](https://ethresear.ch/t/application-controlled-execution-a-case-study-on-cancel-prioritization/23977)

对于 Mantle，我建议拆成四层理解。

|层次|需要回答的问题|Mantle 中的例子|
|---|---|---|
|**区块空间分配**|谁能进入区块？拥堵时谁不能被挤出去？|Launchpad 爆发时，支付和 Perps 风控操作仍有容量|
|**排序策略**|已获准进入的交易，谁先执行？|支付按接收顺序；同一市场撤单先于吃单|
|**成交与结算机制**|排序之后，价格、成交量、收益如何确定？|连续撮合、批量统一清算、套利权拍卖|
|**约束与验证**|谁保证规则被遵守？违约后会发生什么？|Sequencer 承诺、合约检查、TEE、协议有效性检查|

**你想做的，其实是“应用感知的区块空间管理”，ASS 是其中一部分。**

### 1.1 Payment 使用 FCFS 是合理默认，但还不够

我建议把支付的产品目标写成：

> **满足准入条件的支付，不能通过加价被同类支付插队，也不能因为其他业务拥堵而无限排队。**

这里前半句是 FCFS，后半句是容量保障。两者需要不同机制。

还要定义“先来”的观察点：是用户点击发送、RPC 收到，还是 sequencer 接受？对 Mantle 可实现的初始定义，应当是**受认可入口正式接受交易的顺序**，而不是声称实现全球网络中的绝对先到先得。

### 1.2 DeFi 不应该统一使用 tips-first

我会把你的判断进一步细分：

|操作|更值得优先满足的目标|候选机制|
|---|---|---|
|普通用户兑换|更好的成交价格、减少被利用|批量成交、intent、受保护的执行路径|
|套利竞争|通过竞争发现执行权价值|Tips 竞价、显式套利权拍卖、MEV tax|
|做市报价更新、撤单|避免陈旧报价被抢先成交|Maker-first、cancel-before-take|
|借贷或 Perps 清算|及时恢复偿付能力|风险优先，再在清算者之间拍卖|
|Meme 初始发行|明确公平分配或竞价分配目标|批量发行、统一清算，或明确的竞价模式|

**因此，不仅不同应用需要不同排序，同一个应用中的不同操作也需要不同排序。**

---

## 2. EVM 上的主要实现：哪些控制整个区块，哪些只控制一次应用执行？

先看全景。

|方案|实际控制的范围|机制与主要边界|
|---|---|---|
|**Sorella / Angstrom L1**|受保护池子的批处理与解锁过程|独立验证网络构建批次，通过 Uniswap v4 hook 控制 swap 入口；不是接管整个 Ethereum 区块。[Angstrom Docs](https://docs.angstrom.xyz/l1/system-overview/architecture)|
|**Angstrom L2**|应用内 MEV 收费与分配|利用链提供的优先费排序，在 hook 中根据 priority fee 收税；官方文档列出 Base、Unichain 部署。[Angstrom Docs](https://docs.angstrom.xyz/l2/intro)|
|**Unichain / Rollup-Boost**|区块构建路径|TEE builder、优先排序、私有交易处理和回滚保护，为应用机制提供底层条件。[Uniswap Labs](https://blog.uniswap.org/rollup-boost-is-live-on-unichain?utm_source=chatgpt.com)|
|**Tempo Payment Lane**|链级容量约束|对非支付交易增加独立 gas 约束；规范本身不要求支付交易 FCFS。[Tempo Docs](https://docs.tempo.xyz/protocol/blockspace/payment-lane-specification?utm_source=chatgpt.com)|
|**Arbitrum Timeboost**|全链交易的时间优先权|在修改后的 FCFS 中拍卖 express lane；获得时间优势，不是获得查看、任意重排其他交易的权利。[Arbitrum docs](https://docs.arbitrum.io/how-arbitrum-works/timeboost/gentle-introduction)|
|**FastLane Atlas**|一笔结算交易内部的操作流程|Auctioneer、solver、bundler 与 `dAppControl` 配合，把多方操作装入同一交易。[docs.atlasevm.com](https://docs.atlasevm.com/atlas/getting-started/protocol-overview/)|
|**Pyth Express Relay**|某些应用操作的执行许可|链下拍卖，链上 permission 检查，典型用途是清算；最终上链仍依赖底层区块构建。[Pyth Network](https://legacy.pyth.network/blog/express-relay-priority-auctions?utm_source=chatgpt.com)|
|**Chainlink SVR**|Oracle 更新产生的 OEV 机会|将预言机更新相关的价值导入拍卖；当前文档列有 Ethereum 的 OFA 路径，以及通过 Atlas 服务其他 EVM 网络的路径。[Chainlink Documentation](https://docs.chain.link/data-feeds/svr-feeds?utm_source=chatgpt.com)|
|**CoW Protocol**|一批用户订单的成交与结算|Solver 竞争、批量结算与外部流动性交互；不决定其他 Ethereum 交易的全局顺序。[CoW Protocol Documentation](https://docs.cow.fi/cow-protocol/reference/contracts/core/settlement?utm_source=chatgpt.com)|
|**PEPC 等协议级承诺方向**|理论上可约束 proposer 的排序行为|属于你给出的文章所讨论的协议级研究路线，不能按“现成的通用应用接口”估算集成工作。[Ethereum Research](https://ethresear.ch/t/application-controlled-execution-a-case-study-on-cancel-prioritization/23977)|

这张表说明了一个重要事实：

> **大多数所谓 ASS 项目，并没有把底层区块的排序权交给应用。它们通过控制应用入口、批次、执行许可或经济激励，让特定顺序成为唯一能成功执行或有利可图的顺序。**

### 2.1 Sorella 最值得研究，但必须区分 L1 和 L2

#### Angstrom L1：用合约入口建立应用自己的执行边界

其主要流程是：

用户订单进入 Angstrom 的独立网络，验证者构建包含套利调整和用户订单的批次，再通过一笔 Ethereum 交易执行。

池子的 swap 入口在每个区块开始时受到限制；授权批次执行之后，池子对该区块剩余时间的普通 swap 解锁。**LP 存入和提取流动性并不受同样的 swap 锁限制。**[Angstrom Docs](https://docs.angstrom.xyz/l1/system-overview/architecture)

因此，它提供的不是：

> “Ethereum 保证所有涉及这个应用的任意交易，都按照应用要求排序。”

而是：

> “应用把关键状态变化放到一个受控制的执行入口，先完成自身批次，再开放后续交互。”

**对 Mantle 的启示：**即便暂时不改 sequencer，也能用合约 gate、签名订单和批量结算做出部分 ASS 能力。但这种方式增加了批次构建方的可用性依赖，也改变了原本任意时刻直接调用的交互模型。

#### Angstrom L2：把链的优先排序变成应用自己的拍卖

L2 版本不依赖上述独立验证网络。其 hook 读取有效优先费：

\[ p=\texttt{tx.gasprice}-\texttt{block.basefee} \]

然后按配置计算：

\[ \text{MEV tax} = k \times 120{,}000 \times \max(p-p_0,0) \]

这里的 `120,000` 是固定计税参数，不是该交易实际消耗的 gas。超过免税阈值的 swap 被收取 tax，随后按配置在 LP、协议和池创建者之间分配。Router 还可以设置 `maxSwapTax` 作为保护。[Angstrom Docs](https://docs.angstrom.xyz/l2/arbitrage-auction)

可以用一个简化场景理解：

某个池子存在套利机会，Bob 和 Carol 竞争先交易。没有应用税时，他们主要通过提高 tip 把价值支付给排序方；加入 MEV tax 后，提高 tip 同时提高支付给应用的税。因此，**竞争排序权的支出，有一部分被导回应用及其流动性提供者。**

这比“DeFi tips 为先”多了一层非常重要的设计：

> **Tips 不仅用于决定谁先执行，还可以成为应用拍卖执行权的出价信号。**

不过，Mantle 不能直接假设现有实现可以原样部署到所有池子。Angstrom L2 当前架构要求池子的 `currency0` 是链的原生资产，以便按 sequencer 计价币种结算 tax；Router 也必须预算这笔原生资产负债。[Angstrom Docs](https://docs.angstrom.xyz/l2/architecture)

Mantle 使用原生 MNT 支付 gas，因此需要分别评估 MNT 相关池与纯稳定币池的适配；不能把“EVM 兼容”理解成任意交易对无修改接入。Mantle 的原生 MNT 设计在其公开技术资料中已有说明。[Mantle](https://mantle.xyz/blog/ecosystem/mantle-v2-tectonic-live?utm_source=chatgpt.com)

### 2.2 MEV tax 的前提，不只是代码里有一个排序函数

这条路线要求的不只是“按 tip 从高到低排列”，还需要：对合格竞争者不选择性排除、不利用或泄露交易内容、不能在看到其他报价后获得额外的最后出价机会。否则排序方可以排除竞争者，再用自己的低 tip 交易绕过大部分税。[Paradigm](https://www.paradigm.xyz/writing/priority-is-all-you-need)

我的结论是：

**Mantle 若采用这条路线，应当把“可信的竞争条件”当作链提供的产品能力，而不是让每个应用自己承担 sequencer 信任风险。**

还有一个直接关系到你“区块空间再分配”的问题：**MEV-tax 应用可能向应用支付很多钱，却只向链支付很低的 tip；区块满时，它们可能被没有应用税的高 tip 交易挤出去。**这一问题在原始研究中已有明确讨论。[Paradigm](https://www.paradigm.xyz/writing/priority-is-all-you-need)

因此：

> **外层容量分配不能只比较给 sequencer 的 tip；内层执行权竞价才适合使用相应市场的 bid 或 tip。**

否则应用把价值返还 LP 越多，反而越难获得区块空间。

### 2.3 Unichain / Rollup-Boost：最接近 Mantle 可参考的工程入口

Rollup-Boost 的实际价值，是把外部 builder 接入 OP 系列区块构建路径。其实现会同时取得外部 builder 区块和本地 fallback 区块，并通过执行客户端验证外部 payload；验证失败时回退。`op-rbuilder` 则提供了具体 builder、Flashblocks 和相关 attestation 集成代码。[GitHub](https://github.com/flashbots/rollup-boost?utm_source=chatgpt.com)

**对 Mantle，这是一条值得做代码级评估的路径：在 builder 中实现分层调度，而不是第一步就重写完整执行环境。**

但要区分：

**一个 payload 能通过 EVM 有效性验证，不代表它遵守了支付 FCFS、撤单优先或公平竞价承诺。** 后者需要额外验证逻辑，或通过应用合约限制违反规则的状态变化。

同样，采用更短的构建窗口后，排序保证应明确作用于哪个窗口：不能把“在当前尚未承诺的窗口中按 tip 排序”，宣传成“后来到达的高 tip 交易可以排到所有已预确认交易之前”。

### 2.4 Atlas、Pyth、SVR：适合作为特定业务的执行权市场

Atlas 的典型过程是：用户签署 operation，auctioneer 发起竞争，solver 返回方案，bundler 将所需操作装入一笔交易；应用通过 `dAppControl` 定义执行规则和 hooks。[docs.atlasevm.com](https://docs.atlasevm.com/atlas/getting-started/protocol-overview/)

Pyth Express Relay 的侧重点是让应用检查某次操作是否得到拍卖许可。Chainlink SVR 则围绕 oracle 更新触发的价值建立拍卖与回收路径。它们更接近**特定操作的执行权分配**，而不是通用多车道区块调度。[Pyth Network](https://legacy.pyth.network/express-relay?utm_source=chatgpt.com)

对 Mantle，可以优先把这类机制用于**清算、再平衡、用户订单 backrun**，但不宜把它当作支付容量或整条链排序问题的替代品。

另外，一个需要更新的行业状态是：**UniswapX 当前官方文档已经把 priority-gas-auction 集成路径标为 deprecated，并说明转向 RFQ 与 exclusive Dutch auction。**它仍是有价值的历史实现案例，但不应作为当前默认选型依据。[Uniswap Developers](https://developers.uniswap.org/docs/liquidity/uniswapx/filling/priority-chain/filling-on-op-stack)

---

## 3. Solana、Cosmos、Move 与专用链：可以借鉴哪些机制？

|生态 / 方案|实现方式|对 Mantle 的价值与边界|
|---|---|---|
|**Solana：BAM Maker Priority Plugin**|专用入口、市场与 signer 注册、报价更新合并、批次内 maker-first|最直接的“操作语义决定优先级”参考；不是所有 Solana slot 自动具备的协议属性。[BAM](https://bam.dev/docs/bam/maker-plugin/how-it-works/)|
|**Solana：Temporal AMQ**|本 slot 排队，下个 slot 由应用按自身规则处理|不修改底层共识也能实现应用排序，但引入异步结算边界。[Temporal](https://temporal.xyz/writing/application-controlled-execution-ace-through-asynchronous-market-queues-amqs)|
|**Hyperliquid HyperCore**|原生撮合与共识理解订单操作类型|适合研究 Perps 的语义排序；不是任意 HyperEVM 合约通用获得的功能。[Hyperliquid](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/order-book)|
|**Cosmos：Skip Block SDK**|应用定义 lanes、匹配规则、容量和 proposal 验证|最贴近整块空间再分配；但仓库已于 2025 年 1 月归档，需自行维护或重实现。[GitHub](https://github.com/skip-mev/block-sdk)|
|**Injective**|原生交易模块与区块结束时的频繁批量拍卖|说明撮合机制可以不依赖逐笔抢先执行；不是给通用 EVM 合约添加比较器。[Injective Docs](https://docs.injective.network/developers-defi/exchange-overview?utm_source=chatgpt.com)|
|**Penumbra**|按交易对批量处理 swap，并按批次分配结果|可参考批量成交与跨区块领取结果的设计；其协议文档将更完整的 sealed-bid 机制列为后续方向。[Penumbra](https://protocol.penumbra.zone/main/dex/swap.html?utm_source=chatgpt.com)|
|**Sui**|共享对象维度的拥堵管理与局部费用市场|适合参考冲突域与资源隔离，但不等同于应用自由定义撤单、吃单优先级。[Sui Documentation](https://docs.sui.io/develop/transaction-payment/local-fee-markets?utm_source=chatgpt.com)|

### 3.1 BAM 的重要进展：已经有具体的 maker-first 插件设计

当前 BAM v0 文档描述的路径非常具体：

做市商通过专门的 PTPU 入口提交报价更新；节点按静态注册配置验证 signer、program、market 等信息；同一市场每轮只保留最高序号的更新；每轮先调度这些更新，再处理普通交易与 bundles。文档中的轮次约为 50ms，**第二阶段不能通过更高 tip 越过第一阶段**。注册目前由节点运营方配置，不是任意交易自行声明 maker 身份。[BAM](https://bam.dev/docs/bam/maker-plugin/how-it-works/)

BAM 已有 mainnet 接入与验证者客户端文档，但不能据此推导该插件已经覆盖整个 Solana 网络。[BAM Community Forum](https://forum.bam.dev/t/bam-early-mainnet-is-live/49?utm_source=chatgpt.com)

它对 Mantle 最有价值的地方，不是 50ms 这个数字，而是：

> **把报价维护从普通竞价流量中分离，并只允许经过严格验证、资源有界的操作获得语义优先权。**

这也更新了你提供的讨论中的一个背景：该回复提到，部分 Prop AMM 通过低 CU、低成本的 oracle 更新在 Jito 竞价中获得类似 cancel priority 的效果；那是一种经济上的优势，而不是不可被高价越过的结构性优先规则。[Ethereum Research](https://ethresear.ch/t/application-controlled-execution-a-case-study-on-cancel-prioritization/23977/3)

### 3.2 AMQ：最容易低层改动落地，但不能忽略异步代价

AMQ 的核心是把“提交意图”和“应用执行”分开：在一个 slot 中收集操作，在下一个 slot 中由应用处理。这样排序规则能够进入应用程序本身，而不要求底层 proposer 理解所有业务。[Temporal](https://temporal.xyz/writing/application-controlled-execution-ace-through-asynchronous-market-queues-amqs)

对于 Mantle，我认为它适合用于**接受批次语义的 Launchpad 或订单市场**，却不适合作为所有现有 DeFi 的透明替代层。

例如，“借入闪电贷 → 在池子交易 → 归还贷款”不能未经改造就跨越到下一轮完成。问题不是完全不能组合，而是**组合发生的边界已经改变**。

### 3.3 HyperCore：Perps 不应该把所有交易送进同一 tips 排序器

HyperCore 的当前文档区分了两件事：

订单簿撮合遵循价格—时间优先；进入订单簿之前，交易操作又在每个 consensus batch 中按类别排序：不向任何订单簿发送 GTC/IOC 的操作、撤单、包含 GTC/IOC 的操作。同类内部沿用 proposer 提议顺序。这个规则作用于 batch，不应简化为“所有区块中的撤单永远优先”。[Hyperliquid](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/order-book)

这对 Mantle 的 Perps 设计非常重要：

**撮合优先级和交易进入撮合引擎之前的调度优先级，是两套规则。**

提高 tip 可以用来竞争某些执行机会，但不应默认允许 taker 买到绕过报价维护、撤单和风险约束的权利。

### 3.4 共享 sequencing 和 appchain 是另一条路线，但不是同一问题

Espresso 当前架构强调为各自有执行环境和 sequencer 的 rollup 提供最终性；Astria 的共享 sequencer 也不负责解释任意应用的 EVM 业务语义。[docs.espressosys.com](https://docs.espressosys.com/network/learn/rollup-architecture?utm_source=chatgpt.com)

因此，**接入共享 sequencer，并不会自动让 Mantle 内的多个应用获得不同排序策略。**

独立 appchain 可以获得最大的规则自由度，但资产、状态和组合边界也随之改变。针对你当前希望保留统一 DeFi 环境的方向，我会先研究共享状态内的调度，而不是把每个产品都拆出去。

---

## 4. 必须提前接受的三条边界

### 4.1 不能同时保证任意应用排序规则和任意跨应用原子组合

考虑两个市场 A、B 都要求“撤单先于成交”：

```
交易 X：撤销 A 的报价，然后在 B 成交
交易 Y：撤销 B 的报价，然后在 A 成交
```

对 A 而言，必须 X 在 Y 前；对 B 而言，必须 Y 在 X 前。两笔交易又各自要求原子执行，就不存在同时满足两套规则的顺序。这正是你提供的 ACE 研究重点讨论的冲突类型。[Ethereum Research](https://ethresear.ch/t/application-controlled-execution-a-case-study-on-cancel-prioritization/23977)

因此，Mantle 必须明确支持的组合范围。我的建议是：

**支持规则兼容的原子组合；遇到循环依赖时拒绝或延后其中一个组合；不能偷偷拆开用户的原子交易，也不能把它移到普通 lane 后绕过应用保护。**

### 4.2 正确执行排序，不等于没有审查交易

即使能证明“所有进入区块的撤单都排在吃单前”，排序方仍可能不接收某些撤单。

所以要区分：

**已承诺候选集合内的排序正确性**，与**交易是否得到公平接收和纳入**。

对于 Mantle，接收回执、候选集合承诺、明确的截止时间和可追责遗漏，应该与排序器一起设计。否则“可验证排序”很容易只验证了一个被事先挑选过的集合。

### 4.3 容量隔离，不自动带来价格隔离

支付即使有专用空间，如果仍支付由全链拥堵推动的统一 base fee，也可能在 Meme 热潮中变贵。

因此，你此前关心的“避免 Meme 火热导致其他业务 basefee 共同上涨”，需要拆成两项：

**容量隔离解决能否及时执行；费用隔离或补贴解决支付多少钱。**

前者可以先做；后者涉及更深的费用机制、资源计价或 sponsor 预算设计。不能把一个 lane 功能同时宣传成两者都已解决。

---

## 5. 我建议的 Mantle 架构：分层调度，而不是每个应用一个独立 sequencer

以下是设计建议。

### 5.1 总体结构

Mantle 保留统一状态和最终交易序列，但区块构建过程变成：

**交易接入与资格验证 → 容量准入 → 应用/市场分类 → 市场内排序 → 跨市场依赖处理 → EVM 执行与规则检查。**

这里最重要的设计单位，不应该只是 `app_id`，而应该包括：

> **应用、市场或冲突域、操作类型、策略版本。**

同一个 Perps 应用的不同市场不一定需要互相排队；同一个 Router 可能跨越多个市场；两个不同应用却可能争用相同池子或抵押品状态。

### 5.2 外层：带保留容量和闲置借用的资源调度器

我建议初始支持以下几类资源池：

|资源池|主要用途|初始调度目标|
|---|---|---|
|**Payment**|合格的支付操作|接收顺序、公平服务、拥堵时的容量保障|
|**Market maintenance**|报价维护、撤单和受约束的风险操作|防止被交易竞价流量挤出|
|**DeFi execution**|Swap、套利、订单执行|市场内竞价或规定的成交机制|
|**Launch**|发行参与、批次结算、毕业迁移|限制单次热点对其他业务的冲击|
|**General**|未接入特殊策略的普通 EVM 交易|保持开放兼容性|

为了说明机制，可以在扣除协议强制事务之后，把一个调度周期的用户交易预算抽象成 100 单位：

|资源池|示例保留预算|
|---|---|
|Payment|15|
|Market maintenance|15|
|DeFi execution|30|
|Launch|10|
|General|30|

**这只是仿真的起始配置，不是建议上线的比例，也不是对 Mantle 现网容量的测量。**

关键规则比比例更重要：

**保留容量按合格需求启用；没有需求的部分允许借用；借用不能撤销已经发出的执行承诺；每个市场和发送方还需要限额，防止一个应用吃完整个类别。**

物理区块也不必被切成五个连续区域。可以在遵守市场依赖的前提下交错调度，避免“支付有配额，却每轮都要等一个很长的 DeFi 批次结束”。

最贴近这一思路的参考，是 Tempo 的容量约束与 Skip Block SDK 的 lanes 架构。但 Skip 的 Cosmos 实现不能直接移植为 Mantle 客户端功能，而且其仓库已经停止维护。[Tempo Docs](https://docs.tempo.xyz/protocol/blockspace/payment-lane-specification?utm_source=chatgpt.com)

### 5.3 内层：提供有限的策略模板，不开放任意排序程序

第一版我建议只提供四类模板：

|模板|规则|适用对象|
|---|---|---|
|**Eligible-FCFS**|对当前可执行、已获准进入的操作按回执顺序服务|支付|
|**Priority Auction**|在同一候选窗口与市场内按有效出价竞争|套利、部分 solver 竞争|
|**Phase-first**|先执行规定类别，再执行后续类别|Maker 更新、撤单、吃单|
|**Batch Clearing**|收集一批意图后按应用规则统一结算|Launchpad、部分现货或订单市场|

我不建议第一版支持“应用上传任意 Solidity/WASM 排序函数”。

原因是这会同时扩大执行成本、状态依赖、DoS、策略升级和验证复杂度。先用有限、可审计的模板验证产品价值，再讨论通用化。

### 5.4 接入特殊 lane，不能由用户自行打标签

否则攻击者可以把复杂套利包装成“支付”，或者把任意调用包装成“撤单”，占用低成本保留空间。

Tempo 的后续支付分类规则很有参考价值：T5 的 TIP-1045 不再仅依赖地址前缀，而是要求每个调用符合目标、selector、ABI 形状等白名单约束，同时限制辅助载荷。[GitHub](https://github.com/tempoxyz/tempo/blob/main/tips/tip-1045.md?utm_source=chatgpt.com)

Mantle 的初始策略注册应包括：

**允许的入口与实现版本、允许的操作类型、市场标识、授权 signer、资源上限，以及失败时的处理方式。**

普通 Router、任意 multicall 或 AA bundle 不能因为最外层调用看起来像支付，就自动享受支付 lane。

对受保护市场，还要防止直接调用绕过规则：关键状态变化必须经过可以检查策略的入口。否则“官方入口里的撤单优先”，挡不住从其他入口直接触发的成交。

### 5.5 FCFS 要与 nonce 和 Native AA 一起设计

假设 Alice 的两笔操作分别是：

```
nonce 100：一笔尚未完成前置条件的普通调用
nonce 101：一笔支付
```

不能为了支付 FCFS 就跳过账户的有效性约束；但也不应让 Alice 阻塞整条支付队列。

所以建议采用 **“当前 eligible 的交易头部之间 FCFS”**，并为独立业务使用适当的 nonce 域。ERC-4337 已有 keyed nonce 机制，说明把账户操作分成独立序列是可实现的设计方向。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-4337?utm_source=chatgpt.com)

这与你此前关注的 native AA、2D nonce 和 session keys 有直接联系：**它们可以帮助不同业务独立进入调度，不应仅被包装成钱包体验功能。**

但 AA 不会消除跨市场状态冲突。

另一个细节是：多个 UserOperation 可以进入同一外层交易；这时 hook 看到的 `tx.gasprice` 不是每个用户独立的出价。因此，AA 批处理与 MEV-tax 拍卖需要专门的出价/结算约定，或约束打包方式，不能直接混用。[Ethereum Improvement Proposals](https://ercs.ethereum.org/ERCS/erc-4337?utm_source=chatgpt.com)

---

## 6. 结合 Mantle 产品：分别应该怎么排序？

### 6.1 Payment：FCFS + 容量保障，而不是“低价无限优先”

建议规则是：

**资格验证通过、费用或 sponsor 预算满足条件、资源准入成功后，签发接收回执；同类 eligible 支付不接受 tip 插队。**

回执最好区分“已收到”和“已承诺调度”，后者至少绑定交易哈希、接收序号、策略版本、适用窗口与执行期限。

需要明确，承诺的是满足条件时的 **L2 纳入/执行尝试**，不是无条件保证业务成功，也不是把 L1 最终性缩短到相同时间。

为了抗垃圾交易，免费支付可以是用户不付费，但不能是系统没有资源成本。Sponsor 预算、发送方配额和超限策略仍然需要存在。

### 6.2 Meme Launchpad：先决定是公平发行，还是公开竞价

我不建议为所有 Meme 发行强行选择同一种排序。

#### 公平发行模式

可以采用短窗口收集意图，在窗口关闭后按公开规则分配；供不应求时使用明确的比例分配或其他机制。

这里必须注意：**把现有逐笔 bonding curve 改成批量统一成交，不只是换个排序器，而是修改发行经济规则。** 价格形成、超额资金退还、窗口内撤销和毕业阈值都需要重新定义。

随机排序也不是天然“按人公平”。一个主体拆成大量账户仍可能增加机会，需要另行决定反女巫与额度政策。

Mantle 在 2024 年已经公开研究过 VRF 随机化排序，但那是研究方案，不能据此认定现网已提供这一能力。它更适合作为 Launch lane 的候选机制，而不是全链统一随机化。[Mantle](https://www.mantle.xyz/blog/research/fair-sequencing?utm_source=chatgpt.com)

#### 竞价发行模式

允许用户或 agents 公开竞争更早的执行权，但必须清楚标示这是竞价市场，而不是公平分配。

部分竞价收入可以归发行协议或参与者福利预算；具体分配需要另外评估，不能默认全部归 sequencer。

#### 毕业迁移应是单独的市场阶段

建议使用明确的状态机：

**关闭发行批次 → 确定最终状态 → 完成迁移与池初始化 → 开放二级市场。**

这样可以减少“发行规则、迁移规则、二级市场规则同时生效”的模糊窗口。若迁移不能在一笔交易中完成，就需要有界的过渡状态和失败恢复，不能让普通交易绕过迁移保护。

### 6.3 Perps：风险与报价维护优先，不能只做高 tip 优先

对你最终希望建设的 fully onchain Perps，我建议将每个市场的短周期执行过程设计为：

**确定该轮有效 oracle 版本；处理规定的风险与报价维护操作；再处理普通订单进入与撮合。**

但这里不能偷懒地写成“所有撤单和所有资金操作都优先”。

撤销报价与提取保证金完全不同：后者可能削弱偿付能力。清算、撤单、补充保证金、减仓、开仓的相对顺序，必须由具体风控与撮合模型定义。

我建议至少把以下两件事分开：

**做市保护：**允许合格的报价更新、撤单在同窗口吃单之前执行。

**偿付能力保护：**在新 oracle 状态下，优先处理必要的风险状态变化，限制增加风险的操作。

同时，maker priority 必须有公开截止时间。不能允许做市商看完已经冻结的 taker 订单后，再拥有专属的补报撤单机会；已经成交的订单也不能被晚到撤单追溯撤销。

这种规则的效果需要用数据判断：它可能减少做市商被陈旧报价套利的损失，但也可能降低 taker 成交确定性。最终应看点差、深度、成交率、尾部风险，而不只是“撤单成功率提高”。

对于你此前讨论的几种 Perps 形态，我会这样处理：

|Perps 形态|ASS 的重点|
|---|---|
|**Vault 型初版**|Oracle 使用规则、请求/执行阶段、清算和 keeper 可用性|
|**通用 EVM 上的 fully onchain Perps**|严格入口、操作分类、nonce、短周期排序与合约风控|
|**Mantle 验证边界内的专用模块**|原生识别订单语义，执行更完整的风险与撮合调度|
|**独立 L3 / appchain**|可自主设计全套排序，但需重新处理资产与跨域组合边界|

因此，ASS 能力最好以最终 fully onchain 需求为目标设计，而不是只为当前 keeper 调用加一个高优先级标签。

### 6.4 DeFi 与 Router：区分用户价格优化和套利权竞争

普通用户兑换的目标应是**最终成交质量**，不是让用户加入 tip 军备竞赛。

我建议 Router 支持两种互补路径：

**同步组合路径**保留现有 AMM、多跳和拆单能力；**受保护订单路径**允许 intent、批量结算或应用拍卖。

对于套利者，可以在特定市场使用 priority auction + MEV tax。但多跳交易穿过多个收费应用时，需要把各处 tax 都纳入报价和路径选择：

\[ \text{用户实际成本} = \text{价格影响} + \text{交易费} + \text{资源费} + \text{相关执行权费用} \]

这意味着，你此前希望优化的 Router 应与 ASS 同步设计。

**仅比较池子的表面报价，却不理解排序策略、批次边界和应用税，可能选出名义最优、实际更差的路径。**

---

## 7. 用一个完整场景看：这些规则如何进入同一个 Mantle 区块？

以下是设计示例，不是现网行为。

同一个调度窗口收到：

|操作|内容|
|---|---|
|P1、P2|两笔合格支付，P1 先被接收|
|Q1、Q2|同一做市商对同一市场连续提交的可替换报价更新|
|C1|撤销某笔尚未成交的报价|
|T1|想吃掉该市场流动性的订单，附带很高 tip|
|A1、A2|同一 AMM 套利机会的竞争交易|
|L1…Ln|Meme 发行参与意图|

**第一步：资格验证。**  
P1、P2 必须确实符合支付调用约束；Q1、Q2 必须来自该市场授权 signer；T1 不能通过伪装成撤单获得维护优先级。

**第二步：容量准入。**  
支付使用其预算，市场维护使用维护预算，Launch 使用自己的预算。高 tip 的 T1 不能仅靠出价挤掉全部支付和撤单。

**第三步：分别处理局部顺序。**  
P1 在 P2 前。对明确支持“新版本替代旧版本”的报价消息，只调度 Q2；这不能推广为任意交易都可以跳过 nonce。C1 与报价维护按市场规则先于同窗口 T1。A1、A2 在自身拍卖窗口竞争，适用的应用税正常结算。

**第四步：Launch 执行自己的成交规则。**  
若这是批量发行，L1…Ln 不因某个参与者 tip 更高就自动获得更便宜的发行价；最终分配由发行规则决定。

**第五步：组合和有效性检查。**  
若某个操作同时涉及多个受保护市场，就检查其依赖是否兼容；不兼容则拒绝或延后，而不是绕过其中一个市场的规则。

最后形成的仍是一个 Mantle 交易序列。区别在于：

> **它不是一个全局出价列表，而是满足资源预算、市场阶段和原子依赖约束之后生成的序列。**

这才是我理解的“对完整区块空间的再次分配”。

---

## 8. 如何落地：先做可约束的功能，再增加验证强度

### 8.1 工程上分成三个层级

|层级|可实现的内容|不能混淆的保证|
|---|---|---|
|**应用合约层**|批次结算、permission gate、MEV tax、阶段状态机|能阻止某些违规状态变化，不一定能阻止 sequencer 拒绝接收交易|
|**Sequencer / builder 层**|多 lane、保留容量、时间窗口、语义优先、回执|初期主要是运营方承诺，普通 EVM 有效性不自动证明遵守规则|
|**协议验证层**|对确定性分类、资源约束、承诺集合和排序谓词进行验证|需要明确可验证输入；仍不能证明所有未被接收的网络请求|

这里尤其要区分两种效果：

**合约拒绝违规调用**，可能意味着违规交易回滚，但所在区块仍然有效。

**协议把违规排序视为无效区块**，才是另一种更强的约束。

同理，无论 Mantle 当前或未来采用哪种执行证明，**证明 EVM 执行正确，不会自动证明输入集合完整或接收顺序公平**。要实现后者，必须把相应承诺和检查纳入设计。

### 8.2 第一阶段：回放与影子调度

建议先用实际工作负载比较几种基线：

全局 FCFS、全局 priority ordering，以及“外层容量分配 + 内层策略”的组合。

不要只测平均 TPS。关键指标应包括：

|维度|应观察的结果|
|---|---|
|支付|拥堵时的 P95/P99 纳入延迟、费用和拒绝率|
|Perps|撤单与更新成功率、点差、深度、成交率、坏账风险|
|AMM|LP 成交后的价格偏移、套利收益与税收分配、用户总成本|
|Launch|分配集中度、垃圾交易压力、毕业阶段失败与异常执行|
|链本身|Builder 耗时、执行与证明开销、DA 压力、fallback 频率|
|组合性|跨市场交易的拒绝率、延后率和可替代路径|

这里需要特别加入 adversarial workload：大量伪装支付、撤单洪泛、过时报价、nonce 阻塞、oracle 突变、跨市场循环依赖，以及竞价失败但占用大量模拟资源的交易。

### 8.3 第二阶段：受限应用试点

我建议首批范围是：

**一个支付入口、一个 Perps 市场、一个 Launchpad 市场，以及一个 MEV-tax 或显式拍卖池。**

这个阶段不追求任意第三方随时注册任意策略。目标是验证：哪些策略确实改善产品，哪些只是把收益从一类参与者转给另一类参与者。

策略注册与资源配额也应分离：获得某个策略模板的使用资格，不等于自动获得无限免费容量。

### 8.4 第三阶段：增加可验证性，并规定安全降级

在功能有效之后，再加入更强的接收回执、公开承诺、TEE 或协议验证。

但 fallback 必须从第一天就设计。

如果自定义 builder 失败，不能简单切回普通 tips 排序，继续执行此前承诺受保护的交易。安全降级可以是继续使用兼容策略，或暂停相关受保护操作并保留经风控允许的退出路径；**不能为了保持出块，把应用的安全假设静默取消。**

对 Mantle 的代码评估，我会优先检查 Rollup-Boost / `op-rbuilder` 式接入方式，但必须与 Mantle 实际客户端分支、原生资产语义、DA 和证明路径逐项比对，不能仅凭 OP 技术来源就承诺即插即用。[GitHub](https://github.com/flashbots/rollup-boost?utm_source=chatgpt.com)

---

## 最终建议

我建议把 Mantle 的这项能力定义为：

> **Application-aware Blockspace：应用感知的区块空间。**  
> 链提供资源保障和可信调度，市场选择受约束的执行策略，应用决定成交与价值分配。

最值得组合借鉴的是：

|设计问题|首要参考|
|---|---|
|如何防止一种业务挤占其他业务|**Tempo Payment Lane**|
|如何组织整块空间的多策略调度|**Skip Block SDK 的架构思想**，而非直接采用已归档实现|
|如何保护做市与 Perps 操作|**BAM Maker Plugin + HyperCore**|
|如何让排序竞争收益回到应用|**Angstrom L2 / MEV tax**|
|如何先做特定操作的执行权拍卖|**Atlas、Pyth Express Relay、Chainlink SVR**|
|如何接入 EVM builder 工程路径|**Rollup-Boost / op-rbuilder**|

**不建议的第一步，是给每个应用一个独立 sequencer，或给整个 DeFi 区域统一套上最高 tip 优先。**

**建议的第一步，是在统一 EVM 状态上做一个有限策略、可审计、带容量保障的分层调度器。** 对 Payment 保护可预测性，对 Launchpad 明确分配公平性，对 Perps 保护风险控制与报价维护，对 DeFi 把执行权竞争转化为更好的成交和流动性经济性。
# notes-other：其他生态的应用排序机制（前缀 X）

访问日期：所有网页均为 2026-10-11。源码引用格式 `仓库/路径:行号@commit`，本地固定版本见 /tmp/ass-src。
本路只讲机制与对 Mantle 的可借鉴点。

---

## X-Q1 Solana BAM 与 Maker Priority Plugin（MPP）

**答案**：BAM 是 Jito 的链下排序层：TEE 里的 BAM Node 接收交易与 bundle，按规则排好序，以“原子批次”流式发给已接入的 leader validator；validator 按合约（不是共识规则）“严格按收到的顺序执行”。MPP 是 BAM Node 上的插件：做市商把报价更新以 UDP 发到单独的 Plugin TPU（PTPU）；节点运营方用静态配置登记 signer / program / market；同一市场每轮只保留最高 seqno 的那一笔；每轮约 50 ms，第一阶段先排这些更新，第二阶段才让 bundle 和普通交易按优先分竞争。文档明确说多付 tip 也排不到第一阶段前面。强制力来自 BAM Node（TEE）和 Jito 对 validator 的断连威胁，不来自 Solana 共识；BAM 目前约覆盖 37.7% 的 stake，MPP 只在部分区域的 BAM 节点上提供。

**依据**
- 架构：BAM Node 接收 Bundles/Transactions、cluster 状态和 leader 状态，负责验证、排序，再把交易发给 leader 上的 BAM Validator；“A BAM Node can serve multiple BAM Validators”，一个 validator 同一时间只连一个 BAM Node [5]。Validator 的义务是 “Execute all received transactions in that exact order”；违约后果是 “the BAM Node reserves the right to temporarily or permanently disconnect the BAM Validator” [5]。也就是说，违约代价只是被断连，块本身仍然有效。
- TEE：bam.dev 首页写明节点运营方 “Operate BAM's secure hardware layer using Trusted Execution Environments (TEEs)”，插件 “connect directly to BAM's scheduler” [6]；explorer API 返回的 `bam_node_connection` 名称几乎都带 `-tee` 后缀（386 个里有 385 个，例如 `iad-mainnet-bam-2-tee`）[8]。
- 协议层（bam-protos）：validator 与 node 之间是一条双向 gRPC 流 `InitSchedulerStream`。validator 上报 `LeaderState{slot, tick, slot_cu_budget_remaining}` 和执行结果；node 下发 `MultipleAtomicTxnBatch`，其中每个 `AtomicTxnBatch` 带 `seq_id`、`max_schedule_slot` 和 packets，含义是 “must be processed together” [9]。
- MPP 机制 [2]：
  - PTPU 是 “a separate UDP endpoint that accepts pre-signed market maker price update transactions”。
  - 校验规则：只能有一个 signer；signer 必须已登记；交易必须写入已登记的 market account；只允许已登记 program + Compute Budget + System 三种 program；CU price 不低于运营方设的下限；指令数据的指定偏移处必须有 8 字节 LE u64 seqno。不满足条件的包会被静默丢弃。
  - 合并：“only the highest-sequence-number update per market per auction round reaches the validator”。
  - 调度：“Every auction round (~50 ms)… Phase 1 drains all maker priority plugin transactions received during the previously scheduled round… This ordering is structural and cannot be changed by paying higher fees or tips. Within Phase 2, bundles and regular transactions compete on the same priority score”。
  - “No Jito tip required”：MPP 交易只付普通的 CU 费。
  - “Static enrollment. There is no runtime registration API”，登记信息由运营方配置在每个 BAM node 上。
- 登记字段：signing pubkey（最多 32 个）、program ID、market account（最多 64 个）、seqno offset、seqno 长度（固定 8）、可选的 account filter；发送方式是 UDP 原始 datagram，默认端口 5012；370 ms 内重复发送的包会被去重；建议用 Unix 微秒时间戳做 seqno [3]。
- FAQ：“Can I pay more to go before a maker transaction? No.”；“At launch, the maker priority plugin will be available on BAM leaders connected to BAM nodes in select regions.”；同一笔交易若也发到了普通 TPU，进入 Phase 1 后普通 TPU 那份会被丢弃；MPP 不接受 bundle [4]。
- 主网：forum.bam.dev 帖子 “BAM Early Mainnet is Live!” 发于 2025-09-30，当时 BAM Node 部署在 Amsterdam、Frankfurt、NYC，validator 客户端开源在 jito-labs/bam-client [7]。2026-10-11 调 `explorer.bam.dev/api/v1/validators`：386 个 validator，stake 合计 165,132,970 SOL，`stake_percentage` 合计 37.66% [8]。
- mpp-sender 示例：每 50 ms 签一笔交易，用 UDP 发给当前 BAM leader（在 leader schedule 里向前看 8 个 slot；IP 取自 `getClusterNodes`，端口换成该区域配置的 MPP 端口）。示例交易设 CU price 20,000,000 micro-lamports、CU limit 500，不带 Jito tip [10]。

**不确定之处**
- PTPU 的物理位置：文档说它是 BAM 的独立端点，但 mpp-sender 发往的是 leader validator 在 gossip 里公布的 IP（只换了端口）[10]。所以 PTPU 可能由 validator 侧的 BAM client 接收后再转给 BAM Node，也可能是端口转发。没有找到说明。
- 时延：Phase 1 排的是“上一轮收到的”更新 [2]。由此推出，一笔更新从到达到执行最多晚约 2 轮（约 50–100 ms）；这是推论，没有实测。
- MPP 覆盖率：37.66% 是整个 BAM 的 stake 占比，MPP 只在 “select regions” 提供 [4]，实际覆盖率更低，没有公开数字。
- 示例与文档不一致：mpp-sender 把 seqno 编码成一个只读的“合成账户” pubkey（`sequence_account`），没有写进指令数据偏移 [10]；而文档的 canonical 格式要求 seqno 在指令数据里 [3]。README 说这个合成账户 “only makes example transaction signatures distinct”，所以示例针对的是 PTPU 测试程序，不代表正式登记格式。
- “~50 ms” 是文档写的约数 [2]，示例里的 50 ms 发送间隔与之一致 [10]，但没有找到可配置参数或实测值。

---

## X-Q2 Temporal AMQ（Asynchronous Market Queues）

**答案**：AMQ 完全用 Solana 程序实现，协议不用改：程序把 cancel / limit 等“异步指令”连同 slot 和序号放进自己状态里的优先队列；过了可配置的延迟（例如 slot+1）后，由一笔单独的 crank 交易按应用定义的优先级（cancel 高于 limit）批量执行。代价是失去原子性，同块组合也随之失去：结果最早下一个 slot 才能用。作者自己承认，validator 仍可以在协议 tick 边界内靠审查和拖延绕过 AMQ。

**依据**
- 原文：Temporal，“Application Controlled Execution (ACE) through Asynchronous Market Queues (AMQs)”，作者 Cavey & Jakob Povšič，2025-09-22 [11]。ACE 帖写作 “Cavey, Jakob, and Max” [1]。
- 机制：指令分为同步指令（开户、存取款）和异步指令（cancel、limit order）。异步指令到达时按类型分配优先级，打上当前 slot 和序号后入队；“a separate instruction processes the queue, but only after a configurable delay (e.g. slot + 1, or when the queue is full)”。示例中 cancel 的优先级是 1，limit 是 0。limit 入队时会锁定存款，防止同步取款 [11]。
- 队列规模：“16384 actions is easily possible”，并且 “at least … 512 actions to defend against transaction bundles which attempt to fill the queue and begin cranking” [11]。
- 两种 ACE：一种是协议层合并各程序给出的优先级，即“weaker form”，保留原子性，但不同程序的优先级可能互相冲突；另一种在程序内实现，即“stronger form”，“breaks the atomicity of execution (and, to some extent, the composability of programs)” [11]。
- 审查：“similar to all other forms of ACE that do not involve multiple proposers, AMQs can still be bypassed by a validator within protocol enforced tick boundaries through censorship and delay”；缓解办法是缩短 slot、加快 leader 轮换、引入多个并发 leader [11]。ACE 帖原样引用了这段话 [1] §2.2。
- ACE 帖的总结：至少一个 slot 的延迟；“Next-block settlement”，同块的闪电贷无法用到 batch 的结果；改进需要协议支持 scheduled transactions，或者让合约能感知交易在块中的位置 [1] §2.2。
- 参考实现：github.com/cavemanloverboy/ace（文中称为 “simple counter program”）[11]。

**不确定之处**
- ACE 帖链接的 `temporal.xyz/writings/...` 在 2026-10-11 返回 404，现行 URL 是 `/writing/...`（单数）。外部调研用的正好是现行 URL。
- 原文称 AMQ “does not necessarily add any additional latency to the finalization of state”，理由是 ACE 窗口结束时最终状态已经确定 [11]；ACE 帖则强调结果到 N+1 才能被其他交易使用 [1]。这两种说法并不矛盾，一个讲状态何时确定，一个讲结果何时可组合，写报告时要分开说。
- 没有找到 AMQ 在主网上的生产部署；参考实现只是示例，仓库未审阅。

---

## X-Q3 Solana Prop AMM 的“经济型 cancel priority”

**答案**：出处是 Helius 博客 “Solana's Proprietary AMM Revolution”（作者 Lostin，2025-08-25）。Prop AMM（例如 HumidiFi）把 oracle / 报价更新压到约 143 CU。按该文的说法，Jito 拍卖按 tip / CU 排序，所以这笔更新只需付很小的 tip（HumidiFi 为 4,998 lamports），就能排到约 150k CU 的 taker swap 前面。这只是成本上的优势：taker 只要愿意付更高的单位 CU tip，或者 leader / searcher 不这样排，这个顺序就不成立。协议、BAM Phase 1 这类结构性规则都不保证它。

**依据**
- ACE 帖第 3 楼（mikeneuder，2026-02-02）引用了这篇文章，并说 Prop AMM “don't explicitly have cancel prioritization (or taker speed bumps), but they do have cheap and fast oracle updates”；链接为 helius.dev/blog/solanas-proprietary-amm-revolution [1] post #3。
- Helius 原文：HumidiFi 的 oracle 更新耗 143 CU，一笔约 9,998 lamports（$0.001784）；经 Prop AMM 路由的典型 Jupiter swap 约 150,000 CU；“the Jito auction engine … prioritizes transactions by tip per CU”，更新 “only need modest tips (in HumidFi's case, 4,998 lamports) to rise to the top of the auction queue”；Phoenix 上挂单 / 改单要 100k–300k CU；另外还可以拒绝 CU 低于 100,000 的 taker 交易，作为附加防护 [12]。
- “不是结构性规则”是推论：Helius 原文说的是 tip / CU 的竞价 [12]，这意味着任何 taker 只要把单位 CU 出价提高到更新之上，就能排在前面；BAM MPP 文档则专门强调 Phase 1 “cannot be changed by paying higher fees or tips” [2]。两者正好构成对照。

**不确定之处**
- “Jito 拍卖按 tip/CU 排序”目前只有 Helius 这一个二手来源 [12]，没有追到 Jito block engine 的一手文档。BAM 接入后，第二阶段改为按 “same priority score” 排序 [2]，评分公式未公开。
- 这一机制要在“更新 + taker 落在同一 leader、同一拍卖窗口”时才成立；跨 leader 或走非 Jito 路径时的效果无法证实。

---

## X-Q4 Hyperliquid：cancel / post-only 优先

**答案**：HyperCore 在每个 consensus batch 内把动作分成三类排序：(1) 不向任何订单簿发送 GTC / IOC 的动作，包括 ALO / post-only 和非下单动作；(2) cancel；(3) 至少含一笔 GTC / IOC 的动作。同一类内部保持 proposer 的提议顺序。Hyperliquid 称这是 L1 执行规则，“The only correct way for a node to execute a block … is to sort cancels and post-only orders first”，所以强制力在共识 / 执行层。这一规则只作用于 HyperCore 订单簿动作。HyperEVM 合约发出的下单 / 撤单要经 CoreWriter，还会被链上刻意延迟几秒，所以 HyperEVM 合约享受不到同批 cancel 优先。

**依据**
- Medium 原文 “Latency and transaction ordering on Hyperliquid”（2024-01-06，源自 Jeff 的推文）：“Cancels and post-only orders are prioritized above GTC and IOC orders. This ordering is enforced onchain by the L1 itself. The only correct way for a node to execute a block on the Hyperliquid L1 is to sort cancels and post-only orders first.”；文中称 HFT maker 与 HFT taker 之间的成交率比其他平台 “at least 10x lower” [13]。medium.com 直连返回 403，原文从 `hyperliquid.medium.com/feed` 的 RSS 全文取得。
- 现行文档（Order book）：“the mempool and consensus logic are semantically aware of transactions that interact with HyperCore order books. Within a block, actions are sorted within each consensus batch (there are usually 1-2 consensus batches of actions in a block) as 1. Actions that do not send GTC or IOC orders to any book 2. Cancels 3. Actions that send at least one GTC or IOC. Within each category, actions are sorted in the order they were proposed by the block proposer. Modifies are categorized according to the new order they place.”；订单簿撮合仍按 price-time priority [14]。
- HyperEVM：CoreWriter 系统合约地址为 `0x3333…3333`，调用时 burn 约 25,000 gas（基本调用约 47,000）；“To prevent any potential latency advantages for using HyperEVM to bypass the L1 mempool, order actions and vault transfers sent from CoreWriter are delayed onchain for a few seconds”；这类动作在浏览器里出现两次，先入队，后执行 [15]。在每个产出 EVM 块的 L1 块中，顺序是 L1 块 → EVM 块 → EVM→Core 转账 → CoreWriter 动作 [16]。HyperEVM 采用双块结构：小块 1 s / 3M gas，大块 1 min / 30M gas [16]。
- ACE 帖把 Hyperliquid 列为 app-chain 型 ACE。它的说法是共识在 “Verify Block” 阶段检查 cancel 是否先于 take；缺点是 proposer 可以直接不打包 cancel，即审查，而且结果只能“通过桥”结算 [1] §2.1。

**不确定之处**
- 新旧表述有差别：2024 年的博客说 “cancels and post-only first”；现行文档把 post-only（落入类别 1，“不发 GTC/IOC”）排在 cancel（类别 2）之前，而且类别 1 还包括所有非下单动作。报告应以现行文档为准。
- “HyperEVM 合约不享有这一规则”是推论：文档只给 HyperCore 订单簿动作描述了分类排序 [14]，CoreWriter 动作在 EVM 块之后处理并带延迟 [15][16]。没有找到文档写明 “EVM 交易不按此分类”。
- HyperCore 节点代码闭源，无法从代码核实。

---

## X-Q5 Cosmos Skip Block SDK：lanes

**答案**：Block SDK 把区块切成有序的 lane 链。每个 lane 提供 `Match`（这笔交易是否属于本 lane）、`Compare` / `Priority`（lane 内的优先序）、`PrepareLane`（proposer 按顺序从本 lane 取交易填块，上限是 `MaxBlockSpace` 比例乘以块的字节 / gas）和 `ProcessLane`（验证者校验本 lane 的交易在提案里连续、排在后续 lane 之前、按 `Compare` 有序、不超容量）。lane 顺序就是块内顺序，典型配置是 MEV lane → free lane → default lane。但要注意：作者推荐的 `NewDefaultProposalHandler` 让 ProcessProposal 什么都不做（NoOp）。只有集成方用 `abci.New(..., true)` 打开自定义 ProcessProposal，lane 规则才会成为验证者拒绝提案的有效性规则；否则只是 proposer 侧的建块策略。仓库已于 2025-01-31 归档，README 只写了 “No Longer Maintained”，没有给出原因。

**依据**
- Lane 接口：`block/lane.go:36-77@25c042e0b7`（`PrepareLane`、`ProcessLane`、`GetMaxBlockSpace`、`Match`、`GetTxInfo`）；LaneMempool 的 `Compare` / `Priority` 在 `block/lane.go:17-30` [17]。
- 容量：`block/proposals/proposals.go:69-98@25c042e0b7`。ratio 为 0 的 lane（只应是 default lane）拿到“剩余全部”字节 / gas；其他 lane 拿 `ratio × MaxBlockSize / MaxGasLimit`。`block/proposals/update.go:66-83` 在 `UpdateProposal` 时检查本 lane 的部分提案是否超限 [17]。
- 验证规则：`block/base/proposals.go:150-191@25c042e0b7` 的 DefaultProcessLaneHandler 列出四条不变量：本 lane 交易从开头连续；不属于本 lane 的交易连续排在末尾，并用 `VerifyNoMatches` 确认后面没有本 lane 的交易；按 `Compare` 有序，否则报 “transaction at index %d has a higher priority than %d”；每笔交易通过 VerifyTx [17]。`abci/utils.go:74-88` 的 `ChainProcessLanes` 按 lane 顺序串起来，末尾自动追加 `Terminator` [17]。
- 提案处理：`abci/abci.go:136-189`。ProcessProposal 在 `!h.useCustomProcessProposal` 时返回 `baseapp.NoOpProcessProposal()`；否则任何 lane 报错或 panic 都返回 `ResponseProcessProposal_REJECT`。`NewDefaultProposalHandler` 把 `useCustomProcessProposal` 设为 false（`abci/abci.go:32-45`），`New` 的注释写着 “It is highly recommended to use the default proposal handler” [17]。这一行为由 PR #543 “chore: Default Process Proposal” 引入，合入时间 2024-06-25 [19]。
- 示例配置：`tests/app/lanes.go:31-60` 中 mev 0.2、free 0.2、default 0.6；`tests/app/app.go:217-220` 写明 “the order of the lanes matters. Blocks are constructed from the top lane to the bottom lane”，顺序为 `[]block.Lane{mevLane, freeLane, defaultLane}`；该示例 app 用 `abci.New(..., true)`，即开启验证（`tests/app/app.go:273-281`）[17]。
- free lane 默认匹配 `MsgDelegate` / `MsgBeginRedelegate` / `MsgCancelUnbondingDelegation`（`lanes/free/lane.go:41-56`）[17]；MEV lane 在块顶做拍卖，bid tx 必须排在 lane 首位（`lanes/mev/abci.go:107-111`）[17]。
- 归档状态：`gh api repos/skip-mev/block-sdk` 返回 `archived: true`、`pushed_at: 2025-01-31T19:58:22Z`；最后两个 commit 是 2025-01-31 的 “Update README.md”。README 写着 “This project is no longer being maintained and will not be supported by current integrators… we strongly recommend forking” [17][18]。

**不确定之处**
- 归档原因：仓库没有说明。坊间说法是 Skip 被 Interchain Labs 收购后转向，未核实，不用。
- 哪些主网链开启了 `useCustomProcessProposal=true`：未查。
- 交易同时匹配多个 lane 时，`LanedMempool.Insert` 会放进第一个匹配的 lane（`block/mempool.go:85-96`）[17]。如果 lane 之间的 Match 有重叠，后面的 lane 在 ProcessLane 时 `VerifyNoMatches` 可能误判，需要集成方保证 Match 互斥（推论）。

---

## X-Q6 dYdX v4

**答案**：dYdX Chain 的每个节点都在内存里维护一本链下订单簿（short-term orders）。proposer 用本地订单簿按 price-time priority 撮合，把撮合结果写进块；各节点看到的消息顺序不同，订单簿可能不一致，收到新块后再同步。dYdX 博客提出过“vote extensions + 频繁批量拍卖”方案来限制 proposer 的纳入 / 排除权，但原文明确说这只是待原型验证的提案；当前代码里的 vote extensions 只用于 oracle 价格（Slinky）。ACE 帖说 “dYdX uses vote extensions to constrain … the transactions the proposer can exclude”，这种说法与 dYdX 自己的文档不符。最近的实际变化是 designated proposers（v9）和 Order Entry Gateway（OEGS）。

**依据**
- 文档 “Limit Order Book and Matching”：“Each full node in the network maintains an in-memory order book… Block proposers use trades from their local order book to build blocks, with matches generated by price-time priority… upon seeing a new consensus-committed block, nodes sync their local books with the block contents.”；文档还承认，cancel 如果没及时 gossip 到后续 proposer，订单仍可能被成交 [21]。
- 博客 “A New Architecture to Mitigate MEV”：现状是 “The initial version of the dYdX Chain employs a social mitigation strategy”。提案内容为：h−1 高度时验证者在 vote extension 里签名所见订单哈希；proposer 必须纳入 ≥2/3 stake 的 vote extensions，并且只能纳入出现在其中过半数的订单；在 ≥2/3 vote extensions 里出现的订单保证被纳入，出现不足 1/3 的不能纳入。结尾写 “excited to … prototype this architecture … before recommending it for adoption” [20]。
- 代码：`dydxprotocol/v4-chain/protocol/app/vote_extensions/extend_vote_handler.go`（main@ac27af66dd，2026-10-08，经 gh api 读取）只处理 `x/prices` 的 `MsgUpdateMarketPrices` 和 Slinky 价格 [22b]。
- OEGS 文档：validators 维护 “off-chain in-memory order book”，按加权轮询出块；designated proposers 是治理选出的一部分 validator（v9）；OEGS 网关与所有 designated proposer 直连，由第三方 Imperator 运营 [22]。

**不确定之处**
- 博客页面上同时出现 “January 24, 2025” 和 “Last Update: November 21, 2023”，发布日期不清楚。
- 没有逐一查看 dYdX 的 ProcessProposal 对撮合与排序做了哪些校验（只读了 vote extension 处理代码）。

---

## X-Q7 Injective 频繁批量拍卖（FBA）

**答案**：Injective 的 exchange 模块在每个块的 endBlock 把这一时间间隔内的订单批量清算：market order 先成交，然后是之前间隔留下的 limit order，最后是本间隔新的 limit order；limit order 按统一清算价成交；拍卖结束前订单不进入订单簿。排序规则由链的执行逻辑（共识）强制。它解决的是“块内谁先谁后”带来的抢跑，没有给通用合约提供排序比较器。

**依据**
- Injective 博客 “Injective Exchange Upgrade: A Novel Order Matching Mechanism”（2021-03-08）：成交顺序是 “Market orders are filled first / Unfilled limit orders from prior auction intervals / Limit orders from the most recent auction interval are filled last”；“Uniform Clearing Price … where the quantity of crossing orders is highest… midpoint”；“Orders are not published to the order book until the auction interval ends”；“batch auctions executing at each endBlock”；文中还说较长的拍卖间隔给了 MM 撤单时间 [23]。
- 现行文档（Trading）：“Through Frequent Batch Auctions (FBA), Injective eliminates MEV and front-running by aggregating orders into discrete batches that execute at a single clearing price” [24]。ACE 帖 §2.1 也把它列为 app-chain 的例子 [1]。

**不确定之处**
- 没有读 injective-core 源码。2021 年博客里的三段顺序在今天的衍生品 / 现货市场是否原样保留，未核实。
- 文档说的 “eliminating MEV” 是项目方自述；proposer 的纳入 / 排除权仍然存在（推论）。

---

## X-Q8（可选）Sui 局部费用市场；Penumbra 批量 swap

**答案**：Sui 按共享对象限流：每个共享对象每次 commit 有执行容量预算；交易按 gas price 从高到低调度，预算不够就推迟到下一次 commit；文档说 “Transaction priority is determined solely by gas price”。这是“冲突域隔离 + 局部费用”，不涉及操作语义上的优先级。Penumbra 按交易对把同一块的 swap 合成一笔批量交易执行，用户再用之后的 SwapClaim 私密地铸出结果；文档把 sealed-bid 批量 swap 列为未来升级。

**依据**：Sui 文档 “Local fee markets” 讲了 SharedObjectCongestionTracker、按 gas price 排序、按执行时间估计的每对象容量、deferral，以及 “at least 5 times the reference gas price” 的建议（SIP-45）[25]。Penumbra 协议文档 “Batch Swaps” 说明 V1 是 “publicly burns their input assets, and privately mints the output assets… In a future upgrade, Penumbra will use sealed-bid batch swaps”，并有 SwapClaim 章节 [26]。

**不确定之处**：只读了这两页的要点。Penumbra 的批次边界（每块结束时）和领取时延没有逐行核对。

---

## 对比表素材

| 实现 | 控制范围 | 强制力来源 | 组合性代价 | 违规后果 | 能否防审查 | 状态 |
|---|---|---|---|---|---|---|
| BAM MPP（Solana） | 已登记市场的报价更新：每个约 50 ms 的批次里先执行 | 链下：TEE 中的 BAM Node 调度器 + validator 对 BAM 的服务合约 | 同块原子（更新与 taker 在同一 slot 内，只是顺序固定） | BAM Node 可断开该 validator；块在 Solana 共识上仍然有效 | 否：非 BAM leader（约 62% stake）不受约束；BAM 运营方 / 静态登记决定谁有资格 | 主网（BAM early mainnet 2025-09-30）；MPP 只在部分区域提供，v0 |
| Temporal AMQ（Solana） | 单个程序（市场）的异步指令队列 | 合约 / 程序逻辑（队列状态 + crank） | 下一个 slot（或更晚）结算；失去同块原子性 | 无“违规”：规则写死在程序里；validator 只能审查或拖延 | 否：作者承认 validator 可通过审查 / 拖延绕过 | 提案 + 参考实现（cavemanloverboy/ace），未见生产部署 |
| Prop AMM 低 CU 更新 + Jito tip | 做市商自己的 oracle 更新 | 经济激励（Jito 按 tip/CU 排序） | 同块原子 | 无：出价更高的 taker 就能排到前面 | 否 | 主网实践（HumidiFi 等，2025） |
| Hyperliquid HyperCore | 整条链的订单簿动作，在每个 consensus batch 内按三类排序 | 链共识 / 执行规则（“only correct way … to execute a block”） | 链内同块；对外只能经桥结算；HyperEVM→Core 的下单被延迟几秒 | 不按规则执行属于错误执行（区块 / 状态无效） | 否：proposer 仍可以不打包 cancel | 主网 |
| Skip Block SDK（Cosmos） | 全区块：有序 lane + 每个 lane 的容量上限 + lane 内的比较器 | 默认只在 proposer 侧（PrepareProposal）；开启 `useCustomProcessProposal` 后成为验证者有效性规则（ProcessProposal REJECT） | 同块原子（lane 只决定块内位置） | 开启验证时提案被拒；默认无后果 | 否：只管顺序和容量，不管纳入 | 已归档（2025-01-31），停止维护 |
| dYdX v4 | 订单簿撮合（proposer 用本地内存订单簿撮合） | proposer 自律 + “social mitigation”；VE+FBA 只是提案 | 链内同块 | 现网对 proposer 的排序 / 纳入几乎没有协议约束 | 否（提案中的 VE 方案想解决这一点） | 主网；VE 防审查方案是提案 |
| Injective FBA | exchange 模块所有订单：每块 endBlock 统一清算 | 链共识 / 执行（exchange 模块） | 同块（批次在块末结算） | 不按规则执行属于错误执行 | 否 | 主网（2021 年起） |
| Sui 局部费用市场 | 每个共享对象的每次 commit | 共识 / 调度规则 | 被推迟的交易移到下一次 commit | 规则内置，没有“违规”一说 | 部分：只是限流，与审查无关 | 主网 |
| Penumbra 批量 swap | 每个交易对的批次 | 链共识 | swap 与领取分开，至少隔一笔交易 | 内置 | 否 | 主网（V1 公开输入） |

---

## 代码片段

1. **Block SDK Lane 接口**：`block-sdk/block/lane.go:36-77@25c042e0b7`（`Lane` 接口：`PrepareLane` / `ProcessLane` / `GetMaxBlockSpace` / `Match`）。说明“一条 lane = 匹配函数 + 容量 + lane 内排序 + 建块 / 验块两个钩子”，Mantle 的“类别 → 规则”调度器可以直接照这个接口建模。

2. **Block SDK 验证者侧的 lane 不变量**：`block-sdk/block/base/proposals.go:150-191@25c042e0b7`
```go
// DefaultProcessLaneHandler ... verifies the following invariants:
//  1. Transactions belonging to the lane must be contiguous from the beginning of the partial proposal.
//  2. Transactions that do not belong to the lane must be contiguous from the end of the partial proposal.
//  3. Transactions must be ordered respecting the priority defined by the lane (e.g. gas price).
//  4. Transactions must be valid according to the verification logic of the lane.
func (h *DefaultProposalHandler) ProcessLaneHandler() ProcessLaneHandler {
	return func(ctx sdk.Context, partialProposal []sdk.Tx) ([]sdk.Tx, []sdk.Tx, error) {
		...
		for index, tx := range partialProposal {
			if !h.lane.Match(ctx, tx) {
				if index+1 < len(partialProposal) {
					if err := h.lane.VerifyNoMatches(ctx, partialProposal[index+1:]); err != nil {
						return nil, nil, fmt.Errorf("failed to verify no matches: %w", err)
					}
				}
				return partialProposal[:index], partialProposal[index:], nil
			}
			if index > 0 {
				if v, err := h.lane.Compare(ctx, partialProposal[index-1], tx); v == -1 || err != nil {
					return nil, nil, fmt.Errorf("transaction at index %d has a higher priority than %d", index, index-1)
				}
			}
			if err := h.lane.VerifyTx(ctx, tx, false); err != nil { ... }
		}
		return partialProposal, nil, nil
	}
}
```
说明：“排序规则作为有效性规则”在代码里长什么样，即验证者逐笔检查归属、连续性和优先序。

3. **lane 容量的计算**：`block-sdk/block/proposals/proposals.go:69-98@25c042e0b7`（ratio 为 0 时拿剩余全部；否则 `ratio × MaxBlockSize / MaxGasLimit`）。说明 lane 的 `MaxBlockSpace` 是**上限**，不是预留；没用完的空间只有 ratio=0 的 default lane 能借用。

4. **默认关闭验证**：`block-sdk/abci/abci.go:136-139` + `:32-45@25c042e0b7`
```go
func (h *ProposalHandler) ProcessProposalHandler() sdk.ProcessProposalHandler {
	if !h.useCustomProcessProposal {
		return baseapp.NoOpProcessProposal()
	}
	...
// NewDefaultProposalHandler ... This will not use custom process proposal logic.
	return &ProposalHandler{ ..., useCustomProcessProposal: false }
```
说明：同一套 lane 规则，强制力可以只在 proposer 侧，也可以上升到验证者有效性规则，靠一个开关决定。默认是前者。

5. **lane 顺序与比例示例**：`block-sdk/tests/app/lanes.go:31-60` 与 `tests/app/app.go:214-220@25c042e0b7`（mev 0.2 / free 0.2 / default 0.6；`[]block.Lane{mevLane, freeLane, defaultLane}`，“Blocks are constructed from the top lane to the bottom lane”）。

6. **BAM 调度流协议**：`bam-protos/bam_types.proto:47-65@642c49ae6d`
```proto
message LeaderState {
  uint64 slot = 1;
  uint32 tick = 2;
  uint32 slot_cu_budget_remaining = 3;
}
// An 'atomic transaction batch' is a bundle of transactions that must be processed together
message AtomicTxnBatch {
  uint32 seq_id = 1; // unique for a single leader rotation
  uint64 max_schedule_slot = 2; // slot for which this bundle is valid for execution
  repeated Packet packets = 3;
}
message MultipleAtomicTxnBatch {
  repeated AtomicTxnBatch batches = 3;
  bytes mss_padding = 15;
}
```
以及 `bam-protos/bam_api.proto:59-69`（`BamNodeApi.InitSchedulerStream` 双向流）。说明：BAM Node 把排好序的批次推给 validator，validator 回报剩余 CU 和执行结果，排序决策不在 validator 上。

7. **MPP 发送端示例**：`mpp-sender/src/transaction.rs:10-16,33-51@d353e80349` 与 `src/sender.rs:16`（`SEND_INTERVAL = 50ms`；CU price 20,000,000 micro-lamports，CU limit 500；不带 Jito tip 指令）。说明：做市商侧只需要按 leader schedule 找到 BAM leader，用 UDP 高频发送带单调 seqno 的小交易。（注意：示例的 seqno 编码与文档 canonical 格式不同，见 X-Q1。）

8. **MPP 交易的 canonical 格式**（文档里的伪代码，不是源码）：bam.dev Maker Plugin “Getting started → Transaction Format” [3]：单 signer；只含 `SetComputeUnitLimit` + `SetComputeUnitPrice`（不低于运营方下限）+ 已登记 program 的 `MarketUpdateInstruction`，指令数据的配置偏移处是 u64 LE seqno。

---

## 图的素材

**BAM Maker Plugin 交易流程**（报告要求的图）
- 参与者：做市商（MM）、BAM Node 运营方、BAM Node（TEE 内：PTPU、maker buffer、普通 TPU / bundle 容器、调度器）、Jito Block Engine、BAM Validator（leader）、普通用户 / searcher。
- 准备：MM 把 signer / program / market / seqno offset 交给运营方 → 运营方写进静态 enrollment 配置（没有运行时 API）。
- 第 k 轮（约 50 ms）：MM 按 leader schedule 定位 BAM leader → UDP 把报价更新发到 PTPU →（校验：单 signer、已登记 signer 和 market、只允许 3 类 program、CU price 下限、seqno 存在；失败则静默丢弃）→ 进入 maker buffer；同一市场若已有更高 seqno，新来的标为 stale。同期用户交易和 bundle 进入普通容器。
- 第 k+1 轮 tick：stale 条目被丢弃 → **Phase 1**：每个 enrollee、每个市场取最新一笔更新放到批次顶部 → **Phase 2**：bundle 和普通交易按同一 priority score 竞争（tip 只在这里起作用）。普通 TPU 里若有已在 Phase 1 调度过的同一笔交易，丢弃。
- BAM Node 通过 `InitSchedulerStream` 把 `MultipleAtomicTxnBatch` 推给 leader → validator 按顺序执行 → 回报 `AtomicTxnBatchResult`；validator 不按序执行时，BAM 可断开连接。
- 分支：leader 不是 BAM validator（约 62% stake），或所连 BAM Node 不在提供 MPP 的区域 → 没有 Phase 1，更新只能走普通 TPU 或 Jito 竞价（退回 Prop AMM 的“经济型 cancel priority”）。

**AMQ 两 slot 流程**（可放进“按强制力分层”的全景图，或 ACE 规则冲突一节）
- slot N：用户 A 发 limit（入队，锁定资金）；MM 发 cancel（入队，优先级 1）；其他合约无法在 slot N 读到成交结果。
- slot N+1：crank 交易按优先级出队：先执行 cancel，再执行 limit → 结算。
- 分支：slot N 的 leader 审查 MM 的 cancel → cancel 落入下一批，limit 先成交（审查边界）。

**全景图（按强制力层）中本路各项的位置**
- 链共识 / 执行：Hyperliquid HyperCore、Injective FBA、Sui 局部费用市场、Penumbra；Block SDK（开启 ProcessProposal 时）。
- sequencer / builder / proposer 侧：Block SDK（默认）、dYdX proposer 撮合。
- 链下批处理网络（TEE）：BAM + MPP。
- 合约入口与经济激励：Temporal AMQ（合约）、Prop AMM + Jito tip（经济）。

**Block SDK lane 示意**：块 = [MEV lane ≤20%：bid tx + bundle] → [free lane ≤20%：质押类消息] → [default lane：剩余空间，按 fee 排序]；验证者（开启验证时）逐 lane 检查连续、有序、不超限。

---

## 对 Mantle 的启示（均为推论 / 设计建议）

1. **“类别优先”和“价格竞争”可以分层，而且应该分层**：BAM 的 Phase 1 / Phase 2 [2]、Hyperliquid 的三类排序 + 类内 proposer 顺序 [14]、Block SDK 的 lane 顺序 + lane 内 `Compare` [17]，结构相同，都是“外层按操作语义分档，内层再按价格或到达顺序排”。Mantle 可以把 payment（FCFS）、maker 报价 / 撤单（phase-first）、DeFi（tip 优先）做成外层档位，每档配自己的内层比较器。这样可以检验用户的假设：“payment 要 FCFS、DeFi 要 tips”本身不需要“对整块空间再分配”，需要的是“外层分档 + 每档的容量上限”。
2. **语义优先权必须窄、可验证、资源有界**：MPP 只接受单 signer、已登记 program 和 market、只能写一个 market account、CU 下限，并且同一市场每轮只保留一笔 [2][3]。Mantle 如果给 perps / launchpad 的 maker 提供“先于 taker”的档位，也要用白名单合约 + selector + 写集约束 + 每市场每块限一笔来防滥用；否则任何 taker 都会把自己伪装成 maker 更新。
3. **容量是“上限”还是“预留”要想清楚**：Block SDK 的 `MaxBlockSpace` 是上限，没用完的空间只流向 ratio=0 的 default lane [17]。Mantle 的 payment 档如果需要“保证容量”，就得另外设计预留和借用规则（例如 Tempo / BSC 的 payment lane 方案），不能照搬 Block SDK。
4. **强制力的升级路径**：Block SDK 用一个开关在 proposer 侧策略和验证者有效性规则之间切换 [17]。Mantle 可以先在 sequencer / op-rbuilder 里做调度策略（相当于 NoOp ProcessProposal），再选择性地把一部分规则（例如“类别 A 必须连续排在块首”、“payment 档按 nonce / 到达时间 FCFS”）写进可由 derivation / 验证者复核的规则。注意 FCFS 的到达时间不可验证，只能做到“排序可复核”，到达时间本身仍需信任 sequencer。
5. **审查是所有方案共同的边界**：ACE 帖和 AMQ 作者都承认，proposer 或 validator 可以不打包 cancel [1][11]。在 Mantle 的单 sequencer 场景下，排序规则正确不代表没有审查；需要配合 forced inclusion（L1 deposit）或可审计的 sequencer 日志。dYdX 的 VE 方案说明，要防排除就需要多方纳入投票，代价较大，而且至今还是提案 [20]。
6. **跨环境的语义优先会制造绕道**：Hyperliquid 给 CoreWriter 下单加了几秒延迟，防止 EVM 侧绕过 L1 mempool 抢先 [15]。如果 Mantle 只给某个入口（例如原生 precompile 或专用 RPC）提供优先档，就要防止通过其他入口（AA bundler、合约内部调用）绕过档位规则。
7. **AMQ 型合约方案可作为不改链的过渡**：适合能接受“下一块结算”的 launchpad 批量开盘或订单市场，不适合需要同块闪电贷组合的 DeFi [1][11]。
8. **只靠经济手段做优先不可靠**：Prop AMM 的低 CU + 小 tip 只在“tip/CU”这一排序规则下成立 [12]。如果 Mantle 的 DeFi 档按 priority fee per gas 排序，低 gas 的报价更新同样能获得经济型优先；但这不是保证，在 meme launchpad 抢购这类高 tip 场景下会失效。

---

## 外部调研的修正

1. **“BAM 已有 mainnet 接入…不能据此推导该插件覆盖整个 Solana”**：方向正确，但缺数字。现行数据：BAM 约 37.66% stake、386 个 validator（explorer API，2026-10-11）[8]；MPP 还只限 “select regions” [4]。BAM early mainnet 公告日期是 2025-09-30 [7]。
2. **“文档中的轮次约为 50ms，第二阶段不能通过更高 tip 越过第一阶段”**：已核实 [2][4]。需要补充一点：Phase 1 调度的是“上一轮收到的”更新 [2]，所以有一轮的延迟。另外 MPP 交易**不需要** Jito tip，只付 CU 费 [2]。
3. **“Skip Block SDK：应用定义 lanes、匹配规则、容量和 proposal 验证”**：不准确。自 PR #543（2024-06-25）起，作者推荐的默认 handler 让 ProcessProposal 什么都不做；proposal 验证要显式用 `abci.New(..., true)` 打开 [17][19]。默认情况下 lane 规则只是 proposer 侧策略，不是有效性规则。“2025 年 1 月归档”正确（pushed_at 2025-01-31，archived=true）[18]，但没有官方给出的原因。
4. **Temporal URL**：外部调研用的 `temporal.xyz/writing/...` 能打开；反倒是 ACE 帖里的 `/writings/...` 已经 404 [11]。外部调研的 AMQ 描述（“本 slot 排队，下个 slot 由应用处理”）正确，但漏了作者自己承认的审查边界 [11]。
5. **HyperCore 排序类别**：外部调研的写法（不发 GTC/IOC 的动作 → 撤单 → 含 GTC/IOC 的动作，同类内按 proposer 顺序，作用于 batch）与现行文档一致 [14]。ACE 帖和 2024 年博客说 “cancels and post-only first”；按现行文档，post-only 其实在 cancel 之前，因为它属于类别 1 [13][14]。
6. **Injective 引用**：外部调研链接的 `docs.injective.network/developers-defi/exchange-overview` 未核实（未访问）。现行可用的出处是 `docs.injective.network/defi/trading/index` 和 2021-03-08 的博客 [23][24]。
7. **dYdX**：外部调研没有单独讨论 dYdX；但 ACE 帖说 dYdX “uses vote extensions … limiting the set of transactions the proposer can exclude”，这一说法与一手来源不符。dYdX 博客把它写成待原型验证的提案 [20]，现网 vote extensions 只用于 oracle 价格 [22b]。报告引用 ACE 帖时要更正。
8. **Sui**：外部调研的 URL `docs.sui.io/develop/transaction-payment/local-fee-markets` 可用；该页明确说优先级 “determined solely by gas price” [25]，与外部调研说的“不等同于应用自由定义优先级”一致。
9. **Penumbra**：外部调研说“将更完整的 sealed-bid 机制列为后续方向”，与协议文档一致 [26]。

---

## 来源

1. **PRIMARY** Bahrani & Neuder，“Application-controlled execution: A case study on cancel prioritization”，ethresear.ch/t/23977（JSON：`/t/23977.json`），2026-01-29；post #3（mikeneuder，2026-02-02）。证明了：ACE 的定义、四类实现（§2.1–2.4）、对 Hyperliquid / Injective / dYdX / AMQ 的概括，以及第 3 楼对 Prop AMM 的引用。
2. **PRIMARY** bam.dev/docs/bam/maker-plugin/how-it-works/。证明了：PTPU、校验规则、合并、约 50 ms 两阶段调度、不能靠 tip 越过、不需要 Jito tip、静态登记。
3. **PRIMARY** bam.dev/docs/bam/maker-plugin/getting-started/。证明了：登记字段、交易格式、UDP 端口 5012、370 ms 去重、seqno 策略。
4. **PRIMARY** bam.dev/docs/bam/maker-plugin/faqs/。证明了：多付费也排不到 maker 前面；初期只在 select regions 提供；MPP 不接受 bundle。
5. **PRIMARY** bam.dev/docs/bam/bam-overview/。证明了：BAM Node / Validator / Block Engine 的分工，以及 validator “exact order” 义务和断连后果。
6. **PRIMARY** bam.dev 首页。证明了：BAM 节点运行在 TEE 中；插件直接接入 BAM 调度器。
7. **PRIMARY** forum.bam.dev/t/bam-early-mainnet-is-live/49（2025-09-30）。证明了：主网早期上线、最初 3 个区域、bam-client 开源。
8. **PRIMARY** explorer.bam.dev/api/v1/validators（2026-10-11 访问）。证明了：386 个 validator，stake 合计 37.66%，节点名带 `-tee`。
9. **PRIMARY** /tmp/ass-src/bam-protos@642c49ae6d（bam_api.proto、bam_types.proto）。证明了：Node→Validator 的批次流协议。
10. **PRIMARY** /tmp/ass-src/mpp-sender@d353e80349（README、src/transaction.rs、src/sender.rs）。证明了：MPP 发送端的路由与发送方式（50 ms、UDP、按 leader schedule）。
11. **PRIMARY** Temporal，“Application Controlled Execution (ACE) through Asynchronous Market Queues (AMQs)”，temporal.xyz/writing/…（2025-09-22，Cavey & Jakob Povšič）。证明了：AMQ 机制、队列规模、两种 ACE 形式、作者自认的审查边界。
12. Helius 博客 “Solana's Proprietary AMM Revolution”，helius.dev/blog/solanas-proprietary-amm-revolution（Lostin，2025-08-25）。研究文章，是 ACE 帖第 3 楼所引那句话的原始出处。证明了：143 CU 更新、4,998 lamports tip、Jito 按 tip/CU 排序（这一点是二手转述）。
13. **PRIMARY** Hyperliquid，“Latency and transaction ordering on Hyperliquid”，hyperliquid.medium.com（2024-01-06，通过 RSS 全文读取）。证明了：cancel / post-only 优先，以及 “only correct way … to execute a block” 的强制性表述。
14. **PRIMARY** hyperliquid.gitbook.io/hyperliquid-docs/hypercore/order-book（.md）。证明了：现行三类排序、作用于每个 consensus batch、类内按 proposer 顺序。
15. **PRIMARY** hyperliquid-docs/for-developers/hyperevm/interacting-with-hypercore。证明了：CoreWriter 地址与 gas，以及下单动作被链上延迟几秒以防绕过 L1 mempool。
16. **PRIMARY** hyperliquid-docs/for-developers/hyperevm/interaction-timings、dual-block-architecture。证明了：EVM 块与 CoreWriter 动作在 L1 块内的先后顺序，以及双块参数。
17. **PRIMARY** /tmp/ass-src/block-sdk@25c042e0b7（README、block/lane.go、block/base/proposals.go、block/proposals/*.go、abci/*.go、lanes/*、tests/app/*）。证明了：lane 接口、容量、验证不变量、默认 NoOp ProcessProposal、示例配置。
18. **PRIMARY** `gh api repos/skip-mev/block-sdk`（2026-10-11）。证明了：archived=true，pushed_at 为 2025-01-31T19:58:22Z。
19. **PRIMARY** github.com/skip-mev/block-sdk/pull/543 “chore: Default Process Proposal”，2024-06-25 合入。证明了：默认关闭 ProcessProposal 校验的时间点。
20. **PRIMARY** dYdX 博客 “A New Architecture to Mitigate MEV”，dydx.xyz/blog/architecture-to-mitigate-mev。证明了：现状是 social mitigation；VE + FBA 是待原型验证的提案；给出 2/3 和 1/3 的纳入阈值。
21. **PRIMARY** docs.dydx.xyz/concepts/trading/limit-orderbook。证明了：节点内存订单簿；proposer 用本地订单簿撮合并出块；cancel 未及时传播时订单仍可能成交。
22. **PRIMARY** docs.dydx.xyz/concepts/architecture/oegs。证明了：designated proposers（v9）与 OEGS 网关；网关由第三方 Imperator 运营。
22b. **PRIMARY** dydxprotocol/v4-chain `protocol/app/vote_extensions/extend_vote_handler.go`（main@ac27af66dd，2026-10-08，经 gh api 读取）。证明了：vote extension 只处理 oracle 价格。
23. **PRIMARY** Injective 博客 “Injective Exchange Upgrade: A Novel Order Matching Mechanism”（2021-03-08）。证明了：FBA 的成交顺序、统一清算价、在 endBlock 执行。
24. **PRIMARY** docs.injective.network/defi/trading/index。证明了：现行文档仍把 FBA 列为执行机制。
25. **PRIMARY** docs.sui.io/develop/transaction-payment/local-fee-markets。证明了：按共享对象做拥堵控制，按 gas price 排优先，排不上则推迟。
26. **PRIMARY** protocol.penumbra.zone/main/dex/swap.html。证明了：批量 swap 公开燃烧输入、私密铸造输出、有 SwapClaim，sealed-bid 是未来升级。

---

## 开放问题

1. BAM MPP 的 PTPU 端口在 validator 主机上还是在 BAM Node 上？发往 leader IP 的包怎么进入 TEE？
2. MPP 实际覆盖多少 leader slot？“select regions” 是哪些区域？有没有公开的 MPP 登记做市商或市场列表？
3. BAM Phase 2 的 “priority score” 公式，以及它与 Jito 原有 tip/CU 排序的关系。
4. 哪些 Cosmos 链在用 Block SDK 时打开了 `useCustomProcessProposal=true`，也就是真正由验证者强制 lane 规则？
5. dYdX 的 VE + FBA 提案是否做过原型，是否进入过治理？dYdX ProcessProposal 对撮合做了哪些校验？
6. Injective 现行代码里 FBA 的三段成交顺序是否和 2021 年博客一致（需要读 injective-core 的 exchange 模块）？
7. Hyperliquid “consensus batch” 的确切边界（文档说一个块通常 1–2 个）；HyperEVM 交易的排序规则（是否按 gas price）。
8. AMQ 参考实现（cavemanloverboy/ace）的代码细节与 crank 激励。

---

## 台账

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| X1 | BAM Node 接收交易 / bundle、验证并排序后发给 leader 上的 BAM Validator；validator 必须 “Execute all received transactions in that exact order”，违约时 BAM Node 可临时或永久断开它 | bam.dev/docs/bam/bam-overview/ §BAM Node、§Validator（来源 [5]） | observed |
| X2 | BAM Node 运行在 TEE 中；explorer 中 386 个节点连接名里有 385 个带 `-tee` 后缀 | bam.dev 首页 “Trusted Execution Environments (TEEs)”；`curl explorer.bam.dev/api/v1/validators`（来源 [6][8]） | observed |
| X3 | Node→Validator 通过双向 gRPC 流 `InitSchedulerStream` 下发 `MultipleAtomicTxnBatch`，每个 `AtomicTxnBatch` 带 `seq_id`、`max_schedule_slot`，并且 “must be processed together” | bam-protos/bam_api.proto:59-69@642c49ae6d；bam-protos/bam_types.proto:53-65@642c49ae6d | observed |
| X4 | MPP 通过单独的 UDP 端点 PTPU 接收做市商预签名的报价更新，默认端口 5012 | bam.dev maker-plugin how-it-works §How it works；getting-started §Sending protocol（来源 [2][3]） | observed |
| X5 | PTPU 校验：单 signer、已登记 signer、写入已登记 market、只允许已登记 program + Compute Budget + System、CU price 下限、指令数据配置偏移处有 8 字节 LE u64 seqno；不满足则静默丢弃 | bam.dev maker-plugin how-it-works §Validation Requirements（来源 [2]） | observed |
| X6 | 同一市场每轮只保留最高 seqno 的那笔更新，更低 seqno 的标为 stale，在 tick 时丢弃 | bam.dev how-it-works §Nonce Coalescing（来源 [2]） | observed |
| X7 | 每个拍卖轮约 50 ms；Phase 1 先排“上一轮收到的”maker 更新，Phase 2 中 bundle 与普通交易按同一 priority score 竞争 | bam.dev how-it-works §Scheduling Logic（来源 [2]） | observed |
| X8 | 多付 fee 或 tip 都不能排到 Phase 1 之前（“structural and cannot be changed by paying higher fees or tips”） | bam.dev how-it-works §Scheduling Logic；faqs “Can I pay more…? No.”（来源 [2][4]） | observed |
| X9 | MPP 交易不需要 Jito tip，只付标准 CU 费 | bam.dev how-it-works §Key Properties “No Jito tip required”（来源 [2]） | observed |
| X10 | MPP 登记是静态的，由 BAM 节点运营方配置，没有运行时注册 API；最多 32 个 signer、64 个 market account | bam.dev how-it-works §Static enrollment；getting-started §Getting Enrolled（来源 [2][3]） | observed |
| X11 | 初期 MPP 只在 “select regions” 的 BAM 节点所连接的 leader 上提供 | bam.dev maker-plugin faqs “Does every BAM node run the maker plugin?”（来源 [4]） | observed |
| X12 | BAM early mainnet 于 2025-09-30 宣布上线，最初节点在 Amsterdam / Frankfurt / NYC | forum.bam.dev/t/bam-early-mainnet-is-live/49 post #1（来源 [7]） | observed |
| X13 | 截至 2026-10-11，BAM 有 386 个 validator，stake 合计约 165.1M SOL，占全网 37.66% | `curl explorer.bam.dev/api/v1/validators` 汇总 stake_percentage（来源 [8]） | observed |
| X14 | MPP 的强制力来自链下的 BAM Node（TEE）和断连威胁，不来自 Solana 共识；非 BAM leader 的 slot（约 62% stake）不受 Phase 1 约束 | 由 X1、X8、X11、X13 推出：规则在 BAM 调度器里执行，validator 违约的后果只是断连 | inferred |
| X15 | 一笔 maker 更新从到达到执行最多晚约 2 个拍卖轮（约 50–100 ms） | 由 X7 推出：Phase 1 排的是上一轮收到的更新 | speculative |
| X16 | mpp-sender 示例每 50 ms 用 UDP 向当前 BAM leader 发一笔交易，CU price 20,000,000 micro-lamports、CU limit 500，不带 tip 指令 | mpp-sender/src/sender.rs:16@d353e80349；mpp-sender/src/transaction.rs:15-16,33-51@d353e80349；README §Routing | observed |
| X17 | Temporal AMQ（Cavey & Jakob Povšič，2025-09-22）在程序状态中维护优先队列，异步指令按类型分优先级并打上 slot / 序号，延迟（例如 slot+1）后由单独指令按优先级执行；示例中 cancel 优先级 1、limit 优先级 0 | temporal.xyz/writing/… §How AMQs Work、§Implementation Example（来源 [11]） | observed |
| X18 | AMQ 作者承认 “AMQs can still be bypassed by a validator within protocol enforced tick boundaries through censorship and delay” | temporal.xyz/writing/… §Enforcing ACE；ethresear.ch/t/23977 §2.2（来源 [11][1]） | observed |
| X19 | AMQ 让结果最早下一个 slot 结算，同块交易（例如闪电贷）用不到 batch 的结果 | ethresear.ch/t/23977 §2.2 “Next-block Settlement”；temporal 原文 “breaks the atomicity of execution”（来源 [1][11]） | observed |
| X20 | ACE 帖链接的 temporal.xyz `/writings/` URL 在 2026-10-11 返回 404，现行 URL 是 `/writing/` | `curl -o /dev/null -w %{http_code}`：/writings/… → 404，/writing/… → 200 | observed |
| X21 | ACE 帖第 3 楼引用的 “Solana's Proprietary AMM Revolution” 是 Helius 博客，作者 Lostin，2025-08-25 | ethresear.ch/t/23977.json post #3 链接；helius.dev/blog/solanas-proprietary-amm-revolution 页头（来源 [1][12]） | observed |
| X22 | HumidiFi 的 oracle 更新约 143 CU（约 9,998 lamports），只要 4,998 lamports tip 就能排到 Jito 拍卖队列前列；典型的 Prop AMM swap 约 150,000 CU | helius.dev 博客 §Oracle Updates（来源 [12]） | observed |
| X23 | Prop AMM 的“cancel priority”只是 tip/CU 竞价下的成本优势，出价更高的 taker 就能越过，并非结构性规则 | 由 X22（按 tip/CU 排序）与 X8（BAM 明确的结构性规则作对照）推出 | inferred |
| X24 | Hyperliquid 称 cancel 和 post-only 优先于 GTC / IOC，并且 “The only correct way for a node to execute a block on the Hyperliquid L1 is to sort cancels and post-only orders first” | hyperliquid.medium.com “Latency and transaction ordering on Hyperliquid”（2024-01-06，RSS 全文）§Hyperliquid's design（来源 [13]） | observed |
| X25 | 现行文档：每个 consensus batch（一个块通常 1–2 个）内依次排“不发 GTC/IOC 的动作 → cancel → 含 GTC/IOC 的动作”，类内按 proposer 顺序 | hyperliquid-docs/hypercore/order-book.md（来源 [14]） | observed |
| X26 | 按现行文档，post-only（ALO）属于类别 1，排在 cancel 之前，与 2024 年博客 “cancels and post-only first” 的笼统说法有差别 | 由 X24、X25 推出 | inferred |
| X27 | 从 HyperEVM 经 CoreWriter（0x3333…3333，约 47k gas）发出的下单动作会被链上延迟几秒，以防绕过 L1 mempool 获得时延优势 | hyperliquid-docs/for-developers/hyperevm/interacting-with-hypercore §CoreWriter contract（来源 [15]） | observed |
| X28 | HyperEVM 合约享受不到 HyperCore 的同批 cancel 优先规则 | 由 X25（只给订单簿动作描述了分类排序）、X27 以及 interaction-timings（CoreWriter 动作在 EVM 块之后处理）推出（来源 [16]） | inferred |
| X29 | Block SDK 的 Lane 接口由 Match / PrepareLane / ProcessLane / GetMaxBlockSpace / Compare / Priority 组成 | block-sdk/block/lane.go:17-77@25c042e0b7 | observed |
| X30 | lane 的 MaxBlockSpace 是相对整块的上限比例；ratio 为 0 的 default lane 拿剩余全部字节 / gas | block-sdk/block/proposals/proposals.go:69-98@25c042e0b7；block/proposals/update.go:66-83@25c042e0b7 | observed |
| X31 | ProcessLane 的默认验证：本 lane 交易连续排在前面、后面不再出现本 lane 交易、按 Compare 有序、逐笔 VerifyTx；违反则拒绝提案 | block-sdk/block/base/proposals.go:150-191@25c042e0b7；abci/abci.go:156-175@25c042e0b7（REJECT） | observed |
| X32 | 推荐的 `NewDefaultProposalHandler` 让 ProcessProposal 为 NoOp；只有 `abci.New(..., true)` 才由验证者强制 lane 规则；这一默认值来自 PR #543（2024-06-25） | block-sdk/abci/abci.go:32-45,136-139@25c042e0b7；`gh pr view 543 -R skip-mev/block-sdk` mergedAt 2024-06-25T14:48:18Z | observed |
| X33 | 示例 app 的 lane 顺序为 mev → free → default，比例分别为 0.2 / 0.2 / 0.6，“Blocks are constructed from the top lane to the bottom lane” | block-sdk/tests/app/lanes.go:31-60@25c042e0b7；tests/app/app.go:214-220@25c042e0b7 | observed |
| X34 | free lane 默认匹配 MsgDelegate / MsgBeginRedelegate / MsgCancelUnbondingDelegation | block-sdk/lanes/free/lane.go:41-56@25c042e0b7 | observed |
| X35 | skip-mev/block-sdk 已归档（archived=true，最后推送 2025-01-31），README 声明不再维护并建议 fork，没有说明原因 | `gh api repos/skip-mev/block-sdk`；block-sdk/README.md:1-3@25c042e0b7 | observed |
| X36 | dYdX 的每个节点维护内存订单簿；proposer 用本地订单簿按 price-time priority 撮合并写进块；cancel 未及时传到后续 proposer 时订单仍可能成交 | docs.dydx.xyz/concepts/trading/limit-orderbook（来源 [21]） | observed |
| X37 | dYdX 的 “vote extensions + FBA 限制 proposer 纳入 / 排除” 是博客提出、待原型验证的提案；现状是 “social mitigation” | dydx.xyz/blog/architecture-to-mitigate-mev §Status quo、§Looking ahead（来源 [20]） | observed |
| X38 | dYdX 现网代码中的 vote extension 只处理 oracle 价格（x/prices，Slinky） | dydxprotocol/v4-chain protocol/app/vote_extensions/extend_vote_handler.go@ac27af66dd（gh api） | observed |
| X39 | ACE 帖说 “dYdX uses vote extensions to … limit the set of transactions the proposer can exclude”，这与 dYdX 一手来源不符 | 由 X37、X38 与 ethresear.ch/t/23977 §2.1 的原句对比推出 | inferred |
| X40 | dYdX v9 引入 designated proposers（治理选出的 validator 子集），OEGS 网关直连这些 proposer，由第三方 Imperator 运营 | docs.dydx.xyz/concepts/architecture/oegs（来源 [22]） | observed |
| X41 | Injective 每个块在 endBlock 执行 FBA：market order 先成交，然后是之前间隔留下的 limit，最后是本间隔的 limit；limit 按统一清算价成交；拍卖结束前订单不公开 | injective.com/blog/injective-exchange-upgrade-a-novel-order-matching-mechanism/（2021-03-08）（来源 [23]） | observed |
| X42 | Injective 现行文档仍把 FBA 列为订单执行机制（统一价格、离散批次） | docs.injective.network/defi/trading/index.md（来源 [24]） | observed |
| X43 | Sui 按共享对象限制每次 commit 的执行容量；交易优先级 “determined solely by gas price”；排不上的交易推迟到下一次 commit | docs.sui.io/develop/transaction-payment/local-fee-markets（来源 [25]） | observed |
| X44 | Penumbra V1 的批量 swap 公开燃烧输入、私密铸造输出（SwapClaim），sealed-bid 批量 swap 是未来升级 | protocol.penumbra.zone/main/dex/swap.html §Batch Swaps（来源 [26]） | observed |
| X45 | 本路所有机制都没有解决 proposer 不打包 cancel 的审查问题；dYdX 的 VE 方案是唯一针对这一点的设计，但仍是提案 | 由 X14、X18、ethresear.ch/t/23977 §2.1 Cons（censorship）、X37 推出 | inferred |

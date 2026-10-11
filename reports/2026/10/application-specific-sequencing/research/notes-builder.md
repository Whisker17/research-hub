# notes-builder：排序器 / builder 层的 EVM 实现（B 路）

调研日期：2026-10-11。源码均为本地固定 commit（见“来源”），网页访问日期均为 2026-10-11。
读者假设：懂 EVM 与 OP Stack 出块（op-node → engine API → EL），没系统看过排序与 MEV 拍卖。

---

## B-Q1 op-rbuilder 的排序

**答案**：op-rbuilder 不自带排序算法。它从 reth 交易池取 `best_transactions`，交易池类型 `OpTransactionPool` 固定使用 `CoinbaseTipOrdering`：按有效小费（`min(maxPriorityFee, maxFee − baseFee)`）从高到低排；小费相同，先进池的在前。所以它是“小费优先、同价 FIFO”，不是 FCFS。Flashblocks 模式下，**每个 flashblock 都会重新从池里取一次 best 迭代器**；gas 预算按 `block_gas_limit / flashblock 数` 逐块累加，没用完的额度顺延到下一块。已经发布的 flashblock 不会再重排，因此优先排序只在**单个 flashblock 的候选集**内成立，不覆盖整块。可插拔点只有：交易池的排序 trait（要换池类型）、`PayloadTxsBounds` 迭代器包装、`execute_best_transactions` 循环里的逐笔过滤 / 提交条件。现有的选择 / 限制功能：单笔 gas 上限、按地址的 gas / 计算时间令牌桶、revert protection（单笔 bundle + 区块或 flashblock 范围）、backrun bundle（默认关闭）、DA 与未压缩区块大小上限。

**依据**
- 交易池类型：`OpTransactionPool = OpPool<Pool<…, CoinbaseTipOrdering<T>, S>>`（reth/op-reth/crates/txpool/src/lib.rs:33-37@f022de0f62）；op-rbuilder 的池构造为 `Flashpool<OpTransactionPool<…, FBPooledTransaction>>`（op-rbuilder/crates/op-rbuilder/src/pool/builder.rs:81@4f1bec3）[1][2]。
- `CoinbaseTipOrdering::priority = transaction.effective_tip_per_gas(base_fee)`（reth/patches/reth-transaction-pool/src/ordering.rs:61-86@f022de0f62）。同优先级比较 `submission_id`，ID 小（更早）的排前（pending.rs:649-657）[2]。注：读的是 Mantle reth fork 里的 patch 副本，op-rbuilder 实际依赖 op-rs/reth@aef8d3e（Cargo.toml:63,103），两者一致属于推断。
- 每个 flashblock 都重新取迭代器：`best_txs.refresh_iterator(BestPayloadTransactions::new(self.pool().best_transactions_with_attributes(..)), flashblock_index)`（builder/candidate.rs:210-219）[1]。`FlashblockTxTracker` 跨 flashblock 记录已提交 / 已排除的交易，避免重复选取（builder/best_txs.rs:9-42, 94-136）[1]。
- 预算：`gas_per_batch = ctx.block_gas_limit() / target_flashblocks`（builder/payload.rs:735）；下一块的目标 `target_gas_for_batch = self.target_gas_for_batch + self.gas_per_batch`，按累计计算（payload.rs:242）[1]。规范里把它称为“linear gas limit increase”，并指出高优先级的大交易可能塞不进前几个小 flashblock（rollup-boost/specs/flashblocks.md:480-512）[4]。
- 默认参数：`--rollup.chain-block-time` 默认 1000ms，`--flashblocks.block-time` 默认 250ms（args/op.rs:35-40, 214-219）。规范的 `FLASHBLOCKS_TIME` 默认 200ms，例子是“2s/200ms = 10 Flashblocks”（specs/flashblocks.md:105-106）[1][4]。
- 逐笔过滤顺序（context.rs:392-505）：conditional 检查 → `is_tx_over_limits`（gas / DA / 未压缩大小）→ 拒绝 blob 和 deposit → `address_limiter.is_debt_free` → 执行，执行后由提交条件决定 `CommitChanges::No` 的情形：超过 `max_gas_per_txn`，或交易回滚且带 revert protection [1]。
- 各开关：`--builder.max_gas_per_txn`、`--builder.enable-revert-protection`（默认 false）、`--builder.exclude-reverts-between-flashblocks`（args/op.rs:43-78）。地址限流 `--gas-limiter.*`：默认关闭，每地址桶 10M gas，每块回填 1M；`--compute-limiter.*`：50ms 桶、每块回填 10ms（limiter/args.rs:4-56）。模拟后被拒的交易也计入预算（context.rs 中注释 “Declined simulations still consume sender budget”）[1]。
- `eth_sendBundle`：只能放 1 笔交易，带 `revertingTxHashes`、min/max 区块号（范围不超过 10 块）、min/max flashblock 号、时间戳范围；只有开启 revert protection 才提供（docs/eth_sendBundle.md；primitives/bundle.rs:12,33-111）[1]。
- Backrun bundle：默认关闭。`enforce_strict_priority_fee_ordering` 模式要求 backrun 的优先费等于目标交易（backrun_bundle/args.rs:1-23；builder/context.rs:687-732）[1]。

**不确定之处**：Flashblocks 内具体用哪条迭代路径（continuous-build 模式 `--flashblocks.continuous-build`，默认 false）没有逐行追。reth `BestTransactions` 会按 sender 的 nonce 依赖跳过后续交易，这是 reth 通用行为，本路没有单独核对代码。

## B-Q2 rollup-boost

**答案**：rollup-boost 是插在 op-node 和 EL 之间的 engine API 代理（sidecar）。收到带 attributes 的 FCU，它同时转发给本地 EL 和外部 builder；`getPayload` 时并行取两边的区块，用本地 EL 的 `engine_newPayload` 校验 builder 区块，失败、超时或 builder 报错都回退到本地区块。可选的 `GasUsed` 策略会在 builder 区块 gas 不到本地块 10% 时也选本地块。**它不做任何排序规则校验**：通过的条件只有“EVM / 共识有效”外加可选的 gas 比较。回退时用本地 EL 的默认排序出块，链上看不出这次切换。

**依据**
- README “Core System Workflow” 第 1–4 步 [3]。
- 校验与选择：`self.l2_client.new_payload(..)`，`!status.is_valid()` 时 `payload: None`（crates/rollup-boost/src/server.rs:380-401）；dry-run 用 L2 区块，否则按 `block_selection_policy` 选择或直接用 builder 区块（server.rs:451-461）[3]。
- `BlockSelectionPolicy::GasUsed`：builder 区块 gas 低于 L2 区块 10% 时选 L2 区块（selection.rs:4-14）[3]。
- 开启 `external_state_root` 时不调 newPayload，改算外部 state root（server.rs:403-410）[3]。
- 在 crates 中搜 `priority|tip|sort|ordering`，只命中原子类型的 `Ordering` 和 flashblock 按 index 排序（service.rs:298），没有任何交易顺序检查 [3]（命令：`rg -n -i "priority|tip|sort|ordering" crates --type rust`）。
- 规范把交易选择写成 builder 自由决定的启发式：“Prioritize and sort transactions based on predefined sequencing policies, such as priority ordering or by MEV paid”（specs/flashblocks.md:529-531）[4]。

**不确定之处**：Flashblocks 模式下 rollup-boost 用 flashblock 拼出最终 payload，这时的校验路径（是否同样走 newPayload）没有逐行确认。rollup-boost 最后一次发布是 v0.7.17（2026-07-16），之后无提交，是否在向别处迁移不明。

## B-Q3 Unichain

**答案**：已上线的有：2025-05-01 起 TEE 内建块（Flashbots 和 Uniswap Labs 合作，基于 Rollup-Boost），官方说法是“纯按优先费排序”、私有加密 mempool、revert protection；2025-08-14 起 200ms Flashblocks，主链出块 1 秒。官方称“provable ordering”，但当时写的是公开 attestation “will go live soon”。Flashtestations 规范能证明的是**区块由经过远程证明、运行获准镜像的 TEE builder 产出**（块尾一笔 `verifyBlockBuilderProof` 交易）。规范明确写了合约无法在链上校验 blockContentHash，排序是否正确取决于“被度量的 builder 代码确实按优先费排序”，而且 TEE 不证明输入集完整（不能证明没有漏收交易）。因此“可验证优先排序”是**TEE 信任 + 代码度量**，不是对排序谓词的证明。

**依据**
- 博客（2025-05-02 发布）：“The TEE orders transactions based purely on priority fees. The system is designed to support public attestations, which will go live soon.” 另有：私有加密 mempool；revert protection 的做法是“pre-simulating transactions and not including ones that are expected to fail”；attestation “via an API operated by Flashbots – which will be live soon”[6]。
- 变更日志：“Live on Unichain: Fair Transaction Ordering and MEV Protection”，生效 2025-05-01；“Flashblocks 200ms Sub-Blocks”，生效 2025-08-14 [8]。
- Flashblocks 博客（2025-08-14）：“Each sub-block is sequenced inside TEEs … On Unichain, that ruleset is priority ordering”；“first chain to pair sub-second latency with provable ordering”[7]。
- Unichain 文档：1 秒出块，Flashblocks 提供约 200ms 预确认，是不改共识的协议外扩展。`eth_sendBundle` 只能放 1 笔交易，默认 10 块后过期，未列 `revertingTxHashes` 的回滚交易不收 gas [9]。
- Flashtestations 规范 “Block Builder TEE Proofs”：`ComputeBlockContentHash`（parentHash、number、timestamp、有序交易哈希）；`verifyBlockBuilderProof` 只检查 `isAllowedPolicy(msg.sender)`，原文注释 “we cannot validate the blockContentHash onchain. We rely on the TEE workload…”（specs/flashtestations.md:760-831）[5]。op-rbuilder 里有对应实现（flashtestations/builder_tx.rs:88-116, 262-280）[1]。

**不确定之处**：Flashbots 公开 attestation API 和链上 block proof 现在是否在 Unichain 主网运行，本路没查到一手证据（列入开放问题）。Unichain 生产环境跑的是否就是 op-rbuilder，没有官方说明。旁证是 op-rbuilder 测试框架里有 Unichain Sepolia 地址（tests/framework/utils.rs:164），以及 Mantle 迁移文档列出的测试名 `smoke_dynamic_unichain_flashblocks`，因此只记为 inferred。

## B-Q4 Mantle 的 op-rbuilder fork

**答案**：`mantle-xyz/op-rbuilder` 的 `main`@d89d5e7（2026-05-08）是上游的**纯镜像**：它是上游 4f1bec3 的祖先，最近 80 个提交的作者都是 Flashbots 开发者。Mantle 自己的改动在三个分支：`feat/mantle-arsia`、`feat/mantle-arsia-v0.2.14`、`op-rbuilder/v0.2.14-poc`。其中与交易选择相关的只有一处：在 `execute_best_transactions` 循环开头按 Mantle Jovian 的 `min_base_fee` 过滤 `max_fee_per_gas` 不足的交易。其余改动是依赖换成 mantle-arsia 系 reth / revm / op-alloy，以及 `TxDeposit` 新增的 `eth_value` / `eth_tx_value` 字段。**没有任何排序方面的改动**，fork 里也没找到 Mantle 专用的 Flashblocks 参数。

**依据**
- `git -C mantle-xyz-op-rbuilder log --format='%h %cs %an %s' | head -80`：作者为 Ash Kunda、Julio、shana 等，全部带上游 PR 号；`git -C op-rbuilder merge-base --is-ancestor d89d5e7 4f1bec3` 为真 [10]。
- `gh api repos/mantle-xyz/op-rbuilder`：fork=true，parent=flashbots/op-rbuilder，pushed 2026-05-15；分支见上 [10]。
- `d145b90516`（2026-05-14，feat/mantle-arsia）“enforce Mantle min_base_fee in tx selection”：在 context.rs 加 `min_base_fee()`，循环中 `!tx.is_bundle() && max_fee_per_gas < min_fee` 时 `mark_invalid` 并计数 `skipped_min_base_fee_count`[10]。
- `MANTLE_MIGRATION.md`（feat/mantle-arsia-v0.2.14）：只改了 3 个文件，起因是 TxDeposit 的 BVM_ETH 字段；112 个测试里 19 个失败，其中 6 个是 flashblocks 计时、3 个是 max_gas_per_txn、10 个是 flashtestations [10]。
- `c3643f8645`（2026-01-28，v0.2.14-poc）“flashblocks poc”：只改了 Cargo 依赖和 3 个源文件的少量行 [10]。

**不确定之处**：Mantle 生产或测试网是否已经跑 op-rbuilder 和 Flashblocks、出块时间和 flashblock 间隔分别是多少，留给 M 路。注意 `min_base_fee` 过滤**不检查 bundle**（`!tx.is_bundle()`），对 revert-protected 单笔 bundle 的含义未验证。

## B-Q5 Arbitrum Timeboost

**答案**：Timeboost 是“改良版 FCFS”。每轮默认 60 秒，用链下自治 auctioneer 运行**密封、二价**拍卖，选出下一轮的 express lane controller，链上 auction 合约结算。非 express 交易的到达时间被人为推迟 200ms，express lane 交易（经 `timeboost_sendExpressLaneTransaction`，需 controller 签名）立即排序。赢家得到的是**时间优势**：没有查看或重排他人交易的权利，也不保证排在块首。它是**全链级、按时间的优先权**，不区分应用。2025 年 4 月在 Arbitrum One 上线。重要的新变化：2026-06-03 提出的 Constitutional AIP 要在 Arbitrum One 关闭 Timeboost，改为 **PGA（按优先费排序，125ms 一轮，250ms 一块，加防饿死机制）**，Nova 上则直接停用 Timeboost。理由之一是 PropAMM 需要“便宜、高频、低延迟、按优先费”的报价更新。该提案已与 Fast Feed AIP 合并为一次链上投票，8–9 月多位代表公开投了赞成；截至 2026-10-11，执行状态未核实。

**依据**
- 官方文档“How Timeboost works”：60 秒一轮；200ms 人为延迟；sealed-bid second-price；`auctionClosingSeconds` 默认 15；最低保留价 0.001 WETH；controller “does not have the right to reorder transactions … guarantee … top-of-the-block”；“currently live on Arbitrum One and Arbitrum Nova”[11]。
- 文档“How to use Timeboost”：Arbitrum One auction 合约 `0x5fcb496a31b7AE91e7c9078Ec662bd7A55cd3079`，Nova 为 `0xa5aBADAF73DFcf5261C7f55420418736707Dc0db`[12]。FAQ：未部署、未启用或某轮没有 controller 时，回落为 FCFS [12]。
- Arbitrum 论坛 topic 30942（2026-06-03，正文最后更新 2026-09-08）：“Timeboost was launched on Arbitrum One in April 2025”；PGA 规则为“first sort transactions based on priority fee in 125ms PGA rounds before publishing a block at 250ms”，含 anti-starvation；收入 97% 归 DAO 财库、3% 归 Developer Guild；2026-08-17 更新写明与 Fast Feed AIP 合并为一次链上投票；第 25–30 楼（08-22 至 09-03）为投赞成的发言 [13]。

**不确定之处**：上线的具体日期（论坛只写 “April 2025”）；PGA 提案链上投票是否通过、是否已执行（Tally / 链上未查）。

## B-Q6 Flashbots PUR（Priority Update Registry）

**答案**：PUR 是一个全局共享合约。做市商或预言机把“本块有效”的状态写进固定布局的 lane：`updateState(target, laneIndex, updateTimestamp, slots)`，或由任何人代发签名批量写 `batchUpdateStateWithSignature`；目标合约用 `getState(laneIndex, minTs, maxTs)` 读取，时间窗不符就 revert。合约只强制三件事：授权、时间窗、时间戳单调。“更新插在第一笔读取它的用户交易之前”“没被读到的更新不上链”“只放最新的那条”都是 **builder 的行为约定**，合约强制不了；README 的 threat model 也直说 “The contract trusts the builder to insert the most recent update it received”。它相当于 EVM 上由 builder 强制的 maker / oracle 更新优先（一种 cancel priority），作用范围是“某个 target 的 lane 状态”，组合性代价是同块原子。主网部署地址 `0xda7afeed021eafc1c1af9c362de477dad0396b81`（MAX_UPDATE_AGE = MAX_UPDATE_LEAD_TIME = 0，即只接受 `updateTimestamp == block.timestamp`）。ERC-8324 草案（ethereum/ERCs PR #1852）仍为 open。op-rbuilder 和 rollup-boost 里**没有** PUR 集成。

**依据**
- README @8701e8e：Motivation（“Updates that are not used in the block do not land onchain”）、Contract Interface、Storage Layout（slot0 = 时间戳 32 位 | 槽数 8 位 | 数据 216 位，lane 基址 = keccak256(abi.encode(keccak256("PrioUpdateRegistry.lane"), target, laneIndex))）、Threat Model、Gas Costs（直接 `updateState` = 21000 + 9698 + k×5212）、Block Builder Integration 三步、Deployments [14]。
- 代码：`getState` 读的是 `msg.sender` 自己的 lane，时间戳不在窗口内时 `revert StaleUpdate()`（src/PrioUpdateRegistry.sol:90-113）；`_writeState` 检查 `ts + MAX_UPDATE_AGE < block.timestamp`、`ts > block.timestamp + MAX_UPDATE_LEAD_TIME`、存储的时间戳更新时 revert（:136-176）；`updateState` 检查 `isUpdater[target][msg.sender]`（:179-182）[14]。
- 示例 PropAMM 只读 `[now − maxParameterAge, now]` 窗口内的参数（src/ExamplePropAmm.sol:394-404）[14]。
- `gh pr view 1852 -R ethereum/ERCs`：标题 “Add ERC: Priority Update Registry”，OPEN，创建于 2026-07-03，更新于 2026-09-15，标签 s-draft，文件 `ERCS/erc-8324.md`[15]。
- `eth_getCode(0xda7afeed021e…, latest)` 返回 4085 字节（publicnode RPC，2026-10-11）[16]。
- `rg -i "prio_?update|PrioUpdateRegistry|priority.update"` 在 op-rbuilder 与 rollup-boost crates 中零命中 [1][3]。

**不确定之处**：以太坊上实际有哪些 builder 实现了 PUR 插入、主网有没有真实流量，本路未查。

## B-Q7 BSC BAP-710 PropAMM relayer

**答案**：BAP-710（Application 类，Draft，Created 2026-09-03）在链上用的 registry 是 PUR 的改版：同名接口，保留 lane 布局，时间戳改为严格递增的 48 位 seq，registry 不检查过期，签名移到 decoder。链下增加一个 **builder 中立的 relayer**：maker 用 `pamm_sendQuoteUpdateV1` 把报价发给 relayer；taker 照常 `eth_sendRawTransaction`；relayer 模拟出 taker 的 read-set，与报价的 write-set 求交集，组装成 `[匹配的报价…, taker]` 原子 bundle，再广播给多个 builder，失败就回落公共交易池。这样 builder 只需是通用的原子 bundle 执行器，**不必写 PropAMM 代码**；而 PUR 模型要求每个 builder 自己维护未上链更新、自己插入。在单一 sequencer 的 L2 上（如 Mantle），“多 builder 分发”和“builder 中立”两个理由都不成立，插入逻辑可以直接放进 sequencer 的 builder（PUR 模型）。但 relayer 的另一项功能，即给 taker 的 `eth_call` 提供“链上状态 + 未上链报价”的叠加视图，仍需由 sequencer 的 RPC 提供（推论）。

**依据**
- BAP-710.md 头部、§1–§2、§4.5.2 第 1–7 步、§5.1 “Builder neutrality”、§5.2 “Builder-side PropAMM protocol. Rejected”、“Expiry and signatures inside the registry. Not adopted … An earlier registry draft verified maker signatures itself (`batchUpdateStateWithSignature`)”、§8.2 Relayer Trust、§8.4（@e9b2be3b00）[17]。
- 与 PUR 的同构关系，以及 J51–J57 的结论，均来自上述两份一手文本 [14][17]。

**不确定之处**：是否已有 relayer 在运营、有哪些 builder 接入，未知。BAP-710 正文没有提到 Flashbots 或 PUR。

## B-Q8 Pyth Express Relay

**答案**：机制是链下拍卖加链上许可。只有 relayer 能调用 `ExpressRelay.multicall(permissionKey, …)`：调用前置 `permissions[keccak(permissionKey)] = true`，再逐个调用中标 searcher 的操作，结束后复位，并把出价按比例分给协议（permissionKey 前 20 字节就是协议的 fee receiver）和 relayer。协议在被保护函数（如清算）里调用 `isPermissioned(protocolFeeReceiver, permissionId)`，只有在中标者的调用过程中才返回 true。规则由**合约入口**强制，违规调用直接回滚，执行权和结算在同一笔交易内完成。**状态：已停运。** 2026 年 7 月 Pyth 治理通过 OP-PIP-124 “Express Relay Wind-Down”，拍卖服务、SDK 与链上合约正在退役；仓库早在 2025-04-11 就删掉了 EVM 合约（468ec0a），最后一次提交 2026-04-27 只涉及 SVM。

**依据**
- `sdk/solidity/IExpressRelay.sol`（468ec0a^）：`isPermissioned` 的注释与签名 [18]。
- `contracts/evm/src/express-relay/ExpressRelay.sol:51-121`（468ec0a^）：`onlyRelayer`、置位 / 复位 permission、fee 分配 [18]。
- `git log --format='%h %cs %s' -- contracts/evm`：468ec0a 2025-04-11 “Remove evm contracts (#503)”[18]。
- docs.pyth.network/express-relay（.md）：“In July 2026, Pyth governance passed OP-PIP-124 … the auction service, SDKs …, and on-chain ExpressRelay contracts are being retired.”[19]

**不确定之处**：EVM 链上合约的实际停用日期，以及有哪些协议曾在 EVM 上集成。

## B-Q9 Chainlink SVR

**答案**：SVR 用“双聚合器”回收预言机更新带来的清算 OEV。DON 同时走两条路：公开路径更新标准 feed；私有路径把同一份报告送进拍卖，由 searcher 出价，争取在更新后紧跟着清算（backrun）。私有路径失败时，SVR feed 在可配置的延迟后回落到标准 feed 的价格。**Ethereum** 上走 builder / OFA 路径：Flashbots MEV-Share，现在与 Titan OFA 并行。**Base、Arbitrum、BNB Chain、Monad** 上走 **Atlas v1.6.4**：预言机更新和清算都写成 EIP-712 消息，拼进**同一笔原子交易**，由 Chainlink 预言机网络提交，“without requiring block builders”；searcher 需要 bond 原生代币，每笔交易最多放 2 个 searcher 出价（分高 / 低信誉两组）。已支持 Aave、Compound、Venus（Atlas 路径）。Base 和 Ink 上部分 feed 默认启用 SVR。

**依据**
- SVR 文档：How SVR Works（1a/1b/2/3a/3b/4）、Fail-Safe Fallback、SVR Feed Variants（Shared / Aave / Backup）、Default SVR Activation（Base、Ink）、Searcher Guides 表（Ethereum = Flashbots MEV-Share；Base / Arbitrum / BNB / Monad = Atlas）、顶部公告 “SVR integrated with Titan OFA”[20]。
- Atlas 接入文档：“Atlas is conceptually similar to MEV-Share, built to work on any EVM chain without requiring block builders”；最终交易由预言机网络提交；`gasPrice` 必须等于预言机给定的值；`SolverGasLimit`；“up to 2 searcher bids per transaction”；Supported Protocols 为 AAVE / Compound / Venus；合约版本 v1.6.4 [21]。

**不确定之处**：各链上的具体合约地址（页面表格未渲染出来）；Ethereum 上 Aave 的启用日期。Mantle 不在支持列表。

---

## 对比表素材

| 实现 | 控制范围 | 强制力来源 | 组合性代价 | 违规后果 | 状态 |
|---|---|---|---|---|---|
| op-rbuilder（默认） | 全块，按 flashblock 分段；小费优先、同价 FIFO | sequencer / builder 代码（链下运营承诺） | 同块原子，后到的交易只能进后续 flashblock | 无链上后果（只损声誉）；用户无法证明违规 | 主网（Base、Unichain 等 OP 链使用，见开放问题） |
| op-rbuilder revert protection / sendBundle | 单笔交易：要么成功，要么不上链 | builder | 同块；指定区块 / flashblock 窗口 | 无 | 已实现，默认关闭；Unichain 已启用 |
| rollup-boost | 选 builder 区块还是本地区块 | sequencer 侧 sidecar；只校验 EVM 有效性 | 不影响 | builder 区块无效时回退本地块，排序违规**不检测** | 主网（v0.7.17） |
| Unichain TEE + Flashtestations | 全块优先排序（每 200ms flashblock） | TEE 远程证明 + 被度量的 builder 代码；链上只记录“谁建的块” | 同块 | 理论上可追责到镜像；链上不判区块无效 | 主网（TEE 2025-05-01，Flashblocks 2025-08-14）；公开 attestation 状态未核实 |
| Arbitrum Timeboost | 全链的时间优先（express lane 少等 200ms） | sequencer 规则 + 链上 auction 合约结算 | 同块 | 只损声誉；sequencer 受信任 | 主网（2025-04 起）；PGA 替换提案在投票 / 执行中 |
| Arbitrum PGA（提案） | 全链：125ms 一轮按优先费排，加防饿死 | sequencer | 同块 | 只损声誉 | 提案（已进入链上投票，执行未核实） |
| Flashbots PUR | 某 target 的 lane 状态：更新排在第一个读者之前 | builder 自愿实现，合约只管授权和时间窗 | 同块原子 | 合约层：过期读取 revert；不插入、插旧值只是 builder 失职 | 主网合约已部署；ERC-8324 草案 |
| BSC BAP-710 | PropAMM 报价 + taker 交易打成原子 bundle | 链下 relayer + builder 的 bundle 原子性 + 合约读取校验 | 同块原子 | 未匹配就回落交易池，taker 交易因无报价而 revert | 提案（Draft） |
| Pyth Express Relay | 某个协议的某类操作（清算）的执行权 | 合约入口 `isPermissioned` + 链下拍卖 | 同一笔交易 | 未获许可的调用 revert | 已停运（OP-PIP-124，2026-07） |
| Chainlink SVR（Ethereum） | 预言机更新后的第一个 backrun 机会 | 私有传输 + OFA / builder | 同块 bundle | 私有路径失败时延迟回落标准 feed | 主网 |
| Chainlink SVR（Atlas 链） | 同上 | 合约：更新和清算在同一笔 Atlas 交易里 | 同一笔交易 | 不中标就不执行；fallback feed | 主网（Base / Arbitrum / BNB / Monad） |

## 代码片段

1. **op-rbuilder 逐笔选择循环**（主循环和所有过滤点）：`op-rbuilder/crates/op-rbuilder/src/builder/context.rs:392-463@4f1bec3`。建议截取 `while let Some(tx) = best_txs.next(())` 到 `is_debt_free` 一段（约 30 行，去掉日志）。说明 builder 按交易池给出的顺序逐笔执行；放不下就 `mark_invalid` 跳过同 sender 的后续交易；地址限流也在这里。Mantle 的 `min_base_fee` 过滤正插在这个循环开头，因此这里就是放应用级策略的位置。
2. **排序本身**：`reth/patches/reth-transaction-pool/src/ordering.rs:61-86@f022de0f62`（`CoinbaseTipOrdering::priority` → `effective_tip_per_gas`），配合 `pool/pending.rs:649-657`（同价按 `submission_id` 先到先出）。约 25 行，说明“小费优先、同价 FIFO”。
3. **每个 flashblock 重新取 best 迭代器**：`builder/candidate.rs:210-237@4f1bec3`。说明排序窗口等于 flashblock。
4. **flashblock 累计 gas 预算**：`builder/payload.rs:735-760` 与 `:242@4f1bec3`。说明 gas 均分且累计；Mantle 若做分类别预算，可以从这里扩展。
5. **Mantle 的 min_base_fee 过滤**：mantle-xyz/op-rbuilder commit `d145b90516` 中的 `crates/op-rbuilder/src/builder/context.rs` hunk `@@ -479,7 +488,36 @@`（约 25 行）。这是 Mantle 已经在 builder 选择循环里加规则的实例。
6. **rollup-boost 校验与选择**：`rollup-boost/crates/rollup-boost/src/server.rs:380-401` 与 `:451-461@87589f8`。说明它只校验 `newPayload` 有效性，没有排序检查。
7. **Flashtestations 块证明**：`rollup-boost/specs/flashtestations.md:808-831@87589f8`（`verifyBlockBuilderProof`，含 “cannot validate the blockContentHash onchain” 注释）。说明 TEE 证明的是“谁建的块”，不是“块排得对”。
8. **PUR 接口**：`priority-update-registry/src/PrioUpdateRegistry.sol:90-113`（getState）与 `:136-182`（_writeState / updateState）@8701e8e；再配 `src/ExamplePropAmm.sol:394-404` 展示读者如何指定时间窗。
9. **Express Relay 许可检查**：`per/sdk/solidity/IExpressRelay.sol:1-14@468ec0a^` 与 `per/contracts/evm/src/express-relay/ExpressRelay.sol:51-66,118-121@468ec0a^`（置位、执行、复位）。说明“合约入口拿到执行权”的最小形式（注：该产品已停运）。

## 图的素材

**图 A：OP Stack + rollup-boost + op-rbuilder 出块流程（含 Flashblocks）**
- 参与者：op-node（sequencer）→ rollup-boost → ①本地 EL（op-geth / op-reth，作 fallback） ②外部 builder（op-rbuilder，可在 TEE 内）；op-rbuilder 内部有交易池（CoinbaseTipOrdering）；flashblock 通过 WebSocket 发给 RPC 提供方 / 用户。
- 步骤：1）FCU(attrs) 同时发给本地 EL 和 builder；2）builder 先执行 deposit 等 sequencer 交易，产出 fallback（flashblock 0）；3）每 200 / 250ms：重新取 best 迭代器，在累计 gas 预算内逐笔执行（过滤：限额 / conditional / 地址限流 / revert protection），产出 flashblock i，推送预确认；4）getPayload 时 rollup-boost 并行取两边区块，用本地 EL 的 newPayload 校验 builder 区块；5）分支：有效 → 用 builder 区块（可选 GasUsed 规则：低于 10% 时改用本地块）；无效、超时或出错 → 用本地块；DryRun → 用本地块；6）可选：块尾加 TEE 签名的 `verifyBlockBuilderProof` 交易。
- 标注：“校验 = EVM 有效性，≠ 排序合规”。

**图 B：PUR 交易流程**
- 参与者：做市商（updater）、taker、builder（维护“未上链更新池”）、PUR 合约、PropAMM 合约。
- 步骤：1）做市商每块持续向 builder 专用端点推送签名更新，新的替换旧的；2）taker 交易进 builder；3）builder 执行 taker 交易前，若它会读 PropAMM 的 lane，就先插入该 lane 最新的更新交易；4）PropAMM 调 `getState(lane, now − age, now)`，过期则 revert；5）本块没被读到的更新丢弃，不上链。
- 分支：builder 不支持 PUR，taker 读到旧值或 revert；builder 插入旧更新，合约只要时间戳在窗口内就分辨不出。

**图 C：BAP-710 与 PUR 的对照**（同一张图分左右两栏）
- 左：PUR，插入逻辑在每个 builder 里。右：BAP-710，maker → relayer（overlay 模拟，read / write 集匹配）→ `[quotes…, taker]` bundle → 多个 builder；失败回落交易池。

**图 D：Timeboost 与 PGA 的时间线**
- Timeboost：上一轮拍卖（45 秒出价 + 15 秒结算）→ 本轮 60 秒内 controller 的交易立即排序，其他交易 +200ms。
- PGA（提案）：每 125ms 一轮，轮内按优先费排序；每 250ms 一块；低费交易几轮后由防饿死机制保证纳入。

**图 E：SVR 两条路径**
- Ethereum：DON → 公开 mempool（标准 feed）+ 私有通道（MEV-Share / Titan）→ searcher 出价 → builder 把“更新 + 清算”打成 bundle → 同块执行；超时则在延迟后回落标准价。
- Atlas 链：DON 把更新签成 EIP-712 op → Atlas 拍卖（每笔最多 2 个 solver op）→ 预言机网络提交一笔 Atlas 交易（更新 → 清算）→ sequencer 正常收录。

## 对 Mantle 的启示（均为推论）

1. **插入点很清楚**：op-rbuilder 的 `execute_best_transactions` 循环和 `PayloadTxsBounds` 迭代器是唯一的交易选择入口。Mantle 自己的 `min_base_fee` 过滤已经在这里落了地（d145b90516）。分类别调度可以做成“多子池 + 按类别预算合并的 cursor”，替换 `FlashblockPoolTxCursor`。如果要改池内排序，就得替换 `OpTransactionPool` 类型别名里写死的 `CoinbaseTipOrdering`，不能只改一个参数。
2. **Flashblocks 天然就是“轮”**：每个 flashblock 都重新取迭代器、按累计 gas 预算出块，正好可以做 BAM 式的 phase-first：每轮开头先放 maker / oracle 更新，再放普通交易。也可以把 `gas_per_batch` 扩展为按类别的预算（payment 保留额度、可借用）。代价是：排序保证只在 200–250ms 窗口内成立；大交易在前几个 flashblock 放不下（规范已指出这一点）。
3. **按地址的 gas / 计算时间令牌桶已经存在**（默认关闭），可以直接用作 payment 或 launchpad 的发送方配额和反垃圾手段。被拒的模拟同样消耗额度，这一点对付“伪装支付”的刷量很有用。
4. **rollup-boost 不检查排序，回退会静默降级**：要做应用级排序，需要在 rollup-boost 选块前加一个“排序谓词检查”（它手里已有完整 payload），并且让 fallback EL 实现同样的策略，否则就要暂停受保护的操作。不能把“回落本地块”当作安全降级。
5. **TEE 证明的是“谁建的块”**：Mantle 如果宣传“可验证排序”，需要额外公开候选集或接收回执，并给出排序谓词，否则只是 TEE 信任。
6. **PUR 适合单 sequencer**：BAP-710 的 relayer 是为多 builder 设计的；Mantle 只有一个 builder，可以直接在 op-rbuilder 里实现 PUR 插入（“更新排在第一个读者之前，未读的丢弃”），再由 RPC 给 taker 提供 pending overlay（Flashblocks 的 pending 状态是现成载体）。合约可以照搬 PUR（ERC-8324 草案），也可以用 BAP-710 的 seq 版本。
7. **Arbitrum 的转向是直接证据**：全链级的“时间拍卖”没能吸引 PropAMM，Arbitrum 正在转向“短轮次内按优先费排序 + 防饿死”。这说明 DeFi 内层用小费优先、外层用纳入保证的组合有现实需求。防饿死机制可以作为 payment 纳入保证的参照。
8. **Atlas 路径不需要 builder 配合**：SVR 在 L2 上靠单笔原子交易实现“更新后第一个清算”，不依赖 sequencer 排序。Mantle 想要清算 OEV 回收，可以先部署 Atlas、争取 SVR 支持，不必改 sequencer。Pyth Express Relay 已停运，不再作为候选。

## 外部调研的修正

1. **Pyth Express Relay 被当作现行选项**（§2 表格、§2.4、“最终建议”表）：错误或过时。2026 年 7 月 OP-PIP-124 已决定停运，合约和 SDK 在退役 [19]；EVM 合约 2025-04-11 已从仓库删除 [18]。
2. **Arbitrum Timeboost 被描述为现行机制，没提替换**：不完整。2026-06-03 起有 Constitutional AIP 要关闭 Timeboost、改用 PGA（125ms 轮次 + 防饿死），已并入一次链上投票，多位代表投了赞成 [13]。文档仍写“currently live”[11]，执行状态需要再核。
3. **“Unichain：TEE builder、优先排序……”被写成已可验证**：需要限定。2025-05 官方写的是公开 attestation “will go live soon”[6]；Flashtestations 只证明块由获准的 TEE 镜像产出，合约 “cannot validate the blockContentHash onchain”[5]。“可验证优先排序”依赖 TEE 信任，不是排序证明。
4. **Rollup-Boost “通过执行客户端验证外部 payload；验证失败时回退”**：正确但不完整。还有可选的 GasUsed 选块规则（<10%）、DryRun 模式；`external_state_root` 模式下不调 newPayload [3]。外部调研说“EVM 有效 ≠ 遵守排序”是对的，代码里确实没有排序检查 [3]。
5. **Chainlink SVR“Ethereum 走 OFA、其他 EVM 走 Atlas”**：正确。需要补充：Ethereum 现已同时接入 Flashbots 与 Titan；Atlas 链为 Base / Arbitrum / BNB / Monad；Base 和 Ink 默认启用；Atlas 路径支持 Aave、Compound、Venus [20][21]。
6. **本路任务前提“Flashblocks 把 2 秒区块切成 200ms”**：不准确。Unichain 是 1 秒区块 + 200ms flashblock [9]；规范默认 200ms，例子用的是 2s/200ms [4]；op-rbuilder CLI 默认 1000ms 区块、250ms flashblock [1]。
7. **外部调研未提**：op-rbuilder 的排序来自 reth 交易池（小费优先、同价 FIFO），每个 flashblock 重新排一次；Mantle 的 op-rbuilder fork 只有 `min_base_fee` 过滤，没有排序改动 [1][2][10]。

## 来源

1. **PRIMARY** flashbots/op-rbuilder @4f1bec3（2026-09-24）：builder/context.rs、best_txs.rs、candidate.rs、payload.rs、config.rs、args/op.rs、limiter/args.rs、backrun_bundle/args.rs、primitives/bundle.rs、flashtestations/builder_tx.rs、docs/eth_sendBundle.md、docs/flashblocks.md。证明选择循环、flashblock 分段、预算、限流、revert protection、默认参数。
2. **PRIMARY** mantle-xyz/reth @f022de0f62：patches/reth-transaction-pool/src/ordering.rs、pool/pending.rs、op-reth/crates/txpool/src/lib.rs。证明交易池按有效小费排序、同价 FIFO，且 OpTransactionPool 写死 CoinbaseTipOrdering。
3. **PRIMARY** flashbots/rollup-boost @87589f8（2026-07-16）：README、crates/rollup-boost/src/server.rs、selection.rs。证明 sidecar 流程、校验和回退，没有排序检查。
4. **PRIMARY** rollup-boost/specs/flashblocks.md @87589f8。证明 200ms 默认值、线性 gas 分配、交易选择由 builder 自定。
5. **PRIMARY** rollup-boost/specs/flashtestations.md @87589f8 §Block Builder TEE Proofs。证明 TEE 块证明的内容和局限。
6. **PRIMARY** Uniswap Labs 博客 “Live on Unichain: Fair Transaction Ordering and MEV Protection”，https://blog.uniswap.org/rollup-boost-is-live-on-unichain （发布于 2025-05-02，访问于 2026-10-11）。证明官方对优先排序、私有 mempool、revert protection 的描述，以及 attestation 当时尚未上线。
7. **PRIMARY** Uniswap Labs 博客 “Flashblocks are live”，https://blog.uniswap.org/flashblocks-are-live （2025-08-14）。证明 200ms 子块在 TEE 内按优先费排序的说法。
8. **PRIMARY** Uniswap Developers 变更日志：…/live-on-unichain-fair-transaction-ordering-and-mev-protection.md、…/live-on-unichain-flashblocks-200ms-sub-blocks.md。证明生效日期 2025-05-01 与 2025-08-14。
9. **PRIMARY** Unichain 文档（developers.uniswap.org/docs/unichain，及 technical-information/advanced-txn.md）。证明 1 秒区块 + 200ms 预确认，以及 sendBundle 只能放单笔交易、revert protection 的语义。
10. **PRIMARY** mantle-xyz/op-rbuilder @d89d5e7 本地 clone；`gh api repos/mantle-xyz/op-rbuilder`（含 branches、commits/d145b90516、c3643f8645）；`MANTLE_MIGRATION.md@feat/mantle-arsia-v0.2.14`。证明 main 是上游镜像，Mantle 只在分支里改了 min_base_fee 和依赖。
11. **PRIMARY** Arbitrum 文档 “How Timeboost works”，https://docs.arbitrum.io/how-arbitrum-works/timeboost/gentle-introduction 。证明 60 秒轮次、200ms 延迟、密封二价拍卖、无重排权、目前上线于 One 和 Nova。
12. **PRIMARY** Arbitrum 文档 how-to-use-timeboost.md、timeboost-faq.md。证明 auction 合约地址，以及缺少 controller 时回落 FCFS。
13. **PRIMARY** Arbitrum 论坛 topic 30942 “[Constitutional] AIP: Transition Arbitrum One ordering policy to Priority Gas Auctions (PGA)”，https://forum.arbitrum.foundation/t/30942 。证明 Timeboost 2025 年 4 月上线，以及 PGA 替换提案的内容和进度。
14. **PRIMARY** flashbots/priority-update-registry @8701e8e：README、src/PrioUpdateRegistry.sol、src/ExamplePropAmm.sol。证明 PUR 接口、存储布局、threat model、builder 集成约定、部署地址。
15. **PRIMARY** ethereum/ERCs PR #1852（`gh pr view`）。证明 ERC-8324 仍为 open 的草案。
16. **PRIMARY** `eth_getCode 0xda7afeed021eafc1c1af9c362de477dad0396b81 latest`（ethereum-rpc.publicnode.com，2026-10-11）。证明主网上有 4085 字节的代码。
17. **PRIMARY** bnb-chain/BEPs @e9b2be3b00 BAPs/BAP-710.md。证明 relayer 架构、与 PUR 的差异和设计理由。
18. **PRIMARY** pyth-network/per @f816a9e，以及 468ec0a^ 中的 IExpressRelay.sol、ExpressRelay.sol。证明 permission 机制，以及 EVM 合约已删除。
19. **PRIMARY** Pyth 文档 https://docs.pyth.network/express-relay(.md)。证明 OP-PIP-124 已决定停运。
20. **PRIMARY** Chainlink 文档 https://docs.chain.link/data-feeds/svr-feeds 。证明 SVR 机制、两条路径、默认启用的链、fallback。
21. **PRIMARY** Chainlink 文档 https://docs.chain.link/data-feeds/svr-feeds/searcher-onboarding-atlas.md 。证明 Atlas 路径的单笔原子交易、支持的协议和链、v1.6.4。
22. **PRIMARY** ethresear.ch 23977（含第 3 楼），https://ethresear.ch/t/23977.json 。证明 ACE / PEPC 背景，以及 Prop AMM“经济型 cancel priority”的原话出处。
23. 线索（非一手）：research-hub bsc-recent-development/research/notes-jenner.md 与 ledger J51–J57。本文引用的结论均已回到 [14][17] 原文核对。

## 开放问题

1. Unichain 的 Flashbots 公开 attestation API 和链上 `verifyBlockBuilderProof` 现在是否在主网运行？有没有第三方真的核验过排序？
2. Arbitrum PGA / Fast Feed 合并 AIP 的链上投票结果和执行日期；Timeboost 在 Arbitrum One 上是否已关闭。
3. 以太坊上有哪些 builder 实现了 PUR 插入，主网 registry 的调用量是多少。
4. Mantle 现网 / 测试网是否运行 op-rbuilder + rollup-boost，出块时间和 flashblock 间隔是多少，是否启用 revert protection 或地址限流（交给 M 路）。
5. Flashblocks 模式下 rollup-boost 对拼装后的最终 payload 的校验路径。
6. BAP-710 relayer 是否有运营方，BSC builder 的接入情况。
7. Chainlink SVR 是否计划支持 Mantle（Atlas 是否部署在 Mantle）。

---

## 台账

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| B1 | op-rbuilder 使用的交易池类型是 `OpTransactionPool`，其排序固定为 `CoinbaseTipOrdering` | op-rbuilder/crates/op-rbuilder/src/pool/builder.rs:81@4f1bec3；reth/op-reth/crates/txpool/src/lib.rs:33-37@f022de0f62 | observed |
| B2 | `CoinbaseTipOrdering` 的优先级等于有效小费 `effective_tip_per_gas(base_fee)`；同优先级按 `submission_id` 早者在前 | reth/patches/reth-transaction-pool/src/ordering.rs:61-86、pool/pending.rs:649-657@f022de0f62 | observed |
| B3 | op-rbuilder 的默认排序是“小费优先、同价 FIFO”，不是 FCFS | 由 B1、B2 推出：池类型固定 + 排序函数 | inferred |
| B4 | 每个 flashblock 都重新从池取 best 迭代器，并跳过已提交 / 已排除的交易 | builder/candidate.rs:210-219、builder/best_txs.rs:94-136@4f1bec3 | observed |
| B5 | 每个 flashblock 的 gas 预算 = block_gas_limit / flashblock 数，目标逐块累加 | builder/payload.rs:735、:242@4f1bec3 | observed |
| B6 | 优先排序只在单个 flashblock 的候选集内成立；已发布的 flashblock 不会被后到的高小费交易越过 | 由 B4、B5 推出 | inferred |
| B7 | op-rbuilder CLI 默认 chain block time 1000ms、flashblock 间隔 250ms；规范默认 FLASHBLOCKS_TIME 200ms，例子为 2s/200ms=10 | args/op.rs:35-40,214-219@4f1bec3；rollup-boost/specs/flashblocks.md:105-106@87589f8 | observed |
| B8 | 选择循环依次做 conditional 检查、gas / DA / 大小限额、拒绝 blob 与 deposit、地址限流，执行后若超过 max_gas_per_txn 或 revert-protected 交易回滚则不提交 | builder/context.rs:392-505@4f1bec3 | observed |
| B9 | 地址 gas 限流默认关闭，每地址桶 10,000,000 gas、每块回填 1,000,000；计算时间限流桶 50ms、每块回填 10ms；被拒的模拟也计入额度 | limiter/args.rs:4-56；context.rs “Declined simulations still consume sender budget”@4f1bec3 | observed |
| B10 | `eth_sendBundle` 只接受 1 笔交易，区块范围最多 10 块，可指定 flashblock 范围；仅在 `--builder.enable-revert-protection`（默认 false）开启时提供 | docs/eth_sendBundle.md；primitives/bundle.rs:12,33-111；args/op.rs:68-69@4f1bec3 | observed |
| B11 | backrun bundle 默认关闭；strict 模式要求 backrun 的优先费等于目标交易 | backrun_bundle/args.rs:1-23；builder/context.rs:687-732@4f1bec3 | observed |
| B12 | rollup-boost 用本地 EL 的 `engine_newPayload` 校验 builder 区块，无效时回退本地区块 | rollup-boost/crates/rollup-boost/src/server.rs:380-401@87589f8；README “Core System Workflow” | observed |
| B13 | rollup-boost 可选 GasUsed 策略：builder 区块 gas 低于本地块 10% 时选本地块；DryRun 模式总是用本地块 | selection.rs:4-14；server.rs:451-461@87589f8 | observed |
| B14 | rollup-boost 源码中没有任何交易排序规则检查 | `rg -n -i "priority\|tip\|sort\|ordering" crates --type rust` 只命中原子 Ordering 与 service.rs:298 flashblock 按 index 排序@87589f8 | observed |
| B15 | rollup-boost 回退到本地块时，链上无法区分，应用级排序会被静默取消 | 由 B12、B14 推出 | inferred |
| B16 | Unichain 自 2025-05-01 在 TEE 内建块，官方称“纯按优先费排序”，并提供私有加密 mempool 与 revert protection | blog.uniswap.org/rollup-boost-is-live-on-unichain 正文 “What this means”；Uniswap Developers 变更日志 “Effective: May 1, 2025” | observed |
| B17 | 2025-05 官方写明公开 attestation 与 Flashbots attestation API “will go live soon” | 同上博客 “Fair transaction ordering”“How it works” 两段 | observed |
| B18 | Unichain 自 2025-08-14 上线 200ms Flashblocks，主链出块 1 秒，官方称每个子块在 TEE 内按优先费排序（“provable ordering”） | blog.uniswap.org/flashblocks-are-live；变更日志 “Effective: August 14, 2025”；developers.uniswap.org/docs/unichain FAQ | observed |
| B19 | Flashtestations 的块证明只检查调用者是否是获准 TEE 策略；规范注明合约无法在链上校验 blockContentHash | rollup-boost/specs/flashtestations.md:760-831@87589f8 | observed |
| B20 | Unichain 的“可验证优先排序”是 TEE 信任 + 代码度量，不是排序谓词证明，也不证明输入集完整 | 由 B17、B19 推出 | inferred |
| B21 | mantle-xyz/op-rbuilder 的 main@d89d5e7 是上游 flashbots/op-rbuilder 的祖先提交，没有 Mantle 专属提交 | `git -C op-rbuilder merge-base --is-ancestor d89d5e7 4f1bec3` 为真；`git log` 前 80 条作者均为上游开发者 | observed |
| B22 | Mantle 分支 feat/mantle-arsia 的 d145b90516（2026-05-14）在选择循环中过滤 `max_fee_per_gas < min_base_fee` 的非 bundle 交易 | `gh api repos/mantle-xyz/op-rbuilder/commits/d145b90516`（context.rs hunk +38） | observed |
| B23 | Mantle 的 op-rbuilder fork 没有排序相关改动；源码改动限于 min_base_fee 和 TxDeposit 的 eth_value / eth_tx_value | MANTLE_MIGRATION.md@feat/mantle-arsia-v0.2.14 “Source code changes”“Implemented”；d145b90516、c3643f8645 文件列表 | observed |
| B24 | Mantle 迁移分支有 19/112 个测试失败，包括 6 个 flashblocks 计时和 10 个 flashtestations | MANTLE_MIGRATION.md “Known test failures”@feat/mantle-arsia-v0.2.14 | observed |
| B25 | Timeboost 每轮默认 60 秒，密封二价拍卖，非 express 交易延迟 200ms，竞拍截止在轮开始前 15 秒，最低保留价 0.001 WETH | docs.arbitrum.io …/timeboost/gentle-introduction “How does it work?”“The Timeboost auction”“Auction contract” | observed |
| B26 | express lane controller 无权重排交易，也不保证排在块首；Timeboost 是全链级时间优先，不区分应用 | 同上 “The express lane” 一节；全链适用由文档定义推出 | observed |
| B27 | Timeboost 于 2025 年 4 月在 Arbitrum One 上线；Arbitrum One auction 合约为 0x5fcb496a31b7AE91e7c9078Ec662bd7A55cd3079 | forum.arbitrum.foundation/t/30942 首帖 Motivation；docs.arbitrum.io …/how-to-use-timeboost.md 地址表 | observed |
| B28 | 2026-06-03 的 Constitutional AIP 提议在 Arbitrum One 以 PGA（125ms 轮次、250ms 区块、防饿死）替换 Timeboost，并停用 Nova 上的 Timeboost；理由包括 PropAMM 需要低价、高频、按优先费的纳入 | forum.arbitrum.foundation/t/30942 首帖 Abstract / Motivation | observed |
| B29 | 该 AIP 已与 Fast Feed AIP 合并为一次链上投票，2026-08 至 09 有多位代表公开投赞成；执行状态未核实 | 同帖 “UPDATE 17 August, 2026”；第 25–30 楼 | observed |
| B30 | PUR 合约只强制授权、时间窗、时间戳单调；“更新排在第一个读者之前、未读的不上链”由 builder 自愿实现 | priority-update-registry/src/PrioUpdateRegistry.sol:136-182@8701e8e；README “Threat Model”“Block Builder Integration” | observed |
| B31 | PUR `getState` 只读 `msg.sender` 自己的 lane，时间戳不在 [min,max] 窗口内时 revert StaleUpdate | src/PrioUpdateRegistry.sol:90-113@8701e8e | observed |
| B32 | PUR 主网地址 0xda7afeed021eafc1c1af9c362de477dad0396b81，构造参数 MAX_UPDATE_AGE = MAX_UPDATE_LEAD_TIME = 0，链上代码 4085 字节 | README “Deployments”@8701e8e；eth_getCode（publicnode，2026-10-11） | observed |
| B33 | PUR 直接 updateState 的 gas = 21000 + 9698 + k×5212；批量签名写约 2 笔起才比逐笔划算 | README “Gas Costs”@8701e8e | observed |
| B34 | ERC-8324（PR #1852）为 open 状态，标签 s-draft，创建于 2026-07-03，最后更新 2026-09-15 | `gh pr view 1852 -R ethereum/ERCs --json …` | observed |
| B35 | op-rbuilder 与 rollup-boost 中没有 PUR 集成代码 | `rg -l -i "prio_?update\|PrioUpdateRegistry\|priority.update"` 在两仓库 crates 中零命中 | observed |
| B36 | BAP-710 relayer 按“报价 write-set ∩ taker read-set”匹配，组装 [报价…, taker] 原子 bundle 发给多个 builder，失败回落交易池；builder 不需要写 PropAMM 代码 | BAPs/BAP-710.md §4.5.2、§5.1@e9b2be3b00 | observed |
| B37 | BAP-710 明确拒绝“builder 端 PropAMM 协议”，并说明早期 registry 草案用过 `batchUpdateStateWithSignature`（即 PUR 的接口名） | BAP-710.md §5.2@e9b2be3b00；PUR README “Writing Priority Updates” | observed |
| B38 | 单一 sequencer 的 L2 不需要 BAP-710 式多 builder relayer，可以把 PUR 插入放进自己的 builder；但仍需要 RPC 给 taker 提供未上链报价的叠加视图 | 由 B30、B36、B37 推出：relayer 的存在理由是 builder 中立和多 builder 分发 | inferred |
| B39 | Express Relay 的 EVM 机制：relayer 专属的 multicall 置位 permission，被保护函数调用 `isPermissioned` 检查，结束后复位并按比例分配出价 | per/sdk/solidity/IExpressRelay.sol、contracts/evm/src/express-relay/ExpressRelay.sol:51-121@468ec0a^ | observed |
| B40 | Express Relay 的 EVM 合约于 2025-04-11 从仓库删除；2026 年 7 月 OP-PIP-124 通过后整体停运 | `git log -- contracts/evm`：468ec0a 2025-04-11；docs.pyth.network/express-relay.md | observed |
| B41 | Chainlink SVR 在 Ethereum 上经 Flashbots MEV-Share（现与 Titan OFA 并行）拍卖 backrun 权；私有路径失败时在可配置延迟后回落标准 feed | docs.chain.link/data-feeds/svr-feeds “How SVR Works”“Fail-Safe Fallback”、页首公告 | observed |
| B42 | SVR 在 Base / Arbitrum / BNB Chain / Monad 上走 Atlas v1.6.4：更新和清算打包进同一笔原子交易，由预言机网络提交，不需要 builder；每笔最多 2 个 searcher 出价；支持 Aave / Compound / Venus | docs.chain.link/data-feeds/svr-feeds/searcher-onboarding-atlas.md “High-Level”、开头 NOTE、“Supported Protocols” | observed |
| B43 | SVR 在 Base 和 Ink 上对部分 feed 默认启用 | docs.chain.link/data-feeds/svr-feeds “Default SVR Activation” | observed |
| B44 | Mantle 可以在 op-rbuilder 选择循环 / cursor 中实现分类别预算与 phase-first，每个 flashblock 作为一轮；要改池内排序，必须替换写死 CoinbaseTipOrdering 的池类型 | 由 B1、B4、B5、B22 推出 | inferred |
| B45 | Unichain 生产 builder 很可能就是 op-rbuilder（测试中有 Unichain 配置），但没有官方说明 | op-rbuilder/crates/op-rbuilder/src/tests/framework/utils.rs:164@4f1bec3（Unichain Sepolia 地址）；MANTLE_MIGRATION.md 测试名 smoke_dynamic_unichain_flashblocks | speculative |

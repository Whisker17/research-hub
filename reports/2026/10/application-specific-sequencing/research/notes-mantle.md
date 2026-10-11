# Lane M：Mantle 现状、出块路径与产品需求（notes-mantle）

**本路目标**：为 Mantle 方案设计提供事实底座。内容包括：现在怎么出块；排序规则可以插在哪；未来出块路径（Reth / Flashblocks / op-rbuilder）；各产品对排序的需求。
**访问日期**：网页来源均为 2026-10-11 访问。源码固定版本：mantle-v2@da45c315d8（2026-09-23）、mantlenetworkio/op-geth@e33cd26cda（2026-09-20）、mantle-xyz/reth@f022de0f62（2026-09-16）、mantle-xyz/op-rbuilder@d89d5e787b（2026-05-08，main 分支）、SorellaLabs/l2-angstrom@81bd4189f4。

**一句话总结**：Mantle 现在是单一 sequencer 加私有交易池。执行层 op-geth 按“有效小费从高到低、同价按到达时间”的规则排序。**这里有一个外部调研没提到的事实**：Mantle 的 op-geth 和 mantle-reth 里已经有一条“preconf 车道”，是按白名单（from 地址 × to 地址）识别的 FIFO 通道。这条车道里的交易先于所有按小费排序的交易执行，并通过 `eth_sendRawTransactionWithPreconf` 返回预确认回执。也就是说，“按交易类别分车道、车道内 FCFS”在 Mantle 客户端里已有雏形。但它只由 sequencer 强制，派生和证明（op-node / kona）不检查任何排序规则。

---

## M-Q1 Mantle 网络现状

**答案**：Mantle 是 L2BEAT 定级的 Stage 0 ZK Rollup。它基于 OP Stack，状态由 OP Succinct（SP1）有效性证明验证；DA 用 Ethereum blobs，L2BEAT 记录的里程碑是 2026-04-16 的 Arsia（EigenDA 路径被移除）。出块时间固定 2 秒，链 ID 5000，gas 代币是原生 MNT，sequencer 只有一个。官方文档原话是：交易池是**私有**的，sequencer “will process transactions in the transaction pool in the order of their base fee and priority fee”。这是**按费用优先**，不是 FCFS。

**依据**：
- L2BEAT 结构化描述：“Stage 0 ZK Rollup … Transaction data is posted to Ethereum blobs and state transitions are validated onchain via OP Succinct ZK validity proofs (SP1)”。里程碑 “Arsia upgrade: full Ethereum DA — 2026 Apr 16th — EigenDA code path removed”。强制收录：“users can force transactions to be included … There can be up to a 12h delay on this operation.” [6]
- Architecture 页 “Transaction Pool in Mantle” 节：Tectonic 引入类似以太坊 mempool 的交易池，“users can control the transaction packing speed by manipulating the priority fee”；为应对 MEV，“the tx pool is designed to be private”；“The sequencer will then process transactions in the transaction pool in the order of their base fee and priority fee.” 第 1–2 步：用户经 RPC 节点把交易转发给 sequencer，sequencer 排序出块，`op-batcher` 用 EIP-4844 blob 交易提交数据 [1]。
- 主网 rollup.json：`block_time: 2`、`l2_chain_id: 5000`、`seq_window_size: 3600`（L1 块，约 12 小时）、`max_sequencer_drift: 600` [7]。
- Arsia 之前 base fee 实际上是静态的，用户通常被建议把 priority fee 设为 0。Arsia 恢复了动态 EIP-1559，带可配置的最低 base fee 和显式 priority fee [3][4]。所以“按小费排序”只有在 Arsia 之后才真正有竞价意义（inferred）。

**不确定之处**：
- Arsia 主网激活日期有两个说法。L2BEAT 写 2026-04-16；research-hub 早先的笔记记录 Mantle changelog 写的是 2026-04-22 07:00 UTC。本次重新抓取 changelog 没有拿到正文，未能复核。
- Fee Model Handbook 仍写“currently valid solely on Mantle Sepolia”[4]，与 Arsia 已在主网激活矛盾，应是文档没更新。
- “Differences” 页仍写 EigenDA 和 “Shanghai”[5]，已过时。

## M-Q2 当前出块路径代码

**答案**：
- **op-node**：sequencer 先用 `PreparePayloadAttributes` 生成只含 L1 info 和 deposit 的模板（默认 `NoTxPool=true`），正常出块时改成 `NoTxPool=false`，然后发出 `BuildStartEvent`，由 engine 层通过 Engine API 让 EL 构建区块。
- **op-geth**：`fillTransactions` 分三段选交易：
  1. **preconf 交易**：白名单内的 from→to，按接收顺序 FIFO；
  2. **prio 账户**交易：按小费排序；
  3. 其他交易：`newTransactionsByPriceAndNonce`，按有效小费 `min(tipCap, feeCap−baseFee)` 从高到低，同价按首次见到的时间先后，同一账户内按 nonce。
- **验证节点**：只是按 batch 原样重放交易（`NoTxPool=true`），**不检查顺序**。
- **Mantle 特有改动**：preconf 车道；Arsia 前的 `tokenRatio` 气体缩放；BVM_ETH 和 MNT 两套 deposit 铸造字段；meta-tx 代付；最低 0 小费。

**依据**：
- `mantle-v2/op-node/rollup/derive/attributes.go:62-64@da45c315d8`：模板“defaults to NoTxPool=true … the caller has to modify the template … by setting NoTxPool=false as sequencer, or by appending batch transactions as verifier”。`:171` 设 `NoTxPool: true`；Arsia 之前用 `sysConfig.BaseFee` 覆盖 base fee（`IsMantleBaseFee && !IsMantleArsia`）[9]。
- `mantle-v2/op-node/rollup/sequencing/sequencer.go:563-565`：超过 sequencer drift 时 `NoTxPool=true`，只出空块；`:568-608`：各升级激活块和 recover 模式也设 `NoTxPool=true`；约 `:632` 发出 `engine.BuildStartEvent{Attributes: withParent}` [9]。
- `mantle-v2/op-node/rollup/derive/attributes_queue.go:129-132`：验证者 “do not pull from the tx-pool (that would make the block derivation non-deterministic)”，`attrs.NoTxPool = true; attrs.Transactions = append(..., batch.Transactions...)` [9]。
- `mantle-v2/op-node/rollup/derive/batches.go:176-189`：batch 交易的有效性检查只有三条：不能为空；不能是 deposit 类型；Skadi/Isthmus 之前不能是 SetCode。**没有任何排序检查** [9]。
- `op-geth/miner/worker.go:731-826@e33cd26cda`（`fillTransactions`）：
  - `:743` `tip := big.NewInt(0) // accept txs with 0 tip fee`；
  - `:764` `PendingWithPreconfTxs(filter)`；
  - `:768` `commitFIFOTransactions(...)`；
  - `:778-781`：只要还有未封装的 preconf 交易，就不再放入其他交易，“could cause other transactions to be packaged before preconfirmation transactions”；
  - `:800-826`：先处理 `prio` 账户，再处理普通交易，两者都用 `newTransactionsByPriceAndNonce` [10]。
- `op-geth/miner/ordering.go:39-69`：`newTxWithMinerFee` 计算有效小费；`txByPriceAndTime.Less` 先比 fees，相等时比 `tx.Time` [10]。
- `op-geth/miner/worker.go:579-727`（`commitTransactions`）：Arsia 后额外检查 DA footprint（`checkMinDAFootprint` / `checkTxDAFootprint`，计入 `BlobGasUsed`）。交易失败时跳过该账户的后续交易（`txs.Pop()`）[10]。

**不确定之处**：Engine API 调用（`engine_forkchoiceUpdated` 加 attributes，然后 `getPayload`）在 `op-node/rollup/engine` 下，不在本次 sparse checkout 里。这里按 OP Stack 标准流程描述，未逐行核对 Mantle 版本。

## M-Q2b（补充）Mantle 已有的 preconf 车道

**答案**：
- **识别方式**：节点配置 `--txpool.frompreconfs`、`--txpool.topreconfs` 和 `--txpool.allpreconfs`。只有 **from 在白名单且 to 也在白名单** 的交易才算 preconf 交易（`AllPreconfs` 打开时全部算）。
- **提交与回执**：经 `eth_sendRawTransactionWithPreconf` 提交。sequencer 用 `preconfChecker` 在“虚拟下一块”上预执行，2 秒超时内返回回执（成功或失败）。
- **出块顺序**：preconf 交易按接收顺序 FIFO 放在所有按小费排序的交易**之前**。
- **mantle-reth 的移植**：已移植为 `mantle-reth/crates/preconf`，是 fork 出来的 OP payload builder，在一个 `select!` 循环里交错执行 preconf FIFO 和池内 best-tx，并对池内交易按时间配额限速。
- **部署状态**：Sepolia 的 proxyd 已开放该 RPC。主网是否启用、白名单是哪些地址，都没有一手来源。

**依据**：
- `op-geth/preconf/tx_pool_config.go:10-67`：`FromPreconfs`、`ToPreconfs`、`AllPreconfs`、`PreconfTimeout` 默认 1 秒；`IsPreconfTx(from,to)` 要求 from 匹配且 to 匹配 [11]。
- `op-geth/cmd/utils/flags.go:438-456`：flag 说明 “Comma separated accounts to treat as from preconfs (no flush, priority inclusion)” [11]。
- `op-geth/preconf/fifo_tx_set.go:13-22`：“FIFOTxSet … ordered by their reception time … Fairness: FIFO ensures transactions are processed in order of reception” [11]。
- `op-geth/eth/api_backend.go:380-436`：非 sequencer 节点把请求转发到 sequencer 的 `eth_sendRawTransactionWithPreconf`；sequencer 要求 `EnablePreconfChecker`，等待 preconf 事件最长 2 秒 [11]。
- `op-geth/internal/ethapi/api.go:2295-2297`：`SendRawTransactionWithPreconf` [11]。
- `op-geth/miner/miner_preconf.go`（`preconfLoop`）：预执行成功设 `PreconfStatusSuccess`，否则设 `Failed`；超时后 `RevertTx` [11]。
- 首次提交：`5bdae6a 2025-06-05 Merge preconf to prectra (#113)`（`git log -- preconf miner/miner_preconf.go`）[11]。
- `reth/mantle-reth/crates/preconf/src/lib.rs:1-9@f022de0f62`：“Mantle preconfirmation core types for op-reth … forked OP payload-builder (async build loop + preconf dispatch)”。`config.rs:256-262` `is_preconf_tx` 规则与 geth 相同 [13]。
- `reth/mantle-reth/crates/preconf/src/builder/payload_builder.rs:768-806`（rustdoc）：Stage 2 处理 deposits 和系统交易；Stage 3 是四分支 `biased` 的 `select!`，分支为 cancel、`fifo_rx.recv()`（preconf）、受 `PoolPacer` 配额限制的池内 best-tx（每次一笔）、`sweep_ticker`（每 tick 提高池配额 `block_gas_limit / ticks_remaining`，注明“op-rbuilder flashblocks pattern”）。`:685-700`：池里的 preconf-eligible 交易被 `mark_invalid`，只能走 preconf 通道。`:903` 池迭代器在构建开始时一次性快照 [13]。
- 最近提交：`fbade2ed 2026-08-23 fix(preconf): freeze the pool best-tx iterator at build start`、`25e02ca5 2026-08-10 feat(preconf): add CL-stall watchdog …` [13]。
- `mantle-xyz/networks/sepolia/proxyd.toml`：`eth_sendRawTransactionWithPreconf = "main"`；networks 仓库的 `mainnet/` 下没有 proxyd.toml [8]。

**不确定之处**：
- 主网是否开启 preconf 车道、白名单是谁（推测是做市商或支付类合作方，speculative）。
- docs.mantle.xyz 的 llms.txt 里没有 preconf 页面。

## M-Q3 未来出块路径

**答案**：
- **路线图**：2026 H2（全部未勾选）计划把主网 Sequencer 和 RPC 全面切到 “pure Reth”，Geth 降为灾备热备；引入 Flashblocks 亚秒级流式预确认；“On-chain Governance of Pre-Confirmation Mechanisms”，即把预确认策略和路由权限做成链上动态管理的合约；Prop AMM 撮合基础设施，原文为 “supporting high-priority cancellations (Cancel) and dedicated matching paths”；EIP-8130 原生 AA 与 2D nonce；Shielded Pool / mStocks。
- **mantle-reth 的 builder**：mantle-reth 的 payload builder 是 Mantle 自研的 preconf builder，底层池用 upstream reth 的 `CoinbaseTipOrdering`。
- **mantle-xyz/op-rbuilder 的状态**：它是 flashbots/op-rbuilder 的 fork，main 分支**没有任何 Mantle 提交**（ahead 0、behind 64）。Mantle 的改动在 `feat/mantle-arsia*` 分支（2026-05-14），文档自称迁移状态，仍有 19/112 个测试失败。没有证据表明它在生产使用（inferred）。

**依据**：
- Roadmap 页 2026 H2 原文 [2]：
  - “complete the full mainnet switch of Sequencer and RPC to pure Reth … Geth client relegated to disaster recovery hot standby”；
  - “Flashblocks Sub-Second Streaming Pre-Confirmations”；
  - “Fully refactor transaction pre-confirmation strategies and routing permissions into dynamically managed smart contracts”；
  - “Prop AMM … supporting high-priority cancellations (Cancel) and dedicated matching paths with lower latency and optimized gas fees”；
  - “implement EIP-8130 native account abstraction and the 2D Nonce parallel mechanism”；
  - “2D Nonce … enabling large-scale concurrent matching in high-frequency payment and trading scenarios”；
  - 2026 H1 已勾选：Arsia、三段式费用、DA 迁移、Reth RPC 兼容与测试网验证，以及 “Mantle Sepolia and QA network supported. Waiting for Mantle Mainnet...”。
- `reth/op-reth/crates/txpool/src/lib.rs:26-39`：`OpTransactionPool = OpPool<Pool<…, CoinbaseTipOrdering<T>, S>>` [14]。`op-reth/crates/payload/src/builder.rs:771` `execute_best_transactions`，即标准按小费迭代 [14]。
- `mantle-xyz/networks` 有 `docker-compose-sepolia-reth.yml`，提交 `c33104f8 2026-09-15 sepolia: add reth-based node compose file (#135)` [8]。
- `gh api repos/mantle-xyz/op-rbuilder`：fork 自 flashbots/op-rbuilder，创建于 2026-01-28；`compare flashbots:main...mantle-xyz:main` 结果为 ahead_by 0、behind_by 64。分支有 `feat/mantle-arsia`（ahead 2：“enforce Mantle min_base_fee in tx selection”）、`feat/mantle-arsia-v0.2.14`（ahead 6）、`op-rbuilder/v0.2.14-poc` [15]。
- `MANTLE_MIGRATION.md@feat/mantle-arsia-v0.2.14` [15]：
  - 基于 op-rbuilder v0.2.14，依赖切到 `mantle-xyz/reth v1.9.3-mantle-arsia.1`；
  - 源码只改 3 个文件（`TxDeposit` 增加 `eth_value`、`eth_tx_value`）；
  - “98 / 112 op-rbuilder unit tests pass”；
  - 已知失败包括 flashblocks timing 6 个、flashtestations 10 个等。
- 本地 `mantle-xyz-op-rbuilder@d89d5e787b` 是 upstream flashbots/op-rbuilder 的祖先提交（`git merge-base --is-ancestor` 成立），没有 Mantle 字样 [15]。

**不确定之处**：
- 主网 sequencer 当前跑的是 op-geth 还是 reth？路线图说 H2 才切，未勾选。
- Flashblocks 最终用 op-rbuilder 加 rollup-boost，还是在自研 preconf builder 上扩展？没有一手来源。mantle-reth builder 的 rustdoc 引用了 “op-rbuilder flashblocks pattern”，只能说明有借鉴。

## M-Q4 排序规则可以插在哪（候选插入点）

**答案**：三层的结论如下。
- **(a) 合约层**：不改客户端，违规后果是交易回滚，但只能约束“进入本合约的调用顺序”，管不了区块空间分配。
- **(b) sequencer / builder 层**：Mantle 已经有现成扩展点：preconf 分类器、`fillTransactions` 的分段、mantle-reth 的 `select!` 多分支加配额。违规后果只是运营承诺，链上无人能判无效。
- **(c) 协议有效性层**：要改 op-node 派生（Go）和 kona-derive / kona-executor（Rust，OP Succinct 证明程序用它们执行派生和 STF），并同步修改 op-geth 和 reth 的验块。改动面最大，但违规会让区块无效、证明失败。

| 插入点 | 具体位置（代码） | 谁能看到违规 | 违规后果 | 改动面 |
|---|---|---|---|---|
| a1 合约 gate / hook（如 Angstrom L2 式 MEV tax、批次结算入口） | 应用合约，读 `tx.gasprice − block.basefee` 等 | 任何人（链上可复现） | 交易回滚或被收税 | 只改应用；依赖 [M-Q6] 的 gas 语义 |
| a2 链上“策略注册”合约（路线图的 “dynamically managed smart contracts”） | 新合约，加上 builder 读取 | 任何人能读策略；执行仍由 builder 负责 | 合约本身不强制，只是透明化 | 合约加 builder 读取逻辑 |
| b1 交易池分类（preconf 白名单的泛化：按 to / selector / 类别打标） | `op-geth/preconf/tx_pool_config.go:44-67`；`core/txpool/legacypool/legacypool_preconf.go:30-80`；`mantle-reth/crates/preconf/src/config.rs:256` | 只有 sequencer | 运营承诺 | 客户端（两套） |
| b2 区块内分段 / 车道顺序 | `op-geth/miner/worker.go:764-826`（preconf→prio→normal） | sequencer；外部只能事后统计 | 运营承诺 | op-geth |
| b3 车道容量配额 / 节拍 | `mantle-reth/.../payload_builder.rs:937-960`（`derive_pool_quota_schedule`、`PoolPacer`） | sequencer | 运营承诺 | mantle-reth |
| b4 车道内排序器 | `op-geth/miner/ordering.go:62-69`（`Less`）；reth `CoinbaseTipOrdering` | sequencer | 运营承诺 | 两套客户端 |
| b5 Flashblocks 子块（路线图） | 尚无 Mantle 代码；upstream op-rbuilder | sequencer；预确认流公开后外部可对照 | 运营承诺，外加预确认信誉 | builder 加 rollup-boost / conductor |
| c1 派生阶段的 batch 校验 | `mantle-v2/op-node/rollup/derive/batches.go:176-189`；Rust 侧 `mantle-v2/rust/kona`（kona-derive） | 所有验证节点、证明者 | batch 被丢弃（BatchDrop），sequencer 需重发 | op-node、kona、证明 vkey 更新 |
| c2 执行 / 验块规则（例如“标记为 payment 的交易必须按 X 排序”） | op-geth `core/`、reth 执行层、kona-executor | 所有全节点、证明者 | 区块无效 | 硬分叉级别 |

**依据**：
- 派生只检查交易类型，不检查顺序 [9]（batches.go:176-189）；验证者原样重放 [9]（attributes_queue.go:129-132）。
- OP Succinct 的 Mantle fork 依赖 `kona-derive`、`kona-driver`、`kona-executor`、`kona-proof`、`kona-client`，全部来自 `git = mantle-xyz/mantle-v2, tag = "mantle-v1.6.3"` [16]。mantle-v2 仓库根目录下有 `rust/kona`，`op-program` 也在仓库里 [9]。所以证明里的 STF 由 kona 执行，c 层规则必须同时写进 Go（op-node / op-geth）和 Rust（kona）两套实现（inferred）。
- 修改 SP1 程序意味着要更新链上 vkey。L2BEAT 记录 MantleSecurityMultisig 可以无延迟更新 vkey 和 rollupConfigHash [6]。

**不确定之处**：kona-executor 是否直接复用 mantle-reth 或 op-revm 的执行代码，从而使 reth 的执行修改能自动进入证明？本次没读，属于开放问题。

## M-Q5 Mantle 产品方向与对排序的需求

**答案**：在一手来源中能找到的官方表述有：
- payment：路线图写原生 AA “empowering payments and high-frequency financial interactions”，2D nonce 面向 “high-frequency payment and trading scenarios”。
- 做市 / 撤单优先：Prop AMM 原文为 “high-priority cancellations (Cancel) and dedicated matching paths”。
- RWA / 机构金融：官网首页的定位是 “Institutional Onchain Finance”，并有 USDG 等稳定币和代币化股票。

**perps** 和 **meme launchpad** 没有在本次读到的官方页面里出现，只能写“用户提供的方向”（来源：brief）。Mantle 早期的 launchpad 尝试 Funny Money（2025-02-18 推出）和 Printr（Mantle EcoFund 参投）都已停止运营，来源见 meme-launchpad 报告记录的 Mantle 博客和 Printr 公告。

**依据**：
- 路线图 2026 H2 原文 [2]（见 M-Q3）。
- mantle.xyz 首页（2026-10-11 抓取）：“Institutional Onchain Finance”、“Mantle is the open financial network connecting global market participants to institutional-grade capital market assets onchain”。动态栏包括：2026-09-03 “USDG, issued by @Paxos … now live on Mantle”；2026-07-07 xStocks 代币化股票；2026-08-31 “Mantle DeFi Vault incentive program” [19]。
- brief：“Mantle 产品方向：meme launchpad、perps、DeFi、payment”；“payment 要 FCFS，DeFi 要 tips 优先” [20]。
- Funny Money：Mantle Blog 2025-02-18，https://www.mantle.xyz/blog/announcements/funny-money-mantle-network-ai-defai-launchpad 。Printr 停止运营：Printr 公告，2026-08-31 前停止运营。两条均为 meme-launchpad 报告已核实的一手来源，本次未重新抓取。

**由需求推出的排序要求**（inferred）：
- **payment**：需要可预期的纳入（FCFS 加容量预留）和独立 nonce 域，避免被同账户其他交易阻塞，对应路线图的 2D nonce。
- **Prop AMM / perps 做市**：需要撤单优先，即结构性优先，而不是只靠出价高。
- **DeFi 套利**：需要小费拍卖或应用税。
- **RWA / 机构**：可能需要可审计的纳入承诺（speculative）。

**不确定之处**：Mantle 2024 年 “fair sequencing / VRF” 研究博客（外部调研引用的 https://www.mantle.xyz/blog/research/fair-sequencing ）现在重定向到首页，无法核实。

## M-Q6 MNT 原生币与 Angstrom L2 的 `currency0`；gas 价格语义

**答案**：
- **原生币**：Mantle 的原生币是 MNT（Tectonic 起成为原生 rollup 资产）。L2 上的 ETH 是 BVM_ETH（`0xdEAd…1111`，由 deposit 的 `EthValue` 铸造）。
- **Angstrom L2 的限制**：Angstrom L2 要求 `key.currency0` 是原生币，否则 `IncompatiblePoolConfiguration`。部署到 Mantle 时只能做 MNT/X 池，税以 MNT 计价，不能直接用于 USDC/USDT 等稳定币对或 BVM_ETH 对。
- **gas 价格语义**：`tx.gasprice` 在 op-geth 里就是有效价格 `min(baseFee+tipCap, feeCap)`，与以太坊一致。Arsia 起 base fee 动态变化，`tokenRatio` 不再缩放 L2 执行 gas，只用于把 L1 数据费从 ETH 换算成 MNT。所以 `tx.gasprice − block.basefee` 在 Arsia 后可以当作优先费信号。

**依据**：
- `l2-angstrom/src/AngstromL2.sol:249@81bd4189f4`：`if (key.currency0.toId() != NATIVE_CURRENCY_ID) revert IncompatiblePoolConfiguration();`；`:662-665`：`return tx.gasprice > block.basefee ? tx.gasprice - block.basefee : 0;` [17]。
- Differences 页：“MNT will be a native Mantle Network Rollup asset, instead of a bridged version of its Ethereum ERC-20 counterpart” [5]。
- `op-geth/core/state_transition.go:38`：`BVM_ETH_ADDR = 0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111`；`core/types/deposit_tx.go:44-49`：`EthValue` / `EthTxValue` 是 BVM_ETH 的铸造和转账标记 [12]。
- `op-geth/core/state_transition.go:348-357`：“If baseFee provided, set gasPrice to effectiveGasPrice”，即 `min(baseFee+tipCap, feeCap)` [12]。`core/evm.go:93-96`：`TxContext.GasPrice = msg.GasPrice` [12]。
- `op-geth/core/state_transition.go:844-846`：`if !IsDepositTx && !IsSystemTx && !rules.IsMantleArsia { cost.RegularGas *= tokenRatio }`，即 Arsia 前 gas 被放大 [12]。
- Arsia 文档：“The legacy `tokenRatio` multiplier is removed”，“full dynamic EIP-1559 fee market … configurable minimum floor and explicit priority fee support” [3]。Fee Handbook：`L1DataFee = EstimatedSize * WeightedL1Fee * TokenRatio`；`OperatorFee = OperatorConstant + OperatorScalar*100*L2GasUsed` [4]。
- Mantle 还有 meta-tx 代付（`MetaTxParams`，`state_transition.go:275,602-612`）[12]。代付交易里 `tx.gasprice` 仍是交易本身的价格，但付费人不是 `tx.origin`（inferred）。

**不确定之处**：
- Operator Fee 和 L1 数据费不进入 `tx.gasprice`。应用如果按 `tx.gasprice` 计税，会忽略这两部分（inferred）。
- preconf 车道里的交易无论出多少小费都按 FIFO 排。如果 Angstrom 式 MEV-tax 池的竞争交易能走 preconf 车道，“小费决定顺序”的前提就不成立（inferred）。

## M-Q7 原生 AA / 2D nonce

**答案**：路线图 2026 H2 明确列出 EIP-8130 原生 AA 和 “2D Nonce Parallel Transaction Mechanism”，用途写的是高频 payment 和交易。EIP-8130（Draft）用 `nonce_key` 区分通道，`nonce_key == NONCE_KEY_MAX` 时进入无序（nonce-free）模式。这可以作为“FCFS payment 需要独立 nonce 域”的依据：不同 key 互不阻塞，payment 交易不会被同账户的 DeFi 交易卡住。不过 EIP 文本近期改动较大（现名 “Keystore Accounts”），细节要以定稿为准。

**依据**：
- 路线图原文 [2]。
- `ethereum/EIPs/EIPS/eip-8130.md`（Draft，created 2025-10-14，title “Keystore Accounts”）：`:308` “when `nonce_key != NONCE_KEY_MAX`, the sender actor MUST be admin or hold `NONCE`”；`:115-120,233-234` 区分 sequenced 和 unsequenced（nonce-free），“Ordering between unsequenced batches is undefined” [18]。
- research-hub native-aa 报告的结论（作为线索）：2D nonce 的形式是 `(account, nonce_key, nonce_sequence)`，不同 key 互不阻塞；Mantle 宜先做 8130 PoC。

**不确定之处**：Mantle 的 2D nonce 会采用 8130 内置方案还是 EIP-8250？时间表也未定。2D nonce 只解决“同账户互不阻塞”，不解决跨账户的 FCFS 顺序，后者仍要靠 builder（inferred）。

---

## 对比表素材

| 实现（Mantle 侧） | 控制范围 | 强制力来源 | 组合性代价 | 违规后果 | 状态 |
|---|---|---|---|---|---|
| op-geth 默认排序（有效小费降序，同价按时间） | 全区块（preconf 之后的部分） | sequencer 运营 | 同块原子，无代价 | 无法判定违规，只是运营承诺 | 主网（文档声明 [1]，代码 [10]） |
| op-geth preconf FIFO 车道（白名单 from×to） | 白名单交易类别，排在区块最前 | sequencer（txpool 加 miner） | 同块原子；车道里的交易先执行，会改变后续交易看到的状态 | 运营承诺，外加预确认回执的信誉 | 代码已实现；Sepolia RPC 开放；主网未知 |
| mantle-reth preconf builder（FIFO 与池内交错，池按配额限速） | 同上，外加池内交易的时间配额 | sequencer（reth builder） | 同块原子 | 运营承诺 | 代码已实现；Sepolia reth 节点；主网计划 2026 H2 |
| mantle-xyz/op-rbuilder（Flashblocks） | 全区块与子块 | sequencer / builder | 子块级预确认 | 运营承诺 | fork，main 无改动，Arsia 迁移分支为 POC |
| 派生 / 证明（op-node、kona） | 只检查交易类型 | 链共识与有效性证明 | — | 目前不含排序规则 | 主网 |
| Angstrom L2 式合约 MEV tax（若部署） | 单个池（必须是 MNT/X） | 合约，加上“sequencer 按小费排序”的前提 | 同块原子 | 不交税就回滚 | Mantle 上未部署（本次未查到） |

## 代码片段（建议放进报告）

1. **op-geth 选交易的三段结构**：`op-geth/miner/worker.go:764-826@e33cd26cda`。说明 Mantle 现网已经是“FIFO 车道 → prio → 按小费排序”的分段结构。
```go
preconfTxs, pendingPlainTxs, plainTxCount := miner.txpool.PendingWithPreconfTxs(filter)
var unsealedPreconfTxs []*types.Transaction
if len(preconfTxs) > 0 {
    unsealedTxs, err := miner.commitFIFOTransactions(ctx, env, preconfTxs, interrupt)
    if err != nil { return err }
    unsealedPreconfTxs = unsealedTxs
}
unSealedPreconfTxsCh <- unsealedPreconfTxs
// If there are unsealed preconfirmation transactions, we cannot include new transactions
// as this could cause other transactions to be packaged before preconfirmation transactions
if len(unsealedPreconfTxs) > 0 { return nil }
...
for _, account := range prio { /* move prio accounts' txs to prioPlainTxs */ }
if len(prioPlainTxs) > 0 || len(prioBlobTxs) > 0 {
    plainTxs := newTransactionsByPriceAndNonce(env.signer, prioPlainTxs, env.header.BaseFee)
    ...commitTransactions(...)
}
if len(normalPlainTxs) > 0 || len(normalBlobTxs) > 0 {
    plainTxs := newTransactionsByPriceAndNonce(env.signer, normalPlainTxs, env.header.BaseFee)
    ...commitTransactions(...)
}
```
2. **小费排序比较器**：`op-geth/miner/ordering.go:39-69`。说明有效小费的计算方式，以及同价时按到达时间排序。
```go
tip := new(uint256.Int).Set(tx.GasTipCap)
if baseFee != nil {
    if tx.GasFeeCap.Cmp(baseFee) < 0 { return nil, types.ErrGasFeeCapTooLow }
    tip = new(uint256.Int).Sub(tx.GasFeeCap, baseFee)
    if tip.Gt(tx.GasTipCap) { tip = tx.GasTipCap }
}
...
func (s txByPriceAndTime) Less(i, j int) bool {
    cmp := s[i].fees.Cmp(s[j].fees)
    if cmp == 0 { return s[i].tx.Time.Before(s[j].tx.Time) }
    return cmp > 0
}
```
3. **preconf 分类规则**：`op-geth/preconf/tx_pool_config.go:44-67`（Rust 版见 `mantle-reth/crates/preconf/src/config.rs:256-262`）。这是“可信分类”的最简形式：只看 from 和 to 两个地址。可以作为报告中 “payment 分类规则” 片段的现实起点。
```go
func (c *TxPoolConfig) IsPreconfTx(from, to *common.Address) bool {
    if c.AllPreconfs { return true }
    if from == nil || to == nil { return false }
    for _, preconfFrom := range c.FromPreconfs {
        if preconfFrom == *from {
            for _, preconfTo := range c.ToPreconfs {
                if preconfTo == *to { return true }
            }
            return false // from matches but to does not match
        }
    }
    return false
}
```
4. **mantle-reth 车道交错与配额**：`mantle-reth/crates/preconf/src/builder/payload_builder.rs:772-781`（rustdoc）和 `:685-700`。说明 builder 已经有“多分支 biased select 加池配额”的调度器骨架，可以扩展成多车道。
```rust
/// 4. **Stage 3** — unified `select!` loop with four `biased` branches:
///    - `cancel.wait()` — exits the loop.
///    - `fifo_rx.recv()` — preconf-tx dispatch ...
///    - **Level-triggered pool arm** (`ready(()) if PoolPacer::can_admit()`) — each fire admits
///      exactly one pool best-tx, then returns to `select!`. Cancel and preconf get preempt
///      chances between every pool tx via biased priority.
///    - `sweep_ticker.tick()` — ... Raises the [`PoolPacer`] ceiling by
///      [`PoolQuotaSchedule::gas_per_batch`] on each tick ...
...
if cfg.is_preconf_tx(&sender, to.as_ref()) {
    best_txs.mark_invalid(sender, tx.nonce());   // preconf-eligible txs only via the preconf arm
```
5. **验证者不检查顺序**：`mantle-v2/op-node/rollup/derive/attributes_queue.go:129-132@da45c315d8`。
```go
// we are verifying, not sequencing, we've got all transactions and do not pull from the tx-pool
// (that would make the block derivation non-deterministic)
attrs.NoTxPool = true
attrs.Transactions = append(attrs.Transactions, batch.Transactions...)
```
6. **`tx.gasprice` 即有效价格**：`op-geth/core/state_transition.go:348-357`；Arsia 前的 tokenRatio 放大见 `:844-846`。

## 图的素材

**A. Mantle 现网一笔交易的流程（op-geth 路径）**
1. 用户 → 公共 RPC 节点（op-geth，`--rollup.sequencer-http`）→ 转发到 sequencer 的 op-geth（私有池）。
   - 分支：若调用 `eth_sendRawTransactionWithPreconf` 且交易命中白名单 → sequencer 的 `preconfChecker` 在虚拟下一块上预执行 → 2 秒内返回 preconf 回执 → 交易进入 FIFO 集合。
2. op-node sequencer 每 2 秒执行：`PreparePayloadAttributes`（L1 info 加 deposit）→ `NoTxPool=false` → `BuildStartEvent` → Engine API → op-geth `generateWork`。
3. op-geth 执行顺序：强制交易（deposit / L1 info）→ preconf FIFO → prio 账户（按小费）→ 其他交易（按小费，同价按时间，账户内按 nonce）→ 封块（期间经过 DA footprint、gas 和大小检查）。
4. op-batcher 把区块交易用 blob 发到 L1。
5. 验证节点 / kona（SP1）：派生 batch → `NoTxPool=true` 原样重放 → 证明 STF。**不检查顺序**。
6. OP Succinct 证明 → L1 OutputOracle。

**B. mantle-reth preconf builder（未来路径）**
- 参与者：RPC、PreconfPoolListener、FIFO 集合、payload job、`select!` 循环（cancel / fifo / pool / ticker）、PoolPacer。
- 顺序：Stage 1 预执行变更 → Stage 2 deposit 和系统交易 → Stage 3 循环：
  - preconf 交易一到就优先执行；
  - 池内交易每 tick 获得 `block_gas_limit / ticks_remaining` 的配额，每次放入一笔；
  - 收到 cancel 时封块。

**C. 三层插入点图**（对应 M-Q4 表）
- a 合约层：任何人可验证，违规就回滚。
- b sequencer / builder：分类 → 车道 → 配额 → 车道内排序，只有 sequencer 可见。
- c 派生 / 证明：op-node 加 kona 两套实现，违规会让 batch 被丢弃或区块无效。

## 对 Mantle 的启示（均为推论）

1. **不必从零开始**：preconf 车道（白名单分类、FIFO、排在最前、带回执）就是一个 “payment FCFS lane” 原型。把分类器从“from×to 地址白名单”泛化成“to 合约 × selector × 类别注册表”，就得到外层车道分类（inferred，由 M-Q2b 推出）。
2. **调度器骨架已有**：mantle-reth 的 `select!` 多分支加 `PoolPacer` 时间配额，相当于“预留和借用”的雏形。要扩展成多车道，就为每个车道设 gas 配额和 tick，车道内各用自己的比较器（inferred）。
3. **当前 preconf 车道没有容量上限**：geth 版中，只要有未封装的 preconf 交易，就停止放入其他交易（worker.go:778-781）。这是“FIFO 车道可以把整个区块占满”的设计。如果对外开放，必须先加车道上限，否则 DeFi 流量会被饿死（inferred）。
4. **路线图里的 “dynamically managed smart contracts” 正好对应 a2 层**：车道策略注册放在链上合约，builder 读取。这样做能提高透明度，但强制力仍在 builder（inferred）。
5. **路线图的 Prop AMM 撤单优先是一手需求信号**：它要求结构性优先（类似 BAM maker plugin、Hyperliquid 的撤单优先），而不是只靠小费，不能简单归入“DeFi = tips 优先”（inferred）。
6. **Angstrom L2 式应用税在 Mantle 上的两个约束**：只能用于 MNT/X 池；参与竞争的交易不能被放进 FIFO 车道（inferred，由 M-Q6 推出）。
7. **要让排序规则有协议强制力，代价很高**：必须同时改 op-node、kona（SP1 程序和 vkey）、op-geth、reth。在 Geth 降为灾备的过渡期，还要保证两套客户端的 builder 行为一致。第一阶段宜把规则放在 builder 层，加上可观测指标（inferred）。
8. **2D nonce 只解决同账户阻塞**。payment FCFS 的跨账户顺序仍要靠 builder 车道（inferred）。

## 外部调研的修正

1. **遗漏现有能力**。外部调研 §2.1、§5 的写法暗示 Mantle 要从零加车道（“即便暂时不改 sequencer…”）。实际上 Mantle 的 op-geth 和 mantle-reth 已有白名单 FIFO preconf 车道和 `eth_sendRawTransactionWithPreconf`（见 M-Q2b，来源 [11][13][8]）。
2. **工程入口判断过时**。§2.3 和 §8 说“优先评估 Rollup-Boost / op-rbuilder 式接入”。实际情况是：mantle-xyz/op-rbuilder 的 main 分支与 upstream 相同（ahead 0），Arsia 适配只在 POC 分支，自称 19/112 测试失败；Mantle 实际在推进的是自研的 mantle-reth preconf payload builder [13][15]。op-rbuilder 可以作参考，但不是 Mantle 现行路径。
3. **无法证实**。§6 “Mantle 在 2024 年已经公开研究过 VRF 随机化排序”，引用 mantle.xyz/blog/research/fair-sequencing。该 URL 现在重定向到首页，无法核实，应标为 unverified。
4. **补充**。§2.1 说 Mantle 用 MNT 付 gas、Angstrom 要求 `currency0` 为原生币，这一点已核实（AngstromL2.sol:249 [17]）。需要补充两点：Arsia 起 `tokenRatio` 不再缩放 L2 执行 gas，`tx.gasprice` 是标准的有效价格 [3][12]；Arsia 前 base fee 静态、建议小费为 0，那时“按小费排序”没有实际竞价意义 [4]。
5. **遗漏一手需求**。外部调研没有引用 Mantle 官方路线图。路线图明确列出 Prop AMM 的 “high-priority cancellations”、Flashblocks、预确认策略上链治理、2D nonce 面向 payment [2]，这些是 Mantle 自己的一手需求表述。
6. **产品方向的来源**。外部调研把 meme launchpad、perps 当作 Mantle 方向。官方首页当前定位是 RWA / 机构金融 / 稳定币 [19]，perps 和 meme launchpad 只来自用户 brief [20]，引用时应注明。

## 来源

1. **PRIMARY** Mantle Docs — Architecture，https://docs.mantle.xyz/network/system-information/architecture.md （2026-10-11）。证明交易池私有，sequencer 按 base fee 和 priority fee 处理交易；batcher 用 blob 提交数据。
2. **PRIMARY** Mantle Docs — Roadmap，https://docs.mantle.xyz/network/system-information/roadmap.md （2026-10-11）。证明 H1 已完成项，以及 H2 的 pure Reth、Flashblocks、预确认策略上链、Prop AMM 撤单优先、EIP-8130 和 2D nonce（全部未勾选）。
3. **PRIMARY** Mantle Docs — What's New in Mantle v2 Arsia，https://docs.mantle.xyz/network/introduction/whats-new-in-mantle-v2-arsia.md （2026-10-11）。证明移除 `tokenRatio` 乘数、恢复动态 EIP-1559、引入 Operator Fee 和 DA footprint，以及对齐 Canyon→Jovian（基于 op-node v1.16.3）。
4. **PRIMARY** Mantle Docs — Fee Model Handbook (After Arsia)，https://docs.mantle.xyz/network/system-information/fee-mechanism/fee-model-handbook-after-arsia.md （2026-10-11）。证明三段式费用公式、L1 费仍乘 TokenRatio、Arsia 前 base fee 静态且建议小费为 0；页首“仅 Sepolia”的说法已过时。
5. **PRIMARY**（部分过时）Mantle Docs — The Differences between Mantle, OP Stack, and Ethereum（2026-10-11）。证明 MNT 是原生 rollup 资产；同页的 EigenDA 和 Shanghai 表述已过时。
6. **PRIMARY** L2BEAT Mantle，https://l2beat.com/scaling/projects/mantle （2026-10-11）。证明 Stage 0 ZK Rollup、blobs 加 OP Succinct（SP1）、Arsia 里程碑 2026-04-16、强制收录最长 12 小时。
7. **PRIMARY** mantle-xyz/networks `mainnet/rollup.json`（gh api，2026-10-11）。证明 block_time 2、chain id 5000、seq_window_size 3600、max_sequencer_drift 600。
8. **PRIMARY** mantle-xyz/networks `sepolia/proxyd.toml`、`docker-compose-sepolia-reth.yml`，以及提交 c33104f8（2026-09-15）。证明 Sepolia 开放 `eth_sendRawTransactionWithPreconf`，并已有 reth 节点 compose 文件。
9. **PRIMARY** mantle-v2@da45c315d8：`op-node/rollup/sequencing/sequencer.go`、`derive/attributes.go`、`attributes_queue.go`、`batches.go`，以及目录 `rust/kona`。证明 sequencer 构建流程、`NoTxPool` 语义、验证者原样重放、派生不检查顺序。
10. **PRIMARY** mantlenetworkio/op-geth@e33cd26cda：`miner/worker.go`、`miner/ordering.go`。证明三段选交易、小费排序比较器、0 小费准入、DA footprint 检查。
11. **PRIMARY** op-geth@e33cd26cda：`preconf/tx_pool_config.go`、`preconf/fifo_tx_set.go`、`core/txpool/legacypool/legacypool_preconf.go`、`miner/miner_preconf.go`、`eth/api_backend.go`、`internal/ethapi/api.go`、`cmd/utils/flags.go`。证明 preconf 车道的分类、FIFO、RPC 和 flag。
12. **PRIMARY** op-geth@e33cd26cda：`core/state_transition.go`、`core/evm.go`、`core/types/deposit_tx.go`。证明 `tx.gasprice` 是有效价格、Arsia 前 tokenRatio 放大 gas、BVM_ETH 地址与铸造字段、meta-tx。
13. **PRIMARY** mantle-xyz/reth@f022de0f62：`mantle-reth/crates/preconf/src/{lib.rs,config.rs,builder/payload_builder.rs}`，以及该路径的 git log。证明 reth 版 preconf builder 的 select 循环、池配额、preconf 交易只走 FIFO 通道。
14. **PRIMARY** mantle-xyz/reth@f022de0f62：`op-reth/crates/txpool/src/lib.rs:26-39`、`op-reth/crates/payload/src/builder.rs:771`。证明 reth 池使用 `CoinbaseTipOrdering`，以及标准 best-tx 迭代。
15. **PRIMARY** GitHub API：mantle-xyz/op-rbuilder 的 repo 信息、compare（main 为 ahead 0 / behind 64）、分支列表、`MANTLE_MIGRATION.md@feat/mantle-arsia-v0.2.14`；本地 d89d5e787b 是 upstream 的祖先。证明它只是 fork 加 POC 迁移，main 没有 Mantle 改动。
16. **PRIMARY** mantle-xyz/op-succinct `Cargo.toml`（gh api，main）。证明证明程序依赖 kona-derive、driver、executor、proof、client，均来自 mantle-v2 tag mantle-v1.6.3。
17. **PRIMARY** SorellaLabs/l2-angstrom@81bd4189f4 `src/AngstromL2.sol:249,662-665`。证明 currency0 必须是原生币，以及优先费 = `tx.gasprice − block.basefee`。
18. **PRIMARY** ethereum/EIPs `EIPS/eip-8130.md`（gh api，2026-10-11）。证明 8130 是 Draft，有 `nonce_key`、`NONCE_KEY_MAX` 和 sequenced / unsequenced 模式。
19. **PRIMARY** mantle.xyz 首页（2026-10-11 抓取）。证明官方定位 “Institutional Onchain Finance”，以及 USDG、xStocks、DeFi Vault 动态。
20. brief.md（用户提供）。证明产品方向 meme launchpad、perps、DeFi、payment，以及 FCFS / tips 假设来自用户。

## 开放问题

1. 主网 sequencer 是否开启了 preconf 车道（`--miner.enablepreconfchecker`、白名单）？白名单是哪些地址、服务哪些业务？
2. 主网 sequencer 当前跑的是 op-geth 还是 reth？pure Reth 切换的具体时间？
3. Flashblocks 是基于 op-rbuilder 加 rollup-boost，还是在 mantle-reth preconf builder 上实现？两者对“车道”扩展的友好程度不同。
4. kona-executor 与 mantle-reth / op-revm 的执行代码是否同源？这决定 c 层规则要实现几次。
5. Arsia 主网激活日期：L2BEAT 写 2026-04-16，旧笔记记录的 changelog 写 2026-04-22，需要复核。
6. Mantle 官方是否有 perps / meme launchpad 的公开产品路线（本次没找到一手来源）？
7. “On-chain Governance of Pre-Confirmation Mechanisms” 的合约设计（谁能改策略、有没有 timelock）没有公开细节。
8. EIP-8130 文本变动后，2D nonce 的最终形态，以及 Mantle 采用 8130 还是 8250。

## 台账

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| M1 | Mantle 是 L2BEAT 定级的 Stage 0 ZK Rollup，数据发到 Ethereum blobs，状态由 OP Succinct（SP1）有效性证明验证 | 来源 [6] 页面结构化描述 | observed |
| M2 | L2BEAT 记录 Arsia 里程碑为 2026-04-16，“EigenDA code path removed” | 来源 [6] Milestones & Incidents | observed |
| M3 | 用户可经 L1 强制收录交易，最长延迟 12 小时 | 来源 [6] Sequencer failure 节 | observed |
| M4 | 主网 rollup.json：block_time=2、l2_chain_id=5000、seq_window_size=3600、max_sequencer_drift=600 | 来源 [7] mainnet/rollup.json | observed |
| M5 | 官方文档：交易池私有，sequencer 按 base fee 和 priority fee 处理交易 | 来源 [1] “Transaction Pool in Mantle” 节 | observed |
| M6 | Arsia 前 base fee 静态、建议小费为 0；Arsia 恢复动态 EIP-1559，带最低 base fee 和显式小费 | 来源 [4] L2 Execution Fee 表；来源 [3] “Dynamic EIP-1559 Base Fee” | observed |
| M7 | Arsia 移除了 L2 执行 gas 的 tokenRatio 乘数，但 L1 数据费仍乘 TokenRatio 换算成 MNT | 来源 [3]；来源 [4] `L1DataFee = EstimatedSize * WeightedL1Fee * TokenRatio`；`op-geth/core/state_transition.go:844-846@e33cd26cda` | observed |
| M8 | op-node 的 attributes 模板默认 NoTxPool=true，sequencer 置为 false 才从交易池取交易 | `mantle-v2/op-node/rollup/derive/attributes.go:62-64,171@da45c315d8` | observed |
| M9 | 超过 sequencer drift、升级激活块、recover 模式下 sequencer 只出不含池交易的块 | `mantle-v2/op-node/rollup/sequencing/sequencer.go:563-608@da45c315d8` | observed |
| M10 | 验证者按 batch 原样重放交易（NoTxPool=true），不从交易池取交易 | `mantle-v2/op-node/rollup/derive/attributes_queue.go:129-132@da45c315d8` | observed |
| M11 | 派生阶段对 batch 交易只检查非空、非 deposit、SetCode 时限，没有排序检查 | `mantle-v2/op-node/rollup/derive/batches.go:176-189@da45c315d8` | observed |
| M12 | 现行协议下任何排序规则都只由 sequencer 强制，验证节点和证明无法判定排序违规 | 由 M10、M11 推出：派生与重放不检查顺序 | inferred |
| M13 | op-geth 的 fillTransactions 按 preconf FIFO → prio 账户 → 普通交易三段填块 | `op-geth/miner/worker.go:764-826@e33cd26cda` | observed |
| M14 | op-geth 普通排序：有效小费 min(tipCap, feeCap−baseFee) 降序，同价按首次见到的时间，账户内按 nonce | `op-geth/miner/ordering.go:39-69@e33cd26cda` | observed |
| M15 | op-geth 填块时接受 0 小费交易（MinTip=0） | `op-geth/miner/worker.go:743@e33cd26cda` | observed |
| M16 | 只要有未封装的 preconf 交易，op-geth 就不再放入其他交易，preconf 车道没有容量上限 | `op-geth/miner/worker.go:778-781@e33cd26cda` | observed |
| M17 | preconf 交易的判定规则是 from 在 FromPreconfs 且 to 在 ToPreconfs（或 AllPreconfs 打开）；PreconfTimeout 默认 1 秒 | `op-geth/preconf/tx_pool_config.go:10-67@e33cd26cda` | observed |
| M18 | preconf 集合按接收顺序 FIFO，代码注释给出确定性、公平性等理由 | `op-geth/preconf/fifo_tx_set.go:13-22@e33cd26cda` | observed |
| M19 | `eth_sendRawTransactionWithPreconf` 由 RPC 节点转发到 sequencer；sequencer 需启用 preconf checker，最长等待 2 秒返回预确认结果 | `op-geth/eth/api_backend.go:380-436`；`internal/ethapi/api.go:2295-2297@e33cd26cda` | observed |
| M20 | preconf 功能 2025-06-05 合入 op-geth（#113） | `git log -- preconf miner/miner_preconf.go` 输出 `5bdae6a 2025-06-05 Merge preconf to prectra (#113)` | observed |
| M21 | Sepolia 的 proxyd 开放了 eth_sendRawTransactionWithPreconf；networks 仓库没有主网 proxyd 配置 | 来源 [8] sepolia/proxyd.toml 第 61、157 行；mainnet/ 目录列表 | observed |
| M22 | 主网是否启用 preconf 车道、白名单是谁，没有一手来源；推测服务做市商或支付类合作方 | 来源 [1][2][8] 均未提及主网配置 | speculative |
| M23 | mantle-reth 的 preconf crate 是 fork 出来的 OP payload builder，在 biased select! 循环里交错执行 preconf FIFO 和池内 best-tx，池内交易每 tick 获得 block_gas_limit/ticks_remaining 的配额 | `reth/mantle-reth/crates/preconf/src/lib.rs:1-9`；`builder/payload_builder.rs:768-806,937-960@f022de0f62` | observed |
| M24 | mantle-reth 中 preconf-eligible 交易只能走 FIFO 通道，池分支遇到会 mark_invalid | `reth/mantle-reth/crates/preconf/src/builder/payload_builder.rs:685-700@f022de0f62` | observed |
| M25 | op-reth 交易池使用 CoinbaseTipOrdering | `reth/op-reth/crates/txpool/src/lib.rs:26-39@f022de0f62` | observed |
| M26 | 路线图 2026 H2（未勾选）：主网 Sequencer 和 RPC 切到 pure Reth，Geth 降为灾备热备 | 来源 [2] 2026 H2 “Full-Stack Pure Reth Migration” | observed |
| M27 | 路线图 2026 H2（未勾选）：Flashblocks 亚秒级预确认；预确认策略和路由权限重构为链上动态管理合约 | 来源 [2] “Flashblocks Ultra-Fast Confirmation…” 条目 | observed |
| M28 | 路线图 2026 H2（未勾选）：Prop AMM 支持 “high-priority cancellations (Cancel) and dedicated matching paths” | 来源 [2] “Prop AMM High-Performance Matching Infrastructure” | observed |
| M29 | 路线图 2026 H2（未勾选）：EIP-8130 原生 AA 与 2D nonce，面向高频 payment 和交易 | 来源 [2] “Account Abstraction and High-Concurrency Matching” | observed |
| M30 | mantle-xyz/op-rbuilder 是 flashbots/op-rbuilder 的 fork，main 分支 ahead 0 / behind 64；Mantle 改动只在 feat/mantle-arsia* 分支（2026-05-14） | 来源 [15] gh api compare 与 branches | observed |
| M31 | MANTLE_MIGRATION.md 自称迁移状态：98/112 测试通过，源码只改 3 个文件（TxDeposit 的 eth_value、eth_tx_value） | 来源 [15] `MANTLE_MIGRATION.md@feat/mantle-arsia-v0.2.14` | observed |
| M32 | 没有证据表明 mantle-xyz/op-rbuilder 在生产使用；Mantle 现行 builder 方向是自研的 mantle-reth preconf builder | 由 M23、M30、M31 推出 | inferred |
| M33 | Mantle 的 OP Succinct 证明程序依赖 kona-derive、driver、executor、proof、client，均来自 mantle-v2 tag mantle-v1.6.3 | 来源 [16] Cargo.toml 第 82-99 行 | observed |
| M34 | 协议层排序规则需要同时改 op-node（Go）、kona（Rust，加 SP1 vkey）和 op-geth / reth 的验块 | 由 M11、M33 推出 | inferred |
| M35 | Angstrom L2 要求 pool 的 currency0 为原生币，否则 revert IncompatiblePoolConfiguration | `l2-angstrom/src/AngstromL2.sol:249@81bd4189f4` | observed |
| M36 | Mantle 原生币是 MNT；L2 上的 ETH 是 BVM_ETH（0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111），由 deposit 的 EthValue 铸造 | 来源 [5]；`op-geth/core/state_transition.go:38`；`core/types/deposit_tx.go:44-49@e33cd26cda` | observed |
| M37 | 在 Mantle 部署 Angstrom L2 只能做 MNT/X 池，税以 MNT 计价 | 由 M35、M36 推出 | inferred |
| M38 | op-geth 里 tx.gasprice 等于有效价格 min(baseFee+tipCap, feeCap)，与以太坊语义一致 | `op-geth/core/state_transition.go:348-357`；`core/evm.go:93-96@e33cd26cda` | observed |
| M39 | Arsia 后 `tx.gasprice − block.basefee` 可作为优先费信号；Arsia 前因 base fee 静态且小费为 0，基本无竞价意义 | 由 M6、M7、M38 推出 | inferred |
| M40 | preconf 车道内的交易按 FIFO 排，与小费无关；若 MEV-tax 竞争交易能进入该车道，“小费决定顺序”的前提就不成立 | 由 M13、M18、M35 推出 | inferred |
| M41 | EIP-8130 当前为 Draft（title “Keystore Accounts”），用 nonce_key 区分通道，nonce_key==NONCE_KEY_MAX 为 nonce-free；unsequenced 批次之间顺序未定义 | 来源 [18] eip-8130.md 第 1-11、115-120、233-234、308 行 | observed |
| M42 | 官方首页定位为 “Institutional Onchain Finance”，近期动态包括 USDG（2026-09-03）、xStocks、DeFi Vault | 来源 [19] mantle.xyz 首页 | observed |
| M43 | meme launchpad 和 perps 是用户提供的方向，本次读到的 Mantle 官方页面没有对应表述 | 来源 [20] brief “为什么现在”；来源 [2][19] 未提及 | observed |
| M44 | 外部调研引用的 mantle.xyz/blog/research/fair-sequencing 现在重定向到首页，2024 年 VRF 排序研究无法核实 | `curl -sL` 返回内容与首页相同（212192 字节） | observed |
| M45 | 泛化 preconf 分类器（to × selector × 类别）加 mantle-reth 配额调度，是 Mantle 实现分层车道改动最小的路径 | 由 M16、M17、M23、M27 推出 | inferred |

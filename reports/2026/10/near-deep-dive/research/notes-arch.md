# notes-arch：NEAR L1 架构、优化与取舍（lane A）

**研究问题**：NEAR L1 的账户模型、异步 receipt 执行、拥塞控制、Nightshade + stateless validation、动态 resharding、出块/finality、yield/resume、global contracts、gas keys 各是什么机制？它们分别在哪个协议版本 / nearcore 版本上了主网？换来了什么，又付出了什么？1M TPS 和 SPICE 哪些是现状，哪些是计划？
**一句话答案**：NEAR 是“账户 = 分片最小单位 + 跨账户一律异步 receipt”的分片链。状态验证靠 stateless validation：按 stake 抽样的 chunk validator 拿 state witness 重新执行（不是 validity proof）。主网 2026-10-07 运行在协议版本 86（nearcore 2.13.4）上，gas keys、ML-DSA-65 后量子签名、动态 resharding 都已在这个版本启用。SPICE（共识与执行分离）在代码里只是 nightly 都不包含的实验特性（PV 180），还没上线。1M TPS 是 70 个分片、只跑原生转账的基准测试，不是主网现状。代价主要有三类：应用必须自己写补偿 / 回滚逻辑；单个账户（热点合约）没法被拆到多个分片；witness 带宽和大小上限会限制单笔交易 / receipt 的大小。

> 版本口径：nearcore 的 `ProtocolFeature` 版本号（代码）≠ 主网激活版本。2.13.0 把主网从 PV 84 直接升到 86 [33]，所以代码里标成 85 的特性（gas keys、PQ、动态 resharding 等）在主网上是随 PV 86 一起生效的。

---

## 1. 账户模型与 Access Key / Gas Key / Meta tx / 存储质押

**答案**：账户 ID 是人类可读的名字（`alice.near`、`sub.alice.near`），和密钥解耦，一个账户可以挂多把 access key。access key 有 FullAccess 和 FunctionCall 两类；FunctionCall key 的 `allowance` 只是 gas 预算，不是资产额度。gas key（NEP-611）是带独立预付余额、最多 1,024 条 nonce lane 的一种 access key，代码中是 PV 85 特性，主网随 2.13 / PV 86 生效。它的设计动机写在 NEP 里：给 SPICE 之后“先纳入、后执行”的交易做防垃圾交易准备。存储质押按 `storage_amount_per_byte = 1e19 yN`（0.00001 NEAR/字节，相当于每 100 KB 锁 1 NEAR）计算。

**依据**：
- `AccessKeyPermission` 有四个变体：`FunctionCall`、`FullAccess`、`GasKeyFunctionCall(GasKeyInfo, FunctionCallPermission)`、`GasKeyFullAccess(GasKeyInfo)`；`MAX_NONCES_FOR_GAS_KEY = 1024` [6]。
- `FunctionCallPermission` 由 `allowance: Option<Balance>`（注释写的是 “balance limit … to pay for function call gas and transaction fees”）、`receiver_id`、`method_names`（空列表表示任意方法）组成 [6]。docs.near.org 写明 FunctionCall key 不能附带 NEAR，`allowance` 是“花在 gas 上的 NEAR 数额” [27]。
- Gas key：`GasKeyInfo { balance, num_nonces }`；删除 key 或账户时要烧掉的余额超过 1 NEAR 就拒绝执行（`MAX_BALANCE_TO_BURN`）[6]。NEP-611 规定 gas 费从 key 余额扣、deposit 从账户扣，gas 退款回到 key，余额退款回到账户；删除 key 时剩余余额烧掉（防“先刷交易再删 key 拿回钱”）；使用 gas key 的 FunctionCall key 只能是无限 allowance [24]。
- NEP-611 的 Summary 和 Motivation 写的是：SPICE 让执行滞后于纳入，chunk producer 纳入交易时已经验证不了余额，因此需要 Pending Transaction Queue 加上 gas key；带合约的账户用普通 access key 并发的上限建议为 P_max = 4。在 SPICE 之前，这个队列视为空 [24]。NEP-611 在 NEPs 仓库里的状态仍然是 **Draft**（v1.2.2，2026-03-05）[24]，但 nearcore 2.13.0 已经把它 “Stabilized” [2][33]。
- 版本：`GasKeys`、`DelegateV2` 等特性 → 85 [1]；2.13.0 release 写明 “upgrades the protocol version from 84 directly to 86”，PV 86 的投票从 2026-07-20 00:00 UTC 开始 [33]。2026-10-07 主网 RPC 返回 `protocol_version: 86`、节点版本 2.13.4 [34]。docs.near.org 的写法是“gas keys introduced in nearcore 2.13 (protocol version 86)” [27]。
- Meta tx：NEP-366 的 `DelegateAction` 让 relayer 代付 gas；生成的内层 receipt 中 `predecessor_id` 是用户、`signer_id` 是 relayer [21]。gas key 不能签旧版 `Delegate`（错误 `DelegateActionRequiresNonGasKey`）。2.13 新增了 `DelegateV2` 支持 gas key 签 meta tx（PV 85），2.14 又用 `RejectDelegateV2`（PV 87）把它禁用，原因是 SPICE 的 pending 队列跟踪不到内层 nonce [1][2]。主网目前在 PV 86，所以 **DelegateV2 现在主网上可用，2.14 上线后会被拒绝**（由 [1][34] 推出）。
- 隐式账户：64 位 hex 的 ed25519 隐式账户（docs 写明默认带 FullAccess key）[27]；`0x` + 40 hex 的 ETH 隐式账户（NEP-518，nearcore 2.1.0），创建时不加 access key，而是部署 wallet contract，`rlp_execute` 接受以太坊签名的交易 [22][2]。2.11.0 起 ETH 隐式账户改用 global contract [2]。另有 `0s` 确定性账户（NEP-616，2.10.0，87.yaml 注释写 “live since protocol 82”）[25][2][5]，以及 `0u` universal accounts（PV 87，2.14，未上主网）[1][2]。
- 存储：`storage_amount_per_byte: 10000000000000000000 yN`、`storage_num_bytes_account: 100`、`storage_num_extra_bytes_record: 40` [3]。NEP-591 的例子是“300kb 合约要 3N” [20]，与该参数一致。2.13 还把新建账户的成本提到约 0.007 NEAR，并引入 `min_gas_purchase_price = 0.001 NEAR/Tgas`（买价高、烧价低，差额退回）[2][4]。

**不确定之处**：nonce lane 在 SPICE 之前除了“免去管理多把 key”还有没有吞吐收益，NEP 没有给数据。NEP-611 的 Draft 状态和 nearcore 的 “Stabilized” 不一致，以代码和主网 PV 为准。

## 2. 执行模型：交易 → receipt，跨合约调用一律异步

**答案**：签名交易先在 signer 所在分片转换成 ActionReceipt（这一步验签、扣费）。receipt 只读写单个账户的状态，跨账户调用都通过新 receipt（返回值通过 DataReceipt）在后续区块执行。即使两个账户在同一分片，也不会同步调用。callback 无论被调方成功还是失败都会执行，失败不会回滚调用方已经提交的状态。只有同一个 receipt 内的批量 action 是原子的。

**依据**：
- cross-shard.md：转换必须在 signer 分片完成，因为只有它有 access key 状态；示例转账跨 B、B+1、B+2 三个块（转换 → 转账 → 退款）；原文 “we have to assume that each account is on a separate shard … colocated doesn't give any advantage” [14]。
- tx_receipts.md：只有 sender == receiver 时 receipt 才进 `local_receipts`、在同块执行；其他新 receipt 进 outgoing 队列，“executed in the next block”；本块执行不完的进 delayed 队列 [15]。
- docs.near.org：调用函数和 callback “execute in different blocks (typically 1-2 blocks apart)”；外部调用失败时调用方已成功，“no automatic rollback”；callback 一定执行，需要手动回滚状态，附带的 NEAR 退回到合约账户；同一合约的 batch call “act as a unit”；调用多个合约时各自独立，互不回滚 [28]。
- SPICE 博客的说法：receipt 是 “a unit of execution with the property of only accessing the state of a single shard”；单笔交易的执行可以跨多个块、与其他交易交错，“not linearizable” [32]。
- Gas：signer 预付全部 gas（gas 量 × gas price）[13]。PV 78（NEP-536）起买价等于烧价，不再有悲观 gas price [13]。gas 被烧掉，不归验证者 [13]。30% 的 gas 奖励给合约（`burnt_gas_reward 3/10`）[3]，PV 87 归零（2.14，未上主网）[5][2]。单笔交易可预付 gas 上限 `max_total_prepaid_gas = 1 PGas`（2.11.0 从 300 Tgas 提到 1 PGas）[3][2]。
- **gas price 由哪个分片决定？** 不由单个分片决定：区块头里只有一个 `gas_price`，“all shards share the same gas price”，涨跌按全部分片的平均利用率是否超过 50% 来定；一个分片 100% 满载不会推高价格 [13]。

**不确定之处**：docs 写的 “1-2 blocks” 是常态延迟；拥塞时 receipt 会进 delayed / buffered 队列，延迟没有上界保证（由 [15][9] 推出）。

## 3. 拥塞控制（NEP-539，nearcore 2.0.0；2.4.0 放宽）

**答案**：每个分片在 chunk header 里广播自己的拥塞信息（`delayed_receipts_gas`、`buffered_receipts_gas`、`receipt_bytes`、`allowed_shard`）。congestion level 取 incoming、outgoing、memory、missed-chunks 四种拥塞的最大值，范围 0–1。三个规则：(a) 目标分片 congestion level ≥ `reject_tx_congestion_threshold`（现行 0.8）时，所有分片都拒收以它为 receiver 的新交易；(b) 本分片的新交易 gas 额度随自身 incoming 拥塞在 500 Tgas 到 20 Tgas 之间线性插值；(c) 发往拥塞分片的 receipt 额度在 300 PGas 到 1 PGas 之间插值，完全拥塞（=1.0）时只有轮值的 `allowed_shard` 还能发 1 PGas，其余分片为 0，用来防死锁。

**依据**：
- 现行参数：`max_congestion_incoming_gas 400 PGas`、`max_congestion_outgoing_gas 10 PGas`、`max_congestion_memory_consumption 1000 MB`、`max_congestion_missed_chunks 125`、`max_outgoing_gas 300 PGas`、`min_outgoing_gas 1 PGas`、`allowed_shard_outgoing_gas 1 PGas`、`max_tx_gas 500 TGas`、`min_tx_gas 20 TGas`、`reject_tx_congestion_threshold 80/100` [3]。
- NEP-539 原始值不同：REJECT 阈值 0.25、incoming 20 PGas、outgoing 2 PGas、missed chunks 10 [19]。2.4.0 记载了 “Relaxing Congestion Control to allow accepting and buffering more transactions” [2]。
- 代码：`outgoing_gas_limit` 完全拥塞时只给 `allowed_shard` 放行，否则 `mix_gas(max, min, congestion)` [7]；`process_tx_limit` 按 incoming 拥塞插值 [7]；`shard_accepts_transactions` 和 `reject_tx_congestion_threshold` 比较 [7]。
- 设计说明：用 gas 而不是字节衡量 incoming 拥塞，因为目标是利用率；backpressure 只作用于 incoming，以避免死锁；最坏情况下全局吞吐退化到单分片的 `1000 Tgas / NUM_SHARDS` [9]。
- 2.13 的 `ClampOutgoingGasAdmission`：转发 buffered receipt 时，准入检查上限截到 `allowed_shard_outgoing_gas` [2]。

**不确定之处**：主网实际触发拥塞的频率和持续时长需要看链上 / 面板数据，本 lane 没有取得。

## 4. Nightshade 分片 + stateless validation（NEP-509，nearcore 2.0.0，主网 2024-08）

**答案**：chunk producer 维护分片状态，产出 chunk 和 `ChunkStateWitness`（执行所需的 trie 子集加包含证明、源 receipt 证明、交易）。被抽样分配到该分片的 chunk validator 不保存状态，拿 witness 重新执行、核对 post-state-root，然后签 `ChunkEndorsement` 发给 block producer。block producer 只有拿到“分配给该分片的 stake 的 > 2/3” endorsement，才把这个 chunk 打进区块。witness 让人可以重放执行，但它不是简洁证明（succinct proof）。

**依据**：
- NEP-509：witness 的定义是 “a subset of the trie state, alongside its proof of inclusion”；门槛 “more than 2/3 … the denominator being the total stake assigned to validate this shard”；chunk 拿不到足够 endorsement 就不纳入区块；用这套机制替代 fraud proof / challenge / rollback，原因是那些机制组合起来过于复杂 [17]。
- 角色（NEP-509 原文）：block producer 和 block validator 不再需要跟踪分片；chunk producer 必须跟踪自己的分片；chunk validator 不跟踪分片，但整体要持有多数 stake [17]。
- 抽样：stake 切分成 mandates，每个高度用该高度的种子打乱后分配到各分片；Stage 0 每分片 68 个 mandates [17]。2.8.0 把验证者数从 300 提到 500、每分片 mandates 提到 105 [2]。
- 代价（NEP-509 Consequences）：安全性变成概率性的；带宽和内存需求上升；交易和 receipt 大小受限（`max_transaction_size` 1.5 MiB）；witness 目标 ≤16 MiB；分片分发采用 Reed-Solomon，数据分片占比 0.6；最坏情况每节点约 214 Mbps [17]。好处：验证者最多跟踪一个分片，非 top 节点不需要存任何分片 [17]。
- 现行参数：`main_storage_proof_size_soft_limit 4_000_000`（NEP 里是 3 MB）、`per_receipt_storage_proof_size_limit 4_000_000`、`combined_transactions_size_limit 4_194_304`、`new_transactions_validation_state_size_soft_limit 572_864`、`outgoing_receipts_usual_size_limit 100 KiB`、`outgoing_receipts_big_size_limit 4.5 MiB` [3]。代码硬上限 `MAX_UNCOMPRESSED_STATE_WITNESS_SIZE = 64 MiB` [8]。2.14 新增 `max_receipt_total_input_size 4_194_944`，并把 per-receipt proof 上限扩展到所有 action，理由是 promise 输入数据会直接进 witness [2][5]。
- 上线：CHANGELOG 2.0.0 写有 “Stateless Validation NEP-0509” 和 “Congestion Control NEP-0539” [2]；near.org 的公告称 Nightshade 2.0 上线时为 6 个分片 [39]（页面无日期，2024-08 这个日期来自二手报道，见开放问题）。

**不确定之处**：当前主网 chunk validator 的实际数量和每分片 mandate 价格没有拿到链上数据；硬件需求没有官方的“前后对比”数字。

## 5. 动态 resharding（NEP-639；代码 PV 85，主网随 PV 86 生效）

**答案**：每个 epoch 末，各分片在 chunk 应用时检查 trie 的 memory_usage。超过 `memory_usage_threshold`、且两个子分片都不小于 `min_child_memory_usage` 时，在 chunk header 里提出 `proposed_split`。epoch 最后一个区块的 block producer 选出内存最大的那一个（强制拆分的分片优先），写进 block header，新布局在 N+2 epoch 生效。每个 epoch 最多拆一个，有冷却期，并受 `max_number_of_shards` 限制。边界是一个 AccountId，所以单个账户（含它的合约代码和 storage）不可能被拆开，热点合约受益有限。

**依据**：
- 机制、两 epoch 延迟、每 epoch 至多一次拆分、`can_reshard` 冷却、优先级（max shards > force > block > 阈值）、chunk header 和 block header 都由验证者重算防伪造 [10][26]。
- 拆分点：在 ACCOUNT / CONTRACT_CODE / ACCESS_KEY / CONTRACT_DATA 四个列上同时下降；用 “Split B：追加 -0” 处理 “big middle accounts”，即把整个大账户推到左侧 [10][26]。
- 上线节奏：NEP-639 写明首次上主网时 `max_number_of_shards` 设为“当前分片数 + 1”，以后通过协议升级逐步放开；阈值写在随二进制发布的 epoch config JSON 里，修改需要协议升级 [26]。
- 状态：CHANGELOG 2.13.0 写 “Stabilized dynamic resharding” [2]；NEAR 2026-07-20 新闻稿写 “introducing dynamic resharding … in roughly 1.5 epochs” [35]。
- 分片数：1M TPS 博客（2025-12）写 “Currently, mainnet is operating with 9 shards” [31]；near.org 动态 resharding 博客写 “9 shards today (as well as a private shard powering Confidential Intents)”，历史为 1→4（2022）→6（2024）→8（2025 初）→9 [36]。
- 热点合约：near.org 博客承认 “a single smart contract always lived on a single shard”，给出的办法是 NEP-616 确定性账户 / sharded contracts，并称 Intents 的 wallet contracts 和 global-deployer 已经采用 [36][25]。
- 文档 vs 代码：dynamic_resharding.md 写 `StickyReshardingValidatorAssignment` 是 PV 153，但 version.rs 把它列为 85 的稳定特性 [10][1]；该文档还说 epoch “~12 hours on mainnet”，NEP-639 写两个 epoch 约 14.5 小时 [10][26]。

**不确定之处**：PV 86 之后主网有没有真正发生过自动拆分、当前到底是 9 还是 10 个分片，本 lane 没能用一手数据核实（需要 `EXPERIMENTAL_protocol_config` 的 POST RPC 或 Near One 公告）。“协议支持”已经确认，“已经自动拆分过”没有确认。

## 6. 出块与 finality

**答案**：官方口径是 600 ms 出块、1.2 s finality，由 optimistic block（PV 77，nearcore 2.6.0）实现，于 2025-05 宣布。2026-10-06 至 10-07 的 RPC 实测平均出块间隔约 0.590 s。finality 规则（Doomslug）是：区块 B 之上出现两个高度连续的块时 B 即 final，所以 finality ≈ 2 个块时间。

**依据**：
- optimistic_block.md：“introduced with protocol version 77”；下一任 block producer 在上一块产出后立即发布不含 chunk 的 optimistic block，chunk producer 提前执行，chunk 应用只作为缓存使用；这不是协议变更 [11]。CHANGELOG 2.6.0：“Implemented Optimistic Block to remove doubled chunk execution latency” [2]。
- near.org：600 ms 出块 / 1.2 s finality，归功于 optimistic block [37]；SPICE 预告文称 “as of May 2025” [38]。
- 实测：`/status` 显示 earliest 区块 218,778,733 @ 2026-10-06T10:26:09.111Z，latest 区块 218,900,968 @ 2026-10-07T06:28:35.228Z。高度差 122,235，用时 72,146 s，即约 0.590 s/高度 [34]。
- Consensus.md 的 finality 条件：B 是 prev(prev(X))，且 h(X)=h(prev(X))+1=h(B)+2 [16]。

**不确定之处**：1.2 s 是“2 × 600 ms”的理论值；没有拿到端到端交易 finality 的分布统计。跨分片交易需要多个块，用户感知的“交易完成”比单块 finality 更长（由 [14][16] 推出）。

## 7. yield/resume（NEP-519）

**答案**：`promise_yield_create` 登记一个 continuation 回调，`promise_yield_resume` 用 resumption token 唤醒它。最长等 200 个区块，超时后回调照常执行，但拿到的是超时错误。NEP 原文的动机示例**明确就是 MPC 签名合约**：链外 indexer 观察到请求、计算签名、回调合约。

**依据**：NEP-519 的 Motivation（MPC signer contract、`sign_payload`、`signature_available`）、函数签名和 200 块超时 [18]；参数 `yield_timeout_length_in_blocks: 200`、`max_yield_payload_size: 1_024` [3]；docs 写 “200 blocks - around 2 minutes”，超时时回调收到 timeout error，并强调必须给 resume 入口加访问控制 [29]。2.11.0 修复了 “resume 调用过快会失败” 的问题 [2]。2.13 新增 `promise_yield_create_with_id` / `promise_yield_resume_with_yield_id`（PV 85，用于 “in-contract mempools”）[2][1]。

**不确定之处**：yield/resume 首次上主网的确切 nearcore 版本没有在本 lane 的 CHANGELOG 片段中找到；CHANGELOG 2.2.0 已提到 PromiseYield receipts，所以最晚在 2.2.0 时已经在用（推断）。docs 说 “200 blocks ≈ 2 min”，按 600 ms 出块其实约 120 s，两者一致。

## 8. Global contracts（NEP-591，nearcore 2.6.0）

**答案**：`DeployGlobalContractAction` 有两种部署方式：按 code hash（不可变）或按 owner 账户（owner 重新部署后所有引用方自动升级）。使用方通过 `UseGlobalContractAction` 只在自己账户里存一个引用。代码在每个分片的 trie 里各存一份副本，部署方按字节**烧掉** NEAR（不是锁定）。

**依据**：NEP-591 的规格；动机原文为 “For a 300kb contract the cost is 3N”、“With the advent of chain signatures, the smart contract wallet use case will become more ubiquitous”，以及 NEP-491 所说的退款滥用 [20]。参数 `global_contract_storage_amount_per_byte: 0.0001 N`（普通存储的 10 倍）[3]。docs：“10x more … 10 NEAR per 100KB … entirely burnt” [30]。CHANGELOG 2.6.0 “Implemented support for global contracts” [2]。ETH 隐式账户的 wallet contract 从 2.11 起改用 global contract [2]。2.14 和 unreleased 版本里还有若干 global contract 修复（同 chunk 调用、未部署时调用卡住 shard）[2]。

**不确定之处**：docs 的 “Cross-Shard Superpowers … minimal latency” 是营销表述；调用 global contract 仍然是普通异步 receipt（推断）。

## 9. 1M TPS 基准（Near One，2025-12-11）

**答案**：这是用主网同一份 `neard` 代码在**独立测试网**上跑出的峰值 1M 原生转账/秒，不是主网能力。

**依据** [31]：70 个分片、140 个节点（每分片 2 个 chunk producer），部署在 GCP 三个区域（us-central1、us-east1、us-east4），机型 c4d-highmem-16（8 核），预算约 1k 美元/月/节点；负载为原生转账、100 万账户、Zipf-Mandelbrot 分布；**交易由 chunk producer 自己生成和签名，绕开 RPC**；稳态 0.5 block/s（每块 2 s）、对等流量约 64 MB/s；为测上限，关闭或调整了 compute-cost 和 witness 大小上限；mandate 数量按“每节点验证量等同主网前 20% 验证者”设定（平均每节点验 5 个分片）。列出的优化有：early transaction preparation（`enable_early_prepare_transactions`，以牺牲最新交易的纳入换吞吐）、少落盘（`save_tx_outcomes` / `save_state_changes` / `save_untracked_partial_chunks_parts`）、Ed25519 批量验签（128 个一批，CPU 降约 40%，整体只提升 7–10%）、反序列化列缓存、RocksDB 调优、TCP BBR、actor 拆分、witness recorder 锁优化。博客把 RPC / 归档、state sync part、gas 上限和拥塞控制、FT 转账都列为 future work。

## 10. SPICE 与其他路线；版本现状；后量子签名

**答案**：SPICE 要拆开三处耦合：执行必须先于纳入、receipt 必须进下一块、出块要等上一块被执行并验证完，以及 DA。拆开后链只排序 “statements”，Data Store 和 Execution 各自异步推进。**现状：研究 / 开发中**，代码中 `Spice => 180`，注释说明它被有意排除在 nightly 之外。后量子：ML-DSA-65 用于交易签名和 access key，**已随 PV 86 上主网**；合约侧的 `ml_dsa_verify` host function 属于 PV 87，未上主网。

**依据**：
- SPICE 第 1 篇（2026-09-30）：列出四项依赖；Chain / Data Store / Execution 三组件；state certificate 目前用 quorum certificate；把分片类比为内建的 rollup [32]。博客没有给出上线时间。near.org 预告文称 “Currently in development”，上线后出块从 600 ms 降到 200 ms，跨分片原子执行 “will require a further update after SPICE” [38]——这些都是**计划**。
- 代码：`ProtocolFeature::Spice => 180`，注释 “Spice is setup to include nightly, but not be part of it for now”；`STABLE_PROTOCOL_VERSION = 88`、`NIGHTLY = 157`、`SPICE_PROTOCOL_VERSION = 200` [1]。dynamic_resharding.md 的 TODO 写明 SPICE 还不能正确处理 resharding [10]。gas keys 和 `RejectDelegateV2` 都是在为 SPICE 的 pending 队列铺路 [24][2]。
- docs/architecture/next/ 下只有 catchup/state sync 和旧的 “malicious producers and phase 2” 两篇，没有 SPICE 文档 [42]。
- 版本：Releases 页上 2.13.4 是最新稳定版（安全更新），2.14.0-rc.3 是最新预发布版；2.14.0-rc.1 标注 PROTOCOL_UPGRADE: TRUE [33]。主网 RPC 显示 2.13.4 / PV 86 [34]。master 分支已把 stable 定为 88（含 unreleased 内容）[1][2]。
- PQ：`PostQuantumSignatures` 在 85 版本稳定；范围只覆盖交易签名、access key 和 `ml_dsa_verify`；validator key、区块签名、隐式账户推导都**不**在范围内；公钥在 trie 里存 SHA3-256 哈希（33 字节）；验签额外收 100 Ggas [12][4]。新闻稿（2026-07-20）称 2.13 “adding quantum-safe signing … on mainnet” [35]。`ml_dsa_verify_host_fn` 在 87.yaml 中启用 [5]。

## 11. 小结表（设计 → 解决的问题 → 代价 → 服务的上层产品）

| 设计 | 解决的问题 | 代价 / tradeoff | 上层产品（除标注外均为 inferred） |
|---|---|---|---|
| 命名账户 + 多 access key | 地址与密钥解耦，可轮换、可细粒度授权 | allowance 只限 gas，不限资产；授权语义要靠合约补齐 | Chain Signatures 派生地址绑定 NEAR 账户；PQ 密钥轮换（新闻稿明说）[35] |
| Gas keys（PV 85/86） | SPICE 下的垃圾交易防护；并发 nonce | 删除时烧余额；目前不能签 meta tx（PV 87 起） | relayer / bot / agent（docs 明说）[27]；Intents solver（inferred） |
| 异步 receipt | 分片间不需要全局同步执行 | 无自动回滚；callback 安全问题；执行非线性化 | Intents 把需要原子性的余额集中到一个 verifier 合约（inferred） |
| 拥塞控制 | 内存有界、backpressure | 热点分片会拒收新交易；退化到单分片吞吐 | 所有产品 |
| Stateless validation | 验证者不再需要跟踪所有分片 | 概率安全；witness 带宽；交易 / receipt 大小上限 | 为增加分片铺路 |
| 动态 resharding | 不发协议升级就能增加分片 | 单账户不可拆；每 epoch 至多一次；N+2 生效 | Intents（新闻稿明说）[35] |
| Optimistic block | 消除 2 倍的 chunk 执行延迟 | 预测错了要回退到正常执行 | Intents UX（inferred） |
| Yield/resume | 合约等待链外结果 | 200 块超时；resume 入口必须加访问控制 | Chain Signatures（NEP 明说）[18] |
| Global contracts + 0s 账户 | 同一代码大量部署时的存储成本；sharded contract | 部署费烧掉；按账户引用意味着信任 owner 升级 | 智能合约钱包 / chain signatures（NEP 明说）[20]；Intents wallet / global-deployer（博客明说）[36] |
| ML-DSA-65 | 账户层后量子签名 | 签名 3.3 KB；验签贵（额外 100 Ggas）；validator key 不在范围 | 新闻稿把 Intents 和账户一起提及 [35] |

---

## 图的素材

**G1 异步跨合约调用时序（A 调 B，再 callback 回 A）** [14][15][28]
1. 用户签 tx（signer=user，receiver=A）→ 块 H，user 所在分片：验签、扣预付 gas → ActionReceipt(A)。
2. H+1，A 所在分片：执行 A.method，生成 ActionReceipt(B.fn)，以及一个等待 DataReceipt 的 callback receipt(A.cb)。A 的状态改动**此时已提交**。
3. H+2，B 所在分片：执行 B.fn（成功或失败）→ DataReceipt（结果）发给 A。
4. H+3，A 所在分片：A.cb 执行，用 `#[callback_result]` 读取 `Result<T, PromiseError>`，失败时手动回滚 / 退款。
5. 之后：退款 receipt（predecessor=`system`）把未用完的 gas 退给 signer。
- 标注：同分片也不会同步执行；只有 signer==receiver 的转换 receipt 能在同块执行（local_receipts）。

**G2 Stateless validation 角色分工** [17][11]
- Chunk producer（跟踪分片状态）：应用 chunk → 生成 ChunkStateWitness → 用 Reed-Solomon 切片发给 N 个 chunk validator（切片 owner 再相互转发）。
- Chunk validator（无状态，按 mandate 每个高度抽样）：重建 witness → 重新执行 → 比对 post-state-root → ChunkEndorsement 发给 h..h+4 高度的 block producer。
- Block producer（不跟踪分片）：每个 chunk 收齐 >2/3（分母是该分片被分配的 stake）的 endorsement 才纳入 → 出块 → Doomslug approvals。
- Optimistic block：上一块一出，就发布不含 chunk header 的 optimistic block，让 chunk producer 提前执行。

**G3 拥塞状态机（以接收分片 R 为例）** [3][7][19]
- 绿 / 黄：congestion = max(incoming/400P, outgoing/10P, memory/1000MB, missed/125) < 1 → 其他分片发往 R 的 gas 额度 = mix(300 PGas, 1 PGas, c)。
- 拒收新交易：c ≥ 0.8 → 所有分片拒收 receiver 在 R 的新交易。
- 红：c = 1.0 → 只有 `allowed_shard`（轮值）可以发 1 PGas，其余为 0。
- R 自身新交易的 gas 额度：mix(500 Tgas, 20 Tgas, incoming_c)。

**G4 动态 resharding 时间线** [10][26]
- epoch N 末尾几个块：chunk 应用时计算 `proposed_split` → 写进 chunk header。
- epoch N 最后一块：block producer 选出 `shard_split` → 写进 block header（验证者重算）。
- N→N+1 边界：finalize_epoch 为 N+2 派生 ShardLayoutV3，后台预加载父分片 memtrie（约 30 s）。
- epoch N+2：新布局生效；子分片得到新 ShardId（max+1、max+2）；chunk producer 粘性分配到子分片。

**G5 L1 能力上线时间线（nearcore 版本 / PV / 主网）**
- 2.0.0：stateless validation + 拥塞控制（主网 2024-08，6 个分片）[2][39]
- 2.1.0：ETH 隐式账户 NEP-518 [2]
- 2.4.0：放宽拥塞控制；合约代码移出 witness [2]
- 2.5.0：Resharding V3（NEP-568）+ bandwidth scheduler（NEP-584）[2]
- 2.6.0：global contracts（NEP-591）+ optimistic block（PV 77）→ 600 ms / 1.2 s（2025-05 宣布）[2][11][37]
- 2.7.0：NEP-536（PV 78）去掉悲观 gas price [2][13]
- 2.8.0：验证者 300→500、每分片 mandates 105 [2]
- 2.10.0：确定性账户 `0s`（NEP-616，PV 82）[2][5]
- 2.11.0：合约 gas 上限 1 PGas；ETH wallet 改用 global contract [2]
- 2025-12：1M TPS 基准（测试网，70 个分片）[31]
- 2.13.0：gas keys、ML-DSA-65、动态 resharding、DelegateV2、yield_with_id；PV 84→86，2026-07-20 开始投票 [2][33][35]
- 2.14.0-rc（PV 87，未上主网）：移除 DelegateV2、gas reward 归零、`ml_dsa_verify`、universal accounts `0u` [2][33]
- SPICE：PV 180，代码实验特性；2026-09-30 发设计文章 [1][32]

**G6 对比维度（NEAR vs EVM rollup 心智模型）**：调用语义（异步 receipt vs 同步调用栈）、回滚范围（单 receipt vs 整笔 tx）、状态划分单位（账户 vs 无）、费用市场（全链单一 gas price vs 单 sequencer）、验证方式（抽样重执行 vs fraud / validity proof）[14][13][17][32]。

---

## 代码素材

**C1 Access key 权限枚举** — `near/nearcore/core/primitives-core/src/account.rs#L909-L923@090da3191758c75787ce14569528bf0e9d71246c`
```rust
pub enum AccessKeyPermission {
    FunctionCall(FunctionCallPermission),
    /// Grants full access to the account.
    FullAccess,
    /// Gas keys are a kind of access keys with a prepaid balance to pay for gas.
    GasKeyFunctionCall(GasKeyInfo, FunctionCallPermission),
    GasKeyFullAccess(GasKeyInfo),
}

impl AccessKeyPermission {
    pub const MAX_NONCES_FOR_GAS_KEY: NonceIndex = 1024;
```
（注释有删减；`FunctionCallPermission { allowance: Option<Balance>, receiver_id: String, method_names: Vec<String> }` 见同文件 L959-L978。）

**C2 跨合约调用 + callback（near-sdk 高层 API）** — `near-examples/cross-contract-calls/contract-simple-rs/src/high_level.rs#L9-L37@ac0211d6556720b4dd51baa25a828f1b10e185dc`（docs.near.org/smart-contracts/anatomy/crosscontract 引用的就是这段）
```rust
pub fn hl_query_greeting(&self) -> Promise {
    let promise = hello_near::ext(self.hello_account.clone())
        .with_static_gas(FIVE_TGAS)
        .get_greeting();
    promise.then(
        Self::ext(env::current_account_id())
            .with_static_gas(FIVE_TGAS)
            .hl_query_greeting_callback(),
    )
}
#[private] // only callable by env::current_account_id()
pub fn hl_query_greeting_callback(
    &self,
    #[callback_result] call_result: Result<String, PromiseError>,
) -> String {
    if call_result.is_err() {
        log!("There was an error contacting Hello NEAR");
        return "".to_string();
    }
    call_result.unwrap()
}
```

**C3 拥塞时发往某分片的 gas 额度** — `near/nearcore/core/primitives/src/congestion_info.rs#L80-L93@090da3191758c75787ce14569528bf0e9d71246c`
```rust
pub fn outgoing_gas_limit(&self, sender_shard: ShardId) -> Gas {
    let congestion = self.congestion_level();
    if Self::is_fully_congested(congestion) {
        // Red traffic light: reduce to minimum speed
        if sender_shard == ShardId::from(self.info.allowed_shard()) {
            self.config.allowed_shard_outgoing_gas
        } else {
            Gas::ZERO
        }
    } else {
        mix_gas(self.config.max_outgoing_gas, self.config.min_outgoing_gas, congestion)
    }
}
```

**C4 Yield host functions（NEP 原文签名）** — `near/NEPs/neps/nep-0519.md@dcc0bcbd452f68c936696e5f9552e567c3b162e0`
```rust
pub fn promise_yield_create(method_name_len: u64, method_name_ptr: u64,
    arguments_len: u64, arguments_ptr: u64, gas: u64, gas_weight: u64,
    register_id: u64) -> u64;   // callback runs after resume or after 200 blocks
pub fn promise_yield_resume(data_id_len: u64, data_id_ptr: u64,
    payload_len: u64, payload_ptr: u64) -> u32; // 1 = submitted, 0 = timed out / already run
```

**C5 协议版本闸门（SPICE 未进 nightly）** — `near/nearcore/core/primitives-core/src/version.rs#L200-L202,L243-L252@090da3191758c75787ce14569528bf0e9d71246c`
```rust
// Spice is setup to include nightly, but not be part of it for now ...
ProtocolFeature::Spice => 180,
const STABLE_PROTOCOL_VERSION: ProtocolVersion = 88;
const NIGHTLY_PROTOCOL_VERSION: ProtocolVersion = 157;
const SPICE_PROTOCOL_VERSION: ProtocolVersion = 200;
```

---

## 来源

（GitHub 固定 commit：nearcore @090da3191758c75787ce14569528bf0e9d71246c；NEPs @dcc0bcbd452f68c936696e5f9552e567c3b162e0；网页访问日期均为 2026-10-07）

1. **PRIMARY** nearcore `core/primitives-core/src/version.rs`（L157-L202、L213、L243-L252）：各 ProtocolFeature 的稳定版本号（GasKeys / DynamicResharding / PostQuantum / DelegateV2 → 85；RejectDelegateV2 等 → 87；Spice → 180）、STABLE 88、MIN_SUPPORTED 84。
2. **PRIMARY** nearcore `CHANGELOG.md`（2.14.0 在 L19 起，2.13.0 在 L53 起，gas keys L61，DelegateV2 L62，yield_with_id L63，动态 resharding L72；其余按版本小节引用）：各特性落在哪个 nearcore 版本。
3. **PRIMARY** nearcore `core/parameters/res/runtime_configs/parameters.yaml`（L24-L29 witness 限制，L36-L38 存储，L341 yield 超时，L365-L381 拥塞，L401 global contract 存储价）：现行运行时参数基线。
4. **PRIMARY** nearcore `core/parameters/res/runtime_configs/85.yaml`：PV 85 的参数变化（ML-DSA 100 Ggas、min_gas_purchase_price、account_creation_charge 0.007 N）。
5. **PRIMARY** nearcore `core/parameters/res/runtime_configs/87.yaml`：PV 87 的变化（gas reward 归零、ml_dsa_verify、max_receipt_total_input_size、universal accounts；注释 “DeterministicStateInit live since protocol 82”）。
6. **PRIMARY** nearcore `core/primitives-core/src/account.rs`（L880-L893 GasKeyInfo，L909-L923 AccessKeyPermission，L959-L978 FunctionCallPermission）：access key 和 gas key 的数据结构。
7. **PRIMARY** nearcore `core/primitives/src/congestion_info.rs`（L80-L93、L115-L117、L123-L138）：拥塞控制的执行逻辑。
8. **PRIMARY** nearcore `core/primitives/src/stateless_validation/state_witness.rs`（L18-L21）：witness 未压缩硬上限 64 MiB。
9. **PRIMARY** nearcore `docs/architecture/how/receipt-congestion.md`：拥塞控制的设计推导与取舍。
10. **PRIMARY** nearcore `docs/architecture/how/dynamic_resharding.md`：动态 resharding 的流程、数据结构、TODO（含 SPICE 尚不支持 resharding）。
11. **PRIMARY** nearcore `docs/architecture/how/optimistic_block.md`：optimistic block 在 PV 77 引入、机制、非协议变更。
12. **PRIMARY** nearcore `docs/architecture/how/post_quantum_signatures.md`：ML-DSA-65 的范围、PV 85、存储哈希、gas 定价。
13. **PRIMARY** nearcore `docs/architecture/how/gas.md`：全链单一 gas price、NEP-536、gas 烧毁规则。
14. **PRIMARY** nearcore `docs/architecture/how/cross-shard.md`：交易到 receipt 的转换、跨块执行、退款。
15. **PRIMARY** nearcore `docs/architecture/how/tx_receipts.md`：local_receipts、next block、delayed 队列。
16. **PRIMARY** nearcore `docs/ChainSpec/Consensus.md`：Doomslug 的 approval 与 finality 条件。
17. **PRIMARY** NEPs `neps/nep-0509.md`：stateless validation 的角色、2/3 门槛、mandates、witness 限制、代价。
18. **PRIMARY** NEPs `neps/nep-0519.md`：yield/resume 的 API、200 块、MPC 签名动机。
19. **PRIMARY** NEPs `neps/nep-0539.md`：拥塞控制原始规格和原始参数值。
20. **PRIMARY** NEPs `neps/nep-0591.md`：global contracts 的两种部署模式和动机（含 chain signatures 钱包）。
21. **PRIMARY** NEPs `neps/nep-0366.md`：meta tx 的 DelegateAction 流程。
22. **PRIMARY** NEPs `neps/nep-0518.md`：ETH 隐式账户与 wallet contract。
23. **PRIMARY** NEPs `neps/nep-0568.md`：Resharding V3（静态、绑定协议版本）。
24. **PRIMARY** NEPs `neps/nep-0611.md`：gas keys 与 Pending Transaction Queue 的动机（SPICE）、规则；状态 Draft。
25. **PRIMARY** NEPs `neps/nep-0616.md`：确定性 AccountId / sharded contracts 的动机。
26. **PRIMARY** NEPs `neps/nep-0639.md`：动态 resharding 规格、首发 max_shards = 当前 + 1、配置来源。
27. **PRIMARY** docs.near.org/protocol/accounts-contracts/access-keys：FunctionCall key 语义、gas key 生命周期（“nearcore 2.13 / PV 86”）、PQ key 范围。
28. **PRIMARY** docs.near.org/smart-contracts/anatomy/crosscontract：异步与独立性、callback 总会执行、batch call 的原子性。
29. **PRIMARY** docs.near.org/smart-contracts/anatomy/yield-resume：200 块约 2 分钟、超时语义、resume 访问控制。
30. **PRIMARY** docs.near.org/smart-contracts/global-contracts：by hash / by account、10 倍价格且烧毁。
31. **PRIMARY** blog.nearone.org/announcement/2025/12/11/scaling-near-to-1m-tps.html：1M TPS 测试条件与优化；“mainnet is operating with 9 shards”（2025-12）。
32. **PRIMARY** blog.nearone.org/research/2026/09/30/spice-01-intro.html：SPICE 的问题定义与架构（未给上线时间）。
33. **PRIMARY** github.com/near/nearcore/releases：2.13.4 为最新稳定版，2.14.0-rc.3 为最新 RC；2.13.0 把 PV 从 84 升到 86、2026-07-20 开始投票。
34. **PRIMARY** https://rpc.mainnet.near.org/status（2026-10-07 06:28 UTC）：主网 PV 86、节点 2.13.4、两个区块高度与时间戳（用于算出块间隔）。
35. **PRIMARY**（NEAR 通过 PR Newswire 发布的官方新闻稿，2026-07-20）near-protocol-brings-quantum-safe-signing-to-mainnet：2.13 上主网，带来 PQ 签名和动态 resharding（“roughly 1.5 epochs”），并称利好 Intents。
36. **PRIMARY** near.org/blog/introducing-dynamic-resharding（经 r.jina.ai 读取）：分片数历史（9 个 + 1 个私有分片）、sharded contracts、Intents 已采用。
37. **PRIMARY** near.org/blog/blink-and-its-final-near-launches-600-ms-blocks-and-1-2-s-finality（经 r.jina.ai 读取）：600 ms / 1.2 s，归功于 optimistic block。
38. **PRIMARY** near.org/blog/separation-of-consensus-and-execution（经 r.jina.ai 读取）：SPICE “currently in development”，200 ms 目标和跨分片原子性均为计划。
39. **PRIMARY** near.org/blog/nightshade-2-launches-on-near-mainnet-introducing-stateless-validation（经 r.jina.ai 读取）：Nightshade 2.0 上线时 6 个分片（页面无日期）。
40. **PRIMARY** near-examples/cross-contract-calls `contract-simple-rs/src/high_level.rs@ac0211d6556720b4dd51baa25a828f1b10e185dc`（main 分支上该文件最后一次改动是 2024-12-03）：跨合约调用代码示例。
41. 外部调研 `research/near-deep-dive.md` §二（ChatGPT Deep Research）：只当线索用。
42. **PRIMARY** nearcore `docs/SUMMARY.md` 与 `docs/architecture/next/README.md`：next/ 目录下只有两篇旧文档，没有 SPICE 文档。
43. 二手：CoinDesk 2024-08-22 “NEAR Blockchain Gets Major Upgrade to Add 'Stateless Validation'”（只见到搜索摘要）：只用来给 Nightshade 2.0 的上线月份定位。

---

## 外部调研中被修正或无法核实的地方

1. **“Nearcore 2.13 引入 gas keys”**：正确，但要补充：代码特性版本是 85，主网从 84 直接升到 86，所以实际随 PV 86 生效 [1][33]；NEP-611 的设计动机是 SPICE 的防垃圾交易，不只是“方便 relayer” [24]；gas key **目前不能签普通 Delegate**，DelegateV2 在 PV 87 被移除 [2]。外部调研没有提到这些。
2. **“2026-07-20 主网升级公告将动态拆分列为已上线”**：新闻稿确实这样写 [35]，但 release 页说 7-20 00:00 UTC 才**开始投票**，升级预计在投票 epoch 结束后 7–14 小时 [33]，链上实际激活可能在 7-20 至 7-21 之间。“已上线”指的是协议能力，主网是否**实际发生过**自动拆分无法核实。
3. **“发布页 2.13.4 为最新稳定版、2.14.0-rc.x 为预发布”**：已核实，具体是 2.14.0-rc.3 [33]；补充：主网 RPC 显示 PV 86 [34]，所以 2.14 带来的 PV 87 特性（ml_dsa_verify、gas reward 归零、universal accounts）**都没有在主网上**。
4. **“yield 等待上限 200 个区块”**：已核实 [3][18][29]。外部调研说 yield “适合 MPC 签名”，其实 NEP 原文的动机示例**本身就是** MPC 签名合约 [18]，可以从 inferred 升级为 observed。
5. **“1M TPS：70 分片、原生转账、chunk producer 生成交易、0.5 block/s”**：已核实 [31]。补充：基准测试为测上限关闭了 compute 和 witness 上限；当时主网是 9 个分片；Ed25519 批量验签整体只提升 7–10%。
6. **“即使在同一分片也不会同步访问”**：方向正确，但外部调研引用的 architecture 页面只是间接说明；更直接的依据是 cross-shard.md 和 tx_receipts.md [14][15]。
7. 外部调研没有给出拥塞控制的参数。注意 NEP-539 原文的参数（拒收阈值 0.25、20 PGas 等）**已过时**，现行为 0.8、400 PGas、10 PGas、125 [3][19]。
8. 外部调研没有提出、但其他二手文章常见的说法：“2.13 带来 post-quantum testnet”（blockainews）与官方说法“主网可用”不符，以 [12][35] 为准。

## 开放问题

1. PV 86 之后主网是否已经发生过动态拆分？当前分片数是 9 还是 10？主网 `memory_usage_threshold` 等参数是多少？需要 POST `EXPERIMENTAL_protocol_config`，或读取 `core/primitives/res/epoch_configs/mainnet/86.json`（不在本次 sparse checkout 内）。
2. stateless validation（2.0.0）和 yield/resume 首次在主网激活的确切日期和 PV（本 lane 只用二手来源给 Nightshade 2.0 定到 2024-08）。
3. 当前主网 chunk validator 数量、每分片 mandate 价格、平均 witness 大小（官方没有给面板数字）。
4. 2.14（PV 87）的主网投票时间表还没出现在 release 页。
5. SPICE 的上线目标版本 / 时间：Near One 只说 “coming months”，没有承诺的版本号。
6. 端到端“跨分片交易完成”时延分布（≠ 单块 finality 1.2 s），本 lane 没有找到一手测量。

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| A1 | 2026-10-07 NEAR 主网协议版本为 86，RPC 节点版本 2.13.4 | [34] rpc.mainnet.near.org/status 返回 protocol_version 86、version 2.13.4 | observed | |
| A2 | nearcore 2.13.0 把主网协议版本从 84 直接升到 86，PV 86 投票自 2026-07-20 00:00 UTC 开始 | [33] 2.13.0 release notes “upgrades the protocol version from 84 directly to 86” | observed | |
| A3 | 截至 2026-10-07，最新稳定版是 2.13.4（安全更新），最新预发布是 2.14.0-rc.3 | [33] Releases 页面 | observed | |
| A4 | GasKeys、DynamicResharding、PostQuantumSignatures、DelegateV2 在代码中都是 PV 85 稳定特性 | [1] version.rs L161-L177 | observed | |
| A5 | gas keys、动态 resharding、ML-DSA-65 签名当前已在主网启用 | 由 A1、A4 推出：主网 PV 86 ≥ 85，且 PV 85 特性随 84→86 一并激活（A2） | inferred | |
| A6 | FunctionCall access key 由 allowance、receiver_id、method_names 组成，allowance 只限制 gas 和交易费，不是资产额度 | [6] account.rs L959-L978；[27] “amount of NEAR allowed to be spent on gas” | observed | |
| A7 | gas key 是 AccessKeyPermission 的两个新变体，最多 1,024 条 nonce lane | [6] account.rs L909-L923 MAX_NONCES_FOR_GAS_KEY = 1024；[2] CHANGELOG L61 | observed | |
| A8 | gas key 交易的 gas 从 key 余额扣、deposit 从账户扣，gas 退款回 key；删除 key 时剩余余额被烧，超过 1 NEAR 则删除失败 | [24] NEP-611 Gas Key Actions/Refunds；[6] MAX_BALANCE_TO_BURN = 1 NEAR；[27] | observed | |
| A9 | NEP-611 的首要动机是 SPICE：执行滞后时，chunk producer 纳入交易时无法验证余额，需要防垃圾交易 | [24] NEP-611 Summary/Motivation | observed | |
| A10 | NEP-611 在 NEPs 仓库仍为 Draft，nearcore 2.13.0 已标注 Stabilized | [24] Status: Draft (v1.2.2)；[2] CHANGELOG L61 | observed | |
| A11 | DelegateV2（gas key 签 meta tx）在 PV 85 引入、PV 87 被拒；旧版 Delegate 不接受 gas key 签名 | [1] DelegateV2 => 85, RejectDelegateV2 => 87；[2] CHANGELOG L26 | observed | |
| A12 | 当前主网（PV 86）上 DelegateV2 可用，2.14（PV 87）上线后将失效 | 由 A1、A11 推出：86 ≥ 85 且 < 87 | inferred | |
| A13 | 存储质押为每字节 1e19 yoctoNEAR，即 1 NEAR / 100 KB | [3] parameters.yaml L36 storage_amount_per_byte | observed | |
| A14 | ETH 隐式账户（0x+40hex，NEP-518）在 nearcore 2.1.0 上线，创建时不带 access key，而是使用 wallet contract | [22] NEP-518 Summary；[2] CHANGELOG 2.1.0 | observed | |
| A15 | 2.13 把新建账户成本从约 0.0008 NEAR 提高到约 0.007 NEAR，gas 买价下限为 0.001 NEAR/Tgas | [2] CHANGELOG L64；[4] 85.yaml account_creation_charge、min_gas_purchase_price | observed | |
| A16 | 交易必须在 signer 所在分片转换为 receipt，因为只有该分片持有 access key 状态 | [14] cross-shard.md Step 1 | observed | |
| A17 | 只有 sender==receiver 的 receipt 进入 local_receipts 在同块执行，其余新 receipt 在下一块或更晚执行 | [15] tx_receipts.md Step 2/3 | observed | |
| A18 | 跨合约调用与 callback 在不同区块执行（通常相隔 1–2 块），期间合约可以被其他调用访问 | [28] docs crosscontract “Asynchronous” | observed | |
| A19 | 被调合约失败不会回滚调用方已提交的状态，callback 总会执行，开发者必须手动回滚或退款 | [28] docs crosscontract “What happens if the function I call fails?” | observed | |
| A20 | 对同一合约的 batch call 在同一 receipt 内执行，任一失败则全部回滚 | [28] docs crosscontract “Calling Multiple Functions on the Same Contract” | observed | |
| A21 | 全链共用区块级 gas_price，按所有分片的平均利用率是否超过 50% 调整，单个分片满载不会推高价格 | [13] gas.md “Block-Level Gas Price” | observed | |
| A22 | PV 78（NEP-536）起 gas 按购买时的价格燃烧，不再有悲观 gas price | [13] gas.md；[2] CHANGELOG 2.7.0 | observed | |
| A23 | 单笔交易可预付 gas 上限为 1 PGas（2.11.0 从 300 Tgas 上调） | [3] max_total_prepaid_gas；[2] CHANGELOG 2.11.0 | observed | |
| A24 | 现行拥塞控制在目标分片 congestion level ≥ 0.8 时拒收发往该分片的新交易 | [3] reject_tx_congestion_threshold 80/100；[7] shard_accepts_transactions | observed | |
| A25 | 完全拥塞时，只有轮值的 allowed_shard 能向该分片转发 1 PGas，其余为 0 | [7] congestion_info.rs L80-L93；[3] allowed_shard_outgoing_gas | observed | |
| A26 | 现行拥塞参数（400 PGas / 10 PGas / 125 / 0.8）相比 NEP-539 原始值（20 PGas / 2 PGas / 10 / 0.25）已经放宽 | [3] parameters.yaml L365-L381；[19] NEP-539；[2] CHANGELOG 2.4.0 “Relaxing Congestion Control” | observed | |
| A27 | 恶意或热点负载下，拥塞控制最坏会把全局吞吐退化到 1000 Tgas/NUM_SHARDS | [9] receipt-congestion.md Idea 1 | observed | |
| A28 | stateless validation 与拥塞控制在 nearcore 2.0.0 上线 | [2] CHANGELOG 2.0.0 | observed | |
| A29 | chunk 纳入区块需要获得分配给该分片 stake 的 2/3 以上 endorsement（分母不是全网 stake） | [17] NEP-509 “Design after NEP-509” | observed | |
| A30 | state witness 是 trie 子集加包含证明，validator 需要重新执行，它不是简洁的 validity proof | [17] NEP-509 Summary；[31] 背景段 | observed | |
| A31 | 选择 stateless validation 是因为 fraud proof、challenge、回滚组合起来过于复杂 | [17] NEP-509 Motivation | observed | |
| A32 | chunk validator 按 mandate 在每个高度随机分配到各分片，安全性因此变为概率性 | [17] NEP-509 Chunk validators selection / Neutral consequences | observed | |
| A33 | 2.8.0 把验证者上限从 300 提到 500，每分片 mandates 提到 105 | [2] CHANGELOG 2.8.0 | observed | |
| A34 | witness 在代码中的未压缩硬上限是 64 MiB；NEP-509 的设计目标约 16 MiB | [8] state_witness.rs L18-L21；[17] Size limits | observed | |
| A35 | 现行 main_storage_proof_size_soft_limit 为 4 MB（NEP-509 原文为 3 MB） | [3] parameters.yaml L24；[17] | observed | |
| A36 | NEP-509 估算的 witness 分发最坏带宽约 214 Mbps（16 MiB、RS 比例 0.6） | [17] Network tradeoffs | observed | |
| A37 | 动态 resharding 每 epoch 至多拆一个分片，拆分在 N+2 epoch 生效，并有冷却期 | [10] Key Design Principles；[26] | observed | |
| A38 | 动态 resharding 首次上主网时 max_number_of_shards 设为当前分片数 + 1 | [26] NEP-639 “Limiting the Blast Radius” | observed | |
| A39 | 拆分边界是 AccountId，单个大账户整体落在一侧，热点单合约无法靠 resharding 拆开 | 由 [10][26] 推出：边界为账户 ID，Split B “-0” 把大账户整体推到左侧 | inferred | |
| A40 | 2025-12 主网为 9 个分片；2026 年动态 resharding 博客写 9 个分片外加 1 个 Confidential Intents 私有分片 | [31] “mainnet is operating with 9 shards”；[36] | observed | |
| A41 | PV 86 之后主网已经发生过自动拆分 | 仅有新闻稿称动态 resharding 已上主网 [35]；未取得链上 shard layout 数据 | speculative | |
| A42 | NEAR 把 sharded contracts（NEP-616 确定性账户）作为单合约热点的缓解手段，Intents 的 wallet / global-deployer 已采用 | [36] near.org 博客；[25] NEP-616 Motivation | observed | |
| A43 | optimistic block 在 PV 77、nearcore 2.6.0 引入，用于消除 2 倍的 chunk 执行延迟 | [11] optimistic_block.md；[2] CHANGELOG 2.6.0 | observed | |
| A44 | NEAR 官方称自 2025-05 起 600 ms 出块、1.2 s finality | [37]；[38] “as of May 2025” | observed | |
| A45 | 2026-10-06 至 07 主网平均出块间隔约 0.590 s（122,235 个高度，72,146 s） | [34] earliest/latest 高度与时间戳 | observed | |
| A46 | Doomslug 中，区块 B 之上出现两个高度连续的块即 final，所以 finality 约等于 2 个块时间 | [16] Consensus.md Finality condition | observed | |
| A47 | yield/resume 的 NEP 动机示例就是 MPC 签名合约，超时为 200 块 | [18] NEP-519 Motivation/Spec；[3] yield_timeout_length_in_blocks 200 | observed | |
| A48 | yield 超时后回调仍会执行，收到 timeout 错误；resume 入口必须做调用者校验 | [29] docs yield-resume；[18] Security Implications | observed | |
| A49 | yield_with_id host functions 在 PV 85 稳定，用途包括合约内 mempool | [1] YieldWithId => 85；[2] CHANGELOG L63 | observed | |
| A50 | global contracts（NEP-591）在 nearcore 2.6.0 上线，支持按 hash（不可变）或按账户（可升级）引用 | [20] NEP-591 Specification；[2] CHANGELOG 2.6.0 | observed | |
| A51 | global contract 存储按每字节 0.0001 NEAR 计（普通存储的 10 倍），部署时烧掉 | [3] L401；[30] docs “10x … entirely burnt” | observed | |
| A52 | NEP-591 的动机写明了 chain signatures 带来的智能合约钱包大量部署场景 | [20] NEP-591 Motivation | observed | |
| A53 | 1M TPS 基准为 70 分片、140 节点、原生转账、chunk producer 自生成交易、稳态 0.5 block/s | [31] Setup/Running the benchmark | observed | |
| A54 | 1M TPS 基准为测上限调整或关闭了 compute-cost 与 witness 大小上限，不代表主网配置 | [31] “Consistently measuring benchmark results” | observed | |
| A55 | SPICE 在代码中是 PV 180 特性，被有意排除在 nightly（157）之外，尚未上线 | [1] version.rs L200-L202、L243-L252；[38] “Currently in development” | observed | |
| A56 | SPICE 要解决的耦合包括：纳入前须知执行结果、receipt 必须进下一块、出块须等上一块执行和验证、DA 绑定出块 | [32] “The Problem” | observed | |
| A57 | 200 ms 出块与跨分片原子执行是 SPICE 及其后续版本的计划，不是现状 | [38] “When SPICE launches…”；“will require a further update after SPICE” | observed | |
| A58 | ML-DSA-65 只覆盖交易签名与 access key，validator key、区块签名、隐式账户推导不在范围内 | [12] post_quantum_signatures.md Summary/Out-of-scope；[27] | observed | |
| A59 | 合约内 ml_dsa_verify host function 属于 PV 87（2.14），尚未在主网启用 | [5] 87.yaml ml_dsa_verify_host_fn；由 A1 主网 PV 86 推出未启用 | inferred | |
| A60 | dynamic_resharding.md 把 StickyResharding 写成 PV 153，与 version.rs 的 85 不一致，以代码为准 | [10] §2.6；[1] version.rs L167 | observed | |

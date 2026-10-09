# notes-payment：BEP-703 Payment Lane 与 Tempo 对比（调研笔记）

- 调研日期 / 截止：2026-10-09
- 固定版本：bsc@8cc60b246c（develop，2026-10-08）、reth-bsc@349f55c（develop，2026-10-09）、BEPs@e9b2be3b00（master，2026-10-08）、tempo@feb5dff7da（main，2026-10-08）；外加 bsc-genesis-contract@2620fb411b（PaymentLane.sol，通过 `gh api` 读取）
- 引用格式：`仓库/路径:行号@commit`；来源编号见文末“来源”一节
- 状态一句话：BEP-703 已合并到 BEPs 仓库（状态字段仍为 **Draft**），Go 与 Rust 实现都已合并到 develop，**尚未进入任何正式 release**，Jenner 在 BSC 主网 / Chapel 测试网**都还没排期**（`JennerTime: nil`）；官方公告给出的计划是测试网 2026 年 10 月下旬、主网 11 月下旬。也就是说，Payment Lane **已合并、未激活**。

---

## P-Q1 做什么：动机、保障什么、不保障什么

**答案**：BEP-703 在每个区块里为“支付类交易”预留一部分 gas（默认 gas limit 的 5%，协议上限 10%），普通（general）交易**永远不能占用**这部分，即使它空着；支付交易则可以超出预留额，和普通交易一起竞争剩余空间。它保障的是“支付这一类交易作为整体总有 gas 可用”，**不保证任何一笔交易一定被打包**，也不改变交易排序、手续费规则、交易格式或区块头。

**依据**
- 动机：BSC 的 base fee 固定为 0（BEP-226），能否被打包完全靠 priority fee 竞价；某一类流量突然暴涨（例如发币、投机）时，会抬高所有类别的打包价格。支付交易（稳定币转账、交易所充提、汇款、商户结算）对时间敏感，又最不会逐块重新出价，因此最先被挤出去。BEP 认为这不是容量问题，而是“区块空间不分区”这一结构缺陷 [1 §2]。
- “保证的是这一类交易有 gas 可用，不承诺其中任何一笔会被打包”：原文 “The lane guarantees gas to payment transactions as a class; it does not promise that any one of them is included.” [1 §1, BEP-703.md:38]
- 不改排序 / 费用：“block producers keep full freedom over transaction selection and ordering … No new ordering rule, priority rule, or fee rule is introduced.” [1 §3.3, :152]
- 不改交易格式 / 费用机制 / 排序 / 区块头：“Nothing else changes — not transaction formats, the fee mechanism, ordering, or the block header” [1 §5, :275]
- 没有独立费用市场：lane 内部仍按普通费用规则竞价，“Reserved gas is not free gas … pays full fees throughout”；单笔支付交易可以把整个 lane 填满 [1 §6]。
- 是“配额”，不是“区域”：“A quota, not a region” [1 §4]；区块内位置没有约束 [1 §3.1、§3.3]。

**不确定之处**
- “FIFO / 抗审查 / 抗 MEV”：BEP 没有逐条否认，但出块者可以自由选择和排序交易 [1 §3.3]，所以这几项都**不提供**，这一点是推出来的（inferred）。出块者完全可以挑支付交易里小费最高的，或者干脆不打包某一笔；后者的代价只是预留空间空着。
- 官方博客说 “Payment traffic appears in roughly 99.6% of BSC blocks” [17]，这个数字是项目方说法，我没有复核。

---

## P-Q2 分类规则

**答案**：交易执行前分类，顺序如下：① 系统交易 → general；② `to == nil`（合约创建）→ general；③ 交易类型不在 {0x00, 0x01, 0x02} → general（排除 blob 交易 0x03 和 7702 的 0x04）；④ 顶层 `to` 在治理名单里（读**父区块 post-state**）→ payment，到此结束；⑤ `value == 0` → general；⑥ `to` 在**实时状态**下有代码 → general；⑦ 其余（value > 0 且 `to` 没有代码）→ payment。名单按**地址**登记，不看 selector，只看**顶层 `to`**。EIP-7702 的 delegation designator 算“有代码”。名单在 fork 时**为空**，只能通过 BSC 治理（GovHub `0x…1007` 调用 `updateParam`）增删。

**依据**
- 规范伪代码与各条件的理由 [1 §3.2, BEP-703.md:89-127]。
- Go 实现完全按这个顺序：`bsc/core/paymentlane/classify.go:34-58@8cc60b246c`。其中 `hasCode` 把“账户不存在”（zero hash）和 `EmptyCodeHash` 都当作无代码：`classify.go:60-65`。
- Rust 实现顺序相同：`reth-bsc/src/consensus/payment_lane/rules.rs:42-72@349f55c`；实时 code 探测 `reth-bsc/src/node/evm/executor.rs:607-623`：账户不存在 → 空，`code_hash` 为 0 或 `KECCAK_EMPTY` → 空。7702 委托账户的 code 是 `0xef0100‖addr`，code hash 非空，所以算 general。
- 按地址、不按 selector：“listing is by address, whatever function a transaction calls” [1 §3.6.2, :227]。所以调用已上名单 token 的 `approve` 等任何函数，都算 payment。
- 只看顶层 `to`：伪代码只检查 `tx.to` [1 §3.2]；Go `Classify` 只读 `tx.To()`，不跟踪内部调用 [6]。经 Router、多签、AA 钱包入口发起的支付，**不会**进入 lane。
- EIP-7702：“an EIP-7702 delegation designator counts as code … An account that gains code earlier in the same block, by deployment or by an authorisation, holds it by the time the transfer is classified and is general” [1 §3.2]。0x04 类型被排除，是因为它在执行前就会安装代码，分类器读不到 [1 §4]。
- 预编译合约没有代码，所以带 value 调用预编译会被归为 payment；BEP 认为这不构成问题，没有做特殊处理 [1 §6]。
- 名单为空、增删路径：“The list starts empty: the fork lists nothing, and every entry arrives by governance afterwards.” 首批预期是 USDT 和 USDC [1 §3.6.2]。合约 `PaymentLane` 位于 `0x0000000000000000000000000000000000002007`，没有初始化器，也没有 genesis storage [1 §3.6.3]。
- 治理接口：`updateParam(string key, bytes value)`，只有 GovHub（`0x…1007`）能调用；key 有 `paymentLaneRatio`（`abi.encode(uint256)`）、`addPaymentContract` / `removePaymentContract`（`abi.encode(address[])`，语义是“设成终态”，不是“做差分”）[1 §3.6.5]。合约实现见 `bsc-genesis-contract/contracts/PaymentLane.sol:91-116@2620fb411b`，`onlyGov` 要求 `msg.sender == 0x…1007`（SystemV2.sol:13,66-67）[13]。
- 只读 getter：`getPaymentLaneRatio()`、`isPaymentContract(address)`、`arePaymentContracts(address[])`、`paymentContractCount()`、`getPaymentContracts(offset, limit)`。Go 用嵌入的 ABI 调用它们（`bsc/core/paymentlanemeta/payment_lane_meta.abi.json`、`abi.go:14-17`）[8]。
- 名单上限 `MAX_PAYMENT_CONTRACTS = 100000`：合约在写入时强制执行，节点读取时也会校验（`paymentlanemeta/loader.go:77-79`）[1 §3.6.1][8]。
- 安装：Jenner 升级通过 `systemcontracts.jennerUpgrade` 把 `PaymentLaneContract` 字节码写到 `0x…2007`，mainnet / chapel / rialto 三个网络都有，CommitUrl 指向 genesis-contract 的 2620fb411b（`bsc/core/systemcontracts/upgrade.go:1113-1145`、`const.go:21`）[11]。

**不确定之处**
- “标准 BSC 治理路径”的完整链路（Governor `0x…2004` 提案 → 投票 → GovHub 执行）我没有逐行读；BEP 和合约只说明了入口必须是 GovHub。
- 实现与规范的小差异（规范允许）：规范说名单成员资格“MUST be what `isPaymentContract` answers”，但获取方式不限。Go 和 Rust 都是分页调 `getPaymentContracts`（每页 128 个），在本地物化成 map，并做缓存：Go 以 0x2007 账户的 (codeHash, storageRoot) 为缓存键，Rust 以 block hash 为键并让子块继承 [8][14]。这符合 §3.6.4 的写法。
- 草案曾要求裸转账的 `data` 必须为空，这条在 2026-08-31（f2314c7a）删掉了 [2]。所以当前规则下，**带 calldata 的 BNB 转账，只要接收方无代码，也算 payment**。

---

## P-Q3 配额规则

**答案**：`paymentLaneQuota(h) = PAYMENT_LANE_RATIO(h−1) × GasLimit(h) / 10000`，向零截断，中间结果要宽于 64 bit。ratio 以 1/10000 为单位（基点），默认 500（5%），守卫条件是 `0 < ratio ≤ 1000`（10%，协议常量，治理不能改）。区块有效性条件是 `generalGasUsed + max(paymentGasUsed, paymentLaneQuota) ≤ GasLimit`，外部调研写的 `N + max(P,Q) ≤ G` **正确**；其中系统交易的 gas 算 general。闲置配额不还给普通交易，原因是：如果还回去，出块者把支付交易排除在外就没有任何代价，“预留”在拥堵时形同虚设。**不新增区块头字段**。

**依据**
- 公式与参数 [1 §3.4.1、§3.4.2、§3.6.1]；Go 用 `bits.Mul64` / `bits.Div64` 做 128 位乘除（`bsc/core/paymentlane/paymentlane.go:60-71`）；Rust 用 `u128`（`reth-bsc/.../rules.rs:16-21`）。
- 守卫在 uint256 全宽上检查，防止截断后“落进”合法区间：`paymentlane.go:51-58`、`paymentlanemeta/abi.go:51-62`；合约侧 `PaymentLane.sol:92-98`。
- 默认值的实现方式：存储为 0 表示治理从没写过，此时 getter 返回 500（`PaymentLane.sol:51,128-131`）。所以 BEP 要求节点**必须**调 getter，**不能**直接解码 storage [1 §3.6.4]。
- 不等式：[1 §3.3, :141-144]。Go 实现成等价形式 `header.GasUsed + max(0, quota − paymentGasUsed) ≤ GasLimit`，带溢出检查（`paymentlane.go:1-7, 73-81`）；Rust 相同（`rules.rs:23-40`）。
- 系统交易算 general：“Parlia's system transactions are general … their gas falls on the general side” [1 §3.3]。Go 中 `Verify(gasUsed)` 用的是 `Finalize` 之后的 gasUsed，已含系统交易（`bsc/core/state_processor.go:186-202`）[9]。
- 闲置不归还的理由 [1 §4, :271]。
- 无新区块头字段 [1 §5]；Go 包注释写明 “Nothing is committed to the block” [6]；reth-bsc#497 的 PR 描述写明 “without changing transaction or header formats” [14]。
- BEP 自带的例子：GasLimit 55,000,000（BEP 称为“BSC mainnet's current value”）→ quota 2,750,000，最多容纳约 130 笔原生转账，或 45–78 笔稳定币转账 [1 §3.4.4]；Rust 单测 `quota(500, 55_000_000) == 2_750_000`（`rules.rs:116`）。
- 低 gas limit 下的副作用：最小可用 gas limit 在默认比例下提高约 5.3%，在最大比例下提高约 11.1% [1 §6]。

**数值例子（假设 GasLimit = 100,000,000，不是主网参数；ratio = 500）**
- Q = 500 × 100,000,000 / 10,000 = 5,000,000
- 等价拆分：`N + P ≤ G` 且 `N ≤ G − Q = 95,000,000`（N 含系统交易 gas）

| 情形 | P（支付） | N（普通 + 系统） | N + max(P,Q) | 结果 |
|---|---|---|---|---|
| A 支付不足 | 2.0M | 92.5M（含系统 0.5M） | 97.5M | 有效；3M 预留闲置 |
| B 无支付、普通塞满 | 0 | 95.5M | 100.5M | **无效**：普通交易吃进了预留 |
| C 支付超额 | 8.0M | 92.0M | 100.0M | 有效：多出的 3M 支付在共享空间里竞争 |
| D 总量超限 | 8.0M | 93.0M | 101.0M | 无效 |

- 出块侧的准入（Go `Budget.Admits`）：假设打包到某一时刻，gas pool 剩 6M，已打包支付 2M，则 idle = 3M。一笔声明 gasLimit 4M 的普通交易因为 4M > 6M − 3M 被跳过（“yield”）；同样 4M 的支付交易可以进入（4M ≤ 6M）。注意准入比较的是**声明的 gasLimit**，记账用的是**实际 gasUsed**（`budget.go:11-21`、`miner/worker.go:965-971`、`payment_lane.go:90-95`）。

**不确定之处**
- 55M 是否仍是 BSC 主网当前 gas limit，我没有独立核实（BEP 写于 2026-07~09）。
- 出块者用“声明 gasLimit”做准入会让结果偏保守：一笔普通交易可能实际只用 21k gas，但因为声明值太大被跳过。这对出块收益的影响，我没有找到量化数据。

---

## P-Q4 parent state 与 live state 的分工

**答案**：ratio 和名单成员资格读**父区块 post-state**；“BNB 接收方是否有代码”读**本交易执行前的实时状态**（同一区块里上一笔交易已提交之后）。名单规则只会判出 payment，并且判出就停，所以任何一笔交易的类别都不会同时取决于两种状态。系统合约在激活块执行期间安装，所以激活块本身不受约束，**activation + 1** 才是第一个受约束的区块。

**依据**
- 规范：`classify(tx, parentState, liveState)` 及两种状态的定义 [1 §3.2, BEP-703.md:96-127]。名单读 parent，是因为如果读实时状态，就等于由排序者决定谁在名单上；code 读 live，是为了防止“同块先部署代码 / 先做 7702 授权，再往这个地址转 BNB”，把任意执行塞进 lane [1 §4 “The code test reads the live state”]。
- 治理变更只从下一个区块起生效 [1 §3.6.5 末段]。
- 激活边界：[1 §3.4.3, :176-180]。
- Go 代码位置：
  - parent：`ResolveLaneState` 以 `config.IsJenner(parent.Number, parent.Time)` 作为门槛（父块已经是 Jenner，才开启 lane），然后 `LoadMeta(config, header, statedb)`（`bsc/core/payment_lane.go:52-66`）。在 import 路径上，这一步发生在 `TryUpdateBuildInSystemContract` 和任何交易执行**之前**，此时 statedb 就是父块 post-state（`bsc/core/state_processor.go:97-106`）。getter 通过 `evm.StaticCall` 执行，执行完回滚快照（`paymentlanemeta/caller.go:18-34`）。
  - live：`Classifier.code` 注释写着 “CodeReader must be the LIVE state”（`classify.go:14-17`）；`LaneState.Classify` 注释写着 “must be called where the transaction is about to run”（`payment_lane.go:81-88`）。import 时在每笔交易 `ApplyTransactionWithEVM` 之前调用（`state_processor.go:159-172`），出块侧在 `applyTransaction` 开头调用（`miner/worker.go:827-841`）。
- Rust：trait `LaneParentState`（“Implementations must refuse reads after the block mutates that state”）和 `LaneLiveState`（“Code checks must not be cached per block”）分开定义（`reth-bsc/src/consensus/payment_lane/mod.rs:14-24`）；`LaneState::resolve` 注释写着 “caller must gate on the parent being Jenner-active”（`state.rs:26-37`）；PR 描述写明 “enforce the lane from the activation block's child” [14]。
- 激活块禁止走 BidBlock：Go `miner/miner_mev.go:117-122`（在 Pasteur / Jenner 激活块上拒绝 BidBlock，退回 SendBid）；Rust `src/rpc/mev.rs:702-715`（注释说明 Jenner 在该块安装 0x2007，因此必须由验证者自己出块）。
- 拿不到父状态：规范要求“推迟检查”，不能当作检查通过 [1 §3.6.4]。Go 返回 `ErrStateUnavailable`，`reportBadBlock` 记录 “block left unjudged”，不标记坏块（`core/blockchain.go:3409-3425`）；BidBlock 路径遇到这种错误也不撤销 builder（`miner/bid_block.go:370-376`）。

**不确定之处**
- 出块侧 `makeEnv` 中 `ResolveLaneState`（`worker.go:740`）与系统合约升级的先后关系，我没有逐行确认。按 import 侧的顺序和 Go 缓存键的设计（0x2007 账户的 codeHash + storageRoot），可以推断两边读到的是同一个父状态。

---

## P-Q5 在出块 / 验块流水线中的位置

**答案**：出块和验块共用同一个 `ResolveLaneState`。出块（worker）在选交易时用 `Admits(gasPool.Gas(), laneType, tx.Gas())` 过滤普通交易，执行后按实际 gas 记账，封块前对整块做 `Verify`。legacy 的 SendBid 路径由 validator 重新执行 builder 的交易，最后做 `VerifyPackedBid`。BEP-675 的 SendBidBlock 路径在封块前**不执行**交易，所以 lane 检查落在“广播之后的本地 `InsertChain`”上：违规会让 InsertChain 失败，并按 BEP-675 撤销该 builder 的 BidBlock 权限；如果失败原因是本地状态不可读，则不撤销。import 路径（state processor）逐笔分类、记账，最后检查不等式；Go 的 fast node（`NoTries`）会跳过这项检查。

**依据**
- 规范 §3.5：“The check needs execution … On BEP-675's SendBidBlock path the validator seals without executing, so the check falls on the local import that follows the broadcast: a violation fails InsertChain there and is handled by BEP-675's builder revocation” [1 :196]。
- 共用 lane：`payment_lane.go:50-51` 注释 “One implementation for the importer and the producer on purpose” [7]；PR 中的 mermaid 结构图 [12]。
- 出块：`miner/worker.go:740-748`（lane 解析失败就拒绝出块）、`:965-971`（准入，跳过的普通交易计入 `generalLaneYielded`）、`:1315-1318` 与 `:1685-1688`（封块前 `Verify`，失败则 “Payment lane refused to seal”）[10]。gas pool 初始化为 `GasLimit − gasReserved`（为 Parlia 系统交易预留，`worker.go:749-768`），而 quota 按完整 GasLimit 计算（Rust 注释 “derives quota from this block's full gas limit, before reserves”，`state.rs:26`）。
- Bid 模拟（SendBid）：`miner/bid_simulator.go:1389-1398`（逐笔分类、记账）、`:1216-1220`（`VerifyPackedBid`：idle > pool 剩余 → 拒绝该 bid）[10]。
- BidBlock：`miner/bid_block.go:354-378`，注释把 “BEP-703's payment lane rule” 列为 InsertChain 能捕获的违规类别之一，违规时调用 `RevokeForViolation`；`ErrStateUnavailable` 例外 [10]。
- Import：`core/state_processor.go:97-103`（`!statedb.NoTries()` 时才解析 lane）、`:159-172`（逐笔）、`:200-203`（最终校验）[9]。BEP §6 把 fast-node 是否检查定义为“实现问题”[1]；bsc#3793 的 PR 描述解释了 `--tries-verify-mode none` 下跳过检查的理由 [12]。
- Rust：PR 描述写明 “Ordinary RPC simulation skips lane enforcement; bid simulation enforces it”，以及 “This PR does not add Geth-BSC's NoTries exemption” [14]；bid 模拟的准入在 `reth-bsc/src/node/miner/bid_simulator.rs:1215` [15]。
- Rust 后续修复：reth-bsc#522（2026-09-29）“fix(miner): make payment lane cache work in mine path”；Go 后续：bsc#3821（2026-09-23）补了缓存的测试（`git log -- core/paymentlane*`）[30]。

**不确定之处**
- BidBlock 封块前的检查（header、结构等）不涉及 lane，所以一个违反 lane 的 BidBlock **会先被签名并广播**，之后才被本地 import 拒绝。其他节点同样会在 import 时拒绝它，最终结果相当于这个高度出了一个无效块，走 backup 流程。这个“可用性代价”是从 BEP-675 的机制推出来的，没有找到实测数据（inferred）。
- Rust 的 fast-node / 非执行路径与 Go 不一致（Rust 没有 NoTries 豁免）。规范允许这种差异，但两个客户端在 fast-node 模式下的行为不同。

---

## P-Q6 规范演进：博客方案 vs 当前 BEP-703

**答案**：2026-09-01 的官方博客描述的是**动态预留**（拥堵时扩张、需求回落时收缩，验证者要对“预留大小、拥堵阈值、调整速度”投票），符合当时（2026-08-31，3c210b5d）的草案：草案里有累加器式的 quota 递推，并把 quota 和 paymentGasUsed 编码进 `header.UncleHash` 作为承诺。2026-09-08 的提交 10020317（“chore: simply model”，+121/−337 行）删掉了动态调整和 UncleHash 承诺，改成“单一治理比例 × 当前 gas limit”的静态 quota。BEP 于 2026-09-11 以 squash 方式合并（8b25387），所以 master 上 `git log -- BEPs/BEP-703.md` 只有一条记录，修订史要看 PR #703 的 41 个 commit。

**依据（PR #703 关键修订，`git show <sha>:BEPs/BEP-703.md` 逐版比对）**[2][3][4][5]
| 日期 | commit | 变化 |
|---|---|---|
| 2026-07-17 | 7d229232 | 初稿：动态 quota（signal = generalGasUsed/GasLimit，扩张阈值 80% / 收缩阈值 70%，比例界 2%–8%，另有绝对界）；“no new header field required”；**所有分类（包括 code 检查）都读父状态**；BNB 转账要求 data 为空；首批名单 “Initially USDT and USDC only” |
| 2026-07-31 | daa6af1a 起 | 引入 Header Commitment：把 `paymentLaneQuota` 和 `paymentGasUsed` 编码进 `header.UncleHash`（[0:8] / [8:16]），使递推深度为 1 |
| 2026-08-01~02 | 多个 refine | 细化 congestion signal、step、bounds、`SYSTEM_TXS_GAS_RESERVE = 20M`、laneCap |
| 2026-08-10 | 072070cf 前后 | 名单改为“starts empty” |
| 2026-08-12 | fa7575b | code 检查从 parent state 改为 **live state**（“about to run”）；此前草案明确承认同块部署代码会让交易“在 lane 内执行代码” |
| 2026-08-14 | 33130439 | 加入系统合约 `PaymentLane@0x2007`、getter、`MAX_PAYMENT_CONTRACTS = 100000` |
| 2026-08-31 | f2314c7a | 删除“data 为空”条件 |
| 2026-08-31 | 3c210b5d | 博客发布前的最后草案：仍是动态模型，8 个可治理参数（MIN/MAX_RATIO 200/800、MIN/MAX 2M/8M、EXPAND/SHRINK_TRIGGER 8000/7000、EXPAND/SHRINK_STEP 200/50） |
| 2026-09-08 | 10020317 | “simply model”：删除 Dynamic Quota Adjustment 和 UncleHash 承诺；只保留 `PAYMENT_LANE_RATIO`（默认 500，上限 1000）；分类加入“非系统交易”条件 |
| 2026-09-10 | 87e8c524 | 治理接口定稿（`updateParam` 的 key） |
| 2026-09-11 | 8b25387（合并） | 合并到 master；同日 bsc#3793、genesis-contract#682 合并 |

- 博客原文要点 [17]：“The reserve expands when BSC is busy and shrinks when demand falls”；“Dynamic”；“the PaymentGasLimit, does not fall below the configured minimum”；“Eligible payments include native BNB transfers, USDT, USDC, and audited tokens approved through governance”；“Validators will vote on parameters including reserve size, congestion thresholds, and adjustment speed before launch”；“launch planned for Q4 2026”。
- 与当前 BEP 的差异：
  - (a) 动态 → 静态比例；
  - (b) 可治理参数从“预留大小、阈值、速度”缩减为“ratio + 名单”；
  - (c) 博客说 USDT/USDC 有资格，BEP 写的是名单为空，USDT/USDC 只是“intended first entries”；
  - (d) 博客的 “PaymentGasLimit” 在 BEP 的任何一版草案中都没有出现（我逐个检查了 18 个修订）；
  - (e) 博客说 “Outside congestion, fees and block rewards are unchanged”，当前 BEP 下预留在每个区块都生效，只是不拥堵时普通交易本来就用不到这部分。
- Jenner 官方公告（2026-09-20）已按新模型描述：“reserves a governable fraction (default 5%) of every block's gas” [18]。

**不确定之处**
- 为什么砍掉动态模型？10020317 的 commit message 只有 “chore: simply model”。我没有找到公开讨论（PR #703 有 11 条 review comment，我没有逐条读完）。可能的原因（speculative）：UncleHash 承诺需要改动所有比较 uncle hash 的路径，复杂度和风险太高；而且累加器一旦算错一个边界块，就永远无法重新收敛。旧草案 §3.4.3 / §3.5.3 自己就列出了这两条风险 [3]。

---

## P-Q7 实现与合并时间

**答案**：Go 实现 bsc#3793 “core/paymentlane: implement BEP-703 payment lane” 于 **2026-09-11T05:57:02Z** 合并（merge commit 1580ed1d6，36 个文件，+2555/−37）。Rust 实现 reth-bsc#497 “feat: add payment lane” 于 **2026-09-23T03:04:09Z** 合并（3404580，27 个文件，+2180/−243）。Rust 版的范围包括：`src/consensus/payment_lane/{meta,rules,state,mod}.rs`（与 Go 的 `core/paymentlanemeta`、`core/paymentlane`、`core/payment_lane.go` 一一对应），executor / pre-execution 接入，bid simulator 准入与整 bid 校验，BidBlock import 时区分本地读失败和违规（决定是否撤销 builder），Jenner 安装 0x2007、从激活块的子块开始约束，metrics 和回归测试。两者**都不在**任何已发布 release 中。

**依据**
- `gh pr view 3793 -R bnb-chain/bsc --json mergedAt,…` → `"mergedAt":"2026-09-11T05:57:02Z"`，mergeCommit 1580ed1d63 [12]；bsc-genesis-contract#682 “feat: add payment lane contract” 于 2026-09-11T06:02:05Z 合并 [13]。
- `gh pr view 497 -R bnb-chain/reth-bsc …` → `mergedAt 2026-09-23T03:04:09Z`，文件清单与描述见 [14]；Rust 模块注释 “Like go-bsc: rules … meta … state …”（`reth-bsc/src/consensus/payment_lane/mod.rs:4-5`）[15]。
- Rust 与 Go 的差异（来自 PR 描述）：缓存按 block hash，子块在合约未变时继承；没有 NoTries 豁免；普通 RPC 模拟不检查 lane [14]。
- Release：`gh release list` 显示 bsc 最新为 v1.8.0-alpha（2026-08-13）、v1.7.8（2026-08-11）；reth-bsc 最新为 v0.1.2（2026-08-20），都早于合并日期 [28]。
- Fork 排期：bsc `params/config.go:256`（BSC 主网）、`:311`（Chapel）、`:368`（Rialto）都是 `JennerTime: nil`；reth-bsc 只在内部 QANet 排了 Jenner：2026-10-05 05:00 UTC（`src/hardforks/bsc.rs:231-232`，commit 349f55c “schedule QANet Jenner activation”），主网和 Chapel 明确保持未排期（`bsc.rs:415-425` 的测试）[11][16]。官方公告：测试网 2026 年 10 月下旬、主网 11 月下旬，hard fork release 尚未发布 [18]。

**不确定之处**
- QANet 是 BNB Chain 内部测试网，它在 2026-10-05 是否真的激活了 Jenner、是否跑过 lane，我没有公开证据，只看到代码里的排期。

---

## P-Q8 与 Tempo 对比

**答案**：**同类设计，没有移植证据。** 两者都是“共识层对非支付交易的 gas 再加一道上限”。从数学形式看，Tempo 的 `Σ非支付gas ≤ general_gas_limit` 加上 `总gas ≤ gas_limit`，和 BSC 的 `N ≤ G − Q` 加上 `N + P ≤ G` 是同一个形状。差别在于：
- **分类**：Tempo 只看交易数据，不读状态。T5 之前看 TIP-20 地址前缀 `0x20c0…`；T5 起按 TIP-1045，调用目标 + selector + ABI 形状都在白名单里，且禁止 access list 和授权列表。BSC 按治理名单地址或“value > 0 且接收方无代码”，需要读父状态和实时状态。
- **参数**：Tempo 的 `general_gas_limit` 是**区块头字段**，在 T1 及以后固定为 30M，header 校验要求它等于 chainspec 给出的期望值。BSC 不加 header 字段，由治理比例推导。
- **比例倾向相反**：Tempo 主网初始参数是 500M 的区块里非支付最多 30M（约 6%），支付是主体；BSC 是普通交易为主体，只给支付保底 5%。
- **费用与链定位**：Tempo 没有原生币，用 USD 稳定币付费，配有 Fee AMM；BSC 不改费用。
- **上线状态**：Tempo 的 payment lane 已在主网运行（T1 2026-02-12，T5 2026-06-09，按其 chainspec），sub-block 在 T4 停用、代码已删；BSC 的还没激活。
- **血缘**：BEP-703 全部 41 个修订、bsc#3793 / BEPs#703 的评论里都**没有出现 “Tempo”**；Rust 代码自述对标的是 go-bsc，而不是 Tempo。

**依据**
- Tempo 规范（2026-10-09 访问）：“introduces a second consensus gas constraint for non-payment transactions … classified … based solely on their transaction data, without requiring any access to blockchain state … `general_gas_limit`, a new field added to the header” [19]。区块结构：header 增加了 `general_gas_limit`、`shared_gas_limit`、`timestamp_millis_part`；body 依次是 start-of-block 系统交易 → proposer lane → shared → end-of-block 系统交易 [20]。
- 分类代码：`tempo/crates/primitives/src/transaction/envelope.rs:245-263`（v1，`0x20c0` 前缀，AA 交易要求每个 call 都是 TIP-20）、`:265-301`（v2 / TIP-1045：selector 白名单，access list 和 authorization list 必须为空，key_authorization ≤ 1024 字节）；按 fork 选择：`crates/evm/src/block.rs:440-452`（`is_t5()` → v2）[21][22]。
- 约束执行：`block.rs:188-207`（`non_payment_gas_left` 初始化为 `ctx.general_gas_limit`）、`:465-476`（非支付交易超出预算就进入 GasIncentive 段）、`:620-627`（非支付交易扣减预算）、`:648-652`（T4 起 incentive 段不能有 gas → 等价于超出就无效）[22]。
- 参数：`crates/hardfork/src/lib.rs:277-296`（T1+ 的 general_gas_limit 固定为 `TEMPO_T1_GENERAL_GAS_LIMIT`；T4+ 的 shared_gas_limit 为 0，T4 之前为 gas_limit/10）、`constants.rs:77`（30_000_000）；header 校验 `crates/evm/src/consensus/mod.rs:82-108`；`chainspec/src/spec.rs:456-461`（T1 之前的回退值为 (gas_limit − shared)/2）[23]。
- TIP-1010（status: Mainnet）：区块 gas limit 500M，shared 50M，non-shared 450M，general 30M，“guaranteeing that at least 420M gas remains available for proposer payment transactions” [25]。
- TIP-1045（status: Mainnet，protocolVersion T5）：完整 selector 白名单（TIP-20 的 transfer / transferWithMemo / transferFrom / approve / mint / burn 等，以及 TIP20ChannelReserve 的若干函数）；“Before T5, only the legacy TIP-20 address prefix check is enforced” [25]。
- 主网时间：`crates/chainspec/src/genesis/presto.json`（chainId 4217，映射为 "mainnet"，见 `spec.rs:102,125`）中 t1Time=1770908400（2026-02-12）、t4Time=1779112800（2026-05-18）、t5Time=1781013600（2026-06-09）[24]。
- Sub-block 停用：TIP-1046 §9（T4 起拒绝显式 subblock）；commit ff8aa9784（2026-09-10）“refactor: remove live subblock machinery”。docs 上的 sub-block-specification 页面已经 404 [25][26]。
- 费用：“Tempo has no native token … fees … paid directly in stablecoins … sufficient liquidity on the native Fee AMM”；T7 引入了动态 base fee [27]。
- 无血缘的证据：`rg -i tempo` 在 bsc 的 paymentlane 相关目录、reth-bsc 的 payment_lane 目录、BEP-703 全部草案中都是 0 命中；PR 评论检查结果为 BEPs#703（11 条 review comment）、bsc#3793（29 条）、reth-bsc#497，都是 0 命中（命令记录见文末）。

**对比表（供报告使用）**
| 维度 | BSC Payment Lane（BEP-703） | Tempo Payment Lane |
|---|---|---|
| 约束形式 | `N + max(P,Q) ≤ G` ⇔ `N ≤ G−Q` 且 `N+P ≤ G` | `Σ非支付(proposer lane) ≤ general_gas_limit` 且 总量 ≤ gas_limit |
| 预留谁 | 给支付保底（默认 5%，上限 10%） | 给非支付封顶（30M / 500M ≈ 6%） |
| 参数来源 | 父状态中系统合约 0x2007 的治理 ratio × 本块 GasLimit | 区块头 `general_gas_limit`，按 hardfork 固定（T1+ 30M），header 校验 |
| header 改动 | 无 | 新增 `general_gas_limit` / `shared_gas_limit` / `timestamp_millis_part` |
| 支付识别 | 治理名单（按地址，任意函数）或 value>0 且接收方无代码 | T5 前：TIP-20 地址前缀；T5 起：TIP-1045 target + selector + ABI 白名单 |
| 读状态 | 是（名单读父状态；code 读实时状态） | 否（只看交易 payload） |
| 7702 / 授权 | 0x04 类型一律 general；委托账户算有代码 | 授权列表非空一律 general（T5 起） |
| 多调用 / AA | 只看顶层 `to`；没有原生 AA 批量交易 | AA 交易的每个 call 都必须匹配 |
| 费用 | 不变（BNB 付费，base fee = 0，按小费竞价） | 稳定币付费 + Fee AMM；T7 起动态 base fee |
| 区块结构 | 不分区，任意交错 | 系统交易 / proposer lane / （历史上的）shared sub-block 分段；T4 起 sub-block 停用 |
| 上线 | 已合并未激活（Jenner：测试网 10 月下旬、主网 11 月下旬计划） | 主网已运行（T1 2026-02-12；T5 分类 2026-06-09） |

**不确定之处**
- Tempo 主网**当前**的 gas limit 是否仍为 500M，我没有查链上数据，只引用了 TIP-1010 和 genesis 的初始值。
- “同类设计”是我根据约束形式推出的结论（inferred）。BSC 团队是否参考过 Tempo，既没有正面证据，也没有反面证据。

---

## 代码片段（建议入报告）

**S1 分类函数**：`bsc/core/paymentlane/classify.go:34-65@8cc60b246c`。说明判定顺序，以及“listed 只能判出 payment”“zero hash 也算无代码”这两点。
```go
// Classify runs BEP-703 section 3.2's gates in order.
func (c *Classifier) Classify(tx *types.Transaction) LaneType {
	if c.isSystemTx(tx) {
		return GeneralLane
	}
	to := tx.To()
	if to == nil {
		return GeneralLane
	}
	switch tx.Type() {
	case types.LegacyTxType, types.AccessListTxType, types.DynamicFeeTxType:
	default:
		return GeneralLane
	}
	if _, ok := c.listed[*to]; ok {
		return PaymentLane
	}
	if tx.Value().Sign() == 0 {
		return GeneralLane
	}
	if hasCode(c.code.GetCodeHash(*to)) {
		return GeneralLane
	}
	return PaymentLane
}

func hasCode(codeHash common.Hash) bool {
	return codeHash != (common.Hash{}) && codeHash != types.EmptyCodeHash
}
```

**S2 quota 与不等式**：`bsc/core/paymentlane/paymentlane.go:60-81@8cc60b246c`。说明 128 位乘除，以及“已用 gas + 闲置配额 ≤ GasLimit”这一等价形式。
```go
// Quota is paymentLaneQuota(h) = PAYMENT_LANE_RATIO(h−1) × GasLimit(h) / RATIO_DENOM.
func Quota(ratio, gasLimit uint64) uint64 {
	hi, lo := bits.Mul64(ratio, gasLimit)
	if hi >= RatioDenom {
		log.Error("Payment lane quota overflowed", "ratio", ratio, "max", MaxLaneRatio, "gasLimit", gasLimit)
		return math.MaxUint64
	}
	q, _ := bits.Div64(hi, lo, RatioDenom)
	return q
}

// CheckInequality is the block validity rule.
func CheckInequality(gasLimit, gasUsed, paymentGasUsed, paymentLaneQuota uint64) error {
	sum, carry := bits.Add64(gasUsed, satSub(paymentLaneQuota, paymentGasUsed), 0)
	if carry != 0 || sum > gasLimit {
		return fmt.Errorf("%w: gas used %d payment %d quota %d limit %d",
			ErrViolated, gasUsed, paymentGasUsed, paymentLaneQuota, gasLimit)
	}
	return nil
}
```

**S3 出块侧准入谓词**：`bsc/core/paymentlane/budget.go:9-32@8cc60b246c`。支付交易可以用全部剩余空间，普通交易必须给闲置配额留出位置。
```go
func (b Budget) IdleLane() uint64 { return satSub(b.PaymentLaneQuota, b.PaymentLaneUsed) }

// MaxAvailableGas is the largest gas limit a SINGLE transaction of this lane type may declare.
func (b Budget) MaxAvailableGas(shared uint64, laneType LaneType) uint64 {
	if laneType == PaymentLane {
		return shared
	}
	return satSub(shared, b.IdleLane())
}

func (b Budget) Admits(shared uint64, laneType LaneType, txGasLimit uint64) bool {
	return txGasLimit <= b.MaxAvailableGas(shared, laneType)
}
```

**S4 import 接入点**：`bsc/core/state_processor.go:97-103, 159-172, 200-202@8cc60b246c`（节选）。父状态在系统合约升级和交易执行之前读取；每笔交易执行前分类；Finalize 之后（已含系统交易 gas）做校验；fast node 跳过。
```go
	// BEP-703 payment-lane, fastnode skip the payment-lane check.
	lane := &LaneState{}
	if !statedb.NoTries() {
		if lane, err = ResolveLaneState(config, p.chain.Engine(), lastBlock, header, statedb); err != nil {
			return nil, laneReject(err)
		}
	}
	// Handle upgrade built-in system contract code
	systemcontracts.TryUpdateBuildInSystemContract(...)
	...
		laneType := lane.Classify(tx)
		usedBefore := gp.Used()
		receipt, err := ApplyTransactionWithEVM(msg, gp, statedb, ...)
		...
		lane.RecordUsedFrom(laneType, gp, usedBefore)
	...
	if err := lane.Verify(gasUsed); err != nil {
		return nil, laneReject(err)
	}
```

**S5 出块选交易**：`bsc/miner/worker.go:965-971@8cc60b246c`。
```go
		laneType := env.lane.Classify(tx)
		if !env.lane.Admits(env.gasPool.Gas(), laneType, tx.Gas()) {
			generalLaneYieldedCounter.Inc(1)
			env.generalLaneYielded++
			log.Trace("Yielding idle payment lane", "hash", ltx.Hash, "left", env.gasPool.Gas(), "paymentLaneIdle", env.lane.Budget.IdleLane())
			txs.Pop()
			continue
		}
```

**S6 BidBlock：先广播，再 InsertChain，违规则撤销 builder**：`bsc/miner/bid_block.go:354-376@8cc60b246c`（节选）。
```go
	// InsertChain re-executes all txs and validates fields the validator could
	// not check at admission. Any mismatch is treated as builder dishonesty and
	// revokes the builder for the default lockout window. Categories caught here:
	//   ...
	//   - BEP-703's payment lane rule
	_, insertErr := w.chain.InsertChain(types.Blocks{block})
	if insertErr != nil {
		// A failed local state read left the block unjudged, so it says nothing about the builder.
		if !errors.Is(insertErr, paymentlane.ErrStateUnavailable) {
			reason := fmt.Sprintf("InsertChain err: %v", insertErr)
			violationCount = w.permMgr.RevokeForViolation(task.bidBlockInfo.builder, reason, hash, block.NumberU64())
```

**S7 激活块不接受 BidBlock**：`bsc/miner/miner_mev.go:117-122@8cc60b246c`。
```go
	// Security: validators must self-produce hard-fork activation blocks.
	if miner.worker.chainConfig.IsOnPasteur(bb.Header.Number, parent.Time, bb.Header.Time) ||
		miner.worker.chainConfig.IsOnJenner(bb.Header.Number, parent.Time, bb.Header.Time) {
		return common.Hash{}, buildertypes.NewInvalidBidError(fmt.Sprintf(
			"BidBlock disabled on hard-fork activation block %d, fallback to SendBid", blockNumber))
	}
```

**S8 治理合约的 ratio 写入与“0 = 未写 → 500”**：`bnb-chain/bsc-genesis-contract/contracts/PaymentLane.sol:91-98, 128-131@2620fb411b`。
```solidity
    function updateParam(string calldata key, bytes calldata value) external onlyGov {
        if (key.compareStrings("paymentLaneRatio")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newRatio = value.bytesToUint256(32);
            if (newRatio == 0 || newRatio > MAX_PAYMENT_LANE_RATIO) revert InvalidValue(key, value);
            _paymentLaneRatio = newRatio;
        } else if (key.compareStrings("addPaymentContract")) { ... }
    ...
    function getPaymentLaneRatio() external view returns (uint256) {
        uint256 ratio = _paymentLaneRatio;
        return ratio == 0 ? DEFAULT_PAYMENT_LANE_RATIO : ratio;
    }
```

**S9 Rust 等价分类（双客户端一致）**：`reth-bsc/src/consensus/payment_lane/rules.rs:43-72@349f55c`（可选，用来展示 Go 与 Rust 结构对齐）。

**S10 Tempo 分类与约束**（对比用）：`tempo/crates/evm/src/block.rs:447-452, 469-476@feb5dff7da`。
```rust
    pub(crate) fn is_payment(&self, tx: &TempoTxEnvelope) -> bool {
        if self.evm().cfg.spec.is_t5() {
            tx.is_payment_v2()
        } else {
            tx.is_payment_v1()
        }
    }
    ...
                BlockSection::StartOfBlock | BlockSection::NonShared => {
                    if gas_used > self.non_shared_gas_left
                        || (!self.is_payment(tx) && gas_used > self.non_payment_gas_left)
                    {
                        Ok(BlockSection::GasIncentive)
```
以及 `tempo/crates/primitives/src/transaction/envelope.rs:255-263`（v1 前缀判定，只看 `to`）。

**S11 Tempo 参数**：`tempo/crates/hardfork/src/lib.rs:277-296@feb5dff7da`（general_gas_limit 在 T1 及以后固定为 30M；shared 在 T4 及以后为 0）。

---

## 图的素材

**图 A：Payment Lane 分类决策树**（对应 S1）
1. 是 Parlia 系统交易？→ 是：GENERAL
2. `to == nil`（合约创建）？→ 是：GENERAL
3. type ∈ {0x00, 0x01, 0x02}？→ 否（0x03 blob / 0x04 7702 / 其他）：GENERAL
4. `to` 在名单中？（读父区块 post-state，来自 0x2007 的 getter）→ 是：**PAYMENT**（结束，不再看 value 和 code）
5. `value == 0`？→ 是：GENERAL
6. `to` 在实时状态下有代码？（含 7702 delegation designator、同块刚部署的代码）→ 是：GENERAL
7. 否则：**PAYMENT**（裸 BNB 转账；预编译地址也落在这里）
- 旁注：名单在 fork 时为空；增删 = GovHub → `updateParam`，从下一个区块起生效。

**图 B：配额示例**（假设 G = 100M、ratio = 500 → Q = 5M），四根条形（A/B/C/D 四种情形，数据见 P-Q3 表格）。用颜色区分 general（含系统交易）、payment、闲置预留（“:”）、未用空间（“.”）。可以复用 BEP §3.1 的 ASCII 示意（quiet / 拥堵且支付不足 / 拥堵且支付超额）。另附 BEP 自带示例：G = 55M → Q = 2.75M（约 130 笔 BNB 转账，或 45–78 笔稳定币转账）。

**图 C：出块 / 验块流水线（标出 lane 检查点）**
- 参与者：Builder、Validator（worker / bidSimulator）、本地 BlockChain（InsertChain / StateProcessor）、P2P 对等节点、系统合约 0x2007。
- 出块（validator 自己打包）：makeEnv → ①`ResolveLaneState`（父状态 getter → quota、名单）→ 循环选交易：②`Classify`（实时 code）→ ③`Admits(pool剩余, lane, tx.Gas())`（不通过则跳过普通交易）→ 执行 → ④`RecordUsedFrom` → AssembleBlock（系统交易）→ ⑤`Verify(block.GasUsed)` → 封块 / 签名 / 广播。
- SendBid（legacy）：Builder 发 bid（交易列表）→ bidSimulator 重新执行：② + ④（greedy merge 时也做 ③）→ payBidTx → ⑥`VerifyPackedBid(idle ≤ pool剩余)`，不通过则拒绝该 bid → 选出最佳 bid → 走 ⑤ 封块。
- SendBidBlock（BEP-675）：Builder 发已执行好的完整块 →（激活块直接拒绝，退回 SendBid）→ Validator 只做 header / 结构检查，**不执行**，没有 lane 检查 → 签名并**先广播** → 本地 InsertChain 重新执行（①②④⑤）→ 违规：`RevokeForViolation(builder)`；`ErrStateUnavailable`：不撤销，块“留待判定”。
- Import（任意全节点）：StateProcessor：①（NoTries 时跳过）→ 系统合约升级 → 逐笔 ②④ → Finalize（系统交易 gas 计入 general）→ ⑤ → 违规时拒块（laneRejectedCounter）。
- 分支：父块未到 Jenner → lane 关闭（激活块本身不受约束）。

**图 D：BSC vs Tempo 约束形状**：两个并排的区块条。BSC：右侧 5% 是“支付保底”（普通交易不能进入）。Tempo：左侧 30M 是“非支付封顶”，其余全部可以给支付用。标注两者都满足“general ≤ X 且 total ≤ G”。

**图 E：BEP-703 规范演进时间线**：07-17 初稿（动态、父状态、USDT/USDC 初始）→ 07-31 UncleHash 承诺 → 08-12 code 检查改读 live state → 08-14 引入系统合约 0x2007 → 08-31 删除 data 为空条件 → **09-01 官方博客（描述动态方案）** → 09-08 “simply model” 删除动态和 UncleHash → 09-11 BEP 合并、bsc#3793 合并、genesis-contract#682 合并 → 09-20 Jenner 公告（default 5%）→ 09-23 reth-bsc#497 合并 → 10-05 reth-bsc QANet 排期 Jenner → 计划：10 月下旬测试网 / 11 月下旬主网。

---

## 外部调研的修正

1. **“Tempo：支付识别 = TIP-20 地址前缀”——过时。** 这只是 T5 之前的规则（`is_payment_v1`）。Tempo 主网 T5（presto t5Time = 2026-06-09）起，共识层按 TIP-1045 判定：调用目标 + selector + ABI 形状都必须在白名单里，access list、authorization list 必须为空，key_authorization ≤ 1024 字节 [21][22][24][25]；官方 payment-lane 规范页也已改成按白名单描述 [19]。“多调用交易检查各调用目标”仍然成立，但现在检查的是“每个 call 的 target + selector”。
2. **“Tempo 的规则要放在 proposer lane、sub-block 等整体区块结构中理解”——部分过时。** Sub-block 在 T4（presto 2026-05-18）起停用，`shared_gas_limit = 0`（TIP-1046 §9、`hardfork/src/lib.rs:290-296`），实时 sub-block 代码已于 2026-09-10 删除（ff8aa9784），docs 上的 sub-block 规范页已经 404 [23][25][26]。
3. **“规范使用 `general_gas_limit` 等约束”——正确但不完整。** 应补充：`general_gas_limit` 是**区块头字段**，T1 起固定为 30M，header 校验要求它等于 chainspec 给出的期望值 [19][20][23]。这正是它和 BSC“不加 header 字段”的关键区别。另外两者的比例倾向相反（Tempo 给非支付封顶约 6%；BSC 给支付保底 5%），外部调研的对比表没有点出这一点。
4. **“当前规范中的配额由所有节点自行计算，不需要一个新的 `PaymentGasLimit` 区块头字段”——结论正确，但遗漏了演进过程。** “PaymentGasLimit” 只是博客里的用词，BEP 各版草案都没有用过。中间版草案（2026-07-31 至 08-31）曾经**复用 `header.UncleHash`** 来承诺 quota 和 paymentGasUsed，09-08 才删掉 [3][5][17]。
5. **“9 月 1 日官方博客描述过……动态方案”——正确，补充原因。** 博客如实反映了当时（08-31）的草案；方案是在博客发布一周后（09-08，10020317）改成静态的 [2][5]。博客中“USDT、USDC 有资格”“验证者会对阈值、调整速度投票”这两点，在当前 BEP 下也已过时 [1][17]。
6. **“它不保证……FIFO、抗审查、抗 MEV 或独立并行执行。规范仍保留出块者的交易选择和排序自由”**——方向正确，但 BEP 原文只明确写了“不承诺任何单笔被纳入”“不新增排序 / 优先级 / 费用规则”；FIFO、抗 MEV、并行执行这几项是推论，不是规范原文 [1 §1, §3.3]。
7. **“客户端的 budget 模块……对完成的区块检查相同的最终约束”——基本正确，需细化。** `budget.go` 的准入用的是**声明 gasLimit**，最终校验用的是实际 gasUsed；完成区块的校验是 `LaneState.Verify` → `Budget.Verify` → `CheckInequality`。此外 Go 的 fast node（`NoTries`）**跳过**这项校验，Rust 不跳过 [7][9][12][14]。
8. 外部调研中正确、已复核的说法：bsc#3793 于 9 月 11 日合并、reth-bsc#497 于 9 月 23 日合并；默认 5%、上限 10%；不等式 `N + max(P,Q) ≤ G`；名单为空、USDT/USDC 是预期首批；激活块的下一个区块才开始约束；BidBlock 路径在 import 时检查、违规按坏 BidBlock 处理 [1][12][14]。
9. 外部调研没提、但报告需要的事实：BEP-703 文件状态仍是 **Draft** [1 头部]；两项实现都**不在**任何 release 中 [28]；BSC 主网和 Chapel 的 `JennerTime` 仍为 nil [11]；Jenner 激活块禁止 BidBlock [10][16]。

---

## 来源

1. **PRIMARY** BEP-703 最终版，`BEPs/BEPs/BEP-703.md@e9b2be3b00`（文件 commit 8b25387，2026-09-11）。规范原文：分类、不等式、quota、激活、校验、治理接口、理由、安全考虑。
2. **PRIMARY** bnb-chain/BEPs PR #703（created 2026-07-17，merged 2026-09-11T06:01:36Z，41 commits），`gh pr view 703 -R bnb-chain/BEPs` 和 `gh api repos/bnb-chain/BEPs/pulls/703/commits`。证明规范的修订史。
3. **PRIMARY** BEP-703 草案 @3c210b5d（2026-08-31），`git show 3c210b5d:BEPs/BEP-703.md`。证明博客发布前的规范是动态 quota + UncleHash 承诺，以及其中的参数。
4. **PRIMARY** BEP-703 初稿 @7d229232（2026-07-17）。证明最初版本的分类全部读父状态、初始名单为 USDT/USDC、无 header 字段的动态模型。
5. **PRIMARY** BEPs commit 10020317（2026-09-08，“chore: simply model”，+121/−337）。证明动态模型和 UncleHash 是在这次提交中删除的。
6. **PRIMARY** `bsc/core/paymentlane/{classify,budget,paymentlane}.go@8cc60b246c`。Go 中的分类、quota、不等式和准入实现。
7. **PRIMARY** `bsc/core/payment_lane.go@8cc60b246c`。出块与验块共用的 LaneState：父状态门槛、live 分类、Verify、VerifyPackedBid。
8. **PRIMARY** `bsc/core/paymentlanemeta/{loader,caller,abi,cache,types}.go` 与 `payment_lane_meta.abi.json@8cc60b246c`。证明通过 getter 读父状态、分页物化名单、缓存键、守卫。
9. **PRIMARY** `bsc/core/state_processor.go:97-203@8cc60b246c`、`core/blockchain.go:3409-3425`。import 路径上的接入点、fast-node 跳过、状态不可读时不判定。
10. **PRIMARY** `bsc/miner/{worker.go,bid_simulator.go,bid_block.go,miner_mev.go}@8cc60b246c`。出块准入与封块前校验、bid 校验、BidBlock 的 InsertChain 校验与撤销、激活块拒绝 BidBlock。
11. **PRIMARY** `bsc/core/systemcontracts/{upgrade.go:1113-1145,const.go:21}`、`params/config.go:256,311,368,1479-1489@8cc60b246c`。Jenner 安装 0x2007，三个网络的 JennerTime 均为 nil。
12. **PRIMARY** bnb-chain/bsc PR #3793（merged 2026-09-11T05:57:02Z，merge 1580ed1d6，36 files +2555/−37）。合并时间、范围、fast-node 行为说明。
13. **PRIMARY** bnb-chain/bsc-genesis-contract PR #682（merged 2026-09-11T06:02:05Z）与 `contracts/PaymentLane.sol@2620fb411b`、`SystemV2.sol`。治理合约的实现：默认 500、上限 1000、名单上限、onlyGov = 0x…1007。
14. **PRIMARY** bnb-chain/reth-bsc PR #497（merged 2026-09-23T03:04:09Z，3404580，27 files +2180/−243）。Rust 实现的范围、与 Go 的差异。
15. **PRIMARY** `reth-bsc/src/consensus/payment_lane/{mod,rules,state,meta}.rs`、`src/node/evm/executor.rs:607-623`、`src/node/miner/bid_simulator.rs:1215@349f55c`。Rust 的分类、quota、校验，以及 live code 读取。
16. **PRIMARY** `reth-bsc/src/rpc/mev.rs:702-715`、`src/hardforks/bsc.rs:231-232,415-425@349f55c`。激活块拒绝 BidBlock；QANet Jenner 定于 2026-10-05，主网 / Chapel 未排期。
17. **PRIMARY**（官方博客）BNB Chain Blog，“BSC Payment Lane: Reserved Blockspace That Keeps Payments Moving”，2026.9.1，https://www.bnbchain.org/en/blog/bsc-payment-lane-reserved-blockspace-that-keeps-payments-moving （访问 2026-10-09）。证明当时对外描述的是动态方案、PaymentGasLimit 用语、Q4 2026 计划。
18. **PRIMARY** BNB Chain Docs，“Jenner Hardfork (BSC)”，https://docs.bnbchain.org/announce/jenner-bsc/ （页面日期 2026-09-20，访问 2026-10-09）。证明 Jenner 包含 BEP-703（default 5%）、测试网 10 月下旬 / 主网 11 月下旬、release 未发布。
19. **PRIMARY** Tempo Docs，“Payment Lane Specification”，https://docs.tempo.xyz/protocol/blockspace/payment-lane-specification （返回 markdown，访问 2026-10-09）。证明 Tempo 是第二道非支付 gas 约束、不读状态、`general_gas_limit` 是 header 字段。
20. **PRIMARY** Tempo Docs，“Blockspace overview”，https://docs.tempo.xyz/protocol/blockspace/overview.md （访问 2026-10-09）。证明 header 的三个扩展字段和 body 的分段。
21. **PRIMARY** `tempo/crates/primitives/src/transaction/envelope.rs:245-301@feb5dff7da`。分类 v1（前缀）与 v2（TIP-1045）。
22. **PRIMARY** `tempo/crates/evm/src/block.rs:188-207,440-476,620-652@feb5dff7da`。按 fork 选择分类器、非支付预算的扣减、T4 起超出即无效。
23. **PRIMARY** `tempo/crates/hardfork/src/lib.rs:277-296`、`constants.rs:77`、`crates/evm/src/consensus/mod.rs:82-108`、`crates/chainspec/src/spec.rs:456-461@feb5dff7da`。general_gas_limit 30M 固定值、shared 规则、header 校验。
24. **PRIMARY** `tempo/crates/chainspec/src/genesis/presto.json`（chainId 4217 = mainnet）与 `moderato.json`。Tempo 主网各 hardfork 时间（T1 2026-02-12、T4 2026-05-18、T5 2026-06-09）。
25. **PRIMARY** `tempo/tips/tip-1045.md`、`tip-1010.md`、`tip-1046.md@feb5dff7da`。TIP-1045 selector 白名单（Mainnet，T5）；TIP-1010 主网 gas 参数（500M / 50M / 30M）；TIP-1046 中 T4 停用 subblock。
26. **PRIMARY** tempo commit ff8aa9784（2026-09-10，“refactor: remove live subblock machinery (#7449)”）。证明 sub-block 机制已从代码中删除。
27. **PRIMARY** Tempo Docs，“Understanding transaction fees on Tempo”，https://tempo.xyz/developers/docs/protocol/fees.md （访问 2026-10-09）。没有原生币、用稳定币付费、Fee AMM、T7 动态 base fee。
28. **PRIMARY** `gh release list -R bnb-chain/bsc` / `-R bnb-chain/reth-bsc`（2026-10-09）。最新 release（bsc v1.8.0-alpha 08-13、v1.7.8 08-11；reth-bsc v0.1.2 08-20）都早于 lane 的合并日期。
29. 外部调研（ChatGPT Deep Research），`research/bsc-development-research.md`。二手线索；修正见上一节。
30. **PRIMARY** bsc commit 2f383c288（#3821，2026-09-23）、reth-bsc commit b76eb94（#522，2026-09-29）。合并之后的修补：缓存测试、出块路径缓存。

关键命令记录：
- `gh pr view 3793 -R bnb-chain/bsc --json mergedAt,mergeCommit,...` → `"mergedAt":"2026-09-11T05:57:02Z"`
- `gh pr view 497 -R bnb-chain/reth-bsc --json mergedAt,...` → `mergedAt 2026-09-23T03:04:09Z`
- `git -C BEPs log -- BEPs/BEP-703.md` → 只有 `8b25387 2026-09-11 BEP-703: payment lane (#703)`
- 对 18 个草案修订分别执行 `git show <c>:BEPs/BEP-703.md | grep -c UncleHash` → 7d229232=0，daa6af1a 到 3c210b5d 为 7~9，10020317=0；`grep -c PaymentGasLimit` 全部为 0
- `rg -i tempo` 覆盖 bsc 的 paymentlane 相关目录、reth-bsc 的 payment_lane 目录、BEP-703 全部 41 个修订 → 0 命中；`gh api repos/<r>/{issues,pulls}/<n>/comments | grep -ci tempo` → BEPs#703、bsc#3793、reth-bsc#497 全部为 0

---

## 开放问题

1. 10020317 为什么放弃动态 quota 和 UncleHash 承诺？需要逐条读 BEPs#703 的 11 条 review comment，或者找论坛讨论。
2. 首批名单提案（USDT/USDC 地址）是否已经在 BNB Chain 论坛 / 治理中提交？博客说“Parameter proposals … will be published ahead of rollout”，我没有找到。
3. BSC 主网当前的 gas limit 是否仍为 55M？报告中的绝对数字以哪个 gas limit 为准？
4. 出块侧用声明 gasLimit 做准入，对出块收益和普通交易的打包有多大影响？是否有 QANet 指标（`paymentlane/generalLaneYielded`、`paymentLaneIdle`）？
5. Go 跳过 fast-node 检查而 Rust 不跳过，这是否会在 snap / fast 同步场景下造成两个客户端行为不一致（不影响共识，但影响运维）？
6. Tempo 主网当前的 block gas limit，以及 general_gas_limit 是否在 T1 之后的 TIP 中再调整过（例如 T7 / T12）？
7. 一个违反 lane 的 BidBlock 被签名广播后，其他节点拒块，对出块间隔和 backup validator 的实际影响有多大？需要与 BEP-675 那一路的笔记交叉核对。

---

## 台账

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| P1 | BEP-703 为每个区块预留一部分 gas 给支付交易，普通交易即使在这部分空着时也不能使用 | BEP-703.md §1、§3.1（:38, 48-87）@e9b2be3b00 | observed |
| P2 | Lane 保证支付交易作为一类有 gas 可用，不承诺任何单笔交易被打包 | BEP-703.md:38 “does not promise that any one of them is included” | observed |
| P3 | BEP-703 不新增排序、优先级或费用规则，出块者保留选择和排序自由；不改交易格式和区块头 | BEP-703.md §3.3 :152；§5 :275 | observed |
| P4 | Lane 不提供 FIFO、抗审查或抗 MEV 保证 | 由 P2、P3 推出：出块者可自由选择和排序，单笔不保证纳入 | inferred |
| P5 | 分类顺序：系统交易 → to==nil → 类型∉{0,1,2} → 名单命中即 payment → value==0 → 有代码 → 否则 payment | BEP-703.md §3.2 伪代码；bsc/core/paymentlane/classify.go:34-58@8cc60b246c；reth-bsc/src/consensus/payment_lane/rules.rs:42-72@349f55c | observed |
| P6 | 名单按地址登记，与调用的函数（selector）无关；只检查顶层 `to` | BEP-703.md §3.6.2 :227；classify.go:39-49 只读 tx.To() | observed |
| P7 | EIP-7702 delegation designator 算“有代码”；0x04 类型交易一律 general | BEP-703.md §3.2 条件说明、§4；classify.go:43-47,60-65；reth-bsc executor.rs:607-623 | observed |
| P8 | 带 value 调用预编译会被归为 payment，规范不做特殊处理 | BEP-703.md §6 “Precompiles in the lane” | observed |
| P9 | 当前规则下，带 calldata 的 BNB 转账只要接收方无代码就算 payment（“data 为空”条件已于 2026-08-31 删除） | BEP-703.md §3.2 无 data 条件；草案 fa7575b/3313043 有、f2314c7a 无（git show 比对） | observed |
| P10 | 支付名单在 fork 时为空，USDT/USDC 只是预期的首批条目 | BEP-703.md §3.6.2 :227-231；PaymentLane.sol:62-63@2620fb411b | observed |
| P11 | 系统合约 `PaymentLane` 位于 0x0000000000000000000000000000000000002007，由 Jenner 在激活块安装 | BEP-703.md §3.6.3 :237；bsc/core/systemcontracts/const.go:21、upgrade.go:1113-1145 | observed |
| P12 | 治理通过 GovHub 0x…1007 调用 `updateParam`，key 为 paymentLaneRatio / addPaymentContract / removePaymentContract | BEP-703.md §3.6.5 :259；PaymentLane.sol:91-116；SystemV2.sol:13,66-67 | observed |
| P13 | quota = ratio(h−1) × GasLimit(h) / 10000，向零截断，中间结果宽于 64 bit | BEP-703.md §3.4.1-3.4.2；paymentlane.go:60-71（bits.Mul64/Div64）；rules.rs:16-21（u128） | observed |
| P14 | ratio 默认 500（5%），守卫 0 < ratio ≤ 1000（10%，协议常量、不可治理）；存储值 0 表示未写，getter 返回 500，因此节点必须调用 getter | BEP-703.md §3.6.1、§3.6.3-3.6.4；paymentlane.go:25-28,51-58；PaymentLane.sol:42,51,97,128-131 | observed |
| P15 | 名单上限 100,000 项；合约写入时强制，节点读取时校验 | BEP-703.md §3.6.1；PaymentLane.sol:47,106；paymentlanemeta/loader.go:77-79 | observed |
| P16 | 区块有效性条件 generalGasUsed + max(paymentGasUsed, quota) ≤ GasLimit；外部调研的 N+max(P,Q)≤G 正确 | BEP-703.md §3.3 :141-144；paymentlane.go:73-81；rules.rs:23-40 | observed |
| P17 | 该不等式等价于 N+P ≤ G 且 N ≤ G−Q | 由 P16 推出：分 P≥Q 和 P<Q 两种情况展开（与 BEP §3.3 “two regimes” 一致） | inferred |
| P18 | Parlia 系统交易的 gas 算 general；Go 用 Finalize 后的 gasUsed 做校验 | BEP-703.md §3.3；bsc/core/state_processor.go:186-202 | observed |
| P19 | 闲置配额不归还普通交易，理由是否则出块者排除支付交易没有任何代价 | BEP-703.md §4 :271 | observed |
| P20 | 在 G=55,000,000 时 quota = 2,750,000（约 130 笔 BNB 转账或 45–78 笔稳定币转账） | BEP-703.md §3.4.4 :182-190；rules.rs:116 单测 | observed |
| P21 | 假设 G=100M、ratio=500：Q=5M；P=0、N=95.5M 的区块无效；P=8M、N=92M 的区块有效 | 由 P13、P16 推出：100M×500/10000=5M；95.5+5=100.5>100；92+8=100≤100 | inferred |
| P22 | ratio 和名单读父区块 post-state；code 检查读本交易执行前的实时状态 | BEP-703.md §3.2 :96-127；payment_lane.go:52-66,81-88；state_processor.go:97-106,159；reth-bsc payment_lane/mod.rs:14-24 | observed |
| P23 | 激活块不受 lane 约束，activation+1 是第一个受约束的区块；Go 以 IsJenner(parent) 作为门槛 | BEP-703.md §3.4.3 :176-180；payment_lane.go:53；reth-bsc#497 描述 “from the activation block's child” | observed |
| P24 | Jenner 激活块上 BidBlock 被拒绝，退回 SendBid（Go 和 Rust 都是） | bsc/miner/miner_mev.go:117-122；reth-bsc/src/rpc/mev.rs:702-715 | observed |
| P25 | 出块侧按声明 gasLimit 准入：普通交易须满足 tx.Gas() ≤ pool剩余 − idle，支付交易只须 ≤ pool剩余 | bsc/core/paymentlane/budget.go:11-21；miner/worker.go:965-971 | observed |
| P26 | 出块侧封块前对整块做 Verify（失败则拒绝封块）；SendBid 路径在 bid 模拟末尾做 VerifyPackedBid（idle > pool剩余 则拒绝该 bid） | miner/worker.go:1315-1318,1685-1688；miner/bid_simulator.go:1216-1220；payment_lane.go:105-114 | observed |
| P27 | SendBidBlock 路径封块前不检查 lane，广播后由本地 InsertChain 检查，违规则撤销 builder；本地状态不可读时不撤销 | BEP-703.md §3.5 :196；miner/bid_block.go:354-376 | observed |
| P28 | 违反 lane 的 BidBlock 会先被签名并广播，之后才被拒绝 | 由 P27 推出：handleBidBlockResult 处理的已是封好的块，先 mux.Post(NewSealedBlockEvent) 广播（bid_block.go:337,352），后 InsertChain（:366） | inferred |
| P29 | Go 的 fast node（NoTries）跳过 lane 检查；Rust 没有这个豁免 | state_processor.go:97-103；bsc#3793 描述 “Fast-node behavior”；reth-bsc#497 描述 “does not add Geth-BSC's NoTries exemption” | observed |
| P30 | 2026-09-01 官方博客描述的是动态预留（拥堵时扩张、回落时收缩），并称 USDT/USDC 有资格、验证者将对阈值和速度投票 | 来源 [17] 博客 TL;DR 与 “How BSC Payment Lane Works”、“What This Means For You” 段 | observed |
| P31 | 博客发布前的草案（3c210b5d，08-31）是动态累加器 quota，并用 header.UncleHash 承诺 quota 和 paymentGasUsed | git show 3c210b5d:BEPs/BEP-703.md §3.4、§3.5 | observed |
| P32 | 2026-09-08 的提交 10020317 删除了动态模型和 UncleHash 承诺，改为单一治理比例 | git show 10020317 --stat（+121/−337）；逐版 grep “Dynamic Quota”/“UncleHash” 计数从非 0 变为 0 | observed |
| P33 | “PaymentGasLimit” 在 BEP-703 的任何一版草案中都没有出现 | 对 18 个修订执行 grep -c PaymentGasLimit，结果全为 0（notes §来源 命令记录） | observed |
| P34 | BEP-703 于 2026-09-11 squash 合并（PR #703，41 commits），文件状态仍为 Draft | gh pr view 703 -R bnb-chain/BEPs → mergedAt 2026-09-11T06:01:36Z；BEP-703.md 头部 “Status: Draft” | observed |
| P35 | bsc#3793 于 2026-09-11T05:57:02Z 合并（1580ed1d6，36 files +2555/−37）；reth-bsc#497 于 2026-09-23T03:04:09Z 合并（3404580，27 files +2180/−243），范围覆盖 rules/meta/state、executor、bid simulator、BidBlock import、Jenner 安装 | gh pr view 3793 -R bnb-chain/bsc --json mergedAt,mergeCommit；gh pr view 497 -R bnb-chain/reth-bsc --json mergedAt,files,body | observed |
| P36 | Payment Lane 尚未进入任何 bsc 或 reth-bsc release；BSC 主网和 Chapel 的 JennerTime 为 nil | gh release list（bsc v1.8.0-alpha 2026-08-13；reth-bsc v0.1.2 2026-08-20）；bsc params/config.go:256,311；reth-bsc hardforks/bsc.rs:415-425 | observed |
| P37 | 官方计划 Jenner 测试网 2026 年 10 月下旬、主网 11 月下旬，hard fork release 尚未发布；reth-bsc 在内部 QANet 把 Jenner 排在 2026-10-05 05:00 UTC | docs.bnbchain.org/announce/jenner-bsc/ “Upgrade Timeline”（2026-09-20，访问 2026-10-09）；reth-bsc/src/hardforks/bsc.rs:231-232@349f55c | observed |
| P38 | Tempo 的 payment lane 是对非支付交易的第二道 gas 约束，分类只看交易数据、不读状态，general_gas_limit 是区块头字段 | docs.tempo.xyz payment-lane-specification “Abstract”、§1；blockspace overview “Header fields” | observed |
| P39 | Tempo T1 起 general_gas_limit 固定为 30M，header 校验要求它等于期望值；T4 起 shared_gas_limit 为 0 | tempo/crates/hardfork/src/lib.rs:277-296、constants.rs:77、crates/evm/src/consensus/mod.rs:82-108@feb5dff7da | observed |
| P40 | Tempo T5 起按 TIP-1045 分类（target + selector + ABI 白名单，access list 和授权列表须为空）；T5 之前只看 0x20c0 前缀 | tempo envelope.rs:245-301；block.rs:447-452；tips/tip-1045.md “Specification”、“Pre-T5” | observed |
| P41 | Tempo 主网（presto）的 T1/T4/T5 分别于 2026-02-12 / 2026-05-18 / 2026-06-09 激活；sub-block 机制在 T4 停用，代码已于 2026-09-10 删除 | tempo chainspec/src/genesis/presto.json t1Time/t4Time/t5Time；tips/tip-1046.md §9；commit ff8aa9784 | observed |
| P42 | Tempo 用 USD 稳定币付手续费，经原生 Fee AMM 转换；BSC 的 lane 不改费用 | tempo.xyz/developers/docs/protocol/fees.md；BEP-703.md §5 | observed |
| P43 | BSC 和 Tempo 的 lane 属于同一类设计：约束形式都是“general ≤ 上限 且 总量 ≤ gas limit”，但分类方式、参数来源和比例倾向不同 | 由 P17、P38、P39、P40 推出 | inferred |
| P44 | 没有证据表明 BSC Payment Lane 移植自 Tempo：BEP 全部修订和三个 PR 的评论中 “tempo” 均为 0 命中，Rust 实现自述对标 go-bsc | rg/grep 命令（notes §来源 命令记录）；reth-bsc payment_lane/mod.rs:4-5 | observed |
| P45 | 砍掉动态模型的原因可能是 UncleHash 改动面太大，以及累加器分叉后无法重新收敛 | 草案 3c210b5d §3.4.3、§3.5.3 自述的风险；10020317 提交说明只有 “chore: simply model” | speculative |

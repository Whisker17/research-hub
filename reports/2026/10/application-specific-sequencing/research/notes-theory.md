# notes-theory：区块空间分区（payment lane）与 ACE 的理论边界（调研笔记，前缀 L）

- 调研日期 / 截止：2026-10-11
- 固定版本：tempo@87bd32a63d（2026-10-10）、bsc@8cc60b246c（2026-10-08）、BEPs@e9b2be3b00、mantlenetworkio/op-geth@e33cd26（2026-09-20）
- 引用格式：`仓库/路径:行号@commit`；网页均为 2026-10-11 访问；来源编号见文末“来源”
- 一句话结论：两条已经存在的 payment lane（Tempo 已上主网，BSC 已合并未激活）都只做**容量隔离**，不做排序（不要求 FCFS），也不做**费用隔离**；ACE 文章证明“共识强制的应用排序”在验块上便宜、在建块上难，并且应用规则之间会出现**无解的循环依赖**；排序正确与抗审查是两件事，后者要单独设计。

---

## L-Q1 Tempo payment lane：分类、上限、排序、费用

**答案**：Tempo 在共识层给**非支付**交易加第二道 gas 上限：区块头字段 `general_gas_limit`，自 T1 起固定为 30,000,000，header 校验要求它等于 chainspec 给出的值。支付交易的识别只看交易 payload，不读状态。T5 之前看调用目标是否带 TIP-20 地址前缀 `0x20c0…`（v1）。T5 起（Tempo 主网 2026-06-09）按 TIP-1045 判定（v2）：每个 call 的 target + selector + 精确 ABI 长度都要命中白名单，access list 和 authorization list 必须为空，`key_authorization` 不超过 1024 字节。规范原文写明“不要求任何特定排序”，默认交易池按 effective tip 排序。支付交易和其他交易付**同一个 base fee**（T7 起是动态 base fee，控制器输入是全块 gas，包括支付），没有独立费用市场。

**依据**
- 规范 Abstract：“introduces a second consensus gas constraint for non-payment transactions … classified … based solely on their transaction data, without requiring any access to blockchain state … `general_gas_limit`, a new field added to the header”[1]。
- 规范 §2 “Ordering of Transactions”：“The specification does not require any specific ordering of transactions: payment and non-payment transactions can be intermixed.” [1]。外部调研说“规范不要求 FCFS”，**核实正确**。
- 规范 §3 有效性条件：`general_gas_limit >= Σ gas_consumed(tx[i]) for all i such that !is_payment(tx[i]) and tx[i] is in the proposer's lane`，其中 gas_consumed 包括 intrinsic gas 和 revert 消耗的 gas [1]。
- 分类代码：v1 在 `tempo/crates/primitives/src/transaction/envelope.rs:255-263@87bd32a63d`（AA 交易要求每个 call 都打到 TIP-20 地址）；v2 在 `:280-301`，它调用 `is_tip1045_call`（`:574-587`）：TIP-20 目标需满足 `ITIP20Calls::is_payment(input)`，`TIP20_CHANNEL_RESERVE_ADDRESS` 目标需满足带签名校验的 `is_payment_with_valid_signature`，其他目标一律 false [5]。selector 匹配加“精确 ABI 编码长度”匹配见 `crates/contracts/src/precompiles/tip20.rs:200-225`（`is_call`：selector 相等，且 `input.len() == 4 + ENCODED_SIZE`）[5]。
- 按 fork 选择分类器：`crates/evm/src/block.rs:447-453`，`is_t5()` 时用 v2，否则用 v1 [6]。
- TIP-1045（status: Mainnet，protocolVersion: T5）给出完整白名单：TIP-20 的 transfer / transferWithMemo / transferFrom / transferFromWithMemo / approve / mint / mintWithMemo / burn / burnWithMemo，加上 TIP20ChannelReserve 的 open / topUp / settle / close / requestClose / withdraw。纯静态参数的 entry 不允许尾随字节；含动态类型的 entry，calldata 总长度 ≤ 2048。动机原文：“As payment lane eligibility expands beyond TIP-20 calls, consensus needs a generic but stable predicate”，“Builders MAY apply stricter local policy” [2]。
- TIP-20 前缀地址**本身就是预编译**：`crates/primitives/src/address.rs:50-51`（“Returns `true` if the address is a precompile … A TIP-20 token address”）[5]。所以只看前缀、不读状态就能分类：目标代码的语义是协议固定的，用户不能在这个前缀上部署任意代码。（这个推论对 Mantle 很重要，见“对 Mantle 的启示”。）
- 激活时间：`crates/chainspec/src/genesis/presto.json`（chainId 4217，`spec.rs:125` 映射到 PRESTO 主网）中 t1Time=1770908400（2026-02-12 15:00 UTC）、t4Time=1779112800（2026-05-18）、t5Time=1781013600（2026-06-09 14:00 UTC）、t7Time=1783605600（2026-07-09）、t12Time=1791900000（2026-10-13，尚未到）[9]。
- 上限与校验：`crates/hardfork/src/lib.rs:277-296`（T1+ 的 `general_gas_limit()` 为 `TEMPO_T1_GENERAL_GAS_LIMIT`；T4+ 的 `shared_gas_limit` 为 0，T4 之前为 gas_limit/10）；`crates/hardfork/src/constants.rs:73-77`（30_000_000）；`crates/evm/src/consensus/mod.rs:94-106`（header 中的 general_gas_limit 不等于期望值时返回 `GeneralGasLimitMismatch`）[7]。
- 执行时扣减：`block.rs:206`（`non_payment_gas_left: ctx.general_gas_limit`）、`:469-477`（非支付交易超出预算后进入 GasIncentive 段）、`:624-628`（非支付交易扣减预算）、`:648-652`（T4 起 incentive 段只要有 gas 就报 “incentive gas limit exceeded”，所以超出上限的区块直接无效）[6]。另外，代码测试 `block.rs:1843-1897` 表明 T4 起这部分记账用的是 “regular gas”，不含 state gas [6]。
- TIP-1010（status: Mainnet，T1）给出的初始参数：区块 500,000,000 gas，shared 50M，general 30M，“guaranteeing that at least 420M gas remains available for proposer payment transactions”；base fee 固定为 2×10^10 attodollars/gas，“fixed per protocol version and does not adjust dynamically” [3]。T4 之后 shared 为 0，所以按代码推算，支付可用的空间是 500M − 30M = 470M（inferred，前提是 gas limit 仍为 500M）。
- 构建侧：`crates/payload/builder/src/lib.rs:571-588`（非支付交易如果会超过 `general_gas_limit`，就 `mark_invalid(... ExceedsNonPaymentLimit)` 跳过）；交易池在入池时就计算 `is_payment_v2()`（`crates/transaction-pool/src/transaction.rs:105`）；池内按 `TempoTipOrdering` 排序，即按 “effective coinbase tip” 排（`crates/transaction-pool/src/ordering.rs:6-27`）[8]。envelope.rs 的注释说 v2 “Used by the transaction pool and payload builder to prevent DoS of the payment lane, and enshrined at the consensus level at the T5 hardfork”（`:276-278`）[5]，也就是先作为本地策略使用，后来才写进共识。
- 费用：TIP-1067（T7）的 Assumptions 原文：“The controller input is the total gas used by all transactions included in a block … across all lanes (payment and general) … so heavy payment-lane usage raises the base fee just as general usage does.” 参数：cap 1.2×10^10、floor 6×10^8 attodollars/gas，target 10,000,000 gas，max change denominator 8 [4]；代码见 `constants.rs:41-70` [7]。

**不确定之处**
- TIP-1067 文件头仍写 `status: Approved`，但 presto.json 的 t7Time 已经过去（2026-07-09）。TIP 状态字段可能没有及时更新；我没有查链上 header 来确认 T7 base fee 是否真的在主网生效。
- Tempo 主网**当前**的 block gas limit 我没查链上数据，只用了 TIP-1010 的初始值。
- 构建器在 T5 之前用的是 v1（`lib.rs:571-575`），这和 envelope 注释“pool 和 builder 用 v2 防 DoS”不完全一致；不过 T5 已过，这个差异只涉及历史区块。

---

## L-Q2 BSC Payment Lane（BEP-703）

**答案**：BEP-703 给**支付**保底，不给非支付封顶。规则是 `generalGasUsed + max(paymentGasUsed, quota) ≤ GasLimit`，其中 `quota = ratio(父状态) × GasLimit / 10000`，默认 ratio 500（5%），上限 1000（10%）。预留空间闲置时**不归还**给普通交易。分类规则：名单（治理维护，读父状态，按地址登记，被调用的函数不限）→ 支付；否则只有“value>0 且接收方在实时状态下没有代码”的交易才算支付；系统交易、合约创建、类型不在 0x00/0x01/0x02 的交易都算普通交易。lane 检查在出块侧（准入 + 封块前 Verify）和验块侧（state processor 逐笔分类、最后校验不等式）都执行，违规就是**区块无效**。BEP-703 状态仍是 Draft；Go 实现 2026-09-11 合并，Rust 实现 2026-09-23 合并，但都没进入任何 release。Jenner 在主网和 Chapel 都没排期，官方计划是测试网 2026 年 10 月下旬、主网 11 月下旬。

**依据**
- 规则与两种情形：`BEPs/BEP-703.md:141-152@e9b2be3b00`（§3.3）；“No new ordering rule, priority rule, or fee rule is introduced.”（:152）[11]。
- “The lane guarantees gas to payment transactions as a class; it does not promise that any one of them is included.”（:38）[11]。
- 闲置不归还的理由（§4，:271）：“If the shortfall flowed back to general transactions, excluding payment transactions would cost a producer nothing … the floor would be a fiction precisely in the congested blocks it exists for.” [11]
- 不提供费用隔离（§6，:281）：“Reserved gas is not free gas: a third party flooding the lane bids for it under the ordinary fee rules and pays full fees throughout.” [11]
- 分类伪代码，以及父状态 / 实时状态的分工：`BEP-703.md:89-127`（§3.2）[11]；实现见 `bsc/core/paymentlane/classify.go:35-58@8cc60b246c`，`hasCode` 在 `:63` [12]。
- 不等式实现：`bsc/core/paymentlane/paymentlane.go:73-81`（`CheckInequality`，等价写法 `gasUsed + satSub(quota, paymentGasUsed) ≤ gasLimit`）；准入：`budget.go:12-21`（普通交易能声明的最大 gas = 剩余 gas − 闲置预留）[12]。
- 父区块已激活 Jenner 才开启 lane：`bsc/core/payment_lane.go:52-53`（`!config.IsJenner(parent.Number, parent.Time)`）[12]。
- 激活状态：`bsc/params/config.go:256,311,368` 中 `JennerTime: nil`；`gh release list -R bnb-chain/bsc` 最新仍是 v1.8.0-alpha（2026-08-13），早于合并日期；BNB Chain Jenner 公告页（2026-09-20，2026-10-11 复查未变）：“Testnet: Late October 2026 … Mainnet: Late November 2026 … release … has not been published yet” [13][24]。
- 合并时间：bnb-chain/bsc PR #3793 merged 2026-09-11T05:57:02Z；bnb-chain/reth-bsc PR #497 merged 2026-09-23T03:04:09Z（`gh pr view`，2026-10-09 已核实）[14]。

**与 Tempo 的方向对比**（细节见对比表）：Tempo 是 `Σ非支付 ≤ 30M`，给非支付封顶，支付占绝大部分空间；BSC 是 `N ≤ G − Q` 且 `N + P ≤ G`，给支付保底，普通交易占绝大部分空间。两者在数学上是同一种形状（两条线性约束），都不改排序、都不改费用。差别在于：Tempo 的参数写在 header 里，由 hardfork 固定；BSC 不改 header，参数由治理设定。Tempo 分类不读状态；BSC 分类要读父状态和实时状态。

**不确定之处**
- BEP-703 例子中“BSC mainnet 当前 gas limit 55M”的说法我没有独立核实。
- BSC 侧细节（BidBlock 路径、fast-node 跳过检查等）沿用了 2026-10-09 已核实的原始出处，本轮只复查了上面列出的行号。

---

## L-Q3 两种 lane 设计给 Mantle 的教训

**答案**：(a) 两者都只做**容量隔离**，没有独立 base fee。Tempo 的 base fee 按全块 gas 调整，规范明确说支付流量同样会推高 base fee；BSC 的 base fee 为 0，支付和普通交易在同一个小费市场里竞价。所以“meme 拥堵时支付变贵”这个问题，两者都没有解决。(b) 预留空间闲置时，BSC 选择“不归还”，用浪费换来可信度；Tempo 的设计是给非支付封顶，非支付流量少时空间就闲着。(c) 分类必须在执行前就能算出来：Tempo 只看 payload，前提是目标是协议预编译；BSC 读父状态里的名单，再读实时状态的 code。(d) 伪装成支付的攻击面集中在辅助载荷（access list、7702 授权）、同块先部署代码 / 先做授权再转账、多调用 / AA 包装、名单代币的任意函数这几处。两边各自做了封堵，但思路不同。

**依据**
- (a) TIP-1067 Assumptions（“heavy payment-lane usage raises the base fee just as general usage does”）[4]；BEP-703 §3.3 “No new … fee rule”、§6 “Reserved gas is not free gas” [11]。
- (b) BEP-703 §4 [11]；TIP-1010 “Shared capacity model: The payment lane is non-dedicated … General transactions are capped at `general_gas_limit` (30M)” [3]。
- (c) 规范 “based solely on their transaction data” [1]；TIP-20 前缀即预编译 [5]；BEP-703 §3.2 “Nothing is executed to decide this: the class follows from static transaction fields plus at most two state lookups” [11]。
- (d) Tempo：TIP-1045 “These auxiliary-payload restrictions prevent transactions from consuming payment-lane capacity with non-payment metadata”，access list 一律算 general [2]。BSC：§4 “The code test reads the live state”，目的是防止“同块先部署代码 / 先做 7702 授权，再往这个地址转账”；0x04 类型一律算 general [11]。BSC 按地址登记名单，“whatever function is called”（§3.2 表格），所以名单代币的 `approve` 等函数也会进入 lane [11]。Tempo 要求**每个** call 都命中白名单（`envelope.rs:296-299`）；BSC 只看顶层 `to`（`classify.go:39-50`），经 Router / AA 钱包发起的支付因此不会进入 lane [5][12]。

**不确定之处**
- 两条 lane 是否真的改善了支付在拥堵时的延迟，我没有找到实测数据：Tempo 没有公开的拥堵事件分析，BSC 还没激活。

---

## L-Q4 ACE 文章（Bahrani & Neuder，2026-01-29）

**答案**：文章把 ACE 定义为“应用对与它交互的**一批**交易施加排序规则”，用 cancel prioritization（同一批内撤单先于吃单）作为统一的例子，比较了四种现有设计：app-chain（Hyperliquid）、链上批处理（AMQ）、链下批处理（Angstrom）、PEPC。然后提出在共识中强制执行应用指定的排序（合约声明 `order = [Cancel, Take]`，违反即区块无效），并用例子说明两个代价：**建块复杂度上升**（REMOVE/SWAP 奇偶例子：6 种排列里只有 2 种合法）和**组合性下降**（两个 DEX 循环依赖、Oracle/DEX 循环依赖，这些交易无法放进同一个块）。缓解办法是**显式信号**（类似 BAL，交易预先声明会调用哪些函数）。文章还断言验块复杂度远低于建块复杂度。

**依据（原文要点，[15] post 1）**
- 定义：“Application-controlled execution enforces ordering rules on batches of transactions interacting with them.”；“Cancel prioritization enforces that within each batch, cancel orders precede take orders.”；先只考虑 “one batch per block”。
- §2.1 App-chains（Hyperliquid）。优点：细粒度控制（同节还提到 Injective 的频繁批量拍卖、dYdX 用 vote extensions 限制 proposer 排除交易，“a very similar design to FOCIL”）。缺点：**censorship resistance**（原话见 L-Q6）；“Bridging-only settlement”，即与其他链之间没有原子结算。
- §2.2 AMQ（链上批处理）。机制：块 N 只入队，块 N+1 由一笔 execute 交易按应用规则执行。优点：“No change to consensus”。缺点：至少一个 slot 的延迟；“Next-block settlement”，同块原子性没了（例如无法在同一块内偿还闪电贷）；审查问题。文中给的缓解办法都要改共识：“scheduled transactions”（块末执行），或允许合约感知自己在块中的位置。
- §2.3 链下批处理（Angstrom）。优点：不改共识；它有自己的共识，因此可以自带抗审查（白皮书附录 B.3）。缺点：额外的 liveness 风险（可以无许可地撤出流动性，但应用会停摆）；“After-bundle settlement”，即 bundle 上链后，同一块中排在后面的交易可以使用结果。Note #2：可以把 Angstrom 共识换成 TEE 签名的 bundle（如 BuilderNet），信任假设随之改变。
- §2.4 PEPC。优点：没有额外信任假设；“Native settlement”，原子性完整保留。缺点：**cold-start**，因为参与是自愿的，“If only 1/10 Ethereum validators … committed … the application would only be updated on average once every 10 blocks”；而且要改共识。
- §3 共识强制的应用排序：语法设想
  ```
  DEX contract
  func Take;
  func Cancel;
  order = [Cancel, Take]
  ```
  “within any block, the transactions that call either function on the DEX contract would need to respect the ordering in order for the block to be valid.” 图例：DEX（Cancel 先于 Take）和 Oracle（Update 先于 Read），4 笔交易；最终区块 [TX2, TX1, TX3]，对应的函数调用顺序是 [DEX::Cancel, DEX::Take, Oracle::Update, DEX::Take]；TX3 和 TX4 互斥。作者认为这相当于“强制参与的 PEPC”：原生结算、与 L1 相同的安全保证，并且解决了 cold-start。
- §3.1 建块复杂度：当前约 8% 的以太坊区块由 proposer 本地构建（mevboost.pics）；按优先费贪心打包“at least 1/2 optimal”（原话见 L-Q6）。REMOVE/SWAP 奇偶例子：TX1、TX2 在价格奇数时执行 REMOVE（奇偶不变），偶数时执行 SWAP（翻转）；TX3 在奇数时执行 SWAP（不变），偶数时执行 REMOVE（翻转）。初始为偶数时，3!=6 种排列中只有以 TX3 开头的 [3,1,2]、[3,2,1] 合法；初始为奇数时，只有 [1,2,3]、[2,1,3] 合法。也就是说，交易调用哪个函数取决于运行时状态，builder 只能靠试排列来找合法顺序。
- §3.2 组合性：两个 DEX，TX1 = REMOVE(A)+SWAP(B)，TX2 = REMOVE(B)+SWAP(A)，**任何顺序**都会违反其中一个 DEX 的规则，两笔交易不能同块；拆开执行就失去原子性。Oracle（UPDATE 先于 READ）+ DEX（REMOVE 先于 SWAP）：TX1 = UPDATE+SWAP，TX2 = READ+REMOVE，同样不能同块。三笔交易的例子（TX1 READ+SWAP、TX2 READ+REMOVE、TX3 UPDATE+REMOVE）只有 [TX3, TX2, TX1] 合法。作者指出这个例子“easier … because the ordering of the functions can be checked before running the transactions”。
- §3.3 缓解：建块复杂度上升“can be centralizing”，本地 builder 难以逼近最优；钱包和前端需要调整费用逻辑。交易越简单越容易被静态分析，复杂交易则可能被 builder 排除，这是“expressivity 与 expected time-to-inclusion”之间的权衡；不碰 ACE 合约的交易也会受影响，因为它们共享区块空间。
- 显式信号：“adding metadata for transactions to eagerly attest to the functions they will call … akin to Block-Access Lists”；调用了未声明的函数，交易就 revert，但仍要付 gas；难点是路由类交易无法事先知道会调用哪些函数。
- 验块 vs 建块：“the block building complexity far exceeds the block validation complexity in ACE … any violation … can immediately cause the state-transition function to return invalid, without increasing the block verification complexity meaningfully.”
- 结论提出两个问题：Feasibility（通用链能强制执行哪些限制而不让复杂度爆炸）和 Desirability（哪些限制对用户福利有益）。
- 第 3 楼 [15] post 3 是**作者 mikeneuder 本人**的回复（回答 jewei1997 关于 Solana 的提问），不是第三方。他承认 AMQ 的“next-slot composability is a pretty big limitation”，并**转引**第三方文章 “Solana’s Proprietary AMM Revolution” 的说法：“Lightweight oracle updates with minimal CU requirements need only small tips to secure top positions in the Jito auction queue … a cost-effective form of ‘cancel priority’”。这是一种经济上的近似，不是结构性规则（inferred）。

**不确定之处**
- 文中的图是图片，TX4 的具体内容无法从 JSON 文本中提取。
- 文章自己说明“we aren’t being formal about many of the above claims”，没有给出复杂度的形式化界。

---

## L-Q5 PEPC、EVM Native Sequencing Rules、FOCIL

**答案**：PEPC（Barnabé Monnot，2022-10-08）是**研究提案**：让 proposer 用 EVM 代码表达自己的承诺，attester 执行这段代码检查承诺是否兑现，承诺不满足即区块无效（“pessimistic block validity”），将来可以用 SNARK 证明替代。它没有 EIP，也没有实现。EVM Native Sequencing Rules（Lilyjjo / Astria，2024-05-22）也是**草图式提案**，内容是：新增 bundle 交易类型（由一个 EOA “bundler” 签名，内含有序交易列表），新增一种交易类型用来指定哪个 bundler 可以打包它，新增全局变量 `bundle.signer` / `bundle.number` / `bundle.tx_number`。FOCIL（EIP-7805，Draft）是对照：它只约束 proposer **不能排除**某些交易（16 人委员会的 inclusion list，交易可放在块内任意位置，块满时可以不包含），不规定排序。

**依据**
- PEPC [16]：“we allow proposers to submit commitments expressed as EVM execution in their block. Attesters can then simply check validity of the block they receive with respect to the commitments that were made.”；也讨论了 optimistic 变体（违约时 slash attester）和 gas 计量问题；“A SNARK-based scheme would be much nicer”。ACE 文 §2.4 对 PEPC 的评价（cold-start、需要改共识）见 L-Q4 [15]。
- EVM Native Sequencing Rules [17]：“A new ‘bundle’ transaction type … signed by an EOA … contain a payload of ordered transactions … does not trigger on-chain execution”；“A bundler can only have a single bundle transaction included in a block”；“if a transaction specifies a bundler, the transaction can only be included in a block if it is in a bundle”；bundle 内的交易“do not have any non-revert guarantees”；全局变量 `bundle.signer`（不在 bundle 中时为零地址）、`bundle.number`、`bundle.tx_number`；示例应用是 AMM 首笔 swap 拍卖（基于 SUAVE 的 PoC）。作者也提到可以用 `tx.number` 让 builder 出售“第一笔”的位置。
- FOCIL [18]：`status: Draft`；“Anywhere-in-block: FOCIL is unopinionated about the placement of transactions from ILs”；“Conditional inclusion … accepting blocks that may lack some transactions from ILs if they cannot append … or if they are full”；`IL_COMMITTEE_SIZE = 16`、`MAX_BYTES_PER_INCLUSION_LIST = 8 KiB`。

**不确定之处**
- FOCIL 是否已被列入某次以太坊升级（如 Hegota），EIP 文件中没有体现，我没有查 ACD 记录。

---

## L-Q6 边界问题：一手论据

1. **排序正确 ≠ 不审查**。ACE §2.1：“The proposer can always execute the take and not the cancel by simply excluding the cancel from their block altogether. While this forgoes transaction fee revenue from the cancel, it may be rational if market maker 1 is willing to bribe the proposer to do so.” §2.2 转引 AMQ 作者：“AMQs can still be bypassed by a validator within protocol-enforced tick boundaries through censorship and delay.” [15]。BEP-703 也只保证“as a class”有 gas，不保证任何单笔交易被纳入 [11]。抗审查需要另外的机制，比如 FOCIL 式 inclusion list [18]，或 Mantle fair sequencing 提出的“回执 + 批次号承诺 + 可罚没”[21]。
2. **容量隔离 ≠ 费用隔离**。TIP-1067 原话见 L-Q3 [4]；BEP-703 “No new … fee rule”、“pays full fees throughout” [11]。两个现成的 lane 都没有独立 base fee（observed）。
3. **应用规则冲突时无解**。ACE §3.2 的两个 DEX 例子：两笔交易“cannot be included together as either of them preceding the other violates one of the two ordering rules”；拆开则“the atomicity of their actions is no longer preserved” [15]。只要每个应用规则都是“本合约函数 X 先于 Y”的偏序，而一笔交易同时触及两个合约，就可能形成有向环，这时不存在任何合法顺序。可选的出路只有三种：拒绝其中一笔、拆开交易、或者推迟到下一批（inferred）。
4. **建块复杂度与本地 builder**。ACE §3.1 原话：“The local builder can continue adding transactions with the highest tip until the block is full, and be assured that the resulting block is valid and its tip revenue is at least 1/2 optimal.” 引入应用排序规则后，“even finding a single valid block … could become complex”；§3.3：“It can be centralizing” [15]。补充一点（speculative，没有查形式化来源）：教科书上 0/1 背包的 1/2 近似要求“取贪心结果和单个最大物品中较大者”；纯按单位价值贪心在最坏情况下没有常数界。原文的 1/2 说法隐含了“单笔交易 gas 远小于区块”这一前提，EIP-7825 的单笔 gas 上限让这个前提大体成立。
5. **nonce 与 FCFS 的冲突，以及 2D nonce 缓解**。ERC-4337 “Semi-abstracted Nonce Support”：“requiring a single sequential `nonce` value is limiting … we implement a nonce mechanism that uses a single `uint256` nonce value … but treats it as two values: 192-bit ‘key’ 64-bit ‘sequence’”；“A new `key` can be introduced with an arbitrary value at any point, with its `sequence` starting at `0`”；接口 `getNonce(address sender, uint192 key)` [19]。Tempo 已经把 2D nonce 做进原生交易类型：`nonce_key`（“Key 0 is the protocol nonce, keys 1-N are user nonces for parallelization”，`tempo/crates/primitives/src/transaction/tempo_transaction.rs:204-206`），文档说可以用来提交“independent transactions without waiting for a single sequential nonce stream”[10]。冲突本身的推理（inferred）：同一发送方的单一 nonce 流要求严格递增，前面卡住的交易会阻塞后面的支付；FCFS 只能定义为“当前可执行交易的队头之间”先到先服务。
6. （补充）**AA 批处理下 `tx.gasprice` 失真**：ERC-4337 原文**没有**讨论 `tx.gasprice`（grep 0 命中）[19]。这一条是从 EVM 语义推出来的：GASPRICE 只反映外层 bundler 交易的价格（inferred）。

---

## L-Q7 Mantle 2024 “Fair Sequencing”

**答案**：这是 2024-02-22 由 Mantle Research Team（Franck Cassez、Aodhgan Gleeson、Andreas Penzkofer）发布的**研究提案**。架构分三个角色：mempool manager 按到达顺序（FCFS）把交易分进批次，并给用户发带批次号的回执（质押，可罚没）；sequencer 向 VRF 预言机请求一个随机置换，把置换和证明都发布到 DA；executor 按置换后的顺序执行，执行结果与已发布的哈希不一致就会被罚没。目标是抗审查 + 抗 MEV。没有证据表明它已上线：Mantle 执行客户端的出块路径仍然是“preconf 交易 FIFO → 本地优先账户 → 其余按价格 + nonce”。2026-10-11 原 URL 已 307 重定向到首页，内容只能从 Wayback 2026-03-17 快照读到。

**依据**
- 博客正文（Wayback 20260317033821 快照）：“fair sequencing is a specification: provide censorship resistance and protect users from MEV attacks”；“leverages Verifiable Random Functions (VRFs)”；“users receive receipts indicating the batch number”；“Any discrepancy in execution can lead to slashing of the executor”；“Adding a probabilistic dimension to a FCFS policy reduces these incentives”（指延迟竞赛）[20]。
- 详细版 HackMD [21]：“the user is notified with a receipt that contains the batch number k … this schedules the transaction in a batch using a first-come-first-served policy”；“if a user sees batch number k+1 and their transactions have not been included before, they can trigger a dispute … the mempool manager may be slashed”；随机置换“eliminates MEV attacks”（作者的强断言）。
- 实现现状：`mantlenetworkio/op-geth/miner/worker.go:764-779@e33cd26` 先用 `commitFIFOTransactions` 提交 preconf 交易，`:810-825` 再用 `newTransactionsByPriceAndNonce` 提交其余交易；`rg -i "vrf|fair.?sequenc"` 在 op-geth 和 mantle-v2（sparse checkout）中没有命中相关代码 [22]。preconf 的判定是节点配置的 from/to 白名单：`preconf/tx_pool_config.go:29-66`，`AllPreconfs` / `FromPreconfs` / `ToPreconfs` [22]。
- `curl -sIL https://www.mantle.xyz/blog/research/fair-sequencing` → `HTTP/2 307 location: /`（2026-10-11）；CDX 显示有 2025-01-22、2025-07-14、2026-03-17 三个快照。

**不确定之处**
- “未上线”是从“当前代码里没有对应实现、公开渠道没有上线公告”推出来的（inferred）。mantle-v2 是 sparse checkout，没覆盖全部目录。
- “随机置换消除 MEV”是作者的断言。随机顺序下仍然可以靠多发交易提高抢到靠前位置的概率（speculative，HackMD 没讨论 spam 抽签问题）。

---

## 对比表素材

| 实现 | 控制范围 | 强制力来源 | 组合性代价 | 违规后果 | 状态 |
|---|---|---|---|---|---|
| Tempo Payment Lane | 全区块：给非支付 gas 封顶（30M / 500M） | 链共识（header 字段 + 执行时校验） | 无（同块任意交错） | 区块无效（T4 起超出即无效） | 主网（T1 2026-02-12；TIP-1045 分类 T5 2026-06-09） |
| BSC Payment Lane（BEP-703） | 全区块：给支付保底（默认 5%） | 链共识（不等式 + 父状态治理参数） | 无 | 区块无效；BidBlock 路径撤销 builder | 已合并未激活（Jenner：测试网 10 月下旬 / 主网 11 月下旬计划） |
| Hyperliquid（app-chain） | 整条链的订单操作 | 链共识 | 只能经桥（bridging-only） | 区块无效 | 主网（ACE 文引用） |
| AMQ（链上批处理） | 单个应用的队列 | 合约 + 底层链时间戳 | 下一块结算 | 合约层面无法绕过；但可被审查或延迟 | 提案 / 设计（ACE 文） |
| Angstrom（链下批处理） | 单个应用的批次 | 外部共识网络 + hook 锁 | 批次后同块可用 | 未授权的批次无法执行 | 主网（其他路核实） |
| PEPC | proposer 自愿承诺的任意内容 | 链共识（承诺写进有效性条件） | 原生同块 | 区块无效 | 研究提案（2022），无 EIP |
| ACE §3 共识强制函数排序 | 每个合约声明的函数顺序 | 链共识（STF） | 同块，但规则冲突的交易互斥 | 区块无效 | 研究设想（2026-01） |
| EVM Native Sequencing Rules | 指定 bundler 的交易集合 | 链共识（新交易类型 + 全局变量） | 同块；bundle 内交易可单独 revert | 违规 bundle / 交易不能上链 | 草图提案（2024-05） |
| FOCIL（对照） | 只管“不能排除”，不管顺序 | 分叉选择（委员会 IL） | 无 | 不满足 IL 的块不被 attest | EIP Draft |
| Mantle Fair Sequencing | rollup 全部交易 | 质押 + 罚没 + DA 上的证明 | 无（全局随机置换） | 罚没 | 研究（2024-02），未见实现 |
| Mantle op-geth preconf FIFO | 配置中 from/to 白名单内的交易 | sequencer 本地策略 | 无 | 无协议后果（只影响声誉） | 代码中存在（细节由其他路核实） |

lane 对比（给报告用）：

| 维度 | Tempo | BSC |
|---|---|---|
| 方向 | 给非支付封顶 | 给支付保底 |
| 约束 | `Σ非支付 ≤ general_gas_limit`（30M），且总量 ≤ gas_limit | `N + max(P,Q) ≤ G` |
| 参数来源 | header 字段，按 hardfork 固定 | 父状态中 0x2007 合约的治理 ratio |
| 分类 | 只看 payload；T5 起按 target+selector+ABI 白名单，禁止 access list / 授权 | 治理名单（任意函数）或 value>0 且接收方无代码；读父状态 + 实时状态 |
| 多调用 / AA | 每个 call 都必须命中白名单 | 只看顶层 `to` |
| 排序 | 规范不要求；默认池按 tip 排 | 不新增排序规则 |
| 费用 | 统一 base fee（T7 起动态，输入为全块 gas） | 统一费用规则（base fee 0，小费竞价） |
| 闲置 | 非支付流量少时空间闲着；支付不受影响 | 预留闲置也不归还 |

---

## 代码片段

**S1 Tempo TIP-1045 分类**：`tempo/crates/primitives/src/transaction/envelope.rs:280-301` 和 `:574-587@87bd32a63d`。说明分类完全是 payload 级的，并且辅助载荷要为空。
```rust
pub fn is_payment_v2(&self) -> bool {
    match self {
        Self::Legacy(tx) => is_tip1045_call(tx.tx().to.to(), &tx.tx().input),
        Self::Eip1559(tx) => {
            let tx = tx.tx();
            tx.access_list.is_empty() && is_tip1045_call(tx.to.to(), &tx.input)
        }
        Self::Eip7702(tx) => { let tx = tx.tx();
            tx.access_list.is_empty() && tx.authorization_list.is_empty()
                && is_tip1045_call(Some(&tx.to), &tx.input) }
        Self::AA(tx) => { let tx = tx.tx();
            !tx.calls.is_empty() && tx.access_list.is_empty()
                && tx.tempo_authorization_list.is_empty()
                && tx.key_authorization.as_ref()
                    .is_none_or(|auth| auth.length() <= KEY_AUTHORIZATION_MAX_RLP_LEN)
                && tx.calls.iter().all(|call| is_tip1045_call(call.to.to(), &call.input)) }
        // (Eip2930 分支同 Eip1559，此处省略)
    }
}
fn is_tip1045_call(to: Option<&Address>, input: &[u8]) -> bool {
    match to {
        Some(to) if to.is_tip20() => ITIP20::ITIP20Calls::is_payment(input),
        Some(to) if *to == TIP20_CHANNEL_RESERVE_ADDRESS => /* selector + 签名字节校验 */,
        _ => false,
    }
}
```

**S2 Tempo 验块时的非支付预算**：`tempo/crates/evm/src/block.rs:469-477`、`:624-628`、`:648-652@87bd32a63d`。说明预算从 header 的 `general_gas_limit` 开始扣，T4 起超出即区块无效。
```rust
BlockSection::StartOfBlock | BlockSection::NonShared => {
    if gas_used > self.non_shared_gas_left
        || (!self.is_payment(tx) && gas_used > self.non_payment_gas_left)
    {
        Ok(BlockSection::GasIncentive)   // 历史块可溢出到 incentive 段
    } else { Ok(BlockSection::NonShared) }
}
// commit:
BlockSection::NonShared => {
    self.non_shared_gas_left -= block_gas_used;
    if !is_payment { self.non_payment_gas_left -= block_gas_used; }
}
// finish:
if self.evm().cfg.spec.is_t4() && self.incentive_gas_used > 0 {
    return Err(BlockValidationError::msg("incentive gas limit exceeded").into());
}
```

**S3 Tempo 构建器跳过超额的非支付交易**：`tempo/crates/payload/builder/src/lib.rs:571-588@87bd32a63d`；交易池排序 `crates/transaction-pool/src/ordering.rs:17-26`（按 effective tip）。说明 lane 只决定“能不能进”，进入后的顺序仍按 tip。
```rust
let is_payment = if hardfork.is_t5() {
    tx.transaction.is_payment()
} else {
    tx.transaction.inner().is_payment_v1()
};
if !is_payment && non_payment_gas_used + max_regular_gas_used > general_gas_limit {
    best_txs.mark_invalid(&pool_tx, InvalidPoolTransactionError::Other(Box::new(
        TempoPoolTransactionError::ExceedsNonPaymentLimit)));
    continue;
}
```

**S4 BSC 分类**：`bsc/core/paymentlane/classify.go:35-58@8cc60b246c`。说明名单命中即判为 payment，并且只看顶层 `to`。（全文见 S1 原出处；建议报告与 S1 并排放。）
```go
func (c *Classifier) Classify(tx *types.Transaction) LaneType {
	if c.isSystemTx(tx) { return GeneralLane }
	to := tx.To()
	if to == nil { return GeneralLane }
	switch tx.Type() {
	case types.LegacyTxType, types.AccessListTxType, types.DynamicFeeTxType:
	default:
		return GeneralLane
	}
	if _, ok := c.listed[*to]; ok { return PaymentLane }   // 父状态名单
	if tx.Value().Sign() == 0 { return GeneralLane }
	if hasCode(c.code.GetCodeHash(*to)) { return GeneralLane } // 实时状态
	return PaymentLane
}
```

**S5 BSC 不等式与准入**：`bsc/core/paymentlane/paymentlane.go:73-81`、`budget.go:12-21@8cc60b246c`。说明“保底”就是普通交易可用 gas 要减去闲置预留。
```go
func CheckInequality(gasLimit, gasUsed, paymentGasUsed, paymentLaneQuota uint64) error {
	sum, carry := bits.Add64(gasUsed, satSub(paymentLaneQuota, paymentGasUsed), 0)
	if carry != 0 || sum > gasLimit { return fmt.Errorf("%w: ...", ErrViolated) }
	return nil
}
func (b Budget) MaxAvailableGas(shared uint64, laneType LaneType) uint64 {
	if laneType == PaymentLane { return shared }
	return satSub(shared, b.IdleLane())
}
```

**S6 ACE 排序声明（文章伪代码）**：[15] §3。说明合约级的函数顺序声明。
```
DEX contract
func Take;
func Cancel;
order = [Cancel, Take]   // 块内所有调用 Cancel 的交易必须先于调用 Take 的交易，否则区块无效
```

**S7 ERC-4337 keyed nonce**：[19] §Semi-abstracted Nonce Support。
```solidity
// nonce = key(192 bit) || sequence(64 bit)；每个 key 独立递增
function getNonce(address sender, uint192 key) external view returns (uint256 nonce);
```

**S8 Mantle op-geth：preconf 交易 FIFO 优先**：`mantlenetworkio/op-geth/miner/worker.go:764-779@e33cd26`。说明 Mantle 现有出块路径已经有“一个按 FIFO 的类别排在按价格排序的交易之前”，但这是 sequencer 本地策略，类别由节点配置的 from/to 白名单决定（`preconf/tx_pool_config.go:44-66`）。
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
```

---

## 图的素材

**G1 Tempo payment lane 一笔交易的流程**
- 参与者：用户 / 钱包、Tempo 交易池、proposer 的 payload builder、其他验证者。
- 步骤：① 用户提交 TIP-20 `transfer`（或 AA 多 call）→ ② 入池时计算 `is_payment_v2`（不读状态）→ ③ builder 按 effective tip 取交易；非支付交易如果会让 `Σ非支付 > 30M` 就跳过；支付交易只受总 gas_limit 约束 → ④ header 写入 `general_gas_limit = 30M` → ⑤ 验证者校验 header 值等于 chainspec 的值，执行时逐笔分类并扣减非支付预算 → ⑥ 分支：超出预算（T4+）→ 区块无效；未超出 → 有效。
- 标注：不规定顺序；base fee 是全块统一的。

**G2 BSC payment lane 一笔交易的流程**
- 步骤：① 区块开始时读父状态：ratio 和名单（0x2007 getter）→ quota = ratio × GasLimit / 10000 → ② 逐笔分类：系统交易 / 合约创建 / 其他类型 → 普通；名单命中 → 支付；value>0 且实时状态下无代码 → 支付；否则普通 → ③ 准入：普通交易声明的 gas ≤ 剩余 gas − 闲置预留 → ④ 封块前 Verify → ⑤ 验块：重新分类并检查 `N + max(P,Q) ≤ G` → 违规即区块无效（BidBlock 路径还会撤销 builder）。

**G3 两种方向对比（条形图）**
- Tempo（500M）：[非支付 ≤30M | 支付可用 ≥470M（T4 后）]
- BSC（以 55M 为例）：[普通 ≤52.25M | 支付保底 2.75M（闲置也不归还）]，支付超出保底的部分与普通交易在共享空间里竞争。

**G4 ACE 四种设计 × 强制层**（横轴是强制力来源，纵轴是结算时点）
- app-chain（链共识，只能经桥）；AMQ（合约 + 底层链，下一块）；Angstrom（外部共识 / TEE，批次后同块）；PEPC（链共识 + 自愿参与，原生同块）；§3 强制版本（链共识 + 强制参与，原生同块，但有建块复杂度和规则冲突）。

**G5 ACE 规则冲突**
- 两个 DEX 的环：节点 TX1 = {REMOVE(A), SWAP(B)}，TX2 = {REMOVE(B), SWAP(A)}。A 的规则要求 TX1 → TX2，B 的规则要求 TX2 → TX1，形成环，两笔交易不能同块。
- Oracle/DEX 的环：TX1 = {UPDATE, SWAP}，TX2 = {READ, REMOVE}。Oracle 要求 TX1 → TX2，DEX 要求 TX2 → TX1，同样成环。
- 三笔交易的表：只有 [TX3, TX2, TX1] 合法。
- 奇偶表：初始为偶数时只有 [3,1,2]、[3,2,1] 合法；初始为奇数时只有 [1,2,3]、[2,1,3] 合法。用来说明“交易调用哪个函数取决于运行时状态”。
- 旁注：验块只需一次线性执行（遇到违规立即判无效）；建块则要搜索排列。

**G6 Mantle Fair Sequencing（2024 提案）**：用户 → mempool manager（FCFS 分批，发回执，批次 Merkle 根发布到 DA）→ sequencer（向 VRF 请求置换 σ 和证明 β，发布到 DA）→ executor（执行 b′ = σ(b)，区块哈希与 #b′ 不一致就罚没）。

---

## 对 Mantle 的启示（均为推论 / 设计建议）

1. **支付分类不能照搬 Tempo 的地址前缀。** Tempo 之所以能只看 payload 分类，是因为 TIP-20 地址前缀对应的是协议预编译，语义固定 [5]。Mantle 上的稳定币是普通（多为可升级）合约。可以采用折中：父状态里维护治理名单（BSC 做法），再叠加 TIP-1045 式的 selector + 精确 ABI 长度白名单，并要求 access list、7702 授权为空。这样既避免 BSC“名单代币的任意函数都算支付”，也避免 Tempo 依赖预编译。名单是否还要锁定实现合约的 codehash（防止代理合约升级后语义改变），需要评估（speculative）。
2. **先做容量隔离，费用隔离单独立项。** 两条现成的 lane 都没有独立 base fee。Mantle（OP Stack EIP-1559，base fee 按全块 gas 调整）如果只加 lane，meme 拥堵时支付仍会变贵。可选方向：sponsor / paymaster 预算、按类别分别计 base fee。后者在本路查到的实现中没有先例（inferred）。
3. **闲置预留是否归还，取决于强制在哪一层。** BSC 不归还，是为了让“排除支付”在共识层有成本 [11]。如果 Mantle 第一阶段只在 sequencer 策略层实现（单一 sequencer，没有其他验证者检查 lane 规则），那么闲置归还与否只影响吞吐，不影响可信度；可信度要靠公开指标和回执。真要写进协议，就得让 derivation / fault proof 能检查这条规则，成本很高（inferred）。
4. **两条 lane 都没给 FCFS。** Tempo 默认按 tip 排 [8]，BSC 不新增排序规则 [11]。“payment 需要 FCFS”需要另外一层排序策略来实现。Mantle op-geth 已经有“preconf 交易 FIFO 优先于按价格排序的交易”的路径，类别由节点配置的 from/to 白名单决定 [22]。这可以作为支付 FCFS 的现成插入点，但它只是 sequencer 本地策略，没有协议后果（inferred；具体行为请以 Mantle 路的核实为准）。
5. **FCFS 要配合 2D nonce。** 建议把 FCFS 定义为“当前可执行的交易队头之间先到先服务”。为支付提供独立的 nonce key（ERC-4337 keyed nonce 或 Tempo 式原生 `nonce_key`），避免同一账户其他业务的交易卡住支付 [10][19]。
6. **ACE 规则必须有冲突处理策略。** 如果 Mantle 让应用声明顺序规则，就必须事先规定发生循环依赖时怎么办：拒绝其中一笔、推迟到下一批、或者只允许“规则兼容”的组合 [15]。单一 sequencer 对“本地 builder 的 1/2 近似”这个顾虑不敏感，因为它本来就是专业构建者。但每块的搜索时间（尤其是 Flashblocks 的短间隔）会受影响；可以用显式信号（交易声明会调用的函数）把搜索换成静态检查 [15]。
7. **规则验证可以便宜，审查必须单独处理。** ACE 文说明验块复杂度低 [15]，所以“事后检查 sequencer 是否遵守 phase-first / lane 规则”是可行的。但排除交易无法从区块本身看出来，需要回执 + 截止时间 + 可追责机制。Mantle 2024 fair sequencing 提案里的“带批次号的回执 + 争议 + 罚没”可以直接借用到 payment lane 的纳入承诺上，不一定要连同 VRF 随机置换一起用 [20][21]。
8. **分阶段上线有先例。** Tempo 的 v2 分类先在交易池里用来防 DoS，T5 才写进共识 [5]；BSC 的 lane 先合并、后排期激活 [13]。Mantle 可以先做 sequencer 策略和影子统计，再决定要不要写进协议。

---

## 外部调研的修正

1. **“Tempo：规范本身不要求支付交易 FCFS”——正确，已补一手证据。** 规范 §2 原文 [1]；实现层面，默认交易池按 effective tip 排序（`ordering.rs:6-27`）[8]。外部调研没有指出这一点，导致“Tempo 是 FCFS 支付通道”的误读没有被排除。
2. **“T5 的 TIP-1045 ……白名单”——正确，补充状态和细节。** TIP-1045 文件状态为 Mainnet；T5 主网时间 2026-06-09（presto.json）[2][9]。白名单还包括 TIP20ChannelReserve 的 6 个函数；含动态参数的 calldata ≤ 2048 字节；`key_authorization` ≤ 1024 字节（外部调研只笼统说“限制辅助载荷”）。
3. **“4.3 容量隔离不自动带来价格隔离”——正确，但外部调研没有给一手出处。** 一手出处：TIP-1067 明确说支付 lane 的用量会同样推高 base fee [4]；BEP-703 不新增费用规则，预留的 gas 照付全价 [11]。
4. **“PEPC 等协议级承诺方向……[引用 ACE 文]”——引用不准。** PEPC 的出处是 Barnabé Monnot 2022-10-08 的 ethresear.ch 帖子 [16]；它是研究提案，没有 EIP，也没有实现。ACE 文只是把它当作第四种设计来评价（cold-start 问题）[15]。
5. **“该回复提到 Prop AMM 通过低 CU oracle 更新……”——需要更正出处性质。** 第 3 楼是 ACE 作者 mikeneuder 本人的回复，“Jito auction queue / cost-effective cancel priority”一句是他**转引**第三方文章 “Solana’s Proprietary AMM Revolution” 的原话，不是 ACE 作者的独立结论 [15]。
6. **“多个 UserOperation 进入同一外层交易时 `tx.gasprice` 不是每个用户独立的出价 [引用 ERC-4337]”——结论合理，但引用不成立。** ERC-4337 原文没有讨论 `tx.gasprice`（全文 grep 0 命中）[19]。这是从 EVM 语义推出的推论，应标为 inferred。
7. **“Mantle 2024 VRF 随机化排序研究”——基本正确，需要补充和更新。** (a) 原 URL 在 2026-10-11 已 307 重定向到首页，内容只能从 Wayback 快照读到 [20]；(b) 提案不只是随机排序，而是“FCFS 分批 + 回执 + VRF 批内置换 + executor 罚没”的三角色架构，作者还给了时间：2024-02-22 [20][21]；(c) 当前 Mantle op-geth 出块路径是 preconf FIFO + 按价格 + nonce 排序，没有 VRF 实现 [22]。
8. **“ERC-4337 keyed nonce”——正确。** 192 位 key + 64 位 sequence，接口是 `getNonce(address,uint192)` [19]。另外补充：Tempo 原生交易类型已经有 2D nonce（`nonce_key`）[10]，可以作为“协议原生 2D nonce”的先例，外部调研没有提到。
9. **外部调研 §4.1 的双市场循环示例——与 ACE §3.2 一致，正确** [15]。外部调研没有提到 ACE 的另外两个关键论点：验块复杂度远低于建块复杂度；显式函数级信号是一种缓解。报告需要补上。

---

## 来源

1. **PRIMARY** Tempo Docs，“Payment Lane Specification”，https://docs.tempo.xyz/protocol/blockspace/payment-lane-specification.md （访问 2026-10-11）。证明：第二道非支付 gas 约束、分类只看 payload、`general_gas_limit` 是 header 字段、规范不要求排序。
2. **PRIMARY** `tempo/tips/tip-1045.md@87bd32a63d`。证明：T5 分类规则、完整 selector 白名单、辅助载荷限制、status Mainnet。
3. **PRIMARY** `tempo/tips/tip-1010.md@87bd32a63d`。证明：主网初始参数 500M / 50M / 30M、“至少 420M 留给支付”、T1 base fee 固定。
4. **PRIMARY** `tempo/tips/tip-1067.md@87bd32a63d`。证明：T7 动态 base fee 以全块 gas（含支付 lane）为输入，即没有费用隔离；cap / floor / target 参数。
5. **PRIMARY** `tempo/crates/primitives/src/transaction/envelope.rs:245-301,568-587`、`crates/primitives/src/address.rs:50-51`、`crates/contracts/src/precompiles/tip20.rs:200-225@87bd32a63d`。证明：v1 / v2 分类实现，以及 TIP-20 前缀地址即预编译。
6. **PRIMARY** `tempo/crates/evm/src/block.rs:206,447-489,620-652,1843-1897@87bd32a63d`。证明：按 fork 选分类器、非支付预算的扣减、T4 起超出即无效、记账用 regular gas。
7. **PRIMARY** `tempo/crates/hardfork/src/lib.rs:277-296`、`constants.rs:30-77`、`crates/evm/src/consensus/mod.rs:82-106@87bd32a63d`。证明：30M 固定值、shared 规则、header 校验、base fee 常量。
8. **PRIMARY** `tempo/crates/payload/builder/src/lib.rs:571-588`、`crates/transaction-pool/src/ordering.rs:6-27`、`crates/transaction-pool/src/transaction.rs:105@87bd32a63d`。证明：构建器跳过超额的非支付交易、交易池按 tip 排序。
9. **PRIMARY** `tempo/crates/chainspec/src/genesis/presto.json`、`crates/chainspec/src/spec.rs:125@87bd32a63d`。证明：主网（chainId 4217）T1 / T4 / T5 / T7 / T12 时间。
10. **PRIMARY** `tempo/crates/primitives/src/transaction/tempo_transaction.rs:204-206@87bd32a63d`；Tempo Docs “Transactions” https://docs.tempo.xyz/protocol/transactions.md （访问 2026-10-11）。证明：Tempo 原生 2D nonce。
11. **PRIMARY** `BEPs/BEPs/BEP-703.md@e9b2be3b00`（§1:38、§3.2:89-127、§3.3:136-152、§4:262-271、§6:279-287；Status: Draft）。证明：BSC lane 的规则、理由、不改排序 / 费用。
12. **PRIMARY** `bsc/core/paymentlane/{classify.go:35-63, paymentlane.go:1-7,73-81, budget.go:1-26}`、`bsc/core/payment_lane.go:52-53@8cc60b246c`。证明：分类、不等式、准入、父区块激活门槛。
13. **PRIMARY** `bsc/params/config.go:256,311,368@8cc60b246c`；`gh release list -R bnb-chain/bsc`（2026-10-11：最新 v1.8.0-alpha 2026-08-13）。证明：Jenner 未排期、未发版。
14. **PRIMARY** bnb-chain/bsc PR #3793（merged 2026-09-11T05:57:02Z）、bnb-chain/reth-bsc PR #497（merged 2026-09-23T03:04:09Z），`gh pr view`（2026-10-09 核实）。证明：两个客户端的合并时间。
15. **PRIMARY** Bahrani & Neuder，“Application-controlled execution: A case study on cancel prioritization”，https://ethresear.ch/t/23977 （JSON 版，post 1 2026-01-29、post 2、post 3 2026-02-02 by mikeneuder；访问 2026-10-11）。证明：ACE 定义、四种设计的优缺点、§3 语法、复杂度和组合性示例、显式信号、验块 / 建块不对称、审查原话、Prop AMM 转引。
16. **PRIMARY** Barnabé Monnot，“Unbundling PBS: Towards protocol-enforced proposer commitments (PEPC)”，https://ethresear.ch/t/13879 （2022-10-08；访问 2026-10-11）。证明：PEPC 机制（EVM 表达的承诺 + attester 检查 + pessimistic validity）、研究性质。
17. **PRIMARY** Lilyjjo，“EVM Native Sequencing Rules”，https://ethresear.ch/t/19606 （2024-05-22；访问 2026-10-11）。证明：bundle 交易类型、bundler 指定、`bundle.signer` / `bundle.number` / `bundle.tx_number`、提案性质。
18. **PRIMARY** EIP-7805 FOCIL，https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-7805.md （status Draft；访问 2026-10-11）。证明：committee IL、anywhere-in-block、conditional inclusion、不管排序。
19. **PRIMARY** ERC-4337，https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-4337.md §Semi-abstracted Nonce Support（访问 2026-10-11）。证明：192 位 key + 64 位 sequence 的 keyed nonce；原文没有讨论 tx.gasprice。
20. **PRIMARY**（官方博客，存档）Mantle，“Fair Sequencing”，2024-02-22，https://www.mantle.xyz/blog/research/fair-sequencing （2026-10-11 返回 307 → /；内容读自 http://web.archive.org/web/20260317033821/…）。证明：提案内容、作者、时间、研究性质。
21. **PRIMARY** Franck Cassez，“Fair Sequencer”，https://hackmd.io/@FranckC/S17_7RoO6 （访问 2026-10-11）。证明：回执 / 批次号、争议与罚没、VRF 置换的细节。
22. **PRIMARY** `mantlenetworkio/op-geth/miner/worker.go:729-828`、`preconf/tx_pool_config.go:29-66@e33cd26`。证明：Mantle 当前出块路径是 preconf FIFO → 优先账户 → 按价格 + nonce；没有 VRF 排序。
23. 外部调研（ChatGPT Deep Research），`research/ass-deep-dive.md`。二手线索；修正见上一节。
24. **PRIMARY** BNB Chain Docs，“Jenner Hardfork (BSC)”，https://docs.bnbchain.org/announce/jenner-bsc/ （页面日期 2026-09-20；访问 2026-10-11）。证明：Jenner 包含 BEP-703，测试网 10 月下旬 / 主网 11 月下旬计划，release 未发布。

---

## 开放问题

1. Tempo T7 动态 base fee 是否已在主网生效（TIP 状态写 Approved，chainspec 时间已过）？需要查链上 header 的 baseFeePerGas。
2. Tempo 主网当前的 block gas limit，以及 general_gas_limit 在 T1 之后有没有调整？30M 在 T12（2026-10-13）中是否变化？
3. 两条 lane 在真实拥堵中的效果：Tempo 有没有公开的支付纳入延迟数据？BSC 激活后 `paymentLaneIdle` / `generalLaneYielded` 指标如何？
4. 在 OP Stack 派生 / 故障证明里加入“类别 gas 不等式”这样的有效性规则，代价有多大（需要 Mantle 路结合 mantle-v2 derive 和 op-program 评估）？
5. 按类别分别计 base fee（真正的费用隔离），在 EVM 链上有没有已实现的先例？本路没有找到。
6. ACE 显式信号（函数级声明）与 EIP-7928 BAL 的关系：BAL 是区块级的事后访问记录，不是交易级的事前声明，二者能否复用？
7. Mantle op-geth 的 preconf FIFO 白名单在生产环境中配置了哪些地址？这一点交给 Mantle 路核实。

---

## 台账

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| L1 | Tempo payment lane 是对非支付交易的第二道共识 gas 约束，分类只看交易 payload、不读状态 | [1] Abstract | observed |
| L2 | Tempo 规范不要求任何特定排序，支付与非支付可以交错 | [1] §2 “Ordering of Transactions” | observed |
| L3 | Tempo 默认交易池按 effective coinbase tip 排序 | `tempo/crates/transaction-pool/src/ordering.rs:6-27@87bd32a63d` | observed |
| L4 | Tempo T5 前的分类（v1）只看调用目标是否带 TIP-20 前缀，AA 交易要求每个 call 都打到 TIP-20 | `tempo/crates/primitives/src/transaction/envelope.rs:255-263@87bd32a63d` | observed |
| L5 | T5 起（v2 / TIP-1045）每个 call 必须命中 target+selector+精确 ABI 长度白名单，access list 和 authorization list 必须为空，key_authorization ≤ 1024 字节 | `envelope.rs:280-301,574-587@87bd32a63d`；[2] Specification | observed |
| L6 | TIP-1045 白名单包括 TIP-20 的 9 个函数（含 approve、mint、burn）和 TIP20ChannelReserve 的 6 个函数；含动态参数的 calldata ≤ 2048 字节 | [2] “Payment Call Allow-List” | observed |
| L7 | TIP-20 前缀地址是协议预编译，这是“只看前缀即可分类”的前提 | `tempo/crates/primitives/src/address.rs:50-51@87bd32a63d` | observed |
| L8 | Tempo 主网（chainId 4217）T1 = 2026-02-12，T4 = 2026-05-18，T5 = 2026-06-09，T7 = 2026-07-09 | `tempo/crates/chainspec/src/genesis/presto.json`；`spec.rs:125@87bd32a63d` | observed |
| L9 | `general_gas_limit` 是 header 字段，T1 起固定为 30,000,000，header 值不等于 chainspec 期望值即拒绝 | `tempo/crates/hardfork/src/lib.rs:277-285`、`constants.rs:73-77`、`crates/evm/src/consensus/mod.rs:94-106@87bd32a63d` | observed |
| L10 | T4 起 shared_gas_limit = 0，非支付超出预算会让区块无效（“incentive gas limit exceeded”） | `hardfork/src/lib.rs:290-296`；`crates/evm/src/block.rs:469-477,648-652@87bd32a63d` | observed |
| L11 | TIP-1010 主网初始参数：区块 500M、shared 50M、general 30M，“至少 420M 留给支付” | [3] “Shared capacity model” | observed |
| L12 | T4 之后、gas limit 仍为 500M 时，支付可用空间约 470M | 由 L10、L11 推出：500M − 30M，shared 为 0 | inferred |
| L13 | Tempo 构建器跳过会让非支付总量超过 general_gas_limit 的交易（ExceedsNonPaymentLimit） | `tempo/crates/payload/builder/src/lib.rs:571-588@87bd32a63d` | observed |
| L14 | Tempo v2 分类先在交易池 / 构建器中用于防 DoS，T5 才写进共识 | `envelope.rs:276-278@87bd32a63d` 注释；`crates/transaction-pool/src/transaction.rs:105` | observed |
| L15 | Tempo T7 动态 base fee 以全块 gas（含支付 lane）为输入，支付用量同样推高 base fee，即没有费用隔离 | [4] Assumptions | observed |
| L16 | TIP-1067 参数：cap 1.2e10、floor 6e8 attodollars/gas，target 10M gas，denominator 8 | [4] Constants；`tempo/crates/hardfork/src/constants.rs:41-70@87bd32a63d` | observed |
| L17 | BEP-703 有效性条件为 `generalGasUsed + max(paymentGasUsed, quota) ≤ GasLimit`，且不新增排序 / 优先级 / 费用规则 | `BEPs/BEP-703.md:141-152@e9b2be3b00` | observed |
| L18 | BEP-703 只保证支付“作为一类”有 gas，不保证任何单笔被纳入 | `BEP-703.md:38@e9b2be3b00` | observed |
| L19 | BSC 预留闲置时不归还，理由是归还会让排除支付交易没有成本 | `BEP-703.md:271@e9b2be3b00`（§4） | observed |
| L20 | BSC lane 内的交易按普通费用规则付全价（“Reserved gas is not free gas”） | `BEP-703.md:281@e9b2be3b00`（§6） | observed |
| L21 | BSC 分类：名单读父状态（命中即为支付）；其余要求 value>0 且接收方在实时状态下无代码；类型限于 0x00/0x01/0x02 | `BEP-703.md:89-127`；`bsc/core/paymentlane/classify.go:35-58@8cc60b246c` | observed |
| L22 | BSC 名单按地址登记，被调用的函数不限；只看顶层 `to` | `BEP-703.md` §3.2 表格；`classify.go:39-50@8cc60b246c` | observed |
| L23 | BSC 普通交易可声明的最大 gas = 剩余 gas − 闲置预留 | `bsc/core/paymentlane/budget.go:12-21@8cc60b246c` | observed |
| L24 | BSC Jenner 在主网、Chapel、Rialto 均未排期；最新 release 仍为 v1.8.0-alpha（2026-08-13）；官方计划测试网 10 月下旬、主网 11 月下旬 | `bsc/params/config.go:256,311,368@8cc60b246c`；`gh release list -R bnb-chain/bsc`；[24] | observed |
| L25 | Tempo 给非支付封顶、BSC 给支付保底，方向相反；两者都只做容量隔离，都不改排序或费用 | 由 L2、L9、L15、L17、L20 推出 | inferred |
| L26 | ACE 定义为“对与应用交互的一批交易施加排序规则”；cancel prioritization 指同批内撤单先于吃单 | [15] post 1 §1 | observed |
| L27 | ACE 对 app-chain 的评价：抗审查只等于链本身的抗审查，proposer 可以直接排除 cancel；结算只能经桥 | [15] §2.1 Cons | observed |
| L28 | ACE 对 AMQ 的评价：不改共识，但至少延迟一个 slot、下一块结算；原作者承认可被审查和延迟绕过 | [15] §2.2 | observed |
| L29 | ACE 对 Angstrom 的评价：不改共识，自带抗审查；有额外 liveness 风险；批次后同块可用 | [15] §2.3 | observed |
| L30 | ACE 对 PEPC 的评价：没有额外信任假设、原生结算；但参与是自愿的，有 cold-start（1/10 验证者参与 ⇒ 平均 10 块更新一次） | [15] §2.4 | observed |
| L31 | ACE §3 设想合约声明 `order = [Cancel, Take]`，违反即区块无效 | [15] §3 | observed |
| L32 | REMOVE/SWAP 奇偶例子中，6 种排列只有 2 种合法，且合法集合取决于初始奇偶 | [15] §3.1 | observed |
| L33 | 两个 DEX 的循环依赖（TX1 = REMOVE(A)+SWAP(B)，TX2 = REMOVE(B)+SWAP(A)）导致两笔交易不能同块；Oracle/DEX 例子同理 | [15] §3.2 | observed |
| L34 | ACE 断言：本地 builder 按优先费贪心打包，至少能拿到最优 tip 收入的 1/2；约 8% 的区块由 proposer 本地构建 | [15] §3.1 | observed |
| L35 | 1/2 近似在教科书上需要“贪心结果与单个最大物品取较大者”，或单笔交易远小于区块容量的前提 | 未查形式化来源；基于 0/1 背包标准结论 | speculative |
| L36 | ACE 断言：验块复杂度远低于建块复杂度，违规可在执行中立即判无效 | [15] §3.3 末段 | observed |
| L37 | ACE 提出显式信号：交易预先声明会调用的函数（类似 BAL），调用未声明的函数则 revert 但仍付 gas | [15] §3.3 “Explicit signalling” | observed |
| L38 | 第 3 楼是作者 mikeneuder 本人的回复，Prop AMM “经济型 cancel priority” 一句是转引第三方文章 | [15] post 3 | observed |
| L39 | PEPC 让 proposer 用 EVM 代码表达承诺、由 attester 检查，是 2022 年的研究提案，没有 EIP | [16] “Committee-based pessimistic block validity” | observed |
| L40 | EVM Native Sequencing Rules 提出 bundle 交易类型、bundler 指定，以及全局变量 `bundle.signer` / `bundle.number` / `bundle.tx_number`，bundle 内交易不保证不 revert | [17] “Sequencing Rules: The How” | observed |
| L41 | FOCIL（EIP-7805，Draft）只约束“不能排除”：16 人委员会、IL 8 KiB、交易可放块内任意位置、条件包含 | [18] Rationale、参数表 | observed |
| L42 | ERC-4337 nonce 由 192 位 key 和 64 位 sequence 组成，每个 key 独立递增，可以随时启用新 key | [19] §Semi-abstracted Nonce Support | observed |
| L43 | Tempo 原生交易有 2D nonce（`nonce_key`，key 0 为协议 nonce） | `tempo/crates/primitives/src/transaction/tempo_transaction.rs:204-206@87bd32a63d` | observed |
| L44 | ERC-4337 原文没有讨论 `tx.gasprice`；“AA 批处理下 tx.gasprice 失真”是从 EVM 语义推出的 | `grep -i gasprice erc-4337.md` 0 命中 [19] | inferred |
| L45 | Mantle Fair Sequencing（2024-02-22）提出：FCFS 分批 + 回执，VRF 随机置换，executor 可罚没 | [20] 正文；[21] “Transaction submission”“Fair ordering” | observed |
| L46 | Mantle fair sequencing 博客原 URL 在 2026-10-11 已 307 重定向到首页 | `curl -sIL …/fair-sequencing` → `HTTP/2 307 location: /` | observed |
| L47 | Mantle op-geth 出块顺序为：preconf 交易 FIFO → 优先账户 → 其余按价格 + nonce；preconf 类别由节点配置的 from/to 白名单决定 | `mantlenetworkio/op-geth/miner/worker.go:764-825`、`preconf/tx_pool_config.go:44-66@e33cd26` | observed |
| L48 | Mantle fair sequencing 未上线 | 由 L47 推出，且 op-geth / mantle-v2（sparse）中 `rg -i vrf` 无相关命中 | inferred |
| L49 | Mantle 无法照搬 Tempo 的前缀分类，因为 Mantle 稳定币不是协议预编译 | 由 L7 推出：Tempo 无状态分类依赖预编译语义固定 | inferred |
| L50 | 如果 Mantle 只加 lane、不改费用机制，meme 拥堵时支付仍会被全块 base fee 推高 | 由 L15、L20 推出，并结合 OP Stack EIP-1559 按全块 gas 调整 base fee | inferred |

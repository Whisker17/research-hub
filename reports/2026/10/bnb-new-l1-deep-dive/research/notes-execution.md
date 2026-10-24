# notes-execution：并行 / 异步执行、BSC 并行执行研究史、OES vs ASS、Multi-Lane

> 分路：execution（前缀 X）。访问日期：2026-10-24。官方文档引用 `newl1-docs@ef5a632/<路径>:L<行>`（行号用 read 工具逐行核对）。
> 预期落盘位置：`reports/2026/10/bnb-new-l1-deep-dive/research/notes-execution.md`（本次运行按 runtime 指定的输出路径写入）。
> v2：吸收主会话补充线索（前文 bsc-recent-development 的 J26–J29 / F10），用 bsc release notes / PR 重新核对 BSC 并行执行的结局，并查证 PEVM 是否在 BSC 主网启用过。

---

## Q3 并行 EVM 与异步执行

### 答案
New L1 的执行层基于 reth + revm。文档里的“Parallel EVM”目前只是方向：基于 access list，交易显式声明状态依赖，不冲突的交易并发执行，原文是“Detailed design is in progress”。已经写成机制的是**异步执行**：共识只定顺序；区块 N 的执行结果以 `ExecutionCommitment` 的形式写进区块 N+D 的头部；D 随负载在 1 到 `D_MAX` 之间调整；结果被承诺、承诺区块又被投票最终化后，执行才算最终。按声明的 gas 收费，是为了堵住“排序时看到的是滞后 D 块的状态”带来的区块空间白嫖漏洞。

### 依据
- **执行底座**：“execution builds on reth and revm”[3] overview.md:L45；“revm semantics are a hard design invariant”[7] faq.md:L9。
- **并行 EVM 的全部原文**：“The current design centers on an access-list-based parallel EVM: transactions declare their state dependencies explicitly, so non-conflicting transactions can execute concurrently. Detailed design is in progress.”[1] L101。在本路读过的 10 个页面里，找不到关于调度器、冲突处理、access list 是否强制、与 BAL / TxDAG / 乐观执行有何关系的任何描述。overview 的架构表把“Parallel EVM”列为执行层组成部分，没有标注成熟度 [3] L33；架构图同样写“Parallel EVM · Order-Execution separation · 100K+ TPS”[11]。
- **排序与执行分离**：slot N 只做静态校验和 BLS 投票，确定顺序，不执行交易；执行发生在 slot ≥ N+1，结果写进后续区块头的 `ExecutionCommitment`[1] L13–14。
- **区块头省略的字段**：`state_root`、`receipts_root`、`logs_bloom`、`gas_used`、`blob_gas_used`、`requests_hash`。这些值放在后续区块附带的 execution commitments 里发布；执行由后台 scheduler 取已导入的区块完成，独立于出块和投票循环 [1] L16。区块携带 `systemTransactionsRoot` 和 `commitments`；区块已排序但未执行时，`stateRoot` 等字段为 null [6] migrate-from-bsc.md:L72。文档没有给出 `ExecutionCommitment` 结构体的逐字段定义。
- **自适应 lag**：区块 N 的结果落在 N+D。负载低时 D 趋向 1，负载高时 D 增大；积压时，一个区块可以携带多个 `ExecutionCommitment` 来追赶 [1] L20–24。约束：`1 ≤ D(N) ≤ D_MAX`，每块最多变化 ±1，`D_MAX` 由治理配置。验证者不重新推导 lag，只检查承诺列表三点：与上一个承诺连续、严格递增、每块推进量有界 [1] L28。`D_MAX` 的数值文档没有给出。节点重启时重放的窗口按最大执行 lag 确定 [4] state-db.md:L76。
- **四个状态**：ordered → executed → committed → finalized。只有排序，区块不算最终；发生 reorg 时，排序和执行一起回滚 [1] L35–46。
- **执行失败或结果不一致**：快速最终性投票的对象只是排序。如果某个 head 发布的执行承诺被验证者本地执行否定，验证者就不给它投票；状态承诺是累积的，错误会在有界的块数内暴露，错误结果凑不到 ⌈2N/3⌉ 票。但区块导入阶段不会直接拒绝它 [1] L80；[9] consensus.md:L24、L34。文档没有描述欺诈证明，也没有专门的 slashing。
- **系统交易**：在执行阶段生成，效果写进 `ExecutionCommitment`；验证者只对用户交易排序和投票 [1] L70。系统交易不在区块的交易列表里，也不计入 `header.gasUsed`[6] L71。
- **按声明 gas 收费**：
  - 起因：共识按滞后 D 块的状态接纳交易，会出现 4 类漏洞：余额已为零的 spam、同块内抽干余额、nonce 冲突、合约依赖 [1] L50–57。
  - 机制：节点跟踪每个账户在 D 窗口内的在途花费，算出 `effectiveBalance`，再执行 4 条规则 [1] L59–64：
    1. 收费 `gas_bid × gas_limit`，不退还未用 gas，EIP-3529 退款作废 [1] L61；
    2. `effectiveBalance ≥ tx_cost` 才接纳；
    3. 执行时结算：nonce 正确时收 `min(balance, occupied × price)`；nonce 无效时不收费，也不改状态；回执计入 `min(gas_limit, 剩余区块 gas)`[1] L63；
    4. 每个账户在途的 `gas_limit` 总量和 calldata 字节数有上限 [1] L64。
  - 文档称这种做法不需要 Monad 那样的固定 reserve floor [1] L66。
  - 影响：回执的 `gasUsed` 通常等于声明的 limit；单笔交易上限 16,777,216 gas（BEP-652）[6] L14–21。
- **三个高度**：executed（`latest`）、finalized（以执行承诺为依据）、ordered（`newHeads`）。查询“已排序未执行”的区块返回 `-38004`，可重试 [1] L84–96。
- **LtHash 与并行执行**：状态承诺可交换，所以状态 diff 可以分片并行哈希、无锁归约 [4] L9、L44。
- **成熟度**：overview 写的是“multi-validator devnet … each feature page calls out what's shipped versus still in progress”[3] L67；async-execution 页里只有并行 EVM 标了 in progress（L101）。
- **对照**：Monad 先对排序达成共识，再执行，D = 3，并配有 Reserve Balance 规则 [25]。EIP-7886（Stagnant）把执行输出推迟一块 [24]。New L1 文档自己也引用了这两者 [1] L20。

### 不确定之处
- 并行调度器的设计、access list 的来源，以及它与 BAL / EIP-7928 / TxDAG 是否有继承关系，都没有一手证据。
- 自适应 lag 是 devnet 已实现还是仅停留在设计，页面没有逐项标注（X11）。
- 积压超过 `D_MAX` 时怎么处理，文档没有写。
- `ExecutionCommitment` 的确切字段，文档没有给出。

---

## Q3' BSC 的并行执行与执行层研究：时间线与结局

### 答案
BSC 这条线一直在解决同一个问题：一个已经排好序的区块，怎样执行得更快。各项结局如下：

| 项目 | 结局 |
|---|---|
| Parallel EVM 1.0 / 2.0（NodeReal，BEP-130） | 只在 NodeReal 的分叉 release 里实现，并且只支持 full sync，不支持 validator 模式。2023 路线图说“deployed several iterations to the BSC mainnet”，同一段又说 3.0 才会把并行用到 validator 模式，并且要“take a break and rethink” |
| Parallel EVM 3.0 / TxDAG（BEP-396） | 只在 opBNB 落地：opBNB 主网从 block 43274759 起在链上携带 TxDAG 数据，但 PEVM 客户端只有标注“Beta - Not production ready”的 op-geth 预发布版；BEP-396 / 456 至今是 open 的 Draft |
| BEP-592 非共识 BAL | 2026-01 随 Fermi 上线；2026-05-19 合入的 bsc#3690（理由：“decide to follow upstream”）把它删掉，随 v1.7.6（Chapel）/ v1.7.7（主网，2026-07-22）发布；v1.8.0-alpha 改用上游的 EIP-7928 脚手架 |
| BEP-684（2026-04 Draft） | 提出“只校验 header 就投票、执行异步” |

结论：没有证据表明 PEVM 或 TxDAG 进入过官方 bsc 客户端，或进入过 BSC 的验证者路径。New L1 的 access-list 并行与上表各项处在同一层，而且还在设计；真正跳出去的是共识与执行的时间结构，这一步比 BEP-684 更彻底。

### 依据（时间线）
| 时间 | 事项 | 做了什么 | 结局 | 来源 |
|---|---|---|---|---|
| 2021 年底起 | BSC / NodeReal 开始研究并行 EVM | — | — | [14] |
| 2022-01-27 | BEP-130（Parallel EVM 1.0） | dispatcher 把交易分到 slot，slot 之间并发；检测冲突后重做 | BEPs PR 于 2023-02-14 合并，文件状态仍为 Draft；参考实现在 node-real/bsc 分叉 | [16][14] |
| 2022-10-17 | Parallel EVM 2.0（NodeReal release v1.1.16+Parallel-2.0） | 性能优化 | 只支持 full sync，不支持 validator 模式 | [15] |
| 2023（路线图） | Tech Roadmap 2023 | 称“Starting in May 2022 … designed and deployed several iterations to the BSC mainnet”；同时说“In 2023, Parallel EVM 3.0 will apply parallel to validator mode … take a break and rethink it” | 3.0 规划改为 hint-based | [32][14] |
| 2024-06-18 | BEP-396 TxDAG | 用执行时的读写集生成精确的依赖 DAG，随区块分发 | PR 仍 open（Draft）；BEP-456 也是 open | [17] |
| 2024 | opBNB 上的 TxDAG / PEVM | opBNB 主网从 block 43274759 起在链上携带 TxDAG 数据；客户端为 op-geth v0.5.4-pevm.beta / beta.2 / beta.3，均标注“Beta - Not production ready”；之后的 v0.5.5–v0.5.11 不再提及 | 2025 路线图写“In 2024, BNB Chain implemented Parallel EVM on opBNB”；博客称实验室测试平均提升约 30% | [34][33][18] |
| 2025-06-30 创建；2026-01 Fermi | BEP-592 非共识 BAL | 在区块末尾附上访问列表，节点用来并发预取，不校验其内容 | 上线；博客称 EIP-7928 将取代它（实验室测试：EIP-7928 吞吐 +18.6%，p95 处理时间 +32.1%） | [19][20] |
| 2025-12（推断） | Tech Roadmap 2026 | 计划：追块时用 EIP-7928 BAL 做无冲突并行（称已带来 20% 提升）；出块时用静态分析预判依赖 | 计划 | [13] |
| 2026-04-23 | BEP-684 Header-Only Voting | 只校验 header 就投票，执行异步；区块头仍承诺 `state_root`；最终性要等导入完成；`EXECUTION_DEBT_MAX = 2` | Draft，open | [23] |
| 2026-05-19 | bsc#3690 | 删除 BEP-592（+36 / −1540 行），理由“decide to follow upstream, so revert origin commit ff39df86” | milestone v1.7.6；同一版本还删了 multidb（#3716） | [35] |
| 2026-07（Chapel 07-21 / 主网 07-22） | bsc v1.7.6 / v1.7.7（Pasteur） | `--enablebal` 失效；`[Eth] EnableBAL` 必须从配置中删除，否则启动报错 | BEP-592 已不在主网生产客户端中 | [36][21] |
| 2026-07-08 | H2 2026 路线图 | 把 BAL 列为 H1 四项提速特性之一；H2 计划用 BAL 并行降低导入延迟；Rust 客户端兼容 Reth v2.0 | — | [12] |
| 2026-08-13 | bsc v1.8.0-alpha（预览版，不面向生产） | 同步 geth v1.17.3；删除 superinstruction（#3759）和 incr snapshot（#3768）；“EIP-7928 block access list scaffolding replaces BEP-592”；`--enable-bal` / `--vm.opcode.optimize` 仍接受但无效 | 执行层回归上游 | [37] |
| 2026-10-22 | New L1 文档 | 异步执行写成机制；access-list 并行 EVM 标为 in progress | 设计中 | [1] |

### 与前文（bsc-recent-development J26–J29 / F10）的核对
- **一致**：v1.8.0-alpha 同步 geth v1.17.3，删除 superinstruction 和 incr snapshot，用 EIP-7928 脚手架替代 BEP-592（J26）[37]；#3690 的理由是“decide to follow upstream”（J28）[35]。superinstruction 和 incr 的删除不在 v1.7.7 / v1.7.8 中（J27，前文用 merge-base 核对过），这与 v1.8.0-alpha 才列出 #3759 / #3768 一致。
- **需要修正**：前文 F10 写“主网生产版本 v1.7.7 / v1.7.8 不含这些改动”，这句话把 BEP-592 也包含进去了，不准确。BEP-592 的删除（#3690）和 multidb 的删除（#3716）早在 v1.7.6（Chapel）/ v1.7.7（主网）的 CLEAN UP 中就已列出，`EnableBAL` 也在这两个版本里成了必须删除的配置项 [35][36][21]。v1.8.0-alpha 新增的只是 EIP-7928 脚手架。准确的说法是：“BEP-592 于 v1.7.6 / v1.7.7 已从生产客户端移除；superinstruction 与 incr 只在 v1.8.0-alpha 中移除。”

### BSC 主网是否启用过 PEVM 1.0 / 2.0 / 3.0 或 TxDAG
- **直接证据**：2.0 只支持 full sync，“validator mode is not supported right now”[15]；2023 路线图说 3.0 才会把并行用到 validator 模式，并称当前实现“very complicated … take a break and rethink”[32]；TxDAG 的 BEP 仍是 open 的 Draft [17]；PEVM 客户端只有 op-geth 的 beta 预发布版 [34]。
- **冲突**：2023 路线图同时说“deployed several iterations to the BSC mainnet”[32]。
- **解释（inferred，X24）**：这句“部署”最可能指 NodeReal 分叉 release 跑在同步 BSC 主网的 full node 上，而不是共识或验证者路径。从未有硬分叉或 BEP 激活涉及 PEVM。
- **结论（speculative，X29）**：在 bnb-chain/bsc 的官方 release 中，没有找到 PEVM 或 TxDAG 选项的证据；本路没能对 bsc 仓库做全文检索。

### New L1 与这些工作的关系
- **[inferred]** BSC 这条线和 New L1 的 access-list 并行，都属于“区块内执行加速”这一层；New L1 的这部分仍在设计中（X37）。
- **[inferred]** New L1 真正的新东西在时间结构：BEP-684 只是让投票不等执行，区块头仍承诺 `state_root`；New L1 把执行结果整个移出区块头，延迟 D 块发布，而且 D 是自适应的（X36）。BEP-684 §7 自己写道：“BSC Header-Only Voting is more conservative”[23]。
- **[speculative]** New L1 的 access list 是否沿用了 BAL / EIP-7928，没有一手证据（X38）。

### 不确定之处
- “Road to High Performance”和 Tech Roadmap 2023 两篇博客的发布日期都没有取到（后者的图片路径是 2023/05）。
- opBNB 的 PEVM beta 后来是否转正、是否被放弃，没有找到官方说明。
- 外部调研列出的 reth-bsc 优化项，本路没有逐项核对。

---

## Q6 Order / Execution Separation 与应用特定排序（ASS）

### 答案
OES 这个说法来自架构图上的“Order-Execution separation”；正文里的写法是“decoupled”和“order-execution decoupling”。它的含义只是共识与执行在时间上解耦：验证者签名的是交易顺序，而不是执行结果。

它没有改变“谁决定顺序”：排序权仍在当前出块者手里，lane 内按手续费优先；也没有给应用任何排序权。所以 OES 与 ASS 是正交的两件事。它最多可以作为在上层实现 ASS 的底座（inferred）。

### 依据
- 架构图上写的是“Parallel EVM · Order-Execution separation · 100K+ TPS”[11]。正文：“validators sign a block's ordering, not its execution result. That is what makes order-execution decoupling possible”[9] L24；“execution reveals state rather than deciding it”[1] L9。
- 谁定序：
  - gateway 把交易单跳发给即将出块的生产者 [5] transaction-lifecycle.md:L20；客户端“no Gateway-specific auction or ordering API”[5] L28。
  - 预确认是出块者签名的位置承诺 [10] tx-preconfirmation.md:L7；在约 20ms 的窗口内只追加不重排，后到的高费交易不能重排已经流出的交易 [10] L55。
  - lane 内按手续费优先，不保证 FIFO [2] multi-lane.md:L15。
- ASS 的定义取自前文 [30]：应用控制或约束自己交易的排序与 MEV 分配；Tempo 和 BSC 的 lane 在前文里被归为“只管容量”。

### 逐维对比
| 维度 | New L1 OES | ASS（前文定义） |
|---|---|---|
| 解决的问题 | 200ms 出块时，执行不能挡在共识关键路径上（[1] L7–9） | 应用自己交易的排序规则和 MEV 归属 |
| 谁决定顺序 | 当前出块者（Parlia 轮值），按手续费优先；gateway 不提供排序 API | 应用、应用 sequencer 或合约规则 |
| 粒度 | 整条链、每个区块 | 单个应用、交易对或合约 |
| 给应用排序权 | 不给 | 这正是核心 |
| MEV / 公平性 | 协议里没有公平排序规则。路线图称 TxStream“blocking front-running by design”[12]；但文档里的机制只是不广播到全局 mempool，出块者本人仍然最先看到交易（inferred） | 通常是主要设计目标 |
| 可组合性 | 全局单一顺序，同块内原子可组合（inferred） | 取决于具体实现 |
| 两者关系 | 正交，OES 可以作为 ASS 的底座 | — |

### 不确定之处
- 架构图里的“Encrypted RPC”在本路读过的页面中都没有解释。
- 路线图“设计上阻止抢跑”的说法，在文档里找不到对应的协议机制。

---

## Multi-Lane

### 答案
Multi-Lane 在每个区块里按 lane 预留 gas 容量：
- **分 lane**：注册过的合约地址按交易的 `to` 确定性地进入它所属的 lane；未注册地址和合约创建交易进入默认 lane，默认 lane 没有上限。
- **配额**：以区块 gas limit 的 bps 计，写在 `LaneRegistry`（`0x…3000`），由 govBNB 治理调整。
- **保证范围**：只保证容量，不保证某笔交易被纳入，也不保证 FIFO；lane 内仍按手续费排序。

所以它是容量隔离，不是 ASS。它与 BSC Payment Lane 属于同类设计，主要区别有三点：可以有多条 lane；保留但未用掉的容量会回流到默认 lane；占用按声明的 gas 计算。

### 依据
- 保证的是容量，不是纳入；不提供 FIFO [2] L11–15。
- 按 `to` 地址确定性路由；未注册地址和合约创建进入默认 lane；不按 calldata 或函数选择器路由：“A lane protects an address, not a use case”[2] L19–23。
- `LaneRegistry` 的地址是 `0x…3000`，参数经治理修改；配额以 bps 计；默认 lane 吸收剩余容量和其他 lane 未用掉的保留容量；占用按声明的 gas limit 计 [2] L27–31；[8] system-contracts.md:L21、L31。
- lane 配置从一个滞后的检查点读取，所以治理改动大约在一个执行 lag 之后才生效；可以用 `newl1_laneConfig` 查询当前配置 [2] L35–37。
- 申请专属容量的路径：通过治理注册合约地址 [2] L43–45；[7] faq.md:L38；[3] L37。
- 文档写明“no equivalent on BNB Smart Chain”[2] L7。H2 路线图把这个功能叫作“PriorityLane”，举的例子是预言机、清算和跨链桥 [12]。
- BSC Payment Lane（BEP-703，Draft）[26]：
  - 只有一个支付类别；
  - 判定条件是：顶层 `to` 在支付名单上，或是向无代码地址的裸 BNB 转账；
  - 配额默认 500 bps，上限 1000 bps；
  - 普通交易“not even when it sits empty”也不能用这部分配额；
  - 不改变排序。

### Multi-Lane vs Payment Lane
| 维度 | New L1 Multi-Lane | BSC Payment Lane（BEP-703） |
|---|---|---|
| lane 数量 | 多条 | 一条（支付类） |
| 分类依据 | 顶层 `to` 地址（查注册表） | 顶层 `to` 在名单上，或向无代码地址转 BNB |
| 未用配额 | 回流默认 lane | 闲置，不给普通交易 |
| 占用计量 | 声明的 gas limit | 实际 gasUsed |
| 配额来源 | `LaneRegistry`（govBNB 治理） | 治理设定的 ratio：默认 5%，上限 10% |
| 生效时间 | 约一个执行 lag 之后 | 下一块 |
| 排序 | lane 内按手续费，无 FIFO | 不改排序 |
| 状态 | 文档描述（devnet） | Draft，Jenner 尚未激活 [29] |

### 是不是 ASS
**[inferred]** 不是。Multi-Lane 只做容量隔离，和 Tempo、BSC 的 lane 属于同一类 [30]；它不给应用排序权（[2] L15）。不过，如果一条 lane 只注册了一个地址，那个应用实际上就拥有了一块专属容量。

---

## 外部调研中被修正的地方
1. **“parallel scheduler 标为 in progress”不准确**：原文标 in progress 的是整个 access-list 并行 EVM 的详细设计 [1] L101；文档里唯一出现的 scheduler 是异步执行的后台 scheduler（[1] L16）。
2. **夸大了并行 EVM 的细节**：“scheduler 读取 access list、冲突交易按确定性顺序处理”是外推；文档只有一句话 [1] L101。
3. **“adaptive execution lag”被归为“仍需验证”，缺乏依据**：文档用现在时把它写成工作机制，并给出了具体约束 [1] L20–28（X11）。
4. **缺失 BEP-684**：BSC 自己提出的“投票与执行解耦”草案 [23]。
5. **BEP-592 的结局缺失或过时**：它已由 bsc#3690（2026-05-19，理由“decide to follow upstream”）删除，随 v1.7.6 / v1.7.7 发布；v1.8.0-alpha 改用 EIP-7928 脚手架 [35][36][21][37][20]。
6. **Parallel EVM 的结局缺失**：外部调研没有交代以下几点：PEVM 2.0 只支持 full sync [15]；2023 年官方曾决定“take a break and rethink”[32]；TxDAG 只在 opBNB 链上数据和 op-geth beta 预发布版中出现 [34]，BEP-396 仍是 Draft [17]；也没有提到 Parallel EVM 3.0 [14]。外部调研引用 2.0 博客的标题“The Implementation of Parallel EVM 2.0”，容易让人误读为已在 BSC 生产上线。
7. **“Multi-Lane 不保证每个应用拥有独立 blockspace”说反了**：lane 按地址保留容量 [2] L19–31。外部调研说交易“通常”按地址映射，实际是确定性映射 [2] L19。
8. **缺失 Multi-Lane 与 Payment Lane 的关键差异**：未用配额回流还是闲置、按声明 gas 还是实际 gas 计量、多条 lane 还是单一类别 [2][26]。
9. **缺失按声明 gas 收费的机制细节** [1] L50–64。
10. **缺失 EIP-7886 / Monad 对照**：New L1 文档自己引用了二者 [1] L20；[24][25]。
11. **未核实**：外部调研列出的 BSC Reth 优化项本路没有核对；Super Instruction 实际属于 Go 客户端的 BEP-610，以节点开关 `--vm.opcode.optimize` 启用，已在 v1.8.0-alpha 中删除 [12][37]。

## 矛盾记录
- **“BSC 主网部署过 PEVM”**：2023 路线图称“deployed several iterations to the BSC mainnet”[32]；但 2.0 博客写明不支持 validator 模式 [15]，同一份路线图又说 3.0 才会做 validator 模式。本文的处理（inferred）：这里的“部署”指分叉 release 在 full node 上运行，不是共识层启用。
- **前文 F10 关于 v1.7.7 的说法**：前文称 v1.7.7 / v1.7.8 不含 BEP-592 的删除；但 #3690 的 milestone 是 v1.7.6，v1.7.6 / v1.7.7 的 release notes 也列出了相关改动 [35][36][21]。以 release notes 为准；superinstruction 和 incr 只在 v1.8.0-alpha 中删除，这一点与前文一致。
- **New L1 的性能目标在演变**：Tech Roadmap 2026 的“下一代交易链”目标是约 1M TPS、最佳 150ms 确认、执行证明 [13]；H2 路线图和架构图写的是 100K+ TPS、sub-50ms 预确认 [12][11]。

---

## 来源
1. **PRIMARY** newl1-docs@ef5a632/core-concepts/async-execution.md：证明异步执行、自适应 lag、四状态、按声明 gas 收费、弃票，以及并行 EVM 处于 in progress。
2. **PRIMARY** newl1-docs@ef5a632/core-concepts/multi-lane.md：证明 Multi-Lane 的机制。
3. **PRIMARY** newl1-docs@ef5a632/overview.md：证明 reth / revm 底座和 devnet 状态。
4. **PRIMARY** newl1-docs@ef5a632/core-concepts/state-db.md：证明 LtHash 支持并行归约，以及重启窗口的大小。
5. **PRIMARY** newl1-docs@ef5a632/developers/transaction-lifecycle.md：证明 gateway 单跳路由、没有排序 API。
6. **PRIMARY** newl1-docs@ef5a632/get-started/migrate-from-bsc.md：证明声明 gas 收费的影响、`commitments` 字段、系统交易不进区块。
7. **PRIMARY** newl1-docs@ef5a632/faq.md：证明 revm 不变量和 lane 注册路径。
8. **PRIMARY** newl1-docs@ef5a632/governance/system-contracts.md：证明 `LaneRegistry` 的地址。
9. **PRIMARY** newl1-docs@ef5a632/core-concepts/consensus.md：证明投票只签排序，以及弃票机制。
10. **PRIMARY** newl1-docs@ef5a632/core-concepts/tx-preconfirmation.md：证明预确认只追加、不重排。
11. **PRIMARY** 架构图 https://docs.bnbchain.org/assets/newl1-architecture.png（访问 2026-10-24）：“Order-Execution separation”这一说法的出处。
12. **PRIMARY** BNB Chain《H2 2026 Tech Roadmap》（2026-07-08）：H1 的 BAL、H2 计划、PriorityLane / TxStream / 100K+ TPS。
13. **PRIMARY** BNB Chain《Tech Roadmap 2026》（约 2025-12）：EIP-7928 并行计划、下一代交易链目标。
14. **PRIMARY** BNB Chain《Road to High Performance: Parallel EVM for BNB Chain》（日期未取到）：PEVM 1.0 / 2.0 / 3.0 规划。
15. **PRIMARY** BNB Chain《New Milestone: The Implementation of Parallel EVM 2.0》（2022-11-03）：2.0 于 2022-10-17 发布，只支持 full sync，不支持 validator 模式。
16. **PRIMARY** bnb-chain/BEPs PR #130：BEP-130 的设计；2023-02-14 合并，状态 Draft。
17. **PRIMARY** bnb-chain/BEPs PR #396 和 #456：TxDAG 提案仍是 open 的 Draft。
18. **PRIMARY** BNB Chain《How TxDAG Resolves Transaction Conflicts…》（2024-11-28）：op-geth PEVM alpha 的测试数据。
19. **PRIMARY** BEP-592 @ BEPs cb62306：非共识 BAL，Candidate。
20. **PRIMARY** BNB Chain《Boosting BSC Performance with Block Access List》（约 2025-12）：BEP-592 上线，EIP-7928 将取代它。
21. **PRIMARY** bnb-chain/bsc release v1.7.7（2026-07-22，主网 Pasteur）：`--enablebal` 失效，`EnableBAL` 必须删除。
22. **PRIMARY** BNB Chain Release Notes https://www.bnbchain.org/en/releases：release notes 汇总。
23. **PRIMARY** BEP-684 @ zlacfzy/BEPs 73b1cfe（PR #684，open）：Header-Only Voting。
24. **PRIMARY** EIP-7886：delayed execution，Stagnant。
25. **PRIMARY** Monad 文档《Asynchronous Execution》：先排序后执行，D = 3，Reserve Balance。
26. **PRIMARY** BEP-703 @ BEPs cb62306：Payment Lane 的规则。
27. **PRIMARY** bnb-chain/BEPs README @ master：各 BEP 的状态表。
28. EIP-7928（背景）。
29. 前文 bsc-recent-development/explainer.md（内部二手资料）。
30. 前文 application-specific-sequencing/explainer.md（只用于 ASS 定义）。
31. 外部调研 BNB-new-L1-deep-dive.md（ChatGPT，仅作线索）。
32. **PRIMARY** BNB Chain《BNB Chain Tech Roadmap 2023》https://www.bnbchain.org/en/blog/bnb-chain-tech-roadmap-2023（日期未取到，图片路径 2023/05）：“deployed several iterations to the BSC mainnet”、3.0 才做 validator 模式、“take a break and rethink”。
33. **PRIMARY** BNB Chain《BNB Chain Tech Roadmap 2025》（2025-02-11）https://www.bnbchain.org/en/blog/bnb-chain-tech-roadmap-2025：“In 2024, BNB Chain implemented Parallel Ethereum Virtual Machine on opBNB”。
34. **PRIMARY** bnb-chain/op-geth releases https://github.com/bnb-chain/op-geth/releases：v0.5.4-pevm.beta / beta.2 / beta.3 都标注“Beta - Not production ready”，均为预发布版；opBNB 主网从 block 43274759 起携带 TxDAG 数据；v0.5.5–v0.5.11 不再提及。
35. **PRIMARY** bnb-chain/bsc PR #3690：删除 BEP-592；2026-05-19 合并，milestone v1.7.6，理由“decide to follow upstream”。
36. **PRIMARY** bnb-chain/bsc release v1.7.6（Chapel Pasteur，2026-07-21 分叉）：CLEAN UP 中列出 #3690、#3716、#3720，并要求删除 `EnableBAL`。
37. **PRIMARY** bnb-chain/bsc release v1.8.0-alpha（2026-08-13，预览版）：同步 geth v1.17.3，删除 #3759 superinstruction 和 #3768 incr，EIP-7928 脚手架取代 BEP-592。
38. 前文 bsc-recent-development/research/ledger.md 的 J26–J29（内部台账，用于交叉核对）。

## 开放问题
- 并行 EVM 的 access list 由谁声明、漏报依赖时怎么处理、是否沿用 EIP-7928 的格式。
- 积压超过 `D_MAX` 时怎么处理；`D_MAX` 在 devnet 上取什么值。
- `ExecutionCommitment` 的结构；执行承诺出错时，除了弃票，有没有问责机制。
- lane 按声明的 gas limit 计占用：会不会被夸大的 gas limit 浪费？
- “Encrypted RPC”和“TxStream 阻止抢跑”的具体机制。
- opBNB 的 PEVM beta 最终是转正还是放弃；BSC 是否会借 EIP-7928 重新启用并行执行（H2 路线图有“BAL-based parallel execution”）。
- New L1 客户端源码何时公开（未用 `gh` 复核）。

## 说明与核验局限
- 本路没有 bash / `gh`。GitHub 内容通过 fetch 读取；BEPs 的 commit 固定为 cb62306（GitHub API，2026-10-22）。
- 本路没有对 bnb-chain/bsc 的全部 tag 做 `--parallel` 等关键字的全文检索。“官方 bsc 客户端从未包含 PEVM”一条仍是 speculative。

---

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| X1 | New L1 的执行层基于 reth 与 revm，revm 语义是硬性设计约束 | [3] newl1-docs@ef5a632/overview.md:L45；[7] faq.md:L9 | observed | |
| X2 | 文档对“Parallel EVM”的全部描述只有一段：基于 access list，交易显式声明状态依赖，不冲突的交易并发执行；原文为“Detailed design is in progress” | [1] newl1-docs@ef5a632/core-concepts/async-execution.md:L99–101 | observed | |
| X3 | overview 架构表和架构图把 Parallel EVM 列为执行层组成部分，没有标注成熟度 | [3] overview.md:L33；[11] 架构图 | observed | |
| X4 | 区块头省略 state_root、receipts_root、logs_bloom、gas_used、blob_gas_used、requests_hash，这些值在后续区块的 execution commitments 中发布；执行由后台 scheduler 独立于出块和投票完成 | [1] async-execution.md:L16 | observed | |
| X5 | 系统交易在执行时生成，效果写入 ExecutionCommitment，不进入区块的交易列表；区块带 systemTransactionsRoot 和 commitments，未执行前 stateRoot 等字段为 null | [1] async-execution.md:L70；[6] get-started/migrate-from-bsc.md:L71–72 | observed | |
| X6 | 区块 N 的结果写入区块 N+D 的头部；负载低时 D 趋向 1，负载高时 D 增大；追赶时一个区块可以携带多个 ExecutionCommitment | [1] async-execution.md:L20–24 | observed | |
| X7 | 1 ≤ D ≤ D_MAX，每块最多变化 ±1，D_MAX 由治理配置（文档未给数值）；验证者只检查承诺列表连续、严格递增、每块推进有界 | [1] async-execution.md:L28 | observed | |
| X8 | 区块状态依次为 ordered → executed → committed → finalized；只有排序不算最终；reorg 时排序和执行一起回滚 | [1] async-execution.md:L35–46 | observed | |
| X9 | 投票只针对排序；验证者如果本地执行否定了已发布的执行承诺，就不投票，错误结果凑不到 ⌈2N/3⌉ 票；区块导入阶段不拒绝这类区块 | [1] async-execution.md:L80；[9] consensus.md:L24、L34 | observed | |
| X10 | 对错误的执行承诺，文档只描述了不投票这一种处理，没有欺诈证明或专门的 slashing | 由 X9 推出：已读的 async-execution 和 consensus 页只写了不投票这一种纠错手段 | inferred | |
| X11 | 自适应 lag 属于当前设计，不在标为 in progress 的范围内，但文档没有明说已在 devnet 运行 | 由 X2、X6 与 [3] overview.md:L67 推出：async-execution 页只把并行 EVM 标为 in progress | inferred | |
| X12 | 按声明 gas 收费的起因：共识按滞后 D 块的状态接纳交易，会遇到零余额 spam、同块抽干、nonce 冲突、合约依赖四类问题 | [1] async-execution.md:L50–57 | observed | |
| X13 | 费用为 gas_bid × gas_limit，不退未用 gas，EIP-3529 退款作废（系统交易和 RPC 模拟除外）；回执 gasUsed 通常等于声明的 limit；单笔交易上限 16,777,216 gas | [1] async-execution.md:L61；[6] migrate-from-bsc.md:L14、L20–21 | observed | |
| X14 | 只有 effectiveBalance ≥ tx_cost 才接纳交易；每个账户在 D 窗口内的在途 gas_limit 和 calldata 有硬上限 | [1] async-execution.md:L59、L62、L64 | observed | |
| X15 | 执行时结算：nonce 正确时收 min(balance, occupied×price) 并消耗 nonce；nonce 无效时不收费、不改状态；回执计入 min(gas_limit, 剩余区块 gas) | [1] async-execution.md:L63 | observed | |
| X16 | 文档称 New L1 不需要 Monad 式的固定 reserve floor；Monad 使用 Reserve Balance 规则 | [1] async-execution.md:L66；[25] | observed | |
| X17 | latest 解析为已执行的区块头；finalized 以执行承诺为依据；查询已排序但未执行的区块返回可重试的 -38004 | [1] async-execution.md:L84–96 | observed | |
| X18 | LtHash 可交换，状态 diff 可以分片并行哈希、无锁归约，不拖慢并行执行 | [4] core-concepts/state-db.md:L9、L44 | observed | |
| X19 | 节点重启时重放的窗口按最大执行 lag 确定 | [4] state-db.md:L76 | observed | |
| X20 | 排序与执行解耦不是 New L1 首创：Monad 先就排序达成共识，D = 3；EIP-7886（Stagnant）把执行输出推迟一块；New L1 文档自己引用了这两者 | [25]；[24]；[1] async-execution.md:L20 | observed | |
| X21 | Parallel EVM 1.0 即 NodeReal 于 2022 年初提出的 BEP-130（dispatcher + slot + 冲突重做），参考实现在 node-real/bsc 分叉；BEPs PR 于 2023-02-14 合并，文件状态为 Draft | [14]；[16] BEPs PR #130 | observed | |
| X22 | Parallel EVM 2.0 于 2022-10-17 以 NodeReal release v1.1.16+Parallel-2.0 发布，只支持 full sync，不支持 validator 模式 | [15] | observed | |
| X23 | Tech Roadmap 2023 称“deployed several iterations to the BSC mainnet”，同时说 3.0 才会把并行用到 validator 模式，并称当前实现过于复杂、要“take a break and rethink” | [32] Tech Roadmap 2023 | observed | |
| X24 | PEVM 1.0 / 2.0 从未进入 BSC 的验证者或共识路径；所谓“部署到主网”指分叉 release 运行在同步主网的 full node 上 | 由 X22、X23 推出：2.0 不支持 validator 模式，3.0 才计划做 validator 模式且被搁置 | inferred | |
| X25 | Parallel EVM 3.0 规划为基于 hint（读写集）的 dispatcher，以减少重复执行，目标是进入 BSC / opBNB 生产环境 | [14] | observed | |
| X26 | BEP-396 TxDAG（2024-06）用执行读写集构造依赖 DAG，PR 仍是 open 的 Draft；BEP-456 同样 open | [17] BEPs PR #396、#456 | observed | |
| X27 | TxDAG PEVM 在 op-geth alpha 版上测试，实验室平均提升约 30% | [18] | observed | |
| X28 | opBNB 主网从 block 43274759 起在链上携带 TxDAG 数据，但 PEVM 客户端只有标注“Beta - Not production ready”的 op-geth v0.5.4-pevm 预发布版；2025 路线图称 2024 年在 opBNB 上实现了 Parallel EVM | [34] op-geth releases；[33] Tech Roadmap 2025 | observed | |
| X29 | Parallel EVM 1.0–3.0 和 TxDAG 都没有进入 bnb-chain/bsc 官方 release，停留在分叉、BEP 草案和 opBNB beta 阶段 | 没有找到相反证据；由 [15][17][32][34] 支持；未对 bsc 的全部 tag 做全文检索 | speculative | |
| X30 | BEP-592（2025-06-30，Candidate）是非共识 BAL：附在区块末尾，节点用于并发预取，不校验内容 | [19] BEP-592 @cb62306 | observed | |
| X31 | 官方 BAL 博客称 BEP-592 已上线，EIP-7928 将取代它；实验室中 EIP-7928 吞吐 +18.6%，p95 处理时间 +32.1% | [20] | observed | |
| X32 | bsc#3690 于 2026-05-19 合并（milestone v1.7.6），删除 BEP-592，理由为“decide to follow upstream”；v1.7.6（Chapel）和 v1.7.7（主网，2026-07-22）的 release notes 都声明 --enablebal 失效、必须删除 EnableBAL | [35] bsc PR #3690；[36] v1.7.6；[21] v1.7.7 | observed | |
| X33 | v1.8.0-alpha（2026-08-13，不面向生产）同步 geth v1.17.3，删除 superinstruction（#3759）和 incr snapshot（#3768），用 EIP-7928 脚手架取代 BEP-592 | [37] bsc v1.8.0-alpha | observed | |
| X34 | 官方路线图仍把 BAL 作为并行方向：H2 2026 计划用 BAL 并行降低导入延迟；Tech Roadmap 2026 计划用 EIP-7928 在追块时做无冲突并行（称已带来 20% 提升），并在出块时用静态分析预判依赖 | [12] H2 2026 路线图；[13] Tech Roadmap 2026 | observed | |
| X35 | BEP-684（2026-04-23，open Draft）提出只校验 header 就投票、执行异步；区块头仍承诺 state_root；最终性要等导入完成；EXECUTION_DEBT_MAX = 2 | [23] BEP-684 @73b1cfe | observed | |
| X36 | New L1 比 BEP-684 走得更远：区块头根本不带执行结果，结果延迟 D 块由 ExecutionCommitment 发布，且 D 自适应 | 由 X4、X6、X35 推出 | inferred | |
| X37 | BSC 的并行执行线（PEVM、TxDAG、BAL）和 New L1 的 access-list 并行都属于区块内执行加速，New L1 这部分仍在设计；New L1 的新东西在于共识与执行的时间结构 | 由 X2、X21–X35、X36 推出 | inferred | |
| X38 | New L1 的 access list 在格式或代码上沿用了 BAL / EIP-7928 或 TxDAG | 没有一手证据；[1] L101 只写了“access-list-based” | speculative | |
| X39 | 架构图写作“Order-Execution separation”；正文称 order-execution decoupling，指验证者只签排序、不签执行结果 | [11]；[9] consensus.md:L24；[1] async-execution.md:L9 | observed | |
| X40 | 排序由当前出块者决定：gateway 把交易单跳发给即将出块的生产者，不提供拍卖或排序 API；预确认在窗口内只追加不重排 | [5] developers/transaction-lifecycle.md:L20、L28；[10] tx-preconfirmation.md:L7、L55 | observed | |
| X41 | lane 内按普通手续费优先排序，不提供 FIFO，也不保证纳入 | [2] core-concepts/multi-lane.md:L11–15 | observed | |
| X42 | OES 只是共识与执行的时间解耦，不给应用排序权，也不改变 MEV 归属，与 ASS 正交 | 由 X39–X41 推出；ASS 定义见 [30] | inferred | |
| X43 | 路线图称 TxStream 能阻止抢跑，但文档里的机制只是不广播到全局 mempool，出块者本人仍然最先收到交易 | [12]；由 X40 推出 | inferred | |
| X44 | Multi-Lane 按 to 地址确定性路由；未注册地址和合约创建进入默认的无上限 lane；不按 calldata 或函数选择器路由 | [2] multi-lane.md:L19–23 | observed | |
| X45 | lane 配额以 bps 记在 LaneRegistry（0x…3000，经治理修改）；默认 lane 吸收剩余容量和未用掉的保留容量；占用按声明的 gas limit 计 | [2] multi-lane.md:L27–31；[8] governance/system-contracts.md:L21 | observed | |
| X46 | lane 配置从滞后的检查点读取，改动大约在一个执行 lag 之后生效；可通过 newl1_laneConfig 查询 | [2] multi-lane.md:L35–37 | observed | |
| X47 | BSC Payment Lane（BEP-703，Draft）只有一个支付类别，配额默认 500 bps、上限 1000 bps；即使配额闲置，普通交易也不能用；不改变排序 | [26] BEP-703 @cb62306 | observed | |
| X48 | Multi-Lane 与 Payment Lane 的差异：多条 lane 对单一支付类、未用配额回流对闲置、按声明 gas 计对按实际 gas 计；文档自称 Multi-Lane 在 BSC 上没有对应物 | 由 X45、X47 与 [2] multi-lane.md:L7 推出 | inferred | |
| X49 | H2 路线图把这个功能称为 PriorityLane，举的例子是预言机、清算和跨链桥 | [12] | observed | |
| X50 | Multi-Lane 属于容量隔离（与 Tempo、BSC 的 lane 同类），不是 ASS：它给注册地址保留容量，但不给排序权 | 由 X41、X44、X45 推出；分类依据 [30] | inferred | |

# 调研笔记：Angstrom、MEV tax 与应用层拍卖（lane A）

调研日期：2026-10-11。源码引用格式 `仓库/路径:行号@commit`。网页均于 2026-10-11 访问。
固定 commit：angstrom@98216596f3、l2-angstrom@81bd4189f4、UniswapX@eb7ce07703、atlas@083dccd05a。

---

## A-Q1 Angstrom L1（Ethereum）：做什么、怎么做

**答案**：Angstrom L1 是 Uniswap v4 hook 加一个链下质押验证者网络。验证者网络在链下收集签名订单，运行“ToB 套利拍卖 + 统一清算价批量拍卖”，再由轮值 leader 把结果打成**一笔** `execute(bytes)` 交易提交上链。hook 用全局变量 `_lastBlockUpdated` 实现“每个区块开始时锁住 swap”：只有节点的 bundle，或带节点“空块签名”的交易，才能把它设为当前块号；解锁之后，本块剩下的时间里任何人都可以按更高的 unlocked fee 直接 swap。LP 增减流动性、提取内部余额都**不受**这把锁限制。强制力来自合约入口（只有被批准的节点能解锁）加链下共识与（计划中的）罚没；**以太坊并不保证 bundle 在区块里的位置**，只保证锁住期间外部 swap 一定 revert。

**依据**
- 锁：`beforeSwap` 在 `!_isUnlocked()` 时，如果没带解锁数据就 revert `CannotSwapWhileLocked`；如果 hookData 里有 `node(20B)+signature`，就调用 `unlockWithEmptyAttestation` [1]（angstrom/contracts/src/modules/UnlockHook.sol:38-57@98216596f3）。
- `_isUnlocked()` 的判断是 `_lastBlockUpdated == block.number`。`execute` 先调 `_nodeBundleLock()`：要求调用者是节点、本块还没解锁过，然后写入当前块号（TopLevelAuth.sol:212-226、Angstrom.sol:52-56）。空 payload 等于“只解锁”（Angstrom.sol:51 注释）。
- `_lastBlockUpdated` 是**一个全局 uint64**（TopLevelAuth.sol:58），所以一次解锁会同时打开所有 Angstrom 池。文档写的是“unlocks the specific Uniswap V4 pool”[3]，和代码不一致；白皮书写的是 “flips a single poolUnlocked flag”[5 §3]，和代码一致。
- bundle 内的执行顺序：取资产 → `_updatePools`（AMM swap 与奖励）→ ToB 订单 → 用户订单 → 结算（Angstrom.sol:58-74；contracts/docs/overview.md:91-101）。
- 统一价：用户订单的成交价取自 bundle 里**每个交易对**的 `price`（`pairs.get(pairIndex).getSwapInfo`），订单只检查 `price >= minPrice`（Angstrom.sol:202-213）。合约保证同一交易对价格一致（不含费用），但不保证 A:B×B:C 与 A:C 一致（contracts/docs/known-issues.md:16-18）。
- 解锁后的 swap 收 `unlockedFee`，再在 afterSwap 里收 `protocolUnlockedFee`（UnlockHook.sol:62、83）。白皮书：解锁后费率 γ_post > γ [5 §3]。
- LP 不受锁限制：`beforeAddLiquidity` / `beforeRemoveLiquidity` 里没有 `_isUnlocked` 检查（PoolUpdates.sol:50-155）。文档原话是 “does not affect Liquidity Providers' (LPs) ability to deposit or withdraw their liquidity ... at any time” [2]。内部余额 `withdraw` 也不受锁限制（Settlement.sol:38-46）。
- 链下网络：质押验证者跑 Reth 加 sidecar，负责订单收取与 gossip、两种拍卖、组 batch，以及共识（leader 违规会被罚没）[2]。共识流程按文档是 PreProposal → PreProposalAggregation（2/3）→ leader 生成 Proposal 并**乐观提交**，其他节点在下一块事后验证 [4]。白皮书的模型是 2f+1 个验证者、Round 0–4，leader 收齐 f+1 个 Round-3 签名对象后生成 MergeDigest★ [5 §2]。
- 提交渠道：节点代码同时向公共 mempool、`angstrom_submitBundle`（合作 builder，priority fee 设为 0）和 MEV-Boost 的 `eth_sendBundle` 提交（crates/types/src/submission/mod.rs:170-183；angstrom.rs:60-61、96；mev_boost.rs:94）。
- 空块解锁有两条路：(1) 协议发一笔空 batch 交易，Titan 等合作 builder 只在有交易要碰被锁的池时才把它放进块；(2) leader 签 EIP-712 “空块证明”，通过 WebSocket 下发，用户放进 hookData 自己解锁 [3]。
- 白皮书 §1 讲撤单：cancel 是链下订单类型，零 gas；只要在共识 Round 1 之前提交，并且验证者没有共识错误，就保证在本 slot 生效 [5]。链上另有 `invalidateNonce(uint64)`，用户可以自己作废 standing order（OrderInvalidation.sol:13-15）。flash order 只在一个块内有效，同一 bundle 内用 transient 存储防重放（Angstrom.sol:235-240，OrderInvalidation.sol:44-57）。
- ToB 与 cancel 的关系：ToB 套利者出价竞争“本块第一笔、零手续费”调整 AMM 的权利，出价按活跃流动性分给 LP [6]；之后剩余用户订单按统一价批量成交 [7]。批内结果与顺序无关，撤单又在链下共识轮次里先处理，所以“撤单先于吃单”由**批次构造规则**保证，不依赖以太坊区块内的排序。ACE 原文：“In Angstrom's design, cancels are distinct from removing liquidity (and cancels are prioritized)” [12 §2.3]。
- 防审查（白皮书 Appendix B.3.1，Lemma B.1）：诚实验证者在 Round 0 广播的订单，必然进入最终 MergeDigest★ 的计算；在 [T−6Δ, T−5Δ) 窗口内收到的订单，通过 Round-1 payload 的 `recent` 字段转发。可归责的错误有 equivocation、absence、final view censorship、trace censorship 四类，各有 f+1 签名证据和分级罚没。**脚注 15：“Slashing will not be live upon initial launch but will be added as a protocol upgrade in the future”** [5 App. B.2]。白皮书 §2 还明确假设 “there is no censorship from the Ethereum block proposer” [5 §2]。
- 主网：L1 hook 地址 `0x0000000aa232009084Bd71A5797d089AA4Edfad4`，ControllerV1 `0x1746484EA5e11C75e009252c102C8C33e0315fD4`，Timelock `0x60D41d9708BBEfd29000d1486C6406Ef23526c01` [8]。实测：在 L1 块 26169933 时，hook `extsload(3)` 的低 64 位为 26169932，也就是上一块刚解锁过，说明主网在运行（命令见来源 [20]）。

**不确定之处**
- 文档（2/3 阈值）与白皮书（2f+1 个验证者、f+1 个 Round-3 签名）对共识的描述不一致，以哪份为准、代码实现到哪一步，未逐行核对 crates/consensus。
- 罚没目前是否已上线：白皮书（2025-08）写“初始不上线”，之后的状态没有找到一手证据。
- L1 hook 的部署日期：公共 RPC 不支持归档查询，未取得。
- 节点停摆时 swap 完全不可用（除非节点签了空块证明），合约里没有自动兜底的解锁路径。controller 可以通过 `toggleNodes` 增删节点（TopLevelAuth.sol:185-191），但这是治理动作，不是给用户的逃生通道。

## A-Q2 Angstrom L2：做什么、怎么做

**答案**：L2 版本没有链下网络。工厂部署的 Uniswap v4 hook 在 `beforeSwap` 里读取 `priorityFee = tx.gasprice − block.basefee`，按 `tax = swapMEVTaxFactor × TAXED_GAS(120_000) × (priorityFee − priorityFeeTaxFloor)`（priorityFee ≤ floor 时为 0）收取原生币税，在 `afterSwap` 里分给池创建者、协议和 LP（LP 份额按“补偿价”p* 分到穿过的各个 tick）。外部调研写的公式**正确**，参数名是 `swapMEVTaxFactor`、`TAXED_GAS`、`priorityFeeTaxFloor`。排序本身完全交给 L2 sequencer 的优先费排序，hook 只是把“出价”的大部分改道付给应用。**当前只能在 Base 上核实到部署**：factory 与 ETH/USDC hook 于 2026-09-24 部署，上一版 hook 于 2026-02-23 部署。Unichain 在文档里有提到，但链上没有代码。

**依据**
- 常量：`TAXED_GAS = 120_000`，注释说明它是“抽象的 swap gas 估计”，目的是让竞争者的出价成本与实际 gas 无关；`MAX_SWAP_MEV_TAX_FACTOR = 9999`；`MAX_PRIORITY_FEE_TAX_FLOOR = 100 gwei`；创建者 swap fee 上限 20%，创建者 tax 份额上限 50%（l2-angstrom/src/AngstromL2.sol:102-112@81bd4189f4）。
- 公式：`getSwapTaxAmount` 与 `getJitTaxAmount`（AngstromL2.sol:195-215）。JIT 系数为 `swapMEVTaxFactor * 3 / 2`，注释写的是“encourage it to be lower in the block”。
- 读取优先费：`tx.gasprice > block.basefee ? tx.gasprice - block.basefee : 0`。注释说明 `eth_estimateGas` 和 OP-stack deposit 交易里 gasprice 可能低于 basefee，这两种情况按 0 处理（AngstromL2.sol:662-670）。
- `maxSwapTax`：通过 swap 的 hookData 传入，税额超过它就 revert `SwapTaxExceedsSpecifiedMax`（AngstromL2.sol:342-346）。这是 2026-03-25 的提交 bb724a6 加上的。
- 分配：creator 份额 = tax×creatorTaxFeeE6/1e6，protocol 份额 = tax×protocolTaxFeeE6/1e6，剩下的归 LP。LP 份额以原生币 ERC-6909 的形式 mint 给 hook，再按 tick 分配（AngstromL2.sol:465-472、403-415）。JIT tax **100% 归协议**（AngstromL2.sol:296-300、319-323）。factory 限制协议 tax 份额最多 75%、协议 swap fee 最多 5%（AngstromL2Factory.sol:66-69）。
- `currency0` 必须是原生币：`if (key.currency0.toId() != NATIVE_CURRENCY_ID) revert IncompatiblePoolConfiguration()`（AngstromL2.sol:249）。文档给的理由是 “so the hook can account for and settle the tax in the same currency the sequencer prices” [9]。v4 中原生币的地址是 `address(0)`，排序时总是 currency0，所以这条规则实际等于“池子必须是 原生币/X 交易对”（inferred）。
- 结算方式：`beforeSwap` 返回 `BeforeSwapDelta`，把税记成调用者对 currency0 的欠款，由 router 在 `settle` 时一起付清 [10]（AngstromL2.sol:368-379）。
- 链上实测（Base，块 52470456）：两个 hook 都是 `swapMEVTaxFactor=200`、`priorityFeeTaxFloor=1e7`（0.01 gwei）、`jitTaxEnabled=false`；factory 的 `defaultSwapMEVTaxFactor=99`、`defaultProtocolTaxFeeE6=100000`（10%）、`withdrawOnly=false` [20]。
- 部署：文档 deployments 页标题写 “L2 (Base & Unichain)”，但表格里只有 Base：factory `0x00000000a9B8c6f8E2693CeF534e16ED414fC4a7`；ETH/USDC hook `0x02C17501E53fBB7EB0E243c74AfC6a9e01C265CF`；ETH/cbBTC hook `0x9ABccA2Ee3dfbFb79C9C8EF11C77655DcA1365CF` [8]。`eth_getCode` 二分查找结果：factory 首次出现代码在 Base 块 51744410（2026-09-24 19:29 UTC），ETH/USDC hook 在块 51744416。旧 hook `0x3171D8f9…65cf` 首次出现在块 42542005（2026-02-23）[20]。同样的 factory 地址和两个 hook 地址在 Unichain（`mainnet.unichain.org`）上都返回 `0x`；`script/config.toml` 里 Unichain 一节也是整段注释掉的 [20]。
- 参数历史：`SWAP_TAXED_GAS` 在 2026-02-20 从 100_000 改成 120_000（提交 e3efbb5）；同一天的 c4fdc6d 把 tax factor 从常量改成可调变量。文档 flow-of-an-order 页仍在用旧名 `SWAP_TAXED_GAS` [10]。
- 安全设计：文档写 “The rollup sequencer cannot alter how the tax is applied. Inclusion or exclusion is the only lever” [11]。
- 审计：Cyfrin（2025-10-01，v2.1）、cergyk（2026-01-12 至 01-24，7 个问题，其中 H-1 是 afterSwap 重入导致奖励记账错误）（l2-angstrom/audit/）。

**不确定之处**
- Unichain 上是否用了别的地址部署：没有在官方页面找到 Unichain 地址，只能确认“文档声称的地址在 Unichain 上没有代码”。
- Base 上更早（2026-02 之前）是否还有其他版本，没有穷举。
- `withdrawOnly` 的描述有矛盾：文档说暂停 swap、LP 照常撤出 [11]；factory 代码注释说 “effectively deletes all liquidity provider's rewards”（AngstromL2Factory.sol:92-93），代码在 withdrawOnly 模式下撤 LP 时不发奖励（AngstromL2.sol:314）。也就是说本金能撤，累积的 tax 奖励拿不到。

## A-Q3 MEV tax 的理论前提（Paradigm “Priority Is All You Need”）

**答案**：Robinson & White（2024-06-04）提出，应用可以按交易的 priority fee 收取递增的 “MEV tax”，从而截留大部分 MEV。前提是出块方遵守 “competitive priority ordering”：按 priority fee 排序、不审查、交易内容保密、没有 last look。文章明确说，后三条目前只能靠信任单一 sequencer，无法去信任化地强制执行；在 L1 MEV-Boost 这类收益最大化的外包拍卖下，这些规则“likely not”被遵守。外部调研说的“MEV-tax 应用付给链的 tip 很低，区块满时会被挤出”在原文 “Full blocks” 一节**确有其事**。

**依据**（[13]）
- 开头：“could be used today on OP Stack L2s like OP Mainnet, Base, and Blast, because the block proposers on those chains follow a set of rules we call competitive priority ordering”。
- 机制举例：`applicationPriorityFee = 99 * proposerPriorityFee`，应用可以拿到 99% 的 MEV。脚注 4：合约无法知道交易最终用多少 gas，可以取上界（如乘以 30M）。Angstrom L2 改为固定的 120k “虚拟 gas”。
- 四条规则（原文 “Incentive incompatibility” 节）：Priority ordering；Censorship-resistance（区块没满、或者包含了出价更低的交易时，必须包含 t1）；Pre-transaction privacy；No last look。违反第二条的后果：“can avoid most MEV taxes by excluding competing transactions and submitting a zero-priority transaction”。“while the first property would be easy to enforce at the protocol layer, enforcing the other properties trustlessly is an open problem”。
- Full blocks 节原话：“Since transactions that interact with MEV-taxed applications are likely to have extremely low priority fees, those applications are likely to be crowded out by applications that don't use MEV taxes ... However, in a chain that uses an EIP-1559-like mechanism ... it should be relatively rare for blocks to be completely full.”
- 其他局限：落败的出价会变成链上 revert 交易，浪费 basefee、造成拥堵（Reverted transactions 节）；用户意图泄露可能导致税收不到的三明治攻击（Leaking of user intents 节）；抢跑用户交易的人可能不用交税。
- 文中把 Sorella's Angstrom 列为可能实现“去中心化 competitive priority ordering”的方案之一。

**不确定之处**：原文没有讨论 AA / 4337 批处理（文中 grep 不到 4337、bundler 等字样）。“为什么只在 L2 上成立”是由文中“单一 sequencer 可以承诺规则，L1 走 MEV-Boost 外包则不成立”推出的，原文没有直接写“只在 L2 成立”。

## A-Q4 Sorella 对 ASS 的定义

**答案**：Sorella 的博客 “A New Era of DeFi with App-Specific Sequencing”（Yuki Yuminaga，2024-10-14）定义 ASS：应用把自身状态的排序权交给指定的 sequencer 或质押验证者集合，由三个性质支撑：Restricted Sequencing Rights、App-Specific Mempools、Order-Agnostic Outcomes。这一概念源自 Matheus 的 VSR 论文和 Tarun 的后续工作。ACE（Bahrani & Neuder，2026-01-29）是更宽的能力范式：“applications are able to specify constraints on the ordering of transactions that interact with them”。ACE 把 Angstrom 归为第 (2.3) 类 “Batching by off-chain parties”，并且在引用 Sorella 的话时把原文的 “ASS” 换成了 “[ACE]”。所以 ASS 是 ACE 的一种实现路线。

**依据**
- 定义与三性质 [14 §How does ASS work?]；出处 [14 §Background]（arXiv 2209.15569 VSR、arXiv 2309.14201）。
- “Liveness and Trust Assumption”一节原话：“At its core, ASS is a form of partial block building where a sovereign application delegates the sequencing rights to a decentralized network of operators following a prescribed sequencing rule. Consequently, ASS inevitably involves external parties who introduce additional liveness and trust assumptions.” Liveness：“In the event of a liveness breach, such as a network partition, users may be unable to interact with parts of the application until valid consensus is restored. Sovereign applications can also limit the scope of contract state whose updates depend on their sequencers ... critical states, like deposited liquidity, can remain accessible even in the event of a sequencer failure.” Trust：可以用 PoS 这类密码经济手段，或 TEE/MPC 这类密码学手段 [14]。
- 博客原话：“Builders include the Angstrom bundle at any position in the block. The bundle just needs to pay the base fee for inclusion due to its order-agnostic construction.” [14]
- 组合性方面，博客承认 “lack of native composability”，提出的方向是 inclusion preconf、共享 app-specific sequencer、builder commitment [14 §The Composability Dilemma]。
- 文档里的同义定义：[15]（l1/core-mechanisms/app-specific-sequencing）。
- ACE 引用方式与对 Angstrom 的评价：pros 是“不改共识、可以内建抗审查（见白皮书 App. B.3）”；cons 是额外的 liveness 风险，以及只能做到“After-bundle” settlement，但可以 “permissionlessly remove liquidity” [12 §2.3]。

**不确定之处**：“ASS”一词最早是谁提出的，博客只写了概念来源（VSR），没有说明术语的首创者。

## A-Q5 UniswapX priority 路径

**答案**：`PriorityOrderReactor`（2024-07-25 加入，PR #252）把 Paradigm 的思路用在 intent 成交上，但不是收税：每 1 wei 优先费（扣除 `baselinePriorityFeeWei` 之后）× `mpsPerPriorityFeeWei`，按千万分之一（milli-bps）放大给用户的输出，或缩小用户的输入。出价最高、而且没有 revert 的填单交易拿到这笔订单，价值以更好成交价的形式返还给 swapper。官方文档**已标为 Deprecated**，原话是 “UniswapX has moved to the RFQ and exclusive Dutch auction model on all chains. Priority gas auctions are no longer a recommended integration path.” 文档没有给出更具体的原因。

**依据**
- `_getPriorityFee`：`tx.gasprice < block.basefee` 时 revert；结果为 `tx.gasprice - block.basefee - baseline`，下限 0（UniswapX/src/reactors/PriorityOrderReactor.sol:114-124@eb7ce07703）。
- 缩放：`MPS = 1e7`；输出 `amount * (MPS + priorityFee*mps) / MPS`（向上取整）；输入 `amount * (MPS - scalingFactor)/MPS`，scalingFactor ≥ MPS 时输入为 0（src/lib/PriorityFeeLib.sol:13-49）。输入和输出不能同时随优先费缩放（PriorityOrderReactor.sol:101-107）。
- 起拍块：`auctionStartBlock`，cosigner 可以把它提前（PriorityOrderReactor.sol:81-99）。
- 文档 [16]：“Only the fill transaction with the highest priority fee will win the order, all other transactions will revert onchain”；“Unichain supports specifying a target block and has revert protection”；reactor 地址为 Unichain `0x00000006021a6Bce796be7ba509BBBA71e956e37`、Base `0x000000001Ec5656dcdB24D90DFa42742738De729`。
- 仓库最后一次改这两个文件是 2024-08-02（审计修复），README 里仍然列着 Base reactor 地址（README.md:61）。

**不确定之处**：deprecated 的具体日期和动机（流动性、revert 成本、还是 filler 生态），文档里没有写，没有找到一手说明。

## A-Q6 FastLane Atlas

**答案**：Atlas 是一个“执行抽象”框架。dApp 部署 `DAppControl`，用它定义钩子和 callConfig；user 签 `UserOperation`；solver 提交 `SolverOperation`（带 bid）；auctioneer（可以是 user、solver 或任何人，由 callConfig 决定）收拢操作；bundler（`metacall` 的 `msg.sender`）把所有操作装进**一笔**交易。合约强制的是**这笔交易内部**的执行顺序：preOps → userOp → solverOps（按 bid 降序，或按给定顺序）→ allocateValue。这笔交易在区块里的位置不受控制。FastLane 的 Atlas 合约仓库没有归档，但最后一次提交是 2025-10-17（v1.6.4 审计修复）；FastLane 近期的活动集中在 Monad。**ACE 文中所说 “Atlas team ... DeFi-specific L2” 指的是 Ellipsis Labs 的 Atlas（SVM L2），和 FastLane Atlas 是两个不同的项目。**

**依据**
- `metacall(UserOperation, SolverOperation[], DAppOperation, gasRefundBeneficiary)`；`_bundler = msg.sender`（atlas/src/contracts/atlas/Atlas.sol:54-73@083dccd05a）。
- 执行阶段：`execute` 依次调用 `_executePreOpsCall` → `_executeUserOperation` → `_bidFindingIteration`（exPostBids，按 bid 排序，降序执行直到出现成功者）或 `_bidKnownIteration` → `_allocateValue`（Atlas.sol:205-252）。
- DAppControl 的钩子：`preOpsCall`、`preSolverCall`、`postSolverCall`、`allocateValueCall`（src/contracts/dapp/DAppControl.sol:66-120）。callConfig 包括 `userAuctioneer`、`solverAuctioneer`、`unknownAuctioneer`、`exPostBids`、`multipleSuccessfulSolvers`、`zeroSolvers` 等（src/contracts/types/ConfigTypes.sol:17-80）。
- 文档里的生命周期：user → Auctioneer → Operations Relay 广播给 solver → solver 回应 → Auctioneer 定标 → bundler 合成一笔交易上链 [17]。
- 部署：deployments.json 包含 MAINNET、BASE、ARBITRUM、POLYGON、BSC、BERACHAIN、HYPERLIQUID 及多个测试网。
- 维护状态：`gh api repos/FastLane-Labs/atlas` 显示 archived=false、pushed_at=2025-10-17。FastLane 组织下最近更新的仓库有 atlas-config（2026-07-30）、fastlane-contracts “for Monad”（2026-07-13）、monad-auction（2026-04-16）、atlas-on-monad（2025-12-12）[18]。
- Ellipsis Atlas：Medium “The Case for Opinionated Financial Infrastructure”（2025-03-13，经 RSS 取得）。原话：“For Atlas, Ellipsis Labs made specific technical decisions based on their experience building Phoenix”；“Atlas takes a different approach with permissioned sequencing ... The Atlas sequencer addresses this simply by prioritizing market maker cancellation requests”。“Introducing Atlas”（2024-09-11）：基于 SVM，“will be a Layer 2 blockchain that settles to Ethereum mainnet” [19]。ACE 文中 “similar argument” 链接的正是这篇文章 [12]。

**不确定之处**：FastLane Atlas 在各条主网上的实际使用量没有测；Chainlink SVR 是否仍然经由 Atlas，属于其他 lane。

## A-Q7 AA 交互（`tx.gasprice` 失真）

**答案**：Angstrom L2 的文档和代码**都没有提到** ERC-4337 / bundler / 7702（在仓库和文档全文中 grep 不到相关字样）。从机制推出：4337 下 hook 在执行阶段读到的 `tx.gasprice` 是 bundler 那笔 `handleOps` 外层交易的价格，同一 bundle 内的所有 UserOp 共用它。ERC-7562 只在**验证阶段**禁用 `GASPRICE` 操作码，执行阶段不禁用。另外，hook 对**每一次 swap 调用**都按整笔交易的优先费收一次全额税：同一笔交易里多次经过 Angstrom L2 池，或者一个 bundle 里有多个 UserOp swap，都会重复计税。EIP-7702 的账户如果自己发交易，读到的是自己的出价；如果由 relayer 代发，读到的就是 relayer 的出价。

**依据**
- 4337：bundler 把多个 UserOperation 打包成一笔 `handleOps` 交易 [21 §Abstract/L18]；ERC-7562 [OP-011] 禁用 `GASPRICE (0x3A)` 等环境类操作码，适用于验证规则 [22 §Opcode Rules]。
- hook 每次 swap 都独立调用 `_getSwapTaxAmount()`，读的是交易级 `tx.gasprice`，没有按交易去重（AngstromL2.sol:342、393、664-670）。
- Paradigm 原文没有讨论 AA [13]。

**不确定之处**：native AA（RIP-7560、EIP-8141 等）下 `GASPRICE` 的语义取决于具体规范，未核对，标为 speculative。bundler 在实际中是否会因为 MEV tax 而把高 tip 的 UserOp 拆开单独打包，没有数据。

---

## 对比表素材

| 实现 | 控制范围 | 强制力来源 | 组合性代价 | 违规后果 | 状态 |
|---|---|---|---|---|---|
| Angstrom L1 | 受保护 v4 池在每块“第一笔 swap”的权利，以及批内的撮合与价格 | 合约入口（hook 锁 + 节点白名单）加链下 BFT 式共识；罚没“初始不上线” | 批内与外部交易不原子；同块中 bundle 之后的交易可以使用新状态（after-bundle） | 锁住期间外部 swap revert；节点作恶靠共识验证与（未来的）罚没；以太坊 proposer 审查 bundle 不受约束 | 主网上线（hook 0x0000000aa232…fad4，实测活跃） |
| Angstrom L2 | 单个 v4 池的 swap / LP 修改所付的税；不控制顺序 | sequencer 的优先费排序（信任）加 hook 里的确定性税 | 同块原子，正常 v4 swap；router 要额外预付原生币税 | 没有“违规”：sequencer 只能决定包含或排除；排除、插队会让税收不上来，但应用无从惩罚 | Base 主网（2026-09-24 版）；Unichain 无法核实 |
| UniswapX PriorityOrderReactor | 单个 intent 的成交价 | 优先费排序加 reactor 价格公式 | 同块原子；落败者链上 revert | 同上，只能信任排序方 | 文档标 Deprecated；Base / Unichain 合约仍在 |
| FastLane Atlas | 一笔 metacall 内部的操作顺序与价值分配 | Atlas 合约加 DAppControl 钩子；链下 auctioneer / relay | 交易内原子；块内位置不受控 | 不合规的操作 revert，或被 graceful return | 合约最后更新 2025-10；多链部署；维护状态不明 |
| Ellipsis Atlas（L2） | 整条链的排序（撤单优先等） | 许可制 sequencer | 跨链（独立的 SVM L2） | 只能靠 sequencer 声誉 | 2025-02 公测；ACE 引用的是它 |

## 代码片段

1. **L1 swap 锁**：angstrom/contracts/src/modules/UnlockHook.sol:38-68@98216596f3。展示锁住时 revert、用节点签名在 swap 内解锁，以及解锁后改收 `unlockedFee`。
2. **L1 每块一次的节点锁与空块证明**：angstrom/contracts/src/modules/TopLevelAuth.sol:193-226@98216596f3。展示 `_lastBlockUpdated == block.number` 这一判定；它是全局变量，节点调用 `execute` 也走同一个锁。
3. **L1 bundle 执行顺序**：angstrom/contracts/src/Angstrom.sol:51-74@98216596f3。展示 `execute → UNI_V4.unlock → _updatePools → ToB → UserOrders → settle` 的流程。
4. **L1 LP 不受锁**：angstrom/contracts/src/modules/PoolUpdates.sol:50-56 与 123-128@98216596f3（与片段 1 对照：这里没有 `_isUnlocked`）。
5. **L2 MEV tax 公式**：l2-angstrom/src/AngstromL2.sol:102-112 加 195-215@81bd4189f4（常量、getSwapTaxAmount、JIT 1.5x）。**报告必选。**
6. **L2 读取优先费**：l2-angstrom/src/AngstromL2.sol:662-670@81bd4189f4（`tx.gasprice - block.basefee`，并说明 OP deposit 交易的边界情况）。
7. **L2 beforeSwap 与 maxSwapTax**：l2-angstrom/src/AngstromL2.sol:333-379@81bd4189f4（税记成 currency0 的 delta）。
8. **L2 税的分配**：l2-angstrom/src/AngstromL2.sol:465-472@81bd4189f4。
9. **L2 原生币限制**：l2-angstrom/src/AngstromL2.sol:249@81bd4189f4（单行，可以嵌进正文）。
10. **UniswapX 优先费换价格**：UniswapX/src/reactors/PriorityOrderReactor.sol:114-124 加 src/lib/PriorityFeeLib.sol:22-49@eb7ce07703。
11. **Atlas 交易内顺序**：atlas/src/contracts/atlas/Atlas.sol:228-242@083dccd05a。
12. **L1 节点多渠道提交**：angstrom/crates/types/src/submission/mod.rs:170-183@98216596f3。

## 图的素材

**Angstrom L1 交易流程（每个以太坊 slot）**
- 参与者：用户 / 做市商（签名限价单、cancel）、套利者（ToB bid）、Angstrom 验证者（2f+1 个）、leader、以太坊 builder / mempool、v4 PoolManager 加 Angstrom hook、外部交易者 / router。
- 步骤：① 订单与 cancel 发给任意节点，节点之间 gossip（Round 0）→ ② T−5Δ 时各节点签 Round-1 本地视图（含 `recent` 窗口）→ ③ 汇总 2/3（或 f+1）→ ④ leader 计算 ToB 胜者与统一清算价，生成 MergeDigest★，签名 → ⑤ leader 把 `execute(bundle)` 同时发给 mempool、合作 builder 和 MEV-Boost → ⑥ 块内：bundle 执行（`_nodeBundleLock` 写入块号 → AMM 先按 ToB 调整价格 → 用户订单按统一价成交 → 结算），池子随之解锁 → ⑦ 同块后续的外部 swap 按 unlockedFee 成交。
- 分支：A）没有 Angstrom 交易：用户在 hookData 里带空块证明，自己解锁；或者 builder 发现有人碰锁住的池，就把协议的空 batch 放进块。B）外部 swap 排在 bundle 前面：revert `CannotSwapWhileLocked`。C）节点停摆：swap 一直被锁；LP 增减流动性和 `withdraw` 内部余额不受影响。D）leader 不发、漏单：其他节点收集 f+1 签名证据，按设计罚没（白皮书写的是“初始不上线”）。

**Angstrom L2 交易流程（Base）**
- 参与者：套利者 / 普通用户、L2 sequencer（优先费排序）、router、PoolManager、AngstromL2 hook、factory（收协议份额）、池创建者、LP。
- 步骤：① 套利者设定 priority fee p 并提交 → ② sequencer 按 p 排序 → ③ router 调用 `PoolManager.swap` → ④ `beforeSwap`：tax = 200×120000×(p−0.01 gwei)，如果超过 `maxSwapTax` 就 revert；记成 currency0 的欠款 → ⑤ v4 正常执行 swap → ⑥ `afterSwap`：分给 creator、protocol（默认 10%）和 LP（mint 原生币，按补偿价 p* 分到各 tick）→ ⑦ router `settle` 支付原生币。
- 分支：p ≤ floor 时 tax=0（普通用户）；sequencer 自己用 0 tip 插队或排除竞争者，就绕过了税（Paradigm 列出的失效模式）；4337 bundle 用外层 gasprice 计税；同一笔交易里多次 swap 会多次计税。

## 对 Mantle 的启示（推论）

1. **（推论）MEV tax 在 Mantle 上可行，但要求 sequencer 公开承诺并能被验证地执行 competitive priority ordering。** Angstrom L2 的税完全建立在 sequencer 按 tip 排序、不插队、不偷看交易内容之上 [13]。Mantle 如果想吸引 Angstrom 类 hook，应当把这几条写成 sequencer / builder 的公开规则，并提供验证手段（例如 op-rbuilder 排序规则开源、TEE 证明），否则应用要自己承担 sequencer 风险。
2. **（推论）外层分配不能只比较付给 sequencer 的 tip。** Paradigm 的 Full blocks 节说明，MEV-tax 应用付给链的 tip 极低，区块满时会被挤出。在 Base 的实测参数下，套利者约 99.5% 的出价付给了应用（factor=200，tax 约为 sequencer tip 的 200 倍，前提是 swap 实际用 gas 约 120k）。Mantle 的分层调度器如果按 tip 分配容量，等于惩罚这类应用。
3. **（推论）原生币限制。** Angstrom L2 要求 `currency0` 是原生币，在 Mantle 上就是 MNT。这样只有 MNT/X 池能直接部署，稳定币对（USDC/USDT）要改 hook，例如改用 WMNT 计价，或者由 router 换汇。
4. **（推论）L1 式“合约锁加链下批处理”不需要改 sequencer，就能给 perps / DEX 提供撤单优先和统一价。** 代价是多一层链下网络的 liveness 依赖，以及外部组合只能在 after-bundle 时使用新状态。应当参考 Angstrom 的做法：把 LP 存取、内部余额提取这类关键状态留在锁外 [14 Liveness]。
5. **（推论）AA 与 MEV tax 冲突。** Mantle 如果推广 4337 / 7702 代付，同一 bundle 的 swap 会共用 bundler 的 tip 并重复计税。可以缓解的办法：bundler 对涉及 MEV-tax 池的 UserOp 单独打包；应用改按 UserOp 级别的出价字段计价（需要新的约定）；或者链层提供“per-call priority”这类上下文（speculative）。
6. **（推论）“撤单优先”最常见的落地方式是“许可制排序方加明文规则”**（Ellipsis Atlas、Hyperliquid）或“链下批处理”（Angstrom）。纯靠 tip 的方案（Solana Prop AMM 的低 CU 加 Jito tip）只是经济上的近似。Mantle 如果在 builder 层做 maker-first，会更接近 Ellipsis Atlas 的路线。

## 外部调研的修正

1. **“官方文档列出 Base、Unichain 部署”**：文档 intro 确实这么写 [9]，但 deployments 表只列了 Base 地址 [8]。同一个 factory 地址在 Unichain 上没有代码，仓库 config 里 Unichain 一节被注释掉 [20]。应改为：已核实的只有 Base；Unichain 无法证实。另外，现行 Base 部署是 2026-09-24 的新版本，并非一直存在。
2. **“池子的 swap 入口在每个区块开始时受到限制；授权批次执行之后，池子……解锁”**：大体正确，但代码里的锁是**全局**的（一次解锁对所有 Angstrom 池生效），并且存在“用户带空块签名自己解锁”的第三条路径，外部调研没有提 [1][3]。
3. **公式 `k × 120,000 × max(p − p0, 0)`**：正确。参数名为 `swapMEVTaxFactor`、`TAXED_GAS`、`priorityFeeTaxFloor`。需要补充的是：120,000 是 2026-02-20 从 100,000 改过来的；k 现在每个 hook 可调，Base 实测为 200，factory 默认 99，上限 9999；p0 上限 100 gwei，实测 0.01 gwei；还有一个 1.5 倍的 JIT tax，目前在 Base 上关闭 [20]。
4. **“tax 按配置在 LP、协议和池创建者之间分配”**：正确，但 JIT tax 100% 归协议；协议份额上限 75%、默认 10%；创建者份额上限 50%。
5. **Paradigm 的链接写成 `paradigm.xyz/writing/priority-is-all-you-need`**：可以访问（/2024/06/… 会 302 跳转到这里）。“区块满时被挤出”的说法在原文有，但原文同时补充说在 EIP-1559 链上“should be relatively rare”，外部调研省略了这一点。
6. **UniswapX deprecated**：正确，有原文可证 [16]。外部调研说文档“说明转向 RFQ 与 exclusive Dutch auction”，这也是对的，但文档**没有解释原因**。
7. **Atlas**：外部调研对 FastLane Atlas 角色的描述正确。但 brief 和任务说明里设想的“Atlas 转向 DeFi-specific L2”是混淆了两个项目：ACE 引用的 “opinionated financial infrastructure” 出自 **Ellipsis Labs 的 Atlas**（SVM L2），不是 FastLane [19][12]。
8. **AA 下 `tx.gasprice` 不是每个用户独立的出价**：判断正确，但外部调研引用的是 ERC-4337 原文，原文**没有**讨论 MEV tax。Angstrom L2 的文档和代码也没有涉及 AA。另外还漏了一点：同一笔交易里的多次 swap 会重复计税。

## 来源

1. **PRIMARY** SorellaLabs/angstrom@98216596f3 contracts/src（UnlockHook.sol、TopLevelAuth.sol、Angstrom.sol、PoolUpdates.sol、Settlement.sol、OrderInvalidation.sol），以及 contracts/docs（overview.md、known-issues.md、bundle-building.md）、crates/types/src/submission：证明 L1 锁、解锁、bundle 执行顺序、LP 不受锁、提交渠道。
2. **PRIMARY** https://docs.angstrom.xyz/l1/system-overview/architecture ：验证者网络职责、hook 锁、LP 不受影响。
3. **PRIMARY** https://docs.angstrom.xyz/l1/core-mechanisms/pool-unlock ：三种解锁场景、builder 条件包含、签名解锁带来的排序优势。
4. **PRIMARY** https://docs.angstrom.xyz/l1/Advanced/Consensus ：文档版共识流程（2/3 阈值、乐观提交、事后验证）。
5. **PRIMARY** Angstrom v1 Whitepaper（https://app.angstrom.xyz/whitepaper-v1.pdf ，PDF 创建于 2025-08-12，Srinivasan、Thouvenin、Moallemi）：链下 cancel、γ_post、错误分类、App. B.3 抗审查引理、脚注 15 罚没初始不上线。
6. **PRIMARY** https://docs.angstrom.xyz/l1/core-mechanisms/arbitrage-auction ：ToB 拍卖规则，收益分给 LP。
7. **PRIMARY** https://docs.angstrom.xyz/l1/core-mechanisms/batch-auction ：统一清算价、与顺序无关。
8. **PRIMARY** https://docs.angstrom.xyz/contracts/deployments ：L1 / L2 地址；L2 表中只有 Base。
9. **PRIMARY** https://docs.angstrom.xyz/l2/intro 与 /l2/architecture ：L2 机制、原生币要求的理由、“deployed on Base and Unichain”的说法。
10. **PRIMARY** https://docs.angstrom.xyz/l2/flow-of-an-order ：L2 swap 流程与 settle。
11. **PRIMARY** https://docs.angstrom.xyz/l2/arbitrage-auction ：公式、maxSwapTax、JIT tax、安全设计（sequencer 只能决定包含或排除）。
12. **PRIMARY** Bahrani & Neuder，“Application-controlled execution: A case study on cancel prioritization”，ethresear.ch/t/23977（2026-01-29）：ACE 定义、§2.3 对 Angstrom 的评价、引用 Ellipsis Atlas 文章、第 3 楼 Solana Prop AMM 引文。
13. **PRIMARY** Robinson & White，“Priority Is All You Need”，https://www.paradigm.xyz/writing/priority-is-all-you-need （2024-06-04）：MEV tax 的定义、四条规则、Full blocks 等局限。
14. **PRIMARY** Yuminaga，“A New Era of DeFi with App-Specific Sequencing”，https://sorellalabs.xyz/writing/a-new-era-of-defi-with-ass （2024-10-14，从页面 `__NEXT_DATA__` 取出 MDX 原文）：ASS 定义、三性质、Liveness / Trust 原话。
15. **PRIMARY** https://docs.angstrom.xyz/l1/core-mechanisms/app-specific-sequencing ：文档版 ASS 定义。
16. **PRIMARY** https://developers.uniswap.org/docs/liquidity/uniswapx/filling/priority-chain/filling-on-op-stack ：Deprecated 说明、机制、Base / Unichain reactor 地址。
17. **PRIMARY** https://docs.atlasevm.com/atlas/getting-started/protocol-overview ：Atlas 角色与生命周期。
18. **PRIMARY** FastLane-Labs/atlas@083dccd05a（Atlas.sol、DAppControl.sol、ConfigTypes.sol、deployments.json），以及 `gh api` 查到的仓库与组织状态：metacall 流程、部署链、维护状态。
19. **PRIMARY** Ellipsis Labs Atlas Medium RSS（https://atlasxyz.medium.com/feed ）：“The Case for Opinionated Financial Infrastructure”（2025-03-13）、“Atlas Public Testnet is Live”（2025-02-04）、“Introducing Atlas”（2024-09-11），证明 ACE 所指的 Atlas 是 Ellipsis 的 SVM L2。（文章 HTML 页面被 Cloudflare 拦截，内容取自 RSS。）
20. **PRIMARY** 链上实测（2026-10-11）：`cast call <hook> "swapMEVTaxFactor()(uint256)" --rpc-url https://mainnet.base.org` → 200；`priorityFeeTaxFloor()` → 1e7；`jitTaxEnabled()` → false；factory `defaultSwapMEVTaxFactor()` → 99、`defaultProtocolTaxFeeE6()` → 100000、`withdrawOnly()` → false；`eth_getCode` 二分查找得到 factory 首次出现于块 51744410（2026-09-24 19:29:27 UTC）、hook 于块 51744416、旧 hook 0x3171D8f9…65cf 于块 42542005（2026-02-23）；Unichain RPC 上 factory 与 hook 都返回 `0x`；L1 `extsload(3)` 的低 64 位为 26169932，当时 head 为 26169933。另见 l2-angstrom@81bd4189f4 的 script/config.toml 与 git log（e3efbb5、c4fdc6d、bb724a6、81bd418）。
21. **PRIMARY** ERC-4337（ethereum/ERCs master，ERCS/erc-4337.md）：bundler 把 UserOps 打包进一笔 handleOps 交易。
22. **PRIMARY** ERC-7562（ERCS/erc-7562.md §Opcode Rules OP-011）：验证阶段禁用 GASPRICE。
23. **PRIMARY** Uniswap/UniswapX@eb7ce07703（PriorityOrderReactor.sol、PriorityFeeLib.sol、README.md:61、git log）：priority 订单机制与引入时间。
24. **PRIMARY** l2-angstrom/audit/2026-01-26-cergyk-sorella-l2-angstrom.md 与 2025-10-01-cyfrin-…：审计时间与发现。

## 开放问题

1. Unichain 上是否用其他地址部署了 Angstrom L2？文档宣称有，链上（文档地址）没有。
2. Angstrom L1 的罚没合约是否已上线？共识实现采用文档的 2/3 阈值，还是白皮书的 f+1 / 2f+1 模型？
3. 现行 Base 部署（2026-09-24）的 TVL / 成交量，以及 MEV tax 实际收入，未测。
4. UniswapX 弃用 priority 路径的具体原因与日期。
5. FastLane Atlas 是否仍有主网 DAppControl 在活跃使用（例如 Chainlink SVR 通过 Atlas 的路径），需要 SVR lane 确认。
6. native AA（RIP-7560、EIP-8141）交易中 `GASPRICE` 的语义，以及 MEV tax 应用如何按 UserOp 计价。
7. Angstrom L1 的 cancel 在链下共识中具体的优先规则（白皮书 Fig. 4 / §5），没有逐行核对 matching-engine 代码。

## 台账

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| A1 | Angstrom L1 hook 在未解锁时 beforeSwap revert `CannotSwapWhileLocked`，可以用 hookData 里的节点签名当场解锁 | angstrom/contracts/src/modules/UnlockHook.sol:38-57@98216596f3 | observed |
| A2 | 解锁状态由全局 `_lastBlockUpdated == block.number` 判定，一次解锁对全部 Angstrom 池生效（文档写的是“specific pool”） | TopLevelAuth.sol:58,212-214@98216596f3；docs pool-unlock 页 | observed |
| A3 | 每块只有一个节点能调用 `execute`（`_nodeBundleLock`），空 payload 等于只解锁 | TopLevelAuth.sol:222-226；Angstrom.sol:51-56@98216596f3 | observed |
| A4 | bundle 执行顺序：AMM 更新 → ToB 订单 → 用户订单 → 结算 | Angstrom.sol:68-74@98216596f3；contracts/docs/overview.md:91-101 | observed |
| A5 | LP 增减流动性与内部余额提取不受 swap 锁限制 | PoolUpdates.sol:50-155、Settlement.sol:38-46@98216596f3；docs l1 architecture “at any time” | observed |
| A6 | 同一 bundle 内同一交易对的用户订单使用同一个价格，只检查 minPrice；跨交易对不保证一致 | Angstrom.sol:202-213；contracts/docs/known-issues.md:16-18@98216596f3 | observed |
| A7 | 解锁后的 swap 收更高的 unlockedFee 与 protocolUnlockedFee（γ_post > γ） | UnlockHook.sol:62,83@98216596f3；白皮书 §3 pool unlock | observed |
| A8 | cancel 是链下订单类型，零 gas；在 Round 1 之前提交，且没有共识错误时，保证本 slot 生效 | 白皮书 §1 引言（来源 [5]） | observed |
| A9 | 白皮书 App. B.3.1 Lemma B.1：诚实验证者在 Round 0 广播的订单必然进入 MergeDigest★ | 来源 [5] App. B.3.1 | observed |
| A10 | 白皮书脚注 15：罚没在初始发布时不上线 | 来源 [5] App. B.2 脚注 15 | observed |
| A11 | 节点同时向公共 mempool、合作 builder（angstrom_submitBundle，priority fee=0）和 MEV-Boost eth_sendBundle 提交 | crates/types/src/submission/mod.rs:170-183、angstrom.rs:60-61,96、mev_boost.rs:94@98216596f3 | observed |
| A12 | L1 主网 hook 0x0000000aa232009084Bd71A5797d089AA4Edfad4 在 2026-10-11 仍在运行（上一块刚解锁） | docs contracts/deployments；`cast call … extsload(3)` 低 64 位 = 26169932，head = 26169933（来源 [20]） | observed |
| A13 | 节点停摆时 swap 一直被锁，没有合约内的自动兜底解锁；LP 资产可以撤出 | 由 A1、A3、A5 推出：解锁只能由节点调用或节点签名完成，LP 路径不检查锁 | inferred |
| A14 | Sorella 定义 ASS 的三性质：Restricted Sequencing Rights、App-Specific Mempools、Order-Agnostic Outcomes | 来源 [14] §How does ASS work? | observed |
| A15 | Sorella 原话：“ASS is a form of partial block building … inevitably involves external parties who introduce additional liveness and trust assumptions” | 来源 [14] §Liveness and Trust Assumption | observed |
| A16 | ACE 把 Angstrom 归为 “Batching by off-chain parties”，引用 Sorella 原话时把 ASS 换成了 [ACE] | 来源 [12] §2.3 | observed |
| A17 | ASS 是 ACE 范式下“链下批处理加合约入口”这一实现路线 | 由 A14、A16 推出：ACE 定义更宽，并把 Angstrom 列为其中一类 | inferred |
| A18 | Angstrom L2 的税为 swapMEVTaxFactor × 120_000 × (priorityFee − priorityFeeTaxFloor)，priorityFee ≤ floor 时为 0 | l2-angstrom/src/AngstromL2.sol:105,195-200@81bd4189f4 | observed |
| A19 | priorityFee = tx.gasprice − block.basefee，gasprice ≤ basefee（estimateGas、OP deposit 交易）时取 0 | AngstromL2.sol:662-666@81bd4189f4 | observed |
| A20 | 参数上限：factor ≤ 9999，floor ≤ 100 gwei，创建者 tax 份额 ≤ 50%，协议 tax 份额 ≤ 75%，协议 swap fee ≤ 5% | AngstromL2.sol:106-112；AngstromL2Factory.sol:66-69@81bd4189f4 | observed |
| A21 | JIT tax 系数为 swap 系数的 1.5 倍，收入 100% 归协议 | AngstromL2.sol:213-215,296-300,319-323@81bd4189f4 | observed |
| A22 | `maxSwapTax` 通过 hookData 传入，超过就 revert；2026-03-25 加入 | AngstromL2.sol:342-346@81bd4189f4；git 提交 bb724a6 | observed |
| A23 | 池子 currency0 必须是原生币，否则 initializeNewPool revert | AngstromL2.sol:249@81bd4189f4；docs l2/architecture “Native-token denomination” | observed |
| A24 | tax 先扣 creator 与 protocol 份额，剩下的以原生币 mint 给 LP，按补偿价分到各 tick | AngstromL2.sol:465-472,403-415@81bd4189f4；docs l2/advanced/mev-tax-distribution | observed |
| A25 | TAXED_GAS 于 2026-02-20 从 100_000 改为 120_000；同日 factor 改为可调 | l2-angstrom git 提交 e3efbb5、c4fdc6d | observed |
| A26 | Base 实测：两个 hook 的 factor=200、floor=0.01 gwei、JIT 关闭；factory 默认 factor=99、默认协议 tax 份额 10% | 来源 [20] cast call（Base 块 52470456） | observed |
| A27 | 现行 Base factory 0x00000000a9B8…fC4a7 于 2026-09-24（块 51744410）部署，ETH/USDC hook 于块 51744416 部署；旧 hook 0x3171D8f9…65cf 于 2026-02-23 部署 | 来源 [20] eth_getCode 二分查找；script/config.toml 的 diff（81bd418） | observed |
| A28 | 文档称 L2 部署在 Base 和 Unichain，但文档里的 factory 与 hook 地址在 Unichain 上都没有代码 | docs l2/intro；docs contracts/deployments；来源 [20] Unichain eth_getCode = 0x；config.toml 中 Unichain 一节被注释 | observed |
| A29 | 每次 swap 调用都按整笔交易的优先费独立计全额税，同一笔交易里多次 swap 会重复计税 | 由 AngstromL2.sol:342,393,668-670 推出：每次 hook 调用都重算 `_getSwapTaxAmount()`，没有交易级去重 | inferred |
| A30 | 4337 bundle 内的 UserOp swap 共用 bundler 的 tx.gasprice 计税，用户无法单独出价 | 由 来源 [21]（handleOps 单笔交易）、来源 [22] OP-011（只在验证阶段禁用 GASPRICE）、A19 推出 | inferred |
| A31 | Angstrom L2 的文档与代码都没有提到 4337、bundler、7702 | `rg -i "4337\|bundler\|7702\|userop"` 在 l2-angstrom（排除 lib）和抓取的全部 docs 文本中均无相关匹配 | observed |
| A32 | native AA（RIP-7560 / EIP-8141）下 GASPRICE 的语义可能让 per-op 出价成为可能 | 未核对规范；推测 | speculative |
| A33 | Paradigm 的 competitive priority ordering 四条规则：priority ordering、censorship-resistance、pre-transaction privacy、no last look；后三条无法去信任化强制执行 | 来源 [13] §Incentive incompatibility | observed |
| A34 | Paradigm 承认 MEV-tax 应用在区块满时会被挤出，但认为在 EIP-1559 链上很少见 | 来源 [13] §Full blocks | observed |
| A35 | Paradigm 称 MEV tax 当时（2024-06）可以在 OP Mainnet、Base、Blast 上使用；L1 MEV-Boost 下规则“likely not”被遵守 | 来源 [13] §Introduction、§Incentive incompatibility | observed |
| A36 | 在 Base 现行参数下（factor 200、swap 实际用 gas 约 120k），套利者出价约 99.5% 付给应用 | 由 A18、A26 加 AngstromL2.sol:128-129 注释（税率 = factor/(factor+1)）推出 | inferred |
| A37 | UniswapX PriorityOrderReactor：每 wei 优先费（扣 baseline 后）× mpsPerPriorityFeeWei，以 1e-7 的粒度改善成交价；gasprice < basefee 时 revert | UniswapX/src/reactors/PriorityOrderReactor.sol:114-124、src/lib/PriorityFeeLib.sol:13-49@eb7ce07703 | observed |
| A38 | UniswapX 文档把 priority 路径标为 Deprecated，“moved to the RFQ and exclusive Dutch auction model on all chains”，没有给出原因 | 来源 [16] Deprecated 提示框 | observed |
| A39 | UniswapX priority reactor 地址：Base 0x000000001Ec5656dcdB24D90DFa42742738De729，Unichain 0x00000006021a6Bce796be7ba509BBBA71e956e37；2024-07-25 引入 | 来源 [16] 地址表；UniswapX README.md:61；git a21d767 | observed |
| A40 | Atlas metacall 在一笔交易内按 preOps → userOp → solverOps（按 bid 排序或给定顺序）→ allocateValue 执行，bundler 就是 msg.sender | atlas/src/contracts/atlas/Atlas.sol:54-73,228-242@083dccd05a | observed |
| A41 | Atlas 只控制交易内部顺序，不控制交易在区块里的位置 | 由 A40 推出：合约里没有任何块位置约束，块内排序由链的 builder 决定 | inferred |
| A42 | FastLane Atlas 仓库没有归档，最后一次提交在 2025-10-17（v1.6.4）；FastLane 近期活动集中在 Monad | `gh api repos/FastLane-Labs/atlas`；`gh api orgs/FastLane-Labs/repos?sort=pushed` | observed |
| A43 | ACE 中所说 “Atlas team … DeFi-specific L2” 指 Ellipsis Labs 的 Atlas（SVM、结算到以太坊的 L2，许可制 sequencer 优先处理做市商撤单），不是 FastLane Atlas | 来源 [12] 链接；来源 [19] RSS 三篇文章 | observed |
| A44 | L2 文档说 sequencer 只能决定包含或排除，不能改变税的计算方式 | 来源 [11] §Safety Considerations | observed |
| A45 | withdrawOnly 模式下撤 LP 不发放累积奖励（factory 注释称“deletes all liquidity provider's rewards”），与文档“LP 提取不受影响”的说法有出入 | AngstromL2Factory.sol:92-93、AngstromL2.sol:314@81bd4189f4；来源 [11] | observed |

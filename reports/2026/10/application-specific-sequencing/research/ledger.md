# 论断台账

每条会出现在 explainer 里的论断，都要在这里有一行。
类型：observed（直接观察到，有一手证据）/ inferred（由证据推出）/ speculative（推测，需在页面上标明）。

本表合并五路调研与主会话的设计综合。前缀对应分册，证据里的 `[n]` 指该分册“来源”一节的第 n 条：
- **A** → `notes-angstrom.md`（Angstrom、MEV tax、UniswapX、Atlas）
- **B** → `notes-builder.md`（op-rbuilder / rollup-boost / Unichain、Timeboost、PUR、BAP-710、Express Relay、SVR）
- **X** → `notes-other.md`（BAM MPP、AMQ、Prop AMM、Hyperliquid、Block SDK、dYdX、Injective、Sui / Penumbra）
- **L** → `notes-theory.md`（Tempo / BSC payment lane、ACE 原文、PEPC / EVM 原生排序 / FOCIL、边界问题、Mantle fair sequencing）
- **M** → `notes-mantle.md`（Mantle 网络现状、出块路径、preconf 车道、路线图、插入点）
- **D** → `notes.md` §设计综合（主会话：由上述论断推出的 Mantle 方案，均为 inferred / speculative）

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| A1 | Angstrom L1 hook 在未解锁时 beforeSwap revert `CannotSwapWhileLocked`，可以用 hookData 里的节点签名当场解锁 | angstrom/contracts/src/modules/UnlockHook.sol:38-57@98216596f3 | observed | F1、F2 |
| A2 | 解锁状态由全局 `_lastBlockUpdated == block.number` 判定，一次解锁对全部 Angstrom 池生效（文档写的是“specific pool”） | TopLevelAuth.sol:58,212-214@98216596f3；docs pool-unlock 页 | observed | F2 |
| A3 | 每块只有一个节点能调用 `execute`（`_nodeBundleLock`），空 payload 等于只解锁 | TopLevelAuth.sol:222-226；Angstrom.sol:51-56@98216596f3 | observed | F2 |
| A4 | bundle 执行顺序：AMM 更新 → ToB 订单 → 用户订单 → 结算 | Angstrom.sol:68-74@98216596f3；contracts/docs/overview.md:91-101 | observed | F2 |
| A5 | LP 增减流动性与内部余额提取不受 swap 锁限制 | PoolUpdates.sol:50-155、Settlement.sol:38-46@98216596f3；docs l1 architecture “at any time” | observed | F2 |
| A6 | 同一 bundle 内同一交易对的用户订单使用同一个价格，只检查 minPrice；跨交易对不保证一致 | Angstrom.sol:202-213；contracts/docs/known-issues.md:16-18@98216596f3 | observed |  |
| A7 | 解锁后的 swap 收更高的 unlockedFee 与 protocolUnlockedFee（γ_post > γ） | UnlockHook.sol:62,83@98216596f3；白皮书 §3 pool unlock | observed |  |
| A8 | cancel 是链下订单类型，零 gas；在 Round 1 之前提交，且没有共识错误时，保证本 slot 生效 | 白皮书 §1 引言（来源 [5]） | observed | F2 |
| A9 | 白皮书 App. B.3.1 Lemma B.1：诚实验证者在 Round 0 广播的订单必然进入 MergeDigest★ | 来源 [5] App. B.3.1 | observed | F2 |
| A10 | 白皮书脚注 15：罚没在初始发布时不上线 | 来源 [5] App. B.2 脚注 15 | observed | F2 |
| A11 | 节点同时向公共 mempool、合作 builder（angstrom_submitBundle，priority fee=0）和 MEV-Boost eth_sendBundle 提交 | crates/types/src/submission/mod.rs:170-183、angstrom.rs:60-61,96、mev_boost.rs:94@98216596f3 | observed |  |
| A12 | L1 主网 hook 0x0000000aa232009084Bd71A5797d089AA4Edfad4 在 2026-10-11 仍在运行（上一块刚解锁） | docs contracts/deployments；`cast call … extsload(3)` 低 64 位 = 26169932，head = 26169933（来源 [20]） | observed | F2、总览 C |
| A13 | 节点停摆时 swap 一直被锁，没有合约内的自动兜底解锁；LP 资产可以撤出 | 由 A1、A3、A5 推出：解锁只能由节点调用或节点签名完成，LP 路径不检查锁 | inferred | F2 |
| A14 | Sorella 定义 ASS 的三性质：Restricted Sequencing Rights、App-Specific Mempools、Order-Agnostic Outcomes | 来源 [14] §How does ASS work? | observed | 总览 E |
| A15 | Sorella 原话：“ASS is a form of partial block building … inevitably involves external parties who introduce additional liveness and trust assumptions” | 来源 [14] §Liveness and Trust Assumption | observed |  |
| A16 | ACE 把 Angstrom 归为 “Batching by off-chain parties”，引用 Sorella 原话时把 ASS 换成了 [ACE] | 来源 [12] §2.3 | observed |  |
| A17 | ASS 是 ACE 范式下“链下批处理加合约入口”这一实现路线 | 由 A14、A16 推出：ACE 定义更宽，并把 Angstrom 列为其中一类 | inferred |  |
| A18 | Angstrom L2 的税为 swapMEVTaxFactor × 120_000 × (priorityFee − priorityFeeTaxFloor)，priorityFee ≤ floor 时为 0 | l2-angstrom/src/AngstromL2.sol:105,195-200@81bd4189f4 | observed | F1、F3 |
| A19 | priorityFee = tx.gasprice − block.basefee，gasprice ≤ basefee（estimateGas、OP deposit 交易）时取 0 | AngstromL2.sol:662-666@81bd4189f4 | observed | F3 |
| A20 | 参数上限：factor ≤ 9999，floor ≤ 100 gwei，创建者 tax 份额 ≤ 50%，协议 tax 份额 ≤ 75%，协议 swap fee ≤ 5% | AngstromL2.sol:106-112；AngstromL2Factory.sol:66-69@81bd4189f4 | observed |  |
| A21 | JIT tax 系数为 swap 系数的 1.5 倍，收入 100% 归协议 | AngstromL2.sol:213-215,296-300,319-323@81bd4189f4 | observed |  |
| A22 | `maxSwapTax` 通过 hookData 传入，超过就 revert；2026-03-25 加入 | AngstromL2.sol:342-346@81bd4189f4；git 提交 bb724a6 | observed |  |
| A23 | 池子 currency0 必须是原生币，否则 initializeNewPool revert | AngstromL2.sol:249@81bd4189f4；docs l2/architecture “Native-token denomination” | observed | F3 |
| A24 | tax 先扣 creator 与 protocol 份额，剩下的以原生币 mint 给 LP，按补偿价分到各 tick | AngstromL2.sol:465-472,403-415@81bd4189f4；docs l2/advanced/mev-tax-distribution | observed |  |
| A25 | TAXED_GAS 于 2026-02-20 从 100_000 改为 120_000；同日 factor 改为可调 | l2-angstrom git 提交 e3efbb5、c4fdc6d | observed |  |
| A26 | Base 实测：两个 hook 的 factor=200、floor=0.01 gwei、JIT 关闭；factory 默认 factor=99、默认协议 tax 份额 10% | 来源 [20] cast call（Base 块 52470456） | observed | F3、总览 D |
| A27 | 现行 Base factory 0x00000000a9B8…fC4a7 于 2026-09-24（块 51744410）部署，ETH/USDC hook 于块 51744416 部署；旧 hook 0x3171D8f9…65cf 于 2026-02-23 部署 | 来源 [20] eth_getCode 二分查找；script/config.toml 的 diff（81bd418） | observed | F3、总览 C |
| A28 | 文档称 L2 部署在 Base 和 Unichain，但文档里的 factory 与 hook 地址在 Unichain 上都没有代码 | docs l2/intro；docs contracts/deployments；来源 [20] Unichain eth_getCode = 0x；config.toml 中 Unichain 一节被注释 | observed | F3 |
| A29 | 每次 swap 调用都按整笔交易的优先费独立计全额税，同一笔交易里多次 swap 会重复计税 | 由 AngstromL2.sol:342,393,668-670 推出：每次 hook 调用都重算 `_getSwapTaxAmount()`，没有交易级去重 | inferred | O |
| A30 | 4337 bundle 内的 UserOp swap 共用 bundler 的 tx.gasprice 计税，用户无法单独出价 | 由 来源 [21]（handleOps 单笔交易）、来源 [22] OP-011（只在验证阶段禁用 GASPRICE）、A19 推出 | inferred | O |
| A31 | Angstrom L2 的文档与代码都没有提到 4337、bundler、7702 | `rg -i "4337\|bundler\|7702\|userop"` 在 l2-angstrom（排除 lib）和抓取的全部 docs 文本中均无相关匹配 | observed |  |
| A32 | native AA（RIP-7560 / EIP-8141）下 GASPRICE 的语义可能让 per-op 出价成为可能 | 未核对规范；推测 | speculative |  |
| A33 | Paradigm 的 competitive priority ordering 四条规则：priority ordering、censorship-resistance、pre-transaction privacy、no last look；后三条无法去信任化强制执行 | 来源 [13] §Incentive incompatibility | observed | F3 |
| A34 | Paradigm 承认 MEV-tax 应用在区块满时会被挤出，但认为在 EIP-1559 链上很少见 | 来源 [13] §Full blocks | observed | F3 |
| A35 | Paradigm 称 MEV tax 当时（2024-06）可以在 OP Mainnet、Base、Blast 上使用；L1 MEV-Boost 下规则“likely not”被遵守 | 来源 [13] §Introduction、§Incentive incompatibility | observed | 总览 E、K |
| A36 | 在 Base 现行参数下（factor 200、swap 实际用 gas 约 120k），套利者出价约 99.5% 付给应用 | 由 A18、A26 加 AngstromL2.sol:128-129 注释（税率 = factor/(factor+1)）推出 | inferred | F3、总览 D |
| A37 | UniswapX PriorityOrderReactor：每 wei 优先费（扣 baseline 后）× mpsPerPriorityFeeWei，以 1e-7 的粒度改善成交价；gasprice < basefee 时 revert | UniswapX/src/reactors/PriorityOrderReactor.sol:114-124、src/lib/PriorityFeeLib.sol:13-49@eb7ce07703 | observed |  |
| A38 | UniswapX 文档把 priority 路径标为 Deprecated，“moved to the RFQ and exclusive Dutch auction model on all chains”，没有给出原因 | 来源 [16] Deprecated 提示框 | observed | K |
| A39 | UniswapX priority reactor 地址：Base 0x000000001Ec5656dcdB24D90DFa42742738De729，Unichain 0x00000006021a6Bce796be7ba509BBBA71e956e37；2024-07-25 引入 | 来源 [16] 地址表；UniswapX README.md:61；git a21d767 | observed |  |
| A40 | Atlas metacall 在一笔交易内按 preOps → userOp → solverOps（按 bid 排序或给定顺序）→ allocateValue 执行，bundler 就是 msg.sender | atlas/src/contracts/atlas/Atlas.sol:54-73,228-242@083dccd05a | observed | F1、K |
| A41 | Atlas 只控制交易内部顺序，不控制交易在区块里的位置 | 由 A40 推出：合约里没有任何块位置约束，块内排序由链的 builder 决定 | inferred | K |
| A42 | FastLane Atlas 仓库没有归档，最后一次提交在 2025-10-17（v1.6.4）；FastLane 近期活动集中在 Monad | `gh api repos/FastLane-Labs/atlas`；`gh api orgs/FastLane-Labs/repos?sort=pushed` | observed | K |
| A43 | ACE 中所说 “Atlas team … DeFi-specific L2” 指 Ellipsis Labs 的 Atlas（SVM、结算到以太坊的 L2，许可制 sequencer 优先处理做市商撤单），不是 FastLane Atlas | 来源 [12] 链接；来源 [19] RSS 三篇文章 | observed | K |
| A44 | L2 文档说 sequencer 只能决定包含或排除，不能改变税的计算方式 | 来源 [11] §Safety Considerations | observed |  |
| A45 | withdrawOnly 模式下撤 LP 不发放累积奖励（factory 注释称“deletes all liquidity provider's rewards”），与文档“LP 提取不受影响”的说法有出入 | AngstromL2Factory.sol:92-93、AngstromL2.sol:314@81bd4189f4；来源 [11] | observed |  |
| B1 | op-rbuilder 使用的交易池类型是 `OpTransactionPool`，其排序固定为 `CoinbaseTipOrdering` | op-rbuilder/crates/op-rbuilder/src/pool/builder.rs:81@4f1bec3；reth/op-reth/crates/txpool/src/lib.rs:33-37@f022de0f62 | observed | F4 |
| B2 | `CoinbaseTipOrdering` 的优先级等于有效小费 `effective_tip_per_gas(base_fee)`；同优先级按 `submission_id` 早者在前 | reth/patches/reth-transaction-pool/src/ordering.rs:61-86、pool/pending.rs:649-657@f022de0f62 | observed | F4 |
| B3 | op-rbuilder 的默认排序是“小费优先、同价 FIFO”，不是 FCFS | 由 B1、B2 推出：池类型固定 + 排序函数 | inferred | F4 |
| B4 | 每个 flashblock 都重新从池取 best 迭代器，并跳过已提交 / 已排除的交易 | builder/candidate.rs:210-219、builder/best_txs.rs:94-136@4f1bec3 | observed | F4、F11 |
| B5 | 每个 flashblock 的 gas 预算 = block_gas_limit / flashblock 数，目标逐块累加 | builder/payload.rs:735、:242@4f1bec3 | observed | F4、F11 |
| B6 | 优先排序只在单个 flashblock 的候选集内成立；已发布的 flashblock 不会被后到的高小费交易越过 | 由 B4、B5 推出 | inferred | F4 |
| B7 | op-rbuilder CLI 默认 chain block time 1000ms、flashblock 间隔 250ms；规范默认 FLASHBLOCKS_TIME 200ms，例子为 2s/200ms=10 | args/op.rs:35-40,214-219@4f1bec3；rollup-boost/specs/flashblocks.md:105-106@87589f8 | observed | L |
| B8 | 选择循环依次做 conditional 检查、gas / DA / 大小限额、拒绝 blob 与 deposit、地址限流，执行后若超过 max_gas_per_txn 或 revert-protected 交易回滚则不提交 | builder/context.rs:392-505@4f1bec3 | observed |  |
| B9 | 地址 gas 限流默认关闭，每地址桶 10,000,000 gas、每块回填 1,000,000；计算时间限流桶 50ms、每块回填 10ms；被拒的模拟也计入额度 | limiter/args.rs:4-56；context.rs “Declined simulations still consume sender budget”@4f1bec3 | observed | L |
| B10 | `eth_sendBundle` 只接受 1 笔交易，区块范围最多 10 块，可指定 flashblock 范围；仅在 `--builder.enable-revert-protection`（默认 false）开启时提供 | docs/eth_sendBundle.md；primitives/bundle.rs:12,33-111；args/op.rs:68-69@4f1bec3 | observed |  |
| B11 | backrun bundle 默认关闭；strict 模式要求 backrun 的优先费等于目标交易 | backrun_bundle/args.rs:1-23；builder/context.rs:687-732@4f1bec3 | observed |  |
| B12 | rollup-boost 用本地 EL 的 `engine_newPayload` 校验 builder 区块，无效时回退本地区块 | rollup-boost/crates/rollup-boost/src/server.rs:380-401@87589f8；README “Core System Workflow” | observed | F4 |
| B13 | rollup-boost 可选 GasUsed 策略：builder 区块 gas 低于本地块 10% 时选本地块；DryRun 模式总是用本地块 | selection.rs:4-14；server.rs:451-461@87589f8 | observed |  |
| B14 | rollup-boost 源码中没有任何交易排序规则检查 | `rg -n -i "priority\|tip\|sort\|ordering" crates --type rust` 只命中原子 Ordering 与 service.rs:298 flashblock 按 index 排序@87589f8 | observed | F4、F12 |
| B15 | rollup-boost 回退到本地块时，链上无法区分，应用级排序会被静默取消 | 由 B12、B14 推出 | inferred | F4 |
| B16 | Unichain 自 2025-05-01 在 TEE 内建块，官方称“纯按优先费排序”，并提供私有加密 mempool 与 revert protection | blog.uniswap.org/rollup-boost-is-live-on-unichain 正文 “What this means”；Uniswap Developers 变更日志 “Effective: May 1, 2025” | observed | F4 |
| B17 | 2025-05 官方写明公开 attestation 与 Flashbots attestation API “will go live soon” | 同上博客 “Fair transaction ordering”“How it works” 两段 | observed | F4 |
| B18 | Unichain 自 2025-08-14 上线 200ms Flashblocks，主链出块 1 秒，官方称每个子块在 TEE 内按优先费排序（“provable ordering”） | blog.uniswap.org/flashblocks-are-live；变更日志 “Effective: August 14, 2025”；developers.uniswap.org/docs/unichain FAQ | observed | F4 |
| B19 | Flashtestations 的块证明只检查调用者是否是获准 TEE 策略；规范注明合约无法在链上校验 blockContentHash | rollup-boost/specs/flashtestations.md:760-831@87589f8 | observed | F4 |
| B20 | Unichain 的“可验证优先排序”是 TEE 信任 + 代码度量，不是排序谓词证明，也不证明输入集完整 | 由 B17、B19 推出 | inferred | F4 |
| B21 | mantle-xyz/op-rbuilder 的 main@d89d5e7 是上游 flashbots/op-rbuilder 的祖先提交，没有 Mantle 专属提交 | `git -C op-rbuilder merge-base --is-ancestor d89d5e7 4f1bec3` 为真；`git log` 前 80 条作者均为上游开发者 | observed |  |
| B22 | Mantle 分支 feat/mantle-arsia 的 d145b90516（2026-05-14）在选择循环中过滤 `max_fee_per_gas < min_base_fee` 的非 bundle 交易 | `gh api repos/mantle-xyz/op-rbuilder/commits/d145b90516`（context.rs hunk +38） | observed |  |
| B23 | Mantle 的 op-rbuilder fork 没有排序相关改动；源码改动限于 min_base_fee 和 TxDeposit 的 eth_value / eth_tx_value | MANTLE_MIGRATION.md@feat/mantle-arsia-v0.2.14 “Source code changes”“Implemented”；d145b90516、c3643f8645 文件列表 | observed |  |
| B24 | Mantle 迁移分支有 19/112 个测试失败，包括 6 个 flashblocks 计时和 10 个 flashtestations | MANTLE_MIGRATION.md “Known test failures”@feat/mantle-arsia-v0.2.14 | observed |  |
| B25 | Timeboost 每轮默认 60 秒，密封二价拍卖，非 express 交易延迟 200ms，竞拍截止在轮开始前 15 秒，最低保留价 0.001 WETH | docs.arbitrum.io …/timeboost/gentle-introduction “How does it work?”“The Timeboost auction”“Auction contract” | observed | L |
| B26 | express lane controller 无权重排交易，也不保证排在块首；Timeboost 是全链级时间优先，不区分应用 | 同上 “The express lane” 一节；全链适用由文档定义推出 | observed | L |
| B27 | Timeboost 于 2025 年 4 月在 Arbitrum One 上线；Arbitrum One auction 合约为 0x5fcb496a31b7AE91e7c9078Ec662bd7A55cd3079 | forum.arbitrum.foundation/t/30942 首帖 Motivation；docs.arbitrum.io …/how-to-use-timeboost.md 地址表 | observed | L |
| B28 | 2026-06-03 的 Constitutional AIP 提议在 Arbitrum One 以 PGA（125ms 轮次、250ms 区块、防饿死）替换 Timeboost，并停用 Nova 上的 Timeboost；理由包括 PropAMM 需要低价、高频、按优先费的纳入 | forum.arbitrum.foundation/t/30942 首帖 Abstract / Motivation | observed | F6、总览 D、总览 E、L |
| B29 | 该 AIP 已与 Fast Feed AIP 合并为一次链上投票，2026-08 至 09 有多位代表公开投赞成；执行状态未核实 | 同帖 “UPDATE 17 August, 2026”；第 25–30 楼 | observed | L |
| B30 | PUR 合约只强制授权、时间窗、时间戳单调；“更新排在第一个读者之前、未读的不上链”由 builder 自愿实现 | priority-update-registry/src/PrioUpdateRegistry.sol:136-182@8701e8e；README “Threat Model”“Block Builder Integration” | observed | F1、F5 |
| B31 | PUR `getState` 只读 `msg.sender` 自己的 lane，时间戳不在 [min,max] 窗口内时 revert StaleUpdate | src/PrioUpdateRegistry.sol:90-113@8701e8e | observed | F5 |
| B32 | PUR 主网地址 0xda7afeed021eafc1c1af9c362de477dad0396b81，构造参数 MAX_UPDATE_AGE = MAX_UPDATE_LEAD_TIME = 0，链上代码 4085 字节 | README “Deployments”@8701e8e；eth_getCode（publicnode，2026-10-11） | observed | F5、总览 C |
| B33 | PUR 直接 updateState 的 gas = 21000 + 9698 + k×5212；批量签名写约 2 笔起才比逐笔划算 | README “Gas Costs”@8701e8e | observed | F5 |
| B34 | ERC-8324（PR #1852）为 open 状态，标签 s-draft，创建于 2026-07-03，最后更新 2026-09-15 | `gh pr view 1852 -R ethereum/ERCs --json …` | observed | F5、总览 C |
| B35 | op-rbuilder 与 rollup-boost 中没有 PUR 集成代码 | `rg -l -i "prio_?update\|PrioUpdateRegistry\|priority.update"` 在两仓库 crates 中零命中 | observed | F5 |
| B36 | BAP-710 relayer 按“报价 write-set ∩ taker read-set”匹配，组装 [报价…, taker] 原子 bundle 发给多个 builder，失败回落交易池；builder 不需要写 PropAMM 代码 | BAPs/BAP-710.md §4.5.2、§5.1@e9b2be3b00 | observed | F5、L |
| B37 | BAP-710 明确拒绝“builder 端 PropAMM 协议”，并说明早期 registry 草案用过 `batchUpdateStateWithSignature`（即 PUR 的接口名） | BAP-710.md §5.2@e9b2be3b00；PUR README “Writing Priority Updates” | observed | F5 |
| B38 | 单一 sequencer 的 L2 不需要 BAP-710 式多 builder relayer，可以把 PUR 插入放进自己的 builder；但仍需要 RPC 给 taker 提供未上链报价的叠加视图 | 由 B30、B36、B37 推出：relayer 的存在理由是 builder 中立和多 builder 分发 | inferred | F5 |
| B39 | Express Relay 的 EVM 机制：relayer 专属的 multicall 置位 permission，被保护函数调用 `isPermissioned` 检查，结束后复位并按比例分配出价 | per/sdk/solidity/IExpressRelay.sol、contracts/evm/src/express-relay/ExpressRelay.sol:51-121@468ec0a^ | observed |  |
| B40 | Express Relay 的 EVM 合约于 2025-04-11 从仓库删除；2026 年 7 月 OP-PIP-124 通过后整体停运 | `git log -- contracts/evm`：468ec0a 2025-04-11；docs.pyth.network/express-relay.md | observed | 总览 C、K |
| B41 | Chainlink SVR 在 Ethereum 上经 Flashbots MEV-Share（现与 Titan OFA 并行）拍卖 backrun 权；私有路径失败时在可配置延迟后回落标准 feed | docs.chain.link/data-feeds/svr-feeds “How SVR Works”“Fail-Safe Fallback”、页首公告 | observed |  |
| B42 | SVR 在 Base / Arbitrum / BNB Chain / Monad 上走 Atlas v1.6.4：更新和清算打包进同一笔原子交易，由预言机网络提交，不需要 builder；每笔最多 2 个 searcher 出价；支持 Aave / Compound / Venus | docs.chain.link/data-feeds/svr-feeds/searcher-onboarding-atlas.md “High-Level”、开头 NOTE、“Supported Protocols” | observed | K |
| B43 | SVR 在 Base 和 Ink 上对部分 feed 默认启用 | docs.chain.link/data-feeds/svr-feeds “Default SVR Activation” | observed |  |
| B44 | Mantle 可以在 op-rbuilder 选择循环 / cursor 中实现分类别预算与 phase-first，每个 flashblock 作为一轮；要改池内排序，必须替换写死 CoinbaseTipOrdering 的池类型 | 由 B1、B4、B5、B22 推出 | inferred |  |
| B45 | Unichain 生产 builder 很可能就是 op-rbuilder（测试中有 Unichain 配置），但没有官方说明 | op-rbuilder/crates/op-rbuilder/src/tests/framework/utils.rs:164@4f1bec3（Unichain Sepolia 地址）；MANTLE_MIGRATION.md 测试名 smoke_dynamic_unichain_flashblocks | speculative |  |
| X1 | BAM Node 接收交易 / bundle、验证并排序后发给 leader 上的 BAM Validator；validator 必须 “Execute all received transactions in that exact order”，违约时 BAM Node 可临时或永久断开它 | bam.dev/docs/bam/bam-overview/ §BAM Node、§Validator（来源 [5]） | observed | M |
| X2 | BAM Node 运行在 TEE 中；explorer 中 386 个节点连接名里有 385 个带 `-tee` 后缀 | bam.dev 首页 “Trusted Execution Environments (TEEs)”；`curl explorer.bam.dev/api/v1/validators`（来源 [6][8]） | observed | M |
| X3 | Node→Validator 通过双向 gRPC 流 `InitSchedulerStream` 下发 `MultipleAtomicTxnBatch`，每个 `AtomicTxnBatch` 带 `seq_id`、`max_schedule_slot`，并且 “must be processed together” | bam-protos/bam_api.proto:59-69@642c49ae6d；bam-protos/bam_types.proto:53-65@642c49ae6d | observed |  |
| X4 | MPP 通过单独的 UDP 端点 PTPU 接收做市商预签名的报价更新，默认端口 5012 | bam.dev maker-plugin how-it-works §How it works；getting-started §Sending protocol（来源 [2][3]） | observed |  |
| X5 | PTPU 校验：单 signer、已登记 signer、写入已登记 market、只允许已登记 program + Compute Budget + System、CU price 下限、指令数据配置偏移处有 8 字节 LE u64 seqno；不满足则静默丢弃 | bam.dev maker-plugin how-it-works §Validation Requirements（来源 [2]） | observed | F6、M、R |
| X6 | 同一市场每轮只保留最高 seqno 的那笔更新，更低 seqno 的标为 stale，在 tick 时丢弃 | bam.dev how-it-works §Nonce Coalescing（来源 [2]） | observed | F6 |
| X7 | 每个拍卖轮约 50 ms；Phase 1 先排“上一轮收到的”maker 更新，Phase 2 中 bundle 与普通交易按同一 priority score 竞争 | bam.dev how-it-works §Scheduling Logic（来源 [2]） | observed | F6、总览 D |
| X8 | 多付 fee 或 tip 都不能排到 Phase 1 之前（“structural and cannot be changed by paying higher fees or tips”） | bam.dev how-it-works §Scheduling Logic；faqs “Can I pay more…? No.”（来源 [2][4]） | observed | F6、F10 |
| X9 | MPP 交易不需要 Jito tip，只付标准 CU 费 | bam.dev how-it-works §Key Properties “No Jito tip required”（来源 [2]） | observed | M |
| X10 | MPP 登记是静态的，由 BAM 节点运营方配置，没有运行时注册 API；最多 32 个 signer、64 个 market account | bam.dev how-it-works §Static enrollment；getting-started §Getting Enrolled（来源 [2][3]） | observed | M |
| X11 | 初期 MPP 只在 “select regions” 的 BAM 节点所连接的 leader 上提供 | bam.dev maker-plugin faqs “Does every BAM node run the maker plugin?”（来源 [4]） | observed | M |
| X12 | BAM early mainnet 于 2025-09-30 宣布上线，最初节点在 Amsterdam / Frankfurt / NYC | forum.bam.dev/t/bam-early-mainnet-is-live/49 post #1（来源 [7]） | observed | 总览 E |
| X13 | 截至 2026-10-11，BAM 有 386 个 validator，stake 合计约 165.1M SOL，占全网 37.66% | `curl explorer.bam.dev/api/v1/validators` 汇总 stake_percentage（来源 [8]） | observed | 总览 D、总览 C、M |
| X14 | MPP 的强制力来自链下的 BAM Node（TEE）和断连威胁，不来自 Solana 共识；非 BAM leader 的 slot（约 62% stake）不受 Phase 1 约束 | 由 X1、X8、X11、X13 推出：规则在 BAM 调度器里执行，validator 违约的后果只是断连 | inferred |  |
| X15 | 一笔 maker 更新从到达到执行最多晚约 2 个拍卖轮（约 50–100 ms） | 由 X7 推出：Phase 1 排的是上一轮收到的更新 | speculative |  |
| X16 | mpp-sender 示例每 50 ms 用 UDP 向当前 BAM leader 发一笔交易，CU price 20,000,000 micro-lamports、CU limit 500，不带 tip 指令 | mpp-sender/src/sender.rs:16@d353e80349；mpp-sender/src/transaction.rs:15-16,33-51@d353e80349；README §Routing | observed |  |
| X17 | Temporal AMQ（Cavey & Jakob Povšič，2025-09-22）在程序状态中维护优先队列，异步指令按类型分优先级并打上 slot / 序号，延迟（例如 slot+1）后由单独指令按优先级执行；示例中 cancel 优先级 1、limit 优先级 0 | temporal.xyz/writing/… §How AMQs Work、§Implementation Example（来源 [11]） | observed | M |
| X18 | AMQ 作者承认 “AMQs can still be bypassed by a validator within protocol enforced tick boundaries through censorship and delay” | temporal.xyz/writing/… §Enforcing ACE；ethresear.ch/t/23977 §2.2（来源 [11][1]） | observed | M |
| X19 | AMQ 让结果最早下一个 slot 结算，同块交易（例如闪电贷）用不到 batch 的结果 | ethresear.ch/t/23977 §2.2 “Next-block Settlement”；temporal 原文 “breaks the atomicity of execution”（来源 [1][11]） | observed | M |
| X20 | ACE 帖链接的 temporal.xyz `/writings/` URL 在 2026-10-11 返回 404，现行 URL 是 `/writing/` | `curl -o /dev/null -w %{http_code}`：/writings/… → 404，/writing/… → 200 | observed |  |
| X21 | ACE 帖第 3 楼引用的 “Solana's Proprietary AMM Revolution” 是 Helius 博客，作者 Lostin，2025-08-25 | ethresear.ch/t/23977.json post #3 链接；helius.dev/blog/solanas-proprietary-amm-revolution 页头（来源 [1][12]） | observed |  |
| X22 | HumidiFi 的 oracle 更新约 143 CU（约 9,998 lamports），只要 4,998 lamports tip 就能排到 Jito 拍卖队列前列；典型的 Prop AMM swap 约 150,000 CU | helius.dev 博客 §Oracle Updates（来源 [12]） | observed | F6 |
| X23 | Prop AMM 的“cancel priority”只是 tip/CU 竞价下的成本优势，出价更高的 taker 就能越过，并非结构性规则 | 由 X22（按 tip/CU 排序）与 X8（BAM 明确的结构性规则作对照）推出 | inferred | F6 |
| X24 | Hyperliquid 称 cancel 和 post-only 优先于 GTC / IOC，并且 “The only correct way for a node to execute a block on the Hyperliquid L1 is to sort cancels and post-only orders first” | hyperliquid.medium.com “Latency and transaction ordering on Hyperliquid”（2024-01-06，RSS 全文）§Hyperliquid's design（来源 [13]） | observed | 总览 C、M |
| X25 | 现行文档：每个 consensus batch（一个块通常 1–2 个）内依次排“不发 GTC/IOC 的动作 → cancel → 含 GTC/IOC 的动作”，类内按 proposer 顺序 | hyperliquid-docs/hypercore/order-book.md（来源 [14]） | observed | F6、M |
| X26 | 按现行文档，post-only（ALO）属于类别 1，排在 cancel 之前，与 2024 年博客 “cancels and post-only first” 的笼统说法有差别 | 由 X24、X25 推出 | inferred |  |
| X27 | 从 HyperEVM 经 CoreWriter（0x3333…3333，约 47k gas）发出的下单动作会被链上延迟几秒，以防绕过 L1 mempool 获得时延优势 | hyperliquid-docs/for-developers/hyperevm/interacting-with-hypercore §CoreWriter contract（来源 [15]） | observed | M |
| X28 | HyperEVM 合约享受不到 HyperCore 的同批 cancel 优先规则 | 由 X25（只给订单簿动作描述了分类排序）、X27 以及 interaction-timings（CoreWriter 动作在 EVM 块之后处理）推出（来源 [16]） | inferred | M |
| X29 | Block SDK 的 Lane 接口由 Match / PrepareLane / ProcessLane / GetMaxBlockSpace / Compare / Priority 组成 | block-sdk/block/lane.go:17-77@25c042e0b7 | observed | F6 |
| X30 | lane 的 MaxBlockSpace 是相对整块的上限比例；ratio 为 0 的 default lane 拿剩余全部字节 / gas | block-sdk/block/proposals/proposals.go:69-98@25c042e0b7；block/proposals/update.go:66-83@25c042e0b7 | observed | F6 |
| X31 | ProcessLane 的默认验证：本 lane 交易连续排在前面、后面不再出现本 lane 交易、按 Compare 有序、逐笔 VerifyTx；违反则拒绝提案 | block-sdk/block/base/proposals.go:150-191@25c042e0b7；abci/abci.go:156-175@25c042e0b7（REJECT） | observed | F6、F8 |
| X32 | 推荐的 `NewDefaultProposalHandler` 让 ProcessProposal 为 NoOp；只有 `abci.New(..., true)` 才由验证者强制 lane 规则；这一默认值来自 PR #543（2024-06-25） | block-sdk/abci/abci.go:32-45,136-139@25c042e0b7；`gh pr view 543 -R skip-mev/block-sdk` mergedAt 2024-06-25T14:48:18Z | observed | F6、M |
| X33 | 示例 app 的 lane 顺序为 mev → free → default，比例分别为 0.2 / 0.2 / 0.6，“Blocks are constructed from the top lane to the bottom lane” | block-sdk/tests/app/lanes.go:31-60@25c042e0b7；tests/app/app.go:214-220@25c042e0b7 | observed |  |
| X34 | free lane 默认匹配 MsgDelegate / MsgBeginRedelegate / MsgCancelUnbondingDelegation | block-sdk/lanes/free/lane.go:41-56@25c042e0b7 | observed |  |
| X35 | skip-mev/block-sdk 已归档（archived=true，最后推送 2025-01-31），README 声明不再维护并建议 fork，没有说明原因 | `gh api repos/skip-mev/block-sdk`；block-sdk/README.md:1-3@25c042e0b7 | observed | M |
| X36 | dYdX 的每个节点维护内存订单簿；proposer 用本地订单簿按 price-time priority 撮合并写进块；cancel 未及时传到后续 proposer 时订单仍可能成交 | docs.dydx.xyz/concepts/trading/limit-orderbook（来源 [21]） | observed |  |
| X37 | dYdX 的 “vote extensions + FBA 限制 proposer 纳入 / 排除” 是博客提出、待原型验证的提案；现状是 “social mitigation” | dydx.xyz/blog/architecture-to-mitigate-mev §Status quo、§Looking ahead（来源 [20]） | observed |  |
| X38 | dYdX 现网代码中的 vote extension 只处理 oracle 价格（x/prices，Slinky） | dydxprotocol/v4-chain protocol/app/vote_extensions/extend_vote_handler.go@ac27af66dd（gh api） | observed |  |
| X39 | ACE 帖说 “dYdX uses vote extensions to … limit the set of transactions the proposer can exclude”，这与 dYdX 一手来源不符 | 由 X37、X38 与 ethresear.ch/t/23977 §2.1 的原句对比推出 | inferred |  |
| X40 | dYdX v9 引入 designated proposers（治理选出的 validator 子集），OEGS 网关直连这些 proposer，由第三方 Imperator 运营 | docs.dydx.xyz/concepts/architecture/oegs（来源 [22]） | observed |  |
| X41 | Injective 每个块在 endBlock 执行 FBA：market order 先成交，然后是之前间隔留下的 limit，最后是本间隔的 limit；limit 按统一清算价成交；拍卖结束前订单不公开 | injective.com/blog/injective-exchange-upgrade-a-novel-order-matching-mechanism/（2021-03-08）（来源 [23]） | observed | M |
| X42 | Injective 现行文档仍把 FBA 列为订单执行机制（统一价格、离散批次） | docs.injective.network/defi/trading/index.md（来源 [24]） | observed |  |
| X43 | Sui 按共享对象限制每次 commit 的执行容量；交易优先级 “determined solely by gas price”；排不上的交易推迟到下一次 commit | docs.sui.io/develop/transaction-payment/local-fee-markets（来源 [25]） | observed |  |
| X44 | Penumbra V1 的批量 swap 公开燃烧输入、私密铸造输出（SwapClaim），sealed-bid 批量 swap 是未来升级 | protocol.penumbra.zone/main/dex/swap.html §Batch Swaps（来源 [26]） | observed |  |
| X45 | 本路所有机制都没有解决 proposer 不打包 cancel 的审查问题；dYdX 的 VE 方案是唯一针对这一点的设计，但仍是提案 | 由 X14、X18、ethresear.ch/t/23977 §2.1 Cons（censorship）、X37 推出 | inferred |  |
| L1 | Tempo payment lane 是对非支付交易的第二道共识 gas 约束，分类只看交易 payload、不读状态 | [1] Abstract | observed |  |
| L2 | Tempo 规范不要求任何特定排序，支付与非支付可以交错 | [1] §2 “Ordering of Transactions” | observed | F7、F10 |
| L3 | Tempo 默认交易池按 effective coinbase tip 排序 | `tempo/crates/transaction-pool/src/ordering.rs:6-27@87bd32a63d` | observed | F7 |
| L4 | Tempo T5 前的分类（v1）只看调用目标是否带 TIP-20 前缀，AA 交易要求每个 call 都打到 TIP-20 | `tempo/crates/primitives/src/transaction/envelope.rs:255-263@87bd32a63d` | observed |  |
| L5 | T5 起（v2 / TIP-1045）每个 call 必须命中 target+selector+精确 ABI 长度白名单，access list 和 authorization list 必须为空，key_authorization ≤ 1024 字节 | `envelope.rs:280-301,574-587@87bd32a63d`；[2] Specification | observed | F7、N |
| L6 | TIP-1045 白名单包括 TIP-20 的 9 个函数（含 approve、mint、burn）和 TIP20ChannelReserve 的 6 个函数；含动态参数的 calldata ≤ 2048 字节 | [2] “Payment Call Allow-List” | observed | N |
| L7 | TIP-20 前缀地址是协议预编译，这是“只看前缀即可分类”的前提 | `tempo/crates/primitives/src/address.rs:50-51@87bd32a63d` | observed | N |
| L8 | Tempo 主网（chainId 4217）T1 = 2026-02-12，T4 = 2026-05-18，T5 = 2026-06-09，T7 = 2026-07-09 | `tempo/crates/chainspec/src/genesis/presto.json`；`spec.rs:125@87bd32a63d` | observed | 总览 E、总览 C、N |
| L9 | `general_gas_limit` 是 header 字段，T1 起固定为 30,000,000，header 值不等于 chainspec 期望值即拒绝 | `tempo/crates/hardfork/src/lib.rs:277-285`、`constants.rs:73-77`、`crates/evm/src/consensus/mod.rs:94-106@87bd32a63d` | observed | F1、总览 D、N |
| L10 | T4 起 shared_gas_limit = 0，非支付超出预算会让区块无效（“incentive gas limit exceeded”） | `hardfork/src/lib.rs:290-296`；`crates/evm/src/block.rs:469-477,648-652@87bd32a63d` | observed |  |
| L11 | TIP-1010 主网初始参数：区块 500M、shared 50M、general 30M，“至少 420M 留给支付” | [3] “Shared capacity model” | observed | 总览 D、N |
| L12 | T4 之后、gas limit 仍为 500M 时，支付可用空间约 470M | 由 L10、L11 推出：500M − 30M，shared 为 0 | inferred | N |
| L13 | Tempo 构建器跳过会让非支付总量超过 general_gas_limit 的交易（ExceedsNonPaymentLimit） | `tempo/crates/payload/builder/src/lib.rs:571-588@87bd32a63d` | observed | N |
| L14 | Tempo v2 分类先在交易池 / 构建器中用于防 DoS，T5 才写进共识 | `envelope.rs:276-278@87bd32a63d` 注释；`crates/transaction-pool/src/transaction.rs:105` | observed |  |
| L15 | Tempo T7 动态 base fee 以全块 gas（含支付 lane）为输入，支付用量同样推高 base fee，即没有费用隔离 | [4] Assumptions | observed | F7 |
| L16 | TIP-1067 参数：cap 1.2e10、floor 6e8 attodollars/gas，target 10M gas，denominator 8 | [4] Constants；`tempo/crates/hardfork/src/constants.rs:41-70@87bd32a63d` | observed |  |
| L17 | BEP-703 有效性条件为 `generalGasUsed + max(paymentGasUsed, quota) ≤ GasLimit`，且不新增排序 / 优先级 / 费用规则 | `BEPs/BEP-703.md:141-152@e9b2be3b00` | observed | F7、F10 |
| L18 | BEP-703 只保证支付“作为一类”有 gas，不保证任何单笔被纳入 | `BEP-703.md:38@e9b2be3b00` | observed | F7 |
| L19 | BSC 预留闲置时不归还，理由是归还会让排除支付交易没有成本 | `BEP-703.md:271@e9b2be3b00`（§4） | observed | F7 |
| L20 | BSC lane 内的交易按普通费用规则付全价（“Reserved gas is not free gas”） | `BEP-703.md:281@e9b2be3b00`（§6） | observed | F7 |
| L21 | BSC 分类：名单读父状态（命中即为支付）；其余要求 value>0 且接收方在实时状态下无代码；类型限于 0x00/0x01/0x02 | `BEP-703.md:89-127`；`bsc/core/paymentlane/classify.go:35-58@8cc60b246c` | observed | N |
| L22 | BSC 名单按地址登记，被调用的函数不限；只看顶层 `to` | `BEP-703.md` §3.2 表格；`classify.go:39-50@8cc60b246c` | observed | N |
| L23 | BSC 普通交易可声明的最大 gas = 剩余 gas − 闲置预留 | `bsc/core/paymentlane/budget.go:12-21@8cc60b246c` | observed |  |
| L24 | BSC Jenner 在主网、Chapel、Rialto 均未排期；最新 release 仍为 v1.8.0-alpha（2026-08-13）；官方计划测试网 10 月下旬、主网 11 月下旬 | `bsc/params/config.go:256,311,368@8cc60b246c`；`gh release list -R bnb-chain/bsc`；[24] | observed | F1、总览 C、N |
| L25 | Tempo 给非支付封顶、BSC 给支付保底，方向相反；两者都只做容量隔离，都不改排序或费用 | 由 L2、L9、L15、L17、L20 推出 | inferred | F7 |
| L26 | ACE 定义为“对与应用交互的一批交易施加排序规则”；cancel prioritization 指同批内撤单先于吃单 | [15] post 1 §1 | observed | F8、总览 E |
| L27 | ACE 对 app-chain 的评价：抗审查只等于链本身的抗审查，proposer 可以直接排除 cancel；结算只能经桥 | [15] §2.1 Cons | observed | F8 |
| L28 | ACE 对 AMQ 的评价：不改共识，但至少延迟一个 slot、下一块结算；原作者承认可被审查和延迟绕过 | [15] §2.2 | observed |  |
| L29 | ACE 对 Angstrom 的评价：不改共识，自带抗审查；有额外 liveness 风险；批次后同块可用 | [15] §2.3 | observed |  |
| L30 | ACE 对 PEPC 的评价：没有额外信任假设、原生结算；但参与是自愿的，有 cold-start（1/10 验证者参与 ⇒ 平均 10 块更新一次） | [15] §2.4 | observed |  |
| L31 | ACE §3 设想合约声明 `order = [Cancel, Take]`，违反即区块无效 | [15] §3 | observed | F8 |
| L32 | REMOVE/SWAP 奇偶例子中，6 种排列只有 2 种合法，且合法集合取决于初始奇偶 | [15] §3.1 | observed | F8、总览 D、O |
| L33 | 两个 DEX 的循环依赖（TX1 = REMOVE(A)+SWAP(B)，TX2 = REMOVE(B)+SWAP(A)）导致两笔交易不能同块；Oracle/DEX 例子同理 | [15] §3.2 | observed | F8 |
| L34 | ACE 断言：本地 builder 按优先费贪心打包，至少能拿到最优 tip 收入的 1/2；约 8% 的区块由 proposer 本地构建 | [15] §3.1 | observed | O |
| L35 | 1/2 近似在教科书上需要“贪心结果与单个最大物品取较大者”，或单笔交易远小于区块容量的前提 | 未查形式化来源；基于 0/1 背包标准结论 | speculative |  |
| L36 | ACE 断言：验块复杂度远低于建块复杂度，违规可在执行中立即判无效 | [15] §3.3 末段 | observed | F8 |
| L37 | ACE 提出显式信号：交易预先声明会调用的函数（类似 BAL），调用未声明的函数则 revert 但仍付 gas | [15] §3.3 “Explicit signalling” | observed | F8、O |
| L38 | 第 3 楼是作者 mikeneuder 本人的回复，Prop AMM “经济型 cancel priority” 一句是转引第三方文章 | [15] post 3 | observed |  |
| L39 | PEPC 让 proposer 用 EVM 代码表达承诺、由 attester 检查，是 2022 年的研究提案，没有 EIP | [16] “Committee-based pessimistic block validity” | observed | 总览 E |
| L40 | EVM Native Sequencing Rules 提出 bundle 交易类型、bundler 指定，以及全局变量 `bundle.signer` / `bundle.number` / `bundle.tx_number`，bundle 内交易不保证不 revert | [17] “Sequencing Rules: The How” | observed |  |
| L41 | FOCIL（EIP-7805，Draft）只约束“不能排除”：16 人委员会、IL 8 KiB、交易可放块内任意位置、条件包含 | [18] Rationale、参数表 | observed |  |
| L42 | ERC-4337 nonce 由 192 位 key 和 64 位 sequence 组成，每个 key 独立递增，可以随时启用新 key | [19] §Semi-abstracted Nonce Support | observed | F10、O |
| L43 | Tempo 原生交易有 2D nonce（`nonce_key`，key 0 为协议 nonce） | `tempo/crates/primitives/src/transaction/tempo_transaction.rs:204-206@87bd32a63d` | observed | F10、O |
| L44 | ERC-4337 原文没有讨论 `tx.gasprice`；“AA 批处理下 tx.gasprice 失真”是从 EVM 语义推出的 | `grep -i gasprice erc-4337.md` 0 命中 [19] | inferred | O |
| L45 | Mantle Fair Sequencing（2024-02-22）提出：FCFS 分批 + 回执，VRF 随机置换，executor 可罚没 | [20] 正文；[21] “Transaction submission”“Fair ordering” | observed | F12 |
| L46 | Mantle fair sequencing 博客原 URL 在 2026-10-11 已 307 重定向到首页 | `curl -sIL …/fair-sequencing` → `HTTP/2 307 location: /` | observed |  |
| L47 | Mantle op-geth 出块顺序为：preconf 交易 FIFO → 优先账户 → 其余按价格 + nonce；preconf 类别由节点配置的 from/to 白名单决定 | `mantlenetworkio/op-geth/miner/worker.go:764-825`、`preconf/tx_pool_config.go:44-66@e33cd26` | observed |  |
| L48 | Mantle fair sequencing 未上线 | 由 L47 推出，且 op-geth / mantle-v2（sparse）中 `rg -i vrf` 无相关命中 | inferred |  |
| L49 | Mantle 无法照搬 Tempo 的前缀分类，因为 Mantle 稳定币不是协议预编译 | 由 L7 推出：Tempo 无状态分类依赖预编译语义固定 | inferred | R |
| L50 | 如果 Mantle 只加 lane、不改费用机制，meme 拥堵时支付仍会被全块 base fee 推高 | 由 L15、L20 推出，并结合 OP Stack EIP-1559 按全块 gas 调整 base fee | inferred |  |
| L51 | BSC 支付配额参数：`PAYMENT_LANE_RATIO` 默认 500（5%），上限 1000（10%），分母 10000；以 55M gas 为例保底 2,750,000 gas | `BEPs/BEP-703.md:187,208-213@e9b2be3b00` | observed | F7、总览 D |
| M1 | Mantle 是 L2BEAT 定级的 Stage 0 ZK Rollup，数据发到 Ethereum blobs，状态由 OP Succinct（SP1）有效性证明验证 | 来源 [6] 页面结构化描述 | observed |  |
| M2 | L2BEAT 记录 Arsia 里程碑为 2026-04-16，“EigenDA code path removed” | 来源 [6] Milestones & Incidents | observed |  |
| M3 | 用户可经 L1 强制收录交易，最长延迟 12 小时 | 来源 [6] Sequencer failure 节 | observed |  |
| M4 | 主网 rollup.json：block_time=2、l2_chain_id=5000、seq_window_size=3600、max_sequencer_drift=600 | 来源 [7] mainnet/rollup.json | observed | 总览 D |
| M5 | 官方文档：交易池私有，sequencer 按 base fee 和 priority fee 处理交易 | 来源 [1] “Transaction Pool in Mantle” 节 | observed | P、H |
| M6 | Arsia 前 base fee 静态、建议小费为 0；Arsia 恢复动态 EIP-1559，带最低 base fee 和显式小费 | 来源 [4] L2 Execution Fee 表；来源 [3] “Dynamic EIP-1559 Base Fee” | observed |  |
| M7 | Arsia 移除了 L2 执行 gas 的 tokenRatio 乘数，但 L1 数据费仍乘 TokenRatio 换算成 MNT | 来源 [3]；来源 [4] `L1DataFee = EstimatedSize * WeightedL1Fee * TokenRatio`；`op-geth/core/state_transition.go:844-846@e33cd26cda` | observed |  |
| M8 | op-node 的 attributes 模板默认 NoTxPool=true，sequencer 置为 false 才从交易池取交易 | `mantle-v2/op-node/rollup/derive/attributes.go:62-64,171@da45c315d8` | observed |  |
| M9 | 超过 sequencer drift、升级激活块、recover 模式下 sequencer 只出不含池交易的块 | `mantle-v2/op-node/rollup/sequencing/sequencer.go:563-608@da45c315d8` | observed |  |
| M10 | 验证者按 batch 原样重放交易（NoTxPool=true），不从交易池取交易 | `mantle-v2/op-node/rollup/derive/attributes_queue.go:129-132@da45c315d8` | observed | F9 |
| M11 | 派生阶段对 batch 交易只检查非空、非 deposit、SetCode 时限，没有排序检查 | `mantle-v2/op-node/rollup/derive/batches.go:176-189@da45c315d8` | observed | F9、F12 |
| M12 | 现行协议下任何排序规则都只由 sequencer 强制，验证节点和证明无法判定排序违规 | 由 M10、M11 推出：派生与重放不检查顺序 | inferred | F9 |
| M13 | op-geth 的 fillTransactions 按 preconf FIFO → prio 账户 → 普通交易三段填块 | `op-geth/miner/worker.go:764-826@e33cd26cda` | observed | F9 |
| M14 | op-geth 普通排序：有效小费 min(tipCap, feeCap−baseFee) 降序，同价按首次见到的时间，账户内按 nonce | `op-geth/miner/ordering.go:39-69@e33cd26cda` | observed | F9 |
| M15 | op-geth 填块时接受 0 小费交易（MinTip=0） | `op-geth/miner/worker.go:743@e33cd26cda` | observed | F9 |
| M16 | 只要有未封装的 preconf 交易，op-geth 就不再放入其他交易，preconf 车道没有容量上限 | `op-geth/miner/worker.go:778-781@e33cd26cda` | observed | F9 |
| M17 | preconf 交易的判定规则是 from 在 FromPreconfs 且 to 在 ToPreconfs（或 AllPreconfs 打开）；PreconfTimeout 默认 1 秒 | `op-geth/preconf/tx_pool_config.go:10-67@e33cd26cda` | observed | F9、P |
| M18 | preconf 集合按接收顺序 FIFO，代码注释给出确定性、公平性等理由 | `op-geth/preconf/fifo_tx_set.go:13-22@e33cd26cda` | observed | F9 |
| M19 | `eth_sendRawTransactionWithPreconf` 由 RPC 节点转发到 sequencer；sequencer 需启用 preconf checker，最长等待 2 秒返回预确认结果 | `op-geth/eth/api_backend.go:380-436`；`internal/ethapi/api.go:2295-2297@e33cd26cda` | observed | F9、P |
| M20 | preconf 功能 2025-06-05 合入 op-geth（#113） | `git log -- preconf miner/miner_preconf.go` 输出 `5bdae6a 2025-06-05 Merge preconf to prectra (#113)` | observed | F9、总览 E |
| M21 | Sepolia 的 proxyd 开放了 eth_sendRawTransactionWithPreconf；networks 仓库没有主网 proxyd 配置 | 来源 [8] sepolia/proxyd.toml 第 61、157 行；mainnet/ 目录列表 | observed | F9、总览 C、P |
| M22 | 主网是否启用 preconf 车道、白名单是谁，没有一手来源；推测服务做市商或支付类合作方 | 来源 [1][2][8] 均未提及主网配置 | speculative | F9、总览 C、P |
| M23 | mantle-reth 的 preconf crate 是 fork 出来的 OP payload builder，在 biased select! 循环里交错执行 preconf FIFO 和池内 best-tx，池内交易每 tick 获得 block_gas_limit/ticks_remaining 的配额 | `reth/mantle-reth/crates/preconf/src/lib.rs:1-9`；`builder/payload_builder.rs:768-806,937-960@f022de0f62` | observed | F9、F11、P |
| M24 | mantle-reth 中 preconf-eligible 交易只能走 FIFO 通道，池分支遇到会 mark_invalid | `reth/mantle-reth/crates/preconf/src/builder/payload_builder.rs:685-700@f022de0f62` | observed | F9、P |
| M25 | op-reth 交易池使用 CoinbaseTipOrdering | `reth/op-reth/crates/txpool/src/lib.rs:26-39@f022de0f62` | observed |  |
| M26 | 路线图 2026 H2（未勾选）：主网 Sequencer 和 RPC 切到 pure Reth，Geth 降为灾备热备 | 来源 [2] 2026 H2 “Full-Stack Pure Reth Migration” | observed | P、H |
| M27 | 路线图 2026 H2（未勾选）：Flashblocks 亚秒级预确认；预确认策略和路由权限重构为链上动态管理合约 | 来源 [2] “Flashblocks Ultra-Fast Confirmation…” 条目 | observed | F11、总览 E、P |
| M28 | 路线图 2026 H2（未勾选）：Prop AMM 支持 “high-priority cancellations (Cancel) and dedicated matching paths” | 来源 [2] “Prop AMM High-Performance Matching Infrastructure” | observed | F10、总览 E、P |
| M29 | 路线图 2026 H2（未勾选）：EIP-8130 原生 AA 与 2D nonce，面向高频 payment 和交易 | 来源 [2] “Account Abstraction and High-Concurrency Matching” | observed | F10、总览 E、P |
| M30 | mantle-xyz/op-rbuilder 是 flashbots/op-rbuilder 的 fork，main 分支 ahead 0 / behind 64；Mantle 改动只在 feat/mantle-arsia* 分支（2026-05-14） | 来源 [15] gh api compare 与 branches | observed | F9、P |
| M31 | MANTLE_MIGRATION.md 自称迁移状态：98/112 测试通过，源码只改 3 个文件（TxDeposit 的 eth_value、eth_tx_value） | 来源 [15] `MANTLE_MIGRATION.md@feat/mantle-arsia-v0.2.14` | observed | F9、P |
| M32 | 没有证据表明 mantle-xyz/op-rbuilder 在生产使用；Mantle 现行 builder 方向是自研的 mantle-reth preconf builder | 由 M23、M30、M31 推出 | inferred | F9 |
| M33 | Mantle 的 OP Succinct 证明程序依赖 kona-derive、driver、executor、proof、client，均来自 mantle-v2 tag mantle-v1.6.3 | 来源 [16] Cargo.toml 第 82-99 行 | observed | F12 |
| M34 | 协议层排序规则需要同时改 op-node（Go）、kona（Rust，加 SP1 vkey）和 op-geth / reth 的验块 | 由 M11、M33 推出 | inferred |  |
| M35 | Angstrom L2 要求 pool 的 currency0 为原生币，否则 revert IncompatiblePoolConfiguration | `l2-angstrom/src/AngstromL2.sol:249@81bd4189f4` | observed |  |
| M36 | Mantle 原生币是 MNT；L2 上的 ETH 是 BVM_ETH（0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111），由 deposit 的 EthValue 铸造 | 来源 [5]；`op-geth/core/state_transition.go:38`；`core/types/deposit_tx.go:44-49@e33cd26cda` | observed |  |
| M37 | 在 Mantle 部署 Angstrom L2 只能做 MNT/X 池，税以 MNT 计价 | 由 M35、M36 推出 | inferred |  |
| M38 | op-geth 里 tx.gasprice 等于有效价格 min(baseFee+tipCap, feeCap)，与以太坊语义一致 | `op-geth/core/state_transition.go:348-357`；`core/evm.go:93-96@e33cd26cda` | observed |  |
| M39 | Arsia 后 `tx.gasprice − block.basefee` 可作为优先费信号；Arsia 前因 base fee 静态且小费为 0，基本无竞价意义 | 由 M6、M7、M38 推出 | inferred |  |
| M40 | preconf 车道内的交易按 FIFO 排，与小费无关；若 MEV-tax 竞争交易能进入该车道，“小费决定顺序”的前提就不成立 | 由 M13、M18、M35 推出 | inferred |  |
| M41 | EIP-8130 当前为 Draft（title “Keystore Accounts”），用 nonce_key 区分通道，nonce_key==NONCE_KEY_MAX 为 nonce-free；unsequenced 批次之间顺序未定义 | 来源 [18] eip-8130.md 第 1-11、115-120、233-234、308 行 | observed |  |
| M42 | 官方首页定位为 “Institutional Onchain Finance”，近期动态包括 USDG（2026-09-03）、xStocks、DeFi Vault | 来源 [19] mantle.xyz 首页 | observed | Q |
| M43 | meme launchpad 和 perps 是用户提供的方向，本次读到的 Mantle 官方页面没有对应表述 | 来源 [20] brief “为什么现在”；来源 [2][19] 未提及 | observed | Q、H |
| M44 | 外部调研引用的 mantle.xyz/blog/research/fair-sequencing 现在重定向到首页，2024 年 VRF 排序研究无法核实 | `curl -sL` 返回内容与首页相同（212192 字节） | observed |  |
| M45 | 泛化 preconf 分类器（to × selector × 类别）加 mantle-reth 配额调度，是 Mantle 实现分层车道改动最小的路径 | 由 M16、M17、M23、M27 推出 | inferred |  |
| D1 | 现有 ASS / ACE 实现按“排序规则由谁强制”可分四层：链共识 / 有效性规则（Hyperliquid、Injective、Tempo、BSC lane、开启验证的 Block SDK）；sequencer / builder 策略（op-rbuilder、Unichain TEE、Timeboost、PUR、BAM MPP、Mantle preconf 车道）；链下批处理网络 + 合约入口（Angstrom L1、Atlas、SVR on Atlas、Express Relay）；合约规则与经济激励（Angstrom L2、UniswapX priority、AMQ、Prop AMM 低 CU 更新） | 由 X24、X41、L9、L17、X32、B1、B16、B26、B30、X14、M13、A1、A40、B42、B39、A18、A37、X17、X23 推出 | inferred | F1 |
| D2 | EVM 上，除 Tempo 与 BSC 的 payment lane 外，没有已上线的实现在协议层改变区块排序；其余 EVM 方案要么锁合约入口（Angstrom L1、Atlas、Express Relay），要么对优先费收税（Angstrom L2、UniswapX），要么依赖 builder 约定（PUR、Unichain） | 由 A1、A3、A40、B39、A18、A37、B30、B20、L9、L17 推出 | inferred | F1、导语 |
| D3 | 两条已存在的 payment lane 只做容量隔离：都不提供 FCFS，也都不提供费用隔离；“payment 要 FCFS”需要在 lane 之上另加车道内排序规则 | 由 L2、L3、L15、L17、L20、L25 推出 | inferred | F7、F10、Q、导语 |
| D4 | “DeFi 统一 tips 优先”过粗：同属 DeFi，做市报价更新 / 撤单需要不能被小费越过的结构性优先（BAM Phase 1、Hyperliquid 分类、PUR、Mantle 路线图的 Prop AMM 撤单优先），套利才适合小费拍卖 + 应用税 | 由 X8、X25、B30、M28、A18、A33 推出 | inferred | F10、Q |
| D5 | 外层容量分配如果按付给 sequencer 的小费比较，会挤出 MEV-tax 应用（其约 99.5% 的出价付给应用而非链），因此外层不能用“小费高者得空间” | 由 A34、A36 推出 | inferred | F3、F10、R |
| D6 | 主流多车道设计（BAM 两阶段、Hyperliquid 三类、Block SDK lanes、Arbitrum PGA 提案）结构相同：外层按操作类别分档并设容量上限，内层各用自己的比较器（到达顺序 / 价格 / 提议顺序） | 由 X7、X25、X29、X30、B28 推出 | inferred | F6、导语 |
| D7 | 能写成区块有效性规则的只有“可由区块内容复核”的约束：确定性分类下的容量上限 / 保底（Tempo、BSC）与类别分段顺序（Block SDK ProcessLane、Hyperliquid）；到达时间（FCFS）与“没有审查”无法从区块内容复核 | 由 L9、L10、L17、X31、X24、L18、L27、X45 推出 | inferred | F8、F12、导语 |
| D8 | Mantle 已有“类别 FIFO 车道排在小费排序之前”的雏形（op-geth / mantle-reth preconf 车道），但它没有容量上限、按 from×to 地址白名单分类、只由 sequencer 强制；直接对外开放会让 FIFO 流量饿死其他交易 | 由 M13、M16、M17、M23、M12 推出 | inferred | F9、导语 |
| D9 | 为 Mantle 建议的外层车道（设计建议）：强制交易 → 维护车道（报价更新 / 撤单 / oracle，phase-first，每市场每轮只留最新一笔）→ 支付车道（合格支付队头之间 FCFS，保底 + 上限）→ 发射车道（上限隔离热点）→ 通用 / DeFi 车道（小费优先，可承载 MEV-tax 应用） | 由 D4、D6、D8、X6、L17、L9 推出；属于设计建议 | inferred | F11、R、导语 |
| D10 | 支付分类在 Mantle 上宜组合两家做法：父状态中的代币合约名单（BSC）+ TIP-1045 式 selector 与精确 ABI 长度白名单、access list 与 7702 授权必须为空（Tempo）；只看顶层 to 会漏掉经 Router / AA 发起的支付 | 由 L5、L7、L21、L22、L49 推出；属于设计建议 | inferred | F11、R |
| D11 | Mantle 第一阶段把车道调度放在 mantle-reth preconf builder（select! 多分支 + PoolPacer 配额）里改动最小，并可把每个 flashblock 当作一轮执行 phase-first | 由 M23、M45、B4、B5、B44 推出；属于设计建议 | inferred | F11、R |
| D12 | 把车道规则升级为协议有效性规则，需要同时修改 op-node 派生、kona（含 SP1 vkey 更新）和 op-geth / reth 验块，成本远高于 builder 层 | 由 M33、M34 推出 | inferred | F12 |
| D13 | 在单一 sequencer 的 Mantle 上，Prop AMM 报价更新可直接在 builder 内实现 PUR 式插入（更新排在第一个读者之前，未读的丢弃），无需 BAP-710 的多 builder relayer，但 RPC 需提供未上链报价的叠加视图 | 由 B30、B36、B38 推出；属于设计建议 | inferred | F5、F11 |
| D14 | 当前 rollup-boost 式回退会静默取消应用级排序；Mantle 若引入 builder 层排序，fallback 路径必须实现同样的车道策略，否则应暂停受保护操作 | 由 B12、B14、B15 推出；属于设计建议 | inferred | F12、S |
| D15 | 应用自定义排序规则在 Mantle 上必须配套冲突处理（拒绝 / 延后其中一笔，或只开放规则兼容的模板），否则会出现 ACE §3.2 的无解循环 | 由 L33、L36、L37 推出；属于设计建议 | inferred | F8、R |
| D16 | 支付 FCFS 宜定义为“当前可执行交易队头之间先到先服务”，并为支付提供独立 nonce 域（Mantle 路线图的 EIP-8130 / 2D nonce），否则同账户其他交易会阻塞支付 | 由 L42、L43、M29、M41 推出；属于设计建议 | inferred | F10、Q |
| D17 | Angstrom L2 式 MEV tax 在 Mantle 上只能直接用于 MNT/X 池，且要求 sequencer 公开承诺 competitive priority ordering；参与竞争的交易不能进入 FIFO 车道 | 由 M37、M39、M40、A23、A33 推出 | inferred | F11、R |
| D18 | 要证明“车道排序被遵守”，Mantle 需要公开接收回执与候选集，而不只是 TEE 证明；可借用 2024 Mantle fair sequencing 提案中的“带批次号回执 + 争议”思路 | 由 B19、B20、L45、D7 推出；属于设计建议 | speculative | F12、S |
| D19 | Mantle 第一阶段的车道比例（例如支付保底 5–10%、维护车道上限约 5%）应从回放 / 影子调度中测出，本报告不给定值 | 由 L17（BSC 默认 5%、上限 10%）类比；无 Mantle 实测数据 | speculative | F11、R、S |
| D20 | Arbitrum 从 Timeboost 转向“短轮次小费排序 + 防饿死”的提案，说明“内层小费、外层纳入保证”的组合有现实需求；防饿死机制可作为 Mantle 支付纳入保证的参照 | 由 B28、B29 推出 | inferred |  |

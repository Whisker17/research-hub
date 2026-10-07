# Lane：其他同步可组合路线对比（brief 研究问题 4）

**研究问题**：shared sequencer、based rollup、real-time proving、AggLayer、OP Superchain interop、Arbitrum / intents / EIL 等路线分别能给出什么程度的“同步 / 原子”？信任假设是什么？截至 2026-10 进展到哪一步？EEZ 属于哪一类？
**一句话答案**：只有“预计算跨域执行 + 在同一个 L1 slot 内验证（证明或签名）+ 由一个 builder 原子打包”这一类设计（EEZ、Gwyneth ULTRA TX、SCOPE L1↔L2，以及 Vitalik 提的 based/sequenced 混合方案）能做到 **L1↔L2 带返回值的真同步调用**。shared sequencer 只能保证原子打包；OP interop 和 AggLayer 是同时间戳或异步的消息传递；intents 是“结果原子、过程异步”。截至 2026-10-06，这一类里只有 EEZ 在以太坊主网上跑通过一笔交易，用的是 65 字节 ECDSA 签名证明，不是实时 ZK 证明。其余同类方案都还在设计 / 内部演示阶段；OP interop（Lagoon）尚未定档；Astria 已于 2025-12 停机。

---

## 1. Shared sequencer（Astria、Espresso，以及基于它的 CIRC / Compose）

**答案**：只有共享排序时，能保证的是**原子包含**：多条链的交易按同一个顺序一起打包，要么都进、要么都不进。它**不能**保证执行结果一致，执行时也拿不到对方链的返回值。要做到同步，还需要在 shared sequencer 之上叠加三样东西：一个预先模拟跨链调用的 coordinator、预先填好的 mailbox，以及在 L1 结算时用聚合证明检查 inbox/outbox 一致性。这就是 Espresso 的 CIRC 和 Compose 的 Shared Publisher。即使这样，它们的设计目标也只覆盖 L2↔L2，不覆盖 L1↔L2。

**依据**：
- Espresso 官方文档的定位是确认层 / 最终性层：“Espresso does not execute transactions”；“Each integrated system keeps its own execution environment, sequencer…”。文档全文没有提同步可组合 [7]。
- CIRC：跨链消息“are pre-populated by the Shared Sequencer (a.k.a Coordinator) in the chain inboxes”。一致性由 L1 上的 Settlement Layer Contract 验证聚合证明来强制，检查条件是 `inbox_1 ∪ … ∪ inbox_n = outbox_1 ∪ … ∪ outbox_n`。文档自述目标是“synchronous composability across L2s” [6]。
- Compose 规范：用两阶段提交（2PC）协调跨链交易的包含，再用“a single ZK proof”在 L1 上让各链同时结算。README 只谈 rollup 之间的组合 [36]。
- 在 EEZ 帖下，thegaram33 追问“shared sequencer can ensure atomicity, but how can it guarantee atomicity to the sender”。Jordi 的回答是：原子性“enforced by the protocol's validity rules and checked as part of the proof”，也就是说靠证明，不靠排序者自律 [1]。
- Astria：多家媒体引述团队 X 帖，称网络于 2025-12 前后在区块 15,360,577 “intentionally halted” [8]（二手来源）。

**不确定之处**：Astria 停机只有二手报道；团队 X 原帖没有直接访问到。CIRC 和 Compose 的主网状态在文档里没有写明；从文档措辞（“proposed”“minimal implementation”）推断，它们仍处在规范 / 原型阶段。

## 2. Based rollup 与 based 同步可组合（Taiko、Gwyneth / ULTRA TX、Spire、Puffer UniFi、Vitalik 混合方案）

**答案**：based rollup 由 L1 proposer / builder 决定 L2 排序，所以 L2 块可以和 L1 交易进入同一个 L1 块，这是与 L1 同步的**前提**之一。真正的同步还需要另外两件事：(a) 在同一个 slot 内产出 L2 有效性证明（real-time proving，Spire 称之为“shared finality”）；(b) 一个 super / master builder 同时模拟 L1 和 L2，并把模拟结果原子地打包进 L1。

Taiko Alethia 主网目前的排序由 3 家白名单 preconfer 负责，证明在提交后异步补交（证明窗口 4 小时），所以**不提供** L1 同步可组合。Gwyneth 截至 2025-11 仍是设计加内部演示；Spire 已暂停 Based Stack 开发；Puffer UniFi 在 2025-08 处于测试网 V2。

**依据**：
- Justin Drake 原帖（2023-03-10）对 based rollup 的定义：“the next L1 proposer may … permissionlessly include the next rollup block as part of the next L1 block”。原帖列出的缺点包括 preconfirmation 难做、拿不到 MEV，**没有**宣称同步可组合 [5]。
- Vitalik 帖（2026-01-16，作者由回帖推断）：based rollup “can offer synchronous composability with the Ethereum L1… by directly containing an entire L2 block, and taking actions before and after it, including post-assertions that revert everything”。该帖提出 sequenced 块与 based 块的混合方案。评论区 jvranek 指出原子性要求“prove the L2's STF within one L1 slot”，Vitalik 承认需要 streaming prover [4]。
- Taiko preconf 文档：当前处于“Stage 1: Whitelisted Preconfirmations”，由 Nethermind、Chainbound、Gattaca 三家运营；质押加 slash 的 Stage 2 仍是“Planned” [9]。
- Taiko 证明系统文档：先 propose，后单独调用 `prove`；主网 Unzen 要求 SGX+ZK 或双 ZK 的证明组合；Proving window 为 4 hours [10]。
- ULTRA TX 帖（2025-11-11）：master builder 把 L1 AA 交易、多条 L2 的块、证明和跨链调用的返回值打包进一笔 L1 交易，“reverting the whole ULTRA TX on any mismatch”。帖中同时写明“Full L1↔L2 synchronicity with proofs under 12s is still an active engineering goal”和“Proving is still under development, SGX and TDX coming soon” [11]。Taiko 2025 Q3 更新称已完成“design and internal demos of cross-chain atomic transactions using Gwyneth” [12]。
- Spire：“Spire Labs has paused development on the Based Stack”。原文还写道：“Two things are required for synchronous composability: coordinated sequencing and shared finality… must use validity proofs… proof generation latency is crucial” [13]。
- Puffer：UniFi Testnet V2 于 2025-08-14 发布，路线图写的是“multi-TEE real-time proving, preconfirmations, bedrock for L1↔L2↔L2 composability” [14]。

**不确定之处**：Gwyneth 在 2026 年的进展没有找到一手更新；Puffer UniFi 2026 年的状态也未核实。Spire 有一条 2025-10 的 LinkedIn 帖，称其 Pylon “unlocks synchronous composability”（Arbitrum→appchain），机制没有核实，标 speculative。

## 3. Real-time proving：为什么是 L1↔L2 同步的前提，现在多快多贵

**答案**：L2→L1 的那一段如果要在同一个 L1 块里被 L1 合约当作有效结果消费，L2 状态转换的正确性就必须在**这笔 L1 交易执行时**已经得到验证。所以证明（或别的验证手段）必须在 slot 截止前生成好。L2↔L2 的同步则可以延后一起结算，不强制要求实时证明（SCOPE 原文）。

L1 区块的证明速度已经达到 EF 定义的“实时”线，但量的口径是“块出完之后证明 L1 块”：
- EF 2025-12：99% 的块在目标硬件上 10 s 内证完；
- Succinct 2025-11：16×RTX 5090，99.7% 的块 <12 s，95.4% 的块 <10 s；
- Brevis 2026-07：16 GPU，P99 9.14 s，平均 4.87 s，硬件约 10 万美元。

把这些数字套到“出块前就要拿到证明”的同步场景，延迟预算更紧。EF 设定的安全里程碑（2026 年中 100-bit，年底 128-bit 可证明安全）当时也尚未完成。EEZ 主网目前使用 ECDSA 签名，而不是 ZK 证明。

**依据**：
- SCOPE 原文：“because the L2 must consume L1 state, it must simulate and settle within the same L1 slot, introducing a real-time proving requirement not present in the L2↔L2 case” [3]。
- EF 对“实时证明”的定义（2025-07-10）：mainnet 块的 P99 ≤10 s、CAPEX ≤10 万美元、功耗 ≤10 kW、安全性 ≥128 bit、证明 ≤300 KiB [15]。
- EF 2025-12-18：“proving latency dropped from 16 minutes to 16 seconds, costs collapsed 45×, and zkVMs now prove 99% of all Ethereum blocks in under 10 seconds on target hardware”；同时“security still remains the elephant in the room”，里程碑截至 2026 年底 [16]。
- Succinct：在 954 个块的样本上，16×RTX 5090 下 99.7% 的块 <12 s、95.4% 的块 <10 s（页面未标日期，配图路径显示 2025/11）[17]。
- Brevis Pico Prism 2.1（2026-07-28）：测试区块 24,000,000–24,007,199，60M gas limit，16 GPU，99.9% 的块 <10 s，P99 9.14 s [18]。
- Jordi（2026-02-02）：“proving a full Ethereum block requires around 12 GPUs with an average proving time of ~7 seconds” [1]。
- EEZ 主网交易的 proof 是 65 字节 ECDSA 签名（主会话解码）[37]。eez-rollup0 README 写明“This is not yet a succinct validity proof” [35]。

**不确定之处**：上面的数字都是各团队自测，L1 区块口径，不是“L2 块加跨链 witness 在 slot 截止前出证明”的口径。ZisK 的 4-GPU P99 9.62 s 只见于 CryptoSlate 二手报道 [39]，不采用。Ethproofs 实时面板这次没有抓取。

## 4. AggLayer（Polygon）

**答案**：AggLayer 是**异步**互操作。资产 / 消息经 Unified Bridge 先在 Ethereum 结算，然后才能在目标链 claim。pessimistic proof 的作用是一道“金融防火墙”：一条链被攻破时，损失不超过它自己的存款。它不证明跨链调用能同步拿到返回值。官方营销里的“atomic”指的是资产移动不可分割，不是跨链调用栈的同步。“fast interop（<5 s）”是规划中的能力。

**依据**：
- 官方文档：Unified Bridge “ensuring cross-chain transactions are indeed finalized on the L1 before they can be claimed”；同一页又有“Atomic cross-chain execution: Guarantees that assets and messages move between chains in a single, indivisible step” [19]，两处说法存在张力。
- Pessimistic proof：“prevents compromised chains from draining funds beyond their deposits”；它检查的状态转换只覆盖 Local Exit Tree、Local Balance Tree、Nullifier Tree 这三棵桥账本树 [20]。
- v0.2 于 2025-02-03 在主网启用 pessimistic proof（Polygon 论坛公告）[21]。agglayer.dev 写的是“When Agglayer spins up fast interop, it will provide safe, sub five second interoperability”（将来时）[22]。
- SCOPE 的对比：“AggLayer and similar protocols do not natively support synchronous return values from cross-chain calls” [3]。

**不确定之处**：v0.3（2025-06，带 execution-proof 模式）只有二手来源（L2BEAT 月报、ETH Daily）。fast interop 在 2026 年的实际上线情况没有查到一手证据。

## 5. OP Superchain interop

**答案**：OP interop 是**同时间戳内的消息传递**，不是同步调用。一条跨链消息由两笔交易组成：源链 emit 一个 log 作为 initiating message，目标链经 `CrossL2Inbox` 执行 executing message。只要时间戳满足 ≤ 约束，同一时间戳甚至同一块内都可以执行。调用方拿不到返回值。

安全上，依赖集合内各链的 sequencer 负责在包含消息前做校验；如果引用了无效消息，fork choice 会把包含它的块 reorg 掉；最终由 super root 故障证明兜底。它只覆盖 dependency set 内的 L2，不覆盖 L1↔L2 同步。

截至 2026-10-06，承载 interop 的硬分叉 Lagoon 在官方页面上仍是“In development / Not scheduled”。OP Sepolia + Unichain Sepolia 曾计划在 2026 年 7 月激活（主网紧随其后），但通知页仍写着时间戳“not yet finalized”。

**依据**：
- 规范原文：“A total of two transactions are required to complete a cross chain message”；“The chain's fork choice rule will reorg out any blocks that contain an executing message that is not valid”；“the sequencer SHOULD only include an executing message if they have checked its validity” [23]。
- Timestamp Invariant 为 ≤，允许同一时间戳；“it is possible for an executing transaction to be ordered before the initiating message in the same block”；EXPIRY_TIME 为 7 天 [24]。
- interop-prep 通知：计划 2026-07 在两条测试网上激活，“have not yet been finalized”，需要部署 op-supernode [25]。硬分叉表显示 Lagoon“In development｜Not scheduled”；Upgrade 16 已交付“Interop-ready OptimismPortal” [26]。
- SCOPE 认为它可以在 Superchain 上实现 L2↔L2 同步，前提是各 rollup“mutually trust each other's sequencing” [3]。

**不确定之处**：测试网是否已在 2026-07 后实际激活，访问日的官方页面没有更新，无法确认。

## 6. 其他：Arbitrum、EF interop 路线（OIF、EIL、Fast Confirmation、native rollups）、EEZ 定位

**答案**：
- **Arbitrum**：官方路线是“intents 先行 + 跨链操作后续”，配套 Crosschain Broadcaster（基于存储证明的消息认证，速度受最终性限制）。没有同步可组合的产品。
- **EF**：近期把重心放在 intents（OIF / ERC-7683）和通用消息传递上，加上 EIL（ERC-4337 钱包发起、一次签名跨多条 L2）和 Fast Confirmation Rule。2026-03 的 EF 博客明确建议：最想贴近 L1 的 L2 应“push towards synchronous composability… native rollups”，并链接了 EEZ 帖和 Vitalik 帖。
- **EEZ** 自我定位为“L1<>L2 framework”，由 Gnosis 和 ZisK 发起、EF 资助。

**依据**：
- Offchain Labs：第一阶段“Intent-Based Interoperability… less than three seconds”，第二阶段“Crosschain Operations: Targeting the end of Q3 and pending approval from the Arbitrum DAO”。全文没有提 synchronous [27]。Broadcaster：“speed is limited by the finality of chains in a given route” [28]。
- EF EIL（2025-11-18，AA 团队提案）：“users themselves initiate and settle cross-L2 actions directly from their wallets, not through relayers or solvers” [29]。
- EF L1+L2 博客（2026-03-23）：“Synchronous composability (whether read-only eg. L1SLOAD / L1STATICCALL, or read-write)”；“We encourage teams to look into the Open Intents Framework and the Fast Confirmation Rule… and otherwise contribute to ongoing synchronous composability workstreams” [30]。
- EEZ 介绍（页面可见日期 2026-03-29，作者 Friederike Ernst 与 Jordi Baylina）：“It isn't an L2 framework. It's an L1<> L2 framework”；“The Ethereum Foundation is funding this work”；创始成员包括 Aave、Titan、Beaver Build 等（后两者是 builder）[31]。
- GIP-153（created 2026-07-22，phase-3）：Gnosis Chain 转为 EEZ rollup；首版用过渡证明（likely TEE）；“At launch, sequencing is centralized: Gnosis Ltd operates the composer”；“at launch, composability is one-directional”；genesis 目标是 2026-12 至 2027-01；完整规范（双向、嵌套、实时 ZK）预计 2027 年 [32]。

**不确定之处**：Arbitrum 第二阶段是否交付、以什么形态交付，没有查到一手证据。EF 2026 优先级文章称“Open Intents Framework reached production” [38]，这里只看到了搜索摘要。GIP-153 投票结果在页面上看不到。

## 7. 统一对比表

| 路线 | 同步程度 | 原子性来源 | 信任假设 | 需要 real-time proving？ | L1↔L2 同步？ | 成熟度（截至 2026-10-06） |
|---|---|---|---|---|---|---|
| 纯 shared sequencer（Astria、Espresso 确认层） | 原子包含（排序层面），不保证执行，拿不到返回值 | 共享排序 / BFT 确认 | 排序者或 BFT 委员会 | 否 | 否 | Astria 2025-12 停机 [8]；Espresso 确认层主网运行 [7] |
| Shared sequencer + coordinator + 聚合证明（CIRC、Compose、SCOPE L2↔L2） | L2↔L2 真同步（返回值预填进 mailbox / responsesIn） | L1 结算时用聚合证明检查 inbox/outbox 或 rolling hash 一致 | coordinator 管活性，证明管安全；SCOPE 也接受链间互信排序 | L2↔L2 不需要（但各链须一起结算）[3] | 否（CIRC、Compose）[6][36] | 规范 / 原型 |
| Based rollup（Taiko Alethia 现状） | 理论上可与 L1 同块包含；没有同步调用 | L1 排序 | 当前为白名单 preconfer [9] | —— | 否（证明异步，窗口 4 h）[10] | 主网，但不具备同步可组合 |
| Based + super builder + 实时证明（Gwyneth ULTRA TX、SCOPE L1↔L2、Vitalik 混合方案） | 真同步调用，可拿返回值，覆盖 L1↔L2 | 单笔 L1 交易，任何不一致即整体 revert | builder / proposer 协调（活性、审查）；证明（安全） | 是 | 是 | 设计 / 内部演示 [11][12]；提案 [3][4] |
| **EEZ** | 真同步调用，可拿返回值；协议层支持 L1↔L2 和多 rollup | L1 合约执行表、rolling hash、同块消费（`ExecutionNotInCurrentBlock`）、ether delta | 主网为 ECDSA signer；L2 sequencer / composer；L1 builder 原子打包 bundle | 是（无信任版本）；现阶段用签名替代 | 是 | 主网首笔 2026-10-05（ECDSA）[37]；参考实现跑在 Chiado [35]；Gnosis 迁移目标 2026-12 至 2027-01 [32] |
| AggLayer | 异步消息 / 资产；无返回值 | 无跨链调用原子性；pessimistic proof 限制损失 | Agglayer 节点、各链自证、PP | 否 | 异步（先在 L1 结算再 claim） | 主网（v0.2 于 2025-02）[21] |
| OP Superchain interop | 同时间戳消息传递（两笔交易），无返回值 | 无；无效依赖导致 reorg | 依赖集合内的 sequencer（unsafe 级）、super root 故障证明 | 否 | 否 | Lagoon 开发中，未定档 [26] |
| Arbitrum（intents + Broadcaster） | 异步 | 无（intent 结果层面原子） | solver；存储证明受最终性限制 | 否 | 异步 | intents 已规划 / 部分上线；无同步可组合 [27][28] |
| Intents（OIF / ERC-7683、EIL） | 时间上异步，结果原子 | solver 或 XLP 垫资加事后结算 | solver 活性与资本；EIL 主张不新增信任 | 否 | 异步 | OIF 据称已上生产 [38]；EIL 为提案 / 测试 [29] |

## 8. EEZ 与以上路线的异同

**答案**：EEZ 属于“based + super builder + 实时证明”这一族，和 SCOPE、ULTRA TX 是同构设计：链下模拟 L1+L2 → 预计算的执行表 / 响应带证明上链 → L1 真实执行时用 rolling hash 比对 → 不一致就整体 revert。Jordi 帖下也有人指出，EEZ 的执行表本质上就是 CIRC 式 mailbox 的一个变体。

EEZ 与另外两者的差别：
- 用 L1 上的 CrossChainProxy 代表远端合约，而不是 ULTRA TX 的 precompile 标记，也不是 SCOPE 的 `scopedCall()`；
- 证明系统可配置（multi-prover），主网目前接的是 ECDSA；
- 不要求 L1 分叉。

**是否依赖 based rollup**：core README 写的是“based rollups sharing the same L1 sequencer”，但参考实现 eez-rollup0 用的是**自有 sequencer + composer**，跨链 bundle 交给 L1 builder 原子打包；Gnosis 的首版也是集中式 composer。所以 EEZ 实际依赖的是：
- 在目标 L1 块内，由同一个协调者（composer 加愿意原子打包的 L1 builder）决定 L1 与 L2 的相关顺序；
- L2 的跨链部分由 composer 独占排序；
- 证明在同一个 slot 内交付。

它**不要求**由 L1 proposer 无许可地给 L2 排序（即 Drake 定义的 based）。“based”在 README 里更接近“与 L1 共享同一个排序时刻 / builder”的意思（inferred）。

**依据**：
- core README L9 [33]；EEZ.sol L33-39 描述执行表加预计算比对，L218-219 是同块错误 [34]；
- rollup0 README：sequencer + composer 架构（L3-9）；bundle 要求“land in the *same* L1 block — all or nothing”（L16-20）；“Cross-chain batches are submitted to Chiado's block builder”（L42-44）；“rbuilder-chiado silently drops the excess beyond ~3”（L155-158）[35]；
- GIP-153 的集中式 composer [32]；
- Ellie Davidson 的回帖：“The execution table could be viewed as a version of a mailbox” [1]；
- Jordi 回帖：“The shared sequencer defines a single linear execution order across L1 and L2s for a given slot” [1]。

**不确定之处**：主网首笔交易的 L1 builder 是谁、是否走了私有 bundle 通道，本 lane 没有核实。EEZ 后续会不会改为由 L1 proposer 选举 / 无许可的 composer，官方没有承诺（GIP-153 写的是“no commitment on the future of sequencing”）。

## 9. Intents 与同步可组合的关系

**答案**：两者互补，不是二选一。intents 面向“用户想要的结果”，由 solver 垫资、事后结算，时间上异步、结果上原子，适合转账 / 兑换 / L2→L1 提款这类结果可预先声明的场景。同步可组合面向“执行过程中依赖对方返回值”的逻辑，比如闪电贷、跨域套利、清算、读远端状态，这类场景很难用 intent 写清楚。

另外，“atomic + synchronous”并不自动带来 non-interleaving（中间态不被插入）。在 EEZ 帖里，这一点由“同一 slot 内单一线性顺序”加证明来回答。

**依据**：
- 23426（Alon Muroch，2025-11-11）：SC 是“protocol-level”，intents 是“user-level”；intents “asynchronous in time but atomic in outcome”；闪电贷、跨 rollup 清算等“cannot be replicated with intents”；并且“L2->L1 bridging, Intents excel in it… At least until real-time ZK proving is widespread” [2]。
- thegaram33 在 23426 和 23998 中都提出了 non-interleaving 问题 [2][1]；Jordi 回答“Concurrent interleavings… within the same slot are not allowed, because the sequencer commits to a total order” [1]。
- GIP-153 首版用 intents 桥覆盖双向原子桥接，作为同步能力的过渡 [32]。
- EF 同时推进 OIF / EIL 和同步可组合 [29][30]。

**不确定之处**：23426 的作者属于 Compose / SSV 阵营，文中对 SC 的“instant”“as expressive as Ethereum”等表述带有倡导立场，应作为观点而非事实引用。

---

## 图的素材

**A. 路线光谱（从弱到强）**
1. 异步消息 / 桥（AggLayer、Arbitrum Broadcaster）：先结算后 claim [19][28]
2. intents：结果原子，solver 垫资 [2]
3. 同时间戳消息传递（OP interop）：两笔交易，无效依赖则 reorg [23][24]
4. 原子包含（纯 shared sequencer）[7][8]
5. L2↔L2 真同步（CIRC / Compose / SCOPE L2↔L2：预填 mailbox + 聚合证明）[3][6][36]
6. L1↔L2 真同步（EEZ / ULTRA TX / SCOPE L1↔L2：super builder + 同 slot 证明）[3][11][34]

**B. L1↔L2 真同步的通用时序（EEZ、SCOPE、ULTRA 的共同骨架）** [1][3][11][35]
1. 用户交易 → composer / super builder（eez-rollup0 中是“ingress front”）
2. builder 用 L1 状态加 L2 状态联合模拟，得到执行表 / 响应以及 L2 新状态根
3. prover / signer 对公共输入出证明（EEZ 主网为 ECDSA；目标为实时 ZK）
4. builder 把 [postAndVerifyBatch + 用户 L1 交易] 作为 bundle 交给 L1 builder，要求同块、全有或全无
5. L1 执行：先验证证明，再在 proxy 被调用时消费执行表条目，比对 rolling hash，返回预计算结果
6. 任一不一致 → revert；L2 侧回滚已提前提交的 Sync block
7. follower 从 L1 事件重新派生 L2

**C. Based 与 sequenced 混合方案（Vitalik）的状态与转移** [4]
- 状态：Regular sequenced block → Slot-ending sequenced block → Based block（任何人可构建，仅限当前 slot）
- 转移条件：sequencer 在接近 slot 末尾时发布 slot-ending 块；本 slot 若没有 based 块被包含，下个 slot 直接接在 slot-ending 块之后；连续超过 10 个 slot 没有 L1 块 → 自动进入 based 模式（Vitalik 回帖设想）

**D. 对比维度**（见第 7 节表格）：同步程度、原子性来源、信任假设、是否需要 RTP、能否 L1↔L2、成熟度。

**E. 实时证明进展时间轴**
- 2025-05：SP1 Hypercube，93% 的块 <12 s [17]
- 2025-07-10：EF 定义实时证明：P99 ≤10 s、≤10 万美元、≤10 kW [15]
- 2025-11：SP1，16×5090，99.7% 的块 <12 s [17]
- 2025-12-18：EF 宣布 99% 的块 <10 s，下一步转向安全性 [16]
- 2026-02-02：Jordi 引用约 12 GPU、约 7 s [1]
- 2026-07-28：Pico Prism 2.1，P99 9.14 s，16 GPU [18]
- 2026-10-05：EEZ 主网首笔交易仍用 ECDSA [37]

## 代码素材

EEZ 执行条目“预计算 + 实际执行比对 + 整体 revert”的语义（eez-core-protocol/src/EEZ.sol#L33-L39@6ae4110）：
```solidity
/// @dev An execution entry combines a proven state transition for its rollups (`rollupUpdates`)
///      with a pre-computed L1 execution: the cross-chain calls to run and the expected results
///      (rolling hash, return data). The live execution must match the precomputation, otherwise
///      the whole execution — and with it the state update — reverts.
///      Execution entries are posted via `postAndVerifyBatch(batch)`,
///      attested by ≥ threshold proof systems per rollup. Atomic verification: if any single
///      proof fails, the whole batch reverts.
```
链接：https://github.com/eez-association/eez-core-protocol/blob/6ae4110fb748fd10882d5afea576fbd1a5c38fc3/src/EEZ.sol#L33-L39

同块约束（eez-core-protocol/src/EEZ.sol#L218-L219@6ae4110）：
```solidity
/// @notice Error when execution is attempted in a different block than the last state update for that rollup
error ExecutionNotInCurrentBlock(uint64 rollupId);
```
链接：https://github.com/eez-association/eez-core-protocol/blob/6ae4110fb748fd10882d5afea576fbd1a5c38fc3/src/EEZ.sol#L218-L219

参考实现对 L1 builder 原子打包的依赖（eez-rollup0/README.md#L155-L158@6ff63ec）：
```text
`EEZ_MAX_USER_TXS_PER_BUNDLE` (compose, default `3`) caps how many user
cross-chain txs ride in one `postBatch` bundle. Raise it only against a builder
proven to include larger bundles atomically — rbuilder-chiado silently drops the
excess beyond ~3, which is lost tx inclusion, so measure before bumping.
```
链接：https://github.com/eez-association/eez-rollup0/blob/6ff63ecd7fef61e4826236a11a5d7e172fa6c368/README.md#L155-L158

## 来源

1. **PRIMARY** Jordi Baylina，“Synchronous Composability Between Rollups via Realtime Proving”，ethresear.ch/t/23998（2026-02-02），含 thegaram33、Ellie Davidson、Tim Clancy 等的回帖；访问日期 2026-10-06。证明了：EEZ 的设计（proxy、执行表、单一证明）、12 GPU / ~7 s 的数据、shared sequencer 定义单一线性顺序、执行表与 mailbox 同构，以及有人担心 builder 审查和缺乏证明基础设施的 proposer。
2. **PRIMARY** Alon Muroch，“Synchronous Composability vs. Intents”，ethresear.ch/t/23426（2025-11-11），含 thegaram33 的回帖；访问日期 2026-10-06。证明了：SC 与 intents 的分层（协议层 vs 用户层），各自适用的场景，以及 non-interleaving 问题。
3. **PRIMARY** jvranek（Jason Vranek），“SCOPE: Synchronous Composability Protocol for Ethereum”，ethresear.ch/t/22978（2025-08-25）；访问日期 2026-10-06。证明了：L1↔L2 同步需要 super builder、L1 proposer 协调和实时证明，L2↔L2 不需要实时证明；AggLayer 不支持同步返回值。
4. **PRIMARY** “Combining preconfirmations with based rollups for synchronous composability”，ethresear.ch/t/23863（2026-01-16；作者 vbuterin，由回帖推断）；访问日期 2026-10-06。证明了：based rollup 可通过把整个 L2 块装进 L1 交易实现与 L1 同步；sequenced/based 混合方案；需要实时 / 流式证明。
5. **PRIMARY** Justin Drake（由回帖推断），“Based rollups—superpowers from L1 sequencing”，ethresear.ch/t/15016（2023-03-10）；访问日期 2026-10-06。证明了：based rollup 的定义，以及原帖并未宣称同步可组合。
6. **PRIMARY** Espresso Systems，“CIRC: A Protocol for Cross-Rollup Communication”，hackmd.io/@EspressoSystems/HyiHI5RUbl（未标日期）；访问日期 2026-10-06。证明了：L2↔L2 同步依赖 coordinator 预填 inbox 加 L1 聚合证明。
7. **PRIMARY** Espresso 文档 docs.espressosys.com/network；访问日期 2026-10-06。证明了：Espresso 是确认 / 最终性层，不执行交易，各链保留自己的 sequencer。
8. The Block，“Celestia-based Astria Network sunsets its shared sequencer network…”（2025-12-02）；访问日期 2026-10-06。二手来源；证明了：Astria 网络在区块 15,360,577 停机。
9. **PRIMARY** Taiko 文档 docs.taiko.xyz/protocol/preconfirmations；访问日期 2026-10-06。证明了：当前是白名单 preconfer（Nethermind、Chainbound、Gattaca），质押阶段仍在规划。
10. **PRIMARY** Taiko 文档 docs.taiko.xyz/protocol/proving-system；访问日期 2026-10-06。证明了：主网 Unzen 先 propose 后 prove，证明窗口 4 小时，要求 SGX+ZK 或双 ZK。
11. **PRIMARY** Taiko Labs，“ULTRA TX & Gwyneth — Synchronous composability across L1 & L2”，paragraph.com/@taiko-labs（2025-11-11）；访问日期 2026-10-06。证明了：master builder 的单笔 L1 交易设计；实时证明仍是工程目标，证明系统尚在开发。
12. **PRIMARY** Taiko Labs，“Taikolights Q3 2025 community update”，paragraph.com/@taiko-labs（只看了搜索摘要）；访问日期 2026-10-06。证明了：Gwyneth 已完成设计和内部演示。
13. **PRIMARY** Spire 文档“What's holding L2 based rollups back today”，docs.spire.dev（未标日期）；访问日期 2026-10-06。证明了：Spire 暂停 Based Stack；同步需要协调排序加共享最终性（有效性证明）。
14. **PRIMARY** Puffer 博客“Puffer UniFi Testnet V2 is now live!”（2025-08-14，只看了搜索摘要）；访问日期 2026-10-06。证明了：UniFi 处于测试网，路线图包含 multi-TEE 实时证明。
15. **PRIMARY** EF 博客“Shipping an L1 zkEVM #1: Realtime Proving”（2025-07-10）；访问日期 2026-10-06。证明了：实时证明的官方口径（P99 ≤10 s、≤10 万美元、≤10 kW、≥128 bit、≤300 KiB）。
16. **PRIMARY** EF 博客“Shipping an L1 zkEVM #2: The Security Foundations”（2025-12-18）；访问日期 2026-10-06。证明了：99% 的块 <10 s，成本下降 45 倍；安全性是剩余难点，并给出 2026 年里程碑。
17. **PRIMARY** Succinct，“SP1 Hypercube Achieves Real Time Proving with 16 GPUs”（约 2025-11）；访问日期 2026-10-06。证明了：16×5090 下 99.7% 的块 <12 s、95.4% 的块 <10 s。
18. **PRIMARY** Brevis，“Pico Prism 2.1”（2026-07-28）；访问日期 2026-10-06。证明了：16 GPU 下 P99 9.14 s，99.9% 的块 <10 s（L1 区块口径）。
19. **PRIMARY** Polygon 文档 Agglayer architecture；访问日期 2026-10-06。证明了：四个组件；跨链交易须先在 L1 最终确定才能 claim；文档对“atomic”的措辞。
20. **PRIMARY** Polygon 文档 Pessimistic Proof architecture；访问日期 2026-10-06。证明了：PP 是金融隔离机制，只证明桥账本树的变化。
21. **PRIMARY** Polygon 论坛“Announcement: Upcoming Agglayer Release (v0.2)”（2025-01-29，只看了搜索摘要）；访问日期 2026-10-06。证明了：2025-02-03 主网升级启用 pessimistic proof。
22. **PRIMARY** agglayer.dev/learn-deep-dive（只看了搜索摘要）；访问日期 2026-10-06。证明了：fast interop（<5 s）是将来时的规划。
23. **PRIMARY** OP Stack 规范 specs.optimism.io/interop/overview.html；访问日期 2026-10-06。证明了：跨链消息需要两笔交易；无效执行消息会被 reorg；sequencer 应先校验。
24. **PRIMARY** OP Stack 规范 specs.optimism.io/interop/messaging.html；访问日期 2026-10-06。证明了：时间戳 ≤ 不变量、同块乱序可行、7 天过期。
25. **PRIMARY** OP 文档 docs.optimism.io/notices/interop-prep；访问日期 2026-10-06。证明了：测试网计划 2026-07 激活，时间戳未定，需要 op-supernode。
26. **PRIMARY** OP 文档 network-upgrades 与 hardforks/lagoon；访问日期 2026-10-06。证明了：Lagoon（interop）“In development / Not scheduled”。
27. **PRIMARY** Offchain Labs，“Bringing Interoperability to Arbitrum”（2025-02）；访问日期 2026-10-06。证明了：Arbitrum 先 intents 后跨链操作，文中没有同步可组合。
28. **PRIMARY** Offchain Labs，“Introducing the Crosschain Broadcaster”；访问日期 2026-10-06。证明了：基于存储证明的消息认证，速度受最终性限制。
29. **PRIMARY** EF 博客“Making Ethereum Feel Like One Chain Again”（EIL，2025-11-18）；访问日期 2026-10-06。证明了：EIL 是 AA 团队的提案，基于 ERC-4337，由钱包发起跨 L2 操作。
30. **PRIMARY** EF 博客“How L1 and L2s can build the strongest possible Ethereum”（2026-03-23）；访问日期 2026-10-06。证明了：EF 建议最贴近 L1 的 L2 追求同步可组合 / native rollup，同时推荐 OIF 和 FCR。
31. **PRIMARY** EEZ，“Introducing the Ethereum Economic Zone”，eez.io（可见日期 2026-03-29）；访问日期 2026-10-06。证明了：EEZ 定位为 L1<>L2 框架，由 EF 资助，创始成员中有 builder。
32. **PRIMARY** Gnosis 论坛 GIP-153（created 2026-07-22）；访问日期 2026-10-06。证明了：首版 TEE 过渡证明、集中式 composer、单向组合、2026-12 至 2027-01 的 genesis 目标，完整规范预计 2027 年。
33. **PRIMARY** eez-core-protocol/README.md#L9@6ae4110。证明了：README 把 EEZ 表述为“based rollups sharing the same L1 sequencer”之间的同步可组合。
34. **PRIMARY** eez-core-protocol/src/EEZ.sol#L33-L39、#L218-L219@6ae4110。证明了：预计算比对加整体 revert 的语义；执行必须与状态更新处于同一块。
35. **PRIMARY** eez-rollup0/README.md#L3-L9、#L16-L24、#L29-L32、#L42-L44、#L155-L158@6ff63ec。证明了：参考实现由 sequencer 加 composer 组成，L1 测试网为 Chiado；同块全有或全无的 bundle 交给 L1 builder；证明是 ECDSA 签名而非 succinct validity proof；rbuilder 会丢弃超过约 3 笔的部分。
36. **PRIMARY** compose-network/specs README（GitHub，访问日期 2026-10-06，未固定 commit）。证明了：Compose 用 2PC 加单一 ZK 证明结算，面向 rollup 之间。
37. **PRIMARY**（链上数据，主会话解码）以太坊区块 26127444：tx#31 `postAndVerifyBatch` 带 1 个 blob，proof 为 65 字节 ECDSA 签名；tx#32 为用户的 0xd0cbfef7…。证明了：主网首笔交易用的是签名证明，不是 ZK。
38. EF 博客“Protocol Priorities Update for 2026”（2026-02-18，只看了搜索摘要）；访问日期 2026-10-06。证明了：EF 自述“Open Intents Framework reached production”。
39. CryptoSlate，“Ethereum's 12-GPU proving problem just got a 4-GPU answer”（2026-08-19）；访问日期 2026-10-06。二手来源；仅作线索：ZisK 自称在 4×5090 上 P99 9.62 s。

## 外部调研中被修正或无法核实的地方

- GPT 结果**几乎没有覆盖**本 lane 要求的各路线对比（shared sequencer、AggLayer、OP interop、based rollup 都只是一笔带过或缺失）。本 lane 的结论全部来自上面的一手来源，不依赖 GPT。
- GPT §1.3 称“不能仅凭默认部署脚本反向断定主网交易一定使用 ECDSA”。这一点现已可以确认：主会话解码显示 proof 是 65 字节 ECDSA 签名 [37]，与 rollup0 README 的“not yet a succinct validity proof”一致 [35]。
- GPT §9.3 对 GIP-153 的描述（TEE 过渡、集中式 composer、实时 ZK 后续）属实 [32]。需要补充：GIP-153 的 created 日期是 2026-07-22；genesis 目标为 2026-12 至 2027-01；“at launch, composability is one-directional”；完整规范预计 2027 年。
- GPT §13.2 说 ethresear.ch 把闪电贷、套利、清算列为同步可组合的目标，属实 [2]。但该文作者属于 Compose 阵营，有倡导立场，应作为观点引用。
- GPT §14.4 把“builder 集中、私有订单流、强制包含”的担忧归给 23998。这些担忧来自**回帖**（Tim Clancy），不是 Jordi 原帖 [1]。
- 常见误解（GPT 未直接写，但页面需要防范）：“based rollup 天然与 L1 同步可组合”。Drake 原帖并没有这个主张 [5]；Taiko 主网是 based，但证明异步，不具备同步能力 [10]；Spire 明确把缺少共享最终性列为阻碍 [13]。
- GPT §13.5 说 intents 与 SC“不是二选一”，与 [2] 和 EF 路线 [30] 一致，保留。

## 开放问题

1. EEZ 主网首笔交易的 L1 区块由哪个 builder 构建？bundle 走公开 mempool 还是私有通道？如果只有少数 builder 支持原子 bundle，同步交易的活性和审查风险有多大？（参见 [1] 的 Tim Clancy 回帖）
2. EEZ README 所说的“based”具体指什么：L1 proposer 排序，还是“共享 L1 builder”？后续会不会引入无许可的 composer？
3. 实时证明的口径落差：现有基准都是“块出完后证明 L1 块”，而同步交易需要“slot 截止前证明 L2 块加跨链 witness”。目前没有公开的端到端（模拟 + witness + 证明 + 提交）基准。
4. OP interop（Lagoon）的测试网在 2026-07 之后是否实际激活？主网的时间？
5. Gwyneth、Puffer UniFi、Compose、CIRC 在 2026 年是否有测试网或主网进展？
6. AggLayer fast interop 是否已经上线？它用的是什么信任模型（例如 sequencer 预确认）？
7. 对 Mantle L2↔L3：如果 Mantle L2 本身就是 L3 的共同提交点，Mantle L2 的中心化 sequencer 能直接扮演 EEZ 里“L1 builder”的角色。这会让 L1↔L2 场景下的 builder 协调问题大幅简化（inferred，需要和 Mantle lane 交叉核对）。

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| A1 | Espresso 网络不执行交易，定位为确认 / 最终性层，各链保留自己的 sequencer | [7] docs.espressosys.com/network：“Espresso does not execute transactions”“keeps its own… sequencer” | observed | |
| A2 | 只有 shared sequencer 时，能保证的是原子包含，不能保证同步执行和返回值 | 由 A1、A3 推出：确认层不执行交易；CIRC 需要额外的 coordinator 预填 inbox 并在 L1 用证明检查一致性，才能实现同步 | inferred | |
| A3 | CIRC 通过 coordinator 预填各链 inbox，并在 L1 用聚合证明检查 inbox 并集等于 outbox 并集，实现 L2↔L2 同步 | [6] CIRC hackmd：“pre-populated by the Shared Sequencer (a.k.a Coordinator)”，以及 inbox/outbox 一致性条件 | observed | |
| A4 | CIRC 和 Compose 的同步可组合目标是 L2↔L2，没有宣称 L1↔L2 | [6]“synchronous composability across L2s”；[36] Compose README 只描述 rollup 网络 | observed | |
| A5 | Compose 用两阶段提交协调包含，再用单一 ZK 证明在 L1 同时结算各链 | [36] compose-network/specs README | observed | |
| A6 | Astria 共享排序网络已于 2025-12 停机，最后区块为 15,360,577 | [8] The Block 2025-12-02 引述团队 X 帖（二手来源，多家报道一致） | observed | |
| A7 | Jordi 认为同步交易对发送者的原子性靠证明强制，而不是靠排序者自律 | [1] 23998 回帖：“enforced by the protocol's validity rules and checked as part of the proof” | observed | |
| A8 | 在 EEZ 设计中，shared sequencer 为每个 slot 定义 L1 与 L2 的单一线性顺序，不允许交错 | [1] 23998 Jordi 回帖：“Concurrent interleavings… within the same slot are not allowed” | observed | |
| A9 | Drake 的 based rollup 原帖定义了 L1 proposer 无许可包含 L2 块，但没有宣称同步可组合 | [5] ethresear.ch/t/15016 正文与缺点清单 | observed | |
| A10 | Vitalik 的帖子认为 based rollup 可以把整个 L2 块装进 L1 交易并加后置断言，从而实现与 L1 同步 | [4] 23863 正文：“directly containing an entire L2 block… post-assertions that revert everything” | observed | |
| A11 | based 与 L1 的同步还要求在一个 L1 slot 内证明 L2 状态转换 | [4] jvranek 回帖：“prove the L2's STF within one L1 slot”；[13] Spire“must use validity proofs… latency is crucial” | observed | |
| A12 | Taiko Alethia 当前由 3 家白名单 preconfer 排序，质押 / slash 阶段仍在规划 | [9] Taiko preconf 文档“Stage 1… (Current)”“Stage 2… (Planned)” | observed | |
| A13 | Taiko 主网先 propose 后单独 prove，证明窗口 4 小时，要求至少一个 ZK 证明 | [10] Taiko proving-system 文档 | observed | |
| A14 | Taiko 主网目前不提供与 L1 的同步可组合 | 由 A11、A13 推出：同步需要同 slot 证明，而 Taiko 的证明是异步补交（窗口 4 h） | inferred | |
| A15 | Gwyneth ULTRA TX 由 master builder 把 L1 AA 交易、多条 L2 的块、证明和跨链返回值打包进一笔 L1 交易，任一不一致即整体 revert | [11] ULTRA TX 帖（2025-11-11） | observed | |
| A16 | 截至 2025-11，Gwyneth 的实时证明仍是工程目标，证明系统尚在开发（SGX/TDX “coming soon”） | [11]“still an active engineering goal”“Proving is still under development” | observed | |
| A17 | Taiko 在 2025 Q3 完成了 Gwyneth 跨链原子交易的设计和内部演示 | [12] Taikolights Q3 2025（搜索摘要） | observed | |
| A18 | Spire 已暂停 Based Stack 开发，理由之一是同步需要的共享最终性在当前技术下不可行 | [13] docs.spire.dev 原文 | observed | |
| A19 | Puffer UniFi 在 2025-08 处于测试网 V2，路线图包含 multi-TEE 实时证明 | [14] Puffer 博客 2025-08-14（搜索摘要） | observed | |
| A20 | SCOPE 认为 L1↔L2 同步需要实时证明、shared sequencer、L1 proposer 协调，L2↔L2 则不需要实时证明 | [3] SCOPE“Core SCOPE requirements (L1↔L2)”与 L2↔L2 一节 | observed | |
| A21 | EF 对实时证明的定义是 mainnet 块 P99 ≤10 s、CAPEX ≤10 万美元、功耗 ≤10 kW、≥128 bit、证明 ≤300 KiB | [15] EF 博客 2025-07-10 | observed | |
| A22 | EF 在 2025-12 称 zkVM 已在目标硬件上 10 s 内证完 99% 的以太坊块，成本下降 45 倍 | [16] EF 博客 2025-12-18 | observed | |
| A23 | EF 在 2025-12 认为安全性是剩余难点，并定下 2026-05 达到 100-bit、2026 年底达到 128-bit 可证明安全的里程碑 | [16] Milestone 2/3 | observed | |
| A24 | SP1 Hypercube 在 16×RTX 5090 上让 99.7% 的块 <12 s、95.4% 的块 <10 s | [17] Succinct 博客（约 2025-11，954 块样本） | observed | |
| A25 | Pico Prism 2.1 在 16 GPU 上对 7,200 个主网块的 P99 为 9.14 s，平均 4.87 s | [18] Brevis 2026-07-28 | observed | |
| A26 | 公开的实时证明基准都是“出块后证明 L1 块”的口径，不能直接代表同步交易所需的出块前 L2 证明延迟 | 由 A21、A11 推出：基准测的是 L1 块证明时间；同步要求在 slot 截止前完成 L2 加跨链 witness 的证明，还要扣除模拟和传播时间 | inferred | |
| A27 | EEZ 主网首笔交易的 proof 是 65 字节 ECDSA 签名，不是 ZK 证明 | [37] 主会话对区块 26127444 tx#31 的解码；[35] rollup0 README L29-32“not yet a succinct validity proof” | observed | |
| A28 | AggLayer 的跨链交易须先在 L1 最终确定，才能在目标链 claim | [19] Agglayer architecture：“finalized on the L1 before they can be claimed” | observed | |
| A29 | pessimistic proof 只证明桥账本树（LET/LBT/Nullifier）的变化，用来把被攻破链的损失限制在其存款以内 | [20] Pessimistic Proof architecture | observed | |
| A30 | AggLayer 的 pessimistic proof 于 2025-02-03 在主网启用（v0.2） | [21] Polygon 论坛 v0.2 公告（搜索摘要） | observed | |
| A31 | AggLayer 的 fast interop（<5 s）在官方页面上是将来时的规划 | [22] agglayer.dev“When Agglayer spins up fast interop, it will provide…” | observed | |
| A32 | AggLayer 不原生支持跨链调用的同步返回值 | [3] SCOPE：“AggLayer and similar protocols do not natively support synchronous return values” | observed | |
| A33 | OP interop 的一条跨链消息需要两笔交易（initiating log 与 executing message） | [23]“A total of two transactions are required” | observed | |
| A34 | OP interop 允许同一时间戳内的消息，executing 甚至可以排在 initiating 之前，消息 7 天过期 | [24] Timestamp Invariant 与 EXPIRY_TIME | observed | |
| A35 | OP interop 中引用了无效消息的块会被 fork choice reorg 掉，sequencer 应在包含前校验 | [23] overview 原文 | observed | |
| A36 | OP interop 是同时间戳消息传递，调用方拿不到返回值，不属于真同步调用 | 由 A33、A34 推出：两笔独立交易组成一条消息，源链交易无法在同一执行上下文内读取目标链结果 | inferred | |
| A37 | 截至 2026-10-06，承载 interop 的 Lagoon 硬分叉状态为“In development / Not scheduled” | [26] OP 文档 network-upgrades 与 lagoon 页 | observed | |
| A38 | OP 曾计划 2026-07 在 OP Sepolia 与 Unichain Sepolia 激活 interop，但通知页仍写“not yet finalized” | [25] interop-prep 通知 | observed | |
| A39 | Offchain Labs 的 Arbitrum interop 路线是先 intents，再推进需 DAO 批准的跨链操作，文中没有提同步可组合 | [27] Offchain Labs 博客（2025-02） | observed | |
| A40 | Arbitrum Crosschain Broadcaster 基于存储证明，速度受路由上各链最终性限制 | [28] Offchain Labs Broadcaster 博客 | observed | |
| A41 | EIL 是 EF AA 团队基于 ERC-4337 的提案，由钱包发起并结算跨 L2 操作，不依赖 relayer/solver | [29] EF 博客 2025-11-18 | observed | |
| A42 | EF 在 2026-03 建议最贴近 L1 的 L2 追求同步可组合与 native rollup，同时推荐 OIF 与 Fast Confirmation Rule | [30] EF 博客 2026-03-23 | observed | |
| A43 | EEZ 自我定位为由 EF 资助的“L1<>L2 framework”，创始成员包括 Titan、Beaver Build 等 builder | [31] eez.io 介绍文章 | observed | |
| A44 | EEZ core README 把 EEZ 表述为“based rollups sharing the same L1 sequencer”之间的同步可组合 | [33] eez-core-protocol/README.md#L9@6ae4110 | observed | |
| A45 | EEZ 参考实现 eez-rollup0 使用自有 sequencer 加 composer，L1 测试网为 Gnosis Chiado | [35] eez-rollup0/README.md#L3-L9@6ff63ec | observed | |
| A46 | eez-rollup0 把 postAndVerifyBatch 与用户 L1 交易作为 bundle 交给 L1 builder，要求同块全有或全无；rbuilder-chiado 会丢弃超过约 3 笔的部分 | [35] README#L16-L20、#L42-L44、#L155-L158@6ff63ec | observed | |
| A47 | EEZ 实际依赖的是 composer 加愿意原子打包的 L1 builder，而不是 L1 proposer 无许可地给 L2 排序 | 由 A44、A45、A46、A51 推出：README 措辞为 based，但参考实现和 Gnosis 首版都是集中式 sequencer/composer，靠 L1 builder 原子打包 | inferred | |
| A48 | EEZ L1 合约要求实际执行与预计算（rolling hash、返回值）一致，否则整体 revert；任一证明失败则整批 revert | [34] eez-core-protocol/src/EEZ.sol#L33-L39@6ae4110 | observed | |
| A49 | EEZ 要求执行条目在其状态更新所在的同一 L1 块内被消费 | [34] EEZ.sol#L218-L219 `ExecutionNotInCurrentBlock` | observed | |
| A50 | EEZ、SCOPE、ULTRA TX 同属“链下联合模拟 + 预计算结果带证明上链 + L1 执行时比对，不一致即 revert”的同构设计 | 由 A15、A20、A48 推出：三者都由单一 builder 预计算跨域结果，在一笔 L1 交易或同一块内验证比对 | inferred | |
| A51 | GIP-153 首版：Gnosis Ltd 运营集中式 composer，用 TEE 类过渡证明，组合为单向，genesis 目标 2026-12 至 2027-01 | [32] GIP-153 原文 | observed | |
| A52 | GIP-153 预计完整 EEZ 规范（双向组合、嵌套调用、实时 ZK）在 2027 年落地 | [32]“expected to land over the course of 2027” | observed | |
| A53 | Ethresear.ch 上已有人指出，EEZ 的执行表可以看作 CIRC 式 mailbox 的变体 | [1] Ellie Davidson 回帖：“The execution table could be viewed as a version of a mailbox” | observed | |
| A54 | 23998 回帖担心：没有证明基础设施的本地出块 proposer 所在的 slot 无法提供同步交易，builder 也可能审查用户 | [1] Tim Clancy 回帖 | observed | |
| A55 | intents 是“时间上异步、结果上原子”，适合结果可预先声明的转账 / 兑换 / L2→L1 提款 | [2] 23426“asynchronous in time but atomic in outcome”以及 Use Cases 一节 | observed | |
| A56 | 闪电贷、跨 rollup 清算、多步套利依赖执行时的返回值，很难用 intents 表达 | [2] 23426“cannot be replicated with intents” | observed | |
| A57 | atomic 加 synchronous 不自动保证 non-interleaving，需要单独说明 | [2] thegaram33 回帖 #2/#4；[1] thegaram33 在 23998 中的追问 | observed | |
| A58 | 截至 2026-10-06，在以太坊主网上实际跑通 L1↔L2 带返回值同步交易的路线只有 EEZ，而且用的是签名证明 | 由 A16、A17、A27、A37 推出：Gwyneth 处于设计 / 内部演示，SCOPE 与 Vitalik 方案是提案，OP interop 未定档，AggLayer 是异步；只有 EEZ 有主网交易（ECDSA）。未穷尽检索所有项目 | inferred | |
| A59 | 对 Mantle L2↔L3 来说，Mantle L2 的 sequencer 可以直接扮演 EEZ 中“L1 builder”的角色，从而省掉跨实体的 builder 协调 | 由 A46、A47 推出：EEZ 的原子性依赖共同提交点的出块者原子打包 bundle；若共同提交点是 Mantle L2，其出块者就是 Mantle 自己的 sequencer。尚未与 Mantle lane 核对 | speculative | |

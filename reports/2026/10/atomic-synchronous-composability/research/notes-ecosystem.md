# Lane：AS 对生态的意义、外部观点与 Mantle L2↔L3（brief 研究问题 3）

**研究问题**：外部（ethresear.ch、Gnosis/EEZ、EF/Vitalik）认为 AS 实现后能做什么？Mantle 当前架构是什么？把 EEZ 的“父链 = L1”换成“父链 = Mantle L2”后，角色、资产模型、原子边界和移植风险各是什么？
**一句话答案**：外部的一手表述集中在“统一流动性、deploy once、跨 rollup 闪电贷/套利/清算、L2 直接调用 L1 流动性”，质疑集中在 builder/composer 中心化、跨域 MEV 和 non-interleaving。EEZ 主网目前只演示了一笔 0.001 ETH 的 L1→L2 调用，证明用的是 ECDSA 签名，不是 ZK。Mantle 已是 OP Stack + OP Succinct（ZK）+ Ethereum blobs、MNT 为原生币、出块 2 秒、支持 EIP-1153。按 EEZ 模型做 L2↔L3 时，可以把 Mantle L2 当作“共同提交点”。但需要解决四件事：MNT 原生币语义、`0x4200…0007` 预部署地址冲突、L2 上没有 blob 路径、Mantle 排序器必须配合同块打包。这些都是设计推断，Mantle 没有对应的官方计划。

---

## 1. 外部观点：别人认为 AS 能做什么

### 1.1 ethresear.ch 23998（Jordi Baylina，2026-02-02）及回复
**答案**：原帖把同步可组合定义为“一笔交易内跨链 CALL 并拿回结果，要么全成功要么全回滚”。帖子提出 proxy 合约 + execution table + 单个 validity proof 的机制，并强调不需要 L1 硬分叉 [1]。回复区给出一个 POC 演示和若干用例想象，质疑集中在原子性、non-interleaving、builder 中心化和跨域 MEV [1]。
**依据**：
- 原帖：同步可组合的含义是“within a single transaction, a smart contract on one chain … can CALL a smart contract on a different chain … and receive the result back in the same execution context”。机制可以“without forking L1”实现。实时证明“around 12 GPUs … ~7 seconds”证明一个以太坊区块。帖子承认“Prover centralization is a valid concern” [1]。
- 原帖还规定了原生币约束：rollup 可以有自己的原生币，但如果它的原生币不是 ETH，就“should not accept or make CALLs with a non-zero Ether value from or to an external rollup” [1]。这条和 Mantle（MNT）直接相关。
- Péter Garamvölgyi（2026-02-02 / 02-03）提了三个问题：原子性对发送者如何保证？是否保证 non-interleaving？L1 实际执行路径偏离模拟时会怎样？Jordi 的回答是：顺序由共享排序器给出单一线性顺序，同一 slot 内不允许 `tx1: L1→L2` 和 `tx2: L2→L1` 交错；偏离时交易失败，或者对应条目不被使用 [1]。
- Martin Köppelmann（Gnosis 联合创始人，2026-02-03）贴出 POC 视频和 `koeppelmann/synchronous_surge` 仓库，演示从 L2 同步写 L1 并用返回值继续执行 [1]。
- Tim Clancy（2026-02-26）提了两点：
  - 正面用例：L1 一笔交易里原子地“跨到 L2 → mint NFT → 跨回”，安全委员会改 root 或 vkey 时交易直接 revert，因此“No security council could ever rug me”。
  - 担忧：证明由 builder 生成，同步可组合可能被私有路由到“builder duopoly”，还可能削弱 forced inclusion [1]。
- Elem Oghenekaro（2026-02-27）认为 builder 就是 execution table 的构造者，commit-reveal 无效。同步可组合会产生“跨域 MEV”，execution table 比单域 mempool“strictly more valuable”。他还提出 `TRY_CALL` 式的部分原子边界，并说参考实现缺少多 rollup 集成测试 [1]。
- Jordi 的回复：rollup 的信任模型按 rollup 隔离，恶意 rollup 只影响自己的用户；L2↔L2 可以用累加器匹配假定调用，最后聚合成一个证明 [1]。
- Euge Re 设想机构场景：策略校验和交易执行在同一 finality 内完成 [1]。

**不确定之处**：回复区共 26 条，本 lane 读到第 22 楼左右（JSON 首屏），后面 4 楼没有细读。Jordi 说的“penalty mechanism”在 EEZ 当前代码中有没有对应实现，未核实。

### 1.2 ethresear.ch 23426（Alon Muroch，2025-11-11）
**答案**：帖子把同步可组合（SC）和 intents 对照来写，列出 SC 的典型用例，并承认 intents 在 L2→L1 桥接上占优 [2]。
**依据**：
- 用例原文列了 7 项：“Cross-chain no-liquidity bridging”“Cross-chain swaps”“Cross-chain flash loans”“Multi-rollup atomic arbitrage and liquidation flows”“NFT bridging”“Complex DeFi strategies across multiple chains”“Singleton dApps (deployed once for multiple chains)” [2]。
- 帖子称闪电贷、跨 rollup 清算、多步套利“cannot be replicated with intents” [2]。
- 帖子承认 L2→L1 桥接“Intents excel … without real competition from SC. At least until real-time ZK proving is widespread enough” [2]。
- Péter Garamvölgyi 在此帖首次提出“non-interleaving”属性 [2]。
- 实现路线方面，帖子提到 Espresso mailbox、Compose Shared Publisher、Jason Vranek 的 SCOPE [2]。

### 1.3 Gnosis GIP-153
**答案**：提案要把 Gnosis Chain 从独立 L1 转成 EEZ rollup 实例。投票已于 **2026-08-19 通过**：123,158 GNO 赞成，115 反对，151 弃权，54 个投票者，法定人数 75,000 [3][4]。
**依据**：
- **动机**：提案自认“Gnosis Chain has failed to deliver on its original value proposition”。对非质押者的稀释约 2.3%/年。卖点是“EVERYTHING that exists on Ethereum … is a single atomic call away”，“No existing L2 offers it” [3]。
- **分阶段计划**：
  - 第一版目标在 2026 年底到 2027 年初出 genesis，采用临时证明，“likely TEE-based”，之后转向 real-time ZK。
  - 上线时组合是**单向**的（atomic L2→L1 calls），双向和跨实例组合要到 2027 年随完整规格落地，过渡期用 intents 桥。
  - 第一版宣称以 40–50% 的工作量拿到“80% of the synchronous-composability unlock” [3]。
- **Composer 运营**：“At launch, sequencing is centralized: Gnosis Ltd operates the composer”。提案也承认“Synchronous composability in combination with fast block production is currently only possible in a centralized fashion”。forced inclusion 只列为“options to evaluate”，不是上线功能 [3]。
- **证明者**：现有桥验证者改为运行证明系统，采用 M-of-N 多证明器 [3]。
- 出块 2 秒；xDAI 仍是 gas 代币 [3]。
- GIP-154 已通过，给 Gnosis Ltd 拨款 $15m/年，用途包括“Gnosis Chain transition into the EEZ” [4]。

**不确定之处**：提案帖头的 `status: phase-3` 是投票前的标记，最终状态以 Snapshot 和 Gnosis DAO 月报为准。Snapshot 页面没有直接抓取成功，票数取自 DAO 月报 [4]，与 Cointelegraph/TradingView 等二手报道一致。

### 1.4 EEZ 的定位与参与方
**答案**：EEZ 于 **2026-03-29 在 EthCC（Cannes）**发布，定位是“L1<>L2 framework”而不是 L2 框架。创始贡献方是 Gnosis 和 ZisK（Jordi Baylina），EF 出资，治理主体是瑞士的 EEZ Association [5][7]。
**依据**：
- eez.io 原文署名“Friederike Ernst & Jordi Baylina”。原文写道“The Ethereum Foundation is funding this work”，又说“Other founding members include Aave, Titan, Beaver Build, Centrifuge, xStocks” [5]。
- Gnosis 博客称“The Ethereum Foundation is co-funding the development”。Jordi 的身份写作“founder of ZisK … creator of Circom and a core contributor to Polygon zkEVM” [7]。
- GitHub 组织 eez-association 下有这些仓库：eez-core-protocol、eez-rollup0、stateless、zisk-eth-client，以及 zisk-patch-stateless（fork 自 0xPolygonHermez）[8]。
- 2026-08 月报的进展：Rollup 0 在 Chiado 和内部 12 秒 devnet 上运行；第一个端到端里程碑是“a composer posting a valid block, with the ECDSA prover signing”；blob 规格取代了临时的 calldata 格式；L2 单笔交易 gas 上限 15M [6]。

**关于“Polygon 团队”**：只找到 Jordi 的个人履历（曾是 Polygon zkEVM 核心贡献者）和一个 fork 自 0xPolygonHermez 的仓库。没有找到 Polygon Labs 作为组织参与 EEZ 的一手证据。

### 1.5 2026-10-05 首笔主网交易的公告
**答案**：EEZ 贡献者 Eduardo Antuña（@eduadiez）和官方账号 @etheconomiczone 在 X 上宣布“first atomic cross-chain” L1→L2 交易 [9][10]。X 原帖抓取返回 403，原文以二手报道转引为准。
**依据**：
- Cointelegraph 转述：交易日志记录了一次携带 0.001 ETH 的跨链调用和一次 rollup 状态更新。Hydration 联合创始人 Jakub Gregus 称其为“one of the most important milestones” [9]。
- ETH Daily（2026-10-05）链接了官方账号推文，并描述流程：Sync block 绑定单个 L1 区块，composer 用 `postAndVerifyBatch` 和用户 L1 交易打包进同一个以太坊区块 [10]。
- 主会话的解码与此一致：用户交易是区块 26127444 的第 32 笔，前一笔第 31 笔调用 `postAndVerifyBatch`，proof 是 65 字节 ECDSA 签名 [36]。
- 时间推算（由推文 ID 的 snowflake 时间戳换算）：@eduadiez 推文约在 2026-10-05 17:21 UTC 发出，@etheconomiczone 约在 17:53 UTC，均在链上交易（16:44:59 UTC）之后约 0.5–1 小时 [9][10][36]。

**不确定之处**：Cointelegraph 写“On Tuesday”，但 2026-10-05 是星期一（ETH Daily 原文“Happy Monday, October 5, 2026”），二手报道的日期描述有误 [9][10]。官方推文原文没有读到，措辞是否有限定（例如“demo”“ECDSA”）未核实。

### 1.6 Vitalik / EF / Justin Drake
**答案**：Vitalik 在 2024-10 的 Surge 一文中把同步可组合列为 L2 互操作改进之一，认为它“could be helpful in improving financial efficiency of defi protocols”。他写道，L2↔L1 同步“could be done without any cross-L2 coordination”，L2↔L2 同步“would require shared sequencing” [12]。EF 对 EEZ 的立场以“出资”体现 [5][7]。没有找到 EF 研究员专门评论 EEZ 的一手文本。
**依据**：Surge 原文 [12]。另有二手报道：Decrypt/The Block 报道 Vitalik 在 2026-02 称“rollup-centric”愿景“no longer makes sense”，并批评 L2 去中心化缓慢 [13]。这条只有二手来源（Firefly 原帖抓取失败）。Justin Drake 在 Bankless 一期节目里讨论过“Universal Synchronous Composability” [14]，属于播客线索，未逐字核实。

### 1.7 典型用例：谁提出、有没有 demo

| 用例 | 提出者（一手） | 有无 demo / 测试 |
|---|---|---|
| 跨 rollup / L1↔L2 闪电贷 | Alon Muroch [2]；eez-core-protocol README 举例“cross-rollup flash loans” [31] | 有 e2e 脚本 `E2EFlashLoan.s.sol`：L1 闪电贷的还款依赖一次 L1→L2→L1 桥往返，全部在**一笔 L1 用户交易**内完成。脚本使用 mock root、本地或 devnet 模式，不是主网 [29] |
| 跨域套利 / 清算 | Alon Muroch [2]；Elem 从 MEV 角度提及 [1] | 未找到专门 demo |
| L2 直接使用 L1 流动性（swap/lending） | GIP-153：“Oracles, on- and offramps, and mainnet liquidity venues can be used directly” [3]；Gnosis 博客：“If Uniswap has a pool on mainnet, your EEZ protocol can access it” [7] | `DeployUniswapLab.s.sol` 只在每条链上部署 MiniUniswap/Permit2/Bridge 的 mock，注释写明“No EEZ infrastructure, execution tables, mock proofs or cross-chain calls” [30] |
| Deploy once / 单例 dApp、统一资产 | EEZ 博客：“deploy once and rely on synchronous composability” [5]；Alon：Singleton dApps [2]；GIP-153：“one canonical asset zone-wide” [3] | 无 |
| 原子跨链 NFT / 防 rug 往返 | Tim Clancy [1]；Alon：NFT bridging [2] | Köppelmann POC [1]（未运行） |
| 机构合规 + 执行同 finality | Euge Re [1]；GIP-153 面向 FinTech/银行 [3] | 无 |

**注意**：`src/periphery/`（Bridge、WrappedToken、defiMock）在 README 中被明确标为“test-only … not a supported production bridge/token/DeFi implementation” [31]。

---

## 2. Mantle 现状（一手来源）

**答案**：
- Mantle v2 基于 OP Stack。2025-09-16 起状态根改用 OP Succinct（SP1）ZK validity proof 提交，09-23 起提款期从 7 天改为 12 小时 [15]。
- DA 已从 EigenDA 迁到 Ethereum blobs（EIP-4844）[16][17]。
- 原生 gas 代币是 MNT [22]。出块时间固定 2 秒 [24]。
- Skadi 升级加入了 EIP-1153/7702 [19]，Limb 对齐 Osaka [20]，Arsia（2026-04-22 主网）对齐 OP Stack Canyon→Jovian [18][37]。
- 官方文档中没有 L3 / appchain SDK。

**依据**：
- **证明系统**：“Starting on September 16, all new state roots on Mantle will be submitted and verified using ZK proofs”。12 小时窗口被表述为“a deliberate security measure” [15]。
- **DA**：
  - 迁移公告称这是从“Validium”变成“standard ZK Rollup” [16]。
  - Architecture 页写“`op-batcher` … submits it to Ethereum L1 using EIP-4844 blob-carrying transactions”，ZK 证明提交到 `MantleSuccinctL2OutputOracle` [17]。
  - mainnet 网络配置 PR #132（2026-04-08 合并）标题为“remove EigenDA” [25]。
  - 2026 路线图 H1 中“DA Architecture Migration”已勾选 [21]。
- **原生币**：Tectonic 起 MNT 是“native Mantle Network Rollup asset” [22]。Arsia 去掉了 `tokenRatio`，改用三段式费用（L2 执行费 + L1 数据费 + Operator Fee），新增预部署 `OperatorFeeVault` `0x4200…001b` [37]。
- **EVM 能力**：
  - Skadi 加入 EIP-1153（TSTORE/TLOAD）、5656、6780、7702、2935 [19]。
  - Limb 于 2026-01-14 激活，加入 EIP-7823/7883/7934/7939/7951，op-node 改用 KZG 校验 blob 数据 [20]。
- **出块**：Tectonic 起“generating blocks every two seconds” [24]。交易池是私有的，排序器按 base fee 和 priority fee 处理交易 [17]。
- **路线图**：2026 H2 计划切换到纯 Reth 排序器、上 Flashblocks 亚秒级预确认、Prop AMM、原生 AA / 2D nonce、Shielded Pool。这些都还没有勾选 [21]。路线图中没有 L3、appchain 或同步可组合条目 [21]。
- **预部署**：Mantle 主网 `L2CrossDomainMessenger` = `0x4200000000000000000000000000000000000007` [23]，与 OP Stack 规范一致 [26]。

**不确定之处**：
- “Differences” 文档页仍写“Mantle chose to use EigenDA”和“evm environment version is before (and including) Shanghai” [22]，与 Skadi/Limb 的 changelog 和 DA 迁移公告矛盾，应该是文档没有更新。
- DA 切换在主网的精确生效区块未找到。
- OP Succinct 的证明频率和最终性时延（L2 状态多久在 L1 上被证明）未在文档中找到具体数字。

---

## 3. Mantle L2 ↔ L3 映射（以下除注明 observed 外均为设计推断）

### 3.1 角色映射

| EEZ 原角色 | 所在层（EEZ 现状）[1][27][28][31] | Mantle 方案中所在层（推断） | 说明 |
|---|---|---|---|
| 父链 / 结算点 | Ethereum L1（参考环境为 Chiado） | **Mantle L2** | L3 的“真相源”变成 Mantle L2；Mantle L2 再通过 OP Succinct 向 Ethereum 结算 [15] |
| EEZ manager（L1 侧 `EEZ.sol`，含 registry、roots、etherBalance、`postAndVerifyBatch`） | L1 合约 | Mantle L2 上的普通合约 | 依赖 TSTORE；Mantle 已支持 EIP-1153 [19][34] |
| CrossChainProxy（L1 侧） | L1，CREATE2 部署 | Mantle L2：代表 L3 合约的代理 | L2 上的 Vault/DEX 看到的 `msg.sender` 是代理地址 |
| EEZL2（子链 manager） | L2 预部署 `0x4200…0007` [27] | **L3** 预部署 | 与 OP Stack/Mantle 的 `L2CrossDomainMessenger` 同址，L3 若沿用 OP Stack genesis 会冲突 [23][26][27] |
| rollup（子链） | EEZ L2（reth） | Mantle L3 appchain | L3 节点需要支持 `0x76` 系统交易、Sync block、deriver [27][28] |
| Composer | 链下，持有 L1 posting key，与 L1 builder 协作，把 batch 和用户交易放进同一 L1 区块 [10][28] | 链下，需要与 **Mantle L2 排序器**协作 | Mantle L2 只有一个排序器，交易池私有 [17]，没有 MEV-Boost builder 市场，所以同块打包要由排序器提供 bundle 接口 |
| Prover / proof signer | ECDSA signer（当前）[28]；目标是 ZK | 同左；proof system 合约部署在 Mantle L2 | 实时证明窗口 ≈ Mantle L2 出块 2 秒 [24] |
| Deriver / follower | 只读 L1 就能重建 L2 [28] | 只读 Mantle L2 就能重建 L3 | L3 的最终性取决于 Mantle L2 区块的 safe/finalized 状态 |

### 3.2 三类场景：资产模型与原子边界
1. **L3 appchain 使用 L2 的 Vault / DeFi 流动性（流动性仍锁在 L2）**
   - **资产模型**：资金和 shares 留在 L2，由 L2 上的 adapter 或代理持有；L3 只记录仓位或债权。
   - **原子边界**：一个 L3 交易里包含“L3 → L2 adapter 调用 → 返回 shares → L3 更新仓位”，属于一条执行条目。条目的 `currentRoot` 会在消费时重新检查，L2 的实际返回值也被 rolling hash 绑定 [33]。
   - **要点**：L3 的记录不能变成可以独立赎回的第二份债权。这是外部调研的建议，本 lane 认为合理（inferred）。
   - **最接近的 EEZ 先例**：GIP-153 的“合约在 rollup 上调用 mainnet 流动性” [3][7]。目前只有 mock lab，没有实盘 demo [30]。
2. **L3 使用 L2 抵押**
   - **资产模型**：只同步读余额不够，因为用户随后可以在 L2 把资产转走。必须在同一原子条目里在 L2 锁定或占用抵押物，同时在 L3 记账债务。清算路径（L2 侧没收）也要能由 L3 触发同步调用。
   - **依据**：EEZ 支持 static（只读）条目和写条目两种 [33]。只读条目不改变 L2 状态，不能防止双花。
3. **Meme launchpad 毕业时把流动性原子迁移到 L2 DEX**
   - **资产模型**：建议把 canonical token 和募资 escrow 放在 L2，L3 只跑曲线和状态机。毕业时由 L3 一次调用 L2 的 `GraduationRouter`，在 Router 内完成释放、建池、加 LP、锁 LP。
   - **原子边界**：L3 的“毕业”标记和 L2 的建池写入同一条目，任何一步失败都整体回滚。
   - **关键风险延续**：four.meme 的两次被盗，根因都是迁移目标池的价格或地址可以被第三方抢先确定 [35]。如果 L2 DEX 的池子可以被任何人提前创建，AS 并不能消除这个风险。Router 必须校验已有池的价格，或者使用只能由 Router 初始化的池（即 explainer 里的 B 类“原子迁到自有池”）[35]。
   - **与公开 demo 的距离**：闪电贷 e2e 已演示“L1 合约在一笔交易内经 proxy 调 L2，L2 再调回 L1”的嵌套结构 [29]。毕业场景方向相反（L3 发起 → L2），对应 GIP-153 第一阶段的“atomic L2→L1 calls” [3]。

### 3.3 移植时要注意的点
- **原生币语义**：
  - `RollupUpdate.etherDelta` 记录的是父链的原生币净流量 [33]。父链换成 Mantle L2 后，记账的就是 **MNT** [22]。
  - 如果 L3 用 MNT 作 gas，原生 value 可以 1:1 对应。如果 L3 用 ETH（或其他代币）作 gas，按 Jordi 原帖的规则，跨 rollup 调用不能携带非零原生 value [1]。
  - Gnosis 博客说 EEZ 参考实现“will only use ETH as gas”，而 Gnosis 实例用 xDAI [3][7]，说明非 ETH 原生币的实例已有先例。
  - L3 侧入站系统交易会按 `value` 铸币，外层失败时撤销 [27]，这条规则对 MNT 同样适用。
- **预部署冲突**：EEZL2 固定在 `0x4200…0007` [27]，而 OP Stack 和 Mantle 在这个地址放的是 `L2CrossDomainMessenger` [23][26]。如果 L3 用 OP Stack genesis，就要二选一：重定位 EEZL2，或者移除 messenger。重定位需要同步修改节点、signer 和 deriver 里的常量（eez-rollup0 的 genesis 生成脚本会删除该地址的分配 [27]）。
- **DA / blob 路径**：
  - EEZ 的 L1 batch 结构通过 `blobIndices` 消费当前交易携带的 EIP-4844 blob，2026-08 起 blob 格式已取代临时 calldata 格式 [6][33]。
  - EEZ 自己的 L2 不支持 blob 交易 [27]。OP Stack 系 L2 一般也不接受 blob 交易，Mantle 是否接受未在文档中找到（speculative）。
  - 因此 Mantle L3 → L2 的 DA 大概率只能走 batch 的 `callData` 字段 [33]，或者另外把数据发到 Ethereum blob 再在 L2 上证明可用性。后者会破坏“同一区块原子提交 DA”的前提。
- **排序器配合**：
  - EEZ 要求 `postAndVerifyBatch` 和用户交易落在同一父链区块：消费方要求 `lastVerifiedBlock == block.number` [33]。
  - Mantle L2 的交易池是私有的，由单一排序器排序 [17]，所以必须由 Mantle 排序器提供“batch + 用户交易”原子 bundle 的包含能力。
  - 如果引入 Flashblocks [21]，还要明确“同一区块”指的是 2 秒块还是 flashblock。
- **出块时间与实时证明**：
  - EEZ 参考环境每个 L1 区块（12 秒，或 Chiado 5 秒）出一个 Sync block [28]。父链换成 Mantle L2 后，可用窗口缩短到 2 秒 [24]。
  - ethresear.ch 原帖给出的基准是证明一个以太坊区块约 7 秒、需要约 12 张 GPU [1]。这意味着第一阶段在 Mantle 上大概率只能用 ECDSA 或 TEE 证明（与 GIP-153 第一阶段一致 [3]），或者每隔 N 个 L2 区块才开放一次同步窗口。
- **L3 系统交易语义**：入站的 `0x76` 系统交易 `tx.gasprice = 0`，依赖 `gasUsed * tx.gasprice` 做报销的合约会得到 0 [27]。在 L3 上部署既有 DeFi 前需要检查这一点。
- **证明域隔离**：公共输入没有显式绑定 `block.chainid`、registry 地址或协议版本，独立部署必须使用不同的验证域 [32]。在 Mantle L2 上再部署一套 EEZ manager 时，要确保它和 Ethereum 上的 EEZ 部署证明不能互相重放。

### 3.4 事实 vs 建议
- **事实**：本节“依据”中带 PRIMARY 来源的条目，包括 Mantle 架构参数、EEZ 合约与节点行为、地址冲突本身。
- **inferred**：角色映射、MNT 对应 etherDelta、需要排序器 bundle、DA 只能走 calldata、2 秒证明窗口的结论、launchpad 资产布局。
- **speculative**：Mantle L2 是否接受 blob 交易；Flashblocks 与同块原子的交互；Mantle 是否会采纳这一方向（没有官方计划）。

---

## 4. 主要风险与边界（生态视角）
- **共享流动性也共享风险入口**：
  - Jordi 说信任模型“cleanly isolated per rollup”，影响只限于该 rollup 的用户 [1]。但一旦 L3 能同步调用 L2 Vault，被攻破的 L3 就可以按协议规则动用代理持有的 L2 资产和 allowance。
  - 外部调研建议按 L3、应用、资产分别设置限额，本 lane 认为合理（inferred）。
- **Composer / builder 中心化与 MEV**：
  - GIP-153 明确上线时排序中心化、forced inclusion 待评估 [3]。
  - 回复区担心同步可组合被私有路由给“builder duopoly” [1]，execution table 带来“cross-domain MEV” [1]。
  - Mantle L2 排序器本身已经中心化 [17]。L2↔L3 composer 若由同一运营方掌握，会同时看到两层的订单流（inferred）。
- **证明信任模型**：
  - 主网首笔交易使用 65 字节 ECDSA 签名 [36]。eez-rollup0 自述“not yet a succinct validity proof” [28]。GIP-153 第一阶段是 TEE [3]。
  - Gnosis 博客宣称“No new trust assumptions”[7]，与 GIP-153 自己承认的“adds an additional trust assumption until real-time ZK proving lands”[3] 互相矛盾，应以后者为准。
  - 核心合约“not audited” [31]。
- **调度与送达**：
  - 证明通过不等于条目一定被执行：消费时会跳过不匹配的条目 [32]。
  - immediate 调度参数不在公共输入内 [32][33]。业务要求“必须执行”时，需要 `bindMsgSenderInPublicInput`，并在提交者的 hook 中强制执行 [32]。
- **重组与最终性**：
  - eez-rollup0 先把 Sync block 写入 L2，如果 L1 提交失败就回滚 [28]。
  - 在 Mantle 方案中，L3 跟随 Mantle L2。Mantle L2 的 unsafe 区块在被 L1 derive 前理论上可能重组，L3 的最终性不会高于 Mantle L2 的 safe/finalized 头（inferred）。
  - Mantle 官方桥另有 12 小时安全窗口 [15]。

---

## 图的素材

**A. 首笔主网 AS 的参与者与调用顺序**（[10][28][36]）
1. 用户提交 L1 交易：向 CrossChainProxy `0x3c1837f7…` 发送 0.001 ETH，input 为空 [36]。
2. Composer 把它挪到一边、模拟，打包进 L2 Sync block [10][28]。
3. Composer 向 EEZProxy `0x4b2760f8…` 提交 `postAndVerifyBatch`，携带 1 个 blob 和 ECDSA 签名，是区块 26127444 的第 31 笔 [36]。
4. 用户交易作为第 32 笔，在同一区块内消费条目 [36]。
5. 如果 L1 提交失败，L2 回滚 Sync block；deriver 只读 L1 就能重建 L2 [28]。

**B. Mantle L2↔L3 架构（推断）**（[15][16][17][24][27][33]）
- Ethereum L1 ← OP Succinct 证明 + blob DA ← Mantle L2（2 秒出块，单一排序器，MNT）[15][16][17][24]
- Mantle L2 上的合约：EEZ manager（roots、etherBalance=MNT）、proof system、L3 合约的 CrossChainProxy、Vault / DEX / GraduationRouter [33]
- Mantle L3：EEZL2（需要重定位或替换 `0x4200…0007`）、`0x76` 系统交易、Sync block [27]
- 链下：Composer ↔ Mantle 排序器 bundle 接口（新增）；proof signer；L3 deriver（读 Mantle L2）

**C. GIP-153 状态与阶段**（[3][4][6]）
- 2026-07-22 提案创建 → 08-13 进入 Phase 3 → 08-19 通过
- 第一阶段（目标 2026-12 至 2027-01 genesis）：TEE 临时证明、中心化 composer、单向 L2→L1 原子调用、intents 桥
- 完整规格（2027）：双向、嵌套、实时 ZK

**D. 用例对比维度**（[1][2][3][29][30]）：用例 / 提出者 / 方向（L1→L2、L2→L1、L2↔L2）/ 是否需要嵌套 / 是否有 demo / 资产模型（远程操作、锁定抵押、资产转移）。

**E. 外部观点光谱**（[1][2][3][7]）
- 支持：统一流动性、deploy once、防 rug 往返
- 质疑：non-interleaving、builder 私有路由、跨域 MEV、forced inclusion 被削弱、证明者中心化
- 取舍：快速出块与同步可组合目前只能在中心化下实现（GIP-153 自述）

---

## 代码素材

1) 原生币记账字段（父链换成 Mantle L2 后，记账的就是 MNT）
`eez-core-protocol/src/interfaces/IEEZ.sol#L77-L86@6ae4110` — https://github.com/eez-association/eez-core-protocol/blob/6ae4110fb748fd10882d5afea576fbd1a5c38fc3/src/interfaces/IEEZ.sol#L77-L86
```solidity
/// @notice A rollup's state transition for one entry.
/// @dev `currentRoot` is re-checked against the live root when the entry is consumed, so an entry
///      only ever runs from the exact state it was proven against — which is what makes skipping or
///      orphaning queued entries safe.
struct RollupUpdate {
    uint64 rollupId; // the rollup this update applies to
    int192 etherDelta; // net ether change for this rollup (...)
    bytes32 currentRoot; // expected pre-state, checked against `rollups[rollupId].root`
    bytes32 newRoot; // post-execution root
}
```

2) 闪电贷 e2e 场景说明（用例 demo）
`eez-core-protocol/script/e2e/scenarios/nested/L1_to_L2/flash-loan/E2EFlashLoan.s.sol#L40-L53@6ae4110` — https://github.com/eez-association/eez-core-protocol/blob/6ae4110fb748fd10882d5afea576fbd1a5c38fc3/script/e2e/scenarios/nested/L1_to_L2/flash-loan/E2EFlashLoan.s.sol#L40-L53
```solidity
//  FlashLoan scenario — DeFi composite: flash loan whose repayment depends
//  on a full L1→L2→L1 bridge round trip, all inside ONE L1 user tx.
//
//  Trigger: EOA → executorL1.execute() → pool.flashLoan(token, 10k) →
//  executorL1.onFlashLoan():
//    1. bridge.bridgeTokens(token, 10k, L2, executorL2)
//       → locks 10k in bridgeL1, calls the L2-bridge proxy
//       → consumes L1 entry 0 (key: bridge→bridge receiveTokens forward).
//    2. executorL2Proxy.call(claimAndBridgeBack)
//       → consumes L1 entry 1 (key: executorL1→executorL2). Its single
//         top-level l2ToL1Call is the RETURN bridge leg: bridgeL2→bridgeL1
//         receiveTokens runs ON L1 and releases the escrowed 10k back to
//         executorL1 (native-token path).
//    3. repay the pool — solvent only because step 2 released the escrow.
```
同文件 `#L160-L166` 中的 root 是 `keccak256("l2-initial-state")` 这类占位值，`#L470-L471` 注明“the runner mines both in one block”（本地模式）。这说明它是协议流程测试，不是对真实 L2 状态的演示。

3) Uniswap lab 只部署 mock 应用
`eez-core-protocol/script/DeployUniswapLab.s.sol#L12-L13@6ae4110` — https://github.com/eez-association/eez-core-protocol/blob/6ae4110fb748fd10882d5afea576fbd1a5c38fc3/script/DeployUniswapLab.s.sol#L12-L13
```solidity
/// @notice Deploy application contracts on one existing chain. Run once per chain.
/// @dev No EEZ infrastructure, execution tables, mock proofs or cross-chain calls.
```

4) 父链需要 transient storage（Mantle 已在 Skadi 支持）
`eez-core-protocol/src/base/EEZBase.sol#L60-L64@6ae4110` — https://github.com/eez-association/eez-core-protocol/blob/6ae4110fb748fd10882d5afea576fbd1a5c38fc3/src/base/EEZBase.sol#L60-L64
```solidity
/// @notice Gas cap for proxies' static-context probes; read from the EEZ contract on each call.
/// @dev TSTORE consumes the probe's gas in static context; 1,000 covers the current mutable probe.
///      The EEZ contract will be upgradeable, but proxies will not. If a major EVM gas repricing
///      occurs, upgrading the EEZ contract can adjust this cap without replacing proxies.
uint256 public constant STATIC_CHECK_GAS = 1_000;
```

5) EEZL2 地址与系统交易（预部署冲突的依据）
`eez-rollup0/docs/native-system-transactions.md#L3-L7@6ff63ec` — https://github.com/eez-association/eez-rollup0/blob/6ff63ecd7fef61e4826236a11a5d7e172fa6c368/docs/native-system-transactions.md#L3-L7
```text
EEZ L2 reserves EIP-2718 type `0x76`, encoded as
`0x76 || rlp([chainId, nonce, to, value, input])`.
There is no signature or caller field. The sender is always
`0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0076`; the target must be EEZL2 at
`0x4200000000000000000000000000000000000007`. ...
```

---

## 来源
1. [ethresear.ch 23998 “Synchronous Composability Between Rollups via Realtime Proving”（Jordi Baylina，2026-02-02，含回复，经 /t/23998.json）](https://ethresear.ch/t/synchronous-composability-between-rollups-via-realtime-proving/23998)，访问于 2026-10-06。**PRIMARY**。证明了：机制定义、无需 L1 硬分叉、原生币约束、证明耗时基准；回复中的 non-interleaving 回答、builder 中心化与跨域 MEV 质疑、Köppelmann POC。
2. [ethresear.ch 23426 “Synchronous Composability vs Intents”（Alon Muroch，2025-11-11）](https://ethresear.ch/t/synchronous-composability-vs-intents-two-paths-to-ethereum-wide-interop/23426)，访问于 2026-10-06。**PRIMARY**。证明了：SC 用例清单、intents 在 L2→L1 桥接上的优势、non-interleaving 概念的提出。
3. [Gnosis 论坛 GIP-153](https://forum.gnosis.io/t/gip-153-should-gnosis-chain-transition-into-the-ethereum-economic-zone/12397)，访问于 2026-10-06。**PRIMARY**。证明了：动机、TEE 临时证明、中心化 composer、单向 L2→L1、时间表、EEZ 由 Gnosis 与 ZisK 共同领导且 EF 共同出资。
4. [Gnosis DAO Community Summary ~ August 2026](https://gnosisdao.ghost.io/gnosis-dao-community-summary-august-2026/)，访问于 2026-10-06。**PRIMARY**（DAO 官方月报）。证明了：GIP-153 于 08-19 通过及票数；GIP-154 拨款覆盖 EEZ 转型。
5. [eez.io “Introducing the Ethereum Economic Zone”（Friederike Ernst & Jordi Baylina，2026-03-29）](https://eez.io/blog/introducing-the-eez)，访问于 2026-10-06。**PRIMARY**。证明了：定位、EF 出资、瑞士 EEZ Association、创始成员名单。
6. [eez.io Monthly Update – August 2026（Armagan Ercan）](https://eez.io/blog/monthly-update-august-2026)，访问于 2026-10-06。**PRIMARY**。证明了：Rollup 0 在 Chiado 和 12 秒 devnet 上运行、ECDSA prover 端到端里程碑、blob 规格取代 calldata、L2 单笔交易 gas 上限 15M、GIP-153 通过。
7. [Gnosis 博客 “We're Building the Ethereum Economic Zone. Here's Why.”（2026-03-29）](https://www.gnosis.io/blog/we-re-building-the-ethereum-economic-zone-heres-why)，访问于 2026-10-06。**PRIMARY**。证明了：Gnosis 对统一流动性的表述、“reference implementation … only use ETH as gas”、“No new trust assumptions”的营销口径。
8. [GitHub 组织 eez-association](https://github.com/eez-association)，访问于 2026-10-06。**PRIMARY**。证明了：仓库构成，包括 zisk-patch-stateless fork 自 0xPolygonHermez。
9. [Cointelegraph “EEZ tests atomic L1-to-L2 transaction…”](https://cointelegraph.com/news/ethereum-eez-atomic-l1-l2-transaction-mainnet)，访问于 2026-10-06。二手。证明了：@eduadiez 推文链接、0.001 ETH 与 rollup 状态更新、Gregus 评价；“Tuesday”的日期描述有误。
10. [ETH Daily “EEZ Executes First Mainnet Transaction”（2026-10-05）](https://ethdaily.io/eez-executes-first-mainnet-l1-to-l2-transaction)，访问于 2026-10-06。二手。证明了：@etheconomiczone 推文链接、Sync block 与同块打包流程的描述。
11. X 原帖 [@eduadiez/2107159200086319334](https://x.com/eduadiez/status/2107159200086319334)、[@etheconomiczone/2107167337673625764](https://x.com/etheconomiczone/status/2107167337673625764)。**PRIMARY**，但抓取返回 403，本 lane 没有读到原文。
12. [Vitalik “Possible futures of the Ethereum protocol, part 2: The Surge”（2024-10-17，GitHub 源文）](https://raw.githubusercontent.com/vbuterin/blog/master/posts/futures2.md)，访问于 2026-10-06。**PRIMARY**。证明了：Vitalik 对同步可组合价值与前提（L2↔L1 不需要跨 L2 协调，L2↔L2 需要共享排序）的表述。
13. [Decrypt](https://decrypt.co/362711/ethereum-economic-zone-solve-layer-2-fragmentation) / [The Block](https://www.theblock.co/post/388625/we-dont-friggin-need-more-copypasta-evm-chains-vitalik-buterin-criticizes-new-layer-1s-narrows-the-case-for-layer-2s) 关于 Vitalik 2026-02 言论的报道（仅搜索摘要），访问于 2026-10-06。二手。只作线索。
14. [Bankless #208 “Fixing Fragmentation with Justin Drake”](https://www.bankless.com/fragmentation)，访问于 2026-10-06。二手（播客页面）。线索：Drake 讨论过 Universal Synchronous Composability。
15. [Mantle Docs：OP Succinct Mainnet Upgrade & Withdrawal Period Transition](https://docs.mantle.xyz/network/introduction/updated-notices/mantle-op-succinct-mainnet-upgrade-and-withdrawal-period-transition.md)，访问于 2026-10-06。**PRIMARY**。证明了：2025-09-16 起使用 ZK 状态根；12 小时提款期。
16. [Mantle Docs：Migration of Data Availability to Ethereum Blobs](https://docs.mantle.xyz/network/introduction/updated-notices/migration-of-data-availability-to-ethereum-blobs.md)，访问于 2026-10-06。**PRIMARY**。证明了：DA 从 EigenDA 迁到 blobs，从 validium 变为标准 ZK rollup。
17. [Mantle Docs：Architecture](https://docs.mantle.xyz/network/system-information/architecture.md)，访问于 2026-10-06。**PRIMARY**。证明了：batcher 用 blob 提交数据、`MantleSuccinctL2OutputOracle`、私有交易池与排序器排序规则。
18. [Mantle Docs：v1.5.4 Arsia changelog](https://docs.mantle.xyz/network/for-node-operators/network-updates/changelogs/mantle-v2-v1.5.4-arsia-upgrade.md)，访问于 2026-10-06。**PRIMARY**。证明了：Arsia 主网于 2026-04-22 07:00 UTC 激活。
19. [Mantle Docs：v1.3.1 Skadi changelog](https://docs.mantle.xyz/network/for-node-operators/network-updates/changelogs/mantle-v2-v1.3.1-skadi-upgrade.md)，访问于 2026-10-06。**PRIMARY**。证明了：EIP-1153/5656/6780/7702/2935 已启用。
20. [Mantle Docs：v1.4.2 Limb changelog](https://docs.mantle.xyz/network/for-node-operators/network-updates/changelogs/mantle-v2-v1.4.2-limb-upgrade.md)，访问于 2026-10-06。**PRIMARY**。证明了：2026-01-14 对齐 Osaka，op-node 用 KZG 校验 blob。
21. [Mantle Docs：Roadmap](https://docs.mantle.xyz/network/system-information/roadmap.md)，访问于 2026-10-06。**PRIMARY**。证明了：2026 H1 已完成项（DA 迁移等）、H2 计划（Reth、Flashblocks、Prop AMM、原生 AA）；路线图中没有 L3 或同步可组合。
22. [Mantle Docs：The Differences between Mantle, OP Stack, and Ethereum](https://docs.mantle.xyz/network/for-developers/the-differences-between-mantle-op-stack-and-ethereum.md)，访问于 2026-10-06。**PRIMARY**（部分内容过时）。证明了：MNT 是原生 rollup 资产；同页的 EigenDA 和 Shanghai 表述已过时。
23. [Mantle Docs：Key L2 Contract Address](https://docs.mantle.xyz/network/system-information/off-chain-system/key-l2-contract-address.md)，访问于 2026-10-06。**PRIMARY**。证明了：Mantle 主网 `L2CrossDomainMessenger` = `0x4200…0007`。
24. [Mantle Blog：Mantle Completes Mainnet v2 Tectonic Upgrade](https://www.mantle.xyz/blog/announcements/mantle-completes-mainnet-v2-tectonic-upgrade)（搜索摘要），访问于 2026-10-06。**PRIMARY**。证明了：固定每 2 秒出块。
25. [mantlenetworkio/networks PR #132 “upgrade mainnet to v1.5.4: remove EigenDA…”（2026-04-08 合并）](https://github.com/mantlenetworkio/networks/pull/132)（搜索摘要），访问于 2026-10-06。**PRIMARY**。证明了：主网节点配置移除了 EigenDA。
26. [OP Stack Specification：Predeploys](https://specs.optimism.io/protocol/predeploys.html)，访问于 2026-10-06。**PRIMARY**。证明了：`0x4200…0007` 是 `L2CrossDomainMessenger`。
27. `eez-rollup0/docs/native-system-transactions.md@6ff63ec`（[L3-L7](https://github.com/eez-association/eez-rollup0/blob/6ff63ecd7fef61e4826236a11a5d7e172fa6c368/docs/native-system-transactions.md#L3-L7)、[L11-L14](https://github.com/eez-association/eez-rollup0/blob/6ff63ecd7fef61e4826236a11a5d7e172fa6c368/docs/native-system-transactions.md#L11-L14)、[L24-L30](https://github.com/eez-association/eez-rollup0/blob/6ff63ecd7fef61e4826236a11a5d7e172fa6c368/docs/native-system-transactions.md#L24-L30)、[L43-L51](https://github.com/eez-association/eez-rollup0/blob/6ff63ecd7fef61e4826236a11a5d7e172fa6c368/docs/native-system-transactions.md#L43-L51)）。**PRIMARY**。证明了：EEZL2 地址与 `0x76` 系统交易、L2 不支持 blob 交易、`tx.gasprice = 0`、入站按 value 铸币且外层失败时撤销。
28. `eez-rollup0/README.md@6ff63ec`（[L12-L34](https://github.com/eez-association/eez-rollup0/blob/6ff63ecd7fef61e4826236a11a5d7e172fa6c368/README.md#L12-L34)）。**PRIMARY**。证明了：每个 L1 区块一个 Sync block、同 L1 区块原子提交、先提交后修复、deriver 只读 L1 重建、ECDSA “not yet a succinct validity proof”、参考 L1 是 Chiado。
29. `eez-core-protocol/script/e2e/scenarios/nested/L1_to_L2/flash-loan/E2EFlashLoan.s.sol@6ae4110`（[L39-L68](https://github.com/eez-association/eez-core-protocol/blob/6ae4110fb748fd10882d5afea576fbd1a5c38fc3/script/e2e/scenarios/nested/L1_to_L2/flash-loan/E2EFlashLoan.s.sol#L39-L68)、[L160-L166](https://github.com/eez-association/eez-core-protocol/blob/6ae4110fb748fd10882d5afea576fbd1a5c38fc3/script/e2e/scenarios/nested/L1_to_L2/flash-loan/E2EFlashLoan.s.sol#L160-L166)、[L470-L493](https://github.com/eez-association/eez-core-protocol/blob/6ae4110fb748fd10882d5afea576fbd1a5c38fc3/script/e2e/scenarios/nested/L1_to_L2/flash-loan/E2EFlashLoan.s.sol#L470-L493)）。**PRIMARY**。证明了：闪电贷 demo 的结构、mock root、本地同块挖出。
30. `eez-core-protocol/script/DeployUniswapLab.s.sol@6ae4110`（[L12-L29](https://github.com/eez-association/eez-core-protocol/blob/6ae4110fb748fd10882d5afea576fbd1a5c38fc3/script/DeployUniswapLab.s.sol#L12-L29)）。**PRIMARY**。证明了：Uniswap lab 只部署 mock 应用，不含跨链调用。
31. `eez-core-protocol/README.md@6ae4110`（[L5-L19](https://github.com/eez-association/eez-core-protocol/blob/6ae4110fb748fd10882d5afea576fbd1a5c38fc3/README.md#L5-L19)）。**PRIMARY**。证明了：未审计；以“cross-rollup flash loans”为例；periphery 是 test-only。
32. `eez-core-protocol/docs/CAVEATS.md@6ae4110`（[全文](https://github.com/eez-association/eez-core-protocol/blob/6ae4110fb748fd10882d5afea576fbd1a5c38fc3/docs/CAVEATS.md)）。**PRIMARY**。证明了：posting 不保证送达、immediate 调度未被证明、证明域需要部署方自行隔离。
33. `eez-core-protocol/src/interfaces/IEEZ.sol@6ae4110`（[L34-L47](https://github.com/eez-association/eez-core-protocol/blob/6ae4110fb748fd10882d5afea576fbd1a5c38fc3/src/interfaces/IEEZ.sol#L34-L47)、[L61-L67](https://github.com/eez-association/eez-core-protocol/blob/6ae4110fb748fd10882d5afea576fbd1a5c38fc3/src/interfaces/IEEZ.sol#L61-L67)、[L77-L86](https://github.com/eez-association/eez-core-protocol/blob/6ae4110fb748fd10882d5afea576fbd1a5c38fc3/src/interfaces/IEEZ.sol#L77-L86)）。**PRIMARY**。证明了：batch 含 `blobIndices`/`callData`、同块门 `lastVerifiedBlock == block.number`、`etherDelta` 与 `currentRoot` 复核。
34. `eez-core-protocol/src/base/EEZBase.sol@6ae4110`（[L60-L64](https://github.com/eez-association/eez-core-protocol/blob/6ae4110fb748fd10882d5afea576fbd1a5c38fc3/src/base/EEZBase.sol#L60-L64)）。**PRIMARY**。证明了：manager 依赖 TSTORE。
35. research-hub 已有报告 `reports/2026/10/meme-launchpad/explainer.md`（2026-10-05 已核实来源）。内部复用。证明了：four.meme 迁移被盗的根因、毕业的三种形态（A/B/C）。
36. 主会话链上解码（区块 26127444，tx #31 `postAndVerifyBatch` + tx #32 用户交易，65 字节 ECDSA 签名，1 个 blob）。内部，链上数据。
37. [Mantle Docs：What's New in Mantle v2 Arsia](https://docs.mantle.xyz/network/introduction/whats-new-in-mantle-v2-arsia.md)，访问于 2026-10-06。**PRIMARY**。证明了：三段式费用、移除 `tokenRatio`、`OperatorFeeVault` 预部署、对齐 OP Stack。

---

## 外部调研中被修正或无法核实的地方
1. **§八“未取得交易原始数据，不能确定 proof 类型和是否同块”**：已被主会话解码取代。验证交易和用户交易是同一区块的第 31、32 笔，proof 是 65 字节 ECDSA 签名 [36]。这个 ECDSA 结论来自链上数据，不是从默认部署脚本推出来的。
2. **§8.1 引用 crypto.news 作为公告来源**：本 lane 找到的二手报道是 Cointelegraph 和 ETH Daily，它们链接了 @eduadiez 和 @etheconomiczone 的推文 [9][10]。Cointelegraph 写“Tuesday”是错的，10-05 是星期一 [10]。crypto.news 原文没有核对。
3. **§10.1“Mantle 官方概述说明使用 ZK validity proofs”**：属实，补充具体时间：2025-09-16 起 ZK 状态根，09-23 起 12 小时提款 [15]。外部调研没有提到 DA 已从 EigenDA 迁到 Ethereum blobs [16][17][25]。另外，Mantle 自己的“Differences”页仍写 EigenDA 和“Shanghai 及之前”，是过时内容 [22]。
4. **§10.3“建议首版先使用父链 calldata 数据路径”**：方向对，但理由需要修正。EEZ 主线已在 2026-08 用 blob 规格取代 calldata 格式 [6]。对 Mantle L2 作父链的情况，问题不只是“先简单”：L2 上大概率没有 blob 交易可用（EEZ 自己的 L2 就拒绝 blob [27]；Mantle 是否支持未找到），所以 calldata 很可能是必需路径（inferred / speculative）。
5. **§10.3 预部署冲突**：成立，已由 Mantle 文档 [23] 和 OP Stack 规范 [26] 双重确认。
6. **§10.3 原生币与 MNT**：成立，补充一手依据：Jordi 原帖规定非 ETH 原生币的 rollup 不得跨 rollup 携带非零 value [1]；Gnosis 实例用 xDAI gas，说明非 ETH gas 实例已有先例 [3]。
7. **§9.3 GIP-153“计划与取舍”**：外部调研没有给投票结果。实际已于 2026-08-19 通过 [4]。外部调研也漏掉了“上线时只有单向 L2→L1”这一关键限制 [3]。
8. **§13.2 引 23426 作为闪电贷、套利、清算用例来源**：属实。作者 Alon Muroch，日期 2025-11-11 [2]。
9. **§14.4“研究讨论已提出 builder 集中度、私有订单流、强制包含问题”**：属实，具体出处是 23998 帖中 Tim Clancy 和 Elem Oghenekaro 的回复 [1]。
10. **§13.4/13.5 关于 PropAMM 和 intents 的关系**：属于外部调研自己的观点。Mantle 路线图确实列有 Prop AMM 和 Flashblocks（未完成）[21]，可以作为“外部调研建议”引用。
11. **外部调研没有区分 Gnosis 营销口径和 GIP 原文**：Gnosis 博客说“No new trust assumptions” [7]，GIP-153 承认临时证明增加了信任假设 [3]。页面应引用 GIP 原文。

---

## 开放问题
1. Mantle L2 主网是否接受 EIP-4844（type-3）交易？`BLOBHASH` 在 Mantle 上返回什么？这决定 L3 DA 能否沿用 EEZ 的 blob 路径。
2. Mantle 排序器（以及计划中的 Flashblocks）能否提供“batch + 用户交易”原子 bundle 的包含接口？“同一区块”应该以 2 秒块为单位，还是以 flashblock 为单位？
3. OP Succinct 在 Mantle 上的实际证明时延是多少？能否在约 2 秒内完成 L3 状态证明？如果不能，同步窗口是每 N 个 L2 区块开一次，还是用 ECDSA/TEE 过渡？
4. L3 用 MNT 还是 ETH 作 gas？如果用 ETH，跨层 value 调用要禁用，资产只能走 ERC-20 escrow。
5. EEZ 官方推文原文的措辞（是否注明 ECDSA 或 demo 性质）需要人工在 X 上核对。
6. 23998 帖第 23–26 楼（2026-03 至 04）的内容没有细读。
7. EF 研究员或 Justin Drake 对 EEZ 的直接一手评论没有找到。
8. Jordi 回复中说的“sequencer penalty mechanism”在 EEZ 代码或规格中是否存在？

---

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| E1 | ethresear.ch 23998 由 Jordi Baylina 于 2026-02-02 发布，把同步可组合定义为一笔交易内跨链 CALL 并在同一执行上下文拿回结果 | [1] 原帖第 2 节与 JSON created_at | observed | |
| E2 | 23998 原帖称该机制不需要 L1 硬分叉 | [1] “No L1 Fork Required” 节 | observed | |
| E3 | 23998 原帖给出实时证明基准：证明一个以太坊区块约需 12 张 GPU、约 7 秒，并承认证明者中心化是合理担忧 | [1] 第 1 节 | observed | |
| E4 | 23998 原帖规定：原生币不是 ETH 的 rollup 不得与外部 rollup 发生非零 Ether value 的 CALL | [1] “Native Tokens and Value Transfers” 节 | observed | |
| E5 | Jordi 回复称同一 slot 由共享排序器给出单一线性顺序，不允许 L1→L2 与 L2→L1 交错（non-interleaving） | [1] 第 8 楼回复 | observed | |
| E6 | Tim Clancy 担心同步可组合被私有路由到“builder duopoly”，并削弱 forced inclusion | [1] 第 21 楼 | observed | |
| E7 | Elem Oghenekaro 指出 builder 即 execution table 构造者，同步可组合会带来跨域 MEV | [1] 第 22 楼 | observed | |
| E8 | Martin Köppelmann 在 23998 帖贴出同步 rollup POC 视频与 synchronous_surge 仓库 | [1] 第 18 楼 | observed | |
| E9 | 23426（Alon Muroch，2025-11-11）列出的 SC 用例包括跨链闪电贷、多 rollup 原子套利与清算、跨链 swap、NFT 桥、单例 dApp | [2] Use Cases 节 | observed | |
| E10 | 23426 承认 L2→L1 桥接上 intents 占优，直到实时 ZK 证明普及 | [2] Intents 用例节末尾 | observed | |
| E11 | non-interleaving 作为同步可组合的第三属性由 Péter Garamvölgyi 在 23426 提出 | [2] 第 2 楼 | observed | |
| E12 | GIP-153 于 2026-08-19 通过：123,158 GNO 赞成、115 反对、151 弃权、54 个投票者、法定人数 75,000 | [4] DAO 月报 At a glance 与 Forum 节 | observed | |
| E13 | GIP-153 第一版计划用临时证明（likely TEE-based），之后转向实时 ZK | [3] “How it works” 节 | observed | |
| E14 | GIP-153 上线时由 Gnosis Ltd 中心化运营 composer，forced inclusion 仅为待评估选项 | [3] “How it works” 节 | observed | |
| E15 | GIP-153 上线时组合是单向的（atomic L2→L1 calls），双向、嵌套与实时 ZK 预计在 2027 年落地 | [3] Synchronous Composability 与 Budget and timeline 节 | observed | |
| E16 | GIP-153 目标 genesis 为 2026-12 至 2027-01，出块 2 秒，gas 为 xDAI | [3] | observed | |
| E17 | GIP-153 自述快速出块与同步可组合目前只能在中心化下实现 | [3] Motivation 节 | observed | |
| E18 | EEZ 于 2026-03-29 发布，由 Gnosis 与 ZisK 创立，EF 出资，治理主体是瑞士的 EEZ Association | [5] 原文；[7] | observed | |
| E19 | EEZ 宣称的其他创始成员包括 Aave、Titan、Beaver Build、Centrifuge、xStocks | [5] “What comes next” 节 | observed | |
| E20 | 没有一手证据表明 Polygon Labs 作为组织参与 EEZ；关联仅限 Jordi 的个人履历和一个 fork 自 0xPolygonHermez 的仓库 | 由 [7]（Jordi 曾是 Polygon zkEVM 贡献者）、[8]（fork 仓库）、[5]（成员名单无 Polygon）推出：现有材料只显示个人与代码渊源 | inferred | |
| E21 | 截至 2026-08，Rollup 0 在 Chiado 和内部 12 秒 devnet 上运行，首个端到端里程碑是 ECDSA prover 签名的区块 | [6] Rollup 0 Development 节 | observed | |
| E22 | EEZ 在 2026-08 用 blob 规格取代了临时 calldata 格式，并把 L2 单笔交易 gas 上限定为 15M | [6] Technical Progress 节 | observed | |
| E23 | 首笔主网 AS 公告由 EEZ 贡献者 Eduardo Antuña 与 @etheconomiczone 在 X 上发布，内容为 0.001 ETH 跨链调用加 rollup 状态更新 | [9][10] 二手转述；X 原文抓取 403 [11] | observed | |
| E24 | 首笔交易的验证（tx #31 postAndVerifyBatch）与用户调用（tx #32）位于同一区块 26127444，proof 为 65 字节 ECDSA 签名 | [36] 主会话链上解码 | observed | |
| E25 | @eduadiez 公告推文约在链上交易后 36 分钟（约 17:21 UTC）发出 | 由 [9] 推文 ID 2107159200086319334 的 snowflake 时间戳与 [36] 的区块时间 16:44:59 UTC 推出：ID 换算约为 2026-10-05 17:21 UTC | inferred | |
| E26 | Cointelegraph 称交易发生在“Tuesday”是错误的，2026-10-05 是星期一 | [9] 原文 “On Tuesday”；[10] “Happy Monday, October 5, 2026” | observed | |
| E27 | Vitalik 在 2024-10 认为同步可组合可提升 DeFi 资金效率：L2↔L1 无需跨 L2 协调，L2↔L2 需要共享排序 | [12] Surge 原文 | observed | |
| E28 | Vitalik 在 2026-02 称 rollup-centric 愿景“no longer makes sense” | 仅有二手报道 [13]，一手原帖未取得 | speculative | |
| E29 | eez-core-protocol 的闪电贷 e2e 演示：L1 闪电贷的还款依赖一笔 L1 用户交易内的 L1→L2→L1 桥往返 | [29] L39-L68 | observed | |
| E30 | 闪电贷 e2e 使用占位 root，并在本地同块挖出，不是主网或真实 L2 状态的演示 | [29] L160-L166、L470-L471 | observed | |
| E31 | DeployUniswapLab 只部署 MiniUniswap 等 mock 应用，不含 EEZ 基础设施和跨链调用 | [30] L12-L13 | observed | |
| E32 | eez-core-protocol 未审计，periphery（Bridge、defiMock）是 test-only，不是生产实现 | [31] L5、L19 | observed | |
| E33 | Mantle 自 2025-09-16 起用 OP Succinct ZK 证明提交状态根，2025-09-23 起提款期为 12 小时 | [15] | observed | |
| E34 | Mantle 的 DA 已从 EigenDA 迁到 Ethereum blobs | [16] 迁移公告；[17] Architecture 页描述 blob 提交；[25] 主网配置移除 EigenDA；[21] 路线图已勾选 | observed | |
| E35 | Mantle 原生 gas 代币是 MNT，Arsia（2026-04-22 主网）起改为三段式费用并移除 tokenRatio | [22][18][37] | observed | |
| E36 | Mantle 已启用 EIP-1153 transient storage（Skadi），满足 EEZ manager 对 TSTORE 的依赖 | [19] Skadi EIP 列表；[34] EEZBase L60-L64 | observed | |
| E37 | Mantle 出块时间固定为 2 秒，交易池私有，由单一排序器排序 | [24] Tectonic 公告；[17] Transaction Pool 节 | observed | |
| E38 | Mantle 官方文档和 2026 路线图中没有 L3、appchain SDK 或同步可组合条目 | [21] 路线图全文；docs llms.txt 索引中无相关页面（访问于 2026-10-06） | observed | |
| E39 | Mantle “Differences” 文档页的 EigenDA 与 “Shanghai 及之前” 表述已过时 | 由 [22] 与 [16][19][20] 对比推出：后者显示已迁 blobs 并支持 Prague/Osaka 特性 | inferred | |
| E40 | EEZL2 子链 manager 固定在 0x4200…0007，与 OP Stack 和 Mantle 的 L2CrossDomainMessenger 同址 | [27] L3-L7；[23]；[26] | observed | |
| E41 | Mantle L3 若沿用 OP Stack genesis，必须重定位 EEZL2 或移除 messenger，并同步修改节点、signer、deriver | 由 E40 与 [27]（genesis 生成脚本删除该地址分配、系统交易目标固定）推出 | inferred | |
| E42 | 父链换成 Mantle L2 后，etherDelta 记账的是 MNT | 由 [33] L77-L86（etherDelta 记录父链原生币净流量）与 E35（Mantle 原生币为 MNT）推出 | inferred | |
| E43 | 如果 Mantle L3 不以 MNT 作 gas，跨层调用应禁止非零原生 value | 由 E4（Jordi 规则）与 E42 推出 | inferred | |
| E44 | EEZ 的 L2（子链）不接受 blob 交易 | [27] L11-L14 | observed | |
| E45 | Mantle L2 主网接受 type-3 blob 交易 | 未找到一手来源；OP Stack 系 L2 通常不支持，仅为推测 | speculative | |
| E46 | Mantle L3→L2 的 DA 大概率只能走 batch 的 callData 字段，而不是 EEZ 的 blob 路径 | 由 [33] L34-L47（batch 同时有 blobIndices 与 callData）、E44、E45 推出：父链没有 blob 交易时只剩 calldata | inferred | |
| E47 | EEZ 要求验证与消费在同一父链区块（lastVerifiedBlock == block.number） | [33] L61-L67 | observed | |
| E48 | 在 Mantle L2 上实现 AS 需要排序器提供“batch + 用户交易”原子 bundle 包含能力 | 由 E47 与 E37（私有交易池、单一排序器、无外部 builder 市场）推出 | inferred | |
| E49 | 父链换成 Mantle L2 后，同步证明窗口约 2 秒，远短于 23998 给出的约 7 秒整块证明基准，第一阶段大概率需要 ECDSA/TEE 过渡或降低同步频率 | 由 E37（2 秒出块）、E3（约 7 秒）、E13（Gnosis 第一阶段也用 TEE）推出 | inferred | |
| E50 | 入站 0x76 系统交易的 tx.gasprice 为 0，依赖 gasUsed*tx.gasprice 报销的合约会得到 0 | [27] L24-L30 | observed | |
| E51 | 入站系统交易按 value 铸币，外层失败时撤销铸币 | [27] L43-L51 | observed | |
| E52 | EEZ 公共输入不绑定 chainid、registry 地址和协议版本，独立部署必须隔离验证域 | [32] “Proof domains are a deployment responsibility” | observed | |
| E53 | 证明通过不保证条目被送达，immediate 调度参数不在公共输入内 | [32] Delivery 节；[33] L30-L32 注释 | observed | |
| E54 | Gnosis 博客的“No new trust assumptions”与 GIP-153 承认的临时证明额外信任假设互相矛盾 | [7] 与 [3] 原文对照 | observed | |
| E55 | 在 AS 毕业流程中，如果 L2 DEX 池可以被第三方提前创建，four.meme 式预建池攻击依然存在，Router 必须校验价格或使用只能由自己初始化的池 | 由 [35]（four.meme 根因：迁移目标池价格或地址被抢先确定）与 AS 只保证原子性、不校验业务价格的事实（[33] 条目只绑定调用与返回）推出 | inferred | |
| E56 | L3 使用 L2 抵押时，只读（static）条目不足以防止双花，必须在同一条目内锁定 L2 抵押 | 由 [33]/[32]（static 条目不改变状态）推出：只读不锁仓，用户随后仍可转走资产 | inferred | |
| E57 | Mantle 方案中 L3 的最终性不会高于 Mantle L2 的 safe/finalized 头 | 由 [28]（L2 跟随父链，父链失败时回滚）与 [15]（Mantle L2 状态经 ZK 证明在 L1 上结算）推出 | inferred | |
| E58 | Mantle 是否会把 EEZ 式 AS 作为 L2↔L3 能力推出 | 没有任何官方计划或公告，路线图未列 [21] | speculative | |

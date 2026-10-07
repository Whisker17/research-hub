# notes-precedents：其他 L1 / L2 的类似机制与先例、公众认可度（brief 研究问题 4）

研究问题：除了 Arbitrum 的 KelpDAO 操作，其他链有没有“链级或准链级”锁定、冻结或划转用户资产的先例或常设机制？它们按什么机制分类？公众是否接受？L2BEAT Stages 怎么看 Security Council 的这类权力？
一句话答案：先例不少，但机制差别很大。按干预层次可分为：sequencer 停摆或审查（Linea），验证者 / 节点拒绝收录（Sui、Gnosis soft fork、BSC nanofork），协议规则或硬分叉直接改状态（The DAO、Gnosis hard fork、Berachain Prague3、Flow HCU、Sui 地址别名升级），以及发行方资产层冻结（USDC、USDT、XRPL、Stellar）。Arbitrum 这次属于“治理特权划转”：由多签升级 L1 入口，不需要分叉，也不需要验证者 / 节点运营者配合，这一点在先例里几乎独一份。被广泛接受的案例有几个共同点：恶意攻击明确、范围很窄、事后有投票或运营者多数背书、资金去向公开且进入托管、承诺以后收缩这类权力。即便在这些案例里，社区也几乎都要求“事前写清规则”。L2BEAT 的框架下，Stage 1 允许 Security Council 做这类不受限的紧急升级；Stage 2 把 Security Council 限定在“链上可裁决的 bug”内，按定义不再允许这类操作（推论）。

---

## 1. 先例与常设机制目录（按干预层次分类）

### 1.1 分类维度说明
- **干预层次**：A. sequencer 拒绝收录 / 停摆；B. 验证者或节点黑名单（拒绝收录 / 拒绝投票）；C. 协议执行规则变更（硬分叉、协议升级改变 STF）；D. 治理特权划转（用既有的升级权或管理权直接生成划转）；E. 硬分叉 / 不规则状态变更（irregular state change）直接改状态；F. 资产发行方冻结。
- **谁决定**、**常设还是一次性**、**冻结 / 划转 / 销毁**、**能否绕过**：逐案标注在下面各节和第 4 节对比表里。

### 1.2 Ethereum / The DAO（2016-07）
- **答案**：硬分叉，在第 1920000 块执行“irregular state change”，把约 1200 万 ETH 从 “Dark DAO” 和 “Whitehat DAO” 合约划入 WithdrawDAO 恢复合约。约 85% 矿工跟随分叉。不跟随的链继续存在（即后来的 ETC）。[4]
- **分类**：E（硬分叉直接改状态）。决定方是客户端开发者 + 矿工 / 节点采纳；一次性；资产被**划转**进可退款的恢复合约；不想接受的人可以留在未分叉链上（EF 公告提到用 `--oppose-dao-fork` 跟随非分叉链，并提示重放攻击）[4]。
- **社会反应**：链分裂。EF 公告本身就承认存在一条“non-fork chain”[4]；“Ethereum Classic”这个名称见 Cointelegraph 的转述[6]。
- **不确定**：85% 是 EF 公告时的矿工比例，不是正式投票结果。

### 1.3 Ethereum / Parity multisig 冻结与 EIP-999（2017-11 → 2018-04）
- **答案**：EIP-999 提议在 `0x863DF6…07b4` 恢复一个已自毁的 WalletLibrary 合约，换上打补丁的版本，让依赖它的多签恢复访问。规范是“单次状态转换”[5]。该 EIP 现在的状态为 **Withdrawn**[5]。
- **社会反应**：2018-04-17 至 04-24 的 coin vote 结果为 55% 反对、39.4% 赞成、5.6% 无所谓（**二手**：Cointelegraph[6]；原投票页无法访问）。反对理由包括：受益方集中（Polkadot 约 306,000 ETH 被锁，Parity 创始人 Gavin Wood 与之关联），以及“开先例”后会不断有人提恢复请求[6]。
- **分类**：E（提议中，未执行）。这是“社会不接受”的典型反例。

### 1.4 BNB Chain / BSC Token Hub（2022-10）
- **答案**：跨链桥 BSC Token Hub 被伪造证明，提走 200 万 BNB。BNB Chain 官方说是“逐个联系社区验证者”让链停下（当时 26 个活跃验证者、共 44 个）[7]。随后发布热修复兼硬分叉版本 v1.1.15，原文为“several blacklist addresses are prohibited for further transactions due to the exploit”，PR #1109 标题为 “nanofork: block exploitation accounts and suspend cross chain bridge related precompile contracts”[8]。v1.1.16（Moran 硬分叉，约 2022-10-12）修复漏洞并重新启用跨链[9]。
- **分类**：A/B + C（验证者停链 + 客户端硬编码黑名单的硬分叉）。决定方是 BNB Chain 团队 + 验证者；黑名单写在客户端代码里；资产被**冻结**（禁止交易），不是划转。官方当时说之后会用链上治理投票决定“freeze or not to freeze”、是否用 Auto-Burn 弥补等[7]。
- **不确定**：这些后续治理投票的结果，我没有找到一手来源。

### 1.5 Linea / Velocore（2024-06）
- **答案**：Velocore（Linea 上的 DEX）被攻击后，Linea 暂停 sequencer，并审查攻击者地址；暂停发生在区块 5081800 和 5081801 之间。Linea 称这是保护用户的“last resort action”，并说“Like other L2s, we are still in the ‘training wheels’ phase”（**二手**：Cointelegraph 转引 Linea 的 X 帖子[10]）。
- **分类**：A（sequencer 停摆 + 审查）。决定方是 Linea 团队（Consensys）运营的中心化 sequencer；一次性；资产只是被阻止移动，没有被划转。
- **社会反应**：Matter Labs CEO Alex Gluchowski（ZKsync 方，属竞争对手、利益相关）发帖：“Decentralizing the sequencer isn’t optional. Every serious L2 stack must race to do first”。Linea 产品负责人 Declan Fox 回应说去中心化路径进展良好[10]（均为 X 帖子的二手转引）。

### 1.6 Hyperliquid / JELLY（2025-03）
- **答案**：Hyperliquid 官方称，验证者集合“convened and voted to delist the JELLY perpetual contract”。除“flagged addresses”外，所有用户由 Hyper Foundation 全额补偿。官方还说“validators often need to convene and act collectively”（**二手**：TechFlow 转引 @HyperliquidX 2025-03-26 的帖子[20]）。
- **分类**：C（验证者投票改变原生 perp 市场状态：下架并结算）。决定方是验证者集合（基金会运营的节点占比高，未核实）。被标记的地址不获补偿，这在效果上构成“对特定地址的差别对待”，但不是冻结或划转余额。
- **不确定**：结算价、投票明细、验证者构成，我没有拿到一手来源，不写。

### 1.7 Sui / Cetus（2025-05）
- **冻结阶段**：Sui 官方在 X 上解释（Chainflow 转引 2025-05-23 的帖子）：“Each validator has a configuration file that allows it to ignore transactions from a specific address”，由此冻结了约 1.62 亿美元被盗资金[3]。Mysten 的 PR 也称之为 “address deny list”[2]。
- **划转阶段**：协议升级（PR #22237，2025-05-30 合入）的做法是：在 ProtocolConfig 里配置地址别名，允许地址 A 的签名以地址 B 为 sender；别名只对指定的 TransactionDigest 生效；获准的交易可以绕过 deny list[2]。官方博客说明了投票规则：验证者按质押权重投票，**排除 Sui Foundation 的质押**；最终 90.9% 质押投了 “yes” 并提前结束；资金转入 4/6 多签信托（Cetus 2、Sui Foundation 2、OtterSec 2）[1]。
- **分类**：B（验证者本地黑名单）+ C（协议升级，按交易摘要精确授权）。决定方先是验证者各自决定，后是验证者质押投票；资产被**划转**进托管多签；授权是一次性的（“cannot be used for any other purpose”[1]）。
- **社会反应**：验证者 Chainflow 投了赞成，但公开批评投票“being rushed”（最短 2 天即可提前结束），并指出拥有大量基金会委托质押的验证者存在利益冲突；它的支持是“conditional”，条件是建立治理框架[3]。

### 1.8 Berachain / Balancer V2（2025-11）
- **答案**：bera-geth v1.011602.6 的说明写的是“Critical hard fork… Prague3 prevents the Balancer exploiter of Nov 3 2025 from stealing user funds and freezes use of BEX vaults”[11]。v1.011607.0 引入 Prague4，“undoes the Prague3 account and transfer freezes”，激活时间为 2025-11-12 16:00 UTC[11]。停链由验证者协调完成（**二手**：Coinpaper 转引 Berachain 的 X 帖子）；当时持有被盗资金的是一个 MEV bot 运营者，他自称白帽、愿意签名归还[12]。
- **分类**：A/B（验证者停链）+ C（硬分叉加入账户 / 转账冻结规则，事后再用硬分叉撤销）。决定方是 Berachain 核心团队 + 验证者；冻结是临时的、有撤销步骤；资产被**冻结**，最终由持有人自愿归还，不是协议强制划转（按二手来源）。
- **不确定**：归还的金额和交易，我没有一手来源。

### 1.9 Gnosis Chain / Balancer V2（2025-11 → 2025-12）
- **Soft fork 冻结**：Gnosis 联合创始人 Friederike Ernst 在论坛（2025-11-05）说：Monerium 冻结了 EURe，桥治理方暂停了桥；soft fork 让验证者自愿运行一个“simply refuses to attest to blocks moving the hacker’s balances”的客户端；超过 50% 验证者支持后已经实施[13]。
- **绕过漏洞**：有人发现第一版 soft fork 只过滤交易的 `from`/`to`，没有覆盖内部调用和 EIP-7702 authorization，攻击者可以借未被审查的地址提交 7702 授权来绕过。11-07 部署了第二个 soft fork 补上[16]（发现者 mfw78 在帖中为自己申请 10 万美元补偿，是利益相关方）。
- **Hard fork 划转**：2025-12-22 16:11:40 UTC 激活，运营者有 10 天升级时间，未跟随多数的节点会被惩罚[14]。规范原文：“irregular state transition… to replace the code of the Balancer V2 attacker’s externally owned account (EOA) with a restricted forwarding contract”[15]。资金转入 DAO 控制的 Safe，再通过 Merkl 领取页面分发[15]。
- **分类**：B（soft fork：验证者拒绝为相关区块投票）→ E（hard fork：不规则状态转换，替换 EOA 代码）。决定方是验证者多数（客户端团队出版本）；资产先**冻结**后**划转**。
- **社会反应**：大验证者运营方 Serenita 表示支持，但要求“set some ground rules”，并指出救援 Safe 当时只有单一签名人[14]。RealT 团队的 MichaelRealT 提出先例问题：“Are we going to perform a hard fork for every wallet hack…?”[15]。论坛用户 NolanV 批评双重标准和监管风险[13]。

### 1.10 Flow（2025-12-27）
- **答案**：攻击者利用 Cadence runtime 漏洞伪造代币。验证者在区块 137390190 协调停链（首笔恶意交易后 6 小时内）[18]。恢复时 1,060 个 Cadence 账户被置为只读受限状态；之后通过 Height Coordinated Upgrade（HCU）给 Community Governance Council 一个“limited governance interface”，用来从受限账户回收并销毁伪造代币[18]。官方曾准备“full rollback to a pre-exploit checkpoint”方案，与交易所、桥和基础设施方协商后，改选“Isolated Recovery”，保留全部合法交易历史[18]。最终销毁了 874 亿枚伪造 FLOW[19]。官方承诺事后撤销 Council 的这项提升权限[18]。
- **分类**：A/B（验证者停链）+ C（HCU 协议升级授予临时特权）+ D（Council 用特权回收和销毁）。资产被**冻结 → 划转 → 销毁**。
- **社会反应**：回滚方案被放弃这件事，在新闻里被描述为“heavy criticism”所致（二手，未取用具体数字）。官方的说法是“consultation”后的选择[18]。

### 1.11 资产发行方层（对照组）
- **USDC**：`Blacklistable` 合约里由 `blacklister` 角色调用 `blacklist(address)`；`notBlacklisted` 修饰器拒绝被拉黑的账户[23]。这是常设能力、只覆盖这一种资产、由发行方单方面决定。
- **USDT**：Tether 条款保留“freeze any Tether Tokens held by you”和“blacklisting any Digital Tokens Address”的权利，并可“seize and deliver your property to… authorities”[24]。
- **XRPL**：发行方可以冻结它发行的 trust line token（Individual / Deep / Global Freeze），“This does not apply to XRP”。发行方可以设置 No Freeze，永久放弃冻结权[21]。
- **Stellar CAP-35**：Clawback 要求发行账户在 trustline 建立**时**已设置 `AUTH_CLAWBACK_ENABLED_FLAG`。动机写的是合规，以及“recover assets that have been fraudulently obtained”[22]。
- 共同点：权限**事前写明**、**只作用于单一资产**，持有人在持有前就能知道（XRPL / Stellar 是链上 flag，USDC / USDT 是合约代码或条款）。

### 1.12 L2 的常设审查能力（简述）
- **Arbitrum Compliance Filtering（ArbOS 61）**：分 sequencer 和 STF 两层，默认关闭，“not intended or proposed to be used by Arbitrum One”。STF 层的做法是由 sentinel 在 force inclusion 窗口关闭前，把受限交易的 hash 注册进 precompile，让它在执行时失败[26]。规则覆盖 ERC-20/721/1155 转账，以及指向受限地址的 CALL/CREATE/CREATE2/SELFDESTRUCT[26]，覆盖面比 Gnosis 第一版 soft fork 只看 from/to 宽得多（推论，见 P23）。细节由另一 lane 负责。
- **ZK Stack `ITransactionFilterer`**：接口为 `isTransactionAllowed(sender, contractL2, mintValue, l2Value, l2Calldata, refundRecipient)`，用于过滤 L1→L2 交易[25]。L2BEAT 认为 ChainAdmin 可以挂上这个 filterer，按 sender、target、value、calldata 审查，而 Security Council 或 DAO 原则上能通过升级撤销它[29]。
- **OP Stack**：每个 epoch 的第一个 L2 块必须包含从 L1 origin 收据派生的 user-deposited transactions，sequencer 提交的 batch 不能自带 deposited 类型交易[33]。也就是说，只要 deposit 合约和派生规则不变，sequencer 无法单方面审查 L1 存款路径（推论）。
- **Arbitrum One 现状**：L2BEAT 记为“Self sequence (1d delay)”，即 sequencer 审查时用户最多等 1 天就能从 L1 强制收录[30]。

### 1.13 未核实、未写入的候选
Sonic、Sei、Solana（validator 层冻结 / Mango）、Tron 链级冻结、Ronin 2022、Celo / Polygon / zkSync / Starknet / Base / OP Mainnet 的 Security Council 或 sequencer 实际冻结动作：本轮没有找到一手来源，不写。EOS ECAF 2018 冻结 27 个账户、Steem soft fork 0.22.2（2020）冻结 Steemit Inc 质押后引出 Hive 分叉：只有新闻 / 百科类二手摘要，列在开放问题里，待补一手来源。

---

## 2. 公众认可度与“被接受的条件”

**答案**：不存在一个笼统的“公众认可”。较能被接受的组合是：攻击明确是恶意的、范围窄（单个地址或指定交易）、有运营者或质押者多数背书、资金进入公开的托管并有分配流程、同时承诺收缩这类权力。不被接受或引发分裂的情形有：受益方集中（EIP-999）、整链改历史（The DAO → ETC；Flow 放弃回滚）、以及中心化单方面停链（Linea 遭同行批评）。即便在被接受的案例里，社区也普遍要求事前规则。

| 条件 | 支撑案例 | 依据 |
|---|---|---|
| 攻击明确是恶意的 | Gnosis：“unequivocally a malicious exploit”[13]；Sui / Cetus、Arbitrum / KelpDAO 都是外部攻击 | [13][1] |
| 范围窄：单地址或指定交易 | Sui 只授权两个 (地址, 别名, TxDigest) 元组[1][2]；Gnosis 只替换攻击者 EOA 的代码[15]；Serenita 称之为“very targeted form of censorship (with a single address being censored)”[14] | [1][2][14][15] |
| 运营者或质押者多数显式背书 | Sui 90.9% 质押支持，排除基金会质押[1]；Gnosis 超过 50% 验证者采纳 soft fork[13]；The DAO 约 85% 矿工跟随[4] | [1][4][13] |
| 资金去向透明，进入托管 | Sui 4/6 多签信托，签名人公开[1]；Gnosis DAO Safe + 公开 CSV + Merkl 领取[15] | [1][15] |
| 保留合法交易历史，不整链回滚 | Flow 先准备了回滚方案，最终选 Isolated Recovery[18] | [18] |
| 承诺收缩权力 | Flow 承诺撤销 Council 权限[18]；Gnosis：“work toward a future where no one has that power”[13]；Linea 承诺去中心化 sequencer[10] | [10][13][18] |
| 受益方不能是提案方或少数内部人（反例） | EIP-999：受益方集中，coin vote 55% 反对，EIP 撤回[5][6] | [5][6] |
| 即使接受，也要求事前规则（普遍诉求） | Chainflow 的“conditional”支持[3]；Serenita 的“ground rules”[14]；MichaelRealT 的“strict framework”[15]；L2BEAT：“Why this case and not others”[31] | [3][14][15][31] |

**不确定**：表中支持率都来自参与者投票（质押、矿工、验证者），不是用户民意，存在选择偏差。价格 / TVL 变化本轮没有拿到一手数据，不写。

---

## 3. L2BEAT 的视角

**答案**：Stage 1 只要求：除 bug 外，无限期阻止或伪造 L2→L1 消息的唯一方式是攻破 ≥75% 的 Security Council；SC 至少 8 人、阈值 75%；SC 以外发起的升级需要提供退出窗口[27][28]。框架**没有限制** SC 在 L2 内部做什么，所以 Arbitrum 这次操作在 Stage 1 的允许范围内。Stage 2 要求“the Security Council is restricted to act only due to errors detected on chain”，且非 bug 升级需要 ≥30 天退出窗口[27][28]。按这个定义，冻结和划转攻击者资产不属于“链上可裁决的 bug”，Stage 2 链的 SC 不应具备这种即时能力（推论）。

- **依据**：
  - L2BEAT 判定 Arbitrum One 为 **Stage 1**。Stage 2 有两项未满足：“Upgrades unrelated to onchain provable bugs provide less than 30d to exit”和“The Security Council's actions are not confined to onchain provable bugs”。“Exit window: None (emergency upgrade path)”。SC 为 9/12[30]。
  - 2025 年的 Stage 1 指导原则帖中，L2BEAT 考虑过一个更严格的性质：“in Stage 1 the Security Council would be employed only to resolve technical bugs and not to recover from other malicious actors”。随后写明“we decided to exclude this property in this first version”，但提醒这一步对 Stage 2 至关重要[29]。
  - L2BEAT 的项目页把“Security Council recovers KelpDAO exploiter funds”列为 2026-04-21 的里程碑[30]。L2BEAT 治理代表在 Governance Review #93（2026-04-29）里评论释放提案：“Using the frozen funds… feels like the most reasonable move”，同时说“Why this case and not others is something the DAO will likely need to think through”[31]。注意 L2BEAT 是 Arbitrum DAO 的代表（delegate），属利益相关方。
- **不确定 / 来源矛盾**：l2beat.com/stages 页面（标注 2025-07-23 更新）写 SC 以外的升级需要 7 天退出窗口[27]；论坛规范帖的 changelog 显示 2026-04-30 起改为 5 天，挑战期也同步下调[28]。以论坛规范为准（它自称“source of truth”[28]）。

---

## 4. 对比表（页面用）

| 链 / 事件 | 时间 | 干预层次 | 谁决定 | 资产结果 | 社会反应 | 与 Arbitrum KelpDAO 操作的异同 |
|---|---|---|---|---|---|---|
| Arbitrum One / KelpDAO（基准） | 2026-04-21 | D 治理特权划转（临时升级 L1 Inbox → unsigned tx） | Security Council 9/12[30] | 30,765.67 ETH 划到 0x…0DA0，之后由治理释放 | 有条件支持；L2BEAT 追问“why this case”[31] | — |
| Ethereum / The DAO | 2016-07-20 | E 硬分叉、不规则状态变更[4] | 客户端 + 约 85% 矿工[4] | 约 1200 万 ETH 划入可退款合约[4] | 链分裂（ETC）[4][6] | 同：一次性定向划转；异：需要全网升级，异议者可以留在旧链，Arbitrum 用户没有这个选项 |
| Ethereum / EIP-999 | 2018-04 | E（提议） | 社区 / 客户端 | 未执行，状态 Withdrawn[5] | coin vote 55% 反对（二手）[6] | 反例：受益方集中、没有“攻击者” |
| BSC / Token Hub | 2022-10 | A/B 停链 + C nanofork 黑名单[7][8] | BNB Chain + 验证者 | 攻击地址被禁止交易（冻结）[8] | 官方致歉，承认“not designed to be stopped”[7] | 异：只冻结、不划转；靠客户端硬编码，需要验证者升级 |
| Linea / Velocore | 2024-06 | A sequencer 停摆 + 审查[10] | Linea 团队 | 阻止外流，无划转 | Gluchowski 批评（二手）[10] | 异：入口控制；Arbitrum 改的是资产归属 |
| Hyperliquid / JELLY | 2025-03 | C 验证者投票下架并结算[20] | 验证者集合 | 被标记地址不获补偿（二手）[20] | 争议（未取一手数据） | 异：应用层市场状态，不是余额划转 |
| Sui / Cetus | 2025-05 | B 节点 deny list → C 协议升级（按交易摘要授权的别名）[1][2][3] | 先由验证者各自决定，后由质押投票（90.9%）[1] | 约 1.62 亿美元冻结，转入 4/6 多签信托[1][3] | 通过，但验证者批评投票仓促[3] | 最像：都是“无签名 / 代签、精确到指定交易”；异：有事前质押投票，Arbitrum 是事后治理 |
| Berachain / Balancer V2 | 2025-11-03 → 11-12 | A/B 停链 + C 硬分叉冻结账户 / 转账，Prague4 撤销[11] | 核心团队 + 验证者 | 冻结；资金由持有人自愿归还（二手）[12] | 未取一手数据 | 异：冻结规则写进客户端且有撤销；没有强制划转 |
| Gnosis / Balancer V2 | 2025-11-05 → 12-22 | B soft fork（拒绝投票）→ E hard fork（替换 EOA 代码）[13][15] | 超过 50% 验证者[13] | 约 530 万美元移入 DAO Safe 后由用户领取[15][16] | 有条件支持，同时有先例质疑[14][15] | 同：定向划转进治理托管；异：需要验证者共识；soft fork 被 7702 绕过[16] |
| Flow / Cadence 漏洞 | 2025-12-27 → 2026 | A/B 停链 + C HCU 临时特权 + D Council 回收 / 销毁[18] | Foundation + Council + 验证者 | 1,060 个账户受限；874 亿伪造 FLOW 销毁[18][19] | 放弃回滚，改为隔离恢复[18] | 同：用“受限特权接口”定向处理；异：对象是伪造资产，承诺事后撤权 |
| USDC / USDT | 常设 | F 发行方黑名单 / 冻结[23][24] | 发行方 | 单一资产冻结（条款允许没收） | 已被市场普遍接受为默认风险 | 异：只管一种资产，事前写明；Arbitrum 动的是原生 ETH |
| XRPL / Stellar | 常设 | F 发行资产 freeze / clawback[21][22] | 发行方，须事前设 flag | 冻结或收回发行资产；XRP 本身不可冻结 | 事前可知 | 异：原生资产不在范围内，可以用 No Freeze 自我约束 |
| Arbitrum Compliance Filtering / ZK Stack Filterer | 常设（可选） | A + C 交易过滤[25][26] | 链 owner / ChainAdmin | 交易被拒绝或执行失败，不划转 | Arbitrum One 未启用[26] | 异：拒绝交易 vs 划转资产 |

---

## 5. 图的素材

**图 A：干预层次分类（从“入口”到“资产”）**
1. Sequencer 拒绝收录 / 停摆：Linea[10]；可通过 L1 强制收录绕过的程度见 Arbitrum 的“Self sequence 1d”[30]、OP deposits[33]。
2. 验证者 / 节点黑名单：Sui deny list[3]、Gnosis soft fork[13]、BSC nanofork[8]。
3. 协议执行规则变更：Berachain Prague3[11]、Flow HCU[18]、Sui 地址别名升级[2]、Hyperliquid 下架[20]、Arbitrum Compliance Filtering（常设可选）[26]。
4. 治理特权划转：Arbitrum KelpDAO（L1 Inbox 升级）、Flow Council 回收接口[18]。
5. 硬分叉 / 不规则状态变更：The DAO[4]、Gnosis hard fork[15]、EIP-999（被拒）[5]。
6. 资产发行方：USDC[23]、USDT[24]、XRPL[21]、Stellar[22]。

**图 B：“冻结 → 划转”两阶段模式（多数链重复出现）**
- Sui：节点 deny list 冻结[3] → 质押投票[1] → 协议升级，按 TxDigest 授权别名[2] → 4/6 多签信托[1]。
- Gnosis：soft fork 冻结（11-05）[13] → 修补 7702 绕过（11-07）[16] → hard fork 不规则状态转换（12-22）[14][15] → DAO Safe → Merkl 领取[15]。
- Flow：停链（区块 137390190）→ 1,060 个账户受限 → HCU 授权 Council → 回收 / 销毁 → 承诺撤权[18]。
- Arbitrum：没有单独的冻结阶段。一笔 L1 交易里完成“升级 Inbox → 入队 → 还原”，L2 执行划转，之后靠 AIP 释放（参见机制 lane）。

**图 C：L2BEAT Stage 与 Security Council 权限边界**[27][28][29][30]
- Stage 0：有证明系统、L1 DA 等，SC 没有约束。
- Stage 1：SC 至少 8 人、阈值 75%；SC 可做即时升级；SC 以外的升级需要退出窗口（规范现为 5 天[28]）。“只修 bug、不处理其他恶意行为”的约束被明确排除在第一版之外[29]。→ Arbitrum One 处在这里[30]。
- Stage 2：SC 仅限链上可证 bug；其他升级需 ≥30 天退出窗口[28]。

---

## 6. 代码素材

ZK Stack L1→L2 交易过滤接口（matter-labs/era-contracts，`l1-contracts/contracts/state-transition/chain-interfaces/ITransactionFilterer.sol`，main 分支，访问于 2026-10-07，**未固定 commit**）[25]：
```solidity
interface ITransactionFilterer {
    function isTransactionAllowed(
        address sender,
        address contractL2,
        uint256 mintValue,
        uint256 l2Value,
        bytes memory l2Calldata,
        address refundRecipient
    ) external view returns (bool);
}
```

USDC 发行方黑名单（circlefin/stablecoin-evm，`contracts/v1/Blacklistable.sol`，master 分支，访问于 2026-10-07，**未固定 commit**）[23]：
```solidity
modifier notBlacklisted(address _account) {
    require(!_isBlacklisted(_account), "Blacklistable: account is blacklisted");
    _;
}
function blacklist(address _account) external onlyBlacklister {
    _blacklist(_account);
    emit Blacklisted(_account);
}
```

Sui 恢复升级的设计（MystenLabs/sui PR #22237 描述原文，非代码）[2]：
```
- ProtocolConfig can specify address aliases which allow a signature from address A to act as the sender address B.
- The aliasing is restricted to a specified set of TransactionDigests.
- The address deny list is bypassed for any allowed transaction.
```

---

## 7. 来源

1. **PRIMARY** Sui Foundation，“Response to the Cetus Incident – Onchain Community Vote”，https://www.sui.io/blog/cetus-incident-response-onchain-community-vote （2025-05-27，访问于 2026-10-07）：证明投票规则、90.9% 质押支持、排除基金会质押、4/6 多签信托和别名授权设计。
2. **PRIMARY** MystenLabs/sui PR #22237，“Protocol update to allow recovery of stolen funds”，https://github.com/MystenLabs/sui/pull/22237 （2025-05-30 合入，访问于 2026-10-07）：证明协议层别名、TxDigest 限定、绕过 deny list 的实现。
3. **PRIMARY**（验证者本人立场）Chainflow，“Official Response to the Cetus Exploit and SUI Governance Vote”，https://chainflow.io/chainflows-official-response-to-the-cetus-exploit-and-sui-governance-vote/ （访问于 2026-10-07）：证明验证者的有条件支持与批评，并转引 Sui 2025-05-23 X 帖（节点配置文件可以忽略指定地址、冻结约 1.62 亿美元）。
4. **PRIMARY** Ethereum Foundation Blog，“Hard Fork Completed”，https://blog.ethereum.org/2016/07/20/hard-fork-completed （访问于 2026-10-07）：证明 1920000 块的不规则状态变更、约 1200 万 ETH、约 85% 矿工、非分叉链。
5. **PRIMARY** EIP-999，https://eips.ethereum.org/EIPS/eip-999 （访问于 2026-10-07）：证明提案内容（恢复 WalletLibrary 代码）和 Withdrawn 状态。
6. 二手：Cointelegraph，“#EIP-999: Why A Vote To Release Parity Locked Funds Evoked So Much Controversy”，https://cointelegraph.com/news/eip-999-why-a-vote-to-release-parity-locked-funds-evoked-so-much-controversy （访问于 2026-10-07）：转述 coin vote 结果 55/39.4/5.6、513,774 ETH、Polkadot 约 306,000 ETH，以及 ETC 名称。
7. **PRIMARY** BNB Chain，“BNB Chain Ecosystem Update”，https://www.bnbchain.org/en/blog/bnb-chain-ecosystem-update （2022-10，访问于 2026-10-07）：证明逐个联系验证者停链、200 万 BNB，以及后续治理议题“freeze or not to freeze”。
8. **PRIMARY** bnb-chain/bsc Release v1.1.15，https://github.com/bnb-chain/bsc/releases/tag/v1.1.15 （访问于 2026-10-07）：证明硬分叉客户端里加入了攻击地址黑名单（nanofork，PR #1109）。
9. **PRIMARY** bnb-chain/bsc Release v1.1.16，https://github.com/bnb-chain/bsc/releases/tag/v1.1.16 （访问于 2026-10-07）：证明 Moran 硬分叉修复漏洞、恢复跨链。
10. 二手：Cointelegraph，“Linea blockchain halt highlights slow decentralization of Ethereum L2s”，https://cointelegraph.com/news/linea-hack-highlights-need-for-decentralization-on-ethereum-layer-twos （2024-06，访问于 2026-10-07）：转引 Linea、Alex Gluchowski、Declan Fox 的 X 帖子，以及暂停的区块号。
11. **PRIMARY** berachain/bera-geth Releases，https://github.com/berachain/bera-geth/releases （v1.011602.6 / v1.011602.7 / v1.011607.0，访问于 2026-10-07）：证明 Prague3 冻结账户 / 转账和 BEX vault，以及 Prague4 在 11-12 撤销。
12. 二手：Coinpaper，“Berachain Launches Emergency Hard Fork…”，https://coinpaper.com/12099/berachain-launches-emergency-hard-fork-to-fix-balancer-hack-vulnerabilities （访问于 2026-10-07）：转引 Berachain X 帖（验证者协调停链、MEV bot 运营者愿意归还）。
13. **PRIMARY** Gnosis Forum，Friederike Ernst，“Balancer hack update”，https://forum.gnosis.io/t/11759 （2025-11-05，访问于 2026-10-07）：证明 soft fork 机制、超过 50% 验证者、发行方冻结 EURe，以及官方立场。帖内 NolanV 的批评也取自这里。
14. **PRIMARY** Gnosis Forum，“Balancer hack: hard fork”，https://forum.gnosis.io/t/11884 （2025-12-12 起，访问于 2026-10-07）：证明硬分叉时间、客户端版本、10 天升级期、对不跟随者的惩罚，以及 Serenita 的立场。
15. **PRIMARY** Gnosis Forum，“Balancer hack: claim process”，https://forum.gnosis.io/t/12149 （2026-02-26，访问于 2026-10-07）：证明不规则状态转换（替换 EOA 代码）的规范原文、DAO Safe、Merkl 领取，以及 MichaelRealT 的反对意见。
16. **PRIMARY**（利益相关方）Gnosis Forum，mfw78，“Should GnosisDAO establish bug bounty coverage… EIP-7702 disclosure?”，https://forum.gnosis.io/t/11951 （2026-01-06，访问于 2026-10-07）：证明第一版 soft fork 只过滤 from/to、可经 EIP-7702 绕过、11-07 第二次 soft fork、回收 5,308,954.42 美元。
17. 二手：Cointelegraph，“Gnosis announces hard fork to recover funds from Balancer exploit”，https://cointelegraph.com/news/gnosis-hard-fork-balancer-exploit （访问于 2026-10-07）：交叉印证 hard fork 的执行。
18. **PRIMARY** Flow，“Flow Security Incident 27th December: Technical Post-Mortem”，https://flow.com/post/dec-27-technical-post-mortem （访问于 2026-10-07）：证明停链区块、1,060 个账户受限、HCU 授予 Council 有限接口、放弃回滚改选隔离恢复，以及撤权承诺。
19. **PRIMARY** Flow，“Final Remediation Update… 87.4 Billion Counterfeit Tokens have Been Destroyed”，https://flow.com/post/final-remediation-update-regarding-the-flow-security-incident-87-4-billion-counterfeit-tokens-have-been-destroyed- （访问于 2026-10-07）：证明销毁由 Community Governance Council 在链上执行。
20. 二手：TechFlow，“Hyperliquid: Validators vote to delist JELLY…”，https://www.techflowpost.com/en-US/newsletter/79211 （2025-03-26，访问于 2026-10-07）：转引 @HyperliquidX 帖子原文。
21. **PRIMARY** XRPL Docs，“Freezing Tokens”（xrpl-dev-portal 源文件），https://raw.githubusercontent.com/XRPLF/xrpl-dev-portal/master/docs/concepts/tokens/fungible-tokens/freezes.md （访问于 2026-10-07）：证明发行资产冻结类型、XRP 不可冻结、No Freeze 设置。
22. **PRIMARY** Stellar CAP-0035 “Asset Clawback”，https://github.com/stellar/stellar-protocol/blob/master/core/cap-0035.md （访问于 2026-10-07）：证明 clawback 需要事前设置 flag，以及它的动机。
23. **PRIMARY** circlefin/stablecoin-evm `contracts/v1/Blacklistable.sol`（master，访问于 2026-10-07）：证明 USDC 的黑名单角色与检查逻辑。
24. **PRIMARY** Tether Terms of Service，https://tether.to/en/legal/ （访问于 2026-10-07）：证明 Tether 保留冻结、拉黑和没收的权利。
25. **PRIMARY** matter-labs/era-contracts `ITransactionFilterer.sol`（main，访问于 2026-10-07）：证明 ZK Stack L1→L2 过滤接口的参数。
26. **PRIMARY** Arbitrum Docs，“Compliance filtering”，https://docs.arbitrum.io/launch-arbitrum-chain/chain-config/sequencer/compliance-filtering （访问于 2026-10-07）：证明功能默认关闭、不打算在 One 上使用、两层结构和规则范围。
27. **PRIMARY** L2BEAT，“Stages”，https://l2beat.com/stages （页面标注 2025-07-23 更新，访问于 2026-10-07）：证明 Stage 1/2 要求的页面版本（写的是 7 天）。
28. **PRIMARY** L2BEAT Forum，“The Stages Framework”，https://forum.l2beat.com/t/the-stages-framework/291 （2026-05-05 更新，访问于 2026-10-07）：规范“source of truth”。证明 SC ≥8 人 / 75%、5 天退出窗口（2026-04-30 起），以及 Stage 2 的 SC 限制。
29. **PRIMARY** L2BEAT Forum，“Stages update: a high-level guiding principle for Stage 1”，https://forum.l2beat.com/t/stages-update-a-high-level-guiding-principle-for-stage-1/338 （访问于 2026-10-07）：证明“SC 只修 bug、不处理其他恶意行为”的性质被排除在 Stage 1 第一版之外；也包含 ZK Stack TransactionFilterer 的分析。
30. **PRIMARY**（L2BEAT 评估）L2BEAT，“Arbitrum One”，https://l2beat.com/scaling/projects/arbitrum （访问于 2026-10-07）：证明 Stage 1、Stage 2 未满足项、SC 9/12、Self sequence 1d、紧急升级路径无退出窗口，以及 KelpDAO 里程碑。
31. **PRIMARY**（L2BEAT 观点，利益相关）L2BEAT，“Governance Review #93”，https://l2beat.com/publications/governance-review-93 （2026-04-29，访问于 2026-10-07）：证明 L2BEAT 对释放提案的看法和“why this case”的追问。
32. **PRIMARY**（common.md 提供，本 lane 未重新抓取）Arbitrum Forum，“Security Council Emergency Action 21/04/2026”，https://forum.arbitrum.foundation/t/security-council-emergency-action-21-04-2026/30803 ：KelpDAO 基准事实。
33. **PRIMARY** OP Stack Specification，“Derivation”，https://specs.optimism.io/protocol/derivation.html （访问于 2026-10-07）：证明 user-deposited transactions 由 L1 收据派生、放在 epoch 首块，sequencer batch 不得包含 deposited 类型交易。

---

## 8. 外部调研中被修正或无法核实的地方

- GPT §七把 Sui 描述为“对已冻结资产，通过特定协议升级授权恢复交易”。基本正确，但漏了**冻结本身是验证者本地配置的 deny list**[3]。另外，升级允许“A 的签名代表 B”，而不是让任意人指定 sender[2]。
- GPT §7.1 说“资金进入 4/6 multisig”。这是投票时的**计划**[1]。实际恢复交易是否执行、信托多签地址，本 lane 没有在链上核实（见开放问题）。
- GPT 说 BNB Chain 的“拟议冻结不能仅凭公告认定已实施”。一手来源表明，**攻击地址黑名单已通过 v1.1.15 硬分叉写入客户端**[8]。至于之后“freeze or not”治理投票的结果，仍然没有找到。
- GPT 对 Linea 的引用来自 The Block。本 lane 用的是 Cointelegraph 转引；Linea 的 X 原帖抓不到，仍属二手。
- GPT §7.3 说 The DAO 硬分叉“不是把整段历史交易简单删除”。与 EF 公告一致[4]。
- GPT §7.4 关于 XRPL 的说法与官方文档一致[21]。GPT 没有提到 Stellar clawback 必须事前设置 flag[22]。
- GPT 没有覆盖 Gnosis、Berachain、Flow、BSC nanofork、Hyperliquid。这些由本 lane 补齐。其中 Gnosis 的 7702 绕过[16]直接说明“只按 from/to 过滤”的审查不完整。
- GPT 引用 The Block 说释放 Snapshot“获得较高支持率”。本 lane 没有核实（属另一 lane）。

---

## 9. 开放问题

1. Sui 两笔恢复交易的摘要、执行时间、信托多签地址，以及资金最终是否全部分发（需要 Suiscan 或 Cetus 的一手公告）。
2. BNB Chain 2022-10 后续“freeze or not to freeze”等链上治理投票的结果。
3. Flow 的 Phase 4“Validators revoke elevated Community Governance Council privileges”是否已经执行[18]。
4. Hyperliquid JELLY 的一手公告原文、验证者构成、结算价（X 原帖抓不到）。
5. EOS ECAF 2018（冻结 27 个账户）和 Steem 0.22.2 / Hive 分叉（2020）的一手来源，可作为“验证者冻结引发分裂”的补充案例。
6. Sonic、Sei、Solana、Tron、Ronin，以及 Base / OP / zkSync / Starknet / Polygon 是否有过实际的链级冻结或划转动作。
7. Circle / era-contracts 代码引用需要固定 commit。
8. L2BEAT 是否就 KelpDAO 操作发表过专门的 Stage 评估（目前只有项目页里程碑和治理周报）。

---

## 10. 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| P1 | The DAO 硬分叉在第 1920000 块执行不规则状态变更，把约 1200 万 ETH 划入 WithdrawDAO 恢复合约 | [4] EF Blog “Hard Fork Completed” | observed | |
| P2 | The DAO 分叉时约 85% 矿工跟随新链，旧链继续存在 | [4] “roughly 85% of miners mining on the fork”；`--oppose-dao-fork` | observed | |
| P3 | EIP-999 提议恢复 0x863DF6…07b4 处已自毁的 WalletLibrary 代码，状态为 Withdrawn | [5] EIP-999 页面 | observed | |
| P4 | EIP-999 的 coin vote 结果为 55% 反对、39.4% 赞成 | [6] Cointelegraph 转述（原投票页不可访问） | speculative | |
| P5 | EIP-999 被拒的理由之一是受益方集中（Polkadot 约 306,000 ETH 被锁） | [6] Cointelegraph | speculative | |
| P6 | BSC Token Hub 事件中，BNB Chain 逐个联系验证者让链停下 | [7] BNB Chain 博客 | observed | |
| P7 | BSC v1.1.15 是硬分叉版本，在客户端中禁止攻击相关地址继续交易 | [8] Release v1.1.15，PR #1109 “nanofork: block exploitation accounts” | observed | |
| P8 | BNB Chain 曾计划用链上治理投票决定是否冻结被盗资金，结果未核实 | [7] “freeze or not to freeze?” | observed | |
| P9 | Linea 在 Velocore 事件中暂停 sequencer（区块 5081800–5081801 之间）并审查攻击者地址 | [10] Cointelegraph 转引 Linea X 帖 | speculative | |
| P10 | Matter Labs CEO Gluchowski 公开批评说 sequencer 去中心化“isn’t optional” | [10] Cointelegraph 转引 X 帖 | speculative | |
| P11 | Hyperliquid 验证者投票下架 JELLY 永续合约，被标记地址不获补偿 | [20] TechFlow 转引 @HyperliquidX | speculative | |
| P12 | Sui 验证者通过各自节点的配置文件忽略攻击者地址的交易，冻结约 1.62 亿美元 | [3] Chainflow 转引 Sui X 帖；[2] PR 称之为 “address deny list” | observed | |
| P13 | Sui 恢复升级允许地址 A 的签名以 B 为 sender，只限指定的 TransactionDigest，并绕过 deny list | [2] PR #22237 描述 | observed | |
| P14 | Sui 恢复投票按验证者质押加权，排除基金会质押，90.9% 质押支持 | [1] Sui 博客 Update | observed | |
| P15 | Sui 恢复资金计划转入 4/6 多签信托（Cetus 2 / Sui Foundation 2 / OtterSec 2） | [1] Sui 博客 | observed | |
| P16 | Sui 验证者 Chainflow 投赞成，但批评投票仓促，并指出基金会委托质押带来的利益冲突 | [3] Chainflow 声明 | observed | |
| P17 | Berachain Prague3 硬分叉冻结 Balancer 攻击者的账户和转账，以及 BEX vault 的使用 | [11] bera-geth v1.011602.6 / v1.011607.0 release notes | observed | |
| P18 | Berachain Prague4 于 2025-11-12 16:00 UTC 撤销 Prague3 的冻结 | [11] bera-geth v1.011607.0 | observed | |
| P19 | Berachain 被盗资金由一名 MEV bot 运营者自愿归还，不是协议强制划转 | [12] Coinpaper 转引 Berachain X 帖 | speculative | |
| P20 | Gnosis 的 soft fork 让验证者拒绝为移动攻击者余额的区块投票，超过 50% 验证者采纳 | [13] Friederike Ernst 论坛帖 | observed | |
| P21 | Gnosis 第一版 soft fork 只过滤 from/to，可通过 EIP-7702 授权绕过；11-07 部署第二次 soft fork 修补 | [16] mfw78 论坛帖（利益相关方） | observed | |
| P22 | Gnosis hard fork 于 2025-12-22 激活，以不规则状态转换把攻击者 EOA 的代码替换为受限转发合约 | [14] 激活时间；[15] 规范原文引用 | observed | |
| P23 | 只按交易顶层 from/to 的地址审查不足以冻结资产；Arbitrum Compliance Filtering 覆盖 CALL/CREATE 和代币转账，范围更宽 | 由 P21、[26] 规则列表推出：Gnosis 的绕过路径正是内部调用 / 授权，而 Arbitrum 的规则明确覆盖这些 | inferred | |
| P24 | Gnosis 回收的资金进入 DAO 控制的 Safe，通过 Merkl 领取页分发 | [15] claim process 帖 | observed | |
| P25 | Gnosis 大验证者 Serenita 支持 hard fork，但要求事前制定 ground rules，并指出救援 Safe 当时只有单签 | [14] Serenita 论坛帖 | observed | |
| P26 | Flow 验证者在区块 137390190 协调停链，时间在首笔恶意交易后 6 小时内 | [18] Flow post-mortem | observed | |
| P27 | Flow 通过 HCU 给 Community Governance Council 一个有限治理接口，用来回收和销毁受限账户中的伪造代币 | [18] Phase II 描述 | observed | |
| P28 | Flow 曾准备回滚到攻击前 checkpoint 的方案，最终选择保留合法历史的 Isolated Recovery | [18] §8 | observed | |
| P29 | Flow 已销毁 874 亿枚伪造 FLOW，由 Community Governance Council 在链上执行 | [19] Flow 最终更新 | observed | |
| P30 | Flow 承诺事后撤销 Council 的提升权限，是否已执行未核实 | [18] §9 guarantees | observed | |
| P31 | USDC 合约由 blacklister 角色单方面拉黑地址，被拉黑地址的操作会被 revert | [23] Blacklistable.sol | observed | |
| P32 | Tether 条款保留冻结、拉黑和没收 USDT 的权利 | [24] Tether ToS | observed | |
| P33 | XRPL 发行方可以冻结其发行资产，但 XRP 不可冻结；发行方可以用 No Freeze 永久放弃冻结权 | [21] XRPL 文档 | observed | |
| P34 | Stellar clawback 要求发行方在 trustline 建立时已设置 AUTH_CLAWBACK_ENABLED_FLAG | [22] CAP-35 | observed | |
| P35 | Arbitrum Compliance Filtering 默认关闭，不打算在 Arbitrum One 使用 | [26] Arbitrum Docs | observed | |
| P36 | ZK Stack 的 ITransactionFilterer 可以按 sender、目标、value、calldata 过滤 L1→L2 交易 | [25] 接口代码；[29] L2BEAT 分析 | observed | |
| P37 | OP Stack 的 user-deposited transactions 由 L1 收据派生、放在 epoch 首块，sequencer batch 不得包含 deposited 类型交易 | [33] Derivation spec | observed | |
| P38 | L2BEAT 判定 Arbitrum One 为 Stage 1，SC 为 9/12，Self sequence 延迟 1 天 | [30] L2BEAT 项目页 | observed | |
| P39 | L2BEAT 认为 Arbitrum One 未达 Stage 2 的原因之一是“SC 的行动不限于链上可证 bug” | [30] Stage 2 issues | observed | |
| P40 | Stage 1 要求 SC 至少 8 人、阈值 75%；SC 以外发起的升级需要退出窗口（规范现为 5 天） | [28] 论坛规范及 changelog | observed | |
| P41 | l2beat.com/stages 页面写的是 7 天退出窗口，与论坛规范 2026-04-30 起的 5 天不一致 | [27] 与 [28] 对比 | observed | |
| P42 | L2BEAT 曾考虑让 Stage 1 的 SC“只修 bug、不处理其他恶意行为”，但明确排除在第一版之外 | [29] 原文 “we decided to exclude this property in this first version” | observed | |
| P43 | KelpDAO 式的 SC 定向划转在 Stage 1 定义下被允许 | 由 P38、P40、P42 推出：Stage 1 只约束 L2→L1 消息与 SC 结构，不限制 SC 的紧急升级用途，Arbitrum 仍被评为 Stage 1 | inferred | |
| P44 | Stage 2 链的 SC 不应具备 KelpDAO 式的即时划转能力 | 由 [28] Stage 2 “SC restricted to act only due to errors detected on chain”、P39 推出：划转攻击者资产不属于链上可裁决的 bug | inferred | |
| P45 | L2BEAT 治理代表认为用冻结资金减损“most reasonable”，同时追问“why this case and not others” | [31] Governance Review #93（L2BEAT 是 Arbitrum delegate） | observed | |
| P46 | 先例中被接受的案例都伴随“范围窄（单地址 / 指定交易）+ 多数背书 + 资金托管透明” | 由 P13–P15、P20、P22、P24、P1–P2 推出：Sui、Gnosis、The DAO 都具备这三点并最终执行 | inferred | |
| P47 | 受益方集中、整链回滚、中心化单方面停链这三类做法遭遇强烈反对或被放弃 | 由 P3–P5（EIP-999 被撤回）、P28（Flow 放弃回滚）、P10（Linea 被批）推出 | inferred | |
| P48 | 即使是获支持的干预，参与者也普遍要求事前规则框架 | 由 P16、P25、P45 及 [15] MichaelRealT 的“strict framework”推出 | inferred | |
| P49 | 在所列先例中，Arbitrum 是唯一不需要验证者 / 节点运营者升级或配合、只靠多签升级 L1 合约完成划转的案例 | 由第 4 节对比表推出：Sui、Gnosis、Berachain、Flow、BSC、The DAO 都需要节点 / 验证者采纳新版本或配置；Arbitrum 由 SC 9/12 升级 L1 Inbox 完成（[30]、[32]） | inferred | |
| P50 | Sui 的“按交易摘要授权的别名”在机制上与 Arbitrum“临时 Inbox override 指定 sender”最接近 | 由 P13 与 [32] 推出：两者都不用私钥，让协议在一次性范围内以攻击者地址为 sender 执行指定交易 | inferred | |

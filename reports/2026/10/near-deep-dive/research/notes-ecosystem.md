# Lane 笔记：生态使用数据与叙事 / infra 演进时间线（notes-ecosystem）

**研究问题**：NEAR 用户实际在用什么？链级指标的口径是什么？从 2017 到 2026 年，叙事、产品和 infra 是怎样交替演进的？“产品驱动 infra 迭代”有没有一手证据？
**一句话答案**：截至 2026-10-06/07，真实需求最集中的是 NEAR Intents 的跨链兑换，主要靠外部钱包和聚合器分发：DefiLlama 口径下 30 天成交量 44.1 亿美元，fees 738 万美元。同期 NEAR L1 30 天 gas 费只有约 14 万美元，日交易数约 0.9M，比 2024–2025 年高峰（日交易 4–7M、日活账户 1–2M）低一个数量级。原生 DeFi（RHEA 借贷/DEX、LST）还有一定存量。Privacy 和 AI 目前只有上线和集成的证据，找不到用量数据。“产品驱动 infra 迭代”确实有一手证据：NEP-366 的动机里点名了 Sweatcoin，NEP-519 点名了 MPC 签名合约，NEP-635 点名了 Intents passkey，nearcore 还专门为 Sweat/KaiChing 合约写过 prefetcher。但 gas keys、SPICE、动态分片的动机写的是协议自身（DoS、扩展性），不是某个产品。
抓取时间：所有 API 和面板数据均在 2026-10-07（UTC）抓取，日级数据最新到 2026-10-05 或 10-06。

---

## Q1 链级指标（来源、时间、口径）

**答案**：最新日（2026-10-06，nearblocks）数据：交易 909,765 笔，活跃账户 124,809，新建账户 8,773，平均出块约 0.59 s。DefiLlama 口径下，NEAR 链 TVL 约 2.307 亿美元。NEAR 链 DEX 24h 成交 1.383 亿美元，其中约 85% 来自 NEAR Intents（DefiLlama 把它归在 Bridge 类）。L1 gas 费 24h 约 5,020 美元，30 天约 14.09 万美元。

**依据**
- nearblocks `/v1/charts` 日级数据 [9]。2026-10-06 那一行：`txns 909765`、`active_accounts 124809`、`new_accounts 8773`、`blocks 146811`（86400/146811 ≈ 0.589 s/块）、`txn_fee_usd 5215`。近 7 日交易数在 69 万到 115 万之间，10-01 当天为 1,151,492 [9]。`/v1/stats` 返回 `avg_block_time 0.5941`、`total_txns 5,455,846,627` [10]。
- 历史对比（同一数据源 [9]，每个日期一行）：

  | 日期 | txns | active_accounts | new_accounts | active_contracts |
  |---|---|---|---|---|
  | 2023-12-01 | 13,935,402 | 93,455 | 37,791 | 606 |
  | 2024-06-14 | 7,192,965 | 2,235,537 | 489,944 | 825,590 |
  | 2024-11-14 | 6,940,126 | 998,878 | 437,117 | 2,410,298 |
  | 2025-06-14 | 4,688,138 | 370,719 | 244,966 | 2,619,026 |
  | 2026-01-14 | 4,277,725 | 173,925 | 192,916 | 2,855,101 |
  | 2026-04-01 | 3,758,663 | — | — | （3-31：2,194,168） |
  | 2026-04-15 | 763,144 | 133,306 | 19,082 | 95,043 |
  | 2026-10-06 | 909,765 | 124,809 | 8,773 | 60,770 |

  注：2026-04-01 的 txns 取自该日记录；2026-03-31 的 active_contracts 为 2,194,168、active_accounts 为 139,225。
- DefiLlama `/v2/chains`：Near `tvl 230,688,765`，Aurora `tvl 4,461,290` [1]。
- DefiLlama `/overview/dexs/near`：`total24h 138,277,666`，`total30d 5,691,831,953`。各协议 24h：NEAR Intents 117,176,998（category=Bridge）、Rhea Dex 18,613,047、THORSwap 3,222,970（多链协议，不只是 NEAR）。响应里没有日期字段 [2]。
- DefiLlama 链 fees（`/summary/fees/near`，数据经 Allium）：`total24h 5,020`、`total30d 140,867`、`total1y 1,243,718`。方法论写的是“70% burned / 30% 给被调用合约的开发者” [6]。2023-12-01 单日 173,071 美元是历史尖峰，与 nearblocks 当天 `txn_fee_usd 173,070` 一致（NEAT 铭文事件）[6][9]。
- Artemis / Token Terminal / pikespeak：本次没有访问，没有数据。

**不确定之处**
- nearblocks 的 `active_accounts` 统计的是活跃账户，不是自然人；Intents 由 relayer/solver 上链，所以会低估 Intents 的终端用户（inferred）。
- DefiLlama 的 DEX 汇总把 Intents（Bridge 类）和多链 THORSwap 都算进 NEAR，口径比“链内 DEX”宽得多。
- 2026-04-01 到 04-15 之间，txns 下降约 80%，active_contracts 从 219 万降到 9.5 万。原因没有一手说明（见开放问题）。

## Q2 NEAR 用户在用什么

### 2a NEAR Intents
**答案**：按 DefiLlama 口径，30 天 volume 44.15 亿美元、fees 738.4 万美元、revenue 192.6 万美元，累计 volume 323.5 亿美元、fees 5,273 万美元。按官方 explorer，30 天 volume 32.64 亿美元、累计 309.2 亿美元。分发集中在 SwapKit（含 Ledger）、Rango、ZODL、LI.FI、THORSwap 等渠道。另外，NEAR 自己的回购钱包也是 explorer 上 24h 成交额最大的 affiliate。

**依据**
- DefiLlama volume：`total30d 4,414,741,164`，`totalAllTime 32,345,345,299`，最早数据点为 2024-12-10（32,616 美元）。序列中缺了几天（如 2026-02-17、04-16），`total7d` 和 `change_1d` 与图表数据对不上 [5]。
- DefiLlama fees：`total30d 7,384,225`，`totalAllTime 52,725,260`。方法论原文：Fees = “protocol fee plus the affiliate (distribution) fee each frontend collects”；Revenue = “NEAR/wNEAR swept into its revenue wallets (reconciles with revenue.near.org and the on-chain buyback)”；SupplySideRevenue = 渠道和 solver 拿走的部分（举例 SwapKit）；HoldersRevenue = “Since 2026-02-23 … buy back $NEAR on the open market (not burned)” [3]。
- DefiLlama revenue：`total30d 1,926,082`，`totalAllTime 7,507,530`。2026-01-31 之后才有连续的日度数据，此前是一次性大额入账 [4]。
- 由 [3][4][5] 推算（同一来源，同一窗口）：30 天 fees/volume ≈ 16.7 bps，revenue/volume ≈ 4.4 bps，revenue/fees ≈ 26%。
- revenue.near.org（2026-10-07 更新）：Total fees generated 5,342 万美元。累计入账钱包按 NEAR 计：`fefundsadmin.sputnik-dao.near` 1,846,188（48.8%）、`buybacks.multisignature.near` 1,384,693（36.6%）、`1csfundsadmin.sputnik-dao.near` 555,348（14.7%）。页面列出的 Top Interfaces 有 Brave Wallet、Rabby、ZODL、Trust Wallet、SafePal、LI.FI、SwapKit、Ledger，并写明支持 33 条链。其余实时数字没有渲染出来 [12]。
- Explorer（24h 窗口，抓取于 2026-10-07）：All time 30,924,902,331；24h 93,978,963；7D 627,766,804；30D 3,264,206,005。
  - Referrals（24h，tx / volume）：swapkit 8,845 / 15,275,849；rango 1,373 / 2,912,372；zodl 326 / 2,845,703；stableflow 39 / 2,206,433；lifi 542 / 1,951,463。
  - Affiliates（24h，tx / volume）：`buybacks.multisignature.near` 5,194 / 12,737,186；`swapkit.near` 1,749 / 6,964,963；`ledgerswapkit.near` 1,414 / 5,579,180；`thorswap.near` 168 / 3,010,789；`zodlswaps.near` 326 / 2,845,703。
  - 页面上没有唯一用户、fees、链或资产数量。“More Stats” 链接到 Dune（本次没有访问）[11]。
- 支持范围：docs 的 chain-support 页列出 32 条链（EVM 15 条，BTC 系 6 条，其他 L1 11 条）[15]。1Click `/v0/tokens` 返回约 200 个以上 asset 条目（按 `"assetId"` 计数约 204，计数工具可能有截断）[16]。Brave 公告当时的说法是“over 19 million swaps … over $14 billion … across 35 chains” [19]。
- 费率（docs）：协议费 1 pip（0.0001%），由 `intents.near` 收取；near-intents.org 前端费 0.2%，进入 `fefundsadmin.sputnik-dao.near`。1Click：没有 API key 时加 25 bps；有 key、不带 appFees 时 20 bps（稳定币对和同资产跨链为 1 bp）；带 appFees 时 50/50 分成，1Click 那一半最低 20 bps。成交价优于报价时，改善部分 50/50 分 [13][14]。

**不确定之处**：唯一用户和地址数没有拿到（Dune 未访问）。DefiLlama 30 天 volume 比 explorer 高约 35%，累计只高约 4.6%，差异集中在近期，原因未知。回购钱包的 swap 也计入 volume（24h 占 explorer 总量约 13.6%），这部分是协议自身的操作，不是外部用户需求（inferred）。

### 2b 原生 DeFi
**答案**：RHEA（Ref Finance 与 Burrow 合并）是最大的原生协议，Rhea Lend TVL 约 1.96 亿美元、Rhea Dex 约 3,138 万美元。LST 中 Meta Pool（NEAR）约 1.21 亿、LiNEAR 约 1.19 亿美元。各协议 TVL 加起来超过链 TVL，存在重复计算，不能直接相加。

**依据**：DefiLlama `/tvl/<slug>`：rhea-lend 195,933,103（`burrow` slug 返回同一个值）、rhea-dex 31,380,974、meta-pool-near 120,896,041、linear-protocol 119,203,259 [7]。Rhea Lend fees 30 天 182,156、revenue 30 天 45,614；fees 序列在 2026-04-20 到 05-11 之间为 0 [8]。Rhea Dex fees 30 天 890,942，按方法论 20% 归 Ref DAO treasury，2026-09 下旬明显上升 [8]。DefiLlama 记录的 Rhea Dex 前名为 “Ref Finance”，Rhea Lend 前名为 “Burrow” [8]。

### 2c 钱包与消费入口
**答案**：
- Sweat 已确认收场：Sweat Wallet 和当前形态的 SWEAT 将于 2026-12-30 结束。公告给出的原因是经济模型未能维持、交易所下架、2026-04 安全事件的成本、新用户增长放缓。SWEAT token 合约继续存在；Sweatcoin 是另一家公司 Sweatco Ltd 运营的独立 app [18]。
- HOT 和 KAIKAI 没有找到可审计的一手用户数据。

**依据**
- update.swe.at（发布于 2026-10-01 15:00 London）原文：“The economics of the current model have not held … did not get there.” 公告里有几点对架构理解有用 [18]：
  - “Every Sweat Wallet account is a NEAR account”；
  - 用户持有的 EVM 链余额 “remain accessible for as long as NEAR Chain Signatures operate”（Sweat Wallet 用 Chain Signatures 管理外链余额）；
  - Sweat 的验证节点 `sweat_validator.poolv1.near` 将于 2026-10-31 停止。
- nearcore 1.39.0 CHANGELOG：“Adds improvements to the `sweat` contract prefetcher logic. Add new prefetcher logic for `kaiching` contract.” 说明 Sweat 和 KaiChing（KAIKAI）当时是链上主要负载，节点软件为这两个合约做了专门优化 [32]。
- HOT：只找到二手报道称 “HOT Wallet … over 30 million users”（cryptobriefing，转述）[44]；Intents docs 里 HOT Bridge 的文档链接指向 docs.hotdao.ai [17]。
- 账户高峰与应用的对应关系：nearblocks 显示 2024-06 日活约 224 万、新建账户 49 万/日 [9]。没有找到把这些账户归因到 HOT/Sweat/KAIKAI 的一手面板（speculative）。

### 2d AI / Privacy
**答案**：没有找到用量数据。near.ai/blog 第一页 12 篇文章里，没有任何用户、请求、token 或客户数字 [36]。Explorer 不区分 confidential 交易量 [11]。所以目前能确认的只有发布和集成：
- Confidential Intents 上线（二手报道日期为 2026-02-25/26）[42]；
- 私有 USDC agent 支付（2026-05-14）[36]；
- IronClaw 1.0（2026-07-27）[36]；
- NEAR AI Cloud 上架 OpenRouter（2026-09-28）[36]。

### 2e 结论：哪些功能有用户接受的证据
| 功能 | 证据等级 | 依据 |
|---|---|---|
| Intents 跨链兑换（经第三方钱包/聚合器） | 强：持续交易量和费用，有渠道分成 | [3][5][11][12] |
| 原生借贷/DEX/LST（RHEA、Meta Pool、LiNEAR） | 中：有 TVL 和 fees，但规模在下降（Rhea Lend 日 fees 从 2025 年中约 2 万美元降到约 0.6–0.8 万美元） | [7][8] |
| 账户抽象 / meta tx / 消费级 onboarding（Sweat、KaiChing、HOT 时代） | 历史上强（2024 年日活 100–200 万），现已大幅收缩；Sweat 宣布结束 | [9][18][32] |
| Chain Signatures | 有生产使用（Sweat Wallet 外链余额；Intents 建在其上），但没有拿到独立用量 | [18][21] |
| Confidential Intents、NEAR AI、IronClaw | 只有上线和集成，没有用量 | [36][42] |
| Shade Agents | 反例：已停止维护 | [37] |

## Q3 叙事 / 产品 / infra 时间线（2017–2026）

**答案**：主线是 AI 起源（2017）→ 分片 L1（2018–2020）→ 跨链与 EVM（2021）→ 消费级 onboarding（2022–2024：meta tx、零余额账户、Sweat/KaiChing/HOT）→ Chain Abstraction（2023 年提出，2024 年 Chain Signatures、Intents）→ User-owned AI（2024-05）→ 性能 infra（2024-08 stateless validation、2025-05 约 600 ms 出块、2026-07 gas keys / 动态分片 / 后量子签名）→ 2026 Privacy + Agent（Confidential Intents、IronClaw）。SPICE 仍是计划。
**依据**：见“图的素材 · 时间线”。日期没有找到一手来源的条目已在类型旁标注。

## Q4 “产品驱动 infra 迭代”检验

**答案**：部分成立，而且主要成立在账户和授权这一层，执行和扩展层不成立。

一手文本明说动机来自某个产品的有：
- NEP-366：点名 Sweatcoin、NEARCrowd、Aurora Plus；
- NEP-519：MPC 签名合约；
- NEP-591：Chain Signatures 智能钱包，以及企业代用户建户时的退款滥用；
- NEP-635：Near Intents passkey 和 TEE attestation；
- NEP-641：MPC 签名请求、confidential swap intent；
- nearcore 1.39：Sweat/KaiChing prefetcher。

扩展性主线的动机写的是协议自身问题：
- NEP-539：拥塞时内存无界增长，没有点名具体事件；
- NEP-611：SPICE 异步执行下的 DoS；
- NEP-639：人工 resharding 太慢。

**案例表**（产品/事件 → 协议改动 → 原文）

| 产品 / 事件 | 协议改动 | 状态 / 版本 | 原文短引用 | 类型 |
|---|---|---|---|---|
| Sweatcoin、NEARCrowd、Aurora Plus relayer | NEP-366 Meta Transactions | 1.32.0 稳定 | “apps that pay user for doing work (like NEARCrowd or Sweatcoin) … Aurora Plus has shown viability of the relayers” [22] | observed |
| 应用代用户建户 | NEP-448 零余额账户 | 1.32.0 稳定 | “the application creates an account for the user and pays for transaction fees through meta transactions” [23] | observed（未点名产品） |
| Chain Signatures 的 MPC 签名合约 | NEP-519 yield/resume | Final；Created 2023-11-17；2.11 修复，2.13 加 `_with_id` | “Examples include a smart contract (`S`) that provides the MPC signing capability” [24] | observed |
| Chain Signatures 智能钱包、企业 onboarding 退款滥用 | NEP-591 Global Contracts | 2.6.0 实现 | “With the advent of chain signatures, the smart contract wallet use case will become more ubiquitous … susceptible to refund abuse” [26] | observed |
| Near Intents passkey、TEE attestation | NEP-635 P-256 host function | NEP 文件头为 Draft；CHANGELOG（2.10–unreleased）中没有找到 | “Near Intents relies on passkeys (WebAuthn), which use P-256 … ~46 Tgas … ~0.45 Tgas” [29] | observed（动机）/ 未上线 |
| MPC 签名请求、confidential swap 授权、钱包合约 | NEP-641 Offchain Authorizations（合约标准） | Final，2026-06-02 至 08-11 | “authorizing an MPC signing request, a confidential swap intent” [31] | observed |
| Sweat、KaiChing 负载 | 节点 prefetcher（非协议） | 1.39.0 | “improvements to the `sweat` contract prefetcher … new prefetcher logic for `kaiching` contract” [32] | observed |
| 2023-12-01 NEAT 铭文（1,394 万 tx/日） | NEP-539 跨分片拥塞控制（2024-03-21 创建，2.0.0 上线） | 2.0.0 | NEP 动机只写 “receipts accumulate without limits”，没有点名事件 [25]；本地拥塞限制 1.36 已有 [32] | speculative（只有时间先后） |
| SPICE（异步执行） | NEP-611 Gas Keys + Pending Tx Queue | 2.13.0 稳定（v85/86）；NEP 文件头仍为 Draft | “via the SPICE project, transaction and receipt execution will become decoupled … potential for DoS” [27] | observed：infra 驱动 |
| 规模增长 | NEP-639 动态分片 | 2.13.0 稳定 | “V3 still requires the NEAR developer team to manually analyze shard utilization … cannot react to sudden changes in demand” [30] | observed：infra 驱动 |

**反例 / 叙事转向而产品没起来**
- BOS（2023）：near.org 官方的《History of NEAR》完全没有提到 BOS（叙事上被淡化，inferred）[21]。GPT 引用的 near.foundation BOS 链接现在返回 404。
- Shade Agents：2026-04-19 之后不再维护 [37]。
- Sweat：2026-12-30 结束 [18]。
- NEAR DA：2023-11-08 发布时列出 Madara、Caldera 等首批用户 [43]，但没有找到当前采用数据（open）。
- Aurora（EVM）：链 TVL 只有约 446 万美元 [1]。
- DelegateV2：2.13.0 引入，2.14.0 移除，原因是它和 SPICE 的 pending 队列不兼容 [32]。说明协议路线在为 SPICE 让路时，会撤回刚上线的接口。

## Q5 运营方式

**答案**：Intents 靠第三方渠道分发，并给渠道经济激励：默认 50/50 分成，有定制条款，2026-02-23 起自动和渠道分成。协议自己拿到的收入从 2026-02-23 起用于在公开市场回购 NEAR。组织上可以确认的分工如下（其余不写）：

- **Defuse Labs**：Intents 背后的团队，CEO Alex Shevchenko（Brave 公告引语）[19]。
- **Near One**：协议工程。Near One 博客发布 1M TPS、SPICE、CKD 等文章 [35]；NEP-591/611/635 作者使用 @nearone.org 邮箱 [26][27][29]。
- **NEAR AI**：near.ai 发布 AI Cloud 和 IronClaw [36]。
- **HOT**：HOT Bridge 的文档在 docs.hotdao.ai [17]。
- **Sweat**：Sweat Foundation Ltd 负责 Sweat Wallet 和 SWEAT，与 Sweatco Ltd（Sweatcoin app）是两家公司 [18]。

**依据**
- 费率与分成规则见 [13][14]。
- 2026-02-23 的分成机制：@near_intents 在 X 上写道 “On February 23, 2026, NEAR Intents will activate an automatic default revenue-sharing mechanism with third-party distribution channels”（检索片段）[39]。
- 回购：DefiLlama 方法论 [3]，以及 revenue.near.org 上的回购钱包 [12]。
- 渠道公告：
  - Brave：Wallet v1.88 集成，“first swap provider that ties together nearly all of our supported blockchains”；Brave 自报 110M MAU，但这个数字不能折算成 Intents 用户 [19]。
  - Ledger：通过 SwapKit 接入，“available as a swap provider via Swapkit in Ledger Wallet” [20]。
- Explorer 中 SwapKit 和 Ledger 的 affiliate 账户分开记录，分别是 `swapkit.near` 和 `ledgerswapkit.near` [11]。

---

## 图的素材

**A. 时间线（日期 | 事件 | 类型 | 来源）**
- 2017 | Polosukhin 和 Skidanov 创立 NEAR AI，目标是“build AI models that could write code from natural language” | 叙事/起源 | [21]
- 2018 | 因跨境付款问题转做区块链，创立 NEAR Protocol | 叙事/起源 | [21]
- 2020-10-13 | 主网 Phase II：验证者投票解除转账限制 | infra | 新闻稿转述 [46]；genesis 日期本次没有核实
- 2021 | 生态账户数达到 100 万；Rainbow Bridge、Aurora 上线（官方页面没有给具体日期） | 产品/infra | [21]
- 2023（1.32.0） | Meta tx（NEP-366）和零余额账户（NEP-448）稳定 | infra（由 onboarding 产品驱动） | [22][23][32]
- 2023 | BOS 推出（确切日期没有一手核实） | 叙事 | [45]
- 2023 | 提出 “Chain Abstraction” | 叙事 | [21]
- 2023-11-08 | NEAR DA 发布（NEARCON） | 产品 | [43]
- 2023-12-01 | NEAT 铭文：13,935,402 tx/日，gas 费 17.3 万美元 | 事件 | [6][9]
- 2024（1.39.0） | Sweat/KaiChing prefetcher | infra（由产品驱动） | [32]
- 2024-05 | NEAR Foundation 宣布聚焦 User-owned AI | 叙事 | [21]
- 2024-06 | 日活账户高峰约 224 万（06-14） | 事件 | [9]
- 2024-08（nearcore 2.0.0） | Stateless validation（NEP-509）和拥塞控制（NEP-539）上线，即 Nightshade 2.0 | infra | [32]；日期 08-22 来自 The Defiant（二手）[47]
- 2024-08 | Chain Signatures 主网 | 产品/infra | near.org 博客 “Since the mainnet launch of Chain Signatures in August 2024”（检索片段）[41]
- 2024-11 | NEAR Intents（beta），“built on top of Chain Signatures”；NEAR AI 研究部门成立 | 产品/叙事 | [21]；DefiLlama 数据从 2024-12-10 开始 [5]
- 2.5.0 / 2.6.0（2025） | Resharding V3、带宽调度器；Global contracts（NEP-591）、Optimistic Block | infra | [32]
- 2025-05-01 → 05-15 | 日出块数从 73,583 升到 138,149，即约 1.2 s → 约 0.6 s 出块 | infra | [9]；near.org 博客《Blink and It's Final》[42]
- 2025-10-21 | 2.9.0 通胀率从 5% 降到 2.5% | infra/经济 | [32][35]
- 2025-12-11 | 1M TPS 基准测试 | infra/叙事 | [35]
- 2026-02-23 | Intents 渠道分成机制启动；收入用于回购 NEAR | 运营 | [3][39]
- 2026-02-23 | CKD（MPC 网络的机密密钥派生）设计文章 | infra | [35]
- 2026-02-25/26 | Confidential Intents 上线（二手日期） | 产品 | [42]
- 2026-03（v1.88） | Brave Wallet 集成 NEAR Intents（日期 03-11 来自二手） | 分发 | [19]
- 2026-04 | Sweat 安全事件（Sweat 公告提及） | 事件 | [18]
- 2026-04-19 | Shade Agent Framework 停止维护 | 产品（反例） | [37]
- 2026-05-14 | NEAR AI 私有 USDC agent 支付 | 产品 | [36]
- 2026-07-20 | 2.13.0 开始投票，协议版本 84→86：gas keys、动态分片、ML-DSA-65 后量子签名 | infra | [32][33][34]
- 2026-07-27 | IronClaw 1.0 | 产品 | [36]
- 2026-09-30 | SPICE Part 1 博客；代码中 `Spice => 180` 仍只在 nightly 之外的特性分支 | 计划 | [33][35]
- 2026-10-01 | Sweat 宣布 Wallet/SWEAT 于 12-30 结束 | 反例 | [18]
- 2026-10-01 → 10-02 | Intents 发生约 380 万美元事件，资金次日返还 | 事件 | [38][40]
- 2.14.0-rc（未上主网） | 取消 30% 开发者 gas 返还、ML-DSA host function、移除 DelegateV2 | 计划 | [32][34]

**B. 价值流（Intents 一笔 swap 的费用去向）**：用户支付 = 协议费 1 pip + 1Click 费（20 bps、1 bp 或 25 bps）+ 渠道 appFee（与 1Click 50/50 分）[13][14] → 进入 `fefundsadmin` / `1csfundsadmin` / `buybacks.multisignature.near` [12] → 从 2026-02-23 起回购 NEAR [3]；渠道和 solver 拿走的部分记为 SupplySideRevenue [3]。

**C. 对比维度（30 天，2026-10-07 抓取）**：Intents fees 738 万美元 [3]，对比 L1 gas 费 14.1 万美元 [6]，前者约为后者的 52 倍；Rhea Dex fees 89 万美元 [8]，Rhea Lend fees 18 万美元 [8]。

**D. 指标口径对照**：
- 活跃账户：nearblocks（账户，不是人）[9]
- Intents volume：DefiLlama 44.1 亿美元，对比 explorer 32.6 亿美元 [5][11]
- fees：DefiLlama 全部 5,273 万美元，对比 revenue.near.org 5,342 万美元 [3][12]
- Brave 110M MAU 是渠道触达量，不是 Intents 用户 [19]

## 代码素材

`near/nearcore core/primitives-core/src/version.rs#L159-L201@090da3191758c75787ce14569528bf0e9d71246c`（节选，中间省略）：说明哪些特性已稳定、哪些仍是计划。注意 L243 的 `STABLE_PROTOCOL_VERSION = 88` 是 master 分支的值；主网仍在 2.13.x，2.14 只有 RC [34]。
```rust
match self {
    // Stable features
    ProtocolFeature::FixDelegateActionDepositWithFunctionCallError
    | ...
    | ProtocolFeature::GasKeys
    | ProtocolFeature::ContinuousEpochSync
    | ProtocolFeature::DynamicResharding
    | ...
    | ProtocolFeature::PostQuantumSignatures
    | ...
    | ProtocolFeature::DelegateV2 => 85,
    ...
    ProtocolFeature::RemoveGasRewards => 87,
    ...
    // Nightly features:
    ...
    ProtocolFeature::Spice => 180,
```

## 来源
1. **PRIMARY**（面板）DefiLlama `https://api.llama.fi/v2/chains`：给出 Near TVL 230.7M、Aurora TVL 4.46M。访问 2026-10-07。
2. **PRIMARY**（面板）DefiLlama `/overview/dexs/near`：给出链 DEX 24h/30d 汇总和各协议拆分（Intents 属 Bridge 类）。访问 2026-10-07。
3. **PRIMARY**（面板）DefiLlama `/summary/fees/near-intents?dataType=dailyFees`：给出 Intents fees 数字，以及 Fees/Revenue/回购的方法论定义。访问 2026-10-07。
4. **PRIMARY**（面板）DefiLlama `/summary/fees/near-intents?dataType=dailyRevenue`：给出 Intents revenue（30 天 1.93M，累计 7.51M）。访问 2026-10-07。
5. **PRIMARY**（面板）DefiLlama `/summary/dexs/near-intents`：给出 Intents volume（30 天 4.41B，累计 32.35B，最早数据点 2024-12-10）。访问 2026-10-07。
6. **PRIMARY**（面板）DefiLlama `/summary/fees/near`：给出 L1 gas 费（24h 5,020 美元，30 天 140,867 美元，1y 1.24M），以及 2023-12-01 的尖峰。访问 2026-10-07。
7. **PRIMARY**（面板）DefiLlama `/tvl/rhea-lend|rhea-dex|meta-pool-near|linear-protocol`：给出各协议当前 TVL。访问 2026-10-07。
8. **PRIMARY**（面板）DefiLlama `/summary/fees/rhea-lend|rhea-dex`：给出 RHEA fees/revenue、前名，以及 2026-04/05 的 0 值区间。访问 2026-10-07。
9. **PRIMARY**（链上索引）nearblocks `https://api.nearblocks.io/v1/charts`（及 `/latest`）：给出 2020-07 至 2026-10-06 的日级 txns、活跃账户、新建账户、合约数、块数。访问 2026-10-07。
10. **PRIMARY**（链上索引）nearblocks `/v1/stats`：给出平均出块时间 0.594 s 和累计交易数。访问 2026-10-07。
11. **PRIMARY** NEAR Intents Explorer `https://explorer.near-intents.org/`：给出官方 volume，以及 24h referral/affiliate 拆分（含回购钱包）。访问 2026-10-07。
12. **PRIMARY** revenue.near.org：给出累计 fees 53.42M、收入钱包占比、Top Interfaces、33 条链。访问 2026-10-07。
13. **PRIMARY** docs.near-intents.org `/resources/fees.md`：给出协议费 1 pip、前端费 0.2%、1Click 费率表、quote improvement 分成。访问 2026-10-07。
14. **PRIMARY** docs.near-intents.org `/integration/distribution-channels/1click-api/fee-config.md`：给出 appFees 的 50/50 分成、20 bps 下限、500 bps 上限。访问 2026-10-07。
15. **PRIMARY** docs.near-intents.org `/resources/chain-support.md`：列出 32 条支持链和签名标准。访问 2026-10-07。
16. **PRIMARY** 1Click API `https://1click.chaindefuser.com/v0/tokens`：asset 列表（约 200 条以上），包括 `omft`、`omdep`、`v2_1.omni.hot.tg` 等资产前缀。访问 2026-10-07。
17. **PRIMARY** docs.near-intents.org `/integration/bridging/overview.md`：Omni、POA、HOT 三个桥及各自覆盖的链；HOT 文档链接到 hotdao.ai。访问 2026-10-07。
18. **PRIMARY** Sweat Foundation `https://update.swe.at/`（2026-10-01）：Sweat Wallet/SWEAT 于 12-30 结束及原因；账户即 NEAR 账户；EVM 余额依赖 Chain Signatures；验证节点 10-31 停止。访问 2026-10-07。（help.sweatco.in 返回 403，没有读到原文。）
19. **PRIMARY** Brave `https://brave.com/blog/near-intents/`：Wallet v1.88 集成；当时 Intents 19M swaps、14B 美元、35 条链；Defuse Labs CEO 引语；Brave 110M MAU。访问 2026-10-07（页面没有日期，03-11 来自二手）。
20. **PRIMARY** Ledger `https://www.ledger.com/blog-near-intents-joins-ledger-wallet-via-swapkit`：Ledger Wallet 通过 SwapKit 接入 Intents。访问 2026-10-07（页面没有日期）。
21. **PRIMARY** near.org《History of NEAR》`https://www.near.org/roadmap-history`：官方给出的起源（2017/2018）、2021 年 100 万账户、2023 Chain Abstraction 和 NEAR DA、2024-05 User-owned AI、2024-11 Intents beta 和 NEAR AI、2026 重点方向。访问 2026-10-07。
22. **PRIMARY** NEPs/neps/nep-0366.md@dcc0bcb：meta tx 的动机点名 Sweatcoin、NEARCrowd、Aurora Plus。
23. **PRIMARY** NEPs/neps/nep-0448.md@dcc0bcb：零余额账户的动机是应用代用户建户。
24. **PRIMARY** NEPs/neps/nep-0519.md@dcc0bcb：yield/resume 的动机以 MPC 签名合约为例；Created 2023-11-17。
25. **PRIMARY** NEPs/neps/nep-0539.md@dcc0bcb：拥塞控制的动机是通用描述（receipts 无界累积），没有点名事件。
26. **PRIMARY** NEPs/neps/nep-0591.md@dcc0bcb：global contracts 的动机是 Chain Signatures 智能钱包和企业 onboarding 退款滥用；作者为 @nearone.org。
27. **PRIMARY** NEPs/neps/nep-0611.md@dcc0bcb：gas keys 的动机是 SPICE 异步执行下的 DoS；文件头状态为 Draft（README 表格写的是 Final）。
28. **PRIMARY** NEPs/neps/nep-0616.md@dcc0bcb：确定性 AccountId，用于“sharded contract designs”（infra 推动 infra）。
29. **PRIMARY** NEPs/neps/nep-0635.md@dcc0bcb：P-256 的动机是 Intents passkey 和 TEE attestation；状态 Draft。
30. **PRIMARY** NEPs/neps/nep-0639.md@dcc0bcb：动态分片的动机是人工 resharding 太慢；状态 Draft。
31. **PRIMARY** NEPs/neps/nep-0641.md@dcc0bcb：链下授权标准，目标场景包括 MPC 签名请求和 confidential swap intent。
32. **PRIMARY** nearcore/CHANGELOG.md@090da31：各版本协议改动，包括 1.32 meta tx、1.39 sweat/kaiching prefetcher、2.0 SV+CC、2.6 global contracts、2.13 gas keys/动态分片/ML-DSA、2.14 移除 gas 返还和 DelegateV2。
33. **PRIMARY** nearcore/core/primitives-core/src/version.rs@090da31：特性对应的协议版本（GasKeys=85，Spice=180 nightly 外）。
34. **PRIMARY** GitHub nearcore releases `https://github.com/near/nearcore/releases`：2.13.0/2.13.1 的 v86 投票时间为 “Monday July 20th 00:00 UTC”；2.14.0 只有 RC。访问 2026-10-07。
35. **PRIMARY** blog.nearone.org 首页：Near One 文章及日期（1M TPS 2025-12-11、CKD 2026-02-23、SPICE 2026-09-30、2.9.0 减半 2025-10-21）。访问 2026-10-07。
36. **PRIMARY** near.ai/blog 首页：NEAR AI 发布时间线（IronClaw 1.0 2026-07-27、USDC 支付 2026-05-14、OpenRouter 2026-09-28），没有用量数字。访问 2026-10-07。
37. **PRIMARY** docs.near.org `/ai/shade-agents/introduction`：“After April 19th, 2026 … no longer maintained”。访问 2026-10-07。
38. **PRIMARY**（检索片段）@near_intents X `status/2106095140586791407`：“The funds from the $3.8M NEAR Intents exploit have been returned, just one day later”。经 DuckDuckGo 片段获得，2026-10-07；没有直接打开原帖。
39. **PRIMARY**（检索片段）@near_intents X `status/2023776935546093632`：2026-02-23 启动渠道自动分成。经检索片段获得，2026-10-07。
40. CoinDesk 2026-10-01（二手）：Intents 约 380 万美元事件、暂停服务、次日资金返还（转述团队说法）。访问 2026-10-07（检索片段）。
41. near.org 博客《Chain Signatures Mainnet Launches》及《Advancing Chain Signatures》（页面由 JS 渲染，只拿到检索片段）：“Since the mainnet launch of Chain Signatures in August 2024”。2026-10-07。
42. near.org 博客《Blink and It's Final … 600ms Blocks》《Confidential Intents》（JS 渲染，只有标题和片段）；Confidential Intents 的上线日期来自二手（laikalabs/nearstats，02-25/26）。2026-10-07。
43. NEAR Foundation 新闻稿（PR Newswire，2023-11-08）：NEAR DA 发布及首批用户。检索片段，2026-10-07。
44. Cryptobriefing（二手）：HOT Wallet “over 30 million users”，属于自述性质的转述，未经审计。2026-10-07。
45. near.org 博客《Near Announces the Blockchain Operating System》（只有标题）；GPT 引用的 near.foundation BOS 链接现在是 404。2026-10-07。
46. itbusinessnet / cryptoninjas 转载的新闻稿（二手）：Phase II 投票于 2020-10-13 完成。2026-10-07。
47. The Defiant（二手）：Nightshade 2.0 于 2024-08-22 上主网。2026-10-07。
48. 外部调研 research/near-deep-dive.md §七、§八（ChatGPT Deep Research，只当线索）。

## 外部调研中被修正或无法核实的地方
- “NEAR 活跃地址 24h 124,809 / 交易数 909,765”：数字准确，但来源是 nearblocks 2026-10-06 这一天 [9]，不是 GPT 所说的 DefiLlama 页面。另外这是自然日数据，不是滚动 24h。
- “NEAR 链内 DEX 交易额 24h 约 1,788 万美元”：这个量级对应的是 Rhea Dex 单个协议（本次 24h 为 1,861 万美元）[2]。DefiLlama 的 NEAR DEX 汇总是 1.38 亿美元，因为它把 Intents（Bridge 类）也算进去了。所以“链内 DEX”的口径需要明确写出。
- “NEAR DeFi TVL 约 2.37 亿”：本次抓到的是 2.307 亿 [1]，差异属于时间漂移。
- Intents 的 30 天 volume、fees、revenue（44.15 亿 / 738 万 / 193 万）与 DefiLlama 一致 [3][4][5]。Explorer 30 天 32.64 亿也一致 [11]。GPT 没有指出 explorer 上最大的 affiliate 是 NEAR 自己的回购钱包 `buybacks.multisignature.near`，它会抬高 volume [11]。
- “SwapKit 8,879 笔 / 1,556 万”：本次为 8,845 / 1,528 万，属于快照漂移。另外 GPT 把 Ledger/SwapKit 写成 referral，实际在 affiliates 表里（`ledgerswapkit.near`）[11]。
- “旧费用总览与新配置页面存在差异”：截至 2026-10-07，fees.md 和 fee-config.md 的费率一致（20 bps、1 bp、25 bps、50/50）[13][14]，这一说法已过时。
- §8.1 把 gas keys 列为“具体工作负载导向”的例子：NEP-611 的动机原文是 SPICE 异步执行带来的 DoS 问题 [27]，应改为 infra 驱动。另外 2.14.0 已移除让 gas key 签 meta tx 的 DelegateV2 [32]。
- “动态分片 2026-07-20 上线”：与 2.13.0 的 v86 投票开始时间（07-20 00:00 UTC）一致 [34]。准确说法是 07-20 开始投票，按 release note 升级预计在投票 epoch 结束后 7–14 小时生效。PR Newswire 来源本次没有复核。
- “2.13.4 为最新稳定版、2.14.0-rc 为预发布”：与 releases 页一致 [34]。
- BOS 的 near.foundation 链接已 404 [45]；BOS 上线日期本次没有一手核实。
- 2026-10-01 事件：GPT 写的是“Omni 入金/出金基础设施与 Intents 合约交互缺陷”，这与新闻转述一致 [40]。但二手报道称资金是从 BNB Chain 上的 HOT Bridge treasury 流出的。这里的 “Omni” 指 NEAR 的 Omni Bridge 还是 HOT 的 HOT/Omni 协议，没有一手复盘可以确认（见开放问题）。
- HOT 部分：GPT 引用的 hot-labs.org 博客本次没有核实；能找到的用户数（3,000 万）只有二手和自述来源 [44]。
- Sweat 部分：与 update.swe.at 一致 [18]。可以补充的一点：Sweat Wallet 的外链余额依赖 Chain Signatures。

## 开放问题
1. DefiLlama 30 天 Intents volume 比 explorer 高约 35%，累计只高约 4.6%。差异是来自回购 swap、口径不同（双边计量？）还是数据回填？需要读 dimension-adapters 的 near-intents 适配器源码来对账。
2. 2026-04-01 到 04-15 之间链上活动断崖：txns 下降约 80%，active_contracts 从 219 万降到 9.5 万，日新建账户从约 13.7 万降到约 1.9 万。这与 Sweat 2026-04 的安全事件、Rhea Lend fees 2026-04-20 到 05-11 为 0 是否相关？是哪个应用停止了每日批量建户？
3. 2024 年日活 100–200 万账户的应用构成：HOT、Sweat、KAIKAI 各占多少？需要按合约拆分的面板（nearblocks、pikespeak、Dune）。
4. Intents 的唯一用户、地址数（Dune near/near-intents）和留存，本次没有获取。
5. Confidential Intents 占 Intents 交易量多少？NEAR AI Cloud 有没有公开的请求量或收入？
6. 主网当前协议版本是 86 还是更高？2.13.x 之后有没有再升级（2.14 只有 RC）？
7. 2026-10-01 事件中的 “Omni” 具体指哪个组件？官方有没有技术复盘？
8. NEAR DA 当前有没有生产 rollup 在用？BOS（near.org gateway）的下线时间是什么时候？
9. 主网 genesis（2020-04？）、BOS、Chain Signatures 主网的确切日期（二手称 08-08）、600 ms 官方公告的确切日期：near.org 博客由 JS 渲染，本次没有取到发布日期。

## 台账
| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| E1 | 2026-10-06 NEAR 链交易数 909,765，活跃账户 124,809，新建账户 8,773 | [9] nearblocks /v1/charts 2026-10-06 行 | observed | |
| E2 | 2026-10 主网平均出块时间约 0.59 s | [10] avg_block_time 0.5941；[9] 2026-10-06 blocks 146,811 | observed | |
| E3 | 约 600 ms 出块在 2025-05-01 到 05-15 之间上线 | 由 E2 同源 [9] 推出：日出块数从 73,583（05-01）升到 138,149（05-15），对应约 1.17 s → 约 0.63 s | inferred | |
| E4 | DefiLlama 口径下 NEAR 链 TVL 约 2.307 亿美元（2026-10-07） | [1] tvl 230,688,765 | observed | |
| E5 | DefiLlama 的 NEAR DEX 24h 汇总 1.383 亿美元中约 85% 是 NEAR Intents（Bridge 类） | 由 [2] 推出：117,176,998 / 138,277,666 ≈ 0.85 | inferred | |
| E6 | NEAR L1 gas 费 30 天约 14.09 万美元、1 年约 124 万美元 | [6] total30d 140,867；total1y 1,243,718 | observed | |
| E7 | DefiLlama 链 fees 方法论为 70% 销毁、30% 给合约开发者；2.14.0 将取消 30% 返还，但还没有上主网 | [6] methodology；[32] 2.14.0 RemoveGasRewards；[34] 2.14 只有 RC | observed | |
| E8 | NEAR Intents 30 天 volume 44.15 亿美元，累计 323.5 亿美元（DefiLlama） | [5] total30d 4,414,741,164；totalAllTime 32,345,345,299 | observed | |
| E9 | NEAR Intents 30 天 fees 738.4 万美元，revenue 192.6 万美元 | [3] total30d 7,384,225；[4] total30d 1,926,082 | observed | |
| E10 | Intents 30 天综合费率约 16.7 bps，协议留存约占 fees 的 26% | 由 E8、E9 推出：7.384M / 4,414.7M ≈ 16.7 bps；1.926M / 7.384M ≈ 26% | inferred | |
| E11 | 官方 explorer 显示 Intents 30 天 volume 32.64 亿美元、累计 309.2 亿美元，比 DefiLlama 低约 35% / 4.6% | [11] 30D 3,264,206,005；All time 30,924,902,331；与 [5] 对比 | observed | |
| E12 | Intents 30 天 fees 约为 NEAR L1 gas 费的 52 倍 | 由 E6、E9 推出：7,384,225 / 140,867 ≈ 52 | inferred | |
| E13 | Explorer 24h 最大 referral 是 SwapKit（8,845 笔 / 1,528 万美元），其次是 Rango、ZODL、stableflow、LI.FI | [11] 24h Largest Volume Referrals | observed | |
| E14 | Explorer 24h 最大 affiliate 是 NEAR 回购钱包 `buybacks.multisignature.near`（5,194 笔 / 1,274 万美元，约占 24h 总量 13.6%） | [11] Affiliates 表；12.74M / 93.98M | observed | |
| E15 | Ledger 通过 SwapKit 接入 Intents，在 explorer 中记为 `ledgerswapkit.near` affiliate | [20] Ledger 博客；[11] affiliate 表 | observed | |
| E16 | Brave Wallet 在 v1.88 集成 NEAR Intents | [19] “in our latest browser release (v1.88)” | observed | |
| E17 | Brave 的 110M MAU 是渠道触达量，不能当作 Intents 用户数 | 由 [19]（Brave 自报 MAU）和 [11]（explorer 没有用户口径）推出：两个数字的口径不同 | inferred | |
| E18 | Intents 协议费 1 pip；near-intents.org 前端费 0.2%，进入 `fefundsadmin.sputnik-dao.near` | [13] fees.md | observed | |
| E19 | 1Click 有 API key 且不带 appFees 时收 20 bps（稳定币对、同资产跨链为 1 bp）；没有 key 时加 25 bps；带 appFees 时 50/50 分成，1Click 一半最低 20 bps | [13][14] | observed | |
| E20 | 自 2026-02-23 起，Intents 协议收入用于在公开市场回购 NEAR（不销毁） | [3] HoldersRevenue 方法论 | observed | |
| E21 | 2026-02-23 Intents 启动对第三方分发渠道的自动默认分成 | [39] @near_intents X（检索片段） | observed | |
| E22 | revenue.near.org 显示累计 fees 5,342 万美元；三个收入钱包按 NEAR 计的占比为 48.8% / 36.6% / 14.7% | [12] | observed | |
| E23 | Intents docs 列出 32 条支持链，revenue.near.org 写 33 条，Brave 公告写 35 条 | [15][12][19] | observed | |
| E24 | 1Click tokens 接口返回约 200 个以上 asset 条目 | [16] 按 "assetId" 计数约 204（计数工具可能截断） | observed | |
| E25 | Rhea Lend TVL 约 1.96 亿美元，Rhea Dex 约 3,138 万美元 | [7] rhea-lend 195,933,103；rhea-dex 31,380,974 | observed | |
| E26 | Meta Pool（NEAR）TVL 约 1.21 亿美元，LiNEAR 约 1.19 亿美元 | [7] meta-pool-near 120,896,041；linear-protocol 119,203,259 | observed | |
| E27 | 各协议 TVL 之和超过链 TVL，存在重复计算，不能相加 | 由 E4、E25、E26 推出：1.96 + 0.31 + 1.21 + 1.19 ≈ 4.67 亿 > 2.31 亿 | inferred | |
| E28 | Rhea Lend 30 天 fees 18.2 万美元、revenue 4.56 万美元；Rhea Dex 30 天 fees 89.1 万美元 | [8] | observed | |
| E29 | Rhea Lend 日 fees 从 2025 年中约 1.8–2.5 万美元降到 2026-10 的约 0.5–0.8 万美元 | [8] totalDataChart（2025-06 约 18–28k，2026-10 约 5–8k） | observed | |
| E30 | Aurora 链 TVL 只有约 446 万美元 | [1] Aurora tvl 4,461,290 | observed | |
| E31 | 2024-06-14 NEAR 日活账户约 224 万，日交易约 719 万 | [9] | observed | |
| E32 | 2026-04-01 到 04-15 链上活动断崖：txns 从 3.76M 降到 0.76M，active_contracts 从 219 万降到 9.5 万 | [9] 对应日期行 | observed | |
| E33 | E32 的断崖与 Sweat 2026-04 安全事件或某个批量建户应用停止有关 | 由 [9]（断崖时间）、[18]（2026-04 安全事件）、[8]（Rhea Lend 04-20 到 05-11 fees 为 0）在时间上的重合推出，没有一手归因 | speculative | |
| E34 | 2023-12-01 NEAT 铭文让单日交易达到 13,935,402 笔，gas 费约 17.3 万美元，是历史最高 | [9] txns 13935402、txn_fee_usd 173,070；[6] 173,071 | observed | |
| E35 | Sweat Wallet 和当前形态的 SWEAT 将于 2026-12-30 结束；原因包括经济模型不可持续、下架、2026-04 安全事件成本、增长放缓 | [18] | observed | |
| E36 | Sweat Wallet 账户都是 NEAR 账户，其 EVM 余额依赖 NEAR Chain Signatures | [18] “Every Sweat Wallet account is a NEAR account”；“accessible for as long as NEAR Chain Signatures operate” | observed | |
| E37 | nearcore 1.39.0 专门为 Sweat 和 KaiChing 合约优化了 prefetcher | [32] 1.39.0 Non-protocol Changes | observed | |
| E38 | HOT Wallet 用户数超过 3,000 万 | [44] 二手转述，属于自述，未经审计 | speculative | |
| E39 | NEAR AI 和 Confidential Intents 没有公开的用量数据（截至 2026-10-07） | [36] 博客首页没有指标；[11] explorer 不拆分 confidential | observed | |
| E40 | NEP-366 meta tx 的动机点名 Sweatcoin、NEARCrowd、Aurora Plus；1.32.0 稳定 | [22] Motivation；[32] 1.32.0 | observed | |
| E41 | NEP-519 yield/resume 的动机以 MPC 签名合约（即 Chain Signatures 的需求）为例 | [24] Motivation | observed | |
| E42 | NEP-591 global contracts 的动机是 Chain Signatures 智能钱包和企业 onboarding 退款滥用；2.6.0 实现 | [26] Motivation；[32] 2.6.0 | observed | |
| E43 | NEP-635 P-256 的动机是 Near Intents passkey 和 TEE attestation，但它仍是 Draft，CHANGELOG 中没有上线记录 | [29] 文件头与 Motivation；[32] 2.10–unreleased 中没有 p256 | observed | |
| E44 | NEP-641 链下授权标准的目标场景包括 MPC 签名请求和 confidential swap intent | [31] Target use cases | observed | |
| E45 | gas keys（NEP-611）的动机是 SPICE 异步执行下的 DoS，不是某个产品 | [27] Summary/Motivation | observed | |
| E46 | gas keys、动态分片、ML-DSA-65 随 2.13.0（v86）上主网，投票从 2026-07-20 开始 | [32] 2.13.0；[33] GasKeys/DynamicResharding/PostQuantumSignatures => 85；[34] 投票时间 | observed | |
| E47 | 拥塞控制（NEP-539）是由 2023-12 铭文拥塞触发的 | 只有时间先后：[9]（2023-12 尖峰）、[25]（2024-03-21 创建，动机没有点名事件） | speculative | |
| E48 | SPICE 仍是计划，还没有进入主网稳定特性 | [33] Spice => 180（nightly 之外）；[35] 2026-09-30 只是 Part 1 介绍 | observed | |
| E49 | DelegateV2 在 2.13.0 引入，2.14.0 因与 SPICE pending 队列冲突而移除 | [32] 2.13.0 与 2.14.0 条目 | observed | |
| E50 | Shade Agent Framework 在 2026-04-19 之后不再维护 | [37] | observed | |
| E51 | 官方《History of NEAR》没有提及 BOS，说明 BOS 叙事已被淡化 | 由 [21]（全文没有 BOS）和 [45]（GPT 的 BOS 链接 404）推出 | inferred | |
| E52 | NEAR 起源于 2017 年的 NEAR AI（程序合成），2018 年转向区块链 | [21] | observed | |
| E53 | NEAR Intents 于 2024-11 以 beta 推出，官方称其建在 Chain Signatures 之上；DefiLlama 数据从 2024-12-10 开始 | [21]；[5] 最早数据点 | observed | |
| E54 | Chain Signatures 于 2024-08 上主网 | [41] near.org 博客检索片段 “Since the mainnet launch … in August 2024” | observed | |
| E55 | Stateless validation 和拥塞控制随 nearcore 2.0.0 上线（Nightshade 2.0，二手称 2024-08-22） | [32] 2.0.0；[47] 二手日期 | observed | |
| E56 | IronClaw 1.0 于 2026-07-27 发布，私有 USDC agent 支付于 2026-05-14 发布 | [36] | observed | |
| E57 | Defuse Labs 是 NEAR Intents 背后的团队 | [19] Brave 公告中 “CEO of the team behind NEAR Intents, Defuse Labs” | observed | |
| E58 | 2026-10-01 Intents 约 380 万美元事件，资金次日返还 | [38] @near_intents X（检索片段）；[40] CoinDesk（转述） | observed | |
| E59 | 2026-10-01 事件涉及的 “Omni” 组件是 HOT Bridge（BNB 上的 treasury） | 只有二手报道称 USDT 从 HOT Bridge treasury 流出，没有一手复盘 | speculative | |
| E60 | 2023 年 NEAR 提出 “Chain Abstraction” 叙事 | [21] near.org《History of NEAR》（notes-ecosystem 图的素材 A） | observed | |
| E61 | 2024-05 NEAR Foundation 宣布聚焦 User-owned AI | [21] near.org《History of NEAR》（notes-ecosystem 图的素材 A） | observed | |

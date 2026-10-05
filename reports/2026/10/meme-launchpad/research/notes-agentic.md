# Lane：Agentic meme launchpad（对照物 + 用户方案 + 设计取舍）

> 研究问题：市面上的 agentic 发币和交易产品（Clanker、Bankr、Virtuals、ElizaOS/ai16z/daos.fun）各自把身份、权限和资金放在哪一层？用户方案（product.md）为什么让 agent 当第一公民、“发币零门槛、交易硬限权”？它对 Mantle 链有哪些要求？与调研报告冲突的地方怎么并列？
> 一句话答案：对照物里只有 Bankr 真让 agent 既发币又交易，但它的权限是**托管钱包加服务端策略**，其余几家要么不让 agent 碰钱（Clanker Droid），要么把根私钥放在环境变量里（ElizaOS）；用户方案的差异点是**链上可验证的 session 权限沙箱**（白名单、选择器、额度、时效、可撤销）加上“手续费养推理”。方案需要的 7702、4337 Paymaster 和 2D nonce 在 Mantle L2 上靠应用层 AA 基本都能起步，L3 只在热点外溢、失败扣费、开盘被垄断这三个条件被实测到时才值得开。
> 访问日期：本文全部网页来源都在 2026-10-05 访问。资料仓库为 `mantle-v3-roadmap @ b819a33`。

---

## 1. Agentic 对照物：谁是第一公民，权限放在哪

### 1.1 Clanker（发币工厂；Droid 是附赠的运营 agent）
**答案**：第一公民是人类创作者。Droid 有自己的 Farcaster 身份和 runtime 钱包，用 LP 费的一部分付推理费，但官方文档写明它“**not autonomous with your money**”。可以借鉴的是工厂、永久锁定 LP 和“费养推理”这条资金回路；不能照搬的是“agent 不许碰钱”和 Farcaster/Base 的硬门槛。

**依据**
- Droid 有独立的 Farcaster 账号。发帖（cast）需要人工点 Confirm，回复可以自主，钱包放在沙箱里，原文是“not autonomous with your money”[12]。
- 资金回路：LP 奖励中 paired-token 那一侧切出一部分（默认 1000 bps，可设 100–5000 bps）进 Droid 在 Base 上的 runtime 钱包，用 USDC 付推理费。runtime 少于 3 天时状态变为 “Needs attention”，余额用尽时报 `Insufficient USDC runway`。Droid 被硬限在 Base 主网加 USDC 交易对上（API 返回 `Launch with Agent requires Base mainnet`）。奖励接收方可以改指向任意合约（Clanker v4/v5）[13]。
- 发币内核：固定供应量、单边流动性进 Uniswap v4、LP 永久锁定，没有曲线也没有毕业环节。部署者自付 gas，没有 session，agent 也不是链上账户 [R4 notes/01:36-54]（仓库资料，内核细节以 base-ecosystem.md 为准，本 lane 没有复核合约）。
- 2026-10 现状：2025-10 Farcaster 宣布收购 Clanker，协议收入用于回购 $CLANKER [14]。clanker.world 已经有 Robinhood Chain 的部署统计页，截至访问时累计约 14.4k 枚 [27]。

**不确定**：Partner API 部署是否代付 gas，文档没写 [R4 notes/01:§8]。

### 1.2 Bankr（最接近“agent 发币 + agent 交易”）
**答案**：第一公民是绑定在 Bankr 托管钱包上的 agent。文档原话：“This is how agents fund themselves”。有三个入口（自然语言/社交、CLI、REST），交易拆成慢的 Agent API（经过 LLM）和快的 Wallet API（不经过 LLM）。**权限是服务端的**：API key 分层，账户上还有日限额、单笔限额、收款人白名单、“arbitrary contract calls”开关，这些都在 Bankr 的广播关口强制执行，不是链上策略。

**依据**
- 发币：固定 100B 供应量，85% 进 Uniswap v4 池（Doppler），15% 按 1 年归属给创作者（30 天 cliff，可关闭）。上线即可交易。开盘 5 分钟内单钱包持仓上限 2% 总供应量，另有 **14 秒**的反狙击费衰减。池子的 swap fee 是 0.7%，其中 95% 给创作者，即成交额的 0.665%；全部费用合计成交额的 1.75%。fee 比例在发射时固定，可选 quote-only fees [8]。
- 配额：每个钱包滚动 24h 内 3 次计数尝试，每分钟最多 1 枚。能证明没有上链的失败会退还配额，模拟不占配额，但每 24h 最多 20 次模拟。同一 IP 每 24h 约 10 次成功部署。零售钱包可能被要求满 24h 并持有最低原生 ETH（运行时开关），纯邮箱登录要等 72h。资格检查失败返回 `TOKEN_LAUNCH_WALLET_TOO_NEW`、`TOKEN_LAUNCH_MIN_BALANCE_REQUIRED` 等机器可读码 [8]。
- 默认链：chat、social、API 默认 **Robinhood Chain**；CLI 和网页默认 **Base**。Base 上 3 次尝试都可以申请 gas 赞助；Robinhood Chain 和 Arbitrum 自付 ETH；Arc 用 USDC 付 gas，走 Bankr Launch v3（Uniswap v3 1% 档，LP 费 70/30）[8]。
- 交易：Wallet API 不经过 LLM、延迟低；Agent API 是 NL → LLM，慢。API key 可设 `readOnly`、`allowedIps`、`allowedRecipients`。`/wallet/sign` 禁止 `eth_signTransaction`，`/wallet/submit` 在启用收款人白名单时禁止裸交易（因为无法从 calldata 核验收款人）。写类端点合计约 10 次/分钟/IP [9]。
- 安全警告：泄露开启了 agent 权限的 API key，“risk losing all assets in that Bankr account” [10]。
- 账户级策略：默认日限额 $500/24h、单笔 $500、价格冲击保护 15%，“Enable arbitrary contract calls”默认**开启**；可设收款人白名单，新增条目有冷却期（默认 24h）。这些策略对 chat、agent、API 全部生效，只能通过 web（Privy）认证修改，API key 改不了 [11]。
- 可以借鉴：三个入口共用一套配额、“未上链退配额”、机器可读失败码、2% 开盘持仓上限、quote-only fees、发币 gas 赞助 [R2 report:58-68]。不能照搬：托管加服务端执行（策略在链外，要信任 Bankr）。

**不确定**：交易路径的 gas 是否由 Bankr 内部代付，Wallet API 概览没写 [9]。

### 1.3 Virtuals Protocol（agent 本身被做成可融资的标的）
**答案**：第一公民是“被代币化的 agent”，但发币动作仍由人类 founder 完成。可以借鉴的是费用分润、可选狙击税和 Fee Delegation；不能照搬的是“先有人格再有币”、强制 `$VIRTUAL` 计价和 42k 阈值。

**依据**
- 创建免费；Launch Radar 模块收 100 VIRTUAL，Capital Formation 和 SOL Launch 各收 10 VIRTUAL。上线即可交易，没有预售也没有白名单。可选反狙击税：从 99% 衰减到 1%，窗口可选 0s、60s、10min、98min，默认只作用于买方；收到的税用于回购，回购的币进团队钱包，3 个月 cliff 加 9 个月线性释放 [15]。
- 交易税 1%，70% 给创作者、30% 给 Treasury，创作者份额可以通过 Fee Delegation 改指向。曲线累计到 42,000 $VIRTUAL 时自动在 Uniswap V2 建池，LP 锁 10 年。毕业后有 14 天的 Hyperboost 奖励（2026-07-27 之后毕业的币自动适用）[15]。
- 发射方自付 gas；没有面向 agent 的 session 花费上限。ACP 是 agent 之间的商务托管层，不在 Launchpad 的热路径上 [R4 notes/01:70-109]。

### 1.4 ElizaOS / ai16z / daos.fun
**答案**：ElizaOS 是 agent 运行时框架，私钥放在环境变量里，交易靠自然语言触发。ai16z 是“AI 基金”叙事下的代币实验，已经失败。daos.fun 已经停止维护、停止新的 DAO 发射。可以借鉴的是 plugin 边界和可选 TEE；不能照搬的是环境变量根私钥，以及“指望框架社区自己接发射台”。

**依据**
- plugin-evm 必填 `EVM_PRIVATE_KEY`，可选 `TEE_MODE` 加 `WALLET_SECRET_SALT`。转账、swap、桥接都由自然语言触发 [16]。
- CoinDesk（二手）：AI16Z 在 2025-01-02 市值达到峰值 $2.39B，后来改名迁移为 ELIZAOS；2026-08-04 创始人 Shaw Walters 宣布代币“dead”、基金会关闭；联邦集体诉讼指控项目把自己误导性地宣传成“自治 AI 基金”[19]。
- daos.fun 官网：“Daos.fun is no longer maintained…we stopped all DAO launches”，理由是创作者夹自己的交易、滥用 DAO 资金，团队认为这是协议层面的根本缺陷；已有曲线和池子在 Meteora 上继续可交易 [17]。DAO 有链上到期日，到期后按比例赎回 [18]。

### 1.5 横切结论
- 发币侧的 agent 入口已经有了（Bankr）；交易侧应走无 LLM 的结构化 API，NL 只能做次级入口 [8][9][R2 report:100-106]。
- 现有产品的权限要么托管在服务端（Bankr），要么是环境变量里的根私钥（Eliza），要么干脆不让 agent 动钱（Clanker）。**Bankr 已经有服务端限额**，所以 Mantle 方案的差异点应该准确表述为“策略在链上、可验证、不依赖托管方”，而不是“别人都没有限额”[11]。
- “手续费养推理”已经被 Clanker（Droid 默认 10%）、Bankr（0.665%）、Virtuals（1% 的 70%）三家同时验证 [13][8][15]。

---

## 2. 用户的产品方案（product.md 主线）

### 2.1 产品是什么
**答案**：方案提出做一个以 autonomous agent 为第一公民的发行平台和做市底座。核心协同链路是 Bybit AI（入口）↔ byreal（Uniswap v4 撮合）↔ Mantle（L2 执行与结算）；Quote 资产定为 mStocks [R1 product.md:3-5]。

### 2.2 为什么让 agent 当第一公民，为什么“发币零门槛、交易硬限权”
**答案**：方案的论证是：发币这件事输入高度收敛、状态分支少、边界风险小，适合交给 LLM；交易里有动态滑点、MEV、预言机跳价、流动性击穿这些高危 edge case，所以只能把 agent 关在白名单合约和风控框架里 [R1 product.md:12-16]。好处是 agent 能自我供血、并发交易、无需人工逐笔确认。新风险包括 prompt 注入、session key 泄露、零成本刷单和女巫攻击、机器社交互相抬注意力。

**依据和推理**
- 方案原文的定位原则：“发币零门槛，交易硬限权；把机器智能放进带有物理闸门的链上沙箱”[R1 product.md:16]。
- 风险对照：Bankr 官方承认 key 泄露等于丢光账户全部资产 [10]，ElizaOS 默认把私钥放环境变量 [16]，所以“爆破半径”是真实存在的问题。链上 session 只能把泄露损失限制在白名单、额度和时效之内，限制不了白名单内部的亏损交易（inferred）。
- “发币零门槛”会把成本转嫁给反女巫：Bankr 就需要配额、钱包年龄、IP 上限、余额门槛四层闸门 [8]。product.md 没有写配额，outline 写了“应用层发射限额，数值待决”[R3 outline:35]。

### 2.3 Session key 权限沙箱
**答案**：方案提出四层约束：①目标合约白名单（只能调 `LaunchpadFactory` 和 `byrealRouter`，禁止原生 `transfer` 和任意 ERC-20 调用）；②函数选择器白名单（`launch(name,symbol)`、`buyExactQuote`、`sellExactToken`、`claimFee`，禁止 `approve(arbitrary)`）；③额度（单笔、单区块、生命周期累计，以 quote 计）加滑点硬约束；④时效（比如 24h 自动失效）加 owner 一键链上 revoke [R1 product.md:20-30]。这些在现有标准里都有现成实现路径。

**依据**
- ERC-7579 把模块分成 Validator(1)、Executor(2)、Fallback(3)、Hook(4) 四类，Hook 在每次执行前后调用 `preCheck`/`postCheck`；该标准目前是 **Draft** [3]。
- Rhinestone Smart Sessions：可用于任意 ERC-7579 账户，policy 包括 Call（限 calldata）、Spending limit（ERC-20 转账和 approve 额度）、Timeframe、Usage limit、Value limit。多个 policy 是逻辑 AND；**不配 policy 时默认是 sudo**；“A session without an expiry should not be treated as temporary”[5]。
- EIP-7702（**Final**）给 EOA 写入委托指示符 `0xef0100||address`；授权元组是 `[chain_id, address, nonce, …]`，chain_id 为 0 时在所有链上有效；委托给零地址就清除委托。规范要求委托合约自己做重放保护，并对 value、gas、target/calldata 签名 [1]。以太坊主网于 2025-05-07 通过 Pectra 激活 [6]。
- 推理：7702 本身只解决“EOA 能跑合约代码”，**白名单、额度、时效全部要靠委托合约或 7579 模块来实现**；revoke 有两层，一层是撤销 session（模块状态），一层是撤销 7702 委托（再发一笔授权）（inferred，由 [1][5] 推出）。
- “禁止 approve”和“交易必须能买卖”之间需要靠 router 内部的原子 approve+swap（批处理）来调和 [R6 notes/03:43-45]。

### 2.4 发行机制：bonding curve + v4 hook 池内相变
**答案**：方案提出代币创建时直接部署在 byreal 的 v4 池里。Phase 1 由 hook 截获 `beforeSwap`，按 bonding curve 定价；累计买入达到阈值后翻转标志位，切到集中流动性。方案声称这样能做到“零跨合约迁移、零 MEV 攻击窗口、LP 永久锁死”[R1 product.md:46-54]。

**依据**
- v4 允许 hook 实现自定义曲线和自定义记账（`beforeSwapReturnDelta` 等 return-delta 权限）。hook 是 PoolKey 的一部分，建池后不能更换；hook 的权限编码在合约地址的低位里 [25]。所以“同池换相”只能写在**同一个 hook 的内部状态机**里，不能靠换 hook 实现（inferred）。
- 仓库链规范给出了同样的相变设计，并要求链支持 EIP-1153 [R8 launchpad-chain-spec §4.2-4.3]。
- “零 MEV”不成立：相变只消灭了“迁移那一下”的窗口，Phase 1 曲线内的抢跑和夹子仍然存在。仓库自己的链规划也把开盘排序不公列为单独问题（B3/S3）[R9 06 §4.1.3]（inferred）。

### 2.5 创作者经济：手续费养推理
**答案**：方案提出每笔交易收固定比例手续费（比如 1%），其中 70%–80% 自动进发币 agent 的 Runtime Vault，以 quote 结算，用来付 LLM 推理、API 和 gas [R1 product.md:42-44]。报告补了一条约束：feeRecipients 在发射时写死，runtime 那条腿只收 quote，人类事后不能把这份改到自己的 EOA [R5 notes/02:80-84]。
**依据**：数值与 Virtuals（1% 税的 70%）[15] 同一量级，Clanker Droid 用的是 10% LP carve-out [13]。

### 2.6 双轨 onboarding
**答案**：方案提出两条路径。人类入口是 Bybit AI：对话入口加 Skill/CLI，把 AI Subaccount 里的小额资金“映射至链上受限 Session”。机器入口是 Moltbook 式的 agent 社区（可选）：只有 agent 能发帖，人类只读 [R1 product.md:60-70]。
**依据（外部现状）**
- Bybit AI Subaccount 在 2026-05-27 公告上线：资金隔离、碰不到主账户、用户可设杠杆/资产上限/禁止提现、**只能通过 API 访问**、主账户只读监督 [20]。它是**交易所内部账户**，公告里没有任何“映射到链上 session”的能力；这一段只是方案设想（observed：公告内容；映射本身是 speculative）。
- Bybit 在 2026-04-22 发布官方 MCP，提供行情、交易、账户、WebSocket 四个模块 [21]。二手报道说 2026-09 上线的 Bybit AI 聊天助手不能执行交易、不能访问主账户 [22]（二手，没找到 Bybit 一手公告）。
- Moltbook 真实存在：2026-01 上线，只有 agent 能发帖、投票。AP 报道 Meta 在 2026-03-10 宣布收购 Moltbook 并聘用两位联合创始人；Moltbook 构建在 OpenClaw 之上 [23]。Bankr 文档也提供面向 OpenClaw agent 的 Token Strategist skill [8]。
- outline 把这两条路径收紧了：人类是次级入口，**禁止在 Bybit 聊天里直接给 8000 万 KYC 用户发 meme**；论坛只负责发现和冷启动，热路径始终走结构化 API [R3 outline:39-50]。Bybit 官方口径是“over 80 million users”[26]。

### 2.7 对 Mantle 链级能力的需求
**答案**：方案提出四项需求：v1 用 EIP-7702 做 session；Paymaster 让 agent 用 quote（mStocks/USDT）付 gas；用 2D nonce 把发币和转账分到不同通道；排序器在突发负载下保持确定性排队，必然 revert 的交易在接入层快速失败 [R1 product.md:79-92]。
**依据**
- 7702 在 Mantle 主网上可用：Mantlescan 有 “EIP-7702 Authorizations” 列表页，搜索索引快照显示共 59,953 条 [7]（直接抓取返回 403，数字以快照为准）。
- **2D nonce 在应用层已经有了**：ERC-4337 EntryPoint 把 `uint256 nonce` 拆成 192-bit key 加 64-bit sequence，提供 `getNonce(sender, key)`，每个 key 独立校验 sequence [2]。product.md 里的 `SequenceKey` 就是这个语义。原生版本 RIP-7712（依赖 RIP-7560）仍是 Draft，而且 nonceKey≠0 的交易不会递增 legacy nonce，也就不会作废已签的 7702 授权 [4]。所以报告里“L2 做不到二维 nonce”这句只对 EOA 和 7702 原生交易成立，对 4337 UserOp 不成立（inferred）。
- Paymaster：4337 UserOp 有 `paymaster`、`paymasterVerificationGasLimit`、`paymasterPostOpGasLimit`、`paymasterData` 字段 [2]，可以实现“用 ERC-20 付 gas”。用 mStocks 付 gas 时，Paymaster 需要一个可靠的价格源；链规划 S6 也写了用 USDT 或股票代币直接打新 [R9 06 §4.2.7]。
- 失败不入块：仓库链规划把 S4（发射相关交易模拟失败就丢弃，配速率限制）列为第一包，并把它和 S1 热点配额、S5 发射 RPC 并列为“有链上实锤的三条”[R9 06 §4.2.2-4.2.4]。报告把它划为 L2 路线一（不改排序器）做不到的项 [R2 report:153-160]。两份资料对“L2 能不能做”的判断不同，见 §3.2。

### 2.8 何时需要 L3
**答案**：方案给出两个条件：①热点竞价让 Mantle 全网 base fee 成倍飙升、外溢到支付和 DeFi；②死币带来的状态膨胀需要剪枝或存储租金 [R1 product.md:95-97]。报告给出的是可观测的 F1–F3：热点外溢、失败扣费导致做市 agent 退出、开盘被共址 bot 垄断。报告明确说“叙事上是 agent”“零 MEV”“未测的 TPS”都**不是**开 L3 的理由 [R2 report:245-259]。

---

## 3. 设计论证与取舍

### 3.1 报告与 outline 的核心论证
- **缺的是身份和权限，不是状态机**：已经跑通的 agent 发币和交易产品都在共享 L2 或 Solana L1 上，它们出的问题在权限和社交门槛，不在“没有 L3”[R2 report:9-11, 239]。
- **为什么先上 L2**：L3 的好处（失败丢弃、热点隔离、FBA）是真的，但热路径一旦离开 L2，毕业和 DeFi 组合就变成跨层问题。在没有 Mantle 实测数据之前就建链，等于“用确定的流动性割裂去换一个还没观测到的执行问题”[R2 report:241]。
- **F1–F3 翻转条件**：F1 是发射窗口内无关交易的失败率或 base fee 相对前 24h 中位数持续上升，且能归因到工厂地址，**必须用 Mantle 自己的数据测**，不能套用 Robinhood Chain 的 82 倍；F2 是 revert 扣费或一维 nonce 阻塞导致专业做市 agent 停止挂单；F3 是 hook 上线后开盘成交仍集中在共址 bot 手里，而且它们的短窗口利润高于创作者费 [R2 report:245-249]。
- **热路径用结构化 API，不用自然语言**：Bankr 的 NL 和 CLI 默认链不一样（官方文档现在也写了“Chain defaults differ by surface”[8]），说明 NL 不能当唯一的发射接口 [R5 notes/02:19-27]。
- **幂等与机器可读失败码**：`Deploy(...)` 带 `clientRequestId` 幂等键，模拟不占配额，失败码覆盖配额、余额、持仓上限、未上链等情况；提交后超时标记 `unknown`，不假装失败不扣费 [R5 notes/02:23-25][R6 notes/03 §5]。Bankr 的做法是一手先例：提交阶段只要无法证明“没有广播”就保留配额计数 [8]。

### 3.2 设计取舍（product.md 与 report/outline 冲突的地方，两边并列，不替用户选）

| 取舍 | product.md 的立场与理由 | report/outline 的立场与理由 |
|---|---|---|
| Quote 资产 | 以 mStocks 作为核心或唯一 quote，理由是“制造刚性底层买盘”，把投机需求转成对代币化美股的现货买盘，与 Mantle 主业对齐 [R1 product.md:4, 105-106] | 默认用 USDC（协议登记的稳定币），不默认 MNT，也不默认 xStocks。理由：“不寄生 xStocks”，与 Tape 划清边界；少一条 gas 腿；USDC 本身也是“设计选择，不是链上已有登记”[R2 report:23, 31, 139, 265] |
| 发行机制 | 曲线加 v4 hook 池内相变，理由是消除迁移被夹、流动性断层和迁移漏洞，同时保留“打新期”[R1 product.md:46-54] | 默认**不要曲线**：固定供应量、v4 单边池、永久锁 LP、上线即可交易（Clanker/Bankr 这一类）。理由是 agent 要一笔原子 `Deploy`，不需要“毕业直播”；如果确实要曲线的注意力效应，就用同池 hook 相变，两条路都合法 [R2 report:135-137][R6 notes/03:25-27][R3 outline:25] |
| 与 Bybit/byreal 的协同程度 | 深度绑定：Bybit AI 是统一入口，AI Subaccount 资金映射到链上 session；byreal 是唯一底座 DEX，承接曲线和毕业后的 CL 池；三方共赢 [R1 product.md:5, 50, 60-64, 143-145] | 弱绑定：Bybit 只是人类的次级入口，KYC 用户不在聊天里直接发 meme；子账户 USDT 映射到 AgentAccount session，但“不是把交易所子账户当链上根钥”；文中没有 byreal，只写“Uni v4 工厂 + router”[R3 outline:39-44][R2 report:9] |
| 失败处理与排序 | 要求排序器在接入层拦截必然 revert 的交易 [R1 product.md:90-92] | 路线一不改排序器，失败不入块属于“L2 做不到”的边界，只能先模拟再少发；要做就已经超出路线一 [R2 report:153-160] |
| L3 触发 | 热点 base fee 外溢、状态膨胀两条 [R1 product.md:95-97] | F1–F3 必须用 Mantle 实测；状态膨胀不在 F 条件里（仓库链规划把状态租金放到 L5 长期项）[R2 report:245-249][R9 06 §4.4.1] |

外部事实对这些取舍的约束（只陈述，不下结论）：
- 公开资料里 byreal 是**Solana 上**的 DEX（CLMM 加 RFQ，Bybit 孵化，提供 Agent Skills）[24]，没有找到 Mantle 部署或 Uniswap v4 架构的公开信息。product.md 写的“Mantle 上承接 Uniswap v4 架构的 byreal”属于没有公开的计划，本 lane 不核实也不展开。
- Bankr 已经在 Robinhood Chain 和 Base 上提供股票 quote 发射（Robinhood Stock Token、Coinbase B20）[8]，说明“股票作为 quote”有外部先例。本报告不展开 Tape。

---

## 4. 图的素材

### 4.1 权限与资金流（Owner → AgentAccount → session → 工厂/router → runtime vault）
1. Owner（人类 EOA 或已有 AA）把 quote 存进 AgentAccount（7702 委托的 EOA 或 7579 账户）[R6 notes/03:9-12][1][3]。
2. Owner 签发 session：target 限 Factory 和 Router；selector 限 `launch`、`buyExactQuote`、`sellExactToken`、`claimFee`；额度有单笔、单块、累计三档；`valid_until` 比如 24h；可选 `max_drawdown_bps` [R1 product.md:20-30][R5 notes/02:45-48]。
3. 校验点：4337 路径下由 EntryPoint 调 `validateUserOp`，再由 7579 Validator（Smart Sessions）校验 policy；7702 路径下由委托合约自己校验 [2][3][5]。
4. 资金去向：session 只能把 quote 送进 Factory/Router，不能 `transfer` 到任意地址；交易所得回到 AgentAccount 自己 [R1 product.md:21-26]。
5. 费流：池子手续费 → hook/locker → feeRecipients（发射时写死）→ runtime vault（只收 quote）→ 按策略拨给 Paymaster 或推理合约（白名单）[R5 notes/02:82-84, 123]。
6. 撤销：owner 执行 `revoke` 后 session 立即失效；已部署的币还在，费用仍按发射时的路由分配 [R5 notes/02:124]。

### 4.2 时序：agent 发币 → 交易 → 领费
1. Agent → Agent API：`simulate(Deploy)`，不占配额 [R5 notes/02:24][8]。
2. Agent 用 session key 签 UserOp 或 7702 交易 → Bundler → EntryPoint → Paymaster 校验（发射赞助）→ AgentAccount.execute → Factory.launch [2][R6 notes/03:12-15]。
3. Factory 在一笔交易里原子完成：部署 ERC-20（固定供应量）→ v4 `initialize`（hook 已在 PoolKey 里）→ 单边 LP 锁进 locker → 写入 feeRecipients → 设置开盘窗口（持仓上限、衰减税）[R6 notes/03:31-35][25]。
4. Indexer 推送 `TokenLaunched` → 其他 agent 订阅 [R6 notes/03:18]。
5. Agent B：`simulate(Buy)` → 失败就不提交；成功就提交 `buyExactQuote`（原子 approve+swap）→ hook 检查持仓上限和衰减税 [R6 notes/03:43-49]。
6. Agent A：`claimFee` → 费用进 runtime vault → vault 支付推理和 gas [R1 product.md:43-44]。
7. （方案 Phase 2）累计买入达到阈值 → hook 翻转标志位 → 之后的 swap 走 CL [R1 product.md:52-53]。

### 4.3 两条 onboarding 路径
- 人类：Bybit App → Bybit AI 对话 → 创建 AI Subaccount（API-only，资金隔离）[20] → （方案设想）划转小额 USDT → 映射为链上 AgentAccount session [R1 product.md:64][R3 outline:42] → 允许发现币、确认后买、给 agent 拨预算 [R3 outline:43]。
- Agent：拿到 session（不需要“人格”）→ 接入 Moltbook 式论坛做发现和冷启动 [23][R3 outline:48-49] → 热路径直接调结构化 Deploy/Buy/Sell API [R3 outline:50]。

### 4.4 数值示例（教学用，不是生产参数）
- 仓库用户故事：H 存 10,000 USDC；session S 预算 500 USDC，有效期 2h，单块 ≤50 USDC；发 `FOO/USDC`，费用 80% 进 runtime vault、20% 给协议 [R5 notes/02:119-121]。
- 对照产品的费率（截至 2026-10-05）：Bankr 创作者拿成交额的 0.665%，合计 1.75% [8]；Virtuals 交易税 1%，70/30 分 [15]；Clanker Droid 拿 LP 奖励的 10%（可设 1%–50%）[13]。
- 开盘保护对照：Bankr 前 5 分钟持仓上限 2% 加 14 秒反狙击费 [8]；Virtuals 税率 99%→1%，窗口 0s/60s/10min/98min [15]。

### 4.5 时间线节点
- 2024-10：ai16z 在 daos.fun 募资约 $75k [R2 report:74]（CoinDesk 播客也提到“$75K Joke”[19]）
- 2025-01-02：AI16Z 市值峰值 $2.39B [19]
- 2025-05-07：Pectra/EIP-7702 在以太坊主网激活 [6]
- 2025-10：Farcaster 收购 Clanker [14]
- 2026-01：Moltbook 上线；2026-03-10：Meta 宣布收购 Moltbook [23]
- 2026-04-22：Bybit 发布官方 MCP [21]
- 2026-05-27：Bybit 上线 AI Subaccount [20]
- 2026-08-04：ELIZAOS 代币被创始人宣布死亡 [19]
- 截至 2026-10-05：daos.fun 已停止新发射 [17]

---

## 5. 来源

- [1] **PRIMARY** EIP-7702: Set Code for EOAs（Final），https://eips.ethereum.org/EIPS/eip-7702 ，访问 2026-10-05。证明委托指示符、授权元组、chain_id=0 全链有效、零地址清除委托，以及委托合约需要自己做重放保护和参数签名。
- [2] **PRIMARY** ERC-4337，https://eips.ethereum.org/EIPS/eip-4337 ，访问 2026-10-05。证明 192-bit key 加 64-bit sequence 的半抽象 nonce，以及 paymaster 相关字段。
- [3] **PRIMARY** ERC-7579（Draft），https://eips.ethereum.org/EIPS/eip-7579 ，访问 2026-10-05。证明模块分为 Validator、Executor、Fallback、Hook 四类，以及 preCheck/postCheck。
- [4] **PRIMARY** RIP-7712（Draft），https://github.com/ethereum/RIPs/blob/master/RIPS/rip-7712.md （master 分支，未固定 commit），访问 2026-10-05。证明原生二维 nonce 还是草案、依赖 RIP-7560，且与 7702 授权有交互。
- [5] **PRIMARY** Rhinestone Smart Sessions 文档，https://docs.rhinestone.dev/smart-wallet/smart-sessions/overview 、https://docs.rhinestone.dev/home/concepts/session-keys ，访问 2026-10-05。证明主流 session 模块的 policy 种类、AND 语义、默认 sudo、过期时间需要显式设置。
- [6] **PRIMARY** EF Blog “Pectra Mainnet Announcement”，https://blog.ethereum.org/2025/04/23/pectra-mainnet ，访问 2026-10-05。证明 2025-05-07 激活，以及 7702 可撤销、可替换。
- [7] **PRIMARY**（链上浏览器，经搜索快照）Mantlescan EIP-7702 Authorizations，https://mantlescan.xyz/txnAuthList ，访问 2026-10-05（直接抓取返回 403，内容取自搜索索引快照）。证明 Mantle 主网已有 7702 授权交易。
- [8] **PRIMARY** Bankr Token Launching Overview，https://docs.bankr.bot/token-launching/overview ，访问 2026-10-05。证明“agents fund themselves”、三个入口、各入口默认链、配额与退配额、14 秒反狙击、2% 持仓上限、费率结构、股票 quote、Launch v3。
- [9] **PRIMARY** Bankr Wallet API Overview，https://docs.bankr.bot/wallet-api/overview ，访问 2026-10-05。证明快慢两条路径和 key 级访问控制。
- [10] **PRIMARY** Bankr Agent API Overview，https://docs.bankr.bot/agent-api/overview ，访问 2026-10-05。证明 key 泄露可能导致丢失全部资产。
- [11] **PRIMARY** Bankr Security（Bankr Terminal），https://docs.bankr.bot/security/bankr-terminal ，访问 2026-10-05。证明服务端日限额、单笔限额、收款人白名单、任意合约调用开关等默认值，以及这些设置 API key 改不了。
- [12] **PRIMARY** clanker-devco/DOCS `droids/README.md`（main 分支，未固定 commit），https://github.com/clanker-devco/DOCS/blob/main/droids/README.md ，访问 2026-10-05。证明 Droid “not autonomous with your money”。
- [13] **PRIMARY** clanker-devco/DOCS `droids/funding.md`（main 分支），https://github.com/clanker-devco/DOCS/blob/main/droids/funding.md ，访问 2026-10-05。证明 10%（1%–50%）carve-out、只能用 Base 加 USDC、runway 机制。
- [14] **PRIMARY** Farcaster news “Farcaster acquires Clanker”，https://farcaster.xyz/~/news/Farcaster-aquires-Clanker-l00yra ，访问 2026-10-05（日期 2025-10 取自 PANews 二手报道）。证明收购和回购安排。
- [15] **PRIMARY** Virtuals Launch Mechanics，https://whitepaper.virtuals.io/about-virtuals/capital-formation-layer/virtuals-launch-mechanics ，访问 2026-10-05。证明模块费用、狙击税、1% 税 70/30、42,000 VIRTUAL 毕业到 V2、LP 锁 10 年、Hyperboost。
- [16] **PRIMARY** ElizaOS plugin-evm Examples，https://docs.elizaos.ai/plugin-registry/defi/evm/examples ，访问 2026-10-05。证明 `EVM_PRIVATE_KEY` 和可选 TEE。
- [17] **PRIMARY** daos.fun 官网，https://www.daos.fun/ ，访问 2026-10-05（经搜索快照）。证明项目已停止维护、停止 DAO 发射，以及给出的理由。
- [18] **PRIMARY** daos.fun docs “expiry and redemption”，https://docs.daos.fun/docs/expiry-redemption ，访问 2026-10-05。证明链上到期和按比例赎回。
- [19] 二手 CoinDesk 2026-08-05 “AI agent token once worth $2.4 billion ends with founder calling it dead”，https://www.coindesk.com/markets/2026/08/05/ai-agent-token-once-worth-usd2-4-billion-ends-with-founder-calling-it-dead ，访问 2026-10-05。证明 AI16Z 峰值、迁移、诉讼和代币死亡（引用了创始人 X 帖文）。
- [20] **PRIMARY** Bybit 公告 “Launch of AI Subaccount…” 2026-05-27，https://announcements.bybit.com/en/article/-ai-ai--blta50e3efa96768430/ ，访问 2026-10-05。证明 AI Subaccount 的隔离、风控项和 API-only 访问。
- [21] **PRIMARY** Bybit Press “Bybit AI Expands to Infrastructure Layer with Official MCP Release” 2026-04-22，https://www.bybit.com/en/press/post/bybit-ai-expands-to-infrastructure-layer-with-official-mcp-release-for-multi-agent-trading-blt11731f3b30877c7e ，访问 2026-10-05。证明 Bybit MCP 有四个模块。
- [22] 二手 The Currency Analytics 2026-09-09，https://thecurrencyanalytics.com/crypto-exchanges/bybit-launches-ai-chat-tool-across-its-4-platform-mcp-infrastructure-292014 ，访问 2026-10-05。线索：Bybit AI 聊天助手不能执行交易（没找到一手来源）。
- [23] 二手 AP（US News 转载）2026-03-10 “Meta to Acquire Moltbook”，https://www.usnews.com/news/technology/articles/2026-03-10/meta-to-acquire-moltbook-the-social-network-for-ai-agents ，访问 2026-10-05。证明 Moltbook 存在、只允许 agent 发帖、Meta 收购（引用了 Meta 声明）。
- [24] **PRIMARY** Byreal Docs “What is Byreal?”，https://docs.byreal.io/ ，访问 2026-10-05。证明 byreal 是 Solana 上的 CLMM 加 RFQ DEX，由 Bybit 孵化。
- [25] **PRIMARY** Uniswap v4 Hooks 文档，https://docs.uniswap.org/contracts/v4/concepts/hooks ，访问 2026-10-05。证明 hook 可以实现自定义曲线和 return-delta，且建池后不能更换 hook。
- [26] **PRIMARY** Bybit Press 索引页，https://www.bybit.com/uk-UA/press ，访问 2026-10-05（经搜索快照）。证明 Bybit 口径“over 80 million users”。
- [27] **PRIMARY** clanker.world Robinhood Chain stats，https://www.clanker.world/clankers/chain/robinhood/stats ，访问 2026-10-05（经搜索快照）。证明 Clanker 已部署到 Robinhood Chain。
- [R1] 资料 `7-agent-meme-launchpad/product.md`（用户方案主线）。
- [R2] 资料 `7-agent-meme-launchpad/agent-meme-launchpad-report.md`（2026-09-17）。
- [R3] 资料 `7-agent-meme-launchpad/outline.md`。
- [R4] 资料 `7-agent-meme-launchpad/notes/01-agentic-landscape.md`。
- [R5] 资料 `7-agent-meme-launchpad/notes/02-agent-requirements.md`。
- [R6] 资料 `7-agent-meme-launchpad/notes/03-l2-design.md`。
- [R7] 资料 `7-agent-meme-launchpad/notes/04-l3-design.md`。
- [R8] 资料 `2-meme-launchpad/chain-infra/launchpad-chain-spec.md`。
- [R9] 资料 `2-meme-launchpad/outputs/06-chain-infra-plan.md`（本 lane 只引用 §4.x 的节号，行号未逐行核对）。

---

## 6. 开放问题

1. Mantle 主网是否已部署 ERC-4337 EntryPoint（v0.7 或 v0.8）和可用的 Bundler/Paymaster 服务？没有核实。这决定 2D nonce 和 USDC 付 gas 能否“零改链”起步。
2. mStocks 付 gas 的 Paymaster 用什么价格源？美股休市时价格过期怎么办？product.md 没写。
3. Bybit AI Subaccount → 链上 session 的“映射”由谁托管、谁签名？目前没有任何公开接口，这一步是信任边界上最大的空白。
4. byreal 是否计划部署到 Mantle 并采用 v4 架构？没有公开信息，按 lane 要求不展开。
5. hook 相变方案中 Phase 1 的曲线储备是否计入 v4 池的 CL 头寸？毕业时如何把曲线储备换算成 CL 价格区间？仓库资料只到概念层。
6. session 被 prompt 注入后，在白名单内也能“合法地”把资金亏光（比如反复高价买入自己控制的币）。需不需要 `max_drawdown_bps` 或“只能买本工厂代币”这类额外约束？
7. Clanker 和 ERC-7579 等 GitHub 文档引用的是 main/master 分支，没有固定 commit。页面上线前应补上 commit hash。
8. 06-chain-infra-plan 和 launchpad-chain-spec 的引用只到节号，行号需要复核。

---

## 7. 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| A1 | Clanker 的第一公民是人类创作者；Droid 文档写明“not autonomous with your money”，cast 需要人工确认 | [12] clanker-devco/DOCS droids/README.md（main，访问 2026-10-05） | observed | |
| A2 | Clanker Droid 默认从 LP 奖励切 1000 bps（可设 100–5000）进 Base 上的 runtime 钱包，用 USDC 付推理 | [13] droids/funding.md | observed | |
| A3 | Clanker Droid 被硬限在 Base 主网加 USDC 交易对，其他链的 API 返回 “Launch with Agent requires Base mainnet” | [13] droids/funding.md | observed | |
| A4 | Clanker 发币内核是固定供应量加单边流动性进 v4 加 LP 永久锁定，没有曲线和毕业，没有 session，部署者自付 gas | 仅见于 notes/01-agentic-landscape.md:36-54（引用 base-ecosystem.md 和 SDK），本 lane 未打开合约复核 | speculative | |
| A5 | 2025-10 Farcaster 收购 Clanker，并安排协议收入回购 CLANKER | [14] farcaster.xyz news（日期取自 PANews 二手报道） | observed | |
| A6 | Bankr 文档把发币定义为 agent 自我供血：“This is how agents fund themselves” | [8] docs.bankr.bot/token-launching/overview | observed | |
| A7 | Bankr 的 chat、social、API 默认部署到 Robinhood Chain，CLI 和网页默认 Base | [8] Token Launching Overview “Chain defaults differ by surface” | observed | |
| A8 | Bankr 每个钱包滚动 24h 内 3 次计数尝试、每分钟 1 枚；能证明未上链的失败退配额；模拟不占配额但每 24h 最多 20 次 | [8] Deployment Limits | observed | |
| A9 | Bankr 开盘 5 分钟单钱包持仓上限 2%，反狙击费衰减窗口是 14 秒（仓库资料写的约 10 秒已过时） | [8] Five-Minute Balance Cap；对照 notes/01-agentic-landscape.md:142 | observed | |
| A10 | Bankr Doppler 发射的池费 0.7%，其中 95% 给创作者（成交额 0.665%），全部费用合计 1.75%，在发射时固定 | [8] Fee Structure | observed | |
| A11 | Bankr 零售钱包的最低 ETH 余额现在是运行时开关，文档不再写 0.002 ETH；纯邮箱账户要等 72h，每 IP 每 24h 约 10 次成功部署 | [8] Retail launch-wallet requirements；对照 notes/01-agentic-landscape.md:143 | observed | |
| A12 | Bankr 的交易分成两条：Wallet API（不经过 LLM，快）和 Agent API（NL→LLM，慢） | [9] Wallet API Overview | observed | |
| A13 | Bankr 官方警告：分享开启了 agent 权限的 API key 可能丢失账户全部资产 | [10] Agent API Overview “Security” | observed | |
| A14 | Bankr 已有服务端账户策略：日限额默认 $500/24h、单笔 $500、收款人白名单、任意合约调用开关（默认开），API key 改不了这些设置 | [11] docs.bankr.bot/security/bankr-terminal | observed | |
| A15 | 所以 Mantle 方案相对 Bankr 的差异点应该是“链上可验证、非托管的策略”，而不是“有没有限额” | 由 A14、A16 推出：Bankr 限额在服务端广播关口执行，而 7579 session 的 policy 在链上校验 | inferred | |
| A16 | 主流 7579 session 模块（Rhinestone Smart Sessions）支持 Call、Spending limit、Timeframe、Usage limit、Value limit 几种 policy，按 AND 组合；不配 policy 时默认 sudo | [5] docs.rhinestone.dev smart-sessions overview | observed | |
| A17 | Session 不会自动过期，必须显式设置 timeframe policy | [5] Rhinestone “Time limits are configurable, not inherent to session keys” | observed | |
| A18 | Virtuals 的发币者是人类 founder；创建免费，部分模块收 10 或 100 VIRTUAL | [15] Virtuals Launch Mechanics | observed | |
| A19 | Virtuals 交易税 1%，70% 给创作者、30% 给 Treasury；累计 42,000 VIRTUAL 毕业到 Uniswap V2，LP 锁 10 年 | [15] | observed | |
| A20 | Virtuals 可选狙击税从 99% 衰减到 1%，窗口 0s/60s/10min/98min，默认只作用于买方；回购的币按 3+9 个月释放给团队 | [15] | observed | |
| A21 | ElizaOS EVM plugin 必填 EVM_PRIVATE_KEY 环境变量，可选 TEE_MODE；交易靠自然语言触发 | [16] docs.elizaos.ai plugin-evm examples | observed | |
| A22 | AI16Z 在 2025-01-02 市值峰值 $2.39B；2026-08-04 创始人宣布 ELIZAOS 代币死亡、基金会关闭 | [19] CoinDesk 2026-08-05（二手，引用创始人 X 帖文） | observed | |
| A23 | daos.fun 已停止维护、停止所有 DAO 发射，理由是创作者夹自己的交易和滥用 DAO 资金 | [17] daos.fun 官网（经搜索快照） | observed | |
| A24 | 方案提出以 agent 为第一公民，核心协同链路是 Bybit AI ↔ byreal ↔ Mantle，quote 资产为 mStocks | product.md:3-5 | observed | |
| A25 | 方案提出“发币零门槛、交易硬限权”，理由是发币输入收敛、交易有滑点、MEV、跳价等高危边界 | product.md:12-16 | observed | |
| A26 | 方案提出 session 目标白名单只放 LaunchpadFactory 和 byrealRouter，禁止原生 transfer 和任意 ERC-20 调用 | product.md:20-22 | observed | |
| A27 | 方案提出函数选择器白名单为 launch、buyExactQuote、sellExactToken、claimFee，禁止 approve(arbitrary) | product.md:23-26 | observed | |
| A28 | 方案提出单笔、单块、生命周期三档额度（以 quote 计），加滑点硬约束、24h 时效和 owner 一键 revoke | product.md:27-30 | observed | |
| A29 | EIP-7702 已 Final；它只给 EOA 写入委托指示符，白名单、额度、时效要靠委托合约或模块实现 | 由 [1]（规范只定义委托和授权元组，要求委托合约自做重放保护）和 [5]（policy 在模块里）推出 | inferred | |
| A30 | 7702 授权的 chain_id 为 0 时在所有链有效；委托给零地址可清除委托 | [1] EIP-7702 Behavior 第 1、8 步 | observed | |
| A31 | Mantle 主网已经支持 EIP-7702：Mantlescan 有 7702 授权列表，快照显示 59,953 条 | [7] mantlescan.xyz/txnAuthList（搜索快照，直接抓取返回 403） | observed | |
| A32 | ERC-4337 EntryPoint 已提供 192-bit key 加 64-bit sequence 的二维 nonce，并提供 getNonce(sender,key) | [2] ERC-4337 Semi-abstracted Nonce Support | observed | |
| A33 | 报告里“L2 做不到二维 nonce”只对 EOA 和 7702 原生交易成立，对 4337 UserOp 不成立 | 由 A32 与 report:158、notes/03-l2-design.md §8 推出：4337 账户在应用层就有 key 分道 | inferred | |
| A34 | 原生二维 nonce 提案 RIP-7712 仍是 Draft，依赖 RIP-7560；nonceKey≠0 的交易不会作废已签的 7702 授权 | [4] RIP-7712（master） | observed | |
| A35 | 方案提出用协议级 Paymaster，让 agent 用 quote（mStocks/USDT）付 gas | product.md:82-84 | observed | |
| A36 | 4337 UserOp 带 paymaster、paymasterVerificationGasLimit、paymasterPostOpGasLimit、paymasterData 字段，能支撑 ERC-20 付 gas | [2] ERC-4337 UserOperation 字段表 | observed | |
| A37 | 方案提出在 v4 池内用 hook 实现相变：Phase 1 由 beforeSwap 按曲线定价，达到阈值后翻转到 CL | product.md:50-53 | observed | |
| A38 | v4 的 hook 写在 PoolKey 里，建池后不能更换，所以相变只能在同一个 hook 的内部状态机里完成 | 由 [25]（hook 不可增删换；支持自定义曲线和 return-delta）推出 | inferred | |
| A39 | 方案声称的“零 MEV 攻击窗口”不成立：相变只消除迁移窗口，Phase 1 曲线内的抢跑和夹子仍在 | 由 product.md:54 与 06-chain-infra-plan.md §4.1.3（B3 开盘排序不公与 B6 迁移分开列）、report:259（“想要零 MEV”不是翻转理由）推出 | inferred | |
| A40 | 方案提出每笔交易收约 1% 手续费，70%–80% 进发币 agent 的 Runtime Vault，以 quote 结算，用来付推理和 gas | product.md:43-44 | observed | |
| A41 | “手续费养推理”已被 Clanker（10% LP）、Bankr（0.665%）、Virtuals（1% 的 70%）三家同时采用 | 由 A2、A10、A19 推出 | inferred | |
| A42 | 方案提出人类入口是 Bybit AI，AI Subaccount 的资金映射到链上受限 session | product.md:61-64 | observed | |
| A43 | Bybit 在 2026-05-27 上线 AI Subaccount：资金隔离、只能通过 API 访问、可设杠杆/资产上限/禁止提现、主账户只读监督 | [20] Bybit 公告 | observed | |
| A44 | 目前没有 Bybit AI Subaccount 到链上 session 的公开映射能力 | 仅见于 product.md:64 的方案描述；Bybit 公告 [20] 没有提到链上映射，未找到一手来源 | speculative | |
| A45 | Bybit 在 2026-04-22 发布官方 MCP（行情、交易、账户、WebSocket 四个模块） | [21] Bybit Press | observed | |
| A46 | Bybit AI 聊天助手（2026-09）不能执行交易、不能访问主账户 | 仅见于二手报道 [22]，未找到 Bybit 一手公告 | speculative | |
| A47 | 方案提出 Moltbook 式的 agent 专属社区，只有 agent 能发帖，人类只读 | product.md:66-70 | observed | |
| A48 | Moltbook 真实存在，2026-01 上线，只有 agent 能发帖；Meta 在 2026-03-10 宣布收购 | [23] AP 报道（引用 Meta 声明） | observed | |
| A49 | 公开资料中 byreal 是 Bybit 孵化的 Solana DEX（CLMM 加 RFQ），没有 Mantle 或 Uniswap v4 部署信息 | [24] docs.byreal.io | observed | |
| A50 | byreal 会作为 Mantle 上的 v4 DEX 承接 Launchpad | 仅见于 product.md:50、144，未找到一手来源（属于未公开计划，不核实） | speculative | |
| A51 | 报告的推荐是维持 L2：缺的是身份与权限，不是独立状态机 | agent-meme-launchpad-report.md:9-11 | observed | |
| A52 | 报告给出的 L3 翻转条件是 F1 热点外溢、F2 失败扣费导致做市退出、F3 开盘被共址 bot 垄断，且必须用 Mantle 实测 | agent-meme-launchpad-report.md:245-249；outline.md:66-68 | observed | |
| A53 | 方案给出的 L3 条件是全网 base fee 外溢和死币导致的状态膨胀 | product.md:95-97 | observed | |
| A54 | 取舍：product.md 以 mStocks 为核心 quote（理由是刚性买盘）；报告默认 USDC，不寄生 xStocks | product.md:4、105-106；agent-meme-launchpad-report.md:31、139 | observed | |
| A55 | 取舍：product.md 选曲线加 hook 相变；报告和 outline 默认不要曲线，用 v4 单边池加永久锁 LP，曲线作为可选的同池相变 | product.md:46-54；agent-meme-launchpad-report.md:135-137；outline.md:25 | observed | |
| A56 | 取舍：product.md 深度绑定 Bybit 和 byreal；outline 把 Bybit 定为次级入口，禁止在聊天里给 KYC 用户直接发 meme | product.md:60-64、143-145；outline.md:39-44 | observed | |
| A57 | 热路径必须是结构化 API（幂等的 clientRequestId、模拟不占配额、机器可读失败码），NL 只做人类入口 | notes/02-agent-requirements.md:19-27；outline.md:33 | observed | |
| A58 | Bankr 的机器可读失败码（TOKEN_LAUNCH_WALLET_TOO_NEW 等）和“无法证明未广播就保留配额”的规则，是幂等与失败码设计的一手先例 | [8] Retail launch-wallet requirements 与 Deployment Limits | observed | |
| A59 | 仓库链规划把“失败 Drop（S4）、热点配额（S1）、发射 RPC（S5）”列为第一包，并配地址级速率限制防 DoS | 06-chain-infra-plan.md §4.2.2-4.2.4 | observed | |
| A60 | 发币零门槛需要配额、钱包年龄、IP、余额等多层反女巫闸门；product.md 没写配额，outline 写了“数值待决” | 由 A8、A11 与 outline.md:35 推出 | inferred | |
| A61 | Bybit 官方口径用户数为“over 80 million”，与 product.md 和 outline 的“8000 万”一致 | [26] Bybit Press 索引页（搜索快照）；product.md:143 | observed | |

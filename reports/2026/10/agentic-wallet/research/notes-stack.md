# notes-stack：协议栈、风险、活动场景与需求证据、Mantle（lane D）

调研日期 2026-10-21。只做调研，没有渲染、发布或提交。没有真实资金测试；链上合约只读了浏览器 API 返回的 ABI，没有发 `eth_call`。
说明：本文件按运行时指定的路径写入（不是 `research/notes-stack.md`），由上级会话搬到报告目录。

---

## §1 协议栈（brief 问题 5）

### 1.1 x402
**答案：** x402 是 HTTP 402 之上的“按请求付款”层，当前 `x402Version: 2`。它管报价格式、签名授权和结算，不管身份、交付质量或争议。EVM 上任何 `eip155:<chainId>` 在协议层都能用，但“能上生产”要另外有 facilitator 路径。官方文档里没有 Mantle 的默认资产，也没有点名支持 Mantle 的 facilitator。

**依据：**
- 四种 scheme [1]：`exact`（固定价格）、`upto`（单次请求按用量，买方授权上限、卖方按实际收费）、`batch-settlement`（可复用通道里累积授权，分批上链）、`auth-capture`（资金先进托管，资源送达后再 capture / void / refund）。
- 三种 payment flow [1]：`authorization` 是所有 scheme 的默认值，handler 运行前只验签，handler 运行后才结算；`upfront` 在 handler 运行前就结算；`escrow` 前后各结算一次。`exact` 支持 authorization 和 upfront；`upto`、`batch-settlement` 只支持 authorization；`auth-capture` 支持 escrow（默认）和 authorization。
- facilitator [4]：负责验证付款 payload、代服务端上链结算，“does not hold funds or act as a custodian”。它是“optional but recommended”，服务端也可以自己结算。
- EVM 代币授权方式 [2]：有 `transferWithAuthorization` 的代币（如 USDC）走 EIP-3009；其余 ERC-20 走 Permit2 加 `x402ExactPermit2Proxy`。Permit2 需要一次链上 approve，可以用 EIP-2612 / ERC-20 approval 的 gas 赞助扩展让这一步免 gas。“Facilitators support networks, not specific tokens.”
- 新 EVM 网络上生产的检查清单 [2]：(1) 确定收哪个代币、它走 EIP-3009 还是 Permit2；(2) 有生产结算路径（托管 facilitator / 自建 facilitator / self-facilitation）；(3) 决定用显式 `TokenAmount` 定价，还是向上游贡献默认资产，以支持 `"$0.01"` 这种美元字符串定价。自建 facilitator 需要 RPC，以及一个持有原生币用来赞助 gas 的钱包。
- 默认资产表 [2] 列了 Base、Ethereum、Avalanche、Polygon、Arbitrum、Monad、Stable、MegaETH、Celo、Sei、Arc 等，**没有 Mantle（5000）**。官方的 x402.org facilitator 只支持测试网 [2][3]。官方 facilitator 列表 [3] 写明“not an exhaustive catalog”，里面没有任何一项点名 Mantle。
- 幂等 [4]：结算结果不确定时，facilitator 返回非终态的 `settlement_pending` 并带上 tx hash；服务端只自动重试一次，靠 `PendingSettlementStore` 对已广播的交易做对账，避免二次扣款。默认实现存在内存里，多副本部署必须换成共享存储（如 Redis）。Solana 上重复提交 `/settle` 可能让人“付一次拿多次资源”，SVM 包默认带 `SettlementCache`；商家自己结算时必须自己做去重。

**不确定之处：** PayAI、Corbits、Dexter、Solvador 等“multi-network”的 facilitator 是否覆盖 Mantle，没有逐家核实。社区仓库 puga-labs/x402-mantle-sdk-facilitator [36]（2025-12-05 创建）提供 Mantle 自建 facilitator 脚手架，不是官方，也没有审计信息。

### 1.2 ERC-8004（身份 / 声誉 / 验证注册表）
**答案：** 状态 Draft，创建于 2025-08-13。三个注册表按“每条链一个单例”部署，负责发现和信任信号，**明确不管付款**，也不防 Sybil。
**依据 [5]：** “Payments are orthogonal to this protocol and not covered here”；Identity Registry 基于 ERC-721 + URIStorage；保留键 `agentWallet` 是收款地址，换成新地址时要提交 EIP-712 或 ERC-1271 签名；Security Considerations 写着“Sybil attacks are possible, inflating the reputation of fake agents”；`getSummary` 必须传入 clientAddresses，否则会受 Sybil / spam 影响。
**不确定之处：** Validation Registry 在官方合约仓库 README 里只列了 Identity 和 Reputation 两个地址 [27]，Validation 是否已在主网部署没有核实。

### 1.3 ERC-8183（任务托管 / 交付 / evaluator）
**答案：** 状态 Draft，创建于 2026-02-25，作者包含 Virtuals 团队成员。它定义一个 6 状态的 job 托管状态机。evaluator 是唯一能判定完成或拒绝的信任点；规范里没有争议仲裁。
**依据 [6]：** 状态为 Open / Funded / Submitted / Completed / Rejected / Expired；过了 `expiredAt` 任何人都可以触发退款。原文：“Evaluator is trusted for completion and rejection once the job is Submitted; a malicious evaluator can complete or reject arbitrarily”；“No dispute resolution or arbitration; reject/expire is final”。高价值任务建议配合 ERC-8004 声誉或质押。hook 是 client 选的受信合约，会回滚的 hook 可以把 job 卡到 `expiredAt`，保底恢复路径是 `claimRefund`。

### 1.4 AP2（Agent Payments Protocol）
**答案：** 当前规范是 v0.2。两类 Mandate：Checkout Mandate（买什么）和 Payment Mandate（为这个 checkout 付款），各自配一张 Receipt，四件一起作为争议证据。AP2 不限定支付工具，crypto 只是其中一种 instrument。
**依据 [7]：**
- 原文：“When this document refers to validation or processing for a particular role, it MUST happen in deterministic code regardless of whether the role is agentic or not.”
- Trusted Surface 角色必须是 non-agentic，Shopping Agent 默认是 agentic，“the Agent itself is a potential attacker”。
- 两种模式：Human Present 下用户直接签 closed mandate；Human Not Present 下用户签带约束的 open mandate，里面必须含 agent 公钥（`cnf`）。`exp` 建议设成完成任务所需的最小值。被拒之前不能再出示新的 open mandate，防止同一授权批出多个 checkout。
- Payment Instrument 扩展点写着“AP2 is agnostic to the particular payment instrument used”。争议的具体处理流程“outside the scope”。
- agent 到 agent 的转授权不在当前范围内。

### 1.5 ERC-7715 / ERC-7710 / ERC-4337 / EIP-7702
- **ERC-7715**（Draft，2024-05-24，依赖 EIP-4337、EIP-7710）[8]：定义钱包 JSON-RPC `wallet_requestExecutionPermissions`，DApp 用它向钱包请求“代用户执行”的权限，另有 `wallet_revokeExecutionPermission`。定位是**请求和授予权限**这一层。
- **ERC-7710**（Draft，2024-05-20，依赖 EIP-1271、EIP-7579）[9]：DelegationManager 的 `redeemDelegations` 先校验委托，再调用 delegator 执行。定位是**赎回和链上校验**这一层；怎么请求委托不在它的范围内，可以用 7715。规范建议 dApp 执行前先模拟 `redeemDelegations`。
- **ERC-4337**（Final，2021-09-29，现在依赖 EIP-7702）[10]：不改共识层的账户抽象。paymaster 要在 EntryPoint 存够 ETH，并在 `validatePaymasterUserOp` 里表示愿意付费。nonce 拆成 192 位 key 和 64 位 sequence，每个 key 各自递增，所以可以并行开多条通道，例如管理操作单独用一个 key。
- **EIP-7702**（Final，Core，2024-05-07）[11]：新增一种交易类型，让 EOA 写入委托指示 `0xef0100||address`。规范说协议层“not possible to implement a system of permissions at this level”，权限必须靠委托代码里的模块系统实现。

### 1.6 MPP（Machine Payments Protocol）
**答案：** Stripe 和 Tempo 合著的开放协议，同样走 HTTP 402。它不绑定支付通道：Tempo 稳定币、经 Stripe 的银行卡、Lightning、自定义方法都可以。Visa 在 2026-03-18 发布了基于 MPP 的卡规范和 SDK [44]。
**依据：** [12][13]（经搜索引擎抓取的官方文档片段）；Tempo 文档说核心的 Payment HTTP Authentication Scheme 已提交 IETF [13]。
**不确定之处：** MPP 与 x402 的线格式是否兼容，没有核实。

---

## §2 风险与工程问题（brief 问题 3 补充）

### 2.1 提示注入
**答案：** 一手研究说得很清楚：问题没有解决，风险包括诱导 agent 用它已有的权限去做坏事，而不只是泄露密钥。各家给的防护都是多层的（模型训练、分类器、结构化输出、工具审批、人工确认），没有一家声称能根治。
**依据：**
- Anthropic [14]：Claude for Chrome 在“Best-of-N”自适应攻击下，攻击成功率从 Opus 4.5 单模型的 8.0% 降到加新防护后的 1.4%（Sonnet 4.5 为 13.8% 到 1.9%）。原文：“A 1% attack success rate … still represents meaningful risk. No browser agent is immune to prompt injection”。文中例子是隐藏在邮件里的指令让 agent 把机密邮件外发，也就是利用 agent 已有的能力。页面没有给出日期。
- OpenAI Agent Builder 安全文档 [15]：注入的目标包括“exfiltrating private data via downstream tool calls, taking misaligned actions”。建议用结构化输出约束数据流，MCP 工具“always enable tool approvals”，以及“Design workflows so untrusted data never directly drives agent behavior”。
- MetaMask agent 规则 [18]：签名载荷里如果出现用户没给过的 URL 或合约地址、出现 `permit` / `approve` / `setApprovalForAll`，必须先提醒用户；不是 agent 自己构造的 calldata，要先 `mm decode`。
- **事件（只有二手报道）：**
  - Freysa（Base）[16]：2024-11-22 上线。经过 195 名参与者的 482 次尝试，有人改写了 `approveTransfer` 的语义，让 agent 交出约 $47K 奖池。这是公开的对抗游戏，本来就是在测诱导转账。
  - AIXBT [17]：2025-03-18，攻击者通过“dashboard access”发出两条恶意提示，让其“simulation wallet”转出约 55.5 ETH（约 $106K）。维护者称“not a result of agent manipulation”。所以这是**控制面被入侵**，不是纯粹的提示注入，不能当作“外部内容诱导”的例子。
- GPT 资料里“外部内容不能成为修改钱包策略、更新收款地址的授权来源”这句话，Anthropic 页面没有说，是 GPT 自己的推论（见 §5）。

### 2.2 持续运行、幂等、会话过期、撤销后仍有效
**答案：** 一手文档已经承认这几类问题。共同点是：**撤销或暂停 agent，不会自动作废已经签出去、但还没上链的授权。**
**依据：**
- 持续运行：TWAK 的 DCA / 限价自动化只有在 `twak serve --watch` 运行时才会执行，“Without `--watch`, your automations are saved but never run” [20]。
- 幂等：MetaMask 规定 x402 每个资源只付一次，“never retry a payment automatically”；`AWAITING_MFA` 期间不能重复执行同一条命令 [18]。x402 的 `settlement_pending` 对账机制见 §1.1 [4]。AP2 规定被拒之前不能再出示新的 open mandate [7]。
- 已签授权在撤销后仍然有效：EIP-3009 授权在 `validAfter < now < validBefore` 时间窗内任何人都能提交，失效只能靠调用 `cancelAuthorization`，或等窗口过期 [21]。MetaMask 写明 Permit2 等签名目前不计入 24 小时 outflow 额度，没有经过它后端提交的交易，统计也可能不准 [19]。由 [19][21] 推出（inferred）：暂停 agent 之后，已经签出的 3009 / Permit2 授权和已有的 allowance 仍可被执行，停机流程里必须包含 cancel 或 revoke。
- 会话过期：Phantom MCP 收到 401 / 403 会自动重新认证并重试工具调用 [42]，这对“不能重试付款”的规则是一个需要留意的交互点（speculative：没有核实它是否覆盖付款类工具）。

---

## §3 活动场景与需求证据（brief 问题 4）

### 3.1 需求数据
**答案：** 公开数据显示，真实付费规模很小，而且刷量占比高。“交易笔数”和“注册数”都不能直接当需求证据。
**依据：**
- Artemis x402 页面（页面标注“Updated as of Oct 19, 2026”，经搜索引擎抓取，直接打开是 JS 渲染）[22]：近 24 小时 101.7K 笔、$44.2K、平均每笔 $0.40；累计卖方 12.8K、买方 776.2K；30 天交易数 −45.88%。Artemis 的板块页专门有“Real vs. Gamed Transactions（Genuine demand vs. wash trading across x402 and MPP）”图表 [23]，说明数据方自己就把刷量单独拆出来。
- Artemis 2025-12 报告的数字只看到二手转述 [24]：截至 12 月约 48% 的交易笔数、81% 的交易金额与“gamed volume”直接相关。同一篇还提到不同统计方对 30 天量的口径差距很大：x402.org 约 $24M，Allium 约 $3M，Artemis 低于 $2M。2026-03 的二手报道 [25]：日均约 $28K、平均约 $0.20、约一半是自刷。
- ERC-8004：8004scan 在 2026-10-21 显示 819,538 个 agent [26]（首页写“across 29 chains”）。首页最新注册的条目反馈数和星标全为 0，而且是同一平台批量注册。由此推出（inferred）：注册数主要反映接入，不反映被使用或被信任。
- Virtuals ACP：没有查到一手数据，未纳入。

### 3.2 适合 agent 还是确定性 bot
**答案：** 没找到一手来源直接给出“agent 做什么、bot 做什么”的划分。现有证据只能支持一个推论：时延敏感、目标固定的任务不适合把 LLM 放进执行环路。
**依据：** arXiv 2605.19337 的综述 [43] 指出，深度检索带来的时延“can introduce latency that is incompatible with high-frequency or rapid mid-frequency strategies”。AP2 要求校验必须由确定性代码完成 [7]。x402 默认流程同样是确定性代码验签、结算 [1]。
**不确定之处：** “agent 选目标、bot 执行”的分工（GPT §3.5、§5）是观点，没有实证，台账里标 speculative。

---

## §4 Mantle（brief 问题 6）

**答案：** 链层基础件大多已经具备：7702 已经启用，4337 有现成的 bundler / paymaster，ERC-8004 注册表已部署，USDC 和 USDT0 都实现了 EIP-3009。x402 在 Mantle 上缺的是“生产结算路径”（官方没有列出 Mantle facilitator，也没有默认资产），以及钱包侧的覆盖。主流 agentic wallet 里，文档列出 Mantle 的只有 MetaMask（没有 Transaction Shield）和 OKX。

**依据：**
- **EIP-7702：** Mantle v2 v1.3.1 Skadi 升级“enable … all features of the Ethereum Prague upgrade”，包含“EIP-7702: Supports `SetCode TX`” [29]。主网生效日期 2025-08-27 只有二手来源（Messari、CoinCarp）[30]。
- **ERC-4337：** Pimlico 支持链列表里 Mantle（5000）标注“EIP-7702 support: ✅”，EntryPoint V06 / V07 / V08 的 bundler 和 paymaster 都支持，V09 只有 bundler [31]。Mantle 官方文档的 AA 页列出 Etherspot 和 Particle [32]。
- **ERC-8004：** 官方合约仓库 README 列出 Mantle 主网 IdentityRegistry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`、ReputationRegistry `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`，与其它链地址相同 [27]。Mantle 在 2026-02-16 发布新闻稿宣布部署 [28]。
- **稳定币与 EIP-3009（读浏览器 API，见 §命令）：**
  - USDC `0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9`：合约是 `FiatTokenProxy`，实现合约 `0x9aff718F2A4Ed4c310D6D2dA0d2FB30a5F6a9dDc`。ABI 里有 `transferWithAuthorization`、`receiveWithAuthorization`、`permit`，**只有 v,r,s 一种签名形式，没有 `bytes signature` 重载** [33]。源码路径里带 `mantle-contracts/` 的 remapping。
  - USDT0 `0x779Ded0c9e1022225f8E0630b35a9b54bE713736`（地址来自 USDT0 官方 Mantle 页 [35]）：合约是 `TransparentUpgradeableProxy`，浏览器报告的实现合约是 `0x1EC7df9e74bE05cb5A456ACa2DC1AC2CeC9AB6A3`。ABI 里 `transferWithAuthorization`、`receiveWithAuthorization`、`cancelAuthorization`、`permit` 都**同时有 v,r,s 和 bytes 两种重载** [34]。x402 默认资产表里 Stable 链的 USDT0 用的是同一个地址，标注为 EIP-3009 [2]。
- **钱包覆盖：**
  - MetaMask：列出 Mantle 5000，Transaction Shield 为 “No”；在这类链上没有威胁扫描，Guard Mode 仍然检查地址白名单 [37]。
  - Coinbase Agentic Wallet CLI：支持 Base、Base Sepolia、Polygon、Solana、Solana Devnet，**没有 Mantle** [38]。CDP 支持网络页写 x402 的 CDP facilitator 只支持 Base，自建 facilitator 可以用于任何 EVM 链（经搜索引擎抓取）[39]。
  - Binance Agentic Wallet：支持 BSC、Ethereum、Base、Solana，**没有 Mantle**（页面 2026-10-15 修改）[40]。
  - OKX Agentic Wallet：支持网络表里 Mantle（5000）的 Agentic Wallet 列为 ✓（经搜索引擎抓取，直连被拦截）[41]。
  - Phantom MCP：支持 Solana、Ethereum、Bitcoin（Sui 已弃用），**没有列出 Mantle** [42]。
- 由 [33] 推出（inferred）：Mantle USDC 的 EIP-3009 只接受 v,r,s 签名，ERC-1271 智能账户（包括 session key 账户）没法直接用这个代币走 x402 的 EIP-3009 路径，只能用 EOA 或 7702 账户的 ECDSA 签名，或者改走 Permit2。USDT0 有 bytes 重载，理论上可行，但没有实测。

**不确定之处：** USDT0 的代理可能已经升级过，我没有读 EIP-1967 实现槽，“当前实现”的结论以浏览器字段为准。Mantle 上 Permit2（`0x000000000022D473030F116dDEE9F6B43aC78BA3`）和 `x402ExactPermit2Proxy` 是否已部署，没有核实。x402scan 是否统计 Mantle 网络，也没有查到。

---

## 统一维度对比
本路不是产品类路，按要求可以不填。钱包对 Mantle 的支持情况汇总在 §4 “钱包覆盖”。

---

## 来源
1. **PRIMARY** https://docs.x402.org/schemes/overview（2026-10-21）：四种 scheme 和三种 payment flow 的语义与默认值。
2. **PRIMARY** https://docs.x402.org/core-concepts/network-and-token-support（2026-10-21）：EIP-3009 / Permit2、生产检查清单、默认资产表里没有 Mantle、x402.org facilitator 只支持测试网。
3. **PRIMARY** https://docs.x402.org/dev-tools/facilitators（2026-10-21）：facilitator 列表（非穷举），没有点名 Mantle。
4. **PRIMARY** https://docs.x402.org/core-concepts/facilitator（2026-10-21）：facilitator 不托管资金；`settlement_pending` 对账；Solana 重复结算问题。
5. **PRIMARY** https://eips.ethereum.org/EIPS/eip-8004（2026-10-21）：Draft；付款不在范围内；存在 Sybil 风险；每链单例。
6. **PRIMARY** https://eips.ethereum.org/EIPS/eip-8183（2026-10-21）：Draft；6 状态机；evaluator 是信任点；没有仲裁。
7. **PRIMARY** https://ap2-protocol.org/ap2/specification/（2026-10-21）：v0.2；两类 Mandate 加 Receipt；确定性代码的 MUST；不限定支付工具。
8. **PRIMARY** https://eips.ethereum.org/EIPS/eip-7715（2026-10-21）：Draft；`wallet_requestExecutionPermissions`。
9. **PRIMARY** https://eips.ethereum.org/EIPS/eip-7710（2026-10-21）：Draft；`redeemDelegations`；建议先模拟。
10. **PRIMARY** https://eips.ethereum.org/EIPS/eip-4337（2026-10-21）：Final；paymaster；192 位 key + 64 位 sequence 的 nonce。
11. **PRIMARY** https://eips.ethereum.org/EIPS/eip-7702（2026-10-21）：Final；协议层不能实现权限系统。
12. **PRIMARY** https://docs.stripe.com/payments/machine/mpp（经搜索引擎抓取，2026-10-21）：MPP 由 Stripe 与 Tempo 合著，走 402 流程。
13. **PRIMARY** https://docs.tempo.xyz/learn/tempo/machine-payments（经搜索引擎抓取，2026-10-21）：MPP 不绑定支付通道；已提交 IETF。
14. **PRIMARY** https://www.anthropic.com/research/prompt-injection-defenses（2026-10-21）：攻击成功率数据；“No browser agent is immune”。
15. **PRIMARY** https://developers.openai.com/api/docs/guides/agent-builder-safety（经搜索引擎抓取，2026-10-21）：注入目标与防护建议。
16. 二手 https://cointelegraph.com/news/crypto-user-convinced-ai-bot-transfer-47k（2026-10-21）：Freysa 事件，482 次尝试、约 $47K。
17. 二手 https://www.theblock.co/news/regulation/2025-03-18-ai-crypto-bot-aixbt-lost-eth-hack-unauthorized-dashboard-access-346911 ；https://cointelegraph.com/news/hacker-breaches-ai-crypto-bot-aixbt-steals-55-eth（2026-10-21）：AIXBT，2025-03-18，55.5 ETH，dashboard 被入侵。
18. **PRIMARY** https://docs.metamask.io/agent-wallet/agent-rules/（2026-10-21）：确认表；x402 不自动重试；可疑载荷提醒。
19. **PRIMARY** https://docs.metamask.io/agent-wallet/reference/outflow-policy/（2026-10-21）：Permit2 签名不计入额度；不经后端的交易统计不准。
20. **PRIMARY** https://developer.trustwallet.com/developer/agent-sdk/cli-reference（2026-10-21）：自动化必须有 watcher 才会运行。
21. **PRIMARY** https://docs.usdt0.to/technical-documentation/token-features/eip-3009（经搜索引擎抓取，2026-10-21）：EIP-3009 的有效期窗口、`cancelAuthorization`、随机 nonce。
22. **PRIMARY（数据方）** https://classic.artemis.ai/asset/x402（经搜索引擎抓取，页面标注 2026-10-19 更新）：24 小时笔数、金额、平均额，累计买卖方。
23. **PRIMARY（数据方）** https://www.artemis.ai/sectors/agentic-payments（2026-10-21）：有“Real vs. Gamed Transactions”图表（数值是 JS 渲染，没有读到）。
24. 二手 https://www.btcc.com/en-US/square/Cryptopolitan/1580337（2026-10-21）：转述 Artemis 2025-12 报告，48% 笔数、81% 金额为 gamed。
25. 二手 https://www.gate.com/news/detail/x402-protocols-daily-average-trading-volume-is-only-28000-with-about-half-19382138（2026-10-21）：2026-03，日均约 $28K、约一半自刷。
26. **PRIMARY（数据方）** https://8004scan.io/agents（2026-10-21）：819,538 个 agent；最新注册条目反馈为 0。
27. **PRIMARY** https://github.com/erc-8004/erc-8004-contracts README（main 分支，2026-10-21，没有记录 commit）：Mantle 主网注册表地址。
28. **PRIMARY** https://www.prnewswire.com/news-releases/mantle-unlocks-autonomous-economy-with-erc-8004-deployment-302688549.html（2026-10-21）：Mantle 在 2026-02-16 宣布部署 ERC-8004。
29. **PRIMARY** https://docs.mantle.xyz/network/for-node-operators/network-updates/changelogs/mantle-v2-v1.3.1-skadi-upgrade.md（2026-10-21）：Skadi 带来 Prague 特性，包括 EIP-7702。
30. 二手 https://messari.io/intel/event/9dd2fb9c-e248-4654-a55b-0a4fa799ac9a ；https://www.coincarp.com/events/mantle-mainnet-v131-upgrade（2026-10-21）：Skadi 主网 2025-08-27。
31. **PRIMARY** https://docs.pimlico.io/guides/supported-chains（2026-10-21）：Mantle 上的 EntryPoint V06–V09、bundler / paymaster、7702 ✅。
32. **PRIMARY** https://docs.mantle.xyz/network/for-developers/resources-and-tooling/account-abstraction.md（2026-10-21）：Mantle 文档列出的 AA 服务商（Etherspot、Particle）。
33. **PRIMARY（链上数据）** Routescan API，Mantle USDC 的代理与实现 ABI（见 §命令，2026-10-21）。
34. **PRIMARY（链上数据）** Routescan API，Mantle USDT0 的代理与实现 ABI（见 §命令，2026-10-21）。
35. **PRIMARY** https://usdt0.to/ecosystem/mantle（经搜索引擎抓取，2026-10-21）：Mantle 上 USDT0 的合约地址。
36. 社区 https://github.com/puga-labs/x402-mantle-sdk-facilitator（2026-10-21）：非官方的 Mantle x402 自建 facilitator SDK。
37. **PRIMARY** https://docs.metamask.io/agent-wallet/reference/supported-chains/（2026-10-21）：列出 Mantle 5000，Transaction Shield 为 No。
38. **PRIMARY** https://docs.cdp.coinbase.com/agentic-wallet/cli/welcome（2026-10-21）：CLI 支持的网络里没有 Mantle。
39. **PRIMARY** https://docs.cdp.coinbase.com/get-started/supported-networks（经搜索引擎抓取，2026-10-21）：CDP facilitator 只支持 Base；自建可用于任何 EVM 链。
40. **PRIMARY** https://web3.binance.com/en/dev-docs/products/agentic-wallet/introduction（经搜索引擎抓取，2026-10-21）：支持 4 条链，没有 Mantle。
41. **PRIMARY** https://web3.okx.com/onchainos/dev-docs/wallet/supported-networks（经搜索引擎抓取，2026-10-21）：Agentic Wallet 支持 Mantle 5000。
42. **PRIMARY** https://docs.phantom.com/phantom-mcp-server/setup.md（经搜索引擎抓取，2026-10-21）：支持 Solana、Ethereum、Bitcoin；401 / 403 时自动重新认证并重试。
43. arXiv:2605.19337 “Agentic Trading: When LLM Agents Meet Financial Markets” https://arxiv.org/pdf/2605.19337v2（2026-10-21）：检索带来的时延与高频策略不兼容。
44. **PRIMARY** https://corporate.visa.com/en/sites/visa-perspectives/innovation/visa-card-specification-sdk-for-machine-payments-protocol.html（2026-10-21）：Visa 在 2026-03-18 发布 MPP 卡规范和 SDK。

---

## 命令与输出
用 fetch 工具发 HTTP GET（raw 模式）：
1. `GET https://api.routescan.io/v2/network/mainnet/evm/5000/etherscan/api?module=contract&action=getsourcecode&address=0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9`
   → `"ContractName":"FiatTokenProxy"`，`"CompilerVersion":"v0.6.12"`，`"Proxy":"1"`，`"Implementation":"0x9aff718F2A4Ed4c310D6D2dA0d2FB30a5F6a9dDc"`，源码 remapping 里有 `mantle-contracts/=modules/mantle/...`
2. `GET …action=getabi&address=0x9aff718F2A4Ed4c310D6D2dA0d2FB30a5F6a9dDc`
   → ABI 里有 `transferWithAuthorization(from,to,value,validAfter,validBefore,nonce,v,r,s)`（只有 1 个重载）、`receiveWithAuthorization(... v,r,s)`、`permit(... v,r,s)`、`version()`；没有 bytes signature 的重载。
3. `GET …action=getsourcecode&address=0x779Ded0c9e1022225f8E0630b35a9b54bE713736`
   → `"ContractName":"TransparentUpgradeableProxy"`，`"Implementation":"0x1EC7df9e74bE05cb5A456ACa2DC1AC2CeC9AB6A3"`，构造参数里的名称和符号解码为 “USDT0”
4. `GET …action=getabi&address=0x1EC7df9e74bE05cb5A456ACa2DC1AC2CeC9AB6A3`
   → `transferWithAuthorization`、`receiveWithAuthorization`、`cancelAuthorization`、`permit` 都有 v,r,s 和 `bytes signature` 两种重载；另有 `authorizationState`、`TRANSFER_WITH_AUTHORIZATION_TYPEHASH`、`crosschainMint/Burn`、`addToBlockedList`。
5. 失败的请求：`mantlescan.xyz` 返回 403；`explorer.mantle.xyz/api/v2` 超时；`web3.okx.com` 被拦截；`classic.artemis.ai` 是 JS 渲染。Dune MCP 不可用，没有用。

---

## GPT 资料的修正
- §4.1 说 ERC-8004 / 8183 是 Draft，内容正确，但它附的引用是 MetaMask Advanced Permissions 页，引错了来源。实际出处是 [5][6]。
- §4.2 把“外部内容不能成为修改钱包策略、更新收款地址或安装插件的授权来源”挂在 Anthropic 研究页名下。Anthropic 页面只讲浏览器 agent 的注入防护，没有提钱包或策略修改，这是 GPT 的推论。
- §4.1 说 x402 “区分固定价格、按用量、批量结算、托管与退款”，方向正确。但它没说默认 flow 是 `authorization`：先验签、提供资源、之后才结算 [1]，所以“先付款再返回内容”在默认情况下本来就不成立，“谁先承担风险”的问题落在卖方。
- §7.3 说 ERC-4337 “具体部署仍需检查 Mantle 上的 EntryPoint、bundler”，这一点已经可以回答：Pimlico 在 Mantle 支持 V06–V09 [31]；EIP-7702 已经随 Skadi 启用 [29]。GPT 没有给出这些事实。
- GPT 完全没提 Mantle 已在 2026-02-16 宣布部署 ERC-8004 [27][28]。
- §7.4 说“需要针对具体 token 测试”，方向对，但可以说得更具体：Mantle USDC 的 EIP-3009 只有 v,r,s 签名，ERC-1271 智能账户不能直接用 [33]。
- §1.2 / §2.5 关于 BNB Agent Studio 的说法不在本路范围，没有核实。
- §5、§3.5 的场景表和“agent 选目标、bot 执行”是 GPT 的观点，没有来源支撑，台账里标 speculative。
- GPT 没有提供任何需求数据，也没有提到刷量问题。本路用 Artemis 的数据补上了 [22][24]。

---

## 开放问题
- 有没有生产级 facilitator（PayAI、Corbits、Dexter、Solvador 等）实际支持 `eip155:5000`？需要调各家 `/supported` 接口核实。
- Mantle 上 Permit2 和 `x402ExactPermit2Proxy` 是否部署？没有它们，非 3009 代币走不了 x402。
- USDT0 代理当前的实现地址（读 EIP-1967 槽），以及升级后 bytes 重载是否还在。
- ERC-8004 Validation Registry 在 Mantle 上的部署情况，以及 Mantle 链上 8004 的注册数（8004scan 按链筛选）。
- Artemis “real vs gamed” 图表的当前数值，以及刷量的识别方法（需要 Artemis 原报告或 Dune）。
- Google 方面关于提示注入的一手材料（例如 Gemini / Project Mariner 的安全说明），本路没有核实。
- Virtuals ACP 的真实付费数据。

---

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| S1 | x402 定义四种 scheme：exact、upto、batch-settlement、auth-capture（托管后 capture / void / refund） | [1] Payment Schemes 首段（2026-10-21） | observed | |
| S2 | x402 所有 scheme 的默认 flow 是 authorization：handler 前只验签，handler 后才结算 | [1] Payment flows 表（2026-10-21） | observed | |
| S3 | x402 的 facilitator 负责验证和代上链结算，不托管资金，是可选组件 | [4] What is a Facilitator（2026-10-21） | observed | |
| S4 | x402 在 EVM 上用 EIP-3009（有 transferWithAuthorization 的代币）或 Permit2（任意 ERC-20）授权，facilitator 代付 gas | [2] EVM: Asset Transfer Methods（2026-10-21） | observed | |
| S5 | 新 EVM 网络上生产需要确认：代币走 3009 还是 Permit2、有生产结算路径（托管 / 自建 / 自结算）、定价方式 | [2] Production checklist for a new EVM network（2026-10-21） | observed | |
| S6 | x402 默认资产表没有 Mantle（5000）；官方 x402.org facilitator 只支持测试网 | [2] Default Assets 表、x402.org Facilitator 小节（2026-10-21） | observed | |
| S7 | x402 官方 facilitator 列表（非穷举）没有任何一项点名 Mantle | [3] Facilitators 表（2026-10-21） | observed | |
| S8 | x402 结算结果不确定时返回 settlement_pending 加 tx hash，重试时对账已广播的交易，防止二次扣款；默认存储只在单进程内有效 | [4] Settlement pending and auto-recovery（2026-10-21） | observed | |
| S9 | 由 S6、S7、S4 推出：x402 在 Mantle 协议层可用，但需要自建或自结算 facilitator，并且用 TokenAmount 显式定价 | 由 S4、S6、S7 推出 | inferred | |
| S10 | ERC-8004 是 Draft（2025-08-13），三个注册表每链单例，原文“Payments are orthogonal” | [5] 头部与 Abstract（2026-10-21） | observed | |
| S11 | ERC-8004 规范承认 Sybil 攻击可以抬高假 agent 的声誉 | [5] Security Considerations（2026-10-21） | observed | |
| S12 | ERC-8183 是 Draft（2026-02-25），定义 6 状态的 job 托管，过期后任何人可以触发退款 | [6] State Machine（2026-10-21） | observed | |
| S13 | ERC-8183：evaluator 可以任意判定完成或拒绝；没有争议仲裁，reject / expire 是终局 | [6] Security Considerations（2026-10-21） | observed | |
| S14 | AP2 当前是 v0.2，用 Checkout Mandate、Payment Mandate 及各自的 Receipt 作为授权和争议证据 | [7] 开头与 Dispute Evidence（2026-10-21） | observed | |
| S15 | AP2 要求各角色的校验和处理“MUST happen in deterministic code”，无论该角色是不是 agent | [7] Agentic vs Non-Agentic（2026-10-21） | observed | |
| S16 | AP2 不限定支付工具，新支付工具通过 Payment Instrument 的 `type` 扩展 | [7] Extension Points › Payment Instrument（2026-10-21） | observed | |
| S17 | AP2 在用户不在场的模式下，open mandate 必须带 agent 公钥，`exp` 建议设为最小值；被拒之前不能再出示新的 open mandate | [7] Autonomous (Human Not Present)（2026-10-21） | observed | |
| S18 | ERC-7715（Draft）定义钱包 RPC `wallet_requestExecutionPermissions`，负责请求和授予权限 | [8] Abstract（2026-10-21） | observed | |
| S19 | ERC-7710（Draft）定义 `redeemDelegations`，负责赎回和链上校验，委托怎么请求不在范围内 | [9] Obtaining Delegations / Overview（2026-10-21） | observed | |
| S20 | ERC-4337 是 Final：paymaster 要在 EntryPoint 存够 ETH；nonce 分成 192 位 key 和 64 位 sequence，每个 key 独立递增 | [10] 头部、nonce 小节、paymaster 流程（2026-10-21） | observed | |
| S21 | EIP-7702 是 Final；规范说协议层无法实现权限系统，权限必须靠委托代码的模块实现 | [11] 头部与 Rationale（2026-10-21） | observed | |
| S22 | MPP 由 Stripe 与 Tempo 合著，走 HTTP 402，不绑定支付通道（Tempo 稳定币、卡、Lightning） | [12] MPP 首段；[13]（经搜索引擎抓取，2026-10-21） | observed | |
| S23 | Anthropic：Claude for Chrome 在自适应攻击下，攻击成功率从 Opus 4.5 单模型的 8.0% 降到加防护后的 1.4%，并称 1% 仍是实质风险 | [14] 图表说明与正文（2026-10-21） | observed | |
| S24 | OpenAI 建议 MCP 工具始终开启审批，并让不可信数据不直接驱动 agent 行为 | [15] Keep tool approvals on / Combine techniques（经搜索引擎抓取，2026-10-21） | observed | |
| S25 | Freysa：2024-11 经过 482 次尝试，被诱导转出约 $47K 奖池（对抗游戏，二手来源） | [16]（2026-10-21） | inferred | |
| S26 | AIXBT：2025-03-18 dashboard 被入侵，经恶意提示转出约 55.5 ETH；维护者称不是 agent 被操纵（二手来源） | [17]（2026-10-21） | inferred | |
| S27 | MetaMask 规则：x402 每个资源只付一次，不自动重试；2FA 等待期间不能重复执行命令 | [18] Confirm before you act / Handle 2FA pauses（2026-10-21） | observed | |
| S28 | MetaMask 的 outflow 额度不计入 Permit2 等签名，不经它后端提交的交易统计不准 | [19] Limitations（2026-10-21） | observed | |
| S29 | TWAK 的自动化只在 watcher（`serve --watch`）运行时执行 | [20] Running automations in the background（2026-10-21） | observed | |
| S30 | EIP-3009 授权在 validAfter 到 validBefore 窗口内都可提交，只能靠 cancelAuthorization 或等过期来失效 | [21] Signed messages / Validity window（经搜索引擎抓取，2026-10-21） | observed | |
| S31 | 由 S28、S30 推出：暂停 agent 不会作废已签出的 3009 / Permit2 授权或已有 allowance，停机流程必须包含 cancel / revoke | 由 S28、S30 推出 | inferred | |
| S32 | Artemis（2026-10-19 更新）：x402 近 24 小时 101.7K 笔、$44.2K、平均每笔 $0.40，30 天交易数 −45.88% | [22] Key Metrics（经搜索引擎抓取，2026-10-21） | observed | |
| S33 | Artemis 板块页单独列出“Real vs. Gamed Transactions”，区分真实需求和 wash trading | [23] 图表标题（2026-10-21） | observed | |
| S34 | Artemis 2025-12 报告：约 48% 的 x402 交易笔数、81% 的金额与 gamed volume 相关（二手转述） | [24]（2026-10-21） | inferred | |
| S35 | 8004scan 在 2026-10-21 显示 819,538 个 ERC-8004 agent，最新注册条目反馈为 0 | [26] Browse Agents（2026-10-21） | observed | |
| S36 | 由 S32–S35 推出：交易笔数和注册数不能直接当作真实付费需求的证据 | 由 S32、S33、S34、S35 推出 | inferred | |
| S37 | LLM 检索带来的时延与高频 / 快速中频策略不兼容（学术综述） | [43] Recall Depth 段（2026-10-21） | observed | |
| S38 | 时延敏感、目标固定的任务（套利、清算、做市）应该交给确定性 bot，agent 负责选目标和设约束 | GPT 资料 §3.5 观点；[43] 只部分支持 | speculative | |
| S39 | Mantle 的 Skadi 升级（v1.3.1）带来 Prague 特性，包括 EIP-7702 SetCode 交易 | [29] Key EIPs 列表（2026-10-21） | observed | |
| S40 | Skadi 在 Mantle 主网的生效日期是 2025-08-27（二手来源） | [30]（2026-10-21） | inferred | |
| S41 | Pimlico 在 Mantle（5000）支持 EntryPoint V06 / V07 / V08 的 bundler 和 paymaster、V09 的 bundler，并标注支持 7702 | [31] Mantle 小节（2026-10-21） | observed | |
| S42 | ERC-8004 的 Identity / Reputation 注册表已部署在 Mantle 主网（0x8004A169… / 0x8004BAa1…），Mantle 于 2026-02-16 宣布 | [27] README Mantle Mainnet；[28]（2026-10-21） | observed | |
| S43 | Mantle USDC（0x09Bc…0dF9）是 FiatTokenProxy，实现合约的 ABI 有 transferWithAuthorization 和 permit，只有 v,r,s 签名形式 | [33] Routescan getsourcecode / getabi（2026-10-21） | observed | |
| S44 | Mantle USDT0（0x779D…3736）的实现合约 ABI 里，transferWithAuthorization / cancelAuthorization 同时有 v,r,s 和 bytes 重载 | [34] Routescan getabi 0x1EC7…；[35] 地址（2026-10-21） | observed | |
| S45 | 由 S43 推出：ERC-1271 智能账户（session key 账户）不能直接用 Mantle USDC 走 x402 的 EIP-3009 路径 | 由 S43、S4 推出 | inferred | |
| S46 | MetaMask Agent Wallet 列出 Mantle 5000，但 Transaction Shield 为 No，没有威胁扫描 | [37] Mainnets 表与说明（2026-10-21） | observed | |
| S47 | Coinbase Agentic Wallet CLI（Base / Polygon / Solana）和 Binance Agentic Wallet（BSC / ETH / Base / Solana）都不支持 Mantle | [38] Capabilities 表；[40]（经搜索引擎抓取，2026-10-21） | observed | |
| S48 | OKX Agentic Wallet 的支持网络表列出 Mantle 5000 | [41]（经搜索引擎抓取，2026-10-21） | observed | |
| S49 | Phantom MCP 只列出 Solana、Ethereum、Bitcoin（Sui 已弃用），没有 Mantle | [42] Setup › Features（经搜索引擎抓取，2026-10-21） | observed | |
| S50 | 由 S9、S39、S41、S42、S44、S46–S49 推出：Mantle 链层基础件大多具备，缺的是 x402 生产 facilitator 和钱包侧覆盖 | 由 S9、S39、S41、S42、S44、S46、S47、S48、S49 推出 | inferred | |

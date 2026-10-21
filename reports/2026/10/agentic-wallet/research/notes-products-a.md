# notes-products-a — MetaMask 与 Coinbase / Base

lane = `products-a`，台账前缀 `A`。访问日期统一为 2026-10-21。
注：本文件按运行时指定路径写出；应落到 `reports/2026/10/agentic-wallet/research/notes-products-a.md`（由上级会话搬运）。

---

## §1 MetaMask Agent Wallet

**答案。** 两个阶段：2026-06-08 以 CLI 开放 Early Access（限量），2026-08-06 正式上线（GA）。用户给的推文（status 2110426474071097697）**不是**上线公告，而是 2026-10-14 前后“Agent Wallet 已接入某个 bot”的公告（AiCoin 称是 Grok Bot）。入口是 `mm` CLI 加 agent skills，文档里没有 MCP server。密钥有两种模式：server-wallet 放在服务端 TEE；bring-your-own-wallet（BYOK）用环境变量里的助记词在本地签名。Guard Mode 的白名单和 24 小时流出额度以 YAML 存在 server wallet 上，由服务端执行；“每次转账、swap、签名、x402 前都要用户确认”只是 skill / 文档里给 agent 的规则。Mantle（5000）在列，但 Transaction Shield 为 No，也就是没有威胁扫描和 Transaction Protection。

**依据。**
- 发布时间线：6 月 8 日的新闻稿写“available today via CLI for a limited group … early access … general availability coming this summer”[9]；8 月 6 日的博文写“officially launches today”，页面 `datePublished` 为 2026-08-06，`dateModified` 为 2026-09-16 [8]。8 月 6 日官方推文“now live for everyone”[13]，按 snowflake ID 解码约为 2026-08-06 14:00 UTC（见 §命令与输出）。
- 用户推文：X 返回 403，正文读不到。搜索摘录的标题是“The MetaMask Agent Wallet is now live on @bot. backed by the same security …”[12]；snowflake 解码约为 2026-10-14 17:44 UTC。AiCoin（二手，2026-10-15 02:49，应为 UTC+8）报道“launched on Grok Bot”[14]。“@bot”具体指哪个账号未核实。
- 入口：`mm` CLI 来自 `@metamask/agent-wallet`，底层是 `@metamask/agent-sdk` [1]；skill 用 `npx skills add MetaMask/agent-skills` 安装，规则的权威版本在 skill 里 [4]；SKILL.md 的 frontmatter 是 `version: "7.10.0"`、`cliVersion: "7.3.0"` [11]。MCP 只出现在“为 x402 收费的 MCP tool 付款”这一场景 [11]，文档没有 Agent Wallet 自己的 MCP server [6]。
- 密钥：server-wallet 的说法是“Keys are managed and secured server-side in a trusted execution environment (TEE) … You retain self-custody”；BYOK 的说法是“You supply a BIP-39 mnemonic … signed locally and then submitted as jobs”，助记词放在 `MM_MNEMONIC`，可以用 `MM_PASSWORD` 加密 [1]。TEE 供应商：Decrypt（二手）说用的是 Cubist 的 TEE [15]；官方推文摘录写“Built with … @cubistdev @awscloud”[13]。
- 交易模式（[2] Comparison 小节）：Guard 包含威胁扫描、网络 / 地址 / 代币接收方白名单和滚动 24h 流出额度；Beast 只有威胁扫描。需要 2FA 的情形：Guard 下是恶意交易、高风险合约、白名单之外的操作、提高额度；Beast 下只有恶意交易和高风险合约。切换到 Beast 要 2FA，切回 Guard 立即生效；非交互环境默认 Guard。原文是“Guard Mode allowlists and outflow limits are stored as policy YAML on the server wallet”，通过 `mm wallet policy get/set/template` 管理 [2]。“For bring your own wallet, the CLI labels policy-based 2FA as coming soon”[2]。
- 服务端异步流程：提交、模拟、威胁扫描、评估策略，需要时进入 `AWAITING_MFA`，再在 MetaMask Mobile 或审批邮件里批准 [1]。
- 流出额度口径 [3]：签名前模拟出美元价值，交易成功提交后计入滚动 24h；10 USDC→ETH→DAI 计为 10 + 10 美元。计入范围是转账、swap、存款（Uniswap / Polymarket / Hyperliquid）。限制：不经 MetaMask 后端提交的交易统计不精确；模拟不了时退回白名单；“Signatures (for example, Permit2) are not included … as of now”。只对 Guard Mode 下的 server-wallet 生效。
- Agent 规则 [4]：转账、原始交易、消息签名、typed-data 签名、swap / bridge、x402、perps、预测市场、earn、插件安装都要展示参数并得到用户明确的 yes。x402 是“Make one attempt per resource and never retry a payment automatically”。`AWAITING_MFA` 期间“Don't run the same command again”。SKILL.md 还写了“Autonomous auto-pay is not supported”，并在 frontmatter 里称“server-enforced access controls including MFA approval, configurable wallet policies, and trading-mode guards … independently of the agent”[11]。
- x402 [7]：由 skill 自带的 `scripts/x402_pay.py` 完成，不是 `mm` 子命令。流程是先 `inspect`，再 `pay --confirm`；只支持 `exact` scheme 加 EIP-3009，不支持 Permit2、`upto` 和非 EVM。脚本无状态，“rerunning `pay` … authorizes a new debit. Guard repeated calls at the caller”。server-wallet 的 Guard Mode 允许 EIP-712 签名。
- 执行 [1]：ERC-20 转账或 swap 时，如果原生币余额不够付 gas，就自动走 EIP-7702 gasless relay，“deducts fees from the transferred ERC-20 token”；在符合条件的链和账户上用 ERC-7821 把 approve 和交易打包成一次原子 `execute()`，不支持时退回顺序提交；另外有 Smart Transactions（MEV 保护，视链而定）。安全通过的合格交易享有 Transaction Protection，上限 $10,000/月。
- 能力 [6]：转账、签名和原始交易、calldata 解码、swap / bridge、Hyperliquid perps、Polymarket 预测市场、earn（含 Aave）、x402、行情数据、npm 插件。
- 支持链 [5]：网页表格只有 Network / Chain ID / Transaction Shield 三列。Mantle 那一行是 `Mantle | 5000 | No`；测试网有 `Mantle Sepolia | 5003`。说明文字：“On chains marked No, threat scanning is unavailable … Transaction Protection coverage doesn't apply. In Guard Mode, transactions are still checked against your address allowlist … not a replacement for threat scanning”。gas relay（`relaySupported`）和 swap / predict / perps（`features`）只能从 `mm chains list --json` 读，网页上没有逐链列出。
- 私钥导出：8 月 6 日 GA 博文的 FAQ 写“can export their Secret Recovery Phrase at any time”[8]；10 月 8 日 quickstart 的 FAQ 写“Can I export my wallet when using server wallet? No, not as of this writing.”[10]。两者矛盾，以较新的为准，但仍需核实。

**不确定之处。** Mantle 上 relay、swap、earn 是否可用（要跑 `mm chains list --json`，本路没有 shell）；BYOK 模式下服务端是否仍做威胁扫描并能拦截；EIP-3009 形式的 x402 付款是否计入流出额度（文档没写，按“签名不计入”推测不计入）；增加白名单项是否也要 2FA（规则只说“mode or policy change returns `pending_approval`”）；用户推文里的“@bot”具体是谁。

## §2 MetaMask Smart Accounts Kit — Advanced Permissions

**答案。** 它和 Agent Wallet 不是同一个产品。Advanced Permissions 是 Smart Accounts Kit 给 dapp / agent 用的 SDK 能力：通过 ERC-7715 `wallet_requestExecutionPermissions` 向 MetaMask 扩展用户请求权限，由 session account 按 ERC-7710 赎回；用户账户必须先升级成 MetaMask smart account，限制由链上 caveat enforcer 合约执行。

**依据。**
- [16]：要求 MetaMask v13.23.0 及以上；signer 可以是 wallet、single key / multisig 或 account signer；session account 可以是 smart account 或 EOA，“doesn't contain tokens”；“The MetaMask user … must be upgraded to a MetaMask smart account”；文中写“enable dapps (and AI agents) to request permissions … via the MetaMask extension”，并给出人类可读的确认 UI。
- 权限类型 [17]：ERC-20 allowance、periodic、stream；原生币 allowance、periodic、stream；token approval revocation（只有 Kit 支持，扩展尚不支持）。
- 链上执行 [18][19]：caveat enforcer 是 Delegation Framework 里的合约，有 `beforeAllHook / beforeHook / afterHook / afterAllHook` 四个 hook，条件不满足就 revert；“Without caveat enforcers, a delegation has infinite and unbounded authority”；“do not guarantee a final state post-redemption”。现成的有 `ERC20PeriodTransferEnforcer`、`ERC20StreamingEnforcer`、`AllowedTargetsEnforcer`、`AllowedMethodsEnforcer`、`BlockNumberEnforcer` 等。

**不确定之处。** 每种 Advanced Permission 具体映射到哪个 enforcer，文档没有逐一写出；按名称推测 periodic 对应 `ERC20PeriodTransferEnforcer`（inferred）。Agent Wallet 的文档没有引用 ERC-7715 / 7710（按缺失推断）。是否支持 Mantle 本路没有查。

## §3 Coinbase CDP Agentic Wallet

**答案。** 发布日期：官方博文页面标的是 2026-02-11；Decrypt 说“Tuesday”发布，即 2026-02-10，两者相差一天。有两种形态：CLI（`awal` + skills）能转账、在 Base 上交易、做 x402；MCP（`@coinbase/payments-mcp` + 配套钱包应用）只能发现并支付 x402 服务，不能 send 或 trade。私钥留在 Coinbase 基础设施里，发布博文写的是 TEE / enclave。限额分单笔和单会话两种，另有 KYT 和 OFAC 筛查；但文档没有说限额在哪一层执行。支持的网络是 Base、Polygon、Solana（含测试网），不支持 Mantle。

**依据。**
- 两种形态对比 [20]：表里 MCP 一栏的 Send & trade 写着“No (MCP agents discover and pay for services only)”。
- CLI [21][22]：网络是 Base、Base Sepolia、Polygon、Solana、Solana Devnet；“Trading is only available on Base mainnet”；“Private keys stay in Coinbase infrastructure”；“Spending limits | Configurable caps per session and per transaction”；KYT 加 OFAC，“blocked before submission onchain”；用邮箱 OTP 登录；需要 Node 24+。
- skills [23]：authenticate、fund、send-usdc、trade、search-for-service、pay-for-service、monetize-service；每个 skill 带“Allowed Tools: Commands the agent can run without prompting”。`awal x402 pay <url>` 的写法是“auto-pays”，`--max-amount` 是可选参数 [24]。
- MCP [25][26]：支持 Base、Polygon、Solana 上的 USDC；“Max per call / Max per session”在钱包 UI 里手动设置，“Agents respect these limits but can't change them”；gas 由平台代付（sponsored）；非托管，钱包绑定邮箱，恢复要靠邮箱；退款取决于服务商。
- Bazaar：CLI 用 `awal x402 bazaar search` [22]；钱包应用有 Discover 标签页，另有 MCP 工具 `list-bazaar-resources`（据 CDP llms.txt 的列表）[26]。
- 发布博文 [29]（直接抓取返回 403，内容来自搜索服务对官方页面的摘录）：“February 11, 2026”；“Session caps … Transaction limits … Enclave isolation … KYT”；“non-custodial wallets secured in Trusted Execution Environments (TEEs)”。Decrypt / Yahoo（二手）写“Coinbase launched Agentic Wallets on Tuesday”[30]。
- Policies 与 Spend Permissions [28]：Spend Permissions 是“Onchain via smart contracts”，只管 EVM 上的代币支出，可用于 CDP 项目之外的账户，合约 Spend Permission Manager 地址为 `0xf85210B21cC50302F477BA56686d2019dC9b67Ad`，主网有 Arbitrum、Avalanche、Base、Ethereum、Optimism、Polygon。Policies 是“Off-chain via Coinbase TEE infrastructure”，适用于任何交易类型，覆盖 EVM 和 Solana，只限 CDP 项目内的账户。

**不确定之处。** Agentic Wallet 的单笔 / 会话限额是用 CDP Policies、别的服务端逻辑还是链上合约执行，文档没有说明（标 speculative）。CLI 的限额在哪里设置（UI 还是命令）没查到。Agentic Wallet 能否导出私钥，文档没写；CDP 的通用 import / export 文档只针对 SDK 钱包 [34]。文档里“Self-custody wallet controlled by the agent”[21] 和“Coinbase-managed wallet”[27] 两种说法并存。

## §4 Base / Coinbase Wallet 的账户级产品

**答案。** Base 文档已经把 Base Account SDK 和 Base MCP 迁到 CDP，分别改名为 Coinbase Wallet SDK（包名仍是 `@base-org/account`）和 Wallet MCP；“Coinbase Wallet (formerly known as Base App)”。Wallet MCP 是一个远程 MCP（`https://wallet-mcp.coinbase.com`），连接的是用户自己的 Coinbase Wallet，可以 send、swap、签名、发起合约调用和 x402 付款，并且“Every write action requires your approval”（通过 approvalUrl 逐笔批准）。Spend Permissions 是链上的受限授权。所以 Coinbase 一侧实际有三条路径：独立预算钱包（Agentic Wallet）、主钱包逐笔批准（Wallet MCP）、主账户链上受限授权（Spend Permissions）。

**依据。** [31] 迁移说明；[32] Wallet MCP 时序图（approvalUrl + requestId，再查 get_request_status）；[33] Coinbase Wallet SDK 提到 Recurring Payments、Base Pay；[28] 的用例里列了“Agentic payments”。

**不确定之处。** Sub Accounts 现在的文档位置和状态没有核实（旧 URL 已改成迁移页）；Recurring Payments 是否基于 Spend Permissions 没查；Wallet MCP 支持哪些链也没查。

---

## 统一维度对比

| 维度 | MetaMask Agent Wallet：server-wallet | MetaMask Agent Wallet：BYOK | MetaMask Advanced Permissions | Coinbase Agentic Wallet（CLI / MCP） | Coinbase Wallet MCP / Spend Permissions |
|---|---|---|---|---|---|
| 入口 | `mm` CLI + skills；没有 MCP server（§1） | 同左 | SDK（Smart Accounts Kit）+ MetaMask 扩展 | CLI：`npx awal` + skills；MCP：`@coinbase/payments-mcp` + 钱包应用 | Wallet MCP：远程 MCP + skill；Spend Permissions：CDP SDK |
| 账户模式 | 独立预算钱包（agent 专用地址） | 用户自带助记词的独立钱包 | 主账户受限授权 | 独立预算钱包 | Wallet MCP：主钱包、逐笔批准；Spend Permissions：主账户受限授权 |
| 密钥托管 | 服务端 TEE（二手来源称 Cubist） | 本地：环境变量里的助记词，可选加密 | 用户 smart account 加 session account 的密钥（由 dapp / agent 持有） | Coinbase 基础设施 TEE / enclave | 用户的 Coinbase Wallet（passkey）；spender 自持密钥 |
| 策略执行层 / 谁能改 | 服务端 YAML 策略和 2FA；Guard 下改策略、提额、切到 Beast 都要 2FA；“必须确认”属于 skill 规则（§1） | 基于策略的 2FA 是“coming soon”；流出额度不适用 | 链上 caveat enforcer；由用户签名授权，只能撤销 | 单笔 / 会话上限加 KYT / OFAC；具体在哪一层执行未说明；MCP 的上限只能在 UI 里改 | Wallet MCP：每笔用户批准；Spend Permissions：链上合约 |
| 能力范围 | 转账、签名、swap / bridge、perps（Hyperliquid）、Polymarket、earn、x402、插件 | 同左 | 由权限类型限定的 ERC-20 / 原生币转账、approval revocation | CLI：USDC send、Base 上交易、x402 付款与收款；MCP：只有 x402 | Wallet MCP：send、swap、签名、合约调用、x402；Spend Permissions：只管代币支出 |
| 默认人工确认 | 规则要求事前确认；服务端只在越界或被标记时触发 2FA | 规则要求事前确认 | 授予时确认一次，之后不再确认 | x402 `pay` 自动付款；MCP 写着“automatic payments” | Wallet MCP：每笔写操作都要批准 |
| gas | 原生币不足时走 EIP-7702 relay，从 ERC-20 扣费；ERC-7821 批处理 | relay 是否覆盖 BYOK 未核实 | 由 session account 或 paymaster 承担 | 在 Base 上“gasless”；MCP 由平台代付 | 创建和撤销可用 CDP paymaster |
| 退出与恢复 | 导出说法矛盾（§1） | 助记词本来就在用户手里 | 可撤销授权 | 绑定邮箱，通过邮箱恢复；能否导出未知 | 用户自持 |
| 支持链 / Mantle | 23 条主网含 Mantle 5000，但 Shield = No；relay / swap 未核实 | 同左 | 本路未查 | 不支持 Mantle | Spend Permissions 不支持 Mantle；Wallet MCP 未查 |
| 已知边界 / 绕过路径 | Permit2 等签名不计入额度；不经后端提交的交易计量不准；多跳会重复计数；Beast 模式没有白名单；x402 脚本无状态，可能重复扣款 | 助记词在 agent 主机上，没有服务端额度 | enforcer 不保证最终状态；没有 caveat 就等于无限授权 | 限额执行层不透明；auto-pay | 无 |
| 发布日期 | EA 2026-06-08 / GA 2026-08-06 | 同左 | 本路未查 | 2026-02-11（博文日期）/ 02-10（二手来源） | 本路未查 |

---

## 来源

1. **PRIMARY** https://docs.metamask.io/agent-wallet/reference/architecture/ — 2026-10-21。证明了：CLI 与 SDK 的关系、两种钱包模式、TEE、EIP-7702 relay、ERC-7821、异步 2FA 流程、$10k/月保障。
2. **PRIMARY** https://docs.metamask.io/agent-wallet/reference/trading-modes/ — 2026-10-21。证明了：Guard / Beast 的对比表、策略 YAML 存在 server wallet、模式切换规则、BYOK 的 2FA 标为 coming soon。
3. **PRIMARY** https://docs.metamask.io/agent-wallet/reference/outflow-policy/ — 2026-10-21。证明了：流出额度的口径、多跳重复计数、Permit2 签名不计入、不经后端提交时计量不精确。
4. **PRIMARY** https://docs.metamask.io/agent-wallet/agent-rules/ — 2026-10-21。证明了：哪些操作要事前确认、x402 不得自动重试、`AWAITING_MFA` 期间不得重复提交。
5. **PRIMARY** https://docs.metamask.io/agent-wallet/reference/supported-chains/ — 2026-10-21。证明了：Mantle 5000 那一行 Transaction Shield 为 No，以及 No 的含义；relay / features 只在 CLI 输出里。
6. **PRIMARY** https://docs.metamask.io/agent-wallet/ — 2026-10-21。证明了：能力列表。
7. **PRIMARY** https://docs.metamask.io/agent-wallet/guides/pay-for-apis-x402/ — 2026-10-21。证明了：x402 脚本、EIP-3009、不支持的 scheme、无状态。
8. **PRIMARY** https://metamask.io/news/introducing-metamask-agent-wallet — 2026-10-21。证明了：2026-08-06 正式上线；FAQ 说可以随时导出 SRP（与 [10] 矛盾）；FAQ 里还残留 EA 时期的说法。
9. **PRIMARY** https://metamask.io/news/metamask-launches-agent-wallet-giving-ai-agents-full-defi-access-with-default-security-on-every-transaction — 2026-10-21，内容来自搜索服务对官方页面的摘录。证明了：2026-06-08 以 Early Access 形式通过 CLI 发布。
10. **PRIMARY** https://metamask.io/news/metamask-agent-wallet-quickstart — 2026-10-21（2026-10-08 发布）。证明了：server-wallet 目前不能导出。
11. **PRIMARY** https://github.com/MetaMask/agent-skills/blob/main/skills/metamask-agent-wallet/SKILL.md — 2026-10-21，main 分支，frontmatter `version 7.10.0 / cliVersion 7.3.0`；没有取到 commit hash 和行号。证明了：“Autonomous auto-pay is not supported”、确认规则、“server-enforced access controls”的表述。
12. **PRIMARY**（未能读到）https://x.com/MetaMask/status/2110426474071097697 — 2026-10-21 抓取返回 403；只拿到搜索摘录标题“now live on @bot”。
13. **PRIMARY**（搜索摘录）https://x.com/MetaMask/status/2085365793441685614 — 2026-10-21。证明了：“now live for everyone”，以及“Built with … @cubistdev @awscloud”。
14. 二手：https://www.aicoin.com/en/news-flash/axdhcdod — 2026-10-21。证明了：2026-10-15 报道 Agent Wallet 接入 Grok Bot。
15. 二手：https://decrypt.co/370239/metamask-launches-ai-agent-wallet-security-controls — 2026-10-21（搜索摘录）。证明了：EA 约 200 名用户；TEE 来自 Cubist。
16. **PRIMARY** https://docs.metamask.io/smart-accounts-kit/concepts/advanced-permissions/ — 2026-10-21。证明了：ERC-7715 / 7710 流程、需要 smart account、需要扩展 v13.23.0+。
17. **PRIMARY** https://docs.metamask.io/smart-accounts-kit/get-started/supported-advanced-permissions/ — 2026-10-21。证明了：7 种权限类型及各自的最低版本。
18. **PRIMARY** https://docs.metamask.io/smart-accounts-kit/concepts/delegation/caveat-enforcers/ — 2026-10-21。证明了：链上 hook 与 revert；没有 caveat 就是无限授权；enforcer 不保证最终状态。
19. **PRIMARY** https://docs.metamask.io/smart-accounts-kit/reference/delegation/caveats/ — 2026-10-21。证明了：各 enforcer 合约的名称。
20. **PRIMARY** https://docs.cdp.coinbase.com/agentic-wallet/welcome — 2026-10-21。证明了：CLI 与 MCP 的能力差异。
21. **PRIMARY** https://docs.cdp.coinbase.com/agentic-wallet/cli/welcome — 2026-10-21。证明了：网络、密钥隔离、单笔 / 会话限额、KYT / OFAC。
22. **PRIMARY** https://docs.cdp.coinbase.com/agentic-wallet/cli/quickstart — 2026-10-21。证明了：命令列表；交易只在 Base 主网；bazaar search。
23. **PRIMARY** https://docs.cdp.coinbase.com/agentic-wallet/cli/skills/overview — 2026-10-21。证明了：7 个 skill；“Allowed Tools … without prompting”。
24. **PRIMARY** https://docs.cdp.coinbase.com/agentic-wallet/cli/skills/pay-for-service — 2026-10-21。证明了：`x402 pay` 自动付款，`--max-amount` 可选。
25. **PRIMARY** https://docs.cdp.coinbase.com/agentic-wallet/mcp/welcome — 2026-10-21。证明了：MCP 的能力和网络；“Agents don't have access to sensitive actions”。
26. **PRIMARY** https://docs.cdp.coinbase.com/agentic-wallet/mcp/faq — 2026-10-21。证明了：UI 里设限、agent 不能改；gas 代付；非托管；通过邮箱恢复；Bazaar Discover。
27. **PRIMARY** https://docs.cdp.coinbase.com/x402/agentic-accounts/agentic-wallet — 2026-10-21。证明了：“Coinbase-managed wallet”的表述。
28. **PRIMARY** https://docs.cdp.coinbase.com/wallets/using-wallets/spend-permissions — 2026-10-21。证明了：Policies（链下 TEE）与 Spend Permissions（链上）的区别、合约地址、支持网络。
29. **PRIMARY**（直接抓取 403，内容为搜索摘录）https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets — 2026-10-21。证明了：博文日期 2026-02-11；TEE / enclave；session / 单笔上限；KYT。
30. 二手：https://finance.yahoo.com/news/morning-minute-coinbase-gives-ai-130926345.html（Decrypt，2026-02-12）— 2026-10-21。证明了：“launched … on Tuesday”。
31. **PRIMARY** https://docs.base.org/base-account/improve-ux/sub-accounts — 2026-10-21。证明了：Base Account SDK / Base MCP 迁到 CDP 并改名。
32. **PRIMARY** https://docs.cdp.coinbase.com/ai-agents/coinbase-for-agents/wallet-mcp — 2026-10-21。证明了：Wallet MCP 的能力，以及每笔写操作都要批准。
33. **PRIMARY** https://docs.cdp.coinbase.com/coinbase-wallet/overview — 2026-10-21。证明了：Coinbase Wallet 即原 Base App；SDK 仍是 `@base-org/account`。
34. **PRIMARY**（搜索摘录）https://docs.cdp.coinbase.com/wallets/using-wallets/import-and-export — 2026-10-21。证明了：CDP SDK 钱包可以在 TEE 端到端加密的前提下导入导出；没有提到 Agentic Wallet。

## 命令与输出

本路没有 shell 工具，下面是手工换算，结果已复核一遍，未用程序验证。
- X snowflake 换算公式：`ts_ms = (id >> 22) + 1288834974657`。
  - `2110426474071097697 >> 22 ≈ 503164881246`，得 1791999855903 ms，约为 **2026-10-14 17:44 UTC**（用户给的推文）。
  - `2085365793441685614 >> 22 ≈ 497189949380`，得 1786024924037 ms，约为 **2026-08-06 14:02 UTC**（“live for everyone”推文），与 8 月 6 日的 GA 博文一致。
- `mm chains list --json` 没有运行，所以 Mantle 的 `relaySupported` / `features` 仍未知。

## GPT 资料的修正

- 只写了“MetaMask 2026-08-06 正式上线”，漏掉 2026-06-08 的 Early Access 阶段；用户给的推文（约 2026-10-14）是接入 bot 的公告，不是上线公告。
- “10 USDC→ETH→DAI **可能**累计计算两次”：文档的写法是确定的，就是计为两笔各 $10，不是“可能”。
- “Coinbase Agentic Wallet 于 2026-02-10 发布”：官方博文页面标的是 2026-02-11，Decrypt 称“Tuesday”（02-10），两者有一天出入，不能直接当定论。
- “MCP 版本并不把 CLI 的所有转账、交易能力都开放”：说轻了，文档原话是 MCP 完全没有 send / trade。
- 遗漏了 Coinbase Wallet MCP（原 Base MCP）：它能转账、swap、发起合约调用，每笔都要用户批准，是第三条路径。
- “Server-wallet 尚不支持导出”（10/8 指南）属实，但 GA 博文 FAQ 写的是“可随时导出 SRP”，资料没有指出这一矛盾。
- “官方 agent 规则仍要求确认”属实，但没有点明这是 skill / 提示层面的规则，服务端只在越界或被标记时才强制 2FA；x402 的 `--confirm` 也是由 agent 自己传的。
- EIP-7702 relay 有前提条件：只在 ERC-20 转账或 swap、且原生币余额不足时触发；资料写得泛化了。
- 资料说 Mantle 那一行写明了“Guard Mode 的地址白名单仍可使用”：这句在页面上是对所有 No 链的通用说明，不是 Mantle 行的单独内容；此外页面没有 relay / swap 列。

## 开放问题

1. Mantle 上的 `relaySupported` 和 `features`（swap / earn 等），要用 CLI 实测。
2. BYOK 模式下是否仍有服务端威胁扫描，以及扫描能否拦截。
3. MetaMask 的 x402 付款（EIP-3009 签名、由 facilitator 结算）是否计入流出额度。
4. Coinbase Agentic Wallet 的限额执行层（CDP Policies 还是其它服务端逻辑），以及 CLI 的限额在哪里配置。
5. Coinbase Agentic Wallet 能否导出私钥。
6. 用户推文正文和“@bot”具体是谁（X 返回 403）。
7. Advanced Permissions 是否支持 Mantle，以及每种权限对应哪个 enforcer。

---

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| A1 | MetaMask Agent Wallet 于 2026-06-08 通过 CLI 开放 Early Access，面向限量用户 | [9] 新闻稿正文（2026-10-21） | observed | |
| A2 | MetaMask Agent Wallet 于 2026-08-06 正式上线（GA） | [8] 博文正文与 datePublished；[13] “live for everyone”（2026-10-21） | observed | |
| A3 | 用户提供的推文约发于 2026-10-14，内容是 Agent Wallet 接入某个 bot（据二手来源为 Grok Bot），不是上线公告 | [12] 搜索摘录标题；snowflake 换算（§命令与输出）；[14] 二手（2026-10-21） | inferred | |
| A4 | Agent Wallet 的入口是 `mm` CLI（@metamask/agent-wallet，底层 @metamask/agent-sdk）加 MetaMask/agent-skills | [1] CLI and session；[4] 开头（2026-10-21） | observed | |
| A5 | Agent Wallet 文档没有提供自己的 MCP server；MCP 只出现在“给 x402 收费的 MCP tool 付款”中 | [6] Capabilities；[11] 命令表（2026-10-21） | inferred | |
| A6 | server-wallet 的密钥在服务端 TEE；BYOK 用 MM_MNEMONIC 里的 BIP-39 助记词在本地签名后提交 job | [1] Wallet modes（2026-10-21） | observed | |
| A7 | server-wallet 的 TEE 由 Cubist 提供 | [15] Decrypt 二手；[13] 推文摘录“Built with @cubistdev”（2026-10-21） | inferred | |
| A8 | Guard Mode 包括威胁扫描和网络 / 地址 / 代币接收方白名单及滚动 24h 流出额度；Beast Mode 只有威胁扫描 | [2] Guardrails 表（2026-10-21） | observed | |
| A9 | Guard 下恶意、高风险、白名单外和提额都要 2FA；Beast 下只有恶意和高风险要 2FA | [2] Requires 2FA approval 表（2026-10-21） | observed | |
| A10 | Guard Mode 的白名单和流出额度以策略 YAML 存在 server wallet 上，通过 `mm wallet policy set` 修改 | [2] Wallet policy（2026-10-21） | observed | |
| A11 | 切换到 Beast 要 2FA，切回 Guard 立即生效；非交互环境下 `mm init` 默认 Guard | [2] Switch modes / Set your trading mode（2026-10-21） | observed | |
| A12 | BYOK 的“policy-based 2FA”标为 coming soon，流出额度只适用于 Guard 下的 server-wallet | [2] 开头；[3] 第一节（2026-10-21） | observed | |
| A13 | BYOK 模式下助记词在 agent 所在主机上，没有服务端额度约束；能读环境变量的 agent 进程理论上能拿到密钥 | 由 A6、A12 推出 | inferred | |
| A14 | 流出额度在交易成功提交后按模拟出的美元价值计入；10 USDC→ETH→DAI 计为两笔各 $10 | [3] How outflow is calculated（2026-10-21） | observed | |
| A15 | Permit2 等签名不计入流出额度；不经 MetaMask 后端提交的交易计量不精确；模拟不了时退回白名单 | [3] Limitations（2026-10-21） | observed | |
| A16 | 以 EIP-3009 签名、由第三方 facilitator 结算的 x402 付款很可能不计入流出额度 | 由 A15、A20 推测；文档没有直接写 | speculative | |
| A17 | agent 规则要求转账、原始交易、签名、swap / bridge、x402、perps、预测市场、earn、插件安装前都展示参数并得到用户明确同意 | [4] Confirm before you act（2026-10-21） | observed | |
| A18 | x402 每个资源只尝试一次、不得自动重试；“Autonomous auto-pay is not supported” | [4] 表格 x402 行；[11] Confirmation Requirements（2026-10-21） | observed | |
| A19 | 事前确认是 skill / 文档层面的规则，服务端只在越界或被标记时强制 2FA | 由 A9、A17、A20（`--confirm` 由 agent 传入）推出 | inferred | |
| A20 | MetaMask 的 x402 由 skill 内的 x402_pay.py 实现，`pay --confirm`；只支持 exact + EIP-3009；脚本无状态，重跑就会新扣一笔 | [7] Steps / Supported / Idempotency（2026-10-21） | observed | |
| A21 | ERC-20 转账或 swap 时原生币不足，会自动走 EIP-7702 relay，手续费从所转 ERC-20 中扣 | [1] Gasless execution（2026-10-21） | observed | |
| A22 | 在符合条件的链上用 ERC-7821 把 approve 和交易合成一次原子 execute()，不支持时顺序提交 | [1] ERC-7821 batch execution（2026-10-21） | observed | |
| A23 | 能力包括转账、签名、swap / bridge、Hyperliquid perps、Polymarket、earn（含 Aave）、x402、插件 | [6] Capabilities（2026-10-21） | observed | |
| A24 | 支持链表中 Mantle 一行为 chain ID 5000、Transaction Shield = No；另列 Mantle Sepolia 5003 | [5] Mainnets / Testnets 表（2026-10-21） | observed | |
| A25 | Shield = No 的链没有威胁扫描、不适用 Transaction Protection，Guard Mode 只剩地址白名单作为基本防护 | [5] Chains without Transaction Shield support（2026-10-21） | observed | |
| A26 | 支持链网页没有 gas relay 或 swap 列，逐链的 relaySupported / features 只在 `mm chains list --json` 里 | [5] List supported chains / Product coverage（2026-10-21） | observed | |
| A27 | 安全通过的合格交易享有 Transaction Protection，上限 $10,000/月 | [1] Transaction Protection（2026-10-21） | observed | |
| A28 | 能否导出私钥，官方说法矛盾：GA 博文 FAQ 说可随时导出 SRP，10/8 指南说 server-wallet 目前不能导出 | [8] FAQ；[10] FAQ（2026-10-21） | observed | |
| A29 | Advanced Permissions 属于 Smart Accounts Kit：通过 ERC-7715 请求、由 session account 按 ERC-7710 赎回，用户须升级为 MetaMask smart account | [16] ERC-7715 technical overview（2026-10-21） | observed | |
| A30 | 权限类型有 ERC-20 allowance / periodic / stream、原生币 allowance / periodic / stream、token approval revocation（仅 Kit 支持） | [17] 表格（2026-10-21） | observed | |
| A31 | 委托由链上 caveat enforcer 合约执行，不满足就 revert；没有 caveat 即无限授权，enforcer 也不保证最终状态 | [18] Important / Hooks（2026-10-21） | observed | |
| A32 | Advanced Permissions 和 Agent Wallet 是两个产品：一个是 dapp SDK 加扩展、链上执行，一个是 CLI 加服务端策略 | 由 A4、A10、A29、A31 推出 | inferred | |
| A33 | Coinbase Agentic Wallet 的官方博文日期是 2026-02-11，二手报道称“Tuesday”（02-10）发布 | [29] 博文日期；[30] 二手（2026-10-21） | observed | |
| A34 | Agentic Wallet 有 CLI（awal + skills）和 MCP（payments-mcp）两种；MCP 不能 send / trade，只能发现并支付服务 | [20] Which should I use 表（2026-10-21） | observed | |
| A35 | CLI 支持 Base、Base Sepolia、Polygon、Solana、Solana Devnet，交易只在 Base 主网；MCP 支付覆盖 Base、Polygon、Solana；都不含 Mantle | [21] Capabilities；[22] Note；[25] What is（2026-10-21） | observed | |
| A36 | Agentic Wallet 的私钥留在 Coinbase 基础设施内，发布博文写的是 TEE / enclave 隔离 | [21] Security；[29] Smart Security Guardrails（2026-10-21） | observed | |
| A37 | Agentic Wallet 有单笔和单会话上限，并做 KYT 与 OFAC 筛查，在上链前拦截 | [21] Capabilities / Security（2026-10-21） | observed | |
| A38 | MCP 版的单次 / 单会话上限只能由用户在钱包 UI 设置，agent 改不了 | [26] How do spending limits work（2026-10-21） | observed | |
| A39 | Agentic Wallet 的限额在 Coinbase 服务端或 TEE 执行，不在链上 | 文档没有说明执行层；参照 [28] Policies 的描述推测 | speculative | |
| A40 | CLI 的 `x402 pay` 默认自动付款，`--max-amount` 可选；skill 声明了可免提示运行的 Allowed Tools | [24] Examples / Options；[23] Skill structure（2026-10-21） | observed | |
| A41 | 默认流程上，Coinbase 的 x402 付款不需要逐笔人工确认，而 MetaMask 规则要求逐笔确认 | 由 A18、A38、A40 推出 | inferred | |
| A42 | x402 服务发现靠 Bazaar：CLI 是 `awal x402 bazaar search`，MCP 钱包应用有 Discover 标签 | [22] 命令表；[26] How do I find services（2026-10-21） | observed | |
| A43 | CDP Policies 在 Coinbase TEE 里链下执行，只管 CDP 项目内账户；Spend Permissions 由链上合约执行，只管 EVM 代币支出 | [28] Spend Permissions vs Policies（2026-10-21） | observed | |
| A44 | Spend Permission Manager 合约地址为 0xf852…67Ad，主网覆盖 Arbitrum、Avalanche、Base、Ethereum、Optimism、Polygon，不含 Mantle | [28] Supported networks（2026-10-21） | observed | |
| A45 | Agentic Wallet MCP 的 gas 由平台代付；钱包为非托管，绑定邮箱，靠邮箱恢复 | [26] How much does it cost / Is this custodial / lose access（2026-10-21） | observed | |
| A46 | Base Account SDK 和 Base MCP 已迁到 CDP，改名为 Coinbase Wallet SDK 和 Wallet MCP；Coinbase Wallet 即原 Base App | [31] What Changed；[33] 开头（2026-10-21） | observed | |
| A47 | Wallet MCP 连接用户的 Coinbase Wallet，可 send、swap、签名、合约调用和 x402，每笔写操作都要用户通过 approvalUrl 批准 | [32] 开头与时序图（2026-10-21） | observed | |
| A48 | Coinbase 有三条不同的 agent 路径：独立预算钱包（Agentic Wallet）、主钱包逐笔批准（Wallet MCP）、主账户链上受限授权（Spend Permissions） | 由 A34、A43、A47 推出 | inferred | |

# notes-products-b — Binance / BNB Chain 与 OKX

调研路：B（lane = `products-b`，台账前缀 `B`）。访问日期：全部 2026-10-21。
方法说明：web3.binance.com / developers.binance.com 页面被 AWS WAF 挡住直连，web3.okx.com / okx.com 直连被拦截（内网地址解析），这些页面的正文通过搜索服务抓取的页面内容读取（逐字摘录见下文引文），不是浏览器直读；GitHub 源码与 bnbchain.org、Altana、Turnkey、Trust Wallet 文档为直接抓取。未做真实资金测试，未运行 `baw` / `onchainos` CLI。

---

## 问题 1：Binance Agentic Wallet（Binance Wallet 产品）

**答案：** 2026-04-24 发布；是建在用户 Binance 账户下、与主 MPC 钱包分开的独立 Keyless 钱包（独立余额），用 Secure Auto Sign 授权后不再逐笔确认。安全规则（各类日限额、代币范围、高风险处理、地址簿白名单）只能在 Binance App 里改，agent 只能读，规则在 Binance API 层执行；默认只开放“验证过的业务操作”，不能发任意交易，消息签名只允许 EIP-712，私钥不能导出；Developer Mode 是唯一例外，只能在 App 开、会过期、有单独日限额，并且每笔都要预览加明确确认。支持链里没有 Mantle。

**依据：**
- 发布与账户关系：公告“Published on 2026-04-24 12:00”，“A separate Keyless Wallet created under a user’s Binance account … dedicated balance … keeping your main Binance Wallet fully separate”；“once authorised, allows transactions to execute without individual transaction confirmations”；“operates as an isolated wallet, separate from your existing Binance MPC Wallet” [1]。创建前提是先在 App 里建好 MPC Wallet，Agentic Wallet 建在其上 [4][5]。
- MPC keyless：“Your private key is never fully reconstructed on any single device or server. The AI Agent cannot directly hold or transfer your keys.” [3]
- 规则与执行层：“Set your daily limit, tradable token scope, and high-risk transaction handling in the Binance App. These rules constrain the Agent at the API level.” [3]；“Security rules can only be configured in the Binance App — the AI can read them but cannot modify them.” [5]；Security & Settings 页：通过 Agent 只能查询配置，不能修改 [7]。
- 更细的控制（Binance Blog）：skill 级模块开关，关掉的场景 agent 无法访问；“There's no single overall cap: Dex Swap & Transfer, DeFi, x402, and Developer Mode each have their own 24-hour quota”；“Agents can only transfer to addresses in your whitelist address book, plus your own UID keyless wallet … you cannot disable the restriction”；风险分 ≥4 的交易推送到 App 确认或自动拒绝；48 小时无活动自动登出，可在 App 冻结钱包 [8]。
- 配对与来源核验：App 内核对 6 位配对码，查看请求来源（OS / IP / 位置），新 IP 会告警；勾选 “I agree to enable Secure Auto Sign”；再勾选三项安全确认（二维码由自己的 agent 生成、官方 skills、可信环境）[4]。
- 默认能力范围：“Only supported operations can be performed — swap, transfer, limit order, prediction market, tokenized securities, DeFi. Arbitrary transaction initiation is not available by default.”；“Message signing is restricted to EIP-712 structured data … personal_sign / eth_sign, EIP-191 is not supported”；“Private keys cannot be exported.”；SIWE 登录、空投领取、白名单登记等 personal_sign 流程都无法完成 [2]。Skill 还路由 x402 支付（`x402-payment preview/sign`）、授权查看与撤销、限价单、预测市场、DeFi 存取 [9]。
- Developer Mode：开关 “exists only in the Binance App … neither the CLI nor the web can turn it on”；加入任意合约调用（EVM `to`+calldata / Solana 未签名交易）与自建 EIP-712（如 Permit / Permit2）；有单独日限额（`devMode.dailyLimit`，与主 dailyLimit、预测、DeFi、x402 额度互相独立）、会过期（`devMode.expiresAt`）、高风险直接拦截、每笔预览加明确确认 [2][6]。Blog 补充：默认关闭；单独 24h 额度默认 1,000 USDT，可调到 5,000 / 10,000 / 50,000 USDT；钱包余额超过 10,000 USDT 时不能开启，运行中超过会自动关闭；外部交易必须先链上模拟，模拟失败就拒签 [8]。
- 入口：`npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet`，skill 会自动装 `baw` CLI（npm `@binance/agentic-wallet`）[3][9]；Binance Ai Pro 内置 [1]。公告称还能接 “CLI, MCP, Skills, and OpenAPI workflows” [1]，但开发文档只写了 skills + CLI。
- 链：开发文档写 “Current version supports 4 major networks” [3]；skill 仓库 `wallet chains` 的**示例响应**列出 BSC、Ethereum、Solana、Base、Arbitrum、Polygon、Robinhood 七条链 [10]。两处都没有 Mantle。
- gas：发布活动期间（2026-04-24 12:00 至 2026-05-09 11:59 UTC）gas 全额赞助，每个地址最多 20 笔，总量上限 200,000 笔 [1]；skill 有 `wallet gas-price`、speed-up、cancel 等 gas 相关命令 [9]。
- 默认人工确认分三层：（a）产品层：SAS 授权后不逐笔确认 [1]；（b）服务端：高风险交易按设置推到 App 确认或自动拒绝 [3][8]，Developer Mode 每笔都要确认 [6]；（c）skill 提示词层：“Confirm with the user each time before any state-changing command, unless the user explicitly asks to skip confirmation.” [9]

**不确定之处：**
- 文档写 4 条链，skill 示例写 7 条；实际以 `baw wallet chains` 的返回为准，本次没有运行。
- 公告提到 MCP 与 OpenAPI 入口，开发文档里没有找到对应页面。
- Binance 的 Secure Auto Sign FAQ 摘要写着 “Your private keys are stored in a Trusted Execution Environment (TEE)” [11]，与 Agentic Wallet 页面说的 “MPC keyless” 是什么关系（MPC 分片之一放在 TEE？还是 SAS 另有一套架构？）公开资料没有讲清。我只拿到 FAQ 的搜索摘要，没读到全文。
- 活动结束后 gas 由谁付：没有找到明确说明（推测是用户用原生币付，见台账 B12）。

## 问题 2：BNB Agent Studio（BNB Chain）

**答案：** 这是一个开发者平台，用“一句提示词”把 agent 生成出来，再统一处理部署（AWS AgentCore / Azure / NodeOps）、钱包、模型调用付费（x402）、链上身份（ERC-8004）和任务 / 收款（ERC-8183）。时间线：v1 2026-07-01，v2 2026-08-13（agent 可以收款，加入 Altana），v3 2026-09-03（加入 Turnkey），v4 2026-09-22。钱包后端可以替换：默认是本地加密 keystore；TWAK 是本地加密助记词；Altana 是链上 session key；Turnkey 是在 enclave 内执行策略。BNB Chain 自己的博客写明，应用层真实需求“还有待证明”。

**依据：**
- v1（2026-07-01）：BSC 主网上线；agent 用你充值的钱包自付 LLM 费用，通过 x402 自动充值；每个 agent 有 ERC-8004 链上身份和 ERC-8183 任务接口；底层是 `bnb` CLI、Studio MCP server、BNB Chain SDK、AWS Bedrock AgentCore；同时集成 Trust Wallet AgentKit，作为自托管钱包选项 [23]。产品页路线图把 “MVP Live” 标在 “08 Jun, 2026” [28]，和 7 月 1 日的博客对不上。
- v2（2026-08-13）：对比表写着 “Earning | Agents could pay … | Agents can also be paid”；“Agent Wallet | TWAK | TWAK, plus Altana for permissions verifiable onchain”；新增 TypeScript；测试网 gas 由 Paymaster 代付 [24]。Altana 博客：“the agent acts through scoped session keys, with spending limits, allowlists and time bounds … cannot widen them”，“permissions are registered onchain”，支持 b402 [25]。
- v3（2026-09-03）：Turnkey 成为第三个钱包选项；“Every action passes through a policy engine running inside a secure enclave, which returns ALLOW, DENY, or REQUIRE_CONSENSUS”；超过阈值可以要求人工联签；Altana 钱包可以作为 b402 卖方，由 Binance Pay 担任 facilitator [26]。
- v4（2026-09-22）：新增 NodeOps 部署；支付除 $U 外加入 USDT / USDC / USD1；本地钱包密码改为自动生成 [27]。
- 开发文档（页面日期 2026-08-23）：Wallet 维度 “`evm-local` (default), `twak`, `altana`”（文档没列 Turnkey）；“Signing is fixed code, never an LLM-callable tool”；MCP server 是 “15 read-only chain tools … it never signs”；keystore 放在 `.studio/wallets/`；ERC-8183 只暴露 `negotiate` 和 `notify_funded` 两个有界操作；“Studio manages wallet keys and on-chain funds, and may introduce breaking changes” [29]。
- Altana sessions（原文）：“Permissions are enforced onchain. A session that tries to call a contract outside its allowlist, or spend beyond its cap, reverts at validation time.” 权限维度：`calls`（合约 `to` 和 / 或方法 `signature`，同时写时取 AND）、`spend`（按代币、按滚动周期的上限）、`expiry`；撤销后不能恢复。“**`permissions.calls` omitted = unrestricted.** If you don't pass `calls`, the session can call any contract within its spend cap.” [32]
- Turnkey（原文）：“Never create agents as root users. Root users bypass the policy engine entirely.”；默认拒绝；可以按目标地址、函数选择器 / ABI 参数、金额设限，并设共识规则；删除 agent user 就能立即撤销 [33]。“policy engine runs inside a secure enclave” 这一句出自 BNB v3 博客 [26]；Turnkey 这页写的是 “Keys stay in the secure enclave”，以及 “before the enclave signs”。
- TWAK（原文）：BIP39 助记词用 AES-256-GCM 加密（PBKDF2 派生密钥）后存在 `~/.twak/wallet.json`；签名需要密码，密码来源依次是 `--password` 参数、`TWAK_WALLET_PASSWORD` 环境变量、系统钥匙串 [34]。
- 需求评估原文（BNB Chain Blog，2026-07-16）：“First, the identity base is large but application-level demand, the volume of real work agents pay for, still has to be proven.” 同文：BSC 上约 200,000 个 ERC-8004 agent，约占 26 条链总数的 60%（引用 8004scan，2026-07-16）[30]。2026-05-21 的博客称这些数字 “best read as an early signal”，并写 “The delegated-execution payment path (EIP-3009, x402) is on the roadmap rather than in production today” [31]。

**不确定之处：**
- MVP 日期：路线图写 6 月 8 日，博客写 7 月 1 日。
- 开发文档（8 月 23 日）的钱包枚举里没有 Turnkey，可能只是文档没跟上 v3。
- 对 TWAK 的定位，v2 新闻稿称其适合 “always-on autonomous operation”（Chainwire，二手）[37]，没有链上权限约束；它是否另有 TWAK 自己的策略层，我本路没有核实。
- Studio 是否支持 Mantle：网络维度只有 `bsc-testnet` / `bsc-mainnet` [29]。Turnkey 选项“支持 BSC 以外的链”[26]，但 Studio 层是否开放给 Mantle 没有资料。

## 问题 3：OKX Agentic Wallet（Onchain OS）

**答案：** 2026-03-18 发布，是 Onchain OS 的执行组件。支持邮箱 / Google / Apple 登录（也可用 OKX API Key 登录）；私钥在服务端 TEE 内生成、存储和签名；一个钱包最多派生 50 个子钱包。入口是 skills + `onchainos` CLI，并标称支持 MCP。能力很宽：转账、swap、跨链、限价单、任意合约调用、personalSign 与 EIP-712 签名、授权查看与撤销、模拟与风险分级，以及 x402。策略只有四条（单笔限额、日转账限额、日交易限额、转账白名单），只能由用户在 Web 门户设置。助记词可以在 OKX Wallet App / 插件里导出，但导出后钱包与社交账户解绑，agent 也不能再操作。Agentic Wallet 支持 Mantle（5000），但 Payments 列只有 X Layer 是 ✓。

**依据：**
- 发布：支持中心公告 “officially launching OKX Agentic Wallet on March 18, 2026 … a core component of our Onchain OS”；“nearly 20 networks”；“Gas-free transactions and payments on X Layer”；“Private keys secured inside a TEE” [12]。Learn 文章：“Agents can connect via MCP or CLI”；“Every transaction is simulated first”；“Transactions are risk-graded, with those classified as critical triggering a transaction to be blocked”；Onchain OS 原有 x402 支付等能力 [13]。
- 登录与 TEE：“Log in with email, Google, or Apple … Private key generation, storage, and signing are all completed within a TEE”；“A single wallet can derive up to 50 sub-wallets”；“Zero gas fees for operations on X Layer” [14]。同一账号再次登录会恢复原钱包；也支持 API Key 登录 [15]。
- 工具清单：skill 意图路由覆盖登录 / 余额 / 收款 / 转账 / 合约调用 / 消息签名（personalSign / EIP-712）/ Policy 与导出 / Gas Station / swap / 跨链 / 限价单 / 广播与 gas 估算 / 模拟 / token 与 DApp 安全扫描 / 授权查看与撤销（ERC-20 / Permit2）/ 审计日志 [19]。`wallet contract-call` 接受任意 EVM calldata、Solana 未签名交易、SUI PTB，“with TEE signing + auto-broadcast”；`wallet sign-message` 默认 `personal`（EIP-191）[22]。x402 自动支付见概览页 [18]。
- 策略：“Policy **only** includes the following rules … Per-transaction limit / Daily transfer limit / Daily trade limit / Transfer whitelist”，日额度在 UTC 0:00 重置；邮箱登录用户在 `https://web3.okx.com/portfolio/agentic-wallet-policy` 设置 [21]；“Policy config is completed by the user on the Web portal … The Agent only detects the trigger … it never performs the export itself” [20]。
- 确认机制：后端需要确认时返回 “confirming”（exit code 2），skill 规定用户确认后才带 `--force` 重跑，首次调用不得带 `--force` [19]。`--force` 在 CLI 文档里的描述是 “Re-run after a confirmed Confirming response” [22]；搜索摘录里 main 分支另一版本写作 “Skip confirmation prompts from the backend (default false)”。
- gas：X Layer 链上 gas 免费；后端可以把部分交易标成 gas-free（例如 X Layer AA mode、Solana TEE-sponsored），由服务端决定，其余交易仍需原生币付 gas [19]；Solana 有 Gas Station，可用稳定币付 gas [19]。
- 导出：“Export your seed phrase in the OKX Wallet extension or app. Please note: After export, your wallet will be permanently unlinked from your social account, and the Agent will no longer be able to operate it.” [21]；“The private key … never leaves the TEE — the Agent cannot export or locally sign with it.” [20]
- 链：Supported Networks 表中 Mantle 的 Agentic Wallet 列为 ✓、Wallet API 列为 ✓（ChainIndex 5000）[16]；另一张能力表里 Mantle 的 Payments 列是 “-”，只有 X Layer 是 ✓，BNB / Base / Solana 标 “Coming Soon” [17]。

**不确定之处：**
- GPT 资料引用策略页面称“交易限额不覆盖代币授权之后由第三方发起的转账”。该页面（`/portfolio/agentic-wallet-policy`）需要登录，我没能读到这句原文，所以不采用（台账 B39 标 speculative）。
- 四条策略在哪一层执行（服务端 API？TEE 内？）：公开资料没写。只能确认配置在 Web 门户、TEE 负责签名。
- 后端 “confirming” 门槛可以被持有会话的客户端用 `--force` 重跑越过。这说明这道确认靠的是 skill 规则约束 agent，而不是服务端强制要人确认（推论，见 B35）。不过不清楚 Policy 超限时服务端是直接拒绝，还是也只返回一个可以 `--force` 越过的 confirming。
- 链数口径：发布时写“nearly 20”，现在的网络表 Agentic Wallet 列 ✓ 有 40 多条。

## 问题 4：公开使用数据（只记一手）

**答案：** 三家都没有公开 agentic wallet 自身的钱包数或交易数。能找到的只有：链级 ERC-8004 注册数（BNB Chain 博客引用 8004scan）、OKX Onchain OS 整体的基础设施指标、Binance 发布活动的赞助上限（这是上限，不是使用量）。

**依据：** BSC 上 ERC-8004 agent 超过 200,000 个（2026-07-16）[30]；2026-04-21 的博客称 3 月 10 日单日约 523,000 笔与 ERC-8004 agent 相关的交易（来自 BNB Chain 博客 [30][31] 的引述）；Onchain OS “1.2 billion-plus daily API calls, $300 million in daily trading volume”（这是整个 Onchain OS，不是钱包本身）[13]；Binance 活动总量上限 200,000 笔赞助交易 [1]。一篇学术研究（arXiv，截至 2026-05-13）发现 BSC / Base / Ethereum 上只有 3%–15% 的 ERC-8004 注册带有有效的注册文件和服务端点 [35]。

**不确定之处：** 注册数不等于活跃 agent，更不等于付费需求；8004scan 是第三方聚合，本次没有直接核对。

---

## 统一维度对比

| 维度 | Binance Agentic Wallet | BNB Agent Studio | OKX Agentic Wallet |
|---|---|---|---|
| 入口 | Skills + `baw` CLI；Binance Ai Pro 内置；公告称也接 MCP / OpenAPI（文档未见） | `bag` CLI + IDE skills + 只读 MCP（15 个工具，不签名）+ SDK（Py / TS） | Skills + `onchainos` CLI；官方称 MCP 或 CLI |
| 账户模式 | 独立预算钱包（主 MPC 钱包下的独立 keyless 钱包） | 完整平台（部署 + 钱包 + 支付 + 身份 + 任务）；钱包后端可选 | 独立钱包，嵌在完整平台（Onchain OS）里；最多 50 个子钱包 |
| 密钥托管 | MPC keyless（官方说法）；SAS FAQ 提到 TEE，见 §1 | evm-local 本地加密 keystore（默认）/ TWAK 本地加密助记词 / Altana 智能账户 session key / Turnkey enclave | 服务端 TEE 生成、存储、签名 |
| 策略执行层与谁能改 | Binance API 层；只能在 App 改，agent 只读；Dev Mode 开关也只在 App | Altana：链上校验，管理密钥持有人可改；Turnkey：enclave 策略引擎，root 用户可改且绕过策略；evm-local / TWAK：本地代码（签名是固定代码，不是 LLM 工具） | 用户在 Web 门户设置四条规则；执行层未公开（见 §3） |
| 能力范围 | swap、转账（只能转白名单地址）、限价单、预测市场、代币化证券、DeFi、x402、授权撤销；Dev Mode 下才有任意合约调用和自建 EIP-712；不支持 EIP-191 | 付费调用 LLM 与数据（x402 / b402）、按 ERC-8183 接单收款；链上能力取决于所选钱包 | 转账、swap、跨链、限价单、任意合约调用、personalSign / EIP-712、授权撤销、模拟、风险扫描、x402 |
| 默认人工确认 | SAS 不逐笔确认；风险分 ≥4 按设置推 App 或拒绝；skill 要求每次确认，但用户可明说跳过；Dev Mode 每笔必须确认 | 首页称 “No approvals. No top-ups. Just execution.”；Turnkey 可设阈值联签 | 后端可返回 confirming；skill 要求确认后才带 `--force`；critical 风险拦截 |
| gas 处理 | 发布活动期赞助（每地址 20 笔，共 20 万笔）；之后未写明 | 测试网由 Paymaster 代付；auto-refill 用 $U，称 “gasless” | X Layer 免 gas；后端可把部分交易标为 gas-free；Solana 有 Gas Station |
| 退出与恢复 | 私钥不可导出；可登出撤权；48h 无活动自动登出；App 可冻结 | evm-local / TWAK 用户自持密钥；Altana 管理密钥在用户手里，session 可撤销；Turnkey 删除 agent user 即撤销 | 可在 OKX Wallet App / 插件导出助记词，导出后与社交账户解绑，agent 失效；同账号登录可恢复 |
| 支持链 / Mantle | 文档写 4 条，示例列 7 条（BSC / ETH / SOL / Base / Arb / Polygon / Robinhood）；**不含 Mantle** | 网络只有 BSC 主网 / 测试网；**无 Mantle** | 40 多条链，**含 Mantle 5000**；但 Payments（x402）在 Mantle 是 “-” |
| 已知边界 / 绕过路径 | 不能做 SIWE / 空投签名；四类额度相互独立，没有总上限；限额在 API 层，依赖 Binance 后端 | Altana 不配 `calls` 就可以调用任意合约；Turnkey root 绕过策略；TWAK 密码可以放在环境变量里 | 只有四条策略（没有合约 / 授权维度）；任意 calldata 与 personalSign 默认可用；`--force` 能越过后端确认；授权后第三方扣款是否计入限额未核实 |
| 发布日期 | 2026-04-24 | v1 2026-07-01 / v2 08-13 / v3 09-03 / v4 09-22 | 2026-03-18 |

---

## 来源

1. **PRIMARY** Binance 公告 “Binance Wallet Introduces Agentic Wallet…” https://www.binance.com/en/support/announcement/detail/0c533c5a820341ce87e5ddda76f36ac0 （2026-10-21，经搜索服务抓取正文；镜像 binance.bh 同文）证明：发布日期、独立 keyless 钱包、SAS 不逐笔确认、gas 活动、入口说法。
2. **PRIMARY** Binance Web3 Dev Docs · Introduction https://web3.binance.com/en/dev-docs/products/agentic-wallet/introduction （2026-10-21，搜索抓取）证明：Verified Capabilities Only、只支持 EIP-712、私钥不能导出、Developer Mode 边界。
3. **PRIMARY** Binance Developer Docs · Welcome https://developers.binance.com/en/docs/products/agentic-wallet/welcome （2026-10-21，搜索抓取）证明：MPC keyless 描述、规则在 API 层执行、核心能力、“4 major networks”。
4. **PRIMARY** Binance Web3 Dev Docs · Install https://web3.binance.com/en/dev-docs/products/agentic-wallet/install （2026-10-21，搜索抓取）证明：建在 MPC Wallet 之上、6 位配对码与 OS / IP / 位置核验、SAS 勾选、三项安全确认。
5. **PRIMARY** Binance Developer Docs · Install Agentic Wallet https://developers.binance.com/en/docs/products/agentic-wallet/quickstart/install-agentic-wallet （2026-10-21，搜索抓取）证明：规则只能在 App 配置，AI 只能读；首次设置建议值。
6. **PRIMARY** Binance Web3 Dev Docs · Developer Mode https://web3.binance.com/en/dev-docs/products/agentic-wallet/use-cases/developer-mode （2026-10-21，搜索抓取）证明：Dev Mode 新增能力、独立额度、过期、高风险拦截、两步确认。
7. **PRIMARY** Binance Web3 Dev Docs · Security & Settings https://web3.binance.com/en/dev-docs/products/agentic-wallet/use-cases/security-settings （2026-10-21，搜索抓取）证明：Agent 只能查询配置，不能修改。
8. **PRIMARY** Binance Blog “Agentic Wallet Controls” https://www.binance.com/en/blog/tech/7276731523787720812 （2026-10-21，搜索抓取；发布日期未取得）证明：模块开关、四类独立额度、强制地址簿白名单、Dev Mode 1,000 USDT 默认额度与 10,000 USDT 余额上限、风险分 ≥4、48h 登出、冻结。
9. **PRIMARY** GitHub binance/binance-skills-hub `skills/binance-web3/binance-agentic-wallet/SKILL.md@b402990be1748d02b7b79ab958f278b1709e5de7`（skill v1.13.0）https://github.com/binance/binance-skills-hub （2026-10-21）证明：命令清单（x402、授权、DeFi、合约调用）、“Confirm … unless the user explicitly asks to skip confirmation”。
10. **PRIMARY** 同仓库 `references/wallet-view.md@b402990` （2026-10-21）证明：`wallet chains` 示例列出 7 条链，不含 Mantle；`tx-lock` 的二次确认 5 分钟超时。
11. Binance FAQ “What Is the Secure Auto Sign (SAS) Service…” https://www.binance.com/en/support/faq/detail/90cb7110cf164a9e822edfb9fe6b5108 （2026-10-21，只拿到搜索摘要）证明：SAS FAQ 称私钥存在 TEE（适用对象不明）。
12. **PRIMARY** OKX 支持中心 “OKX Wallet officially launches Agentic Wallet” https://www.okx.com/en-gb/help/okx-wallet-officially-launches-agentic-wallet （2026-10-21，搜索抓取）证明：2026-03-18 发布、nearly 20 networks、X Layer 免 gas、TEE。
13. **PRIMARY** OKX Learn “Introducing OKX Agentic Wallet” https://www.okx.com/learn/agentic-wallet （2026-10-21，搜索抓取；datePublished 2026-03-18）证明：MCP / CLI、先模拟、critical 级风险拦截、Onchain OS 基础设施指标。
14. **PRIMARY** OKX Onchain OS Docs · Agentic Wallet https://web3.okx.com/onchainos/dev-docs/wallet/agentic-wallet （2026-10-21，搜索抓取）证明：邮箱 / Google / Apple 登录、TEE、50 个子钱包、X Layer 零 gas。
15. **PRIMARY** OKX Onchain OS Docs · Authentication https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage （2026-10-21，搜索抓取）证明：社交登录与 API Key 登录、同账号恢复钱包。
16. **PRIMARY** OKX Onchain OS Docs · Supported Networks https://web3.okx.com/onchainos/dev-docs/wallet/supported-networks （2026-10-21，搜索抓取）证明：Mantle 5000 的 Agentic Wallet 列与 Wallet API 列均为 ✓。
17. **PRIMARY** OKX Onchain OS Docs · Supported Networks（能力表）https://web3.okx.com/onchainos/dev-docs/home/supported-chain （2026-10-21，搜索抓取）证明：Payments 列 Mantle 为 “-”，只有 X Layer 为 ✓。
18. **PRIMARY** OKX Onchain OS Docs · Agentic Wallet Overview https://web3.okx.com/onchainos/dev-docs/home/agentic-wallet-overview （2026-10-21，搜索抓取）证明：x402 自动支付、7×24 自动交易定位。
19. **PRIMARY** GitHub okx/onchainos-skills `skills/okx-agentic-wallet/SKILL.md@03463542685174063f8744fb030bff831045af20`（v4.6.5）https://github.com/okx/onchainos-skills （2026-10-21）证明：意图路由与工具清单、confirming / `--force` 规则、服务端决定 gas-free、风险动作优先级。
20. **PRIMARY** 同仓库 `references/wallet.md@0346354`、`references/account-faq.md@0346354` （2026-10-21）证明：Policy 在 Web 门户设置、导出在 App 进行、TEE 签名且 agent 不能导出。
21. **PRIMARY** 同仓库 `references/wallet-portal-actions.md@0346354` （2026-10-21）证明：四条策略规则、UTC 0 点重置、Policy URL、导出后解绑的原文。
22. **PRIMARY** 同仓库 `references/wallet-cli-reference.md@0346354` （2026-10-21）证明：contract-call 接受任意 calldata、TEE 签名后自动广播；sign-message 默认 personal；`--force` 语义。
23. **PRIMARY** BNB Chain Blog “BNB Agent Studio is live on BNB Chain” https://www.bnbchain.org/en/blog/bnb-agent-studio-is-live-on-bnb-chain-ai-agents-from-one-prompt （2026-10-21）证明：v1 日期 2026-07-01、x402 / ERC-8004 / ERC-8183、TWAK。
24. **PRIMARY** BNB Chain Blog “BNB Agent Studio v2” https://www.bnbchain.org/en/blog/bnb-agent-studio-v2-your-agents-your-rules （2026-10-21）证明：v2 日期 2026-08-13、可以收款、加入 Altana、测试网 Paymaster。
25. **PRIMARY** BNB Chain Blog “Altana in BNB Agent Studio” https://www.bnbchain.org/en/blog/altana-in-bnb-agent-studio-agents-with-limits-you-set （2026-10-21）证明：scoped session keys、权限链上注册、可撤销。
26. **PRIMARY** BNB Chain Blog “BNB Agent Studio v3: Turnkey Joins” https://www.bnbchain.org/en/blog/bnb-agent-studio-v3-turnkey-joins-as-a-wallet-option （2026-10-21）证明：v3 日期 2026-09-03、enclave 策略引擎 ALLOW / DENY / REQUIRE_CONSENSUS、人工联签、Binance Pay 担任 b402 facilitator。
27. **PRIMARY** BNB Chain Blog “BNB Agent Studio v4” https://www.bnbchain.org/en/blog/bnb-agent-studio-v4-one-prompt-fewer-steps-to-a-running-agent （2026-10-21）证明：v4 日期 2026-09-22、NodeOps、USDT / USDC / USD1。
28. **PRIMARY** BNB Agent Studio 产品页 https://www.bnbchain.org/en/bnb-agent-studio （2026-10-21）证明：路线图 “08 Jun, 2026 MVP Live”、“No approvals. No top-ups.”、auto-refill $U。
29. **PRIMARY** BNB Chain Docs · BNB Agent Studio https://docs.bnbchain.org/developer-kit/bnbchain-studio （2026-10-21，页面日期 2026-08-23）证明：钱包选项 evm-local / twak / altana、签名是固定代码、MCP 只读、网络只有 BSC。
30. **PRIMARY** BNB Chain Blog “BNB Chain AI Agent Landscape” https://www.bnbchain.org/en/blog/bnb-chain-ai-agent-landscape-agents-tools-and-payments （2026-10-21，文章日期 2026-07-16）证明：“application-level demand … still has to be proven”；约 200,000 个 ERC-8004 agent。
31. **PRIMARY** BNB Chain Blog “Building the Infrastructure Base for the AI Agent Economy” https://www.bnbchain.org/en/blog/bnb-chain-building-the-infrastructure-base-for-the-ai-agent-economy （2026-10-21，文章日期 2026-05-21）证明：“early signal”；EIP-3009 / x402 委托执行支付路径仍在路线图上。
32. **PRIMARY** Altana Docs · Sessions https://docs.altana.network/concepts/sessions （2026-10-21）证明：链上执行、越界即回滚、calls / spend / expiry 三个维度、不配 `calls` 即不限制、撤销后不可恢复。
33. **PRIMARY** Turnkey Docs · Agentic Wallets https://docs.turnkey.com/solutions/company-wallets/agentic-wallets （2026-10-21）证明：non-root agent 用户、root 绕过策略引擎、默认拒绝、共识规则。
34. **PRIMARY** Trust Wallet Developer · Key Management https://developer.trustwallet.com/developer/agent-sdk/key-management （2026-10-21）证明：本地 AES-256-GCM 加密助记词、签名需要密码、密码可来自环境变量或钥匙串。
35. arXiv 2606.26028v3 “Can Trustless Agents Be Trusted? An Empirical Study of the ERC-8004…” https://arxiv.org/pdf/2606.26028v3 （2026-10-21，学术研究，非厂商一手）证明：只有 3%–15% 的注册带有有效服务端点。
36. 已拒用：Bitget News 对 v3 的报道。理由：称 v3 的头条是 TWAK，与官方 v3 博客（Turnkey）矛盾。
37. Chainwire / Benzinga v2 新闻稿 https://www.benzinga.com/content/61283019/bnb-chain-launches-bnb-agent-studio-v2-giving-ai-agents-ability-earn （2026-10-21，BNB Chain 发布的新闻稿，经转载）证明：TWAK 定位为 “always-on autonomous operation”，Altana 定位为可验证边界。

## 命令与输出

- `fetch raw https://web3.binance.com/en/dev-docs/products/agentic-wallet/introduction` → 返回 AWS WAF challenge 页（`AwsWafIntegration.getToken()`），无法直读；改用搜索服务抓取的正文。
- `fetch https://web3.okx.com/...` → `Blocked internal address for web3.okx.com: 169.254.0.2`；改用搜索抓取与 GitHub 源码。
- `GET https://api.github.com/repos/binance/binance-skills-hub/commits?path=skills/binance-web3/binance-agentic-wallet&per_page=1` → sha `b402990be1748d02b7b79ab958f278b1709e5de7`，2026-10-20T08:39:14Z。
- `GET https://api.github.com/repos/okx/onchainos-skills/commits?path=skills/okx-agentic-wallet&per_page=1` → sha `03463542685174063f8744fb030bff831045af20`，2026-10-16T11:28:14Z。
- 未运行 `baw wallet chains` / `onchainos wallet chains`（需要登录账号）。

## GPT 资料的修正

- §2.3 “不支持普通明文消息签名”：正确，但不完整。准确说法是默认只允许 EIP-712，Developer Mode 下也不放开 EIP-191 [2][6]。
- §2.3 “默认只支持经过验证的业务操作”：正确；但 GPT 漏了更关键的几条硬约束：转账只能发往地址簿白名单（不能关闭）、四类额度相互独立没有总上限、Dev Mode 要求余额不超过 10,000 USDT [8]。
- §2.3 “Developer Mode … 使用单独的日限额”：正确；补充默认 1,000 USDT 与可选档位 [8]，以及会过期 [6]。
- §2.3 MPC keyless：与官方开发文档一致 [3]；但 Binance 的 SAS FAQ 提到 TEE [11]，GPT 没有指出这一点，存在未解的架构问题。
- §2.4 “最多 50 个子钱包”“邮箱 / Google / Apple”“TEE”：与一手来源一致 [14]；遗漏了 API Key 登录 [15]。
- §2.4 “交易限额不覆盖代币授权之后由第三方发起的转账”：引用的策略页需要登录，**无法核实**，不采用。
- §2.4 GPT 没提导出：OKX 实际**可以**在 OKX Wallet App / 插件导出助记词，代价是与社交账户永久解绑、agent 失效 [21]。“TEE 托管 = 不能退出”的读法不成立。
- §2.4 “公开能力包括多链交易、模拟、风险分级以及 x402”：正确；但 x402（Payments）在 Mantle 上标 “-” [17]，不能直接推到所有链。
- §2.5 “到 2026-09-03 的 v3 公告，钱包选项已包括 TWAK、Altana 和 Turnkey”：正确 [26]；GPT 把这条挂在 v1 博客链接上，出处错位。另外开发文档（2026-08-23）的默认钱包其实是 `evm-local`，GPT 没提 [29]。
- §2.5 Altana“不配置调用范围可能允许调用任意合约”：原文更确定：“`permissions.calls` omitted = unrestricted” [32]。
- §2.5 Turnkey “root 用户会绕过策略引擎”：原文确认 [33]。“策略在 TEE 中评估”在 Turnkey 这页没有逐字写，出处是 BNB v3 博客 [26]。
- §1.2 “BNB Chain 自己的生态梳理也承认：应用层真实工作需求仍需验证”：原文确认（2026-07-16 Landscape 博客）[30]；GPT 引用的链接是 Coinbase 文档，出处错误。

## 开放问题

1. Binance Agentic Wallet 的 MPC keyless 与 SAS 的 TEE 是什么关系？API 层规则在 MPC 签名前由哪个组件校验？
2. OKX 的四条策略在哪里执行（服务端 API / TEE 内）？超限时是硬拒绝，还是返回可以用 `--force` 越过的 confirming？授权（approve / Permit2）之后第三方转出是否计入限额？
3. Binance 实际支持几条链（4 还是 7），什么时候会加 Mantle？
4. BNB Agent Studio 的 TWAK 选项在运行中能否不经人工、不受链上约束地签名（它被定位为 always-on）？
5. Binance 活动结束后 gas 由谁付；OKX 在 Mantle 上能否走 gas-free 路径。
6. 三家都没有公开钱包级使用数据。

---

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| B1 | Binance Agentic Wallet 于 2026-04-24 发布 | [1] 公告 “Published on 2026-04-24 12:00”（2026-10-21） | observed | |
| B2 | Binance Agentic Wallet 是用户 Binance 账户下独立的 Keyless 钱包，有独立余额，与主 MPC 钱包分开 | [1] 公告正文 “A separate Keyless Wallet … keeping your main Binance Wallet fully separate”（2026-10-21） | observed | |
| B3 | 启用 Secure Auto Sign 后，交易执行不需要逐笔确认 | [1] 公告免责声明 “allows transactions to execute without individual transaction confirmations”（2026-10-21） | observed | |
| B4 | Binance 官方称私钥在任何单一设备或服务器上都不会被完整重建（MPC keyless），agent 不能直接持有密钥 | [3] Welcome “MPC Keyless Security”（2026-10-21） | observed | |
| B5 | 日限额、代币范围、高风险处理在 Binance App 配置，并在 API 层约束 agent | [3] Welcome “You Set the Rules”（2026-10-21） | observed | |
| B6 | Agent 可以读取安全规则但不能修改，修改入口只在 Binance App | [5] Install “Security Recommendations”；[7] Security & Settings（2026-10-21） | observed | |
| B7 | Binance 有四类相互独立的 24h 额度（Swap 与转账、DeFi、x402、Developer Mode），没有总上限 | [8] Binance Blog “Set a daily spend limit”（2026-10-21） | observed | |
| B8 | Binance agent 只能转账到地址簿白名单地址及自己 UID 的 keyless 钱包，这一限制不能关闭 | [8] Binance Blog “Recipient restrictions are permanently enforced”（2026-10-21） | observed | |
| B9 | 连接时要在 App 核对 6 位配对码和请求来源（OS / IP / 位置），并勾选启用 SAS 与三项安全确认 | [4] Install “Step 3: Sign In”（2026-10-21） | observed | |
| B10 | Binance 默认只开放 swap、转账、限价单、预测市场、代币化证券、DeFi 等验证过的操作，不发起任意交易 | [2] Introduction “Verified Capabilities Only”（2026-10-21） | observed | |
| B11 | Binance 消息签名只允许 EIP-712，不支持 personal_sign / eth_sign；SIWE、空投领取等流程无法完成；私钥不能导出 | [2] Introduction；[6] Developer Mode “Supported signature types”（2026-10-21） | observed | |
| B12 | Binance 发布活动期（04-24 至 05-09 UTC）gas 全额赞助，每地址 20 笔，总量 200,000 笔；活动结束后的 gas 承担方未见说明，推测由用户用原生币支付 | [1] 公告 “Limited-Time Gas Sponsorship”（2026-10-21） | speculative | |
| B13 | Developer Mode 只能在 App 开启，agent / CLI / Web 都不能开；会过期；新增任意合约调用与自建 EIP-712；每笔都要预览并明确确认，高风险直接拦截 | [6] Developer Mode 页；[2] Introduction（2026-10-21） | observed | |
| B14 | Developer Mode 有单独 24h 额度，默认 1,000 USDT，可选 5,000 / 10,000 / 50,000；余额超过 10,000 USDT 时不能开启，运行中超过会自动关闭；外部交易必须先模拟 | [8] Binance Blog “Developer Mode: Extra Safeguards”（2026-10-21） | observed | |
| B15 | 风险分 ≥4 的交易按设置推送 App 确认或自动拒绝；48h 无活动自动登出；可在 App 冻结钱包 | [8] Binance Blog “Visibility and Higher-Risk Handling”“Session timeout”（2026-10-21） | observed | |
| B16 | Binance skill 要求每次状态变更前确认，但用户明确要求时可以跳过，这一层确认属于提示词 / skill 层 | [9] SKILL.md@b402990 “Build the Command” 第 4 条（2026-10-21） | observed | |
| B17 | Binance 入口是 skills + `baw` CLI（npm `@binance/agentic-wallet`），Binance Ai Pro 内置 | [3] Welcome “Install”；[9] SKILL.md metadata；[1] 公告（2026-10-21） | observed | |
| B18 | Binance 文档写支持 4 条主网，skill 示例列 7 条（BSC / ETH / Solana / Base / Arbitrum / Polygon / Robinhood），两者都不含 Mantle | [3] Welcome “Chain Support”；[10] wallet-view.md@b402990 `wallet chains`（2026-10-21） | observed | |
| B19 | 由 B18 推出：Binance Agentic Wallet 目前不能在 Mantle 上使用 | 由 B18 推出：两份官方链列表都不含 Mantle（未运行实时 `wallet chains`） | inferred | |
| B20 | 由 B5、B6、B10、B13 推出：Binance 的思路是先在产品层收窄 agent 可签的内容，把规则修改权与危险能力开关留在 agent 接触不到的 App 里 | 由 B5、B6、B10、B13 推出 | inferred | |
| B21 | BNB Agent Studio v1 于 2026-07-01 在 BSC 主网上线，整合 x402 自付 LLM、ERC-8004 身份、ERC-8183 任务接口和 AWS AgentCore 部署，并集成 TWAK | [23] v1 博客 TL;DR 与 “Live Today”（2026-10-21） | observed | |
| B22 | Studio 产品页路线图把 MVP 上线标为 2026-06-08，与 v1 博客的 2026-07-01 不一致 | [28] 产品页路线图；[23]（2026-10-21） | observed | |
| B23 | Studio v2（2026-08-13）让 agent 可以被雇佣并收款，钱包选项新增 Altana | [24] v2 博客对比表（2026-10-21） | observed | |
| B24 | Studio v3（2026-09-03）加入 Turnkey，与 TWAK、Altana 并列；Altana 钱包可以作为 b402 卖方，由 Binance Pay 担任 facilitator | [26] v3 博客 TL;DR（2026-10-21） | observed | |
| B25 | Studio v4（2026-09-22）新增 NodeOps 部署，支付加入 USDT / USDC / USD1 | [27] v4 博客 TL;DR（2026-10-21） | observed | |
| B26 | Studio 文档中默认钱包是 `evm-local`（本地加密 keystore）；签名是固定代码而不是 LLM 可调用的工具；IDE 的 MCP 只有只读工具，不签名；网络只有 BSC 主网和测试网 | [29] docs.bnbchain.org Studio 页 “One runtime, one signer”（2026-10-21） | observed | |
| B27 | Altana session 的权限有调用（合约 / 方法）、按代币滚动周期的支出上限和到期时间三个维度，在链上执行，越界在验证时回滚 | [32] Altana Sessions “Permission shapes”（2026-10-21） | observed | |
| B28 | Altana 原文：不传 `permissions.calls` 等于不限制，session 可以在支出上限内调用任意合约 | [32] Altana Sessions “Notes”（2026-10-21） | observed | |
| B29 | Turnkey 原文：root 用户完全绕过策略引擎，agent 必须是 non-root 用户；策略默认拒绝，可以要求人与 agent 共同批准 | [33] Turnkey Agentic Wallets 第 2–3 步（2026-10-21） | observed | |
| B30 | BNB 称 Turnkey 的策略引擎在安全 enclave 内运行，返回 ALLOW / DENY / REQUIRE_CONSENSUS，独立于 agent 模型 | [26] v3 博客 “Enclave-enforced policy”（2026-10-21） | observed | |
| B31 | TWAK 把 AES-256-GCM 加密的助记词存在本机，签名需要密码；密码可以来自命令行参数、环境变量或系统钥匙串 | [34] TWAK Key Management（2026-10-21） | observed | |
| B32 | BNB Chain 自己写明：身份基数大，但应用层需求（agents 实际付费的工作量）仍有待证明 | [30] Landscape 博客 “Where it is still early”（2026-10-21） | observed | |
| B33 | BNB Chain 博客引用 8004scan：截至 2026-07-16，BSC 上约 200,000 个 ERC-8004 agent，约占 26 条链总数的 60% | [30] Landscape 博客 TL;DR（2026-10-21） | observed | |
| B34 | OKX Agentic Wallet 于 2026-03-18 发布，是 Onchain OS 的核心组件，私钥在 TEE 内 | [12] 支持中心公告（2026-10-21） | observed | |
| B35 | OKX 支持邮箱 / Google / Apple 登录（也可用 API Key），密钥在 TEE 内生成、存储和签名，一个钱包最多派生 50 个子钱包 | [14] Agentic Wallet 文档；[15] Authentication（2026-10-21） | observed | |
| B36 | OKX 的 contract-call 接受任意 EVM calldata / Solana 交易 / SUI PTB，经 TEE 签名后自动广播；sign-message 默认 personalSign（EIP-191），也支持 EIP-712 | [22] wallet-cli-reference.md@0346354（2026-10-21） | observed | |
| B37 | OKX 策略只有四条：单笔限额、日转账限额、日交易限额（UTC 0 点重置）、转账白名单，由用户在 Web 门户设置 | [21] wallet-portal-actions.md@0346354 “Available Policy Rules”（2026-10-21） | observed | |
| B38 | OKX 后端需要确认时返回 confirming（exit 2），由 skill 规定用户确认后才带 `--force` 重跑；因此这道确认靠 skill 规则约束 agent，持有会话的客户端技术上可以越过 | 由 [19] SKILL.md@0346354 “Confirmation”、[22] `--force` 参数推出（2026-10-21） | inferred | |
| B39 | GPT 资料称 OKX 策略页写明“交易限额不覆盖授权后第三方发起的转账”；该页需要登录，原文未能核实 | GPT 资料 §2.4；[21] 中列出的 Policy URL（2026-10-21） | speculative | |
| B40 | OKX 助记词可以在 OKX Wallet App / 插件导出，导出后与社交账户永久解绑、agent 不能再操作；agent 自身不能导出 | [21] wallet-portal-actions.md “User asks about wallet export”；[20] wallet.md “TEE Signing”（2026-10-21） | observed | |
| B41 | OKX 在 X Layer 上免 gas；后端可以把部分交易标为 gas-free，由服务端决定，其余交易仍需原生币付 gas | [14] Core Capabilities；[19] SKILL.md “Backend-sponsored gas-free”（2026-10-21） | observed | |
| B42 | OKX Agentic Wallet 支持 Mantle（ChainIndex 5000） | [16] Supported Networks 表 Mantle 行（2026-10-21） | observed | |
| B43 | OKX 能力表中 Payments 列只有 X Layer 是 ✓，Mantle 为 “-”，BNB / Base / Solana 为 Coming Soon | [17] supported-chain 能力表（2026-10-21） | observed | |
| B44 | 由 B42、B43 推出：OKX agent 可以在 Mantle 上转账和交易，但 Onchain OS 的 x402 支付目前不覆盖 Mantle | 由 B42、B43 推出 | inferred | |
| B45 | OKX 官方称 agents 通过 MCP 或 CLI 接入；每笔交易先模拟，critical 级风险直接拦截 | [13] Learn 文章 “What it does”（2026-10-21） | observed | |
| B46 | OKX 公布的 1.2B+ 日 API 调用和 $300M 日交易量是 Onchain OS 整体指标，不是 Agentic Wallet 的使用量；三家都没有公布钱包级使用数据 | [13] Learn 文章；[1][12] 公告中均无钱包数（2026-10-21） | observed | |
| B47 | 由 B10、B11、B36、B37 推出：Binance 默认能力窄，靠产品层限制操作类型；OKX 默认能力宽（任意 calldata、personalSign），策略只覆盖金额与转账白名单，不覆盖合约或授权维度 | 由 B10、B11、B36、B37 推出 | inferred | |
| B48 | 只有 3%–15% 的 ERC-8004 注册带有有效的注册文件和服务端点，注册数不能当作活跃 agent 数 | [35] arXiv 2606.26028v3 摘要（学术研究，非厂商一手）（2026-10-21） | inferred | |

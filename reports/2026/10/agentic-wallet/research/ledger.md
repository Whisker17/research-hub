# 论断台账

每条会出现在 explainer 里的论断，都要在这里有一行。
类型：observed（直接观察到，有一手证据）/ inferred（由证据推出）/ speculative（推测，需在页面上标明）。

编号前缀对应调研分册：A → [notes-products-a.md](notes-products-a.md)（MetaMask、Coinbase / Base），B → [notes-products-b.md](notes-products-b.md)（Binance、BNB Agent Studio、OKX），C → [notes-products-c.md](notes-products-c.md)（Phantom、Crossmint、TWAK、Safe、Privy / Turnkey / Altana、Stripe Link），S → [notes-stack.md](notes-stack.md)（协议栈、风险、需求数据、Mantle），N → 主会话综合（[notes.md](notes.md)）。证据里的 `[n]` 指该分册“来源”一节的第 n 条。所有网页访问日期均为 2026-10-21。“页面”列在写稿时填写。

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| A1 | MetaMask Agent Wallet 于 2026-06-08 通过 CLI 开放 Early Access，面向限量用户 | [9] 新闻稿正文（2026-10-21） | observed | E |
| A2 | MetaMask Agent Wallet 于 2026-08-06 正式上线（GA） | [8] 博文正文与 datePublished；[13] “live for everyone”（2026-10-21） | observed | E、K |
| A3 | 用户提供的推文约发于 2026-10-14，内容是 Agent Wallet 接入某个 bot（据二手来源为 Grok Bot），不是上线公告 | [12] 搜索摘录标题；snowflake 换算（§命令与输出）；[14] 二手（2026-10-21） | inferred | H、E、S |
| A4 | Agent Wallet 的入口是 `mm` CLI（@metamask/agent-wallet，底层 @metamask/agent-sdk）加 MetaMask/agent-skills | [1] CLI and session；[4] 开头（2026-10-21） | observed | K |
| A5 | Agent Wallet 文档没有提供自己的 MCP server；MCP 只出现在“给 x402 收费的 MCP tool 付款”中 | [6] Capabilities；[11] 命令表（2026-10-21） | inferred | |
| A6 | server-wallet 的密钥在服务端 TEE；BYOK 用 MM_MNEMONIC 里的 BIP-39 助记词在本地签名后提交 job | [1] Wallet modes（2026-10-21） | observed | C、K、F3 |
| A7 | server-wallet 的 TEE 由 Cubist 提供 | [15] Decrypt 二手；[13] 推文摘录“Built with @cubistdev”（2026-10-21） | inferred | |
| A8 | Guard Mode 包括威胁扫描和网络 / 地址 / 代币接收方白名单及滚动 24h 流出额度；Beast Mode 只有威胁扫描 | [2] Guardrails 表（2026-10-21） | observed | K、F8 |
| A9 | Guard 下恶意、高风险、白名单外和提额都要 2FA；Beast 下只有恶意和高风险要 2FA | [2] Requires 2FA approval 表（2026-10-21） | observed | J、F2 |
| A10 | Guard Mode 的白名单和流出额度以策略 YAML 存在 server wallet 上，通过 `mm wallet policy set` 修改 | [2] Wallet policy（2026-10-21） | observed | J、F1 |
| A11 | 切换到 Beast 要 2FA，切回 Guard 立即生效；非交互环境下 `mm init` 默认 Guard | [2] Switch modes / Set your trading mode（2026-10-21） | observed | K |
| A12 | BYOK 的“policy-based 2FA”标为 coming soon，流出额度只适用于 Guard 下的 server-wallet | [2] 开头；[3] 第一节（2026-10-21） | observed | F3 |
| A13 | BYOK 模式下助记词在 agent 所在主机上，没有服务端额度约束；能读环境变量的 agent 进程理论上能拿到密钥 | 由 A6、A12 推出 | inferred | F3 |
| A14 | 流出额度在交易成功提交后按模拟出的美元价值计入；10 USDC→ETH→DAI 计为两笔各 $10 | [3] How outflow is calculated（2026-10-21） | observed | F4 |
| A15 | Permit2 等签名不计入流出额度；不经 MetaMask 后端提交的交易计量不精确；模拟不了时退回白名单 | [3] Limitations（2026-10-21） | observed | B-3、F4 |
| A16 | 以 EIP-3009 签名、由第三方 facilitator 结算的 x402 付款很可能不计入流出额度 | 由 A15、A20 推测；文档没有直接写 | speculative | R |
| A17 | agent 规则要求转账、原始交易、签名、swap / bridge、x402、perps、预测市场、earn、插件安装前都展示参数并得到用户明确同意 | [4] Confirm before you act（2026-10-21） | observed | J、F2 |
| A18 | x402 每个资源只尝试一次、不得自动重试；“Autonomous auto-pay is not supported” | [4] 表格 x402 行；[11] Confirmation Requirements（2026-10-21） | observed | F9 |
| A19 | 事前确认是 skill / 文档层面的规则，服务端只在越界或被标记时强制 2FA | 由 A9、A17、A20（`--confirm` 由 agent 传入）推出 | inferred | J、F2 |
| A20 | MetaMask 的 x402 由 skill 内的 x402_pay.py 实现，`pay --confirm`；只支持 exact + EIP-3009；脚本无状态，重跑就会新扣一笔 | [7] Steps / Supported / Idempotency（2026-10-21） | observed | K、F9 |
| A21 | ERC-20 转账或 swap 时原生币不足，会自动走 EIP-7702 relay，手续费从所转 ERC-20 中扣 | [1] Gasless execution（2026-10-21） | observed | K |
| A22 | 在符合条件的链上用 ERC-7821 把 approve 和交易合成一次原子 execute()，不支持时顺序提交 | [1] ERC-7821 batch execution（2026-10-21） | observed | K |
| A23 | 能力包括转账、签名、swap / bridge、Hyperliquid perps、Polymarket、earn（含 Aave）、x402、插件 | [6] Capabilities（2026-10-21） | observed | K |
| A24 | 支持链表中 Mantle 一行为 chain ID 5000、Transaction Shield = No；另列 Mantle Sepolia 5003 | [5] Mainnets / Testnets 表（2026-10-21） | observed | C、Q、F10 |
| A25 | Shield = No 的链没有威胁扫描、不适用 Transaction Protection，Guard Mode 只剩地址白名单作为基本防护 | [5] Chains without Transaction Shield support（2026-10-21） | observed | Q |
| A26 | 支持链网页没有 gas relay 或 swap 列，逐链的 relaySupported / features 只在 `mm chains list --json` 里 | [5] List supported chains / Product coverage（2026-10-21） | observed | |
| A27 | 安全通过的合格交易享有 Transaction Protection，上限 $10,000/月 | [1] Transaction Protection（2026-10-21） | observed | |
| A28 | 能否导出私钥，官方说法矛盾：GA 博文 FAQ 说可随时导出 SRP，10/8 指南说 server-wallet 目前不能导出 | [8] FAQ；[10] FAQ（2026-10-21） | observed | K |
| A29 | Advanced Permissions 属于 Smart Accounts Kit：通过 ERC-7715 请求、由 session account 按 ERC-7710 赎回，用户须升级为 MetaMask smart account | [16] ERC-7715 technical overview（2026-10-21） | observed | B、K |
| A30 | 权限类型有 ERC-20 allowance / periodic / stream、原生币 allowance / periodic / stream、token approval revocation（仅 Kit 支持） | [17] 表格（2026-10-21） | observed | |
| A31 | 委托由链上 caveat enforcer 合约执行，不满足就 revert；没有 caveat 即无限授权，enforcer 也不保证最终状态 | [18] Important / Hooks（2026-10-21） | observed | J |
| A32 | Advanced Permissions 和 Agent Wallet 是两个产品：一个是 dapp SDK 加扩展、链上执行，一个是 CLI 加服务端策略 | 由 A4、A10、A29、A31 推出 | inferred | |
| A33 | Coinbase Agentic Wallet 的官方博文日期是 2026-02-11，二手报道称“Tuesday”（02-10）发布 | [29] 博文日期；[30] 二手（2026-10-21） | observed | E |
| A34 | Agentic Wallet 有 CLI（awal + skills）和 MCP（payments-mcp）两种；MCP 不能 send / trade，只能发现并支付服务 | [20] Which should I use 表（2026-10-21） | observed | K、F8、P |
| A35 | CLI 支持 Base、Base Sepolia、Polygon、Solana、Solana Devnet，交易只在 Base 主网；MCP 支付覆盖 Base、Polygon、Solana；都不含 Mantle | [21] Capabilities；[22] Note；[25] What is（2026-10-21） | observed | C |
| A36 | Agentic Wallet 的私钥留在 Coinbase 基础设施内，发布博文写的是 TEE / enclave 隔离 | [21] Security；[29] Smart Security Guardrails（2026-10-21） | observed | C |
| A37 | Agentic Wallet 有单笔和单会话上限，并做 KYT 与 OFAC 筛查，在上链前拦截 | [21] Capabilities / Security（2026-10-21） | observed | T |
| A38 | MCP 版的单次 / 单会话上限只能由用户在钱包 UI 设置，agent 改不了 | [26] How do spending limits work（2026-10-21） | observed | K、J |
| A39 | Agentic Wallet 的限额在 Coinbase 服务端或 TEE 执行，不在链上 | 文档没有说明执行层；参照 [28] Policies 的描述推测 | speculative | C、F1、R |
| A40 | CLI 的 `x402 pay` 默认自动付款，`--max-amount` 可选；skill 声明了可免提示运行的 Allowed Tools | [24] Examples / Options；[23] Skill structure（2026-10-21） | observed | K |
| A41 | 默认流程上，Coinbase 的 x402 付款不需要逐笔人工确认，而 MetaMask 规则要求逐笔确认 | 由 A18、A38、A40 推出 | inferred | |
| A42 | x402 服务发现靠 Bazaar：CLI 是 `awal x402 bazaar search`，MCP 钱包应用有 Discover 标签 | [22] 命令表；[26] How do I find services（2026-10-21） | observed | |
| A43 | CDP Policies 在 Coinbase TEE 里链下执行，只管 CDP 项目内账户；Spend Permissions 由链上合约执行，只管 EVM 代币支出 | [28] Spend Permissions vs Policies（2026-10-21） | observed | K、F1 |
| A44 | Spend Permission Manager 合约地址为 0xf852…67Ad，主网覆盖 Arbitrum、Avalanche、Base、Ethereum、Optimism、Polygon，不含 Mantle | [28] Supported networks（2026-10-21） | observed | |
| A45 | Agentic Wallet MCP 的 gas 由平台代付；钱包为非托管，绑定邮箱，靠邮箱恢复 | [26] How much does it cost / Is this custodial / lose access（2026-10-21） | observed | K |
| A46 | Base Account SDK 和 Base MCP 已迁到 CDP，改名为 Coinbase Wallet SDK 和 Wallet MCP；Coinbase Wallet 即原 Base App | [31] What Changed；[33] 开头（2026-10-21） | observed | |
| A47 | Wallet MCP 连接用户的 Coinbase Wallet，可 send、swap、签名、合约调用和 x402，每笔写操作都要用户通过 approvalUrl 批准 | [32] 开头与时序图（2026-10-21） | observed | B、K |
| A48 | Coinbase 有三条不同的 agent 路径：独立预算钱包（Agentic Wallet）、主钱包逐笔批准（Wallet MCP）、主账户链上受限授权（Spend Permissions） | 由 A34、A43、A47 推出 | inferred | K |
| B1 | Binance Agentic Wallet 于 2026-04-24 发布 | [1] 公告 “Published on 2026-04-24 12:00”（2026-10-21） | observed | E |
| B2 | Binance Agentic Wallet 是用户 Binance 账户下独立的 Keyless 钱包，有独立余额，与主 MPC 钱包分开 | [1] 公告正文 “A separate Keyless Wallet … keeping your main Binance Wallet fully separate”（2026-10-21） | observed | K |
| B3 | 启用 Secure Auto Sign 后，交易执行不需要逐笔确认 | [1] 公告免责声明 “allows transactions to execute without individual transaction confirmations”（2026-10-21） | observed | K |
| B4 | Binance 官方称私钥在任何单一设备或服务器上都不会被完整重建（MPC keyless），agent 不能直接持有密钥 | [3] Welcome “MPC Keyless Security”（2026-10-21） | observed | C、B-1 |
| B5 | 日限额、代币范围、高风险处理在 Binance App 配置，并在 API 层约束 agent | [3] Welcome “You Set the Rules”（2026-10-21） | observed | C、J |
| B6 | Agent 可以读取安全规则但不能修改，修改入口只在 Binance App | [5] Install “Security Recommendations”；[7] Security & Settings（2026-10-21） | observed | K |
| B7 | Binance 有四类相互独立的 24h 额度（Swap 与转账、DeFi、x402、Developer Mode），没有总上限 | [8] Binance Blog “Set a daily spend limit”（2026-10-21） | observed | K |
| B8 | Binance agent 只能转账到地址簿白名单地址及自己 UID 的 keyless 钱包，这一限制不能关闭 | [8] Binance Blog “Recipient restrictions are permanently enforced”（2026-10-21） | observed | K |
| B9 | 连接时要在 App 核对 6 位配对码和请求来源（OS / IP / 位置），并勾选启用 SAS 与三项安全确认 | [4] Install “Step 3: Sign In”（2026-10-21） | observed | K |
| B10 | Binance 默认只开放 swap、转账、限价单、预测市场、代币化证券、DeFi 等验证过的操作，不发起任意交易 | [2] Introduction “Verified Capabilities Only”（2026-10-21） | observed | F8 |
| B11 | Binance 消息签名只允许 EIP-712，不支持 personal_sign / eth_sign；SIWE、空投领取等流程无法完成；私钥不能导出 | [2] Introduction；[6] Developer Mode “Supported signature types”（2026-10-21） | observed | K、F8 |
| B12 | Binance 发布活动期（04-24 至 05-09 UTC）gas 全额赞助，每地址 20 笔，总量 200,000 笔；活动结束后的 gas 承担方未见说明，推测由用户用原生币支付 | [1] 公告 “Limited-Time Gas Sponsorship”（2026-10-21） | speculative | R |
| B13 | Developer Mode 只能在 App 开启，agent / CLI / Web 都不能开；会过期；新增任意合约调用与自建 EIP-712；每笔都要预览并明确确认，高风险直接拦截 | [6] Developer Mode 页；[2] Introduction（2026-10-21） | observed | K |
| B14 | Developer Mode 有单独 24h 额度，默认 1,000 USDT，可选 5,000 / 10,000 / 50,000；余额超过 10,000 USDT 时不能开启，运行中超过会自动关闭；外部交易必须先模拟 | [8] Binance Blog “Developer Mode: Extra Safeguards”（2026-10-21） | observed | K |
| B15 | 风险分 ≥4 的交易按设置推送 App 确认或自动拒绝；48h 无活动自动登出；可在 App 冻结钱包 | [8] Binance Blog “Visibility and Higher-Risk Handling”“Session timeout”（2026-10-21） | observed | K、F2 |
| B16 | Binance skill 要求每次状态变更前确认，但用户明确要求时可以跳过，这一层确认属于提示词 / skill 层 | [9] SKILL.md@b402990 “Build the Command” 第 4 条（2026-10-21） | observed | F2 |
| B17 | Binance 入口是 skills + `baw` CLI（npm `@binance/agentic-wallet`），Binance Ai Pro 内置 | [3] Welcome “Install”；[9] SKILL.md metadata；[1] 公告（2026-10-21） | observed | |
| B18 | Binance 文档写支持 4 条主网，skill 示例列 7 条（BSC / ETH / Solana / Base / Arbitrum / Polygon / Robinhood），两者都不含 Mantle | [3] Welcome “Chain Support”；[10] wallet-view.md@b402990 `wallet chains`（2026-10-21） | observed | C |
| B19 | 由 B18 推出：Binance Agentic Wallet 目前不能在 Mantle 上使用 | 由 B18 推出：两份官方链列表都不含 Mantle（未运行实时 `wallet chains`） | inferred | C |
| B20 | 由 B5、B6、B10、B13 推出：Binance 的思路是先在产品层收窄 agent 可签的内容，把规则修改权与危险能力开关留在 agent 接触不到的 App 里 | 由 B5、B6、B10、B13 推出 | inferred | |
| B21 | BNB Agent Studio v1 于 2026-07-01 在 BSC 主网上线，整合 x402 自付 LLM、ERC-8004 身份、ERC-8183 任务接口和 AWS AgentCore 部署，并集成 TWAK | [23] v1 博客 TL;DR 与 “Live Today”（2026-10-21） | observed | E、K |
| B22 | Studio 产品页路线图把 MVP 上线标为 2026-06-08，与 v1 博客的 2026-07-01 不一致 | [28] 产品页路线图；[23]（2026-10-21） | observed | |
| B23 | Studio v2（2026-08-13）让 agent 可以被雇佣并收款，钱包选项新增 Altana | [24] v2 博客对比表（2026-10-21） | observed | E、H、F6 |
| B24 | Studio v3（2026-09-03）加入 Turnkey，与 TWAK、Altana 并列；Altana 钱包可以作为 b402 卖方，由 Binance Pay 担任 facilitator | [26] v3 博客 TL;DR（2026-10-21） | observed | E、K |
| B25 | Studio v4（2026-09-22）新增 NodeOps 部署，支付加入 USDT / USDC / USD1 | [27] v4 博客 TL;DR（2026-10-21） | observed | |
| B26 | Studio 文档中默认钱包是 `evm-local`（本地加密 keystore）；签名是固定代码而不是 LLM 可调用的工具；IDE 的 MCP 只有只读工具，不签名；网络只有 BSC 主网和测试网 | [29] docs.bnbchain.org Studio 页 “One runtime, one signer”（2026-10-21） | observed | K、F5 |
| B27 | Altana session 的权限有调用（合约 / 方法）、按代币滚动周期的支出上限和到期时间三个维度，在链上执行，越界在验证时回滚 | [32] Altana Sessions “Permission shapes”（2026-10-21） | observed | B-2 |
| B28 | Altana 原文：不传 `permissions.calls` 等于不限制，session 可以在支出上限内调用任意合约 | [32] Altana Sessions “Notes”（2026-10-21） | observed | B-2、F3、L |
| B29 | Turnkey 原文：root 用户完全绕过策略引擎，agent 必须是 non-root 用户；策略默认拒绝，可以要求人与 agent 共同批准 | [33] Turnkey Agentic Wallets 第 2–3 步（2026-10-21） | observed | F3、L |
| B30 | BNB 称 Turnkey 的策略引擎在安全 enclave 内运行，返回 ALLOW / DENY / REQUIRE_CONSENSUS，独立于 agent 模型 | [26] v3 博客 “Enclave-enforced policy”（2026-10-21） | observed | J、L |
| B31 | TWAK 把 AES-256-GCM 加密的助记词存在本机，签名需要密码；密码可以来自命令行参数、环境变量或系统钥匙串 | [34] TWAK Key Management（2026-10-21） | observed | F3、L |
| B32 | BNB Chain 自己写明：身份基数大，但应用层需求（agents 实际付费的工作量）仍有待证明 | [30] Landscape 博客 “Where it is still early”（2026-10-21） | observed | F7 |
| B33 | BNB Chain 博客引用 8004scan：截至 2026-07-16，BSC 上约 200,000 个 ERC-8004 agent，约占 26 条链总数的 60% | [30] Landscape 博客 TL;DR（2026-10-21） | observed | |
| B34 | OKX Agentic Wallet 于 2026-03-18 发布，是 Onchain OS 的核心组件，私钥在 TEE 内 | [12] 支持中心公告（2026-10-21） | observed | E、K |
| B35 | OKX 支持邮箱 / Google / Apple 登录（也可用 API Key），密钥在 TEE 内生成、存储和签名，一个钱包最多派生 50 个子钱包 | [14] Agentic Wallet 文档；[15] Authentication（2026-10-21） | observed | K |
| B36 | OKX 的 contract-call 接受任意 EVM calldata / Solana 交易 / SUI PTB，经 TEE 签名后自动广播；sign-message 默认 personalSign（EIP-191），也支持 EIP-712 | [22] wallet-cli-reference.md@0346354（2026-10-21） | observed | K、F8 |
| B37 | OKX 策略只有四条：单笔限额、日转账限额、日交易限额（UTC 0 点重置）、转账白名单，由用户在 Web 门户设置 | [21] wallet-portal-actions.md@0346354 “Available Policy Rules”（2026-10-21） | observed | F1、K |
| B38 | OKX 后端需要确认时返回 confirming（exit 2），由 skill 规定用户确认后才带 `--force` 重跑；因此这道确认靠 skill 规则约束 agent，持有会话的客户端技术上可以越过 | 由 [19] SKILL.md@0346354 “Confirmation”、[22] `--force` 参数推出（2026-10-21） | inferred | J、F2 |
| B39 | GPT 资料称 OKX 策略页写明“交易限额不覆盖授权后第三方发起的转账”；该页需要登录，原文未能核实 | GPT 资料 §2.4；[21] 中列出的 Policy URL（2026-10-21） | speculative | F4、R |
| B40 | OKX 助记词可以在 OKX Wallet App / 插件导出，导出后与社交账户永久解绑、agent 不能再操作；agent 自身不能导出 | [21] wallet-portal-actions.md “User asks about wallet export”；[20] wallet.md “TEE Signing”（2026-10-21） | observed | K |
| B41 | OKX 在 X Layer 上免 gas；后端可以把部分交易标为 gas-free，由服务端决定，其余交易仍需原生币付 gas | [14] Core Capabilities；[19] SKILL.md “Backend-sponsored gas-free”（2026-10-21） | observed | |
| B42 | OKX Agentic Wallet 支持 Mantle（ChainIndex 5000） | [16] Supported Networks 表 Mantle 行（2026-10-21） | observed | C、Q |
| B43 | OKX 能力表中 Payments 列只有 X Layer 是 ✓，Mantle 为 “-”，BNB / Base / Solana 为 Coming Soon | [17] supported-chain 能力表（2026-10-21） | observed | C、Q |
| B44 | 由 B42、B43 推出：OKX agent 可以在 Mantle 上转账和交易，但 Onchain OS 的 x402 支付目前不覆盖 Mantle | 由 B42、B43 推出 | inferred | Q |
| B45 | OKX 官方称 agents 通过 MCP 或 CLI 接入；每笔交易先模拟，critical 级风险直接拦截 | [13] Learn 文章 “What it does”（2026-10-21） | observed | |
| B46 | OKX 公布的 1.2B+ 日 API 调用和 $300M 日交易量是 Onchain OS 整体指标，不是 Agentic Wallet 的使用量；三家都没有公布钱包级使用数据 | [13] Learn 文章；[1][12] 公告中均无钱包数（2026-10-21） | observed | F7 |
| B47 | 由 B10、B11、B36、B37 推出：Binance 默认能力窄，靠产品层限制操作类型；OKX 默认能力宽（任意 calldata、personalSign），策略只覆盖金额与转账白名单，不覆盖合约或授权维度 | 由 B10、B11、B36、B37 推出 | inferred | F4、F8 |
| B48 | 只有 3%–15% 的 ERC-8004 注册带有有效的注册文件和服务端点，注册数不能当作活跃 agent 数 | [35] arXiv 2606.26028v3 摘要（学术研究，非厂商一手）（2026-10-21） | inferred | D、F6 |
| C1 | Phantom 有两个 MCP server：文档 MCP 只有 `SearchPhantomDeveloper` 一个工具；钱包 MCP 是 `@phantom/mcp-server` | [6] 概述 / Available tools；[1] 首段（2026-10-21） | observed | |
| C2 | Phantom MCP v1.2.9 的 `tools/list` 返回 30 个工具，覆盖余额、转账、签名、swap、rebalance 和 Hyperliquid perps | [2] 页首说明；[1] What agents can do（2026-10-21） | observed | |
| C3 | Phantom agent 登录后得到一个新的专用钱包，余额为 0，需要充值，不和个人钱包共享资金 | [3] Why your agent has a different wallet；[1] Warning（2026-10-21） | observed | L |
| C4 | Phantom agent 钱包的签名在 KMS 的 TEE 中完成：policy engine enclave 先执行策略，再由 signer enclave 签名 | [4] Core components / How signing works；[1] How agent wallets sign（2026-10-21） | observed | L |
| C5 | Phantom 的 send / transfer 默认先模拟，用户批准后才传 `confirmed: true`；大部分 perps 写操作直接提交 | [2] Warning 与 perps 小节（2026-10-21） | observed | L、F2 |
| C6 | Phantom MCP 的会话保存在本地 session.json，删除前一直有效 | [5] Session management（2026-10-21） | observed | |
| C7 | Phantom MCP 支持的 EVM 网络是 Ethereum、Polygon、Base、Robinhood Chain，没有 Mantle；Monad 和 Sui 已弃用 | [2] Supported networks（2026-10-21） | observed | L、Q |
| C8 | Phantom 的人工确认写在工具协议里，靠 agent 遵守，不是服务端统一强制的 | 由 C5 推出：perps 写操作不经确认直接提交，`confirmed` 只是参数 | inferred | F2 |
| C9 | Phantom MCP 于 2026-02-17 在 X 上宣布（二手来源） | [7]（2026-10-21） | inferred | |
| C10 | Crossmint 的 EVM 钱包是 ERC-4337 + ERC-7579 智能合约钱包，signer 权限由合约执行，不靠后端 | [12] The Core / The Control Layer（2026-10-21） | observed | L、F1 |
| C11 | Crossmint agent 的 key 作为 delegated signer 加进用户钱包；超出授权范围的交易在钱包层被拒，用户可以随时移除 signer | [9] How It Works / FAQs（2026-10-21） | observed | L |
| C12 | Crossmint 的 scope 只支持 `transfer` 类型：每个 scope 是一条链上的一个代币，可设额度、重置周期和收款白名单；签名者另有 `expiresAt` | [11] What Scopes Restrict（2026-10-21） | observed | L |
| C13 | 不带 scope 的 Crossmint signer 可以不受限地花代币 | [11] What Scopes Restrict（2026-10-21） | observed | F3 |
| C14 | Crossmint 授权 agent 时，如果漏掉 `prepareOnly: true`，server signer 会自己批准授权，用户看不到提示 | [10] Steps 2 / Common Gotchas（2026-10-21） | observed | L |
| C15 | 持有 `CROSSMINT_SIGNER_SECRET` 的人，可以为所有授权过这个 signer 的钱包签名 | [10] Warning（2026-10-21） | observed | |
| C16 | Crossmint 钱包支持 Mantle（Wallets ✅），Onramp 需要联系销售（✱） | [13] 表格 Mantle 行（2026-10-21） | observed | L、Q |
| C17 | Crossmint Agent Cards 走 Visa Intelligent Commerce 或 Mastercard Agent Pay 时由卡网络执行限额，agent 只拿到 order intent ID 或一次性卡号 | [14] Key Features / FAQs；[15] Card Rails（2026-10-21） | observed | L |
| C18 | 卡不在网络通道里时，Crossmint 回退到 encrypted card，限额改由 Crossmint（Agent Checkouts）或集成方代码执行 | [15] Card Rails / With Your Own Checkout（2026-10-21） | observed | |
| C19 | Crossmint 卡路线的每笔购买都走用户自己的卡，退款和 chargeback 照常 | [14] FAQs（2026-10-21） | observed | L |
| C20 | crypto 路线的限额由链上合约执行，没有卡网络那样的退款和 chargeback 机制；争议由谁承担，钱包文档没有说明 | 由 C11、C17、C19 推出；[16] 只说卡不适合小额高频支付 | inferred | L |
| C21 | TWAK 在本地生成 BIP39 HD 钱包，助记词用 AES-256-GCM 加密（密钥由密码经 PBKDF2 派生），存在 `~/.twak/wallet.json` | [18] How Keys Are Stored（2026-10-21） | observed | L |
| C22 | TWAK 签名时依次从 `--password`、`TWAK_WALLET_PASSWORD`、系统钥匙串取密码 | [18] Password Resolution（2026-10-21） | observed | F3 |
| C23 | TWAK 的自动化任务只在 watcher（`twak serve --watch`）运行时执行，否则“saved but never run” | [19] serve / Running automations in the background（2026-10-21） | observed | L、F9 |
| C24 | TWAK 通过 `twak serve` 提供 MCP（stdio）或 REST；于 2026-03-26 发布 | [19] serve；[20] 发布日期（2026-10-21） | observed | E |
| C25 | TWAK 的 agent wallet 模式无需逐笔批准；WalletConnect 模式由用户逐笔批准 | [20] 2 Ways to Deploy（2026-10-21） | observed | |
| C26 | TWAK 的限额护栏是 CLI 参数（`--max-usd` 默认 10000，可用 `--skip-safety-check` 跳过；x402 的 `--yes` 跳过逐笔确认） | [19] transfer / x402 request（2026-10-21） | observed | L |
| C27 | 能执行 shell 或读取环境变量的 agent 进程，可以拿到 TWAK 的签名能力，也能跳过护栏 | 由 C22、C26 推出 | inferred | F3 |
| C28 | TWAK 文档没有确认支持 Mantle | [21] 官方文档问答接口（2026-10-21） | observed | L |
| C29 | Safe 官方有 4 种 AI agent 配置，并明确不推荐 1/1 | [22] Introduction；[23]（2026-10-21） | observed | L |
| C30 | Safe 的 Allowance Module 可以按代币给 delegate 设一次性或周期重置的额度 | [25]（2026-10-21） | observed | |
| C31 | Zodiac Roles（Gnosis Guild）可以按函数和参数值限定权限，并设速率和阈值上限 | [26] Key Features（2026-10-21） | observed | |
| C32 | Privy 有两种模型：agent 自有钱包；delegated signing（按策略限定的 authorization key，可撤销） | [27] Authorization models（2026-10-21） | observed | L |
| C33 | Privy 的策略默认由 TEE 执行（覆盖签名、交易、导出），默认拒绝；交易模拟和合规筛查不算策略执行 | [28] Policy evaluation（2026-10-21） | observed | J、L |
| C34 | Privy Agent CLI 用设备授权，每笔交易用临时签名密钥，会话最长 30 天 | [29] How it works / Session；[27]（2026-10-21） | observed | |
| C35 | Turnkey 的 root 用户绕过策略引擎，root quorum 的操作不能被任何策略限制；agent 应该是默认拒绝的 non-root 用户 | [32] Warning；[33] Technical overview（2026-10-21） | observed | F3、L |
| C36 | Altana 的 session 由链上验证执行，含 calls 和 spend 两类权限；省略 `calls` 等于在支出上限内不限制调用 | [36] Permission shapes / Notes（2026-10-21） | observed | L |
| C37 | Altana 默认链是 BNB，也支持 Ethereum；Base 只做验证；不支持 Mantle | [37] Supported SDK exports（2026-10-21） | observed | L |
| C38 | Stripe Link Agent Wallet 每笔 spend request 都要客户批准（30 分钟窗口），返回一次性凭证；agent 付款支持美国和加拿大客户 | [41] How it works / Wait for approval；[40] Availability（2026-10-21） | observed | L |
| C39 | Crossmint 说 Link 的 agent 卡只在美国可用，与 Stripe 当前文档（美国和加拿大）不一致，前者可能过时 | 由 C38 推出；[14] FAQ | inferred | |
| C40 | 在本路的产品和基础设施中，文档确认支持 Mantle 的有 Crossmint 钱包（✅）和 Privy（任意 EVM 链）；Phantom 和 Altana 不支持；TWAK、Safe 和 Turnkey 的完整支持未确认 | 由 C7、C16、C28、C37 推出；[31][34] | inferred | L、Q |
| C41 | “策略写在钱包合约里”的产品（Crossmint、Altana、Safe）和“策略在 TEE 里”的产品（Phantom、Privy、Turnkey），在“谁能改策略”上的信任假设不同 | 由 C4、C10、C33、C35、C36 推出 | inferred | J |
| C42 | Crossmint 带 scope 的 signer 在调用合约（swap）时，可能不受 transfer scope 的约束 | [9] 与 [11] 互相矛盾，未经验证 | speculative | R |
| S1 | x402 定义四种 scheme：exact、upto、batch-settlement、auth-capture（托管后 capture / void / refund） | [1] Payment Schemes 首段（2026-10-21） | observed | O、B-4 |
| S2 | x402 所有 scheme 的默认 flow 是 authorization：handler 前只验签，handler 后才结算 | [1] Payment flows 表（2026-10-21） | observed | B-4、O、F5 |
| S3 | x402 的 facilitator 负责验证和代上链结算，不托管资金，是可选组件 | [4] What is a Facilitator（2026-10-21） | observed | B-4 |
| S4 | x402 在 EVM 上用 EIP-3009（有 transferWithAuthorization 的代币）或 Permit2（任意 ERC-20）授权，facilitator 代付 gas | [2] EVM: Asset Transfer Methods（2026-10-21） | observed | Q |
| S5 | 新 EVM 网络上生产需要确认：代币走 3009 还是 Permit2、有生产结算路径（托管 / 自建 / 自结算）、定价方式 | [2] Production checklist for a new EVM network（2026-10-21） | observed | |
| S6 | x402 默认资产表没有 Mantle（5000）；官方 x402.org facilitator 只支持测试网 | [2] Default Assets 表、x402.org Facilitator 小节（2026-10-21） | observed | F10、Q |
| S7 | x402 官方 facilitator 列表（非穷举）没有任何一项点名 Mantle | [3] Facilitators 表（2026-10-21） | observed | F10 |
| S8 | x402 结算结果不确定时返回 settlement_pending 加 tx hash，重试时对账已广播的交易，防止二次扣款；默认存储只在单进程内有效 | [4] Settlement pending and auto-recovery（2026-10-21） | observed | F9 |
| S9 | 由 S6、S7、S4 推出：x402 在 Mantle 协议层可用，但需要自建或自结算 facilitator，并且用 TokenAmount 显式定价 | 由 S4、S6、S7 推出 | inferred | Q |
| S10 | ERC-8004 是 Draft（2025-08-13），三个注册表每链单例，原文“Payments are orthogonal” | [5] 头部与 Abstract（2026-10-21） | observed | F6、O |
| S11 | ERC-8004 规范承认 Sybil 攻击可以抬高假 agent 的声誉 | [5] Security Considerations（2026-10-21） | observed | F6、O |
| S12 | ERC-8183 是 Draft（2026-02-25），定义 6 状态的 job 托管，过期后任何人可以触发退款 | [6] State Machine（2026-10-21） | observed | O |
| S13 | ERC-8183：evaluator 可以任意判定完成或拒绝；没有争议仲裁，reject / expire 是终局 | [6] Security Considerations（2026-10-21） | observed | O |
| S14 | AP2 当前是 v0.2，用 Checkout Mandate、Payment Mandate 及各自的 Receipt 作为授权和争议证据 | [7] 开头与 Dispute Evidence（2026-10-21） | observed | O |
| S15 | AP2 要求各角色的校验和处理“MUST happen in deterministic code”，无论该角色是不是 agent | [7] Agentic vs Non-Agentic（2026-10-21） | observed | F5 |
| S16 | AP2 不限定支付工具，新支付工具通过 Payment Instrument 的 `type` 扩展 | [7] Extension Points › Payment Instrument（2026-10-21） | observed | O |
| S17 | AP2 在用户不在场的模式下，open mandate 必须带 agent 公钥，`exp` 建议设为最小值；被拒之前不能再出示新的 open mandate | [7] Autonomous (Human Not Present)（2026-10-21） | observed | O |
| S18 | ERC-7715（Draft）定义钱包 RPC `wallet_requestExecutionPermissions`，负责请求和授予权限 | [8] Abstract（2026-10-21） | observed | O |
| S19 | ERC-7710（Draft）定义 `redeemDelegations`，负责赎回和链上校验，委托怎么请求不在范围内 | [9] Obtaining Delegations / Overview（2026-10-21） | observed | O |
| S20 | ERC-4337 是 Final：paymaster 要在 EntryPoint 存够 ETH；nonce 分成 192 位 key 和 64 位 sequence，每个 key 独立递增 | [10] 头部、nonce 小节、paymaster 流程（2026-10-21） | observed | O |
| S21 | EIP-7702 是 Final；规范说协议层无法实现权限系统，权限必须靠委托代码的模块实现 | [11] 头部与 Rationale（2026-10-21） | observed | O |
| S22 | MPP 由 Stripe 与 Tempo 合著，走 HTTP 402，不绑定支付通道（Tempo 稳定币、卡、Lightning） | [12] MPP 首段；[13]（经搜索引擎抓取，2026-10-21） | observed | O |
| S23 | Anthropic：Claude for Chrome 在自适应攻击下，攻击成功率从 Opus 4.5 单模型的 8.0% 降到加防护后的 1.4%，并称 1% 仍是实质风险 | [14] 图表说明与正文（2026-10-21） | observed | D、F9 |
| S24 | OpenAI 建议 MCP 工具始终开启审批，并让不可信数据不直接驱动 agent 行为 | [15] Keep tool approvals on / Combine techniques（经搜索引擎抓取，2026-10-21） | observed | F9 |
| S25 | Freysa：2024-11 经过 482 次尝试，被诱导转出约 $47K 奖池（对抗游戏，二手来源） | [16]（2026-10-21） | inferred | |
| S26 | AIXBT：2025-03-18 dashboard 被入侵，经恶意提示转出约 55.5 ETH；维护者称不是 agent 被操纵（二手来源） | [17]（2026-10-21） | inferred | |
| S27 | MetaMask 规则：x402 每个资源只付一次，不自动重试；2FA 等待期间不能重复执行命令 | [18] Confirm before you act / Handle 2FA pauses（2026-10-21） | observed | |
| S28 | MetaMask 的 outflow 额度不计入 Permit2 等签名，不经它后端提交的交易统计不准 | [19] Limitations（2026-10-21） | observed | F4 |
| S29 | TWAK 的自动化只在 watcher（`serve --watch`）运行时执行 | [20] Running automations in the background（2026-10-21） | observed | F9 |
| S30 | EIP-3009 授权在 validAfter 到 validBefore 窗口内都可提交，只能靠 cancelAuthorization 或等过期来失效 | [21] Signed messages / Validity window（经搜索引擎抓取，2026-10-21） | observed | B-3、F4 |
| S31 | 由 S28、S30 推出：暂停 agent 不会作废已签出的 3009 / Permit2 授权或已有 allowance，停机流程必须包含 cancel / revoke | 由 S28、S30 推出 | inferred | F4 |
| S32 | Artemis（2026-10-19 更新）：x402 近 24 小时 101.7K 笔、$44.2K、平均每笔 $0.40，30 天交易数 −45.88% | [22] Key Metrics（经搜索引擎抓取，2026-10-21） | observed | D、F7 |
| S33 | Artemis 板块页单独列出“Real vs. Gamed Transactions”，区分真实需求和 wash trading | [23] 图表标题（2026-10-21） | observed | F7 |
| S34 | Artemis 2025-12 报告：约 48% 的 x402 交易笔数、81% 的金额与 gamed volume 相关（二手转述） | [24]（2026-10-21） | inferred | F7 |
| S35 | 8004scan 在 2026-10-21 显示 819,538 个 ERC-8004 agent，最新注册条目反馈为 0 | [26] Browse Agents（2026-10-21） | observed | D、F6 |
| S36 | 由 S32–S35 推出：交易笔数和注册数不能直接当作真实付费需求的证据 | 由 S32、S33、S34、S35 推出 | inferred | F7 |
| S37 | LLM 检索带来的时延与高频 / 快速中频策略不兼容（学术综述） | [43] Recall Depth 段（2026-10-21） | observed | P |
| S38 | 时延敏感、目标固定的任务（套利、清算、做市）应该交给确定性 bot，agent 负责选目标和设约束 | GPT 资料 §3.5 观点；[43] 只部分支持 | speculative | P、R |
| S39 | Mantle 的 Skadi 升级（v1.3.1）带来 Prague 特性，包括 EIP-7702 SetCode 交易 | [29] Key EIPs 列表（2026-10-21） | observed | Q、F10 |
| S40 | Skadi 在 Mantle 主网的生效日期是 2025-08-27（二手来源） | [30]（2026-10-21） | inferred | |
| S41 | Pimlico 在 Mantle（5000）支持 EntryPoint V06 / V07 / V08 的 bundler 和 paymaster、V09 的 bundler，并标注支持 7702 | [31] Mantle 小节（2026-10-21） | observed | Q、F10 |
| S42 | ERC-8004 的 Identity / Reputation 注册表已部署在 Mantle 主网（0x8004A169… / 0x8004BAa1…），Mantle 于 2026-02-16 宣布 | [27] README Mantle Mainnet；[28]（2026-10-21） | observed | E、Q、F10 |
| S43 | Mantle USDC（0x09Bc…0dF9）是 FiatTokenProxy，实现合约的 ABI 有 transferWithAuthorization 和 permit，只有 v,r,s 签名形式 | [33] Routescan getsourcecode / getabi（2026-10-21） | observed | Q、F10 |
| S44 | Mantle USDT0（0x779D…3736）的实现合约 ABI 里，transferWithAuthorization / cancelAuthorization 同时有 v,r,s 和 bytes 重载 | [34] Routescan getabi 0x1EC7…；[35] 地址（2026-10-21） | observed | Q |
| S45 | 由 S43 推出：ERC-1271 智能账户（session key 账户）不能直接用 Mantle USDC 走 x402 的 EIP-3009 路径 | 由 S43、S4 推出 | inferred | Q |
| S46 | MetaMask Agent Wallet 列出 Mantle 5000，但 Transaction Shield 为 No，没有威胁扫描 | [37] Mainnets 表与说明（2026-10-21） | observed | Q |
| S47 | Coinbase Agentic Wallet CLI（Base / Polygon / Solana）和 Binance Agentic Wallet（BSC / ETH / Base / Solana）都不支持 Mantle | [38] Capabilities 表；[40]（经搜索引擎抓取，2026-10-21） | observed | Q |
| S48 | OKX Agentic Wallet 的支持网络表列出 Mantle 5000 | [41]（经搜索引擎抓取，2026-10-21） | observed | Q |
| S49 | Phantom MCP 只列出 Solana、Ethereum、Bitcoin（Sui 已弃用），没有 Mantle | [42] Setup › Features（经搜索引擎抓取，2026-10-21） | observed | Q |
| S50 | 由 S9、S39、S41、S42、S44、S46–S49 推出：Mantle 链层基础件大多具备，缺的是 x402 生产 facilitator 和钱包侧覆盖 | 由 S9、S39、S41、S42、S44、S46、S47、S48、S49 推出 | inferred | F10 |
| N1 | 现有产品按账户模式分三类：独立预算钱包（MetaMask server-wallet、Coinbase Agentic Wallet、Binance、OKX、Phantom、TWAK）、主账户受限授权（MetaMask Advanced Permissions、Coinbase Spend Permissions、Crossmint delegated signer、Safe Allowance、Altana）、主钱包逐笔批准（Coinbase Wallet MCP、Stripe Link、TWAK WalletConnect 模式） | 由 A6、A29、A34、A43、A47、B2、B35、C3、C11、C25、C30、C36、C38 推出 | inferred | B |
| N2 | 密钥托管分四种：服务端 TEE（MetaMask server-wallet、Coinbase、OKX、Phantom、Privy、Turnkey）、MPC（Binance）、本地加密（MetaMask BYOK、TWAK、BNB Studio evm-local）、智能账户 + 受限 signer（Crossmint、Altana、Safe、MetaMask Advanced Permissions） | 由 A6、A36、B4、B26、B31、B35、C4、C10、C33、C35、C36、A29 推出 | inferred | A、C |
| N3 | 核心四家的独立钱包，策略都在厂商链下（服务端 / TEE / API）执行或未公开执行层；链上强制执行只出现在智能账户路线（Advanced Permissions、Spend Permissions、Crossmint、Altana、Safe） | 由 A10、A39、B5、B37、A31、A43、C10、C36、C30 推出；Coinbase 与 OKX 的执行层未公开 | inferred | 导语、F1 |
| N4 | 逐笔确认多数写在 skill / 工具参数层，靠 agent 遵守；MetaMask（越界、高风险、提额、改策略时 2FA）和 Binance（风险分 ≥4 推 App）另有服务端或 App 侧检查；OKX、Phantom 的服务端确认条件各不相同且未完整公开 | 由 A9、A19、B15、B16、B38、C8 推出 | inferred | 导语、F2 |
| N5 | “agent 不能控制私钥”要改写为“agent 不能拿到无界的签名能力”：本地密钥（BYOK、TWAK）放在 agent 主机上，能读环境变量的进程就能签；TEE 托管而策略为空（Altana 省略 calls、Turnkey root、Crossmint 无 scope signer）在经济上接近持有私钥 | 由 A13、C27、B28、B29、C13 推出 | inferred | F3、N |
| N6 | 支出额度不等于损失上限：MetaMask 额度不计签名授权、多跳重复计数；暂停 agent 不作废已签出的 3009 / Permit2 授权；OKX 策略没有合约与授权维度 | 由 A14、A15、S31、B47 推出 | inferred | F4、N |
| N7 | “确定性执行、减少推理”已是设计共识：BNB Studio 签名是固定代码而非 LLM 工具，AP2 规定校验必须在确定性代码中，x402 默认流程由代码验签结算 | 由 B26、S15、S2 推出 | inferred | F5、N |
| N8 | 链上身份不等于一等公民：ERC-8004 不管付款、承认 Sybil 风险，注册里只有 3%–15% 带有效端点；“一等公民”还需要预算、收款、可撤销与审计（BNB Studio v2 起 agent 可以收款） | 由 S10、S11、B48、S35、B23 推出 | inferred | F6、N |
| N9 | agent commerce 的真实付费需求目前很小：x402 全网日均约 $44K、平均每笔 $0.40，刷量占比高；BNB Chain 自己承认应用层需求仍待证明；三家都没有公开钱包级使用数据 | 由 S32、S34、B32、B46 推出 | inferred | 导语、F7、N |
| N10 | 产品设计分成两种思路：默认收窄能力（Binance 只开放验证过的操作、Coinbase MCP 只能付 x402）与默认放宽再加策略（OKX 任意 calldata、MetaMask Beast Mode 无白名单） | 由 B10、B47、A34、A8 推出 | inferred | F8 |
| N11 | 最可能先成立的 agent 场景是小额、低权限的服务采购（数据、API、算力按次付费），其次是有限权限的仓位维护；通用“全权交易”最难成立 | 由 A34、S1、S32 的小额均值与 N6 的风险面推测；没有实证 | speculative | P、R |
| N12 | 在 Mantle 上，文档列出支持的 agent 钱包只有 MetaMask（无 Transaction Shield）、OKX（x402 支付列为“-”）、Crossmint 钱包和 Privy；Coinbase、Binance、Phantom、Altana 均不支持 | 由 A24、A25、B42、B43、C16、C40、S47、C7、C37 推出 | inferred | Q、F10 |
| N13 | Mantle 最值得先补的是：x402 生产 facilitator 与显式定价、智能账户可用的支付代币路径（USDC 的 3009 只收 v,r,s）、钱包侧威胁扫描覆盖，而不是再做一个钱包前端 | 由 S9、S45、A25、S50 推出的建议，未经验证 | speculative | Q、R |
| N14 | x402 只定义报价、付款授权与结算；身份、交付质量不在它的范围内，分别由 ERC-8004、ERC-8183 等其它层处理 | 由 S1–S4、S10、S12 推出；notes-stack.md §1.1 答案 | inferred | O |
| N15 | AP2 规范把争议的具体处理流程列为 outside the scope | notes-stack.md [7] AP2 规范 Extension Points / Dispute Evidence（2026-10-21） | observed | O |
| N16 | 不同统计方对 x402 30 天金额的口径差距很大（x402.org 约 $24M、Allium 约 $3M、Artemis 不到 $2M，二手转述） | notes-stack.md [24] 二手转述 Artemis 2025-12 报告（2026-10-21） | inferred | P |
| N17 | x402 平均每笔约 $0.40，主要是小额按次付款 | 由 S32 推出 | inferred | P |
| N18 | Privy 建议用 key quorum 对更新策略和导出钱包做多方审批，即策略可由 owner / quorum 修改 | notes-products-c.md [30] Privy agentic wallets recipe（搜索摘录，2026-10-21） | inferred | L |
| N19 | Turnkey 在曲线层面可为任意 EVM 链签名，但 gas 代付链表里没有 Mantle | notes-products-c.md [34][35]（搜索摘录，2026-10-21） | inferred | L |

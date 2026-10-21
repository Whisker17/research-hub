# notes-products-c：其它生态与底层基础设施（lane C）

调研日期 / 访问日期：2026-10-21。所有网页来源均在此日访问。本路没有运行任何本地命令（没有 shell 工具），所以 `twak chains` 等需要实跑的验证没有做，见“开放问题”。

> 写入说明：任务说明要求写到 `reports/2026/10/agentic-wallet/research/notes-products-c.md`。本次运行的权威输出路径是 subagent artifact 路径，所以文件写在那里，由上级 agent 搬到报告目录。

---

## §1 Phantom（Solana 起家，MCP server）

**答案：** Phantom 有两个 MCP server。真正给 agent 用的钱包是 `@phantom/mcp-server`：用户登录后，它为 agent **新建一个专用钱包**（不是用户的个人钱包），密钥放在 Phantom KMS 的 TEE 里。它提供 30 个工具，覆盖余额、转账、签名、swap、rebalance 和 Hyperliquid 永续合约。只有 send / transfer 默认走“先模拟、用户确认后再带 `confirmed: true` 提交”的流程；不支持 Mantle。

**依据**
- 有两个 MCP：`docs.phantom.com/mcp` 是给编码助手查开发文档的 server，只有一个工具 `SearchPhantomDeveloper` [6]；`@phantom/mcp-server` 是“给 AI agents 一个钱包”的产品 [1]。不能把两者混为一谈。
- 工具：tool reference 写明，页面列出的工具名就是 `@phantom/mcp-server@1.2.9` 的 `tools/list` 返回的 30 个名字 [2]。分三组 [1]：钱包操作（`wallet_balances`、`transfer`、`solana_send`、`evm_send`、`evm_sign-typed`、`simulate`、`evm_allowance`、`pay` 等）；swap 与组合（`buy`、`wallet_rebalance`，官方说 swap 不收费）；perps（`perps_open/close/leverage/deposit/withdraw` 等，基于 Hyperliquid）。
- 账户模式：agent 登录后拿到的是**新的专用钱包**，初始余额为 0，必须由用户转账充值；不和个人钱包或嵌入式钱包共享资金 [1][3]。这属于“独立预算钱包”模式。
- 密钥与策略：agent 钱包完成 Phantom Connect 登录后，用 OIDC stamper 给 KMS 请求盖章，“KMS validates the stamp, enforces policy, and then signs and submits” [1]。KMS 分 policy engine enclave 和 signer enclave，密钥在 TEE 中生成和保存，policy engine enclave 执行策略（例如支出限额）、scope 和速率限制 [4]。会话与 stamper key 存在 `~/.phantom-mcp/session.json`（权限 0600），“Sessions persist indefinitely until explicitly deleted” [5]。
- 人工确认：`solana_send`、`evm_send`、`transfer` 默认先模拟，“pass `confirmed: true` only after the user approves the simulation” [2]。但 perps 中，除 `perps_deposit`、`perps_withdraw-hl-spot` 等先报价的工具外，“The other perp write tools submit the signed action on the call” [2]。所以确认机制写在工具参数和说明里，没有统一由服务端强制。
- 支持链：Solana；EVM 有 Ethereum、Polygon、Base、Robinhood Chain 及其测试网；Arbitrum 只用于余额查询、价格和 Hyperliquid 签名，发送会被拒；Monad 和 Sui 已弃用 [2]。表里**没有 Mantle**。
- 收费：`pay` 工具用于“在配额用完后支付每日 API 访问费”[1][2]。也就是说，Phantom 对 MCP 的 API 用量本身收费。

**不确定之处**
- 文档只写了 KMS 会“enforce policy”，**没有写 agent 钱包的策略由谁配置、用户能否改、默认限额是多少**。
- 能否导出私钥、gas 由谁出，都没查到文档。
- 发布日期只有二手来源（SpendNode 称 Phantom 于 2026-02-17 在 X 上宣布，当时是 preview，只有 5 个工具）[7]，没有找到一手公告。

## §2 Crossmint（agent wallets / agent cards / Agent Checkouts）

**答案：** Crossmint 把“用户怎么付钱”（Agent Cards、Agent Wallets）和“在哪里买”（Agent Checkouts、x402、MPP）拆成两层 [8]。
- **Agent Wallets**：ERC-4337 + ERC-7579 智能钱包。agent 的 key 作为 delegated signer 加进钱包，限额写进钱包的链上 signer 配置，由合约执行 [9][12]。但文档里能配置的 scope 目前只有 `transfer` 类型（按代币设额度、周期和收款白名单），外加签名者级的 `expiresAt` [11]。
- **Agent Cards**：用 Visa Intelligent Commerce 或 Mastercard Agent Pay 时，限额由卡网络执行，agent 只拿到 order intent ID 或一次性卡号 [14][15]。卡不在这两个网络里时会回退到 encrypted card，限额改由 Crossmint（在 Agent Checkouts 里）或接入方自己的代码执行 [15]。

**依据**
- 钱包合约：“On EVM chains, Crossmint wallets are smart contract wallets implementing ERC-4337 with ERC-7579 modular extensions”。Solana 上用 PDA，Stellar 上用 Soroban 合约 [12]。operational signer 和 recovery method 都在链上 signer 集合中，“The smart contract enforces their permissions, not Crossmint's backend” [12]。即使 Crossmint 停止运营，用户也可以直接与合约交互来迁移 [12]。
- 限额维度：每个 scope 对应一条链上的一个代币，可选 `spendingLimit`（`amount`，以及可选的按秒计的重置周期 `interval`）和 `recipients` 白名单；“The only supported scope type is `transfer`”。不带 scope 的 signer 可以不受限地花代币 [11]。金额由 Crossmint 读取代币 `decimals()` 后换算，“the wei amount the policy contract expects” [11]。
- 授权流程：服务端用 `addSigner(..., { prepareOnly: true })` 把 agent signer 登记为 pending，用户在客户端用邮件 OTP 批准后才生效。如果漏掉 `prepareOnly`，server signer 会自己批准自己的授权，用户完全看不到提示 [10]。这是一条**由集成方代码失误造成的绕过路径**。
- 密钥：agent 的 server signer 是一个 32 字节 secret，存放在集成方后端的环境变量里；“Anyone who holds `CROSSMINT_SIGNER_SECRET` can sign on behalf of every wallet it has been authorized on” [10]。也有 server agent wallet 模式（后端是 root signer，没有用户兜底）[17]。
- 卡路线：用户把卡存进 Crossmint 的 PCI vault，再批准一个 order intent（金额、有效期、可选商户），之后可以在额度内多次支付，每次生成新的凭证 [14]。“Visa Intelligent Commerce and Mastercard Agent Pay hold the limit, not your code” [14]。限额执行方：VIC 由 Visa 执行，Agent Pay 由 Mastercard 执行，SPT 由 Stripe 执行，encrypted card 由 Crossmint 或你的代码执行 [15][16]。
- 争议与退款：卡路线上每笔购买都走用户自己的卡，“refunds and chargebacks work as usual”[14]。钱包路线面向小额高频的机器支付，Crossmint 认为卡费和 chargeback 规则让卡不适合这类支付 [9][16]。
- 链：supported chains 表中 Mantle 的 Wallets 一栏是 ✅（可自助）；Onramp 一栏是 ✱（需联系销售）[13]。gas 可以用 USDC、原生代币支付，或计入 Crossmint 账单 [12]。

**不确定之处 / 矛盾**
- agent 概览页说用户可以限制 “addresses or protocols”，并且可以 swap、bridge、调用任意合约 [9]；但 scopes 文档只支持 `transfer` 类型 [11]。**带 scope 的 signer 调用合约（swap）时受什么约束，文档没有说清楚**，见“矛盾”。
- Crossmint agents 产品的发布日期没有查到。智能钱包本身发布于 2024-09-11（官方公告，搜索摘录）[42]。

## §3 Trust Wallet Agent Kit（TWAK）

**答案：** TWAK 于 2026-03-26 发布 [20]，入口是 CLI（`twak`），通过 `twak serve` 提供 MCP（stdio）或 REST 服务 [19]。agent wallet 模式下，它在本机用 Trust Wallet Core 生成 BIP39 HD 钱包，助记词用 PBKDF2 派生出的密钥做 AES-256-GCM 加密，保存在 `~/.twak/wallet.json`；签名需要密码，密码依次从 `--password` 参数、`TWAK_WALLET_PASSWORD` 环境变量、系统钥匙串读取 [18]。自动化任务只在 watcher 运行时执行 [19]。

**依据**
- 原文（watcher）：“DCA and limit-order automations you set up with `twak automate` are saved, but they only run while a watcher is active. … start it with `twak serve --watch` … Without `--watch`, your automations are saved but never run.” 检查间隔默认 60 秒 [19]。
- WalletConnect 模式下 watcher 不会执行任务，“since those transactions need manual approval” [19]。官方博客把两种模式写成：agent wallet 模式“No per-transaction approval needed”；WalletConnect 模式“The user reviews and approves each one” [20]。
- 安全护栏在 CLI 参数这一层：`transfer --max-usd`（默认 10000），可用 `--skip-safety-check` 跳过；`--confirm-to` 用于锁定 ENS 解析结果；x402 必须带 `--max-payment`，`--yes` 跳过逐笔确认（但仍受上限约束），`--auto-approve` 跳过 Permit2 无限授权的提示 [19]。
- 不需要密码就能做的事：查余额、价格、报价、风险；需要密码的事：签名、转账、swap、approve、签消息 [18]。
- 能力：swap / 跨链 swap、DCA、限价单、价格提醒、ERC-20 approve / revoke、x402 付款与收款网关、法币出入金（KYC 在第三方页面完成），覆盖 25+ 条链 [19][20]。

**不确定之处**
- 文档没有列出全部链，也没有确认支持 Mantle。官方文档的问答接口回答“don't specifically confirm Mantle”，建议运行 `twak chains` 查看 [21]。本次没有运行。
- 没有看到导出助记词的命令（钱包确实在本地，理论上用户拥有助记词）。
- 博客说开发者事先配置“which assets… what limits apply” [20]，但 CLI 文档里没有独立的策略配置，只有每条命令的参数 [19]。

## §4 Safe

**答案：** Safe 没有托管式的 agent 钱包产品，但官方文档有一组 AI agent 快速上手指南，给出 4 种配置：agent 作为 1/1 owner（官方不推荐）、agent 提案再由人类多签批准、多 agent 互签、用 Allowance Module 给 agent 设支出额度 [22]。因此本报告把 Safe 作为“链上智能账户限权”的对照。

**依据**
- 1/1 配置：“This 1-out-of-1 signer setup is discouraged by Safe” [23]。
- 人工批准：推荐 2/3、3/5、5/7 门限，agent 只是其中一个 signer，通过 Safe Transaction Service 提交提案，由人类签名执行；“the Smart Account can not be compromised by convincing the agent to execute a malicious transaction”，代价是审批可能要几分钟到几小时 [24]。
- Allowance Module：按代币给某个 delegate 设额度，可以是一次性的，也可以按周期重置（例如每天 100 USDC）[25]。
- Zodiac Roles Modifier（Gnosis Guild 出品，不是 Safe 官方产品）：可以挂在 Safe 上，按地址、函数和参数值限定权限，并设置使用频率和阈值上限 [26]。

**不确定之处**
- Safe 是否部署在 Mantle 上，本次没有从 Safe 官方来源核实。
- Allowance Module 只覆盖代币转账，还是也能约束合约调用：只读了 Safe 的文档页，没有读合约源码。

## §5 底层基础设施对照

**Privy**
- 两种授权模型：agent 自有钱包（agent 持有触发签名的凭证）；delegated signing（用户给 agent 一个按策略限定范围的 authorization key，可以随时撤销）[27]。
- 策略执行位置：“By default, the trusted execution environment (secure enclave) enforces policies for wallet actions… signature requests, transactions, and key export” [28]。策略默认拒绝，DENY 优先于 ALLOW [28]。合规筛查和交易模拟可能在 enclave 外运行，“These checks are not policy enforcement” [28]。
- 策略能表达：转账限额、按时间窗口的累计额（stateful aggregation，只支持部分 Ethereum 方法）、收款方和合约白名单、网络限制、calldata 参数、导出私钥的时间窗口 [28]。
- Agent CLI：用设备授权流程，人类在浏览器里批准一次；之后每笔交易用 access token 换取一个临时签名密钥（ephemeral signing key）。会话最长 30 天，token 自动轮换 [27][29]。
- 谁能改策略：recipe 建议用 key quorum 对“updating policies or exporting wallets”做多方审批 [30]（搜索摘录）。
- 链：任意 EVM 链，文档示例中列出了 Mantle [31]（搜索摘录）。

**Turnkey**
- 密钥在 secure enclave 里，agent 只用 API key 认证，拿回的只是签名 [32]。
- agent 应该是 non-root 用户，默认拒绝，可以按钱包、目的地、函数选择器、金额设规则，也可以要求共识（例如超过 0.1 ETH 需要人类共签）[32]。
- “Root users bypass the policy engine entirely” [32]。root quorum 的操作“do not go through the policy engine; thus it is impossible to limit root quorum actions with any policies”。这样设计是为了在策略配错时能“unbrick”组织 [33]。
- gas 代付、nonce 管理和广播只对 Enterprise 开放；可代付的链表里没有 Mantle [34]（搜索摘录）。签名本身在曲线层面支持所有 EVM 链 [35]（搜索摘录）。

**Altana**
- session 是 admin key 授予另一把 key 的权限，有范围和有效期；“Permissions are enforced onchain… reverts at validation time” [36]。
- 维度：`calls`（合约和/或方法签名，两者同时给时取 AND）与 `spend`（按代币的滚动上限，周期可以是天或小时）[36]。
- 注意：“`permissions.calls` omitted = unrestricted”，即在支出上限内可以调用任意合约 [36]。
- 撤销：只需 admin 签名，撤销后不可恢复；但镜像到 L2 cache 的授权不会自动随之撤销 [39]（搜索摘录）。
- 执行：通过 relay 提交，可以用 `feeToken` 指定付费代币；钱包运行的是 EIP-7702 委托代码，用 `.transfer()`、`.send()` 往钱包打原生币会失败 [38]。
- 链：默认 BNB Smart Chain，也支持 Ethereum；Base 只用作验证缓存，没有 Mantle [37]。

## §6 其它有代表性的 agent 钱包

**Stripe Link Agent Wallet**（选它的原因：它是卡网络路线上“逐笔人工批准”的代表，正好对照 Crossmint 的“批准一次、多次支付”）[40][41]
- agent 通过 OAuth 拿到代表单个客户的 token，为每笔购买创建 spend request（金额、商户、至少 100 字的购买说明）。客户在 Link 网站或 App 上批准，审批窗口 30 分钟。批准后 agent 拿到一次性虚拟卡、shared payment token 或 Link Pay Token [41]。
- 提高金额需要客户再批准一次 [41]。账户级限额分每笔、每日、30 天三档 [41]。
- 卡号直接打印到 stdout 会进入模型上下文，官方要求托管 agent 使用 `--output-file` [41]。
- 地区：agent 付款支持美国和加拿大客户 [40]。
- 没有找到发布日期。

Bankr、Solana Agent Kit 等没有找到足够的一手文档，没有放进对比表。

---

## 统一维度对比

| 维度 | Phantom MCP | Crossmint Agent Wallet / Cards | TWAK | Safe（对照） | Stripe Link Agent Wallet |
|---|---|---|---|---|---|
| 入口 | MCP（npx `@phantom/mcp-server`）；有 CLI（`phantom perps …`）；OpenClaw 插件 [1][2] | SDK / REST（集成方以工具或 skill 形式接入）[8] | CLI `twak`；`twak serve` 提供 MCP stdio 或 REST [19] | SDK（Protocol Kit / API Kit）+ Safe Wallet 界面 [22][24] | CLI `link-cli` + TS / Go SDK [40] |
| 账户模式 | 独立预算钱包（登录后新建，需充值）[3] | 主账户受限授权（用户钱包加 delegated signer）或后端自有钱包 [9][17]；卡路线：用户自己的卡 + order intent [14] | 独立本地钱包（agent wallet 模式）或连接用户的 Trust Wallet（WalletConnect 模式）[20] | 主账户受限授权（多签 / Allowance / Roles）[22] | 用户的 Link 账户，逐笔授权 [41] |
| 密钥托管 | Phantom KMS TEE；本地保存 stamper key [4][5] | 智能账户（ERC-4337 + 7579）；agent 的 signer secret 放在集成方后端 [10][12] | 本地加密（AES-256-GCM，密码或钥匙串）[18] | 链上合约账户，owner 密钥自管 [23] | 不涉及链上密钥；卡号存在 Link [41] |
| 策略执行层 / 谁能改 | KMS policy engine enclave；谁配置策略未知 [4] | 链上合约（scope：transfer 类型的额度、周期、收款方，加 expiresAt），用户通过 recovery method 批准变更 [11][12]；卡：Visa / MC / Stripe / Crossmint 执行 [15] | 本地 CLI 参数（`--max-usd`、`--max-payment` 等），持有 shell 的一方就能改 [19] | 链上 Safe 合约和模块，由 owner 门限决定 [24][25] | Link 服务端（客户批准 + 账户限额）[41] |
| 能力范围 | 转账、签名、swap、跨链 swap、rebalance、Hyperliquid perps [1] | 转账、swap、跨链、合约调用、x402、MPP；卡：网页购买、订阅 [8][9] | 转账、swap、跨链、DCA、限价单、approve、x402 付款和收款、出入金 [19][20] | 任意 Safe 交易（受门限或模块约束）[22] | 线上购物（虚拟卡、SPT、Link Pay Token）、MPP [40][41] |
| 默认人工确认 | send / transfer 先模拟再确认；多数 perps 写操作直接提交 [2] | 授权 signer 时需要 OTP；之后 agent 在范围内逐笔交易无需确认 [9][10] | agent wallet 模式无需逐笔确认；x402 默认逐笔确认，可用 `--yes` 跳过 [19][20] | 取决于门限配置 [24] | 每笔 spend request 都要客户批准 [41] |
| gas | 未查到 | paymaster；可用 USDC、原生代币或计入 Crossmint 账单 [12] | 本地钱包自付（x402 的 EIP-3009 免 gas）[19] | 自付或用 relayer（未查） | 不涉及 |
| 退出与恢复 | 未查到能否导出 | 合约钱包可以脱离 Crossmint 继续使用；邮箱 / 手机 OTP 作为恢复方式 [12] | 助记词在本地（未见导出命令）[18] | 自管 | 不涉及 |
| 支持链 / Mantle | Solana、ETH、Polygon、Base、Robinhood；**无 Mantle** [2] | 50+ 条链；**Mantle 钱包 ✅** [13] | 25+ 条链；**未确认 Mantle** [21] | 未核实 Mantle | 不涉及（法币；美国和加拿大）[40] |
| 已知边界 / 绕过 | 确认依赖 agent 遵守；会话无限期有效 [2][5] | 漏传 `prepareOnly` 时用户不会被提示；signer secret 泄露会影响所有已授权的钱包；无 scope 的 signer 不受限 [10][11] | 能读环境变量或钥匙串的进程就能签名；safety check 可以跳过（推论，见 C21）[18][19] | 1/1 配置不受保护 [23] | 卡号可能进入模型上下文 [41] |
| 发布日期 | 2026-02-17（二手来源）[7] | agents 产品未知；智能钱包 2024-09-11 [42] | 2026-03-26 [20] | 不适用 | 未知 |

基础设施对照（只列与表格相关的维度）：

| 维度 | Privy | Turnkey | Altana |
|---|---|---|---|
| 密钥 / 执行层 | TEE 执行策略 [28] | TEE 执行策略 [32] | 链上 session，验证不通过就回滚 [36] |
| 谁能绕过 / 改策略 | wallet owner / key quorum [30] | root quorum 绕过策略引擎 [33] | admin key 授予和撤销 session [36][39] |
| 默认 | 默认拒绝 [28] | 默认拒绝；non-root 用户 [32] | 不设 `calls` 等于不限制调用 [36] |
| Mantle | 可配置任意 EVM 链，示例中有 Mantle [31] | 曲线层面可以签名；代付链表里没有 Mantle [34][35] | 不支持 [37] |

---

## 来源

1. **PRIMARY** https://docs.phantom.com/phantom-mcp-server （2026-10-21）：专用 agent 钱包、三组工具，KMS 验章、执行策略后签名。
2. **PRIMARY** https://docs.phantom.com/phantom-mcp-server/tools （2026-10-21）：v1.2.9 的 30 个工具；`confirmed` 流程；perps 写操作直接提交；Supported networks 表。
3. **PRIMARY** https://docs.phantom.com/phantom-mcp-server/account-types （2026-10-21）：agent 钱包与个人钱包隔离，初始余额为 0。
4. **PRIMARY** https://docs.phantom.com/sdks/guides/how-kms-works （2026-10-21）：TEE、policy engine enclave 与 signer enclave。
5. **PRIMARY** https://docs.phantom.com/phantom-mcp-server/setup （2026-10-21）：session.json 无限期保存，权限 0600。
6. **PRIMARY** https://docs.phantom.com/resources/mcp-server （2026-10-21）：文档 MCP 只有 `SearchPhantomDeveloper` 一个工具。
7. 二手来源：https://www.spendnode.io/blog/phantom-mcp-server-ai-agents-sign-swap-transfer-solana-ethereum-bitcoin （2026-10-21）：称 2026-02-17 在 X 上宣布，当时是 preview，5 个工具。
8. **PRIMARY** https://docs.crossmint.com/agents/overview （2026-10-21）：Cards、Wallets、Checkouts 三个产品；“Card limits hold at Visa and Mastercard, wallet limits hold onchain”。
9. **PRIMARY** https://docs.crossmint.com/agents/wallets/overview （2026-10-21）：非托管智能钱包，agent 作为 signer，带限额、对手方和时间窗口，链上执行。
10. **PRIMARY** https://docs.crossmint.com/agents/payment-methods/stablecoin-wallets/authorize-agent （2026-10-21）：`prepareOnly` 与 OTP 批准；signer secret 的风险。
11. **PRIMARY** https://docs.crossmint.com/wallets/guides/signers/scopes （2026-10-21）：只支持 `transfer` scope；额度、interval、recipients、expiresAt；policy contract。
12. **PRIMARY** https://docs.crossmint.com/wallets/architecture （2026-10-21）：ERC-4337 + ERC-7579；权限由合约执行；gas 支付方式；可脱离 Crossmint。
13. **PRIMARY** https://docs.crossmint.com/introduction/supported-chains （2026-10-21）：Mantle 钱包 ✅，Onramp ✱。
14. **PRIMARY** https://docs.crossmint.com/agents/cards/overview （2026-10-21）：order intent；卡网络执行限额；agent 看不到卡号；chargeback 照常；与 Link 的对比。
15. **PRIMARY** https://docs.crossmint.com/agents/cards/rails-and-pci （2026-10-21）：各支付通道的限额执行方；encrypted card 的回退规则。
16. **PRIMARY** https://docs.crossmint.com/agents/how-agents-pay （2026-10-21）：“Limits enforced only in application code do not hold”；限额执行方表。
17. **PRIMARY** https://docs.crossmint.com/agents/payment-methods/stablecoin-wallets/server-agent-wallets （2026-10-21）：后端作 root signer，没有用户兜底（页面标注“under construction”）。
18. **PRIMARY** https://developer.trustwallet.com/developer/agent-sdk/key-management （2026-10-21）：本地 HD 钱包、AES-256-GCM、密码解析顺序。
19. **PRIMARY** https://developer.trustwallet.com/developer/agent-sdk/cli-reference （2026-10-21）：watcher 原文；`serve`；transfer、x402 参数。
20. **PRIMARY** https://trustwallet.com/blog/company/introducing-the-trust-wallet-agent-kit-twak-your-ai-agent-can-now-act-on-crypto （2026-10-21）：2026-03-26 发布；两种模式；能力列表。
21. Trust Wallet 官方文档的 GitBook 问答接口：https://developer.trustwallet.com/developer/agent-sdk/cli-reference.md?ask=… （2026-10-21）：由官方文档自动生成的回答，不是正文；说文档没有确认 Mantle。
22. **PRIMARY** https://docs.safe.global/home/ai-agent-quickstarts/introduction （2026-10-21）：4 种 agent 配置。
23. **PRIMARY** https://docs.safe.global/home/ai-agent-quickstarts/basic-agent-setup （2026-10-21）：官方不推荐 1/1。
24. **PRIMARY** https://docs.safe.global/home/ai-agent-quickstarts/human-approval （2026-10-21）：agent 提案、人类多签执行。
25. **PRIMARY** https://docs.safe.global/home/ai-agent-quickstarts/agent-with-spending-limit （2026-10-21）：Allowance Module，按代币设额度，一次性或周期重置。
26. **PRIMARY**（Gnosis Guild，不是 Safe）https://docs.roles.gnosisguild.org/ （2026-10-21）：按函数、参数设权限，速率和阈值上限。
27. **PRIMARY** https://docs.privy.io/wallets/overview/solutions/agent-wallets （2026-10-21）：两种授权模型；Agent CLI 会话最长 30 天。
28. **PRIMARY** https://docs.privy.io/controls/policies/overview （2026-10-21）：TEE 执行策略，默认拒绝，可约束导出。
29. **PRIMARY** https://docs.privy.io/recipes/agent-integrations/agent-cli （2026-10-21）：设备授权；临时签名密钥。
30. **PRIMARY**（搜索摘录，没有单独打开页面）https://docs.privy.io/recipes/agent-integrations/agentic-wallets （2026-10-21）：key quorum 审批策略更新和导出。
31. **PRIMARY**（搜索摘录）https://docs.privy.io/basics/react/advanced/configuring-evm-networks （2026-10-21）：任意 EVM 链，示例包含 mantle。
32. **PRIMARY** https://docs.turnkey.com/solutions/company-wallets/agentic-wallets （2026-10-21）：non-root 用户；root 绕过策略；共识规则。
33. **PRIMARY** https://docs.turnkey.com/concepts/users/root-quorum （2026-10-21）：root quorum 不经过策略引擎。
34. **PRIMARY**（搜索摘录）https://docs.turnkey.com/features/transaction-management （2026-10-21）：代付链表里没有 Mantle；Enterprise 专属。
35. **PRIMARY**（搜索摘录）https://docs.turnkey.com/features/networks/overview （2026-10-21）：曲线层面支持所有 EVM 链。
36. **PRIMARY** https://docs.altana.network/concepts/sessions （2026-10-21）：链上 session；calls 与 spend；省略 calls 等于不限制。
37. **PRIMARY** https://docs.altana.network/concepts/networks/ （2026-10-21）：BNB 默认，Ethereum 可执行，Base 只做验证。
38. **PRIMARY** https://docs.altana.network/sdk/execute （2026-10-21）：relay、feeToken、EIP-7702 委托代码。
39. **PRIMARY**（搜索摘录）https://docs.altana.network/sdk/revoke-session （2026-10-21）：撤销不可恢复；L2 cache 不会同步撤销。
40. **PRIMARY** https://docs.stripe.com/agentic-commerce/link-cli （2026-10-21）：Link Agent Wallet；agent 付款支持美国和加拿大。
41. **PRIMARY** https://docs.stripe.com/agentic-commerce/link-cli/use-link-wallet-pay-online （2026-10-21）：spend request 逐笔批准；30 分钟审批窗口；账户限额；卡号可能泄露进上下文。
42. **PRIMARY**（搜索摘录）https://www.crossmint.com/announcement/introducing-crossmint-smart-wallets （2026-10-21）：智能钱包 2024-09-11 发布。

## 命令与输出

没有运行本地命令。所有验证都通过网页抓取完成。`twak chains` 和 Phantom 工具的实测没有做。

## GPT 资料的修正

- §2.5 关于 TWAK、Altana、Turnkey 的描述与一手文档一致（本地加密、链上 session、root 绕过）。需要补充 Altana 的一个细节：省略 `calls` 时，session 在支出上限内可以调用任意合约，不只是“可能允许” [36]。
- §1.2 把 Privy delegated signing 归入“用户账户的受限代理权限”，与一手文档一致 [27]。但 Privy 还有 agent 自有钱包和 Agent CLI 两种形态 [27][29]，GPT 资料没有提到。
- §1.1 “Privy 区分 agent 自主管理钱包与 delegated signing”：一致 [27]。
- GPT 资料完全没有覆盖 Phantom、Crossmint、Safe 和 Stripe Link。brief 把 Phantom 描述为“MCP server”，这需要区分两个 server：只有 `@phantom/mcp-server` 是钱包 [1][6]。
- “BNB Agent Studio v3 钱包选项包括 TWAK / Altana / Turnkey（2026-09-03）”：本路没有核实，留给 lane B。

## 矛盾

- **Crossmint 限权范围**：概览页说可以限制 “addresses or protocols”，并且可以 swap 和调用任意合约 [9]；scopes 文档说只支持 `transfer` 类型的 scope [11]。两处没有调和，带 scope 的 signer 调用合约时受什么约束不明确。
- **Stripe Link 的地区**：Crossmint 的对比说 Link 的 agent 卡“available only in the US”[14]；Stripe 当前文档写的是美国和加拿大 [40][41]。Crossmint 页面可能已过时。
- **TWAK 规则**：博客说开发者可以事先配置资产和限额 [20]；CLI 文档里只有每条命令的参数，没有持久化的策略配置 [19]。

## 开放问题

1. Phantom agent 钱包的 KMS 策略由谁设置、用户能否修改、默认限额是多少；能否导出私钥；gas 由谁支付。
2. Crossmint 带 scope 的 signer 调用合约（swap、bridge）时受什么约束；哪个 ERC-7579 模块执行 scope，是否经过审计。
3. TWAK 是否支持 Mantle（需要运行 `twak chains`）；能否导出助记词。
4. Safe 是否部署在 Mantle；Allowance Module 是否只覆盖 ERC-20 转账（需要读合约源码）。
5. Crossmint agents 产品和 Stripe Link Agent Wallet 的发布日期；Phantom MCP 发布日期的一手来源。
6. 钱包路线下，谁承担争议和退款：没有找到任何一方的一手文档（见 C20）。

---

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| C1 | Phantom 有两个 MCP server：文档 MCP 只有 `SearchPhantomDeveloper` 一个工具；钱包 MCP 是 `@phantom/mcp-server` | [6] 概述 / Available tools；[1] 首段（2026-10-21） | observed | |
| C2 | Phantom MCP v1.2.9 的 `tools/list` 返回 30 个工具，覆盖余额、转账、签名、swap、rebalance 和 Hyperliquid perps | [2] 页首说明；[1] What agents can do（2026-10-21） | observed | |
| C3 | Phantom agent 登录后得到一个新的专用钱包，余额为 0，需要充值，不和个人钱包共享资金 | [3] Why your agent has a different wallet；[1] Warning（2026-10-21） | observed | |
| C4 | Phantom agent 钱包的签名在 KMS 的 TEE 中完成：policy engine enclave 先执行策略，再由 signer enclave 签名 | [4] Core components / How signing works；[1] How agent wallets sign（2026-10-21） | observed | |
| C5 | Phantom 的 send / transfer 默认先模拟，用户批准后才传 `confirmed: true`；大部分 perps 写操作直接提交 | [2] Warning 与 perps 小节（2026-10-21） | observed | |
| C6 | Phantom MCP 的会话保存在本地 session.json，删除前一直有效 | [5] Session management（2026-10-21） | observed | |
| C7 | Phantom MCP 支持的 EVM 网络是 Ethereum、Polygon、Base、Robinhood Chain，没有 Mantle；Monad 和 Sui 已弃用 | [2] Supported networks（2026-10-21） | observed | |
| C8 | Phantom 的人工确认写在工具协议里，靠 agent 遵守，不是服务端统一强制的 | 由 C5 推出：perps 写操作不经确认直接提交，`confirmed` 只是参数 | inferred | |
| C9 | Phantom MCP 于 2026-02-17 在 X 上宣布（二手来源） | [7]（2026-10-21） | inferred | |
| C10 | Crossmint 的 EVM 钱包是 ERC-4337 + ERC-7579 智能合约钱包，signer 权限由合约执行，不靠后端 | [12] The Core / The Control Layer（2026-10-21） | observed | |
| C11 | Crossmint agent 的 key 作为 delegated signer 加进用户钱包；超出授权范围的交易在钱包层被拒，用户可以随时移除 signer | [9] How It Works / FAQs（2026-10-21） | observed | |
| C12 | Crossmint 的 scope 只支持 `transfer` 类型：每个 scope 是一条链上的一个代币，可设额度、重置周期和收款白名单；签名者另有 `expiresAt` | [11] What Scopes Restrict（2026-10-21） | observed | |
| C13 | 不带 scope 的 Crossmint signer 可以不受限地花代币 | [11] What Scopes Restrict（2026-10-21） | observed | |
| C14 | Crossmint 授权 agent 时，如果漏掉 `prepareOnly: true`，server signer 会自己批准授权，用户看不到提示 | [10] Steps 2 / Common Gotchas（2026-10-21） | observed | |
| C15 | 持有 `CROSSMINT_SIGNER_SECRET` 的人，可以为所有授权过这个 signer 的钱包签名 | [10] Warning（2026-10-21） | observed | |
| C16 | Crossmint 钱包支持 Mantle（Wallets ✅），Onramp 需要联系销售（✱） | [13] 表格 Mantle 行（2026-10-21） | observed | |
| C17 | Crossmint Agent Cards 走 Visa Intelligent Commerce 或 Mastercard Agent Pay 时由卡网络执行限额，agent 只拿到 order intent ID 或一次性卡号 | [14] Key Features / FAQs；[15] Card Rails（2026-10-21） | observed | |
| C18 | 卡不在网络通道里时，Crossmint 回退到 encrypted card，限额改由 Crossmint（Agent Checkouts）或集成方代码执行 | [15] Card Rails / With Your Own Checkout（2026-10-21） | observed | |
| C19 | Crossmint 卡路线的每笔购买都走用户自己的卡，退款和 chargeback 照常 | [14] FAQs（2026-10-21） | observed | |
| C20 | crypto 路线的限额由链上合约执行，没有卡网络那样的退款和 chargeback 机制；争议由谁承担，钱包文档没有说明 | 由 C11、C17、C19 推出；[16] 只说卡不适合小额高频支付 | inferred | |
| C21 | TWAK 在本地生成 BIP39 HD 钱包，助记词用 AES-256-GCM 加密（密钥由密码经 PBKDF2 派生），存在 `~/.twak/wallet.json` | [18] How Keys Are Stored（2026-10-21） | observed | |
| C22 | TWAK 签名时依次从 `--password`、`TWAK_WALLET_PASSWORD`、系统钥匙串取密码 | [18] Password Resolution（2026-10-21） | observed | |
| C23 | TWAK 的自动化任务只在 watcher（`twak serve --watch`）运行时执行，否则“saved but never run” | [19] serve / Running automations in the background（2026-10-21） | observed | |
| C24 | TWAK 通过 `twak serve` 提供 MCP（stdio）或 REST；于 2026-03-26 发布 | [19] serve；[20] 发布日期（2026-10-21） | observed | |
| C25 | TWAK 的 agent wallet 模式无需逐笔批准；WalletConnect 模式由用户逐笔批准 | [20] 2 Ways to Deploy（2026-10-21） | observed | |
| C26 | TWAK 的限额护栏是 CLI 参数（`--max-usd` 默认 10000，可用 `--skip-safety-check` 跳过；x402 的 `--yes` 跳过逐笔确认） | [19] transfer / x402 request（2026-10-21） | observed | |
| C27 | 能执行 shell 或读取环境变量的 agent 进程，可以拿到 TWAK 的签名能力，也能跳过护栏 | 由 C22、C26 推出 | inferred | |
| C28 | TWAK 文档没有确认支持 Mantle | [21] 官方文档问答接口（2026-10-21） | observed | |
| C29 | Safe 官方有 4 种 AI agent 配置，并明确不推荐 1/1 | [22] Introduction；[23]（2026-10-21） | observed | |
| C30 | Safe 的 Allowance Module 可以按代币给 delegate 设一次性或周期重置的额度 | [25]（2026-10-21） | observed | |
| C31 | Zodiac Roles（Gnosis Guild）可以按函数和参数值限定权限，并设速率和阈值上限 | [26] Key Features（2026-10-21） | observed | |
| C32 | Privy 有两种模型：agent 自有钱包；delegated signing（按策略限定的 authorization key，可撤销） | [27] Authorization models（2026-10-21） | observed | |
| C33 | Privy 的策略默认由 TEE 执行（覆盖签名、交易、导出），默认拒绝；交易模拟和合规筛查不算策略执行 | [28] Policy evaluation（2026-10-21） | observed | |
| C34 | Privy Agent CLI 用设备授权，每笔交易用临时签名密钥，会话最长 30 天 | [29] How it works / Session；[27]（2026-10-21） | observed | |
| C35 | Turnkey 的 root 用户绕过策略引擎，root quorum 的操作不能被任何策略限制；agent 应该是默认拒绝的 non-root 用户 | [32] Warning；[33] Technical overview（2026-10-21） | observed | |
| C36 | Altana 的 session 由链上验证执行，含 calls 和 spend 两类权限；省略 `calls` 等于在支出上限内不限制调用 | [36] Permission shapes / Notes（2026-10-21） | observed | |
| C37 | Altana 默认链是 BNB，也支持 Ethereum；Base 只做验证；不支持 Mantle | [37] Supported SDK exports（2026-10-21） | observed | |
| C38 | Stripe Link Agent Wallet 每笔 spend request 都要客户批准（30 分钟窗口），返回一次性凭证；agent 付款支持美国和加拿大客户 | [41] How it works / Wait for approval；[40] Availability（2026-10-21） | observed | |
| C39 | Crossmint 说 Link 的 agent 卡只在美国可用，与 Stripe 当前文档（美国和加拿大）不一致，前者可能过时 | 由 C38 推出；[14] FAQ | inferred | |
| C40 | 在本路的产品和基础设施中，文档确认支持 Mantle 的有 Crossmint 钱包（✅）和 Privy（任意 EVM 链）；Phantom 和 Altana 不支持；TWAK、Safe 和 Turnkey 的完整支持未确认 | 由 C7、C16、C28、C37 推出；[31][34] | inferred | |
| C41 | “策略写在钱包合约里”的产品（Crossmint、Altana、Safe）和“策略在 TEE 里”的产品（Phantom、Privy、Turnkey），在“谁能改策略”上的信任假设不同 | 由 C4、C10、C33、C35、C36 推出 | inferred | |
| C42 | Crossmint 带 scope 的 signer 在调用合约（swap）时，可能不受 transfer scope 的约束 | [9] 与 [11] 互相矛盾，未经验证 | speculative | |

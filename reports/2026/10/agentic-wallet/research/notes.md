# 调研索引：Agentic Wallet

调研日期 2026-10-21。四路并行 + 主会话综合。外部资料 `agentic-wallet-deep-dive.md`（ChatGPT Deep Research）只作线索，论断已追到一手来源。台账见 [ledger.md](ledger.md)（A / B / C / S / N 前缀）。

| 分册 | 范围 |
|---|---|
| [notes-products-a.md](notes-products-a.md) | MetaMask Agent Wallet、Advanced Permissions；Coinbase Agentic Wallet、Wallet MCP、Spend Permissions |
| [notes-products-b.md](notes-products-b.md) | Binance Agentic Wallet；BNB Agent Studio（TWAK / Altana / Turnkey）；OKX Agentic Wallet |
| [notes-products-c.md](notes-products-c.md) | Phantom MCP、Crossmint、TWAK、Safe、Stripe Link；Privy / Turnkey / Altana 对照 |
| [notes-stack.md](notes-stack.md) | x402、ERC-8004、ERC-8183、AP2、ERC-7715 / 7710、4337、7702、MPP；提示注入与工程风险；需求数据；Mantle |

## 每个研究问题一句话

1. **产品形态**：三种账户模式——独立预算钱包（多数主流产品）、主账户受限授权（智能账户路线）、主钱包逐笔批准；入口统一走 CLI + skills，MCP 只在部分产品（Coinbase、Phantom、TWAK）是主入口（N1、A4、A34、C2）。
2. **技术原理**：密钥托管分 TEE / MPC / 本地加密 / 智能账户四种；核心四家的独立钱包，策略都在厂商链下执行（或未公开），链上强制只出现在智能账户路线；“每笔先确认”多数是 skill 层规则（N2、N3、N4）。
3. **要解决的问题**：用户的五个判断方向都对，但要修正——私钥问题实为“无界签名能力”问题；额度 ≠ 损失上限；确定性执行已是共识；身份 ≠ 一等公民；活动空间的需求证据还很薄。补充：提示注入利用已有权限、已签授权在撤销后仍有效、持续运行需要常驻进程、x402 重复付款（N5–N9、S23、S31、S29、A20）。
4. **活动场景**：公开数据显示 x402 日均约 $44K、每笔约 $0.40，刷量占比高；BNB Chain 自认需求待证明。“agent 选目标、bot 执行”是合理推论但没有实证（S32、S34、B32、S38、N11）。
5. **钱包之外**：x402 管付款、8004 管身份、8183 管任务托管、AP2 管购买授权与证据、7715/7710 管权限请求与赎回、4337/7702 管账户；每一层都明确声明不保证相邻层的事（S1–S22）。
6. **Mantle**：链层基础件大多具备（7702、4337 bundler/paymaster、8004 注册表、USDC/USDT0 有 3009）；缺 x402 生产 facilitator、智能账户可用的 USDC 支付路径和钱包侧的安全覆盖（S50、S45、N12）。

## GPT 资料中被修正的地方

- 用户给的 MetaMask 推文（约 2026-10-14）不是上线公告，而是接入某个 bot 的公告；Agent Wallet 2026-06-08 Early Access、2026-08-06 GA（A1–A3）。
- Coinbase Agentic Wallet 官方博文日期 2026-02-11（二手称 02-10）（A33）。
- Coinbase MCP 版完全不能 send / trade，不是“不开放全部”；遗漏了 Coinbase Wallet MCP（逐笔批准）这第三条路径（A34、A47、A48）。
- MetaMask 多跳计算“可能重复”应为确定重复计数；导出私钥官方说法自相矛盾（A14、A28）。
- “每笔先确认”是 skill 规则，服务端只在越界时强制（A19、B38）。
- Binance 漏掉的硬约束：转账只能到地址簿白名单且不可关闭、四类额度独立无总上限、Dev Mode 余额 ≤ 10,000 USDT（B7、B8、B14）。
- OKX 可以导出助记词（导出后 agent 失效）；“限额不覆盖授权后第三方转账”无法核实（B39、B40）。
- BNB“需求仍需验证”的出处是 BNB Chain 2026-07-16 博客，GPT 挂错到 Coinbase 文档；ERC-8004/8183 Draft 状态也挂错了出处（B32、notes-stack §GPT 修正）。
- Altana“可能允许任意合约”原文是确定的“omitted = unrestricted”（B28）。
- x402 默认 flow 是 authorization（先验签、后结算），不是“先付款”（S2）。
- Mantle：7702 已随 Skadi 启用、Pimlico 支持 4337、ERC-8004 已部署，GPT 都没给出（S39、S41、S42）。
- GPT 没有任何需求数据，也没提刷量（S32–S36）。

## 分册之间的矛盾

- Phantom MCP 支持链：tools 页列 Solana、Ethereum、Polygon、Base、Robinhood Chain（C7）；setup 页 Features 写 Solana、Ethereum、Bitcoin（S49）。两者都不含 Mantle，页面以 C7 为准。
- Binance 支持链：开发文档 4 条，skill 示例 7 条（B18、S47），都不含 Mantle。
- BNB Agent Studio MVP：路线图 06-08，博客 07-01（B22）。

## 开放问题

- Coinbase Agentic Wallet 与 OKX 的限额执行层（A39、B 开放问题 2）。
- MetaMask 在 Mantle 上的 relay / swap 是否可用（需 `mm chains list --json`）。
- Binance MPC keyless 与 SAS FAQ 提到的 TEE 的关系。
- 有没有生产 facilitator 实际支持 `eip155:5000`；Mantle 上 Permit2 / x402ExactPermit2Proxy 是否部署。
- Crossmint 带 scope 的 signer 调合约时受什么约束（C42）。
- Artemis“real vs gamed”当前数值；Virtuals ACP 真实付费数据。
- 未做真实资金测试和安全审计。

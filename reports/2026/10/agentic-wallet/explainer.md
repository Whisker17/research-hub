---
template: research
title: Agentic Wallet：产品形态、技术原理与 agent 的活动空间
subtitle: 主流 agent 钱包是“独立预算钱包 + 厂商链下策略”，链上可验证的限权只在智能账户路线出现；真实付费需求还很小。
cols: 4
type: 技术调研 · 产品对比
audience: 懂 EVM 和钱包 / 账户抽象基础的开发者与产品，还没系统看过 agentic wallet
scope: MetaMask、Coinbase / Base、Binance / BNB Chain、OKX，扩展到 Phantom、Crossmint、TWAK、Safe；协议栈、活动场景、Mantle 启示
evidence: 207 条论断台账（observed 153 / inferred 46 / speculative 8），一手来源访问于 2026-10-21
date: 2026-10-21 · v1
---
结论先行：主流 agent 钱包大多是“独立预算钱包 + 厂商链下策略”。密钥放在 [[TEE]] 或 [[MPC]] 里，额度由厂商服务端执行；“每笔先确认”多数只是写给 agent 的 [[skill]] 规则（[F1](#F1)、[F2](#F2)）。链上可验证的限权只出现在[[智能账户]]路线。

你的五个判断方向都对，但有三处要改写：要防的是无界签名能力；额度不是损失上限；链上身份不等于一等公民（[F3](#F3)–[F6](#F6)）。真实付费需求还很小：[[x402]] 全网每天约 $44K（[F7](#F7)）。Mantle 链层基础件大多就绪，缺 x402 生产结算路径和钱包侧覆盖（[F10](#F10)）。

## A Agent 钱包要回答的五个问题 {sheet meta="framework"}
```tree list
`密钥` 放在哪里 | TEE、MPC、本地加密、智能账户
`策略` 在哪一层执行 | skill 规则、服务端、TEE、链上合约
`改规则` 谁能改 | 用户 App、admin key、root 用户
`能力` 默认能做什么 | 只能付 x402，到任意 calldata
`退出` 能否带走资产 | 导出助记词、合约账户迁移
```

## B 三种账户模式 {sheet meta="account modes"}
| 模式 | agent 拿到什么 | 代表 |
|---|---|---|
| 独立预算钱包 | 一个要充值的新地址 | MetaMask、Coinbase、Binance、OKX、Phantom |
| 主账户受限授权 | 主账户上的受限 signer | Advanced Permissions、Spend Permissions、Crossmint、Altana、Safe |
| 主钱包逐笔批准 | 只能发请求，用户逐笔批 | Coinbase Wallet MCP、Stripe Link |

## C 核心四家：密钥与策略层 {sheet span=2 meta="2026-10"}
| 产品 | 密钥 | 策略在哪执行 | Mantle |
|---|---|---|---|
| MetaMask Agent Wallet | TEE（或本地 BYOK） | 服务端 YAML + 2FA | warn 支持，无 Shield |
| Coinbase Agentic Wallet | TEE | 未公开 | no |
| Binance Agentic Wallet | MPC | Binance API 层 | no |
| OKX Agentic Wallet | TEE | Web 门户设置，执行层未公开 | warn 支持，无 x402 |

## D 关键数字 {sheet span=2 meta="numbers"}
| 量 | 值 | 来源 |
|---|---|---|
| x402 全网 24 小时 | 101.7K 笔、$44.2K、均值 $0.40 | Artemis，10-19 [42] |
| x402 30 天交易数 | −45.88% | Artemis [42] |
| ERC-8004 注册数 | 819,538 个 agent | 8004scan [43] |
| 带有效服务端点的注册 | 3%–15% | 学术研究 [43] |
| 注入攻击成功率（加防护后） | 1.4% | Anthropic [40] |

## E 时间线 {sheet span=2 meta="2026"}
```timeline
2026-02-11 | Coinbase Agentic Wallet | CLI 与 MCP 两种形态
2026-02-16 | Mantle 部署 ERC-8004 | 身份与声誉注册表
2026-03-18 | OKX Agentic Wallet | Onchain OS 的执行组件
2026-03-26 | Trust Wallet TWAK | 本地密钥 CLI
2026-04-24 | Binance Agentic Wallet | MPC keyless 独立钱包
2026-06-08 | MetaMask Early Access | 限量 CLI
2026-07-01 | BNB Agent Studio v1 | 部署 + 钱包 + x402 + 8004
2026-08-06 | MetaMask 正式上线 | Guard / Beast 模式
*2026-08-13 | Agent Studio v2 | agent 可以收款，加入 Altana
2026-09-03 | Agent Studio v3 | 加入 Turnkey
2026-10-14 | MetaMask 接入 bot | 你给的推文（推算日期）
```

## F 结论 {sheet span=4}
```callout ok 钱包是入口，不是全部
- **现状**：主流产品给 agent 一个独立钱包，靠厂商链下策略限权；“确认”多是 skill 规则。
- **修正**：要限制的是签名能力的边界，不是私钥可见性；额度、身份都不是安全或信任的保证。
- **需求**：x402 每天约 $44K，刷量占比高；先验证小额服务采购。
- **Mantle**：链层件已具备，补 x402 结算路径与钱包覆盖。
```

## G 如何阅读 {depth=1}
```callout info 默认你已知道（本文不解释）
- EOA 用私钥签名，签名就等于授权
- ERC-20 的 `approve` 让第三方花你的代币
- 合约调用失败会回滚，状态不变
- LLM 可以通过工具调用（tool calling）执行命令
```
- **5 分钟**：看总览（A–F）和导语。
- **30 分钟（做产品或选型）**：读 [前置知识](#panel-I)、[一笔操作要过的关](#panel-J)、[核心四家](#panel-K)、[发现](#panel-M)、[你的五个判断](#panel-N)。
- **30 分钟（做协议或链）**：读 [钱包之外的协议栈](#panel-O)、[活动场景与需求](#panel-P)、[Mantle 启示](#panel-Q)。
- **完整**：再读 [方法与证据](#panel-S)，它列出调研方法和被修正的资料。

## H 背景动机 {depth=2}
**问题**：agent 要参与链上经济，就要能签名和付钱。直接把私钥交给 agent 风险太大；每笔都让人确认，agent 又失去价值。

各家 agent 钱包都在回答“给多少权力、放在哪一层约束”。

**为什么现在**：
- 2026 年 2 月到 8 月，Coinbase、OKX、Binance、MetaMask 相继推出 agent 钱包（见 E）[7][15][16][20]。
- 你给的 MetaMask 推文约发于 2026-10-14，内容是 Agent Wallet 接入某个 bot，不是上线公告 [7]。
- BNB Chain 把钱包、部署、支付、身份整合进 Agent Studio，v2 起 agent 可以收款 [23]。

**范围**：核心四家的产品形态、技术原理与边界；扩展生态按统一维度对比；钱包周边协议；活动场景；Mantle 启示。

**非目标**：真实资金测试与安全审计；投资建议；协议规范的逐字段细节。

**贯穿全文的例子**（示例，非真实产品配置）：一个研究 agent 每天用不超过 10 USDC 购买付费数据 API，按 x402 按次付款。后面每个面板都先看这笔钱在各家产品里怎么走。

## I 前置知识 {depth=2}
```excalidraw q="读懂各家 agent 钱包，需要先懂哪些概念？按什么顺序？" read="箭头表示先学 → 后学；灰色虚线框是默认已知；绿色是本文的主题。" takeaway="B-0、B-1 讲密钥放在哪；B-2 讲链上限权；B-3 解释为什么额度会漏；B-4、B-5 讲 agent 怎么付钱和怎么接入。" name=prereq-map kind=前置知识地图
{"grid": {"w": 300, "h": 110}, "defaults": {"w": 200, "h": 60},
 "nodes": [
   {"id": "eoa", "label": "私钥签名（已知）", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "appr", "label": "ERC-20 approve（已知）", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "tool", "label": "LLM 工具调用（已知）", "col": 0, "row": 3, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 TEE", "col": 1, "row": 0, "color": "blue"},
   {"id": "b1", "label": "B-1 MPC", "col": 1, "row": 1, "color": "blue"},
   {"id": "b2", "label": "B-2 智能账户", "col": 2, "row": 0, "color": "blue"},
   {"id": "b3", "label": "B-3 签名授权", "col": 1, "row": 2, "color": "blue"},
   {"id": "b4", "label": "B-4 x402", "col": 2, "row": 2, "color": "blue"},
   {"id": "b5", "label": "B-5 MCP 与 skill", "col": 1, "row": 3, "color": "blue"},
   {"id": "prod", "label": "产品拆解与发现", "col": 3, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "stack", "label": "协议栈与 Mantle", "col": 3, "row": 3, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "eoa", "to": "b0"}, {"from": "eoa", "to": "b1"}, {"from": "b0", "to": "b2"},
   {"from": "appr", "to": "b3"}, {"from": "b3", "to": "b4"}, {"from": "tool", "to": "b5"},
   {"from": "b2", "to": "prod"}, {"from": "b1", "to": "prod"}, {"from": "b3", "to": "prod"},
   {"from": "b4", "to": "stack"}, {"from": "b5", "to": "stack"}
 ]}
```

```prereq B-0 l1 5min
# 可信执行环境（TEE）
是什么: CPU 里一块隔离的执行区。密钥在里面生成和使用，宿主系统和运维人员读不到。
为什么需要: MetaMask server-wallet、Coinbase、OKX、Phantom 都把 agent 钱包的密钥放在 TEE 里。agent 只拿到“请求签名”的凭证。
例子:
~~~
agent → 钱包服务：sign(tx)
TEE：检查策略 → 用内部密钥签名 → 返回签名
agent 全程拿不到私钥
~~~
误解: 误解：密钥在 TEE 里，agent 就安全。事实：TEE 只保护密钥。agent 能请求什么签名，取决于策略。
深入: [32] Privy Policies 文档“Policy evaluation”一节
```

```prereq B-1 l2 3min
# 门限签名（MPC）
是什么: 私钥被拆成几份，分在不同机器上。签名时各方协作计算，任何一处都不会拼出完整私钥。
为什么需要: Binance Agentic Wallet 用 MPC keyless 架构；规则在 Binance API 层执行。
深入: [17] Binance 开发文档 Welcome 页“MPC Keyless Security”
```

```prereq B-2 l1 8min
# 智能账户与 session key（smart account / session key）
是什么: 智能账户是合约账户，签名校验规则写在合约里。[[session key]] 是主人签发的临时密钥，可以被限定在指定的合约、函数、额度和有效期内。越界的调用在链上回滚。
为什么需要: 只有这条路线能做到“策略在链上、厂商下线也有效”。[[EIP-7702]] 让 EOA 委托给合约代码；[[ERC-4337]] 提供 [[paymaster]] 代付 gas。
例子:
~~~
session = { calls: [Router.swap], spend: 100 USDC/天, expiry: 30 天 }
agent 调用 Vault.withdraw → 验证失败 → 回滚
~~~
误解: 误解：用了 session key 就安全。事实：Altana 不配 calls 时，session 在额度内可以调用任意合约。
深入: [26] Altana Sessions 文档
```

```prereq B-3 l1 6min
# 签名授权：Permit2 与 EIP-3009
是什么: 不发交易，只签一条链下消息，就把花钱的权力交给别人。[[Permit2]] 授权第三方从你的地址转走代币；[[EIP-3009]] 授权一笔指定金额的转账，在有效期内任何人都能提交。
为什么需要: 很多钱包只按已发交易统计额度，不统计签出去的授权。MetaMask 的额度就不计 Permit2 签名 [3]。
例子:
~~~
3009 授权：from, to, value, validAfter, validBefore, nonce
暂停 agent 之后，窗口内这条授权仍可被提交
失效办法：cancelAuthorization，或等过期
~~~
误解: 误解：撤销 agent 的权限，已签的授权就失效。事实：链下签名只能在链上 cancel 或等过期。
深入: [48] USDT0 文档 EIP-3009 一节
依赖: B-0
```

```prereq B-4 l1 6min
# x402（HTTP 402 按请求付款）
是什么: 服务端返回 HTTP 402 和报价；客户端签一条付款授权，带着它重发请求。[[facilitator]] 负责验签和上链结算，不托管资金。
为什么需要: agent 购买数据和 API 主要走这条路。默认流程先验签、后结算：服务端先提供资源，再扣款 [34]。
例子:
~~~
GET /data → 402 { price: 0.01 USDC, payTo, network }
签 EIP-3009 授权 → 重发 GET + PAYMENT 头
→ 200 数据；facilitator 随后上链结算
~~~
误解: 误解：x402 总是先付款后交付。事实：默认的 authorization 流程在服务端运行之后才结算。
深入: [34] x402 文档 Payment Schemes
依赖: B-3
```

```prereq B-5 l2 3min
# MCP 与 skill
是什么: [[MCP]] 是 agent 调用外部工具的协议。[[skill]] 是一组写给 agent 的说明和脚本，告诉它何时调用哪个命令、调用前要做什么。
为什么需要: 多数 agent 钱包靠 skill 安装 CLI。很多“每笔先确认”的规则只写在 skill 里，由 agent 自己遵守。
深入: [19] binance-skills-hub 的 Agentic Wallet SKILL.md
```

## J 一笔操作要过的关 {depth=2}
```excalidraw q="agent 发出的一笔操作，在哪几层可以被拦下？各家把限权放在哪层？" read="从上到下是一笔操作经过的顺序。红色是 agent 自己遵守的层；蓝色由厂商执行；绿色由链上合约执行。" takeaway="越往下，agent 越难绕过；主流产品的限权集中在第 3、4 层。" name=check-layers kind=分层
{"grid": {"w": 600, "h": 105}, "defaults": {"w": 560, "h": 72, "fontSize": 17},
 "nodes": [
   {"id": "l1", "label": "① 模型：读网页、提方案\n提示注入在这一层生效", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "l2", "label": "② skill / 工具规则：每笔先确认\nMetaMask · Binance · OKX · Phantom", "col": 0, "row": 1, "color": "red"},
   {"id": "l3", "label": "③ 厂商服务端策略：额度、白名单、风险分\nMetaMask Guard · Binance API · OKX 门户", "col": 0, "row": 2, "color": "blue"},
   {"id": "l4", "label": "④ TEE / MPC 签名\nCoinbase · OKX · Phantom · Privy · Turnkey · Binance", "col": 0, "row": 3, "color": "blue"},
   {"id": "l5", "label": "⑤ 链上合约：session、caveat、allowance\nAltana · Crossmint · Safe · Advanced Permissions", "col": 0, "row": 4, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "l1", "to": "l2"}, {"from": "l2", "to": "l3"}, {"from": "l3", "to": "l4"}, {"from": "l4", "to": "l5"}
 ]}
```

图中每一层的依据：
- **第 2 层**：MetaMask 的规则要求转账、swap、x402 前展示参数并取得同意，但这是 skill 规则；服务端只在越界或被标为高风险时强制 2FA [2][4]。OKX 后端返回 `confirming` 后，skill 规定用户确认才能带 `--force` 重跑，持有会话的客户端技术上可以越过 [21]。
- **第 3 层**：MetaMask 的 [[Guard Mode]] 白名单和 24 小时 [[outflow 额度]]以 YAML 存在 server wallet 上 [2]。Binance 的日限额和代币范围在 API 层约束 agent [17]。
- **第 4 层**：Turnkey 和 Privy 的策略引擎在 enclave 内运行，默认拒绝 [27][32]。
- **第 5 层**：Altana 的 session 越界在验证时回滚，没有链下信任假设 [26]。MetaMask Advanced Permissions 用链上 [[caveat enforcer]] 执行 [9]。

**贯穿例子走一遍**：研究 agent 买一份数据，下图按默认流程画出每一步。

```uml q="研究 agent 用 x402 买一份数据，钱和检查依次经过哪些参与方？" read="以“独立预算钱包 + 厂商策略”为例；简化：省略了 TLS、重试和余额查询。" takeaway="钱包只管第 5–6 步的签名；报价是否可信、数据是否交付，由协议和服务端决定。"
sequenceDiagram
  autonumber
  participant U as 用户
  participant A as Agent
  participant W as 钱包服务
  participant S as 数据 API
  participant F as Facilitator
  U->>W: 在 App 设预算 10 USDC/天（agent 改不了）
  A->>S: GET /data
  S-->>A: 402 + 报价
  A->>W: 请求签 EIP-3009 付款授权
  alt 在预算和白名单内
    W-->>A: 返回签名
  else 越界或高风险
    W-->>U: 推送 App 确认，或直接拒绝
  end
  A->>S: 重发请求 + PAYMENT 头
  S->>F: verify
  S-->>A: 200 数据
  S->>F: settle（上链 transferWithAuthorization）
  Note over A,S: 超时后先查结算状态，不要重新付款
```

## K 核心四家逐家拆解 {depth=2}
**形态与确认**：

| 产品 | 入口 | 默认确认 | 退出 |
|---|---|---|---|
| MetaMask | `mm` CLI + skills | skill 要求逐笔确认；越界才 2FA | 说法矛盾（见下） |
| Coinbase | CLI `awal` / MCP | x402 自动付款，上限在 UI 设 | 邮箱恢复；导出未写明 |
| Binance | skills + `baw` CLI | 授权后不逐笔确认；风险分 ≥4 推 App | 私钥不能导出 |
| OKX | skills + `onchainos` CLI | 后端 `confirming`，确认后 `--force` | 可导出助记词，之后 agent 失效 |

**能力与边界**：

| 产品 | 能力 | 已知边界 |
|---|---|---|
| MetaMask | 转账、swap / bridge、Hyperliquid perps、Polymarket、earn、x402 | Permit2 签名不计额度；多跳重复计数；Beast 无白名单 |
| Coinbase | CLI：USDC 转账、Base 上交易、x402；MCP：只有 x402 | 限额执行层未公开 |
| Binance | swap、转账（只到白名单地址）、限价、预测市场、DeFi、x402 | 不支持 EIP-191，SIWE 登录做不了；四类额度无总上限 |
| OKX | 转账、swap、跨链、任意 calldata、personalSign、x402 | 策略只有金额与转账白名单 |

**MetaMask Agent Wallet**：
- 两种密钥模式。server-wallet 的密钥在服务端 TEE；[[BYOK]] 把助记词放在环境变量里，本地签名 [1]。
- [[Guard Mode]] 有威胁扫描、网络 / 地址 / 收款方白名单和滚动 24 小时额度；[[Beast Mode]] 只有威胁扫描。切到 Beast 要 2FA [2]。
- 原生币不足时，ERC-20 转账和 swap 自动走 EIP-7702 relay，手续费从所转代币里扣；在支持的链上用 ERC-7821 把 approve 和交易合成一笔 [1]。
- x402 由 skill 里的脚本完成，只支持 `exact` + EIP-3009。脚本无状态，重跑就会再扣一笔 [6]。
- 导出：8 月 GA 博文说可随时导出助记词，10 月 8 日的指南说 server-wallet 目前不能导出 [7][8]。
- Advanced Permissions 是另一个产品：dapp 通过 [[ERC-7715]] 向 MetaMask 扩展请求权限，session account 按 [[ERC-7710]] 赎回，由链上 caveat enforcer 执行 [9]。

**Coinbase / Base**：有三条路径。
- **Agentic Wallet**（独立预算钱包）：CLI 能转 USDC、在 Base 上交易、付 x402；MCP 版只能发现并支付 x402 服务，不能转账或交易 [10][11]。MCP 的单次 / 单会话上限只能在钱包 UI 改，agent 改不了 [12]。
- **Wallet MCP**（原 Base MCP）：连接用户自己的 Coinbase Wallet，每笔写操作都要用户批准 [14]。
- **Spend Permissions**：链上合约，按代币、额度、周期授权一个 spender；与 CDP Policies（Coinbase TEE 内的链下策略）不是一回事 [13]。

**Binance Agentic Wallet**：
- 是 Binance 账户下的独立 keyless 钱包，与主 MPC 钱包分开；开启 [[Secure Auto Sign]] 后不逐笔确认 [16]。
- 安全规则只能在 Binance App 里改，agent 只能读；连接时要在 App 核对 6 位配对码和请求来源 [17]。
- 转账只能发往地址簿白名单，这一限制不能关闭。Swap 与转账、DeFi、x402、Developer Mode 各有一个 24 小时额度，没有总上限 [18]。
- [[Developer Mode]] 才开放任意合约调用：只能在 App 开启，会过期，默认额度 1,000 USDT，钱包余额超过 10,000 USDT 时不能开启 [17][18]。

**OKX Agentic Wallet**：
- 是 [[Onchain OS]] 的执行组件。邮箱 / Google / Apple 登录，密钥在 TEE 内生成和签名，一个钱包最多 50 个子钱包 [20]。
- 默认能力宽：`contract-call` 接受任意 calldata，`sign-message` 默认 personalSign [21]。
- 策略只有四条：单笔限额、日转账限额、日交易限额、转账白名单，由用户在 Web 门户设置 [21]。

**BNB Agent Studio**：不是钱包，是把部署、钱包、模型付费（x402）、身份（ERC-8004）、任务（ERC-8183）整合在一起的平台 [23]。
- 钱包后端可替换：默认本地 keystore，另有 [[TWAK]]（本地加密）、Altana（链上 session）、Turnkey（enclave 策略）[23][24]。
- 签名是固定代码，不是 LLM 能调用的工具；IDE 里的 MCP 只有只读工具 [24]。

## L 扩展生态与基础设施 {depth=2}
**其它 agent 钱包**：

| 产品 | 账户模式 | 密钥 / 策略层 | Mantle |
|---|---|---|---|
| Phantom MCP | 独立预算钱包（新建，余额 0） | KMS 的 TEE 内策略引擎 | no |
| Crossmint | 主账户受限 signer | ERC-4337 + ERC-7579 合约；scope 只有 transfer | ok |
| TWAK | 本地钱包，或连接用户钱包 | 本地加密；护栏是 CLI 参数 | warn 文档未确认 |
| Safe | 多签或 Allowance Module | 链上合约 | warn 未核实 |
| Stripe Link | 用户的 Link 账户 | 每笔客户批准，卡网络 | 不涉及 |

- **Phantom**：send / transfer 默认先模拟、用户批准后再提交；大部分 perps 写操作调用即提交 [29]。
- **Crossmint**：把 agent 的 key 加进用户钱包作为 signer，限额写进链上 signer 配置 [30]。授权时漏传 `prepareOnly`，server signer 会自己批准自己，用户看不到提示 [30]。
- **TWAK**：助记词用 AES-256-GCM 加密存在本机，签名密码可来自环境变量。自动化任务只在 `twak serve --watch` 运行时执行 [28]。
- **Safe**：官方给出 4 种 agent 配置，明确不推荐 agent 作为 1/1 owner [31]。

**基础设施对照**：

| 基础设施 | 执行层 | 绕过点 | Mantle |
|---|---|---|---|
| Privy | TEE，默认拒绝 | key quorum 可改策略 | ok 任意 EVM |
| Turnkey | enclave 策略引擎 | root 用户完全绕过 | warn 签名可，代付无 |
| Altana | 链上 session，越界回滚 | 不配 calls 即不限调用 | no |

**卡网络路线做对照**：Crossmint 的 agent 卡走 Visa Intelligent Commerce 或 Mastercard Agent Pay 时，限额由卡网络执行，agent 看不到卡号；每笔购买走用户自己的卡，退款和 chargeback 照常 [30]。crypto 路线由合约执行限额，但没有对应的退款机制；钱包文档也没写争议由谁承担。

## M 发现 {depth=2}
```finding F1 high
# 主流做法是“独立预算钱包 + 厂商链下策略”
结论: 核心四家都给 agent 一个独立钱包，额度和白名单由厂商服务端、API 或 TEE 执行，或没有公开执行层。由链上合约强制执行的限权，只出现在智能账户路线。
证据: [observed] MetaMask 策略以 YAML 存在 server wallet [2]；Binance 规则在 API 层 [17]；OKX 策略在 Web 门户设置 [21]。[observed] Altana 越界即回滚 [26]；Crossmint 权限由合约执行 [30]；Coinbase Spend Permissions 在链上 [13]。[speculative] Coinbase Agentic Wallet 的限额在服务端或 TEE 执行，文档未写。
影响: 评估一个 agent 钱包，先问“策略在哪执行、厂商下线后还有没有效”。
```

```finding F2 high
# “每笔先确认”多数是 skill 规则，不是服务端保证
结论: 逐笔确认多数写在 skill 或工具参数这一层，由 agent 自己遵守。MetaMask 和 Binance 另有有文档的服务端或 App 侧检查。OKX 和 Phantom 的服务端确认条件各不相同，也没有完整公开。
证据: [observed] MetaMask 规则要求事前确认；服务端在越界、高风险、提额和改策略时强制 2FA [2][4]。[observed] Binance skill 写明“用户明确要求时可跳过确认”；风险分 ≥4 的交易推到 App 确认或自动拒绝 [18][19]。[inferred] OKX 的 `confirming` 可以带 `--force` 重跑越过 [21]。[inferred] Phantom 的 `confirmed: true` 只是参数，perps 写操作调用即提交 [29]。
影响: 被注入的 agent 可以越过 skill 层。安全论证只算有文档的服务端、enclave 或链上约束（见 J 的第 3–5 层）。
```

```finding F3 high
# 要防的不是“看到私钥”，而是没有边界的签名能力
结论: 你的判断 1 方向对，表述要改。BYOK 和 TWAK 把密钥放在 agent 主机上，能读环境变量的进程就能签名。反过来，策略为空的托管钱包，经济上接近把私钥交给 agent。
证据: [inferred] MetaMask BYOK 助记词在 `MM_MNEMONIC`，没有服务端额度 [1][2]。[inferred] TWAK 签名密码可来自环境变量 [28]。[observed] Altana：“`permissions.calls` omitted = unrestricted” [26]。[observed] Turnkey：“Root users bypass the policy engine entirely” [27]。[observed] Crossmint 不带 scope 的 signer 可以不受限地花代币 [30]。
影响: 给 agent 的权限要同时限定目标合约、方法、金额和有效期，并确认 agent 不是 root。
```

```finding F4 high
# 额度不等于损失上限
结论: 你的判断 2 要补上一句：额度只统计已发交易，不含签出去的授权和已有 allowance。暂停 agent 也不会作废它们。
证据: [observed] MetaMask：Permit2 等签名不计入额度；不经它后端提交的交易计量不准；10 USDC→ETH→DAI 计为两笔各 $10 [3]。[observed] EIP-3009 授权在有效窗口内任何人可提交，只能 cancel 或等过期 [48]。[inferred] OKX 策略没有合约和授权维度 [21]。[speculative] OKX 限额不覆盖授权后第三方转账（GPT 资料的说法，原页面需要登录，未核实）。
影响: 停机流程要包含“取消已签授权、撤销 allowance”，不能只在界面上显示“已暂停”。
```

```finding F5 medium
# “确定性执行、减少推理”已是设计共识
结论: 你的判断 3 成立，各家已经这样做：签名和校验由固定代码完成，LLM 只负责选择和规划。
证据: [observed] BNB Agent Studio：签名是固定代码，不是 LLM 可调用的工具 [24]。[observed] AP2：各角色的校验“MUST happen in deterministic code” [37]。[observed] x402 默认流程由代码验签和结算 [34]。
影响: 给 agent 的工具要有明确语义（报价、构建、校验、提交、查状态），不要只给一个“发任意交易”。
```

```finding F6 medium
# 链上身份不等于一等公民
结论: 你的判断 4 要具体化。ERC-8004 提供身份、声誉、验证三个注册表，不管付款，也承认声誉可以被刷。一等公民还需要预算、收款、可撤销和可审计；BNB Agent Studio 从 v2 起让 agent 收款。
证据: [observed] EIP-8004：“Payments are orthogonal”；Sybil 攻击可以抬高假 agent 的声誉 [35]。[inferred] 只有 3%–15% 的注册带有效服务端点 [43]。[observed] 8004scan 显示 819,538 个 agent，最新条目反馈为 0 [43]。[observed] Agent Studio v2 让 agent 可以被雇佣和收款 [23]。
影响: 衡量 agent 生态看付费任务和收入，不看注册数。
```

```finding F7 high
# 真实付费需求还很小，交易数里有大量刷量
结论: 你的判断 5（给 agent 活动空间）方向对，但目前的数据撑不起“需求已爆发”。x402 全网每天约 $44K，30 天交易数下降 46%。BNB Chain 自己写明应用层需求还待证明。
证据: [observed] Artemis（10-19 更新）：24 小时 101.7K 笔、$44.2K、均值 $0.40；30 天 −45.88% [42]。[observed] Artemis 单独列出“Real vs. Gamed Transactions” [42]。[inferred] 二手转述的 Artemis 2025-12 报告：约 48% 笔数、81% 金额与刷量有关 [42]。[observed] BNB Chain：“application-level demand … still has to be proven” [25]。[observed] 三家都没有公开钱包级使用数据 [16][20]。
影响: 产品指标看独立付费方和重复使用，不看钱包数和交易数。
```

```finding F8 medium
# 两种设计思路：默认收窄，或默认放宽再加策略
结论: Binance 默认只开放验证过的操作，Coinbase MCP 只能付 x402；OKX 默认允许任意 calldata，MetaMask Beast Mode 去掉白名单。收窄的代价是通用性：Binance 做不了 SIWE 登录和空投领取。
证据: [observed] Binance 不发起任意交易，消息签名只允许 EIP-712 [17]。[observed] Coinbase MCP 不能 send / trade [10]。[observed] OKX contract-call 接受任意 calldata [21]。[observed] Beast Mode 只有威胁扫描 [2]。
影响: 按场景发权限：只买数据的 agent 不需要转账和交易能力。
```

```finding F9 high
# 你没列到的四个问题
结论: 1）[[提示注入]]利用的是 agent 已有的权限，不只是偷密钥。2）撤销不作废已签授权（见 F4）。3）自动化要有常驻进程才会执行。4）付款可能重复：脚本无状态，超时重试会再扣一笔。
证据: [observed] Anthropic：加防护后攻击成功率 1.4%，“No browser agent is immune” [40]。[observed] OpenAI 建议 MCP 工具始终开启审批，不让不可信数据直接驱动 agent [41]。[observed] TWAK 自动化只在 watcher 运行时执行 [28]。[observed] MetaMask x402 脚本无状态，规则要求每个资源只付一次 [4][6]。[observed] x402 用 `settlement_pending` 对账防止二次扣款 [34]。
影响: 把“外部内容不能改策略、改收款地址”写进第 3–5 层，并给每笔付款一个幂等键。
```

```finding F10 medium
# Mantle 链层件大多就绪，缺的是 x402 结算路径和钱包覆盖
结论: 7702 已启用，4337 有 bundler / paymaster，ERC-8004 的身份和声誉注册表已部署，USDC 和 USDT0 都实现了 EIP-3009。官方 x402 文档没有 Mantle 的默认资产和 facilitator。钱包里 Coinbase、Binance、Phantom 不支持 Mantle；MetaMask 支持但没有威胁扫描。
证据: [observed] Skadi 升级带来 EIP-7702 [44]；Pimlico 在 Mantle 支持 EntryPoint V06–V09 [45]；8004 注册表地址 [46]。[observed] x402 默认资产表和 facilitator 列表没有 Mantle [34]。[observed] Mantle USDC 的 3009 只接受 v,r,s 签名 [47]。[observed] MetaMask 的 Mantle 行 Transaction Shield = No [5]。
影响: 见 [Mantle 启示](#panel-Q)。
```

## N 你的五个判断 {depth=2}
| 你的判断 | 判定 | 修正后的说法 | 见 |
|---|---|---|---|
| agents 不能控制私钥 | warn 要改写 | 不能拿到没有边界的签名能力；限定合约、方法、金额、有效期 | [F3](#F3) |
| agents 需要被权限约束 | warn 要补充 | 关键是约束在哪层执行；额度不是损失上限 | [F1](#F1)、[F4](#F4) |
| 确定性执行、减少推理 | ok 成立 | 已是共识；推理选方案，代码签名和校验 | [F5](#F5) |
| 把 agents 提升为一等公民 | warn 要具体化 | 身份 + 预算 + 收款 + 可撤销 + 可审计 | [F6](#F6) |
| 给 agents 充分活动空间 | warn 证据不足 | 需求还小；先验证小额服务采购 | [F7](#F7)、[P](#panel-P) |

另外四个问题（提示注入、已签授权、常驻进程、重复付款）见 [F9](#F9)。

## O 钱包之外的协议栈 {depth=2}
```excalidraw q="agent 经济需要哪几层？钱包覆盖了其中哪些？" read="从上到下是一笔 agent 商业交易依赖的层。绿色框是 agent 钱包覆盖的两层。" takeaway="钱包只解决“能不能签、能签什么”；付款、身份、交付各需要一层协议，而且每层都写明了自己不保证什么。" name=econ-stack kind=分层
{"grid": {"w": 560, "h": 100}, "defaults": {"w": 520, "h": 66, "fontSize": 17},
 "nodes": [
   {"id": "t", "label": "工具接口：CLI · skills · MCP", "col": 0, "row": 0, "color": "blue"},
   {"id": "a", "label": "账户与授权：4337 · 7702 · 7715 / 7710", "col": 0, "row": 1, "color": "blue"},
   {"id": "p", "label": "支付：x402 · MPP · AP2", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "i", "label": "身份、声誉与验证：ERC-8004", "col": 0, "row": 3, "color": "gray", "stroke": "dashed"},
   {"id": "j", "label": "任务与交付：ERC-8183", "col": 0, "row": 4, "color": "gray", "stroke": "dashed"}
 ],
 "edges": [{"from": "t", "to": "a"}, {"from": "a", "to": "p"}, {"from": "p", "to": "i"}, {"from": "i", "to": "j"}],
 "boxes": [{"label": "agent 钱包", "around": ["t", "a"], "pad": 18, "color": "green"}]}
```

| 协议 | 管什么 | 明确不管 | 状态 |
|---|---|---|---|
| x402 | HTTP 402 上的报价、付款授权和结算 | 身份、交付质量 | v2 |
| ERC-8004 | 身份、声誉、验证注册表 | 付款；防刷声誉 | Draft |
| ERC-8183 | 任务托管、提交、evaluator 判定、过期退款 | 争议仲裁 | Draft |
| AP2 | 购买和付款授权（Mandate）与收据 | 争议处理流程；不限支付工具 | v0.2 |
| ERC-7715 / 7710 | 向钱包请求权限 / 链上赎回和校验 | 7710 不管怎么请求 | Draft |
| ERC-4337 / EIP-7702 | 合约账户、paymaster、二维 nonce / EOA 委托 | 7702 协议层不做权限 | Final |

- **x402 不是“先付钱”**：四种 scheme 是 `exact`、`upto`、`batch-settlement`、`auth-capture`。默认 authorization 流程先验签、服务端运行后才结算；`auth-capture` 先托管，交付后再 capture 或退款 [34]。
- **ERC-8183 的信任点是 evaluator**：它可以任意判定完成或拒绝，规范不含仲裁，拒绝和过期是终局 [36]。
- **AP2 把 crypto 当成一种支付工具**：规范对支付工具保持开放；用户不在场时，用户签一条带约束的 open mandate，其中必须写入 agent 公钥 [37]。
- **[[MPP]]**：Stripe 和 Tempo 合著，同样走 HTTP 402，不绑定支付通道（稳定币、卡、Lightning 都可以）[33]。

## P 活动场景与需求证据 {depth=2}
**需求数据**（全部是第三方或官方公开数据，见 D 和 [F7](#F7)）：
- x402 平均每笔 $0.40，说明主要是小额按次付款 [42]。
- 不同统计方对 x402 30 天金额的口径差距很大，交易数和注册数都不能直接当需求证据 [42][43]。

**场景判断**（推测，没有实证，台账标为 speculative）：

| 场景 | agent 做什么 | 确定性代码做什么 | 现有支撑 |
|---|---|---|---|
| 付费数据 / API 采购 | 选服务、判断值不值 | 报价、额度、付款去重 | Coinbase MCP 只开放 x402 [10] |
| 仓位维护 | 读风险、提方案 | 补抵押、限额、执行 | 链上 session 限权 [26][30] |
| 套利、清算、做市 | 设目标与约束 | 搜索、计算、执行 | LLM 时延与高频策略不兼容 [49] |

- 最可能先成立的是第一行：小额、低权限、失败损失有限。
- 你说的“agent 替代不了三角套利 bot”有学术依据：检索带来的时延与高频和快速中频策略不兼容 [49]。“agent 选目标、bot 执行”是合理分工，但没有实证。

## Q Mantle 启示 {depth=2}
| 层 | Mantle 现状 | 缺口 |
|---|---|---|
| EIP-7702 | ok Skadi 升级启用 [44] | — |
| ERC-4337 | ok Pimlico 支持 V06–V09 [45] | — |
| ERC-8004 | ok 身份、声誉注册表已部署 [46] | 验证注册表未核实；使用量未查 |
| 稳定币 3009 | warn USDC 只收 v,r,s；USDT0 有 bytes 重载 [47] | 智能账户用 USDC 走 3009 不行 |
| x402 结算 | no 官方无默认资产和 facilitator [34] | 要自建 facilitator，显式定价 |
| agent 钱包 | warn MetaMask（无 Shield）、OKX（无 x402）、Crossmint、Privy | Coinbase、Binance、Phantom、Altana 不支持 |

- **USDC 的限制**：Mantle USDC 的 `transferWithAuthorization` 只有 v,r,s 一种签名形式。[[ERC-1271]] 智能账户（包括 session key 账户）不能直接用它走 x402 的 3009 路径，只能用 EOA 或 7702 账户签名，或改走 Permit2 [47][34]。
- **安全覆盖**：MetaMask 在 Mantle 上没有威胁扫描，Guard Mode 只剩地址白名单 [5]。

```callout warn 推测：优先级建议（未验证）
1）先建好 x402 的生产结算：自建或引入 facilitator，用 TokenAmount 显式定价。2）给智能账户一条可用的支付代币路径（USDT0 的 bytes 重载，或 Permit2）。3）推动钱包侧在 Mantle 上补齐威胁扫描。不必先做一个新的钱包前端。
```

## R 局限与开放问题 {depth=2}
- 没有做真实资金测试和安全审计；没有运行 `mm`、`baw`、`onchainos`、`twak` CLI。
- Binance 和 OKX 的文档页被 WAF 拦截，正文来自搜索服务抓取；关键条款已用两家的官方 skill 仓库（固定 commit）交叉核对。
- 需求数据来自 Artemis 页面和二手转述；刷量拆分的当前数值没读到。
- 推测（speculative）内容：Coinbase 限额执行层；x402 的 3009 付款是否计入 MetaMask 额度；Binance 活动后的 gas；OKX 授权后转账；Crossmint 带 scope 的 signer 调合约；场景分工；Mantle 优先级。
- 开放问题：
  1. Coinbase 和 OKX 的限额在服务端还是 TEE 执行？OKX 超限时是硬拒绝，还是可以 `--force` 越过？
  2. MetaMask 在 Mantle 上的 gas relay 和 swap 能不能用（需要 `mm chains list --json`）？
  3. 有没有生产 facilitator 实际支持 `eip155:5000`？Mantle 上是否部署了 Permit2？
  4. Binance 的 MPC keyless 和 SAS FAQ 提到的 TEE 是什么关系？
  5. Virtuals ACP 等 agent 市场的真实付费数据。

## S 方法与证据 {depth=3}
- **材料**：你的想法草稿；ChatGPT Deep Research 结果（2026-10-21，只作线索）。
- **方法**：四路并行调研（MetaMask + Coinbase、Binance + BNB + OKX、扩展生态与基础设施、协议栈 + 需求 + Mantle）。每个论断追到一手来源才记为 observed；只有二手来源的记为 inferred 或 speculative。抽查 6 条 observed 论断，原文都支持。
- **台账**：207 条论断，observed 153、inferred 46、speculative 8，存放在报告目录的 `research/ledger.md`。
- **命令**：Routescan API 读取 Mantle USDC（`0x09Bc…0dF9`）和 USDT0（`0x779D…3736`）实现合约的 ABI；GitHub API 固定 Binance（`b402990`）与 OKX（`0346354`）skill 仓库的 commit。
- **被一手来源修正的 GPT 资料**：
  - 你给的 MetaMask 推文不是上线公告；MetaMask 是 06-08 Early Access、08-06 正式上线。
  - Coinbase MCP 版完全不能转账和交易；GPT 漏了 Wallet MCP 这条逐笔批准的路径。
  - MetaMask 多跳计算是确定重复计数，不是“可能”。
  - OKX 可以导出助记词，导出后 agent 失效。
  - BNB“需求待证明”的出处是 BNB Chain 2026-07-16 博客；ERC-8004 / 8183 的 Draft 状态出处也挂错了。
  - x402 默认先验签、后结算，不是“先付款”。
  - GPT 没有需求数据，没有提刷量，也没有给出 Mantle 已有 7702、4337、8004 的事实。

## T 术语表 {depth=2}
```glossary
TEE | 可信执行环境 | CPU 里隔离的执行区，密钥在里面生成和使用，宿主系统读不到。 | 不等于策略安全
MPC | 门限签名 | 私钥拆成几份分在不同机器上，协作签名，任何一处都拼不出完整私钥。
智能账户 | smart account | 签名校验规则写在合约里的账户，可以按规则拒绝交易。 | 不是 EOA
session key | 会话密钥 | 主人签发的临时密钥，只能在指定合约、函数、额度和时间内使用。 | 不是主私钥
EIP-7702 | EOA 委托 | 让 EOA 委托给合约代码执行；协议层本身不做权限控制。
ERC-4337 | 账户抽象标准 | 不改共识层的合约账户方案，含 EntryPoint、bundler、paymaster 和二维 nonce。
paymaster | gas 代付合约 | ERC-4337 中替用户付 gas 的合约，可以向用户收 ERC-20。
ERC-7579 | 模块化账户标准 | 定义合约账户的模块接口；Crossmint 钱包使用它。
ERC-1271 | 合约签名校验 | 让合约账户验证签名的标准接口。 | 不等于 ECDSA v,r,s
ERC-7715 | 权限请求 | 钱包 RPC `wallet_requestExecutionPermissions`，dapp 用它请求代用户执行的权限。
ERC-7710 | 委托赎回 | `redeemDelegations` 接口：先校验委托，再代 delegator 执行。
caveat enforcer | 委托约束合约 | MetaMask Delegation Framework 中执行限制条件的链上合约，不满足就回滚。
EIP-3009 | transferWithAuthorization | 签一条链下授权就能转出指定金额；有效期内任何人可提交。 | 撤销 agent 不会作废它
Permit2 | 签名授权合约 | Uniswap 的授权合约，用一条签名把代币支取权交给第三方。
x402 | HTTP 402 支付 | 服务端返回 402 和报价，客户端签付款授权后重发请求的按次付款协议。
facilitator | 结算方 | x402 中负责验签和代为上链结算的服务，不托管资金。
Bazaar | x402 服务目录 | Coinbase 的 x402 服务发现目录。
MPP | Machine Payments Protocol | Stripe 和 Tempo 合著的 402 支付协议，不绑定支付通道。
AP2 | Agent Payments Protocol | 用 Checkout / Payment Mandate 和收据表达购买授权与争议证据的协议。
ERC-8004 | trustless agents | 身份、声誉、验证三个注册表；不管付款。 | 不是信任认证
ERC-8183 | 任务托管 | 定义 job 托管、提交、evaluator 判定和过期退款的状态机。
MCP | Model Context Protocol | agent 调用外部工具的协议。
skill | agent 技能包 | 写给 agent 的说明和脚本，规定何时调用哪个命令。 | 不是服务端约束
BYOK | bring your own wallet | MetaMask 的本地签名模式，用户自带助记词，放在环境变量里。
Guard Mode | MetaMask 保护模式 | 威胁扫描 + 网络 / 地址 / 收款方白名单 + 滚动 24 小时额度。
Beast Mode | MetaMask 宽松模式 | 只保留威胁扫描，没有白名单和额度。
outflow 额度 | 流出额度 | MetaMask 按模拟出的美元价值统计 24 小时流出；不计签名授权。 | 不是损失上限
Transaction Shield | MetaMask 交易保护 | 威胁扫描和交易保障；Mantle 上不可用。
Secure Auto Sign | Binance 自动签名 | 授权后交易不逐笔确认的 Binance 服务。
Developer Mode | Binance 开发者模式 | 开放任意合约调用的受控例外，只能在 App 开启，有单独额度并会过期。
Onchain OS | OKX 链上平台 | OKX 的数据与交易工具平台，Agentic Wallet 是其执行组件。
TWAK | Trust Wallet Agent Kit | Trust Wallet 的 agent CLI，本地生成并加密保存钱包。
KYT | know your transaction | 交易风险筛查，Coinbase 在上链前拦截。
root 用户 | Turnkey root | Turnkey 中绕过策略引擎的用户，agent 不应是 root。
提示注入 | prompt injection | 外部内容里夹带指令，诱导 agent 执行用户没要求的操作。
刷量 | wash trading | 自己和自己交易制造的交易量。
```

## U 参考资料 {depth=2}
1. [MetaMask Agent Wallet：Architecture](https://docs.metamask.io/agent-wallet/reference/architecture/) — 两种钱包模式、TEE、7702 relay、7821 批处理。**PRIMARY**
2. [MetaMask：Trading modes](https://docs.metamask.io/agent-wallet/reference/trading-modes/) — Guard / Beast、策略 YAML、2FA 条件。**PRIMARY**
3. [MetaMask：Outflow policy](https://docs.metamask.io/agent-wallet/reference/outflow-policy/) — 额度口径、Permit2 不计入、多跳计数。**PRIMARY**
4. [MetaMask：Agent rules](https://docs.metamask.io/agent-wallet/agent-rules/) — 事前确认、x402 不自动重试。**PRIMARY**
5. [MetaMask：Supported chains](https://docs.metamask.io/agent-wallet/reference/supported-chains/) — Mantle 5000，Transaction Shield = No。**PRIMARY**
6. [MetaMask：Pay for APIs with x402](https://docs.metamask.io/agent-wallet/guides/pay-for-apis-x402/) — exact + 3009、脚本无状态。**PRIMARY**
7. [MetaMask 博文：Introducing MetaMask Agent Wallet](https://metamask.io/news/introducing-metamask-agent-wallet) 与 [EA 新闻稿](https://metamask.io/news/metamask-launches-agent-wallet-giving-ai-agents-full-defi-access-with-default-security-on-every-transaction) — 08-06 正式上线、06-08 EA、导出 FAQ。**PRIMARY**
8. [MetaMask：Agent Wallet quickstart](https://metamask.io/news/metamask-agent-wallet-quickstart) — server-wallet 目前不能导出。**PRIMARY**
9. [MetaMask Smart Accounts Kit：Advanced Permissions](https://docs.metamask.io/smart-accounts-kit/concepts/advanced-permissions/) 与 [caveat enforcers](https://docs.metamask.io/smart-accounts-kit/concepts/delegation/caveat-enforcers/) — 7715 / 7710、链上执行。**PRIMARY**
10. [Coinbase CDP：Agentic Wallet](https://docs.cdp.coinbase.com/agentic-wallet/welcome) — CLI 与 MCP 的能力差异。**PRIMARY**
11. [Coinbase CDP：Agentic Wallet CLI](https://docs.cdp.coinbase.com/agentic-wallet/cli/welcome) — 网络、密钥隔离、单笔 / 会话上限、KYT。**PRIMARY**
12. [Coinbase CDP：Agentic Wallet MCP FAQ](https://docs.cdp.coinbase.com/agentic-wallet/mcp/faq) — UI 设限、agent 不能改、gas 代付。**PRIMARY**
13. [Coinbase CDP：Spend Permissions](https://docs.cdp.coinbase.com/wallets/using-wallets/spend-permissions) — 链上 Spend Permissions 与链下 Policies 的区别。**PRIMARY**
14. [Coinbase CDP：Wallet MCP](https://docs.cdp.coinbase.com/ai-agents/coinbase-for-agents/wallet-mcp) — 每笔写操作都要批准。**PRIMARY**
15. [Coinbase：Agentic Wallets 发布博文](https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets) — 2026-02-11、TEE、会话上限。**PRIMARY**
16. [Binance 公告：Agentic Wallet](https://www.binance.com/en/support/announcement/detail/0c533c5a820341ce87e5ddda76f36ac0) — 2026-04-24、独立 keyless 钱包、SAS。**PRIMARY**
17. [Binance Web3 开发文档：Agentic Wallet](https://web3.binance.com/en/dev-docs/products/agentic-wallet/introduction) 与 [Developers 文档](https://developers.binance.com/en/docs/products/agentic-wallet/welcome) — MPC、API 层规则、能力范围、Developer Mode。**PRIMARY**
18. [Binance Blog：Agentic Wallet Controls](https://www.binance.com/en/blog/tech/7276731523787720812) — 四类额度、强制白名单、Dev Mode 额度。**PRIMARY**
19. [binance/binance-skills-hub](https://github.com/binance/binance-skills-hub) `binance-agentic-wallet/SKILL.md @b402990` — 确认规则、命令清单。**PRIMARY**
20. [OKX：Agentic Wallet 发布公告](https://www.okx.com/en-gb/help/okx-wallet-officially-launches-agentic-wallet) 与 [Onchain OS 文档](https://web3.okx.com/onchainos/dev-docs/wallet/agentic-wallet) — 2026-03-18、TEE、50 个子钱包。**PRIMARY**
21. [okx/onchainos-skills](https://github.com/okx/onchainos-skills) `okx-agentic-wallet @0346354` — 四条策略、导出、`--force`、任意 calldata。**PRIMARY**
22. [OKX Onchain OS：Supported Networks](https://web3.okx.com/onchainos/dev-docs/wallet/supported-networks) — Mantle ✓，x402 支付列为“-”。**PRIMARY**
23. [BNB Chain Blog：Agent Studio v1](https://www.bnbchain.org/en/blog/bnb-agent-studio-is-live-on-bnb-chain-ai-agents-from-one-prompt)、[v2](https://www.bnbchain.org/en/blog/bnb-agent-studio-v2-your-agents-your-rules)、[v3](https://www.bnbchain.org/en/blog/bnb-agent-studio-v3-turnkey-joins-as-a-wallet-option) — 时间线、收款、钱包选项。**PRIMARY**
24. [BNB Chain Docs：BNB Agent Studio](https://docs.bnbchain.org/developer-kit/bnbchain-studio) — 签名是固定代码、MCP 只读。**PRIMARY**
25. [BNB Chain Blog：AI Agent Landscape](https://www.bnbchain.org/en/blog/bnb-chain-ai-agent-landscape-agents-tools-and-payments) — “application-level demand … still has to be proven”。**PRIMARY**
26. [Altana Docs：Sessions](https://docs.altana.network/concepts/sessions) — 链上执行、不配 calls 即不限。**PRIMARY**
27. [Turnkey：Agentic Wallets](https://docs.turnkey.com/solutions/company-wallets/agentic-wallets) 与 [Root quorum](https://docs.turnkey.com/concepts/users/root-quorum) — non-root、root 绕过策略。**PRIMARY**
28. [Trust Wallet TWAK：Key Management](https://developer.trustwallet.com/developer/agent-sdk/key-management) 与 [CLI Reference](https://developer.trustwallet.com/developer/agent-sdk/cli-reference) — 本地加密、watcher。**PRIMARY**
29. [Phantom MCP Server](https://docs.phantom.com/phantom-mcp-server) 与 [Tools](https://docs.phantom.com/phantom-mcp-server/tools) — 专用钱包、KMS、确认参数、支持链。**PRIMARY**
30. [Crossmint：Agents](https://docs.crossmint.com/agents/overview)、[Wallet architecture](https://docs.crossmint.com/wallets/architecture)、[Scopes](https://docs.crossmint.com/wallets/guides/signers/scopes)、[Cards](https://docs.crossmint.com/agents/cards/overview) — 合约执行限额、transfer scope、卡网络。**PRIMARY**
31. [Safe：AI agent quickstarts](https://docs.safe.global/home/ai-agent-quickstarts/introduction) — 4 种配置、不推荐 1/1。**PRIMARY**
32. [Privy：Agent wallets](https://docs.privy.io/wallets/overview/solutions/agent-wallets) 与 [Policies](https://docs.privy.io/controls/policies/overview) — TEE 执行策略、默认拒绝。**PRIMARY**
33. [Stripe：Link Agent Wallet](https://docs.stripe.com/agentic-commerce/link-cli) 与 [MPP](https://docs.stripe.com/payments/machine/mpp) — 逐笔批准；MPP 定位。**PRIMARY**
34. [x402：Payment Schemes](https://docs.x402.org/schemes/overview)、[Network and token support](https://docs.x402.org/core-concepts/network-and-token-support)、[Facilitator](https://docs.x402.org/core-concepts/facilitator) — scheme、flow、新网络清单、对账。**PRIMARY**
35. [EIP-8004](https://eips.ethereum.org/EIPS/eip-8004) — 身份注册表、不管付款、Sybil。**PRIMARY**
36. [EIP-8183](https://eips.ethereum.org/EIPS/eip-8183) — job 托管、evaluator、无仲裁。**PRIMARY**
37. [AP2 规范 v0.2](https://ap2-protocol.org/ap2/specification/) — Mandate、确定性代码、支付工具开放。**PRIMARY**
38. [ERC-7715](https://eips.ethereum.org/EIPS/eip-7715) 与 [ERC-7710](https://eips.ethereum.org/EIPS/eip-7710) — 权限请求与赎回。**PRIMARY**
39. [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) 与 [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) — 合约账户与 EOA 委托。**PRIMARY**
40. [Anthropic：Prompt injection defenses](https://www.anthropic.com/research/prompt-injection-defenses) — 攻击成功率与“No browser agent is immune”。**PRIMARY**
41. [OpenAI：Agent Builder safety](https://developers.openai.com/api/docs/guides/agent-builder-safety) — 工具审批、不可信数据。**PRIMARY**
42. [Artemis：x402](https://classic.artemis.ai/asset/x402) 与 [Agentic Payments](https://www.artemis.ai/sectors/agentic-payments) — 日交易数、金额、刷量拆分；2025-12 报告只见二手转述。
43. [8004scan](https://8004scan.io/agents) 与 [arXiv 2606.26028](https://arxiv.org/pdf/2606.26028v3) — 注册数；有效端点比例。
44. [Mantle：Skadi 升级](https://docs.mantle.xyz/network/for-node-operators/network-updates/changelogs/mantle-v2-v1.3.1-skadi-upgrade.md) — Prague 特性与 EIP-7702。**PRIMARY**
45. [Pimlico：Supported chains](https://docs.pimlico.io/guides/supported-chains) — Mantle 的 EntryPoint 与 7702。**PRIMARY**
46. [erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts) 与 [Mantle 新闻稿](https://www.prnewswire.com/news-releases/mantle-unlocks-autonomous-economy-with-erc-8004-deployment-302688549.html) — Mantle 主网注册表地址。**PRIMARY**
47. Routescan API：Mantle USDC `0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9` 与 USDT0 `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` 的实现合约 ABI — 3009 签名形式。**PRIMARY**
48. [USDT0：EIP-3009](https://docs.usdt0.to/technical-documentation/token-features/eip-3009) — 有效窗口与 cancelAuthorization。**PRIMARY**
49. [arXiv 2605.19337：Agentic Trading](https://arxiv.org/pdf/2605.19337v2) — 检索时延与高频策略不兼容。

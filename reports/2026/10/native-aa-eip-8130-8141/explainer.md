---
template: research
title: Native AA：EIP-8130 与 EIP-8141（+ EIP-8250）原理解析
subtitle: 8130 把“账户与权限”写进协议，8141 把“交易处理流程”写进协议。对 Mantle，先做 8130 PoC，同时用 8141 + 8250 做对照组。
cols: 4
type: 技术调研 · 方案对比
audience: 后端 / 合约开发，熟悉 EVM 交易，未接触过账户抽象
scope: EIP-8130、EIP-8141、EIP-8250（均为 Draft）；Mantle 的 Meme Launchpad 与 Perps
evidence: 8-native-aa/references 下 5 篇文档 + EIP 原文 + ACD 会议记录（访问于 2026-10-04）
date: 2026-10-04 · v1
---
结论先行：两个方案都去掉了 [[Bundler]] 和 [[EntryPoint]]，都支持代付、批处理和受限 Agent。区别在于“受限”写在哪一层：8130 由协议登记 [[Actor]] 并强制 [[Policy Manager]] 入口（[F1](#F1)）；8141 由账户代码在 [[VERIFY]] 帧里自行审查整笔交易（[F2](#F2)）。以太坊 L1 已把 8141 定为 Hegota 的 SFI 项，8130 只在 Base 的 devnet 上运行（[F5](#F5)）。Mantle 应先冻结产品安全模型，再并列验证两条路线（[F6](#F6)）。

## A 两个方案拆开了什么 {sheet span=2 meta="核心抽象"}
| 方案 | 拆出的对象 | 受限权限由谁执行 |
|---|---|---|
| 普通 EOA | 无：身份 = 私钥 = 付款人 | no 无法表达 |
| EIP-8130 | `Account` · `Actor` · `Authenticator` · `Keystore` · `payer` | ok 协议门禁 + Manager |
| EIP-8141 | `VERIFY` / `SENDER` / `DEFAULT` 帧 · `APPROVE` 指令 | warn 账户代码自行审查 |
| EIP-8250 | `nonce_keys` + `nonce_seq` | 只补 8141 的多通道 nonce |

## B 两种交易信封 {sheet span=2 meta="字段要点"}
```annot
# EIP-8130 · type 0x79 | 账户与权限字段
[sender]{资产账户 A} + [nonce_key, nonce_sequence]{二维 nonce} + [account_changes]{开户 / 授权 / 撤权}
[calls]{多个 Phase} + [payer]{代付人} + [sender_auth]{操作签名} + [payer_auth]{付款签名}
# EIP-8141 · type 0x06 | 流程字段
[sender]{资产账户 A} + [nonce]{!本体只有一个标量} + [frames]{1–64 个帧} + [signatures]{协议预验}
> 8130 的权限语义在字段里；8141 的权限语义在帧里运行的账户代码里
```

## C 能力对比 {sheet span=2 meta="协议原生提供"}
| 能力 | 8130 | 8141 本体 | 8141 + 8250 |
|---|---|---|---|
| 去掉 Bundler、原生代付 | ok | ok | ok |
| 原子批处理 | ok Phase | ok 原子组 | ok 原子组 |
| 受限 Agent 角色表 | ok Actor | no 账户自建 | no 账户自建 |
| 协议级入口门禁 | ok Manager | no 内省自查 | no 内省自查 |
| 多通道 nonce | ok | no | ok |
| nonce-free | ok | no | warn 新 key 留状态 |
| 任意验证逻辑 | warn 限认证器 | ok | ok |

## D 规范常量（不是实测） {sheet span=2 meta="Draft 文本"}
| 项目 | 数值 | 出处 |
|---|---|---|
| 4337 基本 UserOp 的 Gas | ~42k（普通交易 21k） | RIP-7560 动机 |
| 8130 `AA_BASE_COST` / nonce-free 计价 | 15,000 / 13,000 | 8130 Intrinsic Gas |
| 8141 固定开销 / k1 验签 | 12,000 + 475 × 帧数 / 2,800 | 8141 Gas Accounting |
| 8141 新建账户 state gas | 120 × 1,530 = 183,600 | 8141 / EIP-8037 |
| 8141 公共池验证预算 | execution 100k，state 500k | 8141 Mempool |

## E 时间线 {sheet span=2 meta="治理状态"}
```timeline
2025-10 | 8130 创建 | Coinbase / Base
2026-01 | 8141 创建 | 提为 Hegota headliner
2026-04 | 8250 创建 | keyed nonces
2026-07 | Native AA CFI | 以 Frame 为占位
*2026-08 | 8141 SFI | ACDE #244
2026-09 | Base Cobalt 上线 | 不含 8130
```
来源：[8130](https://eips.ethereum.org/EIPS/eip-8130) · [ACDE #229](https://github.com/ethereum/pm/issues/1883) · [8250](https://eips.ethereum.org/EIPS/eip-8250) · [ACDE #241](https://eipsinsight.com/calls/acde/241) · [ACDE #244](https://github.com/ethereum/pm/issues/2197) · [Cobalt](https://docs.base.org/base-chain/specs/upgrades/cobalt/overview)

## F 结论 {sheet span=2}
```callout ok 两条路线都能承载受限 Agent，差别在“谁负责限制”
8130 由协议强制入口，8141 把限制全交给账户代码。Mantle 先做 8130 PoC，用 8141 + 8250 做对照（[F6](#F6)、S 面板）。
```

## G 如何阅读 {depth=1}
```callout info 默认你已知道（本文不解释）
- EVM 交易有 nonce、gas_limit、费用上限和签名。
- 普通账户（EOA）用一把 secp256k1 私钥签名。
- 合约调用里 `msg.sender` 是直接调用者；调用失败会回滚本次调用的状态。
- ERC-20 的 `approve` / `transfer` 语义。
```
阅读路线：

- **5 分钟（决策者）**：读总览 A–F 和 [F6](#F6)。
- **30 分钟（要做方案的开发）**：再读 H–O 和 Q–S。H 讲动机，I 是前置知识，J–O 讲两种方案与例子。Q 讲理念与生态，R–S 是发现与 Mantle 选型。
- **完整（要实现或评审）**：再读 depth=3 的细节面板、方法与复现。

全文用一个贯穿例子：Alice 用账户 A 花 100 USDC 在 Launchpad 买 MEME，平台 P 代付 Gas，之后授权一个 Agent 自动买入。例子里的账户函数（如 `executePolicy`）是教学设计，不是 EIP 标准接口，也不是 Mantle 已上线能力。

## H 背景动机：为什么要 Native AA {depth=2}
**问题**：普通 [[EOA]] 把三件事绑在一起：身份就是私钥，签名人就是付款人，账户只有一条 nonce 队列。Agent 要自动交易时，只有两种选择：每笔都找 Owner 签名，或者把能动全部资产的私钥交给 Agent。

| EOA 的限制 | 具体后果 |
|---|---|
| 身份 = 一把 secp256k1 私钥 | 不能换钥匙、不能用 Passkey、不能抗量子 |
| 签名人 = 付款人 | 新用户必须先持有原生币才能操作 |
| 一条标量 nonce | 一笔卡住，后面全部卡住；多个 Agent 互相排队 |
| 一笔交易一个调用 | `approve` 成功、`buy` 失败时，allowance 不会回滚 |
| 没有受限权限 | 交易信封无法表达“只能在某市场花 100 USDC” |

**已有做法：合约层 AA**。[[ERC-4337]] 和 [[EIP-7702]] 在不改协议的前提下补了一部分能力，但各有代价：

| 方案 | 怎么做 | 问题 |
|---|---|---|
| ERC-4337 | 用户签 UserOperation，[[Bundler]] 打包后调用 [[EntryPoint]]，[[Paymaster]] 代付 | 额外基础设施；基本 UserOp 约 42k gas，普通交易 21k；独立的 alt mempool；`tx.origin` 变成 Bundler；协议层抗审查机制只看交易，看不到 UserOp |
| EIP-7702 | EOA 委托到一段合约代码 | 原私钥永远有效，不能撤销或换钥；签名方式仍是那一把 secp256k1；代付和 Session 仍要靠 4337 等外部设施 |
| 各钱包插件 | 钱包合约自建 Session key 模块 | 每个钱包一套接口，节点和应用无法统一识别权限来源 |

```excalidraw q="合约层 AA 和 Native AA 的交易路径差在哪里？" read="上行是 ERC-4337，下行是 Native AA。红色是额外的基础设施层。" takeaway="Native AA 把验证、付款、批处理放进协议：没有 Bundler、EntryPoint 和独立 mempool。" kind=有无对比
{"grid": {"w": 340, "h": 150}, "defaults": {"w": 180, "h": 70},
 "nodes": [
   {"id": "u1", "label": "UserOperation", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "b", "label": "Bundler\n(alt mempool)", "col": 1, "row": 0, "color": "red"},
   {"id": "ep", "label": "EntryPoint 合约", "col": 2, "row": 0, "color": "red"},
   {"id": "a1", "label": "账户合约", "col": 3, "row": 0, "color": "blue"},
   {"id": "u2", "label": "AA 交易", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "n", "label": "节点 / 排序器\n(公共 mempool)", "col": 1, "row": 1, "color": "green"},
   {"id": "p", "label": "协议原生验证", "col": 2, "row": 1, "color": "green"},
   {"id": "a2", "label": "账户 A", "col": 3, "row": 1, "color": "blue"}
 ],
 "edges": [
   {"from": "u1", "to": "b", "label": "提交"}, {"from": "b", "to": "ep", "label": "handleOps"}, {"from": "ep", "to": "a1", "label": "验证 + 执行"},
   {"from": "u2", "to": "n", "label": "提交"}, {"from": "n", "to": "p", "label": "直接打包"}, {"from": "p", "to": "a2", "label": "验证 + 执行"}
 ],
 "texts": [{"x": 360, "y": 96, "text": "这一层：基本 UserOp 约 42k gas（RIP-7560 引用值）", "color": "red", "fontSize": 16}]}
```

**Native AA 解决什么、不解决什么**：

| 问题 | Native AA 是否解决 |
|---|---|
| 去掉 Bundler / EntryPoint / 独立 mempool | ok 两个方案都解决 |
| 原生代付（付款人与签名人分离） | ok 两个方案都解决 |
| 原子批处理 | ok 8130 用 Phase，8141 用原子组 |
| 换签名算法（Passkey、P256、未来的抗量子算法） | ok 8130 用认证器，8141 用账户代码 |
| 多个 Agent 不共用一条 nonce 队列 | warn 8130 原生；8141 需要 8250 |
| 业务规则（额度、市场、接收人） | no 两者都要账户或产品合约实现 |
| 撤单优先、资源隔离、抗 MEV | no 属于排序与执行层，不属于 AA |
| “用户不用原生币”就没有 Gas 成本 | no 成本转给 Sponsor，没有消失 |

**为什么现在**：以太坊需要给 ECDSA 准备抗量子的退出路径，8141 的提案者把它列为首要理由。Base 等 L2 需要服务高频 Agent 与游戏，8130 的作者把“节点不能被迫模拟任意 EVM”列为首要理由。

**范围**：协议机制、贯穿例子、治理现状、Mantle 产品适配。**非目标**：客户端代码、可部署合约、性能压测。

## I 前置知识 {depth=2}
```excalidraw q="读懂两个方案需要先懂哪些概念？按什么顺序学？" read="灰色虚线框是默认已知；蓝色是卡片编号；绿色是本文主题。箭头表示先学 → 后学。" takeaway="先读 B-0 和 B-3：AA 解决什么，以及节点为什么要限制验证工作。" name=prereq-map kind=前置知识地图
{"grid": {"w": 300, "h": 120}, "defaults": {"w": 190, "h": 62, "fontSize": 17},
 "nodes": [
   {"id": "tx", "label": "EVM 交易 / nonce（已知）", "col": 0, "row": 0, "color": "gray", "stroke": "dashed", "w": 220},
   {"id": "call", "label": "合约调用（已知）", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 账户抽象", "col": 1, "row": 0, "color": "blue"},
   {"id": "b5", "label": "B-5 nonce 与重放", "col": 1, "row": 1, "color": "blue"},
   {"id": "b4", "label": "B-4 Session key", "col": 1, "row": 2, "color": "blue"},
   {"id": "b1", "label": "B-1 ERC-4337", "col": 2, "row": 0, "color": "blue"},
   {"id": "b2", "label": "B-2 EIP-7702", "col": 2, "row": 1, "color": "blue"},
   {"id": "b3", "label": "B-3 mempool 准入", "col": 2, "row": 2, "color": "blue"},
   {"id": "t1", "label": "EIP-8130", "col": 3, "row": 0, "color": "green", "strokeWidth": 3},
   {"id": "t2", "label": "EIP-8141 + 8250", "col": 3, "row": 2, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "tx", "to": "b0"}, {"from": "tx", "to": "b5"}, {"from": "call", "to": "b4"},
   {"from": "b0", "to": "b1"}, {"from": "b0", "to": "b2"}, {"from": "b4", "to": "b3"},
   {"from": "b1", "to": "t1"}, {"from": "b3", "to": "t2"}, {"from": "b1", "to": "t2", "dashed": true},
   {"from": "b5", "to": "t1", "dashed": true}
 ]}
```

```prereq B-0 l1 3min
# 账户抽象（account abstraction，AA）
是什么: 让“谁能动这个账户、怎么验签、谁付 Gas、一次做几件事”由可编程规则决定，不再固定为一把私钥。
为什么需要: 两个 EIP 都是 AA。它们的区别是把哪部分规则写进协议。
例子: Alice 用 Passkey 签名，平台付 Gas，一笔交易里完成 approve + buy。
误解: 误解：AA 就是“智能合约钱包”。事实：合约钱包只是载体，关键是验证与付款能否被协议直接识别。
深入: [1] RIP-7560 Motivation
```

```prereq B-1 l1 5min
# ERC-4337
是什么: 不改协议的 AA。用户签 UserOperation，Bundler 收集后调用 EntryPoint 合约，EntryPoint 调用账户验证并执行，Paymaster 可代付。
为什么需要: 两个 Native AA 都想去掉这层额外设施。8141 直接继承了 4337 的验证规则经验。
例子: 基本 UserOp 约 42k gas，普通交易约 21k gas。
误解: 误解：4337 已经是协议功能。事实：它是合约 + 链下服务，节点不认识 UserOp。
深入: [4] EIP-4337
依赖: B-0
```

```prereq B-2 3min
# EIP-7702
是什么: EOA 把自己的代码委托到某个合约实现，从而获得批处理等能力。
为什么需要: 两个 Native AA 都要兼容已有 EOA。8130 的 Delegation 项直接复用 7702 的委托标记。
误解: 误解：委托后原私钥就失效了。事实：原私钥一直能签普通交易。
深入: [5] EIP-7702
依赖: B-0
```

```prereq B-3 l1 6min
# mempool 准入与 DoS
是什么: 节点在打包前先检查交易是否有效。检查越贵、依赖的状态越多，攻击者越容易用大量“看起来有效、上链时失效”的交易拖垮节点。
为什么需要: 这是 8130 与 8141 分歧的根源。8130 把验证限制为固定的认证器调用；8141 允许任意验证代码，但在公共池里限制预算和可读状态。
例子: 8141 公共池：验证前缀 execution 预算 ≤ 100,000，每个 sender 最多 1 笔待处理交易。
误解: 误解：能在链上执行的交易都能进公共池。事实：共识有效 ≠ 公共池可传播。
深入: [2] EIP-8141 Mempool
```

```prereq B-4 l1 4min
# Session key（受限会话密钥）
是什么: Owner 给 Agent 一把独立密钥，只允许它在限定时间、限定市场、限定额度内操作。
为什么需要: Mantle 的 Launchpad 与 Perps 都需要 Agent 持续交易，又不能交出主密钥。
误解: 误解：签名有效就有权限。事实：签名只证明“谁签的”，权限要另外检查。
深入: [3] EIP-8130 Actor Policies
```

```prereq B-5 3min
# nonce 与重放保护
是什么: nonce 让同一笔签名交易只能执行一次。标量 nonce 还强制同账户的交易按顺序执行。
为什么需要: 多个 Agent 共用一个账户时，标量 nonce 让它们互相排队。两个方案用不同方法拆开这条队列。
深入: [3] EIP-8130 2D Nonce Storage；[6] EIP-8250
```

## J EIP-8130：账户中心的设计 {depth=2}
**一句话**：8130 回答“谁有权用这个账户、用什么钥匙证明身份、能做什么、谁付费”。它把这些拆成 [[Account]]、[[Actor]]、[[Authenticator]]、[[Keystore]] 四个对象，再加一个新交易类型 `0x79`。8130 不加新的 EVM 指令，但要改交易解码、系统状态、计费和回执。

```excalidraw q="8130 的账户由哪些部件组成，各管什么？" read="蓝色是资产账户；紫色是协议状态；黄色是业务规则代码。" takeaway="资产、操作身份、验签方法、付款人是四个不同对象；Actor 不是子账户。" kind=概念图
{"grid": {"w": 360, "h": 150}, "defaults": {"w": 200, "h": 74, "fontSize": 17},
 "nodes": [
   {"id": "alice", "label": "Actor alice-key\nADMIN", "col": 0, "row": 0},
   {"id": "agent", "label": "Actor agent-key\nPOLICY | NONCE", "col": 0, "row": 1},
   {"id": "auth", "label": "Authenticator\npasskey / k1", "col": 1, "row": 0},
   {"id": "mgr", "label": "Policy Manager", "col": 1, "row": 1, "color": "yellow"},
   {"id": "ks", "label": "Keystore\n权限登记簿", "col": 2, "row": 0, "color": "violet"},
   {"id": "acct", "label": "Account A\n持有资产", "col": 2, "row": 1, "color": "blue", "strokeWidth": 3},
   {"id": "nm", "label": "Nonce Manager\n(key, seq)", "col": 3, "row": 0, "color": "violet"},
   {"id": "payer", "label": "Payer P\nSPONSOR_PAYER", "col": 3, "row": 1}
 ],
 "edges": [
   {"from": "alice", "to": "auth", "label": "签名"},
   {"from": "agent", "to": "auth", "label": "签名", "dashed": true},
   {"from": "auth", "to": "ks", "label": "actorId"},
   {"from": "agent", "to": "mgr", "label": "只能调用它"},
   {"from": "mgr", "to": "acct", "label": "执行业务"},
   {"from": "ks", "to": "acct", "label": "A 的配置"},
   {"from": "payer", "to": "acct", "label": "付 Gas"},
   {"from": "nm", "to": "ks", "dashed": true, "arrow": "none"}
 ]}
```

**1. 四个对象**

- [[Account]]：资金与对外身份。可以是新建账户、已有 EOA，或导入的 4337 钱包。
- [[Actor]]：被账户授权的操作身份，用 32 字节 `actorId` 标识。一个账户可以有 Owner、多个 Agent、专用 Gas key。Actor 共享同一份资产，**不是子账户**。
- [[Authenticator]]：只回答“谁签的”。接口是 `authenticate(hash, data) → actorId`。标准集合有 `k1`、`p256`、`passkey`（WebAuthn）、`delegate`（单层签名委托）。
- [[Keystore]]：链上权限登记簿，记录“账户 A 授权了哪些 Actor、用哪个认证器、什么权限、何时到期”。基础配置打包在 32 字节里：`authenticator(20) | expiry(6) | scope(2) | reserved(4)`。

**2. [[Scope]]：协议能理解的粗粒度权限**

| 位 | 名称 | 授予的能力 |
|---|---|---|
| `0x0000` | ADMIN | 全部权限；可以改配置 |
| `0x0001` | OPERATOR | 任意调用，没有 Manager 门禁 |
| `0x0002` | SELF_PAYER | 用本账户付 Gas |
| `0x0004` | SPONSOR_PAYER | 替别的账户付 Gas |
| `0x0008` | POLICY | 顶层调用只能指向绑定的 Manager |
| `0x0010` | NONCE | 可以用有序 nonce 通道（包括 key 0） |

Scope 是“授予”，不是“限制”：位越多，权限越大。`OPERATOR | POLICY` 按 OPERATOR 处理，门禁失效。

```callout err WARNING：不要给受限 Agent 加 OPERATOR
为了让旧的 ERC-1271 订单接口通过而追加 OPERATOR，会让 Agent 绕过 Manager 门禁。改用 Actor-aware 的签名验证接口。
```

**3. [[Policy Manager]] 门禁**：8130 的受限权限采用“协议层物理关门 + 合约层搜身安检”两层防御：
- **协议层（物理关门）**：节点不感知上层业务规则（如滑点、白名单）。对“有 POLICY、无 OPERATOR”的 Actor，顶层调用必须满足 `call.to == policy_manager`。若试图直调外部合约，协议抛出 `ActorPolicyViolation`，当前 [[Phase]] 失败。这是执行阶段的失败，nonce 和 Gas 照样消耗，防止恶意轰炸节点。
- **合约层（业务安检）**：Manager 读出 Keystore 里的策略哈希（`policy_commitment`）。它逐项核对单笔限额、累计预算和接收人白名单。规则不符时合约主动回滚。

**4. 交易信封与双签名域**：`0x79` 交易带 `sender`、二维 nonce、有效期、`account_changes`、多组 `calls`、`payer`、`sender_auth`、`payer_auth`。操作签名与付款签名用不同的域前缀：

- `sender_hash = keccak256(0x79 || RLP(chain_id … payer))`
- `payer_hash = keccak256(0x7A || RLP(chain_id … payer))`

两者都覆盖费用与调用内容，所以改费用或换 Sponsor 要重新签名。付款签名绑定真实 sender，防止跨账户重放。

**5. 三种付款模式**

| 模式 | 字段 | 权限要求 |
|---|---|---|
| 同一 Actor 自付 | `payer`、`payer_auth` 为空 | 该 Actor 有 SELF_PAYER |
| 同账户专用 Gas key | `payer = sender`，带 `payer_auth` | Gas key 有 SELF_PAYER |
| 外部 Sponsor | `payer = P`，带 `payer_auth` | P 的付款 Actor 有 SPONSOR_PAYER |

`payer_auth` 的验签成本不占用户签的 `gas_limit`，上限是 `gas_limit + MAX_AUTHENTICATION_GAS`。Sponsor 报价不能只算 `gas_limit × fee`。

**6. [[2D nonce]] 与 [[nonce-free]]**

- 有序通道（2D Nonce）：`(account, nonce_key, nonce_sequence)`。不同 key 互不阻塞，同 key 仍然有序。只读预编译地址 `0x8130…aa01`。NONCE scope 授予全部有序空间，不按 Actor 分通道。
- 无序模式（nonce-free）：高频场景（如高频撤单、游戏）无需排队顺序。交易设 `nonce_key = 2^256−1` 且 `nonce_sequence = 0` 时触发此模式。
- nonce-free 防重放机制：账户不更新链上计数器，靠三件套防重放：
  1. **短有效期**：强制指定 `valid_before`。过期交易全网作废。
  2. **指纹 [[replay_id]]**：由交易核心字段计算哈希。排除 Gas 费与签名，提价加速不改变重放身份。
  3. **环形缓冲区去重**：共识状态维护有界环形缓冲区（Ring Buffer）。命中已有指纹直接拒绝，写入时循环复用槽位。固定只耗 13,000 Gas，不留永久状态。

**7. [[Phase]]：原子性的单位**

- Phase 内：全部调用一起成功，否则回滚本 Phase。
- Phase 间：顺序执行，已成功的 Phase 保留。
- 某 Phase 失败：后面所有 Phase 跳过。

回执包含 `phaseStatuses`。总 `status == 0` 只表示有 Phase 失败，不表示交易没有副作用。

**8. [[account_changes]]：开户、授权、撤权都在交易里**

| 类型 | 作用 |
|---|---|
| `0x00 Create` | 用 CREATE2 派生地址并安装初始 Actor；地址承诺了初始 Actor，换钥匙会得到另一个地址 |
| `0x01 Config change` | 授权 / 撤销 Actor、递增 [[Local epoch]]、锁定账户 |
| `0x02 Delegation` | 设置 7702 风格的代码委托 |

## K 8130 例子：Alice 从开户到 Agent 代付买入 {depth=2}
**第 1 步 · 开户（Passkey，平台代付）**

1. 钱包从 Passkey 公钥算出 `alice-key`（实际是 32 字节哈希）。
2. 钱包用“账户代码 + 初始 Actor + salt”算出地址 A。
3. 钱包构造交易：`sender = A`，`account_changes = [Create(初始 Actor = alice-key, Passkey 认证器, ADMIN)]`，`calls` 为空，`payer = P`。
4. 节点用交易里的 `initial_actors` 验证 Alice 的签名，因为 A 还不存在。
5. 入块后，协议放置账户代码，在 Keystore 写入 `alice-key → passkey → ADMIN`，向 P 收费。

**第 2 步 · Alice 亲自买入**：`calls = [[USDC.approve(L, 100), L.buy(100, minOut, A)]]`，一个 Phase。Alice 是 ADMIN，不经过门禁。`buy` 失败时，同 Phase 的 `approve` 一起回滚。

**第 3 步 · 授权 Agent**：Alice 想让 Agent 替她高频自动买 MEME 币，但绝不能给 `OPERATOR` 权限。若有 `OPERATOR`，Agent 私钥泄露后可直调 `USDC.transfer(黑客地址)` 卷空资产。Alice 签一份 Config change，仅授予 `POLICY | NONCE`（关入门禁），24 小时后到期，绑定 `policy_manager = A`。同时写入规则哈希：单笔 ≤ 100 USDC，累计 ≤ 300 USDC，资产只能回到 A。这里假设 A 的代码是会检查 Actor 与规则的策略账户。

```callout warn CAUTION：manager = A 时不能只看 msg.sender
协议发出的调用本来就是 A 调 A。账户代码必须从交易上下文读出本次的 actorId，再按该 Actor 的规则检查。默认账户代码信任自调用，不能直接当策略账户。
```

**第 4 步 · Agent 代付买入与三类行为对比**

Agent 持有受限私钥后的三类典型行为与防御分工：
- **场景 A（试图偷钱）**：Agent 构造交易直接调用 `USDC.transfer(黑客, 1000)`。
  👉 **拦截点**：在协议第一层被拦截（`call.to ≠ manager`），抛出 `ActorPolicyViolation`，当前 Phase 直接失败。
- **场景 B（试图超额）**：Agent 经 Manager 尝试买入 1,000 USDC 的代币。
  👉 **拦截点**：第一层协议门禁放行，但在 Manager 合约内部被单笔限额规则（≤ 100 USDC）拦截，合约主动 `revert`。
- **场景 C（合规买入）**：Agent 经 Manager 买入 50 USDC 且接收人指定为 Alice。
  👉 **放行**：两层检查全部通过，Launchpad 成交，买入的代币安全回流 Alice 账户。

```uml q="Agent 用自己的钥匙签名、平台代付时，8130 的检查分几层？" read="rect 标出两个 Phase。示例函数 executePolicy 是教学设计。" takeaway="协议检查身份、scope、nonce 和入口地址；Manager 检查业务规则。报销在 Phase 0，买入失败不影响它。"
sequenceDiagram
  autonumber
  participant G as Agent (agent-key)
  participant P as Sponsor P
  participant N as 节点 / 执行客户端
  participant K as Keystore
  participant A as Account A (= Manager)
  participant L as USDC / Launchpad
  G->>P: 请求代付，附 sender payload
  P-->>G: payer_auth
  G->>N: 0x79 交易，sender=A，nonce_key=7
  N->>K: authenticate → actorId，查 scope / expiry
  N->>N: 检查 nonce 与 P 的余额，预扣费用
  rect rgb(234, 241, 251)
    N->>A: Phase 0 · call.to == manager → executePolicy(报销 P)
  end
  rect rgb(240, 248, 236)
    N->>A: Phase 1 · executePolicy([approve, buy])
    A->>K: 读 actorId 与 policy commitment
    A->>L: approve 100 → buy(recipient=A)
    alt 滑点失败
      L-->>A: revert，Phase 1 回滚
    end
  end
  N-->>G: 回执：payer + phaseStatuses
```

**失败路径**

| Agent 的行为 | 在哪一层被拦 | 成本 |
|---|---|---|
| 直接调用 `USDC.transfer` | 协议门禁（`call.to ≠ manager`） | 交易已入块，nonce 和 Gas 消耗 |
| 经 Manager 但买 1,000 USDC | Manager 单笔额度检查 | 同上 |
| 单笔合规但累计超 300 | Manager 累计预算检查 | 同上 |
| 授权已过期或已撤销 | Actor 有效性检查 | 交易无效，不入块 |
| Phase 1 买入失败 | — | Phase 0 报销保留；allowance 回到 Phase 1 之前 |

**第 5 步 · 撤权**：Alice 提交 `RevokeActor(agent-key)`。如果她曾签过可重复提交的 JIT 授权，还要提交 `IncrementLocalEpoch`，否则旧授权可以让 Agent 复活。已签出的 Perps 订单不会因此自动作废，要由产品的订单状态机处理。

## L 8130 细节：Gas、Lock、Profile、可移植性 {depth=3}
- **Gas 组成**：`intrinsic = AA_BASE_COST(15,000) + 载荷 + nonce 槽 + 代码 + account_changes + 自动委托 + sender_auth + payer_auth`。calls 可用 Gas = `gas_limit − (intrinsic − payer_auth_cost)`。规范另有 calldata floor，数据多的 8130 交易不能比 EIP-7623 普通交易更便宜地发布数据。
- **[[Account Lock]]**：锁定期间拒绝授权、撤权和代码委托变更，节点可以据此给更高的待处理额度。代价是不能即时撤权。用户交易账户一般不该长期锁定。
- **两个 Adoption Profile**：L1 Profile 接受任何在 `MAX_AUTHENTICATION_GAS` 内返回的认证器。L2 Profile 在交易路径上只接受标准认证器集合，验证成本固定，Gas 表可按链调整。Mantle 若采用 8130，应选 L2 Profile。
- **可移植性**：Keystore 和认证器是普通合约，可以部署到任何 EVM 链。没有 `0x79` 交易的链要用 4337 等传输方式。原生交易信封、交易上下文和 nonce 预编译不会自动出现。
- **已有账户接入**：EOA 用原私钥发 8130 交易，无代码时自动委托到默认账户；已有 4337 钱包调用 `importAccount()` 导入。禁用 EOA 的隐式 Actor 不等于原私钥在普通交易里失效。
- **规范待澄清**：锁定期间哪些配置操作可以走原生 `account_changes`；payer_auth 预扣与实际计量的口径。实现前要用测试向量固定。

## M EIP-8141：交易流程中心的设计 {depth=2}
**一句话**：8141 不定义账户角色。它把一笔交易拆成有序的 [[Frame]]。账户代码用新指令 [[APPROVE]] 告诉协议“我批准执行”或“我批准付款”。新交易类型是 `0x06`，新增 7 个指令。

**1. 交易字段**：`[chain_id, nonce, sender, frames, signatures, fees, blob_versioned_hashes]`。每个帧是 `[mode, flags, target, limits, value, data]`，`limits = [execution_gas_limit, state_gas_limit]`。一笔交易有 1–64 个帧。

**2. 三种帧模式**

| 模式 | 顶层调用者 | 用途 |
|---|---|---|
| [[DEFAULT]] (0) | `ENTRY_POINT = 0xaa` | 部署账户、后处理 |
| [[VERIFY]] (1) | `ENTRY_POINT` | 只读验证，结束时调用 APPROVE |
| [[SENDER]] (2) | `tx.sender` | 以账户身份执行业务，可带 value |

`target = null` 表示 `tx.sender`。SENDER 帧里，被调合约看到的 `msg.sender` 就是账户 A，所以现有合约不用改。

**3. 签名列表：不是所有验签都在 EVM 里**。`signatures` 里的 `SECP256K1`（2,800 Gas）和 `P256`（6,700 Gas）由协议在执行帧之前验证。`ARBITRARY` 只是见证数据容器，由账户代码用 `SIGDATACOPY` 读取并自行验证。签名有效只说明“这把钥匙签了这个哈希”，账户还要检查这把钥匙有没有权限。P256 验签也不等于完整的 WebAuthn 校验。

**4. APPROVE 状态机**：交易开始时 `sender_approved = false`、`payer = None`。

```uml q="一笔 8141 交易的批准状态怎样变化？什么情况下整笔交易无效？" read="简化模型：只画批准相关的状态。APPROVE 的 scope 0x1 = 付款，0x2 = 执行，0x3 = 两者。" takeaway="nonce 在付款批准时消耗；之后的业务失败不退 nonce，也不退已用 Gas。"
stateDiagram-v2
  [*] --> Unapproved : 协议签名预验通过
  Unapproved --> ExecApproved : 账户 VERIFY 帧 APPROVE(0x2)
  Unapproved --> Approved : 账户 VERIFY 帧 APPROVE(0x3)
  ExecApproved --> Approved : 付款方 APPROVE(0x1)
  Approved --> Executing : 执行后续 SENDER / DEFAULT 帧
  Executing --> Settled : 全部帧结束，退还未用 Gas
  Unapproved --> Invalid : VERIFY 失败或没有 APPROVE
  ExecApproved --> Invalid : 结束时仍没有 payer
  Invalid --> [*]
  Settled --> [*]
  note right of Invalid : 无效交易的全部效果丢弃，包括部署
  note right of Approved : 进入时消耗 nonce，预扣 max_cost
```

```callout err WARNING：一次执行批准放行后面全部 SENDER 帧
账户的 VERIFY 代码不能只检查“有一个合法的 buy 帧”。它必须检查后面每个 SENDER 帧的目标、函数、金额、value，否则攻击者可以在后面追加一个 transfer 帧。
```

**5. [[内省指令]]**：VERIFY 代码靠这些指令看到整笔交易：

- `TXPARAM`（0xb0）：交易字段与签名哈希。
- `FRAMEDATALOAD` / `FRAMEDATACOPY`（0xb1 / 0xb2）：读任意帧的 calldata。
- `FRAMEPARAM`（0xb3）：帧的 target、mode、flags、value 与完成状态。
- `SIGPARAM` / `SIGDATACOPY`（0xb4 / 0xb5）：签名元数据与见证。

这些指令只能在 Frame 交易里用，在别的交易类型里会异常退出。

**6. [[原子组]]**：连续帧中，前面的帧设 `flags` 的 `0x4` 位，最后一帧不设，它们构成一个原子组。组内任一帧失败，整组回滚，组内剩余帧标为跳过。**组外的后续帧继续执行**。这一点与 8130 不同：8130 的 Phase 失败会跳过后面全部 Phase。

**7. 双维 Gas**：每个帧有独立的 execution 与 [[state gas]] 预算，两者不能互借，前一帧剩余的预算也不转给后一帧。新建账户状态要 `120 × 1,530 = 183,600` state gas。帧之间清空 transient storage，不能用 `TSTORE` 在帧之间传递“已验证”标记。

**8. 公共 mempool 规则**：[[验证前缀]]是“从第一帧到设定 payer 为止”的最短帧序列。公共池只接受 4 种前缀形状：`[self_verify]`、`[deploy, self_verify]`、`[only_verify, pay]`、`[deploy, only_verify, pay]`。前缀的 execution 预算加签名成本 ≤ 100,000，state 预算 ≤ 500,000；验证代码一般只能读 sender 自己的存储，不能读 `TIMESTAMP`。每个 sender 最多 1 笔待处理交易。

**9. [[default code]]**：对没有代码的 EOA，VERIFY 帧执行协议内置的默认规则：检查 secp256k1 签名，然后 APPROVE。所以 EOA 不部署合约也能用批处理和代付，但**没有** Session key 和额度控制。

## N 8141 例子：交易生命周期与同一个 Alice {depth=2}
**核心概念：为什么 VERIFY 帧由智能合约执行？**
传统以太坊由节点在 EVM 外用固化代码（`ecrecover`）验签。在 8141 中，Alice 的账户本身就是链上的钱包合约 A。节点不感知具体的密码学算法或权限规则。执行 VERIFY 帧时，节点启动 EVM 只读沙箱运行 A 的代码。钱包合约在沙箱内完成自定义验签并决定是否放行。

**实战场景：Alice 经平台 P 代付买入 100 USDC 代币**
以 Alice 用 Passkey 签名、平台 P 代付 Gas 买入为例：
1. **链下组装**：客户端组装 Type 0x06 交易，包含 4 个帧：F0 是 A 的 VERIFY 帧；F1 是 P 的 VERIFY 帧；F2 是 SENDER 帧（`USDC.approve`，带 flag `0x4` 原子组标记）；F3 是 SENDER 帧（`Launchpad.buy`）。
2. **执行 F0（账户自我安检）**：节点在只读沙箱运行 A 的代码。A 用 `SIGDATACOPY` 读入签名并验证。A 用 `FRAMEPARAM` 与 `FRAMEDATALOAD` 透视后续帧。A 确认 F2、F3 目标合规且金额在预算内，执行 `APPROVE(0x2)`。协议标记 `sender_approved = true`。
3. **执行 F1（代付赞助安检）**：节点运行 P 的合约代码。P 验证代付凭据并确认余额充裕，执行 `APPROVE(0x1)`。协议标记 `payer = P`。
4. **协议握手分水岭**：`sender_approved` 为真且存在 `payer`，交易正式有效。协议消耗 A 的 nonce，并从 P 预扣最大 Gas 费。若任一 VERIFY 帧失败，交易直接丢弃，不消耗 nonce 和 Gas。
5. **执行 F2 与 F3（业务执行）**：节点切入 SENDER 模式，被调方看到的 `msg.sender` 真实为 A。现有 DeFi 合约无需修改即可兼容。F2 与 F3 组成原子组，若 F3 失败，F2 的授权一同回滚。
6. **结算**：退还多余 Gas 给 P，交易打入区块。

**进阶：Alice 首次开户与授权 Agent**
- **首次开户**：8141 无需专门开户配置。交易第一帧用 DEFAULT 模式调用 Factory 部署 A，后续帧紧接着跑 A 的 VERIFY 与业务。
- **授权 Agent**：Alice 发送交易，F0 VERIFY 验证其身份，F1 SENDER 调用 `A.authorizeSession(K_Agent, 规则)` 写入存储。VERIFY 为只读模式，授权状态必须在 SENDER 帧写入。

**Agent 代付买入**

```uml q="Agent 签名、平台代付时，8141 的检查发生在哪些帧？" read="F4、F5 是原子组；F3 在组外。executeSessionBuy 是教学设计。" takeaway="账户代码在 F1 用内省审查全部后续帧；累计预算在 F5 执行时检查。报销在组外，买入失败也保留。"
sequenceDiagram
  autonumber
  participant G as Agent (K_Agent)
  participant N as 节点 / 执行客户端
  participant X as Expiry Verifier
  participant A as Account A 代码
  participant P as Paymaster P
  participant L as USDC / Launchpad
  G->>N: 0x06 交易 F0–F5，signatures=[K_Agent]
  N->>N: 协议预验 secp256k1 签名
  N->>X: F0 VERIFY · 检查截止时间
  N->>A: F1 VERIFY · 查 Session，内省 F3–F5
  A-->>N: APPROVE(0x2)
  N->>P: F2 VERIFY · 审核费用
  P-->>N: APPROVE(0x1)，nonce+1，预扣 max_cost
  N->>A: F3 SENDER · 报销 P（组外）
  rect rgb(240, 248, 236)
    N->>A: F4 SENDER flag 0x4 · approve
    N->>A: F5 SENDER · executeSessionBuy
    A->>L: 检查累计预算 → buy(recipient=A)
    alt 买入失败
      L-->>A: revert，F4 与 F5 一起回滚
    end
  end
  N-->>G: 逐帧回执，没有交易级 status
```

**逐帧回执要按组解读**：假设 F4 返回 `status = 1`，F5 返回 `status = 0`。这时 F4 设置的 allowance **没有**保留，因为整组回滚了。SDK 必须按 flags 重建原子组再判断结果。

**失败路径**

| 情况 | 结果 |
|---|---|
| F1 发现后面有越权帧 | 不 APPROVE → 交易无效，不入块，nonce 不变 |
| F2 Paymaster 拒绝 | 没有 payer → 交易无效 |
| F5 累计预算超限 | F4、F5 回滚；F3 报销保留；nonce 与 Gas 已消耗 |
| 想在撤单失败时停止挂新单 | 需要显式检查：独立帧失败后，后面的独立帧仍会执行 |

**第 5 步 · 撤权**：Alice 发交易调用账户的撤权函数，例如把 Session 标为 revoked 或增加版本号。依赖旧 Session 的待处理交易在下次验证时失效。

## O EIP-8250：给 8141 补上多通道 nonce {depth=2}
8141 本体只有一个账户级 nonce，Meme Agent 和 Perps Agent 会互相排队。[[keyed nonce]]（EIP-8250）把 `nonce` 换成：

- `nonce_keys`：1–16 个严格升序的 `uint256`。
- `nonce_seq`：所选 key 共享的一个序号。

`[0]` 表示沿用旧的账户 nonce；0 不能和其他 key 混用。非零 key 的序号存在 `NONCE_MANAGER` 里，未用过的 key 序号为 0，不需要先注册。付款批准时，所有所选 key 一起加 1。

```excalidraw q="两个 Agent 同时下单时，各方案的序号依赖在哪里？" read="每列是一个方案；红色表示共用一条队列；紫色表示协议状态。" takeaway="8130 原生多通道加 nonce-free；8141 本体只有一条队列；8250 补了多通道，但新 key 会留下持久状态，不等于 nonce-free。" kind=对比
{"grid": {"w": 320, "h": 110}, "defaults": {"w": 230, "h": 66, "fontSize": 17},
 "nodes": [
   {"id": "h0", "label": "8141 本体", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "q0", "label": "唯一 nonce\nMeme 与 Perps 排队", "col": 0, "row": 1, "color": "red"},
   {"id": "h1", "label": "EIP-8130", "col": 1, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "k7", "label": "key 7：41 → 42", "col": 1, "row": 1, "color": "violet"},
   {"id": "k8", "label": "key 8：12 → 13", "col": 1, "row": 2, "color": "violet"},
   {"id": "nf", "label": "nonce-free\n短窗口 + 环形去重", "col": 1, "row": 3, "color": "green"},
   {"id": "h2", "label": "8141 + 8250", "col": 2, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "s7", "label": "keys [7]，seq 4", "col": 2, "row": 1, "color": "violet"},
   {"id": "s9", "label": "keys [9]，seq 8", "col": 2, "row": 2, "color": "violet"},
   {"id": "nk", "label": "新 key 用一次\n留下持久状态", "col": 2, "row": 3, "color": "yellow"}
 ],
 "edges": [
   {"from": "h0", "to": "q0"}, {"from": "h1", "to": "k7"}, {"from": "k7", "to": "k8", "dashed": true, "arrow": "none"},
   {"from": "k8", "to": "nf", "dashed": true, "arrow": "none"}, {"from": "h2", "to": "s7"},
   {"from": "s7", "to": "s9", "dashed": true, "arrow": "none"}, {"from": "s9", "to": "nk", "dashed": true, "arrow": "none"}
 ]}
```

**8250 的边界**

| 常见说法 | 准确说法 |
|---|---|
| 8250 让交易完全独立 | 只让重放域独立；余额、保证金、订单簿、Sponsor 仍然共享 |
| 8250 就是 nonce-free | 新 key 首次写入要付 state gas，状态永久增长；8130 的 nonce-free 是有界窗口 |
| 8250 把 key 分配给 Agent | 协议不管 key 属于谁；账户 VERIFY 代码可用新增的 TXPARAM（0x0D–0x10）检查 key |
| 有了 8250 公共池就能并发 | 公共池仍是每个 sender 1 笔待处理交易 |

多个 key 共享一个 `nonce_seq`：key 7 当前为 4、key 9 当前为 8 时，不能用一笔交易同时推进两者。8250 激活后签名载荷会变，跨激活边界的待处理交易要重签。

## P 8141 细节：Gas、Paymaster、待澄清项 {depth=3}
- **Intrinsic**：`12,000 + 475 × 帧数 + 帧数据成本 + 签名数据成本（signer、msg、signature 三部分） + 验签成本 + value 转账成本`。三帧加一个 k1 签名的固定部分是 `12,000 + 3 × 475 + 2,800 = 16,225`，不含数据和执行。
- **最大预扣**：`max_gas = max(intrinsic + Σexecution + Σstate, calldata_floor + Σstate)`，付款人预扣 `max_cost`。
- **Refill 与 refund**：原子组回滚撤销状态与对应 state gas，但已做的执行工作照常计费。双维 Gas 区分资源种类，不等于 Launchpad 与 Perps 之间的资源隔离。
- **Paymaster**：标准 Paymaster 通过精确匹配 runtime code 识别，限制原生资产外流并支持延迟提现，节点按 `余额 − 待处理预留 − 待提现` 接纳。非标准 Paymaster 每个最多 1 笔待处理交易。规范里“只有标准 Paymaster 可公共传播”的句子与非标准专节有张力，待澄清。
- **canonical 签名哈希**：`msg` 为空的签名条目在计算哈希时清空签名字节，避免“签名包含自己”。
- **治理附带条件**：ACDE #244 把 8141 定为 SFI 时说明，EIP 编号和实现都可能大改。

## Q 设计理念与生态：为什么 Base 选 8130，以太坊选 8141 {depth=2}
```excalidraw q="受限权限分别放在哪一层检查？" read="蓝色是协议负责的检查；黄色是账户或 Manager 代码负责的检查。从上往下按执行顺序。" takeaway="8130 由协议强制一部分权限；8141 把权限全部交给账户代码，换来更大的表达力。" kind=分层
{"grid": {"w": 440, "h": 110}, "defaults": {"w": 300, "h": 66, "fontSize": 17},
 "nodes": [
   {"id": "a1", "label": "协议：Actor 有效期 + scope", "col": 0, "row": 0, "color": "blue"},
   {"id": "a2", "label": "协议：call.to == Manager", "col": 0, "row": 1, "color": "blue"},
   {"id": "a3", "label": "Manager：额度 / 市场 / 接收人", "col": 0, "row": 2, "color": "yellow"},
   {"id": "b1", "label": "协议：预验标准签名", "col": 1, "row": 0, "color": "blue"},
   {"id": "b2", "label": "账户 VERIFY：Session\n+ 内省全部后续帧", "col": 1, "row": 1, "color": "yellow"},
   {"id": "b3", "label": "账户执行入口：动态预算", "col": 1, "row": 2, "color": "yellow"}
 ],
 "edges": [{"from": "a1", "to": "a2"}, {"from": "a2", "to": "a3"}, {"from": "b1", "to": "b2"}, {"from": "b2", "to": "b3"}],
 "boxes": [{"label": "EIP-8130", "around": ["a1", "a2", "a3"], "color": "gray"}, {"label": "EIP-8141", "around": ["b1", "b2", "b3"], "color": "gray"}]}
```

**设计理念对比**

| 维度 | EIP-8130 | EIP-8141 |
|---|---|---|
| 核心问题 | 谁能用账户、用什么钥匙、能做什么、谁付费 | 交易如何验证、谁何时付款、按什么顺序执行 |
| 标准化对象 | 账户角色与权限（声明式） | 执行流程原语（可编程） |
| 验证代码 | 只有认证器的 `authenticate`；L2 Profile 只用标准集合 | 账户任意 EVM 代码，公共池再加限制 |
| 节点准入成本 | 可预测：固定认证器 + 少量配置槽 | 受 100k 预算与状态访问规则约束 |
| 新签名算法 | 部署新认证器并纳入标准集合 | 账户代码直接实现 |
| 跨链 | Keystore 在各链同一地址，一次签名更新多链 Actor | 每条链的账户代码各自维护 |
| 钱包 / SDK 负担 | 较轻：权限语义统一 | 较重：每个账户要自写 Session 与内省检查 |

**为什么不同实体支持不同方案**

- **Base（Coinbase）提出 8130**：作者是 Coinbase 的 Chris Hunter，创建于 2025-10-14（[EIP-8130](https://eips.ethereum.org/EIPS/eip-8130)）。8130 的动机写明：让节点模拟钱包代码，需要完整状态、追踪设施和信誉系统。L2 要服务高频游戏、机器人和 Agent，需要固定成本的验证路径和原生 Session key。Base 文档把 8130 列为自己的 Native AA 实现，目前只在 vibenet devnet 上运行（[Base 文档](https://docs.base.org/base-chain/network-information/native-account-abstraction)）。2026-09-30 上线的 Cobalt 主网升级不含 8130（[Cobalt](https://docs.base.org/base-chain/specs/upgrades/cobalt/overview)）。
- **以太坊核心开发者选择 8141**：作者包括 Vitalik Buterin、lightclient、Felix Lange，以及 4337 团队成员。提案理由是给 ECDSA 提供抗量子的退出路径，并泛化了 EIP-7701，继承 4337 多年的验证规则经验（[ACDE #229](https://github.com/ethereum/pm/issues/1883)）。L1 更看重通用性和与以太坊路线（FOCIL、无状态化）的结合。
- **Offchain Labs 的立场**：他们支持 8130 被认真考虑，但没有要求 ACD 采纳它；如果 ACD 收敛到修改后的 8141，他们会支持，并考虑与 8130 并行实现（[ACDE #244 报道](https://christinedkim.substack.com/p/acde-244)）。

```callout warn “以太坊否定了 8130”这一说法不准确
公开记录里没有正式拒绝 8130 的决议。实际过程是：ACD 先以 Frame 作为“Native AA 占位”给出 CFI，期待各方案收敛（[ACDE #241](https://eipsinsight.com/calls/acde/241)）。ACDE #244 把 8141 定为 SFI，并注明编号与实现都可能改（[ACDE #244](https://github.com/ethereum/pm/issues/2197)）。会前社区还讨论过反过来修改 8130。准确说法是：L1 选了 8141 路线，8130 没有被选为 L1 方案。
```

**治理时间线**

```timeline v
2023 | ERC-4337 上线 | 合约层 AA，需要 Bundler
2025-10-14 | EIP-8130 创建 | Coinbase / Base
2026-01-29 | EIP-8141 合并，ACDE #229 提为 Hegota headliner | lightclient 与 fjl 主讲
2026-02-26 | ACDE #231 | 共识不足；Reth 担心复杂度，Tectonic 担心 PQ 签名体积
2026-04-16 | EIP-8250 创建 | keyed nonces
2026-07-16 | ACDE #241 | 重申：FOCIL 是 headliner；Native AA 以 Frame 为占位 CFI
*2026-08-27 | ACDE #244 | 8141 SFI 进 Hegota，附“可能大改”条件
2026-09-30 | Base Cobalt 主网 | 不含 8130，8130 仍在 vibenet
```

每个时间点的来源：

| 日期 | 事件 | 来源 |
|---|---|---|
| 2023 | ERC-4337 上线 | [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) |
| 2025-10-14 | EIP-8130 创建 | [EIP-8130 原文](https://eips.ethereum.org/EIPS/eip-8130) |
| 2026-01-29 | 8141 提为 Hegota headliner | [ACDE #229](https://github.com/ethereum/pm/issues/1883) · [Magicians 提案](https://ethereum-magicians.org/t/hegota-headliner-proposal-frame-transaction/27618) |
| 2026-02-26 | ACDE #231 分歧 | [ACDE #231](https://github.com/ethereum/pm/issues/1931) · [Christine Kim 报道](https://christinedkim.substack.com/p/acde-231) |
| 2026-04-16 | EIP-8250 创建 | [EIP-8250 原文](https://eips.ethereum.org/EIPS/eip-8250) |
| 2026-07-16 | Native AA 以 Frame 为占位 CFI | [ACDE #241 记录](https://eipsinsight.com/calls/acde/241) |
| 2026-08-27 | 8141 SFI | [ACDE #244](https://github.com/ethereum/pm/issues/2197) · [Christine Kim 报道](https://christinedkim.substack.com/p/acde-244) |
| 2026-09-30 | Base Cobalt 主网，不含 8130 | [Cobalt 文档](https://docs.base.org/base-chain/specs/upgrades/cobalt/overview) · [Base Native AA 文档](https://docs.base.org/base-chain/network-information/native-account-abstraction) |

**扩展性**

| 方向 | 8130 | 8141 |
|---|---|---|
| 缺的能力 | 任意验证逻辑（只能写成认证器）；抗量子认证器尚未标准化 | 多通道 nonce（靠 8250）；统一 Session / 撤权格式；nonce-free |
| 扩展方式 | 新认证器纳入标准集合；伴随 ERC（如 ERC-8168 付款服务） | 新 EIP 叠加，如 8250；账户代码自由实现 |
| 锁定成本 | Keystore 存储布局、scope 位、Phase 语义进入协议，改动要硬分叉 | 7 个新指令与帧语义进入 EVM；每个扩展改签名载荷 |
| 与 L1 的关系 | L1 未采纳；L2 自行采用会与 L1 钱包生态分叉 | 与 L1 一致，钱包与工具更可能统一支持 |

## R 发现 {depth=2}
```finding F1 high
# 8130 用协议强制受限 Agent 的入口，但业务规则仍要 Manager 实现
结论: POLICY Actor 的每个顶层调用必须指向绑定的 Manager，违规时当前 Phase 失败。额度、市场、接收人由 Manager 检查。
证据: [observed] 01-eip-8130-deep-dive.md §5.1–§5.3（EIP-8130 Actor Scope / Actor Policies）。[observed] OPERATOR | POLICY 按 OPERATOR 处理。
影响: Manager 的资产执行路径和自调用防护要单独审计。不能为了兼容旧接口给 Agent 加 OPERATOR。
```

```finding F2 high
# 8141 的受限 Agent 完全由账户代码实现，执行批准覆盖全部后续 SENDER 帧
结论: 账户 VERIFY 代码必须用内省指令检查每个后续帧，否则 Agent 可以追加越权帧。
证据: [observed] 02-eip-8141-deep-dive.md §6.4、§7（EIP-8141 Security Considerations）。
影响: Mantle 若走 8141，要自建并审计 Session 存储、撤权与内省检查库。这是安全关键代码。
```

```finding F3 high
# 原子性的边界不同：8130 遇错停止，8141 组外继续
结论: 8130 某 Phase 失败会跳过全部后续 Phase；8141 原子组失败后，组外帧继续执行。两者都能保留组外 / 前序的报销。
证据: [observed] 01 §8.1；02 §8.1–§8.5。
影响: Perps 撤旧单 + 挂新单在 8141 上要显式检查前一步结果；SDK 要按 Phase / 原子组解读回执。
```

```finding F4 medium
# 多通道 nonce：8130 原生提供，8141 需要 8250，两者都不等于权限或资金隔离
结论: 8130 有二维 nonce 和有界 nonce-free；8250 提供 keyed nonces，但新 key 留下持久状态。两者都不按 Agent 分配通道。
证据: [observed] 01 §7；02 §11；04-8141-lifecycles.md 第七节。
影响: 资金必须强隔离的策略，应考虑独立账户，而不是只分配不同 key。
```

```finding F5 high
# L1 已选择 8141 路线，8130 目前只在 Base devnet 上运行
结论: ACDE #244（2026-08-27）把 8141 定为 Hegota 的 SFI 项，并注明可能大改。Base Cobalt 主网（2026-09-30）不含 8130。
证据: [observed] ethereum/pm #2197、Christine Kim ACDE #244 报道、Base Cobalt 文档。[inferred] 8130 没有被正式拒绝，只是没有被选为 L1 方案。
影响: 选 8130 意味着与 L1 钱包生态分叉的风险；选 8141 意味着跟随一个仍在变的规范。
```

```finding F6 medium
# 对 Mantle：先做 8130 PoC，并用 8141 + 8250 做同等安全的对照组
结论: 同账户多 Agent、链上直发的高频场景最能体现 8130 的原生 Actor、门禁与 nonce-free。8141 + 8250 的 L1 一致性是长期优势。两者都依赖 Mantle 先定义好产品权限模型。
证据: [inferred] 03-mantle-aa-coverage-and-fit.md §1.3、§7.7、§8.3、§13。[speculative] 实际收益未测，没有 Mantle 上的延迟、吞吐或 Gas 数据。
影响: 先冻结授权、预算、撤权、订单语义，再用同一负载比较合约层基线、8130、8141 + 8250 三组。
```

## S Mantle 选型：Meme Launchpad 与 Perps {depth=2}
**两个产品最看重的账户特性**

| 特性 | Meme Launchpad | Perps |
|---|---|---|
| 受限 Agent（Session key） | 关键：Agent 持续发行、买卖 | 关键：策略 Agent 挂撤单 |
| 代付与报销 | 关键：新用户没有 MNT | 重要：做市高频交易 |
| 多通道 / nonce-free | 重要：同账户多个 Agent | 关键：直发模式下挂撤改单 |
| 原子性 | 关键：approve + buy；毕业迁移 | 关键：撤旧单 + 挂新单 |
| 即时撤权 | 重要 | 关键：密钥失陷时停止下单 |
| 离线订单签名 | 次要 | 关键：混合撮合模式 |
| Passkey 开户 | 关键：降低门槛 | 次要 |
| 审计（谁、凭什么权限） | 重要 | 关键 |

**需求在两个方案里怎样实现**

| 需求 | 8130 | 8141 + 8250 | 两者都缺 |
|---|---|---|---|
| 受限 Agent | 原生 Actor + POLICY 门禁 | 账户自建 Session + VERIFY 内省 | 业务规则代码 |
| 有效期 / 撤权 | 原生 expiry、Revoke、Local epoch | 账户自建版本号与撤权函数 | 旧订单作废、持仓处理 |
| 代付 | `payer` + SPONSOR_PAYER | Paymaster 的 VERIFY 帧 APPROVE(0x1) | 预算、限速、反滥用 |
| 报销 | Phase 0 报销，后续 Phase 失败也保留 | 组外 SENDER 帧报销 | 报销本身失败的处理 |
| 并发 | 二维 nonce + nonce-free | 8250 keyed nonces | 公共池并发规则；共享保证金 |
| 撤旧单 + 挂新单 | 同 Phase 或拆两 Phase；前者失败自动停 | 同组或拆组；拆组时要显式检查 | 撤单优先（排序层） |
| 离线订单 | Actor-aware 验签返回 actorId / scope；默认 ERC-1271 不接受 POLICY-only | 账户自定义订单验签 | 订单版本、部分成交账本 |
| Passkey | 标准 `passkey` 认证器 | P256 预验 + 账户实现 WebAuthn 细节 | 钱包授权展示 |
| 审计 | 交易上下文给出 actorId | 需要统一的账户事件规范 | 业务 operation ID |
| 原生币买入 | 顶层 call 无 value，由账户代码转发 | SENDER 帧可直接带 value | 本金、报销、Gas 分开记账 |

**按 Perps 形态区分**

- **Vault / 预言机型（初期）**：订单是“请求 → Keeper 执行”。AA 改善授权与代付，但不能把异步执行变成原子成交。两案差距小。
- **混合撮合、链上结算**：链上 sender 是撮合者，用户 nonce 不在报价路径上。重点是订单验签接口：8130 有 Actor-aware 验签；8141 要账户自建。
- **完全链上订单簿**：每次挂撤单都是用户原生交易。8130 的 nonce-free 与多通道直接进入关键路径，这是 8130 最有优势的场景。

```callout ok 推荐：8130 优先做 PoC，8141 + 8250 做对照，不先改链
理由：
1. 受限 Agent、代付、同账户多 Agent、即时撤权是两个产品的核心需求。8130 原生提供其中多数，自建代码最少。
2. 8130 的 L2 Profile 验证成本固定，适合高频 Agent 的准入。
3. 8141 + 8250 是 L1 的方向，长期钱包兼容更好，所以必须保留为对照组，不能只拿 8141 本体比较。

前提：Mantle 先冻结权限、预算、撤权、订单语义；如果合约层方案已满足目标，就不改链。
```

**PoC 必须验证的事项**

1. 受限 Agent 追加提现或扩大 allowance 时，两案都在完整路径上拒绝。
2. 8130 混入 OPERATOR、账户自调用旁路时，权限不扩大。
3. 8141 在已检查帧后追加未检查的 SENDER 帧时，批准前拒绝。
4. 多 Agent 同时消耗共享预算时，不超卖。
5. Agent 使用其他策略的 nonce key 时，明确拒绝位置和剩余干扰。
6. 撤权后重放旧 JIT 授权、结算旧订单时，权限不能复活。
7. 换 Sponsor、改有效期或换 nonce 重试时，业务不重复执行。
8. 测量“旧报价何时不可成交、新报价何时生效”的 p50 / p95 / p99，而不是 RPC 接收耗时。

## T 局限与开放问题 {depth=2}
- 三个 EIP 都是 Draft。ACDE #244 明确说 8141 的编号与实现都可能改，本文的字段、常量可能过时。
- 本文没有运行任何客户端或合约，表中常量来自规范文本，不是 Mantle 实测。
- Base 与 Offchain Labs 的立场来自 Christine Kim 报道中引用的 X 帖子，不是会议纪要原文。
- 开放问题：Mantle 的 Perps 终态是哪种形态？同一用户会同时运行多少个 Agent？这两点决定多通道 nonce 是否在关键路径上。
- 开放问题：L1 采用 8141 后，L2 单独采用 8130 的钱包兼容成本是多少？

## U 方法与证据 {depth=3}
**材料**：`8-native-aa/references/` 下 5 篇文档（8130 / 8141 深度解析、Mantle 适配评估、两篇生命周期讲解），EIP 原文，ACD 会议记录与 Base 文档。

**论断台账（摘录）**

| 论断 | 证据 | 类型 |
|---|---|---|
| OPERATOR \| POLICY 绕过门禁 | 01-eip-8130-deep-dive.md §5.1 | observed |
| 门禁失败消耗 nonce 与 Gas | 01 §5.2 | observed |
| 8141 执行批准覆盖全部后续 SENDER 帧 | 02-eip-8141-deep-dive.md §6.4 | observed |
| 8141 回执没有交易级 status | 02 §8.3 | observed |
| 8250 新 key 留下持久状态 | 02 §11.5 | observed |
| 4337 基本 UserOp ~42k gas | RIP-7560 Motivation | observed |
| 8141 SFI 于 2026-08-27 | ethereum/pm #2197；Christine Kim ACDE #244 | observed |
| Base 的 8130 仅在 vibenet | Base 文档 Native AA Reference | observed |
| 以太坊没有正式拒绝 8130 | 以上记录中无拒绝决议 | inferred |
| Mantle 先做 8130 PoC | 03-mantle-aa-coverage-and-fit.md §13 | inferred |

**已排除的常见误解**（页面中没有作为结论出现）：

- ~~8141 的所有验签都在 EVM 里~~
- ~~8250 等于 nonce-free~~
- ~~8141 不能保留独立报销~~
- ~~Actor 就是子账户~~
- ~~多通道 nonce 就是资金隔离或撤单优先~~
- ~~IncrementLocalEpoch 会删除已生效的 Actor~~
- ~~8130 不改 EVM 所以不用改链~~

## V 复现 {depth=3}
核对三个 EIP 的当前状态与作者：

```bash
for e in 8130 8141 8250; do
  curl -s https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-$e.md \
    | grep -m5 -E '^(title|status|created|author):'
done
```

预期输出（2026-10-04）：三个 EIP 都是 `status: Draft`；8130 `created: 2025-10-14`，8141 `created: 2026-01-29`，8250 `created: 2026-04-16`。

重新渲染本页：

```bash
node ~/.agents/skills/answer-me-with-html/scripts/am.mjs render \
  8-native-aa/native-aa-overview.md -o 8-native-aa/native-aa-overview.html
```

## W 术语表 {depth=2}
```glossary
AA | 账户抽象、account abstraction | 让验签、付款、批处理由可编程规则决定，不再固定为一把私钥。
EOA | 外部账户 | 由一把 secp256k1 私钥控制、没有代码的账户。 | 不是合约钱包
ERC-4337 | 合约层 AA | 用 UserOperation、Bundler、EntryPoint、Paymaster 在协议外实现 AA。 | 不是协议功能
Bundler | 打包者 | 收集 UserOperation 并作为普通交易提交给 EntryPoint 的链下服务。
EntryPoint | 入口合约 | 4337 的单例合约，负责调用账户验证、执行和结算。 | 不同于 8141 的 ENTRY_POINT 地址 0xaa
Paymaster | 代付合约 | 为别人的操作支付 Gas 的合约；8141 也沿用这个名字。
EIP-7702 | EOA 代码委托 | EOA 把代码委托到某个合约，原私钥仍然有效。
Native AA | 原生账户抽象 | 由协议直接识别验证与付款规则的 AA，节点可直接打包。
mempool | 交易池 | 节点暂存待打包交易的地方；准入规则决定哪些交易能传播。
Session key | 会话密钥 | 在限定时间与范围内代表账户操作的独立密钥。
Sponsor | 代付方 | 替用户支付 Gas 的一方，8130 中是 payer，8141 中是 Paymaster。
Account | 账户 | 8130 中持有资产、对外显示的地址。
Actor | 操作身份 | 8130 中被账户授权的身份，用 actorId 标识，可有多个。 | 不是子账户，不独立持有资金
Authenticator | 认证器 | 8130 中只负责验签并返回 actorId 的合约。 | 不判断权限
Keystore | 权限登记簿 | 8130 中记录每个账户的 Actor、认证器、scope、到期时间的系统合约。 | 不保存私钥
Scope | 权限位 | 8130 中 Actor 的协议级权限位，位越多权限越大。
Policy Manager | 策略入口 | POLICY Actor 唯一能调用的地址，负责检查业务规则。
Phase | 执行阶段 | 8130 中一组共同成功或共同回滚的调用；失败后跳过后续 Phase。
2D nonce | 二维 nonce | 8130 的 (nonce_key, nonce_sequence)，不同 key 互不阻塞。
nonce-free | 无序模式 | 8130 中用短有效期 + 环形去重代替有序 nonce 的模式。 | 不同于 8250 的新 key
replay_id | 重放标识 | 8130 nonce-free 模式的去重键，不含费用与签名。 | 不能当业务幂等 ID
account_changes | 账户变更 | 8130 交易中的开户、配置变更、代码委托项。
Local epoch | 本地纪元 | 8130 配置消息的版本号；递增后旧的 JIT 授权失效。 | 不删除已生效的 Actor
Account Lock | 账户锁定 | 8130 中冻结授权变更以换取更高准入额度的机制。
Frame | 帧 | 8141 交易中的一个执行步骤，有自己的模式、目标和 Gas 上限。
VERIFY | 验证帧 | 8141 中只读的验证帧，必须调用 APPROVE。
SENDER | 发送者帧 | 8141 中以 tx.sender 身份执行的帧，需先获得执行批准。
DEFAULT | 默认帧 | 8141 中以协议入口 0xaa 身份执行的帧，用于部署和后处理。
APPROVE | 批准指令 | 8141 新增的指令 0xaa，结束当前调用并设置执行或付款批准。 | 不是 ERC-20 的 approve()
内省指令 | introspection | 8141 中读取交易字段、任意帧和签名的指令（0xb0–0xb5）。
原子组 | atomic batch | 8141 中用 flag 0x4 连起来的连续帧，组内共同回滚。
state gas | 状态 Gas | 8141 中按持久状态增长计费的独立 Gas 维度。
验证前缀 | validation prefix | 8141 中从第一帧到设定 payer 的最短帧序列，公共池只约束这一段。
default code | 默认代码 | 8141 对无代码账户执行的内置验证规则。 | 不提供 Session key
keyed nonce | 多键 nonce | EIP-8250 中用 key 集合 + 共享序号代替标量 nonce。
```

## X 参考资料 {depth=2}
1. [RIP-7560: Native Account Abstraction](https://github.com/ethereum/RIPs/blob/master/RIPS/rip-7560.md) — 合约层 AA 的问题清单（42k gas、alt mempool、tx.origin）。**PRIMARY**
2. [EIP-8141: Frame Transaction](https://eips.ethereum.org/EIPS/eip-8141) — 帧、APPROVE、内省、Gas、mempool 的权威文本。**PRIMARY**
3. [EIP-8130: Keystore Accounts](https://eips.ethereum.org/EIPS/eip-8130) — Actor、Scope、Policy、nonce、Profile 的权威文本。**PRIMARY**
4. [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) — UserOperation、Bundler、EntryPoint 的定义。**PRIMARY**
5. [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) — EOA 代码委托。**PRIMARY**
6. [EIP-8250: Keyed Nonces for Frame Transactions](https://eips.ethereum.org/EIPS/eip-8250) — 8141 的多通道 nonce。**PRIMARY**
7. [base/eip-8130 合约仓库](https://github.com/base/eip-8130) — Keystore 与认证器实现，未审计。
8. [Base 文档：Native Account Abstraction](https://docs.base.org/base-chain/network-information/native-account-abstraction) — 8130 仅在 vibenet 运行的说明。
9. [Base 文档：Cobalt 升级](https://docs.base.org/base-chain/specs/upgrades/cobalt/overview) — 2026-09-30 主网上线的功能列表。
10. [ACDE #229](https://github.com/ethereum/pm/issues/1883) — Frame 作为 Hegota headliner 提出，PQ 与 7701 的动机。**PRIMARY**
11. [ACDE #231 报道](https://christinedkim.substack.com/p/acde-231) — 各客户端对 Frame 的分歧。
12. [ACDE #241 记录](https://eipsinsight.com/calls/acde/241) — “Frame 作为 Native AA 占位 CFI”的原话。
13. [ACDE #244](https://github.com/ethereum/pm/issues/2197) 与 [Christine Kim 报道](https://christinedkim.substack.com/p/acde-244) — 8141 SFI 及其附带条件，Base 与 Offchain Labs 的立场。
14. [eip8130.io：竞争方案对比](https://eip8130.io/competing-standards) — 8130 视角下的提案谱系。
15. 本地文档：`8-native-aa/references/01`–`05` — 机制细节、例子与 Mantle 需求拆解。

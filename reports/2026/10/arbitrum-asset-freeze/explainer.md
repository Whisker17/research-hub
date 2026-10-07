---
template: research
title: Arbitrum 冻结黑客资产：机制拆解、审查争议与各链先例
subtitle: Arbitrum 没有用 sequencer 黑名单。Security Council 在一笔 L1 交易里临时升级 Inbox，以黑客地址的名义写入一条跨链消息，把 30,765.67 ETH 转走后立刻改回原实现。社区普遍支持这一次，但不等于接受链长期拥有这种能力。Mantle 在结构上也有同类能力。
cols: 4
type: 技术调研 · dev onboarding
audience: devs：懂 EVM 和 rollup 基础，不熟悉 Arbitrum 内部（Nitro、ArbOS、delayed inbox）
scope: 两套干预机制的原理与源码、冻结交易逐步解析、资金去向、社区观点与利弊、各链先例、Mantle 可行性
evidence: 226 条论断台账（observed 165 / inferred 48 / speculative 13）；链上数据（Ethereum 区块 24925592、25322204；Arbitrum One 区块 454686044）；源码 nitro-contracts @ff6334e、nitro @ccc5c82、mantle-v2 @da45c31；网页访问于 2026-10-07
date: 2026-10-07 · v1
---
结论先行：KelpDAO 那次冻结不是 sequencer 级别的黑名单，也不是 ArbOS 升级引入的功能。Security Council 在一笔 L1 交易里临时升级了 Inbox 合约，用黑客地址作为 sender 写入一条跨链消息，Arbitrum 照常执行了这条消息（[F1](#F1)、[F3](#F3)）。你记忆里那次 ArbOS 升级，引入的是 ArbOS 61 Compliance Filtering。这个功能在 Arbitrum One 上关闭（[F2](#F2)）。社区对这一次是有条件支持，冻结后 10 天资产就被美国法院限制令盯上（[F7](#F7)、[F8](#F8)）。Mantle 的 OptimismPortal 可以由 6/14 多签无延迟升级，所以结构上有同类能力（[F13](#F13)）。

## A 冻结用到了哪些部件 {sheet meta="call path"}
```tree list
Security Council Safe | 9/12 签名，无延迟
  UpgradeExecutor | 持有 ProxyAdmin
    `SpoofL2TxAction` | 本交易现场部署
      ProxyAdmin | 升级 → 调用 → 改回
        Inbox 代理 | 临时换成补丁实现
          Bridge | 入队 delayed message
            ArbOS | 派生 0x65 交易执行
```

## B 补丁只改了一个参数 {sheet span=2 meta="Inbox.sol"}
```annot
# Override 的三个关键参数 | 补丁 0x980D…
sender = undo([from]{!原版是 msg.sender})
nonce = [0]{黑客当前 nonce}，to = [0xDA0]{隔离地址}
amount = [0]{L1 不存 ETH}
> 函数自身没有权限检查，只在一笔 L1 交易里存在
```

## C 五种干预层次 {sheet meta="layers"}
| 层次 | 绕不过 force inclusion | Arbitrum One |
|---|---|---|
| sequencer 拒收 | no 约 1 天后可绕过 | ok 具备 |
| STF 过滤（ArbOS 61） | ok | no 已关闭 |
| 资产合约冻结 | ok | warn 看发行方 |
| 改输入入口（本次） | ok | ok 已用 2 次 |
| 硬分叉改状态 | ok | warn 需全网升级 |

## D 关键数字 {sheet span=2 meta="链上数据"}
| 量 | 值 |
|---|---|
| 冻结金额 | 30,765.667401709008927568 ETH |
| L1 → L2 执行间隔 | 501 秒（8 分 21 秒） |
| Safe 签名 | 9 个（threshold 9 / 12） |
| 释放投票（Snapshot） | 90.96% 赞成，1,693 票 |
| 社区观点样本 | 支持 13 / 有条件 13 / 反对 7 |
| Mantle 升级门槛 | 6/14，无延迟 |

## E 时间线 {sheet span=2 meta="2026"}
```timeline
04-18 | KelpDAO 被盗 | 116,500 rsETH 被解锁
*04-21 | 冻结 | SC 升级 Inbox，转走 30,765.67 ETH
05-01 | 限制令 | DPRK 判决债权人送达 DAO
05-08 | 法院命令 | 允许投票并转给 Aave LLC
06-15 | 释放 | L1 Timelock 复用同一机制
08-20 | ArbOS 61 激活 | 过滤功能在 One 上关闭
```

## F 结论 {sheet span=4}
```callout ok 改的是输入入口，不是黑名单
- 机制：L2 只认“谁写进了 Bridge”，不认“写入的代码是什么”。能无延迟升级 Inbox，就能以任何地址的名义发交易（F1、F3）。
- 观点：社区支持这一次，但要求触发标准和处置政策；法律风险已经兑现（F7、F8、F9）。
- 先例：Arbitrum 是唯一只靠多签、不需要节点配合就完成划转的案例（F10）。
- Mantle：OptimismPortal 由 6/14 无延迟升级，结构相同；先在测试网完整演练，再谈使用（F13、F14）。
```

## G 如何阅读 {depth=1}
```callout info 默认你已知道（本文不解释）
- EVM 交易：签名、`nonce`、`msg.sender`、`gasLimit × maxFeePerGas` 的预扣
- 代理合约：`TransparentUpgradeableProxy` 与 `ProxyAdmin.upgrade` 换实现
- Gnosis Safe 多签：M-of-N 签名后执行 `execTransaction`
- rollup 把交易数据和状态承诺提交到 L1
```
- **5 分钟**：只看导语和总览 A–F。
- **30 分钟**：再读 [前置知识](#panel-I)、[工作原理](#panel-J)、[交易拆解](#panel-K)、[社区观点](#panel-M) 和 [对 Mantle 的意义](#panel-O)。
- **要复核的开发者**：再读 [方法与证据](#panel-Q) 和 [复现](#panel-R)，命令可以直接运行。

## H 背景动机 {depth=2}
**问题**：2026-04-18，KelpDAO 的 rsETH 跨链通道被攻击，116,500 rsETH 被解锁 [19]。三天后，Arbitrum Security Council 把攻击者在 Arbitrum One 上的 30,765.67 ETH 转到 `0x…0DA0` [1]。当时大家的理解是“sequencer 级操作”。这个理解决定了另一条链能不能照着做。

**为什么现在**：
- Mantle 上也发生了被盗事件，攻击者还没有转移资产。我们需要知道 Arbitrum 的做法能不能用在 Mantle 上。
- 这类操作会被问“是不是在审查用户”。我们需要知道社区和其他链怎么看。

**范围**：两套干预机制的原理与源码、冻结交易逐步解析、资金去向、社区观点与利弊、各链先例、Mantle 可行性。

**非目标**：法律意见；投资建议；Mantle 的正式决策或路线承诺；可以直接在主网执行的操作手册；Mantle 具体事件的分析（没有公开的地址和交易）。

**已有资料的不足**：外部调研（ChatGPT Deep Research）已经指出这不是 sequencer 黑名单。但它没有还原内部调用和补丁代码，也漏掉了法院限制令和多个先例 [35]。本文用链上数据和源码补齐这些内容。

## I 前置知识 {depth=2}
```excalidraw q="读懂这次冻结要先懂哪些概念？按什么顺序？" read="箭头表示先学 → 后学；灰色虚线框是默认已知；绿色是本文主题。" takeaway="B-0 和 B-1 讲输入从哪里来；B-2 和 B-3 讲输入怎么变成交易；B-4 和 B-5 讲谁来检查、谁能改。" name=prereq-map kind=前置知识地图
{"grid": {"w": 300, "h": 120}, "defaults": {"w": 200, "h": 62, "fontSize": 17},
 "nodes": [
   {"id": "tx", "label": "EVM 交易（已知）", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "px", "label": "代理与多签（已知）", "col": 0, "row": 3, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 两条输入流", "col": 1, "row": 0, "color": "blue"},
   {"id": "b1", "label": "B-1 delayed 累加器", "col": 1, "row": 1, "color": "blue"},
   {"id": "b2", "label": "B-2 unsigned tx", "col": 2, "row": 0, "color": "blue"},
   {"id": "b3", "label": "B-3 地址 aliasing", "col": 2, "row": 1, "color": "blue"},
   {"id": "b4", "label": "B-4 BoLD 查什么", "col": 1, "row": 2, "color": "blue"},
   {"id": "b5", "label": "B-5 权限链", "col": 1, "row": 3, "color": "blue"},
   {"id": "fz", "label": "KelpDAO 冻结", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "tx", "to": "b0"}, {"from": "b0", "to": "b1"}, {"from": "b0", "to": "b2"},
   {"from": "b2", "to": "b3"}, {"from": "b1", "to": "b4"}, {"from": "px", "to": "b5"},
   {"from": "b3", "to": "fz"}, {"from": "b2", "to": "fz"}, {"from": "b4", "to": "fz"}, {"from": "b5", "to": "fz"}
 ]}
```

```prereq B-0 l1 4min
# 两条输入流与强制收录（force inclusion）
是什么: Arbitrum 的 L2 状态只由两条 L1 输入流决定。一条是 [[sequencer]] 提交到 `SequencerInbox` 的批次。另一条是任何人通过 `Inbox` 写进 `Bridge` 的 [[delayed message]]。
为什么需要: sequencer 可以不收某笔交易。用户可以改走 delayed message，超过约 1 天后调用 `forceInclusion` 强制纳入 [9][14]。所以只靠 sequencer 拒收，冻结不住资产。
例子:
~~~
普通交易:  用户 → sequencer → SequencerInbox 批次
L1 交易:   用户 → Inbox → Bridge → (sequencer 收录 或 1 天后强制收录)
~~~
误解: 误解：sequencer 不收就等于交易发不出去。事实：force inclusion 让 delayed message 最终一定进入序列。
深入: [9] The Sequencer and censorship resistance
```

```prereq B-1 l1 4min
# delayed message 与累加器（delayedInboxAccs）
是什么: `Bridge` 把每条 delayed message 的哈希串成一条哈希链：`acc[n] = keccak(acc[n-1], msgHash)`。`msgHash` 包含 kind、sender、区块号、时间戳和数据哈希。
为什么需要: `Bridge` 只检查调用者是不是登记过的 Inbox 地址，不检查 Inbox 的代码 [6]。所以换掉 Inbox 的实现，写进来的消息照样有效。
例子: 冻结交易写入的是第 2416814 条消息，kind 3，sender `0x5d39…7Ccc` [2]。
误解: 误解：Bridge 会校验消息内容是否“合理”。事实：Bridge 只记账，内容由 Inbox 决定。
深入: [6] `src/bridge/AbsBridge.sol`
依赖: B-0
```

```prereq B-2 l1 5min
# 无签名交易（ArbitrumUnsignedTx，类型 0x65）
是什么: ArbOS 把 kind 3、子类型 0 的 L1 消息派生成一笔 `ArbitrumUnsignedTx`。它的 `From` 直接取消息的 sender，签名字段全为 0 [7][8]。
为什么需要: 冻结交易就是这种交易。授权来自“L1 消息通道”，不来自私钥。
例子: L2 交易 `0x5618…`：type `0x65`，from 黑客地址，v/r/s 全为 0，nonce 0 [3]。
误解: 误解：无签名就跳过所有检查。事实：`skipNonceChecks()` 和 `skipTransactionChecks()` 都返回 false。nonce 要匹配，余额要够付 value 加最大 gas 费 [8]。
深入: [8] `core/types/arb_types.go`
依赖: B-0
```

```prereq B-3 l1 3min
# 地址别名（address aliasing）
是什么: L1 地址进入 L2 时加上固定偏移 `0x1111000000000000000000000000000000001111`。标准 ETH Inbox 对所有 sender 都做这一步 [6]。
为什么需要: 有了别名，任何 L1 调用者在 L2 上都只能以 `alias(自己)` 的身份出现。要以普通地址 X 的身份发交易，就必须改 Inbox 的代码。补丁先 `undoL1ToL2Alias(from)`，Inbox 再加回偏移，两者抵消 [4]。
例子: `undo(0x5d39…) + 0x1111…1111 = 0x5d39…`
误解: 误解：只有合约调用者才做 alias。事实：Arbitrum 的 ETH Inbox 对 EOA 也做 alias；OP Stack 才只对合约做 alias [6][33]。
深入: [6] `src/libraries/AddressAliasHelper.sol`
依赖: B-2
```

```prereq B-4 l1 3min
# BoLD 证明检查什么
是什么: [[BoLD]] 是 Arbitrum 的欺诈证明协议。它检查“给定这些输入，STF 的执行结果对不对”。读 delayed message 时，单步证明只检查消息能不能接上 `delayedInboxAccs` [6]。
为什么需要: 冻结消息在累加器里，执行也符合规则。所以证明系统不会拦它。证明保证的是“规则执行正确”，不是“输入获得了资产主人的同意”。
误解: 误解：有欺诈证明或 ZK 证明，治理就动不了资产。事实：证明不覆盖“谁有权改输入入口”。
深入: [6] `src/osp/OneStepProverHostIo.sol`
依赖: B-1
```

```prereq B-5 l1 4min
# 权限链：Security Council → UpgradeExecutor → ProxyAdmin
是什么: [[Security Council]] 是 12 人多签，紧急行动需要 9 个签名，没有延迟 [13]。它是 `UpgradeExecutor` 的执行者，`UpgradeExecutor` 持有 `ProxyAdmin`，`ProxyAdmin` 能换 Inbox 的实现 [14]。
为什么需要: 这条链决定了谁能改输入入口。常规治理也能走同一条链，但要经过 L2 投票和约 17 天的时间锁 [14]。
例子: `0xF06E…3F85`（Safe）→ `0x3ffF…CeDd`（UpgradeExecutor）→ `0x5547…2dbD`（ProxyAdmin）→ `0x4Dbd…AB3f`（Inbox）
误解: 误解：紧急行动可以用于任何事件。事实：宪法把它限定为影响 Arbitrum 治理链的 “true security emergency”，事后要发透明度报告 [13]。
深入: [13] Constitution Section 3
依赖: B-4
```

## J 工作原理：改输入入口 {depth=2}
“冻结资产”可以发生在五个层次。Fig 2 按“离入口近 → 离状态近”排列它们。越靠下，干预越强，需要的权力也越大。

```excalidraw q="冻结资产可以发生在哪些层次？每层能不能被绕过？" read="从上到下越来越接近状态；红框是 KelpDAO 用的层次；蓝框是 ArbOS 61 提供的层次；右侧写能否绕过。" takeaway="sequencer 拒收挡不住强制收录；从 STF 过滤开始才真正有效；KelpDAO 用的是第 4 层，它不拒绝交易，而是替用户发交易。" kind=分层
{"grid": {"w": 400, "h": 86}, "defaults": {"w": 330, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "l1", "label": "① sequencer 拒收", "col": 0, "row": 0},
   {"id": "l2", "label": "② STF 过滤（ArbOS 61）", "col": 0, "row": 1, "color": "blue"},
   {"id": "l3", "label": "③ 资产合约冻结", "col": 0, "row": 2},
   {"id": "l4", "label": "④ 改输入入口（KelpDAO）", "col": 0, "row": 3, "color": "red", "strokeWidth": 3},
   {"id": "l5", "label": "⑤ 硬分叉改状态", "col": 0, "row": 4},
   {"id": "n1", "label": "约 1 天后可绕过", "col": 1, "row": 0, "w": 250, "color": "gray", "stroke": "dashed"},
   {"id": "n2", "label": "交易失败或改道", "col": 1, "row": 1, "w": 250, "color": "gray", "stroke": "dashed"},
   {"id": "n3", "label": "只管一种资产", "col": 1, "row": 2, "w": 250, "color": "gray", "stroke": "dashed"},
   {"id": "n4", "label": "以用户名义发交易", "col": 1, "row": 3, "w": 250, "color": "gray", "stroke": "dashed"},
   {"id": "n5", "label": "需全网升级", "col": 1, "row": 4, "w": 250, "color": "gray", "stroke": "dashed"}
 ],
 "edges": [
   {"from": "l1", "to": "n1", "dashed": true}, {"from": "l2", "to": "n2", "dashed": true},
   {"from": "l3", "to": "n3", "dashed": true}, {"from": "l4", "to": "n4", "dashed": true},
   {"from": "l5", "to": "n5", "dashed": true}
 ]}
```

Fig 3 画出 Arbitrum 的输入路径。关键在红框：Inbox 是一个可升级的代理。`Bridge` 只认它的地址，`ArbOS` 只认 `Bridge` 里的记录，[[BoLD]] 只核对累加器 [6][7]。

```excalidraw q="一笔交易怎么进入 Arbitrum？哪个环节被换掉了？" read="蓝色是协议部件；紫色存状态；红框是被临时升级的 Inbox；虚线是强制收录和证明检查。" takeaway="三个检查点都只认地址或哈希，不认 Inbox 的代码；所以换掉 Inbox 实现，就能写入任意 sender 的合法输入。" kind=架构
{"grid": {"w": 320, "h": 130}, "defaults": {"w": 180, "h": 62, "fontSize": 17},
 "nodes": [
   {"id": "u", "label": "用户", "col": 0, "row": 1, "color": "gray", "stroke": "dashed", "w": 120},
   {"id": "seq", "label": "Sequencer", "col": 1, "row": 0, "color": "blue"},
   {"id": "si", "label": "SequencerInbox", "col": 2, "row": 0, "color": "blue"},
   {"id": "ib", "label": "Inbox 代理", "col": 1, "row": 2, "color": "red", "strokeWidth": 3},
   {"id": "br", "label": "Bridge 累加器", "col": 2, "row": 2, "color": "violet"},
   {"id": "ao", "label": "ArbOS（STF）", "col": 3, "row": 1, "color": "blue"},
   {"id": "st", "label": "L2 状态", "col": 3, "row": 2, "color": "violet"},
   {"id": "bd", "label": "BoLD 证明", "col": 2, "row": 3, "color": "gray", "stroke": "dashed"}
 ],
 "edges": [
   {"from": "u", "to": "seq", "label": "签名交易"},
   {"from": "seq", "to": "si", "label": "批次"},
   {"from": "u", "to": "ib", "label": "L1 交易"},
   {"from": "ib", "to": "br", "label": "入队"},
   {"from": "br", "to": "si", "label": "强制收录", "dashed": true},
   {"from": "si", "to": "ao", "label": "有序输入"},
   {"from": "ao", "to": "st", "label": "执行"},
   {"from": "bd", "to": "br", "label": "只核对哈希", "dashed": true}
 ]}
```

标准 Inbox 的 `sendUnsignedTransaction` 把 `msg.sender` 写成 sender [6]。别名又让 L1 调用者只能以 `alias(自己)` 出现（B-3）。所以在标准代码下，任何人都无法以黑客地址发出 L1 消息。Security Council 能做到，只因为它能换掉 Inbox 的代码。

三个检查点各自只看一样东西 [6][7]：
- `AbsBridge` 只检查调用者是否在 `allowedDelayedInboxes` 里，也就是只看 Inbox 的地址。
- `parse_l2.go` 直接把消息 header 的 Poster 当作 L2 交易的 `From`。
- BoLD 的单步证明读 delayed message 时，只校验它能不能接上 `delayedInboxAccs`。

官方说明也写得很直白：“upgrade the inbox contract … impersonate the transaction sender” [1]。

```finding F1 high
# 冻结改的是“输入入口”，证明系统不会拦
结论: 临时升级的 Inbox 以黑客地址写入一条 delayed message，ArbOS 照常执行。检查点只认地址和哈希。
证据: [observed] 官方说明 [1]；`AbsBridge`、OSP、`parse_l2.go` 源码 [6][7]。[inferred] 证明系统把它当作合法输入。
影响: 评估一条链能不能“冻结”，要看谁能改入口代码，不看 sequencer。
```

```finding F2 high
# 你记得的“ArbOS 升级”是 ArbOS 61 的交易过滤，不是这次用的机制
结论: 冻结在 4-21，ArbOS 61 在 8-20 才激活，过滤功能在 One / Nova 上关闭。
证据: [observed] ArbOS 61 文档 [11]；冻结时 Elara 提案还在讨论 [12]。[speculative] 记忆错位可能来自两件事时间相近。
影响: 讨论“冻结用户”时，先说清是哪一套机制。
```

## K 冻结交易逐步拆解 {depth=2}
Fig 4 是真实数据的时序图。L1 部分在 Ethereum 区块 24925592 的同一笔交易里完成。L2 部分在 501 秒后执行 [2][3]。

```uml q="冻结交易从 Safe 签名到 L2 转账，谁在何时做什么？" read="真实数据，来自 Blockscout trace、logs 和 Arbitrum RPC。第 1–8 步是一笔 L1 交易；高亮部分是冒充 sender 的入队；第 9–11 步在 L2。Override 即 sendUnsignedTransactionOverride。" takeaway="补丁实现只在一笔交易内存在：升级、入队、改回一次完成；L2 只是照常执行了一条 delayed message。"
sequenceDiagram
  autonumber
  participant SC as Council Safe
  participant A as UpgradeExecutor + action
  participant PA as ProxyAdmin
  participant IB as Inbox 代理
  participant BR as Bridge
  participant N as Arbitrum 节点
  SC->>SC: 验 9 个签名，部署补丁和 action
  SC->>A: execute → delegatecall action
  A->>PA: 读当前实现 0x7C05
  A->>PA: upgrade 到 0x980D
  rect rgb(251, 234, 234)
    A->>IB: Override(from = 0x5d39)
    IB->>BR: enqueue(kind 3, 0x5d39)
    BR-->>BR: 消息 2416814
  end
  A->>PA: upgrade 回 0x7C05
  Note over SC,BR: 03:26:47 UTC，L1 区块 24925592，同一笔交易
  N->>BR: 读取消息 2416814
  N->>N: 派生 0x65 交易，from = 0x5d39
  N->>N: 30,765.67 ETH 转到 0xDA0
  Note over N: 03:35:08 UTC，L2 区块 454686044
```

**L1 调用树**（Blockscout internal transactions 与 logs）[2]：

```tree list
EOA 0x1059… → Safe.execTransaction | 9 个签名
  delegatecall MultiSendCallOnly
    Multicall3.aggregate3
      CREATE2 → 补丁 Inbox 0x980D… | maxDataSize 117964
      CREATE2 → SpoofL2TxAction 0x3d45… | 记住补丁地址
    UpgradeExecutor.execute(action, data)
      *delegatecall SpoofL2TxAction.execute
        ProxyAdmin.getProxyImplementation | 返回 0x7C05…
        ProxyAdmin.upgrade(Inbox, 0x980D…) | log Upgraded
        *Inbox.sendUnsignedTransactionOverride
          Bridge.enqueueDelayedMessage | log MessageDelivered
        ProxyAdmin.upgrade(Inbox, 0x7C05…) | log Upgraded
```

**补丁和原实现的差异**：对两份已验证源码做 diff，只有两处变化 [4]：
1. `sendUnsignedTransactionToFork` 的函数体改成 `revert("NOT_IMPLEMENTED")`。
2. 新增 `sendUnsignedTransactionOverride`。它基于原来的 `ToFork` 函数，去掉分叉检查和 EOA 检查，并用参数 `from` 代替 `msg.sender`。

```solidity
// 补丁实现 0x980D…A859 · src/bridge/Inbox.sol（Blockscout 已验证源码）
/// @notice EMERGENCY one-shot: forges an L2 unsigned EOA tx from arbitrary `from`.
///         Intended for atomic upgrade-call-restore via SpoofL2TxAction; otherwise
///         any gap leaves the bridge fully drainable by anyone.
function sendUnsignedTransactionOverride(
    uint256 gasLimit, uint256 maxFeePerGas, uint256 nonce,
    address to, uint256 value, bytes calldata data, address from
) external whenNotPaused onlyAllowed returns (uint256) {
    if (gasLimit > type(uint64).max) revert GasLimitTooLarge();
    return _deliverMessage(
        L2_MSG,
        AddressAliasHelper.undoL1ToL2Alias(from),     // 原版：msg.sender
        abi.encodePacked(L2MessageType_unsignedEOATx, gasLimit,
            maxFeePerGas, nonce, uint256(uint160(to)), value, data),
        0                                              // L1 不存入 ETH
    );
}
```

```solidity
// SpoofL2TxAction 0x3d456…a322 · src/SpoofL2TxAction.sol（节选）
address currentImpl = ProxyAdmin(proxyAdmin).getProxyImplementation(inbox);
ProxyAdmin(proxyAdmin).upgrade(inbox, patchedInboxImpl);
Inbox(inbox).sendUnsignedTransactionOverride({gasLimit: gasLimit,
    maxFeePerGas: maxFeePerGas, nonce: nonce, to: to,
    value: value, data: data, from: from});
ProxyAdmin(proxyAdmin).upgrade(inbox, currentImpl);
```

**三个可以直接核对的事实** [2][4]：
- Safe 的 `signatures` 长 585 字节，正好是 9 个 65 字节签名。
- 补丁函数只有 `onlyAllowed`（allowlist 关闭时不起作用）和 `whenNotPaused` 两个修饰器。源码注释写明：“otherwise any gap leaves the bridge fully drainable by anyone”。
- 交易结束后 Inbox 指回原实现 `0x7C05…`，至今未变。

**入队的消息**：`InboxMessageDelivered` 的数据共 161 字节：`0x00`（unsignedEOATx）‖ gasLimit 100,000 ‖ maxFeePerGas 1 gwei ‖ nonce 0 ‖ to `0xDA0` ‖ value。本地复算 `keccak256(data)` = `0x62f5e672…8d1c`，与链上 `messageDataHash` 一致 [2]。

**L2 交易 `0x5618…0f6b`** [3]：

| 字段 | 值 |
|---|---|
| 区块 / 时间 | 454686044 / 03:35:08 UTC |
| type / v·r·s | `0x65` / 全为 0 |
| from → to | `0x5d39…7Ccc` → `0x…0DA0` |
| value | 30,765.667401709008927568 ETH |
| nonce / gas | 0 / 100,000（实用 21,000） |
| calldata / logs | `0x` / 无 |

**金额核对**：公告金额是 30,765.667**5**01709…，交易 value 少了 0.0001 ETH。这正好是 100,000 gas × 1 gwei，也就是 `buyGas` 要求预留的最大 gas 费 [1][8]。实际手续费是 21,000 × 0.020064 gwei = 0.000000421344 ETH。黑客地址现在的余额恰好是 0.0001 − 0.000000421344 ETH，nonce 是 1 [3]。

```finding F3 high
# 一笔 L1 交易完成“部署 → 升级 → 冒充入队 → 改回”，安全性只靠原子执行
结论: 补丁函数没有权限检查，安全性只来自“同一笔交易里换上、用完、换回”。
证据: [observed] trace 与日志顺序 [2]；源码注释 [4]。
影响: 带“指定 sender”能力的代码不能单独留在入口实现里。
```

```finding F4 high
# “无签名”不等于“跳过检查”：nonce 要对，gas 要留，资金只转不铸
结论: value 留出了 gas 预算，nonce 等于黑客当前 nonce 0，入队时 `amount = 0`。
证据: [observed] `arb_types.go`、`buyGas` [8]；交易字段 [3]；`_deliverMessage(..., 0)` [4]。[inferred] 黑客若在 501 秒内先发交易，nonce 对不上，冻结会失败。
影响: 这个方法只适合资金仍以原生币留在攻击者 EOA 里的情况。
```

这三项约束都来自源码 [4][8]：`ArbitrumUnsignedTx` 的 `skipNonceChecks()` 和 `skipTransactionChecks()` 都返回 false；`buyGas` 要求余额 ≥ gasLimit × feeCap + value；补丁调用 `_deliverMessage` 时 `amount` 为 0，L1 没有向 Bridge 存入 ETH，所以 L2 上没有新铸的 ETH。

**6 月的释放**：用的是同一套机制，只是换了授权路径 [18]。

| | 4 月冻结 | 6 月释放 |
|---|---|---|
| 授权方 | Security Council Safe（紧急，无延迟） | L1 Timelock（宪法 AIP 投票后执行） |
| L1 交易 | `0x0799…`，区块 24925592 | `0xc2e2…`，区块 25322204 |
| 合约 | 现场部署补丁和 action | 复用同一个补丁和 action |
| L2 sender → 收款 | 黑客 → `0x…0DA0` | `0x…0DA0` → Aave LLC 的 Safe |
| 金额 | 30,765.6674… ETH | 30,765.6174… ETH（预留 0.05 ETH gas） |

```finding F5 high
# 冻结后两个地址都没再动；释放走常规治理，Inbox 只被这样升级过两次
结论: 两个地址的余额尾数都等于“gas 预留减手续费”。Inbox 只被这样升级过两次。
证据: [observed] 当前余额与 nonce [3]；6 月 trace 与 Inbox 的 `Upgraded` 事件 [18]。
影响: 冻结用紧急权力，处置用全体治理，两者分开决定。
```

`0x…0DA0` 现在的余额是 0.05 ETH 减去 6 月那笔交易的手续费，精确到 wei。这个低位地址没有可用的私钥，所以资金只能再用同一机制转出。用 Blockscout 查询 Inbox 代理自区块 24,000,000 以来的全部 `Upgraded` 事件，只有 4 条，分属这两笔交易 [18]。

## L ArbOS 61 Compliance Filtering：另一套机制 {depth=2}
先看时间线 [11][12]：Elara 提案 2026-03-05 发帖。6 月因为一个退款 bug，版本号从 ArbOS 60 改为 61。7 月 16 日至 30 日链上投票。8 月 20 日 17:00 UTC 在 One 和 Nova 激活。文档原话是：过滤功能 “left intentionally disabled on Arbitrum One and Nova”，只给有合规义务的 Arbitrum 链使用 [11]。它和 4 月的冻结没有关系。

ArbOS 61 带来的是一套**可选的**交易过滤。它有两层：sequencer 层直接拒收；STF 层处理绕过 sequencer 的 delayed message [10]。Fig 5 画出两层。

```excalidraw q="ArbOS 61 的交易过滤分哪两层？被过滤的交易最后怎样？" read="上排是 sequencer 层，下排是 delayed message 的路径；紫色是链上状态；红色是结果。" takeaway="sequencer 层挡普通交易；STF 层用链上登记的交易 hash 挡强制收录的交易，交易仍然上链，但执行失败或资金改道。" kind=架构
{"grid": {"w": 330, "h": 130}, "defaults": {"w": 190, "h": 62, "fontSize": 16},
 "nodes": [
   {"id": "t", "label": "普通交易", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "sf", "label": "sequencer 模拟过滤", "col": 1, "row": 0, "color": "blue"},
   {"id": "rj", "label": "拒收", "col": 2, "row": 0, "color": "red"},
   {"id": "d", "label": "delayed message", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "tf", "label": "transaction-filterer", "col": 1, "row": 1, "color": "blue"},
   {"id": "pc", "label": "0x74 登记 tx hash", "col": 2, "row": 1, "color": "violet"},
   {"id": "fx", "label": "STF：失败或改道", "col": 3, "row": 1, "color": "red"}
 ],
 "edges": [
   {"from": "t", "to": "sf", "label": "地址/事件"},
   {"from": "sf", "to": "rj", "label": "命中"},
   {"from": "d", "to": "tf", "label": "检查"},
   {"from": "tf", "to": "pc", "label": "登记"},
   {"from": "pc", "to": "fx", "label": "执行时"}
 ]}
```

STF 层的关键代码在 `tx_processor.go`。被登记的普通交易 nonce 加 1，剩余 gas 全部扣掉，然后跳过执行 [7]：

```go
// nitro/arbos/tx_processor.go#L1089-L1105 @ccc5c82
if p.state.FilteredTransactions().IsFilteredFree(txHash) {
    p.evm.StateDB.SetNonce(p.msg.From, p.evm.StateDB.GetNonce(p.msg.From)+1, ...)
    // Consume all remaining gas as punishment
    usedGas := *gasRemaining
    *gasRemaining = 0
    ...
    return usedMultiGas, filteredErr
}
```

| | KelpDAO 冻结 | ArbOS 61 过滤 |
|---|---|---|
| 做什么 | 以用户名义发一笔转账 | 让用户的交易失败或改道 |
| 权限 | 能升级 L1 Inbox 的人 | chain owner 授权的 filterer |
| 覆盖强制收录 | 它本身就是一条 delayed message | 靠 STF 层 hash 登记 |
| 启用延迟 | 紧急路径无延迟 | 开启后 7 天才生效 |
| Arbitrum One | 已用 2 次 | 关闭 |

```finding F6 medium
# 被过滤的 deposit 不是“丢掉”，而是把资金转给指定地址；文档和代码不一致
结论: 被过滤的 deposit 和 retryable，资金改道到 `FilteredFundsRecipient`；文档却说入账会被丢弃。
证据: [observed] `tx_processor.go#L245-L306`、`ArbOwner.go` [7]；文档 [10]。
影响: 启用过滤的链也能改道入账资金。要读代码，不能只读文档。
```

## M 社区与 KOL 观点：是不是在审查用户？ {depth=2}
**先回答“是不是审查”**：从技术分类看，KelpDAO 操作不是“拒绝收录”那种审查。它更强：在私钥持有人没有同意的情况下，改变了资产的控制权。ArbOS 61 的过滤才是交易审查能力，但它在 One 上关闭 [10][11]。所以，说“Arbitrum 审查用户”不准确；准确的说法是“Arbitrum 的治理可以替任何地址发交易”。

我们收集了 33 条有原文的观点：支持 13 条，有条件支持或担忧 13 条，反对或批评 7 条 [1][15]。论坛里没有人用“审查”定性这件事，最常见的立场是“结果对，但需要规则来约束”。

**支持方的论点**（每条都有人提出）：

| 论点 | 提出者 |
|---|---|
| 窗口很窄，不动就是放任 | Goldfeder（Offchain Labs）[20]；Griff Green（Council 成员）|
| 权力早已公开，Stage 1 本来就有 | Zeptimus（代表）[1]；mert（Helius）|
| 事先问 DAO 就等于通知黑客 | Goldfeder [20] |
| 盗窃不转移所有权 | Zeptimus、Aave [15] |
| 不行动也是一种决定 | L2BEAT [21] |

**担忧和反对的论点**：

| 论点 | 提出者 |
|---|---|
| ETH 在用户不同意时被移动，中立性受损 | maxlomu（代表）[1] |
| 能力不限于救援，是升级权里的通用权力 | Robby Greenfield [1] |
| 没有触发标准，不能靠运气 | MconnectDAO [1][15] |
| 为什么是这次，而不是别的 | L2BEAT [21] |
| L2 只是多签，去中心化是表演 | X 上的批评者（多为小号）|
| 冻结把 DAO 拉进诉讼 | 律师 Shapiro；PaperImperium（MegaETH）|

几个数字要放在一起看 [1][15][16][20]：
- Snapshot 温度检查：For 182,176,773 ARB，Against 1,738，Abstain 18,102,392，共 1,693 票。
- 论坛 30803 的 6 条社区回复都肯定结果，其中 3 条附带框架或先例方面的担忧。
- 利益相关方（Offchain Labs、Foundation、Council 成员、Kelp、Aave）全部支持。
- CoinDesk 当作“批评者”引用的 X 账号只有约 81 个粉丝。

```finding F7 high
# 社区支持“这一次”，不等于认可冻结能力
结论: 90.96% 赞成的是“释放资金”，不是事前授权冻结，也不是对常设能力的公投。
证据: [observed] Snapshot 票数 [16]；论坛逐楼原文 [1][15]。[inferred] 投票者是 DAO 参与者，有选择偏差。
影响: 公众对范围窄的一次救援有条件支持；没有证据表明公众接受常设能力。
```

法律线索的经过 [15][17]：
- 2026-05-01，一批对朝鲜持有恐怖主义判决的债权人，向“Arbitrum DAO”送达限制令。他们称 `0x…0DA0` 里的余额是 DPRK 拥有权益的财产。
- 2026-05-08，SDNY 修改限制令：允许链上投票，允许把资产转给 Aave LLC，投票者不算违反限制令。转账后限制继续有效，其余事项保留不决。
- 释放提案里，Aave Labs 对 Foundation、Offchain Labs 和 Council 成员提供无上限赔偿。多名代表要求把自己也加入被赔偿方。

```finding F8 high
# 最大的后果来自法律：冻结后 10 天，资产就被法院限制令盯上
结论: 05-01 限制令送达 DAO；05-08 法院允许投票并转给 Aave LLC，限制随资金继续有效。
证据: [observed] 限制令全文 [15]；SDNY Doc 52 [17]；赔偿条款与代表要求 [15]。
影响: 能控制资产，就会被要求承担控制责任。
```

```finding F9 medium
# 宪法的紧急条款被宽泛解释，事后透明度报告没有找到
结论: 宪法限定紧急行动用于 Arbitrum 自身的安全紧急情况；KelpDAO 漏洞在协议之外。
证据: [observed] 宪法 Section 3 [13]；代表 dzack23 的指出 [15]。[speculative] 没找到要求的透明度报告。
影响: 紧急权力的边界由执行者解释，用户无法事先知道触发条件。
```

## N 其他 L1 / L2：类似的先例 {depth=2}
这类干预在其他链上也发生过，但机制差别很大。Fig 6 把各个案例放到 Fig 2 的层次上。

```excalidraw q="其他链的冻结或划转，分别发生在哪个层次？" read="左列是干预层次，右侧是案例；红框是 Arbitrum；灰色虚线是常设的发行方能力。" takeaway="其他链几乎都需要验证者或节点配合（停链、改配置、硬分叉）；Arbitrum 只靠一个 9/12 多签就完成了划转。" kind=分类
{"grid": {"w": 270, "h": 90}, "defaults": {"w": 220, "h": 60, "fontSize": 16},
 "nodes": [
   {"id": "a", "label": "sequencer 停摆", "col": 0, "row": 0, "color": "blue"},
   {"id": "b", "label": "节点拒收 / 黑名单", "col": 0, "row": 1, "color": "blue"},
   {"id": "c", "label": "协议规则或硬分叉", "col": 0, "row": 2, "color": "blue"},
   {"id": "d", "label": "改输入入口", "col": 0, "row": 3, "color": "blue"},
   {"id": "f", "label": "发行方冻结", "col": 0, "row": 4, "color": "gray", "stroke": "dashed"},
   {"id": "a1", "label": "Linea 2024", "col": 1, "row": 0},
   {"id": "b1", "label": "Sui 2025", "col": 1, "row": 1},
   {"id": "b2", "label": "BSC 2022", "col": 2, "row": 1},
   {"id": "c1", "label": "The DAO 2016", "col": 1, "row": 2},
   {"id": "c2", "label": "Gnosis / Bera / Flow", "col": 2, "row": 2},
   {"id": "d1", "label": "Arbitrum 2026", "col": 1, "row": 3, "color": "red", "strokeWidth": 3},
   {"id": "f1", "label": "USDC / USDT / XRPL", "col": 1, "row": 4, "color": "gray", "stroke": "dashed"}
 ],
 "edges": [
   {"from": "a", "to": "a1"}, {"from": "b", "to": "b1"}, {"from": "b1", "to": "b2", "arrow": "none", "dotted": true},
   {"from": "c", "to": "c1"}, {"from": "c1", "to": "c2", "arrow": "none", "dotted": true},
   {"from": "d", "to": "d1"}, {"from": "f", "to": "f1"}
 ]}
```

| 案例 | 怎么做 | 谁决定 | 结果与反应 |
|---|---|---|---|
| The DAO 2016 | 硬分叉改状态 | 客户端 + 约 85% 矿工 | 约 1200 万 ETH 划入恢复合约；链分裂出 ETC [28] |
| EIP-999 2018 | 提议硬分叉恢复 Parity | 社区 | 被撤回；coin vote 55% 反对（二手）[28] |
| BSC 2022 | 停链 + 客户端黑名单 | 验证者 | 攻击地址被禁止交易 [27] |
| Linea 2024 | 停 sequencer 并审查 | Linea 团队 | 被批评中心化（二手）[30] |
| Sui 2025 | 节点 deny list → 按交易摘要授权别名 | 质押投票 90.9% | 资金转入 4/6 多签信托 [23] |
| Gnosis 2025 | soft fork → hard fork 替换 EOA 代码 | 过半验证者 | 约 530 万美元进 DAO Safe 后由用户领取 [24] |
| Flow 2025 | 停链 + 临时特权回收伪造币 | Foundation + Council | 放弃整链回滚，改为隔离恢复 [25] |
| USDC / XRPL | 发行方黑名单或冻结 | 发行方 | 只管一种资产，事前写明 [29] |

Sui 和 Arbitrum 的机制最像。Sui 的协议升级允许 “a signature from address A to act as the sender address B”，并只限定在指定的 TransactionDigests [23]。区别在于：Sui 事前做了质押投票，并要求验证者升级；Arbitrum 事后才走治理，而且不需要任何节点配合。

```finding F10 high
# 在这些先例里，Arbitrum 是唯一只靠多签、不需要节点配合就完成划转的
结论: 其他案例都要验证者或节点升级、改配置；Arbitrum 只升级了一个 L1 合约。最接近的是 Sui。
证据: [observed] Sui PR #22237 [23]；Gnosis、Berachain、BSC 的客户端发布 [24][26][27]。[inferred] 由对比表推出。
影响: 执行成本越低，对“谁能做、何时做”的规则要求越高。
```

```finding F11 medium
# 被接受的干预有三个共同点：范围窄、多数背书、托管透明
结论: Sui、Gnosis、The DAO 满足这三点并执行；EIP-999 被撤回，Flow 放弃回滚。
证据: [observed] Sui、Gnosis、Flow 的官方记录 [23][24][25]。[speculative] EIP-999 投票只有二手来源。
影响: 想保留这种能力，就要事前公布触发标准、执行范围和托管方式。
```

L2BEAT 的规范写明：Stage 1 要求 Security Council 至少 8 人、门槛 75%。L2BEAT 曾考虑让 Stage 1 的 Security Council “只修 bug”，但 “we decided to exclude this property in this first version” [22]。Arbitrum One 是 Stage 1，它的 Stage 2 未满足项之一正是 “The Security Council's actions are not confined to onchain provable bugs” [14]。

```finding F12 high
# L2BEAT 的 Stage 1 允许 Security Council 这样做，Stage 2 不允许
结论: Stage 1 不限制 Security Council 的紧急用途；Stage 2 只允许它处理链上可证明的 bug。
证据: [observed] Stages 规范 [22]；Arbitrum One 的 Stage 2 未满足项 [14]。[inferred] 本次操作与 Stage 1 相容，与 Stage 2 不相容。
影响: “Stage 1 本来就允许”成立，但紧急路径的退出窗口是 0。
```

## O 对 Mantle 的意义 {depth=2}
OP Stack 的 deposit 交易（类型 `0x7E`）同样没有签名。它的 `from` 只由“L1 deposit 合约发出的 `TransactionDeposited` 日志”认证 [33]。op-node 只收 OptimismPortal 代理地址发出的这类日志 [32]。Fig 7 把两条链并排对照。

```excalidraw q="Mantle 有没有和 Arbitrum 一样的可升级入口？" read="左列 Arbitrum，右列 Mantle；红框是可以被无延迟换掉代码的入口合约；箭头从权限方指向执行。" takeaway="两条链的结构相同：一个多签控制入口合约的代码，派生只认入口地址；Mantle 的门槛是 6/14，比 Arbitrum 的 9/12 低。" kind=对比
{"grid": {"w": 340, "h": 115}, "defaults": {"w": 250, "h": 60, "fontSize": 16},
 "nodes": [
   {"id": "a0", "label": "Security Council 9/12", "col": 0, "row": 0, "color": "yellow"},
   {"id": "a1", "label": "UpgradeExecutor → ProxyAdmin", "col": 0, "row": 1},
   {"id": "a2", "label": "Inbox 代理", "col": 0, "row": 2, "color": "red", "strokeWidth": 3},
   {"id": "a3", "label": "Bridge 累加器", "col": 0, "row": 3, "color": "violet"},
   {"id": "a4", "label": "ArbOS → 0x65 交易", "col": 0, "row": 4, "color": "blue"},
   {"id": "m0", "label": "MantleSecurityMultisig 6/14", "col": 1, "row": 0, "color": "yellow"},
   {"id": "m1", "label": "ProxyAdmin", "col": 1, "row": 1},
   {"id": "m2", "label": "OptimismPortal 代理", "col": 1, "row": 2, "color": "red", "strokeWidth": 3},
   {"id": "m3", "label": "TransactionDeposited 日志", "col": 1, "row": 3, "color": "violet"},
   {"id": "m4", "label": "op-node → 0x7E 交易", "col": 1, "row": 4, "color": "blue"}
 ],
 "edges": [
   {"from": "a0", "to": "a1"}, {"from": "a1", "to": "a2", "label": "换实现"}, {"from": "a2", "to": "a3"}, {"from": "a3", "to": "a4", "label": "只认地址"},
   {"from": "m0", "to": "m1"}, {"from": "m1", "to": "m2", "label": "换实现"}, {"from": "m2", "to": "m3"}, {"from": "m3", "to": "m4", "label": "只认地址"}
 ]}
```

| 维度 | Arbitrum（KelpDAO） | Mantle / OP Stack |
|---|---|---|
| 谁能换入口代码 | SC 9/12，无延迟 | Security MS 6/14，无延迟 |
| nonce | 要匹配当前 nonce | 没有 nonce，用 `sourceHash` |
| gas | 从 `from` 余额扣，要预留 | 在 L1 购买，不扣 `from` |
| 原生资产 | ETH | MNT；ETH 是 BVM_ETH |
| 铸币字段 | `amount` | `Mint`（MNT）+ `EthValue` |
| 强制收录 | 最长约 1 天 | 最长 12 小时 |
| STF 层过滤 | 有，但关闭 | 没有找到 |

链上读数（2026-10-07）[31][34]：Portal 代理 `0xc54c…A8Fb` 的 admin 是 ProxyAdmin `0xca35…7794`。ProxyAdmin 的 owner 是 MantleSecurityMultisig `0x4e59…D40f`，threshold 6，owners 14。L2BEAT 的风险摘要第一条就是：“Funds can be stolen if a contract receives a malicious code upgrade. There is no delay on code upgrades (CRITICAL)”。派生侧，`deposits.go#L22` 只收 Portal 地址的日志，`deposit_log.go#L51` 直接从日志读 `from` [32]。

```finding F13 high
# Mantle 在结构上有同类能力，而且批准门槛更低
结论: OptimismPortal 由 6/14 多签无延迟升级；op-node 只认 Portal 地址的日志。结构与 Arbitrum 相同。
证据: [observed] 链上读数与 L2BEAT [31][34]；`deposits.go`、`deposit_log.go` [32]。[inferred] 换掉 Portal 实现，就能产生任意 `from` 的合法 deposit。
影响: 问题不是“能不能做”，而是“要不要做、按什么规则做”。
```

```finding F14 medium
# 在 Mantle 上，工程约束更少，但资产守恒和证明要先验证
结论: 没有 nonce 竞争和 gas 预留，但有 `Mint` 和 `EthValue` 两个铸币字段，填错就会凭空增发。
证据: [observed] OP 规范 [33]；Mantle `opaqueData` 字段 [32]。[speculative] OP Succinct 证明是否接受这类输入，需要测试网实测。
影响: 使用前要在测试网走完“入队 → 派生 → 证明 → 守恒检查”。
```

**对我们的行动建议**：
1. **把“这一次”和“常设能力”分开决策**。先例只支持范围窄、证据清楚的一次性救援（F7、F11）。
2. **先在测试网完整演练**：覆盖 OP Succinct 证明、MNT 和 BVM_ETH 的守恒、合约地址作为 `from` 的情况（F14）。
3. **事前写明紧急规则**：触发标准、执行范围、托管地址、释放流程、事后透明度报告。Arbitrum 社区是事后才补提这些要求的（F7、F9）。
4. **准备法律与赔偿安排**。冻结后，资产可能被法院限制令锁定。签名人和治理参与者都有法律风险（F8）。

```callout err WARNING
不要把带“指定 sender”能力的入口实现单独部署上去，哪怕只停留一个区块。在那个区块里，任何人都能以任何地址的名义转走 L2 上的资产。升级、调用、改回必须在同一笔 L1 交易里完成（F3）。
```

```callout warn CAUTION
资金一旦离开攻击者 EOA（进入 DEX、借贷、LP 或第三方跨链桥），冒充 sender 的转账就追不回这些头寸。Arbitrum 这次能冻结，是因为攻击者地址从未发过交易，资金仍以原生 ETH 留在里面（F4）。
```

## P 局限与开放问题 {depth=2}
- **Mantle 部分是机制推断**：O 分册只读了 Portal 和 op-node 的源码，没有读 OP Succinct 程序，也没有在测试网实测。F14 的证明部分标为 speculative。
- **历史状态**：公共 RPC 不提供归档状态。Safe 门槛 9/12 取自当前状态。它与宪法和 L2BEAT 一致，但我们没有读冻结区块当时的状态。
- **观点样本有偏差**：论坛和投票者都是 DAO 参与者，X 帖子由搜索和媒体转引挑选。没找到 Vitalik、Polynya、Hasu、ZachXBT 等人对冻结本身的原帖。
- **二手来源**：Linea、EIP-999 投票、Hyperliquid、Berachain 资金归还只有二手来源，页面上已标明。
- **没回答的问题**：
  - 攻击者的 ETH 怎么来到 Arbitrum（二手报道说是用 rsETH 在 Aave 借出 WETH）。
  - 9 个签名对应哪 9 名成员。
  - 链上 AIP 的票数。
  - SDNY 的后续实体裁决。
  - Mantle 有没有成文的紧急行动规则。

## Q 方法与证据 {depth=3}
- **链上解码**（主会话）：用 `cast` 解码 L1 交易的 `execTransaction` → `multiSend` → `UpgradeExecutor.execute` → `SpoofL2TxAction.execute` 四层 calldata。用 Blockscout API 读 trace、logs 和已验证源码，并对补丁实现与原实现做 diff。用 Arbitrum RPC 读 L2 交易和收据。
- **复算**：`keccak256(InboxMessageDelivered.data)` 与 `messageDataHash` 一致；gas 预留、实际手续费与两个地址的当前余额精确吻合。
- **源码**：nitro-contracts @ff6334e、nitro @ccc5c82、OffchainLabs/go-ethereum @260bc5d、mantle-v2 @da45c31。
- **观点与先例**：两路后台调研逐楼读取论坛 30803 / 30825 的 Discourse JSON，读取 Snapshot GraphQL、SDNY 文件、各链官方事故报告和代码仓库。
- **抽查**：主会话复核了 5 条 observed 论断（过滤代码、0x74 地址、ArbOS 61 日期、Snapshot 票数、Sui PR 原文），全部一致。
- **台账**：226 条论断，页面上的每条论断都能在台账里找到。

## R 复现 {depth=3}
需要 Foundry 的 `cast`、`curl` 和 `jq`。

1. 解码 L1 交易里 `SpoofL2TxAction.execute` 的参数：

```bash
export ETH_RPC_URL=https://ethereum-rpc.publicnode.com
TX=0x079984c56c5670108f5c6f664904178f9b364340351949a42e4637d1f645f770
cast tx $TX input > in.hex
cast calldata-decode "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)" $(cat in.hex) | sed -n 10p | awk '{print (length($0)-2)/2/65, "signatures"}'
# 预期输出：9 signatures
```

2. 读 L1 交易的日志顺序：

```bash
curl -s "https://eth.blockscout.com/api/v2/transactions/$TX/logs" \
  | jq -r '.items[] | [.index, .decoded.method_call] | @tsv'
# 预期：Upgraded → MessageDelivered → InboxMessageDelivered → Upgraded → UpgradeExecuted → ExecutionSuccess
```

3. 读 L2 交易：

```bash
cast tx 0x5618044241dade84af6c41b7d84496dc9823700f98b79751e257608dac570f6b \
  --rpc-url https://arb1.arbitrum.io/rpc --json | jq '{type, from, to, nonce, value, r}'
# 预期：type 0x65，from 0x5d39…7ccc，to 0x…0da0，nonce 0x0，value 0x683cf676a5cc88b3b50，r 0x0
```

4. 核对黑客地址的余额尾数：

```bash
cast balance 0x5d3919F12bCc35c26Eee5F8226A9bee90c257Ccc --rpc-url https://arb1.arbitrum.io/rpc
# 预期：99578656000000（= 0.0001 ETH − 21000 × 0.020064 gwei）
```

5. 核对 Mantle Portal 的升级权限：

```bash
cast admin 0xc54cb22944F2bE476E02dECfCD7e3E7d3e15A8Fb
cast call 0xca35F8338054739D138884685e08b39EE2217794 "owner()(address)"
cast call 0x4e59e778a0fb77fBb305637435C62FaeD9aED40f "getThreshold()(uint256)"
# 预期：0xca35…7794；0x4e59…D40f；6
```

## S 术语表 {depth=2}
```glossary
sequencer | 排序器 | 接收用户交易、决定顺序、把批次提交到 L1 的运营方。它不决定执行结果。 | 不是验证者
delayed message | 延迟消息 | 通过 L1 Inbox 写进 Bridge 的 L2 输入。sequencer 不收时，约 1 天后可以强制收录。 | 不是“慢交易”
force inclusion | 强制收录 | 用户调用 `SequencerInbox.forceInclusion`，把超时未收的 delayed message 纳入序列。
delayedInboxAccs | delayed 累加器 | Bridge 里串起所有 delayed message 哈希的哈希链。证明只核对它。
ArbOS | Arbitrum 操作系统 | Arbitrum 的状态转换函数（STF），把 L1 消息派生成 L2 交易并执行。 | 不是 sequencer
ArbitrumUnsignedTx | 类型 0x65 | 由 L1 消息派生、没有签名的 L2 交易，`From` 取自消息 sender。仍检查 nonce 和余额。
address aliasing | 地址别名 | L1 地址进入 L2 时加上固定偏移，防止 L1 调用者冒充同地址的 L2 账户。
BoLD | Bounded Liquidity Delay | Arbitrum 的欺诈证明协议，检查给定输入下 STF 执行是否正确。 | 不检查输入是否获得同意
Security Council | 安全委员会 | Arbitrum 的 12 人多签。紧急行动需要 9 个签名，没有延迟。
UpgradeExecutor | 升级执行器 | 持有 ProxyAdmin 的合约，只接受 Security Council 和 L1 Timelock 的调用。
SpoofL2TxAction | 冒充交易动作合约 | 本次冻结现场部署的一次性合约：升级 Inbox、冒充入队、改回原实现。
L1 Timelock | L1 时间锁 | 常规治理路径的最后一站。宪法 AIP 投票通过并等待后，由它执行升级。
Compliance Filtering | 合规过滤 | ArbOS 61 提供的可选交易过滤，分 sequencer 层和 STF 层。Arbitrum One 上关闭。 | 不是这次冻结用的机制
ArbFilteredTransactionsManager | 预编译 0x74 | 登记被过滤交易 hash 的预编译。只有 chain owner 授权的 filterer 能写。
FilteredFundsRecipient | 过滤资金收款人 | 被过滤的 deposit 或 retryable 资金会转给这个地址，默认是 networkFeeAccount。
AIP | Arbitrum Improvement Proposal | Arbitrum DAO 的治理提案。宪法类 AIP 要经过 L2 投票和时间锁。
Stage | L2BEAT 成熟度等级 | L2BEAT 对 rollup 去中心化程度的分级：Stage 0、1、2。 | 不是安全评分
deposit 交易 | 类型 0x7E | OP Stack 中由 L1 deposit 日志派生的 L2 交易，没有签名和 nonce，gas 在 L1 购买。
OptimismPortal | deposit 合约 | OP Stack 的 L1 入口合约。op-node 只认它的地址发出的 `TransactionDeposited` 日志。
MantleSecurityMultisig | Mantle 安全多签 | Mantle 的 6/14 多签，可以无延迟升级 OptimismPortal 等 L1 合约。
```

## T 参考资料 {depth=2}
1. [Security Council Emergency Action 21-04-2026](https://forum.arbitrum.foundation/t/security-council-emergency-action-21-04-2026/30803) — Arbitrum 官方技术说明与社区回复。**PRIMARY**
2. [L1 冻结交易 0x0799…f770](https://eth.blockscout.com/tx/0x079984c56c5670108f5c6f664904178f9b364340351949a42e4637d1f645f770) — 内部调用、日志、calldata。**PRIMARY**
3. [L2 冻结交易 0x5618…0f6b](https://arbiscan.io/tx/0x5618044241dade84af6c41b7d84496dc9823700f98b79751e257608dac570f6b) — 0x65 交易字段与收据。**PRIMARY**
4. [补丁 Inbox 实现 0x980D…A859](https://eth.blockscout.com/address/0x980D1F93FC5809c828539c46084801673FA6A859?tab=contract) — `sendUnsignedTransactionOverride` 源码与注释。**PRIMARY**
5. [SpoofL2TxAction 0x3d45…a322](https://eth.blockscout.com/address/0x3d456FCd62f5baBCf3263B72fb4ac8fF8cc5a322?tab=contract) — 升级、调用、改回的动作合约。**PRIMARY**
6. [nitro-contracts @ff6334e](https://github.com/OffchainLabs/nitro-contracts/tree/ff6334e7bfe6468f85202df98db92468e25f5688) — `AbsInbox`、`Inbox`、`AbsBridge`、`SequencerInbox`、`OneStepProverHostIo`。**PRIMARY**
7. [nitro @ccc5c82](https://github.com/OffchainLabs/nitro/tree/ccc5c828d9ea22f161efc784bac4d4a6559b7e59) — `arbos/parse_l2.go`、`tx_processor.go`、`precompiles/`。**PRIMARY**
8. [OffchainLabs/go-ethereum @260bc5d](https://github.com/OffchainLabs/go-ethereum/tree/260bc5dcbd5a16925d7e26145577b2612f30f428) — `arb_types.go`、`state_transition.go`。**PRIMARY**
9. [The Sequencer and censorship resistance](https://docs.arbitrum.io/how-arbitrum-works/deep-dives/sequencer) — 输入路径与 force inclusion。**PRIMARY**
10. [Compliance filtering](https://docs.arbitrum.io/launch-arbitrum-chain/chain-config/sequencer/compliance-filtering) — 两层过滤与副作用。**PRIMARY**
11. [ArbOS 61 Elara](https://docs.arbitrum.io/run-arbitrum-node/arbos-releases/arbos61) — 激活时间与“intentionally disabled”。**PRIMARY**
12. [Constitutional AIP: ArbOS 61 Elara](https://forum.arbitrum.foundation/t/constitutional-aip-arbos-61-elara/30601) — 提案时间线与讨论。**PRIMARY**
13. [ArbitrumDAO Constitution](https://docs.arbitrum.foundation/dao-constitution) — Security Council 门槛、紧急行动范围、透明度报告。**PRIMARY**
14. [L2BEAT: Arbitrum One](https://l2beat.com/scaling/projects/arbitrum) — 权限链、Stage、force inclusion 延迟（第三方分析）。
15. [Constitutional AIP: Approve Release of Frozen ETH](https://forum.arbitrum.foundation/t/constitutional-aip-approve-release-of-frozen-eth/30825) — 释放提案、限制令、代表观点。**PRIMARY**
16. [Snapshot: Approve Release of Frozen ETH](https://snapshot.box/#/s:arbitrumfoundation.eth/proposal/0xb32581468bece42245fa267ea86156a621ae77f61bb866118189b5d50155b051) — 温度检查票数。**PRIMARY**
17. [SDNY 1:25-mc-00527 Doc 52](https://storage.courtlistener.com/recap/gov.uscourts.nysd.653423/gov.uscourts.nysd.653423.52.0.pdf) — 法院修改限制令。**PRIMARY**
18. [L1 释放交易 0xc2e2…145b](https://eth.blockscout.com/tx/0xc2e247e5869aaf5b57ff1cc5da8b56f6675161ad6f980b547846f209e43e145b) 与 [L2 交易 0x0979…df72](https://arbiscan.io/tx/0x09795deb2b812f9bb069df8a0466cc7a96a17c3b2268c3924308d3d07dafdf72) — 6 月释放。**PRIMARY**
19. [LayerZero KelpDAO Incident Report](https://layerzero.network/publications/kelpdao-incident-report.pdf) — 攻击时间线与归因（利益相关方）。**PRIMARY**
20. [CoinDesk: Inside the $71 million freeze on Arbitrum](https://www.coindesk.com/tech/2026/04/22/inside-the-usd71-million-freeze-on-arbitrum-that-has-the-crypto-world-questioning-what-decentralization-really-means) — Goldfeder、McCorry 的采访转述。
21. [L2BEAT Governance Review #93](https://l2beat.com/publications/governance-review-93) — “why this case and not others”。**PRIMARY**
22. [The Stages Framework](https://forum.l2beat.com/t/the-stages-framework/291) — Stage 1 / 2 对 Security Council 的要求。**PRIMARY**
23. [Sui: Cetus Incident Response](https://www.sui.io/blog/cetus-incident-response-onchain-community-vote) 与 [sui PR #22237](https://github.com/MystenLabs/sui/pull/22237) — 投票与别名授权实现。**PRIMARY**
24. [Gnosis: Balancer hack update](https://forum.gnosis.io/t/11759) 与 [claim process](https://forum.gnosis.io/t/12149) — soft fork、hard fork 与资金领取。**PRIMARY**
25. [Flow: Dec 27 Technical Post-Mortem](https://flow.com/post/dec-27-technical-post-mortem) — 隔离恢复与 Council 临时特权。**PRIMARY**
26. [bera-geth releases](https://github.com/berachain/bera-geth/releases) — Prague3 冻结与 Prague4 撤销。**PRIMARY**
27. [bsc v1.1.15](https://github.com/bnb-chain/bsc/releases/tag/v1.1.15) — 攻击地址黑名单写入客户端。**PRIMARY**
28. [EF: Hard Fork Completed](https://blog.ethereum.org/2016/07/20/hard-fork-completed) 与 [EIP-999](https://eips.ethereum.org/EIPS/eip-999) — The DAO 分叉与被撤回的恢复提案。**PRIMARY**
29. [XRPL: Freezing Tokens](https://xrpl.org/docs/concepts/tokens/fungible-tokens/freezes) — 发行方冻结与 No Freeze。**PRIMARY**
30. [Cointelegraph: Linea blockchain halt](https://cointelegraph.com/news/linea-hack-highlights-need-for-decentralization-on-ethereum-layer-twos) — Linea 停链与批评（二手）。
31. [L2BEAT: Mantle](https://l2beat.com/scaling/projects/mantle) — Stage、权限、风险摘要（第三方分析）。
32. [mantle-v2 @da45c31](https://github.com/mantlenetworkio/mantle-v2/tree/da45c315d800e5040ee8625d46319a03d4064803) — `OptimismPortal.sol`、`op-node/rollup/derive`。**PRIMARY**
33. [OP Stack: Deposits](https://specs.optimism.io/protocol/deposits.html) — deposit 交易的字段与认证。**PRIMARY**
34. [Mantle OptimismPortal 实现 0xe139…31A7](https://eth.blockscout.com/address/0xe1399f54ba2597b4EaDA9E3450c34D393fb131A7?tab=contract) — 已部署的 `depositTransaction`。**PRIMARY**
35. ChatGPT Deep Research：censor-users-on-arbitrum.md — 外部调研，只作线索。

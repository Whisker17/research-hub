---
template: research
title: 原子同步可组合交易（EEZ）：原理、首笔主网交易与 Mantle L2↔L3
subtitle: EEZ 在链下预先算好跨链执行，再在同一个 L1 区块里验证并消费结果，让 L1 和 L2 在一笔交易里一起成功或一起回滚。首笔主网交易只跑通了最简单的 L1→L2 存款，证明仍是单个 ECDSA 签名。
cols: 4
type: 技术调研 · dev onboarding
audience: Mantle devs：懂 EVM 和 rollup 基础，没接触过同步可组合
scope: AS 机制与背景、infra 改造清单、首笔主网交易解码、其他路线对比、生态意义与 Mantle L2↔L3 映射
evidence: 207 条论断台账（observed 165 / inferred 38 / speculative 4）；链上数据（区块 26127444）；源码 eez-core-protocol @6ae4110、eez-rollup0 @6ff63ec；网页访问于 2026-10-06
date: 2026-10-06 · v1
---
结论先行：EEZ 的“同步”不是让 L1 在执行中途去读 L2。它的做法是先在链下算出跨链执行的结果，再在 L1 上验证，并在同一个区块里逐条核对、消费（[F1](#F1)）。2026-10-05 的首笔主网交易，是用户向自己在 L2 上的地址转 0.001 ETH。验证和消费是同一区块里相邻的两笔交易（[F2](#F2)）。证明是单个 ECDSA 签名，不是 ZK（[F3](#F3)）。对 Mantle 来说，“L3 调用 L2 流动性”正好对应 EEZ 最简单、Gnosis 首版就支持的方向（[F8](#F8)），但移植前要先解决四个冲突（[F9](#F9)）。

## A 一笔 AS 交易由什么组成 {sheet meta="components"}
```tree list
`composer` 链下 | 模拟 L1 + L2，生成执行表
`signer / prover` 链下 | 为执行表背书（现在是签名）
`postAndVerifyBatch` L1 | 验证背书，发布执行条目
`CrossChainProxy` L1 | 代表远端合约，用户调用它
`EEZ manager` L1 | 核对 root、调用轨迹、ETH 守恒
`EEZL2` + `0x76` L2 | 子链侧装表、投递入站调用
```

## B 首笔交易的条目绑定了什么 {sheet span=2 meta="proxyEntryHash"}
```annot
# keccak256(abi.encode(...)) = 0x2846…0fc4 | 本地复算 = 链上值
[0xceaf…]{L1 调用者} → [r1:0xceaf…]{rollup 1 上的同名地址} [1e15]{!0.001 ETH}
> 还绑定空 calldata 与 callGas 0。换掉任何一项，hash 都对不上，条目就不能被消费
```

## C 谁能做到带返回值的 L1↔L2 同步 {sheet meta="routes"}
| 路线 | 带返回值的 L1↔L2 同步 |
|---|---|
| EEZ | ok 主网 1 笔（签名证明） |
| ULTRA TX / SCOPE | warn 设计、提案 |
| shared sequencer | no 只保证一起打包 |
| OP interop | no 消息，无返回值 |
| AggLayer / intents | no 异步 |

## D 关键数字 {sheet span=2 meta="2026-10-06"}
| 量 | 值 |
|---|---|
| 首笔 AS 交易 | 区块 26127444，序号 32，0.001 ETH |
| 验证交易 gas | 297,862（带 1 个 blob，实际用 142 字节） |
| 用户交易 gas | 111,263 |
| 证明 | 1 个 65 字节 ECDSA 签名，threshold 1 |
| 原帖的证明基准 | 约 12 GPU、约 7 秒证明一个以太坊区块 |
| Mantle 出块间隔 | 2 秒 |

## E 时间线 {sheet span=2 meta="2024–2026"}
```timeline
2024-10 | Vitalik《The Surge》 | 把同步可组合列为 L2 互操作的改进方向
2026-02-02 | ethresear.ch 23998 | Jordi Baylina 提出代理 + 执行表 + 实时证明
2026-03-29 | EEZ 发布 | Gnosis 与 ZisK 发起，EF 出资
2026-08-19 | GIP-153 通过 | Gnosis Chain 将转为 EEZ rollup
2026-09-29 | 主网部署 | EEZ manager 部署到 Ethereum
*2026-10-05 | 首笔 AS 交易 | 0.001 ETH L1→L2，ECDSA 证明
```

## F 结论 {sheet span=4}
```callout ok 先算后验，同块消费
- 机制：链下预计算，L1 验证背书，同一区块内逐条核对并消费；对不上就整条回滚（F1）。
- 现状：主网只跑通了最简单的 L1→L2 存款；安全性来自单个签名人和单个 owner（F2、F3）。
- 改造：Ethereum 不用硬分叉；要改的是 L2 节点、composer、signer、builder 和 deriver（F4）。
- Mantle：L3 调 L2 流动性是最先能做的方向；先做一个窄的毕业或建仓原型（F8、F9）。
```

## G 如何阅读 {depth=1}
```callout info 默认你已知道（本文不解释）
- EVM 的调用栈：`CALL` 返回数据，`revert` 回滚整个调用帧
- 合约里的 `msg.sender`、`msg.value`，以及 CREATE2 地址可以预先算出
- rollup 把自己的状态根和数据提交到 L1 结算
- 区块里的交易有顺序，builder / sequencer 决定顺序
```
- **5 分钟**：只看总览 A–F 和导语。
- **30 分钟**：再读 [前置知识](#panel-I)、[工作原理](#panel-J)、[首笔交易拆解](#panel-L) 和 [对 Mantle 的意义](#panel-O)。
- **要做原型的开发者**：重点读 [infra 改造](#panel-K)、[F5](#F5)、[F9](#F9) 和 [复现](#panel-R)。

## H 背景动机 {depth=2}
**问题**：今天的跨链交互是异步的。合约在 A 链发出消息后，当前交易就结束了。结果要在另一笔交易里处理。合约不能“调用另一条链、拿到返回值、再决定下一步”。所以 DeFi 在单链上的组合方式（闪电贷、按实际成交量更新仓位）跨不过 rollup 的边界 [1]。

**为什么现在**：
- 2026-10-05，EEZ 在 Ethereum 主网完成了第一笔原子 L1→L2 交易 [5][10]。
- 我们在考虑把同样的能力用在 Mantle L2 ↔ L3。目标是让 L3 appchain 直接使用 L2 上的 Vault、DeFi 和 launchpad 流动性，而流动性仍然留在 L2。

**范围**：AS 的机制和背景、要改的 infra、首笔主网交易解码、其他路线对比、生态意义、Mantle L2↔L3 映射。

**非目标**：投资建议；完整代码审计；Mantle 的正式路线图承诺。

**已有做法及其不足**：
- 消息桥和 intents：结果可以原子，但过程是异步的。依赖中间返回值的逻辑写不出来 [2]。
- shared sequencer：能让多条链的交易一起打包，但执行时拿不到对方的返回值（见 [其他路线](#panel-M)）。

## I 前置知识 {depth=2}
```excalidraw q="读懂 EEZ 的 AS 交易需要先懂哪些概念？按什么顺序？" read="箭头表示先学 → 后学；灰色虚线框是默认已知；绿色是本文主题。" takeaway="B-1 讲要什么性质，B-2 和 B-3 讲 L1 怎么信任并调用 L2，B-4 和 B-5 讲为什么必须在同一个区块里完成。" name=prereq-map kind=前置知识地图
{"grid": {"w": 300, "h": 120}, "defaults": {"w": 200, "h": 62, "fontSize": 17},
 "nodes": [
   {"id": "evm", "label": "EVM 调用栈（已知）", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "roll", "label": "rollup 结算（已知）", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 异步跨链消息", "col": 1, "row": 0, "color": "blue"},
   {"id": "b1", "label": "B-1 同步与原子", "col": 2, "row": 0, "color": "blue"},
   {"id": "b2", "label": "B-2 状态根承诺", "col": 1, "row": 2, "color": "blue"},
   {"id": "b3", "label": "B-3 跨链代理", "col": 1, "row": 1, "color": "blue"},
   {"id": "b4", "label": "B-4 同块 bundle", "col": 2, "row": 2, "color": "blue"},
   {"id": "b5", "label": "B-5 实时证明", "col": 2, "row": 3, "color": "blue"},
   {"id": "as", "label": "EEZ 的 AS 交易", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "evm", "to": "b0"}, {"from": "b0", "to": "b1", "label": "对比"},
   {"from": "evm", "to": "b3"}, {"from": "roll", "to": "b2"},
   {"from": "b2", "to": "b4"}, {"from": "b2", "to": "b5"},
   {"from": "b1", "to": "as"}, {"from": "b3", "to": "as"}, {"from": "b4", "to": "as"}, {"from": "b5", "to": "as", "dashed": true}
 ]}
```

```prereq B-0 l1 3min
# 异步跨链消息（asynchronous messaging）
是什么: A 链合约发出一条消息，当前交易随即结束。中继把消息送到 B 链，B 链在另一笔交易里执行它。结果要再发一条消息回来。
为什么需要: 它是今天所有桥的模型。AS 要解决的就是“同一笔交易里拿不到远端结果”这个限制。
例子:
~~~
A: tx1 发消息 → 等待中继 → B: tx2 执行
B: 再发消息 → 等待 → A: tx3 处理结果
~~~
误解: 误解：消息传得够快就等于同步。事实：只要分成几笔交易，调用方就不能在同一执行里使用结果。
深入: [1] 第 2 节
```

```prereq B-1 l1 5min
# 同步可组合与原子性（synchronous composability / atomicity）
是什么: 同步：一笔交易里调用另一条链的合约，并在同一执行上下文拿到返回值。原子：所有相关链一起成功，或者一起回滚。
为什么需要: 这两个性质定义了 AS。它们与“中间状态会不会被别的交易插入”（[[non-interleaving]]）和“结果会不会被重组撤销”（[[最终性]]）是不同的问题。
误解: 误解：同一个区块打包就等于原子。事实：一起打包只保证一起上链，不保证执行结果一致。
深入: [1] 第 2 节；[2] 的回帖讨论 non-interleaving
依赖: B-0
```

```prereq B-2 l1 4min
# 状态根承诺（state root commitment）
是什么: L1 合约为每条 rollup 存一个 32 字节的承诺。新承诺只有在某个证明或签名通过后才能写入。
为什么需要: EEZ 的每个执行条目都写明“从哪个 root 到哪个 root”。消费时，L1 先核对当前 root 是否等于条目的前置 root。
例子: 首笔交易中 rollup 1 的 root：`0x9099…` → `0x30d8…` → `0x5452…`
误解: 误解：root 一定是 EVM 的 stateRoot。事实：参考实现记录的是 L2 区块哈希。
深入: [4] `crates/eez-proof-signer/SPEC.md` §8.1
```

```prereq B-3 l1 4min
# 跨链代理（CrossChainProxy）
是什么: L1 上代表“rollup R 上地址 X”的合约，用 CREATE2 部署。调用它，就等于调用远端的 X。
为什么需要: 用户和 L1 合约用普通的 `CALL` 发起跨链调用。代理把调用转给 EEZ manager 处理。
例子: `0x3c18…` 代表 rollup 1 上的 `0xceaf…`；向它转 0.001 ETH，就是向 L2 上的 `0xceaf…` 转账。
误解: 误解：目标合约看到的 `msg.sender` 是原始用户。事实：它看到的是远端调用者在本链的代理地址。
深入: [3] `src/base/CrossChainProxy.sol`
依赖: B-2
```

```prereq B-4 3min
# 同块 bundle（atomic bundle）
是什么: 把几笔交易交给 builder，要求它们按顺序进入同一个区块，要么全进，要么全不进。
为什么需要: EEZ 的验证交易和用户交易是两笔交易。条目只在验证所在的区块里可用。
深入: [4] README（bundle 交给 L1 builder）
依赖: B-2
```

```prereq B-5 3min
# 实时证明（real-time proving）
是什么: 在一个出块间隔之内生成有效性证明（ZK proof）。
为什么需要: 无需信任的 AS 要求证明在用户交易上链前就绪。现在 EEZ 主网用签名代替它。
深入: [1] 第 1 节；[13]
依赖: B-2
```

## J 工作原理：先算后验，同块消费 {depth=2}
Fig 1 对比两种模型。异步桥要 3 笔交易和 2 次等待。同步模型里，调用方像调用本地合约一样调用代理，并在同一笔交易里拿到结果。

```excalidraw q="异步桥和同步调用，差别在哪里？" read="上排是异步桥：红色是等待；下排是同步调用：绿色框里是一笔交易。" takeaway="同步的关键不是更快，而是调用方能在同一执行里使用远端结果。" kind=对比
{"grid": {"w": 260, "h": 120}, "defaults": {"w": 170, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "a1", "label": "A: tx1 发消息", "col": 0, "row": 0},
   {"id": "w1", "label": "等待中继", "col": 1, "row": 0, "color": "red"},
   {"id": "b1", "label": "B: tx2 执行", "col": 2, "row": 0},
   {"id": "a3", "label": "A: tx3 处理结果", "col": 3, "row": 0, "color": "red"},
   {"id": "s1", "label": "A 合约执行", "col": 0, "row": 2, "color": "blue"},
   {"id": "s2", "label": "调用 B 的代理", "col": 1, "row": 2, "color": "blue"},
   {"id": "s3", "label": "拿到返回值", "col": 2, "row": 2, "color": "blue"},
   {"id": "s4", "label": "继续或回滚", "col": 3, "row": 2, "color": "green"}
 ],
 "edges": [
   {"from": "a1", "to": "w1"}, {"from": "w1", "to": "b1"}, {"from": "b1", "to": "a3", "label": "再等"},
   {"from": "s1", "to": "s2"}, {"from": "s2", "to": "s3"}, {"from": "s3", "to": "s4"}
 ],
 "boxes": [{"label": "一笔交易", "around": ["s1", "s2", "s3", "s4"], "pad": 22, "color": "green"}]}
```

L1 不能在执行中途去问 L2：它没有 L2 的最新状态，也没有证明。EEZ 的做法是**先算后验**：
1. [[composer]] 在链下同时模拟 L1 和 L2，把 L2 的结果和 L1 必须真实发生的调用写成 [[execution table]]。
2. [[proof system]] 为这张表背书。现在用 ECDSA 签名，目标是 ZK 证明。
3. L1 上的 `postAndVerifyBatch` 验证背书，发布 [[execution entry]]。
4. 同一个 L1 区块里，用户调用 [[CrossChainProxy]]。EEZ manager 找到匹配的条目，核对后推进 rollup 的 root [1][3]。

```excalidraw q="EEZ 由哪些部件组成？它们分别在链下、L1 还是 L2？" read="蓝色是 EEZ 部件；灰色虚线是用户和外部系统；紫色是存状态的合约。虚线箭头是数据流。" takeaway="L1 合约只做验证和核对；预计算、背书、打包和 L2 侧执行都在链下与 L2 节点里完成。" kind=架构
{"grid": {"w": 320, "h": 130}, "defaults": {"w": 190, "h": 62, "fontSize": 17},
 "nodes": [
   {"id": "user", "label": "用户", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "comp", "label": "composer", "col": 1, "row": 0, "color": "blue", "strokeWidth": 3},
   {"id": "l2", "label": "L2 节点 Sync block", "col": 2, "row": 0, "color": "blue"},
   {"id": "eezl2", "label": "EEZL2 0x42…07", "col": 3, "row": 0, "color": "violet"},
   {"id": "sig", "label": "signer / prover", "col": 0, "row": 1, "color": "blue"},
   {"id": "bld", "label": "L1 builder", "col": 1, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "der", "label": "deriver", "col": 2, "row": 1, "color": "blue"},
   {"id": "proxy", "label": "CrossChainProxy", "col": 0, "row": 2, "color": "blue"},
   {"id": "mgr", "label": "EEZ manager", "col": 1, "row": 2, "color": "violet"},
   {"id": "ps", "label": "ProofSystem", "col": 2, "row": 2, "color": "violet"}
 ],
 "edges": [
   {"from": "user", "to": "comp", "label": "跨链 tx"},
   {"from": "comp", "to": "sig", "label": "请求背书"},
   {"from": "comp", "to": "bld", "label": "bundle"},
   {"from": "comp", "to": "l2", "label": "出块"},
   {"from": "l2", "to": "eezl2", "label": "0x76 装表"},
   {"from": "bld", "to": "mgr", "label": "batch"},
   {"from": "proxy", "to": "mgr", "label": "调用"},
   {"from": "mgr", "to": "ps", "label": "verify"},
   {"from": "mgr", "to": "der", "dashed": true, "label": "读事件"},
   {"from": "der", "to": "l2", "dashed": true, "label": "重建"}
 ],
 "boxes": [{"label": "L1", "around": ["proxy", "mgr", "ps"], "pad": 18, "color": "gray"}]}
```

Fig 3 是 L1 发起、调用 L2 的完整时序，形态与首笔主网交易相同。

```uml q="一笔 L1→L2 的 AS 交易，从用户签名到 root 推进，谁在何时做什么？" read="第 1–6 步在链下和 L2；第 7–12 步在同一个 L1 区块里；高亮部分是用户交易。" takeaway="验证和消费是同一区块里的两笔交易；用户交易只有在验证交易先上链时才能成功。"
sequenceDiagram
  autonumber
  participant U as User
  participant C as Composer
  participant S as Signer
  participant B as L1 builder
  participant M as EEZ manager
  participant P as Proxy
  U->>C: signed L1 tx to Proxy
  C->>C: simulate L1 + L2
  C->>C: Sync block with 0x76 delivery
  C->>S: entries + witness
  S-->>C: signature
  C->>B: bundle [postAndVerifyBatch, user tx]
  B->>M: tx A: postAndVerifyBatch
  M->>M: verify, run L2Tx entries, queue the rest
  rect rgb(234, 241, 251)
    B->>P: tx B: user call with value
    P->>M: executeCrossChainCall(user, data)
    M->>M: match entry, check root, hash, ETH
    M-->>U: precomputed returnData
  end
```

Fig 4 是反方向：L2 合约调用 L1 合约。L2 先用预计算的返回值继续执行，L1 随后在 batch 里真实执行这个调用，再核对结果。

```uml q="L2 合约调用 L1 合约时，L2 怎么在同一笔交易里拿到返回值？" read="L1 合约 C 在 L1 上真实执行；返回值和模拟不一致时，这个条目被跳过，L2 回滚对应的 Sync block。" takeaway="子链先用预计算结果，父链事后真实执行并核对；对不上就整体作废。"
sequenceDiagram
  autonumber
  participant D as L2 contract D
  participant X as Proxy of C on L2
  participant E as EEZL2
  participant M as EEZ manager (L1)
  participant C as L1 contract C
  Note over E: composer loads table via 0x76 tx
  D->>X: call C.f(args)
  X->>E: executeCrossChainCall
  E-->>D: precomputed retC
  D->>D: continue with retC
  Note over M: same L1 block, in postAndVerifyBatch
  M->>C: executeOnBehalf via D's proxy on L1
  C-->>M: real result
  M->>M: CALL_END hash must equal entry
```

执行条目是这套机制的核心数据结构。它不是一条简单的消息，而是一段“带前置状态、调用轨迹和后置状态”的执行片段 [3]：

```solidity
// eez-core-protocol/src/interfaces/IEEZ.sol L81-L137 @6ae4110（节选）
struct RollupUpdate {
    uint64 rollupId;
    int192 etherDelta;     // 这条 rollup 的 ETH 净变化
    bytes32 currentRoot;   // 消费时必须等于当前 root
    bytes32 newRoot;
}
struct ExecutionEntry {
    RollupUpdate[] rollupUpdates;
    bytes32 proxyEntryHash;          // 0 = 纯 L2 交易条目
    L2ToL1Call[] l2ToL1Calls;        // 必须在 L1 真实执行的调用
    ExpectedL1ToL2Call[] expectedL1ToL2Calls; // 重入调用的预计算结果
    bytes32 rollingHash;             // 整条调用轨迹的承诺
    uint64 destinationRollupId;
    bool success;
    bytes returnData;                // 预计算的返回值
}
```

用户调用代理时，代理只做转发。它先判断自己是不是在 STATICCALL 里，再把调用者和原始 calldata 交给 manager [3]：

```solidity
// eez-core-protocol/src/base/CrossChainProxy.sol L113-L128 @6ae4110（节选）
uint256 staticCheckGas = IEEZ(EEZ).STATIC_CHECK_GAS();
(bool success,) = address(this).call{gas: staticCheckGas}(
    abi.encodeWithSelector(STATIC_CHECK_SELECTOR)); // TSTORE 失败 = static
if (!success) {
    (success, result) = EEZ.staticcall(abi.encodeCall(
        IEEZ.staticCrossChainCall, (msg.sender, msg.data)));
} else {
    (success, result) = EEZ.call{value: msg.value}(abi.encodeCall(
        IEEZ.executeCrossChainCall, (msg.sender, msg.data)));
}
```

manager 消费条目时做四项检查。任何一项失败，整个条目回滚 [3]：

```annot
# 消费一个条目 | EEZ.sol _executeEntry
[root == currentRoot]{从证明过的状态开始} → [真实执行 l2ToL1Calls]{L1 调用不是模拟} → [rollingHash 相等]{!调用、返回值、顺序都绑定} → [Σ etherDelta == ETH 净流量]{ETH 守恒} → 写入 newRoot
> 另一个前提：条目只在 lastVerifiedBlock == block.number 的区块里可读
```

[[rolling hash]] 的种子是 `keccak(…(rollupId, currentRoot)…, proxyEntryHash)`。之后每发生一个事件，就把带标签的数据折进去：`CALL_BEGIN(callHash)`、`CALL_END(success, retData)`、`NESTED_BEGIN`、`NESTED_END` 等 [3]。所以换掉调用目标、改金额、改返回值、改顺序，最终 hash 都会不同。

```finding F1 high
# EEZ 的同步来自“先算后验、同块消费”，L1 不在执行中途读 L2
结论: composer 链下预计算；L1 验证背书后，在同一区块里按前置 root、真实调用、rolling hash、ETH 守恒四项核对并消费条目；任一项失败，条目整体回滚。
证据: [observed] `postAndVerifyBatch` 先验完全部证明再改状态 [3]；代理入口要求 `lastVerifiedBlock == block.number` [3]；`_executeEntry` 依次检查 root、rolling hash、ETH 守恒 [3]。[observed] 原帖称整套机制不需要分叉 L1 [1]。
影响: 开发者可以像调用本地合约一样写跨链调用；但“结果对不对”取决于背书方式，“能不能执行”取决于 composer 和 builder（F3、F5）。
```

## K 要改哪些 infra {depth=2}
Ethereum 本身不需要硬分叉，所有 L1 逻辑都是合约 [1]。工作量集中在 L2 节点和链下组件 [3][4]：

| 层 | 要做什么 |
|---|---|
| L1 合约 | 部署 EEZ manager（可升级代理）、每条 rollup 一个 `Rollup` 合约、`ProofSystem`；代理按需用 CREATE2 自动创建 |
| L2 执行客户端 | 改 reth：新增 `0x76` [[系统交易]]（无签名、gas price 为 0、入站按 `value` 铸币）；预部署 EEZL2 到 `0x4200…0007`；区分 Live block 和 [[Sync block]]；需要全新 genesis |
| composer | 拦截跨链交易，模拟 L1 + L2，生成执行表和 Sync block，组装 batch，按截止时间提交 |
| signer / prover | 重执行 Sync 窗口里的区块，核对结算效果，重算公共输入后签名；将来换成 ZK |
| L1 builder | 支持 [[bundle]]：验证交易和用户交易进同一区块，全有或全无 |
| [[deriver]] | 只读 L1 的 `BatchPosted` 和 DA 数据，就能重建同一条 L2 链 |
| RPC / 钱包 | 跨链交易要发到 composer 的入口；用户面对的是代理地址 |
| 应用合约 | 按跨域身份做授权（`msg.sender` 是代理）；不依赖 `gasleft()` 或代理的余额 |

```callout warn CAUTION
参考 builder（rbuilder-chiado）在一个 bundle 超过约 3 笔交易时，会静默丢弃多出的交易，所以 composer 默认把 bundle 限制在 3 笔 [4]。设计多步流程时，把步骤收进一个合约调用，不要靠多笔交易。
```

```finding F4 high
# 实现 AS 主要改的是 L2 节点与链下组件，不是 Ethereum
结论: L1 只需要部署合约；L2 要改执行客户端（`0x76` 系统交易、预部署、全新 genesis），并新增 composer、signer、bundle 提交和 deriver。
证据: [observed] 原帖“No L1 Fork Required” [1]；系统交易与预部署的规则 [4] `docs/native-system-transactions.md`；composer 把 batch 和用户交易作为 bundle 提交 [4]；follower 只读 L1 重建 L2 [4]。
影响: 对 Mantle 来说，主要工作量在 L3 节点与 composer，以及 L2 排序器的 bundle 能力（见 F9）。
```

```finding F5 medium
# 证明通过不等于条目一定会执行：调度与排序仍靠 composer 和 builder
结论: 公共输入不包含“哪些条目立即执行”的调度参数。不匹配的条目会被跳过。composer 或 builder 可以审查或延迟用户交易，但按合约设计，结果只会是“没执行”，不会写入错误状态。
证据: [observed] `immediateEntryCount` 不进入公共输入 [3] `IEEZ.sol` L31–L33；不匹配的条目被跳过 [3]；签名不担保调度方式和未来执行结果 [4] signer SPEC §1.1。[inferred] 审查只影响活性，不影响正确性。
影响: 必须执行的业务流程，要用 `bindMsgSenderInPublicInput` 限定提交者，并在提交者的合约里检查动作确实发生。
```

## L 首笔主网交易逐步拆解 {depth=2}
交易 `0xd0cbfef7…0a02` 本身只是一笔普通转账：向合约 `0x3c18…` 转 0.001 ETH，input 为空 [5]。跨链逻辑全部在被调用的代理和 manager 里。同一区块的上一笔交易是 composer 提交的 `postAndVerifyBatch` [5]。

```uml q="区块 26127444 里，两笔交易分别做了什么？" read="真实数据，来自 receipt、internal transactions 与 batch 解码。tx31 由 composer 提交，tx32 由用户提交。" takeaway="tx31 发布条目并推进一次 root；tx32 消费条目，把 0.001 ETH 记入 rollup 1，再推进一次 root。"
sequenceDiagram
  autonumber
  participant C as Composer 0x4261
  participant M as EEZ manager 0x4b27
  participant S as ECDSAProofSystem
  participant U as User 0xceaf
  participant P as Proxy 0x3c18
  C->>M: tx31 postAndVerifyBatch (1 blob, 2 entries)
  M->>S: verify(sig, publicInputsHash)
  S-->>M: true (threshold 1)
  M->>M: entry0: root 0x9099 to 0x30d8
  M->>M: queue entry1
  rect rgb(234, 241, 251)
    U->>P: tx32 send 0.001 ETH, data 0x
    P->>M: executeCrossChainCall(0xceaf, 0x)
    M->>M: hash 0x2846 matches entry1
    M->>M: root 0x30d8 to 0x5452, balance 0 to 0.001 ETH
  end
```

batch 里的两条执行条目 [5]：

| 条目 | 作用 | root 变化 |
|---|---|---|
| entry0 | 纯 L2 交易条目（[[L2Tx 条目]]）：没有 L1 调用，在 tx31 里立即执行 | `0x9099…` → `0x30d8…` |
| entry1 | 等待代理调用来消费；`etherDelta` = +0.001 ETH；没有 L1 调用 | `0x30d8…` → `0x5452…` |

代理 `0x3c18…` 由 `0xceaf…` 在 14 个区块前创建，它代表 rollup 1 上的同一个地址 `0xceaf…` [5]。所以这笔交易的语义是：L1 地址 `0xceaf…` 向它在 rollup 1 上的同名地址转 0.001 ETH。

我们按源码公式在本地复算了三个哈希，全部与链上一致：proxyEntryHash（总览 B），以及两条条目的 rolling hash。两条条目的 rolling hash 都只等于种子，说明执行时 L1 上没有发生任何跨链调用 [3][5]。

```finding F2 high
# 首笔主网交易是同一区块里两笔交易完成的 0.001 ETH L1→L2 自转账
结论: tx31 验证签名并发布两条条目；tx32 的用户转账消费 entry1，把 rollup 1 的 root 推进到 `0x5452…`，L1 记账余额从 0 变为 0.001 ETH。L1 的存入与 L2 状态推进在 tx32 里原子完成。
证据: [observed] 两笔交易的序号、事件、batch 参数 [5]；[observed] proxyEntryHash 与 rolling hash 本地复算一致 [3][5]；[observed] 代理代表 rollup 1 上的 `0xceaf…` [5]。[inferred] 如果 tx31 没有先进入同一区块，tx32 会 revert，不会留下部分结果。
影响: 它证明了“同块验证 + 代理消费”的最简路径在主网可用。它没有演示：L1 使用 L2 返回值、L2→L1 调用、嵌套、static 读、多 rollup、ZK 证明。
```

```finding F3 high
# 首笔交易的安全性来自单个签名人和单个 owner，不是密码学证明
结论: proof 是 1 个 65 字节 ECDSA 签名，rollup 1 的 threshold 为 1。发起演示的 EOA 同时是 manager 部署者、rollup owner、ProofSystem owner 和升级管理员。
证据: [observed] `signer()` = `0xa86e…`，部署后没有更换；`threshold()` = 1；三个 `owner()` 都是 `0xceaf…` [5]。[observed] 主网实现的已验证源码与 commit `6ae4110` 逐字节相同 [3][5]。[observed] `ECDSAProofSystem.verify` 只检查签名人，不检查执行正确性 [3]；参考实现自称“not yet a succinct validity proof” [4]。
影响: 对外介绍时，要把它说成“同步执行路径在主网跑通”，不要说成“实时 ZK 已经上线”。rollup owner 还可以用 `setRoot` 直接改写 root [3]。
```

## M 其他路线：谁能做到真同步 {depth=2}
“同步”有几个不同的强度。Fig 6 按强度从低到高排列现有路线。

```excalidraw q="各条路线做到的“同步”分别有多强？" read="从下到上越来越强；绿色是带返回值的真同步；灰色虚线框是代表项目。" takeaway="只有“预计算 + 同 slot 验证 + 原子打包”这一族能做到 L1↔L2 带返回值的调用。" kind=阶梯
{"grid": {"w": 330, "h": 92}, "defaults": {"w": 270, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "l4", "label": "带返回值的真同步调用", "col": 0, "row": 0, "color": "green", "strokeWidth": 3},
   {"id": "l3", "label": "原子打包，不保证执行", "col": 0, "row": 1, "color": "blue"},
   {"id": "l2", "label": "同时间戳消息，无返回值", "col": 0, "row": 2, "color": "blue"},
   {"id": "l1", "label": "异步消息或 intents", "col": 0, "row": 3, "color": "blue"},
   {"id": "p4", "label": "EEZ、ULTRA TX、SCOPE", "col": 1, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "p3", "label": "Espresso、Astria", "col": 1, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "p2", "label": "OP Superchain interop", "col": 1, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "p1", "label": "AggLayer、Arbitrum、OIF", "col": 1, "row": 3, "color": "gray", "stroke": "dashed"}
 ],
 "edges": [
   {"from": "l1", "to": "l2"}, {"from": "l2", "to": "l3"}, {"from": "l3", "to": "l4"},
   {"from": "l4", "to": "p4", "arrow": "none", "dashed": true}, {"from": "l3", "to": "p3", "arrow": "none", "dashed": true},
   {"from": "l2", "to": "p2", "arrow": "none", "dashed": true}, {"from": "l1", "to": "p1", "arrow": "none", "dashed": true}
 ]}
```

| 路线 | 原子性来自哪里 | 状态（2026-10-06） |
|---|---|---|
| [[shared sequencer]] | 多条链共享排序，一起打包 | Espresso 确认层在运行；Astria 2025-12 停机 |
| CIRC / Compose | coordinator 预填 inbox，L1 聚合证明检查 | 规范 / 原型，只针对 L2↔L2 |
| [[based rollup]]（Taiko 现状） | L1 排序，证明异步补交（窗口 4 小时） | 主网，但不提供 L1 同步 |
| ULTRA TX / SCOPE | 一笔 L1 交易装下全部，任何不一致就 revert | 设计、内部演示、提案 |
| EEZ | L1 合约核对执行表 + 同块消费 | 主网 1 笔起步（ECDSA） |
| OP interop | 无；引用无效消息的块被 reorg | Lagoon 硬分叉未定档 |
| AggLayer | 无跨链调用原子性；pessimistic proof 限制损失 | 主网，异步 |
| [[intents]] | solver 垫资，结果原子，过程异步 | 已在生产使用 |

两点容易混淆：
- **EEZ 不要求 L1 proposer 给 L2 排序。** README 写“based rollups sharing the same L1 sequencer”，但参考实现用自己的 sequencer 和 composer，再请 L1 builder 原子打包 [3][4]。它真正依赖的是“composer + 愿意原子打包的 builder”。
- **[[real-time proving]] 已接近 L1 区块的目标，但口径不同。** EF 报告 99% 的以太坊区块能在 10 秒内证完 [13]。这是“出块后证明 L1 区块”的数据，不是“出块前证明 L2 区块和跨链 witness”的数据。

```finding F6 high
# 带返回值的 L1↔L2 同步只有一族设计，EEZ 是唯一在主网跑通的
结论: EEZ、ULTRA TX、SCOPE 的结构相同：链下联合模拟，预计算结果带证明上链，L1 执行时比对，不一致就 revert。shared sequencer 只保证一起打包；OP interop、AggLayer 和 intents 都拿不到返回值。
证据: [observed] SCOPE 认为 L1↔L2 同步需要实时证明与 proposer 协调 [11]；ULTRA TX 的 master builder 设计 [12]；OP interop 需要两笔交易 [14]。[inferred] 截至 2026-10-06，只有 EEZ 有主网交易，且是签名证明；我们没有穷尽检索所有项目。
影响: Mantle 如果要做 L2↔L3 同步，参考 EEZ 的合约与节点设计最直接；其他路线解决的是另外的问题。
```

```finding F11 medium
# 原子加同步，并不自动保证中间状态不被插入
结论: [[non-interleaving]] 是单独的性质。EEZ 的回答是：同一 slot 内，sequencer 给 L1 和 L2 规定唯一的线性顺序，不允许交错。
证据: [observed] Péter Garamvölgyi 在 23426 和 23998 中提出这个问题 [1][2]；Jordi 回复由 sequencer 的总序加证明保证 [1]。
影响: 应用不能假设“跨链调用期间别人一定插不进来”，除非运营方明确承诺排序规则。
```

## N 生态意义与外部观点 {depth=2}
外部讨论里提到的用例，和现在有没有可运行的演示 [1][2][3][6]：

| 用例 | 谁提出 | 现在有没有演示 |
|---|---|---|
| 跨 rollup / L1↔L2 闪电贷 | ethresear.ch 23426；EEZ README | 有 e2e 脚本，用占位 root，本地或 devnet |
| 跨域套利、清算 | 23426；23998 回帖 | 没有 |
| L2 直接使用 L1 流动性 | GIP-153；Gnosis 博客 | 只有 mock lab，不含跨链调用 |
| deploy once、统一资产 | EEZ 发布文；GIP-153 | 没有 |
| 原子跨链 NFT 往返 | 23998 回帖 | 社区 POC |

**Gnosis 是第一个把它当成产品路线的链。** GIP-153 于 2026-08-19 通过：123,158 GNO 赞成，115 反对 [7]。GIP 原文写明首版的取舍 [6]：
- 证明用过渡方案，“likely TEE-based”，之后换实时 ZK；
- Gnosis Ltd 中心化运营 composer，forced inclusion 只是待评估选项；
- 上线时组合是**单向**的（atomic L2→L1 calls），双向、嵌套和实时 ZK 预计在 2027 年；
- “快速出块加同步可组合，目前只能在中心化下实现”。

**质疑集中在三点** [1]：
- builder 就是执行表的构造者，同步可组合会带来跨域 MEV；
- 同步交易可能被私有路由给少数 builder，并削弱 forced inclusion；
- 原子性对发送者怎么保证，以及 non-interleaving（见 F11）。

```finding F7 medium
# 外部看好的用例集中在统一流动性和闪电贷，目前都还没有生产级演示
结论: 一手表述集中在“L2 直接用 L1 流动性”“deploy once”“跨 rollup 闪电贷、套利、清算”。仓库里的闪电贷是用占位 root 的测试脚本，Uniswap lab 只是 mock；主网只有简单转账。
证据: [observed] 23426 列出的用例 [2]；GIP-153 写 mainnet 流动性可以直接调用 [6]；闪电贷 e2e 用占位 root [3]；DeployUniswapLab 不含跨链调用 [3]。[observed] GIP-153 首版单向、TEE、中心化 composer [6]。
影响: 评估 Mantle 方案时，不要假设这些用例已被验证；第一个原型应该自己证明一个具体业务。
```

## O 对 Mantle 的意义：L2 做流动性中心，L3 做应用 {depth=2}
**Mantle 现状** [18][19][21]：
- OP Stack，自 2025-09-16 起用 [[OP Succinct]] ZK 证明结算；
- DA 已迁到 Ethereum blobs；
- 原生 gas 代币是 MNT，出块间隔 2 秒；
- 单一排序器、私有交易池；已支持 EIP-1153；
- 官方文档和 2026 路线图里没有 L3 或同步可组合的条目。

把 EEZ 的“父链 = L1”换成“父链 = Mantle L2”，得到 Fig 7 的结构。以下映射是我们的设计推断，不是 Mantle 的计划。

```excalidraw q="EEZ 搬到 Mantle L2↔L3 时，每个部件放在哪一层？" read="蓝色是新增的 AS 部件；紫色是 L2 上已有的流动性；灰色虚线是 Ethereum。箭头标出谁调用谁。" takeaway="Mantle L2 是共同提交点和流动性中心；L3 只跑应用逻辑；L2 再按现有方式向 Ethereum 结算。" kind=架构
{"grid": {"w": 340, "h": 125}, "defaults": {"w": 200, "h": 62, "fontSize": 17},
 "nodes": [
   {"id": "eth", "label": "Ethereum", "col": 1, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "seq", "label": "L2 排序器 bundle", "col": 0, "row": 1, "color": "blue"},
   {"id": "mgr", "label": "AS manager + 代理", "col": 1, "row": 1, "color": "blue", "strokeWidth": 3},
   {"id": "liq", "label": "Vault / DEX / escrow", "col": 2, "row": 1, "color": "violet"},
   {"id": "comp", "label": "L3 composer + signer", "col": 0, "row": 2, "color": "blue"},
   {"id": "l3a", "label": "L3 launchpad", "col": 1, "row": 3, "color": "green"},
   {"id": "l3b", "label": "L3 其他 appchain", "col": 2, "row": 3, "color": "green"}
 ],
 "edges": [
   {"from": "mgr", "to": "eth", "label": "OP Succinct 结算", "dashed": true},
   {"from": "seq", "to": "mgr", "label": "batch"},
   {"from": "mgr", "to": "liq", "label": "真实调用"},
   {"from": "comp", "to": "seq", "label": "bundle"},
   {"from": "l3a", "to": "mgr", "label": "L3→L2 调用"},
   {"from": "l3b", "to": "mgr"}
 ],
 "boxes": [{"label": "Mantle L2", "around": ["seq", "mgr", "liq"], "pad": 20, "color": "gray"}]}
```

**关键观察**：用户想做的“L3 使用 L2 流动性”，是子链调用父链的方向。它对应 EEZ 的 L2→L1 路径（Fig 4）：L3 先拿到预计算的结果，L2 在 batch 里真实执行并核对。这也正是 GIP-153 首版唯一支持的方向 [6]。

三类资产模型，原子边界不同：

| 场景 | 资产放哪 | 原子边界 |
|---|---|---|
| L3 使用 L2 Vault / DeFi | 资金和 shares 留在 L2 的 adapter；L3 只记仓位 | 一个条目里：调 adapter → 拿到实际 shares → 更新 L3 仓位 |
| L3 使用 L2 抵押 | 抵押物锁在 L2 | 同一条目里锁定抵押并记债务；只读余额不够，用户之后能转走 |
| launchpad 毕业 | token 和募资 escrow 放在 L2；L3 跑曲线 | 一次 L3→L2 调用毕业 Router，Router 内建池、加 LP、锁 LP |

Fig 8 是 launchpad 毕业的推荐时序（设计推断）。多步 L2 动作收进一个 Router 后，只需要一次跨层调用。参考 signer 不支持嵌套，也不支持一个 effect 多个调用 [4]。这个结构正好落在它的支持范围里。

```uml q="L3 launchpad 毕业时，怎样把流动性原子地放进 L2 DEX？" read="设计推断，不是现有实现；L2 侧在同一个 L2 区块里执行。" takeaway="L3 的“已毕业”和 L2 的建池、加 LP 属于同一个条目；任何一步失败，两边都回滚。"
sequenceDiagram
  autonumber
  participant L as L3 launchpad
  participant C as L3 composer
  participant M as AS manager (L2)
  participant R as GraduationRouter (L2)
  participant D as L2 DEX
  L->>C: user tx: graduate(tokenId)
  C->>C: simulate L3 + L2, get pool and LP
  C->>M: bundle [batch, entry]
  M->>R: graduate via L3 launchpad proxy
  R->>D: release escrow, create pool
  R->>D: add liquidity, lock LP
  D-->>R: pool, LP amount
  R-->>M: real return data
  M->>M: CALL_END hash must match
  Note over L: L3 Sync block keeps "graduated" only if L2 accepts
```

```finding F8 high
# Mantle 最需要的“L3 调用 L2 流动性”，正好是 EEZ 最先支持的方向
结论: L3 调 L2 的 Vault、DEX 或毕业 Router，对应 EEZ 的子链调父链路径。Gnosis 首版只上线这个方向。把多步 L2 动作收进一个 Router，就能在当前 signer 的限制内完成。
证据: [inferred] 由 L2→L1 路径的执行方式 [3]（L2 先用预计算值，L1 用 CALL_END 核对）推出；[observed] GIP-153 首版是“atomic L2→L1 calls” [6]；[observed] signer profile 不支持嵌套与一个 effect 多调用 [4]。
影响: 第一个原型可以收窄为“单条 L3 + L2 上一个受限 Router + 一次 L3→L2 调用”，例如 launchpad 毕业或 Vault 建仓。
```

```finding F9 medium
# 移植到 Mantle 要先解决四个具体冲突
结论: (1) `etherDelta` 记账的会是 MNT；L3 不用 MNT 作 gas 时，跨层调用应禁止非零原生 value。(2) EEZL2 预部署在 `0x4200…0007`，与 OP Stack 的 `L2CrossDomainMessenger` 同址。(3) L2 上没有 blob 路径，L3 的 DA 大概率只能走 batch 的 `callData`。(4) 同块原子需要 Mantle 排序器提供 bundle 包含能力，证明窗口约 2 秒。
证据: [observed] 原帖：原生币不是 ETH 的 rollup 不得做非零 ETH value 的跨链调用 [1]；地址冲突 [4][20]；EEZ 的 L2 不接受 blob 交易 [4]；Mantle 单一排序器、2 秒出块 [19][21]。[inferred] 映射到 Mantle 后的四个结论。[speculative] Mantle L2 是否接受 blob 交易，没有找到一手来源。
影响: 先在 L3 genesis 里给 EEZL2 换地址，并把跨层原生 value 限制为 0；再和排序器团队确认 bundle 接口。
```

```finding F10 medium
# 共享流动性也共享风险入口
结论: L3 能同步调用 L2 Vault 后，被攻破的 L3 可以按协议规则动用代理在 L2 上持有的资产和 allowance。弱安全的 L3 不应默认获得无限额度。
证据: [observed] L2 合约看到的 `msg.sender` 是代理地址 [3]；rollup owner 能改 root、threshold 和 proof system [3]；公共输入不绑定 chainid 与 registry 地址 [3]。[inferred] 风险传导到 L2 资产。
影响: 按 L3、应用、资产分别设限额；把 chain ID、manager 地址和协议版本纳入验证域，防止跨部署重放。
```

**建议的行动顺序**（推断，供讨论）：
1. 选一个窄业务做原型：launchpad 毕业，或从 L2 escrow 建 Vault 仓位。只用一次 L3→L2 调用。
2. 用 ECDSA 或 TEE 过渡证明，并在产品上明确标为“可信原型”。
3. 在 L3 genesis 中重定位 EEZL2；跨层原生 value 先固定为 0，资产用 L2 上的 ERC-20 escrow 和 adapter。
4. 和排序器团队确认“batch + 用户交易”的同块 bundle 接口。
5. 做三组对照实验：
   - 成功与回滚；
   - 正常包含与恶意调度（删交易、换顺序）；
   - 正常运行与恢复（L2 重组、prover 超时、独立 follower 重建）。
6. 高频操作留在 L3 本地；只有毕业、建仓、赎回这类关键动作走同步路径。

```callout err WARNING
不要把 L3 上的仓位记录做成能独立赎回的代币。它和 L2 上的 shares 会变成同一笔资产的两份债权。
```

## P 局限与开放问题 {depth=2}
- **L2 侧没有核实。** rollup 1 的 chain ID、L2 浏览器和对应的 L2 交易没有公开入口；blob 里 142 字节的 L2 数据没有解码。
- **签名的公共输入没有复算。** 我们只确认链上 `verify` 通过，且当时只有一个签名人。
- **公开规范和主网栈版本不同。** rollup0 的 signer SPEC 要求不用 blob、不绑定 L1 区块；主网 batch 用了 blob，并绑定最新区块。所以 signer profile 的限制可能已经变化。
- **builder 未核实。** 首笔交易由哪个 L1 builder 打包、是否走私有通道，没有核实。
- **条目被跳过后的 L2 重组规则没有规范**（speculative）。
- **实时证明的数据口径不同**：公开基准都是 L1 区块、出块后证明，不能直接套到 2 秒的 Mantle 窗口。
- **Mantle 没有官方计划**做 L2↔L3 同步组合（speculative）；本文的 Mantle 部分都是设计推断。
- **二手来源**：首笔交易的官方推文只经二手报道转引；“Vitalik 2026-02 称 rollup-centric 不再成立”只有二手报道，本文没有采用。

## Q 方法与证据 {depth=3}
- 用户提供的资料：原始想法笔记、ChatGPT Deep Research 结果。后者只当线索，论断都追到原始来源。
- 调研分四册：机制（M）、交易解码（T，主会话）、路线对比（A）、生态与 Mantle（E）；另有主会话的综合判断（G）。台账共 207 行。
- 链上数据：Ethereum JSON-RPC（publicnode）、Blockscout API、Blobscan，访问于 2026-10-06。
- 源码：eez-core-protocol @`6ae4110`（2026-10-05），eez-rollup0 @`6ff63ec`（2026-10-02）。Blockscout 上的主网实现源码与 `6ae4110` 逐字节相同。
- 对 Deep Research 的修正：它列为“未核实”的交易细节（目标合约、proof 类型、是否同一交易）已全部核实；它漏掉了 GIP-153 的投票结果和“首版单向”的限制。

## R 复现 {depth=3}
安装 Foundry，然后运行：

```sh
export ETH_RPC_URL=https://ethereum-rpc.publicnode.com
M=0x4b2760f84b83d6b3829e30a7573b0172b6d6402c
U=0xceaf908c05b277e92e89b51b281ec76305b9a141
# 1. 代理代表 rollup 1 上的 0xceaf…
cast call $M "computeCrossChainProxyAddress(address,uint64)(address)" $U 1
# 2. 复算 proxyEntryHash
cast keccak $(cast abi-encode \
  "f(bool,address,uint64,address,uint64,uint256,uint64,bytes)" \
  false $U 0 $U 1 1000000000000000 0 0x)
# 3. 证明配置
cast call 0x1Ac760d5c985c635C18a3e5D9C5685f1ef2a721E "signer()(address)"
cast call 0xb3fb7a12f1CfaA51Fa39246cF17205872cA156d0 "threshold()(uint256)"
```

预期输出：
1. `0x3c1837F7c48EdC0F8cb172D3C7fb9884F00FF7C8`
2. `0x28467651c9b1080f0acec5cd3bf6801fd1540d0a49f5a34bf3770a16dd580fc4`
3. `0xa86e00C06c259e896cF07b622C053fad0D4Fa15E` 和 `1`

## S 术语表 {depth=2}
```glossary
同步可组合 | synchronous composability | 一笔交易里调用另一条链的合约，并在同一执行上下文拿到返回值。 | 不是“消息传得快”
原子性 | atomicity | 相关链上的状态变化一起提交，或者一起回滚。 | 不等于同一区块打包
non-interleaving | 不交错执行 | 跨链调用的中间状态不会被其他交易插入或观察。 | 原子和同步都不自动保证它
最终性 | finality | 结果不会再因 L1 重组而消失。AS 的最终性不会快于 L1。 | 证明通过不等于 finalized
EEZ | Ethereum Economic Zone | Gnosis 与 ZisK 发起、EF 出资的 L1↔L2 同步组合框架。 | 不是一条新 L2
composer | 组合器 | 链下组件：模拟 L1 与 L2，生成执行表和 Sync block，组装并提交 batch。 | 不是 L1 builder
execution table | 执行表 | composer 预先算好的执行条目列表，由 batch 发布到 L1。
execution entry | 执行条目，ExecutionEntry | 一段跨链执行片段：前置 root、真实调用、调用轨迹 hash、后置 root、返回值。 | 不是一条普通消息
L2Tx 条目 | anchor | `proxyEntryHash` 为 0 的条目。不需要代理调用，在 batch 里直接执行。
CrossChainProxy | 跨链代理 | 代表“rollup R 上地址 X”的 CREATE2 合约。调用它就是发起跨链调用。 | 目标看到的 `msg.sender` 是代理
proof system | 证明系统 | 实现 `verify(proof, publicInputsHash)` 的合约。现在主网用 ECDSA 签名。 | ECDSA 不检查执行正确性
signer | 签名人 | 重执行区块后对公共输入签名的链下服务，现阶段代替 ZK prover。
rolling hash | 滚动哈希 | 执行时按顺序把调用身份、返回值、嵌套边界折进一个 hash，最后与条目比对。
etherDelta | ETH 净变化 | 条目对某条 rollup 的 ETH 记账变化，必须等于实际的 ETH 净流量。 | 搬到 Mantle 后记的是 MNT
Sync block | 同步块 | 承载跨链工作的 L2 区块，每个父链区块一个。父链没确认就回滚。 | Live block 不含跨链工作
系统交易 | 0x76 native system transaction | 参考 L2 新增的无签名交易类型，用来装表和投递入站调用；gas price 为 0。
bundle | 原子打包 | 交给 builder 的一组交易，要求按顺序进同一区块，全有或全无。
deriver | 派生器 | 只读父链数据就能重建子链状态的组件。
based rollup | 基于 L1 排序的 rollup | 由 L1 proposer 决定 L2 交易顺序的 rollup。 | EEZ 参考实现并不依赖它
shared sequencer | 共享排序器 | 多条链共用的排序服务。保证一起打包，不保证执行结果和返回值。
real-time proving | 实时证明 | 在一个出块间隔之内生成有效性证明。
intents | 意图 | 用户声明想要的结果，由 solver 垫资完成，事后结算。结果原子，过程异步。
OP Succinct | OP Succinct | 用 ZK 证明为 OP Stack 链提交状态根的方案，Mantle 自 2025-09 使用。
```

## T 参考资料 {depth=2}
1. [Synchronous Composability Between Rollups via Realtime Proving](https://ethresear.ch/t/synchronous-composability-between-rollups-via-realtime-proving/23998) — Jordi Baylina，2026-02-02，含回帖。EEZ 的设计原文。**PRIMARY**
2. [Synchronous Composability vs Intents](https://ethresear.ch/t/synchronous-composability-vs-intents-two-paths-to-ethereum-wide-interop/23426) — Alon Muroch，2025-11-11。用例清单与 non-interleaving 讨论。**PRIMARY**
3. [eez-core-protocol @6ae4110](https://github.com/eez-association/eez-core-protocol/tree/6ae4110fb748fd10882d5afea576fbd1a5c38fc3) — L1 / L2 合约、规范与 CAVEATS。读 `docs/CORE_PROTOCOL_SPEC.md` 和 `docs/CAVEATS.md`。**PRIMARY**
4. [eez-rollup0 @6ff63ec](https://github.com/eez-association/eez-rollup0/tree/6ff63ecd7fef61e4826236a11a5d7e172fa6c368) — 参考节点：composer、signer、deriver、`0x76` 系统交易。**PRIMARY**
5. [区块 26127444 的两笔交易](https://eth.blockscout.com/tx/0xd0cbfef7df37b362839d7bf91a91bccc09b1510625919b7bcdaa291153920a02) — 用户交易；验证交易为 [0x82ee73bd…](https://eth.blockscout.com/tx/0x82ee73bd577bb5938a7cbb2f4b09c4ad500fc368c8fd21896100c70fcb1eaf67)。**PRIMARY**
6. [GIP-153](https://forum.gnosis.io/t/gip-153-should-gnosis-chain-transition-into-the-ethereum-economic-zone/12397) — Gnosis Chain 转为 EEZ rollup 的提案，写明首版取舍。**PRIMARY**
7. [Gnosis DAO Community Summary, August 2026](https://gnosisdao.ghost.io/gnosis-dao-community-summary-august-2026/) — GIP-153 投票结果。**PRIMARY**
8. [Introducing the Ethereum Economic Zone](https://eez.io/blog/introducing-the-eez) — EEZ 发布文，2026-03-29。**PRIMARY**
9. [EEZ Monthly Update, August 2026](https://eez.io/blog/monthly-update-august-2026) — Rollup 0 的进展。**PRIMARY**
10. [ETH Daily: EEZ Executes First Mainnet Transaction](https://ethdaily.io/eez-executes-first-mainnet-l1-to-l2-transaction) — 首笔交易的公告转引（二手）。
11. [SCOPE: Synchronous Composability Protocol for Ethereum](https://ethresear.ch/t/22978) — Jason Vranek，2025-08-25。L1↔L2 同步的前提条件。**PRIMARY**
12. [ULTRA TX & Gwyneth](https://paragraph.com/@taiko-labs) — Taiko Labs，2025-11-11。master builder 设计。**PRIMARY**
13. [EF 博客：Shipping an L1 zkEVM](https://blog.ethereum.org/) — 2025-07-10 实时证明定义；2025-12-18 进展与安全里程碑。**PRIMARY**
14. [OP Stack interop 规范](https://specs.optimism.io/interop/overview.html) — 跨链消息需要两笔交易。**PRIMARY**
15. [Possible futures of the Ethereum protocol, part 2: The Surge](https://vitalik.eth.limo/general/2024/10/17/futures2.html) — Vitalik，2024-10-17。**PRIMARY**
16. [Espresso 文档](https://docs.espressosys.com/network) — 确认层不执行交易。**PRIMARY**
17. [Taiko proving system](https://docs.taiko.xyz/protocol/proving-system) — 证明异步补交，窗口 4 小时。**PRIMARY**
18. [Mantle OP Succinct 主网升级公告](https://docs.mantle.xyz/network/introduction/updated-notices/mantle-op-succinct-mainnet-upgrade-and-withdrawal-period-transition.md) — 自 2025-09-16 用 ZK 证明。**PRIMARY**
19. [Mantle Architecture](https://docs.mantle.xyz/network/system-information/architecture.md) — 单一排序器、私有交易池、blob 提交。**PRIMARY**
20. [OP Stack Predeploys](https://specs.optimism.io/protocol/predeploys.html) — `0x4200…0007` 是 `L2CrossDomainMessenger`。**PRIMARY**
21. [Mantle Tectonic 升级公告](https://www.mantle.xyz/blog/announcements/mantle-completes-mainnet-v2-tectonic-upgrade) — 2 秒出块。**PRIMARY**

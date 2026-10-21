---
template: research
title: EIP-8288 深度解析：递归 STARK mempool、AggLayer 对照与递归证明安全之争
subtitle: 8288 把验签变成由 mempool 递归聚合的区块“依赖”；AggLayer 只共享“证明里验证证明”这一手段；递归的安全性有理论缺口，但没有已知攻击。
cols: 4
type: 技术调研 · 机制解析 · 争论梳理 · PQ 专题延伸篇
audience: 开发者与研究者：懂 EVM，知道 ZK 证明是什么，没跟过 EIP-8288、AggLayer 和递归证明安全性的讨论
scope: EIP-8288 的设计与草案现状；支持者论点的前提；AggLayer 的证明组合与对比；Justin Thaler（a16z）对递归证明的批评与反方证据
evidence: 166 条论断台账（三路调研 + 论文全文复核 + 主会话）；EIP 原文 @5a4387b 与提交历史、agglayer 源码 @9f8e6c4、leanVM @3a37fb6、Aerie @49b6c21、SP1 文档、9 篇论文全文（ePrint 经 Internet Archive 快照）、四条推文原文；访问于 2026-10-21
date: 2026-10-21 · v1
---
结论先行，分四点：

1. **EIP-8288 不是新的签名算法。** 它给帧交易加一种“只声明、不执行”的[[依赖帧]]。签名留在链下，mempool 节点每秒把它们递归聚合，区块只带一个 STARK（[F1](#F1)）。当前草案只接受 leanSPHINCS 一种签名（[F4](#F4)）。
2. **支持者说“节点越多，容量越大”。** 规范里没有分工和激励机制。mode 1 wrapper 还写着最多 16 个签名的上限，和“一个 wrapper 覆盖全部交易”字面冲突（[F6](#F6)）。
3. **AggLayer 只在一点上相似：** 它在 SP1 里“用证明验证证明”。但它在应用层只有一层直接组合（不算 SP1 内部递归）。它逐链、逐证书结算，上链用 PLONK/BN254，不是多方递归（[F9](#F9)、[F10](#F10)）。
4. **Thaler 对递归的批评有文献支持。** 8288 设想的是实用、简洁的哈希型递归。这类系统在普通随机预言机模型里目前没有已知安全证明；8288 自己也把它列为信任假设（[F11](#F11)）。但本次核对的 KRS/Fenzi 型攻击，都需要攻击者决定被证明的计算（自造电路，或提交程序）。当前交易规则只接受 leanSPHINCS，用户提交程序的证明不是已启用的功能；聚合伪代码里的 leanSTARK 分支还要等最终电路确认。本次调研没有找到可利用漏洞（[F12](#F12)、[F13](#F13)）。

## A 三个问题，三个答案 {sheet meta="研究问题"}
```tree list
EIP-8288 是什么 | 给 8141 加依赖帧，区块带一个递归 STARK
  已写进规范 | 依赖帧、wrapper、每秒递归、区块头证明
  还是愿景 | 任意签名 STARK 化、隐私降本、私有 AA、ISA
AggLayer 像不像 | 只像“证明里验证证明”
  不同之处 | 应用层一层组合、逐链结算、非 PQ
递归安全吗 | 有理论缺口，没有已知攻击
  理论 | 实用的简洁递归在普通 ROM 中尚无已知证明；标准提取只撑常数深度
  攻击 | 所核对的 FS 攻击要攻击者决定被证明的计算；未见这类攻击针对固定电路 STARK 递归
  对 8288 | 未见可利用漏洞；开放 leanSTARK 后要重看
```

## B 关键数字 {sheet span=2 meta="规范 @5a4387b 与作者自报"}
| 量 | 值 |
|---|---|
| 每条依赖 | 96 B 声明；leanSPHINCS 约 33,000 gas（3,000 + 30,000） |
| 聚合间隔 | 规范 1,000 ms（Vitalik 推文举例 500 ms） |
| builder 每个间隔的 STARK 开销 | 约 256 kB（推文：100–300 kB） |
| 上限 | 每交易 ≤ 16 个签名、≤ 1 个 STARK；mode 1 wrapper 同样 ≤ 16 / 1 |
| leanVM 聚合 850 个 leanSPHINCS | 1.0 s，峰值 16.1 GiB，证明 325.8 KiB（M4 Max） |
| leanVM 2→1 递归 | 0.291 s，14.7 GiB，201.5 KiB |
| Aerie 聚合 32,768 个 Falcon-512 | 645 ms，单个证明，不递归 |
| leanVM 安全声明 | README：128 位 ROM / 64 位 QROM；EIP-8292：约 124 / 62 位 |

## C 愿景与草案 {sheet meta="Vitalik 推文 vs 规范"}
| Vitalik 的说法 | 草案现状 |
|---|---|
| 签名不上链，每条声明 96 B | ok 已写入 |
| 每个 tick 递归，builder 是“又一个节点” | ok 已写入（1,000 ms） |
| 任意签名在客户端包成 STARK | no leanSTARK 是保留值 |
| 隐私交易降到“低几万 gas” | no 同上；按定价 60,000 gas/条 |
| 约定 ISA（首选 RISC-V） | warn 规范未提，仍在讨论 |
| 私有 AA | no 规范未提 |
| 进入 I-star 分叉 | warn 作者期望；不在 Hegotá |

## D 8288 vs AggLayer {sheet span=2 meta="速查"}
| 维度 | EIP-8288 | AggLayer |
|---|---|---|
| 组合什么 | 交易的签名 / 证明依赖 | 一条链一次证书的状态转换 |
| 谁、何时组合 | mempool 节点每秒；builder 出块时 | AggLayer 节点收到证书后，外包给 SP1 网络 |
| 递归深度 | 结构上不限 | 应用层固定一层 |
| 跨主体合并 | ok 有 | no 逐链、逐证书 |
| 最终验收 | 全部验证节点（区块有效性） | L1 合约，只有 trusted aggregator 能提交 |
| 抗量子 | 哈希型 | no PLONK/BN254 + ECDSA |
| 状态 | Draft | 主网运行（2025-02 起） |

## E 递归之争：三层判断 {sheet span=2 meta="证据强度"}
| 层次 | 判断 | 主要依据 |
|---|---|---|
| 理论模型 | warn 有缺口：实用的简洁递归在普通 ROM 中尚无已知安全证明 | ePrint 2024/728、BCCT13；8288 与 leanerVM 自己也承认 |
| 已知攻击 | warn 所核对的 KRS/Fenzi 型攻击都要攻击者决定被证明的计算；目标是 GKR 类与针对“由程序生成的实例”的 IOP（含 Aurora/STIR 型哈希 IOP）；未见这类攻击针对固定电路 STARK 递归 | ePrint 2025/118、2026/1838 |
| 8288 可利用漏洞 | ok 未发现 | 交易规则只接受 leanSPHINCS；聚合伪代码的 leanSTARK 分支待最终电路确认 |
| 工程实现 | warn 其他 zkVM 的递归聚合出过实现 bug | ZisK、SP1 安全公告 |

## F 时间线 {sheet span=2 meta="2013–2026"}
```timeline
2013 | BCCT13 | 递归提取只撑常数深度
2024-05 | ePrint 2024/728 | 普通 ROM 中不存在相对化的简洁论证
2025 | ePrint 2025/118（KRS，CRYPTO 2025） | 对 GKR 类 Fiat–Shamir 的具体攻击
2025-02-03 | AggLayer pessimistic proof 上主网 | 证明里验证证明
2026-09-09 | EIP-8288 合入；Vitalik 发推 | “recursive STARK mempools”
2026-10-07 至 10-15 | 规范连续修订 | mode 4、gas 改由交易付、并集检查、零 data_hash
2026-10-16 | a16z 发布 Aerie | 格聚合，不递归
2026-10-19 | Vitalik：“8288 maximalism” | 不再新增预编译
*2026-10-21 | Thaler 长文 | “真正的争论是递归”
```

## G 结论 {sheet span=4}
```callout ok 8288 的价值在“把验证依赖显式化、让网络分担证明”；它的风险集中在一条没被证明的递归假设和一份还没写完的草案
- 机制：依赖帧只声明、不执行；mempool 每秒递归聚合；区块只验一个 STARK；账户自己判断“这条依赖是不是我的授权”（F1、F2）。
- 现状：只接受 leanSPHINCS；`AGGREGATED_VK`、`DEPS_HASH`、参考实现都是 TBD；不在 Hegotá（F3、F4）。
- 支持者论点：“验证者只验一个证明”成立；“证明带宽恒定”只对证明部分成立；“节点越多容量越大”缺少分工、激励和吞吐数据（F5、F6、F7）。
- AggLayer：只共享“在 SP1 里验证另一份证明”这一原语；逐链结算、trusted aggregator 提交、非 PQ（F9、F10）。
- 递归之争：理论缺口真实，且双方文本都承认；所核对的攻击要攻击者决定被证明的计算；没有找到对 8288 的可利用漏洞；Aerie 同样依赖随机预言机模型（F11–F14）。
- 从哪里读：机制看 K–M，AggLayer 看 N，递归之争看 O，评估清单看 P。
```

## H 如何阅读 {depth=1}
```callout info 系列导航
本篇是后量子专题的延伸篇。哈希签名与格签名的原理、XMSS + leanVM 与 Falcon + Aerie 的基准口径，见上一篇[《后量子签名选型》](/p/pq-signature-selection/)。本篇不重复这些内容，只深挖 EIP-8288 本身、AggLayer 对照和递归证明的安全争论。
```

```callout info 默认你已知道（本文不解释）
- 私钥签名、公钥验证；以太坊交易进入 mempool，再由 builder 打包
- 哈希函数把任意数据压成固定长度的指纹
- ZK 证明能让验证者不重做计算，就相信“某个计算结果正确”
- 量子计算机会破坏椭圆曲线签名，所以 Ethereum 在找后量子（PQ）签名
- gas 是 EVM 计算与数据的计价单位
```

- **5 分钟**：读导语和总览 A–G。
- **30 分钟（开发者）**：读[前置知识](#panel-J)、[8288 怎样工作](#panel-K)、[mempool 递归聚合](#panel-L)、[AggLayer](#panel-N)。
- **30 分钟（研究者）**：读[前置知识](#panel-J)、[递归证明安全之争](#panel-O)、[评估清单](#panel-P)。
- **要复核的人**：再读[方法与证据](#panel-R)和[复现](#panel-S)。

**贯穿全文的例子**：Alice 用 leanSPHINCS 账户给 Bob 转 1 ETH。同一秒里，节点 A 收到 Alice 和 Charlie 的交易，节点 B 收到 Bob 的交易。builder 最后只打包 Alice 和 Bob。这个例子按规范构造，不是真实交易编码。

## I 背景动机 {depth=2}
**问题。** 后量子签名约 2–3 kB，链上验证约 15–20 万 gas；客户端生成的 STARK 有 128–512 kB [1]（E 系列规范 Motivation）。如果每笔交易都把这些数据放进区块、让每个节点逐个验证，PQ 交易和隐私交易都会很贵。

**为什么现在。**
- 2026-09-09，Vitalik 发推介绍 EIP-8288，希望它进入 Hegotá 之后的 I-star 分叉 [6]（C2）。decentrek 随后两次发推解读，称它是“my new favorite EIP of all time”[8][9]（C3）。
- 2026-10-16，a16z 发布 Aerie：用格型 SNARK 单机聚合 Falcon 签名，不用递归 [16]（C1）。
- 2026-10-21，a16z 的 Justin Thaler 发长文，认为真正的争论“is not lattices vs. hashes — it is lattices vs. building everything on SNARK recursion”，并点名 8288 [10]（C4）。
- 同时有说法称 AggLayer 也在做类似的事。我们在给出的四条推文里没有找到这个说法的出处（G42，推测）。

**范围。**
- EIP-8288 的机制、草案现状与修订历史；
- 支持者论点各自的前提；
- AggLayer 的证明组合，以及与 8288 的对比；
- 递归证明的安全争论：理论、已知攻击、对 8288 的影响。

**非目标。**
- 哈希签名与格签名的原理（见上一篇）；
- 独立复现基准；
- 密码学定理的完整推导；
- 投资建议，或对任何公司的建议。

**判断标准（先于结论定下）。** 每个论点都按三层分开判断：
1. 规范或源码里写了什么（observed）；
2. 由这些事实能推出什么（inferred）；
3. 哪些只是愿景或担忧，没有证据能检验（speculative）。

**已有资料的不足。** 外部调研（ChatGPT Deep Research）框架正确，但没读到推文原文。它还漏了四处细节：
- mode 1 wrapper 的 16 条上限；
- 10 月的规范修订；
- SP1 自己写明的递归安全假设；
- leanVM 形式化项目对递归提取的表态。

修正清单见[面板 R](#panel-R)。

## J 前置知识 {depth=2}
```excalidraw q="读懂 8288 和递归之争，要先懂哪些概念？按什么顺序？" read="灰色虚线框是默认已知；蓝框是下面的卡片；绿框是本文主题。箭头表示先学 → 后学。" takeaway="B-1 讲 8288 的载体；B-2 讲递归；B-3、B-4、B-5 是读懂递归安全之争必须的三个概念。" name=prereq-map kind=前置知识地图
{"grid": {"w": 290, "h": 105}, "defaults": {"w": 220, "h": 62, "fontSize": 17},
 "nodes": [
   {"id": "hs", "label": "哈希函数（已知）", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "zk", "label": "ZK 证明（已知）", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "tx", "label": "交易与 mempool（已知）", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b3", "label": "B-3 Fiat–Shamir 与 ROM", "col": 1, "row": 0, "color": "blue"},
   {"id": "b2", "label": "B-2 STARK 与递归", "col": 1, "row": 1, "color": "blue"},
   {"id": "b1", "label": "B-1 帧交易 8141", "col": 1, "row": 2, "color": "blue"},
   {"id": "b4", "label": "B-4 知识可靠性与提取器", "col": 2, "row": 0, "color": "blue"},
   {"id": "b5", "label": "B-5 IVC 与 PCD", "col": 2, "row": 1, "color": "blue"},
   {"id": "top", "label": "8288 与递归之争", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "hs", "to": "b3"}, {"from": "zk", "to": "b2"}, {"from": "tx", "to": "b1"},
   {"from": "b3", "to": "b4"}, {"from": "b2", "to": "b5"}, {"from": "b4", "to": "b5"},
   {"from": "b5", "to": "top"}, {"from": "b1", "to": "top"}
 ]}
```

```prereq B-1 l2 3min
# 帧交易（EIP-8141，Frame Transaction）
what: 把一笔交易拆成多个“帧”，每帧有一个 mode：VERIFY 帧做验证并批准付费，SENDER 帧以发送者身份执行。账户自己写验证逻辑，所以换签名算法不需要硬分叉。合约可以用 `FRAMEPARAM` / `FRAMEDATACOPY` 读同一交易里其他帧的内容。
why: 8288 就是给 8141 加一种 mode 4 的帧。8141 已排进 Hegotá，8288 没有 [3][5]（E26）。
misconception: 误解：8141 自带 PQ 签名。事实：8141 只提供框架，算法由账户选。
deeper: [3] EIP-8141
```

```prereq B-2 l1 4min
# STARK 与递归证明
what: STARK 是只依赖哈希、不需要可信设置的证明系统。“递归”是在一个证明里验证另一个（或多个）证明，于是很多证明可以逐层合成一个，大小基本不变。
why: 8288 的全部扩容来自递归：mempool 节点把别人的证明当输入，再证明“它们都有效”[1]（E13）。
example: leanVM 2→1 递归：两个子证明合成一个，0.291 s，输出 201.5 KiB，验证约 6 ms [14]（C11）。
misconception: 误解：递归只是把文件打包。事实：外层电路真的运行了内层验证器，包括内层的哈希计算。
deeper: [14] leanVM README “recursion”一节
```

```prereq B-3 l1 5min
# Fiat–Shamir 变换与随机预言机模型（ROM）
what: 交互式证明里，验证者要发随机挑战。Fiat–Shamir 把挑战换成“对到目前为止的记录求哈希”，证明就能离线发送。分析它的安全性时，通常把哈希当成理想的随机黑盒，这就是随机预言机模型（ROM）。
why: leanVM 声称 ROM / QROM 下的可靠性，Aerie 在经典 ROM 中证明了知识可靠性 [14][17]（R9、R10）。ROM 里各方只能“查询”哈希预言机；普通电路里没有它的具体实现可以计算。递归电路偏偏要计算内层哈希，这是 Thaler 批评的起点 [10]。
example: 挑战 $c = H(\text{statement}, \text{transcript})$。ROM 假设 $H$ 的输出完全随机；真实系统用 BLAKE2s 或 Poseidon2。
misconception: 误解：ROM 证明等于真实世界的证明。事实：CGH 构造出了在 ROM 中安全、换成任何具体哈希都不安全的签名与加密方案 [24]（R16）。2025 年起，针对自然、已部署协议（GKR 类）的同类攻击也出现了 [28]（R17）。
deeper: [27] ePrint 2024/728 §1
```

```prereq B-4 l1 5min
# 知识可靠性（knowledge soundness）与提取器
what: 可靠性只要求“假命题过不了验证”。知识可靠性要求更多：证明者只要能让验证者接受，就存在一个“提取器”。提取器能从证明者那里取出见证，例如签名本身。
why: 签名聚合必须用知识可靠性。“某公钥对某消息存在有效签名”经常本来就是真命题，关键是证明者真的拿到了签名 [17]。递归时，提取器要一层层往下取，开销会叠加 [25]（R28）。
example: 标准模型下，提取器由知识假设保证存在，每层规模多项式膨胀，d 层后约为 $n^{c^d}$ [26]（R29）。straightline 提取器只读证明者的哈希查询记录，不重跑证明者，所以没有这种膨胀。
misconception: 误解：“提取开销大”等于“有攻击”。事实：它是证明技术的损失，不是攻击成功率（R29）。
deeper: [26] ePrint 2023/1646 §1、§2.1
```

```prereq B-5 l2 3min
# IVC 与 PCD
what: IVC（可增量验证计算）是一条链：每一步证明“上一步正确，且我这一步也正确”。PCD（携带证明的数据）把它推广到树和图：互不信任的多方各出证明，再合并。
why: 8288 的 mempool 聚合树就是 PCD 的形态。递归安全文献讨论的“深度”，就是这棵树的高度（R6）。
deeper: [26] ePrint 2023/1646
```

## K EIP-8288 怎样工作 {depth=2}
**它是什么。** EIP-8288 标题是“In-mempool signature and proof aggregation”，作者是 Vitalik Buterin 与 Thomas Coratger，状态 Draft [1]（E1）。2026-09-09 首次合入，到 10-15 共有 10 次提交 [2]（E2）。

图 2 对比“在 EVM 里逐笔验签”和 8288 的做法。

```excalidraw q="8288 把验签的成本从哪里挪到了哪里？" read="上排是今天的直观做法：签名进区块，每个节点在 EVM 里逐笔验。下排是 8288：交易只带 96 B 声明，签名在 mempool 里被递归聚合。红色是被挪走的成本，绿色是全网最终要做的事。" takeaway="8288 没有取消验证，而是让 mempool 节点和 builder 先做重活；全网节点只验一个区块证明。" kind=前后对比
{"grid": {"w": 270, "h": 120}, "defaults": {"w": 220, "h": 66, "fontSize": 16},
 "nodes": [
   {"id": "a1", "label": "预编译路线：\n用户签名", "col": 0, "row": 0, "color": "blue"},
   {"id": "a2", "label": "交易带 3–5 KB\n签名进区块", "col": 1, "row": 0, "color": "red"},
   {"id": "a3", "label": "每个节点在 EVM\n里逐笔验签", "col": 2, "row": 0, "color": "red"},
   {"id": "b1", "label": "8288：\n用户签名", "col": 0, "row": 1, "color": "blue"},
   {"id": "b2", "label": "交易只带\n96 B 声明", "col": 1, "row": 1, "color": "green"},
   {"id": "b3", "label": "mempool 每秒\n递归聚合", "col": 2, "row": 1, "color": "blue"},
   {"id": "b4", "label": "全网只验\n1 个区块 STARK", "col": 3, "row": 1, "color": "green"}
 ],
 "edges": [
   {"from": "a1", "to": "a2"}, {"from": "a2", "to": "a3"},
   {"from": "b1", "to": "b2"}, {"from": "b2", "to": "b3"}, {"from": "b3", "to": "b4"}
 ]}
```

**Alice 的交易长什么样。** 依赖帧里的每条声明是一个 96 字节三元组 `(scheme, data_hash, verification_key_hash)`，每帧 1–256 条 [1]（E4）。对 leanSPHINCS，第三个字段直接放 32 字节公钥 [1]（E5）。

```text title="Alice 的帧交易（按规范 Test Case 1 构造的示意）"
帧0  mode=4 依赖帧：(0x10, 32 个零字节, Alice 的 leanSPHINCS 公钥)
帧1  VERIFY：检查存在一条依赖 = (0x10, 32 个零字节, sload(0) 里的公钥)
帧2  SENDER：转 1 ETH 给 Bob
```

`data_hash` 写成全零，表示“本交易的签名哈希”。交易不能在帧里写自己的签名哈希，因为这个哈希覆盖了帧数据本身。提取依赖、生成证明时，零字节被替换成签名哈希；帧数据本身不变，`FRAMEDATACOPY` 读出的仍是零。所以 VERIFY 帧检查的是零字节。这条规则是 10-15 才加进规范的 [1][12]（E8、E9）。

图 3 是这笔交易从钱包到区块的完整路径。

```uml q="Alice 的交易怎样从钱包走到区块？谁在什么时候验证了什么？" read="依据规范的 mempool、FOCIL 与区块有效性章节整理，简化为两跳 mempool。例子里节点收到签名后改用 mode 1 转发，builder 已经有交易正文；规范也允许节点用 mode 0 直接拼接签名转发。Charlie 的交易没被打包，所以 builder 把它的依赖丢弃。" takeaway="在这个例子里，原始签名只在第一跳出现，之后传播的是递归 STARK。验证节点看不到 Alice 的签名，只验一个区块证明，再照常执行账户逻辑。"
sequenceDiagram
  autonumber
  participant W as Alice 钱包
  participant A as 节点 A
  participant B as 节点 B
  participant BD as builder
  participant N as 验证节点
  W->>A: mode 0 wrapper：交易 + 原始签名
  A->>A: 逐个验签，与 Charlie 的交易合并
  A->>A: 每 1,000 ms 生成递归 STARK P_A
  B->>B: 同理生成 P_B（Bob）
  A->>BD: mode 1 wrapper：交易哈希 + P_A
  B->>BD: mode 1 wrapper：交易哈希 + P_B
  BD->>BD: 选 Alice、Bob；丢弃 Charlie 的依赖
  BD->>BD: 再递归一次，得到区块证明
  BD->>N: 区块（头里带 recursive_stark）
  N->>N: 从交易重算依赖摘要，验证 STARK
  N->>N: 执行帧1：检查依赖与公钥
  N->>N: 执行帧2：转账
```

**递归电路做什么。** 下面是规范原文的伪代码。它只做四件事：验证直接依赖；用同一个 `AGGREGATED_VK` 验证子证明并合并依赖；按 `discards` 删除；去重后与公开输入比对 [1]（E13）。

```python src=research/references/eip-8288@5a4387b.md lines=168-202 hl=184-191
```

电路不理解交易和区块，只看一份扁平的三元组列表 [1]（E13）。规范写明：把 `AGGREGATED_VK` 作为证明的输入，是为了支持“unlimited-depth recursion”[1]（E14）。

**区块怎样被验证。** 区块头新增字段 `recursive_stark = [stark_proof, block_deps_hash]`。证明本身不带依赖列表；验证节点从区块交易重算 `block_deps_hash`，再用固定的 `AGGREGATED_VK` 验证 [1]（E11）。所以 builder 不能放进 Alice 的交易，却偷偷删掉她的依赖。

```finding F1 high
# 8288 把验签变成“区块有效性条件”，不是 EVM 里的一次调用
claim: 依赖帧（mode 4）不执行 EVM 代码，只声明需要成立的三元组。区块要有效，区块头里的递归 STARK 必须证明全块依赖（去重后）都成立。mempool 节点、FOCIL 生成者和 builder 做的是“exactly the same task”：验证输入、合并、丢弃、再证明。
evidence: [observed] EIP-8288 依赖帧、区块有效性与 builder 章节 [1]（E3、E11、E13、E21）。
implication: 依赖在 EVM 执行之前就可见。规范的理由是：mempool 不用先执行合约才发现缺了一份证明，依赖也不会因为执行回滚而消失。
```

```finding F2 high
# 证明只说“这个公钥签过这个哈希”，授权判断留给账户
claim: 聚合电路只证明三元组成立。账户要在 VERIFY 帧里用 `FRAMEPARAM` / `FRAMEDATACOPY` 读出依赖，自己比对公钥和 `data_hash`。规范的 Test Case 1 就是这样写的。
evidence: [observed] 规范的执行可见性一节与 Test Case 1 [1]（E9）。[inferred] 授权绑定由账户代码负责（E10）。
implication: 写账户合约的人不能省掉这一步。攻击者对“hello”的合法签名也能通过聚合，但不能因此获得 Alice 的权限。
```

```finding F3 high
# 一条 leanSPHINCS 依赖约 33,000 gas，按声明定额收，回滚也收
claim: 依赖帧的执行 gas 是每条 3,000（leanSPHINCS）或 30,000（leanSTARK）。另外每条声明（重复也算）按 30,000 计入 intrinsic gas。合计一条 leanSPHINCS 约 33,000 gas，还没算 96 B 的数据费。首版草案曾把这笔费用按全块依赖数计入 base fee，10-07 改为由交易承担。
evidence: [observed] Gas Accounting 一节与提交 9ee171b [1][2]（E23、E25）。[inferred] 33,000 的合计与“定额、不按区块分摊”（E24）。
implication: 规范自己说这是“expected cost”，不是测量值。“每个签名 3,000 gas”的说法漏了大头。
```

```finding F4 high
# 当前草案只接受 leanSPHINCS；关键常量与参考实现都是 TBD
claim: 每条依赖的 scheme 必须是 `LEANSPHINCS_SCHEME`（0x10）。`LEANSTARK_SCHEME`（0x11）是保留值，在 `get_deps_hash` 为它定义之前使用即无效。`AGGREGATED_VK`、`DEPS_HASH` 和参考实现都写着 TBD。8288 不在 Hegotá 的任何一栏。
evidence: [observed] 常量表、有效性约束与 Reference Implementation [1]（E6、E15）；EIP-8081 [5]（E26）。
implication: 今天能被 8288 原生聚合的只有一种哈希签名。“任意签名或证明”的那一半还没有规范。
```

## L mempool 递归聚合：支持者的论点成立吗 {depth=2}
**每个节点怎么做。** 每 1,000 ms，节点生成一个 mode 1 wrapper，覆盖所有仍有效的交易，并转发给 peer；已经发过的交易只发哈希 [1]（E18）。证明时间不够时，按这个顺序取舍 [1]：
1. 自己上一轮的聚合；
2. 要删除的项；
3. 其他节点的聚合（按新增交易数）；
4. 用户交易（按小费）。

图 4 用 Alice、Bob、Charlie 的例子画出一棵聚合树。

```excalidraw q="三笔交易的签名，怎样在 mempool 里变成一个区块证明？" read="最上排是原始签名（mode 0）。中排是两个节点各自的递归证明（mode 1）。最下面是 builder 的区块证明。黄色是被丢弃的依赖。" takeaway="区块证明只覆盖被打包的交易。被丢弃的 Charlie 不会让区块无效，因为最终摘要要和区块里的交易对得上。" kind=聚合树
{"grid": {"w": 250, "h": 125}, "defaults": {"w": 200, "h": 62, "fontSize": 16},
 "nodes": [
   {"id": "al", "label": "Alice 签名", "col": 0, "row": 0, "color": "blue"},
   {"id": "ch", "label": "Charlie 签名", "col": 1, "row": 0, "color": "yellow"},
   {"id": "bo", "label": "Bob 签名", "col": 2, "row": 0, "color": "blue"},
   {"id": "pa", "label": "节点 A：P_A\n（Alice、Charlie）", "col": 0, "row": 1, "dx": 125, "color": "blue"},
   {"id": "pb", "label": "节点 B：P_B\n（Bob）", "col": 2, "row": 1, "color": "blue"},
   {"id": "blk", "label": "builder：区块证明\n（Alice、Bob）", "col": 1, "row": 2, "dx": 60, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "al", "to": "pa"}, {"from": "ch", "to": "pa"}, {"from": "bo", "to": "pb"},
   {"from": "pa", "to": "blk", "label": "丢弃 Charlie"}, {"from": "pb", "to": "blk"}
 ]}
```

**decentrek 的五条论点，逐条看前提。** decentrek 认为 8288 让“节点越多、能处理的签名越多”，同时保持去中心化 [8][9]（E39）。

| 论点 | 规范里的依据 | 成立需要什么 | 判断 |
|---|---|---|---|
| 每个节点的证明带宽恒定 | 规范写“constant per peer”；builder 每间隔约 256 kB | 交易正文仍要广播一次；wrapper 里的依赖列表和交易哈希随交易量增长 | warn 只对证明部分成立 |
| builder 不再是瓶颈 | builder 与 mempool 节点做同一件事 | builder 仍要在 slot 内合并并再证明一次；没有多子证明的成本数据 | warn 未经测量 |
| 节点越多，容量越大 | 每个节点都聚合“全部活跃交易” | 规范没有把工作分给不同节点，也没有激励；单节点吞吐有限 | no 缺少机制 |
| 验证者只验一个证明 | 区块有效性规则 | 依赖 leanVM 与递归的可靠性 | ok 成立 |
| 任意签名经 STARK 包装 | Rationale 写了这条路 | leanSTARK 当前无效；ISA 未定 | no 当前走不通 |

```finding F5 medium
# “证明带宽恒定”只对证明那一部分成立
claim: 规范说递归 STARK 的带宽开销“constant per peer, regardless of the number of transactions”，但没有推导。交易正文仍要在全网广播一次；每个 wrapper 都带去重后的依赖列表（每条 96 B）和交易哈希列表；首跳的 mode 0 还要带原始签名或 STARK。
evidence: [observed] 规范 Censorship Resistance 与 wrapper 编码 [1]（E17、E18）；Vitalik 推文“plus each transaction getting broadcasted through the network once”[6]（E29）。[inferred] 随交易量线性增长的部分（E40）。
implication: 讨论带宽时要分开算：证明是常数，交易和依赖列表不是。
```

```finding F6 high
# “节点越多容量越大”缺少分工、激励和吞吐依据；mode 1 上限还与之冲突
claim: 规范让每个节点都聚合整个活跃池，没有把工作分给不同节点，全文也没有证明激励。规范同时把 mode 1 wrapper 限制在 ≤ 16 个 leanSPHINCS、≤ 1 个 leanSTARK，又要求每轮“exactly one wrapper containing all currently active transactions”，两句字面冲突。EIP-8292 实测的共识层聚合（1,000 个签名）在 2 / 8 / 16 核上分别约 11 / 3.7 / 2.6 s，都超过 1,000 ms 的间隔；这是 XMSS、单消息的共识层数据，不是 8288 leanSPHINCS mempool 循环的基准，只说明硬件约束。
evidence: [observed] 规范 L251、L259、L263 与全文 [1]（E18、E19）；EIP-8292 基准 [4]（E42）。[inferred] 冲突与缺少机制（E20、E41）。[speculative] “每秒数万笔 PQ / 隐私交易”没有一手依据（E43）。
implication: 16 条上限可能是笔误，也可能另有本意；规范和讨论帖都没澄清。在它澄清之前，不能用 8288 草案论证“mempool 扩容”。
```

```finding F7 medium
# 区块证明保证“已打包的依赖都有效”，不保证“收到的有效交易都被打包”
claim: Ethereum Magicians 讨论帖里，多位参与者指出：聚合证明只证明纳入的依赖有效，不证明 builder 没有遗漏收到的有效依赖。8288 为此修改了 FOCIL 的数据结构，让包含列表也带一个递归证明，并要求 attester 验证它。FOCIL 已排进 Hegotá，8288 落地时等于修改一个已上线的格式。
evidence: [observed] Magicians 3、8、11 楼 [11]（E37）；规范 FOCIL 一节 [1]（E22）；EIP-8081 [5]（E26）。
implication: “正确性”由证明保证，“抗审查”仍靠包含列表规则。两件事要分开评估。
```

## M 愿景与草案的距离 {depth=2}
Vitalik 的两条推文描述了 8288 的终局 [6][7]。下表逐条对照规范。

| Vitalik 的说法 | 规范现状 | 判断 |
|---|---|---|
| “SPHINCS-” 签名约 3 kB，不必上链 | 原生方案叫 leanSPHINCS；SPHINCS- 是另一套 keccak 版方案，要先在客户端包成 STARK | 名称混用 |
| 隐私交易从约 10M gas 降到“low tens of thousands” | 要走 leanSTARK，当前无效；按定价一条 60,000 gas | 愿景 |
| Falcon、ML-DSA 等“wrap it client-side in a STARK” | 规范同意这条路，但 leanSTARK 无效、VK 只是哈希、ISA 未定 | 愿景 |
| 私有 AA | 规范全文未提 | 愿景 |
| tick 约 500 ms | 规范是 1,000 ms | 数字不同 |
| 链上开销：一个 STARK（100–300 kB）+ 每条 96 B | 区块头字段 + 96 B 三元组；builder 每间隔约 256 kB | 一致 |
| 需要约定 ISA，首选 RISC-V | 规范未提；leanVM 计划从 leanISA 迁到 rv64im | 未决 |
| 10-19：“EIP-8288 maximalism”，不再加预编译 | 规范没有这些内容 | 观点 |

来源：推文原文与规范 [1][6][7][13][14]（E29–E34、C13）。

**ISA 之争。** ethresear.ch 上一篇 10-08 的帖子认为，用 `vk_hash` 标识用户的证明只是占位。证明系统的 VK 会随 leanVM 升级而变化，不可升级的隐私池会因此失效。它建议把 0x11 换成 program scheme：第三字段放 `program_id = hash(ISA 版本, 程序字节)` [12]（E38）。作者也说，今天还没有足够数据做决定。

```finding F8 high
# “任意签名或证明在客户端包成 STARK”在当前草案里走不通
claim: 这条路要用 leanSTARK 依赖，而它是保留值。VK 只是一个哈希，没有注册机制，ISA 也没选定。第三方实验（ERC-8403）报告，leanVM 的递归 guest 目前只验证原始签名和自身证明，还不能验证其他程序的证明。手机端为 Falcon、ML-DSA 或隐私电路生成 leanVM 证明的成本，没有找到一手基准。
evidence: [observed] 规范 [1]（E6）；ISA 帖 [12]（E38）；ERC-8403 帖 [33]（R43）。[inferred] 当前不可用（E33）。[speculative] 客户端证明成本（E35）。
implication: Vitalik 说的“never need to add more precompiles again”是方向，不是现状。今天能被原生聚合的只有 leanSPHINCS。
```

## N AggLayer：相似在哪，不同在哪 {depth=2}
**AggLayer 是什么。** AggLayer 连接多条链，共用一个统一桥。它的核心组件是 [[pessimistic proof]]。它假设每条接入链都可能出错。所以每次跨链状态更新，都要单独证明“这条链提走的资产没有超过它在桥里的余额”[20]（G13、G14）。PP 自 2025-02-03 起在主网运行 [21]（G36）。

图 5 是一份证书从链到 L1 的路径。

```uml q="AggLayer 的一份证书怎样变成 L1 上的结算？证明在哪里验证另一份证明？" read="依据 agglayer @9f8e6c4 源码与 Polygon 文档整理。中间的子图是 SP1 程序内部发生的事。" takeaway="在所查的 PP 应用层，“证明里验证证明”只发生在一处：PP 程序验证链方的 aggchain proof（不算 SP1 内部的递归）。之后每份证书单独上 L1，没有跨链合并。"
flowchart TB
  chain["接入链（AggSender）<br/>提交证书：出入桥记录 + 认证"] --> node["AggLayer 节点<br/>先用原生 Rust 执行一遍"]
  node --> sp1
  subgraph sp1["SP1 Prover Network：PP 程序"]
    direction TB
    pp["更新三棵树<br/>余额不能下溢"] --> auth{"认证模式"}
    auth -- "ECDSA / 多签" --> sig["ECDSA 恢复地址"]
    auth -- "多签 + aggchain proof" --> rec["verify_sp1_proof<br/>(aggchain_vkey, 公开值哈希)"]
  end
  sp1 --> wrap["PLONK 包装（BN254）"]
  wrap --> l1["L1：AgglayerManager<br/>仅 trusted aggregator 可提交"]
```

```finding F9 high
# 相似之处是真的：PP 程序在 SP1 里验证另一份 SP1 证明
claim: `AggchainProof::verify_aggchain_proof` 先拼出公开值（前后 local exit root、L1 info root、网络 ID、aggchain 参数、导入桥记录的承诺），再调用 `sp1_zkvm::lib::verify::verify_sp1_proof(&self.aggchain_vkey, &public_values.hash())`。这正是“外层证明把内层证明的验证当作自己的计算”。
evidence: [observed] agglayer/crates/pessimistic-proof-core/src/aggchain_data/aggchain_proof.rs:L21-38@9f8e6c4 [18]（G1、G2）；SP1 Proof Aggregation 文档 [22]。
implication: “AggLayer 也在用递归”这句话在原语层面成立。但这一层组合由应用固定写死，aggchain proof 只出现在“多签 + aggchain proof”模式里（G3、G4）。
```

```finding F10 high
# 不同之处更大：逐链逐证书结算、trusted aggregator 提交、端到端非 PQ
claim: 节点为每份证书单独构造一笔 `verifyPessimisticTrustedAggregator(rollupID, …)` 交易；源码里没有把多条链的证书聚合成一份 L1 证明的路径。这个函数只允许 `TRUSTED_AGGREGATOR_ROLE` 调用。上链证明是 SP1 的 PLONK 包装（BN254）；链的认证用 secp256k1 ECDSA。SP1 Hypercube 的内存论证还依赖一个椭圆曲线离散对数假设。
evidence: [observed] certificate_task.rs:L379-446@9f8e6c4 [18]（G15）；AgglayerManager.sol [19]（G18、G21）；SP1 Security Model [23]（G22、G25）。[inferred] 无跨链单一证明（G16）；活性与抗审查依赖 trusted aggregator（G19）；端到端非 PQ（G26）。
implication: AggLayer 证明的是跨链账本约束，不是交易签名聚合。它既不能证明 8288 安全，也不是 PQ 方案。
```

**完整对比。** 下表按七个维度对比两者（G30–G38）。

| 维度 | EIP-8288 | AggLayer |
|---|---|---|
| 目标 | 签名和 STARK 不再逐个上链 | 单链被攻破时，损失不超过它的存款 |
| 叶子对象 | `(scheme, data_hash, vk_hash)` + 见证 | 一份证书的状态转换 + 链的认证 |
| 组合语义 | 并集、去重、丢弃，电路不理解交易 | 状态连续、余额不下溢、nullifier 不重复 |
| 递归安全假设 | 规范写明“widely believed”，并承认难以形式化 | SP1 假设“递归步数增加不损失安全”，并限制电路深度来避开 2025/118 的攻击 |
| 信任与活性 | 无许可的 mempool + builder + FOCIL | 单一 trusted aggregator 角色；证明外包给 Succinct 网络 |
| 成熟度 | Draft，参考实现 TBD | 主网运行；README 仍写“仍在审计” |

**还有谁在做“很多证明合成一个”。** 下表是三个生产系统（G40）。

| 项目 | 做法 | 和 8288 的区别 |
|---|---|---|
| Aligned 聚合服务 | 服务端把提交的证明递归聚合，在 Ethereum 上验证 | 集中服务，不是区块有效性条件 |
| NEBRA UPA | 单一许可制 aggregator 批量聚合 Groth16 | 单一 aggregator；没有丢弃语义 |
| Starknet SHARP | 两两递归合并，最后交给 Solidity 验证器 | StarkWare 运营；“应用感知递归”更像 AggLayer |

在我们对照的系统里，没有一个把递归聚合写进 L1 区块有效性，并让无许可的 mempool 节点分布式执行。覆盖面有限，这一点只能算推测（G41）。

## O 递归证明安全之争 {depth=2}
**谁在批评。** Justin Thaler 是 a16z crypto research 的 Research Partner、Georgetown 副教授，也是 Aerie 论文作者之一 [10][17]（R1、R2）。他批评的是与自己方案竞争的路线，读者应知道这层关系。他的 X 账号名 @SuccinctJT 与 SP1 背后的 Succinct 公司无关（C7）。

他的核心句子是：“hash-only is not really hash-only: it rests on hashes plus the soundness of deep SNARK recursion”[10]（C4）。同一篇里他也说，区块级聚合“is a powerful design independent of the hash-only vs. lattice debate”，他并不反对 [10]（C5）。

图 6 把递归安全的讨论拆成“模型 → 结论”。

```excalidraw q="递归证明的安全性，在不同的分析模型下分别知道什么？" read="上排是两种被证明的对象。下排是三种分析方式及其结论。红色表示没有证明或有攻击，蓝色表示有条件的正面结果。" takeaway="单层 Fiat–Shamir 证明在 ROM 中有证明。递归一旦要在电路里算哈希，普通 ROM 就不适用；理想化模型给出正面结果；具体哈希上有攻击，但所核对的攻击都要攻击者决定被证明的计算。" kind=模型与结论
{"grid": {"w": 300, "h": 135}, "defaults": {"w": 250, "h": 70, "fontSize": 16},
 "nodes": [
   {"id": "s1", "label": "单层 STARK\nROM 中有安全证明", "col": 0, "row": 0, "dx": 150, "color": "green"},
   {"id": "s2", "label": "递归：电路内\n重算内层 FS 哈希", "col": 1, "row": 0, "dx": 150, "color": "yellow"},
   {"id": "m1", "label": "简洁递归、普通 ROM：\n尚无已知证明", "col": 0, "row": 1, "color": "red"},
   {"id": "m2", "label": "理想化预言机模型\n几乎无损（启发式）", "col": 1, "row": 1, "color": "blue"},
   {"id": "m3", "label": "具体哈希：有 FS 攻击\n攻击者需选定计算", "col": 2, "row": 1, "color": "red"}
 ],
 "edges": [
   {"from": "s1", "to": "s2"},
   {"from": "s2", "to": "m1"}, {"from": "s2", "to": "m2"}, {"from": "s2", "to": "m3"}
 ]}
```

**逐条检验。** 下表把 Thaler 的论点和最强的反驳放在一起（R3–R66）。

| 论点 | 证据 | 最强反驳 | 强度 |
|---|---|---|---|
| A：hash-only 还依赖递归可靠性 | 8288 把它列为第 3 条信任假设 | 递归 STARK 已在链上长期运行 | ok 强 |
| A'：Aerie 单机不递归覆盖一个 slot | 作者自测 645 ms / 32,768 签名 | 只计证明时间，不计签名收集 | warn 中 |
| B：递归在 ROM 中无法建立安全 | 2024/728：相对化的简洁论证在 ROM 中不存在 | 该文自己写明：非相对化 IVC/PCD 仍是开放问题 | warn 中强，措辞偏强（不可能性未被证明） |
| B'：存在实用的 Fiat–Shamir 攻击 | KRS 2025/118、Fenzi 2026/1838 | 所核对的攻击要攻击者决定被证明的计算；目标是 GKR 类与针对程序生成实例的 IOP | ok 强，但未见这类攻击针对固定电路 STARK 递归 |
| C：提取器随深度膨胀；8288 允许无限深度 | BCCT13；2023/1646 §1：损失“exponential in the recursion depth”；8288 原文 | 膨胀是证明的损失，不是攻击 | ok 强 |
| D：理想化证明只说明攻击要用具体哈希 | 2023/1646 §2.3：要么归约到理想化模型，要么利用具体哈希，后者是开放问题 | 作者称这是现行参数的“partial evidence” | ok 与原文一致 |
| E：没有已知递归攻击；AI 会加速分析 | Thaler 原话 | — | 前半强，后半推测 |
| F：leanVM 不是通用 VM；二进制域 SNARK 证明格运算慢 | README 自述“minimal” | leanVM 计划迁到 RISC-V | 前半强；后半是 Thaler 的论断，没有可比基准，推测 |
| G：隐私链需要公钥加密；Thaler 称仅靠哈希无法以黑盒方式构造它 | Thaler 原话 | 格可以放在应用层的 STARK 里 | 技术前提本次未核实（推测）；系统层结论是价值判断 |

顺带一提：KRS 攻击论文的三位作者中，两位署名 Ethereum Foundation，一位署名 Succinct [28]（R20）。2023/1646 有一位 StarkWare 合著者，它 §2.4 分析的正是用户提交任意程序、深度不受限的递归 STARK [26]（R50）。2025/1663 有两位 EF 作者 [29]（R33）。把这场争论说成“Ethereum 忽视问题、a16z 揭露问题”，与研究的实际脉络不符。

```finding F11 high
# 理论缺口真实存在，而且 Ethereum 一方的文本也承认
claim: ePrint 2024/728 证明：普通 ROM 中不存在相对化 succinct argument，即能证明“含预言机查询的计算”的论证。经这条路线构造 IVC/PCD 的办法因此被排除。BCCT13 指出，基于递归提取的标准证明只对常数次组合有效。8288 自己把“Soundness of recursive STARKs”列为信任假设，并说它“adds difficulty to end-to-end formally proving”。leanVM 的形式化项目 leanerVM 把递归提取（T6）列为开放研究问题，并指出 leanVM 没有递减的递归深度度量。
evidence: [observed] ePrint 2024/728 摘要与 §1 [27]（R25）；BCCT13 [25]（R28）；EIP-8288 Trust Assumptions [1]（R3、R4）；leanerVM docs @28bbeb9 [15]（R34、R35）。[inferred] 双方都承认这一缺口（R37）。
implication: “只依赖哈希”的说法确实漏掉了一条假设：递归 Fiat–Shamir 证明的可靠性。这条假设目前“被广泛相信”，没有被证明。
```

```finding F12 high
# Thaler 的说法基本有据，但“无法建立”不等于“已证明不可能”
claim: 2024/728 的作者写明，在 ROM 中排除标准（非相对化）IVC 与 PCD 仍是开放问题。另一方面，2023/1646 证明：底层 SNARK 若有 straightline 知识可靠性，PCD 的安全性与底层基本相同；但严格证明的对象，是把哈希查询和应答直接附在证明里的非简洁版本；套到真实递归 STARK 上是启发式推断，作者自称“partial evidence”。2025/1663 在 osROM 中证明了多项式深度下的安全，但分析对象是 HyperNova（基于椭圆曲线）。Arc、WARP 在 ROM 中证明了哈希型累积方案的安全，但从累积到 PCD 仍要在电路里计算预言机，需要启发式实例化。
evidence: [observed] 2024/728 §1 [27]（R26）；2023/1646 Thm 1、§2.3 [26]（R30、R31、R49）；2025/1663 摘要与 §1 [29]（R32、R33）；WARP Thm 1 与 p.63 [38]（R65）。[inferred] Thaler 的说法偏强（R27）；累积到 PCD 仍需启发式（R66）。
implication: 这些正面结果适用范围不同：2023/1646 在 ROM 中证明的是非简洁递归构造；osROM 结果用的是更强的预言机模型。套到实用的简洁哈希型递归上，仍需额外的启发式一步。“安全归约松”不等于“攻击容易”；“没发现攻击”也不能代替安全归约。
```

```finding F13 high
# 本次核对的 KRS/Fenzi 型攻击需要攻击者选择计算；8288 限制了交易依赖，但树内限制仍待确认
claim: KRS 针对“GKR 加任意多线性多项式承诺”的论证，在任意具体哈希下构造出证明假命题的电路。关键是电路在内部算出自己的 Fiat–Shamir 挑战。Fenzi 把攻击扩展到针对程序生成实例的 IOP，包括 Aurora/STIR 型哈希 IOP（Merkle 承诺、RS 编码），前提是 Fiat–Shamir 只哈希了程序。我们没有找到这类攻击针对固定电路的 STARK 或递归验证电路的已发表案例。8288 当前交易规则只接受 leanSPHINCS，用户提交程序证明还不是已启用功能；但聚合伪代码仍保留 leanSTARK 分支（VK 由见证提供）和 discards，递归树内部是否也排除任意程序，要等最终电路确认（R67）。规范还承认用户 VK 的递归深度可能不受限。
evidence: [observed] ePrint 2025/118 Thm 1、2、9 与 §5 [28]（R17、R19、R20、R51–R54）；2026/1838 Thm 2、§7 [30]（R18、R21、R22、R55）；EIP-8288 [1]（R7、E14）；Thaler“we don't know of any outright attacks on SNARK recursion”[10]（R38）。[inferred] 攻击需决定被证明的计算；交易层当前不允许；聚合电路的 leanSTARK 分支待确认；未见可利用漏洞（R8、R24、R39、R67）。
implication: 开放 `LEANSTARK_SCHEME` 会引入攻击者选择的程序。Fenzi 的攻击是否适用，取决于证明系统怎样生成并绑定被证明的关系（R56）。在该论文分析的“生成关系”设定下，把生成后语句也哈希进首个挑战，就能归约回底层协议可靠性；leanVM 是否这样做，是一个具体的审计项，我们没有找到公开分析。
```

```finding F14 medium
# Aerie 同样依赖随机预言机模型；两条路线的真正差别是“要不要在电路里证明哈希”
claim: Aerie 的知识可靠性在经典 ROM 中证明，它也用 Fiat–Shamir。它的 HashToPoint 由验证者在证明之外计算，被证明的计算不包含这一步，也不递归。共用 salt 模式假设“fixed-target signer”不可伪造（Assumption C.8），作者说不知道有攻击。论文只在经典 ROM 中陈述定理，正文没有 QROM 分析；它自己的提取损失也没计入 Akita 的格参数估计。Aerie 是研究发布；leanVM 同样自述“not (yet) production ready”。
evidence: [observed] Aerie 论文 Def 5.6、Thm 5.9、§3.2、§6.3 与 README [17]（R10、R11、R14、R15、R57、R58、R60）；leanVM README [14]（R9）。[inferred] 差别在电路内是否证明 FS 哈希（R12、C9）。
implication: Thaler 的论点 B 前半句（“所有 PQ SNARK 都靠 ROM”）同样覆盖 Aerie。Aerie 目前不能合并彼此独立生成的聚合结果。要支持 leanVM 式分布式聚合，作者给出两个可能扩展：合并 Aerie 证明的方法，或者为它写递归验证器；后者会“reintroduces the heuristic step”。在单个证明者那里收集原始签名，本身不需要递归。争论的焦点是“递归”这一条假设，不是“哈希 vs 格”谁更安全。
```

```finding F15 medium
# 工程层面，递归聚合的实现 bug 已经出现过
claim: ZisK v1.3.2-alpha 修复了一个递归聚合漏洞。证明者可以把所有子证明标成 null，跳过 STARK 检查。这样，“从未被证明的执行”也能得到被接受的最终证明。SP1 在 v3.0.0 之前，递归电路采样挑战前漏写了置换论证的累积和；公告称利用它“practically infeasible”。
evidence: [observed] ZisK 发布说明 GHSA-3j5v-j2rm-9c5f [32]（R40）；SP1 [GHSA-8m24-3cfx-9fjw](https://github.com/advisories/GHSA-8m24-3cfx-9fjw)（GitHub Advisory）（R48）。[inferred] 这些是实现错误，不是对递归理论的攻击（R41）。
implication: 递归的风险不只在理论。递归电路、空子证明处理、挑战绑定，都是审计重点。
```

**还没回答的问题。** Matthew Green 在解读 KRS 时提出一种可能：在多程序递归树里，一个恶意程序的“bugdoor”可能跨程序边界破坏整棵树 [35]。对 GKR 类协议，KRS 的 Theorem 2 已经给出单个电路的构造：功能不变，却能证明任意输出（R52）。跨程序破坏整棵递归树，仍没有已知构造（R47，推测）。截至 10-21，我们没有找到 EF、StarkWare 或 leanEthereum 研究者对 Thaler 这篇推文的实质性公开回应（C10，推测）。

## P 怎样评估这类方案 {depth=2}
以下是从调研推出的评估清单，不是对任何项目的建议。

```callout info 评估“递归聚合”方案时，问这七个问题
1. **递归深度有没有上界？** 8288 没有；leanVM 没有递减的深度度量（R6、R35）。
2. **攻击者能不能把自选程序放进递归树？** 8288 的交易规则当前不允许；聚合电路是否在树内也排除，要等最终电路确认；开放 leanSTARK 后能（R8、R67、F13）。
3. **安全位数是在哪个模型下算的？** ROM 还是 QROM，单层还是含递归（E44、E45、R9）。
4. **最终验收路径是否全程抗量子？** 内层 STARK 加外层 BN254 包装就不是（G26）。
5. **谁出算力，谁能审查？** 8288 没有证明激励；AggLayer 由 trusted aggregator 提交（E41、G19）。
6. **证明了“已纳入的都有效”，还是也证明了“该纳入的都纳入”？**（E37）
7. **如果系统使用程序生成的关系，Fiat–Shamir 首个挑战是否哈希了生成后语句？** 这是 Fenzi 给出的可证明缓解（R22、R56）。
```

**对两种立场的判断（推论）。**
- 8288 一方：把验证依赖显式化、让网络分担证明，是独立于“哈希 vs 格”的设计贡献，连批评方也认可（C8）。但“只依赖哈希”需要加上“和递归 Fiat–Shamir 的可靠性”（R37）。
- a16z 一方：指出的理论缺口真实（F11）。但“无法建立”说得比定理更强，也还没有对 8288 的具体攻击（F12、F13）。Aerie 自己同样依赖 ROM，也没到生产（F14）。
- 两边都主张“密码学敏捷性”：Thaler 主张混合签名与纵深防御，并说他们同时在做 lattice-Jolt 和 hash-Jolt（C6）。

## Q 局限与开放问题 {depth=2}
- **没有复现**：所有基准都是作者自报，本次没有运行。
- **论文的核对深度**：ePrint 对本机直接抓取返回 403，全文改从 Internet Archive 对同一地址的快照取得。核对了主定理、引言与作者讨论，长证明附录没有逐行读。Brzuska–Hubáček–Kalsta（PKC 2026）与 Arc 只核对到摘要。
- **leanVM 的 Fiat–Shamir 绑定**：首个挑战是否哈希了生成后的语句，没有读源码核实（R56）。
- **mode 1 的 16 条上限**是笔误还是本意？规范和讨论帖都没澄清（E19、E20）。
- **单节点吞吐**：普通硬件每 1,000 ms 能证明多少 leanSPHINCS，builder 合并 N 个子证明的成本曲线，都没有数据。
- **安全位数口径冲突**：leanVM README 写 128 / 64 位，EIP-8292 写约 124 / 62 位（E45）。
- **QROM 下的递归**：leanVM 的 64 位 QROM 是单层数字还是含递归，README 没说。
- **AggLayer 主网权限**：trusted aggregator 与合约升级权限在主网上由谁控制、有没有 timelock，没有查链上状态。
- **“AggLayer 也在做类似的事”的出处**没找到（G42）。
- **回应**：对 Thaler 推文的实质性回应，截至 10-21 没有找到（C10）。

## R 方法与证据 {depth=3}
**方法。** 三路并行调研：EIP-8288 机制与支持者论点（E）、AggLayer 与其他聚合方案（G）、递归证明安全（R）。主会话补充推文时间线与基准行（C）。每条论断都追到一手来源：
- EIP 原文、提交历史与 Ethereum Magicians、ethresear.ch 讨论；
- agglayer 源码与 L1 合约、Polygon 与 SP1 文档；
- leanVM、Aerie 仓库与 leanerVM 形式化文档；
- 9 篇论文全文（ePrint 经 Internet Archive 快照；Aerie 用 LayerZero 托管的 PDF），另有 2 篇只核对到摘要；
- 四条推文原文（经 fxtwitter API 取得原文与 UTC 时间）。

台账 166 行（observed 127 / inferred 29 / speculative 10），分册见 `research/notes-*.md`；论文全文复核见 `notes-papers.md`。递归分路首次运行因连接错误失败，重新派发后完成。

**固定版本。**
- ethereum/EIPs @`5a4387b`（eip-8288.md 最后修改 `72ca2dd`，2026-10-15）。
- agglayer/agglayer @`9f8e6c4`（2026-10-19）；AgglayerManager.sol @`1c00e15`。
- leanEthereum/leanVM @`3a37fb6`；a16z/aerie @`49b6c21`；leanerVM docs @`28bbeb9`。

**主会话抽查。** E19、G1、G17、G23、G25、G28、G29、R26、R34、R35 与来源原文一致。论文相关的 R 行（R16–R33、R49–R66）在 2026-10-21 按全文复核过一轮，定理与页码见 `notes-papers.md`。

**对外部调研（GPT）的修正。**
- 推文原文已取得；外部调研称未能读取。
- 漏了 mode 1 wrapper 的 16 条上限及其与“覆盖全部活跃交易”的冲突（E19、E20）。
- 33,000 gas 正确，但 30,000 是按声明定额、按 `LEANSTARK_VERIFICATION_GAS` 收（E24、E25）。
- 漏了 10 月的规范修订：mode 3→4、leanSTARK 改为保留、mode 1 并集检查、零 `data_hash`（E2–E8、E17）。
- AggLayer：可以确定是逐证书结算，没有跨链单一证明；外层是 PLONK；漏了 trusted aggregator；SP1 Hypercube 的内存论证含椭圆曲线假设，“内层 STARK 是 PQ”的前提也不成立（G15、G16、G18、G21、G25）。
- 2025/1663（osROM）的分析对象是 HyperNova，不是对递归 STARK 的背书；2024/728 自己写明非相对化 IVC/PCD 仍开放（R26、R32）。
- 漏了 leanerVM 把递归提取列为开放问题（R34）。

## S 复现 {depth=3}
```bash title="核对 EIP-8288 的常量、mode 1 上限与信任假设"
curl -sL https://raw.githubusercontent.com/ethereum/EIPs/5a4387b9574508c1d1f70ad9ce079e92478f2e45/EIPS/eip-8288.md -o eip-8288.md
grep -n "DEP_VERIFY_FRAME_MODE\|LEANSTARK_SCHEME\|AGGREGATED_VK\|MAX_LEANSIG" eip-8288.md
# 期望：mode 4；0x11 reserved；AGGREGATED_VK TBD；MAX_LEANSIG_DEPS_PER_WRAPPER 16
grep -n "exactly one wrapper\|unlimited-depth\|Soundness of recursive" eip-8288.md
# 期望：L263、L217、L523
```

```bash title="核对 AggLayer 的“证明里验证证明”与逐证书结算"
git clone https://github.com/agglayer/agglayer && cd agglayer && git checkout 9f8e6c4eb82b782c63954e087908c7a2ba45e226
sed -n 21,38p crates/pessimistic-proof-core/src/aggchain_data/aggchain_proof.rs
# 期望：sp1_zkvm::lib::verify::verify_sp1_proof(&self.aggchain_vkey, ...)
grep -n "verifyPessimisticTrustedAggregator" crates/agglayer-certificate-orchestrator/src/certificate_task.rs
```

```bash title="取推文原文与时间"
curl -s https://api.fxtwitter.com/SuccinctJT/status/2112706944548880442 | jq -r .tweet.text
curl -s https://api.fxtwitter.com/VitalikButerin/status/2097711433073172837 | jq -r .tweet.created_at
```

## T 术语表 {depth=2}
```glossary
依赖帧 | dependency verification frame，mode 4 | 8288 新增的帧，只放 96 B 三元组声明，不执行代码。 | 不替账户做授权判断
帧交易 | EIP-8141 frame transaction | 把交易拆成验证、执行等帧，账户自定验证规则。 | 本身不带 PQ 签名
三元组 | (scheme, data_hash, verification_key_hash) | 一条依赖：在某方案下，某数据哈希对某公钥或 VK 成立。 | 不是签名本身
wrapper | 推文里叫 envelope | 网络层的打包对象：mode 0 带原始签名，mode 1 带一个递归 STARK。 | 不是交易
递归 STARK | recursive STARK | 在 STARK 里验证其他 STARK，把很多证明合成一个。 | 不是把文件打包
AGGREGATED_VK | — | 协议固定的聚合电路验证键，验证者只认它；目前 TBD。 | 不是用户的 VK
DEPS_HASH | — | 把依赖列表压成 32 B 摘要的哈希，当前工具用 BLAKE2s。 | 不含 scheme 字节
leanSPHINCS | — | 执行层用的无状态哈希签名，8288 当前唯一接受的方案。 | 不是 SPHINCS-
SPHINCS- | SPHINCS minus | 另一套 keccak 版无状态签名，要先包成 STARK 才能进 8288。 | 不是 leanSPHINCS
leanVM | — | Lean Ethereum 的极简哈希型 zkVM，用于签名聚合和递归，自述未达生产。 | 不是通用 zkEVM
leanerVM | — | leanVM 的形式化验证项目。 | 不是另一个 VM
FOCIL | EIP-7805 | 由 fork choice 强制的包含列表，用来抗审查。 | 8288 要改它的格式
ISA | instruction set architecture | 用户程序在 zkVM 里用的指令集，例如 RISC-V。 | 不等于证明系统
Fiat–Shamir | FS 变换 | 用哈希代替验证者的随机挑战，让证明变成非交互。 | 不是签名方案
随机预言机模型 | ROM | 分析时把哈希当成理想随机黑盒。 | 不等于真实哈希
QROM | quantum ROM | 允许攻击者用量子方式查询哈希的模型。 | 比 ROM 更强的要求
知识可靠性 | knowledge soundness | 能让验证者接受的证明者，一定“知道”见证。 | 比普通可靠性强
提取器 | extractor | 从证明者那里取出见证的算法，用来定义知识可靠性。 | 不是攻击者
straightline 提取 | 直线提取 | 只看证明者的查询记录、不倒带的提取方式。 | 通常只在理想化模型成立
相对化论证 | relativized argument | 能证明“含预言机查询的计算”的论证系统。 | 2024/728 证明其简洁版本在 ROM 中不存在
IVC | incrementally verifiable computation | 每一步都证明“上一步正确”的链式证明。 | 不是 PCD 的全部
PCD | proof-carrying data | 多方在树或图上各出证明并合并。 | 8288 的聚合树就是这种形态
KRS 攻击 | ePrint 2025/118 | 让电路在内部算出自己的 FS 挑战，从而证明假命题。 | 未见用于 STARK 递归
pessimistic proof | PP，悲观证明 | AggLayer 证明一条链提走的不超过它在桥里的余额。 | 不保证链内交易正确
aggchain proof | — | 链自定义的证明，由 PP 程序在 SP1 里验证。 | 只在多签模式里出现
trusted aggregator | TRUSTED_AGGREGATOR_ROLE | L1 上唯一能提交 AggLayer 结算的角色。 | 决定活性，不决定正确性
PLONK 包装 | STARK→SNARK wrap | 把 STARK 再证明成 BN254 上的小 SNARK，方便上链。 | 不抗量子
```

## U 参考资料 {depth=2}
1. [EIP-8288：In-mempool signature and proof aggregation](https://eips.ethereum.org/EIPS/eip-8288)（本地固定 @5a4387b，文件最后修改 72ca2dd）— 依赖帧、递归电路、wrapper、gas、信任假设。**PRIMARY**
2. [eip-8288.md 提交历史](https://github.com/ethereum/EIPs/commits/master/EIPS/eip-8288.md) — 10 次提交与每次改了什么。**PRIMARY**
3. [EIP-8141：Frame Transaction](https://eips.ethereum.org/EIPS/eip-8141) — 帧模式、内省指令、签名哈希。**PRIMARY**
4. [EIP-8292：Post-Quantum Attestation Aggregators](https://eips.ethereum.org/EIPS/eip-8292) — 共识层聚合基准、约 124 / 62 位安全。**PRIMARY**
5. [EIP-8081：Hegotá meta](https://eips.ethereum.org/EIPS/eip-8081) — 8141 已排期，8288 不在列。**PRIMARY**
6. [Vitalik，2026-09-09：A note on recursive STARK mempools](https://x.com/VitalikButerin/status/2097711433073172837) — 8288 的愿景与数字。**PRIMARY**
7. [Vitalik，2026-10-19：EIP-8288 maximalism](https://x.com/VitalikButerin/status/2112032009413439704) — 不再新增预编译。**PRIMARY**
8. [decentrek，2026-09-11](https://x.com/decentrek/status/2098392867773509799) — “第四个扩容维度”。**PRIMARY**
9. [decentrek，2026-10-20](https://x.com/decentrek/status/2112535053188145367) — 五条论点与动画。**PRIMARY**
10. [Justin Thaler，2026-10-21](https://x.com/SuccinctJT/status/2112706944548880442) — 对递归的批评原文。**PRIMARY**
11. [Ethereum Magicians：EIP-8288 讨论帖](https://ethereum-magicians.org/t/eip-8288-frame-type-for-pq-sig-and-stark-aggregation/28723) — Vitalik 的“purely hash-based”、omission accountability、mode 1 漏洞报告。**PRIMARY**
12. [ethresear.ch：Exposing an ISA for post-quantum proofs on Ethereum](https://ethresear.ch/t/exposing-an-isa-for-post-quantum-proofs-on-ethereum/26136) — program scheme 提案。**PRIMARY**
13. [ethresear.ch：SPHINCS minus](https://ethresear.ch/t/sphincs-minus-efficient-stateless-post-quantum-signature-verification-on-the-evm/25165) — SPHINCS- 与 leanSPHINCS 的区别。**PRIMARY**
14. [leanEthereum/leanVM README](https://github.com/leanEthereum/leanVM)（@3a37fb6）— 定位、安全声明、基准。**PRIMARY**
15. [Verified-zkEVM/leanerVM](https://github.com/Verified-zkEVM/leanerVM)（docs @28bbeb9）— T6 递归提取开放、无深度度量。**PRIMARY**
16. [a16z crypto：Fast post-quantum signature aggregation with lattice SNARKs](https://a16zcrypto.com/posts/article/fast-post-quantum-signature-aggregation-with-lattice-snarks)（2026-10-16）— Aerie 与 a16z 的论点。**PRIMARY**
17. [Aerie 论文 ePrint 2026/2501](https://eprint.iacr.org/2026/2501) 与 [a16z/aerie README](https://github.com/a16z/aerie)（@49b6c21）— 经典 ROM 证明、基准、研究发布声明。**PRIMARY**
18. [agglayer/agglayer](https://github.com/agglayer/agglayer)（@9f8e6c4）— PP 程序、aggchain 模式、证书状态机。**PRIMARY**
19. [agglayer-contracts：AgglayerManager.sol](https://github.com/agglayer/agglayer-contracts)（@1c00e15）— L1 结算入口与权限。**PRIMARY**
20. [Polygon Docs：Pessimistic Proof Architecture](https://docs.polygon.technology/interoperability/agglayer/core-concepts/pessimistic-proof/architecture) — PP 流程与安全目标。**PRIMARY**
21. [AggLayer：Pessimistic Proofs Live on Mainnet](https://www.agglayer.dev/blogs/major-development-upgrade-for-a-multistack-future-pessimistic-proofs-live-on-agglayer-mainnet)（2025-02-03）— 上线时间。**PRIMARY**
22. [Succinct Docs：Proof Aggregation](https://docs.succinct.xyz/docs/sp1/writing-programs/proof-aggregation) — `verify_sp1_proof` 的语义。**PRIMARY**
23. [Succinct Docs：SP1 Security Model](https://docs.succinct.xyz/docs/sp1/security/security-model) — 递归不损失安全的假设、深度限制、ECDLP 假设、PLONK/BN254。**PRIMARY**
24. [Canetti, Goldreich, Halevi, ePrint 1998/011](https://eprint.iacr.org/1998/011) — ROM 中安全、实例化后不安全的反例。**PRIMARY**
25. [Bitansky, Canetti, Chiesa, Tromer, ePrint 2012/095](https://eprint.iacr.org/2012/095) — 递归提取只撑常数深度。**PRIMARY**
26. [Chiesa, Guan, Samocha, Yogev, ePrint 2023/1646](https://eprint.iacr.org/2023/1646) — straightline 提取下 PCD 的安全界。**PRIMARY**
27. [Barbara, Chiesa, Guan, ePrint 2024/728](https://eprint.iacr.org/2024/728) — 相对化的简洁论证在 ROM 中不存在。**PRIMARY**
28. [Khovratovich, Rothblum, Soukhanov, ePrint 2025/118](https://eprint.iacr.org/2025/118) — 对 Fiat–Shamir 的实用攻击。**PRIMARY**
29. [Maller, Mohnblatt, Zapico, ePrint 2025/1663](https://eprint.iacr.org/2025/1663) — osROM 中的 IVC。**PRIMARY**
30. [Fenzi, ePrint 2026/1838](https://eprint.iacr.org/2026/1838) — KRS 攻击的扩展与缓解。**PRIMARY**
31. [Brzuska, Hubáček, Kalsta：Simple Attacks against (Extended) Fiat-Shamir（PKC 2026）](https://research.aalto.fi/en/publications/simple-attacks-against-extended-fiat-shamir) — XFS 的反例。**PRIMARY**
32. [ZisK v1.3.2-alpha 发布说明](https://github.com/0xPolygonHermez/zisk/releases/tag/v1.3.2-alpha) — 递归聚合的实现漏洞。**PRIMARY**
33. [ethresear.ch：ERC-8403](https://ethresear.ch/t/erc-8403-an-account-as-one-hash-and-post-quantum-keys/26147) — leanVM 递归 guest 的现状。**PRIMARY**
34. [Aligned](https://docs.alignedlayer.com/architecture/2_aggregation_mode)、[NEBRA UPA](https://docs.nebra.one/upa-protocol-specification)、[Starknet SHARP](https://docs.starknet.io/learn/protocol/sharp) — 其他证明聚合方案。**PRIMARY**
35. [Matthew Green：How to prove false statements? (Part 1)](https://blog.cryptographyengineering.com/2025/02/04/how-to-prove-false-statements-part-1) — 对 KRS 的解读。
36. 上一篇：[《后量子签名选型》](/p/pq-signature-selection/) — 哈希与格签名原理、基准口径。
37. ChatGPT Deep Research 结果（`research/eip-8288-deep-dive.md`）— 只作线索。
38. [Bünz, Chiesa, Fenzi, Wang, ePrint 2025/753（WARP）](https://eprint.iacr.org/2025/753) 与 [Arc, ePrint 2024/1731](https://eprint.iacr.org/2024/1731) — ROM 中可证明安全的哈希型累积方案。**PRIMARY**

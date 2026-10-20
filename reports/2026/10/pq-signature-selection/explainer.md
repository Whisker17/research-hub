---
template: research
title: 后量子签名选型：哈希路线 vs 格路线，以及 EIP-8288 想做的“第三条路”
subtitle: 这场争论其实是三个选择：签名算法、聚合证明、协议接口。Ethereum 在协议层押哈希，a16z 押格，两边的聚合方案都还不能上生产；EIP-8288 想让协议不再为任何算法加预编译，但当前草案只支持一种哈希签名。
cols: 4
type: 技术调研 · 选型对比 · PQ 专题第三篇
audience: Mantle 的开发者和管理层：懂 EVM 与 rollup，读过或大致知道前两篇的 PQ 威胁模型，对 XMSS、leanVM、格 SNARK、EIP-8288 没有背景
scope: 哈希签名与格签名的原理和取舍；XMSS + leanVM 与 Falcon + Aerie 两条聚合路线；Ethereum、Starknet、a16z、LayerZero、Algorand、Solana 的立场与理由；EIP-8288 / 8141 / PQ 预编译；对前两篇建议的修订
evidence: 193 条论断台账（observed 148 / inferred 39 / speculative 6；三路调研 + 系列衔接）；EIP 原文与提交历史、leanVM / Aerie 源码 README 与规范、Aerie 论文、NIST 标准与论坛、各方推文原文；访问于 2026-10-20
date: 2026-10-20 · v1
---
结论先行：外界把这场争论说成“Ethereum 选哈希、a16z 选格”。更准确的说法是，它同时在争三件事（[F1](#F1)）：
1. 用什么签名；
2. 用什么证明系统聚合大量签名；
3. 协议应该原生支持多少种密码学。

两边各有硬伤。哈希路线把信任压在最老、最被研究透的原语上，但签名大、证明哈希贵，还要靠递归把工作拆给多台机器（[F3](#F3)、[F4](#F4)）。格路线（Falcon + Aerie）单机 0.65 秒就能证明 32,768 个签名，但依赖更年轻的格假设，FN-DSA 标准也还没有草案（[F6](#F6)、[F7](#F7)）。两边的聚合实现都自称“未达生产”（[F8](#F8)）。

EIP-8288 想绕开选边：账户在本地选任意签名，再包成 STARK，由区块级递归证明统一交付。Vitalik 说这样“Ethereum 再也不用加预编译”。但当前草案只接受 leanSPHINCS 一种签名，通用 STARK 入口还没定义（[F11](#F11)、[F12](#F12)）。

对 Mantle：第二篇的“合约账户 + ML-DSA 验签预编译”作为近期容灾仍然成立（[F14](#F14)）。要改四处：
- 把预编译定位为过渡工具；
- 修正地址区间；
- 更新 Native AA 时间线；
- 让账户面向“验证后端”，不绑定某个预编译地址（[F15](#F15)）。

## A 一场争论，三个选择 {sheet meta="三层拆分"}
```tree list
签名层 | 谁授权了这条消息
  哈希 | leanXMSS（共识）、leanSPHINCS（账户）
  格 | Falcon、ML-DSA
聚合证明层 | 怎样证明一大批签名都有效
  哈希型 STARK | leanVM：分片证明 + 递归合并
  格型 SNARK | Aerie：单机一次证明，不递归
协议接口层 | 验证结果怎样进入账户和区块
  预编译 | 每种算法一个地址，逐笔验签
  EIP-8288 | 交易声明依赖，区块带一个递归 STARK
```

## B 关键数字 {sheet span=2 meta="2026-10-20"}
| 量 | 值 |
|---|---|
| 签名大小：BLS / Falcon-512 / leanXMSS / ML-DSA-65 / leanSPHINCS | 96 B / 666 B / 2,404 B / 3,309 B / 4,276 B |
| leanVM 聚合 leanXMSS（M4 Max，16 核） | 1,362 个/秒，证明 318 KiB，验证 5.4 ms，峰值内存 15.5 GiB |
| Aerie 聚合 Falcon-512（同款 M4 Max） | 32,768 个 0.65 s，含盐 1,346 KiB，单核验证 54 ms，峰值 2.1 GiB |
| 同机吞吐比（a16z 口径） | Aerie 约为 leanVM 的 29 倍；leanVM 证明验证更快（约 6 ms） |
| EIP-8288 一个 leanSPHINCS 依赖 | 96 B 帧数据 + 约 33,000 gas，签名不上链 |
| 状态 | 两套聚合实现均自述未达生产；FIPS 206 无草案 |

## C 谁站哪边，理由是什么 {sheet meta="2026-10"}
| 阵营 | 倾向与核心理由 |
|---|---|
| Ethereum（Vitalik、Drake） | 哈希：依赖最少，怕 AI 攻破有结构的数学 |
| Starknet / Eli | 证明层哈希；账户可用 Falcon；格 SNARK“太新” |
| a16z / LayerZero | 格：单机快、不递归、NIST 标准、隐私终究要格 |
| Algorand | 格（Falcon）：已上线原生账户，紧凑、验证快 |
| Solana | Alpenglow 共识用 BLS（计划 2026-10-21 主网激活）；Falcon 只做了原型 |

## D 两条路线速查 {sheet span=2 meta="工程归纳"}
| 维度 | 哈希路线 | 格路线（Falcon） |
|---|---|---|
| 安全假设 | ok 只靠哈希 | warn 格问题，结构更多、更年轻 |
| 签名大小 | no 2.4–4.3 KB | ok 0.7 KB |
| 签名端运维 | warn 有状态需管索引；无状态签名慢 | warn 浮点采样、侧信道，正在改定点 |
| 证明聚合 | warn 证明哈希贵，需递归分摊 | ok 代数检查为主，单机即可 |
| 标准化 | warn lean 系列是定制参数，哈希未定 | warn FIPS 206 无草案；ML-DSA 已是标准 |
| 生产就绪 | no leanVM 自述未就绪 | no Aerie 是研究发布 |

## E 时间线 {sheet span=2 meta="2012–2027"}
```timeline
2012 | Module-SIS 首次定义 | Eli 说的“2012”
2024-08 | NIST 发布 FIPS 204 / 205 | ML-DSA、SLH-DSA 定稿
2026-06 | EIP-8288、EIP-8292 草案 | 执行层与共识层聚合
2026-07-29 | HAWK 撤回 | AI 辅助攻击后
2026-08-12 | Algorand v5.0.0 | 原生 Falcon-1024 账户
2026-09-28 | NIST：FN-DSA 改用定点 | 仍无公开草案
*2026-10-16 | a16z 发布 Aerie | 格聚合，比 leanVM 快 29 倍
*2026-10-19 | Vitalik：“8288 maximalism” | 不再加预编译；8355 被拒
2027 Q2 | Hegotá（预计） | 包含 EIP-8141，不含 8288
```

## F 结论 {sheet span=4}
```callout ok 别把“选算法”变成“选架构”：近期把 PQ 授权做出来，账户面向验证后端，聚合等两边成熟
- 拆开看：签名、聚合证明、协议接口是三个独立选择；Starknet 就是“证明层哈希 + 账户层 Falcon”的组合（F1、F10）。
- 哈希路线：假设最保守；代价是签名大、证明贵、靠递归分摊，且有“递归后安全性难以证明”的批评（F3、F4、F5）。
- 格路线：Aerie 单机 0.65 s 证明 32,768 个 Falcon 签名；代价是更年轻的假设、默认带盐不是常数大小、FN-DSA 无草案（F6、F7）。
- 两边都没就绪：leanVM 与 Aerie 都自述未达生产；双方争的是 2027 年以后的默认值（F8、F9）。
- EIP-8288：想让协议只认一种证明，不再按算法加预编译；当前只支持 leanSPHINCS，不在 Hegotá（F11、F12、F13）。
- 对 Mantle：保留近期方案，改定位、改地址区间、改时间线、抽象验证后端；PQ 签名聚合暂不划算（F14、F15、F16）。
- 从哪里读：入门看 I–K，两条路线看 L–O，EIP-8288 看 P–Q，前两篇的修订与 Mantle 看 R–S。
```

## G 如何阅读 {depth=1}
```callout info 系列导航：Mantle 后量子专题共三篇
- 第一篇 [《后量子从入门到路线》](/p/post-quantum-mantle/)：哪些密码学组件会被量子攻破，Ethereum / Starknet / Aztec 怎么做，Mantle 有哪些需要自己迁的部分。
- 第二篇 [《后量子在 Mantle 的工程落地》](/p/pq-in-mantle/)：合约级 PQ 账户 + 验签预编译，为什么 7702 不能当容灾。
- 第三篇（本篇）：签名和聚合怎么选，EIP-8288 改变了什么，以及前两篇哪些说法要修订（面板 R）。
```

```callout info 默认你已知道（本文不解释）
- 私钥签名、公钥验证；EOA 交易用 secp256k1 ECDSA
- 量子计算机能用 Shor 算法破解椭圆曲线，但哈希只是余量变小（第一篇面板 K）
- 哈希函数是“数据指纹”；Merkle 树能用一条路径证明“某个叶子在树里”
- 预编译是 EVM 里由客户端原生实现的固定地址合约
- rollup 的基本结构：sequencer 排序，L1 上验证状态
```
- **5 分钟（老板）**：看导语和总览 A–F，再看 [面板 S](#panel-S) 的行动清单。
- **30 分钟（开发者）**：按顺序读 [前置知识](#panel-I)、[两种签名的原理](#panel-J)、[XMSS + leanVM](#panel-L)、[Falcon + Aerie](#panel-M)、[各方立场](#panel-N)、[EIP-8288](#panel-P) 和 [对前两篇的修订](#panel-R)。
- **要复核的人**：再读 [方法与证据](#panel-U) 和 [复现](#panel-V)。

**贯穿全文的两个例子**：
1. **共识例子**：一个 slot 里有 32,768 个验证者投票。BLS 能把它们合成一个 96 字节的签名；换成 PQ 签名后，这件事变成“证明这 32,768 个签名都有效”。
2. **账户例子**：Alice 用 PQ 账户给 Bob 转账。我们会看它在预编译路线和 EIP-8288 路线下各怎么走。

## H 背景动机 {depth=2}
**问题。** 2026-10-16，a16z 发布 Aerie：用格型 SNARK 聚合 Falcon 签名，单机比 Ethereum 的 leanVM 快约 29 倍，并公开主张“the case for lattices”[1]。两天后，StarkWare 联合创始人 Eli Ben-Sasson 回应“Strong disagree”[19]。再一天，Vitalik 说支持所有人密码学的理想路线是 EIP-8288，“Ethereum can then never add a new precompile again”[14]。

**为什么现在。**
- 前两篇已经给出威胁清单和近期工程方案。第二篇推荐 ML-DSA-65 验签预编译 [48]。这场争论直接关系到这个推荐还站不站得住。
- EF 在 2026-09 把 ML-DSA 预编译 EIP-8355 评为“premature standardization”，10-19 正式列为 Declined [36][37]。
- leanVM 在 10-17 刚换了签名方案，基准数字随之变化 [6][7]。不追到一手来源，二手转述里的数字很容易混用。

**范围。** 两类签名的原理与取舍；两条聚合路线怎么运作、数字怎么读；各生态的立场与理由；EIP-8288 的机制与现状；对前两篇建议的修订。

**非目标。** 不推导格与哈希的安全证明；不独立复现 Aerie 或 leanVM 的基准；不讨论投资；不涉及 Mantle 未公开的架构。

**判断标准（先于结论定下）。** 比较两条路线时看六件事：
1. 安全假设：有多年轻、结构有多少；
2. 字节数：签名与聚合物；
3. 时间和内存：证明与验证；
4. 签名端运维难度；
5. 标准化程度；
6. 生产就绪程度。

**已有资料的不足。** 外部调研（ChatGPT Deep Research）框架正确 [49]，但没抓到推文原文。它还漏了三处关键变化：leanVM 10-17 换成两层 leanXMSS；8355 已被拒；8288 的 gas 合计 33,000，不是 3,000。修正清单见 [面板 U](#panel-U)。

## I 前置知识 {depth=2}
```excalidraw q="读懂这场争论要先懂哪些概念？按什么顺序？" read="灰色虚线框是默认已知；蓝框是下面的卡片；绿框是本文主题。箭头表示先学 → 后学。" takeaway="B-1、B-2 讲哈希签名，B-3 讲格签名，B-4 讲为什么要“证明签名有效”，B-5 讲 EIP-8288 所依赖的帧交易。" name=prereq-map kind=前置知识地图
{"grid": {"w": 290, "h": 100}, "defaults": {"w": 220, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "hs", "label": "哈希与 Merkle 树（已知）", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "pk", "label": "签名与验签（已知）", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "zk", "label": "rollup 证明（已知）", "col": 1, "row": 3, "color": "gray", "stroke": "dashed"},
   {"id": "b1", "label": "B-1 哈希签名", "col": 1, "row": 0, "color": "blue"},
   {"id": "b2", "label": "B-2 有状态 vs 无状态", "col": 2, "row": 0, "color": "blue"},
   {"id": "b3", "label": "B-3 格签名", "col": 1, "row": 1, "color": "blue"},
   {"id": "b0", "label": "B-0 签名聚合", "col": 1, "row": 2, "color": "blue"},
   {"id": "b4", "label": "B-4 证明签名有效", "col": 2, "row": 2, "color": "blue"},
   {"id": "b5", "label": "B-5 帧交易 8141", "col": 3, "row": 2, "color": "blue"},
   {"id": "top", "label": "签名选型与 8288", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "hs", "to": "b1"}, {"from": "b1", "to": "b2"}, {"from": "pk", "to": "b3"},
   {"from": "pk", "to": "b0"}, {"from": "zk", "to": "b4"}, {"from": "b0", "to": "b4"},
   {"from": "b4", "to": "b5"}, {"from": "b2", "to": "top"}, {"from": "b3", "to": "top"},
   {"from": "b5", "to": "top"}
 ]}
```

```prereq B-0 l1 3min
# 签名聚合（signature aggregation）
what: 把很多个签名压成一个小对象，验证者检查一次就够。BLS 靠椭圆曲线的代数性质直接相加，结果只有 96 字节。
why: 已知的 PQ 签名都不能这样直接相加 [1]。于是“聚合”变成“生成一个证明，证明这一批签名都通过验证”，这就是两条路线竞争的地方。
example: 32,768 个 BLS 投票 → 1 个 96 B 签名。32,768 个 Falcon-512 签名逐个传输约 21 MB；Aerie 聚合后约 1.3 MB（含盐）[3]。
misconception: 误解：PQ 聚合只是换一种字节格式。事实：它把原本很轻的加法，变成了要专门算力的证明工作 [10]。
deeper: [1] a16z Aerie 博客开头两段
```

```prereq B-1 l1 4min
# 哈希签名：公开秘密来证明授权
what: 签名者先生成一批秘密值，公开它们的哈希。签名时按消息公开其中一部分秘密，验证者把秘密再哈希一次，对上公钥就算通过。XMSS 用一棵 Merkle 树把很多把“一次性钥匙”挂在同一个根上，根就是公钥。
why: 它的安全性只依赖哈希函数 [31]。这正是 Ethereum 想要的“最少依赖”。代价是签名里要带一次性签名和一条 Merkle 路径，所以比较大。
example: leanXMSS：两层高 16 的 XMSS，公钥 32 B，签名 2,404 B，验证要算 201 次 BLAKE2s 压缩 [7][8]。
misconception: 误解：哈希签名就是 SLH-DSA。事实：lean 系列是为 Ethereum 定制的参数，不是 NIST 标准参数集 [6]。
deeper: [8] leanXMSS 规范 §2–§5
```

```prereq B-2 l1 4min
# 有状态与无状态
what: XMSS 是有状态签名：每把一次性钥匙只能签一条消息，签名者必须记住用到了第几把。SLH-DSA / leanSPHINCS 是无状态签名：用更大的签名和更多哈希，换来不用记状态。
why: 有状态签名一旦把同一索引用在两条不同消息上，攻击者就能伪造签名 [31]。共识层每个 slot 只签一次，可以拿 slot 号当状态；钱包多设备、备份恢复做不到，所以账户层用无状态方案 [1][11]。
example: leanXMSS 2,404 B（有状态，共识）；leanSPHINCS 4,276 B（无状态，账户与 8288）[8]。
misconception: 误解：交易 nonce 能防止重复使用。事实：nonce 防的是重放；签名材料只要发出去，即使交易没上链，索引也已经用掉了。
deeper: [31] NIST SP 800-208 §1.2
```

```prereq B-3 l1 5min
# 格签名：找一个“又对又短”的解
what: 格是高维空间里规则排列的点。在特定的格里找很短的向量，已知算法都很慢。Falcon 的私钥是一扇“陷门”，让签名者能找到满足方程、而且足够短的解；验证者只检查方程和长度。
why: Falcon 的验证几乎全是代数运算，只算很少几次哈希 [1]。这让它特别适合被代数型证明系统（Aerie）高效证明。
example: Falcon 验证：$s_1 + h \cdot s_2 \equiv c \pmod{q}$，且 $\|(s_1,s_2)\|^2 \le \beta^2$，$c$ 由盐和消息哈希得到 [3]。
misconception: 误解：格签名就是 Falcon。事实：ML-DSA 也是格签名，已是 FIPS 204 标准；Falcon 对应的 FN-DSA 还没有草案 [29][33]。
deeper: [3] Aerie specs/falcon.md §2
```

```prereq B-4 l1 5min
# 用证明来“聚合”签名
what: 聚合者把“逐个验签”的程序放进证明系统运行，输出一个证明：这批签名全部通过。其他节点只验证这个证明。递归是指再把几个证明当输入，证明“它们都有效”，合成一个新证明。
why: 两条路线的差别就在这里。哈希签名的验证要算几百次哈希，而证明一次哈希比算一次贵两个数量级 [1][6]。所以 leanVM 要把工作分给多台机器，再递归合并。
example: leanVM 2-to-1 递归：0.29 s，输出 201.5 KiB [6]。
misconception: 误解：SNARK 就是椭圆曲线证明。事实：SNARK 描述的是“简洁、非交互”；Aerie 是格型 SNARK，STARK 是哈希型的。
deeper: [2] Aerie 论文 §1.2
```

```prereq B-5 l2 3min
# 帧交易（EIP-8141）
what: 把一笔交易拆成多个“帧”：验证帧、付费帧、执行帧。账户自己写验证逻辑，用任意签名方案授权。
why: EIP-8288 就是给 8141 加一种新帧（mode 4）。8141 已排进 Hegotá，预计 2027 Q2 上主网 [12][36][38]。
deeper: [12] EIP-8141
```

## J 两种签名的原理 {depth=2}
哈希签名和格签名都抗量子，但它们“相信”的东西不同。图 1 把两者的验证过程放在一起。

```excalidraw q="哈希签名和格签名，验证时分别在检查什么？" read="上面一行是 XMSS：先用一次性签名恢复叶子公钥，再沿 Merkle 路径算到根。下面一行是 Falcon：算出目标 c，检查一个方程和一个长度上限。红色表示证明系统里最贵的部分。" takeaway="哈希签名的验证是几百次哈希；Falcon 的验证是一次环方程加范数检查，只有 HashToPoint 一处哈希。证明成本差距由此而来。" kind=原理对比
{"grid": {"w": 270, "h": 120}, "defaults": {"w": 200, "h": 64, "fontSize": 16},
 "nodes": [
   {"id": "x1", "label": "签名：一次性签名 + 路径", "col": 0, "row": 0, "color": "blue"},
   {"id": "x2", "label": "哈希链：恢复叶子公钥", "col": 1, "row": 0, "color": "red"},
   {"id": "x3", "label": "Merkle 路径：算到根", "col": 2, "row": 0, "color": "red"},
   {"id": "x4", "label": "根 = 公钥？", "col": 3, "row": 0, "color": "green"},
   {"id": "f1", "label": "签名：盐 + 短向量 s2", "col": 0, "row": 1, "color": "blue"},
   {"id": "f2", "label": "HashToPoint：算目标 c", "col": 1, "row": 1, "color": "yellow"},
   {"id": "f3", "label": "方程：s1 + h·s2 = c", "col": 2, "row": 1, "color": "blue"},
   {"id": "f4", "label": "范数够短？编码合法？", "col": 3, "row": 1, "color": "green"}
 ],
 "edges": [
   {"from": "x1", "to": "x2"}, {"from": "x2", "to": "x3"}, {"from": "x3", "to": "x4"},
   {"from": "f1", "to": "f2"}, {"from": "f2", "to": "f3"}, {"from": "f3", "to": "f4"}
 ]}
```

```finding F2 high
# 哈希签名只信哈希，但有“状态”和“体积”两笔账
claim: 有状态哈希签名的安全性只依赖哈希的原像类困难性，量子计算机预计不会破坏它；但同一索引签两条不同消息就会被伪造。leanXMSS 签名 2,404 B，是 BLS 的约 25 倍；无状态的 leanSPHINCS 为 4,276 B，SLH-DSA-128s 为 7,856 B。
evidence: [observed] NIST SP 800-208 §1、§1.2 [31]（H1、H3）；leanXMSS 与 leanSPHINCS 规范 [8]（H4、H10）；FIPS 205 Table 2 [30]（H11）。
implication: 共识层可以拿 slot 当状态；账户层必须用无状态方案，签名会再大一倍。哈希路线的“保守”是有体积代价的。
```

```finding F6 high
# Falcon 小而快，难点在签名端和标准
claim: Falcon-512 公钥 897 B、签名 666 B，单核验证约 16 µs。它的签名端依赖浮点高斯采样，存在平台、侧信道和内存问题。NIST 在 2026-09-28 宣布 FN-DSA 将强制用定点运算，并说“已批准的签名过程版本数为 0”；截至 10-20，FIPS 206 没有公开草案。
evidence: [observed] Aerie spec 参数表 [3]（L4）；Aerie 论文 §6.3 [2]（L6）；ePrint 2026/1531、2026/2313 [44]（L7、L9）；NIST pqc-forum [32]（L10、L11）；NIST 出版物列表 [33]（L12）。[inferred] FN-DSA 的最终编码仍可能变化（L13）。
implication: 选 Falcon 的项目今天用的都是“预标准”版本。Algorand 用的是确定性变体，与 NIST 公布的 FN-DSA 方向不同（F10）。
```

ML-DSA 也是格签名，但走的是另一条构造：Fiat–Shamir with aborts，基于 Module-LWE 和 SelfTargetMSIS [29]（L2）。它已是标准，也有 HSM 支持。但它的签名大（ML-DSA-65 为 3,309 B）。它的哈希还依赖签名本身，所以 Aerie “把哈希留在证明外”的技巧用不上 [1]（L3、L37）。

## K 运行例子：一个 slot 的 32,768 个签名 {depth=2}
两条路线面对的是同一道题：一个 slot 里有约 32,768 个验证者签名，要在几秒内让全网相信它们都有效。a16z 的说法是 Aerie 单机能“大致处理一个 Ethereum slot 的签名量”[1]（S2）。

| 做法 | 谁做 | 输出 | 主要代价 |
|---|---|---|---|
| BLS（今天） | 任意节点相加 | 96 B | 不抗量子 |
| leanXMSS + leanVM | 多个聚合者各证一片，再递归合并 | 每个证明约 200–320 KiB | 证明哈希贵，需要多台高配机器和多轮递归 |
| Falcon + Aerie | 一台机器一次证明 | 含盐 1.3 MB；共同盐估算 66 KiB | 单点要收齐全部签名；不能合并别人的证明 |

两种做法都没有消除计算，只是改变了计算发生的位置、证明的传播方式，以及有多少节点要重复计算（S3）。

## L XMSS + leanVM：Ethereum 共识怎样聚合哈希签名 {depth=2}
**一句话**：leanXMSS 负责签名，leanVM 负责证明“一段逐个检查 leanXMSS 签名的程序运行成功了”。leanVM 不碰私钥，也不参与签名 [10]（H29）。

图 2 是 EIP-8292 定义的流程。

```uml q="一个 slot 的投票，怎样从几万个 leanXMSS 签名变成区块里的一个证明？" read="简化：只画一个子网、两个叶子聚合者。叶子聚合和递归聚合由自愿报名的聚合者做；区块级折叠是提议者的职责。" takeaway="证明工作集中在少数高配节点；普通节点只验证一个证明，几毫秒。"
sequenceDiagram
  autonumber
  participant V as 验证者（数万）
  participant A1 as 叶子聚合者 1
  participant A2 as 叶子聚合者 2
  participant R as 递归聚合者
  participant P as 提议者
  participant N as 全网节点
  V->>A1: 用 slot 号作索引签投票
  V->>A2: 同一条投票消息
  A1->>A1: leanVM 证明一批签名有效
  A2->>A2: leanVM 证明另一批
  A1->>R: 叶子证明
  A2->>R: 叶子证明
  R->>R: 2-to-1 递归合并
  R->>P: 聚合证明
  P->>P: 折叠多条消息（≤ 8 条）
  P->>N: 区块级证明
  N->>N: 验证一个证明（约 5 ms）
```

**当前数字（leanVM @3a37fb6，2026-10-18，M4 Max，未用 GPU）** [6]（H22、H24、H25）：

| 任务 | 规模 | 时间 | 证明大小 | 峰值内存 |
|---|---|---|---|---|
| 聚合 leanXMSS | 1,290 个 | 0.95 s（1,362 个/秒） | 318 KiB | 15.5 GiB |
| 聚合 leanSPHINCS | 850 个 | 1.0 s | 326 KiB | 16.1 GiB |
| 2-to-1 递归 | 两个 900 签名的叶子 | 0.29 s | 202 KiB | 14.7 GiB |

```finding F3 high
# leanXMSS + leanVM 是能跑的原型，但签名方案和哈希都还在变
claim: EIP-8292 把聚合者定为自愿、不设质押门槛的高配角色，叶子与递归聚合归聚合者，区块级折叠归提议者；目标是证明典型 185–230 KiB、1,000 个签名在 16 核上约 2.6 s。leanVM 已换成二进制域 + WHIR，BLAKE2s 只是占位哈希，自述“not (yet) production ready”。10-17 签名方案换成两层 leanXMSS，README 吞吐从 1,651 降到 1,362 个/秒。
evidence: [observed] EIP-8292 [10]（H28、H29、H30）；leanVM README @127510d1 与 @3a37fb6 [6]（H17、H19、H21、H22）；PR #640 [7]（H4）。[inferred] 两个吞吐数字测的是不同签名方案，不能混算（H23）。
implication: 任何“leanVM 每秒多少签名”的数字都要带 commit。哈希函数没定，意味着签名、证明和 8288 的 `DEPS_HASH` 都还会变。
```

```finding F4 medium
# 递归是哈希路线的力量，也是它最被攻击的地方
claim: 递归让 leanVM 能把工作分给多台机器、合并别人的证明。a16z 批评说，每一步递归都在证明“做 Fiat–Shamir 用的哈希”。因此组合后的安全性“连在随机预言机模型里都无法建立”。学界确实承认递归 STARK 的安全分析只有启发式依据。另一面，leanVM 声明 128-bit ROM（64-bit QROM），EIP-8292 写的是约 124 / 62 位，两份文件口径不一。截至 10-20，没找到 EF 对这一批评的直接回应。
evidence: [observed] a16z 博客 [1]（H54）；Chiesa 等人 ePrint 2023/1646 [41]（H55）；leanVM README [6]（H19）；EIP-8292 安全一节 [10]（H20）；推文与论坛检索（H57）。[inferred] 这是证明模型层面的缺口，不是对 leanVM 的攻击（L41）。
implication: “哈希路线更保守”只对原语成立。整套系统还要加上递归组合的假设。
```

```finding F5 medium
# 哈希路线自己也有标准化和硬件问题
claim: leanXMSS / leanSPHINCS 都不是 NIST 参数集，leanVM 的哈希还没选定，共识规范 leanSpec 仍按 KoalaBear 编码 XMSS。硬件钱包友好的 SPHINCS- 变体在 Ledger 上签一次要 47.5–390 秒。早期 Poseidon2 被“跳轮攻击”削弱了安全余量，Ethereum 已转向不依赖电路友好哈希的二进制域方案。
evidence: [observed] leanVM README [6]（H17）；leanSpec 提交 `0b7d33e`（H26）；SPHINCS- 帖 [43]（H14）；Poseidon Initiative 幻灯片与 ePrint 2026/1692 [40]（H59、H60）。[inferred] “小域 Poseidon 被攻破”应收窄为“缩减轮数攻击 + 余量被侵蚀”（H61）。
implication: a16z 说哈希路线“非标准、哈希未定”是事实；但同样的批评也部分适用于 Falcon（F7）。
```

## M Falcon + Aerie：a16z 怎样聚合格签名 {depth=2}
**一句话**：Aerie 是一个专门证明“这一批 Falcon 签名全部有效”的格型 SNARK。验证者自己算哈希，证明只涵盖代数部分。

图 3 对比两条路线把什么放进了证明。

```excalidraw q="leanVM 和 Aerie 分别把哪些计算放进证明里？" read="左列是 leanVM 证明 XMSS：所有哈希都在证明里（红）。右列是 Aerie 证明 Falcon：HashToPoint 留给验证者自己算（黄），证明只覆盖方程、范数和编码（蓝）。" takeaway="Aerie 快的主要原因，不是格的数学更简单，而是 Falcon 的验证几乎没有需要证明的哈希。代价是验证者要拿到每个签名的 40 B 盐。" kind=证明边界对比
{"grid": {"w": 360, "h": 100}, "defaults": {"w": 300, "h": 60, "fontSize": 16},
 "nodes": [
   {"id": "lt", "label": "leanVM：证明里有什么", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "l1", "label": "数百次哈希链与 Merkle 路径", "col": 0, "row": 1, "color": "red"},
   {"id": "l2", "label": "递归：验证子证明", "col": 0, "row": 2, "color": "red"},
   {"id": "l3", "label": "输出：约 200–320 KiB", "col": 0, "row": 3, "color": "green"},
   {"id": "at", "label": "Aerie：证明里有什么", "col": 1, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "a0", "label": "证明外：验证者算 HashToPoint", "col": 1, "row": 1, "color": "yellow"},
   {"id": "a1", "label": "证明内：方程 + 范数 + 编码", "col": 1, "row": 2, "color": "blue"},
   {"id": "a2", "label": "输出：66 KiB 证明 + 每签名 40 B 盐", "col": 1, "row": 3, "color": "green"}
 ],
 "edges": [
   {"from": "lt", "to": "l1"}, {"from": "l1", "to": "l2"}, {"from": "l2", "to": "l3"},
   {"from": "at", "to": "a0"}, {"from": "a0", "to": "a1"}, {"from": "a1", "to": "a2"}
 ]}
```

**它怎么工作** [2][3]（L15–L17）：
1. 输入是 N 条（公钥、消息、40 B 盐），N 最多 65,536，同一个证明里不能混用 Falcon-512 和 1024。
2. 验证者用盐和消息自己算出每条签名的目标 $c_i$。这个“公开盐”思路出自 Aardal 等 2024 年的 LaBRADOR 聚合，不是 Aerie 首创。
3. 证明者用 Akita 承诺签名数据。Akita 是基于 Module-SIS 的格多项式承诺。
4. 用三段 sum-check 把方程、范数、编码约束归约成一次批量打开。
5. 规范编码也被证明。先前方案没做这一步，可能接受标准验证器会拒绝的签名。
6. 没有递归。

**数字怎么读**（Apple M4 Max，16 线程，无 GPU，7 次中位数，不含签名生成；大小含盐，不含验证者自带的公钥和消息）[2][3]（L19–L23、L26、L27）：

| 读法 | 数字 | 注意 |
|---|---|---|
| 证明 32,768 个 Falcon-512 | 0.645 s，约 50,800 个/秒 | 单线程 4.3 s，约为逐个验签的 8 倍 |
| 聚合物大小 | 1,346 KiB（约 42 B/签名，其中 40 B 是盐） | 默认不是常数大小 |
| “66 KiB” | 共同盐模式的估算值 | 需要额外的非标准假设，仓库不提供这种签名器 |
| 验证 | 单线程 53.6 ms，16 线程 11.6 ms | 比逐个验签快 10 倍 / 3.7 倍；70% 时间花在算哈希 |
| 对 leanVM（同机，@127510d1） | 吞吐 29 倍（全核）、39 倍（单线程） | leanVM 的递归证明验证更快：约 6 ms |
| 对 leanVM 递归树（论文建模，不计网络） | 33,300 个签名：2.0 s 对 0.65 s | leanVM 能分给多台机器，Aerie 不能 |
| 峰值内存 | 2.1 GiB | leanVM 当前约 15.5 GiB |

```finding F7 high
# Aerie 很快，但“66 KiB”和“29 倍”都要带口径读
claim: Aerie 在 M4 Max 上 0.645 s 证明 32,768 个 Falcon-512 签名。默认聚合物是 1,346 KiB，因为每个签名要带 40 B 盐。66 KiB 是共同盐模式下的估算值；这个模式的不可伪造性“没有已知的标准格归约”。29 倍是同机全核吞吐，leanVM 的证明验证反而更快。Aerie 只证明了经典 ROM 下的安全性，两个证明也不能合并。
evidence: [observed] Aerie README 与基准表 [3]（L19、L20、L21、L32）；论文 Table 2–5 与 §7 [2]（L22、L26、L27、L36）；spec §10.1 [3]（L30）。三方吞吐绝对数不一致（L29）。
implication: 比较两条路线要看端到端：收集、证明、传播、验证四段时间。还要看总机器资源和失败后的恢复，不能只看峰值吞吐。
```

```finding F8 high
# 两套聚合实现都自称未达生产
claim: Aerie README 写“research release… Neither parameter set has passed the production acceptance criteria”，并说不保证兼容最终 FIPS 206。leanVM README 写“not (yet) production ready”，形式化验证仍在进行。Aerie 论文还披露，实现、基准和部分安全证明的推导大量使用了 AI 模型。
evidence: [observed] Aerie README Status [3]（L35）；Aerie 论文 AI Assistance 节 [2]（L39）；leanVM README [6]（H19）。
implication: 这场争论定的是 2027 年以后的默认选择。今天任何项目都不应该把某一套聚合实现当作已就绪的依赖。
```

## N 各生态的立场与理由 {depth=2}
下表把各方论点拆成“它说了什么”和“核对后的事实”。

| 谁 | 说了什么 | 核对 |
|---|---|---|
| Vitalik（10-07） | AI 加速数学的新风险集中在 ML-DSA / FHE / 格；lean 路线“no lattices, no ML-DSA, no Falcon” | 原文属实 [16]（H38） |
| Vitalik（06-15） | 依赖要少，基础层“purely hash-based”，少维护基础设施 | 原文属实 [13]（H37） |
| Justin Drake（10-07） | “bunker mode”，全面转向哈希、避开结构化假设 | 原文属实 [18]（H40） |
| Eli Ben-Sasson（10-18） | 格结构多、易被 AI 攻；module-SIS 简洁方案 2012 年才有；再等 3–5 年 | Module-SIS 确于 2012 年定义 [35]（H47、H48） |
| a16z（10-16） | 单机快、不递归；递归安全难证；lean 系列非标准；隐私终要格 | 数字与原文属实；“非标准”对 Falcon 也部分成立（L40、L42、L44、L45） |
| Justin Thaler（10-16） | 格去掉递归和定制签名，这一收益应与“更推测性的”格攻击风险权衡 | 原文属实 [21]（L47） |
| Algorand | 紧凑、验证快、确定性算术、延续 State Proofs | 已上线原生 Falcon-1024 账户 [25][26]（L48、L51） |

```finding F9 high
# Ethereum 的“哈希偏好”是协议层偏好，不是研究范围
claim: Vitalik 和 Drake 的公开理由有两条：协议依赖最少，以及 AI 可能先攻破有结构的数学。strawmap 把“hash-based 的 PQ L1”列为五个 north star 之一。但 pq.ethereum.org（06-27）仍把 Falcon、Dilithium 列为执行层候选，PSE 也做过 Falcon + LaBRADOR 聚合基准。Vitalik 自己承认公钥加密不能只靠哈希。
evidence: [observed] Vitalik 推文与 Magicians 回复 [16][13]（H37、H38、H39）；Drake 推文 [18]（H40）；strawmap [45]（H41）；pq.ethereum.org [46]（H43）；PSE 帖 [42]（H45）。[inferred] EF 各文本之间没有公开调和（H44）。
implication: 不要把 Ethereum 的立场读成“格不安全”。它的核心诉求是“协议层少背密码学”，这和 EIP-8288 是一脉相承的。
```

```finding F10 high
# Starknet 是“证明层哈希、账户层自由”，Algorand 是唯一押注格并上线的大链
claim: StarkWare 称 STARK 承诺只依赖哈希。S2morrow 与 OpenZeppelin 都发布了 Falcon-512 账户实现，OZ 版未审计。StarkWare 路线图还提到用 Falcon-512 做链上共识签名。Algorand 的原生 Falcon-1024 账户随 v5.0.0（2026-08-12 发布）上线，用确定性变体，不改共识参与密钥。Solana 的 Alpenglow 共识用 BLS，计划 2026-10-21 主网激活；Falcon 只有原型。
evidence: [observed] StarkWare 两篇博客 [22][23]（H50、H51）；OZ 仓库 [24]（H53）；Algorand 开发者文档与 release [25][27]（L48、L49、L50）；Solana 两页 [28]（L53、L54）。[inferred] Starknet 不是反 Falcon（H52）。[speculative] Eli 的“module-SIS”批评主要针对格型简洁证明（Akita），而不是基于 NTRU 的 Falcon 签名（H49）。
implication: “签名用格、证明用哈希”是一个已经在跑的组合。Mantle 不需要在两个阵营里二选一。
```

**a16z 的四条论点，逐条看**：
1. **性能与简单**：单机证明整批，不用递归。聚合者失败时，任何持有同一批签名的节点都能重做 [1]（S9）。核对：属实，但前提是一个节点要先收齐全部签名；签名怎样汇聚到这个节点，论文没有建模（S9）。
2. **递归安全**：见 F4。这是证明模型的批评，不是攻击（L41）。
3. **非标准**：lean 系列确实不是 NIST 参数集 [6]（L43）。但 FN-DSA 也没有草案，Aerie 也只是研究发布，所以这条对 Falcon 同样部分成立（L44）。
4. **隐私**：公钥加密不能由哈希黑盒构造，隐私链最终要依赖格（ML-KEM）[1]（L45）。Vitalik 的对策是把加密 note 放到链下 [16]（L46）。

**AI 风险有多实？** 2026 年确实出现过 AI 辅助攻击格类方案：Anthropic 用模型改进了 HAWK 密钥恢复，HAWK 于 07-29 撤回 [34]（L57、L58）。但 HAWK 基于格同构问题，不是 SIS / LWE / NTRU；Anthropic 明说不影响一般的格密码。截至 10-20，本次调研没找到针对 Falcon 或 ML-DSA 本体的公开 AI 攻击（L59，speculative）。

## O 优劣势对比 {depth=2}
下表是基于前面各面板的工程归纳，不是给整个家族打分（S4）。

| 维度 | XMSS / SPHINCS + leanVM | Falcon + Aerie |
|---|---|---|
| 底层假设 | ok 只依赖哈希，研究历史最长 | warn 格问题；Akita 用 Module-SIS（2012 年定义） |
| 组合安全 | warn 递归组合只有启发式分析 | warn 只证经典 ROM，无 QROM 声明 |
| 签名大小 | no 2.4–4.3 KB | ok 666 B |
| 签名端 | warn 共识可用 slot 管状态；无状态方案签名慢 | warn 浮点采样与侧信道，正在改定点 |
| 证明吞吐 | warn 1,362 个/秒/机，需多机 | ok 约 50,000 个/秒/机 |
| 证明内存 | no 约 15 GiB | ok 约 2 GiB |
| 证明验证 | ok 约 5–6 ms | warn 单核约 54 ms，随批量线性增长 |
| 聚合物大小 | ok 约 200–320 KiB，与签名数基本无关 | warn 默认约 42 B/签名（盐） |
| 能否合并别人的证明 | ok 能（递归） | no 不能 |
| 标准与成熟度 | warn 定制参数、哈希未定、未就绪 | warn FN-DSA 无草案、研究发布 |

```finding F1 high
# 争论的是三层选择，组合可以混搭
claim: 签名层（哈希 / 格）、聚合证明层（哈希型 STARK / 格型 SNARK）和协议接口层（预编译 / EIP-8288）可以独立选择。Starknet 已经是“证明层哈希 + 账户层 Falcon”；EIP-8288 的设计则是“协议只验一种哈希型证明，账户可以把任意签名包进 STARK”。
evidence: [observed] StarkWare [22]（H50）；EIP-8288 原文 [11]（E5）；Vitalik 2026-09-09 推文 [17]（E29）。[inferred] 三层拆分与混搭的可行性（S1）。
implication: 讨论“选哪条路”之前，先说清楚在选哪一层。对 Mantle 来说，账户层的签名选择和 L2 证明系统的选择不必绑定。
```

## P EIP-8288：把验签变成“交易依赖” {depth=2}
**它是什么。** EIP-8288（Draft，作者 Vitalik 与 Thomas Coratger，2026-06-03 创建，最近一次修改 10-15）给 EIP-8141 加一种新帧：mode 4 的“依赖验证帧”[11]（E1–E3）。

- 帧里放 1–256 个 96 字节的三元组 `(scheme, data_hash, verification_key_hash)`。
- 这个帧**不执行 EVM 代码**。它只声明“区块里必须有证明，证明这些依赖成立”。
- 区块头新增 `recursive_stark` 字段：一个递归 STARK，证明全区块所有依赖都成立。
- 账户的验证帧用 `FRAMEPARAM` / `FRAMEDATACOPY` 读出这些三元组。
- 账户自己判断两件事：公钥是不是我的授权公钥；签的是不是这笔交易。

图 4 用 Alice 给 Bob 转账走一遍。

```uml q="一笔 PQ 转账在 EIP-8288 下怎样从钱包走到区块？" read="依据规范 Test Case 1 与 mempool / builder 章节整理，简化为一跳 mempool。帧 0 的 data_hash 写成全零，代表“本交易的签名哈希”，避免自引用。" takeaway="原始签名只在第一跳出现；之后传播的是递归 STARK。验证节点从头到尾看不到 Alice 的签名，只验一个区块证明，再照常执行账户逻辑。"
sequenceDiagram
  autonumber
  participant W as Alice 钱包
  participant M as mempool 节点
  participant B as builder
  participant N as 验证节点
  W->>W: 帧0 依赖(0x10, 全零, 公钥)；帧1 验证；帧2 转账
  W->>W: 用 leanSPHINCS 签交易签名哈希
  W->>M: mode 0 wrapper：交易 + 原始签名
  M->>M: 逐个验签，每 1 秒并入一个递归 STARK
  M->>B: mode 1 wrapper：交易 + 一个 STARK
  B->>B: 选交易，删掉未入块的依赖，再递归一次
  B->>N: 区块（头里带 recursive_stark）
  N->>N: 重算依赖摘要，验证 STARK
  N->>N: 执行帧1：检查依赖里的公钥与哈希
  N->>N: 执行帧2：转账给 Bob
```

**成本。** 每个 leanSPHINCS 依赖：帧执行 gas 3,000，另加 30,000 计入 intrinsic gas，合计约 33,000 gas；交易回滚也照收 [11]（E13、E14、E15）。链上数据每个依赖 96 B，加上每个区块一个约 100–300 kB 的 STARK [17]（E30）。

```finding F11 high
# 8288 的核心：协议只验一种证明，算法留给账户
claim: Vitalik 10-19 写道：“The ideal route to support everyone's cryptography is imo through 8288. You make whatever signature you want locally, then STARK it… Ethereum can then never add a new precompile again.” 他在 Magicians 解释动机是基础层“purely hash-based”、少维护基础设施。规范本身也写明：用 leanSPHINCS 以外的签名，要么明文上链付 gas，要么在客户端包进 STARK，走 leanSTARK 路线。
evidence: [observed] Vitalik 推文 [14][15]（E26、E27、H42）；Magicians 5 楼 [13]（E28）；EIP-8288 Rationale [11]；Vitalik 2026-09-09 推文 [17]（E29）。
implication: 8288 不是又一个账户抽象提案，而是在回答“协议该原生支持多少种密码学”。它的答案是：一种。
```

```finding F12 high
# 当前草案只支持 leanSPHINCS，“任意签名 STARK 一下”还走不通
claim: 依赖帧目前只接受 leanSPHINCS（0x10）；leanSTARK（0x11）是预留值，在定义 `get_deps_hash` 之前使用即无效。`AGGREGATED_VK`、`DEPS_HASH` 和参考实现都还是 TBD。规范 Gas 一节仍按 KoalaBear 域描述，而 leanVM 已改成二进制域。手机或钱包端为 Falcon / ML-DSA 生成 STARK 的成本，没有公开基准。
evidence: [observed] EIP-8288 @72ca2dd [11]（E5、E8）；leanVM README [6]（E50）。[inferred] 规范与实现口径不一致（E23）；“自选签名再 STARK”当前不可用（E31）。[speculative] 客户端生成 STARK 的可行性（E34）。
implication: Vitalik 描述的是终局方向，不是当前能力。今天能被 8288 原生聚合的只有哈希签名。
```

```finding F13 high
# 8288 不在 Hegotá；L1 上 PQ 预编译路线也被叫停
claim: EIP-8081（Hegotá）的 SFI 只有 FOCIL 和 EIP-8141；ML-DSA 预编译 EIP-8355 先被 EF 评为 C 档“premature standardization”，10-19 列为 Declined；7885 / 8051 / 8052 和 8288 都不在任何一栏。Vitalik 希望 8288 进入 Hegotá 之后的 I* 分叉，这只是作者期望。ethereum.org 预计 Hegotá 在 2027 Q2 上主网。
evidence: [observed] EIP-8081 [36]（E37、E38）；EF 分级博客 [37]（E37、E40）；Vitalik 2026-09-09 推文 [17]（E29）；ethereum.org Hegotá 页 [38]（E41）。
implication: L1 近期给的是框架（8141），不是算法。等 L1 标准化 PQ 预编译，可能等不到。
```

## Q 预编译 vs EIP-8288 {depth=2}
| 维度 | PQ 验签预编译（8355 / 8051 / 8052） | EIP-8288 依赖帧 + 区块递归 STARK |
|---|---|---|
| 谁验签 | 每个全节点在 EVM 里逐笔验 | 首跳 mempool 与 builder 验原始签名；全网只验每块一个 STARK |
| 链上数据 | 每笔带公钥 + 签名（ML-DSA-65 约 5.3 KB） | 每个依赖 96 B + 每块一个 100–300 kB 证明 |
| 执行 gas | ML-DSA-65 约 9,000（8355） | 每个 leanSPHINCS 依赖约 33,000 |
| 加新算法 | 每种一次硬分叉 | 不改 EVM，走 leanSTARK（尚未定义） |
| 客户端负担 | 每种算法每个客户端一份共识实现 | 一个 leanVM 验证器；mempool 与 builder 要做重型证明 |
| 安全假设 | 只看所选签名 | leanSPHINCS + STARK 与递归 + `DEPS_HASH`；走 STARK 路线还要加上原签名 |
| 对 L2 的可移植性 | ok 高：L2 可以自加，有 RIP-7212 先例 | no 低：要 8141、区块头字段、聚合基础设施 |
| 状态 | Draft；8355 被拒 | Draft；不在 Hegotá |

来源：EIP 原文与分级 [11][36][37][38]（E36、E43）。

注意一点：把 Falcon 包进 STARK，并不会消除 Falcon 的假设。外层证明只保证“验签程序运行通过”，签名本身是否可伪造仍取决于 Falcon（S5）。

## R 对前两篇的修订：三篇怎样连成一条线 {depth=2}
图 5 是三篇报告的分工，以及本篇对前两篇的修订落在哪里。

```excalidraw q="三篇 PQ 报告各回答什么？本篇改了前两篇的哪些地方？" read="蓝框和绿框是三篇报告；下排黄框是本篇提出的修订，虚线指向被修订的那一篇。" takeaway="第一篇定“迁什么”，第二篇定“近期怎么做账户”，第三篇定“长期选什么、接口怎么留”。修订集中在第二篇的预编译定位、地址和时间线。" kind=系列关系
{"grid": {"w": 330, "h": 120}, "defaults": {"w": 260, "h": 64, "fontSize": 16},
 "nodes": [
   {"id": "p1", "label": "第一篇：迁什么（威胁清单）", "col": 0, "row": 0, "color": "blue"},
   {"id": "p2", "label": "第二篇：近期账户容灾", "col": 1, "row": 0, "color": "blue"},
   {"id": "p3", "label": "第三篇：选型与接口", "col": 2, "row": 0, "color": "green", "strokeWidth": 3},
   {"id": "r3", "label": "8288 不能聚合 SP1 证明", "col": 0, "row": 1, "color": "yellow"},
   {"id": "r1", "label": "预编译 = 过渡工具", "col": 1, "row": 1, "color": "yellow"},
   {"id": "r2", "label": "地址区间与 AA 时间线", "col": 2, "row": 1, "color": "yellow"}
 ],
 "edges": [
   {"from": "p1", "to": "p2"}, {"from": "p2", "to": "p3"},
   {"from": "r3", "to": "p1", "dashed": true}, {"from": "r1", "to": "p2", "dashed": true},
   {"from": "r2", "to": "p2", "dashed": true}
 ]}
```

| # | 原说法 | 现在的判断 | 依据 |
|---|---|---|---|
| R1 | 第二篇：首期引入独立 ML-DSA-65 预编译 | 保留，定位改为近期容灾工具。L1 认为同类预编译“过早”，终局方向是不再加预编译 | E26、E37、E47 |
| R2 | 第二篇：借鉴 8355，消息为 32 B 摘要 | 有误。8355 的消息是末尾变长字节，按 FIPS 204 验原始消息，专门反对固定 32 B 预哈希 | E36、E44 |
| R3 | 第二篇：用 `>0x0100`（如 `0x0101`）的“专有命名空间”彻底隔离 | 需修订。EIP-7587（Final）把 `0x0100–0x01ff` 留给 RIP 流程，P256 就在 `0x100`；应走 RIP 注册或先查注册表 | E39、E45 |
| R4 | 第二篇台账 #47：Native AA 2028–29 年前难以定稿 | 过时。8141 已排进 Hegotá，预计 2027 Q2，且与第一篇说法矛盾 | E40、E41、E46 |
| R5 | 第二篇：适配器屏蔽预编译地址 | 保留并扩大：抽象“验证后端”（预编译 / SP1 内验证 / 将来的依赖内省） | E48 |
| R6 | 第二篇：Falcon-512 只作紧凑对照 | 补充：单列 Falcon 实验线，测它在 Mantle 证明路径里的真实成本 | S6 |
| R7 | 第一篇：证明路径需要“L1 侧聚合（如 EIP-8288）” | 加限定：8288 只聚合 leanSPHINCS 和尚未定义的 leanSTARK，不能直接聚合 Mantle 的 SP1 证明 | E49 |
| R8 | 第一篇：leanVM 自述未就绪、哈希未定（@127510d1） | 仍成立，补充：已是二进制域 + WHIR，BLAKE2s 占位；10-17 换成两层 leanXMSS，引用数字要带 commit | E50、H4、H23 |
| R9 | 第一篇：Starknet 有 1 笔 Falcon 账户演示 | 更新：S2morrow 与 OpenZeppelin 都有 Falcon-512 账户实现，路线图提到 Falcon 共识签名 | H50、H51 |

```finding F14 high
# 第二篇的近期方案站得住，但有三处事实要改
claim: “合约账户 + 原始签名 + 预编译或 SP1 内验签”仍是近期最直接的 PQ 授权路径。要改的是：8355 的消息格式写错了；`0x0101` 位于 EIP-7587 保留给 RIP 的共享区间，不是专有空间；Native AA 不是 2028–29，而是 8141 预计 2027 Q2 随 Hegotá 上线。
evidence: [observed] EIP-8355 [39]（E36、E44）；EIP-7587 [39]（E45）；EIP-8081 与 ethereum.org [36][38]（E40、E41）。[inferred] 台账 #47 已过时（E46）；预编译应定位为过渡工具（E47）。
implication: 第二篇的工程方向不用推翻，但对外引用时要带上这三处修订。
```

## S 对 Mantle 的意义 {depth=2}
以下全部是推论或推测，不是 Mantle 的既定计划。

```finding F15 medium
# 账户面向“验证后端”，而不是某个预编译地址
claim: 如果账户的验证逻辑直接写死某个预编译地址，未来换算法、换地址或改走依赖内省时，都要迁移账户。如果账户只认“验证后端”接口，后端可以是预编译、SP1 内验证，将来也可以是 8288 式的依赖帧检查。注意 8288 只对 8141 帧交易有效，ERC-4337 账户不能直接声明依赖帧。
evidence: [observed] 8288 通过 8141 的 `FRAMEPARAM` / `FRAMEDATACOPY` 暴露依赖 [11][12]（E20）。[inferred] 验证后端抽象（E48）；能登记多把不同算法公钥的账户，可以在 ML-DSA 与 leanSPHINCS 之间切换而不迁移（S7）。
implication: 第二篇的 `PQVerifierAdapterV1` 应从“屏蔽地址”扩大为“屏蔽后端”，并允许一个账户登记多把不同算法的公钥。
```

```finding F16 medium
# PQ 签名聚合在 Mantle 上近期不划算
claim: 规范写到，只有 leanSPHINCS 时，签名不超过约 100 个就直接拼接更省空间。一个 leanVM 证明约 320 KiB。在单一 sequencer 的 L2 上，8288 的多跳递归会退化成 sequencer 单点证明，证明时间直接进入出块延迟。
evidence: [observed] EIP-8288 mempool 一节 [11]、leanVM 基准 [6]、Falcon 聚合盈亏测算 [42]（E18、E33、E59）。[inferred] 盈亏平衡约 100 个签名、单 sequencer 退化、近期先行不现实（E51、E52、E58）。[speculative] SP1 里验证 leanVM STARK 的成本无公开数据，可能成为瓶颈（E54）。
implication: 近期把预算花在账户与权限路径上，不花在聚合上。聚合等 PQ 交易量和 L1 方案都成形再评估。
```

**建议的行动（推论）**：
1. **保留近期方案**：合约账户 + PQ 验签作为高价值资产的容灾路径。预编译定位为过渡工具（R1）。
2. **修正第二篇的三处事实**：8355 消息格式、地址区间、AA 时间线（R2–R4）。选地址前先查 RIP 注册表，或走 RIP 流程（E45）。
3. **抽象验证后端，支持多把公钥**：账户能同时登记 ML-DSA 和 leanSPHINCS 公钥（F15，S7）。
4. **单列 Falcon 实验线**：测 Falcon / ML-DSA 在 op-geth、Kona 和 SP1 中的验签成本。Aerie 只在需要批量聚合时才相关（S6）。
5. **不做 PQ 签名聚合**，直到 PQ 交易量和 L1 方案成形（F16）。
6. **跟踪五个信号**：8141 在 Hegotá 的激活；8288 是否进入 I*，以及 leanSTARK 的定义；FN-DSA 草案；leanVM 的哈希选择；a16z 承诺的“完整论证”和 EF 的回应（S8）。

```callout warn CAUTION
不要因为一份基准就切换整条链的签名选型。Aerie 与 leanVM 都自述未达生产，两边的关键数字在一周内都变过（F3、F8）。
```

## T 局限与开放问题 {depth=2}
- **没有复现**：所有基准都来自作者自报，本次没有独立运行。
- **快速变化**：leanVM 在 10-17 换签名方案，8288 在 10-15 改过规范。本文数字截至 10-20，之后可能失效。
- **双方的关键论证都没写完**：a16z 说“完整论证另文发布”，截至 10-20 未见；EF 对递归安全批评没有正式回应（H57、L60）。
- **AI 风险无法证伪**：双方都没有可检验的证据，本文只核对了已发生的事件（HAWK）。
- **口径冲突**：leanVM README（128 / 64 位）与 EIP-8292（124 / 62 位）；三方吞吐绝对数各不相同（H20、L29）。
- **Algorand v42 主网激活的确切日期**没有一手来源（L52）。
- **Mantle 侧**：PQ 交易量没有预测；SP1 内验证 leanVM 证明、或 Falcon / ML-DSA 的周期数，没有公开数据（E54）。
- **Optimism 对 8141 / 8288 的立场**没有一手资料；Base 曾宣布把 EIP-8130 带到所有 OP Stack 链，后又改推 EIP-8430（E55、E56、E57）。

## U 方法与证据 {depth=3}
**方法。** 三路并行调研：哈希路线（H）、格路线（L）、EIP-8288 与系列修订（E）。每条论断都追到一手来源：
- EIP 原文与 GitHub 提交；
- leanVM / Aerie / leanSig 源码与规范，Aerie 论文；
- NIST 标准与论坛帖；
- 各方推文原文（经 fxtwitter API 取得原文与 UTC 时间）。

台账共 193 行，分册见 `research/notes-*.md`。

**固定版本。**
- EIP-8288 @`72ca2dd`（2026-10-15）；EIP-8081 @`6e69e49`（2026-10-19）。
- leanVM @`3a37fb6`（2026-10-18）与 @`127510d1`（2026-10-15，a16z 比较所用）。
- a16z/aerie @`49b6c21`；Aerie 论文 ePrint 2026/2501。

**对外部调研（GPT）的修正。**
- 8288 的 gas 不是“每依赖 3,000”，而是合计约 33,000，且回滚照收（E14）。
- 漏了区块头里 100–300 kB 的 STARK；“不需要 calldata”只指签名不上链（E30）。
- 漏了 10-17 leanVM 换成两层 leanXMSS；1,362 与 1,770 测的是不同签名方案（H23）。
- “公开盐、哈希留在证明外”不是 Aerie 首创，来自 Aardal 等 2024（L16）。
- 漏了 8355 已被 EF 拒绝、8141 已排期（E37、E40）。
- 把“How STARKs Work Part 6”归给 Eli，证据不足；本文改为直接引用 Eli 推文（H47）。
- FN-DSA 新计划的来源是 NIST 论坛帖，不是 FIPS 204 页面；FIPS 206 没有公开草案（L10、L12）。

## V 复现 {depth=3}
```bash title="核对 EIP-8288 的常量、版本与 Hegotá 状态"
curl -sL https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-8288.md \
  | grep -E "LEANSPHINCS|LEANSTARK|AGGREGATED_VK|DEP_VERIFY"
# 期望：DEP_VERIFY_FRAME_MODE 4；LEANSTARK_SCHEME 0x11 reserved；AGGREGATED_VK TBD
curl -sL https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-8081.md \
  | grep -n "8141\|8355"
# 期望：8141 在 Scheduled；8355 在 Declined
```

```bash title="核对 leanVM 与 Aerie 的自报基准"
git clone --depth 1 https://github.com/leanEthereum/leanVM && grep -A8 "leanXMSS signatures" leanVM/README.md
# 期望（@3a37fb6）：1,290 签名，0.947 s，318.4 KiB，1,362.468 signatures/s
git clone --depth 1 https://github.com/a16z/aerie && grep "32,768" aerie/README.md
# 期望：645 ms | 53.6 ms | 11.6 ms | 1,346 KiB | 66 KiB | 2,113 MiB
```

```bash title="取推文原文与时间"
curl -s https://api.fxtwitter.com/EliBenSasson/status/2111772220389245426 | jq -r .tweet.text
curl -s https://api.fxtwitter.com/VitalikButerin/status/2112015118418473358 | jq -r .tweet.text
```

## W 术语表 {depth=2}
```glossary
PQ | post-quantum，后量子 | 在普通电脑上运行、设计目标是量子计算机也破不了的密码算法。 | 不需要量子硬件
签名聚合 | signature aggregation | 让验证者一次检查就确认一大批签名都有效。 | PQ 签名不能像 BLS 那样直接相加
BLS | BLS12-381 签名 | Ethereum 共识签名，可以相加成 96 字节，不抗量子。 | 不是 PQ
XMSS | eXtended Merkle Signature Scheme | 用 Merkle 树管理很多把一次性签名钥匙的有状态哈希签名。 | 不是无状态的 SLH-DSA
leanXMSS | — | Ethereum 共识计划用的 XMSS 变体，两层树，签名 2,404 B。 | 不是 NIST 参数集
SLH-DSA | FIPS 205，原 SPHINCS+ | NIST 标准的无状态哈希签名，签名 7.8 KB 起。 | 不是 XMSS
leanSPHINCS | SPHINCS- 系列 | 为 Ethereum 定制的无状态哈希签名，签名 4,276 B，EIP-8288 唯一支持的方案。 | 不是 SLH-DSA 标准参数
有状态签名 | stateful signature | 签名者必须记住用过哪些一次性钥匙，重复使用会被伪造。 | nonce 不能代替这个状态
Falcon | FN-DSA 的前身 | 基于 NTRU 格的签名，签名 666 B，验证快，签名端复杂。 | FIPS 206 还没有草案
ML-DSA | FIPS 204，原 Dilithium | 已标准化的格签名，ML-DSA-65 签名 3,309 B。 | 和 Falcon 构造不同
Module-SIS | 模格短整数解问题 | ML-DSA 与 Akita 依赖的格难题，2012 年首次定义。 | Falcon 基于 NTRU，不是它
HashToPoint | — | Falcon 验证里把盐和消息哈希成目标多项式的一步。 | Aerie 把它留在证明外
盐 | salt | Falcon 每次签名随机取的 40 字节，验证要用到。 | 共同盐需要额外假设
SNARK | 简洁非交互论证 | 证明短、验证快的证明系统统称。 | 不一定基于椭圆曲线
STARK | 透明的哈希型 SNARK | 只依赖哈希的证明系统，Starknet 和 leanVM 都用。 | 不是 PQ 签名
递归证明 | recursion | 用一个证明去验证其他证明，把多个证明合成一个。 | 安全分析是启发式的
ROM | random oracle model | 把哈希当成理想随机函数来分析安全的模型。 | 不等于 QROM
QROM | quantum ROM | 允许攻击者用量子方式查询哈希的安全模型。 | 比 ROM 更强的要求
leanVM | 原 leanMultisig | EF 为聚合哈希签名做的最小哈希型 zkVM，自述未就绪。 | 不是通用 zkEVM
Aerie | — | a16z 与 LayerZero 的 Falcon 签名聚合器，研究发布。 | 不能合并证明
Akita | — | Aerie 用的格型多项式承诺，基于 Module-SIS。 | 不是签名方案
EIP-8141 | Frame Transaction | 把交易拆成验证、付费、执行帧，账户自定验证规则，已排进 Hegotá。 | 本身不带 PQ 签名
EIP-8288 | In-mempool aggregation | 给 8141 加依赖帧，区块带一个递归 STARK 证明所有依赖。 | Draft，不在 Hegotá
依赖帧 | dependency frame | 8288 的 mode 4 帧，只声明需要成立的签名或证明，不执行代码。 | 不替账户做授权判断
EIP-8292 | PQ attestation aggregators | 共识层聚合者角色与流程。 | 不改执行层
预编译 | precompile | 客户端原生实现的固定地址合约。 | L2 可以自加
RIP 区间 | 0x0100–0x01ff | EIP-7587 留给 rollup 改进提案的预编译地址段。 | 不是某条链专有
Hegotá | — | Glamsterdam 之后的 Ethereum 分叉，预计 2027 Q2，包含 8141。 | 不是 PQ 分叉
```

## X 参考资料 {depth=2}
1. [a16z crypto：Fast post-quantum signature aggregation with lattice SNARKs（2026-10-16）](https://a16zcrypto.com/posts/article/fast-post-quantum-signature-aggregation-with-lattice-snarks) — 触发事件；a16z 的四条论点与基准摘要。**PRIMARY**
2. [Aerie 论文，ePrint 2026/2501](https://eprint.iacr.org/2026/2501)（[PDF](https://assets.layerzero.network/pdf/aerie.pdf)）— 协议、经典 ROM 安全证明、基准口径、局限。**PRIMARY**
3. [a16z/aerie README 与 specs/falcon.md @49b6c21](https://github.com/a16z/aerie) — 研究发布声明、共同盐假设、基准表。**PRIMARY**
4. [LayerZero：Introducing Aerie](https://layerzero.network/blog/introducing-aerie) — LayerZero 的表述与吞吐口径。**PRIMARY**
5. [Akita，ePrint 2026/1983](https://eprint.iacr.org/2026/1983) — 基于 Module-SIS 的格多项式承诺。**PRIMARY**
6. [leanEthereum/leanVM README](https://github.com/leanEthereum/leanVM)（@3a37fb6 与 @127510d1）— 架构、安全声明、基准。**PRIMARY**
7. [leanVM PR #640 “Double XMSS”（2026-10-17）](https://github.com/leanEthereum/leanVM/commit/55f8b0389c6cceab02dee82a003e40f7d80d0699) — 两层 leanXMSS、Lean 4 安全证明。**PRIMARY**
8. [leanXMSS / leanSPHINCS 规范（leanVM doc-latest）](https://github.com/leanEthereum/leanVM/releases/tag/doc-latest) — 尺寸、成本、状态要求。**PRIMARY**
9. [leanEthereum/leanSig](https://github.com/leanEthereum/leanSig) — 原型实现，未审计。**PRIMARY**
10. [EIP-8292：Post-Quantum Attestation Aggregators](https://eips.ethereum.org/EIPS/eip-8292) — 共识层聚合者角色、目标与安全说明。**PRIMARY**
11. [EIP-8288：In-mempool signature and proof aggregation](https://eips.ethereum.org/EIPS/eip-8288)（@72ca2dd）— 依赖帧、区块递归 STARK、gas、TBD 项。**PRIMARY**
12. [EIP-8141：Frame Transaction](https://eips.ethereum.org/EIPS/eip-8141) — 帧模式、内省指令、签名列表。**PRIMARY**
13. [Ethereum Magicians：EIP-8288 讨论帖](https://ethereum-magicians.org/t/eip-8288-frame-type-for-pq-sig-and-stark-aggregation/28723) — Vitalik “purely hash-based” 回复。**PRIMARY**
14. [Vitalik，2026-10-19：8288 是理想路线](https://x.com/VitalikButerin/status/2112015118418473358) — “never add a new precompile again”。**PRIMARY**
15. [Vitalik，2026-10-19：EIP-8288 maximalism](https://x.com/VitalikButerin/status/2112032009413439704) — 续帖。**PRIMARY**
16. [Vitalik，2026-10-07：AI 与密码学风险](https://x.com/VitalikButerin/status/2107976296320106851) — “no lattices, no ML-DSA, no Falcon”。**PRIMARY**
17. [Vitalik，2026-09-09：A note on recursive STARK mempools](https://x.com/VitalikButerin/status/2097711433073172837) — I* 期望、100–300 kB STARK、客户端包 STARK。**PRIMARY**
18. [Justin Drake，2026-10-07：bunker mode](https://x.com/drakefjustin/status/2107837081313505768) — 全面转向哈希。**PRIMARY**
19. [Eli Ben-Sasson，2026-10-18](https://x.com/EliBenSasson/status/2111772220389245426) — “Strong disagree”。**PRIMARY**
20. [@lex_node，2026-10-18](https://x.com/lex_node/status/2111822591123927371) — Vitalik 所回复的原帖。**PRIMARY**
21. [Justin Thaler 推文串，2026-10-16](https://x.com/SuccinctJT/status/2111136133623251316) — 格 vs 递归的权衡。**PRIMARY**
22. [StarkWare：Starknet’s Quantum Edge](https://starkware.co/blog/starknets-quantum-edge-starks-and-native-account-abstraction/) — 证明层哈希、Falcon-512 账户。**PRIMARY**
23. [StarkWare：Quantum Readiness Roadmap](https://starkware.co/blog/the-architecture-advantage-starknets-quantum-readiness-roadmap/) — Falcon-512 共识签名方向。**PRIMARY**
24. [OpenZeppelin/cairo-pq-verifiers](https://github.com/OpenZeppelin/cairo-pq-verifiers) — Falcon / ML-DSA / WOTS 验证器，未审计。**PRIMARY**
25. [Algorand：Post-Quantum Accounts](https://dev.algorand.co/concepts/accounts/post-quantum/) — v42、确定性 Falcon、局限。**PRIMARY**
26. [Algorand：Technical Brief（Falcon）](https://algorand.co/blog/technical-brief-quantum-resistant-transactions-on-algorand-with-falcon-signatures) — 选型理由。**PRIMARY**
27. [go-algorand v5.0.0](https://github.com/algorand/go-algorand/releases/tag/v5.0.0-stable) — 原生 Falcon-1024 账户发布。**PRIMARY**
28. [Solana：Quantum readiness](https://solana.com/news/quantum-readiness) 与 [Alpenglow](https://solana.com/upgrades/alpenglow) — Falcon 原型、BLS 共识。**PRIMARY**
29. [NIST FIPS 204（ML-DSA）](https://csrc.nist.gov/pubs/fips/204/final) — 构造、假设、尺寸。**PRIMARY**
30. [NIST FIPS 205（SLH-DSA）](https://csrc.nist.gov/pubs/fips/205/final) — 无状态哈希签名尺寸。**PRIMARY**
31. [NIST SP 800-208](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-208.pdf) — 有状态哈希签名的安全与运维要求。**PRIMARY**
32. [NIST pqc-forum：New plan for FN-DSA（2026-09-28）](https://groups.google.com/a/list.nist.gov/g/pqc-forum/c/7z-y5qp-W2Y) — 强制定点。**PRIMARY**
33. [NIST PQC Publications](https://csrc.nist.gov/Projects/post-quantum-cryptography/publications) — 列表中无 FIPS 206。**PRIMARY**
34. [Anthropic：Discovering cryptographic weaknesses with Claude](https://www.anthropic.com/research/discovering-cryptographic-weaknesses) 与 [NIST 新闻（HAWK 撤回脚注）](https://www.nist.gov/news-events/news/2026/05/nine-candidates-advance-third-round-additional-digital-signatures-pqc) — HAWK 事件。**PRIMARY**
35. [Langlois–Stehlé，ePrint 2012/090](https://eprint.iacr.org/2012/090) — Module-SIS / LWE 首次定义。**PRIMARY**
36. [EIP-8081：Hegotá meta](https://eips.ethereum.org/EIPS/eip-8081)（@6e69e49）— SFI 与 Declined 列表。**PRIMARY**
37. [EF：Hegotá EIP Tier List（2026-09-07）](https://blog.ethereum.org/2026/09/07/protocol-hegota-eips) — 8355 “premature standardization”、8141 为 S 档。**PRIMARY**
38. [ethereum.org：Hegotá](https://ethereum.org/roadmap/hegota/) — 预计 2027 Q2。**PRIMARY**
39. [EIP-8355](https://eips.ethereum.org/EIPS/eip-8355)、[EIP-8051](https://eips.ethereum.org/EIPS/eip-8051)、[EIP-8052](https://eips.ethereum.org/EIPS/eip-8052)、[EIP-7587](https://eips.ethereum.org/EIPS/eip-7587) — PQ 预编译草案与 RIP 地址区间。**PRIMARY**
40. [Khovratovich：Post-Poseidon（ethresear.ch）](https://ethresear.ch/t/post-poseidon-hash-function-variants-for-ethereum/26071) 与 [ePrint 2026/1692](https://eprint.iacr.org/2026/1692) — 哈希选择与 Poseidon 攻击。**PRIMARY**
41. [Chiesa 等，ePrint 2023/1646](https://eprint.iacr.org/2023/1646) — 递归证明的安全界只有启发式依据。**PRIMARY**
42. [PSE：Lattice-based signature aggregation](https://ethresear.ch/t/lattice-based-signature-aggregation/22282) 与 [Revisiting Falcon aggregation for PQ mempools](https://ethresear.ch/t/revisiting-falcon-signature-aggregation-for-pq-mempools/24431) — 格聚合基准与盈亏测算。**PRIMARY**
43. [SPHINCS-（ethresear.ch）](https://ethresear.ch/t/sphincs-minus-efficient-stateless-post-quantum-signature-verification-on-the-evm/25165) — 无状态哈希签名在 Ledger 上的签名时间。**PRIMARY**
44. [ePrint 2026/1531](https://eprint.iacr.org/2026/1531)、[2026/1915](https://eprint.iacr.org/2026/1915)、[2026/2313](https://eprint.iacr.org/2026/2313) — 定点 Falcon、低内存实现、侧信道。**PRIMARY**
45. [strawmap.org](https://strawmap.org/) — “hash-based PQ L1” north star。**PRIMARY**
46. [pq.ethereum.org](https://pq.ethereum.org/) — 执行层候选仍含 Falcon / Dilithium。**PRIMARY**
47. [Base：Native Account Abstraction](https://www.base.org/blog/native-account-abstraction) 与 [Base Upgrades](https://docs.base.org/upgrades/overview) — OP Stack 侧 AA 动向。**PRIMARY**
48. 系列前两篇：[《后量子从入门到路线》](/p/post-quantum-mantle/)、[《后量子在 Mantle 的工程落地》](/p/pq-in-mantle/) — 修订对象。
49. ChatGPT Deep Research 结果（`research/gpt-pq-signature-selection.md`）— 只作线索。


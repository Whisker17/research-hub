---
template: research
title: 后量子（PQ）从入门到路线：Ethereum、Starknet、Aztec 怎么做，Mantle 能主动做什么
subtitle: 量子计算机威胁的是签名和证明，不是哈希。Ethereum 的 2029 目标只覆盖 L1 协议，Mantle 的证明验证器、L1 多签密钥和 L2 账户规则都要自己迁移，而且其中多数现在就能开始。
cols: 4
type: 技术调研 · 入门到深入
audience: Mantle 的开发者和管理层：懂 EVM 与 rollup 的基本概念，不熟悉密码学和 PQ
scope: EVM 链与 Mantle 的密码学清单；量子与 AI 威胁；PQ 标准与方案取舍；Ethereum、Starknet、Aztec、Optimism 等项目的路线与进度；Mantle 在 2026–2029 年可以主动推进的工作
evidence: 356 条论断台账（observed 283 / inferred 59 / speculative 14）；NIST 标准原文、EIP 与 EF 官方文本、各项目博客与源码；Ethereum 主网与 Mantle RPC 链上读数；访问于 2026-10-16
date: 2026-10-16 · v1
---
结论先行：量子计算机能解椭圆曲线难题。EVM 链的签名、BLS 共识、KZG 承诺和 BN254 SNARK 证明都会因此失效；哈希只是安全余量变小（[F1](#F1)、[F3](#F3)）。Ethereum 的目标是 2029 年 12 月让 L1 协议三层抗量子，但它不替 L2 迁移证明验证器、管理密钥和账户（[F11](#F11)、[F12](#F12)）。

Mantle 的状态安全今天落在两处：一个 BN254 上的 PLONK 验证，和一组 secp256k1 多签签名人。这两处都不在 Ethereum 的路线上（[F2](#F2)）。所以“等 Ethereum 选好再 rebase”不够：清单、权限、PQ 账户原型和证明路径设计，现在就可以做（[F15](#F15)、[F16](#F16)）。

## A 三类威胁，三种后果 {sheet meta="threat map"}
```tree list
Shor 算法 | 解离散对数，直接攻破
  签名 | ECDSA、BLS、P-256：可伪造交易与多签
  承诺 | KZG：可伪造 blob 数据证明
  证明 | Groth16 / PLONK：可伪造 L2 状态根
Grover 算法 | 搜索开平方，余量下降
  哈希 / AES | Keccak、SHA-256 仍可用
HNDL | 先收集、后解密
  加密数据 | 只影响保密，不影响签名
AI 密码分析 | 作用于所有算法
  HAWK | 2026-07 被攻破后撤回
```

## B 关键数字 {sheet span=2 meta="2026-10-16"}
| 量 | 值 |
|---|---|
| 破解 256 位椭圆曲线（Google 估计） | <1,200 逻辑比特，<50 万物理比特，约 18–23 分钟 |
| 现有硬件（Willow / ethereum.org） | 105 / 数千个物理比特 |
| 专家：10 年内出现 CRQC | 28–49% |
| ML-DSA-44 签名 / ECDSA 签名 | 2,420 B / 65 B（约 37 倍） |
| EVM 合约验 PQ 签名 | 0.65M–8.1M gas（ecrecover 3,000） |
| Mantle 一次状态提交（PLONK） | 964 B 证明，约 43 万 gas |
| Mantle L1 升级权 | 6/14 Safe，无时间锁 |

## C 各家进度 {sheet meta="2026-10"}
| 项目 | PQ 状态 |
|---|---|
| Ethereum | warn 8141 已排期，其余研究 |
| Starknet | warn 证明层 + 2 个 hash |
| Aztec | warn 2027 选型，2030 迁移 |
| Optimism | warn 2036 弃用 ECDSA EOA |
| Algorand | ok 原生 Falcon 账户已上线 |
| Zcash | ok 可恢复 note 已生效 |
| Mantle | no 无公开计划 |

## D Mantle 组件 PQ 状态 {sheet span=2 meta="链上实测"}
| 组件 | 密码学 | 量子下 |
|---|---|---|
| 用户账户 / 7702 | secp256k1 ECDSA | no 可伪造 |
| proposer、batcher | EOA（ECDSA） | no 可冒充 |
| L1 多签（6/14、3/7） | ECDSA 签名人 | no 可夺取升级权 |
| 最终证明验证 | PLONK on BN254 | no 可伪造状态 |
| 提款证明 | keccak + MPT | ok 余量下降 |
| DA / 共识 | blob KZG、BLS | warn 继承 Ethereum |

## E 时间线 {sheet span=2 meta="2024–2036"}
```timeline
2024-08 | NIST 发布 FIPS 203/204/205 | 首批 PQ 标准
2026-03 | Google 新估计 | 物理比特需求降约 20 倍
2026-07 | HAWK 被 AI 辅助攻破 | 团队撤回
*2026-10-15 | Aztec PQ 路线 | 2027 选型，2030 迁移
2027 Q2 | Hegotá（预计） | EIP-8141 Frame Tx
*2029-12 | Ethereum L1 三层 PQ 目标 | 协议能力，不含全部迁移
2035 | NIST 草案：禁用经典公钥 | IR 8547 仍是草案
2036-01 | Optimism 弃用 ECDSA EOA | 需治理批准
```

## F 结论 {sheet span=4}
```callout ok 不用等 Ethereum 选完算法：先做清单、收权限、做原型、谈证明路径
- 威胁：Shor 攻破签名和 SNARK 证明，哈希只是余量下降；专家认为 CRQC 在 2030 年代早中期，概率估计在快速变化（F1、F3、F5）。
- AI：HAWK 已被 AI 辅助攻破；近期更大的风险是实现漏洞，迁移要“保守选型 + 形式化验证”（F7）。
- Ethereum：2029-12 是 L1 协议目标；只有 EIP-8141 已排期，PQ 预编译未排期；L2 只自动继承共识与 DA（F11、F12）。
- 同行：没有任何项目做到全栈 PQ；大家都先做“账户可换签名”和“哈希型证明”（F13、F14）。
- Mantle：最高杠杆的风险是无时间锁的多签和 BN254 证明包装；建议的 6 条工作线见面板 Q（F2、F15、F16）。
- 从哪里开始读：入门看 I–M，各项目看 N–O，Mantle 看 P–Q。
```

## G 如何阅读 {depth=1}
```callout info 系列导航：Mantle 后量子专题共三篇
- 第一篇 [《后量子从入门到路线》](/p/post-quantum-mantle/)：哪些密码学组件会被量子攻破，各项目怎么做，Mantle 哪些部分要自己迁。
- 第二篇 [《后量子在 Mantle 的工程落地》](/p/pq-in-mantle/)：合约级 PQ 账户 + 验签预编译，为什么 7702 不能当容灾。
- 第三篇 [《后量子签名选型》](/p/pq-signature-selection/)：哈希路线 vs 格路线、EIP-8288，以及对前两篇的修订（第三篇面板 R）。
```

```callout warn 2026-10-20 补充（详见第三篇面板 R）
- 面板 Q 所说“L1 侧聚合（如 EIP-8288）”要加限定：8288 当前只聚合 leanSPHINCS 签名，leanSTARK 尚未定义，不能直接聚合 SP1 证明（台账 X20）。
- Starknet 的 Falcon-512 账户已有 S2morrow 与 OpenZeppelin 两家实现，StarkWare 路线图还提到 Falcon-512 共识签名（台账 X21）。
```

```callout info 默认你已知道（本文不解释）
- 钱包有私钥和公钥；私钥签名，别人用公钥验证
- EOA 交易用 secp256k1 签名，EVM 用 `ecrecover` 恢复地址
- rollup 的基本结构：sequencer 排序，数据发到 L1，状态由证明或挑战在 L1 确认
- 哈希函数是“数据指纹”，不能反推
- 多签（Safe）是“N 把钥匙里凑够 M 把才能执行”
```
- **5 分钟（老板）**：只看导语和总览 A–F，再看 [面板 Q](#panel-Q) 的工作线清单。
- **30 分钟（开发者）**：再读面板 I–Q：[前置知识](#panel-I)、[EVM 密码学](#panel-J)、[量子威胁](#panel-K)、[AI](#panel-L)、[PQ 入门](#panel-M)、[Ethereum](#panel-N)、[其他项目](#panel-O)、[Mantle 现状](#panel-P)、[行动建议](#panel-Q)。
- **要复核的人**：再读 [方法与证据](#panel-S) 和 [复现](#panel-T)，链上命令可以直接运行。

**贯穿全文的例子**：Alice 在 Mantle 上发起一笔 10 ETH 的提款，最后在 L1 领取。这笔提款依次经过 6 个环节：
1. Alice 的 ECDSA 签名；
2. batcher 发到 L1 的 blob（KZG）；
3. proposer 提交状态根与 PLONK 证明；
4. 12 小时最终化；
5. OptimismPortal 的 keccak 证明；
6. Ethereum 共识（BLS）。

后面每个面板都会指出量子计算机会在哪一步动手。

## H 背景动机 {depth=2}
**问题**：2026-10-15，Aztec 发布 PQ 路线，分 2027-02 和 2030 两个目标 [23]。前几天我们刚核对过 Starknet 的 PQ 迁移 [26]。Ethereum Foundation（EF）的目标是 2029 年 12 月让 L1 三层抗量子 [3]。Mantle 是 EVM-equivalent L2，在 PQ 方面没有公开的研究或计划 [35][36]。我们目前的默认策略是等 Ethereum 定好路线，再跟着 rebase。

**为什么现在**：
- 资源估计在快速下降。Google 2026-03 的估计把破解 256 位椭圆曲线所需的物理比特降了约 20 倍 [16]。
- AI 已经能改进密码分析。2026-07，Anthropic 用 AI 辅助攻破 PQ 候选方案 HAWK，HAWK 随即撤回 [22]。
- 同行在发路线：Optimism（2026-01）、Algorand（2026-08 上线）、Sui（2026-08）、Aztec（2026-10）[25][27][43][23]。

**范围**：EVM 链与 Mantle 的密码学清单；量子与 AI 威胁；PQ 标准与方案取舍；Ethereum、Starknet、Aztec 和其他项目的路线；Mantle 在 2026–2029 年能主动做什么。

**非目标**：密码学方案的安全性证明与数学推导；完整安全审计；Mantle 内部未公开的架构或密钥管理（只用公开资料与链上读数，需要内部核对的地方会标出）；投资建议。

**已有资料的不足**：外部调研（ChatGPT Deep Research）的框架正确 [44]，但有几处过时或不完整。例如 HAWK 已撤回、EIP-8141 已排期、SP1 内层也依赖椭圆曲线、Mantle 当前用的是 PLONK 而不是 Groth16。本文逐条追到一手来源，修正清单见 [面板 S](#panel-S)。

## I 前置知识 {depth=2}
```excalidraw q="读懂这篇报告要先懂哪些概念？按什么顺序？" read="灰色虚线框是默认已知；蓝框是下面的卡片；绿框是本文主题。箭头表示先学 → 后学。" takeaway="B-1 和 B-2 讲“为什么会被破”，B-3 讲“rollup 特有的风险”，B-4、B-5 讲“换成什么、怎么换”，B-6 讲“保密数据的特殊问题”。" name=prereq-map kind=前置知识地图
{"grid": {"w": 280, "h": 110}, "defaults": {"w": 210, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "pk", "label": "公钥与私钥（已知）", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "hs", "label": "哈希（已知）", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "ru", "label": "rollup 证明（已知）", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 四类密码学工具", "col": 1, "row": 0, "color": "blue"},
   {"id": "b1", "label": "B-1 椭圆曲线难题", "col": 1, "row": 1, "color": "blue"},
   {"id": "b3", "label": "B-3 可信设置与包装", "col": 1, "row": 2, "color": "blue"},
   {"id": "b2", "label": "B-2 Shor 与 Grover", "col": 2, "row": 1, "color": "blue"},
   {"id": "b6", "label": "B-6 先收集后解密", "col": 2, "row": 0, "color": "blue"},
   {"id": "b4", "label": "B-4 PQ 签名家族", "col": 2, "row": 2, "color": "blue"},
   {"id": "b5", "label": "B-5 混合签名用 AND", "col": 3, "row": 2, "color": "blue"},
   {"id": "top", "label": "Mantle 的 PQ 路线", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "pk", "to": "b1"}, {"from": "hs", "to": "b0"}, {"from": "pk", "to": "b0"},
   {"from": "ru", "to": "b3"}, {"from": "b1", "to": "b2"}, {"from": "b0", "to": "b6"},
   {"from": "b1", "to": "b3"}, {"from": "b2", "to": "b4"}, {"from": "b4", "to": "b5"},
   {"from": "b2", "to": "top"}, {"from": "b6", "to": "top"}, {"from": "b5", "to": "top"},
   {"from": "b3", "to": "top"}
 ]}
```

```prereq B-0 l1 3min
# 四类密码学工具：签名、加密、哈希、证明
what: 签名回答“是不是本人授权”；加密回答“谁能读”；哈希回答“数据有没有被改”；证明回答“计算有没有按规则执行”。它们的数学基础不同，量子影响也不同。
why: 讨论 PQ 时，必须先说清楚是哪一类。“哈希抗量子”不代表“签名抗量子”，“证明系统是 STARK”也不代表“签名是 PQ”。
example: Alice 的提款：ECDSA 签名（签名）→ blob KZG（承诺）→ PLONK（证明）→ keccak 提款证明（哈希）。
misconception: 误解：PQ 就是换一个签名算法。事实：签名、承诺、证明、共识要分别迁移，进度也各不相同 [1][3]。
deeper: [1] pq.ethereum.org FAQ
```

```prereq B-1 l1 4min
# 椭圆曲线与离散对数（ECDLP）
what: 椭圆曲线密码的安全性来自一道题：已知公钥 $P = kG$，求私钥 $k$。经典计算机解这道题需要约 $2^{128}$ 步，安全强度与 AES-128 相当（P61）。
why: secp256k1（EOA）、BLS12-381（共识、KZG）、BN254（L2 证明验证）都建立在这道题上。题被解开，它们一起失效 [2][17]。
example: EOA 地址 = `keccak256(pubkey)[12:]`。发过一笔交易，公钥就能从签名里恢复出来，之后可以被离线攻击 [14]。
misconception: 误解：地址是公钥的哈希，所以安全。事实：只有从没发过交易的地址才多一层哈希保护 [2]。
deeper: [17] Babbush et al. 2026 §II
```

```prereq B-2 l1 4min
# Shor 算法与 Grover 算法
what: Shor 在量子计算机上高效求解离散对数和大数分解，是“换了解题方法”。Grover 把无结构搜索的次数开平方，而且只能串行，很难靠堆机器提速。
why: 这决定了哪些组件要换、哪些只要调参数。被 Shor 攻破的要整体替换；只受 Grover 影响的，NIST 认为 AES-128、SHA-256 仍可继续用 [18]。
example: 256 位哈希原像的理论查询数从 $2^{256}$ 降到 $2^{128}$；但 NIST 把电路深度限制算进去后，SHA-256 原像仍属最高安全类别（Category 5）[18]。
misconception: 误解：量子计算机会让所有密码失效。事实：对称密码和哈希只是余量下降 [18]。
deeper: [18] NIST IR 8547 ipd §2.1.3
```

```prereq B-3 l1 5min
# 可信设置与 SNARK 包装
what: Groth16 / PLONK 的公共参数（SRS）里藏着一个秘密数 τ。经典世界里，仪式只要有一个参与者销毁自己那份，τ 就无人知道。很多 zkVM 先生成大的 STARK 证明，再“包装”成小的 PLONK / Groth16 证明上链。
why: 量子计算机可以直接从公开 SRS 里把 τ 算出来，得到一个可以反复使用的后门，用来伪造证明 [17]。Mantle 的最终证明就是 BN254 上的 PLONK [37]。
example: SP1：RISC-V 执行 → STARK（哈希型）→ PLONK 包装（BN254，Aztec Ignition SRS）→ L1 验证约 30 万 gas [31]。
misconception: 误解：仪式有一个诚实参与者，就对量子也安全。事实：τ 是 SRS 里点的离散对数，Shor 能直接解出 [17][41]。
deeper: [17] Babbush et al. 2026 §V.5
```

```prereq B-4 l1 5min
# PQ 签名家族
what: PQ 密码（post-quantum cryptography）运行在普通电脑上，设计目标是让量子计算机也破不了。签名主要有三大家族：格（ML-DSA、Falcon）、哈希（SLH-DSA、XMSS）、同源（SQIsign）。
why: 各家族的安全假设、尺寸、实现难度不同。链上最在意尺寸和验证 gas。
example: 签名大小：ECDSA 65 B；Falcon-512 666 B；ML-DSA-44 2,420 B；SLH-DSA-128s 7,856 B [20]。
misconception: 误解：PQ 需要量子硬件。事实：PQ 算法跑在普通 CPU 上，不需要量子设备 [19]。
deeper: [20] FIPS 204 Table 2
```

```prereq B-5 l2 3min
# 混合签名：必须是 AND
what: 过渡期同时用一个经典签名和一个 PQ 签名。只有两个签名都通过才接受（AND），攻击者才必须同时攻破两者。
why: 很多迁移设计会不小心变成“任一通过即可”（OR）。OR 的安全性只等于较弱的那一个 [38]。
deeper: [38] IETF composite signatures draft -19 §9.1
```

```prereq B-6 l2 3min
# HNDL：先收集，后解密
what: 攻击者今天保存密文，等有了量子计算机再解密。
why: 它只影响保密性。公开链上的签名不需要防 HNDL，隐私应用和加密数据需要 [1][23]。
deeper: [23] Aztec 博客 “Protecting private data now”
```

## J 今天的 EVM 链用了哪些密码学 {depth=2}
EVM 链有四个位置依赖离散对数类假设：账户签名、共识签名、DA 承诺、L2 证明验证。哈希只出现在状态树和提款证明里 [2][8][41]。

Fig 2 把 Alice 提款经过的每一层按量子影响着色。Mantle 的执行层是 Ethereum 的 fork，所以账户层和 Ethereum 一样；证明、权限和运营密钥是 Mantle 自己的；DA 和共识直接继承 Ethereum [35][37]。

```excalidraw q="Alice 的一笔 Mantle 提款，经过哪些密码学组件？哪些会被量子计算机攻破？" read="从上到下是提款经过的顺序。红 = Shor 直接攻破；黄 = 混合（哈希型为主，但有椭圆曲线假设）；绿 = 只受 Grover 影响；灰色虚线 = 继承 Ethereum（同样会被 Shor 攻破）。粗框是对 Mantle 影响最大的一层。" takeaway="除了提款证明的哈希，整条路径都依赖椭圆曲线；其中 PLONK 验证和 L1 多签由 Mantle 自己负责。" kind=分层清单
{"grid": {"w": 620, "h": 72}, "defaults": {"w": 580, "h": 54, "fontSize": 16},
 "nodes": [
   {"id": "u", "label": "1 用户签名：EOA / EIP-7702 / P-256（ECDSA）", "col": 0, "row": 0, "color": "red"},
   {"id": "b", "label": "2 batcher 发 blob：EOA 签名（ECDSA）", "col": 0, "row": 1, "color": "red"},
   {"id": "s", "label": "3 证明内层：SP1 STARK（Poseidon2 + 扩域曲线）", "col": 0, "row": 2, "color": "yellow"},
   {"id": "p", "label": "4 证明外层：PLONK on BN254（Aztec Ignition SRS）", "col": 0, "row": 3, "color": "red", "strokeWidth": 3},
   {"id": "o", "label": "5 proposer 提交状态根：EOA（ECDSA）", "col": 0, "row": 4, "color": "red"},
   {"id": "m", "label": "6 L1 权限：6/14、3/7、Succinct 2/3 Safe", "col": 0, "row": 5, "color": "red", "strokeWidth": 3},
   {"id": "w", "label": "7 提款证明：keccak + MPT", "col": 0, "row": 6, "color": "green"},
   {"id": "d", "label": "8 DA：blob KZG（BLS12-381）", "col": 0, "row": 7, "color": "gray", "stroke": "dashed"},
   {"id": "c", "label": "9 结算：Ethereum 共识 BLS 签名", "col": 0, "row": 8, "color": "gray", "stroke": "dashed"}
 ],
 "edges": []}
```

下表是 Ethereum L1 一侧的清单。Mantle 一侧的链上实测见 [面板 P](#panel-P)。

| 层 | 组件 | 算法 | 量子下 |
|---|---|---|---|
| 账户 | EOA、`ecrecover` | secp256k1 ECDSA | no Shor |
| 账户 | EIP-7702 授权 | ECDSA，可改写委托 | no Shor |
| 账户 | P-256 预编译 | secp256r1 | no Shor |
| 状态 | MPT | Keccak-256 | ok 余量下降 |
| 共识 | 验证者签名、RANDAO | BLS12-381 | no Shor |
| DA | blob、PeerDAS | KZG（BLS12-381） | no Shor |
| ZK 验证 | 0x06–0x08 预编译 | BN254 配对 | no Shor |

```finding F1 high
# EVM 链在四个位置依赖离散对数，Shor 都能攻破
claim: 账户（secp256k1 ECDSA、EIP-7702 授权、P-256）、共识（BLS12-381）、DA（KZG）、L2 证明验证（BN254 预编译）都建立在椭圆曲线离散对数上。状态树与提款证明用的 Keccak 只是余量下降。
evidence: [observed] EIP-7702、EIP-4844、EIP-197、consensus-specs 原文 [8][41]（E1–E4、E6–E14）；ethereum.org 把 ECDSA、BLS、KZG、配对型 ZK 证明列为 Shor 可破 [2]（T11）；NIST IR 8105 Table 1 [18]（T1）。[inferred] 7702 账户上的 PQ 模块可被原 ECDSA 私钥绕过（E5）。
implication: 讨论“Mantle 抗不抗量子”时，要按这四个位置分别回答，不能用一个结论概括。
```

EIP-7702 有一个容易被忽略的细节。授权元组用 `ecrecover` 验证，同一把私钥可以随时重新委托或清除委托，委托后的 EOA 也仍能直接发交易 [8]。所以给 7702 账户挂一个 PQ 验证模块，并不能去掉原来的 ECDSA 根权限（E2–E5）。

## K 量子计算机来了会怎样 {depth=2}
```excalidraw q="三类量子威胁分别打到哪些组件？后果是什么？" read="左列是威胁，中列是被打中的组件，右列是对 Mantle 这类 L2 的后果。红 = 直接攻破；绿 = 余量下降、可调参；黄 = 只影响保密性。" takeaway="对公开 L2 来说，真正的危险是 Shor 那一行：伪造签名、伪造 blob 证明、伪造状态根。" kind=威胁地图
{"grid": {"w": 330, "h": 92}, "defaults": {"w": 220, "h": 58, "fontSize": 16},
 "nodes": [
   {"id": "shor", "label": "Shor 算法", "col": 0, "row": 1, "color": "blue", "strokeWidth": 3},
   {"id": "grv", "label": "Grover 算法", "col": 0, "row": 3, "color": "blue"},
   {"id": "hn", "label": "HNDL", "col": 0, "row": 4, "color": "blue"},
   {"id": "sg", "label": "签名：ECDSA / BLS", "col": 1, "row": 0, "color": "red"},
   {"id": "kz", "label": "承诺：KZG", "col": 1, "row": 1, "color": "red"},
   {"id": "pf", "label": "证明：PLONK / Groth16", "col": 1, "row": 2, "color": "red"},
   {"id": "hs", "label": "哈希 / AES", "col": 1, "row": 3, "color": "green"},
   {"id": "ct", "label": "ECDH 密文", "col": 1, "row": 4, "color": "yellow"},
   {"id": "r1", "label": "伪造交易、夺多签", "col": 2, "row": 0, "color": "red"},
   {"id": "r2", "label": "伪造 blob 数据证明", "col": 2, "row": 1, "color": "red"},
   {"id": "r3", "label": "伪造 L2 状态根", "col": 2, "row": 2, "color": "red", "strokeWidth": 3},
   {"id": "r4", "label": "加大参数即可", "col": 2, "row": 3, "color": "green"},
   {"id": "r5", "label": "事后解密隐私数据", "col": 2, "row": 4, "color": "yellow"}
 ],
 "edges": [
   {"from": "shor", "to": "sg"}, {"from": "shor", "to": "kz"}, {"from": "shor", "to": "pf"},
   {"from": "grv", "to": "hs"}, {"from": "hn", "to": "ct"},
   {"from": "sg", "to": "r1"}, {"from": "kz", "to": "r2"}, {"from": "pf", "to": "r3"},
   {"from": "hs", "to": "r4"}, {"from": "ct", "to": "r5"}
 ]}
```

Google 把量子攻击分成三类 [17]：
- **at-rest**：攻击长期挂在链上的公钥，例如发过交易的 EOA、多签签名人。时间充足，可以离线慢慢算。
- **on-spend**：在交易广播后、上链前的几分钟内算出私钥。需要很快的量子计算机。
- **on-setup**：攻击固定的公共参数，例如 KZG 和 PLONK 的 SRS。只要算一次，就得到可以反复使用的后门。

```finding F3 high
# 量子计算机破坏的是签名、承诺和证明，不是哈希
claim: Shor 直接攻破 ECDSA、BLS、KZG、Groth16 / PLONK 与 ECDH。Grover 只让哈希和 AES 的余量下降：NIST 认为 AES-128 “will remain secure for decades”，SHA-256 原像仍属 Category 5。
evidence: [observed] NIST IR 8105 Table 1、PQC FAQ、IR 8547 ipd [18]（T1–T6）；Google 白皮书 §III.4 [17]（T9）。[inferred] “256 位哈希降到 2^128”只是查询次数口径（T7）。
implication: Mantle 不需要换掉 keccak 或 MPT。要换的是所有签名、证明包装，以及继承自 Ethereum 的 BLS 和 KZG。
```

```finding F4 high
# 可信设置会被一次性攻破，变成可以反复使用的后门
claim: KZG 和 PLONK 的陷门 τ 是公开 SRS 中椭圆曲线点的离散对数。量子计算机算出 τ 之后，攻击者在普通电脑上就能伪造 blob 数据证明或 SNARK 证明，不再需要量子计算机。
evidence: [observed] Google 白皮书 §V.5 原文 “a persistent, universal backdoor” [17]（T20）；EF KZG 仪式 FAQ：秘密被提取后可对 EIP-4844 数据任意声明 [41]（T21）；Google 承认它自己用 SP1 生成的 Groth16 证明对量子不可靠 [17]（T24）；ethereum.org 称仪式“对量子计算机也安全”[2]（E51）。[inferred] ethereum.org 的这一说法有误（T23、E52）。
implication: Mantle 的最终证明用 BN254 PLONK（Aztec Ignition SRS）。Q-day 后，攻击者经由白名单 proposer 提交伪造证明，就可能让 L1 接受错误的状态根，进而提走桥里的资产。proposer 本身是公钥已暴露的 ECDSA EOA（T25、K5、X3）。
```

Google 还给了 Ethereum 的量化估计 [17]：
- 资产最多的 1,000 个账户约 2,050 万 ETH，快时钟量子计算机攻破它们少于 9 天（T15）。
- 前 500 个合约里至少 70 个有管理员密钥风险，约 250 万 ETH，推导这些私钥少于 15 小时（T16）。
- 桥、预言机这类“余额不大、杠杆很高”的账户，二阶风险“arguably much larger”（T17）。
- 原文还写道，Ethereum 共识升级到 PQ，不会回溯修复已部署合约里的量子漏洞（T18）。

**Q-day 什么时候来？** 没有可靠日期，但估计在快速变化：

| 来源 | 判断 |
|---|---|
| Google 2026-03 | ECDLP-256：<1,200 / 1,450 逻辑比特，<50 万物理比特，约 18–23 分钟 |
| Gidney 2025-05 | RSA-2048：<100 万物理比特，<1 周 |
| Google Willow（2024-12） | 105 物理比特 |
| GRI 专家调查（2026-03） | 10 年内 28–49%，15 年内 51–70% |
| EF | CRQC 在 2030 年代早中期 |
| 迁移期限 | Google 2029；NIST 草案 2030 / 2035；NSA 2030–2035 |

```finding F5 medium
# 资源估计一年降了约 20 倍，但硬件还差两到三个数量级
claim: Google 2026-03 把破解 256 位椭圆曲线所需的物理比特降到 <50 万，比此前估计低约 20 倍。Google Willow 芯片有 105 个物理比特，ethereum.org 称现有硬件为数千个噪声物理比特。专家调查给出 10 年内出现 CRQC 的概率为 28–49%。EF 的判断是 2030 年代早中期。
evidence: [observed] Google 博客与 arXiv 2603.28846 [16][17]（T35–T37）；Willow 规格表（T40）；GRI 2025 报告 [21]（T42）；pq.ethereum.org [1]（T47）；ethereum.org 称现有硬件为数千个噪声物理比特 [2]（T69）。[inferred] 与所需的 50 万相差两到三个数量级（T41）。
implication: “2029”应当当作准备目标，而不是安全倒计时。风险在于估计会继续下降：Google 的电路没有公开，只用零知识证明来核验 [17]。
```

```finding F6 medium
# 对公开 L2 来说，HNDL 不是首要问题
claim: EF 认为 HNDL 主要影响加密数据，而不是区块链签名；真实的失败模式是盗币与冒充，而不是改写已终局的历史。Aztec 这类隐私链才需要今天就防 HNDL。
evidence: [observed] pq.ethereum.org FAQ [1]（T28）；Aztec 博客对 ECDH 临时公钥的分析 [23]（T29）。[inferred] Mantle 的主要风险是授权伪造与证明伪造（T31、X10）。
implication: Mantle 要单独评估的只有应用层的加密数据：隐私应用、加密备份、机构通信。
```

## L 近期 AI 破解带来哪些隐患 {depth=2}
AI 已经在两个层面改变了密码学安全：
- **算法层**：找到数学结构上的弱点。
- **实现层**：找到代码和集成中的漏洞。

两者的边界要分清。

| 结果 | 实际含义 | 不能推出 |
|---|---|---|
| HAWK（2026-07-28） | HAWK-512 的密钥恢复成本从 $2^{150}$ 降到 $2^{108}$，团队撤回 | 格密码、ML-DSA、Falcon 都被攻破 |
| 7 轮 AES-128 | 时间从 $2^{99}$ 降到约 $2^{90}$；数据仍要 $2^{105}$ | 完整 10 轮 AES 失效 |
| 小域 Poseidon | 被求解的都是缩减轮数的实例 | 推荐参数的 Poseidon2 被攻破 |
| Aztec 的 AI 审计 | 找到数月人工审计漏掉的 critical 漏洞 | AI 结论可以代替安全证明 |

Anthropic 用 Claude Mythos Preview 约 60 小时、约 10 万美元 API 成本完成 HAWK 攻击，并声明它只针对 HAWK，不需要改任何生产软件 [22]（T50–T55）。NIST 确认 HAWK 不会被标准化，同时说明这个结果不影响 ML-KEM / ML-DSA [22]（T53）。

```finding F7 high
# AI 让“仓促迁移”本身成为风险
claim: AI 已经把一个 NIST 候选签名攻到撤回，也能找到人工审计漏掉的实现漏洞。Aztec 和 EF 给出的结论一致：保守选型、要求形式化验证，仓促部署不成熟的密码可能比量子本身更危险。
evidence: [observed] Anthropic 研究与 HAWK 论文 [22]（T50–T56）；NIST 撤回说明（T53）；Aztec “conservative … formally-verified implementations” [23]（T57、T63）；pq.ethereum.org “rushed deployment … more risk than it removes” [1]（T64）。[inferred] 对 Mantle 而言，近期 AI 风险主要在合约、验证器和桥的实现层（T66、X18）。
implication: PQ 迁移计划要和 AI 辅助审计、形式化验证一起排期；只选算法、不管实现，是新的风险来源。
```

Vitalik 2026-10-07 的帖子据媒体转述认为，AI 可能在两年内削弱格密码的具体安全性。原帖无法读取，这一条是推测（T65，[speculative]）。

## M PQ 入门：标准、尺寸与取舍 {depth=2}
**标准现状**（截至 2026-10-16）[19]：
- 已定稿：FIPS 203 ML-KEM（密钥封装）、FIPS 204 ML-DSA（格签名）、FIPS 205 SLH-DSA（哈希签名），2024-08-13 发布。
- 未发布：FIPS 206 FN-DSA（Falcon）仍是 “in development”，CSRC 上没有草案页。FN-DSA 与现有 Falcon 不兼容 [19]（P2–P6）。
- 备用：HQC（编码类 KEM）2025-03 选定，FIPS 未发布（P8）。
- 附加签名第 3 轮剩 8 个候选，HAWK 已撤回（P10、P11）。

```tree
PQ 方案 | 按数学难题分类
  格 | 主力，NIST 已标准化
    ML-DSA | FIPS 204，签名 2.4–4.6 KB
    Falcon / FN-DSA | FIPS 206 未发布，签名 0.7–1.3 KB
    ML-KEM | FIPS 203，密钥封装，不是签名
  哈希 | 假设最保守
    SLH-DSA | FIPS 205，无状态，签名 7.9–30 KB
    XMSS / leanSig | 有状态，每把钥匙只能签有限次
  同源 | 最紧凑，最年轻
    SQIsign | 第 3 轮，签名 200 B，2026 刚调大参数
  多变量 / 编码 | 备份与多样化
```

**尺寸**（字节，来自标准原文 [20]；各参数集安全类别不同，这不是同等安全下的性能排名）：

| 方案 | 公钥 | 签名 | 签名 / ECDSA |
|---|--:|--:|--:|
| ECDSA secp256k1 | 64 | 65 | 1× |
| Falcon-512 | 897 | 666 | 约 10× |
| ML-DSA-44 | 1,312 | 2,420 | 约 37× |
| SLH-DSA-128s | 32 | 7,856 | 约 121× |
| XMSS（2^10 次） | 68 | 2,500 | 约 38× |
| SQIsign-I | 83 | 200 | 约 3× |

**在 EVM 上验证要多少 gas**（都是实验性或 Draft，未审计）[12][40]：

| 方式 | gas | 状态 |
|---|--:|---|
| `ecrecover`（对照） | 3,000 | 主网 |
| Falcon-512 合约（最优分支） | 650,345 | 实验分支 |
| ML-DSA-44 合约（Fireblocks） | 1,226,311 | 研究代码 |
| ML-DSA-44 合约（NIST 版） | 约 8.1M | 未审计 |
| EIP-8052 Falcon 预编译 | 3,000 | Draft |
| EIP-8051 ML-DSA 预编译 | 4,500 | Draft |

```finding F8 high
# PQ 签名大 10–121 倍，不靠预编译验签贵 200 倍以上
claim: ML-DSA-44 签名约是 ECDSA 的 37 倍，SLH-DSA-128s 约 121 倍。纯合约验签目前最优约 65 万（Falcon）到 123 万 gas（ML-DSA-44），是 `ecrecover` 的约 217–409 倍。Draft 预编译可以降到 3,000–4,500 gas，但都没有排进任何 Ethereum 分叉。
evidence: [observed] FIPS 204 / 205 与 Falcon 规范的尺寸表 [20]（P24–P27）；ZKNOX 与 Fireblocks README [40]（P29–P31）；EIP-8051 / 8052 [12]（P32、P33）。[inferred] 倍数计算（P28、P36）。
implication: 每笔交易都带 PQ 签名，成本会落在 calldata 和验签两处。高频场景（perps、agent）要考虑会话密钥或批量授权，但不能留一个不受限的 ECDSA 后门。
```

**混合签名必须是 AND。** IETF 复合签名草案规定，所有组件签名都验证通过才接受，并把 OR 型归为“迁移灵活性”，不提供双算法安全 [38]（P38–P40）。Web2 已在密钥交换层大规模用混合方案：2026-09，约 70% 的浏览器流量走混合 ML-KEM（X25519MLKEM768）[39]（P41）。

| 接受规则 | 经典算法被攻破后 |
|---|---|
| AND：经典签名和 PQ 签名都要通过 | ok 攻击者仍需攻破 PQ 签名 |
| OR：任一签名通过即可 | no 攻击者只用经典签名就能通过 |

```finding F9 high
# 混合与迁移的关键是 AND，Mantle 的证明网关天然是 OR
claim: 混合签名只有在 AND 模式下，才要求攻击者同时攻破两种算法。Mantle 使用的 SP1VerifierGateway 接受任何一个“已添加且未冻结”的路由，路由之间没有 AND 关系。
evidence: [observed] IETF draft -19 §3.3、§9.1 [38]（P38、P39）；`SP1VerifierGateway.verifyProof` 源码 [34]（K7）。[inferred] 加入 PQ 路由而不冻结旧的 BN254 路由，等于“旧证明 OR 新证明”（K9、X4）。
implication: 将来切换证明系统时，冻结旧路由必须写进迁移步骤。Succinct 已经冻结过 11 个旧路由（K8），这个操作是可行的。
```

**PQ 证明系统与 PQ 签名是两回事。** 签名保护“谁授权”，证明系统保护“计算对不对”[1]。
- 哈希型证明（STARK、FRI、WHIR）只依赖哈希，被认为 plausibly PQ。代价是证明大，快的方案约 300 KB [23]（P47）。
- 格型 SNARK（Lattice Jolt / Akita，2026-09）证明小于 100 KB，但还没有零知识 [33]（P51、P52）。
- 生产中的 zkVM 上链前都会包一层 BN254 SNARK，见下图。

```flow LR
RISC-V 执行 -> STARK 证明: 哈希型
STARK 证明 -> 递归压缩
递归压缩 -> *PLONK 包装: BN254 配对
*PLONK 包装 -> L1 验证: 约 30 万 gas
```

```finding F10 high
# 内部是 STARK，不等于最终验证是 PQ
claim: SP1 用 Gnark 的 BN254 Groth16 / PLONK 把 STARK 压成 SNARK 后在链上验证。RISC Zero 自己把 STARK 层标为 “Quantum Safe: Yes”，把 Groth16 层标为 “No”。SP1 Hypercube 的内层还假设了扩域椭圆曲线上的离散对数困难。
evidence: [observed] SP1 Security Model [31]（P54、P56、O35、O36）；RISC Zero Security Model [42]（P57）。[inferred] 这类“STARK 内部 + BN254 外包装”的最终链上验证不抗量子（P58、O37）。内层扩域曲线在量子下能否被实际利用，没有公开分析（P59，[speculative]）。
implication: 判断一个 rollup 的证明是否 PQ，要看 L1 上最后验证的是什么。Mantle 最后验证的是 PLONK on BN254（K2、K3）。
```

## N Ethereum 的 PQ 路线 {depth=2}
**“2029”指什么。** EF Protocol 博客（2026-09-07）的原话是：“aiming for Ethereum L1 to be quantum-resistant across all three layers (execution, consensus, and data) by December 2029”，并承诺至少到 2027 年 1 月不改 [3]。pq.ethereum.org 和 ethereum.org 都写明，执行层的完整迁移还要更多年 [1][2]（E18–E21）。

| 层 | 今天 | 目标 | 关键件与状态 |
|---|---|---|---|
| 执行 | ECDSA EOA | 账户自选签名，k1 退役 | ok EIP-8141 排进 Hegotá；warn 8151 / 8298 考虑中；no PQ 预编译未排期 |
| 共识 | BLS 聚合 | leanXMSS + leanVM 证明聚合 | warn 原型，“not production ready” |
| 数据 | KZG | 哈希承诺 + 证明（leanDA） | warn 研究帖与基准 |

```timeline
2025-12 | Fusaka | PeerDAS、P-256 预编译
2026 Q4 | Glamsterdam（计划） | 没有 PQ 项
*2027 Q2 | Hegotá（预计） | FOCIL + EIP-8141
2028 | I*（占位） | PQ 公钥注册、leanSPHINCS 交易
2028–29 | J*（占位） | MV-PQ 保底
*2029 | K*（占位） | PQ attestations、post-quantum L1
2029–30 | L*（占位） | 强制执行证明
```

上面的 I*–L* 是 EF 架构组 strawmap 的占位分叉名。strawmap 自称“not a prediction”，2026-10-09 刚把“post quantum L1”从 L* 移到 K* [6]（E35–E39）。

```finding F11 high
# Ethereum 只排期了 EIP-8141，PQ 预编译被认为“过早”
claim: Hegotá 已排期的只有 FOCIL 和 EIP-8141（Frame Transaction）；EF 原话是 “Hegotá is not the PQ fork”。8141 本身没有 PQ 签名方案，只预留了扩展位。ML-DSA 预编译 EIP-8355 被拒，EF 评语是 “premature standardization”；7885 / 8051 / 8052 不在任何列表。共识层的 leanVM 自述 “not (yet) production ready”，哈希函数还没定。
evidence: [observed] EIP-8081 Hegotá meta [5]（E22、E23、E27、E28）；EF Hegotá 分级 [4]（E34）；EIP-8141 签名 scheme 表 [7]（E25）；leanVM README @127510d1 [13]（E43、E44）；ethereum.org Hegotá 页 [2]（E24）。[inferred] Ethereum 的规范哈希函数尚未选定（E48）。
implication: Mantle 想“跟着 Ethereum 选算法”，在 2027 年之前没有可跟的签名算法。账户层能跟的只有 8141 这个框架。
```

```finding F12 high
# L2 只自动继承共识和 DA，其他都要自己迁
claim: EF 对 L2 只有建议，没有协议要求。建议保护四类对象：排序器与管理员密钥、桥与跨链消息、AA 账户、zk-rollup 证明系统；协议演进“chain-specific”。L2 只会自动受益于 L1 共识与 blob DA 的 PQ 化，而且要切换 blob 交易版本。
evidence: [observed] pq.ethereum.org FAQ “Ecosystem & Broader Context” [1]（E59）；ethereum.org 对应用层 ZK 证明的态度 [2]（E60）；EIP-4844 版本化哈希的设计理由 [41]（E61）；EIP-8151 对 L2 故障证明的说明 [9]（E62）。[inferred] L2 的 BN254 验证器、账户规则、桥与升级密钥不会自动 PQ 化（E63–E65）。
implication: “rebase Ethereum”能给 Mantle 带来的，只是继承层的那部分。8141 / 8151 这类执行层改动，也要 Mantle 自己硬分叉激活。
```

**紧急预案。** Vitalik 2024-03 提出过“量子紧急硬分叉”，这只是研究帖，没有对应的 EIP [14]（E56）。一共四步：
1. 回滚到大规模盗窃之前；
2. 禁用 EOA 交易；
3. 引入合约钱包交易；
4. 用户提交 STARK，证明自己知道生成私钥的哈希原像（例如 BIP-32 种子），再换成新的验证代码。

## O Starknet、Aztec 与其他项目 {depth=2}
截至 2026-10-16，没有任何项目做到全栈 PQ。已上主网的都是局部组件 [26][27][30]（O54）。

| 项目 | 已上线 | 路线图 / 研究 |
|---|---|---|
| Starknet | 证明层 STARK；OS / class hash 改 BLAKE2s；1 笔 Falcon 账户演示 | 状态树、地址、共识、DA；“2027 PQ L1”只是考虑中 |
| Aztec | 应用可自选签名；公钥哈希；链下 note 投递 | 2027 年三个选型节点；2030 年全面迁移 |
| Optimism | — | 2036-01 弃用 ECDSA EOA；sequencer、batcher 改 PQ 签名 |
| Algorand | Falcon 状态证明（2022）；原生 Falcon-1024 账户（2026-08） | VRF 与参与密钥仍是 Ed25519 |
| Zcash | 可恢复 note（NU6.3，2026-07-28） | Recovery Protocol 未进共识 |
| Bitcoin | — | BIP-360 P2MR、BIP-361 旧签名退场，都是 Draft |
| Solana | 应用层 Winternitz 金库（未审计） | 选定 Falcon，无时间表 |
| SP1 | — | VEIL：用哈希型包装替换 Groth16，无日期 |

**Starknet**：自 10-14 的报告以来没有新进展。Migration Register 仍是 2026-08-19 的版本 [26]（O1–O3）。Starknet 的优势来自两点结构设计：哈希型证明层，以及协议不规定签名算法的原生账户。但官方对“Starknet 抗量子吗”的回答是 “No. Not as a single system-wide claim.”[26]。

**Aztec**（2026-10-15，作者 Zac Williamson、Mike Connor）[23]：
- 两个目标：2027-02 交付防 HNDL 的强化库与开发模式；2030 年完成全面迁移（O5）。
- 三个选型节点：2027-03 签名、2027-07 公钥加密、2027-11 证明系统（O6）。
- 证明系统的难点在递归：快的 PQ 证明约 300 KB，Aztec 现有证明约 20 KB；2-to-1 聚合要在现代 CPU 上约 20–100 ms 内完成才可行（O8、O9）。
- 地址改造：把烘焙进地址的密钥外置到 keystore registry，地址变成单纯的哈希（O10）。
- 哈希：长期把 Poseidon2 换成 BLAKE2s / BLAKE3，很可能跟随 EF 的选择（O11）。
- 作者认为 4 年内出现 Q-day 不太可能（O12）。

**Optimism**（2026-01-14，Karl Floersch）[25]：
- OP Labs 承诺在 10 年内弃用 ECDSA EOA，需经治理批准；到 2036-01，每个 EOA 都须把密钥管理委托给 PQ 智能账户（O18）。
- sequencer 与 batch submitter 改用 PQ 签名；具体签名方案未定（O19、O20）。
- 原文没有提到 proposer、故障证明或 L1 合约升级权限（O21）。
- Mantle 不在 superchain-registry 中，这份路线不会自动约束 Mantle（M37、M40）。

**Algorand** 的迁移语义值得对照。用户 rekey 到 PQ 地址后，地址不变，“only the Falcon key can authorize”，旧钥匙失效 [27]（O26）。EIP-7702 正好相反，委托后旧 ECDSA 钥匙仍有权限。所以 Optimism 才需要在 2036 年用“协议级弃用 ECDSA 交易”来兜底（O53）。

```timeline
2022 | Algorand | Falcon 状态证明上主网
2026-01-14 | Optimism | Superchain PQ 路线
2026-07-08 | Starknet v0.14.3 | OS hash 改 BLAKE2s
2026-07-28 | Zcash NU6.3 | 可恢复 note 生效
*2026-08 | Algorand v5.0.0 | 原生 Falcon 账户
2026-08-18 | Sui | 选定 ML-DSA-65 / SLH-DSA
*2026-10-15 | Aztec | 2027 选型、2030 迁移
2036-01 | Optimism 目标 | 弃用 ECDSA EOA
```

```finding F13 high
# 同行的共同顺序：先账户、先哈希型证明，最后共识、DA 和结算
claim: 已上线的 PQ 组件都在账户层、历史证明或可恢复格式上。共识签名聚合、DA 承诺与 L1 结算，各家都排在后面；在 Ethereum 上结算的 L2 还要依赖 Ethereum 的共识与 DA 迁移。
evidence: [observed] Algorand 原生账户与 State Proofs [27]（O23、O27）；Zcash ZIP 2005 / 258 [30]（O44–O46）；Starknet Register [26]（O1、O3）；Aztec 需求清单 [23]（O7）；Optimism 路线 [25]（O19–O21）。[inferred] 跨项目综合（O54、O55、X16）。
implication: Mantle 按同样的顺序推进不会落后于同行：先做账户与权限，再和 Succinct 做证明，最后跟随 L1 切换共识与 DA。
```

```finding F14 high
# Aztec 把“今天保护数据”和“将来全面迁移”分开排期
claim: Aztec 认为隐私数据的 HNDL 防护现在就能在应用层做（哈希公钥、链下投递、强化库），所以排在 2027-02；证明系统、协议密钥和验证者签名需要更多时间，排到 2030 年。它还要求所有新密码学都有形式化验证的实现。
evidence: [observed] Aztec 博客的两个目标、三个节点与“conservative”立场 [23]（O5、O6、O13、T63）。
implication: Mantle 可以借用这种拆法。“现在就能降风险的事”（清单、权限、应用层加密）和“依赖上游的事”（证明、共识、DA）分开排期，各自验收。
```

## P Mantle 的现状：链上核对 {depth=2}
下面的事实来自 2026-10-15/16 的 Ethereum 主网与 Mantle RPC 读数 [37]，合约清单取自 L2BEAT 配置 [35]。

```uml q="Mantle 的一个状态根是怎样在 L1 上被接受的？每一步依赖什么密码学？" read="高亮部分是 L1 上的证明验证，它决定 L1 是否接受 Alice 提款所依据的状态根。方括号里是这一步依赖的密码学。" takeaway="L1 是否接受 Mantle 的状态，最终取决于一次 BN254 PLONK 验证；路由由 Succinct 的多签管理，verifier 地址由 Mantle 的 6/14 多签管理。"
sequenceDiagram
  autonumber
  participant A as Alice
  participant P as proposer EOA
  participant O as L2OutputOracle
  participant G as SP1 Gateway
  participant V as PLONK 验证器
  participant X as OptimismPortal
  Note over A: Alice 签 L2 提款交易 [ECDSA]
  Note over A,P: batcher 把交易发成 blob [ECDSA + KZG]
  P->>O: proposeL2Output(root, proof) [ECDSA]
  rect rgb(234, 241, 251)
    O->>G: verifyProof(vkey, proof)
    G->>V: 按 proof 前 4 字节路由
    V-->>O: BN254 配对检查通过
  end
  Note over O: 12 小时最终化
  A->>X: prove + finalize [keccak + MPT]
```

| 事实（2026-10-15/16） | 读数 |
|---|---|
| 状态提交合约 | OPSuccinctL2OutputOracle v2.0.1，`optimisticMode = false` |
| 最近一次证明 | 964 B，路由 `0x5a093a2f` → SP1 v6.1.0 PLONK |
| 一次提交的 gas | 431,530 |
| proposer / batcher | 都是 EOA，proposer 在白名单 |
| 升级权 | ProxyAdmin → 6/14 Safe，无时间锁 |
| challenger 与 Guardian | 3/7 Safe |
| Gateway owner | Succinct 2/3 Safe |
| DA | type-3 blob（Arsia 移除 EigenDA 路径） |
| L2 能力 | 接受 7702 交易；有 P-256 预编译 |

```finding F2 high
# Mantle 的状态安全落在一个 BN254 证明和一组 ECDSA 多签上
claim: 2026-10-15 的最近一次状态提交附带 964 字节证明，路由到 SP1 v6.1.0 的 PLONK 验证器，依赖 BN254 配对。ProxyAdmin 的 owner 直接是 6/14 Safe，没有时间锁；它能无时间锁地升级核心 rollup 合约（MNT 代币另有 1 天时间锁）；作为 Oracle owner，它还能换 verifier 地址和 vkey。batcher、proposer、sequencer 签名者都是 EOA。
evidence: [observed] 链上读数 [37]（K1、K2、K5、K10、K11、K13）；Mantle fork 的 Oracle 源码 [34]（M12、M13）；L2BEAT 风险评估 “no delay on code upgrades (CRITICAL)” [35]（M18）。[inferred] 最终验证依赖 BN254 配对（K3）；所有这些密钥都是 secp256k1 ECDSA（K17）。
implication: 量子攻击者不需要逐个偷用户私钥。拿到 6 个签名人的私钥就能夺取升级权；伪造一个 PLONK 证明，再经由白名单 proposer 提交，就能影响桥的状态（X2、X3）。
```

**责任边界**：把 Mantle 的组件按“谁能改”分成三类，见 Fig 7。

```excalidraw q="Mantle 的哪些 PQ 工作可以自己做，哪些要和上游协同，哪些只能等 Ethereum？" read="绿 = Mantle 自主；黄 = 与 Succinct / Optimism 协同；灰色虚线 = 继承 Ethereum。" takeaway="绿色那一列现在就能开始，它也是量子攻击杠杆最高的部分。" kind=责任边界
{"grid": {"w": 300, "h": 84}, "defaults": {"w": 250, "h": 56, "fontSize": 16},
 "nodes": [
   {"id": "a1", "label": "L1 多签与升级时间锁", "col": 0, "row": 0, "color": "green", "strokeWidth": 3},
   {"id": "a2", "label": "proposer / batcher 密钥", "col": 0, "row": 1, "color": "green"},
   {"id": "a3", "label": "L2 账户规则与预编译", "col": 0, "row": 2, "color": "green"},
   {"id": "a4", "label": "应用验签与应急预案", "col": 0, "row": 3, "color": "green"},
   {"id": "b1", "label": "SP1 包装与 Gateway 路由", "col": 1, "row": 0, "color": "yellow", "strokeWidth": 3},
   {"id": "b2", "label": "L1 侧证明聚合", "col": 1, "row": 1, "color": "yellow"},
   {"id": "b3", "label": "OP Stack 代码改动", "col": 1, "row": 2, "color": "yellow"},
   {"id": "c1", "label": "共识 BLS → leanXMSS", "col": 2, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "c2", "label": "blob KZG → leanDA", "col": 2, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "c3", "label": "L1 账户层（8141）", "col": 2, "row": 2, "color": "gray", "stroke": "dashed"}
 ],
 "edges": [],
 "boxes": [
   {"label": "自主", "around": ["a1", "a2", "a3", "a4"], "pad": 22, "color": "green"},
   {"label": "协同", "around": ["b1", "b2", "b3"], "pad": 22, "color": "yellow"},
   {"label": "继承", "around": ["c1", "c2", "c3"], "pad": 22, "color": "gray"}
 ]}
```

## Q 不只是等：Mantle 能主动做什么 {depth=2}
下面是本报告基于以上证据给出的建议，没有经过 Mantle 内部评审。

```finding F15 medium
# Mantle 可以先于 Ethereum 动手，而且有先例
claim: Mantle 在 L1 上线 EIP-7951 之前，就通过 RIP-7212 启用了 P-256 预编译；它用自己的命名硬分叉（Skadi、Limb、Arsia）跟进或提前上线 EVM 能力。Safe 多签也支持 EIP-1271 合约签名人，可以在合约里验证 PQ 签名，不用等 L1 的 AA。
evidence: [observed] Limb changelog 与 2025-05、2025-10 的历史区块读数都显示 Mantle 早于 Fusaka（2025-12-03）提供 P-256 预编译 [36][37]（M33、K22、E7）；Safe 合约签名 v=0 [37]（K21）；Fireblocks ML-DSA-44 验证约 123 万 gas [40]（P31）。[inferred] 可以提前上线 PQ 预编译，但 FIPS 206 未定稿，Falcon 接口有返工风险（X5、X6）；多签可以逐步换成 PQ 签名人（X19）。
implication: PQ 签名人合约本身不能留 ECDSA 授权或升级后门，否则 PQ 校验可被绕过（X19）。7702 账户例外：挂上 PQ 模块不能去掉 ECDSA 根权限，需要 Mantle 在协议层引入类似 EIP-8151 的 k1 退役机制（X7）。
```

```finding F16 medium
# 证明路径的 PQ 化要和 Succinct 一起做，并且必须冻结旧路由
claim: 当前一次状态提交约 43 万 gas。直接在 L1 验证一个 PQ STARK 约千万 gas 量级，calldata 部分就要约 490 万 gas。Succinct 的公开方向是用哈希型包装替换 Groth16（VEIL），但没有日期。Gateway 由 Succinct 的 2/3 Safe 管理，路由的添加与冻结都不经过 Mantle。
evidence: [observed] 链上 gasUsed [37]（K4）；Vitalik 的 gas 量级 [15]（E53）；VEIL 博客 [32]（O38）；Gateway owner 与源码 [34][37]（K6、K7）。[inferred] 约 300 KiB 证明的 calldata 成本（P49）；需要 Succinct 的哈希型包装与 L1 侧聚合（如 EIP-8288）一起推进（X8、X14）。
implication: 这是 Mantle 最难自己完成的一项。现在能做的是：把需求、验收标准和路由冻结流程写进与 Succinct 合作的计划。
```

**六条工作线**（前三条不依赖任何上游）：

1. **发布密码学依赖清单。** 按 Starknet Migration Register 的格式，逐个组件写出算法、密钥持有人、能改它的权限、PQ 状态和上游依赖（X9）。首批对象是面板 P 表格里的 9 项。
2. **收紧权限。** 给 ProxyAdmin 加升级时间锁；评估把 batcher、proposer 换成多签或受限角色；把 Safe 签名人逐步换成 EIP-1271 的 PQ 签名人合约，这些合约不能有 ECDSA 授权或升级后门（X12、X19）。这些措施对今天的经典风险也有效，L2BEAT 已把无延迟升级列为 CRITICAL（M18）。
3. **PQ 账户原型。** 在 Mantle 上用 ERC-4337 / ERC-1271 做 ML-DSA 智能账户。按 Algorand 的语义，测试“旧 ECDSA 私钥泄露后，能不能绕过新账户”。同时评估在 Mantle 硬分叉里提前上线 PQ 预编译和 k1 退役机制（X6、X7）。
4. **和 Succinct 联合设计证明路径。** 写清 4 条验收标准（X4、X8、X14）：
   - L1 最后验证的东西不依赖椭圆曲线；
   - 过渡期双证明用 AND；
   - 切换后冻结旧路由；
   - 估算 L1 gas 与延迟。
5. **跟随 L1。** 跟踪 Hegotá（8141）、K*（PQ attestations）、leanDA；准备 blob 交易版本切换，以及 8141 / 8151 在 Mantle 上的激活（E61、E65）。
6. **应急与审计。** 写 Q-day 应急预案：谁能暂停、谁能换 verifier、这些权限本身是否还依赖 ECDSA。所有新密码学组件都要求 AI 辅助审计和形式化验证（X13、X18）。

```timeline v
*2026 Q4 | 清单与权限 | 发布依赖清单；评估升级时间锁
2027 H1 | 账户原型 | ML-DSA 智能账户；旧私钥绕过演练
2027 H2 | 证明路径 | 与 Succinct 定验收标准；PQ 预编译评估
2028 | 测试网 | k1 退役、PQ 签名人多签、路由切换演练
*2029 | 跟随 L1 | 对接 Hegotá 之后的 PQ 分叉
```

上面的阶段划分是推测性的建议（X15，[speculative]）。具体日期取决于三件事：Succinct 进度、FIPS 206 发布时间、Ethereum 分叉节奏。时间窗口本身也不确定：如果 Ethereum 在 2029-12 完成 L1 PQ，而 CRQC 在 2030 年代早中期出现，L2 跟在 L1 之后迁移只剩几年（X11，[speculative]）。

```callout warn CAUTION
对外表述时，按组件写 PQ 状态，并注明日期，例如“Mantle 支持 ML-DSA 智能账户（测试网）”。在证明路径、L1 权限和账户根权限都完成迁移之前，不要用“Mantle 抗量子”或“PQ-ready”这类整体说法。
```

**怎样验收**（建议的指标）：

| 指标 | 衡量什么 |
|---|---|
| 清单覆盖率 | 每个关键组件是否都写清算法、权限、依赖 |
| ECDSA-only 关键权限数 | 还剩多少权限只靠一把 ECDSA 钥匙 |
| 旧私钥绕过演练 | 拿到旧 ECDSA 私钥，能否夺回 PQ 账户 |
| L1 最终验证的假设 | 是否仍依赖 BN254 / KZG |
| 未冻结的旧路由数 | 证明网关是否仍是 OR |

## R 局限与开放问题 {depth=2}
- **只用公开资料**：Mantle 的 HSM / KMS 托管、Safe 签名人的密钥形态都没有公开（M59，[speculative]）。链上 implementation `0x4059…6f50` 没有和 `mantle-v1.6.1` 源码做字节码比对。
- **没有复跑 PQ 验签**：gas 数字取自各仓库 README 与 EIP 定价，没有在 Mantle 上实测。
- **SP1 内层的量子影响**：Hypercube 内存论证依赖的扩域椭圆曲线，在量子下能否被实际利用，没有公开分析（P59、M45，[speculative]）。
- **上游时间表**：Succinct 去掉 BN254 包装、FIPS 206 发布、Ethereum 规范哈希函数，都没有日期。VEIL 会不会成为 SP1 生产版的 L1 路径，是推测（M51，[speculative]）。
- **Mantle 是否跟随 Optimism 的 PQ 硬分叉**：没有公开信息（M60，[speculative]）。
- **数据口径冲突**：
  - 暴露公钥的 BTC 规模，各方口径从 170 万到 818 万不等（O32）；
  - ethereum.org 的 PQ 签名尺寸与 EIP-8292 不一致（E68）；
  - L2BEAT 对 Mantle 证明路由的记录落后于链上（M8、K8）。
- **未找到一手来源**：2026-06 的行政令把 NIST 2030 节点变成联邦合规期限（T67）；Aztec 所说“small-field Poseidon breaks”具体指哪篇论文（T68）；Arbitrum、Polygon、Scroll 的官方 PQ 计划（O51、O52）。以上都标为 speculative。

## S 方法与证据 {depth=3}
**调研方法**：五路并行调研，每路只写一个分册，最后合并成一张台账：
- T：量子威胁与 AI
- P：PQ 入门与证明系统
- E：Ethereum
- O：其他项目
- M：Mantle 公开资料

主会话另外用 `cast` 做了链上复核（K），并写了跨路综合（X）。所有论断都追到一手来源：NIST 标准、EIP、EF 官方文本、项目博客与源码、主网 RPC。外部调研（ChatGPT Deep Research）只作线索 [44]。

**主会话抽查**（2026-10-16）：抽查 3 条，全部与台账一致。
- EIP-8081 中 8141、8151、8355 的状态；
- Optimism 原文对 2036 和 sequencer 的表述；
- Google 博客给出的比特数。

**外部调研中被修正的地方**：
- “EIP-8141 仍是 Draft”：已在 Hegotá 定为 SFI，Hegotá 预计 2027 Q2（E23、E24）。
- 把 7885 / 8051 / 8052 当作值得跟踪的方向：漏了它们未排期，以及 EIP-8355 被拒（E27、E28）。
- “HAWK 是候选方案”：2026-07-29 已撤回（P11）。
- “SP1 内部是 STARK”：内层也有扩域椭圆曲线假设（P56、O36）。
- Mantle 证明路径：实测是 PLONK v6.1.0，不是 Groth16；L2BEAT 记录的旧 sp1turbo 路由已于 2026-10-09 冻结（K2、K8）。
- “Mantle 有 blob / calldata 两种发布方式”：实测只有 blob（M23、K14）。
- Optimism 路线的范围：原文不含 proposer 与 L1 权限（O21）。
- Algorand v5.0.0：GPT 的引用错位（O56）。
- ethereum.org “KZG 仪式对量子也安全”：按 KZG 结构判断有误（T23、E52）。

## T 复现 {depth=3}
环境：Foundry `cast`，公共 RPC。命令可以直接运行，结果会随区块变化。

```bash title="Mantle 的 L1 证明路径与权限"
R=https://ethereum-rpc.publicnode.com
O=0x31d543e7BE1dA6eFDc2206Ef7822879045B9f481   # OPSuccinctL2OutputOracle
cast call $O "verifier()(address)" --rpc-url $R       # 0x3B60…185e（Gateway）
cast call $O "optimisticMode()(bool)" --rpc-url $R    # false
cast call $O "owner()(address)" --rpc-url $R          # 0x4e59…D40f
cast call 0x4e59e778a0fb77fBb305637435C62FaeD9aED40f \
  "getThreshold()(uint256)" --rpc-url $R              # 6（14 个 owner）
cast call 0xca35F8338054739D138884685e08b39EE2217794 \
  "owner()(address)" --rpc-url $R                     # ProxyAdmin → 同一 Safe
```

```bash title="最近一次证明走哪个验证器"
G=0x3B6041173B80E77f038f3F2C0f9744f04837185e
T=0xeae80e604a5000669bdbf085e5dd3b6a51177c405744dcb011188ea53697e812
cast tx $T input --rpc-url $R | cut -c1-10            # 0x9ad84880（ZK 模式）
cast call $G "routes(bytes4)(address,bool)" \
  0x5a093a2f --rpc-url $R                             # 0xc3c6…AF2A, false
cast call 0xc3c6dDDAc8829b233Dc6536Ec024775a57b0AF2A \
  "VERSION()(string)" --rpc-url $R                    # "v6.1.0"（PLONK）
cast call $G "routes(bytes4)(address,bool)" \
  0xd4e8ecd2 --rpc-url $R                             # v5.0.0 路由, true（已冻结）
```

```bash title="Mantle L2 的 P-256 与 7702"
M=https://rpc.mantle.xyz
# P-256：RIP-7212 的有效测试向量（拆成 5 行）
IN=0x4cee90eb86eaa050036147a12d49004b6b9c72bd725d39d4785011fe190f0b4d
IN+=a73bd4903f0ce3b639bbbf6e8e80d16931ff4bcf5993d58468e8fb19086e8cac
IN+=36dbcd03009df8c59286b162af3bd7fcc0450c9aa81be5d10d312af6c66b1d60
IN+=4aebd3099c618202fcfe16ae7770b0c49ab5eadf74b754204a3bb6060e44eff3
IN+=7618b065f9832de4ca6ca971a7a1adc826d0f7c00181a5fb2ddf79ae00b4e10e
cast call 0x0000000000000000000000000000000000000100 \
  --data $IN --rpc-url $M                             # 返回 …01
# 7702：带 1 个授权元组估算 gas，返回 0xb57e
A=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
curl -s $M -H 'content-type: application/json' -d '{
 "jsonrpc":"2.0","id":1,"method":"eth_estimateGas",
 "params":[{"from":"'$A'","to":"'$A'","type":"0x4",
  "authorizationList":[{"chainId":"0x1388",
   "address":"0x000000000000000000000000000000000000dEaD",
   "nonce":"0x1","yParity":"0x0","r":"0x1","s":"0x1"}]}]}'
```

## U 术语表 {depth=2}
```glossary
PQ | post-quantum，后量子 | 在普通电脑上运行、设计目标是量子计算机也破不了的密码算法。 | 不是量子通信，也不需要量子硬件
CRQC | 密码学相关量子计算机 | 能实际破解当前公钥密码的量子计算机。 | 不是今天已有的几百比特芯片
Q-day | — | CRQC 出现、椭圆曲线密码失效的那一天。 | 没有可靠日期
逻辑比特 | logical qubit | 由几百个物理比特经纠错组成的可靠计算单元。 | 不等于芯片上的物理比特数
Shor 算法 | Shor's algorithm | 量子算法，高效求解离散对数与大数分解。 | 不影响哈希
Grover 算法 | Grover's algorithm | 量子搜索算法，把无结构搜索次数开平方，难以并行。 | 不会让 AES、SHA-256 失效
HNDL | 先收集、后解密 | 今天保存密文，将来用量子计算机解密；只影响保密性。 | 不影响公开链签名
ECDSA | secp256k1 签名 | EOA 交易与多签签名人使用的椭圆曲线签名。 | 不是 PQ
BLS | BLS12-381 签名 | Ethereum 验证者的签名，可以把大量签名聚合成 96 字节。 | PQ 替代品没有这种原生聚合
KZG | KZG 承诺 | 给 blob 数据做可抽查的“数学指纹”，依赖可信设置。 | 不是哈希承诺
可信设置 | trusted setup | 生成证明系统公共参数（SRS）的多方仪式；SRS 里藏着秘密数 τ。 | SRS 是仪式的产物；仪式对量子攻击者无效
BN254 | alt_bn128 | Ethereum 预编译支持的配对曲线，L2 在 L1 上验证 SNARK 用它。 | EIP-2537 作者估计其经典安全约 80 bit，量子下失效
PLONK | — | 一种 SNARK 证明格式；Mantle 的最终证明用 BN254 上的 PLONK。 | 不是 STARK
STARK | — | 只依赖哈希的证明系统，被认为 plausibly PQ，证明较大。 | 内部用 STARK 不代表最终验证是 PQ
包装 | SNARK wrap | 把大的 STARK 证明压成小的 PLONK / Groth16 证明，方便在 L1 验证。 | 包装层决定最终的量子安全性
ML-DSA | FIPS 204 | NIST 标准化的格签名；ML-DSA-44 签名 2,420 字节。 | 不是 ML-KEM
Falcon | FN-DSA / FIPS 206 | 格签名，签名较小（666 字节）；FIPS 206 尚未发布。 | FN-DSA 与现有 Falcon 不兼容
SLH-DSA | FIPS 205 | 无状态哈希签名，假设保守，签名 7.9 KB 起。 | 不是 XMSS
XMSS | 有状态哈希签名 | 每把钥匙只能签有限次，状态复用会被伪造；Ethereum 的 leanSig 是其变体。 | 不能随便备份和回滚
ML-KEM | FIPS 203 | 格密钥封装，用于建立共享密钥。 | 不能用来签交易
混合签名 | hybrid / composite | 同时用经典签名和 PQ 签名；必须两者都通过（AND）。 | OR 模式不提供双算法安全
EIP-7702 | SetCode 交易 | 让 EOA 委托合约代码，但原 ECDSA 私钥仍能改写委托和发交易。 | 不会移除 ECDSA 根权限
EIP-8141 | Frame Transaction | 把交易拆成验证、付费、执行帧，账户自定验证规则；已排进 Hegotá。 | 本身不带 PQ 签名方案
k1 退役 | k1 exit | 让迁移后的账户不再接受 secp256k1 授权，例如 EIP-8151。 | 不是禁用整个 EOA 体系
MV-PQ | minimum viable PQ | EF 在 J* 设置的保底里程碑，Q-day 后以较弱保证维持运行。 | 不是完整迁移
leanVM | — | EF 为聚合哈希签名而做的最小 zkVM，自述尚未生产就绪。 | 不是通用 zkEVM
OP Succinct | — | 用 SP1 有效性证明替代 OP Stack 故障证明的方案，Mantle 2025-09 起使用。 | 不是 OP Labs 的产品
SP1 Gateway | SP1VerifierGateway | 按证明前 4 字节把证明路由到不同版本验证器的合约，由 Succinct 多签管理。 | 路由之间是 OR 关系
```

## V 参考资料 {depth=2}
1. [pq.ethereum.org](https://pq.ethereum.org/) — EF PQ 团队的路线表、FAQ、L2 准备清单（最后更新 2026-06-27）。**PRIMARY**
2. [ethereum.org：Post-quantum cryptography](https://ethereum.org/roadmap/security/quantum-resistance/) 与 Hegotá / Glamsterdam 页 — 四个脆弱面、PQ 团队、分叉时间；部分说法已过时。**PRIMARY**
3. [EF：Current and Emerging Priorities（2026-09-07）](https://blog.ethereum.org/2026/09/07/protocol-priorities) — “December 2029 三层”目标、MV-PQ、分叉节奏。**PRIMARY**
4. [EF：Hegotá EIP Tier List（2026-09-07）](https://blog.ethereum.org/2026/09/07/protocol-hegota-eips) — EIP-8355 “premature standardization”、k1 退役包。**PRIMARY**
5. [EIP-8081 Hegotá meta](https://eips.ethereum.org/EIPS/eip-8081) — SFI / CFI / PFI / Declined 列表。**PRIMARY**
6. [ethereum/strawmap changelog](https://github.com/ethereum/strawmap) 与 [strawmap.org](https://strawmap.org/) — 占位分叉与 PQ 项的调整记录。**PRIMARY**
7. [EIP-8141 Frame Transaction](https://eips.ethereum.org/EIPS/eip-8141) — 签名 scheme 表与 PQ 动机。**PRIMARY**
8. [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702)、[EIP-4844](https://eips.ethereum.org/EIPS/eip-4844)、[EIP-197](https://eips.ethereum.org/EIPS/eip-197) — 授权、KZG、BN254 预编译。**PRIMARY**
9. [EIP-8151](https://eips.ethereum.org/EIPS/eip-8151) — 迁移后旧 k1 私钥仍可经 `ecrecover` 授权的问题，以及对 L2 的影响。**PRIMARY**
10. [EIP-8288](https://eips.ethereum.org/EIPS/eip-8288) — PQ 签名与 STARK 的区块级聚合（Draft）。**PRIMARY**
11. [EIP-8292](https://eips.ethereum.org/EIPS/eip-8292) — 共识层聚合者角色（Draft）。**PRIMARY**
12. [EIP-8051](https://eips.ethereum.org/EIPS/eip-8051)、[EIP-8052](https://eips.ethereum.org/EIPS/eip-8052)、[EIP-7885](https://eips.ethereum.org/EIPS/eip-7885) — PQ 验签预编译（均为 Draft）。**PRIMARY**
13. [leanEthereum/leanVM @127510d1](https://github.com/leanEthereum/leanVM) 与 leanSig @c08a3bae — 128-bit ROM / 64-bit QROM、未达生产就绪。**PRIMARY**
14. [Vitalik：quantum emergency hard fork（2024-03-09）](https://ethresear.ch/t/how-to-hard-fork-to-save-most-users-funds-in-a-quantum-emergency/18901) — 地址定义与紧急恢复方案。**PRIMARY**
15. [Vitalik X 帖（2026-02-26）](https://x.com/VitalikButerin/status/2027075026378543132) — 四个脆弱面与 gas 量级。**PRIMARY**
16. [Google Research 博客（2026-03-31）](https://research.google/blog/safeguarding-cryptocurrency-by-disclosing-quantum-vulnerabilities-responsibly/) — ECDLP-256 资源估计、约 20 倍降幅。**PRIMARY**
17. [Babbush et al., arXiv 2603.28846v2](https://arxiv.org/abs/2603.28846) — 资源与硬件假设、三类攻击、Ethereum 脆弱性量化。**PRIMARY**
18. [NIST IR 8547 ipd](https://csrc.nist.gov/pubs/ir/8547/ipd)、[IR 8105](https://nvlpubs.nist.gov/nistpubs/ir/2016/NIST.IR.8105.pdf)、[PQC FAQ](https://csrc.nist.gov/projects/post-quantum-cryptography/faqs) — 量子影响、迁移时间、对称算法的口径。**PRIMARY**
19. [NIST PQC 标准化页](https://csrc.nist.gov/projects/post-quantum-cryptography/post-quantum-cryptography-standardization) 与第 3 轮附加签名页 — FIPS 206 状态、HAWK 撤回。**PRIMARY**
20. [FIPS 204](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.204.pdf)、[FIPS 205](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.205.pdf)、[Falcon 规范](https://falcon-sign.info/falcon.pdf)、[RFC 8391](https://datatracker.ietf.org/doc/html/rfc8391) — 尺寸表。**PRIMARY**
21. [GRI Quantum Threat Timeline Report 2025](https://globalriskinstitute.org/publication/quantum-threat-timeline-report-2025b/) — 专家概率调查。**PRIMARY**
22. [Anthropic：Discovering cryptographic weaknesses（2026-07-28）](https://www.anthropic.com/research/discovering-cryptographic-weaknesses) 与 HAWK 论文、[nist.gov/pqc](https://www.nist.gov/pqc) — HAWK 与 7 轮 AES 的结果和边界。**PRIMARY**
23. [Aztec：Post-Quantum Aztec（2026-10-15）](https://aztec.network/blog/post-quantum-aztec) — 两个目标、三个选型节点、证明系统需求。**PRIMARY**
24. [Aztec Docs：Keys](https://docs.aztec.network/developers/docs/foundational-topics/accounts/keys) — 协议密钥与地址派生。**PRIMARY**
25. [Optimism：A Post-Quantum Roadmap for the Superchain（2026-01-14）](https://optimism.io/blog/a-post-quantum-roadmap-for-the-superchain) — 2036 时间表与覆盖范围。**PRIMARY**
26. [StarkWare Quantum Hub Migration Register](https://quantum.starkware.co/migration-register) 与 research-hub 报告 starknet-account-model — Starknet 组件级 PQ 状态。**PRIMARY**
27. [Algorand v5.0.0](https://algorand.co/blog/algorand-v5.0.0-is-here.-heres-what-it-means-for-you)、[Post-Quantum Accounts](https://dev.algorand.co/concepts/accounts/post-quantum)、[PQ 技术页](https://algorand.co/technology/post-quantum) — 原生 Falcon 账户与剩余工作。**PRIMARY**
28. [BIP-360](https://github.com/bitcoin/bips/blob/master/bip-0360.mediawiki)、[BIP-361](https://github.com/bitcoin/bips/blob/master/bip-0361.mediawiki) — Bitcoin 的 P2MR 与旧签名退场（Draft）。**PRIMARY**
29. [Solana Foundation](https://solana.com/news/quantum-readiness) 与 [Anza（2026-04-27）](https://www.anza.xyz/blog/securing-solana-against-a-powerful-quantum-adversary) — Falcon 选型与迁移讨论。**PRIMARY**
30. [ZIP 2005](https://zips.z.cash/zip-2005)、[ZIP 258](https://zips.z.cash/zip-0258) — Zcash 可恢复 note 与 NU6.3。**PRIMARY**
31. [SP1 Security Model](https://docs.succinct.xyz/docs/sp1/security/security-model) 与 [Proof Types](https://docs.succinct.xyz/docs/sp1/generating-proofs/proof-types) — BN254 包装、扩域曲线假设、gas。**PRIMARY**
32. [Succinct：VEIL（2026-05-01）](https://blog.succinct.xyz/veil/) — 用哈希型包装替换 Groth16 的计划。**PRIMARY**
33. [a16z crypto：Lattice Jolt（2026-09-09）](https://a16zcrypto.com/posts/article/lattice-snarks-jolt-post-quantum-faster/) — 格型 SNARK，证明小于 100 KB，无 ZK。**PRIMARY**
34. [mantle-xyz/op-succinct `OPSuccinctL2OutputOracle.sol` @mantle-v1.6.1](https://github.com/mantle-xyz/op-succinct) 与 [sp1-contracts `SP1VerifierGateway.sol`](https://github.com/succinctlabs/sp1-contracts/blob/main/contracts/src/SP1VerifierGateway.sol) — 证明验证、权限、路由语义。**PRIMARY**
35. [L2BEAT：Mantle](https://l2beat.com/scaling/projects/mantle) 与配置 `packages/config/src/projects/mantle` @cd994874 — 合约清单、角色、风险、里程碑。**PRIMARY**
36. [Mantle Docs](https://docs.mantle.xyz/network) — OP Succinct 升级、Skadi / Limb / Arsia changelog。**PRIMARY**
37. Ethereum 主网与 Mantle RPC 读数（本报告 [面板 T](#panel-T)，2026-10-15/16），以及 [Safe 合约签名文档](https://docs.safe.global/advanced/smart-account-signatures)。**PRIMARY**
38. [IETF draft-ietf-lamps-pq-composite-sigs-19](https://datatracker.ietf.org/doc/draft-ietf-lamps-pq-composite-sigs/) — 复合签名的 strict AND。**PRIMARY**
39. [Cloudflare：Is your domain using post-quantum encryption?（2026-09-29）](https://blog.cloudflare.com/post-quantum-visibility/) — 约 70% 浏览器流量走混合 ML-KEM。**PRIMARY**
40. [ZKNOX ETHFALCON](https://github.com/ZKNoxHQ/ETHFALCON)、[ETHDILITHIUM](https://github.com/ZKNoxHQ/ETHDILITHIUM)、[Fireblocks evm-ml-dsa-verifier](https://github.com/fireblocks-labs/evm-ml-dsa-verifier) — EVM 上 PQ 验签的 gas。**PRIMARY**
41. [EF KZG 仪式 FAQ](https://github.com/ethereum/kzg-ceremony/blob/main/FAQ.md) — 1-of-N 假设与秘密泄露的后果。**PRIMARY**
42. [RISC Zero Security Model](https://dev.risczero.com/api/security-model) — STARK 层与 Groth16 层的量子安全标注。**PRIMARY**
43. [Sui：PQ signature schemes（2026-08-18）](https://www.sui.io/blog/suis-post-quantum-signature-schemes) — ML-DSA-65 / SLH-DSA 选型与时间表。**PRIMARY**
44. ChatGPT Deep Research（`research/from-aztec-pq-to-mantle-pq.md`）— 只作线索，修正见面板 S。

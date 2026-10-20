---
template: research
title: 后量子在 Mantle 的工程落地：预编译选型、双分叉兼容与账户级容灾方案
subtitle: Mantle 无需等待 Native AA 最终定稿，即可先行构建“合约级 PQ 智能账户 + 标准化验签预编译 + 预设应急策略”。7702 无法剥离 EOA 的 ECDSA 根控制权，只能作迁移辅助；真正的账户级容灾必须以合约账户为安全边界，并在 op-geth 与 OP Succinct 证明端实现双向一致性。
cols: 4
type: 工程实施 · 深度调研
audience: Mantle 协议架构师、客户端开发工程师与安全决策者：熟悉 EVM、OP Stack 与 Rollup 机制
scope: 各公链 PQ 实践对比（Algorand/Starknet/Solana/QRL）；数字签名候选算法（ML-DSA vs Falcon vs SLH-DSA）；开源库选型（mldsa-native/CIRCL/RustCrypto）；Mantle 预编译设计规范（无状态签名 vs 通用 NTT）；全栈证明一致性（op-geth + Kona / SP1 zkVM）；双硬分叉节奏与 upstream rebase 隔离；EIP-7702 协议层绕过机制深度剖析；面向机构资产的 PQ 智能账户模型与生命周期
evidence: 50 条论断台账（observed 34 / inferred 12 / speculative 4）；NIST FIPS 203/204/205/206 标准；EIP-7702/3607/8355/8051/7562 规范；Algorand v5.0.0 主网规范；Succinct OP Succinct 文档；Linux 基金会 PQCA 与 RustCrypto CVE-2026-24850
date: 2026-10-17 · v1
---
结论先行：本篇是 Mantle 后量子专题的第二篇（工程落地篇），与前篇《后量子从入门到路线》（`post-quantum-mantle`）紧密承接。前篇明确了量子计算机对椭圆曲线签名的毁灭性破坏与以太坊 2029 时间表；本篇回答 Mantle 内部短期如何自主落地可行的抗量子容灾工程（[F1](#F1)、[F19](#F19)）。

核心结论是三句话：
1. **破除 7702 容灾迷思**：EIP-7702 委托**绝不能**作为 ECDSA 被攻破后的安全边界。7702 并没有剥离 EOA 的 ECDSA 根控制权，攻击者一旦恢复私钥，既可直接向合约发起顶层交易搬空资产（完全绕过委托代码），也可在协议层签署新的授权撤销委托（[F16](#F16)、[F17](#F17)）。真正的后量子容灾必须要求资产在和平时期迁移进入受 EIP-3607 保护的**真正智能合约账户**（[F18](#F18)）。
2. **一个无状态的标准化验签预编译**：无需等待以太坊 Native AA 或通用 NTT 算子，Mantle 首期应在执行端（`op-geth`）与状态转换证明端（`Kona` in SP1 zkVM）同步引入独立的 ML-DSA-65 验签预编译（[F5](#F5)、[F9](#F9)、[F12](#F12)）。算法首选 FIPS 204 标准已冻结且获 AWS KMS 等机构 HSM 广泛支持的 ML-DSA-65，保留 Falcon-512 作为紧凑对照（[F5](#F5)、[F6](#F6)）。
3. **隔离 upstream rebase 冲突**：针对 Mantle 每年“两次硬分叉”节奏，自定义预编译必须置于专有扩展地址空间（如 `>0x0100`），并通过版本化适配合约与插件化注册层接入，绝不抢占以太坊未定稿的低位草案地址（如 EIP-8355/8051 的 `0x12/0x13`），将未来与以太坊主网升级的冲突彻底隔离（[F14](#F14)、[F15](#F15)）。

## A 公链 PQ 演进路径对比 {sheet meta="演进模型"}
```tree list
Algorand 路线 | 三阶段渐进式落地
  阶段 1：State Proofs | Falcon-1024 保护跨链证明
  阶段 2：LogicSig 验签 | 引入 FALCON_VERIFY 操作码，支持合约账户
  阶段 3：原生账户 | v5.0.0 (2026-08) 原生 Falcon-1024 账户激活
Starknet 路线 | 原生 AA 驱动敏捷演进
  证明层 STARK | 纯哈希构建，天然抗量子
  账户层 Cairo | 智能合约可编程，直接部署 Falcon-512 验签
Mantle 推荐工程路线 | 兼顾 EVM 兼容与证明等价
  密码学原语 | 引入独立 ML-DSA-65 预编译（op-geth + Kona）
  账户层实施 | ERC-4337 机构智能账户，双轨权限状态机
  上游演进衔接 | 保持版本化抽象，待 L1 标准定稿后平滑迁移
```

## B 核心关键数字 {sheet span=2 meta="工程参数基准"}
| 指标 / 参数 | 数值 / 规格 | 工程含义与边界 |
|---|---|---|
| **ML-DSA-65 公钥 / 签名** | 1,952 B / 3,309 B | NIST FIPS 204 Cat 3，单次验签总字节 ~5.3 KB |
| **Falcon-512 公钥 / 签名** | 897 B / ~666 B | 签名极小 (~1.5 KB 合计)，但 FIPS 206 仍是草案 |
| **ECDSA 经典签名** | 65 字节 | 经典基准，比 ML-DSA-65 小约 51 倍 |
| **纯 EVM 验签 gas 消耗** | 约 1,230,000 gas | Fireblocks ML-DSA-44 EVM 验证器实测基准 |
| **ERC-7562 验证 gas 上限** | 500,000 gas | 纯合约 EVM 验签无法通过公共 Bundler 内存池 |
| **ERC-7562 单 UserOp 体积** | 8,192 字节 | ML-DSA-65 双多签操作超标，需预缓存公钥 |
| **Algorand v5.0 主网激活** | 2026 年 8 月 | 证明原生 PQ 账户可行，但其共识与 VRF 仍依赖经典 |
| **Mantle L1 证明依赖** | BN254 PLONK / Groth16 | SP1 证明的外层包装，属于 L1 协同迁移范畴 |

## C 核心算法候选与活跃开源库 {sheet span=2 meta="FIPS 204/206 对比"}
| 算法 / 库 | 标准与语言 | 核心优势 | 局限与工程风险 |
|---|---|---|---|
| **ML-DSA-65** | FIPS 204 (模格) | 标准完全冻结，AWS KMS 等 HSM 原生支持 | 签名较大 (3.3 KB)，DA 与内存池压力适中 |
| **Falcon-512** | Draft FIPS 206 (NTRU) | 签名极其紧凑 (~666 B)，验签极快 | 标准未冻结，签名采样复杂，缺乏硬件生态 |
| **SLH-DSA-128s** | FIPS 205 (无状态哈希) | 保守安全假设，纯哈希依赖 | 签名极大 (7.8 KB)，验签慢，不适合高频链上 |
| **PQ Code Package** | C90 (PQCA) | 包含 CBMC 形式化验证与跨平台汇编优化 | 适合作为 CGO 底层与交叉测试基准 |
| **Cloudflare CIRCL** | Go | 活跃维护，纯 Go + 汇编，无缝对接 op-geth | 需固定具体 tag，补齐共识一致性单测 |
| **RustCrypto ml-dsa** | Rust | 纯 Rust，无 unsafe，完全适配 Kona/SP1 | **CVE-2026-24850** 警示：需确保版本 ≥ 0.1.0-rc.4 |
| **PQClean** | C | 历史基准 | **已于 2026-08 归档**，不宜作为活跃生产上游 |

## D 7702 委托 vs 真正的智能合约账户安全边界 {sheet span=2 meta="容灾对比"}
| 评价维度 | EIP-7702 委托 EOA | 真正的智能合约账户（Smart Account） |
|---|---|---|
| **EVM 底层性质** | 带有 `0xef0100` 委托标识的普通 EOA | 纯智能合约地址（`EXTCODESIZE > 0`） |
| **EIP-3607 保护** | **被明确豁免**：原 ECDSA 仍可作为顶层 sender | **强制保护**：协议层绝对禁止合约地址直接发交易 |
| **转账绕过攻击** | 攻击者直调代币合约，**完全绕过委托代码** | **无法绕过**：所有操作必须穿透合约内部 `execute()` |
| **委托撤销攻击** | 攻击者可签发新 authorization 覆盖/清除委托 | **无协议层撤销**：升级与控制权仅受内部代码管辖 |
| **量子容灾有效性** | **无效（虚假容灾）**，仅适合批量迁移跳板 | **有效（强安全边界）**，形成不可旁路的 PQ 防线 |

## E 架构全貌：Mantle PQ 最小实现全栈链路 {sheet span=2 meta="系统架构"}
```tree list
客户端与签名管理 | 机构级 HSM / KMS
  ML-DSA-65 签名 | AWS KMS 硬件模块直接出签
  UserOp 封装 | 仅携带签名，公钥预先在合约内缓存
合约与账户层 | 协议解耦的可编程防御
  PQ 智能账户 | ERC-4337 兼容，预置多重审批与紧急状态机
  版本化适配器 | PQVerifierAdapterV1，屏蔽底层预编译地址变动
执行客户端 (op-geth) | 高性能独立预编译
  注册空间 | 0x0100 以上保留命名空间
  验签引擎 | 集成 Cloudflare CIRCL (Go) 优化实现
状态转换证明器 (OP Succinct) | 双端一致性与证明生成
  Kona STF | 集成 RustCrypto ml-dsa (Rust)，保证执行一致
  SP1 zkVM | RISC-V 虚拟机内证明，初期无需定制电路预编译
```

## F 结论与行动建议 {sheet span=4}
```callout ok 破除 7702 迷思，以无状态预编译和真正合约账户构建 Mantle PQ 容灾防线
- 破除迷思：7702 没有剥离 ECDSA 根权限，不能作为容灾终点；真正的后量子容灾必须让资金提前进入不可旁路的智能合约账户（F16、F17、F18）。
- 算法选型：首选标准冻结且具备机构 HSM 支持的 ML-DSA-65；将 Falcon-512 保留为轻量紧凑对照（F4、F5、F6）。
- 预编译规范：选择端到端无状态签名验签预编译，收敛底层审计边界；绝不抢占以太坊未定稿的低位草案地址（F9、F11、F14）。
- 全栈证明：Mantle 接入了 OP Succinct，新增预编译必须在 op-geth (Go) 与 Kona (Rust in SP1 zkVM) 双端保证绝对一致性（F12、F13）。
- 权限状态机：机构储备采用“日常双签 + 应急单向接管”模型；必须在和平期提前登记 PQ 公钥，谨防攻击发生时公钥注册被抢跑（F19、F20）。
- 系统边界：账户级 PQ 保护无法自动解决 L1 共识、KZG DA 与 Groth16/PLONK 结算证明系统的风险；两者需分别治理（F21、F22）。
```

## G 如何阅读 {depth=1}
```callout info 系列导航：Mantle 后量子专题共三篇
- 第一篇 [《后量子从入门到路线》](/p/post-quantum-mantle/)：哪些密码学组件会被量子攻破，各项目怎么做，Mantle 哪些部分要自己迁。
- 第二篇 [《后量子在 Mantle 的工程落地》](/p/pq-in-mantle/)：合约级 PQ 账户 + 验签预编译，为什么 7702 不能当容灾。
- 第三篇 [《后量子签名选型》](/p/pq-signature-selection/)：哈希路线 vs 格路线、EIP-8288，以及对前两篇的修订（第三篇面板 R）。
```

```callout warn 2026-10-20 修订（详见第三篇面板 R）
- EIP-8355 的消息不是 32 B 摘要，而是末尾变长字节，按 FIPS 204 验原始消息；8355 已在 EIP-8081 中列为 Declined（台账 51）。
- `0x0100–0x01ff` 是 EIP-7587 保留给 RIP 流程的共享区间，不是 Mantle 专有空间；选地址前先查 RIP 注册表或走 RIP 流程（台账 52）。
- Native AA 的时间线已变：EIP-8141 排进 Hegotá，ethereum.org 预计 2027 Q2 上主网；台账 #47 已过时（台账 53）。
- 预编译定位为近期容灾工具；适配器应抽象“验证后端”，并允许一个账户登记多把不同算法的公钥（台账 54）。
```

```callout info 默认背景知识（本文不再赘述）
- 了解前篇《后量子从入门到路线》（`post-quantum-mantle`）建立的密码学清单与 Shor 威胁模型
- 熟悉 EVM 交易执行模型、预编译合约（Precompile）调用机制与 `STATICCALL`
- 熟悉 ERC-4337 账户抽象机制与 EIP-7702 委托概念
- 熟悉 OP Stack 与 OP Succinct（Kona / SP1 zkVM）的基本交互架构
```
- **5 分钟（技术决策者 / 老板）**：阅读顶部结论与总览面板 A–F，重点理解面板 D 对 7702 局限的剖析与面板 F 的核心建议。
- **30 分钟（架构师与核心开发）**：完整研读 [公链实践](#panel-H)、[算法与工程库](#panel-I)、[预编译设计](#panel-K)、[全栈证明一致性](#panel-L)、[双硬分叉隔离策略](#panel-M)、[7702 底层绕过剖析](#panel-N) 以及 [机构账户状态机](#panel-O)。
- **代码复核与安全审计**：查阅 [工程实施路线图](#panel-P)、[残余风险清册](#panel-Q) 与 [论断台账映射](#panel-R)。

---

## H 公链 PQ 实践与分层演进对比 {depth=2}
“支持抗量子”在公链技术语境中存在四层不同的防御边界：账户授权、状态证明、共识身份与隐私通信。账户授权具备 PQ 能力，绝不意味着整条链已抗量子（台账 #1, #3, #5）。

下图中展示了 Algorand 历时数年的抗量子落地路径与 Mantle 推荐工程路线的映射关系：

```excalidraw q="Algorand 的三阶段 PQ 演进对 Mantle 有何借鉴意义？" read="左侧为 Algorand 的三阶段推进路径；右侧为 Mantle 在 EVM 生态下的对应工程映射。绿框表示已验证可行或推荐切入点；黄色表示需谨慎权衡的演进点。" takeaway="Algorand 证明了无需等待全链共识或原生账户改造，先提供跨链/可编程验签能力是经过实战检验的成熟路线。" kind=演进路径图
{"grid": {"w": 340, "h": 90}, "defaults": {"w": 280, "h": 60, "fontSize": 15},
 "nodes": [
   {"id": "a1", "label": "Algorand 阶段 1：State Proofs\n(Falcon-1024 保护跨链证明)", "col": 0, "row": 0, "color": "blue"},
   {"id": "a2", "label": "Algorand 阶段 2：LogicSig\n(AVM 引入 FALCON_VERIFY)", "col": 0, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "a3", "label": "Algorand 阶段 3：原生账户\n(v5.0.0 Falcon-1024 账户上线)", "col": 0, "row": 2, "color": "blue"},
   {"id": "m1", "label": "Mantle 切入点：独立预编译\n(op-geth + Kona 实现 ML-DSA-65)", "col": 1, "row": 0, "color": "green", "strokeWidth": 3},
   {"id": "m2", "label": "Mantle 容灾层：机构智能账户\n(ERC-4337 兼容，预置应急状态机)", "col": 1, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "m3", "label": "Mantle 远期衔接：Native AA\n(待以太坊 L1 标准定稿后平滑接入)", "col": 1, "row": 2, "color": "yellow"}
 ],
 "edges": [
   {"from": "a1", "to": "a2"}, {"from": "a2", "to": "a3"},
   {"from": "m1", "to": "m2"}, {"from": "m2", "to": "m3"},
   {"from": "a2", "to": "m1", "stroke": "dashed"}
 ]}
```

```finding F1 high
# Algorand 演进经验：先做可编程验签，再做原生账户
claim: Algorand 采取了“State Proofs 跨链边界 (Falcon-1024) → LogicSig 合约验签 (AVM FALCON_VERIFY) → v5.0.0 原生账户 (Falcon-1024)”的三阶段演进路径。其主网共识消息仍使用 Ed25519，VRF 仍依赖椭圆曲线。
evidence: [observed] Algorand Technical Brief: Quantum-Resistant Transactions on Algorand with Falcon Signatures；Algorand v5.0.0 Release Notes（台账 #1, #2, #3）。
implication: 证明了“无需等待全链共识修改，先给预编译再做智能合约账户”是完全行得通的工程解法；“原生 PQ 账户上线”与“全链已抗量子”必须严格区分。
```

Starknet 依托原生账户抽象（Native Account Abstraction），所有账户天生即为智能合约。社区已在主网完成 Falcon-512 实验性账户交易，验证逻辑直接写在 Cairo 合约中，其底层的 STARK 证明系统纯基于哈希，天然具备抗量子特性（台账 #4, #5）。这印证了解耦账户模型能赋予生态极高的密码学敏捷性。

```finding F2 high
# Starknet 原生 AA 赋予了极高的密码学敏捷性
claim: Starknet 原生 AA 允许用户在 Cairo 合约中直接实现并测试 Falcon-512 验签逻辑，无需共识硬分叉。其底层 STARK 证明系统基于哈希天然抗量子，但 L1 结算仍依赖以太坊共识。
evidence: [observed] Starknet Blog: Quantum Resistance on Starknet；OpenZeppelin cairo-pq-verifiers 仓库（台账 #4, #5）。
implication: 合约化账户将签名验证与交易协议层解耦；Mantle 依托 ERC-4337 能够复现同等的密码学敏捷性，避免把所有算法逻辑绑死在协议层。
```

反观 Solana 生态，社区项目（如 Winterwallet）曾尝试基于 Winternitz 一次性签名（WOTS）构建抗量子金库（台账 #6）。WOTS 与 XMSS/LMS 属于**有状态哈希签名（Stateful Hash-Based Signatures）**，存在不可调和的工程缺陷：私钥索引绝不能被重复使用。一旦在网络异步、多设备登录、钱包重试或链回滚时针对两条不同消息使用了同一私钥索引，攻击者就能瞬间反解出完整私钥并转移所有资产（台账 #7）。

```finding F3 high
# 有状态哈希签名存在致命的状态回滚与重用隐患
claim: WOTS、XMSS 等有状态哈希签名若在重试、回滚或多设备上重复使用同一私钥索引，会导致私钥立即泄露。Solana Winterwallet 等应用级尝试均对密钥重用发出严重警告。
evidence: [observed] NIST SP 800-208 规范；Solana Winterwallet Security Documentation（台账 #6, #7）。
implication: Mantle 无论在协议层还是账户层，严禁引入有状态哈希签名作为默认机构方案，必须坚持使用无状态算法（ML-DSA 或 Falcon）。
```

---

## I PQ 签名算法候选深度评估 {depth=2}
在抗量子密码学体系中，必须严格区分密钥封装（KEM）与数字签名（DSA）。NIST FIPS 203 标准化的 **ML-KEM**（Kyber）专门用于建立会话共享密钥以防范“先收集后解密（HNDL）”，**根本无法用于区块链交易签名**（台账 #8）。替代 ECDSA 的只能是数字签名算法。

```excalidraw q="核心数字签名候选算法在公钥大小、签名大小与验证特性上有何根本差异？" read="横向对比四大候选。蓝框表示公钥/签名数据体量；绿框表示核心优势；红框表示工程痛点。ML-DSA-65 提供了最佳的标准稳定性与机构生态平衡。" takeaway="ML-DSA-65 胜在标准冻结与 HSM 支持；Falcon-512 胜在签名字节紧凑；SLH-DSA 签名过大难以链上高频使用。" kind=算法对比图
{"grid": {"w": 290, "h": 90}, "defaults": {"w": 240, "h": 60, "fontSize": 15},
 "nodes": [
   {"id": "m65", "label": "ML-DSA-65 (FIPS 204)\nPK: 1,952 B | Sig: 3,309 B", "col": 0, "row": 0, "color": "green", "strokeWidth": 3},
   {"id": "m65_adv", "label": "标准已正式发布冻结\nAWS KMS 原生硬件支持", "col": 0, "row": 1, "color": "green"},
   {"id": "m44", "label": "ML-DSA-44 (FIPS 204)\nPK: 1,312 B | Sig: 2,420 B", "col": 1, "row": 0, "color": "blue"},
   {"id": "m44_adv", "label": "Cat 2 参数，带宽友好\n适合轻量对照测试", "col": 1, "row": 1, "color": "blue"},
   {"id": "fal", "label": "Falcon-512 (FIPS 206)\nPK: 897 B | Sig: ~666 B", "col": 2, "row": 0, "color": "blue"},
   {"id": "fal_dis", "label": "签名极小，验签超快\n但 FIPS 206 未定稿，缺乏 HSM", "col": 2, "row": 1, "color": "yellow"},
   {"id": "slh", "label": "SLH-DSA-128s (FIPS 205)\nPK: 32 B | Sig: 7,856 B", "col": 3, "row": 0, "color": "red"},
   {"id": "slh_dis", "label": "签名超 7.8 KB 严重超标\n不适合高频链上操作", "col": 3, "row": 1, "color": "red"}
 ],
 "edges": [
   {"from": "m65", "to": "m65_adv"}, {"from": "m44", "to": "m44_adv"},
   {"from": "fal", "to": "fal_dis"}, {"from": "slh", "to": "slh_dis"}
 ]}
```

```finding F4 high
# 数字签名是唯一正确的账户候选；FIPS 204 是核心基准
claim: NIST FIPS 203 为 ML-KEM（密钥封装），仅用于密钥协商，不能用于交易签名；FIPS 204（ML-DSA）与 FIPS 205（SLH-DSA）才是数字签名标准；Falcon 对应的 FIPS 206 仍在制定中。
evidence: [observed] NIST FIPS 203、FIPS 204、FIPS 205 官方发布文本；NIST CSRC PQC 标准化进程文档（台账 #8, #9, #10, #11）。
implication: 方案设计必须彻底排除 KEM 类算法；所有研发资源应当聚焦在标准数字签名算法的验签与工程接入上。
```

在数字签名候选算法中，Mantle 短期的最优工程基准是 **ML-DSA-65**：
- **标准完全冻结**：NIST FIPS 204 于 2024 年 8 月正式发布，参数、编码与上下文规范已完全敲定，不存在后续分叉修改算法规范的向后兼容风险（台账 #9）。
- **机构级 HSM 硬件支持**：AWS KMS 已正式支持 ML-DSA-44/65/87 在 HSM 内部直接生成私钥与出签（台账 #16）。对于机构储备与大资金托管，私钥不出硬件安全模块是硬性合规底线。
- **纯整数算术与确定性**：基于模格（Module-LWE），全部为模数 $q = 8380417$ 的模整数运算，无浮点数陷阱，多语言与 zkVM 移植成本极低。

```finding F5 high
# ML-DSA-65 应当作为 Mantle 机构账户的首选基准
claim: ML-DSA-65（FIPS 204，NIST Category 3）标准已正式冻结，且已获得 AWS KMS 等企业级硬件模块原生支持，安全余量对标 AES-192，是机构长期冷储备资产的最优工程基准。
evidence: [observed] NIST FIPS 204 规范；AWS KMS 官方开发指南关于 PQC 的支持文档；[inferred] 机构资金合规底线要求 HSM 支持，标准稳定性高于节省带宽（台账 #12, #16, #39, #48）。
implication: Mantle 第一版预编译应锁定 FIPS 204 ML-DSA-65 档案；这能让机构客户无需等待自研硬件，直接复用成熟的云端 KMS 资产管理流。
```

Falcon-512 的主要吸引力在于其签名极小（仅 ~666 字节，公钥 897 字节，台账 #13）。但必须看到其工程制约：
1. **FIPS 206 仍在制定中**：Thomas Pornin 等原作者明确警告，在最终标准发布前，不能保证编码向后兼容（台账 #11）；
2. **签名端采样算法极度复杂**：Falcon 基于 NTRU 格与陷门高斯采样（Fast Fourier Sampling），防侧信道防护与硬件化极度困难，主流 HSM 硬件对其原生支持预计滞后 ML-DSA 2–3 年（台账 #48）。
不过，Falcon 的**验签过程**完全是确定性的，不需要浮点数运算，不存在共识不确定性（台账 #15）。因此，Falcon 应作为备用对照方案，待 FIPS 206 正式定稿后再评估是否扩展支持。

```finding F6 high
# Falcon-512 签名小但标准未定，可作轻量对照
claim: Falcon-512 签名紧凑（约 666 字节）且验签完全确定性无浮点运算；但其对应的 FIPS 206 标准尚未敲定，签名端采样复杂且缺乏通用 HSM 支持。
evidence: [observed] Falcon 算法技术规范；algorand/falcon 源码与 Thomas Pornin 实现警告（台账 #13, #15, #48）。
implication: 不建议 Mantle 第一版将所有押注放在 Falcon 上，但可以将其作为基准测试对照组，待标准敲定后引入第二预编译。
```

---

## J 活跃开源密码学工程库调研与共识一致性警示 {depth=2}
密码学库的选择不仅关乎速度，更关乎区块链共识的死生。历史常用的基准库 **PQClean 已于 2026 年 8 月正式归档**，其 README 明确建议开发者迁移至由 Linux 基金会后量子密码学联盟（PQCA）主导的 **PQ Code Package**（台账 #20）。

当前可直接用于 Mantle 客户端工程调研的核心库评估如下：
- **`mldsa-native` (PQCA / Linux Foundation)**：C90 标准实现，包含 CBMC 形式化验证与针对 AArch64/x86-64 的汇编加速，覆盖内存安全与无定时泄露测试。极其适合作为跨客户端对比的标准参考实现（台账 #17）。
- **Cloudflare CIRCL (`sign/mldsa`)**：纯 Go 语言实现，并附带针对 AVX2/NEON 的性能优化汇编，接口清晰。极其适合直接集成进 `op-geth` 的预编译注册模块中（台账 #18）。
- **RustCrypto `signatures/ml-dsa`**：纯 Rust 实现，无 `unsafe` 代码。完全适配 `Kona` 以及在 SP1 zkVM RISC-V 目标架构下的编译（台账 #19）。

```finding F7 high
# PQCA mldsa-native 与 Cloudflare CIRCL 是最佳工程参考
claim: PQClean 于 2026 年 8 月归档，不再作为活跃上游；Linux 基金会 PQCA 的 `mldsa-native` 提供了经形式化验证的 C 参考实现；Cloudflare CIRCL 提供了适合 op-geth 的高质量 Go 实现。
evidence: [observed] PQClean GitHub 归档声明；PQCA 官方公告；Cloudflare CIRCL 源码仓库（台账 #17, #18, #20）。
implication: Mantle 执行端无需从头造轮子，可直接采用 CIRCL 接入 `op-geth`，并以 `mldsa-native` 作为自动化交叉测试的标准基准。
```

在引入第三方密码学库时，必须极度警惕**边缘情况下的共识分歧**。RustCrypto `ml-dsa` 在 2026 年曾爆出 **CVE-2026-24850（GHSA-5x2r-hc65-25f9）** 漏洞：在版本 0.0.4 中，代码将检查提示向量（hint）索引严格单调递增的严格小于号（`<`）误改成了小于等于号（`<=`），导致库能够接受包含重复 hint 索引的畸形签名，直到 `0.1.0-rc.4` 才被修复（台账 #19）。在传统互联网应用中，这只是轻微的签名可塑性（malleability）问题；但在区块链网络中，如果出块节点使用 CIRCL 拒绝了这笔交易，而某个运行 Rust 客户端的验证节点或证明器接受了这笔交易，就会直接导致**区块链共识分裂（Chain Split）或证明生成失败**！

```finding F8 high
# 密码学库细微边界差异可引发灾难性共识分歧
claim: RustCrypto `ml-dsa` 曾因 hint 索引单调性检查符号误改（`<` 变 `<=`）导致接受含重复 hint 的畸形签名（CVE-2026-24850），该差异若跨客户端并存将直接引发链分叉或证明失败。
evidence: [observed] GitHub 安全公告 GHSA-5x2r-hc65-25f9；CVE-2026-24850 记录（台账 #19）。
implication: 必须对 `op-geth` (Go) 与 `Kona` (Rust) 进行全方位的差分模糊测试（Differential Fuzzing），并确保 Rust 侧依赖严格锁定在 ≥ 0.1.0-rc.4。
```

---

## K Mantle 最小实现：预编译设计边界 {depth=2}
为什么 Mantle 应当提供**无状态的独立签名验签预编译**，而不是通用 NTT 多项式数学原语？

```excalidraw q="专用签名验签预编译 vs 通用多项式 NTT 原语的责任边界对比" read="左侧为专用签名验签预编译，密码学边界收敛在底层客户端，合约只做权限判定；右侧为通用 NTT 原语，合约必须自行拼装复杂数学步骤，极易产生验签绕过漏洞。" takeaway="第一版必须选择专用 DSA 验签预编译，收敛安全与审计边界，避免让智能合约承担格密码正确性责任。" kind=预编译边界图
{"grid": {"w": 330, "h": 90}, "defaults": {"w": 280, "h": 60, "fontSize": 15},
 "nodes": [
   {"id": "p1", "label": "专用 ML-DSA-65 预编译 (推荐)\nSTATICCALL 0x01XX(pk, sig, msg)", "col": 0, "row": 0, "color": "green", "strokeWidth": 3},
   {"id": "p1_b", "label": "底层 Go/Rust 完成全部校验\n(范数检查、拒绝采样、KAT 向量)", "col": 0, "row": 1, "color": "green"},
   {"id": "p1_c", "label": "合约层极简：检查返回是否为 1\n审计边界收敛，抗攻击面小", "col": 0, "row": 2, "color": "green"},
   {"id": "p2", "label": "通用 NTT / 向量数学预编译\n提供多项式乘法、NTT 基础算子", "col": 1, "row": 0, "color": "red"},
   {"id": "p2_b", "label": "合约需发起数十次预编译调用\nGas 极其复杂，调用开销居高不下", "col": 1, "row": 1, "color": "red"},
   {"id": "p2_c", "label": "合约必须自行实现格采样与绑定\n逻辑极其脆弱，稍有瑕疵即遭绕过", "col": 1, "row": 2, "color": "red"}
 ],
 "edges": [
   {"from": "p1", "to": "p1_b"}, {"from": "p1_b", "to": "p1_c"},
   {"from": "p2", "to": "p2_b"}, {"from": "p2_b", "to": "p2_c"}
 ]}
```

```finding F9 high
# 专用签名验签预编译是收敛审计边界的唯一合理选择
claim: 专用签名验签预编译将多项式算术、拒绝采样与范数约束完整封装在客户端底层，智能合约仅需校验验签布尔结果；通用 NTT 原语会把致命的密码学组装责任推给应用合约。
evidence: [inferred] 密码学 API 设计原则；EIP-8355 规范设计理念（台账 #37）。
implication: Mantle 严禁在第一期尝试通用数学算子，必须提供端到端原子化的 ML-DSA 验签接口。
```

纯智能合约验签不可行：Fireblocks 的实验性 ML-DSA-44 EVM 验签器在纯 EVM 字节码下单次验签消耗高达 **1,230,000 gas**（台账 #21）。而根据以太坊标准 **ERC-7562**（账户抽象内存池验证规则），单个 UserOperation 在验证阶段允许消耗的 gas 上限严格为 **500,000**，且 UserOp 序列化后最大字节不能超过 8,192 字节（台账 #22）。这意味着纯合约方案不仅极其昂贵，而且**根本无法被标准 ERC-4337 Bundler 接收和打包**（台账 #42）！

```finding F10 high
# 纯 EVM 合约验签受限于 ERC-7562 规则，无法进入公共内存池
claim: Fireblocks ML-DSA-44 EVM 验签器消耗约 1.23M gas，远超 ERC-7562 规定的 500k 验证 gas 上限；加上 ML-DSA-65 签名体积，纯合约验证无法通过标准 Bundler 内存池。
evidence: [observed] Fireblocks evm-ml-dsa-verifier 基准报告；ERC-7562 验证规范（台账 #21, #22, #42）。
implication: 必须由底层协议引入原生预编译，将单次验签 gas 压降至远低于 500k 内存池上限的水平，才能让 PQ 智能账户在 ERC-4337 基础设施中顺畅流转。
```

### 预编译规范与 Fail-Closed 原则
预编译合约的接口设计可借鉴 Danno Ferrin 提出的 **EIP-8355** 草案规范：
- **输入编码**：`public_key (1952 B) || signature (3309 B) || message (32 B digest)`
- **输出**：32 字节。成功返回 `0x00...01`，失败返回 `0x00...00`。
- **Fail-Closed 编程规范**：调用预编译必须使用 `staticcall`。在以太坊虚拟机中，**调用一个没有代码也没有激活预编译的地址，`staticcall` 同样会成功返回空数据（`returndatasize == 0`）**！因此，智能合约必须严格执行校验：
  ```solidity
  (bool success, bytes memory data) = PQ_PRECOMPILE.staticcall(payload);
  require(success && data.length == 32 && abi.decode(data, (uint256)) == 1, "PQ verification failed");
  ```
  缺少长度与值检查的合约会在预编译未激活时产生致命的假阳性放行漏洞（台账 #28）。

```finding F11 high
# 预编译调用必须严格遵循 Fail-Closed 原则，防范空地址假阳性
claim: EIP-8355 规范采用输入拼接与 32 字节返回值；调用方合约必须严格校验执行成功、返回长度恰好为 32 字节且值为 1，避免调用空地址时静默放行。
evidence: [observed] EIP-8355 草案文本；EVM 空地址执行特性（台账 #28）。
implication: 智能账户 SDK 与官方验证器模块必须由 Mantle 核心团队统一提供经过审计的模板代码，严禁开发者随意自写未加防御的 `staticcall`。
```

---

## L 全栈一致性：从 op-geth 到 OP Succinct (Kona / SP1) {depth=2}
Mantle 的主网状态证明已经接入了 **OP Succinct** 架构。这意味着 Mantle 绝不能只在 `op-geth` 里增加一个预编译，而必须完成全栈双端等价工程（台账 #31, #33）。

```excalidraw q="Mantle L2 节点执行端与 Succinct SP1 证明器端是如何保持预编译双向一致的？" read="左侧为执行端（Go / op-geth），负责出块与 RPC；右侧为证明端（Rust / Kona），在 SP1 zkVM RISC-V 虚拟机内执行相同状态转换。两者对预编译的返回和 gas 消耗必须绝对一致。" takeaway="新增预编译必须同时进入 op-geth 与 Kona，保证执行端与 ZK 证明端语义完全等价。" kind=全栈证明拓扑
{"grid": {"w": 320, "h": 90}, "defaults": {"w": 270, "h": 60, "fontSize": 15},
 "nodes": [
   {"id": "seq", "label": "Sequencer / op-geth (Go)\n执行交易并出块", "col": 0, "row": 0, "color": "blue"},
   {"id": "circl", "label": "Cloudflare CIRCL (Go)\n执行 ML-DSA-65 预编译验签", "col": 0, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "kona", "label": "Kona STF (Rust)\n运行在 SP1 RISC-V zkVM 内部", "col": 1, "row": 0, "color": "blue"},
   {"id": "rc_ml", "label": "RustCrypto ml-dsa (Rust)\nzkVM 内部执行相同验签逻辑", "col": 1, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "sp1", "label": "Succinct SP1 Prover\n生成可验证的状态转换证明", "col": 1, "row": 2, "color": "blue"},
   {"id": "l1", "label": "Ethereum L1 结算验证\nMantleRollup 合约验证 SNARK", "col": 1, "row": 3, "color": "yellow"}
 ],
 "edges": [
   {"from": "seq", "to": "circl"},
   {"from": "kona", "to": "rc_ml"},
   {"from": "rc_ml", "to": "sp1"},
   {"from": "sp1", "to": "l1"},
   {"from": "circl", "to": "rc_ml", "stroke": "dashed"}
 ]}
```

```finding F12 high
# Mantle 预编译必须在 Go (op-geth) 与 Rust (Kona) 双端完全等价
claim: Mantle 已部署 OP Succinct，其状态转换由 Kona 运行在 SP1 zkVM 中；执行端 op-geth (Go) 与证明端 Kona (Rust) 必须对预编译输入、错误处理和 gas 产生完全一致的行为。
evidence: [observed] blog.succinct.xyz 关于 Mantle OP Succinct 的官方案例报告；Kona 架构文档（台账 #31, #33）。
implication: 预编译的开发必须作为包含 Go 与 Rust 双实现的联合工程，任何单端上线都会直接导致生成证明失败，使整个 Rollup 停摆。
```

很多工程师容易混淆两种“预编译”：
- **EVM 预编译**：智能合约通过字节码 `STATICCALL` 调用的功能扩展。
- **SP1 内部电路预编译（Core Circuit Precompile）**：Succinct SP1 为了加速特定耗时哈希（Keccak-f1600）或曲线配对而在 RISC-V 虚拟机底层构建的专用 ZK 证明约束电路（台账 #32）。
**初期无需定制 SP1 电路预编译**：在第一阶段，Kona 内部直接以纯 Rust 软件运行 `ml-dsa`。虽然在 RISC-V 中验证 ML-DSA-65 会消耗数百万周期，但机构储备资金调用频率极低（每天数笔到数十笔），对整个区块数亿周期的证明总预算影响微乎其微。基于暂定的成本测算假设，只有当未来 PQ 交易量占单日区块 Gas 比例超过约 5% 时，为 SP1 专门开发硬件约束电路级 PQ 预编译才具有实际经济收益，该阈值有待后续压测验证（台账 #45, #49）。

```finding F13 high
# EVM 预编译不同于 SP1 电路预编译，初期纯软件证明完全够用
claim: EVM 合约预编译与 SP1 zkVM 底层约束电路预编译不同；低频机构金库调用下，Kona 内部纯 Rust 软件验签足以满足需求，初期无需定制昂贵的 SP1 专用电路约束（定制电路阈值属暂定推测）。
evidence: [observed] Succinct SP1 预编译开发规范；[inferred] 机构金库调用频次与 ZK 证明周期开销分析；[speculative] 5% 区块 gas 收益阈值（台账 #32, #45, #49）。
implication: 极大地降低了第一阶段的工程复杂度和上线门槛，避开了定制 ZK-SNARK 约束电路这一高风险环节。
```

---

## M 适配 Mantle“双硬分叉”：Rebase 隔离策略 {depth=2}
以太坊 L1 通常每年进行一次重大硬分叉。针对每次升级，Mantle 团队在工程实践中执行**两次硬分叉**：
- **第一次分叉（兼容性分叉）**：与 L1 升级严格同步，调整区块派生规则与引擎 API，确保 Rollup 节点不与 L1 脱节，防止链 halt；
- **第二次分叉（特性引入分叉）**：滞后一段时间，将 L1 新特性（新操作码、新系统预编译）引入 Mantle（台账 #34）。

```excalidraw q="Mantle 针对 L1 硬分叉的两次分叉节奏下，如何隔离自定义预编译与上游冲突？" read="上轨展示以太坊 L1 的升级节奏；中轨为 Mantle 的两次分叉节奏；下轨为自定义预编译的隔离防护措施。绿框展示了地址隔离与适配器模式。" takeaway="分配独立扩展地址空间（>0x0100）并采用版本化适配模块，能彻底隔离上游 rebase 覆盖与地址冲突。" kind=分叉与隔离图
{"grid": {"w": 330, "h": 90}, "defaults": {"w": 280, "h": 60, "fontSize": 15},
 "nodes": [
   {"id": "l1_fork", "label": "Ethereum L1 年度硬分叉\n(如 Pectra / Hegotá)", "col": 0, "row": 0, "color": "blue"},
   {"id": "m_f1", "label": "Mantle 分叉 1：兼容性防 Halt\n(同步派生逻辑，预编译保持原样)", "col": 0, "row": 1, "color": "green"},
   {"id": "m_f2", "label": "Mantle 分叉 2：特性引入\n(接入 L1 新操作码与新预编译)", "col": 0, "row": 2, "color": "green"},
   {"id": "risk", "label": "潜在冲突：地址抢占与 Rebase 覆盖\n(草案 0x12 冲突，代码合并丢失)", "col": 1, "row": 0, "color": "red"},
   {"id": "isol", "label": "防护 1：专用扩展命名空间\n(分配 0x0100 以上地址，仿 P256)", "col": 1, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "adap", "label": "防护 2：版本化适配器合约\n(PQVerifierAdapter 屏蔽底层变动)", "col": 1, "row": 2, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "l1_fork", "to": "m_f1"}, {"from": "m_f1", "to": "m_f2"},
   {"from": "l1_fork", "to": "risk"},
   {"from": "risk", "to": "isol"}, {"from": "isol", "to": "adap"}
 ]}
```

在这一节奏下，自定义预编译必须防范三大升级陷阱：
1. **地址冲突（Address Collision）**：以太坊社区同时存在 EIP-8355 与 EIP-8051 等草案，分别建议使用 `0x12` 或 `0x13`（台账 #29）。如果 Mantle 盲目抢用 `0x12`，当以太坊在后续硬分叉中把 `0x12` 分配给其他功能时，Mantle 的状态机就会彻底陷入与上游冲突的泥潭（台账 #35）！
2. **Rebase 覆盖**：在跟随 upstream geth 进行兼容性升级时，上游的代码变动很容易覆盖本地预编译映射表。
3. **接口漂移**：以太坊未来定稿的官方预编译可能采用不同的输入排序或消息打包格式。

**Mantle 的隔离工程策略**：
- **地址隔离**：参考 OP Stack 引入 `P256VERIFY` 的成熟先例（分配在 `0x0100`，台账 #30），将 Mantle 的 ML-DSA-65 预编译分配在独立的扩展命名空间（如 `0x0101`，台账 #36）。
- **插件化注册层**：将预编译映射代码收敛在独立的 `mantle_precompiles.go` 中，并通过 Hook 注册到各个分叉配置中，CI 建立自动化回归套件。
- **版本化适配合约**：智能账户绝不直接硬编码预编译地址，而是调用 `PQVerifierAdapterV1`。未来以太坊出台官方预编译后，只需部署 `PQVerifierAdapterV2`，用户账户即可无缝升级调用官方标准，实现旧资产平滑兼容。

```finding F14 high
# 抢占未定稿以太坊低位草案地址将带来破坏性冲突
claim: EIP-8051 与 EIP-8355 等互相竞争的草案均曾涉及 0x12、0x13 地址；提前占用低位草案地址在上游硬分叉时面临冲突覆盖与状态机不一致风险。
evidence: [observed] EIP-8051 与 EIP-8355 草案地址提议；[inferred] 跨链硬分叉历史命名空间冲突分析（台账 #29, #35）。
implication: 绝对禁止将 Mantle 自定义预编译部署在 1–30 号以太坊系统保留区间内。
```

```finding F15 high
# 扩展命名空间与适配器模式可彻底隔离 Rebase 风险
claim: 借鉴 OP Stack P256VERIFY（0x0100）的成功经验，置于独立扩展区间（>0x0100）并结合版本化适配器合约，可在历次 L1 分叉与 rebase 中保持完全隔离。
evidence: [observed] OP Stack Specification 预编译定义；[inferred] 智能合约版本化代理设计模式（台账 #30, #36）。
implication: 保证 Mantle 即使经历 5 次以上的 upstream rebase，PQ 账户和预编译逻辑也完全不受代码合并污染。
```

---

## N 深度剖析：为什么 EIP-7702 不能作为容灾安全边界？ {depth=2}
市场上存在一个严重误区：“当前用户先广泛使用 EIP-7702，将 EOA 委托给一个支持 PQ 验签的钱包合约；一旦 ECDSA 出现破解迹象，一键切换成 PQ 验签，资产就安全了。”

**必须以严谨的 EVM 规范戳破这一幻想：7702 无法提供任何后量子安全边界！**

```excalidraw q="掌握 ECDSA 私钥的攻击者是如何绕过 EIP-7702 委托代码搬空资产的？" read="上部展示 7702 委托 EOA 遭受的双重绕过路径；下部展示受 EIP-3607 保护的真正智能合约账户如何彻底阻断攻击者。" takeaway="7702 EOA 保留了顶层发交易与撤销委托的协议权限；只有真正的合约账户才能切断 ECDSA 旁路。" kind=7702绕过攻击图
{"grid": {"w": 330, "h": 90}, "defaults": {"w": 280, "h": 60, "fontSize": 15},
 "nodes": [
   {"id": "eoa", "label": "Alice 的 EOA (已 7702 委托)\n委托给 PQ 智能合约钱包", "col": 0, "row": 0, "color": "yellow"},
   {"id": "atk", "label": "量子攻击者算得 Alice ECDSA 私钥", "col": 0, "row": 1, "color": "red", "strokeWidth": 3},
   {"id": "by1", "label": "绕过路径 1：直接发起顶层交易\nfrom: Alice -> to: USDT -> transfer()\n完全跳过委托合约代码！(EIP-3607 豁免)", "col": 1, "row": 0, "color": "red", "strokeWidth": 3},
   {"id": "by2", "label": "绕过路径 2：协议层撤销委托\n提交新授权元组指向恶意合约/0\nPQ 合约防撤销代码被协议层忽略！", "col": 1, "row": 1, "color": "red"},
   {"id": "sc", "label": "真正的智能合约账户 (Smart Account)\n地址由 CREATE2 部署，无 ECDSA", "col": 0, "row": 2, "color": "green", "strokeWidth": 3},
   {"id": "blk", "label": "EIP-3607 强制阻断：无法作为 from 发交易\n所有资金流出必须穿透合约内部 execute()\n攻击者无 PQ 签名直接被 revert！", "col": 1, "row": 2, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "atk", "to": "by1"}, {"from": "atk", "to": "by2"},
   {"from": "atk", "to": "blk", "stroke": "dashed"}
 ]}
```

### 攻击路径一：直接发起顶层交易（Bypass Execution）
- **EIP-7702 规范核心**：EOA 设置代码（`0xef0100 || address`）后，依然是一个合法的交易发起者（Transaction Sender）。
- **EIP-3607 例外**：以太坊 EIP-3607 规定“禁止已拥有代码的地址作为交易发起者”，但 EIP-7702 为了允许委托 EOA 继续发送交易，**明确在协议层将带有委托前缀的 EOA 排除在 EIP-3607 检查之外**（台账 #23, #24）。
- **致命绕过**：假设 Alice 的 EOA 委托给了一个要求 PQ 签名的合约。攻击者用量子算法反解出 Alice 的 ECDSA 私钥后，**根本不需要调用 Alice 委托的那个智能钱包**，而是直接构造一笔标准以太坊转账：
  ```
  from: Alice
  to: TokenContract (USDT)
  data: transfer(AttackerAddress, 1,000,000)
  signature: ECDSA_Sign(AlicePrivKey, tx)
  ```
  在 EVM 执行层，`msg.sender` 就是 Alice！Token 合约立刻将 Alice 的代币全额转给攻击者！
  **整个过程中，Alice 委托的智能合约代码连一次都没有被加载执行！其内部编写的任何抗量子检查完全形同虚设！**（台账 #25）

```finding F16 high
# 7702 账户的顶层发交易权限使其完全无法防御 ECDSA 破解
claim: EIP-7702 EOA 保留了顶层交易发起权并被豁免于 EIP-3607；攻击者掌握 ECDSA 私钥后可直接向外部代币合约发起转账，完全绕过委托合约中的 PQ 验签代码。
evidence: [observed] EIP-7702 规范全文；EIP-3607 交互条款；以太坊官方 7702 指引（台账 #23, #24, #25）。
implication: 必须向团队与社区明确澄清：7702 不能作为 PQ 容灾方案的最终形态，宣传“7702 一键抗量子”在密码学上是不负责任的。
```

### 攻击路径二：协议层覆盖与撤销（Revocation & Delegation Overwrite）
即使攻击者不发直接转账，7702 规范明确规定：只要拥有 EOA 的私钥签名，就可以签署新的授权元组（authorization tuple），将委托地址覆盖为一个恶意合约，或者指向 `address(0)` 彻底清除委托（台账 #26）。
在委托合约的代码里写 `bool isRevocable = false` 没有任何用处，因为 7702 委托关系的建立和撤销发生在**协议执行层**，在调用任何合约代码之前就已经被处理了！

```finding F17 high
# 攻击者可随时通过协议层授权覆盖撤销 7702 委托
claim: 掌握被破解 ECDSA 私钥的攻击者可签署新的 authorization tuple，在协议层直接覆盖或清除 7702 委托，合约内部防撤销逻辑无法拦截协议层动作。
evidence: [observed] EIP-7702 授权元组与撤销规则说明（台账 #26, #38）。
implication: 7702 的这一定位决定了它只能用来做“批量转账的辅助跳板”，绝不可用作承载核心资金的资产金库。
```

### 真正的容灾：受 EIP-3607 保护的 Smart Contract Account
相比之下，由 `CREATE / CREATE2` 部署的**纯智能合约账户**具有本质上的安全优越性：
- 根据 **EIP-3607**，协议层严格禁止任何含有原生代码的合约地址作为顶层交易的 `from` 发送者（台账 #27）。
- 这意味着：**任何人都无法拿着这把地址对应的私钥（哪怕有）直接从它发起外部转账！**
- 所有由该账户自主发起的交易执行，**必须穿透该合约暴露的执行函数（如 `execute()`）**。而在该函数内部，Mantle 的验签逻辑强制要求合法的 ML-DSA-65 签名。攻击者即便掌握了历史上该合约所有者的 ECDSA 私钥，也根本无法绕过合约内部的安全检查！
- *注意边界*：正如 [面板 O](#panel-O) 所述，若账户此前曾对外部协议给过 ERC-20 无限授权，攻击者仍可能借由 `transferFrom` 搬走资金，因此冷金库必须同时收紧外部授权。

```finding F18 high
# 受 EIP-3607 保护的真正智能合约账户是唯一的有效防线
claim: 真正的智能合约账户受 EIP-3607 严格保护，无法作为顶层标准交易的发送者；所有账户自主发起的资金执行路径必须穿透合约内部执行函数，从而能够强制执行不可绕过的 PQ 验签（受制于外部代币授权边界）。
evidence: [observed] EIP-3607 规范文本；ERC-4337 智能账户执行模型（台账 #27）。
implication: Mantle 的后量子容灾方案必须确立为“真正的合约账户体系”，引导高价值机构资产进入专用智能金库。
```

---

## O 机构 PQ 智能账户模型与生命周期 {depth=2}
为兼顾机构用户日常运营的高性能、低 Gas 诉求与应对突发量子威胁的极端安全性，设计双轨运行权限状态机：

```excalidraw q="机构 PQ 智能账户在日常运行态与应急接管态之间的生命周期转换" read="左侧展示正常时期的双重审批模式；中间为应急触发事件；右侧展示应急接管态与最终恢复。绿框代表 PQ 根权限；红框代表经典私钥被完全剥离。" takeaway="正常时期经典与 PQ 兼顾，危机时 PQ 密钥单向一键接管并剥离所有 ECDSA 权限，形成闭环防线。" kind=权限状态机
{"grid": {"w": 330, "h": 90}, "defaults": {"w": 280, "h": 60, "fontSize": 15},
 "nodes": [
   {"id": "s_norm", "label": "正常运行态 (Normal Mode)\n日常提款与调仓", "col": 0, "row": 0, "color": "blue"},
   {"id": "r_norm", "label": "权限规则：经典 AND PQ 双签\n(ECDSA 经机构审批 + ML-DSA-65 KMS 出签)", "col": 0, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "ev_emg", "label": "突发应急事件 / 密码学报警\n(持有预设 PQ 密钥签署紧急指令)", "col": 1, "row": 0, "color": "red"},
   {"id": "s_emg", "label": "应急接管态 (Emergency Mode)\n彻底封锁传统入口", "col": 1, "row": 1, "color": "yellow", "strokeWidth": 3},
   {"id": "r_emg", "label": "权限规则：仅限 PQ 单向授权\n(停用一切 ECDSA 权限，撤销 Session Key)", "col": 1, "row": 2, "color": "red", "strokeWidth": 3},
   {"id": "s_rec", "label": "恢复与迁移态 (Recovery)\n完成密钥轮换与新金库迁移", "col": 2, "row": 1, "color": "green"}
 ],
 "edges": [
   {"from": "s_norm", "to": "r_norm"},
   {"from": "r_norm", "to": "ev_emg"},
   {"from": "ev_emg", "to": "s_emg"},
   {"from": "s_emg", "to": "r_emg"},
   {"from": "r_emg", "to": "s_rec"}
 ]}
```

```finding F19 high
# 双轨权限状态机实现了日常效率与抗量子容灾的平衡
claim: 机构智能账户采用“日常经典 AND PQ 组合审批，极端时由预设 PQ 密钥单向接管转为 PQ-only”的状态机设计，既不增加日常操作摩擦，又提供了不可逆的抗量子安全闭环。
evidence: [inferred] 机构资产管理多签模型与容灾状态机设计模式（台账 #40, #43）。
implication: 机构用户平时无需忍受复杂流程，遇到威胁时可一键进入绝对安全态，彻底废除被攻破的经典私钥。
```

### 关键防线：公钥提前绑定
公钥（或其哈希承诺）**必须在和平时期完成链上初始化登记**。如果等到量子计算机已经能破解 ECDSA 之后再去临时“登记 PQ 公钥”，攻击者同样可以冒充受害者在合约上登记攻击者的 PQ 公钥，导致灾难性的“抢跑注册”（台账 #41）。因此，机构开户必须包含原子化初始化与预先公钥承诺。

```finding F20 high
# PQ 密钥身份必须在和平期提前绑定，防止攻击发生时被抢跑
claim: 一旦 ECDSA 失效，攻击者可冒充用户发起公钥登记；因此 PQ 公钥或其哈希承诺必须在经典密码学仍可信时完成链上绑定。
evidence: [inferred] 密钥泄露抢跑攻击模型分析（台账 #41）。
implication: 容灾方案的价值在于“提前建好避难所”，而不是“着火后再造灭火器”；开户工具链必须引导机构提前完成公钥部署。
```

### 残余风险：DeFi 历史授权（Allowance）暴露
即使智能合约账户自身的代码无可挑剔，如果该账户曾在历史上对某个第三方 DeFi 协议（例如某个 AMM Router、借贷池合约）赋予了无限 `approve`，且该第三方合约本身的升级管理员私钥使用的是经典 ECDSA，攻击者通过攻破第三方协议的管理员权限，依然可以通过 `transferFrom` 间接卷走资金（台账 #46）。
因此，机构 PQ 智能账户第一版应严格定义为**低授权暴露的机构冷储备与资产结算金库**，在交互外部协议时推行单次限额授权与自动撤销。

```finding F21 high
# 第三方合约的 Allowance 是智能账户必须划定的残余风险边界
claim: 智能账户即便自身代码安全，其历史上授予第三方 DeFi 合约的 token allowance 仍可被攻破该协议的攻击者利用 `transferFrom` 转移。
evidence: [inferred] ERC-20 授权机制与智能合约权限传播链分析（台账 #46）。
implication: 机构 PQ 账户产品宣传必须坦诚说明这一系统边界，并提供一键清理历史 allowance 的辅助工具。
```

---

## P Mantle 工程实施路线图 {depth=2}
建议 Mantle 团队按照“安全闭环优先于功能数量”的原则，分四阶段推进抗量子落地：

```timeline
阶段 1：账户与威胁模型 PoC | 验证真合约账户与 7702 绕过攻击演示；完成无 ECDSA 旁路的合约账户与状态机测试
阶段 2：算法全栈基准 | Cloudflare CIRCL 与 RustCrypto ml-dsa 对比测试；测量 EVM 与 SP1 zkVM 周期开销
阶段 3：预编译测试网集成 | 执行端 op-geth 接入 0x0101 预编译，Kona 完成同步；跑通 OP Succinct 端到端证明
阶段 4：机构受限试点 | 联合合规托管商与 AWS KMS；推出面向高净值与储备资金的 PQ Smart Account 试点
```

### 必须纳入验收的测试与失败场景
1. **差分模糊测试（Differential Fuzzing）**：针对 `op-geth`（Go）与 `Kona`（Rust），注入超过 1000 万个随机畸形公钥、截断签名、越界 hint 索引与无效消息，确保两端绝对给出完全相同的错误码与 gas 消耗；
2. **7702 绕过攻击演练**：在测试网构建 7702 委托账户与真正的智能合约账户对照组，模拟拥有 ECDSA 私钥的黑客攻击，验证 7702 资金被直接搬空，而智能合约账户成功防御；
3. **分叉回放测试（Replay Safety）**：回放激活区块前后的历史区块，验证在激活高度前调用预编译地址时返回空数据且消耗基础 gas，防止全节点历史同步分叉；
4. **SP1 证明端到端生成**：在测试网上打包包含 10 笔 ML-DSA-65 验签操作的 Rollup 区块，使用 SP1 Prover 完整生成证明并提交至 L1 测试网验证合约，验证端到端证明耗时在可接受区间（< 15 分钟）。

---

## Q 残余风险边界与常见误区清册 {depth=2}
为防止团队与外部机构在沟通时产生不切实际的安全幻觉，明确列出以下边界：

| 流行误区 | 技术实质与真相 | 正确的工程表述 |
|---|---|---|
| **“给 7702 EOA 装个 PQ 模块就安全了”** | **错误**。攻击者持 ECDSA 私钥可直调外部合约搬空资产，或覆盖委托（台账 #25, #26） | 7702 只是迁移跳板；真正的安全必须进入真正的智能合约账户 |
| **“EVM 验签便宜，就等于证明端便宜”** | **错误**。EVM 预编译只决定 gas；SP1 证明器仍需在 RISC-V 虚拟机内证明该计算（台账 #31, #32） | 必须实测 Kona 在 SP1 内的周期消耗，综合评估全栈成本 |
| **“只要有 PQ 账户，全链资产就无懈可击”** | **错误**。账户 PQ 无法抵御 L1 共识、KZG DA 或 Mantle 结算证明验证器的量子风险（台账 #44） | 方案定位为“账户级授权容灾”，全链抗量子需与以太坊 L1 协同推进 |
| **“可以等以太坊 Native AA 定稿再做”** | **消极**。以太坊 Native AA 预计 2028-2029 年前难以定稿（台账 #47） | Mantle 可依托 ERC-4337 抢先建立机构安全心智与护城河 |

```finding F22 high
# 账户级 PQ 保护不等同于全链抗量子
claim: 账户级 PQ 智能账户仅解决账户授权与治理转移的安全性；Mantle 状态结算依赖的 L1 共识、KZG 数据可用性以及 Groth16/PLONK 证明验证器属于独立迁移边界。
evidence: [inferred] 分层密码学依赖与系列前篇报告《后量子从入门到路线》（台账 #44）。
implication: 对外沟通必须保持严谨中立，明确该产品是“后量子智能合约账户（PQ-Protected Smart Account）”，而非宣称“Mantle 已是后量子链”。
```

---

## R 论断台账映射与复现验证 {depth=2}
本报告所有论断均在 `research/ledger.md` 建立了严格的三分类台账（observed 34 条 / inferred 12 条 / speculative 4 条）。

关键数据与规范快速索引：
- **Algorand v5.0.0 Falcon-1024 规范**：`algod` v5.0.0 consensus hash v42 (2026-08) [台账 #1, #2, #3]
- **NIST FIPS 204 ML-DSA 参数**：ML-DSA-65 (PK 1952 B, Sig 3309 B, q=8380417) [台账 #9, #12]
- **EIP-7702 与 EIP-3607 交互**：EIP-7702 delegation indicator `0xef0100 || address` 豁免规则 [台账 #23, #24, #27]
- **RustCrypto CVE-2026-24850**：GHSA-5x2r-hc65-25f9 hint 索引修复 [台账 #19]
- **Fireblocks EVM Verifier 基准**：1.23M gas on ML-DSA-44 vs ERC-7562 500k 限制 [台账 #21, #22]

```bash title="复核 RustCrypto ml-dsa 漏洞修复"
# 验证 RustCrypto ml-dsa hint 单调性修复提交
cargo search ml-dsa --limit 1
# 确认依赖版本锁定在 0.1.0-rc.4 或更高版本，杜绝 CVE-2026-24850
```

```bash title="验证 EIP-8355 预编译输入输出规则"
# EIP-8355 建议 payload:
# [0..1952]: pk | [1952..5261]: sig | [5261..5293]: msg
# 返回: 32 bytes (0x00...01 成功 / 0x00...00 失败)
```

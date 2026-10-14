---
template: research
title: Starknet 账户模型、后量子迁移与 STRK20 / Shadow Account
subtitle: Starknet 的 PQ 底气来自两项结构设计：基于 hash 的 STARK 证明层，和协议不规定签名算法的原生账户。但截至 2026-10-14，主网只有证明层和两个 hash 迁出了椭圆曲线；“2027 年成为完全抗量子的 L1”还只是一个没有范围定义的考虑方向。STRK20 与 Shadow Account 的保密性建立在 Stark 曲线 ECDH 上，不继承证明层的 PQ 属性。
cols: 4
type: 技术调研 · dev onboarding
audience: Mantle Engineering 的研究员和开发者：懂 EVM、AA 和 rollup，不熟悉 Cairo / Starknet，也不熟悉 PQ 密码学
scope: Starknet 原生账户与 EVM 账户模型对照；组件级密码学清单与 PQ 状态；Falcon-512 账户；三阶段 PQ 路线图、L1 转型与 Ethereum 2029 对照；STRK20 隐私协议；Shadow Account
evidence: 299 条论断台账（observed 254 / inferred 34 / speculative 11）；源码 sequencer @54f97a8a、starknet-privacy @f9256c5e、starkware-starknet-utils @3e2fd53d、OZ cairo-contracts @5cf9010e、OZ cairo-pq-verifiers @bece5c07；Starknet 主网 RPC；Quantum Hub、官方博客与文档；访问于 2026-10-14
date: 2026-10-14 · v1
---
结论先行：Starknet 协议不规定签名算法，账户合约自己决定接受什么签名，所以换成 PQ 签名不需要硬分叉（[F1](#F1)）。证明层用 hash-based STARK，也不依赖椭圆曲线；这两点是它“比 Ethereum 快”的真实基础。但截至主网 v0.14.4，状态树、合约地址、默认账户签名、共识和 DA 都还没有 PQ 化（[F4](#F4)）。

“2027 PQ L1”只是 2026-10-08 两条推文里的考虑方向，没有范围定义和规范（[F6](#F6)、[F8](#F8)）。STRK20 和 Shadow Account 的保密性用的是 Stark 曲线 ECDH，viewing 公钥明文上链；一旦量子计算可行，用户的私有历史和 Shadow 关联可以被事后复原（[F11](#F11)、[F14](#F14)）。

## A 三件事，三层东西 {sheet meta="layers"}
```tree list
Starknet 原生账户 | 协议只调入口，签名算法由合约定
  默认签名 | Stark 曲线 ECDSA（非 PQ）
  Falcon-512 账户 | 主网演示 1 笔，实验性、未审计
PQ 迁移 | 三阶段路线图，L2 框架内
  已上线 | 证明层 + OS hash + class hash
  未上线 | 状态树、地址、共识、DA、桥
STRK20 隐私池 | 合约级 note / nullifier
  Shadow Account | 无密钥代理合约，隐藏与主钱包的关联
  加密层 | Stark 曲线 ECDH（非 PQ）
```

## B 关键数字 {sheet span=2 meta="2026-10-14"}
| 量 | 值 |
|---|---|
| 主网版本 | v0.14.4 |
| 账户验证上限 | 1,000,000 steps / 1 亿 L2 gas |
| Falcon（标准 SHAKE）验证资源 | 6,188 万 L2 gas，约 ECDSA 的 385 倍 |
| 主网 Falcon 演示交易 | 6,393 万 L2 gas，约 1.926 STRK |
| 路线图 Phase 1 | 3 项中 1 项上线 |
| STRK20 池费 | 2.5 STRK / 次 `apply_actions` |
| 已部署 Shadow Account | 173 个 |

## C 组件 PQ 状态 {sheet meta="v0.14.4"}
| 组件 | 现状 |
|---|---|
| 证明层 STARK | ok hash-based |
| OS / class hash | ok BLAKE2s |
| 状态树、地址 | no Pedersen |
| 默认账户签名 | no Stark-ECDSA |
| 共识投票 | no 尚无签名 |
| DA、L1 桥 | warn 等 Ethereum |
| STRK20 加密 | no ECDH |

## D 2027 vs 2029 不是同一口径 {sheet span=2 meta="scope"}
| 维度 | Starknet 2027 | Ethereum 2029-12 |
|---|---|---|
| 表述 | “actively considering … target” | EF Protocol 目标 |
| 范围 | 未定义 | 执行、共识、数据三层 |
| 路径 | 无 L1 规范 | 分叉序列 + MV-PQ 备用 |
| 共识 PQ | 投票签名还是 TODO | 需要 PQ attestations |

## E 时间线 {sheet span=2 meta="2025–2026"}
```timeline
2025-09 | v0.14.0 | 3 个 sequencer 跑 Tendermint
2026-04 | v0.14.2 | proof facts 字段；STRK20 池部署
2026-06-30 | PQ 三阶段路线图 | Phase 1 估计“约两个月”
*2026-07-08 | v0.14.3 | OS hash 改用 BLAKE2s
2026-07-22 | Falcon 主网转账 | 0.01 STRK，实验性
2026-09-07 | 首个 Shadow Account | 同日 EF 发 2029 目标
*2026-10-08 | “考虑成为 L1” | 目标 2027
```

## F 结论 {sheet span=4}
```callout ok 底气是真的，但“2027 完全抗量子”还没有可检验的范围
- 账户：协议不规定签名算法，换 PQ 不需要硬分叉；但已有账户不会自动迁移，升级授权本身仍靠 ECDSA（F1、F3）。
- 密码学：只有证明层和两个 hash 迁出了椭圆曲线；Falcon 能跑，但验证资源约是 ECDSA 的 385 倍，且未审计（F4、F5）。
- L1：官方只说“正在考虑”；共识、DA、桥、旧状态迁移都没有方案（F6、F7、F8）。
- 隐私：STRK20 只对链上旁观者保密；加密层是 ECDH，一把 viewing 私钥串起全部私有历史与 Shadow 关联（F10、F11、F14）。
- 从哪里开始读：账户看面板 J，PQ 看 K–M，隐私看 N–P，验收标准看 Q。
```

## G 如何阅读 {depth=1}
```callout info 默认你已知道（本文不解释）
- EVM 账户：EOA 用 secp256k1 ECDSA 签名，协议用 `ecrecover` 恢复地址
- ERC-4337 与 EIP-7702 的基本结构：UserOperation、bundler、EntryPoint、委托代码
- rollup 的基本结构：sequencer 排序，状态由证明在 L1 验证，数据发到 L1
- 哈希函数、数字签名、Merkle 树的基本概念
- 零知识证明“证明一段计算按规则执行”的基本概念
```
- **5 分钟**：只看导语和总览 A–F。
- **30 分钟**：再读 [前置知识](#panel-I)、[账户模型](#panel-J)、[密码学清单](#panel-K)、[Falcon-512](#panel-L)、[路线图与 L1](#panel-M)、[STRK20](#panel-N)、[Shadow Account](#panel-O)、[PQ × 隐私交叉风险](#panel-P) 和 [验收清单](#panel-Q)。
- **要复核的开发者**：再读 [方法与证据](#panel-S) 和 [复现](#panel-T)，命令可以直接运行。

**贯穿全文的例子**：Alice 有一个 OpenZeppelin（OZ）默认账户，用 Stark 曲线 ECDSA 签名。她先把 100 USDC 存进 STRK20 隐私池，再私下转一部分给 Bob，最后通过一个 Shadow Account 把剩下的钱存进 Vesu 金库。账户、PQ、隐私各面板都用 Alice 展开。

## H 背景动机 {depth=2}
**问题**：2026-10-08，@Starknet 发推：“We are actively considering becoming an L1. This would enable Starknet to become the first fully quantum-resistant network, with 2027 as our target.”[13] Ethereum Foundation（EF）Protocol 的目标是 2029 年 12 月 [15]。同一时期，StarkWare 在推广 STRK20 的 Shadow Account。我们想知道两件事：Starknet 凭什么觉得 2027 年就能成为 PQ L1；它的隐私协议和 Shadow Account 怎么工作。

**为什么现在**：Mantle 的研究要求所有输出都经过确定性验证。Starknet 的账户与 PQ 叙事近期被频繁引用，需要逐组件核对：哪些已上主网，哪些只在路线图上。

**范围**：
- Starknet 原生账户与 EVM 账户模型（EOA、ERC-4337、EIP-7702、Native AA 提案）的区别
- 组件级的密码学清单、PQ 状态和 Falcon-512 账户
- “2027 PQ L1”：官方表述、三阶段路线图进度、转 L1 缺口、与 Ethereum 2029 对照
- STRK20 隐私协议与 Shadow Account 的原理和隐私边界

**非目标**：投资建议与 STRK 价格；完整安全审计；Cairo / Lean 测试的本地复跑（本机没有 scarb / snforge）；密码学方案本身的安全性证明。

**已有资料的不足**：外部调研（ChatGPT Deep Research）的框架正确 [26]。但它有几处要修正：Falcon 成本表漏了一行，口径是资源量不是收费；把两个同名 s2morrow 仓库混为一谈；note / nullifier / identity 公式漏了 domain tag；没确认证明服务能拿到 viewing key。本文用源码、主网 RPC 和官方文档逐条核对（见 [面板 S](#panel-S)）。

## I 前置知识 {depth=2}
```excalidraw q="读懂这篇报告要先懂哪些概念？按什么顺序？" read="灰色虚线框是默认已知；蓝框是卡片；绿框是本文主题。箭头表示先学 → 后学。" takeaway="B-0 讲账户，B-1 到 B-3 讲 PQ，B-4、B-5 讲隐私；三条线在“Starknet 的 PQ 与隐私”处汇合。" name=prereq-map kind=前置知识地图
{"grid": {"w": 290, "h": 110}, "defaults": {"w": 220, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "aa", "label": "4337 / 7702（已知）", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "zk", "label": "ZK 证明（已知）", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "hs", "label": "哈希与签名（已知）", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 原生账户", "col": 1, "row": 0, "color": "blue"},
   {"id": "b1", "label": "B-1 量子威胁", "col": 1, "row": 2, "color": "blue"},
   {"id": "b2", "label": "B-2 证明 ≠ 签名", "col": 1, "row": 1, "color": "blue"},
   {"id": "b3", "label": "B-3 三种 hash", "col": 2, "row": 2, "color": "blue"},
   {"id": "b4", "label": "B-4 note 与 nullifier", "col": 2, "row": 1, "color": "blue"},
   {"id": "b5", "label": "B-5 ECDH 与 viewing key", "col": 2, "row": 0, "color": "blue"},
   {"id": "top", "label": "Starknet 的 PQ 与隐私", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "aa", "to": "b0"}, {"from": "zk", "to": "b2"}, {"from": "hs", "to": "b1"},
   {"from": "b1", "to": "b2"}, {"from": "b1", "to": "b3"}, {"from": "b1", "to": "b5"},
   {"from": "b2", "to": "b4"}, {"from": "b0", "to": "top"}, {"from": "b3", "to": "top"},
   {"from": "b4", "to": "top"}, {"from": "b5", "to": "top"}
 ]}
```

```prereq B-0 l1 4min
# Starknet 原生账户（native account）
是什么: Starknet 没有 EOA，每个账户都是合约。协议按交易类型调用账户的 `__validate__`，要求它返回 `'VALID'`，再调用 `__execute__` 执行调用列表 [1][2]。
为什么需要: 签名算法写在账户合约里，不写在协议里。这就是“换 PQ 签名不需要硬分叉”的来源。
例子:
~~~
INVOKE v3 → account.__validate__(calls)   // 验签，返回 'VALID'
          → account.__execute__(calls)    // 逐个调用目标合约
~~~
误解: 误解：Starknet 账户默认就抗量子。事实：OZ 默认账户和 Braavos 默认用 Stark 曲线 ECDSA；Argent（Ready）合约的五类 signer 里没有 PQ 类型 [4][5]。
深入: [2] docs.starknet.io “Accounts”
```

```prereq B-1 l1 4min
# 量子计算破坏什么：Shor 与 Grover
是什么: [[Shor 算法]]能在多项式时间内解椭圆曲线离散对数，所以 ECDSA、ECDH 和基于椭圆曲线的 [[Pedersen]] 都会失效。[[Grover 算法]]只给哈希搜索带来平方级加速，可以靠加大参数应对 [8]。
为什么需要: 判断一个组件是不是 PQ，就看它依赖离散对数还是只依赖哈希。
例子: 公钥 `x(k·G)` 已经上链 → 有量子计算机的攻击者解出 `k` → 伪造签名，或解密用 `k` 加密的数据。
误解: 误解：现在没有量子计算机，所以今天上链的数据安全。事实：密文和公钥会永久留在链上，可以“先收集、后解密”（[[HNDL]]）。
深入: [8] Quantum Hub “Learn”
```

```prereq B-2 l1 3min
# 证明正确执行 ≠ 签名抗量子
是什么: [[STARK]] 证明“这段程序按规则执行了”。如果程序里验的是 ECDSA 签名，攻击者用 Shor 伪造的签名同样会被“正确地”接受 [8]。
为什么需要: Starknet 的证明层抗量子，但这不能推出账户、地址或隐私加密抗量子。
例子: Quantum Hub 原文：“A post-quantum proving layer does not migrate account signatures by implication.”
误解: 误解：用了 STARK，整条链就抗量子。事实：官方对“Is Starknet quantum-resistant?”的回答是“No. Not as a single system-wide claim.”[8]
深入: [8] Quantum Hub “Learn”
依赖: B-1
```

```prereq B-3 l1 4min
# Pedersen、Poseidon、BLAKE2s
是什么: Starknet 用三种 hash。[[Pedersen]] 是 Stark 曲线点的线性组合，安全性依赖离散对数。[[Poseidon]] 是代数 hash（Hades 置换）。[[BLAKE2s]] 是传统位运算 hash [2]。
为什么需要: 路线图的 Phase 1 就是把 Pedersen 换成 BLAKE2。哪些位置还在用 Pedersen，决定了还剩多少迁移工作。
例子: 合约地址 = `Pedersen("STARKNET_CONTRACT_ADDRESS", deployer, salt, class_hash, Pedersen(calldata))`，到 2026-10-13 仍是这样 [1]。
误解: 误解：Pedersen 叫 hash，所以和 BLAKE2 一样安全。事实：StarkWare 自己说它“inherits elliptic-curve assumptions”[9]。
深入: [2] docs.starknet.io “Cryptography”
依赖: B-1
```

```prereq B-4 l1 5min
# note 与 nullifier：隐私池怎么防双花
是什么: [[隐私池]]里的余额不是 `balances[user]`，而是一组 [[note]]。花掉一个 note 时，链上写入它的 [[nullifier]]；同一个 nullifier 只能写一次 [16]。
为什么需要: STRK20 就是这种隐私池。nullifier 由私钥派生，旁观者无法把它和被花的 note 对上。
例子:
~~~
note_id   = Poseidon(NOTE_ID_TAG, channel_key, token, index, 0)
nullifier = Poseidon(NULLIFIER_TAG, channel_key, token, index, 0, k)
~~~
误解: 误解：STRK20 把 Starknet 变成了 UTXO 链。事实：note 只存在于一个合约的存储里，链本身仍是账户模型 [16]。
深入: [18] docs.starknet.io “Notes and nullifiers”
依赖: B-2
```

```prereq B-5 l1 4min
# ECDH 与 viewing key
是什么: [[ECDH]] 让双方用椭圆曲线算出同一个共享密钥。STRK20 用它把通道信息加密给收款方，把用户的 [[viewing key]] 加密给 [[auditor]] [16]。
为什么需要: STRK20 的保密性全部建立在 ECDH 上，所以它的 PQ 状态和证明层不同。
例子: `R = r·G`，`共享 = x(r·K) = x(k·R)`，密文 = `Poseidon(tag, 共享) + 明文` [16]。
误解: 误解：viewing key 只能“看”。事实：STRK20 的 viewing 私钥还参与 nullifier 和 Shadow 身份派生，泄露它会暴露整段私有历史 [16]。
深入: [18] docs.starknet.io “Encryption and keys”
依赖: B-1
```

## J 账户模型：协议只调入口，签名由合约定 {depth=2}
Fig 2 是 Alice 发一笔普通转账时，协议和账户之间的调用顺序。协议做三件事：按交易类型选入口，以 caller = 0 调用，检查返回值是否为 `'VALID'` [1]。签名用什么算法、怎么验，全由 Alice 的账户合约决定。

```uml q="Alice 发一笔 INVOKE v3 交易时，谁在什么时候调用她的账户？哪一步决定签名是否有效？" read="高亮部分是验证阶段，受资源与 syscall 限制。第 5 步失败：交易不上链、不收费；第 7 步失败：交易 REVERTED，照样收费，nonce 照样加 1。" takeaway="协议只认“账户返回了 VALID”；签名算法完全在账户合约里。"
sequenceDiagram
  autonumber
  participant W as Alice 钱包
  participant G as Gateway / mempool
  participant S as Sequencer（blockifier）
  participant A as Alice 账户合约
  participant T as 目标合约
  W->>G: 签名后的 INVOKE v3
  G->>G: 无状态检查（paymaster_data 必须为空）
  G->>S: nonce 在 [当前, 当前+200] 内即排队
  S->>S: nonce 必须严格等于当前值
  rect rgb(234, 241, 251)
    S->>A: __validate__(calls)，caller = 0
    A-->>S: 'VALID'
  end
  S->>A: __execute__(calls)，caller = 0
  A->>T: call_contract（逐个）
  S->>S: 从 Alice 扣 STRK 手续费，nonce + 1
```

**验证阶段的限制。** 在主网 v0.14.4 上，`__validate__` 最多用 1,000,000 Cairo steps 和 1 亿 L2 gas [1]。它不能调用其他合约，不能 `deploy`，读到的区块号向下取整到 100 的倍数，时间戳向下取整到整点 [1]。官方给出的理由是防止“验证很重、最后失败”的免费 DoS 和 mempool 污染 [2]。

```limits
验证阶段 Cairo steps | 1000000 | steps
验证阶段 L2 gas | 100000000 | gas
mempool nonce 超前 | 200 | 笔
```

**OZ 默认账户的实现**（`packages/account/src/account.cairo#L71-87,#L342-348@5cf9010e` [4]）。`__execute__` 自己再断言一次 caller = 0；`__validate__` 用 Stark 曲线 ECDSA 验交易 hash：

```cairo title="OZ AccountComponent（节选）· cairo-contracts@5cf9010e"
fn __execute__(self: @ComponentState<TContractState>, calls: Array<Call>) {
    let sender = starknet::get_caller_address();
    assert(sender.is_zero(), Errors::INVALID_CALLER);
    assert(is_tx_version_valid(), Errors::INVALID_TX_VERSION);
    for call in calls.span() { execute_single_call(call); }
}
fn validate_transaction(self: @ComponentState<TContractState>) -> felt252 {
    let tx_info = starknet::get_tx_info().unbox();
    assert(
        self._is_valid_signature(tx_info.transaction_hash, tx_info.signature),
        Errors::INVALID_SIGNATURE,
    ); // -> core::ecdsa::check_ecdsa_signature（Stark 曲线）
    starknet::VALIDATED
}
```

```finding F1 high
# Starknet 协议不规定签名算法：账户合约决定接受什么签名
claim: 协议按交易类型以 caller = 0 调用 `__validate__` / `__validate_declare__` / `__validate_deploy__`，返回值必须是 `'VALID'`；验证阶段上限为 1,000,000 steps / 1 亿 L2 gas，并禁止外部调用。账户还能用 `replace_class_syscall` 原地换 class，地址和存储不变。
evidence: [observed] blockifier `account_transaction.rs`、versioned constants、syscall 限制 [1]（A1–A13）；OZ / Argent / Braavos 升级实现 [4][5]（A30–A33）。
implication: 换成 PQ 签名不需要硬分叉，只需要新账户 class，或已有账户升级 class。
```

**与 EVM 对照。** 下表的口径是截至 2026-10-14 的规范或主网状态 [6]。差别不在“能不能写 PQ 验证逻辑”，而在“协议有没有一把固定的根密钥”。

| 维度 | EOA | ERC-4337 | EIP-7702 | Starknet |
|---|---|---|---|---|
| 谁定义授权 | 协议 secp256k1 | 账户 `validateUserOp` | 协议 `ecrecover` + 委托代码 | 账户 `__validate__` |
| 协议根密钥 | no 有 | ok 无 | no 有，原私钥一直有效 | ok 无 |
| 入口 | 原生交易 | UserOp → bundler → EntryPoint | type-4 交易 | 原生 INVOKE v3 |
| nonce | 顺序 | 192 位 key + 64 位序号 | 顺序 | 顺序（mempool 可超前 200） |
| 代付 | 无 | paymaster | 借助 4337 | warn 原生字段被拒收，走 SNIP-9 + SNIP-29 |
| 换签名算法 | 硬分叉 | 新账户或升级代理 | 无法去掉 ECDSA 根密钥 | 新账户或 `replace_class` |

以太坊侧的 Native AA 提案：EIP-7701 已撤回，RIP-7560、EIP-8141 都是 Draft。EIP-8141 以 PQ 迁移为首要动机，但没有代码的账户仍按 secp256k1 验证 [6]。

```finding F2 high
# 与 EVM 的真正差别是“没有协议根密钥”，不是“能不能写 PQ 验证”
claim: EOA 和 7702 账户的根密钥由协议固定为 secp256k1；7702 委托后，原私钥仍能直接发交易、重新委托。4337 也能写 PQ 验证，而且它的 nonce（192 位 key）比 Starknet 更灵活。Starknet 的原生 paymaster 字段目前被 gateway 拒收。
evidence: [observed] EIP-7702 第 3、5、8 步与“Transaction origination”[6]（A53–A55）；ERC-4337 `getNonce(address, uint192 key)`[6]（A57）；gateway `validate_empty_paymaster_data`[1]（A20）。[inferred] 7702 委托 PQ 代码不能消除原私钥的量子风险（A56）。
implication: 评估 PQ 迁移时，要问“协议是否强制保留一把 ECDSA 根密钥”，而不只问“合约能不能验 PQ 签名”。
```

```finding F3 high
# 已有账户不会自动变成 PQ；升级授权本身仍依赖旧 ECDSA
claim: OZ、Argent、Braavos 账户都能自调用 `replace_class` 换成 PQ class，但这次升级必须先通过旧 ECDSA 的 `__validate__`。三家都没有公开迁移流程。主网 Falcon 演示账户是新部署账户（nonce = 1），不是升级而来。
evidence: [observed] Quantum Hub “Existing accounts do not change automatically”[7]（A49）；升级守卫 [4][5]（A30–A33）；RPC 读到演示交易 nonce = 0x1 [11]（A46）。[inferred] 升级依赖旧签名（A50）；演示账户为新部署（A48）。
implication: 已有账户必须在量子威胁到来之前完成升级；guardian、session、`is_valid_signature` 这些旧签名路径也要一起移除（见 [F15](#F15)）。
```

## K 密码学清单：哪些已经迁出椭圆曲线 {depth=2}
Fig 3 把 Starknet 主网 v0.14.4 的每个组件按 PQ 状态着色。绿色已不依赖椭圆曲线，红色仍依赖，黄色是未评级或只有演示，灰色虚线是 Ethereum 侧的外部依赖 [7][1]。

```excalidraw q="截至主网 v0.14.4，Starknet 的哪些组件已经不依赖椭圆曲线？" read="从上到下：证明层 → 协议承诺 → 账户 → 共识 → Ethereum 侧。绿 = 已迁出或结构上不依赖 EC；红 = 仍依赖 EC；黄 = 未评级或仅演示；灰色虚线 = 外部依赖。" takeaway="已迁出的只有证明层和两个 hash；状态树、地址、默认签名和共识都还是红色。" kind=分层清单
{"grid": {"w": 600, "h": 74}, "defaults": {"w": 560, "h": 56, "fontSize": 16},
 "nodes": [
   {"id": "p", "label": "证明层：STARK / S-two（hash-based）", "col": 0, "row": 0, "color": "green"},
   {"id": "os", "label": "OS program / config hash：BLAKE2s（v0.14.3）", "col": 0, "row": 1, "color": "green"},
   {"id": "cc", "label": "compiled class hash：BLAKE2s（v0.14.1）", "col": 0, "row": 2, "color": "green"},
   {"id": "po", "label": "外层状态承诺、class 树、v3 交易 hash：Poseidon", "col": 0, "row": 3, "color": "yellow"},
   {"id": "tr", "label": "合约树 / 存储树、合约地址、Map 槽：Pedersen", "col": 0, "row": 4, "color": "red", "strokeWidth": 3},
   {"id": "ac", "label": "默认账户签名：Stark-ECDSA / secp256k1 / r1", "col": 0, "row": 5, "color": "red"},
   {"id": "fa", "label": "Falcon-512 账户：主网演示 1 笔，未审计", "col": 0, "row": 6, "color": "yellow"},
   {"id": "co", "label": "共识：3 个 sequencer，投票签名尚未实现", "col": 0, "row": 7, "color": "red"},
   {"id": "eth", "label": "Ethereum 侧：blob / KZG、L1 桥与消息", "col": 0, "row": 8, "color": "gray", "stroke": "dashed"}
 ],
 "edges": []}
```

源码能直接看到两处切换点。OS config hash 从 v0.14.3 起换成 Blake；合约地址派生仍是 Pedersen（`starknet_api/src/core.rs@54f97a8a` [1]）：

```rust title="sequencer/crates/starknet_api/src/core.rs（节选）· @54f97a8a"
/// The first Starknet version at which the OS config hash is computed
/// with Blake (V4) instead of Pedersen (V3).
const OS_CONFIG_HASH_V4_CUTOVER: StarknetVersion = StarknetVersion::V0_14_3;

pub fn calculate_contract_address(/* salt, class_hash, calldata, deployer */) -> .. {
    let constructor_calldata_hash = Pedersen::hash_array(&constructor_calldata.0);
    let address = Pedersen::hash_array(&[
        prefix /* "STARKNET_CONTRACT_ADDRESS" */, deployer, salt, class_hash,
        constructor_calldata_hash,
    ]);
```

```finding F4 high
# 截至 v0.14.4，只有证明层和两个 hash 迁出了椭圆曲线
claim: OS program / config hash（v0.14.3，2026-07-08 上主网）和 compiled class hash（v0.14.1）已改用 BLAKE2s。合约树 / 存储树、合约地址派生、Map 存储槽仍用 Pedersen；默认账户签名仍是 Stark-ECDSA；DA 走 Ethereum blob（KZG）。
evidence: [observed] Migration Register R4–R8（最后更新 2026-08-19）[7]（C2、C14–C17、C22）；sequencer 源码 [1]（C16、C21、C25、R24）；主网 `l1_da_mode = BLOB`[11]（C31）；官方回答“No. Not as a single system-wide claim.”[8]（C1）。
implication: “Starknet 抗量子”只能按组件说。今天能成立的只有证明层，以及 OS hash、class hash 这两项。
```

Poseidon 的 PQ 状态官方没有单独评级，路线图选的是 BLAKE2 而不是 Poseidon [9]。“Poseidon 与 BLAKE2 抗量子强度相当”是未验证的判断（C63，[speculative]）。

## L Falcon-512 账户：能跑，但贵且未审计 {depth=2}
**算法。** [[Falcon-512]] 是基于格的签名。验证在环 $\mathbb{Z}_{12289}[x]/(x^{512}+1)$ 上进行 [10]：

$$
c = \mathrm{HashToPoint}(m,\ salt),\qquad s_0 = c - s_1 h \pmod q,\qquad \|s_0\|^2 + \|s_1\|^2 \le 34{,}034{,}726
$$

$h$ 是公钥，$s_1$ 是签名。Falcon-512 公钥 897 字节、签名 666 字节 [10]。在 Cairo 里，公钥打包成 29 个 felt，direct 签名 31 个 felt [10]。

**变体。** OZ `cairo-pq-verifiers` 实现了 5 个变体：hint 模式配 BLAKE2s、Poseidon 或 SHAKE-256 三种 [[hash-to-point]]，direct 模式配 BLAKE2s 或 SHAKE-256 [10]。只有 SHAKE-256 与标准签名器互通。hint 由签名者附带 $s_1 h$，链上只检查；direct 由链上自己算。两者安全性相同 [10]。

| 变体（hash-to-point · 模式） | 标准 | validate L2 gas | / ECDSA |
|---|---|---|---|
| Stark-ECDSA（对照） | — | 160,795 | 1× |
| Poseidon · hint | no | 13,615,909 | 85× |
| BLAKE2s · hint | no | 14,380,100 | 89× |
| BLAKE2s · direct | no | 24,525,310 | 153× |
| SHAKE-256 · hint | ok | 51,733,728 | 322× |
| SHAKE-256 · direct | ok | 61,878,938 | 385× |

表中数字来自 `efficiency_baseline.json`，口径是“测试减基线”的资源量，不是用户付的费用 [10]。仓库说明实际收费约为资源量的 1.7–2.7 倍 [10]。

```limits
SHAKE-256 · direct 验证 | 61878938 / 100000000 | L2 gas | 占上限 62%
SHAKE-256 · direct 验证 | 427598 / 1000000 | steps
```

```cairo title="OZ Falcon512ShakeDirectVerifier（节选）· cairo-pq-verifiers@bece5c07 crates/falcon_512/src/lib.cairo#L161-181"
fn verify(message_hash: felt252, public_key: Span<felt252>, signature: Span<felt252>) -> bool {
    if public_key.len() != PUBKEY_FELTS || signature.len() != SIG_FELTS_DIRECT { return false; }
    let h_ntt = match packing::unpack_512_u16(public_key) { Some(v) => v, None => { return false; } };
    let s1 = match packing::unpack_512_u16(signature.slice(0, 29)) { Some(v) => v, None => { return false; } };
    let msg_point = match hash_to_point::hash_to_point_shake_512(
        message_hash, *signature.at(29), *signature.at(30),
    ) { Some(v) => v, None => { return false; } };
    falcon::verify_512_direct_u16(s1.span(), h_ntt.span(), msg_point.span())
}
```

**主网记录。** 交易 `0x72ae4404…0a4b3` 在区块 12,156,522（2026-07-22 10:46:25 UTC，v0.14.3）成功执行，内容是转账 0.01 STRK [11]。receipt 显示 63,932,548 L2 gas、费用约 1.926 STRK [11]。签名长度 31 felt，与 SHAKE-direct 编码一致 [11]。

```finding F5 high
# Falcon-512 账户在资源上可行，但成本、标准化和审计都没到位
claim: 5 个 Falcon 变体的验证都在 1M steps / 1 亿 gas 上限内；标准 SHAKE-direct 的验证资源约为 Stark-ECDSA 的 385 倍。仓库标注“Experimental and unaudited”；OZ cairo-contracts 的 Falcon 账户仍在 CHANGELOG 的 “Unreleased” 段；NIST FIPS 206 仍是 “in development”。
evidence: [observed] efficiency_baseline.json 与 README [10]（C38–C44、C46–C50）；CHANGELOG [4]（C51）；主网交易 [11]（C53–C55）；NIST CSRC [12]（C59）。[inferred] 385 倍 = 61,878,938 / 160,795（C45）。
implication: PQ 账户已走出纯研究阶段，但还不是可以默认推给用户的生产方案。选 Poseidon 或 BLAKE2s 变体会省 4–7 倍资源，代价是不兼容标准签名器。
```

两点没有核实：主网 receipt（6,393 万 L2 gas）与 devnet 上同一变体（约 1.399 亿）为什么差这么多；演示账户的 class 是否等于这个 commit 的构建产物（见 [面板 R](#panel-R)）。另外，s2morrow 有两个同名仓库：feltroidprime/s2morrow 是 Starknet 账户（Poseidon hash-to-point），starkware-bitcoin/s2morrow 是面向 Bitcoin 的签名聚合研究，没有账户合约 [24]。

## M 路线图与 L1：“2027”说的是什么 {depth=2}
**官方表述。** 2026-10-08，Eli Ben-Sasson 发了 8 条推文。关键一条原文是：“We’re considering multiple options, including becoming an L1 … Ethereum is targeting full L1 quantum resistance by the end of 2029 … Starknet could get there by 2027.”[13] @Starknet 随后发推：“We are actively considering becoming an L1 … with 2027 as our target.”[13] 截至 2026-10-14，SNIP 仓库、社区论坛和 Snapshot 都没有相关提案或投票 [3][13]。

```finding F6 high
# “2027 PQ L1”是考虑中的目标，没有范围定义、规范或治理流程
claim: 官方措辞是 “actively considering” 和 “target”；CEO 原话把 L1 列为 “multiple options” 之一。没有 SNIP、论坛提案、投票或博客专文；“fully quantum-resistant”覆盖哪些组件也没有定义。
evidence: [observed] @Starknet 与 @EliBenSasson 原帖（经 fxtwitter API 读取）[13]（R1–R7）；SNIPs HEAD、论坛与 Snapshot 查询（R8–R10、R12）。[inferred] 定性为“考虑中，未决定”（R11）。
implication: 引用时写“Starknet 正在考虑成为 L1，目标 2027”，不要写“Starknet 将在 2027 年成为 PQ L1”。
```

**三阶段路线图（2026-06-30）。** 路线图本身仍在 L2 框架内 [9]。下表是每项的进度：

| 阶段 | 条目 | 官方估计 | 状态（2026-10-14） |
|---|---|---|---|
| P1 | OS program / config hash → BLAKE2s | 7 月初 | ok v0.14.3 主网 |
| P1 | 合约树 / 存储树 → BLAKE2 | 约两个月 | no 源码仍是 Pedersen |
| P1 | 合约地址派生 → BLAKE2 | 约两个月 | no 源码仍是 Pedersen |
| P1 附 | PQ 共识签名（“such as Falcon-512”） | 无日期 | no 投票签名尚未实现 |
| P2 | 旧合约存储迁移工具 | P1 后约一个月 | warn 研究中，无规范 |
| P3 | L1 桥 secp syscall、blob / KZG | 等 Ethereum | warn 外部依赖 |

**共识的现状。** v0.14.0 起，3 个 sequencer 用 Tendermint 达成共识；staking 文档写着 “Starknet is currently still centralized”[2]。sequencer 主干的共识代码里，投票还没有签名 [1]：

```rust title="sequencer/crates/apollo_consensus/src/state_machine.rs#L250-256 · @54f97a8a"
    height: self.height,
    round: self.round,
    proposal_commitment,
    voter: self.id,
    // TODO(Asmaa): sign the vote
    signature: RawSignature::default(),
};
```

```finding F7 medium
# Phase 1 已超出自己的估计；转 L1 要补齐的部分，官方都没有回应
claim: Phase 1 三项中只有 OS hash 上线；路线图发布已超过 3.5 个月，树和地址仍未迁移（官方估计“约两个月”）；2026-10-06 上线的 v0.14.4 也不含这两项。路线图里的 PQ 共识签名不是替换旧签名，而是在当前没有签名的投票上从零实现。转成 L1 还要自己提供 DA、结算、StarkGate 资产的处置和旧状态迁移。
evidence: [observed] 路线图原文 [9]（R13–R18）；v0.14.3 / v0.14.4 发布说明与 status 页 [14]（R19、R20、R25）；sequencer 源码 [1]（R23、R24、R34）；staking 文档 [2]（R32、R33）。[inferred] 进度落后（R26）；从零实现共识签名（R36）；L1 缺口（R37、R38）。[speculative] 2027 年交付独立 PQ 共识的进度风险大（R39）。
implication: 跟踪“2027”时，先看树和地址迁移进了哪个版本、共识签名的方案是什么，再看 L1 规范。
```

**Ethereum 的 2029。** EF Protocol 在 2026-09-07 写道：目标是到 2029 年 12 月，L1 在 execution、consensus、data 三层都抗量子；这个期限 “non-negotiable at least until January 2027”[15]。它还在 J* 设了一个 [[MV-PQ]] 备用里程碑：“designed to keep Ethereum operating through Q-day with reduced guarantees”[15]。相关 EIP（8141、7932、8051、7619、8365）都还是 Draft [15]。pq.ethereum.org 把完整 PQ 共识放在 “Longer term”，比 EF 博客更晚 [15]。

```finding F8 high
# 2027 与 2029 不是同一口径，日期差不能换算成“领先两年”
claim: Ethereum 的 2029-12 定义了三层范围、分叉路径和 MV-PQ 备用方案。Starknet 的 2027 没有范围定义，已上线的 PQ 部件只有证明层、两个 hash 和一笔实验性 Falcon 转账；共识、DA、桥都没有 PQ 方案。
evidence: [observed] EF Protocol 博客 [15]（R40–R45）；EIP 状态（R47）；Migration Register [7]。[inferred] 口径不同（R48、R49）。
implication: 对比两条链时，按组件逐项对比（账户、状态承诺、共识、DA、桥），不要对比两个年份。
```

StarkWare 自己做的 networks 对照页给 Starknet 8/8、Ethereum 3/8，但它声明不覆盖共识签名、桥和外部依赖 [8]。同一页还记载 Algorand 有 2027 年替换共识的目标；“first fully quantum-resistant network”这个说法可能有竞争者（R52，[speculative]）。

## N STRK20：合约级隐私池 {depth=2}
STRK20 是部署在 Starknet 上的一个隐私池合约（`0x0403…812a`），2026-04-20 随 v0.14.2 部署，2026-06-09 官方宣布上线 [16][23]。特别之处在 Fig 4 第 3–6 步。私有逻辑在 [[虚拟 OS]] 里执行并生成证明；证明由 sequencer 网关验证，链上合约只核对 [[proof facts]] [16][1]。

```uml q="Alice 私下转 USDC 给 Bob（第一次建通道）时，每一步在哪里执行、谁能看到什么？" read="第 3–4 步在链下的虚拟 Starknet OS 里，由证明服务执行。高亮的第 6–7 步是链上部分。简化：省略了 discovery 同步与费用细节。" takeaway="链上合约不重新执行私有逻辑，只核对证明产出的消息哈希；证明由 sequencer 网关验证，目前不结算到 Ethereum。"
sequenceDiagram
  autonumber
  participant A as Alice SDK
  participant P as 证明服务
  participant R as Relayer
  participant G as Sequencer 网关
  participant Pool as 隐私池合约
  A->>A: 组装私有动作：开通道、花 note、给 Bob 建新 note
  A->>P: 虚拟交易：calldata 含 Alice 地址、viewing key、动作；Alice 签名
  P->>P: 虚拟 OS 里运行 Pool.__execute__：编译动作、验 Alice 签名
  P-->>A: Stwo 证明 + proof facts + 公开动作
  A->>R: 交给 relayer
  rect rgb(234, 241, 251)
    R->>G: apply_actions(公开动作)，附证明
    G->>Pool: 网关验证 Stwo 证明后执行
    Pool->>Pool: 核对消息哈希与 450 块新鲜度，写 nullifier 与新 note
  end
```

**链上做什么。** `apply_actions` 依次执行：`validate_proof` → `collect_fee`（2.5 STRK）→ `_apply_actions` [16]。双花靠 nullifier 的 WriteOnce：写入前断言槽位为空 [16]。守恒靠逐 token 的临时余额，交易结束时必须归零 [16]。

```cairo title="starknet-privacy · packages/privacy/src/privacy.cairo#L827-842 · @f9256c5e"
assert(program_variant == VIRTUAL_SNOS, errors::INVALID_PROGRAM_VARIANT);
assert(starknet_os_output_version == VIRTUAL_SNOS0, errors::INVALID_OS_OUTPUT_VERSION);
let current_block_number = execution_info.block_info.block_number;
assert(base_block_number < current_block_number, errors::INVALID_BASE_BLOCK_NUMBER);
assert(
    current_block_number <= base_block_number + self.proof_validity_blocks.read(),
    errors::PROOF_EXPIRED,
);
let message_hash = compute_message_hash(:actions, :contract_address);
assert(message_to_l1_hashes == [message_hash].span(), errors::INVALID_PROOF_MSG);
```

```finding F9 high
# STRK20 是合约级隐私池；证明由 sequencer 网关验证，还没有结算到 Ethereum
claim: 私有动作在虚拟 OS 里由池合约自己的 `__execute__` 编译成公开动作；Stwo 证明由 sequencer 网关验证，合约只核对 proof facts 中的消息哈希和 450 块新鲜度。SNIP-36 写明 Phase 1 的证明只由 Starknet 共识验证。
evidence: [observed] privacy.cairo、actions.cairo [16]（S1–S7）；gateway.rs、account_transaction.rs [1]（S8–S10）；SNIP-36 [19]（S11）；`proof_fact_fold.rs` 仍用测试常量 [1]（S12）；池合约部署与参数 [11]（S52、S55）。
implication: STRK20 的状态正确性目前取决于 Starknet 共识（3 个 sequencer），而不是 Ethereum 上的证明验证。
```

**授权与合规。** 支出要 Alice 的账户签名，池合约接受三条路径中的任一条：custom 校验、`is_valid_signature(tx_hash)`、`is_valid_signature(SNIP-12 CallSet hash)` [16]。Alice 第一次使用时注册 viewing key：公钥 `x(k·G)` 明文写到链上，私钥 `k` 用 ECDH 加密给唯一的 auditor 公钥；两者都只能写一次 [16]。存款需要筛查方签名的 attestation，有效期 300 秒 [16]。

**对谁保密。** 下表按观察者分列 [18][16]：

| 观察者 | 能看到 | 看不到 |
|---|---|---|
| 链上旁观者 | 存款人、提现收款方、金额；新通道的收款方地址；时间 | 普通转账的金额、token、收发关系 |
| relayer / paymaster | 用户 IP、提交内容 | 私有动作明文 |
| 证明服务 | viewing key 与全部私有动作（完整见证） | — |
| discovery 服务 | viewing key、通道与 note 数量、同步时间 | 用 OHTTP relay 时看不到 IP |
| auditor | 解密 viewing key 后的完整历史 | 不能签名支出 |
| Bob（收款方） | 该通道的发送方与全部金额 | Alice 的其他通道 |

```finding F10 high
# STRK20 只对链上旁观者保密；证明服务和 discovery 服务能拿到 viewing key
claim: SDK 发给证明服务的虚拟交易 calldata 里包含 viewing key 和全部私有动作。OHTTP 只隐藏 IP、防止 TLS 终止方读取，挡不住服务运营者本身。存取款金额、新通道收款方是公开的；发送方只有走 paymaster 时才对外隐藏。
evidence: [observed] SDK `proof-invocation-factory.ts`[16]（S5）；discovery 安全规格 [16]（S31）；官方 security 页 [18]（S27–S29）；SNIP-36 “privacy is de facto”[19]（S33）。[inferred] 证明服务拿到完整见证（S30）。
implication: 评估 STRK20 的隐私时，要把证明服务和 discovery 服务的运营者算作可信方。
```

```finding F11 high
# STRK20 的加密层是 Stark 曲线 ECDH，不继承证明层的 PQ 属性
claim: 通道分发和 auditor 托管都用 Stark 曲线 ECDH 加 Poseidon 掩码，没有任何 PQ 密钥封装。viewing 公钥 `x(k·G)` 明文存在链上且不能更换。官方的 “Post-quantum” 表述只针对证明系统。
evidence: [observed] `utils.cairo` 的 `_compute_shared_x`、`encrypt_private_key`[16]（S23、S34、S35）；interactive 页 “No trusted setup. Post-quantum.”（S40）；搜索索引里 starknetprivacy.com 的旧摘要有 “quantum-resistant by design”，当天页面源码已没有（X4）。[inferred] 量子攻击者可从链上公钥恢复 k（S36）；auditor 公钥是全局单点（S38）。
implication: 不能用“Starknet 证明层抗量子”来描述 STRK20 的保密性。
```

```cairo title="starknet-privacy · packages/privacy/src/utils.cairo#L134-146 · @f9256c5e"
fn _compute_shared_x(ephemeral_secret: felt252, public_key: felt252) -> (felt252, felt252) {
    let ephemeral_pub_point = GEN_P().mul(scalar: ephemeral_secret);
    let ephemeral_pub_x = ephemeral_pub_point.try_into()
        .expect(internal_errors::ZERO_EPHEMERAL_PUBLIC).x();
    let public_point = EcPointTrait::new_from_x(x: public_key).expect(errors::INVALID_PUBLIC_KEY);
    let shared_point = public_point.mul(scalar: ephemeral_secret);
    let shared_x = shared_point.try_into().expect(internal_errors::ZERO_SHARED).x();
    (ephemeral_pub_x, shared_x)
}
```

**审计与形式化。** OpenZeppelin 审计了 commit c5e2fb5（2026-03-18～31，报告 2026-05-29），0 个 Critical / High [17]。审计范围只有 `packages/privacy/src` 的 9 个文件，不含 anonymizer 和 SDK [17]。Lean 形式化有 236 个定理，没有 `sorry`。它把 hash 设为单射、加密设为抽象可逆函数，所以不证明保密性或抗量子性 [16][20]。

StarkWare 原话：“We formally verified the protocol. The Cairo contract that implements it is covered separately by the OpenZeppelin audit.”[20]

## O Shadow Account：无密钥代理合约 {depth=2}
**是什么。** 官方文档原文：“A shadow account is a persistent, pseudonymous identity for one user and one dapp … A shadow account is not a wallet account: it has no keys and cannot sign.”[21] Fig 5 是从 Alice 签名到 Vesu 合约的授权链。

```excalidraw q="谁有权让 Alice 的 Shadow Account 调用 Vesu？每一跳检查什么？" read="从左上到右下读。蓝框是 STRK20 组件，绿框是 Shadow Account，灰色虚线是外部合约。边上写的是这一跳的检查条件。" takeaway="Shadow Account 只认 anonymizer；anonymizer 只认隐私池；隐私池只认证明。Alice 的签名在证明里验过一次，Shadow Account 本身没有密钥。"
{"grid": {"w": 440, "h": 150}, "defaults": {"w": 230, "h": 62, "fontSize": 16},
 "nodes": [
   {"id": "alice", "label": "Alice 主账户签名", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "proof", "label": "虚拟 OS 证明", "col": 1, "row": 0, "color": "blue"},
   {"id": "pool", "label": "隐私池 apply_actions", "col": 2, "row": 0, "color": "blue"},
   {"id": "anon", "label": "ShadowAccountAnonymizer", "col": 2, "row": 1, "color": "blue"},
   {"id": "shadow", "label": "Shadow Account", "col": 1, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "vesu", "label": "Vesu 金库", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"}
 ],
 "edges": [
   {"from": "alice", "to": "proof", "label": "验签"},
   {"from": "proof", "to": "pool", "label": "消息哈希"},
   {"from": "pool", "to": "anon", "label": "caller == 池"},
   {"from": "anon", "to": "shadow", "label": "caller == owner"},
   {"from": "shadow", "to": "vesu", "label": "任意 calls"}
 ]}
```

Shadow Account 合约很小：存储只有 `owner`（就是 anonymizer）和升级组件；唯一的业务入口 `execute` 只检查 caller 是否为 owner [22]。它没有 `__validate__`、`__execute__` 和 `is_valid_signature` [22][11]。

```cairo title="starkware-starknet-utils · packages/accounts/src/shadow_account.cairo（节选）· @3e2fd53d"
#[storage]
struct Storage {
    #[substorage(v0)]
    upgradable: EICUpgradableComponent::Storage,
    owner: ContractAddress,
}
fn execute(ref self: ContractState, calls: Array<Call>) -> Array<Span<felt252>> {
    self.assert_only_owner();      // get_caller_address() == owner（anonymizer）
    execute_calls(calls.span())
}
```

**地址派生。** salt 由三层 Poseidon 得到，地址再按 Pedersen 合约地址公式、用固定的 [[Primer]] class 计算 [16][22]：

$$
\begin{aligned}
\mathit{identity\_key} &= \mathrm{Poseidon}(\texttt{IDENTITY\_KEY\_TAG},\ \mathit{user},\ k,\ \mathit{anonymizer}) \\
\mathit{partial} &= \mathrm{Poseidon}(\mathit{identity\_key},\ \mathit{dapp\_name}) \\
\mathit{commitment} &= \mathrm{Poseidon}(\mathit{partial},\ \mathit{nonce}) \\
\mathit{address} &= \mathrm{Pedersen\_addr}(\mathit{salt}=\mathit{commitment},\ \texttt{PRIMER\_CLASS\_HASH},\ \mathit{deployer}=\mathit{anonymizer})
\end{aligned}
$$

这里的 $k$ 就是 Alice 的 STRK20 viewing 私钥 [16]。我们用主网事件复算：173 个 Shadow Account 中 172 个地址吻合；第一个（2026-09-07）在 Primer 方式引入之前部署，按运行时 class 计算 [11]。

**一次 Vesu 存款。** Fig 6 是 Alice 把私有 USDC 存进 Vesu 的完整过程。链上只有一笔交易：relayer 调用 `pool.apply_actions` [11][16]。

```uml q="Alice 通过 Shadow Account 把私有 USDC 存进 Vesu，链上发生了什么？哪些内容是公开的？" read="整个过程是一笔链上交易。第 3 步的金额和收款地址（Shadow 地址）是公开的；第 4 步只在第一次使用时发生。" takeaway="vault shares 留在 Shadow Account 上，公开可见；被隐藏的只是 Shadow Account 与 Alice 主钱包之间的关联。"
sequenceDiagram
  autonumber
  participant R as Relayer
  participant Pool as 隐私池
  participant N as Anonymizer
  participant SA as Shadow Account
  participant V as Vesu 金库
  R->>Pool: apply_actions（证明里已验 Alice 签名）
  Pool->>Pool: 验证 proof facts，扣 2.5 STRK 池费
  Pool->>SA: Withdraw：USDC 转到 Shadow 地址（公开）
  Pool->>N: privacy_invoke_with_computation(commitment, calls)
  N->>SA: 首次使用：部署 Primer → 换成 Shadow class → initialize
  N->>SA: execute([approve, deposit])
  SA->>V: approve + deposit
  V-->>SA: vault shares 留在 Shadow 上
  opt 需要收回输出
    N->>Pool: 余额转回池，存成 open note
  end
```

```finding F12 high
# Shadow Account 是由隐私证明授权、anonymizer 独占驱动的无密钥代理合约
claim: Shadow Account 只存 owner（anonymizer）和升级组件，业务入口 `execute` 只认 owner；anonymizer 只接受隐私池调用，对 calls 的目标和 selector 没有限制；隐私池只在证明有效时调用 anonymizer。主网上 anonymizer 可由治理零延迟升级。
evidence: [observed] shadow_account.cairo [22]（W12–W15）；shadow_account_anonymizer.cairo [16]（W17、W18、W22）；主网 ABI 与 owner 查询 [11]（W11、W14、W15）；授权链（W32–W35）。[inferred] `dapp_name` 是身份命名空间，不是调用权限（W19）；治理对全部 Shadow 资产有潜在控制力（W49）。
implication: “为某个 dapp 派生”不等于“只能调用这个 dapp”；权限约束要靠钱包，或额外的合约逻辑。
```

**像不像 private sub account？** 判断方向是对的：StarkWare 2026-07-15 的博客还把它叫 “private sub-accounts … Not live yet”；SDK 在 2026-08-12 的 RC.5 才改名为 Shadow Account [23][16]。但有几处关键差别：

| 维度 | 直觉中的 private sub account | 实际的 Shadow Account |
|---|---|---|
| 密钥 | 有自己的子私钥 | no 没有密钥，不能签名 |
| 谁发交易 | 子账户自己 | relayer 调隐私池，隐私池驱动 |
| 内容 | 余额与操作都私密 | no 余额、调用、仓位全部公开 |
| 隐藏什么 | 全部 | ok 只隐藏与主钱包的关联 |
| 粒度 | 任意 | 每个 (用户, anonymizer, dapp_name, nonce) 一个 |
| 是否协议账户 | 是 | no 不能发交易，不能 `is_valid_signature` |

```finding F13 high
# “像 private sub account”的判断成立，但它只隐藏关联，不隐藏内容
claim: Shadow Account 的余额、调用和仓位全部公开；任何人都能从 `ShadowAccountDeployed` 事件枚举全部 Shadow 地址。拿到 partial commitment 的 dapp 能枚举同一用户在该 dapp_name 下的全部 nonce。主网从 2026-09-07 起就有部署，截至 2026-10-14 共 173 个；没有找到 2026-10-13 的官方发布文。
evidence: [observed] 官方文档 “What is private”[21]（W2、W42）；事件与 `get_shadow_accounts`[16][11]（W43、W44）；改名记录 [23][16]（W4–W6）；主网事件统计 [11]（W7、W8）。[inferred] 与官方旧名一致（W47）；不能参与需要账户签名的协议（W48）。[speculative] “10-13 推出”找不到一手来源（W9）。
implication: Shadow Account 适合“仓位公开、身份分离”的场景，例如借贷、质押；它不是机密执行。
```

公开的 OZ 审计（2026-05-29）正文没有出现 shadow 或 anonymizer 字样 [17]；Shadow 相关合约目前没有公开审计覆盖。官方的 Vesu 金库演示放在个人账号 starkience 下，自述 “educational, not audited”[21]。

## P PQ × 隐私：一把私钥串起整段历史 {depth=2}
Fig 7 画的是 Alice 的 viewing 私钥 $k$ 参与了哪些派生。左边是链上公开的东西，右边是从 $k$ 能复原的东西。

```excalidraw q="如果 Alice 的 viewing 私钥被量子计算恢复，攻击者能复原什么？" read="红框是链上永久公开的数据；黄框是能被 Shor 解出的私钥；紫框是由私钥复原的私有信息。所有箭头都只需要链上公开值。" takeaway="一把不能更换的私钥同时决定 nullifier、通道和 Shadow 身份；它的公钥又明文上链，所以这是“先收集、后解密”的典型对象。"
{"grid": {"w": 480, "h": 120}, "defaults": {"w": 240, "h": 60, "fontSize": 16},
 "nodes": [
   {"id": "pk", "label": "链上 viewing 公钥 x(k·G)", "col": 0, "row": 0, "color": "red"},
   {"id": "aud", "label": "给 auditor 的 ECDH 密文", "col": 0, "row": 2, "color": "red"},
   {"id": "k", "label": "viewing 私钥 k（不可更换）", "col": 1, "row": 1, "color": "yellow", "strokeWidth": 3},
   {"id": "ch", "label": "通道与 note 金额", "col": 2, "row": 0, "color": "violet"},
   {"id": "nf", "label": "nullifier → 哪些已花", "col": 2, "row": 1, "color": "violet"},
   {"id": "sh", "label": "全部 Shadow 关联", "col": 2, "row": 2, "color": "violet"}
 ],
 "edges": [
   {"from": "pk", "to": "k", "label": "Shor"},
   {"from": "aud", "to": "k", "label": "破 auditor 钥", "dashed": true},
   {"from": "k", "to": "ch", "label": "ECDH 解密"},
   {"from": "k", "to": "nf", "label": "重算"},
   {"from": "k", "to": "sh", "label": "重算 commitment"}
 ]}
```

```finding F14 high
# 一把 viewing 私钥被恢复，就能事后复原用户的私有转账历史和全部 Shadow 关联
claim: nullifier、通道密钥和 Shadow 的 identity_key 都由同一个 k 派生；k 的公钥明文存在链上，且只能写一次、不能更换。dapp_name 是可枚举的短字符串，nonce 通常很小，链上又有全部 commitment 可供比对。auditor 公钥是全局单点：破解它就能解出所有注册用户的 k。
evidence: [observed] hashes.cairo、privacy.cairo、utils.cairo [16]（S13–S16、S23、W24、W30）；事件枚举（W43）。[inferred] 由派生关系推出复原路径（S36–S38、W46、X1）。
implication: STRK20 的 PQ 迁移不能只换新密钥。链上公钥和密文无法撤回，迁移前的历史仍然暴露。
```

```finding F15 medium
# 只把 `__validate__` 换成 PQ 签名，不能让账户的全部授权路径抗量子
claim: STRK20 的支出授权调用账户的 `is_valid_signature` 或 custom 校验，不调用 `__validate__`。账户还有 guardian、session key、SNIP-9 outside execution 等独立的签名路径。
evidence: [observed] `assert_valid_signature` 三条路径 [16]（S21）；SNIP-6、SNIP-9 [3]（A27、A29）；Argent guardian、Braavos 降级后的 Stark signer [5]（A42、A44）。[inferred] 任一路径保留 ECDSA，账户就仍有量子风险（A51、S22、X2）。
implication: PQ 账户的检查范围是整张授权图：交易入口、`is_valid_signature`、恢复、会话、升级。
```

## Q 验收清单：怎样判断“2027 PQ L1”是否兑现 {depth=2}
下面是我们建议的检查项，用来跟踪 Starknet 后续的公告。它们是建议，不是官方标准；每一项都对应前面的一个缺口。

1. 范围定义：官方是否给出“fully quantum-resistant”覆盖的组件清单（[F6](#F6)）。
2. Phase 1：合约树、存储树、地址派生的 BLAKE2 迁移进了哪个版本，哪天上主网（[F4](#F4)、[F7](#F7)）。
3. 旧状态：旧合约存储迁移工具是否有规范和实现（[F7](#F7)）。
4. 共识：投票签名用什么方案，是否直接上 PQ；验证者集合怎样去中心化（[F7](#F7)）。
5. L1 本身：DA、结算、最终性的规范；StarkGate 上存量资产的处置方案（[F7](#F7)、[F8](#F8)）。
6. 账户：主流钱包是否发布 PQ signer 和迁移流程；迁移是否同时移除旧签名路径（[F3](#F3)、[F15](#F15)）。
7. Falcon：是否有审计；FIPS 206 定稿后用哪个变体（[F5](#F5)）。
8. 隐私：STRK20 是否引入 PQ 密钥封装；历史密文怎么处理（[F11](#F11)、[F14](#F14)）。

```callout warn CAUTION
引用 Starknet 的 PQ 进展时，按组件写状态，并注明版本和日期。“Starknet 已抗量子”和“Starknet 将在 2027 年成为 PQ L1”这两种说法，目前都没有一手证据支持。
```

## R 局限与开放问题 {depth=2}
- **没有复跑**：本机没有 scarb / snforge，Falcon 成本取自仓库基准，没有本地复跑。
- **Falcon 成本差异**：主网 receipt（6,393 万 L2 gas）与 devnet 同一变体（约 1.399 亿）相差约一倍，原因未查明。演示账户的 class 也没能和构建产物比对（v0.14.4 下线了 feeder 的 `get_class_hash_at`）。
- **主网与源码是否一致**：隐私池、anonymizer 的链上 class 只核对了版本号 `'2.1'` 和 ABI，没有编译比对。sequencer 主干代码与主网实际运行的配置也可能不同（例如共识签名）。
- **审计覆盖**：审计 commit c5e2fb5 之后新增的代码（snip12 遗留签名路径、ComputeAndInvoke、anonymizer）没有公开审计。
- **证明参数**：主网区块证明的 S-two 用哪种 hash、多少安全位，以及私有交易证明何时进入 L1 结算，都没有找到一手证据。
- **未核实**：“S2morrow 2026-04-01 在主网投入生产”的原始出处（C62）；Ready App 默认 signer（A45）；共识认证密钥的曲线类型（R35）；钱包是否把 dapp_name 绑定到网站来源（W51）；“under ten cents”在 2.5 STRK 池费下的成立条件（S57）。
- **官方材料自身的矛盾**：谁生成证明（interactive 页、architecture 页、starkzap 三种说法）；筛查服务商（Elliptic 还是 FPI）；docs 的 Version Notes 只写到 v0.14.1。

## S 方法与证据 {depth=3}
**调研方法**：五路并行调研，每路只写一个分册，最后合并成一张台账。分册是账户（A）、密码学（C）、路线图（R）、STRK20（S）、Shadow（W），另加主会话的跨路综合（X）。所有论断都追到源码（固定 commit）、官方文档、官方博客或主网 RPC。外部调研（ChatGPT Deep Research）只作线索 [26]。

**固定版本**：

| 仓库 | commit | 用途 |
|---|---|---|
| starkware-libs/sequencer | 54f97a8a（2026-10-13） | 账户交易、验证限制、hash、共识、网关 |
| starkware-libs/starknet-privacy | f9256c5e（2026-09-28） | 隐私池、anonymizer、SDK、Lean |
| starkware-libs/starkware-starknet-utils | 3e2fd53d | Shadow Account、Primer |
| OpenZeppelin/cairo-contracts | 5cf9010e | 账户、Falcon 账户组件 |
| OpenZeppelin/cairo-pq-verifiers | bece5c07 | Falcon 验证器与基准 |

**主会话抽查**（2026-10-14）：Falcon 交易 receipt（区块、gas、费用）、验证上限常量、共识投票签名 TODO、Shadow Account 存储与入口、`_compute_shared_x`，5 条全部与台账一致。

**外部调研中被修正的地方**：
- Falcon 成本表漏了 BLAKE2s-direct 一行；口径是资源量，不是收费（C43–C48）。
- 把 starkware-bitcoin/s2morrow（Bitcoin 签名聚合）和 feltroidprime/s2morrow（Starknet 账户）混为一谈（C57、C58）。
- note / nullifier / identity 公式漏了 domain tag；“k_view”其实就是参与 nullifier 的那把私钥（S13–S16、W24、W30）。
- “未验证是否对证明方隐藏”：已确认不隐藏（S5、S30）。
- “可用 calldata 避开 KZG”：calldata 只用于极端情况，主网实测走 blob（C30、C31、R31）。
- “Vesu 演示是官方的”：实际是个人账号的教育示例（W10）。

## T 复现 {depth=3}
环境：任意能访问公网的机器，`curl` 与 `python3`。

1. 读 Falcon 演示交易的 receipt：

```bash title="主网 RPC · Falcon 交易"
curl -s -X POST https://starknet-rpc.publicnode.com \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"starknet_getTransactionReceipt",
       "params":["0x72ae4404b44ad78de65bdc460f8cc87fea4a15ce93e07a37c6a68e9adb0a4b3"]}'
# 预期：execution_status SUCCEEDED；execution_resources.l2_gas = 63932548
#       actual_fee.amount = 0x1aba6437b7129348（约 1.926 STRK）
```

2. 读当前主网版本：

```bash title="主网 RPC · 最新区块版本"
curl -s -X POST https://starknet-rpc.publicnode.com \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"starknet_getBlockWithTxHashes","params":["latest"]}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['starknet_version'])"
# 预期（2026-10-14）：0.14.4
```

3. 在源码里确认验证上限、地址派生与共识 TODO：

```bash title="sequencer @54f97a8a"
git clone --depth 1 https://github.com/starkware-libs/sequencer && cd sequencer
git fetch --depth 1 origin 54f97a8af3a712fb6c358e30f19e5a386cb7b4e3 && git checkout FETCH_HEAD
grep -n validate_max crates/blockifier/resources/blockifier_versioned_constants_0_14_4.json
grep -n "Pedersen::hash_array" crates/starknet_api/src/core.rs
grep -n "sign the vote" crates/apollo_consensus/src/state_machine.rs
# 预期：validate_max_n_steps 1000000、validate_max_sierra_gas 100000000；
#       calculate_contract_address 用 Pedersen；一行 TODO(Asmaa): sign the vote
```

4. 在隐私池源码里确认 ECDH：

```bash title="starknet-privacy @f9256c5e"
git clone https://github.com/starkware-libs/starknet-privacy && cd starknet-privacy
git checkout f9256c5e37682d37437e69a795ddd51d924c9b97
grep -n "_compute_shared_x\|GEN_P" packages/privacy/src/utils.cairo
# 预期：_compute_shared_x 在 Stark 曲线上做 r·G 与 r·K
```

## U 术语表 {depth=2}
```glossary
原生账户 | native account | 每个账户都是合约；协议调用它的 `__validate__` 与 `__execute__`，签名算法由合约决定。 | 不是 ERC-4337 那样在协议外的账户
Shor 算法 | Shor's algorithm | 量子算法，能在多项式时间内解离散对数与大数分解，破坏 ECDSA、ECDH、Pedersen。 | 不影响 hash 函数
Grover 算法 | Grover's algorithm | 量子搜索算法，对 hash 原像搜索有平方级加速，可用加大参数应对。 | 不是能破解 hash 的算法
HNDL | 先收集、后解密 | harvest now, decrypt later：今天记录密文与公钥，等量子计算可行后再解密。 | 不需要今天就有量子计算机
STARK | Scalable Transparent ARgument of Knowledge | 只依赖 hash 的证明系统，证明一段计算按规则执行。Starknet 用 S-two 实现。 | 不等于“被证明的程序抗量子”
Pedersen | Pedersen hash | Stark 曲线点的线性组合取 x 坐标，安全性依赖离散对数。 | 名字叫 hash，但不是 PQ
Poseidon | Poseidon hash | 面向证明系统的代数 hash（Hades 置换），Starknet 用于 v3 交易 hash、外层状态承诺、隐私池派生。 | 官方没有给它 PQ 评级
BLAKE2s | BLAKE2s-256 | 传统位运算 hash，路线图选它替换 Pedersen。 | 与 Poseidon 不是同一类
Falcon-512 | FN-DSA（FIPS 206） | 基于 NTRU 格的签名；公钥 897 字节，签名 666 字节。 | FIPS 206 尚未定稿
hash-to-point | — | Falcon 把消息映射成多项式 c 的步骤；标准用 SHAKE-256。 | BLAKE2s / Poseidon 变体不与标准签名器互通
MV-PQ | minimum viable post-quantum | EF 在 J* 设置的备用里程碑，在 Q-day 后以较弱保证维持 Ethereum 运行。 | 不是完整的 PQ 迁移
隐私池 | privacy pool | 一个用 note 记账的合约，STRK20 的核心。 | 不是独立的链
note | 票据 | 隐私池里的一笔余额记录，金额用通道密钥掩码。 | 不是 UTXO 链的原生输出
nullifier | 作废标记 | 花掉 note 时写入的唯一值，由私钥派生，只能写一次。 | 不等于 note_id
viewing key | 隐私私钥 | STRK20 用户的 Stark 曲线私钥 k；用于解密、派生 nullifier 和 Shadow 身份。公钥上链，只能注册一次。 | 不只是“只读钥匙”
auditor | 审计方 | 一个全局公钥；每个用户注册时，viewing 私钥用 ECDH 加密给它。能看，不能花。 | 不是合约审计机构
ECDH | 椭圆曲线 Diffie-Hellman | 双方用椭圆曲线算出同一个共享密钥；STRK20 用 Stark 曲线实现。 | 不是 PQ 密钥封装
虚拟 OS | virtual Starknet OS | 在链下运行的 Starknet OS，执行隐私池的私有逻辑并生成证明。 | 不是另一条链
proof facts | 证明事实 | 证明附带的公开输出（程序哈希、基准区块、消息哈希），由网关和合约校验。 | 不是证明本身
anonymizer | ShadowAccountAnonymizer | 只接受隐私池调用的合约，负责部署和驱动 Shadow Account。 | 不是混币器
Shadow Account | 影子账户 | 每个 (用户, anonymizer, dapp_name, nonce) 一个的无密钥代理合约，只隐藏与主钱包的关联。 | 不是协议账户，没有私钥
Primer | Primer 合约 | 固定 class 的占位合约；先按它算地址并部署，再换成 Shadow class。 | 不是 Shadow 的运行时 class
```

## V 参考资料 {depth=2}
1. [starkware-libs/sequencer @54f97a8a](https://github.com/starkware-libs/sequencer/tree/54f97a8af3a712fb6c358e30f19e5a386cb7b4e3) — blockifier 账户交易与验证限制、versioned constants、`starknet_api` 地址与 hash、gateway 证明验证、`apollo_consensus` 投票。**PRIMARY**
2. [docs.starknet.io](https://docs.starknet.io/learn/protocol/accounts) — Accounts、Transactions、Fees、Cryptography、State、Staking、Data availability、Version Notes。**PRIMARY**
3. [starknet-io/SNIPs @1789f44e](https://github.com/starknet-io/SNIPs/tree/1789f44e) — SNIP-6、8、9、12、20、29。**PRIMARY**
4. [OpenZeppelin/cairo-contracts @5cf9010e](https://github.com/OpenZeppelin/cairo-contracts/tree/5cf9010e653b8da506f1e9824cd74c441c4f8d87) — 默认账户、EthAccount、Falcon 账户组件、升级。**PRIMARY**
5. [argent-contracts-starknet @c30f61c5](https://github.com/argentlabs/argent-contracts-starknet/tree/c30f61c5b43e12fb88ea64dcdad9649033685d83) 与 Braavos 账户 @158d7d0b — signer 类型、guardian、升级守卫。**PRIMARY**
6. [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702)、[ERC-4337](https://eips.ethereum.org/EIPS/eip-4337)、[ERC-7562](https://eips.ethereum.org/EIPS/eip-7562)、[EIP-8141](https://eips.ethereum.org/EIPS/eip-8141) — EVM 账户授权与 Native AA 提案状态。**PRIMARY**
7. [Quantum Hub · Migration Register](https://quantum.starkware.co/migration-register) — 各组件的官方登记状态（最后更新 2026-08-19）。**PRIMARY**
8. [Quantum Hub · Learn](https://quantum.starkware.co/learn)、[Foundations](https://quantum.starkware.co/foundations)、[Networks](https://quantum.starkware.co/networks) — 官方对“是否抗量子”的回答、STARK 假设、跨链对照（StarkWare 自制）。**PRIMARY**
9. [The Architecture Advantage: Starknet’s Quantum Readiness Roadmap](https://starkware.co/blog/the-architecture-advantage-starknets-quantum-readiness-roadmap/)（2026-06-30）— 三阶段路线图与时间估计。**PRIMARY**
10. [OpenZeppelin/cairo-pq-verifiers @bece5c07](https://github.com/OpenZeppelin/cairo-pq-verifiers/tree/bece5c07eeea5784e570c01108ec000d2d04ae40) — Falcon 验证器、hint / direct、`efficiency_baseline.json`；以及 [falcon-sign.info](https://falcon-sign.info/) 的尺寸。**PRIMARY**
11. Starknet 主网 RPC（[publicnode](https://starknet-rpc.publicnode.com)）与 feeder gateway — Falcon 交易、主网版本、DA 模式、隐私池参数、Shadow 部署事件（见复现）。**PRIMARY**
12. [NIST CSRC PQC Standardization](https://csrc.nist.gov/projects/post-quantum-cryptography/post-quantum-cryptography-standardization) 与 [FIPS 204](https://csrc.nist.gov/pubs/fips/204/final) — FIPS 206 “in development”。**PRIMARY**
13. [@Starknet](https://x.com/Starknet/status/2108113391525204034) 与 [@EliBenSasson 线程](https://x.com/EliBenSasson/status/2108110129572741426)（2026-10-08）— “actively considering becoming an L1”。**PRIMARY**
14. [v0.14.3 预发布说明](https://community.starknet.io/t/starknet-0-14-3-pre-release-notes/116211)、[v0.14.4 预发布说明](https://community.starknet.io/t/116341)、[status 页](https://status.starknet.io/incidents/6l23lrrdvy9y) — 版本内容与上线时间。**PRIMARY**
15. [EF Protocol priorities](https://blog.ethereum.org/2026/09/07/protocol-priorities)（2026-09-07）与 [pq.ethereum.org](https://pq.ethereum.org) — Ethereum 2029 目标、MV-PQ、EIP 状态。**PRIMARY**
16. [starkware-libs/starknet-privacy @f9256c5e](https://github.com/starkware-libs/starknet-privacy/tree/f9256c5e37682d37437e69a795ddd51d924c9b97) — 隐私池合约、anonymizer、SDK、discovery 规格、Lean 形式化。**PRIMARY**
17. [OpenZeppelin Privacy Contracts Audit](https://github.com/starkware-libs/starknet-privacy/tree/f9256c5e37682d37437e69a795ddd51d924c9b97/docs/audit)（2026-05-29）— 审计范围与发现。**PRIMARY**
18. [docs.starknet.io · Starknet Privacy](https://docs.starknet.io/build/starknet-privacy/security.md) — security、compliance、encryption-and-keys、paymasters、notes-and-nullifiers；以及 starkzap STRK20 页面。**PRIMARY**
19. [SNIP-36 In-protocol S-two verification](https://community.starknet.io/t/116123)（Draft）— 网关验证、Phase 1 只由共识验证。**PRIMARY**
20. [Formal Verification of the STRK20 Privacy Pool](https://starkware.co/blog/strk20-formal-verification/)（2026-07-23）— 形式化范围与原话。**PRIMARY**
21. [strk20.starknet.io · Shadow accounts](https://strk20.starknet.io/docs/starknet-wallet-api/shadow-accounts) — 官方定义、隐私边界、地址派生说明。**PRIMARY**
22. [starkware-starknet-utils @3e2fd53d](https://github.com/starkware-libs/starkware-starknet-utils/tree/3e2fd53d99e16c87f6cf2ced53b8c842a2d54a18) — `shadow_account.cairo`、Primer。**PRIMARY**
23. starknet.io 博客：[Privacy Is Now Live](https://www.starknet.io/blog/privacy-live-on-starknet/)、[Push to Private](https://www.starknet.io/blog/push-to-private/)、[v0.14.2](https://www.starknet.io/blog/starknet-v0-14-2-the-privacy-engine-arrives/)、[Quantum Resistance](https://www.starknet.io/blog/quantum-resistance/) — 上线时间与旧名 “private sub-accounts”。**PRIMARY**
24. [starkware-bitcoin/s2morrow @831bb518](https://github.com/starkware-bitcoin/s2morrow) 与 feltroidprime/s2morrow @4eff9ab9 — 两个同名仓库的定位。**PRIMARY**
25. research-hub 报告 `native-aa-eip-8130-8141` — EVM Native AA 对照的线索。
26. ChatGPT Deep Research：starknet-account-model.md — 外部调研，只作线索。

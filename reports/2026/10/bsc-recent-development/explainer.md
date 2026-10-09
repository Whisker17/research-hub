---
template: research
title: BSC 近期开发方向：CAS20、Payment Lane 与 Jenner 升级
subtitle: BSC 把执行引擎交还给上游 geth，把开发力量放到协议层的金融基础设施上：原生合规代币 CAS20、给支付保底的 Payment Lane、builder 出块流水线。CAS20 直接沿用 Base B20 的设计；Payment Lane 与 Tempo 只是同类思路。截至 2026-10-09，Jenner 的功能全部已合并、未发布、未激活。
cols: 4
type: 技术调研 · 代码库深挖
audience: 懂 EVM 和以太坊客户端基础的开发者，没有细读过 BSC 的 Parlia 与 MEV builder 流程
scope: 2026-06 至 2026-10-09 的 bsc（Go）、reth-bsc（Rust）、BEPs / BAPs 仓库；Jenner 硬分叉；对比 Base B20 与 Tempo payment lane
evidence: 154 条论断台账（observed 131 / inferred 19 / speculative 4）；源码 bsc @8cc60b2、reth-bsc @349f55c、BEPs @e9b2be3、base-std @a2954a8、base @f1f40ba、tempo @feb5dff、flashbots/priority-update-registry @8701e8e；BSC 主网 RPC；访问于 2026-10-09
date: 2026-10-09 · v1
---
结论先行：BSC 近期的开发分成三层。资产层是 CAS20：客户端原生执行的合规代币，接口和存储布局逐项沿用 Base B20（[F1](#F1)、[F2](#F2)）。资源层是 Payment Lane：每个区块给支付交易保底 5% 的 gas（[F5](#F5)）。出块层是 BEP-675 BidBlock：它已经在主网承担约 98% 的区块（[F8](#F8)）。同一时期，BSC 删掉了自研的执行与存储优化，回归上游 geth（[F10](#F10)）。CAS20 和 Payment Lane 属于 Jenner 硬分叉，截至 2026-10-09 还没有进入任何 release（[F11](#F11)）。

## A 近期开发全景 {sheet meta="by layer"}
```tree list
资产层 | CAS20（BEP-702）：原生合规代币
资源层 | Payment Lane（BEP-703）：支付保底
合约可见能力 | 0x70 毫秒时间（BEP-706）
  0x68 双签证据按字节计价 | 绑定 Jenner，清单未列
出块流水线 | BEP-675 BidBlock + gRPC
  gas limit | 55M → 70M（已上）→ 80M / 90M（目标）
共识参数 | 备用验证者等待 2s → 1s（BEP-714）
链下接入 | BAP-710 PropAMM Relayer + PUR 式 registry
客户端底座 | geth v1.17.3 同步；reth-bsc 双客户端
```

## B 一条有效性规则 {sheet span=2 meta="BEP-703"}
```annot
# Payment Lane 的区块有效性条件 | 每块都检查
[N]{普通交易 + 系统交易的 gas} + max([P]{支付交易实际用掉的 gas}, [Q]{保底配额}) ≤ [G]{区块 gas limit}
# Q 怎么来 | 读父区块状态
Q = [ratio]{治理参数，默认 500，上限 1000} × G / 10000
> 等价于：N ≤ G − Q，且 N + P ≤ G。支付可以超过 Q，普通交易永远用不到 Q。
```

## C 和谁像 {sheet meta="lineage"}
| 问题 | CAS20 ↔ B20 | Lane ↔ Tempo |
|---|---|---|
| 设计同构 | ok 接口与布局 | warn 只有约束形状 |
| 开发痕迹 | ok 注释引用 base-std | no 0 次提及 |
| 代码 fork | no 独立 Go 实现 | no |
| 对方已上主网 | ok 2026-06-25 | ok 2026-02-12 |

## D 进度 {sheet span=2 meta="2026-10-09"}
| 功能 | Go / Rust 代码 | release | 主网 |
|---|---|---|---|
| CAS20 | ok 已合并 | no | no 另需治理开启 |
| Payment Lane | ok 已合并 | no | no 名单为空 |
| BEP-706 / 714 | ok 已合并 | no | no |
| BEP-675 BidBlock | ok 已合并 | ok v1.7.7 | ok 约 98% 区块 |
| BEP-675 加固、gRPC | ok 已合并 | no | no |
| BAP-710 | warn 链下组件 | — | warn 只是提案 |

## E 时间线 {sheet span=2 meta="2026"}
```timeline v
06-25 | Base B20 上主网 | Beryl 升级
08-25 | BSC 主网 Pasteur | BidBlock 开放
*09-11 | CAS20、Payment Lane 合并 | Go 客户端
09-20 | Jenner 公告 | BEP-718
09-23~24 | Rust 移植合并 | reth-bsc
10 月下旬 | 测试网 Jenner | 计划
11 月下旬 | 主网 Jenner | 计划
```

## F 结论 {sheet span=4}
```callout ok 执行回归上游，差异化放在协议层的金融基础设施
- CAS20 是协议原生代币：状态仍在链上，计费不打折，省的是字节码解释。它直接沿用 Base B20 的设计，代码独立用 Go 实现（F1、F2）。
- Payment Lane 是一道配额，不是独立通道：普通交易用不到保底的 5%，支付按目标地址认定，名单初始为空（F5、F6）。它和 Tempo 形状相同，倾向相反，没有移植证据（F9）。
- 已经影响主网的只有 BEP-675 BidBlock 和 70M gas limit；Jenner 的功能还要等 release、硬分叉和治理开关（F8、F11、F4）。
- 这些部件之间没有自动连接：CAS20 代币不会自动进入支付名单，经 Router 发起的支付不进 lane（F6）。
```

## G 如何阅读 {depth=1}
```callout info 默认你已知道（本文不解释）
- EVM 调用、`CALL` / `STATICCALL` / `DELEGATECALL` 的区别，以及 gas 按 opcode 收费
- 以太坊硬分叉：所有节点在约定时间切换规则
- ERC-20 的接口与 storage 布局
- MEV 与 PBS 的基本概念：builder 组块，proposer 选块
- EIP-7702：EOA 可以挂一段委托代码
```
- **5 分钟**：只看导语和总览 A–F。
- **30 分钟**：再读 [前置知识](#panel-I)、[CAS20](#panel-J)、[CAS20 与 B20](#panel-K)、[Payment Lane](#panel-L)、[出块流水线](#panel-M)、[Lane 与 Tempo](#panel-N)、[其他方向](#panel-O) 和 [进度与方向](#panel-P)。
- **要复核的开发者**：再读 [方法与证据](#panel-R) 和 [复现](#panel-S)，命令可以直接运行。

**贯穿全文的例子**：发行方 Acme 在 BSC 上用 CAS20 发行稳定币 xUSD。Alice 向商户 Bob 支付 100 xUSD。后面各面板都问同一组问题：这笔转账在客户端里怎么执行？它算不算 payment？它怎么进入区块？它什么时候能在主网发生？

## H 背景动机 {depth=2}
**问题**：作者用一个 bot 追踪 BSC 仓库的 commit。2026 年 9 月，bot 看到了 `CAS20` precompile 和 `paymentlane` 两组大改动。我们想知道三件事：
- 它们做什么、怎么做？
- 它们是不是 fork 自 Base B20 和 Tempo？
- 除了这两项，BSC 近期还在开发什么，进度到哪一步？

**为什么现在**：两项功能都在 2026-09-11 合并进 Go 客户端，并列入 Jenner 硬分叉。官方计划测试网 10 月下旬、主网 11 月下旬 [16]。现在读代码，可以赶在激活之前看清机制和限制。

**范围**：
- bsc（Go）、reth-bsc（Rust）、BEPs / BAPs 仓库在 2026-06 至 2026-10-09 的开发
- Jenner 硬分叉；Base B20 与 Tempo payment lane 作为对比对象
- 官方路线图只作背景

**非目标**：代币价格与投资建议；完整代码审计；BNB Chain 生态应用数据；opBNB / Greenfield；仓库之外的方向（Agent Lifecycle Protocol 等）。

**已有资料的不足**：外部调研（ChatGPT Deep Research）给出了正确的大框架 [23]。但它有几处过时或错误：
- Tempo 的支付识别规则：它写的是旧版
- CAS20 `transferFrom` 的检查顺序：写错了
- BEP-675 的加固：它写成“计划”，实际已合并
- 漏掉的内容：BEP-718、0x68 重新计价、BEP-714 的范围缩减、主网已是 70M gas limit

本文用固定 commit 的源码逐条核对，见 [方法与证据](#panel-R)。

## I 前置知识 {depth=2}
```excalidraw q="读懂 BSC 这一轮开发，要先懂哪些概念？按什么顺序？" read="灰色虚线框是默认已知；蓝框是卡片；绿框是本文主题。箭头表示先学 → 后学。" takeaway="B-0 和 B-4 讲出块与状态读取；B-2、B-3 讲原生代币怎么跑、怎么收费；B-1 讲功能什么时候真正可用。" name=prereq-map kind=前置知识地图
{"grid": {"w": 290, "h": 115}, "defaults": {"w": 220, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "mev", "label": "MEV / PBS（已知）", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "fork", "label": "硬分叉（已知）", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "evm", "label": "EVM 调用与 gas（已知）", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 BSC 出块", "col": 1, "row": 0, "color": "blue"},
   {"id": "b1", "label": "B-1 硬分叉与治理开关", "col": 1, "row": 1, "color": "blue"},
   {"id": "b2", "label": "B-2 stateful precompile", "col": 1, "row": 2, "color": "blue"},
   {"id": "b4", "label": "B-4 父状态与实时状态", "col": 2, "row": 0, "color": "blue"},
   {"id": "b5", "label": "B-5 B20 与 Tempo", "col": 2, "row": 1, "color": "blue"},
   {"id": "b3", "label": "B-3 原生代码怎么计费", "col": 2, "row": 2, "color": "blue"},
   {"id": "top", "label": "BSC 近期开发", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "mev", "to": "b0"}, {"from": "fork", "to": "b1"}, {"from": "evm", "to": "b2"},
   {"from": "b0", "to": "b4"}, {"from": "b2", "to": "b3"}, {"from": "b2", "to": "b5"},
   {"from": "b4", "to": "b5"}, {"from": "b5", "to": "top"}, {"from": "b4", "to": "top"},
   {"from": "b3", "to": "top"}, {"from": "b1", "to": "b5", "dashed": true}
 ]}
```

```prereq B-0 l1 5min
# BSC 出块：Parlia 验证者与 builder
是什么: BSC 用 [[Parlia]] 共识：一组验证者轮流出块，每人连续出若干块，出块间隔 0.45 秒。验证者可以接收 [[builder]] 的报价，从中选出收益最高的一份出块 [3][6]。
为什么需要: Payment Lane 的检查点和 BEP-675 的风险，都取决于“验证者封块前有没有执行交易”。
例子: 旧路径 SendBid：builder 发交易列表，验证者重新执行一遍再封块。新路径 SendBidBlock：builder 发已执行好的整块，验证者不执行就签名。
误解: 误解：BidBlock 让验证者“不验证”。事实：验证者广播之后，仍会在本地完整导入这个块，失败就撤销 builder [3]。
深入: [3] BEP-675 §4
```

```prereq B-1 l1 3min
# 硬分叉与治理开关
是什么: 硬分叉让所有节点在约定时间启用新规则，例如 Jenner。治理开关是链上合约里的参数，由 BSC 治理通过 [[GovHub]]（`0x…1007`）修改，不需要升级节点 [1][2]。
为什么需要: CAS20 和 Payment Lane 都要过两层：Jenner 激活后代码才生效；治理改参数后，功能才真正可用。
例子: Jenner 之后，CAS20 的创建开关仍然全部关闭。Payment Lane 的支付名单仍然为空。
误解: 误解：代码合并就等于上线。事实：截至 2026-10-09，这些代码还不在任何 release 里，主网也没有排 Jenner 时间 [20]。
深入: [16] Jenner 公告
```

```prereq B-2 l1 4min
# 预编译与 stateful precompile
是什么: 预编译（precompile）是固定地址上的原生代码，例如 `ecrecover`，输入进、输出出，不碰状态。[[stateful precompile]] 能读写 StateDB、知道调用者、能发事件，失败时随调用帧一起回滚 [5]。
为什么需要: CAS20 代币就是 stateful precompile。它用 Go 代码完成 ERC-20 合约的全部工作，所以必须自己补上 EVM 原本自动提供的约束。
例子: `STATICCALL` 里不能写状态；`DELEGATECALL` 进来时 storage 归谁？原生代码必须逐项处理这些情况。
误解: 误解：原生代码的状态存在节点私有数据库里。事实：CAS20 的状态写在代币账户自己的 storage 里，进入 state root [1]。
深入: [5] bsc `core/vm/contracts_stateful.go`
```

```prereq B-3 3min
# 原生代码怎么计费
是什么: EVM 按 opcode 收费，状态访问分冷 / 热（EIP-2929），写 storage 有 net metering 和退款（EIP-2200 / 3529）。原生代码不执行 opcode，所以要手动在每次读写时扣同样的费用 [5]。
为什么需要: 这决定 CAS20 比字节码代币便宜在哪里：省掉解释开销，状态访问照常收费。
深入: [1] BEP-702 §3.14
```

```prereq B-4 l1 3min
# 父状态与实时状态
是什么: 父状态是上一个区块执行完后的状态，本块所有交易看到的都一样。实时状态是本块里“这笔交易执行之前”的状态，会随前面的交易变化 [2]。
为什么需要: Payment Lane 两种都用：名单和比例读父状态，“收款方有没有代码”读实时状态。
例子: 同一块里，交易 1 给地址 X 部署代码，交易 2 给 X 转 BNB。按父状态 X 没有代码；按实时状态 X 已经有代码。
误解: 误解：EIP-7702 账户还是 EOA，所以没有代码。事实：委托标记 `0xef0100‖addr` 也算代码 [2]。
深入: [2] BEP-703 §3.2
```

```prereq B-5 3min
# 两个参照物：Base B20 与 Tempo
是什么: [[B20]] 是 Base 在 Beryl 升级（2026-06-25 主网）上线的原生代币标准，用 Rust precompile 实现 [12]。Tempo 是支付专用链，它的 payment lane 给非支付交易设一道 gas 上限 [13]。
为什么需要: 本文要回答 CAS20 与 B20、Payment Lane 与 Tempo 的关系。
深入: [12] Base 文档 “B20”；[13] Tempo “Payment Lane Specification”
```

## J CAS20：协议原生的合规代币 {depth=2}
CAS20（Compliant Asset Standard）是 BEP-702 定义的代币标准。目标是稳定币和代币化 [[RWA]]。BEP 给出的动机是：BEP-20 只是 ABI 约定，不保证行为；隐藏的 mint 路径、审计后的 proxy 升级都可以藏在正常接口后面 [1]。CAS20 让链来保证代币行为。

代币分两个变体 [1][5]：
- **Asset**：decimals 在 6–18 之间，创建后不变；带 multiplier、公告、批量 mint、扩展元数据。
- **Stablecoin**：decimals 固定为 6；多一个不可变的 `currency()`，只能是 A–Z。它只是发行方的自我声明，不证明储备。

### 一次 transfer 在客户端里怎么走

Fig 2 对比 Alice 转 100 xUSD 时，ERC-20 与 CAS20 的路径。

```excalidraw q="同样调用 transfer(to, v)，ERC-20 和 CAS20 在客户端里走的路径有什么不同？" read="上行是普通 ERC-20：解释器逐条执行字节码。下行是 CAS20：EVM 按地址前缀找到原生实现。两条路最后都写进账户 storage。" takeaway="CAS20 省掉的是字节码解释，不是状态访问；状态仍在链上，仍进入 state root。" kind=调用路径对比
{"grid": {"w": 330, "h": 120}, "defaults": {"w": 210, "h": 64, "fontSize": 17},
 "nodes": [
   {"id": "u", "label": "transfer(Bob, 100)", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "e1", "label": "加载合约字节码", "col": 1, "row": 0},
   {"id": "e2", "label": "解释器逐条执行", "col": 2, "row": 0},
   {"id": "c1", "label": "按 0xCA52 前缀路由", "col": 1, "row": 2, "color": "blue"},
   {"id": "c2", "label": "Go 代码 + 现场计费", "col": 2, "row": 2, "color": "blue"},
   {"id": "st", "label": "账户 storage", "col": 3, "row": 1, "color": "violet", "shape": "ellipse"}
 ],
 "edges": [
   {"from": "u", "to": "e1", "label": "ERC-20"}, {"from": "u", "to": "c1", "label": "CAS20"},
   {"from": "e1", "to": "e2"}, {"from": "c1", "to": "c2"},
   {"from": "e2", "to": "st", "label": "SSTORE"}, {"from": "c2", "to": "st", "label": "SetState"}
 ]}
```

路由发生在 `evm.precompile()`：先查静态预编译表，Jenner 之后再按地址前缀解析 CAS20 [5]：

```go
// bsc/core/vm/evm.go:46-59 @8cc60b2
func (evm *EVM) precompile(addr common.Address) (PrecompiledContract, bool) {
	if p, ok := evm.precompiles[addr]; ok {
		...
		return p, ok
	}
	// CAS20 tokens have no fixed address, so they cannot
	// live in the static map: resolve them from the prefix.
	if evm.cas20Enabled() { // chainRules.IsJenner
		return resolveCAS20(addr)
	}
	return nil, false
}
```

stateful precompile 拿到的上下文比普通预编译多很多 [5]：

```go
// bsc/core/vm/contracts_stateful.go:13-53 @8cc60b2（节选）
type StatefulPrecompiledContract interface {
	RequiredGas(input []byte) uint64 // CAS20: always 0
	RunStateful(ctx *PrecompileContext, input []byte) ([]byte, error)
}
type PrecompileContext struct {
	StateDB    StateDB
	Self       common.Address // callee; owns the storage
	Caller     common.Address // msg.sender
	ReadOnly   bool           // inside STATICCALL
	DirectCall bool           // false for CALLCODE / DELEGATECALL
	Value      *uint256.Int
	...
}
```

每个入口先检查调用形式：`DELEGATECALL` / `CALLCODE` 报 `DelegateCallNotAllowed`；带 value 报 `NonPayable`；`STATICCALL` 里写状态报 `StaticCallNotAllowed`。三者都是带具名错误的 revert，不会耗尽 gas [1][5]。

```finding F1 high
# CAS20 是协议原生代币：状态仍在链上，计费不打折，省的是字节码解释
结论: 代币状态写在代币账户自己的 storage 里（ERC-7201 命名空间），进入 state root。`RequiredGas` 恒为 0，全部费用在执行中按实际读写扣除，逐条复刻 EIP-2929 / 2200 / 3529。唯一的性能数据是 reth-bsc 的本地微基准：单线程 transfer 约 1.3 µs。
证据: [observed] `cas20_storage.go`、`cas20_gas.go`、`cas20.go:149` [5]；BEP-702 §3.14、§3.17 [1]；reth-bsc#512 正文 [8]（C6、C10、C22、C24）。
影响: 不要期待 CAS20 让转账 gas 大幅下降。reth-bsc#512 自己写明：BEP 要求的激活前整块计时测量还没做。
```

### 地址与创建

代币地址由 Factory 派生，不能随便部署 [1][5]：

```annot
# CAS20 代币地址（20 字节） | Stablecoin 示例
[0xCA52]{2 字节前缀} [00 00 00 00 00 00 00 00]{8 个零字节} [01]{变体：00 Asset，01 Stablecoin} [9 字节]{keccak256(abi.encode(creator, salt)) 的前 9 字节}
> Factory 在 0xCA5F…00；ActivationRegistry 在 0x7020…01；PolicyRegistry 在 0x7020…02。
```

Fig 3 是 Acme 创建 xUSD 的过程，顺序以 bsc#3826（2026-09-23）之后的代码为准 [5][7]。

```uml q="Acme 调用 createCAS20 时，每一步做什么？顺序是什么？" read="真实函数与地址。高亮部分是 bsc#3826 改动的内容：事件提前，initCalls 以 Factory 身份执行。" takeaway="创建前要先过激活开关；0xEF 哨兵先写，事件在 initCalls 之前发出；任何一步失败，整笔创建回滚。"
sequenceDiagram
  autonumber
  participant A as Acme
  participant F as Factory 0xCA5F
  participant R as ActivationRegistry
  participant T as xUSD 0xCA52…01…
  A->>F: createCAS20(variant, salt, params, initCalls)
  F->>R: 读 Stablecoin feature 是否开启
  alt 未开启
    F-->>A: revert FeatureNotActivated
  end
  F->>F: 校验参数，派生地址，检查未被占用
  F->>T: 写 1 字节代码 0xEF（哨兵）
  F->>T: 写 name、symbol、supplyCap、currency
  rect rgb(234, 241, 251)
    F->>F: emit CAS20Created
    F->>T: 授予 initialAdmin（sender = Factory）
    loop 每个 initCall
      F->>T: 以 Factory 身份执行（特权窗口）
    end
  end
  F-->>A: 返回 xUSD 地址
```

`0xEF` 哨兵有三个作用 [1]：
- 防止 EIP-161 把“没有 nonce、没有余额、没有代码”的代币账户连同 storage 一起删掉。
- 它是 EIP-3541 保留的前缀，`CREATE` / `CREATE2` 部署不出来，所以无法伪造。
- `EXTCODESIZE` 返回 1，“有代码就是合约”的判断仍然成立。

`initCalls` 让 Acme 在同一笔交易里配置角色和策略。它们运行在特权窗口里：跳过角色检查和转账侧策略，但不跳过 MINT_RECEIVER 策略、暂停、供应上限 [1][5]。

### 合规能力

| 能力 | 怎么做 | 边界 |
|---|---|---|
| 角色 | MINT / BURN / SEIZE / PAUSE / UNPAUSE / METADATA 分离 | 不能撤掉最后一个 admin |
| 策略 | 每个代币 6 个策略槽，指向共享 PolicyRegistry | 默认全部放行 |
| 名单类型 | BLOCKLIST、ALLOWLIST、UNION / INTERSECT（2–4 个子策略） | 只嵌套一层 |
| 扣押 | `seize` 需要 SEIZE_ROLE | 只扣不在 `SEIZE_EXEMPT_POLICY` 里的人；默认无人可扣 |
| multiplier | 显示值 = ⌊raw × m / 1e18⌋（仅 Asset） | 余额与转账都用 raw，不是收益机制 |

这些都是**发行方对自己代币**的权限，不能作用于 BNB 或已有 ERC-20 [1]。

Fig 4 是 Alice 授权支付网关、网关调用 `transferFrom` 时的检查顺序。BEP 规定这个顺序属于共识：两个客户端必须在同一步报同一个错 [1]。

```uml q="transferFrom 先检查什么、后检查什么？" read="源自 cas20_token.go:191-269。从上往下检查；任何一步回答“是”，立即 revert 并带具名错误。approve 不受暂停和策略影响。" takeaway="暂停最先检查；executor 策略只在 spender 不是 from 本人时检查；余额最后检查。"
flowchart TD
  s(["transferFrom(Alice, Bob, 100)"]) --> p["① TRANSFER 已暂停？"]
  p -- 否 --> z["② from / to 是零地址？"]
  z -- 否 --> a["③ allowance 不够？"]
  a -- 否 --> e["④ spender ≠ Alice<br/>且 EXECUTOR 策略拒绝？"]
  e -- 否 --> d["扣减 allowance"]
  d --> sp["⑤ SENDER / RECEIVER 策略拒绝？"]
  sp -- 否 --> b["⑥ 余额不够？"]
  b -- 否 --> ok["写两个余额，emit Transfer"]
  style ok fill:#d3f9d8,color:#222
```

### 激活：三道闸

```go
// bsc/core/vm/cas20_activation.go:82-87 @8cc60b2
func requireGov(ctx *PrecompileContext) error {
	if ctx.Caller != params.CAS20GovHubAddress { // 0x…1007
		return revCAS20("Unauthorized(address)", ...)
	}
	return nil
}
```

| 闸 | 谁操作 | 结果 |
|---|---|---|
| 1 Jenner 硬分叉 | 全体节点 | 路由生效；fork 区块给两个 Registry 写 0xEF |
| 2 任命 admin | 治理 → GovHub `updateParam("admin", addr)` | Registry 记住 admin；admin 不能自己换人 |
| 3 开启 feature | admin `activate(id)` | 三个开关：`bsc.cas20_asset`、`bsc.cas20_stablecoin`、`bsc.policy_registry` |

```finding F4 high
# CAS20 要过三道闸才能用；关掉开关不会冻结已有代币
结论: Jenner 之后三个 feature 全部关闭、admin 为空。治理必须先任命 admin，admin 再逐个开启。开关只管 `createCAS20` 和 PolicyRegistry 的写操作；已有代币照常运行。关闭 `bsc.policy_registry` 会冻结所有共享名单。
证据: [observed] `cas20_activation.go:24-28, 82-87, 144-210` [5]；BEP-702 §3.15 [1]（C25、C26、C27）。
影响: 追踪 CAS20 上线，要分别看 release、硬分叉时间、admin 任命提案、feature 开启交易四件事。
```

```finding F3 medium
# BEP-702 的文本落后于代码
结论: bsc#3826 和 #3829 于 2026-09-23 合并。它们改了三处：创建事件顺序、initCalls 调用者、扣押策略名。BEP-702 master 仍是旧写法。修订 PR BEPs#716 截至 2026-10-09 仍未合并；reth-bsc 按 #716 实现。BEP 还要求“fork 后诞生的链在 genesis 里放哨兵”，两个客户端都没有这样做。
证据: [observed] bsc#3826 / #3829 diff [7]；BEP-702 §3.4、§3.8、§3.15 [1]；BEPs#716 状态 [9]（C12、C13、C28）。
影响: 写集成代码时以客户端代码为准，不要以 BEP master 为准。
```

## K CAS20 与 Base B20：沿用设计，独立实现 {depth=2}
BEP-702 全文没有提到 Base 或 B20 [1]。直接证据在开发过程里。PR #3813 是 squash 合并的，它分支上的 commit `57d98c2`（2026-09-08）在 GitHub 上仍可访问，标题是 “name the standard, not another implementation, in comments” [7]：

```annot
# bsc commit 57d98c2 的改动 | 2026-09-08，PR #3813 内
[- The hashes base-std publishes in full]{!改前：期望值来自 base-std}
[+ The hashes the standard publishes in full]{改后}
[- IB20 reports which one it could not find]{!改前：B20 接口名}
[- "the reference implementation's prefix" 0xb2…ff]{!改前：B20 前缀被称为参考实现}
> 同一 PR 的第一个实现 commit 13a9d22 还有 “IB20 dispatch / views” 等注释，测试以 base-std 的已发布哈希为期望值。
```

再看两边的代码，结构逐项对得上 [5][10][11]：

| 维度 | CAS20（BSC） | B20（Base） |
|---|---|---|
| 地址 | `0xCA52`+8×00‖变体‖9 字节指纹 | `0xB2`+9×00‖变体‖9 字节指纹 |
| 存储布局 | `bsc.cas20` slot 0–14 | `base.b20` slot 0–14，逐字段相同 |
| 接口 | 100 个函数名相同 | 同左 |
| 创建顺序 | #3826 后：事件 → admin → initCalls | 相同 |
| 激活 admin | 治理经 GovHub 任命 | 链配置的静态 admin；Cobalt 起可 `setAdmin` |
| 版本化 | 单一版本，按 Jenner 开关 | 按硬分叉冻结逻辑版本 |
| 独有 | `MemoFormatDeclared`、`variantOf` | Denim：NOT 策略、拒收自身 |
| 实现 | Go（bsc）+ Rust 移植（reth-bsc） | Rust（base） |
| 主网 | 未激活 | Beryl 2026-06-25；Cobalt 2026-09-30 |

CAS20 还在跟进 B20 的规范变化：base-std 于 2026-09-02 把 `SEIZE_HOLDER_POLICY` 改名为 `SEIZE_EXEMPT_POLICY`，bsc#3829 于 2026-09-23 跟进 [7][10]。

```finding F2 high
# CAS20 直接沿用 B20 的接口、地址方案和存储布局；代码是独立的 Go 实现
结论: 开发 commit 直接引用 base-std、IB20 和 B20 前缀；地址结构、存储布局、feature id 逐项同构；CAS20 跟进了 B20 的改名和创建顺序。代码语言与内部结构不同，不是 Base Rust 代码的 fork。BSC 加了自己的治理入口和 memo 格式，没有跟进 B20 Denim 的三项改动。
证据: [observed] commit `57d98c2`、`13a9d22` [7]；`base/…/b20_factory/variant.rs`、`core_storage.rs` 与 `bsc/core/vm/cas20_storage.go` 对照 [5][11]（C31–C40）。[inferred] “沿用设计、独立实现”由以上推出（C41、C42）。[speculative] BSC 开发者可能参照了 base-std 的 Solidity mock（C43）。
影响: B20 的文档、工具和审计结论，大部分可以作为理解 CAS20 的参考。地址前缀、治理入口和 Denim 之后的差异要单独处理。
```

## L Payment Lane：给支付保底的配额 {depth=2}
BEP-703 的动机：BSC 的 base fee 固定为 0，打包顺序完全靠小费竞价。某类流量暴涨时（例如发币），支付交易最先被挤出去 [2]。Payment Lane 的做法是：每个区块给“支付类交易”保底一部分 gas。BEP 原文是 “A quota, not a region”：它是配额，不是区块里的一段位置 [2]。

### 什么交易算 payment

Fig 5 是分类规则。每笔交易在执行前分类一次 [2][6]。

```uml q="一笔交易怎样被判为 payment 或 general？每一步读哪份状态？" read="源自 core/paymentlane/classify.go。黄色判断读父区块状态；紫色判断读本交易执行前的实时状态。" takeaway="名单命中就是 payment，不再看 value 和代码；不在名单上的，只有“带 BNB 转给没有代码的地址”才算 payment。"
flowchart TD
  t(["交易 tx"]) --> s["系统交易？合约创建？<br/>type 不是 0/1/2？"]
  s -- 是 --> G["GENERAL"]
  s -- 否 --> l["顶层 to 在支付名单里？"]
  l -- 是 --> P["PAYMENT"]
  l -- 否 --> v["value = 0？"]
  v -- 是 --> G
  v -- 否 --> c["to 此刻有代码？<br/>（含 7702 委托）"]
  c -- 是 --> G
  c -- 否 --> P
  style l fill:#fff3bf,color:#222
  style c fill:#e5dbff,color:#222
  style P fill:#d3f9d8,color:#222
```

```go
// bsc/core/paymentlane/classify.go:34-58 @8cc60b2
func (c *Classifier) Classify(tx *types.Transaction) LaneType {
	if c.isSystemTx(tx) {
		return GeneralLane
	}
	to := tx.To()
	if to == nil {
		return GeneralLane
	}
	switch tx.Type() {
	case types.LegacyTxType, types.AccessListTxType,
		types.DynamicFeeTxType:
	default:
		return GeneralLane
	}
	if _, ok := c.listed[*to]; ok { // parent state
		return PaymentLane
	}
	if tx.Value().Sign() == 0 {
		return GeneralLane
	}
	if hasCode(c.code.GetCodeHash(*to)) { // live state
		return GeneralLane
	}
	return PaymentLane
}
```

规则里有几处容易误解的地方 [2]：
- **按地址，不按函数**：调用名单上代币的任何函数（包括 `approve`）都算 payment。
- **只看顶层 `to`**：经 Router、多签、AA 钱包发起的支付不算 payment，即使内部转了 USDT。
- **名单初始为空**：Jenner 不预装任何地址。USDT、USDC 只是预期的首批条目，要等治理提案。
- **code 读实时状态**：防止“同块先部署代码或 7702 授权，再转 BNB”把任意执行塞进 lane。

回到例子：Alice 直接调用 xUSD 的 `transfer`，只有 xUSD 地址被治理加进名单，它才是 payment。Alice 用智能钱包付款时，顶层 `to` 是钱包合约，这笔交易是 general。

```finding F6 high
# 支付按顶层 to 地址认定，名单初始为空；CAS20 代币不会自动进入 lane
结论: 分类只读交易的顶层 `to`，不解析 selector，不跟踪内部调用。名单只能由治理经 GovHub 调用 `0x…2007` 的 `updateParam` 增删，从下一个区块起生效。CAS20 的激活开关与 Payment Lane 名单是两套独立的参数。
证据: [observed] `classify.go:34-58` [6]；BEP-703 §3.2、§3.6 [2]；`PaymentLane.sol:91-116` [15]（P5、P6、P10、P12）。[inferred] 与 CAS20 没有自动连接（S3）。
影响: 钱包和支付网关想让交易进入 lane，必须让用户直接调用名单上的合约。可升级合约被列入名单后，要持续监控它的实现。
```

### 配额怎么算

```go
// bsc/core/paymentlane/paymentlane.go:60-81 @8cc60b2（节选）
// Quota = PAYMENT_LANE_RATIO(h−1) × GasLimit(h) / 10000
func Quota(ratio, gasLimit uint64) uint64 {
	hi, lo := bits.Mul64(ratio, gasLimit)
	...
	q, _ := bits.Div64(hi, lo, RatioDenom)
	return q
}
// gasUsed + max(0, quota − paymentGasUsed) ≤ gasLimit
func CheckInequality(gasLimit, gasUsed,
	paymentGasUsed, quota uint64) error { ... }
```

下表是一个**假设的** 100M gas limit 区块（不是主网参数），ratio 取默认 500，所以 Q = 5M [2]：

| 情形 | P 支付 | N 普通 + 系统 | 结果 |
|---|---|---|---|
| 支付不足 | 2M | 92.5M | ok 有效：3M 保底空着 |
| 没有支付，普通塞满 | 0 | 95.5M | no 无效：普通用了保底 |
| 支付超额 | 8M | 92M | ok 有效：多出的 3M 与普通共享 |
| 总量超限 | 8M | 93M | no 无效 |

BEP 自带的例子用 55M gas limit：Q = 2.75M，约容纳 130 笔 BNB 转账，或 45–78 笔稳定币转账 [2]。

```finding F5 high
# Payment Lane 是给支付的保底配额，不是独立通道
结论: 默认 5%、上限 10% 的 gas 只能给支付用，即使空着也不还给普通交易；支付可以超出这个额度。BEP 不改交易格式、区块头、费用规则和排序，也不承诺任何单笔支付被打包。
证据: [observed] BEP-703 §1、§3.3、§4、§5 [2]；`paymentlane.go:60-81` [6]（P1、P2、P3、P13、P14、P16、P19）。[inferred] 不提供 FIFO、抗审查、抗 MEV 保证（P4）。
影响: 它保证的是“拥堵时支付这一类交易总有空间可抢”。单笔支付仍要付有竞争力的小费。
```

### 规范在博客发出一周后改了

2026-09-01 的官方博客描述的是**动态**预留：拥堵时扩大、需求回落时缩小，验证者投票决定阈值和速度 [18]。这和当时 8 月 31 日的草案一致；那版草案还把配额写进 `header.UncleHash` [2]。2026-09-08 的提交 `10020317`（“simply model”）删掉了动态模型和 `UncleHash` 承诺，改成单一治理比例。

```finding F7 medium
# 当前 BEP-703 是静态比例，不是博客描述的动态预留
结论: 动态模型与 UncleHash 承诺在 2026-09-08 被删除；BEP 于 09-11 squash 合并，修订史只在 PR #703 的 41 个 commit 里。“PaymentGasLimit”只是博客用词，没有在任何一版草案中出现。
证据: [observed] BEPs PR #703 草案 `3c210b5d` 与 `10020317` 的比对 [2]；博客原文 [18]（P30–P33）。[speculative] 删除原因可能是 UncleHash 改动面太大（P45）。
影响: 引用 Payment Lane 时以 BEP-703 当前文本为准，不要以 9 月 1 日的博客为准。
```

## M 出块与验块：lane 检查发生在哪一步 {depth=2}
BEP-675 BidBlock 让 builder 直接提交执行好的整块。验证者封块前不执行交易，所以 Payment Lane 的检查只能放在广播之后的本地导入里 [2][3]。Fig 6 是这条路径。

```uml q="BidBlock 路径上，验证者什么时候签名？Payment Lane 在哪一步检查？违规怎么处理？" read="源自 miner/miner_mev.go、bid_block.go、bid_simulator.go。高亮部分是广播之后的验证。" takeaway="违反 lane 的 BidBlock 会先被签名并广播，再被本地导入拒绝；后果是撤销 builder，而不是阻止这个块被签出。"
sequenceDiagram
  autonumber
  participant B as Builder
  participant V as 验证者
  participant L as 本地 InsertChain
  participant N as 其他节点
  B->>V: SendBidBlock（已执行的整块，gRPC 或 JSON-RPC）
  V->>V: 准入：权限、非激活块、截止时间、零 root
  Note over V: 不执行交易，不检查 lane
  V->>V: 签系统交易，重算 TxHash，封块签名
  V->>N: 广播
  rect rgb(234, 241, 251)
    V->>L: 完整执行：分类、记账、检查不等式
    alt 验证失败
      L-->>V: 撤销该 builder 24 小时
    end
    N->>N: 各自导入，失败则产生坏块证据
    Note over N: N/2+1 个验证者举证后，全网撤销该 builder
  end
```

三条路径的检查点 [6]：

| 路径 | lane 在哪检查 | 违规后果 |
|---|---|---|
| 验证者自己出块 | 选交易时准入，封块前 `Verify` | 拒绝封块 |
| SendBid（交易列表） | 模拟 bid 时 `VerifyPackedBid` | 丢弃该 bid |
| SendBidBlock（整块） | 广播后的 `InsertChain` | 撤销 builder |
| 任意节点导入 | `StateProcessor` | 拒绝该块 |

出块侧准入有一个细节：普通交易按**声明的** gas limit 判断，必须满足 `tx.Gas() ≤ 剩余 − 闲置保底`；记账用实际 gasUsed [6]。另外，Go 的 fast node 跳过 lane 检查，Rust 不跳过 [6][8]。

```finding F8 high
# BEP-675 BidBlock 已在主网承担绝大多数区块；它的检查都在广播之后
结论: 官方数据：截至 2026-09-01 的三天窗口里，约 98% 的区块走 BidBlock，平均每块 gas 比旧路径多 28%。2026-10-09 的 RPC 采样里，120 个块全部带 BidBlock 标记，gas limit 全部是 70M。验证者封块前不执行交易；执行失败的 BidBlock 会先广播，再撤销 builder。
证据: [observed] 博客 [19]；主网 RPC 采样 [21]；`miner/bid_block.go:336-391`、BEP-675 [3]（J9、J11、J18、J19、P27）。[inferred] 违规块先签名后拒绝（P28）。
影响: 这是 Jenner 之前主网已经发生的变化。BEP-675 用“撤销 builder”换取更大区块，代价是偶发的无效块。
```

BEP-675 的加固都已合并，但除 #3773 外都没有进入 release [3][20]：

| PR | 合并 | 作用 |
|---|---|---|
| #3741 | 07-03 | 硬分叉激活块禁用 BidBlock |
| #3773 | 07-31 | 只 blind-sign legacy 类型的系统交易 |
| #3798 | 08-20 | 拒绝零 state root |
| #3796 | 08-31 | 撤销记录跨重启保存 |
| #3806 | 09-03 | 跨验证者坏块证据，N/2+1 撤销 |
| #3774 / #3810 | 08-31 / 09-02 | gRPC 提交，默认端口 8552 |

## N Payment Lane 与 Tempo：同类设计，倾向相反 {depth=2}
Tempo 的 payment lane 给**非支付**交易设一道 gas 上限 [13]。BSC 给**支付**交易设一道保底。两者的数学形状相同，都是“普通交易 ≤ 某个上限，且总量 ≤ gas limit”。Fig 7 用同样的比例画出两者。

```excalidraw q="同样是两道 gas 约束，BSC 和 Tempo 把区块空间分给了谁？" read="每条横条代表一个区块的 gas limit，宽度按比例画。蓝色是普通（非支付）交易能用的最大空间；绿色是支付交易能用的空间。" takeaway="BSC 是通用链，只给支付保底 5%；Tempo 是支付链，只给非支付留约 6%。" kind=约束形状对比
{"defaults": {"h": 56, "fontSize": 16},
 "nodes": [
   {"id": "bl", "label": "BSC", "x": 0, "y": 0, "w": 90, "color": "gray", "stroke": "dashed"},
   {"id": "bg", "label": "普通 + 支付共享：≤ 95%", "x": 110, "y": 0, "w": 570, "color": "blue"},
   {"id": "bp", "label": "支付保底", "x": 680, "y": 0, "w": 90, "color": "green"},
   {"id": "tl", "label": "Tempo", "x": 0, "y": 110, "w": 90, "color": "gray", "stroke": "dashed"},
   {"id": "tg", "label": "非支付", "x": 110, "y": 110, "w": 90, "color": "blue"},
   {"id": "tp", "label": "支付：其余全部（约 94%）", "x": 200, "y": 110, "w": 570, "color": "green"}
 ],
 "texts": [
   {"x": 110, "y": 70, "text": "普通交易用不到最右 5%（默认 ratio 500）", "fontSize": 14, "color": "gray"},
   {"x": 110, "y": 180, "text": "非支付最多 30M / 500M（T1 起固定，TIP-1010）", "fontSize": 14, "color": "gray"}
 ]}
```

| 维度 | BSC Payment Lane | Tempo payment lane |
|---|---|---|
| 约束 | 普通 ≤ G − Q，保底给支付 | 非支付 ≤ `general_gas_limit` |
| 参数在哪 | 父状态里的治理 ratio × G | 区块头字段，T1 起固定 30M |
| 支付识别 | 治理名单地址，或 BNB 转给无代码地址 | T5 起：TIP-1045 target + selector 白名单 |
| 读状态 | 是（父状态 + 实时状态） | 否，只看交易数据 |
| 手续费 | 不变（BNB，按小费竞价） | 稳定币付费 + Fee AMM |
| 主网 | 未激活 | T1 2026-02-12；T5 2026-06-09 |

```finding F9 high
# Payment Lane 与 Tempo 是同类设计，没有移植证据，倾向相反
结论: 两者都在共识层给一类交易加 gas 上限。区别有三点：Tempo 不读状态，参数是区块头字段，并且给非支付封顶约 6%；BSC 读两种状态，不改区块头，并且给支付保底 5%。BEP-703 全部 41 个修订和三个实现 PR 的评论里，“Tempo”都是 0 次出现。
证据: [observed] Tempo 规范 [13]；`tempo/crates/primitives/src/header.rs`、`hardfork/src/lib.rs`、`tips/tip-1045.md` [14]；搜索命令见复现（P38–P42、P44）。[inferred] “同类设计”由约束形状推出（P43）。
影响: 不能说 BSC 在变成 Tempo。BSC 只借用了“给一类交易留空间”的思路，没有改费用资产和区块结构。
```

外部调研里的两处 Tempo 描述已经过时：Tempo 主网自 T5（2026-06-09）起按 TIP-1045 的 selector 白名单识别支付，不再只看 TIP-20 地址前缀；sub-block 在 T4 停用，代码已于 2026-09-10 删除 [14]。

## O 其他开发方向 {depth=2}
### BEP-706：毫秒时间戳预编译

BSC 区块头里本来就有毫秒信息，但 `block.timestamp` 返回秒。0.45 秒出块时，相邻两三个块的秒数可能相同。BEP-706 在 `0x70` 加了一个预编译：固定 20 gas，返回 `Time × 1000 + 毫秒余数` [3]。`block.timestamp` 的语义不变。用途是 RFQ 报价截止、拍卖截止这类需要亚秒精度的合约逻辑。

### BEP-714：备用验证者等 1 秒

轮到的验证者掉线时，备用验证者要等一段时间才能出块。Lorentz 把这个初始等待从 1 秒提到 2 秒，BEP-714 把它改回 1 秒 [3]：

```annot
# 一个验证者掉线，影响 8 个块 | BEP-714 §4.1
旧：([0.45]{正常出块间隔} + [2]{!备用初始等待}) × 8 = 19.6 秒
新：(0.45 + [1]{改回 Lorentz 之前的默认值}) × 8 = 11.6 秒
> 正常出块间隔不变。9-11 的首版还改 turnLength 和惩罚阈值，9-15 缩减为只改等待时间。
```

### 0x68 双签证据按字节计价

Jenner 还把 `0x68` 双签证据预编译的价格改成 `10000 + 16 × 输入字节数`，防止超大 header 用固定价格换取无上限的哈希计算 [5]。这项改动绑定 Jenner，但 BEP-718 和官方公告都没有列出。

### 执行引擎回归上游

v1.8.0-alpha（2026-08-13，预览版，不用于生产）合并了 geth v1.17.3，同时删掉了三项 BSC 自研功能 [20]：
- opcode 级优化（superinstruction）
- incremental snapshot
- multidb

BEP-592 被 EIP-7928 Block Access List 的上游代码替换。一组 Amsterdam EIP 进入代码，但在 BSC 上未激活。主网生产版本 v1.7.7 / v1.7.8 不含这些改动。#3808 修复了 v1.8 代码线的一个问题：同伴节点可以给已签名的块附加新 header 字段，改变块哈希而签名仍有效 [7]。

```finding F10 medium
# BSC 客户端在向上游 geth 收敛，自研的执行与存储优化被移除
结论: superinstruction、incr snapshot、multidb 在 2026 年 6–7 月被删除，BEP-592 让位于上游 BAL。删除 BEP-592 的 PR 理由写的是 “decide to follow upstream”。2025-12 的路线图还把 superinstruction 和 Scalable DB 列为成果。
证据: [observed] v1.8.0-alpha release notes、PR #3759 / #3768 / #3716 / #3690 [7][20]；路线图 [22]（J26、J27）。[inferred] “收敛而不是分叉”由以上推出（J28）。
影响: 跟踪 BSC 性能改进时，看上游 geth 和 reth-bsc，不要再看 superinstruction 这条线。
```

### reth-bsc：双客户端

reth-bsc 的流程是 Go 先实现，Rust 移植 [8]。CAS20 的 Rust 版回放 Go 录下的 145 次调用，逐步比对返回值、gas、退款、事件和最终 state root。最新 release 是 v0.1.2（2026-08-20），Jenner 相关代码都还没有发布。v0.1.2 修了一个状态根错误：它曾在内部测试网 QANet 的 Pasteur 切换点导致集群分裂。仓库 README 仍写“作为验证者运行：尚未支持”，没有证据表明主网验证者在运行 reth-bsc。

### BAP-710：PropAMM Relayer（应用层提案）

BAP-710 于 2026-10-08 合并进 BEPs 仓库，类型是 Application，不改共识 [4]。[[PropAMM]] 是做市商自己定价的池子：价格来自链下高频报价，不来自链上曲线。

**它要解决的问题**。BAP §3.1 的说法是：做市商要把报价带上链，需要解决三件事 [4]：
1. 低成本地发布报价；
2. 保证 taker 按模拟时看到的报价成交；
3. 有可靠的上链路径。

今天在 BSC 上，每个做市商要为每个 builder 各做一遍。每个 taker 还要逐个对接每个做市商的合约和报价格式。BAP 把现有做法按“复杂度压在谁身上”做了对比 [4]：

| 现有做法 | 复杂度在谁身上 |
|---|---|
| Solana PropAMM | 做市商：自建上链管道，每家重复 |
| Base PropAMM | 做市商付 gas：每次更新都上链；模拟与成交之间状态会变 |
| Titan | taker：订阅单一 builder 的 state override 流，自己组 bundle |
| BAP-710 | 共享的 relayer 承担组包、分发、builder 适配 |

**两组多对多，由两个部件分别消除** [4]：

| 多对多 | 谁来消除 |
|---|---|
| 做市商 × builder | relayer：做市商只推一条 `pamm_sendQuoteUpdateV1` 流 |
| taker × 做市商的格式 | 链上标准：统一的 registry + `IPropAMM` 池子接口 |

**各角色要做什么** [4]：

| 角色 | 集成工作 |
|---|---|
| 做市商 | 推一条报价流；池子实现 `IPropAMM`，从 registry 读报价 |
| 钱包 | 只换 RPC 地址，交易模型不变 |
| 聚合器 / solver | 现有适配器加 `IPropAMM`，`eth_call` 发给 relayer |
| builder | 不改代码，只执行原子 bundle |

聚合器有一条硬约束：只能把 PropAMM 路由返回给“交易会发到 relayer”的钱包。交易只发到公开 RPC，会因缺少报价更新而 revert；后果是失败，不丢资金 [4]。

Fig 8 是一笔成交的流程。

```uml q="做市商的链下报价怎样和 taker 的普通交易一起上链？" read="源自 BAP-710 §4。relayer 是兼容 geth 的 RPC 端点；builder 只执行原子 bundle，没有 PropAMM 专用代码。" takeaway="报价不上链，直到有 taker 交易读到它；匹配依据是“报价写集 ∩ taker 读集”。"
sequenceDiagram
  autonumber
  participant M as 做市商
  participant R as Relayer
  participant T as Taker
  participant B as Builders
  M->>R: pamm_sendQuoteUpdateV1（报价交易）
  R->>R: 模拟，记下写集，放入覆盖层
  T->>R: eth_call（链上状态 + 可见报价）
  R-->>T: 报价结果
  T->>R: eth_sendRawTransaction
  R->>R: 模拟得到读集，与报价写集求交
  alt 匹配到报价
    R->>B: 原子 bundle：报价更新…，taker 交易
  else 没有匹配或模拟失败
    Note over R: 交易转入普通交易池
  end
```

链上的报价 registry **不检查过期**：relayer 和 builder 按截止时间丢弃过期报价。需要链上保护的池子，要在 `quote` / `swap` 里自己检查新鲜度 [4]。registry 里的 “lane” 指一份报价状态，与 Payment Lane 无关。

relayer 是许可制的运营方：做市商和 taker 在它的控制台申请角色，管理员批准后发 API key；做市商可以只让指定 taker 看到报价 [4]。BAP 自己把“多 relayer 互通”列为应对单一运营方的长期办法。截至 2026-10-09，本文没有查到正在运营的 relayer。

```finding F13 high
# relayer 的核心是即时上链，不只是把集成工作集中起来
结论: 报价平时不上链。某笔 taker 交易读到某个报价时，relayer 才把两者打成原子 bundle 发给所有 builder。这样，无人使用的报价不花 gas，模拟与成交之间也没有状态差。做市商 × builder 的重复由 relayer 消除；聚合器 × 做市商的格式差异由 `IPropAMM` 接口消除。
证据: [observed] BAP-710 §3.1、§3.2、§4.5.4、§5.2 [4]（J43–J48）。[inferred] “核心是即时上链”由以上推出（J50）。
影响: 聚合器接 PropAMM 的成本接近接一个 PancakeSwap 池子，但必须判断用户钱包是否走 relayer。
```

### 与 Flashbots PUR（ERC-8324）的关系

[[PUR]]（Priority Update Registry）是 Flashbots 在以太坊上做的共享合约，参考实现在 `flashbots/priority-update-registry` [24]。它已提交为 ERC-8324 草案（ethereum/ERCs PR #1852，2026-07-03 创建，未合并），并部署在以太坊主网 [25]。

PUR 的思路有三点 [24]：
- 做市商的“优先更新”交易只能写 PUR 自身的 storage。因此 builder 不用模拟，也能知道它改了什么。
- builder 把更新插在读取它的用户交易之前。
- 没被读到的更新不上链。

BAP-710 的链上 registry 和 PUR 同名同构，见下表 [4][24]：
- 接口都叫 `IPrioUpdateRegistry`，方法名相同：`updateState` / `getState` / `addUpdater` / `isUpdater`。
- 存储布局相同：每个 lane 最多 255 个 word，基址公式也相同。
- BAP 的命名空间串是 `PrioUpdateRegistryV2.lane.v1`。
- BAP §5.2 写道：“早期 registry 草案自己验证签名（`batchUpdateStateWithSignature`）”。这个函数名正是 PUR 的接口。

BAP-710 正文没有提到 Flashbots 或 ERC-8324。

| 维度 | Flashbots PUR | BAP-710 |
|---|---|---|
| 存储 | lane ≤ 255 word，base = keccak(ns, target, lane) + i | 相同（命名空间 V2） |
| 新鲜度 | uint32 时间戳；registry 检查读写时间窗 | 48 位递增 seq；registry 不查过期 |
| 签名 | 内置；时间窗内可重放 | 移到 decoder lane；seq 防重放 |
| 谁插入更新 | 每个 builder 维护更新池，插在读取交易前 | relayer 匹配读写集、组 bundle；builder 不改 |
| 标准化 | ERC-8324 草案，主网已部署 | BAP Draft，未见部署 |

```finding F14 high
# 和 PUR 作用相同的是 BAP-710 的链上 registry，不是 relayer
结论: BAP-710 的 registry 是 PUR 的改版：接口和存储布局同名同构，新鲜度从时间戳改成递增 seq，签名移到 decoder。relayer 是 BSC 在 PUR 之外加的一层：PUR 要求每个 builder 自己插入更新，BAP-710 把这件事集中到一个对所有 builder 中立的 relayer。
证据: [observed] PUR README 与合约 [24]；ERC-8324 PR [25]；BAP-710 §4.2、§5.2 [4]（J51–J56）。[inferred] “registry 是 PUR 改版，relayer 是新加的一层”（J57）。
影响: 熟悉 PUR 的做市商，迁移到 BSC 时池子读报价的方式基本不变。要改的是新鲜度检查（时间戳改 seq）和提交路径（发给 relayer，不发给 builder）。
```

## P 进度与方向 {depth=2}
| 功能 | 规范 | Go（合并） | Rust（合并） |
|---|---|---|---|
| CAS20 / BEP-702 | Draft；#716 未合并 | #3813（09-11） | #512（09-24） |
| Payment Lane / BEP-703 | Draft | #3793（09-11） | #497（09-23） |
| BEP-706 | Draft | #3792（08-18） | #480（09-02） |
| BEP-714 | Draft | #3822（09-15） | #510（09-23） |
| 0x68 计价 | 无 BEP | #3772（09-08） | #498（09-10） |
| BEP-675 主体 | Draft | #3691（06-17） | #415（08-18） |
| BAP-710 | Draft（10-08） | 链下组件 | — |

激活状态 [16][20]：
- Go 客户端里主网和 Chapel 的 `JennerTime` 都是 `nil`。
- reth-bsc 只给内部 QANet 配了 2026-10-05 05:00 UTC。QANet 是否真的激活，本文没有查到运行证据（推测）。
- 官方计划：测试网 10 月下旬，主网 11 月下旬；release 版本未公布。

```finding F11 high
# Jenner 的所有功能都已合并、未发布、未激活
结论: CAS20、Payment Lane、BEP-706、BEP-714 的 Go 与 Rust 实现都已合并，但没有任何 bsc 或 reth-bsc 的 release 包含它们。激活后，CAS20 还要治理任命 admin、开启 feature；Payment Lane 还要治理添加名单。
证据: [observed] `params/config.go:256,311` [5]；`gh release list` [20]；`reth-bsc/src/hardforks/bsc.rs` [8]（J3、J17、J32、C29、P36、P37）。[inferred] 汇总判断（C30、S5）。
影响: 在 2026-11 下旬之前，主网用户不会遇到 CAS20 代币或 Payment Lane。
```

```finding F12 medium
# BSC 的方向：执行交给上游，差异化放在协议层的金融基础设施
结论: 同一时期，BSC 删除了自研执行优化。新增的都在协议层：原生资产、支付保底、builder 出块流水线、更大区块、毫秒时间与 PropAMM relayer。这些部件分属不同层，彼此没有自动连接。
证据: [inferred] 由 F2、F5、F8、F10 和进度表推出（S1、S2、S3）。
影响: 评估 BSC 的新功能时，逐层看接入条件：资产要 CAS20 开关，支付要进名单，报价要走 relayer，打包看 builder。
```

## Q 局限与开放问题 {depth=2}
- **没有激活后的数据**：两个核心功能都还没有在任何公开网络上运行。本文的机制描述来自规范和代码，没有实测。
- **CAS20 性能未知**：只有 reth-bsc 的本地微基准。BEP-702 要求的激活前整块对抗性计时测量，没有公开结果。
- **规范在变**：BEPs#716 未合并；BEP-703 状态仍是 Draft。激活前规则还可能改。
- **治理未知**：谁会成为 CAS20 的 ActivationRegistry admin？Payment Lane 首批名单何时提案？都没有公开信息。
- **推测项**（台账 speculative）：
  - BSC 开发者参照了 base-std 的 Solidity mock（C43）
  - Payment Lane 放弃动态模型的原因（P45）
  - QANet 已在 10-05 激活 Jenner（J5）
  - Jenner release 基于 v1.8 代码线（J40）
- **双客户端差异**：Go 的 fast node 跳过 lane 检查而 Rust 不跳过；Rust 的 BidBlock 系统交易检查是否限定 legacy 类型，没有核实。
- **采样很小**：主网 BidBlock 占比只采了 120 个块。
- **BAP-710 没有落地数据**：没有查到正在运营的 relayer，也没有做市商或聚合器接入的公开信息。

## R 方法与证据 {depth=3}
**方法**：本文是“代码库深挖”。三路并行调研，各自写分册和台账，再合并：
- **C 路**：CAS20 与 Base B20
- **P 路**：Payment Lane 与 Tempo
- **J 路**：其他方向与进度

每个论断都追到 BEP 原文、固定 commit 的源码、PR 或官方公告。外部调研只当线索。

**固定版本**：

| 仓库 | commit | 日期 |
|---|---|---|
| bnb-chain/bsc（develop） | `8cc60b2` | 2026-10-08 |
| bnb-chain/reth-bsc（develop） | `349f55c` | 2026-10-09 |
| bnb-chain/BEPs | `e9b2be3` | 2026-10-08 |
| base/base-std · base/base | `a2954a8` · `f1f40ba` | 2026-10-02 · 10-09 |
| tempoxyz/tempo | `feb5dff` | 2026-10-08 |

**外部调研的修正**：

| 外部调研的说法 | 实际情况 |
|---|---|
| Tempo 按 TIP-20 前缀识别支付 | no 过时：T5 起按 TIP-1045 白名单 |
| Tempo 要放在 sub-block 结构里看 | no 过时：sub-block 在 T4 停用 |
| `transferFrom` 先查 allowance | no 暂停最先，且顺序属于共识 |
| B20 “在向 ERC-8056 演进” | no 已随 Cobalt 于 09-30 上主网 |
| BEP-675 加固是“计划” | warn 已合并，未发布 |
| 98% 是 09-14 之前三天的数据 | warn 窗口截至 09-01 |
| gas limit 70M / 80M / 90M 是规划 | warn 70M 已上主网 |
| N + max(P,Q) ≤ G | ok 正确 |
| 57d98c2 改了 base-std / IB20 注释 | ok 正确，且不止这一个 commit |

**主会话抽查**：8 条 observed 论断重新打开源码或 RPC 核对，全部成立。抽查清单在 `research/notes.md`。

## S 复现 {depth=3}
需要 `git`、`gh`、`curl`、`python3`。

1. 固定版本，检查 Jenner 排期：

```bash
git clone --filter=blob:none -b develop \
  https://github.com/bnb-chain/bsc && cd bsc
git checkout 8cc60b246c8c99d46d51846765d35238112a1a5c
grep -n "JennerTime: " params/config.go
# 预期：256 / 311 / 368 行都是 JennerTime: nil
```

2. 查看 CAS20 开发 commit 里的 B20 痕迹：

```bash
gh api repos/bnb-chain/bsc/commits/57d98c2 \
  --jq '.files[].patch' | grep -E '^[-+].*(IB20|base-std|reference)'
# 预期：出现 base-std's published value、IB20、
#       the reference implementation's prefix
```

3. 查看 Payment Lane 分类函数：

```bash
sed -n 34,58p core/paymentlane/classify.go
# 预期：系统交易 → to==nil → type → listed → value → code
```

4. 主网区块的 gas limit 与 BidBlock 标记：

```bash
curl -s -X POST -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,
  "method":"eth_getBlockByNumber","params":["latest",false]}' \
  https://bsc-dataseed.bnbchain.org | python3 -c \
  'import json,sys;b=json.load(sys.stdin)["result"];
print(int(b["gasLimit"],16), b["requestsHash"][24:26])'
# 预期：70000000 02（requestsHash 第 11 字节 = 版本，2 = BidBlock）
```

5. 确认 Tempo 的 `general_gas_limit` 是区块头字段：

```bash
git clone --filter=blob:none https://github.com/tempoxyz/tempo
cd tempo && git checkout feb5dff7dac707d594cc326f0dd5d242180323bf
grep -n "general_gas_limit: u64" crates/primitives/src/header.rs
grep -n "GENERAL_GAS_LIMIT" crates/hardfork/src/constants.rs
# 预期：header 结构体字段；TEMPO_T1_GENERAL_GAS_LIMIT = 30_000_000
```

## T 术语表 {depth=2}
```glossary
Parlia | BSC 共识 | BSC 的 PoSA 共识：一组验证者轮流出块，连续出若干块后换人。 | 不是以太坊的 Gasper
builder | 组块者 | 把交易组成块或 bid 交给验证者的一方，赚取 MEV 收益。 | 不是验证者
Jenner | Jenner 硬分叉 | BSC 下一次硬分叉，包含 BEP-702、703、706、714，由 BEP-718 汇总。 | 不是 Pasteur（已上线）
GovHub | 治理中枢 | BSC 系统合约 `0x…1007`。治理提案只能以它为目标，由它转发参数修改。
stateful precompile | 有状态预编译 | 能读写状态、知道调用者、能发事件的原生代码合约。 | 普通预编译不碰状态
RWA | 现实世界资产 | 代币化的证券、基金份额等链下资产。
B20 | Base 原生代币 | Base 在 Beryl 升级上线的原生代币标准，Rust precompile 实现。 | 不是 BEP-20
CAS20 | 合规资产标准 | BEP-702 定义的 BSC 原生代币标准，地址前缀 0xCA52。 | 不是新的 ERC 编号
ActivationRegistry | 激活注册表 | `0x7020…01`，保存 CAS20 的 admin 和三个 feature 开关。
PolicyRegistry | 策略注册表 | `0x7020…02`，保存共享的黑白名单和组合策略。
Payment Lane | 支付保底 | BEP-703：每块给支付交易保底一定比例的 gas。 | 不是独立的执行通道
quota | 保底配额 | Payment Lane 的 Q = ratio × G / 10000，ratio 读父区块状态。
BidBlock | 整块 bid | BEP-675：builder 提交已执行的整块，验证者封块前不重放。 | SendBid 只提交交易列表
QANet | 内部测试网 | BNB Chain 的内部 QA 网络，不是公开测试网 Chapel。
PropAMM | 专有 AMM | 做市商自己定价的池子，价格来自链下高频报价，不来自链上曲线。 | 不是普通 AMM
PUR | 优先更新注册表 | Flashbots 的 Priority Update Registry（ERC-8324 草案）：只能写自身 storage 的共享合约，用来承载 builder 优先插入的报价更新。 | 不是 Payment Lane
```

## U 参考资料 {depth=2}
1. [BEP-702 @e9b2be3](https://github.com/bnb-chain/BEPs/blob/e9b2be3b0021c9407376351d8f57ef9b90db5185/BEPs/BEP-702.md) — CAS20 规范：地址、调用约束、检查顺序、计费、激活、存储布局。**PRIMARY**
2. [BEP-703 @e9b2be3](https://github.com/bnb-chain/BEPs/blob/e9b2be3b0021c9407376351d8f57ef9b90db5185/BEPs/BEP-703.md) 与 [PR #703](https://github.com/bnb-chain/BEPs/pull/703) — Payment Lane 规范与 41 个草案修订。**PRIMARY**
3. [BEP-675](https://github.com/bnb-chain/BEPs/blob/e9b2be3b0021c9407376351d8f57ef9b90db5185/BEPs/BEP-675.md)、[BEP-706](https://github.com/bnb-chain/BEPs/blob/e9b2be3b0021c9407376351d8f57ef9b90db5185/BEPs/BEP-706.md)、[BEP-714](https://github.com/bnb-chain/BEPs/blob/e9b2be3b0021c9407376351d8f57ef9b90db5185/BEPs/BEP-714.md)、[BEP-718](https://github.com/bnb-chain/BEPs/blob/e9b2be3b0021c9407376351d8f57ef9b90db5185/BEPs/BEP-718.md) — BidBlock、毫秒时间、backoff、Jenner 清单。**PRIMARY**
4. [BAP-710](https://github.com/bnb-chain/BEPs/blob/e9b2be3b0021c9407376351d8f57ef9b90db5185/BAPs/BAP-710.md) — PropAMM Relayer 的流程与 registry。**PRIMARY**
5. [bsc `core/vm` @8cc60b2](https://github.com/bnb-chain/bsc/tree/8cc60b246c8c99d46d51846765d35238112a1a5c/core/vm) — `contracts_stateful.go`、`evm.go`、`cas20*.go`、`contracts.go`；`params/config.go`。**PRIMARY**
6. [bsc `core/paymentlane` @8cc60b2](https://github.com/bnb-chain/bsc/tree/8cc60b246c8c99d46d51846765d35238112a1a5c/core/paymentlane) — 分类、配额、准入；`core/payment_lane.go`、`state_processor.go`、`miner/`。**PRIMARY**
7. bsc PR [#3813](https://github.com/bnb-chain/bsc/pull/3813)、[#3826](https://github.com/bnb-chain/bsc/pull/3826)、[#3829](https://github.com/bnb-chain/bsc/pull/3829)、[#3793](https://github.com/bnb-chain/bsc/pull/3793)、[#3806](https://github.com/bnb-chain/bsc/pull/3806) 与 commit [57d98c2](https://github.com/bnb-chain/bsc/commit/57d98c2) — 合并时间、改动理由、B20 痕迹。**PRIMARY**
8. [reth-bsc @349f55c](https://github.com/bnb-chain/reth-bsc/tree/349f55c4a3a79a15e57357d0d316ffc0abd181ba) 与 PR [#512](https://github.com/bnb-chain/reth-bsc/pull/512)、[#497](https://github.com/bnb-chain/reth-bsc/pull/497)、[#531](https://github.com/bnb-chain/reth-bsc/pull/531)、[v0.1.2](https://github.com/bnb-chain/reth-bsc/releases/tag/v0.1.2) — Rust 移植、golden 回放、QANet 排期。**PRIMARY**
9. [BEPs#716](https://github.com/bnb-chain/BEPs/pull/716) — BEP-702 修订，截至 2026-10-09 未合并。**PRIMARY**
10. [base-std @a2954a8](https://github.com/base/base-std/tree/a2954a8d576fd1ccfc8dceed8801c555280662f8) — B20 接口、常量、CHANGELOG。**PRIMARY**
11. [base `crates/common/precompiles` @f1f40ba](https://github.com/base/base/tree/f1f40baf238a717cbc1ecfa13b04f1644f625ade/crates/common/precompiles) — B20 的 Rust 实现。**PRIMARY**
12. [Base 文档：B20](https://docs.base.org/upgrades/beryl/b20) 与 [Upgrades](https://docs.base.org/upgrades/overview) — B20 定位与 Beryl / Cobalt 时间。**PRIMARY**
13. [Tempo：Payment Lane Specification](https://docs.tempo.xyz/protocol/blockspace/payment-lane-specification) 与 [Blockspace overview](https://docs.tempo.xyz/protocol/blockspace/overview) — 约束与区块头字段。**PRIMARY**
14. [tempo @feb5dff](https://github.com/tempoxyz/tempo/tree/feb5dff7dac707d594cc326f0dd5d242180323bf) — `header.rs`、`block.rs`、`envelope.rs`、TIP-1010 / 1045 / 1046、主网 chainspec。**PRIMARY**
15. [bsc-genesis-contract `PaymentLane.sol` @2620fb4](https://github.com/bnb-chain/bsc-genesis-contract/blob/2620fb411b0c950dd0abfc4e75fe13393a82c632/contracts/PaymentLane.sol) — 治理接口、默认 500、上限 1000。**PRIMARY**
16. [Jenner Hardfork (BSC)](https://docs.bnbchain.org/announce/jenner-bsc/) — 范围与时间表。**PRIMARY**
17. [Pasteur Hardfork (BSC)](https://docs.bnbchain.org/announce/pasteur-bsc/) — Pasteur 时间与内容。**PRIMARY**
18. [BSC Payment Lane 博客（2026-09-01）](https://www.bnbchain.org/en/blog/bsc-payment-lane-reserved-blockspace-that-keeps-payments-moving) — 当时对外描述的动态方案。**PRIMARY**
19. [Post-Pasteur 博客（2026-09-14）](https://www.bnbchain.org/en/blog/post-pasteur-hard-fork-bsc-packs-28-more-gas-per-block-with-more-scale-ahead) — 98% / +28% 与 gas limit 路线（项目方口径）。**PRIMARY**
20. [bsc releases](https://github.com/bnb-chain/bsc/releases) — v1.7.7、v1.7.8、v1.8.0-alpha 的内容与日期。**PRIMARY**
21. BSC 主网 RPC `bsc-dataseed.bnbchain.org`（2026-10-09 采样）— gas limit 与 BidBlock 标记。**PRIMARY**
22. [BNB Chain Tech Roadmap 2026](https://www.bnbchain.org/en/blog/tech-roadmap-2026) — 背景。
23. ChatGPT Deep Research：`research/bsc-development-research.md` — 外部调研，只作线索。
24. [flashbots/priority-update-registry @8701e8e](https://github.com/flashbots/priority-update-registry/tree/8701e8e13d74beef9126c3e1fbbe89c64ce0c0f6) — PUR 参考实现：接口、存储布局、builder 集成、主网部署。**PRIMARY**
25. [ethereum/ERCs PR #1852](https://github.com/ethereum/ERCs/pull/1852) — ERC-8324 “Priority Update Registry” 草案，2026-07-03 创建，未合并。**PRIMARY**

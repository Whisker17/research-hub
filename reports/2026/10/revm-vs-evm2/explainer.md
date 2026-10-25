---
template: research
title: EVM 执行引擎工程调研：revm、evm2 与 Mantle 的执行层选择
subtitle: evm2 的真实优势在解释器热路径，公开实测只有 1.10–1.19 倍；reth main 已切换，但还没发布。Mantle 应先补齐 revm 栈的版本、差分测试和基准，再跟随 OP 上游评估 evm2。
cols: 4
type: 工程调研 · 源码对比
audience: Mantle 的 devs / CTO：熟悉 EVM 与 Rust，需要决定执行层是否跟进 evm2
scope: revm（Mantle 用 38.0.0，main 43.0.3）与 evm2（main c8bb5a2）的源码对比；reth / Base / RISE / MegaETH / Foundry / Tempo 的公开状态；geth / evmone / Nethermind / Besu / ethrex / revmc 的热路径；Mantle revm 栈的缺口
evidence: 176 条论断台账（observed 141 / inferred 24 / speculative 11）；源码 revm@ee9ab3f、v107@d629331、evm2@c8bb5a2、mantle-xyz/revm@835cb4e、mantle-xyz/reth@574e7f3；官方 PR 与 release notes
date: 2026-10-25 · v1
---
结论先行：evm2 不是新的 EVM 语义，而是 revm 的重新实现。它的收益集中在解释器热路径。具体是三点：编译期选定 [[dispatch]] 后端；按类型、spec 和 inspect 模式生成编译期指令表；pc、栈长度、剩余 gas 留在寄存器里（[F1](#F1)、[F2](#F2)）。唯一公开的正面对比是 10 个主网区块回放快 1.10–1.19 倍，README 的“up to 2x”没有公开数据（[F3](#F3)）。

业界动态比原始资料更快：reth main 已在 2026-10-24 用 evm2 整体替换 revm，但还没有发布版本（[F9](#F9)）。Base 只在并行开发和[[差分测试]]（[F11](#F11)）。RISE 是把 revm 下游化成自有 VM，不是“降级 revm 版本”（[F12](#F12)）。

对 Mantle 的判断：现在不迁移共识路径。先做三件事：op-geth↔op-revm 差分回放、让 revm fork 的 CI 恢复为绿、追平落后 5 个主版本的 revm（[F15](#F15)–[F18](#F18)，[行动](#panel-O)）。

## A revm 与 evm2：工程对比总表 {sheet span=4 meta="源码 @ 2026-10-25"}
| 维度 | revm（Mantle 38.0.0 / main 43.0.3） | evm2（main c8bb5a2） | 判断 |
|---|---|---|---|
| 定位与成熟度 | semver 发布，约每月一个主版本；Reth 发布版、Foundry、OP 上游在用 | revm 的重新实现；WIP，无 release，不承诺 API 稳定 | ok revm 更稳 |
| 解释器分派 | 中心循环 + 函数指针表；pc / 栈长度 / gas 存在 `&mut Interpreter` | 编译期选后端：nightly 用 TCO，stable 64 位用 packed；三个值在寄存器 | ok evm2 更快 |
| 指令表与 spec | 运行时 `Box` 表，handler 内运行时检查 spec | 按类型、spec、inspect 模式生成 `const` 表，未激活的 opcode 指向 INVALID | ok evm2 更快 |
| 组件边界 | Context / DB / Inspector / 预编译全部泛型单态化 | 只有类型族与指令表编译期化；DB / 预编译 / Inspector / tx handler 是 `dyn` | warn 取舍不同 |
| 自定义 host | 可替换 Context 与 Handler | 源码 TODO：自定义 host 尚不支持 | warn revm 更灵活 |
| BAL / 异步 DB | v107 已有 BAL；main（v116）有 fiber 异步 | 同样有，机制相同 | warn 持平 |
| JIT / AOT | revmc 独立维护，从未进入 reth 发布版 | 同仓 `crates/jit`（revmc 移植），默认关闭，只支持 `BaseEvmTypes` | warn 都是实验性 |
| 公开实测 | 基线 | 10 个主网区块回放：TCO 1.19×，packed 1.10×（对 revm 42.0.1） | warn 远低于 2× |
| 采用 | OP 上游、MegaETH、RISE pevm、Base 节点仍在用 | reth main 已切换；Foundry draft、Tempo PR、Base 差分中 | warn 迁移刚开始 |

## B 关键数字 {sheet span=2 meta="均有出处"}
| 指标 | 数值 | 出处 |
|---|---|---|
| evm2 对 revm 的唯一公开对比 | 1.10×（packed）/ 1.19×（TCO） | evm2#384，Ryzen 9 7950X |
| README“up to 2x” | 无公开数据 | evm2#136 |
| 单项优化在回放中的稀释 | 基准快 23–34% → 回放快 4.8–6.2% | evm2#667 |
| reth 切换 evm2 | 221 个文件，+17.7k / −10.9k | reth#25002，2026-10-24 |
| Mantle revm 落后 | 38.0.0 → 43.0.3，5 个主版本 | mantle-xyz/reth Cargo.lock |
| revm 主版本节奏 | 约 1.35 次 / 月 | revm tags 2025-03 → 2026-08 |
| RISE 的“2×” | payload p95 均值 248 → 123 ms | hai_rise 推文配图 |

## C 谁在迁移、迁到哪一步 {sheet span=2 meta="公开证据"}
| 项目 | 状态 |
|---|---|
| reth | ok main 已用 evm2 替换 revm；最新发布 v2.8.1 仍是 revm |
| Foundry / Tempo | warn 迁移 PR：draft / 待审 |
| Base | warn evm2 crate 未接入节点，只做差分 |
| RISE | no 自有闭源 RISE VM；不是 evm2 |
| MegaETH | warn 公开代码仍是 revm 40.0.3；有原型信号 |
| OP 上游 | no 仍在 revm 43 + op-revm 20 |

## D Mantle 的 revm 栈现状 {sheet span=2 meta="mantle-xyz/* @ 2026-10"}
```tree list
mantle-xyz/revm `v107-mantle-arsia.2` | revm 38.0.0 / op-revm 19.0.0
  用在 mantle reth 执行客户端 | reth 基线 v2.2.0，alloy-evm 0.34
  用在 OP Succinct（SP1）证明路径 | 与 reth 锁同一个 tag
  Mantle 语义写在 op-revm handler | 约 5.7k 行，BVM_ETH / token_ratio / Arsia 费用
  4 处核心 crate 补丁 | 其中 EIP-7825 补丁让 EEST 失败
op-geth（Go，geth 1.17.3） | 官方文档中的 sequencer 执行层
上游现状 | revm 43、op-revm 20 已迁到 optimism 仓库
```

## E 结论 {sheet span=2}
```callout ok 先补齐 revm 栈，再按 OP 上游节奏评估 evm2
- evm2 的优势是真的。量级是解释器回放快 1.1–1.2 倍，不是节点快 2 倍。
- 共识路径的迁移成本在语义和类型，不在 trait 外壳；reth 用了 221 个文件整体替换。
- Mantle 的 P0 是 op-geth↔op-revm 差分门禁、fork CI 恢复为绿、版本追平。
- evm2 的入口：先把 Mantle 语义整理成与 VM 无关的测试向量。
```

## G 如何阅读 {depth=1}
```callout info 默认你已知道（本文不解释）
- EVM 字节码、操作数栈、gas 计费与 CALL 帧
- Rust 的 trait、泛型单态化与 `dyn` trait object
- OP Stack 的 deposit 交易与 L1 data fee
- Mantle 用 OP Succinct（SP1）生成有效性证明
```
- **5 分钟**：读总览 A–E，再读 [F1](#F1)、[F9](#F9)、[F15](#F15)。
- **30 分钟**：读 [Context](#panel-H) → [前置知识](#panel-I) → [热路径怎么工作](#panel-J) → [逐项拆解](#panel-K) → [业界动态](#panel-L) → [Mantle 现状](#panel-N) → [行动](#panel-O)。
- **完整**：再读 [方法与证据](#panel-Q)、[复现](#panel-R)。每条论断的出处在 `research/ledger.md`。

## H Context：为什么现在讨论换 EVM {depth=2}
**触发事件**：
- 2026-10-25，gakonst 发推：一个新 EVM “just wrapped audit”、内置 JIT，将成为 Foundry、Reth、Tempo 的未来 [7]。
- 前一天，reth main 合入“refactor!: replace revm with evm2” [6]。
- Base 仓库引入了 evm2；RISE 宣布自有 VM 比 revm 快 2 倍。

**要回答的问题**：
1. evm2 相对 revm 的每个优化点是什么，证据在哪一行代码？
2. revm 的问题和限制，哪些是设计取舍，哪些 revm 自己能修？
3. Base / RISE / MegaETH 的真实状态是什么？
4. 其他主流 EVM 实现怎么优化热路径？
5. Mantle 的 revm 栈缺什么，按什么顺序补？

**范围与非目标**：
- 包括：revm 与 evm2 的架构和源码；采用动态；其他 EVM 实现的热路径；Mantle 执行层改进点。
- 不包括：P2P、同步、数据库选型的深入对比；非 EVM 虚拟机；对 Mantle 之外公司的建议。

**判断标准**（先于结论定下）：
- 收益必须有可复现的测试条件。没有条件的数字只记录，不采用。
- 区分“解释器收益”和“节点收益”。
- 区分“evm2 独有”和“新版 revm 也有”。
- 共识路径看等价性风险，非共识路径看收益。

## I 前置知识 {depth=2}
运行示例：一条 `ADD`。它只做“弹出两个字、压入一个和”，本身只需几条机器指令。下文用它说明：其余开销来自哪里，evm2 省掉了哪些。

```excalidraw q="理解本文需要哪些概念？按什么顺序学？" read="灰色虚线框是默认已知；蓝框是卡片编号；箭头表示先学 → 后学；绿框是本文要做的判断。" takeaway="先读 B-1 和 B-2：热路径和框架边界是 revm 与 evm2 差别的两条主线。" name=prereq-map kind=前置知识地图
{"grid": {"w": 330, "h": 120}, "defaults": {"w": 210, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "k1", "label": "EVM 字节码与 gas", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "k2", "label": "Rust 泛型与 dyn", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b1", "label": "B-1 解释器分派", "col": 1, "row": 0, "color": "blue"},
   {"id": "b4", "label": "B-4 JIT / AOT", "col": 1, "row": 1, "color": "blue"},
   {"id": "b2", "label": "B-2 revm 框架", "col": 1, "row": 2, "color": "blue"},
   {"id": "b3", "label": "B-3 op-revm 与 L2 定制", "col": 1, "row": 3, "color": "blue"},
   {"id": "b5", "label": "B-5 BAL（EIP-7928）", "col": 0, "row": 3, "color": "blue"},
   {"id": "s", "label": "revm 还是 evm2？", "col": 2, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "k1", "to": "b1"}, {"from": "b1", "to": "b4"}, {"from": "k2", "to": "b2"},
   {"from": "b2", "to": "b3"}, {"from": "b1", "to": "s"}, {"from": "b4", "to": "s"},
   {"from": "b3", "to": "s"}, {"from": "b5", "to": "b3", "dashed": true}
 ]}
```

```prereq B-1 l1 4min
# 解释器分派（dispatch）
what: 解释器读一个 opcode，找到对应的 handler 函数，再调用它。“怎么找、怎么调”就是分派方式。
why: `ADD` 本身很便宜，每条 opcode 的分派开销会被重复上亿次。evm2 的主要收益就在这里。
example: revm：`loop { op = code[pc]; table[op](&mut interp) }`。TCO：每个 handler 末尾直接跳到下一个 handler，不回循环。
misconception: 误解：分派快 2 倍，节点就快 2 倍。事实：区块回放还包括状态读、预编译和 keccak，收益会被稀释。
deeper: alloy-rs/evm2 `crates/evm2/src/interpreter/dispatch/`
```

```prereq B-2 l1 4min
# revm 的框架结构
what: `Evm` 由 Context（Tx / Block / Cfg / Journal / DB）、指令表、预编译、Inspector 组成。`Handler` 按 validate → pre_execution → execution → post_execution 跑一笔交易。
why: L2 定制都挂在这些扩展点上。迁移到 evm2 的成本主要在这里，不在 opcode。
example: `Context<BlockEnv, TxEnv, CfgEnv, DB, Journal<DB>, Chain>`；状态变更留在 Journal，`finalize()` 取出。
misconception: 误解：revm 靠运行时判断。事实：revm 的组件全是泛型，编译期单态化。
deeper: bluealloy/revm `crates/handler/src/handler.rs`
needs: B-1
```

```prereq B-3 l1 3min
# op-revm 与 L2 定制
what: op-revm 在 revm 上覆写 8 个 Handler 方法，加入 deposit、L1 fee、operator fee 和 system tx 规则。
why: Mantle 的 BVM_ETH、token_ratio、Arsia 费用都写在 op-revm 的 fork 里，fork 维护成本决定升级和迁移难度。
example: `OpTransaction { base, enveloped_tx, deposit }`；`reward_beneficiary` 向 3 个 vault 分账。
misconception: 误解：op-revm 还在 revm 仓库。事实：revm v108 起已迁到 ethereum-optimism/optimism。
deeper: bluealloy/revm v107 `crates/op-revm/src/handler.rs`
needs: B-2
```

```prereq B-4 3min
# JIT / AOT
what: 把合约字节码编译成机器码再执行。JIT 在运行时编译热点代码；AOT 提前编译并缓存产物。
why: gakonst 推文说新 EVM “JIT baked in”。要分清它是“同仓可选”还是“默认开启”。
misconception: 误解：有 JIT 就默认更快。事实：evm2-jit 默认关闭，同一段代码 miss 8 次才在后台编译。
deeper: alloy-rs/evm2 `crates/jit/README.md`
needs: B-1
```

```prereq B-5 2min
# BAL（Block-Level Access List）
what: EIP-7928 让区块携带每笔交易读写了哪些状态。验证者据此并行执行交易，最后核对 BAL。
why: GPT 资料把 BAL 当成 evm2 的差异点。实际上 revm v107 就有同样的 API。
misconception: 误解：有 BAL 就有并行调度器。事实：evm2 和 revm 都只提供读写原语，调度要自己写。
deeper: EIP-7928（Last Call，截止 2026-11-01）
```

## J 热路径怎么工作：一条 ADD 在两边的路径 {depth=2}
先看示意图，再看代码。图上半部分是 revm，下半部分是 evm2 的 TCO 后端。

```excalidraw q="执行一条 ADD 时，revm 和 evm2 各在 opcode 之外做了什么？" read="上一行是 revm：每条 opcode 都回到中心循环，并经内存读写 pc / gas / 栈长度（红框）。下一行是 evm2 TCO：值在寄存器里，handler 直接尾跳到下一个 handler（绿框）。简化图，省略了 Inspector 路径。" takeaway="evm2 省掉的不是 ADD 本身，而是每条 opcode 外面那一圈固定开销。" kind=热路径对比
{"grid": {"w": 410, "h": 150}, "defaults": {"w": 230, "h": 72, "fontSize": 16},
 "nodes": [
   {"id": "r1", "label": "run_plain 循环\n读 opcode，pc += 1", "col": 0, "row": 0, "color": "blue"},
   {"id": "r2", "label": "查 fn 表 + gas 表\n扣 gas（内存）", "col": 1, "row": 0, "color": "red"},
   {"id": "r3", "label": "handler(&mut Interpreter)\n读写栈长度，检查 spec", "col": 2, "row": 0, "color": "red"},
   {"id": "e1", "label": "dispatch::<ADD>\n(pc, stack, gas) 在寄存器", "col": 0, "row": 1, "color": "green"},
   {"id": "e2", "label": "编译期常量\nstatic gas，无 spec 检查", "col": 1, "row": 1, "color": "green"},
   {"id": "e3", "label": "become\n下一条 opcode 的 handler", "col": 2, "row": 1, "color": "green"}
 ],
 "edges": [
   {"from": "r1", "to": "r2", "label": "每条 opcode"},
   {"from": "r2", "to": "r3", "label": "间接 call"},
   {"from": "e1", "to": "e2", "label": "扣 gas"},
   {"from": "e2", "to": "e3", "label": "尾跳"}
 ],
 "texts": [
   {"x": 830, "y": 100, "text": "ret + Result → 回循环", "fontSize": 14, "color": "red"}
 ]}
```

revm main 的单步（Mantle 用的 v107 结构相同，但 gas 和函数指针放在同一个结构里 [2]）：

```rust src=research/code/revm@ee9ab3f--interpreter.rs lines=295-321 hl=302,307,309,310,317
```

每条 opcode 都要：读 opcode、写回 pc、查两张表、扣 gas、构造 `InstructionContext`、做一次间接调用。handler 拿到的是 `&mut Interpreter`，所以编译器无法把 pc、栈长度、gas 跨过这次调用留在寄存器里（台账 H3，推断）。

evm2 的 TCO 后端（nightly rustc）：每个 opcode 一个以 `const OP` 单态化的函数，末尾直接尾跳。

```rust src=research/code/evm2@c8bb5a2--dispatch-tco.rs lines=43-56
```

```rust src=research/code/evm2@c8bb5a2--dispatch-tco.rs lines=96-111 hl=109,110
```

stable rustc 上的 packed 后端：把 pc 指针和栈长度压进一个 `usize`，handler 按值收发。

```rust src=research/code/evm2@c8bb5a2--dispatch-table-packed.rs lines=130-162 hl=133,137,157
```

后端在**编译期**由 `build.rs` 选定，不是运行时开关：

```uml q="evm2 用哪个 dispatch 后端，由什么决定？" read="build.rs 读环境变量 EVM2_DISPATCH_BACKEND，默认 auto。结果写成 cfg，运行时不能切换。" takeaway="非 wasm 的 64 位目标用 stable 编译就是 packed；要拿到 TCO 必须用 nightly 编译。"
flowchart TD
  s["build.rs：EVM2_DISPATCH_BACKEND（默认 auto）"] --> w{"目标是 wasm？"}
  w -- 是 --> sr["single_return"]
  w -- 否 --> n{"rustc 是 nightly 且未开 no-tco？"}
  n -- 是 --> t["tco：become 尾跳"]
  n -- 否 --> p{"64 位目标？"}
  p -- 是 --> pk["packed：pc 与栈长度打包，gas 单独返回"]
  p -- 否 --> up["unpacked"]
```

```rust src=research/code/evm2@c8bb5a2--build.rs lines=57-73
```

## K evm2 的优化点逐项拆解 {depth=2}
下表把每个优化点拆成“evm2 怎么做 / revm 对应 / revm 能否追上”。“能否追上”是我们的判断（台账 H43、X27、X34），依据在右侧编号。

| 优化点 | evm2 做法 | revm 对应 | revm 能否追上 |
|---|---|---|---|
| 1 分派形态 | TCO 尾跳（nightly）或 packed 循环（stable） | 中心循环 + 间接 call | warn 能做，三次 PR 未合入（H41） |
| 2 pc / 栈长度 / gas | 按值在寄存器流转 | `&mut Interpreter` 字段 | warn 要改所有 handler 签名（H43） |
| 3 指令表与 spec | 按类型、spec、模式生成 `const` 表 | 运行时 Box 表 + `check!` | warn 与 `insert_instruction` 冲突 |
| 4 静态 gas | 编译期常量 | 运行时查 `[u16;256]` | warn 同 3 |
| 5 栈表示 | 32B 对齐 + 32B store | `Vec<U256>` | ok 局部改动即可（H18） |
| 6 CALL 与 memory | 递归执行，每帧独立 memory | Box + Suspend，共享 memory | no 维护者已拒绝（H42） |
| 7 jumpdest 分析 | SIMD + 懒加载 | main 已移植；v107 是标量 | ok 已追上（H21） |
| 8 定制边界 | 类型族 + `dyn` 组件 | 全泛型 | warn 方向不同，不是优劣（X14） |
| 9 BAL | 读写原语，无调度器 | v107 起同构 API | ok 已有（X26） |
| 10 异步 host | corosensei fiber | main v116 同机制 | ok 已有（X33） |
| 11 Inspector | 两张表，trace 时 `dyn` | 两个循环，泛型 | ok 两边都零成本（X36） |
| 12 JIT / AOT | 同仓 `crates/jit`，默认关 | revmc 外挂 | warn 都是实验性（H22） |

```finding F1 high
# evm2 的真实优势集中在解释器热路径
claim: 相对 revm，evm2 省掉四类开销：pc、栈长度、gas 在内存里的往返；运行时查 gas 表；门控 opcode 里的 spec 分支；TCO 下中心循环的 call/ret。
evidence: [observed] revm `interpreter.rs:295-342@ee9ab3f`；evm2 `dispatch/tco.rs`、`table/packed.rs`、`dispatch/mod.rs:57-80@c8bb5a2`（台账 H2、H12–H17）。[inferred] 节省项由两边结构对照推出（H20）。
implication: evm2 的收益和 workload 强相关：计算密集、短 opcode 多的合约受益大；状态读写密集的区块受益小。
```

```finding F2 high
# 后端在编译期选定，stable 上是 packed，TCO 需要 nightly
claim: `EVM2_DISPATCH_BACKEND` 是 build.rs 读的构建期变量。默认规则：wasm→single_return，nightly rustc→tco，64 位→packed。`nightly` cargo feature 与 TCO 无关。
evidence: [observed] `evm2/crates/evm2/build.rs:21,41-72,88-97@c8bb5a2`；`Cargo.toml` 的 `nightly` feature（台账 H9–H11）。
implication: 在非 wasm 的 64 位目标上，stable 编译只拿到 packed（evm2#384 中 1.10×）。要用 TCO 就要把 nightly 工具链纳入可复现构建。
```

```finding F3 high
# “up to 2x”没有公开数据；唯一公开对比是 1.10–1.19×
claim: README 的“up to 2x”由 evm2#136 加入，PR 没有数据。evm2#384 是唯一正面对比。条件：10 个主网区块（2,279 笔交易），Ryzen 9 7950X，对比 revm 42.0.1。结果：TCO 145.89 vs 173.32 ms（1.19×），packed 156.76 vs 171.81 ms（1.10×）。
evidence: [observed] alloy-rs/evm2#136、#384 正文（台账 H34、H35）。[observed] #384 之后的 #667 / #693 / #745 只和 evm2 旧版比（H36）。
implication: 对外口径用“回放 1.1–1.2 倍”，不要用“2 倍”。当前对 revm 43 的比值需要自己跑（见[复现](#panel-R)）。
```

```finding F4 medium
# 单项优化在区块回放里被稀释，且对代码布局敏感
claim: evm2#667 让 snailtracer、burntpix、erc20_transfer 快 23–34%，同一改动在主网回放里只快 4.8–6.2%。#745 报告：在 `target-cpu=native` 下改一个无关的冷函数，snailtracer 变化 8.5%。
evidence: [observed] alloy-rs/evm2#667、#745 正文，Zen 5 / Zen 4 criterion 中位数（台账 H37、H38）。
implication: 评估时要固定编译参数和机器，用 Mantle 自己的区块回放，不要只看单合约基准。
```

```finding F5 high
# evm2 并不比 revm“更编译期”：组件边界走 dyn，自定义 host 尚不支持
claim: evm2 把类型族（`EvmTypesHost` 的 10 个关联类型）和指令表编译期化；DB、预编译、Inspector、JIT runner 都是 `Box<dyn>`，交易按 type 字节查 `HashMap<u8, Arc<dyn ErasedTxHandler>>`，`Send` 只能运行时断言。源码 TODO 写着自定义 host 尚不支持。
evidence: [observed] `evm2/src/evm/config.rs:20-57`、`evm/mod.rs:207-238,616-644`、`evm/registry.rs:350-352@c8bb5a2`（台账 X9–X13、X15）。[inferred] 方向与 revm 相反（X14）。
implication: GPT 资料“evm2 更强调编译期定制”的说法不准。L2 在 evm2 上的定制方式是：类型族 + 注册 tx handler + `TxHandlerHooks`，Base 已用这一套实现 deposit 和 L1 fee（X16）。
```

```rust src=research/code/evm2@c8bb5a2--evm-config.rs lines=20-57 hl=20,53,57
```

```finding F6 high
# BAL、异步 DB、Inspector 分离都不是 evm2 独有，不能作为迁移理由
claim: revm v107 已有同构的 BAL 构建与读取 API；revm main（v116，#3709）用同样的 corosensei fiber 做异步 DB；两边都把 trace 路径和普通路径分开。evm2 的 BAL 并行示例没有调度器和冲突检测，只验证 BAL。
evidence: [observed] revm `crates/state/src/bal.rs`、`database/interface/src/async_db.rs@ee9ab3f`；evm2 `examples/bal_parallel.rs:64-101@c8bb5a2`（台账 X24–X26、X31–X33、X36）。[inferred] X27、X34。
implication: Mantle 的 v107 已有 BAL 和分离的 Inspector 路径。只有 fiber 异步 DB 要升级到 revm main（v116）才有；v107 只有阻塞的 `block_on` 包装（X32）。
```

```uml q="evm2 的 BAL 并行示例实际做了什么？" read="主线程为每笔交易起一个线程和一个独立 EVM；worker 只从区块 BAL 读前序交易的写入；结果 detach 回主线程后按顺序 fold，最后和区块 BAL 断言相等。" takeaway="这是 BAL 验证，不是调度器：没有冲突检测、没有重执行。"
sequenceDiagram
  autonumber
  participant M as 主线程
  participant W as worker i（独立 EVM）
  participant B as 区块 BAL（只读）
  M->>W: spawn(tx_i, index = i+1)
  W->>B: 读 index i+1 之前的写入
  W-->>M: transact().detach() → PendingState
  M->>M: 按交易顺序 commit 到新 BAL
  M->>M: assert_eq!(新 BAL, 区块 BAL)
```

```rust src=research/code/evm2@c8bb5a2--bal_parallel.rs lines=64-85 hl=64,85
```

```finding F7 high
# JIT 是 revmc 的移植：默认关闭，只支持 BaseEvmTypes
claim: `crates/jit` 由 evm2#207 从 revmc 移植（作者同为 DaniPopes），后端是 LLVM 23。默认 `enabled: false`；开启后同一段代码 miss 8 次才后台编译，最多 4 个 worker，常驻缓存 1 GiB。JIT 上下文写死为 `BaseEvmTypes`；默认 `single_error=true`，所有失败都报成 OutOfGas。
evidence: [observed] evm2#207；`crates/jit/runtime/src/runtime/config.rs:211,217,372,382`、`jit/context/src/lib.rs:45`、`runtime/src/evm2_evm.rs:29@c8bb5a2`（台账 H22–H27）。[inferred] “JIT baked in”指同仓 + 一等钩子，不是默认启用（H31）。
implication: 带自定义类型的 L2（例如 Mantle 的 op-revm 语义）目前用不上 evm2 JIT。JIT 只适合先在非共识场景试点。
```

```rust src=research/code/evm2@c8bb5a2--jit-runtime-config.rs lines=208-218 hl=211,217
```

**revm 的限制，按“取舍”和“可修”分开**（台账 X39、X43、H41–H43）：
- 设计取舍：handler 签名是 `&mut Interpreter`；指令表是运行时可改的 Box；spec 在 handler 内运行时检查；共享 memory + 非递归 frame 栈；泛型参数在 API 中外溢；公共 trait 暴露解释器内部（#3776 报告了 safe API 触发的 UB）。
- 已在 revm 内修掉：异步 DB（v116）、BAL（v107+）、`account-ext`、jumpdest SIMD（#3947，从 evm2 移植）、指令表与 gas 表分离（#3561）。
- 技术上能做、但没合入：tail-call 分派试了三次（#2778、#3307、#3556）。#3556 自测 snailtracer 快 8.7%，CodSpeed 报告整体退化 3.76%。
- 维护者拒绝：用每帧 memory 替换 SharedMemory（#3601）。evm2 仓库在一周后（2026-04-30）创建。
- 节奏：revm crate 主版本约每月 1.35 次；v99–v120 的 22 个 tag 里 12 个标了 API breaking。

```finding F8 medium
# revm 的热路径限制主要来自 API 约定，而不是技术做不到
claim: TCO、寄存器传参、编译期 opcode 常量，revm 都能实现（#3556 已有实现）。阻力在于这些改动要改所有 handler 签名和定制方式，是破坏性变更；memory 方案维护者已经拒绝。
evidence: [observed] bluealloy/revm#3556、#3601、`crates/handler/src/instructions.rs:26-38,99@ee9ab3f`（台账 H5、H41、H42）。[inferred] H43。
implication: “revm 不好”不是准确表述。准确说法：revm 优先保证通用扩展模型与兼容，evm2 团队选择另起一个仓库去掉这些约束。
```

## L 业界动态：谁真的迁了 {depth=2}
```timeline v
2024-10-15 | RISE pevm#382 | 认为 sequential-first 的 revm 开销与类型转换过多
2026-04-23 | revm#3601 被拒 | 每帧 memory 方案被维护者拒绝
2026-04-30 | evm2 仓库创建 | DaniPopes 首个提交
2026-06-27 | evm2 JIT | revmc 移植进 crates/jit
2026-08-26 | Base evm2 scaffold | 不接入节点，只做差分
2026-09-06 | evm2#384 | 唯一公开对比：1.10–1.19×
2026-10-20 | RISE 推文 | 自有 RISE VM，payload p95 248→123 ms
*2026-10-24 | reth#25002 合入 main | 用 evm2 整体替换 revm
2026-10-25 | gakonst 推文 | 新 EVM 刚审计完，内置 JIT
```

```finding F9 high
# reth main 已用 evm2 替换 revm，但没有发布版本包含它
claim: paradigmxyz/reth#25002（onbjerg）于 2026-10-24 09:15 UTC 合入 main，221 个文件，+17,698 / −10,870；之后 Cargo.lock 中已没有 revm、alloy-evm、op-revm。JIT 默认编译进二进制，但 `--jit` 运行时默认关闭。最新发布 v2.8.1（2026-10-23）早于合并。
evidence: [observed] `gh pr view 25002`；`paradigmxyz/reth/Cargo.toml:441-443@f90ed27`；`crates/node/core/src/args/jit.rs:12`；`gh release list`（台账 A8、A10、A11、M26）。
implication: 这是原始资料漏掉的最大事实。它说明 evm2 已过了 Paradigm 自己的集成门槛；但 OP 上游仍在 revm 43 + op-revm 20（M23）。
```

```finding F10 medium
# gakonst 说的“新 EVM”大概率就是 evm2；“刚完成审计”没有公开报告
claim: 推文没点名。evm2 由 Paradigm / Tempo 工程师维护，revm 作者 rakita 是 CODEOWNER，JIT 来自 revmc；推文发在 reth 合并约 18 小时后。2026-10 有一批编号 SIGP-xxx 的“integration audit fixes”，但仓库里没有审计报告。
evidence: [observed] fxtwitter 推文原文；evm2 提交 06ee806；tempo#8320；evm2#731（台账 A1、A4、A5、A14、A15）。[inferred] “= evm2”（A9）。[speculative] 审计方可能是 Sigma Prime（A16）。
implication: 在审计报告公开前，不要把“已审计”当成采用依据。crates.io 上的 `evm2` 只有 0.0.0-reserved 占位（A3）。
```

```finding F11 high
# Base：并行开发 + 差分测试，没有切换
claim: `base-common-evm2` 已实现区块执行器、deposit、L1 / operator fee，并有 8 组对 revm 的 parity 测试。但 workspace 里没有其他 crate 依赖它；节点仍走 `BaseEvmConfig` → `BaseEvmFactory`（alloy-evm + revm 43.0.3）；crate README 写明“intentionally not wired into the node”；EIP-8130 交易在 evm2 路径上不支持。
evidence: [observed] `base/base/crates/common/evm2/README.md:15-18`、`src/executor.rs:121`、`crates/common/evm/src/factory.rs`@bcd96e2；Base PR #4693、#4788、#4803（台账 A17–A22）。[inferred] A23、A24。
implication: Base 给出了低风险的评估模板：独立 crate，加上对 revm 的 parity 测试，不碰节点。
```

```finding F12 high
# RISE：下游化 revm 成闭源 RISE VM，不是“降级 revm 版本”
claim: 推文说的是“downstream revm into our own RISE VM”，靠寄存器优化、opcode 融合、内联和缓存。2× 指整节点 payload 延迟 p95（1 小时窗口，均值 248 ms 对 123 ms），没给硬件、负载和 revm 版本。pevm 的 revm 依赖从 19.4.0 一路升到 38.0.0，没有回退。
evidence: [observed] hai_rise 推文与配图；`risechain/pevm` `git log -p -- Cargo.toml`；pevm#382（台账 A25–A27、A29）。[inferred] “降级”说法无证据（A28）。
implication: RISE 的数字不能和 evm2 的 1.1–1.2× 直接比较：口径不同（节点 p95 对 EVM 回放）。
```

```finding F13 medium
# MegaETH：公开代码仍在 revm 上，并在加深 revm fork；有原型信号
claim: mega-evm 依赖 revm =40.0.3 与 optimism 仓库的 op-revm，规范写明“built on revm and op-revm”，并维护以 revm v112 为基线、带 hooks 的 fork。mega-evm 的主要提交者 RealiCZ 在 evm2#387 / #388 自述已把一个“OP-stack 风格、带第二 gas 维度的 L2”原型移植到 evm2。
evidence: [observed] `megaeth-labs/mega-evm/Cargo.toml:139-146`、`docs/spec/overview.md:13`@821577d；evm2#387、#388；megaeth-labs/revm #56、#76（台账 A31–A35）。[inferred] A36。
implication: 内部迁移计划没有公开来源（[speculative] A37）。公开动作显示短期仍在 revm 上投入。
```

## M 其他主流 EVM 实现：都在优化同几件事 {depth=2}
| 实现 | 热路径做法 | 验证方式 |
|---|---|---|
| geth core/vm | 生成的 dense switch + PGO 内联；两级 jumpdest 缓存；并行 prefetcher | 新旧循环在每次 CI 差分 + fuzz |
| evmone | baseline + computed goto；advanced 按块预算 gas / 栈 | EVMC 接口 |
| Nethermind | 函数指针表；对齐栈池；并行预热；BAL 并行校验 | README 称预热约减半，无条件 |
| Besu | 实验性 EVM v2：`long[]` 栈，switch 内联热点 opcode | v1↔v2 差分，52 个注入 bug 全被测出 |
| ethrex LEVM | 按 fork 的 `static` 函数指针表 + 栈池 | EELS + ethereum/tests |
| revmc | LLVM JIT / AOT，实验性 | 从未进入 reth 发布版 |

```finding F14 high
# 共同模式：分派方式、栈复用、jumpdest 缓存、并行预热，并配新旧解释器差分
claim: geth #35638 保留旧循环作参照，每次 CI 跑差分和 fuzz；Besu #11524 用逐 opcode 和随机程序做 v1↔v2 差分，注入 52 个 bug 全部测出；Besu v2 在 JMH 单 opcode 微基准上算术类快 2.53 倍。
evidence: [observed] go-ethereum `core/vm/interpreter.go:134-137@2006f08` 与 PR #35638；besu PR #11524（台账 M31、M32、M35、M36）。[observed] evmone、Nethermind、ethrex 源码（M33、M34、M37）。
implication: geth 和 Besu 最近换解释器时，都让新旧路径并存并持续差分。Mantle 不论升级 revm 还是评估 evm2，都应先建这套差分。
```

现行 EIP-7904 在 6 个完整客户端上以 100 Mgas/s 为目标测量，结论是不调整 gas 表；reth 只在 `ECPAIRING_BASE` 上最差，且与 ethrex 基本持平（台账 M39）。GPT 资料把它和较早的“7 个独立 EVM、revm 18”报告混在了一起（M40）。

## N Mantle 的 revm 栈：现状与缺口 {depth=2}
```excalidraw q="Mantle 的三个执行器分别用什么，哪里有等价性风险？" read="左侧 op-geth 是官方文档中的 sequencer 执行层（Go）；中间 mantle reth 与右侧 SP1 证明程序用同一个 op-revm fork（Rust）。红色虚线是必须逐块等价、但目前没有持续差分的边界。" takeaway="Mantle 最紧迫的等价性风险在 Go 与 Rust 之间，不在 revm 与 evm2 之间。" kind=执行器拓扑
{"grid": {"w": 420, "h": 160}, "defaults": {"w": 230, "h": 74, "fontSize": 16},
 "nodes": [
   {"id": "g", "label": "op-geth（geth 1.17.3）\n文档中的 sequencer", "col": 0, "row": 0, "color": "blue"},
   {"id": "r", "label": "mantle reth v2.2.0\nop-revm fork（revm 38）", "col": 1, "row": 0, "color": "blue"},
   {"id": "p", "label": "OP Succinct / SP1\n同一 op-revm fork", "col": 2, "row": 0, "color": "violet"},
   {"id": "s", "label": "Mantle 语义\nBVM_ETH / token_ratio / Arsia", "col": 1, "row": 1, "color": "yellow", "w": 290}
 ],
 "edges": [
   {"from": "g", "to": "r", "label": "须逐块等价", "dashed": true, "strokeColor": "red", "arrow": "both"},
   {"from": "r", "to": "p", "label": "同一 tag"},
   {"from": "s", "to": "r", "label": "handler"},
   {"from": "s", "to": "g", "label": "Go 侧另一份", "dashed": true}
 ]}
```

```finding F15 high
# 同一份 revm fork 同时用在执行客户端和 ZK 证明路径
claim: mantle-xyz/reth 与 mantle-xyz/op-succinct 都钉在 `mantle-xyz/revm` tag `v107-mantle-arsia.2`（revm 38.0.0 / op-revm 19.0.0 / revm-interpreter 35.0.1）。`mantle-reth/` 里没有自定义执行器，Mantle 语义写在 op-revm handler（约 5.7k 行）。官方文档写的 sequencer 执行层是 op-geth。
evidence: [observed] `mantle-xyz/reth/Cargo.toml:242-264`、`Cargo.lock`@574e7f3；`mantle-xyz/op-succinct/Cargo.toml:178-189@8d280de`；`mantle-xyz/revm` diff；docs.mantle.xyz Node Introduction（台账 M1、M3、M4、M11、M14）。[inferred] op-revm 结果直接决定证明是否成立（M13）。
implication: revm 版本或语义的任何变化都同时影响出块校验和证明，三个仓库必须锁步升级（M44）。
```

```finding F16 high
# fork 的 EEST 与 cargo-deny CI 都是红的
claim: fork 改了 4 处核心 crate，其中把 EIP-7825 的 tx gas 上限默认值全局改为 `u64::MAX`，导致 EEST Osaka 用例失败；cargo-deny 报告 RUSTSEC-2026-0220（ruint < 1.20.0），mantle reth 的 lockfile 里是 ruint 1.18.0。
evidence: [observed] `mantle-xyz/revm/crates/context/src/cfg.rs:425@835cb4e`；GitHub Actions run 35086043320、37723171335；`mantle-xyz/reth/Cargo.lock`（台账 M6、M8、M9）。
implication: fork 目前没有以上游一致性测试为准的绿色信号。这个补丁可以改成配置项（M10）。
```

```rust src=research/code/mantle-revm@835cb4e--context-cfg.rs lines=422-427 hl=424,426
```

```finding F17 high
# 版本落后 5 个主版本，op-revm 已换了上游
claim: Mantle：revm 38 / alloy-evm 0.34 / reth v2.2.0。OP 上游（optimism develop）：revm 43.0.2 / alloy-evm 0.39 / op-revm 20.0.0 / reth op-v2.6.0-1。op-revm 自 revm v108 起已迁到 ethereum-optimism/optimism。
evidence: [observed] revm v108 release notes（#3568）；`ethereum-optimism/optimism rust/Cargo.toml@b84018de4`；revm tags（台账 M22、M23、X40）。
implication: 升级的正确目标是“OP 上游的组合”，不是单独升 revm。上游 release notes 没有端到端加速数字，所以升级理由是安全、可维护性和对齐 OP，不承诺性能（M24）。
```

```finding F18 high
# 现有抽象层换不了 VM；没有持续差分和执行基准
claim: Mantle reth 经由 alloy-evm 的 `EvmFactory` 接入执行，但该 trait 和 Mantle 的 bound 直接引用 revm 类型。现有一致性测试只有 7 个主网交易 fixture 的 gasUsed 回放和 smoke 验收测试；仓库里没有执行层或区块回放基准。
evidence: [observed] `alloy-rs/evm/crates/evm/src/evm.rs:7,259@v0.34.0`；`op-reth/crates/evm/src/lib.rs:206-212@574e7f3`；`integration-tests/tests/replay.rs`（台账 M19–M21）。[inferred] M27。
implication: GPT 资料建议另造 `MantleEvm` trait。reth 的整体替换（221 个文件）说明成本在语义和类型，再加一层 trait 解决不了。
```

## O 对 Mantle 的意义：行动清单 {depth=2}
以下建议由台账推出（inferred），按优先级排列。

```excalidraw q="Mantle 执行层的改进按什么顺序做？什么条件下才评估 evm2？" read="左到右是先后顺序。绿框是现在就做的事；黄色菱形是决策点，两个条件都满足才进入 evm2 评估。" takeaway="evm2 是决策点之后的事；决策点之前的工作不管选哪个 VM 都要做。" kind=路线图
{"grid": {"w": 340, "h": 160}, "defaults": {"w": 210, "h": 78, "fontSize": 16},
 "nodes": [
   {"id": "p0", "label": "P0\n差分门禁 + CI 恢复为绿", "col": 0, "row": 0, "color": "green", "strokeWidth": 3},
   {"id": "p1", "label": "P1\n追平 OP 上游 + 回放基准", "col": 1, "row": 0, "color": "green"},
   {"id": "d", "label": "解释器是瓶颈？\nOP 已跟进？", "col": 2, "row": 0, "shape": "diamond", "color": "yellow", "w": 250, "h": 140},
   {"id": "e", "label": "evm2 评估\n复用测试向量", "col": 3, "row": 0, "color": "blue"}
 ],
 "edges": [
   {"from": "p0", "to": "p1"}, {"from": "p1", "to": "d"}, {"from": "d", "to": "e", "label": "都是"}
 ]}
```

**P0（现在做）**
1. 把 op-geth↔op-revm 逐块差分回放做成发布门禁：每天回放一段主网区块，加上 deposit / BVM_ETH / token_ratio 变更区块；比对 receipt 与状态根（台账 M18–M20、M43）。
2. 让 mantle-xyz/revm 的 CI 恢复为绿：撤掉 EIP-7825 核心补丁，在构造 `CfgEnv` 时设 `tx_gas_limit_cap = Some(u64::MAX)`；ruint 升到 1.20.0 或更高（M8–M10）。
3. 把核心 crate 补丁降到零：`Gas::set_limit` 提给上游或在 op-revm 内绕开；SSTORE 修复已在上游 #3746（M6、M7）。

**P1（下一个升级周期）**
4. 按 OP 上游的组合整体升级：revm 43 / alloy-evm 0.39 / op-revm 20，并把 reth、mantle-v2/rust、op-succinct 的 tag 锁步（M23、M44）。
5. 建执行层回放基准：固定机器回放 Mantle 区块，分别记录 EVM 执行、状态读、trie、持久化的耗时。先回答“解释器占多大比例”。
6. 定下 evm2 跟随策略：共识路径跟 OP 上游；现在把 Mantle 语义整理成与 VM 无关的测试向量，同时作为第 1 条的差分语料（M27）。

**P2（有数据之后）**
7. 确认生产 reth 没有关闭 prewarming，接上 prewarm 与 precompile cache 的命中率指标（M28）。
8. JIT 只在 `eth_call` / 模拟这类非共识场景试点；共识路径和 SP1 证明程序不引入 JIT（H26）。
9. op-geth 下次 rebase 时吸收 geth 2026 年的 PGO switch、in-place 栈和分层 jumpdest 缓存，沿用 geth 的差分测试（M30）。

```callout warn CAUTION
不要用 evm2 README 的“up to 2x”或 RISE 的“2×”估算 Mantle 收益。前者没有公开数据；后者是闭源 VM 的整节点 p95，口径不同。
```

## P 局限与开放问题 {depth=2}
**推测（speculative），本文没有当作结论使用**：
- Mantle 主网上 reth 承担 RPC 或 verifier 角色，不是 sequencer（M17）。
- 按 60M gas / 2 秒出块，峰值约 30 Mgas/s，低于 EIP-7904 的 100 Mgas/s 目标，所以解释器目前可能不是瓶颈（M41）。
- sequencer 出块路径可能享受不到 engine 侧的并行预热（M42）。
- “up to 2x”可能来自 snailtracer 一类计算密集基准的内部测量（H39）。
- JIT 的 `single_error` 可能只影响 trace / RPC 的错误原因，不影响状态（H28）。
- MegaETH 有内部 evm2 迁移计划（A37）；revm 后续投入可能下降（A41）；revm 的 fiber 异步移植自 evm2（X35）；Mantle 部分核心补丁在 evm2 里可写成 handler（X41）。

**效度威胁**：
- 本文没有在本机跑 benchmark：evm2 的 bench 构建依赖 `mcl_rust`，需要 cmake。所有性能数字都来自项目方 PR，测试条件见各 finding。
- GitHub 代码检索只覆盖默认分支，evm2 的依赖面可能被低估。
- 主网 sequencer 与生产启动参数没有运维侧一手材料。

**开放问题**：
1. evm2 对 revm 43、对 Mantle 的 revm 38，在 Mantle 区块上的当前比值是多少？
2. OP 上游（op-reth / op-revm）是否、何时跟进 evm2？
3. evm2-jit 何时支持自定义 `EvmTypes`？
4. gakonst 所说审计的执行方、范围和报告。
5. Mantle 区块处理时间中，EVM 解释器、状态读、trie 各占多少？

## Q 方法与证据 {depth=3}
- 外部调研（ChatGPT Deep Research，`research/gpt-deep-research.md`）只当线索。每个论断都追到源码、官方 PR、release notes 或官方文档。
- 四路并行调研，分册在 `research/notes-{hotpath,extension,adoption,mantle}.md`，合并台账 `research/ledger.md`（176 行）。
- 源码版本：revm main `ee9ab3f`（43.0.3）、v107 `d629331`（38.0.0）；evm2 `c8bb5a2`；mantle-xyz/revm `835cb4e`；mantle-xyz/reth `574e7f3`；reth main `f90ed27`；base/base `bcd96e2`；mega-evm `821577d`；pevm `e94b0e3`。
- 主会话抽查了 reth#25002、evm2#384、`EvmTypesHost` TODO、JIT 默认配置、Base README、Mantle 7825 补丁与 CI 日志。

GPT 资料中被修正的主要地方：
- 漏掉 reth main 已切 evm2、op-revm 已迁出 bluealloy/revm。
- “evm2 更编译期、revm 靠运行时”方向不准（[F5](#F5)）。
- BAL、异步 DB 被当成 evm2 差异点（[F6](#F6)）。
- packed cursor 没有“dispatch metadata”；`EVM2_DISPATCH_BACKEND` 是构建期变量（[F2](#F2)）。
- 没指出唯一公开对比只有 1.10–1.19×（[F3](#F3)）。
- Base 的 revm 是 43.0.3，不是 42.0.1；RISE 不是降级。
- 建议另造 `MantleEvm` trait（[F18](#F18)）；“可吸收的优化”在 revm 38 / reth v2.2.0 大多已有。
- EIP-7904 混用了新旧两份材料；PropAMM / JIT Router 相关建议没有一手来源，未采用。

## R 复现 {depth=3}
```bash title="核对 reth 已切换 evm2"
gh pr view 25002 -R paradigmxyz/reth --json state,mergedAt,changedFiles
# 预期：MERGED，2026-10-24T09:15:08Z，221
```

```bash title="核对唯一公开的 evm2 对 revm 数据"
gh pr view 384 -R alloy-rs/evm2 --json body --jq .body | grep -E '7950X|1\.19|1\.10'
```

```bash title="在 x86-64 上跑 evm2 对 revm 的并排基准（需要 cmake）"
git clone https://github.com/alloy-rs/evm2 && cd evm2
EVM2_BENCH_REVM=1 cargo bench -p evm2-cli --bench evm -- mainnet           # stable → packed
EVM2_BENCH_REVM=1 cargo +nightly bench -p evm2-cli --bench evm -- mainnet  # nightly → tco
```

```bash title="核对 Mantle fork 的版本与补丁"
grep -A2 -E '^name = "(revm|op-revm)"$' mantle-xyz/reth/Cargo.lock
git -C mantle-xyz/revm show v107-mantle-arsia.2:crates/context/src/cfg.rs | grep -n -A2 'MANTLE'
```

## S 术语表 {depth=2}
```glossary
dispatch | 分派 | 解释器为当前 opcode 找到 handler 并调用它的方式。 | 不是交易调度
TCO | tail-call dispatch，尾调用分派 | handler 末尾用 `become` 直接跳到下一个 handler，不回中心循环；evm2 只在 nightly rustc 上启用。 | 不是 JIT
packed | packed 后端 | evm2 在 stable 64 位目标上的默认后端：pc 指针左移 11 位后与栈长度合成一个 `usize`，剩余 gas 单独返回。 | 不是压缩字节码
单态化 | monomorphization | Rust 为每组具体类型参数各生成一份代码，调用不经过虚表。 | 与 `dyn` 相对
dyn | trait object，类型擦除 | 运行时通过虚表调用的 trait 对象。 | 与单态化相对
Handler | revm Handler | revm 中按 validate → pre_execution → execution → post_execution 运行一笔交易的 trait。 | 不是 opcode handler
Journal | journaled state | 记录状态修改与回滚条目的内存层；revm 跨交易复用，evm2 按交易 detach。 | 不是数据库
op-revm | | OP Stack 在 revm 上的扩展：deposit、L1 fee、operator fee；v108 起在 optimism 仓库。 | 不是 op-geth
BAL | Block-Level Access List，EIP-7928 | 区块携带的状态访问列表，验证者据此并行执行并核对。 | 不是 EIP-2930 交易 access list
JIT | just-in-time 编译 | 运行时把热点合约编译成机器码。 | 不是 TCO
AOT | ahead-of-time 编译 | 提前编译合约并缓存产物。 |
EEST | Ethereum Execution Spec Tests | 以太坊执行层的官方测试夹具。 |
差分测试 | differential testing，parity | 两个实现跑同一输入，逐项比对结果。 | 不是单元测试
prewarming | 并行预热 | 在主循环之前并行预执行交易，把状态读进缓存。 | 不是并行执行
EIP-7825 | 交易 gas 上限 | Osaka 引入的单笔交易 gas 上限。 |
revmc | | Paradigm 的 EVM→LLVM JIT/AOT 编译器；evm2-jit 由它移植而来。 |
```

## T 参考资料 {depth=2}
1. **PRIMARY** alloy-rs/evm2 @ c8bb5a2：README、AGENTS.md、`crates/evm2/{build.rs,src/interpreter/dispatch,src/evm}`、`crates/jit`、`examples/{custom_evm,bal_parallel.rs}`。读它看热路径与定制边界的实际实现。
2. **PRIMARY** bluealloy/revm main @ ee9ab3f 与 tag v107 @ d629331：`crates/interpreter`、`crates/handler`、`crates/context`、CHANGELOG。读它看 Mantle 基线与上游差距。
3. **PRIMARY** alloy-rs/evm2#384：唯一公开的 evm2 对 revm 回放对比。
4. **PRIMARY** alloy-rs/evm2#136、#207、#667、#693、#745：2x 宣称来源、JIT 移植、evm2 自身迭代数据。
5. **PRIMARY** bluealloy/revm#2140、#2778、#3307、#3556、#3601、#3558、#3561、#3709、#3947、#3776：revm 侧的尝试、拒绝与已合入的优化。
6. **PRIMARY** paradigmxyz/reth#25002 与 main @ f90ed27：reth 用 evm2 替换 revm。
7. **PRIMARY** gakonst 推文 https://x.com/gakonst/status/2114190575486538225（2026-10-25）。
8. **PRIMARY** base/base @ bcd96e2 `crates/common/evm2` 与 PR #4693、#4788、#4803：Base 的差分开发状态。
9. **PRIMARY** hai_rise 推文 https://x.com/hai_rise/status/2112498280294924768 与 risechain/pevm#382、pevm Cargo 历史。
10. **PRIMARY** megaeth-labs/mega-evm @ 821577d、alloy-rs/evm2#387 / #388、megaeth-labs/revm #56 / #76。
11. **PRIMARY** foundry-rs/foundry#17541、tempoxyz/tempo#7871、#8320：Foundry / Tempo 迁移与审计修复。
12. **PRIMARY** mantle-xyz/reth @ 574e7f3（Cargo.toml、Cargo.lock、releases）与 mantle-xyz/op-succinct @ 8d280de。
13. **PRIMARY** mantle-xyz/revm tag v107-mantle-arsia.2 @ 835cb4e，与上游 v107 的 diff；CI runs 35086043320、37723171335。
14. **PRIMARY** docs.mantle.xyz：Node Introduction、Elysium changelog、OP Succinct Mainnet Upgrade。
15. **PRIMARY** ethereum-optimism/optimism develop `rust/Cargo.toml`、`rust/op-revm`：OP 上游的版本组合。
16. **PRIMARY** go-ethereum PR #35638、#35881、#35156；besu PR #11524；evmone、Nethermind、ethrex 源码。
17. **PRIMARY** EIP-7904、EIP-7928（ethereum/EIPs master）。
18. ChatGPT Deep Research（2026-10-25，`research/gpt-deep-research.md`）：只作线索，修正见[方法与证据](#panel-Q)。

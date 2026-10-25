---
imported_from: ChatGPT Deep Research
imported_at: 2026-10-25
original_file: gpt-deep-research.md
---


# EVM 执行引擎工程调研：`revm`、`evm2` 与 Mantle 的执行层选择

**调研日期：2026 年 10 月 25 日**

## 先给结论

如果只给 CTO 或 Dev Team 看前两页，我建议把结论概括成下面几句话：

1. **`evm2`**** 的核心价值不是改变 EVM 语义，而是重新设计执行热路径。**
   
   它以 `revm` 作为语义、gas accounting、控制流和 host interaction 的基线，重点优化 opcode dispatch、instruction plumbing、类型边界、扩展机制，并把 JIT/AOT、异步 host I/O、BAL-aware 执行等能力纳入同一个更容易扩展的架构。官方 README 对其定位是“更快、更可定制的 Rust EVM”，并声称在部分 workload 上相对 `revm` **最高可达约 2 倍**，但这个数字是项目方的综合性 headline，不应直接等价为 Mantle 节点端到端性能提升。
   
2. **`revm`**** 的问题主要不是正确性，而是它的设计中心与下一阶段需求不完全一致。**
   
   `revm` 是一个成熟、广泛采用、默认偏单线程执行和通用扩展的 EVM framework。它的 `Context`、`Journal`、`Database`、`Handler`、`Inspector` 抽象非常强，但对于并行执行、JIT、链专属 transaction family、零转换 host interface、细粒度 cache 和高度定制的执行调度，应用方往往需要在外部增加 adapter、fork、类型转换和额外状态管理。
   
3. **`evm2`**** 的最大工程收益有三个层次：**
   - **更紧凑的解释器循环**：减少每条 opcode 的 dispatch、cursor、stack metadata 和 gas plumbing 开销。
   - **更好的编译期扩展边界**：通过 typed `EvmTypes`、instruction macro、custom transaction/spec/host 类型，把链定制逻辑尽可能前移到编译期。
   - **为 JIT、AOT、并行和自定义 EVM 提供统一底座**：不再把 interpreter、custom EVM、JIT、parallel state model 看成互相割裂的外围功能。
4. **但 ****`evm2`**** 目前仍然是高潜力、低成熟度组件。**
   
   官方开发说明明确写着它是 revm 的重新实现、仍处于 work in progress，并且没有公共 API 稳定性承诺；GitHub Releases 页面也显示目前没有正式 release。
   
5. **公开证据不能支持“Base 已经完成从 revm 切到 evm2”这个结论。**
   
   Base 当前公开仓库同时引入了 `revm` 和 pinned Git revision 的 `evm2`，但官方文档索引把 `evm2` 描述为“用于和 revm 做差分测试的 scaffold，尚未接入 node”；当前 `base-common-evm` 仍然是以 `revm SpecId` 为核心的执行路径。更准确的说法是：**Base 正在并行构建、差分验证和逐步迁移 evm2，而不是公开证明了生产节点已经完成切换。**
   
6. **Rise 的动机更接近“为并行 EVM 重做执行核心”，不是简单的“revm 升级后性能下降，所以回滚版本”。**
   
   Rise 官方 issue 直接写明：他们希望使用专门为并行执行设计、带 thread-safe state、原生 cache 和 instrumentation 的 EVM；他们认为 sequential-first 的外部实现会带来过多 overhead 和 unwanted type conversions。这个观点可以作为工程动机的重要证据，但不能直接当作所有 revm workload 的普遍结论。
   
7. **MegaETH 的公开代码目前仍是 revm/op-revm 派生实现。**
   
   你提到的 MegaETH 内部迁移计划目前没有公开证据可以确认；公开 `mega-evm` 文档明确说其参考实现建立在 `revm` 和 `op-revm` 之上。报告里应把“内部可能迁移 evm2”标成未公开、待验证信息。
   
8. **对 Mantle，当前最合理的决策不是立刻硬切换，而是先建立 VM-neutral abstraction，再做 revm/evm2 双执行差分和分层 benchmark。**
   
   在没有证明 Mantle 当前 block latency 的主要瓶颈来自 EVM interpreter 之前，单纯把 revm 换成 evm2，可能只得到局部收益；如果瓶颈实际在 state DB、trie commit、receipt、witness、precompile、RPC 或 block pipeline，VM hot loop 的 2 倍提升未必能带来明显的端到端改善。
   

---

# 1. 先区分三个不同层次：EVM、执行客户端和并行执行框架

很多关于“换 EVM”的讨论混合了三个层次。

## 1.1 EVM implementation

这是本文的核心对象，负责把一笔交易或一个 call frame 执行成：

- success / revert / halt；
- gas 使用量；
- logs；
- return data；
- account、storage、nonce、balance、code 的状态变化；
- 新合约地址；
- precompile 结果；
- host interaction。

典型实现包括：

- `revm`；
- `evm2`；
- go-ethereum `core/vm`；
- evmone；
- Besu EVM；
- Nethermind EVM；
- ethrex LEVM；
- rust-ethereum/evm。

## 1.2 Full execution client

执行客户端还负责：

- P2P；
- Engine API；
- block import；
- transaction pool；
- state database；
- trie；
- snapshot；
- RPC；
- sync；
- receipt root；
- pruning；
- witness；
- block building；
- parallel scheduling。

典型项目包括：

- Geth；
- Reth；
- Erigon；
- Besu；
- Nethermind；
- Base node；
- MegaETH node。

`Reth` 不是和 `revm` 平级的另一个 EVM。Reth 是完整的 Rust execution client，而 `revm` 是其执行层的重要组件。Reth 通过自身的 EVM abstraction 包装 revm，从而减少上层代码直接依赖 revm 内部类型。这个设计对 Mantle 很有借鉴意义：**不要让业务、RPC、block builder、sequencer 到处直接暴露 revm 类型。**

## 1.3 Parallel execution framework

并行执行通常由以下部分共同构成：

- transaction scheduler；
- read/write set 记录；
- multi-version memory；
- conflict detection；
- speculative re-execution；
- parallel state warming；
- ordered commit；
- state root calculation。

更换 EVM interpreter 本身并不会自动带来 transaction-level parallelism。

Rise 的 `pevm` 就是一个并行 EVM engine，而不是 evm2。evm2 的 `bal_parallel` 示例说明它可以提供 BAL-aware 的 state/host 和并行执行接口，但仍然需要链或者 block builder 构建 access list、分配 worker，并按照 transaction order fold 结果。它不是一个自动替代 scheduler 的“并行开关”。

这一区分对于 Mantle 很关键：

> `evm2` 可能提高单 transaction 或单 block 的执行效率，但它不会自动解决 Mantle 的 parallel scheduling、state conflict、commit ordering 和 trie bottleneck。

---

# 2. High-level 对比：`revm` 与 `evm2`

| 维度 | `revm` | `evm2` | 对 Mantle 的含义 |
| --- | --- | --- | --- |
| 语义目标 | Ethereum EVM，已广泛使用 | 以 revm 语义为 baseline 的重新实现 | 两者目标是兼容，不是换成另一种 EVM |
| 生产成熟度 | 高，Reth、Foundry、多个 L2、block builder、zkVM 使用 | WIP，暂无正式 release，API 稳定性未承诺 | `revm` 更适合作为当前共识路径 |
| 解释器热路径 | `InstructionTable` 映射 opcode 到函数指针，抽象完整 | 更紧凑的 interpreter、静态 dispatch table、多种 dispatch backend | evm2 有潜在的 CPU-side 优势 |
| dispatch backend | 主要是传统 interpreter loop | `auto`、`tco`、`packed`、`single_return`、`unpacked` | 可按 CPU、编译器和 workload 调优 |
| 扩展方式 | `EvmTr`、`ContextTr`、`Handler`、`Inspector`、自定义 instruction/precompile | typed `EvmTypes`、instruction macro、custom spec/tx/host/opcode | evm2 更强调编译期定制 |
| 自定义 transaction | 可以通过 framework 和 handler 扩展 | transaction family 是一等类型参数 | 适合 Mantle 自定义 fee、system tx、L2 env |
| host/state 接口 | 强大，但容易暴露 revm state/journal 类型 | 目标是更清晰的 typed host boundary | 可减少上层 adapter 和转换 |
| JIT/AOT | revm 生态有独立的 revmc/compiler 方向，但不是传统 revm core 的默认执行路径 | workspace 内有 `crates/jit`，支持 interpreter/JIT/AOT 测试路径 | evm2 更像统一的 future execution substrate |
| 异步 DB | 当前 revm 已有 async database/fiber 支持 | `async` feature 通过 stackful coroutine 提供 async host I/O | 两者都可处理 async DB，不能只看这点做迁移 |
| 并行执行 | 本身不是 block-level parallel executor | 有 BAL-aware parallel example，但不自动提供 scheduler | 需要把 VM、scheduler、state model 一起评估 |
| Inspector/tracing | 成熟，生态广泛 | 仍在演进，必须验证 tracer parity | Foundry、debug RPC、trace 服务是迁移重点 |
| 兼容性测试 | 大量 Ethereum tests 和生态集成 | EEST、revm differential testing 正在加强 | evm2 需要长时间 shadow replay |
| API 稳定性 | 较高，但版本升级仍可能有 breaking change | 官方明确没有公共 API stability guarantee | 必须 pin exact commit |
| 生态和人才 | 非常强 | 生态小，当前主要由 Alloy/Base/Foundry 等推动 | Mantle 应保留 fallback |
| 主要风险 | 抽象层和通用性带来的 overhead、并行和 JIT 需要外围工程 | 迁移成本、语义边界、API churn、生态不足 | 采用策略应是渐进式 |

`revm` 官方架构文档把 EVM 描述为 `Context + Instructions + Precompiles + Inspector`，其中 `Context` 再包含 transaction、block、cfg、journal 和 database；database 读取到的 account、storage、bytecode 会被放入 journal。

`evm2` 官方 README 则把自己的主要优势归因于更紧凑的 interpreter、静态 dispatch table 和更便宜的 instruction plumbing，同时强调 typed configuration 将 fork logic、transaction handling、host state 和 opcode definitions 分离。

---

# 3. `revm` 的工程架构与优势

## 3.1 `revm` 的核心对象关系

官方文档给出的主执行结构可以抽象成：

```txt
let mut evm =
    Context::mainnet()
        .with_block(block)
        .build_mainnet();

let result = evm.transact(tx);
```

如果需要 trace：

```txt
let mut evm =
    evm.with_inspector(tracer);

let result = evm.inspect_tx(tx);
```

这不是一个简单的 opcode interpreter，而是一个由多层组件构成的 framework：

```txt
Context
 ├── TxEnv
 ├── BlockEnv
 ├── CfgEnv
 ├── Journal
 │    ├── loaded accounts
 │    ├── loaded storage
 │    ├── transient storage
 │    ├── revert entries
 │    └── state changes
 └── Database

Evm
 ├── Context
 ├── InstructionTable
 ├── PrecompileProvider
 ├── Handler
 └── Inspector
```

`revm` 的 docs.rs API 也明确列出了这些模块和 trait：

- `Database` / `DatabaseRef`；
- `DatabaseCommit`；
- `ExecuteEvm`；
- `ExecuteCommitEvm`；
- `InspectEvm`；
- `InspectCommitEvm`；
- `MainBuilder`；
- `Handler`；
- `Inspector`；
- `AsyncDb`；
- `WrapDatabaseAsync`。

## 3.2 `revm` 的优势

### 正确性和兼容性

`revm` 已经被大量项目使用，包括 Reth、Foundry、Hardhat、OP Stack、Base、Scroll、多个 block builder 和 zkVM 相关项目。官方 README 将其描述为 Ethereum 生态中广泛使用的 Rust EVM。

这带来几个实际优势：

- Ethereum hardfork 支持通常会很快跟进；
- EEST、state test、block test 生态成熟；
- 常见的 EIP-1559、EIP-2930、EIP-4844、EIP-7702 等边界已经被大量项目踩过；
- L2 特殊 transaction、precompile、fee hooks 和 custom handler 有现成参考；
- Foundry、Reth、op-revm 生态可以复用。

### 可扩展性

`revm` 的 framework API 允许项目替换：

- `Context`；
- `Transaction`；
- `Block`；
- `Cfg`；
- `Database`；
- `Handler`；
- `Inspector`；
- `InstructionTable`；
- `PrecompileProvider`；
- `Frame`。

这也是为什么 OP Stack 可以通过 `op-revm` 添加 Optimism 特有 transaction、fee 和 system contract 逻辑，而不需要从零实现一个完整 EVM。

### `no_std` 与 zkVM 兼容性

官方文档明确说明 revm 支持 `no_std`，因此可以被用于 zkVM 等受限运行环境。

对于 Mantle，如果未来需要：

- zk proof；
- stateless execution；
- witness replay；
- RISC-V guest；
- prover-side execution；

这比一个高度依赖操作系统、动态链接或者 JVM runtime 的实现更容易整合。

### Inspector 和 trace

`Inspector` 提供：

- opcode 前后 hook；
- stack、memory、storage 观察；
- call/create tracing；
- log 与 selfdestruct 记录；
- 执行流修改；
- Foundry cheatcode 和调试支持。

这对 Mantle 的 debug RPC、交易模拟、MEV simulation、PropAMM JIT Router 和安全分析都很重要。

---

# 4. `revm` 的性能路径与潜在限制

## 4.1 Opcode dispatch

`revm-interpreter` 的官方 docs 将 `Instruction` 定义为 EVM opcode function pointer，并将 `InstructionTable` 定义为映射 256 个 opcode 的 instruction function pointer table。

可以用下面的简化模型理解：

```txt
loop {
    let opcode = bytecode[pc] as usize;
    let instruction = instruction_table[opcode];

    let result = instruction(&mut instruction_context);

    match result {
        Continue => pc += 1,
        Call(frame) => return frame,
        Return(data) => return data,
        Revert(data) => return data,
        Halt(reason) => return reason,
    }
}
```

这个设计的优势是：

- opcode table 清晰；
- 自定义 opcode 容易；
- inspector 和 host callback 可以自然接入；
- fork-specific instruction table 易于构建；
- 语义和执行逻辑分离。

但每条 opcode 可能涉及：

- bytecode 读取；
- table lookup；
- function pointer 间接调用；
- `InstructionContext` 访问；
- stack bounds 检查；
- gas 更新；
- memory expansion；
- host callback；
- `InstructionResult` 处理；
- frame transition。

在普通 transaction 中，这些成本可能被 storage、precompile 和数据库访问淹没；在大量简单 opcode、短 call、重复 ERC-20/AMM 操作中，interpreter overhead 会更明显。

## 4.2 通用 abstraction 的代价

`revm` 的 generic framework 是优势，也是成本来源。

一个 L2 通常需要把自己的：

- transaction envelope；
- deposit；
- L1 fee；
- operator fee；
- block context；
- system transaction；
- precompile；
- resource accounting；
- custom opcode；

映射到 revm 的：

- `TxEnv`；
- `BlockEnv`；
- `CfgEnv`；
- `Handler`；
- `Journal`；
- `Frame`;
- `ExecutionResult`。

如果自定义逻辑不在 revm 的天然抽象边界内，就会出现：

```txt
Mantle tx
  ↓ conversion
revm tx/env
  ↓ execution
revm result/state
  ↓ conversion
Mantle receipt/state/fee result
```

这类转换未必是主要的 CPU 消耗，但会带来：

- 额外 clone；
- 临时对象；
- 生命周期复杂度；
- 类型暴露；
- 版本升级风险；
- custom state 和 revm state 的双向同步；
- 并行执行时无法直接共享内部类型。

Rise 的公开 issue 正是把这种问题描述为 sequential-first 外部 EVM 带来的 unwanted type conversions 和额外 overhead。

## 4.3 `Journal` 更适合顺序执行

`revm` 的 journal 负责：

- 记录 state load；
- 记录 state modification；
- 管理 revert；
- 处理 nested CALL/CREATE；
- 处理 warm/cold state；
- 在 transaction 完成后生成 state diff。

这种结构非常适合顺序执行：

```txt
tx 1
 ├── mutable journal
 ├── nested frame
 ├── revert entries
 └── commit

tx 2
 └── reuse updated journal
```

但并行执行需要：

- 多个 worker 同时读状态；
- 每个 transaction 记录 read set/write set；
- 允许多个 speculative version；
- 在冲突后回滚和重执行；
- 最终按照交易顺序提交。

如果直接把一个顺序型 journal 放到多个线程中，通常会遇到：

- `Send` / `Sync` 不满足；
- mutable aliasing；
- journal lock；
- state clone；
- nested frame revert 状态难以拆分；
- `revm` state types 和并行 state types 之间转换；
- conflict metadata 无法自然记录。

这并不意味着 revm 不能用于并行 EVM，而是意味着并行逻辑通常需要在 revm 之外增加一层 MVCC、wrapper 或 fork。

## 4.4 JIT 不是普通 interpreter 的免费升级

JIT 执行需要解决：

- EVM bytecode 到 machine code 的编译；
- jump target 识别；
- stack representation；
- memory bounds；
- gas checks；
- host callback；
- CALL/CREATE frame transition；
- self-modifying code 语义；
- precompile；
- debugger/inspector；
- invalidation；
- code cache；
- compilation warm-up；
- native code 安全边界。

因此，JIT 并不是简单把 `match opcode` 换成 LLVM。

`revmc` 方向已经证明 EVM JIT 可以在特定 workload 上取得很大收益，但它与传统 revm interpreter 是两个不同的工程路径。`evm2` 把 JIT/AOT 目录、interpreter、custom EVM 和统一测试路径放在同一个 workspace，目标是减少两套执行器之间的语义漂移。

---

# 5. `evm2` 的核心工程优化

## 5.1 `evm2` 是 revm 的重新实现，而不是语义新设计

`evm2` 官方 `AGENTS.md` 明确要求：

- 以 `bluealloy/revm` 为 baseline；
- 保持 revm semantics；
- 保持 control flow；
- 保持 gas accounting；
- 保持 host interaction shape；
- 这是 work-in-progress；
- 没有 public API stability guarantees。

因此，`evm2` 的目标不是：

```txt
重新定义 EVM
```

而是：

```txt
保持既有 EVM 行为
+ 重写执行热路径
+ 重新设计定制边界
+ 为 JIT/AOT/parallel execution 提供基础
```

这是理解两者关系的关键。

---

## 5.2 更紧凑的 interpreter

`evm2` README 对性能收益的官方解释是：

- tighter interpreter；
- static dispatch tables；
- cheaper instruction plumbing。

### revm 的传统路径

简化表示：

```txt
let opcode = code[pc];
let handler = instruction_table[opcode as usize];
let result = handler(&mut cx);
```

### evm2 的 packed dispatch 思路

`evm2` 的 dispatch backend 支持：

- `auto`；
- `tco`；
- `packed`；
- `single_return`；
- `unpacked`。

这些选项由 `EVM2_DISPATCH_BACKEND` 控制，官方测试说明中也将 interpreter、JIT 和 AOT 作为独立执行路径验证。

根据 `evm2` 官方 dispatch backend 的实现和 benchmark commit，`packed` 路径的核心思路是把部分 interpreter cursor metadata 放到一个 packed word 中，例如：

```txt
packed cursor
 ├── program counter
 ├── stack length
 └── dispatch metadata
```

于是每个 opcode handler 不需要通过多个结构字段反复读取和写回：

```txt
let pc = interpreter.program_counter;
let stack_len = interpreter.stack.len();
let opcode = code[pc];
...
interpreter.program_counter = next_pc;
```

而可以更接近：

```txt
let cursor = packed_cursor;
let opcode = decode_opcode(cursor);
let result = handler(cx, cursor);
packed_cursor = result.next_cursor;
```

这个代码片段是机制示意，具体字段布局应以 evm2 当前 `packed.rs` 为准。

官方 `evm2` PR/commit 的 benchmark notes 显示，packed backend 在 `snailtracer`、`burntpix`、`onchain_lm_v2`、ERC-20 和 mainnet replay 等 workload 上，通常带来几个百分点到接近 10% 的 interpreter-side 改善；不同 CPU、编译器、code layout 和 workload 会出现噪声，不能把这些数字理解成固定的节点端到端加速。

这也解释了为什么 README 的“up to 2x”需要谨慎解读：

- 它可能包含较适合 interpreter 优化的 workload；
- 可能使用不同版本的 revm；
- 可能排除 DB、trie、RPC、receipt、precompile；
- 可能是单 transaction 或 bytecode benchmark；
- 不代表一个真实 Mantle block 一定加速 2 倍。

---

## 5.3 Typed `EvmTypes` 与编译期扩展

`evm2` 官方 README 给出了一个自定义 EVM 示例：

```txt
enum CustomSpecId {
    Custom,
}

struct CustomTypes;

impl EvmTypes for CustomTypes {
    // custom transaction, block, host, state types
}

#[instruction(EvmTypes = CustomTypes)]
fn l1_blocknumber(cx: _) -> out {
    *out = Word::from(
        cx.state.host()
            .block_env()
            .ext
            .l1_block_number
    );
}

fn main() -> Result<()> {
    let spec_id = CustomSpecId::Custom;

    let mut evm =
        Evm::<CustomTypes>::new(spec_id, ..);

    let tx = CustomTx { .. };

    let executed = evm.transact(&tx)?;
    let result = executed.commit();

    Ok(())
}
```

这个 API 表达了一个重要区别：

```txt
custom behavior
   ↓
custom type family
   ↓
compile-time instruction context
   ↓
specialized execution path
```

而不是：

```txt
generic revm EVM
   ↓
运行时判断
   ↓
wrapper
   ↓
额外转换
   ↓
chain-specific behavior
```

对 Mantle 来说，这个方向的价值可能体现在：

- 自定义 L1 fee；
- operator fee；
- system transaction；
- deposit transaction；
- preconfirmation context；
- L1 block number；
- sequencer timestamp；
- custom state extension；
- PropAMM 相关的 system call；
- future application-specific transaction type。

`evm2` 还在持续补充自定义 instruction extension。例如，官方 example/commit 展示了通过 closure 包装 `SSTORE`，让链可以插入 storage credit 或额外计费逻辑，而不必复制整段 `SSTORE` 实现。这个方向对 Mantle 很有价值，但也暴露出一个事实：**这些 extension boundary 仍然在快速演进。**

---

## 5.4 更便宜的 instruction plumbing

EVM opcode 本身通常不复杂，真正影响性能的可能是外围 plumbing：

- interpreter state 读写；
- gas tracker；
- stack cursor；
- host context；
- result enum；
- frame transition；
- error propagation；
- transaction borrow/clone；
- state diff ownership。

`evm2` 的部分优化包括：

- packed cursor；
- 减少每 opcode 的返回值搬运；
- handler 返回 remaining gas 而不是 gas spent；
- owned error result；
- 更紧凑的 halt/stop code；
- 尽量 borrow transaction；
- 将 custom types 直接放入 execution context；
- 降低 host/instruction 之间的转换。

这些优化往往不会在单个 opcode 的代码里显得很大，但会在数亿条 opcode 的 block replay 中积累。

---

## 5.5 JIT/AOT 集成

`evm2` workspace 目前包含 `crates/jit`，官方测试说明也明确把 interpreter、JIT、AOT suites 放在同一套测试命令下。

但需要把 capability 和 maturity 分开：

| 问题 | 当前判断 |
| --- | --- |
| 是否已经有 JIT 方向 | 是 |
| 是否和 interpreter 使用同一套 EVM semantic baseline | 目标是这样 |
| 是否已经是稳定公共 API | 否 |
| 是否已经适合 Mantle 生产 consensus path | 需要独立验证 |
| 是否适合先用于 simulator / block builder | 更适合 |
| 是否能自动提升所有 transaction 性能 | 不能保证 |
| 是否需要考虑 compile warm-up 和 code cache | 必须 |

JIT 在 Mantle 的第一个适合落地位置，可能不是所有 validator 的共识执行路径，而是：

- sequencer transaction simulation；
- PropAMM JIT Router；
- block builder candidate evaluation；
- MEV bundle replay；
- preconfirmation quote validation；
- historical block replay；
- RPC `eth_call` / trace acceleration。

如果 Mantle 的链上共识路径没有准备好统一 pin、reproducible build、JIT code cache 和 deterministic host behavior，不应该直接把 JIT 当作共识执行器。

---

## 5.6 Async host I/O

`evm2` 的 feature flag 中有：

```txt
async = ["std"]
```

官方 README 将其描述为通过 stackful coroutine 提供 asynchronous host I/O。

这对于：

- remote state；
- witness-backed state；
- lazy code loading；
- async database；
- prefetch；
- simulation backend；

很有吸引力。

但是，异步 DB 不一定会让单个 transaction 更快。它只有在以下场景才可能带来收益：

- host I/O 本身占比较高；
- 多个 state read 可以重叠；
- 数据库支持并行读取；
- coroutine 切换成本低于阻塞等待；
- state cache 命中率足够高。

如果 Mantle 的状态已经全部在本地内存或高命中 cache 中，async host 可能只是额外复杂度。

---

## 5.7 BAL-aware parallel execution

`evm2` 的 `bal_parallel.rs` 示例值得单独关注。

其大致流程是：

```txt
1. 预先建立 Block Access List
2. 为每个 transaction 创建独立 EVM/worker
3. worker 读取 pre-block DB + shared BAL
4. transaction i 读取此前 transaction 的写入
5. worker 返回 owned state/result
6. 主线程按照 transaction order fold
7. 更新下一轮 BAL 和 state
8. 验证最终结果
```

它体现了一个重要架构：

```txt
parallel workers
   ↓
independent transaction execution
   ↓
shared versioned/access-aware state
   ↓
ordered deterministic fold
```

但是必须注意：

- evm2 不会自动生成完整 BAL；
- evm2 不会自动决定 transaction scheduling；
- evm2 不会自动解决冲突重执行；
- evm2 不会自动让 Mantle 的现有 block format 支持 BAL；
- 是否能用于 Mantle，取决于 Mantle 是否采用 EIP-7928 或自己的 access-list 方案。

因此，这个能力更适合作为 Mantle 未来 parallel EVM 的架构参考，而不是当前迁移到 evm2 的直接理由。

---

# 6. 为什么会产生从 `revm` 切换到 `evm2` 的需求

## 6.1 需求一：EVM interpreter 热路径已经成为可优化对象

当链的 workload 主要由以下操作组成时，interpreter overhead 更容易显现：

- ERC-20 transfer；
- 高频 AMM swap；
- 简单账户转账；
- 小型 router；
- 高频短 call；
- 交易所风格的重复函数；
- 大量相同合约字节码；
- block replay；
- simulation。

这类 workload 的数据库访问可能已经被 cache 隐藏，剩下大量：

- opcode dispatch；
- stack 操作；
- jump；
- memory；
- gas tracking；
- call frame transition。

evm2 的 tighter interpreter、packed dispatch 和 static dispatch table 正好针对这一段。

## 6.2 需求二：链开始需要自己的 EVM，而不是只使用通用 EVM

L2/L3 越来越多地引入：

- 自定义 transaction；
- deposit；
- system transaction；
- L1 fee；
- operator fee；
- resource dimension；
- custom precompile；
- custom block environment；
- application-specific execution；
- parallel access metadata。

如果每个项目都在 revm 上做 downstream fork，常见结果是：

```txt
upstream revm
   ├── op-revm
   ├── base-revm wrapper
   ├── mega-evm
   ├── rise downstream fork
   └── project-specific patches
```

随着 fork 数量增加，维护成本包括：

- upstream merge；
- semantic drift；
- API break；
- conflict resolution；
- state type conversion；
- custom transaction envelope duplication；
- inspector compatibility；
- test fixture duplication。

`evm2` 的目标是把 custom EVM 作为核心 API，而不是每个项目单独修改外围。

## 6.3 需求三：并行执行需要新的 state model

如果链目标是：

- 更高 block gas limit；
- 更低 execution latency；
- 1 秒甚至更短 block；
- 交易级并行；
- state access list；
- parallel prefetch；
- block-level access list；

那么仅优化 sequential interpreter 不够。

需要同时优化：

```txt
transaction representation
+ state representation
+ host API
+ read/write set
+ scheduler
+ conflict detection
+ commit path
+ trie/state root
```

Rise 官方 issue 的核心观点就是：一个以顺序执行为中心的外部 EVM，在并行执行场景下会引入不必要的类型转换和状态管理成本。

## 6.4 需求四：把 JIT/AOT 作为一等执行路径

如果 EVM engine 未来要支持：

```txt
interpreter
JIT
AOT
parallel interpreter
zk-friendly interpreter
```

那么最好从一开始就设计：

- 稳定的 host boundary；
- 可复用的 semantic tests；
- 可复用的 transaction types；
- 可复用的 error model；
- 可复用的 precompile interface；
- 可复用的 state result；
- 明确的 frame/stack ABI。

如果 JIT 是在一个已经高度绑定 revm interpreter internals 的系统上后加，通常会出现：

- JIT 自己复制一套 transaction conversion；
- JIT 和 interpreter 的错误语义不一致；
- custom opcode 只在一个 engine 上生效；
- trace 行为不同；
- gas edge case 分叉；
- state commit 逻辑重复。

evm2 的设计目标就是减少这种分叉。

---

# 7. `revm` 的限制应该如何准确表述

不建议写成“revm 不好”或者“revm 性能差”。更准确的工程表述是：

| revm 的设计限制 | 实际影响 | evm2 是否解决 |
| --- | --- | --- |
| 传统 interpreter loop 和 function-pointer dispatch | 小 opcode workload 有额外 per-op overhead | 主要解决 |
| 通用 Context/Handler/Inspector 抽象 | 灵活，但 custom path 可能有额外 plumbing | 部分解决 |
| sequential-first state/journal | 并行执行需要外部 MVCC 和转换 | 部分解决 |
| transaction 和 state 类型容易泄漏到上层 | 上游升级和 fork 维护困难 | 目标上解决 |
| JIT 不是传统 revm core 的默认路径 | 需要额外 compiler/runtime integration | evm2 workspace 集成，但仍实验性 |
| trace/inspector per-op callback | trace 开启时热路径开销明显 | 没有自动解决 |
| state DB / trie / receipt / witness | execution hot loop 优化无法替代 I/O | 没有解决 |
| precompile runtime | 大型 precompile 的成本主要在 native crypto | 需要单独 benchmark |
| fork/API 版本升级 | 下游项目可能需要修改大量适配代码 | evm2 自身 API churn 更高 |
| 生态兼容性 | revm 拥有大量现成集成 | evm2 目前明显落后 |

其中最重要的是最后两行：

> `evm2` 的性能潜力更高，不代表迁移后的系统工程成本更低。

---

# 8. Base、Rise、MegaETH 的公开证据

## 8.1 Base：公开状态更像并行迁移和差分验证

Base 当前公开 `Cargo.toml` 同时包含：

```txt
revm = { version = "42.0.1", default-features = false }

evm2 = {
    git = "https://github.com/alloy-rs/evm2",
    rev = "9b037449c846515624ff6afde739f2b764851446",
    default-features = false
}
```

同时还有：

```txt
base-common-evm
base-common-evm2
```

但 Base 官方 docs index 对 `evm2` 的描述是：

> Base 的 EVM2 integration scaffold，当前 mirror stock Ethereum，没有接入 node，用于与 revm 做 differential testing。

当前 Base EVM README 仍然说明它基于 revm `SpecId`，并提供 `BaseEvm`、`BaseEvmFactory`、`BaseBlockExecutor` 等 revm 路径。

因此报告里建议这样写：

> Base 已经把 evm2 纳入公开工程路线，并开始构建 Base-specific transaction family、block executor 和 parity harness；但从公开代码看，生产 node 执行路径仍以 revm 为主，不能把它描述为已经完成的 revm→evm2 production migration。

这比“Base 已经切换到 evm2”准确得多。

## 8.2 Rise：并行执行和自有 VM 控制权

Rise 官方 issue 明确表达了三类需求：

1. thread-safe types；
2. parallel-friendly state；
3. native cache/instrumentation；
4. 避免 sequential-first revm 带来的转换和 lazy overhead。

Rise 的 `pevm` README 也明确把项目定位为并行 EVM engine，并标注仍处于 work in progress、尚未 production ready。

所以你给出的 Hai/Rise X 帖可以作为“团队观察到上游 revm 不能很好满足其并行和 cache 需求”的线索，但不能直接据此得出：

```txt
某个 revm 新版本一定比旧版本慢
```

更可能的因果链是：

```txt
downstream fork
+ register optimization
+ opcode fusion
+ smart inlining
+ workload-specific cache
+ parallel-aware state
+ custom scheduler
```

共同产生了收益。

## 8.3 MegaETH：公开代码仍以 revm 为基线

MegaETH 的公开文档明确表示：

- `MegaEVM` built on `revm` and `op-revm`；
- standard EVM semantics inherited from Optimism；
- MegaETH-specific behavior 通过 custom spec、resource limits 和 state management 加入。

MegaETH 已经在公开代码中实现了：

- multidimensional resource limits；
- access tracking；
- block environment tracking；
- custom fork ladder；
- Mega-specific system behavior。

这说明它确实遇到了“通用 revm 外围适配逐渐变重”的问题，但目前没有公开证据证明它已经迁移到 evm2。

---

# 9. 其他活跃 EVM 实现

## 9.1 evmone：C++ 热路径优化最值得研究

evmone 是 C++20 实现，暴露 EVMC API，并提供 baseline interpreter 和 advanced interpreter。官方 README 对 advanced interpreter 的描述包括：

- indirect call threading；
- 载入后将 EVM program 变成函数指针表；
- 对 instruction block 预计算 gas cost 和 stack requirements；
- 在执行前进行更重的 bytecode analysis。

这和 evm2 的方向有明显相似性：

```txt
revm:
  per-opcode dispatch
  per-opcode gas/stack handling

evmone advanced:
  bytecode pre-analysis
  block-level gas/stack metadata
  indirect threaded dispatch

evm2:
  packed cursor
  static dispatch backends
  tighter instruction plumbing
```

evmone 的代价是：

- C++ integration；
- EVMC host ABI；
- FFI/callback；
- precompile build dependency；
- advanced interpreter 的前置分析成本。

官方 README 还提醒，`expmod` 完整实现依赖 GMP，`ecrecover` 的实现存在性能限制。

对 Mantle 的启示是：

> 不是只有“换一套 Rust EVM”这一条优化路线。bytecode analysis、block metadata、indirect threading、stack representation 同样值得独立实现和 benchmark。

## 9.2 EVMC：标准化 VM/Client 边界

EVMC 定义了 VM 与 client 之间的低级接口。其 host interface 包括：

- `account_exists`；
- `get_storage`；
- `set_storage`；
- `get_balance`；
- `get_code_size`；
- `get_code_hash`；
- `copy_code`；
- `call`；
- `get_tx_context`；
- `get_block_hash`；
- `emit_log`；
- `access_account`；
- `access_storage`；
- transient storage。

它的优势是：

```txt
client
  ↓ EVMC host ABI
evmone / other VM
```

可以更容易替换 VM。

缺点是：

- C ABI；
- callback 成本；
- 跨语言边界；
- Rust 生态支持不如原生 trait；
- 复杂 custom EVM 可能被 ABI 限制。

Mantle 不一定需要直接采用 EVMC，但可以借鉴其思想：**把 EVM engine 的 host boundary 收敛成稳定、低耦合的接口。**

## 9.3 Geth EVM：参考实现和生态兼容性最强

Geth 的 `core/vm` 直接与 Go 的 `StateDB`、block context、transaction context、jump table、precompile 和 tracing 系统耦合。官方源码可以看到 EVM 对：

- `BlockContext`；
- `TxContext`；
- `StateDB`；
- fork-specific jump table；
- precompile；
- jump destination cache；

进行组织。

Geth interpreter 同时存在：

- untraced fast path；
- traced/table path；
- EIP/fork-specific execution path。

它的优势是：

- canonical Ethereum client；
- reference behavior；
- 大量 state test；
- RPC/debug tooling；
- 生态兼容性。

它的限制是：

- Go-specific `StateDB` interface；
- 不适合作为一个干净的 Rust library；
- runtime/GC 和 Rust 原生执行路径不同；
- custom L2 项目需要大量 Go-side integration。

因此 Geth 更适合作为 Mantle 的 differential oracle，而不是直接作为 Mantle 的 EVM library。

## 9.4 Besu：Java EVM 与企业级生态

Besu 是 Apache-2.0 的 Java Ethereum client，强调企业级、私有网络、插件和 reference test 能力。

Besu 的 EVM 代码中还存在独立的 EVM v2 优化路径，这个名称与 Alloy 的 `evm2` 没有关系。其优化方向包括：

- `long[]` stack representation；
- 常见 opcode 的 specialized static path；
- 直接 operation dispatch；
- 对 PUSH 等 opcode 做单 limb / 多 limb 分支；
- 将最热的 `runToHalt` 路径与优化版本分开。

这说明一件重要的事：

> stack layout 和 specialized opcode path 本身就可能产生较大收益，性能优化不等于必须重写整个 EVM framework。

Besu 对 Mantle 的主要借鉴价值是：

- stack representation；
- JVM JIT 对热路径的优化；
- reference test；
- enterprise plugin boundary。

## 9.5 Nethermind：zero-allocation stack 和 parallel pre-execution

Nethermind 官方 README 对 EVM 性能的描述包括：

- direct opcode dispatch；
- hardware-accelerated bitwise operations；
- execution stack 不进行 heap allocation；
- parallel pre-execution 预热 state reads；
- 插件系统扩展 transaction、consensus、RPC 和 L2。

对 Mantle 最有价值的不是 .NET runtime，而是三个设计思想：

1. **stack allocation 生命周期应被单独优化；**
2. **状态读取预热可以放到执行主循环之前；**
3. **L2 扩展应通过 plugin boundary，而不是直接修改核心 VM。**

Nethermind 的 pooled `ExecutionEnvironment` 也说明，减少 execution object 和 GC/write barrier 成本是独立优化维度。

## 9.6 Erigon：EVM 和 full-node pipeline 分开看

Erigon 的主要优势更多来自：

- staged sync；
- state storage；
- database layout；
- ETL；
- execution pipeline；
- block processing architecture。

不能把 Erigon 的 full-node throughput 直接归因给某个 EVM interpreter。

这对 Mantle 很重要：

> 如果 Mantle 的 block latency 主要消耗在 state DB、trie、receipt、commit 或 sync pipeline，那么单独更换 revm 不一定是最优先事项。

## 9.7 ethrex LEVM：Rust 生态中的另一条路线

ethrex 是 Rust 编写的 L1/L2 execution client，具有 ZK-native 方向。其 `ethrex_levm` 是独立的纯 Rust EVM，包含：

- VM；
- CallFrame；
- Memory；
- Stack；
- Substate；
- Precompiles；
- Environment；
- GeneralizedDatabase；
- pre/post execution hooks；
- L2-specific behavior。

它还在部分路径中使用共享 stack/memory pool 和 rayon-gated parallel execution。

它的工程价值在于：

- 不依赖 revm；
- 更容易控制内部 state layout；
- 对 ZK/prover 的边界更明确；
- 适合比较“重新设计 EVM core”与“在 revm 上扩展”之间的差异。

但目前不能仅凭公开 benchmark 把它判定为比 revm 或 evm2 更快。

## 9.8 rust-ethereum/evm：活跃但不是主流 Ethereum EL

`rust-ethereum/evm` 仍是可定制的纯 Rust EVM，支持：

- standalone；
- Cargo library；
- shared library；
- no\_std；
- WASM；
- 自定义 opcode；
- precompile；
- gasometer。

它在 Polkadot Frontier 等场景有生产使用，但在 Ethereum 主流 execution clients 中的采用度明显低于 revm。

## 9.9 Guillotine：研究方向，不应列为生产候选

Guillotine 是 Zig 编写的新 EVM，README 明确标注：

- Early Alpha；
- DO NOT USE IN PRODUCTION；
- repository in flux。

它的研究方向包括：

- Zig `comptime`；
- data-oriented stack frame；
- indirect threading；
- opcode fusion；
- batched gas/stack analysis；
- differential testing。

但官方状态已经足够说明：它可以作为研究对象，不能作为 Mantle 当前的生产替换候选。

---

# 10. 如何做公平的性能比较

EIP-7904 的 Gas Cost Estimator 报告是一个非常有价值的 benchmark 参考。它曾经对以下实现进行统一测试：

- evmone；
- Geth；
- Erigon；
- EthereumJS；
- Nethermind；
- revm；
- Besu。

报告明确说明：

- 每个 EVM 独立运行；
- host object 和 storage 使用 mock 或最小实现；
- 通过重复 opcode 估算单 opcode runtime；
- 控制 cache、warm-up、GC、OS、硬件和 process noise；
- 不测完整 node sync；
- 不包括完整 state persistence；
- 不应该把 isolated EVM benchmark 当成 full-node latency。

报告还指出：

- CALL、STATICCALL、DELEGATECALL 的 subcontext 创建成本高；
- memory operation 的实际成本高于直觉；
- KECCAK 的成本高于 nominal gas；
- Geth、Erigon、Nethermind 的 jump 成本相对更高；
- evmone 的部分 elliptic-curve precompile 路径表现较好；
- Revm 在 call/subcontext 方面的表现相对较好。

因此 Mantle 需要至少做三层 benchmark。

## 10.1 Level 1：VM microbench

固定：

- CPU；
- compiler；
- Rust version；
- optimization flags；
- hardfork；
- revm commit；
- evm2 commit；
- cold/warm code；
- trace on/off；
- precompile feature；
- host implementation。

测试：

```txt
ADD / MUL / DIV / MOD
SHL / SHR / SAR
PUSH / DUP / SWAP
JUMP / JUMPI
MLOAD / MSTORE / MCOPY
CALL / STATICCALL / DELEGATECALL
SLOAD / SSTORE
KECCAK256
CREATE / CREATE2
ECRECOVER
BN254
P256VERIFY
KZG
MODEXP
BLS12-381
```

指标：

- ns/op；
- cycles/op；
- instructions/op；
- branches/op；
- branch misses；
- allocation；
- code cache hit；
- host callback count；
- p50/p95/p99。

## 10.2 Level 2：真实 transaction replay

使用 Mantle 真实 block traces，并加入：

- ERC-20；
- AMM；
- lending；
- bridge；
- system transaction；
- deposit；
- fee-heavy transaction；
- contract deployment；
- nested CALL/CREATE；
- revert-heavy workload；
- precompile-heavy workload。

记录：

- tx/s；
- gas/s；
- block execution latency；
- p50/p95/p99；
- database reads；
- database writes；
- journal entries；
- state diff size；
- code cache hit；
- warm/cold ratio；
- precompile time；
- trace time；
- allocation；
- clone count；
- retry count。

## 10.3 Level 3：完整 block pipeline

测量：

```txt
block import
 → transaction validation
 → state reads
 → EVM execution
 → receipt
 → state diff
 → trie update
 → state root
 → persistence
 → witness/proof
 → RPC/Engine API
```

这一步才接近 Mantle 实际节点性能。

如果 EVM interpreter 只占整个 block latency 的 30%，即使 evm2 在这一部分做到 2 倍，Amdahl 定律给出的整体上限也只有：

```txt
S = 1 / ((1 - 0.30) + 0.30 / 2)
  ≈ 1.176
```

也就是约 17.6% 的整体提升。

如果 interpreter 只占 10%，那么 2 倍 interpreter 加速带来的端到端提升只有约 5.3%。

---

# 11. Mantle 与其他 EVM 相比，当前 revm 可能缺少的能力

这部分建议内部不要写成“revm 缺陷清单”，而应写成“Mantle 当前执行层可补齐的能力”。

## 11.1 VM-neutral interface

当前最优先的改进不是立刻换 evm2，而是避免 Mantle 业务代码直接依赖 revm：

```txt
trait MantleEvm {
    type Tx;
    type Block;
    type State;
    type Error;
    type Result;

    fn transact(
        &mut self,
        tx: &Self::Tx,
    ) -> Result<Self::Result, Self::Error>;

    fn transact_commit(
        &mut self,
        tx: &Self::Tx,
    ) -> Result<Self::Result, Self::Error>;
}
```

上层只依赖：

- `MantleTx`；
- `MantleBlockEnv`；
- `MantleExecutionResult`；
- `MantleStateDiff`；
- `MantleReceipt`。

内部再分别实现：

```txt
MantleEvm for RevmBackend
MantleEvm for Evm2Backend
MantleEvm for JitBackend
```

这样即使 evm2 迁移失败，Mantle 也不会被迫回滚整个上层架构。

## 11.2 Execution result normalization

至少统一：

```txt
struct MantleExecutionResult {
    status: ExecutionStatus,
    gas_used: u64,
    gas_remaining: u64,
    logs: Vec<Log>,
    return_data: Bytes,
    state_diff: StateDiff,
    created_address: Option<Address>,
    touched_accounts: AccessSet,
}
```

禁止上层直接使用：

- `revm::ExecutionResult`；
- `revm::State`;
- `revm::Journal`;
- `revm::Account`;
- `revm::Bytecode`。

这些应放在 backend adapter 内部。

## 11.3 Precompile registry

Mantle 应将 precompile 统一抽象为：

```txt
trait MantlePrecompile {
    fn address(&self) -> Address;
    fn execute(
        &self,
        input: &[u8],
        gas_limit: u64,
        context: &PrecompileContext,
    ) -> PrecompileResult;
}
```

这样可以独立比较：

- revm precompile；
- evm2 precompile；
- native C/Rust implementation；
- ZK-friendly implementation；
- custom Mantle precompile。

## 11.4 State access abstraction

未来如果 Mantle 做并行或 BAL，当前 `Database` 接口可能不够，需要额外抽象：

```txt
trait VersionedState {
    fn read_account(
        &self,
        address: Address,
        version: TxVersion,
    ) -> StateRead;

    fn read_storage(
        &self,
        address: Address,
        slot: B256,
        version: TxVersion,
    ) -> StateRead;

    fn record_read(
        &mut self,
        location: StateLocation,
    );

    fn record_write(
        &mut self,
        location: StateLocation,
        value: StateValue,
    );
}
```

`revm` backend 可以先通过 journal adapter 实现，evm2/BAL backend 再使用更原生的 versioned state。

---

# 12. Mantle 应该如何推进

## Phase 0：先确认当前瓶颈

需要先回答：

1. Mantle 当前 block execution 中，EVM interpreter 占多少 CPU？
2. State DB read/write 占多少？
3. trie/receipt/commit 占多少？
4. precompile 占多少？
5. trace/debug 开启后占多少？
6. 是否存在大量相同 code 的重复执行？
7. 是否计划提高 block gas limit？
8. 是否计划 parallel EVM？
9. 是否需要 custom transaction family？
10. 是否计划 JIT simulation 或 PropAMM quote engine？

如果当前瓶颈是 state DB 或 trie，那么先换 evm2 可能不是最优收益。

## Phase 1：把 revm 封装在 Mantle-owned interface 后面

这是 P0 级别工作：

- 统一 transaction types；
- 统一 execution result；
- 统一 precompile interface；
- 统一 state diff；
- 统一 error；
- 统一 trace；
- 统一 block context；
- 统一 feature flags；
- 将 revm 类型限制在一个 adapter crate。

## Phase 2：建立 revm↔evm2 differential harness

每笔 transaction 都比较：

```txt
status
gas_used
gas_remaining
return_data
logs
created_address
account nonce
account balance
account code
storage slots
selfdestruct result
warm/cold behavior
refund
L1 fee
operator fee
receipt
```

重点测试：

- nested CALL；
- nested CREATE；
- CREATE2；
- REVERT；
- OOG；
- SELFDESTRUCT；
- EIP-7702；
- deposit；
- system transaction；
- zero-value / non-zero-value transfer；
- fee-on-transfer；
- precompile failure；
- warm/cold transition；
- state rollback；
- block boundary；
- fork activation boundary。

Base 的公开 evm2 工作本身已经显示，迁移难点不只是“opcode 能不能跑”，而是：

- custom transaction；
- deposit semantics；
- fee completeness；
- rollback；
- sender warmth；
- receipt；
- operator fee；
- L2-specific state。

这正是 Mantle 需要重点关注的地方。

## Phase 3：分别 benchmark interpreter、transaction、block pipeline

不要只测：

```txt
revm vs evm2: benchmark bytecode
```

而要测：

```txt
revm vs evm2:
  1. opcode microbench
  2. transaction replay
  3. block execution
  4. trie/commit
  5. witness/proof
  6. parallel scheduler
```

## Phase 4：先在非共识路径使用 evm2

比较适合的试点：

- Mantle transaction simulator；
- PropAMM JIT Router；
- block builder；
- MEV bundle replay；
- preconfirmation quote validation；
- historical replay；
- `eth_call`；
- debug trace；
- off-chain risk engine。

对于 Mantle 的 PropAMM，evm2 如果能显著降低：

- quote simulation latency；
- route replay latency；
- JIT re-quote latency；
- quote-to-fill validation latency；

即使暂时不替换共识执行器，也能先产生业务价值。

这与用户此前设计的 JIT Router 和 maker price update preconfirmation 很匹配：执行器的目标首先是让报价、模拟和实际 fill 更接近，而不是简单追求一个 abstract benchmark。

## Phase 5：canary 与 shadow execution

建议生产迁移顺序：

```txt
revm primary
evm2 shadow
    ↓
compare result
    ↓
collect divergence
    ↓
fix parity
    ↓
evm2 canary
    ↓
small validator/sequencer subset
    ↓
evm2 primary + revm fallback
```

至少要保留：

- exact evm2 commit；
- exact Rust toolchain；
- exact LLVM version；
- reproducible build；
- revm fallback；
- block replay tool；
- divergence database；
- emergency rollback。

---

# 13. 推荐的内部决策结论

## 不建议现在做的事情

不建议基于以下证据直接做生产切换：

- “evm2 README 说 up to 2x faster”；
- “Base 似乎切了”；
- “Rise 说 revm 慢”；
- “JIT 未来一定更快”；
- “interpreter benchmark 更快，所以 block 一定更快”。

这些都不足以证明 Mantle 的真实 workload 会获得相同收益。

## 建议立即做的事情

### P0

1. 建立 Mantle-owned `Evm` abstraction；
2. 隔离 revm types；
3. 建立 revm/eVm2 differential harness；
4. 采集 Mantle 真实 block replay profile；
5. 固定 benchmark protocol；
6. 加入 EEST、Geth、EELS cross-check。

EELS 是 Ethereum 官方的 executable Python reference implementation，并提供验证 execution layer behavior 的 tests 和 fixtures；它适合做 semantic oracle，而不是 production EVM。

### P1

在不迁移的情况下，先从 revm 现有路径吸收其他实现的优化：

- EVM instance reuse；
- code cache；
- precompile address index；
- state warming；
- stack allocation reuse；
- 避免 transaction clone；
- 减少 receipt/result clone；
- 针对常见 opcode 做 specialized path；
- 预计算 jump destination；
- transaction-level state access prefetch；
- trace off 的 fast path；
- trace on 的低成本 instrumentation。

### P2

用 evm2 做两个独立 pilot：

1. simulation / PropAMM JIT；
2. block builder / sequencer candidate execution。

### P3

如果 Mantle 确实需要更高 block gas limit 或 parallel EVM，再评估：

- BAL；
- read/write set；
- MVCC；
- versioned state；
- deterministic ordered commit；
- evm2 BAL-aware execution；
- 自研 scheduler；
- JIT + interpreter hybrid。

---

# 最终判断

从工程角度，`evm2` 的出现说明 EVM 执行层正在从“通用、正确、可扩展的 interpreter library”演化成更加专门化的执行 substrate：

```txt
interpreter
+ static dispatch
+ custom transaction types
+ typed host boundary
+ JIT/AOT
+ parallel-aware state
+ workload-specific cache
```

`revm` 仍然是当前最成熟、最稳妥、生态最广的 Rust EVM。它的主要限制不是不能扩展，而是它的通用 abstraction、顺序执行 journal 和现有 API 形态，会让某些新需求需要大量外围工程。

`evm2` 的优势是真实存在的，尤其集中在：

- interpreter hot path；
- dispatch；
- custom EVM；
- transaction family；
- JIT/AOT；
- parallel-aware execution boundary。

但它的风险同样真实：

- 没有稳定 release；
- API 仍在变化；
- 生态采用度低；
- custom L2 semantics 仍在 parity hardening；
- “up to 2x”不是端到端节点保证；
- migration cost 可能高于 microbenchmark gain。

对 Mantle 最稳妥的工程路线是：

```txt
先抽象 VM 边界
→ 再做 revm/evm2 differential replay
→ 再做三层 benchmark
→ 先在 simulation / builder / JIT 路径试点
→ 最后才考虑共识执行路径切换
```

如果 Mantle 的下一阶段目标是提高 PropAMM/JIT Router 的模拟吞吐，evm2 值得尽快纳入实验；如果目标是 parallel EVM，则需要同时研究 state model、scheduler 和 BAL，而不能把“换成 evm2”当成完整答案；如果目标只是当前 block execution 更快，则应先确认 EVM interpreter 是否真的是主要瓶颈，再决定是优化现有 revm、迁移 evm2，还是直接优化 state DB、trie 和 block pipeline。

# notes-extension：定制边界、状态模型、并行 / BAL、异步 host、Inspector，以及 revm 的框架级限制

调研日期：2026-10-25。版本基线：
- `bluealloy/revm` main @ `ee9ab3f`（v120，revm 43.0.3）；tag `v107` = `d629331`（revm 38.0.0，Mantle 基线，**仍内含 crates/op-revm**）
- `alloy-rs/evm2` main @ `c8bb5a2`（2026-10-24）
- `risechain/pevm` @ `e94b0e3`；`base/base` @ `bcd96e2`；`alloy-rs/evm` @ `d7b5ed4`；`paradigmxyz/revm-inspectors` @ `d0ad9f6`（本路新克隆，0.44.3）
- `mantle-xyz/revm` tag `v107-mantle-arsia.2` = `835cb4e`；`mantle-xyz/reth` @ `574e7f3`

下文 “revm/” 指 `bluealloy/revm`，“evm2/” 指 `alloy-rs/evm2`。

---

## X-Q1 revm 的框架抽象，以及一个 L2（op-revm）要改哪些点

**答案**：revm 是一个**全泛型（单态化）框架**。`Evm<CTX, INSP, I, P, F>` 的 Context、Inspector、指令表、预编译、Frame 都是类型参数；`Context<BLOCK, TX, CFG, DB, JOURNAL, CHAIN, LOCAL>` 也是。交易流程由 `Handler` trait 的默认方法串起来（validate → pre_execution → execution → post_execution），L2 通过覆写 Handler 方法、替换 Tx/Cfg/Chain 类型、替换 PrecompileProvider 来定制。op-revm 在 v107 覆写了 8 个 Handler 方法，并把 L1 费用状态放在 `Context.chain` 槽里（`L1BlockInfo`）。

**依据**
- 核心对象：`Evm { ctx, inspector, instruction, precompiles, frame_stack, async_stack(cfg asyncdb) }`（revm/crates/context/src/evm.rs:11-28@ee9ab3f）；`Context` 的 7 个类型参数，其中 `journaled_state: JOURNAL`、`chain: CHAIN`（revm/crates/context/src/context.rs:18-41@ee9ab3f）；`ContextTr` 的关联类型 Block/Tx/Cfg/Db/Journal/Chain/Local（revm/crates/context/interface/src/context.rs:19-33@ee9ab3f）；`EvmTr` 的关联类型 Context/Instructions/Precompiles/Frame（revm/crates/handler/src/evm.rs:32-40@ee9ab3f），`FrameTr`（同文件:21）。
- Handler 各阶段：`Handler` trait（revm/crates/handler/src/handler.rs:73）；`run_without_catch_error` 依次调用 validate / pre_execution / execution / post_execution（同文件:164-198）；validate = validate_env + validate_initial_tx_gas + validate_against_state_and_deduct_caller（:201-206）；pre_execution = load_accounts + EIP-7702 授权（:237-262）；execution = first_frame_input + run_exec_loop + last_frame_result（:274-297）；post_execution = refund + EIP-7623 floor + reimburse_caller + reward_beneficiary（:343-372）。文档原话：状态变更不在返回值里，而留在 Context Journal 中，需要调用 `JournalTr::finalize` 取出（:69-72）。
- 其他扩展 trait：`PrecompileProvider<CTX>`（revm/crates/handler/src/precompile_provider.rs:11）、`Inspector<CTX, INTR, FI, FR>`（revm/crates/inspector/src/inspector.rs:18）、`Database`/`DatabaseCommit`/`DatabaseRef`（revm/crates/database/interface/src/lib.rs:65/105/148）、`JournalTr`（revm/crates/context/interface/src/journaled_state.rs:21）。指令表是运行时值 `[Instruction; 256]`（revm/crates/interpreter/src/instructions.rs:71），可用 `insert_instruction` 改（revm/crates/handler/src/instructions.rs:99）。
- op-revm @ v107（d629331）的定制点：
  - 交易类型：`OpTxTr: Transaction`（deposit 的 source_hash/mint/is_system_transaction）+ `OpTransaction<T> { base, enveloped_tx: Option<Bytes>, deposit }`（revm/crates/op-revm/src/transaction/abstraction.rs:17,39@d629331）。其中 `enveloped_tx` 是原始 EIP-2718 字节的副本，用来算 L1 data fee。
  - 硬分叉：`OpSpecId`（spec.rs:10）；预编译：`OpPrecompiles` 实现 `PrecompileProvider`（precompiles.rs:18,123）；结果：`OpHaltReason`（result.rs:7）。
  - Context 组装：`OpContext<DB> = Context<BlockEnv, OpTransaction<TxEnv>, CfgEnv<OpSpecId>, DB, Journal<DB>, L1BlockInfo>`（api/default_ctx.rs:10）；`OpContextTr` 约束 `Chain = L1BlockInfo`（api/exec.rs:26-34）；`transact_one` 用 `OpHandler` 跑交易（api/exec.rs:65-68）；`OpEvm` 包装 `Evm`（evm.rs:18）。
  - Handler 覆写（handler.rs@d629331）：`validate_env`（:83，deposit 跳过校验、post-Regolith 拒绝 system tx）；`validate_against_state_and_deduct_caller`（:106，deposit 先 mint 再扣费；非 deposit 时 `L1BlockInfo::try_fetch` 再扣 L1 cost）；`last_frame_result`（:186，Bedrock/Regolith 下 deposit 的 gas 报告规则）；`reimburse_caller`（:256，operator fee 退款）；`refund`（:276）；`reward_beneficiary`（:300，向 L1_FEE / BASE_FEE / OPERATOR_FEE 三个 vault 分账，:341-343）；`execution_result`（:351）；`catch_error`（:379，失败的 deposit 仍要提交 nonce/mint）。
  - L1 费用：`L1BlockInfo::try_fetch`（l1block.rs:134）、`tx_cost_with_tx`（:263）、`calculate_tx_l1_cost`（:286）。
- **op-revm 已不在 bluealloy/revm 仓库**：v107 有 crates/op-revm，v108 起没有（`git ls-tree` 逐 tag 检查）。revm book 现在把 op-revm 指向 `ethereum-optimism/optimism`（revm/book/src/architecture.md:74@ee9ab3f）。mega-evm 也从该 monorepo 取 op-revm（megaeth-labs/mega-evm/Cargo.toml:139@821577d）。
- Mantle 自己的 fork 在 v107 上不只改了 op-revm，还改了核心 crate（`git diff upstream-v107 v107-mantle-arsia.2`，共 57 个文件，+6697/−2622）：
  - `Gas::set_limit`，供 token_ratio 使用（mantle-xyz/revm/crates/interpreter/src/gas.rs:219@835cb4e）
  - `EvmStorageSlot::mark_warm_with_transaction_id` 的 original_value 重置条件改了，这是一处 journal 语义修改（crates/state/src/lib.rs:516@835cb4e）
  - 关闭 EIP-7825 tx gas cap（crates/context/src/cfg.rs:425@835cb4e）
  - halt 结果携带 Mantle deposit 的 mint 日志（crates/context/interface/src/result.rs:401,489@835cb4e）
  - 外加 op-revm 中新增的 `transaction/bvm_eth.rs`（+2303 行）

**不确定之处**：现行 op-revm（optimism monorepo）没有克隆，它在 v108 之后的 Handler 形态未核实。Mantle 的核心 crate 改动能否改写成纯 Handler 覆写（不 fork 核心），没有逐项评估。

---

## X-Q2 evm2 的定制边界：EvmTypes、自定义 spec / tx / host / opcode / precompile

**答案**：evm2 把**类型族**做成编译期参数（`EvmTypesHost` 有 10 个关联类型），把**按 spec 生成的指令表**做成 `&'static` 常量；但数据库、预编译、Inspector、交易 handler、JIT runner 都是**运行时类型擦除**（`Box<dyn …>`、按 tx type 字节查 `HashMap<u8, Arc<dyn ErasedTxHandler>>`）。所以它和 revm 的关系不是“编译期对运行时”，而是方向相反：
- revm 把所有组件都单态化，指令表是运行时可改的值，fork 判断在指令内部做运行时检查；
- evm2 只把“类型 + 指令表”单态化，组件边界走 dyn。

自定义 host 目前基本不支持，源码里写着 “Custom hosts aren't that well supported yet”。

**依据**
- `EvmTypesHost` 的关联类型：ConfigSelector、SpecId（须 `Into<SpecId>`）、Tx、EvmExt、MessageExt、MessageResultExt、TxEnvExt、TxResultExt、BlockEnvExt、`Host<'a>`（evm2/crates/evm2/src/evm/config.rs:22-54@c8bb5a2）。同一位置有 TODO：“Custom hosts aren't that well supported yet”（:20）。`EvmTypes` 是 blanket trait，要求 `Host<'a> = Evm<'a, Self>`（:57-59），所以公开 API 实际只接受 evm2 自己的 `Evm` 作为 host。
- 自定义 spec：`EvmConfig { BASE_SPEC_ID, OPCODE_CONFIG }` 与 `EvmConfigSelector::Config<const BASE, const CUSTOM>`（config.rs:65-88）。`ExecutionConfig` 持有两张 `&'static InstrTable`：`instructions` 与 `inspect_instructions`（:132-138）。表由 `for_each_spec!` 在编译期按每个 spec 生成（evm2/crates/evm2/src/interpreter/dispatch/mod.rs:171-205）。对照 revm：revm 只有一张表，指令内用 `check!` 宏在运行时判断 spec（revm/crates/interpreter/src/instructions/macros.rs:18-26@ee9ab3f）。
- custom_evm 完整示例：
  - `CustomSpecId` 映射到 base `SpecId::OSAKA`（examples/custom_evm/config.rs:11,45-50）
  - `impl EvmTypesHost for CustomTypes`，带 `BlockEnvExt = CustomBlockEnvExt { l1_block_number }`（:55-67）
  - `custom_opcode_config` 在 const fn 里 `set_instruction` 新增 0x0c / 0x0d 两个 opcode，并替换 SSTORE（:112-130）
  - selector 让 MainnetOsaka 和 CustomOsaka 共享 base spec，但用不同的表（:135-150）
  - opcode 用 `#[instruction(EvmTypes = CustomTypes)]` 写成，通过 `cx.state.host().block_env().ext.l1_block_number` 读扩展字段；`custom_sstore` 通过 `sstore_with` 闭包复用标准 SSTORE 并加附加费（examples/custom_evm/opcode.rs:23-41）
  - 自定义 tx：`TxRegistry::new().with_handler(0x7f, CustomEnvelope::as_execute_code, handler(prepare_code, execute_code))`，handler 自己构造 `MessageExt` 并调用 `host.execute_message`（examples/custom_evm/tx.rs:51-89）
  - Inspector 用 `set_inspector` 安装，取回时要 `downcast_ref`（examples/custom_evm/main.rs:160,174），说明它是类型擦除的
- 类型擦除的证据：
  - `Evm` 字段 `precompiles: Box<dyn PrecompileProvider<T>>`、`inspector: Option<InspectorSlot>`、`interpreter_runner: Option<Arc<dyn InterpreterRunner<T>>>`（evm2/crates/evm2/src/evm/mod.rs:220-226）；数据库为 `CacheDB<Box<dyn DynDatabase>>`（evm2/crates/evm2/src/evm/state/mod.rs:158）
  - `TxRegistry { handlers: Arc<HashMap<u8, Arc<dyn ErasedTxHandler<T, Output>>>> }`（evm2/crates/evm2/src/evm/registry.rs:350-352）；每笔交易先 `try_get_by_type(tx.ty())`，再走 dyn 调用（evm/mod.rs:1113-1116）
  - 由于擦除，`Send` 只能运行时断言：`evm_is_send::<D, P>()` 先核对擦除前的类型再置位（evm/mod.rs:633-644, 616-625）
- 静态钩子：`TxHandlerHooks { adjust_intrinsic_gas, before_execution, settle_transaction }` 作为泛型参数单态化（evm2/crates/evm2/src/evm/handler.rs:28-61）。Ethereum 的各 tx type 就是 `handler(prepare_with_hooks::<T, Hooks>, execute_prepared::<T, Hooks>)` 注册进 registry 的（evm2/crates/evm2/src/ethereum/mod.rs:226-256）。
- L2 实例（Base）：`BaseEvmTypes` 的设置为 `BlockEnvExt = L1FeeParams`、`EvmExt = BaseEvmExt`、`TxResultExt = BaseTxResultExt`（base/base/crates/common/evm2/src/types.rs:20-31@bcd96e2）；deposit（0x7e）作为独立 handler 注册，标准 tx 用 `BaseTxHandlerHooks` 注册，type 3 故意不注册（registry.rs:28-58）。L1 fee 和 operator fee 在 `before_execution` 里预扣，vault 分账在 `settle_transaction` 里做（handler.rs:108-167）。注释写明 Base “always Regolith-active”（registry.rs:60），没有 Bedrock 历史分支。
- 交易所有权：evm2 `transact(&Recovered<T::Tx>)` 借用共识 envelope（evm/mod.rs:1085），#779 “borrow transaction envelopes in erased handlers”（2026-10-24）。revm `transact(tx: Self::Tx)` 按值接收 TxEnv（revm/crates/handler/src/api.rs:72-75@ee9ab3f）。上游需要把共识 tx 转成 TxEnv，例如 alloy-evm 的 `FromRecoveredTx<TxEip1559> for TxEnv` 会 `access_list.clone()`（alloy-rs/evm/crates/evm/src/tx.rs:188-213@d7b5ed4）。
- `lazy_eip7702`：`LazyAuthorization::{Signed, Recovered}`，调用方可以传入已缓存的 authority 恢复结果，避免重复 ecrecover（evm2/crates/evm2/src/ethereum/lazy_eip7702.rs:16,87-92）；`TxEnvelope::Eip7702(LazyTxEip7702)`（ethereum/mod.rs:52）。
- 预编译：`PrecompileProvider<T>::execute(&mut self, evm: &mut Evm, message, gas)` 能拿到完整 host（evm2/crates/evm2/src/evm/precompile.rs:44-80）。`precompile_subcall` 示例在预编译里用 `Host::execute_message` 发起子调用（examples/precompile_subcall.rs:61-96）。这个示例用的是 `Precompiles::base(..).as_map_mut().insert(..)`，不是 `set_boxed_precompiles`；后者只是替换整个 boxed provider 的 setter（evm/mod.rs:784）。
- `account-ext`：feature 打开后，`AccountExtension(Option<ThinArc<(), u8>>)` 作为链自定义的账户负载（evm2/crates/evm2/Cargo.toml:169；src/evm/state/extension.rs:13）。revm v120 也加了同名 feature（#3894，2026-09-21 合并，作者 decofe）。
- JIT 接入点：`InterpreterRunner::run` 返回 `None` 时回退到解释器（evm/mod.rs:193-204）。

编译期特化与运行时的对比：

| 维度 | revm | evm2 |
|---|---|---|
| DB / Inspector / Precompile | 泛型参数，单态化 | `Box<dyn>`，类型擦除（DB 前有 CacheDB 一层） |
| 交易类型分派 | Handler 内 `tx_type()` 分支（op-revm 每个方法都判 deposit） | registry 按 type 字节查 HashMap，再 dyn 调用；handler 内部是具体类型 |
| fork / opcode 表 | 一张运行时表，指令内 `check!` 判断 spec | 每个 (base spec, custom spec) 一张 `&'static` 表；Inspector 另有一张表 |
| 链扩展数据 | `Context.chain` 槽 + 自定义 Tx/Cfg 类型 | `EvmExt / BlockEnvExt / TxEnvExt / MessageExt / …Ext` 关联类型 |
| Send | 编译期由组件推导 | 运行时 `evm_is_send` 断言 |

**不确定之处**：类型擦除对热路径的开销没有测量。推断：DB 的 dyn 调用只在 CacheDB 未命中时发生，预编译 dyn 调用只在 CALL 预编译时发生，交易 handler 的 dyn 调用每笔一次，所以开销可能很小，但这是 inferred。

---

## X-Q3 状态模型：revm Journal 对 evm2 State / PendingState

**答案**：两者都是“内存 overlay + 可回滚 journal（revert entries）”结构，概念同源，evm2 的 AGENTS.md 也写明以 revm 为语义基线。差别在生命周期与所有权：
- revm：一个 `JournalInner` 跨交易复用。`finalize()` 交出 owned `EvmState`（`AddressMap<Account>`），`transact()` 默认就返回 owned state diff。
- evm2：三层结构，依次是交易 scratch（`accounts`）、已接受 overlay（`CacheDB`）、`dyn` 后端 DB。`transact()` 返回**借用 EVM 的** `ExecutedTx` 句柄，由调用方选择 `commit()`（并入 overlay，只返回 result）、`discard()`、`commit_with(sink)`（流式交给持久化），或 `detach()`（交出 owned `PendingState`，其中每项带交易边界的 original/present）。

所以 “`executed.commit()` 返回 owned 结果” 只对 result 成立。owned state 需要显式 `detach()`；`StateSnapshot` 可以整体 send 到其他线程。

**依据**
- revm：
  - `JournalInner { state: EvmState, transient_storage, logs, depth, journal: Vec<ENTRY>, transaction_id, warm_addresses, selfdestructed_addresses }`（revm/crates/context/src/journal/inner.rs:62-95@ee9ab3f）
  - `commit_tx` 清空 journal，transaction_id 自增（:141-171）；`discard_tx` 逆序回放 entry（:174-203）；`finalize` 交出 state（:207）；`checkpoint` 与 `checkpoint_revert`（:604,622）
  - `transact` = `transact_one` + `finalize` → `ExecResultAndState`（revm/crates/handler/src/api.rs:72-81）；`EvmState = AddressMap<Account>`（revm/crates/state/src/types.rs:6）
  - warm/cold 通过 `Account.transaction_id` 判定（revm/crates/state/src/lib.rs:83-96）
- evm2：
  - `State { accounts, storage_pool, transient_storage, inner: StateInner { database: CacheDB<Box<dyn DynDatabase>>, journal: Vec<JournalEntry>, logs, selfdestructs, prewarm_set } }`（evm2/crates/evm2/src/evm/state/mod.rs:52-62,155-167）
  - `JournalEntry::{AccountChange, StorageChange, TransientStorageChange, StorageWarmed, …}`（state/journal.rs:40-80）；`push_journal` 原地写入，避免 store-forwarding stall（state/mod.rs:170-184）
  - `StateSnapshot` 不带 DB，“can be … sent to another thread”（state/mod.rs:64-78）
  - `ExecutedTx` 的 6 种结局（evm2/crates/evm2/src/evm/tx.rs:167-182）；`commit()`（:277）；`detach()` → `TxResultWithState`（:340,360）
  - `PendingState { accounts: AddressMap<Account>, selfdestructs }`，文档说明它可以直接 fold 进 BAL，或流式交给 `StateChangeSink`（evm2/crates/evm2/src/evm/state/pending.rs:12-36）
- 对并行 / 推测执行的意义：
  - 一笔交易的写集可以作为 owned 值离开 worker 线程（bal_parallel.rs:98-101 中 `transact(tx)…detach()`）
  - 调用方可以在 `commit` 和 `discard` 之间选择（推测执行失败时直接丢弃）
  - `commit_with(sink)` 让持久化层直接消费变更，省掉中间 `EvmState` HashMap 这一步
  - revm 中 pevm 的做法是 `journal.finalize()` 得到 `EvmState`，再逐账户转成自己的 `WriteSet`（risechain/pevm/crates/pevm/src/vm.rs:579-640@e94b0e3）。evm2 的 `PendingState` 并没有消除这种转换（pevm 仍要转成 MvMemory 格式），只是给出了带 original/present 的 owned 形态。

**不确定之处**：evm2 每笔交易 scratch → overlay 的提交开销，与 revm 单 HashMap + transaction_id 方案（revm #2362，2025-05 关闭）相比孰优孰劣，没有基准数据。

---

## X-Q4 并行与 BAL

**答案**：evm2 提供的是 **EIP-7928 BAL 的构建与读取原语**：
- `BalContext`：可挂载一份只读 BAL，读请求按 block access index 从 BAL 中服务；也可开启 builder，在 commit 时 fold；
- `detach()` 出 owned `PendingState`；
- `Bal::commit` 重建 BAL。

evm2 **不提供**调度器、冲突检测、重执行、多版本内存。`bal_parallel.rs` 每笔交易起一个线程、建一个独立 EVM，靠“区块已经携带正确 BAL”这一前提消除依赖，最后重建 BAL 并与区块 BAL 比对（EIP-7928 的验证半边）。revm 本身也有几乎同构的 BAL API（v107 已有，main 增加了 DB fallback），所以 **BAL 不是 evm2 独有的能力**。EIP-7928 当前状态为 Last Call（截止 2026-11-01），已被列入 Glamsterdam 的 Scheduled for Inclusion。

**依据**
- evm2：
  - `BalContext { bal: Option<Arc<Bal>>, bal_builder: Option<Bal>, bal_index, allow_db_fallback }`。文档说明 BAL 未覆盖的读默认报错，因为“during block validation an access outside the BAL means the BAL is invalid”（evm2/crates/evm2/src/evm/bal/bal_context.rs:18-58@c8bb5a2）
  - `bal_parallel.rs`：`build_bal` 顺序执行并开启 builder（:105-113）；`std::thread::scope` 为每笔交易 spawn 一个线程（:64-85）；`execute_with_bal` 每次新建 `pre_block_evm()`，`set_bal` + `set_bal_index(i+1)`，再 `transact().detach()`（:98-101）；主线程按交易顺序 `bal_builder.commit(idx(i+1), pending)`，然后 `assert_eq!(bal_builder, *bal)`（:81,85）
  - `bal_build.rs`：index 0 给 pre-block 系统调用，`i+1` 给交易，最后一个 index 给 post-block，由调用方 `bump_bal_index()` 推进（examples/bal_build.rs:1-8,33-76）
  - 在 evm2 crates（不含 jit）里 grep `scheduler|conflict|rayon|block-stm`，只命中 CLI 参数冲突，没有调度或冲突检测代码
- revm：
  - `Bal`、`BalWrites`、`AccountBal`（revm/crates/state/src/bal.rs:1-35@ee9ab3f）；`BalState`、`BalDatabase`（revm/crates/database/interface/src/bal.rs:19,294）
  - `State::{bump_bal_index, set_bal_index, reset_bal_index, set_bal, set_allow_bal_db_fallback, take_built_bal}`（revm/crates/database/src/states/state.rs:204-244）
  - examples/bal_example 演示“先构建、再用 BAL 重放”；v107 已经有 `crates/state/src/bal.rs` 和 `crates/database/interface/src/bal.rs`（`git ls-tree v107`）
  - v114 加入 “Database fallback mode for BAL misses”（#3754，CHANGELOG.md v114）
- EIP-7928：`status: Last Call`，`last-call-deadline: 2026-11-01`（ethereum/EIPs master EIPS/eip-7928.md front-matter）；EIP-7773（Glamsterdam Meta）将其列为 Scheduled for Inclusion（EIPS/eip-7773.md）。
- RISE pevm：
  - README 写明 “work in progress and not production ready”；Legacy 架构是 Block-STM 加协作调度器和多版本内存，New 架构计划 “replace `revm` with an inline EVM implementation that is parallel-aware”；TODO 第一项 “Implement an inline parallel-optimal EVM to replace revm” 尚未完成（risechain/pevm/README.md@e94b0e3）
  - 当前仍依赖 `revm = 38.0.0` / `op-revm = 19.0.0`，注释为 “Will remove [revm] with #382”（Cargo.toml:56-59）
  - 在 revm 之上的做法：实现 revm `Database` 去读 MvMemory（vm.rs:238）；对 lazy sender 返回 `balance: U256::MAX` 的 mock 账户（:245-252）；每次执行 `ctx.set_tx(full_tx.clone())`（:564）；用自定义 `NoBeneficiaryHandler` 跑交易（:571,765）；再把 `journal.finalize()` 出的 `EvmState` 逐账户转成 WriteSet（:579-640）
  - issue #382（hai-rise，2024-10-15，OPEN）：“we want an implementation specifically designed for parallel execution with thread-safe types, states, more native caches and instrumentation, no overheads for lazy… Using an external sequential-first implementation like revm adds too much overhead and unwanted type conversions.” 评论区 hai-rise 认为 fork 不是好选择，因为想直接用 multi-version memory，“instead of going through another (frictional) layer of JournaledState's EvmState”

**不确定之处**：evm2 的 BAL fold 与 revm 的 `BalState` 是否逐字节等价，没有做差分。示例“一线程一交易”只是演示，生产级的 BAL 并行验证（线程池、共享只读缓存）需要调用方自行实现。

---

## X-Q5 异步 host

**答案**：
- evm2 的 `async` feature 用 **corosensei** stackful coroutine（`async = ["std", "dep:corosensei"]`）。同步 EVM 跑在 fiber 上，host 读 DB 时 `block_on_current` 轮询 future；若返回 Pending 就挂起 fiber，外层 future 也返回 Pending。fiber 栈 16 MiB（mmap 按需提交）。
- revm 分两段：
  - Mantle 基线 **v107** 的 `WrapDatabaseAsync` 是纯阻塞包装，`rt.block_on(...)`，多线程 runtime 下用 `block_in_place`；
  - **main（v116 起，#3709，2026-07-24 合并，作者 DaniPopes）** 引入了同样基于 corosensei 的 fiber 方案和 `ExecuteEvmAsync::transact_async`。`WrapDatabaseAsync` 改为 `AsyncDb` 的包装：在 fiber 上走 `block_on_current`，不在 fiber 上时回退到 tokio `block_on`。

结论：在最新 revm 上，异步 host 已不是 evm2 的独有优势，对 Mantle 来说是“升级 revm 就能拿到”的能力。

**依据**
- evm2：`async = ["std", "dep:corosensei"]`（evm2/crates/evm2/Cargo.toml:143）；模块注释说明 fiber 机制（evm2/crates/evm2/src/evm/async.rs:1-5）；`use corosensei::…`（:15）；`DEFAULT_STACK_SIZE = 16 MiB`，并注明 1024 层调用深度需要的栈（:23-30）；`block_on_current`（:364）；`AsyncDatabase`/`AsyncDb`（:412,448）；`transact_async` / `transact_async_send`（evm/mod.rs:1162,1181），后者要求先通过 `evm_is_send` 验证（:1190）。evm2 git 历史：`feat: add async database support (#144)` 2026-05-21。
- revm v107：`WrapDatabaseAsync`（revm/crates/database/interface/src/async_db.rs:108@d629331）；`self.rt.block_on(self.db.basic_async(..))` 等（:155-231）；`fn block_on` 在多线程 runtime 内使用 `block_in_place`（:244-280）；feature `asyncdb = ["dep:tokio", "tokio/rt-multi-thread"]`，没有 corosensei（crates/database/interface/Cargo.toml:48@d629331）。
- revm main：`use corosensei::…`（revm/crates/database/interface/src/async_db.rs:11@ee9ab3f）；`block_on_current`（:373）；`block_on_runtime`：在 fiber 上走 `block_on_current`，否则走 tokio handle（:424-436）；`WrapDatabaseAsync(AsyncDb<T>)`（:756-765）；`ExecuteEvmAsync`（revm/crates/handler/src/api.rs:186-202,262-286）；`Evm.async_stack: FiberStack`（revm/crates/context/src/evm.rs:26-27）。PR #3709 描述 “fiber-backed async database adapter that lets synchronous EVM execution yield while host database futures are pending”（gh pr view 3709 -R bluealloy/revm）。

**不确定之处**：revm 的 fiber 方案是否直接移植自 evm2，属于推断（同一作者，evm2 早约两个月，API 形状相同），没有找到明文说明。

---

## X-Q6 Inspector / tracing

**答案**：两者都把“带 inspector”和“不带 inspector”的执行做成**分离的路径**，所以无 trace 时热路径都不付 inspector 成本：
- revm：`run_plain` 与 `inspect_instructions` 是两个循环；
- evm2：`instructions` 与 `inspect_instructions` 是两张静态表，每次 frame run 时选一张。

差别在于 revm 的 Inspector 是泛型（单态化）；evm2 的 Inspector 表通过 `DynInspector` 调用 `dyn Inspector`，tracing 时每条指令多一次虚调用（inferred）。

evm2 的 `crates/inspectors` 是 revm-inspectors 的移植：模块清单与 revm-inspectors 0.44.3 基本一致（access_list、opcode、otterscan、storage、transfer、tracing/{geth, parity, js, mux, fourbyte, opcount, debug…}），只多出 `tracing/tx_state.rs` 和 js snapshot 测试。行为对等没有验证。Inspector 钩子比 revm 少 `frame_start`/`frame_end`/`log_full`/`journal`。`transact_with_inspector`（借用 `&mut dyn Inspector`）在 2026-10-24（#770）才加入。

**依据**
- revm：`run_plain` 循环只调用 `step`（revm/crates/interpreter/src/interpreter.rs:325-342@ee9ab3f）；`inspect_instructions` 每步调用 `inspector.step`/`step_end` 并检查日志（revm/crates/inspector/src/handler.rs:250-289）；`Inspector<CTX, INTR, FI, FR>` 为泛型 trait（revm/crates/inspector/src/inspector.rs:18），钩子包括 call/call_end/create/create_end/frame_start/frame_end/initialize_interp/journal/log/log_full/selfdestruct/step/step_end。
- evm2：`INSTRUCTIONS = make_table::<T, C, NoInspector>` / `INSPECT_INSTRUCTIONS = make_table::<T, C, DynInspector>`（evm2/crates/evm2/src/interpreter/dispatch/mod.rs:171-190,204-205）；`struct DynInspector`（:239）；运行时选表 `if inspector.is_some() { config.inspect_instructions } else { config.instructions }`（evm2/crates/evm2/src/interpreter/runtime.rs:460-462）；`Inspector<T>` 钩子包括 initialize_interp/step/step_end/log/call/call_end/create/create_end/selfdestruct（evm2/crates/evm2/src/evm/inspector.rs:14 起）；`transact_with_inspector`（evm/mod.rs:1099-1111），文档注明 “System calls are not inspected”。
- evm2-inspectors README：“Originally: revm-inspectors / part of reth as reth-revm-inspectors”（evm2/crates/inspectors/README.md）。模块清单对比：`find src -name '*.rs'`，两个仓库分别在 c8bb5a2 和 d0ad9f6。
- Mantle 也 fork 了 revm-inspectors（`mantle-xyz/revm-inspectors` tag `v0.39.0-mantle-arsia.2`，mantle-xyz/reth/Cargo.toml:254@574e7f3）。迁移到 evm2 时，这部分要在 evm2-inspectors 上重做。

**不确定之处**：evm2-inspectors 的 geth/parity trace 输出与 revm-inspectors 是否逐字段一致，没有跑差分。evm2 的 dyn Inspector 在 tracing 下的实际开销没有测量。

---

## X-Q7 revm 的框架级限制（工程表述）与版本节奏

**答案**：按“设计取舍”和“可在 revm 内修”两类整理如下。

设计取舍：
- (a) 全泛型框架：组件全部单态化，换来零成本组合，代价是类型参数在 API 中外溢（`Evm<CTX,INSP,I,P,F>`、`Context<7 个参数>`），下游 wrapper 和 trait bound 很长；
- (b) 交易以 owned `TxEnv` 进入，需要从共识类型转换；
- (c) 状态默认按“同一 Journal 顺序执行多笔交易”设计；
- (d) 一张运行时指令表，fork 在指令内做运行时检查；
- (e) 公共 trait 暴露了解释器内部（`Jumps`/`Immediates`），revm #3776 报告了借此触发的 safe-API UB。

可在 revm 内修、且已在修的：
- 异步 host 已有 fiber 方案（v116）；
- BAL 构建与读取，以及 DB fallback；
- `account-ext`；
- 多交易执行的 journal 优化（#2362 已关闭）。

真正需要外部重写的只有“parallel-first 状态 / 调度”这一层：revm 不提供，evm2 也不提供，pevm 自建。

版本节奏：从 v66（2025-03-24，revm 20.0.0）到 v116（2026-08-26，43.0.0），revm crate 共 23 次主版本跳变，约 1.35 次/月。v99–v120 的 22 个 tag 中，有 12 个在 CHANGELOG 里至少标注一个子 crate “⚠ API breaking changes”。Mantle 的 v107（38.0.0，2026-04-17）落后 main（v120，43.0.3，2026-09-24）13 个 tag、5 个主版本。

**依据**
- 主版本与日期：逐 tag 读取 `crates/revm/Cargo.toml` 的 version 与 commit 日期（git，bluealloy/revm）。v98 = 31.0.2（2025-11-10）、v107 = 38.0.0（2026-04-17）、v120 = 43.0.3（2026-09-24）。2025 年 51 个 tag，2026 年至今 18 个。
- breaking 统计：对 CHANGELOG.md 按 `# vN` 段统计 “API breaking”，v100/v103/v104/v105/v106/v108/v109/v113/v114/v115/v116/v119 有标注（revm/CHANGELOG.md@ee9ab3f）。v113 起所有 crate 改为 lockstep 版本（同文件 v113 段）。
- maintainer 对性能瓶颈的判断：#2363 “Tracking: Performance”（OPEN，2025-04-03）写道 “As in Reth, execution is becoming a bottleneck”。rakita 2025-04-22 回复 revmc：“Most of the time of execution is spent in IO (fetching storage/accounts), so the performance was similar … for now it would just complicate the code”（https://github.com/bluealloy/revm/issues/2363#issuecomment-2821379420）。
- 多交易执行：#2362 “Multi transaction execution” 提议用 incarnation 让 journal 跨交易复用，2025-05-24 关闭。
- Send：#1152（2024-03，OPEN）当时因 handler 内 `dyn Fn` 不是 Send 而无法跨线程。rakita 回复 “not going to happen with whole Evm… send Context while rebuilding Handler”。该 issue 针对 v20 之前的 handler 注册表架构；现行 Handler 是 trait 实现，不是 dyn Fn。
- 类型暴露：#3776 “UB found by miri”（2026-06-24，OPEN），指 `ExtBytecode` 经由 `Jumps`/`Immediates` 等公共 safe trait 可越界读写。评论指出这些 trait 因为是 `InterpreterTypes` 的约束才是 pub，“reducing their visibility doesn't seem feasible without changing the extension model”。
- 下游 fork 压力：pevm 自建调度和多版本内存，仍在 revm 38 上（见 X-Q4）；Mantle fork 改了核心 crate（见 X-Q1）；op-revm 迁出 revm 仓库（见 X-Q1）。

**不确定之处**：23 次主版本跳变里，有一部分只是 “dependency bump”（例如 v107 的 revm 37→38 没有 ⚠ 标注），对下游的实际迁移工作量不等。“breaking 频率”应该以子 crate 的 ⚠ 标注为准，而不是看 revm 主版本号。

---

## 资料中被修正的地方（GPT Deep Research）

1. **§5.3 / §2 “evm2 更强调编译期定制，revm 是运行时判断 + wrapper”**：方向不准确。revm 的 DB、Inspector、Precompile、Handler 全部是泛型单态化。evm2 只把类型族和每个 spec 的指令表编译期化；DB、预编译、Inspector、交易 handler、JIT runner 都是 `Box<dyn>` 或 `HashMap<u8, Arc<dyn …>>` 运行时擦除（evm/mod.rs:220-226、registry.rs:350-352）。准确说法：evm2 的单态化集中在指令表和类型，组件边界走 dyn。
2. **§2 “host/state 接口：evm2 目标是更清晰的 typed host boundary”**：evm2 源码自述 “Custom hosts aren't that well supported yet”，`EvmTypes` 强制 `Host = Evm`（config.rs:20,57-59）。自定义 host 目前不是可用的扩展点。
3. **§2、§5.6 异步 DB**：GPT 写 `async = ["std"]`，实际为 `async = ["std", "dep:corosensei"]`。GPT 说 “revm 已有 async database/fiber 支持”，这对 main（v116+）成立，但 **Mantle 使用的 v107 只有阻塞的 `block_on` / `block_in_place` 包装**。另外两者的 fiber 实现出自同一作者，形状一致。
4. **§5.7 bal_parallel 流程**：GPT 第 7 步 “更新下一轮 BAL 和 state” 在示例中不存在。示例是把各 worker 的 `PendingState` 按序 fold 成新 BAL，再与区块 BAL `assert_eq!`（验证），不更新任何 state。“transaction i 读取此前 transaction 的写入” 是通过区块 BAL 在 index `i+1` 上服务的，不是来自其他 worker。GPT 说 “evm2 不会自动生成完整 BAL” 也需要修正：开启 builder 后，evm2 在 commit 时会自动 fold 出 BAL，只是 index 由调用方推进。
5. **BAL 被当成 evm2 的差异点（§5.7、§6.3）**：revm 自 v107 起就有同构的 BAL 构建与读取 API，main 还有 DB fallback（#3754）。BAL 不能作为迁移 evm2 的理由。
6. **§3.2 “OP Stack 通过 op-revm…（在 revm 内）”**：op-revm 在 v108 起已从 bluealloy/revm 移出，现位于 ethereum-optimism/optimism（book/src/architecture.md:74）。Mantle 的 fork 基于 v107，仍是 op-revm 在 revm 仓库内的布局。
7. **§4.2、§6.3、§8.2 RISE issue 被当作当前论断**：#382 写于 2024-10-15，针对 v20 重构之前的 revm，至今 OPEN。pevm 仍依赖 revm 38.0.0，README 中 “replace revm” 仍在 TODO。另外 GPT §8.2 写 “三类需求” 却列了 4 条。
8. **§7 表 “trace/inspector per-op callback 使 trace 开启时热路径开销明显，evm2 没有自动解决”**：两者都把 inspect 路径与普通路径分离，无 trace 时都不付成本。有 trace 时，evm2 用 `dyn Inspector`，revm 用单态化 Inspector，evm2 在这一点上未必更快（inferred）。
9. **§2 “revm API 稳定性较高”**：被夸大。v99–v120 的 22 个 tag 中有 12 个含 ⚠ API breaking 子 crate，主版本约 1.35 次/月。准确说法：revm 有 semver 发布但 breaking 频繁；evm2 没有任何 release 或 tag（`gh api repos/alloy-rs/evm2/releases` 返回 0），AGENTS.md 明确声明不保证 API 稳定。
10. **§5.3 的 SSTORE 闭包扩展**：属实（`sstore_with`，examples/custom_evm/opcode.rs:36-41）。

---

## 来源

1. **PRIMARY** bluealloy/revm @ ee9ab3f — crates/handler/src/handler.rs、evm.rs、api.rs：Handler 四阶段、EvmTr、`transact` 返回 owned state、ExecuteEvmAsync。
2. **PRIMARY** bluealloy/revm @ ee9ab3f — crates/context/{src/context.rs, src/evm.rs, src/journal/inner.rs, interface/src/context.rs}：Context 类型参数、Journal 结构与 commit/discard/finalize。
3. **PRIMARY** bluealloy/revm @ ee9ab3f / d629331(v107) — crates/database/interface/src/async_db.rs：v107 是阻塞包装，main 是 corosensei fiber。
4. **PRIMARY** bluealloy/revm v107 @ d629331 — crates/op-revm/**：L2 定制点（Handler 覆写、OpTransaction、L1BlockInfo、OpPrecompiles）。
5. **PRIMARY** bluealloy/revm CHANGELOG.md 与 git tags：版本节奏、breaking 标注、v108 起不再含 op-revm、lockstep 版本。
6. **PRIMARY** bluealloy/revm book/src/architecture.md：官方架构描述，op-revm 已指向 optimism monorepo。
7. **PRIMARY** alloy-rs/evm2 @ c8bb5a2 — crates/evm2/src/evm/{config.rs, mod.rs, registry.rs, handler.rs, tx.rs, precompile.rs, inspector.rs}：EvmTypesHost、类型擦除、TxRegistry、ExecutedTx。
8. **PRIMARY** alloy-rs/evm2 @ c8bb5a2 — crates/evm2/src/evm/state/** 与 bal/**：State/PendingState/StateSnapshot、BalContext。
9. **PRIMARY** alloy-rs/evm2 @ c8bb5a2 — crates/evm2/examples/{custom_evm, bal_parallel.rs, bal_build.rs, precompile_subcall.rs}：完整定制示例与 BAL 并行验证示例。
10. **PRIMARY** alloy-rs/evm2 @ c8bb5a2 — crates/evm2/src/evm/async.rs、Cargo.toml、README.md、AGENTS.md：corosensei fiber、feature 表、“reimplementation of revm / no API stability”。
11. **PRIMARY** alloy-rs/evm2 @ c8bb5a2 — crates/evm2/src/interpreter/dispatch/mod.rs、runtime.rs：两张静态表（NoInspector / DynInspector）及运行时选表。
12. **PRIMARY** alloy-rs/evm2 crates/inspectors/README.md 与 src/**，对比 paradigmxyz/revm-inspectors @ d0ad9f6：模块级移植关系。
13. **PRIMARY** risechain/pevm @ e94b0e3 — README.md、Cargo.toml、crates/pevm/src/vm.rs：仍依赖 revm 38，WIP，在 revm 上做并行的具体转换。
14. **PRIMARY** https://github.com/risechain/pevm/issues/382（访问 2026-10-25）：RISE 对 sequential-first revm 的原始论述与日期。
15. **PRIMARY** https://github.com/bluealloy/revm/issues/2363（含 rakita 2025-04-22 评论）：maintainer 认为执行时间主要花在 IO。
16. **PRIMARY** https://github.com/bluealloy/revm/issues/1152、#2362、#3776（访问 2026-10-25）：Send 历史问题、多交易 journal、公共 trait 暴露导致的 UB。
17. **PRIMARY** https://github.com/bluealloy/revm/pull/3709、#3894（访问 2026-10-25）：fiber 异步（DaniPopes，2026-07-24）、account-ext（2026-09-21）。
18. **PRIMARY** ethereum/EIPs master EIPS/eip-7928.md 与 eip-7773.md（访问 2026-10-25）：EIP-7928 处于 Last Call（2026-11-01 截止），已列入 Glamsterdam Scheduled for Inclusion。
19. **PRIMARY** mantle-xyz/revm tag v107-mantle-arsia.2 @ 835cb4e，与上游 v107 做 diff：Mantle 对核心 crate 的修改。
20. **PRIMARY** mantle-xyz/reth @ 574e7f3 Cargo.toml:239-264：Mantle 整套 revm crate 和 revm-inspectors 都 pin 到自有 fork。
21. **PRIMARY** base/base @ bcd96e2 crates/common/evm2/src/{types.rs, registry.rs, handler.rs}：一个 OP-stack L2 在 evm2 上的实际映射方式。
22. **PRIMARY** alloy-rs/evm @ d7b5ed4 crates/evm/src/tx.rs:188-213：revm 路径上共识 tx 转 TxEnv 时的 clone。
23. GPT Deep Research（2026-10-25）§3、§4.2、§4.3、§5.3、§5.6、§5.7、§6、§7：仅作线索。

---

## 开放问题

1. evm2 的 dyn 组件（DB miss、预编译、Inspector、tx handler）与 revm 的全单态化相比，在真实区块重放上的开销差异没有测量（需要 profile，本路未跑 benchmark）。
2. Mantle fork 的核心 crate 改动（Gas::set_limit、storage original_value 重置语义、EIP-7825 cap、halt 日志）哪些能用 evm2 的 tx handler / TxHandlerHooks / Version gas params 表达而不 fork，没有逐项验证（speculative，见 X41）。
3. 现行 op-revm（ethereum-optimism/optimism monorepo）在 v108 之后的 Handler 形态没有核实。Mantle 若升级 revm，要同时追 op-revm 的新位置。
4. evm2-inspectors 与 revm-inspectors 的 trace 输出一致性（geth callTracer/prestate、parity trace）没有差分。
5. evm2 的 BAL fold 是否与 revm `BalState` 产出完全一致，没有差分。
6. revm 的 fiber 异步是否移植自 evm2 没有明文出处，目前只有作者和时间先后两条线索。

---

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| X1 | revm 的 `Evm<CTX, INSP, I, P, F>` 把 Context、Inspector、指令、预编译、Frame 都作为泛型参数，组件组合在编译期单态化。 | `bluealloy/revm/crates/context/src/evm.rs:11-28@ee9ab3f`；`crates/handler/src/evm.rs:32-40@ee9ab3f` | observed |
| X2 | revm 的 `Context` 有 7 个类型参数（Block/Tx/Cfg/DB/Journal/Chain/Local），链特有状态放在 `chain` 槽里。 | `bluealloy/revm/crates/context/src/context.rs:18-41@ee9ab3f` | observed |
| X3 | revm 的 `Handler` 按 validate → pre_execution → execution → post_execution 四阶段执行交易，状态变更留在 Journal 中，需要 `finalize` 取出。 | `bluealloy/revm/crates/handler/src/handler.rs:69-73,164-198@ee9ab3f` | observed |
| X4 | op-revm（v107）通过覆写 8 个 Handler 方法（validate_env、validate_against_state_and_deduct_caller、last_frame_result、reimburse_caller、refund、reward_beneficiary、execution_result、catch_error）实现 deposit、L1 fee、operator fee 和 system tx 规则。 | `bluealloy/revm/crates/op-revm/src/handler.rs:71-379@d629331` | observed |
| X5 | op-revm 用 `OpTransaction { base, enveloped_tx, deposit }` 包装 TxEnv，并保存原始交易字节的副本来计算 L1 data fee。 | `bluealloy/revm/crates/op-revm/src/transaction/abstraction.rs:39-52@d629331`；`l1block.rs:263,286@d629331` | observed |
| X6 | op-revm 自 v108 起已从 bluealloy/revm 仓库移出，官方文档指向 ethereum-optimism/optimism。 | 逐 tag `git ls-tree crates/op-revm`（v107 有，v108 无）；`bluealloy/revm/book/src/architecture.md:74@ee9ab3f` | observed |
| X7 | Mantle 的 revm fork（v107-mantle-arsia.2）除 op-revm 外还修改了 interpreter、state、context、context-interface 等核心 crate，其中包括 storage `original_value` 重置条件这一 journal 语义改动。 | `mantle-xyz/revm/crates/interpreter/src/gas.rs:219@835cb4e`；`crates/state/src/lib.rs:516@835cb4e`；`crates/context/src/cfg.rs:425@835cb4e`；`crates/context/interface/src/result.rs:401@835cb4e`；[19] | observed |
| X8 | 由 X4、X7 推出：对 Mantle 的定制需求（token_ratio、BVM_ETH mint 日志、关闭 EIP-7825）来说，revm v107 的 Handler 扩展点不够用，所以要 fork 核心 crate，这会提高每次升级 revm 的合并成本。 | 由 X4、X7 推出：op-revm 的定制只靠 Handler 覆写即可完成，Mantle 却额外改了核心 crate 的语义与 API | inferred |
| X9 | evm2 的 `EvmTypesHost` 定义了 10 个关联类型（ConfigSelector、SpecId、Tx、EvmExt、MessageExt、MessageResultExt、TxEnvExt、TxResultExt、BlockEnvExt、Host），链的扩展数据以类型参数形式进入执行上下文。 | `alloy-rs/evm2/crates/evm2/src/evm/config.rs:22-54@c8bb5a2` | observed |
| X10 | evm2 目前不真正支持自定义 host：源码 TODO 写着 “Custom hosts aren't that well supported yet”，`EvmTypes` 也强制 `Host = Evm`。 | `alloy-rs/evm2/crates/evm2/src/evm/config.rs:20,57-59@c8bb5a2` | observed |
| X11 | evm2 为每个 (base spec, custom spec) 在编译期生成 `&'static` 指令表；revm 只有一张运行时指令表，在指令内部用 `check!` 做运行时 fork 判断。 | `alloy-rs/evm2/crates/evm2/src/interpreter/dispatch/mod.rs:171-205@c8bb5a2`；`bluealloy/revm/crates/interpreter/src/instructions/macros.rs:18-26@ee9ab3f` | observed |
| X12 | evm2 的数据库、预编译、Inspector、JIT runner 在 `Evm` 内都以 `Box<dyn>` / `Arc<dyn>` 类型擦除存储。 | `alloy-rs/evm2/crates/evm2/src/evm/mod.rs:207-238@c8bb5a2`；`src/evm/state/mod.rs:158@c8bb5a2` | observed |
| X13 | evm2 的交易分派先按 EIP-2718 type 字节查 `HashMap<u8, Arc<dyn ErasedTxHandler>>`，再调用具体类型的 handler；自定义交易类型通过注册 handler 加入。 | `alloy-rs/evm2/crates/evm2/src/evm/registry.rs:350-352,416@c8bb5a2`；`src/evm/mod.rs:1113-1116@c8bb5a2`；`examples/custom_evm/tx.rs:82-89@c8bb5a2` | observed |
| X14 | 由 X1、X11、X12、X13 推出：evm2 并不比 revm “更编译期”。它把单态化集中在类型族和指令表上，组件边界改用运行时擦除，方向与 revm 相反。 | 由 X1、X11、X12、X13 推出：revm 的组件是泛型、表是运行时值；evm2 的表是常量、组件是 dyn | inferred |
| X15 | evm2 因类型擦除只能在运行时断言 `Send`（`evm_is_send`）；revm 的 `Send` 由组件类型在编译期推导。 | `alloy-rs/evm2/crates/evm2/src/evm/mod.rs:616-644@c8bb5a2` | observed |
| X16 | evm2 提供静态钩子 `TxHandlerHooks`（adjust_intrinsic_gas、before_execution、settle_transaction），Base 用它实现 L1 fee、operator fee 预扣和 vault 分账，deposit 则作为独立 handler 注册。 | `alloy-rs/evm2/crates/evm2/src/evm/handler.rs:28-61@c8bb5a2`；`base/base/crates/common/evm2/src/handler.rs:108-167@bcd96e2`；`registry.rs:28-58@bcd96e2` | observed |
| X17 | evm2 的 custom_evm 示例在 const fn 中给自定义 spec 新增 opcode、用 `sstore_with` 闭包包装 SSTORE 加附加费，并通过 `BlockEnvExt` 让 opcode 读取 L1 区块号。 | `alloy-rs/evm2/crates/evm2/examples/custom_evm/config.rs:112-130@c8bb5a2`；`examples/custom_evm/opcode.rs:23-41@c8bb5a2` | observed |
| X18 | evm2 的 `transact` 借用共识 envelope（`&Recovered<T::Tx>`）；revm 的 `transact` 按值接收 TxEnv，上游从共识 tx 转换时会 clone access list 等字段。 | `alloy-rs/evm2/crates/evm2/src/evm/mod.rs:1085@c8bb5a2`；`bluealloy/revm/crates/handler/src/api.rs:72-75@ee9ab3f`；`alloy-rs/evm/crates/evm/src/tx.rs:188-213@d7b5ed4` | observed |
| X19 | evm2 的 `LazyTxEip7702` 允许调用方传入已缓存的 EIP-7702 authority 恢复结果，避免重复 ecrecover。 | `alloy-rs/evm2/crates/evm2/src/ethereum/lazy_eip7702.rs:16,87-92@c8bb5a2` | observed |
| X20 | revm 的 Journal 是跨交易复用的单个 `JournalInner`（state HashMap 加 revert entry 向量），`transact()` 通过 `finalize()` 返回 owned `EvmState`。 | `bluealloy/revm/crates/context/src/journal/inner.rs:62-95,141-207@ee9ab3f`；`crates/handler/src/api.rs:72-81@ee9ab3f` | observed |
| X21 | evm2 的状态分三层：交易 scratch、已接受 overlay（CacheDB）、dyn 后端 DB，同样使用可回滚的 journal 记录 revert entry。 | `alloy-rs/evm2/crates/evm2/src/evm/state/mod.rs:52-62,155-167@c8bb5a2`；`src/evm/state/journal.rs:40-80@c8bb5a2` | observed |
| X22 | evm2 的 `transact()` 返回借用 EVM 的 `ExecutedTx`；`commit()` 只返回结果，owned 状态要通过 `detach()` 得到 `PendingState`，其中每项带交易边界的 original/present 值。 | `alloy-rs/evm2/crates/evm2/src/evm/tx.rs:167-182,277,340-360@c8bb5a2`；`src/evm/state/pending.rs:12-36@c8bb5a2` | observed |
| X23 | 由 X20、X22 推出：evm2 的 owned `PendingState` 和 `commit_with(sink)` 便于把写集移出 worker 线程、直接流式交给持久化层，但没有消除并行引擎自身格式的转换。revm 的 owned `EvmState` 也能离开线程，差别在形态而不在能力。 | 由 X20、X22 推出：两者都能产出 owned 写集；evm2 多了 original/present 和 sink 接口；pevm 仍需转成自有 WriteSet（X29） | inferred |
| X24 | evm2 提供 EIP-7928 BAL 的读取（按 block access index 从 BAL 服务读请求）和构建（commit 时 fold）原语，BAL 未覆盖的读默认报错。 | `alloy-rs/evm2/crates/evm2/src/evm/bal/bal_context.rs:18-58@c8bb5a2`；`examples/bal_build.rs:1-8@c8bb5a2` | observed |
| X25 | evm2 的 `bal_parallel` 示例为每笔交易各起一个线程和一个 EVM，依赖区块 BAL 消除跨交易依赖，最后重建 BAL 并与区块 BAL 断言相等；示例中没有调度器、冲突检测或重执行。 | `alloy-rs/evm2/crates/evm2/examples/bal_parallel.rs:64-85,98-101@c8bb5a2`；对 crates 做 `scheduler\|conflict\|rayon` grep 无相关实现 | observed |
| X26 | revm 自 v107 起已有几乎同构的 BAL 构建与读取 API（Bal、BalState、bump_bal_index、set_bal），main 还加入了 BAL 未命中时的 DB fallback。 | `bluealloy/revm/crates/state/src/bal.rs:1-35@ee9ab3f`；`crates/database/src/states/state.rs:204-244@ee9ab3f`；`git ls-tree v107 crates/state/src/bal.rs`；CHANGELOG v114 #3754 | observed |
| X27 | 由 X24、X25、X26 推出：BAL 支持不是 evm2 相对 revm 的差异化能力，不能作为迁移理由。 | 由 X24、X25、X26 推出：两者都提供 BAL 读取与构建，且都不提供调度器 | inferred |
| X28 | EIP-7928（Block-Level Access Lists）当前状态为 Last Call，截止日期 2026-11-01，并已列入 Glamsterdam 的 Scheduled for Inclusion。 | ethereum/EIPs EIPS/eip-7928.md front-matter；EIPS/eip-7773.md “EIPs Scheduled for Inclusion”（访问 2026-10-25）[18] | observed |
| X29 | RISE pevm 目前仍依赖 revm 38.0.0：它通过实现 revm `Database` 读取多版本内存、mock 余额来做 lazy 更新、每次执行 clone 交易，并把 `finalize()` 出的 `EvmState` 转成自有 WriteSet。 | `risechain/pevm/Cargo.toml:56-59@e94b0e3`；`crates/pevm/src/vm.rs:238-252,564,571,579-640@e94b0e3` | observed |
| X30 | RISE 的 #382（2024-10-15，至今 OPEN）认为 sequential-first 的 revm 给并行执行带来 “too much overhead and unwanted type conversions”；pevm README 中 “用 inline EVM 替换 revm” 仍在 TODO。 | https://github.com/risechain/pevm/issues/382（访问 2026-10-25）；`risechain/pevm/README.md@e94b0e3` | observed |
| X31 | evm2 的 `async` feature 基于 corosensei stackful coroutine：同步 EVM 跑在 16 MiB 的 fiber 栈上，host I/O 返回 Pending 时挂起 fiber。 | `alloy-rs/evm2/crates/evm2/Cargo.toml:143@c8bb5a2`；`src/evm/async.rs:1-30,364@c8bb5a2` | observed |
| X32 | Mantle 基线 revm v107 的 `WrapDatabaseAsync` 是阻塞包装，调用 tokio `block_on`，在多线程 runtime 内用 `block_in_place`。 | `bluealloy/revm/crates/database/interface/src/async_db.rs:108,155-231,244-280@d629331` | observed |
| X33 | revm main（v116 起，PR #3709，2026-07-24 合并，作者 DaniPopes）引入同样基于 corosensei 的 fiber 异步执行和 `ExecuteEvmAsync::transact_async`。 | `bluealloy/revm/crates/database/interface/src/async_db.rs:11,373,424-436,756@ee9ab3f`；`crates/handler/src/api.rs:186-202@ee9ab3f`；[17] | observed |
| X34 | 由 X31、X33 推出：在最新 revm 上，异步 host 已不是 evm2 的独有优势；Mantle 升级 revm 即可获得同类能力。 | 由 X31、X33 推出：两者机制相同（corosensei fiber + block_on_current），差别只在 Mantle 停留在 v107 | inferred |
| X35 | revm 的 fiber 异步方案很可能移植自 evm2：evm2 在 2026-05-21 先加入，revm 两个月后由 evm2 的同一作者加入。 | evm2 git log “feat: add async database support (#144)” 2026-05-21；evm2 Cargo.toml authors=DaniPopes；revm PR #3709 author=DaniPopes | speculative |
| X36 | revm 和 evm2 都把有 Inspector 和无 Inspector 的执行做成分离路径（revm 是两个循环，evm2 是两张静态表），所以不做 trace 时热路径都不承担 Inspector 成本。 | `bluealloy/revm/crates/interpreter/src/interpreter.rs:325-342@ee9ab3f`；`crates/inspector/src/handler.rs:250-289@ee9ab3f`；`alloy-rs/evm2/crates/evm2/src/interpreter/runtime.rs:460-462@c8bb5a2` | observed |
| X37 | 开启 trace 时，evm2 通过 `DynInspector` 调用 `dyn Inspector`，revm 的 Inspector 是单态化泛型；因此 trace 场景下 evm2 每个钩子多一次虚调用。 | 由 `alloy-rs/evm2/crates/evm2/src/interpreter/dispatch/mod.rs:181,239@c8bb5a2` 与 `bluealloy/revm/crates/inspector/src/inspector.rs:18@ee9ab3f` 推出：dyn 对比泛型 | inferred |
| X38 | evm2-inspectors 是 revm-inspectors 的移植，模块清单（access_list、opcode、otterscan、storage、transfer，以及 geth/parity/js/mux 等 tracing）与 revm-inspectors 0.44.3 基本一致，行为是否对等尚未验证。 | `alloy-rs/evm2/crates/inspectors/README.md@c8bb5a2`；`find src` 对比 `paradigmxyz/revm-inspectors@d0ad9f6` | observed |
| X39 | revm 的 crate 主版本从 2025-03-24（20.0.0）到 2026-08-26（43.0.0）跳了 23 次，约每月 1.35 次；v99–v120 的 22 个 tag 中有 12 个在 CHANGELOG 中标注了 ⚠ API breaking 子 crate。 | 逐 tag 读取 `crates/revm/Cargo.toml` 的 version 和日期；按 `bluealloy/revm/CHANGELOG.md@ee9ab3f` 各段统计 “API breaking” | observed |
| X40 | Mantle 使用的 revm v107（38.0.0，2026-04-17）落后 revm main 的 v120（43.0.3，2026-09-24）13 个 tag、5 个主版本。 | `git log -1 v107/v120` 与各 tag 的 `crates/revm/Cargo.toml`；`mantle-xyz/reth/Cargo.toml:242@574e7f3` | observed |
| X41 | Mantle fork 中的部分核心改动（例如失败 deposit 保留 mint 日志）在 evm2 中可能只需写进自定义 deposit handler，不必 fork 核心，但没有逐项验证。 | 依据 evm2 的 handler 自主控制执行流程（`examples/custom_evm/tx.rs:64-80@c8bb5a2`）推测；未实现验证 | speculative |
| X42 | revm maintainer rakita 在 2025-04 表示执行时间主要花在 IO（取账户和存储），revmc JIT 对整体性能影响不大，暂时不值得增加代码复杂度。 | https://github.com/bluealloy/revm/issues/2363#issuecomment-2821379420（访问 2026-10-25） | observed |
| X43 | revm 把解释器内部（`Jumps`/`Immediates`）作为公共扩展 trait 暴露，2026-06 有人报告可以通过 safe API 触发 UB；评论认为不改扩展模型就无法收窄可见性。 | https://github.com/bluealloy/revm/issues/3776（访问 2026-10-25） | observed |
| X44 | evm2 自述是 revm 的重新实现：以 revm 的语义、控制流、gas 计算和 host 交互为基线，且不保证公共 API 稳定；该仓库至今没有任何 release 或 tag。 | `alloy-rs/evm2/AGENTS.md:3-9@c8bb5a2`；`gh api repos/alloy-rs/evm2/releases` 与 `/tags` 均为空 | observed |
| X45 | Mantle 整套 revm crate 和 revm-inspectors 都 pin 在自有 fork 的 tag 上（`v107-mantle-arsia.2`、`v0.39.0-mantle-arsia.2`），所以无论升级 revm 还是迁移 evm2，都要同时迁移 tracing fork。 | `mantle-xyz/reth/Cargo.toml:239-264@574e7f3` | observed |

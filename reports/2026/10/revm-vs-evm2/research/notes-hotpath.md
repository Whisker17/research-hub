# notes-hotpath：evm2 的解释器热路径、JIT/AOT 与性能证据（前缀 H）

访问日期：2026-10-25。源码版本：revm `ee9ab3f`（main，revm 43.0.3 / revm-interpreter 43.0.2）、revm tag `v107` = `d6293318`（revm 38.0.0 / revm-interpreter 35.0.1）、mantle-xyz/revm `v107-mantle-arsia.2` = `aff3c2a3`、evm2 `c8bb5a2`、revmc `6860b6f`。
引用格式 `repo/path:line@commit`。“本机”指 Apple M2 Pro / macOS（Darwin 27.0）/ rustc 1.99.1 stable。

---

## H-Q1 revm 的解释器怎么执行一条 opcode？固定开销来自哪里？

**答案。** revm 是经典的“中心循环 + 函数指针表”解释器：`run_plain` 循环调用 `step`，`step` 读 opcode、先把 pc 加 1、查 256 项函数指针表和 `[u16;256]` 静态 gas 表、扣静态 gas，再以 `InstructionContext { interpreter: &mut Interpreter, host: &mut H }` 间接调用 handler；handler 返回 `Result<(), InstructionResult>`，`Err` 就跳出循环。每条 opcode 的固定开销来自：pc / 栈长度 / 剩余 gas 都放在 `&mut Interpreter` 指向的内存里，间接调用前后要写回、再读出；所有 opcode 共用一个间接调用点；handler 内部要做栈边界检查，fork 相关的 opcode 还要在运行时检查 spec。Mantle 用的 v107 更旧：静态 gas 和函数指针放在同一个 16 字节的结构里，handler 返回 `()`，循环每步还要检查 `is_not_end()`。

**依据。**
- 主循环：`bluealloy_revm/crates/interpreter/src/interpreter.rs:325-342@ee9ab3f`（`run_plain` 中 `loop { if let Err(e) = self.step(..) { break e } }`）。
- 单步：`bluealloy_revm/crates/interpreter/src/interpreter.rs:295-321@ee9ab3f`。依次做 `self.bytecode.opcode()`、`relative_jump(1)`（先加 pc，依赖字节码末尾补 STOP）、`instruction_table[opcode]`、`gas_table.get_unchecked(opcode)`、`gas.record_cost_unsafe(static_gas)`，最后 `instruction.execute(InstructionContext{interpreter: self, host})`。
- 类型：`Instruction { fn_: fn(InstructionContext<'_, H, W>) -> InstructionExecResult }` 见 `bluealloy_revm/crates/interpreter/src/instructions.rs:36-39@ee9ab3f`；`InstructionTable = [Instruction; 256]` 见 `:71`；`GasTable = [u16; 256]` 见 `:74`；`InstructionContext` 见 `crates/interpreter/src/instruction_context.rs:6-11@ee9ab3f`；`InstructionExecResult = Result<T, InstructionResult>` 见 `crates/interpreter/src/instruction_result.rs:12@ee9ab3f`；`InstructionResult` 为 `#[repr(u8)]`，并且 `Stop = 1`，让 `Ok(())` 编码成 0，见 `:18-30@ee9ab3f`。
- 指令表的存放：`EthInstructions { inner: Box<EthInstructionsInner { instruction_table, gas_table }> }` 在运行时构建并放在堆上，可以用 `insert_instruction` 运行时替换，见 `bluealloy_revm/crates/handler/src/instructions.rs:26-38,99@ee9ab3f`；每个 frame 由 `frame_run` 传入，见 `crates/handler/src/evm.rs:205-209@ee9ab3f`。
- 栈：`Stack { data: Vec<U256> }`，容量 1024，见 `crates/interpreter/src/interpreter/stack.rs:13-16,97-104@ee9ab3f`。handler 用 `popn_top!` 先检查 `stack.len() < N+1`，再 `unwrap_unchecked`，见 `crates/interpreter/src/instructions/macros.rs:80-96@ee9ab3f`。例如 ADD 写成 `popn_top!([op1], op2, ..); *op2 = op1.wrapping_add(*op2); Ok(())`，见 `crates/interpreter/src/instructions/arithmetic.rs:9-13@ee9ab3f`。
- 运行时 spec 检查：`check!` 宏读 `runtime_flag.spec_id()`，见 `crates/interpreter/src/instructions/macros.rs:18-29@ee9ab3f`。PUSH0、SHL/SHR/SAR、CLZ 等 opcode 每次执行都会走这一检查，见 `instructions/stack.rs:19-23`、`instructions/bitwise.rs:25,121,134,147@ee9ab3f`。
- Gas：`record_cost_unsafe` 先回绕相减，再返回是否 OOG，见 `crates/interpreter/src/gas.rs:292-297@ee9ab3f`。
- pc：`ExtBytecode { instruction_pointer: *const u8, continue_execution, action: Option<InterpreterAction>, .. }`，见 `crates/interpreter/src/interpreter/ext_bytecode.rs:12-26`；`relative_jump`/`opcode` 见 `:132-152@ee9ab3f`。
- CALL/CREATE 不递归：handler 把 `Box<CallInputs>`/`Box<CreateInputs>` 写入 `bytecode.set_action(...)`，然后 `return Err(InstructionResult::Suspend)`，由 handler 的 frame 栈创建子帧，见 `crates/interpreter/src/instructions/contract.rs:159-162,230-246@ee9ab3f`。
- Memory：`SharedMemory { buffer: Option<Rc<RefCell<Vec<u8>>>>, my_checkpoint, child_checkpoint }`，所有帧共享一个缓冲区，借用经过 `RefCell`，见 `crates/interpreter/src/interpreter/shared_memory.rs:13-31,42-53@ee9ab3f`。扩容的热路径只比较字数，冷路径再计价，见 `:565-595@ee9ab3f`。
- Jumpdest：跳转表在 `OnceLock` 中懒计算，见 `crates/bytecode/src/bytecode/mod.rs:288-296@ee9ab3f`。analysis 已有 SIMD 实现（从 evm2#498 移植过来），见 `crates/bytecode/src/legacy/analysis.rs:14,58,165@ee9ab3f` 和 [19]；查表用 `pc < bit_len && bit`，见 `crates/bytecode/src/legacy/jump_map.rs:173-176@ee9ab3f`。
- Inspector 路径用的是另一个循环 `inspect_instructions`，每步调用 `inspector.step`/`step_end`，并记录 journal/log 的长度，见 `bluealloy_revm/crates/inspector/src/handler.rs:250-290@ee9ab3f`。
- **Mantle 基线（v107 = revm 38）**：`Instruction { fn_: fn(InstructionContext), static_gas: u64 }`，见 `bluealloy_revm/crates/interpreter/src/instructions.rs:37-40@d6293318`；`step` 返回 `()`，OOG 时调用 `halt_oog()`，见 `crates/interpreter/src/interpreter.rs:285-308@d6293318`；`run_plain` 写成 `while self.bytecode.is_not_end() { self.step(..) }`，见 `:322-331@d6293318`；jumpdest 在 `new_legacy` 时用标量循环（`BitVec`）**立即**分析，见 `crates/bytecode/src/legacy/analysis.rs:10-40@d6293318`。Mantle fork `v107-mantle-arsia.2` 在 `crates/interpreter` 和 `crates/bytecode` 两个目录下只给 `gas.rs` 加了一个 `Gas::set_limit`（`git diff v107 v107-mantle-arsia.2 -- crates/interpreter crates/bytecode`：1 file, +7），所以热路径与上游 v107 相同。

**固定开销清单（推断，来自上述代码结构）。** 每条 opcode 至少要：读 opcode → 写回 pc → 两次查表（fn 指针表、gas 表）→ 读、写剩余 gas → 构造上下文（2 个指针）→ 一次非尾调用的间接 call/ret → handler 内读栈长度（`Vec` 的 len 存在内存里）、检查边界、写回 len → 部分 opcode 检查 spec → 回到循环判断 `Result`。由于 handler 通过 `&mut Interpreter` 可能修改任何字段，编译器无法把 pc、栈长度、gas 一直留在寄存器里跨过这次间接调用。

**不确定之处。** 上面说“每次调用前后写回、重新加载”是根据 ABI/别名规则推断的，没有反汇编核实（revm#3347 的 PR 正文贴了 JUMPI 的汇编，可以看到 `mov r8, qword ptr [rdi + 192]` 这类从 `Interpreter` 结构里读栈长度的操作，算部分佐证 [19]）。

---

## H-Q2 evm2 的解释器怎么执行一条 opcode？与 revm 相比省掉了什么？

**答案。** evm2 有 5 种 dispatch 后端，在**编译期**由 `build.rs` 选定。`auto` 的规则是：wasm 用 `single_return`；rustc 是 nightly、没开 `no-tco`、也不是 cranelift 时用 `tco`；其余 64 位目标用 `packed`；再其余用 `unpacked`。热路径的核心做法是：(1) 每个 opcode 在每个 (EvmTypes, EvmConfig/spec, 是否 inspect) 组合下都有一个以 `const OP: u8` 单态化的 `dispatch` 包装函数，所以静态 gas、指令长度、是否需要动态 gas 都是编译期常量；(2) 指令表是 `const fn` 在编译期算出的 `&'static [fn; 256]`，每个 spec 一张，没有激活的 opcode 直接映射为 INVALID，handler 里不再做 spec 检查；(3) pc、栈长度、剩余 gas 作为**按值参数和返回值**在寄存器里流转，不经过 `&mut Interpreter`。`packed` 把 `pc 指针 << 11 | stack_len` 压进一个 `usize`，返回 `(PackedPc, RemainingGas)`；`tco` 用 nightly 的 `become` 加 `extern "rust-preserve-none"` 让每个 handler 直接尾跳到下一个 handler，不回到中心循环。

**依据：后端选择。**
- `evm2/crates/evm2/build.rs:21`：`CARGO_FEATURE_NO_TCO` 或 cranelift 会禁用 tco；`:41-55` 在构建时读 `EVM2_DISPATCH_BACKEND`（`cargo:rerun-if-env-changed`），所以这是**编译期**选择，不是运行时开关；`:57-72` 是 `auto` 的判定逻辑；`:88-97` 通过 `rustc -Vv` 判断是否 nightly。
- `evm2/crates/evm2/src/lib.rs:2-3@c8bb5a2`：只有 `cfg(tco)` 时才开启 `feature(explicit_tail_calls)` 和 `feature(rust_preserve_none_cc)`。
- `nightly` 这个 cargo feature **与选 tco 无关**，它只打开 `alloy-primitives/nightly`、`ruint/nightly` 等，见 `evm2/crates/evm2/Cargo.toml`（`[features] nightly = [...]`）@c8bb5a2。真正决定能否走 tco 的是 rustc 是否 nightly；`no-tco` 用来在 nightly 上关掉它，见 `evm2/README.md:68-69@c8bb5a2`。
- CI 在 stable 和 nightly 两条工具链上都跑测试和 EEST，所以 packed 与 tco 都会在 CI 覆盖到，见 `evm2/.github/scripts/matrices.py`（`toolchains = ["stable","nightly"]`）@c8bb5a2。

**依据：各后端的形态。**
- `tco`：`TailInstrFn = extern "rust-preserve-none" fn(pc: Pc, stack: RawStack, remaining_gas: RemainingGas, state: &mut InterpreterState, instructions: *const ())`，见 `evm2/crates/evm2/src/interpreter/dispatch/tco.rs:12-20` 与 `interpreter/utils.rs:49-77@c8bb5a2`（`tail_return!` 展开为 `become`）。handler 依次做 `pre_step`（用按值传入的 `RemainingGas` 扣静态 gas）→ 只在 `dynamic_gas` 或 inspect 时把 gas 同步到 `state` → 执行指令体 → `inc_pc` → 从表里取下一个 opcode 的函数并 `become` 过去，见 `tco.rs:43-111`；出错时尾调到 `#[cold]` 的 `tail_call_restore`，把 pc、栈长度、gas 写回状态，见 `:117-131@c8bb5a2`。
- `packed`：`RawInstrFn = fn(pc: PackedPc, stack: &mut StackBacking, remaining_gas: RemainingGas, state) -> (PackedPc, RemainingGas)`，见 `dispatch/table/packed.rs:16-26`；`STACK_LEN_BITS = ilog2(1024)+1 = 11`，`PackedPc(usize) = (pc_ptr << 11) | stack_len`，见 `:121-152`；`update()` 用“差值相加”计算新值，这样常量步长的 handler 只需要一条 `add`，见 `:153-162@c8bb5a2`。外层循环：`op = cursor.pc().op(); instr = instructions[op]; cursor = instr(...)`，用 pc 是否为 NULL 判断退出，见 `dispatch/table/mod.rs:151-190@c8bb5a2`。
- `single_return`：`fn(pc: Pc, stack: StackMut, state) -> Pc`，栈长度通过 `&mut usize` 写出，见 `dispatch/table/single_return.rs:11-12@c8bb5a2`。`unpacked`：`fn(pc, Stack, state) -> (Pc, usize)`，gas 留在 state 里，见 `dispatch/table/unpacked.rs:12-16@c8bb5a2`。
- 共享的单步逻辑 `dispatch_inner` 见 `dispatch/table/mod.rs:103-136`；`DispatchGas` 抽象了“gas 在寄存器里”（`RemainingGas`）和“gas 在 state 里”（`()`）两种情况，见 `:53-101`、`packed.rs:59-92@c8bb5a2`。

**依据：“static dispatch tables” 在代码里是什么。**
- `make_table::<T, C, M>` 是 `const fn`，对 0x00..0xFF 逐项填入 `imp::dispatch::<T, C, M, OP>`；如果某个 opcode 相对上一个 spec 的 `revision` 没变，就复用上一张表的条目，见 `evm2/crates/evm2/src/interpreter/dispatch/mod.rs:57-80,208-217@c8bb5a2`。
- `ConfigInstrTables::<T,C>::INSTRUCTIONS / INSPECT_INSTRUCTIONS` 与 `SelectorInstrTables::INSTRUCTIONS: &'static [InstrTable; SpecId::COUNT]` 是关联常量，见 `dispatch/mod.rs:164-205`；`ExecutionConfig` 里保存的是 `&'static InstrTable<T>`，见 `evm2/crates/evm2/src/evm/config.rs:131-138,167-175@c8bb5a2`；进入解释器时再按是否有 inspector 选用其中一张，见 `interpreter/runtime.rs:445-463@c8bb5a2`。
- opcode 只在激活它的 spec 段里注册，例如 `SHANGHAI { ops: [PUSH0: BASE] }`、`OSAKA { ops: [CLZ: LOW] }`，见 `evm2/crates/evm2/src/version/mod.rs:700-712,746-750@c8bb5a2`，由 `base_opcode_config` 按 `spec_id.enables(..)` 叠加，见 `:227-242`。没有实现的 opcode 一律映射为 `invalid`，见 `version/opcode_config.rs:145-151@c8bb5a2`。
- 有无 inspector 用两套单态化的表区分（`NoInspector` 与 `DynInspector`，带 `const INSPECT: bool`），所以非 inspect 的表里完全没有 step/step_end 的分支，见 `dispatch/mod.rs:219-253@c8bb5a2`。

**依据：`#[instruction]` 宏生成了什么。**
- 生成一个零大小结构体，并实现 `evm2::interpreter::private::Instruction<T>`：`const DYNAMIC_GAS: bool`，以及 `fn execute(pc: &mut Pc, stack: StackMut, state: &mut InterpreterState) -> Result`，见 `evm2/crates/macros/src/lib.rs:196,300-320@c8bb5a2` 与 `crates/evm2/src/interpreter/private.rs:5-16@c8bb5a2`。
- 栈序言：调用一次 `instr_stack_setup(&mut stack, inputs, outputs)`，统一检查 underflow/overflow、更新长度，返回槽位基址指针；之后输入和输出**直接绑定为栈槽的引用**，不复制成 `[Word; N]` 数组，见 `macros/src/lib.rs:401-470` 与 `interpreter/stack.rs:324-351@c8bb5a2`（evm2#142 的说明）。
- `cx: _` 展开为 `InstructionCx { pc, state }`；只有带 `#[instruction(dynamic_gas)]` 时才会拿到 `GasInstructionCx { pc, gas, state }`，见 `macros/src/lib.rs:273-296`。dispatch 层只对 `DYNAMIC_GAS` 为真的指令把寄存器里的 gas 同步到内存，见 `tco.rs:79-90`、`packed.rs:69-92@c8bb5a2`。ADD 的写法是 `#[instruction] pub fn add([a, b]: [Word]) -> out { out.write(a.wrapping_add(*b)); }`，见 `interpreter/instructions/arithmetic.rs:5-8@c8bb5a2`。

**依据：stack / gas / pc。**
- 栈：`#[repr(C, align(32))] StackBacking([MaybeUninit<U256>; 1024])`，装在 `Box` 里，长度单独保存，对齐到 32 字节是为了让一个字不跨 cache line，见 `interpreter/stack.rs:14-19` 与 `runtime.rs:37-39@c8bb5a2`。evm2#667 用一次 32 字节的 store 写栈字（`write_word`），避免 store-to-load forwarding 失败造成的停顿（PR 正文给出 snailtracer 上 13.1M→3.5M 次停顿）[14]。
- Gas：`RemainingGas(u64)` 是 `#[repr(transparent)]`，`spend` 先回绕相减再判断，见 `interpreter/gas.rs:480-519`；`Gas` 用 `#[repr(C)]` 把 `tracker.remaining` 放在偏移 0，见 `:522-526`；`GasTracker` 还带 EIP-8037 的 reservoir 和 state gas 字段，见 `:136-160@c8bb5a2`。动态 gas 参数表 `GasParams` 挂在运行时的 `Version` 上，见 `version/mod.rs:27-32` 与 `version/gas_params.rs:197@c8bb5a2`。注释说明这样设计是为了“改参数后所有读取它的指令自动生效”，适合自定义 fork。
- pc：`Pc { pc: *const u8 }`，`op()` 直接解引用，见 `interpreter/ctrl.rs:13-15,60-63`；`inc_pc` 以 `OP` 为常量计算步长（PUSHn 为 n+1，JUMP/JUMPI 在指令体内设置），见 `dispatch/mod.rs:40-52@c8bb5a2`。
- `InstrStop` 为 `#[repr(u8)]`，`Stop = 1`，因此 `Result<(), InstrStop>` 只占一个字节，`Ok` 为 0，见 `interpreter/mod.rs:48-55@c8bb5a2`（revm main 已有相同写法）。

**依据：bytecode 分析。**
- 末尾补 33 个 0（最长 PUSH 立即数 + STOP），见 `evm2/crates/evm2/src/bytecode/analysis.rs:157-180`；跳转表在 `OnceLock` 中懒计算，见 `bytecode/mod.rs:160-175,314-322`；SIMD 内核按运行时检测在 AVX-512 VBMI / AVX2 / SSE4.1 之间选择，aarch64 用 NEON，见 `bytecode/analysis/x86.rs:1-60`、`analysis.rs:58-70`；`JumpTableRef::is_valid` 是“范围检查 + 位测试”，见 `bytecode/jump_table.rs:180-188@c8bb5a2`。JUMP 的实现：`to_usize_saturated` → `is_valid_jumpdest` → `pc.set_unchecked`，见 `interpreter/instructions/control.rs:20-42@c8bb5a2`。
- 这一项**已移植到 revm main**（revm#3947，“Port of alloy-rs/evm2#498”）[19]，因此在 jumpdest 分析上 revm main 与 evm2 基本持平；Mantle 的 v107 仍是立即执行的标量分析。

**与 revm 对照：省掉了什么（逐项）。**

| 项 | revm（main / v107） | evm2 | 省掉的东西 |
|---|---|---|---|
| dispatch 形态 | 中心循环 + 非尾调用的间接 call（`interpreter.rs:295-342`） | packed：循环 + 寄存器传参；tco：handler 之间 `become` 尾跳 | tco 去掉了 call/ret 和中心循环，每个 handler 有自己的间接跳转点（分支预测更好，属推断） |
| pc / 栈长度 / gas | 放在 `Interpreter` 字段里，通过 `&mut` 访问 | 按值传参和返回（`PackedPc` + `RemainingGas`） | 每条 opcode 对这三项的内存读写；packed 的循环降到每 opcode 10 条指令（evm2#745 自述） |
| 静态 gas | 运行时查 `gas_table[opcode]`（main），或者从 16 字节的 `Instruction` 里读（v107） | `C::OPCODE_CONFIG.static_gas(OP)` 是编译期常量 | 一次查表，以及 gas 在内存中的读写 |
| spec 门控 | handler 内运行时 `check!(spec)` | 每个 spec 一张表，未激活的 opcode 指向 INVALID | 门控 opcode 的分支和 `spec_id` 读取 |
| 指令表 | 运行时 `Box` 表，可 `insert_instruction` | `const` 计算的 `&'static` 表，按类型、配置单态化 | 运行时可变性（代价是要通过类型或配置定制 opcode） |
| inspector | 另一个循环 `inspect_instructions` | 单态化的 `INSPECT_INSTRUCTIONS` 表 | 两者都把 inspect 分支移出了普通路径（不算 evm2 独有） |
| 栈 | `Vec<U256>`（对齐 8） | 32 字节对齐的定长数组 + 寄存器中的长度 + 32 字节 store | store-forwarding 停顿和 len 的内存往返 |
| CALL | `Box<CallInputs>` → `Err(Suspend)` → handler 的 frame 栈 | 栈上的 `Message` → `host().execute_message(..)` 递归执行（`instructions/system.rs:230-243`） | 每次 CALL 的 Box 分配和一次“退出解释器再进入”；代价是递归占用原生栈（evm2#135、#595 处理栈深度） |
| memory | 全部帧共享 `Rc<RefCell<Vec<u8>>>` 和检查点 | 每个解释器一个 `Memory { data: Vec<u8>, memory_limit }`（`interpreter/memory.rs:6-36`），解释器被池化 | RefCell 借用计数与检查点逻辑；代价是 CALL 时要复制 calldata（DaniPopes 在 revm#3601 的说法） |

**不确定之处。**
- “tco 分支预测更好”“编译器能把值留在寄存器”属于通用的解释器理论（revm#2140 引用了 Pulley/wasmtime 的 tail-loop），evm2 仓库没有直接测量分支预测失误率；它测量过的是指令数、cycles 和 store-forwarding 停顿 [14]。
- evm2 的表按 (T, C, M, OP) 单态化，可能带来代码体积膨胀。`instruction_changed` 复用上一个 spec 的条目可以缓解，但我没有测量二进制体积。

---

## H-Q3 evm2 的 JIT/AOT（`crates/jit`）

**答案。** `crates/jit` 是 **revmc 移植到 evm2 的版本**（evm2#207，DaniPopes，2026-06-27 合并，+37,705 行）。后端是 LLVM，通过 inkwell 0.10 绑定 **LLVM 23**（revmc 目前用 LLVM 22）。它通过 `InterpreterRunner` 钩子挂进 evm2：按 (code_hash, spec_id) 查找已编译的程序，命中就运行原生代码，没命中就回退到解释器；编译在后台 worker 中进行，默认同一段代码 miss 8 次才触发编译。成熟度：README 写明 “Experimental”；`RuntimeConfig.enabled` 默认是 `false`；JIT 上下文**写死为 `BaseEvmTypes`**，自定义 EvmTypes（L2 定制）目前用不上 JIT；有 inspector 时不走 JIT。gakonst 推文里的 “JIT baked in”，在代码中对应“同一个 workspace + 一等的 `InterpreterRunner` 钩子 + 同一套 EEST 跑 interpreter/JIT/AOT”，**并不是 evm2 crate 默认就会 JIT 执行**。

**依据。**
- 来源与关系：evm2#207 正文 “Draft PR for porting revmc into `crates/jit` as the evm2 JIT implementation … removes the revm-specific integration paths” [12]。`evm2/crates/jit/README.md:3,66@c8bb5a2` 与 `paradigmxyz_revmc/README.md:3,80@6860b6f` 的措辞和 credits（paradigmxyz/jitevm）相同，配图的 asset id 也相同（`96adf64b-…`）。revmc 最近 50 个提交里 DaniPopes 占 31 个（`git log --format=%an | sort | uniq -c`），evm2 全仓 791 个提交里他占 477 个，二者主要作者是同一人。revmc 仍在维护，依赖 `revm-context = 43.0.3`，见 `paradigmxyz_revmc/Cargo.toml:53@6860b6f`，所以目前是**两条并行的代码线**。
- 后端：`evm2/crates/jit/llvm/Cargo.toml:21@c8bb5a2`（`inkwell = { version = "0.10.0", features = ["llvm23-1"] }`）；README 要求 LLVM 23、只支持 Linux/macOS，不支持 Windows，见 `crates/jit/README.md:24-25`；evm2#602 “chore(jit): update to LLVM 23”。revmc 的要求见 `paradigmxyz_revmc/README.md:25@6860b6f`（LLVM 22）。
- 架构：codegen / runtime / backend trait / llvm / builtins / context / build 七个 crate，见 `evm2/crates/jit/AGENTS.md`（“Architecture” 一节）@c8bb5a2。
- 接入点：`pub trait InterpreterRunner<T>`（返回 `None` 就回退到解释器）见 `evm2/crates/evm2/src/evm/mod.rs:189-203`；`set_interpreter_runner` 见 `:934`；执行时 inspector 优先，其次才是 runner，见 `:1630-1638@c8bb5a2`。`JitInterpreterRunner` 只实现了 `InterpreterRunner<BaseEvmTypes>`，见 `evm2/crates/jit/runtime/src/evm2_evm.rs:29`；JIT 上下文 `EvmContext.interpreter: NonNull<Interpreter<'_, '_, BaseEvmTypes>>` 见 `crates/jit/context/src/lib.rs:45@c8bb5a2`。
- 编译缓存与预热：`run_interpreter` 在禁用时直接返回 `None`，`gas > i64::MAX` 时也返回 `None`；查找键是 `RuntimeCacheKey { code_hash, spec_id }`，结果为 `Unavailable` 时回退，见 `evm2_evm.rs:45-68`。默认配置：`enabled: false`、`jit_hot_threshold: 8`、`jit_max_bytecode_len: 24 KiB`、`jit_worker_count = clamp(ceil(cpus/2),1,4)`、`resident_code_cache_bytes: 1 GiB`（LRU）、`idle_evict_duration: 600s`、`compiler_recycle_threshold: 1000`，另有 AOT 制品存储（`store`）、`OutOfProcess` 编译模式（带超时、RLIMIT_AS 和 CPU 亲和性限制），见 `crates/jit/runtime/src/runtime/config.rs:12,20,63,126,171,211-217,265-285,327,361-388@c8bb5a2`。`blocking` 模式的注释写着 “not for production use”，见 `:123`。
- 语义差异：`single_error` 默认为 `true`，所有失败路径（栈溢出、非法跳转、OOG 等）在 JIT 中都折叠成 `InstrStop::OutOfGas`。注释给出的理由是 “Semantically, the EVM has only one halt; the distinct failure codes exist purely for debugging”，见 `crates/jit/codegen/src/compiler/translate/mod.rs:334-346` 与 `runtime/src/runtime/config.rs:51-63@c8bb5a2`。
- 共享语义与测试：`cargo st` 会在同一套 EEST 上跑 interpreter、JIT 和 AOT，见 `evm2/AGENTS.md:25@c8bb5a2`；编译模式默认只跑子集（AOT 用 `ci-aot`，11 个目录；JIT 用 `ci-smoke`，14 个文件），可用 `EVM2_COMPILED_EEST_SUBSET=all` 覆盖，见 `AGENTS.md:52-55` 与 `crates/eest/src/harness.rs:153-221@c8bb5a2`。CI 的 `jit` job 矩阵：ubuntu 上 JIT 的 subset 为 `all`，macOS 上 JIT 为 `ci-smoke`（PR 上不跑 macOS），ubuntu 上 AOT 为 `ci-aot`；过滤条件只有 `test(statetests::{jit,aot})`，见 `evm2/.github/workflows/ci.yml:206-271@c8bb5a2`。另有 `bench.yml` 在每个 PR 上跑 JIT codegen 基准，见 `.github/workflows/bench.yml`、`crates/jit/AGENTS.md`（“Benchmarking”）。
- 调优记录：`crates/jit/EXPERIMENTS.md@c8bb5a2` 列出数十项被否决的 LLVM pass 和 llc flag，并附数字。例如 `gvn` 让 opt 时间变成 67 倍、spill 变成 3 倍；`-enable-machine-outliner` 让 JIT 体积 −11.5%，但 runtime +1.2%。说明 JIT 正在密集调优。
- 推文对照：gakonst 2026-10-25 的推文（“new EVM … just wrapped audit, it has JIT baked in”）[24] 没有点名 evm2。仓库里没有审计报告文件，只有按 PR 触发的 `cyclops-audit.yml`（tempoxyz 的 agentic audit workflow），见 `evm2/.github/workflows/cyclops-audit.yml@c8bb5a2`。

**不确定之处。**
- “new EVM = evm2” 是从作者、仓库归属（alloy-rs）和时间推断的，推文没有明说（speculative）。
- `single_error` 对共识的影响：异常 halt 在两边都会耗尽 gas，receipt 只记录 status，所以理论上不影响状态。但 trace 和 RPC 返回的错误原因会和解释器不一致。我没有逐一核实 JIT 失败路径是否包含 revert 类代码（CallTooDeep/OutOfFunds 这类不耗尽 gas 的）。
- CI 中 JIT 跑 full EEST 是我按 GitHub Actions 的 `include` 合并规则推断的（后面的 include 可以覆盖前面 include 添加的值），没有看 CI 运行日志。

---

## H-Q4 性能证据：“up to 2x faster than revm” 有没有公开 benchmark？

**答案。** **仓库里没有找到能支撑 “2x” 的公开 evm2-vs-revm 数据。** 这句话由 evm2#136（2026-05-13，“docs: add readme”）加入，PR 里没有 benchmark。仓库里唯一公开的正面对比是 evm2#384（2026-09-06）：10 个主网区块（2,279 笔交易、276.6M gas）回放，Ryzen 9 7950X、rustc nightly、对比 **revm 42.0.1**，TCO 后端 1.19×，packed 后端 1.10×。此后还有多个只和 evm2 自身前一版本比较的大幅优化（#667、#693、#745），所以当前比值可能更高，但没有公开的新对比数字。bench harness 本身支持用 `EVM2_BENCH_REVM=1` 对每个 fixture 并排跑 revm 43。

**依据（全部来自项目方 PR 正文，数字附带它们的测试条件）。**
- “2x” 的来源：`evm2/README.md:7@c8bb5a2`；`git log -S'2x faster' -- README.md` → `af748d0 2026-05-13 docs: add readme (#136)`；evm2#136 正文没有数据 [15]。
- **对比 revm 的数据**：evm2#384 维护者编辑后的说明是 “Local measurements at 57737070 on an AMD Ryzen 9 7950X, Linux x86_64, rustc 1.100.0-nightly, and revm 42.0.1 … 10 mainnet blocks, 2,279 transactions … Default (TCO) 145.89 ms vs 173.32 ms 1.19×; Packed 156.76 ms vs 171.81 ms 1.10×”，计时包含 DB 准备、交易解码、执行、区块提交，并有逐笔交易的 parity 校验；作者最初在 Apple M5 Pro 上测得 1.14×（扣除共享 setup 后 1.19×），已被上面的数字取代 [13]。
- harness：`evm2/crates/cli/benches/evm.rs:59-140@c8bb5a2`（`EVM2_BENCH_REVM` 打开后对 Transaction 用例和 BlockchainReplay 用例都并排跑 revm）；fixture 列表包括 snailtracer、burntpix、onchain_lm_v2、erc20_transfer、seaport、uniswap_v3_pool 等 30 余个合约、10 组预编译，以及 `mainnet_25347446_25347455` 回放，见 `crates/cli/src/evm_bench.rs:75-122@c8bb5a2`；对比基线是 workspace 依赖 `revm = 43`，见 `evm2/Cargo.toml`（`revm = { version = "43", features = ["asm-keccak"] }`）。
- **evm2 自身的迭代收益**（只与 evm2 前一版比较，不能直接换算成相对 revm 的倍数）：
  - #78（2026-05-06）：非 nightly 路径的 `raw_step` 从 `inline(never)` 改为 `inline(always)`，snailtracer 84.8→61.6 ms（−27.3%）。
  - #25（2026-05-07）：tco 路径按值传递 RemainingGas；callgrind 指令数 −0.47%～−3.41%；同一项 onchain_lm_v2 完整跑是 −26.65%，定向重跑是 −8.23%，说明噪声很大。
  - #113（2026-05-13）：packed 返回值，`--features no-tco`；proxy/token 类小基准 −33%～−43%（push0_proxy −34.00%、seaport −43.61%），snailtracer −4.54%，curve_stableswap +1.70%。
  - #667（2026-10-17）：消除 store-to-load 停顿和符号分支预测失误；Zen 5（EPYC 4585PX）criterion 中位数（3 轮）：snailtracer 36.03→27.55 ms（−23.5%，默认 target），burntpix −30.5%，erc20_transfer −33.4%，curve_stableswap −24.4%，mainnet replay −6.2%。
  - #693（2026-10-18）：packed 后端把打包后的 pc 直接传给 handler；callgrind −2.78%～−6.84%；Zen 4（EPYC 9124）墙钟 −0.1%～−9.3%（mainnet replay −0.1%/−0.9%）。
  - #745（2026-10-23）：packed handler 直接返回剩余 gas；循环从每 opcode 12 条指令降到 10 条；callgrind −3.9%～−9.2%；墙钟 −0.6%～−3.0%。PR 同时指出 `-Ctarget-cpu=native` 下代码布局影响很大：改动一个无关的冷函数，snailtracer 就 +8.5%。
  - #498（2026-09-28）：SIMD jumpdest 分析，>2 KB 的合约快 4–9 倍；10 区块回放 1.07–1.15×。
  - 以上见 [14]。
- 外部线索：getfoundry.sh/perf/evm2/（`crates/jit/AGENTS.md` 中提到的 perf 站点）在 2026-10-25 用 `curl` 访问返回 **HTTP 404** [26]。
- **本机 benchmark：未完成。** 命令 `CARGO_TARGET_DIR=/tmp/evmr/target-evm2 EVM2_BENCH_REVM=1 cargo bench -p evm2-cli --bench evm --no-run`（evm2 `c8bb5a2`，Apple M2 Pro，rustc 1.99.1 stable，也就是会走 packed 后端）在构建 `mcl_rust v1.2.0`（默认 feature `bn254-mcl`）时失败，原因是 “is `cmake` not installed?”。为了不改动本机系统环境，没有安装 cmake，因此没有本机数字。

**不确定之处。**
- #384 之后（#667/#693/#745 等）evm2-vs-revm 比值的变化没有公开数据；revm 在 #384 之后也合入了 #3947 等优化。
- “2x” 可能来自某个计算密集型 fixture（如 snailtracer、burntpix）的内部 CodSpeed 或 criterion 结果，但我找不到公开记录（speculative）。
- 回放基准的计时包含 DB、提交、预编译和 keccak（#667 原话：“precompile crypto and keccak take a large share”），所以解释器上的提升在回放里被明显稀释（#667：解释器基准 −23%～−34%，回放只有 −4.8%～−6.2%）。

---

## H-Q5 revm 这边有没有对应的优化？哪些 revm 做起来难、哪些 revm 也能做？

**答案。** revm 主仓已经吸收了一部分 evm2 作者的热路径改动：handler 返回 `Result`（#3558）、指令表与 gas 表分离（#3561）、SIMD jumpdest 分析（#3947，明确是从 evm2#498 移植来的）、`Stop = 1` 的结果编码、JUMP 精简（#3347）。tail-call dispatch 在 revm 里尝试过三次：#2778（DaniPopes，2025-07～2026-04，关闭）、#3307（gakonst 用 trampoline 实现，被 DaniPopes 评价为 “This is not even correct”，关闭）、#3556（decofe + DaniPopes + gakonst，`become` + `rust-preserve-none`，在 `tail_call` feature 下自测 snailtracer −8.7%、burntpix −13.2%，开 PR 当天被 DaniPopes 关闭），都没有合入；跟踪 issue #2140 仍然开着。把 SharedMemory 换成每帧独立 Memory 的提案（#3601）被 revm 维护者 rakita 拒绝。revm 与 revmc 之间目前没有集成 PR。结论：TCO、寄存器传参、编译期 opcode 常量这些技术本身 revm **也能做**（#3556 已经证明可行）；真正难的是 revm 的架构约定：运行时可变的 `Box` 指令表和 `insert_instruction`、`InterpreterTypes` 加 `&mut Interpreter` 的 handler 签名、运行时 spec 检查、共享内存和非递归的 frame 栈。改这些就是破坏性的 API 变更，而且维护者在 memory 等问题上有不同取舍。

**依据。**
- revm#3558（2026-04-23 合并，DaniPopes）：“Convert all instruction functions from returning () to returning Result<(), InstructionResult>”；revm#3561（2026-04-20 合并）：“Split the combined Instruction struct (fn pointer + u64 gas) into two separate tables … GasTable ([u16; 256])”；revm#3947（2026-09-28 合并，decofe）：“Port of alloy-rs/evm2#498”；revm#3347（2026-01-25 合并）：精简 JUMPI 的汇编 [19]。
- revm#2140（rakita 开，2025-03-04，仍为 OPEN）：“Interpreter tail call dispatch … h/t @DaniPopes”，指向 Pulley 的 tail_loop；revm#2778：CodSpeed 报告 “degrade performances by 12.81%”，2026-04-01 关闭；revm#3556：正文附带上述自测表，CodSpeed 报告 “degrade performance by 3.76%”（并提示运行环境不一致），2026-04-12 由 DaniPopes 关闭，没有写理由；revm#3307：DaniPopes 评论 “This is not even correct” [20]。
- revm#3601（DaniPopes，2026-04-23 关闭）：提议删除 `SharedMemory`；rakita 回复 “The current version is an optimisation on memory usage and access, there is no reason to remove it”；DaniPopes 回复 “Frames are pooled, the only thing this really optimizes is a single clone of calldata on CALL…” [21]。evm2 仓库创建于 2026-04-30（`gh repo view`，`createdAt`；首个提交 `c30c97d 2026-04-30 initial commit`），时间上紧接这些被拒或被关闭的 PR。
- revm#2363 “Tracking: Performance”（rakita，仍为 OPEN）：“As in Reth, execution is becoming a bottleneck” [22]。
- revm 中 revmc 相关的 issue：#2694 “revmc outdated”（2025-07，rakita 回复 “Best to ask there”）。没有找到 revm 内置 revmc 的 PR。
- RISE 推文（hai_rise，2026-10-20）称下游化 revm 之后，经过 “register optimizations, op-code fusions, smart inlining and caching”，处理 RISE 区块 “2x faster than revm” [25]。这是项目方的自述，没有附带测试条件。

**可移植性判断（推断）。**

| 优化 | revm 能否做 | 理由 |
|---|---|---|
| Result 返回 / 分离 gas 表 / SIMD jumpdest / 懒跳转表 | 已做（main） | [19]；Mantle 的 v107 还没有 |
| TCO（`become` + preserve_none） | 能，但要依赖 nightly 并加 feature 门控 | revm#3556 已有实现；evm2 也只在 nightly 上自动启用 |
| packed pc/len + 寄存器中的 gas | 能，但 handler 签名要大改 | revm handler 通过 `&mut Interpreter` 读写字段；改动面覆盖所有指令和 `InterpreterTypes` |
| 每 spec 一张 const 表，去掉 handler 内的 `check!` | 部分能 | 与 `EthInstructions` 运行时 `Box` 表、`insert_instruction` 的定制方式冲突 |
| 32 字节对齐栈 + 32B store（#667） | 能 | 局部改动；revm 中搜索 `write_word\|align(32)` 无结果，说明尚未移植 |
| 每帧独立 Memory / 递归 CALL | 维护者已拒绝（memory） | revm#3601 |

---

## 资料中被修正的地方（GPT Deep Research §4.1、§4.4、§5.2、§5.4、§5.5、§10）

1. **§5.2 “这些选项由 `EVM2_DISPATCH_BACKEND` 控制”**：说法不完整。它是 `build.rs` 在**编译期**读取的环境变量，结果写成 `cfg`（`evm2/crates/evm2/build.rs:41-55`），不能在运行时切换。默认 `auto` 的规则是：wasm→single_return，nightly rustc→tco，64 位→packed，其他→unpacked（`:57-72`）。另外，`nightly` cargo feature 不会开启 TCO，开启 TCO 靠的是检测 rustc 是否为 nightly（`:88-97`）。
2. **§5.2 packed cursor 包含 “program counter / stack length / dispatch metadata”**：不准确。实际是 `(pc 指针 << 11) | stack_len`，没有其他 dispatch 元数据；剩余 gas 是**单独**的 `RemainingGas` 返回值（`dispatch/table/packed.rs:16,121-162@c8bb5a2`）。
3. **§5.2 “packed 通常带来几个百分点到接近 10%”**：低估了，而且比较对象搞混了。#693、#745 确实在 −0.1%～−9.3% 之间，但 #113 在小基准上是 −33%～−43%，#667 在 snailtracer/burntpix/erc20 上是 −23%～−34%。这些都是 evm2 与自身旧版的比较，**不是**与 revm 的比较 [14]。
4. **§5.2 关于 “up to 2x” 的猜测**：GPT 没有指出仓库里唯一的公开正面对比是 #384 的 **1.10×（packed）/ 1.19×（TCO）**，条件是主网 10 区块回放、对比 revm 42.0.1 [13]。没有找到任何公开的 2× 数据。
5. **§4.1 revm 的简化循环（`Continue => pc += 1; Call(frame) => return frame`）**：与实现不符。revm 先 `relative_jump(1)` 再执行（`interpreter.rs:307@ee9ab3f`）；handler 返回 `Result<(), InstructionResult>`；CALL/CREATE 是先 `set_action(Box<..>)` 再 `Err(Suspend)`（`instructions/contract.rs:159-162,230-246@ee9ab3f`）。Mantle 所用的 v107 又是另一种形态：handler 返回 `()`，循环用 `is_not_end()` 判断（`interpreter.rs:322-331@d6293318`）。
6. **§4.1 “`Instruction` 是 opcode 函数指针”**：在 main 上成立，在 Mantle 基线 v107 上不完整，那里 `Instruction` 还带着 `static_gas: u64`（`instructions.rs:37-40@d6293318`）。
7. **§5.4 “handler 返回 remaining gas 而不是 gas spent”**：只对 **packed** 后端成立，而且是 2026-10-23 的 #745 才改的。tco 是按值传入 RemainingGas 并尾传下去；single_return 和 unpacked 的 gas 仍留在 state 里（`dispatch/table/{single_return,unpacked}.rs`）。
8. **§4.4 / §5.5 “统一测试路径、减少语义漂移”**：需要加限定。JIT 是 revmc 的移植版（#207），只实现了 `BaseEvmTypes`（`jit/context/src/lib.rs:45`、`jit/runtime/src/evm2_evm.rs:29`），自定义类型的链目前没有 JIT 路径。编译模式的 EEST 默认只跑子集（ci-aot/ci-smoke），CI 也只覆盖 state tests；JIT 默认 `single_error=true`，halt 原因与解释器不同。
9. **§5.5 “是否已有 JIT 方向：是”**：属实，但应补充：JIT 默认关闭（`RuntimeConfig.enabled=false`），需要 LLVM 23，不支持 Windows，README 标为 Experimental。
10. **§10**：Amdahl 的算法本身没问题，但 30%/10% 的解释器占比是假设，没有来源。evm2 自己的回放数据（#667：解释器基准 −23%～−34%，回放 −4.8%～−6.2%）可以作为“被稀释”的实证。

---

## 来源

1. **PRIMARY** `alloy-rs_evm2/README.md@c8bb5a2`：证明 “up to 2x faster than revm” 的宣称，以及 `nightly`/`no-tco` feature 的定义。
2. **PRIMARY** `alloy-rs_evm2/AGENTS.md@c8bb5a2`：证明 evm2 自称 revm 的重新实现、无 API 稳定性保证，以及 dispatch 后端环境变量和 EEST 子集规则。
3. **PRIMARY** `alloy-rs_evm2/crates/evm2/build.rs@c8bb5a2` 与 `src/lib.rs`、`src/interpreter/utils.rs`：证明后端在编译期选择、TCO 依赖 nightly 的 `become` 和 `rust-preserve-none`。
4. **PRIMARY** `alloy-rs_evm2/crates/evm2/src/interpreter/dispatch/{mod.rs,tco.rs,table/{mod,packed,single_return,unpacked}.rs}@c8bb5a2`：证明各后端的签名、PackedPc 布局、const 表的构建方式和 inspect 单态化。
5. **PRIMARY** `alloy-rs_evm2/crates/evm2/src/interpreter/{stack.rs,gas.rs,ctrl.rs,private.rs,mod.rs,runtime.rs,memory.rs,instructions/*.rs}@c8bb5a2`：证明栈、gas、pc 的表示，`InstrStop` 的编码，以及 CALL 递归执行。
6. **PRIMARY** `alloy-rs_evm2/crates/macros/src/lib.rs@c8bb5a2`：证明 `#[instruction]` 生成的 trait 实现、栈序言和 DYNAMIC_GAS。
7. **PRIMARY** `alloy-rs_evm2/crates/evm2/src/bytecode/{analysis.rs,analysis/x86.rs,mod.rs,jump_table.rs}@c8bb5a2`：证明 33 字节补齐、懒跳转表和 SIMD 分析。
8. **PRIMARY** `alloy-rs_evm2/crates/evm2/src/version/{opcode_config.rs,mod.rs,gas_params.rs}`、`src/evm/{config.rs,mod.rs}@c8bb5a2`：证明每个 spec 的 opcode 配置、静态 gas 表、运行时 GasParams 和 `InterpreterRunner` 钩子。
9. **PRIMARY** `alloy-rs_evm2/crates/jit/{README.md,AGENTS.md,EXPERIMENTS.md,llvm/Cargo.toml,runtime/src/runtime/config.rs,runtime/src/evm2_evm.rs,context/src/lib.rs,codegen/src/compiler/translate/mod.rs}@c8bb5a2`：证明 JIT 的后端和版本、缓存与预热参数、BaseEvmTypes 限制以及 `single_error` 语义。
10. **PRIMARY** `alloy-rs_evm2/crates/eest/src/harness.rs`、`.github/workflows/{ci.yml,bench.yml,cyclops-audit.yml}`、`.github/scripts/matrices.py@c8bb5a2`：证明 JIT/AOT 的 EEST 子集、CI 覆盖范围，以及仓库里没有审计报告文件。
11. **PRIMARY** `alloy-rs_evm2/crates/cli/{benches/evm.rs,src/evm_bench.rs}`、根 `Cargo.toml@c8bb5a2`：证明 benchmark 的 fixture 集合、`EVM2_BENCH_REVM` 并排对比和 revm 43 基线。
12. **PRIMARY** alloy-rs/evm2#207（`gh pr view 207`）：证明 `crates/jit` 是从 revmc 移植来的。
13. **PRIMARY** alloy-rs/evm2#384（`gh pr view 384`）：证明唯一公开的 evm2-vs-revm 对比是 1.19×（TCO）/1.10×（packed），主网回放，revm 42.0.1，Ryzen 9 7950X。
14. **PRIMARY** alloy-rs/evm2#25、#78、#113、#498、#667、#685、#693、#745（`gh pr view`）：证明 evm2 自身的迭代性能数据及其测试条件和噪声。
15. **PRIMARY** alloy-rs/evm2#136 与 `git log -S'2x faster'`：证明 “2x” 宣称加入时没有附带数据。
16. **PRIMARY** `bluealloy_revm/crates/interpreter/src/{interpreter.rs,instructions.rs,instruction_context.rs,instruction_result.rs,instructions/{macros,arithmetic,stack,bitwise,contract}.rs,interpreter/{stack,ext_bytecode,shared_memory}.rs,gas.rs}@ee9ab3f`：证明 revm main 的单步执行流程、类型、栈、memory 和运行时 spec 检查。
17. **PRIMARY** `bluealloy_revm` tag v107（`d6293318`）的 `interpreter.rs`、`instructions.rs`、`bytecode/legacy/analysis.rs`、`bytecode/mod.rs`；`mantle-xyz_revm` 的 `git diff v107 v107-mantle-arsia.2`：证明 Mantle 的热路径等于上游 revm 38（旧版 Instruction 结构、立即执行的标量分析）。
18. **PRIMARY** `bluealloy_revm/crates/handler/src/{evm.rs,instructions.rs}`、`crates/inspector/src/handler.rs`、`crates/bytecode/src/{bytecode/mod.rs,legacy/{analysis,jump_map}.rs}@ee9ab3f`：证明运行时 Box 表、frame_run、inspect 循环和懒跳转表。
19. **PRIMARY** bluealloy/revm#3558、#3561、#3947、#3347：证明 evm2 作者的多项热路径改动已经并入 revm main。
20. **PRIMARY** bluealloy/revm#2140、#2778、#3556、#3307：证明 revm 中的 tail-call 尝试都没有合入，以及它们各自的自测与 CodSpeed 结果。
21. **PRIMARY** bluealloy/revm#3601（含评论）：证明 revm 维护者拒绝了去掉 SharedMemory 的提案。
22. **PRIMARY** bluealloy/revm#2363：证明 revm 维护者把执行性能列为跟踪中的瓶颈。
23. **PRIMARY** `paradigmxyz_revmc/README.md`、`Cargo.toml@6860b6f`：证明 revmc 与 evm2-jit 文本同源，revmc 用 LLVM 22 和 revm 43，仍在独立维护。
24. gakonst 推文 https://x.com/gakonst/status/2114190575486538225（2026-10-25 03:01 UTC，已核实）：证明 Paradigm 方面宣称“新 EVM、内置 JIT、刚完成审计”。
25. hai_rise 推文 https://x.com/hai_rise/status/2112498280294924768（2026-10-20，已核实）：证明 RISE 自述下游化 revm 后做了寄存器优化和 opcode 融合，并称比 revm 快 2 倍（没有测试条件）。
26. https://www.getfoundry.sh/perf/evm2/（2026-10-25 `curl`，HTTP 404）：证明 AGENTS.md 提到的 perf 站点当前无法公开访问。
27. `research/gpt-deep-research.md`（ChatGPT Deep Research，2026-10-25）：只当线索；修正见上一节。

---

## 开放问题

1. #384 之后（evm2 合入 #667/#693/#745，revm 合入 #3947）当前 evm2-vs-revm 43 的比值是多少？需要在装有 cmake 的 x86-64 机器上跑 `EVM2_BENCH_REVM=1 cargo bench -p evm2-cli --bench evm`，分别测 stable（packed）和 nightly（tco）。
2. 对 Mantle 的 v107（revm 38）做同一组 fixture 的对比：差距会比对 revm main 更大吗？v107 → main 能拿回多少？
3. evm2-jit 什么时候支持自定义 `EvmTypes`？现在 JIT 只能用于 `BaseEvmTypes`，这直接决定 L2 能否使用 JIT。
4. JIT 的 `single_error` 在 trace 和 RPC 层的可观测差异，以及失败路径是否包含不耗尽 gas 的 revert 类 halt。需要读 codegen 的 failure 分类。
5. gakonst 推文说的 “just wrapped audit” 指哪一份审计？审计范围是否包括 `crates/jit`？仓库里没有报告。
6. revm#3556 被关闭的理由（PR 里没写），以及 revm 维护者是否还打算做 tail-call（#2140 仍然开着）。
7. evm2 按 (T, C, M, OP) 单态化之后的二进制体积和 i-cache 压力；#745 已经报告 `target-cpu=native` 下代码布局带来 ±8% 的噪声。

---

## 论断台账

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| H1 | revm main 的解释器是中心循环：`run_plain` 反复调用 `step`，遇到 `Err` 就跳出。 | `bluealloy_revm/crates/interpreter/src/interpreter.rs:325-342@ee9ab3f` | observed |
| H2 | revm 每执行一条 opcode，都要读 opcode、先把 pc 加 1、查函数指针表和 `[u16;256]` gas 表、扣静态 gas，再以 `InstructionContext{&mut Interpreter, &mut Host}` 间接调用 handler。 | `bluealloy_revm/crates/interpreter/src/interpreter.rs:295-321@ee9ab3f`；`instructions.rs:36-39,71,74@ee9ab3f` | observed |
| H3 | revm 的 pc、栈长度和剩余 gas 都存在 `Interpreter` 结构的字段里，handler 通过 `&mut` 指针读写，因此编译器无法把它们跨间接调用保留在寄存器中。 | 由 H2、`interpreter/stack.rs:13-16@ee9ab3f`（`Vec<U256>`）、`ext_bytecode.rs:12-26@ee9ab3f` 推出：handler 拿到的是可修改任意字段的 `&mut Interpreter` | inferred |
| H4 | revm 对 PUSH0、SHL 等 fork 门控 opcode 在 handler 内做运行时 spec 检查。 | `bluealloy_revm/crates/interpreter/src/instructions/macros.rs:18-29@ee9ab3f`；`instructions/stack.rs:19-23@ee9ab3f` | observed |
| H5 | revm 的指令表在运行时构建，放在堆上的 `Box` 里，可以用 `insert_instruction` 替换条目。 | `bluealloy_revm/crates/handler/src/instructions.rs:26-38,99@ee9ab3f` | observed |
| H6 | revm 的 CALL/CREATE 把 `Box<CallInputs>` 写入 action，然后返回 `Err(Suspend)`，由 handler 的 frame 栈非递归地创建子帧。 | `bluealloy_revm/crates/interpreter/src/instructions/contract.rs:159-162,230-246@ee9ab3f` | observed |
| H7 | Mantle 使用的 revm v107（revm 38）里，`Instruction` 同时带函数指针和 `static_gas: u64`，handler 返回 `()`，循环每步检查 `is_not_end()`，jumpdest 在加载时用标量循环立即分析。 | `bluealloy_revm/crates/interpreter/src/instructions.rs:37-40@d6293318`；`interpreter.rs:285-331@d6293318`；`bytecode/src/legacy/analysis.rs:10-40@d6293318` | observed |
| H8 | Mantle 的 revm fork `v107-mantle-arsia.2` 在 interpreter 和 bytecode 两个 crate 里相对上游 v107 只加了 `Gas::set_limit`，热路径与上游相同。 | `mantle-xyz_revm`: `git diff v107 v107-mantle-arsia.2 -- crates/interpreter crates/bytecode`（1 file, +7）@aff3c2a3 | observed |
| H9 | evm2 的 dispatch 后端（auto/tco/packed/single_return/unpacked）由 `build.rs` 在编译期选定，`EVM2_DISPATCH_BACKEND` 是构建期环境变量，不是运行时开关。 | `alloy-rs_evm2/crates/evm2/build.rs:41-55@c8bb5a2` | observed |
| H10 | evm2 默认的 `auto` 规则是：wasm 用 single_return，rustc 为 nightly 且没有 no-tco 或 cranelift 时用 tco，64 位目标用 packed，其余用 unpacked。 | `alloy-rs_evm2/crates/evm2/build.rs:21,57-72,88-97@c8bb5a2` | observed |
| H11 | evm2 的 `nightly` cargo feature 只开启依赖库的 nightly 优化，与是否选用 TCO 无关；TCO 取决于构建时 rustc 是否为 nightly。 | `alloy-rs_evm2/crates/evm2/Cargo.toml`（`nightly = [alloy-primitives/nightly, …]`）@c8bb5a2；`build.rs:62,88-97@c8bb5a2` | observed |
| H12 | evm2 的 tco 后端用 nightly 的 `become` 和 `extern "rust-preserve-none"`，让每个 handler 直接尾跳到下一条 opcode 的 handler，pc、栈、剩余 gas 都按值在寄存器中传递。 | `alloy-rs_evm2/crates/evm2/src/interpreter/dispatch/tco.rs:12-20,43-111@c8bb5a2`；`interpreter/utils.rs:49-77@c8bb5a2`；`src/lib.rs:2-3@c8bb5a2` | observed |
| H13 | evm2 的 packed 后端把 `pc 指针 << 11 \| stack_len` 压进一个 usize，handler 返回 `(PackedPc, RemainingGas)`，没有其他 dispatch 元数据。 | `alloy-rs_evm2/crates/evm2/src/interpreter/dispatch/table/packed.rs:16-26,121-162@c8bb5a2` | observed |
| H14 | evm2 的 “static dispatch tables” 指的是：`const fn make_table` 为每个 (EvmTypes, EvmConfig/spec, inspect 模式) 生成 `&'static [fn; 256]`，每一项都是以 `const OP: u8` 单态化的 dispatch 包装函数。 | `alloy-rs_evm2/crates/evm2/src/interpreter/dispatch/mod.rs:57-80,164-205@c8bb5a2`；`src/evm/config.rs:131-138@c8bb5a2` | observed |
| H15 | evm2 只在激活某个 opcode 的 spec 段里注册它，未实现的 opcode 一律映射为 INVALID，因此 handler 内不需要运行时 spec 检查。 | `alloy-rs_evm2/crates/evm2/src/version/mod.rs:227-242,700-712@c8bb5a2`；`version/opcode_config.rs:145-151@c8bb5a2` | observed |
| H16 | evm2 的 `#[instruction]` 宏生成一个实现 `Instruction` trait 的零大小类型，带 `DYNAMIC_GAS` 常量和统一的栈序言（一次边界检查，然后直接绑定栈槽的引用）。 | `alloy-rs_evm2/crates/macros/src/lib.rs:196,273-320,401-470@c8bb5a2`；`crates/evm2/src/interpreter/stack.rs:324-351@c8bb5a2` | observed |
| H17 | evm2 只对声明了 `dynamic_gas` 的指令把寄存器里的剩余 gas 同步到内存，其余指令执行时 gas 始终留在寄存器中。 | `alloy-rs_evm2/crates/evm2/src/interpreter/dispatch/tco.rs:79-90@c8bb5a2`；`dispatch/table/packed.rs:59-92@c8bb5a2` | observed |
| H18 | evm2 的操作数栈是 32 字节对齐的定长数组，每个栈字用一次 32 字节 store 写入，以避免 store-to-load forwarding 停顿。 | `alloy-rs_evm2/crates/evm2/src/interpreter/stack.rs:14-19@c8bb5a2`；alloy-rs/evm2#667 正文 [14] | observed |
| H19 | evm2 的 CALL 在栈上构造 `Message` 后递归调用 `host().execute_message`，每次 CALL 不需要 Box 分配，也不用退出解释器。 | `alloy-rs_evm2/crates/evm2/src/interpreter/instructions/system.rs:230-243@c8bb5a2` | observed |
| H20 | 相对 revm，evm2 热路径省掉的主要是：pc、栈长度、gas 的内存往返，运行时 gas 表查找，门控 opcode 的 spec 分支，以及（tco 下）中心循环的 call/ret。 | 由 H2–H4、H12–H17 推出：这些值在 evm2 中是编译期常量或寄存器中的值，在 revm 中是内存字段或运行时查表 | inferred |
| H21 | evm2 的 SIMD jumpdest 分析已经被移植到 revm main，所以在 bytecode 分析上 revm main 与 evm2 基本持平，Mantle 的 v107 没有这项优化。 | bluealloy/revm#3947（“Port of alloy-rs/evm2#498”）[19]；`bluealloy_revm/crates/bytecode/src/legacy/analysis.rs:14,58@ee9ab3f`；H7 | observed |
| H22 | evm2 的 `crates/jit` 是 revmc 移植进 evm2 的结果，两者的主要作者都是 DaniPopes，目前作为两条代码线并行维护。 | alloy-rs/evm2#207 [12]；`alloy-rs_evm2/crates/jit/README.md:3,66@c8bb5a2` 与 `paradigmxyz_revmc/README.md:3,80@6860b6f`；revmc `Cargo.toml:53@6860b6f`（revm 43） | observed |
| H23 | evm2-jit 的后端是 LLVM 23（inkwell 0.10），只支持 Linux/macOS；revmc 目前用 LLVM 22。 | `alloy-rs_evm2/crates/jit/llvm/Cargo.toml:21@c8bb5a2`；`crates/jit/README.md:24-25@c8bb5a2`；`paradigmxyz_revmc/README.md:25@6860b6f` | observed |
| H24 | evm2-jit 通过 `InterpreterRunner` 钩子接入：按 (code_hash, spec_id) 查到已编译的程序就执行，否则回退到解释器；有 inspector 时不走 JIT。 | `alloy-rs_evm2/crates/evm2/src/evm/mod.rs:189-203,1630-1638@c8bb5a2`；`crates/jit/runtime/src/evm2_evm.rs:45-68@c8bb5a2` | observed |
| H25 | evm2-jit 默认关闭；开启后，同一段代码 miss 8 次才会在后台编译，默认最多 4 个 worker，只编译 24 KiB 以下的字节码，常驻代码缓存上限 1 GiB，闲置 600 秒后淘汰。 | `alloy-rs_evm2/crates/jit/runtime/src/runtime/config.rs:12,211,361-388@c8bb5a2` | observed |
| H26 | evm2-jit 目前只支持以太坊基础类型 `BaseEvmTypes`，使用自定义 EvmTypes 的链（例如 L2 定制）还不能用 JIT。 | `alloy-rs_evm2/crates/jit/context/src/lib.rs:45@c8bb5a2`；`crates/jit/runtime/src/evm2_evm.rs:29@c8bb5a2` | observed |
| H27 | evm2-jit 默认 `single_error=true`，所有失败路径都报告为 OutOfGas，halt 原因与解释器不同。 | `alloy-rs_evm2/crates/jit/codegen/src/compiler/translate/mod.rs:334-346@c8bb5a2`；`runtime/src/runtime/config.rs:51-63,217@c8bb5a2` | observed |
| H28 | `single_error` 对状态和 receipt 应当没有影响（异常 halt 都会耗尽 gas），但 trace 和 RPC 层的错误原因会与解释器不一致。 | 由 H27 和 EVM 异常 halt 耗尽 gas 的语义推出；不耗尽 gas 的 revert 类码是否被折叠，尚未核实 | speculative |
| H29 | evm2 用同一套 EEST 跑解释器、JIT 和 AOT（`cargo st`），但编译模式默认只跑子集：AOT 用 ci-aot（11 个目录），JIT 用 ci-smoke（14 个文件）。 | `alloy-rs_evm2/AGENTS.md:25,52-55@c8bb5a2`；`crates/eest/src/harness.rs:153-221@c8bb5a2` | observed |
| H30 | evm2 的 CI 在 ubuntu 上对 JIT 跑完整的 state tests，macOS 上只跑 smoke 子集，AOT 只跑 ci-aot 子集，JIT/AOT 下的 blockchain tests 不在 CI 过滤范围内。 | 由 `alloy-rs_evm2/.github/workflows/ci.yml:206-271@c8bb5a2` 的矩阵 include 规则推出 | inferred |
| H31 | gakonst 所说的 “JIT baked in”，在代码中对应同仓的 `crates/jit` 加一等的 `InterpreterRunner` 钩子，而不是 evm2 crate 默认启用 JIT（evm2 crate 不依赖 jit crate）。 | 由 H22、H24、H25 和 `alloy-rs_evm2/crates/evm2/Cargo.toml@c8bb5a2`（没有 jit 依赖）推出 | inferred |
| H32 | gakonst 推文中的 “new EVM” 指的就是 alloy-rs/evm2。 | 推文未点名 [24]；仅由作者、仓库归属和时间推测 | speculative |
| H33 | evm2 仓库内没有审计报告文件，只有按 PR 触发的 Cyclops agentic audit workflow。 | `alloy-rs_evm2/.github/workflows/cyclops-audit.yml@c8bb5a2`；`grep -rli audit --include=*.md` 无结果 | observed |
| H34 | README 中 “up to 2x faster than revm” 的宣称由 evm2#136 加入，该 PR 没有附带任何 benchmark。 | `alloy-rs_evm2/README.md:7@c8bb5a2`；`git log -S'2x faster'` → af748d0；alloy-rs/evm2#136 [15] | observed |
| H35 | evm2 仓库唯一公开的 evm2-vs-revm 正面数据是：主网 10 区块回放（2,279 笔交易）、Ryzen 9 7950X、对比 revm 42.0.1，TCO 后端快 1.19 倍，packed 后端快 1.10 倍。 | alloy-rs/evm2#384 正文（维护者编辑段）[13] | observed |
| H36 | evm2#384 之后的多项解释器优化（#667、#693、#745）只与 evm2 自身旧版比较，没有公开新的相对 revm 的比值。 | alloy-rs/evm2#667、#693、#745 正文 [14] | observed |
| H37 | evm2 在计算密集型基准上的单项优化幅度很大（#667 让 snailtracer、burntpix、erc20_transfer 快 23%–34%），但在主网回放上只快 4.8%–6.2%，因为预编译、keccak 和状态操作稀释了解释器收益。 | alloy-rs/evm2#667 正文（Zen 5 EPYC 4585PX，criterion 3 轮中位数）[14] | observed |
| H38 | evm2 的性能数字对编译目标和代码布局很敏感：在 `target-cpu=native` 下，改动一个无关的冷函数就能让 snailtracer 变化 8.5%。 | alloy-rs/evm2#745 正文 [14] | observed |
| H39 | “up to 2x” 可能来自 snailtracer 一类计算密集型 fixture 的内部测量，但没有任何公开记录。 | 没有公开证据；AGENTS.md 提到的 perf 站点返回 404 [26] | speculative |
| H40 | evm2 作者 DaniPopes 已把 Result 返回值、指令表与 gas 表分离、JUMP 精简等热路径改动合入 revm main。 | bluealloy/revm#3558、#3561、#3347 [19] | observed |
| H41 | revm 先后三次尝试 tail-call dispatch（#2778、#3307、#3556），都没有合入；#3556 自测 snailtracer 快 8.7%、burntpix 快 13.2%，CodSpeed 却报告整体退化 3.76%。 | bluealloy/revm#2778、#3307、#3556 正文与评论 [20] | observed |
| H42 | revm 维护者 rakita 拒绝了用每帧独立 Memory 取代 SharedMemory 的提案，evm2 仓库在此后一周（2026-04-30）创建。 | bluealloy/revm#3601 评论 [21]；`gh repo view alloy-rs/evm2`（createdAt 2026-04-30） | observed |
| H43 | TCO、寄存器传参等技术 revm 本身也能实现，阻力主要来自 revm 的 API 约定（运行时可变的 Box 指令表、`&mut Interpreter` 的 handler 签名、运行时 spec 检查、共享内存）以及维护者的取舍。 | 由 H5、H4、H41、H42 推出：#3556 证明技术上可行，改签名属于破坏性变更，memory 方案已被拒绝 | inferred |
| H44 | Mantle 当前 revm（v107）与 evm2 的热路径差距，大于 revm main 与 evm2 的差距，因为 v107 缺少 #3558、#3561、#3947 等已并入 main 的优化。 | 由 H7、H8、H21、H40 推出 | inferred |
| H45 | RISE 自述下游化 revm 后做了寄存器优化和 opcode 融合，处理 RISE 区块比 revm 快 2 倍，但没有给出测试条件。 | hai_rise 推文 2026-10-20 [25] | observed |

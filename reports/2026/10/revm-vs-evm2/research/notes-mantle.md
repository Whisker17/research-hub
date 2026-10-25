# notes-mantle：其他主流 EVM 的热路径设计，以及 Mantle revm 栈的现状与改进点

- 调研路：mantle（台账前缀 M）
- 访问 / 调研日期：2026-10-25
- 本地源码与 commit（引用格式 `repo/path:line@短哈希`）：
  - mantle-xyz/reth @ 574e7f3（main，2026-10-12）；mantle-xyz/revm tag `v107-mantle-arsia.2` = 835cb4e；mantle-xyz/mantle-v2 @ 09e3693（main，2026-10-16）；mantle-xyz/op-succinct @ 8d280de；mantle-xyz/kona @ 72a20ab；mantle-xyz/op-geth @ e33cd26
  - bluealloy/revm main @ ee9ab3f，tag v107 = d629331；paradigmxyz/reth tag v2.2.0 = 88505c7，main @ f90ed27；alloy-rs/evm @ d7b5ed4（另取 tag v0.34.0）；alloy-rs/evm2 @ c8bb5a2；paradigmxyz/revmc @ 6860b6f
  - ethereum/go-ethereum @ 2006f08；ipsilon/evmone @ ffb01f2；NethermindEth/nethermind @ 34b321c；hyperledger/besu（已迁到 besu-eth/besu）@ bdb9e5c；lambdaclass/ethrex @ 18fdb83
- 本路没有在本机跑 benchmark。文中所有性能数字都来自项目方原文，并注明了测试条件。

---

## M-Q1 Mantle 栈里 revm 用在哪？

### 答案
Mantle 在两条 Rust 执行路径上用同一份 revm fork（`mantle-xyz/revm` tag `v107-mantle-arsia.2`，即 revm 38.0.0 / op-revm 19.0.0）：一条是 **mantle-xyz/reth 执行客户端**，另一条是 **OP Succinct（SP1）证明路径**——它里面的 kona 来自 mantle-v2/rust。第三个执行器是 Go 写的 **op-geth**，不用 revm。公开文档写的 sequencer 执行层是 op-geth。reth 的 release note 说自己“在主网运行”，但没有公开证据表明它是主网 sequencer。Mantle 的协议语义（BVM_ETH、token_ratio、Arsia 费用模型、op-geth parity 修复）基本都写在 op-revm 的 handler 里，约 5.7k 行新增代码。版本上，Mantle 比 upstream revm 落后 5 个 major（38 → 43），alloy-evm 落后 0.34 → 0.39，reth 基线落后 v2.2.0 → v2.8.1。另外，upstream reth main 已在 2026-10-24 用 evm2 整体替换了 revm。

### 依据

**1. mantle-xyz/reth（执行客户端）**
- 依赖策略写在 `mantle-xyz/reth/Cargo.toml:8-16@574e7f3`：reth crates 用 paradigmxyz/reth rev 88505c7f（= v2.2.0）；revm/op-revm 用 mantle-xyz/revm tag v107-mantle-arsia.2（注释原文是“Mantle fee model + op-geth parity”）；revm-inspectors 用 mantle-xyz fork 的 v0.39.0-mantle-arsia.2；alloy-evm 用 crates.io 0.34.0（未打补丁）；alloy-op-evm 和 op-alloy 来自 mantle-v2 tag mantle-v1.6.3。`git ls-remote` 确认 reth tag v2.2.0 指向 88505c7。
- 依赖声明：`Cargo.toml:242-251`（revm 系列 tag 版本）、`:257`（alloy-evm 0.34.0）、`:260`（alloy-op-evm）、`:264`（op-revm）、`:430-445`（`[patch.crates-io]` 把传递依赖里的 revm 也强制指向这份 fork）。
- Cargo.lock 实际解析：revm 38.0.0（`Cargo.lock:10322-10324`）、op-revm 19.0.0（`:5995-5997`）、revm-interpreter 35.0.1（`:10462-10464`）、revm-handler 18.1.0（`:10408-10410`）。这四个的 source 都是 `mantle-xyz/revm?tag=v107-mantle-arsia.2#835cb4eb`。另外 alloy-evm 0.34.0 来自 registry（`:293-295`），alloy-op-evm 0.32.0 来自 mantle-v2@05e2f58（`:408-410`），revm-inspectors 0.39.0（`:10443-10445`）。
- `Cargo.toml:239-241` 的注释还写着“revm family points at the private GHSA fork”，但下面实际指向的是公开 tag，注释已经过时。
- **执行相关代码在哪**：`mantle-reth/` 目录里**没有**自定义 EVM、block executor 或费用模型。`MantleNode` 是 `OpNode` 的薄包装，只换掉了 txpool，加上 preconf、rpc-ext 和 eth-api（`mantle-reth/crates/cli/src/node.rs:1-5,315-325@574e7f3`）；执行器仍是上游的 `OpExecutorBuilder`（`node.rs:404`）。执行配置 `OpEvmConfig` 包着 alloy-op-evm 的 `OpBlockExecutorFactory` / `OpEvmFactory`（`op-reth/crates/evm/src/lib.rs:69-72,80-86,121-128`）。Mantle 的费用和存款语义在下层：
  - op-revm handler（mantle-xyz/revm）：token_ratio 对 intrinsic gas、gas_limit 和 refund 的缩放（`crates/op-revm/src/handler.rs:64,162-173,402-437,470-492@835cb4e`），Arsia 额外费用扣除（`handler.rs:270-271`），失败存款的 BVM_ETH 语义（`handler.rs:568-591`），BVM_ETH 交易（`crates/op-revm/src/transaction/bvm_eth.rs`，共 2303 行）。
  - alloy-op-evm（mantle-v2/rust）：deposit_receipt_version、create2 deployer、operator_fee 调用点等，见 `mantle-v2/rust/MANTLE_CHANGES.md` §3.7@09e3693。
- `mantle-reth/` 业务代码直接引用 revm 类型的地方共 25 行，分布在 6 个文件。例如 preconf 用 `reth_revm::context::result::ExecutionResult` 和 `op_revm::OpHaltReason`（`mantle-reth/crates/preconf/src/apply.rs:20,23`），rpc-ext 用 `op_revm::constants::{GAS_ORACLE_CONTRACT, TOKEN_RATIO_SLOT}`（`rpc-ext/src/lib.rs:27`）。
- 测试现状：
  - PR 门禁 `just test-ci` 跑 workspace 单测加 Mantle 集成测试（`justfile:137-140`）。
  - `replay.rs` 用 7 个预抓取的主网交易 fixture，经 `OpHandler` 重放，比对 gasUsed（`mantle-reth/crates/integration-tests/tests/replay.rs:1-11`；fixtures 目录共 7 个 json）。
  - `testing/ef-tests/ethereum-tests` 纳入 git 的文件有 9384 个，但没有任何 runner crate 是 workspace 成员（`Cargo.toml:31-59` 的 members 列表里没有它）。
  - 执行层 benchmark：只有 `op-reth/bin/proof-bench`（证明基准）和 `justfile:37-42` 的 `build-maxperf` / `build-profiling` 构建 recipe，没有 EVM 或区块回放的基准。

**2. Mantle reth 在生产里的角色**
- 官方公开文档 *Node Introduction*（docs.mantle.xyz，访问 2026-10-25）原文：sequencer “composed of op-node and op-geth in Mantle”，verifier 也由 op-node + op-geth 组成。Elysium v1.6.3 changelog 要求 “All Mantle Sepolia node operators must upgrade both op-node and op-geth to v1.6.3”，全文不提 reth。
- mantle-xyz/reth 的 release `op-reth-v2.2.1-mantle-arsia.2`（2026-08-26）原文：“The revm compiled into `op-reth-v2.2.1-mantle-arsia.1` — the build running on mainnet — came entirely from a private repository”。`mantle-v1.6.2`（2026-10-12）写着 “Required for sequencers running preconf”，并说明当前 gas limit 是 60M。
- `mantle-v2/VERSION.md:9-12@09e3693` 把 op-geth、mantle-v2、reth、op-succinct 并列为核心组件。
- mantle-v2 CI 的 `op-acceptance-tests-reth` job 用 `DEVSTACK_L2EL_KIND: "op-reth"` 跑 `mantle-base` smoke 测试（`.github/workflows/ci-main-migrated.yml:701-769`）。也就是说，同一套验收测试会分别跑在 op-geth 和 op-reth 上，但这不是逐块差分。
- 私有仓库 `mantle-xyz/rde-v4` 的 `docs/superpowers/specs/2026-07-02-rethseq-profile-design.md`（内部开发环境文档）写道：default profile 里 “op-reth 只做过 L2 RPC，从未做过 sequencer”，新增 rethseq profile 是为了验证 op-reth 当 sequencer。
- **结论**：公开一手证据只能确认 op-geth 是文档化的 sequencer 执行层，以及 reth 的某个构建“在主网运行”。reth 是否承担主网 sequencer，公开资料查不到。

**3. mantle-xyz/revm 在 upstream v107 上的补丁**
- 命令：在 mantle_revm 里 `git fetch https://github.com/bluealloy/revm refs/tags/v107:refs/tags/upstream-v107`，得到 merge-base = d629331（upstream v107 “release prep”，2026-04-17）。
- `git diff --shortstat upstream-v107 v107-mantle-arsia.2 -- crates/` 输出 **51 files changed, +6031 / −2523**。只看 `crates/op-revm/src`（不含 test_data）是 12 files，+5727 / −371。主要文件：`handler.rs`（+3072 行，现 4189 行）、`transaction/bvm_eth.rs`（新增 2303 行）、`l1block.rs`（+403）。其余大多是测试 JSON。
- Mantle 作者的非 merge commit 约 63 个（作者名过滤，2025-05 → 2026-09-16）。commit 标题里含 “op-geth” 的有 6 个，op-revm 源码里写到 “op-geth” 的地方有 69 处。最近几次修复都是追 op-geth 行为：BVM_ETH 存款后改回 cold、失败存款保留 Mint/Transfer 日志、deposit pre-call gates、Isthmus 预编译集合。
- **对 revm 核心 crate 的补丁**（非 op-revm，决定 fork 维护成本）：
  - `crates/context/src/cfg.rs:425@835cb4e`：`[MANTLE] disable tx gas limit cap for EIP-7825`，直接把 `tx_gas_limit_cap()` 的默认值改成 `u64::MAX`，对所有链生效。
  - `crates/interpreter/src/gas.rs:222`：新增 `Gas::set_limit`，供 op-revm 的 token_ratio 逻辑调用。
  - `crates/state/src/lib.rs:516`：`mark_warm_with_transaction_id` 只在跨交易时重设 SSTORE 的 `original_value`。这条已由 Mantle 提交到 upstream：bluealloy/revm#3746（commit 84fe60c，作者 Ivan Wang，2026-06-18），随 v114 / revm 42.0.0 发布（v114 release notes 引用了 #3746）。upstream 对应代码在 `bluealloy_revm/crates/state/src/lib.rs:627-639@ee9ab3f`。
  - `crates/context/interface/src/result.rs:399`：给 `Halt.logs` 加文档和 `serde(default)`。这个字段 upstream 本来就有。
  - `crates/database/src/alloydb.rs`：错误处理（非共识路径）；`bundle_account.rs` 只是 clippy 改写。
- mantle-xyz/revm 的 CI 状态（`gh run list -R mantle-xyz/revm`）：
  - main 上的 “Eth” job（run 35086043320，2026-09-16）失败，报错 `unexpected exception: got None, expected Some("TransactionException.GAS_LIMIT_EXCEEDS_MAXIMUM")`，失败用例是 EEST `osaka/eip7825_transaction_gas_limit_cap/...`。直接原因就是上面的 cfg.rs 补丁。
  - “Tests” job（run 37723171335，2026-10-08，dev/mantle-v1.6.3）失败于 cargo-deny 报告 RUSTSEC-2026-0220（ruint 1.17.2 < 1.20.0）等 advisory。mantle-xyz/reth 的 Cargo.lock 里是 ruint 1.18.0（`Cargo.lock:10669-10670`），同样低于 patched 版本 ≥1.20.0。upstream revm v116 已升到 ruint 1.20.0。

**4. 证明路径（kona / op-succinct）**
- Mantle 自 2025-09-16 起改用 OP Succinct（ZK validity proof，SP1），见 docs.mantle.xyz 的 “Mantle OP Succinct Mainnet Upgrade” 公告（访问 2026-10-25）。
- `mantle-xyz/op-succinct/Cargo.toml:83-100@8d280de` 的 kona-* 来自 `mantle-xyz/mantle-v2` tag mantle-v1.6.3。revm 和 op-revm 同样钉在 `v107-mantle-arsia.2`（`:178-189`，注释说明 tag 要和 mantle-v2 的 kona 同步移动；`[patch.crates-io]` 在 `:259-273`）。Cargo.lock 解析出 revm 38.0.0、op-revm 19.0.0、revm-interpreter 35.0.1，source 都是 835cb4e。
- `mantle-v2/rust/Cargo.toml:632-646@09e3693` 把 13 个 revm 系列 crate 全部 patch 到同一个 tag。
- 独立仓库 `mantle-xyz/kona@72a20ab`（最后提交 2026-04-24）仍用 `mantle-xyz/revm tag v2.2.2`（`Cargo.toml:161-163`），解析为 revm 31.0.2 / op-revm 12.0.2 / alloy-evm fork 0.25.2（`Cargo.lock:8197-8199,6819-6821,250-252`）。不过 `mantle-v2/rust/MANTLE_CHANGES.md:20-35` 记录 kona 已迁进 mantle-v2/rust 子树，op-succinct 也从那里取 kona。所以独立的 kona 仓库属于遗留路径（这一点是推断）。
- 推论：reth 和 SP1 证明程序跑的是同一份 op-revm，Rust 侧内部一致。真正存在共识风险的等价性问题是 **op-geth（Go）↔ op-revm（Rust）**：主网区块由文档中的 op-geth sequencer 产生，再由 op-revm 生成 ZK 证明。

**5. mantle-xyz/op-geth**
- Go 实现，基于 go-ethereum 1.17.3（`mantle-xyz/op-geth/version/version.go:20-22@e33cd26`），不依赖 revm。
- 它有 stack arena（`core/vm/stack.go:26`），但没有 upstream 2026-06 之后的 in-place 栈操作 #35156、layered jumpdest cache #35881 和 PGO switch 解释器 #35638：`interpreter_gen.go`、`popPtr`、`layeredJumpDests` 在该 commit 里都 grep 不到。

**6. 版本差距**
- **revm 38.0.0（v107）→ 43.0.3（v120，2026-09-24）**。挑出与性能、结构相关的变化（来源：`gh release view`）：
  - v108（revm 39，2026-05-19）：**op-revm 从 bluealloy/revm 移除，迁到 ethereum-optimism/optimism**（#3568）；instruction 函数改为返回 `Result`（#3558，破坏性）；`Journal` trait 重构（#3663）；“separate instruction and gas tables”（#3561）；预编译 warmup 不再 clone（#3586）；空账户不分配（#3590）；memory_limit 检查移到冷路径（#3599）；non-max 索引类型（#3605、#3610）。
  - v113（41.0.0）：所有 crate 改为锁步版本号；commit 路径减少 realloc/clone（#3732）。
  - v114（42.0.0）：Glamsterdam devnet-7，所有 state/blockchain tests 通过；包含 Mantle 提交的 #3746。
  - v116（43.0.0）：fiber 实现的异步数据库 `asyncdb`（#3709），BLS12-381 配对用 fused multi-Miller loop（#3823）。
  - v120 之后、还在 main 未发布：SIMD 加速 jumpdest 分析（#3947，a85e534）、固定 padding + 惰性 jump table（#3945）、bn254 mul 用 GLV（#3976）。
  - 这些 release 都没有给出端到端区块执行的加速数字。
- **op-revm 已经离开 bluealloy**：v107 是最后一个包含 `crates/op-revm` 的 tag（`git ls-tree v107 crates/` 有 op-revm，`v108` 没有）。ethereum-optimism/optimism develop@b84018de4 的 `rust/op-revm/Cargo.toml` 版本是 20.0.0，`rust/Cargo.toml` 里是 revm 43.0.2、alloy-evm 0.39.0、reth = ethereum-optimism/reth tag `op-v2.6.0-1`（行 366、441、456；经 `gh api` 读取，2026-10-25）。mantle-v2 自己也在 `MANTLE_CHANGES.md:429-430` 把 “revm major-version bump” 和 “op-revm v19 → v20+ drift” 列为 time bomb。
- **alloy-evm 0.34.0（2026-04-28）→ 0.39.0（2026-08-26）**（`alloy-rs_evm/CHANGELOG.md:8-121@d7b5ed4`）：0.35 有 indexed tx execution 和非致命 EVM 错误处理；0.36 改用 revm State commit hook；0.37 加了 precompile lookup 映射，并去掉 Send/Sync bound；0.37.1 有 `EthBlockExecutor reserve`；0.38 支持 database adapters；0.39 支持 tx env downcast，并跟随 revm 43。没有 OP 部分：alloy-op-evm 也已不在 alloy-rs/evm 仓库里（`crates/` 只剩 `evm`）。
- **reth**：Mantle 停在 v2.2.0（2026-04-29），upstream 最新发布是 v2.8.1（2026-10-23，仍是 revm 43.0.3 + alloy-evm 0.39.0，`gh api .../Cargo.toml?ref=v2.8.1` 第 440、452 行）。**reth main 在 2026-10-24 合入 “refactor!: replace revm with evm2”**（paradigmxyz/reth#25002，commit 9d1638f，221 files，+17698 / −10870）。之后 `Cargo.toml:440-443@f90ed27` 只剩 evm2 / evm2-inspectors / evm2-jit，revm 和 alloy-evm 都没有了。

### 不确定之处
- 主网 sequencer 到底用 op-geth 还是 reth，没有公开一手证据。reth 在主网承担什么角色，只能从 release note 推测。
- 生产节点的 CLI 参数（比如是否关闭了 prewarming）在代码里看不到。
- mantle-xyz/revm 的 commit 计数依赖浅克隆和作者名过滤，是近似值；diff 统计是精确的。

---

## M-Q2 其他活跃 EVM 实现的热路径与架构要点

### 答案
主流实现的热路径优化都集中在几件事上：**dispatch 形态**（switch / computed goto / 函数指针表）、**栈的表示与复用**、**jumpdest 和代码分析缓存**、**区块级并行预热**。最近的大改动都附带“新旧两套解释器的差分测试”：geth 用生成的 switch 加 PGO，并保留旧循环作为参照；Besu 的 EVM v2 用 `long[]` 栈，靠逐 opcode 差分测试；evmone 用 baseline 解释器加 cgoto。revm 目前用函数指针表加每条指令的 static gas（`interpreter.rs:286-308@835cb4e`），帧和栈已通过 `FrameStack` 池化。

### 依据

**go-ethereum core/vm（@2006f08）**
- `EVM.Run` 从 stack arena 取栈（`core/vm/interpreter.go:119`）。有 tracer、ExtraEips、EIP-4762 或 `forceTableLoop` 时走手写的 `execTraced`，否则走生成的 `execUntraced`（`interpreter.go:134-137`）。
- `execTraced` 是传统的 `jumpTable[op]` 加 `operation.execute` 间接调用（`interpreter.go:147,200-201,246`）。
- 生成的 `execUntraced` 是一个按 opcode 的 dense switch：热点 opcode 的 static gas 和栈边界都写成常量，每个 case 结尾预取下一个 opcode（`core/vm/interpreter_gen.go:1-42`）。内联靠 `cmd/geth/default.pgo` 提供的 PGO profile（PR #35638，2026-10-21 合入；后续 #35959 合并了 DUP/SWAP 的 case 并预取 opcode）。PR 原文：新旧两个循环 “run the same programs ... across five fork configurations”，加上 `FuzzInterpreterDiff`，“every CI run compares them”。唯一给出的数字是比被替代的旧 PR 快 3.1%（“on real blocks”），没有相对 master 的数字。
- stack arena 和 `sync.Pool` 复用（`core/vm/stack.go:26-51`，PR #33960）；in-place 栈操作数（PR #35156）。
- 两级 jumpdest 缓存：共享缓存加按交易的本地层（`core/vm/jumpdests.go:55-90`，PR #35881，目的是防 Glamsterdam 后的攻击）。
- 并行 state prefetcher 用 `4*NumCPU/5` 个 worker 预执行区块交易（`core/state_prefetcher.go:53-63`）。

**evmone（@ffb01f2）**
- README：通过 EVMC 暴露；默认是 **Baseline** 解释器，只做最少的 JUMPDEST 分析；**Advanced** 解释器用 indirect call threading，并按指令块预计算 gas 和栈需求，代价是 “extensive and expensive bytecode analysis”（`README.md:20-41`）。
- README 还写明 ecrecover 性能退化，expmod 默认是 stub、完整实现需要 GMP（`README.md:97-98`）。
- baseline 有 computed-goto 分派（`lib/evmone/baseline_execution.cpp:216-238`，`EVMONE_CGOTO_SUPPORTED`）。jumpdest 分析产出 padded code 加 bitset（`baseline_analysis.cpp:18-59`）。VM 预留 1025 个按深度复用的 `ExecutionState`，栈空间对齐（`vm.cpp:79-90`，`execution_state.hpp:32-52`），所以调用时不在堆上分配栈。

**Nethermind（@34b321c）**
- README 原文：“direct opcode dispatch, hardware-accelerated bitwise operations, and zero heap allocation on the execution stack. A parallel pre-execution system warms state reads before a block's main loop, cutting block processing time roughly in half”（`README.md:30`）。“roughly in half” 没有附测试条件。
- 实现：每笔交易解析一次 `delegate*<...>[]` 函数指针分派表（`Nethermind.Evm/VirtualMachine.Dispatch.cs:21-22`）；32 字节对齐、pinned 的栈池（`StackPool.std.cs:9-38`）；`ExecutionEnvironment` 池化，用来避免分配和 GC write barrier（`ExecutionEnvironment.cs:14`）；`BlockCachePreWarmer` 做并行预热（`Nethermind.Consensus/Processing/BlockCachePreWarmer.cs:38,132`）；基于 BAL 的 `ParallelBlockValidationTransactionsExecutor`，BAL 未启用时退回顺序执行（`BlockProcessor.ParallelBlockValidationTransactionsExecutor.cs:27,54-58`）。

**Besu（besu-eth/besu @bdb9e5c）**
- `runToHalt` 在 `enableEvmV2()` 时切到 `runToHaltV2`（`evm/src/main/java/org/hyperledger/besu/evm/EVM.java:265-274`）。v2 是 “EVM v2 execution loop using long[] stack representation”，热 opcode 在 switch 里内联执行（`EVM.java:507-511`）。这个开关是实验性的：`EvmConfiguration.java:28` 写着 “enable experimental EVM v2”。
- PR #11524（“EVM v2 MEGA PR”，2026-10-20 合入）原文：EVM v2 仍在 `--Xevm-v2` 开关后面。差分测试有 `EveryOpcodeV1V2DifferentialTest`、`RandomProgramV1V2DifferentialTest`，并注入了 52 个人工 bug，全部被测出；v2 下跑通 237,797 个 reference tests。
- 性能数据：JMH，m8g.2xlarge（Graviton4），每个 opcode 循环 1000 次、每次执行 16 遍、全宽操作数，每个 opcode 单独一个 JVM，对比基线是 v1 main。算术类 141 → 355 Mgas/s（2.53x），比较 / 位运算 155 → 613（3.91x），KECCAK256 1.10x，内存类 1.85x。这些都是单 opcode 微基准，不是区块数据。

**ethrex LEVM（@18fdb83）**
- 纯 Rust 实现。按 fork 生成 `static [OpCodeFn; 256]` 函数指针表（`crates/vm/levm/src/opcodes.rs:389,424-432`），主循环用 `opcode_table[opcode].call(...)` 分派（`vm.rs:2936`）。栈是 `Box<[U256; 1024]>`（`call_frame.rs:33-34`），VM 带 `stack_pool` 复用（`vm.rs:636,953-1007`）。
- README 说会跑 EELS、ethereum/tests 和 legacyTests。
- 自带的 revm 对比基准（`bench/revm_comparison/README.md`，最近一次修改 2025-06-19，数据可能来自 2024-10 的初版；MacBook Air M1；hyperfine；factorial 和 fibonacci 各循环 10 万次）显示 levm 比 revm 慢 1.23x 和 1.33x。这组数字很旧，revm 版本也没写。

**revmc（@6860b6f）**
- README：“Experimental JIT and AOT compiler”，后端是 LLVM，需要 **LLVM 22**，不支持 Windows（`README.md:1-35`）。依赖 revm 43.x（`Cargo.toml:52-60`）。
- 在 reth v2.2.0 里 `git grep revmc` 没有结果，说明 revmc 从未进入 reth 的发布版本。
- evm2 里的 `evm2-jit` README 与 revmc README 几乎逐字相同，连图片资源 ID 都一样（`alloy-rs_evm2/crates/jit/README.md:1-9@c8bb5a2` 对比 `revmc/README.md:1-9`），crate 拆分方式（backend / builtins / codegen / context / llvm / runtime）也一样。由此推断 evm2-jit 是 revmc 移植进 evm2 的版本。
- reth main 把它放在可选 feature 后面：`jit = ["dep:evm2-jit", ...]`，不在 default features 里（`crates/ethereum/evm/Cargo.toml:23,46,65-67@f90ed27`）。

**EIP-7904 与 Gas Cost Estimator（仅用原文）**
- 现行 EIP-7904 标题是 “Compute Gas Cost Analysis”，结论是**不调整 gas 表**：以 100 Mgas/s 为目标，18 个候选参数里 16 个实测比现价便宜（`EIPS/eip-7904.md:15,25-52`，ethereum/EIPs master，访问 2026-10-25）。
- 最新一轮用 Benchmarkoor 测**完整客户端** Besu、Erigon、ethrex、Geth、Nethermind、Reth（`eip-7904.md:70`），并说明这些客户端都已包含 EIP-7928 BAL 带来的并行读、并行校验等优化（`:121`）。
- `assets/eip-7904/analysis/2026-06-10/new_gas_proposal.md:44-63` 的“最差客户端”表里：reth 在 `PRECOMPILE_ECPAIRING_BASE` 是最差（8247 gas，次差 ethrex 8182，比值 1.01×，基本并列），在 `PRECOMPILE_ECADD` 是次差（96，最差 erigon 108）。其余参数的最差客户端都不是 reth。
- 较早的 Gas Cost Estimator Stage 4 报告（`assets/eip-7904/gas-cost-estimator-report.pdf`）测的是 **7 个独立的 EVM 实现**，其中 **Revm 18.0.0（commit d82c762）**、geth v1.14.12；硬件是 i5-13500；host 和存储都用 mock。原文结论包括：
  - CALL / STATICCALL / DELEGATECALL：“Except for Revm, all implementation teams should investigate these costs.”
  - “Nethermind, Geth, and Erigon jumps seem to be more expensive”
  - EC 预编译方面 “look at the EvmOne implementation, as this is the most optimized”

### 不确定之处
- geth #35638 的整体收益在 PR 里只有相对旧 PR 的 3.1%，没有相对 master 的区块级数字。
- Nethermind 的“约减半”没有测试条件。
- Besu 的数字是单 opcode 微基准。
- ethrex 的 revm 对比数据很旧。
- GPT 资料里提到的 ethrex rayon 并行、Erigon、rust-ethereum/evm 和 Guillotine，本路没有核实。

---

## M-Q3 Mantle revm 栈的缺口与改进点（按优先级）

**P0-1 建立 op-geth ↔ op-revm 的持续差分回放，作为发布门禁**
- 现状：Mantle 有两套执行语义（Go 和 Rust），证明路径用 op-revm（M-Q1 §4），而公开文档写的 sequencer 是 op-geth。现有测试有：
  - `replay.rs` 的 7 个主网 fixture，只比 gasUsed（`replay.rs:1-11@574e7f3`）；
  - mantle-xyz/revm 的 `examples/block_traces`，通过 RPC 逐块比对 receipt 的 status / gas / cumGas / logs / bloom，可选用 `STATE_VERIFY` 做状态校验（`examples/block_traces/src/main.rs:58-101,162-209@835cb4e`），但它是手动运行的示例，不在 CI 里；
  - 按执行客户端分别跑的 smoke 验收测试（`ci-main-migrated.yml:701-769@09e3693`）。
  
  op-revm 的 parity 问题一直是事后修的：至少 6 个 commit 标题写着对齐 op-geth，reth 的 mantle-v1.6.2 release 也写了 “op-geth parity for RPC fee estimation and for block validation”。
- 别人怎么做：geth 把旧循环保留为参照实现，每次 CI 都跑差分加 fuzz（PR #35638）；Besu 做逐 opcode / 随机程序的 v1↔v2 差分，并用 52 个注入 bug 验证测试强度（PR #11524）。
- 建议：每天在 CI 里回放一段主网区块（随机抽样，加上 Mantle 特有交易类型：deposit / BVM_ETH / token_ratio 变更区块），用 reth 的执行器比对 receipt 和状态根。对 Mantle 特有的 handler 路径，做同输入下的 op-geth 和 op-revm 双跑 fuzz。任何不一致都阻止发布。
- 类型：inferred

**P0-2 让 mantle-xyz/revm 的 EEST / ethtests 和 cargo-deny 恢复为绿**
- 现状：main 上的 ethtests 因为 `cfg.rs:425` 的 EIP-7825 补丁失败；Tests job 因为 RUSTSEC-2026-0220 等 advisory 失败（M-Q1 §3）。也就是说，fork 目前**没有任何以 upstream 一致性测试为准的绿色信号**。
- 别人怎么做：upstream revm 在 v114 跑通 Glamsterdam devnet-7 全部 fixtures；ethrex 跑 EELS 加 ethereum/tests；Besu 在 CI 里对 v1 和 v2 都跑 reference tests。
- 建议：
  - 撤掉核心补丁，改为在 Mantle 构造 `CfgEnv` 的地方显式设置 `tx_gas_limit_cap = Some(u64::MAX)`。`CfgEnv::tx_gas_limit_cap()` 本来就是 `self.tx_gas_limit_cap.unwrap_or(...)`（`bluealloy_revm/crates/context/src/cfg.rs:464-470@ee9ab3f`），按配置设置即可，不需要改默认值。
  - 升级 ruint 到 ≥1.20.0。
  - 把 ethtests 恢复为 required check。
- 类型：inferred

**P0-3 把核心 revm 的补丁降到零，并规划迁到 OP upstream 的 op-revm 版本线**
- 现状：
  - 核心 crate 的补丁只剩 4 处功能性改动：7825 默认值、`Gas::set_limit`、SSTORE original_value（已作为 #3746 合入 upstream，随 v114 发布）、`Halt.logs` 的 serde default。
  - fork 的主体重量在 op-revm（+5727 行）。
  - op-revm 在 v108 已从 bluealloy 移到 ethereum-optimism/optimism，现在是 v20 / revm 43。
  - 文档有漂移：`Cargo.toml:239-241` 的注释、`MANTLE_CHANGES.md:37`（写的是 mantle-elysium 分支，实际是 tag）、`MANTLE_CHANGES.md:100`（说 reth 用 mantle-xyz/evm，实际是 crates.io 0.34.0）。
- 别人怎么做：Mantle 已经成功把一处修复提交到 upstream（#3746）。OP upstream 自己也在维护 op-revm 20。
- 建议：
  - 把 `Gas::set_limit` 作为一个小 API PR 提给 upstream，或者在 op-revm 内部绕开它；
  - 7825 改为配置（见 P0-2）；
  - 之后 mantle-xyz/revm 只需维护一个“基于 optimism `rust/op-revm` 的 Mantle 补丁层”；
  - 同时把 reth、mantle-v2/rust、op-succinct 三处的 tag 锁步升级做成一个脚本或一套 CI 检查（op-succinct 的注释已经要求三处 tag 一致，`op-succinct/Cargo.toml:178-183,259-262`）。
- 类型：inferred

**P1-4 版本追平：revm 38 → 43，alloy-evm 0.34 → 0.39，reth 基线 v2.2.0 → OP upstream 的 op-v2.6.0+**
- 现状：落后 5 个 revm major，reth 落后 6 个 minor 发布。
- 别人怎么做：upstream 在这段时间做了以下变化（M-Q1 §6）：
  - 指令表与 gas 表分离；
  - commit 路径和空账户的分配优化；
  - asyncdb；
  - BAL 基础设施；
  - main 上还有 SIMD jumpdest 分析。
  
  OP develop 已经在 revm 43.0.2 / alloy-evm 0.39 / reth op-v2.6.0-1。
- 建议：按 OP upstream 的组合整体升级，不要单独升 revm。上述变化 upstream 都没给出端到端收益数字，所以升级理由应该是安全修复、可维护性和跟上 OP upstream，不要承诺性能提升。
- 类型：observed（差距）/ inferred（建议）

**P1-5 现在就确定对 evm2 的跟随策略；不要另造 `MantleEvm` trait**
- 现状：
  - Mantle reth 确实通过 alloy-evm 的 `EvmFactory` / `BlockExecutorFactory` 接入执行（`op-reth/crates/evm/src/lib.rs:190-226`），但 trait bound 里直接写着 `Spec = OpSpecId`、`BlockEnv = revm::context::BlockEnv`、`Precompiles = PrecompilesMap`（`lib.rs:206-212`）。
  - alloy-evm 的 `EvmFactory` 本身就是按 revm 设计的：`use revm::{...}`，`type Context<DB>: ContextTr<...>`（`alloy-rs_evm/crates/evm/src/evm.rs:7,259,273@v0.34.0`）。
  - Mantle 的协议语义写在 op-revm handler 里。
  - 所以这层抽象只能隔离“不同的 revm 实现”，换不了 VM。
- 别人怎么做：reth main 用 #25002 直接把 revm 和 alloy-evm 一起换成 evm2，改了 221 个文件、+17.7k / −10.9k 行，而不是在原抽象后面换实现。evm2-jit 放在 `jit` feature 后面，默认关闭。gakonst 2026-10-25 的推文说新 EVM “gonna be the future of foundry, reth, tempo”。OP upstream 截至 2026-10-24 仍在 revm 43。
- 建议：
  - 共识路径继续留在 revm 版本线上，跟着 OP upstream 的决定走。
  - 现在先把 Mantle 语义（BVM_ETH、token_ratio、operator fee、失败存款）整理成**与 VM 无关的规范和测试向量**。这套东西同时就是 P0-1 的差分语料，以后要移植到 evm2 时也能直接复用。
  - 不要按 GPT 资料的建议再加一层 Mantle 自有的 VM trait。上游已经证明这类迁移的成本在语义和类型上，多一层 trait 解决不了。
- 类型：inferred

**P1-6 建立执行层 benchmark 基础设施（区块回放 + 分阶段耗时）**
- 现状：仓库里没有 EVM 或区块回放基准（只有 proof-bench 和 `build-maxperf`）。mantle-xyz/revm 的 Benchmark workflow 在 main 和 dev 分支上都失败。
- 别人怎么做：
  - Besu 用 JMH 做逐 opcode 基准，并写明硬件和方法（PR #11524）；
  - EIP-7904 用 Benchmarkoor 在完整客户端上测（`eip-7904.md:70`）；
  - geth 的 PGO profile 由生成器产出，并纳入版本管理（PR #35638）。
- 建议：
  - 固定机器，回放 Mantle 主网区块，分别记录 EVM 执行、状态读、trie / 状态根、持久化的耗时（reth 已有 engine 指标）；
  - 先回答“EVM 解释器占多大比例”，再决定要不要投入 JIT 或换 VM。
  - 背景：Mantle 当前 gas limit 60M（mantle-v1.6.2 release），出块 2s（op-reth-v2.2.1-mantle-arsia.2 release 提到 2s），峰值需求约 30 Mgas/s；而 EIP-7904 在 100 Mgas/s 目标下测得所有计算类操作都达标。据此推测，解释器计算目前不是瓶颈（speculative，测的对象和负载不同，需要实测确认）。
- 类型：inferred / speculative

**P2-7 核实预热和缓存在生产里的实际配置；BAL 路径对 Mantle 暂时不适用**
- 现状：reth v2.2.0 默认开启并行 prewarming（`crates/engine/primitives/src/config.rs:126-127,222@88505c7`；CLI `--engine.disable-prewarming` 默认 false，`crates/node/core/src/args/engine.rs:343-345`），也有 precompile cache（`crates/engine/tree/src/tree/precompile_cache.rs:1`）。Mantle 代码里没有关闭它的地方，但生产启动参数看不到。Elysium 发布时保留 Arsia / Osaka 的 L2 执行规则，不在 L2 激活 Amsterdam 行为（docs Elysium changelog），所以 Mantle 区块没有 EIP-7928 BAL。
- 别人怎么做：geth 有并行 prefetcher；Nethermind 有 `BlockCachePreWarmer` 和基于 BAL 的并行校验；reth 在有 BAL 时可以做 BAL 存储预取（`config.rs:188-194@88505c7`）。
- 建议：
  - 确认生产 reth 节点没有关闭 prewarming，并接上 prewarm 和 precompile cache 的命中率指标；
  - BAL 并行要等 Mantle 决定在 L2 引入 BAL 时再评估；
  - sequencer 出块（payload building）路径能否受益于 engine 侧的 prewarm，需要单独确认（speculative）。
- 类型：observed（默认值）/ speculative（构建路径）

**P2-8 JIT：暂不进入共识路径，只在非共识场景试点**
- 现状：Mantle 没有使用 JIT。
- 别人怎么做：revmc 自称 experimental，需要 LLVM 22，从未进入 reth 发布版；继承它的 evm2-jit 在 reth main 里是默认关闭的 feature（M-Q2）。
- 建议：
  - 等 P1-5 的 evm2 路线明确、P1-6 证明解释器是瓶颈以后，再在 RPC（`eth_call` / 模拟）这类非共识场景试点；
  - 共识路径和 SP1 证明程序不引入 JIT。证明程序在 zkVM 里执行，JIT 不适用（inferred）。
- 类型：inferred

**P2-9 op-geth 侧热路径：rebase 时吸收 geth 2026 年的解释器优化**
- 现状：Mantle op-geth 基于 geth 1.17.3，有 stack arena，但没有 #35156（in-place 栈操作）、#35881（layered jumpdest cache）和 #35638（PGO switch）（M-Q1 §5）。
- 别人怎么做：geth 的新解释器把旧循环保留为 traced 路径，并在 CI 里差分（M-Q2）。
- 建议：op-geth 是文档化的 sequencer 执行层，下次 rebase 时应该把这三项一起带上，并沿用 geth 的差分测试。#35881 是针对 Glamsterdam 之后的 DoS 面做的，Mantle 如果将来提高 gas limit 或单笔交易的 gas 上限，这项尤其相关（inferred）。
- 类型：inferred

---

## 资料中被修正的地方（GPT Deep Research，2026-10-25）

1. **§11.1 / §12 Phase 1 / §13 P0 建议“建立 Mantle-owned `MantleEvm` trait 隔离 revm”**
   - Mantle reth 已经通过 alloy-evm 的 `EvmFactory` / `BlockExecutorFactory` 接入（`op-reth/crates/evm/src/lib.rs:190-226`）。
   - 但这层 trait 本身就是 revm 形状的（`alloy-evm/src/evm.rs:7,259`），Mantle 语义写在 op-revm handler 里。
   - upstream reth 换 evm2 的做法是整体替换（#25002，221 个文件），不是在 trait 后面换实现。
   - 结论：GPT 的方案一半已经存在，另一半解决不了真正的迁移成本（语义和类型）。
2. **§13 P1 要“吸收”EVM instance reuse、stack allocation reuse、预计算 jump destination、state warming 等**
   - 这些大多已经有了：revm 用 `FrameStack` 池化帧和栈（`crates/context/interface/src/local.rs:8-30@835cb4e`），jumpdest 分析随 bytecode 缓存（`crates/bytecode/src/legacy/analysis.rs:10`）；reth v2.2.0 默认开启并行 prewarming 和 precompile cache。
   - 所以这一项是夸大或过时的。
3. **§10 对 EIP-7904 的描述把两份材料混在了一起**
   - “7 个 EVM 独立运行、host 用 mock”说的是较早的 Gas Cost Estimator Stage 4 报告，其中 revm 是 **18.0.0**、geth 是 1.14.12。
   - 现行 EIP-7904（2026-06-10 分析）测的是 6 个**完整客户端**（含 Reth、ethrex，没有 evmone 和 EthereumJS），结论是**不调整 gas 表**。
   - “Revm 在 call/subcontext 表现较好”在报告里确有原文，但对应的是 revm 18。
4. **§9.4 Besu**：没有说明 EVM v2 是**实验性**的，要用 `--Xevm-v2` 开启（`EvmConfiguration.java:28`，PR #11524）。仓库已迁到 besu-eth/besu。“PUSH 单 limb / 多 limb 分支”这一说法本路没有核实。
5. **§9.3 Geth** 只说了 untraced fast path。geth 现在的 fast path 是 2026-10-21 合入、依赖 PGO 的生成 switch（#35638），Mantle 的 op-geth 1.17.3 还没有它。资料没有点明这个时间差。
6. **§12 Phase 4 关于 PropAMM / JIT Router / “用户此前设计的 JIT Router”**：找不到任何一手来源，也超出本报告范围，按 speculative 处理，不采用。
7. **§11–§13 有两处遗漏，会影响路线判断**：
   - 漏了 **op-revm 已在 revm v108 离开 bluealloy** 这一结构性变化，它决定了 Mantle fork 未来要 rebase 到哪里；
   - 漏了 **reth main 已在 2026-10-24 用 evm2 替换 revm**。
8. **§12–§13 把“revm↔evm2 差分”列为 P0**：对 Mantle 来说，眼下更紧迫的是已经存在的 **op-geth↔op-revm** 等价性，因为它直接影响共识和 ZK 证明。revm↔evm2 差分要在决定迁移以后才有意义。

---

## 来源

1. **PRIMARY** `mantle-xyz/reth` @574e7f3：`Cargo.toml`、`Cargo.lock`、`op-reth/crates/evm/src/lib.rs`、`mantle-reth/crates/**`、`justfile`。证明 Mantle reth 的 revm / op-revm / alloy-evm 来源与版本、执行器的接入方式、测试与基准现状。
2. **PRIMARY** mantle-xyz/reth releases `op-reth-v2.2.1-mantle-arsia.2`（2026-08-26）、`mantle-v1.6.2`（2026-10-12）（`gh release view`，访问 2026-10-25）。证明 reth 的某个构建在主网运行、preconf 面向 sequencer、gas limit 60M、2s 出块，以及一系列 op-geth parity 修复。
3. **PRIMARY** `mantle-xyz/revm` tag v107-mantle-arsia.2 @835cb4e，与 bluealloy v107 @d629331 的 diff。证明 Mantle 补丁的范围（op-revm 为主）和 4 处核心 crate 补丁。
4. **PRIMARY** mantle-xyz/revm 的 GitHub Actions runs 35086043320、37723171335（访问 2026-10-25）。证明 fork 的 ethtests 因 EIP-7825 补丁失败，cargo-deny 因 ruint advisory 失败。
5. **PRIMARY** `mantle-xyz/mantle-v2` @09e3693：`rust/Cargo.toml`、`rust/MANTLE_CHANGES.md`、`VERSION.md`、`.github/workflows/ci-main-migrated.yml`、`op-acceptance-tests/acceptance-tests.yaml`。证明 kona / alloy-op-evm / op-alloy 的来源、迁移史、time bomb 清单，以及 reth 验收测试的方式。
6. **PRIMARY** `mantle-xyz/op-succinct` @8d280de：`Cargo.toml`、`Cargo.lock`。证明证明路径使用同一 tag 的 revm / op-revm，且三仓需要锁步。
7. **PRIMARY** `mantle-xyz/kona` @72a20ab：`Cargo.toml`、`Cargo.lock`。证明独立 kona 仓库仍停在 revm 31 / op-revm 12（tag v2.2.2）。
8. **PRIMARY** `mantle-xyz/op-geth` @e33cd26：`version/version.go`、`core/vm/*`。证明它基于 geth 1.17.3，并缺少哪些 2026 年的解释器优化。
9. **PRIMARY** docs.mantle.xyz：Node Introduction、Mantle v2 v1.6.3 Elysium changelog、OP Succinct Mainnet Upgrade（访问 2026-10-25，`.md` 版本）。证明官方文档里的 sequencer 执行层是 op-geth、Elysium 不在 L2 激活 Amsterdam、证明路径是 OP Succinct。
10. **PRIMARY**（私有仓库）`mantle-xyz/rde-v4` `docs/superpowers/specs/2026-07-02-rethseq-profile-design.md`。证明内部开发环境的默认 profile 里 op-reth 只做 L2 RPC。
11. **PRIMARY** `bluealloy/revm` main @ee9ab3f、tags v107 / v108 / v120，以及 release notes v108、v109、v113、v114、v116、v118、v120（`gh release view`）。证明 v107 之后的结构和性能变化、op-revm 迁出、#3746 合入 v114。
12. **PRIMARY** `paradigmxyz/reth` tag v2.2.0 @88505c7、main @f90ed27、PR #25002、release v2.8.1 的 Cargo.toml。证明 prewarming 默认开启，以及 reth main 已用 evm2 替换 revm、jit 是可选 feature。
13. **PRIMARY** `alloy-rs/evm` @d7b5ed4 与 tag v0.34.0：`CHANGELOG.md`、`crates/evm/src/evm.rs`。证明 0.34 → 0.39 的变化，以及 `EvmFactory` 是 revm 形状的。
14. **PRIMARY** `ethereum-optimism/optimism` develop @b84018de4：`rust/Cargo.toml`、`rust/op-revm/Cargo.toml`（gh api，访问 2026-10-25）。证明 OP upstream 的组合是 revm 43.0.2、alloy-evm 0.39、op-revm 20、reth op-v2.6.0-1。
15. **PRIMARY** `ethereum/go-ethereum` @2006f08，PR #35638、#35959、#33960、#35156、#35881。证明 geth 的生成 switch + PGO、stack arena、in-place 栈操作、分层 jumpdest 缓存、并行 prefetcher，以及差分测试的做法。
16. **PRIMARY** `ipsilon/evmone` @ffb01f2：README、`lib/evmone/*`。证明 baseline / advanced 的设计、cgoto、按深度复用的执行状态。
17. **PRIMARY** `NethermindEth/nethermind` @34b321c：README、`Nethermind.Evm/*`、`Nethermind.Consensus/Processing/*`。证明函数指针分派、栈池和对象池、并行预热、BAL 并行校验。
18. **PRIMARY** `besu-eth/besu` @bdb9e5c 与 PR #11524。证明实验性 EVM v2 的 `long[]` 栈、差分测试方法和 JMH 微基准数字。
19. **PRIMARY** `lambdaclass/ethrex` @18fdb83：`crates/vm/levm/*`。证明 LEVM 的分派、栈池和测试方式，以及项目自带的（陈旧）revm 对比基准。
20. **PRIMARY** `paradigmxyz/revmc` @6860b6f 与 `alloy-rs/evm2` @c8bb5a2 `crates/jit`。证明 revmc 的实验状态和对 LLVM 22 的依赖，以及 evm2-jit 与 revmc 同源。
21. **PRIMARY** ethereum/EIPs：`EIPS/eip-7904.md`、`assets/eip-7904/analysis/2026-06-10/new_gas_proposal.md`、`assets/eip-7904/gas-cost-estimator-report.pdf`（访问 2026-10-25）。证明 EIP-7904 现行结论与测量对象、reth 在各参数上的位置，以及旧报告里对 revm 18 的评价。
22. **PRIMARY** RUSTSEC-2026-0220（rustsec/advisory-db）。证明 ruint < 1.20.0 存在移位溢出标志错误，修复版本是 ≥1.20.0。
23. **PRIMARY** gakonst 推文 https://x.com/gakonst/status/2114190575486538225（2026-10-25，已核实）。证明 Paradigm 公开表态新 EVM 将用于 reth 等项目。
24. 线索：GPT Deep Research `research/gpt-deep-research.md` §9–§13。只用作线索，修正见上节。

---

## 开放问题

1. Mantle 主网 sequencer 的执行层是 op-geth 还是 reth？reth 在主网承担什么角色（RPC、verifier、备用 sequencer）？生产节点的启动参数（prewarming、cache 大小）是什么？需要运维侧给出一手材料。
2. OP upstream（ethereum-optimism/optimism 的 op-reth / op-revm）是否、何时跟进 reth main 的 evm2 迁移？这决定 Mantle 是跟着 OP 走，还是自己移植 op-revm 的语义。
3. mantle-xyz/revm 修复 7825 补丁以后，`state/src/lib.rs:516` 等其余核心补丁能否通过全部 EEST？目前 CI 在 7825 用例处就提前失败了，其余用例的结果未知。
4. ruint < 1.20.0（RUSTSEC-2026-0220）对 revm 的 SHL / SHR 和共识路径有没有实际影响？本路没有评估。
5. 在 Mantle 实际负载下，区块处理时间里 EVM 解释器、状态读、trie 各占多少？没有数据，需要 P1-6 的基准来回答。
6. mantle-xyz/kona 独立仓库（revm 31）是否还被任何生产组件使用（例如旧的 fault-proof 或工具链）？代码层面看不到消费方。

---

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| M1 | Mantle reth 的 revm 系列和 op-revm 都钉在 mantle-xyz/revm tag v107-mantle-arsia.2，Cargo.lock 解析为 revm 38.0.0、op-revm 19.0.0、revm-interpreter 35.0.1（commit 835cb4e）。 | `mantle-xyz/reth/Cargo.toml:242-264@574e7f3`；`Cargo.lock:10322-10324,5995-5997,10462-10464@574e7f3` | observed |
| M2 | Mantle reth 使用 crates.io 上未打补丁的 alloy-evm 0.34.0，alloy-op-evm 0.32.0 和 op-alloy 来自 mantle-v2 tag mantle-v1.6.3，reth crates 基于 paradigmxyz/reth v2.2.0（88505c7）。 | `mantle-xyz/reth/Cargo.toml:8-16,257,260@574e7f3`；`Cargo.lock:293-295,408-410`；`git ls-remote` v2.2.0=88505c7 | observed |
| M3 | `mantle-reth/` 目录没有自定义 EVM 或 block executor：MantleNode 是 OpNode 的薄包装，执行器仍是上游 OpExecutorBuilder → OpEvmConfig → alloy-op-evm 的 OpBlockExecutorFactory / OpEvmFactory。 | `mantle-reth/crates/cli/src/node.rs:1-5,404@574e7f3`；`op-reth/crates/evm/src/lib.rs:69-72,80-86,121-128` | observed |
| M4 | Mantle 的费用与存款语义（token_ratio 缩放、Arsia 额外费用、BVM_ETH、失败存款）实现在 mantle-xyz/revm 的 op-revm handler 里，不在 reth 层。 | `mantle-xyz/revm/crates/op-revm/src/handler.rs:64,162-173,270-271,402-437,568@835cb4e`；`transaction/bvm_eth.rs`（2303 行） | observed |
| M5 | 相对 upstream v107，Mantle 的 revm fork 在 crates/ 下改了 51 个文件（+6031/−2523），其中 op-revm 源码占 +5727 行。 | `git diff --shortstat upstream-v107 v107-mantle-arsia.2 -- crates/`（mantle_revm 本地）[3] | observed |
| M6 | Mantle fork 对 revm 核心 crate 有 4 处功能性补丁：EIP-7825 默认上限被全局关闭、新增 Gas::set_limit、SSTORE original_value 只在跨交易时重设、Halt.logs 加 serde default。 | `crates/context/src/cfg.rs:425`、`interpreter/src/gas.rs:222`、`state/src/lib.rs:516`、`context/interface/src/result.rs:399`@835cb4e | observed |
| M7 | SSTORE original_value 这处修复已由 Mantle 提交到 upstream（bluealloy/revm#3746），随 v114 / revm 42.0.0 发布。 | commit 84fe60c（Ivan Wang，2026-06-18）；`bluealloy_revm/crates/state/src/lib.rs:627-639@ee9ab3f`；v114 release notes 引用 #3746 [11] | observed |
| M8 | mantle-xyz/revm main 上的 ethereum-tests CI 失败，原因是 Mantle 关闭 EIP-7825 的核心补丁让 EEST Osaka 用例拿不到预期的 GAS_LIMIT_EXCEEDS_MAXIMUM。 | GitHub Actions run 35086043320（2026-09-16）日志 [4]；`cfg.rs:425@835cb4e` | observed |
| M9 | mantle-xyz/revm 的 Tests CI 因 cargo-deny 报告 RUSTSEC-2026-0220（ruint < 1.20.0）等 advisory 而失败；Mantle reth 的 lockfile 里 ruint 为 1.18.0，同样低于修复版本。 | run 37723171335 日志 [4]；`mantle-xyz/reth/Cargo.lock:10669-10670`；RUSTSEC-2026-0220 [22] | observed |
| M10 | EIP-7825 的补丁不需要改 revm 默认值，因为 CfgEnv 提供可选的 tx_gas_limit_cap 字段，在 Mantle 构造环境时设为 u64::MAX 即可达到同样效果。 | 由 M6、M8 和 `bluealloy_revm/crates/context/src/cfg.rs:464-470@ee9ab3f`（`self.tx_gas_limit_cap.unwrap_or(...)`）推出：按配置设置即可 | inferred |
| M11 | Mantle 的证明路径 op-succinct 使用来自 mantle-v2 tag mantle-v1.6.3 的 kona，以及同一 tag v107-mantle-arsia.2 的 revm / op-revm，并要求与 mantle-v2 锁步升级。 | `mantle-xyz/op-succinct/Cargo.toml:83-100,178-189,259-273@8d280de`；`Cargo.lock:8733-8735,6631-6633` | observed |
| M12 | 独立仓库 mantle-xyz/kona（最后提交 2026-04-24）仍用 mantle-xyz/revm tag v2.2.2，解析为 revm 31.0.2 和 op-revm 12.0.2，它已不在当前证明路径上。 | `mantle-xyz/kona/Cargo.toml:161-163@72a20ab`；`Cargo.lock:8197-8199,6819-6821`；`mantle-v2/rust/MANTLE_CHANGES.md:20-35@09e3693` | inferred |
| M13 | Mantle 自 2025-09-16 起用 OP Succinct（SP1 ZK 有效性证明）验证状态根，所以 op-revm 的执行结果直接决定证明能否成立。 | docs.mantle.xyz “Mantle OP Succinct Mainnet Upgrade”[9]；由 M11 推出：证明程序执行 op-revm | inferred |
| M14 | Mantle 官方公开文档把 op-geth 列为 sequencer 和 verifier 的执行客户端，Elysium 升级只要求运营者升级 op-node 和 op-geth。 | docs.mantle.xyz Node Introduction；Mantle v2 v1.6.3 Elysium changelog（访问 2026-10-25）[9] | observed |
| M15 | Mantle reth 的 release note 称其某个构建“the build running on mainnet”，并提到面向“sequencers running preconf”的必需升级；公开资料不能确认 reth 是否承担主网 sequencer。 | release `op-reth-v2.2.1-mantle-arsia.2`、`mantle-v1.6.2` [2]；与 M14 对照 | observed |
| M16 | 在内部开发环境的默认 profile 里，op-reth 只作为 L2 RPC 使用；2026-07 才新增 profile 来验证 op-reth 当 sequencer。 | 私有仓库 `mantle-xyz/rde-v4/docs/superpowers/specs/2026-07-02-rethseq-profile-design.md` [10] | observed |
| M17 | 推测 reth 在主网承担 RPC 或 verifier 角色，而不是 sequencer。 | 由 M14、M15、M16 推测，没有运维侧一手证据 | speculative |
| M18 | Mantle 与 op-geth 的 parity 问题一直是事后修复的：op-revm 至少 6 个 commit 标题写着对齐 op-geth，reth v1.6.2 也专门修复了与 op-geth 在费用估算和区块校验上的差异。 | `git log upstream-v107..v107-mantle-arsia.2`（含 op-geth 的标题 6 个）[3]；mantle-v1.6.2 release note [2] | observed |
| M19 | Mantle reth 现有的执行一致性测试只有 7 个主网交易 fixture 的 gasUsed 回放，外加按执行客户端分别跑的 smoke 验收测试，没有持续的逐块 op-geth↔op-revm 差分。 | `mantle-reth/crates/integration-tests/tests/replay.rs:1-11@574e7f3`（fixtures 共 7 个）；`mantle-v2/.github/workflows/ci-main-migrated.yml:701-769@09e3693` | observed |
| M20 | mantle-xyz/revm 有一个按 RPC 逐块比对 receipt（可选状态校验）的回放工具，但它是手动示例，不在 CI 里。 | `mantle-xyz/revm/examples/block_traces/src/main.rs:58-101,162-209@835cb4e` | observed |
| M21 | Mantle reth 仓库收录了 ethereum-tests 数据，但没有任何 runner crate 是 workspace 成员，也没有执行层或区块回放的 benchmark。 | `mantle-xyz/reth/Cargo.toml:31-59@574e7f3`；`git ls-files testing` 共 9384 个文件；`justfile:37-42,137-147` | observed |
| M22 | 从 revm v108 起，op-revm 已从 bluealloy/revm 移出、迁到 ethereum-optimism/optimism，v107 是最后一个带 op-revm 的 revm tag。 | v108 release notes（#3568）[11]；`git ls-tree v107 crates/` 与 `v108` 对比 | observed |
| M23 | OP upstream（optimism develop）目前的组合是 revm 43.0.2、alloy-evm 0.39.0、op-revm 20.0.0 和 reth op-v2.6.0-1，Mantle 的 revm 38 / alloy-evm 0.34 / reth v2.2.0 落后于它。 | `ethereum-optimism/optimism rust/Cargo.toml:366,441,456@b84018de4`；`rust/op-revm/Cargo.toml:4` [14] | observed |
| M24 | v107 到 v120 之间，upstream revm 做了指令表与 gas 表分离、commit 和空账户的分配优化、异步数据库、BAL 基础设施等改动，但 release notes 没有给出端到端区块执行的加速数字。 | v108（#3561 #3586 #3590 #3599）、v113（#3732）、v116（#3709）release notes [11] | observed |
| M25 | alloy-evm 从 0.34 到 0.39 增加了 indexed tx 执行、State commit hook、precompile lookup 映射、database adapter 和 tx env downcast，并跟随 revm 升到 43。 | `alloy-rs/evm/CHANGELOG.md:8-121@d7b5ed4` | observed |
| M26 | paradigmxyz/reth main 已在 2026-10-24 用 evm2 整体替换 revm 和 alloy-evm（#25002，221 个文件），而最新发布版 v2.8.1 仍使用 revm 43.0.3。 | commit 9d1638f；`paradigmxyz/reth/Cargo.toml:440-443@f90ed27`；v2.8.1 Cargo.toml 第 440、452 行 [12] | observed |
| M27 | Mantle reth 虽然通过 alloy-evm 的 EvmFactory 接入执行，但该 trait 和 Mantle 的 trait bound 都直接引用 revm 类型，所以这层抽象不能用来更换 VM。 | `alloy-rs/evm/crates/evm/src/evm.rs:7,259,273@v0.34.0`；`op-reth/crates/evm/src/lib.rs:206-212@574e7f3`；由 M26 的整体替换做法印证 | inferred |
| M28 | reth v2.2.0 默认开启并行 prewarming，也有 precompile cache；Mantle 代码没有关闭它，但生产启动参数未知。 | `paradigmxyz/reth/crates/engine/primitives/src/config.rs:126-127,222@88505c7`；`crates/node/core/src/args/engine.rs:343-345`；mantle-reth 中 grep `prewarm` 无结果 | observed |
| M29 | Elysium 发布时 Mantle L2 保留 Arsia/Osaka 执行规则、不激活 Amsterdam，因此 reth 和 Nethermind 基于 EIP-7928 BAL 的并行路径目前不适用于 Mantle 区块。 | Elysium changelog [9]；由此推出 Mantle 区块没有 BAL | inferred |
| M30 | Mantle 的 op-geth 基于 geth 1.17.3，缺少 geth 2026 年的 PGO switch 解释器、in-place 栈操作和分层 jumpdest 缓存。 | `mantle-xyz/op-geth/version/version.go:20-22@e33cd26`；`core/vm` 中 grep `interpreter_gen`、`popPtr`、`layeredJumpDests` 均无结果 | observed |
| M31 | geth 最新解释器把热点 opcode 生成为 dense switch，并靠 PGO 内联；有 tracer 时退回原来的跳表循环，两条路径在每次 CI 中跑差分测试和 fuzz。 | `go-ethereum/core/vm/interpreter.go:134-137,147@2006f08`；`interpreter_gen.go:1-42`；PR #35638 正文 [15] | observed |
| M32 | geth 用 stack arena 和 sync.Pool 复用栈，用“共享缓存 + 每交易本地层”的两级 jumpdest 缓存，并用约 4/5 CPU 的 worker 并行预执行区块交易来预热状态。 | `core/vm/stack.go:26-51`、`jumpdests.go:55-90`、`core/state_prefetcher.go:53-63@2006f08`；PR #35881 | observed |
| M33 | evmone 默认用只做最少 jumpdest 分析的 Baseline 解释器（支持 computed goto），另有按指令块预计算 gas 和栈需求、分析代价更高的 Advanced 解释器，并按调用深度复用执行状态。 | `ipsilon/evmone/README.md:20-41@ffb01f2`；`lib/evmone/baseline_execution.cpp:216-238`；`vm.cpp:79-90` | observed |
| M34 | Nethermind 用函数指针表直接分派 opcode，用对齐的 pinned 栈池和对象池避免堆分配；它还有并行预热器和基于 BAL 的并行区块校验。其 README 称预热能让区块处理时间约减半，但没有给出测试条件。 | `Nethermind/README.md:30@34b321c`；`Nethermind.Evm/VirtualMachine.Dispatch.cs:21-22`；`StackPool.std.cs:27-38`；`BlockCachePreWarmer.cs:38`；`BlockProcessor.ParallelBlockValidationTransactionsExecutor.cs:27,54-58` | observed |
| M35 | Besu 的实验性 EVM v2 改用 long[] 栈，并在 switch 里内联热点 opcode；在 Graviton4 上的 JMH 单 opcode 微基准中，算术类提升 2.53 倍、比较和位运算类提升 3.91 倍，该功能仍需 --Xevm-v2 开启。 | `besu-eth/besu/evm/.../EVM.java:265-274,507-511@bdb9e5c`；`EvmConfiguration.java:28`；PR #11524 性能表 [18] | observed |
| M36 | Besu 为 EVM v2 建了逐 opcode 和随机程序的 v1↔v2 差分测试，人工注入的 52 个 bug 全部被测出。 | PR #11524 正文 [18] | observed |
| M37 | ethrex LEVM 是独立的纯 Rust EVM，用按 fork 预构建的函数指针表和栈池；它自带的旧基准（M1，约 2024 年）显示比 revm 慢 1.23–1.33 倍。 | `lambdaclass/ethrex/crates/vm/levm/src/opcodes.rs:389,424-432@18fdb83`；`vm.rs:636,2936`；`bench/revm_comparison/README.md` | observed |
| M38 | revmc 仍自称实验性 JIT/AOT 编译器，依赖 LLVM 22，从未进入 reth 的发布版本；evm2-jit 是它在 evm2 中的同源移植，在 reth main 中是默认关闭的可选 feature。 | `paradigmxyz/revmc/README.md:1-35@6860b6f`；reth v2.2.0 中 `git grep revmc` 无结果；`alloy-rs/evm2/crates/jit/README.md:1-9@c8bb5a2`；`reth/crates/ethereum/evm/Cargo.toml:23,46,65-67@f90ed27` | observed |
| M39 | 现行 EIP-7904 在 6 个完整客户端（含 Reth）上以 100 Mgas/s 为目标做了测量，结论是不调整任何 gas 价格；reth 只在 ECPAIRING_BASE 上是最差客户端，且与次差的 ethrex 基本持平（8247 对 8182）。 | `EIPS/eip-7904.md:15,70,121`；`assets/eip-7904/analysis/2026-06-10/new_gas_proposal.md:44-63` [21] | observed |
| M40 | 较早的 Gas Cost Estimator 报告测的是 revm 18.0.0 等 7 个独立 EVM，原文说除 Revm 外各团队都应检查 CALL 类子上下文的开销，且 Nethermind、Geth、Erigon 的 jump 开销偏高。 | `assets/eip-7904/gas-cost-estimator-report.pdf`（EVM Implementations；Call 和 Jumps 小节）[21] | observed |
| M41 | 按 Mantle 当前 60M gas、2 秒出块计算，峰值需求约 30 Mgas/s，低于 EIP-7904 的 100 Mgas/s 目标，推测 EVM 解释器计算目前不是区块处理的瓶颈。 | 由 M39 和 mantle-v1.6.2 / arsia.2 release notes [2] 推测；测量对象和负载不同，需要实测 | speculative |
| M42 | 推测 sequencer 出块（payload building）路径不能像 engine 校验路径那样受益于 reth 的并行 prewarming。 | 只看了 engine 侧的 prewarm 实现（M28），没有核实 payload builder 的代码 | speculative |
| M43 | 对 Mantle 最紧迫的执行层工作是把 op-geth↔op-revm 差分回放做成发布门禁，优先级高于 revm↔evm2 差分，因为前者同时影响共识和 ZK 证明。 | 由 M13、M14、M18、M19 推出：两套执行器已在生产中并存且 parity 一直事后修复，而 evm2 迁移尚未决定 | inferred |
| M44 | Mantle 若把核心 revm 补丁降到零，fork 就只剩 op-revm 补丁层，可以 rebase 到 OP upstream 的 op-revm 20；同时需要让 reth、mantle-v2/rust、op-succinct 三处的 tag 锁步升级。 | 由 M6、M7、M10、M22、M23 推出；锁步要求见 `op-succinct/Cargo.toml:178-183,259-262` | inferred |
| M45 | Mantle 仓库内的依赖说明已经和实际不符：Cargo.toml 注释仍称 revm 指向私有 GHSA fork，MANTLE_CHANGES 仍称 reth 使用 mantle-xyz/evm fork 的 alloy-evm。 | `mantle-xyz/reth/Cargo.toml:239-242@574e7f3`；`mantle-v2/rust/MANTLE_CHANGES.md:37,100@09e3693`；对照 M1、M2 | observed |

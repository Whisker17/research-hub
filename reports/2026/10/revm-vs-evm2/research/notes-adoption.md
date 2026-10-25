# notes-adoption（前缀 A）— 谁在迁移、迁到哪一步、为什么

访问/核实日期：2026-10-25。本文件所有 GitHub 数据来自 `gh` CLI 与本地克隆；推文来自 `api.fxtwitter.com`。
本路新增克隆：`/tmp/evmr/src/paradigmxyz_reth`（main @ f90ed27，2026-10-24 15:42 UTC）、`/tmp/evmr/src/risechain_risechain`（@ 2c2c6f2）；`alloy-rs_evm2` 与 `risechain_pevm` 已 `git fetch --unshallow`（evm2 全历史 791 个提交，HEAD 仍为 c8bb5a2）。

---

## A-Q1 gakonst 推文的“new EVM”是不是 evm2？

**答案**：推文本身没有点名，但所有一手证据都指向 evm2：它由 Paradigm/Tempo 工程师维护、内置从 revmc 移植来的 JIT，并且在推文发出约 18 小时前，reth main 刚合并“refactor!: replace revm with evm2”（2026-10-24）；Foundry、Tempo 各有一个仍未合并的“迁到 evm2”PR。“just wrapped audit”有间接佐证（2026-10 在 evm2/reth/tempo 中修复了编号为 `SIGP-xxx` 的“integration audit”发现项），但**没有任何公开的审计报告**，审计方身份未公开。

**依据**
- 推文原文（fxtwitter）：2026-10-25 03:01:27 UTC，非回复、无引用推文，正文未出现 “evm2” 字样 [1]。
- evm2 仓库：`gh api repos/alloy-rs/evm2` → created_at 2026-04-30T14:49:31Z，public，83 stars；`gh release list` 为空，无 tag [4]。crates.io 上 `evm2` 只有一个 `0.0.0-reserved` 占位版本（2026-10-23 创建，owner DaniPopes）[4]。
- 作者分布（全历史，`git log --format='%an' | sort | uniq -c`）：DaniPopes 477、onbjerg 64、Derek Cofausper 51、Matthias Seitz 45、rakita 28、cui 28、Arsenii Kulikov 24、Georgios Konstantopoulos 3（共 791 提交，首个提交 `c30c97d` 2026-04-30 DaniPopes “initial commit”）[3]。GitHub 资料自填：DaniPopes/onbjerg/decofe 公司为 @tempoxyz，mattsse 简介 @tempoxyz，klkvr 简介 @tempoxyz @paradigmxyz，gakonst 为 Paradigm/Tempo CTO [23]。
- revm 作者 rakita 自 2026-06-05 起成为 evm2 CODEOWNER：`06ee806` “chore: add rakita as maintainer (#190)”，CODEOWNERS 由 `* @danipopes @onbjerg` 改为 `* @danipopes @onbjerg @rakita` [3]。
- 定位：`alloy-rs_evm2/AGENTS.md:3-10@c8bb5a2` “This repo is a reimplementation of revm … work-in-progress repo with no public API stability guarantees”；`README.md:7@c8bb5a2` “up to **2x faster than revm**”（无测试条件）[3]。
- JIT：`crates/jit/README.md@c8bb5a2` “Experimental JIT and AOT compiler”；JIT 来自 revmc 移植——`fb556dc`（PR #207，2026-06-27）“Draft PR for porting revmc into `crates/jit` as the evm2 JIT implementation” [5]。
- reth：PR paradigmxyz/reth#25002 “refactor!: replace revm with evm2”，作者 onbjerg，2026-06-08 创建，**2026-10-24T09:15:08Z 合并入 main**，+17698/-10870 [8]。本地 `paradigmxyz_reth@f90ed27`：`Cargo.toml:441-443` 依赖 `evm2`/`evm2-inspectors`/`evm2-jit`（git rev 19ae5411），`Cargo.toml:674-679` 用 `DaniPopes/evm2` 打 patch（注释：“pre-transfer URL, which redirects to alloy-rs/evm2”），`Cargo.lock` 中已无任何 `name = "revm*"`、`alloy-evm`、`op-revm` 包 [8]。`bin/reth/Cargo.toml:89-100@f90ed27` 默认 feature 含 `jit`，但运行时 `crates/node/core/src/args/jit.rs:12@f90ed27` `--jit` 默认 `false`（编译进来、默认不开）[8]。最新正式 release 为 Reth v2.8.1（2026-10-23），早于该合并，**目前没有任何已发布的 reth 版本包含 evm2** [9]。
- Foundry：foundry-rs/foundry#17541 “refactor!: migrate from revm to evm2”，mablr，2026-10-12 创建，**draft、OPEN**，+22255/-24641；PR 描述称 Ethereum/OP/Base/Monad/Tempo 都走原生 evm2 路径，并依赖 `mablr/evm2` 分支与 `mablr/evm2-networks` [10]。另有若干已合并的“evm2 parity”PR（#17740、#17747、#17764），foundry-rs/book 已有 `/perf/evm2/` JIT 基准页面（#2150）[10]。
- Tempo：tempoxyz/tempo#7871 “refactor!: replace revm with evm2”，klkvr，2026-09-23 创建，OPEN、REVIEW_REQUIRED；Tempo main 的 `Cargo.toml:291` 仍为 `revm = "43.0.3"`、`:301` `alloy-evm = "0.39.0"` [11]。
- 审计线索：tempo#8320（合并 2026-10-14，base=`klkvr/evm2`）“bringing the pending **integration audit fixes** into Tempo … (SIGP-354)”[7]；evm2 #731 “Fixes SIGP-371”（10-22 合并）、#598 引用 `linear.app/tempoxyz/issue/SIGP-358`、#746 “Related audit fixes: #744, paradigmxyz/reth#28100, #28102”[6]。evm2 仓库内**没有** audits 目录或报告；唯一带 “audit” 的文件是 `.github/workflows/cyclops-audit.yml`，它调用 `tempoxyz/gh-actions` 的 PR 级 “agentic-audit”（自动化 AI 审查 CI），不是第三方审计报告 [3]。

**不确定之处**
- 推文未点名，“= evm2”为推断（见台账 A9）。gakonst 其他相关推文无法枚举（fxtwitter 只能按 ID 取），未检索。
- “SIGP” 前缀很像 Sigma Prime 的发现项编号，但只能从 Linear issue key 推测，**审计方身份 speculative**；审计范围（evm2 本体 vs reth/tempo 集成）也未公开。
- evm2 README 的 “up to 2x” 无 workload/基线说明，本路不引用为性能结论。

## A-Q2 Base：已切换 / 并行开发中 / 只做差分测试？

**答案**：**并行开发中（含差分测试），未切换**。`base-common-evm2` 已实现相当完整的 Base 区块执行器并与 revm 路径做 parity 测试，但 workspace 内没有任何 crate 依赖它，节点执行路径仍是 revm（`BaseEvmConfig` → `BaseEvmFactory` → `alloy-evm` + `revm 43.0.3`）；接入节点被明确挂在“上游 alloy-evm/reth EVM2 bridge”之后，而该 bridge 直到 2026-10-24 才进入 reth main，Base 自己的 reth fork 还停在 `base-v2.7.0.2`。

**依据**
- 依赖：`base_base/Cargo.toml:304@bcd96e2` `revm = "43.0.3"`；`:310` `evm2 = { git = alloy-rs/evm2, rev = "9b037449…" }`（该 rev 为 evm2 `9b03744`，2026-08-24，比 evm2 main 落后两个月）；`:169` `base-common-evm2`；`:333` `alloy-evm = "0.39.0"`；`:350-361` reth 全部来自 `base/reth` tag `base-v2.7.0.2` [12]。
- `grep -rln base-common-evm2 --include=Cargo.toml` 只命中 `crates/common/evm2/Cargo.toml` 自身——**没有任何其他 crate 依赖它**；而 `base-common-evm`（revm 版）被 node、payload、builder、txpool、flashblocks、proof/* 等 20+ crate 依赖 [12]。
- crate 自述：`crates/common/evm2/Cargo.toml:3@bcd96e2` description “Base EVM2 execution type family (scaffold)”；`README.md:15-18@bcd96e2` “This crate is intentionally **not** wired into the node. It exists so the type family … can be built and differentially tested against the revm engine before the upstream `alloy-evm`/`reth` EVM2 bridge lands.” `Cargo.toml:31-44` 把 revm 版 `base-common-evm`、`base-common-precompiles`、`revm` 列为 dev-dependencies，注释写明 “for the differential parity harnesses” [12]。
- 实际实现超出 README 所说的“mirroring stock Ethereum”（README 第 8 行已过时）：`src/lib.rs` 导出 `BaseBlockExecutor`、`BaseTxHandlerHooks`、`BaseTxEnvelope`、`Canyon`、`Everest`、`BaseForkActivations` 等；`tests/` 下有 `block_parity.rs`、`deposit_parity.rs`、`standard_fee_parity.rs`、`transition_parity.rs` 等 8 个测试文件 [12]。但 `src/executor.rs:121@bcd96e2` 定义 `Eip8130ExecutionUnsupported`（“EIP-8130 transaction execution is not supported by this engine”），即 Base 的 EIP-8130 原生 AA 交易在 evm2 路径上尚不可执行 [12]。
- 节点路径：`crates/execution/node/src/node.rs:793@bcd96e2` `BaseEvmConfig::new(...)`；`crates/common/evm/src/factory.rs:1-3,62@bcd96e2` `use alloy_evm::…; use revm::…; impl EvmFactory for BaseEvmFactory`；`crates/common/evm/README.md:7-9` “Maps upgrade activation timestamps to revm `SpecId` values” [12]。
- 时间线（`gh pr list -R base/base --search evm2`）：#4693 “Scaffold Base Common Evm2 Crate”（refcell，2026-08-26 开、08-27 合并，描述同样写 “intentionally not wired into the node”）；#4695/#4696/#4759/#4761/#4762/#4765/#4767 于 08-28~09-02 合并；#4804 precompiles（09-08）、#4805 EIP-8130 primitives（09-09）、#4803 “Complete The EVM2 Block Executor”（09-04，描述 “non-test build staying revm-free … differentially parity-tested against the revm base-common-evm reference”）。spike #4788 “Drive Full EVM2 Integration To Completion” 于 08-31 **关闭未合并**，其路线图 Phase 7 “Node integration: alloy-evm / reth EVM2 bridge ⬜ wire the crate into the node”。之后只有 #6026（10-17，小重构）[13]。
- 外围：`refcell/base-era`（Base 工程师 refcell 个人仓库，“Version-isolated historical execution for Base”）Cargo.toml 引用 evm2；`mablr/evm2-networks`（Foundry 迁移用）含 OP/Base/Monad 的 evm2 实现——均非 base/base 官方节点代码 [20]。

**不确定之处**
- GPT 所说的“官方 docs index”原文在 bcd96e2 的 `docs/`、`AGENTS.md`、`CLAUDE.md` 中都找不到 evm2 条目；同义表述只在 crate README 与 PR #4693 描述中。可能是外部文档站，未核实。
- Base 内部是否已在私有分支接 reth-evm2 bridge 未知；公开活跃度在 9 月中旬后明显下降，是否在等 reth 合并属推测。

## A-Q3 RISE：下游化 revm 为自有 RISE VM，还是“降级 revm 版本”？

**答案**：公开证据只支持“下游化/自有 VM”，**不支持“revm 升级后变慢所以降级”**：pevm 的 revm 版本历史只有单调升级（自有 fork → 19.4.0 → … → 38.0.0），没有回退提交；RISE VM 本身未开源。早在 2024-10，hai-rise 就在 pevm#382 写明 revm 作为“sequential-first”外部实现带来过多开销，想要并行优先的自有 EVM。

**依据**
- 推文（已核实，含配图）：“downstream revm into our own RISE VM implementation for better API control … register optimizations, op-code fusions, smart inlining and caching … processing @risechain blocks 2x faster than revm” [2]。配图为监控面板 “Payload Latency p95 — node-with-revm vs node-with-rise-vm，Last 1 hour”：revm Mean 248 ms / Max 497 ms，RISE VM Mean 123 ms / Max 226 ms。这是**整节点 payload 延迟 p95、1 小时窗口**，未给 revm 版本、硬件、负载 [2]。
- pevm#382（hai-rise，2024-10-15，仍 OPEN）：“we want an implementation specifically designed for parallel execution with thread-safe types, states, more native caches and instrumentation, no overheads for lazy, etc. Using an external sequential-first implementation like `revm` adds too much overhead and unwanted type conversions.” 评论（2024-10-17）：“A fork is likely a bad choice … use the multi-version memory directly instead of going through … `JournaledState`'s `EvmState` in `revm`.” [15]——注意 2026 年推文实际走的是“下游化（≈fork）”，与 2024 年“fork 不是好选择”的表态不同。
- pevm revm 版本历史（`git log -p -- Cargo.toml`，unshallow 后 344 提交）：2024-09~2025-01 使用 `risechain/revm` fork 的 git rev；`be02a24` 2025-11-07 “chore: remove revm fork” → `revm = "19.4.0"`；随后 `ad36090` → 20.0.0，2026-04-08/09 连续 bump 22 → 24 → 25 → 26 → 31 → 36，`8efd196` 2026-04-26 → **38.0.0**（`Cargo.toml:57-58@e94b0e3`）。**全部为升级，无回退** [14]。
- pevm 状态：`README.md:5@e94b0e3` “work in progress and is not production ready”；最后提交 `e94b0e3` 2026-06-05 [14]。
- RISE VM 未开源：`gh repo list risechain` 中无 VM 仓库；`risechain/risechain` 自称 “gradual process of open-sourcing”，@2c2c6f2 只有 `crates/primitives`，其 `Cargo.lock` 中 revm 40.0.3 来自 reth v2.3.0 传递依赖；`risechain/revm`（bluealloy/revm 的 fork）各分支最后提交在 2024-07~2025-03，main 停在 revm v19.4.0（2025-01）[16]。

**不确定之处**
- 2× 数字无可复现条件；RISE VM 基于哪个 revm 版本下游化、是否同时包含 pevm/缓存/调度改动，均未公开。
- 未检索 RISE 博客/文档站（未在本地资料中拿到其 URL，不猜测）。
- “升级后性能下降”这一说法在 RISE 公开仓库中找不到任何来源，应视为误传。

## A-Q4 MegaETH：是否有迁到 evm2 的迹象？

**答案**：公开代码与规范仍完全基于 revm 40.0.3 + op-revm，并在 2026-09 起维护自己的 `megaeth-labs/revm` fork（加 instruction/frame-loop hooks、资源池等）；**没有公开的迁移计划**。但有一条值得注意的信号：mega-evm 的头号提交者 RealiCZ（GitHub 公司字段 @megaeth-labs）2026-09-01 在 evm2 提了 3 个 issue，自述“we prototyped porting an OP-stack-style L2 … onto evm2”，并点名了 `LOG*`/`CALL`/`SELFDESTRUCT` 上叠加第二个 gas 维度的需求——与 MegaETH 双 gas 模型高度吻合。即：**有评估/原型迹象，无迁移承诺**；内部计划未公开、无法核实。

**依据**
- 依赖：`megaeth-labs_mega-evm/Cargo.toml:139-146@821577d`：`op-revm` 来自 `ethereum-optimism/optimism` git rev f67d87cd，`revm = "=40.0.3"`，`revm-inspectors = "=0.40.1"`，`alloy-evm = "=0.36.0"` [17]。
- 规范原文：`docs/spec/overview.md:13@821577d` “The reference implementation is MegaEVM, built on revm and op-revm.”；`:14` “All standard EVM semantics are inherited from Optimism Isthmus (Ethereum Prague) unless explicitly overridden.”；`:46-47` 表格 “Base EVM: revm v40.0.3 / Optimism EVM: op-revm v20.0.0” [17]。
- 在 revm 之上加的东西（代码位置）：
  - 核心结构：`crates/mega-evm/src/evm/mod.rs:91-98@821577d` `MegaEvm { inner: revm::context::Evm<MegaContext, INSP, MegaInstructions, PrecompilesMap, EthFrame<EthInterpreter>> }`；`evm/instructions.rs:180-183` `MegaInstructions { inner: EthInstructions<…> }`（包裹 revm 指令表）[17]。
  - 多维资源限制：`limit/mod.rs:27` `enum LimitKind`（DataSize、KV update 等），`limit/limit.rs:73` `struct AdditionalLimit`（compute gas / data size / KV updates / state growth + storage call stipend），子模块 `compute_gas.rs`、`data_size.rs`、`kv_update.rs`、`state_growth.rs`、`frame_limit.rs` [17]。
  - Volatile data access tracking / gas detention：`access/tracker.rs:65` `struct VolatileDataAccessTracker`（bitmap 记录 block env、beneficiary、oracle 访问并施加 compute gas 上限）；挂在 `evm/context.rs:69,83` 的 `additional_limit`、`volatile_data_tracker`（`Rc<RefCell<…>>`）[17]。
  - 规范层：双 gas 模型、gas detention、SALT 动态 gas、系统合约、`EQUIVALENCE → … → REX6` spec 阶梯（`overview.md:28-32,56-76`）[17]。
- 公开渠道 evm2 痕迹：`grep -rni evm2` 在 mega-evm 中只命中一个测试名里的 “revm27” 误匹配（`evm/context.rs:1322`）；`gh search issues evm2 --owner megaeth-labs` 为空 [17]。
- RealiCZ：mega-evm 最近 50 个提交中 26 个出自 RealiCZ [17]；evm2 issues #386/#387/#388（2026-09-01）：#387 “we prototyped porting an OP-stack-style L2 (custom gas accounting layered on `LOG*`, the `CALL` family, `SELFDESTRUCT`, ...) onto evm2 … the whole `LOG` implementation just to add a second gas dimension”，#388 “an L2 we prototyped adds a calldata surcharge on both the intrinsic and the floor side” [18]。
- megaeth-labs/revm fork（bluealloy/revm 的 fork）：PR #56 “The fork was set up as upstream `v112` plus fork commits … crate versions stay at the revm version the MegaETH node pins (`40.0.3` today)”；#66（RealiCZ）提到“how alloy-rs/evm2 backports revm precompile work”作为 cherry-pick 流程参照；#74 “a switch to run the journal with revm 40.0.3's journal semantics”；#76（2026-10-22）“instruction and frame-loop hooks, and resource pools …” [19]。

**不确定之处**
- RealiCZ 的 issue 是否代表公司层面的迁移评估，还是个人原型，无法确认（台账 A27 标 inferred/speculative）。
- “MegaETH 有内部迁移计划”**未公开，无法核实**。公开动作（自建 revm fork 加 hooks）反而显示短期仍在加深 revm 投入。

## A-Q5 其他采用信号与 revm 维护状态

**答案**：GitHub 代码检索（只覆盖默认分支）能看到依赖 evm2 的仓库只有 base/base、paradigmxyz/reth、paradigmxyz/reth-core、paradigmxyz/solar 和 refcell/base-era，另有未合并分支（Foundry draft、Tempo PR、tempoxyz/zones#1463）；外部 L2（MegaETH、RISE）只停留在提 issue/原型层面。revm 仍在维护——约每月一次 release，rakita 与 Derek Cofausper 等仍在提交——但维护者明显与 evm2 团队重叠，且 **revm 仓库内没有任何“将被 evm2 取代”的官方表述**；它的 README 仍把 Reth、Foundry 列为用户，而 reth main 已不再依赖 revm。

**依据**
- `gh search code "alloy-rs/evm2" --filename Cargo.toml`：base/base、paradigmxyz/reth、paradigmxyz/reth-core（rev df9d3445）、paradigmxyz/solar（`Cargo.toml:144`，rev 9b037449）、refcell/base-era（3 个 Cargo.toml）[20]。`DaniPopes/evm2` 检索只命中 evm2 本身与 reth patch [20]。
- evm2 外部 issue 提交者：RealiCZ（@megaeth-labs）、Akagi201（@longcipher，提并行执行/warm-up 读集合相关 issue #639/#640）、weiihann（#542 并行调用下共享 `Bytecode` Arc 的竞争）——说明已有外部团队在评估并行执行场景 [18][23]。
- revm release（`gh release list -R bluealloy/revm`）：v109–v111（revm 40.0.x，2026-05-26）、v112–v115（40.0.3→42.0.1，2026-07-23）、v116（43.0.0，08-26）、v117（08-28）、v118–v120（43.0.1→43.0.3，09-24）[21]。
- revm 提交（`bluealloy_revm@ee9ab3f`，浅克隆覆盖 2026-08-14 起的 50 个提交）：rakita 16、Derek Cofausper 13、Matthias Seitz 3、DaniPopes 1（`95463eb` 10-14）；rakita 在 revm 的最近提交为 `57671c4` 2026-09-28 [21]。
- `gh search issues/prs evm2 --repo bluealloy/revm` 只命中普通功能 PR，无弃用/迁移讨论；Discussions 最近一条为 2025-02 [21]。`README.md:17,41-42@ee9ab3f` 仍写 “It is integrated into Reth …”，用户列表含 Reth、Foundry [21]。
- revmc 仍在维护（最后提交 `6860b6f` 2026-10-09，未归档），但其代码已被移植进 evm2 `crates/jit`（PR #207）[5]。

**不确定之处**
- GitHub code search 不索引非默认分支和私有仓库，依赖面可能被低估；GitHub “Used by/dependents” 不适用于 git 依赖。
- revm 会否在 reth 迁走后进入维护模式，没有官方表态，属开放问题。

---

## 资料中被修正的地方（GPT Deep Research §8 及相关结论）

1. **遗漏/过时：reth 已在 main 上用 evm2 替换 revm。** GPT 全文把 evm2 写成“高潜力、低成熟度”、只讨论 Base 的并行接入，没有提到 paradigmxyz/reth#25002 已于 2026-10-24 合并入 main、reth main 的 Cargo.lock 中已无 revm/alloy-evm/op-revm。修正：reth（main，未发布）已完成依赖切换；已发布版本（≤ v2.8.1）仍是 revm [8][9]。
2. **Base revm 版本过时**：GPT 写 `revm = "42.0.1"`；base/base@bcd96e2 为 `revm = "43.0.3"`（`Cargo.toml:304`）。evm2 pin `9b037449…` 与 GPT 一致 [12]。
3. **Base “docs index” 出处不准、内容部分过时**：GPT 称 Base 官方文档索引描述 evm2 为“mirror stock Ethereum 的 scaffold”。在 bcd96e2 的 docs/AGENTS.md/CLAUDE.md 中找不到该索引；同义表述来自 `crates/common/evm2/README.md`，而且“mirroring the stock Ethereum configuration”已过时——crate 已实现 deposit、L1/operator fee、区块执行器、转换块 hooks 与多组 parity 测试（PR #4759~#4805）。“未接入节点、用于差分测试”这一核心结论仍正确 [12][13]。
4. **RISE 需求条数自相矛盾**：GPT §8.2 说“三类需求”却列了 4 条；原文（pevm#382）是一句话里的 thread-safe types/states、native caches and instrumentation、no overheads for lazy、避免 sequential-first 外部实现的开销与类型转换 [15]。
5. **RISE 因果链表述需加限定**：GPT 列出的 “parallel-aware state + custom scheduler 共同产生收益” 不在推文中；推文只归因于 register optimizations、op-code fusions、smart inlining、caching，并说 Parallel EVM 是“在这个核心之上继续 build up”。2× 是整节点 payload latency p95（1 小时窗口）而非 VM 微基准——GPT 未说明测量口径 [2]。
6. **“降级 revm 版本”说法（用户原始笔记）无证据**：pevm 依赖历史全为升级；GPT 正确否定了这一点，本文补上了版本历史证据 [14]。
7. **MegaETH “无公开迁移证据”需补充**：结论本身正确，但 GPT 漏掉了 MegaETH 工程师在 evm2 上提 issue、自述原型移植 OP-stack 风格 L2 的信号，以及 MegaETH 自建 revm fork（v112 基线、cherry-pick 流程、hooks）的事实 [18][19]。
8. **GPT §先给结论第 4 点**“evm2 没有正式 release”正确；补充：crates.io 上 `evm2` 名称已于 2026-10-23 由 DaniPopes 占位（0.0.0-reserved），提示正式发布临近（inferred）[4]。

## 来源

1. **PRIMARY** gakonst 推文 https://x.com/gakonst/status/2114190575486538225（经 `curl -s https://api.fxtwitter.com/status/2114190575486538225`，2026-10-25）——证明推文原文、时间 2026-10-25 03:01:27 UTC、未点名 evm2。
2. **PRIMARY** hai_rise 推文 https://x.com/hai_rise/status/2112498280294924768 及配图 https://pbs.twimg.com/media/HVEXdrJasAAzrsp.jpg（2026-10-25 访问）——证明 RISE 说的是“下游化为 RISE VM”，2× 指 payload latency p95（248 ms vs 123 ms，1 小时窗口）。
3. **PRIMARY** alloy-rs/evm2 @ c8bb5a2（README.md:7、AGENTS.md:3-10、crates/jit/README.md、.github/workflows/cyclops-audit.yml、全量 git log、提交 06ee806）——证明维护者构成、rakita 为 CODEOWNER、定位为 revm 重实现、WIP、仓库内无审计报告。
4. **PRIMARY** `gh api repos/alloy-rs/evm2`、`gh release list -R alloy-rs/evm2`、https://crates.io/api/v1/crates/evm2 及 /owners ——证明创建于 2026-04-30、无 release/tag、crates.io 名称 2026-10-23 被 DaniPopes 占位。
5. **PRIMARY** alloy-rs/evm2 PR #207（提交 fb556dc，2026-06-27）——证明 evm2 JIT 是 revmc 的移植。
6. **PRIMARY** alloy-rs/evm2 PR #731、#734、#598、#746——证明 2026-10 修复了 SIGP-358/SIGP-371 等“audit fixes”。
7. **PRIMARY** tempoxyz/tempo PR #8320——证明存在一轮“integration audit”，修复项编号 SIGP-354，于 2026-10-14 合入 evm2 集成分支。
8. **PRIMARY** paradigmxyz/reth PR #25002（及 #28079、#28098、#28127）与本地 paradigmxyz_reth @ f90ed27（Cargo.toml:441-443、674-679；bin/reth/Cargo.toml:89-100；crates/node/core/src/args/jit.rs:12；Cargo.lock）——证明 reth main 于 2026-10-24 用 evm2 替换 revm，JIT 默认编译、运行时默认关闭。
9. **PRIMARY** `gh release list -R paradigmxyz/reth`——证明最新发布 v2.8.1（2026-10-23）早于 evm2 合并。
10. **PRIMARY** foundry-rs/foundry PR #17541（draft）及 #17740/#17747/#17764、foundry-rs/book #2150——证明 Foundry 的 evm2 迁移仍在 draft，parity 修复与基准页面在进行中。
11. **PRIMARY** tempoxyz/tempo PR #7871 与 tempo main Cargo.toml（`gh api repos/tempoxyz/tempo/contents/Cargo.toml`，:291、:301）——证明 Tempo 迁移 PR 未合并，main 仍用 revm 43.0.3。
12. **PRIMARY** base/base @ bcd96e2（Cargo.toml:169,304,310,333,350；crates/common/evm2/{Cargo.toml,README.md,src/lib.rs,src/executor.rs:121,tests/}；crates/common/evm/{README.md,src/factory.rs}；crates/execution/node/src/node.rs:793）——证明 evm2 crate 未接入节点、节点仍走 revm。
13. **PRIMARY** base/base PR #4693、#4788（关闭的 spike 与路线图）、#4803 及 `gh pr list -R base/base --search evm2`——证明 Base evm2 工作集中在 2026-08-26~09-09，节点集成待 reth bridge。
14. **PRIMARY** risechain/pevm @ e94b0e3（README.md:5、Cargo.toml:57-58、`git log -p -- Cargo.toml` 全历史）——证明 pevm 为 WIP、revm 版本只升不降。
15. **PRIMARY** risechain/pevm issue #382 及评论——证明 RISE 2024 年就以“revm 是 sequential-first、开销与类型转换过多”为由计划自有 EVM。
16. **PRIMARY** `gh repo list risechain`、risechain/risechain @ 2c2c6f2、risechain/revm 分支提交——证明 RISE VM 未开源、RISE 的 revm fork 已停更。
17. **PRIMARY** megaeth-labs/mega-evm @ 821577d（Cargo.toml:139-146；docs/spec/overview.md:13-14,46-47；crates/mega-evm/src/{evm/mod.rs:91-98, evm/instructions.rs:180, limit/mod.rs:27, limit/limit.rs:73, access/tracker.rs:65, evm/context.rs:69,83}）——证明 MegaEVM 基于 revm 40.0.3/op-revm 及其扩展点。
18. **PRIMARY** alloy-rs/evm2 issues #386/#387/#388（RealiCZ）及 #542、#639、#640——证明 MegaETH 工程师已原型移植 L2 到 evm2、外部团队在评估并行场景。
19. **PRIMARY** megaeth-labs/revm PR #56、#66、#74、#76——证明 MegaETH 维护以 revm v112 为基线的 fork 并持续加 hooks。
20. **PRIMARY** `gh search code "alloy-rs/evm2" --filename Cargo.toml`；paradigmxyz/solar Cargo.toml:144；paradigmxyz/reth-core Cargo.toml:33；mablr/evm2-networks；refcell/base-era——证明 evm2 的已知依赖面。
21. **PRIMARY** bluealloy/revm @ ee9ab3f（README.md:17,41-42、git log）及 `gh release list -R bluealloy/revm`——证明 revm 约月度发布、仍活跃，且无“被 evm2 取代”表述。
22. 二手：research/gpt-deep-research.md §8 与“先给结论”（ChatGPT Deep Research，2026-10-25）——仅作线索。
23. **PRIMARY**（自填资料）GitHub 用户资料 `gh api users/<login>`（DaniPopes、onbjerg、mattsse、klkvr、decofe、gakonst、refcell、RealiCZ、hai-rise、Akagi201）——证明各贡献者自报所属组织。

## 开放问题

1. gakonst 所说的审计由谁执行、范围是 evm2 本体还是 reth/tempo 集成、报告是否会公开？
2. 带 evm2 的 reth 何时正式发布（v2.9？），JIT 何时从 `--jit` 默认关闭变为默认开启？
3. revm 在 reth 迁出后的定位：rakita 是否会把精力转到 evm2，revm 会否进入维护模式？目前无官方表态。
4. Base 何时把自己的 reth fork 升到含 evm2 的版本并接入 `base-common-evm2`？EIP-8130 在 evm2 路径何时支持？
5. op-revm / OP Stack 生态（含 Mantle 依赖的 op-reth/kona 链路）是否会有官方 evm2 版本？目前只看到第三方 `mablr/evm2-networks`。
6. RISE VM 是否会开源、基于哪个 revm 版本、2× 的测试条件是什么？
7. MegaETH 的 evm2 原型是否会转为正式迁移？

---

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| A1 | gakonst 于 2026-10-25 03:01 UTC 发推称“新 EVM 刚完成审计、内置 JIT、将成为 Foundry/Reth/Tempo 的未来”，但推文没有点名 evm2。 | [1] fxtwitter 返回的 text 字段 | observed |
| A2 | alloy-rs/evm2 仓库创建于 2026-04-30，公开，截至 2026-10-25 没有任何 GitHub release 或 tag。 | [4] `gh api repos/alloy-rs/evm2`、`gh release list` 为空 | observed |
| A3 | crates.io 上的 `evm2` 包名于 2026-10-23 由 DaniPopes 以 0.0.0-reserved 占位，尚无可用版本。 | [4] crates.io API /crates/evm2 与 /owners | observed |
| A4 | evm2 的 791 个提交中 DaniPopes 贡献 477 个，其余主要来自 onbjerg、Derek Cofausper、Matthias Seitz、rakita、Arsenii Kulikov 等 Paradigm/Tempo 相关工程师。 | [3] `git log --format='%an' \| sort \| uniq -c`@c8bb5a2（unshallow 后）；[23] | observed |
| A5 | revm 作者 rakita 自 2026-06-05 起被列为 evm2 的 CODEOWNER，并已提交 28 个 commit。 | [3] `alloy-rs_evm2` 提交 06ee806（.github/CODEOWNERS）；git log | observed |
| A6 | evm2 官方定位是 revm 的重新实现，处于 WIP 阶段，不承诺 API 稳定。 | `alloy-rs_evm2/AGENTS.md:3-10@c8bb5a2` | observed |
| A7 | evm2 的 JIT/AOT（crates/jit）是 2026-06-27 从 paradigmxyz/revmc 移植而来。 | `alloy-rs_evm2` 提交 fb556dc（PR #207）；[5] | observed |
| A8 | reth PR #25002“refactor!: replace revm with evm2”已于 2026-10-24 09:15 UTC 合并入 reth main，此时 reth 的 Cargo.lock 中已没有 revm、alloy-evm、op-revm。 | [8] `paradigmxyz_reth/Cargo.toml:441-443@f90ed27`；Cargo.lock grep 无 `name = "revm` | observed |
| A9 | gakonst 推文所说的“新 EVM”极大概率就是 evm2。 | 由 A1、A4、A7、A8、A12、A13 推出：维护团队、JIT 能力、“reth/foundry/tempo”三方迁移 PR 与推文时间（reth 合并后约 18 小时）完全吻合 | inferred |
| A10 | reth main 默认把 evm2 JIT 编译进二进制，但运行时 `--jit` 默认关闭。 | `paradigmxyz_reth/bin/reth/Cargo.toml:89-100@f90ed27`；`crates/node/core/src/args/jit.rs:12@f90ed27` | observed |
| A11 | 截至 2026-10-25，还没有任何已发布的 reth 版本包含 evm2，最新的 v2.8.1（2026-10-23）早于该合并。 | [9] `gh release list -R paradigmxyz/reth` | observed |
| A12 | Foundry 的“migrate from revm to evm2”PR（#17541）仍是 draft，依赖 mablr 的 evm2 分支和 evm2-networks（OP/Base/Monad）。 | [10] foundry-rs/foundry#17541 状态与描述 | observed |
| A13 | Tempo 的“replace revm with evm2”PR（#7871）仍未合并，Tempo main 仍依赖 revm 43.0.3 和 alloy-evm 0.39.0。 | [11] tempoxyz/tempo#7871；tempo main Cargo.toml:291,301 | observed |
| A14 | 2026-10 期间，evm2/reth/tempo 修复了一批编号为 SIGP-xxx、被称为“integration audit fixes”的审计发现项。 | [7] tempo#8320 描述；[6] evm2 #731“Fixes SIGP-371”、#598 引用 SIGP-358 | observed |
| A15 | evm2 仓库内没有审计报告；唯一的“audit”相关文件是一个调用 tempoxyz/gh-actions 的自动化 PR 审查（agentic-audit）CI 工作流。 | `alloy-rs_evm2/.github/workflows/cyclops-audit.yml:1-38@c8bb5a2`；`find -iname '*audit*'` | observed |
| A16 | SIGP 前缀的审计发现项可能来自 Sigma Prime，但审计方身份与范围均未公开。 | 仅由 Linear issue key 前缀推测（[6][7]），无报告 | speculative |
| A17 | Base 的 workspace 同时依赖 revm 43.0.3 和 git pin 的 evm2（rev 9b03744，2026-08-24，比 evm2 main 落后约两个月）。 | `base_base/Cargo.toml:304,310@bcd96e2`；`alloy-rs_evm2` git log 9b03744 | observed |
| A18 | Base 的 `base-common-evm2` crate 没有被 workspace 内任何其他 crate 依赖，而 revm 版 `base-common-evm` 被 node、payload、builder、txpool、proof 等 20+ crate 依赖。 | [12] `grep -rln base-common-evm2 --include=Cargo.toml`@bcd96e2 | observed |
| A19 | Base 节点当前执行路径是 `BaseEvmConfig` → `BaseEvmFactory`（alloy-evm + revm）。 | `base_base/crates/execution/node/src/node.rs:793@bcd96e2`；`crates/common/evm/src/factory.rs:1-3,62@bcd96e2` | observed |
| A20 | `base-common-evm2` 自述“intentionally not wired into the node”，目的是在上游 alloy-evm/reth 的 EVM2 bridge 落地前与 revm 引擎做差分测试。 | `base_base/crates/common/evm2/README.md:15-18@bcd96e2`；Cargo.toml:31-44 | observed |
| A21 | Base 的 evm2 crate 已实现区块执行器、deposit、L1/operator fee、转换块 hooks，并带多组与 revm 对比的 parity 测试，但尚不支持执行 EIP-8130 交易。 | `base_base/crates/common/evm2/src/lib.rs`、`src/executor.rs:121`、`tests/*_parity.rs`@bcd96e2；[13] #4803 | observed |
| A22 | Base 的 evm2 开发集中在 2026-08-26 至 09-09（约 15 个 PR），“驱动到完成”的 spike #4788 已关闭未合并，其路线图把“接入节点”列为未完成的最后阶段。 | [13] `gh pr list -R base/base --search evm2`；#4788 正文 Phase 7 | observed |
| A23 | Base 对 evm2 的状态应表述为“并行开发＋差分测试，尚未切换”。 | 由 A18、A19、A20、A22 推出：crate 无下游依赖、节点仍走 revm、官方自述未接入 | inferred |
| A24 | Base 接入 evm2 的前置条件（reth 的 evm2 bridge）直到 2026-10-24 才进入 reth main，而 Base 自己的 reth fork 仍停在 base-v2.7.0.2。 | 由 A8、A20 与 `base_base/Cargo.toml:350-361@bcd96e2` 推出 | inferred |
| A25 | hai_rise 推文说的是把 revm 下游化为自有 RISE VM，2× 指整节点 payload 延迟 p95（1 小时窗口内 revm 均值 248 ms 对 RISE VM 123 ms），未给出硬件、负载或 revm 版本。 | [2] 推文正文与配图 | observed |
| A26 | RISE 早在 2024-10 就在 pevm#382 中表示 revm 作为 sequential-first 外部实现带来过多开销和类型转换，计划做并行优先的自有 EVM。 | [15] risechain/pevm#382 正文与 hai-rise 评论 | observed |
| A27 | pevm 的 revm 依赖只有升级、没有回退：从自有 fork 到 19.4.0（2025-11），再到 2026-04-26 的 38.0.0。 | [14] `risechain_pevm` `git log -p -- Cargo.toml`；`Cargo.toml:57-58@e94b0e3` | observed |
| A28 | “RISE 因 revm 升级后性能下降而降级版本”这一说法在公开仓库中找不到任何证据，应视为误传。 | 由 A25、A27 推出：推文讲下游化，版本历史无回退 | inferred |
| A29 | RISE VM 尚未开源：risechain 组织下没有 VM 仓库，monorepo 只开源了 primitives，其 revm fork 停在 2025 年初。 | [16] `gh repo list risechain`；`risechain_risechain@2c2c6f2`；risechain/revm 分支提交日期 | observed |
| A30 | pevm 自称 WIP、未达生产可用，最后一次提交在 2026-06-05。 | `risechain_pevm/README.md:5@e94b0e3`；git log | observed |
| A31 | MegaEVM 公开代码固定依赖 revm =40.0.3、来自 optimism 仓库 git rev 的 op-revm 和 alloy-evm =0.36.0。 | `megaeth-labs_mega-evm/Cargo.toml:139-146@821577d` | observed |
| A32 | MegaETH 规范明确写明参考实现“built on revm and op-revm”，并以 Optimism Isthmus（Prague）为语义基线。 | `megaeth-labs_mega-evm/docs/spec/overview.md:13-14,46-47@821577d` | observed |
| A33 | MegaEVM 在 revm 之上加入了多维资源限制（compute gas、data size、KV updates、state growth）、volatile data access tracking 和 gas detention，并通过包裹 revm 的 `Evm` 与 `EthInstructions` 实现。 | `crates/mega-evm/src/evm/mod.rs:91-98`、`evm/instructions.rs:180`、`limit/limit.rs:73`、`limit/mod.rs:27`、`access/tracker.rs:65`@821577d | observed |
| A34 | MegaETH 的公开代码与 issue 中没有任何 evm2 依赖或迁移计划。 | [17] `grep -rni evm2`（仅误匹配 context.rs:1322）；`gh search issues evm2 --owner megaeth-labs` 为空 | observed |
| A35 | mega-evm 的主要提交者 RealiCZ（GitHub 公司字段 @megaeth-labs）于 2026-09-01 在 evm2 提 issue，自述已原型把一个“OP-stack 风格、在 LOG/CALL/SELFDESTRUCT 上叠加第二 gas 维度”的 L2 移植到 evm2。 | [18] alloy-rs/evm2#387、#388；[17] mega-evm git log；[23] | observed |
| A36 | MegaETH 至少在工程师层面评估过 evm2，但公开层面仍在加深 revm 投入（自建以 v112 为基线的 revm fork 并添加 hooks），公司级迁移计划未公开、无法核实。 | 由 A34、A35 与 [19] megaeth-labs/revm #56、#76 推出 | inferred |
| A37 | MegaETH 已有内部 evm2 迁移计划。 | 无公开来源（brief 中的“据说”） | speculative |
| A38 | 在默认分支上声明依赖 evm2 的公开仓库只找到 base/base、paradigmxyz/reth、reth-core、solar 和 refcell/base-era。 | [20] `gh search code "alloy-rs/evm2" --filename Cargo.toml` | observed |
| A39 | revm 仍在维护：2026-05 至 09 每月左右发布一次（最新 v120/revm 43.0.3，2026-09-24），rakita、Derek Cofausper 等仍在提交。 | [21] `gh release list -R bluealloy/revm`；`bluealloy_revm` git log@ee9ab3f | observed |
| A40 | revm 仓库中没有任何“revm 将被 evm2 取代”的官方表述，README 仍把 Reth 和 Foundry 列为用户。 | `bluealloy_revm/README.md:17,41-42@ee9ab3f`；`gh search issues/prs evm2 --repo bluealloy/revm` | observed |
| A41 | revm 与 evm2 的核心维护者高度重叠（rakita、DaniPopes、Matthias Seitz、Derek Cofausper 在两边都有提交），revm 后续投入可能下降。 | 由 A4、A5、A39 推出前半句；“投入下降”无官方来源 | speculative |

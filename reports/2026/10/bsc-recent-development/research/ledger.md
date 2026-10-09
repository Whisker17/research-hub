# 论断台账

每条会出现在 explainer 里的论断，都要在这里有一行。
类型：observed（直接观察到，有一手证据）/ inferred（由证据推出）/ speculative（推测，需在页面上标明）。

本表合并三路调研的台账，前缀对应分册：
- **C** → `notes-cas20.md`（CAS20 / BEP-702 与 Base B20）
- **P** → `notes-payment.md`（Payment Lane / BEP-703 与 Tempo）
- **J** → `notes-jenner.md`（Jenner 其他功能、BEP-675、上游同步、reth-bsc、BAP-710、进度）
- **S** → 主会话综合（`notes.md` §综合），只由 C / P / J 行推出

证据里的 `[n]` 指该分册“来源”一节的第 n 条；`notes §x` 指该分册的对应小节。固定版本：bsc `8cc60b246c`、reth-bsc `349f55c`、BEPs `e9b2be3b00`、base-std `a2954a8d57`、base `f1f40baf23`、tempo `feb5dff7da`；网页访问日期 2026-10-09。

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| C1 | BEP-702 状态为 Draft，头部 Created 2026-07-16；BEPs#702 于 2026-09-11 合并 | `BEPs/BEPs/BEP-702.md:1-8@e9b2be3b00`；来源 [3] | observed | P |
| C2 | BEP-702 的动机：BEP-20 只是 ABI 约定，不保证行为；面向稳定币和代币化 RWA；把合规原语、重新计价、状态访问计价放进协议 | BEP-702 §1、§2（来源 [1]） | observed | J |
| C3 | Asset 的 decimals 在 [6,18] 内，带 multiplier / announce / batchMint / extraMetadata / OPERATOR_ROLE；Stablecoin 的 decimals 固定为 6，currency 非空、只能是 A–Z、不可变，且只是自我声明 | BEP §3.5、§3.12、§3.13；`bsc/core/vm/cas20_factory.go:258-286@8cc60b246c` | observed | J |
| C4 | 单例地址：Factory `0xCA5F00…00`、ActivationRegistry `0x7020…01`、PolicyRegistry `0x7020…02`；CAS20 地址不会被预热 | `bsc/core/vm/cas20.go:20-23`；BEP §3.1、§3.14 | observed | J |
| C5 | 代币地址 = `0xCA52` ‖ 8 个零字节 ‖ 变体（00=Asset / 01=Stablecoin）‖ `keccak256(abi.encode(creator,salt))[:9]` | `bsc/core/vm/cas20_factory.go:39-47`；`cas20.go:11-18`；BEP §3.3 | observed | J |
| C6 | `StatefulPrecompiledContract` = RequiredGas + RunStateful(ctx)；CAS20 的 RequiredGas 恒为 0，所有计费在 RunStateful 内进行 | `bsc/core/vm/contracts_stateful.go:13-20, 161-187`；`cas20.go:149-150`；BEP §3.2 | observed | J, F1 |
| C7 | EVM 先查静态 precompile 表，Jenner 后再按地址前缀解析 CAS20；用类型断言把调用转到 stateful 路径 | `bsc/core/vm/evm.go:46-80@8cc60b246c` | observed | J |
| C8 | DELEGATECALL / CALLCODE 报 DelegateCallNotAllowed，携带 value 报 NonPayable，STATICCALL 中的写操作报 StaticCallNotAllowed，三者都是 ABI revert，不是 halt；写点处另有兜底 | `bsc/core/vm/cas20.go:88-100`；`cas20_errors.go:39-63`；`cas20_gas.go:59-62, 81-84`；BEP §3.2 | observed | J |
| C9 | 代币和 registry 账户都带一字节代码 `0xEF`，用于防止 EIP-161 清理账户与 storage；EIP-3541 保证它不可伪造；存在性按 code hash 精确比较 | `bsc/core/vm/cas20_factory.go:33-35`；`cas20.go:62-70`；BEP §3.16、§4.9 | observed | J |
| C10 | CAS20 的状态写在代币账户自己的 storage 里（ERC-7201 命名空间 `bsc.cas20*`），因此进入 state root；不写 nonce 和余额 | `bsc/core/vm/cas20_storage.go:10-50, 140-146`；BEP §3.17 | observed | F1, B-2 |
| C11 | 当前代码的创建顺序：激活检查 → 参数与 version 校验 → 派生地址 → 占用检查 → 写 0xEF → 身份 storage → CAS20Created → 授予 initialAdmin → initCalls | `bsc/core/vm/cas20_factory.go:109-219@8cc60b246c` | observed | J Fig 3 |
| C12 | bsc#3826（2026-09-23 合并）把 CAS20Created 提到 admin 授权和 initCalls 之前，并把 bootstrap 的 msg.sender 从 creator 改成 Factory | 来源 [5]：commit `37417a05` 的 diff 与 PR 正文；`cas20_factory_test.go:242` | observed | F3 |
| C13 | BEP-702 master 仍写“CAS20Created 最后发出、initCalls 中 msg.sender 是 creator、SEIZE_HOLDER_POLICY”；修订 PR BEPs#716 截至 2026-10-09 为 open | BEP §3.4、§3.8（来源 [1]）；`gh api repos/bnb-chain/BEPs/pulls/716` → state open（来源 [6]） | observed | F3 |
| C14 | bootstrap 窗口跳过角色检查和 transfer 侧三种策略，不跳过 MINT_RECEIVER、pause、supply cap 和防复活检查 | `bsc/core/vm/cas20_token.go:14-16, 214, 246`；`cas20_admin.go:360-382`；BEP §3.4 | observed | J |
| C15 | transfer 顺序：pause → 零地址 → sender 策略 → receiver 策略 → 余额；transferFrom 在零地址之后插入 allowance → executor 策略（spender==from 时跳过）；这个顺序属于共识 | `bsc/core/vm/cas20_token.go:175-269`；BEP §3.6 “Check order” | observed | J Fig 4 |
| C16 | 每个代币有 6 个策略槽，默认 0=ALWAYS_ALLOW；PolicyRegistry 有 BLOCKLIST / ALLOWLIST / UNION / INTERSECT（复合策略 2–4 个子策略）；isAuthorized 从不 revert；单批最多 64 个地址；写操作受 bsc.policy_registry 门控 | `bsc/core/vm/cas20_admin.go:37-42`；`cas20_policy.go:20-24, 168-198, 366-377`；BEP §3.8 | observed | J |
| C17 | 内置角色：DEFAULT_ADMIN / MINT / BURN / SEIZE / PAUSE / UNPAUSE / METADATA（Asset 另有 OPERATOR）；不能撤掉最后一个 admin；renounceLastAdmin 不可逆，之后角色成员关系冻结 | BEP §3.7；`bsc/core/vm/cas20_admin.go:368-382` | observed | J |
| C18 | seize 需要 SEIZE_ROLE 且 SEIZE 未暂停；只有不被 SEIZE_EXEMPT_POLICY 授权的持有人可被扣押，默认没有人可被扣押；totalSupply 不变；依次发出 Transfer、Memo、Seized | `bsc/core/vm/cas20_admin.go:506-552@8cc60b246c`；BEP §3.6、§3.8 | observed | J |
| C19 | bsc#3829（2026-09-23）把 SEIZE_HOLDER_POLICY 改名为 SEIZE_EXEMPT_POLICY，scope 哈希改变、slot 14 不变、不保留别名；base-std 已于 2026-09-02 先做了同样的改名（#214） | 来源 [7]；base-std commit `607ef9a`（来源 [10]） | observed | K |
| C20 | memo 是 bytes32，`Memo` 事件紧跟主事件；`MemoFormatDeclared(formatId)` 是 BSC 独有的，B20 接口没有 | BEP §3.6；`rg -i formatId base-std/src base/crates/common/precompiles/src` 无结果 | observed | K |
| C21 | Asset 的 multiplier：scaled=⌊raw·m/1e18⌋；balanceOf 和转账都用 raw；m ≤ uint128.max；定时 multiplier 在读取时生效，不发事件；带 ERC-8056 别名 | `bsc/core/vm/cas20_asset.go:119-177`；BEP §3.12、§6.5 | observed | J |
| C22 | 原生计费复刻 EIP-2929 冷/热、EIP-2200 net metering（含 2300 sentry）、EIP-3529 退款；calldata 每次外部调用按 6 gas/字收一次；initCalls 和 announce 每项收 100+6 gas/字，不开调用帧、不做 63/64 预留 | `bsc/core/vm/cas20_gas.go:16-131`；`cas20.go:96`；BEP §3.14；BEPs commit `75ea9bf`、`794da11` | observed | F1 |
| C23 | #3813 新增 tracer hook OnStorageRead / OnAccountRead，让 prestate 和 access-list tracer 能看到原生访问；state override 通过 DisabledPrecompile 关闭路由；提供 eth_getCAS20TokenInfo 和 Batch（≤20） | `bsc/core/tracing/hooks.go:331-332`；`contracts_stateful.go:99-109`；`internal/ethapi/api_cas20.go:13-36`；`override/override.go:75-81` | observed | |
| C24 | 唯一的性能数据是 reth-bsc#512 的本地微基准：M1 Pro 上单线程 transfer 1.315 µs；PR 明确说明不覆盖 BEP §3.14 要求的对抗性 / 整块计时测量；Go 侧没有 benchmark | 来源 [8] 的 PR 正文 Verification 与 “Not in this change” 节；`rg '^func Benchmark' bsc/core/vm/cas20*_test.go` 无结果 | observed | F1, Q |
| C25 | 激活分两层：治理经 GovHub `0x…1007` 调 `updateParam("admin", 20 字节非零值)` 任命 admin，admin 再 activate / deactivate；admin 不能自己换人 | `bsc/core/vm/cas20_activation.go:82-87, 144-210`；`params/protocol_params.go:247-256`；BEP §3.15 | observed | J, F4 |
| C26 | feature id 为 keccak256("bsc.cas20_asset" \| "bsc.cas20_stablecoin" \| "bsc.policy_registry")，fork 时全部关闭，admin 为空 | `bsc/core/vm/cas20_activation.go:24-28`；BEP §3.15 | observed | F4, F6 |
| C27 | 开关只门控 createCAS20 和 PolicyRegistry 的写操作，已有代币的操作和所有读取都不查 registry；关闭 policy_registry 会冻结共享名单 | BEP §3.15 表与 §6.2；`bsc/core/vm/cas20.go:189-200` | observed | F4 |
| C28 | bsc 只在跨越 Jenner 的区块开头（atBlockBegin + IsOnJenner）给两个 registry 种 0xEF；genesis 已在 Jenner 的链不会触发；BEP master 要求在 genesis 里放哨兵，BEPs#716 提议撤回这一要求；hashdit 在 #3813 上把它标为 HIGH | `bsc/core/systemcontracts/upgrade.go:1158-1163`；`params/config.go:1483-1490`；来源 [4]、[6]；BEP §3.15 | observed | F3 |
| C29 | bsc 的 mainnet 和 Chapel 配置中 JennerTime 为 nil；官方计划测试网 2026 年 10 月下旬、主网 11 月下旬，release 尚未发布；reth-bsc 只排了 QANet（2026-10-05 05:00 UTC） | `bsc/params/config.go:256, 311`；来源 [11]；`reth-bsc/src/hardforks/bsc.rs:231-232, 415-425` | observed | P, F11 |
| C30 | 截至 2026-10-09，没有任何 bsc 或 reth-bsc 的 release 包含 CAS20 | 由 C33、来源 [17] 推出：bsc 最新 v1.8.0-alpha（08-13）早于 #3813 合并（09-11），reth-bsc 最新 v0.1.2（08-20）早于 #512 合并（09-24） | inferred | F11 |
| C31 | bsc commit 57d98c2（2026-09-08，属于 PR #3813，squash 后不在 develop 历史中）把注释里的 base-std 改成“the standard”、IB20 改成 ICAS20、“the reference implementation's prefix (0xb2…)”改成“a neighbouring prefix” | 来源 [9]：`gh api repos/bnb-chain/bsc/commits/57d98c2` 的 patch 与 `/pulls` | observed | K, F2 |
| C32 | #3813 的首个实现 commit 13a9d22d9 还有 “base-std publishes”、“IB20 dispatch / views” 等注释，测试以 base-std 的已发布哈希为期望值 | 来源 [9]：`gh api …/commits/13a9d22d9` 的 patch | observed | K, F2 |
| C33 | bsc#3813 于 2026-09-11 合并，reth-bsc#512 于 2026-09-24 合并 | 来源 [4]、[8] 的 mergedAt | observed | E, P |
| C34 | B20 属于 Base Beryl（Sepolia 2026-06-18、主网 2026-06-25），Cobalt（Sepolia 09-23、主网 09-30）加入 seize、复合策略和 ERC-8056，Denim 尚未上主网 | 来源 [13] upgrades/overview；`base/crates/common/chains/src/config.rs:476-478, 551-553`；`base-std/CHANGELOG.md` | observed | K, B-5, C |
| C35 | B20 是 Rust precompile（base `crates/common/precompiles`）；CAS20 是 Go 实现（bsc `core/vm`），另有 Rust 移植版（reth-bsc） | 来源 [13] “implemented as Rust precompiles”；来源 [14]、[15]、[16] | observed | K, B-5 |
| C36 | CAS20 与 B20 的地址结构相同：都是 10 字节保留前缀 ‖ 变体字节 ‖ 9 字节 abi.encode 指纹，只有前缀不同（`0xB2`+9×00 对 `0xCA52`+8×00） | `base/…/b20_factory/variant.rs:24, 61-67, 124-127@f1f40baf23`；C5 | observed | K, F2 |
| C37 | CAS20 存储布局与 B20 逐字段相同（core slot 0–14、asset slot 0–4、打包 lane），只是命名空间串从 base.* 换成 bsc.*；feature id 也同构 | `base/…/common/core_storage.rs:13-97`；`b20_asset/storage.rs:14-33`；`activation/storage.rs:54-58`；`bsc/core/vm/cas20_storage.go:10-38` | observed | K, F2 |
| C38 | 接口函数名有 100 个相同；B20 独有 burnBlocked、BURN_BLOCKED_ROLE、invertedPolicyId；CAS20 独有 transferWithMemoFormat、transferFromWithMemoFormat、updateParam、variantOf | notes §C-Q7 的 `grep \| sed \| comm` 命令输出（base-std `src/interfaces/*.sol` 对比 BEP-702） | observed | K |
| C39 | bsc#3826 之后，CAS20 的创建顺序（事件 → admin 授权，sender=Factory → 以 Factory 为 caller 执行 initCalls）与 B20 实现一致；#3826 的正文没有提到 B20 | `base/…/b20_factory/logic/v1.rs:58-99`；`base-std/src/interfaces/IB20Factory.sol:102-104, 137-149`；来源 [5] | observed | K |
| C40 | 两者的差异：激活 admin（Base 用链配置的静态 admin，Cobalt 起现任 admin 可 setAdmin；BSC 由 GovHub 治理任命）、版本化（B20 按 fork 冻结版本，BSC 单一版本）、initCall 失败时 B20 冒泡内部原因而 BSC 一律报 InitCallFailed、B20 Denim 的三项改动 CAS20 都没有 | `base/…/activation/storage.rs:24-46, 140-166`；`base-std/docs/architecture.md` §3；`base/…/b20_factory/logic/v1.rs` 的 map_init_call_error；`bsc/core/vm/cas20_factory.go:208-213`；`cas20_token.go:214, 239-245`；`base-std/CHANGELOG.md` Denim 节 | observed | K, F2 |
| C41 | CAS20 的接口、架构和存储布局直接沿用 Base B20 / base-std 的设计，并持续跟进其规范变更（如 SEIZE_EXEMPT）；它不是“恰好相似的独立设计” | 由 C19、C31、C32、C36、C37、C38、C39 推出：开发痕迹直接引用 base-std / IB20，布局和接口逐项同构，并跟随 B20 改名和改顺序 | inferred | F2, C |
| C42 | CAS20 代码是接入 geth EVM 的 Go 实现，不是 Base Rust 代码的 fork | 由 C35、C40 推出：语言不同；内部结构不同（手写 ABI 与 cas20Storage，对比 Rust 宏和按 fork 冻结的版本）；没有共享源文件 | inferred | F2, C |
| C43 | BSC 开发者可能参照 base-std 的 Solidity mock（MockB20）或 Base 的 Rust 代码来写 Go 实现；BEP §3.14 的 “reference contract” 可能指某份 B20 参考合约 | 没有直接证据；仅凭 `base/…/core_storage.rs:83-84` 提到 “base-std mock”、BEP §3.1 / §3.14 的 “reference implementation / contract” 措辞推测 | speculative | F2, Q |
| C44 | reth-bsc#512 以 Go `057868dc` 加 BEPs#716 为基线移植全家族；145 步 golden fixture 逐步比对 returndata / status / gas / refund / logs 和最终 state root；648 个测试通过 | 来源 [8]；`reth-bsc/src/evm/precompiles/cas20/testdata/README.md@349f55c`；`cas20_golden.json` 中 steps=145 | observed | O |
| C45 | approve 不受暂停功能和策略约束：只检查零地址，然后写 allowance、发 Approval | `bsc/core/vm/cas20_token.go:156-173@8cc60b246c`（注释 “Neither the pause features (BEP-702 3.9) nor the policy scopes (3.8) name approve”）；BEP §3.8 | observed | J Fig 4 |
| C46 | CAS20 的角色、策略、扣押只作用于发行方自己的代币，不能作用于 BNB 或已有 ERC-20 | 由 C10、C16、C18 推出：这些权限只读写代币地址自己的 storage，路由只覆盖 0xCA52 前缀地址（C7） | inferred | J |
| P1 | BEP-703 为每个区块预留一部分 gas 给支付交易，普通交易即使在这部分空着时也不能使用 | BEP-703.md §1、§3.1（:38, 48-87）@e9b2be3b00 | observed | L, F5 |
| P2 | Lane 保证支付交易作为一类有 gas 可用，不承诺任何单笔交易被打包 | BEP-703.md:38 “does not promise that any one of them is included” | observed | F5 |
| P3 | BEP-703 不新增排序、优先级或费用规则，出块者保留选择和排序自由；不改交易格式和区块头 | BEP-703.md §3.3 :152；§5 :275 | observed | F5 |
| P4 | Lane 不提供 FIFO、抗审查或抗 MEV 保证 | 由 P2、P3 推出：出块者可自由选择和排序，单笔不保证纳入 | inferred | F5 |
| P5 | 分类顺序：系统交易 → to==nil → 类型∉{0,1,2} → 名单命中即 payment → value==0 → 有代码 → 否则 payment | BEP-703.md §3.2 伪代码；bsc/core/paymentlane/classify.go:34-58@8cc60b246c；reth-bsc/src/consensus/payment_lane/rules.rs:42-72@349f55c | observed | L Fig 5, F6 |
| P6 | 名单按地址登记，与调用的函数（selector）无关；只检查顶层 `to` | BEP-703.md §3.6.2 :227；classify.go:39-49 只读 tx.To() | observed | L, F6 |
| P7 | EIP-7702 delegation designator 算“有代码”；0x04 类型交易一律 general | BEP-703.md §3.2 条件说明、§4；classify.go:43-47,60-65；reth-bsc executor.rs:607-623 | observed | L, B-4 |
| P8 | 带 value 调用预编译会被归为 payment，规范不做特殊处理 | BEP-703.md §6 “Precompiles in the lane” | observed | |
| P9 | 当前规则下，带 calldata 的 BNB 转账只要接收方无代码就算 payment（“data 为空”条件已于 2026-08-31 删除） | BEP-703.md §3.2 无 data 条件；草案 fa7575b/3313043 有、f2314c7a 无（git show 比对） | observed | |
| P10 | 支付名单在 fork 时为空，USDT/USDC 只是预期的首批条目 | BEP-703.md §3.6.2 :227-231；PaymentLane.sol:62-63@2620fb411b | observed | L, F6, D |
| P11 | 系统合约 `PaymentLane` 位于 0x0000000000000000000000000000000000002007，由 Jenner 在激活块安装 | BEP-703.md §3.6.3 :237；bsc/core/systemcontracts/const.go:21、upgrade.go:1113-1145 | observed | F6 |
| P12 | 治理通过 GovHub 0x…1007 调用 `updateParam`，key 为 paymentLaneRatio / addPaymentContract / removePaymentContract | BEP-703.md §3.6.5 :259；PaymentLane.sol:91-116；SystemV2.sol:13,66-67 | observed | F6, B-1 |
| P13 | quota = ratio(h−1) × GasLimit(h) / 10000，向零截断，中间结果宽于 64 bit | BEP-703.md §3.4.1-3.4.2；paymentlane.go:60-71（bits.Mul64/Div64）；rules.rs:16-21（u128） | observed | B, L, F5 |
| P14 | ratio 默认 500（5%），守卫 0 < ratio ≤ 1000（10%，协议常量、不可治理）；存储值 0 表示未写，getter 返回 500，因此节点必须调用 getter | BEP-703.md §3.6.1、§3.6.3-3.6.4；paymentlane.go:25-28,51-58；PaymentLane.sol:42,51,97,128-131 | observed | B, F5 |
| P15 | 名单上限 100,000 项；合约写入时强制，节点读取时校验 | BEP-703.md §3.6.1；PaymentLane.sol:47,106；paymentlanemeta/loader.go:77-79 | observed | |
| P16 | 区块有效性条件 generalGasUsed + max(paymentGasUsed, quota) ≤ GasLimit；外部调研的 N+max(P,Q)≤G 正确 | BEP-703.md §3.3 :141-144；paymentlane.go:73-81；rules.rs:23-40 | observed | B, L, F5 |
| P17 | 该不等式等价于 N+P ≤ G 且 N ≤ G−Q | 由 P16 推出：分 P≥Q 和 P<Q 两种情况展开（与 BEP §3.3 “two regimes” 一致） | inferred | B |
| P18 | Parlia 系统交易的 gas 算 general；Go 用 Finalize 后的 gasUsed 做校验 | BEP-703.md §3.3；bsc/core/state_processor.go:186-202 | observed | B |
| P19 | 闲置配额不归还普通交易，理由是否则出块者排除支付交易没有任何代价 | BEP-703.md §4 :271 | observed | F5, B |
| P20 | 在 G=55,000,000 时 quota = 2,750,000（约 130 笔 BNB 转账或 45–78 笔稳定币转账） | BEP-703.md §3.4.4 :182-190；rules.rs:116 单测 | observed | L |
| P21 | 假设 G=100M、ratio=500：Q=5M；P=0、N=95.5M 的区块无效；P=8M、N=92M 的区块有效 | 由 P13、P16 推出：100M×500/10000=5M；95.5+5=100.5>100；92+8=100≤100 | inferred | L |
| P22 | ratio 和名单读父区块 post-state；code 检查读本交易执行前的实时状态 | BEP-703.md §3.2 :96-127；payment_lane.go:52-66,81-88；state_processor.go:97-106,159；reth-bsc payment_lane/mod.rs:14-24 | observed | L, B-4 |
| P23 | 激活块不受 lane 约束，activation+1 是第一个受约束的区块；Go 以 IsJenner(parent) 作为门槛 | BEP-703.md §3.4.3 :176-180；payment_lane.go:53；reth-bsc#497 描述 “from the activation block's child” | observed | |
| P24 | Jenner 激活块上 BidBlock 被拒绝，退回 SendBid（Go 和 Rust 都是） | bsc/miner/miner_mev.go:117-122；reth-bsc/src/rpc/mev.rs:702-715 | observed | M |
| P25 | 出块侧按声明 gasLimit 准入：普通交易须满足 tx.Gas() ≤ pool剩余 − idle，支付交易只须 ≤ pool剩余 | bsc/core/paymentlane/budget.go:11-21；miner/worker.go:965-971 | observed | M |
| P26 | 出块侧封块前对整块做 Verify（失败则拒绝封块）；SendBid 路径在 bid 模拟末尾做 VerifyPackedBid（idle > pool剩余 则拒绝该 bid） | miner/worker.go:1315-1318,1685-1688；miner/bid_simulator.go:1216-1220；payment_lane.go:105-114 | observed | M |
| P27 | SendBidBlock 路径封块前不检查 lane，广播后由本地 InsertChain 检查，违规则撤销 builder；本地状态不可读时不撤销 | BEP-703.md §3.5 :196；miner/bid_block.go:354-376 | observed | M, F8 |
| P28 | 违反 lane 的 BidBlock 会先被签名并广播，之后才被拒绝 | 由 P27 推出：handleBidBlockResult 处理的已是封好的块，先 mux.Post(NewSealedBlockEvent) 广播（bid_block.go:337,352），后 InsertChain（:366） | inferred | F8, M Fig 6 |
| P29 | Go 的 fast node（NoTries）跳过 lane 检查；Rust 没有这个豁免 | state_processor.go:97-103；bsc#3793 描述 “Fast-node behavior”；reth-bsc#497 描述 “does not add Geth-BSC's NoTries exemption” | observed | M, Q |
| P30 | 2026-09-01 官方博客描述的是动态预留（拥堵时扩张、回落时收缩），并称 USDT/USDC 有资格、验证者将对阈值和速度投票 | 来源 [17] 博客 TL;DR 与 “How BSC Payment Lane Works”、“What This Means For You” 段 | observed | F7 |
| P31 | 博客发布前的草案（3c210b5d，08-31）是动态累加器 quota，并用 header.UncleHash 承诺 quota 和 paymentGasUsed | git show 3c210b5d:BEPs/BEP-703.md §3.4、§3.5 | observed | F7 |
| P32 | 2026-09-08 的提交 10020317 删除了动态模型和 UncleHash 承诺，改为单一治理比例 | git show 10020317 --stat（+121/−337）；逐版 grep “Dynamic Quota”/“UncleHash” 计数从非 0 变为 0 | observed | F7 |
| P33 | “PaymentGasLimit” 在 BEP-703 的任何一版草案中都没有出现 | 对 18 个修订执行 grep -c PaymentGasLimit，结果全为 0（notes §来源 命令记录） | observed | F7 |
| P34 | BEP-703 于 2026-09-11 squash 合并（PR #703，41 commits），文件状态仍为 Draft | gh pr view 703 -R bnb-chain/BEPs → mergedAt 2026-09-11T06:01:36Z；BEP-703.md 头部 “Status: Draft” | observed | F7, P |
| P35 | bsc#3793 于 2026-09-11T05:57:02Z 合并（1580ed1d6，36 files +2555/−37）；reth-bsc#497 于 2026-09-23T03:04:09Z 合并（3404580，27 files +2180/−243），范围覆盖 rules/meta/state、executor、bid simulator、BidBlock import、Jenner 安装 | gh pr view 3793 -R bnb-chain/bsc --json mergedAt,mergeCommit；gh pr view 497 -R bnb-chain/reth-bsc --json mergedAt,files,body | observed | P, E |
| P36 | Payment Lane 尚未进入任何 bsc 或 reth-bsc release；BSC 主网和 Chapel 的 JennerTime 为 nil | gh release list（bsc v1.8.0-alpha 2026-08-13；reth-bsc v0.1.2 2026-08-20）；bsc params/config.go:256,311；reth-bsc hardforks/bsc.rs:415-425 | observed | F11 |
| P37 | 官方计划 Jenner 测试网 2026 年 10 月下旬、主网 11 月下旬，hard fork release 尚未发布；reth-bsc 在内部 QANet 把 Jenner 排在 2026-10-05 05:00 UTC | docs.bnbchain.org/announce/jenner-bsc/ “Upgrade Timeline”（2026-09-20，访问 2026-10-09）；reth-bsc/src/hardforks/bsc.rs:231-232@349f55c | observed | P, F11 |
| P38 | Tempo 的 payment lane 是对非支付交易的第二道 gas 约束，分类只看交易数据、不读状态，general_gas_limit 是区块头字段 | docs.tempo.xyz payment-lane-specification “Abstract”、§1；blockspace overview “Header fields” | observed | N, F9 |
| P39 | Tempo T1 起 general_gas_limit 固定为 30M，header 校验要求它等于期望值；T4 起 shared_gas_limit 为 0 | tempo/crates/hardfork/src/lib.rs:277-296、constants.rs:77、crates/evm/src/consensus/mod.rs:82-108@feb5dff7da | observed | N Fig 7, F9 |
| P40 | Tempo T5 起按 TIP-1045 分类（target + selector + ABI 白名单，access list 和授权列表须为空）；T5 之前只看 0x20c0 前缀 | tempo envelope.rs:245-301；block.rs:447-452；tips/tip-1045.md “Specification”、“Pre-T5” | observed | N, F9 |
| P41 | Tempo 主网（presto）的 T1/T4/T5 分别于 2026-02-12 / 2026-05-18 / 2026-06-09 激活；sub-block 机制在 T4 停用，代码已于 2026-09-10 删除 | tempo chainspec/src/genesis/presto.json t1Time/t4Time/t5Time；tips/tip-1046.md §9；commit ff8aa9784 | observed | N |
| P42 | Tempo 用 USD 稳定币付手续费，经原生 Fee AMM 转换；BSC 的 lane 不改费用 | tempo.xyz/developers/docs/protocol/fees.md；BEP-703.md §5 | observed | N, F9 |
| P43 | BSC 和 Tempo 的 lane 属于同一类设计：约束形式都是“general ≤ 上限 且 总量 ≤ gas limit”，但分类方式、参数来源和比例倾向不同 | 由 P17、P38、P39、P40 推出 | inferred | F9 |
| P44 | 没有证据表明 BSC Payment Lane 移植自 Tempo：BEP 全部修订和三个 PR 的评论中 “tempo” 均为 0 命中，Rust 实现自述对标 go-bsc | rg/grep 命令（notes §来源 命令记录）；reth-bsc payment_lane/mod.rs:4-5 | observed | F9, C |
| P45 | 砍掉动态模型的原因可能是 UncleHash 改动面太大，以及累加器分叉后无法重新收敛 | 草案 3c210b5d §3.4.3、§3.5.3 自述的风险；10020317 提交说明只有 “chore: simply model” | speculative | F7, Q |
| P46 | BEP-703 的动机：BSC 的 base fee 固定为 0（BEP-226），打包完全靠小费竞价，某类流量暴涨时支付交易最先被挤出 | `BEPs/BEPs/BEP-703.md:42@e9b2be3b00`（§2 Motivation） | observed | L |
| J1 | Jenner meta BEP-718 于 2026-09-20 合并，列出 BEP-702、703、706、714 四个需要硬分叉的 BEP | BEPs/BEP-718.md:27-37@e9b2be3；commit 992d8c8 | observed | A, O |
| J2 | 官方公告：Jenner 测试网 2026 年 10 月下旬、主网 11 月下旬，具体时间和 release 版本未公布 | https://docs.bnbchain.org/announce/jenner-bsc/ “Upgrade Timeline” | observed | H, E, P |
| J3 | Go 客户端中主网与 Chapel 的 JennerTime 均为 nil | bsc/params/config.go:256,311@8cc60b246 | observed | P, F11 |
| J4 | reth-bsc 只给 QANet 配了 Jenner：1791176400（2026-10-05 05:00 UTC）；PR #531 于 10-05 创建、10-09 合并 | reth-bsc/src/hardforks/bsc.rs:231-232@349f55c；gh pr view 531 | observed | P |
| J5 | QANet 已于 10-05 实际激活 Jenner | 仅有 #531 的配置，没有运行证据 | speculative | P, Q |
| J6 | 0x68 双签证据预编译从 Jenner 起计价为 10000 + 16×输入字节数，BEP-718 和公告均未列出 | bsc/core/vm/contracts.go:1983-1989；params/protocol_params.go:163-164；来源 [10] | observed | A, O |
| J7 | Pasteur 在 Chapel 于 2026-07-21 02:30 UTC、主网于 2026-08-25 02:30 UTC 激活；对应 Go v1.7.6 / v1.7.7 | params/config.go:255,310；bsc release v1.7.6 / v1.7.7 notes | observed | E |
| J8 | Pasteur 包含 BEP-682、BEP-695；BEP-675 不需硬分叉，在 Pasteur 激活后开放 | BEP-673.md:34-39；pasteur-bsc 公告 | observed | E |
| J9 | BEP-675 去掉了 validator 封块前对 bid 的重放，关键路径 EVM 执行从 3 次降为 2 次，BEP 估算 gas 上限约 +50% | BEP-675.md §2、§7 | observed | F8, B-0 |
| J10 | validator 只为 deposit / distributeFinalityReward / updateValidatorSetV2 三种系统交易做 blind-sign，并且（#3773 后）只接受 legacy 类型 | consensus/parlia/bid_block.go:26-30,69-85 | observed | M |
| J11 | BidBlock 广播后通过 InsertChain 验证；失败撤销 builder 24 小时，平均 gas price 过低撤销 450 秒 | miner/bid_block.go:336-412；miner/bid_block_permission.go:25-28 | observed | F8, M |
| J12 | 跨验证者证据：不同 cabinet 验证者或全部验证者达到 N/2+1，即撤销 builder，窗口 24 小时 | miner/bid_block.go:260-320；miner/bid_block_evidence.go:18-20；PR #3806 | observed | M Fig 6 |
| J13 | 撤销记录以 JSON 文件持久化在 datadir（bidblockrevokes.json），与 #3796 的 PR 描述（chain database）不一致 | miner/bid_block_permission.go:31-36；miner/minerconfig/config.go:41；PR #3796 描述 | observed | |
| J14 | 硬分叉激活块（Pasteur / Jenner）拒绝 BidBlock，由 validator 自己出块 | miner/miner_mev.go:117-121；PR #3741 | observed | M |
| J15 | 零 state root 的 BidBlock 在封块前即被拒绝（#3798，08-20 合并） | miner/bid_simulator.go:720；gh pr view 3798 | observed | M |
| J16 | gRPC SendBidBlock 默认开启，端口 8552，可用 `--mev.grpc.disable` 关闭；Go 于 08-31 合并、Rust 于 09-16 合并 | miner/minerconfig/config.go:60；cmd/utils/flags.go:864-866；PR #3774、reth #494 | observed | M, A |
| J17 | BEP-675 各项加固（除 #3773 外）都还没进入任何 bsc release | git merge-base 核对 v1.8.0-alpha（notes §J-Q3）；release 列表 | observed | M, D, F11 |
| J18 | 官方博客：截至 2026-09-01 的三天窗口内约 98% 区块走 BidBlock，平均每块 gas 比 Bid V1 多 28%（主网实际流量，非基准测试） | 来源 [13] TL;DR 与 “BEP-675 Has Quickly Become…” 节 | observed | F8, D |
| J19 | 2026-10-09 主网 RPC 采样：120 块全部 gasLimit = 70M，且全部带 BidBlock（v2）标记 | notes §J-Q3；来源 [14] | observed | F8, A, H |
| J20 | 区块来源（Bid / BidBlock）和 builder 地址被编码进 header.RequestsHash | core/types/builder/block_mev_info.go:19-40；miner/bid_block.go:37-50 | observed | S |
| J21 | BEP-706：地址 0x70，20 gas，返回 Header.MilliTimestamp()（Time×1000 + MixDigest 中的毫秒） | BEP-706.md §4；core/vm/contract_milli_timestamp.go:48-54；params/protocol_params.go:186 | observed | O |
| J22 | BEP-706 Go 于 08-18 合并（#3792），Rust 于 09-02 合并（#480） | gh pr view 3792；reth #480 | observed | P |
| J23 | BEP-714 把初始 backoff 从 2000 ms 改回 1000 ms，按 parent 时间判断是否已过 Jenner；8 块受影响 turn 从 19.6 秒降到 11.6 秒 | consensus/parlia/parlia.go:76-78,2356-2372；BEP-714.md §4.1 | observed | O, A, B-0 |
| J24 | “restore” 指回到 Lorentz（BEP-520）之前的 1 秒默认值 | 由 J23 与 parlia.go:77-78 常量注释、BEP-714 §4.2 推出：1 秒是默认值，Lorentz 提高到 2 秒 | inferred | O |
| J25 | BEP-714 在 09-11 至 09-15 的版本还包含 turnLength 8→4、maintenanceThreshold = 40、misdemeanor 333→200、felony 1000→600；09-15 缩减为只改 backoff | BEPs commit 2a6d8a4、1d5ed5a（BEP-714 §3.1）、07c33e4 | observed | O |
| J26 | v1.8.0-alpha（08-13）是不面向生产的预览版：同步 geth v1.17.3，删除 superinstruction / incr snapshot，用 EIP-7928 脚手架替代 BEP-592，Amsterdam EIP 未激活 | bsc release v1.8.0-alpha notes；params/config.go:259 | observed | O, F10 |
| J27 | v1.17.3 合并和 superinstruction / incr 删除都不在主网生产版本 v1.7.7 / v1.7.8 中 | git merge-base --is-ancestor 6d65a799d / bdb833348 / ece8248c4 对 v1.7.7 / v1.7.8 均为 n | observed | O, F10 |
| J28 | BSC 客户端在向上游 geth 收敛，而不是分叉 | 由 J26、J27 与 PR #3690 理由 “decide to follow upstream”、PR #3716 推出 | inferred | F10 |
| J29 | #3808 修复了一个漏洞：Amsterdam 前，同伴节点可附加 BAL hash / SlotNumber 字段改变块哈希而签名仍有效 | commit 50407ccb4 消息；consensus/parlia/parlia.go:666-690 | observed | O |
| J30 | #3808 修的漏洞只影响 v1.8 代码线（v1.7.x 的 header 没有这些字段） | 由 J29 与 `git show v1.7.8:core/types/block.go` 中无此字段推出 | inferred | |
| J31 | reth-bsc v0.1.2（08-20）首次发布 BidBlock 路径，并修复了在 bsc-qanet Pasteur 切换点导致集群分裂的状态根错误 | reth-bsc release v0.1.2 Note 1；src/hardforks/bsc.rs:220-230 | observed | O |
| J32 | reth-bsc 的 Jenner 相关实现（CAS20 #512、Payment Lane #497、BEP-706 #480、BEP-714 #510、gRPC #494）都没有 release，最新 tag 是 v0.1.2 | gh release list -R bnb-chain/reth-bsc；PR 合并日期 | observed | O, F11 |
| J33 | 没有证据表明主网验证者在运行 reth-bsc；README 仍写 “Run as validator ❌ (soon)” | reth-bsc/README.md:9-14@349f55c；路线图 [15] | observed | O, Q |
| J34 | reth-bsc 按 Go 优先、golden fixture 回放的方式对齐（#512 回放 145 次 go-bsc 调用） | reth-bsc PR #512 描述 “Golden replay” 节 | observed | O |
| J35 | BAP-710 是应用层提案（Draft，创建于 09-03，10-08 合并），不改共识；registry 不强制报价过期 | BAP-710.md 头部与 §2、§4.2.2；BEPs commit e1b1d51 | observed | O, A |
| J36 | BAP-710 按“报价 write-set 与 taker read-set 有交集”匹配，组装 [报价…, taker 交易] 原子 bundle，发给多个 builder，失败则回落交易池 | BAP-710.md §4.5.2 | observed | O Fig 8 |
| J37 | CAS20 和 Payment Lane 的 Go 实现都在 2026-09-11 合并（#3813、#3793），Rust 分别在 09-24 和 09-23 合并（#512、#497） | gh pr view 3813 / 3793；reth #512 / #497 | observed | E, P |
| J38 | CAS20 在 Jenner 后还需 ActivationRegistry 开放创建；Payment Lane 支付合约名单初始为空，需治理添加，比例默认 500/10000 | BEP-718.md:34；BEP-702.md:97；BEP-703.md:208,227 | observed | F11 |
| J39 | BEP-702 的修订 PR #716 仍 open，而 Rust 实现是按 #716 而不是 master 文本实现的 | gh pr view 716 -R bnb-chain/BEPs；reth #512 Rationale 节 | observed | F3 |
| J40 | Jenner 正式 release 很可能基于 v1.8 代码线 | develop 的 version.go = 1.8.0-alpha；该推测没有发布说明支持 | speculative | Q |
| J41 | 官方 gas limit 路线：55M → 70M（9 月中）→ 80M（10-10 之后）→ 约 90M（11 月中，有条件） | 来源 [13] “From 55M Toward 90M Gas” 节中的图片 | observed | A |
| J42 | 后量子（BEP-707 / 708 / 713）、BEP-684、BEP-668 都只是 open PR 提案 | gh pr list -R bnb-chain/BEPs --state open | observed | |
| S1 | 近期开发分成三层：资产层（CAS20）、资源层（Payment Lane）、出块流水线（BEP-675 BidBlock + gRPC + gas limit 提升）；另有 BEP-706 / BEP-714 两个小改动和应用层的 BAP-710 | 由 J1、J9、J16、J35、J41、C1、P1 推出：Jenner 清单 + BidBlock 加固 + BAP 提案按作用层归类 | inferred | 导语, A |
| S2 | BSC 的差异化正在从自研执行 / 存储优化转向协议层的金融基础设施（原生资产、支付容量保障、builder 出块流水线），执行引擎回归上游 geth | 由 J26、J27、J28 与 C2、P1、J9 推出：superinstruction / incr / multidb 被删，同期新增的都是协议层功能 | inferred | F12, F |
| S3 | CAS20、Payment Lane、BAP-710 之间没有自动连接：CAS20 代币不会自动进入支付名单；经 Router 调用的支付不进 lane；BAP-710 的 bundle 不获得共识优先级 | 由 P6、P10、C26、J35 推出 | inferred | F6, F, F12 |
| S4 | 两个核心功能都参考了已上线的同类设计，但方式不同：CAS20 直接沿用 B20 的接口与布局（有代码痕迹），Payment Lane 与 Tempo 只是同类思路（无血缘证据） | 由 C41、P43、P44 推出 | inferred | C, F |
| S5 | 截至 2026-10-09，Jenner 的所有功能都处于“已合并、未 release、未激活”；主网可感知的近期变化只有 BEP-675 BidBlock 与 gas limit 70M | 由 J3、J17、J19、J32、C30、P36 推出 | inferred | F11, F |

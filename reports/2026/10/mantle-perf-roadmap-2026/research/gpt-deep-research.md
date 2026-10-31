---
imported_from: ChatGPT Deep Research
imported_at: 2026-10-31
original_file: gpt-deep-research.md
---

<!-- source: https://app.notion.com/p/40a2f04c436c8053b3b9daa3932f6505?pvs=204 fetched 2026-10-31 via Notion MCP -->
# Mantle 性能优化路线评审与实验方案

- \*我的总体判断是：你的方向框架是成立的，尤其是“先测出块路径、不要直接套用其他链的性能结论、把 RPC／DA／证明滞后一起纳入观察”这三个原则。但目前这份文档还不能直接作为开发排期和上线判据：部分实验缺少有效对照，部分指标不能支持你写出的结论，还有几项涉及安全性或协议变更的工作，被放进了普通性能调优的范畴。\*\*你的原文已经明确指出外部 merkleization 数据不能直接用于 Mantle，也把下游积压纳入 E7、E8，这是应当保留的主线。 2026 Mantle 性能优化路线 2026 Mantle 性能优化路线

我建议将路线重组为：

> <b>先明确承诺和测量口径 → 找到端到端瓶颈 → 优化现有架构 → 提升可持续容量 → 再决定是否改变区块周期、执行模式和状态承诺。</b>

以下核对截至 <b>2026 年 10 月 31 日</b>。需要先明确两个边界：

- 公开代码分支、代码中的默认参数，不等于 Mantle 主网正在运行的二进制、配置和数据库格式。下文会区分“文档给出的基线”“公开代码可确认的实现”和“需要实验验证的假设”。
- 本次没有运行你们的 QA 链，也没有获得内部压测原始数据。因此，下面的“结果与结论”均是<b>实验判读规则</b>，不是已经测得的 Mantle 性能结果。

---

# 一、先给 devs onboarding：我们究竟在优化什么？

## 1.1 不要把六种不同的“快”混为一谈

你的文档把“提交—执行—封块—RPC 可读”串起来是合理的，但正式实验需要进一步拆开。否则，很容易出现“用户拿到回执很快，但交易状态不可用”“sequencer 很快，但证明永远追不上”的情况。原文的交易路径和 E1—E6 正好可以成为这套拆分的基础。    2026 Mantle 性能优化路线     2026 Mantle 性能优化路线

| 层次 | 用户或系统真正获得了什么 | 应测指标 |
| --- | --- | --- |
| 提交成功 | RPC 接收了请求，或者返回 transaction hash | 提交延迟、拒绝率、超时率 |
| 执行预确认 | Sequencer 已在某个构建中的执行上下文里执行交易，并返回结果 | Preconf 延迟、承诺等级、承诺失效率 |
| 封块与 canonical RPC 可读 | 区块被接受为当前链头，跟随节点导入后能读取状态 | Inclusion 延迟、导入延迟、状态新鲜度 |
| DA 发布与可派生 | 区块数据发布到实际采用的 DA 路径，其他节点可以独立派生 | DA 发布延迟、未发布字节数、safe-head 滞后 |
| 证明完成与提交 | 对应状态转换的证明完成，并满足结算合约的要求 | 连续已证明高度、证明积压、证明成本 |
| 结算与最终性 | 满足部署协议中的最终性、争议或提款条件 | 结算延迟、提款可用时间 |

这些层次不能互相替代。OP Stack 的 safe/finalized 生命周期、Base 的原生区块与 pending-state 区别，以及 Arbitrum 的 sequencer feed 与后续结算路径，都体现了这种区分。[Base documentation](https://docs.base.org/upgrades/denim/200ms-blocks)

<b>建议 Mantle 的性能目标至少分成四个独立指标：</b>

<b>交互延迟、可读状态延迟、可持续吞吐、故障恢复能力。</b>

TPS 或 gas/s 只能覆盖其中一部分。

## 1.2 “执行得过来”不是“链能持续承载”

对同一类交易组合，可以把系统看成多个串联或相互依赖的服务阶段：

```txt
入口与准入
    ↓
排序 / 构建 / 执行
    ├─→ 预确认结果
    ↓
状态根 / 封块 / 持久化
    ├─→ 广播 / 跟随节点导入 / RPC 可读
    └─→ 批次编码 / DA / 派生 / 证明与结算
```

具体证明可以在哪个阶段开始、哪些阶段能够重叠，应以 Mantle 部署的证明模式为准，不应把这张概念图当成已经核实的生产时序。

对任一阶段，最重要的关系是：

\\\[<br />\\frac\{dQ\}\{dt\}=\\lambda-\\mu<br />\\\]

其中，\\(Q\\) 是积压工作量，\\(\\lambda\\) 是工作进入速度，\\(\\mu\\) 是处理速度。

由此直接得到：

> <b>如果证明工作持续以高于证明系统处理能力的速度产生，那么把 sequencer 再加速，只会更快地产生无法及时结算的积压。</b>

还要注意，积压不能只看“块数”。缩短区块时间之后，同样一分钟的滞后会对应更多区块。建议同时记录：

<b>滞后秒数、未处理字节数、未处理 gas／证明工作量，以及最老任务年龄。</b>

## 1.3 性能优化要区分三个改动层级

| 层级 | 典型工作 | 原则 |
| --- | --- | --- |
| 本地实现优化 | 缓存、调度、连接复用、RPC 隔离、相同状态根下的存储布局优化 | 优先做，验证输出一致性 |
| 协议参数或构建策略变化 | Gas target、预确认预算、排序规则、部分批处理参数 | 验证准入、公平性、派生和下游容量 |
| 协议语义或承诺变化 | 原生亚秒区块、MPT 替换、state expiry、结算证明规则变化 | 单独立项，不能按普通性能开关上线 |

<b>后两类不是不能做，而是实验、审计、迁移和回滚方式完全不同。</b>

---

# 二、对原路线的逐项判断：哪些保留，哪些需要改写？

## 2.1 总览

你的路线覆盖了网络、排序出块、执行、状态、DA 与证明，整体分类足够作为起点。需要调整的是每一项的边界和优先级。    2026 Mantle 性能优化路线     2026 Mantle 性能优化路线

| 原方向 | 评审结论 | 建议调整 |
| --- | --- | --- |
| 出块路径分段测量 | <b>正确，最高优先级</b> | 增加持久化、调度等待、执行上下文、状态可见性与故障路径 |
| Preconf 与 eager build | <b>正确，但要先校验承诺语义和实验对照</b> | E4 提前为上线门槛；E3 不能仅靠不同 RPC 方法区分两组 |
| Shorter blocktime | <b>值得做</b> | 把“更快预确认”和“更短 canonical block”拆成两条路线 |
| revm → evm2 | <b>方向成立</b> | 是 Mantle SDK 适配项目，不是无条件跟随上游升级 |
| Parallel EVM | <b>应重新测依赖，但不宜直接重投入</b> | 先测 storage-slot 级依赖和关键路径，再做原型 |
| MPT／commitment 替换 | <b>保留长期研究</b> | 必须同时衡量 native 执行、证明成本、接口和迁移影响 |
| DB 优化 | <b>不应整体放到中长期</b> | 缓存、布局、历史数据分层近期做；换数据库引擎后置 |
| State expiry | <b>维持低优先级</b> | 不应作为“把状态放进内存”的前提 |
| DA 优化 | <b>应提前诊断</b> | 区分实际压缩字节、DA 计量、费用 scalar 和物理发布能力 |
| 证明优化 | <b>若历史瓶颈可复现，应进入近期主线</b> | 先优化现有证明流水线，不要先跳到 multiproof 或换 zkVM |
| LFM／lanes／ASS | <b>保留，但拆开目标</b> | LFM 管费用外溢，lanes 管服务隔离，ASS 管执行质量，不能统称扩容 |
| 网络广播 | <b>不需要套用 L1 共识优化，但不能整体后置</b> | L2 的数据传播、状态流、跟随节点和主备恢复仍有实际价值 |

下面是对开发决策影响最大的具体修正。

## 2.2 第一项重要代码发现：E4 需要升级为预确认承诺审计

原文已经把“拿到回执却没上链，或者执行结果不一致”作为上线门槛。这一点完全正确。    2026 Mantle 性能优化路线

但我检查到的公开 Mantle reth 代码，有两个值得立即核对生产版本的实现细节：

<b>第一，预确认 journal 的追加执行了 </b><b><code>write_all</code></b><b> 和 </b><b><code>flush</code></b><b>，没有在该路径执行 </b><b><code>sync_all</code></b><b>。代码注释明确将断电耐久性作为延迟权衡。第二，RPC 路径在 journal append 失败后记录 warning，仍可能返回预确认结果。</b>[GitHub](https://raw.githubusercontent.com/mantle-xyz/reth/main/mantle-reth/crates/preconf/src/journal.rs)

这不等于已经证明主网存在事故，也不等于完整恢复机制只有这个 journal。但它意味着：

> <b>仅测试正常重启和一次主备切换，无法佐证“回执返回以后，在机器故障下承诺仍然可恢复”。</b>

建议立即核实：

- 生产部署是否包含该实现；
- “预确认成功”的故障模型是否覆盖断电、磁盘故障和主机永久丢失；
- 承诺是否已经复制到其他故障域；
- 恢复时是否保存了交易顺序和执行上下文，而不只是交易本身。

尤其要区分：

<b>交易最终被重新打包 ≠ 预确认时的执行结果一定能够重现。</b>

如果恢复后交易的前序状态、排序、区块时间或 L1 origin 改变，结果一致性必须另外验证。公开 journal 记录包含交易、承诺时间等信息；不能只凭“交易还在 journal”就推导完整执行上下文已经持久化。[GitHub](https://raw.githubusercontent.com/mantle-xyz/reth/main/mantle-reth/crates/preconf/src/rpc.rs)

## 2.3 第二项重要代码发现：\`--preconf.all\` 会污染 E3 的对照组

公开配置中，\`--preconf.enable\` 控制子系统是否启用；\`all\_preconfs\` 是资格规则，不是启用开关。默认配置还包含 2M 单笔上限、6M 每块预算、2 秒 slot，以及普通交易路径的 200ms sweep。它们首先是<b>代码默认值</b>，需要再和生产配置对应。[GitHub](https://raw.githubusercontent.com/mantle-xyz/reth/main/mantle-reth/crates/preconf/src/config.rs)

更重要的是，pool listener 监听 pending pool 事件，并将符合资格的交易送入预确认队列。因此，开启 <code>--preconf.all</code> 后，<b>从普通提交入口进入的合格交易也可能走预确认执行路径</b>。[raw.githubusercontent.com](https://raw.githubusercontent.com/mantle-xyz/reth/main/mantle-reth/crates/preconf/src/pool_ext/preconf_pool_listener.rs)

所以 E3 不能简单设置为：

```txt
A 组：调用预确认 RPC
B 组：调用普通 RPC
```

然后认为 B 组就是“普通执行路径”。

正确对照应基于<b>实际资格分类和执行路径标签</b>，而不是请求方法名称。

## 2.4 第三项修正：Reth 版本、evm2 和 state root 结论需要分开

截至本次查询，公开 Mantle reth 的依赖文件仍指向 Reth v2.2.0 对应 revision、op-reth v2.2.1，并使用 Mantle 自己的 revm 分支。与此同时，上游 Reth <b>v2.9.0 于 2026 年 10 月 29 日发布，已将 EVM 切换为 evm2</b>；发布说明明确指出，定制 EVM、precompile、inspector 和 executor 的 SDK 使用方需要适配。[GitHub](https://raw.githubusercontent.com/mantle-xyz/reth/main/Cargo.toml)

因此，你的“随上游引入 evm2”方向正确，但开发任务应改成：

> <b>移植 Mantle 定制执行语义，并验证 sequencer、RPC 客户端和证明端的一致性，再评估性能收益。</b>

另外，Reth 2.0 的“1–2ms state root”指的是通过流水线和跨块缓存优化后，<b>区块末尾剩余的 root 计算时间</b>，不是整个区块只做了 1–2ms 的状态承诺工作。其存储架构也已经是 MDBX、Static Files、RocksDB 等组件分工，不宜再笼统写成“MDBX v1 还是 v2”。[Paradigm](https://www.paradigm.xyz/writing/releasing-reth-2-0)

建议把相关问题改成：

<b>当前使用哪一代 Reth storage schema？哪些表放在哪里？定制 payload builder 是否实际接入了上游缓存和流水线优化？</b>

依赖版本包含某项优化，不代表 Mantle 的定制构建路径已经用到了它。

---

# 三、统一实验方法：原来的 30 分钟和 40 个满块应该怎么用？

你设置“target 持续 30 分钟、满块约 40 块”适合作为快速筛查，但不适合直接形成生产容量结论，尤其不适合可靠估计区块级 p99。    2026 Mantle 性能优化路线     2026 Mantle 性能优化路线

## 3.1 新增 E0：版本、配置和基线清单

任何性能实验开始前，生成一份可归档的 manifest：

| 类别 | 必须固定和记录的内容 |
| --- | --- |
| 软件 | Sequencer、op-node、RPC、batcher、prover 的 commit；编译选项；依赖锁文件 |
| 协议 | Fork schedule、blocktime、gas target／limit、EIP-1559 参数、DA 配置 |
| 预确认 | Enable／资格规则、预算、单笔上限、timeout、sweep、slot、journal 与 HA 配置 |
| 硬件 | CPU、NUMA、内存、磁盘、文件系统、GPU、驱动、网络拓扑 |
| 状态 | 起始区块、状态快照、数据库格式、历史保留策略、缓存冷热状态 |
| 证明 | 实际证明模式、guest ELF／verification key、SP1 版本、批次大小、并发与 GPU 配额 |
| 工作负载 | 交易集、账户分布、nonce 分布、读写集合、到达过程、随机种子 |

<b>E0 的结果不是一张性能图，而是确保其他实验可以重复。</b>

## 3.2 工作负载不能只有 mStocks

建议同时使用三类负载，避免在一个容易处理的交易组合上得出泛化结论。

- \*真实回放。\*\*选取多个时段的 Mantle 历史区块，覆盖普通时段、活跃时段、不同状态规模，保留真实执行依赖。
- \*产品负载。\*\*除 mStocks 外，加入计划中的 meme 热点交易、现货 Router、多池拆单、perps 下单／撤单／清算，以及 agents 的并发提交与重试行为。这里是为目标产品构建测试模型，不是断言这些负载已经在主网占主导。
- \*资源边界负载。\*\*分别施加 CPU 密集、冷状态随机读、密集写入、大 calldata、大量日志、证明昂贵操作和高 revert 比例的负载。

必须避免两个常见偏差：

<b>用极少数账户制造 nonce 串行瓶颈，然后把结果归因于 EVM；用大量完全独立转账测出漂亮数字，然后外推到热点 AMM 或订单簿。</b>

## 3.3 统一测试规程

以下是建议的实验规范，不是已经验证的 Mantle SLO。

| 项目 | 建议 |
| --- | --- |
| 到达模型 | 使用开放式压测：按照预定速率发请求，不因服务变慢而自动降低负载 |
| 时间记录 | 跨机器时间同步；阶段耗时使用本机单调时钟；记录时钟误差范围 |
| 对照 | 相同状态、交易、硬件、到达序列；一次主要改变一个变量 |
| 重复 | 至少多轮重复，报告分布和波动，不只选最好一次 |
| 时长 | 30 分钟做筛查；候选配置再做 24–72 小时稳态与故障测试 |
| 尾延迟 | 交易级和区块级分别统计，不能拿大量交易样本代替少量区块样本 |
| 失败统计 | 拒绝、超时、RPC 错误、EVM revert 分开；不能只统计成功请求 |
| 恢复测试 | 突发结束后恢复正常业务负载，而不只是停止所有交易 |
| 正确性 | State root、receipts、logs、gas accounting、系统交易与证明验证结果对账 |
| 成本 | CPU／内存／磁盘增长、网络流量、GPU 时间、每单位有效工作成本 |

40 个满块只有约 0.4 个“最慢 1%”样本的数量级，无法稳定描述 p99。它可以回答“会不会立即失稳”，不能回答“生产尾延迟是否合格”。

---

# 四、保留 E1—E8，但重写实验与判读规则

## E1：预确认端到端分段计时

- \*问题。\*\*现有六个时间点缺少等待构建、持久化承诺和内部调度等环节；“各段都不突出，所以整体负载过高”的推断也不充分。原文目前使用 50ms、300ms 等阈值直接映射优化动作。 2026 Mantle 性能优化路线 2026 Mantle 性能优化路线
- \*改进实验。\*\*保留原有阶段，再增加：

```txt
收到请求
→ 解码/签名/资格/nonce/余额校验
→ 入池
→ 等待可用构建上下文
→ 等待调度
→ 执行
→ 承诺持久化/复制
→ 回执序列化与返回
```

同时标记交易相对区块周期的到达位置，以及实际走的是预确认还是普通 sweep 路径。

<b>结果 → 结论 → 措施：</b>

| 观察 | 可以支持的结论 | 后续措施 |
| --- | --- | --- |
| 入口段占主导，执行段稳定 | 主要是接入或路由问题 | 优化内部连接、路由、区域入口；不要先改 EVM |
| 入池后等待明显，实际执行很短 | 调度、构建窗口或资格／预算问题 | 优化 eager build、事件唤醒和调度；检查 slot/sweep |
| 准入耗时随同账户 pending 数增长 | 准入数据结构或扫描可能成为瓶颈 | 对账户／nonce 索引和状态查询做专项 profile |
| 持久化或复制占主导 | 强承诺有实际成本 | 评估 group commit 和复制协议，不能删掉耐久性来“达标” |
| 总体尾延迟高，但单阶段 p99 不高 | 尚不能定位 | 对同一批最慢请求做关联追踪，检查遗漏等待和阶段叠加 |

<b>不能把各段 p99 相加，也不能凭各段 p99 都不大，就排除端到端长尾。</b>

## E2：eager build 开关对照

你的方向正确。公开 Mantle PR 的目标确实是在前一块 canonical 后立即开始下一块构建，而不改变原有封块节奏。[GitHub](https://github.com/mantle-xyz/mantle-v2/pull/370/files)

- \*改进实验。\*\*除整体 p99 外，按交易到达区块周期的位置分桶，重点观察封块切换附近的请求，同时记录 idle gap、CPU、取消重建次数和普通交易延迟。

<b>判读。</b>

如果改善主要集中在区块边界附近，说明收益来自减少“无可用构建上下文”的空窗；保持开启，并补充切换时序测试。如果开启后重建或资源争用增加，则需要分析 builder 与 engine 的并发关系，而不是只看平均延迟。

原文的版本要求应写成<b>包含对应实现的 Mantle fork 版本或 commit</b>，不能把 Mantle 的 <code>v1.6.3</code> 当成任意上游 op-node 的同名版本。    2026 Mantle 性能优化路线 [GitHub](https://github.com/mantle-xyz/mantle-v2/releases/tag/v1.6.3)

## E3：预确认预算与普通交易公平性

- \*问题。\*\*拒绝率超过 0.1% 不自动意味着应该增加预算；可能是压测输入本来就超过承诺容量。普通交易是否受影响，也必须使用真实普通路径作对照。 2026 Mantle 性能优化路线

<b>改进实验。</b>

使用明确隔离的资格集合，分别扫描预确认流量占比、交易大小和预算；记录预确认实际消耗、普通交易等待分布、封块 deadline miss、DA 与证明负载。还要区分交易声明的 <code>gasLimit</code> 和实际 <code>gasUsed</code>，确认预算在实现中按什么量扣减。

<b>判读。</b>

- \*预算耗尽，但执行／DA／证明均有余量，普通交易 SLO 稳定：\*\*才有理由提高预算。
- \*普通交易出现饥饿：\*\*降低预确认份额，或使用可借用但有最低保障的调度策略。
- \*少数大交易阻塞所有预确认：\*\*评估单笔上限或大小分级调度，但这属于服务范围调整，不能宣称底层执行能力提高。
- \*无论如何分预算，总工作量都超容量：\*\*问题是总准入，而不是预确认参数。

## E4：承诺可恢复性与执行一致性

建议把“一定上链验证”改名为：

> <b>在明确定义的故障模型下，验证已返回承诺的可恢复性、包含性和执行一致性。</b>

新增故障矩阵：

| 故障 | 核验重点 |
| --- | --- |
| 正常重启 | 基础恢复 |
| 强制终止进程 | 用户态缓冲、并发关闭与恢复 |
| 主机断电／丢失 | 已返回承诺是否真正耐久、是否跨故障域 |
| 磁盘满／写入失败／journal 损坏 | 是否仍发出过强承诺，恢复是否静默跳过 |
| 主备切换／网络分区 | 旧主是否被 fencing，是否出现双主承诺 |
| 区块／L1 origin 变化 | 原承诺是否仍适用，是否存在明确撤销或降级状态 |
| 超时与重试竞争 | 同一交易与同 nonce 替换是否保持可查询、幂等的生命周期 |

OP 的 <code>op-conductor</code> 使用 Raft 协调高可用，但这不自动证明 Mantle 正在构建中的预确认承诺已经复制；必须核对其复制状态的边界。[Optimism Documentation](https://docs.optimism.io/operators/chain-operators/tools/op-conductor)

- \*措施。\*\*如果目标承诺覆盖主机故障，需要设计 durable／replicated acknowledgement、顺序与上下文恢复，以及领导者 fencing。Journal 失败后还应停止发出新的强承诺，并暴露可查询状态；不能把“RPC 返回错误”当作“已经执行的交易被撤销”。

## E5：预确认状态可见性

原文提出状态流，这是值得推进的方向；但状态流必须有明确语义，不能把尚未验证的状态直接伪装成 canonical <code>latest</code>。    2026 Mantle 性能优化路线

- \*改进实验。\*\*客户端 B 分别查询：

<b>Sequencer 的预确认视图、支持 pending overlay 的节点、普通 canonical RPC。</b>

除余额外，还测 nonce、\`eth\_call\`、日志、连续依赖交易，以及断线重连后的状态一致性。

<b>判读。</b>

若预确认视图快、canonical RPC 慢，瓶颈可能是区块周期和导入路径，不是网络故障。可以设计两种实现：

<b>增量交易流＋跟随执行</b>，或<b>状态差分流＋显式可信读副本</b>。

前者和后者的验证能力不同。无论采用哪种，都要有序号、父区块标识、缺口检测、回滚和 canonical 对账。Base 的 pending-state 接口与 MegaETH 的不同节点角色，提供了可参考的设计，但不能因此省略 Mantle 的独立验证路径。[Base documentation](https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_getTransactionCount)

## E6：RPC 导入延迟

<b>问题。</b>“封块到导入完成超过 500ms”不能直接推出该换 NVMe。原文把网络跳数、磁盘与状态流放在同一条优化建议中，需要拆分。    2026 Mantle 性能优化路线

<b>改进实验。</b>

```txt
Sequencer 完成
→ 编码/发送排队
→ RPC 节点收全数据
→ 导入队列
→ 重执行
→ root 校验
→ 持久化
→ 查询接口可见
```

同时对照“只有跟随任务的节点”和“承受实际查询压力的节点”。

<b>判读。</b>

网络段主导才优化传播；重执行主导才优化执行客户端；磁盘等待主导才优化存储；只有查询压力下变慢则优先隔离 <code>trace</code>、大范围 <code>getLogs</code>、历史查询等任务。

<b>Preconf stream 能改善读体验，但不能算作已经解决 canonical 导入瓶颈。</b>

## E7：target 持续负载

原文“积压持续增长就不能提容量”的判断正确；“30 分钟内平稳、封块 p99 小于 200ms 就可以提 target”则证据不足。    2026 Mantle 性能优化路线

- \*改进实验。\*\*先做多个负载档位，再对候选配置做长时间运行。记录队列斜率、内存与磁盘增长、连续已证明进度、最老未发布／未证明任务年龄，以及正常查询压力下的状态新鲜度。

<b>判读。</b>

只有所有必要阶段在稳态下都有余量，且经过恢复测试，才能小步提高 target。若某阶段积压上升，先修该阶段；如果只是 DA footprint 更早触及配置阈值，<b>只能说明当前 DA 计量约束更紧，不能直接证明真实 DA 发布带宽已经耗尽。</b>

## E8：突发与恢复

- \*改进实验。\*\*保留 40 个满块作为快速冲击，再增加不同持续时间、不同交易组合和重复突发。分别测试“停流恢复”和“恢复到正常流量”。

在处理能力近似稳定时：

\\\[<br />T\_\{\\text\{drain\}\}\\approx\\frac\{Q\_\{\\text\{burst\}\}\}\{\\mu-\\lambda\_\{\\text\{normal\}\}\}<br />\\\]

这也解释了为什么“停流后五分钟恢复”不一定代表能在生产中恢复。

原文关于参数的建议还需要明确两个方向：

<b>EIP-1559 denominator 越小，同等利用率偏差下 base fee 调整越快，而不是数值越大反应越快。降低 elasticity 时，必须说明固定 target 还是固定 limit；如果固定 limit，降低 elasticity 会提高 target。</b>    2026 Mantle 性能优化路线 [Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-1559)

费用参数只能影响价格敏感的流量，不能凭空提高 DA 或证明处理能力。

---

# 五、补充实验：把每个优化方向变成可执行决策

以下沿用 E1—E8 编号，补充 E9—E19。不是要求全部开发，而是要求每个方向都有明确的继续／停止条件。

## 5.1 E9：缩短区块时间——分别验证“更快预确认”和“更短真实区块”

### 问题与外部依据

你提到的 Base 原生 200ms 方案值得重点研究。它已经不是早期 Flashblocks 的同义词：官方文档显示，Denim 于 <b>2026 年 10 月 21 日在 Base Sepolia 激活</b>，主网仍标为 <b>2026 年 11 月计划</b>。每个 200ms 单元是独立 canonical block，涉及 BaseTime、派生、Engine API 和 RPC 改动。[Base documentation](https://docs.base.org/upgrades/denim/overview)

所以，Mantle 不能只把 blocktime 参数改成 0.2 秒。

### 实验

先建立两条对照：

<b>A：保持当前 canonical block 周期，优化预确认和状态流。</b>

<b>B：引入更短 canonical block，并同步适配派生、执行、证明、RPC 和系统交易。</b>

第一轮比较必须保持<b>每秒用户工作量</b>接近一致，而不是保持每块 gas 不变。

按你文档中的 2 秒、15M target、60M limit 基线做纯算术示例：

| 参数 | 2 秒区块 | 200ms 区块、保持相同 gas/s |
| --- | --- | --- |
| Target | 15M／块 | 1.5M／块 |
| Limit | 60M／块 | 6M／块 |
| 6M 预确认预算的等速率换算 | 6M／块 | 0.6M／块 |

这些是实验换算，不是主网配置建议。特别是 0.6M 每块预确认预算会与原来的 2M 单笔上限冲突，必须重新设计预算语义；还要计入更频繁的系统交易与固定开销。原基线来自你的文档，公开代码也有相应默认预确认参数。    2026 Mantle 性能优化路线 [GitHub](https://raw.githubusercontent.com/mantle-xyz/reth/main/mantle-reth/crates/preconf/src/config.rs)

### 结果与措施

若 A 已满足交互与读取目标，而 B 显著增加固定成本，近期优先 A。

若 B 在相同每秒负载下明显改善 canonical 可用性，且 DA、证明、跟随和故障恢复都合格，才进入协议升级。

必须审计按 <code>block.number</code> 计时的合约、每块限额、费用调节的墙钟速度，以及 builder 的 slot/sweep。<b>区块时间缩短十倍，不能让这些逻辑默认仍按原来的时间尺度运行。</b>[Base documentation](https://docs.base.org/upgrades/denim/200ms-blocks)

---

## 5.2 E10：evm2 与客户端升级——验证的是 Mantle 全链路收益

### 问题与假设

上游已经给出了 evm2 的性能收益，但其发布基准不是 Mantle；Mantle 还有定制执行逻辑和证明实现。[GitHub](https://github.com/paradigmxyz/reth/releases/tag/v2.9.0)

### 实验

设置三组：

<b>当前生产版本；保留原 EVM 的上游优化适配版；包含 evm2 的适配版。</b>

同一批历史回放和合成负载下，对比执行时间、准入、构建尾部、RPC 重执行、内存、总成本，并逐块比较状态根和回执。

重点覆盖 Mantle 特有费用、系统交易、deposit、post-execution 逻辑、异常回滚和 precompile。

### 结果与措施

若 EVM microbenchmark 提升，但端到端没有明显变化，说明当前瓶颈不在 EVM，不能据此提高链容量。

若 native 提升显著、证明成本不变，可以把它作为交互和节点成本优化，但不能宣称解决证明瓶颈。

任何语义不一致先阻断上线。<b>执行客户端升级与证明 guest 升级应是两份相互验证的变更，不应假设 native 换了 EVM，SP1 就自动获得相同收益。</b>

---

## 5.3 E11：缓存、预热、流水线与存储——先吃现有架构的收益

### 问题与外部依据

Reth 已通过 sparse trie cache、partial proofs 和存储分层减少重复工作；Base 的 TrieDB 则围绕 Ethereum state trie 的页面布局进行优化。它们都说明“保留执行语义和状态承诺，先改数据访问方式”是实际可研究的路线。[Paradigm](https://www.paradigm.xyz/writing/releasing-reth-2-0)

### 实验

分别扫描：

<b>缓存大小、冷热状态、预热开关、跨块缓存复用、执行与 root 重叠、持久化并发、节点查询压力。</b>

记录真实磁盘读取量、写放大、cache miss、page fault、执行等待 I/O、root 总工作量和封块末尾等待。

### 结果与措施

若冷状态随机读主导，先优化预取、缓存和布局；若末尾 root 很短但后台 root 长期占满资源，不能宣布 merkleization 已经没有成本；若后台持久化在长时间运行后反压执行，优先修存储服务能力。

<b>这是近期工作，不需要等到“决定更换 MDBX”以后才开始。</b>

---

## 5.4 E12：Parallel EVM——先证明可并行性，再证明实际收益

### 问题与外部依据

你保留去年“依赖高、收益可能有限”的判断是合理的，但它需要按当前及目标业务负载重新测。RISE 提供了 L2 上研究并行执行、状态根和增量传播协同的直接案例；其公开 pevm 仓库仍标注为 work in progress、非 production-ready，因此适合作为设计和实验参考，而非成熟组件直接替换。    2026 Mantle 性能优化路线 [GitHub](https://github.com/risechain/pevm)

### 实验

先生成真实交易的账户与 storage-slot 读写集合，构建依赖图，测量：

<b>最长串行关键路径、可并行宽度、热点写入、推测失败和重执行成本。</b>

同一合约不等于必然冲突，不同合约也不等于独立。还要区分真实业务依赖和费用累计等可能被实现方式放大的依赖。

随后才做 1／2／4／8 等 worker 对照，保持 canonical 顺序和输出相同。

### 结果与措施

若热点合约负载下重执行抵消收益，不推进通用 pEVM，先做签名验证、预热、root 和证明任务的并行化。

若跨市场／跨池组合有稳定收益，可先评估 follower 或特定构建路径。

若要进入预确认 sequencer，必须保证并行执行不会改变已经承诺的交易前缀及其结果。

<b>“有多少交易冲突”不足以做决策；要看冲突关键路径占多少执行时间。</b>

---

## 5.5 E13：证明流水线——若原瓶颈成立，应提前到近期主线

### 问题与外部依据

你写到旧压测瓶颈主要在 ZK proof system，因此不应把主要精力放在“未来要不要 multiproof”，而应先复现和拆解当前瓶颈。    2026 Mantle 性能优化路线

SP1 已提供 cycle tracking 和 prover gas；后者考虑不同 precompile 的成本差异，比只看 RISC-V cycles 更适合估计证明工作量。不过 prover gas 是程序执行后得到的指标，不能直接当成廉价的交易前准入计量。[docs.succinct.xyz](https://docs.succinct.xyz/docs/sp1/optimizing-programs/cycle-tracking)

### 实验

把端到端证明拆成：

```txt
数据获取 / witness
→ 派生与解压
→ EVM 执行
→ MPT / RLP / hash
→ trace / shard proving
→ recursion / aggregation / wrap
→ 提交 / 链上验证
```

同时扫描批次大小、并发任务数、CPU/GPU 配比、数据缓存、证明版本。

指标至少包括：各阶段时间、GPU 利用率、prover gas、内存、每批成本、失败重试，以及<b>连续已证明前缀</b>的推进速度。

### 结果与措施

| 观察 | 结论 | 措施 |
| --- | --- | --- |
| GPU 空闲，witness／RPC 很慢 | 数据供给瓶颈 | 专用 witness 服务、缓存和预取 |
| Hash／MPT 占主要证明成本 | Guest／承诺相关瓶颈 | 核查已有加速路径实际命中；再评估结构变化 |
| GPU 满载且增加 worker 有稳定收益 | 算力容量瓶颈 | 扩容并建立容量预算 |
| 大批次吞吐提高、最老任务延迟恶化 | 吞吐与延迟的权衡 | 给批次设置工作量与年龄上限 |
| 很多任务完成，但连续前缀不动 | 头部任务阻塞 | 调整调度、重试和异常任务处理 |
| 换 native EVM 后证明无改善 | Native 与 proving 瓶颈不同 | 分开优化，不提高结算能力预期 |

不要求“每块证明时间小于 blocktime”才能持续运行；只要允许并行／批处理且总处理能力足够，就可能稳定。反过来，单次最快证明很快，也不能证明长期容量足够。

---

## 5.6 E14：DA、压缩与 batcher——区分带宽、延迟、价格和准入

### 先核对原文数字

你给出的 BPO2 约 <b>152／228 KB/s</b> 并不是明显错误。按 BPO2 的 14／21 blobs、12 秒 slot，以及 OP blob 编码每 blob 约 130,044 字节可用空间计算，得到约 151.7／227.6 KB/s。它是该参数口径下的近似，不是 Mantle 的独享带宽，也不能未经核对就作为今天的生产配额。    2026 Mantle 性能优化路线 [Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8135)

“每笔 100 bytes”还必须注明是<b>经过实际批次压缩后的平均摊销值</b>。

### 实验

在相同用户交易负载下扫描压缩配置、批次／channel 大小、关闭频率、blob 利用率和提交策略，观察：

<b>压缩 bytes/tx、编码 CPU、发布延迟、L1 inclusion、重发、余额／nonce 管理，以及 safe-head 滞后。</b>

Arbitrum 的批次压缩设计会结合 backlog 调节压缩工作，是有参考价值的 L2 案例；但其编码协议不能直接移植到 OP 派生流程。[Arbitrum docs](https://docs.arbitrum.io/how-arbitrum-works/inside-arbitrum-nitro)

### 结果与措施

若 blob 经常未装满，优化批次利用率；若压缩 CPU 拖慢发布，评估压缩率和处理速度的折中；若数据准备好了却迟迟上不了 L1，检查提交与费用策略，不要先换 EVM。

若 Mantle 使用 Jovian 对应规则，还需把 DA footprint scalar 单独处理：

\\\[<br />F=\\sum\_i \\widehat\{\\text\{compressed bytes\}\}\_i\\times s<br />\\\]

它是将估计 DA 使用量映射到 gas 维度的约束，<b>不是压缩算法</b>。提高 \\(s\\) 会更严格地限制可容纳的数据，降低 \\(s\\) 只是放松准入，不会制造 DA 带宽；它也不等于用于费用计算的其他 scalar。[OP Stack Specification](https://specs.optimism.io/protocol/jovian/exec-engine.html)

---

## 5.7 E15：网络、状态流与 RPC 隔离——这是 L2 有用的“网络优化”

### 回答你最关心的 L1／L2 边界

你不把 L1 的大规模投票和共识广播算法直接列入 Mantle 主线，这个判断应保留。但原文“网络优化大多作用于 L1”容易让团队忽略 L2 真实存在的数据分发问题。    2026 Mantle 性能优化路线

对 Mantle，应重点研究：

<b>Sequencer 到跟随节点、RPC、备机、证明数据服务和应用订阅者的传播与恢复。</b>

Arbitrum 有 sequencer feed 与 relay；MegaETH 的设计区分 sequencer、应用状态差分的 replica 和独立验证的 full node。这些都是 L2 直接相关的案例，而不是 L1 共识优化。[Arbitrum docs](https://docs.arbitrum.io/run-a-node/run-feed-relay)

### 实验

在不同区块大小、发送频率、节点数量和 RTT 下，对照现有 gossip、直连 relay、增量交易／状态流；加入慢消费者、丢包、断线和重连。

指标是传播 p99、sequencer 出口带宽、编码 CPU、消费者积压、恢复速度和 canonical 一致性。

### 结果与措施

发送扇出是瓶颈，就增加 relay 和分层分发；重复编码是瓶颈，就复用编码结果；慢消费者拖累生产，就隔离队列并提供快照恢复。

- \*QUIC 只能作为传输候选。\*\*本次没有找到足够明确的一手实现材料，能把“MegaETH QUIC”直接确认为可复用方案。应先证明当前传输是瓶颈，再比较传输协议，不应把协议名字本身当作优化结论。

---

## 5.8 E16：资源准入和费用控制——应早于通用 LFM

### 问题

一个低平均利用率的网络，仍然可能被少量 DA 密集或证明昂贵的交易打满某个资源。只看 gas target，可能无法识别这种失衡。

OP 的 DA footprint 是多资源约束的直接例子；Arbitrum 的相关升级资料也体现了先增加资源测量、再逐步引入约束的路径。它们不等于“按应用隔离的 local fee market”。[OP Stack Specification](https://specs.optimism.io/protocol/jovian/exec-engine.html)

### 实验

构造相同 EVM gas、但 calldata、状态写入和证明成本不同的组合，对照单一 gas 准入与多资源估计下的准入策略。

同时模拟价格敏感用户和价格不敏感负载，避免把“涨费减少了测试请求”误认为计算能力提高。

### 结果与措施

如果 EVM gas 对主要资源有明显低估，先增加监控、资源上限和积压保护。将复杂资源定价升级为协议功能，应建立在稳定、可验证且难以操纵的计量基础上。

<b>近期优先级是避免接受不可持续的工作量，不是先建一个复杂的应用级费用市场。</b>

---

## 5.9 E17：专用 DB 与 commitment 替换——拆成两条立项路径

原文把 MonadDB、Base TrieDB、SALT、QMDB、NOMT、MIP-8、LtHash 放在相邻位置，但它们不是可以直接横向替换的同类产品。    2026 Mantle 性能优化路线

| 路线 | 研究对象 | 对 Mantle 的主要影响 |
| --- | --- | --- |
| 保持原有承诺语义，优化存储实现 | 缓存、页面布局、异步 I/O、TrieDB 类设计 | 主要是客户端工程与迁移 |
| 使用新的原生认证结构 | QMDB、NOMT、SALT、EIP-7864 等 | 状态根、witness、证明和接口适配 |
| 改变承诺粒度或状态摘要 | Monad MIP-8、Sei LtHash 路线 | 还可能影响 gas、证明接口与状态迁移 |

MonadDB 的异步 I/O、原生 trie 布局可以作为存储设计参考；但当前 MIP-8 将存储承诺粒度改变为 page，不能把它归为纯本地数据库优化。[Monad Documentation](https://docs.monad.xyz/monad-arch/execution/monaddb)

QMDB 和 NOMT 是带认证结构的存储设计；采用其原生结构时，不能假设还能输出原来的 Ethereum MPT root。SALT 同样包含自己的认证层。[arXiv](https://arxiv.org/abs/2501.05262)

### 实验

对同一状态和读写 trace，测：

<b>Native 读写、root、RAM、磁盘、写放大、witness 大小、SP1 证明成本、成员／非成员证明、历史查询和恢复。</b>

对于新承诺结构，比较的是相同逻辑状态及正确性，不是要求两个不同结构产生相同 root。

### 结果与措施

仅本地布局优化就足够，优先保持承诺兼容。

若新结构 native 很快，但证明更贵，则不应为了节点 benchmark 替换。

若总体收益显著，再单独设计 state migration、op-geth／reth／Kona 一致性、\`eth\_getProof\`、提款与桥验证器升级。

- \*EVM 执行语义兼容，不等于状态证明接口兼容。\*\*EIP-7864 目前也仍是 Draft，不能当成已经确定的 Ethereum 迁移终点。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-7864)

---

## 5.10 E18：状态增长、历史裁剪和 state expiry

### 问题

你的长期优先级判断可以保留，但“为了把状态放进内存，所以需要 state expiry”的因果关系应改写。    2026 Mantle 性能优化路线

SALT 强调的是<b>认证层</b>的低内存占用，不是所有业务 KV 都必须驻留内存；Reth 的历史数据分层也说明，可以在不删除活跃状态语义的情况下优化节点占用。[GitHub](https://github.com/megaeth-labs/salt)

### 实验

将活跃状态、冷状态、历史数据分开，扩大测试状态规模，分别对照更多 RAM、缓存策略、历史裁剪、存储分层，观察 cache miss、冷读、证明 witness、快照和重启恢复。

### 结果与措施

若主要增长来自历史数据，做历史策略；若工作集可被合理缓存覆盖，不需要引入 expiry。

只有长期活跃状态规模确实构成不可接受约束，而且已有状态恢复、witness 可用性、合约兼容和用户体验方案时，才进入 state expiry 协议研究。

---

## 5.11 E19：Lanes、ASS 与 multiproof——分别用产品和安全目标立项

这里建议分成两个子实验，不再把它们当作一般吞吐优化。

### E19-A：Lanes／application-specific sequencing

- \*实验目标：\*\*不是先证明 TPS 更高，而是证明拥堵下的服务质量或执行质量更好。

构造 meme 高峰叠加支付、Router、perps 撤单／清算的负载，对照普通排序、保留容量和应用策略。观察被保护业务的 p99、最坏等待、其他业务饥饿、闲置容量，以及跨应用调用是否绕过分类。

Tempo 提供专用 payment lanes 的案例；BSC 于 2026 年 9 月公布的 Payment Lane 是保留支付最低容量、而非重新排序整个区块的设计。后者当时仍为 Q4 计划，不能当作已经验证的生产收益。[GitHub](https://github.com/tempoxyz/tempo)

Unichain 白皮书则提供了 L2 可验证构建和排序策略的设计案例，但不能据此推导它已经实现通用应用级 LFM。[Uniswap Developers](https://docs.unichain.org/whitepaper.pdf)

- \*措施：\*\*若目标业务确有 SLA 需求，可以在低平均利用率时也提前做有限隔离；若没有可测的产品收益，维持长期研究。预留空间要考虑闲置借用、反饥饿和共享状态依赖。

### E19-B：Multiproof／更换 zkVM

Base 的 TEE＋ZK 方案主要围绕证明安全、故障处理和结算体验设计；它并不意味着原来的 ZK prover 自动变快。[Base](https://www.base.org/blog/multiproofs-on-base)

先明确结算规则究竟是两种证明都要、任一即可，还是存在优先级和回退机制，再模拟一方不可用、双方不一致和异常恢复。

若 TEE 在 ZK 积压时使结算继续前进，需要明确这是<b>结算规则和信任假设的变化</b>，不是 ZK 性能提升。

Airbender 等方案值得持续做同条件基准对照，但比较必须统一执行语义、证明边界、硬件、批次、证明类型和安全参数。不能把针对其他执行系统的实时证明结果直接外推为 Mantle 的迁移收益。[zksync.io](https://www.zksync.io/blog/introducing-airbender-prime)

---

# 六、其他链的经验：对 Mantle 哪些值得学，哪些不能照搬？

这里把外部研究压缩成一张可直接用于技术评审的筛选表。

| 项目／路线 | 值得 Mantle 借鉴的部分 | 不能直接照搬的部分 |
| --- | --- | --- |
| <b>Base</b> | 原生 200ms 的完整协议改动范围；pending／canonical 分离；TrieDB；证明规则设计 | 把 200ms 当普通参数；把 multiproof 当 ZK 扩容。Denim 当前公开状态仍是测试网已启用、主网计划中。[Base documentation](https://docs.base.org/upgrades/denim/overview) |
| <b>Arbitrum</b> | Sequencer feed、relay、追赶恢复、压缩与积压管理 | Nitro 编码、派生和证明模型不是 OP Stack 的可直接替换组件。[Arbitrum docs](https://docs.arbitrum.io/run-a-node/run-feed-relay) |
| <b>Unichain</b> | 增量预确认、可验证构建和排序政策 | 白皮书中的设计不能全部当作当前部署状态；也不等于通用 LFM。[Uniswap Developers](https://docs.unichain.org/whitepaper.pdf) |
| <b>RISE</b> | 并行执行、root、传播协同设计；对 L2 低延迟的整体思考 | pevm 公开仓库仍提示非生产就绪；独立交易 benchmark 不能外推 Mantle。[GitHub](https://github.com/risechain/pevm) |
| <b>MegaETH</b> | 节点角色分离、增量状态分发、认证结构和内存占用优化 | 可信 replica 不能替代独立验证；SALT 不等于普通 KV 后端替换。[MegaEth Docs](https://docs.megaeth.com/architecture) |
| <b>zkSync／Airbender</b> | 执行与证明共同设计、证明系统基准方法 | 不是 Mantle 现有 Kona／SP1 的低成本插件。[zksync.io](https://www.zksync.io/blog/introducing-airbender-prime) |
| <b>Monad</b> | 异步 I/O、原生 trie 存储、页面局部性、多版本读写 | 共识优化不直接适用；MIP-8 的承诺／gas 变化不是纯 DB 优化。[Monad Documentation](https://docs.monad.xyz/monad-arch/execution/monaddb) |
| <b>Sei</b> | FlatKV、状态与历史拆分、在线迁移研究 | LtHash 状态摘要不能未经额外设计就当成原 MPT 成员证明接口。[Sei Blog](https://blog.sei.io/the-eidos-upgrade-replacing-seis-storage-database-while-the-chain-is-running/) |
| <b>Tempo／BSC lanes</b> | 服务容量隔离、支付不被其他流量完全挤出 | 不增加总物理容量；也不能自动保证跨应用状态隔离。[GitHub](https://github.com/tempoxyz/tempo) |

你文档中的“Binance New L1”没有具体项目标识；我没有把它自行等同于 BSC。这里的 BSC Payment Lane 是补充案例。

<b>因此，对 L1 经验的正确过滤器，不是“它来自 L1，所以不用看”，而是：</b>

> <b>它优化的是共识投票，还是 Mantle 同样存在的执行、存储、数据分发与服务隔离问题？它是否要求改变 Mantle 的验证和结算边界？</b>

---

# 七、最后应该形成什么工程产物，以及什么情况下允许上线？

## 7.1 每个方向都应提交同一种决策记录

不要只提交 benchmark 图。建议每项实验都有以下六个字段：

| 字段 | 必须回答的问题 |
| --- | --- |
| 假设 | 怀疑哪个阶段、哪种资源是瓶颈？ |
| 基线与改动 | 相同条件是什么？只改变了什么？ |
| 结果 | 吞吐、尾延迟、错误、积压、成本分别怎样？ |
| 正确性 | 状态、回执、系统交易、证明是否一致？ |
| 结论 | 假设被支持、被否定，还是证据不足？ |
| 决策 | 上线、继续实验、停止投入，或先修下游？ |

- \*“证明某方向暂时不值得做”也是合格成果。\*\*例如证实当前 root 不在关键路径，就应推迟 MPT 替换，而不是为了完成路线图继续改。

## 7.2 容量提升的四道门槛

- \*第一道：正确性。\*\*正常与故障路径中没有无法解释的状态、回执或证明不一致；预确认承诺与实际故障模型匹配。
- \*第二道：持续性。\*\*在目标业务组合和正常查询压力下，DA、RPC、证明等必要阶段的积压不持续增长。
- \*第三道：恢复性。\*\*在保留正常流量的情况下，系统能够从约定突发和故障中恢复，而不是只能停流恢复。
- \*第四道：运维性。\*\*有版本化配置、容量监控、灰度、快照和回退方案。客户端／配置回退与协议硬分叉回退不能混为一谈；改变承诺或状态格式后，不能假设直接降级二进制即可恢复。

原文 200ms、300ms、500ms、0.1% 和五分钟等数字可以先保留为<b>候选阈值</b>，但必须绑定测量端点、输入负载、地域和承诺级别，而不是通用判断常数。    2026 Mantle 性能优化路线

---

# 八、短期、中期、长期计划与紧急性

以下以 <b>2026 年 11 月 2 日启动</b>为规划基点，假设执行、证明、基础设施和 QA 能并行投入。时间窗口是项目规划建议，不是完成承诺；协议升级必须以实验和审计门槛为准。

## 8.1 短期：0—6 周——先得到可信基线，修正确认语义和现有瓶颈

| 时间窗口 | 工作 | 紧急性 | 交付与决策 |
| --- | --- | --- | --- |
| 第 0—2 周 | E0 版本／配置／状态清单，统一 tracing 和工作负载 | <b>P0</b> | 可重复的性能基线 |
| 第 0—2 周 | E4 预确认 journal、复制、切换和承诺语义核对 | <b>P0</b> | 明确是否存在强承诺上线阻断项 |
| 第 0—3 周 | E13 复现旧证明瓶颈，拆解 witness／guest／GPU／聚合 | <b>P0 诊断</b> | 确认当前端到端约束 |
| 第 2—6 周 | 修订后的 E1—E8；入口、调度、RPC 隔离、缓存和 batcher 优化 | <b>P1</b> | 在不改协议语义下交付可测收益 |
| 第 2—6 周 | E10 evm2 适配与一致性验证 | <b>P1</b> | 决定是否进入灰度，不要求强行在窗口内上线 |
| 第 2—6 周 | E11、E14 的低风险配置和实现优化 | <b>P1</b> | 建立安全 target／limit 范围 |

- \*短期不建议：\*\*直接更换 commitment、引入 state expiry，或者因为有更快预确认就提高总容量。

如果原来的“证明是主要瓶颈”被复现，证明流水线与容量建设就应成为短期主线，而不是继续放在中长期。

## 8.2 中期：第 6—16 周——按收益推进结构性改善

大致对应 <b>2026 年 12 月中旬至 2027 年 2 月下旬</b>。

| 工作 | 优先级与启动条件 | 交付 |
| --- | --- | --- |
| 预确认状态流与读路径改造 | <b>P1/P2</b>：E5 证明确有读状态延迟问题 | 显式 pending 语义、订阅协议、回滚与对账 |
| 证明系统扩容、批次和调度优化 | <b>P1</b>：E13 支持 | 稳态容量和故障恢复报告 |
| 更短 canonical block 原型 | <b>P2</b>：E9 相同每秒工作量实验成立 | 跨 execution／derivation／proof／RPC 的 QA 链 |
| pEVM 原型 | <b>P2</b>：E12 显示实际并行空间 | 与串行基线的端到端对照 |
| 专用存储 PoC | <b>P2</b>：E11 证明 I/O 是主要瓶颈 | 保持承诺兼容的候选实现 |
| 有限业务 lanes | 由产品 SLA 决定 | 拥堵隔离效果，而非泛化 TPS 宣传 |

- \*中期的核心决策是：Mantle 是否真的需要原生亚秒区块，以及需要怎样的原生亚秒区块。\*\*这应由 canonical 状态需求和全链路成本决定，而不是只由 sequencer 的单机 benchmark 决定。

## 8.3 长期：4—9 个月及以后——只推进已被证实有必要的协议重构

大致对应 <b>2027 年 3—7 月及以后</b>。

| 方向 | 进入开发的条件 |
| --- | --- |
| 新 commitment／MPT 替代 | 当前结构确实限制整体性能，且 native＋proof 总收益显著 |
| 深度存储重构 | 现有缓存、分层与布局优化已不足以解决问题 |
| 通用 LFM／复杂 ASS | 有明确产品需求、可执行的分类规则和经济安全模型 |
| State expiry | 长期活跃状态压力真实存在，恢复与兼容方案完整 |
| Multiproof 或 zkVM 迁移 | 有明确安全／结算或成本优势，且迁移收益覆盖维护代价 |

这些方向可以提前做小规模研究，但<b>不应预先承诺一定上线</b>。

---

# 最终建议

我建议你对原文做的最大修改，不是再增加几个高性能链技术名词，而是把每条路线改成同一个逻辑：

> <b>我们怀疑什么瓶颈 → 用什么对照排除其他原因 → 哪种结果支持这个判断 → 做什么改动 → 什么结果意味着停止投入。</b>

对 Mantle 当前路线，最值得优先推进的是：

<b>预确认承诺与故障恢复、全链路测量、现有执行／存储流水线、证明与 DA 的可持续容量，以及 RPC 状态可见性。</b>

原生短区块和并行 EVM 应当紧随其后做有条件验证；commitment 替换、state expiry、复杂 LFM 和证明架构重构，则应由实验和产品需求触发。

<b>最终需要交付的不是“最快能跑多少 TPS”，而是：在明确业务组合、硬件、承诺等级和故障模型下，Mantle 能以什么延迟持续承载多少工作量，并且在突发和故障之后仍能追上、证明和结算。</b>

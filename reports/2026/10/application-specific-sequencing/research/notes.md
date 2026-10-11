# 调研索引：应用特定排序（ASS / ACE）与 Mantle 的区块空间再分配

调研日期：2026-10-11。五路并行调研 + 主会话综合。外部调研（ChatGPT Deep Research，`ass-deep-dive.md`）只作线索。

## 分册

| 前缀 | 文件 | 范围 | 台账行（obs / inf / spec） |
|---|---|---|---|
| A | `notes-angstrom.md` | Angstrom L1 / L2、Paradigm MEV tax、Sorella 的 ASS 定义、UniswapX priority、FastLane Atlas、AA 交互 | 38 / 6 / 1 |
| B | `notes-builder.md` | op-rbuilder、rollup-boost、Unichain TEE + Flashblocks、Mantle 的 op-rbuilder fork、Timeboost（及 PGA 替换提案）、PUR、BAP-710、Express Relay、Chainlink SVR | 38 / 6 / 1 |
| X | `notes-other.md` | BAM Maker Priority Plugin、Temporal AMQ、Prop AMM 经济型 cancel priority、Hyperliquid、Skip Block SDK、dYdX、Injective、Sui / Penumbra | 38 / 6 / 1 |
| L | `notes-theory.md` | Tempo / BSC payment lane、ACE 原文、PEPC / EVM 原生排序 / FOCIL、边界问题、Mantle 2024 fair sequencing | 43 / 6 / 1 |
| M | `notes-mantle.md` | Mantle 网络现状、op-node / op-geth / mantle-reth 出块路径、preconf 车道、路线图、排序规则插入点 | 37 / 7 / 1 |
| D | 本文件 §设计综合 | 由以上论断推出的结论与 Mantle 方案 | 0 / 18 / 2 |

合计 250 行：observed 194、inferred 49、speculative 7。固定源码版本见各分册开头（/tmp/ass-src）。

## 每个研究问题一行答案

1. **概念与分类**：ASS 是 Sorella 的说法（受限排序权 + 应用 mempool + 结果与顺序无关），ACE 是 Bahrani & Neuder 的更宽范式（应用对一批交易施加排序规则）；ASS 是 ACE 的“链下批处理”实现路线（A14–A17）。按强制力可分四层（D1），每层的信任、组合性代价与审查边界不同。
2. **EVM 实现**：除 Tempo / BSC lane 外，没有已上线实现在协议层改变排序（D2）。Angstrom L1 = hook 锁 + 链下网络；L2 = 优先费 × 120k × factor 的税（Base 实测 factor 200）；PUR = builder 约定；Unichain = TEE 内小费排序（只证明“谁建的块”）；Timeboost 正在被 PGA 替换提案挑战；Express Relay 已停运；UniswapX priority 路径已废弃。
3. **其他生态**：BAM MPP（50ms 轮、Phase 1 maker 更新不可被 tip 越过，覆盖 37.66% stake）、Hyperliquid（batch 内三类排序，共识强制）、Block SDK（lane = Match + 容量上限 + 比较器；默认不验证）、AMQ（下一 slot 结算）、Injective FBA。共同结构是“外层分档 + 内层比较器”（D6）。
4. **边界**：规则冲突无解（L33）、建块难验块易（L34、L36）、排序正确 ≠ 不审查（L27、X45）、容量隔离 ≠ 费用隔离（L15、L20）、AA 下 `tx.gasprice` 只反映 bundler（A30）。可写进有效性规则的只有可从区块内容复核的约束（D7）。
5. **Mantle 设计**：用户假设部分成立——payment 需要的是“容量保底 + 合格队头 FCFS + 独立 nonce 域”，DeFi 需要再拆为“维护操作 phase-first + 套利小费拍卖”（D3、D4、D16）。Mantle 已有 preconf FIFO 车道雏形（D8），建议在 mantle-reth builder 内做五车道调度（D9、D11），协议层强制留到后期（D12）。

## 资料中被修正的地方（汇总）

- **Mantle 现状**：外部调研没提 Mantle 已有 preconf FIFO 车道（M13–M24）；建议的工程入口（Rollup-Boost / op-rbuilder）与 Mantle 现行方向（自研 mantle-reth preconf builder）不符（M30–M32）。
- **过时项目**：Pyth Express Relay 已停运（B40）；Timeboost 有 PGA 替换提案（B28–B29）；UniswapX priority 路径已废弃（A38）；Skip Block SDK 已归档且默认不验证 lane 规则（X32、X35）。
- **不准确的表述**：Angstrom L2 的 Unichain 部署无法证实（A28）；Angstrom L1 的锁是全局的（A2）；Unichain“可验证排序”只是 TEE 信任（B20）；ACE 帖关于 dYdX vote extensions 的说法与 dYdX 一手来源不符（X39）；ACE 中的 Atlas 是 Ellipsis Labs 的 SVM L2，不是 FastLane Atlas（A43）；4337 原文不讨论 `tx.gasprice`（L44）；Hyperliquid 现行规则是 post-only 先于 cancel（X26）。
- **来源矛盾**：Mantle 2024 fair sequencing 博客原 URL 已重定向（M44、L46），L 路从 Wayback 2026-03-17 快照读到正文（L45），M 路未读到；以 L 路为准。Arsia 主网日期 L2BEAT 写 2026-04-16，旧笔记记录的 changelog 写 04-22（M2，未复核）。
- **产品方向来源**：meme launchpad、perps 只来自用户 brief，Mantle 官方一手表述是 payment（2D nonce）、Prop AMM 撤单优先、RWA / 机构金融（M28、M29、M42、M43）。

## 设计综合（D 行的推理过程）

**外层与内层分开。** 已有设计都把“谁能进区块”和“进来后怎么排”拆开（D6）。Tempo / BSC 只管前者（D3）；BAM、Hyperliquid、Block SDK 同时管两者。用户的“对完整区块空间再分配”对应外层；“payment FCFS / DeFi tips”对应内层。

**外层不能按小费分配。** MEV-tax 应用把约 99.5% 的出价付给应用（A36），按 sequencer 小费分配外层空间会挤出它们（D5）。外层用类别 + 保底 / 上限。

**为 Mantle 建议的车道**（D9，设计建议）：

| 车道 | 进入条件（确定性分类） | 内层规则 | 容量 |
|---|---|---|---|
| 强制交易 | deposit / L1 info | 协议固定 | — |
| 维护 | 登记的做市 / oracle 合约 × selector × 签名者；每市场每轮只留最新一笔 | phase-first：每个 flashblock 开头先执行；不可被小费越过 | 小上限 |
| 支付 | 父状态代币名单 × TIP-1045 式 selector / ABI 长度白名单；access list、7702 授权为空 | 合格队头之间 FCFS（按 sequencer 接收顺序）；独立 nonce 域 | 保底 + 上限 |
| 发射 | launchpad 合约 × selector | 由应用选择：小费拍卖或批量清算 | 上限（隔离热点） |
| 通用 / DeFi | 其他所有交易 | 有效小费优先、同价 FIFO（现状）；承载 MEV-tax 应用 | 剩余空间 |

**强制力分阶段。** 第一阶段放在 builder（mantle-reth preconf builder 已有 select! + 配额骨架，D11），配合链上策略注册（路线图的“预确认策略上链”）与公开回执 / 指标（D18）。只有可从区块内容复核的规则（容量、分段顺序）才值得写进派生 / 证明（D7、D12）。FCFS 的到达时间和不审查只能靠回执、forced inclusion 与可追责机制。

**必须预先定好的边界。** 冲突处理（D15）、fallback 不得静默降级（D14）、MEV tax 只适用于 MNT/X 池（D17）、比例要从回放中测（D19）。

## 开放问题（跨分册）

1. Mantle 主网是否启用 preconf 车道、白名单是谁（M22）。
2. Mantle Flashblocks 的实现载体（op-rbuilder + rollup-boost，还是 mantle-reth preconf builder）。
3. kona-executor 与 mantle-reth 执行代码是否同源（决定协议层规则要实现几次）。
4. Arbitrum PGA 提案的投票结果与执行状态（B29）。
5. Unichain 公开 attestation 是否已上线（B17）。
6. Angstrom L1 罚没是否上线、L2 Unichain 部署是否存在（A10、A28）。
7. 两条 payment lane 在拥堵时的实际延迟改善没有数据（L 路）。
8. Mantle 官方对 perps / meme launchpad 的排序需求没有一手表述（M43）。

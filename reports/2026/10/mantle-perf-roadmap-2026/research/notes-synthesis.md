# notes-synthesis：草稿事实、GPT 评审核对、路线综合（台账前缀 U / G / R）

主会话写，2026-10-31。U = 草稿（被评审对象）里的陈述；G = GPT 评审的核对结论；R = 路线综合推断（建议，不是 Mantle 已批准的计划）。

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| U1 | 草稿把路线分成 6 类 11 项（网络广播、出块路径、更短区块、区块空间分配、evm2、pEVM、commitment、DB、state expiry、DA、多证明），并给出短 / 中 / 长期紧急程度 | `research/references/drafts.md` 路线表 | observed |
| U2 | 草稿 §2.1 给出 8 个出块路径实验 E1–E8 与“实验结果 → 优化举措”判读表，阈值包括 50 ms、300 ms、200 ms、500 ms、0.1%、5 分钟 | `research/references/drafts.md` §2.1 两张表 | observed |
| U3 | 草稿称去年调研发现 Mantle 交易依赖程度高，盲目做 pEVM 收益不高（作者陈述，本次未复现） | `research/references/drafts.md` 执行行；口径见 X49 | speculative |
| U4 | 草稿称根据之前的压测，Mantle 的性能瓶颈主要在 ZK proof system（作者陈述，没有公开结果） | `research/references/drafts.md` DA/证明行；见 D51 | speculative |
| U5 | 草稿 E7 的负载是“mStocks 类交易组合”，E8 是约 40 个满块后停止加压 | `research/references/drafts.md` E7、E8 行 | observed |
| G1 | GPT 关于 reth 预确认 journal（flush 不 fsync、追加失败仍返回）的代码发现属实 | 由 P22、P23 核实 | inferred |
| G2 | GPT 关于 `--preconf.all` 污染 E3 对照组的发现属实，但低估了影响：开启后不存在普通路径，还受 2M / 6M 上限约束 | 由 P15–P21 核实 | inferred |
| G3 | GPT 没有发现主网 sequencer 仍是 op-geth，也没有区分 op-geth 与 reth 两套预确认实现 | `research/gpt-deep-research.md` 全文无 op-geth 预确认的讨论；对照 K2、K11 | observed |
| G4 | GPT 关于 Reth v2.9.0 切换 evm2 的日期与 breaking 范围属实 | 由 X14–X16 核实 | inferred |
| G5 | GPT 用 Base pending-state 作为 E5 状态流参考已过时（Denim 取消 pending 状态） | 由 P62、P66 推出 | inferred |
| G6 | GPT 的 152 / 228 KB/s 复核、EIP-8135 引用、DA footprint scalar 语义、EIP-1559 参数方向修正都属实 | 由 D3、D9、D19–D21、D35 核实 | inferred |
| G7 | GPT 称 BSC Payment Lane 于 2026 年 9 月公布，本次找到的一手来源都是 2026-10 | 由 D60、D61 推出 | inferred |
| G8 | GPT“不宜再笼统写成 MDBX v1 还是 v2”说过头：Storage v1 / v2 是 reth 官方术语，可以用 `db settings get` 直接回答 | 由 X30–X32 推出 | inferred |
| G9 | GPT 没有发现 Mantle 的两个 payload builder 都不接入 sparse trie / execution cache，也没有提到生产每块持久化 | `research/gpt-deep-research.md` §2.4、E11 只讨论上游能力；对照 X42、K5 | observed |
| R1 | 草稿的三条主线成立：先测出块路径、不直接套用外部链的性能结论、把 RPC / DA / 证明滞后一起纳入观察 | 由 U2 与 K10、X43、D27、D70 的核对结果推出（外部结论确实不能直接套用） | inferred |
| R2 | 每个实验都要写明 sequencer 的执行客户端（op-geth 或 reth）与预确认模式，否则数据不能对照 | 由 K2、K3、K10、P88 推出 | inferred |
| R3 | 预确认承诺审计（E4）应提前为上线门槛，并对 op-geth 与 reth 两条路径分别做 | 由 P22–P27、P43、P82–P88 推出 | inferred |
| R4 | reth 接任主网 sequencer 之前，至少要完成三件事：重设预确认资格与预算、通过 E4、测清封块 root 与持久化耗时 | 由 P20、R3、X42、X75、K5 推出 | inferred |
| R5 | 证明流水线诊断应从中 / 长期提前到短期：持续性门槛（单个 range < 约 3,600 s）明确，数据大多已有 | 由 D70、D41、D45、K24 推出 | inferred |
| R6 | 存储与持久化盘点应提前到短期：Storage v1 在 2027-01 EOL，生产每块持久化，且生产配置与开发者认知曾不一致 | 由 X25、X31、K5、K8 推出 | inferred |
| R7 | DA 计量校准（footprint 普查与估计字节校准）放短期：只需读数据，且决定 E7 的判读 | 由 D24–D27 推出 | inferred |
| R8 | evm2 不宜作为“随上游升级”的短期项：先追平仍用 revm 的上游版本，evm2 作为对照组，并优先等 OP 上游 | 由 X17、X22、X24 推出 | inferred |
| R9 | 更短 canonical 区块是协议级改造，应放中期，并以“每秒工作量相同”为对照 | 由 P53、P54、P57、P58、P63、P64、P87 推出 | inferred |
| R10 | 区块空间分配（LFM / lanes / ASS）维持长期，近期只做需求分析 | 由 K18、D65 推出 | inferred |
| R11 | pEVM 维持中 / 长期，先用 slot 级读写集与加权关键路径重测 | 由 X46、X49、X50 推出 | inferred |
| R12 | commitment 替换维持长期，按三类拆开，先用证明成本拆分决定是否值得 | 由 X60、X61、X68、X69 推出 | inferred |
| R13 | state expiry 维持低优先级，动机应改写为“历史与活跃状态的占用”，可先用 Storage v2 与裁剪解决 | 由 X72、X74 推出 | inferred |
| R14 | 多证明（TEE + ZK）应按安全与结算目标单独立项，不算性能优化 | 由 D54 推出 | inferred |
| R15 | “网络广播”一行应改写为 L2 的数据分发：unsafe gossip、备机、读副本与订阅者，放中期 | 由 P76、P77、P71、P73、P42 推出 | inferred |
| R16 | 草稿的阈值应先作为候选阈值，并绑定测量端点、负载组合与承诺级别；样本量要能估计所报的分位数 | 由 U2、K35、K36、P78、K39 推出 | inferred |
| R17 | 当前主网不缺吞吐：平均利用率约 0.3%，最重的证明 range 平均每块只用 target 的约 10% | 由 K18、K31 推出 | inferred |

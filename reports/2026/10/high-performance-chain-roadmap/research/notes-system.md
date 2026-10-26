# S 路调研笔记：系统模型、网络传播、排序与共识（L1 视角为主）

> 目标文件：`reports/2026/10/high-performance-chain-roadmap/research/notes-system.md`（本次运行按指令写入 artifact 路径，内容即该文件全文）。
> 调研日期：2026-10-27。所有网页访问日期均为 2026-10-27，除非另注。台账编号前缀 `S`。

---

## S-Q1 系统模型：组件拆分与 L1 / OP Stack L2 的分工

**答案。** 8 个组件 + 横切的资源计量/费用这个拆法可以用，但要讲清楚：L1 的“执行客户端 + 共识客户端”是一手文档里的真实分工（S1）；OP Stack 型 L2 把“排序/出块”交给单个 sequencer，把“安全性”放在“能否从 L1 数据重新派生出 L2 链”这件事上（S2–S5）。因此 L2 的实时路径（sequencer → unsafe 区块）和安全路径（batcher → L1 DA → 派生 → 故障证明）分属不同时间尺度：OP Mainnet 上分别约 2 秒、几分钟、15–30 分钟和约 1 周的提现挑战期（S4、S6、S7）。GPT 文中的“吞吐受资源预算约束、延迟受关键路径约束”和 `T ≥ max(W/p, L)` 都是**推导**，不是哪个项目实测或规范写出来的。其中 `T ≥ max(W/p, L)` 可以直接引用并行计算里的 work/span 下界（Blumofe–Leiserson）作依据（S8）；`Σλc ≤ B` 只是“资源利用率不能超过 1”的通用论证，没有区块链专属的一手来源（S9）。

**各组件在 L1 与 OP Stack L2 中由谁承担、限制什么（研究者整理，依据见台账）：**

| 组件 | L1（以 Ethereum 为例） | OP Stack 型 L2 | 主要限制 |
|---|---|---|---|
| ① 账户/交易表达与准入（RPC、mempool） | 所有节点的执行客户端都维护 txpool 并 gossip（S1）；EIP-7825 在 txpool 层就拒绝 gas > 2^24 的交易（S52） | sequencer 一个入口；用户交易先转发给 sequencer（S4） | 吞吐（无效请求的成本）、延迟（排队） |
| ② 网络传播 | 提案/投票/blob 在验证者之间传播 | sequencer 通过公开 p2p 分发 unsafe 区块（S19）；Base 这类链还有 Flashblocks 流（S20） | 延迟、尾延迟、状态新鲜度 |
| ③ 排序/共识/出块 | 共识客户端 + 验证者投票（S1） | sequencer 单方排序，安全性来自 L1 派生（S2、S5） | 延迟（通信轮次）、最终性 |
| ④ 执行（调度 + VM） | 执行客户端（S1） | sequencer 与所有跟随节点都执行；派生/证明环境也要能重放（S2） | 吞吐（W/p 与关键路径 L）（S8） |
| ⑤ 状态访问/承诺/持久化 | 执行客户端持有状态（S1） | 同左，再加 output root 提交（S7） | 吞吐、尾延迟 |
| ⑥ 数据可用性 | 自身区块 + blob（S53） | batcher 把数据发布到 L1；未在 sequencing window 内发布的交易会被丢弃（S5） | 持续能力 |
| ⑦ 验证与结算 | 自身共识最终性 | “finalized” = 派生自已最终的 L1 数据；提现走约 1 周的故障证明（S3、S6、S7） | 持续能力、最终性 |
| ⑧ RPC/索引/状态流/同步恢复 | 节点同步模式（S1） | unsafe/safe/finalized 三个 head 对应 RPC 的 `latest`/`safe`/`finalized` 标签（S4） | 状态新鲜度、追赶余量 |
| 横切：资源计量/费用 | gas、blob gas、重定价 EIP（S47） | L2 gas + L1 数据费 | 决定谁承受拥堵 |

**依据：** S1–S9。
**不确定之处：** “8 层”是职责划分，不是任何规范的定义；各项目的组件边界不同（例如 Monad 把执行从共识的关键路径上移走，见 S-Q4）。`Σλc ≤ B` 没有找到可直接引用的区块链一手来源，只能写成推导。

---

## S-Q2 网络传播：L1 瓶颈与方案；L2 的对应问题

**答案。** L1 的传播瓶颈主要有三类：leader 的上行扇出带宽、传播跳数（每一跳至少一个单程网络时延），以及丢包和恶意中继带来的冗余开销。各家方案的共同做法是**纠删码分片 + 按质押比例分摊转发**：Solana Turbine 用多层树（fanout 200，常见 2–3 跳）（S11）；Monad RaptorCast 用两层树，最坏情况的传播时间等于一个 RTT，每个验证者的上行带宽只与消息大小成正比、与验证者数量无关（S12–S13）；Alpenglow 的 Rotor 改成单层中继以减少跳数，但**截至 2026-10-27 尚未排期，Solana 主网仍在用 Turbine**（S14）。Anza 的判断是：传播延迟主要由网络时延决定，而不是传输或计算时间（S15）。这正是 DoubleZero 这类专用光纤网络要解决的问题。按 DoubleZero 自己的数据面板，约 58% 的 Solana 质押已接入；但它宣传的“入口 FPGA 过滤”还没有上线（S17–S18）。Solana 把区块上限提到 100M CU 之前，先要求超过 70% 的质押启用 XDP 内核旁路网络，说明传播能力是提高区块容量的前置条件（S16）。Hyperliquid 只公开了端到端延迟和“瓶颈在执行”（S40），没有公开网络层设计细节。
L2 的对应问题不在于“全网投票”，而在于 sequencer 向跟随节点、RPC 和应用的分发：OP Stack 通过公开 p2p 分发 unsafe 区块（S19）；Base 用 200ms 一个的 Flashblocks 提前锁定顺序并对外流式发布（S20）。websocket-proxy 等细节归 B 路。

**依据：** S11–S20、S40。
**不确定之处：** Turbine 的 fanout 200 和 2–3 跳来自 Anza 文档的检索摘要，未逐段核对全文；DoubleZero 的接入比例是项目方自己的实时面板，随时会变；Rotor 的预期收益只有白皮书仿真。内部研究《Optimum Intro》(Notion) 中的“Solana 带宽峰值 1 Gbps vs geth 25 Mbps”“Optimum 带宽效率提高至 20 倍”没有追到一手测量，本路不采用。

---

## S-Q3 共识与排序：轮次下界与正常路径优化

**答案。** 理论下界：部分同步的拜占庭共识要在正常路径上做到 2 个消息延迟（“快速”），节点数至少要 5f−1（Kuznetsov–Tonkikh–Zhang, PODC'21）；只做到 n=3f+1 的话，PBFT 类协议需要 3 个消息延迟（S21）。因此“更快的正常路径”通常要用更多冗余节点、更低的容错比例或更强的网络假设来换。各项目情况：

| 协议 | 解决什么 | 正常路径延迟 | 代价/假设 | 状态（截至来源日期） |
|---|---|---|---|---|
| Solana Alpenglow / Votor | 投票不再上链；一轮（≥80% 质押）或两轮（≥60%）就能最终确认 | 目标约 150ms，是**仿真中位数，未计入计算开销**（S25） | 容错 “20+20”：20% 恶意 + 20% 离线（TowerBFT 需要 >2/3 质押才能 confirmed）（S24）；Firedancer 未支持迁移（S28） | 2026-10-21 主网激活（S22）；Rotor 未上线（S14） |
| MonadBFT | 流水线 HotStuff 类 BFT 的 tail-forking 问题；leader 故障时只需等一次超时 | 1 轮（300ms）推测最终性，2 轮（600ms）完全最终性 | 推测最终性在原 leader 双签等少数情况下可回滚 | 主网 2025-11-24 上线；2026-07 把出块时间从 400ms 调到 300ms（S30–S31） |
| Aptos Raptr / Baby Raptr / Zaptos | 把数据传播（Quorum Store）的证明步骤从关键路径上移走；Zaptos 把执行、提交流水线化 | Raptr 论文：250k TPS 下 755ms（实验环境）；Zaptos：100 个验证者的“类主网”环境中，高负载下延迟降低约 40% | 论文结果，不是主网实测 | Baby Raptr 2025-06 上主网（4 跳）；完整 Raptr 的主网状态未查到（S32–S34） |
| Sui Mysticeti v2 | 无证书 DAG；v2 把交易验证并入共识 | 提交中位数需要 4 轮消息，目标降到 3 轮；Transaction Driver 让亚洲全节点端到端延迟从约 1.00s 降到 0.65s（Mysten 自测） | 拒绝票是显式投票，接受票隐含在 DAG 链接里 | Sui v1.60 起默认启用（S35–S36） |
| Sei Giga / Autobahn | DA 层与共识层分离（DA 上需 f+1 票的 PoA）；多提议者；异步执行 | 内部测试网 >5 gigagas/s、<250ms 最终性 | 只有内部测试网数据 | Autobahn 截至 2026-10-16 仍“coming soon”（二手报道）（S37–S38） |
| Hyperliquid HyperBFT | HotStuff 变体，针对端到端延迟优化 | 同地部署的客户端：端到端中位 0.2s，p99 0.9s | 官方称瓶颈在执行 | 主网约 200k orders/s（S40） |

**依据：** S14、S21–S40。
**不确定之处：** Alpenglow 上线后还没有独立的主网最终性实测（S26）；Aptos “Archon” 没找到一手来源；Sei 的状态只有二手报道。

---

## S-Q4 执行与共识解耦

**答案。** 解耦的核心是“共识只对**顺序**达成一致，执行结果滞后几块再被承诺”。这样执行可以用满整个出块间隔，而不必与共识通信挤在同一窗口里（Monad 自己的说法是：Ethereum 交错式执行的预算只占 12 秒块时间的约 1%）（S41）。
- **Monad：** 状态根延迟 D=3 块；节点执行出错会在 D 块后掉出共识并回滚重放（S42）。共识只看得到滞后 k=3 块的状态，所以引入 reserve balance（10 MON）：共识阶段按“在途 gas 支出 ≤ 储备”放行交易，执行阶段让会让余额跌破储备的 value 支出 revert；新充值的账户要等 k 块后才能发交易（S43）。
- **Solana（bankless leader / APE）：** 前提是把“需要执行结果才能判断的协议违规”改成运行时失败。截至 2026-10-27：SIMD-0298 随 Alpenglow 激活（投票只带 `(slot, block_id)`，bank_hash 移到 block footer）；SIMD-0290 已合入 Agave，等待激活；SIMD-0297 已批准；作为最后一步的 SIMD-0301 仍在 review（S44）。所以 Solana 的执行与投票**尚未完全解耦**。
- **Ethereum：** Glamsterdam 采用的是 ePBS（EIP-7732），不是 EIP-7886（延迟执行，Stagnant，未列入 Glamsterdam）（S46）。ePBS 让 PTC 在证明时不必验证执行 payload，下一个 proposer 有半个 slot、其他验证者有约四分之三个 slot 来验证（S45）。
- **代价（推导，S58）：** ① 状态根和回执滞后，轻客户端和桥只能证明 D 块前的状态；② 准入只能基于旧状态，需要 reserve balance 或“无效交易照样上链并收费”这类规则改动，这会改变用户可见的语义；③ 执行分歧要过几块才被发现，回滚范围变大；④ ePBS 还带来 builder 扣留 payload 的 free option 问题，slot N 的交易要到 N+1 才被广泛验证（S45）。

**依据：** S41–S46、S58。
**不确定之处：** Glamsterdam 主网时间未定（S48）；SIMD-0301 何时激活没有时间表。

---

## S-Q5 Ethereum L1 与 Solana 的扩容基线（2025–2026）

**答案。**
- **Ethereum gas limit：** EF 2026-02 的文章称主网已从 30M 提到 60M（S50）。Fusaka 包含 EIP-7935（默认 60M）（S54）。截至 2026-10，没有一手来源显示主网超过 60M；Glamsterdam 在 Sepolia 上测试 200M，主网激活时间未定（S48、S51）。EIP-7825（单笔交易 gas 上限 2^24 = 16,777,216）已随 Fusaka 上线（S52、S54）。
- **Glamsterdam：** EIP-7773 列了 18 个 scheduled EIP，包括 EIP-7732（ePBS）、EIP-7928（BAL）、EIP-8037/8038（状态创建/访问重定价）、EIP-2780、EIP-7976、EIP-7981 等；EIP-7904 只是 informational（S47）。Sepolia 2026-10-06 激活；Hoodi 原定 2026-10-26，**10-22 因 EIP-8037 与主网合约的交互问题推迟**，新日期未定；主网未定（S48）。EF 原计划 Glamsterdam 在 2026 上半年上线，实际已经推迟（S49）。
- **Fusaka / PeerDAS / BPO：** Fusaka 2025-12-03 上主网；BPO1 于 2025-12-09 把 blob target/max 调到 10/15；BPO2 于 2026-01-07 调到 14/21（S53）。
- **Solana：** 区块 CU 上限从 50M 提到 60M（SIMD-0256，2025-07-22），再提到 100M（SIMD-0286，2026-07-29），单账户写入上限维持 12M（S55）。slot 时间从 400ms 降到 200ms（SIMD-0525，2026-10-09 完成）（S56）。Firedancer 的主网占比只有二手数据，且与 Foundation 的迁移说明相互矛盾（S57，见“矛盾”）。

**依据：** S47–S57。
**不确定之处：** 45M 这一档的具体日期只有二手来源，36M 一档没有核实；Glamsterdam 之后是否还有 BPO3+ 没有查到；Firedancer 的质押占比不确定。

---

## S-Q6 L1 vs L2 每个组件的独有限制（总结）

**答案（研究者归纳，依据见台账）：**
- **L2 独有：** ① 单 sequencer 是入口热点，软最终性要信任 sequencer 和 batcher key（S5）；② L2 链必须能从 L1 数据确定性地重新派生，执行规则和上下文（L1 origin、deposits）都受派生约束（S2）；③ DA 发布能力决定持续吞吐：数据没能在 sequencing window 内发布，对应交易会被丢弃（S5）；④ 证明和挑战能力：OP 的故障证明挑战期约 1 周，最大博弈深度 73（S7）；⑤ “finalized” 依赖 L1 最终性，由 L1 的 epoch 节奏决定（S4）。
- **L1 独有：** ① 全复制执行，所有验证者都要重放，所以提高区块容量受“最慢的合格验证者能否及时重放和追赶”约束（S59）；② 全网投票轮次受 S21 的下界和地理时延约束（S15、S21）；③ 提高硬件门槛与去中心化之间有张力，例如 Alpenglow 迁移把一个独立客户端排除在外（S28）。
- 推导（S60）：L2 可以把实时路径做到很快，但持续吞吐 ≤ min(执行, DA 发布, 证明/挑战余量)；L1 的吞吐 ≤ 验证者集合中“可接受的最慢节点”的重放能力。

**依据：** S2–S7、S15、S21、S28、S59、S60。
**不确定之处：** S60 是推导；ZK 证明吞吐等内容归其他路。

---

## GPT 调研中被修正 / 过时的地方

1. **EIP-7928 状态：** GPT 写的是“Review”。现在已是 Last Call，并列入 Glamsterdam 的 scheduled 清单（S47、[43]）。
2. **Alpenglow：** GPT 正确指出 150ms 是仿真、未计入计算开销，但写于主网上线之前。现在 Votor 已于 2026-10-21 上主网，而“数据分发也一并优化”的那部分（Rotor）**尚未部署**（S14、S22）。
3. **Ethereum 延迟执行：** GPT 没有区分 ePBS 和延迟执行。Glamsterdam 采用的是 EIP-7732 的“延迟验证”，EIP-7886 是 Stagnant，未列入（S45–S46）。
4. **容量模型：** `Σλc ≤ B`、`T ≥ max(W/p, L)` 都是推导，应在页面上标注为推导；后者可以引用 work/span 下界作依据（S8–S9）。
5. **OP Stack 最终性：** GPT 引用的 OP 文档已更新：新增 Subblocks 约 200ms 预确认、各阶段的典型时间，以及“未在 sequencing window 内发布则丢弃”的说明（S4–S5）。
6. **Monad：** GPT 的描述正确，但缺少参数：D=3、reserve balance 10 MON，以及出块时间已从 400ms 调到 300ms（S31、S42–S43）。

**内部 2025 研究需修正的地方：**
- 内部研究《Solana 新 Roadmap 解读》(Notion) 写“Alpenglow 将 1/3 容错降低到 20%”。官方表述是 “20+20”：容忍 20% 恶意质押，**外加** 20% 离线质押（S24）。“降低到 20%”是不完整的说法。
- 同一文档把 Alpenglow 和 APE 的时间写成“2025 年底/2026 年初”。实际情况是：Votor 于 2026-10-21 上线；Rotor 未排期；APE/bankless leader 的依赖仍未全部激活（S14、S22、S44）。
- 同一文档写“Rotor 已取代 Turbine”的含义与现状不符（Rotor 未上线）（S14）。
- 内部研究《Solana 高性能设计解析》《Monad 高性能设计解析》《区块属性对于链的 ux 影响分析》(Notion) 的本地副本只有附件占位，正文不可读，本路未引用其结论。

---

## 矛盾

- **Firedancer 是否参与 Alpenglow 后的共识：** solana.com 的 Alpenglow 页面称 Firedancer/Frankendancer “were not supported for the migration”，并要求切换到 Agave 系客户端 [14]；二手统计 [41] 称 epoch 1065（2026-10-23）Firedancer 有约 16.94% 的活跃质押、69 个投票验证者。两者无法同时成立：要么 [41] 的客户端识别有误，要么 Firedancer 在激活后已获得支持。未解决。
- **Glamsterdam 时间：** EF 2026-02 计划“2026 上半年”[36]；ethereum.org 的页面摘要写“预计 2026 Q4”；EF 10-22 的公告称 Hoodi 推迟、新日期未定 [31]。以最新的 [31] 为准。
- **Solana 区块 CU 历史：** 本路任务说明写“48M → 60M”；Foundation 页面写的是 50M → 60M（SIMD-0256），48M → 50M 是更早的 SIMD-0207 [17]。

---

## 来源

[1] **PRIMARY** ethereum.org《Nodes and clients》https://ethereum.org/en/developers/docs/nodes-and-clients/ 。证明：一个节点必须同时运行执行客户端和共识客户端，以及两者的分工。访问 2026-10-27。
[2] **PRIMARY** OP Stack Specification《Derivation》https://specs.optimism.io/protocol/derivation.html 。证明：L2 区块从 sequencing window 内的 L1 数据派生；unsafe/safe/finalized head 的定义。访问 2026-10-27。
[3] **PRIMARY** Optimism Docs《Transaction finality》https://docs.optimism.io/stack/transactions/transaction-finality 。证明：各阶段的典型时间、对 sequencer 和 batcher 的信任假设、12 小时 sequencing window、“7 天”是提现延迟而非最终性。访问 2026-10-27。
[4] **PRIMARY** Optimism Docs《Fault proofs explainer》https://docs.optimism.io/stack/fault-proofs/explainer 。证明：约 1 周挑战期、无许可提案与挑战、最大博弈深度 73。访问 2026-10-27。
[5] **PRIMARY** Blumofe & Leiserson,《Scheduling Multithreaded Computations by Work Stealing》, JACM 1999, https://dl.acm.org/doi/10.1145/324133.324234 。证明：P 处理器执行时间由 work T1/P 与 span T∞ 共同约束（T1/P + O(T∞)）。访问 2026-10-27。
[6] **PRIMARY** Gelashvili et al.,《Block-STM》arXiv:2203.06871 v3, https://arxiv.org/abs/2203.06871 。证明：并行执行的结果必须等同于预设顺序；32 线程基准测试的吞吐数字。访问 2026-10-27。
[7] **PRIMARY** Monad Docs《Asynchronous Execution》https://docs.monad.xyz/monad-arch/consensus/asynchronous-execution 。证明：共识不执行交易；D=3 延迟状态根；推测执行；新充值账户的等待。访问 2026-10-27。
[8] **PRIMARY** Monad Docs《Reserve Balance》https://docs.monad.xyz/developer-essentials/reserve-balance 。证明：k=3、10 MON 储备，以及共识阶段和执行阶段的规则。访问 2026-10-27。
[9] **PRIMARY** Monad Docs《RaptorCast》https://docs.monad.xyz/monad-arch/consensus/raptorcast 。证明：Raptor 码、两层树、上行带宽与验证者数量无关、最坏一个 RTT、冗余系数算例。访问 2026-10-27。
[10] **PRIMARY** Monad Docs《MonadBFT》https://docs.monad.xyz/monad-arch/consensus/monad-bft 。证明：1 轮推测最终性 / 2 轮最终性、300ms/600ms、线性通信、抗 tail-forking、leader 故障隔离。访问 2026-10-27。
[11] **PRIMARY** Monad Docs 首页 https://docs.monad.xyz/ 与 Monad Blog《How Monad Works》（changelog 2026-07-23）https://blog.monad.xyz/blog/how-monad-works 。证明：主网 2025-11-24 上线；出块时间 400→300ms、最终性 800→600ms。访问 2026-10-27。
[12] **PRIMARY** Anza Docs《Turbine Block Propagation》https://docs.anza.xyz/consensus/turbine-block-propagation （仅读检索摘要）。证明：分层传播、DATA_PLANE_FANOUT。访问 2026-10-27。
[13] **PRIMARY** Anza Blog《Alpenglow: A New Consensus for Solana》（2025-05-19，白皮书 v1.2 于 2026-07-29 发布）https://www.anza.xyz/blog/alpenglow-a-new-consensus-for-solana 。证明：150ms 是基于当时质押分布的仿真、不计计算开销；“20+20”；Rotor 单层中继；延迟由网络时延主导。访问 2026-10-27。
[14] **PRIMARY** Solana Foundation《Alpenglow》（Updated October 2026）https://solana.com/upgrades/alpenglow 。证明：2026-10-21 epoch 1064 主网激活；80%/60% 阈值；Rotor 未排期；150ms 是“期望值”；Firedancer 未支持迁移；confirmed 与 finalized 合一。访问 2026-10-27。
[15] **PRIMARY** SIMD-0326 Alpenglow, https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0326-alpenglow.md （检索摘要）。证明：本 SIMD 不含 Rotor（暂留 Turbine），异步执行另立 SIMD。访问 2026-10-27。
[16] **PRIMARY** Solana Foundation《Reduced Slot Times》https://solana.com/upgrades/reduced-slot-times 。证明：SIMD-0525 分四步降到 200ms，2026-10-09 完成。访问 2026-10-27。
[17] **PRIMARY** Solana Foundation《100M CU Blocks》https://solana.com/upgrades/100m-cu-blocks 。证明：50→60M（SIMD-0256，2025-07-22）、60→100M（SIMD-0286，2026-07-29）；单账户写入 12M 不变；前置条件是 XDP；大区块拖慢重放和追赶。访问 2026-10-27。
[18] **PRIMARY** SIMD GitHub Issue #324《Roadmap: Bankless Leader》https://github.com/solana-foundation/solana-improvement-documents/issues/324 。证明：bankless leader 各依赖 SIMD 的状态（0290 合入待激活、0298 随 Alpenglow 激活、0301 review）。访问 2026-10-27。
[19] **PRIMARY** DoubleZero Docs https://docs.doublezero.xyz/ 及 Solutions 页 https://doublezero.xyz/solutions （检索摘要）。证明：edge filtration “not yet functional / Coming in 2026”。访问 2026-10-27。
[20] **PRIMARY** DoubleZero Data《Solana Overview》https://data.doublezero.xyz/solana/overview （项目方实时面板，检索摘要）。证明：epoch 1066 时 422 个验证者、约 58% 质押在 DZ 上。访问 2026-10-27。
[21] **PRIMARY** Kuznetsov, Tonkikh, Zhang,《Revisiting Optimal Resilience of Fast Byzantine Consensus》PODC'21, https://arxiv.org/abs/2102.12825 。证明：两步快速拜占庭共识当且仅当 n ≥ 5f−1；PBFT 需要 3 个消息延迟。访问 2026-10-27。
[22] **PRIMARY** Tonkikh et al.,《Raptr》arXiv:2504.18649, https://arxiv.org/abs/2504.18649 。证明：实验中 250k TPS 时 755ms，10k TPS 时更低。访问 2026-10-27。
[23] **PRIMARY** 《Zaptos: Towards Optimal Blockchain Latency》arXiv:2501.10612, https://arxiv.org/html/2501.10612v1 。证明：100 个验证者“类主网”环境中，低负载延迟降低 170ms，高负载降低约 40%。访问 2026-10-27。
[24] **PRIMARY** Aptos Network《Baby Raptr Is Here》https://aptosnetwork.com/currents/baby-raptr-lands-on-mainnet （直接抓取返回 429，内容取自检索摘要）。证明：Baby Raptr 上主网、4 跳。访问 2026-10-27。
[25] **PRIMARY** Mysten Labs《Mysticeti v2》（2025-11-06，修改 2026-08-10）https://www.sui.io/blog/mysticeti-v2-sui-consensus 。证明：交易验证并入共识；Transaction Driver 的实测延迟；v1.60 起默认启用；中位数 4 轮消息、目标 3 轮。访问 2026-10-27。
[26] **PRIMARY** Sei Labs《Sei Giga》arXiv:2505.14914 v3（2026-06-29）https://arxiv.org/abs/2505.14914 。证明：内部测试网 >5 gigagas/s、<250ms；Autobahn 的 DA/共识分离；异步执行。访问 2026-10-27。
[27] 二手：TokenPost《Sei's Giga Roadmap Lists Autobahn Mainnet as Coming Soon》（2026-10-16）https://www.tokenpost.com/news/technology/33112 。证明：Autobahn 主网未上线（未核实一手来源）。访问 2026-10-27。
[28] **PRIMARY** Hyperliquid Docs《HyperCore Overview》https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/overview 。证明：HyperBFT 是 HotStuff 变体；端到端中位 0.2s / p99 0.9s；约 200k orders/s；瓶颈在执行。访问 2026-10-27。
[29] **PRIMARY** EIP-7773《Hardfork Meta - Glamsterdam》https://eips.ethereum.org/EIPS/eip-7773 。证明：scheduled EIP 清单；Sepolia/Hoodi 激活表（主网空白）。访问 2026-10-27。
[30] **PRIMARY** EF Blog《Glamsterdam Hoodi Testnet Announcement》（2026-10-16，含 10-22 更新）https://blog.ethereum.org/en/2026/10/16/glamsterdam-hoodi-announcement 。证明：ePBS 让验证者有更多时间验证 payload；BAL 的用途；Hoodi 200M 计划。访问 2026-10-27。
[31] **PRIMARY** EF Blog《Glamsterdam on Hoodi Postponed》（2026-10-22）https://blog.ethereum.org/2026/10/22/glamsterdam-hoodi-delay 。证明：Hoodi 激活和 200M 计划撤回，原因是 EIP-8037，新日期未定。访问 2026-10-27。
[32] **PRIMARY** EIP-7732（Last Call, deadline 2026-11-01）https://eips.ethereum.org/EIPS/eip-7732 。证明：执行验证与共识验证在逻辑和时间上解耦；PTC 不验证 payload；验证窗口；free option 问题。访问 2026-10-27。
[33] **PRIMARY** EIP-7886《Delayed execution》（Stagnant）https://eips.ethereum.org/EIPS/eip-7886 。证明：延迟执行的设计（pre_state_root、执行可 revert、预扣费）及其 Stagnant 状态。访问 2026-10-27。
[34] **PRIMARY** EIP-7825《Transaction Gas Limit Cap》（Final）https://eips.ethereum.org/EIPS/eip-7825 。证明：2^24 上限及其 DoS 和验证时间理由。访问 2026-10-27。
[35] **PRIMARY** EIP-7607《Hardfork Meta - Fusaka》（Final）https://eips.ethereum.org/EIPS/eip-7607 。证明：Fusaka 包含 PeerDAS、EIP-7825、EIP-7935；主网与 BPO1/2 的激活时间。访问 2026-10-27。
[36] **PRIMARY** EF Blog《Protocol Priorities Update for 2026》（2026-02-18）https://blog.ethereum.org/2026/02/18/protocol-priorities-update-2026 。证明：gas limit 30M→60M；计划“toward and beyond 100M”；Glamsterdam 原定 2026 上半年。访问 2026-10-27。
[37] **PRIMARY** EIP-8261《Gas Limit Schedule》（Last Call）https://eips.ethereum.org/EIPS/eip-8261 。证明：Gloas 后由 CL 配置 gas limit 时间表；文中把 60M 作为当前默认值。访问 2026-10-27。
[38] 二手：The Block（2025-11-27）https://www.theblock.co/news/ecosystems/2025-11-27-ethereum-block-gas-limit-fusaka-380687 。证明：主网 gas limit 从 45M 升到 60M。访问 2026-10-27。
[39] 二手：CoinDesk（2026-10-08）https://www.coindesk.com/tech/2026/10/08/ethereum-s-glamsterdam-test-runs-near-200-million-gas-per-block-after-upgrade 。证明：Sepolia 约 200M，样本区块只用了 26–46%；主网仍为 60M。访问 2026-10-27。
[40] **PRIMARY** Base Docs《Transaction Ordering》https://docs.base.org/base-chain/flashblocks 。证明：每 200ms 一个 Flashblock，已广播的顺序锁定；块 gas 约 400M。访问 2026-10-27。
[41] 二手：uwuu.ai《Solana Firedancer: 17% of Stake》https://uwuu.ai/blog/solana-firedancer 。证明（未核实）：epoch 1065 时 Firedancer 约占 16.94% 质押。访问 2026-10-27。
[42] **PRIMARY** ethereum.org《Fusaka》https://ethereum.org/roadmap/fusaka 与 EIP-8135（BPO2）https://eips.ethereum.org/EIPS/eip-8135 （检索摘要）。证明：BPO 机制；BPO2 为 14/21。访问 2026-10-27。
[43] **PRIMARY** EIP-7928《Block-Level Access Lists》（Last Call）https://eips.ethereum.org/EIPS/eip-7928 。证明：BAL 的当前状态。访问 2026-10-27。
[44] 内部研究《Solana 新 Roadmap 解读》(Notion, 2025-07) 与《Optimum Intro》(Notion, 2025-H1)。证明：2025 年内部判断（用于对照修正）。

---

## 开放问题

1. Alpenglow 上线后的主网最终性分布（p50/p99），需要等 RPC 提供商或 Anza 公布实测数据；150ms 目前只是仿真/期望值。
2. Firedancer 在 Alpenglow 后的真实参与情况（[14] 与 [41] 矛盾）。
3. Rotor 的 SIMD 编号与时间表；SIMD-0290/0301 何时激活（决定 Solana 何时真正“投票不等执行”）。
4. Glamsterdam 主网日期，以及 EIP-8037 是否会被修改或移出。
5. Aptos 完整 Raptr 是否已上主网；“Archon” 是否存在一手资料。
6. Sei Autobahn 的一手上线状态（目前只有二手报道）。
7. Ethereum 45M 一档的确切日期；Glamsterdam 之后是否有 BPO3+。
8. DoubleZero 在 Hyperliquid 的部署（只有二手提及，未核实）。

---

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| S1 | Ethereum 节点必须同时运行执行客户端（执行交易、持有状态、监听交易）与共识客户端（PoS 共识） | [1] §What are nodes and clients，访问于 2026-10-27 | observed | |
| S2 | OP Stack 的 L2 区块由 L1 sequencing window 内的 batcher 交易、deposit 与 L1 origin 确定性派生 | [2] §Overview / sequencing window，访问于 2026-10-27 | observed | |
| S3 | OP Stack 的 unsafe head 是尚未从 L1 派生的区块，safe head 可由当前 canonical L1 派生，finalized 可由已最终的 L1 派生 | [2] §Engine Queue，访问于 2026-10-27 | observed | |
| S4 | OP Mainnet 典型时间：Subblocks 预确认约 200ms、unsafe 约 2s、safe 数分钟、finalized 约 15–30 分钟 | [3] §How this maps to protocol terms，访问于 2026-10-27 | observed | |
| S5 | OP Stack 软最终性要信任单个 sequencer 与 batcher key，batcher 未在 12 小时 sequencing window 内发布数据时交易会被丢弃 | [3] §The journey from soft finality to hard finality，访问于 2026-10-27 | observed | |
| S6 | OP Stack 的“7 天”是标准桥提现延迟，不是交易最终性，故障证明挑战不会重组 L2 链 | [3] §Common misconceptions，访问于 2026-10-27 | observed | |
| S7 | OP Stack 故障证明的提案与挑战无需许可，挑战期约 1 周，最大博弈深度 73 | [4] §Permissionless challenges / FAQs，访问于 2026-10-27 | observed | |
| S8 | 区块执行时间满足 T ≥ max(W/p, L)，这是并行计算 work/span 下界在区块执行上的套用，不是某个项目的实测 | 由 [5]（T_P 由 T1/P 与 T∞ 约束）与 [6]（结果必须等同于预设顺序，依赖链即 span）推出 | inferred | |
| S9 | “Σ λ·c ≤ B”的资源预算模型只是“任一资源利用率不能超过 1”的通用推导，未找到区块链专属的一手来源 | 由 S8 及 GPT 文 §3.1 推出：只能作为分析框架标注 | inferred | |
| S10 | Block-STM 在 32 线程下 Aptos 基准达 170k tps、高冲突负载 80k tps，属于合成基准而非主网 | [6] Abstract，访问于 2026-10-27 | observed | |
| S11 | Solana Turbine 把分片沿质押加权的多层树传播（fanout 参数 DATA_PLANE_FANOUT），多数验证者在 2–3 跳内收到 | [12] §Shred Propagation Flow（检索摘要），访问于 2026-10-27 | observed | |
| S12 | RaptorCast 用 Raptor 码和两层广播树，每个验证者的上行带宽只与消息大小成正比、与验证者数量无关，最坏传播时间为一个 RTT | [9] §Design requirements，访问于 2026-10-27 | observed | |
| S13 | RaptorCast 不重传，在 20% 丢包和 33% 恶意节点的假设下，发送方需额外发送约 87% 的分片 | [9] §Fault tolerance，访问于 2026-10-27 | observed | |
| S14 | Alpenglow 的 Rotor（单层中继取代 Turbine）截至 2026-10 尚未排期，SIMD-0326 只覆盖 Votor，主网仍用 Turbine | [14] §Phase 2: Rotor；[15] Motivation，访问于 2026-10-27 | observed | |
| S15 | Anza 认为区块传播延迟主要由网络时延决定，而不是传输或计算时间 | [13] 正文 “speed of light is still too slow”，访问于 2026-10-27 | observed | |
| S16 | Solana 把区块提到 100M CU 前，要求超过 70% 质押启用 XDP 内核旁路网络以加快传播 | [17] §Network Readiness，访问于 2026-10-27 | observed | |
| S17 | 按 DoubleZero 自己的数据面板，epoch 1066 时约 58% 的 Solana 质押（422 个验证者）已接入 DoubleZero | [20] Solana Overview 面板（检索摘要），访问于 2026-10-27 | observed | |
| S18 | DoubleZero 宣传的入口 FPGA 过滤（去垃圾、去重、验签）截至 2026-10 尚未上线 | [19] docs “This feature is not yet functional”；Solutions “Coming in 2026”，访问于 2026-10-27 | observed | |
| S19 | OP Stack 的 sequencer 通过公开 p2p 网络把 unsafe 区块分发给其他节点 | [3] §The journey…，第 2 步，访问于 2026-10-27 | observed | |
| S20 | Base 每 200ms 构建一个 Flashblock，已广播部分的交易顺序锁定，后到的高费交易不能插入 | [40] §Flashblocks，访问于 2026-10-27 | observed | |
| S21 | 部分同步拜占庭共识要在正常路径上 2 个消息延迟内决定，当且仅当 n ≥ 5f−1；PBFT 需 3 个消息延迟 | [21] Abstract / Introduction，访问于 2026-10-27 | observed | |
| S22 | Solana Alpenglow（Votor）于 2026-10-21 epoch 1064 在主网激活，从 slot 459,653,000 起采用新共识 | [14] 页首与激活表，访问于 2026-10-27 | observed | |
| S23 | Votor 在 ≥80% 质押一轮投票时快速最终确认，否则以 60% 阈值进入第二轮 | [14] §Voting and Certificates；[13]，访问于 2026-10-27 | observed | |
| S24 | Votor 容忍 20% 恶意质押外加 20% 离线质押（“20+20”），而 TowerBFT 需要超过 2/3 质押才能 confirmed | [14] §Phase 1: Votor；[13]，访问于 2026-10-27 | observed | |
| S25 | Alpenglow 约 150ms 的中位最终性来自基于当时主网质押分布的仿真，未计入计算开销；Foundation 称其为“期望值而非常数” | [13] 正文括注；[14] §Finality Under Votor，访问于 2026-10-27 | observed | |
| S26 | 截至 2026-10-27，没有找到 Alpenglow 上线后独立第三方的主网最终性实测 | 由 [14]（仍称 target/expectation）与检索到的二手报道（均称实测待定）推出 | inferred | |
| S27 | Alpenglow 上线后，Solana 的 confirmed 与 finalized 指同一状态，投票交易不再进入区块 | [14] §Breaking Changes，访问于 2026-10-27 | observed | |
| S28 | Firedancer 与 Frankendancer 不支持 Alpenglow 迁移，验证者需运行 Agave 系 v4.3.2 客户端 | [14] §Breaking Change: Run an Agave-Based Client，访问于 2026-10-27 | observed | |
| S29 | MonadBFT 一轮即达推测最终性、两轮达完全最终性，正常路径为线性通信，并能抵抗 tail-forking | [10] §Summary，访问于 2026-10-27 | observed | |
| S30 | MonadBFT 的推测最终性只在原 leader 双签等少数情况下可能回滚 | [10] §Configuration in Monad 表注，访问于 2026-10-27 | observed | |
| S31 | Monad 主网 2025-11-24 上线，当前配置为 300ms 出块、600ms 最终性（2026-07 由 400ms/800ms 调整） | [10] 配置表；[11] 首页与 changelog 2026-07-23，访问于 2026-10-27 | observed | |
| S32 | Raptr 在论文实验中 250k TPS 时延迟 755ms，属于实验环境而非主网 | [22] Abstract / §Evaluation，访问于 2026-10-27 | observed | |
| S33 | Aptos 的 Baby Raptr（Raptr 的第一阶段）2025 年上主网，把共识路径压到 4 跳 | [24]（检索摘要），访问于 2026-10-27 | observed | |
| S34 | Zaptos 在 100 个地理分布验证者的“类主网”环境中，高负载下把延迟降低约 40% | [23] Abstract / §Evaluation，访问于 2026-10-27 | observed | |
| S35 | Sui Mysticeti v2 把交易验证并入共识，其 Transaction Driver 让亚洲全节点端到端延迟从约 1.00s 降到约 0.65s（Mysten 自测） | [25] §Rollout，访问于 2026-10-27 | observed | |
| S36 | Sui 的提交中位数需要 4 轮消息，Mysten 下一步目标降到 3 轮 | [25] §Future Work，访问于 2026-10-27 | observed | |
| S37 | Sei Giga 在内部测试网达到 >5 gigagas/s 与 <250ms 最终性，Autobahn 把 DA 层与共识层分离并采用异步执行 | [26] Abstract（v3, 2026-06-29），访问于 2026-10-27 | observed | |
| S38 | 截至 2026-10-16，Sei 的 Autobahn 共识尚未上主网 | 由 [27]（二手报道称 roadmap 标为 coming soon）推出，未找到一手确认 | inferred | |
| S39 | Hyperliquid 的 HyperBFT 是 HotStuff 变体，同地部署客户端的端到端延迟中位 0.2s、p99 0.9s | [28] §Consensus / §Latency，访问于 2026-10-27 | observed | |
| S40 | Hyperliquid 主网约支持 200k orders/s，官方称当前瓶颈在执行而非共识与网络 | [28] §Throughput，访问于 2026-10-27 | observed | |
| S41 | Monad 共识只对交易顺序达成一致、不执行交易，执行因此可以用满整个出块时间 | [7] §Asynchronous Execution，访问于 2026-10-27 | observed | |
| S42 | Monad 的提案只带 D=3 块前的状态根，执行出错的节点在 D 块后掉出共识并回滚重放 | [7] §Delayed Merkle Root，访问于 2026-10-27 | observed | |
| S43 | Monad 用 10 MON 的 reserve balance 规则，让共识在只看得到滞后 k=3 块状态的情况下仍能安全纳入交易，新充值账户需等 k 块 | [8] §Summary；[7] §Transactions from newly-funded accounts，访问于 2026-10-27 | observed | |
| S44 | Solana bankless leader 的依赖：SIMD-0298 随 Alpenglow 激活，SIMD-0290 已合入 Agave 等待激活，SIMD-0297 已批准，SIMD-0301 仍在 review | [18] Dependencies Status 表，访问于 2026-10-27 | observed | |
| S45 | EIP-7732 让 PTC 不验证执行 payload 即可证明，下一个 proposer 有半个 slot 验证 payload，代价包括 builder 扣留 payload 的 free option 问题 | [32] §Delayed validation / §Free option problem；[30] §ePBS，访问于 2026-10-27 | observed | |
| S46 | EIP-7886（延迟执行）状态为 Stagnant，不在 Glamsterdam 的 scheduled 清单中 | [33] 页首状态；[29] §EIPs Scheduled for Inclusion，访问于 2026-10-27 | observed | |
| S47 | Glamsterdam 列入 18 个 scheduled EIP，含 7732、7928、8037、8038、2780、7976、7981，EIP-7904 只是 informational | [29] §Specification，访问于 2026-10-27 | observed | |
| S48 | Glamsterdam 于 2026-10-06 在 Sepolia 激活；原定 2026-10-26 的 Hoodi 激活因 EIP-8037 于 10-22 推迟，主网日期未定 | [29] §Activation；[31]，访问于 2026-10-27 | observed | |
| S49 | EF 在 2026-02 计划 Glamsterdam 在 2026 上半年上线，实际已推迟到至少 2026-10 之后 | 由 [36] §Looking ahead 与 S48 推出 | inferred | |
| S50 | 截至 2026-02，Ethereum 主网 gas limit 已从 30M 提到 60M，EF 的目标是“朝 100M 及以上”推进 | [36] §A quick look back / §Scale，访问于 2026-10-27 | observed | |
| S51 | 截至 2026-10，没有证据显示 Ethereum 主网 gas limit 超过 60M，200M 只在 Sepolia 测试 | 由 [37]（以 60M 作为当前默认值的例子）、[39]（二手报道主网仍 60M）与 S48 推出 | inferred | |
| S52 | EIP-7825 把单笔交易 gas 上限设为 2^24（16,777,216），txpool 与区块验证都会拒绝超限交易 | [34] §Specification；[35] Included EIPs，访问于 2026-10-27 | observed | |
| S53 | Fusaka 于 2025-12-03 上主网；BPO1（2025-12-09）把 blob target/max 调到 10/15，BPO2（2026-01-07）调到 14/21 | [35] §Activation / §BPO；[42]，访问于 2026-10-27 | observed | |
| S54 | Fusaka 包含 EIP-7935（默认 gas limit 60M）与 EIP-7825 | [35] §Included EIPs，访问于 2026-10-27 | observed | |
| S55 | Solana 区块 CU 上限从 50M 提到 60M（SIMD-0256，2025-07-22），再提到 100M（SIMD-0286，2026-07-29），单账户写入上限保持 12M | [17] §Technical Details，访问于 2026-10-27 | observed | |
| S56 | Solana slot 时间按 SIMD-0525 分四步从 400ms 降到 200ms，2026-10-09 完成 | [16] 页首与激活表，访问于 2026-10-27 | observed | |
| S57 | Firedancer 在 epoch 1065 约占 Solana 17% 活跃质押，但这与 S28 矛盾，未核实 | [41]（二手）；与 [14] 矛盾 | speculative | |
| S58 | 执行与共识解耦扩大了执行预算，代价是状态根滞后、准入基于旧状态而需改规则、执行分歧发现更晚、用户可见语义改变 | 由 S41–S45 推出：三者都靠“先定序、后承诺”换预算，并都用额外规则补准入 | inferred | |
| S59 | 提高 L1 区块容量受验证者重放与追赶能力约束，大区块会拖慢重放、延长落后节点的追赶时间 | [17] §Performance Considerations；[34] §Motivation（Validation Overhead），访问于 2026-10-27 | observed | |
| S60 | L2 实时路径可以很快，但持续吞吐受执行、DA 发布与证明/挑战余量中最小者约束 | 由 S2、S5、S7 推出：未在窗口内发布的数据被丢弃，挑战需在期限内完成 | inferred | |

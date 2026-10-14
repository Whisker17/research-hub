# notes-roadmap：PQ 迁移路线、L1 转型与 Ethereum 2029 对照（lane = roadmap）

**一句话总结**：“2027 年成为完全抗量子的 L1”目前只是两条推文里的**正在考虑的方案 + 目标年份**。截至 2026-10-14，没有找到 SNIP、治理提案、投票、规范或官方博客专文，“fully quantum-resistant”的范围也没有官方定义。支撑它的是一份 2026-06-30 发布的三阶段 PQ 路线图，但这份路线图本身仍在 **L2 框架**内：Phase 1 已上线的只有 OS program/config hash 换成 BLAKE2s（v0.14.3，2026-07-08 上主网）；状态树和地址派生在 2026-10-13 的 sequencer 主干上**仍然是 Pedersen**。

**本路问题的一句话答案**：Starknet 的底气来自两点——STARK 证明层本身不依赖椭圆曲线，原生 AA 让账户可以无需分叉换签名算法。但转成 L1 还要补齐几块，官方都还没回应：自有共识（目前 3 个 StarkWare sequencer 跑 Tendermint，代码里投票签名还是 TODO）、自有 DA 与结算、StarkGate 桥上的资产、旧状态迁移。Ethereum 的“2029 年 12 月”是 EF Protocol 明确定义了三层范围、带分叉路径和 MV-PQ 备用方案的承诺；“2027”没有定义范围。所以两者**不是同一口径**。

---

## R-Q1 “2027 年 PQ L1”的官方表述与状态

**答案**：这只是官方账号的“actively considering”，加上 CEO 推文里的“could get there by 2027”。官方没有作出决定，也没有规范和治理流程。Eli 的原文是“We’re considering multiple options, including becoming an L1”，也就是说 L1 只是**几个选项之一**。

**依据**
- @Starknet，2026-10-08 08:32:54 UTC，原文：“We are actively considering becoming an L1. This would enable Starknet to become the first fully quantum-resistant network, with 2027 as our target.”这条推文引用了 Eli 的帖子 [1]。
- @EliBenSasson 线程，2026-10-08 08:19:56 UTC 起共 8 条（最后一条 10:21:33 UTC）[2]：
  - 首帖：“Starknet becoming an L1 for post-quantum agility: good idea or bad idea?”给出两个理由：“(1) The quantum threat. It may be MUCH closer than we think. (2) AI.”主张“bunker mode”，并说未来防护需要“The right cryptography / Crypto agility / Becoming an L1”。他还说这条线程“connects to what I talked about in my Token2049 talk today”。
  - 第 3 条把量子威胁临近的依据指向 ecdsa.fail（AI 可能让量子威胁更近）。
  - 第 7 条是关键原文：“But as an L2, Starknet relies on the security of its L1, Ethereum. We’ll need Ethereum to become quantum-safe and AI-safe … What happens if it doesn’t? We’re considering multiple options, including becoming an L1. The advantage would be control over the network’s security migrations, rather than having to wait for Ethereum or Bitcoin to move first. For context, Ethereum is targeting full L1 quantum resistance by the end of 2029. Bitcoin has made no such commitment. Starknet could get there by 2027.”
- 治理与规范层面，截至 2026-10-14 都没有相关材料：
  - community.starknet.io 按创建时间排的最新主题，最近一条是 2026-09-14，没有 L1 或 PQ 提案；搜“becoming an L1”也没有相关结果 [19]。
  - starknet-io/SNIPs 的 HEAD 是 1789f44e（2026-05-19）。最近的 PR 是 #178（SNIP-12 rev2）和 #177（SNIP-44 STRK20 viewing key），都和 L1 或 PQ 迁移无关 [20]。
  - Snapshot 的 starknet.eth 空间最近一次投票在 2026-03-30 至 04-06，内容是社区问卷 [21]。
  - starkware.co 博客索引里没有 L1 专文（只有 quantum 系列）[3][8]。
- Unchained 转述说“Neither Thursday post said whether or when a decision on the L1 idea would be taken”，还说“any protocol change still requires governance approval”[28]。路线图博客和 Migration Register 都写着协议激活“subject to Starknet governance”[3][4]。

**不确定之处**
- Token2049 演讲没有找到官方视频或官方文字稿，只能以 Eli 线程的自述摘要为准。会场地点等细节未核实。
- 推文里的“fully quantum-resistant”具体覆盖哪些组件（共识签名、DA、桥、旧状态、STRK20 的 ECDH），没有找到官方定义。
- 搜索可能有遗漏：Discord、私下治理渠道都无法覆盖。

## R-Q2 三阶段 PQ 路线图与实际进度

**答案**：路线图 2026-06-30 发布，分三期。Phase 1 的三项里，只有 OS config/program hash 已上线（v0.14.3，主网 2026-07-08）。状态树和地址派生在 Migration Register（最后更新 2026-08-19）里登记为“Published roadmap direction”，2026-10-13 的源码也仍是 Pedersen；2026-10-06 上主网的 v0.14.4 不包含这两项。Phase 2 处于研究阶段。Phase 3 要等 Ethereum 先迁移。共识签名在路线图里只有一句“all new features will require quantum-safe implementations … such as Falcon-512”，**没有日期**。

**依据**
- 路线图原文 [3]：
  - “The roadmap is organized into three phases. The first two are fully within Starknet’s control and carry committed time estimates. The third documents dependencies on Ethereum’s own migration timeline.”
  - Phase 1“Securing All New Activity”：用 BLAKE2 替换 Pedersen，“across three surfaces: the state, chain environment, and consensus layers”。具体条目：
    - State commitment layer：contracts trie 与 storage tries 改用 BLAKE2。
    - Contract address derivation：改用 BLAKE2。
    - OS config hash：“already live on testnet and will go live on mainnet in early July”。
    - 时间估计：“OS config hash live in early July; other items – approximately two months from start.”
  - 共识原文：“As we continue to develop the Starknet tech stack, all new features will require quantum-safe implementations. These items include, among others, implementing consensus signatures onchain using PQ signature schemes, such as Falcon-512.”
  - Phase 2“Bringing Legacy Contracts Forward”：“actively researching a migration toolkit…”，时间估计“approximately one month after Phase 1 for easy path on StarkWare side; TBD on dapps side.”
  - Phase 3“External Dependencies”：Bridge secp Syscalls（“support L1-to-L2 messaging and the Ethereum bridge”），时间估计“1 month post-Ethereum migration”；Blob DA/KZG 写的是“This surface is Ethereum’s to migrate.”
- Migration Register [4]（页面 Last updated 2026-08-19；各记录 checkedDate 2026-07-30）：
  - R2 OpenZeppelin Falcon-512 账户：“Demonstrated on mainnet”（一笔 0.01 STRK 转账，experimental、未审计）。
  - R4 OS program hash 与 OS config hash：“Live on mainnet · v0.14.3”。
  - R5 contracts trie 与 per-contract storage tries：“Published roadmap direction … Planned, not live. The outer state commitment and class trie already use Poseidon.”
  - R6 contract-address derivation：“Published roadmap direction … Current derivation remains Pedersen-based.”
  - C1 legacy storage migration：“Research announced … no public specification, implementation, released toolkit or developer workflow.”
  - R8 blob DA/KZG：“External dependency”，sequencer 可以切换到 calldata。
- 版本与上线日期：
  - v0.14.3 预发布说明：Testnet 计划 2026-06-22，Mainnet 计划 2026-07-06；“Quantum-resistant SNOS hash … Blake … instead of Pedersen”[9]。
  - status.starknet.io 记录主网 0.14.3 升级维护在 2026-07-08 08:20–08:30 UTC 完成 [10]。
  - v0.14.4 预发布说明（2026-09-09）没有任何 PQ 或哈希迁移条目 [11]，主网在 2026-10-06 08:13 UTC 完成 [12]。
  - docs.starknet.io 的 Version Notes 最新只写到 v0.14.1（2025-12-10）。v0.14.1 把 compiled class hash 从 Poseidon 改成 Blake，动机写的是证明效率（“roughly 8x more efficient to prove”），不是 PQ [18]。
- 源码（sequencer @54f97a8a，2026-10-13）[13][14]：
  - `OS_CONFIG_HASH_V4_CUTOVER = V0_14_3`，V4 用 Blake2Felt252。
  - `calculate_contract_address` 仍用 `Pedersen::hash_array`。
  - committer 中 contracts trie 和 storage trie 的节点哈希仍是 `PedersenHashFunction`，classes trie 用 Poseidon。
  - `blockifier/resources` 已经有 0_14_5 版本常量，0.14.4→0.14.5 的 diff 只有一行 virtual OS program hash，和 PQ 无关。
- 后续官方文章：starknet.io 2026-08-07 说“Phase one … is already underway”[7]；StarkWare 2026-08-20 说“Part of that has shipped”（指 v0.14.3）[8]。
- “within months”是**媒体说法**（The Quantum Insider、Coinomist、KuCoin 等），博客原文里没有 [31][32]。博客原文是“approximately two months from start”。

**不确定之处**
- Phase 1 的“start”指哪天，博客没说。所以“已经延期”只能作为推论：从 06-30 算起，两个月是 08-30，到 10-14 主网仍未上线。
- Migration Register 自 2026-08-19 后没有更新，可能有未公开的进展。
- Phase 3 写的“secp syscalls support L1-to-L2 messaging and the Ethereum bridge”这一机制描述，本路没有用源码核实。

## R-Q3 转成 L1 需要额外补齐什么

**答案**：官方还没有回答。现在的架构事实是：结算和证明验证在 Ethereum 上；DA 用 Ethereum blob 或 calldata；排序由 3 个 sequencer 跑 Tendermint（v0.14.0 起），staking 处于 4 期中的第 2 期，验证者只负责 attest，文档原话是“Starknet is currently still centralized”；共识投票签名在代码里还是 TODO；资产托管在 Ethereum 上的 StarkGate。以上每一项，转成 L1 后都要自己提供 PQ 版本的替代。**这是推论（inferred）**。

**依据**
- DA：v0.13.1 起用 blob 或 calldata，“Under normal conditions, using blobs is default”[17]；Migration Register 的 R8 也这样记录 [4]。
- 结算：路线图称 STARK 证明在 L1 验证，Phase 3 依赖 Ethereum [3]。myths 博客原话：“Starknet’s L1 verifier checks the hash-based proof directly”[8]（这是 StarkWare 的说法）。
- 共识与排序：
  - v0.14.0（2025-09-01）引入“Decentralized sequencing … three sequencers … reaching consensus using the Tendermint protocol”[18]。
  - staking 文档：“While Starknet is currently still centralized … The protocol is currently in the second of four phases”；第二期验证者每个 epoch 发一次 `attest` 交易；block proposing 从“third phase”开始 [16]。
  - apollo_consensus @54f97a8a：`// TODO(Asmaa): sign the vote` 加上 `signature: RawSignature::default()`；`// TODO(Asmaa): verify the signature`；以及注释“Since vote signatures are not yet verified, a peer can forge votes”[15]。共识网络的认证消息叫 `StarkAuthentication`，带 `Felt252 operational_public_key` [15]。
- 桥：Phase 3 把 bridge secp syscalls 和 messaging 列为“contingent on Ethereum’s own migration; until then, removing these syscalls would break the bridge”[3]。
- 旧状态：Phase 2 仍在研究，没有规范和工具 [3][4]。
- 官方回应：Eli 线程只给了动机，没给 L1 设计 [2]；没有 SNIP 或论坛提案 [19][20]。CryptoSlate 的评论“An independent Starknet would need its own security and settlement model”是媒体观点 [29]。

**不确定之处**
- 主网 sequencer 实际跑的是不是这份主干代码，以及签名是否在私有配置里另行启用，本路无法核实。
- 能看到的只有 Eli 线程里“becoming an L1”这句表态，转型后共识、DA 和桥怎么设计、留在以太坊上的资产怎么处理，官方都还没公布任何方案。

## R-Q4 Ethereum 的 PQ 目标（口径对比）

**答案**：EF Protocol 在 2026-09-07 写道：“aiming for Ethereum L1 to be quantum-resistant across all three layers (execution, consensus, and data) by December 2029”，承诺“non-negotiable at least until January 2027”。2026-08-19 的 Strawmap 更新加了 J* 的 MV-PQ 备用里程碑。Ethereum 的主网上目前还没有 PQ 用户签名；相关 EIP（8141、7932、8051、7619、8365）在 eips.ethereum.org 上都还是 Draft。“2027 vs 2029”不同口径：Ethereum 的目标定义了三层范围和交付路径；Starknet 没有定义范围，而且已经上线的 PQ 部件只有 OS hash，外加一笔实验性 Falcon 账户转账。

**依据**
- EF 博客 [22]：
  - “plan for Q-day happening as early as 2030”。
  - Glamsterdam 计划 2026-12；按 July Strawmap，完整 PQ 在 L*（Glamsterdam 之后第五个硬分叉），需要“7.2 months per fork”。
  - “The August 19 Strawmap update added a minimum viable post-quantum (MV-PQ) L1 milestone at J*. The post-quantum public-key registry sits in I*. The post-quantum heartbeat on the consensus layer, leanDA sampling on the data layer, and leanSPHINCS transactions on the execution layer sit in J*.”
  - “MV-PQ is designed to keep Ethereum operating through Q-day with reduced guarantees … The remaining work includes post-quantum attestations, required for full economic finality.”
  - 可能对调 K* 与 L*，如果对调，完整 PQ 落在 K*，需要 9 个月的分叉节奏。
  - “Hegotá is not the PQ fork”。Hegotá 的 SFI 头号项目是 EIP-7805 FOCIL 和 EIP-8141 Frame Transaction；EIP-8365 用于退役 BLS 提款凭证。
  - 原文：“The consensus layer, however, cannot rely on cryptographic agility … consensus components wait for the complete PQ design instead of shipping one at a time.”
- pq.ethereum.org [23]：
  - 路线图表：I* PQ key registry；J* PQ sig precompiles；L* PQ attestations、real-time CL proofs、leanVM；M* PQ sig aggregation、PQ blobs；“Longer term: Full PQ consensus, PQ transactions, PQ sampling”。
  - 页面声明这份路线图“subject to change … determined through … All Core Devs”。
  - 它对完整 PQ 的时间安排比 EF 博客更靠后（M*、Longer term），两份 EF 来源不一致。
- EIP 状态 [24]，均为 Draft：
  - EIP-8141 Frame Transaction（2026-01-29）
  - EIP-7932 Secondary Signature Algorithms（2025-04-12）
  - EIP-8051 ML-DSA precompile（2025-10-15）
  - EIP-7619 Falcon512 precompile（2023-07-03）
  - EIP-8365 Disallow new 0x00 validators（2026-07-18）

**不确定之处**
- Strawmap 原文（strawmap.org）没有直接打开核对，分叉代号顺序以 EF 博客为准。
- pq.ethereum.org 和 EF 博客的时间差异，可能是因为前者没有更新。

## R-Q5 外部对照

**答案**：
- Quantum Hub 的 networks 页由 StarkWare 自己制作，属于利益相关方。它按 8 项“cryptographic agility”打分：Starknet 8/8、Ethereum 3/8。它自己声明不覆盖共识签名、桥和外部依赖。同一页还记载 Algorand 已经在主网上线 Falcon-1024 账户，并有 2027 年替换共识和 VRF 的目标。
- NIST：FIPS 203/204/205 于 2024-08-13 发布；FIPS 206（Falcon）仍是“in development”（页面更新于 2026-08-05）。IR 8547 初始公开草案（2024-11-12）里，112-bit 的 ECDSA/EdDSA/RSA “Deprecated after 2030”，全部“Disallowed after 2035”。

**依据**：[6][25][26][8]

**不确定之处**：StarkWare 说 FIPS 206 草案在 2025-08-28 提交、终稿预计 2026 年底或 2027 年初 [8]，NIST 页面没有对应的公开草案链接（csrc 的 /pubs/fips/206/ipd 返回 Page Not Found）。IR 8547 还是 ipd，不是终稿。

---

## 图的素材

**时间线（Starknet PQ 与 L1 叙事）**
- 2018：STARK 论文（hash-based）[3]
- 2025-07-13：SNIP-32 Keccak-f permutation syscall（Draft，动机含 PQC/Falcon SHAKE）[20]
- 2025-09-01：v0.14.0，3 个 sequencer 跑 Tendermint 共识 [18]
- 2025-12-10：v0.14.1，compiled class hash 从 Poseidon 改为 Blake（动机是证明效率）[18]
- 2026-06-30：三阶段 PQ 路线图发布 [3]
- 2026-07-08：v0.14.3 主网，OS program/config hash 从 Pedersen 改为 BLAKE2s（Phase 1 第一项）[9][10][4]
- 2026-07-22：OZ Falcon512ShakeDirectAccount 主网转账（实验性、未审计）[27][4]
- 2026-08-07 / 08-20：starknet.io 与 StarkWare 跟进文章（“Phase one … underway”/“Part of that has shipped”）[7][8]
- 2026-08-19：Migration Register 最后更新 [4]
- 2026-10-06：v0.14.4 主网（无 PQ 项）[11][12]
- 2026-10-08：Eli 线程与 @Starknet “actively considering becoming an L1 … 2027 as our target” [1][2]
- 截至 2026-10-13：sequencer 主干的状态树和地址派生仍是 Pedersen，共识投票签名还是 TODO [13][14][15]

**时间线（Ethereum）**
- 2026-08-19：Strawmap 更新，加入 J* 的 MV-PQ 里程碑 [22]
- 2026-09-07：EF Protocol 目标“December 2029 / 三层”[22]
- 2026-12（计划）：Glamsterdam [22]
- 2027-01：EF 重新评估 deadline 的时间点 [22]
- Hegotá（客户端 2026 Q4 末开始实现）：FOCIL + EIP-8141 [22]
- I*：PQ key registry；J*：MV-PQ（PQ heartbeat、leanDA sampling、leanSPHINCS tx）；K*/L*：PQ attestations 与 mandatory proofs（顺序可能对调）[22][23]

**三阶段 × 状态（Starknet）**

| 阶段 | 条目 | 官方时间估计 [3] | 状态（截至 2026-10-14） |
|---|---|---|---|
| P1 | OS program/config hash → BLAKE2s | early July | 主网已上线 v0.14.3（2026-07-08）[4][10] |
| P1 | contracts trie + storage tries → BLAKE2 | ~2 months from start | 路线图；源码仍 Pedersen [4][14] |
| P1 | 合约地址派生 → BLAKE2 | ~2 months from start | 路线图；源码仍 Pedersen [4][13] |
| P1 附 | 共识签名用 PQ（“such as Falcon-512”） | 无日期 | 路线图表述；当前投票签名未实现 [3][15] |
| P2 | 旧合约 storage map 迁移工具 | P1 后 ~1 个月（StarkWare 侧 easy path），dapp 侧 TBD | 研究中，无规范 [4] |
| P3 | bridge/messaging secp syscalls | Ethereum 迁移后 1 个月 | 外部依赖 [3] |
| P3 | blob DA/KZG | “Ethereum’s to migrate” | 外部依赖；有 calldata 回退 [4][17] |
| 账户 | Falcon-512 账户 | — | 主网演示（实验性、未审计）[4] |

**对比维度（2027 Starknet vs 2029 Ethereum）**

| 维度 | Starknet | Ethereum |
|---|---|---|
| 表述性质 | “actively considering” + “target”[1]；“could get there”[2] | EF Protocol “aiming … non-negotiable at least until January 2027”[22] |
| 范围定义 | 未定义“fully quantum-resistant”[1] | execution、consensus、data 三层 [22] |
| 交付路径 | 三阶段路线图（L2 框架内）；没有 L1 规范 [3] | 分叉序列 I*→L*，外加 J* MV-PQ 备用 [22] |
| 已上线 PQ 部件 | 证明层（结构性）；OS hash（v0.14.3）；一次 Falcon 账户演示 [4] | 无 PQ 用户签名上主网 [6]；相关 EIP 均为 Draft [24] |
| 共识 | 中心化 3 个 sequencer，投票签名 TODO [15][16] | 需要 PQ attestations 才有完整经济终局性 [22] |
| 账户敏捷性 | 原生 AA（已有）[4] | EIP-8141 Frames（Hegotá 计划，Draft）[22][24] |

---

## 代码素材

1) OS config hash 的 Pedersen→Blake 切换点（`sequencer/crates/starknet_api/src/core.rs#L111-L129@54f97a8a`）
```rust
/// The first Starknet version at which the OS config hash is computed with Blake (V4) instead of
/// Pedersen (V3).
const OS_CONFIG_HASH_V4_CUTOVER: StarknetVersion = StarknetVersion::V0_14_3;
...
impl From<StarknetVersion> for OsConfigHashVersion {
    fn from(starknet_version: StarknetVersion) -> Self {
        if starknet_version < OS_CONFIG_HASH_V4_CUTOVER { Self::V3 } else { Self::V4 }
    }
}
```
https://github.com/starkware-libs/sequencer/blob/54f97a8af3a712fb6c358e30f19e5a386cb7b4e3/crates/starknet_api/src/core.rs#L111

2) 合约地址派生仍是 Pedersen（`sequencer/crates/starknet_api/src/core.rs#L324-L340@54f97a8a`）
```rust
pub fn calculate_contract_address(
    salt: ContractAddressSalt, class_hash: ClassHash,
    constructor_calldata: &Calldata, deployer_address: ContractAddress,
) -> Result<ContractAddress, StarknetApiError> {
    let constructor_calldata_hash = Pedersen::hash_array(&constructor_calldata.0);
    ...
    let address = Pedersen::hash_array(&[ prefix, *deployer_address.0.key(), salt.0,
        class_hash.0, constructor_calldata_hash ]);
```
https://github.com/starkware-libs/sequencer/blob/54f97a8af3a712fb6c358e30f19e5a386cb7b4e3/crates/starknet_api/src/core.rs#L324

3) contracts trie / storage trie 仍是 Pedersen（`sequencer/crates/starknet_committer/src/hash_function/hash.rs#L49-L55,#L113-L119@54f97a8a`）
```rust
impl TreeHashFunction<ContractState> for TreeHashFunctionImpl {
    fn compute_node_hash(node_data: &NodeData<ContractState, HashOutput>) -> HashOutput {
        Self::compute_node_hash_with_inner_hash_function::<PedersenHashFunction>(node_data)
...
impl TreeHashFunction<StarknetStorageValue> for TreeHashFunctionImpl {
    fn compute_node_hash(node_data: &NodeData<StarknetStorageValue, HashOutput>) -> HashOutput {
        Self::compute_node_hash_with_inner_hash_function::<PedersenHashFunction>(node_data)
```
https://github.com/starkware-libs/sequencer/blob/54f97a8af3a712fb6c358e30f19e5a386cb7b4e3/crates/starknet_committer/src/hash_function/hash.rs#L49

4) Tendermint 投票尚未签名和验证（`sequencer/crates/apollo_consensus/src/state_machine.rs#L254-L255`、`single_height_consensus.rs#L242`、`manager.rs#L327-L329`，均 @54f97a8a）
```rust
            // TODO(Asmaa): sign the vote
            signature: RawSignature::default(),
...
        // TODO(Asmaa): verify the signature
...
            // Bound the cache to what an honest committee could produce. Since vote signatures are
            // not yet verified, a peer can forge votes with arbitrary voter addresses; ...
```
https://github.com/starkware-libs/sequencer/blob/54f97a8af3a712fb6c358e30f19e5a386cb7b4e3/crates/apollo_consensus/src/state_machine.rs#L254

---

## 外部调研 / 用户资料中被修正或无法核实的地方

1. **GPT 1.1 的 Migration Register 表**：基本正确，但漏了三点：
   - 各记录的 checkedDate 是 2026-07-30，页面最后更新是 2026-08-19。
   - “Ethereum-facing dependencies”除了 blob/KZG，还包括 bridge 与 messaging [4]。
   - 状态树一项准确的说法是：contracts trie 与 storage tries 从 Pedersen 改为 BLAKE2；外层 state commitment 与 class trie 本来就是 Poseidon [4]。
2. **GPT 7.2 说“官方旧路线图对共识签名的表述是采用‘如 Falcon-512’”**：措辞基本对，但要补充语境。原文把它放在“all new features will require quantum-safe implementations”之下，不是 Phase 1 的列项，**也没有时间估计** [3]。另外，当前共识投票本身还没有签名（代码 TODO）[15]，所以并不存在一个“现有 ECDSA 共识签名换成 Falcon”的迁移，需要从零实现。
3. **GPT 1.1 说“本次没有取得包含完整独立 L1 安全规范…的一级技术文件”**：结论正确。本路进一步核实了：没有 SNIP（HEAD 1789f44e，最近 PR #178）、没有论坛提案、Snapshot 上没有投票 [19][20][21]。
4. **GPT 漏掉了 Eli 原话“considering multiple options, including becoming an L1”**：L1 只是选项之一，不能写成“已决定转 L1” [2]。用户草稿“他们希望从 L2 转为一条抗量子的 L1”也应改为“正在考虑（选项之一）”。
5. **“within months”**：这是媒体（The Quantum Insider 等）的概括，路线图原文是“approximately two months from start”（Phase 1 其余项），也没有说明起算日 [3][31]。到 2026-10-14，这些项仍未上线 [4][11][13][14]。
6. **“aims to complete the upgrade by 2027”**（lane 说明里提到的 Gate、CryptoTimes、The Block 措辞）：这几家原文本路**没能抓到**（搜索失败），无法核实。官方原话是“with 2027 as our target”[1] 和“Starknet could get there by 2027”[2]，没有“complete the upgrade”这样的承诺。
7. **OpenZeppelin 推文称 Falcon-512 是“a NIST post-quantum standard”**[27]：不精确。NIST 页面显示 FIPS 206“in development”[25]，StarkWare 自己也承认“FIPS 206 remains in draft”[8]。StarkWare 推文“fully spec-compliant Falcon-512”应理解为 SHAKE-256 变体对齐 Falcon 规范，不等于符合 FIPS 206 终稿。
8. **GPT 7.2 说“可以通过 calldata fallback 避开 blob 路径的 KZG 依赖”**：文档写的是只在“extreme situations where blob prices significantly exceed those of calldata”时才切换 [17]，默认走 blob。另外 calldata 路径仍然依赖 Ethereum 的共识和 L1 交易签名（推论）。
9. **GPT 1.2 和用户草稿“Ethereum L1 目标 2029”**：正确，准确说法是“by December 2029”，三层都要达到，承诺至少在 2027 年 1 月前不改 [22]。需要补充的是 EF 内部来源不一致：pq.ethereum.org 把 PQ blobs 放在 M*，把 full PQ consensus 放在“Longer term”[23]。
10. **“first fully quantum-resistant network”**：StarkWare 自己的 networks 页记载 Algorand 已经在主网上线 Falcon-1024 账户，并有 2027 年替换共识和 VRF 的目标 [6]。“first”这个说法有竞争者（speculative，Algorand 部分仅凭 StarkWare 的转述）。
11. **docs.starknet.io Version Notes 落后**：最新只写到 v0.14.1。0.14.2 到 0.14.4 要看 community 论坛的预发布说明和 status 页 [9][11][18]。

---

## 来源

1. **PRIMARY** @Starknet 推文 https://x.com/Starknet/status/2108113391525204034（2026-10-08 08:32:54 UTC；经 api.fxtwitter.com 读取，访问 2026-10-14）：证明“actively considering becoming an L1 … 2027 as our target”的原文。
2. **PRIMARY** @EliBenSasson 线程 https://x.com/EliBenSasson/status/2108110129572741426（8 条，2026-10-08；经 api.fxtwitter.com/2/thread 读取，访问 2026-10-14）：证明理由（量子、AI、L2 受以太坊约束）、“multiple options”和“could get there by 2027”。
3. **PRIMARY** StarkWare 博客“The Architecture Advantage: Starknet’s Quantum Readiness Roadmap” https://starkware.co/blog/the-architecture-advantage-starknets-quantum-readiness-roadmap/（2026-06-30，访问 2026-10-14）：证明三阶段内容、时间估计和 Falcon-512 共识签名原句。
4. **PRIMARY** Quantum Hub Migration Register https://quantum.starkware.co/migration-register（Last updated 2026-08-19，记录 checkedDate 2026-07-30，访问 2026-10-14）：证明各组件的官方登记状态。
5. **PRIMARY** Quantum Hub Learn https://quantum.starkware.co/learn（Last updated 2026-09-23，访问 2026-10-14）：证明官方回答“Is Starknet quantum-resistant? No. Not as a single system-wide claim.”
6. **PRIMARY（利益相关方制作）** Quantum Hub Networks https://quantum.starkware.co/networks（条目 checked 2026-09-28 / 2026-10-05，访问 2026-10-14）：证明 8 项打分（Starknet 8/8、Ethereum 3/8）、范围声明，以及 Algorand 和 Ethereum 的条目内容。
7. **PRIMARY** starknet.io 博客“How Starknet Can Upgrade for Quantum Resistance” https://www.starknet.io/blog/quantum-resistance/（2026-08-07，访问 2026-10-14）：证明“Phase one … already underway”。
8. **PRIMARY** StarkWare“Top 5 quantum computing myths answered” https://starkware.co/blog/top-5-quantum-computing-myths-answered/（2026-08-20，访问 2026-10-14）：证明“Part of that has shipped”、对 FIPS 206 状态的说法，以及 L1 verifier 直接验证 STARK 的说法。
9. **PRIMARY** Starknet 0.14.3 pre-release notes https://community.starknet.io/t/starknet-0-14-3-pre-release-notes/116211（2026-05-26，访问 2026-10-14）：证明“Quantum-resistant SNOS hash”和计划日期。
10. **PRIMARY** status.starknet.io“Mainnet 0.14.3 upgrade” https://status.starknet.io/incidents/6l23lrrdvy9y（访问 2026-10-14）：证明主网 0.14.3 于 2026-07-08 08:30 UTC 完成。
11. **PRIMARY** Starknet v0.14.4 Prerelease Notes https://community.starknet.io/t/116341（2026-09-09，访问 2026-10-14）：证明 0.14.4 的内容不含 PQ 项。
12. **PRIMARY** status.starknet.io“Mainnet upgrade to v0.14.4” https://status.starknet.io/incidents/wqlk2plzryd4（访问 2026-10-14）：证明主网 0.14.4 于 2026-10-06 08:13 UTC 完成。
13. **PRIMARY** `starkware-libs/sequencer/crates/starknet_api/src/core.rs@54f97a8a`：证明 OS config hash 在 V0_14_3 切到 Blake，地址派生仍用 Pedersen。
14. **PRIMARY** `starkware-libs/sequencer/crates/starknet_committer/src/hash_function/hash.rs@54f97a8a`（raw.githubusercontent 读取）：证明 contracts trie 与 storage trie 用 Pedersen，classes trie 用 Poseidon。
15. **PRIMARY** `starkware-libs/sequencer/crates/apollo_consensus/src/{state_machine.rs,single_height_consensus.rs,manager.rs,types.rs}`、`crates/apollo_protobuf/src/proto/p2p/proto/consensus/authentication.proto` @54f97a8a：证明投票签名未实现、未验证，以及共识认证消息的结构。
16. **PRIMARY** docs.starknet.io Staking https://docs.starknet.io/learn/protocol/staking.md（访问 2026-10-14）：证明“currently still centralized”、处于 4 期中的第 2 期、attest 机制。
17. **PRIMARY** docs.starknet.io Data Availability https://docs.starknet.io/learn/protocol/data-availability.md（访问 2026-10-14）：证明 blob 为默认、calldata 用于极端情况。
18. **PRIMARY** docs.starknet.io Version Notes https://docs.starknet.io/learn/cheatsheets/version-notes.md（访问 2026-10-14）：证明 v0.14.0 引入 3 sequencer + Tendermint，v0.14.1 把 compiled class hash 改为 Blake。
19. **PRIMARY** community.starknet.io 的 search.json 与 latest.json（访问 2026-10-14）：证明论坛上没有 L1 或 PQ 治理提案。
20. **PRIMARY** starknet-io/SNIPs @1789f44e，GitHub API 的 commits 与 pulls 列表（访问 2026-10-14）：证明没有 L1 或 PQ 迁移 SNIP；SNIP-32 为 Draft。
21. **PRIMARY** Snapshot GraphQL，space starknet.eth（访问 2026-10-14）：证明该空间最近的投票是 2026-03 的社区问卷。
22. **PRIMARY** EF Protocol“Current and Emerging Priorities” https://blog.ethereum.org/2026/09/07/protocol-priorities（2026-09-07，访问 2026-10-14）：证明 2029-12 三层目标、MV-PQ、分叉序列和“non-negotiable until January 2027”。
23. **PRIMARY** https://pq.ethereum.org（EF PQ 团队，访问 2026-10-14）：证明三层路线表（I*/J*/L*/M*/Longer term）。
24. **PRIMARY** eips.ethereum.org 的 EIP-8141 / 7932 / 8051 / 7619 / 8365（访问 2026-10-14）：证明这些 EIP 都是 Draft 及其创建日期。
25. **PRIMARY** NIST PQC Standardization https://csrc.nist.gov/projects/post-quantum-cryptography/post-quantum-cryptography-standardization（Updated 2026-08-05，访问 2026-10-14）：证明 FIPS 203/204/205 于 2024-08-13 发布、FIPS 206 in development。
26. **PRIMARY** NIST IR 8547 ipd https://csrc.nist.gov/pubs/ir/8547/ipd 与 PDF（2024-11-12，访问 2026-10-14）：证明 2030 deprecate、2035 disallow 的草案时间表。
27. **PRIMARY** @StarkWareLtd https://x.com/StarkWareLtd/status/2079955780019864015 与 @OpenZeppelin https://x.com/OpenZeppelin/status/2079973346184475079（2026-07-22，经 fxtwitter 读取，访问 2026-10-14）：证明 Falcon 主网演示的日期和官方措辞。
28. 媒体：Unchained https://unchainedcrypto.com/starknet-weighs-becoming-a-layer-1-to-chase-quantum-resistance-by-2027/（访问 2026-10-14）：转述“no decision date”和需要治理批准。
29. 媒体：CryptoSlate https://cryptoslate.com/starknet-doubles-in-a-week-as-ethereum-exit-plan-ignite-2-billion-trading-frenzy/（访问 2026-10-14）：转述“consideration … rather than an approved migration timetable”。
30. 媒体：Surf https://asksurf.ai/pulse/en/starknet-l1-quantum-resistance-pivot（访问 2026-10-14）：提到前一天的“Welcome to the bunker”预告（未核实原推）。
31. 媒体：The Quantum Insider https://thequantuminsider.com/2026/06/30/starkware-releases-roadmap-to-make-starknet-quantum-safe/（访问 2026-10-14）：“within months”这一说法的媒体出处之一。
32. 媒体（仅搜索摘要）：DuckDuckGo 上 tchebit、Coinomist、KuCoin、Blockchair 的摘要，均写“quantum-ready within months”（访问 2026-10-14）。

## 命令与输出

- `curl -sSL https://api.fxtwitter.com/2/thread/2108110129572741426`：返回 8 条线程，第 7 条原文见 R-Q1。
- `curl https://status.starknet.io/incidents/6l23lrrdvy9y`：`data-datetime-unix=1783499408000`，即 2026-07-08 08:30:08 UTC，状态 Completed。
- `curl https://status.starknet.io/incidents/wqlk2plzryd4`：“Completed … Oct 06, 2026 - 08:13 UTC”。
- `grep -n "fn calculate_contract_address" -A 25 crates/starknet_api/src/core.rs`（/tmp/sknam/sequencer @54f97a8a，提交日期 2026-10-13 11:41 UTC）：L330 和 L332 是 `Pedersen::hash_array`。
- `git clone --depth 1 --filter=blob:none --sparse https://github.com/starkware-libs/sequencer /tmp/sknam/seqcons`，HEAD 为 54f97a8a（与给定 commit 一致）；`grep -rn "TODO(Asmaa)" crates/apollo_consensus/src`：命中 state_machine.rs:254“sign the vote”、single_height_consensus.rs:242“verify the signature”。
- `pdftotext NIST.IR.8547.ipd.pdf`，Table 2：“Deprecated after 2030 / Disallowed after 2035”。
- `curl https://api.github.com/repos/starknet-io/SNIPs/pulls?state=all`：最近是 #178（2026-09-08）和 #177（2026-07-29），没有 L1 或 PQ 迁移相关。

## 开放问题

1. “fully quantum-resistant”在 2027 目标里的范围是什么？是否包括 STRK20 的 ECDH、共识签名、桥和旧状态？
2. 转成 L1 后，Ethereum 上 StarkGate 托管的资产怎么处理？是保留以太坊结算并另加独立共识（混合），还是彻底独立？
3. Phase 1 的 trie 和地址派生迁移的目标版本（v0.14.5 还是 v0.15？）以及激活日期。
4. Tendermint 投票签名准备用什么方案？是一步到位上 PQ（Falcon-512 或 hash-based），还是先用 Stark ECDSA？`StarkAuthentication` 的 `operational_public_key` 是不是 Stark 曲线密钥？
5. sequencer 的 `state_diff_encryption`（starknet_os hints 里有 EC Diffie-Hellman 加密对称密钥）是否用在主网或某些 appchain 上？它是不是又一个没登记的 EC 依赖？
6. 路线图 Phase 3 说 secp syscalls “support L1-to-L2 messaging and the Ethereum bridge”，具体机制是什么（需要源码核实）？
7. Token2049 演讲的官方视频和文字稿。
8. FIPS 206 的公开草案状态（StarkWare 称 2025-08-28 已提交，NIST 页面未见）。

---

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| R1 | @Starknet 于 2026-10-08 08:32:54 UTC 发帖：“We are actively considering becoming an L1 … first fully quantum-resistant network, with 2027 as our target.” | [1] x.com/Starknet/status/2108113391525204034 经 api.fxtwitter.com 读取的 text 字段 | observed | |
| R2 | 该推文引用了 Eli Ben-Sasson 08:19:56 UTC 的帖子“Starknet becoming an L1 for post-quantum agility: good idea or bad idea?” | [1] fxtwitter 的 quote 字段；[2] 线程首帖 | observed | |
| R3 | Eli 给出的理由是量子威胁“may be MUCH closer than we think”和 AI，主张“bunker mode” | [2] 线程第 1、3、4 条 | observed | |
| R4 | Eli 原话：“We’re considering multiple options, including becoming an L1”，L1 只是选项之一 | [2] 线程第 7 条（id 2108110155032203410） | observed | |
| R5 | Eli 的论证是：作为 L2，Starknet 依赖 Ethereum 的安全；成为 L1 的好处是“control over the network’s security migrations” | [2] 线程第 7 条 | observed | |
| R6 | Eli 原话：“Ethereum is targeting full L1 quantum resistance by the end of 2029 … Starknet could get there by 2027.” | [2] 线程第 7 条 | observed | |
| R7 | Eli 称这条线程与他当天的 Token2049 演讲有关；本路没有找到演讲的官方视频或文字稿 | [2] 首帖“my Token2049 talk today”；DDG 与 Bing 搜索无有效结果 | observed | |
| R8 | 截至 2026-10-14，starknet-io/SNIPs 没有 L1 转型或 PQ 迁移 SNIP（HEAD 1789f44e，最近 PR #178、#177 与此无关） | [20] git ls-remote HEAD；GitHub API pulls 列表 | observed | |
| R9 | 截至 2026-10-14，community.starknet.io 没有 L1 转型治理提案（最新主题 2026-09-14） | [19] latest.json?order=created；search.json?q=becoming an L1 | observed | |
| R10 | Snapshot 的 starknet.eth 空间最近的投票是 2026-03-30 至 04-06 的社区问卷，没有 L1 投票 | [21] hub.snapshot.org GraphQL 输出 | observed | |
| R11 | “2027 PQ L1”的准确定性是：考虑中加目标年份，没有作出决定，没有规范，没有治理流程 | 由 R1、R4、R8、R9、R10 推出：官方措辞为 considering/target，且三类治理与规范渠道均无记录 | inferred | |
| R12 | 官方没有定义 2027 目标里“fully quantum-resistant”覆盖哪些组件 | [1][2] 原文无范围定义；[3][4] 没有 L1 相关条目 | observed | |
| R13 | 三阶段 PQ 路线图于 2026-06-30 发布，称前两期“fully within Starknet’s control and carry committed time estimates”，第三期依赖 Ethereum | [3] “What the roadmap commits to”一节 | observed | |
| R14 | Phase 1 用 BLAKE2 替换 Pedersen，范围是 state、chain environment、consensus 三层；列出的条目是 contracts/storage tries、合约地址派生、OS config hash | [3] Phase 1 一节 | observed | |
| R15 | Phase 1 的时间估计：“OS config hash live in early July; other items – approximately two months from start.” | [3] Estimated time to completion | observed | |
| R16 | 路线图对共识签名的原文：“all new features will require quantum-safe implementations … implementing consensus signatures onchain using PQ signature schemes, such as Falcon-512”，没有给出时间 | [3] Phase 1 段落后一段 | observed | |
| R17 | Phase 2 的时间估计是“approximately one month after Phase 1 for easy path on StarkWare side; TBD on dapps side”；迁移工具“actively researching” | [3] Phase 2 一节 | observed | |
| R18 | Phase 3 包括 bridge secp syscalls（时间估计“1 month post-Ethereum migration”）和 blob DA/KZG（“Ethereum’s to migrate”） | [3] Phase 3 一节 | observed | |
| R19 | v0.14.3 把 OS program hash 和 config hash 从 Pedersen 换成 Blake（“Quantum-resistant SNOS hash”） | [9] 0.14.3 预发布说明；[4] Migration Register R4 “Live on mainnet · v0.14.3” | observed | |
| R20 | 主网 v0.14.3 升级于 2026-07-08 08:30 UTC 完成（预发布说明的计划日期是 07-06） | [10] status 事件 data-datetime-unix=1783499408000；[9] “Mainnet – 06 Jul 2026” | observed | |
| R21 | 源码以 `OS_CONFIG_HASH_V4_CUTOVER = V0_14_3` 切换到 Blake2Felt252 | [13] sequencer/crates/starknet_api/src/core.rs#L111-L129@54f97a8a | observed | |
| R22 | Migration Register（最后更新 2026-08-19）把 contracts trie、storage tries 和地址派生都登记为“Published roadmap direction … Planned, not live” | [4] 记录 R5、R6 | observed | |
| R23 | 截至 2026-10-13 的 sequencer 主干，合约地址派生仍用 Pedersen | [13] core.rs#L324-L340@54f97a8a | observed | |
| R24 | 截至 2026-10-13 的 sequencer 主干，contracts trie 和 storage trie 的节点哈希仍是 Pedersen，classes trie 用 Poseidon | [14] starknet_committer/src/hash_function/hash.rs#L49-L55、#L83-L88、#L113-L119@54f97a8a | observed | |
| R25 | v0.14.4（主网 2026-10-06 08:13 UTC 完成）不含 trie 或地址派生的 PQ 改动 | [11] 预发布说明全文；[12] status 事件 | observed | |
| R26 | 截至 2026-10-14，Phase 1 只有 OS hash 一项上了主网，其余两项距发布已超过 3.5 个月仍未上线 | 由 R15、R19、R22–R25 推出：06-30 发布，“~two months”的项在 10-06 版本和 10-13 主干中都不存在 | inferred | |
| R27 | 旧合约 storage map 迁移工具处于研究阶段，没有公开规范、实现或工具 | [4] Migration Register C1 | observed | |
| R28 | OZ Falcon512ShakeDirectAccount 于 2026-07-22 在主网完成一笔 0.01 STRK 转账，官方登记为“Demonstrated on mainnet”，实验性、未审计 | [4] 记录 R2；[27] StarkWare 和 OZ 推文的时间戳 | observed | |
| R29 | Quantum Hub Learn 页对“Is Starknet quantum-resistant?”的官方回答是“No. Not as a single system-wide claim.” | [5] learn 页 Selected answer | observed | |
| R30 | “within months”是媒体概括，路线图原文写的是“approximately two months from start” | [31] TQI 原文；[32] 搜索摘要；[3] 原文中没有“within months” | observed | |
| R31 | 文档写明 Starknet 的 state diff 默认以 blob 发布到 Ethereum，calldata 用于“extreme situations” | [17] data-availability.md v0.13.1 一节 | observed | |
| R32 | 自 v0.14.0（2025-09-01）起，排序由 3 个 sequencer 用 Tendermint 达成共识 | [18] version-notes v0.14.0 | observed | |
| R33 | 文档原话：“Starknet is currently still centralized”；staking 处于 4 期中的第 2 期，验证者只做 attest，block proposing 从第 3 期开始 | [16] staking.md L9、L32-L35、L167 | observed | |
| R34 | sequencer 主干的 Tendermint 投票没有签名（`TODO(Asmaa): sign the vote`，`RawSignature::default()`），也不做验证 | [15] apollo_consensus/src/state_machine.rs#L254-L255、single_height_consensus.rs#L242、manager.rs#L327-L329@54f97a8a | observed | |
| R35 | 共识网络的认证消息 `StarkAuthentication` 用的是 Stark 曲线密钥（`Felt252 operational_public_key`），属于 EC 依赖 | [15] authentication.proto 只显示 Felt252 字段，曲线类型未核实 | speculative | |
| R36 | 路线图里的“PQ 共识签名”不是替换现有签名，而是在当前没有签名的投票机制上新建一套 | 由 R16、R34 推出：投票签名尚未实现，路线图只说新功能要用 PQ | inferred | |
| R37 | 转成 L1 需要自行提供 PQ 共识、DA、结算和最终性，以及桥上资产的处理方案，官方目前都没有回答 | 由 R11、R18、R31–R34 推出：这些功能现在要么依赖 Ethereum，要么尚未去中心化，且没有 L1 规范 | inferred | |
| R38 | 只要资产仍托管在 Ethereum 的桥上，Starknet 侧的 PQ 化不能消除这些资产在 Ethereum 侧的风险 | 由 R18 推出：路线图自己写明在 Ethereum 迁移前移除 secp syscalls “would break the bridge” | inferred | |
| R39 | 按 2027 时间表交付独立的 PQ 共识（从投票签名到 PQ 签名，再到去中心化验证者）有较大进度风险 | 依据 R26、R33、R34：Phase 1 已经晚于估计，staking 只到 2/4 期；本条是判断，未经验证 | speculative | |
| R40 | EF Protocol 于 2026-09-07 提出目标：到 2029 年 12 月 L1 在 execution、consensus、data 三层抗量子 | [22] “I. The north star” | observed | |
| R41 | EF 把这个 deadline 视为“non-negotiable at least until January 2027”，届时会请外部专家重新评估 | [22] “I. The north star”末段 | observed | |
| R42 | 2026-08-19 的 Strawmap 更新在 J* 加入 MV-PQ（PQ heartbeat、leanDA sampling、leanSPHINCS tx），PQ key registry 放在 I* | [22] “Two cadences to December 2029” | observed | |
| R43 | EF 原话：“MV-PQ is designed to keep Ethereum operating through Q-day with reduced guarantees”；完整经济终局性还需要 PQ attestations | [22] “MV-PQ is a temporary safeguard” | observed | |
| R44 | EF 称“Hegotá is not the PQ fork”；Hegotá 的 SFI 头号项目是 FOCIL 和 EIP-8141 Frame Transaction | [22] “V. The next fork” | observed | |
| R45 | EF 认为共识层不能依赖密码学敏捷性，共识组件要等完整的 PQ 设计后再上 | [22] Post-quantum arc 段 | observed | |
| R46 | pq.ethereum.org 把 PQ blobs 放在 M*，把 full PQ consensus 和 PQ transactions 放在“Longer term”，与 EF 博客的 2029-12 三层目标在时间安排上不一致 | [23] Roadmap 表；[22] | observed | |
| R47 | EIP-8141、7932、8051、7619、8365 在 eips.ethereum.org 上都还是 Draft | [24] 各页面头部“⚠️ Draft” | observed | |
| R48 | “Starknet 2027”与“Ethereum 2029”不是同一口径：前者没有定义范围、没有路径；后者有三层定义、分叉路径和备用方案 | 由 R11、R12、R40、R42 推出 | inferred | |
| R49 | 2029 是 Ethereum 自己设定的完整三层 PQ 目标，日期差不能直接换算成 Starknet 领先两年 | 由 R26、R37、R48 推出：Starknet 的共识、DA、桥都还没有 PQ 方案 | inferred | |
| R50 | Quantum Hub networks 页（StarkWare 制作）给 Starknet 8/8、Ethereum 3/8，并声明不覆盖共识签名、桥和外部依赖 | [6] networks 页的计分和“Assessed scope” | observed | |
| R51 | StarkWare 的 networks 页记载 Algorand 已有原生 Falcon-1024 主网账户，并计划在 2027 年替换共识和 VRF | [6] Algorand 条目（checked 2026-09-28） | observed | |
| R52 | 因为 Algorand 也有 2027 年的目标，Starknet“first fully quantum-resistant network”的说法有竞争者 | 依据 R51，但 Algorand 的信息仅来自 StarkWare 的转述，未查 Algorand 原始资料 | speculative | |
| R53 | NIST 的 FIPS 203/204/205 于 2024-08-13 发布；FIPS 206（Falcon）仍是“in development”（页面更新于 2026-08-05） | [25] csrc PQC Standardization 页 | observed | |
| R54 | NIST IR 8547 ipd（2024-11-12）规定 112-bit 的 ECDSA/EdDSA/RSA “Deprecated after 2030”，全部“Disallowed after 2035” | [26] PDF Table 2（pdftotext 输出） | observed | |
| R55 | OpenZeppelin 推文称 Falcon-512 是“a NIST post-quantum standard”，这个说法不精确 | [27] OZ 推文原文；[25] FIPS 206 in development；[8] “FIPS 206 remains in draft” | observed | |
| R56 | docs.starknet.io Version Notes 最新只写到 v0.14.1（2025-12-10），v0.14.2 到 v0.14.4 要看论坛和 status 页 | [18] version-notes.md 首个 Update 标签 | observed | |
| R57 | v0.14.1 把 compiled class hash 从 Poseidon 改为 Blake，官方给的动机是证明效率（约 8 倍），不是 PQ | [18] v0.14.1 条目 | observed | |
| R58 | 媒体（Unchained、CryptoSlate）的定性与官方一致：只是考虑，没有批准的迁移时间表 | [28] “Neither Thursday post said whether or when a decision…”；[29] “rather than an approved migration timetable” | observed | |

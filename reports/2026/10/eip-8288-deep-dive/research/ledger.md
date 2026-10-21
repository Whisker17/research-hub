# 论断台账

每条会出现在 explainer 里的论断，都要在这里有一行。
类型：observed（直接观察到，有一手证据）/ inferred（由证据推出）/ speculative（推测，需在页面上标明）。

三路调研合并（2026-10-21）。前缀对应分册：**E** = `notes-eip.md`（EIP-8288 机制、愿景对照、支持者论点、leanVM）；**G** = `notes-agglayer.md`（AggLayer 与其他聚合方案）；**R** = `notes-recursion.md`（递归证明安全之争）。证据里的 `[n]` 指该分册“来源”一节的第 n 条；`[1]:Lx` 指本地固定版本文件的行号（`references/`）。

主会话抽查（2026-10-21）：E19（eip-8288@5a4387b.md:L251、L259、L263）、G1（aggchain_proof.rs:L21-38@9f8e6c4）、G17、G23（policy.rs:L13-17）、G25/G28/G29（SP1 Security Model 页原文）、R26（ePrint 2024/728 PDF §1 原句）、R34/R35（leanerVM docs/architecture.md@28bbeb9 L301、leanvm-target.md L90-91）均与来源一致。

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| E1 | EIP-8288 标题为 “In-mempool signature and proof aggregation”，作者 Vitalik Buterin 与 Thomas Coratger，status Draft，requires 2718、8141 | [1] eip-8288@5a4387b.md:L1–11 | observed | K |
| E2 | eip-8288.md 共 10 个提交，首次合入 1f373da（2026-09-09，原标题 “Frame Type for PQ Sig and STARK Aggregation”），最新为 72ca2dd（2026-10-15）；文件头 created 2026-06-03 对应 PR #11772 于 06-05 开出 | [2] commits API；[3] 首版文件头；[11] 1 楼 onebox | observed | K、R |
| E3 | 依赖验证帧 mode = 4（首版为 3，00afdc8 于 10-07 改为 4），不作为 EVM 代码执行 | [1]:L37、L57；[3]；[2] | observed | F1、R |
| E4 | 每条依赖是 96 字节三元组：31 个零字节 + 1 字节 scheme ‖ 32 字节 data_hash ‖ 32 字节 verification_key_hash，每帧 1–256 条 | [1]:L59–63、L73–75 | observed | K、R |
| E5 | leanSPHINCS 的第三字段直接放 32 字节公钥（root16 ‖ param16），不再哈希；首版写的是 pubkey_hash | [1]:L63；[3] | observed | K、R |
| E6 | 当前只接受 LEANSPHINCS_SCHEME；LEANSTARK_SCHEME 为保留值，使用它的帧在 get_deps_hash 定义前无效（首版允许使用） | [1]:L74；[3] | observed | F4、F8、R |
| E7 | 依赖帧要求 target 为 None（不是零地址）、value 0、flags 0、limits.state 0，并且不能属于 atomic batch | [1]:L76–81 | observed | R |
| E8 | data_hash 全零表示本交易的 compute_sig_hash(tx)，以解决签名哈希覆盖帧数据造成的自引用；ethresear.ch ISA 帖于 10-08 提出该问题，72ca2dd 于 10-15 采纳 | [1]:L97、L119；[12] 末段；[2] | observed | K、R |
| E9 | 账户通过 FRAMEPARAM(0x02/0x04) 和 FRAMEDATACOPY 读取依赖三元组；Test Case 1 由 VERIFY 帧比对存储里的公钥与零 data_hash | [1]:L125–131、L460 | observed | K、F2 |
| E10 | 聚合证明只证明“该公钥对该哈希签过名”，把它解释为对本交易的授权由账户代码负责 | 由 E9 与 [1]:L213（电路不理解交易）推出 | inferred | F2 |
| E11 | 区块头新增 recursive_stark = [stark_proof, block_deps_hash]；证明不带依赖，验证者从区块交易重算摘要；依赖为空时证明为空 | [1]:L148–152、L221–225 | observed | K、F1 |
| E12 | get_deps_hash 只对 data_hash ‖ verification_key_hash 求 DEPS_HASH，不含 scheme，且只为 leanSPHINCS 定义（首版的哈希包含 scheme） | [1]:L155–161；[3] | observed |  |
| E13 | 递归电路的公开输入为 [deps_hash, AGGREGATED_VK]，逻辑为验证直接依赖、用 AGGREGATED_VK 验证子证明、合并、丢弃、去重后比对 | [1]:L167–203 | observed | J、K、F1 |
| E14 | 规范明确为“unlimited-depth recursion”设计，并承认用户提交的 STARK VK 可能有无限递归深度 | [1]:L217、L523 | observed | K、F13 |
| E15 | AGGREGATED_VK、DEPS_HASH 与参考实现都是 TBD | [1]:L43–44、L513 | observed | F4 |
| E16 | 规范列出三项信任假设：Lean Ethereum 电路可靠性、DEPS_HASH（当前 BLAKE2s，首选替代 BLAKE3）、递归 STARK 可靠性，并承认后者增加端到端形式化证明的难度 | [1]:L521–523 | observed |  |
| E17 | wrapper 分 mode 0（逐条证明）与 mode 1（一个递归 STARK），两者都要求 deps 等于各交易依赖的去重排序并集；mode 1 的这项检查在 Chugar 09-20 报告后于 10-15 补入 | [1]:L234–261；[2] 7604300；[11] 10 楼 | observed | F5、R |
| E18 | mempool 节点每 1,000 ms 生成一个覆盖全部仍有效交易的 mode 1 wrapper，删除不可打包交易的依赖，并对已发送交易只发哈希 | [1]:L45、L243、L263、L275–277 | observed | L、F5、F6 |
| E19 | 规范同时把 mode 1 wrapper 限制在至多 16 个 leanSPHINCS、1 个 leanSTARK 依赖 | [1]:L259–260、L48–49 | observed | F6、Q、R |
| E20 | 按字面读，E18 与 E19 合起来使每个节点每轮的聚合最多覆盖 16 个签名，与“每 slot 处理数千个签名”的目标冲突 | 由 E18、E19 与 [1]:L415 推出 | inferred | F6、Q、R |
| E21 | builder 收集 FOCIL 与 wrapper 的证明，删掉未入块交易的依赖后重新递归，写入区块头；规范称这与 mempool 节点、FOCIL 生成者是“exactly the same task” | [1]:L326–338 | observed | F1 |
| E22 | 8288 把 FOCIL 扩展为 [transactions, recursive_stark]，要求 attester 验证 FOCIL 内的递归证明 | [1]:L304–320 | observed | F7 |
| E23 | 每条依赖的帧执行 gas 为 3,000（leanSPHINCS）或 30,000（leanSTARK），另按每条声明（含重复）收 30,000 计入 intrinsic；交易回滚也照收 | [1]:L373–391 | observed | F3 |
| E24 | 一条 leanSPHINCS 依赖的边际 gas 为 33,000（另有 96 字节数据费，新开帧再加 475），且按声明定额收取，不随区块依赖数分摊 | 由 E23 与 [4]:L39 推出 | inferred | F3、R |
| E25 | 首版把 recursive_stark_gas 按全块依赖数计入区块 base fee，9ee171b（10-07）改为由交易承担 | [3] Gas Accounting；[2] | observed | F3、R |
| E26 | EIP-8141 为 Draft，在 EIP-8081 中是 Hegotá 的 SFI（同列只有 EIP-7805）；8288 不在 8081 任何一栏 | [4]:L7；[6] | observed | J、F4、F7 |
| E27 | EIP-8292 规定共识层聚合者角色，“The execution layer is unchanged”；8288 称同一 STARK 后端可同时服务 CL 与 EL | [5] Specification；[1]:L350 | observed |  |
| E28 | 规范 Gas 一节仍按 KoalaBear 的 2^24 trace 上限描述，而 leanVM README 已把 KoalaBear 列为历史设计，两者口径不一致 | 由 [1]:L428 与 [14]:L62 对照推出 | inferred |  |
| E29 | Vitalik（09-09）希望 8288 进入 I-star，描述 tick 约 500 ms、每 tick 外发一个 100–300 kB STARK、链上开销为一个 STARK 加每条 96 字节，并称需要约定 ISA（首选 RISC-V） | [7] | observed | F5、M |
| E30 | 规范的聚合间隔为 1,000 ms，builder 每间隔的 STARK 开销约 256 kB，与推文的 500 ms、100–300 kB 分别不同和吻合 | [1]:L45、L407；[7] | observed | M |
| E31 | 私有 AA、“Proof Singularity”、ISA 选择、“不再加预编译”都没有出现在 8288 规范中 | [1] 全文通读 | observed | M |
| E32 | SPHINCS- 是 keccak 版 SPHINCS+ 变体（签名 3,704–6,512 B），作者说明只有 leanSPHINCS 能在聚合电路中原生验证，SPHINCS- 需要 client-side STARK 包装 | [13] §5–§6 | observed | M |
| E33 | 按当前草案，“自选签名或隐私证明经 client-side STARK 进入 8288”不可用，因为 leanSTARK 无效、VK 只是 hash、ISA 未定 | 由 E6、E15 与 [12] 推出 | inferred | M、F8 |
| E34 | Vitalik（10-19）称预编译和 EVM 是放密码学的错误位置，calldata 实际上限约 8 MB/s，并主张“EIP-8288 maximalism”与不再新增预编译 | [8] | observed | M |
| E35 | 在手机端为 Falcon / ML-DSA / 隐私电路做 client-side leanVM 证明的成本，没有找到一手基准 | 检索 [14][12][1] 均无；推文 [8] 仅为断言 | speculative | F8 |
| E36 | Magicians 帖中 Vitalik 对格签名的回答是“strong preference to keep the base layer purely hash-based … maintain less total infrastructure”；全帖 13 楼没有递归深度或 soundness 的讨论 | [11] 5 楼与全帖 | observed |  |
| E37 | 社区指出聚合证明只证明已纳入依赖有效，不证明 builder 没有遗漏收到的有效依赖（omission accountability） | [11] 3、8、11 楼 | observed | F7、P |
| E38 | ethresear.ch ISA 帖认为 vk_hash 是占位，证明系统级 VK 会随 leanVM 升级变化、破坏不可升级合约，并建议把 0x11 换成以 program_id = hash(ISA 版本, 程序字节) 标识的 program scheme | [12] 正文 | observed | M、F8 |
| E39 | decentrek 声称 8288 使“节点越多、可处理的签名/证明越多”、每节点证明带宽恒定、builder 硬件要求不升、验证者只验一个证明、任意签名可经 STARK 包装 | [9]；[10] | observed | L |
| E40 | “带宽恒定”只对证明部分成立：交易正文仍要广播一次，wrapper 中的依赖列表与交易哈希随交易量线性增长，首跳还要携带原始签名或 STARK | 由 E17、E18、[1]:L346 与 [7] 推出 | inferred | F5 |
| E41 | 规范没有把聚合工作分配给不同节点，每个节点都聚合整个活跃池，也没有任何证明激励，所以“节点越多容量越大”缺少机制支撑 | 由 E18 与 [1] 全文（无激励条款）推出；[5] Open questions 承认 CL 也无显式奖励 | inferred | F6、P |
| E42 | 按 EIP-8292 的实测（共识层、XMSS、单消息聚合，不是 8288 的 leanSPHINCS mempool 循环），1,000 个签名的单消息聚合在 2 / 8 / 16 核机器上分别约需 11 / 3.7 / 2.6 s，都超过 8288 的 1,000 ms 间隔（XMSS / CL 场景） | [5]:L88–93 | observed | F6 |
| E43 | “每秒数万笔 PQ / 隐私交易”没有一手依据；按 33,000 gas/条、12 s slot 计，1 万笔/秒仅依赖 gas 就约需每块 4×10⁹ | 由 E24 推算；[10] 无来源 | speculative | F6 |
| E44 | leanVM 自述为“minimal hash-based zkVM”，声称 128-bit ROM（64-bit QROM），形式化验证进行中、尚未生产就绪，BLAKE2s 是占位，计划迁到 rv64im 并加入 zk | [14]:L7、L47–60 | observed | P |
| E45 | EIP-8292 称当前 leanVM 实例约为 124 位经典、62 位量子安全，低于 NIST Level 1，与 README 的 128 / 64 位不一致 | [5]:L163；[14]:L47 | observed | P、Q |
| G1 | AggLayer 的 PP 程序在 SP1 zkVM 里调用 `verify_sp1_proof` 验证 aggchain proof，属于“证明里验证证明” | [2] aggchain_proof.rs:L32-38@9f8e6c4 | observed | F9、R |
| G2 | 被验证的 aggchain proof 的公开值包括前后 local exit root、l1_info_root、origin_network、aggchain_params 和 imported bridge exits 承诺 | [2] aggchain_proof.rs:L21-30@9f8e6c4 | observed | F9 |
| G3 | AggchainData 只有三种模式：LegacyEcdsa、MultisigOnly、MultisigAndAggchainProof | [3] mod.rs:L31-51@9f8e6c4 | observed | F9 |
| G4 | aggchain proof 只能和多签一起出现，多签签的是包含 aggchain_params 的承诺 | [3] mod.rs:L80-95@9f8e6c4 | observed | F9 |
| G5 | 多签允许空集、阈值 0（有专门的 EMPTY_MULTISIG_HASH），所以“只有 aggchain proof”在编码上是空多签加 aggchain proof | 由 G4 和 [5] aggchain_hash.rs:L31-34 推出：空多签有约定的哈希值，阈值 0 时阈值检查 [4] multisig.rs:L69-75 能通过 | inferred |  |
| G6 | 多签按阈值验证，用 ECDSA 从 prehash 恢复地址，再与登记的签名者比对 | [4] multisig.rs:L61-97@9f8e6c4 | observed |  |
| G7 | 源码里三种模式的 aggchain_hash 都按 ConsensusType1 计算，LegacyEcdsa 被映射为 1-of-1 多签 | [5] aggchain_hash.rs:L43-71、L76-85@9f8e6c4 | observed |  |
| G8 | Polygon 文档把 ECDSA 写成 CONSENSUS_TYPE 0，和 @9f8e6c4 源码的哈希方式不一致 | [14] Aggchain Proof 页；对照 G7 | observed |  |
| G9 | PP 证明的是：一份证书作用到旧的 exit/balance/nullifier 树上，得到新的状态承诺和新的 pessimistic root | [6] proof.rs:L236-284@9f8e6c4；[7] local_state/mod.rs:L21-29 | observed |  |
| G10 | PP 对出桥做余额 checked_sub，下溢时拒绝，以此防止提走超过余额的资产 | [7] local_state/mod.rs:L157-161@9f8e6c4 | observed |  |
| G11 | PP 对入桥检查 L1 info root 下的包含证明，并用 nullifier 树防止重复领取 | [7] local_state/mod.rs:L85-96@9f8e6c4 | observed |  |
| G12 | 本链原生代币的出入桥不计入余额树约束 | [7] local_state/mod.rs:L100-104、L144-147@9f8e6c4 | observed |  |
| G13 | 官方文档说明 PP 先用原生 Rust 执行，再经 SP1 Prover Network 证明，然后由 AggLayer 节点本地验证 | [13] Architecture Overview Step 2–4 | observed | N |
| G14 | PP 的安全目标是：被攻破的链损失的上限是它自己的存款，不保证链内交易都正确 | [13] Security Guarantees；后半句由 G9、G10 推出：PP 只约束桥账本 | inferred | N |
| G15 | AggLayer 节点为每个证书单独构造一笔 `verifyPessimisticTrustedAggregator(rollupID, …)` 结算交易 | [9] certificate_task.rs:L379-446@9f8e6c4 | observed | F10、R |
| G16 | 在 @9f8e6c4 中没有把多条链的证书聚合成一份 L1 证明的路径 | 由 G15、[8] main.rs:L8-19（一次一个网络状态）和 [12] 函数签名（一次一个 rollupID）推出 | inferred | F10、R |
| G17 | 同一网络当前不能同时有多个证书在处理 | [9] certificate_task.rs:L254-258@9f8e6c4 注释 | observed | R |
| G18 | L1 结算函数只允许 TRUSTED_AGGREGATOR_ROLE 调用 | [12] AgglayerManager.sol@1c00e15 `verifyPessimisticTrustedAggregator` 修饰符 | observed | F10、R |
| G19 | AggLayer 结算的活性和抗审查依赖 trusted aggregator 角色的持有者；安全性由证明保证 | 由 G18 推出：只有该角色能提交结算，但提交的内容要过证明验证 | inferred | F10、P |
| G20 | L1 合约用上一次的 LER/PP root、l1InfoRoot、rollupID、aggchain 合约返回的 aggchainHash、新 LER/PP root 重算 PP 公开输入 | [12] `_getInputPessimisticBytes`（ALGateway 分支） | observed |  |
| G21 | AggLayer 上 L1 的 PP 证明是 SP1 的 PLONK 包装 | [12] NatSpec `@param proof SP1 proof (Plonk)` | observed | F10、R |
| G22 | SP1 用 gnark 的 Groth16/PLONK over BN254 压缩 STARK 后上链，PLONK 使用 Aztec Ignition 通用可信设置 | [16] Groth16/PLONK 与 Trusted Setup 两节 | observed | F10 |
| G23 | AggLayer @9f8e6c4 只执行、只写 SP1 v6 证明 | [10] policy.rs:L13-17@9f8e6c4 | observed | R |
| G24 | SP1 v6 就是 SP1 Hypercube | [17] Introduction | observed |  |
| G25 | SP1 Hypercube 的内存论证假设 KoalaBear 7 次扩域上椭圆曲线 DLP 是难的 | [16] “Security of Elliptic Curves over Extension Fields” | observed | F10、R |
| G26 | AggLayer 当前的端到端验证路径不是后量子安全的（PLONK/BN254、ECDSA、SP1 内部的 ECDLP 假设） | 由 G6、G21、G22、G25 推出：这几个组件都依赖量子可破的离散对数/配对假设 | inferred | F10、P |
| G27 | 没有找到 AggLayer 面向 PQ 的一手设计材料 | 搜索 “agglayer post-quantum” 没有一手结果；无法证明“不存在”，所以是推测 | speculative |  |
| G28 | SP1 明确假设递归步数增加不带来安全损失 | [16] “Recursion's Overhead in Security” | observed | R |
| G29 | SP1 通过让整体电路深度小于 Poseidon 的深度来避开 ePrint 2025/118 的 Fiat–Shamir 攻击 | [16] Hash Functions and ROM 一节 | observed | R |
| G30 | EIP-8288 在 Security Considerations 中把“递归 STARK 的 soundness”列为信任假设，并承认它增加了端到端形式化的难度 | [1] eip-8288@5a4387b.md:L523 | observed | N |
| G31 | EIP-8288 的递归电路做的是“验证输入、并集、去重、丢弃”，最终 deps_hash 必须等于区块依赖的哈希 | [1] eip-8288@5a4387b.md:L167-205、L221-227 | observed | N |
| G32 | EIP-8288 把 AGGREGATED_VK 作为公开输入，以支持不限深度的递归 | [1] eip-8288@5a4387b.md:L219 | observed | N |
| G33 | EIP-8288 的聚合由 mempool 节点、FOCIL 创建者和 builder 执行同一项任务，mempool 节点每 1000ms 递归一次 | [1] eip-8288@5a4387b.md:L43-45（常量）、L276-287、L338 | observed | N |
| G34 | AggLayer 的应用层组合是固定的一层（PP 包含 aggchain proof）；8288 结构上允许多方、不限深度的组合 | 由 G1、G3、G16 与 G32、G33 推出 | inferred | N |
| G35 | AggLayer 的组合语义是状态连续性加余额/nullifier 约束（依赖应用语义），8288 的组合语义与应用无关（并集/丢弃） | 由 G9–G11 与 G31 推出；[1] L215 “电路不理解交易” | inferred | N |
| G36 | AggLayer 的 PP 自 2025-02-03 起在主网上线 | [18] agglayer.dev 官方博客 | observed | N |
| G37 | AggLayer README 仍警告“代码仍在审计中、API 可能变化” | [11] README.md:L58-59@9f8e6c4 | observed | N |
| G38 | EIP-8288 仍是 Draft，Reference Implementation 写着 TBD，AGGREGATED_VK、DEPS_HASH 也是 TBD | [1] eip-8288@5a4387b.md:L5、L43-44、L513 | observed | N |
| G39 | SP1 文档认为一般情况下证明单个程序比“多证明再聚合”更快更省，聚合只在少数场景有用 | [15] “When should SP1 proof aggregation be used?” | observed |  |
| G40 | Aligned、NEBRA UPA、Starknet SHARP 都是由单个运营方/aggregator 把多份证明递归或批量聚合成一份，再交给链上合约验证 | [19] Aggregation Service；[20] “single (permissioned) Aggregator”；[21] SHARP recursion | observed | N |
| G41 | 在已知的生产系统中，还没有像 8288 那样把递归聚合写进 L1 区块有效性、并由无许可 mempool 节点分布式执行的先例 | 只对照了 G40 中的三个系统和 AggLayer，覆盖面不完整，无法断言 | speculative | N |
| G42 | “AggLayer 在做类似的事”这一说法的出处，在 brief 给的推文里找不到 | 读过 decentrek_status_2112535053188145367.md 等推文原文，没有提到 AggLayer；其他推文没有逐条全文核对 | speculative | I、Q |
| R1 | Justin Thaler 是 a16z crypto research 的 Research Partner，同时是 Georgetown 计算机系副教授（休假中） | [7] a16z 团队页；[8] Georgetown 个人页 About Me | observed | O |
| R2 | Thaler 是 Aerie 论文的作者之一，批评的是与自己方案竞争的路线 | 全文核对（Internet Archive 快照，见 references.md）：2026-2501 p.1 作者栏；p.26 Disclosures | observed | O |
| R3 | EIP-8288 把“递归 STARK 的 soundness”列为独立的信任假设，与哈希函数 soundness 分开 | [1] eip-8288@5a4387b.md:L521-523 | observed | O、F11 |
| R4 | EIP-8288 自述该假设“widely believed to be true”，且“adds difficulty to end-to-end formally proving the scheme” | [1] eip-8288@5a4387b.md:L523 | observed | F11 |
| R5 | EIP-8288 把 AGGREGATED_VK 作为证明的公开输入，目的就是支持无限深度递归 | [1] eip-8288@5a4387b.md:L191、L217 | observed |  |
| R6 | EIP-8288 规范没有给递归深度设上限；mempool 每轮会把自己上一轮的聚合再折叠，深度随交易在 mempool 的停留轮数增长 | 由 R5 与 [1] Recursive Mempool Aggregation 节（优先级第 1 项）推出：每个 AGGREGATION_INTERVAL 都在上一轮证明之上再包一层 | inferred | J、P |
| R7 | 当前草案只接受 leanSPHINCS 依赖，用户自带 STARK（LEANSTARK_SCHEME）仍是保留值 | [1] eip-8288@5a4387b.md:L74 | observed | F13 |
| R8 | 当前交易规则只接受 leanSPHINCS 依赖，被递归证明的外层程序固定（`AGGREGATED_VK`），所以“用户提交任意程序的证明”不是已启用的交易功能；攻击者在交易层只能控制签名、公钥等依赖内容。本次核对的 KRS/Fenzi 型攻击都需要攻击者决定被证明的计算（自造电路，或在通用电路的见证中放程序）。递归树内部是否也排除了任意程序，见 R67 | 全文核对（Internet Archive 快照，见 references.md）：eip-8288@5a4387b.md:L168–219；2025-118 Thm 1/2（p.4–5）、Thm 9（p.14）；2026-1838 摘要 | inferred | F13、P |
| R9 | leanVM 声称 128 位 ROM、64 位 QROM soundness，形式化验证进行中、尚未达到生产就绪 | [3] leanVM-README@3a37fb6.md:L43-52 | observed | J、F14、P |
| R10 | Aerie 的 knowledge soundness 是在经典随机预言机模型中证明的，所以它同样依赖 Fiat–Shamir/ROM | 全文核对（Internet Archive 快照，见 references.md）：2026-2501 Def 5.6、Thm 5.9（§5.6，p.18–19）；§6.1 cSHAKE256（p.21） | observed | J、F14 |
| R11 | Aerie 的 HashToPoint 由验证者在证明之外计算，证明里不包含哈希 | 全文核对（Internet Archive 快照，见 references.md）：2026-2501 §3.2（p.9）；p.3 “Aerie's relation evaluates no hash function” | observed | F14 |
| R12 | Aerie 与 leanVM 的安全差别不在“是否依赖 ROM”，而在“是否需要在电路内证明关于 FS 哈希的命题” | 由 R9、R10、R11 推出：两者都靠 ROM，只有递归方案要在电路里重算验证者哈希 | inferred | F14 |
| R13 | Aerie 在 M4 Max 上用 16 线程约 645 ms 证明 32,768 个 Falcon-512 签名，单个证明，无递归 | 全文核对（Internet Archive 快照，见 references.md）：2026-2501 摘要；Table 2（p.22，0.65 s，16 线程） | observed |  |
| R14 | 共用 salt 模式假设“fixed-target signer”不可伪造（Assumption C.8）；Fouque 等只证明了 fresh salt 的情形；作者称不知道有攻击；共用 salt 的大小只是估算 | 全文核对（Internet Archive 快照，见 references.md）：2026-2501 §3.2（p.9–10）、§5.7 “Common Salts”（p.21）、§6.2（p.23） | observed | F14 |
| R15 | Aerie 是研究发布，两套参数都未通过其发布政策的生产准入标准 | [4] aerie-README@49b6c21.md:L20-24 | observed | F14 |
| R16 | CGH 证明存在在 ROM 中安全、但任何具体实现都不安全的签名与公钥加密方案（Thm 4.4、4.6）。构造方法是基于 correlation intractability 与 CS proofs 的对角化；“人为构造”的定性来自 KRS 摘要 | 全文核对（Internet Archive 快照，见 references.md）：1998-011 摘要（p.1）、§6.1（p.30）；2025-118 摘要 | observed | J、R |
| R17 | KRS 证明：对 GKR + 任意 MLPCS 的论证，只要电路深度 d ≥ d_comm + d_h + O(1)，FS 编译后不具备自适应可靠性。攻击者需要知道哈希与承诺的参数，并据此构造电路（Thm 1）；还可以把任意电路改成功能等价、但带“后门”的电路（Thm 2） | 全文核对（Internet Archive 快照，见 references.md）：2025-118 Thm 1（§1.1.2，p.4）、Thm 2（p.5） | observed | J、F13 |
| R18 | KRS 攻击的关键是电路在内部计算自己的首个 Fiat–Shamir 挑战 | 全文核对（Internet Archive 快照，见 references.md）：2026-1838 §1（p.2）原句；2025-118 p.4 | observed | F13 |
| R19 | 非自适应版本有两种：一是通用图灵机电路加 quine，攻击程序作为见证传入，代码更短的承诺（含 FRI）都适用，但作者称其 “not efficient”（Thm 9）；二是加法同态承诺，或做了批量处理的 FRI（Thm 10，非正式）。两者攻击的都是 GKR 协议 | 全文核对（Internet Archive 快照，见 references.md）：2025-118 摘要；§4.1 Thm 9（p.14）；§4.2 Thm 10（p.15） | observed | F13 |
| R20 | KRS 作者中 Khovratovich 与 Soukhanov 署名 Ethereum Foundation，Rothblum 署名 Succinct | 全文核对（Internet Archive 快照，见 references.md）：2025-118 p.1 脚注 | observed | O、F13 |
| R21 | 补充：被攻击的单变量 IOP 是 Aurora 与 STIR 的基础，属于 Merkle 承诺、RS 编码、经 BCS 编译的哈希型 IOP。攻击前提是首个 FS 挑战只哈希程序、不哈希生成后的实例，并且攻击者控制程序 | 全文核对（Internet Archive 快照，见 references.md）：2026-1838 摘要；Thm 2（p.5）；p.6；§7（p.24、Cor 7.6–7.7） | observed | F13 |
| R22 | Fenzi 证明：从生成出的实例而非生成它的程序派生首个 FS 挑战，可把 soundness 归约回底层协议 | 全文核对（Internet Archive 快照，见 references.md）：2026-1838 摘要；p.6 第 1 条（Theorem 5.5） | observed | F13、P |
| R23 | 为防 KRS 型攻击提出的扩展 FS（XFS）已有人为构造的反例 | 全文核对（Internet Archive 快照，见 references.md）：BHK 摘要。旁证：2026-1838 p.2 把 [BHK26] 列为 “relatively contrived” 的反例工作（是否针对 XFS 未从全文确认）；原证据：[14] Brzuska–Hubáček–Kalsta PKC 2026 摘要 | observed |  |
| R24 | 本次核对的 KRS/Fenzi 型 FS 攻击都需要攻击者决定被证明的计算：KRS 是自造电路或在通用电路中放程序，Fenzi 是控制生成实例的程序。对象是 GKR 类论证，以及针对“由程序生成的实例”的 IOP，其中包括 Aurora/STIR 型的哈希型（Merkle/RS）IOP。在本次检索范围内，没有找到这类攻击针对固定电路（固定 AIR）的 STARK 或递归验证电路的已发表案例。另有针对弱 FS 实现的攻击，不在此列。KRS 作者明确说，不知道攻击不等于不存在 | 全文核对（Internet Archive 快照，见 references.md）：2025-118 Thm 1/2/9/10、§5（p.16）；2026-1838 p.5–6、§7；R18 | inferred | F13 |
| R25 | 在 ROM 中，能证明“含预言机查询的计算”的相对化 succinct argument 不存在，这一路线下的 IVC/PCD 被排除 | 全文核对（Internet Archive 快照，见 references.md）：2024-728 Thm 1、Thm 2（§1.1，p.4）、Lemma 1 与 IVC/PCD 段（p.5）、§2.7（p.14） | observed | F11 |
| R26 | 2024/728 明确写道：非相对化 IVC/PCD 在 ROM 中是否存在仍是开放问题 | 全文核对（Internet Archive 快照，见 references.md）：2024-728 §1.1 末段（p.5）原句 | observed | F12、R |
| R27 | Thaler 的说法若读作“纯 ROM 无法直接刻画递归这一步，最自然的相对化路线已被证否”，与 2024/728、2023/1646、Aerie 原文一致；若读作“已证明不可能”则偏强，因为非相对化 IVC/PCD 在 ROM 中仍开放，2023/1646 也在 ROM 中证明了非简洁理想化版本的紧界 | 全文核对（Internet Archive 快照，见 references.md）：2024-728 p.5；2023-1646 §1.1.2（p.5）、§2.3（p.12–14）；2026-2501 p.3 | inferred | F12 |
| R28 | 基于递归知识提取的标准证明只对常数次递归组合有效，原因是每层提取器都会多项式膨胀 | 全文核对（Internet Archive 快照，见 references.md）：2012-095 §1.4 Challenge 2（p.10）、§2.2 “Why only constant depth?”（p.14–15） | observed | J、F11 |
| R29 | 已知 PCD 安全分析的损失随递归深度指数增长：提取器规模约为 $n^{c^d}$。这是 2023/1646 与 2024/728 的原话，Thaler 的说法与之一致。这是证明技术的损失，不是攻击 | 全文核对（Internet Archive 快照，见 references.md）：2023-1646 §1（p.3）、§2.1（p.8–9）；2024-728 §1（p.3）；2026-2501 §1.2（p.4） | observed | J |
| R30 | 已知 PCD 安全分析会带来昂贵的膨胀，而从业者因按其设参数代价过高而忽略了它 | 全文核对（Internet Archive 快照，见 references.md）：2023-1646 摘要；§1.1.2（p.5） | observed | F12 |
| R31 | Theorem 1：底层相对化论证若有 straightline 提取器，则 κ_PCD ≤ κ_ARG(λ,q,s+O(N·t_ARG))，在纯 ROM 中与节点数 N 无关。对哈希型递归 STARK，严格证明的对象是 ROM 中的非简洁理想化版本（证明里附上查询-应答对）。把它当作真实系统的安全等级，是与随机预言机方法同类的猜想（“heuristic”“partial evidence”） | 全文核对（Internet Archive 快照，见 references.md）：2023-1646 摘要；Thm 1（§1.1，p.4）；§2.3（p.12–14） | observed | F12 |
| R32 | osROM 比 ROM 更难实例化，可对多项式深度给出可证明的 IVC 安全，分析对象是椭圆曲线二循环上的 HyperNova | 全文核对（Internet Archive 快照，见 references.md）：2025-1663 摘要；§1.1（p.2–3） | observed | F12、R |
| R33 | 2025/1663（作者 Maller、Zapico 署名 EF，Mohnblatt 署名 Bain Capital Crypto）写道：“theoretical challenges limit the provable security of known IVC constructions” | 全文核对（Internet Archive 快照，见 references.md）：2025-1663 p.1 作者单位与摘要 | observed | O、F12、R |
| R34 | leanVM 的官方形式化项目把递归提取桥（T6）列为开放研究问题，端到端 soundness 定理（T7）在 T6 解决之前只是条件化的目标模式 | [19] leanerVM docs/architecture.md @28bbeb9 “Target theorem ladder” T6、T7 | observed | F11、R |
| R35 | leanerVM 审计指出 leanVM 没有公开的递减递归深度度量，MAX_RECURSIONS 只限制子证明数量，不限制深度 | [19] leanerVM docs/leanvm-target.md “Concrete target map” | observed | F11、P、R |
| R36 | leanerVM 明确禁止把 ROM 知识可靠性当作公理换成普通模型知识可靠性，并要求非 straightline 提取器给出有意义的深度上限 | [19] leanerVM docs/architecture.md T6 条目 | observed |  |
| R37 | 对 8288 设想的实用、简洁哈希型递归 FS-SNARK，目前没有已知的普通 ROM 安全证明；Ethereum 一方的规范与形式化项目也承认相关递归可靠性缺口，不只是 a16z 的说法 | 全文核对（Internet Archive 快照，见 references.md）：原证据 + 2023-1646 p.5、p.15；原证据：由 R4、R33、R34 推出 | inferred | F11、P |
| R38 | Thaler 本人承认不知道任何对 SNARK 递归的直接攻击 | 全文核对（Internet Archive 快照，见 references.md）：SuccinctJT 推文 L25 | observed | F13 |
| R39 | 本路没有找到针对 EIP-8288 的可利用漏洞，也没有找到对 leanVM 递归的已发表攻击 | 全文核对（Internet Archive 快照，见 references.md）：全文核对未发现针对 leanVM 的内容 | inferred | F13 |
| R40 | 其他 zkVM 的递归聚合出现过实现层 soundness bug：ZisK 允许把所有子证明标成 null 以跳过 STARK 检查 | [20] zisk Release v1.3.2-alpha（GHSA-3j5v-j2rm-9c5f） | observed | F15 |
| R41 | 这些递归实现 bug 属于工程层错误，不是对递归理论模型的攻击 | 由 R40 推出：根因是空子证明处理与 FS 转录绑定遗漏，修复后协议不变 | inferred | F15 |
| R42 | leanVM 自述是“极简、基于哈希的 zkVM”，计划从 leanISA 迁移到 RISC-V | [3] leanVM-README@3a37fb6.md:L7、L59 | observed |  |
| R43 | 截至 2026-10-11，leanVM 的递归 guest 只验证原始签名和自身证明，还不能验证其他程序的证明 | [23] ethresear.ch ERC-8403 帖（Ankushin，leanVM b977f5fa） | observed | F8 |
| R44 | 二进制域 SNARK 证明格运算的整数乘法很慢 | Thaler 推文 [2]:L32 的论断；leanVM README 只有 mod 2^64−1 的 Fibonacci 数据，无格运算对照，本路无法验证 | speculative |  |
| R45 | AI 会加速对 Fiat–Shamir 和递归的密码分析 | Thaler 推文 [2]:L25；这是对未来的预测，无法用现有证据验证 | speculative |  |
| R46 | 公钥加密不能以黑盒方式只从哈希构造 | Thaler 推文 [2]:L36；这是经典黑盒分离结果，但本路未抓取原文（Impagliazzo–Rudich 1989）核实 | speculative |  |
| R47 | 对 GKR 类协议，KRS Theorem 2 给出具体构造：功能等价、但带“后门”、可证明任意输出的电路。对“多程序递归树中跨程序破坏”，仍没有已知构造 | 全文核对（Internet Archive 快照，见 references.md）：2025-118 Thm 2（p.5）；Green 博客 | speculative | O |
| C1 | a16z 于 2026-10-16 发布 Aerie 博客，用格型 SNARK 聚合 Falcon 签名，不用递归 | notes-recursion 来源 [5]（a16z 博客，2026-10-16）；[6] ePrint 2026/2501 摘要 | observed | I |
| C2 | Vitalik 于 2026-09-09 发推 “A note on recursive STARK mempools (EIP-8288)”，希望它进入 Hegotá 之后的 I-star 分叉 | references/VitalikButerin_status_2097711433073172837.md:L4、L7 | observed | I |
| C3 | decentrek 于 2026-09-11 与 2026-10-20 两次发推解读 8288，称它是“my new favorite EIP of all time”，并做了动画 | references/decentrek_status_2098392867773509799.md:L4；decentrek_status_2112535053188145367.md:L4、L7 | observed | I |
| C4 | Justin Thaler 于 2026-10-21 00:46 UTC 发长文，称真正的争论“is not lattices vs. hashes — it is lattices vs. building everything on SNARK recursion”，并点名 EIP-8288 | references/SuccinctJT_status_2112706944548880442.md:L4、L15 | observed | I、O |
| C5 | Thaler 同一篇里说，把签名与证明在链下聚合成一个区块级证明“is a powerful design independent of the hash-only vs. lattice debate”，他并不反对这种设计 | references/SuccinctJT_status_2112706944548880442.md:L31 | observed | O |
| C6 | Thaler 主张“cryptographic agility and defense in depth (e.g., hybrid signatures)”，并说他们同时在做 lattice-Jolt 与 hash-Jolt；他还提到 StarkWare 在降低 Falcon 验证成本 | references/SuccinctJT_status_2112706944548880442.md:L40 | observed | P |
| C7 | Thaler 的 X 账号名 @SuccinctJT 与 SP1 背后的 Succinct 公司无关；他的身份是 a16z crypto research partner | notes-recursion 资料修正第 5 条；R1 | inferred | O |
| C8 | 8288 的“区块级聚合”与“是否只用哈希”是两个可以分开讨论的问题：连批评方也认可前者 | 由 C5 与 E13、E21 推出 | inferred | P |
| C9 | 这场争论的技术焦点是“递归 Fiat–Shamir 证明的 soundness”这一条假设，而不是哈希与格本身谁更安全 | 全文核对（Internet Archive 快照，见 references.md）：2026-2501 p.3、p.18–19；原证据：由 C4、R3、R12、R37 推出：8288 自己把递归 soundness 列为独立假设；Aerie 与 leanVM 都依赖 ROM，差别只在是否在电路内证明 FS 哈希 | inferred | F14 |
| C10 | 截至 2026-10-21，没有找到 EF、StarkWare 或 leanEthereum 研究者对 Thaler 这篇推文的实质性公开回应 | notes-recursion 开放问题 5（检索受限、x.com 回复无法检索） | speculative | O、Q |
| C11 | leanVM @3a37fb6 自报基准（M4 Max，未用 GPU）：聚合 850 个 leanSPHINCS 签名 1.0 s、峰值 16.1 GiB、证明 325.8 KiB、验证 5.1 ms；2→1 递归 0.291 s、14.7 GiB、201.5 KiB；leanSPHINCS 参数“not the definitive parameter set” | references/leanVM-README@3a37fb6.md:L90、L97–103、L129–134 | observed | J |
| C12 | Aerie @49b6c21 自报基准（M4 Max，16 线程）：32,768 个 Falcon-512 签名证明 645 ms、单线程验证 53.6 ms、含独立 salt 1,346 KiB、共用 salt 66 KiB、峰值 2,113 MiB | references/aerie-README@49b6c21.md:L197 | observed |  |
| C13 | 按现行定价，一条 leanSTARK 依赖要付 30,000（帧执行）+ 30,000（intrinsic 分摊）= 60,000 gas，但这条路目前无效 | 由 E23 与 E6 推出 | inferred | M |
| R48 | SP1 在 v3.0.0 之前（`sp1-recursion-circuit` < 3.0.0），递归电路采样挑战 zeta 前没有把置换论证的累积和写入 Fiat–Shamir 记录；公告称利用它“practically infeasible”，v3.0.0 修复 | GitHub Advisory GHSA-8m24-3cfx-9fjw（api.github.com/advisories，发布 2024-11-08，访问 2026-10-21） | observed | F15 |
| R49 | 2023/1646 作者原话：对哈希型 PCD，要么攻击可归约到理想化 PCD，要么攻击利用具体哈希的实例化，后者是开放问题；Thaler 的论点 D 与此一致 | 全文核对（Internet Archive 快照，见 references.md）：2023-1646 §2.3（p.14） | observed | F12、R |
| R50 | 2023/1646 以 StarkWare 递归 STARK 为例：用户提交任意程序，合规谓词不限深度和规模；该系统假设递归后的安全等于单个 STARK 的安全 | 全文核对（Internet Archive 快照，见 references.md）：2023-1646 §2.4（p.15–16） | observed | O |
| R51 | KRS 指出，调用 FS 哈希与承诺的电路在实践中常见，尤其在递归证明组合中 | 全文核对（Internet Archive 快照，见 references.md）：2025-118 p.4–5 | observed | F13 |
| R52 | KRS Theorem 2：任意电路都可改写为功能等价、但能证明任意输出的电路，所以安全性取决于电路的具体实现，而不只是它的功能 | 全文核对（Internet Archive 快照，见 references.md）：2025-118 Thm 2（§1.1.3，p.5） | observed | F13、O |
| R53 | KRS 非自适应攻击：通用电路加 quine 的版本适用于代码较短的承诺（含 FRI），但效率低；作者无法直接攻击不做批量处理的 FRI，做了批量处理的 FRI 可以攻击；两者攻击的都是 GKR 协议 | 全文核对（Internet Archive 快照，见 references.md）：2025-118 Thm 9（p.14）、Thm 10 与其后段落（p.15） | observed | F13 |
| R54 | KRS 认为攻击依赖 GKR“不承诺完整计算轨迹”；缓解是让电路不足以计算哈希（深度、承诺中间值），或采用 XFS；作者说不知道攻击不等于不存在 | 全文核对（Internet Archive 快照，见 references.md）：2025-118 §5（p.16） | observed | F13 |
| R55 | Fenzi 认为攻击可能适用于“虚拟机的证明系统，只要关系是（部分）生成的”，并建议在第三方控制计算（编译用户代码、自动预编译、AI 生成电路）时审慎审计 | 全文核对（Internet Archive 快照，见 references.md）：2026-1838 p.6 | observed | F13 |
| R56 | 开放 `LEANSTARK_SCHEME` 后会引入攻击者选择的程序；Fenzi 的攻击是否适用，取决于证明系统怎样生成并绑定被证明的关系。在该论文分析的“生成关系”设定下，把生成后的语句哈希进首个挑战可归约回底层协议的可靠性；leanVM 是否这样做，本次未核实 | 由 R55、E6、eip-8288@5a4387b.md:L523 推出 | inferred | F13、P、Q |
| R57 | Aerie 的知识可靠性定理只在经典 ROM 中陈述；正文（§1–§7）没有 QROM 分析 | 全文核对（Internet Archive 快照，见 references.md）：2026-2501 Def 5.6、Thm 5.9（p.18–19）。附录未读完 | observed | F14 |
| R58 | Aerie 的提取器要运行证明者 (Q+2)·K̂ 次（K̂ 最高约 2^39.7）；Akita 的格参数估计没有计入这一因子 | 全文核对（Internet Archive 快照，见 references.md）：2026-2501 Thm 5.9 与其后段落（p.19–20） | observed | F14 |
| R59 | Aerie 不递归的理由有两条：单机即可完成一个 slot 的聚合；以及“避免递归也避免了安全分析中的缺口，因为 ROM 无法描述验证者自身的哈希计算” | 全文核对（Internet Archive 快照，见 references.md）：2026-2501 §1.1（p.2–3）、§1.2（p.4） | observed |  |
| R60 | Aerie 承认两个聚合不能合并；要在网络中分布式收集，需要合并方法或递归验证器，而后者“reintroduces the heuristic step”；leanVM 可以把工作分给多个证明者，Aerie 不能 | 全文核对（Internet Archive 快照，见 references.md）：2026-2501 §6.3（p.24）、§7（p.25） | observed | F14 |
| R61 | BCCT 的绕开办法：在常数深度的宽证明树上聚合；PCD 深度约简定理（基于 CRH）把常数深度 PCD 变为多项式深度的路径 PCD | 全文核对（Internet Archive 快照，见 references.md）：2012-095 §1.4（p.10）、Thm 2（§2.3，p.15） | observed |  |
| R62 | 8288 的 mempool 聚合树没有由谓词强制的常数深度结构，深度随轮数增长，所以不能直接援引 BCCT 的深度约简 | 由 R6、R61 推出 | inferred |  |
| R63 | 2025/1663 写道：有 straight-line 提取器时，组合可在多项式深度下安全；现实中的 IVC 假设计算链可几乎无限延长，但多数证明只覆盖常数步 | 全文核对（Internet Archive 快照，见 references.md）：2025-1663 p.2 Challenge 2；p.5 “Straight-line extraction” | observed |  |
| R64 | XFS（AY25）的现状：KRS 称其模型无法刻画 KRS 攻击；Fenzi 称 XFS 能挡住其论文中的攻击，但没有可证明的保证能挡住变体 | 全文核对（Internet Archive 快照，见 references.md）：2025-118 §5（p.16）；2026-1838 p.6 第 3 条 | observed |  |
| R65 | Arc（ePrint 2024/1731）与 WARP（ePrint 2025/753）在 ROM 中证明了哈希型（Merkle）累积方案的安全，WARP 支持无界累积深度；WARP 写明由累积方案得到的 PCD 要“prove correctness of a circuit that includes the accumulation verifier” | WARP 全文（Internet Archive 快照 20260608192816）：Thm 1（p.2）、摘要、p.63；Arc 摘要（ePrint 2024/1731 页）与引言“By heuristically instantiating the random oracle … conjectured security”（检索摘录，全文未取得） | observed | F12 |
| R66 | 普通 ROM 中已有可证明安全的哈希型累积方案，也有 2023/1646 的非简洁递归 PCD 构造；但将这些结果用于实用、简洁的哈希型递归 PCD，仍需对电路内的预言机计算作启发式实例化。因此，“尚无已知普通 ROM 安全证明”应限定于这类实用、简洁的递归系统，而不能泛指递归或 PCD | 由 R65、R25、R26 推出：PCD 电路包含累积验证者，后者查询随机预言机；2024/728 排除了相对化路线，非相对化仍开放 | inferred | O、F12、R |
| R67 | 草案的聚合伪代码仍保留 leanSTARK 验证分支（VK 由见证提供），并允许 `discards` 在最终摘要前删掉依赖；交易层规则又只接受 leanSPHINCS。两处没有完全对齐，所以“递归树内部只验证协议固定的计算”不能仅凭外层固定的 `AGGREGATED_VK` 成立，需要最终电路确认。这是规范清晰度问题，不是已知的绕过或漏洞 | 由 eip-8288@5a4387b.md:L74、L161、L179–180、L195–202 推出（sol/astra-6 第三轮审查指出） | inferred | 导语、E、F13、P |

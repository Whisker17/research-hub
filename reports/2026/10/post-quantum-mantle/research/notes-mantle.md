# notes-mantle：Mantle 当前架构与密码学依赖（lane = mantle，前缀 M）

> 访问日期：所有网页均为 2026-10-16（UTC+8）。L2BEAT 数据为当日快照；合约地址、owner、阈值需主会话用 `cast` 在链上复核。
> 注：本文件按运行指令写入 task-5.md（权威路径）；任务文件原定路径为 `reports/2026/10/post-quantum-mantle/research/notes-mantle.md`，需要时由主会话拷贝过去。

**一句话总结**：截至 2026-10，Mantle 是 L2BEAT 认定的 Stage 0 ZK Rollup。状态由 OP Succinct（SP1 Hypercube）有效性证明，最终在 L1 上验证的是 **BN254 上的 gnark PLONK 包装证明**；数据发到 **Ethereum blobs**（EigenDA 代码路径已在 Arsia 中移除）；桥是 OP Stack 的 OptimismPortal / L1StandardBridge。所有合约都可以由 **6/14 的 Safe 多签无延迟升级**。一个 3/7 多签可以把系统切到无证明的 optimistic 模式。证明路由由 Succinct 共享的 2/3 多签管理。对量子攻击最敏感的几处是：最外层 PLONK/KZG（BN254）、所有 secp256k1 ECDSA 密钥（多签签名人、batcher/proposer EOA、用户），以及继承自 Ethereum 的 BLS 共识与 blob KZG。Mantle 不是 Superchain 成员，没有找到它自己公开的任何 PQ 表态。

- **M-Q1 架构**：OP Succinct 有效性证明（2025-09-16 起），PLONK/BN254 最终验证；Ethereum blobs DA（2026-01 起为主，2026-04 Arsia 移除 EigenDA 路径）；OP Stack 桥；6/14 多签无延迟升级；3/7 多签可切 optimistic 模式并暂停提款；batcher / proposer 是单个 EOA。
- **M-Q2 密码学映射**：签名层全是 secp256k1 ECDSA（另有 P-256 预编译）。证明内层是 Poseidon2/FRI 哈希型 STARK，但内存论证依赖扩域椭圆曲线 DLP，最外层是 BN254 PLONK（KZG + Aztec Ignition SRS）。DA 依赖 Ethereum blob KZG（BLS12-381）。提款证明是 keccak 哈希链。
- **M-Q3 上游**：Mantle 不在 Superchain Registry 中，Optimism 的 2036 路线不会自动适用。Succinct 没有公开的“替换 BN254 包装”时间表，只有 VEIL、Flock 等哈希型证明研究。EigenDA（BN254 BLS + KZG）已不在 DA 关键路径上。
- **M-Q4 Mantle 自身 PQ 表态**：在官方文档、博客、GitHub 中都没有找到。第三方 qrindex 把 Mantle 评为“Stage 0（Unaware）”。

---

## M-Q1 Mantle 当前（2026-10）架构

### 1.1 状态证明

**答案**：Mantle 从 2025-09-16 起用 OP Succinct 生成 ZK 有效性证明（SP1）。L1 上的入口是 `OPSuccinctL2OutputOracle`（proxy `0x31d543e7BE1dA6eFDc2206Ef7822879045B9f481`），它调用 `SP1VerifierGateway`（`0x3B6041173B80E77f038f3F2C0f9744f04837185e`），网关再路由到 SP1 Hypercube v6.1.0 的 **PLONK** 验证合约 `SP1Verifier`（`0xc3c6dDDAc8829b233Dc6536Ec024775a57b0AF2A`，gnark PLONK、BN254 曲线、Aztec Ignition SRS）。合约保留了 optimistic 模式：Mantle fork 的代码中只有 **challenger**（L2BEAT 标为 MantleEngineeringMultisig 3/7）能开启或关闭，开启时要求 finalization ≥ 7 天。

**依据**：
- L2BEAT：类型 “ZK Rollup”，State validation 为 “Validity proofs (ST, SN)”，12h execution delay，里程碑 “2025-09-16 Upgrade to OP Succinct”[1]。
- Mantle 官方公告：2025-09-16 约 15:00 UTC 开始用 ZK 提交状态根，2025-09-23 起提款期从 7 天改为 12 小时。官方明确说 12 小时是“安全缓冲”，用于应急响应[3]。
- L2BEAT Prover 一节：Prover 为 SP1 Hypercube；Trusted setup 只列 “Gnark (Plonk) – Aztec Ignition”；Onchain verifier 为 `SP1Verifier 0xc3c6…0AF2A`[1]。L2BEAT ZK Catalog 中，该地址属于 “SP1 Hypercube Plonk v6.1.0”，Used in 包括 Mantle。Mantle 不在 Groth16 v6.1.0 的使用方之列[2]。
- 2026-05-05，L2BEAT 记录 Mantle 改用网关式验证：新增 SP1VerifierGateway `0x3B60…`，在网关登记了 SP1Verifier v6.0.0（`0x8a0fd5e825D14368d90Fe68F31fceAe3E17AFc5C`）和 `0xc3c6…`。旧的 sp1turbo verifier（`0x0459d576…`，selector `0xd4e8ecd2`，L2BEAT 只给出前缀）仍登记在网关的 `activeVerifiers` 中[1]。
- Mantle fork 代码（mantle-xyz/op-succinct，tag `mantle-v1.6.1`；L2BEAT 给出的 commit 为 `8d280ded13f3fcba3d85fb6babedaf75cab5e9c0`）：ZK 模式下 `proposeL2Output(bytes32,uint256,uint256,bytes)` 调用 `ISP1Verifier(verifier).verifyProof(aggregationVkey, abi.encode(publicValues), _proof)`。publicValues 包括 l1Head、l2PreRoot、claimRoot、claimBlockNum、rollupConfigHash 和 rangeVkeyCommitment。`enableOptimisticMode` / `disableOptimisticMode` / `updateFinalizationPeriodSeconds` 都要求 `msg.sender == challenger`。optimistic 模式要求 ≥ 7 天，ZK 模式要求 ≥ 1 小时。optimistic 模式的 `proposeL2Output(bytes32,uint256,bytes32,uint256)` 不验证任何证明。`updateVerifier`、`updateAggregationVkey`、`updateRangeVkeyCommitment`、`updateRollupConfigHash`、`addProposer` 都是 `onlyOwner`[14]。
- L2BEAT 追踪到的两个 `proposeL2Output` selector（`0x9aaab648` 为旧版 / optimistic，`0x9ad84880` 为带 `_proof` 的 ZK 版，2025-09-16 起使用）与上面的代码一致[1]。
- 上游 succinctlabs/op-succinct 的 main 分支由 `onlyOwner` 切换模式，并带 fallbackTimeout 与 proverAddress。Mantle 的 fork 改成了 challenger 切换，没有 fallbackTimeout[15]。
- OP Succinct 架构是：range 程序分段证明 → aggregation 程序聚合 → proposer 把聚合证明提交到 L1 合约验证[16]。L2BEAT 记录的 Mantle 当前 program hash 为 aggregation `0x00fa3641…6bbf` 和 range `0x1e2b8634…8fdb`，可从 `mantle-v1.6.1` 复现，SP1 toolchain 为 v6.4.0[1]。
- SP1 官方安全模型：“SP1 utilizes Gnark's implementation of Groth16 or PLONK over the BN254 curve to compress a STARK proof into a SNARK proof”，并依赖 Groth16/PLONK 的全部密码学假设。PLONK 用 Aztec Ignition 的 setup[17]。

**不确定之处**：
- L2BEAT Permissions 一节写 MantleSecurityMultisig “can toggle between the optimistic mode and not optimistic (ZK) mode”，但 fork 代码只允许 challenger 切换。合理解释是：owner 可以通过无延迟升级或替换 challenger 间接切换，或者 L2BEAT 的描述不精确。需要用 `cast call 0x31d5… "challenger()(address)"` 和 `owner()` 复核。另外，GitHub 上 `mantle-v1.6.1` 的合约源码不一定与链上 implementation `0x4059509fFb703B048D1e9Ce3118F90E759076f50` 的字节码一致，需要对 Etherscan verified source。
- 网关仍登记旧的 sp1turbo verifier。如果 proposer 在证明前缀里填旧 selector，会路由到旧 verifier（L2BEAT 风险项 “proposer routes proof verification through a malicious or faulty verifier by specifying an unsafe route id”[1]）。旧 Turbo 路由的包装是 PLONK 还是 Groth16，没有核实。
- 当前 optimistic 模式是否关闭（`optimisticMode()`）、`finalizationPeriodSeconds` 是否等于 43200，需要链上读取。L2BEAT 的 2025-09-24 更新称 execution delay 已从 7 天改为 12 小时[1]。

### 1.2 数据可用性（DA）

**答案**：当前 DA 是 Ethereum blobs，而且只有这一种。历史上依次为：MantleDA（2023–2025-03）→ EigenDA（2025-03-19 起）→ 以 Ethereum blobs 为主（2026-01-21/22，EigenDA 仍可在链下使用）→ Arsia 后证明程序里删除 EigenDA 路径（L1 SystemConfig 在 2026-04-16 升级，L2 在 2026-04-22 激活）。

**依据**：
- L2BEAT：DA 为 “Onchain”，Badge 为 “Ethereum with blobs”。Blob 提交从 block 19434945 起持续进行，inbox `0xFFEEDDCcBbAA0000000000000000000000000000`，sequencer/batcher EOA `0x2f40D796917ffB642bD2e2bdD2C762A5e40fd749`[1]。
- L2BEAT 里程碑：“2025-03-19 Move to EigenDA … deactivates MantleDA”；“2026-04-16 Arsia upgrade: full Ethereum DA. EigenDA code path removed; DA is Ethereum only. Mantle reclassified as a rollup.”[1]
- L2BEAT 2026-01-21 更新：SystemConfig 显示 `isUsingEigenDA: false`、`isSequencerSendingBlobTx: true`，“but the system can still post to EigenDA offchain via Hydro”[1]。
- L2BEAT 2026-04-16 更新：Mantle 团队确认 Arsia build 删除了 `programs/range/eigenda/`，只保留 `programs/range/ethereum/`[1]。
- Mantle 官方 PR（2026-01-22）宣布用 Ethereum blobs 作为 “primary DA layer”，从 Validium 转为 ZK rollup，同时会继续把 EigenCloud 用于 “specialized use cases”[24]。官方文档的迁移公告给出同样的理由：安全、成本、与 OP Stack 对齐[4]。
- mantle-v2 v1.1.1 release：“activating EigenDA on the Mantle mainnet, replacing the MantleDA”[13]。
- Arsia v1.5.4 changelog：主网激活时间戳 `1776841200`，即 2026-04-22 07:00:00 UTC[6]。Arsia 公告：batcher 从 Mantle 自定义 blob 编码改为标准 OP Stack blob 格式[5]。
- Limb（v1.4.2，2026-01-14 07:00 UTC 主网）：op-node 改用 `eth/v1/beacon/blobs` 查询 blob，“update the blob verification logic to use KZG commitments to verify blob transaction data”；batcher 支持 Fusaka 的 cell proofs blob[9]。

**不确定之处**：
- L2BEAT 的 Arsia 里程碑日期 2026-04-16 是 L1 SystemConfig 升级交易的日期，Mantle 文档写的 L2 激活时间是 04-22，两者不矛盾，但报告里要注明口径。
- 官方文档 Overviews 页仍写着 “Independent DA modules, such as EigenDA … cost savings of more than 90%”[12]，这部分已过时。
- L2BEAT DA 一节的通用文字是 “published … in the form of cheap blobs or calldata”[1]，但它追踪到的只有 blob 交易。calldata 回退能否实际使用、是否演练过，都没有核实。

### 1.3 桥与提款

**答案**：桥沿用 OP Stack Bedrock 的合约：OptimismPortal（ETH/MNT 托管，提款的 prove/finalize）、L1StandardBridge（ERC-20 托管）、L1CrossDomainMessenger，状态根由 OPSuccinctL2OutputOracle 提供。提款证明 = keccak256(outputRootProof) 等于 oracle 里的 output root，再加上 L2ToL1MessagePasser 的存储包含证明。它只依赖哈希和 ZK 证明，不依赖签名。用户发起提款的那笔 L2 交易仍需 ECDSA 签名。

**依据**：
- L2BEAT 合约清单（L1 主网）[1]：
  - OptimismPortal proxy `0xc54cb22944F2bE476E02dECfCD7e3E7d3e15A8Fb`，impl `0xe1399f54ba2597b4EaDA9E3450c34D393fb131A7`，guardian = MantleEngineeringMultisig。
  - L1StandardBridge proxy `0x95fC37A27a2f68e3A647CDc081F0A89bb47c3012`，impl `0xb4133552BA49dFb60DA6eb5cA0102d0f94ce071f`。
  - L1CrossDomainMessenger proxy `0x676A795fe6E43C17c668de16730c3F690FEB7120`，impl `0xb8DE82551fA4BA3bE4B3d9097763EDBeED541308`。
  - SystemConfig proxy `0x427Ea0710FA5252057F0D88274f7aeb308386cAf`，impl `0x9CA047689261E35c9e507b1BB0B7443C2A436310`（v1.4.0，Arsia）。
  - ProxyAdmin `0xca35F8338054739D138884685e08b39EE2217794`。
  - L1MantleToken `0x3c3a81e81dc49A522A592e7622A7E711c06bf354`，admin MantleTokenProxyAdmin `0x0cac2B1a172ac24012621101634DD5ABD6399ADd`。
  - TimelockController `0x65331ff6F8B0fc2612F2a0deBD9d04Fce60a447F`（1 天）。
- OP 规范：`proveWithdrawalTransaction` 检查 “The keccak256 hash of the outputRootProof values is equal to the outputRoot”，以及 withdrawalProof 是 L2ToL1MessagePasser 存储中的包含证明[23]。
- L2BEAT 列出强制交易（Self sequence，12h delay）和强制提款路径，但 “Proposer failure: Cannot withdraw”，因为只有白名单 proposer 能发布状态根[1]。

**不确定之处**：Mantle 在 OptimismPortal 中对 MNT / BVM_ETH 做了定制。Elysium 公告提到 BVM_ETH、deposit 计费修正[11]，本次没有核实这些定制有没有引入额外的签名依赖。从公开资料看没有发现。

### 1.4 权限

**答案**（全部来自 L2BEAT 2026-10-16 快照[1]，需链上复核）：

| 角色 | 地址 | 形态 / 阈值 | 权限要点 |
|---|---|---|---|
| MantleSecurityMultisig | `0x4e59e778a0fb77fBb305637435C62FaeD9aED40f` | Safe **6/14** | ProxyAdmin owner：**无延迟**升级 OPSuccinctL2OutputOracle、SystemConfig、L1CrossDomainMessenger、L1StandardBridge、OptimismPortal。Oracle owner：改 vkey、verifier 地址、rollupConfigHash、proposer 集合。SystemConfig owner：改 batcher、unsafe block signer、gas / fee 参数。MNT：经 1 天 Timelock 升级，可增发（每年最多 2%）。 |
| MantleEngineeringMultisig | `0x2F44BD2a54aC3fB20cd7783cF94334069641daC9` | Safe **3/7** | Oracle challenger：删除未最终化的状态根，开关 optimistic 模式，改 finalization 期。OptimismPortal guardian：暂停提款。 |
| SP1VerifierGatewayMultisig | `0xCafEf00d348Adbd57c37d1B77e0619C6244C6878` | Safe **2/3** | SP1VerifierGateway owner：添加或冻结 verifier 路由、转移所有权。同一多签也用于 Celo、Fluent、Lens、RISE、Sophon、Taiko、X Layer（Succinct 共享）。 |
| EOA 1（batcher / sequencer） | `0x2f40D796917ffB642bD2e2bdD2C762A5e40fd749` | 单 EOA | 向 L1 提交批次（blob）。 |
| EOA 2（proposer） | `0x6667961f5e9C98A76a48767522150889703Ed77D` | 单 EOA | 发布状态根（initialProposer）。 |
| TimelockController | `0x65331ff6F8B0fc2612F2a0deBD9d04Fce60a447F` | 1 天 | 只管 MNT 代币的 ProxyAdmin。proposer / executor / canceller 全是 SecurityMultisig。 |

- L2BEAT 风险：“Funds can be stolen if a contract receives a malicious code upgrade. There is no delay on code upgrades (CRITICAL)”；Exit window 为 None；Stage 0。Stage 1 未满足项包括：没有符合要求的 Security Council、提款可被审查、升级没有 7 天退出期[1]。
- SecurityMultisig 2026-01-21 加了 1 名成员，阈值变为 6/14。EngineeringMultisig 2026-05-15 轮换了 2 名成员[1]。

**不确定之处**：L2BEAT 没有单列 unsafe block signer（P2P 区块签名）地址，只说 SystemConfig owner 能改它。sequencer 在 L2 P2P 上用什么密钥签名，需要读 `SystemConfig.unsafeBlockSigner()`。v1.5.4 changelog 提到 op-service 的 “HSM signer” 修复[6]，说明运营密钥可能托管在 HSM/KMS 中，但具体部署没有公开（speculative）。Safe 签名人都是 EOA 还是嵌套合约，没有核实。

### 1.5 执行层

**答案**：
- 生产客户端：op-geth 的 Mantle fork（Arsia 版本为 op-geth v1.5.4）+ op-node（rebase 到 Optimism op-node v1.16.3）。
- 测试网 Elysium（v1.6.3）的 EL 基于 go-ethereum v1.17.3。Rust 侧（kona / mantle-xyz/reth）目前只在源码层面推进。
- 已支持 EIP-7702：Skadi（v1.3.1，Prague 对齐，2025-08 主网）。
- 已有 secp256r1（P-256）预编译：先经 RIP-7212 启用，Limb（2026-01-14）改为 EIP-7951，gas 从 3450 调到 6900。
- 执行规则目前是 “Arsia/Osaka”。Amsterdam EVM 在 Elysium 中不激活。
- Gas token 是 MNT，ETH 在 L2 上以 BVM_ETH 形式存在。

**依据**：
- Skadi v1.3.1 changelog：“support all features of the Ethereum Prague upgrade”，包含 “EIP-7702: Supports SetCode TX”、EIP-2935、EIP-1153、EIP-5656、EIP-6780[8]。GitHub release “1.3.1 Mainnet Skadi” 创建于 2025-08-15[13]；Messari 把主网事件记为 2025-08-27[29]（二手）。
- Limb v1.4.2：“The Limb fork is scheduled to occur at 2026-01-14 07:00:00 UTC”。“EIP-7951 … supports the secp256r1 elliptic curve. Mantle's previous versions had already enabled the secp256r1 precompile through RIP-7212 … gas cost has been adjusted from 3450 to 6900”[9]。
- Arsia：一次性激活等同 OP 的 Canyon → Jovian 共 8 个升级，rebase 到 op-node v1.16.3[5][7]。v1.5.4 把 op-geth 升到 v1.5.4，gnark-crypto 升到 v0.18.1[6]。
- Elysium（测试网）：“The execution client is based on upstream go-ethereum v1.17.3 … this rollout does not activate Amsterdam EVM behavior on Mantle L2”[11]。
- mantle-xyz/mantle-v2 `rust/MANTLE_CHANGES.md`：kona 迁移已完成，“EL node now lives in mantle-xyz/reth”，op-succinct 升级处于 ⏸️ 状态[30]。
- L2BEAT：Gas token MNT；L1MantleToken 由 SecurityMultisig 拥有[1]。

**不确定之处**：reth / kona 有没有用于生产节点或证明程序，没有找到公告，判断为“源码 / 进行中”。P-256 预编译地址（预期为 `0x100`）没有在文档里看到明文，需要用 RPC 实测。

### 1.6 其他组件

- L2BEAT 的 TVS（2026-10-16）为 $1.28B，其中 canonically bridged $624.85M、externally bridged $627.45M、natively minted $36.64M。“48.6% with additional trust assumptions”[1]。也就是说，约一半价值依赖第三方桥或发行方（如 mETH/cmETH、FBTC、稳定币发行方）的权限与签名。L2BEAT 没有把这些列为协议关键依赖，本路不深挖（inferred）。
- 2026-04 KelpDAO rsETH 事件后 Mantle 发表了安全声明（PR Newswire 2026-04-21，只看到标题和摘要），说明外部桥资产风险已经实际发生过；本路没有展开。

---

## M-Q2 组件 → 密码学映射

**答案**：Mantle 的关键安全路径上有三类会被 Shor 直接攻破的原语：secp256k1 ECDSA（无处不在）、BN254 配对（PLONK 包装 + KZG/SRS）、继承自 L1 的 BLS12-381（共识 BLS + blob KZG）。只受 Grover 影响、余量下降的是 keccak（MPT、output root、提款证明）和 Poseidon2/FRI（SP1 内层）。需要特别注意，SP1 Hypercube 的内存论证假设“KoalaBear 7 次扩域上的椭圆曲线 DLP 困难”，所以它的“内层 STARK”并不是纯哈希型[17]。量子影响的权威论证见 threat 路，这里的影响列都标为 inferred。

| 组件 | 谁持有 / 在哪 | 密码学 | 量子影响（见 threat 路） |
|---|---|---|---|
| 用户 EOA 交易 | 用户 | secp256k1 ECDSA | Shor：公钥暴露后可伪造签名 |
| EIP-7702 授权 | 用户 | secp256k1 ECDSA（ecrecover） | Shor：委托 PQ 代码后，旧私钥仍能发交易或重新委托（见 starknet-account-model 台账 A53–A56） |
| P-256 预编译（EIP-7951 / RIP-7212） | Passkey 钱包 | secp256r1 ECDSA | Shor：同上，不是 PQ |
| Safe 多签（6/14、3/7、2/3） | 签名人 EOA | secp256k1 ECDSA | Shor：攻破阈值数量的签名人密钥 = 无延迟升级全部合约、替换 verifier、切 optimistic、暂停提款 |
| batcher EOA / proposer EOA | 运营方 | secp256k1 ECDSA | Shor：可以冒充提交批次或状态根（状态根在 ZK 模式下仍需证明；batcher 可以发垃圾或审查） |
| unsafe block signer（L2 P2P） | sequencer | secp256k1 ECDSA（OP Stack 惯例） | Shor：可以伪造预确认区块（只影响 unsafe 头部） |
| 有效性证明内层 | SP1 Hypercube | Poseidon2（KoalaBear）+ FRI / Jagged PCS（哈希型）；内存论证依赖扩域椭圆曲线 DLP | 哈希部分：Grover 级余量下降。ECDLP 假设：在 Shor 下不成立，对 soundness 的实际影响未评估 |
| 有效性证明外层（L1 验证） | SP1Verifier PLONK v6.1.0 | gnark PLONK，BN254，KZG + Aztec Ignition SRS | Shor：可能伪造证明 → L1 接受错误状态根 |
| SP1VerifierGateway 路由 | Succinct 2/3 多签 | 合约逻辑 + ECDSA 多签 | 同多签 |
| 提款证明 | OptimismPortal | keccak256 + MPT 存储证明 | Grover 级；安全性最终取决于 output root（即 ZK 证明） |
| DA | Ethereum blobs | KZG（BLS12-381，EIP-4844）+ cell proofs | 继承 L1：Shor 可破坏 KZG 绑定性 |
| 结算 / 排序最终性 | Ethereum 共识 | BLS12-381 签名 | 继承 L1 |
| （历史）EigenDA | 已移出关键路径 | BLS on BN254 + KZG | 已不影响当前 DA；“EigenCloud 特定用途”是否还在用不清楚 |

**依据**：签名部分见 [1][8][9]；证明部分见 [1][2][17]；提款见 [23]；DA 见 [1][9]；Ethereum BLS/KZG 的量子脆弱性见 ethereum.org[27]；EigenDA 的 BN254 BLS 见 [25][26]。

**不确定之处**：
- “Shor 能从 Aztec Ignition SRS 恢复 trapdoor 并伪造 PLONK 证明”是 threat 路要论证的结论，这里只做映射。
- SP1 扩域 ECDLP 假设被量子攻破后，能不能实际伪造 STARK 证明，没有找到公开分析，标 speculative。

---

## M-Q3 上游依赖与路线

### 3.1 OP Stack / Superchain

**答案**：Mantle 不是 Superchain 成员（不在 superchain-registry 的 chainList 中）。它是 OP Stack 的深度 fork：自己的命名升级（Skadi / Limb / Arsia / Elysium），Arsia 一次性追平 Canyon → Jovian。Optimism 2026-01-14 的 PQ 路线（2036 年 1 月弃用 ECDSA EOA，sequencer / batcher 迁移到 PQ 签名，“participating OP Stack chains” 协同硬分叉）不会自动约束 Mantle。Mantle 能复用的是 OP Stack 代码层的改动，前提是继续 rebase。

**依据**：
- superchain-registry `chainList.json`（main，2026-10-16）没有 chainId 5000 / Mantle[22]。
- Optimism 博客 2026-01-14（Karl Floersch）：“10‑year timeline to deprecate ECDSA‑based EOAs on OP Mainnet and across the Superchain, subject to governance approval”；“By January 2036 … ECDSA-signed EOA transactions will be deprecated”；“The L2 sequencer and batch submitter will transition off ECDSA signatures to post‑quantum signatures”；“The specific post‑quantum signature scheme is not yet decided”；“Schedule and coordinate a hardfork across OP Mainnet and participating OP Stack chains”[21]。
- Mantle 用的是自己的升级命名，并“aligns Mantle with the latest OP Stack protocol versions (Canyon through Jovian)”[5]。
- 2026-02-12 Succinct 博客标题为 “Optimism Chooses Succinct to Bring ZK to the Superchain”（只看到标题）[18]。这意味着 OP 和 Mantle 的证明栈可能收敛到 SP1（inferred）。

**不确定之处**：Mantle 会不会跟进 OP 的 PQ 硬分叉，没有公开信息（speculative）。

### 3.2 Succinct / SP1

**答案**：SP1 当前的生产路径固定使用 BN254 上的 Groth16/PLONK 包装，没有找到 Succinct 公开的“去掉 BN254 包装”或 PQ 验证的时间表。相关的公开工作有：
- VEIL（2026-05-01，给哈希型证明系统加零知识）
- Flock（2026-06-25，哈希证明 SNARK）
- cuPQC 集成（2026-09-03）：GPU 原语加速，**不是**把 SP1 改成 PQ
- 发文讨论 Google 量子论文，并给 Google 的电路 ZK 证明提供 SP1

**依据**：SP1 安全模型[17]；Succinct 博客文章列表[18]；cuPQC 文章写的是 “exposes cryptographic primitives such as hash functions, Merkle tree operations, and field arithmetic as GPU primitives”[20]；Succinct 对 Google 论文的解读（2026-04-13），其中把 “L2s and cross-chain bridges … proofs rely on the same quantum-vulnerable cryptographic primitives” 列为攻击面之一[19]。L2BEAT 引用 EF soundcalc：SP1 Hypercube “98 bits of proven security”[2]。

**不确定之处**：VEIL / Flock 是否会进入 SP1 的生产 L1 验证路径，没有时间表。第三方 qrindex 把 VEIL 解读为“可能的 PQ 路径信号”[28]，属于推测。

### 3.3 EigenDA

**答案**：EigenDA 已不在 Mantle DA 的关键路径上（Arsia 后证明程序只有 Ethereum 路径）。EigenDA 本身用 BN254 上的 BLS 聚合签名和 KZG 承诺，没有找到它的 PQ 路线。

**依据**：L2BEAT 2026-04-16 更新[1]；EigenLayer `BN254.sol` 中有 “Contains BN254 parameters … and BLS signature functionality”[25]；eigenda 仓库包含 `crypto/ecc/bn254`、`encoding/kzg` 目录[26]。

**不确定之处**：“KZG 在 BN254 上”是根据仓库目录推断的（inferred）。Mantle PR 说会继续把 EigenCloud 用于特定场景[24]，具体是什么没有公开。

---

## M-Q4 Mantle 自身的 PQ / 量子表态

**答案**：没有找到。docs.mantle.xyz（含全部 Updated Notices 和 changelog 索引）、mantle.xyz、Mantle 新闻稿和论坛搜索中，都没有 PQ / quantum 相关的路线、研究或表态。第三方评级站 qrindex.org 给 Mantle 的评价是 “Migration Stage 0 (Unaware)，QRI 27/100（2026-06-05）”，理由是 “has not published a project-specific post-quantum cryptography inventory, threat model, or migration roadmap”[28]（二手）。

**依据**：docs 的 llms.txt 索引中没有相关条目（只检索了 7702/7212/P256/Skadi 等关键词，量子相关条目同样不存在）[12]；网页搜索 “mantle.xyz post-quantum”、“forum.mantle.xyz quantum” 均无结果；qrindex[28]。

**不确定之处**：Mantle 的 X 帖子和内部文档没有全面检索。“未找到”不等于“不存在”。

---

## 图与白话素材

### A. Mantle 组件清单（画“密码学组件地图”用）
1. 用户层：EOA（secp256k1）、7702 委托账户、Passkey（P-256 预编译）[8][9]
2. L2 运营：sequencer（op-geth fork）+ unsafe block signer、batcher EOA `0x2f40…d749`、proposer EOA `0x6667…d77D`[1]
3. 证明：SP1 Hypercube range / aggregation 程序 → PLONK(BN254) 包装 → SP1VerifierGateway → SP1Verifier[1][2][16]
4. L1 合约：OPSuccinctL2OutputOracle、OptimismPortal、L1StandardBridge、L1CrossDomainMessenger、SystemConfig、L1MantleToken[1]
5. 权限：SecurityMultisig 6/14 → ProxyAdmin（无延迟）；EngineeringMultisig 3/7（challenger / guardian）；Succinct GatewayMultisig 2/3[1]
6. DA：Ethereum blobs（KZG）[1][4]
7. 继承：Ethereum 共识（BLS）、blob KZG[27]

### B. 时间线条目
- 2023-07 主网 Alpha（MantleDA）[1]
- 2024-03-15 Tectonic（OP Bedrock）[1]
- 2025-03-19 EigenDA 替代 MantleDA（v1.1.1，Everest）[1][13]
- 2025-08 Skadi（Prague：EIP-7702 等）[8][13][29]
- 2025-09-16 OP Succinct ZK 证明上线；2025-09-23 提款期从 7 天改为 12 小时[3]
- 2026-01-14 Limb（Osaka：EIP-7951 P-256、CLZ；Fusaka blob 兼容）[9]
- 2026-01-21/22 blobs 成为主 DA（EigenDA 仍可在链下使用）[1][24]
- 2026-04-16 / 04-22 Arsia（L1 SystemConfig 升级 / L2 激活；移除 EigenDA 证明路径；新费用模型）[1][6]
- 2026-05-05 改用 SP1VerifierGateway + SP1 Hypercube（v6）[1]
- 2026-09-17 vkey 更新到 mantle-v1.6.1[1]
- 2026-10 Elysium 测试网（Glamsterdam 兼容，不激活 Amsterdam EVM）[11]
- 上游：2026-01-14 Optimism PQ 路线（2036 年弃用 ECDSA EOA）[21]

### C. 对比维度（组件 × 算法 × 量子影响 × 责任方）
责任方建议的分类（inferred）：
- **自主**：多签 / 权限结构、batcher / proposer / unsafe signer 密钥、7702 / P-256 账户策略、optimistic 回退规则
- **协同**：SP1 包装层与 Gateway（Succinct）、OP Stack 代码（Optimism）
- **继承**：blob KZG、共识 BLS（Ethereum）

### D. 流程（提款）
用户在 L2 发起提款（ECDSA）→ proposer 提交状态根 + PLONK 证明 → Oracle 调 Gateway → SP1Verifier 验证 → 12 小时后 → OptimismPortal 检查 keccak(outputRootProof) 和 MPT 包含证明 → finalize[3][14][23]

### E. 白话解释
- **有效性证明（validity proof）**：L2 交给 L1 一张“算对了”的数学收据，L1 不重算也能验收。[16]
- **STARK → SNARK 包装**：先用快但体积大的哈希型证明（STARK），再压成一个小的椭圆曲线证明（PLONK），让以太坊验证便宜。代价是最后这层压缩依赖椭圆曲线。[17]
- **PLONK / BN254 / KZG**：一种证明格式 / 一条以太坊有预编译的椭圆曲线 / 一种多项式“封口”方法。三者都建立在“椭圆曲线难题”上。[2][17]
- **Trusted setup（Aztec Ignition）**：多人一起生成一组公共参数，只要有一个人删掉自己的秘密就安全。量子计算机可能能从公开参数里把秘密算回来（见 threat 路）。[2]
- **Optimistic 模式**：不交数学收据，先当作对的，留 7 天让人挑错。Mantle 保留了这个开关。[14]
- **Verifier Gateway**：证明的“分拣中心”，按证明前几个字节把证明送到对应版本的验证合约。谁能改分拣表，谁就能决定用哪个验证器。[1]
- **多签 6/14**：14 把钥匙中凑够 6 把就能执行。每把钥匙都是普通的 ECDSA 私钥。[1]
- **Blob / KZG**：以太坊专门给 L2 存数据的“临时货柜”，用 KZG 证明货柜内容没被调包。[9][27]
- **EIP-7702**：让普通钱包地址临时“装上”智能合约逻辑，但原私钥依然有效。[8]
- **Superchain**：Optimism 治理下的 OP Stack 链联盟。用 OP Stack 代码不等于加入联盟。[22]

---

## 外部调研 / 用户资料中被修正或无法核实的地方

1. **GPT §7.1 “Mantle 使用 OP Succinct / SP1 有效性证明并向 Ethereum 发布 blob”**：正确。需要补充时间点：ZK 从 2025-09-16 开始；blob 从 2026-01 起成为主 DA，2026-04 Arsia 后成为唯一路径[1][3][24]。
2. **GPT §7.1 “L2BEAT 列出 SP1 的 PLONK 验证路径及可切换的 optimistic 模式”**：正确[1][2]。需要补充：切换权在 challenger（EngineeringMultisig 3/7），开启时 finalization ≥ 7 天[14]。L2BEAT 对 SecurityMultisig 的描述与代码不完全一致，需要链上复核。
3. **GPT §7.1 / §8-D “内部存在 STARK，不能消除外层椭圆曲线证明的量子依赖”**：方向正确但不完整。SP1 Hypercube 的内层也有一个 ECDLP 假设（KoalaBear 7 次扩域上的椭圆曲线，用于内存论证）[17]，所以“内层 STARK 就是 PQ”的隐含前提也不成立。另外 SP1 官方文档写的是 Groth16 或 PLONK 二选一，Mantle 用的是 PLONK[2]。
4. **GPT §8-E “当前公开资料列出了 Mantle 的 blob / calldata 数据发布方式”**：不精确。“blobs or calldata”是 L2BEAT 的 OP Stack 通用模板文字。L2BEAT 实际追踪到的只有 blob 提交[1]，calldata 回退有没有演练过不清楚。
5. **GPT §7.1 “不宜继续沿用早期 EigenDA 架构”**：正确。Mantle 官方 Overviews 页至今仍写 “Modular Data Availability … such as EigenDA … savings of more than 90%”[12]，mantle.xyz/network 页面的路线图还停在 “EIP-3074”[32]，都已过时，引用 Mantle 官网介绍时要避开。
6. **GPT §6.4 “Optimism… 也不会因为 Mantle 使用 OP 系技术就自动适用于 Mantle”**：正确，并有一手佐证：Mantle 不在 superchain-registry 中[22]，Optimism 原文说的是 “participating OP Stack chains”[21]。
7. **GPT 引用的 L2BEAT URL**（l2beat.com/scaling/projects/mantle）现在重定向到 `/layer2s/projects/mantle`，内容可读[1]。
8. **用户草稿“Mantle 作为一条 EVM Equivalent 的 L2 … 唯一能做的就是等待 Ethereum”**：从架构看，至少有三类组件不归 Ethereum 管，由 Mantle 或其供应商决定：6/14 多签无延迟升级、Succinct 的 BN254 包装与 2/3 Gateway 多签、batcher / proposer EOA（inferred，依据 M-Q1/Q2）。
9. **GPT §8-D “Mantle 公开架构还包含 optimistic 模式切换能力”**：正确。补充：fork 代码中 optimistic 模式没有 fallbackTimeout，只有白名单 proposer 能提交[14]。量子场景下，3/7 签名人的 ECDSA 密钥一旦被攻破，就可能把系统切到无证明模式（inferred）。但开启时要求 ≥ 7 天 finalization，challenger 在这期间可以删除状态根，所以这不是一个“即时”攻击面。

---

## 来源

1. **PRIMARY**（链上 discovery 汇编，需 cast 复核）L2BEAT — Mantle 项目页，https://l2beat.com/layer2s/projects/mantle （访问 2026-10-16）。证明了：Stage 0 ZK Rollup、SP1 PLONK verifier、合约地址与权限、多签阈值、DA 历史、升级时间线、optimistic 模式风险。
2. **PRIMARY**（同上）L2BEAT ZK Catalog — SP1 Hypercube，https://l2beat.com/zk-catalog/sp1hypercube （2026-10-16）。证明了：`0xc3c6…0AF2A` 是 SP1 Hypercube Plonk v6.1.0（Mantle 在使用）、最终包装是 BN254、Aztec Ignition SRS、98 bits proven security。
3. **PRIMARY** Mantle Docs — “Mantle OP Succinct Mainnet Upgrade & Withdrawal Period Transition”，https://docs.mantle.xyz/network/introduction/updated-notices/mantle-op-succinct-mainnet-upgrade-and-withdrawal-period-transition （2026-10-16）。证明了：2025-09-16 ZK 上线、2025-09-23 提款期改为 12 小时及其理由。
4. **PRIMARY** Mantle Docs — “Migration of Data Availability to Ethereum Blobs”，https://docs.mantle.xyz/network/introduction/updated-notices/migration-of-data-availability-to-ethereum-blobs （2026-10-16）。证明了：从 EigenDA 迁到 blobs 的动机与“Validium → ZK Rollup”。
5. **PRIMARY** Mantle Docs — “Arsia Upgrade: Mantle's New Fee Model and OP Stack Alignment”，https://docs.mantle.xyz/network/introduction/updated-notices/arsia-upgrade-mantles-new-fee-model-and-op-stack-alignment （2026-10-16）。证明了：Arsia 对齐 Canyon → Jovian、blob 格式改为 OP 标准、op-node v1.16.3。
6. **PRIMARY** Mantle Docs — “Mantle v2 v1.5.4 - Arsia Upgrade”，https://docs.mantle.xyz/network/for-node-operators/network-updates/changelogs/mantle-v2-v1.5.4-arsia-upgrade （2026-10-16）。证明了：主网 2026-04-22 07:00 UTC 激活、op-geth v1.5.4、HSM signer 修复。
7. **PRIMARY** Mantle Docs — “What's New in Mantle v2 Arsia”，https://docs.mantle.xyz/network/introduction/whats-new-in-mantle-v2-arsia （2026-10-16）。证明了：Arsia 内容与 OperatorFeeVault 等。
8. **PRIMARY** Mantle Docs — “Mantle v2 v1.3.1 - Skadi Upgrade”，https://docs.mantle.xyz/network/for-node-operators/network-updates/changelogs/mantle-v2-v1.3.1-skadi-upgrade （2026-10-16）。证明了：支持 Prague 与 EIP-7702。
9. **PRIMARY** Mantle Docs — “Mantle v2 v1.4.2 - Limb Upgrade”，https://docs.mantle.xyz/network/for-node-operators/network-updates/changelogs/mantle-v2-v1.4.2-limb-upgrade （2026-10-16）。证明了：2026-01-14 主网 Limb、EIP-7951 / RIP-7212 P-256、blob KZG 校验逻辑。
10. **PRIMARY** Mantle Docs — “Limb Upgrade: Ensuring Mantle's Compatibility with Fusaka”，https://docs.mantle.xyz/network/introduction/updated-notices/limb-upgrade-ensuring-mantles-compatibility-with-fusaka （2026-10-16）。证明了：Osaka EVM 与 cell proofs blob。
11. **PRIMARY** Mantle Docs — “Elysium Upgrade …（Sepolia/Hoodi）”，https://docs.mantle.xyz/network/introduction/updated-notices/elysium-upgrade-preparing-mantle-sepolia-hoodi-testnet-for-ethereums-glamsterdam-upgrade （2026-10-16）。证明了：测试网基于 go-ethereum v1.17.3、不激活 Amsterdam EVM、BVM_ETH。
12. **PRIMARY** Mantle Docs — Overviews 与 llms.txt 索引，https://docs.mantle.xyz/network 、https://docs.mantle.xyz/network/llms.txt （2026-10-16）。证明了：官方介绍页仍写 EigenDA（已过时）；索引中没有 PQ 相关条目。
13. **PRIMARY** GitHub mantlenetworkio/mantle-v2 Releases，https://github.com/mantlenetworkio/mantle-v2/releases （2026-10-16）。证明了：v1.1.1 激活 EigenDA 替代 MantleDA；1.3.1 Mainnet Skadi 发布于 2025-08-15。
14. **PRIMARY** mantle-xyz/op-succinct `contracts/src/validity/OPSuccinctL2OutputOracle.sol` @ tag `mantle-v1.6.1`（L2BEAT 给出 commit `8d280ded13f3fcba3d85fb6babedaf75cab5e9c0`），https://raw.githubusercontent.com/mantle-xyz/op-succinct/mantle-v1.6.1/contracts/src/validity/OPSuccinctL2OutputOracle.sol （2026-10-16）。证明了：challenger 控制 optimistic 开关与 finalization 下限（7 天 / 1 小时）、owner 可改 verifier 与 vkey、proof 验证调用。
15. **PRIMARY** succinctlabs/op-succinct `OPSuccinctL2OutputOracle.sol` @ main，https://raw.githubusercontent.com/succinctlabs/op-succinct/main/contracts/src/validity/OPSuccinctL2OutputOracle.sol （2026-10-16，未固定 commit）。证明了：上游由 onlyOwner 切换、带 fallbackTimeout，与 Mantle fork 不同。
16. **PRIMARY** OP Succinct Book — Architecture，https://succinctlabs.github.io/op-succinct/architecture.html （2026-10-16）。证明了：range / aggregation 证明流程。
17. **PRIMARY** Succinct Docs — SP1 Hypercube Security Model，https://docs.succinct.xyz/docs/sp1/security/security-model （2026-10-16）。证明了：Poseidon2 / KoalaBear、扩域 ECDLP 假设、BN254 Groth16 / PLONK 包装、Aztec Ignition。
18. **PRIMARY** Succinct Blog 首页文章列表，https://blog.succinct.xyz/ （2026-10-16）。证明了：VEIL（2026-05-01）、Flock、cuPQC、Google 相关文章、“Optimism Chooses Succinct”（2026-02-12）的存在与日期。
19. **PRIMARY**（Succinct 立场）“What Google's Quantum Paper Means for Crypto”，https://blog.succinct.xyz/google-quantum-ai-paper-crypto/ （2026-04-13 发布，访问 2026-10-16）。证明了：Succinct 承认 L2 证明依赖量子脆弱原语。
20. **PRIMARY** “SP1 Integrates NVIDIA cuPQC …”，https://blog.succinct.xyz/sp1-nvidia-cupqc/ （2026-09-03 发布，访问 2026-10-16）。证明了：cuPQC 是 GPU 原语加速，不是 PQ 迁移。
21. **PRIMARY** Optimism Blog — “A Post‑Quantum Roadmap for the Superchain”（Karl Floersch，2026-01-14），https://optimism.io/blog/a-post-quantum-roadmap-for-the-superchain （2026-10-16）。证明了：2036 年弃用 ECDSA EOA、sequencer / batcher 迁移、方案未定、只协调 “participating OP Stack chains”。
22. **PRIMARY** ethereum-optimism/superchain-registry `chainList.json` @ main，https://raw.githubusercontent.com/ethereum-optimism/superchain-registry/main/chainList.json （2026-10-16，未固定 commit）。证明了：Mantle（chainId 5000）不在注册表中。
23. **PRIMARY** OP Stack Specs — Withdrawals，https://specs.optimism.io/protocol/withdrawals.html （2026-10-16）。证明了：提款证明是 keccak(outputRootProof) 加存储包含证明。
24. **PRIMARY**（Mantle 官方新闻稿）PR Newswire 2026-01-22 “Mantle Advances Toward Full Ethereum ZK Rollup Architecture with Strategic Transition to Ethereum Blobs”，https://www.prnewswire.com/apac/news-releases/mantle-advances-toward-full-ethereum-zk-rollup-architecture-with-strategic-transition-to-ethereum-blobs-302667827.html （2026-10-16，内容经搜索摘录读取）。证明了：blobs 成为主 DA 的官方时间点，以及“继续用 EigenCloud”的表态。
25. **PRIMARY** Layr-Labs/eigenlayer-contracts `src/contracts/libraries/BN254.sol` @ main，https://github.com/Layr-Labs/eigenlayer-contracts/blob/main/src/contracts/libraries/BN254.sol （2026-10-16）。证明了：EigenLayer 的 BLS 实现基于 BN254。
26. **PRIMARY** Layr-Labs/eigenda 仓库，https://github.com/Layr-Labs/eigenda （2026-10-16）。证明了：仓库包含 `crypto/ecc/bn254`、`encoding/kzg`（据此推断 KZG 在 BN254 上）。
27. **PRIMARY** ethereum.org — Post-quantum cryptography on Ethereum，https://dev.ethereum.org/roadmap/security/quantum-resistance （2026-10-16）。证明了：Ethereum 的 BLS 与 KZG 依赖椭圆曲线配对，在量子下脆弱（权威论证见 threat 路）。
28. 二手：qrindex.org — Mantle QRI Report，https://qrindex.org/projects/mantle （2026-10-16）。证明了：第三方认为 Mantle 没有公开 PQ 清单或路线（评分方法本身未核实）。
29. 二手：Messari — “v1.3.1 Mantle Network Mainnet Skadi Upgrade”，https://messari.io/intel/event/9dd2fb9c-e248-4654-a55b-0a4fa799ac9a （2026-10-16）。证明了：Skadi 主网事件日期记为 2025-08-27。
30. **PRIMARY** mantle-xyz/mantle-v2 `rust/MANTLE_CHANGES.md` @ main，https://github.com/mantle-xyz/mantle-v2/blob/main/rust/MANTLE_CHANGES.md （2026-10-16）。证明了：kona / reth 的 Rust 化仍在源码层推进，op-succinct 升级暂停。
31. 已有报告：starknet-account-model 台账 A53–A56（EIP-7702 授权依赖 ecrecover，委托后原私钥仍有效）。见 `/Users/whisker/Work/src/tools/personal/research-hub/reports/2026/10/starknet-account-model/research/ledger.md`。
32. **PRIMARY** mantle.xyz/network 页面，https://www.mantle.xyz/network （2026-10-16，搜索摘录）。证明了：官网路线图仍停在 “Network upgrades (EIP-3074)”，已过时。

---

## 开放问题

1. 链上复核（cast）：
   - `OPSuccinctL2OutputOracle(0x31d5…)` 的 `owner()`、`challenger()`、`verifier()`、`optimisticMode()`、`finalizationPeriodSeconds()`、`aggregationVkey()`
   - `SP1VerifierGateway(0x3B60…)` 中当前所有路由（尤其是旧 sp1turbo 路由的完整地址和包装类型）
   - Safe 的 `getThreshold()` 与 `getOwners()`
   - `SystemConfig.unsafeBlockSigner()`、`batcherHash()`
   - `OptimismPortal.guardian()`
2. 链上 implementation `0x4059…6f50` 的 verified source 是否与 `mantle-v1.6.1` tag 中的合约一致？
3. SP1 内存论证的扩域 ECDLP 假设在量子下失效，是否会让 STARK 层 soundness 实际可被利用？需要找 Succinct 或学术界的分析，或者直接问 Succinct。
4. Succinct 有没有不经 BN254 包装、直接在 L1 验证哈希型证明（或 PQ 包装）的路线和 gas 估算？
5. Mantle 会跟随 Optimism 的 PQ 硬分叉（sequencer / batcher PQ 签名、2036 年弃用 ECDSA EOA）吗？还是自定节奏？
6. batcher、proposer、unsafe signer 的密钥是否在 HSM/KMS 中，有没有轮换流程？（内部核对）
7. calldata 回退 DA 是否可用、是否演练过？
8. EigenCloud 的“特定用途”是否还涉及任何安全关键路径？
9. 第三方桥资产（约占 TVS 的 48.6%）背后的发行方 / 桥权限，是否需要单独做 PQ 清单？

---

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| M1 | 截至 2026-10-16，L2BEAT 把 Mantle 归为 Stage 0 的 ZK Rollup，gas token 为 MNT | [1] Summary：“Stage: Stage 0”“Type: ZK Rollup”“Gas token: MNT” | observed | |
| M2 | Mantle 于 2025-09-16 开始用 OP Succinct 的 ZK 证明提交状态根 | [3] Phase 1 “After Sep 16, 2025 ~15:00 UTC… ZK proofs”；[1] Milestones 2025-09-16 | observed | |
| M3 | 2025-09-23 起提款最终化期从 7 天改为 12 小时，官方称 12 小时是应急安全缓冲 | [3] “From a 7-Day to a 12-Hour Withdrawal” 与 “Why do we choose 12 hours?” | observed | |
| M4 | Mantle 当前在 L1 用 SP1Verifier `0xc3c6dDDAc8829b233Dc6536Ec024775a57b0AF2A` 验证证明 | [1] Prover 一节 Onchain verifiers；[1] Smart contracts “SP1Verifier (v6.1.0)” | observed | |
| M5 | 该 verifier 是 SP1 Hypercube v6.1.0 的 gnark PLONK 包装，曲线为 BN254 | [2] “Plonk: Gnark – SP1 Hypercube Plonk v6.1.0 … Known deployments 0xc3c6… used in Mantle”；Final wrap “BN254 (curve)” | observed | |
| M6 | Mantle 的 PLONK 包装用 Aztec Ignition（2019，176 人）作为 KZG trusted setup | [2] Trusted setups “Aztec Ignition … KZG commitment over BN254 … 176 participants”；[17] Trusted Setup 一节 | observed | |
| M7 | 2026-05-05 起，Oracle 通过 SP1VerifierGateway `0x3B6041173B80E77f038f3F2C0f9744f04837185e` 按路由验证证明 | [1] Ossification 2026-05-05 “moved from a single SP1Verifier to a gateway-based verification system” | observed | |
| M8 | 网关仍登记着旧的 sp1turbo verifier（`0x0459d576…`） | [1] 2026-05-05 更新 “legacy sp1turbo verifier … still registered in the gateway's activeVerifiers” | observed | |
| M9 | SP1VerifierGateway 的 owner 是 Succinct 共享的 2/3 Safe `0xCafEf00d348Adbd57c37d1B77e0619C6244C6878`，可以添加或冻结路由 | [1] Permissions “SP1VerifierGatewayMultisig … 2/3 … add and freeze verifier routes”；Used in Celo、Lens 等 | observed | |
| M10 | Mantle fork 的 Oracle 只允许 challenger 开关 optimistic 模式，开启时 finalization ≥ 7 天，关闭时 ≥ 1 小时 | [14] `enableOptimisticMode` / `disableOptimisticMode` 中的 `require(msg.sender == challenger)` 与 `>= 7 days` / `>= 1 hours` | observed | |
| M11 | optimistic 模式下的 proposeL2Output 不验证任何证明 | [14] `proposeL2Output(bytes32,uint256,bytes32,uint256) whenOptimistic`，函数体中没有 verifyProof | observed | |
| M12 | ZK 模式下的 proposeL2Output 调用 verifier.verifyProof(aggregationVkey, publicValues, proof)，publicValues 绑定 l1Head、前后状态根、rollupConfigHash 和 rangeVkeyCommitment | [14] proposeL2Output(bytes32,uint256,uint256,bytes) 函数体 | observed | |
| M13 | Oracle owner 可以单方面更换 verifier 地址、vkey、rollupConfigHash 和 proposer 白名单 | [14] `updateVerifier`、`updateAggregationVkey`、`updateRangeVkeyCommitment`、`updateRollupConfigHash`、`addProposer` 均为 onlyOwner；[1] Oracle owner = MantleSecurityMultisig | observed | |
| M14 | 上游 op-succinct main 由 onlyOwner 切换 optimistic 模式并带 fallbackTimeout，Mantle fork 与之不同 | [15] `enableOptimisticMode … onlyOwner`、`fallbackTimeout`；对比 [14] | observed | |
| M15 | L2BEAT 认为 SecurityMultisig 也能切换 optimistic 模式，这与 fork 代码只允许 challenger 不一致 | 由 M10、[1] Permissions “MantleSecurityMultisig … can toggle between the optimistic mode” 推出：可能是 owner 通过升级间接实现，或 L2BEAT 描述不精确 | inferred | |
| M16 | MantleSecurityMultisig `0x4e59e778a0fb77fBb305637435C62FaeD9aED40f` 是 6/14 的 Safe | [1] Permissions “A Multisig with 6/14 threshold”；2026-01-21 更新 “threshold now 6 of 14” | observed | |
| M17 | SecurityMultisig 经 ProxyAdmin `0xca35…7794` 无延迟升级 Oracle、SystemConfig、L1CrossDomainMessenger、L1StandardBridge、OptimismPortal | [1] Permissions “Can upgrade with no delay” 列表 | observed | |
| M18 | L2BEAT 判定 Mantle 没有退出窗口，恶意升级可直接盗取资金（CRITICAL） | [1] Risk summary 1 与 Exit window “None” | observed | |
| M19 | MantleEngineeringMultisig `0x2F44BD2a54aC3fB20cd7783cF94334069641daC9` 是 3/7 Safe，担任 Oracle challenger 和 OptimismPortal guardian（可暂停提款） | [1] Permissions MantleEngineeringMultisig 一节；OPSuccinctL2OutputOracle Roles “challenger”；OptimismPortal Roles “guardian” | observed | |
| M20 | batcher 是单个 EOA `0x2f40D796917ffB642bD2e2bdD2C762A5e40fd749`，proposer 是单个 EOA `0x6667961f5e9C98A76a48767522150889703Ed77D` | [1] Permissions EOA 1 / EOA 2；Tracked transactions | observed | |
| M21 | 只有白名单 proposer 能发布状态根，proposer 停摆时提款会冻结 | [1] Proposer failure “Cannot withdraw”；[14] approvedProposers 检查，没有 fallbackTimeout | observed | |
| M22 | MNT 代币合约由 SecurityMultisig 经 1 天 Timelock 升级，owner 可每年增发至多 2% | [1] Permissions “L1MantleToken [via: TimelockController with 1d delay]”“mint new MNT (up to 2% of supply per year)” | observed | |
| M23 | 当前 DA 只有 Ethereum blobs，blob 提交到 inbox `0xFFEEDDCcBbAA0000000000000000000000000000` | [1] Badges “Ethereum with blobs”；Data posted 一节；Milestone 2026-04-16 “DA is Ethereum only” | observed | |
| M24 | 2025-03-19 Mantle 用 EigenDA 替代 MantleDA | [1] Milestone 2025-03-19；[13] v1.1.1 “activating EigenDA on the Mantle mainnet, replacing the MantleDA” | observed | |
| M25 | 2026-01-21/22 起 blobs 成为主 DA，但当时仍可经 Hydro 在链下发往 EigenDA | [1] 2026-01-21 更新 “isUsingEigenDA: false … can still post to EigenDA offchain via Hydro”；[24] 2026-01-22 “Ethereum blobs as its primary DA layer” | observed | |
| M26 | Arsia 的证明程序删除了 EigenDA 路径，只保留 Ethereum 路径 | [1] 2026-04-16 更新 “programs/range/eigenda/ … are gone, only programs/range/ethereum/ remains” | observed | |
| M27 | Arsia 在 L2 主网的激活时间是 2026-04-22 07:00 UTC，L1 SystemConfig 升级交易在 2026-04-16 | [6] “timestamp 1776841200 … April 22, 2026, 07:00:00 UTC”；[1] Past upgrades 2026-04-16 06:58 UTC | observed | |
| M28 | Mantle 官方 Overviews 页仍把 EigenDA 写成 DA 模块，属于过时描述 | [12] Overviews “Independent DA modules, such as EigenDA … more than 90%”；对比 M23 | observed | |
| M29 | Mantle 的提款证明只依赖 keccak 哈希和 output root，不依赖签名 | [23] proveWithdrawalTransaction “keccak256 hash of the outputRootProof … inclusion proof” | observed | |
| M30 | OptimismPortal proxy 为 `0xc54cb22944F2bE476E02dECfCD7e3E7d3e15A8Fb`，L1StandardBridge proxy 为 `0x95fC37A27a2f68e3A647CDc081F0A89bb47c3012` | [1] Smart contracts 一节 | observed | |
| M31 | Skadi 升级让 Mantle 支持 Prague，包括 EIP-7702 SetCode 交易 | [8] “support all features of the Ethereum Prague upgrade … EIP-7702: Supports SetCode TX” | observed | |
| M32 | Skadi 主网发布在 2025 年 8 月（GitHub release 2025-08-15；Messari 记为 08-27） | [13] “1.3.1 Mainnet Skadi 15 Aug”；[29] Event Date August 27, 2025 | observed | |
| M33 | Mantle 先用 RIP-7212 启用 P-256 预编译，Limb（2026-01-14）改为 EIP-7951，gas 从 3450 调到 6900 | [9] EIP-7951 条目原文与 “scheduled to occur at 2026-01-14 07:00:00 UTC” | observed | |
| M34 | 当前生产执行客户端是 Mantle 的 op-geth fork（Arsia 时为 v1.5.4），op-node rebase 到 OP v1.16.3 | [6] “Bumped op-geth to v1.5.4”；[5] “rebased on Optimism op-node v1.16.3” | observed | |
| M35 | Elysium 只在测试网，EL 基于 go-ethereum v1.17.3，不激活 Amsterdam EVM | [11] Overview 与 “Ethereum L1 Glamsterdam Compatibility” 一节 | observed | |
| M36 | Mantle 的 Rust 栈（kona / mantle-xyz/reth）只在源码层推进，没有看到上线主网的公告 | [30] MANTLE_CHANGES.md Phase 表（Phase 2 op-succinct ⏸️）；[6] 生产仍用 op-geth | inferred | |
| M37 | Mantle 不是 Superchain 成员 | [22] chainList.json 中没有 chainId 5000 / Mantle | observed | |
| M38 | Optimism 2026-01-14 宣布在 2036 年 1 月前弃用 ECDSA EOA（需治理批准），PQ 签名方案未定 | [21] “10‑year timeline … subject to governance approval”“By January 2036”“not yet decided” | observed | |
| M39 | Optimism 计划把 L2 sequencer 和 batcher 的签名迁到 PQ，并对 “participating OP Stack chains” 协调硬分叉 | [21] Consensus 一节与 “How we'll ship this” 第 2 条 | observed | |
| M40 | Optimism 的 PQ 路线不会自动约束 Mantle，Mantle 只能在继续 rebase OP Stack 代码时复用相关改动 | 由 M37、M39、[5] Arsia 自行命名并一次性追平 OP 分叉推出 | inferred | |
| M41 | SP1 用 gnark 的 Groth16 或 PLONK（BN254）把 STARK 压成 SNARK 后在链上验证，并依赖其全部假设 | [17] “Groth16, PLONK, and the Zero-Knowledgeness of SP1” 一节 | observed | |
| M42 | SP1 Hypercube 的内层哈希是 KoalaBear 域上的 Poseidon2，FRI 依赖已证明的 proximity gap 定理 | [17] “Hash Functions and the Random Oracle Model”“Conjectures for FRI's Security” | observed | |
| M43 | SP1 Hypercube 的内存论证假设 KoalaBear 7 次扩域上的椭圆曲线 DLP 困难 | [17] “Security of Elliptic Curves over Extension Fields … used in our new memory argument” | observed | |
| M44 | SP1 内层不是纯哈希型，它的 ECDLP 假设在 Shor 下不成立 | 由 M43 推出：DLP 类假设是 Shor 的直接目标（量子依据见 threat 路） | inferred | |
| M45 | 扩域 ECDLP 被量子攻破后，SP1 的 STARK 层证明可以被实际伪造 | 没有找到公开分析，仅由 M44 引出的猜测 | speculative | |
| M46 | Mantle 的最终 L1 验证依赖 BN254 配对与 KZG，在量子下可能被伪造证明 | 由 M5、M6、M41 推出：PLONK/KZG 属于配对 / 离散对数类假设（量子依据见 threat 路）；[19] Succinct 也承认 “L2s … proofs rely on the same quantum-vulnerable cryptographic primitives” | inferred | |
| M47 | Mantle 的所有升级和关键开关最终都归结为 Safe 签名人的 secp256k1 ECDSA 私钥 | 由 M13、M17、M19、M9 推出：升级、换 verifier、切 optimistic、暂停提款、改路由都只需多签授权 | inferred | |
| M48 | Mantle 用户的 7702 委托不会消除原 EOA 私钥的量子风险 | 由 M31 与 starknet-account-model 台账 A53–A56 推出（7702 授权用 ecrecover，委托后原私钥仍能发交易和重新委托） | inferred | |
| M49 | Mantle 的 DA 继承 Ethereum blob KZG（BLS12-381），v1.4.2 节点用 KZG 承诺校验 blob | [9] op-node “update the blob verification logic to use KZG commitments”；[27] KZG “rely on elliptic curve pairings” | observed | |
| M50 | 没有找到 Succinct 公开的“替换 BN254 包装 / 在 L1 直接验证 PQ 证明”时间表 | [17] 仍只描述 BN254 包装；[18] 文章列表中只有 VEIL、Flock 等研究；[20] cuPQC 是 GPU 原语加速 | observed | |
| M51 | Succinct 的 VEIL / Flock 未来会成为 SP1 生产版的 PQ L1 验证路径 | [28] 第三方 qrindex 把 VEIL 视为路线信号；Succinct 没有给出时间表 | speculative | |
| M52 | EigenLayer / EigenDA 的 BLS 实现基于 BN254 | [25] BN254.sol “Contains BN254 parameters … and BLS signature functionality” | observed | |
| M53 | EigenDA 的 KZG 承诺也在 BN254 上 | [26] 仓库目录 `crypto/ecc/bn254`、`encoding/kzg`，由此推断 | inferred | |
| M54 | EigenDA 已不在 Mantle 的 DA 关键路径上，它的密码学对 Mantle 当前状态安全没有直接影响 | 由 M26、M23 推出 | inferred | |
| M55 | 在 Mantle 官方文档、官网和新闻稿中没有找到任何 PQ / 量子相关的路线或表态 | [12] llms.txt 索引中没有相关条目；对 mantle.xyz / forum.mantle.xyz 的 quantum 检索无结果 | observed | |
| M56 | 第三方 qrindex 把 Mantle 评为 PQ 迁移 Stage 0（Unaware），QRI 27/100（2026-06-05） | [28] “LayerQu independently scores Mantle at Migration Stage 0 (Unaware) with QRI 27/100 as of 2026-06-05” | observed | |
| M57 | L2BEAT 的 TVS 中约 48.6% 带有额外信任假设（外部桥或原生铸造） | [1] Summary “48.6% with additional trust assumptions” | observed | |
| M58 | 量子攻击者若拿到 3/7 EngineeringMultisig 的阈值密钥，可以把系统切到无证明模式，但至少要等 7 天 finalization 才能兑现 | 由 M10、M11、M19 推出 | inferred | |
| M59 | Mantle 的 batcher、proposer 等运营密钥托管在 HSM/KMS 中 | 只有 [6] v1.5.4 “Fixes to … HSM signer” 这一间接线索，部署情况没有公开 | speculative | |
| M60 | Mantle 会跟随 Optimism 的 PQ 硬分叉节奏 | 没有找到任何公开信息，与 M37 相反的方向也没有证据 | speculative | |

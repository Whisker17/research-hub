# 论断台账

六个分册合并（2026-10-07）。前缀对应分册：A = [notes-arch.md](notes-arch.md)（L1 架构）、C = [notes-chainsig.md](notes-chainsig.md)（Chain Signatures / MPC / 桥）、I = [notes-intents.md](notes-intents.md)（Intents 与 Confidential Intents）、N = [notes-ai.md](notes-ai.md)（NEAR AI）、E = [notes-ecosystem.md](notes-ecosystem.md)（生态数据与时间线）、O = [notes-main.md](notes-main.md)（主会话：抽查、分片布局、Mantle 启示）。证据里的 `[n]` 指该分册“来源”一节的第 n 条。
类型：observed（直接观察到，有一手证据）/ inferred（由证据推出）/ speculative（推测，页面上需标明）。

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| A1 | 2026-10-07 NEAR 主网协议版本为 86，RPC 节点版本 2.13.4 | [34] rpc.mainnet.near.org/status 返回 protocol_version 86、version 2.13.4 | observed | D |
| A2 | nearcore 2.13.0 把主网协议版本从 84 直接升到 86，PV 86 投票自 2026-07-20 00:00 UTC 开始 | [33] 2.13.0 release notes “upgrades the protocol version from 84 directly to 86” | observed | E、P |
| A3 | 截至 2026-10-07，最新稳定版是 2.13.4（安全更新），最新预发布是 2.14.0-rc.3 | [33] Releases 页面 | observed | |
| A4 | GasKeys、DynamicResharding、PostQuantumSignatures、DelegateV2 在代码中都是 PV 85 稳定特性 | [1] version.rs L161-L177 | observed | |
| A5 | gas keys、动态 resharding、ML-DSA-65 签名当前已在主网启用 | 由 A1、A4 推出：主网 PV 86 ≥ 85，且 PV 85 特性随 84→86 一并激活（A2） | inferred | |
| A6 | FunctionCall access key 由 allowance、receiver_id、method_names 组成，allowance 只限制 gas 和交易费，不是资产额度 | [6] account.rs L959-L978；[27] “amount of NEAR allowed to be spent on gas” | observed | |
| A7 | gas key 是 AccessKeyPermission 的两个新变体，最多 1,024 条 nonce lane | [6] account.rs L909-L923 MAX_NONCES_FOR_GAS_KEY = 1024；[2] CHANGELOG L61 | observed | J |
| A8 | gas key 交易的 gas 从 key 余额扣、deposit 从账户扣，gas 退款回 key；删除 key 时剩余余额被烧，超过 1 NEAR 则删除失败 | [24] NEP-611 Gas Key Actions/Refunds；[6] MAX_BALANCE_TO_BURN = 1 NEAR；[27] | observed | J |
| A9 | NEP-611 的首要动机是 SPICE：执行滞后时，chunk producer 纳入交易时无法验证余额，需要防垃圾交易 | [24] NEP-611 Summary/Motivation | observed | F11、J、P |
| A10 | NEP-611 在 NEPs 仓库仍为 Draft，nearcore 2.13.0 已标注 Stabilized | [24] Status: Draft (v1.2.2)；[2] CHANGELOG L61 | observed | |
| A11 | DelegateV2（gas key 签 meta tx）在 PV 85 引入、PV 87 被拒；旧版 Delegate 不接受 gas key 签名 | [1] DelegateV2 => 85, RejectDelegateV2 => 87；[2] CHANGELOG L26 | observed | |
| A12 | 当前主网（PV 86）上 DelegateV2 可用，2.14（PV 87）上线后将失效 | 由 A1、A11 推出：86 ≥ 85 且 < 87 | inferred | |
| A13 | 存储质押为每字节 1e19 yoctoNEAR，即 1 NEAR / 100 KB | [3] parameters.yaml L36 storage_amount_per_byte | observed | J |
| A14 | ETH 隐式账户（0x+40hex，NEP-518）在 nearcore 2.1.0 上线，创建时不带 access key，而是使用 wallet contract | [22] NEP-518 Summary；[2] CHANGELOG 2.1.0 | observed | |
| A15 | 2.13 把新建账户成本从约 0.0008 NEAR 提高到约 0.007 NEAR，gas 买价下限为 0.001 NEAR/Tgas | [2] CHANGELOG L64；[4] 85.yaml account_creation_charge、min_gas_purchase_price | observed | |
| A16 | 交易必须在 signer 所在分片转换为 receipt，因为只有该分片持有 access key 状态 | [14] cross-shard.md Step 1 | observed | F2、J |
| A17 | 只有 sender==receiver 的 receipt 进入 local_receipts 在同块执行，其余新 receipt 在下一块或更晚执行 | [15] tx_receipts.md Step 2/3 | observed | F2、J |
| A18 | 跨合约调用与 callback 在不同区块执行（通常相隔 1–2 块），期间合约可以被其他调用访问 | [28] docs crosscontract “Asynchronous” | observed | F2、J |
| A19 | 被调合约失败不会回滚调用方已提交的状态，callback 总会执行，开发者必须手动回滚或退款 | [28] docs crosscontract “What happens if the function I call fails?” | observed | F2、J |
| A20 | 对同一合约的 batch call 在同一 receipt 内执行，任一失败则全部回滚 | [28] docs crosscontract “Calling Multiple Functions on the Same Contract” | observed | F2、J |
| A21 | 全链共用区块级 gas_price，按所有分片的平均利用率是否超过 50% 调整，单个分片满载不会推高价格 | [13] gas.md “Block-Level Gas Price” | observed | |
| A22 | PV 78（NEP-536）起 gas 按购买时的价格燃烧，不再有悲观 gas price | [13] gas.md；[2] CHANGELOG 2.7.0 | observed | |
| A23 | 单笔交易可预付 gas 上限为 1 PGas（2.11.0 从 300 Tgas 上调） | [3] max_total_prepaid_gas；[2] CHANGELOG 2.11.0 | observed | |
| A24 | 现行拥塞控制在目标分片 congestion level ≥ 0.8 时拒收发往该分片的新交易 | [3] reject_tx_congestion_threshold 80/100；[7] shard_accepts_transactions | observed | J |
| A25 | 完全拥塞时，只有轮值的 allowed_shard 能向该分片转发 1 PGas，其余为 0 | [7] congestion_info.rs L80-L93；[3] allowed_shard_outgoing_gas | observed | |
| A26 | 现行拥塞参数（400 PGas / 10 PGas / 125 / 0.8）相比 NEP-539 原始值（20 PGas / 2 PGas / 10 / 0.25）已经放宽 | [3] parameters.yaml L365-L381；[19] NEP-539；[2] CHANGELOG 2.4.0 “Relaxing Congestion Control” | observed | J |
| A27 | 恶意或热点负载下，拥塞控制最坏会把全局吞吐退化到 1000 Tgas/NUM_SHARDS | [9] receipt-congestion.md Idea 1 | observed | J |
| A28 | stateless validation 与拥塞控制在 nearcore 2.0.0 上线 | [2] CHANGELOG 2.0.0 | observed | F4 |
| A29 | chunk 纳入区块需要获得分配给该分片 stake 的 2/3 以上 endorsement（分母不是全网 stake） | [17] NEP-509 “Design after NEP-509” | observed | F4、J |
| A30 | state witness 是 trie 子集加包含证明，validator 需要重新执行，它不是简洁的 validity proof | [17] NEP-509 Summary；[31] 背景段 | observed | F4、J |
| A31 | 选择 stateless validation 是因为 fraud proof、challenge、回滚组合起来过于复杂 | [17] NEP-509 Motivation | observed | F4、F11 |
| A32 | chunk validator 按 mandate 在每个高度随机分配到各分片，安全性因此变为概率性 | [17] NEP-509 Chunk validators selection / Neutral consequences | observed | F4 |
| A33 | 2.8.0 把验证者上限从 300 提到 500，每分片 mandates 提到 105 | [2] CHANGELOG 2.8.0 | observed | F4 |
| A34 | witness 在代码中的未压缩硬上限是 64 MiB；NEP-509 的设计目标约 16 MiB | [8] state_witness.rs L18-L21；[17] Size limits | observed | F4 |
| A35 | 现行 main_storage_proof_size_soft_limit 为 4 MB（NEP-509 原文为 3 MB） | [3] parameters.yaml L24；[17] | observed | F4 |
| A36 | NEP-509 估算的 witness 分发最坏带宽约 214 Mbps（16 MiB、RS 比例 0.6） | [17] Network tradeoffs | observed | F4 |
| A37 | 动态 resharding 每 epoch 至多拆一个分片，拆分在 N+2 epoch 生效，并有冷却期 | [10] Key Design Principles；[26] | observed | F3 |
| A38 | 动态 resharding 首次上主网时 max_number_of_shards 设为当前分片数 + 1 | [26] NEP-639 “Limiting the Blast Radius” | observed | F3 |
| A39 | 拆分边界是 AccountId，单个大账户整体落在一侧，热点单合约无法靠 resharding 拆开 | 由 [10][26] 推出：边界为账户 ID，Split B “-0” 把大账户整体推到左侧 | inferred | F3 |
| A40 | 2025-12 主网为 9 个分片；2026 年动态 resharding 博客写 9 个分片外加 1 个 Confidential Intents 私有分片 | [31] “mainnet is operating with 9 shards”；[36] | observed | |
| A41 | PV 86 之后主网已经发生过自动拆分（9 → 10） | 分册原为 speculative；主会话补查链上布局后由 O1、O4、O5 推出 | inferred | F3 |
| A42 | NEAR 把 sharded contracts（NEP-616 确定性账户）作为单合约热点的缓解手段，Intents 的 wallet / global-deployer 已采用 | [36] near.org 博客；[25] NEP-616 Motivation | observed | |
| A43 | optimistic block 在 PV 77、nearcore 2.6.0 引入，用于消除 2 倍的 chunk 执行延迟 | [11] optimistic_block.md；[2] CHANGELOG 2.6.0 | observed | F4 |
| A44 | NEAR 官方称自 2025-05 起 600 ms 出块、1.2 s finality | [37]；[38] “as of May 2025” | observed | E、F4、P |
| A45 | 2026-10-06 至 07 主网平均出块间隔约 0.590 s（122,235 个高度，72,146 s） | [34] earliest/latest 高度与时间戳 | observed | F4、D |
| A46 | Doomslug 中，区块 B 之上出现两个高度连续的块即 final，所以 finality 约等于 2 个块时间 | [16] Consensus.md Finality condition | observed | D |
| A47 | yield/resume 的 NEP 动机示例就是 MPC 签名合约，超时为 200 块 | [18] NEP-519 Motivation/Spec；[3] yield_timeout_length_in_blocks 200 | observed | J |
| A48 | yield 超时后回调仍会执行，收到 timeout 错误；resume 入口必须做调用者校验 | [29] docs yield-resume；[18] Security Implications | observed | J |
| A49 | yield_with_id host functions 在 PV 85 稳定，用途包括合约内 mempool | [1] YieldWithId => 85；[2] CHANGELOG L63 | observed | |
| A50 | global contracts（NEP-591）在 nearcore 2.6.0 上线，支持按 hash（不可变）或按账户（可升级）引用 | [20] NEP-591 Specification；[2] CHANGELOG 2.6.0 | observed | J |
| A51 | global contract 存储按每字节 0.0001 NEAR 计（普通存储的 10 倍），部署时烧掉 | [3] L401；[30] docs “10x … entirely burnt” | observed | J |
| A52 | NEP-591 的动机写明了 chain signatures 带来的智能合约钱包大量部署场景 | [20] NEP-591 Motivation | observed | |
| A53 | 1M TPS 基准为 70 分片、140 节点、原生转账、chunk producer 自生成交易、稳态 0.5 block/s | [31] Setup/Running the benchmark | observed | F4 |
| A54 | 1M TPS 基准为测上限调整或关闭了 compute-cost 与 witness 大小上限，不代表主网配置 | [31] “Consistently measuring benchmark results” | observed | F4 |
| A55 | SPICE 在代码中是 PV 180 特性，被有意排除在 nightly（157）之外，尚未上线 | [1] version.rs L200-L202、L243-L252；[38] “Currently in development” | observed | F4 |
| A56 | SPICE 要解决的耦合包括：纳入前须知执行结果、receipt 必须进下一块、出块须等上一块执行和验证、DA 绑定出块 | [32] “The Problem” | observed | |
| A57 | 200 ms 出块与跨分片原子执行是 SPICE 及其后续版本的计划，不是现状 | [38] “When SPICE launches…”；“will require a further update after SPICE” | observed | F4 |
| A58 | ML-DSA-65 只覆盖交易签名与 access key，validator key、区块签名、隐式账户推导不在范围内 | [12] post_quantum_signatures.md Summary/Out-of-scope；[27] | observed | J |
| A59 | 合约内 ml_dsa_verify host function 属于 PV 87（2.14），尚未在主网启用 | [5] 87.yaml ml_dsa_verify_host_fn；由 A1 主网 PV 86 推出未启用 | inferred | |
| A60 | dynamic_resharding.md 把 StickyResharding 写成 PV 153，与 version.rs 的 85 不一致，以代码为准 | [10] §2.6；[1] version.rs L167 | observed | |
| C1 | 主网 Chain Signatures 签名合约账户是 `v1.signer`，测试网是 `v1.signer-prod.testnet` | [12] docs implementation；[9] mpc/crates/contract/README.md @e968367 | observed | K |
| C2 | `sign` 参数为 `path`、`payload_v2`（Ecdsa 32B / Eddsa 字节）、`domain_id`，仍兼容旧字段 `payload`/`key_version` | [6] near-mpc-crypto-types/src/sign.rs#L30-L35 @e968367；[9] | observed | K |
| C3 | `sign` 必须附带 ≥1 yoctoNEAR，多余部分自动退还 | [3] api/common.rs#L119-L130 @e968367；[8] deposits.rs#L4 | observed | K |
| C4 | 押金要求的目的是强制使用 full-access key 授权，防止恶意前端用 function-call key 静默发起签名 | [3] common.rs `require_deposit` 注释；[9] README “Deposit requirement” | observed | K |
| C5 | 代码中 sign 所需预付 gas 默认 15 TGas，而 README 写“至少 10 TGas、约 7 TGas 消耗” | [7] config.rs#L13 @e968367；[9] README | observed | |
| C6 | `sign` 通过 `env::promise_yield_create` 挂起请求，把 data_id 存入 pending map | [3] common.rs#L85-L107 @e968367；[2] sign.rs#L76-L81 | observed | K |
| C7 | yield 超时由 nearcore 参数 `yield_timeout_length_in_blocks: 200` 决定 | [10] parameters.yaml#L341 @090da31；[40] docs 搜索摘要“200 blocks ≈ 2 min” | observed | K |
| C8 | 超时后回调收到 PromiseError，调度 `fail_on_timeout` 使原交易以 Timeout 失败 | [2] sign.rs `return_signature_and_clean_state_on_success`；[3] common.rs#L112-L116 | observed | |
| C9 | `respond` 只接受已 attested 的参与者节点，并要求协议处于 Running/Resharing 且 accept_requests 为真 | [2] sign.rs#L84-L102 @e968367 | observed | K |
| C10 | 合约在 `respond` 中用派生公钥链上验签，验不过返回 InvalidSignature，所以 MPC 不能返回错误签名 | [2] sign.rs#L107-L160 @e968367 | observed | K |
| C11 | tweak = SHA3-256("near-mpc-recovery v0.1.0 epsilon derivation:" ‖ predecessor ‖ "," ‖ path) | [4] near-mpc-crypto-types/src/kdf.rs#L8-L39 @e968367 | observed | K |
| C12 | secp256k1 派生公钥 = PK_root + G·tweak；ed25519 派生公钥 = PK_root + B·tweak（加法派生）| [5] contract/src/crypto_shared/kdf.rs#L14-L34 @e968367；[11] | observed | K |
| C13 | 派生绑定直接调用者（predecessor），合约调用 `v1.signer` 时控制权归该合约 | 由 C11、[3] common.rs#L67 推出：tweak 输入是 `env::predecessor_account_id()` | inferred | K |
| C14 | 支持的签名方案：OT-based ECDSA（Cait-Sith，secp256k1）、FROST EdDSA（Ed25519）；CKD 用 BLS12-381 | [1] mpc README @e968367；[14] | observed | |
| C15 | Robust ECDSA 目前是会泄露密钥的不安全 stub，从未在生产启用 | [1] mpc README @e968367 | observed | |
| C16 | 主网 domain 0 = Secp256k1 签名、domain 1 = Ed25519 签名，两者都有实际 sign/respond 交易 | [11]；[39] nearblocks txns-only（respond domain_id 0/1）| observed | |
| C17 | 一次 EdDSA `sign` 交易在主网总费用约 0.0008 NEAR（2026-10-07 单笔样本）| [39] tx HxMwTgjwxbjjiG75gJjLLJ2goUKCtWiefvAp9pqd4F57 transaction_fee ≈ 8.0e20 yocto | observed | |
| C18 | 控制外链地址的流程分五步：派生地址 → 构造交易 → sign → 格式化签名 → 广播 | [12] docs implementation | observed | |
| C19 | 签名是否限定在某条链取决于 payload；官方建议每条链用不同 path 防止重放 | [11] docs chain-signatures Warning | observed | |
| C20 | 截至 2026-10-07 主网 MPC 有 17 个参与者，签名门限 11/17 | [13] nearblocks.io/chain-signatures（访问 2026-10-07）| observed | F5、D |
| C21 | 截至 2026-10-07 有 13/17 个运营方提交了真实 TDX attestation，4 个没有 | [13] nearblocks TEE 列；[14] 判定口径 Dstack vs Mock | observed | F5、D |
| C22 | docs.near.org 写的“MPC 网络由 8 个节点组成”已经过时 | 由 [11][12]“8 nodes”与 C20 推出：链上快照为 17 | inferred | F5 |
| C23 | 主网尚未全员强制 TEE：合约保留 Mock attestation 路径，且有非 TDX 节点在参与 | 由 [16] tee_state.rs `verify_and_store_mock` 与 C21 推出 | inferred | |
| C24 | TEE 设计：Dstack + Launcher 校验镜像哈希并 extend 进 RTMR3，合约校验 quote、MRTD/RTMR 白名单与 report_data 绑定 | [15] securing-mpc-with-tee.md @e968367 | observed | |
| C25 | 新镜像投票通过后旧镜像有 7 天宽限，过期后未更新的节点会被踢出并触发 reshare；不足门限时改为停止接受请求 | [15]；[7] config.rs DEFAULT_TEE_UPGRADE_DEADLINE 7 天 | observed | |
| C26 | MPC TEE 威胁模型只假设 integrity、不假设 confidentiality，并承认磁盘快照回滚有份额重用风险 | [15] Threat Model 一节 | observed | |
| C27 | 密钥由 PedPoP+ DKG 生成，无 trusted dealer；reshare 可换成员、改门限，主公钥不变 | [17] dkg.md @e968367；[14] | observed | |
| C28 | 门限变更规则：新门限 ≥ 参与者数 60%（向上取整），所有 prospective 参与者都要投票 | [9] README “Changing the participant set” | observed | |
| C29 | 节点内嵌 indexer 监听 sign 调用，按请求哈希选 leader，leader 掉线由 secondary 接替 | [1] mpc README “NEAR Indexer” | observed | |
| C30 | 主网运营方包括 Near One（n1-multichain）、Aurora、Everstake、Luganodes、Nansen、Bitwise、HashKey 等 17 个账户 | [13] 账户列表；[14] OPERATORS 映射（标注 best-guess）| observed | |
| C31 | docs.near.org 仍把 Chain Signatures 描述为“one way”的 outbound 方案 | [11] docs Tip | observed | |
| C32 | mpc 合约实现了 `verify_foreign_transaction`：节点先在外链验证交易，再对观察值做门限签名 | [18] foreign_chain/requests.rs#L32-L72 @e968367；[1] | observed | F5 |
| C33 | 主网 domain 3（ForeignTx）已有生产调用：调用方 mpc-prover*.bridge.near，链为 Aptos/Starknet（2026-10-06/07）| [22] nearblocks API verify_foreign_transaction，例如 tx 8A2tkLxfnbL37JZaUTHTdq2ckWBkZZpNfqHvzLkSAMi6 | observed | F5 |
| C34 | “Chain Signatures 只能 outbound”的说法在协议层面已经过时 | 由 C31、C32、C33 推出：同一 MPC 网络已在主网提供外链交易证明 | inferred | F5 |
| C35 | foreign-tx 安全性基于“≥ 签名门限的节点各自查询自己配置的 RPC，provider 结论一致才出份额”，不是 light client | [20] calculating-supported-foreign-chains.md；[19] Scope 一节 | observed | F5、K |
| C36 | foreign-tx 响应用 domain 根公钥（不做 tweak）验签 | [18] requests.rs#L107-L120 @e968367 | observed | K |
| C37 | 不填 `expected_payload_hash` 时可以用旧签名 resolve 待处理请求，属于 DoS 风险（文档称不涉及资金）| [19] “Binding the response to the request” | observed | |
| C38 | foreign-tx 的 RPC quorum 字段已存储但尚未生效 | [20] Background 一节 | observed | |
| C39 | mpc 3.15.0（2026-09-04）加入 Ethereum、Avalanche、SVM 的 foreign-tx 支持；3.16.0（2026-09-18）把 SVM inspector 接入节点 | [21] CHANGELOG.md @e968367 | observed | |
| C40 | `mpc-prover*.bridge.near` 是 Omni Bridge 用于入站校验的组件 | 由 C33 与 [19]（设计首要用例是 Omnibridge 入站）推出：账户名为 bridge.near 子账户 | speculative | |
| C41 | CKD 入口为 `request_app_private_key`，需要 ≥1 yocto，按 predecessor+path 派生 app_id | [23] api/ckd.rs#L24-L67 @e968367；[4] kdf.rs#L17-L23 | observed | |
| C42 | CKD 机制：节点计算 x_i·H(pk, app_id) + y_i·A，coordinator 聚合出 ElGamal 加密的 BLS 签名，应用解密后做 pairing 校验 | [24] Near One CKD 博客 2026-02-23 | observed | |
| C43 | MPC 合约不检查 CKD 调用方的 TEE attestation，该检查由开发者合约负责 | [24] System Overview；[23] ckd.rs 中没有 attestation 检查 | observed | K |
| C44 | 公开可验证 CKD（AppPublicKeyPV）已实现，合约在 respond_ckd 中校验；博客发布时还写作计划 | [23] ckd.rs `ckd_output_check`；[24]；[25] | observed | K |
| C45 | 主网 CKD（domain 2）已有调用，调用方为 outlayer-admin.near 与 outlayer-admin.defuse-ops.near（2026-10-05/06）| [26] nearblocks API request_app_private_key | observed | F5、K |
| C46 | 没有一手证据显示 NEAR AI Cloud、FAR 或 Shade Agents 在生产中使用 CKD | 由 [24] 未点名用户、[26] 仅见 outlayer 账户推出 | inferred | |
| C47 | Intents 使用三座桥（Omni、PoA、HOT），每座桥信任模型不同，按目标链选择 | [27] docs.near-intents bridging overview | observed | F6 |
| C48 | Omni Bridge 由 Near One 运营：入站 ETH/BTC 用 NEAR 上的 light client，Solana 和若干 L2 用 Wormhole；出站一律由 MPC 签名 | [28]；[30]；[32] | observed | F6、C、K |
| C49 | Omni 的 BTC 存款每笔一个派生地址、不归集；入站无需信任他人，出站信任 MPC 运营方 | [29] docs.near-intents how-it-works | observed | F6、K |
| C50 | Intents 文档列的 Omni 链（6 条）与 docs.near.org 列的（8 条，含 Zcash、Polygon）不一致 | [27][28] 对比 [30][32] | observed | F6 |
| C51 | PoA 代币只有 owner 能 mint；提现方式是 ft_transfer 回代币合约并在 memo 写 `WITHDRAW_TO:` | [33] intents/contracts/poa/token/src/lib.rs#L15-L38 @4127e8e | observed | F6、K |
| C52 | 主网 PoA 工厂 `omft.near` 用 ft_transfer_call 把入金转进 intents.near，并带 BRIDGED_FROM memo | [34] nearblocks API omft.near txns | observed | F6 |
| C53 | PoA Bridge 的信任模型是中心化运营方（铸币权限 + 外链托管）| 由 C51 与 [27]“Proof of Authority”推出 | inferred | F6、K |
| C54 | HOT Bridge 的入站和出站都依赖 HOT Protocol 自己的 MPC 验证者签署证明，与 NEAR v1.signer 不是同一网络 | [35] docs.hotdao.ai/omni-tokens | observed | F6、K |
| C55 | Omni 用 MPC 签名替代在目标链上跑 NEAR light client；Rainbow 的 NEAR→ETH 方向需要 4–8 小时 | [31] docs omnibridge how-it-works | observed | |
| C56 | Rainbow Bridge 已被 Omni 正式取代并下线 | [36] bridge-sdk-rs 称 Omni 为下一代；[37] rainbowbridge.app 仍可访问；没有找到下线公告 | speculative | |
| C57 | MPC 门限被合谋突破时，所有派生地址上的外链资产（包括 Omni 出站托管）都会失守 | 由 C12、C20、C48 推出：所有派生密钥共享同一根密钥份额 | inferred | |
| C58 | 上线新外链需要经过合约/节点实现、两张网升级、投票白名单、运营方配置四步，运营方配置是瓶颈 | [38] embedded-foreign-chain-configs.md（Proposed，2026-10-01）| observed | |
| I1 | verifier 部署在 `intents.near`，源码为 near/intents 的 contracts/defuse（原名 defuse），无 testnet 部署 | [1] README；[19] verifier introduction | observed | F1、L |
| I2 | verifier 内部 token ID 有 nep141 / nep171 / nep245 / imt 四种 | [15] crates/primitives/token-id/src/lib.rs `enum TokenId`@4127e8e | observed | |
| I3 | `imt_mint` / `imt_burn` 只在 `imt` feature 下编译；`far` feature 包含 `imt`；默认 reproducible build 只启用 `contract` | [2] mod.rs `#[cfg(feature="imt")]`；[14] Cargo.toml#L67-L68 及 reproducible_build 配置 | observed | F1 |
| I4 | 主网 `intents.near` 很可能不支持 IMT intent | 由 I3 与 [32] 推出：IMT 只在 FAR 上作为私有资产使用，主网默认构建不含 imt | inferred | |
| I5 | @4127e8e 共 13 种 intent：add/remove_public_key、transfer、ft/nft/mt/native_withdraw、storage_deposit、token_diff、set_auth_by_predecessor_id、auth_call、imt_mint、imt_burn | [2] contracts/defuse/core/src/intents/mod.rs#L39-L83 | observed | |
| I6 | 存入方式是在 token 合约上 `*_transfer_call` 到 `intents.near`；`msg` 可以为空、写 AccountId，或写含 `execute_intents` / `refund_if_fails` 的 JSON | [12a] nep141/deposit.rs `ft_on_transfer`；[22] Deposits 文档 | observed | L |
| I7 | 提现先在 verifier 内扣账，再发出异步 `ft_transfer(_call)`，由 `ft_resolve_withdraw` 回调按结果退款；带 `msg` 时失败不退款 | [12b] nep141/withdraw.rs；[22] Withdrawals 文档 | observed | L |
| I8 | `execute_intents` 依次检查签名、verifying_contract、deadline、公钥归属、versioned nonce，再 commit nonce 并执行 intents | [5] engine/mod.rs#L42-L83 | observed | F2 |
| I9 | `execute_intents` 中任一 intent 出错或配平失败都会 panic，整笔回滚 | [10] contract/intents/mod.rs `.unwrap_or_else(\|e\| e.panic())`；[5] `finalize()` | observed | F2、F6、B |
| I10 | 每个 token 的内部存入与取出（含 fee_collector 入账）必须完全撮合，否则返回 `InvariantViolated::UnmatchedDeltas` | [4] deltas.rs `TransferMatcher::finalize` | observed | F2、B |
| I11 | `token_diff` 只对负 delta（token_in）收费，fee 记入 `fee_collector`；NEP-171 以及 \|delta\|≤1 的 MT/IMT 免费 | [3] token_diff.rs `execute_intent` 与 `token_fee` | observed | |
| I12 | 文档写明链上协议费为 0.0001%（1 pip） | [28] resources/fees（2026-10-07） | observed | L |
| I13 | 同一批 intent 创建的跨合约 Promise 并发执行，不保证完成顺序 | [2] DefuseIntents 注释；[20] 文档警告 | observed | |
| I14 | `simulate_intents` 返回执行报告、未配平的 delta，以及当前 fee 与 salt | [10] contract/intents/mod.rs `simulate_intents` | observed | |
| I15 | MultiPayload 支持 nep413、erc191、tip191、raw_ed25519、webauthn、ton_connect、sep53 七种签名标准 | [6] payload/multi.rs#L19-L58 | observed | L |
| I16 | README 提到 BIP-322，但当前 MultiPayload 中没有 BIP-322 变体 | 由 [1] README 与 [6] multi.rs 对比推出：枚举中无对应变体 | inferred | |
| I17 | nonce 为 256 位，用 permit2 风格位图存储，可以非顺序、并发使用 | [7] nonce/mod.rs；[9] accounts.rs 注释 | observed | L |
| I18 | versioned nonce 布局为 magic `5628f6c6` + version + salt(4B) + deadline(8B) + random(15B)；legacy nonce 目前仍被接受 | [7] nonce/versioned.rs#L9-L29；[5] `verify_intent_nonce` | observed | L |
| I19 | 文档的 nonce 描述“[4B salt][28B]”与代码不符，文档示例 nonce 解码后为 magic + V1 + salt `252812b3` | 由 [20] 示例 nonce 的 base64 解码与 [7] 的布局对比推出 | inferred | |
| I20 | verifier 账户与 NEAR 原生账户 / access key 是两套体系；外链钱包使用由公钥派生的隐式账户，无需注册 | [21] account-abstraction；[8] public_key.rs#L35-L82 | observed | L |
| I21 | 在 verifier 中注册的每个公钥都拥有完全权限，可以增删其他 key | [21] account-abstraction；[2c] AddPublicKey 注释 | observed | L |
| I22 | 管理员角色可以锁定账户、强制提现、强制切换 predecessor 认证，并可暂停 intents | [9] ForceAccountManager；[12b] `ft_force_withdraw`；[13] Pausable 与 Role | observed | L |
| I23 | relayer key 是 `intents.near` 上只能调用 `execute_intents`、allowance 为 Unlimited 的 function-call access key | [11] relayer.rs#L14-L27 | observed | C、L |
| I24 | Message Bus 用 relayer key 以 `intents.near` 自身身份提交结算交易 | 由 [23]“Message Bus 提交结算交易”与 [11] relayer key 设计推出 | inferred | L |
| I25 | 公共 Message Bus 的 RFQ 流程：quote 广播给 solver（最多等 3000 ms）→ solver 返回签名 intent → 用户签名 → `publish_intent` → 打包上链 | [23] 概览；[24] RPC 参考 | observed | L |
| I26 | solver 接入需要 Partner JWT 与 KYC/KYB；链上 verifier 不设 solver 白名单 | [25] quickstart；[13] Role 列表中无 solver 角色 | observed | |
| I27 | 1Click 报价字段含 depositType / recipientType / refundType（ORIGIN_CHAIN 或 DESTINATION_CHAIN / INTENTS / CONFIDENTIAL_INTENTS）、confidentiality、deadline、slippageTolerance | [26] making-a-request | observed | L |
| I28 | 1Click 状态包括 PENDING_DEPOSIT、KNOWN_DEPOSIT_TX、PROCESSING、SUCCESS、INCOMPLETE_DEPOSIT、REFUNDED、FAILED | [26] making-a-request | observed | L |
| I29 | 1Click 平台费：有 API key 时 20 bps（稳定币对及同资产跨链 1 bp）；无 key 时额外加 25 bps；带 appFees 时 50/50 分成且 1Click 一半最低 20 bps；合计上限 500 bps | [27] fee-config；[28] fees（2026-10-07） | observed | L |
| I30 | 一笔跨链 swap 中只有 verifier 内的 `execute_intents` 结算是原子的，入金桥、出金桥和外链交付在原子域之外 | 由 [5][10] 的单 receipt 回滚与 [12b][30][31] 的异步桥接推出 | inferred | F6、L |
| I31 | PoA token 只能由 owner 铸造；提现方式是向 token 合约自身 `ft_transfer`，memo 写 `WITHDRAW_TO:<地址>` | [17] poa/token/src/lib.rs | observed | F6 |
| I32 | Omni Bridge 的 BTC 提现由 MPC 网络联合签名、relayer 广播；入金由轻客户端校验 Merkle 证明 | [31] omni-bridge how-it-works | observed | F6 |
| I33 | 三座桥（Omni / PoA / HOT）支持的链各不相同，信任模型也各不相同 | [30] bridging overview | observed | F6 |
| I34 | Confidential Intents 采用双链结构：公链 `intents.near` + 许可制私有 NEAR 分叉 FAR 上的 `intents.far`；FAR 无公网 P2P，RPC 需认证访问 | [32] confidential-intents | observed | F1、F7、A、M |
| I35 | shield 是在公链上把 token transfer 给 Treasury，由 Private PoA Bridge 在 FAR 上铸造 IMT；unshield 是在 FAR 上 burn IMT，由桥从 Treasury 放款；桥按 RPC 请求驱动 | [32] confidential-intents；[33] confidential-example | observed | F7、M |
| I36 | 私有资产 ID 形如 `imt:<Treasury>:nep141:<token>`，每个 IMT 由 Treasury 中的资产 1:1 支持 | [32]；[15] imt.rs 注释 | observed | F7、M |
| I37 | solver 的 swap 与 recover 共用同一个 nonce，只有一个能上链；带 shield 却没有 recover 的报价会被拒绝 | [32]；[33]；[7] nonce 重复即报错 | observed | F7、M |
| I38 | 私有 relay 的验签依据公链 `intents.near`，读余额读 FAR；自 2026-07-13 起改为白名单、只允许 WebSocket | [32]；[35] changelog | observed | F7、M |
| I39 | Confidential Intents 于 2026-07-13 面向 B2B 上线；`confidentiality` 参数于 2026-07-01 上线 | [35] changelog | observed | E、M、P |
| I40 | Confidential Intents 于 2026-02-25 首发 | [S2] chainplay.gg、nearstats 等二手搜索摘要，官方博客未能读取 | speculative | |
| I41 | 产品页称运行在由“decentralized set of independent permissioned validators”运营的 private shard 上，经“TEE-based bridge”连接主网，并提供 selective disclosure | [36] intents.near.org/confidential（2026-10-07） | observed | F7、C |
| I42 | 开发者文档称 FAR 由“small validator set”运营，桥为“Private PoA Bridge”，没有 TEE 描述，与产品页表述不一致 | 由 [32] 与 [36] 的原文对比推出 | inferred | F7 |
| I43 | Confidential Intents 对公链观察者隐藏 FAR 内的余额与成交，但私有 relay、FAR 验证者与 1Click 后端都能看到明文 | 由 [32] relay 职责、[29] 机密余额接口与 NEAR 协议状态不加密推出 | inferred | F7、M |
| I44 | shield 时公链上可以看到发往 Treasury 的 transfer 的金额和时间 | 由 [33] shield 是公链 `intents.near` 上的 transfer intent 推出 | inferred | M |
| I45 | SHIELD 已上线：事件管理、作用域权限、三档安全模式、1Click 报价时评估（可延迟）；桥与更多路径的接入在推进中；solver 池控制与链健康适配器属于愿景 | [37] proactive-intents-security（2026-10-07） | observed | M |
| I46 | 文档称 SHIELD 的异常引擎“rule-based … rather than model-driven”，而 Polosukhin 称 SHIELD 为“AI security layer” | [37] 与 [40] 原文对比 | observed | |
| I47 | 合规筛查覆盖集成的报价流程，数据源为 NEAR Intents AML、Binance AML、AMLBot & PureFi、TRM Labs，覆盖程度因路径而异 | [38] risk-and-compliance | observed | M |
| I48 | 2026-10-01 官方称事件由“Omni deposit and withdrawal infrastructure interaction with NEAR Intents smart contract”的 bug 引起，初步损失约 $3.8M，合约侧已修补，11 条链存取款再暂停约 12 小时 | [39] @near_intents 2105642219357241796 | observed | E、F12、P |
| I49 | 资金于 2026-10-02 全额归还（14:30 UTC），调查终止 | [40] Polosukhin；[41b] Shevchenko | observed | F12 |
| I50 | 事件公告中停用的 11 条链与 HOT Bridge 支持链完全一致，公告里的“Omni”很可能指 HOT/Omni 基础设施 | 由 [39] 的停用链列表与 [30] 的 HOT Bridge 支持链（“HOT/Omni protocol”）逐一对比推出 | inferred | F12 |
| I51 | 事件根因与 NEP-245 存入回调（`mt_resolve_deposit`）的退款量检查或批量 token 数量上限有关 | [42] #362“refunded amount check in mt_resolve_deposit”、#364“limit number of batch tokens”的时间与内容，官方未确认 | speculative | F12、R |
| I52 | 截至 2026-10-07，官方承诺的详细事件报告尚未发布 | [39] 承诺“following days”；2026-10-07 检索未找到；[S3] 二手称 10-04 前未发布 | inferred | |
| I53 | 把需要原子性的余额集中到一个合约，是为了绕开 NEAR 异步跨合约调用、在单个 receipt 内完成多方结算 | 由 [5][10] 的单 receipt 回滚与 [20]“跨合约调用异步、不保证顺序”推出，文档未明说动机 | inferred | F2 |
| I54 | `intents.near` 作为单个账户位于单个 shard，所有结算串行执行，吞吐受该 shard 与单合约 gas 限制 | 由 NEAR“一个账户属于一个 shard”的模型与 I1 推出；[42] #364 引入批量上限 | inferred | F3 |
| I55 | wallet 合约基于 NEP-616 确定性 AccountId 与 NEP-591 global contract，支持 extension 与 passkey，且未经审计 | [18b] wallet README；[43] wallet v0.2.0 release | observed | |
| I56 | escrow-swap 是确定性、参数不可变的托管交换合约，支持部分成交与到期关闭，关闭后自删除 | [18a] escrow-swap README | observed | |
| I57 | global-deployer 实现“owner 批准 code hash、任何人上传 wasm”两步部署；outlayer-app 记录每个 app 的 code hash 与 URL；treasury-logger 只记录 NEP-245 转入事件 | [18c][18d][18e] READMEs | observed | |
| I58 | `far.rs` 只用于 FAR 链，提供管理员批量强制增删公钥的能力 | [14] contracts/defuse/src/far.rs | observed | F1 |
| N1 | NEAR AI Cloud 提供 OpenAI 兼容的推理 API（cloud-api.near.ai），覆盖 chat、responses、embeddings、rerank、图像、音频 | [7][8] docs llms.txt 端点清单；首页 “OpenAI-compatible API” | observed | F8、N |
| N2 | 模型分三档路由：Confidential TEE / 3P Confidential TEE / Incognito | [5] Available Models；[9] ToS 定义 Private TEE / Attested 3P / Incognito Route | observed | F8、N |
| N3 | Incognito 路由的模型在提供方基础设施上、不在 TEE 里，TEE 的隐私与可验证性保证不覆盖上游 | [5] “runs on the provider's infrastructure, outside a TEE” | observed | F8、N |
| N4 | Gateway 运行在自己的 TEE 里，再转发到模型 TEE | [1] “Gateway mode … runs in its own TEE before forwarding to the model TEE”；[20] | observed | F8、C |
| N5 | Private LLM Node 规格是 8×H200 + Intel TDX CPU，由 Private-ML-SDK 负责执行、attestation 和签名 | [1] Architecture Overview | observed | F8、N |
| N6 | Private ML SDK 基于 NVIDIA GPU TEE（H100/H200/B100）+ Intel TDX，推荐用 dstack-vmm 部署 | [21] README | observed | F8 |
| N7 | Private ML SDK 由 Phala Network 与 NEAR AI 合作构建（2025-01-19 博客） | [10] 博客索引中该文的摘要 | observed | F8 |
| N8 | attestation 验证以客户端生成的 32 字节 nonce 起步，并以已验证的 quote 作为事实来源 | [2][4] | observed | F8 |
| N9 | NEAR 报告的 report_data 为 64 字节：前 32 字节绑定签名身份（或身份‖TLS 指纹的 SHA-256），后 32 字节是 nonce | [4] “Read NEAR report data” | observed | F8 |
| N10 | 验证还包括：重放 event_log 核对 RTMR3；MRCONFIGID = 01‖SHA256(app_compose)‖15 个零字节 | [2][3][4] | observed | F8 |
| N11 | GPU 证据（nvidia_payload）送 NVIDIA NRAS 验证，要求 x-nvidia-overall-att-result=true | [4] | observed | F8 |
| N12 | 响应签名的 signer 必须与事先保留的已验证报告唯一匹配，事后拉取的报告不能替代 | [2][3] | observed | F8 |
| N13 | 同一模型的不同实例（包括测量配置不同的实例）共享一把签名密钥，signer 匹配不能证明是同一实例 | [3] Warning 原文 | observed | F8、N |
| N14 | gateway_attestation 不是模型环境的证据 | [2] 首段 | observed | F8 |
| N15 | 官方自述：prefix cache 跨客户共享，响应时延可能泄露某个前缀是否被处理过；Gateway 保留 usage logs | [20] “What remained” 节 | observed | F8、N |
| N16 | 官方自述：attestation 不证明代码没有 bug，安全性依赖 Intel / NVIDIA 的硬件与证明体系 | [20] “What this doesn't prove” | observed | F8、N |
| N17 | 经 OpenRouter 访问 NEAR AI 不算机密推理（前置 gateway 没有 attestation） | [19] | observed | F8、N |
| N18 | 首页“我们永远看不到明文”的宣传强于技术文档：不使用 E2EE SDK 时，Gateway CVM 会处理明文内容 | 由 [8]、[20] 推出：首页称 client-held keys / never see plaintext，而 [20] 说明 TLS 在 Gateway 终止，只有 E2EE 时 Gateway 才看不到内容 | inferred | F8 |
| N19 | 2026-08-12 起集成 Intel Trust Authority，作为独立于运营方的 attestation 验证器 | [10] 博客索引 | observed | F8 |
| N20 | 关于 attestation report 是否需要账户，官方说法矛盾：API 参考写需要 API key，OpenRouter 博客写不需要账户 | [7] “Requires an API key”；[19] “free and needs no account” | observed | F8 |
| N21 | 推理不在链上执行；计费在 cloud-api 中以 nano-USD 记账，资金收入走独立的 billing service | [7] billing / admin 接口描述；[1] 架构里没有链上组件 | observed | F1、F8、A |
| N22 | 2026-01-20 起可通过 HOT Pay 用 NEAR 和其他加密货币支付推理 | [11] | observed | F8 |
| N23 | Staking for Inference：质押收益（不是本金）换算成 credits，1 credit = 1 美元，按秒累计 | [6] | observed | F8 |
| N24 | Staking Rewards 在协议层直接流向 NEAR AI，NEAR AI 不托管本金，validator 由 NEAR AI 或第三方运营 | [9] ToS 定义 | observed | F8 |
| N25 | 质押也可用于 IronClaw 托管：质押 NEAR ÷ 100 = 每月美元 credits，≥50 NEAR 可启动第一个 agent | [18] | observed | F8 |
| N26 | NEAR AI 支持用 NEP-413 钱包签名换取 session token（/v1/auth/near，recipient cloud.near.ai） | [27] session.rs#L31-L49 | observed | F8、C |
| N27 | 没找到证据表明 NEAR AI Cloud 把 attestation 写到链上，或用 CKD / MPC 管理密钥 | 由 [1]–[7]、[37] 推出：验证文档全部是客户端验证流程；CKD 博客没有提到 NEAR AI | inferred | |
| N28 | NEAR AI Cloud 的签约主体是 Jasnah, Inc. d/b/a NEAR AI | [9] ToS 首段 | observed | N |
| N29 | IronClaw 是受 OpenClaw 启发的 Rust 重写，在 WASM 沙箱、PostgreSQL、安全设计上与 OpenClaw 不同 | [23] README#L325-L334 | observed | F8、N |
| N30 | IronClaw 的 WASM 工具能力默认关闭；secrets 不暴露给 WASM，由宿主边界注入；输出做泄露扫描 | [25] tool.wit#L1-L12；[23] README#L206-L220 | observed | F8、N |
| N31 | IronClaw 的 HTTP 只能访问 allowlist 中的 host / path，请求与响应都做泄露扫描，并有速率与资源限制 | [23] README#L206-L220；[30] network policy | observed | F8 |
| N32 | IronClaw 的审批服务签发有作用域的 capability / authorization lease | [29] approvals lib.rs#L1-L5 | observed | F8 |
| N33 | ironclaw_secrets 的注释写明，运行时注入要由上层组合层消费这些原语后才强制生效 | [31] lib.rs#L2-L8 | observed | F8 |
| N34 | IronClaw 1.0 于 2026-07-27 发布：单一 guard 检查点、敏感动作需显式批准、secrets 默认一次性 | [10][17] | observed | F8、N、P |
| N35 | IronClaw 1.0 自报 PinchBench 93.5%、ClawBench 88.6%、OfficeQA 76.4%（基座模型 deepseek-v4-flash） | [17]（自报，未独立复核） | observed | F8 |
| N36 | IronClaw 默认 LLM 后端是 NEAR AI（cloud-api.near.ai），也支持 OpenAI / Anthropic / Ollama / Bedrock 等 | [26] lib.rs#L1-L10；[28] resolution.rs#L518-L541 | observed | F8、N |
| N37 | IronClaw 可以本地安装，接任意提供方；托管版运行在 NEAR AI Cloud TEE 内 | [23] 安装节；[14] “deployed inside encrypted TEEs on NEAR AI Cloud” | observed | F8 |
| N38 | IronClaw 核心 workspace 中没有 NEAR 钱包、Intents 或 Chain Signatures 模块；与链的集成只有推理后端和 NEP-413 登录 | 由 [24]、[26]、[27] 推出：members 列表里没有相关 crate，读到的 NEAR 代码只在 ironclaw_llm 中 | inferred | F8、N |
| N39 | IronClaw GitHub 有 12,640 stars、1,482 forks，仓库创建于 2026-02-03（2026-10-07 API 快照） | [33] | observed | |
| N40 | IronClaw 最新 release 是 v1.4.1（2026-09-29），各资产 GitHub 下载量为两位数 | [34] | observed | |
| N41 | IronClaw 已部署给 NEAR Foundation 与 NEAR AI 全体员工（每人一个 agent） | [17] 自述 | observed | |
| N42 | Shade Agent = TEE 中的 agent + 链上 agent contract（attestation / measurements / PPID 准入、guardrails）+ Chain Signatures 签名 | [36] framework-overview.md、README | observed | |
| N43 | Shade Agent 默认部署在 Phala Cloud / Dstack，框架未经正式审计 | [36] | observed | |
| N44 | 2026-04-19 之后 Shade Agent Framework 不再作为独立开发工具维护，使用者需自行维护 | [35] | observed | F8 |
| N45 | 官方没有说明 Shade Agents 停止维护的原因；IronClaw 托管是否是其替代品没有一手证据 | 由 [35]、[14] 推出：弃用页面没有给原因，IronClaw 发布文也没提 Shade | inferred | |
| N46 | NEAR AI Agent Market 于 2026-02-04 发布：任务竞标、escrow、以 NEAR 支付、dispute agent，基于 NEAR Intents | [13] | observed | F8、C |
| N47 | 2026-05-14 起，USDC 经 Confidential Intents 在 Agent Market 上线，官方称 Confidential Intents 由 “NEAR private shard” 驱动 | [16] | observed | F8 |
| N48 | 没找到 Agent Market 或私有 USDC 支付的交易量数据 | 由 [13]、[16]、[10] 推出：所有相关官方文章都没有数字 | inferred | F8 |
| N49 | NEAR Foundation 已加入 x402 Foundation | [38] near.org 页面标题与 meta description | observed | |
| N50 | NearDeFi/agent-payments-skill 提供 x402 支付（Base 上的 USDC），可经 NEAR Intents 跨链充值 | [39] | observed | |
| N51 | Illia Polosukhin 是 “Attention Is All You Need”（2017）合著者，自述在 NEAR 构建 user-owned AI | [40] | observed | |
| N52 | NEAR 起源于 2017 年创立的 NEAR.ai（program synthesis） | [41]（只读到 near.org 原文的搜索摘要） | observed | |
| N53 | NEAR AI 官方称 Illia 为 “Founder of NEAR AI” | [15] | observed | |
| N54 | NEAR AI Cloud 于 2025-12-03 发布；2026-02-02 起在 TEE 中托管 OpenClaw（beta，可用 NEAR 或银行卡订阅） | [10][12] | observed | |
| N55 | 已公开的 NEAR AI Cloud 集成方：OpenMind、Venice、Abound、百慕大政府、Corbits、SayGm、OpenRouter；没有调用量数字 | [10][15][19] | observed | |
| N56 | CKD 的设计面向 TEE 应用：开发者合约验证 attestation → MPC contract → MPC 网络返回加密密钥 | [37] | observed | |
| N57 | NEAR AI 产品是否实际使用 CKD 无法确认 | 由 [37]、[1] 推出：CKD 博客与 NEAR AI 文档互不引用 | speculative | F8、K、R |
| E1 | 2026-10-06 NEAR 链交易数 909,765，活跃账户 124,809，新建账户 8,773 | [9] nearblocks /v1/charts 2026-10-06 行 | observed | F10、D、O |
| E2 | 2026-10 主网平均出块时间约 0.59 s | [10] avg_block_time 0.5941；[9] 2026-10-06 blocks 146,811 | observed | |
| E3 | 约 600 ms 出块在 2025-05-01 到 05-15 之间上线 | 由 E2 同源 [9] 推出：日出块数从 73,583（05-01）升到 138,149（05-15），对应约 1.17 s → 约 0.63 s | inferred | |
| E4 | DefiLlama 口径下 NEAR 链 TVL 约 2.307 亿美元（2026-10-07） | [1] tvl 230,688,765 | observed | O |
| E5 | DefiLlama 的 NEAR DEX 24h 汇总 1.383 亿美元中约 85% 是 NEAR Intents（Bridge 类） | 由 [2] 推出：117,176,998 / 138,277,666 ≈ 0.85 | inferred | |
| E6 | NEAR L1 gas 费 30 天约 14.09 万美元、1 年约 124 万美元 | [6] total30d 140,867；total1y 1,243,718 | observed | D、O |
| E7 | DefiLlama 链 fees 方法论为 70% 销毁、30% 给合约开发者；2.14.0 将取消 30% 返还，但还没有上主网 | [6] methodology；[32] 2.14.0 RemoveGasRewards；[34] 2.14 只有 RC | observed | |
| E8 | NEAR Intents 30 天 volume 44.15 亿美元，累计 323.5 亿美元（DefiLlama） | [5] total30d 4,414,741,164；totalAllTime 32,345,345,299 | observed | F9、D、O |
| E9 | NEAR Intents 30 天 fees 738.4 万美元，revenue 192.6 万美元 | [3] total30d 7,384,225；[4] total30d 1,926,082 | observed | F9、D、O |
| E10 | Intents 30 天综合费率约 16.7 bps，协议留存约占 fees 的 26% | 由 E8、E9 推出：7.384M / 4,414.7M ≈ 16.7 bps；1.926M / 7.384M ≈ 26% | inferred | F9 |
| E11 | 官方 explorer 显示 Intents 30 天 volume 32.64 亿美元、累计 309.2 亿美元，比 DefiLlama 低约 35% / 4.6% | [11] 30D 3,264,206,005；All time 30,924,902,331；与 [5] 对比 | observed | D、O、R |
| E12 | Intents 30 天 fees 约为 NEAR L1 gas 费的 52 倍 | 由 E6、E9 推出：7,384,225 / 140,867 ≈ 52 | inferred | F9、D |
| E13 | Explorer 24h 最大 referral 是 SwapKit（8,845 笔 / 1,528 万美元），其次是 Rango、ZODL、stableflow、LI.FI | [11] 24h Largest Volume Referrals | observed | F9 |
| E14 | Explorer 24h 最大 affiliate 是 NEAR 回购钱包 `buybacks.multisignature.near`（5,194 笔 / 1,274 万美元，约占 24h 总量 13.6%） | [11] Affiliates 表；12.74M / 93.98M | observed | O |
| E15 | Ledger 通过 SwapKit 接入 Intents，在 explorer 中记为 `ledgerswapkit.near` affiliate | [20] Ledger 博客；[11] affiliate 表 | observed | F9 |
| E16 | Brave Wallet 在 v1.88 集成 NEAR Intents | [19] “in our latest browser release (v1.88)” | observed | F9 |
| E17 | Brave 的 110M MAU 是渠道触达量，不能当作 Intents 用户数 | 由 [19]（Brave 自报 MAU）和 [11]（explorer 没有用户口径）推出：两个数字的口径不同 | inferred | O |
| E18 | Intents 协议费 1 pip；near-intents.org 前端费 0.2%，进入 `fefundsadmin.sputnik-dao.near` | [13] fees.md | observed | |
| E19 | 1Click 有 API key 且不带 appFees 时收 20 bps（稳定币对、同资产跨链为 1 bp）；没有 key 时加 25 bps；带 appFees 时 50/50 分成，1Click 一半最低 20 bps | [13][14] | observed | |
| E20 | 自 2026-02-23 起，Intents 协议收入用于在公开市场回购 NEAR（不销毁） | [3] HoldersRevenue 方法论 | observed | F9 |
| E21 | 2026-02-23 Intents 启动对第三方分发渠道的自动默认分成 | [39] @near_intents X（检索片段） | observed | F9 |
| E22 | revenue.near.org 显示累计 fees 5,342 万美元；三个收入钱包按 NEAR 计的占比为 48.8% / 36.6% / 14.7% | [12] | observed | |
| E23 | Intents docs 列出 32 条支持链，revenue.near.org 写 33 条，Brave 公告写 35 条 | [15][12][19] | observed | |
| E24 | 1Click tokens 接口返回约 200 个以上 asset 条目 | [16] 按 "assetId" 计数约 204（计数工具可能截断） | observed | |
| E25 | Rhea Lend TVL 约 1.96 亿美元，Rhea Dex 约 3,138 万美元 | [7] rhea-lend 195,933,103；rhea-dex 31,380,974 | observed | O |
| E26 | Meta Pool（NEAR）TVL 约 1.21 亿美元，LiNEAR 约 1.19 亿美元 | [7] meta-pool-near 120,896,041；linear-protocol 119,203,259 | observed | |
| E27 | 各协议 TVL 之和超过链 TVL，存在重复计算，不能相加 | 由 E4、E25、E26 推出：1.96 + 0.31 + 1.21 + 1.19 ≈ 4.67 亿 > 2.31 亿 | inferred | |
| E28 | Rhea Lend 30 天 fees 18.2 万美元、revenue 4.56 万美元；Rhea Dex 30 天 fees 89.1 万美元 | [8] | observed | |
| E29 | Rhea Lend 日 fees 从 2025 年中约 1.8–2.5 万美元降到 2026-10 的约 0.5–0.8 万美元 | [8] totalDataChart（2025-06 约 18–28k，2026-10 约 5–8k） | observed | O |
| E30 | Aurora 链 TVL 只有约 446 万美元 | [1] Aurora tvl 4,461,290 | observed | |
| E31 | 2024-06-14 NEAR 日活账户约 224 万，日交易约 719 万 | [9] | observed | F10、D、H、O |
| E32 | 2026-04-01 到 04-15 链上活动断崖：txns 从 3.76M 降到 0.76M，active_contracts 从 219 万降到 9.5 万 | [9] 对应日期行 | observed | |
| E33 | E32 的断崖与 Sweat 2026-04 安全事件或某个批量建户应用停止有关 | 由 [9]（断崖时间）、[18]（2026-04 安全事件）、[8]（Rhea Lend 04-20 到 05-11 fees 为 0）在时间上的重合推出，没有一手归因 | speculative | F10、R |
| E34 | 2023-12-01 NEAT 铭文让单日交易达到 13,935,402 笔，gas 费约 17.3 万美元，是历史最高 | [9] txns 13935402、txn_fee_usd 173,070；[6] 173,071 | observed | |
| E35 | Sweat Wallet 和当前形态的 SWEAT 将于 2026-12-30 结束；原因包括经济模型不可持续、下架、2026-04 安全事件成本、增长放缓 | [18] | observed | E、F10、P |
| E36 | Sweat Wallet 账户都是 NEAR 账户，其 EVM 余额依赖 NEAR Chain Signatures | [18] “Every Sweat Wallet account is a NEAR account”；“accessible for as long as NEAR Chain Signatures operate” | observed | F10、O |
| E37 | nearcore 1.39.0 专门为 Sweat 和 KaiChing 合约优化了 prefetcher | [32] 1.39.0 Non-protocol Changes | observed | J |
| E38 | HOT Wallet 用户数超过 3,000 万 | [44] 二手转述，属于自述，未经审计 | speculative | R |
| E39 | NEAR AI 和 Confidential Intents 没有公开的用量数据（截至 2026-10-07） | [36] 博客首页没有指标；[11] explorer 不拆分 confidential | observed | O |
| E40 | NEP-366 meta tx 的动机点名 Sweatcoin、NEARCrowd、Aurora Plus；1.32.0 稳定 | [22] Motivation；[32] 1.32.0 | observed | F11、P |
| E41 | NEP-519 yield/resume 的动机以 MPC 签名合约（即 Chain Signatures 的需求）为例 | [24] Motivation | observed | F11、P |
| E42 | NEP-591 global contracts 的动机是 Chain Signatures 智能钱包和企业 onboarding 退款滥用；2.6.0 实现 | [26] Motivation；[32] 2.6.0 | observed | F11、P |
| E43 | NEP-635 P-256 的动机是 Near Intents passkey 和 TEE attestation，但它仍是 Draft，CHANGELOG 中没有上线记录 | [29] 文件头与 Motivation；[32] 2.10–unreleased 中没有 p256 | observed | F11、P |
| E44 | NEP-641 链下授权标准的目标场景包括 MPC 签名请求和 confidential swap intent | [31] Target use cases | observed | F11、P |
| E45 | gas keys（NEP-611）的动机是 SPICE 异步执行下的 DoS，不是某个产品 | [27] Summary/Motivation | observed | F11、P |
| E46 | gas keys、动态分片、ML-DSA-65 随 2.13.0（v86）上主网，投票从 2026-07-20 开始 | [32] 2.13.0；[33] GasKeys/DynamicResharding/PostQuantumSignatures => 85；[34] 投票时间 | observed | |
| E47 | 拥塞控制（NEP-539）是由 2023-12 铭文拥塞触发的 | 只有时间先后：[9]（2023-12 尖峰）、[25]（2024-03-21 创建，动机没有点名事件） | speculative | |
| E48 | SPICE 仍是计划，还没有进入主网稳定特性 | [33] Spice => 180（nightly 之外）；[35] 2026-09-30 只是 Part 1 介绍 | observed | P |
| E49 | DelegateV2 在 2.13.0 引入，2.14.0 因与 SPICE pending 队列冲突而移除 | [32] 2.13.0 与 2.14.0 条目 | observed | P |
| E50 | Shade Agent Framework 在 2026-04-19 之后不再维护 | [37] | observed | O |
| E51 | 官方《History of NEAR》没有提及 BOS，说明 BOS 叙事已被淡化 | 由 [21]（全文没有 BOS）和 [45]（GPT 的 BOS 链接 404）推出 | inferred | P |
| E52 | NEAR 起源于 2017 年的 NEAR AI（程序合成），2018 年转向区块链 | [21] | observed | E、P |
| E53 | NEAR Intents 于 2024-11 以 beta 推出，官方称其建在 Chain Signatures 之上；DefiLlama 数据从 2024-12-10 开始 | [21]；[5] 最早数据点 | observed | E、P |
| E54 | Chain Signatures 于 2024-08 上主网 | [41] near.org 博客检索片段 “Since the mainnet launch … in August 2024” | observed | E、P |
| E55 | Stateless validation 和拥塞控制随 nearcore 2.0.0 上线（Nightshade 2.0，二手称 2024-08-22） | [32] 2.0.0；[47] 二手日期 | observed | E、P |
| E56 | IronClaw 1.0 于 2026-07-27 发布，私有 USDC agent 支付于 2026-05-14 发布 | [36] | observed | |
| E57 | Defuse Labs 是 NEAR Intents 背后的团队 | [19] Brave 公告中 “CEO of the team behind NEAR Intents, Defuse Labs” | observed | |
| E58 | 2026-10-01 Intents 约 380 万美元事件，资金次日返还 | [38] @near_intents X（检索片段）；[40] CoinDesk（转述） | observed | |
| E59 | 2026-10-01 事件涉及的 “Omni” 组件是 HOT Bridge（BNB 上的 treasury） | 只有二手报道称 USDT 从 HOT Bridge treasury 流出，没有一手复盘 | speculative | |
| O1 | 2026-10-07 主网是 ShardLayout V3，10 个分片，last_split 为分片 5（拆成 12、13） | [1] RPC EXPERIMENTAL_protocol_config | observed | F3、A、D |
| O2 | 主网静态布局的边界依次加入了 tge-lockup.sweat（PV 64）、game.hot.tg（PV 65）、game.hot.tg-0（PV 75）、earn.kaiching（PV 76）、650（PV 78） | [2] epoch_configs/mainnet/*.json@090da31 | observed | F11、F3、J、P |
| O3 | PV 75 起 game.hot.tg 单独占一个分片（区间 [game.hot.tg, game.hot.tg-0) 只含这一个账户） | 由 O2 与 [4] NEP-639 Split B（追加 -0）推出 | inferred | |
| O4 | PV 85 的主网 epoch config 改为动态布局：内存阈值 40 GB、子分片下限 10 GB、最多 10 个分片、两次拆分至少间隔 2 个 epoch | [3] 85.json dynamic_resharding_config | observed | F3、D、J |
| O5 | PV 86 之后主网已自动拆分过一次（9 → 10，新边界 wallet.ka），目前已到上限 10 | 由 O1、O2（wallet.ka 不在任何静态布局）、O4（max 10）推出 | inferred | F3、J |
| O6 | 分片边界围绕 Sweat、HOT、KaiChing、Aurora 等产品合约设置，说明产品热点直接影响了分片布局 | 由 O2 与 [5] 1.39.0 sweat/kaiching prefetcher 推出 | inferred | F11、P |
| O7 | 主网 v1.signer 有 4 个 domain：0 CaitSith/Sign、1 Frost/Sign、2 CKD、3 CaitSith/ForeignTx，门限都是 11，参与者 17 个 | [6] RPC call_function v1.signer state | observed | F1、F5、A、K |
| O8 | 截至 2026-10-07，NEAR Intents（1Click）支持的 37 个链中没有 Mantle | [7] /v0/tokens；[8] chain-support | observed | F13、Q |
| O9 | NEAR Intents 评估新链看用户需求、技术兼容、流动性与审计，优先考虑已有做市商流动性和兼容的签名标准 | [8] chain-support “Request new chains” | observed | F13、Q |
| O10 | Mantle 接入 NEAR Intents 的门槛主要在需求与做市商流动性，不在技术 | 由 O9 与 I15（已支持 erc191 签名）推出：Mantle 是 EVM 链 | inferred | F13、Q |
| O11 | Mantle 是 Stage 0 rollup，状态由 OP Succinct 有效性证明验证，2026-04-16 起数据发到 Ethereum blobs，gas 代币为 MNT | [9] L2BEAT（经 arbitrum-asset-freeze notes-mantle §1） | observed | Q |
| O12 | NEAR 的协议改动中，账户 / 授权层与容量热点由产品拉动，共识与执行层由协议自身的扩展性和安全目标驱动 | 由 E40–E45、A9、A31、O6 推出 | inferred | F1、F11、P |
| O13 | NEAR 的迭代顺序是 infra 先铺能力（Chain Signatures 2024-08）、产品后筛选需求（Intents 2024-11 建在其上）、需求再反推 infra（NEP-635、NEP-641） | 由 E53、E54、E43、E44 推出 | inferred | F11、P |
| O14 | Mantle 可以把“从任意链 / 钱包获取 Mantle 核心资产”做成被钱包和聚合器分发的报价接口 | 由 E12、E13–E16、E21 推出（Intents 的收入来自服务层与渠道分发） | inferred | Q |
| O15 | Mantle 是同步 EVM，不需要照搬 verifier 托管账本来获得原子结算 | 由 I53（verifier 集中余额是为了绕开异步）与 Mantle 的 EVM 同步调用语义推出 | inferred | Q |
| O16 | 对 Mantle 而言，私有 RFQ 分发比私有链更早可以验证隐私需求 | 由 I43（Confidential Intents 对运营方不保密）、I34（需要许可制私有链和桥）推出 | speculative | Q、R |
| O17 | 对 Mantle 而言，agent 的受限执行与支付比“AI 上链”更现实 | 由 N21、N26、N38、N46 推出（NEAR AI 的链上接点只有登录、支付和结算） | speculative | Q、R |
| O18 | NEAR 日活账户从 2024-06 的约 224 万降到 2026-10 的约 12.5 万，大规模建户不等于持续需求 | 由 E31、E1、E35 推出 | inferred | Q |
| O19 | Mantle 正在探索的方向包括代币化股票 launchpad、JIT 路由、L2↔L3 原子同步、链抽象 + 意图 + 预测市场、小区块出块优化 | [11]–[15] 内部资料（brief 范围内由用户确认） | observed | H |
| O20 | Confidential Intents 的资产 unshield 回公链后，出金到外链仍走公链的桥（Omni 出站由 MPC 签名） | 由 I35（unshield 回到公链 Treasury / intents.near）与 C48（Omni 出站由 MPC 签名）推出 | inferred | C |
| E60 | 2023 年 NEAR 提出 “Chain Abstraction” 叙事 | [21] near.org《History of NEAR》（notes-ecosystem 图的素材 A） | observed | P |
| E61 | 2024-05 NEAR Foundation 宣布聚焦 User-owned AI | [21] near.org《History of NEAR》（notes-ecosystem 图的素材 A） | observed | P |

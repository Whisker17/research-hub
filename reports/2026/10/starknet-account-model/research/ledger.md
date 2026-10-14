# 论断台账

每条会出现在 explainer 里的论断，都要在这里有一行。
类型：observed（直接观察到，有一手证据）/ inferred（由证据推出）/ speculative（推测，需在页面上标明）。

本表合并五路调研。前缀对应分册，证据里的 `[n]` 指该分册“来源”一节的第 n 条：
- **A** → `notes-account.md`（账户模型与 EVM 对照）
- **C** → `notes-crypto.md`（密码学组件清单与 Falcon-512）
- **R** → `notes-roadmap.md`（PQ 路线图、L1 转型与 Ethereum 对照）
- **S** → `notes-strk20.md`（STRK20 隐私协议）
- **W** → `notes-shadow.md`（Shadow Account）
- **X** → `notes.md` §综合（主会话跨路推论，均为 inferred / speculative；写稿时按需补充）

外部调研 `starknet-account-model.md`（ChatGPT Deep Research）只当线索使用。

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| A1 | INVOKE 调 `__validate__`，DECLARE 调 `__validate_declare__`，DEPLOY_ACCOUNT 调 `__validate_deploy__` | [2] account_transaction.rs#L157-163@54f97a8a；[7] Flow 一节 | observed | F1 |
| A2 | 协议以 caller_address = 0 调用验证入口 | [2] account_transaction.rs#L1026@54f97a8a | observed | F1 |
| A3 | Cairo 1 账户的验证入口必须返回 felt `'VALID'`，否则交易无效 | [2] account_transaction.rs#L1043-1061；[4] constants.rs#L21-23@54f97a8a | observed | F1 |
| A4 | INVOKE v3 执行阶段以 caller = 0 调 `__execute__`，calldata 与 `__validate__` 相同 | [6] transactions.rs#L299-322；[2] #L178-179@54f97a8a | observed | F1 |
| A5 | DEPLOY_ACCOUNT 先运行 constructor，再运行 `__validate_deploy__`，constructor 处于 validate 上下文 | [2] account_transaction.rs#L653-669@54f97a8a；[7] | observed | F1 |
| A6 | L1_HANDLER 直接调用目标合约的 l1_handler 入口，不经过账户验证 | [6] transactions.rs#L111-130@54f97a8a；[8] | observed | F1 |
| A7 | 验证阶段 Cairo steps 上限为 1,000,000（v0.13.0–v0.14.5 相同） | [1] versioned_constants_0_14_4.json#L13@54f97a8a；[7] | observed | F1 |
| A8 | 验证阶段 Sierra/L2 gas 上限为 100,000,000（v0.13.4 起，此前为 10^10） | [1] 0_14_4.json#L153 与“命令与输出”中的版本对比；[7] | observed | F1 |
| A9 | 验证阶段禁止对其他合约 `call_contract` | [3] hint_processor.rs#L532-539、native/syscall_handler.rs#L511-517@54f97a8a；[7] | observed | F1 |
| A10 | 验证阶段禁止 `get_class_hash_at`、`meta_tx_v0` 和对最近区块的 `get_block_hash` | [3] syscall_base.rs#L225-227,#L295-297,#L144-160@54f97a8a | observed | F1 |
| A11 | v0.14.0 起验证阶段（含 DEPLOY_ACCOUNT 的 constructor）禁止 deploy syscall | [1] 0_14_*.json `disable_deploy_in_validation_mode: true`；[3] syscall_base.rs#L512-517；[7] | observed | F1 |
| A12 | 验证阶段 block_number 向下取整到 100 的倍数、timestamp 取整到 3600 秒、sequencer_address 为 0 | [3] context.rs#L180-200@54f97a8a；[1] 0_14_4.json#L147-149；[7] | observed | F1 |
| A13 | 验证限制的目的是防止免费 DoS 与 mempool 污染 | [7] Limitations 一节 | observed | F1 |
| A14 | 验证失败的交易不收费，`__execute__` 失败为 REVERTED、收费且 nonce 递增 | [7] Failures；[8] L94-97 | observed | |
| A15 | 协议执行层 nonce 严格要求 tx_nonce == account_nonce，执行后 +1 | [2] account_transaction.rs#L478-502@54f97a8a | observed | |
| A16 | mempool 允许 INVOKE / DEPLOY_ACCOUNT 的 nonce 超前至多 200，DECLARE 为 0 | [8] L62-64；[5] stateful_transaction_validator.rs#L284-297 | observed | |
| A17 | 目前没有已上线的 nonce abstraction；SNIP-8 的 channel 设计强制 channel 0 | [7] Account nonces 一节；[13] snip-8.md#L27@1789f44e | observed | |
| A18 | v3 交易对 L1_GAS、L2_GAS、L1_DATA 分别设 max_amount 和 max_price_per_unit（STRK/fri 计价） | [4] fields.rs#L202-210、transaction.rs#L665-678；[9]；[10] | observed | |
| A19 | v0.14.0 起 tip 参与排序，主网交易带非零 tip | [9] INVOKE v3 节；[11] v0.14.0；[37] tip 0x1 | observed | |
| A20 | gateway 拒收 paymaster_data 或 account_deployment_data 非空的交易 | [5] stateless_transaction_validator.rs#L47-48,#L112-150@54f97a8a | observed | F2 |
| A21 | 原生 paymaster 未上线；代付依靠 SNIP-9 outside execution 与 SNIP-29 链下 API | 由 A20 推出：原生字段不可用；[16] SNIP-29 流程用 relayer 提交 SNIP-9 payload；[17] SNIP-20 仍为 Review | inferred | |
| A22 | Argent 与 Braavos 的 `__validate__` 拒绝非空 paymaster_data | [25] argent_account.cairo#L218@c30f61c5；[28] braavos_account.cairo#L423-425@158d7d0b | observed | |
| A23 | 合约地址 = Pedersen(“STARKNET_CONTRACT_ADDRESS”, deployer, salt, class_hash, Pedersen(ctor_calldata)) mod (2^251−256) | [4] core.rs#L307-345@54f97a8a | observed | |
| A24 | DEPLOY_ACCOUNT 计算地址时 deployer = 0 | [4] transaction.rs#L463-472@54f97a8a | observed | |
| A25 | DEPLOY_ACCOUNT 的手续费从新账户地址扣除，部署后 nonce = 1 | [7] Deploying a new account | observed | |
| A26 | 账户 nonce 为 0 且 mempool 已有其 deploy 时，nonce = 1 的 INVOKE 可跳过 validate 预检 | [5] stateful_transaction_validator.rs#L426-460@54f97a8a | observed | |
| A27 | SNIP-6 定义 `is_valid_signature`（返回 `'VALID'`），账户接口 id 为 0x2ceccef7…cc1cd，协议不强制 | [12] snip-6.md#L35,#L112；[24] accounts.cairo#L9@5cf9010e；[7] | observed | F15 |
| A28 | SNIP-12 revision 0 用 Pedersen、revision 1 用 Poseidon | [15] snip-12.md#L38-41@1789f44e | observed | |
| A29 | SNIP-9 outside execution 的签名消息带 caller、独立 nonce、时间窗和 calls | [14] snip-9.md#L34-43,#L97-114@1789f44e | observed | F15 |
| A30 | 账户可通过 `replace_class_syscall` 原地换 class，地址和存储保留 | [21] upgradeable.cairo#L46-49@5cf9010e；[26] upgrade.cairo#L83；[28] braavos_base_account.cairo#L90 | observed | F1、F3 |
| A31 | OZ 预设账户升级只要求自调用，不检查新 class 的接口 | [21] presets/src/account.cairo#L70-73、upgradeable.cairo#L46-49@5cf9010e | observed | F1、F3 |
| A32 | Argent 升级要求自调用、新 class 支持 SRC5 账户接口并实现 perform_upgrade 回调 | [26] src/upgrade.cairo#L68-85@c30f61c5 | observed | F1、F3 |
| A33 | Braavos 升级要求自调用、新 class 支持 ISRC6_ID，可选存储迁移 | [28] upgradable.cairo#L63-80@158d7d0b | observed | F1、F3 |
| A34 | OZ AccountComponent 用 Stark 曲线 ECDSA（corelib check_ecdsa_signature）验证 tx hash | [19] account.cairo#L342-373；[20] signature.cairo#L4,#L21-27@5cf9010e | observed | |
| A35 | OZ `__execute__` 断言 caller 为 0 且交易版本 ≥ 1 | [19] account.cairo#L71-81；[20] utils.cairo#L9-25@5cf9010e | observed | |
| A36 | v0.14.0 起协议对内部调用 `__execute__` 的交易做 revert | [11] v0.14.0 条目；[1] 0_14_4.json#L118；[3] syscall_base.rs#L492-500 | observed | |
| A37 | OZ EthAccount 用 secp256k1 syscall 验签 | [22] eth_account.cairo#L24,#L368-372；[20] signature.cairo#L38-68@5cf9010e | observed | |
| A38 | OZ cairo-contracts 内的 Falcon-512 账户只有 SHAKE-256 的 hint（60 felt）与 direct（31 felt）两种 verifier | [23] verifier_impls.cairo#L31-62@5cf9010e | observed | |
| A39 | 合约可用的密码学原语包括 secp256k1/r1、keccak、sha256 syscall 与 ecdsa、ec_op、pedersen、poseidon、blake builtin | [1] 0_14_4.json#L338,#L446,#L474,#L177-178 与 os_resources/execute_syscalls@54f97a8a | observed | |
| A40 | `Sha512ProcessBlock` 已可在合约中调用 | [1] 只在 versioned constants 的资源表中出现，没有核对 corelib 是否开放 | speculative | |
| A41 | Argent v0.5.0 支持 Starknet、Secp256k1、Secp256r1、Eip191、Webauthn 五类 signer，没有 PQ 类型 | [27] signer_signature.cairo#L14-44@c30f61c5 | observed | |
| A42 | Argent 有 guardian 时普通交易需 owner + guardian 双签，escape 默认安全期 7 天 | [25] docs/argent_account.md#L17；argent_account.cairo#L78@c30f61c5 | observed | F15 |
| A43 | Braavos 部署时默认添加由助记词派生的 Stark signer，Strong Signer 为 secp256r1 | [28] README.md#L40-44@158d7d0b | observed | |
| A44 | Braavos 加了 Strong Signer 后，Stark signer 仍保留时间锁移除和低额度签名的权限 | [28] README.md#L47,#L58,#L101@158d7d0b | observed | F15 |
| A45 | Ready（Argent）App 新建账户默认用 Stark 曲线 signer | [25] 文档示例用 signer type 0x0（Starknet），但没有 App 层一手说明 | speculative | R |
| A46 | 主网有 OZ Falcon-512 账户的演示交易（INVOKE v3，31-felt 签名，SUCCEEDED，ACCEPTED_ON_L1） | [36] migration-register 链接 voyager tx；[37] RPC getTransactionByHash / getTransactionReceipt | observed | F3 |
| A47 | 该 Falcon 演示交易在区块 12,156,522（2026-07-22，v0.14.3），消耗 63,932,548 L2 gas，费用约 1.926 STRK | [37] RPC receipt 与 block 查询 | observed | |
| A48 | 该 Falcon 演示账户是新部署账户，不是从 ECDSA 账户升级而来 | 由 A25、A46 推出：交易 nonce = 0x1，即 DEPLOY_ACCOUNT 后的第一笔交易 | inferred | F3 |
| A49 | 已有账户不会自动变成 PQ，钱包、恢复、托管等需另行迁移 | [36] Accounts 一节 “What remains” | observed | F3 |
| A50 | 已有 Stark-ECDSA 账户可以保留地址升级到 PQ class，但升级授权本身依赖旧 ECDSA 签名 | 由 A30、A31、A34 推出：升级必须经 `__validate__`（ECDSA）授权后自调用 replace_class | inferred | F3 |
| A51 | 换成 PQ class 时如果保留 `is_valid_signature`、guardian、session 等旧签名路径，账户仍受 ECDSA 风险 | 由 A27、A42、A44 推出：这些都是独立于 `__validate__` 的授权路径 | inferred | F15 |
| A52 | 主网当前运行 Starknet v0.14.4 | [37] getBlockWithTxHashes latest → 16357306，starknet_version 0.14.4 | observed | |
| A53 | EIP-7702 的授权通过 ecrecover 恢复 authority | [29] Behavior 第 3 步 | observed | F2 |
| A54 | EIP-7702 允许已委托账户重新委托，委托地址为 0 时清除委托 | [29] Behavior 第 5、8 步 | observed | F2 |
| A55 | EIP-7702 委托后的 EOA 仍可用原私钥直接发起交易 | [29] “Transaction origination” 一节 | observed | F2 |
| A56 | 7702 委托 PQ 代码无法消除原 EOA 私钥的量子风险 | 由 A53、A55 推出：私钥仍能发交易和重新委托 | inferred | F2 |
| A57 | ERC-4337 的 nonce 为 192 位 key + 64 位序号，可多通道并行 | [30] getNonce(address, uint192 key) L180 | observed | F2 |
| A58 | ERC-7562 在验证阶段禁用 TIMESTAMP、NUMBER、BLOCKHASH 等环境操作码，Starknet 则改为取整 | [31] OP-011；[3] context.rs#L180-200 | observed | |
| A59 | EIP-7701 已撤回，RIP-7560、EIP-8141、EIP-8130 为 Draft | [32][33][34][35] frontmatter status | observed | |
| A60 | EIP-8141 以迁移到 PQ 为首要动机，但无代码账户的 default code 仍用 SECP256K1 签名 | [34] Motivation L22-23 与 Default code 一节 | observed | |
| C1 | 官方 Quantum Hub 明确表示 Starknet 不能作为整体被称为抗量子 | [3] Learn 页 “Is Starknet quantum-resistant? No. Not as a single system-wide claim.” | observed | F4 |
| C2 | Migration Register 最后更新于 2026-08-19，各记录核查日期为 2026-07-30 | [1] 页面页脚与内嵌数据 `checkedDate` | observed | F4 |
| C3 | 证明层被登记为 “Structural property”，没有组件级证据记录 | [1] R3 与 Proofs 面 “No component-level evidence record is published” | observed | |
| C4 | Register 写明 STARK 的可靠性仍依赖 FRI / 随机预言假设、所选 hash、生产参数与实现 | [1] R3 limit 字段 | observed | |
| C5 | S-two 实现 Circle STARK，基域为 31-bit Mersenne 素数域 | [23] S-two 博客；[24] S-two Book Introduction | observed | |
| C6 | Hub 时间线称 S-two 自 2025-11 起成为 Starknet 主网生产 prover | [2] Foundations “November 2025 S‑two becomes Starknet's production prover” | observed | |
| C7 | stwo 源码同时提供 Blake2s、Poseidon252、Keccak256 三种 Merkle / channel 实现 | [22] stwo/crates/stwo/src/core/vcs/*.rs、core/channel/*.rs@826591c6 | observed | |
| C8 | 官方没有公开 Starknet 生产证明在 Grover 下的安全位数 | [2][3] 只写“sizing security parameters”；[24] 的 96 bits 是基准配置 | observed | |
| C9 | Pedersen 是 Stark 曲线点线性组合后取 x 坐标 | [5] Cryptography 页公式 | observed | |
| C10 | StarkWare 定性 Pedersen “inherits elliptic-curve assumptions”，BLAKE2 则没有 | [4] 路线图第 1 阶段 | observed | |
| C11 | 量子攻击者可求生成元间离散对数，从而构造 Pedersen 碰撞 | 由 C9、C10 推出：抗碰撞性归约到 ECDLP，Shor 解 ECDLP | inferred | |
| C12 | Starknet 的 Poseidon 基于 3 元素状态的 Hades 置换 | [5] Cryptography 页 | observed | |
| C13 | 外层 state_commitment 用 Poseidon，class 树叶子用 Poseidon | [6] State 页；[1] R5 “outer state commitment and class trie already use Poseidon” | observed | |
| C14 | 合约树与存储树（MPT）仍用 Pedersen | [6] State 页 “binary Merkle-Patricia trie with the Pedersen hash function”；[1] R5 “Planned, not live” | observed | F4 |
| C15 | 合约树 / 存储树改 BLAKE2 是“已发布的路线图方向”，未上线 | [1] R5 status | observed | F4 |
| C16 | 合约地址派生当前为 Pedersen（sequencer 源码，2026-10-13） | [13] core.rs#L322-L341@54f97a8a | observed | F4 |
| C17 | 地址派生改 BLAKE2 被登记为路线图方向 | [1] R6 | observed | F4 |
| C18 | Map 存储槽 = Pedersen(sn_keccak(name), k) | [17] map.cairo#L46-L49@8e2d7141 | observed | |
| C19 | 旧合约存储迁移工具处于研究阶段，没有公开规范或实现 | [1] C1 “no public specification, implementation, released toolkit” | observed | |
| C20 | sn_keccak 是 keccak256 的前 250 bit，用作存储变量基址 | [5]；[17] map.cairo#L121-L123 | observed | |
| C21 | OS config hash 从 v0.14.3 起由 Pedersen（V3）切到 Blake（V4） | [13] core.rs#L103-L130@54f97a8a | observed | F4 |
| C22 | Register 将 OS program / config hash 的 BLAKE2s 构造登记为 v0.14.3 主网已上线 | [1] R4 | observed | F4 |
| C23 | v0.14.3 主网升级维护于 2026-07-08 08:30 UTC 完成（计划日为 07-06） | [9] status 页；[8] 预发布说明 | observed | |
| C24 | compiled class hash 自 v0.14.1（2025-12-10）起改用 Blake | [7] Version Notes v0.14.1 | observed | |
| C25 | sequencer 计算 compiled class hash 默认用 HashVersion::V2（Blake2Felt252） | [14] structs.rs#L53-L59、compiled_class_hash.rs#L18-L22@54f97a8a | observed | F4 |
| C26 | v3 invoke 交易 hash 用 Poseidon；L1 handler 交易 hash 用 Pedersen | [15] transaction_hash.rs#L370-L404、#L481-L522@54f97a8a | observed | |
| C27 | 默认 OZ 账户用 Stark 曲线 ECDSA 验签 | [30] utils/signature.cairo#L27@5cf9010e | observed | |
| C28 | 路线图称 secp256k1/r1 syscall 是量子脆弱的，移除要等以太坊迁移 | [4] Phase 3 “Bridge secp Syscalls” | observed | |
| C29 | secp256 syscall 也被通用账户（OZ EthAccount）用于验签，不只服务于桥 | [19] eth_account.cairo#L21-L24@5cf9010e | observed | |
| C30 | 正常情况下状态差异以 EIP-4844 blob（KZG）发布，可回退 calldata | [1] R8 | observed | S |
| C31 | 2026-10-14 主网最新区块为 v0.14.4，l1_da_mode = BLOB | [11] feeder get_block latest（block 16357214） | observed | F4、S |
| C32 | KZG 被攻破影响 DA 透明性，不影响 STARK 的状态转移可靠性 | [1] R8 limit；[4] Phase 3 | observed | |
| C33 | 文档称 Starknet 排序仍中心化；staking v2 验证者通过 `attest` 交易证明区块 | [28] Staking 页 L9、L109-L115 | observed | |
| C34 | “PQ 共识签名（如 Falcon-512）”在路线图中是对新功能的要求，没有规范或时间 | [4] Phase 1 段末 | observed | |
| C35 | 路线图估计第 1 阶段其余项“approximately two months from start” | [4] Estimated time to completion | observed | |
| C36 | v0.14.4 预发布说明不含树或地址的 PQ hash 迁移 | [10] 论坛 116341 正文 | observed | |
| C37 | 截至 2026-10-14 第 1 阶段剩余项未上线，落后于路线图的约两个月估计 | 由 C16、C31、C35、C36 推出：最新主网 0.14.4 不含此项，源码仍是 Pedersen | inferred | |
| C38 | OZ Falcon 验证：环 Z_q[x]/(x^512+1)，q = 12289，接受条件为 ‖s0‖²+‖s1‖² ≤ 34,034,726 | [18] HINT_VS_DIRECT.md#L15-L21、falcon.cairo#L26@bece5c07 | observed | F5 |
| C39 | Falcon-512 公钥 897 字节、签名 666 字节 | [27] falcon-sign.info 性能表 | observed | F5 |
| C40 | hint 与 direct 只在 s1·h 的获取方式上不同，安全性相同；hint 无法伪造 | [18] HINT_VS_DIRECT.md#L3-L5、#L25-L30、#L64-L66 | observed | F5 |
| C41 | direct 签名 31 felts，hint 签名 60 felts；direct 固定多 10,196,120 L2 gas / 100,927 steps | [18] HINT_VS_DIRECT.md#L43-L56 | observed | F5 |
| C42 | BLAKE2s 与 Poseidon 的 hash-to-point 是非标准的，与 FIPS 206 签名器不互通；SHAKE-256 是标准变体 | [18] hash_to_point.cairo#L23-L26；falcon_512/README.md#L3-L5、L26-L29 | observed | F5 |
| C43 | efficiency_baseline 的 validate 资源：ECDSA 160,795 gas / 1,437 steps；Falcon 各变体 13.6M–61.9M gas | [18] efficiency_baseline.json#L50-L126@bece5c07 | observed | F5、S |
| C44 | baseline 数值口径是“test minus baseline”的资源量，工具链 Scarb 2.18.0 / snforge 0.59.0 | [18] efficiency_baseline.json#L2-L6 | observed | F5、S |
| C45 | 标准 SHAKE-direct 账户 validate 的 L2 gas 约为 Stark-ECDSA 的 385 倍 | 由 C43 推出：61,878,938 / 160,795 ≈ 384.8 | inferred | F5、S |
| C46 | validate 上限为 1,000,000 steps / 100,000,000 Sierra gas（v0.14.4、v0.14.5） | [16] versioned_constants_0_14_4.json#L13、#L153 | observed | F5、S |
| C47 | 5 个 Falcon 变体都在验证上限内；SHAKE 两个变体占 gas 上限的 51.7–61.9% | [18] README.md#L41-L54、L89-L91 | observed | F5、S |
| C48 | 收费口径另算（Sierra ≥ 1.7 类约为资源量的 1.7–2.7 倍）；devnet 上 SHAKE-direct 的 invoke 约 139.9M L2 gas | [18] README.md#L29-L33；pq-accounts/USAGE.md#L141-L152 | observed | F5、S |
| C49 | cairo-pq-verifiers 标注 “Experimental and unaudited” | [18] README.md#L8-L9 | observed | F5 |
| C50 | ML-DSA-44 与 Poseidon-WOTS 在仓库中只是 stub，尚未测量 | [18] README.md#L60-L61 | observed | F5 |
| C51 | OZ cairo-contracts 的 Falcon 账户组件在 CHANGELOG “Unreleased”段（最新发布 4.0.1） | [19] CHANGELOG.md#L10-L21@5cf9010e | observed | F5 |
| C52 | OZ Falcon 账户的 `__validate__` 用 tx_hash + tx signature 调用 Falcon 验证器 | [19] falcon_512/account.cairo#L371-L383@5cf9010e | observed | |
| C53 | Falcon 主网交易 0x72ae4404… 成功，block 12156522，2026-07-22 10:46:25 UTC，转账 0.01 STRK | [11] feeder get_transaction 与 get_block 12156522 | observed | F5 |
| C54 | 该交易签名 31 felts，与 direct 编码长度一致 | [11] signature 长度；[18] HINT_VS_DIRECT.md#L45 | observed | F5 |
| C55 | 该交易 receipt 的 l2_gas 为 63,932,548，fee 约 1.926 STRK | [11] block 12156522 receipt | observed | F5 |
| C56 | Register 将其登记为 Falcon512ShakeDirectAccount，并声明不代表生产就绪 | [1] R2 claim / limit | observed | |
| C57 | starkware-bitcoin/s2morrow 是 Bitcoin 方向的 PQ 签名聚合研究，Falcon 接收预先算好的 SHAKE msg_point，没有账户 | [20] README.md#L1-L20、falcon.cairo#L18-L26@831bb518 | observed | S |
| C58 | feltroidprime/s2morrow 是 Starknet 账户方向的 Falcon，用 Poseidon hash-to-point 与 hint 验证 | [21] README.md（Design / Hash-to-point）@4eff9ab9 | observed | S |
| C59 | NIST 页面写明 FALCON 将以 FIPS 206 发布，状态 “in development” | [25] CSRC PQC Standardization 页 | observed | F5 |
| C60 | FIPS 204（ML-DSA）于 2024-08-13 定稿 | [26] CSRC FIPS 204 页 | observed | |
| C61 | STARK 证明验签执行正确，不能让 ECDSA 签名本身抗量子 | [3] “A post-quantum proving layer does not migrate account signatures by implication.” | observed | |
| C62 | “S2morrow in production on mainnet（2026-04-01）”有官方原文 | 未找到一手出处：搜索引擎被拦截，starkware.co WP API 检索为空 | speculative | R |
| C63 | Poseidon 在量子攻击下的强度与 BLAKE2 相当 | 官方没有对 Poseidon 做 PQ 评级；路线图选 BLAKE2 而非 Poseidon [4] | speculative | K |
| R1 | @Starknet 于 2026-10-08 08:32:54 UTC 发帖：“We are actively considering becoming an L1 … first fully quantum-resistant network, with 2027 as our target.” | [1] x.com/Starknet/status/2108113391525204034 经 api.fxtwitter.com 读取的 text 字段 | observed | F6 |
| R2 | 该推文引用了 Eli Ben-Sasson 08:19:56 UTC 的帖子“Starknet becoming an L1 for post-quantum agility: good idea or bad idea?” | [1] fxtwitter 的 quote 字段；[2] 线程首帖 | observed | F6 |
| R3 | Eli 给出的理由是量子威胁“may be MUCH closer than we think”和 AI，主张“bunker mode” | [2] 线程第 1、3、4 条 | observed | F6 |
| R4 | Eli 原话：“We’re considering multiple options, including becoming an L1”，L1 只是选项之一 | [2] 线程第 7 条（id 2108110155032203410） | observed | F4、F6 |
| R5 | Eli 的论证是：作为 L2，Starknet 依赖 Ethereum 的安全；成为 L1 的好处是“control over the network’s security migrations” | [2] 线程第 7 条 | observed | F4、F6 |
| R6 | Eli 原话：“Ethereum is targeting full L1 quantum resistance by the end of 2029 … Starknet could get there by 2027.” | [2] 线程第 7 条 | observed | F4、F6 |
| R7 | Eli 称这条线程与他当天的 Token2049 演讲有关；本路没有找到演讲的官方视频或文字稿 | [2] 首帖“my Token2049 talk today”；DDG 与 Bing 搜索无有效结果 | observed | F4、F6 |
| R8 | 截至 2026-10-14，starknet-io/SNIPs 没有 L1 转型或 PQ 迁移 SNIP（HEAD 1789f44e，最近 PR #178、#177 与此无关） | [20] git ls-remote HEAD；GitHub API pulls 列表 | observed | F4、F6 |
| R9 | 截至 2026-10-14，community.starknet.io 没有 L1 转型治理提案（最新主题 2026-09-14） | [19] latest.json?order=created；search.json?q=becoming an L1 | observed | F6 |
| R10 | Snapshot 的 starknet.eth 空间最近的投票是 2026-03-30 至 04-06 的社区问卷，没有 L1 投票 | [21] hub.snapshot.org GraphQL 输出 | observed | F6 |
| R11 | “2027 PQ L1”的准确定性是：考虑中加目标年份，没有作出决定，没有规范，没有治理流程 | 由 R1、R4、R8、R9、R10 推出：官方措辞为 considering/target，且三类治理与规范渠道均无记录 | inferred | F6 |
| R12 | 官方没有定义 2027 目标里“fully quantum-resistant”覆盖哪些组件 | [1][2] 原文无范围定义；[3][4] 没有 L1 相关条目 | observed | F6 |
| R13 | 三阶段 PQ 路线图于 2026-06-30 发布，称前两期“fully within Starknet’s control and carry committed time estimates”，第三期依赖 Ethereum | [3] “What the roadmap commits to”一节 | observed | F7 |
| R14 | Phase 1 用 BLAKE2 替换 Pedersen，范围是 state、chain environment、consensus 三层；列出的条目是 contracts/storage tries、合约地址派生、OS config hash | [3] Phase 1 一节 | observed | F7 |
| R15 | Phase 1 的时间估计：“OS config hash live in early July; other items – approximately two months from start.” | [3] Estimated time to completion | observed | F7 |
| R16 | 路线图对共识签名的原文：“all new features will require quantum-safe implementations … implementing consensus signatures onchain using PQ signature schemes, such as Falcon-512”，没有给出时间 | [3] Phase 1 段落后一段 | observed | F7 |
| R17 | Phase 2 的时间估计是“approximately one month after Phase 1 for easy path on StarkWare side; TBD on dapps side”；迁移工具“actively researching” | [3] Phase 2 一节 | observed | F7 |
| R18 | Phase 3 包括 bridge secp syscalls（时间估计“1 month post-Ethereum migration”）和 blob DA/KZG（“Ethereum’s to migrate”） | [3] Phase 3 一节 | observed | F7 |
| R19 | v0.14.3 把 OS program hash 和 config hash 从 Pedersen 换成 Blake（“Quantum-resistant SNOS hash”） | [9] 0.14.3 预发布说明；[4] Migration Register R4 “Live on mainnet · v0.14.3” | observed | F7 |
| R20 | 主网 v0.14.3 升级于 2026-07-08 08:30 UTC 完成（预发布说明的计划日期是 07-06） | [10] status 事件 data-datetime-unix=1783499408000；[9] “Mainnet – 06 Jul 2026” | observed | F7 |
| R21 | 源码以 `OS_CONFIG_HASH_V4_CUTOVER = V0_14_3` 切换到 Blake2Felt252 | [13] sequencer/crates/starknet_api/src/core.rs#L111-L129@54f97a8a | observed | |
| R22 | Migration Register（最后更新 2026-08-19）把 contracts trie、storage tries 和地址派生都登记为“Published roadmap direction … Planned, not live” | [4] 记录 R5、R6 | observed | |
| R23 | 截至 2026-10-13 的 sequencer 主干，合约地址派生仍用 Pedersen | [13] core.rs#L324-L340@54f97a8a | observed | F7 |
| R24 | 截至 2026-10-13 的 sequencer 主干，contracts trie 和 storage trie 的节点哈希仍是 Pedersen，classes trie 用 Poseidon | [14] starknet_committer/src/hash_function/hash.rs#L49-L55、#L83-L88、#L113-L119@54f97a8a | observed | F4、F7 |
| R25 | v0.14.4（主网 2026-10-06 08:13 UTC 完成）不含 trie 或地址派生的 PQ 改动 | [11] 预发布说明全文；[12] status 事件 | observed | F7 |
| R26 | 截至 2026-10-14，Phase 1 只有 OS hash 一项上了主网，其余两项距发布已超过 3.5 个月仍未上线 | 由 R15、R19、R22–R25 推出：06-30 发布，“~two months”的项在 10-06 版本和 10-13 主干中都不存在 | inferred | F7 |
| R27 | 旧合约 storage map 迁移工具处于研究阶段，没有公开规范、实现或工具 | [4] Migration Register C1 | observed | |
| R28 | OZ Falcon512ShakeDirectAccount 于 2026-07-22 在主网完成一笔 0.01 STRK 转账，官方登记为“Demonstrated on mainnet”，实验性、未审计 | [4] 记录 R2；[27] StarkWare 和 OZ 推文的时间戳 | observed | |
| R29 | Quantum Hub Learn 页对“Is Starknet quantum-resistant?”的官方回答是“No. Not as a single system-wide claim.” | [5] learn 页 Selected answer | observed | |
| R30 | “within months”是媒体概括，路线图原文写的是“approximately two months from start” | [31] TQI 原文；[32] 搜索摘要；[3] 原文中没有“within months” | observed | |
| R31 | 文档写明 Starknet 的 state diff 默认以 blob 发布到 Ethereum，calldata 用于“extreme situations” | [17] data-availability.md v0.13.1 一节 | observed | S |
| R32 | 自 v0.14.0（2025-09-01）起，排序由 3 个 sequencer 用 Tendermint 达成共识 | [18] version-notes v0.14.0 | observed | F7 |
| R33 | 文档原话：“Starknet is currently still centralized”；staking 处于 4 期中的第 2 期，验证者只做 attest，block proposing 从第 3 期开始 | [16] staking.md L9、L32-L35、L167 | observed | F7 |
| R34 | sequencer 主干的 Tendermint 投票没有签名（`TODO(Asmaa): sign the vote`，`RawSignature::default()`），也不做验证 | [15] apollo_consensus/src/state_machine.rs#L254-L255、single_height_consensus.rs#L242、manager.rs#L327-L329@54f97a8a | observed | F7 |
| R35 | 共识网络的认证消息 `StarkAuthentication` 用的是 Stark 曲线密钥（`Felt252 operational_public_key`），属于 EC 依赖 | [15] authentication.proto 只显示 Felt252 字段，曲线类型未核实 | speculative | R |
| R36 | 路线图里的“PQ 共识签名”不是替换现有签名，而是在当前没有签名的投票机制上新建一套 | 由 R16、R34 推出：投票签名尚未实现，路线图只说新功能要用 PQ | inferred | F7 |
| R37 | 转成 L1 需要自行提供 PQ 共识、DA、结算和最终性，以及桥上资产的处理方案，官方目前都没有回答 | 由 R11、R18、R31–R34 推出：这些功能现在要么依赖 Ethereum，要么尚未去中心化，且没有 L1 规范 | inferred | F7 |
| R38 | 只要资产仍托管在 Ethereum 的桥上，Starknet 侧的 PQ 化不能消除这些资产在 Ethereum 侧的风险 | 由 R18 推出：路线图自己写明在 Ethereum 迁移前移除 secp syscalls “would break the bridge” | inferred | F7 |
| R39 | 按 2027 时间表交付独立的 PQ 共识（从投票签名到 PQ 签名，再到去中心化验证者）有较大进度风险 | 依据 R26、R33、R34：Phase 1 已经晚于估计，staking 只到 2/4 期；本条是判断，未经验证 | speculative | F7 |
| R40 | EF Protocol 于 2026-09-07 提出目标：到 2029 年 12 月 L1 在 execution、consensus、data 三层抗量子 | [22] “I. The north star” | observed | F8 |
| R41 | EF 把这个 deadline 视为“non-negotiable at least until January 2027”，届时会请外部专家重新评估 | [22] “I. The north star”末段 | observed | F8 |
| R42 | 2026-08-19 的 Strawmap 更新在 J* 加入 MV-PQ（PQ heartbeat、leanDA sampling、leanSPHINCS tx），PQ key registry 放在 I* | [22] “Two cadences to December 2029” | observed | F8 |
| R43 | EF 原话：“MV-PQ is designed to keep Ethereum operating through Q-day with reduced guarantees”；完整经济终局性还需要 PQ attestations | [22] “MV-PQ is a temporary safeguard” | observed | F8 |
| R44 | EF 称“Hegotá is not the PQ fork”；Hegotá 的 SFI 头号项目是 FOCIL 和 EIP-8141 Frame Transaction | [22] “V. The next fork” | observed | F8 |
| R45 | EF 认为共识层不能依赖密码学敏捷性，共识组件要等完整的 PQ 设计后再上 | [22] Post-quantum arc 段 | observed | F8 |
| R46 | pq.ethereum.org 把 PQ blobs 放在 M*，把 full PQ consensus 和 PQ transactions 放在“Longer term”，与 EF 博客的 2029-12 三层目标在时间安排上不一致 | [23] Roadmap 表；[22] | observed | |
| R47 | EIP-8141、7932、8051、7619、8365 在 eips.ethereum.org 上都还是 Draft | [24] 各页面头部“⚠️ Draft” | observed | F8 |
| R48 | “Starknet 2027”与“Ethereum 2029”不是同一口径：前者没有定义范围、没有路径；后者有三层定义、分叉路径和备用方案 | 由 R11、R12、R40、R42 推出 | inferred | F8 |
| R49 | 2029 是 Ethereum 自己设定的完整三层 PQ 目标，日期差不能直接换算成 Starknet 领先两年 | 由 R26、R37、R48 推出：Starknet 的共识、DA、桥都还没有 PQ 方案 | inferred | F8 |
| R50 | Quantum Hub networks 页（StarkWare 制作）给 Starknet 8/8、Ethereum 3/8，并声明不覆盖共识签名、桥和外部依赖 | [6] networks 页的计分和“Assessed scope” | observed | |
| R51 | StarkWare 的 networks 页记载 Algorand 已有原生 Falcon-1024 主网账户，并计划在 2027 年替换共识和 VRF | [6] Algorand 条目（checked 2026-09-28） | observed | |
| R52 | 因为 Algorand 也有 2027 年的目标，Starknet“first fully quantum-resistant network”的说法有竞争者 | 依据 R51，但 Algorand 的信息仅来自 StarkWare 的转述，未查 Algorand 原始资料 | speculative | M |
| R53 | NIST 的 FIPS 203/204/205 于 2024-08-13 发布；FIPS 206（Falcon）仍是“in development”（页面更新于 2026-08-05） | [25] csrc PQC Standardization 页 | observed | |
| R54 | NIST IR 8547 ipd（2024-11-12）规定 112-bit 的 ECDSA/EdDSA/RSA “Deprecated after 2030”，全部“Disallowed after 2035” | [26] PDF Table 2（pdftotext 输出） | observed | |
| R55 | OpenZeppelin 推文称 Falcon-512 是“a NIST post-quantum standard”，这个说法不精确 | [27] OZ 推文原文；[25] FIPS 206 in development；[8] “FIPS 206 remains in draft” | observed | |
| R56 | docs.starknet.io Version Notes 最新只写到 v0.14.1（2025-12-10），v0.14.2 到 v0.14.4 要看论坛和 status 页 | [18] version-notes.md 首个 Update 标签 | observed | |
| R57 | v0.14.1 把 compiled class hash 从 Poseidon 改为 Blake，官方给的动机是证明效率（约 8 倍），不是 PQ | [18] v0.14.1 条目 | observed | |
| R58 | 媒体（Unchained、CryptoSlate）的定性与官方一致：只是考虑，没有批准的迁移时间表 | [28] “Neither Thursday post said whether or when a decision…”；[29] “rather than an approved migration timetable” | observed | |
| S1 | 链上入口是 `apply_actions(actions: Span<ServerAction>, screening: Option<ScreeningAttestation>)`，依次执行未暂停检查、validate_proof、collect_fee、_apply_actions、screening | starknet-privacy/packages/privacy/src/privacy.cairo#L784-L803@f9256c5e | observed | F9 |
| S2 | ClientAction 共 10 种（SetViewingKey、OpenChannel、OpenSubchannel、CreateEncNote、CreateOpenNote、Deposit、UseNote、Withdraw、InvokeExternal、ComputeAndInvoke），阶段只能前进，INVOKE 每笔至多一次 | packages/privacy/src/actions.cairo#L245-L315@f9256c5e | observed | F9 |
| S3 | ServerAction 共 12 种（WriteOnce、Append、TransferFrom、TransferTo、6 种 Emit、Invoke、InvokeWithComputation） | packages/privacy/src/actions.cairo#L368-L399@f9256c5e | observed | F9 |
| S4 | pool 在虚拟 OS 中充当“账户”：`__validate__` 只检查 OS 调用和零费用；`__execute__` 依次编译 actions、验签、send_message_to_l1 | privacy.cairo#L179-L214@f9256c5e；utils.cairo#L439-L447, #L575-L582@f9256c5e | observed | F9 |
| S5 | SDK 发给证明服务的虚拟交易：sender = pool，calldata 含 user.viewingKey，nonce 为 0，用户账户签名 | sdk/src/internal/proof-invocation-factory.ts#L32-L58, #L132-L160@f9256c5e | observed | F9、F10、S |
| S6 | 链上 validate_proof 检查 program_variant=VIRTUAL_SNOS、output=VIRTUAL_SNOS0、base 块在 proof_validity_blocks 窗口内、message_to_l1_hashes 等于 actions 的消息哈希 | privacy.cairo#L808-L843@f9256c5e；utils.cairo#L552-L564@f9256c5e | observed | F9 |
| S7 | 合约忽略 proof_facts 中的 virtual_program_hash、base_block_hash、config_hash，这三项由 blockifier 校验 | privacy.cairo#L816-L825@f9256c5e；sequencer/crates/blockifier/src/transaction/account_transaction.rs#L291-L350@54f97a8a | observed | F9 |
| S8 | Stwo 证明由 sequencer 网关的异步验证任务验证，失败则拒收交易 | sequencer/crates/apollo_gateway/src/gateway.rs#L489-L511@54f97a8a；[13] SNIP-36 “A S-Two Verifier written in Rust is added to the gateway” | observed | F9 |
| S9 | proof_facts 以 Poseidon 哈希链入 tx hash，proof 本身不进 tx hash，feeder gateway 会剥离 proof | sequencer/crates/starknet_api/src/transaction_hash.rs#L399-L402@54f97a8a；stateless_transaction_validator.rs#L298-L300@54f97a8a | observed | F9 |
| S10 | 虚拟 OS program hash / proof 版本白名单在 0.14.0 / 0.14.1 为空，从 0.14.2 起非空（PROOF0） | 命令 C3（blockifier_versioned_constants_0_14_*.json@54f97a8a） | observed | F9 |
| S11 | SNIP-36 Phase 1：证明只由 Starknet 共识验证，未来才接入 SHARP、在 Ethereum 上验证 | [13] community.starknet.io/t/116123 “Mindset behind the design” 一节 | observed | F9 |
| S12 | 私有交易的 proof facts 折叠进递归证明树的代码仍使用测试常量（带 TODO） | sequencer/crates/starknet_os/src/proof_fact_fold.rs#L1-L18@54f97a8a | observed | F9 |
| S13 | note_id = Poseidon(NOTE_ID_TAG, channel_key, token, index, 0) | packages/privacy/src/hashes.cairo#L200-L210@f9256c5e | observed | F14、S |
| S14 | nullifier = Poseidon(NULLIFIER_TAG, channel_key, token, index, 0, owner_viewing_private_key) | hashes.cairo#L224-L236@f9256c5e | observed | F14、S |
| S15 | channel_key = Poseidon(CHANNEL_KEY_TAG, sender_addr, sender_vk, recipient_addr, recipient_pk)，通道有方向 | hashes.cairo#L114-L132@f9256c5e；[6] discovery “Channels are directional” | observed | F14、S |
| S16 | identity_key = Poseidon(IDENTITY_KEY_TAG, user_addr, user_vk, contract_address)，经 ComputeAndInvoke 交给目标合约的 privacy_compute | hashes.cairo#L48-L61@f9256c5e；privacy.cairo#L547-L582@f9256c5e | observed | F14、S |
| S17 | 双花防护：use_note 产出 WriteOnce(nullifiers[nf]=true)，链上 _apply_write_once 写入前断言槽位为 0 | privacy.cairo#L618-L630, #L945-L960@f9256c5e | observed | |
| S18 | 链上重做 WriteOnce 检查，可以拦截基于同一旧区块（≤450 块）并发证明的冲突交易 | 由 S6、S17 推出：证明锚定在旧区块，最终是否写入以链上当前状态为准 | inferred | |
| S19 | 余额守恒：逐 token 临时余额，Deposit / UseNote 增、CreateEncNote / Withdraw 减，不得为负，交易结束必须为 0 | objects.cairo#L6-L27@f9256c5e；privacy.cairo#L310@f9256c5e；[6] transaction-flow | observed | |
| S20 | open note 以 0 值创建，必须在同一笔交易内由被调用合约 transfer_from 补足，否则回滚 | privacy.cairo#L864-L909, #L1039-L1069@f9256c5e | observed | |
| S21 | 支出授权：custom（需 SRC5 声明）、is_valid_signature(tx_hash)、is_valid_signature(SNIP-12 CallSet hash)，三条路径任一通过即可 | utils.cairo#L371-L420@f9256c5e | observed | F15 |
| S22 | 如果账户的 is_valid_signature 仍接受传统签名，即使 `__validate__` 已改为 PQ，也能通过 STRK20 的授权 | 由 S21 推出：pool 只调用 is_valid_signature / is_custom_signature_valid，不调用 `__validate__` | inferred | F15 |
| S23 | 注册时把 public_key = x(k·G) 明文写到链上，并把 k 用 ECDH 加密给 auditor_public_key，两者均为 WriteOnce，不可更换 | privacy.cairo#L319-L357@f9256c5e；utils.cairo#L220-L229, #L264-L267@f9256c5e；[7] “cannot be replaced” | observed | F11、F14 |
| S24 | auditor 可解密注册用户的 viewing key，扫描入向和出向通道、金额、nullifier、提现，但不能签名支出 | [6] compliance、security；[12] Security Model 一节 | observed | |
| S25 | 存款需要 screener 签名的 attestation，有效期为 issued_at+300s、允许 60s 时钟超前；open-note 存款按 Required / Exempt / Delegated 策略处理 | privacy.cairo#L921-L943, #L991-L1035@f9256c5e；utils.cairo#L97-L99@f9256c5e；objects.cairo#L102-L124@f9256c5e | observed | |
| S26 | 官方文档称存款经 Elliptic 筛查，由 StarkWare 管理凭证；strk20 build 页则称由 “FPI” 筛查并签名 | [7] Warning 段落；[10] /build “Compliance-first” | observed | |
| S27 | Deposit 事件公开 user_addr、token、amount；Withdrawal 事件公开 to_addr、token、amount，发起人地址加密给 auditor | privacy.cairo#L486-L531@f9256c5e；events.cairo@f9256c5e | observed | F10 |
| S28 | 开新通道时，Append 写入 recipient_channels[recipient_addr]，recipient 地址公开 | privacy.cairo#L89-L90, #L416-L417@f9256c5e；[6] security “recipient address on-chain once per sender–recipient pair” | observed | F10 |
| S29 | 链上旁观者看到的 sender 是 paymaster；paymaster 可能看到 IP | [6] security、paymasters | observed | F10 |
| S30 | 证明服务运营者能拿到 viewing key 和全部 client actions，即完整见证 | 由 S5 与 [7] “With ohttp disabled, your viewing key reaches the proving and discovery services in plaintext” 推出：OHTTP 解封装后服务端仍读取明文 | inferred | F10、S |
| S31 | discovery 运营者能看到 viewing key、活跃收款方、通道 / 子通道 / note 数量、token 和同步时间；OHTTP 加 relay 只隐藏 IP | crates/discovery-service/specs/05-security-considerations.md#L66-L79@f9256c5e；20-ohttp-integration.md#L5-L11@f9256c5e | observed | F10 |
| S32 | SDK 的 OHTTP 使用 DHKEM-X25519 + HKDF-SHA256 + AES-128-GCM | sdk/src/internal/ohttp-client.ts#L9, #L159@f9256c5e | observed | |
| S33 | SNIP-36 称当前隐私是 “de facto (computationally infeasible to extract)”，未来才可能是完全 ZK 证明 | [13] “Better support for privacy” | observed | F10 |
| S34 | channel 分发和 auditor 托管使用 Stark 曲线 ECDH：R=rG，共享材料为 (r·K).x，密文 = Poseidon(tag, S.x) + 明文 | utils.cairo#L124-L258@f9256c5e；[6] encryption-and-keys | observed | F11 |
| S35 | 金额加密为 (Poseidon(ENC_AMOUNT_TAG, channel_key, token, index, 0, salt) + amount) mod 2^128，不是 AES 一类分组密码 | utils.cairo#L274-L302@f9256c5e；[12] “Poseidon-based key stream” | observed | F11 |
| S36 | 量子攻击者可以从链上明文的 public_key 用 Shor 恢复任一注册用户的 viewing 私钥 k | 由 S23、S34 推出：public_key = x(k·G) 是 Stark 曲线离散对数实例 | inferred | F11、F14 |
| S37 | 拿到 k 就能复原该用户的通道、金额、已花状态和 identity_key（从而关联 Shadow 身份），已上链数据属于“先收集、后解密” | 由 S13–S16、S34–S36 推出：所有派生都只依赖 k、地址和链上公开值 | inferred | F14 |
| S38 | auditor 公钥是全局单点：量子破解它就能解出所有注册用户的 k | 由 S23、S36 推出：每个 enc_private_key 都加密给同一个 auditor_public_key | inferred | F11、F14 |
| S39 | Poseidon 掩码部分在量子模型下大概只受 Grover 级影响；128 位金额掩码的余量需另行评估 | 未做密码分析，基于对 S35 构造的一般判断 | speculative | |
| S40 | 官方 interactive 页称 “No trusted setup. Post-quantum. STARKs are hash-based…”，所指是证明系统 | [11] index-Xkq-Ap9T.js；命令 C6 | observed | F11 |
| S41 | 截至 2026-10-14，strk20.starknet.io 首页、/build、/index.md、llms-full.txt 中都没有 “quantum” 字样（未找到 “quantum-resistant by design”） | 命令 C5 | observed | |
| S42 | 证明系统 PQ 只保证状态转移不可伪造，不保证 STRK20 链上数据的保密性 | 由 S34–S38、S40 推出：保密性依赖 ECDH 和 x(kG)，与 STARK 无关 | inferred | |
| S43 | 审计 L-05：ECDH 临时私钥复用会让通道隐私静默且回溯性地失效，状态为 Acknowledged, not resolved | [12] L-05 | observed | |
| S44 | OpenZeppelin 审计 commit c5e2fb5，2026-03-18～31，报告 2026-05-29，共 11 个问题，0 Critical / High，2 Medium 已解决 | [3] docs/audit/README.md@f9256c5e；[12] Summary | observed | |
| S45 | 审计范围只有 packages/privacy/src 的 9 个文件，不含 snip12.cairo、anonymizer、SDK、discovery、prover | [12] Scope | observed | |
| S46 | 当前部署代码包含审计之后新增的内容（如 snip12.cairo 遗留签名路径） | 由 S45 与 packages/privacy/src/snip12.cairo#L131@f9256c5e 存在推出 | inferred | |
| S47 | pool 可由治理零延迟升级；部署以来 class hash 已变更 | privacy.cairo#L161@f9256c5e；[12] Security Model；命令 C2 | observed | |
| S48 | StarkWare 原话：“We formally verified the protocol. The Cairo contract that implements it is covered separately by the OpenZeppelin audit.”（2026-07-23） | [4] 正文 | observed | |
| S49 | Lean 开发共 56 个文件、8124 行、236 个 theorem / lemma，grep 未见 sorry / axiom | 命令 C4（lean/@f9256c5e） | observed | |
| S50 | Lean 模型假设哈希单射、enc / dec 为抽象可逆函数，因此不证明保密性或抗量子性 | lean/privacy/utils.lean#L29-L46@f9256c5e | observed | |
| S51 | Lean 模型的 note_amount 公式省略了 Cairo 中的 domain tag 和 0 位，是协议级抽象，不是逐行对应 Cairo | lean/privacy/utils.lean#L54-L56@f9256c5e 对照 utils.cairo#L282-L287@f9256c5e | observed | |
| S52 | 主网 pool 0x040337b1…ffe812a 于 2026-04-20 10:08:48 UTC（区块 8978970，0.14.2）部署 | 命令 C2；地址见 [6] overview | observed | F9 |
| S53 | Starknet v0.14.2 于 2026-04-20 主网上线，引入 proof 和 proof_facts 字段（SNIP-36） | [16] datePublished 2026-04-20T13:40:57Z 及正文 | observed | |
| S54 | 官方于 2026-06-09 宣布 STRK20 第一阶段上线，经 Ready X、Xverse 接入 | [17] 正文 | observed | |
| S55 | 截至 2026-10-14：版本 '2.1'，池费 2.5 STRK / 次 apply_actions，proof_validity_blocks = 450，未暂停 | 命令 C1 | observed | F9 |
| S56 | 池费由 collect_fee 从 apply_actions 的调用者（relayer）扣取；用户在交易中用 Withdraw 从私有余额补偿 | privacy.cairo#L845-L856@f9256c5e；[7] Fee modes；[6] paymasters | observed | |
| S57 | “under ten cents” 在当前 2.5 STRK 池费下成立，需要 STRK 低于约 0.04 美元（未查币价） | 由 S55 推出的条件，[14] 是设计目标表述，币价未核实 | speculative | R |
| S58 | 官方页面对证明方说法不一：interactive 写“在你的设备上生成”，architecture 写“当前由指定运营者代为生成”，starkzap 写“远程证明服务” | [11]；[6] architecture；[7] Overview | observed | |
| S59 | docs 的 proving 页仍称 SDK / 证明栈未开源，与 overview “SDK now open source” 和公开仓库矛盾（页面过时） | [6] proving、overview；[1] | observed | |
| S60 | 合约不设 token 白名单；fee-on-transfer / rebasing token 会破坏记账（审计 L-02，未解决） | [12] L-02；privacy.cairo#L486-L503@f9256c5e | observed | |
| W1 | starknet-privacy@f9256c5e 引用的 starkware-starknet-utils rev 为 3e2fd53d，与本地克隆一致 | starknet-privacy/Scarb.toml#L20-L22@f9256c5e；`git log -1` 输出 [1][2] | observed | |
| W2 | 官方文档定义：shadow account 是“persistent, pseudonymous identity for one user and one dapp”，“has no keys and cannot sign” | https://strk20.starknet.io/docs/starknet-wallet-api/shadow-accounts 首段（访问于 2026-10-14）[11] | observed | F13 |
| W3 | 官方列出的适用场景为 borrowing、staking（博客另含 swapping）；没有找到 treasuries / LP 表述 | [12] llms-full “account-based flows such as borrowing and staking”；[15] “borrowing, staking, swapping” | observed | |
| W4 | 2026-07-15 官方博客称 “private sub-accounts … Not live yet” | https://www.starknet.io/blog/push-to-private/ 正文与 datePublished [15] | observed | F13 |
| W5 | SDK 0.14.3-RC.5（2026-08-12）把 SubAccount 改名为 ShadowAccount，旧事件 key 保留 | sdk/CHANGELOG.md RC.5 Breaking 节@f9256c5e [9]；GitHub releases API [17] | observed | F13 |
| W6 | Wallet API types-js v0.10.4（2026-09-10）把 sub-accounts 改名为 shadow accounts | https://github.com/starknet-io/types-js/releases/tag/v0.10.4 [16] | observed | F13 |
| W7 | mainnet 首个 ShadowAccountDeployed 事件在区块 14,514,661（2026-09-07 17:07:38 UTC）（扫描起点为区块 14.4M） | starknet_getEvents 加 getBlockWithTxHashes 输出 [18] | observed | F13 |
| W8 | 截至 2026-10-14 05:51 UTC，mainnet 共 173 个 shadow 部署，49 个在 2026-10-13 00:00（UTC+8）之后 | starknet_getEvents 统计，分界区块 16,279,293 [18] | observed | F13 |
| W9 | 没有找到 2026-10-13 的官方 shadow 发布文章；“10-13 推出”未核实 | starknet.io/blog 与 starkware.co/blog 列表抓取 [22]；由 W7 推出部署更早 | speculative | F13 |
| W10 | 官方 Vesu 金库 demo 由个人账号 starkience 维护，自述 educational、not audited | [11] 原文；GitHub API starkience/shadow-account-demo created 2026-09-29 [19] | observed | S |
| W11 | mainnet ShadowAccountAnonymizer 地址为 0x04f33230…888a7，其 get_privacy_contract 返回 pool 0x040337b1…e812a | [12][13] 地址表；starknet_call 输出 [18] | observed | F12 |
| W12 | ShadowAccount 的存储只有 owner 与升级组件，不存公钥 | shadow_account.cairo#L30-L35@3e2fd53d [2] | observed | F12 |
| W13 | ShadowAccount 的 execute 只检查 caller == owner，然后执行任意 calls | shadow_account.cairo#L51-L54、#L83-L85@3e2fd53d [2] | observed | F12 |
| W14 | mainnet shadow class 的 ABI 只有 execute/initialize/owner/upgrade/constructor，没有 __validate__/__execute__/is_valid_signature | starknet_getClass 0x70e76435… 输出 [18]；shadow_account.cairo 全文 [2] | observed | F12 |
| W15 | mainnet 上 shadow account 的 owner() 返回 anonymizer 地址 | starknet_call owner 于 0x14a5f75b… 与 0x69b72663… [18] | observed | F12 |
| W16 | shadow 的 upgrade 只允许 owner，用户 calls 无法触发自身升级 | shadow_account.cairo#L71-L78@3e2fd53d [2]；由 W13 推出：自调用时 caller = shadow ≠ owner | inferred | F12 |
| W17 | anonymizer 的 privacy_invoke_with_computation 只接受配置好的 privacy contract 调用 | shadow_account_anonymizer.cairo#L329-L331@f9256c5e [1] | observed | F12 |
| W18 | anonymizer 对 calls 没有目标或 selector 限制（任意 Array\<Call\>） | shadow_account_anonymizer.cairo#L323-L345@f9256c5e [1] | observed | F12 |
| W19 | dapp_name 只是身份命名空间，不是调用 ACL | 由 W18、W25 推出：dapp_name 只进入哈希，calls 不受约束 | inferred | F12 |
| W20 | 收回策略有 All / Diff / Exact 三种，金额为 0 时 revert | shadow_account_anonymizer.cairo#L35-L42、#L454-L465@f9256c5e [1] | observed | |
| W21 | SDK 和 Wallet API 对一次 invoke 的全部 open note 只用一个 collect policy | sdk/src/internal/shadow-accounts.ts#L54-L55@f9256c5e [8]；[11] “One policy applies to every open note” | observed | |
| W22 | 部署走 Primer 三步：deploy PRIMER(salt = commitment) → set_class_hash → initialize（owner = anonymizer） | shadow_account_anonymizer.cairo#L412-L433@f9256c5e [1]；primer.cairo#L19-L30 [3] | observed | F12 |
| W23 | PRIMER_CLASS_HASH = 0x00123e6b…d300，已在 mainnet declare，ABI 为 set_class_hash | shadow_account_anonymizer.cairo#L52-L55 [1]；primer/README.md#L3-L13 [3]；getClass 输出 [18] | observed | |
| W24 | identity_key = Poseidon('IDENTITY_KEY_TAG:V1', user_addr, user_private_key, anonymizer_addr) | hashes.cairo#L38-L61@f9256c5e [5]；privacy.cairo#L557-L559 [4] | observed | F14、S |
| W25 | partial = Poseidon(identity_key, dapp_name)；commitment = Poseidon(partial, nonce)（sponge 式） | shadow_account_anonymizer.cairo#L57-L67@f9256c5e [1]；本地复算与链上一致 [18] | observed | |
| W26 | shadow 地址 = Pedersen 合约地址公式(salt = commitment, PRIMER_CLASS_HASH, [], deployer = anonymizer) | shadow_account_anonymizer.cairo#L372-L377、#L418-L424 [1]；sdk shadow-account-address.ts#L52-L60 [8]；get_shadow_accounts 复算一致 [18] | observed | |
| W27 | 官方文档要求离线派生不要使用 get_shadow_account_class_hash 的返回值 | [11] “Resolve the address” 节原文 | observed | |
| W28 | starknet.js 指南仍教用 get_shadow_account_class_hash 派生地址，已过时 | [13] “Address of a shadow account” 节原文；与 W26、W27 矛盾 | observed | |
| W29 | mainnet 首个 shadow（2026-09-07）按运行时 class 部署，后续 172 个按 Primer 部署；首个 Primer 式部署在 2026-09-25 | 本地 calculateContractAddressFromHash 对 173 事件分类，并查询区块时间 [18] | observed | |
| W30 | user_private_key 就是 viewing key：公钥 write-once 上链，私钥加密给 auditor | privacy.cairo#L319-L357@f9256c5e [4]；actions.cairo#L248 [6]；sdk shadow-account-address.ts#L17-L31 [8] | observed | F14、S |
| W31 | privacy_compute 在 pool 的私有执行中调用，partial commitment 和 identity_key 不上链，链上只有 commitment | privacy.cairo#L547-L582@f9256c5e [4]；ShadowAccountDeployed 事件 key [1] | observed | |
| W32 | 授权链：主账户签名在 pool 的 __execute__（virtual OS，caller = 0）内校验，之后才发出 server actions 消息 | privacy.cairo#L195-L214 [4]；utils.cairo#L385-L420、#L575-L582@f9256c5e [7] | observed | F12 |
| W33 | apply_actions 验证 proof_facts（VIRTUAL_SNOS、base block 新鲜度、message hash） | privacy.cairo#L808-L843@f9256c5e [4] | observed | F12 |
| W34 | mainnet 部署 shadow 的交易是 relayer 账户的 INVOKE v3，调用 pool.apply_actions | tx 0x30fd66b8… calldata 中的 selector 0x246333a7… = sel('apply_actions') [18] | observed | F12 |
| W35 | 资产经用户声明的 Withdraw(recipient = shadow) 由 pool 转给 shadow，Withdraw phase(6) 先于 Invoke phase(7) | actions.cairo#L277-L299 [6]；privacy.cairo#L507-L530 [4]；[11] 流程第 1 步 | observed | F12 |
| W36 | Withdrawal 事件公开 to_addr、token、amount（只有 user_addr 加密） | privacy.cairo#L525-L529@f9256c5e [4] | observed | |
| W37 | 回收时 anonymizer 先让 shadow 转账给自己，再 approve pool，pool 用 transfer_from 存入 open note | shadow_account_anonymizer.cairo#L439-L477 [1]；privacy.cairo#L1039-L1068@f9256c5e [4] | observed | |
| W38 | mainnet pool 对 anonymizer 的 screening 策略为 Delegated，被筛查的是 shadow 地址 | get_open_note_screening_policy 返回 0x2 [18]；objects.cairo#L116-L124、privacy.cairo#L1015-L1026 [4]；README [1] | observed | |
| W39 | 一次 Vesu 存入中 vault shares 留在 shadow 上，退出回到 shielded balance | [11] Vault Demo 原文；由 W13、W37 推出机制可行 | observed | |
| W40 | 专用 Vesu/Ekubo anonymizer 无状态、没有 caller 检查，输出回 pool 成为 note，没有持久身份 | vesu_lending_anonymizer.cairo#L116-L165@f9256c5e；ekubo README [10] | observed | |
| W41 | 同一交易内 invoke 与 shadow_account_invoke 互斥 | [11] “Things to notice”；actions.cairo#L297-L298 共用 INVOKE_PHASE [6] | observed | |
| W42 | shadow 内容公开（余额、调用、仓位），只隐藏与主钱包的关联 | [11] “What is private” 原文；[12] | observed | F13 |
| W43 | 任何人都能从 ShadowAccountDeployed 事件枚举全部 shadow 地址及其 commitment | shadow_account_anonymizer.cairo#L278-L286、#L431 [1]；173 事件查询 [18] | observed | F13、F14 |
| W44 | 拿到 partial commitment 的 dapp 可以枚举并关联同一用户在该 dapp_name 下的全部 nonce（单次最多 1024） | [13] partial commitment 原文；get_shadow_accounts#L347-L382、MAX_SCAN_RANGE#L46 [1] | observed | F13 |
| W45 | auditor 可以重算任意用户的全部 shadow 关联（但无法驱动 shadow） | 由 W24、W30、W32 推出：auditor 能解密 sk，又知道 user_addr，但没有主账户签名；[14] auditor 一行 | inferred | |
| W46 | sk 被泄露或被量子恢复后，历史 shadow 关联可被事后重建，且无法通过轮换补救 | 由 W24、W25、W30、W43 推出：公钥 = Stark 曲线点 x 坐标（utils.cairo#L264-L267 [7]），dapp_name 可枚举，key 为 write-once | inferred | F14 |
| W47 | “像 private sub account” 与官方早期命名一致 | 由 W4、W5、W6 推出：官方曾用 private sub-accounts / SubAccount | inferred | F13 |
| W48 | shadow 不能签 SNIP-12 或参与需要账户签名的协议，也不能自己发交易 | 由 W14 推出：没有 is_valid_signature 与 __validate__/__execute__ | inferred | F13 |
| W49 | anonymizer 由治理以 0 延迟替换实现，因此治理对全部 shadow 资产有潜在控制力 | shadow_account_anonymizer.cairo#L312 [1]；链上 get_upgrade_delay = 0 [18]；由 W15 推出控制力 | inferred | F12 |
| W50 | 换 anonymizer 地址或换隐私密钥都会得到一组新的 shadow 地址 | 由 W24、W26 推出：两者都是派生输入 | inferred | |
| W51 | 钱包若不把 dapp_name 与 origin 绑定，dapp B 可以请求 A 的 partial commitment 来关联用户 | 未验证钱包实现；[11] 只说 “dapp never receives the viewing key” | speculative | R |
| W52 | account_factory.cairo 用同一 Primer 模式部署 Eth712 账户（salt = eth_address），与 shadow 无直接关系 | account_factory.cairo#L158-L198、utils.cairo#L44-L51@3e2fd53d [3] | observed | |
| W53 | 公开的 OZ 审计（2026-05-29，commit c5e2fb5）正文没有 shadow / anonymizer 字样 | docs/audit/README.md@f9256c5e；pdftotext 输出 3142 词，命中 0 [20] | observed | |
| W54 | docs.starknet.io 称 Vesu helper 已部署于 mainnet，地址页称仓库没有发布 Vesu/Ekubo 的 canonical 地址 | anonymous-defi.md#L36-L38 [14]；llms-full “What is not in the list” [12] | observed | |
| X1 | viewing 私钥 k 一旦被 Shor 恢复，可同时复原该用户的私有转账历史和全部 Shadow 关联，且因 WriteOnce 无法轮换补救 | 由 S14、S23、S36、S37、W24、W30 推出：nullifier、channel 与 identity_key 都只依赖 k、地址与链上公开值；public_key 不可更换 | inferred | F14 |
| X2 | 只把账户 `__validate__` 换成 PQ 签名，不足以让账户的全部授权路径抗量子 | 由 S21、S22、A27、A29、A42、A44、A51 推出：STRK20 走 is_valid_signature / custom，账户还有 guardian、session、outside execution 等独立路径 | inferred | F15 |
| X3 | 兑现“2027 完全抗量子 L1”至少还需：Phase 1 树与地址迁移、旧存储迁移、PQ 共识签名、独立 DA 与结算、StarkGate 资产处置、STRK20 加密层 PQ 化，官方均未给规范或日期 | 由 C37、C19、R34、C30、C31、R11、R12、X1 推出 | inferred | |
| X4 | 2026-10-14 搜索索引中 starknetprivacy.com 摘要含 “Compliant for regulators, quantum-resistant by design.”，但当天抓取的页面源码（index 与各 jsx）已无 “quantum” 字样 | web_search（parallel，2026-10-14）结果摘要；`curl https://starknetprivacy.com/{,sections-*.jsx,app.jsx,build-page.jsx,lib.jsx} \| grep -i quantum` 无输出 | observed | F11 |

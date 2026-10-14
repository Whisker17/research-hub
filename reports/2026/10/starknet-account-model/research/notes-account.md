# notes-account：Starknet 账户模型与 EVM 账户模型对照（lane = account）

> 调研日期 2026-10-14（UTC+8）。源码均固定 commit；网页访问日期均为 2026-10-14。主网当前版本经 RPC 实测为 **Starknet v0.14.4**（区块 16,357,306，2026-10-14 07:10 UTC）[37]。

**一句话总结**：Starknet 没有 EOA。协议只做三件事：按交易类型调用发送方账户合约的固定入口（`__validate__` / `__validate_declare__` / `__validate_deploy__`，再调 `__execute__`），要求验证入口返回 `'VALID'`，在验证阶段施加资源上限和 syscall 限制。“签名是否有效”完全由账户合约决定。代价是：协议 nonce 仍严格顺序；验证阶段不能调用外部合约；原生 paymaster 字段还没有启用；地址派生仍用 Pedersen。

- **A-Q1 答案**：INVOKE v3 先由协议以 caller = 0 调 `__validate__`，返回值必须是 `'VALID'`，再以 caller = 0 调 `__execute__`。DEPLOY_ACCOUNT 先跑 constructor，再跑 `__validate_deploy__`。DECLARE 调 `__validate_declare__`。L1_HANDLER 不经过账户。验证阶段上限是 1,000,000 Cairo steps 和 1 亿 Sierra（L2）gas，并且禁止调用外部合约、`get_class_hash_at`、`deploy`、`meta_tx_v0` 和最近区块的 `get_block_hash`；区块号向下取整到 100 的倍数，时间戳向下取整到整点。nonce 是协议级严格顺序。`paymaster_data` 现在会被 gateway 拒收，代付靠 SNIP-9 / SNIP-29 这类链下方案。
- **A-Q2 答案**：EVM 的 EOA 和 7702 账户都绑定一把 secp256k1 根密钥，用它 ecrecover 授权，7702 之后这把密钥依然有效。4337 把可编程验证放在协议外的 EntryPoint 和 bundler 上，它的 nonce 反而比 Starknet 更灵活（192 位 key 加 64 位序号）。Starknet 的做法相当于“协议原生的 4337”：没有根密钥，原生支持批处理、反事实部署，还能用 `replace_class` 原地升级。
- **A-Q3 答案**：主流钱包合约的默认签名仍是 Stark 曲线 ECDSA（Braavos 写明默认 Stark signer；Argent/Ready 合约支持 Starknet、secp256k1、secp256r1、EIP-191、WebAuthn 五类 signer，没有 PQ signer）。OZ、Argent、Braavos 的账户都能自调用 `replace_class_syscall`，所以理论上可以保留地址换成 PQ 验证。但三家都没有公开“Stark-ECDSA 账户 → Falcon 账户”的迁移流程。主网已有一个 OZ Falcon-512 账户的演示交易，它是新部署的账户。

---

## A-Q1 Starknet 原生账户的协议流程

### 1.1 交易类型 → 入口函数 → 调用者
**答案**：协议按交易类型选择验证入口（INVOKE→`__validate__`，DECLARE→`__validate_declare__`，DEPLOY_ACCOUNT→`__validate_deploy__`），调用时 `caller_address = 0`。Cairo 1 账户的验证入口必须返回 felt `'VALID'`（`starknet::VALIDATED`），否则交易无效。INVOKE 验证通过后，协议同样以 caller = 0 调 `__execute__`，calldata 与 `__validate__` 相同。L1_HANDLER 由 OS 直接调用目标合约的 `#[l1_handler]` 入口，不经过任何账户。

**依据**
- 入口选择与验证 calldata：`blockifier/src/transaction/account_transaction.rs#L157-181@54f97a8a`。INVOKE 的验证 calldata 就是交易 calldata；DEPLOY_ACCOUNT 的是 `[class_hash, salt, constructor_calldata...]`；DECLARE 的是 `[class_hash]` [2]。
- `validate_tx` 用 `caller_address: ContractAddress::default()` 调用；Cairo 1 账户的返回值必须等于 `VALIDATE_RETDATA`，否则报 `InvalidValidateReturnData`：`account_transaction.rs#L1016-1064@54f97a8a` [2]。`VALIDATE_RETDATA = ascii("VALID")`：`starknet_api/src/transaction/constants.rs#L21-23@54f97a8a` [4]。
- INVOKE v1/v3 的执行阶段固定调 `__execute__`，caller = 0：`blockifier/src/transaction/transactions.rs#L299-322@54f97a8a` [6]。
- DEPLOY_ACCOUNT 的执行顺序相反：先 `run_execute`（constructor），后 `validate_tx`。constructor 运行在 validate 上下文中，受同样的限制：`account_transaction.rs#L653-669@54f97a8a` [2]。官方文档 Flow 一节的描述一致 [7]。
- L1_HANDLER：`entry_point_type: L1Handler`，caller = 0，目标是 `tx.contract_address`：`transactions.rs#L111-130@54f97a8a` [6]。文档说明它不能通过 API 广播 [8]。
- 失败语义：验证失败时交易不上链、不收费；`__execute__` 失败时交易为 REVERTED，照样收费、nonce 照样递增 [7][8]。

**不确定之处**：accounts 文档仍说验证失败的状态是 `REJECTED`。但 v0.14.0（RPC v0.9）已经移除了 `REJECTED` 状态 [11]，所以 accounts 页这部分已过时，以 version-notes 为准。

### 1.2 验证阶段的限制
**答案**（v0.14.4 主网，与 sequencer 仓库里 0.14.0–0.14.5 的常量一致）：
- 资源：`validate_max_n_steps = 1,000,000`，`validate_max_sierra_gas = 100,000,000`。v0.13.4 之前 sierra gas 上限是 10^10。
- 禁止调用：外部合约（`call_contract` 的目标地址 ≠ 自身）、`get_class_hash_at`、`deploy`（v0.14.0 起）、`meta_tx_v0`，以及对最近区块的 `get_block_hash`（直接拒收，而不是 revert）。
- `get_execution_info` 的返回值被改写：`block_number` 向下取整到 100 的倍数，`block_timestamp` 向下取整到 3600 秒，`sequencer_address` 为 0。

目的有两个：防止“验证很重、最后失败”的免费 DoS；防止 mempool 污染，也就是一笔交易改掉共享状态、让大批已入池交易一起失效。

**依据**
- 常量：`blockifier/resources/blockifier_versioned_constants_0_14_4.json#L13`（validate_max_n_steps）、`#L147-149`（rounding 100 / 3600）、`#L153`（validate_max_sierra_gas）、`#L118`（block_direct_execute_call: true）、`#L120`（disable_deploy_in_validation_mode: true）@54f97a8a [1]。13 个版本文件的对比见“命令与输出”。
- 外部合约调用被拒：`blockifier/src/execution/syscalls/hint_processor.rs#L532-539` 与 `execution/native/syscall_handler.rs#L511-517@54f97a8a`（条件：`is_validate_mode && storage_address != target`）[3]。
- `get_class_hash_at` 被拒：`execution/syscalls/syscall_base.rs#L225-227`；`meta_tx_v0` 被拒：`#L295-297`；最近区块的 `get_block_hash` 被拒并附攻击说明：`#L144-160`；deploy 被拒：`#L512-517`@54f97a8a [3]。
- 取整：`blockifier/src/context.rs#L180-200@54f97a8a`（`block_info_for_validate`，其中 `sequencer_address: 0`）[3]。
- 文档里的数值与理由（1,000,000 steps、100,000,000 gas、禁调外部合约、取整、DoS 和 mempool 污染）一致 [7]；取整规则自 v0.13.1 起，sequencer_address 置 0 自 v0.12.3 起 [11]。

**不确定之处**：`library_call`（调用别的 class 但在自身存储上下文中执行）在验证阶段似乎没有被拒绝（只看到对 `call_contract` 的检查），这一点没有逐行核对 Cairo VM 与 native 两条路径。这意味着账户可以把验签逻辑放到一个外部 class 里用 library call 调用。这是推论，OZ Falcon 的实现是把 verifier 编译进 class 内部。

### 1.3 Nonce
**答案**：协议执行层的 nonce 严格顺序（`account_nonce == tx_nonce`），每笔被执行的交易（包括 REVERTED）都会把 nonce 加 1。gateway / mempool 允许 nonce 超前（文档写的是 +200），只用于排队，不提供并行。SNIP-8 曾设想把 nonce 拆成“64 位序号 + 187 位 channel”的半抽象形式，但写明在协议支持之前强制使用 channel 0。仓库里没有专门的 nonce abstraction SNIP。文档的说法是“将来会考虑”。

**依据**：`account_transaction.rs#L478-502@54f97a8a`（`handle_nonce`，strict 时要求相等，然后 `increment_nonce`）[2]。gateway 用 `strict_nonce_check = false`，允许范围是 `[account_nonce, account_nonce + max_allowed_nonce_gap]`：`apollo_gateway/src/stateful_transaction_validator.rs#L284-297,#L310@54f97a8a` [5]。文档说 X = 200（INVOKE、DEPLOY_ACCOUNT）、0（DECLARE）[8]。“Starknet currently determines the nonce structure at the protocol level to be sequential … In the future, Starknet will consider … nonce abstraction”[7]。SNIP-8 L27 [13]。
**不确定之处**：`max_allowed_nonce_gap` 的生产配置值来自文档（200），源码里没找到默认值。

### 1.4 费用：v3 资源界限、tip、paymaster
**答案**：v3 交易为 `L1_GAS / L2_GAS / L1_DATA` 三种资源分别给出 `max_amount` 和 `max_price_per_unit`，以 STRK（fri）计价，从 v0.14.0 起强制。`tip` 从 v0.14.0 起参与排序（EIP-1559 风格），主网交易确实带非零 tip。`paymaster_data` 和 `account_deployment_data` 只是 SNIP-8 预留的字段：gateway 的无状态校验直接拒收非空值，Argent 和 Braavos 的 `__validate__` 也断言它为空。**原生 paymaster 没有上线**。实际的代付是 SNIP-9 outside execution 加 SNIP-29 的 paymaster API：relayer 用自己的账户发交易，调用用户账户的 `execute_from_outside_v2`。SNIP-20（enshrined paymaster）还处于 Review 状态。

**依据**：`starknet_api/src/transaction.rs#L665-678`（InvokeTransactionV3 的字段，含 `tip`、`paymaster_data`、`account_deployment_data`、`proof_facts`）[4]；`transaction/fields.rs#L202-210`（三种 Resource）[4]；`apollo_gateway/src/stateless_transaction_validator.rs#L47-48,#L112-150@54f97a8a`（`validate_empty_account_deployment_data` / `validate_empty_paymaster_data`，非空时报 `NonEmptyField`）[5]；Argent `argent_account.cairo#L218@c30f61c5`（`'argent/unsupported-paymaster'`）[25]；Braavos `braavos_account.cairo#L423-425@158d7d0b` [28]；文档 transactions-reference（paymaster_data “For future use … always empty”）[9]；fees（v0.14.0 起三种资源都要 STRK bounds；手续费由 OS 注入 STRK 转账，从发送方转给 sequencer）[10]；SNIP-29 流程第 1–4 步 [16]；SNIP-9 v2 [14]；SNIP-20 status Review [17]。主网样本交易的 tip = 0x1 [37]。
**不确定之处**：transactions-reference 的 INVOKE v3 节说 tip 自 0.14.0 起生效，DECLARE / DEPLOY_ACCOUNT 节却仍写“For future use, always 0”，文档内部前后不一致 [9]。

### 1.5 账户部署与反事实地址
**答案**：`address = pedersen_array([“STARKNET_CONTRACT_ADDRESS”, deployer, salt, class_hash, pedersen_array(constructor_calldata)]) mod (2^251 − 256)`，DEPLOY_ACCOUNT 时 deployer = 0。因此地址在部署前就能确定，可以先往这个地址打钱，再由账户自己付费部署（反事实部署）。DEPLOY_ACCOUNT 的手续费从新地址扣，部署后 nonce = 1。gateway 还有一个 UX 特例：账户 nonce 为 0 且 mempool 里已有它的 DEPLOY_ACCOUNT 时，nonce = 1 的 INVOKE 可以跳过 validate 预检。SNIP-8 里“在首笔 INVOKE 中顺带部署”（`account_deployment_data`）没有启用。

**依据**：`starknet_api/src/core.rs#L307-345@54f97a8a`（前缀常量、Pedersen、`L2_ADDRESS_UPPER_BOUND`）[4]；`transaction.rs#L463-472`（DEPLOY_ACCOUNT 的 deployer 为 0）[4]；`stateful_transaction_validator.rs#L426-460`（skip_stateful_validations）[5]；文档“Deploying a new account”（费用从新地址扣，nonce = 1）[7]。Braavos 用“base class + 构造函数内 replace_class”的办法，让地址只依赖 Stark 公钥：`braavos_base_account.cairo#L68-95@158d7d0b`、README L12-19 [28]。
**不确定之处**：Quantum Hub 把“合约地址派生改用非 Pedersen”列为路线图方向，尚未上线 [36]。如果将来改了，反事实地址公式也会变，影响钱包的离线地址计算。

### 1.6 签名相关接口：SNIP-6 / SNIP-12 / SNIP-9
**答案**：SNIP-6 定义了 `__execute__`、`__validate__`、`is_valid_signature(hash, signature) -> felt252`（有效时返回 `'VALID'`）和 SRC5 接口 id `0x2ceccef7…cc1cd`。它不是协议强制，文档原话是“not mandatory at the protocol level”。SNIP-12 是 Starknet 版 EIP-712：revision 0 用 Pedersen，revision 1 用 Poseidon，domain 为 `StarknetDomain`。SNIP-9 是 outside execution（meta-tx）：签名的消息里带 `caller`（可设为 `ANY_CALLER`）、独立于协议 nonce 的不重复 `nonce`、执行时间窗和 calls，v2 基于 SNIP-12 revision 1。

**依据**：SNIP-6 L35、L58-65、L112、L135（还有不少账户用 bool 返回值，建议 dapp 两种都认）[12]；OZ `interfaces/src/account/accounts.cairo#L9@5cf9010e` [24]；SNIP-12 L38-41、L66-81 [15]；SNIP-9 L34-43、L85-114 [14]；OZ `account/src/extensions/src9/src9.cairo#L77,#L114,#L135@5cf9010e` [23]；SNIP 状态全部取自 `SNIPs@1789f44e` 的 frontmatter：SNIP-6 / 9 / 12 为 Review，SNIP-8 为 Final [12-15]。
**不确定之处**：SNIP 仓库的最新 commit 是 2026-05-19，此后的状态变更不知道。

### 1.7 升级：`replace_class_syscall`
**答案**：账户可以调用 `replace_class_syscall(new_class_hash)`，原地换掉自己的 class，地址、存储和 nonce 都保留。三家实现的守卫条件不同：
- OZ `AccountUpgradeable` 预设：`assert_only_self` 之后直接 replace，不检查新 class。
- Argent v0.5.0：`assert_only_self`，新 class 必须支持 SRC5 账户接口，并实现 `perform_upgrade` 回调（以 library call 方式进入新 class，再由新 class 调 `replace_class`）；有 guardian 时升级需要 owner + guardian 双签。
- Braavos：自调用、非零检查、新 class 必须支持 ISRC6_ID，可选执行存储迁移。

**依据**：OZ `presets/src/account.cairo#L68-73`，`upgrades/src/upgradeable.cairo#L46-50@5cf9010e` [21]；Argent `src/upgrade.cairo#L68-85@c30f61c5` [26]，`docs/argent_account.md` L17、L36（自调用必须是 multicall 里唯一的一个 call）[25]；Braavos `src/upgradable/upgradable.cairo#L63-80@158d7d0b` [28]。
**不确定之处**：见 A-Q3。

### 1.8 代表性实现
**答案**：
- OZ `AccountComponent`：存一个 felt 形式的 Stark 公钥。`__validate__` 用 corelib 的 `check_ecdsa_signature` 验 `tx_info.transaction_hash`（v3 交易哈希用 Poseidon）。`__execute__` 断言 caller = 0、交易版本 ≥ 1，然后逐个执行 calls。`set_public_key` 要求自调用，并要求新密钥对 `'accept_ownership'` 消息签名。
- OZ `EthAccount`：用 secp256k1 syscall 验签。
- OZ `Falcon512AccountComponent`：公钥是 29 个 felt 的 NTT 域 Falcon-512 公钥，通过 `Falcon512SignatureVerifier` trait 选择具体 verifier。OZ 仓库内只有两个 SHAKE-256 实现：带 hint（60-felt 签名）和 direct（31-felt 签名）。
- Argent v0.5.0：多 owner 多 guardian；五种 signer；escape（恢复）默认安全期 7 天；session key；SNIP-9 outside execution；`__validate__` 拒绝非空 paymaster_data。
- Braavos v1.2.0：默认 Stark signer；可选 secp256r1 的 Hardware / WebAuthn “Strong Signer”，加了 Strong Signer 后 Stark signer 被降级；支持多签、每日限额、SNIP-9 v2。

**依据**：OZ `account/src/account.cairo#L71-95,#L342-373@5cf9010e` [19]；`account/src/utils.cairo#L9-25`，`utils/signature.cairo#L4,#L21-27,#L38-68` [20]；`eth_account.cairo#L24,#L368-372` [22]；`falcon_512/account.cairo#L6-31,#L94-106`，`verifier.cairo#L5-11`，`verifier_impls.cairo#L31-62`；预设 `presets/src/falcon_512_shake_account.cairo`、`falcon_512_shake_direct_account.cairo`（含 SRC9 与 Upgradeable）[23]；Argent `argent_account.cairo#L72-78,#L213-257`，`signer/signer_signature.cairo#L14-44` [25][27]；Braavos README L36-58、L108-109 [28]；v3 交易哈希为 Poseidon [9]。

### 1.9 账户合约里可用的密码学原语
**答案**（v0.14.4 versioned constants 中有资源定价的项目）：
- syscall：`Secp256k1{New,Add,Mul,GetPointFromX,GetXy}`、`Secp256r1{…}`、`Keccak`、`KeccakRound`、`Sha256ProcessBlock`、`Sha512ProcessBlock`。
- builtin：`ecdsa`、`ec_op`、`pedersen`、`poseidon`、`blake`（BLAKE2s）、`bitwise`、`range_check96`、`add_mod`、`mul_mod`。

Falcon、ML-DSA 这类 PQ 方案没有专用 syscall 或 builtin，要用 Cairo 代码（NTT、范数检查）实现。OZ Falcon-512 账户就是这么做的，主网演示交易消耗约 6,393 万 L2 gas，在 1 亿的验证上限之内。

**依据**：`blockifier_versioned_constants_0_14_5.json` 中 `os_resources/execute_syscalls` 的键表与 `builtin_gas_costs` #L168-180，0_14_4 #L338、L446、L474、L482、L177-178 @54f97a8a [1]；主网交易 [37]。
**不确定之处**：`Sha512ProcessBlock` 出现在 0.14.0 起的常量表里，但没有核对 corelib 是否已经对合约开放这个 syscall，标为 speculative。

---

## A-Q2 与 EVM 的对照

**答案**：差别在“谁定义授权”和“是否存在协议级根密钥”。EOA 和 7702 账户的根密钥由协议固定为 secp256k1（ecrecover）。7702 只是给 EOA 加了委托代码：authority 仍由 ecrecover 恢复，原私钥可以随时重新委托或清除委托，委托后的 EOA 也仍能直接用这把私钥发交易。ERC-4337 把可编程验证放在协议之外（UserOperation → bundler → EntryPoint.handleOps），用 ERC-7562 规则约束验证阶段。Starknet 把这套流程写进了协议，并且没有 EOA。以太坊的 native AA 提案中，EIP-7701 已撤回，RIP-7560 和 EIP-8141 都是 Draft。EIP-8141 明确以“从椭圆曲线迁移到 PQ”为首要动机，但没有代码的地址会走 default code，仍按 SECP256K1 签名验证。

**依据**：EIP-7702（Final）Behavior 第 3、5、8、9 步与“Transaction origination”一节 [29]；ERC-4337（Final）L18、L115-139、L180 [30]；ERC-7562（Review）OP-011 禁止 TIMESTAMP / NUMBER / BLOCKHASH 等操作码，另有 storage 关联规则 [31]；EIP-7701 status Withdrawn [32]；RIP-7560 status Draft [33]；EIP-8141 Draft，Motivation L22-23，Default code 一节 [34]；EIP-8130 Draft [35]。

### 对照表（口径：截至 2026-10-14 的规范或主网状态）

| 维度 | 传统 EOA | ERC-4337 | EIP-7702 | 以太坊 Native AA（EIP-8141 Draft） | Starknet 原生账户 |
|---|---|---|---|---|---|
| 授权规则由谁定义 | 协议：secp256k1 ECDSA | 账户合约 `validateUserOp` | 协议 ecrecover 加委托代码（委托代码可自定义调用内的鉴权） | VERIFY 帧中的账户代码，通过 `APPROVE` 批准 | 账户合约 `__validate__` |
| 协议强制根密钥 | 有 | 无（但部署者常用 EOA 发起 / 拥有） | 有，原 EOA 私钥始终有效 | 有代码的账户没有；无代码账户走 default code（secp256k1） | 无 |
| 交易入口 | 原生 tx | UserOp → bundler → EntryPoint.handleOps | 0x04 tx，authorization_list | 新 frame tx | INVOKE v3 → `__validate__` → `__execute__` |
| 批处理 | 无 | 账户实现 | 委托代码实现 | 协议原生（原子组） | 账户约定 `__execute__(Array<Call>)`，主流账户都支持 |
| 代付 | 无 | paymaster（paymasterAndData） | 需借助 4337 等 | 协议原生的 payer 批准 | 原生字段已预留，但会被拒收；用 SNIP-9 + SNIP-29 链下方案 |
| 验证限制 | 无（只验签） | ERC-7562：禁用环境操作码、存储关联、信誉 | 同 EOA | 公共池有验证 gas 预算（见 native-aa 报告） | 1M steps / 1 亿 gas；禁止外部调用；区块号、时间戳取整 |
| nonce | 顺序 | 192 位 key + 64 位序号（半抽象，可并行） | 顺序（EOA） | 8141 本体为顺序；EIP-8250 提议多通道 | 协议顺序；mempool 允许超前 200 |
| 升级 | 不可 | 代理合约 | 重新签 7702 委托 | 账户代码 | `replace_class_syscall` 原地换 class |
| 换签名算法需要什么 | 硬分叉（新交易类型） | 部署新账户或升级代理 | 换委托不能去掉 ECDSA 根密钥，需要协议变更 | 新账户或改账户代码 | 新账户，或已有账户自调用 `replace_class` |

注：8141 公共池预算与 8250 的内容来自既有报告 [38]，本次没有逐项复核。

### 优化与限制
**Starknet 的优化（observed）**：没有 EOA，验证完全可编程 [7]；批处理是账户约定 [19][25]；反事实部署 [4][7]；原地升级 [21][26][28]；签名算法可插拔，主网已有 Falcon 账户 [36][37]；v0.14.0 起协议禁止其他合约调用账户的 `__execute__`（SNIP-15 的诉求，原先要靠账户自己断言 caller = 0）[1][3][11][18]。
**Starknet 接受的限制（observed）**：验证预算固定 [1]；验证阶段不能读其他合约，因此“验证依赖链上 oracle 或注册表”的设计做不了 [3][7]；协议 nonce 顺序，在并行性上反而不如 4337 [2][30]；原生 paymaster 没有启用 [5]；钱包之间签名格式和升级回调不兼容，例如 Argent 的 `perform_upgrade` 回调和 Braavos 的 signer 格式 [26][28]；生态默认仍用 Stark 曲线 ECDSA [19][28]；地址派生用 Pedersen [4][36]。

---

## A-Q3 现状核对：钱包默认签名与“换 PQ 不换地址”

**答案**：Braavos 文档写明“native Stark signer is added by default … derived from the seed phrase”，Strong Signer 用 secp256r1。Argent v0.5.0 合约支持五类 signer，都是椭圆曲线或 WebAuthn，没有 PQ 类型；文档里的签名示例用的是 Starknet signer（type 0x0）。OZ 默认账户是 Stark ECDSA。三家都能自调用升级 class，理论上可以保留地址换成 PQ verifier。但有几个前提：
1. 授权这次升级的签名本身是旧的 ECDSA，所以必须在量子威胁到来之前完成；
2. Argent 要求新 class 实现它的 `perform_upgrade` 回调，Braavos 要求新 class 支持 ISRC6；
3. 新 class 的公钥存储布局不同（OZ Falcon 用 `Vec<felt252>`），需要在升级的同一流程里写入新公钥，否则账户可能锁死；
4. 新 class 必须同步移除旧签名路径，包括 `is_valid_signature`、guardian / escape、session、Braavos 降级后的 Stark signer。

主网 Falcon 演示交易来自一个 nonce = 1 的账户，说明它是 DEPLOY_ACCOUNT 新部署的账户，而不是从 ECDSA 账户升级来的。

**依据**：Braavos README L40-47、L58、L101 [28]；Argent `signer_signature.cairo#L14-44`，`docs/argent_account.md` L59-66 [25][27]；升级守卫 [21][26][28]；OZ Falcon 存储 `falcon_512/account.cairo#L29-31` [23]；Quantum Hub：“Existing accounts do not change automatically. Wallet support, signing, key management, recovery … remain separate work”，并把 Falcon 账户标为“Demonstrated on mainnet”，链到交易 0x72ae…4b3 [36]；RPC 实测该交易：INVOKE v3，nonce 0x1，签名 31 felt（与 OZ ShakeDirect 的 31-felt 布局一致），SUCCEEDED / ACCEPTED_ON_L1，区块 12,156,522（2026-07-22 10:46:25 UTC，v0.14.3），L2 gas 63,932,548，费用约 1.926 STRK，内容是一笔 0.01 STRK 的 transfer [37]。
**不确定之处**：
- Ready（原 Argent）App 实际创建账户时默认用哪种 signer，没有一手文档，只能从合约和文档示例推断。标 speculative。
- Braavos 仓库的最新 commit 是 2025-05-08，主网上是否已有更新的 class 没有核对。
- 没有核对 Falcon 演示账户的 class hash `0x4916…0cd` 是否等于 OZ 预设 class 的编译产物。

---

## 图的素材

### 图 1：Starknet INVOKE v3 时序（参与者 → 调用顺序）
1. 用户钱包对 Poseidon(v3 tx 字段) 签名 → 发给 RPC / gateway [9]
2. Gateway 做无状态检查：paymaster_data 和 account_deployment_data 必须为空、资源界限、交易大小 [5]
3. Gateway 做有状态检查：nonce ∈ [当前, 当前 + gap]；非 deploy 场景模拟运行 `__validate__` [5]
4. Mempool 按 tip 和 l2 price 排序；同 nonce 替换要求 tip 和 max_l2_gas_price 都提高 ≥10% [8]
5. Sequencer（blockifier）：`handle_nonce`（严格相等，然后 +1）[2]
6. 以 caller = 0 调 `account.__validate__(calldata)`，在 validate 模式下运行（1M steps / 1 亿 gas，禁止外部调用，取整后的区块信息），返回值必须是 `'VALID'` [1][2][3]
7. 以 caller = 0 调 `account.__execute__(calldata)` → 账户逐个 `call_contract` 目标合约 [6][19]
8. OS 注入 STRK 转账：sender → sequencer，金额为手续费 [10]
- 失败分支：第 6 步失败 → 交易不上链、不收费；第 7 步失败 → REVERTED，收费，nonce +1 [7][8]

### 图 2：DEPLOY_ACCOUNT 时序
1. 链下计算 address = Pedersen(prefix, 0, salt, class_hash, Pedersen(ctor_calldata)) [4]
2. 往该地址转入 STRK（反事实地址）[7]
3. 发送 DEPLOY_ACCOUNT（nonce 必须为 0）[5]
4. 先跑 constructor（validate 上下文），再以 caller = 0 调 `__validate_deploy__(class_hash, salt, ctor_args...)` [2]
5. 从新地址扣费，nonce = 1 [7]
- 可选：同时提交 nonce = 1 的 INVOKE，gateway 可跳过 validate 预检 [5]

### 图 3：EVM 三种路径对照（与图 1 并排）
- EOA：tx → 协议 ecrecover(secp256k1) → nonce 严格 → 执行 [29]
- 4337：UserOp → alt mempool（按 ERC-7562 模拟）→ bundler → `EntryPoint.handleOps` → 验证循环（`validateUserOp`、paymaster 的 validate）→ 执行循环 [30][31]
- 7702：type-4 tx 的 authorization_list → 对每个 tuple 做 `authority = ecrecover(keccak(0x05‖rlp([chain_id,address,nonce])))` → 写入 `0xef0100‖address` → authority nonce +1；此后原私钥仍能直接发交易，也能重新委托 [29]
- 8141（Draft）：frame tx → VERIFY 帧（账户代码 `APPROVE`）→ SENDER 帧执行；无代码账户的 default code 用 SECP256K1 [34]

### 图 4：验证阶段约束对比
| 约束 | Starknet（v0.14.4） | ERC-7562 |
|---|---|---|
| 计算预算 | 1,000,000 steps / 100,000,000 L2 gas [1] | 验证 gas 由 UserOp 字段加 bundler 策略决定 [30][31] |
| 区块号、时间 | 取整到 100 块 / 3600 秒 [3] | 禁用 `NUMBER` / `TIMESTAMP` [31] |
| 读别的合约 | 禁止 `call_contract` 外部合约 [3] | 只能访问关联存储（STO 规则）加 staking / 信誉 [31] |
| 部署 | v0.14.0 起禁止 deploy [1][3] | 有 factory 时允许 CREATE [31] |

### 时间线条目（Starknet 账户相关）
- 2023-11-19 v0.12.3：validate 阶段 sequencer_address 置 0，禁 `get_block_hash`；OS 支持 secp256r1 syscall [11]
- 2024-01-10 v0.13.0：v3 交易（STRK 付费，预留 paymaster 等字段）[11]
- 2024-03-13 v0.13.1：validate 阶段区块号、时间戳取整 [11]
- 2025-03-24 v0.13.4：validate_max_sierra_gas 从 10^10 降到 10^8 [1][11]
- 2025-09-01 v0.14.0：只接受 v3；`meta_tx_v0`；内部调用 `__execute__` 会被 revert；validate 禁 deploy；tip 参与排序；mempool [1][11]
- 2026-07-22（区块 12,156,522，v0.14.3）：OZ Falcon-512 账户主网演示交易 [36][37]
- 2026-10-14：主网 v0.14.4 [37]

---

## 代码素材

**C1 OZ `__execute__` / `__validate__`**（`OpenZeppelin/cairo-contracts/packages/account/src/account.cairo#L71-87@5cf9010e`，https://github.com/OpenZeppelin/cairo-contracts/blob/5cf9010e653b8da506f1e9824cd74c441c4f8d87/packages/account/src/account.cairo#L71）
```cairo
fn __execute__(self: @ComponentState<TContractState>, calls: Array<Call>) {
    // Avoid calls from other contracts
    let sender = starknet::get_caller_address();
    assert(sender.is_zero(), Errors::INVALID_CALLER);
    assert(is_tx_version_valid(), Errors::INVALID_TX_VERSION);
    for call in calls.span() {
        execute_single_call(call);
    }
}
fn __validate__(self: @ComponentState<TContractState>, calls: Array<Call>) -> felt252 {
    self.validate_transaction()
}
```
**C2 OZ `validate_transaction`**（同文件 #L342-348）
```cairo
fn validate_transaction(self: @ComponentState<TContractState>) -> felt252 {
    let tx_info = starknet::get_tx_info().unbox();
    let tx_hash = tx_info.transaction_hash;
    let signature = tx_info.signature;
    assert(self._is_valid_signature(tx_hash, signature), Errors::INVALID_SIGNATURE);
    starknet::VALIDATED
}
```
（`_is_valid_signature` → `is_valid_stark_signature` → `core::ecdsa::check_ecdsa_signature`，见 `utils/signature.cairo#L21-27`）

**C3 Blockifier：以 caller = 0 调验证入口，并检查 `'VALID'`**（`starkware-libs/sequencer/crates/blockifier/src/transaction/account_transaction.rs#L1019-1061@54f97a8a`，节选）
```rust
let validate_call = CallEntryPoint {
    entry_point_selector: validate_selector,
    calldata: self.validate_entrypoint_calldata(),
    storage_address,
    caller_address: ContractAddress::default(),
    ..
};
// ...
let expected_retdata = retdata![*constants::VALIDATE_RETDATA];
if validate_call_info.execution.retdata != expected_retdata {
    return Err(TransactionExecutionError::InvalidValidateReturnData { .. });
}
```
**C4 验证阶段禁止外部调用**（`blockifier/src/execution/syscalls/hint_processor.rs#L532-539@54f97a8a`）
```rust
if syscall_handler.is_validate_mode()
    && syscall_handler.storage_address() != storage_address
{
    return Err(SyscallExecutorBaseError::InvalidSyscallInExecutionMode {
        syscall_name: "call_contract".to_string(),
        execution_mode: syscall_handler.execution_mode(),
    }.into());
}
```
**C5 严格顺序 nonce**（`account_transaction.rs#L487-495@54f97a8a`）
```rust
let account_nonce = state.get_nonce_at(address)?;
let incoming_tx_nonce = tx_info.nonce();
let valid_nonce = if strict {
    account_nonce == incoming_tx_nonce
} else {
    account_nonce <= incoming_tx_nonce
};
if valid_nonce { return Ok(state.increment_nonce(address)?); }
```
**C6 合约地址派生**（`starknet_api/src/core.rs#L330-342@54f97a8a`）
```rust
let constructor_calldata_hash = Pedersen::hash_array(&constructor_calldata.0);
let contract_address_prefix = format!("0x{}", hex::encode(CONTRACT_ADDRESS_PREFIX));
let address = Pedersen::hash_array(&[
    Felt::from_hex(contract_address_prefix.as_str())?, // "STARKNET_CONTRACT_ADDRESS"
    *deployer_address.0.key(), salt.0, class_hash.0, constructor_calldata_hash,
]);
let (_, address) = address.div_rem(&L2_ADDRESS_UPPER_BOUND);
```
**C7 OZ 升级**（`packages/presets/src/account.cairo#L70-73` 与 `packages/upgrades/src/upgradeable.cairo#L46-49@5cf9010e`）
```cairo
fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
    self.account.assert_only_self();
    self.upgradeable.upgrade(new_class_hash);   // -> assert non-zero; replace_class_syscall(new_class_hash)
}
```
**C8 Argent `__validate__` 头部**（`argent-contracts-starknet/src/multiowner_account/argent_account.cairo#L213-218@c30f61c5`）
```cairo
fn __validate__(ref self: ContractState, calls: Array<Call>) -> felt252 {
    let exec_info = get_execution_info();
    let tx_info = exec_info.tx_info;
    assert_only_protocol(exec_info.caller_address);   // caller == 0
    assert_correct_invoke_version(tx_info.version);
    assert(tx_info.paymaster_data.is_empty(), 'argent/unsupported-paymaster');
```
**C9 EIP-7702 授权处理**（eips.ethereum.org/EIPS/eip-7702，Behavior 第 3、5、8 步）
```
3. Let authority = ecrecover(msg, y_parity, r, s), msg = keccak(MAGIC || rlp([chain_id, address, nonce]))
5. Verify the code of authority is empty or already delegated.
8. Set the code of authority to be 0xef0100 || address.
```

---

## 外部调研 / 用户资料中被修正或无法核实的地方

1. **GPT §2.4“验证函数受到资源和调用限制”没有给数值**。补充如下：1,000,000 steps 和 100,000,000 L2 gas（v0.13.4 起；之前 gas 上限是 10^10）；禁止外部 `call_contract`、`get_class_hash_at`、`deploy`（v0.14.0 起）、`meta_tx_v0`、最近区块的 `get_block_hash`；区块号取整到 100、时间戳取整到 3600 秒 [1][3][7]。
2. **GPT §2.4“官方账户文档明确写着协议级 nonce 仍顺序递增”**：属实 [7]。需要补充两点：mempool 允许 nonce 超前 200（只用于排队）[8]；ERC-4337 本身有 192 位 key 的并行 nonce [30]。所以“EVM 智能账户在 nonce 上不如 Starknet”的暗示不成立，在 nonce 灵活性上 4337 反而更强。
3. **GPT §2.2 对照表“交易提交路径：account contract 本身参与原生验证和执行”**：方向正确。但缺了“代付”这一维：Starknet 的 `paymaster_data` 目前会被 gateway 拒收 [5][9]，原生 paymaster 没有上线，代付走 SNIP-9 + SNIP-29 [14][16]。如果按 SNIP-8 字段名推断“原生 paymaster 已有”，那是错误的。
4. **GPT §2.2“7702 的授权仍通过 ecrecover 恢复 authority，原 EOA 密钥可以更改委托”**：用 EIP-7702 原文核实属实（第 3、5、8 步，address = 0 时清除委托）[29]。还应补充：委托后的 EOA 仍能用原私钥直接发起交易（EIP-3607 的修改）[29]。
5. **GPT §2.3 引用 `raw.githubusercontent.com/.../main/...`**：没有固定 commit。本文固定在 `5cf9010e`（OZ v4.0.1 头注）。内容核实无误：`Account_public_key`、`validate_transaction`、Stark ECDSA [19][20]。
6. **GPT §5.3 / 5.4 把 SHAKE / BLAKE2s / Poseidon 三种变体放在“OpenZeppelin 的实现”下**：`OpenZeppelin/cairo-contracts` 的账户包里只有 SHAKE-256 的 hint 和 direct 两个 verifier [23]，BLAKE2s 和 Poseidon 变体在另一个仓库 `cairo-pq-verifiers`（归 PQ 那一路核对）。
7. **GPT 表“Falcon-512 账户：有主网演示记录”**：属实，并补充了链上细节：交易 0x72ae…4b3，区块 12,156,522，2026-07-22，v0.14.3，约 6,393 万 L2 gas，约 1.926 STRK [36][37]。这个账户是新部署的（nonce = 1），**不是**已有账户升级而来。
8. **docs.starknet.io accounts 页有过时内容**：仍写验证失败的状态为 `REJECTED`、“later versions we may disallow calling `__execute__` from another contract”。实际上 v0.14.0 已移除 REJECTED 状态，并开始 revert 对 `__execute__` 的内部调用 [1][7][11]。
9. **docs.starknet.io version-notes 只写到 v0.14.1（2025-12-10）**，而主网已运行到 v0.14.4 [11][37]。Quantum Hub 引用了 v0.14.3 [36]。所以 version-notes 不能作为当前版本的依据。
10. **docs transactions-reference 中 tip 的说法前后不一致**：有的节说“For future use, always 0”，INVOKE v3 节说自 0.14.0 起生效。主网交易 tip = 0x1 [9][37]。
11. **用户草稿**：本路相关的只有“看看他们和一般 EVM account model 有什么区别，做了哪些优化”，不含具体事实论断，无需修正。

---

## 来源

1. **PRIMARY** starkware-libs/sequencer @54f97a8a，`crates/blockifier/resources/blockifier_versioned_constants_0_13_*.json` / `0_14_0..0_14_5.json`（例如 https://github.com/starkware-libs/sequencer/blob/54f97a8af3a712fb6c358e30f19e5a386cb7b4e3/crates/blockifier/resources/blockifier_versioned_constants_0_14_4.json#L13）：证明各版本的验证上限、取整常量、禁 deploy 和 block_direct_execute_call 开关、syscall 与 builtin 清单。
2. **PRIMARY** sequencer @54f97a8a `crates/blockifier/src/transaction/account_transaction.rs`（L157-181、L478-502、L645-671、L1010-1064）：证明入口选择、严格 nonce、DEPLOY_ACCOUNT 的执行顺序、caller = 0 与 `'VALID'` 检查。
3. **PRIMARY** sequencer @54f97a8a `crates/blockifier/src/execution/syscalls/{syscall_base.rs,hint_processor.rs}`、`execution/native/syscall_handler.rs`、`src/context.rs`：证明验证阶段的 syscall 拒绝规则与区块信息取整。
4. **PRIMARY** sequencer @54f97a8a `crates/starknet_api/src/{core.rs#L307-345, transaction.rs#L463-472,#L665-678, transaction/constants.rs#L8-23, transaction/fields.rs#L202-210}`：证明地址派生公式、入口名、VALID 常量、v3 字段。
5. **PRIMARY** sequencer @54f97a8a `crates/apollo_gateway/src/{stateless_transaction_validator.rs, stateful_transaction_validator.rs}`：证明 paymaster_data 和 account_deployment_data 必须为空、nonce gap、deploy+invoke 跳过 validate。
6. **PRIMARY** sequencer @54f97a8a `crates/blockifier/src/transaction/transactions.rs`（L111-130、L299-322）：证明 L1_HANDLER 与 `__execute__` 的调用方式。
7. **PRIMARY** docs.starknet.io/learn/protocol/accounts（访问 2026-10-14）：证明官方的入口表、限制数值与理由、顺序 nonce、部署付费与 nonce = 1。
8. **PRIMARY** docs.starknet.io/learn/protocol/transactions（2026-10-14）：证明交易类型和版本、mempool 的 nonce +200、费用替换规则、REVERTED 语义。
9. **PRIMARY** docs.starknet.io/learn/cheatsheets/transactions-reference（2026-10-14）：证明 v3 字段语义、Poseidon 交易哈希、paymaster_data “always empty”。
10. **PRIMARY** docs.starknet.io/learn/protocol/fees（2026-10-14）：证明 STRK 计价的三种资源界限、OS 注入手续费转账、tip 计入费用。
11. **PRIMARY** docs.starknet.io/learn/cheatsheets/version-notes（2026-10-14）：证明 v0.12.3、v0.13.0、v0.13.1、v0.14.0 等版本的账户相关变更与上线日期。
12. **PRIMARY** starknet-io/SNIPs @1789f44e `SNIPS/snip-6.md`：证明 SRC6 接口、`'VALID'` 约定、接口 id、status Review。
13. **PRIMARY** SNIPs @1789f44e `snip-8.md`：证明 v3 结构（Final）、预留的 paymaster 和 nonce channel 设计。
14. **PRIMARY** SNIPs @1789f44e `snip-9.md`：证明 outside execution 的 v1 / v2 字段与独立 nonce。
15. **PRIMARY** SNIPs @1789f44e `snip-12.md`：证明 typed data 的 revision 0 / 1 与哈希函数。
16. **PRIMARY** SNIPs @1789f44e `snip-29.md`：证明链下 paymaster API 流程（Review）。
17. **PRIMARY** SNIPs @1789f44e `snip-20.md`：证明 enshrined paymaster 仍为 Review 提案。
18. **PRIMARY** SNIPs @1789f44e `snip-15.md`：证明“只有账户自己能调自己的 execute”的提案（Review）。
19. **PRIMARY** OpenZeppelin/cairo-contracts @5cf9010e `packages/account/src/account.cairo`：证明 OZ 账户的 validate / execute / set_public_key 逻辑。
20. **PRIMARY** 同仓库 `packages/account/src/utils.cairo`、`utils/signature.cairo`：证明 tx version 检查、Stark / secp256k1 / p256 验签函数。
21. **PRIMARY** 同仓库 `packages/presets/src/account.cairo`、`packages/upgrades/src/upgradeable.cairo`：证明 OZ 升级用 assert_only_self 加 replace_class_syscall。
22. **PRIMARY** 同仓库 `packages/account/src/eth_account.cairo`：证明 secp256k1 账户。
23. **PRIMARY** 同仓库 `packages/account/src/falcon_512/*`、`extensions/src9/src9.cairo`、`presets/src/falcon_512_shake*_account.cairo`：证明 Falcon-512 账户组件、verifier trait、只有 SHAKE hint/direct 两种实现、SRC9 + Upgradeable 预设。
24. **PRIMARY** 同仓库 `packages/interfaces/src/account/accounts.cairo#L9`：证明 ISRC6_ID 的值。
25. **PRIMARY** argentlabs/argent-contracts-starknet @c30f61c5 `src/multiowner_account/argent_account.cairo`、`docs/argent_account.md`：证明 Argent v0.5.0 的 validate / execute、guardian、escape 7 天、拒收 paymaster。
26. **PRIMARY** 同仓库 `src/upgrade.cairo`、`docs/argent_account_upgrades.md`：证明 Argent 升级要求 SRC5 加 perform_upgrade 回调。
27. **PRIMARY** 同仓库 `src/signer/signer_signature.cairo#L14-44`：证明五种 signer 类型。
28. **PRIMARY** myBraavos/braavos-account-cairo @158d7d0b（2025-05-08）`README.md`、`src/presets/braavos_base_account.cairo`、`src/presets/braavos_account.cairo`、`src/upgradable/upgradable.cairo`、`src/signers/signers.cairo`：证明默认 Stark signer、secp256r1 Strong Signer、base class 部署、升级要求 ISRC6、paymaster_data 为空。
29. **PRIMARY** EIP-7702（https://eips.ethereum.org/EIPS/eip-7702，原文取自 ethereum/EIPs master，2026-10-14，status Final）：证明 ecrecover 授权、重新委托和清除委托、委托后的 EOA 仍能发交易。
30. **PRIMARY** ERC-4337（https://eips.ethereum.org/EIPS/eip-4337，ethereum/ERCs master，2026-10-14，Final）：证明 UserOp、bundler、handleOps、192 位 nonce key。
31. **PRIMARY** ERC-7562（https://eips.ethereum.org/EIPS/eip-7562，2026-10-14，Review）：证明验证阶段禁用的操作码与存储规则。
32. **PRIMARY** EIP-7701（2026-10-14）：status Withdrawn。
33. **PRIMARY** RIP-7560（ethereum/RIPs master，2026-10-14）：status Draft。
34. **PRIMARY** EIP-8141（2026-10-14，Draft）：证明以 PQ 迁移为首要动机，以及 default code 用 SECP256K1。
35. **PRIMARY** EIP-8130（2026-10-14，Draft）：证明 Keystore / authenticator 模型。
36. **PRIMARY** StarkWare Quantum Hub，https://quantum.starkware.co/migration-register（访问 2026-10-14，页面写“Last updated: 19 August 2026”）：证明“已有账户不会自动改变”、Falcon 账户“Demonstrated on mainnet”并链接到交易、地址派生仍是路线图。
37. **PRIMARY** Starknet 主网 JSON-RPC（https://api.zan.top/public/starknet-mainnet，spec 0.9.0，2026-10-14 查询）：证明 Falcon 演示交易的字段、receipt、区块时间与版本，以及当前主网为 v0.14.4。
38. 线索（非一手）research-hub 报告 `native-aa-eip-8130-8141/explainer.md`：EIP-8141 / 8250 / 8130 的推进状态与 mempool 预算，本次没有逐项复核。

---

## 命令与输出

```text
$ for f in blockifier_versioned_constants_0_1[34]_*.json; do grep block_direct_execute_call / disable_deploy_in_validation_mode / validate_max_sierra_gas / validate_max_n_steps; done
0_13_0 … 0_13_3 : false false 10000000000 1000000
0_13_4 … 0_13_6 : false false 100000000   1000000
0_14_0 … 0_14_5 : true  true  100000000   1000000

$ starknet_getTransactionByHash 0x72ae4404b44ad78de65bdc460f8cc87fea4a15ce93e07a37c6a68e9adb0a4b3   (api.zan.top)
version 0x3 type INVOKE sig_len 31 tip 0x1 nonce 0x1 paymaster_data [] sender 0xbae840ed…7b132
calldata [0x1, STRK 0x4718f5a0…938d, selector 0x83afd3f4…d12e(transfer), 0x3, to 0x7fcf7890…89ac, 0x2386f26fc10000(=0.01 STRK), 0x0]
$ starknet_getTransactionReceipt …
{'block_number': 12156522, 'execution_status': 'SUCCEEDED', 'finality_status': 'ACCEPTED_ON_L1',
 'actual_fee': {'amount': '0x1aba6437b7129348', 'unit': 'FRI'},   # ≈ 1.925962 STRK
 'execution_resources': {'l1_data_gas': 224, 'l1_gas': 0, 'l2_gas': 63932548}}
$ starknet_getBlockWithTxHashes {block_number:12156522} → timestamp 1784717185 (2026-07-22 10:46:25 UTC), starknet_version 0.14.3
$ starknet_getClassHashAt latest 0xbae840ed…7b132 → 0x4916072375da17b9c6b318c5f68006a68f0ae573fce4346ad002933d4f9c0cd
$ starknet_getBlockWithTxHashes latest → 16357306, 2026-10-14 07:10:54 UTC, starknet_version 0.14.4
```

---

## 开放问题

1. 已有的 Stark-ECDSA 账户（OZ / Argent / Braavos）原地升级成 Falcon class 的安全流程：在同一个 multicall 里先 `upgrade` 再写入 Falcon 公钥是否可行、是否有锁死风险？目前没有官方迁移文档。
2. Ready（Argent）和 Braavos 是否有 PQ signer 的路线图？两个仓库的最新 commit 分别是 2025-11 和 2025-05。
3. 验证阶段是否真的允许 `library_call`？如果允许，PQ verifier 可以做成共享 class，减少各账户重复 declare。
4. nonce abstraction（SNIP-8 的 channel 设计）有没有时间表？
5. 如果地址派生从 Pedersen 迁出（路线图），反事实地址公式和已有地址怎么兼容？
6. `Sha512ProcessBlock` 是否已经在 corelib 中对合约开放？
7. 如果转为 L1，验证预算、mempool 规则是否会变化？官方材料中没有找到相关说法。

---

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| A1 | INVOKE 调 `__validate__`，DECLARE 调 `__validate_declare__`，DEPLOY_ACCOUNT 调 `__validate_deploy__` | [2] account_transaction.rs#L157-163@54f97a8a；[7] Flow 一节 | observed | |
| A2 | 协议以 caller_address = 0 调用验证入口 | [2] account_transaction.rs#L1026@54f97a8a | observed | |
| A3 | Cairo 1 账户的验证入口必须返回 felt `'VALID'`，否则交易无效 | [2] account_transaction.rs#L1043-1061；[4] constants.rs#L21-23@54f97a8a | observed | |
| A4 | INVOKE v3 执行阶段以 caller = 0 调 `__execute__`，calldata 与 `__validate__` 相同 | [6] transactions.rs#L299-322；[2] #L178-179@54f97a8a | observed | |
| A5 | DEPLOY_ACCOUNT 先运行 constructor，再运行 `__validate_deploy__`，constructor 处于 validate 上下文 | [2] account_transaction.rs#L653-669@54f97a8a；[7] | observed | |
| A6 | L1_HANDLER 直接调用目标合约的 l1_handler 入口，不经过账户验证 | [6] transactions.rs#L111-130@54f97a8a；[8] | observed | |
| A7 | 验证阶段 Cairo steps 上限为 1,000,000（v0.13.0–v0.14.5 相同） | [1] versioned_constants_0_14_4.json#L13@54f97a8a；[7] | observed | |
| A8 | 验证阶段 Sierra/L2 gas 上限为 100,000,000（v0.13.4 起，此前为 10^10） | [1] 0_14_4.json#L153 与“命令与输出”中的版本对比；[7] | observed | |
| A9 | 验证阶段禁止对其他合约 `call_contract` | [3] hint_processor.rs#L532-539、native/syscall_handler.rs#L511-517@54f97a8a；[7] | observed | |
| A10 | 验证阶段禁止 `get_class_hash_at`、`meta_tx_v0` 和对最近区块的 `get_block_hash` | [3] syscall_base.rs#L225-227,#L295-297,#L144-160@54f97a8a | observed | |
| A11 | v0.14.0 起验证阶段（含 DEPLOY_ACCOUNT 的 constructor）禁止 deploy syscall | [1] 0_14_*.json `disable_deploy_in_validation_mode: true`；[3] syscall_base.rs#L512-517；[7] | observed | |
| A12 | 验证阶段 block_number 向下取整到 100 的倍数、timestamp 取整到 3600 秒、sequencer_address 为 0 | [3] context.rs#L180-200@54f97a8a；[1] 0_14_4.json#L147-149；[7] | observed | |
| A13 | 验证限制的目的是防止免费 DoS 与 mempool 污染 | [7] Limitations 一节 | observed | |
| A14 | 验证失败的交易不收费，`__execute__` 失败为 REVERTED、收费且 nonce 递增 | [7] Failures；[8] L94-97 | observed | |
| A15 | 协议执行层 nonce 严格要求 tx_nonce == account_nonce，执行后 +1 | [2] account_transaction.rs#L478-502@54f97a8a | observed | |
| A16 | mempool 允许 INVOKE / DEPLOY_ACCOUNT 的 nonce 超前至多 200，DECLARE 为 0 | [8] L62-64；[5] stateful_transaction_validator.rs#L284-297 | observed | |
| A17 | 目前没有已上线的 nonce abstraction；SNIP-8 的 channel 设计强制 channel 0 | [7] Account nonces 一节；[13] snip-8.md#L27@1789f44e | observed | |
| A18 | v3 交易对 L1_GAS、L2_GAS、L1_DATA 分别设 max_amount 和 max_price_per_unit（STRK/fri 计价） | [4] fields.rs#L202-210、transaction.rs#L665-678；[9]；[10] | observed | |
| A19 | v0.14.0 起 tip 参与排序，主网交易带非零 tip | [9] INVOKE v3 节；[11] v0.14.0；[37] tip 0x1 | observed | |
| A20 | gateway 拒收 paymaster_data 或 account_deployment_data 非空的交易 | [5] stateless_transaction_validator.rs#L47-48,#L112-150@54f97a8a | observed | |
| A21 | 原生 paymaster 未上线；代付依靠 SNIP-9 outside execution 与 SNIP-29 链下 API | 由 A20 推出：原生字段不可用；[16] SNIP-29 流程用 relayer 提交 SNIP-9 payload；[17] SNIP-20 仍为 Review | inferred | |
| A22 | Argent 与 Braavos 的 `__validate__` 拒绝非空 paymaster_data | [25] argent_account.cairo#L218@c30f61c5；[28] braavos_account.cairo#L423-425@158d7d0b | observed | |
| A23 | 合约地址 = Pedersen(“STARKNET_CONTRACT_ADDRESS”, deployer, salt, class_hash, Pedersen(ctor_calldata)) mod (2^251−256) | [4] core.rs#L307-345@54f97a8a | observed | |
| A24 | DEPLOY_ACCOUNT 计算地址时 deployer = 0 | [4] transaction.rs#L463-472@54f97a8a | observed | |
| A25 | DEPLOY_ACCOUNT 的手续费从新账户地址扣除，部署后 nonce = 1 | [7] Deploying a new account | observed | |
| A26 | 账户 nonce 为 0 且 mempool 已有其 deploy 时，nonce = 1 的 INVOKE 可跳过 validate 预检 | [5] stateful_transaction_validator.rs#L426-460@54f97a8a | observed | |
| A27 | SNIP-6 定义 `is_valid_signature`（返回 `'VALID'`），账户接口 id 为 0x2ceccef7…cc1cd，协议不强制 | [12] snip-6.md#L35,#L112；[24] accounts.cairo#L9@5cf9010e；[7] | observed | |
| A28 | SNIP-12 revision 0 用 Pedersen、revision 1 用 Poseidon | [15] snip-12.md#L38-41@1789f44e | observed | |
| A29 | SNIP-9 outside execution 的签名消息带 caller、独立 nonce、时间窗和 calls | [14] snip-9.md#L34-43,#L97-114@1789f44e | observed | |
| A30 | 账户可通过 `replace_class_syscall` 原地换 class，地址和存储保留 | [21] upgradeable.cairo#L46-49@5cf9010e；[26] upgrade.cairo#L83；[28] braavos_base_account.cairo#L90 | observed | |
| A31 | OZ 预设账户升级只要求自调用，不检查新 class 的接口 | [21] presets/src/account.cairo#L70-73、upgradeable.cairo#L46-49@5cf9010e | observed | |
| A32 | Argent 升级要求自调用、新 class 支持 SRC5 账户接口并实现 perform_upgrade 回调 | [26] src/upgrade.cairo#L68-85@c30f61c5 | observed | |
| A33 | Braavos 升级要求自调用、新 class 支持 ISRC6_ID，可选存储迁移 | [28] upgradable.cairo#L63-80@158d7d0b | observed | |
| A34 | OZ AccountComponent 用 Stark 曲线 ECDSA（corelib check_ecdsa_signature）验证 tx hash | [19] account.cairo#L342-373；[20] signature.cairo#L4,#L21-27@5cf9010e | observed | |
| A35 | OZ `__execute__` 断言 caller 为 0 且交易版本 ≥ 1 | [19] account.cairo#L71-81；[20] utils.cairo#L9-25@5cf9010e | observed | |
| A36 | v0.14.0 起协议对内部调用 `__execute__` 的交易做 revert | [11] v0.14.0 条目；[1] 0_14_4.json#L118；[3] syscall_base.rs#L492-500 | observed | |
| A37 | OZ EthAccount 用 secp256k1 syscall 验签 | [22] eth_account.cairo#L24,#L368-372；[20] signature.cairo#L38-68@5cf9010e | observed | |
| A38 | OZ cairo-contracts 内的 Falcon-512 账户只有 SHAKE-256 的 hint（60 felt）与 direct（31 felt）两种 verifier | [23] verifier_impls.cairo#L31-62@5cf9010e | observed | |
| A39 | 合约可用的密码学原语包括 secp256k1/r1、keccak、sha256 syscall 与 ecdsa、ec_op、pedersen、poseidon、blake builtin | [1] 0_14_4.json#L338,#L446,#L474,#L177-178 与 os_resources/execute_syscalls@54f97a8a | observed | |
| A40 | `Sha512ProcessBlock` 已可在合约中调用 | [1] 只在 versioned constants 的资源表中出现，没有核对 corelib 是否开放 | speculative | |
| A41 | Argent v0.5.0 支持 Starknet、Secp256k1、Secp256r1、Eip191、Webauthn 五类 signer，没有 PQ 类型 | [27] signer_signature.cairo#L14-44@c30f61c5 | observed | |
| A42 | Argent 有 guardian 时普通交易需 owner + guardian 双签，escape 默认安全期 7 天 | [25] docs/argent_account.md#L17；argent_account.cairo#L78@c30f61c5 | observed | |
| A43 | Braavos 部署时默认添加由助记词派生的 Stark signer，Strong Signer 为 secp256r1 | [28] README.md#L40-44@158d7d0b | observed | |
| A44 | Braavos 加了 Strong Signer 后，Stark signer 仍保留时间锁移除和低额度签名的权限 | [28] README.md#L47,#L58,#L101@158d7d0b | observed | |
| A45 | Ready（Argent）App 新建账户默认用 Stark 曲线 signer | [25] 文档示例用 signer type 0x0（Starknet），但没有 App 层一手说明 | speculative | |
| A46 | 主网有 OZ Falcon-512 账户的演示交易（INVOKE v3，31-felt 签名，SUCCEEDED，ACCEPTED_ON_L1） | [36] migration-register 链接 voyager tx；[37] RPC getTransactionByHash / getTransactionReceipt | observed | |
| A47 | 该 Falcon 演示交易在区块 12,156,522（2026-07-22，v0.14.3），消耗 63,932,548 L2 gas，费用约 1.926 STRK | [37] RPC receipt 与 block 查询 | observed | |
| A48 | 该 Falcon 演示账户是新部署账户，不是从 ECDSA 账户升级而来 | 由 A25、A46 推出：交易 nonce = 0x1，即 DEPLOY_ACCOUNT 后的第一笔交易 | inferred | |
| A49 | 已有账户不会自动变成 PQ，钱包、恢复、托管等需另行迁移 | [36] Accounts 一节 “What remains” | observed | |
| A50 | 已有 Stark-ECDSA 账户可以保留地址升级到 PQ class，但升级授权本身依赖旧 ECDSA 签名 | 由 A30、A31、A34 推出：升级必须经 `__validate__`（ECDSA）授权后自调用 replace_class | inferred | |
| A51 | 换成 PQ class 时如果保留 `is_valid_signature`、guardian、session 等旧签名路径，账户仍受 ECDSA 风险 | 由 A27、A42、A44 推出：这些都是独立于 `__validate__` 的授权路径 | inferred | |
| A52 | 主网当前运行 Starknet v0.14.4 | [37] getBlockWithTxHashes latest → 16357306，starknet_version 0.14.4 | observed | |
| A53 | EIP-7702 的授权通过 ecrecover 恢复 authority | [29] Behavior 第 3 步 | observed | |
| A54 | EIP-7702 允许已委托账户重新委托，委托地址为 0 时清除委托 | [29] Behavior 第 5、8 步 | observed | |
| A55 | EIP-7702 委托后的 EOA 仍可用原私钥直接发起交易 | [29] “Transaction origination” 一节 | observed | |
| A56 | 7702 委托 PQ 代码无法消除原 EOA 私钥的量子风险 | 由 A53、A55 推出：私钥仍能发交易和重新委托 | inferred | |
| A57 | ERC-4337 的 nonce 为 192 位 key + 64 位序号，可多通道并行 | [30] getNonce(address, uint192 key) L180 | observed | |
| A58 | ERC-7562 在验证阶段禁用 TIMESTAMP、NUMBER、BLOCKHASH 等环境操作码，Starknet 则改为取整 | [31] OP-011；[3] context.rs#L180-200 | observed | |
| A59 | EIP-7701 已撤回，RIP-7560、EIP-8141、EIP-8130 为 Draft | [32][33][34][35] frontmatter status | observed | |
| A60 | EIP-8141 以迁移到 PQ 为首要动机，但无代码账户的 default code 仍用 SECP256K1 签名 | [34] Motivation L22-23 与 Default code 一节 | observed | |

# Lane notes：NEAR Intents 与 Confidential Intents（Privacy）

研究问题：NEAR Intents（verifier 合约 `intents.near` + 链外 Message Bus / 1Click）与 Confidential Intents（FAR 私有链）在机制上怎样运作、各层信任边界在哪、用到了哪些 NEAR L1 能力，以及 2026-10-01 事件说明了什么。
一句话答案：Intents 的核心是**一个合约内的多资产账本**。用户和 solver 对 `token_diff` 等 intent 做链下签名，链外 relay 撮合后，由持有 `intents.near` function-call key 的 relayer 一次性提交 `execute_intents`。在一个 receipt 内，合约逐条验签、记账，最后检查“每个 token 的内部借贷必须配平”，否则整笔回滚。出入金则交给 PoA / Omni / HOT 三类桥，这部分是异步的、不原子。Confidential Intents 是在一条许可制私有 NEAR 分叉（FAR，合约 `intents.far`）上运行的同一套 verifier，带 `imt`/`far` feature；公链 Treasury ⇄ FAR 之间由 Private PoA Bridge 铸造 / 销毁 IMT。它对公链观察者隐藏余额与成交，但不对运营方（relay、FAR 验证者、桥）隐藏。
代码基准：near/intents @ 4127e8e8fbe4206fa910c4fe7f8028c9e0972348（2026-10-05，`defuse` crate 版本 0.4.4）。网页访问日期均为 2026-10-07。

---

## 1. Verifier 合约（`intents.near`）

### 1.1 内部账本与 token 标准
**答案**：verifier 是一个 NEP-245 多 token 账本。内部 token ID 有 4 种前缀：`nep141:` / `nep171:` / `nep245:` / `imt:`。`imt` 只在带 `imt` feature 的构建中可用（FAR 变体），主网默认构建不含 `ImtMint`/`ImtBurn` intent。
**依据**：`TokenId` 枚举含 Nep141 / Nep171 / Nep245 / Imt 四个变体 [15]；合约元数据声明 `nep245` 1.0.0 与 `dip4` [13]；`Intent::ImtMint/ImtBurn` 带 `#[cfg(feature = "imt")]` [2]；`Cargo.toml` 中 `imt = ["defuse-core/imt"]`、`far = ["imt"]`，默认 reproducible build 只用 `--features=contract`，另有 `variant.far` 用 `contract,far` [14]。存入时 NFT 的 total_supply 必须 ≤1 [12b]。
**不确定**：主网 `intents.near` 当前部署的 wasm 是否为 v0.4.4、是否确实不含 `imt`。这一点由构建配置推断，未链上核对 code hash。

### 1.2 存入与提现路径
**答案**：
- 存入：用户在 token 合约上调 `ft_transfer_call` / `nft_transfer_call` / `mt_batch_transfer_call`，`receiver_id = intents.near`，verifier 在 `ft_on_transfer` 中记账。`msg` 可以为空（记给 sender）、写一个 AccountId（记给别人），或写成 `DepositMessage` JSON（附带 `execute_intents` 与 `refund_if_fails`）。
- 提现：有两种入口，一是直接调用 `ft_withdraw` / `nft_withdraw` / `mt_withdraw`（附 1 yocto），二是签名 intent `ft_withdraw` / … / `native_withdraw`。合约先在本地扣账，再发出跨合约 `ft_transfer(_call)`，最后由 `ft_resolve_withdraw` 回调按结果退款。
**依据**：deposit.rs 中 `ft_on_transfer` 解析 `msg`；若 `refund_if_fails` 为真则同步调用 `self.execute_intents`，否则 `ext_intents...execute_intents(...).detach()` [12a]；文档 Deposits 页给出三种 `msg` 格式 [22]；withdraw.rs 中 `internal_ft_withdraw` 先 `self.withdraw(...)` 扣账，再 `.then(ft_resolve_withdraw)` [12b]；文档说明带 `msg`（走 `ft_transfer_call`）时失败不退款 [22]。
**不确定**：代码中 `is_call` 分支在 `ft_transfer_call` 返回成功时，会按返回的 used 量部分退款，返回 Err 时不退。文档把这种情况简化为“❌ 不退款”[22]，两者口径略有差异（inferred）。

### 1.3 `execute_intents` / `simulate_intents` 执行流程
**答案**：`execute_intents(signed: Vec<MultiPayload>)` 在**同一个函数调用 receipt** 内，对每个签名载荷依次执行以下步骤：
1. 验签，得到公钥；
2. 计算 intent hash；
3. 解出 `{signer_id, verifying_contract, deadline, nonce, intents}`；
4. 检查 `verifying_contract` 是否等于本合约；
5. 检查 deadline 是否已过期；
6. 检查 `signer_id` 是否持有该公钥；
7. 校验 versioned nonce（salt 有效、intent deadline ≤ nonce deadline、nonce 未过期）；
8. commit nonce（位图，重复即报错）；
9. 依序执行内部 intents。

全部执行完后调用 `finalize()`，检查 deltas 是否配平。任何一步出错都会 `panic`，整笔回滚。`simulate_intents` 对缓存状态跑同一个 engine，返回 report、`invariant_violated`（即未配平的 delta），以及当前 `fee` 与 `current_salt`。
**依据**：engine/mod.rs L32-L83 [5]；contract/intents/mod.rs 中 `execute_intents` 使用 `.unwrap_or_else(|e| e.panic())`，`simulate_intents` 返回 `SimulationOutput{report, invariant_violated, state{fee, current_salt}}` [10]；`DefuseIntents` 注释写明“不同 intent 创建的 Promise 并发执行，不依赖列表顺序”[2]；文档同样警告异步跨合约调用不保证完成顺序 [20]。
**不确定**：无。

### 1.4 intent 类型完整清单（@4127e8e）
**答案**：共 13 种，其中 2 种需要 `imt` feature。
1. `add_public_key`
2. `remove_public_key`
3. `transfer`
4. `ft_withdraw`
5. `nft_withdraw`
6. `mt_withdraw`
7. `native_withdraw`
8. `storage_deposit`
9. `token_diff`
10. `set_auth_by_predecessor_id`
11. `auth_call`（调用 `contract_id::on_auth(signer_id, msg)`，可附带从 wNEAR 余额扣除的 deposit）
12. `imt_mint`（需 `imt`）
13. `imt_burn`（需 `imt`）

**依据**：`enum Intent` 使用 `#[serde(tag = "intent", rename_all = "snake_case")]`，见 mod.rs L39-L83 [2]；`AuthCall` 定义见 auth.rs [2b]；文档列出的类型少于代码，缺 `set_auth_by_predecessor_id`、`auth_call`、`imt_*` [20]。
**不确定**：`AuthCall` 原本可选的 `state_init`（NEP-616）已被注释掉（"TODO: replace with UniversalStateInit"）[2b]。2026-10-01 还有 commit "disable state init (#361)" [42]。

### 1.5 `token_diff` 语义、不变量与费用
**答案**：
- **语义**：`token_diff` 只声明签名者自己账户的余额变化（例如 `{"A":"-100","B":"+200"}`），不指定对手方。执行时，每个非零 delta 直接加到 signer 余额上（`internal_apply_deltas`）。只有负 delta（token_in）收费：`fee = token_fee(...).fee_ceil(|delta|)`，记入 `fees_collected`，最后统一 `internal_add_balance(fee_collector, …)`。NEP-141 一律收费；NEP-245 / IMT 在 |delta|>1 时收费；NEP-171 以及 |delta|≤1 的 MT/IMT 免费。
- **不变量**：外层 `Deltas<S>` 包装器拦截所有内部 `internal_add_balance` / `internal_sub_balance`，按 token 记入 `TransferMatcher`。这覆盖了 `token_diff` 的 delta、`transfer` 和 fee 入账。`finalize()` 对每个 token 把存入与取出两两撮合成 `sender→receiver` 转账；只要还剩未撮合的量，就返回 `InvariantViolated::UnmatchedDeltas`，合约 panic。所以对每个 token 都必须满足 Σ(所有内部 delta，含 fee_collector 的入账) = 0。由此可推出：对手方的 token_diff 必须在扣除 fee 后与对方配平。`closure_*` 函数正是用来计算“给定 fee 下需要的反向 diff”的。
- **事件**：撮合结果以 NEP-245 `mt_transfer` 事件发出 [4][10]。
- **费率口径**：合约里的 fee 是可配置的 `Pips`（`set_fee`，需要 `FeesManager` 角色）[13][14b]。文档写明协议费为 **0.0001%（1 pip）**，记入 `fee_collector` [28]。
**依据**：token_diff.rs `execute_intent` 约 L41-L106 与 `fn token_fee` [3]；deltas.rs 中 `TransferMatcher::finalize` / `InvariantViolated` [4]；engine `finalize()` 映射为 `DefuseError::InvariantViolated` [5]；测试 `arbitrage_means_somebody_looses` 验证了环形套利必然有人亏 [3]。
**不确定**：主网当前的 fee 值只来自文档（1 pip），未调用 `fee()` view 核对。

### 1.6 签名标准（MultiPayload）
**答案**：`MultiPayload` 用 `#[serde(tag="standard")]` 区分 7 种标准：
- `nep413`、`raw_ed25519`、`ton_connect`、`sep53` → Ed25519
- `erc191`、`tip191` → Secp256k1
- `webauthn` → P256 或 Ed25519

不同标准的 envelope hash 不同，例如 NEP-413 用 SHA-256，ERC-191 用 Keccak256。NEP-413 的 `recipient` 字段，以及 payload 内的 `verifying_contract`，把签名绑定到具体合约，用来防止跨副本重放。
**依据**：multi.rs L19-L58 及 `verify()` 中的曲线映射 [6]；engine 检查 `verifying_contract` [5]；文档写明 “`recipient` 字段防止在 Verifier 的其他副本上重放” [20]。Message Bus 的 `publish_intent` 只接受 `nep413` / `erc191` / `raw_ed25519` [24]。
**不确定**：README 提到 BIP-322，但 @4127e8e 的 `MultiPayload` 中没有 BIP-322 变体 [1][6]。

### 1.7 nonce 设计
**答案**：nonce 为 256 位，用 permit2 风格的位图存储（`BitMap256`，前 248 位作 key），因此非顺序、可并发。
- **versioned nonce**：`MAGIC(5628f6c6, 4B) ‖ VERSION(1B) ‖ V1{ SALT(4B) ‖ DEADLINE(8B) ‖ RANDOM(15B) }`。
- **salt 与回收**：salt 由 `SaltManager` 轮换，旧 salt 失效后，按前缀回收 nonce（`cleanup_nonce_by_prefix`、garbage_collector）。
- **legacy nonce**：不带 magic 前缀的旧 nonce 目前仍被接受，代码注释说“近期将禁止”。
- **文档误差**：文档描述为 `[4B salt][28B unique]`，与代码不符。文档示例 nonce `Vij2xgAlKBKz…` 经 base64 解码为 `56 28 f6 c6 | 00 | 25 28 12 b3 …`，即 magic + V1 + salt `252812b3`，salt 正好对应文档中 `current_salt` 的示例值。
**依据**：nonce/mod.rs、versioned.rs L9-L29、salted.rs [7]；engine `verify_intent_nonce` [5]；文档 nonce 段 [20]。
**不确定**：legacy nonce 何时禁用，没有公开日期。

### 1.8 账户与公钥映射
**答案**：verifier 内的“账户”只是一个 AccountId 字符串，加上合约内部维护的公钥集合，与 NEAR 原生账户 / access key 是两套体系。
- **隐式账户**：从公钥派生，Ed25519 → 64 位 hex（NEAR implicit），Secp256k1 → `0x` + keccak256(pk)[12..]（ETH-implicit），P256 → `0x` + keccak256("p256"‖pk)[12..]。这类账户默认拥有自己的公钥，无需注册。
- **命名账户**：如 `alice.near`，需要先从该 NEAR 账户调用 `add_public_key`（附 1 yocto）注册公钥。
- **权限**：每个注册公钥都拥有完全权限，包括增删其他 key。
- **按调用者认证**：`auth_by_predecessor_id` 默认开启，即 NEAR 账户本身直接调用合约也算认证，可以用 intent 或方法关闭。
- **管理员权限**：管理员角色可以 `force_lock_account`、`force_*_withdraw`、强制开关 predecessor 认证。
**依据**：public_key.rs `to_implicit_account_id` 约 L35-L82 [8]；src/accounts.rs 中的 `AccountManager` / `ForceAccountManager` [9]；文档 Account Abstraction [21]；AddPublicKey 注释写明“泄露的隐式账户私钥需在 intents 内手动轮换”[2c]。
**不确定**：无。

### 1.9 `far.rs` 与 `imt` 是什么
**答案**：
- **`far.rs`**：只在 `far` feature 下编译，注释写明“只在 FAR 链使用，主链不支持”。它提供 `ForcePublicKeyManager`，即管理员批量 `force_add_public_keys` / `force_remove_public_keys`。
- **IMT（Intents Mintable / Multi Token）**：`imt:<minter_id>:<token_id>`。任何 signer 都可以通过 `imt_mint` 铸造绑定在自己名下（minter=signer）的 token，并通过 `imt_burn` 销毁指定 minter 的 token。Confidential Intents 中的私有资产即 `imt:<Treasury 账户>:nep141:<token>`。
**依据**：far.rs [14]；intents/imt.rs 注释说明 token_id 会被包装成 `imt:<minter_id>:<token_id>` [15]；token-id/src/imt.rs 注释“can be minted only by intents 'ImtMint'”[15]；文档 confidential-intents [32]。
**不确定**：FAR 上 Treasury 账户（`51e8f94d…7cbe`，64 位 hex，看起来是 Ed25519 隐式账户）的私钥由谁持有、是否在 TEE 内，未见公开说明（speculative）。

---

## 2. Solver、Message Bus 与 1Click

### 2.1 Message Bus（solver relay）RFQ 流程
**答案**：
1. 前端（或 1Click）向 `https://solver-relay-v2.chaindefuser.com/rpc` 发起 `quote`。relay 通过 WebSocket 广播给所有已连接的 solver，最多等待 3000 ms，然后汇总返回报价。
2. solver 用自己在 verifier 注册过的 key 签好 `token_diff`，作为报价响应。
3. 用户选定报价并签自己的 intent，通过 `publish_intent(s)` 携带 `quote_hashes` 提交。
4. Message Bus 把双方 intent 打包，调用 `execute_intents` 上链。

状态依次为 `PENDING → TX_BROADCASTED → SETTLED`，失败为 `NOT_FOUND_OR_NOT_VALID`。协议本身不依赖 Message Bus：前端可以用任意报价机制，solver 也可以直接索引链上数据。
**依据**：message-bus 概览 [23]；RPC 参考 [24]；Example/Quickstart 中 solver 先 `add_public_key` 再存入流动性 [25]。
**谁提交交易**：verifier 有 `add_relayer_key`（需 DAO 或 RelayerKeysManager 角色），会在 `intents.near` 账户上添加 **只能调用 `execute_intents` 的 function-call access key**，allowance 为 Unlimited [11]。据此推断，Message Bus 正是用这类 key 以 `intents.near` 自身身份提交交易，gas 由合约账户支付（inferred）。
**不确定**：relayer key 的数量和持有方未公开。

### 2.2 solver 准入
**答案**：
- 公共 relay 的 WS/RPC 需要 Partner JWT（`X-API-Key`），通过 partners.near-intents.org 申请，并要求完成 KYC/KYB。
- 私有 relay 自 2026-07-13 起改为白名单：只允许 WebSocket 接入，不在名单上的 solver 被完全拒绝。
- 链上没有 solver 白名单：verifier 只看签名与余额。
**依据**：MM Quickstart [25]；RPC Authentication [24]；Changelog 2026-07-13 [35]；verifier 代码中没有 solver 角色 [10][13]。

### 2.3 1Click API
**答案**：
- **入口**：`POST https://1click.chaindefuser.com/v0/quote`。
- **主要字段**：`dry`、`swapType`（EXACT_INPUT / EXACT_OUTPUT / FLEX_INPUT / ANY_INPUT）、`slippageTolerance`（bps）、`originAsset` / `destinationAsset`（形如 `nep141:…omft.near` 的 assetId）、`amount`、`depositType`（`ORIGIN_CHAIN` / `INTENTS` / `CONFIDENTIAL_INTENTS`）、`recipient` + `recipientType`（`DESTINATION_CHAIN` / `INTENTS` / `CONFIDENTIAL_INTENTS`）、`refundTo` + `refundType`（`ORIGIN_CHAIN` / `INTENTS` / `CONFIDENTIAL_INTENTS`）、`confidentiality`（`public` / `basic` / `advanced`）、`deadline`（ISO）、`appFees`。
- **ORIGIN_CHAIN 流程**：返回 `depositAddress`，用户转账后可选调用 `/v0/deposit/submit` 提交 txHash，再用 `/v0/status?depositAddress=` 轮询状态。
- **INTENTS / CONFIDENTIAL_INTENTS 流程**：改走 Signed Intent Execution。
- **状态机**：`PENDING_DEPOSIT → KNOWN_DEPOSIT_TX → PROCESSING → SUCCESS`；分支状态为 `INCOMPLETE_DEPOSIT`、`REFUNDED`、`FAILED`。
- **托管表述**：文档称“资产进入 quote 专属 deposit address 并在链上结算，1Click 不托管”。
**依据**：Making a Request [26]；about-1click 页（answer 模式摘录）[26b]。
**不确定**：deposit address 的密钥由谁控制、它在 verifier 中对应哪个账户、谁替 ORIGIN_CHAIN 用户签 `token_diff`，文档都没有说明（见开放问题）。

### 2.4 费用（访问 2026-10-07）
**答案**：
- **协议费**：0.0001%（1 pip），由 `intents.near` 收取 [28]。
- **1Click 平台费**：无 API key 时额外加 25 bps；有 key 且无 `appFees` 时为 20 bps，USDC/USDT/DAI 对以及同资产跨链为 1 bp；有 key 且带 `appFees` 时 50/50 分成，1Click 那一半最低 20 bps（或 1 bp）。合计上限 500 bps。`ANY_INPUT` 不收平台费，也不允许带 `appFees`。
- **其他费用**：near-intents.org 前端收 0.2%；NEAR / ZEC / STRK 提到 Solana 收 0.1% 提现费；另有 quote improvement fee，即成交价优于报价时差额 50/50 分（限约 30 分钟内的新鲜报价）[27][28][29]。

---

## 3. 一笔跨链 swap 的生命周期（例：Ethereum USDC → BTC，1Click ORIGIN_CHAIN 路径）

| 步 | 系统 | 签名者 | 内容 | 原子性 / 失败处理 | 类型 |
|---|---|---|---|---|---|
| 1 | 1Click API（链外） | 无（集成方 JWT 鉴权） | `POST /v0/quote`，`originAsset=nep141:eth-0xa0b8…omft.near`，`destinationAsset=nep141:btc.omft.near`，`recipient=bc1…`，`refundTo=0x…`，`refundType=ORIGIN_CHAIN`，`deadline`，`slippageTolerance` [26] | 无链上状态 | observed |
| 2 | Message Bus（链外） | solver（用其注册的 key 签 `token_diff`） | relay 向 solver 广播请求，solver 返回签好的报价 [23][24] | 报价有 `expiration_time` / `min_deadline_ms` | observed |
| 3 | Ethereum | 用户的 EVM 钱包 | 把 USDC 转到 `depositAddress` [26] | 源链 finality 由 Ethereum 决定；金额不足则 `INCOMPLETE_DEPOSIT` | observed |
| 4 | 桥（PoA 或 Omni）→ NEAR | 桥运营方（PoA：token 合约 owner 铸币）/ Omni：证明或 MPC | 在 NEAR 上铸出 `…omft.near`，并 `ft_transfer_call` 存入 `intents.near`；PoA factory 的 `ft_deposit` 可带 `msg` 转发 [17][30] | 异步；与 swap 不原子 | inferred（具体路由由 1Click 选择） |
| 5 | NEAR `intents.near` | 用户侧 intent（由 1Click / deposit 账户代签，机制未公开）+ solver 的 `token_diff`；交易由 relayer key 提交 | `execute_intents([user_diff, solver_diff, …])`，一个 receipt 内完成验签、记账、配平检查 [5][10][11] | **原子**：配平失败或任一 intent 出错，整笔 panic 回滚 | observed（合约）/ inferred（谁签用户侧） |
| 6 | NEAR → 桥 → Bitcoin | 同一批中的 `ft_withdraw` intent（PoA：向 token 合约 `ft_transfer`，memo 为 `WITHDRAW_TO:bc1…`）；PoA 运营方放款，或 Omni 由 MPC 网络联合签 BTC 交易、relayer 广播 [17][31] | verifier 本地扣账后发出异步 Promise；目标合约失败时，`ft_resolve_withdraw` 退回 verifier 余额 [12b]；外链放款不在 NEAR 原子域内 | observed / inferred |
| 7 | 1Click | — | 状态 `SUCCESS`；若在 deadline 前无法成交，则 `REFUNDED` 到 `refundTo` [26] | 退款是一笔新的出金 | observed（状态）/ inferred（机制） |

**结论**：只有第 5 步（以及第 6 步中的“本地扣账 + 调度 Promise”）落在同一个原子域内。入金、出金和外链交付是三个独立域，各自依赖不同桥的信任模型（inferred）。

---

## 4. Confidential Intents

### 4.1 架构
**答案**：
- **两条链**：公链 NEAR 上的 `intents.near` 记录公共余额；FAR 是 NEAR 协议的许可制私有实例，验证者集合小、没有公网 P2P、RPC 只能经认证访问，上面部署 `intents.far`。
- **Shield**：先把 token `transfer` 给公链上的 Treasury 账户（memo 中带加密的 recipient），再由 Private PoA Bridge 在 FAR 上铸造等额 IMT。
- **私有成交**：在 FAR 上用 `token_diff` 交换余额。
- **Unshield**：在 FAR 上 `imt_burn`，由桥从 Treasury 放出公链资产。
- **桥的工作方式**：请求驱动，经 RPC 请求处理存入与销毁，而不是主动监听链上事件。
- **私有 relay**：与公共 Message Bus 分开。广播的资产 ID 是 IMT 包装后的；**验签依据公链 `intents.near`，读余额读 FAR**；它本身不负责结算。
- **nonce**：必须使用 versioned nonce，私有合约的 salt 是生产常量 `e110f317`。
**依据**：MM 文档 Confidential Intents [32]；Confidential Example（环境变量 `PRIVATE_INTENTS_CONTRACT=intents.far`、`PRIVATE_TREASURY_ACCOUNT_ID=51e8…`）[33]；`far` 构建变体 [14]。

### 4.2 solver 的 shield / swap / recover 三段式
**答案**：solver 在 `private_signed_data` 中最多返回三份签名：
- `shield`（可选）：在**公链** `intents.near` 上把 `transfer` 发给 Treasury；
- `swap`（必需）：在 `intents.far` 上执行，恰好含一个 `token_diff`，可以附带一个 `imt_burn` 以便立即 unshield；
- `recover`（若有 shield 则必需）：在 `intents.far` 上执行的 `imt_burn`，**与 `swap` 共用同一个 nonce**。

由于 nonce 只能 commit 一次，`swap` 和 `recover` 最多只有一个能上链，这样 solver 的流动性不会被困在 FAR。solver 应只在收到 `quote_settle_successful` 后放出资金。
**依据**：[32][33]；nonce 位图“重复即 `NonceUsed`”[7]。这里的互斥性由 nonce 唯一性推出（inferred，文档也明说“only one can land”，故可视为 observed）。

### 4.3 用户侧产品页的说法（intents.near.org/confidential，访问 2026-10-07）
**答案**：
- 运行在 “dedicated NEAR private shard”，由 “a decentralized set of independent permissioned validators” 运营；
- 通过 “TEE-based bridge” 连接主网；
- 不需要客户端生成 ZK proof；
- 面向机构提供 “auditable execution with selective disclosure”；
- 宣称 “no MEV, no frontrunning”；
- 在 near.com 上可以在 Main Account 与 Confidential Account 之间切换。

**与开发者文档的差异**：
- 文档称“small validator set”与“Private PoA Bridge”，产品页称“decentralized … validators”与“TEE-based bridge”；
- 文档没有描述 TEE 度量或 attestation，也没有描述选择性披露的机制 [32][36]。

### 4.4 上线时间线
- 2026-02-25：首次发布。只有二手来源（chainplay.gg、nearstats），官方博客 near.org/blog/confidential-intents 是 JS 渲染页，未能读到日期（speculative）。
- 2026-07-01：1Click 报价新增 `confidentiality` 参数 [35]。
- 2026-07-13：“Confidential Intents B2B launch”，开发者文档上线，私有 relay 改为白名单 [35]。
- 之后：near.org 发布 GA 博客，“now open to all developers”，日期未取到 [S1]。
- 2026-08-28：1Click Limit Orders（机密挂单）上线 [35]。

### 4.5 对谁保密 / 不对谁保密

| 观察者 | 能看到 | 看不到 | 类型 |
|---|---|---|---|
| 公链观察者 / 索引器 | shield 时公链上发给 Treasury 的 `transfer`（金额、时间、发送方；recipient 加密在 memo 中）；unshield 时 Treasury 的放款 | FAR 上的余额与 `token_diff` 成交 | observed（shield 是公链 transfer [33]）+ inferred（可见性推论） |
| 文档的隐私承诺 | “deposits and withdrawals cannot be tracked to each other” | — | observed（声明 [34]），效果未经验证 |
| solver | relay 广播的 quote 请求（IMT 资产 ID、金额）；自己参与的成交 | 其他 solver 的报价（未说明） | observed [32] / speculative |
| 私有 relay 运营方（Defuse / NEAR Intents） | 全部 quote 请求和签名 intent，并读取 FAR 余额 | — | inferred（来自 relay 的职责 [32]） |
| FAR 验证者 / RPC 运营方 | FAR 完整状态（NEAR 协议本身没有状态加密；产品页只说 bridge 用 TEE） | — | inferred |
| 1Click 后端 | 用户的机密余额与历史（`/v0/account/balances` 需要 User-Session token，数据来自 “private balance sources”） | — | observed（接口 [29]）+ inferred |
| 合规 / 执法 | 选择性披露（产品页）+ Kodex 执法请求门户 + SHIELD 可延迟或暂停 | — | observed（声明 [36][38]），机制 speculative |

小结：这是“对公众保密”，不是“对运营方保密”。它也不是密码学意义上的隐私（不是 ZK 或加密状态），信任根在于许可制验证者、私有 RPC 与桥运营方（inferred）。

---

## 5. 安全与合规层

### 5.1 SHIELD（proactive-intents-security，访问 2026-10-07）
**答案**：SHIELD 是一个事件与策略服务，按状态分三层：
- **Live today**：事件提交与解除、作用域化权限、三档安全模式（`normal` / `paranoid` / `under_attack`）、1Click 报价时评估（可以 allow 或 scoped delay）、公开状态页。
- **Rolling out**：把 SHIELD 决策推广到更多请求路径与桥相关流程；资金流检查；按链细化的 scope enforcement。
- **Vision**：solver 池与流动性控制、链健康适配器（PoW / EVM / NEAR）、按交易或账户精确施加摩擦。

异常引擎被描述为“基于规则、可解释，而非模型驱动”。2026-07-03 上线了 Shield Incident API（`shield.chaindefuser.com/incident`）[35][37]。
**矛盾**：Polosukhin 在 2026-10-02 的帖子中称 SHIELD 为 “the AI security layer on Intents”[40]，而文档说异常引擎“rule-based … rather than model-driven”[37]。

### 5.2 Risk & Compliance
**答案**：在集成的报价流程上做实时地址筛查，数据源包括 NEAR Intents AML Portal、Binance AML、AMLBot & PureFi，以及 TRM Labs（用于 non-dry 报价）。文档注明“覆盖范围因流程和集成路径而异”。执法请求只受理 Kodex 门户提交的 [38]。
**链上兜底能力**：verifier 有 Pausable（`intents` 暂停开关，DAO / PauseManager），以及 `force_lock_account`、`ft_force_withdraw` 等角色化强制操作 [9][12b][13]。这些属于运营方可以干预用户资金的信任假设（observed 代码；“属于信任假设”为 inferred）。

---

## 6. 2026-10-01 安全事件

**官方说明（一手）**：@near_intents 于 2026-10-01 12:53 UTC 发帖 [39]，要点如下：
- 服务因检测到安全事件而停止，原因是 “a bug in the Omni deposit and withdrawal infrastructure interaction with NEAR Intents smart contract”；
- 初步损失约 $3.8M，承诺全额补偿；
- 合约侧漏洞已修补，预计 1 小时内恢复；
- BSC、Polygon、TON、Optimism、Avalanche、Stellar、Monad、LayerX、Adi、Scroll、Plasma 共 11 条链的存取款再暂停约 12 小时；
- 已报警，“A detailed report will be shared publicly in the following days”。

**资金归还**：
- Shevchenko（NEAR Intents GM）先发帖称 “We have identified you”，给出 BTC / BNB-ETH / SOL 三个归还地址，限期 48 小时 [41a]；
- 2026-10-02 他再发帖：“sent back in full … stopping the investigation … use bug bounties”[41b]；
- Polosukhin 称资金于 2026-10-02 14:30 UTC 全额收回，并在不到 24 小时内借助 SHIELD 识别出责任方 [40]。

**根因**：截至 2026-10-07，未找到官方详细报告，只有“Omni 存取款基础设施 × verifier 合约交互”这一句。

**推断 1（inferred）**：官方停用的 11 条链与文档中 HOT Bridge 的支持链（BNB、Polygon、Optimism、Avalanche、Scroll、Monad、TON、Stellar、LayerX、Adi、Plasma）**完全一致**，而文档称 HOT Bridge “routes assets through the HOT/Omni protocol”[30][39]。因此公告里的 “Omni” 很可能指 HOT 的 Omni 基础设施，而不是 NEAR 官方的 Omni Bridge（后者负责 ETH / Base / Arb / BNB / SOL / BTC）。新闻（coinotag、tangem 等）称资金从 BNB Chain 上的 hot wallet / HOT Bridge treasury 流出，与此相符，但属于二手信息。

**推断 2（speculative）**：near/intents 仓库在事发当天的提交序列如下 [42]：
- 2026-10-01 18:02Z：“chore: reproduce bug (#362)”，提交信息含 “TEMP change that reflects deployed state … refunded amount check in mt_resolve_deposit”；
- 19:03Z：“disable state init (#361)”；
- 20:57Z：“limit number of batch tokens (#364)”；
- 21:29Z：发布 `defuse/v0.4.3`；
- 2026-10-02 12:50Z：“limit MT tokens in simulation, too (#367)”；12:55Z：发布 `defuse/v0.4.4`。

另外，`execute_intents` 里有一段注释：“prevent resolve transfer from failing due to too long event log”[10]。这些线索都指向 NEP-245 存入回调（`mt_resolve_deposit`）的退款计算，以及批量 token 数量 / 事件日志长度的边界。HOT 资产以 NEP-245 形式存入 verifier，与此吻合，但官方没有确认，因此只能列为线索。

**修复**：官方称“合约侧漏洞已修补”[39]；仓库中可见 v0.4.3 / v0.4.4 两次发布，以及上面的限制性改动 [42]。是否就是这次修复，未经官方确认。

---

## 7. Intents 与 NEAR L1 设计的对应

| 设计点 | 说明 | 类型 |
|---|---|---|
| 把需要原子性的余额集中到一个合约 | NEAR 的跨合约调用是异步 receipt，后续调用失败不会回滚前面的状态。verifier 把多方余额放在自己的存储里，一次 `execute_intents` 就在单个 receipt 内完成多方结算，失败即 panic 回滚 [5][10]。官方文档没有明说这是设计动机；文档只警告“verifier 发出的跨合约调用不保证完成顺序”[20] | inferred |
| 单合约热点 vs 分片 | `intents.near` 是单个账户，只位于一个 shard 上，所有结算都在该 shard 上串行执行，吞吐受单 shard（以及单合约 gas）限制。分片对它的扩展作用主要体现在外围：各 token 合约、用户、桥合约分布在其他 shard（inferred）。2026-10-01 的“limit number of batch tokens”也说明单笔批量存在上限 [42] | inferred |
| access keys | relayer key 是 `intents.near` 上限定 `execute_intents`、allowance 为 Unlimited 的 function-call key [11]；文档建议用 FunctionCall key 自动同步 key 轮换 [21] | observed |
| 账户模型 / implicit accounts | verifier 复用 NEAR implicit（hex64）与 ETH-implicit（0x…）账户格式，使外链钱包无需开 NEAR 账户 [8][21] | observed |
| `predecessor_id` 认证 | NEAR 原生账户可以直接调用合约方法完成认证（`auth_by_predecessor_id`）[9] | observed |
| NEP-141/171/245 回调模式 | 存入用 `*_transfer_call` → `*_on_transfer`，提现用 Promise `.then(resolve)` 退款（典型 NEAR 异步回调模式）[12] | observed |
| global contracts / deterministic accounts（NEP-591 / NEP-616） | wallet、outlayer-app、global-deployer、escrow-swap 都基于 deterministic AccountId 或 global contract [18]；verifier 自己的 `state_init` 已注释或禁用 [2b][42] | observed |
| Chain Signatures | Omni Bridge 的 BTC 提现由 MPC 网络联合签名 [31]；intents 仓库含一个面向 `v1.signer` 的链下 MPC 签名客户端 crate [16]。在已读的 verifier 代码中，未见 verifier 直接调用 `v1.signer`（未全量 grep） | observed / inferred |
| yield / resume | 已读的 verifier 代码中未见使用（未全量 grep） | speculative |
| 同一协议的私有实例 | FAR = 许可制 NEAR 协议实例，加上同一份 verifier 代码的 `far` 构建 [14][32] | observed |

---

## 8. 仓库内其他合约
- **escrow-swap**：确定性部署的托管交换合约。锁定 maker 的 `src_token`，由白名单（或无许可）taker 用 `dst_token` 成交；支持部分成交、到期后任何人可关闭，关闭后自删除；可以作为链下拍卖的落地合约 [18a]。
- **wallet**：极简钱包合约，提供“分片的、可扩展的”账户抽象。可执行任意 Promise，支持 extension（2FA、社交恢复、限额、session key 等）和 passkey（p256 / ed25519）签名；AccountId 由初始状态确定性派生（NEP-616），满足 NEP-448 零余额账户（770 字节）。README 标注**未审计**；2026-06-30 发布 v0.2.0，包含 ABI 破坏性变更 [18b][43]。
- **global-deployer**：为 NEP-591 global contract 提供“两步部署”。owner（通常是 DAO）先 `gd_approve(code_hash)`，再由任何人 `gd_deploy(code)` 上传匹配的 wasm [18c]。
- **outlayer/app**：每个 app 一个 global contract 实例（确定性账户），记录 `code_hash` 与 `code_url`，作为 app 代码位置的链上权威引用 [18d]。
- **treasury-logger**：被动接收 NEP-245 `mt_on_transfer` 并发事件、单调递增 nonce 的“只写审计日志”。README 自述事件只是 predecessor 的声明，不构成存入证明 [18e]。
- **poa/factory + poa/token**：PoA 桥的 NEAR 侧。factory 部署 `token.<factory>`，只有 owner 能铸币（`ft_deposit`）；提现方式是向 token 合约自身 `ft_transfer`，memo 写 `WITHDRAW_TO:<外链地址>` [17]。推断主网 `*.omft.near` 即此类 token（由命名推断）。

---

## 图的素材

**A. 公共 swap 时序（参与者：User / Frontend · 1Click · Message Bus · Solver · Origin chain · Bridge · intents.near · Token 合约 · Dest chain）**
1. Frontend → 1Click：`POST /v0/quote` [26]
2. 1Click → Message Bus：`quote` [24]
3. Message Bus ⇉ Solvers：WS 广播；Solver → Bus：签名报价（`token_diff`）[23][25]
4. 1Click → Frontend：`depositAddress`、报价 [26]
5. User → Origin chain：转账到 `depositAddress` [26]
6. Bridge → NEAR：铸 bridged token，`ft_transfer_call` → `intents.near.ft_on_transfer`（记账）[12a][17]
7. Bus（relayer key）→ `intents.near.execute_intents([user, solver])`：验签 → nonce → token_diff → finalize（配平）[5][11]
8. `intents.near` → token 合约：`ft_transfer`（`WITHDRAW_TO:`）→ `ft_resolve_withdraw` 回调 [12b][17]
9. Bridge → Dest chain：放款（PoA 运营方 / Omni MPC 签名）[30][31]
10. 1Click 状态：`PENDING_DEPOSIT → KNOWN_DEPOSIT_TX → PROCESSING → SUCCESS | REFUNDED | FAILED | INCOMPLETE_DEPOSIT` [26]
原子域标注：只有第 7 步原子 [5]。

**B. `execute_intents` 内部状态机**：`verify sig → hash → extract payload → verifying_contract == self? → deadline ≥ now? → has_public_key? → versioned nonce (salt valid, deadline ≤ nonce.deadline, not expired) → commit nonce → execute intents[] → finalize: unmatched deltas? → panic | emit mt_transfer` [5][10]

**C. Confidential shield → 私有交换 → unshield（参与者：Solver/User · intents.near（公链）· Treasury（公链账户）· Private PoA Bridge · intents.far（FAR）· Private Relay）**
1. （shield）Solver 签 `transfer → Treasury`（memo 加密 recipient）@`intents.near` [33]
2. Private PoA Bridge（RPC 请求驱动）→ `intents.far`：铸造 `imt:<Treasury>:nep141:X` [32]
3. Private Relay ⇉ 白名单 Solver：IMT 资产报价请求；验签依据 `intents.near`，读余额读 FAR [32][35]
4. （swap）`intents.far.execute_intents`：`token_diff`（可附 `imt_burn`）[32][33]
5. （recover，与 swap 同 nonce，二者择一）`imt_burn` [32]
6. （unshield）`imt_burn` @FAR → Bridge 从 Treasury 放出公链资产 → relay 推送 `shield_status: unshielded` [32]

**D. 对比维度（Public Intents vs Confidential Intents）**：合约（`intents.near` / `intents.far`）、链（公链 NEAR / 许可制 FAR）、资产 ID（`nep141:…` / `imt:<treasury>:nep141:…`）、nonce（deterministic 或 legacy 均可 / 必须 versioned，salt `e110f317`）、relay（公共 Message Bus + JWT / 私有 relay + 白名单 WS-only）、余额查询（链上 view / 1Click API + User-Session）、桥（PoA / Omni / HOT / Private PoA Bridge）[32][33][35]

**E. 时间线**
- 2026-02-25：Confidential Intents 首发（二手来源）[S2]
- 2026-06-27：1Click 报价签名 [35]
- 2026-06-30：wallet v0.2.0 [43]
- 2026-07-01：`confidentiality` 参数 [35]
- 2026-07-03：Shield Incident API [35]
- 2026-07-13：Confidential B2B 上线 + 私有 relay 白名单 [35]
- 2026-08-28：Limit Orders [35]
- 2026-09-09 / 09-14：$1,000 / Tron $100 报价下限 [35]
- 2026-09-18：Robinhood Chain [35]
- 2026-10-01 12:53Z：事件公告 [39]
- 2026-10-01 18:02–21:29Z：#362 → #361 → #364 → v0.4.3 [42]
- 2026-10-02：v0.4.4 [42]；资金全额归还（14:30Z）[40][41b]

---

## 代码素材

**C1. `TokenDiff` 结构**（near/intents/contracts/defuse/core/src/intents/token_diff.rs#L25-L39@4127e8e8fbe4206fa910c4fe7f8028c9e0972348）
```rust
/// The user declares the will to have a set of changes done to set of tokens. For example,
/// a simple trade of 100 of token A for 200 of token B, can be represented by `TokenDiff`
/// of {"A": -100, "B": 200} (this format is just for demonstration purposes).
pub struct TokenDiff {
    #[serde_as(as = "Amounts<BTreeMap<_, DisplayFromStr>>")]
    pub diff: TokenDeltas,            // = Amounts<BTreeMap<TokenId, i128>>
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub memo: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub referral: Option<AccountId>,
}
```

**C2. 一对 `token_diff` intent（JSON，忽略 fee；文档示例）**[20]
```json
{"signer_id":"alice.near","verifying_contract":"intents.near","deadline":"2025-05-21T11:30:25Z",
 "nonce":"Vij2xgAlKBKz...","intents":[{"intent":"token_diff",
 "diff":{"nep141:usdc.near":"-10","nep141:usdt.near":"10"}}]}
// bob.near 签对称的 {"nep141:usdc.near":"10","nep141:usdt.near":"-10"}
// 二者包成 MultiPayload（standard: nep413 / erc191 / …）后一起提交 execute_intents
```

**C3. `execute_intents` 入口**（near/intents/contracts/defuse/src/contract/intents/mod.rs#L24-L42@4127e8e8fbe4206fa910c4fe7f8028c9e0972348）
```rust
#[near]
impl Intents for Contract {
    #[pause(name = "intents")]
    fn execute_intents(&mut self, signed: Vec<MultiPayload>) {
        if let Some(event) = Engine::new(self, ExecuteInspector::default())
            .execute_signed_intents(signed)       // verify → nonce → execute → finalize
            .unwrap_or_else(|e| e.panic())         // 任一失败：整个 receipt 回滚
            .as_mt_event()
        {
            event.check_refund().unwrap_or_else(|err| err.panic()).emit();
        }
    }
```

**C4. relayer key = 限定 `execute_intents` 的 function-call access key**（near/intents/contracts/defuse/src/contract/intents/relayer.rs#L14-L27@4127e8e8fbe4206fa910c4fe7f8028c9e0972348）
```rust
#[access_control_any(roles(Role::DAO, Role::RelayerKeysManager))]
fn add_relayer_key(&mut self, public_key: PublicKey) -> Promise {
    assert_one_yocto();
    Self::ext(env::current_account_id())
        .do_add_relayer_key(public_key.clone())
        .add_access_key_allowance(
            public_key, Allowance::Unlimited,
            env::current_account_id(), EXECUTE_INTENTS_FUNC,
        )
}
```

**C5. 1Click 报价请求（Ethereum USDC → BTC 地址，按文档字段改写示意）**[26]
```json
{"dry":false,"swapType":"EXACT_INPUT","slippageTolerance":100,
 "originAsset":"nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near",
 "depositType":"ORIGIN_CHAIN","destinationAsset":"nep141:btc.omft.near",
 "amount":"1000000000","recipient":"bc1q...","recipientType":"DESTINATION_CHAIN",
 "refundTo":"0xUser...","refundType":"ORIGIN_CHAIN","deadline":"2026-10-07T12:00:00Z"}
```
（USDC assetId 是按 `eth-<合约地址>.omft.near` 规则构造的示意值，实际以 `/v0/tokens` 返回为准。）

**C6. versioned nonce 布局**（near/intents/contracts/defuse/core/src/nonce/versioned.rs#L9-L24@4127e8e8fbe4206fa910c4fe7f8028c9e0972348）
```rust
///     `VERSIONED_MAGIC_PREFIX (4 bytes) || VERSION (1 byte) || NONCE_BYTES (27 bytes)`
///     - V1: `SALT (4 bytes) || DEADLINE (8 bytes) || NONCE (15 random bytes)`
pub enum VersionedNonce { V1(SaltedNonce<ExpirableNonce<[u8; 15]>>) }
// NOTE: Legacy nonces can still be used at this time, but will be prohibited out in the near future.
pub const VERSIONED_MAGIC_PREFIX: [u8; 4] = hex!("5628f6c6");
```

---

## 来源
- [1] **PRIMARY** near/intents README.md @4127e8e：verifier（原名 defuse）在一个合约内完成 P2P 原子交换；README 提到 BIP-322 等 Payload trait。
- [2] **PRIMARY** contracts/defuse/core/src/intents/mod.rs#L28-L83 @4127e8e：`DefuseIntents` 与 13 种 `Intent` 变体（2 种受 `imt` feature 控制），以及“Promise 并发执行”的注释。[2b] intents/auth.rs：`AuthCall` 语义，`state_init` 已注释。[2c] intents/account.rs：AddPublicKey 的权限与隐式账户 key 警告。
- [3] **PRIMARY** contracts/defuse/core/src/intents/token_diff.rs @4127e8e：`token_diff` 执行逻辑、只对负 delta 收费、按 token 类型免费的规则、closure 计算与测试。
- [4] **PRIMARY** contracts/defuse/core/src/engine/state/deltas.rs @4127e8e：`Deltas` / `TransferMatcher` 拦截内部增减余额；`finalize` 未配平时返回 `InvariantViolated`；输出 mt_transfer。
- [5] **PRIMARY** contracts/defuse/core/src/engine/mod.rs#L32-L113 @4127e8e：验签 → verifying_contract → deadline → 公钥 → versioned nonce → commit → 执行 → finalize 的顺序。
- [6] **PRIMARY** contracts/defuse/core/src/payload/multi.rs#L19-L58 @4127e8e：7 种签名标准及其曲线映射。
- [7] **PRIMARY** contracts/defuse/core/src/nonce/{mod.rs, versioned.rs, salted.rs} @4127e8e：permit2 风格位图 nonce、versioned 布局、legacy 仍被接受。
- [8] **PRIMARY** contracts/defuse/core/src/public_key.rs#L35-L82 @4127e8e：Ed25519 / Secp256k1 / P256 → 隐式 AccountId 的派生方式。
- [9] **PRIMARY** contracts/defuse/src/accounts.rs @4127e8e：`add_public_key` / `remove_public_key` / predecessor 认证；管理员可 force lock / unlock 账户、强制切换认证。
- [10] **PRIMARY** contracts/defuse/src/contract/intents/mod.rs#L24-L64 @4127e8e：`execute_intents` panic 即回滚；`simulate_intents` 返回 fee 与 current_salt；“too long event log”注释。
- [11] **PRIMARY** contracts/defuse/src/contract/intents/relayer.rs#L14-L27 @4127e8e：relayer key 是只能调 `execute_intents` 的 function-call key（Unlimited allowance）。
- [12] **PRIMARY** [12a] contracts/defuse/src/contract/tokens/nep141/deposit.rs @4127e8e：`ft_on_transfer` 存入与 `DepositMessage`（`execute_intents`、`refund_if_fails`）；[12b] nep141/withdraw.rs 与 contract/tokens/mod.rs：先扣账再 Promise，`ft_resolve_withdraw` 退款，`ft_force_withdraw` 角色，NFT total_supply ≤1。
- [13] **PRIMARY** contracts/defuse/src/contract/mod.rs @4127e8e：角色列表（DAO、FeesManager、RelayerKeysManager、UnrestrictedWithdrawer、PauseManager、SaltManager、GarbageCollector 等）、Pausable、nep245 元数据。
- [14] **PRIMARY** contracts/defuse/src/far.rs 与 contracts/defuse/Cargo.toml#L67-L68 @4127e8e：`far` = `imt` + ForcePublicKeyManager，“只用于 FAR 链”；reproducible build 的 far 变体。[14b] contracts/defuse/src/fees.rs：`set_fee` / `fee_collector`。
- [15] **PRIMARY** contracts/defuse/core/src/intents/imt.rs 与 crates/primitives/token-id/src/{lib.rs, imt.rs} @4127e8e：4 种 TokenId；IMT 绑定 minter，只能经 ImtMint 铸造。
- [16] **PRIMARY** crates/mpc/signer/src/lib.rs @4127e8e：链下 MPC 签名客户端，常量 `MAINNET_MPC_CONTRACT_ID = v1.signer`。
- [17] **PRIMARY** contracts/poa/token/src/lib.rs、contracts/poa/factory/src/lib.rs @4127e8e：PoA token 只能由 owner 铸造；提现 memo 为 `WITHDRAW_TO:`；factory 的 `ft_deposit` 可转发 `ft_transfer_call`。
- [18] **PRIMARY** READMEs @4127e8e：[18a] contracts/escrow-swap；[18b] contracts/wallet；[18c] contracts/global-deployer；[18d] contracts/outlayer/app；[18e] contracts/treasury-logger。各合约的用途。
- [19] **PRIMARY** docs.near-intents.org/integration/verifier-contract/introduction（2026-10-07）：`intents.near` 是结算层，没有 testnet 部署，“Intents Technology does not custody these balances”。
- [20] **PRIMARY** …/verifier-contract/intent-types-and-execution（2026-10-07）：payload 字段、nonce 描述（与代码不符）、token_diff 配平警告、异步顺序警告、示例 JSON。
- [21] **PRIMARY** …/verifier-contract/account-abstraction（2026-10-07）：隐式账户 / 命名账户、每个 key 全权限、key 轮换建议。
- [22] **PRIMARY** …/deposits-and-withdrawals/{deposits, withdrawals}（2026-10-07）：存入的 `msg` 三种格式；提现带 `msg` 时不退款的规则。
- [23] **PRIMARY** …/market-makers/message-bus/introduction（2026-10-07）：RFQ 五步流程；Message Bus 负责提交结算交易；协议可以不经 Message Bus 运作。
- [24] **PRIMARY** …/message-bus/rpc（2026-10-07）：`quote`（3000 ms）、`publish_intent(s)`、`get_status` 状态值，JWT 鉴权。
- [25] **PRIMARY** …/market-makers/quickstart（2026-10-07）：solver 需要 Partner JWT 与 KYC/KYB，先 `add_public_key` 再存入流动性。
- [26] **PRIMARY** …/1click-api/quickstart/making-a-request（2026-10-07）：quote 字段、depositType / recipientType / refundType、状态机。[26b] …/about-1click-api（2026-10-07，answer 模式摘录）：“1Click does not take custody”。
- [27] **PRIMARY** …/1click-api/fee-config（2026-10-07）：20 bps / 1 bp / 50-50 分成 / 25 bps / 500 bps 上限。
- [28] **PRIMARY** docs.near-intents.org/resources/fees（2026-10-07）：协议费 1 pip、near-intents.org 0.2%、quote improvement fee。
- [29] **PRIMARY** …/1click-api/authentication（2026-10-07）：Partner JWT 与 User-Session token；机密余额只能凭 User-Session 读取。
- [30] **PRIMARY** …/bridging/overview（2026-10-07）：Omni / PoA / HOT 三桥的支持链与“各有信任模型”；HOT 经 “HOT/Omni protocol”。
- [31] **PRIMARY** …/learn/omni-bridge/how-it-works（2026-10-07）：BTC 入金走轻客户端证明，出金由 MPC 网络联合签名、relayer 广播。
- [32] **PRIMARY** …/market-makers/confidential-intents（2026-10-07）：FAR、`intents.far`、Treasury、Private PoA Bridge、IMT、私有 relay、versioned nonce、shield / swap / recover。
- [33] **PRIMARY** …/market-makers/confidential-example（2026-10-07）：生产常量（`intents.far`、salt `e110f317`、Treasury 账户）、`private_signed_data` 示例。
- [34] **PRIMARY** …/1click-api/quickstart/confidential-swaps（2026-10-07）：两种集成路径；“deposits and withdrawals cannot be tracked to each other”。
- [35] **PRIMARY** docs.near-intents.org/changelog/overview（2026-10-07）：2026-06 至 2026-09 的上线时间线（B2B 上线 07-13、私有 relay 白名单等）。
- [36] **PRIMARY** intents.near.org/confidential（2026-10-07）：产品页对 private shard、permissioned validators、TEE-based bridge、selective disclosure 的说法。
- [37] **PRIMARY** docs.near-intents.org/security-compliance/proactive-intents-security（2026-10-07）：SHIELD 的 Live / Rolling out / Vision 分层，规则型异常引擎。
- [38] **PRIMARY** …/security-compliance/risk-and-compliance（2026-10-07）：AML 数据源、覆盖范围因路径而异、Kodex 执法门户。
- [39] **PRIMARY** X @near_intents 2105642219357241796（2026-10-01 12:53 UTC，经 api.fxtwitter.com 读取，2026-10-07）：官方事件说明（原因一句话、$3.8M、补偿、11 条链、承诺详细报告）。
- [40] **PRIMARY** X @ilblackdragon 2106072953570181155（2026-10-02，经 fxtwitter 读取）：资金 14:30 UTC 全额收回；称 SHIELD 为 “AI security layer”。
- [41] **PRIMARY** X @AlexAuroraDev：[41a] 2105814573152661894（识别出攻击者，限 48 小时归还）；[41b] 2106049685928677585（“sent back in full”）。均经 fxtwitter 读取。
- [42] **PRIMARY** GitHub API near/intents commits since 2026-09-27（2026-10-07）：#362 “reproduce bug … refunded amount check in mt_resolve_deposit”、#361 disable state init、#364 limit number of batch tokens、v0.4.3 / v0.4.4 发布时间。
- [43] **PRIMARY** GitHub release wallet/v0.2.0（2026-06-30）：wallet ABI 与签名破坏性变更。
- [S1] 二手：near.org/blog/announcing-general-availability-of-confidential-intents（JS 渲染，只取到搜索摘要“now open to all developers”，2026-10-07）。
- [S2] 二手：chainplay.gg、nearstats.org（2026-10-07 搜索摘要）：称 Confidential Intents 于 2026-02-25 上线。
- [S3] 二手：CoinDesk 2026-10-01（2026-10-02 更新），cryptotimes.io 2026-10-03：事件报道，以及 ZachXBT 称资金从 BNB Chain hot wallet 流出、经 KuCoin 换成 BTC（转述）。

---

## 外部调研中被修正或无法核实的地方
1. **“Omni 入金 / 出金基础设施”**（GPT §8.4）：措辞与官方帖一致 [39]。但没有指出停用的 11 条链与 HOT Bridge 支持链完全重合 [30]。“Omni” 很可能是 HOT/Omni，而不是 NEAR 的 Omni Bridge（inferred）。GPT 引 CoinDesk 作来源，属于二手；一手来源见 [39][40][41]。
2. **GPT §4.2 的不变量表述**“∑Δ=0，收费时把费用接收账户纳入记账”：方向正确。需要补充实现细节：配平由 `Deltas/TransferMatcher` 对所有内部增减统一检查，不只针对 token_diff；fee 只对负 delta 收取，并按 token 类型豁免 [3][4]。
3. **GPT 没有提到协议费 1 pip**（0.0001%，链上收取）[28]，也没有给出 1Click 无 key 时 +25 bps 的口径 [27][29]；20 bps / 1 bp 的数字与文档一致。
4. **GPT §5.1 称产品页强调 “TEE-based bridge”**：属实 [36]。但开发者文档称之为 “Private PoA Bridge（request-driven）”，没有任何 TEE 描述 [32]；产品页的“decentralized set of independent permissioned validators”与文档的“small validator set”表述也不一致。GPT 没有指出这一矛盾。
5. **GPT 没有给出 Confidential Intents 的上线时间**：B2B 上线 2026-07-13 [35]；首发 2026-02-25 只有二手来源 [S2]。
6. **文档 nonce 描述 `[4-byte salt][28-byte]`**（GPT 未涉及，但文档本身有误）：代码中是 magic 前缀 + 版本 + salt + deadline + 随机数，legacy nonce 仍被接受 [7]。
7. **GPT 称 SHIELD “不是全栈冻结开关”**：与文档一致 [37]。补充：Polosukhin 称 SHIELD 为 “AI security layer”[40]，与文档“rule-based … rather than model-driven”[37] 存在矛盾。
8. **GPT “Message Bus 打包提交”未说明由谁签名上链**：代码显示是 `intents.near` 上的 function-call relayer key [11]。
9. **GPT 说“私有 relay 用于询价和收集 solver 签名”**：正确。补充：验签依据公链 `intents.near`、读余额读 FAR；2026-07-13 起改为白名单 WS-only [32][35]。

## 开放问题
1. ORIGIN_CHAIN 路径下，1Click 的 `depositAddress` 由谁控制密钥？它在 verifier 中对应哪个账户？用户侧的 `token_diff` 由谁代签？这与“1Click 不托管”的表述如何自洽 [26b]？
2. FAR 的验证者数量与身份；Private PoA Bridge 是否运行在 TEE 内，以及 attestation 是否公开；Treasury（`51e8…7cbe`）私钥的持有与签名机制。
3. `confidentiality: basic` 与 `advanced` 的差异，文档没有定义 [26][34]。
4. 选择性披露的实际机制（谁能解密或查看、凭什么授权）[36]。
5. 2026-10-01 事件的官方详细报告（承诺“following days”，截至 2026-10-07 未找到）；#362 / #364 与该事件的确切关系。
6. 主网 `intents.near` 当前 code hash 是否对应 v0.4.4；链上 `fee()` 的实际值；legacy nonce 的禁用时间。
7. `intents.near` 单合约在单 shard 上的实际吞吐上限，以及 batch token 上限的具体数值（#364）。
8. verifier 是否使用 yield/resume 或直接调用 Chain Signatures（需要全量 grep 确认）。

## 台账
| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| I1 | verifier 部署在 `intents.near`，源码为 near/intents 的 contracts/defuse（原名 defuse），无 testnet 部署 | [1] README；[19] verifier introduction | observed | |
| I2 | verifier 内部 token ID 有 nep141 / nep171 / nep245 / imt 四种 | [15] crates/primitives/token-id/src/lib.rs `enum TokenId`@4127e8e | observed | |
| I3 | `imt_mint` / `imt_burn` 只在 `imt` feature 下编译；`far` feature 包含 `imt`；默认 reproducible build 只启用 `contract` | [2] mod.rs `#[cfg(feature="imt")]`；[14] Cargo.toml#L67-L68 及 reproducible_build 配置 | observed | |
| I4 | 主网 `intents.near` 很可能不支持 IMT intent | 由 I3 与 [32] 推出：IMT 只在 FAR 上作为私有资产使用，主网默认构建不含 imt | inferred | |
| I5 | @4127e8e 共 13 种 intent：add/remove_public_key、transfer、ft/nft/mt/native_withdraw、storage_deposit、token_diff、set_auth_by_predecessor_id、auth_call、imt_mint、imt_burn | [2] contracts/defuse/core/src/intents/mod.rs#L39-L83 | observed | |
| I6 | 存入方式是在 token 合约上 `*_transfer_call` 到 `intents.near`；`msg` 可以为空、写 AccountId，或写含 `execute_intents` / `refund_if_fails` 的 JSON | [12a] nep141/deposit.rs `ft_on_transfer`；[22] Deposits 文档 | observed | |
| I7 | 提现先在 verifier 内扣账，再发出异步 `ft_transfer(_call)`，由 `ft_resolve_withdraw` 回调按结果退款；带 `msg` 时失败不退款 | [12b] nep141/withdraw.rs；[22] Withdrawals 文档 | observed | |
| I8 | `execute_intents` 依次检查签名、verifying_contract、deadline、公钥归属、versioned nonce，再 commit nonce 并执行 intents | [5] engine/mod.rs#L42-L83 | observed | |
| I9 | `execute_intents` 中任一 intent 出错或配平失败都会 panic，整笔回滚 | [10] contract/intents/mod.rs `.unwrap_or_else(\|e\| e.panic())`；[5] `finalize()` | observed | |
| I10 | 每个 token 的内部存入与取出（含 fee_collector 入账）必须完全撮合，否则返回 `InvariantViolated::UnmatchedDeltas` | [4] deltas.rs `TransferMatcher::finalize` | observed | |
| I11 | `token_diff` 只对负 delta（token_in）收费，fee 记入 `fee_collector`；NEP-171 以及 \|delta\|≤1 的 MT/IMT 免费 | [3] token_diff.rs `execute_intent` 与 `token_fee` | observed | |
| I12 | 文档写明链上协议费为 0.0001%（1 pip） | [28] resources/fees（2026-10-07） | observed | |
| I13 | 同一批 intent 创建的跨合约 Promise 并发执行，不保证完成顺序 | [2] DefuseIntents 注释；[20] 文档警告 | observed | |
| I14 | `simulate_intents` 返回执行报告、未配平的 delta，以及当前 fee 与 salt | [10] contract/intents/mod.rs `simulate_intents` | observed | |
| I15 | MultiPayload 支持 nep413、erc191、tip191、raw_ed25519、webauthn、ton_connect、sep53 七种签名标准 | [6] payload/multi.rs#L19-L58 | observed | |
| I16 | README 提到 BIP-322，但当前 MultiPayload 中没有 BIP-322 变体 | 由 [1] README 与 [6] multi.rs 对比推出：枚举中无对应变体 | inferred | |
| I17 | nonce 为 256 位，用 permit2 风格位图存储，可以非顺序、并发使用 | [7] nonce/mod.rs；[9] accounts.rs 注释 | observed | |
| I18 | versioned nonce 布局为 magic `5628f6c6` + version + salt(4B) + deadline(8B) + random(15B)；legacy nonce 目前仍被接受 | [7] nonce/versioned.rs#L9-L29；[5] `verify_intent_nonce` | observed | |
| I19 | 文档的 nonce 描述“[4B salt][28B]”与代码不符，文档示例 nonce 解码后为 magic + V1 + salt `252812b3` | 由 [20] 示例 nonce 的 base64 解码与 [7] 的布局对比推出 | inferred | |
| I20 | verifier 账户与 NEAR 原生账户 / access key 是两套体系；外链钱包使用由公钥派生的隐式账户，无需注册 | [21] account-abstraction；[8] public_key.rs#L35-L82 | observed | |
| I21 | 在 verifier 中注册的每个公钥都拥有完全权限，可以增删其他 key | [21] account-abstraction；[2c] AddPublicKey 注释 | observed | |
| I22 | 管理员角色可以锁定账户、强制提现、强制切换 predecessor 认证，并可暂停 intents | [9] ForceAccountManager；[12b] `ft_force_withdraw`；[13] Pausable 与 Role | observed | |
| I23 | relayer key 是 `intents.near` 上只能调用 `execute_intents`、allowance 为 Unlimited 的 function-call access key | [11] relayer.rs#L14-L27 | observed | |
| I24 | Message Bus 用 relayer key 以 `intents.near` 自身身份提交结算交易 | 由 [23]“Message Bus 提交结算交易”与 [11] relayer key 设计推出 | inferred | |
| I25 | 公共 Message Bus 的 RFQ 流程：quote 广播给 solver（最多等 3000 ms）→ solver 返回签名 intent → 用户签名 → `publish_intent` → 打包上链 | [23] 概览；[24] RPC 参考 | observed | |
| I26 | solver 接入需要 Partner JWT 与 KYC/KYB；链上 verifier 不设 solver 白名单 | [25] quickstart；[13] Role 列表中无 solver 角色 | observed | |
| I27 | 1Click 报价字段含 depositType / recipientType / refundType（ORIGIN_CHAIN 或 DESTINATION_CHAIN / INTENTS / CONFIDENTIAL_INTENTS）、confidentiality、deadline、slippageTolerance | [26] making-a-request | observed | |
| I28 | 1Click 状态包括 PENDING_DEPOSIT、KNOWN_DEPOSIT_TX、PROCESSING、SUCCESS、INCOMPLETE_DEPOSIT、REFUNDED、FAILED | [26] making-a-request | observed | |
| I29 | 1Click 平台费：有 API key 时 20 bps（稳定币对及同资产跨链 1 bp）；无 key 时额外加 25 bps；带 appFees 时 50/50 分成且 1Click 一半最低 20 bps；合计上限 500 bps | [27] fee-config；[28] fees（2026-10-07） | observed | |
| I30 | 一笔跨链 swap 中只有 verifier 内的 `execute_intents` 结算是原子的，入金桥、出金桥和外链交付在原子域之外 | 由 [5][10] 的单 receipt 回滚与 [12b][30][31] 的异步桥接推出 | inferred | |
| I31 | PoA token 只能由 owner 铸造；提现方式是向 token 合约自身 `ft_transfer`，memo 写 `WITHDRAW_TO:<地址>` | [17] poa/token/src/lib.rs | observed | |
| I32 | Omni Bridge 的 BTC 提现由 MPC 网络联合签名、relayer 广播；入金由轻客户端校验 Merkle 证明 | [31] omni-bridge how-it-works | observed | |
| I33 | 三座桥（Omni / PoA / HOT）支持的链各不相同，信任模型也各不相同 | [30] bridging overview | observed | |
| I34 | Confidential Intents 采用双链结构：公链 `intents.near` + 许可制私有 NEAR 分叉 FAR 上的 `intents.far`；FAR 无公网 P2P，RPC 需认证访问 | [32] confidential-intents | observed | |
| I35 | shield 是在公链上把 token transfer 给 Treasury，由 Private PoA Bridge 在 FAR 上铸造 IMT；unshield 是在 FAR 上 burn IMT，由桥从 Treasury 放款；桥按 RPC 请求驱动 | [32] confidential-intents；[33] confidential-example | observed | |
| I36 | 私有资产 ID 形如 `imt:<Treasury>:nep141:<token>`，每个 IMT 由 Treasury 中的资产 1:1 支持 | [32]；[15] imt.rs 注释 | observed | |
| I37 | solver 的 swap 与 recover 共用同一个 nonce，只有一个能上链；带 shield 却没有 recover 的报价会被拒绝 | [32]；[33]；[7] nonce 重复即报错 | observed | |
| I38 | 私有 relay 的验签依据公链 `intents.near`，读余额读 FAR；自 2026-07-13 起改为白名单、只允许 WebSocket | [32]；[35] changelog | observed | |
| I39 | Confidential Intents 于 2026-07-13 面向 B2B 上线；`confidentiality` 参数于 2026-07-01 上线 | [35] changelog | observed | |
| I40 | Confidential Intents 于 2026-02-25 首发 | [S2] chainplay.gg、nearstats 等二手搜索摘要，官方博客未能读取 | speculative | |
| I41 | 产品页称运行在由“decentralized set of independent permissioned validators”运营的 private shard 上，经“TEE-based bridge”连接主网，并提供 selective disclosure | [36] intents.near.org/confidential（2026-10-07） | observed | |
| I42 | 开发者文档称 FAR 由“small validator set”运营，桥为“Private PoA Bridge”，没有 TEE 描述，与产品页表述不一致 | 由 [32] 与 [36] 的原文对比推出 | inferred | |
| I43 | Confidential Intents 对公链观察者隐藏 FAR 内的余额与成交，但私有 relay、FAR 验证者与 1Click 后端都能看到明文 | 由 [32] relay 职责、[29] 机密余额接口与 NEAR 协议状态不加密推出 | inferred | |
| I44 | shield 时公链上可以看到发往 Treasury 的 transfer 的金额和时间 | 由 [33] shield 是公链 `intents.near` 上的 transfer intent 推出 | inferred | |
| I45 | SHIELD 已上线：事件管理、作用域权限、三档安全模式、1Click 报价时评估（可延迟）；桥与更多路径的接入在推进中；solver 池控制与链健康适配器属于愿景 | [37] proactive-intents-security（2026-10-07） | observed | |
| I46 | 文档称 SHIELD 的异常引擎“rule-based … rather than model-driven”，而 Polosukhin 称 SHIELD 为“AI security layer” | [37] 与 [40] 原文对比 | observed | |
| I47 | 合规筛查覆盖集成的报价流程，数据源为 NEAR Intents AML、Binance AML、AMLBot & PureFi、TRM Labs，覆盖程度因路径而异 | [38] risk-and-compliance | observed | |
| I48 | 2026-10-01 官方称事件由“Omni deposit and withdrawal infrastructure interaction with NEAR Intents smart contract”的 bug 引起，初步损失约 $3.8M，合约侧已修补，11 条链存取款再暂停约 12 小时 | [39] @near_intents 2105642219357241796 | observed | |
| I49 | 资金于 2026-10-02 全额归还（14:30 UTC），调查终止 | [40] Polosukhin；[41b] Shevchenko | observed | |
| I50 | 事件公告中停用的 11 条链与 HOT Bridge 支持链完全一致，公告里的“Omni”很可能指 HOT/Omni 基础设施 | 由 [39] 的停用链列表与 [30] 的 HOT Bridge 支持链（“HOT/Omni protocol”）逐一对比推出 | inferred | |
| I51 | 事件根因与 NEP-245 存入回调（`mt_resolve_deposit`）的退款量检查或批量 token 数量上限有关 | [42] #362“refunded amount check in mt_resolve_deposit”、#364“limit number of batch tokens”的时间与内容，官方未确认 | speculative | |
| I52 | 截至 2026-10-07，官方承诺的详细事件报告尚未发布 | [39] 承诺“following days”；2026-10-07 检索未找到；[S3] 二手称 10-04 前未发布 | inferred | |
| I53 | 把需要原子性的余额集中到一个合约，是为了绕开 NEAR 异步跨合约调用、在单个 receipt 内完成多方结算 | 由 [5][10] 的单 receipt 回滚与 [20]“跨合约调用异步、不保证顺序”推出，文档未明说动机 | inferred | |
| I54 | `intents.near` 作为单个账户位于单个 shard，所有结算串行执行，吞吐受该 shard 与单合约 gas 限制 | 由 NEAR“一个账户属于一个 shard”的模型与 I1 推出；[42] #364 引入批量上限 | inferred | |
| I55 | wallet 合约基于 NEP-616 确定性 AccountId 与 NEP-591 global contract，支持 extension 与 passkey，且未经审计 | [18b] wallet README；[43] wallet v0.2.0 release | observed | |
| I56 | escrow-swap 是确定性、参数不可变的托管交换合约，支持部分成交与到期关闭，关闭后自删除 | [18a] escrow-swap README | observed | |
| I57 | global-deployer 实现“owner 批准 code hash、任何人上传 wasm”两步部署；outlayer-app 记录每个 app 的 code hash 与 URL；treasury-logger 只记录 NEP-245 转入事件 | [18c][18d][18e] READMEs | observed | |
| I58 | `far.rs` 只用于 FAR 链，提供管理员批量强制增删公钥的能力 | [14] contracts/defuse/src/far.rs | observed | |

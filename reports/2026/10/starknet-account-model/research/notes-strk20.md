# STRK20 隐私协议调研笔记（lane = strk20）

> 访问 / 核对日期：2026-10-14（UTC+8）。源码固定：starkware-libs/starknet-privacy @ f9256c5e（2026-09-28）、starkware-libs/sequencer @ 54f97a8a（2026-10-13）。链上读数：Starknet 主网，publicnode RPC，查询时最新区块为 16357332。

**一句话总结**：STRK20 是部署在 Starknet 上的一个合约级 note / nullifier 隐私池（`0x0403…812a`，2026-04-20 随 v0.14.2 部署，2026-06-09 官方宣布上线）。用户的私有动作先在“虚拟 Starknet OS”里由隐私池合约自己的 `__execute__` 编译成公开的 server actions，由 Stwo 生成证明；sequencer 网关负责验证证明，链上的 `apply_actions` 只核对 proof facts 中的消息哈希，然后再执行。资金安全靠 nullifier 的 write-once 写入和逐 token 记账归零，支出授权靠用户账户签名。所有“非对称加密”都建立在 Stark 曲线 ECDH 上，viewing 公钥也明文存在链上。因此“STARK 证明抗量子”这一点**不能**推广到 STRK20 的保密性：对量子攻击者来说，私有余额、交易对手、Shadow 身份关联都属于“先收集、后解密”的风险对象。

**研究问题一句话答案**：
- S-Q1：用户 / SDK → 证明服务（在虚拟区块中运行 pool 的 `__execute__`，输出 server actions 和一条 L2→L1 消息）→ relayer / paymaster 提交带 `proof` / `proof_facts` 的 Invoke V3 → sequencer 网关验证 Stwo 证明，blockifier 校验 proof facts → pool 的 `apply_actions` 核对消息哈希与区块新鲜度，再执行 WriteOnce / 转账 / 事件。
- S-Q2：支出权限 = 用户 Starknet 账户签名（三条路径，任一通过即可）；查看权限 = 一把 Stark 曲线 viewing 私钥。注册时用 ECDH 把它加密给唯一的 auditor 公钥并写到链上。存款必须带链下筛查方签名的 attestation。
- S-Q3：对链上旁观者，普通私有转账的金额、token、收发关系是隐藏的。但 deposit 公开存款人、token、金额，withdraw 公开收款地址、token、金额，新通道公开 recipient 地址，open note 公开 token 和成交额。证明服务和 discovery 服务的运营者能拿到 viewing key（OHTTP 只隐藏 IP、防 TLS 中间人，不对运营者保密）。auditor 能看注册用户的完整历史，但不能花钱。
- S-Q4：STRK20 的保密性用的是 Stark 曲线 ECDH 加上 Poseidon 掩码（“hash-and-add”），没有任何 PQ KEM。官方页面“Post-quantum / no trusted setup”说的只是 STARK 证明系统，与加密层无关。
- S-Q5：合约有 OpenZeppelin 审计（2026-03-18～31，报告 2026-05-29，commit c5e2fb5，0 高危）。Lean 4 形式化覆盖协议状态机（防伪造、防双花、守恒、可发现、可花、合规可追踪），但把密码学理想化为单射哈希和抽象 enc/dec，不覆盖保密性和 PQ。
- S-Q6：主网合约于 2026-04-20 部署，2026-06-09 官方宣布上线（Ready X、Xverse）。当前 class 版本为 '2.1'，每次 `apply_actions` 收 2.5 STRK 池费，证明有效期 450 个区块。“under ten cents”是 2026-05-28 博客中的设计目标，本次未核实。

---

## S-Q1 架构与一笔私有转账的完整时序

### 答案
链上入口是 `IServer.apply_actions(actions: Span<ServerAction>, screening: Option<ScreeningAttestation>)`。用户侧的 10 种 ClientAction 不会上链，而是在虚拟 OS 中由 pool 合约自己的 `__execute__ → compile_actions → main` 编译成 12 种 ServerAction，再通过 `send_message_to_l1` 输出这条消息的哈希。链上只核对这一哈希，不重新执行私有逻辑。双花防护靠 nullifier 存储槽的 WriteOnce 语义（链上会再检查一次槽位为空），余额守恒靠交易内逐 token 的临时余额必须归零。

### 依据
- **参与者**（README 架构图）：Wallet、SDK、Discovery、Proving（链下）；Privacy Pool、Invoke Anonymizers（链上）。“The proving service executes these actions in virtual Starknet blocks and returns a validity proof together with proof facts … Starknet verifies the proof and provides validated proof facts to the pool contract via syscall.” [1]
- **pool 本身在虚拟 OS 中扮演“账户”角色**：`__validate__` 只检查调用者为 0（OS 调用）、tx 版本为 V3、tip 与资源单价都为 0。`__execute__` 先解析 `(user_addr, user_private_key, client_actions)`，再编译 actions、验签，最后 `send_message_to_server` [2 privacy.cairo#L179-L214]。审计报告原话：“`__execute__` should not be called on-chain as the private key is embedded inside of the calldata” [12]。
- **SDK 构造的“证明交易”**：`sender_address = pool 地址`，calldata 为 `compile_actions(userAddress, user.viewingKey, cairoActions)`，nonce 固定为 0，资源单价为 0。用户钱包对这笔虚拟交易签名（`walletAddress: poolAddressHex`）[9 proof-invocation-factory.ts#L32-L58, #L132-L160]。
- **ClientAction（10 种）与阶段顺序**：SetViewingKey(0) → OpenChannel(1) → OpenSubchannel(2) → Deposit(3) → UseNote(4) → CreateEncNote / CreateOpenNote(5) → Withdraw(6) → InvokeExternal / ComputeAndInvoke(7)。阶段只能前进，INVOKE 阶段每笔交易最多一次 [2 actions.cairo#L245-L315]。
- **ServerAction（12 种）**：WriteOnce、Append、TransferFrom、TransferTo、6 种 Emit*、Invoke、InvokeWithComputation [2 actions.cairo#L368-L399]。
- **消息绑定**：`send_message_to_server` 发出 payload `[pool class_hash, serialized server_actions]` 到 L1 地址 0 [2 utils.cairo#L439-L447]。`compute_message_hash = poseidon(pool_addr, 0, payload)` [2 utils.cairo#L552-L564]。
- **`validate_proof`**（链上）：用 `get_execution_info_v3_syscall` 读 `tx_info.proof_facts`，要求 `program_variant == 'VIRTUAL_SNOS'`、`output_version == 'VIRTUAL_SNOS0'`、`base_block_number < current ≤ base + proof_validity_blocks`、`message_to_l1_hashes == [message_hash]`。`virtual_program_hash`、`base_block_hash`、`config_hash` 在合约里被忽略（`_`）[2 privacy.cairo#L808-L843]。
- **“sequencer 级验证”的确切含义**：
  - 网关：带 proof 的 Invoke V3 会被计为 private tx，异步 `verification_task` 验证证明，失败则拒收 [5 gateway.rs#L244-L246, #L489-L511]。stateless 校验要求 proof 与 proof_facts 同时存在，并限制 proof 版本和大小 [5 stateless_transaction_validator.rs#L249-L257, #L291-L320]。
  - blockifier 预验证：proof_version 必须在 `allowed_proof_versions` 中；`program_hash` 必须在 `allowed_virtual_os_program_hashes` 白名单中；base block hash 与块号必须有效；`config_hash` 必须等于当前虚拟 OS config hash [5 account_transaction.rs#L291-L350]。
  - proof_facts 以 Poseidon 哈希链入 tx hash；proof 本身不进 tx hash [5 transaction_hash.rs#L399-L402]，feeder gateway 会剥离 proof [5 stateless_transaction_validator.rs#L298-L300]。
  - 版本常量：0.14.0 / 0.14.1 的白名单为空；从 0.14.2 起出现 1 个虚拟 OS program hash 和 proof 版本 'PROOF0'；0.14.3 为 'PROOF1'；0.14.4 / 0.14.5 允许 PROOF1 / PROOF2（命令 C3）。
  - SNIP-36（Draft，2026-02-15）：“A S-Two Verifier written in Rust is added to the gateway, and the sequencer has the responsibility of verifying the proof…”，并且 “In Phase 1, proofs are verified solely by Starknet consensus. A future phase will integrate SHARP so proofs are ultimately verified on Ethereum” [13]。
- **执行**：`apply_actions` 依次执行 reentrancy guard、未暂停检查、`validate_proof`、`collect_fee`、`_apply_actions`，最后视需要做 screening 校验 [2 privacy.cairo#L784-L803]。
- **数据结构与派生公式**（全部为 `poseidon_hash_span`，domain tag 形如 `'<NAME>_TAG:V1'`）[2 hashes.cairo#L9-L236]：
  - `channel_key = H(CHANNEL_KEY_TAG, sender_addr, sender_vk, recipient_addr, recipient_pk)`（#L119-L132）
  - `channel_marker = H(CHANNEL_MARKER_TAG, channel_key, sender_addr, recipient_addr, recipient_pk)`（#L155-L168）
  - `outgoing_channel_id = H(OUTGOING_CHANNEL_ID_TAG, sender_addr, sender_vk, index, 0)`（#L138-L148）
  - `subchannel_id = H(SUBCHANNEL_ID_TAG, channel_key, index, 0)`；`subchannel_marker = H(SUBCHANNEL_MARKER_TAG, channel_key, recipient_addr, recipient_pk, token)`（#L176-L198）
  - `note_id = H(NOTE_ID_TAG, channel_key, token, index, 0)`（#L206-L210）
  - `nullifier = H(NULLIFIER_TAG, channel_key, token, index, 0, owner_vk)`（#L229-L236）
  - `identity_key = H(IDENTITY_KEY_TAG, user_addr, user_vk, contract_address)`（#L57-L61，供 ComputeAndInvoke / Shadow Account 使用）
  - 存储：`recipient_channels: Map<addr, Vec<EncChannelInfo>>`、`outgoing_channels`、`channel_exists`、`subchannel_tokens`、`subchannel_exists`、`notes`、`nullifiers`、`public_key`、`enc_private_key`、`auditor_public_key`、`screener_public_key`、`fee_amount`、`proof_validity_blocks` [2 privacy.cairo#L75-L119]。
- **双花防护**：`use_note` 先由 `(owner_addr, derive_public_key(owner_vk), token)` 重算 subchannel_marker，要求其存在；再读 note、解密金额（必须非 0）、算 nullifier，并产出 `WriteOnce(nullifiers[nullifier] = true)` 和 `EmitNoteUsed{nullifier}` [2 privacy.cairo#L587-L632]。链上 `_apply_write_once` 对每个槽断言 `storage_read == 0` 后才写入 [2 privacy.cairo#L945-L960]。每笔交易至少要有一个 WriteOnce（`NO_REPLAY_PROTECTION`）[2 privacy.cairo#L268, #L309]。
- **余额守恒**：`TokenBalances = Felt252Dict<u128>`。Deposit / UseNote 增加，CreateEncNote / Withdraw 减少（`checked_sub`，负值即 panic），结束时每个 token 都必须为 0 [2 objects.cairo#L6-L27；privacy.cairo#L310]。open note 以 0 值创建、不计入余额，由被调用合约在同一笔交易中 `transfer_from` 补足，否则报 `UNDEPOSITED_OPEN_NOTES` [2 privacy.cairo#L864-L909, #L1039-L1069]。官方文档的说法相同 [6 transaction-flow]。

### 不确定之处
- 网关里具体调用哪个 Stwo verifier crate，不在本次 sparse checkout 中（只看到 `VerificationHandle` 的消费端），所以没有读到验证器本体。
- `proof_fact_fold.rs` 里有把私有交易 proof facts 折叠进递归证明树的代码，但常量注释写着 “canonical_small test values; replace with the production registry values”[5 proof_fact_fold.rs#L1-L18]。这说明“结算到 L1”的工作在进行中，是否已上线未核实。
- 合约忽略了 `base_block_hash` 和 `config_hash`，依赖 blockifier 来校验。这是分层设计，不是漏洞，但意味着 pool 的安全性依赖 sequencer 的版本常量白名单。

---

## S-Q2 密钥与合规

### 答案
存在两套彼此独立的权限：
- **支出**：在虚拟执行中调用用户账户的 `is_custom_signature_valid` 或 `is_valid_signature`，三条路径任一通过即可。
- **查看**：每个账户一把 Stark 曲线 viewing 私钥 k，只能注册一次、不可更换。注册时把 `x(kG)` 明文写到链上，同时把 k 用 ECDH 加密给唯一的 `auditor_public_key`。

auditor 解密出 k 后，可以扫描该用户的入向和出向通道、解密金额、追踪 nullifier 和提现，但不能伪造用户账户签名。存款必须附带由 `screener_public_key` 签名、300 秒内有效的 attestation。

### 依据
- **`assert_valid_signature` 的三条路径**：
  - I：账户在 SRC5 中声明了 `is_custom_signature_valid`，且该函数接受 `(calls, [], signature)`；
  - II：`is_valid_signature(tx_hash, sig)`；
  - III：`is_valid_signature(SNIP-12 CallSet hash, sig)`。
  注释原文：“The signature authorizes the transaction if ANY of three checks passes … Custom validation is NOT exclusive” [2 utils.cairo#L371-L420]。签名对象是虚拟交易的 `transaction_hash`。
- **验签发生在 compile 之后**：审计 L-01 指出这一点，状态为 “Acknowledged, not resolved” [12]；代码 [2 privacy.cairo#L203-L209]。
- **viewing key 注册**：`set_viewing_key` 产出 WriteOnce `public_key[user] = x(k·G)`、WriteOnce `enc_private_key[user] = ECDH_enc(auditor_pk, k)`，并发出 `ViewingKeySet` 事件 [2 privacy.cairo#L319-L357]。私钥须满足 `k < ORDER/2`（canonical）[2 utils.cairo#L269-L272；privacy.cairo#L260-L262]。starkzap 文档：“The pool stores the **first** key an account registers and it cannot be replaced” [7]。
- **viewing key 的来源（SDK 路径）**：在 signer 内部由账户私钥派生（`deriveViewingKey` / `deriveAccountLeafViewingKey`），Privy 和 Cartridge signer 不支持 [7]。
- **auditor 能力**（官方 compliance 页）：用户的 viewing key 可以 “Scan incoming channels … outgoing channels … Decrypt note amounts … follow nullifiers / withdrawals”；“Other users’ keys are not decrypted”；论文提出了 threshold auditing [6 compliance]。审计报告的信任模型：“can decrypt viewing keys and withdrawal data … does not grant the ability to control or spend user funds” [12]。security 页：“auditor has viewing key only, not signing authority” [6 security]。
- **链上为 auditor 准备的加密字段**：Withdraw 事件中的 `enc_user_addr`、OpenNoteCreated 中的 `enc_recipient_addr`（均为 ECDH 加密给 auditor）[2 privacy.cairo#L507-L531, #L676-L714]。
- **screening**：
  - 普通存款（TransferFrom）以存款人作为 screening subject；
  - 向 open note 的存款按存款合约的策略处理：Required（默认）、Exempt、Delegated [2 objects.cairo#L102-L124；privacy.cairo#L864-L909, #L991-L1035]；
  - attestation 由 `screener_public_key` 签名，要求 `issued_at ≤ now + 60` 且 `now ≤ issued_at + 300` [2 privacy.cairo#L921-L943；utils.cairo#L97-L99]。
  - 官方文档：“Every deposit is screened against sanctions lists through Elliptic … the proving service behind it is not an open endpoint”，链路是 prover → proof-interceptor → elliptic-proxy [7]。
  - strk20.starknet.io/build 的说法是 “FPI screens the addresses that shield tokens and signs every deposit, and the pool verifies that signature. Running your own prover doesn't bypass it.” [10]
- **治理**：constructor 中 `replaceability.initialize(upgrade_delay: 0)` [2 privacy.cairo#L161]；审计报告：“Governance can update parameters and upgrade the contract with no delay” [12]。链上 class hash 自部署以来已变更（命令 C2）。

### 不确定之处
- 筛查服务商：docs 写 Elliptic，strk20 build 页写 “FPI”，两处是否指同一链路未核实，照实记录。
- auditor 只有 “when authorized / lawful request” 才解密：这属于治理 / 流程约束，密码学上 auditor 私钥可以解密所有已注册用户（注册时就加密给它）。是否已采用论文中的 threshold 方案，未见部署证据。
- 审计 M-02（auditor 轮换导致可见性断档）标为已解决；当前 `EncPrivateKey` 存了 `auditor_public_key` 字段 [2 objects.cairo#L42-L53]，但轮换时是否会重新加密旧用户的 k，没有核对 PR #703。

---

## S-Q3 隐私边界（按观察者分列）

### 答案
STRK20 隐藏的是“普通私有转账”的金额、token 以及收发方的链上关联。只有在用 paymaster 提交时，发送方才对外隐藏。新通道会在链上公开 recipient 地址。deposit / withdraw / open note 在设计上就公开金额和 token。

对证明服务和 discovery 服务的运营者来说，用户必须交出 viewing key：证明服务拿到的是包含 viewing key 和全部 actions 的完整见证。OHTTP 的作用是把 IP 与请求内容分开（需配合 relay），并防止 TLS 终止方读取内容，但运营者本身仍能读到内容。

### 依据（按观察者）

| 观察者 | 能看到 | 看不到 / 条件 | 来源 |
|---|---|---|---|
| 链上旁观者 | Deposit 事件中的 `user_addr`、token、amount；Withdrawal 事件中的 `to_addr`、token、amount（用户地址加密给 auditor）；OpenNoteCreated 中的 token 和 note_id；OpenNoteDeposited 中的 depositor、token、amount；NoteUsed 中的 nullifier；EncNoteCreated 中的 note_id 和密文；新通道时 `recipient_channels[recipient_addr]` 的 Append（recipient 地址就是存储键）；交易时间；被调用的外部合约和 selector | 普通 note 的金额和 token（经 channel_key 掩码）；nullifier 与 note 的对应关系；sender（用 paymaster 时） | [2 privacy.cairo#L416-L417, #L486-L531, #L676-L714, #L1068；events.cairo]；[6 security] |
| relayer / paymaster | 用户 IP、发给它的 payload（proof、server actions），以及从池中提出的费用 | — | [6 paymasters]：“Paymaster learns IP and whatever the client sends” |
| 证明服务运营者 | 虚拟交易 calldata，即 `user_addr`、viewing key、全部 client actions（金额、对手方、token）；用户账户签名 | 即使开启 OHTTP，网关和目标服务也会解封装后读取内容 | [9 proof-invocation-factory.ts#L132-L136]；[7] “With ohttp disabled, your viewing key reaches the proving and discovery services in plaintext” |
| discovery 运营者 | viewing key（服务会用它校验 public key）、活跃的收款方、通道 / 子通道 / note 数量、token、同步时间 | 用了 OHTTP + relay 时看不到 IP | [8 05-security-considerations.md#L66-L79] |
| OHTTP relay | 客户端 IP | 请求内容（HPKE：DHKEM-X25519、HKDF-SHA256、AES-128-GCM） | [8 20-ohttp-integration.md#L5-L11]；[9 ohttp-client.ts#L9, #L159] |
| auditor | 解密注册用户的 k 后，可看到其入向和出向图、金额、nullifier、提现人 | 不能签名支出 | [6 compliance]、[12] |
| 接收方 | 通过 ECDH 解出 channel_key 和 sender_addr，进而看到该通道的所有 note 金额 | 发送方的其他通道 | [2 utils.cairo#L187-L200] |
| sequencer / mempool 节点 | proof 和 proof_facts。proof 会在 mempool 中传播，网关会把它归档（GCS），feeder gateway 会剥离 | SNIP-36：“privacy is de facto (data is computationally infeasible to extract). A future phase may support fully zero-knowledge proofs” | [5 gateway.rs#L302-L376]、[13] |

- 官方 security 页的 Limitations：新通道与 deposit / withdraw 同笔交易或时间相近时可能被关联；存取金额启发式；回滚交易若复用 note id 会被关联 [6 security]。
- strk20 官网 FAQ 自己也写：“deposits, withdrawals and external app activity can remain visible … app interactions, channel setup and transaction timing can also reveal information” [10]。

### Sturisky 博客与安全文档是否矛盾
博客（2026-05-28）的说法是 “observers see only encrypted notes and nullifiers; sender, receiver, and amount are hidden onchain. Each transaction is designed to finalize in one to three seconds at under ten cents”[14]。这句话放在“私有转账”的语境下与 security 页大体一致，但省略了三点：(a) sender 只在走 paymaster 时隐藏；(b) 每对 sender→recipient 第一次建通道时 recipient 公开；(c) 交易时间和 deposit / withdraw 金额可见。

官方页面另有两处说法与文档不一致：
- 6 月 9 日的上线博客写 “Starknet verifies the proof onchain”，而实际是 sequencer 网关验证，合约只检查 facts [5][2]。
- interactive 页写 “your own device generates a zero-knowledge STARK proof … revealing none of it”，这与 architecture 页 “designated operators generate proofs on behalf of users” 以及 starkzap 的 “remote proving service” 相冲突 [11][6][7]。

### 不确定之处
- 是否所有官方钱包（Ready X、Xverse）都默认开启 OHTTP、使用哪家 relay，未核实。
- SNIP-36 “de facto privacy” 是 2026-02 的 Draft 说法。当前 Stwo 证明是否已启用 ZK 模式，未在源码中核实。

---

## S-Q4 STRK20 自身的密码学与 PQ

### 答案
STRK20 的非对称部分全部是 Stark 曲线 ECDH 与 `x(k·G)` 公钥：用于把 channel 信息发给收款方、把 viewing 私钥和提现人 / open-note 收款人地址加密给 auditor。“对称加密”不是 AES 一类的分组密码，而是 Poseidon 哈希掩码相加（`H(tag, shared_x 或 channel_key, …) + m`，金额模 2^128）。

在量子模型下，攻击者对链上明文存放的 `public_key[user]` 直接运行 Shor 就能得到 viewing 私钥 k，甚至不需要密文。拿到 k 就能复原该用户的全部通道、金额、nullifier 状态和 `identity_key`。破解唯一的 auditor 公钥，则能解出所有注册用户的 k。这些数据今天就在链上，属于“先收集、后解密”。

官方的 “Post-quantum” 表述只出现在证明系统语境中（“No trusted setup. Post-quantum. STARKs are hash-based…”）。证明系统 PQ 只保证完整性（不能伪造合法状态转移），不保证保密性。支出安全取决于用户账户的签名方案，这是另一条迁移线。

### 依据
- `_compute_shared_x`：`R = rG`（公开 x 坐标），`S = r·K = k·R`，取 `S.x` 作为共享材料 [2 utils.cairo#L124-L146]。
- `encrypt_channel_info`：`enc_channel_key = H(ENC_CHANNEL_KEY_TAG, S.x) + channel_key`，`enc_sender_addr = H(ENC_SENDER_ADDR_TAG, S.x) + sender_addr` [2 utils.cairo#L168-L200]。
- `encrypt_private_key`（给 auditor）：`enc_private_key = H(ENC_PRIVATE_KEY_TAG, (rK_auditor).x) + k` [2 utils.cairo#L202-L229]。`encrypt_user_addr` 同理 [#L231-L258]。
- `derive_public_key(k) = (k·G).x` [2 utils.cairo#L261-L267]，写入 `public_key[user_addr]` [2 privacy.cairo#L106, #L338-L344]。
- 金额：`enc_amount = (H(ENC_AMOUNT_TAG, channel_key, token, index, 0, salt) + amount) mod 2^128` [2 utils.cairo#L274-L302]。token：`enc_token = H(ENC_TOKEN_TAG, channel_key, index, 0, salt) + token` [#L109-L122]。出向通道：`enc_recipient_addr = H(ENC_RECIPIENT_ADDR_TAG, sender_addr, sender_vk, index, 0, salt) + recipient_addr` [#L148-L166]。
- 官方文档自述：“Channel open uses ECDH on the STARK curve … Compliance: … same ECDH pattern”；“Note amounts — hash-and-add style” [6 encryption-and-keys]。审计概述：“Poseidon-based key stream” [12]。
- 审计 L-05：如果 ECDH 临时私钥 r 被复用，“channel privacy collapses … The failure is silent and retroactive”，状态为 Acknowledged, not resolved [12]。
- 官方 PQ 表述：strk20.starknet.io/interactive 前端包（index-Xkq-Ap9T.js）中有 “No trusted setup. Post-quantum.” / “STARKs are hash-based … security holds even against quantum computers.”（命令 C6）[11]。在 strk20.starknet.io 首页、/build、/index.md、llms-full.txt 中均**未找到** “quantum” 字样（命令 C5）。
- Starknet 的 Quantum 博客（2026-08-07）承认 “harvest now, decrypt later” 这一威胁类别，但正文没有提到 STRK20 的 ECDH [15]。quantum.starkware.co/migration-register 的静态 HTML 中未出现 STRK20、privacy 或 ECDH（命令 C7；页面可能由 JS 渲染）。
- OHTTP 传输层使用 X25519 HPKE（非 PQ）[9 ohttp-client.ts#L159]。
- 证明环境不支持 `ecdsa` 等 builtin：“Unsupported builtins: range_check96, add_mod, mul_mod, ecdsa” [6 proving]。用户账户验签在虚拟 OS 中执行，因此未来的 PQ 账户也必须能在该子集中验签（推论，见开放问题）。

### 推论（标注）
- 由 `public_key` 明文上链加 Shor 可得：对所有已注册用户，k 可被量子恢复；进而 `channel_key`（需要对手方地址，可通过 ECDH 解出 sender_addr，或用 k 解出 `enc_recipient_addr` 得到）、全部金额、`nullifier`（判断已花）、`identity_key`（关联 Shadow Account）都可复原。属于 inferred。
- auditor 只有一把公钥：破解它就等于拿到全部注册用户的 k，是单点“历史保密性”风险。属于 inferred。
- Poseidon 掩码在量子模型下大概只受 Grover 级影响，但金额掩码只取 128 位（`.low`），安全余量需要另行评估。属于 speculative。

### 不确定之处
- 未能读到 IACR ePrint 2026/474 原文（HTTP 403），论文是否讨论 PQ 迁移未知。
- 用户提到 “quantum-resistant by design” 这一原句，未能在当前 strk20 页面中找到。可能已被修改，也可能出现在其他页面或推文中。

---

## S-Q5 审计与形式化验证

### 答案
OpenZeppelin 审计的对象是 `packages/privacy/src` 的 9 个文件（commit c5e2fb5，2026-03-18～31，报告日期 2026-05-29）。共 11 个问题：0 个 Critical / High，2 个 Medium（已解决），5 个 Low（1 个已解决），4 个 Note（3 个已解决）。

StarkWare 于 2026-07-23 开源 Lean 4 形式化，称 “over 230 theorems, no unproven steps”。覆盖内容为：notes 不可伪造、无双花、精确记账、资金可发现、可花、合规可追踪。原话：“We formally verified the protocol. The Cairo contract that implements it is covered separately by the OpenZeppelin audit.”

Lean 模型把密码学理想化：哈希被假设为单射，enc / dec 被假设为可逆的抽象函数。因此形式化不证明保密性、抗量子性，也不证明 Cairo 实现与模型逐行一致。

### 依据
- docs/audit/README：Privacy contracts (V1)、commit c5e2fb5、OpenZeppelin、2026-05-29 [3]。报告正文：时间线 2026-03-18～2026-03-31；范围为 actions / errors / events / hashes / interface / lib / objects / privacy / utils.cairo；M-01 auditor 无效公钥会导致系统停摆（已解决），M-02 auditor 轮换导致可见性断档（已解决），L-01～L-05、N-01～N-04 [12]。
- 审计的信任假设：中心化证明服务、auditor、零延迟治理升级、依赖 Starknet 共识验证证明 [12]。
- 形式化博客（2026-07-23）中的引文 [4]，以及它对 “Beyond the pool” 的说明：已证明 Stone / S-two 对 Cairo 执行的编码、部分 CairoZero 函数、Sierra→CASM 构件。
- 仓库中的 lean/ 目录：56 个 .lean 文件，8124 行，236 处 `theorem` / `lemma` 声明；grep 未发现 `sorry` / `axiom`；toolchain 为 `leanprover/lean4:v4.27.0-rc1`（命令 C4）[2 lean/]。
- `structure Crypto`：`h_hash: hash ℓ₁ = hash ℓ₂ → ℓ₁ = ℓ₂`（哈希单射）、`dec_enc`、`priv_to_pub_inj`、`council_priv_key`（即 auditor）[2 lean/privacy/utils.lean#L29-L46]。
- 模型中的 `note_amount` 用 `hash [c, token, i, salt]`，没有 Cairo 实现里的 domain tag 和保留 0 位 [2 lean/privacy/utils.lean#L54-L56]，说明模型是协议级抽象。
- 顶层定理示例：`no_replay`（Withdraw 以外的已执行动作不能再次成功）[2 lean/privacy/no_replay.lean#L9-L16]；`spendable_note`、`spend_all_props` [lean/privacy/spendability.lean#L20, #L177]。

### 不确定之处
- 当前代码有 `snip12.cairo`（遗留 CallSet 签名路径）、screening、ComputeAndInvoke、`CONTRACT_VERSION '2.1'`，而审计范围的文件列表里没有 `snip12.cairo`。由此推断：当前部署包含审计之后新增的代码（inferred），但浅克隆无法 diff c5e2fb5。
- 没有在本地复跑 `lake build`（按 brief 属于可选项）。
- anonymizer、SDK、discovery、prover 不在审计范围内（按审计列出的范围推出）。

---

## S-Q6 上线状态与数据（截至 2026-10-14）

### 答案
- 主网 pool 合约 `0x040337b1…ffe812a` 于 **2026-04-20 10:08:48 UTC**（区块 8978970，Starknet 0.14.2）部署，当天 v0.14.2 主网博客发布，引入了 SNIP-36。
- 官方博客 **2026-06-09** 宣布 “first phase of STRK20 live today”，入口是 Ready X 和 Xverse。
- 当前 class `0x6d163f2b…` 自区块 15337340（2026-09-23 20:56:33 UTC，0.14.3）起生效。`get_version='2.1'`；池费 `get_fee_amount = 2.5e18 FRI = 2.5 STRK / 次 apply_actions`；`proof_validity_blocks = 450`；未暂停。
- 支持的 token 是“任意 ERC-20”（合约不设白名单，审计 L-02 建议加但未采纳），实际可用性取决于钱包和集成。
- 集成情况：AVNU 私有 swap（Ready、Xverse 走钱包路由）；Vesu 有 reference helper 但“app integration in progress”；Endur 的 helper 在主网；Ekubo 作为 AMM 被列出。

### 依据
- docs overview / architecture 中给出的合约地址 [6]；链上读数（命令 C1、C2）。
- v0.14.2 博客：datePublished 为 2026-04-20T13:40:57Z；“transactions can now reference off-chain execution proofs directly via new proof and proof_facts fields” [16]。
- 上线博客（2026-06-09，作者 “Blue Clarity”）[17]；Sturisky 博客（2026-05-28）：“STRK20 is the privacy capability going live on Starknet in June” [14]。
- strk20 可用性表格（“Sources checked: 24 September 2026”）[10]。
- 费用模式：sponsored、sponsored_private、default，三种都是从私有余额中提取费用付给 relayer 的 forwarder [7]。合约 `collect_fee` 从 `get_caller_address()` 扣 `fee_amount` STRK [2 privacy.cairo#L845-L856]。

### 不确定之处
- “under ten cents”是否成立取决于 STRK 价格。2.5 STRK 池费加 gas 要低于 10 美分，STRK 需低于约 0.04 美元。本次未查价格（brief 不包括价格分析），标 speculative。
- “1–3 秒最终性”未测。架构页称本地证明需要“±30 seconds on a strong laptop”[6 architecture]。
- 部署日（4-20）与公告上线日（6-09）之间的状态（内测 / 白名单）未核实。
- 6-25 的 Private USDC 和 7-14 的 Compliance Layer 两篇博客只看到了标题和日期（出现在相关文章列表中），未读正文。
- 二分查找“当前 class 生效块”时假设 class 没有被回滚到同一个 hash；中间升级了几次未统计。

---

## 图的素材

### A. 一笔私有转账时序（Alice → Bob，首次通道）[1][2][5][7][9]
1. Alice 钱包 / SDK 通过 discovery（OHTTP）同步自己的 notes，并读取 Bob 的 `public_key`（Bob 必须已注册）[6 discovery][7]。
2. SDK 组装 ClientActions：`OpenChannel(Bob) → OpenSubchannel(token) → UseNote(×n) → CreateEncNote(Bob, amt) → CreateEncNote(Alice 找零) → Withdraw(fee → forwarder)` [2 actions.cairo#L277-L284][7]。
3. SDK 构造虚拟 Invoke V3：sender = pool，calldata = `compile_actions(Alice, k_A, actions)`，nonce 为 0，费用为 0；Alice 账户签名 [9]。
4. 证明服务（运营者，或 Alice 本地）在锚定到最近区块的虚拟 OS 中执行。pool 的 `__validate__` 检查 OS 调用和零费用；`__execute__` 依次运行 `compile_actions → main`（检查阶段、记账、WriteOnce 预检）、`assert_valid_signature`（调用 Alice 账户）、`send_message_to_l1([class_hash, server_actions])`。随后用 Stwo 生成证明和 proof_facts [2 privacy.cairo#L179-L214]。
5. SDK 把 `(proof, proof_facts, server_actions)` 交给 relayer / paymaster。relayer 从自己的账户发出 `pool.apply_actions(server_actions, screening=None)` [6 paymasters][7]。
6. sequencer 网关验证 Stwo 证明；blockifier 校验 proof_version、虚拟 OS program hash 白名单、base block hash、config hash [5]。
7. pool 的 `apply_actions` 依次执行：`validate_proof`（变体、版本、450 块窗口、消息哈希）→ `collect_fee`（从 relayer 扣 2.5 STRK）→ `_apply_actions`（Append 到 `recipient_channels[Bob]`、WriteOnce 写 nullifier / note / channel、发事件、TransferTo 把费用付给 forwarder）[2 privacy.cairo#L784-L909]。
8. Bob 的 discovery 扫描 `recipient_channels[Bob]`，用 ECDH 解出 channel_key，按顺序扫描子通道和 notes，再查询 nullifier [6 discovery]。

### B. 状态与转移
- Note 的 `packed_value = pack(salt, amount)` 有三种状态 [2 objects.cairo#L89-L100；actions.cairo#L97-L99]：
  - salt = 0：不存在；
  - salt = 1：open note，金额明文，未充值时为 0；
  - salt ≥ 2：加密 note。
- open note 的生命周期：CreateOpenNote（0 值）→ 同一笔交易内由被调用合约 `_deposit_to_open_note`（要求未充值且 token 一致）→ 之后可作为普通 note 被 UseNote [2 privacy.cairo#L1039-L1069]。
- note 从“未花”到“已花”的条件：`nullifiers[H(…, k_owner)] = true`（WriteOnce）[2 privacy.cairo#L618-L630]。
- viewing key 的状态：从“未注册”到“已注册”只发生一次，之后不可更换 [2 privacy.cairo#L315-L357][7]。

### C. 对比维度（隐私保证 × 观察者）
见 S-Q3 的表格。行：链上旁观者、relayer / paymaster、证明服务、discovery、OHTTP relay、auditor、接收方、sequencer / mempool。列：能看到 / 看不到 / 条件。

### D. 密码学组件 × PQ 状态（STRK20 内部）
| 组件 | 算法 | 位置 | PQ 状态 |
|---|---|---|---|
| 状态转移证明 | Stwo（STARK，hash-based） | 证明服务 + 网关 | 官方称 PQ [11]；Phase 1 只由 Starknet 共识验证 [13] |
| viewing 公钥 | Stark 曲线 `x(kG)` | 链上 `public_key` | 非 PQ（Shor 可恢复 k，inferred） |
| channel 分发 / auditor 托管 | Stark 曲线 ECDH 加 Poseidon 掩码 | 链上 | 非 PQ（HNDL） |
| 金额 / token 掩码、各类 ID、nullifier | Poseidon | 链上 | 大概率仅受 Grover 影响（speculative） |
| 支出授权 | 用户账户 `is_valid_signature`（通常是 Stark ECDSA） | 虚拟 OS 内 | 取决于账户类型（见 account / PQ 路） |
| screening attestation | screener 签名（Stark 曲线） | 链上校验 | 非 PQ（推断，未读签名实现细节） |
| 传输层 | OHTTP：X25519 HPKE + AES-128-GCM | SDK ↔ 服务 | 非 PQ |

### E. 时间线
- 2026-02-15：SNIP-36（in-protocol S-two verification）在社区论坛发布，状态 Draft [13]
- 2026-03-18～03-31：OpenZeppelin 审计 commit c5e2fb5 [12]
- 2026-04-20：Starknet v0.14.2 主网上线（proof / proof_facts 字段）[16]；同日 pool 在区块 8978970 部署（C2）
- 2026-05-28：Sturisky 博客 “going live in June”，“1–3 s，under ten cents” [14]
- 2026-05-29：审计报告发布 [3]
- 2026-06-09：“Privacy Is Now Live on Starknet”，第一阶段上线（Ready X、Xverse）[17]
- 2026-07-23：形式化验证开源 [4]
- 2026-08-07：Starknet Quantum Resistance 博客 [15]
- 2026-09-23：pool 升级到当前 class（区块 15337340，0.14.3）（C2）
- 2026-09-24：strk20 可用性表格核对日 [10]
- 2026-09-28：starknet-privacy 仓库 commit f9256c5e [2]

---

## 代码素材

1) nullifier 与 note_id —— starknet-privacy/packages/privacy/src/hashes.cairo#L206-L236@f9256c5e
```cairo
/// `note_id = h(NOTE_ID_TAG, channel_key, token, index, 0)`
pub(crate) fn compute_note_id(
    channel_key: felt252, token: ContractAddress, index: usize,
) -> felt252 {
    hash([NOTE_ID_TAG, channel_key, token.into(), index.into(), Zero::zero()].span())
}
/// `nullifier = h(NULLIFIER_TAG, channel_key, token, index, 0, owner_private_key)`
pub(crate) fn compute_nullifier(
    channel_key: felt252, token: ContractAddress, index: usize, owner_private_key: felt252,
) -> felt252 {
    hash(
        [NULLIFIER_TAG, channel_key, token.into(), index.into(), Zero::zero(), owner_private_key]
            .span(),
    )
}
```
https://github.com/starkware-libs/starknet-privacy/blob/f9256c5e37682d37437e69a795ddd51d924c9b97/packages/privacy/src/hashes.cairo#L206-L236

2) ECDH 核心 —— starknet-privacy/packages/privacy/src/utils.cairo#L134-L146@f9256c5e
```cairo
fn _compute_shared_x(ephemeral_secret: felt252, public_key: felt252) -> (felt252, felt252) {
    // Compute ephemeral public key.
    let ephemeral_pub_point = GEN_P().mul(scalar: ephemeral_secret);
    let ephemeral_pub_x = ephemeral_pub_point
        .try_into()
        .expect(internal_errors::ZERO_EPHEMERAL_PUBLIC)
        .x();
    // Compute shared point.
    let public_point = EcPointTrait::new_from_x(x: public_key).expect(errors::INVALID_PUBLIC_KEY);
    let shared_point = public_point.mul(scalar: ephemeral_secret);
    let shared_x = shared_point.try_into().expect(internal_errors::ZERO_SHARED).x();
    (ephemeral_pub_x, shared_x)
}
```

3) 把 viewing 私钥加密给 auditor —— utils.cairo#L220-L229@f9256c5e
```cairo
pub(crate) fn encrypt_private_key(
    ephemeral_secret: felt252, auditor_public_key: felt252, private_key: felt252,
) -> EncPrivateKey {
    let (ephemeral_pub_x, shared_x) = _compute_shared_x(
        :ephemeral_secret, public_key: auditor_public_key,
    );
    // Encrypt channel information.
    let enc_private_key = compute_enc_private_key_hash(:shared_x) + private_key;
    EncPrivateKey { auditor_public_key, ephemeral_pubkey: ephemeral_pub_x, enc_private_key }
}
```

4) 链上验证 proof facts —— privacy.cairo#L827-L842@f9256c5e
```cairo
        // Assert program variant and output version are correct.
        assert(program_variant == VIRTUAL_SNOS, errors::INVALID_PROGRAM_VARIANT);
        assert(starknet_os_output_version == VIRTUAL_SNOS0, errors::INVALID_OS_OUTPUT_VERSION);

        // Assert base block number is recent.
        let current_block_number = execution_info.block_info.block_number;
        assert(base_block_number < current_block_number, errors::INVALID_BASE_BLOCK_NUMBER);
        assert(
            current_block_number <= base_block_number + self.proof_validity_blocks.read(),
            errors::PROOF_EXPIRED,
        );

        // Assert that the message hash is included in the L1 messages,
        // meaning the proof is valid for this transaction.
        let message_hash = compute_message_hash(:actions, :contract_address);
        assert(message_to_l1_hashes == [message_hash].span(), errors::INVALID_PROOF_MSG);
```

5) 虚拟执行中的 `__execute__` —— privacy.cairo#L195-L214@f9256c5e
```cairo
        fn __execute__(ref self: ContractState, calls: Array<Call>) {
            self.reentrancy_guard.start();
            let execution_info = get_execution_info();
            let tx_info = execution_info.tx_info;
            assert_valid_os_call(
                caller_address: execution_info.caller_address, tx_version: tx_info.version,
            );
            let calls = calls.span();
            let (user_addr, user_private_key, client_actions) = extract_compile_actions_inputs(
                :calls, contract_address: execution_info.contract_address,
            );
            let server_actions = self
                .compile_actions(:user_addr, :user_private_key, :client_actions);
            assert_valid_signature(:user_addr, :calls, :tx_info);
            send_message_to_server(
                :server_actions, contract_address: execution_info.contract_address,
            );
            self.reentrancy_guard.end();
        }
```

6) 签名的三条路径（节选）—— utils.cairo#L391-L418@f9256c5e
```cairo
    if supports_custom_validation(user_addr)
        && signature_accepted(
            ICustomSignatureValidationSafeDispatcher { contract_address: user_addr }
                .is_custom_signature_valid(calls, array![].span(), tx_info.signature),
        ) {
        return;
    }
    let user_account = IAccountSafeDispatcher { contract_address: user_addr };
    // II. Standard SN wallet: signature over the tx hash.
    if signature_accepted(
        user_account.is_valid_signature(hash: tx_info.transaction_hash, signature: tx_info.signature.into()),
    ) { return; }
    // III. Legacy SN wallet: signature over the SNIP-12 `CallSet` hash of `calls`.
    if signature_accepted(
        user_account.is_valid_signature(hash: compute_call_set_hash(user_addr, calls, array![].span()), signature: tx_info.signature.into()),
    ) { return; }
    panic_with_felt252(errors::INVALID_SIGNATURE);
```
（II、III 两段为便于阅读压成了单行，逻辑与源码一致。）

7) 守恒 —— objects.cairo#L15-L26@f9256c5e
```cairo
    fn subtract_balance(ref self: TokenBalances, token: ContractAddress, amount: u128) {
        let (entry, current_balance) = self.entry(key: token.into());
        let new_value = current_balance
            .checked_sub(amount)
            .expect(errors::NEGATIVE_INTERMEDIATE_BALANCE);
        self = entry.finalize(:new_value);
    }
    fn assert_valid(self: SquashedTokenBalances) {
        for (_token, _, balance) in self.into_entries() {
            assert(balance.is_zero(), errors::FINAL_BALANCE_MUST_BE_ZERO);
        }
    }
```

8) sequencer 对 proof facts 的预验证（节选）—— sequencer/crates/blockifier/src/transaction/account_transaction.rs#L314-L330@54f97a8a
```rust
        if !os_constants.allowed_proof_versions.contains(&snos_proof_facts.proof_version.as_felt())
        { return Err(/* "Proof version … is not allowed under this protocol version." */); }
        // Validate the program hash.
        let allowed = &os_constants.allowed_virtual_os_program_hashes;
        if !allowed.contains(&snos_proof_facts.program_hash) {
            return Err(/* "Virtual OS program hash … is not allowed" */);
        }
```

9) Lean 中的理想化密码学 —— starknet-privacy/lean/privacy/utils.lean#L29-L38@f9256c5e
```lean
structure Crypto where
  hash: List ℕ → ℕ
  h_hash: ∀ {ℓ₁ ℓ₂}, hash ℓ₁ = hash ℓ₂ → ℓ₁ = ℓ₂
  PrivateKeys: Finset ℕ
  priv_to_pub: ℕ → ℕ
  enc: ℕ → List ℕ → ℕ
  enc_is_not_zero: ∀ x ℓ, enc x ℓ ≠ 0
  dec: ℕ → ℕ → List ℕ
  dec_enc: ∀ (k: PrivateKeys) ℓ, dec k (enc (priv_to_pub k) ℓ) = ℓ
```

---

## 外部调研 / 用户资料中被修正或无法核实的地方

1. **GPT §3.4 公式不精确**：GPT 写的是 `noteId = H(channel, token, index)`、`nullifier = H(channel, token, index, k_view)`。实际是带 domain tag 和保留 0 位的 Poseidon，第一项是 `channel_key`（由双方地址、sender 的 vk、recipient 公钥派生），不是“channel”：`note_id = H(NOTE_ID_TAG, channel_key, token, index, 0)`，`nullifier = H(NULLIFIER_TAG, channel_key, token, index, 0, owner_vk)` [2 hashes.cairo#L206-L236]。
2. **GPT §3.3 漏掉了证明本身由谁验证**：GPT 只写了合约检查 proof_facts。实际上 Stwo 证明由 sequencer 网关验证，blockifier 另外校验 program hash 白名单、block hash 和 config hash；合约只核对 facts 与消息哈希 [5][2]。并且按 SNIP-36，Phase 1 只由 Starknet 共识验证，尚未结算到 Ethereum [13]。
3. **GPT §6.1 低估了 PQ 暴露面**：GPT 认为风险来自 ECDH 密文。实际上 viewing 公钥 `x(kG)` 本身明文存在链上 `public_key[user]`，Shor 可以直接恢复 k，无需密文；auditor 公钥是全局单点，破解它就能解出所有注册用户的 k [2 privacy.cairo#L106-L110；utils.cairo#L264-L267]。属于推论。
4. **GPT §3.5 对 deposit / withdraw 的描述不够细**：Deposit 事件公开存款人 `user_addr`；Withdrawal 公开 `to_addr`，但发起人地址只以密文形式给 auditor；open note 公开 token，收款人只以密文形式给 auditor [2 privacy.cairo#L486-L531, #L676-L714]。
5. **GPT §3.5“未验证向 prover 隐藏见证”可以收紧为“已确认不隐藏”**：SDK 把 viewing key 明文放进发给证明服务的 calldata；starkzap 文档明确说关闭 OHTTP 时 viewing key 以明文到达服务，而开启 OHTTP 时服务端解封装后同样能读到 [9][7][8]。
6. **GPT §6.2 Shadow 身份**：pool 内的派生是 `identity_key = H(IDENTITY_KEY_TAG, user_addr, user_vk, contract_address)`。GPT 说的 `dapp_name` 和 nonce 属于 anonymizer / Shadow 层，本路未核实，交给 shadow 路 [2 hashes.cairo#L57-L61]。
7. **用户 / lane 提示中的 “quantum-resistant by design”**：截至 2026-10-14，strk20.starknet.io 的首页、/build、/index.md、llms-full.txt 中都没有这句话。找到的官方 PQ 表述是 /interactive 页面中的 “No trusted setup. Post-quantum.”，所指是 STARK 证明系统 [11]（命令 C5、C6）。
8. **上线日期“2026-06？”需要拆开写**：合约于 2026-04-20 随 v0.14.2 部署（链上可查），官方于 2026-06-09 宣布上线 [16][17]（C2）。
9. **官方页面的内部矛盾**：
   - interactive 页写 “your own device generates a zero-knowledge STARK proof”，而 architecture 页写 “designated operators generate proofs on behalf of users”，starkzap 写 “A remote proving service” [11][6][7]。
   - 上线博客写 “Starknet verifies the proof onchain”，实际是 sequencer 网关验证，不是合约验证 [17][5]。
   - “zero-knowledge … revealing none of it” 与 SNIP-36 的 “privacy is de facto … A future phase may support fully zero-knowledge proofs” 有张力；SNIP 是 2026-02 的 Draft，可能已过时 [13]。
10. **docs 的 proving 页已过时**：该页仍写 “the reference implementation, SDK, and proving stack are still private”，而 overview 页写 “SDK now open source”，仓库也已公开 [6 proving][6 overview][1]。
11. **筛查服务商说法不一**：docs 写 Elliptic，strk20 build 页写 “FPI” [7][10]。
12. **paymaster 费用流向**：docs 写用户 Withdraw 去补偿 paymaster；合约里实际是 `collect_fee` 从 `apply_actions` 的调用者（relayer）扣 `fee_amount` STRK，用户的 Withdraw 再把费用付给 forwarder。两种说法不矛盾，但 docs 没提 2.5 STRK 的固定池费 [6 paymasters][2 privacy.cairo#L845-L856]（C1）。
13. **Sturisky 的 “sender, receiver, and amount hidden … under ten cents … one to three seconds”**：前半句没有提新通道暴露 recipient、sender 只在走 paymaster 时隐藏；后两项是“designed to”，属于设计目标。当前池费 2.5 STRK，是否低于 10 美分取决于币价，本次未核实 [14][6 security]（C1）。

---

## 来源

1. **PRIMARY** starkware-libs/starknet-privacy README @ f9256c5e — https://github.com/starkware-libs/starknet-privacy/blob/f9256c5e37682d37437e69a795ddd51d924c9b97/README.md ：给出参与者、端到端流程，以及组件版本矩阵（PRIVACY-0.14.3-RC.x；proof-interceptor 是可选的筛查 sidecar）。
2. **PRIMARY** starknet-privacy 源码 @ f9256c5e：packages/privacy/src/{privacy,actions,hashes,utils,objects,events}.cairo、lean/privacy/* ：证明入口、actions、派生公式、ECDH、签名路径、守恒、存储布局，以及 Lean 模型的假设。
3. **PRIMARY** starknet-privacy docs/audit/README.md @ f9256c5e ：审计方 OpenZeppelin、commit c5e2fb5、日期 2026-05-29。
4. **PRIMARY** StarkWare 博客 “Formal Verification of the STRK20 Privacy Pool”（2026-07-23）https://starkware.co/blog/strk20-formal-verification/ ，访问于 2026-10-14：形式化覆盖的性质、230+ 定理，以及“协议被形式化、Cairo 实现另由审计覆盖”的原话。
5. **PRIMARY** starkware-libs/sequencer @ 54f97a8a：crates/apollo_gateway/src/{gateway.rs, stateless_transaction_validator.rs}、crates/blockifier/src/transaction/account_transaction.rs、crates/starknet_api/src/transaction_hash.rs、crates/starknet_os/src/proof_fact_fold.rs、crates/blockifier/resources/blockifier_versioned_constants_0_14_*.json ：网关验证证明，blockifier 校验 proof facts，各版本的白名单。
6. **PRIMARY** docs.starknet.io/build/starknet-privacy/{overview, architecture, security, compliance, encryption-and-keys, proving, paymasters, transaction-flow, discovery, notes-and-nullifiers}（.md 版本），访问于 2026-10-14：官方的隐私边界、合规能力、加密方式、合约地址、证明方说明。
7. **PRIMARY** docs.starknet.io/build/starkzap/privacy/strk20（.md），访问于 2026-10-14：存款必须经 Elliptic 筛查；远程证明服务；relayer 提交；OHTTP 警告；viewing key 不可更换；费用模式。
8. **PRIMARY** starknet-privacy/crates/discovery-service/specs/{05-security-considerations.md, 20-ohttp-integration.md} @ f9256c5e ：discovery 运营者能看到什么；OHTTP 保护的是什么、不保护什么。
9. **PRIMARY** starknet-privacy/sdk/src/internal/{proof-invocation-factory.ts, ohttp-client.ts} @ f9256c5e ：发给证明服务的 calldata 中含 viewing key；虚拟交易的 nonce、费用和签名对象；HPKE 套件为 X25519 / AES-128-GCM。
10. **PRIMARY** strk20.starknet.io（首页、/index.md、/build、/llms-full.txt），访问于 2026-10-14：官方 FAQ 承认的泄露面；“FPI” 筛查说法；可用性表格（核对日 2026-09-24）；当前文本中没有 “quantum”。
11. **PRIMARY** strk20.starknet.io/interactive（前端包 /interactive/assets/index-Xkq-Ap9T.js），访问于 2026-10-14：官方 “No trusted setup. Post-quantum.” 表述（指证明系统），以及 “proved on your device” 的说法。
12. **PRIMARY** OpenZeppelin “Privacy Contracts Audit”（2026-05-29，docs/audit/Privacy V1.pdf @ f9256c5e）：审计范围、时间线、发现、信任模型（auditor 能解密不能花钱、零延迟升级、中心化证明服务），以及 L-05 ECDH 临时私钥复用问题。
13. **PRIMARY** SNIP-36 “In protocol S-Two verification”（community.starknet.io/t/116123，作者 Ohad Barta，2026-02-15 创建，2026-02-23 更新，Draft），访问于 2026-10-14：网关中的 S-Two verifier；Phase 1 只由共识验证；privacy 为 de facto，非完全 ZK。
14. **PRIMARY**（官方博客，含营销表述）Benjamin Sturisky “Making Privacy Practical”（starknet.io，2026-05-28）https://www.starknet.io/blog/making-privacy-practical/ ，访问于 2026-10-14：“going live in June”、“one to three seconds at under ten cents”、“sender, receiver, and amount are hidden onchain”。
15. **PRIMARY** starknet.io 博客 “Starknet’s Upgrade to Quantum Resistance”（2026-08-07）https://www.starknet.io/blog/quantum-resistance/ ，访问于 2026-10-14：官方承认 HNDL 威胁类别；正文没有提到 STRK20 的 ECDH。
16. **PRIMARY** starknet.io 博客 “Starknet v0.14.2: Native Privacy for STRK20 and strkBTC”（datePublished 2026-04-20）https://www.starknet.io/blog/starknet-v0-14-2-the-privacy-engine-arrives/ ，访问于 2026-10-14：v0.14.2 上线，引入 proof / proof_facts 字段（SNIP-36）。
17. **PRIMARY** starknet.io 博客 “Privacy Is Now Live on Starknet”（2026-06-09）https://www.starknet.io/blog/privacy-live-on-starknet/ ，访问于 2026-10-14：第一阶段上线，经 Ready X、Xverse 接入。
18. **PRIMARY**（链上）Starknet 主网 pool `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`，经 https://starknet-rpc.publicnode.com 读取，2026-10-14：部署区块、class 变更、版本、费用、证明有效期（命令 C1、C2）。

---

## 命令与输出

- **C1**（链上读取，2026-10-14，publicnode RPC，`starknet_call … "latest"`）：
  ```
  block 16357332
  get_version ['0x322e31'] = '2.1'
  get_fee_amount ['0x22b1c8c1227a0000']   # = 2_500_000_000_000_000_000 FRI = 2.5 STRK
  get_fee_collector ['0xd79041634625e5288296fbc648088788710ba44903a3a49468a66567749e77']
  get_proof_validity_blocks ['0x1c2']      # = 450
  get_auditor_public_key ['0x1eed60b8d483b3bede62d1cc0f32874aea30747e6943437c858359b41801bf7']
  get_screener_public_key ['0x501cc452e5a4370e2f0879c9a863b3efc915005817487460b23a8d6ef88fdb2']
  is_paused ['0x0']
  starknet_getClassHashAt(latest) = 0x6d163f2b27df0f53c5b0d019366261ba8034af1bef949dee920a60fe58bcf83
  ```
- **C2**（对 `starknet_getClassHashAt` 做二分查找）：
  ```
  deploy block 8978970 2026-04-20 10:08:48 UTC sn_version 0.14.2 class at deploy 0x30b8c540cf04d8ef0f4db2a9098d9cc0e35e83af1cb3325f5a4f40144b4b30b
  current class since block 15337340 2026-09-23 20:56:33 UTC sn_version 0.14.3
  ```
- **C3**（sequencer 版本常量中的 `os_constants`）：
  ```
  0_14_0 / 0_14_1: hashes [] versions []
  0_14_2: hashes ['0x3e98c2d7…5473'] versions ['0x50524f4f4630' = 'PROOF0']
  0_14_3: hashes ['0x53f6c9fc…daa1'] versions ['PROOF1']
  0_14_4: 2 hashes, versions ['PROOF1','PROOF2']; 0_14_5: 3 hashes, ['PROOF1','PROOF2']
  ```
- **C4**：`find lean -name "*.lean" | wc -l` → 56；总行数 8124；`grep -rn "^theorem\|^lemma" lean | wc -l` → 236；`grep -rn "sorry\|axiom" lean` → 无输出；`cat lean/lean-toolchain` → `leanprover/lean4:v4.27.0-rc1`。
- **C5**：`grep -i quantum` 对 strk20.starknet.io 首页 HTML、/index.md、/build、/llms-full.txt、strk20-by-example.org/llms-full.txt、/what-is-strk20 均无输出。
- **C6**：对 /interactive/assets/index-Xkq-Ap9T.js 搜索 `quantum`，命中 `nullifier:"no trusted setup · post-quantum"` 和 `title:"No trusted setup. Post-quantum.",body:"STARKs are hash-based … security holds even against quantum computers."`
- **C7**：quantum.starkware.co/migration-register 的静态 HTML（39 KB，去标签后 4.5 KB）中，`strk20|privacy|ECDH|viewing key|encrypt` 命中 0 次。
- **C8**：`pdftotext docs/audit/Privacy V1.pdf`，共 520 行，摘录见 S-Q5。
- **C9**：eprint.iacr.org/2026/474.pdf 返回 HTTP 403，论文未读。

---

## 开放问题

1. 当前部署的 class（0x6d163f2b…）与 f9256c5e 源码是否逐字一致？`get_version` 都是 '2.1'，但没有比对 class hash（需要用 Scarb 编译后比较 Sierra / CASM hash）。
2. 审计（c5e2fb5）之后新增的 screening、ComputeAndInvoke、SNIP-12 遗留路径是否有补充审计？
3. Stwo 证明是否已经启用 ZK（隐藏见证）模式？SNIP-36 Draft 说当前是 “de facto”。
4. 私有交易的证明何时、以何种方式进入 L1 结算（SHARP / 递归树）？`proof_fact_fold.rs` 里还在用测试常量。
5. PQ 迁移路径：viewing key 和 auditor 托管是否有 PQ KEM（如 ML-KEM）的计划？已上链的 `public_key` 和密文无法撤回，迁移以后旧数据仍然暴露。
6. 未来的 PQ 账户（如 Falcon）能否在虚拟 OS 的 builtin 子集中通过 `is_valid_signature`？
7. auditor 私钥的保管方式（是否采用论文所说的 threshold、由谁保管）与授权流程，本次未见到公开部署证据。
8. 筛查服务商到底是 Elliptic 还是 “FPI”？screener 签名用的是哪种曲线和方案？

---

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| S1 | 链上入口是 `apply_actions(actions: Span<ServerAction>, screening: Option<ScreeningAttestation>)`，依次执行未暂停检查、validate_proof、collect_fee、_apply_actions、screening | starknet-privacy/packages/privacy/src/privacy.cairo#L784-L803@f9256c5e | observed | |
| S2 | ClientAction 共 10 种（SetViewingKey、OpenChannel、OpenSubchannel、CreateEncNote、CreateOpenNote、Deposit、UseNote、Withdraw、InvokeExternal、ComputeAndInvoke），阶段只能前进，INVOKE 每笔至多一次 | packages/privacy/src/actions.cairo#L245-L315@f9256c5e | observed | |
| S3 | ServerAction 共 12 种（WriteOnce、Append、TransferFrom、TransferTo、6 种 Emit、Invoke、InvokeWithComputation） | packages/privacy/src/actions.cairo#L368-L399@f9256c5e | observed | |
| S4 | pool 在虚拟 OS 中充当“账户”：`__validate__` 只检查 OS 调用和零费用；`__execute__` 依次编译 actions、验签、send_message_to_l1 | privacy.cairo#L179-L214@f9256c5e；utils.cairo#L439-L447, #L575-L582@f9256c5e | observed | |
| S5 | SDK 发给证明服务的虚拟交易：sender = pool，calldata 含 user.viewingKey，nonce 为 0，用户账户签名 | sdk/src/internal/proof-invocation-factory.ts#L32-L58, #L132-L160@f9256c5e | observed | |
| S6 | 链上 validate_proof 检查 program_variant=VIRTUAL_SNOS、output=VIRTUAL_SNOS0、base 块在 proof_validity_blocks 窗口内、message_to_l1_hashes 等于 actions 的消息哈希 | privacy.cairo#L808-L843@f9256c5e；utils.cairo#L552-L564@f9256c5e | observed | |
| S7 | 合约忽略 proof_facts 中的 virtual_program_hash、base_block_hash、config_hash，这三项由 blockifier 校验 | privacy.cairo#L816-L825@f9256c5e；sequencer/crates/blockifier/src/transaction/account_transaction.rs#L291-L350@54f97a8a | observed | |
| S8 | Stwo 证明由 sequencer 网关的异步验证任务验证，失败则拒收交易 | sequencer/crates/apollo_gateway/src/gateway.rs#L489-L511@54f97a8a；[13] SNIP-36 “A S-Two Verifier written in Rust is added to the gateway” | observed | |
| S9 | proof_facts 以 Poseidon 哈希链入 tx hash，proof 本身不进 tx hash，feeder gateway 会剥离 proof | sequencer/crates/starknet_api/src/transaction_hash.rs#L399-L402@54f97a8a；stateless_transaction_validator.rs#L298-L300@54f97a8a | observed | |
| S10 | 虚拟 OS program hash / proof 版本白名单在 0.14.0 / 0.14.1 为空，从 0.14.2 起非空（PROOF0） | 命令 C3（blockifier_versioned_constants_0_14_*.json@54f97a8a） | observed | |
| S11 | SNIP-36 Phase 1：证明只由 Starknet 共识验证，未来才接入 SHARP、在 Ethereum 上验证 | [13] community.starknet.io/t/116123 “Mindset behind the design” 一节 | observed | |
| S12 | 私有交易的 proof facts 折叠进递归证明树的代码仍使用测试常量（带 TODO） | sequencer/crates/starknet_os/src/proof_fact_fold.rs#L1-L18@54f97a8a | observed | |
| S13 | note_id = Poseidon(NOTE_ID_TAG, channel_key, token, index, 0) | packages/privacy/src/hashes.cairo#L200-L210@f9256c5e | observed | |
| S14 | nullifier = Poseidon(NULLIFIER_TAG, channel_key, token, index, 0, owner_viewing_private_key) | hashes.cairo#L224-L236@f9256c5e | observed | |
| S15 | channel_key = Poseidon(CHANNEL_KEY_TAG, sender_addr, sender_vk, recipient_addr, recipient_pk)，通道有方向 | hashes.cairo#L114-L132@f9256c5e；[6] discovery “Channels are directional” | observed | |
| S16 | identity_key = Poseidon(IDENTITY_KEY_TAG, user_addr, user_vk, contract_address)，经 ComputeAndInvoke 交给目标合约的 privacy_compute | hashes.cairo#L48-L61@f9256c5e；privacy.cairo#L547-L582@f9256c5e | observed | |
| S17 | 双花防护：use_note 产出 WriteOnce(nullifiers[nf]=true)，链上 _apply_write_once 写入前断言槽位为 0 | privacy.cairo#L618-L630, #L945-L960@f9256c5e | observed | |
| S18 | 链上重做 WriteOnce 检查，可以拦截基于同一旧区块（≤450 块）并发证明的冲突交易 | 由 S6、S17 推出：证明锚定在旧区块，最终是否写入以链上当前状态为准 | inferred | |
| S19 | 余额守恒：逐 token 临时余额，Deposit / UseNote 增、CreateEncNote / Withdraw 减，不得为负，交易结束必须为 0 | objects.cairo#L6-L27@f9256c5e；privacy.cairo#L310@f9256c5e；[6] transaction-flow | observed | |
| S20 | open note 以 0 值创建，必须在同一笔交易内由被调用合约 transfer_from 补足，否则回滚 | privacy.cairo#L864-L909, #L1039-L1069@f9256c5e | observed | |
| S21 | 支出授权：custom（需 SRC5 声明）、is_valid_signature(tx_hash)、is_valid_signature(SNIP-12 CallSet hash)，三条路径任一通过即可 | utils.cairo#L371-L420@f9256c5e | observed | |
| S22 | 如果账户的 is_valid_signature 仍接受传统签名，即使 `__validate__` 已改为 PQ，也能通过 STRK20 的授权 | 由 S21 推出：pool 只调用 is_valid_signature / is_custom_signature_valid，不调用 `__validate__` | inferred | |
| S23 | 注册时把 public_key = x(k·G) 明文写到链上，并把 k 用 ECDH 加密给 auditor_public_key，两者均为 WriteOnce，不可更换 | privacy.cairo#L319-L357@f9256c5e；utils.cairo#L220-L229, #L264-L267@f9256c5e；[7] “cannot be replaced” | observed | |
| S24 | auditor 可解密注册用户的 viewing key，扫描入向和出向通道、金额、nullifier、提现，但不能签名支出 | [6] compliance、security；[12] Security Model 一节 | observed | |
| S25 | 存款需要 screener 签名的 attestation，有效期为 issued_at+300s、允许 60s 时钟超前；open-note 存款按 Required / Exempt / Delegated 策略处理 | privacy.cairo#L921-L943, #L991-L1035@f9256c5e；utils.cairo#L97-L99@f9256c5e；objects.cairo#L102-L124@f9256c5e | observed | |
| S26 | 官方文档称存款经 Elliptic 筛查，由 StarkWare 管理凭证；strk20 build 页则称由 “FPI” 筛查并签名 | [7] Warning 段落；[10] /build “Compliance-first” | observed | |
| S27 | Deposit 事件公开 user_addr、token、amount；Withdrawal 事件公开 to_addr、token、amount，发起人地址加密给 auditor | privacy.cairo#L486-L531@f9256c5e；events.cairo@f9256c5e | observed | |
| S28 | 开新通道时，Append 写入 recipient_channels[recipient_addr]，recipient 地址公开 | privacy.cairo#L89-L90, #L416-L417@f9256c5e；[6] security “recipient address on-chain once per sender–recipient pair” | observed | |
| S29 | 链上旁观者看到的 sender 是 paymaster；paymaster 可能看到 IP | [6] security、paymasters | observed | |
| S30 | 证明服务运营者能拿到 viewing key 和全部 client actions，即完整见证 | 由 S5 与 [7] “With ohttp disabled, your viewing key reaches the proving and discovery services in plaintext” 推出：OHTTP 解封装后服务端仍读取明文 | inferred | |
| S31 | discovery 运营者能看到 viewing key、活跃收款方、通道 / 子通道 / note 数量、token 和同步时间；OHTTP 加 relay 只隐藏 IP | crates/discovery-service/specs/05-security-considerations.md#L66-L79@f9256c5e；20-ohttp-integration.md#L5-L11@f9256c5e | observed | |
| S32 | SDK 的 OHTTP 使用 DHKEM-X25519 + HKDF-SHA256 + AES-128-GCM | sdk/src/internal/ohttp-client.ts#L9, #L159@f9256c5e | observed | |
| S33 | SNIP-36 称当前隐私是 “de facto (computationally infeasible to extract)”，未来才可能是完全 ZK 证明 | [13] “Better support for privacy” | observed | |
| S34 | channel 分发和 auditor 托管使用 Stark 曲线 ECDH：R=rG，共享材料为 (r·K).x，密文 = Poseidon(tag, S.x) + 明文 | utils.cairo#L124-L258@f9256c5e；[6] encryption-and-keys | observed | |
| S35 | 金额加密为 (Poseidon(ENC_AMOUNT_TAG, channel_key, token, index, 0, salt) + amount) mod 2^128，不是 AES 一类分组密码 | utils.cairo#L274-L302@f9256c5e；[12] “Poseidon-based key stream” | observed | |
| S36 | 量子攻击者可以从链上明文的 public_key 用 Shor 恢复任一注册用户的 viewing 私钥 k | 由 S23、S34 推出：public_key = x(k·G) 是 Stark 曲线离散对数实例 | inferred | |
| S37 | 拿到 k 就能复原该用户的通道、金额、已花状态和 identity_key（从而关联 Shadow 身份），已上链数据属于“先收集、后解密” | 由 S13–S16、S34–S36 推出：所有派生都只依赖 k、地址和链上公开值 | inferred | |
| S38 | auditor 公钥是全局单点：量子破解它就能解出所有注册用户的 k | 由 S23、S36 推出：每个 enc_private_key 都加密给同一个 auditor_public_key | inferred | |
| S39 | Poseidon 掩码部分在量子模型下大概只受 Grover 级影响；128 位金额掩码的余量需另行评估 | 未做密码分析，基于对 S35 构造的一般判断 | speculative | |
| S40 | 官方 interactive 页称 “No trusted setup. Post-quantum. STARKs are hash-based…”，所指是证明系统 | [11] index-Xkq-Ap9T.js；命令 C6 | observed | |
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
| S52 | 主网 pool 0x040337b1…ffe812a 于 2026-04-20 10:08:48 UTC（区块 8978970，0.14.2）部署 | 命令 C2；地址见 [6] overview | observed | |
| S53 | Starknet v0.14.2 于 2026-04-20 主网上线，引入 proof 和 proof_facts 字段（SNIP-36） | [16] datePublished 2026-04-20T13:40:57Z 及正文 | observed | |
| S54 | 官方于 2026-06-09 宣布 STRK20 第一阶段上线，经 Ready X、Xverse 接入 | [17] 正文 | observed | |
| S55 | 截至 2026-10-14：版本 '2.1'，池费 2.5 STRK / 次 apply_actions，proof_validity_blocks = 450，未暂停 | 命令 C1 | observed | |
| S56 | 池费由 collect_fee 从 apply_actions 的调用者（relayer）扣取；用户在交易中用 Withdraw 从私有余额补偿 | privacy.cairo#L845-L856@f9256c5e；[7] Fee modes；[6] paymasters | observed | |
| S57 | “under ten cents” 在当前 2.5 STRK 池费下成立，需要 STRK 低于约 0.04 美元（未查币价） | 由 S55 推出的条件，[14] 是设计目标表述，币价未核实 | speculative | |
| S58 | 官方页面对证明方说法不一：interactive 写“在你的设备上生成”，architecture 写“当前由指定运营者代为生成”，starkzap 写“远程证明服务” | [11]；[6] architecture；[7] Overview | observed | |
| S59 | docs 的 proving 页仍称 SDK / 证明栈未开源，与 overview “SDK now open source” 和公开仓库矛盾（页面过时） | [6] proving、overview；[1] | observed | |
| S60 | 合约不设 token 白名单；fee-on-transfer / rebasing token 会破坏记账（审计 L-02，未解决） | [12] L-02；privacy.cairo#L486-L503@f9256c5e | observed | |

# Lane notes：链抽象层：Chain Signatures、MPC 网络、CKD、跨链桥

**研究问题**：NEAR 的“链抽象层”在机制上怎么运作：签名合约怎么派生外链地址、怎么拿回签名；MPC 网络由谁运行、阈值多少、是否跑在 TEE 里；CKD 是什么；Intents 用到的几座桥各自信任谁；这些组件的信任边界在哪里。

**一句话答案**：Chain Signatures 是一个 NEAR 合约（主网 `v1.signer`）加上一个链外 MPC 网络。合约用 yield/resume 把 `sign` 挂起，最多等 200 个区块；MPC 节点（截至 2026-10-07 共 17 个运营方，门限 11/17，其中 13 个提交了真实 Intel TDX attestation）链下算出门限签名，再调用 `respond`，合约在链上验签后把签名返回给调用者。外链地址由 `sha3("near-mpc-recovery v0.1.0 epsilon derivation:" ‖ caller ‖ "," ‖ path)` 做加法派生得到。同一个网络已经在主网上做两件事：`domain 2` 上的 CKD（BLS12-381 机密密钥派生），以及 `domain 3` 上的外链交易验证（Omni Bridge 的 prover 正在为 Aptos / Starknet 交易调用 `verify_foreign_transaction`）。所以“Chain Signatures 只能做 outbound”这个说法在协议层面已经过时，信任模型也随之变成了“MPC 门限 + 各节点自配的外链 RPC”。

---

## 1. Chain Signatures 原理

### 答案
- 主网签名合约是 `v1.signer`，测试网是 `v1.signer-prod.testnet` [11][12][9]。
- 用户入口是 `sign(request: SignRequestArgs)`，参数为 `path: String`、`payload_v2: {Ecdsa: 32B hex} | {Eddsa: bytes}`、`domain_id`。旧字段 `payload` 和 `key_version` 仍可被反序列化兼容，`key_version` 会被当作 `domain_id` [6][9]。
- 调用必须附带至少 1 yoctoNEAR（多余部分退还），并至少预付 `sign_call_gas_attachment_requirement_tera_gas` 这么多 gas，代码默认值是 15 TGas [3][7][8]。
- 合约调用 `env::promise_yield_create` 挂起请求 [3]。MPC 节点把签名回写到 `respond`，合约用派生公钥在链上验签，通过后才 resume [2]。如果超时，回调 `return_signature_and_clean_state_on_success` 会收到 `PromiseError`，随即调度 `fail_on_timeout`，让原交易失败 [2][3]。
- 超时长度由 nearcore 协议参数 `yield_timeout_length_in_blocks: 200` 决定，不是 MPC 合约自己的配置 [10]。

### 依据
- **入口与参数**：`sign` 先走 `check_request_preconditions`，依次检查 domain 是否存在且 purpose 为 `Sign`、预付 gas 是否够、押金是否够、`accept_requests` 是否为 true（为 false 意味着 TEE 校验失败）[2][3]。接着按 domain 的 protocol 校验 payload：CaitSith / RobustEcdsa 要求 payload 能转成 secp256k1 标量，Frost 要求 EdDSA payload，CKD domain 直接 panic。最后构造 `SignatureRequest::new(domain, payload, predecessor, path)`，其中只保存 `tweak` 和 payload，不保存原始 path [2][6]。
- **KDF（派生）**：
  - `derive_tweak(predecessor_id, path) = SHA3-256("near-mpc-recovery v0.1.0 epsilon derivation:" + predecessor_id + "," + path)` [4]。逗号复用 nearcore 的 `ACCOUNT_DATA_SEPARATOR`，代码注释警告这个哈希不能用于账户 ID 以外的场景，否则有长度扩展 / 可塑性风险 [4]。
  - secp256k1 派生公钥 = `G·tweak + PK_root` [5]。ed25519 派生公钥 = `PK_root + B·tweak`，其中 tweak 先 mod order 规约 [5]。
  - 这就是文档所说的 Additive Key Derivation [11]。
  - 派生绑定的是 `env::predecessor_account_id()`，也就是直接调用 `v1.signer` 的账户（可以是合约），不是交易的最初签名者 [2][3]。
- **签名方案与 domain**：
  - README 列出的方案有 OT-based ECDSA（secp256k1，源自 Cait-Sith）、FROST EdDSA（Ed25519），以及 CKD（BLS12-381）[1]。
  - Robust ECDSA 目前是一个“不安全 stub，从未在生产启用”[1]。
  - 文档写明 `domain_id` 0 = Secp256k1、1 = Ed25519 [11]。
  - 主网 respond 交易里能看到 domain 0（Ecdsa）和 domain 1（Eddsa）的请求 [39]；CKD 请求用的是 domain 2 [26]，foreign-tx 请求用的是 domain 3 [22]。
- **返回方式**：
  - `respond` 只接受“signer 本身 + 已 attested 的 participant + 协议处于 Running/Resharing + `accept_requests`”的调用 [2]。
  - 合约对 secp256k1 用 `derive_key_secp256k1(root, tweak)` 重算派生公钥并验 ECDSA，对 ed25519 同理验 EdDSA，验不过返回 `InvalidSignature` [2]。所以 MPC 节点无法把一个错误签名塞回给调用者，但它们可以拒绝签名或拖到超时。
  - 同一请求重复提交时会进入 fan-out 队列，一次 `respond` 就把整个队列一起 resolve [2]。
- **端到端流程（NEAR 账户控制 ETH 地址）**：官方文档写的五步 [12]：
  1. 用 caller + path + MPC 根公钥派生出 ETH 地址；
  2. 构造 EIP-1559/155 交易，得到待签哈希；
  3. 用 full-access key 发一笔 NEAR 交易，调用 `v1.signer.sign`；
  4. 从交易结果中取出 `{big_r, s, recovery_id}`，组装成 ETH 签名；
  5. 由任意人把交易广播到以太坊。
  
  文档提醒：签名是否只对某条链有效，取决于 payload 本身是否编码了链（例如 EIP-155 的 chainId）。最稳妥的做法是每条链用不同的 path [11]。
- **为什么押金是 1 yocto**：NEAR 的 function-call access key 默认不能附带 deposit。要求非零押金，就等于要求必须用 full-access key 授权，可以防止恶意前端用受限 key 静默替用户发签名请求 [3][9]。
- **成本数据点（observed）**：2026-10-07 主网有一笔 `tx-bench.near → v1.signer.sign`（EdDSA，domain 1，deposit 1 yocto），`outcomes_agg.transaction_fee` 约 8.0×10²⁰ yocto，约等于 0.0008 NEAR [39]。

### 不确定之处
- 合约 README 写的是“约 7 TGas，至少附 10 TGas”[9]，而代码默认值是 15 TGas [7]。主网实际部署的 config 值没有从链上状态核实。
- 200 区块是 `parameters.yaml` 的基础值 [10]，我没有逐个检查后续版本 diff 是否覆盖过它。docs.near.org 的 yield/resume 页面也写的是“200 blocks，约 2 分钟”[40]（来自搜索摘要）。

---

## 2. MPC 网络

### 答案
- 截至 2026-10-07，主网 `v1.signer` 共有 17 个参与者，签名门限 11/17，其中 13/17 提交了真实的 Intel TDX（Dstack）attestation，4 个没有（blacksandtech、mpc-lgns、multichain-mainnet-aurora、near-mpc-staking4all-01）[13]。
- docs.near.org 仍写着“8 independent nodes”，这个数字已经过时 [11][12]。
- 密钥由 PedPoP+ DKG 生成，没有 trusted dealer。成员变更通过 reshare 完成，主公钥保持不变 [17][14]。
- TEE 是设计目标（“every MPC node runs inside a TEE”），但主网尚未全员强制：合约仍保留 Mock attestation 的校验路径，实际也有 4 个节点不在 TDX 中 [15][16][13]。

### 依据
- **运营方**：nearblocks 列出的 17 个账户包括 astrostakers、bitwise、blacksandtech、everstake、greenfield、hashkey、klever、luganodes(mpc-lgns)、mpch、aurora、n1-multichain（Near One）、nansen、natsai、staking4all、nodemonster、stakin、svrn [13]。Near One 的运营方页面把这些账户映射到机构名，但页面自己标注为“best-guesses”[14]。
- **门限规则**：新门限必须 ≥ 参与者数的 60%（向上取整）；新集合里至少要包含当前门限数量的老成员；变更需要所有 prospective participants 投 `vote_new_parameters` [9]。状态机为 `Running → Resharing（vote_new_parameters）→ Running（vote_reshared）`，新增 domain 则走 `Running → Initializing（vote_add_domains）→ Running（vote_pk）`[9]。
- **DKG / reshare / refresh**：三者共用 `do_keyshare`。reshare 可以踢人、加人、改门限；refresh 只换份额，不改主公钥 [17]。官方文档称“nodes can join and leave without re-deriving master key”[11]。
- **领导者机制**：节点内嵌 NEAR indexer，监听 `sign` 调用，按请求哈希选出 leader。leader 发起签名并提交 `respond`，leader 掉线时有 secondary 接替 [1]。
- **TEE**：
  - 设计文档描述的栈是 Dstack + Launcher。Launcher 校验 MPC 镜像哈希并 extend 进 RTMR3。合约校验 TDX quote、MRTD/RTMR0-2 白名单、RTMR3 重放、compose hash，以及 report_data 是否绑定 TLS key 和账户 key [15]。
  - 镜像升级靠参与者投票，旧镜像有 7 天宽限期，过期后 `verify_tee` 会把未更新的节点踢出并触发 reshare。如果剩余人数不足门限，则不踢人，改为停止接受请求 [15]。
  - 威胁模型保守地假设 TEE 只保护 integrity、不保护 confidentiality；文档已识别磁盘快照回滚导致 triples/presignatures 被重用的风险 [15]。
- **费用**：协议层面每次调用只收 1 yocto 押金（多退）加 gas，没有向 MPC 运营方付费的机制 [3][8][9]。

### 不确定之处
- nearblocks 的 TEE 列以及 Near One 页面的判定，都基于 `get_attestation` 返回的是 `Dstack` 还是 `Mock` [14]。我没有自己调 RPC 复核（工具只能发 GET）。
- 运营方的机构归属来自页面映射，不是运营方本人声明。

---

## 3. 方向性：outbound 签名 vs 外链交易验证

### 答案
- docs.near.org 仍写着 Chain Signatures 是“one way”的 outbound 能力，读取外链状态请使用 Omnibridge [11]。
- 但 mpc 仓库已经实现了 **Foreign chain transaction verification**，用的是 `verify_foreign_transaction` / `respond_verify_foreign_tx` 这一对接口 [1][18]。主网上 `domain_id: 3` 已经有生产调用：调用方是 `mpc-prover-0_4_12.bridge.near` 和 `mpc-prover.bridge.near`，查询的链有 Aptos（finality `Committed`）和 Starknet（`AcceptedOnL2`），时间为 2026-10-06 至 10-07，receipt status 均为 true [22]。
- 因此，MPC 网络已经在为 NEAR 合约提供关于外链交易的门限签名观察结果。它不是 light client，安全性来自“≥ 签名门限的节点各自查询自己配置的 RPC 并得到一致结果”[19][20]。

### 依据
- **机制**：
  - 请求里带 chain-specific 的 query 和最多 32 个 extractor，例如 EVM 的 BlockHash/Log、SVM 的 InnerInstruction/AccountState、Bitcoin 的 BlockHash [19]。
  - 每个节点向自己配置的全部白名单 provider 查询。只有所有给出结论的 provider 结论一致才接受；任何分歧都会让该节点不出份额 [20]。
  - 节点对 `(request, observed_values)` 的规范化编码做门限签名，返回 `{payload_hash, signature}` [19]。
  - 合约用 domain 3 的**根公钥（不做 tweak）**验 ECDSA [18]。
- **防重放**：可选字段 `expected_payload_hash` 把响应绑定到预期的观察值。如果不填，任何旧的 `(payload_hash, sig)` 都能 resolve 一个待处理请求，造成 DoS；文档说资金不受影响，因为调用方会在客户端比对 [19]。
- **可用性**：白名单靠投票产生；“available”指至少达到 signing_threshold 的活跃节点声明覆盖了该链。请求不在 available 集合中的链会被直接拒绝 [20]。“RPC quorum”字段已经存储但尚未使用 [20]。
- **时间线**：
  - 3.14.0 引入 whitelisted/available 新 API [20]。
  - 3.15.0（2026-09-04）加入 Ethereum、Avalanche/ADI、SVM 的 foreign-tx 支持 [21]。
  - 3.16.0（2026-09-18）把 SVM inspector 接入节点，并删除 legacy foreign chain API [21]。
  - 2026-10-01 的提案文档（Status: Proposed）描述了上线新链要走的四步：实现 → 两张网升级 → 两张网投票白名单 → 各运营方配置 [38]。
- **设计用途**：首要场景就是 Omnibridge 的入站流程（外链 → NEAR）[19]。

### 不确定之处
- 主网 domain 3 当前白名单了哪些链、链上 `get_available_foreign_chains()` 返回什么，都没有直接读取。目前只观察到 Aptos 和 Starknet 的调用 [22]。
- `mpc-prover*.bridge.near` 是 Omni Bridge 组件这一点是根据账户命名推断的（`bridge.near` 子账户），没有找到官方文档逐字确认 Omni 的 Aptos/Starknet 路由使用了它。

---

## 4. CKD（Confidential Key Derivation）

### 答案
- CKD 把 MPC 网络扩展成去中心化 KMS。调用方合约执行 `request_app_private_key({derivation_path, app_public_key, domain_id})`，MPC 网络在 BLS12-381 domain 上计算 `msk·H(pk, app_id)`，并用调用方提供的 ElGamal 公钥加密后返回 `(big_y, big_c)` [23][24][25]。
- `app_id` 由 `SHA3-256("near-mpc v0.1.0 app_id derivation:" ‖ caller ‖ "," ‖ path)` 得到 [4]。
- 主网已上线：domain 2 上有 `request_app_private_key` 调用，调用方为 `outlayer-admin.near`（derivation_path `outlayer-prod-ckd`）和 `outlayer-admin.defuse-ops.near`（`outlayer-stage-ckd`），使用 `AppPublicKeyPV` 公开可验证变体，时间 2026-10-05 至 10-06 [26]。

### 依据
- **TEE attestation 由谁检查**：Near One 博客的参考架构是“TEE app → Developer contract（由它验证 remote attestation）→ MPC contract”[24]。MPC 合约本身只按 `predecessor` 派生 app_id，**不检查调用方是否运行在 TEE 中** [23]。所以“只有通过 attestation 的 TEE 应用才能拿到密钥”这个保证落在开发者合约上。
- **加密与验证**：
  - 节点 i 计算 `C_i = x_i·H(pk, app_id) + y_i·A`，coordinator 聚合 [24]。
  - 私有可验证变体由应用解密后做 pairing 检查 [24]。
  - 公开可验证变体（`AppPublicKeyPV = (a·G1, a·G2)`）由合约在 `respond_ckd` 里执行 `ckd_output_check` [23][25]。博客发布时（2026-02-23）称 PV 变体是“next step”[24]，当前代码已经实现，主网调用也在使用 [23][26]。
- **用途**：给 TEE 应用一个确定性、与具体机器无关的密钥（用于持久化存储加密、迁移后恢复）。博客还提到 time-lock 加密、可验证随机数等方向 [24]。示例 CLI 用 HKDF-SHA256 从 CKD 输出派生最终密钥，并说明这一步是应用自选的，不属于协议 [25]。
- **审计**：Trail of Bits 于 2025-12-23 出具了 CKD 审计报告 [14]。

### 不确定之处
- 不清楚 “OutLayer” 是什么产品、由谁运营。账户名 `*.defuse-ops.near` 暗示与 Defuse/Intents 运营方有关，但没有一手来源说明，属于 speculative。
- 没有找到一手来源证明 NEAR AI Cloud、FAR（Confidential Intents）或 Shade Agents 在生产中使用 CKD，因此不写“谁在用”。

---

## 5. 跨链桥

### 答案（每座桥的信任模型一行）
- **Omni Bridge（Near One 运营）**：
  - 入站：ETH、BTC（以及 Zcash）用 NEAR 上的 light client；Solana、Base、BNB、Arbitrum、Polygon 用 Wormhole 消息 [28][30][32]。另外观察到 Aptos 和 Starknet 的入站校验经由 MPC foreign-tx 验证（inferred）[22]。
  - 出站：一律由 Chain Signatures 签名，即信任 MPC 门限 [28][29][31]。
  - Intents 在 Ethereum、Base、Arbitrum、BNB、Solana、Bitcoin 上使用它 [27][28]。
- **PoA Bridge**：
  - 合约层面是“只有 owner 能 mint”的 NEP-141 代币。提现时把代币 `ft_transfer` 回代币合约，并在 memo 中写 `WITHDRAW_TO:<addr>`，链外服务据此在外链放款 [33]。
  - 主网工厂账户 `omft.near` 的入金会带 `BRIDGED_FROM:{networkType,chainId,txHash}` memo，再 `ft_transfer_call` 进 `intents.near` [34]。
  - 信任模型：信任 PoA 运营方（铸币权限 + 外链托管）[27][33]。
  - 支持的链最多：ETH、Base、Arb、Gnosis、Bera、BTC、BCH、LTC、DOGE、SOL、XRP、ZEC、TRON、SUI、APT、ADA、Starknet [27]。
- **HOT Bridge**：各链部署 Locker 合约，NEAR 上的 `v2_1.omni.hot.tg` 铸造 omni-asset（NEP-245 多代币）。入站和出站都需要 HOT Protocol 自己的 MPC 验证者网络签 ECDSA 证明：验证者通过 view 方法确认 Locker 或 Omni Balance 上确有这笔 deposit/withdraw [35]。信任模型：信任 HOT 的 MPC 验证者集合，它与 NEAR `v1.signer` 网络是两个不同的网络 [35]。覆盖链：BNB、Polygon、OP、Avax、Scroll、Monad、TON、Stellar、LayerX、Adi、Plasma [27]。
- **Rainbow Bridge**：Near One 的 bridge-sdk-rs 称 Omni 为“Rainbow Bridge 的下一代”[36]，docs.near.org 把 Rainbow 当作历史背景来讲 [31]。rainbowbridge.app 仍然可以访问 [37]。是否已正式下线，没有找到一手公告。

### 依据
- Intents 文档说明每座桥有各自的信任模型，提现时协议按目标链选择桥 [27]。
- BTC 侧的托管模型：每笔存款一个派生地址，不归集到金库；提现时按 UTXO 分别签名；找零进入桥的找零地址。入站信任“无人”（light client + Merkle proof），出站信任 MPC 运营方，且运营方集体离线会导致无法提现 [29]。
- Omni 设计取舍：用一次 MPC 签名验证替代在目标链上实现 NEAR light client；Rainbow 的 NEAR→ETH 方向需要 4–8 小时（4 小时挑战期）[31]。

### 不确定之处
- 三份官方页面给的 Omni 链清单不完全一致：Intents 侧 6 条链 [27][28]，docs.near.org 列 8 条（含 Zcash、Polygon）[30][32]。
- PoA 运营方是谁，Intents 文档没有点名（推测是 Defuse Labs / NEAR Intents 团队，speculative）。PoA 外链托管方式（多签？TEE？）也没有找到一手说明。
- HOT MPC 验证者有多少个、门限多少，本 lane 没有查到。

---

## 6. 信任边界小结表

| 组件 | 运行在哪里 | 信任谁 | 失效后果 |
|---|---|---|---|
| `v1.signer` 合约（sign/respond/CKD/foreign-tx 入口、参与者与 domain 治理）| NEAR 合约 | NEAR L1 共识，加上合约代码（升级需参与者投票）[9] | 合约 bug 可能导致错发或冻结；`accept_requests=false` 时停止所有请求 [3] |
| 派生 KDF（tweak）| 合约内纯函数加客户端 | 数学；派生绑定 predecessor [4][5] | 用错 path 或跨链复用 path 可能导致签名重放 [11] |
| MPC 节点（门限 ECDSA/EdDSA/BLS）| 链外，17 个运营方，其中 13 个在 TDX [13] | ≥11/17 不合谋；TEE integrity；DKG 正确性 [14][15][17] | ≥门限合谋可以伪造任意派生地址的签名，所有外链资产失守；>6 个离线则无法签名（liveness 失效）[14] |
| TEE（Intel TDX + Dstack + Launcher）| 节点主机 | Intel、Dstack、镜像哈希投票 [15] | TEE 被攻破或运营方不在 TEE 中：退化为纯 MPC 门限信任；快照回滚有份额重用风险 [15] |
| foreign-tx 验证 | MPC 节点加外链 RPC provider | ≥门限节点各自配置的 RPC 诚实且一致 [20] | RPC 被串通或劫持可能让 NEAR 合约接受虚假外链事件 [19][20] |
| CKD | MPC 节点加开发者合约 | MPC 门限；开发者合约对 TEE attestation 的校验 [23][24] | 开发者合约校验不严时，任何能以该账户身份调用的人都能拿到该 app 的密钥 [23][24] |
| Omni 入站（ETH/BTC light client）| NEAR 合约 | 源链共识，加 light client 实现 [29][32] | light client bug 可能导致错误铸币 |
| Omni 入站（Wormhole 链）| Wormhole guardian | Wormhole guardian 集合 [28][30] | guardian 被攻破可能导致错误铸币 |
| Omni 出站 | MPC 加目标链 | MPC 门限 [28][31] | 同 MPC 一行 |
| PoA Bridge | 链外服务加 NEAR 代币合约 | PoA 运营方（owner mint + 外链托管）[33] | 运营方作恶或私钥泄露可能导致超发或挪用托管资产 |
| HOT Bridge | 各链 Locker 加 HOT MPC | HOT MPC 验证者 [35] | 验证者被攻破可能导致错误铸币或放款 |
| relayer / broadcaster | 链外任意人 | 无（只负责搬运）[28][29] | 只影响时效，可被替换 |

---

## 图的素材

### A. Chain Signatures 签名时序（参与者与调用顺序）
1. App / 用户：用 `caller + path + PK_root(domain)` 计算派生地址 [4][5][12]。
2. App：构造外链交易，得到待签哈希（ECDSA 为 32B；EdDSA 为消息字节）[9][12]。
3. 用户 → `v1.signer.sign({path, payload_v2, domain_id})`，附带 ≥1 yocto 和足够 gas [2][3][9]。
4. `v1.signer`：做前置检查 → `SignatureRequest{tweak, payload, domain_id}` → `promise_yield_create`，把 data_id 记入 pending map [2][3]。
5. MPC 节点（indexer）发现这笔 `sign` 调用，按请求哈希选出 leader [1]。
6. 节点间运行门限协议：Cait-Sith presign+sign，或 FROST [1]。
7. Leader → `v1.signer.respond(request, response)`，合约用派生公钥验签 [2]。
8. `promise_yield_resume` → `return_signature_and_clean_state_on_success` 把签名作为原交易的返回值。如果 200 个区块内没有 respond，则走 `fail_on_timeout` [2][3][10]。
9. App 把 `{big_r, s, recovery_id}` 组装进交易，由任意 relayer 广播到目标链 [12]。

### B. 合约协议状态机 [9]
- `NotInitialized --init--> Running`
- `Running --vote_add_domains--> Initializing --vote_pk / vote_cancel_keygen--> Running`
- `Running --vote_new_parameters--> Resharing --vote_reshared--> Running`；`Resharing --vote_new_parameters--> Resharing`

### C. Domain 对照（主网观察）
| domain_id | 曲线 / 协议 | purpose | 主网观察 |
|---|---|---|---|
| 0 | Secp256k1 / CaitSith | Sign | respond 交易可见 [39]；文档 [11] |
| 1 | Ed25519 / Frost | Sign | sign/respond 交易可见 [39] |
| 2 | BLS12-381 / CKD | CKD | `request_app_private_key` [26] |
| 3 | Secp256k1（按 respond 代码只验 ECDSA 推断）| ForeignTx | `verify_foreign_transaction`（Aptos/Starknet）[22][18] |

### D. 桥对比维度 [27][28][29][30][33][35]
| 桥 | 运营方 | 入站验证 | 出站签名 | Intents 覆盖链（官方列表）|
|---|---|---|---|---|
| Omni | Near One | ETH/BTC light client；SOL/L2 Wormhole；（Aptos/Starknet 经 MPC foreign-tx，inferred）| NEAR MPC | ETH, Base, Arb, BNB, SOL, BTC |
| PoA | 未点名 | PoA 运营方 | PoA 运营方 | 17 条（最广）|
| HOT | HOT Protocol | HOT MPC 证明 | HOT MPC 证明 | 11 条 |

### E. 时间线条目
- 2025-03-06：Trail of Bits 出具 Chain Signatures 审计；2025-05-15 出具 PedPoP+ 审计；2025-12-23 出具 CKD 审计；2026-02-10 出具 Robust ECDSA 审计 [14]
- 2026-02-23：Near One 发布 CKD 博客，称 PV 变体为“next step”[24]
- 3.14.0：foreign-chain 的 whitelisted/available API 上线（node + contract）[20]
- 2026-09-04：mpc 3.15.0 发布（Ethereum/Avalanche/SVM foreign-tx 支持，运营方预付 attestation 存储）[21]
- 2026-09-18：mpc 3.16.0 发布（SVM inspector 接入节点，删除 legacy foreign chain API）[21]
- 2026-10-01：提案“把 foreign chain 配置嵌入节点镜像”（Proposed）[38]
- 2026-10-05/06：主网 CKD 调用（outlayer）[26]；2026-10-06/07：主网 foreign-tx 调用（Aptos/Starknet）[22]
- 2026-10-07 快照：17 个运营方，门限 11/17，13/17 在 TDX [13]

---

## 代码素材

**(1) `sign` 入口（节选）**：mpc/crates/contract/src/api/sign.rs#L27-L82 @e96836796331de4226d9a3dd8fbe7dfc8a65ffdd
```rust
#[handle_result]
#[payable]
pub fn sign(&mut self, request: dtos::SignRequestArgs) {
    let (domain_config, predecessor) = self.check_request_preconditions(
        request.domain_id,
        dtos::DomainPurpose::Sign,
        Gas::from_tgas(self.config.sign_call_gas_attachment_requirement_tera_gas),
        NearToken::from_yoctonear(SIGN_DEPOSIT_YOCTONEAR),
    );
    // ... payload 与 protocol 匹配检查省略 ...
    let request = dtos::SignatureRequest::new(
        request.domain_id, request.payload, &predecessor, &request.path);
    let callback_args = serde_json::to_vec(&(&request,)).unwrap();
    self.enqueue_yield_request(
        method_names::RETURN_SIGNATURE_AND_CLEAN_STATE_ON_SUCCESS,
        callback_args, callback_gas,
        move |this, id| this.add_signature_request(request, id),
    );
}
```

**(2) yield 创建**：mpc/crates/contract/src/api/common.rs#L85-L107 @e96836796331de4226d9a3dd8fbe7dfc8a65ffdd
```rust
let promise_index = env::promise_yield_create(
    callback_method, callback_args, callback_gas,
    GasWeight(0), DATA_ID_REGISTER,
);
let return_id: CryptoHash = env::read_register(DATA_ID_REGISTER)
    .expect("read_register failed").try_into()
    .expect("conversion to CryptoHash failed");
insert(self, return_id);
env::promise_return(promise_index);
```

**(3) KDF**：mpc/crates/near-mpc-crypto-types/src/kdf.rs#L8-L39 @e96836796331de4226d9a3dd8fbe7dfc8a65ffdd
```rust
const TWEAK_DERIVATION_PREFIX: &str = "near-mpc-recovery v0.1.0 epsilon derivation:";
pub fn derive_tweak(predecessor_id: &AccountId, path: &str) -> Tweak {
    let hash: [u8; 32] = derive_from_path(TWEAK_DERIVATION_PREFIX, predecessor_id, path);
    Tweak::new(hash)
}
fn derive_from_path(derivation_prefix: &str, predecessor_id: &AccountId, path: &str) -> [u8; 32] {
    let derivation_path = format!("{derivation_prefix}{},{}", predecessor_id, path);
    let mut hasher = Sha3_256::new();
    hasher.update(derivation_path);
    hasher.finalize().into()
}
```

**(4) 派生公钥**：mpc/crates/contract/src/crypto_shared/kdf.rs#L14-L34 @e96836796331de4226d9a3dd8fbe7dfc8a65ffdd
```rust
let derived = (<Secp256k1 as CurveArithmetic>::ProjectivePoint::GENERATOR * tweak + public_key)
    .to_affine();                                    // secp256k1: PK + G·tweak
// ...
public_key_edwards_point + ED25519_BASEPOINT_POINT * tweak  // ed25519: PK + B·tweak
```

**(5) 请求 JSON**：mpc/crates/contract/README.md（“Submitting a signature request”）@e96836796331de4226d9a3dd8fbe7dfc8a65ffdd
```json
{ "request": { "payload_v2": { "Ecdsa": "521da91d…43a9" }, "path": "sepolia-1", "domain_id": 0 } }
```

**(6) foreign-tx 响应用根公钥验签**：mpc/crates/contract/src/api/foreign_chain/requests.rs#L107-L120 @e96836796331de4226d9a3dd8fbe7dfc8a65ffdd
```rust
let payload_hash: [u8; 32] = response.payload_hash.0;
// Check the signature is correct against the root public key
near_mpc_signature_verifier::verify_ecdsa_signature(
    signature_response, &payload_hash, &near_public_key,
).is_ok()
```

**(7) PoA 提现约定**：intents/contracts/poa/token/src/lib.rs#L15-L38 @4127e8e8fbe4206fa910c4fe7f8028c9e0972348
```rust
/// Fungible token that allows minting only by its owner.
/// To withdraw, users can call `ft_transfer` on the deployed token,
/// pass token itself as `receiver_id` and provide destination address
/// in `memo` prefixed with `WITHDRAW_TO:`.
pub const WITHDRAW_MEMO_PREFIX: &str = "WITHDRAW_TO:";
```

---

## 来源

1. **PRIMARY** near/mpc README.md @e96836796331de4226d9a3dd8fbe7dfc8a65ffdd：https://github.com/near/mpc/blob/e96836796331de4226d9a3dd8fbe7dfc8a65ffdd/README.md。证明节点结构（indexer + leader）、支持的方案、Robust ECDSA 是从未启用的 stub、foreign-tx 验证与 CKD 能力。
2. **PRIMARY** mpc/crates/contract/src/api/sign.rs#L27-L82（sign）、#L84 起（respond）@e968367：https://github.com/near/mpc/blob/e96836796331de4226d9a3dd8fbe7dfc8a65ffdd/crates/contract/src/api/sign.rs#L27-L82。证明 sign 参数、payload 校验、yield 入队、respond 链上验签与超时回调。
3. **PRIMARY** mpc/crates/contract/src/api/common.rs#L24-L78、#L85-L107、#L112-L130 @e968367：https://github.com/near/mpc/blob/e96836796331de4226d9a3dd8fbe7dfc8a65ffdd/crates/contract/src/api/common.rs#L85-L107。证明前置检查、`promise_yield_create`、`fail_on_timeout`、押金要求及其设计理由。
4. **PRIMARY** mpc/crates/near-mpc-crypto-types/src/kdf.rs#L8-L39 @e968367：https://github.com/near/mpc/blob/e96836796331de4226d9a3dd8fbe7dfc8a65ffdd/crates/near-mpc-crypto-types/src/kdf.rs#L8-L39。证明 tweak 与 CKD app_id 的公式。
5. **PRIMARY** mpc/crates/contract/src/crypto_shared/kdf.rs#L14-L34 @e968367：https://github.com/near/mpc/blob/e96836796331de4226d9a3dd8fbe7dfc8a65ffdd/crates/contract/src/crypto_shared/kdf.rs#L14-L34。证明加法派生 PK+G·tweak（secp256k1、ed25519）。
6. **PRIMARY** mpc/crates/near-mpc-crypto-types/src/sign.rs#L30-L35 @e968367：https://github.com/near/mpc/blob/e96836796331de4226d9a3dd8fbe7dfc8a65ffdd/crates/near-mpc-crypto-types/src/sign.rs#L30-L35。证明 SignRequestArgs 字段，以及对 payload/key_version 的旧格式兼容。
7. **PRIMARY** mpc/crates/contract/src/config.rs#L13 @e968367：https://github.com/near/mpc/blob/e96836796331de4226d9a3dd8fbe7dfc8a65ffdd/crates/contract/src/config.rs#L13。证明 sign 所需 gas 的默认值为 15 TGas。
8. **PRIMARY** mpc/crates/near-mpc-contract-interface/src/deposits.rs#L4 @e968367：https://github.com/near/mpc/blob/e96836796331de4226d9a3dd8fbe7dfc8a65ffdd/crates/near-mpc-contract-interface/src/deposits.rs#L4。证明 `SIGN_DEPOSIT_YOCTONEAR = 1`。
9. **PRIMARY** mpc/crates/contract/README.md @e968367：https://github.com/near/mpc/blob/e96836796331de4226d9a3dd8fbe7dfc8a65ffdd/crates/contract/README.md。证明部署账户、押金理由、请求 JSON、门限 ≥60% 等变更规则、协议状态机、domain 配置示例。
10. **PRIMARY** nearcore core/parameters/res/runtime_configs/parameters.yaml#L341 @090da3191758c75787ce14569528bf0e9d71246c：https://github.com/near/nearcore/blob/090da3191758c75787ce14569528bf0e9d71246c/core/parameters/res/runtime_configs/parameters.yaml#L341。证明 `yield_timeout_length_in_blocks: 200`（基础值）。
11. **PRIMARY** NEAR Docs “What are Chain Signatures?” https://docs.near.org/chain-abstraction/chain-signatures（访问 2026-10-07）。证明“one way / outbound”的官方表述、domain 0/1、跨链重放警告、“8 nodes”的旧数字。
12. **PRIMARY** NEAR Docs “Signing Transactions” https://docs.near.org/chain-abstraction/chain-signatures/implementation（访问 2026-10-07）。证明五步流程、`v1.signer` / `v1.signer-prod.testnet`、chainsig.js。
13. **PRIMARY**（链上数据聚合）NearBlocks Chain Signatures 页面 https://nearblocks.io/chain-signatures（访问 2026-10-07）。证明 17 个运营方、门限 11/17、13/17 在 TEE、逐个账户的 TEE 状态、`v1.signer` 累计 11,957,648 笔交易。
14. **PRIMARY** Near One “NEAR MPC — Network & Security Overview” https://mpc-operators.nearone.org/overview.html 及 index.html 源码（访问 2026-10-07）。证明 DKG 无 dealer、治理需链上投票、审计清单与日期、TEE 判定口径（Dstack vs Mock）、账户到机构的映射（best-guess）。
15. **PRIMARY** mpc/docs/design/securing-mpc-with-tee/securing-mpc-with-tee.md @e968367：https://github.com/near/mpc/blob/e96836796331de4226d9a3dd8fbe7dfc8a65ffdd/docs/design/securing-mpc-with-tee/securing-mpc-with-tee.md。证明 TDX/Dstack/Launcher 设计、attestation 校验步骤、7 天升级宽限、踢人规则、威胁模型与回滚风险。
16. **PRIMARY** mpc/crates/contract/src/tee/tee_state.rs @e968367：https://github.com/near/mpc/blob/e96836796331de4226d9a3dd8fbe7dfc8a65ffdd/crates/contract/src/tee/tee_state.rs。证明合约保留 `verify_and_store_mock`（Mock attestation）路径。
17. **PRIMARY** mpc/crates/threshold-signatures/docs/dkg.md @e968367：https://github.com/near/mpc/blob/e96836796331de4226d9a3dd8fbe7dfc8a65ffdd/crates/threshold-signatures/docs/dkg.md。证明 PedPoP+ DKG，以及 keygen/reshare/refresh 的语义。
18. **PRIMARY** mpc/crates/contract/src/api/foreign_chain/requests.rs#L32-L120 @e968367：https://github.com/near/mpc/blob/e96836796331de4226d9a3dd8fbe7dfc8a65ffdd/crates/contract/src/api/foreign_chain/requests.rs#L32-L120。证明 `verify_foreign_transaction` 的 yield 流程、available 校验、根公钥验签、`expected_payload_hash` 检查。
19. **PRIMARY** mpc/docs/archive/design/foreign-chain-transactions.md（ARCHIVED）@e968367：https://github.com/near/mpc/blob/e96836796331de4226d9a3dd8fbe7dfc8a65ffdd/docs/archive/design/foreign-chain-transactions.md。证明设计目的（Omnibridge 入站）、extractor 模型、不使用 light client、重放说明。
20. **PRIMARY** mpc/docs/design/calculating-supported-foreign-chains.md @e968367：https://github.com/near/mpc/blob/e96836796331de4226d9a3dd8fbe7dfc8a65ffdd/docs/design/calculating-supported-foreign-chains.md。证明 whitelisted/available 两个集合、provider 一致性规则、quorum 字段未使用、3.14.0 起提供新 API。
21. **PRIMARY** mpc/CHANGELOG.md（3.15.0 于 2026-09-04、3.16.0 于 2026-09-18）@e968367：https://github.com/near/mpc/blob/e96836796331de4226d9a3dd8fbe7dfc8a65ffdd/CHANGELOG.md。证明 foreign-tx 各链支持的发布时间。
22. **PRIMARY**（链上数据）NearBlocks API `v1.signer` 的 `verify_foreign_transaction` 交易 https://api.nearblocks.io/v1/account/v1.signer/txns?method=verify_foreign_transaction（访问 2026-10-07）。证明主网 domain 3 有调用，调用方为 `mpc-prover-0_4_12.bridge.near` / `mpc-prover.bridge.near`，链为 Aptos/Starknet，例如 tx 8A2tkLxfnbL37JZaUTHTdq2ckWBkZZpNfqHvzLkSAMi6（区块 218,900,104）。
23. **PRIMARY** mpc/crates/contract/src/api/ckd.rs#L24-L67（request_app_private_key）@e968367：https://github.com/near/mpc/blob/e96836796331de4226d9a3dd8fbe7dfc8a65ffdd/crates/contract/src/api/ckd.rs#L24-L67。证明 CKD 入口、PV 检查、合约不检查 TEE attestation。
24. **PRIMARY** Near One Blog “Confidential Key Derivation in the MPC Network”（2026-02-23）https://blog.nearone.org/research/2026/02/23/mpc-ckd.html（访问 2026-10-07）。证明 threshold BLS + ElGamal 机制、developer contract 负责 attestation、用途、PV 当时为计划。
25. **PRIMARY** mpc/crates/ckd-example-cli/README.md @e968367：https://github.com/near/mpc/blob/e96836796331de4226d9a3dd8fbe7dfc8a65ffdd/crates/ckd-example-cli/README.md。证明请求/响应格式、HKDF 后处理由应用自选、PV 变体用法。
26. **PRIMARY**（链上数据）NearBlocks API `v1.signer` 的 `request_app_private_key` 交易 https://api.nearblocks.io/v1/account/v1.signer/txns?method=request_app_private_key（访问 2026-10-07）。证明主网 domain 2 有 CKD 调用（outlayer-admin.near 等，AppPublicKeyPV）。
27. **PRIMARY** NEAR Intents Docs “Token Bridges” https://docs.near-intents.org/integration/bridging/overview.md（访问 2026-10-07）。证明三座桥及其各自的链清单、按目标链选桥。
28. **PRIMARY** NEAR Intents Docs “Omni Bridge” https://docs.near-intents.org/learn/omni-bridge/overview.md（访问 2026-10-07）。证明由 Near One 运营、入站用 light client/Wormhole、出站用 MPC、relayer 不可伪造。
29. **PRIMARY** NEAR Intents Docs “How the Bitcoin bridge works” https://docs.near-intents.org/learn/omni-bridge/how-it-works.md（访问 2026-10-07）。证明 BTC 每笔存款一个派生地址、不归集、入站与出站的信任对比。
30. **PRIMARY** NEAR Docs “Omni Bridge Overview” https://docs.near.org/chain-abstraction/omnibridge/overview（访问 2026-10-07）。证明每条链的验证方式（Light client / Wormhole + Chain Signatures）。
31. **PRIMARY** NEAR Docs “How Omni Bridge Works” https://docs.near.org/chain-abstraction/omnibridge/how-it-works（访问 2026-10-07）。证明 Omni 与 Rainbow 的取舍、Rainbow 的 4–8 小时延迟。
32. **PRIMARY** NEAR Docs “Omni Bridge Roadmap” https://docs.near.org/chain-abstraction/omnibridge/roadmap（访问 2026-10-07）。证明 ETH/BTC 入站用 light client、出站全部走 MPC。
33. **PRIMARY** intents/contracts/poa/token/src/lib.rs#L15-L38 与 poa/factory/src/lib.rs @4127e8e8fbe4206fa910c4fe7f8028c9e0972348：https://github.com/near/intents/blob/4127e8e8fbe4206fa910c4fe7f8028c9e0972348/contracts/poa/token/src/lib.rs#L15-L38。证明 PoA 代币只有 owner 能 mint、`WITHDRAW_TO:` 提现约定、工厂的 deploy/deposit 接口。
34. **PRIMARY**（链上数据）NearBlocks API `omft.near` 交易 https://api.nearblocks.io/v1/account/omft.near/txns（访问 2026-10-07）。证明主网 PoA 工厂通过 `ft_transfer_call` 把入金转进 `intents.near`，并带 `BRIDGED_FROM` memo。
35. **PRIMARY** HOT Docs “HOT Bridge” https://docs.hotdao.ai/omni-tokens（访问 2026-10-07）。证明 Locker + Omni Balance 架构、HOT MPC 验证者签署证明、`v2_1.omni.hot.tg`。
36. 二手（GitHub 仓库搜索摘要）Near-One/bridge-sdk-rs README https://github.com/Near-One/bridge-sdk-rs（搜索于 2026-10-07）。说明 Omni 被称为“Rainbow Bridge 的下一代”。
37. 二手（搜索摘要）https://rainbowbridge.app/（搜索于 2026-10-07）。说明 Rainbow Bridge 前端仍然可以访问。
38. **PRIMARY** mpc/docs/design/embedded-foreign-chain-configs.md（Proposed，2026-10-01）@e968367：https://github.com/near/mpc/blob/e96836796331de4226d9a3dd8fbe7dfc8a65ffdd/docs/design/embedded-foreign-chain-configs.md。证明上线新外链的四步流程，以及运营方配置是瓶颈。
39. **PRIMARY**（链上数据）NearBlocks API `v1.signer` 交易（txns-only）https://api.nearblocks.io/v1/account/v1.signer/txns-only（访问 2026-10-07）。证明 domain 0/1 的 sign/respond 实例（例如 tx HxMwTgjwxbjjiG75gJjLLJ2goUKCtWiefvAp9pqd4F57，fee 约 0.0008 NEAR），以及 respond 由运营方账户提交。
40. 二手（搜索摘要）NEAR Docs “Yield and Resume” https://docs.near.org/smart-contracts/anatomy/yield-resume（搜索于 2026-10-07）。说明“200 blocks，约 2 分钟”。

---

## 外部调研中被修正或无法核实的地方

- **§3.2“能签外部交易，不等于能验证外部状态……需要另一个证明、桥接或验证机制”**：这句话与 docs.near.org 的表述一致 [11]，但在协议层面已经部分过时。MPC 网络本身提供 `verify_foreign_transaction`，主网 domain 3 已有 Omni prover 的调用 [18][22]。更准确的说法是：`sign` 本身是 outbound；同一个 MPC 网络另外提供基于 RPC 共识的外链交易证明，它不是 light client 级别的保证 [19][20]。
- **§6.3 CKD“TEE 应用通过身份与 attestation 检查后……”**：表述不够精确。attestation 由开发者合约检查，MPC 合约只按调用账户 + path 派生 app_id，不验证调用方是否在 TEE 中 [23][24]。
- **§6.3“需要按产品逐项确认 NEAR AI / FAR 是否使用 CKD”**：仍然无法核实。链上只看到 `outlayer-admin*.near` 在调用 CKD [26]。
- **§3.3“MPC 节点集合、阈值……不能一笔带过”**：GPT 没有给出数字。补充 2026-10-07 快照：17 个运营方，门限 11/17，13/17 在 TDX [13]。docs.near.org 的“8 nodes”已经过时 [11][12]。
- **§4.6“官方桥接总览列出了 OmniBridge、PoA Bridge 和 HOT Bridge”**：属实 [27]。GPT 没有区分各桥的入站和出站信任，本 notes 已补充。Omni 的链清单在不同官方页面之间也不一致 [27][30]。
- **§1 表格“Chain Signatures 与桥 | NEAR 合约、MPC 网络、各目标链”**：方向正确，但漏掉了外链 RPC provider（foreign-tx 的信任点）和 Wormhole guardian（Omni 部分链的入站信任点）[20][30]。

---

## 开放问题

1. 主网 `v1.signer` 的 config 实际值是多少（sign gas 门槛是 10 还是 15 TGas）？domain 3 的 whitelisted/available 链清单和 RPC provider 白名单是什么？需要通过 POST RPC 调 `config`、`allowed_foreign_chain_providers`、`get_available_foreign_chains` 来读。
2. 4 个非 TDX 运营方什么时候迁移？合约是否计划禁止 Mock attestation？目前没有找到时间表。
3. Omni Bridge 的 Aptos/Starknet 路由是否已对 Intents 用户开放？Intents 的 Omni 链清单里没有这两条链 [27]。
4. OutLayer 是什么，由谁运营？它是不是 NEAR AI / Intents 体系里的 TEE 计算服务？
5. PoA Bridge 的运营方以及外链托管机制（多签 / MPC / TEE），以及 HOT MPC 验证者的规模和门限。
6. Rainbow Bridge 是否有正式下线公告？
7. foreign-tx 中“provider 分歧必须终止、不能重试”目前只是实现要求，还不是现状 [20]。这对 liveness 和安全有什么影响？

---

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| C1 | 主网 Chain Signatures 签名合约账户是 `v1.signer`，测试网是 `v1.signer-prod.testnet` | [12] docs implementation；[9] mpc/crates/contract/README.md @e968367 | observed | |
| C2 | `sign` 参数为 `path`、`payload_v2`（Ecdsa 32B / Eddsa 字节）、`domain_id`，仍兼容旧字段 `payload`/`key_version` | [6] near-mpc-crypto-types/src/sign.rs#L30-L35 @e968367；[9] | observed | |
| C3 | `sign` 必须附带 ≥1 yoctoNEAR，多余部分自动退还 | [3] api/common.rs#L119-L130 @e968367；[8] deposits.rs#L4 | observed | |
| C4 | 押金要求的目的是强制使用 full-access key 授权，防止恶意前端用 function-call key 静默发起签名 | [3] common.rs `require_deposit` 注释；[9] README “Deposit requirement” | observed | |
| C5 | 代码中 sign 所需预付 gas 默认 15 TGas，而 README 写“至少 10 TGas、约 7 TGas 消耗” | [7] config.rs#L13 @e968367；[9] README | observed | |
| C6 | `sign` 通过 `env::promise_yield_create` 挂起请求，把 data_id 存入 pending map | [3] common.rs#L85-L107 @e968367；[2] sign.rs#L76-L81 | observed | |
| C7 | yield 超时由 nearcore 参数 `yield_timeout_length_in_blocks: 200` 决定 | [10] parameters.yaml#L341 @090da31；[40] docs 搜索摘要“200 blocks ≈ 2 min” | observed | |
| C8 | 超时后回调收到 PromiseError，调度 `fail_on_timeout` 使原交易以 Timeout 失败 | [2] sign.rs `return_signature_and_clean_state_on_success`；[3] common.rs#L112-L116 | observed | |
| C9 | `respond` 只接受已 attested 的参与者节点，并要求协议处于 Running/Resharing 且 accept_requests 为真 | [2] sign.rs#L84-L102 @e968367 | observed | |
| C10 | 合约在 `respond` 中用派生公钥链上验签，验不过返回 InvalidSignature，所以 MPC 不能返回错误签名 | [2] sign.rs#L107-L160 @e968367 | observed | |
| C11 | tweak = SHA3-256("near-mpc-recovery v0.1.0 epsilon derivation:" ‖ predecessor ‖ "," ‖ path) | [4] near-mpc-crypto-types/src/kdf.rs#L8-L39 @e968367 | observed | |
| C12 | secp256k1 派生公钥 = PK_root + G·tweak；ed25519 派生公钥 = PK_root + B·tweak（加法派生）| [5] contract/src/crypto_shared/kdf.rs#L14-L34 @e968367；[11] | observed | |
| C13 | 派生绑定直接调用者（predecessor），合约调用 `v1.signer` 时控制权归该合约 | 由 C11、[3] common.rs#L67 推出：tweak 输入是 `env::predecessor_account_id()` | inferred | |
| C14 | 支持的签名方案：OT-based ECDSA（Cait-Sith，secp256k1）、FROST EdDSA（Ed25519）；CKD 用 BLS12-381 | [1] mpc README @e968367；[14] | observed | |
| C15 | Robust ECDSA 目前是会泄露密钥的不安全 stub，从未在生产启用 | [1] mpc README @e968367 | observed | |
| C16 | 主网 domain 0 = Secp256k1 签名、domain 1 = Ed25519 签名，两者都有实际 sign/respond 交易 | [11]；[39] nearblocks txns-only（respond domain_id 0/1）| observed | |
| C17 | 一次 EdDSA `sign` 交易在主网总费用约 0.0008 NEAR（2026-10-07 单笔样本）| [39] tx HxMwTgjwxbjjiG75gJjLLJ2goUKCtWiefvAp9pqd4F57 transaction_fee ≈ 8.0e20 yocto | observed | |
| C18 | 控制外链地址的流程分五步：派生地址 → 构造交易 → sign → 格式化签名 → 广播 | [12] docs implementation | observed | |
| C19 | 签名是否限定在某条链取决于 payload；官方建议每条链用不同 path 防止重放 | [11] docs chain-signatures Warning | observed | |
| C20 | 截至 2026-10-07 主网 MPC 有 17 个参与者，签名门限 11/17 | [13] nearblocks.io/chain-signatures（访问 2026-10-07）| observed | |
| C21 | 截至 2026-10-07 有 13/17 个运营方提交了真实 TDX attestation，4 个没有 | [13] nearblocks TEE 列；[14] 判定口径 Dstack vs Mock | observed | |
| C22 | docs.near.org 写的“MPC 网络由 8 个节点组成”已经过时 | 由 [11][12]“8 nodes”与 C20 推出：链上快照为 17 | inferred | |
| C23 | 主网尚未全员强制 TEE：合约保留 Mock attestation 路径，且有非 TDX 节点在参与 | 由 [16] tee_state.rs `verify_and_store_mock` 与 C21 推出 | inferred | |
| C24 | TEE 设计：Dstack + Launcher 校验镜像哈希并 extend 进 RTMR3，合约校验 quote、MRTD/RTMR 白名单与 report_data 绑定 | [15] securing-mpc-with-tee.md @e968367 | observed | |
| C25 | 新镜像投票通过后旧镜像有 7 天宽限，过期后未更新的节点会被踢出并触发 reshare；不足门限时改为停止接受请求 | [15]；[7] config.rs DEFAULT_TEE_UPGRADE_DEADLINE 7 天 | observed | |
| C26 | MPC TEE 威胁模型只假设 integrity、不假设 confidentiality，并承认磁盘快照回滚有份额重用风险 | [15] Threat Model 一节 | observed | |
| C27 | 密钥由 PedPoP+ DKG 生成，无 trusted dealer；reshare 可换成员、改门限，主公钥不变 | [17] dkg.md @e968367；[14] | observed | |
| C28 | 门限变更规则：新门限 ≥ 参与者数 60%（向上取整），所有 prospective 参与者都要投票 | [9] README “Changing the participant set” | observed | |
| C29 | 节点内嵌 indexer 监听 sign 调用，按请求哈希选 leader，leader 掉线由 secondary 接替 | [1] mpc README “NEAR Indexer” | observed | |
| C30 | 主网运营方包括 Near One（n1-multichain）、Aurora、Everstake、Luganodes、Nansen、Bitwise、HashKey 等 17 个账户 | [13] 账户列表；[14] OPERATORS 映射（标注 best-guess）| observed | |
| C31 | docs.near.org 仍把 Chain Signatures 描述为“one way”的 outbound 方案 | [11] docs Tip | observed | |
| C32 | mpc 合约实现了 `verify_foreign_transaction`：节点先在外链验证交易，再对观察值做门限签名 | [18] foreign_chain/requests.rs#L32-L72 @e968367；[1] | observed | |
| C33 | 主网 domain 3（ForeignTx）已有生产调用：调用方 mpc-prover*.bridge.near，链为 Aptos/Starknet（2026-10-06/07）| [22] nearblocks API verify_foreign_transaction，例如 tx 8A2tkLxfnbL37JZaUTHTdq2ckWBkZZpNfqHvzLkSAMi6 | observed | |
| C34 | “Chain Signatures 只能 outbound”的说法在协议层面已经过时 | 由 C31、C32、C33 推出：同一 MPC 网络已在主网提供外链交易证明 | inferred | |
| C35 | foreign-tx 安全性基于“≥ 签名门限的节点各自查询自己配置的 RPC，provider 结论一致才出份额”，不是 light client | [20] calculating-supported-foreign-chains.md；[19] Scope 一节 | observed | |
| C36 | foreign-tx 响应用 domain 根公钥（不做 tweak）验签 | [18] requests.rs#L107-L120 @e968367 | observed | |
| C37 | 不填 `expected_payload_hash` 时可以用旧签名 resolve 待处理请求，属于 DoS 风险（文档称不涉及资金）| [19] “Binding the response to the request” | observed | |
| C38 | foreign-tx 的 RPC quorum 字段已存储但尚未生效 | [20] Background 一节 | observed | |
| C39 | mpc 3.15.0（2026-09-04）加入 Ethereum、Avalanche、SVM 的 foreign-tx 支持；3.16.0（2026-09-18）把 SVM inspector 接入节点 | [21] CHANGELOG.md @e968367 | observed | |
| C40 | `mpc-prover*.bridge.near` 是 Omni Bridge 用于入站校验的组件 | 由 C33 与 [19]（设计首要用例是 Omnibridge 入站）推出：账户名为 bridge.near 子账户 | speculative | |
| C41 | CKD 入口为 `request_app_private_key`，需要 ≥1 yocto，按 predecessor+path 派生 app_id | [23] api/ckd.rs#L24-L67 @e968367；[4] kdf.rs#L17-L23 | observed | |
| C42 | CKD 机制：节点计算 x_i·H(pk, app_id) + y_i·A，coordinator 聚合出 ElGamal 加密的 BLS 签名，应用解密后做 pairing 校验 | [24] Near One CKD 博客 2026-02-23 | observed | |
| C43 | MPC 合约不检查 CKD 调用方的 TEE attestation，该检查由开发者合约负责 | [24] System Overview；[23] ckd.rs 中没有 attestation 检查 | observed | |
| C44 | 公开可验证 CKD（AppPublicKeyPV）已实现，合约在 respond_ckd 中校验；博客发布时还写作计划 | [23] ckd.rs `ckd_output_check`；[24]；[25] | observed | |
| C45 | 主网 CKD（domain 2）已有调用，调用方为 outlayer-admin.near 与 outlayer-admin.defuse-ops.near（2026-10-05/06）| [26] nearblocks API request_app_private_key | observed | |
| C46 | 没有一手证据显示 NEAR AI Cloud、FAR 或 Shade Agents 在生产中使用 CKD | 由 [24] 未点名用户、[26] 仅见 outlayer 账户推出 | inferred | |
| C47 | Intents 使用三座桥（Omni、PoA、HOT），每座桥信任模型不同，按目标链选择 | [27] docs.near-intents bridging overview | observed | |
| C48 | Omni Bridge 由 Near One 运营：入站 ETH/BTC 用 NEAR 上的 light client，Solana 和若干 L2 用 Wormhole；出站一律由 MPC 签名 | [28]；[30]；[32] | observed | |
| C49 | Omni 的 BTC 存款每笔一个派生地址、不归集；入站无需信任他人，出站信任 MPC 运营方 | [29] docs.near-intents how-it-works | observed | |
| C50 | Intents 文档列的 Omni 链（6 条）与 docs.near.org 列的（8 条，含 Zcash、Polygon）不一致 | [27][28] 对比 [30][32] | observed | |
| C51 | PoA 代币只有 owner 能 mint；提现方式是 ft_transfer 回代币合约并在 memo 写 `WITHDRAW_TO:` | [33] intents/contracts/poa/token/src/lib.rs#L15-L38 @4127e8e | observed | |
| C52 | 主网 PoA 工厂 `omft.near` 用 ft_transfer_call 把入金转进 intents.near，并带 BRIDGED_FROM memo | [34] nearblocks API omft.near txns | observed | |
| C53 | PoA Bridge 的信任模型是中心化运营方（铸币权限 + 外链托管）| 由 C51 与 [27]“Proof of Authority”推出 | inferred | |
| C54 | HOT Bridge 的入站和出站都依赖 HOT Protocol 自己的 MPC 验证者签署证明，与 NEAR v1.signer 不是同一网络 | [35] docs.hotdao.ai/omni-tokens | observed | |
| C55 | Omni 用 MPC 签名替代在目标链上跑 NEAR light client；Rainbow 的 NEAR→ETH 方向需要 4–8 小时 | [31] docs omnibridge how-it-works | observed | |
| C56 | Rainbow Bridge 已被 Omni 正式取代并下线 | [36] bridge-sdk-rs 称 Omni 为下一代；[37] rainbowbridge.app 仍可访问；没有找到下线公告 | speculative | |
| C57 | MPC 门限被合谋突破时，所有派生地址上的外链资产（包括 Omni 出站托管）都会失守 | 由 C12、C20、C48 推出：所有派生密钥共享同一根密钥份额 | inferred | |
| C58 | 上线新外链需要经过合约/节点实现、两张网升级、投票白名单、运营方配置四步，运营方配置是瓶颈 | [38] embedded-foreign-chain-configs.md（Proposed，2026-10-01）| observed | |

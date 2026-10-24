# notes-account：Native AA（0x76）及与 EIP-8130 / Tempo / EIP-7702 / ERC-4337 的对比

> 分路：account（前缀 A）。调研日期 2026-10-24。
> 原定目标路径是 `$DIR/research/notes-account.md`；本次运行指定的权威输出路径是本文件，由父会话负责落盘或复制。
> 引用格式：`[n] 文件:L行号`，[n] 对应“来源”一节。官方文档快照的行号都用 read 工具逐行核对过（关键行用 offset 抽查）。

---

## Q2 机制：0x76 交易怎么做

### 答案
`0x76` 是 New L1 的原生 EIP-2718 AA 交易类型，从 genesis 起有效。由节点按共识规则执行，不需要 bundler、EntryPoint 或合约钱包。一笔交易包含 1–64 个原子调用，只有一个签名、一个 nonce 和一张回执。可选：passkey 签名（P256 / WebAuthn）、带 scope / 花费上限 / 过期时间的委托 key（AccountKeychain 预编译管理）、第三方代付，以及代付后用代币偿还的 `token_fee`。成熟度：官方称 0x76 信封和 key 管理“已在源码构建的 devnet 上跑通”，没有公开 testnet / mainnet，也没有 SDK；并行 nonce 通道（`nonce_key ≠ 0`）“预留但未启用”。

### 依据
**信封与限制**
- 字段：`chain_id, nonce_key, nonce, max_fee_per_gas, max_priority_fee_per_gas, gas_limit, calls, access_list, valid_after, valid_before, key_authorization, fee_payer_signature, token_fee` [1] account-abstraction.md:L22–34。transaction-types 的字段表里没有 `token_fee` [2] transaction-types.md:L25–36（见“矛盾”）。
- `calls` 有 1–64 条 `{to, value, input}`，原子执行：要么全部生效，要么全部回滚 [1]:L13, L29；[2]:L32。
- 编码后最大 128 KiB [1]:L36, L171。单笔声明 gas 上限 16,777,216 [1]:L124, L172；[5] migrate-from-bsc.md:L21（BEP-652）。
- `nonce_key` 目前必须为 0；文档原话是“Parallel nonce lanes are reserved but not enabled” [2]:L28, L48；[1]:L25, L175。账户只有一个普通 nonce，`eth_getTransactionCount` 不变 [1]:L55。
- 有效期：`valid_after` 含边界，`valid_before` 不含边界。还没生效的交易先挂起，到时自动提升；过期的直接丢弃。节点本地策略：`valid_after` 最多提前 120 s，`valid_before` 至少还剩 3 s [1]:L140, L142。
- 4844 与 7702（`0x04`）交易被拒绝 [2]:L14；[4] newl1-api-list.md:L59；[1]:L178。
- 文档还说：0x76 / 0x77 放在“高位、自行分配的区间”，以免和未来上游类型冲突 [2]:L14。

**签名**
- 三种方案：secp256k1、P256、WebAuthn，每一种都可以做 root key 或委托 key。P256 / WebAuthn 没有 recovery id，公钥放在签名里 [1]:L61–65。
- 以下客户端规则由共识强制执行：P256 必须 low-s、公钥必须是有效曲线点、带 `pre_hash` 标志；WebAuthn 的 authenticator data 必须正好 37 字节（不能带扩展），UP 或 UV 至少一个置位，type 为 `webauthn.get`，challenge 是无填充 base64url [1]:L67–72。
- passkey 为 root 的账户不能签 legacy / 1559 交易，只能用 `0x76` [1]:L74。
- 有两个签名摘要。账户哈希承诺“有没有代付人”，但不包含代付签名本身；代付哈希把同一个交易体绑定到被代付账户 [1]:L40；[2]:L40（`fee_payer_signature_hash(sender)`）。
- 委托 key 不直接签 signing hash，而是签 `keccak256(0x04 || signing_hash || account)`，再和账户地址一起包装，防止跨账户重放 [1]:L48；[2]:L43。
- 签名先后不是共识字段。token-fee 流程可以先让账户签（用“有代付人”的占位），代付人模拟、报价后最后签 [1]:L51。transaction-types 写的是“Sponsor first” [2]:L40（见“矛盾”）。

**Key 体系（AccountKeychain）**
- 每笔 AA 只代表一个账户。root / admin / access 是同一账户内的三个授权等级，不是三个账户 [1]:L78。
  - root：它的地址就是账户；无条件部署合约、管理 key；**不能被撤销** [1]:L82。
  - admin：授权和撤销其他委托 key（包括其他 admin）；不能部署；可被撤销；**不能**带 scope、上限或过期 [1]:L83。
  - access：普通 session key；不能管理 key；受 scope、花费上限和过期约束 [1]:L84。
  - 风险提示：admin 可以撤销所有其他委托 key，被盗后能把账户的 session key 全部清掉 [1]:L86。
- 预编译：`AccountKeychain` 在 `0x…4000`，`SignatureVerifier` 在 `0x…4001` [1]:L88。两者是“enshrined precompile（Rust 逻辑直接编进 EVM 预编译表）”，属于 New L1 原创，BSC 没有对应物 [3] system-contracts.md:L22–23, L31–32。
- 授权路径有两条。inline 授权随 AA 携带，在用户调用之前执行，最多 32 个 scope；直接调用 `authorizeKey` 最多 256 个 scope。每个 scope 最多 64 个 selector。secp256k1 为 root 的账户可以用普通交易调 `authorizeKey`，passkey 为 root 的账户必须走 0x76 [1]:L94–99；[2]:L51。
- `authorizeKey` 的参数：key id、签名方案、过期时间（unix 秒，0 表示永不过期）、admin 标志、scope、花费上限 [1]:L101。
- scope 是“目标地址列表 + 可选 4 字节 selector”。不设 scope 等于任意目标；设了 scope 但列表为空等于什么都不能做；root 完全绕过 scope [1]:L105。
- 花费上限：只限制**原生币流出**，计入成功调用转出的 value，自付时再加 `gas_limit × effective_gas_price`。period 为 0 是一次性额度，非 0 是从授权时刻起算的固定周期桶。代付的 gas 不计入 [1]:L107。
- 撤销是永久的：撤销过的 id 在该账户上永远不能再授权；槽位被占用时也不能重授权（已过期但没撤销的也算占用）[1]:L109。
- `newl1_getKey(account, keyId)` 返回 `sigType`（0 = secp256k1，1 = P256，2 = WebAuthn）、`expiry`、`isRevoked`、`isAdmin`、`scoped`、`spendLimit`、`spendPeriod`、`spent` [4]:L186, L207–218。

**代付与 token fee**
- 代付人承担原生 gas；账户照样推进 nonce，并支付调用里的原生 value。拒绝自代付。准入条件：代付人够付 gas 预留，账户够付调用总 value [1]:L128–131。
- `token_fee = {token, recipient, amount}` 的限制：只能用在 **root 签名且有代付** 的 AA 上；`recipient` 必须是恢复出的代付人；`token` 必须是合约；`amount` 不能为 0。两个签名都承诺了这笔支付，所以不需要 allowance 或 permit [1]:L134。
- token 支付**在用户调用之前执行，而且在原子检查点之外**：后面的用户调用回滚了，这笔钱照样付了。token 支付本身失败时，用户调用不会执行，交易以失败上链，代付人照样被收取声明的 gas_limit。准入阶段不预测任意 ERC-20 余额，代付人应先模拟 [1]:L136。

**Gas 与失败语义**
- 按**声明的 `gas_limit`** 收费，不按实际用量。未用的 gas 不退，存储退款作废。区块在执行前按声明 gas 打包，所以回执里 gasUsed 等于 gas_limit [1]:L117–118；[5]:L14–16, L20。这条同样适用于代付人和 session key 的花费上限 [5]:L22；[2]:L50。
- AA 附加费：P256 约 5,000；WebAuthn 5,000 加按字节计费；委托 key 检查 3,000；inline 授权约 27,000。设了花费上限或 scope 很大时更贵 [1]:L122。
- 文档建议用 `newl1_estimateGas` 估算 [1]:L120（但 API 列表里查不到这个方法，见“矛盾”）。
- 已上链但失败：用户调用和 inline 授权全部回滚，收取全额 gas_limit，nonce 推进；受限 key 自付的 gas 计入它的上限 [1]:L150。委托 key 的权限在执行时**再检查一次**：通过了提交检查也可能落成失败回执，并收全额 gas [1]:L153。

**身份与回执**
- `tx.origin` 和每个顶层调用的 `msg.sender` 都是账户本身，不是委托 key，也不是代付人 [1]:L157。
- 回执、日志、区块头保持标准形状，只是 type 为 0x76。合约可以从 keychain 预编译读出当前签名的 key id（0 表示 root）[1]:L158–159。
- 回执里只有一个整体 status（成功或回滚）[1]:L55。
- CREATE 只在同时满足以下条件时允许：第一个调用、root 签名、自付、没有 inline 授权 [1]:L163；[2]:L32, L49。

**账户是什么**
- “There is nothing to deploy … no smart-contract wallet … An ordinary account keeps its address” [1]:L9。root key 的地址就是账户 [1]:L82；passkey 账户的地址由 P256 公钥派生 [1]:L62。
- 研究者推论：这是协议原生、没有代码的 EOA 式账户，权限状态放在预编译的存储里，不在账户代码里。
- 文档没有说明 root key 能否换钥。研究者推论：root 不可撤销，地址又等于 root，所以同一地址内不能轮换 root。

**不支持什么**
- EIP-7702 set-code 与 EIP-4844 交易被拒绝 [5]:L50；[6] faq.md:L10。
- 没有 bundler，也不涉及 paymaster 合约 [6]:L22；[1]:L9。
- 隐私页“尚未实现”清单里的 “paymaster/ERC-4337 submission” 指的是 **shielded pool 的提交路径**，不是 AA [8] privacy.md:L63。

### 不确定之处
- fee payer 签名支持哪些算法，文档没写。Tempo 只支持 secp256k1。
- `token_fee` 的具体执行方式（是否等同 ERC-20 `transfer` 调用）、`token` 对接口有什么要求，文档没写。
- RLP 字段顺序、签名哈希的精确编码没有公开。文档只说“用对应客户端版本的 codec 和测试向量” [2]:L17。
- 客户端源码不公开（bnb-chain 组织下没有 New L1 仓库；本次没有重新跑 `gh search`）。所有机制都只能以文档为准。
- `nonce_key` 什么时候启用，文档没有给时间表。

---

## Q2' 对比：New L1 0x76 vs EIP-8130（+8430）vs Tempo（参照 7702 / 4337）

### 答案
New L1 的 0x76 与 **Tempo Transaction 高度一致**，可逐项对照：类型号都是 `0x76`；字段名大面积相同；预编译都叫 `AccountKeychain`；root / admin / access 三级结构和限制规则相同；委托签名摘要都是 `keccak256(0x04‖hash‖account)`；WebAuthn 与 P256 规则相同；附加 gas 数值相同；撤销语义也相同。主要差异在付费模型与经济参数：New L1 去掉了 `fee_token` 和 `aa_authorization_list`，新增 `token_fee`；暂不开放 2D nonce；花费上限限制原生 BNB（Tempo 只限 TIP-20）；按声明 gas 收费不退款。
EIP-8130 在 2026-10-08 改版后只定义 **Keystore**（可插拔 authenticator 合约 + scope 位 + policy manager），交易类型拆到 **EIP-8430**（`0x79`，PR 仍未合并）。它的设计方向是“可插拔验证器 + 跨链 Keystore”，和 New L1“协议固定三种签名 + 预编译 keychain”的路线不同。
7702 是给 EOA 设代码委托，4337 是协议外的 UserOp / bundler / EntryPoint / paymaster 体系。New L1 两者都不用：直接拒绝 7702 交易，也不需要 4337 设施。

### 依据：逐维对比

| 维度 | New L1 `0x76` | Tempo `0x76` | EIP-8130（Keystore）+ EIP-8430（`0x79`） | EIP-7702 | ERC-4337 |
|---|---|---|---|---|---|
| 状态 | devnet，没有公开网络 [7]:L67–69 | 2026-03-18 主网上线 [13] | 8130 Draft [9]；8430 Draft，PR #12385 未合并 [10] | Final [14] | Final（2026-06-02 改为 Final）[15] |
| 账户是什么 | 无代码的协议账户，地址 = root key [1]:L9, L82 | 同上：Root Key 的公钥决定地址 [12] | EOA（自身 key 是隐式 admin）、导入的合约钱包、CREATE2 新账户 [9] Account Types | 带委托指示符 `0xef0100‖addr` 的 EOA [14] | 合约账户 [15] |
| 验证逻辑在哪 | 协议固定，3 种签名 [1]:L61–63 | 协议固定，3 种签名加 Keychain 包装 [11] | 可插拔 authenticator 合约；canonical 集合为 k1 / p256 / passkey / delegate [9] | 只有 secp256k1 [14] | 账户合约 `validateUserOp` [15] |
| Key 与权限 | root / admin / access；scope = 目标 + selector；原生币花费上限；过期 [1]:L80–107 | root / admin / limited access；scope = 目标 + selector + 收款人；TIP-20 花费上限；过期 [12] | actor + scope 位（OPERATOR / SELF_PAYER / SPONSOR_PAYER / POLICY / NONCE）+ policy manager 合约 [9] | 协议层没有，由委托代码实现 [14] | 由账户合约实现 |
| 批量 | 1–64 个调用，整笔原子 [1]:L13 | `calls` 原子执行 [11] | 8430：多个 phase，phase 内原子，之后的 phase 跳过 [10] | 由委托代码实现 | 由账户合约实现 |
| 代付 | `fee_payer_signature`；拒绝自代付 [1]:L130 | `fee_payer_signature`（0x78 域，只支持 secp256k1）；拒绝自代付 [11] | 8430：自付 / 指定代付人 / open payer（0x7A 域）[10] | 需外部设施 | paymaster 合约 [15] |
| Gas 代币 | 只有 BNB；`token_fee` 用代币偿还代付人 [1]:L134 | `fee_token`（TIP-20），经 Fee Manager 结算 [11] | 原生币 [10] | 原生币 | paymaster 可以收 ERC-20 |
| nonce | 只用 `nonce_key = 0` [2]:L48 | 2D nonce 加过期 nonce（`uint256.max`，≤300 s）[11] | 8430：2D nonce 加 nonce-free（环形缓冲去重）[10] | 普通 nonce | EntryPoint 的 key + seq |
| PQ 扩展 | AA 文档里没有 PQ 方案 | 文档里没有 | 预期把 PQ authenticator 纳入 canonical 集合，不需要迁移 [9] | 无 | 账户合约可自行实现 |
| bundler / EntryPoint | 不需要 [1]:L9 | 不需要 [11] | 不需要 [10] | 不需要 | 需要 [15] |
| 与 7702 的关系 | 拒绝 0x04 交易 [2]:L14 | `aa_authorization_list`：7702 式委托，支持 AA 签名 [11] | 8430 在交易内带 7702 式委托（`account_changes` 0x01）[10] | — | 依赖 7702（`requires: 712, 7702`）[15] |
| 未用 gas | 不退，按声明收费 [1]:L118 | 先预扣再退款 [11] | 按 `gas_used` 结算并退差额 [10] | 标准 1559 | 标准 |

**New L1 与 Tempo 的逐项对照（observed：两边原文都能直接比对）**

| 项 | New L1 | Tempo | 是否一致 |
|---|---|---|---|
| 类型号 | `0x76` [2]:L11 | `0x76` [11] | 相同 |
| 字段 | chain_id、nonce_key、nonce、两个 1559 费用字段、gas_limit、calls、access_list、valid_after、valid_before、key_authorization、fee_payer_signature、token_fee [1]:L24–34 | 相同的 11 个字段，另有 fee_token、aa_authorization_list [11] | 11 个字段名相同；New L1 去掉 2 个、加 1 个 |
| call 结构 | `{to, value, input}` [2]:L32 | `Call {to, value, input}` [11] | 相同 |
| 预编译名 | `AccountKeychain` @ `0x…4000` [1]:L88 | `AccountKeychain` @ `0xAAAAAAAA00…00` [12] | 名称相同，地址不同 |
| 等级 | root / admin / access；admin 不能带 scope、上限、过期 [1]:L82–84 | Root / Admin / Limited Access；admin 不能带上限、scope、过期 [12] | 相同 |
| 委托签名摘要 | `keccak256(0x04‖signing_hash‖account)` [1]:L48 | `keccak256(0x04‖tx_sig_hash‖user_address)`（Keychain V2）[11] | 相同 |
| WebAuthn | 37 字节、UP 或 UV、`webauthn.get`、无填充 base64url [1]:L72 | 同样四条 [11] | 相同 |
| P256 `pre_hash` | 有 [1]:L70 | 有 [11] | 相同 |
| 附加 gas | P256 约 5,000、WebAuthn 5,000 + 按字节、委托检查 3,000 [1]:L122 | P256 +5,000、WebAuthn 26,000 + calldata、Keychain +3,000 [11] | 数值相同 |
| 撤销 | 永久，不能重授权 [1]:L109 | 撤销的 keyId “can NEVER be re-authorized” [12] | 相同 |
| 自代付 | 拒绝 [1]:L130 | 拒绝 [11] | 相同 |
| 代付绑定 sender | 是 [2]:L40 | 是（0x78 域加 sender_address）[11] | 相同 |
| 合约读当前 key | keychain 预编译返回 key id，0 表示 root [1]:L159 | `getTransactionKey()`，`address(0)` 表示 Root [12] | 相同 |
| 部署限制 | 只有 root 可以，且是第一个调用 [1]:L163 | access key 不能在交易层面 CREATE [12] | 方向一致，细节不同 |
| 花费上限对象 | 原生币流出加自付 gas [1]:L107 | 只限 TIP-20，原生 value **不受限** [12] | **相反** |
| nonce | 只用 key 0 [2]:L48 | 2D nonce 加过期 nonce [11] | 不同 |
| 未用 gas | 不退 [1]:L118 | 退款 [11] | 不同 |

- 是否“借鉴 / 移植”：两份文档都没有提到对方。我在 New L1 读过的页面里没有找到 “Tempo” 字样（没有对全部快照做 grep）。New L1 执行层基于 reth / revm [7]:L45；Tempo 也基于 Reth（它的 nonce 预编译说明里写着 “no clean way to extend account state in Reth”）[11]。研究者推论见台账 A35（inferred）和 A36（speculative）。
- EIP-8130 当前版本（`1a1f470`，2026-10-08，提交信息 “scope to the Keystore, move the transaction type to a new EIP”）的标题是 “Keystore Accounts”。它说 Keystore 不依赖任何交易格式，可以经普通 EVM 调用、4337、8141 帧账户或 “AA Transaction Type proposal” 使用 [9] Abstract。8430 的 PR 描述：“split out of EIP-8130 … with no Keystore dependency” [10]。
- 8130 的 authenticator 集合“预期随签名算法成熟而增长（例如后量子）”，账户只要授权一个指向新 authenticator 的 actor 就能切换，不需要迁移 [9] Canonical Authenticator Set。

### 不确定之处
- New L1 与 Tempo 的 RLP 字段顺序、签名哈希的精确编码能否字节级互通，无法验证：New L1 没有公开 codec。
- 8430 仍是未合并的 PR，编号和内容都可能变。
- Tempo 文档是滚动更新的网页，没有固定版本（只记录访问日期；AccountKeychain 页引用的源码是 `tempoxyz/tempo@7d4fd03fc0`）。

---

## 外部调研中被修正的地方（BNB-new-L1-deep-dive.md 第三、四节等）

1. **“四层：Root / Admin / Delegated / Sponsor”是错的。** 文档写的是同一账户内的三个授权等级（root / admin / access）[1]:L78–84。代付人是另一个账户，“The fee payer must be a different account” [1]:L130，不是本账户的一级 key。
2. **“1–64 calls”正确。** “最大约 128 KiB”应写准确值 128 KiB [1]:L36。
3. **“nonce_key 必须为 0”正确，但少了文档原话：** “Parallel nonce lanes are reserved but not enabled” [2]:L48。
4. **字段名错误：** 文中写 “valid-after / valid-until”，实际字段是 `valid_before`，而且不含边界 [1]:L31, L140。
5. **token fee 机制写错（重要）：** 文中说“交易完成后由协议或账户按规则偿还”。实际是 token 支付**在用户调用之前**执行、在原子检查点之外，用户调用回滚了也照付；而且只能用于 root 签名且有代付的交易 [1]:L134, L136。
6. **权限维度夸大：** 文中说授权 key 可绑定“交易价值上限、gas 支出上限”。实际只有一个**原生币**花费上限，计入 value 加自付 gas；没有单独的价值或 gas 上限，也没有 ERC-20 上限 [1]:L107。
7. **“Tempo 支持 EIP-7702 风格 authorization list”正确**（`aa_authorization_list`）[11]。**重大遗漏：** 文中没有指出 Tempo 也用 `0x76`、预编译同名 `AccountKeychain`、字段名和签名摘要高度一致。“最接近 Tempo”的说法明显低估了相似程度。
8. **EIP-8130 描述过时：** Keystore / actor / authenticator / policy 的表述与新版大体相符，但没有提到 2026-10-08 交易类型已拆到 EIP-8430（`0x79`，Draft PR）[9][10]。我们的前文 `native-aa-eip-8130-8141`（2026-10-04）把 `0x79` 信封写在 8130 名下，同样已经过时 [17]。
9. **成熟度归错：** 文中把“paymaster/ERC-4337 兼容路径”列为全局“尚未完成或预留”。原文这一条只出现在 **shielded pool** 的未实现清单里 [8]:L63；AA 的 FAQ 说根本不需要 bundler / paymaster [6]:L22。
10. **遗漏的关键限制：** passkey 为 root 的账户不能发普通交易 [1]:L74；root 不可撤销 [1]:L82；admin 被盗可清空所有 session key [1]:L86；CREATE 有四个条件 [1]:L163；权限执行时再检查，失败照收全额 gas [1]:L153；7702 / 4844 交易被拒 [2]:L14。
11. **“Tempo 的 AccountKeychain 可管理 access key、过期和 TIP-20 spending limit”正确** [12]。但该处引用链接指向 Tempo 的 eip-7702 页，不是 AccountKeychain 规范。
12. **“按声明 gas_limit 收费……有利于异步执行”属于解读。** 文档原文的理由是“Blocks are packed by declared gas before execution” [1]:L118；[5]:L16。

---

## 矛盾 / 文档内部不一致

- `token_fee` 出现在 account-abstraction 的字段表里 [1]:L34，但不在 transaction-types 的字段表里 [2]:L25–36。
- 签名顺序：transaction-types 写 “Sponsor first, if any” [2]:L40；account-abstraction 写 “Chronological order is not a consensus field”，token-fee 流程可以让代付人最后签 [1]:L51。研究者解读：前者是推荐流程，不是共识规则。
- `newl1_estimateGas` 在 AA 页被推荐 [1]:L120，但 API 列表自称列出了“Every method New L1 serves beyond … Geth”[4]:L7，却没有收录这个方法。migrate 页给的做法是 `eth_estimateGas` 加少量余量 [5]:L19。
- overview 说 “the sender need not hold BNB” [7]:L32；AA 页说账户必须能付调用的原生 value [1]:L131。研究者解读：只有调用不带 value 时前者才成立。

---

## 来源

1. **PRIMARY** newl1-docs@ef5a632/core-concepts/account-abstraction.md：0x76 的全部机制、限制、key 等级、代付、token_fee、gas、失败语义。
2. **PRIMARY** newl1-docs@ef5a632/developers/transaction-types.md：0x76 / 0x77 类型表、字段、签名步骤、“nonce lanes reserved but not enabled”、无 SDK。
3. **PRIMARY** newl1-docs@ef5a632/governance/system-contracts.md：AccountKeychain / SignatureVerifier 地址，enshrined Rust 预编译，New L1 原创。
4. **PRIMARY** newl1-docs@ef5a632/developers/json_rpc/newl1-api-list.md：`newl1_getKey` 返回字段；4844 / 7702 被池拒绝。
5. **PRIMARY** newl1-docs@ef5a632/get-started/migrate-from-bsc.md：按声明 gas 收费也适用于 0x76、代付人和 session key 上限；7702 被拒。
6. **PRIMARY** newl1-docs@ef5a632/faq.md：不需要 bundler / paymaster；devnet 状态。
7. **PRIMARY** newl1-docs@ef5a632/overview.md：0x76 与 key 管理已在 devnet 跑通；基于 reth / revm。
8. **PRIMARY** newl1-docs@ef5a632/core-concepts/privacy.md:L63：“paymaster/ERC-4337 submission”未实现，范围是 shielded pool。
9. **PRIMARY** EIP-8130 “Keystore Accounts”，ethereum/EIPs `EIPS/eip-8130.md@1a1f470fba9a`（2026-10-08，Draft），https://github.com/ethereum/EIPs/blob/1a1f470fba9aacac2bbb2f5ba79c8a0eee68800c/EIPS/eip-8130.md ：Keystore、canonical authenticator、scope 位、policy、PQ 可扩展，交易类型已拆出。
10. **PRIMARY（未合并）** EIP-8430 “AA Transaction Type”，PR ethereum/EIPs#12385，head `chunter-cb/EIPs@a742d263` `EIPS/eip-8430.md`（Draft，访问于 2026-10-24）：`0x79`、phase、2D / nonce-free、payer 模式、7702 式委托、按 gas_used 退款。
11. **PRIMARY** Tempo Transactions Specification，https://docs.tempo.xyz/protocol/transactions/spec-tempo-transaction （访问于 2026-10-24）：Tempo `0x76` 字段、签名类型、Keychain V2 摘要、0x78 代付域、2D / 过期 nonce、gas 附加费。
12. **PRIMARY** Tempo Account Keychain Precompile，https://docs.tempo.xyz/protocol/transactions/AccountKeychain （访问于 2026-10-24；错误表链接到 `tempoxyz/tempo@7d4fd03fc0`）：地址、三级等级、TIP-20 花费上限、撤销语义。
13. **PRIMARY** Tempo 博客 “Tempo Mainnet is live”，https://tempo.xyz/blog/mainnet （2026-03-18，访问于 2026-10-24）：Tempo 主网上线日期。
14. **PRIMARY** EIP-7702，ethereum/EIPs `EIPS/eip-7702.md@bbc3f958`（Final）：`SET_CODE_TX_TYPE = 0x04`，委托指示符 `0xef0100‖address`。
15. **PRIMARY** ERC-4337，ethereum/ERCs `ERCS/erc-4337.md@c8d8c210`（2026-06-02 改为 Final）：UserOperation、独立 mempool、bundler、EntryPoint `handleOps`、paymaster；`requires: 712, 7702`。
16. ChatGPT Deep Research `research/BNB-new-L1-deep-dive.md`（2026-10-24）：只作线索，修正见上节。
17. 前文 `reports/2026/10/native-aa-eip-8130-8141/explainer.md`（2026-10-04）：8130 导读；其中 `0x79` 信封归属已过时。

已排除：Cryptobriefing、CoinDesk、crypto.news、Aave 论坛（只当线索；Tempo 上线日期改用官方博客）；Foundry `cast keychain` 文档和个人 gist（与结论无关）。

---

## 开放问题

- New L1 的 0x76 和 Tempo 的 0x76 在 RLP 字段顺序和签名哈希上能否字节级兼容？现成的 Tempo 工具（如 Foundry 的 Tempo 支持、viem tempoActions）能不能直接用？类型号相同而字段不同，同一个类型号背后是两种 schema，可能造成工具误用。
- fee payer 签名是否只支持 secp256k1？`token_fee` 对代币有什么接口要求、怎么执行？
- `nonce_key` 和 2D nonce 何时启用？会不会引入 Tempo 式过期 nonce？
- AA 有没有 PQ 签名路线？目前只在隐私页提到 “reserved post-quantum authorization scheme” [8]:L63。
- BEP-20 金额上限：花费上限只管原生币，session key 怎样限制代币支出（只能靠 scope，还是会扩展 TIP-20 式代币上限）？
- New L1 文档快照里有没有其他页面提到 Tempo、8130 或设计来源（需要对快照全量 grep）？

---

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| A1 | New L1 的原生 AA 交易是 EIP-2718 类型 `0x76`，从 genesis 起有效，不需要 bundler、EntryPoint 或合约钱包，由每个节点执行规则 | [1] newl1-docs@ef5a632/core-concepts/account-abstraction.md:L7, L9 | observed | |
| A2 | 官方称 0x76 信封和 AA key 管理已在源码构建的多验证者 devnet 上跑通；没有公开 testnet 或 mainnet | [7] newl1-docs@ef5a632/overview.md:L67–69；[6] newl1-docs@ef5a632/faq.md:L18 | observed | |
| A3 | 官方仓库没有受支持的 New L1 SDK 或版本化 codec，要求使用对应客户端版本的 codec 和测试向量 | [2] newl1-docs@ef5a632/developers/transaction-types.md:L16–17 | observed | |
| A4 | 0x76 字段：chain_id、nonce_key、nonce、两个 1559 费用字段、gas_limit、calls、access_list、valid_after / valid_before、key_authorization、fee_payer_signature、token_fee | [1] account-abstraction.md:L22–34 | observed | |
| A5 | 一笔 0x76 含 1–64 个调用，只有一个外层签名、一个 nonce、一张回执，调用全部生效或全部回滚 | [1] account-abstraction.md:L13, L29 | observed | |
| A6 | 单笔 0x76 编码后不超过 128 KiB；任何用户交易声明 gas 不超过 16,777,216 | [1] account-abstraction.md:L36, L124, L171–172 | observed | |
| A7 | `nonce_key` 目前必须为 0；并行 nonce 通道“预留但未启用” | [2] transaction-types.md:L28, L48；[1] account-abstraction.md:L175 | observed | |
| A8 | 支持 secp256k1、P256、WebAuthn 三种签名，任一种都可以做 root 或委托 key；P256 / WebAuthn 的公钥放在签名里 | [1] account-abstraction.md:L61–65 | observed | |
| A9 | 以下规则由共识强制：P256 low-s 且公钥是有效曲线点、`pre_hash` 标志；WebAuthn authenticator data 正好 37 字节、UP 或 UV 至少一个、type 为 `webauthn.get`、无填充 base64url challenge | [1] account-abstraction.md:L67–72 | observed | |
| A10 | passkey 为 root 的账户不能签 legacy 或 EIP-1559 交易，只能通过 0x76 操作 | [1] account-abstraction.md:L74 | observed | |
| A11 | root、admin、access 是同一账户的三个授权等级；root 的地址就是账户，不能被撤销 | [1] account-abstraction.md:L78–84 | observed | |
| A12 | admin key 可以授权和撤销其他委托 key（包括 admin），但不能部署合约，必须是无 scope、无上限、无过期的；被盗后可清掉账户所有 session key | [1] account-abstraction.md:L83, L86 | observed | |
| A13 | `AccountKeychain` 在 `0x…4000`，`SignatureVerifier` 在 `0x…4001`，是编进 EVM 预编译表的 Rust 逻辑，New L1 原创，BSC 没有 | [1] account-abstraction.md:L88；[3] newl1-docs@ef5a632/governance/system-contracts.md:L22–23, L31–32 | observed | |
| A14 | 授权 key 有两条路径：inline 授权最多 32 个 scope，直接调用 `authorizeKey` 最多 256 个；每个 scope 最多 64 个 selector | [1] account-abstraction.md:L94–99 | observed | |
| A15 | scope 限制目标地址，可再细化到 4 字节 selector；scope 为空列表等于什么都不能做；root 绕过 scope | [1] account-abstraction.md:L105 | observed | |
| A16 | 花费上限只限制原生币流出：成功调用转出的 value 加自付时的 gas_limit×价格；支持一次性或固定周期桶；代付的 gas 不计入 | [1] account-abstraction.md:L107 | observed | |
| A17 | 撤销是永久的：撤销过的 key id 在该账户上永远不能再授权；已过期但没撤销的槽位也不能重授权 | [1] account-abstraction.md:L109 | observed | |
| A18 | `newl1_getKey` 返回 sigType（0 = secp256k1，1 = P256，2 = WebAuthn）、expiry、isRevoked、isAdmin、scoped、spendLimit、spendPeriod、spent | [4] newl1-docs@ef5a632/developers/json_rpc/newl1-api-list.md:L186, L207–218 | observed | |
| A19 | 委托 key 签的是 `keccak256(0x04 \|\| signing_hash \|\| account)`，并和账户地址一起包装，防止跨账户重放 | [1] account-abstraction.md:L48；[2] transaction-types.md:L43 | observed | |
| A20 | 账户签名哈希承诺“有没有代付人”但不含代付签名；代付哈希把交易体绑定到被代付账户 | [1] account-abstraction.md:L40；[2] transaction-types.md:L40 | observed | |
| A21 | 拒绝自代付；准入要求代付人够付 gas 预留、账户够付调用总 value；账户照样推进 nonce | [1] account-abstraction.md:L128–131 | observed | |
| A22 | `token_fee` 只能用在 root 签名且有代付的 AA 上；recipient 必须是代付人，token 必须是合约，amount 不能为 0；不需要 allowance 或 permit | [1] account-abstraction.md:L134 | observed | |
| A23 | token 支付在用户调用之前、原子检查点之外执行：用户调用回滚照样付；token 支付失败则用户调用不执行，代付人照收全额 gas_limit | [1] account-abstraction.md:L136 | observed | |
| A24 | AA 和普通交易都按声明的 gas_limit 收费，不退未用 gas，存储退款作废；这条同样适用于代付人和 session key 上限 | [1] account-abstraction.md:L117–118；[5] newl1-docs@ef5a632/get-started/migrate-from-bsc.md:L14, L22 | observed | |
| A25 | AA 附加 gas：P256 约 5,000，WebAuthn 5,000 + 按字节，委托 key 检查 3,000，inline 授权约 27,000 | [1] account-abstraction.md:L122 | observed | |
| A26 | 有效期：valid_after 含边界、valid_before 不含边界；节点本地策略是 valid_after 最多提前 120 s、valid_before 至少还剩 3 s | [1] account-abstraction.md:L140, L142 | observed | |
| A27 | 已上链但失败的交易收全额 gas_limit 并推进 nonce；委托 key 权限在执行时再检查，通过提交检查不代表一定成功 | [1] account-abstraction.md:L150, L153 | observed | |
| A28 | tx.origin 和顶层调用的 msg.sender 都是账户，不是委托 key 或代付人；合约可以从 keychain 预编译读出当前签名的 key id（0 表示 root） | [1] account-abstraction.md:L157, L159 | observed | |
| A29 | CREATE 只在同时满足以下条件时允许：第一个调用、root 签名、自付、没有 inline 授权 | [1] account-abstraction.md:L163 | observed | |
| A30 | New L1 拒绝 EIP-7702（0x04）和 EIP-4844 交易；FAQ 称 AA 不涉及 bundler 或 paymaster 合约 | [2] transaction-types.md:L14；[4] newl1-api-list.md:L59；[6] faq.md:L22 | observed | |
| A31 | 隐私页“尚未实现”清单里的 “paymaster/ERC-4337 submission” 指 shielded pool 的提交路径，不是 AA | [8] newl1-docs@ef5a632/core-concepts/privacy.md:L63 | observed | |
| A32 | New L1 AA 的账户是无代码的协议账户，权限状态在预编译存储里，root key 无法在同一地址内轮换 | 由 A1、A11、A13 推出：没有合约钱包、地址等于 root 且 root 不可撤销、key 状态由 keychain 预编译管理 | inferred | |
| A33 | New L1 session key 无法原生限制 BEP-20 的支出金额，只能用目标 / selector 来限制 | 由 A15、A16 推出：花费上限只计原生币流出，scope 只有目标和 selector | inferred | |
| A34 | Tempo 的原生 AA 交易也用 EIP-2718 类型 `0x76`，并且有 chain_id、两个费用字段、gas_limit、calls、access_list、nonce_key、nonce、valid_before、valid_after、fee_payer_signature、key_authorization 这 11 个同名字段 | [11] docs.tempo.xyz spec-tempo-transaction（TempoTransaction 结构，访问于 2026-10-24） | observed | |
| A35 | Tempo 的 key 预编译同样叫 `AccountKeychain`（地址 `0xAAAAAAAA00…00`，和 New L1 的 `0x…4000` 不同），同样分 Root / Admin / Limited Access 三级，admin 同样不能带上限、scope、过期 | [12] docs.tempo.xyz AccountKeychain（访问于 2026-10-24）；[1] account-abstraction.md:L82–84, L88 | observed | |
| A36 | Tempo 的 Keychain V2 签名同样是 `keccak256(0x04 \|\| tx_sig_hash \|\| user_address)`；WebAuthn 规则（37 字节、UP 或 UV、webauthn.get）、P256 `pre_hash`、附加 gas（P256 +5,000、Keychain +3,000）和撤销后不能重授权，都与 New L1 相同 | [11] spec-tempo-transaction（Signature Types、Gas Costs）；[12] Key Revocation；[1] account-abstraction.md:L48, L70–72, L109, L122 | observed | |
| A37 | New L1 的 0x76 与 Tempo Transaction 在类型号、字段名、预编译名、签名摘要、gas 常量和权限语义上高度同源，可以看作 Tempo 设计的 BNB 变体 | 由 A34、A35、A36 推出：多项独立设计细节逐字或逐数值一致，巧合的可能性很低 | inferred | |
| A38 | New L1 客户端的 AA 实现可能直接复用或移植了 Tempo 的 reth 代码 | 未验证：New L1 基于 reth / revm（[7] overview.md:L45），Tempo 也基于 Reth（[11] Nonce 实现说明），但 New L1 源码不公开，两份文档都没有提到对方 | speculative | |
| A39 | 与 Tempo 相比，New L1 去掉了 `fee_token`（TIP-20 付 gas）和 `aa_authorization_list`（7702 式委托），新增 `token_fee` 用代币偿还代付人 | [11] TempoTransaction 结构；[1] account-abstraction.md:L34, L134；[2] transaction-types.md:L14 | observed | |
| A40 | Tempo 已开放 2D nonce 和过期 nonce（`uint256.max`，valid_before 最多 300 s）；New L1 只允许 nonce_key = 0 | [11] Parallelizable Nonces / Nonce Validation；[2] transaction-types.md:L48 | observed | |
| A41 | 花费上限对象相反：Tempo 只限 TIP-20 代币，原生 value 不受限；New L1 只限原生币流出 | [12] Access Keys（“Native value transfers … are NOT limited”）；[1] account-abstraction.md:L107 | observed | |
| A42 | Tempo 按代付人或发送方先预扣再退款；New L1 收全额声明 gas_limit 不退款 | [11] Fee Payer Resolution（“pre-charge, refund”）；[1] account-abstraction.md:L118 | observed | |
| A43 | Tempo 主网于 2026-03-18 上线，New L1 仍处于 devnet | [13] tempo.xyz/blog/mainnet；[7] overview.md:L67 | observed | |
| A44 | EIP-8130 当前版本（2026-10-08，Draft）标题为 “Keystore Accounts”，只定义 Keystore，交易类型已拆到单独提案 | [9] ethereum/EIPs EIPS/eip-8130.md@1a1f470（Abstract；提交信息 “move the transaction type to a new EIP”） | observed | |
| A45 | 拆出的 EIP-8430 “AA Transaction Type” 是 Draft，PR #12385 还没合并；它用 `0x79`（代付域 `0x7A`），有 phase 批量、2D nonce 和 nonce-free 模式、交易内 7702 式委托，并按 gas_used 结算退款 | [10] chunter-cb/EIPs EIPS/eip-8430.md@a742d263（Constants、Nonces、Account Changes、Fees）；PR ethereum/EIPs#12385 状态 open | observed | |
| A46 | EIP-8130 的验证由可插拔 authenticator 合约完成（canonical 集合为 k1 / p256 / passkey / delegate），权限用 scope 位和 policy manager 表达；文档预期 PQ 算法以新 authenticator 加入，不需要迁移 | [9] eip-8130.md@1a1f470（Canonical Authenticator Set、Actor Scope、Actor Policies） | observed | |
| A47 | 和 8130 相比，New L1 的签名算法由协议固定在三种之内；给 AA 加 PQ 或新签名算法需要协议升级，而 8130 只需部署新 authenticator 并纳入 canonical 集合 | 由 A8、A13、A46 推出：New L1 签名方案和 keychain 都是 enshrined 预编译，AA 文档没有可插拔验证器 | inferred | |
| A48 | EIP-7702（Final）用类型 `0x04` 给 EOA 写入委托指示符 `0xef0100 \|\| address`；ERC-4337（Final）用 UserOperation、独立 mempool、bundler、EntryPoint `handleOps` 和 paymaster 实现协议外 AA | [14] ethereum/EIPs EIPS/eip-7702.md@bbc3f958（Parameters、Abstract）；[15] ethereum/ERCs ERCS/erc-4337.md@c8d8c210（Abstract、front matter） | observed | |
| A49 | 外部调研把 New L1 写成“Root / Admin / Delegated / Sponsor 四层”、把 token fee 写成“交易完成后偿还”，都和官方文档不符 | [16] BNB-new-L1-deep-dive.md §3.2–3.3；对照 [1] account-abstraction.md:L78–84, L130, L136 | observed | |

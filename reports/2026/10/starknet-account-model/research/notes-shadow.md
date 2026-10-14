# Shadow Account 调研笔记（lane = shadow，前缀 W）

> 调研日期 2026-10-14（UTC+8）。源码固定 commit：starknet-privacy @ `f9256c5e`（2026-09-28），starkware-starknet-utils @ `3e2fd53d`（2026-08-17）。starknet-privacy 根 `Scarb.toml#L20-L22` 引用的 starkware-starknet-utils rev 就是 `3e2fd53d99e16c87f6cf2ced53b8c842a2d54a18`，和本地克隆一致。链上数据来自 Starknet mainnet 公共 RPC（api.cartridge.gg / starknet-rpc.publicnode.com），查询时最新区块约 16,357,229。

**一句话总结**：Shadow Account 是由 `ShadowAccountAnonymizer` 以 identity commitment 作 salt、惰性部署的**无密钥代理合约**。它只有一个入口 `execute(calls)`，只认 owner（即 anonymizer）。anonymizer 又只认 privacy pool，而 pool 只在验证了 virtual-OS 证明之后才会调用它；用户主账户的签名检查发生在这份证明的私有执行里。地址由 `Poseidon(Poseidon(identity_key, dapp_name), nonce)` 作 salt，按 Pedersen 合约地址公式、用固定的 PRIMER_CLASS_HASH 计算。

**本路问题（brief 问题 5）的一句话答案**：用户说它“像 private sub account”，方向是对的。StarkWare 自己在 2026-07 到 2026-08 期间就叫它 “private sub-accounts / SubAccount”，后来才改名。更精确的说法是：**一个由隐私证明授权、由 anonymizer 独占驱动、每个 (user, anonymizer, dapp_name, nonce) 对应一个的持久化公开化名合约**。它没有自己的私钥和签名能力，不是 Starknet 账户（不能自己发交易、不能做 `is_valid_signature`）。它隐藏的只是“与主钱包的关联”，余额、调用和仓位全部公开。

---

## W-Q1 是什么、何时上线

**答案**：官方文档（strk20.starknet.io/docs，内容即 “STRK20 by Example”）的定义原文是 “A shadow account is a persistent, pseudonymous identity for one user and one dapp … A shadow account is not a wallet account: it has no keys and cannot sign.”[11]。这个功能在 2026-07-15 的官方博客里还写着“Coming next: private sub-accounts … Not live yet”[15]。mainnet 上第一个 shadow account 部署于 **2026-09-07 17:07:38 UTC**（区块 14,514,661）[18]。截至 2026-10-14 05:51 UTC，ShadowAccountDeployed 事件共 173 条，其中 49 条在 2026-10-13 00:00（UTC+8）之后[18]。我**没有找到** 2026-10-13 的官方发布文章或文档：starknet.io/blog 与 starkware.co/blog 的列表里都没有 shadow 专文[22]。所以 “10-13 前后推出” 只能当作用户背景或社交媒体信息。

**依据**
- 定义：“persistent, pseudonymous identity for one user and one dapp. It lets a protocol recognize a returning user and hold positions over time without exposing the public link to that user's main wallet.” “has no keys and cannot sign. The ShadowAccountAnonymizer deploys it lazily at a deterministic address and is the only contract that can execute calls through it.”[11]
- 官方列出的适用场景（只引原文）：“account-based flows such as borrowing and staking run through persistent, deterministic addresses with no public onchain link back to the user's main wallet”[12]；博客原文为 “private sub-accounts, which will let apps run everyday transactions (borrowing, staking, swapping) through accounts with no public onchain link back to a user's main wallet”[15]。官方材料里**没有找到** “treasuries / LP” 这类表述。
- 时间线（全部可核实）：
  - 2026-07-15：博客写 “Coming next … Not live yet”[15]。
  - 2026-07-22：SDK PRIVACY-0.14.3-RC.4 的 release notes 出现 sub-account 字样（我只做了关键词命中检查）[17]。
  - 2026-08-12：RC.5 发布。CHANGELOG 中 RC.5 一节记录了 “Sub-accounts are called shadow accounts”：Cairo 包 `sub_account_anonymizer` 改名为 `shadow_account_anonymizer`，并注明 “Historical `SubAccountDeployed` events keep the old key”[9][17]。
  - 2026-09-07：mainnet 首个 shadow account 部署[18]。
  - 2026-09-10：types-js v0.10.4 发布，含 “rename STRK20 sub-accounts to shadow accounts (spec PR 406)”[16]。
  - 2026-09-15：SDK 0.14.3-RC.8 发布，官方表格把它列为 “SDK released”[17][11]。
  - 2026-09-25：首个采用 primer 方式部署的 shadow account 出现（区块 15,409,867）[18]。
  - 2026-09-29：合约地址页标注 “checked … on 29 September 2026”[12]；Vesu 金库演示仓库创建[19]。
- 首批集成：官方文档列出 “Shadow Account Vault Demo … existing Vesu Prime STRK vault. In private mode, a shadow account owns the vault shares and withdrawals return to the wallet's shielded balance … Mainnet demo · Real assets. Educational example, not audited production software.”[11]。演示仓库在个人账号 `starkience` 下，2026-09-29 创建[19]。钱包方面，starknet.js 指南写 “As of 2026-08, the Ready and Xverse wallets support the STRK20 wallet API”[13]；但 shadow 方法是否已被支持，官方原文是 “Confirm support in the connected wallet”[12]。
- mainnet 地址：ShadowAccountAnonymizer `0x04f33230…888a7`（Sepolia：`0x010a2285…b147`）[12][13]。链上 `get_privacy_contract()` 返回 pool `0x040337b1…e812a`，`get_shadow_account_class_hash()` 返回 `0x70e76435…2b78f`[18]。

**不确定之处**
- “2026-10-13 推出”找不到一手来源。可能是社交媒体宣传、钱包上线或 demo 推广的日期（speculative）。
- 链上事件只从区块 14,400,000 开始扫描。按旧事件名 `SubAccountDeployed` 的查询（区块 14,000,000 起）未扫完。因此“首个部署于 2026-09-07”的意思是“14.4M 之后的首个”，不排除更早还有旧名事件。
- strk20.starknet.io/docs 路径下返回的页面标题是 “STRK20 by Example”，自称 educational。它挂在 starknet.io 官方域名下，我把它当作官方文档，但它的权威性低于源码。

## W-Q2 合约结构与授权链

**答案**：`ShadowAccount` 合约的存储只有 `owner: ContractAddress` 和升级组件，没有公钥。它只有三个入口 `execute` / `initialize` / `owner`，外加 owner 才能调用的 EIC `upgrade`。**没有** `__validate__`、`__execute__`、`is_valid_signature`。`execute` 只检查 `get_caller_address() == owner`[2]。在 mainnet 上，owner 就是 anonymizer[18]。anonymizer 的 `privacy_invoke_with_computation` 只接受配置好的 privacy contract 调用，接收任意 `Array<Call>`，结束后按 All / Diff / Exact 三种策略把代币收回 open note[1]。

**依据（每一跳的代码位置）**
1. **用户签名**：pool 的 `__execute__` 在 virtual OS 里本地执行（`assert_valid_os_call` 要求 caller 为 0、交易版本为 V3）。它先 `compile_actions`，再 `assert_valid_signature(user_addr, calls, tx_info)`，最后 `send_message_to_server` 把 server actions 作为 L2→L1 消息发出（`privacy.cairo#L195-L214`[4]，`utils.cairo#L575-L582`、`#L439-L447`[7]）。签名检查依次尝试：自定义校验 `is_custom_signature_valid`（需经 SRC5 声明）→ 对 tx hash 的 `is_valid_signature` → 对 SNIP-12 CallSet hash 的 `is_valid_signature`（`utils.cairo#L385-L420`[7]）。
2. **私有计算**：`ComputeAndInvoke` 这个 client action 在证明内部算出 `identity_key`，再用 `call_contract_syscall` 调 anonymizer 的 `privacy_compute`，把结果作为 `InvokeWithComputation` server action 的 calldata 前缀（`privacy.cairo#L547-L582`[4]）。
3. **证明 → pool**：任何人（relayer / paymaster）调用 `apply_actions`。`validate_proof` 检查 `proof_facts` 里的 program variant、base block 的新鲜度，以及 message hash 是否与 actions 一致（`privacy.cairo#L784-L843`[4]）。随后按顺序执行 actions，`InvokeWithComputation` 走 `_apply_invoke_and_deposits`（`#L887-L895`、`#L991-L1035`[4]）。
4. **pool → anonymizer**：`assert(get_caller_address() == self.privacy_contract.read(), UNAUTHORIZED_CALLER)`（`shadow_account_anonymizer.cairo#L329-L331`[1]）。
5. **anonymizer → shadow**：`get_or_deploy_shadow_account`，然后 `shadow_account.execute(calls)`（`#L332-L337`[1]）。
6. **shadow → DeFi**：OZ `execute_calls(calls.span())`，此时 caller 是 shadow 地址（`shadow_account.cairo#L51-L54`[2]）。
- **Primer 两步法**：Primer 是一个“只为拥有固定 class hash 而存在”的合约，class hash 固定为 `0x00123e6b…d300`。构造时记下 deployer，`set_class_hash` 只允许 deployer 调用，执行 `replace_class_syscall`（`primer/src/primer/primer.cairo#L19-L30`、`primer/README.md#L3-L13`[3]）。anonymizer 依次 `deploy_syscall(PRIMER_CLASS_HASH, salt = identity_commitment)` → `set_class_hash(shadow_account_class_hash)` → `initialize()`（它把 owner 设为 caller，也就是 anonymizer），最后写入 registry 并发出 `ShadowAccountDeployed` 事件（`#L412-L433`[1]，`shadow_account.cairo#L56-L59`[2]）。这样地址只依赖 Primer 的 class hash，shadow account 的 class 升级不会让地址漂移（`#L48-L55`、`#L406-L411`[1]）。
- **`account_factory.cairo` 与 shadow 无关**：它用同样的 Primer 模式部署 **Eth712 账户**（salt = eth_address），地址公式在 `utils.cairo#L44-L73`（Pedersen，前缀 `STARKNET_CONTRACT_ADDRESS`）[3]。anonymizer 只复用了其中的 `IPrimerDispatcher` 接口（`#L232`[1]）。
- **收回模式**：枚举 `CollectPolicy { All, Diff, Exact(u128) }`（`#L35-L42`）。收回时先 `shadow.execute([transfer → anonymizer])`，再由 anonymizer `approve(pool)`。pool 用 `transfer_from(anonymizer)` 把资金存入 open note（`#L439-L477`[1]，`privacy.cairo#L1039-L1068`[4]）。合约层面每个 note 可以有自己的策略，但 SDK 和 Wallet API 对一次 invoke 只用一个策略（“One policy applies to every open note settled by the action”）[8][11]。
- **对 calls 没有限制**：`calls: Array<Call>` 原样传给 `execute`，anonymizer 不检查目标地址或 selector（`#L323-L345`[1]）。
- **能否升级**：shadow 的 `upgrade` 只允许 owner 调用（`shadow_account.cairo#L71-L78`[2]）。但 anonymizer 没有把 upgrade 暴露给用户的路径：用户 calls 若以 shadow 自己为目标，caller 是 shadow 本身而不是 owner，因此会失败（inferred）。anonymizer 本身由治理角色通过 Replaceability 组件替换实现；构造函数里 `upgrade_delay: Zero::zero()`（`#L312`[1]），链上 `get_upgrade_delay()` 也返回 0[18]。
- **链上 ABI 对照**：class `0x70e76435…` 的 ABI 只有 `execute, initialize, owner, upgrade, constructor`；Primer class `0x00123e6b…` 只有 `set_class_hash, constructor`；anonymizer class `0xb61dee4f…` 有 `privacy_compute, privacy_invoke_with_computation, get_shadow_accounts, get_shadow_account, get_privacy_contract, get_shadow_account_class_hash`，再加 replaceability 和 roles 系列函数[18]。

**不确定之处**
- 治理多签或角色持有人是谁、`add_new_implementation` 的历史记录，都没有查（属于开放问题）。
- `execute_calls` 使用的 OZ 版本没有逐行核对（`openzeppelin::utils::execution`）。

## W-Q3 身份与地址派生

**答案**：真实公式如下（Poseidon 都是 sponge 式的 `poseidon_hash_span`，不是两元素 `hades` 哈希）：
- `identity_key = Poseidon('IDENTITY_KEY_TAG:V1', user_addr, user_private_key, anonymizer_addr)`（`hashes.cairo#L56-L61`[5]）。
- `partial = Poseidon(identity_key, dapp_name)`；`commitment = Poseidon(partial, nonce)`（`shadow_account_anonymizer.cairo#L57-L67`[1]）。
- `address = Pedersen 合约地址公式(salt = commitment, class_hash = PRIMER_CLASS_HASH, calldata = [], deployer = anonymizer)`（`#L372-L377`、`#L418-L424`[1]）。

其中 `user_private_key` 是用户的 STRK20 隐私私钥，SDK 里叫 `viewingKey`。它的公钥在 `SetViewingKey` 时被 write-once 写到链上，私钥同时用 ECDH 加密给 auditor（`privacy.cairo#L319-L357`[4]，`shadow-account-address.ts#L17-L31`[8]）。

**依据**
- 文档原文：“For offline derivation, use the Privacy SDK's `shadowAccountAddress` helper. The current anonymizer implementation uses the fixed `PRIMER_CLASS_HASH`; do not substitute the value returned by `get_shadow_account_class_hash`, because that is the class installed after the deterministic address is chosen.”[11]
- 链上复算（命令见后文）：用 `get_shadow_accounts(partial=0x1234, 0, 2, false)` 拿到的未部署地址 `0x24c6b6eb…` 和 `0x5ef3d27a…`，与本地用 `computePoseidonHashOnElements` 加 PRIMER_CLASS_HASH 复算的结果完全一致[18]。
- 173 个已部署的 shadow account 中，**172 个**的地址可以用 PRIMER_CLASS_HASH 复算出来；**1 个**（首个，区块 14,514,661，2026-09-07）只能用运行时 class `0x70e76435…` 复算。也就是说，当时 mainnet 的 anonymizer 还没有采用 primer 模式，后来才升级。首个 primer 方式的部署在区块 15,409,867（2026-09-25 06:59:32 UTC）[18]。
- starknet.js WalletAccount 指南（访问于 2026-10-14）仍然写 “Do not hardcode the class hash … `get_shadow_account_class_hash()` … `hash.calculateContractAddressFromHash(commitment, shadowAccountClassHash, [], ANONYMIZER_ADDRESS)`”。这与当前合约实现和 strk20 文档矛盾，是**过时**写法[13]。
- 与 PQ 路线的关系：地址派生走 Pedersen（Stark 曲线上的哈希）合约地址公式；identity 和 commitment 用的是 Poseidon。地址公式由协议规定，不由 anonymizer 决定（详见 crypto 那一路）。

**不确定之处**
- `dapp_name` 是 felt；SDK 会把字符串编码成 Cairo short string（`shadow-accounts.ts#L18-L23`[8]）。钱包是否把 `dapp_name` 与 dapp 的 origin 绑定，没有查到（开放问题）。

## W-Q4 一次 DeFi 操作的生命周期（以 Vesu vault 存入为例）

**答案**：链上只有**一笔**交易：relayer 调用 `pool.apply_actions`。在这笔交易里，pool 先 `TransferTo` 把资产转给 shadow 地址，然后调用 anonymizer；anonymizer 在需要时先部署 shadow account，再让 shadow 执行 approve 和 deposit。vault shares 留在 shadow 上。退出时再发一笔类似的交易，让 shadow 执行 redeem，并用 open note（Diff 或 All）把底层资产收回 shielded balance。

**依据（逐步）**
1. （链下）dapp 调用 `strk20ShadowAccountCommitment("myDapp")` 拿到 partial commitment（“No transaction is sent and the dapp never receives the viewing key”）。需要提前知道地址时，再用 `get_shadow_accounts(partial, start, end, until_undeployed)` 查询[11][1]。
2. （钱包）组装 actions：`withdraw(token, amount, recipient = shadow 地址)`；需要回收时再加 `transfer(amount: "OPEN")` 创建 open note；最后是 `shadow_account_invoke(dapp_name, nonce, calls, collect_policy)`[11]。SDK 把它编译成 `ComputeAndInvoke`：`computeAdditionalData = [dappName, nonce]`，`invokeAdditionalData = (calls, open_notes)`（`shadow-accounts.ts#L42-L76`[8]）。phase 顺序固定为 `WITHDRAW_PHASE = 6`，然后 `INVOKE_PHASE = 7`（`actions.cairo#L277-L299`[6]）。
3. （钱包本地 / prover）在 virtual OS 里执行 pool 的 `__execute__`：花费 notes、计算 identity_key 和 commitment、检查用户账户签名，生成带 `proof_facts` 的证明（[4] 第 2 节各行）。
4. （链上交易）relayer 发起 INVOKE v3 → `pool.apply_actions`。实例：首个部署交易 `0x30fd66b8…` 的 calldata 调用 pool，selector 为 `apply_actions`（`0x246333a7…`）[18]。pool 依次执行：nullifier 写入 → `TransferTo(shadow, amount)`，并发出 `Withdrawal{enc_user_addr, to_addr, token, amount}` 事件（`privacy.cairo#L507-L530`）→ `InvokeWithComputation` → anonymizer → deploy（首次）→ `shadow.execute([approve, vault.deposit])`，shares 记在 shadow 名下。
5. （回收，可选）anonymizer 按策略从 shadow 把代币转给自己，然后 approve pool，并返回 `(deposits, [shadow 地址])`。mainnet 上 pool 对 anonymizer 的 screening 策略是 `Delegated`（链上返回 `0x2`），所以这次需要 screener 对 **shadow 地址**出具签名证明（attestation）（`privacy.cairo#L1009-L1027`[4]，README[1]，[18]）。最后 pool 执行 `transfer_from(anonymizer)` 存入 open note，发出 `OpenNoteDeposited{depositor, token, note_id, amount}` 事件。
6. 退出：官方文档原文为 “withdrawals return to the wallet's shielded balance”[11]。具体的 redeem 调用序列来自文档描述，我没有读 demo 源码。
- **专用 anonymizer 与 shadow 的差别**：`VesuLendingAnonymizer.privacy_invoke` 是无状态的一次性调用。它自己 deposit 或 redeem，测量余额差，`approve(get_caller_address())`，然后返回 open note deposit。vTokens 会**回到 pool 变成 shielded note**，不在任何持久地址上停留（`vesu_lending_anonymizer.cairo#L116-L165`[10]）。Ekubo 的版本同样是单跳 swap，只返回一个 open note[10]。这两个合约都没有 caller 检查，也没有 per-user 身份。Shadow 则给出持久的 per-identity 合约地址，适合无法代币化、必须由某个地址长期持有的仓位（借贷、质押等）[12]。Wallet API 规定 “`invoke` and `shadow_account_invoke` are mutually exclusive in the same transaction”[11]。
- 部署状态：官方 docs.starknet.io 说 Vesu helper “is deployed on mainnet as a reference invoke helper”（`0x028b49bc…`）[14]；合约地址页却说 starknet-privacy 仓库“does not currently publish canonical Mainnet or Sepolia deployment addresses” for Ekubo/Vesu anonymizers[12]。两处表述不一致，照实记录。

**不确定之处**
- 一笔 shadow 调用的 gas 和费用没有测量。
- demo 合约的具体 calls 没有读源码核对。

## W-Q5 检验“Shadow Account 很像 private sub account”

**答案**：产品层面，这个判断和 StarkWare 自己最初的命名一致（SubAccount → ShadowAccount）[9][15][16]。工程层面有四点不同：它**没有密钥、不能签名**；**不是**协议意义上的账户（不能发起交易、不能付费、不能做 `is_valid_signature`）；控制权来自“pool 已验证的证明”（证明内部检查主账户签名），而不是主钱包直接调用；它**只隐藏关联，不隐藏内容**。

**相似之处**
- 每个 dapp 一个持久子身份，可以用 nonce 再分出多个[1][11]。
- 只有主钱包持有人能驱动它：需要 `user_private_key`（用于 identity_key）和主账户签名两者同时具备[4][5][7]。

**不同之处**
- 链上 ABI 没有 `__validate__` / `__execute__` / `is_valid_signature`[2][18]，因此不能签 SNIP-12 消息、不能参与 permit 或链下订单类协议，也不能自己发起交易（后两点是 inferred）。
- 主钱包**不能**直接调用 shadow：owner 是 anonymizer，不是主钱包（链上 `owner()` 返回 anonymizer）[18]。
- 身份绑定在 `anonymizer_addr` 和不可轮换的隐私密钥上：viewing key 是 “immutable once set (enforced via WriteOnce)”（`actions.cairo#L248`[6]）。所以轮换隐私密钥或换一个 anonymizer 地址，都会得到另一组 shadow（inferred）。
- 信任面：anonymizer 可由治理以 0 延迟替换实现[1][18]，而 anonymizer 是所有 shadow 的唯一 owner（inferred：治理可以影响全部 shadow 资产）。

**更精确的定义**：“由 STRK20 privacy pool 证明授权、由 `ShadowAccountAnonymizer` 独占 owner 的、以 `Poseidon(Poseidon(identity_key, dapp_name), nonce)` 为部署 salt 的**无密钥公开化名代理合约**（pool-controlled pseudonymous proxy）。”

## W-Q6 隐私边界

**答案**：对公众可见的有：shadow 的余额、调用、仓位，资金进出 pool 的 token、金额和时间，“这是一个 shadow account”这一事实（通过事件和 owner），以及 commitment。对 dapp 可见的还有 partial commitment，dapp 可以据此枚举同一用户在该 dapp_name 下的全部 nonce。对 auditor 来说，它能解密用户隐私私钥，因此**能重算全部 shadow 关联**（inferred）。`dapp_name` 只是命名空间，不是 ACL。

**依据**
- 内容公开：“The shadow account itself is public: its ERC-20 balances, calls, and protocol positions are visible onchain.”[11]
- 资金进出可见：`Withdrawal` 事件含明文 `to_addr / token / amount`（`privacy.cairo#L525-L529`）；`OpenNoteDeposited` 事件含 `amount`（`#L1068`）[4]。官方限制里也写了 “Deposit/withdraw heuristics — distinctive amounts or immediate in/out weaken privacy”[14]。
- shadow 身份本身可识别：任何人都能从 `ShadowAccountDeployed{identity_commitment, shadow_account}` 事件枚举全部 shadow（mainnet 已有 173 个）[1][18]。
- partial commitment 的暴露范围：Wallet API 把它交给 dapp。starknet.js 原文是 “the partial commitment, which lets a DAPP recognize all the shadow accounts of a user without learning any individual nonce”[13]。合约的 `get_shadow_accounts` 视图每次最多扫描 1024 个 nonce（`MAX_SCAN_RANGE`，`#L44-L46`）[1]。partial commitment 本身不上链：`privacy_compute` 在证明内执行，链上只有 commitment[4]。
- dapp_name 不是 ACL：它只进入哈希（`#L57-L60`），calls 不受限制（`#L323-L345`）[1]。
- auditor：“Can decrypt registered users' viewing keys when authorized; cannot sign spends.”[14] `set_viewing_key` 用 auditor 公钥加密 `user_private_key`（`privacy.cairo#L331-L336`）[4]。由此推出：auditor 掌握 user_addr 和私钥后，可以对任意 dapp_name 与 nonce 重算 commitment，再与链上事件比对（inferred）。但 auditor 无法驱动 shadow，因为那需要主账户签名[7][14]（inferred）。
- 量子与密钥泄露（inferred）：pool 公开存储 `public_key: Map<user_addr, felt252>`，公钥是 Stark 曲线点 `GEN_P * sk` 的 x 坐标（`utils.cairo#L264-L267`，`privacy.cairo#L106`、`interface.cairo#L702`）[4][7]。量子攻击者解离散对数就能得到 sk。dapp_name 是可枚举的 short string，nonce 通常很小，链上又有全部 commitment 可供比对。所以 sk 一旦泄露或被量子恢复，**历史上**所有 shadow 关联都会被事后重建，而且因为 viewing key 是 write-once，无法通过轮换补救。
- screener：Delegated 策略下，screener 签名所针对的是 shadow 地址[1][4][18]。screener 看到 shadow 地址，但看不到 user。

**不确定之处**
- 钱包是否限制 dapp 只能请求与自身 origin 绑定的 dapp_name。如果不限制，dapp B 可以请求 “A” 的 partial commitment，从而关联用户在 A 上的活动（speculative）。
- relayer / paymaster 可见的元数据（IP 等）由别的路负责。

---

## 图的素材

**A. 授权链（参与者与调用顺序）**
1. 用户钱包（持有主账户签名密钥和 STRK20 隐私私钥 sk）在本地 virtual OS 中执行 `Pool.__execute__`（caller = 0，tx v3）[4][7]。
2. `compile_actions` → `main` → `compute_and_invoke`：`identity_key = Poseidon(TAG, user_addr, sk, anonymizer)` → 调 `anonymizer.privacy_compute(identity_key, dapp_name, nonce)` → 得到 commitment[4][5][1]。
3. `assert_valid_signature(user_addr)`：调用主账户的 `is_custom_signature_valid` 或 `is_valid_signature`[7]。
4. `send_message_to_l1(server_actions)` → 证明，产出 `proof_facts`[7][4]。
5. relayer 发 INVOKE v3 → `Pool.apply_actions(actions, screening)` → `validate_proof`（message hash 与 base block 新鲜度）→ `collect_fee`[4]。
6. Pool：`TransferTo(shadow)` → `call anonymizer.privacy_invoke_with_computation`（anonymizer 检查 caller == pool）[4][1]。
7. Anonymizer：首次使用时 deploy Primer(salt = commitment) → `Primer.set_class_hash`（检查 caller == deployer）→ `Shadow.initialize`（owner = anonymizer）[1][3][2]。
8. Anonymizer → `Shadow.execute(calls)`（检查 caller == owner）→ DeFi 合约（caller = shadow）[2]。
9. 回收：`Shadow.execute([transfer → anonymizer])` → anonymizer `approve(pool)` → 返回 `(deposits, [shadow])` → Pool 做 screening（Delegated：针对 shadow）→ `transfer_from(anonymizer)` 存入 open note[1][4]。

**B. Shadow 地址的状态与转移**
- 未部署：地址可预测，可以先接收资金（“Deployment is lazy: the address can receive funds before the first shadow_account_invoke deploys it”[11]）。
- 首次 invoke：Primer → replace_class → initialize，进入已部署状态（owner = anonymizer）[1]。
- 已部署：执行 `execute`；anonymizer 若被治理替换，可能走 `upgrade`（EIC）路径[2]。

**C. 对比维度（private sub-account 印象 vs 实际）**：密钥 / 签名、能否发交易、控制者、可见内容、可关联性、可轮换性、信任方（anonymizer 治理、auditor、screener）。依据见 W-Q5、W-Q6。

**D. 时间线**：2026-07-15 博客“not live yet”[15] → 07-22 SDK RC.4[17] → 08-12 RC.5 改名[9][17] → 09-07 mainnet 首个部署（无 primer）[18] → 09-10 types-js 0.10.4 改名[16] → 09-15 SDK RC.8[17] → 09-25 首个 primer 方式部署[18] → 09-29 地址页核对与 demo 仓库[12][19] → 10-13 前后（用户背景，未核实）→ 10-14 共 173 个部署[18]。

**E. 一次性 anonymizer 与 shadow 的对比**：持久状态（无 / 每身份一个合约）、仓位归属（pool 里的 shielded note / 公开的 shadow 地址）、caller 检查（Vesu/Ekubo 没有 / shadow anonymizer 有）、selector（`privacy_invoke` / `privacy_compute` + `privacy_invoke_with_computation`）[10][1]。

## 代码素材

**1. ShadowAccount：唯一入口与 owner 检查**（`starkware-starknet-utils/packages/accounts/src/shadow_account.cairo#L44-L59@3e2fd53d`，以及 `#L83-L85`）
```cairo
#[constructor]
fn constructor(ref self: ContractState) {
    self.owner.write(get_caller_address());
}
fn execute(ref self: ContractState, calls: Array<Call>) -> Array<Span<felt252>> {
    self.assert_only_owner();
    execute_calls(calls.span())
}
fn initialize(ref self: ContractState) {
    assert(self.owner.read().is_zero(), 'SHADOW_ACCOUNT: INITIALIZED');
    self.owner.write(get_caller_address());
}
// L83-85
fn assert_only_owner(self: @ContractState) {
    assert(get_caller_address() == self.owner(), 'SHADOW_ACCOUNT: NOT OWNER');
}
```
https://github.com/starkware-libs/starkware-starknet-utils/blob/3e2fd53d99e16c87f6cf2ced53b8c842a2d54a18/packages/accounts/src/shadow_account.cairo#L44-L59

**2. Anonymizer 入口**（`starknet-privacy/packages/shadow_account_anonymizer/src/shadow_account_anonymizer.cairo#L323-L345@f9256c5e`）
```cairo
fn privacy_invoke_with_computation(
    ref self: ContractState, identity_commitment: IdentityCommitment,
    calls: Array<Call>, open_notes: Span<OpenNote>,
) -> (Span<OpenNoteDeposit>, Span<ContractAddress>) {
    assert(get_caller_address() == self.privacy_contract.read(), errors::UNAUTHORIZED_CALLER);
    let shadow_account = self.get_or_deploy_shadow_account(:identity_commitment);
    let note_balance_snapshots = snapshot_open_notes(
        shadow_account: shadow_account.contract_address, :open_notes,
    );
    shadow_account.execute(calls);
    let deposits = self.collect_open_notes(:shadow_account, :note_balance_snapshots);
    ...
}
```
https://github.com/starkware-libs/starknet-privacy/blob/f9256c5e37682d37437e69a795ddd51d924c9b97/packages/shadow_account_anonymizer/src/shadow_account_anonymizer.cairo#L323-L345

**3. 身份派生**（`hashes.cairo#L56-L61` 与 `shadow_account_anonymizer.cairo#L57-L67@f9256c5e`）
```cairo
/// Returns `h(IDENTITY_KEY_TAG, user_addr, user_private_key, contract_address)`.
pub(crate) fn compute_identity_key(
    user_addr: ContractAddress, user_private_key: felt252, contract_address: ContractAddress,
) -> felt252 {
    hash([IDENTITY_KEY_TAG, user_addr.into(), user_private_key, contract_address.into()].span())
}
pub fn partial_commitment(identity_key: felt252, dapp_name: felt252) -> PartialCommitment {
    PoseidonTrait::new().update(identity_key).update(dapp_name).finalize()
}
pub fn commitment_from_partial(partial_commitment: PartialCommitment, nonce: felt252) -> IdentityCommitment {
    PoseidonTrait::new().update(partial_commitment).update(nonce).finalize()
}
```

**4. Primer 部署**（`shadow_account_anonymizer.cairo#L418-L431@f9256c5e`）
```cairo
let (shadow_account, _) = deploy_syscall(
    class_hash: PRIMER_CLASS_HASH,
    contract_address_salt: identity_commitment,
    calldata: array![].span(),
    deploy_from_zero: false,
).unwrap_syscall();
assert(shadow_account.is_non_zero(), errors::ZERO_ADDRESS);
IPrimerDispatcher { contract_address: shadow_account }
    .set_class_hash(new_class_hash: self.shadow_account_class_hash.read());
IShadowAccountDispatcher { contract_address: shadow_account }.initialize();
self.shadow_accounts.write(identity_commitment, shadow_account);
self.emit(ShadowAccountDeployed { identity_commitment, shadow_account });
```

**5. 收回策略**（`shadow_account_anonymizer.cairo#L454-L463@f9256c5e`）
```cairo
let collected = match collect_policy {
    CollectPolicy::All => balance,
    CollectPolicy::Diff => balance.checked_sub(pre_balance).expect(errors::NEGATIVE_DIFF),
    CollectPolicy::Exact(exact) => {
        assert(balance >= exact.into(), errors::INSUFFICIENT_BALANCE);
        exact.into()
    },
};
```

**6. pool 内的私有计算**（`starknet-privacy/packages/privacy/src/privacy.cairo#L557-L570@f9256c5e`）
```cairo
let identity_key = compute_identity_key(:user_addr, :user_private_key, :contract_address);
let mut compute_calldata = array![identity_key];
compute_calldata.append_span(compute_additional_data);
let compute_result = call_contract_syscall(
    address: contract_address,
    entry_point_selector: PRIVACY_COMPUTE_SELECTOR,
    calldata: compute_calldata.span(),
).unwrap_or_else(|panic_data| propagate_external_panic(panic_data.span()));
assert(!compute_result.is_empty(), errors::EMPTY_COMPUTE_RESULT);
```

## 外部调研 / 用户资料中被修正或无法核实的地方

1. **GPT §4.2 “owner 是 ShadowAccountAnonymizer”**：正确。源码 `initialize` 把 owner 设为 caller[2]；链上 `owner()` 也返回 anonymizer[18]。但 GPT 给的链接是 `main` 分支的 raw URL，没有固定 commit，本文已改为 commit 引用。
2. **GPT §4.3 公式 `I = H(U, k_view, A)`**：不够精确。实际公式带域分隔标签 `'IDENTITY_KEY_TAG:V1'`，用 Poseidon sponge；`k_view` 实际上是用户的 STRK20 隐私私钥，也就是同时用于 nullifier 和 note 所有权的那把 `user_private_key`，并非单独的只读 viewing secret[4][5]。这把 key 还加密给了 auditor，GPT 没有提到 auditor 能重算关联。
3. **GPT §4.3 “确定性地址按 PRIMER_CLASS_HASH 计算”**：对当前实现成立[1][11]，但**对链上历史不完全成立**：mainnet 首个 shadow（2026-09-07）是按运行时 class 部署的[18]。另外 starknet.js 官方指南仍然教人用 `get_shadow_account_class_hash` 派生地址，与合约和 strk20 文档矛盾，属于过时内容[13]。
4. **GPT §4.4 “回收三种模式”**：正确（All / Diff / Exact）[1]。需要补充：合约允许每个 note 用不同策略，SDK 和 Wallet API 则一次只用一个策略[8][11]。GPT 还把这一点引到 strk20 文档上，而实际依据是源码。
5. **GPT §4.4 “Privacy Pool 把资产转到 Shadow Account”**：正确，但机制是用户自己声明的 `Withdraw(recipient = shadow)`。它会公开发出 `Withdrawal` 事件，带 to_addr 和 amount；不是 anonymizer 自动拨款[4][11]。
6. **GPT §4.5 “dapp_name 不是 ACL”**：源码支持这一结论（任意 `Array<Call>`，dapp_name 只进入哈希）[1]。性质上属于 inferred。
7. **GPT §4.5 “partial commitment 可按 nonce 查询”**：正确，`get_shadow_accounts` 每次最多 1024 个 nonce[1][11]。partial commitment 由钱包交给 dapp[13]。
8. **GPT §4.1 “官方 Vesu 演示”**：演示存在，但是在个人账号 `starkience` 下，自述为 “Educational example, not audited production software”，不是 Vesu 官方集成[11][19]。
9. **GPT §6.2 “viewing secret 被恢复即可重算 Shadow 地址”**：推理方向正确；补充一点：链上公开存储了 `user_addr → public_key`，dapp_name 可枚举，而且 key 是 write-once 无法轮换[4][6]，所以风险可以覆盖到全部历史。
10. **用户背景 “2026-10-13 前后推出 Shadow Accounts”**：找不到一手发布来源。mainnet 部署从 2026-09-07 就开始，SDK 和 Wallet API 在 9 月中旬已发布[16][17][18]。10-13 最多是推广节点，标为未核实。
11. **用户判断 “像 private sub account”**：方向正确。官方在 2026-07 到 2026-08 期间就使用 “private sub-accounts / SubAccount”[9][15]；工程差异见 W-Q5。
12. **docs.starknet.io 与地址页对 Vesu helper 的部署状态说法不一致**：照实记录[12][14]。
13. **审计**：`docs/audit/README.md` 中唯一一份审计是 OpenZeppelin 2026-05-29 对 commit `c5e2fb5` 的 “Privacy contracts (V1)”。用 pdftotext 抽取审计 PDF 正文（3142 词），没有命中 shadow、anonymizer、privacy_compute 等词[20]。我没有找到覆盖 shadow / anonymizer 的公开审计。

## 来源

1. **PRIMARY** starkware-libs/starknet-privacy `packages/shadow_account_anonymizer/src/shadow_account_anonymizer.cairo` 与 `README.md` @f9256c5e — https://github.com/starkware-libs/starknet-privacy/blob/f9256c5e37682d37437e69a795ddd51d924c9b97/packages/shadow_account_anonymizer/src/shadow_account_anonymizer.cairo 。证明 anonymizer 的入口、caller 检查、commitment 公式、Primer 部署、收回策略、nonce 扫描。
2. **PRIMARY** starkware-libs/starkware-starknet-utils `packages/accounts/src/shadow_account.cairo` @3e2fd53d — https://github.com/starkware-libs/starkware-starknet-utils/blob/3e2fd53d99e16c87f6cf2ced53b8c842a2d54a18/packages/accounts/src/shadow_account.cairo 。证明 ShadowAccount 的存储、入口、owner 检查、可升级性，以及它没有签名逻辑。
3. **PRIMARY** starkware-starknet-utils `packages/primer/README.md`、`packages/primer/src/primer/primer.cairo`、`packages/accounts/src/utils.cairo`、`account_factory.cairo` @3e2fd53d。证明 Primer 的用途、固定 class hash、Pedersen 地址公式，以及 factory 面向 Eth712 账户。
4. **PRIMARY** starknet-privacy `packages/privacy/src/privacy.cairo` @f9256c5e。证明 `__execute__` 与签名检查的顺序、`compute_and_invoke`、`apply_actions` 与证明验证、screening、open note 存入、`set_viewing_key` 把私钥加密给 auditor。
5. **PRIMARY** starknet-privacy `packages/privacy/src/hashes.cairo#L38-L61` @f9256c5e。证明 identity_key 的公式与域标签。
6. **PRIMARY** starknet-privacy `packages/privacy/src/actions.cairo#L221-L299` @f9256c5e。证明 ComputeAndInvoke 的输入、phase 顺序、viewing key 为 write-once。
7. **PRIMARY** starknet-privacy `packages/privacy/src/utils.cairo`（`#L264-L267`、`#L385-L420`、`#L439-L447`、`#L552-L598`）@f9256c5e。证明三种签名检查方式、OS 调用检查、L1 消息、公钥派生。
8. **PRIMARY** starknet-privacy `sdk/src/internal/shadow-account-address.ts`、`shadow-accounts.ts` @f9256c5e。证明 SDK 的离线派生、`viewingKey` 命名、单一 collect policy。
9. **PRIMARY** starknet-privacy `sdk/CHANGELOG.md`（0.14.3-RC.5 一节）@f9256c5e。证明 SubAccount 改名为 ShadowAccount，以及旧事件 key 的说明。
10. **PRIMARY** starknet-privacy `packages/vesu_lending_anonymizer/src/vesu_lending_anonymizer.cairo#L116-L165`、`ekubo_swap_anonymizer/README.md` @f9256c5e。证明专用 anonymizer 无状态、无 caller 检查、输出回 pool。
11. **PRIMARY**（官方域名，内容为 STRK20 by Example）https://strk20.starknet.io/docs/starknet-wallet-api/shadow-accounts ，访问于 2026-10-14。证明官方定义、隐私边界原文、Wallet API 流程、PRIMER_CLASS_HASH 警告、Vesu demo。
12. https://strk20-by-example.org/llms-full.txt （含 contract-addresses 页、概览）以及 https://strk20.starknet.io/llms.txt ，访问于 2026-10-14。证明 mainnet 和 Sepolia 的 anonymizer 地址、适用场景原文、SDK 与 Wallet API 版本状态。属于半官方（strk20.starknet.io 索引指向它）。
13. **PRIMARY**（库文档）https://starknet-js.com/docs/guides/account/walletAccount/ ，访问于 2026-10-14。证明 partial commitment 的语义、anonymizer 地址；同时证明它的地址派生写法已过时。
14. **PRIMARY** https://docs.starknet.io/build/starknet-privacy/security.md 与 https://docs.starknet.io/build/starknet-privacy/anonymous-defi.md ，访问于 2026-10-14。证明 auditor 能解密 viewing key、金额与进出启发式的限制、Vesu helper 的部署表述。docs.starknet.io 的 llms.txt 里没有 shadow 页面。
15. **PRIMARY** https://www.starknet.io/blog/push-to-private/ （datePublished 2026-07-15），访问于 2026-10-14。证明当时的官方名称是 “private sub-accounts”、状态为 “Not live yet”，以及适用场景原文。
16. **PRIMARY** https://github.com/starknet-io/types-js/releases/tag/v0.10.4 （2026-09-10），访问于 2026-10-14。证明 Wallet API 中 sub-accounts 改名为 shadow accounts。
17. **PRIMARY** GitHub API `repos/starkware-libs/starknet-privacy/releases`，访问于 2026-10-14。证明 SDK RC.4、RC.5、RC.8 的发布时间。
18. **PRIMARY**（链上）Starknet mainnet RPC 查询（api.cartridge.gg、starknet-rpc.publicnode.com），2026-10-14。证明 anonymizer 的 class 与 ABI、视图返回值、173 个部署事件、首个部署的时间和方式、owner、screening 策略为 Delegated、upgrade delay 为 0。
19. GitHub API `repos/starkience/shadow-account-demo`（创建于 2026-09-29）、`starkience/strk20-shadow-account-starter`（创建于 2026-08-31），访问于 2026-10-14。证明 demo 由个人账号维护及其时间点。不是一手协议来源。
20. **PRIMARY** starknet-privacy `docs/audit/README.md` 与 `Privacy V1.pdf` @f9256c5e。证明唯一审计为 OZ 2026-05-29 对 `c5e2fb5` 的审计，正文没有 shadow / anonymizer 字样。
21. GPT Deep Research `research/starknet-account-model.md` §4、§6.2。只作线索。
22. https://www.starknet.io/blog/ 与 https://starkware.co/blog/ 的列表页抓取，访问于 2026-10-14。两处都没有 shadow account 专文（只说明“没找到”，不证明不存在）。

## 命令与输出

```bash
# 依赖 commit 一致性
grep -n "starkware-starknet-utils" /tmp/sknam/starknet-privacy/Scarb.toml
# → L20-22 rev="3e2fd53d99e16c87f6cf2ced53b8c842a2d54a18"（与本地克隆 HEAD 一致）

# 链上（自写 python JSON-RPC 帮手 /tmp/sknam/shadowlane/rpcw.py；selector = keccak250(name)）
starknet_getClassHashAt(anonymizer 0x04f33230…888a7) → 0xb61dee4f9f6b243f5310fbfab4224128db5c4815077b6329c232f8fc9af409
starknet_call get_privacy_contract → 0x40337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a
starknet_call get_shadow_account_class_hash → 0x70e76435b6ddb74b11665d3bc3264aaf354f59329976f3ffcb03b2ab992b78f
starknet_call get_upgrade_delay → 0x0
pool.get_open_note_screening_policy(anonymizer) → 0x2 (= Delegated)
getClass ABI: 0x70e7… → [execute, initialize, owner, upgrade, constructor]; 0x00123e6b… → [set_class_hash, constructor]
starknet_getEvents(ShadowAccountDeployed, from 14,400,000) → 173 events; first block 14514661 (2026-09-07 17:07:38 UTC, tx 0x30fd66b8…), last 16354630 (2026-10-14 05:51:53 UTC)
block at 2026-10-13 00:00 UTC+8 = 16279293 → before 124 / after 49
first shadow 0x14a5f75b…e263: class 0x70e7…, owner() = anonymizer; recent 0x69b72663…a77: class 0x70e7…, owner() = anonymizer
get_shadow_accounts(0x1234, 0, 2, false) → [(0, 0x24c6b6eb…c811, 0), (1, 0x5ef3d27a…b31b, 0)]

# 本地复算（npm i starknet@10.8.0 于 /tmp/sknam/shadowlane）
calculateContractAddressFromHash(commitment, PRIMER, [], anonymizer) 对 173 事件：primer 172 / runtime 1 / other 0；首个 primer 式部署 block 15409867 (2026-09-25 06:59:32 UTC)
computePoseidonHashOnElements([0x1234, n]) + PRIMER → 与上面 get_shadow_accounts 结果一致

pdftotext "docs/audit/Privacy V1.pdf" - | wc -w → 3142；grep -ci "shadow|anonymizer" → 0
```

## 开放问题

1. 2026-10-13 的“推出”具体指什么：钱包上线、X 推文，还是 demo 推广？需要能抓到 X 的工具，或者钱包（Ready / Xverse）的公告。
2. 钱包是否把 `dapp_name` 与 dapp 的 origin 绑定？如果不绑定，跨 dapp 的关联风险会显著上升。
3. anonymizer 的 upgrade governor 和 upgrader 角色由谁持有（多签？），实现替换的历史记录，以及 2026-09-07 到 2026-09-25 之间的那次升级。
4. 是否存在旧事件名 `SubAccountDeployed` 的 mainnet 事件（区块 14.4M 之前未扫完）。
5. 一次 shadow 调用的 L2 gas 与费用（pool 的 `fee_amount` 加上 relayer 成本）。
6. shadow 不实现 SRC5 和 ERC-721 receiver，与要求合约账户签名的协议（permit、链下订单）之间的兼容性，没有逐个验证。
7. 是否有覆盖 shadow_account_anonymizer 的独立审计（当前公开的审计不覆盖）。

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| W1 | starknet-privacy@f9256c5e 引用的 starkware-starknet-utils rev 为 3e2fd53d，与本地克隆一致 | starknet-privacy/Scarb.toml#L20-L22@f9256c5e；`git log -1` 输出 [1][2] | observed | |
| W2 | 官方文档定义：shadow account 是“persistent, pseudonymous identity for one user and one dapp”，“has no keys and cannot sign” | https://strk20.starknet.io/docs/starknet-wallet-api/shadow-accounts 首段（访问于 2026-10-14）[11] | observed | |
| W3 | 官方列出的适用场景为 borrowing、staking（博客另含 swapping）；没有找到 treasuries / LP 表述 | [12] llms-full “account-based flows such as borrowing and staking”；[15] “borrowing, staking, swapping” | observed | |
| W4 | 2026-07-15 官方博客称 “private sub-accounts … Not live yet” | https://www.starknet.io/blog/push-to-private/ 正文与 datePublished [15] | observed | |
| W5 | SDK 0.14.3-RC.5（2026-08-12）把 SubAccount 改名为 ShadowAccount，旧事件 key 保留 | sdk/CHANGELOG.md RC.5 Breaking 节@f9256c5e [9]；GitHub releases API [17] | observed | |
| W6 | Wallet API types-js v0.10.4（2026-09-10）把 sub-accounts 改名为 shadow accounts | https://github.com/starknet-io/types-js/releases/tag/v0.10.4 [16] | observed | |
| W7 | mainnet 首个 ShadowAccountDeployed 事件在区块 14,514,661（2026-09-07 17:07:38 UTC）（扫描起点为区块 14.4M） | starknet_getEvents 加 getBlockWithTxHashes 输出 [18] | observed | |
| W8 | 截至 2026-10-14 05:51 UTC，mainnet 共 173 个 shadow 部署，49 个在 2026-10-13 00:00（UTC+8）之后 | starknet_getEvents 统计，分界区块 16,279,293 [18] | observed | |
| W9 | 没有找到 2026-10-13 的官方 shadow 发布文章；“10-13 推出”未核实 | starknet.io/blog 与 starkware.co/blog 列表抓取 [22]；由 W7 推出部署更早 | speculative | |
| W10 | 官方 Vesu 金库 demo 由个人账号 starkience 维护，自述 educational、not audited | [11] 原文；GitHub API starkience/shadow-account-demo created 2026-09-29 [19] | observed | |
| W11 | mainnet ShadowAccountAnonymizer 地址为 0x04f33230…888a7，其 get_privacy_contract 返回 pool 0x040337b1…e812a | [12][13] 地址表；starknet_call 输出 [18] | observed | |
| W12 | ShadowAccount 的存储只有 owner 与升级组件，不存公钥 | shadow_account.cairo#L30-L35@3e2fd53d [2] | observed | |
| W13 | ShadowAccount 的 execute 只检查 caller == owner，然后执行任意 calls | shadow_account.cairo#L51-L54、#L83-L85@3e2fd53d [2] | observed | |
| W14 | mainnet shadow class 的 ABI 只有 execute/initialize/owner/upgrade/constructor，没有 __validate__/__execute__/is_valid_signature | starknet_getClass 0x70e76435… 输出 [18]；shadow_account.cairo 全文 [2] | observed | |
| W15 | mainnet 上 shadow account 的 owner() 返回 anonymizer 地址 | starknet_call owner 于 0x14a5f75b… 与 0x69b72663… [18] | observed | |
| W16 | shadow 的 upgrade 只允许 owner，用户 calls 无法触发自身升级 | shadow_account.cairo#L71-L78@3e2fd53d [2]；由 W13 推出：自调用时 caller = shadow ≠ owner | inferred | |
| W17 | anonymizer 的 privacy_invoke_with_computation 只接受配置好的 privacy contract 调用 | shadow_account_anonymizer.cairo#L329-L331@f9256c5e [1] | observed | |
| W18 | anonymizer 对 calls 没有目标或 selector 限制（任意 Array\<Call\>） | shadow_account_anonymizer.cairo#L323-L345@f9256c5e [1] | observed | |
| W19 | dapp_name 只是身份命名空间，不是调用 ACL | 由 W18、W25 推出：dapp_name 只进入哈希，calls 不受约束 | inferred | |
| W20 | 收回策略有 All / Diff / Exact 三种，金额为 0 时 revert | shadow_account_anonymizer.cairo#L35-L42、#L454-L465@f9256c5e [1] | observed | |
| W21 | SDK 和 Wallet API 对一次 invoke 的全部 open note 只用一个 collect policy | sdk/src/internal/shadow-accounts.ts#L54-L55@f9256c5e [8]；[11] “One policy applies to every open note” | observed | |
| W22 | 部署走 Primer 三步：deploy PRIMER(salt = commitment) → set_class_hash → initialize（owner = anonymizer） | shadow_account_anonymizer.cairo#L412-L433@f9256c5e [1]；primer.cairo#L19-L30 [3] | observed | |
| W23 | PRIMER_CLASS_HASH = 0x00123e6b…d300，已在 mainnet declare，ABI 为 set_class_hash | shadow_account_anonymizer.cairo#L52-L55 [1]；primer/README.md#L3-L13 [3]；getClass 输出 [18] | observed | |
| W24 | identity_key = Poseidon('IDENTITY_KEY_TAG:V1', user_addr, user_private_key, anonymizer_addr) | hashes.cairo#L38-L61@f9256c5e [5]；privacy.cairo#L557-L559 [4] | observed | |
| W25 | partial = Poseidon(identity_key, dapp_name)；commitment = Poseidon(partial, nonce)（sponge 式） | shadow_account_anonymizer.cairo#L57-L67@f9256c5e [1]；本地复算与链上一致 [18] | observed | |
| W26 | shadow 地址 = Pedersen 合约地址公式(salt = commitment, PRIMER_CLASS_HASH, [], deployer = anonymizer) | shadow_account_anonymizer.cairo#L372-L377、#L418-L424 [1]；sdk shadow-account-address.ts#L52-L60 [8]；get_shadow_accounts 复算一致 [18] | observed | |
| W27 | 官方文档要求离线派生不要使用 get_shadow_account_class_hash 的返回值 | [11] “Resolve the address” 节原文 | observed | |
| W28 | starknet.js 指南仍教用 get_shadow_account_class_hash 派生地址，已过时 | [13] “Address of a shadow account” 节原文；与 W26、W27 矛盾 | observed | |
| W29 | mainnet 首个 shadow（2026-09-07）按运行时 class 部署，后续 172 个按 Primer 部署；首个 Primer 式部署在 2026-09-25 | 本地 calculateContractAddressFromHash 对 173 事件分类，并查询区块时间 [18] | observed | |
| W30 | user_private_key 就是 viewing key：公钥 write-once 上链，私钥加密给 auditor | privacy.cairo#L319-L357@f9256c5e [4]；actions.cairo#L248 [6]；sdk shadow-account-address.ts#L17-L31 [8] | observed | |
| W31 | privacy_compute 在 pool 的私有执行中调用，partial commitment 和 identity_key 不上链，链上只有 commitment | privacy.cairo#L547-L582@f9256c5e [4]；ShadowAccountDeployed 事件 key [1] | observed | |
| W32 | 授权链：主账户签名在 pool 的 __execute__（virtual OS，caller = 0）内校验，之后才发出 server actions 消息 | privacy.cairo#L195-L214 [4]；utils.cairo#L385-L420、#L575-L582@f9256c5e [7] | observed | |
| W33 | apply_actions 验证 proof_facts（VIRTUAL_SNOS、base block 新鲜度、message hash） | privacy.cairo#L808-L843@f9256c5e [4] | observed | |
| W34 | mainnet 部署 shadow 的交易是 relayer 账户的 INVOKE v3，调用 pool.apply_actions | tx 0x30fd66b8… calldata 中的 selector 0x246333a7… = sel('apply_actions') [18] | observed | |
| W35 | 资产经用户声明的 Withdraw(recipient = shadow) 由 pool 转给 shadow，Withdraw phase(6) 先于 Invoke phase(7) | actions.cairo#L277-L299 [6]；privacy.cairo#L507-L530 [4]；[11] 流程第 1 步 | observed | |
| W36 | Withdrawal 事件公开 to_addr、token、amount（只有 user_addr 加密） | privacy.cairo#L525-L529@f9256c5e [4] | observed | |
| W37 | 回收时 anonymizer 先让 shadow 转账给自己，再 approve pool，pool 用 transfer_from 存入 open note | shadow_account_anonymizer.cairo#L439-L477 [1]；privacy.cairo#L1039-L1068@f9256c5e [4] | observed | |
| W38 | mainnet pool 对 anonymizer 的 screening 策略为 Delegated，被筛查的是 shadow 地址 | get_open_note_screening_policy 返回 0x2 [18]；objects.cairo#L116-L124、privacy.cairo#L1015-L1026 [4]；README [1] | observed | |
| W39 | 一次 Vesu 存入中 vault shares 留在 shadow 上，退出回到 shielded balance | [11] Vault Demo 原文；由 W13、W37 推出机制可行 | observed | |
| W40 | 专用 Vesu/Ekubo anonymizer 无状态、没有 caller 检查，输出回 pool 成为 note，没有持久身份 | vesu_lending_anonymizer.cairo#L116-L165@f9256c5e；ekubo README [10] | observed | |
| W41 | 同一交易内 invoke 与 shadow_account_invoke 互斥 | [11] “Things to notice”；actions.cairo#L297-L298 共用 INVOKE_PHASE [6] | observed | |
| W42 | shadow 内容公开（余额、调用、仓位），只隐藏与主钱包的关联 | [11] “What is private” 原文；[12] | observed | |
| W43 | 任何人都能从 ShadowAccountDeployed 事件枚举全部 shadow 地址及其 commitment | shadow_account_anonymizer.cairo#L278-L286、#L431 [1]；173 事件查询 [18] | observed | |
| W44 | 拿到 partial commitment 的 dapp 可以枚举并关联同一用户在该 dapp_name 下的全部 nonce（单次最多 1024） | [13] partial commitment 原文；get_shadow_accounts#L347-L382、MAX_SCAN_RANGE#L46 [1] | observed | |
| W45 | auditor 可以重算任意用户的全部 shadow 关联（但无法驱动 shadow） | 由 W24、W30、W32 推出：auditor 能解密 sk，又知道 user_addr，但没有主账户签名；[14] auditor 一行 | inferred | |
| W46 | sk 被泄露或被量子恢复后，历史 shadow 关联可被事后重建，且无法通过轮换补救 | 由 W24、W25、W30、W43 推出：公钥 = Stark 曲线点 x 坐标（utils.cairo#L264-L267 [7]），dapp_name 可枚举，key 为 write-once | inferred | |
| W47 | “像 private sub account” 与官方早期命名一致 | 由 W4、W5、W6 推出：官方曾用 private sub-accounts / SubAccount | inferred | |
| W48 | shadow 不能签 SNIP-12 或参与需要账户签名的协议，也不能自己发交易 | 由 W14 推出：没有 is_valid_signature 与 __validate__/__execute__ | inferred | |
| W49 | anonymizer 由治理以 0 延迟替换实现，因此治理对全部 shadow 资产有潜在控制力 | shadow_account_anonymizer.cairo#L312 [1]；链上 get_upgrade_delay = 0 [18]；由 W15 推出控制力 | inferred | |
| W50 | 换 anonymizer 地址或换隐私密钥都会得到一组新的 shadow 地址 | 由 W24、W26 推出：两者都是派生输入 | inferred | |
| W51 | 钱包若不把 dapp_name 与 origin 绑定，dapp B 可以请求 A 的 partial commitment 来关联用户 | 未验证钱包实现；[11] 只说 “dapp never receives the viewing key” | speculative | |
| W52 | account_factory.cairo 用同一 Primer 模式部署 Eth712 账户（salt = eth_address），与 shadow 无直接关系 | account_factory.cairo#L158-L198、utils.cairo#L44-L51@3e2fd53d [3] | observed | |
| W53 | 公开的 OZ 审计（2026-05-29，commit c5e2fb5）正文没有 shadow / anonymizer 字样 | docs/audit/README.md@f9256c5e；pdftotext 输出 3142 词，命中 0 [20] | observed | |
| W54 | docs.starknet.io 称 Vesu helper 已部署于 mainnet，地址页称仓库没有发布 Vesu/Ekubo 的 canonical 地址 | anonymous-defi.md#L36-L38 [14]；llms-full “What is not in the list” [12] | observed | |

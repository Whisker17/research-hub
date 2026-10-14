# notes-crypto：Starknet 密码学组件清单与 Falcon-512 账户（lane = crypto）

> 调研日期 2026-10-14（UTC+8）。只读源码与网页；未运行 rh、未提交 git、未复跑任何 Cairo 测试（本机无 scarb / snforge）。

**一句话总结**：Starknet 抗量子能“快”的底气来自两件结构性事实：证明层是基于 hash 的 STARK，账户验签可以由合约自己编程。但截至 2026-10-14 主网（v0.14.4），真正从 Pedersen 换到 BLAKE2s 的只有 compiled class hash（v0.14.1）和 OS program / config hash（v0.14.3）。合约树 / 存储树、合约地址派生、Map 存储槽派生仍然用 Pedersen；默认账户签名仍是 Stark 曲线 ECDSA；DA 走以太坊 blob（KZG）。Falcon-512 账户已有源码实现，并在主网成功发过 1 笔演示交易，但仓库标注实验性、未审计，NIST FIPS 206 仍是“in development”。

- **C-Q1 答案**：证明层（STARK / S-two，hash-based）结构上不依赖 ECDLP。OS / class hash 已迁到 BLAKE2s。状态树（合约树与存储树）、地址派生、Map 键派生仍用 Pedersen（依赖 ECDLP，Shor 可破）。账户签名（Stark-ECDSA / secp）与以太坊侧依赖（KZG、桥、消息）都还不是 PQ。
- **C-Q2 答案**：OZ 的 Falcon-512 验证器有 5 个变体（BLAKE2s / Poseidon / SHAKE-256 × hint / direct），都在 1M steps / 100M L2 gas 的验证上限内。标准 SHAKE-direct 账户的 `__validate__` 资源量是 Stark-ECDSA 的约 385 倍。2026-07-22 有 1 笔主网 0.01 STRK 转账，仓库标注实验性、未审计。
- **C-Q3 答案**：STARK 证明“验签程序被正确执行”，不能让被验的签名本身抗量子。Pedersen 名字叫 hash，安全性却建立在 Stark 曲线离散对数上。hash-based 证明在 Grover 下的安全位数，官方没有给出 Starknet 生产参数的数字。

---

## C-Q1 组件 × 算法 × PQ 状态清单

### 答案
截至 2026-10-14，只有证明层（结构性）以及 OS program / config hash、compiled class hash 这几项“不依赖椭圆曲线”。其余链上承诺与派生（合约树 / 存储树、合约地址、Map 槽）仍用 Pedersen。账户签名、以太坊侧依赖都还在迁移路线图上，或者属于外部依赖。官方自己在 Quantum Hub 回答“Is Starknet quantum-resistant? **No. Not as a single system-wide claim.**”[3]

### 依据（逐项）

| 组件 | 算法 / 构造 | 困难性假设 | Shor / Grover | 状态（五分类）与出处 |
|---|---|---|---|---|
| 证明系统 | STARK。S-two 实现 Circle STARK，基域为 31-bit Mersenne 素数域 [23][24]；用 Merkle 承诺 + Fiat–Shamir 编译 [2] | hash 抗碰撞 + FRI / 随机预言假设 [1 R3][2] | Shor 不适用；Grover 只影响参数余量 [3] | **结构性属性**（Register 标为 “Structural property”，没有组件级证据记录）[1]。S-two 自 2025-11 起是生产 prover（Hub 时间线）[2] |
| 证明 Merkle / Fiat–Shamir 用的 hash | stwo 源码同时提供 Blake2s、Poseidon252、Keccak256 三种 Merkle 与 channel 实现 [22] | 同上 | 同上 | **源码已实现**多种选项；Starknet 主网区块证明和 L1 验证器具体用哪一种，本次**未核实**（见开放问题） |
| 账户签名（默认） | Stark 曲线 ECDSA（`check_ecdsa_signature`）[5][30] | ECDLP | **Shor 可破** [3] | **主网在用**。OZ 默认账户就是这一种 [30] |
| 账户签名（EVM 兼容） | secp256k1 / secp256r1 syscall（OZ EthAccount 等）[16][19] | ECDLP | **Shor 可破** | **主网在用**。路线图第 3 阶段称其移除要等以太坊迁移 [4] |
| 账户签名（PQ） | Falcon-512 合约验签（OZ）[18][19] | NTRU 格（SIS / NTRU 类）[18] | 不受 Shor 影响（按格假设） | **源码已实现** + **主网演示 1 笔**（2026-07-22）[1 R2][11]。实验性、未审计 [18] |
| Pedersen hash | `[shift + a_low·P0 + a_high·P1 + b_low·P2 + b_high·P3]_x` [5] | Stark 曲线 ECDLP | **Shor 可破**（路线图：Pedersen “inherits elliptic-curve assumptions”）[4] | 仍用于：合约树 / 存储树 [6][1 R5]、地址派生 [13][1 R6]、Map 槽 [17]、L1 handler 与旧版 tx hash [15] |
| Poseidon hash | 3 元素状态的 Hades 置换（algebraic hash）[5] | 置换的伪随机性（无 EC 结构） | Shor 不适用（推论）；官方未单独评级 | 用于：外层状态承诺（state_commitment = hPos(...)）、class 树 [6][1 R5]、v3 交易 hash [15] |
| BLAKE2s-256 | 通用 hash；S-two 有专用 opcode [24] | hash 抗碰撞 | Shor 不适用 | **主网已上线**：compiled class hash（v0.14.1，2025-12-10）[7][14]；OS program / config hash（v0.14.3，主网维护 2026-07-08 完成）[1 R4][8][9][13] |
| sn_keccak | keccak256 的前 250 bit [5] | hash 抗碰撞 | Shor 不适用 | 用于存储变量基址 `sn_keccak(variable_name)`、选择器 [17] |
| 合约状态树 / 存储树 | 二叉 Merkle-Patricia 树，Pedersen [6] | ECDLP | **Shor 可破** | **路线图方向**（Register R5：“Planned, not live”）[1]；v0.14.4 发布说明没有包含此项 [10] |
| 合约地址派生 | `Pedersen(prefix, deployer, salt, class_hash, Pedersen(calldata))` [13] | ECDLP | **Shor 可破** | **路线图方向**（R6）[1]；sequencer@54f97a8a（2026-10-13）仍是 Pedersen [13] |
| Map 存储键派生 | `h(sn_keccak(name), k)`，其中 h 为 Pedersen [17] | ECDLP | **Shor 可破** | **研究阶段**：旧合约迁移工具“no public specification, implementation…”（C1）[1]；路线图第 2 阶段 [4] |
| 共识 / 排序 | 文档称 Starknet “currently still centralized”。Staking v2 的验证者通过普通 `attest` 交易做证明 [28] | 由验证者账户的签名方案决定 | 默认 ECDSA 账户 → Shor 可破（推论） | **主网在用**（v2 attestation）[28]；“PQ 共识签名，如 Falcon-512” 属于**路线图**中“新功能”的要求 [4] |
| DA | 状态差异以 EIP-4844 blob 发布（KZG）；可回退 calldata [1 R8] | KZG（配对 / 离散对数） | **Shor 可破**（外部依赖）[3] | **外部依赖**；最新主网区块 `l1_da_mode: BLOB` [11]。KZG 被攻破影响 DA 透明性，不影响 STARK 状态转移的可靠性 [1 R8][4] |
| L1 桥 / 消息 | 以太坊合约 + 以太坊账户签名 | ECDSA / BLS（以太坊侧） | Shor 可破 | **外部依赖**，等以太坊迁移（路线图第 3 阶段）[4][1] |

### Quantum Hub Migration Register 原文登记（页面 “Last updated: 19 August 2026”，各记录 `checkedDate: 2026-07-30`）[1]
- R1 Native account abstraction：**Structural property**
- R2 OpenZeppelin Falcon-512 account：**Demonstrated on mainnet**（“sent 0.01 STRK in a successful Starknet Mainnet transaction”；limit：“experimental and unaudited… does not establish… production readiness”）
- R3 STARK proving assumptions：**Structural property**（limit：“Soundness still depends on FRI and random-oracle assumptions, chosen hashes, production parameters and correct implementation”）
- R4 OS program hash and OS config hash：**Live on mainnet**（Starknet Mainnet · v0.14.3）
- R5 Contracts trie and per-contract storage tries：**Published roadmap direction**（“Planned, not live. The outer state commitment and class trie already use Poseidon.”）
- R6 Contract-address derivation：**Published roadmap direction**（“Current derivation remains Pedersen-based.”）
- C1 Legacy storage migration：**Research announced**
- R8 Ethereum blob DA and KZG：**External dependency**

### 不确定之处
- S-two 生产区块证明用哪种 Merkle / channel hash，以及 L1 上的验证路径（SHARP / Stone 验证器？用 Keccak？），本次没有拿到一手证据。stwo 源码三种都支持 [22]。
- Grover 下的量子安全位数：Hub 只说“通过调整安全参数应对”[2]。S-two Book 的基准表写的是 96 bits（Stone 100 bits）[24]，但那是基准配置，不是主网生产参数，也没说明是经典还是量子口径。
- Poseidon 的 PQ 状态：官方没有单独评级。路线图选的是 BLAKE2，而不是 Poseidon [4]。
- 第 1 阶段剩余项（树、地址）：路线图（2026-06-30）估计“approximately two months from start”[4]。到 2026-10-14 仍未上线（v0.14.4 说明里没有，源码仍是 Pedersen）[10][13]。

---

## C-Q2 Falcon-512 账户

### 答案
OZ `cairo-pq-verifiers` 在 Cairo 里实现了完整的 Falcon-512 验证：hash-to-point → `s0 = c − s1·h (mod q, x^512+1)` → 中心化范数 ≤ 34,034,726。共 5 个变体，只有 SHAKE-256 两个变体与标准签名器（falcon.py / FIPS 206 草案方向）互通。`__validate__` 资源成本从 13.6M（Poseidon）到 61.9M（SHAKE-direct）L2 gas 不等，都在 100M gas / 1M steps 的验证上限内。主网有 1 笔 SHAKE-direct 演示交易（block 12156522，2026-07-22 10:46:25 UTC）。OZ `cairo-contracts` 已合入 Falcon 账户组件，但仍处于 “Unreleased”。

### 依据
- **算法**：环 `Z_q[x]/(x^512+1)`，q = 12289 [18 HINT_VS_DIRECT.md]。验证式 `s0 = c − s1*h`，接受条件 `‖s0‖²+‖s1‖² ≤ bound` [18]，`SIG_BOUND_512 = 34034726` [18 falcon.cairo#L26]。尺寸：Falcon-512 公钥 897 字节、签名 666 字节 [27]。Cairo 编码：公钥 29 felts（NTT 域，base-Q 打包），direct 签名 31 felts（`s1‖salt`），hint 签名 60 felts（另加 29 felts 的 `mul_hint`）[18]。
- **hint vs direct**（原文）：两者“differ in one thing only: how the verifier obtains the polynomial product `s1 * h`”。hint 由签名者附带 `s1*h`，链上用两次正向 NTT 逐点**检查**；NTT 是双射，所以 hint “cannot be forged”。direct 在链上算 `INTT(NTT(s1)∘h_ntt)`。两者的安全性相同，direct 的输入信任面最小。direct 比 hint 固定多 10,196,120 L2 gas、100,927 steps [18 HINT_VS_DIRECT.md]。
- **hash-to-point 变体**：BLAKE2s（`core::blake` builtin，计数器模式 XOF，“NOT FIPS-206-interoperable”）、Poseidon（`hades_permutation` squeeze，非标准）、SHAKE-256（标准，纯 Cairo 实现 Keccak-f[1600]）[18]。注意：被签的“消息”是 Starknet 交易 hash（felt252，v3 交易用 Poseidon 计算）[19][15]，所以即使是 SHAKE 变体，消息摘要链上仍有 Poseidon（推论）。
- **成本**（efficiency_baseline.json，Scarb 2.18.0 / snforge 0.59.0；口径为“paired-subtraction cost (test minus baseline)”，即资源量，不是手续费）[18]：

| 条目（JSON key） | L2 gas | steps | / ECDSA validate |
|---|--:|--:|--:|
| ecdsa_stark_validate | 160,795 | 1,437 | 1× |
| falcon_512_poseidon_validate | 13,615,909 | 111,950 | ≈84.7× |
| falcon_512_validate（hint, BLAKE2s） | 14,380,100 | 119,124 | ≈89.4× |
| falcon_512_direct_validate（BLAKE2s） | 24,525,310 | 219,565 | ≈152.5× |
| falcon_512_shake_validate（hint） | 51,733,728 | 327,157 | ≈321.7× |
| falcon_512_shake_direct_validate | 61,878,938 | 427,598 | ≈384.8× |

  上限：`validate_max_n_steps = 1000000`、`validate_max_sierra_gas = 100000000`（v0.14.4 / v0.14.5 的 versioned constants）[16]。README 说明收费口径另算（Sierra ≥ 1.7 的类按 Sierra gas 计费，约为上表的 1.7–2.7 倍）[18]。devnet（0.14.3）实测整笔 invoke 的 L2 gas：ecdsa-stark 1,207,040；falcon-512-shake-direct 139,875,520 [18 USAGE.md]。
- **ML-DSA-44、Poseidon-WOTS**：仓库里只有 stub（“stub (not yet measured)”）。README 把 ML-DSA-44 标为 “final, FIPS 204”，Poseidon-WOTS+ 标为 “not standardized” [18]。
- **OZ cairo-contracts**：`Falcon512AccountComponent`、`Falcon512ShakeDirectAccountUpgradeable` 等在 CHANGELOG 的 “Unreleased” 段（最新发布 4.0.1，2026-08-26）[19]。`__validate__` 用 `tx_info.transaction_hash` 与 `tx_info.signature` 调 `Verifier::verify` [19]。
- **s2morrow**：有两个同名仓库，要区分。
  - starkware-bitcoin/s2morrow@831bb518 的定位是 “STARK-based aggregation of quantum-resistant signatures”，面向 Bitcoin（BIP-360）。其中 Falcon 验证接收“pre-computed SHAKE(message | salt)”的 msg_point，没有账户合约 [20]。
  - feltroidprime/s2morrow@4eff9ab9 才是 Starknet 账户方向（有 `falcon_account` 包），hash-to-point 用 Poseidon [21]。路线图所说 “S2morrow has already demonstrated… Falcon-512 account implementation in Cairo” 指的是后者（推论）[4]。
- **主网记录**：tx `0x72ae4404…0a4b3`。feeder gateway 显示：INVOKE v3，sender `0xbae840ed…b132`，nonce 0x1，签名长度 31 felts（与 direct 编码一致），调用 STRK 合约 `transfer` 0.01 STRK，`ACCEPTED_ON_L1`、`SUCCEEDED`。所在区块 12156522 时间戳 1784717185（2026-07-22 10:46:25 UTC），starknet_version 0.14.3。receipt `total_gas_consumed.l2_gas = 63,932,548`，fee 0x1aba6437b7129348 ≈ 1.926 STRK [11]。Register 把这笔交易登记为 Falcon512ShakeDirectAccount [1 R2]。
- **标准化**：NIST PQC 页面写的是 “FALCON was also selected and will be published in FIPS 206 (in development)”[25]。FIPS 204（ML-DSA）2024-08-13 定稿，2026-07-31 有勘误规划说明 [26]。

### 不确定之处
- “S2morrow in production on mainnet”（2026-04-01 的官方说法）：本次没有找到一手原文。搜索引擎被拦截，starkware.co 的 WP API 也搜不到。按无法核实处理。
- 主网交易所用 class 与仓库 @bece5c07 的构建产物是否一致，未比对（feeder 的 `get_class_hash_at` 已在 v0.14.4 下线 [10]）。主网 receipt 的 l2_gas（63.9M）与 USAGE.md 里 devnet 的 SHAKE-direct invoke（139.9M）相差很大，原因未查明。
- csrc 上 `/pubs/fips/206/ipd` 返回 404，FIPS 列表页也没有 206。所以没能确认 FIPS 206 初始公开草案的发布日期和状态。OZ 写的 “draft, FIPS 206” 与 NIST 页面的 “in development” 措辞不同。

---

## C-Q3 关键辨析

### 答案
1. STARK 证明的是“这段验签程序按规则执行了”。如果签名方案本身被 Shor 攻破，伪造的签名同样会被“正确地”接受。所以证明层抗量子不能推出账户抗量子。Hub 原文：“A post-quantum proving layer does not migrate account signatures by implication.”[3]
2. Pedersen 是对 Stark 曲线点做线性组合后取 x 坐标 [5]。它的抗碰撞性依赖生成元之间的离散对数未知；Shor 能求出这些离散对数，就能构造碰撞（推论）。官方表述是 Pedersen “inherits elliptic-curve assumptions”，替换它可以 “eliminat[e] the ability to forge token balance proofs”[4]。
3. hash-based 证明的安全性取决于具体 hash、参数和实现 [1 R3][2]。Grover 只带来平方级加速，影响 preimage 余量，用调参应对 [2][3]。官方**没有**给出 Starknet 生产证明在量子攻击下的安全位数。

### 依据
见 [1][2][3][4][5]。补充：Hub 的 Learn 页把 BLAKE2 的已部署范围限定为 “compiled class hashes and Starknet OS program hashes. That deployed scope does not migrate account authorization.”[3]

### 不确定之处
- Pedersen 的碰撞攻击需要多少量子资源、实际会被怎样利用（例如伪造状态证明），没有一手量化数据。
- 隐私协议里 ECDH 的 PQ 问题属于 privacy 那一路，本路不展开。

---

## 图的素材

**A. 组件 × PQ 状态图（分层）**
- 证明层：STARK / S-two（hash-based）→ 结构性 PQ-friendly [1 R3][2]
- 协议承诺层：
  - OS program / config hash → BLAKE2s，v0.14.3 主网 [1 R4][13]
  - compiled class hash → BLAKE2s，v0.14.1 主网 [7][14]
  - 外层状态承诺与 class 树 → Poseidon [6]
  - 合约树 / 存储树 → Pedersen，路线图 [1 R5][6]
  - 地址派生 → Pedersen，路线图 [1 R6][13]
  - Map 槽 → Pedersen，研究阶段 [1 C1][17]
- 账户层：默认 Stark-ECDSA / secp（非 PQ）[30]；Falcon-512（源码 + 主网演示，未审计）[1 R2][18]
- 共识层：中心化排序；staking v2 用 `attest` 交易 [28]；PQ 共识签名属于路线图 [4]
- 以太坊侧：blob / KZG（外部依赖，可回退 calldata）[1 R8]；桥与消息（外部依赖）[4]

**B. 时间线**
- 2018：STARK 论文 [2]
- 2025-05-26：S-two 发布博客 [23]
- 2025-11：S-two 成为 Starknet 生产 prover（Hub 时间线）[2]
- 2025-12-10：v0.14.1 主网，compiled class hash 改用 Blake [7]
- 2026-06-30：StarkWare 发布 PQ 三阶段路线图 [4]
- 2026-07-08 08:30 UTC：v0.14.3 主网升级维护完成（发布说明计划日 07-06）[8][9]，OS program / config hash 改用 BLAKE2s [1 R4]
- 2026-07-22 10:46:25 UTC：Falcon-512 SHAKE-direct 账户主网转账 0.01 STRK [11]
- 2026-08-19：Migration Register 最后更新 [1]
- 2026-09-09：v0.14.4 预发布说明（没有 PQ 相关项）；主网计划 10-05 [10]；10-14 最新区块为 0.14.4 [11]

**C. Falcon 验证流程（参与者与顺序）**
签名者（链下，falcon.py 等）→ 交易 `signature`（31 / 60 felts）→ 协议调用账户 `__validate__` → 从存储读 29-felt `h_ntt` → hash_to_point(tx_hash, salt) 得到 c → 计算（direct）或检查（hint）`s1·h` → 中心化范数 ≤ 34,034,726 → 返回 `VALIDATED` [18][19]

**D. 对比维度（Falcon 变体）**：hash-to-point（标准 / 非标准）、hint / direct、签名 felts（60 / 31）、validate L2 gas、steps、占 gas 上限的比例 [18]

## 代码素材

1. OS config hash 的 V4（Blake）切换版本 — `starkware-libs/sequencer/crates/starknet_api/src/core.rs#L111-L113@54f97a8a`（[链接](https://github.com/starkware-libs/sequencer/blob/54f97a8af3a712fb6c358e30f19e5a386cb7b4e3/crates/starknet_api/src/core.rs#L111-L113)）
```rust
/// The first Starknet version at which the OS config hash is computed with Blake (V4) instead of
/// Pedersen (V3).
const OS_CONFIG_HASH_V4_CUTOVER: StarknetVersion = StarknetVersion::V0_14_3;
```
2. 合约地址派生仍用 Pedersen — `sequencer/crates/starknet_api/src/core.rs#L322-L341@54f97a8a`
```rust
// TODO(Noa): Add a hash_function as a parameter
pub fn calculate_contract_address(
    salt: ContractAddressSalt, class_hash: ClassHash,
    constructor_calldata: &Calldata, deployer_address: ContractAddress,
) -> Result<ContractAddress, StarknetApiError> {
    let constructor_calldata_hash = Pedersen::hash_array(&constructor_calldata.0);
    ...
    let address = Pedersen::hash_array(&[ /* prefix, deployer, salt, class_hash, calldata_hash */ ]);
```
3. compiled class hash 用 V2（Blake）— `sequencer/crates/starknet_api/src/contract_class/structs.rs#L53-L59@54f97a8a` 与 `compiled_class_hash.rs#L18-L22,L144-L147@54f97a8a`
```rust
pub enum HashVersion { /// Poseidon hash.
    V1, /// Blake2Felt252 hash.
    V2 }
...
ContractClass::V1((casm_contract_class, _sierra_version)) => casm_contract_class.hash(&HashVersion::V2)
```
4. Map 键派生（Pedersen）— `starkware-libs/cairo/corelib/src/starknet/storage/map.cairo#L46-L49@8e2d7141`
```
//!   address = h(sn_keccak(variable_name), k) mod N
//!   - `h` is the Pedersen hash function
```
5. Falcon SHAKE-direct 验证入口 — `OpenZeppelin/cairo-pq-verifiers/crates/falcon_512/src/lib.cairo#L161-L181@bece5c07`
```cairo
pub impl Falcon512ShakeDirectVerifier of PqSignatureVerifier {
    fn verify(message_hash: felt252, public_key: Span<felt252>, signature: Span<felt252>) -> bool {
        if public_key.len() != PUBKEY_FELTS || signature.len() != SIG_FELTS_DIRECT { return false; }
        let h_ntt = match packing::unpack_512_u16(public_key) { Some(v) => v, None => { return false; } };
        let s1 = match packing::unpack_512_u16(signature.slice(0, 29)) { Some(v) => v, None => { return false; } };
        let salt_a = *signature.at(29);
        let salt_b = *signature.at(30);
        let msg_point = match hash_to_point::hash_to_point_shake_512(message_hash, salt_a, salt_b) {
            Some(v) => v, None => { return false; },
        };
        falcon::verify_512_direct_u16(s1.span(), h_ntt.span(), msg_point.span())
    }
}
```
6. 范数界 — `cairo-pq-verifiers/crates/falcon_512/src/falcon.cairo#L25-L26@bece5c07`
```cairo
/// Maximum allowed `||s0||^2 + ||s1||^2` for Falcon-512 (FIPS 206 / falcon.py sig_bound).
pub const SIG_BOUND_512: u64 = 34034726;
```
7. OZ Falcon 账户的 validate — `OpenZeppelin/cairo-contracts/packages/account/src/falcon_512/account.cairo#L371-L383@5cf9010e`
```cairo
fn validate_transaction<impl Verifier: Falcon512SignatureVerifier>(self: @ComponentState<TContractState>) -> felt252 {
    let tx_info = starknet::get_tx_info().unbox();
    assert(
        Verifier::verify(tx_info.transaction_hash, self.read_public_key().span(), tx_info.signature),
        Errors::INVALID_SIGNATURE,
    );
    starknet::VALIDATED
}
```
8. 对照：OZ 默认账户的 Stark-ECDSA — `cairo-contracts/packages/account/src/utils/signature.cairo#L27@5cf9010e`：`check_ecdsa_signature(msg_hash, public_key, *signature.at(0_u32), *signature.at(1_u32))`

## 外部调研 / 用户资料中被修正或无法核实的地方

1. GPT 第五节成本表：数字与 efficiency_baseline.json 逐项一致，但有三处需要补正 [18]。
   - 漏了 BLAKE2s-direct 账户（24,525,310 gas / 219,565 steps）。
   - 没说明 JSON 口径是“test minus baseline”的资源量，不是收费口径（收费约为其 1.7–2.7 倍）。
   - “Falcon / BLAKE2s，hint”对应的 JSON key 是 `falcon_512_validate`，名称里没有 blake，要看 README 才能对上。
2. GPT 写“S2morrow 的实现也使用了 Poseidon hash-to-point”：只对 feltroidprime/s2morrow 成立 [21]。brief 指定的 starkware-bitcoin/s2morrow@831bb518 是 Bitcoin 方向的签名聚合研究，Falcon 接收预先算好的 SHAKE msg_point，没有账户 [20]。两个仓库被混为一谈了。
3. GPT 写“NIST 页面仍把 FIPS 206 标记为 in development”：属实 [25]。但 OZ README 写的是 “draft, FIPS 206”[18]，措辞不一致；本次也没找到 FIPS 206 IPD 的页面。
4. GPT 写“Falcon-512 账户｜有主网演示记录”：属实，补充具体交易：block 12156522、2026-07-22、0.01 STRK、fee ≈ 1.926 STRK [11]。Register 自己强调，这一笔不代表生产就绪 [1]。
5. GPT 的 Register 表“OS program / config hash｜v0.14.3 已使用基于 BLAKE2s-256 的构造”：属实 [1 R4]，源码交叉核对一致 [13]。另外：主网升级维护完成于 2026-07-08（发布说明计划 07-06）[8][9]。GPT 漏了更早的一项：compiled class hash 已于 v0.14.1（2025-12-10）改用 Blake [7]。
6. GPT 写“合约状态树、合约地址派生｜路线图方向”：属实 [1]。需要补充：外层状态承诺和 class 树本来就用 Poseidon [6][1 R5]；v0.14.4（2026-10 主网）也没有包含这两项 [10]；而路线图 2026-06-30 估计第 1 阶段“approximately two months from start”[4]，实际已经落后于这个估计（推论）。
7. GPT 写“Starknet 历史上在状态、地址与存储相关路径中使用 Pedersen”：容易被读成“过去用、现在不用”。实际截至 2026-10-14 这些路径**仍然**用 Pedersen [6][13][17]。
8. 用户草稿“为什么他们觉得自己能够在明年就作为一条 PQ L1”：从本路证据看，官方 Hub 明确否认“系统整体已抗量子”[3]。大部分非 PQ 组件仍处于路线图或外部依赖状态 [1]。
9. 路线图原文把 secp256k1/r1 syscall 说成用来 “support L1-to-L2 messaging and the Ethereum bridge”[4]。但这两个 syscall 也被通用账户（例如 OZ EthAccount）用于验签 [19]。原文措辞不够精确，移除它们的影响面不只是桥（推论）。
10. “S2morrow in production on mainnet（2026-04-01）”：没有找到一手出处，无法核实。

## 来源

1. **PRIMARY** StarkWare Quantum Hub — Migration Register，https://quantum.starkware.co/migration-register（页面 “Last updated: 19 August 2026”；记录 R1–R8、C1 来自页面内嵌数据），访问 2026-10-14。证明：各组件的官方登记状态与限定语。
2. **PRIMARY** Quantum Hub — Foundations，https://quantum.starkware.co/foundations（Last updated 25 Aug 2026），访问 2026-10-14。证明：STARK 假设、Grover 的处理方式、时间线（S-two 2025-11、v0.14.3 2026-07）。
3. **PRIMARY** Quantum Hub — Learn，https://quantum.starkware.co/learn（Last updated 23 Sep 2026），访问 2026-10-14。证明：“Is Starknet quantum-resistant? No. Not as a single system-wide claim.”；Shor / Grover 的影响范围；BLAKE2 的已部署范围。
4. **PRIMARY** StarkWare 博客 “The Architecture Advantage: Starknet’s Quantum Readiness Roadmap”（2026-06-30），https://starkware.co/blog/the-architecture-advantage-starknets-quantum-readiness-roadmap/，访问 2026-10-14。证明：三阶段路线图、时间估计、对 Pedersen 的定性、secp / KZG 属于外部依赖、PQ 共识签名被列为新功能要求。
5. **PRIMARY** docs.starknet.io — Cryptography，https://docs.starknet.io/learn/protocol/cryptography.md，访问 2026-10-14。证明：Stark 曲线、Pedersen 公式、Poseidon（Hades）、sn_keccak 的定义。
6. **PRIMARY** docs.starknet.io — State，https://docs.starknet.io/learn/protocol/state.md，访问 2026-10-14。证明：state_commitment = Poseidon(…)；合约叶子与 MPT 用 Pedersen；class 树叶子用 Poseidon。
7. **PRIMARY** docs.starknet.io — Version Notes，https://docs.starknet.io/learn/cheatsheets/version-notes.md，访问 2026-10-14。证明：v0.14.1（2025-12-10）把 compiled class hash 改为 Blake；v0.13.1 起 DA 用 EIP-4844 blob。（该页没有列出 v0.14.2 及以后的版本。）
8. **PRIMARY** Starknet 社区论坛 “Starknet 0.14.3 pre-release notes”，https://community.starknet.io/t/starknet-0-14-3-pre-release-notes/116211，访问 2026-10-14。证明：计划日期（测试网 06-22，主网 07-06）；“Quantum-resistant SNOS hash”。
9. **PRIMARY** status.starknet.io “Mainnet 0.14.3 upgrade”，https://status.starknet.io/incidents/6l23lrrdvy9y，访问 2026-10-14。证明：维护于 2026-07-08 08:30 UTC 完成。
10. **PRIMARY** Starknet 社区论坛 “Starknet v0.14.4 Prerelease Notes”（2026-09-09），https://community.starknet.io/t/116341，访问 2026-10-14。证明：v0.14.4 的内容（没有 PQ hash 迁移）；主网计划 2026-10-05；`get_class_hash_at` 等端点下线。
11. **PRIMARY**（链上）Starknet 主网 feeder gateway：`get_block?blockNumber=latest`（block 16357214，`starknet_version 0.14.4`，`l1_da_mode BLOB`）；`get_transaction?transactionHash=0x72ae4404…`；`get_block?blockNumber=12156522`。访问 2026-10-14。浏览器链接：https://voyager.online/tx/0x72ae4404b44ad78de65bdc460f8cc87fea4a15ce93e07a37c6a68e9adb0a4b3（来自 [1]，本次未打开 Voyager 本身）。证明：Falcon 交易的细节；当前主网版本与 DA 模式。
12. （保留编号，未使用）
13. **PRIMARY** starkware-libs/sequencer `crates/starknet_api/src/core.rs@54f97a8a`（2026-10-13）。证明：OS config hash 自 v0.14.3 起切到 Blake（L103-L130）；地址派生仍是 Pedersen（L322-L341）。
14. **PRIMARY** sequencer `crates/starknet_api/src/contract_class/compiled_class_hash.rs#L18-L22,L144-L147` 与 `structs.rs#L53-L59@54f97a8a`。证明：compiled class hash 默认用 V2（Blake2Felt252）。
15. **PRIMARY** sequencer `crates/starknet_api/src/transaction_hash.rs@54f97a8a`。证明：v3 invoke hash 用 Poseidon（L370-L404）；L1 handler 与 deploy 等旧路径用 Pedersen（L481-L522 等）。
16. **PRIMARY** sequencer `crates/blockifier/resources/blockifier_versioned_constants_0_14_4.json#L13,L153@54f97a8a`。证明：validate 上限为 1,000,000 steps / 100,000,000 Sierra gas。
17. **PRIMARY** starkware-libs/cairo `corelib/src/starknet/storage/map.cairo#L46-L55,L144@8e2d7141`（Register 引用的 commit）。证明：Map 槽 = Pedersen(sn_keccak(name), k)。
18. **PRIMARY** OpenZeppelin/cairo-pq-verifiers@bece5c07（2026-07-22）：README.md（L8-L9 实验性 / 未审计，L26-L33 上限与收费口径，L41-L61 快照，L145-L150 标准化）；efficiency_baseline.json（L1-L128）；crates/falcon_512/{README.md, HINT_VS_DIRECT.md, src/falcon.cairo#L26, src/lib.cairo#L161-L181, src/hashing/hash_to_point.cairo#L8-L26}；pq-accounts/USAGE.md#L132-L158。证明：Falcon 实现、变体、成本、审计状态。
19. **PRIMARY** OpenZeppelin/cairo-contracts@5cf9010e（2026-10-01）：packages/account/src/falcon_512/account.cairo#L94-L106,L371-L383；CHANGELOG.md#L10-L19；eth_account.cairo#L21-L24。证明：Falcon 账户组件处于 “Unreleased”；validate 逻辑；EthAccount 使用 secp256。
20. **PRIMARY** starkware-bitcoin/s2morrow@831bb518（2026-03-23）README.md、packages/falcon/src/falcon.cairo#L18-L26。证明：定位是聚合研究；msg_point 预先计算（SHAKE）。
21. **PRIMARY** feltroidprime/s2morrow@4eff9ab9（2026-03-05）README.md（“Hash-to-point”一节、packages 列表）。证明：Starknet 账户方向的 Falcon，Poseidon hash-to-point，hint 验证。
22. **PRIMARY** starkware-libs/stwo@826591c6（2026-08-13）`crates/stwo/src/core/vcs/{blake2_merkle.rs, poseidon252_merkle.rs, keccak256_hash.rs}`、`core/channel/{blake2s,poseidon252,keccak256}.rs`。证明：S-two 支持的 Merkle / channel hash 选项。
23. **PRIMARY** StarkWare 博客 “Introducing S-two”（2025-05-26），https://starkware.co/blog/s-two-prover/，访问 2026-10-14。证明：Circle STARK、Mersenne31；Stone / SHARP 的历史。
24. **PRIMARY** docs.starknet.io S-two Book（Introduction、Benchmarks），https://docs.starknet.io/learn/S-two-book/benchmarks/index.md，访问 2026-10-14。证明：基准表中 S-two 96 bits、Stone 100 bits（基准配置）；BLAKE 专用 opcode。
25. **PRIMARY** NIST CSRC PQC Standardization 页面，https://csrc.nist.gov/projects/post-quantum-cryptography/post-quantum-cryptography-standardization，访问 2026-10-14。证明：FIPS 206 “in development”。
26. **PRIMARY** NIST FIPS 204 页面，https://csrc.nist.gov/pubs/fips/204/final，访问 2026-10-14。证明：2024-08-13 定稿；2026-07-31 的勘误规划说明。
27. **PRIMARY** falcon-sign.info，https://falcon-sign.info/，访问 2026-10-14。证明：Falcon-512 公钥 897 字节、签名 666 字节。
28. **PRIMARY** docs.starknet.io — Staking，https://docs.starknet.io/learn/protocol/staking.md，访问 2026-10-14。证明：“currently still centralized”；v2 的 `attest` 交易机制。
29. **PRIMARY** sequencer `crates/starknet_os/src/proof_fact_fold.rs#L1-L33@54f97a8a`。证明：隐私交易 proof facts 的递归折叠用 Blake2s-256（常量目前还是测试值）。
30. **PRIMARY** OpenZeppelin/cairo-contracts `packages/account/src/utils/signature.cairo#L4,L27@5cf9010e`。证明：默认账户用 Stark 曲线 ECDSA。
31. ChatGPT Deep Research（research/starknet-account-model.md）。只当线索，不作证据。

## 命令与输出

```
$ curl feeder_gateway/get_block?blockNumber=latest
{'block_number': 16357214, 'starknet_version': '0.14.4', 'timestamp': 1791961700, 'l1_da_mode': 'BLOB'}
$ curl feeder_gateway/get_transaction?transactionHash=0x72ae4404…
status ACCEPTED_ON_L1 SUCCEEDED block 12156522; type INVOKE_FUNCTION v0x3 sender 0xbae840ed…b132 nonce 0x1
sig len 31; calldata [0x1, STRK 0x4718f5a0…, transfer selector 0x83afd3f4…, 0x3, to 0x7fcf7890…, 0x2386f26fc10000, 0x0]
$ curl feeder_gateway/get_block?blockNumber=12156522
12156522 0.14.3 1784717185 2026-07-22 10:46:25 UTC BLOB
receipt: total_gas_consumed {l1_gas 0, l1_data_gas 224, l2_gas 63932548}; actual_fee 0x1aba6437b7129348 (=1.92596 STRK); n_steps 5140
$ grep validate_max blockifier_versioned_constants_0_14_4.json
13: "validate_max_n_steps": 1000000,   153: "validate_max_sierra_gas": 100000000
$ which scarb snforge   →（无输出，未安装；不复跑）
```

## 开放问题
1. Starknet 主网区块证明的 S-two 配置：Merkle / Fiat–Shamir 用哪种 hash？安全参数（位数）是多少？L1 上是否仍经由 Stone / SHARP 验证器、用什么 hash？
2. 第 1 阶段剩余项（合约树 / 存储树、地址派生改为 BLAKE2）计划在哪个版本上线？v0.14.4 没有包含。
3. 主网 Falcon 交易的 class hash 是否对应 OZ @bece5c07 的 Falcon512ShakeDirectAccount？主网 receipt 63.9M l2_gas 与 devnet 139.9M 的差异来自哪里（类版本，还是计费口径）？
4. FIPS 206 初始公开草案是否已经发布、何时发布？
5. “S2morrow in production on mainnet”（2026-04-01）的原始出处。
6. Staking v2 验证者账户实际使用的签名方案分布；PQ 共识签名的规范。

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| C1 | 官方 Quantum Hub 明确表示 Starknet 不能作为整体被称为抗量子 | [3] Learn 页 “Is Starknet quantum-resistant? No. Not as a single system-wide claim.” | observed | |
| C2 | Migration Register 最后更新于 2026-08-19，各记录核查日期为 2026-07-30 | [1] 页面页脚与内嵌数据 `checkedDate` | observed | |
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
| C14 | 合约树与存储树（MPT）仍用 Pedersen | [6] State 页 “binary Merkle-Patricia trie with the Pedersen hash function”；[1] R5 “Planned, not live” | observed | |
| C15 | 合约树 / 存储树改 BLAKE2 是“已发布的路线图方向”，未上线 | [1] R5 status | observed | |
| C16 | 合约地址派生当前为 Pedersen（sequencer 源码，2026-10-13） | [13] core.rs#L322-L341@54f97a8a | observed | |
| C17 | 地址派生改 BLAKE2 被登记为路线图方向 | [1] R6 | observed | |
| C18 | Map 存储槽 = Pedersen(sn_keccak(name), k) | [17] map.cairo#L46-L49@8e2d7141 | observed | |
| C19 | 旧合约存储迁移工具处于研究阶段，没有公开规范或实现 | [1] C1 “no public specification, implementation, released toolkit” | observed | |
| C20 | sn_keccak 是 keccak256 的前 250 bit，用作存储变量基址 | [5]；[17] map.cairo#L121-L123 | observed | |
| C21 | OS config hash 从 v0.14.3 起由 Pedersen（V3）切到 Blake（V4） | [13] core.rs#L103-L130@54f97a8a | observed | |
| C22 | Register 将 OS program / config hash 的 BLAKE2s 构造登记为 v0.14.3 主网已上线 | [1] R4 | observed | |
| C23 | v0.14.3 主网升级维护于 2026-07-08 08:30 UTC 完成（计划日为 07-06） | [9] status 页；[8] 预发布说明 | observed | |
| C24 | compiled class hash 自 v0.14.1（2025-12-10）起改用 Blake | [7] Version Notes v0.14.1 | observed | |
| C25 | sequencer 计算 compiled class hash 默认用 HashVersion::V2（Blake2Felt252） | [14] structs.rs#L53-L59、compiled_class_hash.rs#L18-L22@54f97a8a | observed | |
| C26 | v3 invoke 交易 hash 用 Poseidon；L1 handler 交易 hash 用 Pedersen | [15] transaction_hash.rs#L370-L404、#L481-L522@54f97a8a | observed | |
| C27 | 默认 OZ 账户用 Stark 曲线 ECDSA 验签 | [30] utils/signature.cairo#L27@5cf9010e | observed | |
| C28 | 路线图称 secp256k1/r1 syscall 是量子脆弱的，移除要等以太坊迁移 | [4] Phase 3 “Bridge secp Syscalls” | observed | |
| C29 | secp256 syscall 也被通用账户（OZ EthAccount）用于验签，不只服务于桥 | [19] eth_account.cairo#L21-L24@5cf9010e | observed | |
| C30 | 正常情况下状态差异以 EIP-4844 blob（KZG）发布，可回退 calldata | [1] R8 | observed | |
| C31 | 2026-10-14 主网最新区块为 v0.14.4，l1_da_mode = BLOB | [11] feeder get_block latest（block 16357214） | observed | |
| C32 | KZG 被攻破影响 DA 透明性，不影响 STARK 的状态转移可靠性 | [1] R8 limit；[4] Phase 3 | observed | |
| C33 | 文档称 Starknet 排序仍中心化；staking v2 验证者通过 `attest` 交易证明区块 | [28] Staking 页 L9、L109-L115 | observed | |
| C34 | “PQ 共识签名（如 Falcon-512）”在路线图中是对新功能的要求，没有规范或时间 | [4] Phase 1 段末 | observed | |
| C35 | 路线图估计第 1 阶段其余项“approximately two months from start” | [4] Estimated time to completion | observed | |
| C36 | v0.14.4 预发布说明不含树或地址的 PQ hash 迁移 | [10] 论坛 116341 正文 | observed | |
| C37 | 截至 2026-10-14 第 1 阶段剩余项未上线，落后于路线图的约两个月估计 | 由 C16、C31、C35、C36 推出：最新主网 0.14.4 不含此项，源码仍是 Pedersen | inferred | |
| C38 | OZ Falcon 验证：环 Z_q[x]/(x^512+1)，q = 12289，接受条件为 ‖s0‖²+‖s1‖² ≤ 34,034,726 | [18] HINT_VS_DIRECT.md#L15-L21、falcon.cairo#L26@bece5c07 | observed | |
| C39 | Falcon-512 公钥 897 字节、签名 666 字节 | [27] falcon-sign.info 性能表 | observed | |
| C40 | hint 与 direct 只在 s1·h 的获取方式上不同，安全性相同；hint 无法伪造 | [18] HINT_VS_DIRECT.md#L3-L5、#L25-L30、#L64-L66 | observed | |
| C41 | direct 签名 31 felts，hint 签名 60 felts；direct 固定多 10,196,120 L2 gas / 100,927 steps | [18] HINT_VS_DIRECT.md#L43-L56 | observed | |
| C42 | BLAKE2s 与 Poseidon 的 hash-to-point 是非标准的，与 FIPS 206 签名器不互通；SHAKE-256 是标准变体 | [18] hash_to_point.cairo#L23-L26；falcon_512/README.md#L3-L5、L26-L29 | observed | |
| C43 | efficiency_baseline 的 validate 资源：ECDSA 160,795 gas / 1,437 steps；Falcon 各变体 13.6M–61.9M gas | [18] efficiency_baseline.json#L50-L126@bece5c07 | observed | |
| C44 | baseline 数值口径是“test minus baseline”的资源量，工具链 Scarb 2.18.0 / snforge 0.59.0 | [18] efficiency_baseline.json#L2-L6 | observed | |
| C45 | 标准 SHAKE-direct 账户 validate 的 L2 gas 约为 Stark-ECDSA 的 385 倍 | 由 C43 推出：61,878,938 / 160,795 ≈ 384.8 | inferred | |
| C46 | validate 上限为 1,000,000 steps / 100,000,000 Sierra gas（v0.14.4、v0.14.5） | [16] versioned_constants_0_14_4.json#L13、#L153 | observed | |
| C47 | 5 个 Falcon 变体都在验证上限内；SHAKE 两个变体占 gas 上限的 51.7–61.9% | [18] README.md#L41-L54、L89-L91 | observed | |
| C48 | 收费口径另算（Sierra ≥ 1.7 类约为资源量的 1.7–2.7 倍）；devnet 上 SHAKE-direct 的 invoke 约 139.9M L2 gas | [18] README.md#L29-L33；pq-accounts/USAGE.md#L141-L152 | observed | |
| C49 | cairo-pq-verifiers 标注 “Experimental and unaudited” | [18] README.md#L8-L9 | observed | |
| C50 | ML-DSA-44 与 Poseidon-WOTS 在仓库中只是 stub，尚未测量 | [18] README.md#L60-L61 | observed | |
| C51 | OZ cairo-contracts 的 Falcon 账户组件在 CHANGELOG “Unreleased”段（最新发布 4.0.1） | [19] CHANGELOG.md#L10-L21@5cf9010e | observed | |
| C52 | OZ Falcon 账户的 `__validate__` 用 tx_hash + tx signature 调用 Falcon 验证器 | [19] falcon_512/account.cairo#L371-L383@5cf9010e | observed | |
| C53 | Falcon 主网交易 0x72ae4404… 成功，block 12156522，2026-07-22 10:46:25 UTC，转账 0.01 STRK | [11] feeder get_transaction 与 get_block 12156522 | observed | |
| C54 | 该交易签名 31 felts，与 direct 编码长度一致 | [11] signature 长度；[18] HINT_VS_DIRECT.md#L45 | observed | |
| C55 | 该交易 receipt 的 l2_gas 为 63,932,548，fee 约 1.926 STRK | [11] block 12156522 receipt | observed | |
| C56 | Register 将其登记为 Falcon512ShakeDirectAccount，并声明不代表生产就绪 | [1] R2 claim / limit | observed | |
| C57 | starkware-bitcoin/s2morrow 是 Bitcoin 方向的 PQ 签名聚合研究，Falcon 接收预先算好的 SHAKE msg_point，没有账户 | [20] README.md#L1-L20、falcon.cairo#L18-L26@831bb518 | observed | |
| C58 | feltroidprime/s2morrow 是 Starknet 账户方向的 Falcon，用 Poseidon hash-to-point 与 hint 验证 | [21] README.md（Design / Hash-to-point）@4eff9ab9 | observed | |
| C59 | NIST 页面写明 FALCON 将以 FIPS 206 发布，状态 “in development” | [25] CSRC PQC Standardization 页 | observed | |
| C60 | FIPS 204（ML-DSA）于 2024-08-13 定稿 | [26] CSRC FIPS 204 页 | observed | |
| C61 | STARK 证明验签执行正确，不能让 ECDSA 签名本身抗量子 | [3] “A post-quantum proving layer does not migrate account signatures by implication.” | observed | |
| C62 | “S2morrow in production on mainnet（2026-04-01）”有官方原文 | 未找到一手出处：搜索引擎被拦截，starkware.co WP API 检索为空 | speculative | |
| C63 | Poseidon 在量子攻击下的强度与 BLAKE2 相当 | 官方没有对 Poseidon 做 PQ 评级；路线图选 BLAKE2 而非 Poseidon [4] | speculative | |

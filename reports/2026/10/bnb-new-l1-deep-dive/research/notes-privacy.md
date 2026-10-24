# notes-privacy：Shielded 隐私交易、LtHash 状态承诺与密码学栈（前缀 P）

> 调研日期 2026-10-24。一手来源以官方文档固定快照 `newl1-docs@ef5a632`（`bnb-chain/bnb-chain.github.io` `docs/newl1/`，2026-10-22）为主，行号由 read 工具逐行核对。
> 成熟度用语照搬文档原话：文档总体说 New L1 “runs today as a multi-validator devnet”，并称“the complete shielded-pool flow”已在源码构建的 devnet 上跑过 [10] overview.md:L67、L69；隐私页自己的定性是 “early-phase feature … Not yet audited or production-ready” [1] privacy.md:L9–10。
> 本文件的预期落点是 `reports/2026/10/bnb-new-l1-deep-dive/research/notes-privacy.md`。按运行时指定的输出路径写在这里，需要父会话把它复制过去。

---

## Q4 隐私：ShieldedPool 能做什么、怎么做

**答案**：ShieldedPool 是 genesis 预部署的系统合约（`0x…5000`），用 note、commitment、只追加 Merkle 树和 nullifier 组成 UTXO 式隐私池。每次花费都带**两个 PLONK 证明**（pool proof 和 auth proof，gnark **BN254**，各 864 字节）。目前**只支持原生 BNB**。用户可以通过原生 `0x77` 交易提交（没有发送方、nonce 和外层签名），也可以交给 relayer 调用 `transact`。流程分四种：shield、shielded transfer、unshield、atomic call。trusted setup 用的是**导入的现成公共 SRS**，电路**未审计**，文档明说不要放真钱。

**依据**
- 结构：note 包含 owner commitment、amount、asset 和 `isOpen` 标记，类似 UTXO [1] privacy.md:L18。commitment 作为叶子写入只追加的 Merkle 树 [1]:L19。nullifier 由 note 和 spend key 派生。**每次花费都销毁两个 nullifier**：只有一个真实输入时，用一个无法区分的 “phantom” nullifier 补位，所以从 nullifier 数量看不出真实输入数 [1]:L20。
- 证明系统：**split proof**。pool proof 证明价值守恒、Merkle 成员资格、nullifier 派生和 spend key 知识；auth proof 证明“note 里承诺的那个 EOA 公钥”签了一份 EIP-712 签名。两者靠 note 自身的 commitment 绑定 [1]:L21。`0x77` 交易体里的 `pool_proof`、`auth_proof` 都是 “Two PLONK proof blobs, exactly 864 bytes each (gnark BN254 `MarshalSolidity`)” [3] transaction-types.md:L62。
- Trusted setup：PLONK 的 SRS 是通用的。“The current deployment imports an existing public SRS”，因此继承了那次仪式的诚实参与者假设；New L1 自己的仪式和第三方电路审计“are both still open before mainnet” [1]:L67、[9] faq.md:L30。文档**没有说明导入的是哪一份 SRS**（例如具体哪次 ceremony）。
- 密钥：一个 32 字节 seed 派生 spend key、note-secret seed（每个 note 的 blinding，让发给同一收款人的 note 互不关联）和 view key（**只用于发现和解密收到的 note**）。普通 EOA 私钥直接复用为授权密钥，不混进 seed [1]:L22。
- 注册：`registerPrivacyInfo` 公开 view 公钥、spend-key hash 和 EOA 公钥的 commitment，代价是**把 EOA 和隐私地址关联起来**（但各个 note 之间仍然互不关联）[1]:L23、L69。
- 授权：auth proof 的验证器是 `ShieldedAuthVerifier`，地址 `0x…5003`。隐私页称它为 “the ECDSA auth-proof verifier”，两个合约都是 genesis 预部署，没有硬分叉门槛 [1]:L52、[4] system-contracts.md:L24–25。这两个合约是 New L1 原创，BSC 上没有对应物 [4]:L31。
- 四种流程（文档原名 Shield / Shielded transfer / Unshield / Atomic call）[1]:L28–31：
  - Shield：`privDeposit` 是普通的 EOA 签名调用，不需要证明，存款地址、金额和资产都公开 [1]:L28。函数签名是 `privDeposit(uint256,uint8,uint256,bytes)`，参数含 `$OWNER_COMMITMENT $SCHEME` [3]:L77–78。
  - Shielded transfer：花 1–2 个 note，固定公开 2 个 nullifier，最多产出 3 个输出（收款 note、找零 note、手续费 note），每个都加密给对应收款人的 view key [1]:L29。
  - Unshield：公开提现金额、资产和目的地址。先结算并托管（escrow），再交付到普通地址；交付失败可以重试，不会丢失这笔花费 [1]:L30。
  - Atomic call：unshield 后执行一次公开的 EVM 调用（例如 DEX swap），再把测得的返回值 reshield 成 **open note** [1]:L31。
- 提交路径 [1]:L35–40、[3]:L55–69：
  - Direct：原生 `0x77`，“no sender, no nonce, and no outer signature; the proofs are the authorization”，任何 validator 或 builder 都可以打包。手续费公开（`feePerGas × gasLimit`），unshield 到协议手续费池。文档称它是 “censorship-resistance backstop”，发送方自己不需要持有 BNB。
  - Relayer：relayer 用普通签名交易调用 `transact`，手续费以**私有 fee note**（金额和资产隐藏）付给 relayer。
  - `0x77` 交易体包括 `chain_id`、两个 proof、`pub_signals`（30 个，与合约的 `uint256[30]` ABI 一致）、三个输出密文和 `call_data`（只有 atomic call 时非空）[3]:L61–65。gas limit 和 fee 都放在公开信号里（`[28]` feePerGas、`[29]` gasLimit），所以手续费在证明里就已承诺，不能换一个 limit 重播 [3]:L67。公开信号 `[12]` 是操作码：0 transfer、1 withdraw、2 atomic call [3]:L69。不能用 `eth_estimateGas`，要先读 `newl1_shieldedGasConstants` 再定 gas [3]:L96。
- Note 插入延迟：存款和花费产生的 commitment 先进入队列，由 `deferBatchInsert` 每 50 个块（约 10 秒）批量写入 Merkle 树。证明验证和 nullifier 销毁从不延迟。收到的 note 能立即发现，但要等下一次插入后才能花 [1]:L60。开发者页把 `deferBatchInsert` 写成任何人都能调用的函数（“permissionless”）[3]:L80–81、L92；API 页把 “shielded-pool drains” 列为系统交易 [7] newl1-api-list.md:L314。
- 治理与可冻结性：`ShieldedPool` 不可变，没有 admin、proxy 或升级路径。唯一受治理的动作是暂停存款；withdraw、transfer、atomic call 都不检查暂停标记 [1]:L61、L73。
- 已知限制（原话）：“Not yet implemented: ERC-20/BEP-20 shielding, the reserved post-quantum authorization scheme, paymaster/ERC-4337 submission, per-asset compliance hooks (an interface seam only, with no verifier and no call site), recursive proof aggregation, and the richer multi-switch governance model.” [1]:L63。资产方面：“Native BNB only: the asset field is pinned to native” [1]:L56。
- 公开与隐藏的边界 [1]:L68–72：存款公开 sender、amount、asset；提现公开 recipient、amount、asset；atomic call 公开 unshield 金额、调用 target 和 calldata，以及 reshield 金额；`0x77` 的手续费公开，而且总是用原生 BNB。只有 shielded→shielded 转账四项都隐藏，但走 direct 路径时手续费仍公开。`isOpen` 标记对每个 note 都公开。atomic call 和公开手续费的匿名性来自“同类操作的用户集合”，不是密码学隐藏。没有网络层匿名：IP 和时间仍可能暴露身份，relayer 两者都能看到，因此它是元数据层面的可信方。
- 工具：`newl1-shield` CLI（`keygen`/`prove`/`scan`/`wallet`）[1]:L44–50。`0x77` 需要随客户端发布的电路工具，没有通用 SDK [3]:L17、L101。

**不确定之处**
- 文档没写：note commitment 和 nullifier 用什么哈希（Poseidon 等）、Merkle 树深度、note 密文用什么加密方案、导入的是哪一份 SRS、电路约束规模。客户端源码没有公开（通用说明已知；本路**没有用 `gh` 复查**，因为本会话没有 shell）。
- `deferBatchInsert` 是系统交易定期执行、任何人可调用，还是两者都有？[1]:L60、[3]:L92、[7]:L314 的表述可以合起来理解为“系统每 50 块执行一次，外部也可以手动推进”，这是解读，不是原文。
- `privDeposit` 的 `$SCHEME`（uint8）是否就是给 “reserved post-quantum authorization scheme” 预留的位置，文档没有说明。

## Q4' 可组合性：只是 private payment 吗？

**答案**：比 private payment 多一步，但不是隐私执行。atomic call 能用池里的余额触发**一次公开的 EVM 调用**，结果以 **open note**（owner 隐藏，amount 和 asset 公开）回到池中。调用的 target、calldata、unshield 和 reshield 金额全部公开。调用失败时**花费不回滚**，托管的价值可以重试。和其他方案相比：它接近 Railgun 的 RelayAdapt（unshield → 公开调用 → reshield），区别在失败语义和 reshield 后 note 是 open 的；Zcash Orchard 只做纯支付；Aztec 在客户端执行私有函数。

**依据**
- atomic call 的定义与公开面见 [1]:L31、L68。open note 的定义是 “amount and asset are public (`isOpen=1`) while its owner stays private, produced by the atomic-call reshield path” [1]:L24。
- 执行顺序：“The spend settles and escrows the payout first; the call itself runs in a second frame, issued as `deliver`. A reverted call leaves the settlement committed and the escrow retryable; it does not undo the spend or refund the fee.” [3]:L97。
- 可调用的目标：文档只写 “a public EVM call (a DEX swap, for example)” [1]:L31，**没有提到 target 白名单，也没有提到限制**。“能调用任意合约”只是推断，原文没有直说。
- 资产限制：只支持原生 BNB [1]:L56。因此 atomic call 的输入只能是 BNB。返回值如果是 ERC-20，能不能 reshield？考虑到 “asset field is pinned to native”，**很可能不能**，但文档没有明说（speculative）。
- Railgun：“Any number of ordered contract calls can be wired together and executed against a private balance … (1) an unshield … (2) a multi-call … (3) the result is shielded back … single block and one transaction”，以及 “In the case of a contract call failure, the entire call will revert.” [16]。也就是说 Railgun 失败时整体回滚，New L1 失败时花费照样成立。
- Zcash Orchard：ZIP-224 定位为 “shielded protocol”，使用 Halo 2，不需要 SRS，转出池子时会暴露金额 [17]。（这是支付协议，没有合约调用面；结论来自 ZIP-224 内容，属于 interpretation。）
- Aztec：“Private functions are executed client side … Public functions are executed by a remote network of nodes”，私有输入不离开客户端 PXE [18]。

**不确定之处**：atomic call 能否多次调用、能否批量、重入和回调怎么约束、托管价值由谁、在什么期限内重试，文档都没写。

## Q5 PQ：LtHash 是什么、和 Falcon 什么关系、整体密码学栈

**答案**：LtHash 是**格基同态（可增量）集合哈希**，不是签名，也不是 Falcon。它把每个 flat KV 条目（`0x00‖address` 账户；`0x01‖address‖slot` 存储）用 BLAKE3 XOF 扩展成 1024 个 `u16`（2048 字节），所有活跃条目按元素做 wrapping 加法，得到 2KB 累加器，再取 `BLAKE3(accumulator)` 作为 32 字节的 `state_root`。文档称安全性建立在 SIS 上，“~128-bit”，并引用 Bellare–Micciancio（1997）和 Solana SIMD-0215。**但是**：2026-09-18 发表的 ePrint 2026/2083 给出了针对**同一参数**（N=1024、d=16）约 2^81 次哈希查询的碰撞攻击；SIMD-0215 已于 2026-09-25 更新安全一节并承认这一点，New L1 的文档（2026-10-22）仍只写 ~128-bit。按组件看，New L1 现有的签名和证明组件（BLS、secp256k1、P-256/WebAuthn、ECDSA auth proof、BN254 PLONK）都是经典椭圆曲线密码，不是 PQ。PQ 只有两处：隐私池“预留但未实现”的 PQ 授权方案，以及路线图里“混合方案 + 借 AA 升级”的研究方向。

**依据**
- 参数表与条目编码见 [2] state-db.md:L13–18、L28–29。哈希输入是 `BLAKE3(domain_tag ‖ 0x00 ‖ key ‖ 0x00 ‖ value)`，XOF 输出读成 1024 个小端 `u16` [2]:L39。累加器是所有活跃条目的逐元素 wrapping `u16` 和，空状态为全零 [2]:L41。`mix_in`/`mix_out` 互为逆运算，单次更新 O(1)，与顺序无关，可以分片并行；不用 SIMD 和浮点，结果逐位一致 [2]:L43–45。`state_root = BLAKE3(accumulator_bytes)` [2]:L51。
- 账户值的编码是 `nonce(8B LE)‖balance(32B LE)‖code_hash(32B)`；值为零的槽不计入 [2]:L28、L35。从 block 0 起就用这套方案，没有分叉开关 [2]:L65。节点在内存里按区块哈希保留最近 256 个累加器 [2]:L69。最终化的累加器每块归档 2KB，200ms 出块时约每天 0.9GB [2]:L96。
- 安全性原话：“Security rests on the Short Integer Solution problem … The 1024 × `u16` dimension targets ~128-bit security, following Bellare–Micciancio (1997) and the same construction Solana adopted in SIMD-0215.” [2]:L47。
- 与 SIMD-0215 对照 [13]（@f1afd94）：同样是 BLAKE3 XOF 输出 2048 字节、1024 个 u16 做 wrapping add/sub、`out = blake3(2048B)` 得到 32 字节。**参数完全相同**。不同之处在于：Solana 对整个账户（lamports、data、executable、owner、pubkey）做一次 hash，lamports==0 的账户记为全零；New L1 把账户和每个存储槽分开成条目，加 kind byte 做域分离，账户只承诺 `code_hash`。Solana 的 LtHash 混入 bank hash，New L1 的直接作为 header `state_root`。SIMD-0215 写明 “does NOT support inclusion/exclusion proofs” [13]。
- 安全性的新进展：ePrint 2026/2083（Ding、Gong、Jiang、Tang，发表于 2026-09-18）指出 “For LtHash16 with (N,d)=(1024,16), used at Facebook and in Solana, our attack requires approximately 2^81 hash queries … at most 2^101 scalar operations … far below … the original claim of at least 200-bit security” [14]。SIMD-0215 已据此改写安全一节，结论是这次攻击仍不实用；另一条论证是碰撞集合至少要约 2^72.83 个元素，而 Solana 只有 lamports 非零的账户参与，总数受 u64 总市值约束、少于 2^65，所以构造不出合法状态 [13]。Lewi et al.（2019）原本声称 “at least 200 bits of security” [15]，SIMD-0215 说的是 “target 128-bit collision security” [13]，New L1 说 “~128-bit” [2]:L47，三者口径各不相同。
- Falcon 的关系（interpretation）：LtHash 是同态集合哈希和状态承诺；Falcon（FN-DSA）是格基签名。两者都与“格”有关，但属于不同的原语。New L1 文档里没有出现 Falcon（本路读过的页面中没有）。
- 组件清单：
  - 共识投票：BLS 聚合投票，⌈2N/3⌉，“the same construction BSC uses” [5] consensus.md:L24、L29。**文档没写曲线**；BEP-126 原文也只写 “BLS” [20]。
  - 交易签名：普通交易用 secp256k1；`0x76` 支持 secp256k1、P256（secp256r1）和 WebAuthn [6] account-abstraction.md:L61–63、[3]:L43；`SignatureVerifier` 预编译 [4]:L23。
  - 隐私：BN254 上的 PLONK [3]:L62；auth proof 证明一份 EIP-712 的 EOA 签名，验证器叫 “ECDSA auth-proof verifier” [1]:L21、L52。
  - 状态承诺：LtHash，加 BLAKE3 [2]。
  - PQ 计划：隐私池的 “reserved post-quantum authorization scheme” 未实现 [1]:L63。路线图写的是 “testing a hybrid approach that layers quantum-resistant protection on top of today's cryptography”，以及 “researching how account abstraction can let users adopt quantum-safe security without changing their existing addresses” [12]（这一节在博客里是 BNB Chain 全栈的 “Post-Quantum Readiness”，不是 New L1 专属）。路线图里 New L1 一节只把 LtHash 写成性能手段（“LtHash-based storage”，为了 100K+ TPS），**没有称它为 PQ** [12]。
  - 量子脆弱性：NIST IR 8547 ipd 写明 ECDSA/EdDSA/RSA 及基于椭圆曲线的方案 “are vulnerable to Shor's Algorithm” [19]。BLS 和 BN254 上的 KZG/PLONK 同样依赖椭圆曲线离散对数，所以是量子脆弱的（推断）。
- “Quantum Future” 的出处：Decrypt 的标题 “BNB Chain Plans New Layer-1 for AI Agents and Quantum Future” [21] 对应的是路线图里全栈的 “Post-Quantum Readiness” 研究段落 [12]，**不是**说 New L1 已有 PQ 组件。

**不确定之处**
- New L1 的状态条目包括存储槽，零余额账户也计入（genesis 无条件纳入 alloc 中的所有账户 [2]:L65）。因此 SIMD-0215 依赖 lamports 总量上限的“碰撞集合太大、构不成合法状态”论证**不能直接搬到 New L1**。New L1 是否有类似的上界，文档没讨论（speculative）。
- BLS 曲线（BSC 实现通常是 BLS12-381）在 New L1 文档中没有写明。
- 隐私池 note 用什么加密方案没写，因此“先存后解”（HNDL）风险能否成立无法判断。

## 状态承诺的代价：eth_getProof、轻客户端与桥

**答案**：累加器是“和”而不是树，没有包含路径，`eth_getProof` 总是返回 `-32004`。桥和轻客户端目前只能依靠 BLS 最终性投票加全节点响应，“accumulator-native” 的包含证明还只是计划。snap sync 不存在，整状态 debug 读取被拒绝。与 MPT 相比，换来的是 O(1) 更新、可并行，以及 32 字节就能比较执行结果是否分歧。

**依据**：[2]:L102 原话 “Until an accumulator-native inclusion proof ships, verification has to rest on the chain's BLS finality votes and full-node responses”。[7]:L53 写 “An accumulator-native scheme is planned.”。snap sync 不存在，计划用检查点累加器同步替代 [2]:L106。`debug_dumpBlock` 等接口返回 `-32004` [2]:L107。另见 [8] json-rpc-endpoint.md:L34、[9]:L34、[11] examples.md:L89。累加是累积式的，任何一处分歧都会污染后续所有块，比较只需 32 字节 [2]:L80–82。磁盘上的规范状态用明文 key [2]:L86。

**不确定之处**：accumulator-native 证明的格式和时间表，以及 BSC↔New L1 桥用什么方式验证 New L1 状态，都没有一手资料。

---

## 外部调研中被修正的地方（ChatGPT Deep Research [22]）

1. **“PLONK 类 proof”（§8.1）不够精确**：文档明确写的是 PLONK，每次花费**两个**证明（pool proof 和 auth proof），gnark **BN254**，各 864 字节 [1]:L21、[3]:L62。外部调研漏掉了 split proof 和曲线。
2. **“trusted setup 和电路第三方审计尚未完全完成”（§8.3）说轻了**：原文是 trusted setup 用的是**导入的现成公共 SRS**，New L1 自己的仪式还没办；电路**未审计**；“Do not treat it as safe for real value” [1]:L9–10、L67、[9]:L30。
3. **“只支持原生 BNB”**：正确 [1]:L56。
4. **0x77**：§2.1 提到了 `0x77`，但 §8 完全没讲 direct 和 relayer 两条提交路径、`0x77` 没有发送方和 nonce、由证明本身授权等要点 [1]:L35–40、[3]:L55–69。§8.2 说“直接 gas fee 仍可能公开”，原文是 direct 路径下手续费**一定公开**，relayer 路径下是私有 fee note [1]:L37–38、L68。
5. **Atomic call 的结果“重新写入新的 open/shielded note”（§8.2）不准确**：原文只说 reshield 成 **open note**（金额和资产公开）[1]:L24、L31。外部调研还漏掉了失败语义：花费先结算，调用回滚时花费不撤销、手续费不退，托管价值可以重试 [3]:L97。
6. **“1024 个 u16 / 2048 字节”**：正确 [2]:L14、L39。
7. **“约 128-bit security”（§9.2）已经过时，而且缺少关键反证**：外部调研照搬了文档的 ~128-bit [2]:L47，没有提到 2026-09-18 的 ePrint 2026/2083：同一组参数存在约 2^81 次查询、≤2^101 次运算的碰撞攻击 [14]；也没有提到 SIMD-0215 已在 2026-09-25 改写安全一节 [13]。Lewi et al. 原文的说法是 ≥200-bit [15]，与 128-bit 口径不同。
8. **“bridge、light client … 需要理解新的 accumulator-native proof”（§9.4）把计划写成了现状**：这种证明还没有发布，原文是 “planned”，目前只能依靠 BLS 最终性投票和全节点 [2]:L102、[7]:L53。
9. **“隐私交易的大规模 proof aggregation”被放在“已提出但仍需验证”（§2.2）**：文档里只有 “recursive proof aggregation” 被列为未实现 [1]:L63，没有“大规模聚合”这类已提出的设计。
10. **“view key 让收款人或观察者解密 note”（§8.1）**：原文是 view key “used only to detect and decrypt incoming notes” [1]:L22，没有提到第三方观察者或选择性披露。路线图写了 “selective disclosure for compliance” [12]，但文档里 compliance hooks “an interface seam only, with no verifier and no call site” [1]:L63，路线图宣传的内容与文档里的实现进度不一致。
11. **“PQ 组件是 lattice-inspired state commitment”（§1.6、§9）的说法来源不明**：官方文档和路线图都没有把 LtHash 称为 PQ 组件。路线图的 PQ 一节说的是“混合方案 + AA 无感升级”的研究 [12]，New L1 一节只把 LtHash 当作性能手段 [12]。“New L1 的 PQ = LtHash”是媒体和外部调研的归纳，不是官方表述。不过外部调研“不是 Falcon、不是端到端 PQ”的结论本身成立。
12. **漏项**：deposit-only pause、合约不可变 [1]:L73；phantom nullifier [1]:L20；注册会关联 EOA [1]:L69；`isOpen` 标记对每个 note 公开 [1]:L70；note 插入每 50 块执行一次 [1]:L60；atomic call 的公开面包括 calldata 和金额 [1]:L68。

---

## 来源

1. **PRIMARY** newl1-docs@ef5a632/core-concepts/privacy.md（线上 https://docs.bnbchain.org/newl1/core-concepts/privacy/）：ShieldedPool 的结构、流程、提交路径、现状、未实现项和安全假设。
2. **PRIMARY** newl1-docs@ef5a632/core-concepts/state-db.md：LtHash 编码、参数、安全性表述，以及 eth_getProof 和 snap sync 的代价。
3. **PRIMARY** newl1-docs@ef5a632/developers/transaction-types.md：`0x77` 字段、PLONK/BN254/864 字节、公开信号、atomic call 失败语义、公开调用路径。
4. **PRIMARY** newl1-docs@ef5a632/governance/system-contracts.md：ShieldedPool `0x…5000`、ShieldedAuthVerifier `0x…5003`、SignatureVerifier（secp256k1/P256/WebAuthn），以及这些合约是 New L1 原创。
5. **PRIMARY** newl1-docs@ef5a632/core-concepts/consensus.md：BLS 投票覆盖层，与 BSC 同构，⌈2N/3⌉；没写曲线。
6. **PRIMARY** newl1-docs@ef5a632/core-concepts/account-abstraction.md：签名方案表。
7. **PRIMARY** newl1-docs@ef5a632/developers/json_rpc/newl1-api-list.md：eth_getProof `-32004`、“accumulator-native scheme is planned”，以及系统交易中的 shielded-pool drains。
8. **PRIMARY** newl1-docs@ef5a632/developers/json_rpc/json-rpc-endpoint.md：没有 eth_getProof 的简述。
9. **PRIMARY** newl1-docs@ef5a632/faq.md：隐私池不能放真钱，电路未审计，用的是导入的 setup；内部 devnet。
10. **PRIMARY** newl1-docs@ef5a632/overview.md：devnet 现状，完整的 shielded-pool 流程已在 devnet 跑过，基于 reth/revm。
11. **PRIMARY** newl1-docs@ef5a632/developers/examples.md：eth_getProof 示例返回 `-32004`；示例页**没有 shielded 示例**。
12. **PRIMARY** BNB Chain Blog，“BNB Chain H2 2026 Tech Roadmap: Doubling Down on Speed”，2026-07-08，https://www.bnbchain.org/en/blog/bnb-chain-h2-2026-tech-roadmap-doubling-down-on-speed （访问于 2026-10-24）：New L1 一节写了 LtHash-based storage 和 “Native Privacy … selective disclosure for compliance”；“Post-Quantum Readiness” 一节写的是混合方案和 AA 升级研究。
13. **PRIMARY** Solana SIMD-0215 “Homomorphic Hashing of Account State”，solana-foundation/solana-improvement-documents `proposals/0215-accounts-lattice-hash.md` @ `f1afd941b9fa5061ea80a5401feb72172121ebb5`（2026-09-25，“clarify LtHash security considerations (#669)”）：参数与 New L1 相同，不支持包含证明，并记录了 2^81 攻击及 Solana 侧的约束论证。状态为 Activated（2025-08-04 的提交）。
14. **PRIMARY** Ding、Gong、Jiang、Tang，“Two-Bit Lifting for Ternary SIS: Polynomial-Time Collision Attacks on LtHash”，IACR ePrint 2026/2083，发表于 2026-09-18，https://eprint.iacr.org/2026/2083 ：对 LtHash16（1024,16）约 2^81 次查询、≤2^101 次运算的碰撞攻击。
15. **PRIMARY** Lewi、Kim、Maykov、Weis，“Securing Update Propagation with Homomorphic Hashing”，IACR ePrint 2019/227：LtHash 在 Facebook 生产中部署，声称参数 “at least 200 bits of security”。
16. **PRIMARY** RAILGUN Docs，Cross-Contract Calls，https://docs.railgun.org/developer-guide/wallet/transactions/cross-contract-calls （访问于 2026-10-24）：RelayAdapt 的 unshield→multicall→reshield 流程，失败时整体回滚。
17. **PRIMARY** ZIP-224 Orchard Shielded Protocol，https://zips.z.cash/zip-0224 （访问于 2026-10-24）：Zcash 的 shielded 支付协议，使用 Halo 2，不需要 SRS。
18. **PRIMARY** Aztec Docs Overview / PXE，https://docs.aztec.network/developers/overview （访问于 2026-10-24，内容来自搜索摘录，未完整抓取）：私有函数在客户端执行。
19. **PRIMARY** NIST IR 8547 ipd（2024-11），https://nvlpubs.nist.gov/nistpubs/ir/2024/NIST.IR.8547.ipd.pdf ，§2.1.1：ECDSA/EdDSA/RSA 及 ECC 方案 “vulnerable to Shor's Algorithm”。
20. **PRIMARY** BEP-126 Fast Finality，bnb-chain/BEPs `BEPs/BEP126.md`（master，未固定 commit）：只写 “BLS”，没写曲线。
21. 线索：Decrypt，2026-07-08，“BNB Chain Plans New Layer-1 for AI Agents and Quantum Future”：媒体标题的出处。
22. 线索：$DIR/research/BNB-new-L1-deep-dive.md（ChatGPT Deep Research，2026-10-24）§八、§九：被核对的对象。

## 开放问题

- 导入的 SRS 具体是哪一份（Aztec Ignition？PSE perpetual powers of tau？），size bound 多大？New L1 自己的仪式和审计排在什么时间？
- note commitment、nullifier 用什么哈希，Merkle 深度多少，note 加密方案是什么（与 HNDL 风险有关）？
- atomic call 有没有 target 限制？返回 ERC-20 时如何处理？托管价值由谁、在多长期限内重试？
- `privDeposit` 的 `scheme` 字段是否就是 PQ 授权方案的预留位？PQ 授权准备选哪个算法？
- New L1 会不会回应 ePrint 2026/2083，例如加大参数或给出条目数上界的论证？它的条目包括存储槽，Solana 的“lamports 总量上限”论证不适用。
- accumulator-native 包含证明的设计和时间表，以及 BSC↔New L1 桥的验证方式。
- 路线图写的 “selective disclosure for compliance” 与文档中 “compliance hooks 只是接口缝” 之间的差距，什么时候补上。

---

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| P1 | ShieldedPool 是 genesis 预部署的系统合约，地址 `0x…5000`；auth proof 验证器 ShieldedAuthVerifier 在 `0x…5003`，没有硬分叉门槛 | [1] newl1-docs@ef5a632/core-concepts/privacy.md:L52；[4] governance/system-contracts.md:L24–25 | observed | |
| P2 | ShieldedPool/ShieldedAuthVerifier 是 New L1 原创，BSC 上没有对应物 | [4] governance/system-contracts.md:L31 | observed | |
| P3 | 隐私池采用 note（owner commitment、amount、asset、isOpen）+ 只追加 Merkle 树 + nullifier 的 UTXO 式模型 | [1] core-concepts/privacy.md:L18–20 | observed | |
| P4 | 每次花费固定销毁 2 个 nullifier，只有一个真实输入时用无法区分的 phantom nullifier 补位，以隐藏真实输入数 | [1] core-concepts/privacy.md:L20 | observed | |
| P5 | 每次花费带两个 PLONK 证明：pool proof（价值守恒、Merkle 成员资格、nullifier、spend key）和 auth proof（note 中承诺的 EOA 对 EIP-712 消息的签名），两者靠 note commitment 绑定 | [1] core-concepts/privacy.md:L21 | observed | |
| P6 | 证明为 gnark BN254 PLONK，每个恰好 864 字节，长度不符在解码阶段即被拒绝 | [3] developers/transaction-types.md:L62、L95 | observed | |
| P7 | 当前部署导入现成的公共 SRS，没有举办 New L1 自己的仪式；电路未审计；两项都是主网前的未决项，文档要求不要放真钱 | [1] core-concepts/privacy.md:L9–10、L67；[9] faq.md:L30 | observed | |
| P8 | 目前只支持原生 BNB：“the asset field is pinned to native, with no ERC-20/BEP-20 path” | [1] core-concepts/privacy.md:L56 | observed | |
| P9 | 四种流程：Shield（privDeposit，不需证明，公开存款方、金额、资产）、Shielded transfer、Unshield（公开金额、资产、目的地址）、Atomic call | [1] core-concepts/privacy.md:L28–31 | observed | |
| P10 | 一次 shielded transfer 花 1–2 个 note，最多产出 3 个输出（收款、找零、手续费），各自加密给对应 view key | [1] core-concepts/privacy.md:L29 | observed | |
| P11 | `0x77` 原生交易没有 sender、nonce 和外层签名，由两个证明授权，任何 validator 或 builder 都能打包；文档称它是抗审查的后备路径 | [1] core-concepts/privacy.md:L37、L40；[3] developers/transaction-types.md:L12、L55 | observed | |
| P12 | Relayer 路径：relayer 用普通签名交易调用 `transact`，手续费以私有 fee note 支付（金额、资产隐藏）；direct 路径的手续费 `feePerGas × gasLimit` 公开，且用原生 BNB | [1] core-concepts/privacy.md:L37–38、L68 | observed | |
| P13 | `0x77` 有 30 个公开信号，gasLimit 和 feePerGas 写在信号 `[28]/[29]` 里，所以手续费在证明内承诺，不能换 limit 重播；`[12]` 区分 transfer/withdraw/atomic call | [3] developers/transaction-types.md:L63、L67、L69 | observed | |
| P14 | `0x77` 不能用 eth_estimateGas，要先读 `newl1_shieldedGasConstants` 定 gas；被接受的 `0x77` 按声明 limit 全额收费 | [3] developers/transaction-types.md:L96 | observed | |
| P15 | 新 commitment 先排队，由 `deferBatchInsert` 每 50 块（约 10 秒）批量插入；证明验证和 nullifier 销毁不延迟；收到的 note 立即可发现，下次插入后才能花 | [1] core-concepts/privacy.md:L60 | observed | |
| P16 | 一个 32 字节 seed 派生 spend key、note-secret seed、view key；view key 只用于发现和解密收到的 note；EOA 私钥复用为授权密钥 | [1] core-concepts/privacy.md:L22 | observed | |
| P17 | `registerPrivacyInfo` 会把 EOA 与隐私地址公开关联，但各个 note 之间仍互不关联 | [1] core-concepts/privacy.md:L23、L69 | observed | |
| P18 | Atomic call：先结算并托管，再在第二个 frame（`deliver`）执行公开调用；调用回滚时花费和手续费都不回退，托管价值可以重试 | [3] developers/transaction-types.md:L97；[1] core-concepts/privacy.md:L31 | observed | |
| P19 | Atomic call 公开 unshield 金额、调用 target、calldata 和 reshield 金额，结果以 open note（owner 隐藏，amount、asset 公开）回到池中 | [1] core-concepts/privacy.md:L24、L31、L68 | observed | |
| P20 | 只有 shielded→shielded 转账同时隐藏发送方、收款方、金额、资产；即便如此，direct 路径的手续费仍公开 | [1] core-concepts/privacy.md:L68 | observed | |
| P21 | 隐私池没有网络层匿名，relayer 能看到 IP 和时间，是元数据层面的可信方；atomic call 和公开手续费的匿名性来自用户集合，不是密码学隐藏 | [1] core-concepts/privacy.md:L71–72 | observed | |
| P22 | ShieldedPool 不可变（没有 admin、proxy、升级路径），唯一受治理的动作是暂停存款；提现、转账、atomic call 不受暂停影响 | [1] core-concepts/privacy.md:L61、L73 | observed | |
| P23 | 未实现：ERC-20/BEP-20 shielding、预留的 PQ 授权方案、paymaster/ERC-4337、按资产的合规钩子（只有接口缝，没有验证器和调用点）、递归证明聚合、多开关治理 | [1] core-concepts/privacy.md:L63 | observed | |
| P24 | New L1 隐私的可组合性是“用池内余额触发一次公开 EVM 调用，结果以 open note 回池”，不是隐私执行，也不是 confidential DeFi | 由 P18、P19、P8 推出：调用和金额公开，回池的 note 金额公开，资产只有 BNB | inferred | |
| P25 | Railgun RelayAdapt 同样是 unshield → 多个公开合约调用 → reshield 的单笔交易，但调用失败时整体回滚，与 New L1 “花费照样成立、托管可重试”的失败语义不同 | [16] docs.railgun.org cross-contract-calls（访问于 2026-10-24）；与 P18 对照 | observed | |
| P26 | Zcash Orchard 是纯 shielded 支付协议，使用 Halo 2，不需要 SRS；Aztec 的私有函数在客户端 PXE 执行，只把证明发给网络 | [17] zips.z.cash/zip-0224；[18] docs.aztec.network/developers/overview | observed | |
| P27 | atomic call 的 target 是否有白名单或限制，文档没写；“能调用任意合约”没有原文支持 | [1] core-concepts/privacy.md:L31 只举 “a DEX swap, for example”，全文没有限制条款 | speculative | |
| P28 | New L1 状态为 flat KV：账户条目 `0x00‖address`→nonce‖balance‖code_hash，存储条目 `0x01‖address‖slot`→value，值为零的槽不计入 | [2] core-concepts/state-db.md:L28–29、L35 | observed | |
| P29 | 每个条目用 BLAKE3 XOF 输出 2048 字节（1024 个小端 u16），全部活跃条目逐元素 wrapping u16 相加成 2KB 累加器，`state_root = BLAKE3(accumulator)`（32 字节） | [2] core-concepts/state-db.md:L14–16、L39、L41、L51 | observed | |
| P30 | 累加器支持 O(1) 的 mix_in/mix_out，与顺序无关、可并行，结果逐位一致；从 genesis 起就使用，没有分叉开关 | [2] core-concepts/state-db.md:L43–45、L65 | observed | |
| P31 | 文档称安全性基于 SIS，1024×u16 “targets ~128-bit security”，引用 Bellare–Micciancio（1997）与 Solana SIMD-0215 | [2] core-concepts/state-db.md:L47 | observed | |
| P32 | SIMD-0215 的 LtHash 参数与 New L1 相同（BLAKE3 XOF 2048 字节、1024 个 u16 wrapping add/sub、32 字节 blake3 输出），但 Solana 对整个账户做一次 hash（含 data、owner），lamports=0 的账户记为零；SIMD-0215 已激活 | [13] solana-improvement-documents proposals/0215-accounts-lattice-hash.md@f1afd94 | observed | |
| P33 | ePrint 2026/2083（2026-09-18）对 LtHash16（N=1024，d=16）给出约 2^81 次哈希查询、≤2^101 次运算的碰撞攻击，远低于原先 ≥200-bit 的说法 | [14] eprint.iacr.org/2026/2083 摘要；[15] eprint 2019/227 摘要 | observed | |
| P34 | SIMD-0215 于 2026-09-25 更新安全一节，承认 2^81 攻击，并用“碰撞集合约 2^72.83 个元素，而 lamports 非零的账户少于 2^65”论证 Solana 仍安全 | [13] SIMD-0215@f1afd94 Security Considerations | observed | |
| P35 | New L1 文档（2026-10-22）的 “~128-bit” 表述没有反映 ePrint 2026/2083 和 SIMD-0215 的更新 | 由 P31、P33、P34 推出：文档提交晚于两者，但只写 ~128-bit，没有提及攻击 | inferred | |
| P36 | Solana 依赖 lamports 总量上限的“碰撞集合构不成合法状态”论证不能直接套用到 New L1，因为 New L1 的条目包括存储槽和零余额账户 | 由 P28、P34 推出；New L1 是否有其他条目数上界，文档未讨论 | speculative | |
| P37 | LtHash 是格基同态集合哈希和状态承诺，不是签名；New L1 已读文档中没有 Falcon/FN-DSA | 由 P29、P31 推出；[1]–[11] 均未出现 Falcon | inferred | |
| P38 | 累加器是“和”而不是树，`eth_getProof` 总是返回 `-32004`；在 accumulator-native 包含证明发布前，桥和轻客户端只能依靠 BLS 最终性投票和全节点响应；该证明方案“is planned” | [2] core-concepts/state-db.md:L102；[7] developers/json_rpc/newl1-api-list.md:L53 | observed | |
| P39 | snap sync 不存在（计划用检查点累加器同步替代），整状态 debug 读取（debug_dumpBlock 等）返回 `-32004` | [2] core-concepts/state-db.md:L106–107 | observed | |
| P40 | 共识最终性用 BLS 聚合投票（⌈2N/3⌉），与 BSC 同构；文档和 BEP-126 都没写明 BLS 曲线 | [5] core-concepts/consensus.md:L24、L29；[20] BEP126.md | observed | |
| P41 | 交易签名方案为 secp256k1、P256（secp256r1）、WebAuthn，由 SignatureVerifier 预编译验证 | [6] core-concepts/account-abstraction.md:L61–63；[4] governance/system-contracts.md:L23 | observed | |
| P42 | NIST 认定 ECDSA、EdDSA 及基于 ECC 的方案对 Shor 算法脆弱 | [19] NIST IR 8547 ipd §2.1.1 | observed | |
| P43 | New L1 现有签名和证明组件（BLS、secp256k1/P256/WebAuthn、ECDSA auth proof、BN254 PLONK）都是经典椭圆曲线密码，都不是 PQ；PQ 只以“预留的 PQ 授权方案（未实现）”的形式出现在文档中 | 由 P5、P6、P23、P40、P41、P42 推出：这些组件都依赖椭圆曲线离散对数 | inferred | |
| P44 | 路线图的 “Post-Quantum Readiness” 是 BNB Chain 全栈研究：测试在现有密码学上叠加抗量子保护的混合方案，并研究用 AA 在不换地址的情况下升级 | [12] bnbchain.org H2 2026 roadmap blog（2026-07-08，访问于 2026-10-24），“Post-Quantum Readiness” 一节 | observed | |
| P45 | 路线图 New L1 一节把 LtHash 写成性能手段（“100K+ TPS through … LtHash-based storage”），没有称其为 PQ；媒体标题 “Quantum Future” 对应的是全栈 PQ 研究段落 | [12] roadmap blog，“A New L1 Takes Shape” 与 “Post-Quantum Readiness” 两节；[21] Decrypt 2026-07-08 标题 | observed | |
| P46 | 路线图宣传 “Native Privacy … with selective disclosure for compliance”，但文档的合规钩子“only an interface seam, no verifier and no call site”，选择性披露尚未落地 | 由 P23 与 [12] roadmap blog “Native Privacy” 条对照推出 | inferred | |
| P47 | 官方称完整的 shielded-pool 流程已在源码构建的 devnet 上跑过，但整个网络仍是内部多验证者 devnet，没有公共 testnet 或 mainnet | [10] overview.md:L67、L69；[9] faq.md:L18 | observed | |
| P48 | `privDeposit` 的 `scheme`（uint8）参数可能就是给 PQ 授权方案预留的位置 | [3] developers/transaction-types.md:L77–78 只出现 `$SCHEME`，没有说明含义 | speculative | |

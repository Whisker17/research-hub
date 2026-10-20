# 论断台账

每条会出现在 explainer 里的论断，都要在这里有一行。
类型：observed（直接观察到，有一手证据）/ inferred（由证据推出）/ speculative（推测，需在页面上标明）。

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| 1 | Algorand 采取了“State Proofs 跨链边界 → LogicSig 合约验签 → 原生账户”的三阶段 PQ 演进路径 | Algorand Technical Brief: Quantum-Resistant Transactions on Algorand with Falcon Signatures (algorand.co) | observed | B, D |
| 2 | Algorand v5.0.0 协议升级（共识规范 v42）于 2026 年 8 月在主网激活，原生支持 Falcon-1024 账户 | Algorand v5.0.0 Release Notes; algod v5.0.0 consensus hash v42 (algorand.co) | observed | B, D |
| 3 | Algorand 主网共识消息仍使用 Ed25519，VRF 仍依赖椭圆曲线，全链抗量子迁移仍在进行中 | Algorand Post-Quantum Cryptography Roadmap (algorand.co/blog) | observed | B |
| 4 | Starknet 原生账户抽象允许用户在 Cairo 合约中直接实现并测试 Falcon-512 验签逻辑，无需共识硬分叉 | Starknet Blog: Quantum Resistance on Starknet; OpenZeppelin cairo-pq-verifiers | observed | B, D |
| 5 | Starknet 的 STARK 证明系统基于哈希函数，天然具备抗量子特性，但 L1 结算仍依赖以太坊共识 | Starknet Documentation: STARK Validity Proofs; pq.ethereum.org | observed | B |
| 6 | Solana 生态的 Winterwallet 使用 Winternitz 一次性签名（WOTS）构建应用级抗量子金库 | Solana Winterwallet Documentation; GitHub: anza-xyz/falcon | observed | B |
| 7 | WOTS、XMSS 等有状态哈希签名若在重试、回滚或多设备上重复使用同一私钥索引，会导致私钥立即泄露 | NIST SP 800-208; Solana Winterwallet Security Warnings | observed | B, C |
| 8 | NIST FIPS 203 标准为 ML-KEM（基于格的密钥封装），仅用于密钥协商与抗 HNDL，不能用于交易签名 | NIST FIPS 203 (August 2024): Module-Lattice-Based Key-Encapsulation Mechanism Standard | observed | C |
| 9 | NIST FIPS 204 标准为 ML-DSA（基于模格的数字签名），是替代 ECDSA 交易签名的核心标准 | NIST FIPS 204 (August 2024): Module-Lattice-Based Digital Signature Standard | observed | C |
| 10 | NIST FIPS 205 标准为 SLH-DSA（无状态哈希数字签名，前身 SPHINCS+） | NIST FIPS 205 (August 2024): Stateless Hash-Based Digital Signature Standard | observed | C |
| 11 | Falcon 算法对应的 NIST FIPS 206（FN-DSA）目前仍处于标准起草与制定推进过程中 | NIST Computer Security Resource Center: PQC Standardization Process | observed | C |
| 12 | ML-DSA-44 公钥为 1,312 字节、签名为 2,420 字节；ML-DSA-65 公钥为 1,952 字节、签名为 3,309 字节 | NIST FIPS 204 Table 1 & Table 2 Specifications | observed | C, E |
| 13 | Falcon-512 公钥为 897 字节、签名约 666 字节；Falcon-1024 公钥为 1,793 字节、签名约 1,280 字节 | Falcon Algorithm Specification (falcon-sign.info); Pornin implementation | observed | C, E |
| 14 | SLH-DSA-128s 签名体积达 7,856 字节，远超以太坊常规交易与内存池负载预算 | NIST FIPS 205 Table 1 Specifications | observed | C |
| 15 | Falcon 的签名端计算复杂，但其验签过程完全确定且可使用纯整数算术实现，无需浮点数 | algorand/falcon Go/C implementation; Thomas Pornin falcon-rust | observed | C |
| 16 | AWS KMS 已正式在 HSM 内部原生支持 ML-DSA-44、ML-DSA-65 与 ML-DSA-87 签名生成与验签 | AWS KMS Developer Guide: Post-Quantum Cryptography Support (docs.aws.amazon.com/kms) | observed | C, G |
| 17 | PQ Code Package 的 `mldsa-native` 由 Linux 基金会 PQCA 维护，包含 C90 实现与 CBMC 形式化验证 | GitHub: pq-code-package/mldsa-native; Linux Foundation PQCA announcement | observed | C |
| 18 | Cloudflare CIRCL 提供了 Go 语言的 ML-DSA-44/65/87 完整实现与汇编优化 | GitHub: cloudflare/circl/sign/mldsa | observed | C, F |
| 19 | RustCrypto `ml-dsa` 曾因 hint 索引单调比较漏洞导致重复 hint 被接受（CVE-2026-24850 / GHSA-5x2r-hc65-25f9），已在 0.1.0-rc.4 修复 | GitHub Advisory Database: GHSA-5x2r-hc65-25f9; CVE-2026-24850 | observed | C, F |
| 20 | 历史常用的 PQ 测试基准库 PQClean 已于 2026 年 8 月正式归档，不再作为活跃维护上游 | GitHub: PQClean/PQClean (Archived August 2026 notice) | observed | C |
| 21 | Fireblocks EVM ML-DSA-44 合约验签器在纯 EVM 下单次验签消耗约 123 万 gas | GitHub: fireblocks-labs/evm-ml-dsa-verifier README & benchmarks | observed | E |
| 22 | ERC-7562 账户抽象验证规范规定单个 UserOp 验证阶段 gas 上限为 500,000，ABI 编码体积上限为 8,192 字节 | EIP-7562: Account Abstraction Validation Scope Rules (eips.ethereum.org) | observed | E |
| 23 | EIP-7702 设置委托代码（`0xef0100 || address`）后，EOA 的 ECDSA 私钥依然保留完整交易发起权限 | EIP-7702 Specification: Transaction Execution & Authorization (eips.ethereum.org) | observed | E, H |
| 24 | EIP-3607 明确将带有 7702 委托标识的账户排除在“禁止合约作为发送者”检查之外，EOA 仍可直接发交易 | EIP-3607 Specification & EIP-7702 interaction rules (eips.ethereum.org) | observed | E, H |
| 25 | 掌握被破解 ECDSA 私钥的攻击者可直接向代币合约发起顶层交易，直接绕过 7702 委托的 PQ 验签代码 | EIP-7702 Execution Semantics (ethereum.org/roadmap/pectra/7702) | observed | H |
| 26 | 掌握被破解 ECDSA 私钥的攻击者可签署新的 authorization tuple，在协议层覆盖或撤销 7702 委托 | EIP-7702 Specification: Revocation and Delegation Overwrite Rules | observed | H |
| 27 | 真正的智能合约账户受 EIP-3607 保护，无法作为顶层标准交易的 `from` 发送者，杜绝了 ECDSA 协议层绕过 | EIP-3607 Specification: Reject transactions from senders with code | observed | H |
| 28 | EIP-8355 提出 ML-DSA 预编译合约草案，输入为公钥、签名与消息，返回 32 字节执行结果 | EIP-8355 Draft: ML-DSA Signature Verification Precompile (Danno Ferrin) | observed | F |
| 29 | 以太坊社区同时存在 EIP-8051 与 EIP-8355 等相互竞争的 ML-DSA 预编译草案，其地址与接口尚未定稿 | EIP-8051 Draft & EIP-8355 Draft on Ethereum Magicians & EIPs repository | observed | F |
| 30 | OP Stack 具备新增自定义系统预编译的先例（如 P256VERIFY 位于 0x0100） | OP Stack Specification: Precompiles (specs.optimism.io) | observed | F |
| 31 | Mantle 已部署 OP Succinct，其执行状态转换由 Kona（Rust）运行于 SP1 RISC-V zkVM 内部并生成证明 | Succinct Case Study: Mantle OP Succinct (blog.succinct.xyz/case-studies/mantle) | observed | F |
| 32 | SP1 的内部约束电路预编译（Core Precompile）与 EVM 字节码调用的合约预编译属于完全不同的层级 | Succinct Docs: SP1 Precompile Specification (docs.succinct.xyz) | observed | F |
| 33 | Mantle 新增预编译必须在执行端（op-geth, Go）与状态转换证明端（Kona, Rust）实现双向语义等价 | OP Succinct Architecture & Kona State Transition Integration | observed | F |
| 34 | Mantle 针对每次 Ethereum L1 硬分叉通常执行两次分叉：第一次兼容性防 halt，第二次引入新特性 | Mantle Engineering Hard Fork Workflow (User Brief & Release Documentation) | observed | F |
| 35 | 提前占用未定稿的以太坊低位预编译地址（如 0x12/0x13），在上游后续硬分叉时面临冲突覆盖与共识分歧风险 | EIP-8051 vs EIP-8355 address proposals collision analysis | inferred | F |
| 36 | Mantle 应将自定义 PQ 预编译置于独立的扩展命名空间（如 0x0100 以上），以隔离上游 rebase 影响 | OP Stack Custom Precompile Isolation Pattern (inferred from P256VERIFY) | inferred | F |
| 37 | 首选端到端无状态签名验签预编译而非通用 NTT 向量原语，可将密码学正确性与审计边界收敛在底层 | Cryptographic API Design & Attack Surface Analysis (inferred) | inferred | F |
| 38 | EIP-7702 适合作为低成本资产批量迁移的引导工具，但无法作为抵御 ECDSA 破解的后量子安全边界 | EIP-7702 & EIP-3607 Dual Bypass Analysis (inferred) | inferred | H |
| 39 | 机构长期储备账户首选 ML-DSA-65 作为基准算法，因其标准已冻结且获得主流 HSM 硬件与托管商原生支持 | NIST FIPS 204 & AWS KMS Enterprise Support Analysis (inferred) | inferred | C, G |
| 40 | 采用“日常经典+PQ 组合审批，极端时 PQ 单向接管”的双轨权限状态机，可在不牺牲日常效率的前提下实现安全闭环 | Institutional Smart Account Security Architecture (inferred) | inferred | G |
| 41 | PQ 公钥或其哈希承诺必须在 ECDSA 仍具备可信度时提前上链绑定，以防量子威胁发生时公钥注册被抢跑 | Key Compromise Front-Running Analysis (inferred) | inferred | G, H |
| 42 | 纯合约 EVM 验签（单次 >1.2M gas）无法直接在 ERC-7562 限制（500k gas）下通过公共 Bundler 内存池打包 | ERC-7562 Mempool Constraints vs Fireblocks EVM Verifier (inferred) | inferred | E |
| 43 | Mantle 无需等待以太坊 Native AA 最终标准，依托 ERC-4337 智能账户即可先行落地机构级 PQ 容灾能力 | ERC-4337 Compatibility & Algorand Phase 2 LogicSig Precedent (inferred) | inferred | D, G |
| 44 | 账户级 PQ 保护仅解决授权风险，无法防御 L1 共识、KZG 数据可用性或 Groth16/PLONK 结算证明系统的量子威胁 | Layered PQ Cryptographic Boundary Analysis (inferred from Part 1) | inferred | B, I |
| 45 | 在初期低频机构金库调用场景下，Kona 内部纯 Rust ML-DSA 验签计算对 SP1 证明开销影响有限，暂无需定制 SP1 电路预编译 | OP Succinct Proving Overhead & Vault Frequency Analysis (inferred) | inferred | F |
| 46 | 智能账户曾授予外部 DeFi 协议的代币授权（Allowance）构成残留风险，钱包自身的 PQ 冻结无法直接阻止第三方合约利用 | ERC-20 Allowance & Smart Contract Interaction Mechanics (inferred) | inferred | G |
| 47 | 以太坊 L1 原生账户抽象（Native AA）与统一 PQ 签名标准的正式定稿与主网激活预计不会早于 2028-2029 年 | Ethereum Roadmap (Pectra -> Hegotá -> Amsterdam) & pq.ethereum.org (speculative) | speculative | D, F |
| 48 | 由于快速傅里叶采样算法实现的复杂度，主流硬件安全模块（HSM）对 Falcon（FIPS 206）的原生支持将比 ML-DSA 滞后 2-3 年 | Hardware Security Module Vendor PQC Roadmaps & Cryptographic Engineering (speculative) | speculative | C, G |
| 49 | 仅当 Mantle 上 PQ 交易量占单日区块 Gas 比例超过 5% 时，为 SP1 专门开发硬件约束电路级 PQ 预编译才具有成本正收益 | ZK Rollup Prover Economics & Circuit Amortization Estimation (speculative) | speculative | F |
| 50 | 未来以太坊或 Mantle 可能会在协议层推出不可逆注销 EOA ECDSA 权限的硬分叉机制，使原地址完全升级为不可旁路的合约账户 | Protocol-level EOA Deprecation & Immutable Delegation Proposals (speculative) | speculative | H |
| 51 | EIP-8355 的消息是末尾变长字节、按 FIPS 204 验原始消息，并非 32 B 摘要；8355 在 EIP-8081 中为 Declined for Inclusion | 第三篇 pq-signature-selection 台账 E36、E37、E44（EIP-8355 原文；EIP-8081 @6e69e49，2026-10-19） | observed | G |
| 52 | `0x0100–0x01ff` 由 EIP-7587（Final）保留给 RIP 流程，P256 位于 `0x100`；`0x0101` 不是专有命名空间 | 第三篇台账 E39、E45（EIP-7587、EIP-8052 原文） | observed | G |
| 53 | EIP-8141 是 Hegotá 的 SFI，ethereum.org 预计 Hegotá 于 2027 Q2 上主网，台账 #47 的“2028–29 年前难以定稿”已过时 | 第三篇台账 E40、E41、E46 | inferred | G |
| 54 | 预编译应定位为近期容灾工具；适配器应抽象“验证后端”并支持多把不同算法公钥 | 第三篇台账 E47、E48、S7 | inferred | G |

# PQ 签名算法候选评估与工程库选型

## 一、为什么核心候选必须是数字签名（Digital Signatures）
在抗量子密码学中，必须严格区分两类原语：
- **KEM（Key Encapsulation Mechanism，密钥封装）**：如 NIST FIPS 203 的 **ML-KEM**（前身 Kyber）。用于通信双方协商临时会话密钥，防御“先收集后解密（HNDL）”。**它不能用来做交易签名或账户授权！**
- **DSA（Digital Signature Algorithm，数字签名）**：如 NIST FIPS 204 的 **ML-DSA**（前身 Dilithium）与 FIPS 205 的 **SLH-DSA**（前身 SPHINCS+），以及推进中的 FIPS 206 **FN-DSA / Falcon**。这才是替代 ECDSA 进行区块链账户授权的唯一候选类。

---

## 二、候选数字签名算法关键指标对比

| 算法 | 标准与类别 | 公钥大小 (Bytes) | 签名大小 (Bytes) | 签名速度 | 验签速度 | DA & Mempool 影响 | 机构硬件支持 |
|---|---|---|---|---|---|---|---|
| **ML-DSA-44** | FIPS 204 (NIST Cat 2) | 1,312 | 2,420 | 极快 | 极快 | 较友好 (~3.7 KB 合计) | AWS KMS、HSM 原生支持 |
| **ML-DSA-65** | FIPS 204 (NIST Cat 3) | 1,952 | 3,309 | 极快 | 极快 | 适中 (~5.3 KB 合计) | AWS KMS、HSM 推荐基线 |
| **ML-DSA-87** | FIPS 204 (NIST Cat 5) | 2,592 | 4,627 | 快 | 快 | 偏重 (~7.2 KB 合计) | 机构冷储备可用，日常偏大 |
| **Falcon-512** | Draft FIPS 206 (Cat 1) | 897 | ~666 | 较慢 (高精度采样) | 极快 (确定性验证) | 极佳 (~1.5 KB 合计) | 硬件实现少，需浮点/多项式树 |
| **Falcon-1024** | Draft FIPS 206 (Cat 5) | 1,793 | ~1,280 | 较慢 | 极快 | 佳 (~3.1 KB 合计) | Algorand 主网已采用，通用 HSM 待补 |
| **SLH-DSA-128s** | FIPS 205 (Cat 1) | 32 | 7,856 | 慢 (哈希树遍历) | 慢 | 严重超标 (~7.9 KB) | 哈希保守假设，但不适合高频链上 |
| **XMSS / LMS** | NIST SP 800-208 | 变长 (数十字节) | 变长 (2-4 KB) | 中 | 快 | 有状态签名，状态回滚致命 | 不推荐在分布式或多端环境使用 |

---

## 三、算法选型深度权衡：ML-DSA vs Falcon

### 1. ML-DSA 的决定性优势：标准确定性与机构生态
- **正式发布**：FIPS 204 于 2024 年正式发布，标准已完全冻结，不再存在参数或编码的向后兼容风险。
- **机构级 HSM/KMS 支持**：AWS KMS 已正式支持 ML-DSA-44/65/87 在 HSM 内部生成私钥与签名。各大机构托管服务商（如 Fireblocks、Copper）均将 ML-DSA 作为 PQC 路线的首选支持对象。
- **纯整数运算**：基于 Module-LWE，签名和验签完全使用模整数算术（Modulus $q = 8380417$），实现简单，极其适合跨语言（Go/Rust/C）与 zkVM（RISC-V）验证。
- **缺点**：签名体积较大（ML-DSA-65 签名 3,309 字节，公钥 1,952 字节）。

### 2. Falcon 的优势与风险
- **核心优势**：签名极其紧凑（Falcon-512 签名仅 666 字节），在 Rollup DA 成本敏感场景下具诱惑力；验签速度极快。
- **致命软肋**：
  - **标准尚未正式敲定**：FIPS 206（FN-DSA）仍在起草中。Thomas Pornin 等作者明确警告：在最终标准发布前，不能保证编码向后兼容！
  - **签名端复杂度高**：密钥生成与签名过程严重依赖复杂的快速傅里叶采样（Fast Fourier Sampling）与高精度计算，防侧信道攻击难度大，缺乏硬件安全模块（HSM）的广泛支持。
  - **确定性验证并非不可能**：虽然签名复杂，但 Falcon 的**验证过程**是完全确定性的，不需要浮点运算，可以保证多客户端共识一致。

### 3. 最终选型建议
- **首选基线：ML-DSA-65（FIPS 204）**。理由：Mantle 当前定位是高价值机构资金的冷储备与灾备，标准稳定性、安全余量（NIST 类别 3 相当于 AES-192）及机构 HSM 兼容性远比节省 2KB DA 费用更重要。
- **对照组与轻量方案：ML-DSA-44 与 Falcon-512** 作为基准测试与备选。

---

## 四、活跃开源密码学工程库调研与评测

| 库 / 项目 | 语言 | 维护状态 | 核心优势 | 注意事项与集成边界 |
|---|---|---|---|---|
| **PQ Code Package (`mldsa-native`)** | C90 | 极度活跃 (Linux 基金会 PQCA) | 包含 CBMC 形式化验证、Valgrind 侧信道检查、可移植与架构优化 | 适合作为 Mantle op-geth 的 CGO 底层或测试对比基线 |
| **Cloudflare CIRCL (`sign/mldsa`)** | Go | 活跃维护 | 纯 Go 与汇编优化，直接无缝集成到 `op-geth` | 需固定具体 commit/tag，做好针对恶意畸形签名的单元测试 |
| **RustCrypto (`signatures/ml-dsa`)** | Rust | 活跃维护 | 纯 Rust，无 `unsafe`，完全适配 Kona 与 SP1 zkVM | **关键安全历史**：GHSA-5x2r-hc65-25f9 (CVE-2026-24850) 曾因 `<` 改为 `<=` 导致重复 hint 被接受。区块链集成必须保证使用 `>= 0.1.0-rc.4`，确保共识一致性！ |
| **`algorand/falcon`** | Go / C | 活跃 (伴随 v5.0.0 发布) | 具备主网实战验证的确定性 Falcon-1024 验证逻辑 | 包含 Algorand 特有的打包与上下文逻辑，剥离需重新封装 |
| **Thomas Pornin `falcon-rust`** | Rust | 稳定维护 | 算法原作者实现，包含完整常数时间与严格边界检查 | 编码格式需注意最终 FN-DSA 标准出台后的对齐 |
| **Fireblocks `evm-ml-dsa-verifier`** | Solidity | 实验性 / PoC | 提供了纯 EVM 合约验证 ML-DSA-44 的范例 (耗费约 1.2M gas) | 未经生产审计，gas 消耗无法进入 ERC-7562 内存池 |
| **PQClean** | C | **已于 2026-08 归档** | 历史参考价值高 | **不再推荐作为生产依赖上游**，官方推荐迁移至 PQ Code Package |

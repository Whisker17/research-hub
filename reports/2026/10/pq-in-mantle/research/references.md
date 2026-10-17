# 调研参考资料与来源登记

## 一、用户输入与前置报告
- **User Thoughts Draft**: `/Users/whisker/Work/src/personal/personal-knowledge-base/personal-knowledge-base/Research Briefs/drafts/pq-in-mantle.md`
  - 核心诉求：短期可做的 PQ 方案、Algorand 等公链借鉴、合约级 AA + PQ 验签预编译、EVM 兼容与 Mantle 每年“两次硬分叉”适配、7702 容灾可行性与一键切换评估。
- **GPT Deep Research Reference**: `/Users/whisker/Work/src/personal/personal-knowledge-base/personal-knowledge-base/Research Briefs/references/pq-in-mantle.md`
  - 核心论断：7702 不能作为 PQ 安全边界（原 ECDSA 仍有顶层交易发起与委托撤销权）；PQ 账户不等于 PQ 链；Mantle 需兼顾 op-geth 与 OP Succinct（Kona/SP1）双端一致性；推荐标准 ML-DSA-65。
- **系列前篇报告**: `reports/2026/10/post-quantum-mantle/`
  - 标题：《后量子（PQ）从入门到路线：Ethereum / Starknet / Aztec 怎么做，Mantle 能主动做什么》
  - 结论：全栈密码学依赖梳理、Shor/Grover 威胁底册、Ethereum 2029 目标、BN254 PLONK 与无时间锁 ECDSA 多签风险。

## 二、一手来源与技术规范 (PRIMARY SOURCES)
1. **Algorand Post-Quantum Roadmap & v5.0.0 Release**:
   - Algorand 官方技术简报：*Technical Brief: Quantum-Resistant Transactions on Algorand with Falcon Signatures* (algorand.co)
   - Algorand v5.0.0 主网激活规范 (2026-08, consensus spec v42, algod v5.0.0): Falcon-1024 原生账户、费用乘数与状态证明演进。
   - Algorand Falcon 源码库：`github.com/algorand/falcon`
2. **NIST Post-Quantum Cryptography Standards**:
   - FIPS 203: Module-Lattice-Based Key-Encapsulation Mechanism Standard (ML-KEM)
   - FIPS 204: Module-Lattice-Based Digital Signature Standard (ML-DSA)
   - FIPS 205: Stateless Hash-Based Digital Signature Standard (SLH-DSA)
   - Draft FIPS 206: Falcon (FN-DSA) 推进状态
3. **EIP 规范与以太坊路线**:
   - EIP-7702: Set EOA account code for one transaction / delegation designator (`0xef0100 || address`)
   - EIP-3607: Reject transactions from senders with code (and 7702 delegation exception)
   - EIP-8355: ML-DSA signature verification precompile draft (Danno Ferrin)
   - EIP-8051: Precompile for ML-DSA signature verification (Renaud Dubois, Simon Masson)
   - EIP-8052: Precompile for Falcon signature verification
   - ERC-4337: Account Abstraction using alt-mempool
   - ERC-7562: Account Abstraction Validation Scope Rules (500k verification gas, 8192 bytes UserOp limit)
   - Post-Quantum Ethereum 官方研究站点：`pq.ethereum.org`
4. **Mantle & OP Stack 架构规范**:
   - Mantle OP Succinct 部署案例与技术报告：`blog.succinct.xyz/case-studies/mantle/`
   - OP Stack 预编译规范：`specs.optimism.io/protocol/precompiles.html`
   - OP Succinct / SP1 官方文档：`docs.succinct.xyz`
   - Kona (Rust OP Stack STF) 规范：`github.com/mantle-xyz/op-succinct`
5. **开源密码学工程库**:
   - PQ Code Package (Linux Foundation PQCA): `github.com/pq-code-package/mldsa-native`
   - Cloudflare CIRCL: `github.com/cloudflare/circl/sign/mldsa`
   - RustCrypto `signatures/ml-dsa`: GHSA-5x2r-hc65-25f9 (CVE-2026-24850 重复 hint 索引漏洞与共识分歧分析)
   - Thomas Pornin Falcon 参考实现：`github.com/pornin/falcon-rust`
   - ZKNox ETHFALCON: `github.com/ZKNoxHQ/ETHFALCON`
   - Fireblocks EVM ML-DSA Verifier: `github.com/fireblocks-labs/evm-ml-dsa-verifier`
   - PQClean 归档通知 (2026-08)

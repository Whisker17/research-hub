# notes：Starknet 账户模型、后量子迁移与 STRK20 / Shadow Account（索引与综合）

调研日期 2026-10-14（UTC+8）。调研分五路并行，另加主会话的跨路综合。台账前缀如下：
- **A** → `notes-account.md`：账户协议流程、验证限制、与 EOA / 4337 / 7702 / Native AA 的对照、钱包现状
- **C** → `notes-crypto.md`：组件 × 算法 × PQ 状态清单，Falcon-512 实现、成本、主网记录与标准化
- **R** → `notes-roadmap.md`：“2027 PQ L1”的官方表述、三阶段路线图进度、转 L1 的缺口、与 Ethereum 2029 的对照
- **S** → `notes-strk20.md`：STRK20 架构与时序、密钥与合规、隐私边界、加密层的 PQ 状态、审计与形式化
- **W** → `notes-shadow.md`：Shadow Account 的合约、授权链、地址派生、生命周期与隐私边界
- **X** → 本文件 §跨路综合（主会话推论，类型为 inferred / speculative）

外部调研 `starknet-account-model.md`（ChatGPT Deep Research）只作线索。固定版本：sequencer@54f97a8a（2026-10-13）、starknet-privacy@f9256c5e、starkware-starknet-utils@3e2fd53d、OZ cairo-contracts@5cf9010e、OZ cairo-pq-verifiers@bece5c07。主网版本经 RPC 实测为 v0.14.4。

## 每个研究问题的一句话答案

1. **账户模型**：Starknet 没有 EOA。协议只负责三件事：按交易类型以 caller=0 调用账户入口（`__validate__*` → `__execute__`），要求返回 `'VALID'`，在验证阶段施加 1M steps / 100M L2 gas 上限和 syscall 限制。签名算法完全由账户合约决定，账户还能用 `replace_class` 原地升级、保留地址（A1–A16、A30）。
   - 代价有四项：nonce 严格顺序（反而不如 4337 的 192 位 key 灵活）；验证阶段不能调用外部合约；原生 paymaster 字段被 gateway 拒收；地址派生仍用 Pedersen（A15、A20、A23、A57）。
   - EVM 一侧：EOA 和 7702 账户都绑着一把 secp256k1 根密钥，7702 委托后这把私钥依然有效（A53–A56）。
2. **密码学与 PQ 状态**：截至 v0.14.4，不依赖椭圆曲线的只有三项：
   - 证明层 STARK / S-two（结构性属性）；
   - compiled class hash（v0.14.1 起改用 BLAKE2s）；
   - OS program / config hash（v0.14.3 起改用 BLAKE2s）。

   以下各项仍依赖椭圆曲线或外部系统：合约树 / 存储树、合约地址、Map 槽仍是 Pedersen；默认账户签名是 Stark-ECDSA；DA 走 blob / KZG；L1 桥（C14–C37）。

   Falcon-512 账户有 5 个验证变体。标准 SHAKE-direct 的验证成本约为 ECDSA 的 385 倍，但仍在验证上限内。主网有 1 笔演示交易（2026-07-22），代码标注“实验性、未审计”；FIPS 206 仍是 “in development”（C38–C59）。
3. **“2027 PQ L1”的底气**：官方表述只有 @Starknet 的 “actively considering … 2027 as our target”，以及 Eli 的 “considering multiple options, including becoming an L1 … could get there by 2027”。没有 SNIP、治理提案、投票或规范，“fully quantum-resistant”的范围也没有定义（R1–R12）。
   - 底气来自两点结构优势：hash-based 证明层，以及可编程账户。
   - 路线图进度：Phase 1 只有 OS hash 上线，树和地址派生已超过“约两个月”的估计（R13–R20、C37）。
   - 转 L1 的缺口官方都没回应。共识目前是 3 个 sequencer 跑 Tendermint，代码里投票签名还是 TODO；此外还有 DA、结算、StarkGate 资产、旧状态迁移。
   - Ethereum 的 2029-12 是定义了三层范围的目标，两者不是同一口径（R21–R50）。
4. **STRK20 隐私协议**：这是一个合约级的 note / nullifier 隐私池。
   - **证明与执行**：用户的私有动作在“虚拟 Starknet OS”里由池合约自己的 `__execute__` 编译成公开的 server actions，Stwo 证明由 sequencer 网关验证。链上 `apply_actions` 只核对 proof facts 里的消息哈希和区块新鲜度（S1–S12）。
   - **资金安全**：防双花靠 nullifier 的 WriteOnce，守恒靠逐 token 临时余额归零（S13–S20）。
   - **授权与筛查**：支出要用户账户签名，三条验签路径任一通过即可；viewing key 只能注册一次、ECDH 加密给唯一的 auditor；存款需筛查方 attestation（S21–S26）。
   - **对谁保密**：对链上旁观者隐藏普通转账；存取款、新通道收款方是公开的；证明服务和 discovery 服务的运营者能拿到 viewing key（S27–S33）。
   - **PQ 状态**：加密层全部基于 Stark 曲线 ECDH，viewing 公钥明文上链，没有 PQ KEM。“Post-quantum”只指证明系统（S34–S42）。
5. **Shadow Account**：它是由 anonymizer 惰性部署的**无密钥代理合约**。
   - **结构**：存储只有 owner（就是 anonymizer），唯一入口 `execute` 只认 owner；没有 `__validate__`、`__execute__` 和 `is_valid_signature`（W11–W18）。
   - **授权链**：主账户签名（在私有证明中验证）→ 证明 → pool → anonymizer → shadow → DeFi 合约。
   - **地址派生**：salt 为 `Poseidon(Poseidon(identity_key, dapp_name), nonce)`，地址按 Pedersen 公式、用固定 PRIMER_CLASS_HASH 计算。主网复算 172/173 个地址吻合（W24–W35）。
   - **“private sub account”的判断**：方向正确，StarkWare 2026-07～08 自己就叫它 “private sub-accounts / SubAccount”（W4–W6）。但它不能签名、不是协议级账户，余额、调用和仓位全部公开，隐藏的只是与主钱包的关联（W2、W36–W52）。
   - **上线时间**：主网 2026-09-07 起就有部署，截至 10-14 共 173 个。没有找到 10-13 的官方发布文（W7–W9）。

## 跨路综合（X）

- **X1 量子风险链条**：viewing 私钥 k 同时决定三件事：nullifier（S14）、Shadow 的 identity_key（W24、W30），以及它被加密给 auditor 的那份密文（S23）。它的公钥 x(kG) 明文存在链上，而且不能轮换（S23）。所以 Shor 一旦可行，这一把 k 就能把某个用户的私有转账历史和全部 Shadow 关联一起事后复原（S36、S37、W 的推论）。这件事和“证明层抗量子”无关（S42）。
- **X2 PQ 账户不等于 PQ 授权**：STRK20 的支出授权走 `is_valid_signature` 或 custom 路径，不走 `__validate__`（S21）。账户的升级、guardian、session、outside execution 也都是独立的授权路径（A27、A29、A42、A44）。因此“把 `__validate__` 换成 Falcon”只覆盖交易入口（A51、S22）。
- **X3 “2027”至少还差五项**：
  - Phase 1 的树和地址迁移，以及旧存储迁移工具（C37、C19）；
  - 从零实现的 PQ 共识签名（R34）；
  - 独立的 DA 和结算（C30、C31）；
  - 存量 Ethereum 资产与 StarkGate 的处置（R 路缺口）；
  - STRK20 加密层的 PQ KEM（X1）。

  官方目前都没有给出这几项的规范或日期（R11、R12）。
- **X4 营销口径与代码的差距**：2026-10-14 的搜索引擎索引里，starknetprivacy.com 的摘要有一句 “Compliant for regulators, quantum-resistant by design.”。但当天抓取的页面源码（index 和各个 jsx）里已经找不到 “quantum” 字样，strk20.starknet.io 上也没有（S41）。官方现存的 “Post-quantum” 表述只针对证明系统（S40）。

## 资料中被修正的地方（汇总）

- **用户草稿“他们希望从 L2 转为 L1”**：官方原话是“正在考虑”，Eli 说的是“几个选项之一”（R4、R11）。
- **用户草稿“shadow account 像 private sub account”**：判断正确，这正是官方的旧名（W4–W6）。需要补充的是：它不能签名，内容也是公开的（W2、W14）。
- **用户草稿“同期推出 Shadow Account（10-13）”**：主网 2026-09-07 就有部署，10-13 的官方发布文找不到（W7–W9）。
- **GPT 的 Falcon 成本表**：数字是对的，但有三处问题：
  - 漏了 BLAKE2s-direct 这一行；
  - 口径是“测试减基线”的资源量，不是用户实际付的费用；
  - 实际收费约是资源量的 1.7–2.7 倍，主网 receipt 为 63.9M L2 gas（C43–C48、C55）。
- **GPT 说“S2morrow 用 Poseidon hash-to-point”**：它混淆了两个仓库。starkware-bitcoin/s2morrow 做的是 Bitcoin 方向的签名聚合；feltroidprime/s2morrow 才是 Starknet 账户（C57、C58）。
- **GPT 的 note / nullifier / identity 公式**：漏了 domain tag 和保留位。identity_key 里的 “k_view” 其实就是同时参与 nullifier 的那把隐私私钥，GPT 也没有提到 auditor 能借它重算 Shadow 关联（S13–S16、W24、W30）。
- **GPT 说“未验证是否对证明方隐藏”**：已经确认不隐藏，SDK 会把 viewing key 发给证明服务（S5、S30）。
- **GPT 说“可用 calldata fallback 避开 KZG”**：文档的意思是 calldata 只在极端情况下使用，主网实测走的是 BLOB（C30、C31）。
- **GPT 说“Pedersen 历史上用于……”**：这几条路径现在仍在用 Pedersen（C14、C16、C18）。
- **GPT 说 Vesu demo 是官方演示**：它其实是个人账号 starkience 的教育性示例（W10）。
- **媒体说“aims to complete the upgrade by 2027”“within months”**：官方原话只有 “target / could” 和 “approximately two months from start”（R6、R15）。
- **官方文档自身的过时与矛盾**：
  - docs 的 accounts 页仍写 REJECTED，Version Notes 只更新到 v0.14.1；
  - 谁生成证明，interactive 页、architecture 页、starkzap 三处说法不一；
  - 筛查服务商一处写 Elliptic，一处写 FPI；
  - starknet.js 指南的 shadow 地址派生方法已过时（A 路、S26、W 路）。

## 关键来源（PRIMARY）

- starkware-libs/sequencer@54f97a8a：blockifier（账户交易、验证限制、versioned constants）、starknet_api（地址、hash）、apollo_consensus（投票签名 TODO）、gateway（证明验证）
- starkware-libs/starknet-privacy@f9256c5e：privacy.cairo、hashes.cairo、utils.cairo、shadow_account_anonymizer、SDK、OZ 审计 PDF、Lean
- starkware-libs/starkware-starknet-utils@3e2fd53d：shadow_account.cairo、primer
- OpenZeppelin/cairo-pq-verifiers@bece5c07 与 cairo-contracts@5cf9010e：Falcon 验证器、基准、账户
- Quantum Hub（learn / foundations / migration-register / networks，最后更新 2026-08-19）；StarkWare 2026-06-30 路线图博客
- @Starknet 与 @EliBenSasson 2026-10-08 原帖（经 fxtwitter API 读取）；EF Protocol 2026-09-07 博客；EIP-7702 / 4337 / 7562 / 8141 原文；NIST CSRC
- Starknet 主网 RPC：Falcon 交易 0x72ae4404…（区块 12,156,522）、v0.14.4、173 个 ShadowAccountDeployed 事件

## 互相矛盾与开放问题（汇总）

1. 主网 Falcon 交易的 receipt 是 63.9M L2 gas，devnet 上同一变体约 139.9M，差异原因不明。主网账户的 class 也没能和源码构建产物比对（C 路）。
2. 主网区块证明的 S-two 配置（hash、安全位数）、L1 验证路径，以及私有交易的证明何时进入 L1 结算（C 路、S12）。
3. Phase 1 剩余项的目标版本和日期；PQ 共识签名的方案（R 路）。
4. 部署的 pool 和 anonymizer class 与源码是否一致；审计之后新增的代码（snip12 遗留路径、ComputeAndInvoke、anonymizer）都没有被审计覆盖（S45、S46、W 路）。
5. 钱包是否把 dapp_name 绑定到 origin（W51）；auditor 私钥的保管方式。
6. 已有 Stark-ECDSA 账户迁到 Falcon 的安全流程：官方没有文档（A 路）。

## 台账统计（合并后）

| 分册 | observed | inferred | speculative |
|---|---|---|---|
| A | 53 | 5 | 2 |
| C | 58 | 3 | 2 |
| R | 48 | 7 | 3 |
| S | 50 | 8 | 2 |
| W | 44 | 8 | 2 |
| X | 1 | 3 | 0 |

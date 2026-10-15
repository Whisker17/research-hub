# notes-chain：Mantle L1 合约与 L2 节点的链上复核（主会话，前缀 K）

一句话总结：截至 2026-10-15/16 的链上读数，Mantle 的状态根由一个 EOA proposer 提交、附带 SP1 **PLONK（BN254 配对）**证明，经 Succinct 拥有的 SP1VerifierGateway 路由验证；数据以 type-3 blob 交易发到 Ethereum。全部升级权限在一个 6/14 的 Safe 上（ProxyAdmin 无时间锁），挑战者与 Guardian 是一个 3/7 Safe；所有这些密钥（EOA 与 Safe 签名人）都是 secp256k1 ECDSA。Mantle L2 节点接受 EIP-7702（type-4）交易，并提供 P-256 预编译。

调研日期：2026-10-16（UTC+8）。Ethereum RPC：https://ethereum-rpc.publicnode.com（区块高度约 26,199,112）；Mantle RPC：https://rpc.mantle.xyz（chainId 5000，客户端 `Geth/v1.17.3-stable-e5fa26ca`，区块高度约 101,975,744）。工具：Foundry `cast`。合约清单来源：L2BEAT 仓库 `packages/config/src/projects/mantle/{mantle.ts,discovered.json}`，discovered.json 最近一次提交 cd994874（2026-10-05）。

## 命令与输出（摘要）

1. OPSuccinctL2OutputOracle `0x31d543e7BE1dA6eFDc2206Ef7822879045B9f481`
   - `version()` → `"2.0.1"`；`verifier()` → `0x3B6041173B80E77f038f3F2C0f9744f04837185e`（SP1VerifierGateway）；`optimisticMode()` → `false`
   - `owner()` → `0x4e59…D40f`（MantleSecurityMultisig）；`challenger()` → `0x2F44…daC9`（MantleEngineeringMultisig）
   - `finalizationPeriodSeconds()` → 43200（12 小时）；`submissionInterval()` → 1800（L2 区块）；`latestBlockNumber()` → 101974346
   - `approvedProposers(0x6667961f…Ed77D)` → `true`；`approvedProposers(0x0)` → `false`（不是无许可提交）。`cast code 0x6667…` → `0x`（EOA），nonce 51895。
2. 最近一笔状态提交 `0xeae80e604a5000669bdbf085e5dd3b6a51177c405744dcb011188ea53697e812`（区块 26199021，2026-10-15 16:09:59 UTC）
   - from `0x6667…Ed77D`，selector `0x9ad84880` = `proposeL2Output(bytes32,uint256,uint256,bytes)`（非 optimistic 模式），calldata 1156 字节，其中 proof 964 字节，前 4 字节 `0x5a093a2f`；gasUsed 431,530。
   - Gateway `routes(0x5a093a2f)` → `(0xc3c6dDDAc8829b233Dc6536Ec024775a57b0AF2A, frozen=false)`。
   - 该 verifier `VERSION()` → `"v6.1.0"`；Sourcify 记录的合约为 `src/v6.1.0/SP1VerifierPlonk.sol:SP1Verifier`；字节码 10,126 字节，包含对 0x08（BN254 配对预编译）的 staticcall 模式。
3. SP1VerifierGateway `0x3B60…185e`
   - Sourcify：`src/SP1VerifierGateway.sol:SP1VerifierGateway`。源码（succinctlabs/sp1-contracts main，`contracts/src/SP1VerifierGateway.sol`）：`verifyProof` 按 proof 前 4 字节选择路由，只要求路由存在且未冻结；`addRoute` / `freezeRoute` 都是 `onlyOwner`。
   - `owner()` → `0xCafEf00d348Adbd57c37d1B77e0619C6244C6878`，`getThreshold()` → 2，`getOwners()` → 3 个地址（2/3 Safe）。
   - 事件（Blockscout getLogs，区块 20233410 起）：共 12 次 RouteAdded、11 次 RouteFrozen；当前只有 `0x5a093a2f`（v6.1.0，2026-04-16 添加）未冻结。v6.0.0（`0xbb1a6f29`）和 v5.0.0（`0xd4e8ecd2`）在 2026-10-09 前后被冻结（区块 26152982 / 26152991）。
4. 权限
   - ProxyAdmin `0xca35…7794` `owner()` → `0x4e59…D40f`。MantleSecurityMultisig `getThreshold()` → 6，owners 14 个。
   - MantleEngineeringMultisig `0x2F44…daC9` `getThreshold()` → 3，owners 7 个；它是 OPSuccinctL2OutputOracle 的 challenger，也是 OptimismPortal 的 GUARDIAN（L2BEAT discovered.json）。OptimismPortal `paused()` → false。
   - SystemConfig `0x427E…6cAf`：`batcherHash` → `0x2f40D796…d749`（EOA，nonce 212157）；`unsafeBlockSigner` → `0xAAC979…66dc`（L2BEAT 标为 EOA）。
   - L2BEAT discovered.json 中的 TimelockController `0x6533…447F` 只管 MantleTokenProxyAdmin（MNT 代币），不在 ProxyAdmin 的升级路径上。
5. DA：batcher 最近一笔交易 `0xf382f5d762bbded2a6d67b163764ca55d19e0ac12013f6bd6f9fa6fb73f66007`（区块 26199103，2026-10-15 16:26:23 UTC），type 0x3，1 个 blob，to `0xFFEEDDCcBbAA0000000000000000000000000000`（sequencerInbox），blobGasUsed 131072。L2BEAT mantle.ts 的里程碑：2026-04-16 “Arsia upgrade: full Ethereum DA … EigenDA code path removed”。
6. Mantle L2 节点
   - P-256 预编译：用 RIP-7212 的有效测试向量 `cast call 0x…0100`，Mantle 与 Ethereum 都返回 `0x…01`。
   - P-256 历史区块：`--block 80000000`（2025-05-24）与 `--block 86900000`（2025-10-31）同样返回 `0x…01`。
   - EIP-7702：`eth_estimateGas`，`type: 0x4`、带 1 个 authorizationList 元组，Mantle 返回 `0xb57e`（46,462 gas），说明节点接受 type-4 交易并按每个授权计费。

## 来源
1. **PRIMARY** L2BEAT 配置 `l2beat/l2beat` `packages/config/src/projects/mantle/mantle.ts` 与 `discovered.json`（提交 cd994874，2026-10-05，访问 2026-10-16）：合约清单、角色、里程碑（OP Succinct 2025-09-16、Arsia 2026-04-16）。
2. **PRIMARY** 以太坊主网 RPC 读数（上文命令 1–5，2026-10-16）。
3. **PRIMARY** succinctlabs/sp1-contracts `contracts/src/SP1VerifierGateway.sol`（main，访问 2026-10-16）：路由与 owner 权限。
4. **PRIMARY** Sourcify 对 `0xc3c6…AF2A` 与 `0x3B60…185e` 的验证记录。
5. **PRIMARY** Mantle RPC 读数（上文命令 6）。
6. **PRIMARY** Safe 文档 “Smart account signatures”，https://docs.safe.global/advanced/smart-account-signatures （访问 2026-10-16）：合约签名（EIP-1271，v=0）的编码与验证方式。

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| K1 | Mantle 的 L1 状态提交合约是 OPSuccinctL2OutputOracle（0x31d5…f481，version 2.0.1），当前 optimisticMode = false | `cast call` version() / optimisticMode()，2026-10-16 [2]；L2BEAT discovered.json [1] | observed | |
| K2 | 2026-10-15 的最近一次状态提交附带 964 字节证明，路由到 SP1 v6.1.0 的 PLONK verifier（0xc3c6…AF2A） | tx 0xeae80e60…；gateway routes(0x5a093a2f)；VERSION()=v6.1.0；Sourcify `SP1VerifierPlonk.sol` [2][4] | observed | |
| K3 | Mantle 在 L1 上最终验证的是 BN254 上的 PLONK 证明，验证依赖 BN254 配对预编译 | 由 K2 与 Sourcify 合约名 SP1VerifierPlonk、字节码含 0x08 预编译调用 [4] 推出 | inferred | |
| K4 | 一次状态提交在 L1 消耗约 43 万 gas（2026-10-15 样本 431,530） | `cast receipt 0xeae80e60… gasUsed` [2] | observed | |
| K5 | 状态根由一个被批准的 EOA proposer（0x6667…Ed77D）提交，不是无许可提交 | approvedProposers(0x6667…)=true、approvedProposers(0x0)=false、`cast code` 为空 [2] | observed | |
| K6 | SP1VerifierGateway 由 Succinct 的 2/3 Safe（0xCafE…6878）拥有，它可以随时添加或冻结验证器路由 | owner() / getThreshold() / getOwners() [2]；SP1VerifierGateway.sol 的 onlyOwner addRoute / freezeRoute [3] | observed | |
| K7 | Gateway 接受任何“已添加且未冻结”的路由；证明用前 4 字节自选路由 | SP1VerifierGateway.sol `verifyProof` [3] | observed | |
| K8 | 该 Gateway 历史上添加过 12 个路由、冻结了 11 个，目前只有 v6.1.0 一个路由有效；v5.0.0、v6.0.0 在 2026-10-09 前后被冻结 | Blockscout getLogs RouteAdded / RouteFrozen，区块 20233410–26152991 [2] | observed | |
| K9 | 如果将来加入 PQ verifier 路由而不冻结旧的 PLONK 路由，Gateway 的接受逻辑等同于“旧证明 OR 新证明” | 由 K7 推出：路由之间没有 AND 关系，任一未冻结路由通过即接受 | inferred | |
| K10 | Mantle 全部 L1 核心合约（Portal、Bridge、Messenger、SystemConfig、Oracle）的升级权在 ProxyAdmin，其 owner 是 6/14 的 MantleSecurityMultisig | ProxyAdmin.owner()；Safe getThreshold()=6、owners=14；discovered.json 中各合约 $admin=ProxyAdmin [1][2] | observed | |
| K11 | ProxyAdmin 的 owner 直接是 Safe，链上没有升级时间锁；L2BEAT 列出的 TimelockController 只管 MNT 代币的 ProxyAdmin | ProxyAdmin.owner() 返回 Safe 地址；discovered.json 中 TimelockController 仅作为 MantleTokenProxyAdmin owner [1][2] | observed | |
| K12 | MantleEngineeringMultisig（3/7 Safe）同时是状态提交的 challenger 和 OptimismPortal 的 Guardian | challenger() [2]；discovered.json OptimismPortal GUARDIAN [1]；getThreshold()=3、owners=7 [2] | observed | |
| K13 | batcher（0x2f40…d749）与 sequencer 的 unsafe block signer（0xAAC9…66dc）都是 EOA | SystemConfig batcherHash / unsafeBlockSigner [2]；`cast code` 为空、L2BEAT 标为 EOA [1] | observed | |
| K14 | Mantle 当前把交易数据以 type-3 blob 交易发到 Ethereum（2026-10-15 样本：1 个 blob） | batcher tx 0xf382f5d7… type 0x3、blobVersionedHashes 1 个 [2] | observed | |
| K15 | Mantle 在 2026-04-16 的 Arsia 升级中移除 EigenDA 代码路径，DA 只用 Ethereum | L2BEAT mantle.ts milestones “Arsia upgrade: full Ethereum DA”（含 etherscan tx 0xa9f65671…）[1] | observed | |
| K16 | Mantle 在 2025-09-16 升级到 OP Succinct（SP1 有效性证明） | L2BEAT mantle.ts milestones “Upgrade to OP Succinct” [1] | observed | |
| K17 | Mantle 的 proposer、batcher、sequencer 签名密钥，以及两个 Safe 的全部签名人，都依赖 secp256k1 ECDSA | 由 K5、K10、K12、K13 推出：EOA 与 Safe 签名人都用 secp256k1 ECDSA 授权 | inferred | |
| K18 | Mantle L2 提供 P-256（secp256r1）验证预编译 0x100 | RIP-7212 有效测试向量 `cast call` 返回 1（Mantle RPC，2026-10-16）[5] | observed | |
| K19 | Mantle L2 节点接受 EIP-7702 的 type-4 交易 | `eth_estimateGas` type 0x4 + authorizationList 返回 46,462 gas（Mantle RPC，2026-10-16）[5] | observed | |
| K20 | Mantle L2 执行客户端报告为 Geth v1.17.3 分支 | `cast client --rpc-url https://rpc.mantle.xyz` [5] | observed | |
| K21 | Safe 多签支持合约作为 owner：签名类型 v=0 时，Safe 调用该合约的 EIP-1271 `isValidSignature` 验证任意长度的签名数据 | Safe 文档 “Smart account signatures” 的 “Contract signature (EIP-1271)” 一节（https://docs.safe.global/advanced/smart-account-signatures ，访问 2026-10-16）[6] | observed | |
| K22 | Mantle 的 P-256 预编译（0x100）在 2025-05-24（区块 80,000,000）与 2025-10-31（区块 86,900,000）已可用，早于 Ethereum Fusaka（2025-12-03） | `cast call 0x…0100 --data <RIP-7212 测试向量> --block 80000000 / 86900000 --rpc-url https://rpc.mantle.xyz` 均返回 `0x…01`（2026-10-16 实测）[5] | observed | |

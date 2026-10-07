# 主会话分册（O）：交叉核对、分片布局证据与 Mantle 启示

**研究问题**：(1) 抽查各分册的关键论断；(2) 补齐分册没有拿到的链上数据（主网分片布局、MPC 合约状态、Intents 支持链）；(3) brief 研究问题 4：Mantle 能学到什么、NEAR 是不是“产品驱动 infra 迭代”的典型。
**一句话答案**：主网分片边界本身就是“产品驱动 infra”最直接的证据：静态布局里专门为 Sweat（`tge-lockup.sweat`）、HOT（`game.hot.tg`，后来单独占一个分片）、KaiChing（`earn.kaiching`）和 Aurora 切出边界。2.13 之后主网用动态布局，上限 10 个分片，已经从 9 个自动拆到 10 个。但共识与执行这条主线（stateless validation、SPICE、gas keys）的动机写的是协议自身。所以 NEAR 是“产品决定账户 / 授权层和容量热点，研究路线决定执行层”的混合型。对 Mantle 最可复用的是 Intents 的产品接口与分发方式，不是 NEAR 的异步执行模型。截至 2026-10-07，NEAR Intents 不支持 Mantle。

数据于 2026-10-07 读取。源码：nearcore @ `090da3191758c75787ce14569528bf0e9d71246c`；near/intents @ `4127e8e`。链上：`https://rpc.mainnet.near.org`（POST JSON-RPC）。

---

## 1. 抽查记录（主会话复核）

| 分册论断 | 复核方式 | 结果 |
|---|---|---|
| A1 主网 PV 86、nearcore 2.13.4 | `curl https://rpc.mainnet.near.org/status` → `86 2.13.4 2026-10-07T06:45:31Z` | 一致 |
| E8 / E9 Intents 30 天 volume 44.15 亿、fees 738.4 万美元 | `api.llama.fi/summary/dexs/near-intents` → `total30d 4414741164`；`/summary/fees/near-intents?dataType=dailyFees` → `total30d 7384225` | 一致 |
| I23 relayer key 只能调 `execute_intents`，allowance Unlimited | 读 `contracts/defuse/src/contract/intents/relayer.rs#L14-L27@4127e8e` | 一致 |
| A47 NEP-519 的动机示例是 MPC 签名合约 | `NEPs/neps/nep-0519.md` L21：“a smart contract (`S`) that provides the MPC signing capability” | 一致 |
| C20 / C21 MPC 17 个参与者、门限 11 | RPC `call_function v1.signer state` → `Running`，17 个参与者账户，4 个 domain 的 `reconstruction_threshold` 都是 11 | 一致，并补充 domain 用途（见 O3） |

## 2. 主网分片布局：产品热点直接写进了分片边界

**答案**：
- 当前主网是 `ShardLayout V3`，10 个分片，边界账户为 `650, aurora, aurora-0, earn.kaiching, game.hot.tg, game.hot.tg-0, kkuuue2akv_1630967379.near, tge-lockup.sweat, wallet.ka`，`last_split = 5`，分片 5 拆成 12、13 [1]。
- nearcore 仓库里按协议版本保存的主网 epoch config 显示，静态布局的边界是一步步加上的 [2]：
  - PV 48 / 56：`aurora, aurora-0, kkuuue2akv_…`（4 个分片）
  - PV 64：加 `tge-lockup.sweat`（5 个；nearcore 1.37 Resharding V2）
  - PV 65：加 `game.hot.tg`（6 个）
  - PV 75：加 `game.hot.tg-0`（7 个）。`[game.hot.tg, game.hot.tg-0)` 这个区间只包含 `game.hot.tg` 一个账户，HOT 的游戏合约从此独占一个分片
  - PV 76：加 `earn.kaiching`（8 个）
  - PV 78 / 81：加 `650`（9 个）
  - PV 85：不再写静态布局，改为 `dynamic_resharding_config`：`memory_usage_threshold 40 GB`、`min_child_memory_usage 10 GB`、`max_number_of_shards 10`、`min_epochs_between_resharding 2` [3]
- `wallet.ka` 这个边界不在任何静态布局里，而当前布局的 `last_split` 正是分片 5。所以 PV 86 之后主网已经发生过一次自动拆分（9 → 10），并且已经碰到上限 10（inferred）。这和 NEP-639 写的“首次上线时 max_number_of_shards = 当前分片数 + 1”一致 [4]。
- RPC 返回的 `EXPERIMENTAL_protocol_config` 里有一个 `dynamic_resharding: false` 字段 [1]，它和 epoch config 里的 `dynamic_resharding_config` 不是同一个东西。这里以 epoch config 和实际布局为准，字段含义见开放问题。

**含义（inferred）**：
- `aurora`（EVM）、`game.hot.tg`（HOT Telegram 挖矿游戏）、`earn.kaiching`（KaiChing / KAIKAI）、`tge-lockup.sweat`（Sweat）这些边界，对应的都是历史上最大的单体负载。NEAR 为它们手工安排分片，nearcore 1.39 还为 sweat / kaiching 合约写了专门的 prefetcher [5]。
- 这正好说明 NEAR 分片的边界：一个账户不能跨分片，热点合约只能“独占一个分片”，不能再拆（与 A39 一致）。`game.hot.tg-0` 就是 NEP-639 “Split B：追加 -0” 的用法 [4]。

## 3. MPC 合约状态（补充 C 分册）

RPC `v1.signer.state()` 返回 `Running` [6]：
- domain 0：`CaitSith`，purpose `Sign`（secp256k1 ECDSA）
- domain 1：`Frost`，purpose `Sign`（Ed25519）
- domain 2：`ConfidentialKeyDerivation`，purpose `CKD`
- domain 3：`CaitSith`，purpose `ForeignTx`
- 4 个 domain 的 `reconstruction_threshold` 都是 11；参与者 17 个；keyset `epoch_id 13`。

这从合约状态层面证实：同一个 MPC 网络在主网同时承担签名、CKD 和外链交易验证三种用途（C33、C45 是从交易记录看到的，这里是从合约配置看到的）。

## 4. NEAR Intents 是否支持 Mantle

- 1Click `GET /v0/tokens` 返回 204 个资产，分布在 37 个 `blockchain` 值上：`abs, adi, aleo, aptos, arb, avax, base, bch, bera, bsc, btc, cardano, dash, doge, eth, fogo, gnosis, hood, hypercore, ltc, monad, movement, near, op, plasma, pol, qtc, scroll, sol, starknet, stellar, sui, ton, tron, xlayer, xrp, zec`。其中没有 Mantle [7]。
- chain-support 页的 EVM 列表同样没有 Mantle。新链评估标准写的是：“User demand / Technical compatibility / Liquidity availability / Security audits”，优先考虑“Existing market maker liquidity”和“Compatible signing standards” [8]。
- 推论：Mantle 是 EVM 链，签名标准兼容（ERC-191 已支持，见 I15）。接入的门槛主要在需求和做市商流动性，不在技术（inferred）。

## 5. Mantle 的现状（只列和本报告对比有关的事实）

- Mantle 是 OP Stack 系 rollup，状态由 OP Succinct（SP1）有效性证明验证；2026-04-16 Arsia 升级后交易数据发到 Ethereum blobs；gas 代币是 MNT；sequencer 由单一运营者负责；L2BEAT 评为 Stage 0 [9][10]。
- Mantle 执行层是 EVM：同一笔交易里的合约调用是同步的，失败整笔回滚（读者基线）。
- 用户已确认的内部方向（brief “范围”）：代币化股票 / 股票 quote 的 launchpad（见 research-hub `uniswap-v4-hooks` 报告）、聚合器路由与 JIT 链上重拆（`mantle-best-routing-report`）、L2↔L3 原子同步可组合（`atomic-synchronous-composability`）、链抽象 + 意图交易 + 预测市场的设想（Notion《2026 链抽象+意图交易+预测市场》）、小区块 / 预确认类的出块优化（Notion《性能和 ux 提升计划》）[11][12][13][14][15]。

## 6. NEAR 是不是“产品驱动 chain infra 迭代”的典型？

把各分册的证据按“改动由谁驱动”分成三类：

| 类别 | 例子 | 动机来源 | 证据 |
|---|---|---|---|
| 产品驱动（一手文本明说） | meta tx（NEP-366，点名 Sweatcoin / NEARCrowd / Aurora Plus）；yield/resume（NEP-519，MPC 签名合约）；global contracts（NEP-591，Chain Signatures 智能钱包）；P-256（NEP-635，Intents passkey，仍是 Draft）；链下授权（NEP-641） | 具体产品 | E40–E44、A47、A52 |
| 产品驱动（配置与运维） | 分片边界围绕 Sweat / HOT / KaiChing / Aurora；sweat / kaiching prefetcher | 热点负载 | O 分册 §2、E37 |
| 协议自身驱动 | stateless validation（NEP-509：fraud proof 太复杂）；拥塞控制（NEP-539）；动态 resharding（NEP-639：人工拆分太慢）；gas keys（NEP-611：为 SPICE 防 DoS）；SPICE；后量子签名 | 扩展性与安全 | A9、A31、E45、E48 |

**结论（inferred）**：NEAR 是混合型。账户 / 授权层与容量热点由产品拉动，而且有一手文本可以证明；共识与执行层沿长期研究路线推进。还有一个反向现象：Chain Signatures 这个 infra 先出现（2024-08），Intents 以“built on top of Chain Signatures”的身份后出现（2024-11），Intents 跑出需求后又反过来要求 P-256、链下授权等改动。所以更准确的说法是“infra 先铺能力，产品筛选需求，需求再反推下一轮 infra”。

## 7. Mantle 的启示（inferred，按可执行程度排序）

1. **把能力包装成被分发的服务接口，而不是只吸引开发者部署**。Intents 30 天 fees（738 万美元）约为 NEAR L1 gas 费（14.1 万美元）的 52 倍（E12）；成交主要来自 SwapKit、Ledger、Brave、Rango 等外部入口（E13–E16）；渠道有默认分成（E21）。对 Mantle：“从任何链、任何钱包买到 Mantle 上的核心资产（例如代币化股票）”可以做成一个类似 1Click 的报价 API，交给钱包和聚合器分发。
2. **先接入现成网络，再决定自建**。NEAR Intents 目前不支持 Mantle（O 分册 §4），而它的接入标准看的是需求和做市商流动性。争取被 Intents（或同类网络）支持，成本远低于自建 solver 网络和统一账本。
3. **不要照搬 verifier 托管账本**。NEAR 把需要原子性的余额集中到一个合约，是为了在异步执行模型下拿到原子结算（I53）。Mantle 是同步 EVM，JIT 路由已经能在一笔交易内读状态、重算、执行。照搬 verifier 只会多出存入、提现、桥和升级权限的风险。
4. **隐私先做 RFQ 层，不急着做私有链**。Confidential Intents 的隐私来自许可制私有链加 PoA 桥加私有 relay：对公众保密，对运营方不保密（I43）。Mantle 可以先验证“订单在成交前不暴露、maker 报价不泄露”这类需求，例如私有 RFQ 分发。确实需要隐藏余额时，再评估私有 L3 / appchain，同时把退出路径和运营方权限写清楚。
5. **AI 的链上接点是登录、支付和结算，不是推理**。NEAR AI 的推理全在链外；链只出现在 NEP-413 登录、质押收益付推理费、Agent Market 经 Intents 结算这几处（N21–N26、N46–N47）。对 Mantle，更现实的入口是“agent 的受限执行与支付”（额度、收款方、目标合约、撤销），而不是“AI 上链”。
6. **把账户数和用户留存分开看**。NEAR 2024-06 日活账户约 224 万，2026-10 约 12.5 万（E31、E1）；Sweat 宣布 2026-12-30 结束（E35）。大规模建户证明了分发能力，但不能证明持续需求。
7. **组合系统的接口是最大风险点**。2026-10-01 的约 380 万美元事件，官方归因于“Omni 存取款基础设施与 Intents 合约的交互”（I48），没有攻破 L1 共识。Mantle 如果把桥、结算合约和链下服务组合成一个产品，要按“接口”做审计和监控。

## 来源

1. **PRIMARY** NEAR 主网 RPC `EXPERIMENTAL_protocol_config`（POST https://rpc.mainnet.near.org，2026-10-07）：`protocol_version 86`、`shard_layout.V3`（10 个 shard_ids、边界账户、`last_split 5`、`shards_split_map`）、`target_validator_mandates_per_shard 105`、`dynamic_resharding false`。
2. **PRIMARY** nearcore `core/primitives/res/epoch_configs/mainnet/{48,56,64,65,69–72,75,76,78,80,81}.json@090da31`：各协议版本主网静态分片布局的边界账户。
3. **PRIMARY** nearcore `core/primitives/res/epoch_configs/mainnet/85.json@090da31`：`dynamic_resharding_config`（40 GB、10 GB、max 10、间隔 2 个 epoch）。另见 `core/primitives/src/epoch_manager.rs#L62-L72@090da31`：`ShardLayoutConfig::Static` 与 `Dynamic`。
4. **PRIMARY** NEPs `neps/nep-0639.md@dcc0bcb`：首次上线 max shards = 当前 + 1；Split B 用“-0”处理大账户。
5. **PRIMARY** nearcore `CHANGELOG.md@090da31`：1.37.0 Resharding v2；1.39.0 sweat / kaiching prefetcher；2.5.0 Resharding V3 两个新布局；2.13.0 “Stabilized dynamic resharding”。
6. **PRIMARY** NEAR 主网 RPC `call_function v1.signer state {}`（2026-10-07）：Running、4 个 domain 的 protocol / purpose / threshold、17 个参与者。
7. **PRIMARY** 1Click API `GET https://1click.chaindefuser.com/v0/tokens`（2026-10-07）：204 个资产、37 个 blockchain 值，没有 Mantle。
8. **PRIMARY** docs.near-intents.org/resources/chain-support.md（2026-10-07）：支持链列表与新链评估标准。
9. **PRIMARY** L2BEAT Mantle 页面 https://l2beat.com/scaling/projects/mantle （经 research-hub `arbitrum-asset-freeze` 报告 notes-mantle.md §1 记录，2026-10-07 读取）：Stage 0、OP Succinct、Ethereum blobs、Arsia 升级。
10. **PRIMARY** mantle-v2 @da45c31（同上报告引用）：OptimismPortal 的 MNT / ETH 双资产字段。
11. 内部：research-hub 报告 `uniswap-v4-hooks` 的 brief：代币化股票 quote launchpad、xStocks。
12. 内部：research-hub 报告 `mantle-best-routing-report`：JIT（DynamicSwap）链上按执行时状态重拆。
13. 内部：research-hub 报告 `atomic-synchronous-composability`：Mantle L2↔L3 原子同步可组合方向。
14. 内部：vault `Notion/Mantle Research/Mantle/2026 链抽象+意图交易+预测市场.md`：链抽象 + 意图 + 预测市场设想。
15. 内部：vault `Notion/Mantle Research/Mantle/性能和 ux 提升计划.md`：flashblocks / miniblocks 小区块设想。

## 开放问题

1. RPC 字段 `dynamic_resharding: false` 的确切含义（是否为旧字段、还是表示“当前 epoch 不允许再拆”），需要读 `chain/jsonrpc` 的序列化代码确认。
2. 9 → 10 这次自动拆分发生在哪个 epoch，拆分时分片 5 的内存占用是多少。
3. 主网何时把 `max_number_of_shards` 上调到 10 以上，没有公开时间表。

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| O1 | 2026-10-07 主网是 ShardLayout V3，10 个分片，last_split 为分片 5（拆成 12、13） | [1] RPC EXPERIMENTAL_protocol_config | observed | |
| O2 | 主网静态布局的边界依次加入了 tge-lockup.sweat（PV 64）、game.hot.tg（PV 65）、game.hot.tg-0（PV 75）、earn.kaiching（PV 76）、650（PV 78） | [2] epoch_configs/mainnet/*.json@090da31 | observed | |
| O3 | PV 75 起 game.hot.tg 单独占一个分片（区间 [game.hot.tg, game.hot.tg-0) 只含这一个账户） | 由 O2 与 [4] NEP-639 Split B（追加 -0）推出 | inferred | |
| O4 | PV 85 的主网 epoch config 改为动态布局：内存阈值 40 GB、子分片下限 10 GB、最多 10 个分片、两次拆分至少间隔 2 个 epoch | [3] 85.json dynamic_resharding_config | observed | |
| O5 | PV 86 之后主网已自动拆分过一次（9 → 10，新边界 wallet.ka），目前已到上限 10 | 由 O1、O2（wallet.ka 不在任何静态布局）、O4（max 10）推出 | inferred | |
| O6 | 分片边界围绕 Sweat、HOT、KaiChing、Aurora 等产品合约设置，说明产品热点直接影响了分片布局 | 由 O2 与 [5] 1.39.0 sweat/kaiching prefetcher 推出 | inferred | |
| O7 | 主网 v1.signer 有 4 个 domain：0 CaitSith/Sign、1 Frost/Sign、2 CKD、3 CaitSith/ForeignTx，门限都是 11，参与者 17 个 | [6] RPC call_function v1.signer state | observed | |
| O8 | 截至 2026-10-07，NEAR Intents（1Click）支持的 37 个链中没有 Mantle | [7] /v0/tokens；[8] chain-support | observed | |
| O9 | NEAR Intents 评估新链看用户需求、技术兼容、流动性与审计，优先考虑已有做市商流动性和兼容的签名标准 | [8] chain-support “Request new chains” | observed | |
| O10 | Mantle 接入 NEAR Intents 的门槛主要在需求与做市商流动性，不在技术 | 由 O9 与 I15（已支持 erc191 签名）推出：Mantle 是 EVM 链 | inferred | |
| O11 | Mantle 是 Stage 0 rollup，状态由 OP Succinct 有效性证明验证，2026-04-16 起数据发到 Ethereum blobs，gas 代币为 MNT | [9] L2BEAT（经 arbitrum-asset-freeze notes-mantle §1） | observed | |
| O12 | NEAR 的协议改动中，账户 / 授权层与容量热点由产品拉动，共识与执行层由协议自身的扩展性和安全目标驱动 | 由 E40–E45、A9、A31、O6 推出 | inferred | |
| O13 | NEAR 的迭代顺序是 infra 先铺能力（Chain Signatures 2024-08）、产品后筛选需求（Intents 2024-11 建在其上）、需求再反推 infra（NEP-635、NEP-641） | 由 E53、E54、E43、E44 推出 | inferred | |
| O14 | Mantle 可以把“从任意链 / 钱包获取 Mantle 核心资产”做成被钱包和聚合器分发的报价接口 | 由 E12、E13–E16、E21 推出（Intents 的收入来自服务层与渠道分发） | inferred | |
| O15 | Mantle 是同步 EVM，不需要照搬 verifier 托管账本来获得原子结算 | 由 I53（verifier 集中余额是为了绕开异步）与 Mantle 的 EVM 同步调用语义推出 | inferred | |
| O16 | 对 Mantle 而言，私有 RFQ 分发比私有链更早可以验证隐私需求 | 由 I43（Confidential Intents 对运营方不保密）、I34（需要许可制私有链和桥）推出 | speculative | |
| O17 | 对 Mantle 而言，agent 的受限执行与支付比“AI 上链”更现实 | 由 N21、N26、N38、N46 推出（NEAR AI 的链上接点只有登录、支付和结算） | speculative | |
| O18 | NEAR 日活账户从 2024-06 的约 224 万降到 2026-10 的约 12.5 万，大规模建户不等于持续需求 | 由 E31、E1、E35 推出 | inferred | |
| O19 | Mantle 正在探索的方向包括代币化股票 launchpad、JIT 路由、L2↔L3 原子同步、链抽象 + 意图 + 预测市场、小区块出块优化 | [11]–[15] 内部资料（brief 范围内由用户确认） | observed | |
| O20 | Confidential Intents 的资产 unshield 回公链后，出金到外链仍走公链的桥（Omni 出站由 MPC 签名） | 由 I35（unshield 回到公链 Treasury / intents.near）与 C48（Omni 出站由 MPC 签名）推出 | inferred | |

# 调研笔记索引：NEAR 深度拆解

调研分六册完成（2026-10-07；网页来源都在当天访问）。前五册由并行调研 agent 完成，第六册（O）由主会话完成：抽查前五册、补链上数据、写 Mantle 启示。

源码固定版本：nearcore @ `090da31`（2026-10-06）、NEPs @ `dcc0bcb`、near/intents @ `4127e8e`（defuse v0.4.4）、near/mpc @ `e968367`、nearai/ironclaw @ `b0b999d`。链上数据来自 NEAR 主网 RPC、nearblocks API、DefiLlama API、NEAR Intents explorer 和 1Click API。

合并台账见 [ledger.md](ledger.md)：314 行，其中 observed 257、inferred 46、speculative 11。外部调研（ChatGPT Deep Research）已用 `rh import research` 存为 [near-deep-dive.md](near-deep-dive.md)，只当线索使用。

| 分册 | brief 研究问题 | 一句话答案 |
|---|---|---|
| [notes-arch.md](notes-arch.md)（A） | 1 L1 架构 | NEAR 以账户为最小分片单位，跨账户调用一律走异步 receipt。状态验证用 stateless validation：按 stake 抽样的 validator 拿 witness 重新执行，不是 validity proof。主网当前是 PV 86 / nearcore 2.13.4，gas keys、后量子签名、动态 resharding 已经启用；SPICE（PV 180）和 200 ms 出块仍是计划。1M TPS 是 70 个分片、只跑原生转账的测试网基准。代价有三类：开发者要自己写补偿逻辑；热点合约不能拆分；witness 大小限制了单笔交易。 |
| [notes-chainsig.md](notes-chainsig.md)（C） | 1 链抽象层 | Chain Signatures = `v1.signer` 合约 + 17 个运营方的 MPC 网络（门限 11，13 个在 TDX 里）。合约用 yield/resume 挂起 `sign`，最多等 200 个区块。地址按 `caller + path` 加法派生。同一个网络在主网上还做 CKD（domain 2）和外链交易验证（domain 3），所以“只能 outbound”已经过时。三座桥的信任模型各不相同：Omni 入站用 light client 或 Wormhole、出站用 MPC；PoA 是中心化运营方；HOT 用自己的 MPC。 |
| [notes-intents.md](notes-intents.md)（I） | 2 Intents / Privacy | Intents 的核心是一个合约内的多资产账本。用户和 solver 签 `token_diff`，relayer 用 `intents.near` 上的 function-call key 一次提交 `execute_intents`。一个 receipt 内逐条验签、记账，最后检查每个 token 的增减必须配平，否则整笔回滚。出入金靠三座桥完成，不在原子域内。Confidential Intents 是同一份 verifier 跑在许可制私有 NEAR 分叉 FAR 上，加 Private PoA Bridge 和私有 relay：对公众保密，对运营方不保密。10-01 事件出在“Omni 存取款基础设施 × verifier”的接口上，停用的 11 条链与 HOT Bridge 的支持链完全重合。 |
| [notes-ai.md](notes-ai.md)（N） | 2 AI | NEAR AI 的核心是链外服务。NEAR AI Cloud 是 OpenAI 兼容网关，开源模型跑在 TDX + NVIDIA CC 里，靠客户端验证 attestation；frontier 模型走 Incognito 路由，不在 TEE 里。IronClaw 是 Rust 重写的 OpenClaw 类 agent runtime，主要靠 WASM 沙箱和能力授权保证安全。和链的接点只有 NEP-413 登录、质押收益付费、Agent Market 经 (Confidential) Intents 结算。Shade Agents 自 2026-04-19 起不再维护。没有任何公开用量数据。 |
| [notes-ecosystem.md](notes-ecosystem.md)（E） | 3 生态、4 时间线 | 有用户接受证据的是 Intents 跨链兑换：30 天成交 44.1 亿美元、fees 738 万美元，约为 L1 gas 费的 52 倍，主要靠 SwapKit、Ledger、Brave、Rango 等外部渠道分发。原生 DeFi（RHEA、LST）还有存量。日活账户从 2024-06 的约 224 万跌到约 12.5 万；Sweat 宣布 12-30 结束。“产品驱动 infra”的一手证据集中在账户和授权层：NEP-366 点名 Sweatcoin，NEP-519 点名 MPC，NEP-591 点名 Chain Signatures 钱包，NEP-635 点名 Intents passkey。 |
| [notes-main.md](notes-main.md)（O） | 抽查、4 Mantle | 主网分片边界是专门围绕 Sweat、HOT（独占一个分片）、KaiChing、Aurora 切出来的。PV 85 起改成动态布局，上限 10 个分片，已经从 9 个自动拆到 10 个。NEAR 是混合型：产品拉动账户 / 授权层和容量热点，研究路线推动执行层。NEAR Intents 目前不支持 Mantle，接入门槛在需求和做市商流动性。对 Mantle 最可复用的是“服务接口 + 渠道分发”，不是异步执行或托管账本。 |

## 主会话抽查（2026-10-07）

- A1：RPC `/status` 返回 `86 2.13.4`，一致。
- E8 / E9：DefiLlama API 返回 `total30d 4414741164` 和 `7384225`，一致。
- I23：`relayer.rs#L14-L27@4127e8e`，relayer key 只能调 `execute_intents`，allowance 为 Unlimited，一致。
- A47：NEP-519 L21 的动机示例是 MPC 签名合约，一致。
- C20 / C21：RPC `v1.signer.state()` 显示 17 个参与者、4 个 domain 的门限都是 11，一致；还补出了 domain 2 = CKD、domain 3 = ForeignTx 的 purpose（O7）。

## 资料（外部调研）中被修正或补充的地方

- **Chain Signatures 不再只是 outbound**：外部调研 §3.2 说“能签外部交易，不等于能验证外部状态”。现在同一个 MPC 网络在主网提供 `verify_foreign_transaction`，Omni 的 Aptos / Starknet 路由正在调用它（C32–C34、O7）。它的安全性来自 RPC 共识，不是 light client。
- **gas keys 的动机**：外部调研 §8.1 把 gas keys 当成“工作负载导向”的例子。NEP-611 原文写的是为 SPICE 防 DoS，属于 infra 驱动；而且 2.14 还会撤掉 gas key 签 meta tx 的 DelegateV2（A9、A11、E45、E49）。
- **动态 resharding 已经实际拆过一次**：外部调研只引用新闻稿。链上布局显示 9 → 10 已经发生，并且碰到了上限 10（O1–O5）。
- **CKD 与 AI 的联系**：外部调研 §6.3 称 CKD 是“AI 与链基础设施的真实技术连接”。没有一手证据显示 NEAR AI 在用 CKD；主网 CKD 的调用方是 `outlayer-admin*.near`（C45、N57）。另外，TEE attestation 由开发者合约检查，不由 MPC 合约检查（C43）。
- **NEAR AI 不全是机密推理**：Incognito 路由和 OpenRouter 路由都不在 TEE 保证范围内；官方还自述了 prefix cache 跨客户共享等局限（N3、N15、N17）。
- **Confidential Intents 的表述矛盾**：产品页写“decentralized validators + TEE-based bridge”，开发者文档写“small validator set + Private PoA Bridge”（I41、I42）。外部调研没有指出这一点。
- **10-01 事件的“Omni”**：停用的 11 条链与 HOT Bridge 支持链逐一吻合，很可能指 HOT/Omni，而不是 Near One 的 Omni Bridge（I50，inferred）；根因线索只是 speculative（I51）。
- **数据口径**：“链内 DEX 24h 约 1,788 万”实际是 Rhea Dex 单个协议的量级；DefiLlama 的 NEAR DEX 汇总里约 85% 是 Intents（E5）。explorer 上最大的 affiliate 是 NEAR 自己的回购钱包（E14）。
- **费用页**：外部调研说“旧费用总览与新配置页存在差异”，截至 10-07 两页已经一致（E19）。新增协议费 1 pip、无 key +25 bps 的口径（I12、I29）。
- **MPC 规模**：docs.near.org 的“8 nodes”已经过时，实际是 17 个运营方、门限 11（C20、C22）。

## 开放问题（汇总）

- 1Click ORIGIN_CHAIN 路径下，deposit address 的密钥由谁控制、用户侧 `token_diff` 由谁代签。
- FAR 的验证者数量与身份、Private PoA Bridge 是否运行在 TEE 中、Treasury 私钥由谁持有。
- 10-01 事件的官方技术复盘（截至 10-07 未发布）。
- Intents 的唯一用户数、留存；Confidential Intents 和 NEAR AI 的用量。
- 2026-04 上半月链上活动断崖的原因（E32、E33）。
- RPC 字段 `dynamic_resharding: false` 的含义；主网何时上调分片上限。
- SPICE 的上线版本与时间。

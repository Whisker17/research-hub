# Lane AI：NEAR AI 产品栈（NEAR AI Cloud / IronClaw / Shade Agents / agent 支付）

研究问题：NEAR 的 AI 产品分别是什么、机密推理和 agent runtime 怎样实现、哪些部分真正用到了 NEAR 链的基础设施、采用证据有哪些。
一句话答案：NEAR AI（运营实体 Jasnah, Inc. d/b/a NEAR AI）的核心是**链外**服务。NEAR AI Cloud 是一套 OpenAI 兼容的推理网关，开源模型跑在 Intel TDX CVM + NVIDIA 机密计算 GPU 里，靠 attestation 做可验证性；frontier 模型走“Incognito”路由，**不在** TEE 里执行。IronClaw 是用 Rust 重写的 OpenClaw 类 agent runtime，主要靠 WASM 沙箱、能力授权和凭证隔离做安全。和链有关的部分只有这几处：NEAR 账户登录（NEP-413 签名）、用质押收益或 NEAR 付费、Agent Market 通过 (Confidential) Intents 结算。推理本身不上链。Shade Agents（链上合约验证 TEE attestation + Chain Signatures）从 2026-04-19 起不再维护。公开资料里没找到 NEAR AI Cloud 使用 CKD / MPC 的一手证据。

---

## Q1. NEAR AI Cloud：提供什么、机密推理怎样实现、attestation 怎样验证、局限、与链的关系

**答案**：NEAR AI Cloud 提供 OpenAI 兼容的推理 API（`cloud-api.near.ai`），覆盖 chat/completions、responses、embeddings、rerank、图像、音频转写和 PII 分类 / 脱敏。模型分三档：Confidential TEE（NEAR 自营 GPU 集群）、3P Confidential TEE（例如 Chutes）、Incognito（OpenAI / Anthropic / Gemini 等，由运行在 TEE 里的网关转发，但模型本身不在 TEE 里）[5][7][9]。

机密推理分两层：

- **Gateway**：本身跑在 TDX CVM 里。
- **Private LLM Node**：每台 8×H200，用 Intel TDX + NVIDIA TEE，由 Private-ML-SDK 管理执行、attestation 和签名 [1][20][21]。

attestation 验证流程：客户端生成 32 字节 nonce → 拉取 `/v1/attestation/report` → 用 Intel DCAP 验证 quote → 从**已验证的 quote** 中读出 report_data。report_data 共 64 字节：前 32 字节绑定签名身份（开启 TLS 绑定时，改为签名身份与 TLS 指纹拼接后的 SHA-256），后 32 字节是 nonce。接着重放 event_log 核对 RTMR3，用 `app_compose` 的哈希核对 MRCONFIGID；如果有 GPU 证据，送 NVIDIA NRAS 验证。最后检查响应签名的 signer 与事先验证过的报告是否唯一匹配 [2][3][4]。

推理不上链。付费方式有三种：

- 按 token 计费的 Usage Credits（法币 / 卡，以美元计价）[8][9]；
- 2026-01-20 起，可通过 HOT Pay 用 NEAR 和其他加密货币支付 [11]；
- 2026-07-30 起可“Staking for Inference”：质押 NEAR，质押收益在协议层直接流向 NEAR AI，换算成 credits [6][9][18]。

**依据**：

- 三档隐私路由，以及“Incognito 不享有 TEE 隐私与可验证性保证”[5]；ToS 对 Private TEE Route / Attested Third-Party Route / Incognito Route 有法律定义 [9]。
- 架构：Gateway → Private LLM Node（8×H200、Intel TDX、Private-ML-SDK）[1]。Private ML SDK README 写明基于 NVIDIA GPU TEE（H100/H200/B100）+ Intel TDX，并推荐用 dstack-vmm 部署 [21]。NEAR AI 2025-01-19 的博客说这个 SDK 由 Phala Network 与 NEAR AI 合作构建（博客标题和摘要见 [10]）。
- 验证步骤与字段：见 [2][3][4]。Intel Trust Authority（ITA）独立验证器于 2026-08-12 集成 [10]；API 索引里 ITA token 接口是公开的，而 attestation report 接口“Requires an API key”[7]。
- **文档明说的局限**：
  - “Instances of the same model share one signing key, including instances with different measured configurations”，因此 signer 匹配不能证明报告和 completion 来自同一实例 [3]。
  - `gateway_attestation` 不是模型环境的证据 [2]。
  - Direct Completions（绕过 Gateway）是实验性的，存在已知的验证局限 [1]。
  - 2026-10-02 官方博客承认：Gateway 保留 usage logs；prefix cache 当前**跨客户共享**，响应时延可能泄露“某个猜测的前缀是否被处理过”；attestation 不证明代码没有 bug，安全性依赖 Intel / NVIDIA 的信任根 [20]。
  - 经 OpenRouter 的路由“is not confidential inference”，因为前面的 gateway 没有 attestation [19]。
- 与链的关系：
  - 计费在 cloud-api，金额以 nano-USD 计；“Real money-in lives in the billing service, not cloud-api”[7]。
  - 质押：ToS 定义 Staking Rewards 为“routed, protocol-direct, to NEAR AI”，validator 由 NEAR AI 或第三方运营，NEAR AI 非托管本金 [9]。API 里有 “House of Stake farm configuration used to convert on-chain staking reward units into NEAR AI Cloud credits” [7]。
  - 登录：IronClaw 源码显示 NEAR AI 支持用 NEP-413 钱包签名换取 session token（`/v1/auth/near`，recipient `cloud.near.ai`）[27]。

**不确定之处**：

- 当前模型目录是动态的（文档提到 Qwen / DeepSeek / GLM，示例模型为 `z-ai/glm-5.3-flash`），本 lane 没有列出实时清单 [3][6]。
- 没找到 attestation 结果写到链上、或在链上注册的证据；也没找到 NEAR AI Cloud 使用 CKD / MPC 管理密钥的证据。
- 首页称“Client-held encryption keys… no operator backdoor, by construction”[8]。这与文档的说法不一致：不用 E2EE SDK 时，Gateway CVM 会解密并处理内容 [20]。宣传口径强于技术文档。
- OpenRouter 博客说 attestation report “free and needs no account”[19]，API 参考则写 report 接口需要 API key（ITA token 接口才是公开的）[7]，两者矛盾。

## Q2. IronClaw：定位、架构、1.0 发布、部署、与 NEAR 链 / Intents 的集成点

**答案**：

- **定位**：IronClaw 是 “Rust reimplementation inspired by OpenClaw”[23]。GitHub 简介写作 “Agent OS focused on privacy, security and extensibility”[33]。
- **架构**：不可信工具跑在 WASM（wasmtime component model）里，所有能力默认关闭、需要显式开启（HTTP / secrets / 工具调用）。HTTP 只能访问 allowlist 里的 host / path，凭证在宿主边界注入、WASM 拿不到，请求和响应都做泄露扫描，另有速率和资源限制。审批服务签发有作用域的 capability lease [23][24][25][29][30][31][32]。
- **1.0 发布**：2026-07-27 发布。核心是“决策与执行分离”，所有动作都经过同一个 guard 检查点，敏感动作需要显式批准，secrets 默认一次性使用 [10][17]。最新 release 为 `ironclaw-v1.4.1`（2026-09-29）[34]。
- **部署**：可以本地安装（macOS / Linux / Windows 安装器）并接任意 LLM 提供方 [23][26]；也可以托管在 agent.near.ai / NEAR AI Cloud。2026-02-23 发布博客称托管版 “deployed inside encrypted TEEs on NEAR AI Cloud”[14]；2026-07-30 起质押 ≥50 NEAR 可启动托管 agent [18]。
- **与 NEAR 链的集成点**（本 lane 读到的源码范围内）：
  1. NEAR AI 是默认 LLM 后端，默认 base URL 为 `https://cloud-api.near.ai` [26][28]；
  2. NEP-413 钱包签名登录 NEAR AI [27]。

  workspace 成员里没有 near / intents / wallet / chain-signatures 相关的 crate [24]；外部支付由另一个仓库的 skill（x402-pay）提供，不在 IronClaw 核心里 [39]。

**依据**：

- README 的 Security / OpenClaw Heritage 节 [23]；`tool.wit` 的安全模型注释 [25]；`ironclaw_network` 负责 egress policy 和 DNS / 私网拦截，但不注入 secrets [30]；`ironclaw_secrets` 用不透明 handle 租借 secret，注释写明 “Runtime injection is not enforced until a higher-level … composition slice consumes these primitives” [31]；`ironclaw_safety` 提供泄露检测和 prompt-injection 防御 [32]；`ironclaw_approvals` 负责 “resolves durable approval requests and issues scoped authorization leases” [29]。
- 1.0 博客：benchmark 自报 PinchBench 93.5%、ClawBench 88.6%、OfficeQA 76.4%（基座模型统一为 deepseek-v4-flash），“already deployed across NEAR Foundation and NEAR AI, where every employee runs their own IronClaw agent”，并称老实例暂时不能直接升级 [17]。

**不确定之处**：

- benchmark 是自报数字，未独立复核。
- “TEE 内运行”只对托管版成立，自部署实例没有这个保证。
- 本 lane 没有逐个读完 1,000 多个文件，不能完全排除某个 extension 里有 NEAR 钱包或 Intents 工具（见开放问题）。
- `ironclaw_secrets` 的注释与 README“凭证在宿主边界注入”的表述，需要确认在 v1.x 是否已经全部接线。

## Q3. Shade Agents：原架构与停止维护

**答案**：Shade Agent 由两部分组成：

- **链外 agent**：跑在 TEE 里，默认部署到 Phala Cloud 或其他支持 Dstack 的 TEE；
- **链上 agent contract**：一个 NEAR 合约，通过 attestation、approved measurements 和 PPID 决定谁能充当 agent，执行 guardrails，并让合法 agent 通过 Chain Signatures（MPC）对多链交易签名 [36]。

docs.near.org 原文：“After April 19th, 2026, the Shade Agent Framework will no longer maintained as standalone developer tooling… Teams that choose to use it should plan to assume responsibility for maintenance” [35]。

**依据**：仓库 README 写道 “verification of trusted execution environments (TEE) in NEAR Protocol smart contracts and the usage of smart contract transaction singing via chain signatures. Guardrails can be implemented at the smart contract level to stop the execution of unauthorized actions even if the TEE is compromised”，并提醒 “has not yet undergone a formal audit” [36]。仓库在 2026-09-16 仍有提交（b5219422）[36]。

**不确定之处**：

- 文档没有说明停止维护的**原因**。
- 弃用通知的发布日期不详（页面只给出生效日 2026-04-19）。
- “仍有提交”与“停止维护”并存，可能是社区或个人在维护。

## Q4. Agent 支付：USDC + Confidential Intents；x402

**答案**：2026-05-14 的博客宣布 NEAR AI Agent Market 集成 USDC 与 Confidential Intents，并称 “USDC is live in the NEAR AI Agent Market”。流程是：用户或 agent 用任意 Intents 支持的资产付款，系统在私有环境中路由，收款方收到 USDC 等偏好资产。博客把 Confidential Intents 描述为 “powered by a NEAR private shard” [16]。状态上，博客声称已上线，但没有给出交易量。

Agent Market 本身于 2026-02-04 发布：发任务 → agent 竞标 → 资金进 escrow → 交付物附 verification hash → 以 NEAR 支付；争议由 “dispute agent” 裁决 [13]。

x402 方面：NEAR Foundation 官方博客标题和描述为 “NEAR Foundation Joins the x402 Foundation to Advance Open Infrastructure for the Agent Economy” [38]；NearDeFi/agent-payments-skill 提供 x402 支付 skill，在 Base 上用 USDC 付款，可经 NEAR Intents 跨链充值 [39]。

**依据**：[13][16][38][39]。

**不确定之处**：

- 博客没有说明 escrow 是链上合约还是 Intents 账本内锁定。
- “private shard”与 Confidential Intents 文档里的 FAR 私有链是什么关系，由 Privacy lane 核实。
- x402 博客正文是 JS 渲染的，没能读到正文和日期；二手报道称它与 Stellar 在某个周二一起宣布 [42]。

## Q5. User-Owned AI 叙事、组织、Agent Market 现状

**答案**：

- **创始人背景**：Illia Polosukhin 是 Transformer 论文 “Attention Is All You Need”（2017）的合著者，他本人主页写道：“co-founder of NEAR, where we're building user-owned AI” [40]。
- **NEAR 起源于 AI**：NEAR 的前身是 2017 年与 Alexander Skidanov 创立的 NEAR.ai，做 program synthesis，之后转向区块链 [41]。
- **组织**：NEAR AI Cloud 的签约方是 “Jasnah, Inc. d/b/a NEAR AI” [9]。NEAR AI 官方博客称 Illia 为 “Co-Founder of NEAR Protocol and Founder of NEAR AI” [15]。
- **Agent Market 现状**：Agent Market（market.near.ai）在 2026-02 上线，2026-05 起支持 USDC [13][16]。没找到使用量数据。

**依据**：[9][13][15][16][40][41]。

**不确定之处**：

- 没查到 Jasnah, Inc. 与 NEAR Foundation 的股权或资助关系。
- “User-Owned AI is NEAR” 博客（near.org）是 JS 渲染的，没能读到正文和日期。
- NEAR.ai → NEAR Protocol 一文只读到搜索摘要（“A bit more than a year ago Alexander Skidanov and I started NEAR.ai… program synthesis”），Medium 原文返回 403。

## Q6. AI 组件 → NEAR 能力对应表

| AI 组件 | 用到的 NEAR 能力 | 链上 / 链外 | 证据类型 |
|---|---|---|---|
| NEAR AI Cloud 推理（TEE 模型） | 无链上执行；TEE（TDX + NVIDIA CC）+ 客户端验证 attestation | 链外 | observed [1][2][3] |
| NEAR AI Cloud Incognito 路由 | 无；TEE 网关转发到第三方，模型不在 TEE 里 | 链外 | observed [5] |
| NEAR AI 账户登录 | NEAR 账户 + NEP-413 签名消息 | 签名在链外；是否查链上 access key 未知 | observed（客户端代码）[27] / speculative（服务端校验） |
| NEAR AI Cloud / IronClaw 付费 | NEAR 质押（staking pool / House of Stake farm）；HOT Pay | 质押在链上；credits 记账在链外 | observed [6][7][9][11][18] |
| IronClaw runtime | 默认 NEAR AI 推理；托管版跑在 NEAR AI Cloud TEE | 链外 | observed [14][26][28] |
| IronClaw 链上动作 | 核心 crate 里没找到 Intents / Chain Signatures 模块 | — | inferred [24] |
| Agent Market 支付 | NEAR Intents（escrow 和结算）、Confidential Intents（USDC 私有支付） | 链上（Intents）+ 私有链 / shard | observed（官方声明，未读合约）[13][16] |
| x402 skill | NEAR Intents 跨链充值到 Base USDC | 链上（Intents）+ Base | observed [39] |
| Shade Agents（已弃用） | 链上合约验证 TEE attestation + Chain Signatures（MPC） | 链上合约 + 链外 TEE | observed [35][36] |
| CKD | MPC 网络 + 开发者合约验证 TEE attestation | 链上请求 + MPC | observed（机制）[37]；NEAR AI 是否使用：speculative |

## Q7. 采用证据

- IronClaw GitHub：12,640 stars、1,482 forks，仓库创建于 2026-02-03（GitHub API，访问时间 2026-10-07）[33]。最新 release v1.4.1 发布于 2026-09-29，各资产下载量为两位数（例如 `ironclaw-installer.sh` 61 次），只是这一个 release 的 GitHub 资产下载量，不代表安装总量 [34]。
- 内部使用：NEAR Foundation 和 NEAR AI 每位员工各跑一个 IronClaw agent（自述）[17]。
- 已公开的集成方（只有官方公告，没有量化数据）[10][15][19]：OpenMind（2025-12-17）、Venice（2026-03-19）、Abound / Times of India Group（2026-04-02）、百慕大政府（2026-05-13）、Corbits（2026-07-15）、SayGm（2026-09-18）、OpenRouter provider（2026-09-28，只上了 GLM 5.3 Flash 一个模型）。
- **没找到**一手的 API 调用量、token 量、付费客户数或收入数据，也没找到 Agent Market 的交易量。cloud-api 有 admin 计费汇总接口（paid / grant 组织数），但不公开 [7]。

---

## 图的素材

**A. NEAR AI Cloud 请求与验证时序**（参与者：Client、Gateway CVM、Model CVM + GPU、Intel PCS / DCAP（或 ITA）、NVIDIA NRAS）[1][2][3][4][20]
1. Client 生成 32 字节 nonce，调用 `GET /v1/attestation/report?nonce=…&signing_algo=ecdsa`；如需模型证据，加 `model`、`provider=near` 和 `x-no-aliasing: true`。
2. Gateway 返回 `gateway_attestation`，以及可选的 `model_attestations[]` 候选。
3. Client 对每份报告依次：DCAP 验证 quote → 检查 report_data（signer 或 signer‖TLS 指纹的哈希、nonce）→ 重放 event_log 核对 RTMR3 → 核对 MRCONFIGID = `01‖SHA256(app_compose)‖0×15` → 把 `nvidia_payload` 发给 NRAS，要求 `x-nvidia-overall-att-result=true`。
4. Client 发出 completion，可选用 E2EE SDK，用绑定在 attestation 上的模型公钥加密内容。
5. Gateway 路由到 Model CVM；模型在 CVM 内解密、推理，再签名响应。
6. Client 取得 `provider_tee` 或 `gateway` 签名，要求 signer 与事先保留的已验证报告**唯一**匹配，否则判定为 unverified。

**B. 三档隐私路由对比**（维度：模型在哪执行 / 是否在 TEE / 是否可验证 / 上游看到什么）[5][9][19]
- Confidential TEE：NEAR 自营 GPU、在 TEE、可验证 gateway 和 model。
- 3P Confidential TEE：第三方 TEE（如 Chutes），证据由提供方自己发布；JS SDK 验证 Chutes，Python SDK 只验证 Gateway。
- Incognito：模型在 OpenAI / Anthropic / Google 的基础设施上，不在 TEE 里；上游只看到 NEAR AI 账户发来的请求，可选 PII 脱敏。
- OpenRouter 路由：GPU 硬件相同，但 gateway 没有 attestation，不算机密推理。

**C. NEAR AI 组件关系**（节点与边）[6][13][14][16][18][26][27]
- 用户 NEAR 钱包 →(NEP-413 签名)→ NEAR AI 账户
- 用户 NEAR 钱包 →(stake)→ staking pool →(rewards)→ NEAR AI →(credits)→ Cloud / IronClaw 托管
- IronClaw →(LLM 调用)→ NEAR AI Cloud Gateway → Model TEE / Incognito
- IronClaw / 其他 agent →(skill)→ Agent Market →(escrow / 结算)→ NEAR Intents / Confidential Intents（USDC）
- 旁支（已弃用）：Shade agent TEE →(attestation)→ agent contract →(sign)→ MPC / Chain Signatures → 外链

**D. IronClaw WASM 工具 HTTP 调用管线**（状态序列）[23][25]
WASM 请求 → Allowlist Validator（拒绝时返回 network-denied）→ Leak Scan（请求）→ Credential Injector（宿主注入）→ Execute Request → Leak Scan（响应）→ 返回 WASM。

**E. Shade Agent 架构**（参与者与顺序）[36]
1. Agent 容器在 TEE 里启动（默认 Phala Cloud / Dstack）。
2. Agent 把 attestation 提交给 agent contract 注册。
3. Contract 核对 approved measurements 和 PPID 后登记该 agent。
4. Agent 请求动作，contract 执行 guardrails。
5. Contract 调用 MPC（Chain Signatures）对外链交易签名。

**F. 时间线**
- 2017：Attention Is All You Need 发表；同年 NEAR.ai 创立，做 program synthesis [40][41]
- 2025-01-19：博客 “Building Next-Gen NEAR AI Infrastructure with TEEs”（Private ML SDK，与 Phala 合作）[10]
- 2025-12-03：NEAR AI Cloud & Private Chat 发布 [10]
- 2026-01-20：Release 26.1，可用 NEAR / 加密货币支付（HOT Pay）[11]
- 2026-02-02：OpenClaw 托管上线 NEAR AI Cloud TEE（beta，可用 NEAR 或银行卡订阅）[12]
- 2026-02-03：nearai/ironclaw 仓库创建 [33]
- 2026-02-04：NEAR AI Agent Market 发布（以 NEAR 支付）[13]
- 2026-02-23：NEARCON 2026，IronClaw 与 Confidential GPU Marketplace 发布 [14]
- 2026-02-23：Near One CKD 博客 [37]
- 2026-04-19：Shade Agent Framework 停止作为独立工具维护 [35]
- 2026-05-14：Agent Market 接入 USDC + Confidential Intents [16]
- 2026-07-27：IronClaw 1.0 [17]
- 2026-07-30：Staking for NEAR AI（推理与 agent 托管）[18]
- 2026-08-12：集成 Intel Trust Authority [10]
- 2026-09-28：成为 OpenRouter provider [19]
- 2026-09-29：IronClaw v1.4.1 [34]
- 2026-10-02：“Assume We're Lying” 博客，自述局限 [20]

## 代码素材

1. WASM 工具沙箱契约 — `nearai/ironclaw/crates/lanes/ironclaw_wasm/wit/tool.wit#L1-L12@b0b999d96781516ee05e6ba961d6f3ead900da96` [25]
```wit
package near:agent@0.4.1;

// WASM Tool Sandbox Interface
//
// Defines the contract between sandboxed tools and the host runtime.
// Tools export the `tool` interface; the host provides the `host` interface.
//
// Security Model:
// - WASM tools are untrusted and run in a sandbox
// - All capabilities are opt-in (default: no access)
// - Secrets are NEVER exposed to WASM; credentials are injected at host boundary
// - All outputs are scanned for secret leakage before returning to WASM
```

2. NEP-413 钱包登录 NEAR AI — `nearai/ironclaw/crates/domains/ironclaw_llm/src/session.rs#L31-L49@b0b999d96781516ee05e6ba961d6f3ead900da96` [27]
```rust
/// A NEP-413 wallet signature plus the payload it covers, ready to exchange for
/// a NEAR AI session token via `/v1/auth/near`. The browser produces this with a
/// connected NEAR wallet; ...
pub struct NearWalletSignedMessage {
    pub account_id: String,
    pub public_key: String,
    /// base64-standard encoding of the 64 raw ed25519 signature bytes.
    pub signature: String,
    /// The exact message string that was signed (NEAR AI expects a fixed value).
    pub message: String,
    /// The NEP-413 recipient that was signed (NEAR AI expects `cloud.near.ai`).
    pub recipient: String,
    /// The 32-byte nonce that was signed. NEAR AI requires the first 8 bytes to
    /// be the big-endian epoch-millis timestamp (validated within a 5-min window).
    pub nonce: Vec<u8>,
    pub callback_url: Option<String>,
}
```
（第 3 行注释截断，第 35 行的 `#[derive]` 省略。）

3. NEAR AI 作为默认推理后端 — `nearai/ironclaw/crates/domains/ironclaw_llm/src/resolution.rs#L518@b0b999d…` 与 `#L539-L541` [28]
```rust
pub const NEARAI_CLOUD_DEFAULT_BASE_URL: &str = "https://cloud-api.near.ai";
pub fn default_nearai_base_url(configured_base_url: Option<String>) -> String {
    configured_base_url.unwrap_or_else(|| NEARAI_CLOUD_DEFAULT_BASE_URL.to_string())
}
```

4. 请求模型 attestation（文档示例，不是仓库代码）— docs.near.ai model-attestations [3]
```bash
NONCE="$(openssl rand -hex 32)"
curl --fail-with-body -G 'https://cloud-api.near.ai/v1/attestation/report' \
  --data-urlencode 'model=<MODEL_ID>' --data-urlencode 'provider=near' \
  --data-urlencode 'signing_algo=ecdsa' --data-urlencode "nonce=${NONCE}" \
  -H 'x-no-aliasing: true' -H 'Authorization: Bearer <YOUR_NEAR_AI_CLOUD_API_KEY>'
```

## 来源

（以下网页的访问日期都是 2026-10-07。）

1. **PRIMARY** docs.near.ai — Private Inference：https://docs.near.ai/cloud/private-inference 。证明了 Gateway / Private LLM Node 两层结构、8×H200、Intel TDX + NVIDIA TEE、Private-ML-SDK，以及 Direct Completions 的验证局限。
2. **PRIMARY** docs.near.ai — Gateway Attestation：https://docs.near.ai/cloud/verification/cloud-api/gateway-attestation 。证明了 gateway 的验证步骤（nonce、DCAP、RTMR3、MRCONFIGID），以及 gateway 证据不能当作模型证据。
3. **PRIMARY** docs.near.ai — NEAR Model Attestations：https://docs.near.ai/cloud/verification/cloud-api/model-attestations 。证明了模型报告的字段、验证步骤，以及“同一模型的实例共享签名密钥”这一局限。
4. **PRIMARY** docs.near.ai — Quote, Nonce, and Signer Bindings：https://docs.near.ai/cloud/verification/reference/quote-nonce-signer 。证明了 report_data 的 64 字节布局、TLS 绑定方式，以及 GPU 证据走 NVIDIA NRAS 验证。
5. **PRIMARY** docs.near.ai — Available Models：https://docs.near.ai/cloud/models 。证明了三档隐私路由，以及 Incognito 路由不受 TEE 保证覆盖。
6. **PRIMARY** docs.near.ai — Staking for Inference：https://docs.near.ai/cloud/staking-for-inference/overview 。证明了质押收益换算为 credits（1 credit = 1 美元），以及 frontier 模型走 TEE 网关转发。
7. **PRIMARY** docs.near.ai — llms.txt / API reference 索引：https://docs.near.ai/llms.txt 。证明了 OpenAI 兼容端点的范围、staking farm 接口（House of Stake）、report 接口需要 API key、ITA token 接口公开，以及计费以 nano-USD 计、资金收入走独立的 billing service。
8. **PRIMARY** near.ai 首页：https://near.ai 。证明了产品宣传口径（TDX + NVIDIA GPU TEE、OpenAI 兼容、按 token 计费、“client-held keys”）。
9. **PRIMARY** NEAR AI Cloud Terms of Service：https://near.ai/terms-of-service 。证明了签约主体是 Jasnah, Inc. d/b/a NEAR AI、三种路由的法律定义，以及 Staking Rewards 在协议层直接流向 NEAR AI、本金非托管。
10. **PRIMARY** NEAR AI 博客索引第 1、2 页：https://near.ai/blog 、https://near.ai/blog?page=2 。证明了 2025–2026 各篇文章的标题与日期（Cloud 发布、ITA、Corbits、Bermuda、Abound、OpenMind、Private ML SDK 等）。
11. **PRIMARY** NEAR AI Release 26.1（2026-01-20）：https://near.ai/blog/near-ai-release-26-1 。证明了可通过 HOT Pay 用 NEAR 和其他加密货币支付推理费用。
12. **PRIMARY** OpenClaw Is Now Available on NEAR AI Cloud（2026-02-02）：https://near.ai/blog/openclaw-now-available-on-near-ai-cloud 。证明了在 TEE 中托管 OpenClaw（beta），可用 NEAR 或银行卡订阅。
13. **PRIMARY** Introducing NEAR AI Agent Market（2026-02-04）：https://near.ai/blog/introducing-near-ai-agent-market 。证明了 Agent Market 的流程（竞标、escrow、NEAR 支付、dispute agent），以及它基于 NEAR Intents。
14. **PRIMARY** NEAR AI Launches IronClaw…（2026-02-23）：https://near.ai/blog/near-ai-launches-ironclaw-confidential-gpu-marketplace-and-multimodal-confidential-inference 。证明了 IronClaw 在 NEARCON 发布、托管版跑在 NEAR AI Cloud TEE，以及 Confidential GPU Marketplace。
15. **PRIMARY** Venice Is Now Verifiably Private With NEAR AI（2026-03-19）：https://near.ai/blog/near-ai-launches-ironclaw-confidential-gpu-marketplace 。证明了 Venice 集成，以及 Illia 的头衔 “Founder of NEAR AI”。
16. **PRIMARY** NEAR AI Brings Private USDC Payments…（2026-05-14）：https://near.ai/blog/usdc-confidential-intents-private-agent-payments 。证明了 USDC + Confidential Intents 已在 Agent Market 上线（官方声明），以及 “NEAR private shard” 的表述。
17. **PRIMARY** Introducing IronClaw 1.0（2026-07-27）：https://near.ai/blog/introducing-ironclaw-1-0 。证明了 1.0 的架构（guard、审批、一次性 secrets）、自报 benchmark，以及内部全员部署。
18. **PRIMARY** Announcing Staking for NEAR AI（2026-07-30）：https://near.ai/blog/staking-for-near-ai 。证明了用质押支付推理和 IronClaw 托管（质押 NEAR ÷ 100 = 每月美元 credits；≥50 NEAR 可启动 agent）。
19. **PRIMARY** NEAR AI Cloud Is Now a Provider on OpenRouter（2026-09-28）：https://near.ai/blog/near-ai-cloud-on-openrouter 。证明了 OpenRouter 上只提供 GLM 5.3 Flash，且该路由不算机密推理。
20. **PRIMARY** Assume We're Lying（2026-10-02）：https://near.ai/blog/assume-were-lying-how-to-verify-private-ai 。证明了 TDX + H200 CC 的配置、E2EE 路径，以及 Gateway 保留 usage logs、prefix cache 跨客户共享、attestation 不证明无 bug 等局限。
21. **PRIMARY** nearai/private-ml-sdk README：https://github.com/nearai/private-ml-sdk 。证明了 SDK 基于 NVIDIA GPU TEE（H100/H200/B100）+ TDX，以及 dstack-vmm 部署方式。
22. **PRIMARY** github.com/nearai 组织页：https://github.com/nearai 。证明了相关仓库（cloud-api、inference-proxy、cvm-compose-files、ironclaw、private-chat 等）都由 nearai 组织维护。
23. **PRIMARY** IronClaw README：https://github.com/nearai/ironclaw/blob/b0b999d96781516ee05e6ba961d6f3ead900da96/README.md#L206-L220 （Security 节）与 #L325-L334（OpenClaw Heritage 节）。证明了 WASM 沙箱的安全特性，以及它是 OpenClaw 的 Rust 重写。
24. **PRIMARY** IronClaw Cargo.toml：https://github.com/nearai/ironclaw/blob/b0b999d96781516ee05e6ba961d6f3ead900da96/Cargo.toml#L2 （workspace members）与 #L23-L28（wasmtime 47.0.4 component-model）。证明了模块划分，以及 workspace 中没有 near / intents / wallet 相关 crate。
25. **PRIMARY** tool.wit：https://github.com/nearai/ironclaw/blob/b0b999d96781516ee05e6ba961d6f3ead900da96/crates/lanes/ironclaw_wasm/wit/tool.wit#L1-L12 。证明了工具沙箱的安全模型：能力默认关闭、secrets 由宿主注入、输出做泄露扫描。
26. **PRIMARY** ironclaw_llm/src/lib.rs：https://github.com/nearai/ironclaw/blob/b0b999d96781516ee05e6ba961d6f3ead900da96/crates/domains/ironclaw_llm/src/lib.rs#L1-L10 。证明了 NEAR AI 是默认后端，同时支持 OpenAI / Anthropic / Ollama / Bedrock 等。
27. **PRIMARY** ironclaw_llm/src/session.rs：https://github.com/nearai/ironclaw/blob/b0b999d96781516ee05e6ba961d6f3ead900da96/crates/domains/ironclaw_llm/src/session.rs#L31-L49 。证明了 NEP-413 签名换 NEAR AI session token 的流程（`/v1/auth/near`、recipient `cloud.near.ai`、nonce 内含时间戳）。
28. **PRIMARY** ironclaw_llm/src/resolution.rs：https://github.com/nearai/ironclaw/blob/b0b999d96781516ee05e6ba961d6f3ead900da96/crates/domains/ironclaw_llm/src/resolution.rs#L518-L541 。证明了默认 base URL 是 cloud-api.near.ai。
29. **PRIMARY** ironclaw_approvals/src/lib.rs：https://github.com/nearai/ironclaw/blob/b0b999d96781516ee05e6ba961d6f3ead900da96/crates/kernel/ironclaw_approvals/src/lib.rs#L1-L5 。证明了审批服务签发有作用域的 authorization lease。
30. **PRIMARY** ironclaw_network/src/lib.rs：https://github.com/nearai/ironclaw/blob/b0b999d96781516ee05e6ba961d6f3ead900da96/crates/substrates/ironclaw_network/src/lib.rs#L1-L7 。证明了 egress policy 和私网目标拦截，且该 crate 不注入 secrets。
31. **PRIMARY** ironclaw_secrets/src/lib.rs：https://github.com/nearai/ironclaw/blob/b0b999d96781516ee05e6ba961d6f3ead900da96/crates/substrates/ironclaw_secrets/src/lib.rs#L2-L8 。证明了 secret 以不透明 handle 方式租借，且注入要由上层组合层负责。
32. **PRIMARY** ironclaw_safety/src/lib.rs：https://github.com/nearai/ironclaw/blob/b0b999d96781516ee05e6ba961d6f3ead900da96/crates/substrates/ironclaw_safety/src/lib.rs#L1-L8 。证明了 prompt-injection 防御和 secret 泄露检测。
33. **PRIMARY** GitHub API repos/nearai/ironclaw：https://api.github.com/repos/nearai/ironclaw 。证明了 stars 12,640、forks 1,482，以及仓库创建于 2026-02-03。
34. **PRIMARY** GitHub API releases：https://api.github.com/repos/nearai/ironclaw/releases 。证明了 v1.4.1 于 2026-09-29 发布，以及各资产的下载量。
35. **PRIMARY** docs.near.org — Shade Agents (deprecated)：https://docs.near.org/ai/shade-agents/introduction 。证明了 2026-04-19 之后不再作为独立工具维护。
36. **PRIMARY** NearDeFi/shade-agent-framework README 与 docs/concepts/framework-overview.md @b5219422503f4c43426fba39bc7ebdb1cc953fff（2026-09-16）：https://github.com/NearDeFi/shade-agent-framework/blob/b5219422503f4c43426fba39bc7ebdb1cc953fff/docs/concepts/framework-overview.md 。证明了 TEE agent + 链上 agent contract（attestation / measurements / PPID）+ Chain Signatures 的结构，默认部署到 Phala，且未经正式审计。
37. **PRIMARY** Near One — Confidential Key Derivation in the MPC Network（2026-02-23）：https://blog.nearone.org/research/2026/02/23/mpc-ckd.html 。证明了 CKD 面向 TEE 应用的流程（Developer contract 验证 attestation → MPC contract → 网络返回加密后的密钥）；全文没有提到 NEAR AI。
38. **PRIMARY**（只读到页面元数据）near.org — NEAR Foundation Joins the x402 Foundation：https://www.near.org/blog/near-foundation-joins-x402-foundation 。证明了 NEAR Foundation 加入 x402 Foundation；正文和日期没有读到。
39. **PRIMARY** NearDeFi/agent-payments-skill README：https://github.com/NearDeFi/agent-payments-skill 。证明了 x402 支付 skill 在 Base 上用 USDC 付款，并可经 NEAR Intents 跨链充值。
40. **PRIMARY** Illia Polosukhin 个人主页：https://ilblackdragon.com/ 。证明了他是 Transformer 论文合著者、NEAR 联合创始人，以及 “building user-owned AI” 的表述。
41. **PRIMARY**（只读到搜索摘要）near.org — NEAR.ai → NEAR Protocol：https://www.near.org/blog/near-ai-near-protocol 。证明了 NEAR 起源于 NEAR.ai（program synthesis）。
42. 二手：cryptowisser / crypto-economy 关于 x402 的报道（仅作线索）：https://www.cryptowisser.com/news/near-foundation-and-stellar-developmentf-foundation-join-the-x402-foundation/ 。只说明有“与 Stellar 同日宣布”的二手说法。
43. **PRIMARY** IronClaw FEATURE_PARITY.md：https://github.com/nearai/ironclaw/blob/b0b999d96781516ee05e6ba961d6f3ead900da96/FEATURE_PARITY.md#L14 。证明了项目在持续对标 OpenClaw（最近一次对照 OpenClaw PR 是 2026-05-02）。

## 外部调研中被修正或无法核实的地方

- **§6.1 “NEAR AI Cloud 提供模型 API 和机密计算环境”**：说得不完整。NEAR AI Cloud 还有 Incognito 路由，OpenAI / Anthropic / Gemini 等 frontier 模型在提供方自己的基础设施上运行，**不在 TEE 里**，TEE 的隐私和可验证性保证不覆盖上游 [5][9]。经 OpenRouter 的路由也不算机密推理 [19]。不能笼统说“NEAR AI 的推理都是机密的”。
- **§6.1 “调用模型 API 不必对应一笔 NEAR 交易”**：成立，但遗漏了 2026-07-30 起的链上关联。质押 NEAR 后，收益在协议层直接流向 NEAR AI，换算成 credits；2026-01-20 起也可以用 NEAR 付费；还可以用 NEAR 钱包（NEP-413）登录 [6][9][11][18][27]。
- **§6.1 局限（共享签名密钥）**：已核实 [3]。外部调研漏掉了官方自述的另外几项局限：prefix cache 跨客户共享（存在时延侧信道）、Gateway 保留 usage logs、Gateway 能看到明文（不使用 E2EE SDK 时）[20]。
- **§6.2 IronClaw “1.0 在 2026 年 7 月发布”**：已核实，日期是 2026-07-27 [10][17]。“可以本地部署，也可以选择不同模型供应方”也已核实 [23][26]。补充一点：托管版在 NEAR AI Cloud TEE 里运行，可以通过质押 NEAR 启用 [14][18]。
- **§6.3 CKD 是“AI 与链基础设施之间一个真实的技术连接”**：**无法核实**。CKD 博客只讲通用 TEE 应用，没有提到 NEAR AI、IronClaw 或 FAR [37]。本 lane 也没找到 NEAR AI Cloud 用 CKD 的证据。外部调研自己也有保留，但标题的说法过强，应标为 speculative。
- **§6.4 私有 agent 支付**：机制和“已上线”的状态以官方声明为准 [16]。外部调研没有提到：Agent Market 2026-02 初版是以 NEAR 支付的 [13]；NEAR Foundation 加入了 x402 Foundation [38]；x402-pay skill 经 Intents 充值 [39]。
- **§6.5 Shade Agents 停止维护**：已核实，2026-04-19 [35]。外部调研没给出原因，官方页面也没有说明原因。
- 外部调研没有提到 NEAR AI 的运营主体（Jasnah, Inc.）[9]，也没有说明 Private ML SDK 与 Phala / dstack 的关系 [10][21]。

## 开放问题

1. NEAR AI 服务端校验 NEP-413 时，会不会查询链上 access key（例如只接受 Full-Access key）？
2. Staking for Inference 用哪个 staking pool 合约？“House of Stake farm” 的链上合约账户和收益路由实现是什么？能否从链上数据统计质押规模，作为采用度指标？
3. Agent Market 的 escrow 是 Intents verifier 内的锁定，还是独立合约？USDC 私有支付走的是 FAR 私有链，还是博客所说的 “private shard”？这两者是否同一个东西？
4. NEAR AI Cloud、IronClaw 托管或 FAR 有没有用 MPC CKD 做 TEE 持久化密钥？`cvm-compose-files` 里的 KMS 配置可以作为线索。
5. IronClaw 的 extension registry 或外部 skills 里，有没有官方的 NEAR 钱包、Intents 或 Chain Signatures 工具？
6. Shade Agents 停止维护的官方原因是什么？是否被 IronClaw 托管或其他产品取代？
7. Jasnah, Inc. 与 NEAR Foundation 的关系（资助、持股）。
8. 有没有任何一手的使用量数据：API token 量、付费组织数、Agent Market 交易额？

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| N1 | NEAR AI Cloud 提供 OpenAI 兼容的推理 API（cloud-api.near.ai），覆盖 chat、responses、embeddings、rerank、图像、音频 | [7][8] docs llms.txt 端点清单；首页 “OpenAI-compatible API” | observed | |
| N2 | 模型分三档路由：Confidential TEE / 3P Confidential TEE / Incognito | [5] Available Models；[9] ToS 定义 Private TEE / Attested 3P / Incognito Route | observed | |
| N3 | Incognito 路由的模型在提供方基础设施上、不在 TEE 里，TEE 的隐私与可验证性保证不覆盖上游 | [5] “runs on the provider's infrastructure, outside a TEE” | observed | |
| N4 | Gateway 运行在自己的 TEE 里，再转发到模型 TEE | [1] “Gateway mode … runs in its own TEE before forwarding to the model TEE”；[20] | observed | |
| N5 | Private LLM Node 规格是 8×H200 + Intel TDX CPU，由 Private-ML-SDK 负责执行、attestation 和签名 | [1] Architecture Overview | observed | |
| N6 | Private ML SDK 基于 NVIDIA GPU TEE（H100/H200/B100）+ Intel TDX，推荐用 dstack-vmm 部署 | [21] README | observed | |
| N7 | Private ML SDK 由 Phala Network 与 NEAR AI 合作构建（2025-01-19 博客） | [10] 博客索引中该文的摘要 | observed | |
| N8 | attestation 验证以客户端生成的 32 字节 nonce 起步，并以已验证的 quote 作为事实来源 | [2][4] | observed | |
| N9 | NEAR 报告的 report_data 为 64 字节：前 32 字节绑定签名身份（或身份‖TLS 指纹的 SHA-256），后 32 字节是 nonce | [4] “Read NEAR report data” | observed | |
| N10 | 验证还包括：重放 event_log 核对 RTMR3；MRCONFIGID = 01‖SHA256(app_compose)‖15 个零字节 | [2][3][4] | observed | |
| N11 | GPU 证据（nvidia_payload）送 NVIDIA NRAS 验证，要求 x-nvidia-overall-att-result=true | [4] | observed | |
| N12 | 响应签名的 signer 必须与事先保留的已验证报告唯一匹配，事后拉取的报告不能替代 | [2][3] | observed | |
| N13 | 同一模型的不同实例（包括测量配置不同的实例）共享一把签名密钥，signer 匹配不能证明是同一实例 | [3] Warning 原文 | observed | |
| N14 | gateway_attestation 不是模型环境的证据 | [2] 首段 | observed | |
| N15 | 官方自述：prefix cache 跨客户共享，响应时延可能泄露某个前缀是否被处理过；Gateway 保留 usage logs | [20] “What remained” 节 | observed | |
| N16 | 官方自述：attestation 不证明代码没有 bug，安全性依赖 Intel / NVIDIA 的硬件与证明体系 | [20] “What this doesn't prove” | observed | |
| N17 | 经 OpenRouter 访问 NEAR AI 不算机密推理（前置 gateway 没有 attestation） | [19] | observed | |
| N18 | 首页“我们永远看不到明文”的宣传强于技术文档：不使用 E2EE SDK 时，Gateway CVM 会处理明文内容 | 由 [8]、[20] 推出：首页称 client-held keys / never see plaintext，而 [20] 说明 TLS 在 Gateway 终止，只有 E2EE 时 Gateway 才看不到内容 | inferred | |
| N19 | 2026-08-12 起集成 Intel Trust Authority，作为独立于运营方的 attestation 验证器 | [10] 博客索引 | observed | |
| N20 | 关于 attestation report 是否需要账户，官方说法矛盾：API 参考写需要 API key，OpenRouter 博客写不需要账户 | [7] “Requires an API key”；[19] “free and needs no account” | observed | |
| N21 | 推理不在链上执行；计费在 cloud-api 中以 nano-USD 记账，资金收入走独立的 billing service | [7] billing / admin 接口描述；[1] 架构里没有链上组件 | observed | |
| N22 | 2026-01-20 起可通过 HOT Pay 用 NEAR 和其他加密货币支付推理 | [11] | observed | |
| N23 | Staking for Inference：质押收益（不是本金）换算成 credits，1 credit = 1 美元，按秒累计 | [6] | observed | |
| N24 | Staking Rewards 在协议层直接流向 NEAR AI，NEAR AI 不托管本金，validator 由 NEAR AI 或第三方运营 | [9] ToS 定义 | observed | |
| N25 | 质押也可用于 IronClaw 托管：质押 NEAR ÷ 100 = 每月美元 credits，≥50 NEAR 可启动第一个 agent | [18] | observed | |
| N26 | NEAR AI 支持用 NEP-413 钱包签名换取 session token（/v1/auth/near，recipient cloud.near.ai） | [27] session.rs#L31-L49 | observed | |
| N27 | 没找到证据表明 NEAR AI Cloud 把 attestation 写到链上，或用 CKD / MPC 管理密钥 | 由 [1]–[7]、[37] 推出：验证文档全部是客户端验证流程；CKD 博客没有提到 NEAR AI | inferred | |
| N28 | NEAR AI Cloud 的签约主体是 Jasnah, Inc. d/b/a NEAR AI | [9] ToS 首段 | observed | |
| N29 | IronClaw 是受 OpenClaw 启发的 Rust 重写，在 WASM 沙箱、PostgreSQL、安全设计上与 OpenClaw 不同 | [23] README#L325-L334 | observed | |
| N30 | IronClaw 的 WASM 工具能力默认关闭；secrets 不暴露给 WASM，由宿主边界注入；输出做泄露扫描 | [25] tool.wit#L1-L12；[23] README#L206-L220 | observed | |
| N31 | IronClaw 的 HTTP 只能访问 allowlist 中的 host / path，请求与响应都做泄露扫描，并有速率与资源限制 | [23] README#L206-L220；[30] network policy | observed | |
| N32 | IronClaw 的审批服务签发有作用域的 capability / authorization lease | [29] approvals lib.rs#L1-L5 | observed | |
| N33 | ironclaw_secrets 的注释写明，运行时注入要由上层组合层消费这些原语后才强制生效 | [31] lib.rs#L2-L8 | observed | |
| N34 | IronClaw 1.0 于 2026-07-27 发布：单一 guard 检查点、敏感动作需显式批准、secrets 默认一次性 | [10][17] | observed | |
| N35 | IronClaw 1.0 自报 PinchBench 93.5%、ClawBench 88.6%、OfficeQA 76.4%（基座模型 deepseek-v4-flash） | [17]（自报，未独立复核） | observed | |
| N36 | IronClaw 默认 LLM 后端是 NEAR AI（cloud-api.near.ai），也支持 OpenAI / Anthropic / Ollama / Bedrock 等 | [26] lib.rs#L1-L10；[28] resolution.rs#L518-L541 | observed | |
| N37 | IronClaw 可以本地安装，接任意提供方；托管版运行在 NEAR AI Cloud TEE 内 | [23] 安装节；[14] “deployed inside encrypted TEEs on NEAR AI Cloud” | observed | |
| N38 | IronClaw 核心 workspace 中没有 NEAR 钱包、Intents 或 Chain Signatures 模块；与链的集成只有推理后端和 NEP-413 登录 | 由 [24]、[26]、[27] 推出：members 列表里没有相关 crate，读到的 NEAR 代码只在 ironclaw_llm 中 | inferred | |
| N39 | IronClaw GitHub 有 12,640 stars、1,482 forks，仓库创建于 2026-02-03（2026-10-07 API 快照） | [33] | observed | |
| N40 | IronClaw 最新 release 是 v1.4.1（2026-09-29），各资产 GitHub 下载量为两位数 | [34] | observed | |
| N41 | IronClaw 已部署给 NEAR Foundation 与 NEAR AI 全体员工（每人一个 agent） | [17] 自述 | observed | |
| N42 | Shade Agent = TEE 中的 agent + 链上 agent contract（attestation / measurements / PPID 准入、guardrails）+ Chain Signatures 签名 | [36] framework-overview.md、README | observed | |
| N43 | Shade Agent 默认部署在 Phala Cloud / Dstack，框架未经正式审计 | [36] | observed | |
| N44 | 2026-04-19 之后 Shade Agent Framework 不再作为独立开发工具维护，使用者需自行维护 | [35] | observed | |
| N45 | 官方没有说明 Shade Agents 停止维护的原因；IronClaw 托管是否是其替代品没有一手证据 | 由 [35]、[14] 推出：弃用页面没有给原因，IronClaw 发布文也没提 Shade | inferred | |
| N46 | NEAR AI Agent Market 于 2026-02-04 发布：任务竞标、escrow、以 NEAR 支付、dispute agent，基于 NEAR Intents | [13] | observed | |
| N47 | 2026-05-14 起，USDC 经 Confidential Intents 在 Agent Market 上线，官方称 Confidential Intents 由 “NEAR private shard” 驱动 | [16] | observed | |
| N48 | 没找到 Agent Market 或私有 USDC 支付的交易量数据 | 由 [13]、[16]、[10] 推出：所有相关官方文章都没有数字 | inferred | |
| N49 | NEAR Foundation 已加入 x402 Foundation | [38] near.org 页面标题与 meta description | observed | |
| N50 | NearDeFi/agent-payments-skill 提供 x402 支付（Base 上的 USDC），可经 NEAR Intents 跨链充值 | [39] | observed | |
| N51 | Illia Polosukhin 是 “Attention Is All You Need”（2017）合著者，自述在 NEAR 构建 user-owned AI | [40] | observed | |
| N52 | NEAR 起源于 2017 年创立的 NEAR.ai（program synthesis） | [41]（只读到 near.org 原文的搜索摘要） | observed | |
| N53 | NEAR AI 官方称 Illia 为 “Founder of NEAR AI” | [15] | observed | |
| N54 | NEAR AI Cloud 于 2025-12-03 发布；2026-02-02 起在 TEE 中托管 OpenClaw（beta，可用 NEAR 或银行卡订阅） | [10][12] | observed | |
| N55 | 已公开的 NEAR AI Cloud 集成方：OpenMind、Venice、Abound、百慕大政府、Corbits、SayGm、OpenRouter；没有调用量数字 | [10][15][19] | observed | |
| N56 | CKD 的设计面向 TEE 应用：开发者合约验证 attestation → MPC contract → MPC 网络返回加密密钥 | [37] | observed | |
| N57 | NEAR AI 产品是否实际使用 CKD 无法确认 | 由 [37]、[1] 推出：CKD 博客与 NEAR AI 文档互不引用 | speculative | |

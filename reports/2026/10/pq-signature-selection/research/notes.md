# notes：调研索引（pq-signature-selection）

资料截止 2026-10-20。三路并行调研，各路分册与台账前缀如下；合并台账见 `ledger.md`（193 行：observed 148 / inferred 39 / speculative 6）。

| 分册 | 前缀 | 一句话答案 |
|---|---|---|
| `notes-hash.md` | H | 哈希签名只依赖哈希，但签名大（leanXMSS 2,404 B、leanSPHINCS 4,276 B）且有状态风险；Ethereum 共识的 leanXMSS + leanVM（EIP-8292）是能跑的原型：leanVM 已改为二进制域 + WHIR、BLAKE2s 占位，10-17 换成两层 leanXMSS，1,362 签名/秒，自述未就绪。Ethereum 的理由是依赖最少 + AI 风险；Starknet 是“证明层哈希、账户层可用 Falcon”。 |
| `notes-lattice.md` | L | Falcon 小而快，难点在签名端（浮点采样）和标准（FIPS 206 无草案，NIST 09-28 改定点）。Aerie 单机 0.645 s 证明 32,768 个 Falcon-512，默认含盐 1,346 KiB，66 KiB 是共同盐估算且需额外假设；只证经典 ROM、不能合并、研究发布。a16z 四条论点（性能、递归安全、非标准、隐私）逐条核对。Algorand 已上线原生 Falcon-1024（确定性变体）。 |
| `notes-eip.md` | E | EIP-8288（Draft）给 8141 加 mode 4 依赖帧，区块头带递归 STARK；当前只支持 leanSPHINCS，leanSTARK 预留、AGGREGATED_VK/DEPS_HASH TBD；每依赖约 33,000 gas。8355 被拒，8141 在 Hegotá（预计 2027 Q2），8288 不在。前两篇需修订：8355 消息格式、0x0101 在 RIP 区间、AA 时间线、预编译定位、8288 不能聚合 SP1 证明。 |
| `gpt-pq-signature-selection.md` | — | 外部调研（ChatGPT Deep Research），只作线索。 |

## 资料中被修正的地方
- GPT：8288 gas 写成“每依赖 3,000 + 每元组 30,000”未合计（实为约 33,000，回滚照收）；漏了区块头 100–300 kB STARK；漏了 leanVM 10-17 换签名方案；把“公开盐”算成 Aerie 首创（实出自 Aardal 等 2024）；漏了 8355 被拒、8141 已排期；FN-DSA 新计划来源错挂 FIPS 204 页面。
- 第二篇（pq-in-mantle）：8355 消息格式（“32 B digest”有误）；`0x0101` 位于 EIP-7587 RIP 区间；台账 #47 Native AA 2028–29 已过时；Algorand v42“主网激活日期”无一手来源。
- 第一篇（post-quantum-mantle）：“8288 可做 L1 侧聚合”需限定（不能直接聚合 SP1 证明）；leanVM 架构已变；Starknet Falcon 账户已有两家实现。

## 开放问题
见各分册“开放问题”一节；页面面板 T 汇总。

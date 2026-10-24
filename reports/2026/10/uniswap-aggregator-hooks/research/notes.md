# notes：调研索引

报告：uniswap-aggregator-hooks｜2026-10-24｜路径 C（GPT Deep Research 当线索）+ 主会话读源码与链上数据。

分册：
- [notes-code.md](notes-code.md)（C 代码机制、D 链上数据）：主会话读 `Uniswap/v4-hooks-public@2264ac8`、v4-core@d153b04、protocol-fees@656096f，跑 `cast` 与 Dune（查询 8999850、8999852、8999853、8999857、8999858）。
- [notes-market.md](notes-market.md)（M 市场与对比）：researcher 子 agent，官方 blog、治理帖、聚合器文档、0x 博文。
- [gpt-agg.md](gpt-agg.md)：用户提供的 GPT Deep Research，只作线索。
- 台账：[ledger.md](ledger.md)（C 39 行、D 13 行、M 44 行、G 8 行）。

## 每个研究问题一句话

1. **怎么实现**：每个外部来源一个 hook，只开 beforeInitialize / beforeAddLiquidity / beforeSwap / beforeSwapReturnDelta；beforeSwap 里在外部协议真实成交，用 take / settle 把资金流记进 PoolManager，返回 `specified = −amountSpecified` 把 v4 核心计算抵消成 0，unlock 的“delta 归零”检查兜底。储备始终在外部协议（C1–C13、C21–C33）。
2. **hooks 背景**：只需单例 PoolManager + PoolKey、unlock / flash accounting、地址权限位、return delta 四个概念（C1–C7），细节引用 `uniswap-v4-hooks` 报告。
3. **与聚合器的区别**：寻路仍在 Uniswap 链下路由器，但外部来源以 v4 PoolKey 身份进入统一结算，授权走 Permit2 + Universal Router，收费是协议费进 TokenJar 烧 UNI；传统聚合器是私有执行合约直连各 DEX，intent 系统是签单 + solver（M10–M18、G1）。
4. **优劣**：优势是统一结算、多跳组合、用户无新授权、适配器可复用（G2、C39）；劣势是在场所费之外多收 1–10bp（G3、D8）、各适配器的单跳滑点检查交给路由器（C38）、能否进生产路由取决于 allowlist（C35、M29–M31），以及 v4 hook 整体的安全争议（M32–M34）。
5. **接受度**：hook 自 2026-04/05 起就在 Uniswap 路由里跑（D2）；最近 16 天 Ethereum 成交 99.6% 是 LitePSM 稳定币兑换（D5），约七成流量来自 Uniswap 自家 Universal Router（D6），实收协议费全历史只有约 2,500 美元（D9）。公告头 1.5 天 Base、Robinhood 笔数明显上升，Ethereum 没变（D4）。外部协议没有公开表态（M36）。
6. **走向**：Uniswap 正把自己定位成“流动性结算层 + 订单流入口”，协议费是对自有订单流使用外部流动性的收费；后续关键在 allowlist / 注册表与执行质量透明度（G6、G7、M43、M44，均为推测）。

## 资料中被修正的地方（gpt-agg.md）

- UniswapX hook：GPT 写“流动性来自 solver”；代码与 README 说明 hook 充当 filler，v4 swapper 是订单对手方（G8）。
- 协议费：GPT 只说“可以接入协议费”；实际是 slot0 protocolFee × 25 直接 take 到 TokenJar，现行 10bp / 3bp / 1bp，LitePSM 不收（C14、D8）。
- 上线时间：GPT 只写“2026 年 10 月宣布”；链上显示 hook 早在 2026-04 就有成交（D2）。
- GPT 的“评分表”（如“简单交易 gas 2.5/5”）没有依据，不采用。
- GPT 列的源码路径 `implementations/Curve/`、`Fluid/` 与实际目录 `StableSwap/`、`StableSwapNG/`、`FluidDexLite/`、`FluidDexT1/` 不符。

## 互相矛盾 / 未解决

- README 说 Slipstream 用 QuoterV2 报价，代码继承 V3 的 revert 报价（C26）。
- 官方“7 个来源、覆盖 >90%”没有清单和口径（M2）。
- gas：只有整笔交易 gas 中位数（D12），没有同口径对比。
- 数据只有上线后约 1.5 天，接受度结论是早期读数。

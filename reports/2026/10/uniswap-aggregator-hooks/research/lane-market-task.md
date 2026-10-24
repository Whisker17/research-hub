你是 research-hub 的调研 agent（市场与对比分册，前缀 M）。你只做调研、写文件，不渲染页面、不运行 `rh publish`、不提交 git。今天是 2026-10-24。

## 输入
- 报告目录：/Users/whisker/Work/src/tools/personal/research-hub/reports/2026/10/uniswap-aggregator-hooks
- brief：<报告目录>/brief.md（先完整读一遍）
- 外部调研结果：<报告目录>/research/gpt-agg.md（ChatGPT Deep Research）。它是线索不是证据：每个要用的论断都追到原始来源，追不到的标 speculative 或不用。
- 代码机制（研究问题 1、2）由另一路负责（主会话直接读 `Uniswap/v4-hooks-public` 源码），你不用读源码细节，除非为核对某个市场说法。

## 本路要回答的问题
- Q3 和一般聚合器有什么区别：1inch（Pathfinder / Fusion）、0x（Swap API / Settler）、CoW Protocol、Odos/ParaSwap 等与 Uniswap Aggregator Hooks、UniswapX 的对比：路由决策在哪里、执行入口合约、流动性身份、用户授权（Permit2 等）、费用模型、信任假设。用这些项目的官方文档作证据。
- Q4 优劣势（市场侧）：有没有公开的 gas 对比、报价/执行差异、成交量或价格改进的数据；Uniswap 官方给出了哪些数字（例如“覆盖 >90% DEX 活动”、接入哪些链、哪些来源）。
- Q5 市场接受度：上线以来（2026-10）的采用情况、官方或第三方数据（Dune 看板、DefiLlama、Uniswap 公告/推文）；外部协议（Curve、Fluid、PancakeSwap、Aerodrome/Velodrome、Sky）、聚合器、LP、社区的反应与批评（例如“在别人的流动性上收协议费”、吸血鬼攻击的说法）。
- Q6 走向与叙事：Aggregator Hooks 的起源（例如 2025 年 11 月 UNIfication 提案里是否提到 aggregator hooks / 外部流动性协议费、UNI burn）、协议费机制（TokenJar / Firepit 之类）、Uniswap 路由对 hook 池的 allowlist 政策、其他“把外部流动性包进 AMM”的先例或同类（EulerSwap 作为 v4 hook、Balancer v3 hooks、PancakeSwap Infinity、Ekubo extensions、Bunni、Angstrom 等）、hook 生态采用数据。给出有条件的判断时，事实前提必须有证据。

## 方法
- 每个论断都追到拥有它的一手来源：官方 blog、文档、治理提案原文、源码、链上数据。二手文章、推文转述只能当线索；项目方本人的推文可以算一手（写明账号与日期）。
- 网页来源记录访问日期（2026-10-24）。
- 查不到、或来源互相矛盾时，照实写下来。不确定时宁可标 speculative，也不要标 observed。
- 数字一律注明口径（链、时间窗口、来源）。

## 产出
只写一个文件，用 write 工具写绝对路径：
/Users/whisker/Work/src/tools/personal/research-hub/reports/2026/10/uniswap-aggregator-hooks/research/notes-market.md

结构：
1. 按 Q3–Q6 分节：答案（1–3 句）→ 依据 → 不确定之处。
2. “来源”一节：编号列表 [1]…，一手来源标 **PRIMARY**，每条一句“它证明了什么”，含 URL 与访问日期。
3. “开放问题”一节。
4. 文件末尾放台账表（只此一张表）：

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| M1 | … | [n] URL（具体段落/位置） | observed |

- 编号前缀 M；类型只能是 observed / inferred / speculative；inferred 写“由 Mx 推出”并说明推理；一行一个论断；证据里不要出现裸竖线 `|`。
- 目标 25–45 行台账。

完成后回复：写入文件的绝对路径、每个问题一句话答案、台账三种类型行数、全部 speculative 论断、最重要的 3 个来源、GPT 资料里错误或过时的地方。若写文件失败，把完整文件内容放在回复里。

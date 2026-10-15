---
template: research
title: 链上期权入门手册：从期权基础、生态现状到 Mantle 的机会
subtitle: 期权让人交易收益的形状，而不只是方向。链上期权的瓶颈在风险承接，不在撮合。Mantle 已有标的和结算币，缺的是承接风险的一层；最可行的起点是全额抵押结构加 RFQ，同时做 RWA 结算适配层。
cols: 4
type: 技术调研 · 入门教程 · 机会评估
audience: 懂 EVM / DeFi（AMM、借贷、永续）的开发者与 Mantle 协议 / 产品研究员，没有系统学过期权
scope: 期权基础；截至 2026-10-16 的链上期权协议、数据与历史；Jeff Yan 访谈与 Hyperliquid HIP-4；World Markets 论文解读与复算；Mantle 能力对照与机会建议（建议不是 Mantle 路线承诺）
evidence: 258 条论断台账（observed 202 / inferred 44 / speculative 12）；Deribit 与 DefiLlama 公共 API；论文数值用 python 全部复算；协议官方文档、合约源码；访问于 2026-10-15 至 10-16
date: 2026-10-16 · v1
---
结论先行：期权交易的是收益的形状。买方付一笔[[权利金]]，换来有上限的亏损和保留的上涨。卖方收权利金，承担跳跃风险（[F1](#F1)、[F2](#F2)）。链上期权近 30 天名义成交约 $5.07B，Derive 一家占 83.7%。Deribit 的持仓量约是 Derive 的 25 倍（[F4](#F4)）。头部场所都已经“链下撮合、链上结算”，所以真正的瓶颈是做市商的对冲渠道和资本成本（[F5](#F5)）。

Jeff Yan 没有宣布 Hyperliquid 做期权。他把 HIP-4 看作 builder 构建期权的一条路径（[F6](#F6)）。World Markets 的论文认为，期权流动性可以用现货、定期融资和反向期权组装出来。它的模型数字都能复算，但关键前提是假设（[F7](#F7)、[F8](#F8)）。Mantle 有 xStocks、稳定币和现货 RFQ，缺期权与永续这一层。建议先做全额抵押结构加 RFQ，并行做 RWA 结算适配层（[F10](#F10)、[F11](#F11)）。

## A 一个公式看懂期权 {sheet meta="到期时"}
```annot
# 到期收益 | 只在到期日这样算
call：[max(S_T − K, 0)]{价格高于 K 才有钱}；put：[max(K − S_T, 0)]{价格低于 K 才有钱}
# 盈亏 = 收益 − 权利金 | 买方最多亏权利金
例：ETH 2500 时买 2500 call，付 [171.35]{30 天、IV 60%}；到期 3000 时赚 [328.65]{500 − 171.35}
# put-call parity | 期权、现货、借款三者互通
[C − P]{同 K、同到期} = [S − PV(K)]{借钱买现货}
> 这个等式是第 P 面板 World Markets 论文的起点。
```

## B 关键数字 {sheet span=2 meta="截至 10-16"}
| 项目 | 数值 |
|---|---|
| 链上期权 30 天名义 / 权利金 | $5.07B / $88.2M |
| Derive 份额（名义 / 权利金） | 83.7% / 91.2% |
| Deribit 持仓量 ÷ Derive | 约 25 倍（10-01） |
| ETH 30 天隐含波动率 DVOL | 52（历史波动约 44） |
| 论文估算的挂单容量 | 90 张的 5.9–11.7 倍（有条件） |
| Mantle 上期权 / 永续成交 | $0 / $0 |
| Mantle 上 xStocks 标的 | 不少于约 100 个 |

## C 五代链上期权 {sheet meta="谁承担风险"}
| 路线 | 代表 | 现状 |
|---|---|---|
| 保险式全额抵押 | Opyn v1、Hegic | no 很小 |
| 金库卖期权 DOV | Ribbon、Thetanuts V3 | no 已关闭或转型 |
| AMM + 对冲 | Lyra v1、Stryke | no 停滞 |
| 永续 / 凸性 | Squeeth、Panoptic | warn 小众 |
| 链下撮合 + 链上结算 | Derive、Paradex、Rysk | ok 主流 |

## D 时间线 {sheet span=2 meta="UTC"}
```timeline v
2020-08 | Opyn ETH put 被攻击 | 行权逻辑重复计数
2021-04 | Ribbon DOV 上线 | 每周卖 call
2023-07 | Ribbon 并入 Aevo | DOV 难以扩张
2024-12 | Panoptic 主网 | 基于 Uniswap LP 的永续期权
2026-05-02 | Hyperliquid HIP-4 | 有界、全额抵押的结果合约
2026-07-24 | Derive 上线 XAUT 期权 | 第一个 RWA 期权（Bybit 06-12 更早）
*2026-10-07 | Derive V3 | ZK 交易所，Ethereum 结算
2026-10 | World Markets 论文 | 可组合期权市场
```

## E Mantle 能力对照 {sheet meta="2026-10"}
| 期权需要 | Mantle |
|---|---|
| 标的 token | ok xStocks |
| 结算稳定币 | ok USDT0 / USDC |
| 公司行动数据 | ok multiplier |
| 带休市状态的价格 | warn 未见部署 |
| 现货深度 | warn 日成交 $1–5M |
| 期权 / RFQ 结算合约 | no 缺 |
| 永续（对冲） | no 缺 |

## F 结论 {sheet span=4}
```callout ok 期权值得做，但 Mantle 应该先补“风险承接”这一层，而不是先建一个期权交易所
- 期权的价值在于把“保护”和“收益”做成可买卖的产品。卖方必须有人承担跳跃风险（F1、F2）。
- 链上期权已经解决撮合，没解决风险承接：成交高度集中，规模只有 Deribit 的零头（F4、F5）。
- World Markets 的思路要求链上已有期权、借贷、现货三种流动性。Mantle 现在只有薄的现货和不收 RWA 的借贷（F8、F10）。
- 建议起点：持仓者的保护 / 收益结构，用 RFQ 让链下做市商报价，链上全额抵押结算；同时做一套 RWA 结算与公司行动适配层（F11，建议）。
```

## G 如何阅读 {depth=1}
```callout info 默认你已知道（本文不解释）
- EVM 合约调用、ERC-20 授权、EIP-712 签名
- AMM 与 LP 的基本原理：LP 提供流动性，承担价格变动
- 超额抵押借贷：抵押率、清算
- 永续合约：保证金、杠杆、funding
- 订单簿的买一、卖一与价差
- 预言机的作用：把链外价格带进合约
```
- **5 分钟**：只看导语和总览 A–F。
- **30 分钟**：再读[前置知识](#panel-I)、[收益形状](#panel-J)、[价格与风险](#panel-K)、[演进](#panel-L)、[格局](#panel-M)、[为什么难](#panel-N)、[Jeff Yan](#panel-O)、[论文机制](#panel-P)、[论文数字](#panel-Q)、[RWA 难点](#panel-R)和[Mantle 机会](#panel-S)。
- **要复核的开发者**：再读[方法与证据](#panel-U)和[复现](#panel-V)。

**贯穿全文的例子**：ETH 现价 $2,500。期限 30 天，隐含波动率 60%，利率取 0。下面的面板依次回答这些问题：

| 角色 | 问题 |
|---|---|
| Alice（持有 1 ETH） | 她想限制下跌，要付多少？她想多拿点收益，要放弃什么？ |
| Bob（做市商） | 他卖给 Alice 一张期权后，怎么对冲？还剩什么风险？ |
| Mantle | 要让 Alice 在 Mantle 上用 xStocks 做同样的事，缺什么？ |

## H 背景动机 {depth=2}
**问题**：链上已有现货、借贷和永续，但期权一直没做大。2026 年 10 月，链上期权 30 天名义成交约 $5.07B [14]。作为对照，截至 2026-10-12 的 30 天窗口里，链上 DEX 现货成交约 $288B [14]。两个数据的窗口不完全相同。

**为什么现在**：
- Jeff Yan 在 Empire 访谈中说，如果从头开始当 builder，他可能会去研究期权 [10][11]。
- World Markets 在 2026 年 10 月发布论文，主张用可组合的流动性做期权 [26]。
- Mantle 正在推进 RWA 和代币化股票：xStocks 已在 Mantle 原生发行，mStocks 计划 11 月上线 [29][36]。

**范围**：期权基础；链上期权的协议、数据与历史；论文解读与复算；Mantle 能力对照与建议。

**非目标**：投资或交易建议；协议合约审计；完整的定价或做市实现；Mantle 正式路线承诺；完整定量仿真。

**已有资料的不足**：外部调研（ChatGPT Deep Research）[41] 的框架合理，但有几处需要修正：
- 没有读到 World Markets 论文。本文已读全文并复算。
- 漏掉了 Hyperliquid HIP-4。
- 把已停滞的 Ithaca、Stryke 当作现行设计，Derive 的架构描述也已过时。
- 把 Mantle 上的 Ondo 资产写成 rUSDY，实际是 USDY 和 mUSD。

完整修正表见[方法与证据](#panel-U)。

## I 前置知识 {depth=2}
```excalidraw q="读懂这篇报告，要先懂哪些概念？按什么顺序学？" read="灰色虚线框是默认已知；蓝框是概念卡；绿框是本文主题。箭头表示先学 → 后学。" takeaway="B-0、B-1 讲期权是什么；B-2、B-3 讲它值多少钱、风险在哪；B-4、B-5 讲怎样组装和怎样抵押。" kind=前置知识地图
{"grid": {"w": 290, "h": 115}, "defaults": {"w": 220, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "perp", "label": "永续合约（已知）", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "lend", "label": "借贷与清算（已知）", "col": 0, "row": 1, "color": "gray", "stroke": "dashed"},
   {"id": "ob", "label": "订单簿（已知）", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 call 与 put", "col": 1, "row": 0, "color": "blue"},
   {"id": "b1", "label": "B-1 合约规格", "col": 1, "row": 1, "color": "blue"},
   {"id": "b5", "label": "B-5 保证金", "col": 1, "row": 2, "color": "blue"},
   {"id": "b2", "label": "B-2 隐含波动率", "col": 2, "row": 0, "color": "blue"},
   {"id": "b3", "label": "B-3 Greeks 与对冲", "col": 2, "row": 1, "color": "blue"},
   {"id": "b4", "label": "B-4 put-call parity", "col": 2, "row": 2, "color": "blue"},
   {"id": "top", "label": "链上期权 → Mantle", "col": 3, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "perp", "to": "b0"}, {"from": "lend", "to": "b5"}, {"from": "ob", "to": "b1", "dashed": true},
   {"from": "b0", "to": "b2"}, {"from": "b0", "to": "b1"}, {"from": "b2", "to": "b3"},
   {"from": "b5", "to": "b4"}, {"from": "b3", "to": "top"}, {"from": "b4", "to": "top"}, {"from": "b2", "to": "top", "dashed": true}
 ]}
```

```prereq B-0 l1 3min
# call 与 put（看涨期权与看跌期权）
是什么: [[call]] 让买方有权按[[执行价]] K 买入标的，[[put]] 让买方有权按 K 卖出。买方付[[权利金]]，卖方收钱并承担义务 [1]。
为什么需要: 本文所有结构和协议都由这两种合约拼成。
例子: K = 2500 的 call，到期 ETH = 3000 时付 500；到期 2400 时付 0。
误解: 误解：买 put 是“做空期权”。事实：买 put 是期权多头，用来看跌或保护现货。
深入: [1] OIC《Options Basics》
```

```prereq B-1 l1 3min
# 合约规格（contract specification）
是什么: 一张期权要写清标的、执行价、到期时刻、行权方式、结算方式、乘数和结算价规则。[[欧式期权]]只能在到期日行权，但到期前可以卖出平仓 [1][4]。
为什么需要: 链上期权的事故多数出在结算价路径（[[fixing]]），RWA 还要加上公司行动规则。
例子: Deribit ETH 期权：欧式，乘数 1，08:00 UTC 到期，结算价取 07:30–08:00 指数的 30 分钟 [[TWAP]] [4]。
误解: 误解：同一标的、同一执行价就是同一个产品。事实：结算价来源不同，就是不同的风险。
深入: [4] Deribit《Linear USDC Options》
```

```prereq B-2 l1 4min
# 隐含波动率（IV）与 Black-Scholes
是什么: [[Black-Scholes]] 用现价、执行价、期限、利率和波动率算出欧式期权价格 [8]。把市场价代入、反解出的波动率叫[[隐含波动率]] [2]。
为什么需要: 做市商报的其实是 IV。权利金高低，主要由 IV 和剩余时间决定。
例子: ETH 2500、30 天、IV 60%：ATM call = $171.35；IV 改成 52%，价格降到 $148.55。
误解: 误解：IV 是对未来的预测。事实：IV 是由报价反推的参数，2026-10-15 ETH 的 IV 约 52，近期实际波动约 44 [5]。
深入: [2] OIC《Volatility & the Greeks》
```

```prereq B-3 l1 4min
# Greeks 与 delta 对冲
是什么: [[delta]] 衡量标的涨 $1 时期权价格变多少。[[gamma]] 衡量 delta 变多快。[[theta]] 是每天流失的时间价值。[[vega]] 衡量 IV 变 1 点时价格变多少 [2]。
为什么需要: 做市商卖出期权后，用现货抵消 delta。剩下的 gamma 风险决定他要多少资本。
例子: 例子中的 ATM call：delta 0.534，gamma 0.000924，theta −$2.85/天，vega $2.85/IV 点。
误解: 误解：delta 中性就没有风险。事实：价格跳 10%，对冲后的卖方仍亏约 $27–30 [K 面板]。
深入: [2] OIC《Volatility & the Greeks》
```

```prereq B-4 l1 3min
# put-call parity（看涨看跌平价）
是什么: 同一标的、同一执行价、同一到期日的欧式期权满足 C − P = S − PV(K) [8]。call、put、现货和借款可以互相合成。
为什么需要: 这是 World Markets 论文的起点，也是“covered call 等于卖 put”的原因。
例子: 例子中 C2750 = 81.76，P2750 = 331.76，相减得 −250 = 2500 − 2750。
误解: 误解：现货加借贷就能合成期权。事实：还缺一个[[凸性]]来源，即反向期权或同样收益的债权 [26]。
深入: [8] Stoll (1969)
```

```prereq B-5 3min
# 保证金：全额抵押与组合保证金
是什么: [[全额抵押]]要求卖方锁住最大可能赔付。[[组合保证金]]在一组价格和波动率情景下重估整个账户，按最坏亏损收保证金 [6][7]。
为什么需要: 全额抵押简单安全，但资本成本高。组合保证金省资本，但依赖模型和清算。
例子: 2500/2750 call 价差最多赔 $250，锁 $250 就够；裸卖 call 的最大赔付没有上限。
误解: 误解：组合保证金消除了风险。事实：它承认头寸之间的对冲，但仍依赖模型和清算。
深入: [7] Cboe《Portfolio Margining》
```

## J 期权入门一：收益形状与常见结构 {depth=2}
期权和现货、永续的差别不在杠杆，而在收益形状。现货与永续是直线：涨 $1 赚 $1。期权是折线：一边封顶，一边放开。图 1 用例子的参数画出到期盈亏。

```svg
@@FIG1@@
```

图 1 说明三件事：
- 买 call 最多亏 $171.35，上涨不封顶。盈亏平衡点是 2671.35，不是 2500。
- 买 put 是期权多头，但在下跌时赚钱。
- 卖 call 只能赚 $171.35，上涨亏损没有上限 [1]。

**Alice 的四个选择**：她持有 1 ETH，可以用期权改造自己的收益（图 2）。

```svg
@@FIG2@@
```

| 结构 | 最大亏损 | 最大收益 | 用途 |
|---|---|---|---|
| Protective put（现货 + 买 P2500） | $171.35 | 不封顶 | 买保险 |
| Covered call（现货 − C2750） | $2,418.24 | $331.76 | 用上涨换收入 |
| Collar（现货 + P2250 − C2750） | $235.53 | $264.47 | 低成本保险 |
| Bull call spread 2500/2750 | $89.59 | $160.41 | 便宜地看涨 |

表中数字是按 OIC 公式算出的到期值 [3]。

```finding F1 high
# 期权交易的是收益形状；covered call 的风险与卖 put 相同，权利金不等于保本
结论: Covered call 的每个到期价位都与“卖出同执行价 put”盈亏相同。Alice 卖 C2750 收 $81.76，ETH 跌到 1500 时仍亏 $918.24。Protective put 的盈亏与买同执行价 call 相同。
证据: [observed] OIC 定义与公式 [1][3]（B1、B4、B45、B46），OIC 称两者风险曲线“identical”（B43）。[observed] 例子价格由 python 计算（B34、B35）。[inferred] 盈亏平衡与等价关系（B44、B50）。
影响: 产品页面应展示到期收益范围和最大亏损，不要只展示“年化收益”。卖期权的金库本质上是在卖保险。
```

## K 期权入门二：价格、隐含波动率与 Greeks {depth=2}
到期前，期权价格 = [[内在价值]] + [[时间价值]]。图 3 是 K = 2500 的 call 在不同剩余期限下的价值。

```svg
@@FIG3@@
```

时间越长，曲线越高、越平滑。这部分额外价值由 IV 和剩余时间决定，每天按 theta 流失。

**IV 不是一个数，而是一张曲面**。2026-10-15 Deribit 的 ETH 期权报价 [5]：

| 合约 | IV | 说明 |
|---|---|---|
| 11-27 到期 2000 put | 56.4% | 下行保护更贵（skew） |
| 11-27 到期 2400 call | 49.7% | 接近平值 |
| 11-27 到期 3000 call | 52.5% | 两翼高于中间（smile） |
| 2400 call：10-30 / 11-27 / 12-25 | 46.5% / 49.7% / 50.6% | 期限越长越高 |

同一时点，ETH 的 30 天 IV 指数 [[DVOL]] 约 52，近期实际波动约 44 [5]。期权卖方多收的这部分，补偿的是跳跃风险。

**Bob 怎么对冲**：Bob 卖给 Alice 1 张 ATM call，收 $171.35。他买 0.534 ETH 抵消 delta。之后价格瞬间跳动：

| 情景 | call 新价 | Bob 期权盈亏 | 现货盈亏 | 合计 |
|---|---|---|---|---|
| ETH → 2750 | 331.76 | −160.41 | +133.57 | **−26.84** |
| ETH → 2250 | 67.29 | +104.06 | −133.57 | **−29.51** |

两个方向都亏，这就是负 gamma。近似公式是 −½Γ(ΔS)² = −$28.88。Bob 每天收 theta 约 $2.85，一次 10% 跳动吃掉约 10 天的 theta。

```python title="Black-Scholes 与 Greeks（research/scripts/bs.py，节选）"
from math import log, sqrt, exp, erf, pi
N = lambda x: 0.5 * (1 + erf(x / sqrt(2)))
n = lambda x: exp(-0.5 * x * x) / sqrt(2 * pi)

def bs(S, K, T, r, sigma, kind="call"):
    sqT = sqrt(T)
    d1 = (log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * sqT)
    d2 = d1 - sigma * sqT
    df = exp(-r * T)
    if kind == "call":
        price, delta = S * N(d1) - K * df * N(d2), N(d1)
    else:
        price, delta = K * df * N(-d2) - S * N(-d1), N(d1) - 1
    gamma = n(d1) / (S * sigma * sqT)
    vega = S * n(d1) * sqT / 100          # 每 1 个 IV 点
    theta = -S * n(d1) * sigma / (2 * sqT) / 365  # r=0 时每天
    return price, delta, gamma, vega, theta

print([round(x, 4) for x in bs(2500, 2500, 30/365, 0, 0.60)])
# [171.3485, 0.5343, 0.0009, 2.8488, -2.8488]
```

```finding F2 high
# 卖期权的核心风险是 gamma：delta 对冲后，价格跳 10% 仍亏 $27–30
结论: 例子中 Bob 对冲后，ETH 跳 ±10% 分别亏 $26.84 和 $29.51，约等于 10 天的 theta。在短时间 Δt 内、IV 不变时，Bob 对冲后的盈亏 ≈ ½ΓS²[σ_IV²Δt − (ΔS/S)²]，其中 Γ 是买方持有的正 gamma。实际方差大于隐含方差时，卖方亏钱。
证据: [observed] python 计算（B34、B36）。[inferred] theta 与 gamma 的关系、盈亏分解（B32、B33、B37、B38）。[observed] Deribit 2026-10-15 的 IV、smile 与 DVOL（B22、B23、B26、B29）。[inferred] Deribit 报价可用 Black-76 复现（B20）。
影响: 谁承担 gamma，谁就需要资本和对冲渠道。这决定了链上期权的瓶颈（F5）。
```

## L 链上期权怎么演进到今天 {depth=2}
链上期权已经试了五代路线。每一代的差别，在于谁承担卖方风险、怎样定价。

| 代 | 路线 | 谁承担风险 | 踩过的坑 |
|---|---|---|---|
| 1 | 保险式全额抵押（Opyn v1、Hegic） | 单个卖方或 LP 池 | Opyn 2020 年行权逻辑漏洞 [18]；Hegic LP 长期亏损（二手研究） |
| 2 | 金库卖期权（[[DOV]]：Ribbon、Thetanuts V3） | 存款用户 | 部分金库累计收益为负；池化风险，无法扩张 [20][25] |
| 3 | 期权 AMM + 对冲（Lyra v1、Dopex / Stryke） | LP | 静态 IV 让 LP 持续亏损 [19] |
| 4 | 永续 / 凸性产品（Squeeth、Panoptic） | 做市方与 LP | Squeeth 2024-11 关停 [9] |
| 5 | 链下撮合 + 链上结算（Derive、Paradex、Rysk） | 专业做市商 | 仍在验证 |

```finding F3 high
# 前四代的问题都落在“卖方”身上：结算价被攻击、LP 被逆向选择、金库无法扩张
结论: Opyn（2020）、Ribbon 遗留金库（2025-12，约 $2.7M）、Typus（2025-10，约 $3.44M）的事故都出在结算或预言机路径。Lyra 自述旧 AMM 用静态波动率，LP 持续亏损。Rysk 官方总结：DOV 证明了需求，但因池化风险和僵化设计无法扩张。
证据: [observed] Opyn post-mortem [18]（E35），Ribbon 与 Typus 事故（E38、E60，媒体报道），Lyra 原文 [19]（E43），Rysk 文档 [20]（E41），Ribbon 金库收益（E39），Hegic LP（E42）。[inferred] 结算价是最常出事的环节（E63）。[speculative] DOV 收益被拍卖中的做市商以低价拿走（E40），没有一手量化证据。
影响: 新协议的第一优先级是结算价规则与预言机权限。卖方收益要按风险定价，不能靠补贴。
```

## M 现在的格局与数据 {depth=2}
**成交高度集中**（DefiLlama，截至 2026-10-16 的 30 天）[14]：

| 协议 | 30 天名义 | 份额 | 架构 |
|---|---|---|---|
| Derive（V2 + V3） | $4,245.7M | 83.7% | 订单簿 + RFQ + 组合保证金 |
| Paradex | $484.0M | 9.5% | 订单簿 + Paradigm RFQ |
| Rysk V12（HyperEVM） | $145.7M | 2.9% | 逐笔 RFQ，全额抵押 |
| CallPut（Base） | $97.8M | 1.9% | 未核实 |
| Aevo | $66.6M | 1.3% | 订单簿 + 组合保证金 |
| 全市场 | $5,074.1M | 100% | |

按权利金算，Derive 占 91.2%。Stryke、Kyan 近 30 天成交为 0，Ithaca 只有 $1,999 权利金 [14]。

**与中心化市场比**：2026-10-01，Derive 期权持仓量约 $1.39B，占五家合计 $44.7B 的 3.1%；Deribit 占 78.2% [15]。学术研究估计 DEX 只占期权成交的约 1% [17]。Coinbase 于 2025 年以约 $2.9B 收购 Deribit [16]。

**主要协议怎么设计**：

| 协议 | 保证金 | 结算 | 备注 |
|---|---|---|---|
| Derive V3 | 标准或情景式组合保证金 | 欧式，08:00 UTC；美股标的可设纽约 16:00 | 2026-10-07 起 ZK 交易所 + Ethereum 结算 [21] |
| Paradex | 组合保证金 | 欧式，USDC 现金，30 分钟 TWAP | 2026-04 公测 [23] |
| Rysk V12 | 逐笔全额抵押 | 欧式，实物交割 | 到期日与 Deribit 对齐 [20] |
| Thetanuts V4 | 全额抵押 | 预言机结算 | 链下签名挂单，链上 `fillOrder` [24] |

```finding F4 high
# 链上期权规模小、集中；Derive 的增长主要来自单笔变大
结论: 30 天名义约 $5.07B、权利金约 $88.2M，Derive 占 83.7% / 91.2%。Deribit 的持仓量约是 Derive 的 25 倍。Derive Q3 名义成交环比 +89.6%，但成交笔数只增加 6.2%，平均单笔从 $47K 升到 $84K。
证据: [observed] DefiLlama API [14]（E21、E22、E25、E26），Alea 季报 [15]（E27、E28、E29，作者维护 Derive 的数据室，有利益关系），Deribit 统计（E30），学术研究 [17]（E34）。[inferred] 份额计算（E23、E24）。
影响: 链上期权目前是机构化的小市场。新场所要回答的不是“能不能撮合”，而是“谁来做市、谁来买”。
```

## N 为什么难：风险最后落在谁身上 {depth=2}
撮合已经不是难点。头部场所都用链下撮合，再把结果结算到链上 [21][23]。难点在于：用户买走期权后，卖方的风险由谁承担、在哪里对冲、占用多少资本。

```excalidraw q="用户买了一张期权，风险最后流向哪里？成本在哪一步加进价格？" read="蓝框是链上部分；灰色虚线框是链下；红框是成本来源。" takeaway="链上合约只负责锁抵押和结算。价格里的大头来自做市商的对冲渠道和资本占用。" kind=风险流向图
{"grid": {"w": 340, "h": 120}, "defaults": {"w": 200, "h": 60, "fontSize": 17},
 "nodes": [
   {"id": "u", "label": "用户（Alice）", "col": 0, "row": 1, "color": "blue"},
   {"id": "c", "label": "链上结算合约", "col": 1, "row": 1, "color": "blue"},
   {"id": "m", "label": "做市商（Bob）", "col": 2, "row": 1, "color": "blue"},
   {"id": "h", "label": "对冲场所（CEX / 永续）", "col": 3, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "k", "label": "资本 / 保证金", "col": 3, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "x1", "label": "对冲成本、跳跃风险", "col": 2, "row": 0, "color": "red"},
   {"id": "x2", "label": "抵押资金成本", "col": 2, "row": 2, "color": "red"}
 ],
 "edges": [
   {"from": "u", "to": "c", "label": "权利金"}, {"from": "c", "to": "m", "label": "锁抵押"},
   {"from": "m", "to": "h", "label": "delta 对冲"}, {"from": "m", "to": "k", "label": "占用"},
   {"from": "x1", "to": "m", "dashed": true}, {"from": "x2", "to": "m", "dashed": true}
 ]}
```

一笔 RFQ 期权交易的典型流程如下，以 Derive 与 Rysk 的文档为准，简化为通用步骤 [20][21]。

```uml q="一笔 RFQ 期权交易怎么从询价走到到期结算？" read="源自 Derive RFQ 与 Rysk V12 文档，已简化。高亮部分在一笔链上交易里原子执行。" takeaway="链下竞价，链上只验证签名、收权利金、锁抵押；到期按预先写好的结算价规则赔付。"
sequenceDiagram
  autonumber
  participant A as Alice
  participant Q as RFQ 服务
  participant M as 做市商们
  participant C as 结算合约
  participant O as 预言机
  A->>Q: 询价（标的、K、到期、数量）
  Q->>M: 广播询价
  M-->>Q: 签名报价（EIP-712，带有效期）
  Q-->>A: 最优报价
  A->>C: 提交报价 + 自己的签名
  rect rgb(234, 241, 251)
    C->>C: 验签、检查有效期与 nonce
    C->>C: 收权利金、锁卖方抵押、记头寸
  end
  Note over C,O: 到期
  O-->>C: 结算价（例如 30 分钟 TWAP）
  C->>A: ITM 时赔付
  C->>M: 释放剩余抵押
```

全额抵押的代价直接进价格。Thetanuts 的文档写明：做市商报价 = 交易所 bid/ask ± 抵押资金成本，抵押年化 USDC 7%、WETH 4%、cbBTC 1% [24]。

```finding F5 high
# 链上期权的瓶颈在风险承接，不在撮合：头部场所都已“链下撮合、链上结算”
结论: Derive V3 用 ZK 交易所撮合、结算到 Ethereum；Paradex、Rysk、Thetanuts 都用链下报价、链上执行。做市商的成本来自对冲渠道和资本占用。全额抵押把资金成本直接加进报价，组合保证金与永续对冲是降低成本的主要路径。
证据: [observed] Derive V3 与 RFQ 文档 [21]（E45、E46、E56），Rysk [20]（E52），Thetanuts 定价方法 [24]（E53、E55）。[inferred] 头部场所都是链下撮合（E64），成本结构（E62），瓶颈判断（S4）。
影响: 一条链想发展期权，先问三件事：做市商在哪里对冲？抵押资本从哪里来？结算价谁来给？
```

## O Jeff Yan 与 Hyperliquid HIP-4 {depth=2}
节目是 Blockworks Empire《Jeff Yan On Hyperliquid's Plan To Bring All Finance Onchain》，2026-10-07 发布。11:46 一章标题是“Better Trading Through Fees And Options” [10]。

**他说了什么**（按可信度排序）：
1. 约 04:30（机器转写原话）：perps 并不比期权好，两者高度互补（原话 “complementary”）。HIP-4 是“期权或类期权收益曲线可以搭建并做到有用规模”的原语 [10]。
2. builder 问答（中文媒体转述，时间戳未核实）：如果不做基础设施，他此刻可能研究期权；HIP-4 是构建期权协议的清晰路径，可以继承现货、订单簿和组合保证金，并用 perps 对冲 delta；加密里还没有期权或凸性产品达到“escape velocity” [11]。

**HIP-4 是什么**：[[HIP-4]] outcome markets 是全额抵押、在固定区间结算的合约。官方文档说它适用于预测市场和“bounded options-like instruments”，没有杠杆，也没有清算 [12]。首个市场是每日 06:00 UTC 按 BTC mark price 结算的二元合约。2026-05-02 上主网 [12]。

```finding F6 high
# Jeff Yan 没有宣布 Hyperliquid 做期权；他把期权留给 builder，Hyperliquid 只提供原语
结论: 访谈中他把期权放在“第三方 builder 可以在 HIP-4 上做的方向”。Hyperliquid 的官方文档和公告里没有原生普通期权产品或路线。可用的原语是 HIP-4、组合保证金（2025-12 上线）和 HIP-3 永续。
证据: [observed] 节目页与机器转写 [10]（E1–E4），媒体转述 [11]（E5–E7），HIP-4 文档 [12]（E10–E14），组合保证金 [13]（E16）。[inferred] 官方没有普通期权路线（E18）。[speculative] builder 问答位于 11:46 章节（E8）；“Hyperliquid 将上线期权”的报道是误读（E9）。
影响: Hyperliquid 的打法是“先做通用原语，期权留给生态”。这对 Mantle 有参考价值（见 S 面板）。
```

## P World Markets 论文：机制 {depth=2}
论文是 World Markets Research 的《The Economics of Composable Options Markets》（2026-10，12 页）[26]。论文主张：一张期权的流动性，不必只来自它自己的订单簿。

```excalidraw q="交易所怎样用现货、借款和 put 合成一张 call，并和原生 call 比价？" read="蓝框是三条可执行的腿；绿框是交给用户的 call；黄框是约束。数字是论文 §3 的假设报价。" takeaway="合成路径的价格 = 三条腿价格之和，深度 = 三条腿中最小的那条。缺任何一条腿，路径就不存在。" kind=合成路由示意
{"grid": {"w": 350, "h": 115}, "defaults": {"w": 210, "h": 60, "fontSize": 16},
 "nodes": [
   {"id": "s", "label": "买现货 100.20 × 150", "col": 0, "row": 0, "color": "blue"},
   {"id": "p", "label": "买 put 4.00 × 80", "col": 0, "row": 1, "color": "blue"},
   {"id": "b", "label": "借款到期还 K × 60", "col": 0, "row": 2, "color": "blue"},
   {"id": "syn", "label": "合成 call ask 4.40 × 60", "col": 1, "row": 1, "color": "blue"},
   {"id": "nat", "label": "原生 call ask 4.80 × 40", "col": 1, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "out", "label": "用户拿到 call × 100", "col": 2, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "lim", "label": "深度 = min(150, 80, 60)", "col": 2, "row": 0, "color": "yellow"}
 ],
 "edges": [
   {"from": "s", "to": "syn"}, {"from": "p", "to": "syn"}, {"from": "b", "to": "syn"},
   {"from": "syn", "to": "out", "label": "先用便宜的"}, {"from": "nat", "to": "out"},
   {"from": "lim", "to": "syn", "dashed": true}
 ]}
```

**论证分四步**：
1. **静态复制**：由 parity，C = S + P − PV(K)。
   买现货和同 K 的 put，用借款支付 PV(K)，到期还 K。
   合成价格 = 三条腿价格之和，深度 = 最小的那条腿 [26]。
2. **凸性来源**：现货和普通借贷只提供“现货 + 融资”两条腿。
   还要一张反向期权，或一笔到期结算的无追索贷款。
   到期时，这笔贷款的出借人收到 K − max(K − S_T, 0)。
3. **动态复制 + 组合保证金**：没有静态路径时，做市商卖出客户要的 call。
   他再买一张执行价更高的 call，只用现货对冲剩余 delta。
   统一账本把定期出借债权按 98% 计入保证金 [26][27]。
4. **估算**：假设能买到对冲期权，按 10 月数据可挂出 532–1,052 张。
   这是 Derive V2 历史卖一档 90 张的 5.9–11.7 倍 [26]。

论文的资本容量公式是 $Q \le \min(H/|\Delta|,\ C_e/m,\ N_R)$：对冲额度、资本、剩余风险上限，取最紧的一个 [26]。

```finding F7 high
# 论文的核心观点成立：期权流动性可以由现货、定期融资和反向期权组装，组合保证金让做市商只为剩余风险出资本
结论: 静态合成受“最稀缺一腿”约束。做市商用 call 价差代替裸卖 call 后，需要的现货对冲从约 0.5 ETH/张降到 0.02–0.11 ETH/张。World 的文档确实写明出借债权按 98% 计入可用保证金。
证据: [observed] 论文原文 [26]（W2–W10），World 文档 [27]（W41、W42），净 delta 与张数 python 复算一致（W27、W28）。[inferred] 3.18 倍与 2.00 倍的算式（W11、W12）。
影响: 对一条链来说，期权、借贷、现货必须在同一保证金账本里，并能原子成交多条腿。分散在不同协议里的“可组合”不够（W62）。
```

## Q 论文数字：哪些是实测，哪些是假设 {depth=2}
| 数字 | 含义 | 类别 | 我们的核查 |
|---|---|---|---|
| DEX 30 天 $246.6B | 现货成交 | 实测 | warn 同窗口现值约 $288.0B |
| Aave $12.15B、Morpho $5.78B | 在贷余额 | 实测 | ok 与 DefiLlama 一致 |
| Derive OI $1.655B | 持仓量 | 实测 | ok 精确一致 |
| 90 张 / $67.20 | Derive V2 卖一档 | 实测（9-24） | warn 只是最优一档，V2 已迁移 |
| 532–1,052 张、5.9–11.7× | 挂单容量 | 模型 | ok 复算一致 |
| 每张准备金 $35.59 / $17.49 / $6.88 | 压力亏损 | 模型 | ok 复算一致 |
| 3.18×、2.00× | 资本容量 | 模型 | ok 复算一致 |
| $106.4M / $53.2M 每 $1B 需求 | 新增成交 | 假设驱动 | warn $1M 新 bid、θ=50% 是假设 |
| Table 7 资本占用 | Derive vs World | 项目方提供 | no “provisional supplied estimates” |

python 复算表明，Table 4b 的最坏情景是现货跌 20%、IV 75%、剩余 7 天，三种配置的总准备金都约 $19k [V 面板]。

```finding F8 high
# 论文的模型数字都能复算，但结论取决于未经验证的前提，基准也已过时
结论: 最关键的前提是“能买到等量对冲期权”。例如 $25 配置需要 1,052 张可成交对冲 call。这等于把“缺期权流动性”的问题换到了对冲那条腿。基准是已迁移的 Derive V2 的最优一档挂单，不是 V3 或 RFQ 深度。World 的期权仍是“Coming soon”。我们没找到针对论文的社区讨论。
证据: [observed] 复算（W27、W28、W30、W33），论文自承假设（W36、W37），World 文档（W45），Derive V3 迁移（W20），DEX 数字差异与借贷余额核对（S1、S2），社区讨论检索（W60）。[inferred] 前提与基准的问题（S3、W39、W40），摘要措辞强于正文（W38）。
影响: 评估类似提案时，要求对方实测四个量：对冲期权量、可负担的现货量、融资额度、剩余风险上限。不要只看汇总比值，例如“现货成交是期权的 50.5 倍”。
```

## R RWA 期权的难点：时钟、单位、权限 {depth=2}
把标的从 ETH 换成代币化股票，合约层会多出三类问题 [29][30][31][33]：

| 问题 | xStocks 的现状 | 期权要写清的规则 |
|---|---|---|
| **时钟** | 链上 24/7；向发行方申赎 24/5；xChange 休市时单笔上限 $0 | 结算价取哪个时钟；休市时能否开新仓 |
| **价格** | Chainlink v10 的 `price` 周末不更新，`tokenizedPrice` 继续更新 | mark 与结算价用哪个字段 |
| **单位** | 分红、拆股、管理费都改 multiplier；EVM 上 `balanceOf` 自动变化 | K 和数量按什么调整；用不 rebase 的 ERC-4626 封装 |
| **激活时点** | 三个来源说法不同：00:30、00:00，实测 23:55–04:00 UTC | 激活前后暂停多久 |
| **权限** | pauser 可暂停全部转账；制裁名单拦截 from / to / spender | 抵押品被冻结时怎样结算 |
| **资格** | 直接申赎需 KYC、最低 $5,000，不面向美国 | 做市商能否套利基差 |

```finding F9 high
# RWA 期权的工程重点是“时钟、单位、权限”，必须写进合约规格，不能留给运营处理
结论: xStocks 链上二级市场 24/7 交易，向发行方申购和赎回只在 24/5 进行；公司行动通过 multiplier 生效，激活时点有三种说法；发行方合约可以暂停全部转账。锁在期权合约里的抵押品可能无法交割。已有的组件可以直接用：ERC-4626 封装、Chainlink v10 的 `marketStatus` 与 multiplier 字段。
证据: [observed] xStocks 文档与 API [29][30]（X32、X33、X35、X38、X39、X44），合约源码 [31]（X36、X37、X41），Chainlink v10 [33]（X24、X25、X34、X40）。[inferred] 冻结影响交割（X43），三项规则（S7）。
影响: 先做一个共享的“RWA 结算适配层”，统一读取 multiplier、休市状态与暂停窗口。各期权应用都可以复用它。
```

## S Mantle：已有什么、缺什么、先做什么 {depth=2}
以下方向与优先级都是调研建议，不是 Mantle 现网能力，也不是路线承诺。

**已有的**：
- xStocks 于 2026-04-10 在 Mantle 原生发行，2026-05-07 接入发行方的 Atomic RFQ（xChange）。API 显示不少于约 100 个标的有 Mantle 部署 [30][32]。
- Aave V3 于 2026-02-11 在 Mantle 上线，供应约 $330M [35]。
- mStocks（Bybit × Mantle）计划 2026-11 上线，目前只有媒体和转载来源 [36]。

**缺的**：
- DefiLlama 在 Mantle 上只列出 Stryke CLAMM 一个期权协议，成交为 $0；永续成交为 $0 [14]。
- Rysk、Thetanuts 都没有部署在 Mantle [20][24]。
- Aave Mantle 不接受 xStocks 或 mETH 作抵押，也不能借出 xStocks 做空对冲 [35]。
- Mantle 官方预言机文档里没有 Chainlink；没有查到股票 Data Streams 已在 Mantle 开通 [33][34]。

```excalidraw q="期权需要哪几层能力？Mantle 每一层的现状如何？" read="自下而上是期权依赖的能力层。绿色 = 有，黄色 = 部分有，红色 = 缺。" takeaway="Mantle 缺的集中在中间两层：价格与风险承接。最上层的需求还没被验证。" kind=能力分层
{"grid": {"w": 560, "h": 78}, "defaults": {"w": 520, "h": 58, "fontSize": 17},
 "nodes": [
   {"id": "l6", "label": "需求：谁买保护、谁卖收益（未验证）", "col": 0, "row": 0, "color": "yellow"},
   {"id": "l5", "label": "风险承接：期权协议、永续、可做空借贷（缺）", "col": 0, "row": 1, "color": "red"},
   {"id": "l4", "label": "结算合约：RFQ、锁抵押、到期赔付（缺）", "col": 0, "row": 2, "color": "red"},
   {"id": "l3", "label": "价格：带休市状态的股票价格（部分有）", "col": 0, "row": 3, "color": "yellow"},
   {"id": "l2", "label": "流动性：现货 RFQ 有，DEX 很薄（部分有）", "col": 0, "row": 4, "color": "yellow"},
   {"id": "l1", "label": "资产：xStocks、USDT0 / USDC、multiplier（有）", "col": 0, "row": 5, "color": "green"}
 ],
 "edges": []}
```

**候选方向**：

| 方向 | Mantle 现状 | 主要风险 | 建议 |
|---|---|---|---|
| a. 持仓者保护 / 收益结构 + RFQ（全额抵押） | 部分有 | 美股休市时做市商无法对冲；需求未验证 | ok 先做 |
| b. RWA 结算与公司行动适配层 | 部分有 | 各发行方规则不统一 | ok 与 a 并行 |
| d. 接入外部期权市场做分发 | 部分有 | 外部市场没有 xStocks 期权 | warn 用来测需求 |
| e. mETH / USDY 结构化产品 | 部分有 | 赎回延迟长、Reg S 限制 | warn 其次 |
| c. 复制型组合保证金交易所 | 缺 | 现货、做空、永续三项都缺 | no 后置 |

方向 a 的结算合约只需要验证报价、锁住最大赔付、按规则结算。下面是一个接口草图：

```solidity title="RFQ 期权结算合约 · 草图（不存在的代码）"
struct Quote {
    address maker;          // 做市商（卖方）
    address underlying;     // 例如 xStock 的 ERC-4626 封装
    uint256 strike;         // 以 USDC 计
    uint64  expiry;         // 结算时刻（UTC）
    bool    isCall;
    uint256 amount;         // 封装份额，不随 multiplier 变化
    uint256 premium;        // Alice 付给 maker
    bytes32 fixingRuleId;   // 结算价规则：来源、窗口、休市处理
    uint64  validUntil;     // 报价有效期
    uint256 nonce;
}
// fill(): 验 EIP-712 签名与 nonce → 收 premium → 锁 maker 的最大赔付
// settle(): 读 fixingRuleId 指定的价格 → ITM 时赔付 → 释放剩余抵押
// 休市或发行方暂停时：fill 拒绝；settle 按 fixingRuleId 的回退规则顺延
```

```finding F10 high
# Mantle 已有“标的 + 结算币 + 现货 RFQ”，缺的是承接期权风险的一层
结论: xStocks 原生发行在 Mantle，并接入了发行方 RFQ；稳定币与 Aave 都在。但 Mantle 上期权与永续成交都是 $0，主流 RFQ 期权协议都没部署，借贷不收 RWA 也不能借出 xStocks 做空。按 parity 的视角，Mantle 只有现货与融资两条腿，没有凸性来源。
证据: [observed] xStocks（X1–X5），Aave（X16、X17），DefiLlama（X21、X29），Rysk 与 Thetanuts（X30、X31），预言机文档（X28）。[inferred] 能力判断（X51、S5）。[speculative] Mantle 上没有开通股票 Data Streams（X27）。
影响: World 式“组装流动性”在 Mantle 上暂时没有原料。先补结算合约与价格规则，再谈组合保证金。
```

```finding F11 medium
# 建议：先做全额抵押的保护 / 收益结构加 RFQ，并行做 RWA 结算适配层；组合保证金交易所后置
结论: 全额抵押、最大赔付有界的结构（covered call、cash-secured put、价差、collar）不需要组合保证金，也不依赖链上现货深度。做市商在链下定价和对冲，链上只验证签名、锁抵押、结算。适配层是它的前置条件，能被多个应用复用。CEX 端已有 xStocks 结构化产品（Bybit Dual Asset）和 RWA 期权（XAUT、SPY、QQQ），说明有人在验证需求。
证据: [inferred] 方向 a 与 b 的理由（X52、X53、S6），方向 c 后置（X54），方向 e 的限制（X56）。[observed] CEX 先例（X48、X49）。[speculative] 优先级排序（X55）；参照 Hyperliquid“先做原语、期权留给 builder”的路线（S8）；链上还没有有规模的代币化个股期权（X50）。
影响: 第一步不是写合约，而是访谈两类人。一类是 xStocks 持有者：愿不愿意付保护费？另一类是期权做市商：休市时怎样对冲、报价价差要多宽？
```

## T 局限与开放问题 {depth=2}
**本文的局限**：
- Jeff Yan 关于期权的长段话只有中文媒体转述，11:46 章节没有逐字稿。
- Mantle 用户的期权需求、做市商意愿都没有数据。F11 的优先级排序是未经验证的建议，台账类型为 speculative（X55）。
- 链上期权的买卖方向结构（零售是否以卖方为主）没有统计。
- 没有审计任何协议合约，也没有在 Mantle 上读取 xStocks 合约的 `feePerPeriod`。
- 子 agent 的运行环境没有 shell，数字由主会话用 python 复核。网页来源多数在 2026-10-16 访问，数据会变。

**开放问题**：
1. DefiLlama 同窗口的 DEX 现值比论文输入高约 17%，原因是什么？
2. Chainlink 股票 Data Streams 是否会在 Mantle 开通？mStocks 的发行结构、权限与价格方案是什么？
3. Derive V3 美股标的期权何时上线？上线后结算时钟怎么处理？
4. World Markets V2 +Options 的上线时间与实际资本占用？
5. Mantle 上 xStocks 与标的股价之间的基差有多大？可以用 Chainlink v10 的 `price` 与 `tokenizedPrice` 测量。

## U 方法与证据 {depth=3}
**方法**：四路并行调研，各自写分册和台账，再合并：
- **B 路**：期权基础，Deribit 公共 API 实时数据
- **E 路**：Jeff Yan、HIP-4、链上期权演进、协议与数据
- **W 路**：World Markets 论文逐节解读、数字分级、核查
- **X 路**：Mantle 资产、基础设施、RWA 难点与候选方向

S 前缀是主会话的补充核查与综合。子 agent 没有 shell，数值靠手算。主会话用 python 重算了全部数字。复算修正了一处错误推断：W 路以为 Table 4b 含摩擦和融资成本，实际是纯盯市压力亏损。

**资料中被修正的地方**：

| 原说法 | 修正 |
|---|---|
| GPT：没取得 Drive 文章 | 已读全文并复算（W1） |
| GPT：未提 HIP-4 | Hyperliquid 的类期权就是 HIP-4（E10） |
| GPT：Derive 订单簿由运营实体管理 | V3 已换成 ZK 交易所（E45） |
| GPT：Ithaca、Stryke 是现行设计 | 近 30 天几乎无成交（E26） |
| GPT：Derive XAUT 是第一个 RWA 期权 | Bybit 06-12 更早（X48） |
| GPT：Mantle 上有 rUSDY | 是 USDY 与 mUSD（X59） |
| GPT：未披露 Alea 的利益关系 | Alea 维护 Derive 数据室（E27） |
| 媒体：Hyperliquid 将上线期权 | 与访谈不符（E9） |
| 子 agent：Table 4b 含摩擦与融资 | 纯盯市压力亏损（W30） |
| 论文：DEX 30 天 $246.6B | 同窗口现值约 $288.0B（S1） |

**台账统计**：258 条，observed 202、inferred 44、speculative 12。页面只在标明的证据和“局限”面板里使用 speculative 论断。

## V 复现 {depth=3}
环境：Python 3、curl。脚本在报告目录 `research/scripts/`。

```bash title="期权例子（预期：171.3485、81.7565；±10% 跳动 −26.84 / −29.51）"
cd research/scripts
python3 bs.py
```

```bash title="论文 Table 4a / 4b 与式 16–18（预期：532 / 1052 / 2620；35.59 / 17.49 / 6.88）"
python3 wm_check.py
```

```bash title="DefiLlama 期权数据（预期：total30d 约 5.07e9，随时间变化）"
curl -s "https://api.llama.fi/overview/options?excludeTotalDataChart=true\
&excludeTotalDataChartBreakdown=true&dataType=dailyNotionalVolume" \
  | jq '.total30d, [.protocols[] | {name, total30d}] | sort_by(-.total30d) | .[:6]'
```

```bash title="Deribit 实时 IV 与 Greeks（预期：mark_iv 与 greeks 字段）"
curl -s "https://www.deribit.com/api/v2/public/ticker?instrument_name=ETH-27NOV26-2400-C" \
  | jq '.result | {mark_iv, greeks, underlying_price}'
```

```bash title="xStocks 在 Mantle 的 multiplier（预期：currentMultiplier 约 1.0057）"
curl -s "https://api.xstocks.fi/api/v2/public/assets/SPYx/multiplier?network=Mantle"
```

## W 术语表 {depth=2}
```glossary
call | 看涨期权 | 买方有权按执行价买入标的。 | 不是“做多期权”的同义词
put | 看跌期权 | 买方有权按执行价卖出标的。 | 买 put 是期权多头
执行价 | strike, K | 期权约定的买卖价格。 | 不是现价
权利金 | premium | 买方为期权付给卖方的价格。 | 不是协议收入
欧式期权 | European option | 只能在到期日行权的期权，到期前可以卖出平仓。 | 和交易地点无关
fixing | 结算价 | 到期时决定赔付的价格，例如 30 分钟 TWAP。 | 不是 mark price
TWAP | 时间加权均价 | 一段时间内价格的时间加权平均。 |
内在价值 | intrinsic value | 立刻行权能拿到的钱，例如 max(S − K, 0)。 |
时间价值 | time value | 期权价格减去内在价值，随时间流失。 |
Black-Scholes | BS 模型 | 用现价、执行价、期限、利率、波动率给欧式期权定价的公式。 | Black-76 用远期价代替现价
隐含波动率 | IV | 把市场价代入模型反解出的波动率。 | 不是历史波动率
DVOL | | Deribit 的 30 天隐含波动率指数。 |
delta | | 期权价格对标的价格的一阶敏感度。 |
gamma | | delta 随标的价格变化的速度。卖方是负 gamma。 |
theta | | 每天流失的时间价值。 |
vega | | 期权价格对 IV 变化 1 个点的敏感度。 |
凸性 | convexity | 收益曲线向上弯：涨时赚得越来越多，跌时亏损有底。 | 不是杠杆
全额抵押 | fully collateralized | 卖方锁住最大可能赔付，没有清算。 |
组合保证金 | portfolio margin | 在多种价格、波动率情景下重估整个账户，按最坏亏损收保证金。 | 不是逐仓
DOV | DeFi option vault | 把存款集中起来、定期卖出期权的金库。 | 不是期权交易所
RFQ | 询价 | 用户询价，做市商回签名报价，用户选一个链上成交。 | 不是订单簿
HIP-4 | outcome markets | Hyperliquid 的全额抵押、有界结算合约原语。 | 不是普通期权
put-call parity | 看涨看跌平价 | C − P = S − PV(K)。 |
multiplier | 乘数 | xStocks 用来反映分红、拆股、管理费的系数。 | 不是合约乘数
```

## X 参考资料 {depth=2}
1. [OIC：Options Basics](https://www.optionseducation.org/optionsoverview/options-basics) — call / put、权利与义务、损失上限。**PRIMARY**
2. [OIC：Volatility & the Greeks](https://www.optionseducation.org/advancedconcepts/volatility-the-greeks) — 历史波动与 IV、Greeks 定义与单位。**PRIMARY**
3. [OIC：Covered Call](https://www.optionseducation.org/strategies/all-strategies/covered-call-buy-write) 与 [Cash-Secured Put](https://www.optionseducation.org/strategies/all-strategies/cash-secured-put) 等策略页 — 结构公式；两者风险曲线相同。**PRIMARY**
4. [Deribit：Change To Inverse Option Delivery Process](https://insights.deribit.com/exchange-updates/change-to-inverse-option-delivery-process) 与 [Linear USDC Options](https://support.deribit.com/hc/en-us/articles/31424932728093-Linear-USDC-Options) — 欧式、08:00 UTC、30 分钟 TWAP、2026 年改为期货结算。**PRIMARY**
5. [Deribit 公共 API](https://docs.deribit.com/)（`ticker`、`get_volatility_index_data`、`get_instruments`，2026-10-15）— IV、smile、DVOL、合约字段。**PRIMARY**
6. [Deribit：Portfolio Margin](https://www.deribit.com/kb/portfolio-margin) 与 Standard Margin — 保证金公式与情景。**PRIMARY**
7. [Cboe：Portfolio Margining](https://www.cboe.com/en/markets/us/options/margin/portfolio-margining-rules/) — 策略保证金与组合保证金的区别。**PRIMARY**
8. Black & Scholes (1973, JPE)；Stoll (1969, JF)；Merton (1974, JF) — 定价模型、平价关系、债务的期权视角。**PRIMARY**
9. [Paradigm：Everlasting Options](https://www.paradigm.xyz/2021/05/everlasting-options) 与 [Power Perpetuals](https://www.paradigm.xyz/2021/08/power-perpetuals)；[Squeeth 关停公告](https://squeeth.opyn.co/squeeth) — 永续期权与凸性产品。**PRIMARY**
10. [Blockworks Empire 节目页](https://blockworks.com/podcast/empire/bc375300-c276-11f1-925c-cbee0c7ea3ff) 与 [Podscan 转写](https://www.podscan.fm/podcasts/empire-1/episodes/jeff-yan-on-hyperliquids-plan-to-bring-all-finance-onchain) — 节目、章节、04:30 原话。**PRIMARY**
11. [KuCoin 快讯（转载火星财经）](https://www.kucoin.com/news/flash/hyperliquid-founder-jeff-yan-considers-options-research-for-future-venture) 与 Binance Square（转载 Odaily）— builder 问答的转述（媒体报道）。
12. [Hyperliquid：HIP-4 Outcome markets](https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets) 与 Contract specifications — 定义、二元合约规格。**PRIMARY**
13. [Hyperliquid：Portfolio margin](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/portfolio-margin) 与 2026-06-25 公告 — 组合保证金。**PRIMARY**
14. [DefiLlama API：options](https://api.llama.fi/overview/options?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyNotionalVolume)（名义与权利金）、dexs、Mantle 链页 — 成交、份额、Mantle 现状。**PRIMARY**（聚合数据）
15. [Alea Research：Twice the Exposure, a Quarter Cheaper](https://alearesearch.io/newsletters/twice-the-exposure-a-quarter-cheaper) — Derive Q3 数据与 CEX 份额；作者维护 Derive 数据室。
16. [Coinbase：Deribit Joins Coinbase](https://investor.coinbase.com/news/news-details/2025/Deribit-Joins-Coinbase-Unlocking-the-Future-of-Global-Crypto-Derivatives) — 收购与 Deribit 规模。**PRIMARY**
17. [Andolfatto & Schönleber：Decentralized and Centralized Options Trading（SSRN 4822783）](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4822783) — DEX 约占 1%；链上 IV 偏高。**PRIMARY**
18. [Opyn：ETH Put Exploit Post Mortem](https://medium.com/opyn/opyn-eth-put-exploit-post-mortem-1a009e3347a8) — 2020 年漏洞与补偿。**PRIMARY**
19. [Lyra：Introducing Lyra](https://blog.derive.xyz/introducing_lyra) — 前代期权 AMM 的问题。**PRIMARY**
20. [Rysk：Solution: Rysk V12](https://docs.rysk.finance/getting-started/solution-rysk-v12) 与 Problem — RFQ、实物交割、DOV 的失败原因。**PRIMARY**
21. [Derive：V3 is live](https://insights.derive.xyz/v3)、[RFQ Trading](https://docs.derive.xyz/trading/rfq.md)、[Instrument Names](https://docs.derive.xyz/trading/instrument-names.md) — V3 架构、RFQ 流程、结算时刻。**PRIMARY**
22. [Derive：XAUT Options Are Live](https://insights.derive.xyz/xaut-options-are-live-on-derive) — Derive 首个 RWA 期权。**PRIMARY**
23. [Paradex：Dated Options](https://docs.paradex.trade/trading/dated-options/overview) — 欧式、USDC 现金结算、TWAP。**PRIMARY**
24. [Thetanuts V4 Docs](https://docs.thetanuts.finance/for-builders/overview) — OptionBook、RFQ Factory、做市商定价方法。**PRIMARY**
25. [The Block：Ribbon 遗留 DOV 被盗](https://www.theblock.co/post/382461/aevos-legacy-ribbon-dov-vaults-exploited-for-2-7-million-following-oracle-upgrade) 与 [RGP-33](https://gov.ribbon.finance/t/rgp-33-merge-ribbon-finance-into-aevo/709) — DOV 事故与并入 Aevo（前者为媒体报道）。
26. World Markets Research：《The Economics of Composable Options Markets》（2026-10，PDF；本地 `research/references/`）— 论文全部论点与数字。**PRIMARY**
27. [World Markets Docs：ATLAS](https://docs.world.inc/tl-dr-unique-features/atlas)、Trading、[Options](https://docs.world.inc/details/options.md) — 98%、10 天定期借贷、期权“Coming soon”。**PRIMARY**
28. [GeorgL0ngGamma gist](https://gist.github.com/GeorgL0ngGamma/4e00c477cb66424b9458827f8b3bec44) — 论文引用的 Derive V2 盘口原始数据。**PRIMARY**
29. [xStocks Docs](https://docs.xstocks.fi/docs)（Introduction、FAQ、[Multipliers](https://docs.xstocks.fi/developers/multipliers)）— 链列表、交易时段、公司行动、申赎资格。**PRIMARY**
30. [xStocks 公共 API](https://api.xstocks.fi/api/v2/public/assets?network=Mantle) — Mantle 部署、封装地址、时段上限、multiplier 历史。**PRIMARY**
31. [backed-fi/backed-token-contract @35859e8c](https://github.com/backed-fi/backed-token-contract) — pause、制裁名单、multiplier 与管理费、ERC-4626 封装。**PRIMARY**
32. [xStocks：Introducing xStocks on Mantle](https://xstocks.fi/us/news/introducing-xstocks-on-mantle) — 2026-05-07 接入 Atomic RFQ。**PRIMARY**
33. [Chainlink：Tokenized Asset Data Streams（Report Schema v10、Handling Stock Splits、Handling Market Events）](https://docs.chain.link/data-streams) — 字段、周末行为、休市闸门。**PRIMARY**
34. [Mantle Docs：Oracles](https://docs.mantle.xyz/network/for-developers/resources-and-tooling/oracles.md) 与 [mETH Protocol](https://docs.mantle.xyz/meth) — 预言机列表；mETH 赎回延迟。**PRIMARY**
35. [aavetracker：Aave Mantle](https://aavetracker.com/markets/mantle/) — Aave Mantle 资产明细（第三方读取 Aave API）。
36. mStocks 媒体报道：Gate News（转引 PANews）、CryptoBriefing（2026-10-13）— 目标 2026-11 上线、发行结构（媒体报道）。
37. [Ondo Docs：Smart Contract Addresses](https://docs.ondo.finance/addresses.md) 与 [USDY](https://ondo.finance/usdy) — Mantle 上的 USDY / mUSD；Reg S。**PRIMARY**
38. OCC 2025 年度成交与 Cboe《The State of the Options Industry》— 美股期权规模与 0DTE。**PRIMARY**
39. Bybit XAUT 期权上线公告（2026-06-12）与 Coincall SPY / QQQ 期权上线公告（2026-08-26）— 中心化平台的 RWA 期权先例。**PRIMARY**
40. research-hub 报告 papertrade-deep-dive（`/p/papertrade-deep-dive/`）— Mantle 预言机、排序、稳定币的已有核查。
41. ChatGPT Deep Research：`research/onchain-options-handbook.md` — 外部调研，只作线索。

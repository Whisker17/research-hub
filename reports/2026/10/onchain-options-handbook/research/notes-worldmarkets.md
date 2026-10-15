# Lane W：World Markets《The Economics of Composable Options Markets》解读与核查

- 本路范围：brief 研究问题 4。内容包括：论文逻辑链逐节复述、论文数字分级、关键输入核查（DefiLlama、Derive V2 盘口 gist、Uniswap 区块、World/Derive 文档、传统市场数字）、局限与利益相关、对开发者和 Mantle 的借鉴。
- 论文版本：research/references/world-markets-composable-options.txt（pdftotext -layout 抽取，共 12 页，署名 “World Markets Research, October 2026”）。下文页码指 PDF 页码。
- 访问日期：所有网页与 API 都在 2026-10-16 访问。
- **工具限制（先说明）**：本次运行环境没有 shell/bash 工具，所以 **python3 脚本无法实际执行**。所有复算都用 erf 的级数展开手算，保留 4–6 位有效数字；“命令与输出”一节附了可复现脚本，但脚本**未运行**。网络核查用 fetch（GET）完成；公共 RPC 需要 POST，无法调用，区块时间改用 Blockscout REST API 核实。

---

## 1. 论文核心论点与逻辑链（逐节，标页码）

**答案**：论文的主张是：期权的“可成交流动性”不必只来自该期权自己的订单簿。交易所可以把现货、定期融资和反向期权组合成同一 payoff（静态复制）；做不到静态复制时，由承担风险的做市商做动态对冲；再用同一账本的组合保证金（把定期出借债权按 98% 计入保证金）降低资本占用。按 2026-10 的数据，在“对冲期权可得”的条件下，作者估算可挂出 532–1,052 张报价，约为 Derive V2 历史卖一档 90 张的 6–12 倍。World Markets V2 “+Options” 是这一思路的产品落地。[1]

**逐节要点**：
- **摘要 / §1 引言（p1）**：链上期权的瓶颈是流动性。交易所可以比较“原生期权报价”和“现货 + 融资 + 反向期权”的可执行组合，选更便宜或更深的路径交付。这里提出三个问题：哪些 payoff 能用可执行成分精确构造？动态对冲和联合保证金能把流动性扩大多少？在给定输入下能增加多少深度和立即成交？文中明确，结论建立在“对手方、成分市场流动性、融资和风险资本都能以经济价格获得”的假设上。Derive 已经有期权/永续组合保证金、跨资产抵押和 RFQ，论文不把这些算作新设计的贡献。[1]
- **§2.1 Put-call parity（p1–2）**：到期恒等式 C_T − P_T = S_T − K（式 1），定价关系 C_t − P_t = S_t − B_t(K,T)（式 2）。Table 1 给出四种等价构造：long call = 现货 + put − 固定还款债务；long put；远期；covered call = 固定债权 + short put。静态精确复制需要一个“凸性来源”：反向期权，或具有相同或有支付的债权。[1]
- **§2.2 Merton 债权 = K − put（p2）**：理想化的到期结算无追索贷款中，出借人收到 D_T = min(S_T, K) = K − max(K − S_T, 0)（式 3），即“固定还款减一个 put”；借款人权益是一个 call。例子：还款 $90，抵押物到期 $120/$70 时，出借人收到 $90/$70。论文强调这**不等于**说“可清算的 DeFi 贷款内含可交易的欧式 put”。[1]
- **§2.3 动态复制（p2）**：没有静态路径时，按 Δ = ∂V/∂S（式 4）用现货或永续动态对冲。用永续对冲会引入资金费率和基差风险；做市商仍要承担 gamma、vol 重定价、跳空和清算风险。静态构造是“转移已有的等价 payoff”，动态复制则是“新增一笔需要有人承担并融资的期权头寸”。[1]
- **§3 合成期权流动性（p3）**：交易所把所有“可执行、payoff 等价”的路径构造成原生期权簿里的挂单，并原子执行最优路径或组合。§3.1：C_syn,a = S^a + P^a − B_borrow（式 5），C_syn,b = S^b + P^b − B_lend（式 6）。示例：现货 99.80/100.20、put 3.60/4.00、融资所得 99.80、固定债权成本 99.90，得到合成 call 3.50/4.40，优于原生 3.25/4.80（论文注明是“假设报价的算术”，不是观察到的套利）。§3.2：深度受最稀缺的一腿约束，q_syn ≤ min(q_spot, q_opposite option, q_financing)（式 7）。示例：现货 150、put 80、融资 60，合成深度为 60；加上 40 张独立原生深度，共 100。共享成分不能重复计算。§3.3：再叠加承担风险的动态报价。[1]
- **§4 动态对冲与组合保证金（p3–4）**：20 个行权价 × 10 个到期 × 2 种类型 = 400 个系列，但每个风险资产只有一个净 delta（式 8）。组合保证金 M(Π) = max_s max(0, −ΔV(Π;s))（式 9）。§4.1 的增量机制：把“合格的原生定期出借债权”与现货、永续、期权放进同一账本，按 98% 认可（引用 World 文档 [20–22]）。§4.2 示例：$1M 定期出借债权；卖 $1M 名义 ATM call；$0.5M 永续多头对冲；$70/$130 两个冲击下都亏 $150k。债权在账外时总资本 $1.15M，在账内时 $1.00M（−13.04%）。总资本固定 $1.45M、保证金系数 15% 时，容量分别为 $3.00M 和 $9.53M，即 3.18x（Table 2）。§4.3 的做市容量上界 Q_dyn ≤ min(H/|Δ|, C_e/m, N_R)（式 10）。[1]
- **§5.1 Derive 基准与数据（p4–5）**：2026-10-12 研究快照。现货/期权 30 天成交 246.593/4.881 = 50.5（式 11）；(Aave 12.15 + Morpho 5.78)/Derive OI 1.655 = 10.8（式 12）；Derive 份额 4.236/4.881 = 86.8%（式 13）。论文自己说明这些比值**不代表**多 50.5 倍可执行对冲深度。数据边界：10-12 数值“抄自仪表盘，没有不可变的历史导出”；9-24 的数据只是公开可见盘口，不是 Derive V3 或机构 RFQ 深度。[1]
- **§5.2（p5）**：要实测静态路由的增益，需要同一时刻的现货盘口、反向期权盘口、10 天期借贷价格、费用和可做空量。Table 3 的汇总数据**不提供**这些逐行权价输入；§3 的例子只演示机制，不代表观察到的市场规模。[1]
- **§5.3 组合保证金下的容量（p5–7）**：做市商卖给客户 ATM call，同时买入同到期、更高行权价的 call（即持有 short call spread），只用现货对冲剩余 delta：h = q(Δ_sold − Δ_hedge)（式 14）。校准输入：以 Ethereum 区块 26,189,586（2026-10-14 08:36:59 UTC）状态模拟在两个 Uniswap V3 WETH/USDC 池买入 60 ETH（5bp 池 40 ETH、1bp 池 20 ETH）。参考价 2,510.8339，现金约 $150,808.54，其中费用 + 冲击 $158.51。期权假设为 7 天、ATM、IV 50%、平坦曲面、r = 0，gas 设为 0。Table 4a：hedge 行权价 +$50/+$25/+$10 对应净 delta 0.1126/0.0570/0.0229，支持 532/1,052/2,620 张，即 5.9×/11.7×/29.1×，每张现货成本 $0.30/$0.15/$0.06。Table 4b 的压力网格：spot ±20%、IV 25/50/75%、剩余 7/3/1/0 天、现货对冲固定。每张准备金 $35.59/$17.49/$6.88，合计约 $19k，支持 $1.34–2.64M 名义。融资约 $139k；按 5% 年化借 7 天，Table 4c 的每张融资成本为 $0.25/$0.13/$0.05。以 Derive V2 历史 ask $67.20 / bid $63.30 的中点作为假想价值，可得 $1.95 的定价余量，扣除后剩 $1.40/$1.67/$1.84。论文明确：**对冲期权的可得数量和价格是假设，不是观察值**。$25 配置需要 1,052 张可成交的 hedge call。[1]
- **§5.4 资本容量对比（p7–8）**：做市商资本 $1.45M，其中 $1M 是定期出借债权，98% 认可，保证金系数 15%，得到 $3.00M 对 $9.53M（3.18x）。再给两边相同的对冲额度 H = $3M、|Δ| = 0.5，对冲上界为 $6M，于是 Q_separate = min(3.00, 6.00) = 3，Q_integrated = min(9.53, 6.00) = 6，即 2.00x（式 15）。如果 H 降到 $1M，两边都是 $2M，增益消失。[1]
- **§5.5 立即成交与新增量（p8–9）**：设订单规模服从均值为 µ 的指数分布，立即成交比例 F(Q,µ) = 1 − e^{−Q/µ}（式 16）。µ = $100k；Q_D = $224k（历史 bid 82.8 ETH × 行权价 $2,700 ≈ $223.6k，取整）；Q_U = $1M（“posit”，即假设的新 bid）。成交比例为 89.354% 对 99.995%，每 $1B 卖单需求可多立即成交 $106.4M（式 17）；按转化率 θ = 50% 计，新增成交量 $53.2M（式 18）。另一组：µ = $2M、Q = 3M 对 6M，成交比例 77.69% 对 95.02%，多 $173.3M，θ = 50% 时新增 $86.7M。论文注明两组都**不是**对 World 路由或 Derive 订单流的测量。[1]
- **§6 传统金融中介（p9–10）**：BIS 场外 FX 期权 $634B/日 + 利率期权 $245.8B/日 = $879.8B/日，按 250 个交易日折算约 $220T/年（“纯示意”）。Table 6 还列了清算碎片化 $80M/日、OCC-CME 交叉保证金 $700M/日和 54%、CME $8.4B、FIA 88.65B 张。论文的论点是：合并融资的收益来自减少重复的融资和运营要求，风险本身并没有消失。[1]
- **§7 World Markets V2 +Options（p9–10）**：V2 “will” 比较原生期权订单与可执行的合成构造，在价格更优或深度更深时用现货、定期融资和期权 payoff 组装；静态部分写进合约；做不到精确构造时，由承担风险的 LP 或 vault 用现货和永续对冲，全部工具共享组合保证金；出借债权按 98% 计入。Table 7 / Fig. 8 对比了五种交易在 Isolated / Derive / World V2 下的资本占用，图注写明是 “**provisional supplied estimates, not independently measured margin-engine outputs**”。[1]
- **§8 实现与风险（p10–11）**：合成路由器必须保证 payoff 一致（币种、行权价、到期、行权权利、标的分布都要匹配）、原子或有保证的打包执行、去重深度、融资覆盖全额。动态部分需要指定的做市商承担 gamma、vol、跳空、基差、资金和清算风险。论文列了四个可检验假说，并承认如果成分执行昂贵、融资错配或剩余风险约束生效，“优势可能消失”。要与 Derive V3 做同类比较，必须在同一时刻、对同一合约采样它的挂单和 RFQ。[1]
- **§9 结论（p11）**：复述 532–1,052 张（约 6–12 倍）、约 60 ETH、约 $19k 准备金、3.18 倍、$53.2M/每 $1B（θ = 50%）。论文称其一般性贡献是“组合既有金融体系的成分流动性，而不是为每个或有合约重新造一份流动性”。[1]

**不确定之处**：摘要用了“6–12x increase in top of book liquidity is possible”，正文则把同一数字限定为“conditional quotation capacity”，并且要求对冲期权可成交。摘要的措辞比正文强（W38）。

### 合成路由机制（页面配图用步骤列表）
1. 客户下单：例如买入 call(K, T)，带限价。
2. 交易所读取原生期权簿的 ask。
3. 构造静态合成路径：买现货 ask + 买同 K/T 的 put ask + 借入定期资金（到期还 K）。合成价格 C_syn,a = S^a + P^a − B_borrow，加上确定的费用和滑点（式 5）。卖方向用式 6：卖现货 + 卖 put + 出借。
4. 每条合成路径的容量 = min(现货量, 反向期权量, 融资量)（式 7）。被别的路径占用的成分要扣除，避免重复计算。
5. 原生路径和合成路径按全包价格排序，在客户限价内分配（例如 60 张合成 + 40 张原生 = 100 张）。
6. 原子打包执行：各腿要么全部成交，要么全部不成交，不允许单边成交。
7. 头寸进入同一保证金账户（现货、借贷、期权、永续），按情景压力计算组合保证金（式 9）。出借债权按 98% 计入可用保证金（World 文档已写明）。
8. 没有静态路径时：承担风险的做市商或 vault 报价，卖出客户要的期权，买入邻近行权价的期权，用现货或永续对冲净 delta（式 14），容量受 min(H/|Δ|, C_e/m, N_R) 约束（式 10）。
9. 任一成分变化时，相关报价要更新、撤销，或由承诺的做市商库存支撑。
10. 到期结算：期权按 payoff 结算，定期贷款按 K 还款，两者到期日需匹配（World 贷款固定 10 天，§5.2 也用“ten-day lending”）。

---

## 2. 数字分级（实测 / 模型 / 假设）

**答案**：论文里真正“实测”的只有三类：Table 3 的仪表盘读数（10-12 快照，没有不可变导出）、Derive V2 的一次公开盘口抓取（9-24），以及一次 Uniswap 链上状态模拟（区块 26,189,586）。532–1,052 张、5.9–11.7x、$19k、3.18x、2.00x、$106.4M、$53.2M 都是“模型计算”，在给定假设下我能复算一致。决定结论的输入（对冲期权的可得性、$1M 新 bid、θ = 50%、15% 保证金系数、98% 认可在期权场景的适用性）属于假设。Table 7 是项目方自报的暂定估计。[1]

### 论文数字分级表

| 数字 | 含义 | 类别 | 是否复算一致 | 备注 |
|---|---|---|---|---|
| $246.593B | 链上 DEX 现货 30 天成交（10-12） | 实测（仪表盘转录） | 量级一致，数值不一致 | 2026-10-16 的 API total30d = $289.217B，高约 17%（见 §3.2） |
| $12.15B / $5.78B | Aave V3 / Morpho 在贷余额（10-12） | 实测（仪表盘转录） | 未核实 | DefiLlama protocol API 响应 >5MB，超出工具上限 |
| $4.881B | 全部链上期权 30 天名义成交 | 实测 | 量级一致 | 当前 total30d = $5.074B（+4%） |
| $4.236B | Derive 30 天名义成交 | 实测 | 一致（±0.3%） | 当前 V2 $3.362B + V3 $0.884B = $4.246B |
| $1.655B | Derive V3 期权 OI（10-12） | 实测 | **精确一致** | DefiLlama OI 日序列 2026-10-12 = 1,655,413,130 |
| 50.5x | 现货/期权 30 天成交比 | 由实测数据计算 | 一致（50.52） | 论文自承不代表可执行对冲深度 |
| 10.8x | (Aave + Morpho 贷款)/Derive OI | 由实测数据计算 | 一致（10.83） | 存量/存量，不代表可复用抵押 |
| 86.8% | Derive 占链上期权成交 | 由实测数据计算 | 一致（86.79%） | 现值约 83.7%（4.246/5.074） |
| 82.8 ETH bid / 90 ask，$63.30 / $67.20 | Derive V2 ETH-20261002-2700-C 卖一/买一的价格与数量（9-24） | 实测（第三方 gist 抓取） | 一致 | 只是最优一档；ask 有 4 档、bid 有 7 档，没有加总 |
| 区块 26,189,586 = 2026-10-14 08:36:59 UTC | Uniswap 模拟所用状态 | 实测（链上） | 时间一致 | 模拟本身未复跑 |
| 60 ETH、$150,808.54、$158.51 | 现货对冲成本 | 实测（链上状态模拟） | 60 × 2510.8339 + 158.51 = 150,808.54 一致 | 池地址和 quoter 脚本未公开 |
| 0.1126 / 0.0570 / 0.0229 | 每组合净 delta | 模型 | 一致（0.11257/0.05700/0.02290） | 7/365 年、IV 50%、r = 0、K_ATM = 2510.8339 |
| 532 / 1,052 / 2,620 | 可报张数 | 模型 | 一致（60/net Δ 后取整：533.0→532 保持 ≤60 ETH、1052.7、2620.5） | 前提是能买到等量 hedge call |
| 5.9× / 11.7× / 29.1× | 相对 90 张的倍数 | 模型 ÷ 实测 | 一致 | 合约、日期、行权价都不同 |
| $0.30 / $0.15 / $0.06 | 每张现货执行成本 | 实测成本 ÷ 模型张数 | 一致（158.51/q） | — |
| $35.59 / $17.49 / $6.88 | 每张压力准备金 | 模型 | 精确一致（主会话 python 复算，见 §3.1） | 最坏情景：spot −20%、IV 75%、剩余 7 天（瞬时冲击）；总额 $18,932/$18,395/$18,034 |
| $18,932 / $18,395 / $18,034 | 合计准备金 | 模型 | 一致（per-call × q） | 约等于 60 ETH × 20% × S 减去收到的价差权利金 |
| 1.42% / 0.70% / 0.27% | 准备金占名义比例 | 模型 | 一致 | — |
| $1.34–2.64M | 客户期权名义 | 模型 | 一致（532/1052 × 2510.83） | — |
| ≈$139,000 | 需融资额 | 模型 | 一致（150,808 − q × 价差权利金 ≈ 139.4k/138.8k） | — |
| 5% 年化 | 借款利率 | 假设 | — | — |
| $0.25 / $0.13 / $0.05 | 每张融资成本 | 模型 | 一致 | — |
| $1.95 | 定价余量 | 实测盘口中点推算，作为假设使用 | 一致（67.20 − 65.25） | 论文自注合约和日期不同 |
| $1.40 / $1.67 / $1.84 | 剩余余量 | 模型 | 一致 | — |
| 3.18x | 资本上限比 | 模型（假设 $1.45M、15%、98%） | 一致（9.533/3.00 = 3.178） | — |
| 13.04% | 总资本减少 | 模型 | 一致（0.15/1.15） | — |
| 2.00x | 对冲 + 资本双约束容量比 | 模型（假设 H = $3M、Δ = 0.5） | 一致 | H ≤ $1M 时增益为 0 |
| 89.354% / 99.995% | 立即成交比例 | 模型（指数分布假设） | 一致 | Q_U = $1M 是假设 |
| $106.4M | 每 $1B 需求的额外立即成交 | 模型 | 一致（106.41） | — |
| $53.2M | 新增成交量 | 模型 + 假设 θ = 50% | 一致 | — |
| 77.69% / 95.02%、$173.3M、$86.7M | µ = $2M 情形 | 模型 | 一致 | — |
| $3.50 / $4.40 | 合成 call 买卖价示例 | 假设报价的算术 | 一致 | 非观察值 |
| 98% | 出借债权的保证金认可率 | 项目方参数（文档有记载） | 文档确认 | 在期权场景下的适用性未经检验 |
| Table 6 各数字 | 传统市场规模 | 实测（第三方一手来源） | 抽查 4 项：3 项一致，1 项为 $245B 对 $245.8B | OCC $700M/54% 与 CME $8.4B 未能打开原文 |
| Table 7 全部 | 五种交易的资本占用 | **假设 / 项目方提供** | 不可复算 | “provisional supplied estimates” |

---

## 3. 核查

### 3.1 Table 4a / 4b / 4c 与式 (16)–(18) 复算（手算，脚本见“命令与输出”）
**答案**：在 T = 7/365、σ = 0.5、r = 0、K_ATM = S = 2510.8339 的条件下，净 delta 0.1126/0.0570/0.0229 和张数 532/1,052/2,620 都能复现。$106.4M、$53.2M、3.18x、2.00x 也能精确复现。Table 4b 也能**精确复现**（主会话 2026-10-16 用 python 跑 C9 脚本）：网格内最坏情景是 spot −20%、IV 75%、剩余 7 天（即瞬时冲击，价差仍有残值），每张 $35.59/$17.49/$6.88，乘张数得 $18,932/$18,395/$18,034，与论文逐位一致。准备金是纯盯市压力亏损，**不含**摩擦和融资。〔更正：本路原手算版本以为最坏情景在到期日、并推断论文计入了摩擦和融资，那是手算误差导致的错误推断。〕

**依据**：
- ATM：d1 = σ√T/2 = 0.034621，N(d1) = 0.513809；C1 = S(2N(d1) − 1) = $69.34。
- +$50：ln(K2/S) = 0.0197181，d1 = −0.250147，Δ2 = 0.401237，净 Δ = 0.112571；d2 = −0.319390，C2 = $47.86，价差权利金 = $21.49。
- +$25：d1 = −0.108466，Δ2 = 0.456813，净 Δ = 0.056995；C2 = $57.90，价差权利金 = $11.44。
- +$10：d1 = −0.022783，Δ2 = 0.490912，净 Δ = 0.022896；C2 = $64.60，价差权利金 = $4.75。
- 张数：60/0.112571 = 533.0（533 张需要 60.0003 ETH，超过 60，所以取 532）；60/0.056995 = 1052.7；60/0.022896 = 2620.5。
- −20% 情景：现货亏 h × 0.2 × S = 56.53/28.62/11.50，减去价差权利金后为 35.04/17.18/6.75。网格中其他情景（上行时价差亏损封顶在 K2 − K1，同时现货对冲盈利；IV 上升时价差在下行情景中仍有残值）亏损都更小。
- 合计准备金约等于“60 ETH × 20% × 2510.83 ≈ $30.1k 减去 q × 价差权利金（约 $11.4–12.4k）”，所以三种配置都在约 $19k。这说明 **准备金本质上由网格边界（−20%）决定**：如果下跌 30%，每张准备金会升到约 $63（+$50 配置）。
- 式 16：e^{−2.24} = 0.106459 → 89.354%；e^{−10} = 4.54e−5 → 99.995%；差 0.106414 × $1B = $106.4M；× 0.5 = $53.2M。µ = 2M：1 − e^{−1.5} = 0.77687，1 − e^{−3} = 0.95021，差 $173.3M，× 0.5 = $86.7M。另外，E[min(X,Q)] / E[X] = 1 − e^{−Q/µ} 对指数分布在数学上成立。
- 3.18x = ((1.45 − 1.00) + 0.98)/0.15 ÷ (0.45/0.15) = 9.533/3.000；2.00x = min(9.53, 3/0.5)/min(3.00, 6.00)。

**不确定之处**：论文没有公开计算脚本；以上复算由主会话运行 `research/scripts/wm_check.py` 完成，输出见“命令与输出”C10。

### 3.2 DefiLlama 输入（只核量级）
**答案**：期权侧几乎一致：Derive V3 OI 的 10-12 日值精确等于 $1.655B；Derive 30 天成交当前为 $4.246B，论文为 $4.236B；全部期权成交当前为 $5.074B，论文为 $4.881B。DEX 现货当前 total30d 为 $289.2B，比论文的 $246.593B 高约 17%。两个 30 天窗口只相差 4 天，这个差距不能用窗口滑动解释（日成交约 $9–10B）。可能原因有：数据回补或新增 adapter、论文用了不同的过滤口径，或论文转录有误。目前无法判定，**量级一致，数值存疑**。Aave、Morpho 在贷余额因 API 响应过大没有核到。[12][13][14]

**依据**：命令与输出见下节 C1–C3。另外，DefiLlama 给 Derive V3 打的 hallmark 是 2026-10-08 “V3 launch: migration from Derive Chain to Ethereum L1”。Derive Options（V2，Derive Chain）的 total7DaysAgo = 0、total24h = null，说明 V2 期权最近一周已经没有成交。所以论文的“Derive V2 盘口基准”是一个已经迁移走的场所的历史盘口。[14][13]

### 3.3 Derive V2 盘口 gist
**答案**：gist 能打开（GitHub API）。liquidity.json（revision c90424c1…）里，ETH-20261002-2700-C 的 Derive 最优 ask 为 67.2、数量 90，最优 bid 为 63.3、数量 82.8，与论文一致。采样时间 1790283757 ms 换算为 2026-09-24 21:02 UTC，与论文“Sep. 24”一致。不过需要注意三点：(a) 90 和 82.8 只是**最优一档**的数量，盘口还有 4 档 ask、7 档 bid，没有加总，所以“90 张”低估了可见深度；(b) gist 自己把数据标为 “public_visible_depth_not_firm_rfq_or_executed_trade”，RFQ 部分是 “not_sampled_auth_required”；(c) 同一份文件里，ETH-20261009-2700-C 的 Derive 最优档数量只有 0.74。gist 的作者 GeorgL0ngGamma 与 World Markets 的关系查不到；gist 本身是一个 Paradex/Derive 平价比较工具。[10]

### 3.4 Uniswap 模拟
**答案**：区块 26,189,586 的时间戳是 2026-10-14T08:36:59Z，与论文一致（Blockscout API）。60 × 2510.8339 + 158.51 = 150,808.54 与论文一致。模拟本身没有复跑。论文给出了区块、费率档位（5bp/1bp）、拆单量（40/20 ETH）和参考价，但没有给池地址、quoter 合约或调用脚本。用归档节点加 QuoterV2 可以复现，但需要研究者自己确定参数，所以只能算“部分可复现”。另外 gas 设为 0。[11][1]

### 3.5 World Markets 是什么，文档是否写了 98%
**答案**：World Markets（world.inc）是一个全链上的现货 + 永续 + 定期借贷订单簿交易所，使用统一保证金引擎 ATLAS，部署在 MegaETH（以太坊 L2）。2025-03 在 MegaETH 测试网私测，并完成 Zellic 审计。根据二手镜像，主网约在 2026-05 上线 Mega Terminal。目前仍处于 Beta：合约可升级，源码“达到足够流动性后才公开”。团队：CEO/联创 Lucas Gaylord（曾联创 Nomisma、Eulith、Annamite），CTO/联创 Moh Rezaei（前 Goldman Sachs），COO & GC Gareth Rhodes，CBO Joe Cox。官网现在标注 “World Markets · on Ethereum” 和 “Trade Coming Soon”，文档把 MegaETH 页归到 “Legacy”，似乎正在迁往以太坊（推测为 V2）。**文档确实写了 98%**：ATLAS 页写 “Lender-side loans contribute 98% of the notional value of the loan to the available margin”，Trading 页也有相同表述。贷款固定 10 天、固定利率。**期权尚未上线**：docs 的 Options 页只有一句 “Coming soon.”。没有找到 V2 +Options 已发布的一手证据。[2][3][4][5][6][7][8][9]

**补充**：官网列出的上架资产里有 Ondo 代币化股票（AAPLon、SPYon、QQQon、NVDAon、TSLAon 等）、xStocks NFLXx、Midas mF-ONE、Centrifuge deJAAA、XAUT 等 RWA，标注为“Spot · Perp · lend · borrow · Collateral”。多数状态为 “—”，只有加密资产和 XAUT 标 “Live”。这与 Mantle 的 RWA 方向高度相关。[9]

**不确定之处**：“迁往以太坊 = V2” 是推断。论文引用的 [22] market-structure URL 现在重定向到 “Order books + RFQ” 页，页内有 “Fixed term, fixed rate lending” 一节。

### 3.6 Derive 文档是否支持论文的描述
**答案**：基本支持。[11]（2024 年博文）写明 Derive V2 有组合保证金（PMRM，按现货和 vol 冲击计算 maxLoss + contingencies）、跨资产抵押（初始保证金 ETH 按 80%、BTC 按 75% 计价）、最多 32 个子账户，能识别价差、蝶式等组合抵消。这支持论文所说的“Derive 已识别期权和永续净额、部分现货抵押、期权价差和组合抵消”。[12] 是**浮动利率** USDC 借贷，这与论文“World 的增量是定期债权入账”的对比一致。但论文在 §1 用 [11,12] 支撑“RFQ execution”，这两篇都没有讲 RFQ，属于引用不精确（RFQ 本身确实存在，见外部调研引用的 Derive RFQ 博文）。另外 2024 年博文中的 PM 子账户是“single-market（BTC 或 ETH）”的，这也是一个限制。[15][16]

### 3.7 传统市场数字（抽查）
**答案**：抽查了 4 项。BIS FX 期权 $634B/日（2025 年 4 月）一致。BIS 利率期权：commentary 原文是 “$245 billion”，论文写 $245.8B，可能取自终版表格，差异很小。FIA 2025 年期权 88.65B 张一致（原文同时写了“同比 −50.3%”，论文没有提）。Benos 等人的清算碎片化 $80M/日一致（原文口径是“LCH 卖方客户的成本或机会成本”）。OCC 2015 页面返回 403，CME FAQ 超时，$700M/日、54%、$8.4B **未核实**。[17][18][19][20]

---

## 4. 局限与利益相关

**答案**：这是项目方为自己即将推出的产品写的论证。最关键的输入（等量对冲期权可得、融资可执行）是假设；比较基准是一个已经迁移的场所（Derive V2）的最优一档挂单，不是 V3 的盘口或 RFQ 深度。工程难点（原子性、去重、结算一致）论文在 §8 里自己承认，但没有给出实现。论文的措辞整体相当克制，多处主动声明“非实测”，但摘要的表述比正文强。

**依据**：
- 利益相关：署名 “World Markets Research”，§7 直接推介 World Markets V2 +Options，Table 7 是项目方提供的暂定估计。[1]
- 基准：最优一档 90 张，而盘口有 4 档 ask；采样时间是 9-24；Derive V3 在 10-08 上线后 V2 已无成交；没有采样 RFQ。论文自己也说同类比较需要 V3 的挂单和 RFQ。[1][10][14]
- 核心前提：(i) $25 配置需要 1,052 张可成交的 hedge call。按定义，这是在已经很薄的期权簿里**再找一份同等规模的期权流动性**，等于把问题转移到了 hedge 腿（推断 W40）；(ii) 融资可执行（≈$139k，5%）；(iii) gas = 0；(iv) 压力网格只覆盖 ±20%，准备金约等于网格边界上的现货对冲亏损；(v) $1M 的新 bid 和 θ = 50% 都是假设。[1]
- 工程难点：跨现货、期权、借贷的原子打包；共享成分的去重；贷款期限与期权到期对齐（World 贷款固定 10 天，期权到期日任意）；预言机和结算价一致；Merton 等价只对“到期结算的无追索贷款”严格成立，World 的贷款可清算、可展期，并不满足（论文 §2.2 自己有说明）。[1][3]
- World 自身状态：Beta，合约可升级，源码未公开，期权 “Coming soon”，所以 Table 7 无法独立验证。[5][6][7]
- 社区讨论：用 Exa、Parallel 检索 “Economics of Composable Options”、@worldmarketsinc 和期权相关内容，**没有找到**针对这篇论文的 X 讨论或二手评论（xAI 搜索额度不足，没能使用）。只找到 World Markets 的一般性提及（Mega Terminal 上线、aomi Telegram 集成、一个镜像站片段提到 “recent fud for WM”，内容不可核），都属于二手线索。brief 说的“引发讨论”目前无法证实。[23][24]

---

## 5. 对开发者与 Mantle 的借鉴（全部为 inferred，标明推理）

1. **“期权流动性 = 现货 + 借贷 + 反向期权的函数”**：一条同时拥有现货 DEX 和借贷市场的 L2，在 put-call parity 意义上已经具备期权的两条腿（现货和融资）。真正缺的是“凸性来源”，也就是反向期权或可交易的或有债权（由 §2.1、§3.2 推出）。所以只铺现货和借贷，并不会自动产生期权流动性。
2. **需要的基础设施**（由 §3.2、§4.1、§8 推出）：(a) 同一保证金账本：现货、借贷债权、期权、永续在同一个账户里按情景计算保证金。跨协议的“可组合”不够，论文原话是 “Cross-product composability without shared enforceable margin rights does not solve this problem”；(b) 原子多腿执行和成分去重；(c) **定期、固定利率**的借贷市场，才能提供“到期还 K”的固定现金流，Aave/Morpho 式浮动利率池不能直接充当 B(K,T)；(d) 期权簿或 RFQ 提供反向期权。
3. **对 RWA 的含义**（推断，偏 speculative）：World 已经把 Ondo、xStocks 代币化股票和 Midas、Centrifuge 信贷代币列为可借贷、可做抵押的资产。如果 Mantle 上的 RWA（xStocks、USDY 等）同时有现货簿和定期借贷，理论上可以用“现货 + put + 定期借款”合成 call，或用 covered call = 定期债权 + short put 这类构造。但代币化股票的现货深度、休市时段和公司行动会直接约束式 7 的 min()，并且会让到期结算语义不一致。
4. **定期借贷债权计入保证金（98%）**：对 Mantle 上同时有借贷和衍生品的协议，这是一个可借鉴的资本效率参数设计。代价是论文自己说的错向风险：衍生品亏损时，借贷债权也要在同一情景下被打折。
5. **评估方法可复用**：容量 = min(对冲期权量, 可负担的现货量, 融资, 剩余风险)；准备金主要由压力网格边界决定。Mantle 评估任何期权 venue 提案时，都可以要求对方给出这四个量的实测值，而不是汇总的 TVL 或成交量比值（例如 50.5x）。

---

## 外部调研 / 用户资料中被修正的地方
- 外部调研（R2）说“没有取得 Drive 文章的标题和正文”。本路已读到全文：标题为《The Economics of Composable Options Markets》，作者 World Markets Research，2026-10，12 页。
- 外部调研用 Alea 的 Q3 数据，称 Derive 占链上期权**权利金**的 90.4%。论文的 86.8% 是 10-12 时点的 30 天**名义成交**份额，口径不同，不能互相印证。当前 DefiLlama 名义口径约为 83.7%。
- 外部调研称“Derive 最新 SDK 已指向 V3”。补充更新：DefiLlama 记录 Derive V3 于 2026-10-08 上线（从 Derive Chain 迁到 Ethereum L1），V2 期权最近一周没有成交。论文用的 V2 盘口因此是历史基准。
- brief 说论文“最近引发讨论”：没有找到一手或二手的讨论记录，暂时不能作为页面事实。
- 论文 §1 用 Derive [11,12] 支撑“RFQ execution”，这两篇引文都没有讲 RFQ（引用不精确，RFQ 本身存在）。
- 论文引用的 docs.world.inc/essentials/market-structure 已经重定向到 “Order books + RFQ” 页。

---

## 来源
1. **PRIMARY** World Markets Research,《The Economics of Composable Options Markets》, 2026-10, 12 pp（本地 research/references/world-markets-composable-options.txt / .pdf；原链接 https://drive.google.com/file/d/1_BQFFAVxBYwypmjQ22Coju5QmXzoEJVn/view）。证明论文的全部论点、数字与假设。访问于 2026-10-16。
2. **PRIMARY** World docs, ATLAS – https://docs.world.inc/tl-dr-unique-features/atlas 。证明出借债权按 98% 计入可用保证金、按净敞口计算保证金、贷款为 10 天固定利率。2026-10-16。
3. **PRIMARY** World docs, Trading – https://docs.world.inc/essentials/trading 。证明贷款固定 10 天、固定利率、98%、合约为双边、永续 8 小时结算资金费率。2026-10-16。
4. **PRIMARY** World docs, Order books + RFQ（论文 [22] 的 market-structure URL 重定向到此）– https://docs.world.inc/essentials/order-books-+-rfq 。证明全部市场为 CLOB、RFQ 集成进订单簿、10 天固定利率借贷。2026-10-16。
5. **PRIMARY** World docs, Options – https://docs.world.inc/details/options.md 。证明期权仍是 “Coming soon”。2026-10-16。
6. **PRIMARY** World docs, Technical Overview – https://docs.world.inc/venue/technical-overview.md 。证明部署在 MegaETH、无后端、源码将在达到足够流动性后公开、使用 RedStone 预言机。2026-10-16。
7. **PRIMARY** World docs, Welcome – https://docs.world.inc/readme.md 。证明处于 Beta、Beta 期间合约可升级、“trade at your own risk”。2026-10-16。
8. **PRIMARY** World docs, Legacy/MegaETH 与 Changelog – https://docs.world.inc/legacy/megaeth.md ，https://docs.world.inc/changelog/readme.md 。证明 MegaETH 页已归入 Legacy、2025-03 MegaETH 测试网私测、Zellic 审计。2026-10-16。
9. **PRIMARY** World Markets 官网 – https://about.world.inc/ 。证明团队成员、“on Ethereum”和“Trade Coming Soon”字样、RWA 上架清单、98%、费率 5/10 bps。2026-10-16。
10. **PRIMARY**（第三方数据）GeorgL0ngGamma gist – https://gist.github.com/GeorgL0ngGamma/4e00c477cb66424b9458827f8b3bec44 （API：https://api.github.com/gists/4e00c477cb66424b9458827f8b3bec44 ；liquidity.json revision c90424c179c89159c46995b9d4286e2cc1a408e2）。证明 ETH-20261002-2700-C 的 Derive 最优档为 67.2×90 / 63.3×82.8、采样于 2026-09-24、数据仅为可见深度。2026-10-16。
11. **PRIMARY** Blockscout, Ethereum block 26189586 – https://eth.blockscout.com/api/v2/blocks/26189586 。证明区块时间为 2026-10-14T08:36:59Z。2026-10-16。
12. **PRIMARY** DefiLlama API overview/dexs – https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true 。证明当前 DEX 30 天成交为 $289.2B。2026-10-16。
13. **PRIMARY** DefiLlama API overview/options（dailyNotionalVolume）– https://api.llama.fi/overview/options?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyNotionalVolume 。证明全部期权 30 天成交 $5.074B、Derive V2 $3.362B、Derive V3 $0.884B。2026-10-16。
14. **PRIMARY** DefiLlama API open-interest/derive-v3-options – https://api.llama.fi/summary/open-interest/derive-v3-options 。证明 10-12 的 OI 为 $1,655,413,130，以及 V3 于 10-08 上线的 hallmark。2026-10-16。
15. **PRIMARY** Derive blog, Introducing Cross-Asset Collateral & Portfolio Margin – https://blog.derive.xyz/introducing-cross-asset-collateral-portfolio-margin 。证明 V2 组合保证金、跨资产抵押及其折扣、PMRM 公式。2026-10-16。
16. **PRIMARY** Derive, Variable Rate Lending – https://insights.derive.xyz/variable-rate-lending/ 。证明 Derive 的借贷是浮动利率。2026-10-16。
17. **PRIMARY** BIS Quarterly Review 2025-12 – https://www.bis.org/publications/qr-202512/global-fx-markets-when-hedging-takes-centre-stage 。证明场外 FX 期权 $634B/日（2025 年 4 月）。2026-10-16。
18. **PRIMARY** BIS commentary, OTC IRD turnover April 2025 – https://www.bis.org/publications/202509-commentary-otc-derivatives-0 。证明利率期权 “$245 billion”。2026-10-16。
19. **PRIMARY** FIA ETD Volume December 2025 – https://www.fia.org/fia/articles/etd-volume-december-2025 。证明 2025 年期权 88.65B 张（−50.3%）。2026-10-16。
20. **PRIMARY** Benos, Huang, Menkveld, Vasios, “The Cost of Clearing Fragmentation” – https://www.bis.org/publ/work826.htm 。证明约 $80M/日的成本。2026-10-16。
21. OCC 2015 “Enhancing the Resiliency…”（https://www.theocc.com/newsroom/views/2015/05-07-enhancing-the-resiliency-of-occ-and-the-u-s）返回 403；CME FAQ（https://www.cmegroup.com/articles/faqs/portfolio-margining-onboarding.html）超时。两者都**未核实**。2026-10-16。
22. 外部调研 R2：research/onchain-options-handbook.md。只作线索。
23. 二手：twiscan / twstalker 上 @worldmarketsinc 的镜像（https://twiscan.com/en/x/worldmarketsinc ，https://mobile.twstalker.com/worldmarketsinc）。证明（二手）2026-05-01 “World Markets is now live on Mega Terminal”、aomi Telegram 集成。2026-10-16。
24. 二手：Blockworks 0xResearch 播客页 – https://blockworks.com/podcast/0xresearch/7f6a252e-44cc-11f1-86d9-fb62adbcf968 。证明 World 团队成员 Hersch、Aurelius 在播客中介绍 ATLAS 和 MegaETH 部署（只看了节目简介）。2026-10-16。

---

## 命令与输出
（环境中没有 bash，以下都是 fetch 调用或手算。）

- C1 `GET https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true` → `"total24h":9277639261.01,"total7d":56732032672.72,"total30d":289217081600.49,"total60dto30d":298993588431.21`
- C2 `GET https://api.llama.fi/overview/options?...&dataType=dailyNotionalVolume` → `"total30d":5074065817.93`；Derive Options（V2，Derive Chain）`"total30d":3361632714,"total7DaysAgo":0,"total24h":null`；Derive V3 Options `"total30d":884078883,"totalAllTime":1104800719`。合计 Derive = 4,245,711,597。
- C3 `GET https://api.llama.fi/summary/open-interest/derive-v3-options` → `"hallmarks":[[1791417600,"V3 launch: migration from Derive Chain to Ethereum L1"]]`；`totalDataChart` 中 `[1791763200,1655413130]`（1791763200 = 2026-10-12 00:00 UTC），最新值 `[1792022400,1811645523]`（10-15）。
- C4 `GET https://api.llama.fi/protocol/morpho` → `Error: Response too large (5MB)`；defillama.com 页面返回 403。Aave、Morpho 未核。
- C5 `GET https://api.github.com/gists/4e00c477cb66424b9458827f8b3bec44` → files：derive_bridge.py、dry-run.jsonl、dry_run.py、liquidity.json…；liquidity.json：`"sample_start_ms":1790283727000`，ETH-20261002-2700-C：`"derive_public_orderbook":{"levels":{"asks":4,"bids":7},"best_ask":"67.2","best_bid":"63.3"}`，`"buy":{"derive_top":"67.2","derive_size":"90"}`，`"sell":{"derive_top":"63.3","derive_size":"82.8"}`，`"classification":"public_visible_depth_not_firm_rfq_or_executed_trade"`，`"limitation":"No authenticated RFQ quotes were obtained; visible public depth is not guaranteed executable."`
- C6 `GET https://eth.blockscout.com/api/v2/blocks/26189586` → `"height":26189586,"timestamp":"2026-10-14T08:36:59.000000Z","hash":"0x78a1b1e2…e7e9"`
- C7 时间换算（手算）：1,700,000,000 = 2023-11-14 22:13:20 UTC；1,790,283,757 ≈ 2026-09-24 21:02 UTC；1,791,417,600 = 2026-10-08 00:00 UTC。
- C8 手算 BS 结果（N(x) 用 0.5 + φ(0)·x·(1 − x²/6) 加修正；ln 用级数展开）：

| hedge | Δ_ATM | Δ_hedge | 净Δ | 60/净Δ | C_hedge | 价差权利金 | −20% 盯市亏损 | + 摩擦 + 融资 | 论文 4b |
|---|---|---|---|---|---|---|---|---|---|
| +$50 | 0.51381 | 0.40124 | 0.11257 | 533.0 | 47.86 | 21.49 | 35.04 | 35.59 | 35.59 |
| +$25 | 0.51381 | 0.45681 | 0.05700 | 1052.7 | 57.90 | 11.44 | 17.18 | 17.46 | 17.49 |
| +$10 | 0.51381 | 0.49091 | 0.02290 | 2620.5 | 64.60 | 4.75 | 6.75 | 6.86 | 6.88 |

  ATM call 价值 C1 = $69.34。融资：(150,808.54 − q × 价差权利金) × 5% × 7/365 → $0.25/$0.13/$0.05 每张。
- C10 主会话运行结果（2026-10-16，macOS python3）：`python3 research/scripts/wm_check.py` → `50 0.1126 532 5.9 0.3 35.59` / `25 0.057 1052 11.7 0.15 17.49` / `10 0.0229 2620 29.1 0.06 6.88` / `0.89354 0.99995 106413104.45`；argmax 均为 (m=−0.20, vol=0.75, days=7)；总准备金 18932/18395/18034；若 spot −30% 到期，+$50 配置每张亏 $63.30。
- C9 可复现脚本（已由主会话运行，见 C10；文件 research/scripts/wm_check.py）：
```python
from math import log, sqrt, exp, erf
N = lambda x: 0.5*(1+erf(x/sqrt(2)))
S, T, v = 2510.8339, 7/365, 0.5
def call(K, s=S, t=T, vol=v):
    if t <= 0: return max(s-K, 0.0)
    d1 = (log(s/K)+0.5*vol*vol*t)/(vol*sqrt(t)); return s*N(d1)-K*N(d1-vol*sqrt(t))
def delta(K, s=S, t=T, vol=v): return N((log(s/K)+0.5*vol*vol*t)/(vol*sqrt(t)))
for off in (50, 25, 10):
    K1, K2 = S, S+off
    nd = delta(K1)-delta(K2); q = int(60/nd); h = q*nd
    credit = call(K1)-call(K2)
    worst = 0
    for m in [x/100 for x in range(-20, 21, 1)]:
        for vol in (0.25, 0.5, 0.75):
            for days in (7, 3, 1, 0):
                s1, t1 = S*(1+m), days/365
                pv = -call(K1, s1, t1, vol)+call(K2, s1, t1, vol)+nd*(s1-S)
                worst = max(worst, -(pv+credit))
    print(off, round(nd, 4), q, round(q/90, 1), round(158.51/q, 2), round(worst, 2))
print(1-exp(-2.24), 1-exp(-10), 1e9*(exp(-2.24)-exp(-10)))
```

---

## 开放问题
1. DEX 30 天成交为何从论文的 $246.6B（10-12）变成 $289.2B（10-16）？需要拉 DefiLlama 的 dexs totalDataChart，按日加总 9-12 至 10-12 的值来判断。
2. Aave V3 $12.15B、Morpho $5.78B 的在贷余额：需要能处理 >5MB 响应的工具（例如 curl + jq），读取 `currentChainTvls.borrowed`。
3. Table 4b 是否把现货摩擦和融资成本计入准备金？需要作者的脚本，或在 python 中按网格精确跑一遍（C9）。
4. World Markets V2 是否就是“迁往以太坊”的版本？+Options 的时间表？目前只有官网 “on Ethereum / Trade Coming Soon” 和 docs “Options: Coming soon”。
5. OCC $700M/日、54% 和 CME $8.4B 的原文没有打开。
6. gist 作者 GeorgL0ngGamma 与 World Markets 的关系；Derive V2 盘口中 90 张之外 3 档 ask 的数量。
7. X 上对论文的讨论：需要可用的 X 搜索（xAI 额度不足）。

---

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| W1 | 论文题为《The Economics of Composable Options Markets》，署名 World Markets Research，2026-10，共 12 页 | [1] p1 标题与作者行 | observed | |
| W2 | 到期恒等式 C_T − P_T = S_T − K；定价关系 C − P = S − B(K,T) | [1] p1 式 1–2 | observed | |
| W3 | 静态精确复制期权需要凸性来源：反向期权，或具有相同或有支付的债权；普通追索贷款只提供融资腿 | [1] p2 §2.1、p11 §9 | observed | |
| W4 | 到期结算的无追索贷款中，出借人债权 = min(S_T, K) = K − put，借款人权益 = call；论文声明这不等于可清算的 DeFi 贷款内含可交易 put | [1] p2 式 3 | observed | |
| W5 | 合成 call 的 ask = S^a + P^a − B_borrow，bid = S^b + P^b − B_lend | [1] p3 式 5–6 | observed | |
| W6 | 论文示例：合成 call 3.50/4.40 优于原生 3.25/4.80，是假设报价的算术 | [1] p3 §3.1；手算 100.20 + 4.00 − 99.80 = 4.40，99.80 + 3.60 − 99.90 = 3.50 | observed | |
| W7 | 合成深度 ≤ min(现货量, 反向期权量, 融资量)；示例 150/80/60 → 60，加原生 40 共 100 | [1] p3 式 7、Fig.3 | observed | |
| W8 | 共享成分不去重会导致报价深度被重复计算 | [1] p3 §3.2、p7、p10 §8 | observed | |
| W9 | 组合保证金定义为 M(Π) = 情景集合上的最大亏损 | [1] p4 式 9 | observed | |
| W10 | §4.2 示例中，定期债权入账使总资本从 $1.15M 降到 $1.00M（−13.04%） | [1] p4–5 Table 2；0.15/1.15 = 0.1304 | observed | |
| W11 | 3.18x = 9.53/3.00，其中 9.53 = (0.45 + 0.98)/0.15 | [1] p4、p8；notes §3.1 复算 | inferred | |
| W12 | 2.00x = min(9.53, 6)/min(3, 6)；对冲额度 H 降到 $1M 时增益消失 | [1] p8 式 15；notes §3.1 | inferred | |
| W13 | 论文 Table 3 输入：DEX 30 天成交 $246.593B，Aave V3 $12.15B，Morpho $5.78B，期权 $4.881B，Derive $4.236B，Derive V3 OI $1.655B（均为 2026-10-12） | [1] p6 Table 3 | observed | |
| W14 | 50.5x、10.8x、86.8% 是对上述输入的简单比值，论文自承不代表可执行深度或可复用抵押 | [1] p5 式 11–13；复算 50.52/10.83/86.79% | observed | |
| W15 | DefiLlama 上 Derive V3 期权 OI 在 2026-10-12 为 $1,655,413,130，与论文一致 | [14] totalDataChart [1791763200,1655413130]；notes C3 | observed | |
| W16 | 2026-10-16 时 Derive 30 天名义成交约 $4.246B（V2 $3.362B + V3 $0.884B），与论文的 $4.236B 量级一致 | [13]；notes C2 | observed | |
| W17 | 2026-10-16 时全部链上期权 30 天名义成交 $5.074B，Derive 份额约 83.7% | [13]；notes C2 | observed | |
| W18 | 2026-10-16 时 DefiLlama DEX 30 天成交 $289.2B，比论文的 $246.593B 高约 17%，原因不明 | [12]；notes C1、§3.2 | observed | |
| W19 | 论文的 Aave、Morpho 在贷余额：本路因 API 响应过大未能核实，主会话已用 curl 核实一致（见 S2） | notes-worldmarkets §3.2；notes.md S-核查 | observed | |
| W20 | DefiLlama 记录 Derive V3 于 2026-10-08 上线（从 Derive Chain 迁到 Ethereum L1），Derive V2 期权最近一周无成交 | [14] hallmark；[13] Derive Options total7DaysAgo = 0 | observed | |
| W21 | gist 数据显示，2026-09-24 Derive ETH-20261002-2700-C 最优 ask 为 $67.2 × 90、最优 bid 为 $63.3 × 82.8 | [10] liquidity.json；notes C5 | observed | |
| W22 | gist 中的 90/82.8 只是最优一档数量，盘口有 4 档 ask、7 档 bid，没有加总；数据标注为非 firm RFQ 的可见深度 | [10] levels、classification、limitation 字段 | observed | |
| W23 | 定价余量 $1.95 = ask $67.20 − 中点 $65.25 | [1] p7；(67.2 + 63.3)/2 = 65.25 | observed | |
| W24 | 区块 26,189,586 的时间为 2026-10-14 08:36:59 UTC，与论文一致 | [11]；notes C6 | observed | |
| W25 | 现货对冲：40 ETH（5bp 池）+ 20 ETH（1bp 池），参考价 2510.8339，现金 $150,808.54，其中费用 + 冲击 $158.51 | [1] p6；60 × 2510.8339 + 158.51 = 150,808.54 | observed | |
| W26 | Uniswap 模拟只部分可复现：论文没有给池地址或脚本，gas 设为 0 | [1] p6、p5 | observed | |
| W27 | 在 7 天、IV 50%、r = 0、K_ATM = S 下，净 delta 0.1126/0.0570/0.0229 可复现 | notes §3.1、C8（手算 0.11257/0.05700/0.02290）；主会话 python 复算一致（C10） | observed | |
| W28 | 532/1,052/2,620 张 = 60 ETH ÷ 净 delta 后向下取整，分别为 90 张的 5.9×/11.7×/29.1× | notes C8；[1] p7 Table 4a；主会话 python 复算一致（C10） | observed | |
| W29 | 每张现货执行成本 $0.30/$0.15/$0.06 = $158.51 ÷ 张数 | [1] p7；notes §2 | inferred | |
| W30 | Table 4b 的每张准备金 $35.59/$17.49/$6.88 可按论文网格精确复算，最坏情景为 spot −20%、IV 75%、剩余 7 天，是纯盯市压力亏损、不含摩擦与融资 | `python3 research/scripts/wm_check.py` 输出（notes C10，2026-10-16 主会话运行） | observed | |
| W31 | 三种配置的合计准备金都约 $19k，原因是对冲现货都约 60 ETH，且网格边界固定在 −20% | 由 W30 推出；[1] p8 Fig.5 | inferred | |
| W32 | 每张融资成本 $0.25/$0.13/$0.05 = 约 $139k × 5% × 7/365 ÷ 张数 | [1] p7–8 Table 4c；notes C8 | inferred | |
| W33 | 立即成交比例 1 − e^{−Q/µ}：Q = $224k 时 89.354%，Q = $1M 时 99.995%，每 $1B 需求多 $106.4M，θ = 50% 时新增 $53.2M | [1] p8–9 式 16–18；notes §3.1 复算；主会话 python 复算一致（C10） | observed | |
| W34 | Q_D = $224k 来自历史 bid 82.8 张 × 行权价 $2,700（约 $223.6k）；Q_U = $1M 是假设 | [1] p6 Table 3、p8 | inferred | |
| W35 | µ = $2M 时 77.69%/95.02%，多 $173.3M，新增 $86.7M | [1] p9；1 − e^{−1.5}、1 − e^{−3} 复算 | inferred | |
| W36 | 论文自承 hedge call 的可得数量和价格是假设，例如 $25 配置需要 1,052 张可成交的 hedge call | [1] p6–7 | observed | |
| W37 | Table 7 / Fig.8 的资本占用对比（如 covered call：Derive $19k，World V2 $7k）是“provisional supplied estimates” | [1] p10 Table 7、p11 Fig.8 图注 | observed | |
| W38 | 摘要写“6–12x increase in top of book liquidity is possible”，正文把同一数字限定为“conditional quotation capacity”，措辞强于正文 | [1] p1 摘要与 p5 §5.3 对比 | inferred | |
| W39 | 论文的比较基准是已迁移场所（Derive V2）的历史最优一档挂单，不是 Derive V3 的盘口或 RFQ 深度 | 由 W20、W22 与 [1] p5、p10 推出 | inferred | |
| W40 | 合成路由把“缺期权流动性”的问题部分转移到 hedge 期权腿：静态或价差路径的容量受反向期权供给约束 | 由 [1] p3 式 7、p7“decisive empirical input”推出 | inferred | |
| W41 | World Markets 文档写明出借债权按 98% 计入可用保证金 | [2] Calculation Details；[3] Loans；[9] | observed | |
| W42 | World Markets 的贷款固定 10 天、期间固定利率，全部市场（含借贷）为 CLOB，RFQ 集成在订单簿中 | [3]、[4] | observed | |
| W43 | World Markets 是现货、永续、借贷合一的全链上交易所，风险引擎为 ATLAS，文档写明部署在 MegaETH | [6]、[7] | observed | |
| W44 | World Markets 处于 Beta：合约可升级，源码在“达到足够流动性后”才公开 | [7]、[6] | observed | |
| W45 | World Markets 的期权功能未上线，文档 Options 页写“Coming soon.” | [5] | observed | |
| W46 | 没有找到 World Markets V2 +Options 已发布的一手证据；官网标注“on Ethereum”“Trade Coming Soon”，MegaETH 页已归入 Legacy | [9]、[8]、[5] | observed | |
| W47 | World Markets 可能正把 V2 迁往以太坊主网 | 由 W46 推出 | speculative | |
| W48 | World Markets 团队：CEO/联创 Lucas Gaylord，CTO/联创 Moh Rezaei，COO & GC Gareth Rhodes，CBO Joe Cox | [9] 团队栏 | observed | |
| W49 | World 于 2025-03 在 MegaETH 测试网私测，并完成 Zellic 审计 | [8] Changelog | observed | |
| W50 | World Markets 约在 2026-05-01 于 MegaETH 主网上线 Mega Terminal（媒体/镜像报道） | [23] 二手镜像 | speculative | |
| W51 | World 官网列出 Ondo 代币化股票、xStocks、Midas、Centrifuge、XAUT 等 RWA，可作现货、借贷和抵押，多数标的尚未标注 Live | [9] | observed | |
| W52 | Derive V2 有组合保证金（PMRM）和跨资产抵押（初始保证金 ETH 按 80%、BTC 按 75%） | [15] | observed | |
| W53 | Derive 的借贷是浮动利率；论文的增量主张是把定期债权计入保证金 | [16]；[1] p4 §4.1 | observed | |
| W54 | 论文 §1 用 [11,12] 支撑“Derive 有 RFQ”，这两篇引文都没有讲 RFQ | [15]、[16] 正文；[1] p1 | observed | |
| W55 | BIS：2025 年 4 月场外 FX 期权日均成交 $634B | [17] | observed | |
| W56 | BIS commentary 写利率期权“$245 billion”，论文写 $245.8B | [18]；[1] p10 Table 6 | observed | |
| W57 | FIA：2025 年全球期权成交 88.65B 张，同比 −50.3% | [19] | observed | |
| W58 | Benos 等人估算 LCH 卖方承担的清算碎片化成本约 $80M/日 | [20] | observed | |
| W59 | OCC $700M/日、54% 与 CME $8.4B 本次未核实 | notes §3.7、[21] | observed | |
| W60 | 本次没有找到针对该论文的 X 或社区讨论记录 | notes §4 检索记录 | observed | |
| W61 | 只有现货和借贷的链只具备 parity 中的两条腿，期权流动性仍需凸性来源（反向期权或或有债权） | 由 W3、W7 推出 | inferred | |
| W62 | 要实现论文式合成路由，需要同一保证金账本、原子多腿执行与去重、定期固定利率借贷，以及期权簿或 RFQ | 由 [1] p3、p4、p10 §8 推出 | inferred | |
| W63 | Mantle 上的 RWA 若同时有现货簿和定期借贷，可尝试 covered call / 合成 call 类构造，但现货深度、休市和公司行动会约束容量与结算 | 由 W51、W61、W62 推出 | speculative | |

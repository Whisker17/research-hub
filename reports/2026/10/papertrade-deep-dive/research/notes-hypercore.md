# notes-hypercore：HyperCore / HyperEVM 依赖、BBO 操纵事件与上线热度

> 产出说明：子 agent 把本文件写到了它自己的产物目录，主会话已原样搬到 `research/` 下。
> 本路 lane = hypercore，台账前缀 H。调研时间 2026-10-13（UTC+8）。

**一句话总结**：Papertrade 只从 HyperCore 借两样东西：一是每个 EVM 区块构建时的 HyperCore 盘口快照（BBO 预编译 0x…080e，取 bid/ask 中点作为成交价）；二是 HyperCore 上的 USDC 托管与转账（CoreWriter）。“共识验证”只能证明这个价格确实是当时链上的盘口，不能证明它没被操纵。上线约 8 小时后，有钱包在 HL 上把 ETH 盘口推动约 0.12%，从 Papertrade 净提走约 128 万美元。官方 API 显示同一时段 LP 从约 590 万美元跌到约 290 万美元（小时快照）后回升；官方把原因归为上线时 OI 上限过松，随后收紧了上限。热度方面，前 10 小时就产生约 5,640 亿美元名义成交，随后迅速衰减。交易者累计净亏约 3,410 万美元，其中约 2,730 万美元以 USDC 形式分给了 PAPER 质押者，而 PAPER 只铸给亏损者。所以“经济模型不同”和“上线 FOMO”两个判断都有数据支撑，现有数据无法把两者分开。

---

## H-Q1 HyperCore 给 Papertrade 提供了什么

### 1.1 HyperEVM 与 HyperCore 的关系、读预编译、读取语义

**答案**：HyperEVM 合约可以用 staticcall 调用从 0x…0800 起的只读预编译，读取 HyperCore 状态。官方原话是：“The values are guaranteed to match the latest HyperCore state at the time the EVM block is constructed.” 所以读到的是每个 EVM 区块一次的快照，不是连续实时的价格。BBO 0x…080e、Mark 0x…0806、Oracle 0x…0807 三个地址在 Hyperliquid 官方开发者组织的 `hyper-evm-lib` 常量表里能逐一对上。gitbook 页面正文没有逐个列出地址，地址清单在页面附件 L1Read.sol 里，本次没能打开这个附件。

**依据**
- HL 官方文档《Interacting with HyperCore》[2]：
  - 预编译地址从 `0x…0800` 起，正文列出的类别是 perps positions、spot balances、vault equity、staking delegations、oracle prices、L1 block number。
  - 原话：“values are guaranteed to match the latest HyperCore state at the time the EVM block is constructed”。
  - gas = `2000 + 65*(input_len+output_len)`；输入非法时会耗尽传入的 gas。
  - 正文示例用 `0x…0807` 读 perp oracle price。
- `hyperliquid-dev/hyper-evm-lib` 的 `src/common/HLConstants.sol`（main 分支，访问于 2026-10-13，未固定 commit）[8]：
  - `MARK_PX_PRECOMPILE_ADDRESS = 0x…0806`
  - `ORACLE_PX_PRECOMPILE_ADDRESS = 0x…0807`
  - `BBO_PRECOMPILE_ADDRESS = 0x…080e`
  - `PrecompileLib.sol` 中 `bbo(uint64 asset)` 返回 `struct Bbo { uint64 bid; uint64 ask; }`，`markPx` 和 `oraclePx` 各返回一个 `uint64`。
- Papertrade Docs《Pricing: BBO precompile》[1]：
  - 调用方式为 `PRECOMPILE_BBO.staticcall(abi.encode(asset))`，解码为 `(uint64 bid, uint64 ask)`，成交价 `price = (bid + ask) / 2`。
  - chain 999 上 BTC = 0、ETH = 1。
  - 《Architecture overview》：Mark 0x…0806 “read for analytics and future cross-checks”，Oracle 0x…0807 “read for forward-compat”，执行价只用 BBO。
- `hyper-evm-lib` README [9]：“precompiles return data from the start of the block, so CoreWriter actions will not be reflected in precompile data until next call”。

**不确定之处**
- 官方 gitbook 正文没有直接列出 BBO 预编译。080e 的出处是 hyperliquid-dev 组织的库（作者署名 Obsidian Audits）和 Papertrade 文档，官方附件 L1Read.sol 未能读取。
- gitbook 原文仍写“The testnet EVM provides read precompiles”，措辞已经过时；Papertrade 实际在主网 chain 999 上使用。
- 没有 bash，也没法发 JSON-RPC POST，所以没有用 `eth_call` 实测 080e 的返回值。

### 1.2 双区块与时延

**答案**：HyperEVM 有两种区块：小块每 1 秒一个，gas 上限 3M；大块每 1 分钟一个，gas 上限 30M。同一个小块里所有 Papertrade 交易读到的是同一份 BBO 快照。上线期间 relayer 还会控制提交节奏；官方承认确认时间“non-deterministic”，并把这一点当作防操纵的“天然保护”。

**依据**
- HL《Dual-block architecture》[3]：“Fast block duration is set to 1 seconds with a 3M gas limit. Slow block duration is set to 1 minute with a 30M gas limit”。两种区块的 mempool 相互独立，每个地址只接受接下来 8 个 nonce。
- Papertrade 上线说明推文 [11]：
  - 原话：“some actions like staking distributions run separately in big blocks”。
  - 原话：“the chain will always look as if only half of all possible gas is being used … using more than this would exponentially raise fees”。
  - 提示小额交易确认会更慢。
- 官方 10-11 声明 [10]：“the queue itself provided a natural protection against manipulation as confirming opens/closes had non-deterministic timing”。

**不确定之处**：HyperCore 自己的出块间隔比 1 秒短得多，一个 EVM 小块对应多少个 Core 区块，本次没有在官方文档中找到原话。

### 1.3 CoreWriter：写操作及其延迟

**答案**：CoreWriter 是系统合约 `0x3333…3333`，每次调用烧约 25,000 gas，再发出一条日志，由 HyperCore 当作 action 处理。限价单和 vault transfer 会被链上延迟几秒，目的是防止有人借 HyperEVM 绕过 L1 mempool 获得时延优势。Papertrade 用 CoreWriter 搬运 USDC（资金存放在 HyperCore 现货账本），不用它下单。

**依据**
- HL《Interacting with HyperCore》[2]：“To prevent any potential latency advantages for using HyperEVM to bypass the L1 mempool, order actions and vault transfers sent from CoreWriter are delayed onchain for a few seconds”。基本调用约 47,000 gas。动作表包括 Spot send（6）、Send asset（13）等。
- Papertrade FAQ《How is it onchain?》[1]：“USDC balances are held entirely on HyperCore … moves USDC through HyperCore via CoreWriter precompile actions”。
- 《Deposits: CREATE2 proxies》[1]：`requestSweep` 发起 Core 转账，`finalizeSweep` 在 “after the Core transfer clears” 之后才入账。

**不确定之处**：原文只说“order actions and vault transfers”会被延迟。spot send / send asset 是否也被延迟，原文没写，所以 H8 只标 inferred。

### 1.4 “共识验证的价格”的含义与边界

**答案**：它能证明的是：这对 bid/ask 确实是该 EVM 区块构建时 HyperCore 上被验证者共识确认的盘口，中间没有链下签名者或预言机委员会。它不能证明的有三点：
1. 这个盘口没被短暂扭曲。
2. 中点上真有可成交的量。
3. 这个价格适合给远大于源市场成交量的合成敞口结算。

Hyperliquid 自己做保证金和清算时并不用原始 BBO mid，用的是 mark price。

**依据**
- Papertrade 《Pricing: BBO precompile》[1]：“The BBO precompile is consensus-verified HyperCore state … No price signer and no oracle committee”。同一页的《No deviation breaker》段：“PriceOracle reverts if the precompile returns zero or a crossed book (ask < bid), but it has no maximum-deviation, time-weighted-price, or lookback breaker. A non-zero, uncrossed but manipulated BBO can therefore be accepted for execution.”
- HL《Robust price indices》[4]：
  - Mark price 是三项的中位数：①oracle + 150 秒 EMA(HL mid − oracle)；②HL 的 best bid / best ask / last trade 三者中位数；③Binance、OKX、Bybit、Gate、MEXC 永续 mid 的加权中位数。
  - 原话：“used for margining, liquidations, triggering TP/SL”，约每 3 秒更新一次。
- HL《Oracle》[5]：oracle price 由验证者每 3 秒发布，是多家 CEX 现货 mid 的加权中位数，再按质押权重取中位数。BTC 这类主要流动性在 HL 之外的资产不计入 HL 现货价格。

**不确定之处**：Papertrade 的爆仓触发价同样用 BBO mid（《Liquidations》[1]），而不是 HL 的 mark。两种价格在压力行情下会偏离多少，本次没有实测数据。

### 1.5 tick size 与 1 tick 对应多少 bps

**答案**：HL 永续价格最多 5 位有效数字，整数价格总是允许。按 2026-10-12 16:39 UTC 的参考价（CoinGecko 聚合价，不是 HL 盘口）：
- BTC ≈ $82,785，tick = $1 ≈ 0.12 bps。
- ETH ≈ $2,529，tick = $0.1 ≈ 0.40 bps。

单边挂单改善 1 tick，mid 只移动半个 tick：ETH 约 0.2 bps，正好等于 Papertrade 的 0.2 bps 死区。

**依据**
- HL《Tick and lot size》[7]：“Prices can have up to 5 significant figures, but no more than MAX_DECIMALS − szDecimals decimal places (MAX_DECIMALS = 6 for perps) … Integer prices are always allowed”。
- CoinGecko simple price [27]：BTC 82,785、ETH 2,529.17，last_updated_at = 1791823178。
- Papertrade《Risk》[1]：“The natural BBO spread on BTC and ETH is tight but non-zero … simply sitting on the inside changes the best bid or best ask, which moves the BBO mid by a tick or two”。

**不确定之处**
- 没有拿到 HL 盘口的典型价差（info API 只接受 POST）。“价差很紧”只有 Papertrade 文档定性的一句话。
- 若某个 szDecimals 让小数位限制更紧，tick 会更粗；在上述价格下，起约束作用的是 5 位有效数字。

### 1.6 grok 说法逐条核对，以及与其他 EVM 链的对照

| grok 说法 | 判断 | 依据 |
|---|---|---|
| “不借撮合，只借价格发现” | 基本对，但不完整：USDC 托管与出入金也依赖 HyperCore（CoreWriter） | [1] FAQ / Architecture |
| “实时” | 需要限定：是每个 EVM 区块（小块 1 秒）一次的快照，再加上 relayer 排队，确认时间不确定 | [2][3][10][11] |
| “几乎免费” | 基本对：一次 BBO 读约 8,240 gas（2000 + 65×(32+64)），用户侧 gas 由 relayer 付 | [2][1] Quick start |
| “共识验证” | 来源层面对，但不等于抗操纵或公允价格 | [1] No deviation breaker、[4] |
| “零滑点、无 spread” | 执行价层面对；成本挪到了盈利端：0.2 bps 死区 + asymmetric impact（最多保留 90%）+ 2% win fee | [1] Asymmetric impact |
| “无 funding” | 文档层面对，但这是产品选择，不是 HyperCore 带来的能力。代价是 house 被动承担多空偏斜（见 H-Q2 的 OI 数据） | [1][6] |
| “BBO mid 非常紧” | 没有一手价差数据；只能给出 tick 下限（ETH ≈ 0.4 bps） | [7][27] |

其他 EVM 链（只对照事实）：Papertrade 文档自己的说法是，在大多数 L1 上价格输入要么信任中心化预言机，要么用又慢又贵的去中心化预言机 [1]。HyperEVM 的特殊之处在于，订单簿撮合引擎就是同一条链共识状态的一部分，所以可以用预编译同步读取。一般 EVM 链的共识状态里没有原生 CLOB，读外部市场价格必须经过 push / pull 式预言机报告（即链下签名者）。最后这句是推论（H10），不展开。

---

## H-Q2 BBO 操纵事件

### 2.1 时间线（UTC）

**答案**：从上线到官方回应，事件可以排成下面的时间线。

| 时间 (UTC) | 事件 | 来源与类型 |
|---|---|---|
| 2026-05-12 20:33 | 官方账号宣布 Papertrade，作者为 @izebel_eth 与 @blurr | [13] 一手 |
| 10-08 起 | 开放预存款；官方 API 的 tvl 从 10-08 约 15:00 开始上升 | [15] 一手 |
| 10-10 09:00 | API 中 TVL 峰值约 $137.9M；截至 14:00 有 11,473 个地址 | [15] 一手 |
| 10-10 09:28 | 上线说明：14:00 UTC 上线，在 HyperEVM 网络升级之后；13:45 暂停存款；单个仓位上限 1,000 万美元，仓位数量不限；每市场每方向浮动 OI 余量 10 亿美元；admin 为 2/3 多签（@izebel_eth、@blurr、@UngusTrade）；合约升级有 7 天 timelock | [11] 一手 |
| 10-10 14:00 | 开放交易；到 15:00 名义成交 $77.9B，OI（多空相加）≈ $10.06B | [15][16] 一手 |
| 10-10 18:46 | 官方排期把 StakerLpRewardCap 从 $5M 调到 $10M，生效时间“shortly after 18:45 UTC, Sat 17th Oct”，间隔正好 7 天，与 Timelock 吻合 | [12] 一手；[1] Contract addresses |
| 10-10 约 22:01–22:03 | The Block（经二手转述）：钱包 0x2025…840e 在 HL 买入约 6,060 ETH，把价格推高约 $3（约 0.12%），之后又卖出约 5,210 ETH。时间写作“6:01–6:03 p.m. ET” | [21][22] 媒体（The Block 原文 403） |
| 10-10 21:00→23:00 | 官方 API 小时快照：LP 从 $5.89M（21:00）到 $4.15M（22:00）再到 $2.90M（23:00）。官方推文 LP 图最低约 $2.4M，横轴“07:06”按 UTC+8 换算正好是 23:06 UTC | [16][14] 一手 |
| 约 1 小时后 | 同一钱包开了 30 个 660x 的 ETH 空单，名义约 $297M，3 小时多后被清算，亏约 $450K | [21] 媒体 |
| 10-11 04:00 | LP 回升到 $4.89M；之后在约 $5M 附近持平 | [16] 一手 |
| 10-11 15:42 | 官方声明：承认“overnight manipulation attempts on btc/eth on the hl bbo”，开始在链上和 relayer 两层收紧 OI cap | [10] 一手 |

**不确定之处**
- The Block 原文无法抓取（HTTP 403），钱包操作细节都来自 TokenPress / Bloomingbit / KuCoin 的转述。
- 时区存在冲突：TokenPress 写 ET，Bloomingbit 没写时区。
- KuCoin 和 Bloomingbit 写的是 HL “spot market”。Papertrade 读的是永续 asset index（BTC = 0、ETH = 1），在现货买入 ETH 不会直接改变永续盘口，这一点可能是转述或翻译错误，未核实。

### 2.2 攻击手法与金额

**答案**
- 手法：先在 Papertrade 上持有大额名义仓位，再在 HL 上主动吃单，把 inside quote 推动约 0.1–0.12%，在被扭曲的 mid 上平仓（或反向操作）。
- 金额（The Block 口径）：存入约 $1.2M，提出约 $2.48M，净提约 $1.28M。HL 上交易约 $231M ETH，手续费约 $52K。Papertrade 侧成交量约 $3.18B。
- 官方说法：该用户之后用新账户“把几乎全部利润还给了 house”，部分用户以保留已刷到的 PAPER 为条件“undo”了操纵交易。The Block 称无法独立核实这些说法。
- 官方没有公布钱包清单、交易哈希或 LP 损失金额。

**依据**：[10] 官方原文；[19] DeFi Prime：“The statement did not identify the wallets, give transaction hashes, or quantify the LP loss”；[21][22] 转述 The Block；[24] Gate 转述交易员 Rune，称有两个钱包、约 $20M 订单、HL ETH 波动 10–20 bps。

**不确定之处**
- “归还利润 / undo”没有链上报告，无法核实。
- LP 的小时级下跌里，有多少来自这个钱包、有多少来自其他赢家，无法区分。
- “两个钱包”与“一个钱包”两种说法并存。

### 2.3 攻击收益与成本的结构（只做结构性说明）

**答案**：单次操纵的收益 ≈ Papertrade 名义 N × 价格偏移 Δ' × impact 系数 s(Δ') × 0.98。其中 Δ' 是扣掉 0.2 bps 死区后的偏移。成本 ≈ 在 HL 推动 Δ 所需的吃单冲击、往返损失和手续费。收益随 N 线性放大；N 只受单仓 1,000 万美元上限（仓位数量不限）和 OI 余量限制，而成本只取决于 HL 盘口深度。所以当 N 远大于 HL 的推价成交额时，攻击就有利可图。

**算例**（按文档参数 [1]：ETH baseRate 10%、rateMultiplier 15,000、referenceNotional $100,000、positionMultiplier 483.979）：
- Δ = 0.12%，扣死区后 Δ' ≈ 0.118%。
- term1 = 1/(0.00118 × 15000) ≈ 0.0565；term2 = 0.1/(0.00118 × 483.979) ≈ 0.175；s ≈ 0.9/1.232 ≈ 0.731。
- 净收益 ≈ N × 0.118% × 0.731 × 0.98 ≈ **8.4 bps × N**。
- N = $10M（单仓上限）时约 $84K；N = $297M 时约 $2.5M。对照 The Block 报道的 HL 手续费约 $52K。
- 不挂成交、只挂 1 tick 的抖动型操纵：ETH 的 mid 约移动 0.2 bps，基本被死区归零；移动 2 tick 时 s ≈ 0.06，几乎没有收益。所以文档里的死区和 impact 曲线能压住“只挂单不成交”的小幅操纵，但压不住“真金白银推价 10 bps 以上 + 超大名义仓位”的组合。
- 交叉核对文档自洽性：BTC 在 1% 偏移下 s ≈ 0.883，与文档“1% move keeps about 88%”一致。

**不确定之处**：算例忽略了几项因素：价格回归的不确定性、1000x 下约 5.2 bps 不利波动就触发 hard bust、relayer 确认时间的随机性，以及 HL 侧真实冲击成本（需要盘口深度数据）。

### 2.4 项目方应对与参数

**答案**：官方采取了三项措施：
1. 在链上和 relayer 两层收紧 OI cap。上线时的策略是“当前 OI + 每方向 $1B 余量，10% 滞回”。
2. 把 StakerLpRewardCap 从 $5M 提到 $10M，10-10 已经排期，计划 10-17 生效。这项是 preplanned，官方没有说与事件有关。
3. 守护者可以永久下架某个市场，或全局暂停开仓。

官方的定位是：操纵“always possible”，目标是让它“almost never profitable”。没有部署偏离熔断，也没有宣布退款机制。

**依据**：[10][11][12]；《Risk》[1]：“These are limits on new per-side exposure, not a $1 billion total-OI ceiling, a loss ceiling, or a guarantee against manipulation profit”。

**不确定之处**：收紧后的 OI cap 具体数值不知道：没有读到链上的 market keeper 交易，官方也没有公布。

### 2.5 事件之外的结构性敞口（推论）

官方 house 数据显示，10-10 15:00 用户净多约 BTC $492M + ETH $733M，等于 house 净空约 $1.23B，而当时 LP 只有约 $4.2M。到 10-12 00:00，净敞口降到约 $98M（BTC 净多 $73.5M、ETH 净多 $25.0M）[16]。没有 funding，也就没有机制去平衡这种偏斜：只要真实价格正常波动 0.34%，这样的净敞口就足以亏掉相当于整个 LP 的金额。这是比 BBO 操纵更常态的偿付压力来源，属于 inferred。

---

## H-Q3 为什么火（市场 / 媒体侧）

### 3.1 团队与背景

**答案**：项目由 Jez（@izebel_eth）和 Blurr（@blurr）构建。白皮书署名是“Jez @izebel_eth / Blurr Refund Contract Deployer”。admin 多签的第三位成员是 @UngusTrade。文档写明没有 VC 份额；本次没有找到任何融资信息。和 Rollbit 的关系，可证实的只有机制层面：impact 曲线改编自 Rollbit 的模型，白皮书也把 Rollbit 列为偿付焦虑的例子。团队成员与 Rollbit 的个人关系没有查到一手证据。

**依据**：[13][11][26]；Papertrade《Asymmetric impact》[1]：“adapted from Rollbit's market-impact model”；上线说明推文 [11]：“papertrade inherits rollbit’s asymmetric fee pnl curve”。

**不确定之处**：搜到一个 X 账号 @Izzybelleth 发过看多 Rollbit 的帖子，和 @izebel_eth 是否同一人无法确认，列为 speculative，不进报告正文。

### 3.2 上线后数据（官方 stats API，一手；截至 2026-10-12 约 16:40 UTC）

API 入口是 `https://exchange.papertrade.xyz/query/protocol/history` 和 `/query/house/history`。这是 DefiLlama 适配器指向的“API behind exchange.papertrade.xyz/stats”[17]。

| 指标 | 数值与时间点 | 口径 |
|---|---|---|
| 预存款地址 / TVL 峰值 | 11,473 个地址（10-10 14:00）；TVL 峰值 $137.9M（10-10 09:00） | `users` 是累计地址数；`tvl` 是协议持有的 USDC |
| 首小时名义成交 | $77.9B（10-10 15:00） | `volume` 累计名义 |
| 前 10 小时 / 24 小时名义成交 | $564.2B（10-11 00:00）/ $678.4B（10-11 14:00） | 同上 |
| 累计名义成交 | $845.6B（BTC $422.1B / ETH $423.5B） | 截至 asOf |
| 分日成交 | 10-10（10 小时）$564.2B → 10-11 $177.3B → 10-12（0–16 时）$104.1B | 由累计值差分得到 |
| 累计用户 / 成交笔数 | 16,715 / 342,929 | — |
| TVL | $104.9M（10-11 00:00）→ $64.9M（10-12 00:00）→ $58.6M | DefiLlama 同期 $58.6M [18] |
| OI（多空相加） | $10.06B（10-10 15:00）→ $4.35B（10-11 00:00）→ $0.45B（10-12 00:00）→ $0.62B（10-12 16:00） | house 的 bl + bs + el + es |
| 交易者累计已实现 PnL | −$34.13M | `traderPnl`，扣费后 |
| 质押者累计 USDC 分红 | $27.26M；其中 10-10 15:00–23:00 就分了约 $23.8M | `stakingRewards` |
| LP | 长期在约 $5M 附近（10-12 16:00 为 $4.98M）；payout queue `q` 始终为 0 | house `lp` / `q` |
| PAPER 供应 / 质押 | 6.164B / 6.096B（98.9% 已质押） | `paperSupply` / `paperStaked` |
| 累计清算 | $25.58B | `liquidation` 列；推测是被清算仓位的名义，口径未确认 |

由这些数据得到的推论：
- 前 10 小时贡献了累计成交的 67%。成交、OI 和 TVL 都在 48 小时内大幅回落，是典型的上线脉冲形态。
- 质押者拿到的分红约等于交易者净亏损的 80%（27.26/34.13）。PAPER 只铸给亏损者且不可转让，所以这部分 USDC 其实是按 PAPER 数量回流给了过去的亏损者。
- PAPER 6.164B ÷ 每美元最高 100 枚，说明符合铸币条件的亏损基数至少约 $61.6M。

**不确定之处**
- API 由项目方运营，没有链上逐项复核（无法发 RPC POST）。
- `users` 的确切定义（存款地址还是交易地址）、`liquidation` 的口径，只能从 DefiLlama 适配器注释和数值推断。
- 媒体数字与 API 有出入，见“被修正的地方”一节。

### 3.3 生态热度背景

**答案**：可以被来源支持的只有以下几点：
- 截至 2026-10-12/13，DefiLlama 上 Hyperliquid L1 链的 TVL 约 $1.08B，Papertrade 的 $58.6M 约占 5.4% [18]。
- 上线时间点是“scheduled hyperevm network upgrade”之后 [11]。
- 媒体称 2026 年全年 DeFi TVL 下降 39%，Hyperliquid 逆势增长约 6.7%（Bitget 新闻转述，二手）。
- Hyperliquid 自身的 HLP 此前多次被价格操纵：2025-03 JELLYJELLY、2025-11 POPCAT 损失约 $4.9M（The Block [28]）。

**不确定之处**：HyperEVM 网络升级的内容、HYPE 价格走势等，没有找到一手来源，不写入报告。

### 3.4 用户的两个判断

**答案**
- 判断 1（经济模型不同）有直接证据：只有亏损才能铸 PAPER，质押者已经拿到约 $27M USDC，相当于把约八成净亏损返还给持币的亏损者，而且早期铸币率最高。这使“亏了也划算”的叙事有实际现金流支撑。
- 判断 2（HyperEVM hype / FOMO）有间接证据：2 天的预存款期就进来 $138M、出现排队拥堵、前 10 小时贡献三分之二的成交、48 小时内 TVL −57%、OI −94%。
- 两者在现有数据里分不开。激励驱动（刷 PAPER）和真实需求，需要地址级别的数据才能区分：留存、对冲刷量比例、用户净付费，见开放问题。

**依据**：[15][16][1]《Staking Dividends》《PAPER mint curve》；[10] 官方称“flipped the stock market’s volume in the first 6 hours”（营销口径，按 1000x 名义计）。

---

## 外部调研 / 用户资料中被修正的地方

1. **grok：“实时”** → 是每个 EVM 区块构建时的快照（小块 1 秒），上线期还要经过 relayer 排队，确认时间不确定 [2][3][10]。
2. **grok：“只借价格发现”** → 不完整。USDC 余额全部存放在 HyperCore，出入金依赖 CoreWriter [1] FAQ。依赖 HyperCore 的有两层：价格和托管。
3. **grok：“共识验证…延迟低、成本低…更贴近真实可成交的中间价”** → 共识只证明来源；mid 不一定可成交；文档明确写了没有偏离熔断，被操纵的 BBO 也会被接受 [1]。HL 自己清算用的是多源中位数的 mark [4]。
4. **grok：“零滑点 + 无资金费率…不吃单…没有 spread”** → 执行价确实是 mid，但成本挪到了盈利端（死区 + impact + 2%）。“无 funding”是产品选择，代价是 house 承担净偏斜：上线首小时 house 净空约 $1.23B，而 LP 只有约 $4.2M [1][16]。
5. **grok：“BBO mid 非常紧（通常只有很小的价差）”** → 没有一手价差数据；ETH 的 tick 下限约 0.4 bps [7]。
6. **GPT 调研：引用 HL 文档“对应 EVM 区块构建时最新的 HyperCore 状态”** → 原文核实无误 [2]，但 GPT 给的 URL 带 `utm_source=chatgpt.com`，应去掉。GPT 对 mark price、funding 页面的转述也与原文一致 [4][6]。
7. **GPT 调研：The Block 链接** → 原文对本工具返回 403，标题和摘要可以确认；正文数字只能经二手转述核对，转述之间有冲突（见下面几条）。
8. **KuCoin（Xiao Bing）：“withdrew approximately $24.8 million”** → 应为约 $2.48M（Bloomingbit 与 TokenPress 都写 $2.48M，且 $2.48M − $1.2M ≈ $1.28M）[22][21][23]。
9. **KuCoin：“open a short position of 30 ETH with 660x … notional $297 million”** → 30 ETH × 660 远不到 $297M；应为 30 个空单，每个约 $9.9M，接近单仓 $10M 上限 [21]。
10. **KuCoin / Bloomingbit：“Hyperliquid spot market”** → Papertrade 读的是永续盘口（asset 0/1），现货交易不能直接移动它，疑为转述错误，未核实 [1]。
11. **KuCoin 快讯：“24 小时累计名义成交 $67.8B”** → 官方 API 的 24 小时值是 $678.4B；Binance Square 写的 $678B 才对。同一篇里的保证金“$202.9M”应为 $20.29M [15][25]。
12. **Gate / ChainCatcher：“LP 超过 $2M 时每 $1 亏损铸 100 PAPER”** → 方向写反了：LP 低于 $2M（含负值）时才是 100 PAPER/$，超过后衰减 [1]《PAPER mint curve》。
13. **官方推文“paid out 25M to stakers”** → 指 USDC。API 在 10-11 15:00 的 `stakingRewards` 为 $24.99M，与之吻合。不是 25M 枚 PAPER [10][15]。

---

## 来源

1. **PRIMARY** Papertrade Docs 全文快照（《What is Papertrade?》《FAQ》《Pricing: BBO precompile》《Risk》《Architecture overview》《Asymmetric impact PnL》《Liquidations》《Deposits: CREATE2 proxies》《PAPER mint curve》《Staking Dividends》《Contract addresses》），https://docs.papertrade.xyz/ （如 /#/how/pricing-bbo、/#/how/risk），本地快照 `research/references/papertrade-docs-2026-10-12.md`，访问于 2026-10-12。证明：定价只用 BBO mid、没有偏离熔断、OI cap 语义、impact 参数、USDC 存放在 HyperCore。
2. **PRIMARY** Hyperliquid Docs《Interacting with HyperCore》 https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm/interacting-with-hypercore （.md 版），访问于 2026-10-13。证明：读取语义原话、预编译 gas、CoreWriter 地址与延迟原因。
3. **PRIMARY** Hyperliquid Docs《Dual-block architecture》 …/hyperevm/dual-block-architecture，访问于 2026-10-13。证明：小块 1 秒 / 3M gas，大块 1 分钟 / 30M gas。
4. **PRIMARY** Hyperliquid Docs《Robust price indices》 …/trading/robust-price-indices，访问于 2026-10-13。证明：mark price 的构造，以及它用于清算。
5. **PRIMARY** Hyperliquid Docs《Oracle》 …/hypercore/oracle，访问于 2026-10-13。证明：oracle 是 CEX 加权中位数，每 3 秒更新。
6. **PRIMARY** Hyperliquid Docs《Funding》 …/trading/funding，访问于 2026-10-13。证明：funding 用于让永续价格贴近 oracle，每小时支付。
7. **PRIMARY** Hyperliquid Docs《Tick and lot size》 …/for-developers/api/tick-and-lot-size，访问于 2026-10-13。证明：5 位有效数字规则。
8. **PRIMARY（准一手）** hyperliquid-dev/hyper-evm-lib `src/common/HLConstants.sol`、`src/PrecompileLib.sol`（main 分支，未固定 commit），https://github.com/hyperliquid-dev/hyper-evm-lib ，访问于 2026-10-13。证明：080e / 0806 / 0807 地址，以及 Bbo 结构 (bid, ask)。
9. hyper-evm-lib README（同一仓库），访问于 2026-10-13。证明：预编译返回区块开始时的数据，CoreWriter 的效果要到下一次读取才可见。
10. **PRIMARY** @papertrade_xyz 2026-10-11 15:42:55 UTC 声明 https://x.com/papertrade_xyz/status/2109308773231911359 （经 api.fxtwitter.com 读取），访问于 2026-10-13。证明：官方承认操纵、收紧 OI cap、LP $5M、向质押者支付 25M、归还利润的说法。
11. **PRIMARY** @papertrade_xyz 2026-10-10 09:28 UTC 上线说明 https://x.com/papertrade_xyz/status/2108852108766437759 ，访问于 2026-10-13。证明：上线时间、OI 余量 $1B、单仓 $10M、多签成员、大块用途。
12. **PRIMARY** @papertrade_xyz 2026-10-10 18:46 UTC https://x.com/papertrade_xyz/status/2108992674187354553 ，访问于 2026-10-13。证明：StakerLpRewardCap 从 $5M 调到 $10M，10-17 生效。
13. **PRIMARY** @papertrade_xyz 2026-05-12 公告 https://x.com/papertrade_xyz/status/2054299056445472890 （搜索结果中的 fxtwitter JSON），访问于 2026-10-13。证明：团队为 @izebel_eth 与 @blurr。
14. **PRIMARY** [10] 所附 LP 余额图 https://pbs.twimg.com/media/HUXEkrNaoAA842x.jpg ，访问于 2026-10-13。证明：10-11（图中时区）LP 从约 $5M 跌到约 $2.4M 后回升到约 $5M。
15. **PRIMARY** Papertrade 官方 stats API `https://exchange.papertrade.xyz/query/protocol/history?interval=1d|1h`，asOfMs 1791823169000 / 1791823229000，访问于 2026-10-13。证明：成交量、用户数、TVL、traderPnl、stakingRewards、PAPER 供应。
16. **PRIMARY** Papertrade 官方 stats API `https://exchange.papertrade.xyz/query/house/history?interval=1d|1h`，asOfMs 1791763199999 / 1791820799999，访问于 2026-10-13。证明：LP、多空 OI、队列 q 的时间序列。
17. DefiLlama dimension-adapters `helpers/papertrade.ts`、`fees/papertrade.ts`（master 分支），https://github.com/DefiLlama/dimension-adapters ，访问于 2026-10-13。证明：API 来源与各列语义（第三方注释）。
18. DefiLlama API `https://api.llama.fi/v2/chains`（Hyperliquid L1 tvl 1,080,782,526）与 `https://api.llama.fi/tvl/papertrade`（58,599,796），访问于 2026-10-13。证明：生态 TVL 规模与 Papertrade 的占比。
19. DeFi Prime《Papertrade Tightens OI Caps After BBO Manipulation Attempts》 https://defiprime.com/papertrade-tightens-caps-after-bbo-manipulation ，访问于 2026-10-13。媒体报道；证明：官方声明没有给出钱包、哈希和损失金额。
20. The Block《Trader nets $1.28 million on new 1,000x exchange Papertrade by moving Hyperliquid's ETH prices》 https://www.theblock.co/news/defi/2026-10-11-trader-nets-1-28-million-on-new-1000x-exchange-papertrade-by-moving-hyperliquids-eth-prices-418239 ，访问于 2026-10-13，HTTP 403，只拿到标题和描述。
21. The Token Press《Papertrade Tightens Risk Limits After $1.28M Pricing Incident》（2026-10-12 00:11 UTC）https://www.thetokenpress.com/article/papertrade-tightens-risk-limits-after-1-28m-pricing-incident-11759d20 ，访问于 2026-10-13。二手转述 The Block：钱包 0x2025137a…840e、$231M、$52K、$3.18B、30 个空单。
22. Bloomingbit（Suehyeon Lee）https://en.bloomingbit.io/feed/news/121985 ，访问于 2026-10-13。二手转述 The Block：6,060 / 5,210 ETH，存入 $1.2M、提出 $2.48M，LP 从 $5M 到 $2.4M。
23. KuCoin 新闻（Xiao Bing）https://www.kucoin.com/news/flash/papertrade-suffers-1-28m-loss-on-launch-day-due-to-exploitation ，访问于 2026-10-13。二手，含笔误。
24. Gate News（转述 PANews / 交易员 Rune）https://www.gate.com/news/detail/papertrade-documentation-discloses-bbo-manipulation-risk-two-wallets-24881744 ，访问于 2026-10-13。二手：两个钱包、约 $20M 订单。
25. KuCoin / Binance Square / Gate 快讯（$67.8B 与 $678B、$202.9M 等），见正文 URL，访问于 2026-10-13。二手，用于纠错。
26. **PRIMARY** Martingaler 白皮书 https://docs.papertrade.xyz/martingaler-whitepaper.pdf （本地 txt），访问于 2026-10-12。证明：作者署名为 Jez @izebel_eth 与 Blurr，并把 Rollbit 列为偿付焦虑的例子。
27. CoinGecko simple price API https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd ，last_updated 1791823178（2026-10-12 16:39 UTC），访问于 2026-10-13。聚合参考价，不是 HL 盘口。
28. The Block《Hyperliquid pauses deposits and withdrawals amid POPCAT trading scheme speculation》（2025-11-12）https://www.theblock.co/news/defi/2025-11-12-hyperliquid-pauses-deposits-withdrawals-popcat-trading-scheme-speculation-378606 （搜索结果全文），访问于 2026-10-13。媒体：HLP 损失约 $4.9M，此前还有 JELLYJELLY 事件。

---

## 命令与输出

- 没有 bash，也无法发 JSON-RPC POST，所以**没有链上 `eth_call`**：080e 返回值、OI cap 当前值、合约源码都未实测。
- `GET https://exchange.papertrade.xyz/query/protocol/history?interval=1d` 摘录：
  - `startMs = 1791244800000`（2026-10-06 00:00 UTC），每个 bucket 记录的是区间结束时的状态。
  - `volume[4..6] = 564230133196 / 741490668334 / 845505068473`
  - `traderPnl[6] = -34122032`；`stakingRewards[6] = 27249135`；`users[6] = 16714`；`paperSupply[6] = 6163626491`
  - `asOfMs = 1791823169000`（10-12 16:39 UTC）
- `GET …/protocol/history?interval=1h`：`startMs = 1791324000000`（10-06 22:00 UTC）。
  - idx 87（state 10-10 14:00）`users = 11473`
  - idx 82（state 09:00）`tvl = 137884850`
  - idx 88（state 15:00）`volume = 77924986406`
  - idx 111（state 10-11 14:00）`volume = 678425007116`
  - idx 112（state 10-11 15:00）`stakingRewards = 24988911`
- `GET …/house/history?interval=1h`：`baseTimeMs = 1791388800000`（10-07 16:00 UTC）。
  - idx 70–79（state 10-10 15:00 至 10-11 00:00）`lp = 4.20M, 5.30, 4.99, 5.00, 4.99, 6.52, 5.89, 4.15, 2.90, 3.12M`
  - idx 70：`bl = 3348184165, bs = 2856069584, el = 2292613469, es = 1559244736`
  - `q` 全程为 0
- `GET …/house/history?interval=1d`：idx 4（state 10-12 00:00）`lp = 4282099, bl = 181469913, bs = 107941992, el = 91664310, es = 66687413`。
- 时间换算：2026-10-10 00:00 UTC = 1791590400；官方推文的 `created_timestamp` 1791733375 对应 10-11 15:42:55 UTC，与推文显示一致，可以反证换算正确。
- impact 算例（手算，公式和参数来自 [1]）：ETH 在 Δ' = 0.00118 时 s = 0.9/(1 + 1/(0.00118·15000) + 0.1/(0.00118·483.979)) ≈ 0.731；BTC 在 Δ = 1% 时 s ≈ 0.883，与文档“≈88%”一致。

## 开放问题

1. 用 HyperEVM RPC 实测 `eth_call 0x…080e(abi.encode(1))` 的返回值与精度（应除以 10^(6−szDecimals)），并核对 PriceOracle `0xa9B4…cC2e` 的源码是否已验证。
2. 读取 market keeper 的链上交易，确认事件后各市场、各方向 OI cap 的实际数值与生效区块。
3. 拿到 The Block 原文，并在 HL explorer 核对 0x2025137a136bea7446deba681cbfc7cf1970840e 的逐笔记录，用 Exchange 事件 `PositionsClosed` / `Liquidated` 重建净提取额与 LP 影响。
4. 拿到 HL BTC / ETH 永续的历史 BBO 价差分布（l2Book 或 bbo 流），量化“价差很紧”，以及在压力行情下 mark 与 mid 的偏离。
5. 地址级数据：留存、同一主体多空对冲刷 PAPER 的比例、质押分红在地址间的集中度，用来区分激励驱动和真实需求（与 economics lane 交叉）。
6. CoreWriter 的 spot send / send asset 是否属于“延迟几秒”的动作（文档没有明说）。

---

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| H1 | HyperEVM 读预编译的值对应“EVM 区块构建时最新的 HyperCore 状态” | [2] 《Interacting with HyperCore》Read precompiles 段原文 | observed | |
| H2 | 读预编译地址从 0x…0800 起，gas = 2000 + 65×(输入长度 + 输出长度) | [2] 同页 | observed | |
| H3 | BBO 预编译地址为 0x…080e，返回 (uint64 bid, uint64 ask) | [8] HLConstants.sol `BBO_PRECOMPILE_ADDRESS`、PrecompileLib.sol `struct Bbo`；[1]《Pricing: BBO precompile》 | observed | |
| H4 | Mark 0x…0806、Oracle 0x…0807 各返回一个 uint64；Papertrade 只把它们用于分析或前向兼容，不用于执行 | [8] HLConstants.sol；[1]《Architecture overview》Precompiles 段 | observed | |
| H5 | HL gitbook 正文没有逐一列出 BBO 地址，地址清单在附件 L1Read.sol 里（本次未读到） | [2] 正文只列类别 + `{% file %}` 附件 | observed | |
| H6 | HyperEVM 小块每 1 秒、gas 上限 3M；大块每 1 分钟、gas 上限 30M | [3] 原文 | observed | |
| H7 | CoreWriter（0x3333…3333）的下单和 vault transfer 动作会被链上延迟几秒，以防借 HyperEVM 绕过 L1 mempool 获得时延优势 | [2] CoreWriter 段原文 | observed | |
| H8 | Papertrade 用 CoreWriter 做 USDC 转账，原文没有把这类动作列为被延迟的动作 | 由 H7 与 H9 推出：文档只点名 order actions 与 vault transfers | inferred | |
| H9 | Papertrade 的 USDC 余额全部存放在 HyperCore，经 CoreWriter 出入；依赖 HyperCore 的不只是价格 | [1] FAQ《How is it onchain?》、《Deposits: CREATE2 proxies》 | observed | |
| H10 | 一般 EVM 链的共识状态里没有原生 CLOB，无法像 HyperEVM 这样用预编译同步读取盘口，只能依赖预言机报告 | 由 H1、H9 与 [1]《Pricing》“On most L1s this is a hard problem”推出 | inferred | |
| H11 | Papertrade 的执行价 = (bid + ask)/2，PriceOracle 只拒绝零值和 crossed book，没有偏离、TWAP 或回看熔断 | [1]《Pricing: BBO precompile》No deviation breaker 段 | observed | |
| H12 | “共识验证”只证明价格来源，不证明抗操纵；被操纵但非零、未交叉的 BBO 也会被接受 | 由 H1、H11 推出 | inferred | |
| H13 | HL 自己的保证金和清算用 mark price：oracle+EMA、book 中位数、CEX 永续 mid 三者的中位数，约每 3 秒更新 | [4]《Robust price indices》原文 | observed | |
| H14 | HL oracle price 是验证者每 3 秒发布的 CEX 现货加权中位数，再按质押权重取中位数 | [5]《Oracle》原文 | observed | |
| H15 | 同一 EVM 小块内所有 Papertrade 交易读到同一份 BBO 快照，读数最多每秒更新一次（小块节奏） | 由 H1、H6 推出 | inferred | |
| H16 | 一次 BBO 读取约 8,240 gas，用户侧 gas 由 relayer 支付，所以“几乎免费”基本成立 | 由 H2 推出：2000+65×(32+64)；[1]《Quick start》“relayer covers gas” | inferred | |
| H17 | HL 永续价格最多 5 位有效数字，整数价总是允许 | [7]《Tick and lot size》 | observed | |
| H18 | 按 2026-10-12 参考价，BTC tick $1 ≈ 0.12 bps，ETH tick $0.1 ≈ 0.40 bps | 由 H17 与 [27]（BTC 82,785 / ETH 2,529.17）推出 | inferred | |
| H19 | 不成交、只挂 1 tick 的操纵使 ETH mid 移动约 0.2 bps，基本被 0.2 bps 死区抵消 | 由 H18 与 [1]《Risk》死区 entryPrice/50000 推出 | inferred | |
| H20 | Papertrade 上线时间为 2026-10-10 14:00 UTC，在 HyperEVM 网络升级之后；13:45 暂停存款 | [11] 推文原文 | observed | |
| H21 | 上线参数：单仓名义上限 $10M、仓位数量不限，每市场每方向 OI 余量 $1B | [11]；[1]《Risk》 | observed | |
| H22 | admin 为 2/3 多签（@izebel_eth、@blurr、@UngusTrade），合约升级有 7 天 timelock | [11]；[1]《Contract addresses》Timelock/Multisig | observed | |
| H23 | StakerLpRewardCap 从 $5M 调到 $10M，10-10 18:46 UTC 排期，10-17 18:45 UTC 后生效 | [12] 推文原文 | observed | |
| H24 | 媒体（转述 The Block）：钱包 0x2025…840e 在 HL 买入约 6,060 ETH，把 ETH 推高约 0.12%（约 $3），同时持有 Papertrade 大额仓位 | [21][22]；The Block 原文 403 [20] | observed | |
| H25 | 媒体（转述 The Block）：该钱包存入约 $1.2M、提出约 $2.48M，净提约 $1.28M；HL 交易约 $231M、手续费约 $52K；Papertrade 成交约 $3.18B | [21][22] | observed | |
| H26 | 媒体（转述 The Block）：该钱包随后开 30 个 660x ETH 空单（名义约 $297M），被清算亏约 $450K | [21] | observed | |
| H27 | 官方 API 小时快照：LP 从 21:00 的 $5.89M 降到 23:00 的 $2.90M（10-10 UTC），10-11 04:00 回升到 $4.89M | [16] house 1h idx 76–83 | observed | |
| H28 | 官方推文 LP 图最低约 $2.4M，横轴按 UTC+8 显示，最低点约在 10-10 23:06 UTC | 由 [14] 图（“07:06”处最低）与 H27 的时序吻合推出 | inferred | |
| H29 | 官方 10-11 15:42 UTC 声明承认“overnight manipulation attempts”，称是上线 OI cap 过松所致，已开始在链上和 relayer 两层收紧 | [10] 推文原文 | observed | |
| H30 | 官方称获利用户用新账户“几乎把全部利润还给 house”，部分用户以保留 PAPER 为条件 undo 交易；均未经独立核实 | [10]；[19][21] 称无法核实 | observed | |
| H31 | 官方声明没有公布钱包、交易哈希和 LP 损失金额 | [19] DeFi Prime 原文；[10] | observed | |
| H32 | 在 ETH 价格偏移 0.12% 时，扣死区、impact 和 2% 费用后，攻击者的净收益约为名义 N 的 8.4 bps（N=$297M 时约 $2.5M） | 由 [1]《Asymmetric impact》公式与 ETH 参数手算推出（§2.3） | inferred | |
| H33 | 攻击收益随 Papertrade 名义线性放大，成本取决于 HL 盘口深度；所以 OI cap 是关键控制量，但它不是损失上限 | 由 H32、H21 与 [1]《Risk》“not … a loss ceiling”推出 | inferred | |
| H34 | 上线首小时（10-10 15:00 UTC）用户净多约 $1.23B（house 净空），LP 约 $4.2M；10-12 00:00 净敞口降到约 $98M | [16] house 1h idx 70、1d idx 4（bl−bs、el−es） | observed | |
| H35 | 没有 funding 去平衡多空，house 被动承担偏斜；0.34% 的正常波动就可能亏掉相当于整个 LP 的金额 | 由 H34 与 [1]“No funding costs”推出 | inferred | |
| H36 | 截至 10-10 14:00 UTC，预存款地址 11,473 个；TVL 峰值 $137.9M（10-10 09:00 UTC） | [15] protocol 1h idx 87、82 | observed | |
| H37 | 首小时名义成交 $77.9B，24 小时 $678.4B，截至 10-12 16:40 UTC 累计 $845.6B | [15] protocol 1h idx 88、111、末值 | observed | |
| H38 | 累计成交中，上线前 10 小时占约 67%（$564.2B），之后按日迅速衰减（10-11 $177.3B） | 由 H37 与 [15] 1d volume 差分推出 | inferred | |
| H39 | OI（多空相加）从 $10.06B（10-10 15:00）降到 $0.45B（10-12 00:00） | [16] house 1h idx 70、1d idx 4 | observed | |
| H40 | 截至 10-12 16:40 UTC：用户 16,715、成交笔数 342,929、TVL $58.6M | [15] protocol 1h 末值；[18] DefiLlama 58,599,796 | observed | |
| H41 | 交易者累计已实现 PnL 为 −$34.13M，PAPER 质押者累计获 $27.26M USDC | [15] traderPnl、stakingRewards 末值 | observed | |
| H42 | 质押分红约等于交易者净亏的 80%，且 PAPER 只铸给亏损者，实际形成对亏损者的现金回流 | 由 H41 与 [1]《Paper Emissions》推出 | inferred | |
| H43 | PAPER 供应 6.164B，其中 98.9% 已质押；按最高 100 枚/$ 计，铸币亏损基数至少约 $61.6M | [15] paperSupply / paperStaked；下限由 [1] mint curve 推出 | inferred | |
| H44 | 官方“paid out 25M to stakers”指 USDC，与 API 在 10-11 15:00 的 stakingRewards $24.99M 吻合 | [10] 对照 [15] protocol 1h idx 112 | observed | |
| H45 | 付款队列 q 在整个观测期始终为 0，LP 被 $5M 质押者上限压在约 $5M | [16] q 列全 0、lp 序列；[1]《Staking Dividends》$5M cap | observed | |
| H46 | Hyperliquid L1 链 TVL 约 $1.08B，Papertrade 约占 5.4% | [18] api.llama.fi/v2/chains、/tvl/papertrade | observed | |
| H47 | 团队为 Jez（@izebel_eth）与 Blurr（@blurr），也是白皮书署名作者 | [13]；[26] 白皮书首页 | observed | |
| H48 | 与 Rollbit 的可证实关系仅限机制层面：impact 曲线改编自 Rollbit 模型 | [1]《Asymmetric impact》Inspiration 段；[11] | observed | |
| H49 | @Izzybelleth（发过看多 Rollbit 的帖子）与 @izebel_eth 是同一人 | 只有搜索结果中的 x.com/Izzybelleth/status/1801671582835724334，未核实 | speculative | |
| H50 | KuCoin 文中“提出 $24.8M”是笔误，应为 $2.48M | 由 [21][22] 的 $2.48M 与 $2.48M−$1.2M≈$1.28M 推出 | inferred | |
| H51 | 媒体所说攻击者在 HL “spot market”交易，很可能是转述错误，因为 Papertrade 读的是永续盘口 | 由 [1]（asset BTC=0、ETH=1 为 perp index）与 [22][23] 措辞对比推出；未核实 | speculative | |
| H52 | 快讯中“24h 成交 $67.8B”是笔误，官方 API 的 24 小时值为 $678.4B | [25] 对照 [15] idx 111 | observed | |
| H53 | 媒体说“LP 超过 $2M 时每 $1 亏损铸 100 PAPER”方向写反，实际是低于 $2M 时 100 枚/$ | [24]/Gate 快讯对照 [1]《PAPER mint curve》 | observed | |
| H54 | Hyperliquid HLP 此前也被价格操纵过，例如 2025-11 POPCAT 事件损失约 $4.9M | [28] The Block 报道（媒体） | observed | |
| H55 | 激励驱动和真实需求在现有聚合数据中无法区分 | 由 H38、H42 推出：缺少地址级留存和对冲数据 | inferred | |

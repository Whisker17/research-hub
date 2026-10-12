# 论断台账

每条会出现在 explainer 里的论断，都要在这里有一行。
类型：observed（直接观察到，有一手证据）/ inferred（由证据推出）/ speculative（推测，需在页面上标明）。

本表合并四路调研与主会话的设计综合。前缀对应分册，证据里的 `[n]` 指该分册“来源”一节的第 n 条：
- **M** → `notes-mechanism.md`（机制、链上核对、经济测算）
- **H** → `notes-hypercore.md`（HyperCore 依赖、BBO 操纵事件、上线数据）
- **P** → `notes-peers.md`（同类 vault 对手方永续）
- **X** → `notes-mantle.md`（前序需求与 Mantle 能力对照）
- **D** → `notes.md` §设计综合（主会话推论，均为 inferred / speculative）

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| M1 | 8 个协议合约都是 EIP-1967 代理，共用 ProxyAdmin 0xe79c91…0f8f | [1] 读 EIP-1967 implementation / admin 槽（日志 L1005） | observed | F1、F4 |
| M2 | 所有协议合约的 owner 都是 Timelock 0xB915…EA0F，Timelock 的 owner 是多签 0x6962…1F6 | [1] `owner()` 读取（日志 L1018–1035）；Timelock 事件 `OwnerUpdated(0x6962…)` @47855496 | observed | F1 |
| M3 | Timelock minDelay = 604800 秒（7 天），多签需要 3 人中的 2 人确认 | [1] `minDelay()`=604800；`requiredConfirmations()`=2；`signerOne/Two/Three` | observed | F1 |
| M4 | 合约源码在 Sourcify 上没有匹配，hyperevmscan 无法通过 API 获取，GitHub 上没有官方合约仓库 | [1] Sourcify v2 返回 match:null（日志 L1107–1136）；hyperevmscan 403 / NOTOK；gh search 无结果 | observed | F1 |
| M5 | 恢复开仓只能由 Timelock 执行：多签可以暂停开仓，但调 setTradingPaused(false) 会 revert NotPauseAuthority | [1] `cast call --from` 模拟（日志 L2460–2476） | observed | F1 |
| M6 | 市场下架不可逆：Timelock 调 unpauseMarket 会 revert MarketPermanentlyPaused | [1] 同上 | observed | F1 |
| M7 | 所有 owner 操作都必须经过 Timelock 排期：未排期 execute 会 revert OperationNotScheduled，多签直接调 updateMinDelay 会 revert NotSelf | [1] 同上 | observed | F1 |
| M8 | PAPER 在持币地址之间转账会 revert TransferRestricted() | [1] 模拟 holder 转账（日志 L2446–2453） | observed | F4 |
| M9 | Timelock 可以 setMinter（模拟成功），所有合约都可升级，所以“只有亏损才能铸币”不是写死的 | [1] setMinter 模拟（日志 L2595）；M1、M2 | observed | T、F4 |
| M10 | PaperTokenomics 有一个已禁用的赎回入口：redeem / quoteRedemption 都 revert RedeemDisabled() | [1] 模拟调用（日志 L2191–2228，4byte 解码 0x32aa90b0） | observed | F4 |
| M11 | BatchExecutor 只授权两个 relayer EOA，其中主 relayer 的 nonce 为 306,247，交易小费 1 wei | [1] `authorizedRelayers()` 与交易字段（日志 L2386） | observed | J、F1 |
| M12 | 清算 keeper 的交易小费 1 gwei，是 relayer（1 wei）的 10⁹ 倍；market keeper 的小费为 0 | [1] 交易字段（日志 L2394） | observed | J、F1 |
| M13 | PriceOracle 字节码里包含 0x0807、0x0806、0x080e 三个预编译地址，以及 “BBO unavailable”“Execution price is zero” 等报错字符串 | [1] 实现字节码扫描（日志 L2403） | observed | J、F1 |
| M14 | 2026-10-12 约 17:35 UTC 的盘口快照：BTC bid/ask 价差 1 tick（$1 ≈ 0.12 bps），ETH 价差 1 tick（$0.1 ≈ 0.40 bps） | [1] 区块 48362044 读 BBO：825130/825140、251300/251310 | observed | I、N、F6 |
| M15 | 链上 instrument 参数与文档一致：rateMultiplier 15000，positionMultiplier 814.598 / 483.979，baseRate 0.1，referenceNotional $100K，maxLeverage 1000，maxPosition $10M | [1] 区块约 48361161 读取；[4] /state/trading 第 12–18 列 | observed | B、F1、F2 |
| M16 | 链上 bustBuffer 为 BTC 0.0476%、ETH 0.0481%（文档写“约 5 bps”） | [4] /state/trading 第 16 列 476041580087574 / 481304050180130（wad） | observed | K、T |
| M17 | 174 笔真实盈利平仓按文档公式（死区 → impact → 2% 费用）复算，与链上结算一致，最大相对误差约 1e-13 | [1] PositionsClosed 事件逐笔复算（日志 L2147） | observed | F1、F2 |
| M18 | 1000× BTC 多单在价格反向走 5.24 bps 时触发 bust；6 个样本仓位的 bust 价都与公式一致 | [1] 仓位 bust 价 vs 公式（日志 L2506） | observed | D、K、F1 |
| M19 | 按链上参数，BTC 盈利 0.05% / 0.1% / 1% 时扣费后分别保留 60.7% / 72.4% / 86.4%，ETH 分别保留 54.0% / 67.6% / 85.7% | 由 M15、M17 与文档公式计算（impact.py） | inferred | B、K、F2 |
| M20 | 88.2% 只是扣费后保留比例的渐近上限（0.9 × 0.98），1000× 下常见的小幅盈利保留得更少 | 由 M19 推出 | inferred | B、T、F2 |
| M21 | 多签 2 号交易在 2026-10-11 15:41:44 UTC 提交，提案把 BTC / ETH 的 referenceNotional 从 $100K 提到 $500K / $1M，其他 impact 参数不变 | [1] `transactions(2)` 与 calldata 解码；receipt 0x857d4b1d…（主会话复核） | observed | E、K、F2 |
| M22 | 截至区块 48362838，这项 impact 提案只有 Submission 事件，没有执行，也没有进入 Timelock 排期 | [1] receipt 只有 0xbe411f07 日志；多签此后无事件；对照 1 号交易有 Execution + Timelock 日志 | observed | K、F2 |
| M23 | 如果这项提案生效，0.1% 盈利的保留比例 BTC 从 72% 降到 51%，ETH 从 68% 降到 27% | 由 M19、M21 计算（impact.py PROP 列） | inferred | F2 |
| M24 | staker cap 从 $5M 调到 $10M 的 setMintParams 已于 10-10 18:46 UTC 进入 Timelock 排期 | [1] 多签 1 号交易的 Execution 事件与 Timelock 0x78f3bc93 日志 @48191335；calldata = setMintParams(2M, 10M, 100, 120M) | observed | E、F3 |
| M25 | 账本快照（区块 48361303）：treasury $59.04M、用户余额 $46.53M、锁定保证金 $7.51M、可用 LP $4.979M、totalQueued 0、sideBucket 0 | [1] 固定区块读取（日志 L2233） | observed | D、F3 |
| M26 | 队列只用过一次：开盘后第一个 6 秒内 3 个赢家各 $7.62 排队，一个区块后被付清 | [1] queueNode(1..3) 与开盘事件（日志 L2608） | observed | I、L、F3 |
| M27 | tracked LP 最低 −$22.87，14:26 UTC 越过 $2M，15:05 UTC 越过 $5M（开盘 14:00） | [1] 250,565 条 PaperTokenomics 事件（日志 L2279–2290） | observed | E、L、F3 |
| M28 | LP 越过 $5M 后，共发生 517 次超额划转给质押者，合计 $25.97M；之后 LP 最低 $2.39M | [1] 同上（drain 事件合计；日志 L2513） | observed | L、F3 |
| M29 | 铸币事件合计 6,193,841,515.55 PAPER，与 totalSupply 完全相等 | [1] 事件求和 vs totalSupply @48361301（日志 L2605） | observed | F4、F5 |
| M30 | 铸币基数合计 $109.37M（平仓 $78.68M + 清算 $30.70M）；全期平均 56.6 PAPER/$ | [1] 事件汇总（日志 L2290） | observed | F4 |
| M31 | flat 区间只覆盖 $6.59M 基数，铸出 6.59 亿 PAPER，占供应量的 10.6% | [1] 同上 | observed | L、F4 |
| M32 | 当前边际铸币率约 29.0 PAPER/$（tailProgress = $102.8M） | [1] tailProgressUsd()；文档公式 100·(S/(S+H))² | inferred | L、F4 |
| M33 | 参与 LP 事件的地址 10,796 个，铸币地址 9,872 个；存款代理 16,735 个 | [1] 事件去重（日志 L2290、L2337） | observed |  |
| M34 | 质押量 6.119B，占供应量 98.8% | [1] totalStaked @48361303 | observed | D |
| M35 | LP 累计付给赢家 $77.81M | [1] 事件汇总 | observed |  |
| M36 | 上线时写入的初始 OI cap 为 BTC 1,207,460 枚、ETH 40,032,827 枚，约合每侧 $100B | [1] Exchange 事件 0xa065d6ba @48172307（10-10 13:34 UTC）；按 BTC $82,774.5、ETH $2,498 换算 | observed | D、O、F7 |
| M37 | 0xa065d6ba 是 OI cap 更新事件 | 由数值量级与 /state/trading 第 21–22 列一致、发送方是 market keeper 推出 | inferred | S、F7 |
| M38 | 初始 cap 之后 9.5 小时没有更新；第一次收紧在 10-10 23:34 UTC（BTC 约 $6B），10-11 07:37 收紧到约 $0.4B，之后跟随 OI 频繁更新 | [1] oicap 事件时间序列（13,912 条） | observed | E、J、O、F7 |
| M39 | 10-12 时 cap 只比 OI 高约 $6M–$22M 每侧，远小于文档的 $1B 余量 | [4] /state/trading 第 19–22 列（BTC OI 2387 / 2446，cap 2460 / 2693；ETH OI 60475 / 33313，cap 69122 / 41494）按 HL mid 换算 | inferred | O、F7 |
| M40 | 文档和上线推文说的“OI + $1B 余量”在上线后 9.5 小时内并没有实际执行 | 由 M36、M38 推出 | inferred | T、F7 |
| M41 | Exchange 在 HyperCore 上的 USDC 现货余额为 $59.61M（2026-10-12 17:36 UTC） | [5] spotClearinghouseState | observed |  |
| M42 | 质押者分到的 $27.27M 中，约 $1.3M 来自费用分成，其余来自 LP 超额划转；dev 拿到的费用分成同量级 | 由 M28 与 H41 推出；文档“费用对半分” | inferred | F4 |
| M43 | 白皮书的偿付论证只靠两个独立同分布概率游戏的模拟，没有证明最终偿付 | [3] §3 Examples | observed | I、F3 |
| M44 | 白皮书提出 SRI 参数和 escape valve（排队者可以只取回本金）；Papertrade 部署版本没有 escape valve | [3] §2.3；[2]《Martingaler LP》“out of scope” | observed | F3 |
| M45 | 白皮书的游戏是概率已知的独立同分布赌局，而 Papertrade 的对手方能利用信息、时延和价格操纵 | 由 M43 与 H24–H25（操纵事件）推出 | inferred |  |
| M46 | 零资金启动中排队信用只用了 3 × $7.62；真正的启动资本是开盘第一个小时的亏损 | 由 M26、M27 推出 | inferred | F3 |
| M47 | $5M staker cap 把 LP 压在约 $5M，而每侧名义 OI 上亿美元，所以极端行情下仍依赖队列 | 由 M28、M38、M39 推出 | inferred | F3 |
| M48 | 同一主体开等额多空，在 1% 行情后同时平仓：每枚 PAPER 的成本约为纯亏损的 1/7（BTC，$0.0014 vs $0.0102，flat 区间） | 由 M19 与文档铸币规则计算（impact.py） | inferred | F4、F12 |
| M49 | 对冲刷 PAPER 的实际规模在链上有多大，没有测量 | 本路没有做地址级多空配对分析 | speculative | S、F4 |
| M50 | 用排队债权开仓然后亏掉，会铸出 PAPER 却不带来现金，等于用协议欠款换取收入权 | 文档《Solvency & queue》《PAPER mint curve》对 debt-funded 亏损的定义 | inferred | F4 |
| H1 | HyperEVM 读预编译的值对应“EVM 区块构建时最新的 HyperCore 状态” | [2] 《Interacting with HyperCore》Read precompiles 段原文 | observed | I、N、T、F6 |
| H2 | 读预编译地址从 0x…0800 起，gas = 2000 + 65×(输入长度 + 输出长度) | [2] 同页 | observed | F6 |
| H3 | BBO 预编译地址为 0x…080e，返回 (uint64 bid, uint64 ask) | [8] HLConstants.sol `BBO_PRECOMPILE_ADDRESS`、PrecompileLib.sol `struct Bbo`；[1]《Pricing: BBO precompile》 | observed | F6 |
| H4 | Mark 0x…0806、Oracle 0x…0807 各返回一个 uint64；Papertrade 只把它们用于分析或前向兼容，不用于执行 | [8] HLConstants.sol；[1]《Architecture overview》Precompiles 段 | observed | F6 |
| H5 | HL gitbook 正文没有逐一列出 BBO 地址，地址清单在附件 L1Read.sol 里（本次未读到） | [2] 正文只列类别 + `{% file %}` 附件 | observed |  |
| H6 | HyperEVM 小块每 1 秒、gas 上限 3M；大块每 1 分钟、gas 上限 30M | [3] 原文 | observed | I、N、F6 |
| H7 | CoreWriter（0x3333…3333）的下单和 vault transfer 动作会被链上延迟几秒，以防借 HyperEVM 绕过 L1 mempool 获得时延优势 | [2] CoreWriter 段原文 | observed |  |
| H8 | Papertrade 用 CoreWriter 做 USDC 转账，原文没有把这类动作列为被延迟的动作 | 由 H7 与 H9 推出：文档只点名 order actions 与 vault transfers | inferred |  |
| H9 | Papertrade 的 USDC 余额全部存放在 HyperCore，经 CoreWriter 出入；依赖 HyperCore 的不只是价格 | [1] FAQ《How is it onchain?》、《Deposits: CREATE2 proxies》 | observed | N、T、F6 |
| H10 | 一般 EVM 链的共识状态里没有原生 CLOB，无法像 HyperEVM 这样用预编译同步读取盘口，只能依赖预言机报告 | 由 H1、H9 与 [1]《Pricing》“On most L1s this is a hard problem”推出 | inferred | F6 |
| H11 | Papertrade 的执行价 = (bid + ask)/2，PriceOracle 只拒绝零值和 crossed book，没有偏离、TWAP 或回看熔断 | [1]《Pricing: BBO precompile》No deviation breaker 段 | observed | N、F1、F6 |
| H12 | “共识验证”只证明价格来源，不证明抗操纵；被操纵但非零、未交叉的 BBO 也会被接受 | 由 H1、H11 推出 | inferred | F6 |
| H13 | HL 自己的保证金和清算用 mark price：oracle+EMA、book 中位数、CEX 永续 mid 三者的中位数，约每 3 秒更新 | [4]《Robust price indices》原文 | observed | F6 |
| H14 | HL oracle price 是验证者每 3 秒发布的 CEX 现货加权中位数，再按质押权重取中位数 | [5]《Oracle》原文 | observed | F6 |
| H15 | 同一 EVM 小块内所有 Papertrade 交易读到同一份 BBO 快照，读数最多每秒更新一次（小块节奏） | 由 H1、H6 推出 | inferred | F6 |
| H16 | 一次 BBO 读取约 8,240 gas，用户侧 gas 由 relayer 支付，所以“几乎免费”基本成立 | 由 H2 推出：2000+65×(32+64)；[1]《Quick start》“relayer covers gas” | inferred | I、N、F6 |
| H17 | HL 永续价格最多 5 位有效数字，整数价总是允许 | [7]《Tick and lot size》 | observed | F8 |
| H18 | 按 2026-10-12 参考价，BTC tick $1 ≈ 0.12 bps，ETH tick $0.1 ≈ 0.40 bps | 由 H17 与 [27]（BTC 82,785 / ETH 2,529.17）推出 | inferred | F8 |
| H19 | 不成交、只挂 1 tick 的操纵使 ETH mid 移动约 0.2 bps，基本被 0.2 bps 死区抵消 | 由 H18 与 [1]《Risk》死区 entryPrice/50000 推出 | inferred | F8 |
| H20 | Papertrade 上线时间为 2026-10-10 14:00 UTC，在 HyperEVM 网络升级之后；13:45 暂停存款 | [11] 推文原文 | observed | E |
| H21 | 上线参数：单仓名义上限 $10M、仓位数量不限，每市场每方向 OI 余量 $1B | [11]；[1]《Risk》 | observed | F7 |
| H22 | admin 为 2/3 多签（@izebel_eth、@blurr、@UngusTrade），合约升级有 7 天 timelock | [11]；[1]《Contract addresses》Timelock/Multisig | observed |  |
| H23 | StakerLpRewardCap 从 $5M 调到 $10M，10-10 18:46 UTC 排期，10-17 18:45 UTC 后生效 | [12] 推文原文 | observed | F3 |
| H24 | 媒体（转述 The Block）：钱包 0x2025…840e 在 HL 买入约 6,060 ETH，把 ETH 推高约 0.12%（约 $3），同时持有 Papertrade 大额仓位 | [21][22]；The Block 原文 403 [20] | observed | E、O、F8 |
| H25 | 媒体（转述 The Block）：该钱包存入约 $1.2M、提出约 $2.48M，净提约 $1.28M；HL 交易约 $231M、手续费约 $52K；Papertrade 成交约 $3.18B | [21][22] | observed | O、F8 |
| H26 | 媒体（转述 The Block）：该钱包随后开 30 个 660x ETH 空单（名义约 $297M），被清算亏约 $450K | [21] | observed | F8 |
| H27 | 官方 API 小时快照：LP 从 21:00 的 $5.89M 降到 23:00 的 $2.90M（10-10 UTC），10-11 04:00 回升到 $4.89M | [16] house 1h idx 76–83 | observed | O、F7 |
| H28 | 官方推文 LP 图最低约 $2.4M，横轴按 UTC+8 显示，最低点约在 10-10 23:06 UTC | 由 [14] 图（“07:06”处最低）与 H27 的时序吻合推出 | inferred |  |
| H29 | 官方 10-11 15:42 UTC 声明承认“overnight manipulation attempts”，称是上线 OI cap 过松所致，已开始在链上和 relayer 两层收紧 | [10] 推文原文 | observed | F7 |
| H30 | 官方称获利用户用新账户“几乎把全部利润还给 house”，部分用户以保留 PAPER 为条件 undo 交易；均未经独立核实 | [10]；[19][21] 称无法核实 | observed | S、F7 |
| H31 | 官方声明没有公布钱包、交易哈希和 LP 损失金额 | [19] DeFi Prime 原文；[10] | observed | F7 |
| H32 | 在 ETH 价格偏移 0.12% 时，扣死区、impact 和 2% 费用后，攻击者的净收益约为名义 N 的 8.4 bps（N=$297M 时约 $2.5M） | 由 [1]《Asymmetric impact》公式与 ETH 参数手算推出（§2.3） | inferred | O、F8 |
| H33 | 攻击收益随 Papertrade 名义线性放大，成本取决于 HL 盘口深度；所以 OI cap 是关键控制量，但它不是损失上限 | 由 H32、H21 与 [1]《Risk》“not … a loss ceiling”推出 | inferred | F8 |
| H34 | 上线首小时（10-10 15:00 UTC）用户净多约 $1.23B（house 净空），LP 约 $4.2M；10-12 00:00 净敞口降到约 $98M | [16] house 1h idx 70、1d idx 4（bl−bs、el−es） | observed | I、F8 |
| H35 | 没有 funding 去平衡多空，house 被动承担偏斜；0.34% 的正常波动就可能亏掉相当于整个 LP 的金额 | 由 H34 与 [1]“No funding costs”推出 | inferred | I、F8 |
| H36 | 截至 10-10 14:00 UTC，预存款地址 11,473 个；TVL 峰值 $137.9M（10-10 09:00 UTC） | [15] protocol 1h idx 87、82 | observed | M、F5 |
| H37 | 首小时名义成交 $77.9B，24 小时 $678.4B，截至 10-12 16:40 UTC 累计 $845.6B | [15] protocol 1h idx 88、111、末值 | observed | D、M、F5 |
| H38 | 累计成交中，上线前 10 小时占约 67%（$564.2B），之后按日迅速衰减（10-11 $177.3B） | 由 H37 与 [15] 1d volume 差分推出 | inferred | D、M、F5 |
| H39 | OI（多空相加）从 $10.06B（10-10 15:00）降到 $0.45B（10-12 00:00） | [16] house 1h idx 70、1d idx 4 | observed | D、M、F5 |
| H40 | 截至 10-12 16:40 UTC：用户 16,715、成交笔数 342,929、TVL $58.6M | [15] protocol 1h 末值；[18] DefiLlama 58,599,796 | observed | M、F5 |
| H41 | 交易者累计已实现 PnL 为 −$34.13M，PAPER 质押者累计获 $27.26M USDC | [15] traderPnl、stakingRewards 末值 | observed | D、M、F5 |
| H42 | 质押分红约等于交易者净亏的 80%，且 PAPER 只铸给亏损者，实际形成对亏损者的现金回流 | 由 H41 与 [1]《Paper Emissions》推出 | inferred | M、F5、F12 |
| H43 | PAPER 供应 6.164B，其中 98.9% 已质押；按最高 100 枚/$ 计，铸币亏损基数至少约 $61.6M | [15] paperSupply / paperStaked；下限由 [1] mint curve 推出 | inferred |  |
| H44 | 官方“paid out 25M to stakers”指 USDC，与 API 在 10-11 15:00 的 stakingRewards $24.99M 吻合 | [10] 对照 [15] protocol 1h idx 112 | observed |  |
| H45 | 付款队列 q 在整个观测期始终为 0，LP 被 $5M 质押者上限压在约 $5M | [16] q 列全 0、lp 序列；[1]《Staking Dividends》$5M cap | observed |  |
| H46 | Hyperliquid L1 链 TVL 约 $1.08B，Papertrade 约占 5.4% | [18] api.llama.fi/v2/chains、/tvl/papertrade | observed |  |
| H47 | 团队为 Jez（@izebel_eth）与 Blurr（@blurr），也是白皮书署名作者 | [13]；[26] 白皮书首页 | observed |  |
| H48 | 与 Rollbit 的可证实关系仅限机制层面：impact 曲线改编自 Rollbit 模型 | [1]《Asymmetric impact》Inspiration 段；[11] | observed |  |
| H49 | @Izzybelleth（发过看多 Rollbit 的帖子）与 @izebel_eth 是同一人 | 只有搜索结果中的 x.com/Izzybelleth/status/1801671582835724334，未核实 | speculative |  |
| H50 | KuCoin 文中“提出 $24.8M”是笔误，应为 $2.48M | 由 [21][22] 的 $2.48M 与 $2.48M−$1.2M≈$1.28M 推出 | inferred | T |
| H51 | 媒体所说攻击者在 HL “spot market”交易，很可能是转述错误，因为 Papertrade 读的是永续盘口 | 由 [1]（asset BTC=0、ETH=1 为 perp index）与 [22][23] 措辞对比推出；未核实 | speculative | F8 |
| H52 | 快讯中“24h 成交 $67.8B”是笔误，官方 API 的 24 小时值为 $678.4B | [25] 对照 [15] idx 111 | observed |  |
| H53 | 媒体说“LP 超过 $2M 时每 $1 亏损铸 100 PAPER”方向写反，实际是低于 $2M 时 100 枚/$ | [24]/Gate 快讯对照 [1]《PAPER mint curve》 | observed |  |
| H54 | Hyperliquid HLP 此前也被价格操纵过，例如 2025-11 POPCAT 事件损失约 $4.9M | [28] The Block 报道（媒体） | observed |  |
| H55 | 激励驱动和真实需求在现有聚合数据中无法区分 | 由 H38、H42 推出：缺少地址级留存和对冲数据 | inferred | F5 |
| P1 | Papertrade 文档自述 asymmetric impact 改编自 Rollbit 的 market-impact 模型 | [1]《Asymmetric impact PnL》§Inspiration | observed | F2 |
| P2 | Rollbit 公开的公式只对盈利交易调整平仓价，亏损的手动平仓不受影响 | [3] “market impact formula to set the closing price for winning trades (losing manually-closed trades are unaffected)” | observed | F2 |
| P3 | Rollbit 原式含 base_rate、rate_multiplier^rate_exponent，以及 bet_amount·bet_multiplier/(1e6·\|r\|·position_multiplier) 三项 | [3] P_close(T) 公式原文 | observed | F2 |
| P4 | Papertrade 公式 = Rollbit 原式取 rate_exponent=1，并把 bet_amount·bet_multiplier 换成每个市场固定的 referenceNotional | 由 P3 与 [1]《The formula》对比推出：两式逐项对应，只有这两处不同 | inferred | F2 |
| P5 | 按文档 BTC 参数，1% 和 0.1% 的价格变动分别保留约 88% 和 74% 的原始盈利，手工复算一致 | notes §命令与输出 核算；[1] | observed |  |
| P6 | 若 term2 随名义值变化，大仓位的 haircut 会明显加重；Papertrade 固定之后，对大仓位更宽松 | 由 P3、P5 推出：$1M 名义值、0.1% 变动时 scale 约 0.39，对比 0.754（借用 Papertrade 参数作示意） | inferred | F2 |
| P7 | Rollbit 提供 PnL Cut（只从盈利中抽成）和 Flat Fee（开平仓各 4 bps 加滑点费）两种收费方式 | [4] §Fees | observed |  |
| P8 | Rollbit 持仓超过 8 小时可能按小时收付 funding，8 小时内平仓不收 | [3] Funding Payments 段；[4] | observed |  |
| P9 | Rollbit 的爆仓按开仓时确定的价格成交，亏损以本金为限（hard bust 语义） | [3] “busts… filled at a price predetermined at entry” | observed |  |
| P10 | Rollbit 的价格来自自建的多交易所指数（具体构成未核实） | [4] §Price Formulation | observed | P |
| P11 | Rollbit 是平台自有资金做对手方，没有链上可核实的储备；白皮书称它仍有偿付能力方面的疑虑 | [2] §1.2；[3][4]（没有外部 LP 的说明）；[36] 第三方观察到储备下降（自己声明不对偿付下结论） | inferred |  |
| P12 | gTrade 以定制 Chainlink DON 的多源中位数定价，可过滤单一交易所的异常价格 | [17] Overview “median spot price… filters out outlier price action” | observed | P、F9 |
| P13 | gTrade BTC/ETH 开平仓各 0.035%，固定价差每边 0.005%；Degen 交易对固定 500x，开平仓各 0.02% | [15] §Cryptocurrencies、§Degen（截至 2026-09-30） | observed | F9 |
| P14 | gTrade 当前最高杠杆：加密货币 500x、外汇 1000x，并不存在“Degen 1000x” | [17] Summary；[15] §Degen | observed |  |
| P15 | gTrade 的 price impact = 固定价差 + 流动性 impact（依据 Binance 1% 深度）+ 偏斜 impact，另收 funding 和 borrow | [15] §Price Impact、§Holding Fees | observed | F9 |
| P16 | gTrade 平仓费在开仓后约 10 秒内从 30x 逐块降到 1x，用来防止利用预言机延迟来回交易 | [15] §Closing Fee Decay | observed | F9 |
| P17 | gToken 金库是对手方，抵押率低于 100% 时铸 GNS 卖出补充金库，每天最多铸总量的 0.05% | [16] gToken 段 | observed | F9 |
| P18 | gTrade 的交易激励中，“手续费”类奖励封顶为协议手续费的 75% | [18] Fees 段脚注 | observed |  |
| P19 | GMX v1 的 FastPriceFeed 在快速价格偏离 Chainlink 参考价超过 maxDeviationBasisPoints 时，返回对交易者不利的那个价格 | [9] FastPriceFeed.sol getPrice()（master，未固定 commit） | observed | P、F9 |
| P20 | 2022-09-18 GMX 官方宣布发现 AVAX 参考交易所价格被操纵，并把 AVAX 的 OI 限制为多 $2M、空 $1M | [10] 转引 GMX 推文 1571439325413511169 | observed | P、F10 |
| P21 | 媒体报道 AVAX 攻击者每轮 $4–5M、共 5 轮、净利约 $565k，并称这是“GMX working as designed” | [10] Joshua Lim 的分析（未经独立核实） | observed | F10 |
| P22 | 2025-07-09 GMX v1 因重入导致空头均价没有更新、GLP 的 AUM 被高估，损失约 $42M | [11] CertiK；[14] CoinDesk | observed | F10 |
| P23 | GMX DAO 用金库 $2.0M 补缺口，以 GLV 赔付受影响的 GLP 持有人，媒体报道约 $44M 已分发 | [12] 治理论坛；[13] The Block | observed | F10 |
| P24 | GMX v2 开平仓费 0.04/0.06%，按是否改善多空不平衡区分；price impact 按 OI 不平衡计算且有上限，主流市场负向上限 50 bps | [5] §Open/close fees、§Price impact caps | observed | P、F9 |
| P25 | GMX v2 超出上限的负 impact 在 5 天后才可领回，官方说明这是为了防操纵 | [5] “The delay protects against manipulation” | observed | F9 |
| P26 | GMX v2 在 PnL/池值超过 MAX_PNL_FACTOR_FOR_ADL 时自动减仓盈利仓位，另有 reserve factor 和每侧 OI cap | [6]；[7] | observed | F9 |
| P27 | GMX v2 使用 Chainlink Data Streams，最高 100x，LP 获得 63% 的手续费 | [8] | observed | P、F9 |
| P28 | Jupiter Perps 以 Edge by Chaos Labs 为主价格源、Chainlink 和 Pyth 作校验与后备，每笔交易分两步、由 keeper 执行，最高 250x | [20] Price Oracles、Execution Model、Key Parameters | observed | P、F9 |
| P29 | Jupiter 开平仓各收 0.06%，另有 impact 费和按小时计的 borrow；JLP 获得 75% 的手续费 | [20]；[21]；[22] | observed | P、F9 |
| P30 | Jupiter 官方说明 impact 费是为了防止有人在其他交易所推价后到 Jupiter 开仓获利 | [22] “attackers to target Jupiter Perpetuals by moving prices on other exchanges” | observed | F10 |
| P31 | Ostium 在 2026-04 之后把方向性流量对冲到链下，由关联方和伙伴出资的劣后 buffer 先吸收交易者盈亏，OLP 为优先档 | [23] Vault Overview、Glossary | observed | P |
| P32 | Ostium 使用自建的共识预言机，最高 200x；旧文档为 Stork（RWA）+ Chainlink Data Streams（加密） | [24]；[25] | observed | P |
| P33 | Avantis 于 2026-09-14 更名为 Veranta，合约不变 | [28] | observed | P |
| P34 | Upside Perps 不收开平仓费和 borrow 费，亏损不收交易费，赢家保留 75–95%，最高 250x | [26] | observed | P、F9 |
| P35 | Veranta 文档在 Upside 是否收持仓 funding 上前后矛盾 | [26] “costs nothing to hold” 对比 [27] “Funding still accrues while you hold” | observed |  |
| P36 | Avantis/Veranta 使用 Pyth Pro（Lazer）与 Chainlink 价格，avUSDC 金库作为对手方 | [29] | observed | P、F9 |
| P37 | HLP 是协议金库，负责做市和清算，存款锁定 4 天，不是合成对手方 | [30] | observed | P |
| P38 | 媒体转引 Hyperliquid：2025-03-12 ETH 鲸鱼提走未实现盈利后被清算，HLP 亏损约 $4M，随后 BTC/ETH 最高杠杆降为 40x/25x | [32] | observed | P、F10 |
| P39 | Hyperliquid 现行规则要求提取后剩余保证金至少为 max(初始保证金, 10% 仓位价值) | [31] Unrealized PNL and transfer margin requirements | observed |  |
| P40 | 媒体报道 2025-03-26 JELLY 事件中 HLP 接手空单后未实现亏损约 $13.5M，验证者投票下架并以 $0.0095 结算，基金会赔偿未被标记的用户 | [33]；[34] | observed | P、F10 |
| P41 | 团队 2026-10-11 承认 Papertrade 遭遇 BBO 操纵尝试并收紧 OI cap，自述 LP 约 $5M | [35] DeFi Prime 转述 Papertrade X 帖 | observed |  |
| P42 | Papertrade 的 PriceOracle 没有偏离、TWAP 或回看熔断，OI cap 也不是亏损上限 | [1]《Pricing: BBO precompile》§No deviation breaker；《Risk》 | observed |  |
| P43 | 在这几个同类产品中，Papertrade 是唯一以单一场所盘口中间价、按区块读取作为结算价的，其他都用多源或聚合价格 | 由 P10、P12、P19、P27、P28、P32、P36、P42 推出 | inferred | F9 |
| P44 | Papertrade 放弃了同类产品经事故后加上的偏离熔断、偏斜 impact、funding/borrow、延迟或平仓费衰减、ADL | 由 P16、P19、P24、P25、P26、P42 与 [1]（无 funding、无 spread、只对盈利收费）推出 | inferred | N、T、F9 |
| P45 | 没有外部 LP、以 FIFO 队列替代即时偿付且不设赔付上限，是 Papertrade 在本轮考察的永续产品中独有的设计 | 由 P11、P17、P26、P29、P31、P36、P37 与 [1][2] 推出；检索范围有限 | speculative | F9 |
| P46 | gTrade 铸 GNS 补金库是“代币兜底 LP”的先例，但代币卖给市场；PAPER 则发给亏损者，作为收益权凭证 | 由 P17 与 [1]《Paper Emissions》推出 | inferred | F9 |
| P47 | Papertrade 的队列在效果上相当于“时间维度上的 ADL”：盈利不被削减，只被推迟 | 由 P26 与 [1]《Solvency & queue》推出 | inferred | F9 |
| P48 | Papertrade 2026-10 的事件与 GMX AVAX 2022 同一类型：零 impact + 可被推动的参考价格 + 事后靠 OI cap 止血 | 由 P20、P21、P41、P42 推出 | inferred | F10 |
| P49 | Papertrade 的名义敞口与 LP 之比（单仓 $10M、cap 余量 $1B，对比 LP 约 $5M）比 HLP 事件时更极端 | 由 P40、P41 与 [1]（$10M 单仓、$1B 余量）推出；HLP 规模未核实 | speculative | F10 |
| P50 | Papertrade 的 LP 不分享 2% 费用（全部归质押者和开发者），而 GMX 和 JLP 的 LP 拿大部分手续费 | 由 P27、P29 与 [1]《Staking Dividends》推出 | inferred |  |
| P51 | grok 关于 BBO mid 比 Chainlink 或 TWAP 更适合作预言机的说法，忽略了同类产品都用多源价格来抗操纵 | 由 P12、P19、P28、P42、P43 推出 | inferred |  |
| P52 | 合成永续不在外部开仓并不意味着没有 funding，GMX v2、gTrade、Rollbit 都收取；Papertrade 不收是设计选择 | 由 P8、P15、P24 与 [1] 推出 | inferred |  |
| P53 | Papertrade 没有 LP 份额的铸造与赎回，因此不存在 GMX v1 那种 AUM 操纵攻击面 | 由 P22 与 [1]《The LP and the payout queue》（不可直接存入 LP）推出 | inferred |  |
| X1 | Papertrade 执行价是 HyperCore BBO 预编译（0x…080e）返回的 (bid+ask)/2 | [2] Papertrade Docs《Pricing: BBO precompile》代码段 | observed |  |
| X2 | Papertrade PriceOracle 只拒绝 0 值和交叉盘口，没有偏离、TWAP 或回看熔断 | [2]《Pricing》“No deviation breaker”节 | observed |  |
| X3 | HyperEVM 读预编译的值与 EVM 块构建时最新的 HyperCore 状态一致 | [9] Hyperliquid Docs《Interacting with HyperCore》原文 | observed |  |
| X4 | HyperEVM 快块 1 秒 / 3M gas，慢块 1 分钟 / 30M gas | [10] Hyperliquid Docs《Dual-block architecture》 | observed |  |
| X5 | Papertrade 清算 keeper 由项目方运营，付比其他协议交易更高的 priority fee 以优先上链 | [4]《Liquidations》“Who runs the keepers” | observed |  |
| X6 | Papertrade 的开平仓只能经 relayer 和 BatchExecutor 提交；session key 和 relayer 代付都是应用自建 | [1]《Architecture overview》；[6]《Session keys》 | observed |  |
| X7 | Papertrade 存款用 CREATE2 per-user proxy，sweeper 经 CoreWriter 把 USDC 推进 Exchange 的 HyperCore 账户 | [5]《Deposits: CREATE2 proxies》 | observed |  |
| X8 | Papertrade 跨链入金依赖 Circle CCTP 和 Across（Robinhood Chain 来源） | [5]《Deposits: CREATE2 proxies》“Your own deposit address” | observed |  |
| X9 | Papertrade 抵押品是 HyperEVM 上的 Circle 原生 USDC（0xb883…630f） | [8]《Contract addresses》；[29] Circle 地址表 HyperEVM 行 | observed |  |
| X10 | 在 Papertrade 各依赖中，只有同链原生订单簿价格读取（及 CoreWriter 账本）必须由 HyperCore 提供，其余为应用自建或第三方 | 由 X1、X3、X6、X7、X8 推出：只有价格读取和 CoreWriter 依赖 HyperCore，其余组件均写明是应用或第三方 | inferred | Q、F11 |
| X11 | Mantle 主网 2 秒出块、单一 sequencer、私有交易池 | [11] ASS notes-mantle M4、M5；rollup.json `"block_time": 2`（本次 raw 抓取） | observed | Q、F11 |
| X12 | Mantle op-geth 普通交易按有效小费降序、同价按到达时间排序；Arsia 后才有竞价意义 | [11] ASS notes-mantle M6、M14 | observed | Q、F11 |
| X13 | Mantle 客户端已有白名单 from×to 的 FIFO preconf 车道，排在小费排序交易之前；主网是否启用无一手来源 | [11] ASS notes-mantle M13、M17、M18、M21、M22 | observed | Q、F11 |
| X14 | Papertrade 式“清算付更高小费以先上链”在 Mantle 普通车道可成立，但 preconf 车道交易会排在其前 | 由 X12、X13 推出：小费只在非 preconf 部分决定顺序 | inferred | F11 |
| X15 | Mantle 路线图 2026 H2（未勾选）列出 Flashblocks 亚秒预确认、pure Reth、Prop AMM 撤单优先 | [11] ASS notes-mantle M26–M28 | observed |  |
| X16 | Mantle 官方博客 2025-02-13 宣布加入 Chainlink Scale，Data Feeds 和 Data Streams “Now Live” | [12] 博客原文（搜索缓存）“13 Feb, 2025 … Now Live” | observed | F11 |
| X17 | 上述 Mantle 博客 URL 在 2026-10-13 直接访问返回首页，原文只能从缓存核对 | 命令与输出：raw 抓取 canonical=https://www.mantle.xyz | observed |  |
| X18 | Chainlink 生态页把 Mantle 加入 Scale 记为 2025-02-14，另有 2025-02-07 “Mantle integrates Chainlink Data Feeds and Data Streams” | [13] Chainlink Ecosystem Mantle 页时间线（搜索快照） | observed |  |
| X19 | Chainlink Streams Trade（StreamsLookup / Automation 链上取数）只支持 Arbitrum、Avalanche、Base、BNB、Ethereum、Optimism、Polygon，不含 Mantle | [14] Data Streams Supported Networks “Streams Trade implementation” 节 | observed | Q、F11 |
| X20 | 在 Mantle 上用 Data Streams 只能链下拉取报告、再由链上 VerifierProxy 验证 | 由 X16、X19 推出：Data Streams 已支持 Mantle，但不含 Streams Trade | inferred | F11 |
| X21 | Data Streams v3 的 bid/ask 定义为“Simulated buy/sell impact price at X% liquidity depth”，不是单一盘口最优价 | [15] Report Schema v3 字段表 | observed | F11 |
| X22 | Chainlink 在 Mantle 主网有推送 feed MNT/USD、USDe/USD，偏离阈值 0.5% | [16] data.chain.link Mantle feed 页（搜索快照） | observed |  |
| X23 | Pyth EVM 地址表列出 Mantle 主网 Core（current）0xA2aa501b19aff244D90cc15a4Cf739D2725B5729 | [18] Pyth Contract Addresses EVM 页 Mantle 行 | observed | F11 |
| X24 | Mantle 不在 2026-08-26 Pyth Core 升级名单中，也没有 Pyth Pro 部署 | [18] Upgraded contracts 页 Mantle 行 “— / —”；EVM 页列于 “Chains not in the upgrade” | observed | Q、T、F11 |
| X25 | Pyth 自 2026-08-26 16:00 UTC cutover 起 Hermes 需要 API key | [19] Preparing for the upgrade 原文 | observed |  |
| X26 | Mantle 官方 Oracles 文档列出 API3、Chronicle、ORA、Pyth、RedStone、Supra，没有列出 Chainlink | [20] Mantle Docs《Oracles》 | observed | F11 |
| X27 | Stork 的 EVM 地址表没有 Mantle | [21] Stork Docs EVM contract addresses | observed |  |
| X28 | Mantle 链上没有类似 HyperCore 的原生撮合状态或读预编译 | 由 X11–X13 及 [11] 源码阅读推出：Mantle 客户端改动只涉及 preconf、费用、BVM_ETH、meta-tx，无交易所状态预编译 | inferred | F11 |
| X29 | 未找到 Bybit 价格的官方链上 feed | [33][31] Mantle–Bybit 合作公开内容仅为 Super Portal 和 USDT0；本次检索无结果 | speculative | F11 |
| X30 | Skadi（v1.3.1）是 Mantle 主网必升版本，对齐 Prague，op-geth 包含 EIP-7702 SetCode TX | [23] Mantle Docs Skadi v1.3.1 changelog | observed | Q、F11 |
| X31 | Skadi 主网于 2025-08-27 完成 | [24] Messari Event Date；Bitget 转引 @0xMantleDevs 推文（二手） | observed |  |
| X32 | Mantle 派生规则在 Skadi/Isthmus 之后允许 SetCode 交易 | [11] ASS notes-mantle M11（batches.go:176-189@da45c315d8） | observed |  |
| X33 | Pimlico 的 bundler / paymaster 支持 Mantle（5000）和 Mantle Sepolia（5003） | [26] Pimlico Supported Chains 表 | observed | Q、F11 |
| X34 | ZeroDev 支持 Mantle 主网和测试网；Mantle 官方 AA 页推荐 Etherspot（4337）和 Particle | [27] ZeroDev Supported Networks；[25] Mantle Docs《Account Abstraction》 | observed | F11 |
| X35 | Papertrade 的 session key + relayer 代付模式可原样迁移到 Mantle，gas 由 relayer 用 MNT 支付 | 由 X6、X30、X33 推出：这些是应用自建组件，Mantle 具备 7702 和 4337 基础设施 | inferred | F11 |
| X36 | Mantle 上的 USDC（0x09Bc…0dF9）经 OP 式标准桥从以太坊 USDC 桥接而来 | [30] Mantle token list USDC 条目 optimismBridgeAddress | observed | Q、F11 |
| X37 | Circle 原生 USDC 地址表不含 Mantle | [29] Circle USDC contract addresses 主网表 | observed | F11 |
| X38 | Circle CCTP 支持链和 domain 表不含 Mantle；HyperEVM 是 domain 19 | [28] Circle CCTP Supported blockchains and domains | observed | Q、F11 |
| X39 | Papertrade 依赖的“原生 USDC + CCTP 入金”在 Mantle 缺失 | 由 X8、X36–X38 推出 | inferred | F11 |
| X40 | Mantle 上的 USDT0（0x779D…3736）为 LayerZero OFT，官方页显示当前供应约 $439.91M（2026-10-13 访问） | [31] usdt0.to Mantle 页；[30] token list USDT0 条目 | observed | F11 |
| X41 | Mantle 上的 USDe / sUSDe 经 LayerZero / Stargate 映射 | [30] token list USDe 条目 thirdparty 扩展 | observed |  |
| X42 | Across 的链表（legacy docs）不含 Mantle；0x 第三方表中 Mantle 的 Across 为 ❌、Relay / CCIP / OFT 为 ✅ | [32] Across legacy Supported Chains；0x Supported Chains and Providers | observed | Q、F11 |
| X43 | Mantle Super Portal（与 Bybit 共建）于 2026-07-09 起从 LayerZero 迁到 Chainlink CCIP（MNT 采用 CCT 标准） | [33] Mantle 新闻稿（PR Newswire 2026-07-09）；CoinDesk 同日报道 | observed |  |
| X44 | Mantle 官网显示国库约 $2.34B（As of 2026-10-12 15:47 UTC） | [34] mantle.xyz 首页 Treasury 数字 | observed |  |
| X45 | Mantle 国库可作为 Papertrade 式 LP 的种子资本来源 | 未验证的设想，基于 X44；无任何官方表述 | speculative | F13 |
| X46 | KTX.Finance 以 KLP 池作为交易对手方（GMX 式 vault 对手方永续），部署在 Mantle 等链 | [38] KTX 官网“LPs act as a counterparty to traders” | observed | F12 |
| X47 | 按 DefiLlama 数据，KTX 累计永续成交量 Mantle 占 $6.511B，但 Mantle 上 TVL 只有约 $14.5K | [35] DefiLlama KTX perps 页；three.ws 转引 DefiLlama 榜单（聚合数据，时点不一） | observed | Q、F12 |
| X48 | IntentX（SYMMIO 前端，曾在 Mantle）于 2026-01-08 永久停止交易 | [36] IntentX App 公告 | observed | Q、F12 |
| X49 | Vertex（含 Mantle Edge 实例）于 2025-08-14 停运 | [37] 二手审计文档；未找到一手公告 | speculative | F12 |
| X50 | Mantle 当前永续需求很弱，不足以作为复现的现成需求来源 | 由 X47、X48 推出：现存协议 TVL 很小、多家停运 | inferred | F12 |
| X51 | KTX 和 TsunamiX 在 Mantle 上使用的预言机本次没有一手来源 | [38][35] 官网和聚合页均未说明预言机 | observed |  |
| X52 | 对照结果：同链原生价格状态“缺”（链级）；原生 USDC / CCTP “缺”（取决于发行方）；价格可验证输入、排序、快速跨链“部分有”；AA / 7702 / paymaster、CREATE2 “有” | 由 X10、X14、X20、X28、X35、X39、X42 推出 | inferred | A、C、F11 |
| X53 | Papertrade 那种“攻击者在单一 venue 挂单扭曲 BBO”的攻击面，在改用多源聚合预言机后不直接存在，但会换成报告选择和延迟类风险 | 由 X2、X20、X21 推出：预言机为多源 DON 中位数和签名报告，应用可以选择提交哪份报告 | inferred | F11 |
| X54 | GPT 调研中“Pyth 官方 EVM 部署列表列出 Mantle”一句，引用的链接实为 Mantle 博客，属于引用错配 | [39] GPT 调研 §5.2 原文与链接 | observed | T |
| D1 | Papertrade 可分为价格、执行、账本 / 队列 / 铸币、需求四层，Mantle 只需在价格和执行两层补能力 | 由 X10、X52 推出：只有价格读取依赖 HyperCore 原生，其余为应用自建或第三方 | inferred | A、R、F13 |
| D2 | 在 Mantle 上用签名报告定价时，应先承诺订单、后定价格，并保留多源偏离检查 | 由 X20、X21、X53（报告选择风险）与 P19、P44（同类产品的偏离防线）推出 | inferred | R、F13 |
| D3 | OI cap 应由 LP 的风险预算反推，而不是“当前 OI + 固定余额” | 由 H34、H35、M36、M39 推出：净敞口 / LP 决定亏光 LP 所需的波动幅度 | inferred | R、F13 |
| D4 | 分红前应先扣除已确认负债和压力情景准备，代替固定的 $5M staker cap | 由 M28、M47 推出 | inferred | R、F13 |
| D5 | 清算、价格更新、订单承诺适合放进 Mantle 的维护操作车道（关联 ASS 报告） | 由 M12、X13、X14 推出；research-hub 报告 application-specific-sequencing F9、F11 | inferred | R、F13 |
| D6 | Mantle 版本的抵押品可以考虑 USDT0 或桥接 USDC，因为 Mantle 没有原生 USDC 和 CCTP | 由 X36–X40 推出 | inferred | R、F13 |
| D7 | 在 Mantle 现有 perps 需求很弱的情况下，复制 Papertrade 会更依赖代币激励，必须先测量刷币成本与真实留存 | 由 H38、H42、M48、X50 推出 | inferred | R、F13 |
| D8 | 同链原生订单簿是独立的长期论题，不是 Papertrade 类产品的前提 | 由 X10、X28 推出 | inferred | R、F13 |
| D9 | 在 Mantle 上，1000× 杠杆是否可行，取决于预言机延迟和清算入块延迟的 P95 / P99，而这两项都还没有测量 | 由 M18（5.2 bps 即 bust）、X11、X20 推出；未测量 | speculative | S、F13 |
| D10 | Mantle 用国库给 LP 注入种子资本，可以绕过“零资本启动”的早期偿付风险 | 只是设想，没有任何官方表述（承接 X45） | speculative | F13 |

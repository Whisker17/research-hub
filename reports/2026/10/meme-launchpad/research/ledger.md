# 论断台账

每条会出现在 explainer 里的论断，都要在这里有一行。
类型：observed（直接观察到，有一手证据）/ inferred（由证据推出）/ speculative（推测，需在页面上标明）。

编号前缀对应调研分册：M → [notes-mechanism.md](notes-mechanism.md)，P → [notes-products.md](notes-products.md)，A → [notes-agentic.md](notes-agentic.md)。证据里的 `[n]` 指该分册“来源”一节的第 n 条；`02`、`03`、`R4` 等简称指 [references.md](references.md) 登记的用户资料。“页面”列在写稿时填写。

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| M1 | pump.fun 曲线是带虚拟（synthetic）储备的 Uniswap V2 式恒定乘积 | [1] PUMP_PROGRAM_README @cb188ce；[8] pump.fun/docs/bonding-curve（2026-10-05） | observed | 导语、B |
| M2 | pump.fun Global 初始虚拟代币储备为 1,073,000,000 枚（raw 1073000000000000，6 位精度），不是 1,073,000,191 | [1]；[27] solana-pumpfun.md §1.1 链上解码 | observed | B |
| M3 | 初始虚拟 SOL 储备为 30 SOL；曲线可售 793,100,000 枚；总供应 10 亿枚 | [1] Global 示例 | observed | B、D |
| M4 | 经典曲线 k = 3.219e10 SOL·token，开盘价 2.7959e-8 SOL/token，开盘市值 27.96 SOL | 由 M2、M3 推出：k=30×1.073e9；P₀=30/1.073e9；×1e9 | inferred | B、J |
| M5 | 售罄时真实募得 85.005 SOL，毕业市值 410.88 SOL，全程涨幅约 14.70× | 由 M2、M3 推出：vT_end=2.799e8，vS_end=k/vT_end=115.005，减去 30；与 [27] §1.7 整数模拟一致 | inferred | B、D、J |
| M6 | “$69k 毕业”只是 SOL≈$167.93 时的美元换算，毕业线本身以 SOL/代币数量计 | 由 M5 推出：410.88×167.93≈69,000；[1] 毕业条件里没有价格项 | inferred | J |
| M7 | 需要虚拟储备，是因为纯真实储备 x·y=k 的开盘价为 0，且最后一枚代币价格趋于无穷 | 由 M1 推出：x=0 时 P=0；y→0 时 P→∞；[8] 原文“solves the cold-start problem” | inferred | B、I |
| M8 | 曲线极度前置倾斜：净入 30 SOL 时已卖出 53.65% 供应，最后 25 SOL 只卖出约 7.8% | [27] solana-pumpfun.md §1.8 阶梯表；可由 M4 公式复算 | observed | I、J、F2 |
| M9 | 首块狙击是前置倾斜曲线的数学必然，不是治理问题 | 由 M8 推出：早期单位 SOL 换到的供应最多，抢到第一块的期望收益最高 | inferred | J、F2 |
| M10 | 首笔总支出 1 SOL（1.25% 费）可买到约 34.2M 枚（3.42% 总供应），相对开盘价滑点约 +3.29% | 由 M4、M16 推出：入曲线 1/1.0125=0.987654 SOL，代入公式；与 [27] §1.9 一致 | inferred | |
| M11 | pump.fun 的 `complete` 在 buy 指令末尾 `real_token_reserves == 0` 时置 true，此后曲线不再交易 | [1] PUMP_PROGRAM_README “Bonding curve”节 | observed | J |
| M12 | pump.fun 毕业条件是纯代币数量条件，程序内没有预言机，美元门槛随 SOL 汇率漂移 | 由 M11、M6 推出：条件只涉及 real_token_reserves | inferred | J |
| M13 | four.meme 按计价资产设定募资阈值：18 BNB、12,000 USDT/USD1、60 NVDAB、650 GMEB 等 | [22] four.meme/en/create-token 页（搜索摘要，2026-10-05） | observed | L |
| M14 | four.meme 的 BNB 阈值曾为 24 BNB（如 TST 代币），现为 18 BNB | [22] TST 代币页显示 24 BNB；创建页显示 18 BNB；[21] PoC 注释“reaches 24 BNB” | observed | |
| M15 | Pons V2 的池子预留量 = supply×phantomQuote/(phantomQuote+threshold)，只有阈值与虚拟储备的比值决定进池比例 | [18] ponsfamily.com/docs/v2（2026-10-05） | observed | |
| M16 | pump.fun 曲线阶段总费率 1.25% = 创作者 0.30% + 协议 0.95% + LP 0%，SOL 与 USDC 计价币相同 | [7] pump.fun/docs/fees（2026-10-05） | observed | D、J |
| M17 | pump.fun 创建免费（0 SOL / 0 USDC），毕业收 0.015 SOL | [7]；[1] pool_migration_fee=15000001 lamports | observed | D、J |
| M18 | 迁往 Raydium 时期迁移费为 6 SOL，2025-03-20 PumpSwap 上线后降为 0 | [11] @pumpdotfun 2025-03-20 推文（经 Bitget/Cointelegraph 转引） | observed | E、J |
| M19 | 按市值分档的动态费率自 2025-09-01 20:00 UTC 起适用于曲线和 canonical PumpSwap 池 | [5] FEE_PROGRAM_README @cb188ce | observed | J |
| M20 | 非 canonical PumpSwap 池费率 0.30% = LP 0.25% + 协议 0.05% | [7] | observed | |
| M21 | canonical 池档位：0–420 SOL 市值 125 bps，420 SOL 以上创作者分成跳到 95 bps 并逐档递减到 5 bps（共 25 档） | [27] solana-pumpfun.md §3.4 链上解码；[5] 只确认机制，档位图 fees.png 未逐项核对 | observed | J |
| M22 | 公开 README 里 Global `fee_basis_points=100`、`creator_fee=0` 是旧快照，与现行 95+30 bps 不一致 | [1] Global 示例 vs [7] 费用页；[27] §1.1 链上读到 95 | observed | |
| M23 | 2026-05-21 起 pump.fun 支持 USDC 计价；BondingCurve 增加 quote_mint，字段改名为 virtual/real_quote_reserves | [7]；[2] README “New Bonding Curve Trade Instructions” | observed | L |
| M24 | `create_v2` 使用 Token-2022 mint（decimals=6）并把元数据内嵌在 mint；name≤32、symbol≤13、uri≤200 | [6] COIN_CREATION.md @cb188ce | observed | J |
| M25 | create 与首笔 buy 可放在同一笔交易，即 dev buy | [6] Rust SDK `create_v2_and_buy_instruction`；[27] §2.2 链上样例 | observed | J |
| M26 | 免费创建流程中，coin 可由首个买家（user）代创作者（creator）上链，因此 creator 不必签名 | [1] create 指令说明 | observed | |
| M27 | `migrate` 无许可、幂等，任何人都可迁移已 complete 的曲线 | [1] | observed | J |
| M28 | 迁移后 PumpSwap LP 全部销毁，pump.fun 自己也无法撤池 | [1] “LP tokens … are then burnt”；[27] §2.5 MintTo=Burn=133,094,492,867 | observed | F、J |
| M29 | 迁移时进入 PumpSwap 的代币侧恒为 206,900,000 枚（1e9−7.931e8） | 由 M3 推出；[27] §2.6 三笔样本验证 | inferred | J |
| M30 | 旧 `withdraw` 指令由链下服务器把曲线资金迁往 Raydium，现已禁用 | [1] withdraw 指令说明 | observed | J |
| M31 | 2026-09 抽样到注入 SOL 仅 0.086 / 0.76 / 17.58 的迁移，经典“85 SOL”不再普遍成立 | 仅见于 [27] solana-pumpfun.md §2.6，未找到一手说明 | speculative | J、Q |
| M32 | Mayhem 模式让币以 20 亿枚供应启动，由 agent 交易 24 小时后销毁剩余，可解释抽样币供应 1.926B≠1B | [6] create_v2 含 is_mayhem_mode 与 Mayhem vault；[9] 官方摘要；[10] 二手给出 2B 数字 | inferred | J |
| M33 | Mayhem agent 抽走曲线 SOL 是“低 SOL 毕业”的原因 | 无一手证据；仅由 M31、M32 推测，未验证 | speculative | J、Q |
| M34 | PumpSwap Pool 有 i128 `virtual_quote_reserves`，报价须用 vault+virtual；2026-09-30 起可为负 | [3] PUMP_SWAP_README；[4] NEGATIVE_VIRTUAL_QUOTE_RESERVES.md；[2] | observed | |
| M35 | pump.fun 新增 holder rewards coin，创作者费改为分给持有人；cashback 模式停止新建 | [2] README；[6] is_cashback_enabled 已弃用 | observed | |
| M36 | pump.fun mint authority 是程序 PDA `["mint-authority"]`；铸币权在创建交易内关闭 | [6] 只确认 PDA；“创建交易内关闭”仅见于 [10] BloFin，未找到一手来源 | speculative | |
| M37 | pump.fun 合约层没有反狙击机制，只有 max_sol_cost / min_sol_output 滑点保护 | [1] buy/sell 指令签名；文档未见任何开盘限制 | inferred | J |
| M38 | four.meme 2025-02-11 损失约 $183K，原因是攻击者预建高价 PancakeSwap V3 池、迁移时未校验价格 | [20] SlowMist Hacked；[21] DeFiHackLabs PoC | observed | K、F1 |
| M39 | four.meme 迁移调用的 amount0Min/amount1Min 为 0，约 20 个币以同一手法被攻击 | [21] PoC 注释；smartcontractshacking.com 复述 | observed | K |
| M40 | 04-defects 写的“four.meme Helper3 重入被盗 $183K（违反 CEI）”与安全方复盘不符 | 04-defects-and-optimizations.md §3.1.1 vs [20][21] | observed | R |
| M41 | 两阶段迁移的根本攻击面是“目标池可以被任何人抢先初始化” | 由 M38、M39 推出：攻击不依赖重入，只依赖外部池状态不可信 | inferred | F、K、F1 |
| M42 | four.meme 毕业后 LP 由曲线合约持有不可提取；另有报道称 2025-03 起改为销毁，两说并存 | [23] docs.4.meme 摘要；[26] AiCoin 二手 | observed | |
| M43 | Uniswap v4 用单例 PoolManager，建池只是状态更新而不部署合约；flash accounting 基于 EIP-1153 | [14] Uniswap 文档 architecture | observed | J、K |
| M44 | v4 hook 权限编码在地址最低 14 位：beforeSwap=1<<7，beforeSwapReturnDelta=1<<3；带 ReturnDelta 却没有对应动作位的地址无效 | [12] Hooks.sol @46c6834 | observed | I、I |
| M45 | beforeSwap 可返回 delta 改写 swap 的 specified 数量（不得翻转 exactIn/Out），动态费池还可返回 LP fee 覆盖值 | [12] Hooks.beforeSwap 实现 | observed | K |
| M46 | 用 beforeSwapReturnDelta 在 hook 内实现虚拟曲线、达标后翻转为普通池，在 v4 中技术上可行 | 由 M45、[14]“custom curves”推出 | inferred | K |
| M47 | 目前没有已知生产产品采用“hook 内曲线 + 就地翻转”；Clanker/Zora/Flaunch 不设曲线，Pons V2 是曲线合约 + 毕业铸头寸 | 由 [15][16][17][18] 推出；未穷举检索，有漏检可能 | speculative | K、P |
| M48 | Clanker v4 把全部供应放进单边 Uniswap v4 LP（initial LP），不设 bonding curve | [15] creator-rewards-and-fees.md @e533702 | observed | K |
| M49 | Clanker 协议费固定为 LP fee 的 20%，例如创作者 1% 对应总费率 1.2% | [15] creator-rewards-and-fees.md | observed | L |
| M50 | Clanker MEV 模块：2 区块延迟、狙击拍卖、抛物线衰减费（起始 ≤80%，时长 ≤2 分钟，推荐 80%→5%/30s），所有模块最晚 2 分钟失效 | [15] mev-modules.md、clankermevdescendingfees.md | observed | L、F2 |
| M51 | Zora coin 用 v4 hook 加 Doppler 多曲线头寸发射，Sniper Tax 从 99% 起在 10 秒内衰减 | [17] docs.zora.co/coins | observed | K、L、F2 |
| M52 | Flaunch 开盘 30 分钟单一 tick 固定价、只能买；结束后募得 ETH 变成 spot 下方的买墙，剩余代币转 full range | [16] Flaunch whitepaper/FAQ | observed | K、L |
| M53 | Pons V2 每个 launch 有独立曲线合约；毕业由 graduation executor 把 full-range v4 头寸直接铸进 locker，任何人包括协议都无法提取 | [18] | observed | K、F7 |
| M54 | 按资金路径可分三类：A 曲线→外部 DEX、B 曲线→自有/同计价资产池（原子执行、不经 Router）、C 不设曲线直接发 AMM 头寸 | 由 M30、M27、M38、M48、M52、M53 推出 | inferred | 导语、C、K |
| M55 | 自建毕业目的地 AMM 能把迁移费变成平台收入并消除外部池攻击面 | 由 M18、M27、M41 推出：PumpSwap 免迁移费，canonical 池由程序原子创建 | inferred | K |
| M56 | LP 销毁或锁死消灭了撤池 rug，但风险转为 dev 与内部人的持仓抛售 | 由 M25、M28 推出：dev 在最低价建仓且没有 vesting；[27] §2.8 | inferred | |
| M57 | 方案提出：内盘费用采用 pull 模式记账，以避免恶意创作者合约 revert 或重入 | 02-meme-launchpad-fundamentals.md §3.3.2 | observed | |
| M58 | 方案提出：所有除法偏向池子取整（进池向上、出池向下） | 02-meme-launchpad-fundamentals.md §4.1 | observed | |
| M59 | 方案声称 v4 hook 路径“资金从未离开 PoolManager、零夹子窗口”；该性质只在 hook 用 6909 claim 托管时成立，不是 v4 的固有性质 | 由 [12][14] 与 [18] 推出：Pons V2 资金先在曲线合约；02 §3.4.2 原文 | inferred | K |
| M60 | 02-fundamentals 把 pump.fun 的“售罄”与 four.meme 的“$12K 等值”混写为同一个毕业条件，“1%、45/45/10”也不是 pump.fun 参数 | 02 §2.2 步骤三、§3.3.1 vs [1][7][22] | observed | R |
| P1 | pump.fun 曲线初始虚拟储备为 30 SOL / 1.073B 代币，可售真实储备 793.1M，总量 1B，当时交易费 100 bps | [1] pump-public-docs PUMP_PROGRAM_README @7a304c9 的 Global 账户字段 | observed | L |
| P2 | 按 P1 参数，打满可售代币约需 85 SOL 真实储备，即毕业阈值约 85 SOL（SOL 计价，与美元无关） | 由 P1 推出：30×1.073/(1.073−0.7931)−30≈85.0 SOL | inferred | D、J |
| P3 | 截至 2026-10，pump.fun 曲线阶段总费 1.25%（创作者 0.300% + 协议 0.95%），建币 0 费，毕业到 PumpSwap 收 0.015 SOL | [2] pump.fun/docs/fees（访问 2026-10-05） | observed | L |
| P4 | pump.fun 自 2026-05-21 起允许 USDC 作为 quote 资产 | [2] pump.fun/docs/fees | observed | L |
| P5 | 2024-08-09 起 pump.fun 建币免费，代币完成曲线时奖励创作者 0.5 SOL，迁移费为 1.5 SOL | [4] The Block 2024-08-09 转述官方公告 | observed | E、F3 |
| P6 | 2025-03-20 PumpSwap 上线，毕业代币直接迁入，迁移费从 6 SOL 降到 0，PumpSwap 初始费率 0.25%（LP 0.20%/协议 0.05%） | [6] pump.fun 官方推文（经 Cryptonews 转引） | observed | E、J |
| P7 | pump.fun 创作者费 2025-05-13 起为 0.05%，2025-09 Project Ascend 后为 0.30% | [7] DefiLlama pump.fun adapter 方法论；[2] 官方确认 2025-05-13 起有创作者费 | observed | E、F3 |
| P8 | 2024-05-16 pump.fun 被前员工利用 withdraw authority 盗走约 12.3K SOL（约 $1.9M，曲线总流动性约 $45M），根因是内部权限而非合约漏洞 | [5] The Block 引官方 post-mortem | observed | E、F7 |
| P9 | pump.fun 毕业是原子、自动、不可逆的迁移，迁移后的 PumpSwap 规范池归协议所有 | [3] pump.fun/docs/bonding-curve | observed | L |
| P10 | 资料称 pump.fun 于 2024-01 上线 | 仅见于 2-meme-launchpad/benchmarks/robinhood-chain.md §3.7.2（≈L800），未找到一手来源 | speculative |  |
| P11 | four.meme 2025-02-11 被盗约 $183K：迁移时目标 V3 池已存在则不校验 sqrtPriceX96，攻击者预建价格约为正确值 3.68e14 倍的池，诱导注入 200M 代币 + 约 24 WBNB 后取走 WBNB | [8] Verichains 2025-02-21 复盘 | observed | C、E、K、F1 |
| P12 | four.meme 2025-03-18 第二次被黑：内盘用 0x7f79f6df 把代币转到可预测但尚未创建的 PancakeSwap pair，绕过 MODE_TRANSFER_RESTRICTED，以异常价格建池并抽干 | [9] Decrypt 引 SlowMist/QuillAudits；lunaray 复盘 | observed | L、F1 |
| P13 | four.meme 2025-03-31 宣布：新币地址以 4444 结尾，毕业后在 PancakeSwap V2 加流动性并销毁 LP | [10] four.meme 官方 Binance Square 公告 | observed | C、L、F1 |
| P14 | 资料 outputs/03 所称"four.meme 2025-09 与 2026 初 Helper3 重入、违反 CEI 被盗 $183K"与一手复盘不符，属于错误 | 由 P11、P12 推出：两次事故均在 2025-02/03，根因是池价未校验和可预测 pair 地址，不是重入；资料位置 outputs/03 §2.2.2（≈L150） | inferred | R |
| P15 | four.meme 两次事故的共同根因是"迁移目标池的地址或价格可被第三方抢先确定" | 由 P11、P12 推出：一次复用已存在的假池，一次抢先注资可预测 pair | inferred | F1 |
| P16 | four.meme 截至 2026-09-06 BNB 池毕业阈值 18 BNB、曲线可售 80%、买卖费 1%，毕业时入池为阈值的 98%（隐性 2%） | 仅见于 2-meme-launchpad/benchmarks/bsc-fourmeme.md §1.3–§1.4（≈L80–L140）资料作者链上实测，本轮未复核 | speculative | Q |
| P17 | four.meme 2026-09 日发币约 13.7K、毕业率约 0.07%，DefiLlama 24h 费用 $9,578（2025-10-08 峰值单日收入 $1.43M） | 仅见于 bsc-fourmeme.md §3.1–§3.3（≈L230–L290），未复核 | speculative | Q |
| P18 | Clanker 协议费固定为创作者 LP 费的 20%，加收在创作者费之上（1% 创作者费→交易者实付 1.2%） | [11] Clanker DOCS creator-rewards-and-fees；[34] DefiLlama 方法论 | observed | L |
| P19 | Clanker 部署时全部供应作为单边 v4 LP（initial LP）放入池中，持有者自建的 LP 或新池不给创作者分成 | [11] Clanker DOCS | observed | L |
| P20 | ClankerMevDescendingFees 起始 LP 费最高 80%、衰减最长 2 分钟、二次曲线衰减，推荐 80%→5%/30s，$40K 起始市值下狙击者等效入场市值 $200K | [12] Clanker docs | observed | L、F2 |
| P21 | Farcaster（Merkle）收购 Clanker，同时宣布协议费用于买入并持有 $CLANKER、烧毁 v0–v3.1 费用金库代币、约 7% 供应锁入单边 LP | [13] Dan Romero Farcaster cast；PANews 2025-10-28 | observed | E、L |
| P22 | 2026-01-21 Neynar 宣布收购 Farcaster，接手运营 Clanker，Clanker 创始人 Jack 和部分团队加入 Neynar | [14] Neynar blog 2026-01-21 | observed | E、L |
| P23 | 资料 base-ecosystem.md 把"Clanker 被 Farcaster/Neynar 收购"标为"很可能不实"，已过时 | 由 P21、P22 推出；资料位置 base-ecosystem.md §1.6（≈L210）、§8.2 第 7 条（≈L1390） | inferred | R |
| P24 | 资料称 Clanker 发放"Fee Key NFT"，与官方文档不符：Clanker 文档描述的是 locker 的 rewardBps 槽位分成，未见可转让收益权 NFT；可转让收益权 NFT 是 Flaunch Memestream | 由 P18、P19、P30 推出；资料位置 outputs/03 §2.2.1 迭代 4（≈L120） | inferred | R |
| P25 | Clanker 单币手续费从 2024-12 的 $1,371 降到 2026-08 的 $53（−96%），2026-02 单月部署 261,047 枚、手续费 $22.39M（AI agent 浪潮） | 仅见于 base-ecosystem.md §1.8（≈L300–L330）资料 DefiLlama/clanker API 拉取，本轮未复核 | speculative | F6、Q |
| P26 | Zora 每个币固定 1B 供应，进带 hook 的 Uniswap v4 池；狙击税 99% 起 10 秒衰减；20% 手续费锁为永久池深度；费用多跳兑换后以 ZORA 支付；初始流动性由 Doppler 多曲线布置 | [15] docs.zora.co/coins | observed | L、F2 |
| P27 | Zora Creator Coin 50% 给创作者、5 年释放；Content Coin 以创作者币作 quote，创作者即时得 10M；Trend Coin 费率 0.01%、无创作者分配、手续费全归协议 | [15] docs.zora.co/coins | observed | L |
| P28 | Base App 2026-02-09 宣布下线 Creator Rewards 与 Talk feed，7 个月约 $450K 发给约 17K 名创作者（人均约 $26），最终发放日 2026-02-18，理由是聚焦交易 | [17] Cointelegraph 2026-02-10 转引 @baseapp | observed | E、F3、F5 |
| P29 | 2026-07-15 Pollak 公开承认 Farcaster/Zora/miniapps/creator coins 路线"disintegrated completely … definitively wrong"，把 Base App 交给 Cobie，本人继续负责 Base 链 | [18] CoinDesk、The Block 2026-07-15 转引 X 原帖 | observed | F5、F6 |
| P30 | Flaunch 创作者不拿的手续费份额全部进入 Progressive Bid Wall，每攒满 0.1 ETH 在现价正下方挂一笔限价买单，价格上涨时跟随上移；Memestream 持有者可关闭 PBW | [16] docs.flaunch.gg auto-buybacks | observed | L |
| P31 | Zora 于 2026-02-17 在 Solana 推出 attention markets，开始离开 Base 单链 | [19] The Block 2026-02-17 / CoinDesk 2026-02-18 | observed | L |
| P32 | Robinhood Chain 公开主网与新版 Stock Tokens 于 2026-07-01 上线 | [20] Robinhood Newsroom | observed | E |
| P33 | Robinhood Wallet 的 gas 补贴随主网上线、为期 90 天，门槛最初为 >$5 的 swap，2026-08-08 降到 $0.5，2026-09-29 到期 | [24] crypto.news 2026-09-04；Gate News 2026-08-08 | observed | E、F5 |
| P34 | Pons V1 是 CREATE2 工厂 + 单边 Uniswap V3 头寸 + 可配置 locker；V2 是同 quote 恒定乘积曲线，毕业为全区间 v4 头寸并永久锁定（"no router, no swap, and no price oracle"） | [21] Pons 仓库 README @44a3db9 | observed | L |
| P35 | Pons V2 回购金库对买回的代币 5 年线性解锁，不销毁；毕业分两段且都无需许可（graduate + 可重试的 createGraduatedPool） | [21] Pons 仓库 README @44a3db9 | observed | L |
| P36 | Pons V2 默认 1% 费用拆为协议 30% / 创作者 35% / 回购金库 35% | 资料 robinhood-notes.md §3.5（≈L430）称来自 GitHub 源码，README 只写"split protocol / creator / buyback"，比例未在 README 中直接看到 | speculative | L |
| P37 | Pons V2 反狙击为 99% 起始税、15 秒衰减（factory 常量），与 README 表格写的"Curve price impact + reserved pool allocation"矛盾 | 仅见于 robinhood-notes.md §3.4（≈L400）；[21] README 表格给出另一种描述 | speculative | L、Q |
| P38 | Pons V2 可用 ETH、USDG、cbBTC 或股票/ETF 代币作 quote | [32] Bitquery Pons docs（二手）；[21] README 写 quote 可为 native ETH 或所选 ERC-20 pairToken | observed | L |
| P39 | 截至 2026-10-05，Pons 官网显示累计发币 4,228,127，并挂"Degraded performance … upgrading the backend"提示 | [35] ponsfamily.com/launchpad | observed |  |
| P40 | 补贴到期后 Pons 日费从 2026-09-29 的 $6.87M 降到 10-02 的 $1.48M（−78%），PONS 从高点下跌 58% | 仅见于 [26] Gate News 转引 BlockBeats/GMGN（二手），未找到 DefiLlama 一手数据 | speculative | E、L、F5 |
| P41 | PAIR 在一笔原子交易内部署 1B 固定供应代币 + 1–5 个 v4 池（24 只白名单股票代币，权重合计 100%），按预言机开盘价注入单边流动性，LP 永久锁入 PairV4Locker | [22] PAIR GlobeNewswire 2026-08-31 | observed | L |
| P42 | PAIR 没有曲线、没有迁移；"毕业"只是 4.2 ETH×ETH/USD 的信息性 flag，不移动流动性 | [22] PAIR 新闻稿 | observed | C、L |
| P43 | PAIR 反狙击：发射块 + 后 5 块内单笔买入 ≤5.5%、单钱包 ≤5.0%，卖出不受限；1% 交易费 70% 归创作者、30% 归协议；$PAIR 用协议费的 90% 回购 | [22] PAIR 新闻稿 | observed | L |
| P44 | 2026-08-30 PAIR 接入 AMC 后，周末链上价格冲到真实价的 35 倍；peg guard 只暂停新发射，宣布时尚未上线 | [22] PAIR 新闻稿；另一口径 72.3x 见 [25] Wurrly（互相矛盾） | observed | L、F4 |
| P45 | BONER/HIMS 池持有 31,198/58,714 枚代币化 HIMS，休市期间价格达 $132.64，而周五收盘价为 $28.84；另一口径为约 81%、4.25 倍 | [25] The Defiant 与 Wurrly（二手，口径互相矛盾） | observed | F4 |
| P46 | LONG 强制以单只股票代币作 quote，AI/NVDA 的 NVDA 计价费用进社区金库，AI 计价费用销毁或锁定 | [31] GeckoTerminal 池描述（二手） | observed |  |
| P47 | Uniswap Labs 的 pools.trade 于 2026-08-05 在 Robinhood Chain 上线：不收 launchpad 费，0.25% LP 费自动复投，创作者可选 0.05%，有 Crowd Launch（4 小时竞价/TWAP）与 Instant Launch（曲线）两种模式 | [23] Gate News 2026-08-06（二手） | observed | L |
| P48 | Funny Money 于 2025-02-18 由 Mantle 推出，定位"AI agent launchpad & DeFAI terminal"，1M MNT 是配套交易竞赛奖池 | [27] Mantle Blog 2025-02-18 | observed | H、L |
| P49 | 截至 2026-10-05，funny.money 官网只显示"sunsetting its trading platform" | [28] funny.money 官网 | observed | H、L |
| P50 | 资料称 Funny Money 于 2026-08-16 关停 | 仅见于 2-meme-launchpad/README.md §1（≈L10），未找到一手来源 | speculative | L |
| P51 | Printr 是 Bybit Venture Studio 首个孵化的多链 launchpad，2025-10-21 宣布融资合计 $4.5M（$2.5M pre-seed + $2M seed extension，Mantle EcoFund 为 seed extension 投资方之一） | [29] Printr PR Newswire 2025-10-21 | observed | H、L |
| P52 | Printr 2026-08-17 宣布 wind-down，08-18 开始自动解押，08-31 前停止运营，取消 TGE 与空投，原因是缺乏资本或分发支持 | [30] Crypto Briefing 转引 @printr 2026-08-17 推文 | observed | E、H、L、F5 |
| P53 | 资料 README 把"Printr 2026-08-18 关停"和"两者都失败于纯内生注意力"写成事实；08-18 只是 wind-down 开始日，官方原因是资本与分发 | 由 P52 推出；资料位置 README.md §1（≈L10–L13） | inferred | R、L |
| P54 | 迁移攻击面可以靠"不迁移"（单边 LP）或"同 quote 池内毕业"在结构上消除，但会失去曲线阶段与"毕业"这一注意力事件 | 由 P15、P19、P34、P42 推出：Clanker/PAIR 无毕业动作，Pons V2 毕业无路由或预言机 | inferred | 导语 |
| P55 | 创作者激励从 0.5 SOL 一次性奖励演进为按成交量永续分成（pump.fun 0.30%、Pons 35%、PAIR 70%），但投机流量退潮后分成随之归零 | 由 P5、P7、P28、P36、P43 推出：分成规模 = 成交量 × 比例，Base Creator Rewards 人均仅 $26 | inferred | F3 |
| P56 | 补贴和分发只能买到冷启动、买不到留存，Base App（2026-02）与 Robinhood Chain（2026-09-29）先后验证 | 由 P28、P33、P40 推出：补贴或分发退出前后活动量都明显下降；其中 P40 为二手 | inferred | F、F5 |
| P57 | 多 quote 碎片化在 2026-10 仍无生产级解法：PAIR 聚合器不做池间再平衡，peg guard 不熔断存量池 | 由 P43、P44 推出，加上 PAIR 新闻稿对聚合器功能的描述 [22] | inferred | F4 |
| A1 | Clanker 的第一公民是人类创作者；Droid 文档写明“not autonomous with your money”，cast 需要人工确认 | [12] clanker-devco/DOCS droids/README.md（main，访问 2026-10-05） | observed | N、F8 |
| A2 | Clanker Droid 默认从 LP 奖励切 1000 bps（可设 100–5000）进 Base 上的 runtime 钱包，用 USDC 付推理 | [13] droids/funding.md | observed | N、F10 |
| A3 | Clanker Droid 被硬限在 Base 主网加 USDC 交易对，其他链的 API 返回 “Launch with Agent requires Base mainnet” | [13] droids/funding.md | observed | |
| A4 | Clanker 发币内核是固定供应量加单边流动性进 v4 加 LP 永久锁定，没有曲线和毕业，没有 session，部署者自付 gas | 仅见于 notes/01-agentic-landscape.md:36-54（引用 base-ecosystem.md 和 SDK），本 lane 未打开合约复核 | speculative | |
| A5 | 2025-10 Farcaster 收购 Clanker，并安排协议收入回购 CLANKER | [14] farcaster.xyz news（日期取自 PANews 二手报道） | observed | E |
| A6 | Bankr 文档把发币定义为 agent 自我供血：“This is how agents fund themselves” | [8] docs.bankr.bot/token-launching/overview | observed | H |
| A7 | Bankr 的 chat、social、API 默认部署到 Robinhood Chain，CLI 和网页默认 Base | [8] Token Launching Overview “Chain defaults differ by surface” | observed | |
| A8 | Bankr 每个钱包滚动 24h 内 3 次计数尝试、每分钟 1 枚；能证明未上链的失败退配额；模拟不占配额但每 24h 最多 20 次 | [8] Deployment Limits | observed | F6 |
| A9 | Bankr 开盘 5 分钟单钱包持仓上限 2%，反狙击费衰减窗口是 14 秒（仓库资料写的约 10 秒已过时） | [8] Five-Minute Balance Cap；对照 notes/01-agentic-landscape.md:142 | observed | L、F2、R |
| A10 | Bankr Doppler 发射的池费 0.7%，其中 95% 给创作者（成交额 0.665%），全部费用合计 1.75%，在发射时固定 | [8] Fee Structure | observed | L、F10 |
| A11 | Bankr 零售钱包的最低 ETH 余额现在是运行时开关，文档不再写 0.002 ETH；纯邮箱账户要等 72h，每 IP 每 24h 约 10 次成功部署 | [8] Retail launch-wallet requirements；对照 notes/01-agentic-landscape.md:143 | observed | |
| A12 | Bankr 的交易分成两条：Wallet API（不经过 LLM，快）和 Agent API（NL→LLM，慢） | [9] Wallet API Overview | observed | N |
| A13 | Bankr 官方警告：分享开启了 agent 权限的 API key 可能丢失账户全部资产 | [10] Agent API Overview “Security” | observed | N、F8 |
| A14 | Bankr 已有服务端账户策略：日限额默认 $500/24h、单笔 $500、收款人白名单、任意合约调用开关（默认开），API key 改不了这些设置 | [11] docs.bankr.bot/security/bankr-terminal | observed | L、N、F8 |
| A15 | 所以 Mantle 方案相对 Bankr 的差异点应该是“链上可验证、非托管的策略”，而不是“有没有限额” | 由 A14、A16 推出：Bankr 限额在服务端广播关口执行，而 7579 session 的 policy 在链上校验 | inferred | 导语、F、F8 |
| A16 | 主流 7579 session 模块（Rhinestone Smart Sessions）支持 Call、Spending limit、Timeframe、Usage limit、Value limit 几种 policy，按 AND 组合；不配 policy 时默认 sudo | [5] docs.rhinestone.dev smart-sessions overview | observed | I、F9、O |
| A17 | Session 不会自动过期，必须显式设置 timeframe policy | [5] Rhinestone “Time limits are configurable, not inherent to session keys” | observed | F9 |
| A18 | Virtuals 的发币者是人类 founder；创建免费，部分模块收 10 或 100 VIRTUAL | [15] Virtuals Launch Mechanics | observed | N |
| A19 | Virtuals 交易税 1%，70% 给创作者、30% 给 Treasury；累计 42,000 VIRTUAL 毕业到 Uniswap V2，LP 锁 10 年 | [15] | observed | N、F10 |
| A20 | Virtuals 可选狙击税从 99% 衰减到 1%，窗口 0s/60s/10min/98min，默认只作用于买方；回购的币按 3+9 个月释放给团队 | [15] | observed | N |
| A21 | ElizaOS EVM plugin 必填 EVM_PRIVATE_KEY 环境变量，可选 TEE_MODE；交易靠自然语言触发 | [16] docs.elizaos.ai plugin-evm examples | observed | N、F8 |
| A22 | AI16Z 在 2025-01-02 市值峰值 $2.39B；2026-08-04 创始人宣布 ELIZAOS 代币死亡、基金会关闭 | [19] CoinDesk 2026-08-05（二手，引用创始人 X 帖文） | observed | |
| A23 | daos.fun 已停止维护、停止所有 DAO 发射，理由是创作者夹自己的交易和滥用 DAO 资金 | [17] daos.fun 官网（经搜索快照） | observed | |
| A24 | 方案提出以 agent 为第一公民，核心协同链路是 Bybit AI ↔ byreal ↔ Mantle，quote 资产为 mStocks | product.md:3-5 | observed | O |
| A25 | 方案提出“发币零门槛、交易硬限权”，理由是发币输入收敛、交易有滑点、MEV、跳价等高危边界 | product.md:12-16 | observed | F9 |
| A26 | 方案提出 session 目标白名单只放 LaunchpadFactory 和 byrealRouter，禁止原生 transfer 和任意 ERC-20 调用 | product.md:20-22 | observed | O |
| A27 | 方案提出函数选择器白名单为 launch、buyExactQuote、sellExactToken、claimFee，禁止 approve(arbitrary) | product.md:23-26 | observed | O |
| A28 | 方案提出单笔、单块、生命周期三档额度（以 quote 计），加滑点硬约束、24h 时效和 owner 一键 revoke | product.md:27-30 | observed | O |
| A29 | EIP-7702 已 Final；它只给 EOA 写入委托指示符，白名单、额度、时效要靠委托合约或模块实现 | 由 [1]（规范只定义委托和授权元组，要求委托合约自做重放保护）和 [5]（policy 在模块里）推出 | inferred | I、O |
| A30 | 7702 授权的 chain_id 为 0 时在所有链有效；委托给零地址可清除委托 | [1] EIP-7702 Behavior 第 1、8 步 | observed | |
| A31 | Mantle 主网已经支持 EIP-7702：Mantlescan 有 7702 授权列表，快照显示 59,953 条 | [7] mantlescan.xyz/txnAuthList（搜索快照，直接抓取返回 403） | observed | O、F11 |
| A32 | ERC-4337 EntryPoint 已提供 192-bit key 加 64-bit sequence 的二维 nonce，并提供 getNonce(sender,key) | [2] ERC-4337 Semi-abstracted Nonce Support | observed | O、F11 |
| A33 | 报告里“L2 做不到二维 nonce”只对 EOA 和 7702 原生交易成立，对 4337 UserOp 不成立 | 由 A32 与 report:158、notes/03-l2-design.md §8 推出：4337 账户在应用层就有 key 分道 | inferred | F11 |
| A34 | 原生二维 nonce 提案 RIP-7712 仍是 Draft，依赖 RIP-7560；nonceKey≠0 的交易不会作废已签的 7702 授权 | [4] RIP-7712（master） | observed | O |
| A35 | 方案提出用协议级 Paymaster，让 agent 用 quote（mStocks/USDT）付 gas | product.md:82-84 | observed | O |
| A36 | 4337 UserOp 带 paymaster、paymasterVerificationGasLimit、paymasterPostOpGasLimit、paymasterData 字段，能支撑 ERC-20 付 gas | [2] ERC-4337 UserOperation 字段表 | observed | O |
| A37 | 方案提出在 v4 池内用 hook 实现相变：Phase 1 由 beforeSwap 按曲线定价，达到阈值后翻转到 CL | product.md:50-53 | observed | O |
| A38 | v4 的 hook 写在 PoolKey 里，建池后不能更换，所以相变只能在同一个 hook 的内部状态机里完成 | 由 [25]（hook 不可增删换；支持自定义曲线和 return-delta）推出 | inferred | I |
| A39 | 方案声称的“零 MEV 攻击窗口”不成立：相变只消除迁移窗口，Phase 1 曲线内的抢跑和夹子仍在 | 由 product.md:54 与 06-chain-infra-plan.md §4.1.3（B3 开盘排序不公与 B6 迁移分开列）、report:259（“想要零 MEV”不是翻转理由）推出 | inferred | K |
| A40 | 方案提出每笔交易收约 1% 手续费，70%–80% 进发币 agent 的 Runtime Vault，以 quote 结算，用来付推理和 gas | product.md:43-44 | observed | F10 |
| A41 | “手续费养推理”已被 Clanker（10% LP）、Bankr（0.665%）、Virtuals（1% 的 70%）三家同时采用 | 由 A2、A10、A19 推出 | inferred | F10 |
| A42 | 方案提出人类入口是 Bybit AI，AI Subaccount 的资金映射到链上受限 session | product.md:61-64 | observed | O |
| A43 | Bybit 在 2026-05-27 上线 AI Subaccount：资金隔离、只能通过 API 访问、可设杠杆/资产上限/禁止提现、主账户只读监督 | [20] Bybit 公告 | observed | O |
| A44 | 目前没有 Bybit AI Subaccount 到链上 session 的公开映射能力 | 仅见于 product.md:64 的方案描述；Bybit 公告 [20] 没有提到链上映射，未找到一手来源 | speculative | O |
| A45 | Bybit 在 2026-04-22 发布官方 MCP（行情、交易、账户、WebSocket 四个模块） | [21] Bybit Press | observed | |
| A46 | Bybit AI 聊天助手（2026-09）不能执行交易、不能访问主账户 | 仅见于二手报道 [22]，未找到 Bybit 一手公告 | speculative | |
| A47 | 方案提出 Moltbook 式的 agent 专属社区，只有 agent 能发帖，人类只读 | product.md:66-70 | observed | O |
| A48 | Moltbook 真实存在，2026-01 上线，只有 agent 能发帖；Meta 在 2026-03-10 宣布收购 | [23] AP 报道（引用 Meta 声明） | observed | O |
| A49 | 公开资料中 byreal 是 Bybit 孵化的 Solana DEX（CLMM 加 RFQ），没有 Mantle 或 Uniswap v4 部署信息 | [24] docs.byreal.io | observed | P |
| A50 | byreal 会作为 Mantle 上的 v4 DEX 承接 Launchpad | 仅见于 product.md:50、144，未找到一手来源（属于未公开计划，不核实） | speculative | P |
| A51 | 报告的推荐是维持 L2：缺的是身份与权限，不是独立状态机 | agent-meme-launchpad-report.md:9-11 | observed | F、F11 |
| A52 | 报告给出的 L3 翻转条件是 F1 热点外溢、F2 失败扣费导致做市退出、F3 开盘被共址 bot 垄断，且必须用 Mantle 实测 | agent-meme-launchpad-report.md:245-249；outline.md:66-68 | observed | F、F11 |
| A53 | 方案给出的 L3 条件是全网 base fee 外溢和死币导致的状态膨胀 | product.md:95-97 | observed | P |
| A54 | 取舍：product.md 以 mStocks 为核心 quote（理由是刚性买盘）；报告默认 USDC，不寄生 xStocks | product.md:4、105-106；agent-meme-launchpad-report.md:31、139 | observed | P |
| A55 | 取舍：product.md 选曲线加 hook 相变；报告和 outline 默认不要曲线，用 v4 单边池加永久锁 LP，曲线作为可选的同池相变 | product.md:46-54；agent-meme-launchpad-report.md:135-137；outline.md:25 | observed | P |
| A56 | 取舍：product.md 深度绑定 Bybit 和 byreal；outline 把 Bybit 定为次级入口，禁止在聊天里给 KYC 用户直接发 meme | product.md:60-64、143-145；outline.md:39-44 | observed | P |
| A57 | 热路径必须是结构化 API（幂等的 clientRequestId、模拟不占配额、机器可读失败码），NL 只做人类入口 | notes/02-agent-requirements.md:19-27；outline.md:33 | observed | O |
| A58 | Bankr 的机器可读失败码（TOKEN_LAUNCH_WALLET_TOO_NEW 等）和“无法证明未广播就保留配额”的规则，是幂等与失败码设计的一手先例 | [8] Retail launch-wallet requirements 与 Deployment Limits | observed | |
| A59 | 仓库链规划把“失败 Drop（S4）、热点配额（S1）、发射 RPC（S5）”列为第一包，并配地址级速率限制防 DoS | 06-chain-infra-plan.md §4.2.2-4.2.4 | observed | O |
| A60 | 发币零门槛需要配额、钱包年龄、IP、余额等多层反女巫闸门；product.md 没写配额，outline 写了“数值待决” | 由 A8、A11 与 outline.md:35 推出 | inferred | F6 |
| A61 | Bybit 官方口径用户数为“over 80 million”，与 product.md 和 outline 的“8000 万”一致 | [26] Bybit Press 索引页（搜索快照）；product.md:143 | observed | |
| P58 | Flaunch 手续费从 2025-01 约 $1.12M/月降到 2026-08 约 $283（−99.97%） | 仅见于 2-meme-launchpad/benchmarks/base-ecosystem.md（资料作者从 DefiLlama 拉取），本轮未复核 | speculative | L |
| P59 | 六条设计公理（不依赖外部建池迁移、防狙击匹配出块粒度、分成写进合约但不当留存手段、多 quote 需统一路由与熔断、补贴只买冷启动、关键比例与收款人写进合约） | 由 F1–F7 对应的 P11–P15、P20、P26、P28、P29、P44、P55–P57、M53 推出；见 notes-products.md Q2 | inferred | M |
| A62 | 调研报告提出：Router 内部原子完成 approve + swap，以调和“session 禁止 approve”与“必须能买卖” | 7-agent-meme-launchpad/notes/03-l2-design.md:43-45 | observed | O |
| A63 | Bankr 支持在 Robinhood Chain 和 Base 上用代币化股票作 quote 发射（Robinhood Stock Token、Coinbase B20） | notes-agentic.md [8] Bankr Token Launching Overview “Stock-paired launches”，访问于 2026-10-05（主会话复核） | observed | P |
| A64 | EIP-7702 随 Pectra 于 2025-05-07 在以太坊主网激活 | notes-agentic.md [6] EF Blog “Pectra Mainnet Announcement” | observed | S |
| A65 | ERC-7579 目前是 Draft 状态 | notes-agentic.md [3] eips.ethereum.org/EIPS/eip-7579 | observed | I、S |

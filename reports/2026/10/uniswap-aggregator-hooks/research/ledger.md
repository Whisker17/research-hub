# 论断台账

每条会出现在 explainer 里的论断，都要在这里有一行。
类型：observed（直接观察到，有一手证据）/ inferred（由证据推出）/ speculative（推测，需在页面上标明）。

编号前缀对应调研分册：C（代码机制）与 D（链上数据）→ [notes-code.md](notes-code.md)；M（市场与对比）→ [notes-market.md](notes-market.md)；G → 主会话补充的综合判断（依据见 [notes.md](notes.md)）。证据里的 `[n]` 指该分册“来源”一节的第 n 条。GPT Deep Research 原文见 [gpt-agg.md](gpt-agg.md)，只作线索。“页面”列在写稿时填写。

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| C1 | v4 的 `unlock` 在回调结束时检查非零 delta 计数，不为 0 就回滚整笔交易 | [2] PoolManager.sol L104–114@d153b04 | observed | I、B、F2 |
| C2 | hook 有 beforeSwapReturnDelta 权限时，返回的 specified delta 会加到 amountToSwap 上，可以把核心 swap 量改成 0 | [2] Hooks.sol L266–279@d153b04 | observed | I、F2 |
| C3 | amountToSwap 为 0 时，v4 核心的 Pool.swap 直接返回零 delta，不走集中流动性计算 | [2] Pool.sol L320@d153b04 | observed | I、F1 |
| C4 | hook 返回的 delta 会记到 hook 账上，swapper 的 delta 等于核心 delta 减去 hookDelta | [2] Hooks.sol L305–313；PoolManager.sol L220–226@d153b04 | observed | F2 |
| C5 | `take` 给调用者记负 delta 并立即转出代币，`settle` 按 sync 之后的余额差记正 delta | [2] PoolManager.sol L279–302@d153b04 | observed | I |
| C6 | BaseAggregatorHook 只开 4 个权限：beforeInitialize、beforeAddLiquidity、beforeSwap、beforeSwapReturnDelta | [1] BaseAggregatorHook.sol L84–89 | observed | J、F1 |
| C7 | hook 权限编码在地址低 14 位，aggregator hook 的低位组合是 0x2888 | [2] Hooks.sol L29–47；由 C6 四个 flag 相加 | observed | I |
| C8 | Aggregator hook 拒绝加流动性，beforeAddLiquidity 直接 revert LiquidityNotAllowed | [1] BaseAggregatorHook.sol L128–135 | observed | J、F1 |
| C9 | beforeSwap 里 hook 先在外部协议成交，再返回 specified = −amountSpecified（注释 “cancel core”）和 unspecified = 外部成交量的 delta | [1] BaseAggregatorHook.sol L137–186 | observed | 导语、B、J、F2 |
| C10 | 基类把输出币叫 settleCurrency、输入币叫 takeCurrency；适配器只需实现 `_conductSwap` 与 `_rawQuote` | [1] BaseAggregatorHook.sol L96–119、L205–220 | observed | J |
| C11 | 一笔经过 aggregator hook 的 swap 里，hook 的两种币 delta 最终都归零，swapper 付输入、拿外部成交输出减协议费 | 由 C1、C4、C5、C9 推出：notes-code §1.2 逐步记账表 | inferred | J、F2 |
| C12 | 外部池只部分成交时，hook 留下未结 delta，整笔交易在 unlock 结束时回滚，不会悄悄部分成交 | 由 C1、C9、C11 推出 | inferred | F2 |
| C13 | “v4 池”只是路由与结算身份：PoolManager 里没有该池的储备，储备和定价一直在外部协议 | 由 C3、C8、C9 与 [1] IAggregatorHook.sol L25–29（pseudoTVL 读外部池）推出 | inferred | 导语、F1 |
| C14 | 协议费 = PoolManager 中该虚拟池 slot0 的 protocolFee × 25，从 unspecified 一侧 `take` 直接送进 TokenJar | [1] ProtocolFees.sol L45–100；BaseAggregatorHook.sol L37 | observed | F6 |
| C15 | v4 核心单向协议费上限 1000 pips，乘 25 后 aggregator hook 最高可收 2.5% | [2] ProtocolFeeLibrary.sol L8；由 C14 计算 | inferred |  |
| C16 | TokenJar 地址从 PoolManager 的 protocolFeeController 读取 TOKEN_JAR() | [1] ProtocolFees.sol L102–110 | observed |  |
| C17 | aggregator hook 用 protocolFeeFlags() = 1<<11 自报身份，治理指南称这是生产上唯一依赖的 flag 约定 | [1] BaseAggregatorHook.sol L91–94；[3] governance guide L177–192 | observed | F6、T |
| C18 | LitePSM 适配器自报 1<<12，UniswapX 适配器自报 0（不参与协议费分类） | [1] LitePSMAggregator.sol L91–93；UniswapXAggregator.sol L96–97 | observed | F6 |
| C19 | `quote()` 返回外部原始报价加协议费，函数不是 view，供路由器模拟调用 | [1] BaseAggregatorHook.sol L55–81；IAggregatorHook.sol L17–23 | observed |  |
| C20 | pseudoTotalValueLocked 读的是外部池里的代币数量，不是 v4 储备 | [1] IAggregatorHook.sol L25–29；UniswapV3Aggregator.sol L160–166 | observed | F1 |
| C21 | V3 适配器是单例，建池时用 factory.getPool 解析外部池，校验 fee、tickSpacing、token 顺序，一个外部池只允许一个 canonical PoolKey | [1] UniswapV3Aggregator.sol L168–217 | observed | L |
| C22 | V3 适配器成交时让外部池把输出直接打给 PoolManager，回调里校验 transient 预期池后用 `take` 把输入从 PoolManager 直接打给外部池 | [1] UniswapV3Aggregator.sol L67–98、L219–267 | observed | K、F3 |
| C23 | V3 适配器的报价是真调外部池 swap，在回调里 revert 带回 delta，再解码 | [1] UniswapV3Aggregator.sol L72–76、L100–157 | observed | L |
| C24 | V3 适配器不支持原生 ETH，exact-out 要求外部输出与请求量完全相等 | [1] UniswapV3Aggregator.sol L193、L225、L261–263 | observed | L |
| C25 | PancakeSwap V3 适配器全文 17 行，只多实现 pancakeV3SwapCallback；Slipstream 只覆盖按 tickSpacing 查池 | [1] PancakeSwapV3Aggregator.sol；SlipstreamAggregator.sol L10–34 | observed | L、F4 |
| C26 | README 称 Slipstream 报价用链上 QuoterV2，但该 commit 代码未覆盖 _rawQuote，实际继承 V3 的 revert 报价 | [1] README “Uniswap V3 / Slipstream” 段；SlipstreamAggregator.sol 全文 | observed | Q |
| C27 | Curve 适配器每个 Curve 池一个 hook，工厂一次初始化 n(n−1)/2 个 PoolKey；同一 hook 地址让路由器识别同一 Curve 池 | [1] StableSwapAggregatorFactory.sol L58–118；README Curve 段 | observed | L、F4 |
| C28 | Curve 适配器只支持 exact-in，把输入 take 到 hook 后调用 exchange，min_dy 填 0，注释称滑点由路由器检查 | [1] StableSwapAggregator.sol L147–187 | observed | L、F4 |
| C29 | Fluid 适配器在 dexCallback 里校验 inflight 与调用者后，从 PoolManager 直接把输入打给 Fluid；amountLimit 设为 0 或最大值，注释称由路由器检查 | [1] FluidDexLiteAggregator.sol L66–73、L131–188 | observed | L、F4 |
| C30 | LitePSM 适配器调用 sellGem / buyGem，每次读最新 tin / tout，报价含容量检查，每个 gem/stable 对只允许一个池 | [1] LitePSMAggregator.sol L109–233 | observed | L |
| C31 | V2 适配器是单例，用 getPair 查池，PoolKey 的 fee 与 tickSpacing 不参与，报价由 reserves 算出 | [1] UniswapV2Aggregator.sol L64–96、L140–225；README V2 段 | observed | L |
| C32 | UniswapX 适配器把签名订单放在 hookData，hook 充当 filler，v4 swapper 提供对手方，不支持路由报价，全成或全不成 | [1] UniswapXAggregator.sol L20–43；README UniswapX 段 | observed | L、F4 |
| C33 | 适配器地址首字节编码协议（如 03 V3、93 Pancake、A1 Slipstream、C2 Curve NG、F1 Fluid、95 LitePSM），随机地址有 1/256 误判 | [1] README ID System；AggregatorHookMiner.sol L17–50 | observed |  |
| C34 | Curve 工厂的 createPool 没有访问控制，任何人都能为已注册的 Curve 池部署 hook 并建池 | [1] StableSwapAggregatorFactory.sol L58–65（无修饰符） | observed | F7 |
| C35 | 能否进入 Uniswap 生产路由，不取决于 hook 能否部署，而取决于路由端的选择 | 由 C34 与 notes-market M29–M31 推出 | inferred | F7 |
| C36 | 测试要先给 PoolManager 铸币，因为 hook 在路由器 settle 之前就从 PoolManager take 输入 | [1] test/aggregator-hooks/StableSwap/StableSwapFuzz.t.sol L339、L360 | observed | F3 |
| C37 | 生产上 hook 先借出的输入要靠 PoolManager 已有的代币库存或路由器先 settle，整个过程在 flash accounting 内原子完成 | 由 C1、C5、C36 推出 | inferred | F3 |
| C38 | 多个适配器把单跳滑点检查交给路由器，用户保护集中在路由器的最终最小输出 | 由 C28、C29 推出 | inferred | F4、N |
| C39 | 接入一个新的 V3 分叉主要是换 factory 和回调名：V3 / Pancake / Slipstream 共用一份实现 | 由 C21、C25 与 D1（已部署 SushiswapV3Aggregator）推出 | inferred | F4、N |
| D1 | 已部署 hook 的版本字符串包括 SushiswapV3、SushiswapV2、PancakeSwapV3、FluidDexT1、StableSwapNG、LitePSM、Slipstream Aggregator v1.0 | [5] cast call aggregatorHookVersion()（Ethereum、Base） | observed | F4、F8、S |
| D2 | aggregator hook 的 HookSwap 事件最早出现在 2026-04-19（Ethereum）和 2026-05-01（Base），比 10-22 的公告早约半年 | [4] Dune 8999857 | observed | 导语、D、E、F8 |
| D3 | 2026-10-08 到上线前，Ethereum 上经 aggregator hook 的成交约 2.31 亿美元、4,632 笔交易；上线后约 1.5 天 1,860 万美元、490 笔 | [4] Dune 8999850 | observed | O |
| D4 | 上线后 Base 每日交易数约从 110 笔升到约 900 笔，Robinhood 从约 7 笔升到约 130 笔；Ethereum 每日笔数基本不变（约 320） | [4] Dune 8999850，按窗口天数折算 | observed | O、F9 |
| D5 | 窗口内 Ethereum 的 aggregator hook 成交额 99.6% 来自 LitePSM 系列 hook（USDC/USDS、DAI/USDC） | [4] Dune 8999852 | observed | 导语、D、F8 |
| D6 | 约七成的 hook swap 发生在直接调用 Uniswap Universal Router 的交易里（上线后 Ethereum 393/556、Base 1,217/1,738、Robinhood 193/244） | [4] Dune 8999850；[6] 部署页 Universal Router 地址 | observed | D、O、F9 |
| D7 | 上线前有 0x AllowanceHolder 和 ERC-4337 EntryPoint 发起的交易触及这些 hook | [4] 2026-09-01 起按 tx.to 汇总（Dune 标签 “Zeroex: AllowanceHolder”） | observed | F5 |
| D8 | Ethereum 上非 PSM 虚拟池的协议费多设为 10bp（40 pips × 25），部分 3bp；Base 为 3bp 或 1bp；LitePSM 池没有设置协议费 | [4] Dune 8999853（ProtocolFeeUpdated 最新值）；乘数见 C14 | observed | D、F6 |
| D9 | aggregator hook 实收协议费全历史约 2,500 美元，上线后 1.5 天约 433 美元 | [4] Dune 8999858（ProtocolFeesCollected） | observed | 导语、D、F8 |
| D10 | 目前量最大的来源（LitePSM）不收协议费，所以 aggregator hook 的成交额和协议费收入严重不成比例 | 由 D5、D8、D9 推出 | inferred | F8 |
| D11 | 公告主要是公开与扩面：Uniswap 路由早已在用这些 hook，上线头 1.5 天 Ethereum 没有跳升，Base 与 Robinhood 有明显增长 | 由 D2、D3、D4、D6 推出；只有 1.5 天数据 | inferred | F9 |
| D12 | 包含 aggregator hook swap 的交易，整笔 gas 中位数约 50–58 万（Ethereum 上线后 550,184） | [4] Dune 8999850 | observed | N、Q |
| D13 | 0x 的执行路径在上线前已触及 Uniswap 的 aggregator hook 池，说明第三方路由器在技术上可以、也确实部分用到了它们 | 由 D7 推出；样本小（112 笔），未核对具体路径 | inferred |  |
| M1 | Uniswap Labs 于 2026-10-22 宣布 Aggregator Hooks 在 Web App 与 API 上线，链为 Ethereum mainnet、Base、Robinhood Chain | [1] 博客首段 | observed | D、H |
| M2 | 官方称首发 7 个来源，覆盖这三条链 90% 以上的 DEX 活动，但没有列出这 7 个来源，也没有给口径 | [1] 博客首段；正文无清单 | observed | H、Q |
| M3 | 官方文档列出的支持来源是 Curve、Fluid、PancakeSwap V3、Slipstream、Uniswap V2/V3 及分叉、LitePSM “and more” | [3] Hooks 表格 Aggregator Hooks 行 | observed |  |
| M4 | 官方说法是每个 hook 包装一个外部源，“any router sees it as a Uniswap pool”，路由器每个区块拉一次报价，整条路径单笔结算，“nothing new to approve” | [1] How Aggregator Hooks work 一节 | observed | C、F5 |
| M5 | 官方架构图里，Aggregator Hook Pools 和 Basic、Hooked Pools 并列于 v4 之下，入口是 Universal Router | [2] 图 | observed |  |
| M6 | Guidestar 报价走与标准报价相同的 Universal Router 和 Permit2，授权不变；beta 只支持 EXACT_INPUT，只在链 1、8453、4663 上 | [4] Guidestar Routing (Beta) 与 Supported Requests | observed | F5、M |
| M7 | Uniswap API 中的 Aggregator Hooks 很可能只通过 Guidestar beta 提供 | 由 M1、M6 推出：博客 API 链接指向 #guidestar-routing-beta，链集合与 Guidestar 完全一致；文档未直说 | inferred |  |
| M8 | 第一个生产部署的 aggregator hook 2026-03-18 在 Tempo 上线，包装 Tempo 原生稳定币 DEX | [10] How swaps work on Tempo 一节 | observed | E |
| M9 | The Block 引用发言人称 Tempo 只在 Web App 上支持 | [11] 检索与转载摘录（原文 403） | observed |  |
| M10 | 0x 的执行入口是 Settler，授权给 AllowanceHolder 或 Permit2，文档明确要求不要授权 Settler | [17] Contracts 与 FAQ | observed | M、F5 |
| M11 | 0x 标准方案对部分交易对收 0.15%，集成方可以用 swapFeeBps 另收费用 | [18] Pricing FAQ | observed | M |
| M12 | 1inch Classic 用 Pathfinder v6.1 在链下寻路并拆单，经 1inch Router 执行，API 带 partner fee 参数 | [19] Classic Swap Introduction 与 swap 方法参数 | observed | M、F5 |
| M13 | 1inch Fusion 是用户签单、荷兰式拍卖、质押 1INCH 的 resolver 成交并付 gas | [20] Intent Swap Introduction；Help Center | observed |  |
| M14 | CoW Protocol 用批量拍卖由 solver 竞争，用户授权给 GPv2VaultRelayer；官方承认存在恶意 solver 风险 | [21] Solvers、GPv2Settlement、VaultRelayer 页 | observed | F5 |
| M15 | Odos 用 router 加 executor 结构，收入来自正滑点和费用，官方称覆盖 1,100+ 来源 | [22] odos-router-v2 README；docs market 页 | observed |  |
| M16 | UniswapX 是 swapper 用 Permit2 签单、filler 竞争、Reactor 校验并拉取输入 | [23] Architecture Reactors 一节 | observed | M |
| M17 | UniswapXAggregator 把单张订单当作 hookData 流动性，hook 充当 filler，不提供报价，不参与协议费分类 | [9] README UniswapX (Dutch orders) Key Details | observed |  |
| M18 | 与传统聚合器相比，Aggregator Hooks 的差别在于：寻路仍在 Uniswap 链下路由器，但外部流动性以 v4 PoolKey 身份进入 PoolManager 结算，用户授权与费用都走 Uniswap 协议层 | 由 M4、M6、M10–M16、M23 推出：对比各方执行入口、授权目标与收费主体 | inferred | C、F5 |
| M19 | 适配器 hook 地址首字节编码协议（如 C1 Curve StableSwap、93 PancakeSwap V3、95 LitePSM、71 Tempo），用于路由识别同一外部池 | [9] README ID System 表 | observed |  |
| M20 | UNIfication 提案第 4 项是 “Launch aggregator hooks, turning Uniswap v4 into an onchain aggregator that collects fees on external liquidity” | [5] 提案编号清单第 4 条；blog.uniswap.org/unification 发布于 2025-11-10（2026-10-24 访问） | observed | E、H |
| M21 | UNIfication 称 aggregator hooks “add a programmatic UNI burn on top”，Labs 会把它们接入前端和 API | [5] Aggregator Hooks 一节 | observed | H |
| M22 | UNIfication 2025 年 12 月通过 | [27] Fees 文档 “passage … in December 2025” | observed |  |
| M23 | 费用经 adapter 送入不可变的 TokenJar，只有在 Firepit 烧 UNI 后才能取出；UNI 持有人无分红 | [5] Technical Implementation；[27] FAQ | observed | T |
| M24 | v4 费用提案给 aggregator hook 池设单独 family，费率乘以 25 以突破 10bp 硬上限，最高 250bp | [6] Aggregator hook pools 段 | observed | E、H、F6 |
| M25 | aggregator hook 协议费：Base 以外默认 10bp、部分稳定币对 3bp；Base 默认 3bp、稳定币对 1bp | [6] 同段费率清单；[7] 同文 | observed | D、F6 |
| M26 | 代码里协议费 = slot0 协议费 × protocolFeeMultiplier，从 unspecified 一侧 take 到 TokenJar | [9] ProtocolFees.sol `_getProtocolFee`、`_applyWithProtocolFee` | observed | F6 |
| M27 | Proposal 100 于 2026-07-27 执行，赞成 46.6M UNI、反对 1.27M UNI | [8] crypto.news（二手，官方投票页未能核对） | observed |  |
| M28 | 在 Uniswap 的 aggregator hook 池里，用户在外部场所费用之外还要付协议费（默认 10bp），数量级与 0x 的 0.15% 相近 | 由 M11、M25、M26 推出：两者都在场所费之外收取；口径不同（按交易对 vs 整单） | inferred |  |
| M29 | Uniswap 路由会自动收录部分 hook，另一些需人工 allowlist，allowlist 文件公开 | [14] Hook Allowlisting 一节 | observed | C、F7 |
| M30 | allowlist 标准包括不得修改或绕过 AMM 协议费、不得用可升级代理部署 | [15] 检索摘录（页面 403） | observed |  |
| M31 | allowlist 审核只针对路由兼容性，不是安全审计，也不是背书 | [16] 表单说明 | observed | F7、T |
| M32 | 0x 称在 6 条链上分析了 84,163 个 hook：19.4% safe、54.2% malicious、26.4% likely malicious，执行时最多比报价少 50%（截至 2026-09-11，0x 自己的分类） | [12] Malicious hooks 一节 | observed | E、H、F7 |
| M33 | 0x 称今年约 70% 的交易触及 Uniswap 流动性 | [12] 首段 | observed |  |
| M34 | Adams 回应 “skill issue”，0x 工程师声称至少有一个恶意 hook 在 Uniswap allowlist 上 | [13] Uniswap's pushback 一节（二手转述推文） | observed | F7 |
| M35 | Uniswap 官方和第三方都没有公开 Aggregator Hooks 的 gas 对比、报价与执行一致性或上线后成交量数据（截至 2026-10-24；本报告的量来自自建 Dune 查询，见 D 行） | [1][4] 无数字；本轮检索 Dune、DefiLlama、新闻均未找到 | observed | O |
| M36 | 没有找到 Curve、Fluid、PancakeSwap、Aerodrome、Sky 对 Aggregator Hooks 的官方表态，也没有找到“吸血鬼攻击”批评的一手来源 | 本轮检索未找到；[1][3] 未称是合作上线 | observed | O、Q |
| M37 | Messari 称 v4 中 hook 成交量大多数月份约占 1%，2026-08 升到 14%；Uniswap 全链 DEX 份额从 2024-01 的 45% 降到 2026-08 的 29% | [26] 检索摘录（全文未抓取） | observed |  |
| M38 | Uniswap 做聚合，部分动机是应对其他场所的份额增长；官方只说 “new liquidity can still form elsewhere” | 由 M37 与 [1] “Building aggregation into v4” 段推出 | inferred |  |
| M39 | EulerSwap 是 v4 hook，以 Euler vault 为流动性，在 beforeSwap 返回完整 BeforeSwapDelta 绕过 CL 计算，是“hook 包外部流动性”的先例 | [24] Euler Docs；[29] hooklist 条目 description | observed |  |
| M40 | PancakeSwap Infinity 也有 hooks，其 Universal Router 自动路由到 hook 池 | [25] Hooks 101 博客 Step 5 | observed |  |
| M41 | 第三方聚合器（0x、1inch 等）是否会把 Uniswap aggregator hook 池纳入路由，取决于它们对 hook 的审查和与 Uniswap 的竞争关系，短期内不确定 | 由 M4、M32、M33、M34 推出的预测；无直接证据 | speculative | P |
| M42 | 如果外部协议认为 Uniswap 在其流动性上收协议费、截流用户，可能出现抵制（例如限制回调调用方或在自家路由优先）；目前没有观察到 | 预测，前提见 M36（尚无表态） | speculative | P |
| M43 | 生产路由会进一步依赖 Uniswap Labs 维护的 allowlist 或注册表，而不是完全无许可 | 由 M29–M31 推出的趋势判断；成立条件：恶意 hook 问题（M32）持续 | speculative | P |
| M44 | 只有 Uniswap 公布执行质量数据、默认开启每跳滑点检查之后，安全争议才会缓解 | 条件判断，前提见 M34 与 [13] “Where it goes from here” | speculative | P |
| G1 | 与传统聚合器相比，Aggregator Hooks 把“外部协议适配器”从聚合器私有的执行合约，挪到了公开的 v4 池接口上：任何会调 v4 的路由器都能报价和执行 | 由 M4、C13、C19、D7 推出 | inferred | 导语、F5 |
| G2 | 主要技术优势是统一结算：原生 v4 池和外部来源可以在一次 unlock 里组合多跳，输入直接从 PoolManager 打给外部池，不经路由器中转 | 由 C1、C5、C22、C29、M4 推出 | inferred | N、F5 |
| G3 | 同一个外部池，经 aggregator hook 走比直接调用多付 1–10bp 协议费；对价格敏感、已有自家适配器的第三方聚合器，直连通常更便宜 | 由 C14、D8 与 M10–M15（各聚合器已有直连执行）推出 | inferred | C、F、F6 |
| G4 | 短期接受度主要来自 Uniswap 自己的 Web App 与 API 流量，量集中在稳定币兑换（PSM）和 Base 上的 Slipstream / Pancake；第三方聚合器不会大规模改走 hook 路径 | 预测；前提 D5、D6、D11、G3 成立，且协议费维持当前水平 | speculative | P |
| G5 | 外部协议短期多半中立：它们保留自己的 LP 费并多拿到成交；协议费抬高或 Uniswap 截走其前端流量时，摩擦才会出现 | 预测；前提 C13（储备与 LP 费留在原协议）、M36（尚无表态） | speculative | P |
| G6 | 长期看，Uniswap 的竞争点会从“谁的池子深”转到“谁掌握订单流”：协议费实际是对 Uniswap 自有订单流使用外部流动性收的费 | 预测；前提 D6（流量主要来自 Uniswap 路由器）、C14、M20–M21 | speculative | P |
| G7 | 围绕 hooks 的下一阶段，决定性的是路由端的 allowlist / 注册表和风险标注，而不是 hook 数量 | 预测；前提 C34–C35、M29–M32、M43 | speculative | P |
| G8 | GPT 资料把 UniswapX hook 的流动性描述为“solver 提供”，代码说明相反：hook 充当 filler，v4 swapper 是订单的对手方 | [notes-code 1] README UniswapX 段与 UniswapXAggregator.sol L20–25；对照 gpt-agg.md “UniswapX：没有持久池子”一节 | observed | R |
| G9 | 会出现更多“包装型 hook”：PSM、RWA 申赎、wrap / unwrap 这类零滑点兑换被包装成 v4 池 | 预测；前提 D5（LitePSM 已占 Ethereum 成交 99.6%）与 [notes-code 1] 已有 WETHHook、WstETHHook 同类官方 hook | speculative | P |

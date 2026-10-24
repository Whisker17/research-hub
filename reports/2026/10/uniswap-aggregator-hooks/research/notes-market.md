# notes-market：市场与对比分册（前缀 M）

报告：uniswap-aggregator-hooks｜调研日期：2026-10-24｜所有网页访问日期均为 2026-10-24。
说明：`research/gpt-agg.md` 只当线索用；下面每个论断都标了一手或二手来源。主会话负责的代码机制（Q1、Q2）这里不展开，只在核对市场说法时引用 `v4-hooks-public` 的 README 和 `ProtocolFees.sol`（main 分支，2026-10-24 克隆，commit 未固定，主会话的固定 commit 优先）。

---

## Q3 与一般聚合器的区别

**答案。** 1inch Classic、0x、Odos 这类聚合器在链下算路径，再让用户调用聚合器自己的路由合约，链上去逐个调用各 DEX。1inch Fusion、CoW、UniswapX 属于 intent 系统：用户签订单，由 resolver / solver / filler 竞争成交。Aggregator Hooks 把外部场所包装成 v4 的 `PoolKey`，“任何路由器”都能把它当 Uniswap 池来报价和路由。执行入口仍是 Universal Router 加 PoolManager，用户授权仍走 Permit2，收费方式也不同：协议费进 TokenJar 用于烧 UNI，不是聚合器或集成方的抽成。

**依据**
- 定位：官方原话 “Uniswap v4 is now an aggregator”，并说每个 hook 包装一个外部源，“so that any router sees it as a Uniswap pool”。路由器每个区块拉一次新报价，整条路径在一笔交易里结算，“nothing new to approve”[1]。官方图把 Aggregator Hook Pools（Curve / Fluid / PancakeSwap）和 Basic Pools、Hooked Pools 并列放在 Uniswap v4 之下，入口是 Universal Router [2]。
- 执行入口与授权：Guidestar（新的 AMM 路由引擎，beta）“execute through the same Universal Router and Permit2 contracts as standard quotes, so approvals … are unchanged”[4]。
- 0x：授权给 AllowanceHolder（推荐）或 Permit2，“never on the Settler”，执行入口是 Settler [17]。0x 对部分交易对收 0.15% 费用，集成方还可以用 `swapFeeBps` 自加费用 [18]。
- 1inch Classic（Pathfinder v6.1）：在链下找路径，可以拆单到不同协议和同一协议的不同深度，调用 1inch Aggregation Router 执行，API 有 partner fee 参数 [19]。1inch Fusion：用户签一个限价单，费率按荷兰式拍卖逐步下降，由 resolver 成交；resolver 要质押 1INCH 并注册，由它付 gas [20]。
- CoW Protocol：批量拍卖，solver 竞争，给批次带来最大盈余的方案胜出。用户授权给 `GPv2VaultRelayer`，结算合约是 `GPv2Settlement`；官方文档承认允许 solver interactions “creates the possibility of malicious solvers” [21]。
- Odos：路由合约加 executor 的结构，收入来自正滑点和费用（`swapMultiFee`、referral fee 留 20%），官方称覆盖 1,100+ 流动性来源和 16 条 EVM 链 [22]。
- UniswapX：swapper 用 Permit2 签订单，filler 竞争成交，Reactor 校验并通过 `permitWitnessTransferFrom` 拉取输入 [23]。仓库里的 `UniswapXAggregator` 反过来把单张 UniswapX 订单当作 hookData 流动性：hook 充当 filler，v4 的 swapper 提供对手方；它不提供路由报价，也不参与协议费分类 [9]。
- 流动性身份：外部池以 `PoolKey`、hook 地址出现，地址首字节编码协议（C1/C2 Curve、F1–F3 Fluid、03 V3、A1 Slipstream、93 PancakeSwap V3、95 LitePSM、02 V2、71 Tempo、58 UniswapX），方便路由识别“同一外部池被多次触及”[9]。

**不确定之处**
- “any router sees it as a Uniswap pool” 只是技术上可行。第三方聚合器（0x、1inch 等）有没有、会不会把这些 hook 池纳入路由，没有找到证据。
- 推断（researcher inference）：Uniswap API 里的 Aggregator Hooks 很可能只通过 Guidestar beta 提供（只支持 EXACT_INPUT、只在 Ethereum / Base / Robinhood Chain）。依据是博客的 API 链接直接指向 Guidestar 一节，而且两者支持的链完全一致 [1][4]。文档没有直接这么说。

## Q4 优劣势（市场侧数据）

**答案。** Uniswap 官方给的数字只有这些：7 个来源覆盖这三条链 “>90% DEX activity”、累计成交 $4.5T 以上、3 条链（Ethereum、Base、Robinhood Chain，另有 Tempo）。没有公开的 gas 对比、报价与执行偏差、价格改进数据。最实的经济参数来自治理提案：aggregator hook 池的协议费默认 10bp（Base 3bp），部分稳定币对 3bp（Base 1bp），上限 250bp。主要劣势是安全和信任：0x 与 Uniswap 公开争论过恶意 hook。

**依据**
- 覆盖面：“Seven sources are available at launch, covering more than 90% of DEX activity on these chains.” 博客没有点名这 7 个来源，也没有给口径 [1]。文档列出的是能力清单：Curve、Fluid、PancakeSwap V3、Slipstream、Uniswap V2 / V3 及分叉、LitePSM “and more”[3]。二手媒体也指出，博客没有给出 90% 的数据来源，也没有说明每条链具体开了哪些来源 [13 引用的 altcoinbuzz，作为线索]。
- 链：博客写 Ethereum mainnet、Base、Robinhood Chain [1]。The Block 引用发言人说 Tempo 只在 Web App 上支持 [11，二手]。Tempo 2026-03-18 已上线第一个 aggregator hook，用来包装 Tempo 原生的稳定币 DEX [10]。
- 协议费参数：aggregator hook family 收固定费率，乘数 25，突破 PoolManager 10bp 的硬上限，最高 250bp。默认 10bp（Base 3bp），部分稳定币对 3bp（Base 1bp）[6][7]。代码中 `protocolFee *= protocolFeeMultiplier`，费用从 unspecified 一侧 `take` 到 TokenJar [9]。
- 执行质量：Guidestar 文档称 “lower latency and improved execution quality over standard routing”，没有给数字 [4]。官方路由在 Web App 上有每跳滑点检查，OpenZeppelin 审计记载为可选项，传空数组就能绕过 [13，二手转述 OZ 审计，原审计未直接核对]。
- 价格对比（推断）：0x 的标准费是 0.15%（部分交易对）[18]，aggregator hook 协议费默认 0.10%（Base 0.03%）[6]，都是在场所费用之外另收。但两者口径不同：协议费是按笔、按交易对收的，并非聚合器整单费，所以只能说两者在同一个数量级。
- 安全争议：0x（2026-09-14）分析了 6 条链上的 84,163 个 hook，结论是 19.4% safe、54.2% malicious、26.4% likely malicious，执行时最多比报价少 50%；数据截至 2026-09-11，是 0x 自己的分类 [12]。Hayden Adams 回应 “skill issue”，Dan Robinson 称应该叫 “0x routing made a mistake”；0x 的 Duncan Townsend 声称至少有一个恶意 hook 在 Uniswap allowlist 上，Philip Liao 举了一笔 Robinhood Chain 交易：一跳被抽走 4.8%，占整单 1.2% [13，二手转述推文，原推文未直接打开]。CryptoSlate 指出，Aggregator Hooks 是 Uniswap 自己写的适配器，和 0x 分析的第三方 hook 不是同一类风险面 [13]。

**不确定之处**
- 没有找到 Aggregator Hook 和直接调用外部池、或 1inch / 0x 路由之间的 gas 实测。
- 没有找到上线后的报价与执行一致性数据。
- 90% 的口径（按成交量还是交易数？时间窗口？）未公开。

## Q5 市场接受度

**答案。** 到 2026-10-24，主网上线只有两天，没有找到 aggregator hook 成交量的官方或第三方数据（Dune、DefiLlama、Uniswap 推文都没有）。Curve、Fluid、PancakeSwap、Aerodrome、Sky 的官方表态，以及“吸血鬼攻击”或“在别人的流动性上收协议费”的公开批评，都没有找到一手来源。目前最明显的外部声音是 0x 在上线前对 v4 hook 整体安全的批评。

**依据**
- 上线时间：主网版本 2026-10-22 发布 [1]，Tempo 版本 2026-03-18 发布 [10]。
- 背景数据：Messari 称 v4 中 hook 成交量大多数月份约占 1%，2026 年 8 月升到 14%；Uniswap 全链 DEX 份额从 2024-01 的 45% 降到 2026-08 的 29% [26，二手，只拿到检索摘录，全文 429 抓取失败]。推断：份额在下降，这是 Uniswap 把外部流动性纳入自身路由的动机之一。Uniswap 官方只说 “new liquidity can still form elsewhere”[1]。
- 数据基础设施：Uniswap Labs 在 Dune 有一个 “Hook Labels” 查询，注释写着与 uniroute 的 `HOOKS_ADDRESSES_ALLOWLIST` 对齐（只看到检索摘录）[检索线索，未计入来源]。没有找到专门统计 aggregator hook 的看板。
- 0x 自报今年 81.92M 笔交易、$42.67B 成交，约 70% 的交易触及 Uniswap 流动性 [12]。推断：Uniswap 自己做聚合，和 0x 这类既是下游路由方又是竞争者的角色形成直接竞争。0x 的批评有竞争方立场，CryptoSlate 也点明了这一点 [13]。

**不确定之处**
- 外部协议（Curve、Fluid、PancakeSwap、Aerodrome/Velodrome、Sky）是否知情、合作或反对，都未找到资料。博客和文档没有说是合作上线。
- 第三方聚合器会不会路由这些 hook 池未知。
- 接受度的驱动与阻力目前只能推断，见 Q6 和台账中的 speculative 行。

## Q6 走向与叙事

**答案。** Aggregator Hooks 来自 2025 年 11 月的 UNIfication 提案（第 4 项：“Launch aggregator hooks, turning Uniswap v4 into an onchain aggregator that collects fees on external liquidity”），与协议费开关、TokenJar / Firepit 烧 UNI 机制绑在一起。2026-07 的 v4 协议费提案（Proposal 100）给 aggregator hook 单独设了一个费率 family；据二手报道，该提案 7 月 27 日执行。路由端有 allowlist：自动收录和人工审核并存，审核标准包括不得绕过协议费、不得用可升级代理。同类先例有 EulerSwap（v4 hook，用借贷 vault 做流动性）和 PancakeSwap Infinity 的 hooks；但“把别的 DEX 的现成池子包成本协议的池子并收协议费”这一做法，Uniswap 是目前查到的第一个官方落地。

**依据**
- 起源：UNIfication 第 4 项原文如上；“These hooks source liquidity from other onchain protocols and add a programmatic UNI burn on top”；Labs 会把它们接入前端和 API。路线图写的是 fees 可以开到 “v4, UniswapX, PFDA, and aggregator hooks”，并说 aggregator hooks 的 adapter “in progress”[5]。UNIfication 2025 年 12 月通过 [27 的同站 Fees 文档写 “passage … in December 2025”]。
- 费用机制：每个费用源有一个 adapter，把费用送进不可变的 TokenJar，只有在 Firepit 烧掉 UNI 后才能取出 [5]。UNI 持有人不分红，费用由 searcher 支付 UNI 来领取，所付 UNI 被烧掉 [27]。
- v4 费用 family：V4FeePolicy / V4FeeAdapter，按 family 计费，hook 可以自带 flag 加入某个 family [6]。Proposal 100 覆盖 Ethereum、Arbitrum、Base、BNB Chain、Polygon、Optimism、Robinhood Chain [7]。二手报道称 7 月 27 日执行，赞成 46.6M UNI、反对 1.27M [8]。UniswapX aggregator 的 `protocolFeeFlags()` 返回 0，不收协议费 [9]。
- Allowlist：官方文档说 “Uniswap Labs routing picks up many hooks automatically. Some hooks have to be reviewed and allowlisted”，并链接公开的 allowlist 文件（uniroute-public）[14]。审核标准（检索摘录，页面直接抓取返回 403）：已部署在 Uniswap Labs 支持的主网上、代码已在浏览器验证、“should not modify or bypass the AMM protocol fee”、“must not be deployed through a proxy contract which permits upgrading” [15]。审核表单写明 “This review is solely for routing-compatibility purposes. It is not a security audit or an endorsement” [16]。CryptoSlate 称该指引 10 月 16 日更新：使用 beforeSwap、afterSwap、delta-return 或 dynamic-fee 权限的 hook 需要人工审核 [13，二手]。
- 同类先例：EulerSwap 是 v4 hook，在 beforeSwap 中通过 Euler vault 走资金，并返回完整的 BeforeSwapDelta，绕过 CL 计算 [24][29]。PancakeSwap Infinity 有 hooks，Universal Router 会自动路由到 hook 池 [25]。Bunni v2 用 BunniHook 加 am-AMM，仓库提示 v2 曾被攻击；Angstrom 用 beforeSwap 限制只有质押验证者能调用；Balancer v3 有池级 hooks 和 ERC4626 buffers [28]。Ekubo extensions 本轮未核对。
- UNIfication 还写到 “Empower hook builders. Provide engineering support, routing, support in Labs’ interfaces” [5]。

**不确定之处**
- 博客说的 7 个来源是哪 7 个、各链开了哪些，未公开。
- 推断：README 里列了 Balancer 的 ID 字母（“b” for Balancer）和 FluidDexV2（“Mainnet launch TBD”），说明后续还会接更多来源；不过 Balancer 没有对应实现，这只是示例 [9]。
- 预测（全部 speculative，见台账）：路由会不会成为“注册表 / 白名单驱动的生产路由”，外部协议会不会抵制。

---

## 来源

1. **PRIMARY** Uniswap Labs，“Aggregator Hooks are Now Live”，2026-10-22。证明：上线、链、“seven sources … >90%”、每区块报价、单笔结算、不需新授权、协议费用于烧 UNI、$4.5T。https://blog.uniswap.org/aggregator-hooks-are-now-live （访问 2026-10-24）
2. **PRIMARY** 同一博客的架构图。证明：Universal Router → v2 / v3 / v4（Basic、Hooked、Aggregator Hook Pools: Curve、Fluid、PancakeSwap），图中有拆单示例。https://images.ctfassets.net/oc3ca6rftwdu/1d9lDx34z6TRSYV6EoosXQ/5751f1e3722a76ca94e61d69cae04f6d/Slide_16_9_-_23.png （2026-10-24）
3. **PRIMARY** Uniswap Developers，Uniswap Labs Hooks Overview。证明：Aggregator Hooks 支持的来源清单（含 “and more”）。https://developers.uniswap.org/docs/protocols/uniswap-labs-hooks （2026-10-24）
4. **PRIMARY** Uniswap Developers，AMM vs UniswapX Routing（含 Guidestar beta）。证明：Guidestar 走同一套 Universal Router 与 Permit2；只支持 EXACT_INPUT 和 1 / 8453 / 4663 三条链；UniswapX 的 300 USDC、0.2% 门槛。https://developers.uniswap.org/docs/trading/swapping-api/amm-vs-uniswapx-routing （2026-10-24）
5. **PRIMARY** Uniswap Labs / Uniswap Foundation，“UNIfication”（治理帖 gov.uniswap.org/t/unification-proposal/25881）。证明：aggregator hooks 是第 4 项；TokenJar / Firepit；adapter in progress；Labs 的接口费、API 费归零。https://blog.uniswap.org/unification （2026-10-24）
6. **PRIMARY** Uniswap Labs，“[Temp Check] Activate v4 Protocol Fees”，2026-07-07。证明：family 机制、aggregator hook 费率与 25 倍乘数、250bp 上限。https://gov.uniswap.org/t/temp-check-activate-v4-protocol-fees/26162/1 （2026-10-24）
7. **PRIMARY** Tally，Proposal 100 “Activate v4 Protocol Fees (Part 1/2)”。证明：链上提案文本，覆盖 7 条链，投票 2026-07-19 至 26。https://www.tally.xyz/gov/uniswap/proposal/100 （2026-10-24）
8. crypto.news，“Uniswap v4 fees leave LP rates unchanged, Adams says”（二手）。证明：Proposal 100 于 7 月 27 日执行，票数（未在官方投票页核对，vote.uniswapfoundation.org 抓取失败）。https://crypto.news/uniswap-v4-fees-leave-lp-rates-unchanged-adams-says/ （2026-10-24）
9. **PRIMARY** Uniswap/v4-hooks-public，`src/aggregator-hooks/README.md` 与 `ProtocolFees.sol`（main，2026-10-24 克隆）。证明：适配器清单、地址 ID 表、UniswapX 不收协议费、协议费乘数与流向 TokenJar。https://github.com/Uniswap/v4-hooks-public/tree/main/src/aggregator-hooks （2026-10-24）
10. **PRIMARY** Uniswap Labs，“Uniswap is Live on Tempo”，2026-03-18。证明：第一个生产部署的 aggregator hook 包装 Tempo 稳定币 DEX；API 无按笔费用。https://blog.uniswap.org/uniswap-is-live-on-tempo （2026-10-24）
11. The Block，2026-10-22（二手，直接抓取 403，只看到检索与转载摘录）。证明：Tempo 只在 Web App 上支持（引用发言人），Fluid / Curve / PancakeSwap 在首发之列。https://www.theblock.co/news/defi/2026-10-22-uniswaps-aggregator-hooks-go-live-ethereum-base-robinhood-chain-421932 （2026-10-24）
12. **PRIMARY**（对 0x 自身数据而言）0x，“Uniswap v4 hooks were a mistake”，2026-09-14。证明：84,163 个 hook 的分类、最多 50% 差额、0x 约 70% 交易触及 Uniswap。https://0x.org/post/uniswap-v4-hooks-were-a-mistake （2026-10-24）
13. CryptoSlate，“Uniswap adds seven trading sources as 0x disputes its protection from malicious hooks”（二手）。证明：Adams、Robinson、Townsend、Liao 推文的转述，路由指引 10 月 16 日更新，OZ 审计里每跳滑点检查是可选项。https://cryptoslate.com/uniswap-adds-seven-trading-sources-as-0x-disputes-its-protection-from-malicious-hooks/ （2026-10-24）
14. **PRIMARY** Uniswap Developers，Integrated Routing with UniswapX（hook-routing）。证明：自动收录与人工 allowlist 并存，公开 allowlist 文件。https://developers.uniswap.org/docs/protocols/v4/concepts/hook-routing （2026-10-24）
15. **PRIMARY**（只拿到检索摘录，页面 403）Uniswap Support，“Routing for hooked pools”。证明：allowlist 标准（不得绕过协议费、不得可升级代理等）。https://support.uniswap.org/hc/en-us/articles/48291859140621-Routing-for-hooked-pools （2026-10-24）
16. **PRIMARY**（检索摘录）Uniswap v4 Hooks Routing Allowlist 表单。证明：审核只针对路由兼容性，不是安全审计，也不是背书。https://developers.uniswap.org/hook-allowlist （2026-10-24）
17. **PRIMARY**（检索摘录）0x Docs，Contracts / FAQ / Get Started。证明：授权给 AllowanceHolder 或 Permit2，不要授权给 Settler；Settler 是执行入口。https://docs.0x.org/docs/core-concepts/contracts （2026-10-24）
18. **PRIMARY**（检索摘录）0x Pricing / FAQ。证明：0x 对部分交易对收 0.15%，集成方用 swapFeeBps 加费。https://0x.org/pricing （2026-10-24）
19. **PRIMARY**（检索摘录）1inch Business，Classic Swap Introduction。证明：Pathfinder v6.1 链下寻路与拆单，Router 执行，有 partner fee 参数。https://business.1inch.com/portal/documentation/apis/swap/classic-swap/introduction （2026-10-24）
20. **PRIMARY**（检索摘录）1inch Intent Swap（Fusion）文档与 Help Center。证明：荷兰式拍卖、resolver 质押 1INCH、resolver 付 gas。https://business.1inch.com/portal/documentation/apis/swap/intent-swap （2026-10-24）
21. **PRIMARY**（检索摘录）CoW Protocol Docs：Solvers、GPv2Settlement、GPv2VaultRelayer。证明：批量拍卖、solver 竞争、VaultRelayer 授权、恶意 solver 风险。https://docs.cow.fi/cow-protocol/concepts/introduction/solvers （2026-10-24）
22. **PRIMARY**（检索摘录）odos-xyz/odos-router-v2 README 与 docs.odos.xyz/use/market。证明：router 加 executor，收入来自正滑点和费用，覆盖 1,100+ 来源。https://github.com/odos-xyz/odos-router-v2 （2026-10-24）
23. **PRIMARY**（检索摘录）Uniswap Developers，UniswapX Overview / Architecture。证明：Permit2 签名订单、filler 竞争、Reactor 用 permitWitnessTransferFrom 拉取输入。https://developers.uniswap.org/docs/liquidity/uniswapx/concepts/architecture （2026-10-24）
24. **PRIMARY**（检索摘录）Euler Docs，EulerSwap。证明：v4 hook 兼容，流动性来自 Euler vault，JIT 借贷。https://docs.euler.finance/developers/euler-swap （2026-10-24）
25. **PRIMARY**（检索摘录）PancakeSwap Infinity Hooks 文档与博客。证明：Infinity 有 hooks，Universal Router 自动路由到 hook 池。https://docs.pancakeswap.finance/trade/pancakeswap-infinity/hooks （2026-10-24）
26. Messari，“The UNIverse Expands”（二手，只拿到检索摘录，全文 429）。证明：hook 成交量占 v4 的比例、Uniswap 份额从 45% 降到 29%。https://messari.io/report/the-un-iverse-expands （2026-10-24）
27. **PRIMARY**（检索摘录）Uniswap Developers，Governance FAQs 与 Fees 文档。证明：持有人不分红，searcher 支付 UNI 换取 TokenJar 资产，UNIfication 2025 年 12 月通过。https://developers.uniswap.org/docs/ecosystem/governance/faqs （2026-10-24）
28. **PRIMARY**（检索摘录）Bunni Docs / bunni-v2 README、Angstrom Docs、Balancer v3 Hooks 文档。证明：其他用 hook 做自定义执行或流动性的先例。https://docs.bunni.xyz/docs/v2/technical/overview ；https://docs.angstrom.xyz/ ；https://docs.balancer.fi/concepts/core-concepts/hooks.html （2026-10-24）
29. **PRIMARY**（检索摘录）Uniswap/hooklist，EulerSwap Arbitrum 条目。证明：Uniswap 维护的 hook 元数据描述 EulerSwap 返回完整 BeforeSwapDelta。https://raw.githubusercontent.com/Uniswap/hooklist/main/hooks/arbitrum/0x40868f771ac10192099308b387af180a101068a8.json （2026-10-24）

降级或排除：altcoinbuzz、Binance Square、Bitget、cryptonomist、KuCoin、Gate、spotedcrypto 都只是转载或 SEO 稿，只当线索。ClawHub、jindage 的 TokenJar skill 页面与主题无关。Arcsmith、DexHooks 看板是第三方，口径不明。

## 开放问题

1. 首发 7 个来源各是什么、各链开了哪些；90% 的口径。
2. Aggregator hook 池上线后的成交量和协议费收入（需要 hook 地址后自己建 Dune 查询）。
3. Proposal 100 的执行状态需在官方投票页或链上核对：PoolManager 的 `protocolFeeController` 是否已设为 V4FeeAdapter，aggregator hook 的费率是否已生效。
4. 外部协议（Curve、Fluid、PancakeSwap、Aerodrome、Sky）与第三方聚合器的官方表态。
5. 有没有每跳滑点检查默认开启、报价与执行一致性的公开数据。
6. Aggregator hook 本身是否在 uniroute 的 allowlist 中，以及它背后的外部池如何筛选（CryptoSlate 提到的 Enso 有毒 Curve 池问题）。

---

## 台账

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| M1 | Uniswap Labs 于 2026-10-22 宣布 Aggregator Hooks 在 Web App 与 API 上线，链为 Ethereum mainnet、Base、Robinhood Chain | [1] 博客首段 | observed |
| M2 | 官方称首发 7 个来源，覆盖这三条链 90% 以上的 DEX 活动，但没有列出这 7 个来源，也没有给口径 | [1] 博客首段；正文无清单 | observed |
| M3 | 官方文档列出的支持来源是 Curve、Fluid、PancakeSwap V3、Slipstream、Uniswap V2/V3 及分叉、LitePSM “and more” | [3] Hooks 表格 Aggregator Hooks 行 | observed |
| M4 | 官方说法是每个 hook 包装一个外部源，“any router sees it as a Uniswap pool”，路由器每个区块拉一次报价，整条路径单笔结算，“nothing new to approve” | [1] How Aggregator Hooks work 一节 | observed |
| M5 | 官方架构图里，Aggregator Hook Pools 和 Basic、Hooked Pools 并列于 v4 之下，入口是 Universal Router | [2] 图 | observed |
| M6 | Guidestar 报价走与标准报价相同的 Universal Router 和 Permit2，授权不变；beta 只支持 EXACT_INPUT，只在链 1、8453、4663 上 | [4] Guidestar Routing (Beta) 与 Supported Requests | observed |
| M7 | Uniswap API 中的 Aggregator Hooks 很可能只通过 Guidestar beta 提供 | 由 M1、M6 推出：博客 API 链接指向 #guidestar-routing-beta，链集合与 Guidestar 完全一致；文档未直说 | inferred |
| M8 | 第一个生产部署的 aggregator hook 2026-03-18 在 Tempo 上线，包装 Tempo 原生稳定币 DEX | [10] How swaps work on Tempo 一节 | observed |
| M9 | The Block 引用发言人称 Tempo 只在 Web App 上支持 | [11] 检索与转载摘录（原文 403） | observed |
| M10 | 0x 的执行入口是 Settler，授权给 AllowanceHolder 或 Permit2，文档明确要求不要授权 Settler | [17] Contracts 与 FAQ | observed |
| M11 | 0x 标准方案对部分交易对收 0.15%，集成方可以用 swapFeeBps 另收费用 | [18] Pricing FAQ | observed |
| M12 | 1inch Classic 用 Pathfinder v6.1 在链下寻路并拆单，经 1inch Router 执行，API 带 partner fee 参数 | [19] Classic Swap Introduction 与 swap 方法参数 | observed |
| M13 | 1inch Fusion 是用户签单、荷兰式拍卖、质押 1INCH 的 resolver 成交并付 gas | [20] Intent Swap Introduction；Help Center | observed |
| M14 | CoW Protocol 用批量拍卖由 solver 竞争，用户授权给 GPv2VaultRelayer；官方承认存在恶意 solver 风险 | [21] Solvers、GPv2Settlement、VaultRelayer 页 | observed |
| M15 | Odos 用 router 加 executor 结构，收入来自正滑点和费用，官方称覆盖 1,100+ 来源 | [22] odos-router-v2 README；docs market 页 | observed |
| M16 | UniswapX 是 swapper 用 Permit2 签单、filler 竞争、Reactor 校验并拉取输入 | [23] Architecture Reactors 一节 | observed |
| M17 | UniswapXAggregator 把单张订单当作 hookData 流动性，hook 充当 filler，不提供报价，不参与协议费分类 | [9] README UniswapX (Dutch orders) Key Details | observed |
| M18 | 与传统聚合器相比，Aggregator Hooks 的差别在于：寻路仍在 Uniswap 链下路由器，但外部流动性以 v4 PoolKey 身份进入 PoolManager 结算，用户授权与费用都走 Uniswap 协议层 | 由 M4、M6、M10–M16、M23 推出：对比各方执行入口、授权目标与收费主体 | inferred |
| M19 | 适配器 hook 地址首字节编码协议（如 C1 Curve StableSwap、93 PancakeSwap V3、95 LitePSM、71 Tempo），用于路由识别同一外部池 | [9] README ID System 表 | observed |
| M20 | UNIfication 提案第 4 项是 “Launch aggregator hooks, turning Uniswap v4 into an onchain aggregator that collects fees on external liquidity” | [5] 提案编号清单第 4 条 | observed |
| M21 | UNIfication 称 aggregator hooks “add a programmatic UNI burn on top”，Labs 会把它们接入前端和 API | [5] Aggregator Hooks 一节 | observed |
| M22 | UNIfication 2025 年 12 月通过 | [27] Fees 文档 “passage … in December 2025” | observed |
| M23 | 费用经 adapter 送入不可变的 TokenJar，只有在 Firepit 烧 UNI 后才能取出；UNI 持有人无分红 | [5] Technical Implementation；[27] FAQ | observed |
| M24 | v4 费用提案给 aggregator hook 池设单独 family，费率乘以 25 以突破 10bp 硬上限，最高 250bp | [6] Aggregator hook pools 段 | observed |
| M25 | aggregator hook 协议费：Base 以外默认 10bp、部分稳定币对 3bp；Base 默认 3bp、稳定币对 1bp | [6] 同段费率清单；[7] 同文 | observed |
| M26 | 代码里协议费 = slot0 协议费 × protocolFeeMultiplier，从 unspecified 一侧 take 到 TokenJar | [9] ProtocolFees.sol `_getProtocolFee`、`_applyWithProtocolFee` | observed |
| M27 | Proposal 100 于 2026-07-27 执行，赞成 46.6M UNI、反对 1.27M UNI | [8] crypto.news（二手，官方投票页未能核对） | observed |
| M28 | 在 Uniswap 的 aggregator hook 池里，用户在外部场所费用之外还要付协议费（默认 10bp），数量级与 0x 的 0.15% 相近 | 由 M11、M25、M26 推出：两者都在场所费之外收取；口径不同（按交易对 vs 整单） | inferred |
| M29 | Uniswap 路由会自动收录部分 hook，另一些需人工 allowlist，allowlist 文件公开 | [14] Hook Allowlisting 一节 | observed |
| M30 | allowlist 标准包括不得修改或绕过 AMM 协议费、不得用可升级代理部署 | [15] 检索摘录（页面 403） | observed |
| M31 | allowlist 审核只针对路由兼容性，不是安全审计，也不是背书 | [16] 表单说明 | observed |
| M32 | 0x 称在 6 条链上分析了 84,163 个 hook：19.4% safe、54.2% malicious、26.4% likely malicious，执行时最多比报价少 50%（截至 2026-09-11，0x 自己的分类） | [12] Malicious hooks 一节 | observed |
| M33 | 0x 称今年约 70% 的交易触及 Uniswap 流动性 | [12] 首段 | observed |
| M34 | Adams 回应 “skill issue”，0x 工程师声称至少有一个恶意 hook 在 Uniswap allowlist 上 | [13] Uniswap's pushback 一节（二手转述推文） | observed |
| M35 | 没有找到 Aggregator Hooks 的公开 gas 对比、报价与执行一致性或上线后成交量数据（截至 2026-10-24） | [1][4] 无数字；本轮检索 Dune、DefiLlama、新闻均未找到 | observed |
| M36 | 没有找到 Curve、Fluid、PancakeSwap、Aerodrome、Sky 对 Aggregator Hooks 的官方表态，也没有找到“吸血鬼攻击”批评的一手来源 | 本轮检索未找到；[1][3] 未称是合作上线 | observed |
| M37 | Messari 称 v4 中 hook 成交量大多数月份约占 1%，2026-08 升到 14%；Uniswap 全链 DEX 份额从 2024-01 的 45% 降到 2026-08 的 29% | [26] 检索摘录（全文未抓取） | observed |
| M38 | Uniswap 做聚合，部分动机是应对其他场所的份额增长；官方只说 “new liquidity can still form elsewhere” | 由 M37 与 [1] “Building aggregation into v4” 段推出 | inferred |
| M39 | EulerSwap 是 v4 hook，以 Euler vault 为流动性，在 beforeSwap 返回完整 BeforeSwapDelta 绕过 CL 计算，是“hook 包外部流动性”的先例 | [24] Euler Docs；[29] hooklist 条目 description | observed |
| M40 | PancakeSwap Infinity 也有 hooks，其 Universal Router 自动路由到 hook 池 | [25] Hooks 101 博客 Step 5 | observed |
| M41 | 第三方聚合器（0x、1inch 等）是否会把 Uniswap aggregator hook 池纳入路由，取决于它们对 hook 的审查和与 Uniswap 的竞争关系，短期内不确定 | 由 M4、M32、M33、M34 推出的预测；无直接证据 | speculative |
| M42 | 如果外部协议认为 Uniswap 在其流动性上收协议费、截流用户，可能出现抵制（例如限制回调调用方或在自家路由优先）；目前没有观察到 | 预测，前提见 M36（尚无表态） | speculative |
| M43 | 生产路由会进一步依赖 Uniswap Labs 维护的 allowlist 或注册表，而不是完全无许可 | 由 M29–M31 推出的趋势判断；成立条件：恶意 hook 问题（M32）持续 | speculative |
| M44 | 只有 Uniswap 公布执行质量数据、默认开启每跳滑点检查之后，安全争议才会缓解 | 条件判断，前提见 M34 与 [13] “Where it goes from here” | speculative |

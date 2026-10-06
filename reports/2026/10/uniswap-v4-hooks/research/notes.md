# 调研笔记索引：Uniswap v4 Hooks

调研分四册并行完成（2026-10-06，网页来源均在当天访问）。合并台账见 [ledger.md](ledger.md)（248 行：observed 197 / inferred 39 / speculative 12；含 G 前缀 20 行）。用户资料见 [references.md](references.md)。

| 分册 | brief 研究问题 | 一句话答案 |
|---|---|---|
| [notes-mechanism.md](notes-mechanism.md) | 1 机制与一个简单 hook 的生命周期；6 的 gas | 所有池子存在一个 PoolManager 里；外部合约先 `unlock`，在回调里操作，每个操作只在 transient storage 记一笔 delta，退出前必须全部结清。hook 是地址低 14 位编码权限的外部合约，可以拒绝、改费率、改记账。以 v4-template 的 Counter 走完部署、建池、加流动性、swap、移除流动性。建池 51,532 gas，v3 为 4,557,092 gas。 |
| [notes-v3.md](notes-v3.md) | 2 能否在 v3 上实现；6 工程与安全 | v3 的回调只回调调用者自己、用于付款，没有“对所有调用者强制执行”的入口；router 层的近似都能被直接调池子绕过。真正离不开 v4 的是单例、flash accounting、return delta。v4 hook 事故都出在 hook 自己的逻辑（Cork、Bunni）；聚合器不会自动路由带 hook 的池子。 |
| [notes-rwa.md](notes-rwa.md) | 3 合规 / RWA hook；4 股票 quote launchpad 池内毕业；对 Mantle 的意义 | 池内所有权变化（delta、ERC-6909 claim、LP 头寸）不触发代币 transfer 检查，准入必须放在池层。官方 Permissioned Pools = Permissions Adapter（虚拟代币）+ 共享 PermissionedHooks（四个回调），只在 Ethereum 与 Sepolia。“hook 内曲线 + 同池毕业”只有一个测试网开源实现（untoll-hook）。xStocks 在 EVM 上是 rebase 代币，不能直接放进 v4 池。Mantle 支持 EIP-1153，但官方部署表里没有 Mantle 的 v4。 |
| [notes-others.md](notes-others.md) | 5 其他代表性 hook | 选了 5 个，按改动由浅到深：Clanker 动态费（只改费用）、OpenZeppelin LimitOrderHook（hook 自有头寸实现订单）、Doppler（hook 挪头寸拼出拍卖曲线）、Angstrom（节点门禁 + 批量结算）、Bunni v2（return delta 整个替换曲线和记账，2025-09 被利用约 $8.4M 后停运）。改得越深，信任面和攻击面越大。 |

## 主会话抽查（2026-10-06）

- v4-core @ `46c6834` 的 `Hooks.sol` 14 个权限位、`PoolManager.unlock` 的结清检查：与源码一致。
- Permissioned Pools 架构页：四个合约、四个回调（beforeInitialize / beforeSwap / afterSwap / beforeAddLiquidity）、双重 allowlist 检查：与官方文档一致。
- xStocks 文档：EVM 上 `balanceOf()` 随 multiplier 直接调整：与官方文档一致。
- Uniswap `deployments.json`（generatedAt 2026-09-22）：Mantle（5000）只有 v3、Permit2、Universal Router，没有 v4 PoolManager；v4 部署在 25 条链上：一致。

## 资料中被修正或需要细化的地方

- “v4 上代币黑名单看不到池内换手”需要细化：`take` 仍是一次真实 ERC-20 转账，代币能看到最终收款人；看不到的是 ERC-6909 claim 的铸造与转让、LP 头寸，以及多跳里不落地的中间币（V 分册 Q2、R 分册 Q1）。
- Tape 方案 §6.4.2 设想监听 `UIMultiplierUpdated` 并“调整 tick 参照系”：xStocks EVM 的事件是 `MultiplierScheduled` / `MultiplierUpdated`，multiplier 按时间戳自动生效；v4 hook 也没有调整 tick 参照系的接口（R 分册 4.3）。
- Tape 方案写 PoolManager 头寸“NFT 送进无出口 locker”；同池毕业的参考实现里头寸由 hook 自己持有、不发 NFT。两种都可行，前提不同（R 分册 4.1）。
- HIMS / AMC 周末偏离有 4.6 倍、112%、35 倍、72.3 倍几种口径，互相矛盾（R 分册 4.3）。

## 融合外部 Deep Research（2026-10-06）

用户在把关 ② 时提供了一份 GPT Deep Research 输出，已用 `rh import research` 存为 [gpt-deep-research.md](gpt-deep-research.md)。处理方式：
- 当作线索。它新增的事实（StablePair、Angstrom L2、DualPool、WETH / wstETH hook、SMBC Nikko、UF 的 hook 数量、Permissioned Pools 修复提交、Mantle 原生币为 MNT）由主会话追到一手来源后登记为 G1–G12、G19；未能核实的（PureFi）记为 speculative（G18）。
- 采纳它的分析框架：同池毕业的 A / B / C 三类架构、毕业价预初始化、储备配比与价格连续性（例子已复算，G13）、跨阈值订单的三种处理方式（G17）、股票美元预言机不能约束 meme 价格（G14）、许可代币不能当中间跳对股票 quote launchpad 的影响（G15）。
- 冲突处理：它称“没有检索到 Tape 的设计文档”，本报告有用户资料 `tape-design.md`，以资料为准；它的 v4-core 基准 `59d3ecf` 与本报告 `46c6834` 合约源码相同（G19）。

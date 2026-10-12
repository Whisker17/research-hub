# notes-mechanism：机制、链上核对与经济测算（lane = mechanism，前缀 M）

> 调研时间：2026-10-13（UTC+8）。链上读取都在 HyperEVM 主网（chain 999）上做，主要读数固定在区块 48361303（2026-10-12 17:12:48 UTC）前后。
> 产出说明：本路的 delegate agent 到 60 分钟上限时被终止，没有写出笔记。它的命令和输出都留在运行日志里（`async-subagent-runs/4e3e2630…/output-0.log`，中间数据在 `/tmp/pt/`）。本文件由主会话根据这些输出整理；关键数字由主会话复核或重新读取，复核过的在下文注明。

**一句话总结**：
- **文档与链上一致**：官方文档描述的机制与链上实现一致。174 笔真实盈利平仓的结算结果和文档公式吻合，最大相对误差约 1e-13。所有合约 owner 都是 7 天 Timelock，Timelock 的 owner 是 2-of-3 多签。PAPER 不可转账，供应量正好等于铸币事件之和。
- **零资本启动只持续了几分钟**：tracked LP 只在开盘后几秒为负；26 分钟后越过 $2M，65 分钟后越过 $5M；队列只出现过 3 笔各 $7.62 的排队。之后，$5M 以上的 LP 盈余持续分给质押者，LP 被压在约 $5M。
- **OI cap 比文档宽 100 倍**：上线时链上 cap 是每侧约 $100B（BTC 1,207,460 枚、ETH 40,032,827 枚），不是文档说的“当前 OI + $1B”。第一次收紧在 10-10 23:34 UTC，正是操纵发生后。
- **还有一笔未生效的提案**：多签里有一笔待确认交易，要把 BTC / ETH 的 `referenceNotional` 从 $100K 提到 $500K / $1M，小幅盈利的 haircut 会明显加重。

---

## M-Q1 产品原理与链上核对

### 1.1 合约、代理与权限（链上读取）

**答案**：
- **代理结构**：8 个协议合约都是 EIP-1967 代理（代理本体 1,852 字节），共用一个 ProxyAdmin（`0xe79c91…0f8f`）。
- **owner 链条**：每个合约的 `owner()` 都是 Timelock `0xB915…EA0F`；Timelock 的 owner 是多签 `0x6962…1F6`；ProxyAdmin 的 owner 也在 Timelock 部署后转给了 Timelock（区块 47855575）。
- **Timelock**：`minDelay() = 604800`（7 天）。
- **多签**：自定义 3 签名人合约（`signerOne/Two/Three`），`requiredConfirmations() = 2`。
- **源码未验证**：Sourcify 对代理和实现都没有匹配；hyperevmscan API 需要 key，网页被 Cloudflare 拦截；GitHub 上找不到官方合约仓库。能找到的只有第三方 SDK（nirholas/papertrade-sdk），它的结算公式“与链上逐笔核对”。

**依据**：运行日志 L1005–1094（`cast storage` 读 EIP-1967 槽、`owner()`、`minDelay()`、`requiredConfirmations()`）；L1107–1149（Sourcify / hyperevmscan 查询）；L1353–1437（第三方 SDK）。

**权限实测**（`cast call --from` 模拟，日志 L2460–2476）：
- 多签（作为 pause guardian）可以 `setTradingPaused(true)`，但 `setTradingPaused(false)` 会 revert `NotPauseAuthority()`：恢复开仓只能由 owner（Timelock）执行。
- 多签可以 `pauseMarket(0)`；Timelock 调 `unpauseMarket(0)` 会 revert `MarketPermanentlyPaused()`。市场下架是不可逆的，与文档一致。
- `setFeeRates` 只有 Timelock 能调，从多签直接调会 revert。
- 不经排期直接 `execute` 会 revert `OperationNotScheduled()`；多签直接调 `updateMinDelay` / `transferOwnership` 会 revert `NotSelf()`。也就是说，所有 owner 操作都必须先排期、等 7 天。
- `pushStakerFees()` 任何人都能调；`close` 不能由第三方直接调用。
- PaperToken：持币地址之间 `transfer` 会 revert `TransferRestricted()`。Timelock 可以 `setMinter`（模拟成功），Timelock 直接 `mint` 会 revert。
- PaperTokenomics：`redeem` / `quoteRedemption` 都 revert `RedeemDisabled()`。合约里有一个**已禁用**的 PAPER 赎回入口。

**链上权限变更时间线**（Timelock / 多签事件，日志 L1765–1815，时间由区块时间戳换算）：
| 时间 (UTC) | 事件 |
|---|---|
| 2026-10-06 22:52 | PaperTokenomics `MintParamsUpdated(2M, 5M, 100, 120M)` |
| 2026-10-06 22:59 | Timelock 部署：owner = 多签，minDelay = 604800 |
| 2026-10-07 21:38 | 多签 0 号交易：`updateSigners(aa75…, e968…, 9028…)` |
| 2026-10-10 14:00:18 | 第一笔铸币事件（区块 48173881），即开盘 |
| 2026-10-10 18:46 | 多签 1 号交易执行：Timelock `schedule` → `PaperTokenomics.setMintParams(2M, 10M, 100, 120M)`，即 staker cap 从 $5M 调到 $10M，最早 10-17 18:46 可执行 |
| 2026-10-11 15:41 | 多签 2 号交易**只提交、未确认**：Timelock `scheduleBatch` → `Exchange.0x5ca4c0ea` × 2（见 §1.4） |

### 1.2 一笔交易的链路与运营角色

**答案**：
- **提交路径**：开仓、平仓、质押都由 relayer 提交到 BatchExecutor，再由 BatchExecutor 分发给 Exchange。BatchExecutor 的 `authorizedRelayers` 是两个 EOA：`0xc916…b0b4`（nonce 306,247）和 `0xe726…1686`（nonce 1,804），它们的交易 `maxPriorityFeePerGas = 1 wei`。
- **清算**：清算由 `0x0762…a612` 直接调 Exchange，`maxPriorityFeePerGas = 1 gwei`，是 relayer 的 10⁹ 倍。这与文档“清算付更高小费”一致。
- **OI cap**：由 market keeper `0x3721…cf99`（nonce 13,864）持续更新，小费为 0。
- **定价**：PriceOracle 实现的字节码里包含 `0x0807`、`0x0806`、`0x080e` 三个预编译地址，以及字符串 “BBO unavailable”“Execution price is zero”“Oracle price is zero”“Mark price is zero”。

**依据**：日志 L2386–2403（`authorizedRelayers`、交易 gas 字段、字节码字符串扫描）。

**链上读到的盘口快照**（区块 48362044，2026-10-12 约 17:35 UTC）：
- BTC：bid 825130 / ask 825140，价格精度 0.1，即 $82,513.0 / $82,514.0，价差 $1 = 1 tick ≈ 0.12 bps。
- ETH：251300 / 251310，即 $2,513.00 / $2,513.10，价差 1 tick ≈ 0.40 bps。

这只是单个时点的快照（日志 L2298–2322）。

### 1.3 定价、清算与成本（链上参数 + 逐笔复算）

**答案**：链上 instrument 参数与文档一致（区块约 48361161，日志 L2165；`/state/trading` 也返回同一组值）：
- `rateMultiplier = 15000`
- `positionMultiplier`：BTC 814.598，ETH 483.979
- `baseRate = 0.1`，`referenceNotional = $100,000`
- `maxLeverage = 1000`，`maxPosition = $10M`
- `bustBuffer`：BTC 0.0476%，ETH 0.0481%（文档写“约 5 bps”）

**复算核对**：取 174 笔真实盈利平仓（BTC 138、ETH 36），用文档公式（先扣 0.2 bps 死区，再算 impact，再扣 2% win fee）复算，结果与链上结算一致，最大相对误差 1.2e-13（日志 L2147）。

**bust 价核对**：6 个样本仓位都与公式 `p0 = ceil(e·(L−1)/L)`、`bust = floor(p0·(1+buffer))` 一致。1000× BTC 多单的 bust 距离是 5.24 bps，10× 约 995.7 bps（日志 L2506）。所以在 1000× 下，价格只要反向走约 5.2 bps 就会没收全部保证金；如果在 10 bps 之前主动平仓，还能拿回约一半保证金。

**按链上参数计算的保留比例**（`/tmp/pt/impact.py`；保留比例 = 死区后 move × scale × 0.98 ÷ 原始 move）：

| move | BTC 保留 | ETH 保留 | BTC 提案后 | ETH 提案后 |
|---|---|---|---|---|
| 0.01% | 20.95% | 15.98% | 7.42% | 2.55% |
| 0.05% | 60.71% | 53.95% | 35.02% | 15.55% |
| 0.10% | 72.43% | 67.59% | 51.01% | 27.21% |
| 0.50% | 84.63% | 83.28% | 77.29% | 61.51% |
| 1.00% | 86.38% | 85.68% | 82.40% | 72.52% |
| 5.00% | 87.83% | 87.69% | 86.98% | 84.56% |

**GPT 调研“100 × 90% × 98% = 88.2”的说法**：88.2% 只是上限（1−baseRate）×0.98，盈利幅度越大越接近，永远达不到。1000× 下常见的 0.05–0.1% 盈利只保留 54–72%。文档里“1% 约 88%”是扣 2% 费用之前的数字。

### 1.4 待生效的 impact 提案（多签 2 号交易）

**答案**：多签 2 号交易由 signerTwo 在 2026-10-11 15:41:44 UTC 提交，比官方 10-11 15:42 的声明早约 1 分钟。内容是对 Timelock 发起 `scheduleBatch`，调用两次 `Exchange.0x5ca4c0ea(instrumentId, referenceNotional, positionMultiplier, rateMultiplier, baseRate)`：
- BTC：`referenceNotional` $100,000 → **$500,000**，其他三个参数不变；
- ETH：`referenceNotional` $100,000 → **$1,000,000**，其他三个参数不变。

截至区块 48362838，这笔交易只有一个 Submission 事件，没有 Execution 事件，Timelock 里也没有对应排期。它需要第二个签名，之后还要再等 7 天才能生效。函数名无法反查（4byte 无结果），参数顺序是主会话根据数值推断的：第 2、3、4 个参数与现值逐一相等，只有第 1 个不同。

**依据**：`cast call transactions(2)` 与 `cast calldata-decode`；`cast receipt 0x857d4b1d…` 只有 `0xbe411f07`（Submission）日志；对比 1 号交易的 receipt，那里有 `0xd3fb8b9f`（Execution）和 Timelock 的 `0x78f3bc93` 日志（主会话 2026-10-13 复核）。

### 1.5 三桶账本与队列的实际运行

**答案**：
- **账本快照**（区块 48361303，2026-10-12 17:12 UTC）：
  - `treasury` $59.04M、`totalBalances` $46.53M、`totalLockedMargin` $7.51M、`lpBankrollAvailable` $4.979M；
  - `totalQueued` 0、`sideBucket` 0、`queueHead` 4、`trackedLpUsd` $4.979M、`tailProgressUsd` $102.80M；
  - `stakerFeeAccumulator` 约 $7、`devFeeAccumulator` 约 $17,699。
  - 同一时段，HyperCore 上 Exchange 账户的 USDC 现货余额为 $59.61M（HL info API，17:36 UTC）。
- **队列只用过一次**：只出现过 3 个节点（`queueNode(1..3)`）。开盘后第一个 6 秒内（区块 48173881–48173887），三个地址各赢了 $7.62，因为 LP 为 0，所以排队。区块 48173889 第一笔亏损进来后，这三笔在区块 48173890 被付清。之后队列一直为空。
- **LP 曲线**：tracked LP 最低 −$22.87（区块 48173887）；14:26:19 UTC 越过 $2M；15:05:27 UTC 越过 $5M。之后共发生 517 次“LP 超过 cap 的部分划给质押者”，合计 $25.97M。越过 $5M 之后的最低点是 $2.39M，发生在操纵时段。

**依据**：日志 L2233（固定区块读取）、L2256–2298（250,565 条 PaperTokenomics 事件的汇总）、L2608（开盘事件与 `queueNode`）。

### 1.6 PAPER 发行的实际分布

**答案**：
- **供应量对账**：PaperTokenomics 事件里的铸币合计 6,193,841,515.55 PAPER，与区块 48361301 的 `totalSupply()` 完全相等（差值 0）。所以到这个区块为止，没有其他铸币路径被使用过。
- **铸币基数**：平仓亏损 $78.68M（103,820 笔），清算 $30.70M（33,606 笔），合计 $109.37M。
- **按区间分**：flat 区间（LP < $2M）只覆盖 $6.59M 基数，铸出 6.59 亿 PAPER，占供应量的 10.6%。其余约 $102.8M 都在衰减区间铸出。
- **铸币率**：全期平均 56.6 PAPER/$；目前的边际铸币率是 100×(120/(120+102.8))² ≈ **29.0 PAPER/$**。
- **地址数**：参与 LP 事件的地址 10,796 个，其中铸过币的 9,872 个。DepositProxyFactory 部署了 16,735 个存款代理。
- **质押**：`totalStaked` 6.119B，占供应量 98.8%。
- **LP 付给赢家**：累计 $77.81M。

**依据**：日志 L2261–2298、L2337、L2595–2605。

**不确定之处**：
- 事件主题 `0x620c26bf` / `0x3050fba1` / `0x09f6ca7b` 没有 ABI。它们分别是“平仓结算 / 清算 / 质押者划转”，这是 agent 根据字段与总量对账（铸币合计 = totalSupply、LP 余额收敛到 `trackedLpUsd`）推断的。
- 平仓亏损和盈利两类都用 `0x620c26bf`；“盈利 125,765 笔”是按字段正负区分出来的。

### 1.7 OI cap 的实际轨迹

**答案**：
- **上线时**：Exchange 的 cap 更新事件（topic `0xa065d6ba`，按 instrument 分，记录多空两侧上限，单位是币数）显示，10-10 13:34 UTC 写入的初始 cap 是 BTC 1,207,459.69 枚、ETH 40,032,826.92 枚。按当时价格约合**每侧 $100B**。
- **之后 9.5 小时没有任何更新**，直到 10-10 23:34 UTC。这时 BTC 降到 73,772 / 73,047 枚（约 $6B），ETH 降到 2.50M / 2.46M 枚。
- **10-11 继续收紧**：01:48 BTC 约 10,310 枚；07:37 约 4,990 枚（约 $410M）；15:49 降到 3,441 / 2,253 枚。
- **10-11 起频繁更新**：10-11 共 7,919 次，10-12 共 5,989 次。cap 跟着 OI 浮动，BTC 在约 1,000–3,400 枚之间（约 $0.1–0.28B）。
- **当前**：`/state/trading` 显示 BTC 多空 OI 2,387 / 2,446 枚，cap 2,460 / 2,693 枚；ETH OI 60,475 / 33,313 枚，cap 69,122 / 41,494 枚。余量约 $6M–$22M 每侧，远小于文档写的 $1B。

**依据**：`/tmp/pt/oicap.json`（13,912 条事件，由 agent 抓取，主会话 2026-10-13 重新解码）；`https://exchange.papertrade.xyz/state/trading`（主会话 2026-10-13 读取，`indexedThroughBlock` 48362893）。

**不确定之处**：`0xa065d6ba` 是 cap 更新事件，这一点是根据数值量级与 `/state/trading` 第 21–22 列一致，以及发送方是 market keeper 推断的，没有 ABI。

---

## M-Q2 经济模型

### 2.1 “项目方没有 token supply”

**答案**：表述基本成立，但要补三点限定：
1. **事实层面成立**：到区块 48361301 为止，PAPER 供应量 100% 来自亏损铸币事件。
2. **代码层面没有锁死**：Timelock 可以 `setMinter`，所有合约都可升级。团队在 7 天延迟、2/3 多签之后，有能力改变发行规则。
3. **团队有现金收入**：dev fee recipient 拿每笔 2% 费用的一半。按推算，到 10-12 质押者分到的 $27.27M 中，约 $1.3M 来自费用分成（总额 $27.27M 减去 LP 划转 $25.97M）；dev 拿到的金额同量级。

**依据**：§1.1 权限实测；§1.6 供应量对账；文档《Staking Dividends》“Half of each fee goes to stakers and half to the dev fee recipient”；hypercore 路 H41（stakingRewards $27.27M）。

### 2.2 Martingaler 白皮书的假设与部署的差异

**答案**：白皮书是一份 4 页的短文（PDF 创建于 2024-06-03）：
- **核心机制**：FIFO 队列，加上“偿付率不变式”（SRI）。偿付率 =（金库 ETH + 队列中的本金）÷ 队列负债。SRI 的取值决定什么时候支付队头：1.0 表示完全有偿付能力才付，0.0 表示无条件付队头。
- **escape valve**：排队者可以只取回本金、放弃盈利。
- **代币激励**：建议“线性递减的代币奖励”，并可以与队列长度挂钩。
- **论证方式**：只靠两个示例游戏的模拟（公平硬币；3/4 概率赢 1.33 倍，house edge 0.25%）。两者都是独立同分布、概率已知的游戏，**没有给出最终偿付的证明**。

Papertrade 部署版本与白皮书的差异：
1. **没有 SRI 参数**：只要队列非空就不付新赢家，而且 margin 不进入队列。
2. **没有 escape valve**：文档写明这一部分“out of scope”。
3. **铸币曲线不同**：用 LP 水位来决定铸币率（flat 100/$，然后按平方衰减），而不是按游戏轮次线性递减。
4. **对手方是市场交易**：交易者有信息、有时延优势，还能操纵价格源，与独立同分布的游戏不同。“house edge”来自对盈利的 haircut，而不是固定的赔率差。

**依据**：白皮书 §2.2–2.5、§3（本地 `references/martingaler-whitepaper.pdf`）；文档《Martingaler LP》。

### 2.3 “零资金启动”的资本由谁提供

**答案**：
- **机制上**：资本来自亏损者的保证金，而在 LP 资金不足时，提供信用的是被排队的赢家。
- **实际运行中**：排队信用只用了 3 × $7.62，几乎可以忽略。真正的资本来源是开盘第一个小时里的大量亏损：65 分钟内 tracked LP 就超过了 $5M。
- **LP 规模被设计上限压住**：之后 LP 并没有继续变厚，因为 $5M 以上的部分都划给了质押者。也就是说，协议在 $5M 的 LP 上承接每侧上亿美元的名义 OI（§1.7），极端行情下仍然依赖队列。

**依据**：§1.5、§1.7；文档《Staking Dividends》中的 $5M cap。

### 2.4 loss-to-mint 激励：多空对冲刷 PAPER 的成本（模型推演）

**答案**：设同一个主体在同一区块开等额多空，之后同时平仓，价格变动为 m，队列为空：
- 亏损腿亏 L，按 0.98L 的基数铸币；
- 盈利腿拿到 L·k，k 是上表中的保留比例；
- 净成本 = L·(1−k)。

每枚 PAPER 的成本（按链上参数，日志 L2647）：
- 纯亏损：flat 区间约 $0.0102/PAPER；当前铸币率（29.0/$）下约 $0.0352/PAPER。
- 对冲、m = 0.1%：flat 区间 $0.0028，当前 $0.0097（BTC）。
- 对冲、m = 1%：flat 区间 $0.0014，当前 $0.0048（BTC）。

也就是说，对冲能把每枚 PAPER 的成本压到纯亏损的约 1/4（m = 0.1%）到 1/7（m = 1%）。如果让 1000× 的一条腿被清算、另一条腿盈利，净成本约为保证金的 68–71%，比“等大行情后双腿平仓”更贵。

这是基于公开参数的模型推演，不是对合约漏洞的断言。实际收益还取决于 PAPER 的分红和价值，以及 OI cap、最小名义 $1,000 的限制，和主体能否承受价格路径。

**依据**：`/tmp/pt/impact.py` 输出（日志 L2647–2664）；文档《PAPER mint curve》中铸币基数的定义。

### 2.5 debt-funded 仓位与偿付风险

**答案**：
- **debt-funded 仓位**：可以用排队中的债权作为保证金开仓。亏掉时按被销毁的债权铸币，但不带来任何现金（文档《Solvency & queue》《PAPER mint curve》）。在队列较长时，这等于“用协议欠你的钱换 PAPER”，会稀释质押者，而 LP 的现金不增加。这一点是由文档推出的；到 10-12，队列只用过 3 次，链上还没有出现这种情况。
- **偿付风险**：`Net LP equity = LP cash − totalQueued` 可以为负。队列非空时，费用不发，亏损先进入 sideBucket。文档和白皮书都没有给出队列的最长等待时间或最终偿付的保证。

---

## 外部调研 / 用户资料中被修正的地方

1. **GPT：“盈利最高保留 90%、再扣 2% → 88.2 USDC”**：88.2% 是渐近上限。1000× 下常见的 0.05–0.1% 盈利只保留 54–72%（§1.3）。
2. **用户草稿：“所有的 token 都是亏损后 mint 出来的”**：到 10-12 为止在事实上成立（供应量 = 铸币事件之和）；但 owner 经 Timelock 可以更换 minter、升级合约（§1.1、§2.1）。
3. **文档 / 上线推文：“每侧 OI 余量 $1B”**：上线后前 9.5 小时，链上 cap 实际是每侧约 $100B（§1.7）。
4. **文档：“bust buffer 约 5 bps”**：链上是 4.76 / 4.81 bps（§1.3）。
5. **用户草稿 / grok：“零资金自举”**：队列只用过 3 × $7.62，LP 在 65 分钟内就到了 $5M。之后 LP 被质押者 cap 压在约 $5M，并没有变厚（§1.5、§2.3）。

## 来源

1. **PRIMARY** HyperEVM 主网 RPC `https://rpc.hyperliquid.xyz/evm` 与 `https://rpc.hyperlend.finance/archive`（eth_call / eth_getLogs / getStorageAt，区块 48359148–48362893，2026-10-12 16:37–17:40 UTC）。证明合约权限、参数、状态、事件。
2. **PRIMARY** Papertrade 官方文档快照 `references/papertrade-docs-2026-10-12.md`。证明机制描述。
3. **PRIMARY** Martingaler 白皮书 `references/martingaler-whitepaper.pdf`。证明 SRI、escape valve、示例游戏。
4. **PRIMARY** Papertrade 官方 API `https://exchange.papertrade.xyz/state/trading`（`indexedThroughBlock` 48362893）。证明 instrument 参数、当前 OI 与 cap。
5. **PRIMARY** Hyperliquid info API `POST https://api.hyperliquid.xyz/info` `spotClearinghouseState`（Exchange 地址，2026-10-12 17:36 UTC）。证明 Exchange 在 HyperCore 上的 USDC 余额为 $59.61M。
6. nirholas/papertrade-sdk（`src/math.ts`、`docs/PROTOCOL.md`，GitHub，2026-10-11 提交）。第三方 SDK，用于确认参数字段顺序和 bust 公式；结论都已用链上数据复核。
7. DefiLlama DefiLlama-Adapters `projects/papertrade/index.js` 与 dimension-adapters `helpers/papertrade.ts`。第三方，证明 TVL 口径（Exchange 的 HyperCore 现货余额）与 API 字段语义。
8. 本路运行日志 `async-subagent-runs/4e3e2630-d512-4017-82d7-93af34f2a6d2/output-0.log`，以及 `/tmp/pt/` 中间数据（oicap.json、tk_all.json、impact.py）。

## 命令与输出（摘录）

```
cast call $TIMELOCK "minDelay()(uint256)"                    → 604800
cast call $MULTISIG "requiredConfirmations()(uint256)"        → 2
cast call $EXCHANGE "owner()(address)"                        → 0xB915Fa41…EA0F (Timelock)
cast call $EXCHANGE "totalQueued()(uint256)"  @48361303       → 0
cast call $EXCHANGE "lpBankrollAvailable()(uint256)" @48361303 → 4979425.06e18
cast call $PAPER "totalSupply()(uint256)" @48361303           → 6193841515.55e18
cast call $STAKING "totalStaked()(uint256)" @48361303         → 6119285490.57e18
PaperToken.transfer (holder→other) → revert TransferRestricted()
PaperTokenomics.redeem            → revert RedeemDisabled()
multisig.transactions(2)          → to=Timelock, data=scheduleBatch([Exchange×2], …0x5ca4c0ea…)；receipt 只有 Submission 日志
OI cap 事件 0xa065d6ba @48172307  → BTC 1207459.69 / ETH 40032826.92（每侧约 $100B）
```

## 开放问题

1. 合约源码没有验证。事件和函数语义是靠 selector 反查与数值对账推断的。
2. 多签 2 号交易（impact 提案）会不会被确认、什么时候生效。
3. dev fee recipient 的地址和累计提取额（本路没有逐笔统计）。
4. 对冲刷 PAPER 在链上实际占多少（需要做地址级的多空配对分析）。
5. `RedeemDisabled` 赎回入口的设计意图，以及将来是否会启用。

---

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| M1 | 8 个协议合约都是 EIP-1967 代理，共用 ProxyAdmin 0xe79c91…0f8f | [1] 读 EIP-1967 implementation / admin 槽（日志 L1005） | observed | |
| M2 | 所有协议合约的 owner 都是 Timelock 0xB915…EA0F，Timelock 的 owner 是多签 0x6962…1F6 | [1] `owner()` 读取（日志 L1018–1035）；Timelock 事件 `OwnerUpdated(0x6962…)` @47855496 | observed | |
| M3 | Timelock minDelay = 604800 秒（7 天），多签需要 3 人中的 2 人确认 | [1] `minDelay()`=604800；`requiredConfirmations()`=2；`signerOne/Two/Three` | observed | |
| M4 | 合约源码在 Sourcify 上没有匹配，hyperevmscan 无法通过 API 获取，GitHub 上没有官方合约仓库 | [1] Sourcify v2 返回 match:null（日志 L1107–1136）；hyperevmscan 403 / NOTOK；gh search 无结果 | observed | |
| M5 | 恢复开仓只能由 Timelock 执行：多签可以暂停开仓，但调 setTradingPaused(false) 会 revert NotPauseAuthority | [1] `cast call --from` 模拟（日志 L2460–2476） | observed | |
| M6 | 市场下架不可逆：Timelock 调 unpauseMarket 会 revert MarketPermanentlyPaused | [1] 同上 | observed | |
| M7 | 所有 owner 操作都必须经过 Timelock 排期：未排期 execute 会 revert OperationNotScheduled，多签直接调 updateMinDelay 会 revert NotSelf | [1] 同上 | observed | |
| M8 | PAPER 在持币地址之间转账会 revert TransferRestricted() | [1] 模拟 holder 转账（日志 L2446–2453） | observed | |
| M9 | Timelock 可以 setMinter（模拟成功），所有合约都可升级，所以“只有亏损才能铸币”不是写死的 | [1] setMinter 模拟（日志 L2595）；M1、M2 | observed | |
| M10 | PaperTokenomics 有一个已禁用的赎回入口：redeem / quoteRedemption 都 revert RedeemDisabled() | [1] 模拟调用（日志 L2191–2228，4byte 解码 0x32aa90b0） | observed | |
| M11 | BatchExecutor 只授权两个 relayer EOA，其中主 relayer 的 nonce 为 306,247，交易小费 1 wei | [1] `authorizedRelayers()` 与交易字段（日志 L2386） | observed | |
| M12 | 清算 keeper 的交易小费 1 gwei，是 relayer（1 wei）的 10⁹ 倍；market keeper 的小费为 0 | [1] 交易字段（日志 L2394） | observed | |
| M13 | PriceOracle 字节码里包含 0x0807、0x0806、0x080e 三个预编译地址，以及 “BBO unavailable”“Execution price is zero” 等报错字符串 | [1] 实现字节码扫描（日志 L2403） | observed | |
| M14 | 2026-10-12 约 17:35 UTC 的盘口快照：BTC bid/ask 价差 1 tick（$1 ≈ 0.12 bps），ETH 价差 1 tick（$0.1 ≈ 0.40 bps） | [1] 区块 48362044 读 BBO：825130/825140、251300/251310 | observed | |
| M15 | 链上 instrument 参数与文档一致：rateMultiplier 15000，positionMultiplier 814.598 / 483.979，baseRate 0.1，referenceNotional $100K，maxLeverage 1000，maxPosition $10M | [1] 区块约 48361161 读取；[4] /state/trading 第 12–18 列 | observed | |
| M16 | 链上 bustBuffer 为 BTC 0.0476%、ETH 0.0481%（文档写“约 5 bps”） | [4] /state/trading 第 16 列 476041580087574 / 481304050180130（wad） | observed | |
| M17 | 174 笔真实盈利平仓按文档公式（死区 → impact → 2% 费用）复算，与链上结算一致，最大相对误差约 1e-13 | [1] PositionsClosed 事件逐笔复算（日志 L2147） | observed | |
| M18 | 1000× BTC 多单在价格反向走 5.24 bps 时触发 bust；6 个样本仓位的 bust 价都与公式一致 | [1] 仓位 bust 价 vs 公式（日志 L2506） | observed | |
| M19 | 按链上参数，BTC 盈利 0.05% / 0.1% / 1% 时扣费后分别保留 60.7% / 72.4% / 86.4%，ETH 分别保留 54.0% / 67.6% / 85.7% | 由 M15、M17 与文档公式计算（impact.py） | inferred | |
| M20 | 88.2% 只是扣费后保留比例的渐近上限（0.9 × 0.98），1000× 下常见的小幅盈利保留得更少 | 由 M19 推出 | inferred | |
| M21 | 多签 2 号交易在 2026-10-11 15:41:44 UTC 提交，提案把 BTC / ETH 的 referenceNotional 从 $100K 提到 $500K / $1M，其他 impact 参数不变 | [1] `transactions(2)` 与 calldata 解码；receipt 0x857d4b1d…（主会话复核） | observed | |
| M22 | 截至区块 48362838，这项 impact 提案只有 Submission 事件，没有执行，也没有进入 Timelock 排期 | [1] receipt 只有 0xbe411f07 日志；多签此后无事件；对照 1 号交易有 Execution + Timelock 日志 | observed | |
| M23 | 如果这项提案生效，0.1% 盈利的保留比例 BTC 从 72% 降到 51%，ETH 从 68% 降到 27% | 由 M19、M21 计算（impact.py PROP 列） | inferred | |
| M24 | staker cap 从 $5M 调到 $10M 的 setMintParams 已于 10-10 18:46 UTC 进入 Timelock 排期 | [1] 多签 1 号交易的 Execution 事件与 Timelock 0x78f3bc93 日志 @48191335；calldata = setMintParams(2M, 10M, 100, 120M) | observed | |
| M25 | 账本快照（区块 48361303）：treasury $59.04M、用户余额 $46.53M、锁定保证金 $7.51M、可用 LP $4.979M、totalQueued 0、sideBucket 0 | [1] 固定区块读取（日志 L2233） | observed | |
| M26 | 队列只用过一次：开盘后第一个 6 秒内 3 个赢家各 $7.62 排队，一个区块后被付清 | [1] queueNode(1..3) 与开盘事件（日志 L2608） | observed | |
| M27 | tracked LP 最低 −$22.87，14:26 UTC 越过 $2M，15:05 UTC 越过 $5M（开盘 14:00） | [1] 250,565 条 PaperTokenomics 事件（日志 L2279–2290） | observed | |
| M28 | LP 越过 $5M 后，共发生 517 次超额划转给质押者，合计 $25.97M；之后 LP 最低 $2.39M | [1] 同上（drain 事件合计；日志 L2513） | observed | |
| M29 | 铸币事件合计 6,193,841,515.55 PAPER，与 totalSupply 完全相等 | [1] 事件求和 vs totalSupply @48361301（日志 L2605） | observed | |
| M30 | 铸币基数合计 $109.37M（平仓 $78.68M + 清算 $30.70M）；全期平均 56.6 PAPER/$ | [1] 事件汇总（日志 L2290） | observed | |
| M31 | flat 区间只覆盖 $6.59M 基数，铸出 6.59 亿 PAPER，占供应量的 10.6% | [1] 同上 | observed | |
| M32 | 当前边际铸币率约 29.0 PAPER/$（tailProgress = $102.8M） | [1] tailProgressUsd()；文档公式 100·(S/(S+H))² | inferred | |
| M33 | 参与 LP 事件的地址 10,796 个，铸币地址 9,872 个；存款代理 16,735 个 | [1] 事件去重（日志 L2290、L2337） | observed | |
| M34 | 质押量 6.119B，占供应量 98.8% | [1] totalStaked @48361303 | observed | |
| M35 | LP 累计付给赢家 $77.81M | [1] 事件汇总 | observed | |
| M36 | 上线时写入的初始 OI cap 为 BTC 1,207,460 枚、ETH 40,032,827 枚，约合每侧 $100B | [1] Exchange 事件 0xa065d6ba @48172307（10-10 13:34 UTC）；按 BTC $82,774.5、ETH $2,498 换算 | observed | |
| M37 | 0xa065d6ba 是 OI cap 更新事件 | 由数值量级与 /state/trading 第 21–22 列一致、发送方是 market keeper 推出 | inferred | |
| M38 | 初始 cap 之后 9.5 小时没有更新；第一次收紧在 10-10 23:34 UTC（BTC 约 $6B），10-11 07:37 收紧到约 $0.4B，之后跟随 OI 频繁更新 | [1] oicap 事件时间序列（13,912 条） | observed | |
| M39 | 10-12 时 cap 只比 OI 高约 $6M–$22M 每侧，远小于文档的 $1B 余量 | [4] /state/trading 第 19–22 列（BTC OI 2387 / 2446，cap 2460 / 2693；ETH OI 60475 / 33313，cap 69122 / 41494）按 HL mid 换算 | inferred | |
| M40 | 文档和上线推文说的“OI + $1B 余量”在上线后 9.5 小时内并没有实际执行 | 由 M36、M38 推出 | inferred | |
| M41 | Exchange 在 HyperCore 上的 USDC 现货余额为 $59.61M（2026-10-12 17:36 UTC） | [5] spotClearinghouseState | observed | |
| M42 | 质押者分到的 $27.27M 中，约 $1.3M 来自费用分成，其余来自 LP 超额划转；dev 拿到的费用分成同量级 | 由 M28 与 H41 推出；文档“费用对半分” | inferred | |
| M43 | 白皮书的偿付论证只靠两个独立同分布概率游戏的模拟，没有证明最终偿付 | [3] §3 Examples | observed | |
| M44 | 白皮书提出 SRI 参数和 escape valve（排队者可以只取回本金）；Papertrade 部署版本没有 escape valve | [3] §2.3；[2]《Martingaler LP》“out of scope” | observed | |
| M45 | 白皮书的游戏是概率已知的独立同分布赌局，而 Papertrade 的对手方能利用信息、时延和价格操纵 | 由 M43 与 H24–H25（操纵事件）推出 | inferred | |
| M46 | 零资金启动中排队信用只用了 3 × $7.62；真正的启动资本是开盘第一个小时的亏损 | 由 M26、M27 推出 | inferred | |
| M47 | $5M staker cap 把 LP 压在约 $5M，而每侧名义 OI 上亿美元，所以极端行情下仍依赖队列 | 由 M28、M38、M39 推出 | inferred | |
| M48 | 同一主体开等额多空，在 1% 行情后同时平仓：每枚 PAPER 的成本约为纯亏损的 1/7（BTC，$0.0014 vs $0.0102，flat 区间） | 由 M19 与文档铸币规则计算（impact.py） | inferred | |
| M49 | 对冲刷 PAPER 的实际规模在链上有多大，没有测量 | 本路没有做地址级多空配对分析 | speculative | |
| M50 | 用排队债权开仓然后亏掉，会铸出 PAPER 却不带来现金，等于用协议欠款换取收入权 | 文档《Solvency & queue》《PAPER mint curve》对 debt-funded 亏损的定义 | inferred | |

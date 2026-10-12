# notes：Papertrade 深度拆解（索引与设计综合）

本报告的调研分四路，外加主会话的设计综合。台账前缀对应如下：
- **M** → `notes-mechanism.md`：机制、链上核对、经济测算（delegate 超时；由主会话根据运行日志整理，并复核关键读数）
- **H** → `notes-hypercore.md`：HyperCore 依赖、BBO 操纵事件、上线数据
- **P** → `notes-peers.md`：同类 vault 对手方永续对照
- **X** → `notes-mantle.md`：前序需求与 Mantle 能力对照
- **D** → 本文件 §设计综合：主会话从上面四路推出的 Mantle 方案，类型都是 inferred 或 speculative

外部调研 `papertrade-deep-dive.md`（ChatGPT Deep Research）只当线索使用。

## 每个研究问题的一句话答案

1. **产品原理**：Papertrade 是一个以 HyperCore BBO mid 作价、以协议 LP 作对手方的合成永续。成本只从盈利端收取：0.2 bps 死区、impact haircut、2% 费用。它的机制与链上实现一致，174 笔复算误差约 1e-13。所有权限归 7 天 Timelock + 2/3 多签。开平仓只能经官方 relayer 提交（M15–M18、M1–M12）。
2. **经济模型**：PAPER 到目前为止确实 100% 由亏损铸出，但 owner 可以换 minter、可以升级合约。“零资金启动”中的排队信用只用了 $22.86，LP 65 分钟就到了 $5M，之后被质押者 cap 压住。对冲刷币能把每枚 PAPER 的成本压到纯亏损的 1/4–1/7（M9、M26–M31、M46–M48）。
3. **为什么火**：两个判断都有数据支撑，但分不开。前 10 小时的成交占累计 67%，48 小时内 OI 掉了 94%。质押者分到的 $27.3M 约等于交易者净亏的 80%，相当于亏损者拿回了现金（H36–H43、H55）。
4. **为什么必须在 HyperEVM**：HyperEVM 提供“同链、无签名者、同步读取订单簿 BBO”和 HyperCore 上的 USDC 托管。“共识验证”只证明价格来源，不证明抗操纵。操纵事件之所以发生，关键在于上线时链上 cap 是每侧约 $100B，而不是文档说的 $1B 余量（H1–H12、H24–H33、M36–M40）。
5. **同类产品**：impact 公式改编自 Rollbit。Papertrade 真正的新意在资本侧（零外部 LP、队列、亏损铸币）和价格侧（单一 venue 盘口）。同类产品事故后陆续加上的防线（多源价格、偏离熔断、偏斜费、延迟执行、ADL），它几乎全部放弃了（P1–P51）。
6. **Mantle 复现**：机制层可以原样移植。链级缺口只有两项：同链原生价格状态，以及原生 USDC / CCTP。最大的现实约束是需求，不是链能力（X10、X28、X39、X50、X52）。

## 资料中被修正的地方（汇总）

- **grok“只借价格发现”**：不完整，USDC 托管也依赖 HyperCore（H9）。
- **grok“实时”**：实际是每个 EVM 区块构建时的快照（H1、H15）。
- **grok“高质量预言机”**：单一 venue 的 mid 没有偏离熔断（H11、P51）。
- **grok“没有真实 perp 仓位所以没有 funding”**：同类合成永续照样收 funding，不收是产品选择（P44；notes-peers 修正 2）。
- **GPT“90% × 98% = 88.2”**：这只是渐近上限，常见的小幅盈利只保留 54–72%（M19、M20）。
- **GPT“Pyth 列出 Mantle”**：属于引用错配，且已过时（X24、X54）。
- **GPT 漏掉出入金缺口**：没有提到 CCTP 不支持 Mantle（X38、X39）。
- **文档 / 推文“每侧 $1B 余量”**：上线后前 9.5 小时，链上 cap 实际约 $100B（M36–M40）。
- **用户草稿“项目方没有 token supply”**：事实上成立，但代码层面没有锁死（M9）。
- **媒体笔误**：KuCoin $24.8M、$67.8B 等数字有误（H50、H52）。

## 设计综合（D）：如果在 Mantle 上做一个 Papertrade 类产品

以下都是设计建议，不是 Mantle 现网能力，也不代表 Mantle 的路线承诺。

**D-1 分层复用**：把 Papertrade 拆成四层：
- 价格：需要替换；
- 执行与排序：可以增强；
- 账本、队列、铸币：可以原样移植；
- 需求：需要重新论证。

Mantle 只需要在价格和执行两层补能力（由 X10、X52 推出）。

**D-2 价格层**：Mantle 上没有同链订单簿可读，只能用签名报告（Chainlink Data Streams 的链下拉取加链上验证、Pyth、RedStone）。签名报告引入了“提交者挑选报告”的问题，所以要先承诺订单、后定价格：订单进入承诺状态之后，按预定规则使用下一轮报告。同时保留多源偏离检查，这正是 Papertrade 没有、同类产品事故后补上的防线（由 X20、X21、X53、P19、P44 推出）。

**D-3 OI cap 与 LP 绑定**：cap 不应设成“当前 OI + 固定余额”，应由 LP 的风险预算反推。按 H35 的算法，净敞口 / LP 的比例决定多大的价格波动会亏光 LP。Papertrade 上线时以 $4.2M 的 LP 承担 $1.23B 净敞口，0.34% 的波动就够了（由 H34、H35、M36、M39 推出）。

**D-4 分红前先留风险准备**：用“可分配 = 可用资产 − 已确认负债 − 压力情景准备”代替固定的 $5M staker cap。准备金随敞口变化，敞口高时少分红（由 M28、M47 推出）。

**D-5 排序**：清算、价格更新、订单承诺适合放进 application-specific-sequencing 报告建议的“维护操作车道”。Papertrade 在 HyperEVM 上只能靠清算小费比 relayer 高 10⁹ 倍来争取先上链；Mantle 已有一个 preconf FIFO 车道的雏形（由 M12、X13、X14 推出；关联报告 application-specific-sequencing F9、F11）。

**D-6 出入金**：Mantle 没有原生 USDC，也没有 CCTP，抵押品可以考虑 USDT0（$440M 供应）或桥接 USDC。代价是用户需要的跨链路由与 Papertrade 不同（由 X36–X40 推出）。

**D-7 需求与激励**：Papertrade 的热度主要是上线脉冲加亏损返现。在 Mantle 现有 perps 需求很弱的情况下，复制它会更依赖代币激励，必须先测量刷币成本和真实留存。至于 Mantle 是否值得用国库做种子 LP，属于未经验证的设想（由 H38、H42、M48、X50 推出；X45 为 speculative）。

**D-8 不要为一个产品去复刻 HyperCore**：同链原生订单簿是一个独立的长期论题，不是 Papertrade 类产品的前提（由 X10、X28 推出）。

**D-9 需要实测的指标**：
- Mantle 上预言机报告从生成到上链的 P95 / P99 延迟；
- 清算交易在拥堵时的入块延迟；
- 1000× 对应的 10 bps 保证金能容纳多大的价格误差与执行窗口；
- 对冲刷币占比与真实留存。

以上内容只在“需要测量”这一点上成立，都还没有测量过。

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| D1 | Papertrade 可分为价格、执行、账本 / 队列 / 铸币、需求四层，Mantle 只需在价格和执行两层补能力 | 由 X10、X52 推出：只有价格读取依赖 HyperCore 原生，其余为应用自建或第三方 | inferred | |
| D2 | 在 Mantle 上用签名报告定价时，应先承诺订单、后定价格，并保留多源偏离检查 | 由 X20、X21、X53（报告选择风险）与 P19、P44（同类产品的偏离防线）推出 | inferred | |
| D3 | OI cap 应由 LP 的风险预算反推，而不是“当前 OI + 固定余额” | 由 H34、H35、M36、M39 推出：净敞口 / LP 决定亏光 LP 所需的波动幅度 | inferred | |
| D4 | 分红前应先扣除已确认负债和压力情景准备，代替固定的 $5M staker cap | 由 M28、M47 推出 | inferred | |
| D5 | 清算、价格更新、订单承诺适合放进 Mantle 的维护操作车道（关联 ASS 报告） | 由 M12、X13、X14 推出；research-hub 报告 application-specific-sequencing F9、F11 | inferred | |
| D6 | Mantle 版本的抵押品可以考虑 USDT0 或桥接 USDC，因为 Mantle 没有原生 USDC 和 CCTP | 由 X36–X40 推出 | inferred | |
| D7 | 在 Mantle 现有 perps 需求很弱的情况下，复制 Papertrade 会更依赖代币激励，必须先测量刷币成本与真实留存 | 由 H38、H42、M48、X50 推出 | inferred | |
| D8 | 同链原生订单簿是独立的长期论题，不是 Papertrade 类产品的前提 | 由 X10、X28 推出 | inferred | |
| D9 | 在 Mantle 上，1000× 杠杆是否可行，取决于预言机延迟和清算入块延迟的 P95 / P99，而这两项都还没有测量 | 由 M18（5.2 bps 即 bust）、X11、X20 推出；未测量 | speculative | |
| D10 | Mantle 用国库给 LP 注入种子资本，可以绕过“零资本启动”的早期偿付风险 | 只是设想，没有任何官方表述（承接 X45） | speculative | |

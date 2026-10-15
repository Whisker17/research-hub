# Lane B：期权基础（onboarding）——前缀 B，产出 notes-basics.md

先读 lane-common.md。本路回答 brief 研究问题 1，目标是为开发者写一份**准确、可复核**的期权入门素材，并准备好页面要用的数值例子和图的数据。

## 要回答
1. call/put、long/short、payoff vs PnL、breakeven；欧式/美式；现金结算/实物交割；合约规格字段（标的、执行价、到期、行权方式、结算、乘数、fixing 规则、公司行动调整）。一手来源：OCC/OIC（optionseducation.org）、CME 合约规格页、Deribit 合约规格文档（加密期权的事实标准：BTC/ETH 期权是欧式、现金结算、以币本位或 USDC 结算、08:00 UTC 到期、30 分钟 TWAP 结算价——请核实）。
2. 定价直觉：Black-Scholes（1973）与 Black-76 公式；输入项；内在价值 vs 时间价值；IV 的定义（反解）与历史/实现波动率的区别；smile/skew、期限结构；加密期权市场常见的 IV 量级（例如 Deribit DVOL 指数的定义与近期量级，若能拿到）。
3. Greeks（Delta/Gamma/Vega/Theta/Rho）的定义与直觉；delta 对冲与 gamma scalping 的盈亏关系（PnL ≈ ½Γ(ΔS)² − θ 项，即实现波动 vs 隐含波动）；为什么 delta-neutral ≠ 无风险。
4. put-call parity（C − P = S − K·e^{-rT}，Stoll 1969）与静态复制：用 call+借贷/put+现货合成；与 DeFi 借贷的联系（Merton 1974：债权 = K − put）。
5. 常见结构：protective put、covered call、cash-secured put、collar、vertical spread、straddle/strangle；各自最大损失/最大收益；covered call ≡ short put（经 parity）这一事实。
6. 保证金：全额抵押 vs 标准保证金 vs 组合保证金（情景压力测试法，参考 OCC TIMS / CME SPAN 的公开描述，以及 Deribit 的 portfolio margin 文档）。为什么卖方风险大。
7. 期权与现货、永续的风险形态差别（线性 vs 凸性；永续的 funding；期权的 theta）；永续期权/everlasting options（Paradigm 2021）、power perpetuals（Paradigm）作为“链上原生”变体的定义。

## 数值例子（用 python3 计算并给出可直接画图的数据）
- 统一用一个示例：标的 ETH 现价 S=2500，K=2500 与 2750，T=30 天，r=0（或 4%），σ=60%。计算 call/put 价格、Greeks、到期 payoff 和到期 PnL 表（S_T 取 1500–3500 每 250 一档）。
- protective put、covered call、collar、bull call spread 在同一组参数下的到期 PnL 数据点。
- delta 对冲示例：卖出 1 张 ATM call，delta 对冲，展示一次 ±10% 跳动后的 PnL 近似（gamma 损失）。
- 给出一段简洁、正确的 TypeScript 或 Python 的 Black-Scholes + Greeks 代码（页面会放代码片段）。代码要能跑，贴运行输出。

## 不需要
不用调研具体链上协议（另一路负责）。

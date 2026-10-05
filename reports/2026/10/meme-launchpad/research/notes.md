# 调研笔记索引：Meme Launchpad

调研分三册并行完成（2026-10-05，网页来源均在当天访问；用户资料为 `mantle-v3-roadmap @ b819a33`，见 [references.md](references.md)）。合并台账见 [ledger.md](ledger.md)（184 行：observed 133 / inferred 34 / speculative 17）。

| 分册 | brief 研究问题 | 一句话答案 |
|---|---|---|
| [notes-mechanism.md](notes-mechanism.md) | 1 机制、2 生命周期 | 恒定乘积加两个虚拟储备，合约自己当对手盘，所以发币零垫资；pump.fun 的毕业条件是曲线可售代币卖完（`real_token_reserves == 0`），不看美元价格；毕业后储备原子迁入 AMM 并销毁 LP。实现分三类：迁到外部 DEX、原子迁到自有池、不设曲线直接放单边 LP。“hook 内曲线 + 就地翻转”还没有找到生产实例。 |
| [notes-products.md](notes-products.md) | 3 主要产品、4 结构性缺陷 | 各代产品逐步消掉迁移攻击面，创作者分成从一次性奖励变成按成交量永续分成；单币价值衰减、补贴退出后流量崩塌、多 quote 碎片化至今都没有解决。Base 社交发币路线已被官方承认失败，Funny Money 与 Printr 均已停运。 |
| [notes-agentic.md](notes-agentic.md) | 3 agentic 对照物、5 agentic 方案 | 对照物中只有 Bankr 让 agent 既发币又交易，但权限是托管钱包加服务端策略；product.md 的差异点是链上可验证的 session 权限沙箱加“手续费养推理”。7702、4337 Paymaster、2D nonce 在 Mantle L2 上靠应用层 AA 就能起步，L3 只在 F1–F3 条件被实测到时才需要。 |

## 资料中被一手来源修正的地方

- four.meme 两次被黑发生在 2025-02-11（约 $183K）和 2025-03-18，根因是迁移目标池可被预建或污染；不是 outputs/03、04 写的“Helper3 重入 / 违反 CEI / 2025-09 与 2026 初”（M40、P11、P12、P14）。
- Clanker 先后被 Farcaster（2025-10）和 Neynar（2026-01-21）收购，base-ecosystem.md 的“很可能不实”已过时（P21–P23）。
- Clanker 没有可转让的 “Fee Key NFT”，可转让收益权 NFT 是 Flaunch Memestream（P24）。
- 02-fundamentals 把 pump.fun 的“售罄”和 four.meme 的“$12K 等值”混写成同一个毕业条件；“1%、45/45/10”也不是 pump.fun 参数（M60）。
- Bankr 的反狙击费衰减窗口是 14 秒，不是约 10 秒（A9）。
- Printr 的 2026-08-18 是 wind-down 开始日，8-31 停止运营；官方原因是资本与分发不足。Funny Money 的“2026-08-16 关停”没有找到一手来源（P50 等）。
- “v4 hook 路径零 MEV / 资金从未离开 PoolManager”不是 v4 的固有性质：相变只消掉迁移那一下的窗口，曲线阶段的抢跑仍在（M59、A 分册 §2.4）。

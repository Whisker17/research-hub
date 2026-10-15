# Lane W：World Markets 论文解读与核查 —— 前缀 W，产出 notes-worldmarkets.md

先读 lane-common.md。本路回答 brief 研究问题 4。

## 必读
- 论文全文：<报告目录>/research/references/world-markets-composable-options.txt（PDF 同目录 .pdf；txt 是 pdftotext -layout 双栏抽取，阅读时注意两栏交错；必要时用 `pdftotext -f N -l N` 不加 -layout 重抽某页）。

## 要回答
1. 论文的核心论点与逻辑链：put-call parity / 静态复制 → Merton 债权 = K − put → 动态复制 → 合成路由（native vs synthetic 取更优）→ 组合保证金（把定期借贷债权计入保证金，98% 认可）→ 流动性与容量估算（6–12x Derive V2 90 张 ask）→ 立即成交与新增成交量模型 → World Markets V2 +Options。用要点复述每一节，标注页码。
2. 数字分级：把论文所有关键数字（Table 3、4a、4b、4c、5、7，50.5x、10.8x、86.8%、532–1,052、5.9–11.7x、3.18x、2.00x、$106.4M、$53.2M、Table 7 的资本占用对比）逐个归为：实测（有可核实数据源）/ 模型计算（给定假设可复算）/ 假设或项目方提供（“provisional supplied estimates”）。
3. 核查：
   - 用 python3 复算：Table 4a 的 net delta per package（7 天、IV 50%、r=0、ATM 执行价约 2510.83 或取整、hedge 执行价 +$50/+$25/+$10；看能否复现 0.1126/0.0570/0.0229 及 532/1,052/2,620 张 ≈ 60 ETH / net delta）；式 (16) 的 1−e^{−Q/µ} 结果 89.354% / 99.995% 与 $106.4M、$53.2M；3.18x 与 2.00x 的算式；Table 4b 的 stress reserve 若能按其描述的网格（spot ±20%、IV 25/50/75%、剩余 7/3/1/0 天、spot hedge 固定）近似复算更好（不能精确复现也要说明差在哪）。
   - DefiLlama 输入（2026-10-12 快照：DEX 30 天 $246.593B、Aave V3 active loans $12.15B、Morpho $5.78B、链上期权 30 天 $4.881B、Derive $4.236B、Derive V3 OI $1.655B）：用当前 DefiLlama API/页面看量级是否一致（快照日期不同，只能核量级），记录命令与输出。
   - Derive V2 盘口快照 gist（https://gist.github.com/GeorgL0ngGamma/4e00c477cb66424b9458827f8b3bec44）：能否打开，内容是否支持 82.8 ETH bid、90 张 ask、$67.20/$63.30。
   - Uniswap 模拟（Ethereum 区块 26,189,586，60 ETH 分两池）：能否核实区块时间（例如通过公共 RPC `cast block 26189586` 或 etherscan），模拟本身不必重跑，说明可复现性。
   - 论文引用的 World Markets 文档（docs.world.inc：ATLAS 风险引擎、Trading、Market Structure 固定期限固定利率借贷、98% 认可）：核实 World Markets 是什么（团队、链、产品现状、是否已上线、V2 +Options 是否已发布），文档是否真的写了 98%。
   - 论文引用的 Derive 文档（cross-asset collateral & portfolio margin、variable rate lending）是否支持论文对 Derive 的描述。
   - 传统市场数字（Table 6：BIS FX 期权 $634B/日、利率期权 $245.8B/日、OCC-CME 交叉保证金 $700M/日、54%、CME $8.4B、FIA 88.65B 张、LCH 碎片化 $80M/日）：抽查 3–4 个原始来源。
4. 局限与利益相关：论文作者是 World Markets 自己（产品叙事）；比较基准是 Derive V2 历史公开盘口而非 V3 / RFQ 实际深度；关键前提（对冲期权的可得性、融资可执行、gas=0）；Table 7 是“provisional supplied estimates”；合成路由的工程难点（原子性、流动性去重、结算一致）。也查一下这篇文章在 X/社区引发了哪些讨论（支持与质疑），作为二手线索记录。
5. 值得开发者与 Mantle 借鉴的点（inferred，标明推理）：例如“期权流动性可以从现货 + 借贷 + 反向期权组装”对一个拥有现货 DEX 与借贷市场的 L2 意味着什么；需要什么基础设施（同一保证金账本、原子多腿执行、定期借贷市场）。

## 产出补充
- 一张“论文数字分级表”（数字 / 含义 / 类别：实测·模型·假设 / 是否复算一致 / 备注）。
- 一张页面可用的“合成路由机制”步骤列表（给图用）。

# 调研索引：EIP-8288 深度解析

调研日期 2026-10-21。三路并行，每路一个分册；台账已合并到 `ledger.md`（前缀 E / G / R）。外部调研 `eip-8288-deep-dive.md`（ChatGPT Deep Research）只作线索。

| 分册 | 研究问题 | 一句话答案 |
|---|---|---|
| `notes-eip.md`（E） | Q1 设计与原理 | 8288 给 8141 加 mode 4“依赖帧”：交易只声明 96 B 三元组，签名/证明在 mempool 里每 1,000 ms 递归聚合，区块头带一个 `recursive_stark`；当前只接受 leanSPHINCS，leanSTARK、`AGGREGATED_VK`、`DEPS_HASH`、参考实现都是保留或 TBD。 |
| `notes-eip.md`（E） | Q2 愿景 vs 规范 | 机制骨架已写进规范；“任意签名/隐私证明 client-side STARK 化、私有 AA、ISA、不再加预编译、I-star”仍是愿景。tick 500 ms vs 1,000 ms、SPHINCS- vs leanSPHINCS 与规范不一致。 |
| `notes-eip.md`（E） | Q2' 支持者论点前提 | “证明带宽恒定”只对证明部分成立；“节点越多容量越大”没有分工与激励机制支撑；mode 1 wrapper 的 16 条上限与“一个 wrapper 覆盖全部活跃交易”字面冲突；“验证者只验一个证明”成立。 |
| `notes-agglayer.md`（G） | Q3 AggLayer | 部分成立：pessimistic proof 程序在 SP1 里 `verify_sp1_proof` 验证 aggchain proof（证明里验证证明）；但是固定一层、逐链逐证书结算、由 trusted aggregator 提交，PLONK/BN254 上链，非 PQ；没有跨主体聚合。 |
| `notes-recursion.md`（R） | Q4 递归安全 | (a) 理论缺口真实且双方承认：普通 ROM 中递归没有安全证明，相对化路线已被证否，标准提取只撑常数深度，leanVM 形式化把 T6 递归提取列为开放问题；(b) 有对 Fiat–Shamir 的具体攻击（GKR/R1CS 类，需攻击者自选电路），没有对递归本身的已知攻击；(c) 没找到 EIP-8288 的可利用漏洞。 |

## 资料中被修正的地方（外部调研）

1. 推文原文已拿到（fxtwitter），外部调研称未读取。
2. 没提 mode 1 wrapper 的 16 条上限与“覆盖全部活跃交易”的冲突（E19、E20）。
3. 33,000 gas 正确，但 30,000 是按声明定额、用 `LEANSTARK_VERIFICATION_GAS` 计；首版按全块计入 base fee（E23–E25）。
4. 修订历史缺失：mode 3→4、leanSTARK 改保留、零 data_hash、mode 1 并集检查都是 10 月的修改（E2–E8、E17）。
5. leanVM 安全位数只引 128/64，没提 EIP-8292 的约 124/62（E45）。
6. SPHINCS- 与 leanSPHINCS 混用（E32）。
7. AggLayer：可以确定是逐证书结算，无跨链单一证明（G15、G16）；SP1 Hypercube 内存论证含 ECDLP 假设，“内层 STARK 是 PQ”前提也不成立（G25、G26）；外层是 PLONK（G21）；漏了 trusted aggregator（G18）。
8. 2025/1663（osROM）不是对递归 STARK 的背书，分析对象是 HyperNova（R32）；2024/728 自己写明非相对化 IVC/PCD 仍开放（R26）。
9. 漏了 leanerVM 把递归提取列为开放问题（R34、R35）。

## 矛盾

- leanVM 安全位数：README 128/64 vs EIP-8292 约 124/62（E45）。
- 聚合间隔：规范 1,000 ms vs 推文 500 ms（E30）。
- 规范内部：mode 1 上限 16 vs “一个 wrapper 覆盖全部活跃交易”（E19、E20）。
- Polygon 文档 CONSENSUS_TYPE 0/1 vs 源码统一 ConsensusType1（G8）。

## 开放问题（汇总）

1. mode 1 wrapper 上限是否笔误；`AGGREGATED_VK` / `DEPS_HASH` / leanSTARK 的 program scheme 何时确定。
2. 单节点每 1,000 ms 的实际证明吞吐、builder 合并成本曲线、mempool 证明激励。
3. 启用用户自带 STARK 后，KRS/Fenzi 型“自指程序”攻击是否适用于 leanVM 转录。
4. 递归在 QROM 下的安全性；生产 zkVM 的递归深度是否有界。
5. 对 Thaler 推文的实质性回应（截至 10-21 未找到）。
6. AggLayer 主网 trusted aggregator 与升级权限归属；是否计划跨链聚合。
7. client-side 证明格签名/隐私电路的成本（手机、硬件钱包）。

## 运行记录

- recursion 分路首次运行因连接错误失败，重新派发后完成；eprint.iacr.org 对本机全文抓取 403，论文只核对到摘要与 PDF 片段（主会话另经搜索引擎核对了 2024/728 的原句）。

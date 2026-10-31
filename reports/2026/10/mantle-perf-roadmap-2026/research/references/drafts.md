<!-- source: https://app.notion.com/p/40a2f04c436c80d5b8faced5ebb2d5ed?pvs=204 fetched 2026-10-31 via Notion MCP -->
# 2026 Mantle 性能优化路线

<table fit-page-width="true" header-row="true">
<colgroup>
<col width="120" />
<col width="520" />
<col width="90" />
</colgroup>
<tr>
<td>
能做的事情
</td>
<td>
要做哪些事情
</td>
<td>
紧急程度
</td>
</tr>
<tr>
<td>
网络广播
</td>
<td>
  • 这部分优化大多是作用在 L1 上的，因为 L1 和 L2 的出块方式不同<br />    ◦ 在 L1 中会有一个 proposer 出块，然后把整个区块广播给全网进行投票，所以上行带宽和转发跳数可能成为瓶颈<br />    ◦ 而 L2 中是单 sequencer 出块，不需要投票<br />  • 我们可以做的是对当前 p2p 算法的压测，看在多大的区块/多快的出块速度环境下可能会出现延迟<br />    ◦ 可以与 Shorter blocktime 结合起来一起做实验<br />  • MegaETH quic 调研
</td>
<td>
中/长期
</td>
</tr>
<tr>
<td>
排序和出块
</td>
<td>
  • 出块路径实验<br />    ◦ 量化出块路径各阶段指标，确定出块路径优化方向<br />    ◦ 详细内容看下文的 2.1 章节
</td>
<td>
短期
</td>
</tr>
<tr>
<td>
排序和出块
</td>
<td>
  • Shorter blocktime<br />    ◦ 调研 Base 的 native 200ms block 方案<br />    ◦ 评估当前 Elysium 版本的性能是否可以将区块时间下降至毫秒级别（之前的 bedrock 版本测试时会出块不稳定）<br />    ◦ 后续 R&D
</td>
<td>
短/中期
</td>
</tr>
<tr>
<td>
排序和出块
</td>
<td>
  • 区块空间分配与排序规则<br />    ◦ 这里更多的是一个需求分析/调研<br />    ◦ Local Fee Market<br />        ▪ 调研 evm 中如何实现 LFM<br />        ▪ 确定市场/产品需求<br />  • 我们认为这个功能更适合在网络拥堵的时候起到作用，针对目前 Mantle 的区块使用率该功能优先级不高<br />    ◦ Dedicated Lanes<br />        ▪ 调研 Tempo，Binance New L1 对区块进行切分的方案<br />    ◦ Application-specific sequencing<br />        ▪ 调研 evm 中如何实现 ASS
</td>
<td>
长期
</td>
</tr>
<tr>
<td>
执行
</td>
<td>
  • 从 revm 迁移到 evm2<br />    ◦ 已完成前期调研<br />    ◦ 进入开发阶段（随上游 reth 更新引入 evm2）
</td>
<td>
短期
</td>
</tr>
<tr>
<td>
执行
</td>
<td>
  • Parallel EVM<br />    ◦ 去年的调研结果发现 Mantle 上的交易依赖程度较高，因为盲目做 pEVM 的收益并不高，如有必要，可以重新再做一次实验
</td>
<td>
中/长期
</td>
</tr>
<tr>
<td>
状态/commitment
</td>
<td>
  • Commitment 结构<br />    ◦ 替换 evm 中惯用的 MPT<br />        ▪ 根据我们之前的研究，MPT 有读/写放大的问题，以及在 SP1 中会有大量的 RLP 和 Keccak 操作，所以需要和后面的 zkVM 实验结合，查看 MPT 对 zkVM 的正面成本的影响<br />        ▪ 我们可以调研/考证其他 commitment 结构，比如 EIP-7864 二叉树、QMDB、NOMT、Monad MIP-8、Sei LtHash
</td>
<td>
长期
</td>
</tr>
<tr>
<td>
状态/commitment
</td>
<td>
  • DB<br />    ◦ 目前 mantle 用的是 reth 的 MDBX（需要确认一下 db 是 v1 还是 v2），别的竞品有相关的实验方向，可以考虑切换到别的数据库，比如 MonadDb，base/triedb，Megaeth/salt
</td>
<td>
中/长期
</td>
</tr>
<tr>
<td>
状态/commitment
</td>
<td>
  • state expiry<br />    ◦ 对于目前 Mantle 的历史状态大小来说并不是一件优先级高的事情<br />    ◦ 引入这个的原因是因为 MegaETH 曾经提出将所有的状态都放进内存当中去，这样可以进行一定的性能优化，但是这个需求就是你的状态不能太大，否则内存放不下。因此，如果我们有一定的状态过期机制，就可以将整个状态放进内存当中
</td>
<td>
长期
</td>
</tr>
<tr>
<td>
DA，证明与结算
</td>
<td>
  • DA 限制<br />    ◦ 目前 Ethereum blobs（BPO2 后）的负载是 152 / 228 KB/s，由所有 L2 共享，这部分能够承载多少 L2 交易需要考虑（按照每笔 100 bytes 来算是 1500/2300 TPS），但是 BPO 是可调整的，所以对于 Mantle 来说，需要考虑的是压缩算法效率、批次大小和频率、DA footprint scalar
</td>
<td>
中/长期
</td>
</tr>
<tr>
<td>
DA，证明与结算
</td>
<td>
  • Multiple Proof System<br />    ◦ 根据之前的压测结果，目前 Mantle 的性能瓶颈主要来源于 ZK proof system，而 base 选择了多证明系统的方式（TEE+ZK），我们需要调研一下这种方式是否会对性能有影响<br />    ◦ 关注 real time proving 的结果，目前已知 zkSync Airbender 是提交了自己的结果，一旦 SP1 长时间没有性能接近的证明系统，可以考虑更换 zkVM（但是基本不考虑，因为开发成本过高）<br />    ◦ 可以对 SP1 zkVM 进行性能测试，统计 zkVM 周期分别花在哪里：MPT 遍历与哈希、EVM 执行、派生
</td>
<td>
中/长期
</td>
</tr>
</table>

## 2. 排序与出块

### 2.1 出块路径优化

目前 Mantle 一笔交易从提交到可读的路径：

```txt
用户 → proxyd / RPC → 转发到 sequencer txpool → 等待出块槽位 → op-node 下发 attributes → reth 执行 → 封块（state root + 持久化）→ gossip → RPC 节点（op-geth）导入 → 用户可读
```

外部研究曾认为 merkleization 是主要短板（2024：root 占封块时间 75% 以上），但 Reth 2.0 已把主网区块末尾的 root 降到 1–2 ms。这些结论都不是在 Mantle 负载上得出的，所以我们需要在 Mantle 上做一组可复用的实验：

- 出块与读路径分段计时：上述每一段的 p50 / p90 / p99
  - 主网：被动测当前负载
  - QA 链（参数与主网对齐、mStocks 交易组合）：target 持续 30 分钟；满块连续约 40 块再恢复
  - 同时记录 RPC 落后、batcher 积压、证明滞后随时间的变化
- preconf 延迟：开启 <code>--preconf.all</code> 后，一笔交易从提交到拿到回执的各段耗时，以及 p50 / p90 / p99。
  - 在空载、target、满块下分别测
  - eager build 开、关各测一次

那么整个实验内容和结果则是：

| 编号 | 实验 | 怎么做 |
| --- | --- | --- |
| E1 | preconf 回执分段计时 | 在 QA 链开启 <code>--preconf.all</code> 。对每笔 preconf 交易记录 6 个时间点：客户端发出 → proxyd 收到 → sequencer 收到 → 准入校验完成 → 执行进正在构建的区块 → 客户端收到回执。在空载、target、满块三种负载下各跑一次 |
| E2 | eager build 开关对比 | 和 E1 一样，op-node 的 <code>--sequencer.eager-build</code> 设 true / false 各跑一次 |
| E3 | preconf 预算压测 | 满块时同时发 preconf 交易和普通交易，统计 preconf 被拒的比例、普通交易从提交到进块的时间 |
| E4 | “一定上链”验证 | 持续发 preconf 交易，期间重启 sequencer、做一次主备切换。事后对账：拿到回执的交易是否都进了最终区块，执行结果是否和回执一致 |
| E5 | preconf 状态可见性 | 客户端 A 发一笔 preconf 交易，客户端 B 通过 RPC 节点读同一个账户。记录“A 拿到回执”到“B 读到新余额”的时间差 |
| E6 | RPC 导入延迟 | 每个区块记录：sequencer 封块的时间 → RPC 节点导入完成的时间。三种负载各跑一次 |
| E7 | target 持续负载 | 按 gas target（15M / 块）连续跑 30 分钟，用 mStocks 类交易组合。记录封块耗时、RPC 落后块数、batcher 待发数据量、证明滞后，看它们随时间是平的还是在增长；同时记录每块的 DA footprint 和 gasUsed |
| E8 | 满块突发 | 连续约 40 个满块（60M），然后停止加压。记录封块耗时，以及各类积压多久清零 |

对应的结果与优化方向

| 实验内容 | 实验结果（看到什么） | 优化举措 |
| --- | --- | --- |
| E1 回执分段计时 | 回执总延迟里，“客户端 → proxyd → sequencer”这段占 30% 以上，或者超过 50 ms | 优化入口：proxyd 和 sequencer 部署在同一机房；proxyd 和 sequencer 之间用长连接；去掉多余的转发层 |
| E1 回执分段计时 | “准入校验”或“执行进区块”这两段的 p99 超过 50 ms | 调 preconf 参数（降低单笔 gas 上限 2M），或者查 reth 在这两步的热点 |
| E1 回执分段计时 | 回执 p99 超过 300 ms，但各段都不突出 | 看是不是负载本身太高：对照 E3 调预算，对照 E7 调 target |
| E2 eager build 对比 | 关闭时回执的 p99 比开启时高 20 ms 以上 | 确认主网 op-node ≥ v1.6.3，并保持 eager build 开启 |
| E3 预算压测 | 满块时 preconf 被拒的比例超过 0.1% | 提高每块的预确认预算（当前 6M），同时检查 E3 下一行 |
| E3 预算压测 | 开 preconf 后，普通交易进块时间比不开时多 1 个区块以上 | 降低预确认预算，或按 1559 target 联动设置：预算不超过 target 的某个比例 |
| E4 一定上链验证 | 出现任何一笔“拿到回执但没上链”，或“上链结果和回执不一致” | 上线前必须修复：检查 journal 的恢复逻辑，以及主备切换时预确认承诺的交接。这是上线门槛，不是优化项 |
| E5 状态可见性 | B 读到新状态的时间比 A 拿到回执晚很多（比如 >200 ms，或要等到下一个区块封好，即最多约 2 s） | 做 preconf 状态流：把 preconf 后的状态推送给 RPC 节点或外部订阅者（Router、做市商），让读方也能亚秒看到 |
| E6 RPC 导入延迟 | 满块时 RPC 节点导入的 p99 超过 500 ms，或者落后 1 个区块以上 | 升级 RPC 节点的硬件（尤其是磁盘），减少 RPC 和 sequencer 之间的网络跳数；或者让 RPC 直接消费 preconf 状态流 |
| E7 target 持续负载 | 30 分钟内各类滞后都是平的，且封块 p99 不超过 200 ms（区块间隔的 10%） | 有余量：可以调高 gas target，峰值时 base fee 涨得更慢 |
| E7 target 持续负载 | 每块的 DA footprint 比 gasUsed 先接近 target | 容量瓶颈在 DA，不在执行：调 batcher 压缩和 DA scalar，不要只靠提 gas |
| E7 target 持续负载 | batcher 待发数据或证明滞后随时间持续增长 | 先扩 DA 或证明能力（如 GPU 证明网络上主网），否则不能提容量 |
| E8 满块突发 | 封块 p99 超过 200 ms | 追平上游 reth（prewarm 复用等）、换更好的 NVMe；在这之前不提 gas limit |
| E8 满块突发 | 突发结束后，积压超过 5 分钟才清零 | 降低 elasticity（让 limit 和 target 的倍数变小），或提高 denominator 的反应速度，让突发更短 |

# notes-jenner：其他开发方向与进度（J 路）

截止 2026-10-09。固定版本：bsc develop `8cc60b246`（master `c5533ab5b`）、reth-bsc develop `349f55c`、BEPs master `e9b2be3`。网页访问日期均为 2026-10-09。
CAS20（BEP-702）与 Payment Lane（BEP-703）的**机制**由另外两路负责，本路只记录它们的进度和时间线。

---

## J-Q1 盘点：2026-06 至 2026-10-09 的主要开发线

**答案**：用 `git log --since=2026-06-01` 全量过了一遍：bsc develop 118 个 commit，master 只到 2026-08-13 的 v1.8.0-alpha 合并；reth-bsc 151 个；BEPs 约 50 个。按主题归成 7 条线：
(A) Jenner 硬分叉功能；
(B) Pasteur 硬分叉收尾与上线；
(C) BEP-675 BidBlock 及其加固；
(D) 与 geth v1.17.3 同步，同时删除一批 BSC 自有功能；
(E) 共识 / P2P 安全加固；
(F) reth-bsc 移植 Go 实现；
(G) BEPs / BAPs 仓库的提案（BAP-710、后量子等）。

**依据**：
- (A) Jenner：
  - BEP-706：Go #3792（08-18）、Rust #480（09-02）。
  - Payment Lane：Go #3793（09-11）、Rust #497（09-23）。
  - CAS20：Go #3813（09-11）、Rust #512（09-24）。
  - BEP-714：Go #3822（09-15）、Rust #510（09-23）。
  - 0x68 按字节计价：Go #3772（09-08）、Rust #498（09-10）。
  - QA 修正：Go #3821 / #3826 / #3829（09-23）、Rust #522 / #524 / #527。
  - QANet Jenner 排期：reth-bsc #531（10-09）[1][2][14]。
- (B) Pasteur：
  - 系统合约升级：#3721、#3727。
  - BEP-682 拒绝重复验证者：#3623。
  - 0x64/0x65 废弃，0x67 设上限并按字节计价：#3726。
  - Chapel 时间：#3752。
  - Go 发布：v1.7.6（测试网）、v1.7.7（主网）；Rust 发布：v0.1.0、v0.1.1 [3][4][5]。
- (C) BEP-675：
  - 主体：#3691（06-17）。
  - 加固：#3736、#3739、#3741、#3742、#3773、#3798、#3804、#3796、#3806、#3807、#3810。
  - gRPC：#3774、#3820；默认端口修正 #3824；配额原子化 #3733 [1][6]。
- (D) 上游同步：
  - 合并 geth v1.16.9–v1.17.3：#3760，配套稳定化修复 #3757、#3766。
  - 撤销 opcode 优化：#3723、#3724、#3759。
  - 删除功能：incr snapshot（#3768）、multidb（#3716）、BEP-592（#3690 / #3720）、fake-beacon（#3728）、txpool overflowpool（#3722）、本地交易重新广播（#3756）、ENR 过滤（#3735）。
  - 6 月有一批上游 backport：#3680–#3712 [3][7]。
- (E) 安全加固：
  - Amsterdam 之前拒绝非空的 BlockAccessListHash / SlotNumber：#3808。
  - 区块号必须等于 parent+1：#3785（v1.7.8）。
  - coinbase 不能作为合约地址：#3744、#3746。
  - P2P：GetBlocksByRange 限速 #3794，NewBlockHashes 长度上限 #3777，peerSet 死锁 #3776，按 IP 计数 #3839，eth68 receipts #3835，partial receipts 死锁 backport #3825 [1]。
- (F) reth-bsc：
  - Pasteur 与 BidBlock 移植：06-18 至 08-18。
  - vote pool 修复：#486、#489、#491。
  - 删除 triedb：#371；fastnode 存储：#504。
  - 发布：v0.1.0 至 v0.1.2 [2][5]。
- (G) BEPs / BAPs：
  - 已合并：BAP-710（10-08）、BEP-718（09-20）。
  - BEP-696（复用空闲区块头字段写元数据）06-11 加入，06-16 删除。
  - 仍是 open PR：后量子 BEP-707 / 708 / 713、BEP-684（验证者在 header 验证后即投票）、BEP-668（PropAMM 预确认）、BEP-702 修订 #716 [8][9]。

**值得写进报告的（外部调研没提到）**：
- BEP-718 是 Jenner 的 meta BEP。
- 0x68 按字节计价在代码里绑定 Jenner 激活，但 BEP-718 和官方公告都没列。
- #3808 修复了区块哈希可被篡改（malleability）的问题。
- BEP-714 在 9 月中缩小了范围。
- v1.8 线删除了 superinstruction / multidb / incr snapshot，说明在向上游收敛。
- P2P / txpool 清理只需在报告里一句带过。

**不确定之处**：后量子 BEP 等 open PR 只是提案，没有代码。

---

## J-Q2 Jenner 硬分叉：范围、配置与时间表；Pasteur 背景

**答案**：
- **范围**：BEP-718（Draft，09-20 合并）列出 4 个需要硬分叉的 BEP：BEP-702、703、706、714。
- **代码比清单多一项**：0x68 双签证据预编译改为按输入字节计价。
- **激活配置**：
  - Go：主网和 Chapel 的 `JennerTime` 都是 `nil`。
  - Rust：只给 QANet 配了 `1791176400`（2026-10-05 05:00 UTC）。
- **官方时间表**：测试网 2026 年 10 月下旬、主网 11 月下旬，具体时间和 release 版本都未公布。
- **Pasteur 背景**：Chapel 2026-07-21 02:30 UTC、主网 2026-08-25 02:30 UTC 激活。包含 BEP-682、BEP-695，以及不需硬分叉、Pasteur 后才开放的 BEP-675。

**依据**：
- BEP-718 正文 [8]。
- `bsc/params/config.go:255-256,310-311@8cc60b246`。
- `reth-bsc/src/hardforks/bsc.rs:218-233@349f55c`。
- reth-bsc #531：PR 创建于 10-05 02:06 UTC，排定同日 05:00 UTC 激活，10-09 才合并 [2]。
- Jenner 公告 [10]、Pasteur 公告 [11]、bsc v1.7.6 / v1.7.7 release notes [3]、BEP-673 [8]。
- Go 端 QA 集群可用 `--override.jenner` 指定激活时间（`cmd/utils/flags.go:323`）。
- 0x68 按字节计价：`core/vm/contracts.go:454,1983-1989` [12]。
- Pasteur 的 #3726（0x64/0x65 停用，0x67 设上限）同样没有专门的 BEP。

**不确定之处**：
- QANet 是否真的在 10-05 激活了 Jenner，没有核实（speculative）。
- Go 端 QANet 用的 override 值不在仓库里。

---

## J-Q3 BEP-675 Builder Blind Signing / BidBlock

**答案**：

*旧流程（SendBid）*：builder 只提交交易列表，validator 封块前要把交易重放（simulate）一遍。

*新流程（SendBidBlock）*：
1. builder 提交已执行完的整块（header 带 stateRoot / receiptsRoot 等执行结果，最后是**未签名**的系统交易）。
2. validator 封块前**不跑 EVM**，只做这些事：校验从 parent 推导出的 header 字段，签白名单内的系统交易（deposit / distributeFinalityReward / updateValidatorSetV2），重算 TxHash，覆盖 Extra，加投票聚合签名，然后签名并广播。
3. 广播之后再通过本地 `InsertChain` 完整执行验证。验证失败就撤销该 builder 的 BidBlock 权限 24 小时；平均 gas price 低于 validator 设置的最低值则撤销一个 epoch（450 秒）。builder 被撤销后退回 SendBid 路径。

*收益与风险*：
- BEP 估算：关键路径上的 EVM 执行从 3 次降为 2 次，gas limit 上限约 +50%。
- 风险：validator 可能先签出一个执行无效的块。

*加固措施*（均已合并到 develop，尚未进入任何 release）：

| PR | 合并日期 | 内容 |
|---|---|---|
| #3741 | 07-03 | 硬分叉激活块禁用 BidBlock |
| #3773 | 07-31 | 只 blind-sign legacy 类型的系统交易 |
| #3798 | 08-20 | 拒绝零 state root |
| #3804 | 08-26 | 统计并上报坏 BidBlock |
| #3796 | 08-31 | 撤销记录持久化 |
| #3806 | 09-03 | 跨验证者坏块证据 |
| #3774 / #3810 / #3820 | 08-31 / 09-02 / 09-11 | gRPC sendBidBlock |

注意：#3773 只进了 v1.8.0-alpha，没进 v1.7.8。

*官方数据*：约 98% 区块走 BidBlock、每块 gas 比旧路径多 28%。口径是**截至 2026-09-01 的三天主网窗口**（博客 09-14 发布）。

**依据**：
- BEP-675 §2、§4.3、§6、§7 [8]。
- `consensus/parlia/bid_block.go:26-30,69-85`。
- `miner/miner_mev.go:63-123`。
- `miner/bid_simulator.go:715-760`（零 root 检查在 :720）。
- `miner/bid_block.go:260-320,336-391`。
- `miner/bid_block_permission.go:25-28`。
- `miner/bid_block_evidence.go:18-20`。
- `core/blockchain.go` 中 reportBadBidBlockEvidence（约 :3462-3500）。
- PR #3806、#3796、#3741、#3773 的描述 [6]。
- 博客 [13]。

跨验证者证据的规则：
- 同一个（builder, sealer）组合只算一票，24 小时滑动窗口。
- 不同 cabinet 验证者达到 N/2+1，或全部验证者达到 N/2+1，就撤销该 builder 24 小时。
- 证据来源：带 BEP-675 header 标记、但执行失败的块。

区块来源标记：validator 把来源版本（1 = Bid，2 = BidBlock）和 builder 地址编码进 `header.RequestsHash`（`core/types/builder/block_mev_info.go:19-40`）。

**博客其他口径**：
- 观察窗口内 15 个畸形 BidBlock，主要原因是某个 builder 配置产生了空 state root。
- 49 个注册 builder 实例中 24 个接入了 BEP-675；48Club 和 BlockRazor 合计出了 97.8% 的块。
- P99 gas：43.8M（BidBlock）对 33.8M（旧路径）。
- gas limit 路线图（图片）：55M → 70M（9 月中）→ 80M（10-10 之后，约 178M gas/s）→ 约 90M（11 月中，有条件）。

**本次采样**：2026-10-09 约 08:04 UTC，用公开 RPC（Geth/v1.7.7）每隔 5 块取 1 块，共 120 块。全部 gasLimit = 70,000,000，全部带 BidBlock 标记（version 2），平均 gasUsed 约 17.6M。

**不确定之处**：
- 120 块只是很小的样本，不能代表全网占比。
- #3798（08-20）早于主网 Pasteur（08-25），所以它与博客说的“上线后发现空 state root”之间的因果关系不确定。
- BEP-675 文中权限查询写成 `GET /eth/v1/builder/permission`，代码实际是 JSON-RPC `mev_getBidBlockPermission`，规范与实现不一致。
- #3796 的 PR 描述说撤销记录存在 chain database，但合并后的代码写的是 datadir 下的 JSON 文件 `bidblockrevokes.json`（`miner/minerconfig/config.go:41`、`bid_block_permission.go:31-36`）。PR 描述已过时。

---

## J-Q4 BEP-706 毫秒时间戳预编译与 BEP-714 backoff

**BEP-706 答案**：
- 地址 `0x70`，固定 20 gas，不读 calldata。
- 返回 32 字节大端整数，值为 `Header.MilliTimestamp()`，即 `Time*1000` 加上存放在 MixDigest 里的毫秒余数（BEP-520 引入）。
- 实现通过 `RunWithBlockContext` 读 `BlockContext.MilliTimestamp`；该值为 0 时退回 `Time*1000`。
- `block.timestamp` 的语义不变。

**BEP-714 答案**：
- 备用验证者的初始等待从 2 秒改回 1 秒。正常出块间隔仍是 0.45 秒，各备用排位之间的间隔（wiggleTime = 1 秒）不变。
- 是否已过 Jenner，按 parent 的时间判断。
- 计算例（一个 in-turn 验证者掉线、第一备用正常）：8 块的受影响 turn 从 (0.45+2)×8 = 19.6 秒降到 (0.45+1)×8 = 11.6 秒，约 −41%。
- in-turn 验证者“最近签过块”时走另一条路径，各备用的等待序列从 [0, 2, 3, …] 秒变为 [0, 1, 2, …] 秒。

**为什么叫 “restore”**：1 秒原本就是默认值，常量 `defaultInitialBackOffTime = 1000`；Lorentz（BEP-520）把它提高到 `lorentzInitialBackOffTime = 2000`。之后出块间隔从 1.5 秒两次缩短到 0.45 秒，等待时间却一直停在 2 秒。

**9 月中的范围缩减**：
- 09-11 首版标题是 “Improve Network Availability with Earlier Validator Maintenance”，除 backoff 外还包括：
  - turnLength 8→4；
  - 新增 maintenanceThreshold = 40（第 40 次漏块自动进入维护）；
  - misdemeanorThreshold 333→200；
  - felonyThreshold 1000→600；
  - maintainSlashScale 2→3。
- 09-15 的 commit 07c33e4 删除了自动维护和阈值调整，只保留 1 秒 backoff；09-16 改为现标题。
- Go #3822 在同日 07:32 UTC 合并。它的 commit 消息里还提到 “core/systemcontracts”，但最终 diff 只改了 `consensus/parlia`，与范围缩减一致。

**依据**：
- BEP-706 / BEP-714 正文 [8]。
- `core/vm/contract_milli_timestamp.go:48-54`、`params/protocol_params.go:186`、`core/vm/contracts.go:458`。
- `consensus/parlia/parlia.go:76-78,2351-2372,2442`。
- BEPs commit 2a6d8a4、1d5ed5a、07c33e4 [9]。
- PR #3822 [6]。

**不确定之处**：
- BEP-714 自己说回到 1 秒需要在测试网验证重组风险，目前还没有数据。
- 从 Go 代码看，`IsJenner` 的注释（`params/config.go:1471-1478`）仍写 “Jenner (BEP-706)”，是注释过时，不影响行为。

---

## J-Q5 执行引擎与上游同步：收敛还是分叉？

**答案**：BSC 在向上游 geth **收敛**。
- v1.8.0-alpha（08-13，“preview release … not intended for production”）合并了 geth v1.16.9–v1.17.3：eth/70 成为主协议，UBT 替代 Verkle，PathDB archive，EIP-7928 BAL 脚手架替代 BEP-592。
- 一组 Amsterdam EIP 代码进入，但在 BSC 上保持休眠（`AmsterdamTime: nil`）。
- 同时删除了 superinstruction（#3395 的 opcode 级优化，由 #3723 / #3759 撤销）、incr snapshot（#3768）、multidb（#3716）。
- BEP-592 的删除更早：#3690，PR 理由写的是 “decide to follow upstream”，已进 v1.7.6。

**这条线说明什么**：2025-12-30 的路线图还把 Super Instructions（约 +10% EVM 性能）和 Scalable DB 当作成果；2026 年 6–7 月它们被移除。我的解读是：自研的执行 / 存储优化让位于上游兼容，差异化转到协议层功能（CAS20 / Payment Lane / BEP-675）（inferred）。

**依据**：
- v1.8.0-alpha release notes 与 CHANGELOG [3]。
- PR #3759、#3768、#3716、#3690 描述 [6]。
- 路线图 [15]。
- `params/config.go:259`（AmsterdamTime nil）。
- 发布归属：用 `git merge-base --is-ancestor` 核对，`6d65a799d`（#3760）、`bdb833348`（#3759）、`ece8248c4`（#3768）在 v1.7.7 / v1.7.8 中都**不存在**，只在 v1.8.0-alpha 里。也就是说，目前主网生产版本 v1.7.x 仍是旧代码。
- #3808 的 commit 消息说明：v1.17.3 引入的可选 header 字段（BAL hash / SlotNumber）不在 Parlia 签名原像里。没有这个检查时，同伴节点可以给已签名的块附加这些字段，改变块哈希而签名仍有效。修复是 Amsterdam 前要求这两个字段为空。
- v1.7.8 的 header 结构里没有这两个字段（`git show v1.7.8:core/types/block.go`），所以这个漏洞应只影响 v1.8 代码线（inferred）。
- 博客：链上目前 gas 约在 83M 处有同步瓶颈，因为一个块的 receipts 必须装进单个 10 MiB 响应；eth/70 允许分多次返回。BAL 不是 90M 计划的前提 [13]。

**不确定之处**：
- Jenner 正式 release 是否基于 v1.8 代码线：develop 的 `version.go` 目前是 1.8.0-alpha，所以很可能是（speculative）。

---

## J-Q6 reth-bsc 双客户端

**答案**：
- 已发布：v0.1.0（07-08，Pasteur 测试网）、v0.1.0-fix、v0.1.1（07-22，主网 Pasteur，标注强制升级）、v0.1.2（08-20，加入 BidBlock 路径和状态根修复）。
- Jenner 相关代码（CAS20 / Payment Lane / BEP-706 / BEP-714 / gRPC）全在 develop 上，**还没有 release**。
- 对齐方式：Go 先实现，Rust 移植。手段包括 golden fixture 回放（#512 回放从 go-bsc 录下的 145 次调用）和 “Ports bsc#3772” 式的逐 PR 对照。
- 滞后时间从约 2 天（0x68）到约 2 个月（BidBlock：06-17 → 08-18）不等。

**v0.1.2 记录的状态根事故**：
- 有 4 处代码直接把状态写进数据库，却没有通知增量状态根流水线：`upgrade_system_contract`、`apply_history_storage_account`（EIP-2935）、`distribute_incoming` 中的两处写入。
- 结果是在 bsc-qanet 的 Pasteur 切换点，geth 以 `invalid merkle root` 拒块，集群分裂。
- qanet 的 Pasteur 激活从 1785897000 推迟到 1785920400，修复后重新激活。

**主网运行情况**：
- 已有主网全节点：v0.1.1 写明 “All mainnet nodes must upgrade”。
- README（07-21 版）仍写 “Run as validator ❌ (soon)”。
- 路线图说已发布 Reth validator 的 alpha 版，生产级 validator 计划在 2026 年推出。
- **没有证据表明主网验证者在运行 reth-bsc**。
- qanet 上 geth 拒绝 reth 出的块，说明 reth 在 qanet 上作为出块者运行（inferred）。

**依据**：release notes [5]、`src/hardforks/bsc.rs:218-230`、PR #512 描述 [2]、README.md:9-14、路线图 [15]。

另一处 release notes 与代码不一致：v0.1.0 的 notes 列了一批 BEP-675 子 PR，但 v0.1.0 的代码树里没有 `bid_block.rs`（只有 `bid_simulator.rs`）；BidBlock 实际随 #415 合并，首次发布在 v0.1.2。

**不确定之处**：
- 主网 reth 节点数量、是否有验证者在用，均未知。
- Rust 端的 `is_unsigned_system_tx_candidate` 没有像 Go #3773 那样限定 legacy 交易类型（`reth-bsc/src/consensus/parlia/bid_block.rs:95-103`）。解码路径是否已经挡住零签名的 typed 交易，没有核实（speculative）。

---

## J-Q7 BAP-710 Unified PropAMM Relayer

**答案**：BAP-710 是**应用层**提案（Type: Application，Draft；创建于 09-03，10-08 合并进 BEPs 仓库），不改共识。BAP 管应用层约定，BEP 管协议 / 共识 / 节点层面的改动（BAPs/README）。

**工作流程**：
1. maker 通过 `pamm_sendQuoteUpdateV1` 把报价交易交给 relayer。
2. relayer 校验报价，模拟一次，记录它的 write-set，并入覆盖层（overlay）。报价不上链。
3. taker 照常调用 `eth_call`，得到“链上状态 + 自己可见报价的覆盖层”上的结果。
4. taker 用 `eth_sendRawTransaction` 提交普通签名交易。
5. relayer 模拟这笔交易得到 read-set；报价的 write-set 与 taker 的 read-set 有交集，就算匹配。
6. relayer 组装 `[匹配的报价交易（先收到的在前）…, taker 交易]`，从干净的链状态重新模拟，再广播给多个 builder，按原子 bundle 纳入。
7. 任何一步失败，交易都回落到普通交易池。

**链上部分**：Priority Update Registry，每个 lane 最多 255 个 word，48 位 seq 必须严格递增。**registry 不检查过期**：由 relayer / builder 按 deadline 丢弃过期报价；pool 想要链上保护，需要在 `quote` / `swap` 里自己校验新鲜度。

registry 的 “lane” 与 Payment Lane 无关。

**依据**：BAP-710 §1、§2、§4.1、§4.2.2、§4.5.2、§8.1 [8]；BAPs/README.md；BEPs commit e1b1d51。

**不确定之处**：是否有 relayer 在运营、有哪些 builder 接入，均未知。相关的 BEP-668（PropAMM 预确认）仍是 open PR。

---

## J-Q8 进度总表

| 功能 | 规范状态 | Go 实现（合并日期） | Rust 实现（合并日期） | release | 测试网 / 主网激活 | 还需治理 / 管理员？ |
|---|---|---|---|---|---|---|
| CAS20 / BEP-702 | Draft，09-11 合并；修订 PR #716 仍 open | #3813（09-11）+ #3826 / #3829（09-23） | #512（09-24）、#524（10-08） | 无 | QANet 10-05（仅 Rust 配置）；Chapel / 主网未定（官方：10 月下旬 / 11 月下旬） | 是：由 ActivationRegistry 开放资产创建 |
| Payment Lane / BEP-703 | Draft，09-11 | #3793（09-11） | #497（09-23）、#522 | 无 | 同上；从激活块的下一块起生效 | 比例默认 5%，无需治理；支付合约名单初始为空，需治理添加 |
| BEP-706（0x70） | Draft，08-12 | #3792（08-18） | #480（09-02） | 无 | 同上 | 否 |
| BEP-714（1 秒 backoff） | Draft，09-15 缩减范围，09-20 合并 | #3822（09-15） | #510（09-23） | 无 | 同上 | 否 |
| BEP-718（meta） | Draft，09-20 | — | — | — | 公告：测试网 10 月下旬、主网 11 月下旬 | — |
| 0x68 按字节计价（不在 BEP 清单） | 无 BEP | #3772（09-08） | #498（09-10） | 无 | 随 Jenner | 否 |
| BEP-675 主体 | Draft（BEP-673 列为不需硬分叉） | #3691（06-17） | #415（08-18） | Go v1.7.6 / v1.7.7；Rust v0.1.2 | 主网 Pasteur（08-25）后开放，默认开启 | validator 可用配置 / RPC 关闭；按 builder 撤销 |
| BEP-675 加固（撤销持久化 / 跨验证者证据 / 零 root / legacy-only） | 不在 BEP 文本中 | #3796 / #3806 / #3798 / #3773 | #493 / #494 / #494 / 未明确 | Go 仅 #3773 进了 v1.8.0-alpha，其余无 | 不需硬分叉；公告说随 Jenner release 发布 | 否 |
| gRPC sendBidBlock | 文档 #3820 | #3774（08-31）、#3810 | #494（09-16）、#511 | 无 | 随 Jenner release，默认开启，端口 8552，可用 `--mev.grpc.disable` 关闭 | 否 |
| BAL / SlotNumber header 检查 | 无 BEP | #3808（09-08） | #499（09-10） | 无 | 立即生效（以 Amsterdam 为界） | 否 |
| BAP-710 | Draft，10-08 | —（链下 relayer，不在 bsc 仓库） | — | — | 不适用 | 不适用 |
| v1.8 上游同步 | — | #3760（07-22）等 | — | v1.8.0-alpha（08-13，预览版） | 无硬分叉；Amsterdam 未激活 | — |

---

## J-Q9 官方路线图（背景）

- 2025-12-30 的 Tech Roadmap 2026：
  - 双客户端策略：Geth 是稳定锚点，Reth 是高性能引擎。
  - 目标 20,000 TPS。
  - 新执行引擎（基于寄存器的解释器、AOT/JIT）。
  - 用 EIP-7928 BAL 做无冲突并行执行（称已带来 20% 提升）。
  - 对并行友好的存储。
  - Privacy Framework、AI Agent Framework。
  - 2026–2028 规划下一代交易链（约 1M TPS）[15]。
- 对应关系：BAL 进入了 v1.8 线；双客户端与 reth-bsc 对应。路线图把 superinstructions 和 Scalable DB 算作成果，但这两项已在 v1.8 线被移除。
- 仓库之外（一句话）：2026-09-15 官方博客发布 Agent Lifecycle Protocol v0.4 草案和 BNB Agent Studio，不在本报告范围 [16]。

---

## 代码片段（建议放进报告）

1. `bsc/consensus/parlia/parlia.go:2356-2372@8cc60b246`：backOffTime 先取默认值，过 Lorentz 改为 2000 ms，再按 parent 时间判断 Jenner 改回 1000 ms。说明 BEP-714 怎么实现，以及为什么叫 “restore”。
2. `bsc/miner/miner_mev.go:75-123@8cc60b246`：SendBidBlock 的准入顺序：开关 / Pasteur 检查 → 验签 → builder 是否注册 → 权限 → 拒绝硬分叉激活块 → 配额 → 截止时间 → 覆盖 Extra → MEV 标记 → 封块前校验。
3. `bsc/miner/bid_simulator.go:715-760@8cc60b246`：preSealVerifyBidBlock。依次检查零 root、coinbase、gasLimit、未签名 header、时间上界、TxHash，并从 deposit 交易推导 GasFee。
4. `bsc/miner/bid_block.go:336-391@8cc60b246`：先广播后 InsertChain；失败就按违规撤销 builder。注释列出了能抓到的错误类别（Root / ReceiptHash / … / BEP-703）。
5. `bsc/miner/bid_block.go:260-320` 与 `miner/bid_block_evidence.go:18-75`：跨验证者证据与 N/2+1 阈值。
6. `bsc/consensus/parlia/bid_block.go:69-85`：只把 legacy、零 gas price、零签名、发往系统合约的交易当作待签系统交易（#3773）。
7. `bsc/core/types/builder/block_mev_info.go:26-40`：把（版本，builder）编码进 RequestsHash。
8. `bsc/core/vm/contract_milli_timestamp.go:48-54` 与 `core/vm/contracts.go:1983-1989`：0x70 的实现，以及 0x68 的 Jenner 计价 `10000 + len(input)*16`。
9. `bsc/consensus/parlia/parlia.go:666-690`：Amsterdam 前拒绝 BAL hash / SlotNumber，并附注释解释原因。
10. `reth-bsc/src/hardforks/bsc.rs:218-233@349f55c`：qanet 的 Pasteur 重新激活注释（状态根事故）与 Jenner 时间戳。

---

## 图的素材

**近期开发全景（按层）**：

| 层 | 内容 |
|---|---|
| 资产 | CAS20（BEP-702） |
| 资源配额 | Payment Lane（BEP-703） |
| 合约可见能力 | 0x70 毫秒时间（BEP-706）；0x68 重新计价 |
| 出块流水线 | BEP-675 BidBlock + 加固 + gRPC；应用层 BAP-710 relayer 位于其上游 |
| 共识 | BEP-714 backoff；BAL / SlotNumber header 检查；区块号必须等于 parent+1 |
| 客户端底座 | geth v1.17.3 同步，删除 superinstruction / incr / multidb；reth-bsc 双客户端 |

**BidBlock 流水线时序**：

参与者：Builder → MEV-Sentry（纯代理）→ Validator →（P2P）→ 其他节点。

1. builder 执行用户交易，再执行未签名的系统交易，组装 header，签名，经 JSON-RPC 或 gRPC 提交。
2. validator 准入，带分支：
   - 开关关闭 / 被撤销 / 硬分叉激活块 / 太晚 → 拒绝，builder 回落 SendBid；
   - 封块前校验失败 → 返回 -38007。
3. 到截止时间（`parent.ms + interval − DelayLeftOver`），按 GasFee 选出最优 BidBlock。
4. 签系统交易、重算 TxHash、加投票聚合签名、封块。
5. 广播。
6. 本地 InsertChain 验证，带分支：
   - 成功 → 检查平均 gas price，过低则撤销 450 秒；
   - 失败 → 撤销 24 小时。
7. 其他节点导入失败 → 发出 BadBidBlockEvent → 达到 N/2+1 个不同验证者 → 全网各自撤销该 builder。

Payment Lane 检查位于第 6 步（广播后的导入阶段），不在封块前。

**功能进度时间线**：

| 日期 | 事件 |
|---|---|
| 06-17 | BEP-675 合并 |
| 07-21 | Chapel Pasteur |
| 08-13 | v1.8.0-alpha |
| 08-18 | BEP-706 Go 合并 |
| 08-20 | reth v0.1.2 |
| 08-25 | 主网 Pasteur |
| 09-11 | CAS20 / Payment Lane Go 合并 |
| 09-14 | 官方博客（98% / +28%） |
| 09-15 | BEP-714 Go 合并 |
| 09-20 | BEP-718 与 Jenner 公告 |
| 09-23 / 24 | Rust 移植 Payment Lane / CAS20 |
| 10-05 | QANet Jenner（Rust 配置） |
| 10-08 | BAP-710 合并 |
| 10 月下旬 | 测试网 Jenner（计划） |
| 11 月下旬 | 主网 Jenner（计划） |

---

## 外部调研的修正

1. **“官方 9 月 14 日报告称，在当时最近三天的窗口中约 98%”**：窗口实际是**截至 2026-09-01** 的三天，属于上线后第一周的数据；09-14 只是发布日期 [13]。
2. **“Jenner 同期还计划加入跨验证者 bad-block 证据、撤销持久化、零 state root 拒绝”**：这些已在 08-20 至 09-03 合并进 develop（#3798 / #3796 / #3806），不只是计划；但都还没进 release [1][6]。
3. **Jenner 范围只列了 4 个 BEP**：代码里还有一项绑定 Jenner 的共识变更，即 0x68 按字节计价（#3772 / reth #498），BEP-718 和公告都没列 [8][12]。另外 PR #3772 的标题写 “at Pasteur”，代码实际是 Jenner。
4. **BEP-714 只描述了“2 秒→1 秒”**：没提 09-11 至 09-15 版本曾包含 turnLength 8→4 和自动维护等阈值调整，后来缩减了范围 [9]。
5. **BAP-710 “9 月新增”**：创建于 09-03，但 10-08 才合并进 BEPs 仓库 [8]。
6. **v1.8.0-alpha “删除 superinstruction / incr snapshot”**：属实，但需补充两点：主网生产版本 v1.7.7 / v1.7.8 不含这些删除；BEP-592 早在 v1.7.6（#3690）就已删除 [3]。另外 GitHub 上 v1.8.0-alpha 被标为 “Latest”，而不是 pre-release。
7. **“reth-bsc v0.1.2 … 测试环境的 Pasteur 切换”**：基本正确，具体是 bsc-qanet，并且导致 qanet 的 Pasteur 激活被推迟、重新排期 [5]。
8. **“BSC 正在推动 gRPC + RLP”**：已合并（Go 08-31 / Rust 09-16），默认开启，端口 8552。尚未发布，公告说随 Jenner release 一起发布 [10]。
9. **外部调研没提到的安全修复**：#3808（区块哈希可被篡改）、#3773（typed 交易被 blind-sign）、#3785（区块号连续性）。
10. **“70M / 80M / 90M 是规划”**：截至 10-09，主网 gas limit 已是 70M（本次 RPC 采样）。80M 和 90M 仍是目标 [13]。

---

## 来源

1. **PRIMARY** bsc `git log develop / origin/master --since=2026-06-01`、`git merge-base --is-ancestor` @8cc60b246 / c5533ab5b：证明 commit 清单，以及各 commit 属于哪个 release。
2. **PRIMARY** reth-bsc `git log` @349f55c；`gh pr view` #415 / 480 / 494 / 497 / 498 / 510 / 512 / 531：证明 Rust 移植的合并日期和对齐方式。
3. **PRIMARY** bsc release notes v1.7.4–v1.8.0-alpha（`gh release view`）和 CHANGELOG.md：证明 Pasteur 时间、v1.8 同步内容和删除的功能。
4. **PRIMARY** `bsc/params/config.go:255-256,310-311@8cc60b246`：证明 Pasteur 时间，以及 Jenner 在主网和 Chapel 均为 nil。
5. **PRIMARY** reth-bsc release notes v0.1.0–v0.1.2；`src/hardforks/bsc.rs@349f55c`：证明 Rust 发布内容、状态根事故和 QANet 排期。
6. **PRIMARY** bsc PR #3691 / 3741 / 3773 / 3796 / 3798 / 3806 / 3808 / 3822 / 3759 / 3768 / 3716 / 3690 / 3726 的描述与合并时间：证明各项加固的动机和日期。
7. **PRIMARY** bsc 源码：`miner/*.go`、`consensus/parlia/*.go`、`core/types/builder/*`：证明 BidBlock 流程和撤销逻辑。
8. **PRIMARY** BEPs @e9b2be3：BEP-673 / 675 / 706 / 714 / 718、BAP-710、BAPs/README、README 索引：证明规范内容和 Draft 状态。
9. **PRIMARY** BEPs 历史：commit 2a6d8a4、1d5ed5a、07c33e4、730aa00、364e67b；`gh pr list` open PR：证明 BEP-714 的范围缩减、BEP-696 被删除、仍未合并的提案。
10. **PRIMARY** https://docs.bnbchain.org/announce/jenner-bsc/（2026-10-09 访问，页面日期 2026-09-20）：证明 4 个 BEP、测试网 10 月下旬 / 主网 11 月下旬、BEP-675 加固随该 release 发布、gRPC flag。
11. **PRIMARY** https://docs.bnbchain.org/announce/pasteur-bsc/：证明 Pasteur 时间和所含 BEP。
12. **PRIMARY** `bsc/core/vm/contracts.go:431-460,1983-1989`、`contract_milli_timestamp.go`、`params/protocol_params.go:163-164,186`：证明 0x70 和 0x68 的计价。
13. **PRIMARY**（官方博客，含项目方口径的数据）https://www.bnbchain.org/en/blog/post-pasteur-hard-fork-bsc-packs-28-more-gas-per-block-with-more-scale-ahead（2026-09-14）：证明 98% / +28%、时间窗口、gas limit 路线图。
14. **PRIMARY** 主网 RPC 采样（bsc-dataseed.bnbchain.org，2026-10-09 约 08:04 UTC）：证明 gasLimit = 70M、样本中区块均带 BidBlock 标记、节点版本 Geth/v1.7.7。
15. 官方路线图 https://www.bnbchain.org/en/blog/tech-roadmap-2026（2025-12-30）：只作背景。
16. ALP 博客 https://www.bnbchain.org/en/blog/agent-lifecycle-protocol-an-open-standard-for-the-agent-economy（2026-09-15）：仓库外方向，只提一句。

---

## 开放问题

1. QANet 是否已在 10-05 激活 Jenner，运行情况如何？Go 端 override 值是多少？
2. Jenner 正式 release 的版本号（v1.8.x？）和 Chapel / 主网的精确时间。
3. 主网有多少 reth-bsc 节点？是否有验证者在用 reth-bsc？
4. Rust BidBlock 的系统交易候选检查没有限定 legacy 类型，与 Go #3773 是否存在行为差异？
5. #3798 与博客所说的“15 个空 state root BidBlock”之间的因果和时间顺序。
6. 0x68 重新计价为什么没有写进 BEP-718 / 公告（是疏漏，还是有意不列）？
7. 80M gas limit（计划 10-10 之后）的实际推进情况；主网利用率（采样中平均约 25%）与博客“95% 以上利用率”口径的差异。

---

## 台账

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| J1 | Jenner meta BEP-718 于 2026-09-20 合并，列出 BEP-702、703、706、714 四个需要硬分叉的 BEP | BEPs/BEP-718.md:27-37@e9b2be3；commit 992d8c8 | observed |
| J2 | 官方公告：Jenner 测试网 2026 年 10 月下旬、主网 11 月下旬，具体时间和 release 版本未公布 | https://docs.bnbchain.org/announce/jenner-bsc/ “Upgrade Timeline” | observed |
| J3 | Go 客户端中主网与 Chapel 的 JennerTime 均为 nil | bsc/params/config.go:256,311@8cc60b246 | observed |
| J4 | reth-bsc 只给 QANet 配了 Jenner：1791176400（2026-10-05 05:00 UTC）；PR #531 于 10-05 创建、10-09 合并 | reth-bsc/src/hardforks/bsc.rs:231-232@349f55c；gh pr view 531 | observed |
| J5 | QANet 已于 10-05 实际激活 Jenner | 仅有 #531 的配置，没有运行证据 | speculative |
| J6 | 0x68 双签证据预编译从 Jenner 起计价为 10000 + 16×输入字节数，BEP-718 和公告均未列出 | bsc/core/vm/contracts.go:1983-1989；params/protocol_params.go:163-164；来源 [10] | observed |
| J7 | Pasteur 在 Chapel 于 2026-07-21 02:30 UTC、主网于 2026-08-25 02:30 UTC 激活；对应 Go v1.7.6 / v1.7.7 | params/config.go:255,310；bsc release v1.7.6 / v1.7.7 notes | observed |
| J8 | Pasteur 包含 BEP-682、BEP-695；BEP-675 不需硬分叉，在 Pasteur 激活后开放 | BEP-673.md:34-39；pasteur-bsc 公告 | observed |
| J9 | BEP-675 去掉了 validator 封块前对 bid 的重放，关键路径 EVM 执行从 3 次降为 2 次，BEP 估算 gas 上限约 +50% | BEP-675.md §2、§7 | observed |
| J10 | validator 只为 deposit / distributeFinalityReward / updateValidatorSetV2 三种系统交易做 blind-sign，并且（#3773 后）只接受 legacy 类型 | consensus/parlia/bid_block.go:26-30,69-85 | observed |
| J11 | BidBlock 广播后通过 InsertChain 验证；失败撤销 builder 24 小时，平均 gas price 过低撤销 450 秒 | miner/bid_block.go:336-412；miner/bid_block_permission.go:25-28 | observed |
| J12 | 跨验证者证据：不同 cabinet 验证者或全部验证者达到 N/2+1，即撤销 builder，窗口 24 小时 | miner/bid_block.go:260-320；miner/bid_block_evidence.go:18-20；PR #3806 | observed |
| J13 | 撤销记录以 JSON 文件持久化在 datadir（bidblockrevokes.json），与 #3796 的 PR 描述（chain database）不一致 | miner/bid_block_permission.go:31-36；miner/minerconfig/config.go:41；PR #3796 描述 | observed |
| J14 | 硬分叉激活块（Pasteur / Jenner）拒绝 BidBlock，由 validator 自己出块 | miner/miner_mev.go:117-121；PR #3741 | observed |
| J15 | 零 state root 的 BidBlock 在封块前即被拒绝（#3798，08-20 合并） | miner/bid_simulator.go:720；gh pr view 3798 | observed |
| J16 | gRPC SendBidBlock 默认开启，端口 8552，可用 `--mev.grpc.disable` 关闭；Go 于 08-31 合并、Rust 于 09-16 合并 | miner/minerconfig/config.go:60；cmd/utils/flags.go:864-866；PR #3774、reth #494 | observed |
| J17 | BEP-675 各项加固（除 #3773 外）都还没进入任何 bsc release | git merge-base 核对 v1.8.0-alpha（notes §J-Q3）；release 列表 | observed |
| J18 | 官方博客：截至 2026-09-01 的三天窗口内约 98% 区块走 BidBlock，平均每块 gas 比 Bid V1 多 28%（主网实际流量，非基准测试） | 来源 [13] TL;DR 与 “BEP-675 Has Quickly Become…” 节 | observed |
| J19 | 2026-10-09 主网 RPC 采样：120 块全部 gasLimit = 70M，且全部带 BidBlock（v2）标记 | notes §J-Q3；来源 [14] | observed |
| J20 | 区块来源（Bid / BidBlock）和 builder 地址被编码进 header.RequestsHash | core/types/builder/block_mev_info.go:19-40；miner/bid_block.go:37-50 | observed |
| J21 | BEP-706：地址 0x70，20 gas，返回 Header.MilliTimestamp()（Time×1000 + MixDigest 中的毫秒） | BEP-706.md §4；core/vm/contract_milli_timestamp.go:48-54；params/protocol_params.go:186 | observed |
| J22 | BEP-706 Go 于 08-18 合并（#3792），Rust 于 09-02 合并（#480） | gh pr view 3792；reth #480 | observed |
| J23 | BEP-714 把初始 backoff 从 2000 ms 改回 1000 ms，按 parent 时间判断是否已过 Jenner；8 块受影响 turn 从 19.6 秒降到 11.6 秒 | consensus/parlia/parlia.go:76-78,2356-2372；BEP-714.md §4.1 | observed |
| J24 | “restore” 指回到 Lorentz（BEP-520）之前的 1 秒默认值 | 由 J23 与 parlia.go:77-78 常量注释、BEP-714 §4.2 推出：1 秒是默认值，Lorentz 提高到 2 秒 | inferred |
| J25 | BEP-714 在 09-11 至 09-15 的版本还包含 turnLength 8→4、maintenanceThreshold = 40、misdemeanor 333→200、felony 1000→600；09-15 缩减为只改 backoff | BEPs commit 2a6d8a4、1d5ed5a（BEP-714 §3.1）、07c33e4 | observed |
| J26 | v1.8.0-alpha（08-13）是不面向生产的预览版：同步 geth v1.17.3，删除 superinstruction / incr snapshot，用 EIP-7928 脚手架替代 BEP-592，Amsterdam EIP 未激活 | bsc release v1.8.0-alpha notes；params/config.go:259 | observed |
| J27 | v1.17.3 合并和 superinstruction / incr 删除都不在主网生产版本 v1.7.7 / v1.7.8 中 | git merge-base --is-ancestor 6d65a799d / bdb833348 / ece8248c4 对 v1.7.7 / v1.7.8 均为 n | observed |
| J28 | BSC 客户端在向上游 geth 收敛，而不是分叉 | 由 J26、J27 与 PR #3690 理由 “decide to follow upstream”、PR #3716 推出 | inferred |
| J29 | #3808 修复了一个漏洞：Amsterdam 前，同伴节点可附加 BAL hash / SlotNumber 字段改变块哈希而签名仍有效 | commit 50407ccb4 消息；consensus/parlia/parlia.go:666-690 | observed |
| J30 | #3808 修的漏洞只影响 v1.8 代码线（v1.7.x 的 header 没有这些字段） | 由 J29 与 `git show v1.7.8:core/types/block.go` 中无此字段推出 | inferred |
| J31 | reth-bsc v0.1.2（08-20）首次发布 BidBlock 路径，并修复了在 bsc-qanet Pasteur 切换点导致集群分裂的状态根错误 | reth-bsc release v0.1.2 Note 1；src/hardforks/bsc.rs:220-230 | observed |
| J32 | reth-bsc 的 Jenner 相关实现（CAS20 #512、Payment Lane #497、BEP-706 #480、BEP-714 #510、gRPC #494）都没有 release，最新 tag 是 v0.1.2 | gh release list -R bnb-chain/reth-bsc；PR 合并日期 | observed |
| J33 | 没有证据表明主网验证者在运行 reth-bsc；README 仍写 “Run as validator ❌ (soon)” | reth-bsc/README.md:9-14@349f55c；路线图 [15] | observed |
| J34 | reth-bsc 按 Go 优先、golden fixture 回放的方式对齐（#512 回放 145 次 go-bsc 调用） | reth-bsc PR #512 描述 “Golden replay” 节 | observed |
| J35 | BAP-710 是应用层提案（Draft，创建于 09-03，10-08 合并），不改共识；registry 不强制报价过期 | BAP-710.md 头部与 §2、§4.2.2；BEPs commit e1b1d51 | observed |
| J36 | BAP-710 按“报价 write-set 与 taker read-set 有交集”匹配，组装 [报价…, taker 交易] 原子 bundle，发给多个 builder，失败则回落交易池 | BAP-710.md §4.5.2 | observed |
| J37 | CAS20 和 Payment Lane 的 Go 实现都在 2026-09-11 合并（#3813、#3793），Rust 分别在 09-24 和 09-23 合并（#512、#497） | gh pr view 3813 / 3793；reth #512 / #497 | observed |
| J38 | CAS20 在 Jenner 后还需 ActivationRegistry 开放创建；Payment Lane 支付合约名单初始为空，需治理添加，比例默认 500/10000 | BEP-718.md:34；BEP-702.md:97；BEP-703.md:208,227 | observed |
| J39 | BEP-702 的修订 PR #716 仍 open，而 Rust 实现是按 #716 而不是 master 文本实现的 | gh pr view 716 -R bnb-chain/BEPs；reth #512 Rationale 节 | observed |
| J40 | Jenner 正式 release 很可能基于 v1.8 代码线 | develop 的 version.go = 1.8.0-alpha；该推测没有发布说明支持 | speculative |
| J41 | 官方 gas limit 路线：55M → 70M（9 月中）→ 80M（10-10 之后）→ 约 90M（11 月中，有条件） | 来源 [13] “From 55M Toward 90M Gas” 节中的图片 | observed |
| J42 | 后量子（BEP-707 / 708 / 713）、BEP-684、BEP-668 都只是 open PR 提案 | gh pr list -R bnb-chain/BEPs --state open | observed |

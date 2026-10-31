# notes-preconf：排序、出块、预确认、读路径、网络（分路 P）

- 调研路：P（台账前缀 P）。调研日期 2026-10-31，网页来源均为当日访问。
- 源码（相对路径）：
  - mantle-xyz/reth main @574e7f3，下称 `reth@574e7f3`，路径相对 `mantle-reth/crates/`；
  - mantlenetworkio/mantle-v2 @1780605，下称 `v2@1780605`；
  - mantle-xyz/op-geth @e33cd26，下称 `op-geth@e33cd26`，本地 `/tmp/rhsrc/op-geth`。
- **工具限制**：本路运行时没有 bash，没跑 `gh` / `cast` / `rg`。
  - 源码靠只读文件工具逐个打开。行号只对少数关键行用偏移读取核对过，其余写“文件 + 符号名”。
  - PR #370 与 release 列表用网页抓取（github.com 页面、`.diff`）核实。op-geth `preconf/` 的目录清单用 GitHub contents API 取得。
  - 链上参数引用姊妹报告 2026-10-26 UTC 的 `cast` 结果。
- **部署画像**：主会话已核实，登记在 notes-main.md 的 K 行，本文只引用、不重复登记。
  - 主网 sequencer 仍是 **op-geth v1.6.3**。
  - 主网 mantle-op-reth（mantle-v1.6.2 @574e7f39）是跟随它的**候选 sequencer**；sepolia-v133 上 reth 才是 sequencer。
  - mainnet-v133 / sepolia-v133 的 reth 开了 `--preconf.enable`。
  - mantle-v2 v1.6.3 已部署。
- **两套预确认实现要区分**：
  - 下文 P1–P3 的结论（`--preconf.*`、journal、预算、listener）都属于 **reth 路径**。草稿 E1–E5 针对的也是这条路径。
  - op-geth 有另一套实现（`--txpool.frompreconfs/topreconfs/allpreconfs`、`SendRawTransactionWithPreconf`、miner preconf checker），见 P1b。
  - 主网当前生效的是 op-geth 路径。
- 所有“默认值”都是**代码默认值**。reth 侧具体开了哪种资格规则、预算多少，仍需内部核实。

---

## P1 reth 预确认子系统的公开实现（候选 sequencer / Sepolia sequencer 路径）

### 答案
- **适用范围**：本节描述 reth 路径。主网目前不由它出块（K 行），但它是 pure Reth 迁移后的目标路径，也是 Sepolia 的现行路径。
- **开关与资格是两件事**：
  - `--preconf.enable`（默认关）决定子系统是否存在。
  - `--preconf.all` 只是资格规则，表示所有交易都合格；不开时需要 from 和 to 同时命中白名单 [1][2]。
- **默认值**：超时 1s、safety margin 40ms、sweep 200ms、slot 2s、单笔上限 2M gas、每块预算 6M gas；journal 每 60s 轮转、上限 1 GiB [1]。
- **预算怎么扣**：
  - 先按交易声明的 `gasLimit` 悲观预判，通过后按实际 `gasUsed` 累加。
  - 预算与超时闸门只对 `source=Rpc` 的条目生效，`Replay` 条目绕过 [9]。
- **pool listener 会把普通交易也拉进预确认路径**：它把任何合格的 pending 交易以 `source=Rpc` 推入 FIFO，不管交易从哪个 RPC 方法进来 [3]；同时普通打包臂跳过所有合格交易 [10]。所以开 `--preconf.all` 后：
  - 不存在普通执行路径；
  - 所有交易都受 2M 单笔上限约束，超限的在入池时就被拒 [4]；
  - 所有交易共享每块 6M 预算，超出的被标为 `Canceled` 并从交易池删除 [5][9]。
  
  草稿 E3 的对照组因此不存在。
- **journal**：
  - 追加只做 `write_all` + `flush`，不做 `sync_all`；追加失败只记 warn，仍返回回执 [6][7]。
  - 记录只有 `hash`、`tx_rlp`、预测的 `block_height`、`committed_at_ms` [7]。
  - 未封装的条目 30 分钟后被放弃 [7][8]。
- **回执**：
  - 回执在交易应用到在建块的内存状态之后、封块之前返回。代码声称回执与最终封块回执字节一致 [10]。
  - job 被丢弃时，已成功的条目以 `Replay` 方式重放到下一块 [10]。
  - 重组时只打 warn [12]。
  - 线上状态没有撤销态 [14]。
- **对外暴露**：没有预确认状态的读接口，跟随节点只是把请求转发给 sequencer [14]。
- **HA**：预确认代码里没有复制或交接逻辑；op-conductor 只在封块后提交 unsafe 块 [15][18]。

### 依据
**启用与资格**
- `PreconfArgs`：`--preconf.enable` 不传时 `into_config()` 返回 `None`，节点“behaves exactly like upstream op-reth”；`--preconf.all` 对应 op-geth 的 `--txpool.allpreconfs` [2]。
- `PreconfConfig::is_preconf_tx`：`all_preconfs` 为真时全部合格；否则 from 与 to 都要在白名单里，合约创建不合格。`validate()` 拒绝 `EnabledWithoutEligibility` 的配置 [1]。

**默认值**（`config.rs@574e7f3`）
- 超时 `:12`，sweep `:21`，slot `:29`，单笔上限 `:36`，每块预算 `:43`，margin `:54`。
- margin 注释：“slightly exceed measured p99 apply latency on the target hardware”。
- `validate()` 要求 `per_block >= per_tx`，且 `sweep <= slot` [1]。

**预算扣减**（`builder/dispatch.rs@574e7f3`）
- 超时闸门 `:254`。
- 预算闸门从 `:268` 起，按 `gas_limit` 预判。
- `:346–347` 按 `receipt.gas_used` 累加。
- `is_rpc = entry.source == PreconfSource::Rpc`；注释说 Replay 条目绕过两道闸门，以兑现“once a receipt has been returned to the client, the tx must land on chain” [9]。

**pool listener 与普通路径**
- `PreconfPoolListener::run` 只看 pending 事件，按 `is_preconf_tx` 过滤；哈希不在 journal 已封集合时，source 为 `Rpc` [3]。
- `PreconfTxSet::push_if_absent`：没有 responder 的条目，`inserted_at` 取推入时刻 [5]。
- `payload_builder.rs:747`：普通 best-tx 臂对合格交易 `mark_invalid` 后跳过 [10]。
- `pool_ext/validator.rs`：`gas_limit > preconf_max_gas_per_tx` 时返回 `PreconfGasLimitExceeded`，不能入池 [4]。
- `pool_evict` 注释与 `PreconfServiceBuilder::start`：任何 `mark_timeout / mark_canceled / mark_failed` 成功后，同步从交易池删除这笔交易 [5][8]。

**journal**
- `journal.rs:234–235`：`write_all` 后 `flush`。文档写“explicit `flush` (not `sync_all`) … durability against power loss would require an additional `sync_all`” [7]。
- `rpc.rs:245–253`：追加失败只 `warn!("journal append failed; commitment may be lost on restart")`，然后 `Ok(event)` [6]。
- **写入时机**：journal 在收到回执之后、返回客户端之前写。在已读文件中，只有 `rpc.rs` 的回执分支调用 `append_promised` [6][3]。
- **rotate**：持写锁做全文件重写。**恢复**：先 rotate，再重新入池，并以 `Replay` 推入 FIFO。**放弃时限**：30 × 轮转间隔 [7][8]。

**回执与区块**
- `payload_builder.rs` 模块文档：两类交易共享同一个在建 `State<DB>`，“RPC-returned receipt byte-equal to the sealed block's receipt”。
- `replay_fifo_carryover`：job 被丢弃后，Success 条目重置并以 Replay 重放 [10]。
- `payload_job.rs`：构建跑到 getPayload 才结束，期间不发布中间 payload [11]。
- `canon_handler.rs` 的 `observe_reorg`：只打 `reorg_drift` warn；注释承认“block_height may drift” [12]。
- `rpc-ext/src/lib.rs`：`PreconfTxEvent{tx_hash,status,reason,block_height,receipt{logs}}`；`PreconfStatus` 只有 4 种 [14]。

**对外接口**
- 扩展方法只有 `getBlockRange`、`sendRawTransactionWithPreconf`、`estimateTotalFee`、`simulateV1`。跟随节点转发请求，并记 `preconf.forward.duration_ms` [14]。

**metrics**（`metrics_seed.rs`）[13]
- 13 个计数器、4 个 gauge、5 个直方图（`preconf.api.handle_duration_ms`、`preconf.execute.duration_ms`、`preconf.validate.duration_ms`、`preconf.dispatch.elapsed_at_gate_ms`、`preconf.journal.rotate_duration_ms`）。
- 直方图都用 `as_millis() as f64` 截断成整数毫秒（如 `dispatch.rs:340`）。

**HA**
- `op-conductor/README.md` 写的是 Raft 选 leader，并“store latest unsafe block” [18]。
- `sequencer.go` 的 `onBuildSealed` 在封块后才 `CommitUnsafePayload` [15]。

### 不确定之处
- 未打开 `apply.rs`、`types.rs`、`payload_job_generator.rs`、`cancel.rs`、`pool_adapter.rs`、cli 的 main。“journal 只在 rpc.rs 写”限于已读文件。
- “kill -9 保得住、断电保不住”是推断，未实测。
- 候选 reth sequencer 与 Sepolia 上用的是 `--preconf.all` 还是白名单、预算是多少，K 行只确认开了 `--preconf.enable`。

---

## P1b op-geth 预确认（主网现行路径）与 reth 的对比

### 答案
- **配置**：op-geth 的预确认配置只有四项：`FromPreconfs`、`ToPreconfs`、`AllPreconfs`、`PreconfTimeout`（默认 1s）。**没有**单笔 gas 上限，也**没有**每块预算 [34]；reth 的 `config.rs` 也注明单笔上限“op-geth has no equivalent” [1]。
- **持久化**：op-geth 的 FIFO（`preconf.FIFOTxSet`）只在内存里。`preconf/` 包没有 journal 文件 [35][36]。在本路读到的范围内，op-geth 路径**没有**类似 reth 的“已承诺交易”日志与重启重放机制。
- **回执来自哪里**：op-geth 的回执来自 miner 的 `preconfChecker` 在一个**单独的准入环境**里试执行，而不是真正在建的区块。这个环境是“块 N+1 的影子”：由刚封的块 N 的状态，加上从 L1 日志预测的 deposit 交易构造而成 [37]。
  - 封块后，`UnpausePreconf` 在新环境里重放 deposit 和“unsealed preconf txs”；重放失败只 `log.Warn` 然后 `continue` [37]。
  - 所以 op-geth 的回执是**预测**：最终区块里的执行结果要靠 worker 按相同顺序打包才一致。代码里没有 reth 那种“共享同一 State、字节一致”的结构性保证（推断）。
- **op-geth 的安全阀，比 reth 多**：`precheck()` 在下列情况下拒绝预确认 [37][38]：
  - op-node 同步状态异常；
  - 准入环境超过 12s 未更新；
  - L1 head 超过 108s 未更新；
  - L1 origin 落后超过 9 块；
  - 准入环境领先 unsafe 头超过 6 块（`PreconfBufferBlock`）。
- **固定 2 秒块时**：`nextBlockEnv` 写死了 `preconfL2BlockTime = 2` [37]。缩短区块时间时，这里必须改代码。
- **对草稿的含义**：
  - E1–E5 针对 reth 路径，结论适用于 Sepolia 与 pure Reth 迁移之后。
  - 对**当前主网**（op-geth）而言，E4 的“一定上链”更弱：没有专门的承诺日志；预确认的执行结果来自影子环境，可能与最终区块不一致（推断）。
  - E3 的预算问题不存在，因为 op-geth 没有预算；E1 的分段口径也不同。
  - 建议 E4 在两条路径上分别做，并把“op-geth → reth 切换”本身当作一个承诺语义变化来审计。

### 依据
- `op-geth@e33cd26 preconf/tx_pool_config.go`：`DefaultTxPoolConfig{FromPreconfs, ToPreconfs, AllPreconfs:false, PreconfTimeout:1s}`；`IsPreconfTx` 的规则与 reth 相同（all，或 from 与 to 同时命中）[34]。
- `op-geth@e33cd26 preconf/fifo_tx_set.go`：`FIFOTxSet{txMap, txQueue}` 只在内存中，提供 `Add / Remove / Forward / CleanTimeout` [35]。
- GitHub contents API（`/repos/mantle-xyz/op-geth/contents/preconf?ref=e33cd26`，2026-10-31）：目录只有 `deposit_log.go`、`deposit_source.go`、`fifo_tx_set.go`、`id.go`、`metrics.go`、`miner_config.go`、`sync_status.go`、`tx_pool_config.go` 及测试文件 [36]。
- `op-geth@e33cd26 miner/preconf_checker.go` [37]：
  - `Preconf()`：在 `c.env` 的副本上执行 `applyTxWithResetEnv`；
  - `nextBlockEnv`：Number+1，`Time = env.header.Time + preconfL2BlockTime(2)`，“ParentHash and the roots can't be [correct], since block N is not sealed yet”；
  - `UnpausePreconf`：重放 deposit 与 unsealed preconf txs，失败只 warn；
  - `precheck()` 中的各项容忍阈值。
- `op-geth@e33cd26 preconf/miner_config.go`：`ToleranceBlock 6` → `MantleToleranceDuration` 12s、`EthToleranceDuration` 108s、`EthToleranceBlock` 9；`PreconfBufferBlock 6`；`EnablePreconfChecker` 默认 false [38]。

### 不确定之处
- 没读 op-geth 的 `SendRawTransactionWithPreconf`（internal/ethapi）、worker 如何把 FIFO 排在前面、预确认交易是否以 local 交易身份进入 geth 自带的 `txpool.journal`（如果是，重启后可能被重新入池，但没有承诺语义）。所以“op-geth 没有承诺重放”限于 `preconf/` 包与 checker。
- 主网 op-geth 是否开了 `EnablePreconfChecker`、白名单是谁，未知（K 行未覆盖）。

---

## P2 mantle-v2：eager build、出块路径、op-conductor

### 答案
- **参数**：`--sequencer.eager-build`，环境变量 `OP_NODE_SEQUENCER_EAGER_BUILD`，默认 `true` [16]。
- **作用**：只把下一块构建的起始时间提前到 FCU 时刻，封块时间不变 [15][16]。
- **效果上限**：op-node 在下一个 payload 时间前 50ms 封块，所以消除的空窗最多约 50ms/块（推断）。
- **版本**：v1.6.3 是最新 release，包含 #370 [17]，并已部署（K 行）。
- **op-conductor**：只复制已封的 unsafe 块 [15][18]。

### 依据
- PR #370 diff：`SequencerEagerBuildFlag{Name:"sequencer.eager-build", Value:true}`，Usage 写“Seal timing is unchanged”。改动 9 个文件，+112/−1，2026-08-26 合并，commit 31de5a2；合并时 `op-acceptance-tests (reth)`、`go-lint`、`semgrep-scan-local` 为 FAILURE [16]。
- 本地克隆：
  - `sequencer.go:476@v2@1780605`：eager 时 `d.nextAction = now`，否则等到 `payloadTime.Add(-blockTime)`；
  - `:25`：`sealingDuration = 50ms`；
  - `onBuildStarted`：在 `payloadTime - sealingDuration` 封块；
  - `:473–474`：BlockTime 以整数秒计 [15]。
- release 页：“1.6.3 Elysium … #370 Enabled eager next-block construction …”，并要求在 L1 Glamsterdam 前部署 [17]。
- **适用范围**：eager build 在 op-node 侧，与 EL 是 op-geth 还是 reth 无关。但 op-geth 的预确认用影子环境 [37]，所以“空窗”对它的意义不同：影子环境在 `UnpausePreconf` 之后才可用。E2 应分别在两种 EL 上测（推断）。

### 不确定之处
- 封块加导入超过 50ms 时，关闭 eager build 也会立即开始下一块，所以实际可消除的空窗更小（推断）。
- op-node 是否有现成的空窗指标，未查。

---

## P3 草稿 E1–E6 的设计评审（reth 路径）

### 答案
- **E1**：漏了 5 段真实存在的等待：
  1. 跟随节点转发；
  2. listener 推入；
  3. 等待活跃的 build job；
  4. journal 追加（含轮转时的锁等待）；
  5. 序列化。
- **E3**：在 `--preconf.all` 下没有对照组；默认 6M 预算还会卡死 E7 / E8。
- **E4**：需要加两种注入——“在建 job 被丢弃”和“journal 写失败”。主备切换下兑现不了属于设计边界。
- **E5**：结果由设计决定（没有对外暴露预确认状态）。
- **E6**：需要拆段测量。
- **阈值**：只有 50ms 有旁证；E7 / E8 的封块阈值应与 op-node 的 50ms 封块窗口挂钩，而不是 200ms。
- **主网口径**：在当前主网（op-geth）上跑 E1–E5 时，测到的是 P1b 描述的另一套实现，计时点和判读都要换。

### 依据
**reth 真实请求路径** [6][3][5][9][10][14]：

```
client → proxyd → 跟随 RPC（forward，preconf.forward.duration_ms）
→ handle_inner：decode/recover → 资格 → latest 状态取 nonce/余额 → attach responder
→ pool.add_transaction（preconf.validate.duration_ms）
→ pending 事件 → listener push → broadcast
→ 【没有 build job 时：在 FIFO 里等到下一个 job 的 carryover】
→ admission → dispatch 闸门（preconf.dispatch.elapsed_at_gate_ms）
→ apply（preconf.execute.duration_ms）→ responder
→ journal append（无指标）→ 返回
```

sequencer 侧端到端由 `preconf.api.handle_duration_ms` 覆盖。

- **E7/E8 的 50ms**：`sealingDuration = 50ms` [15]。
- **E3**：默认预算 6M/块，约 3 Mgas/s，而主网 target 是 15M/块 [19]。

### 不确定之处
- 姊妹报告记录的 2026-06-24 QA 压测饱和在 ~29.5 Mgas/s，说明当时不是“reth sequencer + `--preconf.all` + 默认预算”的配置。Sepolia 上 reth 当前的 preconf 配置未知。

---

## P4 更短区块：Base Denim、OP Subblocks、参数换算

### 答案
**Base Denim**
- 2026-10-21 18:00 UTC 在 Base Sepolia 激活；主网“targeting November 2026”，是计划时间，所需客户端版本未发布 [20][21]。
- 每 200ms 一个完整的 canonical 块。header 时间戳仍以秒计，加 BaseTime 存款（`tx[1]`，gas limit 1,000,000）表达毫秒。
- Denim 取代 Flashblocks，激活后 `pending` 状态取消 [21][22]。

**OP Subblocks**
- 子块 append-only，以 `payload_id + index` 标识，**预确认可撤销** [24]；按时间比例释放块 gas [25]。
- OP Mainnet 自 2026-08-31 运行 Subblocks [19]。

**Mantle 自己的情况**
- op-node 以整数秒排程 [15]；op-geth 的预确认准入环境写死 2s [37]。所以亚秒 canonical 块要改协议，还要同时改 op-node、两套 EL 的预确认代码，以及证明程序。
- “bedrock 版本测试时出块不稳定”只能作为作者陈述 [33]。

**参数换算**（推断）
- 保持每秒 gas 不变：target 1.5M/块、limit 6M/块、reth 预算 0.6M/块。
- 0.6M 小于 2M 单笔上限，reth 的 `validate()` 会拒绝该配置。
- 需要 `--preconf.slot-duration-ms=200`；50ms 封块提前量占 200ms slot 的 25%。
- denominator 需要放大约 10 倍。
- 按 `block.number` 计时的合约，时长缩为 1/10 [21]。

### 依据
- Base 页面（overview、200ms-blocks、migrate）[20][21][22]；OP Subblocks 规范与 gas 说明（搜索摘录）[24][25]。

### 不确定之处
- Denim 下 Base 的 gas 参数新取值未找到；有一份旧的规范副本与现行页面矛盾。

---

## P5 网络：L2 真正需要的“网络优化”

### 答案
- L2 有三类影响用户可读延迟的数据分发路径：
  1. unsafe 块 P2P gossip；
  2. 备机（conductor 只复制已封的块）；
  3. 读副本或订阅者（Arbitrum feed / relay、MegaETH replica）。
- 草稿“网络优化大多作用于 L1”说得过满。
- MegaETH 的一手文档里没有找到 QUIC。

### 依据
- **OP**：op-node 文档写 P2P 故障时 unsafe 链停滞 [32]。
- **Arbitrum**：feed 消息带单调序号、可续传、缺口从父链回填；建议每个数据中心一个 relay [26]。
- **MegaETH**：replica 不重执行；mini-block 约 10ms，头由 sequencer 签名 [27][28][29]。

### 不确定之处
- MegaETH 的传输协议未公开；Mantle 跟随节点的拓扑属于内部信息。

---

## P6 RPC 可读路径与状态流语义

### 答案
- Base 已用 canonical 200ms 块取代 pending / Flashblocks 状态 [22]，`eth_getTransactionCount` 页面滞后 [23]。GPT 以 Base pending-state 作参考已过时。
- Mantle 两套实现都没有对外的预确认状态流：
  - reth 侧只有 `sendRawTransactionWithPreconf` [14]；
  - op-geth 侧在本路读到的范围内也没有（未读 ethapi，见 P1b 的不确定之处）。
- 状态流需要的语义：`payload_id` 或预测块号 + `index / seq`、父块哈希、缺口检测与续传、显式撤销事件、canonical 对账，可选签名。

### 依据
- [22][23][24][26][28][12][14]。

### 不确定之处
- op-geth 是否有预确认订阅接口：`PreconfStatus::Waiting` 的注释写“typically not broadcast to subscribers”，暗示可能有（speculative）。

---

## 对草稿 / GPT 评审的修正

### 草稿
1. **E1“降低单笔 gas 上限 2M”**：reth 默认值已经是 2M；op-geth 根本没有单笔上限 [1][34]。
2. **E3 用 `--preconf.all` 做对照（reth）**：普通臂会跳过合格交易、2M 上限在入池时拒绝、超预算的交易被逐出 [4][5][9][10]。观察到的是丢交易，不是延迟。
3. **E7 / E8 与 reth + `--preconf.all` + 默认预算不兼容**（推断）。
4. **“当前 6M”**：这是 reth 代码默认值；当前主网的 op-geth 路径没有预算这个概念 [1][34]。
5. **E2“p99 高 20ms 以上”**：效果上限约 50ms/块，应按到达相位分桶 [15][16]。
6. **E4“检查主备切换时承诺的交接”**：reth 没有交接逻辑 [15][18]；主网 op-geth 路径连承诺日志都没有 [35][36]。
7. **E5 阈值**：结果由设计决定 [14]。
8. **E7 / E8“封块 p99 ≤ 200ms”**：应与 50ms 封块窗口挂钩 [15]。
9. **网络行**：说得过满 [26][32]。
10. **E1–E5 没写明针对哪个 EL**：主网是 op-geth，reth 只在 Sepolia 和候选 sequencer 上（K 行）。实验计划要写明 EL，并分别测。

### GPT
1. **§2.2 journal**：对 reth 属实 [6][7]；漏了“回执之后才写”“30 分钟放弃”“没有撤销态”。GPT 也没区分 op-geth，后者没有专门的 journal [35][36]。
2. **§2.3 `--preconf.all`**：对 reth 属实但说轻了 [4][5][9][10]。
3. **§E9**：数字正确；补充 `validate()` 冲突、denominator 约 ×10、50ms 封块窗口、op-geth 写死 2s。
4. **§E5 引用 Base pending-state**：已过时 [22]。
5. **§5.7 QUIC**：本路复核结论一致。
6. **§E2**：属实；参数名、默认值已核实 [16]。

---

## 对路线与实验的建议（建议，非已批准方案）

**优先级**：E4′ 为 P0；E1′、E3′、E2′ 为 P1；E5′ / E6′、E9′ 为 P2。

### E0′ 配置清单
- 分别记录主网（op-geth）、候选 reth、Sepolia 的：EL 版本、预确认资格规则、`EnablePreconfChecker`、reth 的 `--preconf.*`、journal 所在磁盘、conductor 配置。
- **判读**：pure Reth 切换前，如果 reth 用 `--preconf.all` 加默认 6M 预算，切换后用户可用 gas 约为 6M/块。当前主网利用率 0.167% [19]，暂时不构成约束，但切换前必须调整。

### E1′ 预确认分段计时（reth；op-geth 另做一版）
- **reth 时间点**：
  - 已有指标：`preconf.forward.duration_ms`、`preconf.validate.duration_ms`、`preconf.dispatch.elapsed_at_gate_ms`、`preconf.execute.duration_ms`、`preconf.api.handle_duration_ms`。
  - 需新增：listener 推入耗时、journal 追加耗时、slot 内到达相位。
  - 直方图改成小数毫秒。
- **op-geth 版**：记录 `precheck` 拒绝原因、`Preconf()` 执行耗时，以及 `UnpausePreconf` 暂停时长（op-geth 的 preconf metrics 里有 `MetricsPreconfMinerPauseCost`）。
- **判读**：

| 观察 | 结论 | 措施 |
|---|---|---|
| 尾部集中在 slot 末段 | 空窗主导 | 看 E2′ |
| 尾部与 rotate 时刻重合 | journal 锁等待 | 缩短 rotate 时间或拆分锁 |
| 尾部来自 gate 前排队 | FIFO 排队或预算问题 | 看 E3′ |
| op-geth 暂停时长主导 | 封块到 UnpausePreconf 是空窗 | 优化重放过程 |

### E2′ eager build
- 开 / 关各跑一次，按到达相位分桶；在两种 EL 上分别测。
- 末段桶收益 ≤50ms 即符合预期。

### E3′ 预算压测（仅 reth，必须用白名单模式）
- 扫描预确认占比、gasLimit / gasUsed 比、预算；指标用 `preconf.dispatch.gas_budget_skipped_total`。
- 被拒集中在 gasLimit 远高于 gasUsed 的交易时，修正 gas 估算，不要提高预算。

### E4′ 承诺兑现审计（上线门槛，两条路径分别做）
- **reth**：kill -9；断电；journal 磁盘满或只读；强制丢弃 job；conductor 切换；L1 重组。
- **op-geth**：kill -9（内存 FIFO 会丢）；deposit 预测错误（L1 日志与实际派生不一致）；`UnpausePreconf` 重放失败。
- **对账**：每张回执与最终区块逐字段比较。
- **切换审计**：op-geth → reth 切换时，在途的预确认如何处理。
- **判读**：

| 观察 | 结论 | 措施 |
|---|---|---|
| 主备切换后出现未兑现的回执 | 设计边界 | 先设计复制或交接，再对外宣称“一定上链” |
| 断电后丢承诺 | 缺 fsync | group-commit fsync 或复制确认 |
| 追加失败仍返回回执 | 承诺语义有漏洞 | 追加失败就拒绝发回执 |
| op-geth 回执与最终块不一致 | 影子环境预测失败 | 量化发生率；作为迁移到 reth 的理由之一 |

### E5′ / E6′ 读路径
- **E5′**：直接测 δ = 回执时刻 → 跟随 RPC 上 `latest` 可读的时刻。
- **E6′**：拆成封块 → gossip → 收到 → newPayload → 可查询，对比只跟随的节点与有查询压力的节点。

### E9′ 更短区块可行性清单
- 秒级 BlockTime 改造；op-geth `preconfL2BlockTime` 写死 2s；reth 预算与单笔上限冲突；denominator 约 ×10；50ms 封块提前量；`block.number` 合约审计；kona / SP1 同步修改。

---

## 来源

1. **PRIMARY** `reth@574e7f3 preconf/src/config.rs`。证明 reth 预确认的默认值与资格规则，以及“op-geth has no equivalent”的注释。
2. **PRIMARY** `reth@574e7f3 cli/src/args.rs`。证明 CLI 参数名与默认关闭。
3. **PRIMARY** `reth@574e7f3 preconf/src/pool_ext/preconf_pool_listener.rs`。证明 listener 以 Rpc 来源推入。
4. **PRIMARY** `reth@574e7f3 preconf/src/pool_ext/validator.rs`。证明单笔上限在入池时执行。
5. **PRIMARY** `reth@574e7f3 preconf/src/preconf_tx_set.rs`。证明 `inserted_at` 规则与终态逐出。
6. **PRIMARY** `reth@574e7f3 preconf/src/rpc.rs`。证明回执之后写 journal、追加失败仍返回。
7. **PRIMARY** `reth@574e7f3 preconf/src/journal.rs`。证明 flush 不 fsync、记录字段、恢复与放弃。
8. **PRIMARY** `reth@574e7f3 preconf/src/service_builder.rs`。证明放弃时限与交易池逐出回调。
9. **PRIMARY** `reth@574e7f3 preconf/src/builder/dispatch.rs`。证明闸门与预算扣减。
10. **PRIMARY** `reth@574e7f3 preconf/src/builder/payload_builder.rs`。证明普通臂跳过、共享状态、重放、时间比例配额。
11. **PRIMARY** `reth@574e7f3 preconf/src/builder/payload_job.rs`。证明构建跑到 getPayload 才结束。
12. **PRIMARY** `reth@574e7f3 preconf/src/canon_handler.rs`。证明重组只打 warn。
13. **PRIMARY** `reth@574e7f3 preconf/src/metrics_seed.rs`。证明指标名单。
14. **PRIMARY** `reth@574e7f3 rpc-ext/src/lib.rs`。证明回执字段、4 种状态、没有 pending 接口。
15. **PRIMARY** `v2@1780605 op-node/rollup/sequencing/sequencer.go`。证明 50ms 封块、eager 分支、整数秒排程、封块后才提交 conductor。
16. **PRIMARY** mantle-xyz/mantle-v2 PR #370 页面与 .diff（2026-10-31）。证明 eager build 的参数、默认值与合并信息。
17. **PRIMARY** github.com/mantle-xyz/mantle-v2/releases（2026-10-31）。证明 v1.6.3 是最新 release 且包含 #370。
18. **PRIMARY** `v2@1780605 op-conductor/README.md`。证明 conductor 的职责范围。
19. 姊妹报告 high-performance-chain-roadmap `research/notes-mainsession.md` §2/§5/§7（2026-10-26 / 27）。用于主网参数、利用率、QA 压测、OP Subblocks 上线时间。
20. **PRIMARY** docs.base.org/upgrades/denim/overview。证明 Denim 状态。
21. **PRIMARY** docs.base.org/upgrades/denim/200ms-blocks。证明 Denim 协议改动范围。
22. **PRIMARY** docs.base.org/upgrades/denim/migrate-from-flashblocks。证明 Flashblocks 与 pending 状态取消。
23. **PRIMARY** docs.base.org/.../eth_getTransactionCount。证明该页文档滞后。
24. **PRIMARY** specs.optimism.io/protocol/subblocks.html（搜索摘录）。证明子块语义与预确认可撤销。
25. **PRIMARY** docs.optimism.io/.../subblocks-and-gas-usage（搜索摘录）。证明子块按时间比例释放 gas。
26. **PRIMARY** docs.arbitrum.io/run-a-node/run-feed-relay。证明 feed 序号、续传与 relay 部署建议。
27. **PRIMARY** docs.megaeth.com/architecture。证明 MegaETH 节点角色。
28. **PRIMARY** docs.megaeth.com/mini-block 与 realtime-api（搜索摘录）。证明 mini-block 头签名。
29. megaeth.com/research（搜索摘录）。证明 replica 经 p2p 接收 state diff。
30. 线索：`research/gpt-deep-research.md`。
31. 线索：`research/references/drafts.md`。
32. **PRIMARY** pkg.go.dev 上 op-node 包文档（搜索摘录）。证明 P2P 故障时 unsafe 链停滞。
33. 草稿 drafts.md 中的 bedrock 陈述（作者陈述，无法核实）。
34. **PRIMARY** `op-geth@e33cd26 preconf/tx_pool_config.go`。证明 op-geth 预确认配置只有四项，超时默认 1s，资格规则与 reth 相同。
35. **PRIMARY** `op-geth@e33cd26 preconf/fifo_tx_set.go`。证明 FIFO 只在内存中。
36. **PRIMARY** GitHub contents API `mantle-xyz/op-geth/contents/preconf?ref=e33cd26`（2026-10-31）。证明 `preconf/` 包里没有 journal 文件。
37. **PRIMARY** `op-geth@e33cd26 miner/preconf_checker.go`。证明影子准入环境、写死 2s、重放失败只 warn、precheck 各项阈值。
38. **PRIMARY** `op-geth@e33cd26 preconf/miner_config.go`。证明容忍阈值与 `PreconfBufferBlock` 6。

已降级的来源：
- 搜索缓存里 Base 规范的旧副本（写“Denim not active”）——过时；
- cointelegraph、eco.com——二手。

---

## 开放问题

1. 主网 op-geth 的预确认是否启用（`EnablePreconfChecker`、白名单 / all）？候选 reth 与 Sepolia reth 用的是 all 还是白名单，预算多少？
2. op-geth 的预确认交易是否作为 local 交易进入 geth `txpool.journal`？worker 如何排序 FIFO？影子环境的回执与最终区块不一致的发生率是多少？
3. pure Reth 切换时，在途的预确认如何处理？是否计划把预确认流复制到备机？
4. 当前对外宣称的承诺等级是什么？
5. Base Denim 的 gas 参数新取值。
6. MegaETH 节点间的传输协议。

---

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
| P1 | mantle-reth 的 `--preconf.enable` 默认关闭，不传时节点行为等同 upstream op-reth | `cli/src/args.rs` `PreconfArgs::enable` / `into_config`@574e7f3 | observed |
| P2 | reth 的 `--preconf.all` 只把 `all_preconfs` 设为 true，是资格规则而不是启用开关 | `cli/src/args.rs` `all` 字段；`preconf/src/config.rs` `is_preconf_tx`@574e7f3 | observed |
| P3 | reth 白名单模式要求 from 与 to 同时命中，合约创建只在 all 模式下合格 | `preconf/src/config.rs` `is_preconf_tx`@574e7f3 | observed |
| P4 | reth 预确认客户端超时默认 1s | `preconf/src/config.rs:12`@574e7f3 | observed |
| P5 | reth 普通交易 sweep 间隔默认 200ms | `preconf/src/config.rs:21`@574e7f3 | observed |
| P6 | reth slot 默认 2s | `preconf/src/config.rs:29`@574e7f3 | observed |
| P7 | reth 预确认单笔 gas 上限默认 2,000,000 | `preconf/src/config.rs:36`@574e7f3 | observed |
| P8 | reth 预确认每块 gas 预算默认 6,000,000 | `preconf/src/config.rs:43`@574e7f3 | observed |
| P9 | reth safety margin 默认 40ms，注释称按目标硬件实测 apply p99 略大取值 | `preconf/src/config.rs:54` 及注释@574e7f3 | observed |
| P10 | reth journal 默认每 60s 轮转、上限 1 GiB，broadcast 容量 65536 | `preconf/src/config.rs` `DEFAULT_REJOURNAL_INTERVAL` / `DEFAULT_JOURNAL_MAX_SIZE` / `DEFAULT_BROADCAST_CAP`@574e7f3 | observed |
| P11 | reth `validate()` 要求每块预算不小于单笔上限，且 sweep 不大于 slot | `preconf/src/config.rs` `validate`@574e7f3 | observed |
| P12 | reth 预算闸门按交易声明的 gasLimit 预判，通过后按实际 gasUsed 累加 | `preconf/src/builder/dispatch.rs:268` 起与 `:346–347`@574e7f3 | observed |
| P13 | reth 超时与预算闸门只作用于 source=Rpc 的条目，Replay 条目绕过 | `preconf/src/builder/dispatch.rs` `is_rpc` 与 `:254`@574e7f3 | observed |
| P14 | reth 合格交易的 gasLimit 超过单笔上限时在交易池校验阶段被拒 | `preconf/src/pool_ext/validator.rs` `validate_transaction`@574e7f3 | observed |
| P15 | reth pool listener 把任何合格的 pending 交易以 source=Rpc 推入 FIFO | `preconf/src/pool_ext/preconf_pool_listener.rs` `run`@574e7f3 | observed |
| P16 | reth 无 responder 的 listener 条目以推入时刻作为 inserted_at | `preconf/src/preconf_tx_set.rs` `push_if_absent`@574e7f3 | observed |
| P17 | reth 普通 best-tx 打包臂跳过所有预确认合格交易 | `preconf/src/builder/payload_builder.rs:747`@574e7f3 | observed |
| P18 | reth FIFO 条目转为 Timeout / Canceled / Failed 时，回调把交易从交易池删除 | `preconf/src/preconf_tx_set.rs` `pool_evict` 注释；`service_builder.rs` `start`@574e7f3 | observed |
| P19 | reth 开 `--preconf.all` 后不存在普通执行路径，所有用户交易受 2M 单笔与 6M 每块预算约束，超预算的被逐出 | 由 P2、P12–P18 推出 | inferred |
| P20 | reth 默认参数下开 `--preconf.all`，用户交易每块最多约 6M gas，低于主网 15M target，E7 / E8 达不到目标负载 | 由 P8、P19、P55 推出 | inferred |
| P21 | 草稿 E3 在 reth `--preconf.all` 下没有可用的普通交易对照组 | 由 P19 推出 | inferred |
| P22 | reth journal 追加只做 write_all 与 flush，不做 sync_all，注释承认断电不耐久 | `preconf/src/journal.rs:234–235` 与 `append_promised` 文档@574e7f3 | observed |
| P23 | reth journal 追加失败只记 warn，仍返回预确认回执 | `preconf/src/rpc.rs:245–253`@574e7f3 | observed |
| P24 | reth journal 在收到执行回执之后、返回客户端之前写入 | `preconf/src/rpc.rs` 回执分支@574e7f3 | observed |
| P25 | reth journal 条目只含 hash、tx_rlp、预测 block_height、committed_at_ms | `preconf/src/journal.rs` `JournalEntry`@574e7f3 | observed |
| P26 | reth 启动恢复先 rotate，再重新入池并以 Replay 推入 FIFO，入池失败的条目跳过 | `preconf/src/journal.rs` `restore_preconf_state`@574e7f3 | observed |
| P27 | reth 未封装的 journal 条目超过 30 个轮转周期（默认 30 分钟）被放弃并计数 | `preconf/src/service_builder.rs` `from_config`；`journal.rs` `UNSEALED_ABANDON_ROTATIONS`@574e7f3 | observed |
| P28 | reth rotate 期间持写锁读写整个文件，append 被阻塞 | `preconf/src/journal.rs` `rotate`@574e7f3 | observed |
| P29 | reth 预确认回执在交易应用到在建区块状态后、封块前返回，与普通交易共享同一个在建 State | `preconf/src/builder/payload_builder.rs` 模块文档@574e7f3 | observed |
| P30 | reth 在建 job 被丢弃时，已成功的预确认条目以 Replay 在下一块重放 | `preconf/src/builder/payload_builder.rs` `replay_fifo_carryover`@574e7f3 | observed |
| P31 | reth 重组时 canon handler 只打 warn、不恢复，注释承认 block_height 可能漂移 | `preconf/src/canon_handler.rs` `observe_reorg`@574e7f3 | observed |
| P32 | 预确认线上状态只有 success / failed / timeout / waiting，没有撤销态 | `rpc-ext/src/lib.rs` `PreconfStatus`@574e7f3 | observed |
| P33 | 预确认回执含 tx_hash、status、reason、预测 block_height、logs，不含 state root 或签名 | `rpc-ext/src/lib.rs` `PreconfTxEvent`@574e7f3 | observed |
| P34 | reth 回执经重放、恢复或重组后，最终块号与执行结果可能与回执不同 | 由 P25、P30、P31 推出 | inferred |
| P35 | mantle-reth 没有对外暴露预确认后的状态，扩展 RPC 只有 4 个方法 | `rpc-ext/src/lib.rs` `MantleEthApiExt`@574e7f3 | observed |
| P36 | reth 跟随节点转发 preconf 请求并记录 `preconf.forward.duration_ms` | `rpc-ext/src/lib.rs` `send_raw_transaction_with_preconf`@574e7f3 | observed |
| P37 | reth 现有 preconf 直方图为 api.handle、execute、validate、dispatch.elapsed_at_gate、journal.rotate_duration | `preconf/src/metrics_seed.rs` `HISTOGRAMS`@574e7f3 | observed |
| P38 | reth preconf 直方图以 as_millis 截断成整数毫秒 | `preconf/src/builder/dispatch.rs:340`；`rpc.rs` `handle`@574e7f3 | observed |
| P39 | reth 现有指标不覆盖 journal 追加、listener 推入、等待构建上下文三段 | 由 P37 与 `metrics_seed.rs` 清单推出 | inferred |
| P40 | reth 路径下，草稿 E5 中读方只能在下一块封装、传播、导入后读到新状态 | 由 P29、P35 推出 | inferred |
| P41 | mantle-v2 包含 op-conductor，用 Raft 选 leader 并保存最新 unsafe 块 | `op-conductor/README.md`@1780605 | observed |
| P42 | op-node 在封块之后才把 unsafe payload 提交给 conductor | `op-node/rollup/sequencing/sequencer.go` `onBuildSealed`@1780605 | observed |
| P43 | reth 在建块的预确认承诺只存在于 sequencer 内存与本机 journal，主备切换时没有交接 | 由 P22–P27、P41、P42 推出 | inferred |
| P44 | pure Reth 切换后，若沿用公开代码并配置 conductor 主备，切换时会出现回执未兑现 | 由 P43 推测，未来部署配置未知 | speculative |
| P45 | eager build 参数名为 `--sequencer.eager-build`，环境变量 `OP_NODE_SEQUENCER_EAGER_BUILD`，默认 true | PR #370 diff `op-node/flags/flags.go`（https://github.com/mantle-xyz/mantle-v2/pull/370，2026-10-31） | observed |
| P46 | eager build 只把下一块构建的起始时间提前到 FCU 时刻，封块时间不变 | `op-node/rollup/sequencing/sequencer.go:476`@1780605；PR #370 Usage | observed |
| P47 | op-node 在下一个 payload 时间前 50ms 封块（sealingDuration） | `op-node/rollup/sequencing/sequencer.go:25` 与 `onBuildStarted`@1780605 | observed |
| P48 | eager build 消除的空窗上限约 50ms/块，约占 2s slot 的 2.5% | 由 P46、P47 推出 | inferred |
| P49 | 按整体 p99 判读 E2 很可能看不出效果，应按到达相位分桶 | 由 P48 推出 | inferred |
| P50 | PR #370 于 2026-08-26 合并，改 9 个文件 +112/−1，合并时 reth 验收测试 CI 为 FAILURE | https://github.com/mantle-xyz/mantle-v2/pull/370（2026-10-31） | observed |
| P51 | 截至 2026-10-31，mantle-v2 最新 release 是 v1.6.3 Elysium，release notes 列出 #370 | https://github.com/mantle-xyz/mantle-v2/releases（2026-10-31） | observed |
| P52 | v1.6.3 要求节点运营者在 L1 Glamsterdam 激活前部署 | 同上 release 页 Warning 段 | observed |
| P53 | op-node 以整数秒的 rollup BlockTime 排程出块 | `op-node/rollup/sequencing/sequencer.go:473–474`@1780605 | observed |
| P54 | Mantle 引入亚秒 canonical 块需要协议级时间戳改造，不能只改参数 | 由 P53、P59 推出 | inferred |
| P55 | Mantle 主网 gasLimit 60M、denominator 50、elasticity 4（target 15M），读取于 2026-10-26 UTC | 姊妹报告 `notes-mainsession.md` §2 | observed |
| P56 | 2026-10-26 抽样的 24 小时主网平均 gas 利用率为 0.167% | 姊妹报告 `notes-mainsession.md` §2 | observed |
| P57 | 保持每秒 gas 不变改为 200ms 区块，target 约 1.5M、limit 约 6M、reth 预确认预算约 0.6M/块 | 由 P55、P8 按 1/10 换算 | inferred |
| P58 | 0.6M/块预算小于 2M 单笔上限，reth 现有 `validate()` 会拒绝该配置 | 由 P7、P11、P57 推出 | inferred |
| P59 | Base Denim 每 200ms 一个独立 canonical 块，并用 BaseTime 存款（tx[1]，gas limit 1,000,000）补充毫秒时间 | https://docs.base.org/upgrades/denim/200ms-blocks（2026-10-31） | observed |
| P60 | Base Denim 于 2026-10-21 18:00 UTC 在 Base Sepolia 激活 | 同上 Warning 段；/upgrades/denim/overview | observed |
| P61 | Base 主网 Denim 是“targeting November 2026”的计划时间，客户端版本未发布 | 同上 Warning 段 | observed |
| P62 | Denim 取代 Flashblocks，激活后 pending 标签与预确认状态没有直接等价物 | https://docs.base.org/upgrades/denim/migrate-from-flashblocks | observed |
| P63 | Denim 下按 block.number 计时的合约时长缩为 1/10 | https://docs.base.org/upgrades/denim/200ms-blocks “Block-Number-Based Contract Logic” | observed |
| P64 | 若 denominator 不变，200ms 区块下 base fee 按墙钟计的调整速度约快 10 倍 | 由 P55、P57 与 EIP-1559 公式推出 | inferred |
| P65 | Base eth_getTransactionCount 页面仍推荐 Flashblocks 的 pending nonce，与 Denim 迁移指引不一致 | https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_getTransactionCount 对比 P62 | observed |
| P66 | GPT 以 Base pending-state 作为 E5 的设计参考已过时 | 由 P62 推出 | inferred |
| P67 | OP Subblocks 子块 append-only、以 payload_id 加 index 标识，预确认可在放弃或重组在建块时撤销 | https://specs.optimism.io/protocol/subblocks.html（搜索摘录） | observed |
| P68 | OP Subblocks 按时间比例释放块 gas | https://docs.optimism.io/app-developers/guides/transactions/subblocks-and-gas-usage（搜索摘录） | observed |
| P69 | reth 普通打包臂同样按 t/slot × 块 gas 上限线性释放配额，注释称沿用 op-rbuilder flashblocks 模式 | `preconf/src/builder/payload_builder.rs` `derive_pool_quota_schedule`@574e7f3 | observed |
| P70 | OP Mainnet 自 2026-08-31 运行 Subblocks | 姊妹报告 `notes-mainsession.md` §7 | observed |
| P71 | Arbitrum feed 消息带单调序号、可续传、缺口从父链回填，feed 是延迟优化而不是真相源 | https://docs.arbitrum.io/run-a-node/run-feed-relay | observed |
| P72 | Arbitrum 建议多节点部署时每个数据中心运行一个 feed relay | 同上开头 Warning | observed |
| P73 | MegaETH 区分 sequencer、replica（不重执行）与 full node，mini-block 约 10ms、EVM block 约 1s | https://docs.megaeth.com/architecture | observed |
| P74 | MegaETH 的 mini-block 头由 sequencer 签名 | https://docs.megaeth.com/mini-block（搜索摘录） | observed |
| P75 | 在 MegaETH 的架构、Realtime API、mini-block 文档中没有找到 QUIC 的一手描述 | 2026-10-31 抓取与检索 | observed |
| P76 | OP Stack unsafe 块经 P2P 中继，P2P 故障时 unsafe 链会停滞 | pkg.go.dev op-node 包文档（搜索摘录） | observed |
| P77 | 草稿“网络优化大多作用于 L1”说得过满 | 由 P42、P71、P73、P76 推出 | inferred |
| P78 | E7 / E8 的封块阈值应与 50ms 而非 200ms 挂钩 | 由 P47 推出 | inferred |
| P79 | reth journal 每 60s 持锁轮转，可能在回执 p99 上造成周期性尖峰 | 由 P10、P28 推测，未测量 | speculative |
| P80 | Mantle 之前的 bedrock 版本在短区块测试中出块不稳定（作者陈述） | `research/references/drafts.md` 路线表 | speculative |
| P81 | op-geth 预确认配置只有 FromPreconfs、ToPreconfs、AllPreconfs、PreconfTimeout（默认 1s），没有单笔上限与每块预算 | `preconf/tx_pool_config.go` `DefaultTxPoolConfig`@op-geth e33cd26 | observed |
| P82 | op-geth 预确认 FIFO（FIFOTxSet）只在内存中 | `preconf/fifo_tx_set.go`@op-geth e33cd26 | observed |
| P83 | op-geth 的 `preconf/` 包没有 journal 文件 | GitHub contents API `/repos/mantle-xyz/op-geth/contents/preconf?ref=e33cd26`（2026-10-31） | observed |
| P84 | op-geth 预确认回执来自 preconfChecker 在“块 N+1 影子准入环境”（含预测的 L1 deposit）中的试执行，不是真正在建的区块 | `miner/preconf_checker.go` `Preconf` / `nextBlockEnv` / `UnpausePreconf`@op-geth e33cd26 | observed |
| P85 | op-geth 封块后在新环境重放 unsealed preconf txs，重放失败只 warn 并继续 | `miner/preconf_checker.go` `UnpausePreconf`@op-geth e33cd26 | observed |
| P86 | op-geth 在 op-node 同步异常、准入环境超过 12s 未更新、L1 head 超过 108s 未更新、L1 origin 落后超过 9 块、或准入环境领先超过 6 块时拒绝预确认 | `miner/preconf_checker.go` `precheck`；`preconf/miner_config.go`@op-geth e33cd26 | observed |
| P87 | op-geth 预确认准入环境写死 2s 区块间隔（preconfL2BlockTime = 2） | `miner/preconf_checker.go` `preconfL2BlockTime`@op-geth e33cd26 | observed |
| P88 | 主网现行的 op-geth 路径中，预确认承诺的耐久性与结果一致性都弱于 reth 路径（没有专门的承诺日志，回执来自影子环境） | 由 P82–P85 对比 P22–P30 推出；未读 ethapi 与 worker 排序 | inferred |

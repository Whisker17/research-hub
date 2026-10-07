---
imported_from: ChatGPT Deep Research
imported_at: 2026-10-07
original_file: censor-users-on-arbitrum.md
---

# Arbitrum 的 KelpDAO 资产冻结机制：技术复盘、Mantle 适用性与治理风险

**这里首先需要纠正一个关键点：KelpDAO 事件中的资产冻结，并不是通过某次 ArbOS 升级引入的 sequencer 黑名单完成的。**

实际发生的是：**Arbitrum Security Council 利用已有的 L1 合约升级权限，临时修改 Ethereum 上的 Inbox，让它能够提交“指定发送者”的无签名跨链交易，将攻击者地址中的 ETH 强制划转至隔离地址，然后恢复 Inbox 原实现。**这是一次基于治理权限的资产干预，而不是普通的交易拒绝服务。[Arbitrum](https://forum.arbitrum.foundation/t/security-council-emergency-action-21-04-2026/30803)

你记忆中的“ArbOS 升级引入的 sequencer 级功能”，更接近另一套机制：**ArbOS 61 Elara 的可选 Compliance Filtering**。它同时覆盖 sequencer 和状态转换函数，可以阻止经由强制收录路径进入的特定交易执行；但官方明确说明，该功能默认关闭，并非为 Arbitrum One 启用。两者不能混为一谈。[Arbitrum Docs](https://docs.arbitrum.io/launch-arbitrum-chain/chain-config/sequencer/compliance-filtering)

对 Mantle 的初步判断是：**值得评估类似的紧急资产隔离，但“攻击者尚未转移资产”和“团队控制 sequencer”都不是充分条件。**真正需要确认的是：当前部署版本的跨链消息认证、执行规则、证明程序和治理升级权限，能否共同支持一笔有效、可重放、范围受限的恢复交易。

本文按截至 **2026 年 10 月 7 日**查到的公开资料展开。你提到的 Mantle 近期被盗事件，我尚未匹配到唯一的攻击地址和交易，因此 Mantle 部分是机制适用性分析，不是已经验证可在主网执行的方案。

---

## 一、先建立背景：所谓“冻结资产”，可能发生在完全不同的层次

对 devs 来说，首先要把几个容易混淆的概念分开：

|干预层次|实际改变什么|主要问题|
|---|---|---|
|Sequencer 拒绝收录|不把某笔交易放入自己生产的区块|用户能否绕过 sequencer，从 L1 强制提交？|
|执行规则拒绝交易|交易即使进入区块，也按协议规则失败|谁能决定失败名单？验证者依据什么重放？|
|资产合约冻结|Token 或应用合约拒绝某些资产操作|是否仅覆盖这一种资产？能否通过其他合约路径操作？|
|特权划转或状态干预|无需原持有人同意，将资产移到另一地址|谁拥有授权？是否改变执行规则？能否约束使用范围？|

**KelpDAO 对应第四种；ArbOS 61 Compliance Filtering 主要对应前两种。**

这是一个分析框架，而不是措辞上的区别：第一种主要控制交易入口，第四种直接改变资产控制权。对用户的信任假设完全不同。

### 1.1 为什么 L2 上会存在“不需要发送者签名”的交易？

不能把所有 L2 交易都理解为：

```
用户签名 → 恢复公钥 → 确定 sender → 执行
```

跨链系统还需要另一种授权模式：

```
L1 上经过认证的消息
    → L2 根据协议派生交易
    → 使用消息所认证的 sender 执行
```

Arbitrum 本来就支持这种 unsigned transaction。它并不是任何人都能随意指定 `from` 的普通 RPC 接口：**授权来自 L1 消息通道，而不是交易自身的 ECDSA 签名。**普通 unsigned 消息还会应用地址 aliasing，以区分跨链身份。[Arbitrum Docs](https://docs.arbitrum.io/arbitrum-essentials/bridging/deposit/eth-and-messages)

在标准 `AbsInbox.sol` 中，`sendUnsignedTransaction` 提交消息时绑定的是 L1 调用者 `msg.sender`，而不是让调用者任意填写一个受害者地址。这是正常路径的关键认证边界。[GitHub](https://github.com/OffchainLabs/nitro-contracts/blob/main/src/bridge/AbsInbox.sol)

可以用以下概念模型理解：

```
普通路径：
    L1 调用者身份
        → Inbox 认证
        → 按 aliasing 规则映射
        → L2 sender

Kelp 应急路径：
    有权升级 Inbox 的治理主体
        → 临时改变 Inbox 的 sender 认证逻辑
        → 生成指定 L2 sender 的有效跨链消息
```

**Unsigned 不等于 unauthenticated。真正需要审计的是：谁有权决定被认证的 sender。**

### 1.2 地址 aliasing 为什么重要？

Arbitrum 的跨链地址映射采用固定偏移：

\[ \operatorname{alias}(a) = a + \texttt{0x1111000000000000000000000000000000001111} \pmod{2^{160}} \]

不同消息类型的处理并不完全相同。尤其不能把“签名交易”“unsigned 消息”和普通 ETH deposit 的身份语义混在一起。[Arbitrum Docs](https://docs.arbitrum.io/arbitrum-essentials/bridging/deposit/eth-and-messages)

因此，复现这类恢复操作时，不能简单认为“把 L1 参数设成攻击者地址，L2 的 `from` 就一定是攻击者地址”。必须核对消息解析和 aliasing，使**最终派生出来的 L2 sender**符合预期。

下面对 Kelp 的复盘会明确区分：哪些字段直接由链上交易确认，哪些是根据官方说明与标准代码还原的逻辑。

---

## 二、KelpDAO 那次冻结，实际执行了什么？

### 2.1 事故与干预的边界

Kelp 事件的起点是 rsETH 跨链验证及资产释放链路，而不是 Arbitrum 自身共识被攻破；后续恢复提案也将其作为跨协议损失与资产恢复问题处理。[Arbitrum](https://forum.arbitrum.foundation/t/constitutional-aip-approve-release-of-frozen-eth/30825)

这意味着，治理上的争议并不只是“链坏了，管理员修链”，而是：

> **当第三方应用或桥发生事故时，底层链是否应使用自己的最高权限，干预特定账户的资产？**

这个问题对 Mantle 尤其重要，因为它决定了应急权限的适用范围：只用于维护链本身，还是也用于生态应用事故。

### 2.2 谁授权了这次操作？

Arbitrum 的宪法为 Security Council 提供紧急行动权限。其紧急动作需要 **12 名成员中的至少 9 名**批准，可以绕过普通治理的等待流程；同时，宪法对紧急状态、行动范围及透明度提出要求。[Arbitrum Foundation](https://docs.arbitrum.foundation/dao-constitution)

这里需要区分两件事：

**不是先由 ARB 持有人对这笔冻结进行常规投票，再执行冻结；而是 Council 使用预先授予的紧急权限先行动，后续资产释放再进入治理流程。**

另外，`9/12` 是权限阈值，不等于我已经逐一验证了这笔交易中实际参与的签名人数。

### 2.3 两笔关键交易

**Ethereum 上的治理执行交易：**

```
0x079984c56c5670108f5c6f664904178f9b364340351949a42e4637d1f645f770
```

**Arbitrum One 上实际搬走 ETH 的交易：**

```
0x5618044241dade84af6c41b7d84496dc9823700f98b79751e257608dac570f6b
```

这两笔交易均由官方应急说明指向，后一笔在浏览器中被标记为 Security Council 的恢复操作。[Arbitrum](https://forum.arbitrum.foundation/t/security-council-emergency-action-21-04-2026/30803)

我通过 Blockscout 读取的 L1 交易显示：

|字段|结果|
|---|---|
|Ethereum 区块|`24925592`|
|时间|`2026-04-21 03:26:47 UTC`|
|顶层调用|Safe 的 `execTransaction(...)`|
|接收该调用的 Safe|`0xF06E95eF589D9c38af242a8AAee8375f14023F85`|
|执行状态|成功|

**证据边界：**L1 顶层调用和结果已经读取，但返回的完整嵌套 calldata 被截断。我没有完成临时实现字节码、每一层内部调用以及历史版本的逐字节 fork replay。因此，下面的内部流程是“官方披露＋标准协议代码＋实际 L2 结果”的逻辑复原，不应当作完整调用 trace。

### 2.4 第一步：临时升级 L1 Inbox

Council 的操作并不是给攻击者地址增加一个冻结标志，而是临时升级 Ethereum 上的 Inbox，增加名为：

```
sendUnsignedTransactionOverride
```

的能力，使该入口能够提交覆盖发送者身份的 unsigned 跨链消息。随后生成资产划转消息，再把 Inbox 恢复到原实现。[Arbitrum](https://forum.arbitrum.foundation/t/security-council-emergency-action-21-04-2026/30803)

为了理解权限边界，可以把这一过程抽象成下面的伪代码。**这不是实际 ABI，也省略了 aliasing、代理权限及消息编码细节：**

```
# 概念模型：同一笔 L1 治理交易内执行old_implementation = inbox.current_implementation()governance.upgrade(inbox, temporary_implementation)inbox.enqueue_authorized_message(    effective_l2_sender=attacker,    destination=quarantine,    amount=recovery_amount,    nonce=expected_nonce,    gas_budget=execution_budget,)governance.upgrade(inbox, old_implementation)
```

这里的“恢复原实现”有一个实质作用：不会把新增的入口长期留在普通用户可以接触的合约实现中。

但它**并没有撤销治理主体未来再次升级 Inbox 的权限**。关闭这一次的特殊入口，与消除底层升级权，是两件不同的事。

### 2.5 第二步：把消息送入正常的 L1→L2 通道

标准 Inbox 会将消息交给 Bridge，并产生消息交付记录；这些消息进入 delayed message 路径，供 L2 后续处理。正常 unsigned 交易提交路径中，消息内容与调用者身份的绑定由 Inbox 完成。[GitHub](https://github.com/OffchainLabs/nitro-contracts/blob/main/src/bridge/AbsInbox.sol)

因此，这次操作的关键不是：

> Sequencer 私自在本地数据库中减掉攻击者余额。

而是：

> 经过升级后的合法 L1 入口，产生一条协议认可的输入；L2 按已有消息语义处理这条输入。

这解释了为什么不需要攻击者的私钥，也不需要伪造其 ECDSA 签名。

### 2.6 第三步：L2 执行一笔 `ArbitrumUnsignedTx`

实际 L2 交易字段如下：

|字段|链上结果|
|---|---|
|区块|`454686044`|
|时间|`2026-04-21 03:35:08 UTC`|
|类型|`101`，即 `0x65 / ArbitrumUnsignedTxType`|
|From|`0x5d3919F12bCc35c26Eee5F8226A9bee90c257Ccc`|
|To|`0x0000000000000000000000000000000000000DA0`|
|Value|`30,765.667401709008927568 ETH`|
|Nonce|`0`|
|Calldata|`0x`|
|Gas limit / used|`100,000 / 21,000`|

这是一笔空 calldata 的原生 ETH 转账，而不是调用某个 Token 合约的 `freeze()`。[Arbitrum L2 Explorer](https://arbiscan.io/tx/0x5618044241dade84af6c41b7d84496dc9823700f98b79751e257608dac570f6b)

Arbitrum 的 `ArbitrumUnsignedTx` 类型包含显式 `From`；其签名字段不承载普通用户签名。同时，代码中的 `skipNonceChecks()` 和 `skipTransactionChecks()` 返回 `false`。因此，**“无签名”并不等于“nonce、余额和交易约束全部跳过”**。[GitHub](https://github.com/OffchainLabs/go-ethereum/blob/master/core/types/arb_types.go)

这也意味着，对资产恢复而言，目标账户当前 nonce、余额、交易竞争和账户类型仍然很重要，不能把这个能力理解成一个无条件的 `setBalance()`。

### 2.7 一个容易忽略的细节：公告金额与实际转账金额不一致

官方公告中的数额是：

```
30,765.667501709008927568 ETH
```

实际 `value` 是：

```
30,765.667401709008927568 ETH
```

相差：

\[ 0.0001\ ETH \]

这个差额恰好等于：

\[ 100{,}000\ \text{gas limit} \times 1\ \text{gwei gas price bid} = 0.0001\ ETH \]

而实际手续费是：

\[ 21{,}000 \times 0.020064\ \text{gwei} = 0.000000421344\ ETH \]

公告金额和交易 gas 字段支持上述计算。[Arbitrum](https://forum.arbitrum.foundation/t/security-council-emergency-action-21-04-2026/30803)

**我的判断是：该差额与预留最大 gas 预算完全一致，但不能把全部 `0.0001 ETH` 说成实际消耗的手续费。**这也提供了一个很好的工程提醒：恢复原生资产时，不能只把快照余额原样填入 `value`，还必须满足该交易类型的执行费用约束。

### 2.8 “原子操作”到底原子在哪里？

L1 治理交易的时间是 `03:26:47 UTC`，L2 转账执行时间是 `03:35:08 UTC`，相隔 **8 分 21 秒**。

所以，更精确的描述是：

```
L1：
    升级 Inbox
      → 写入跨链消息
      → 恢复 Inbox
    这几个动作在同一笔 L1 交易中完成

之后的 L2：
    派生并执行该跨链消息
```

**L1 上的原子性，不等于“L1 升级和 L2 资产转移跨链原子完成”。**L2 的执行时间由交易记录直接确认。[Arbitrum L2 Explorer](https://arbiscan.io/tx/0x5618044241dade84af6c41b7d84496dc9823700f98b79751e257608dac570f6b)

对于 Mantle，类似方案必须把这个异步窗口纳入威胁模型：消息尚未执行时，资产余额、相关账户状态或其他待执行交易可能发生变化。

### 2.9 为什么证明系统没有阻止这件事？

可以用一个简化公式理解 rollup 验证：

\[ S_{n+1}=\operatorname{STF}_{v}(S_n,M_n) \]

其中 `M_n` 是协议认可的输入，`v` 是有效的执行规则版本。ArbOS 本身就是 Arbitrum 状态转换的一部分。[Arbitrum Docs](https://docs.arbitrum.io/how-arbitrum-works/deep-dives/arbos)

这次操作的核心是改变**输入认证入口**，而不是让节点对同一个输入算出不同结果。

因此，以下两句话可以同时成立：

> 这笔交易符合当时协议认可的消息及执行规则。

> 这笔交易并未获得原资产控制者的同意。

证明系统验证的是前者，不会自动判断后者是否符合社会期待。**有效性证明或欺诈证明，并不会自行消除可升级入口的治理风险。**

### 2.10 这不是对攻击者地址的永久冻结

从实际交易看，被隔离的是转出的那批 ETH，而不是对攻击者地址建立永久的协议级禁用状态。

因此，不能从这笔操作推出“该地址以后收到任何资产也不能再动”。同样，EOA 中的原生 ETH 被转出，也不等于任意 ERC-20、借贷头寸、LP 权益或合约内资产都可以用相同 payload 恢复。这些情况需要分别分析对应的执行与资产合约约束。

---

## 三、后续发展：资产并没有一直停留在隔离地址

这部分很重要，因为“冻结成功”不等于“恢复完成”。

### 3.1 释放资金进入了另一套治理和法律流程

后续治理提案讨论了资金释放、接收安排以及相关责任保障，涉及 Aave、Kelp 等受影响方。冻结和最终分配并不是同一个决定。[Arbitrum](https://forum.arbitrum.foundation/t/constitutional-aip-approve-release-of-frozen-eth/30825)

更值得注意的是，**2026 年 5 月 8 日**的纽约南区法院命令修改了相关限制，允许链上投票及向 Aave LLC 钱包转移资金，但限制会随资金转移继续适用，其他争议被保留。该文件并没有一次性裁定最终资产归属。[CourtListener Storage](https://storage.courtlistener.com/recap/gov.uscourts.nysd.653423/gov.uscourts.nysd.653423.52.0.pdf)

因此，一个非常现实的风险是：

> 当链的治理主体证明自己能够控制、隔离和释放资产之后，外部主体也可能要求其承担相应的控制责任。

### 3.2 6 月 15 日，主要资金已经转出

链上记录显示，**2026-06-15 10:18:25 UTC**，隔离地址向下面的地址转出了约 **30,765.6174 ETH**：

```
接收地址：
0x3b87db6ded35eBD28EcbF8014fb325eef23f6C07

交易：
0x09795deb2b812f9bb069df8a0466cc7a96a17c3b2268c3924308d3d07dafdf72
```

这笔交易同样是 unsigned 类型，并产生接收 Safe 的事件。这里列的是实际链上接收地址，而不是最初治理草案中的接收地址。[Arbitrum L2 Explorer](https://arbiscan.io/tx/0x09795deb2b812f9bb069df8a0466cc7a96a17c3b2268c3924308d3d07dafdf72?utm_source=chatgpt.com)

因此，`0x…0DA0` 不能被简单理解为“永远无法取回的销毁地址”。这次先隔离、后释放的过程，本身就说明治理控制仍然存在。

本次核实覆盖了上述法院命令和六月的实际划转；不能据此进一步断言，截至十月所有诉讼和最终受偿分配都已结束。

---

## 四、你记忆中的 ArbOS 升级：ArbOS 61 Compliance Filtering

### 4.1 先明确它与 Kelp 操作的区别

Elara 提案最初以 ArbOS 60 推进，之后改为 ArbOS 61；官方于 **2026 年 8 月 20 日**发布 Elara 上线信息。提案中的合规过滤功能并未被安排在 Arbitrum One／Nova 上启用。[Arbitrum](https://forum.arbitrum.foundation/t/constitutional-aip-arbos-61-elara/30601/1)

两者最核心的差异是：

||Kelp 应急恢复|ArbOS 61 合规过滤|
|---|---|---|
|目的|隔离特定事故中的资产|持续阻止符合限制规则的交易|
|主要权限|L1 合约升级权|链配置与获授权的过滤管理者|
|状态效果|资产从 A 划到 B|交易拒绝收录或执行失败|
|是否需要覆盖强制收录|使用正常跨链输入完成操作|必须，否则可被绕过|
|是否是 One 上常开的功能|一次性应急动作|官方明确默认关闭、非为 One 启用|

### 4.2 为什么仅做 sequencer 黑名单不够？

如果系统允许用户绕过 sequencer，通过 L1 delayed inbox 提交交易，并在超时后强制收录，那么：

```
Sequencer 拒绝用户
    ≠
协议保证用户不能执行交易
```

Arbitrum 官方文档明确把这一点作为 STF 层过滤的动机：单纯的 sequencer 筛选无法覆盖强制收录路径。[Arbitrum Docs](https://docs.arbitrum.io/launch-arbitrum-chain/chain-config/sequencer/compliance-filtering)

这也是评估 Mantle 时最容易遗漏的地方。

### 4.3 第一层：Sequencer 模拟与筛选

在启用该功能的链上，sequencer 会先模拟交易，根据地址和事件等规则判断是否接受。规则不只针对顶层 `from/to`，也可涉及 Token 转移及执行中的地址访问。[Arbitrum Docs](https://docs.arbitrum.io/launch-arbitrum-chain/chain-config/sequencer/compliance-filtering)

这对 DeFi 很重要。比如：

```
交易发送者：第三方地址 B
实际动作：B 使用已有 allowance，
         从受限制地址 A 执行 transferFrom
```

若只看 `tx.from`，这个例子就可能漏掉资产流出。

但反过来，检查范围越深，就越需要考虑共享 Router、池子、批处理和清算交易的误伤。这是策略设计问题，不能通过“检查更多地址”自动解决。

### 4.4 第二层：Sentinel 把特定交易 hash 写进链上状态

对应的代码实现是：

```
precompiles/ArbFilteredTransactionsManager.go
```

其预编译地址为 `0x74`，提供增加、删除和查询被过滤交易 hash 的功能。调用权限通过 `TransactionFilterers` 成员检查，授权管理关联 ArbOwner。[GitHub](https://github.com/OffchainLabs/nitro/blob/master/precompiles/ArbFilteredTransactionsManager.go)

这里一个很关键的细节是：

> **链上记录的是被限制的 transaction hash，而不只是一个通用的账户余额冻结位。**

文档描述的流程是：sentinel 监控 delayed inbox，识别受限交易，在其被强制收录前注册 hash；STF 处理到该交易时，让它失败并消耗相应 gas。[Arbitrum Docs](https://docs.arbitrum.io/launch-arbitrum-chain/chain-config/sequencer/compliance-filtering)

概念上可以理解为：

```
# 链下策略判断if policy_rejects(delayed_transaction):    authorized_filterer.register(delayed_transaction.hash)# 链上确定性执行if transaction.hash in filtered_transaction_hashes:    fail_transaction_according_to_protocol()else:    execute_normally()
```

**强制收录仍然可以成立，但“被收录”不再意味着“可以成功执行”。**

### 4.5 真正的信任边界在哪里？

从 `AddFilteredTransaction` 的实现看，关键检查是调用者是否有权限；接口本身不要求调用者提交“该交易确实违法”的密码学证明。[GitHub](https://github.com/OffchainLabs/nitro/blob/master/precompiles/ArbFilteredTransactionsManager.go)

据此可以得出两个工程结论。

第一，**链上确定性与策略正确性是分离的**。各节点可以一致地执行某个 hash 的失败决定，但一致执行不代表这个决定没有误判。

第二，**系统仍依赖获授权的过滤者正确且及时地行动**。监控、策略更新、hash 注册和实际收录之间存在运行时序；不能把整个系统描述成一个无需运营保障、自动识别所有受限经济行为的协议。

这种设计也解释了为什么不能让每个验证者在重放历史区块时，自行查询一个不断变化的外部制裁 API：那样会破坏确定性。将过滤决定固定到链上状态，解决的是一致性问题，不是外部决策的正当性问题。

### 4.6 开发者需要关注的副作用

两个边界在官方文档中已经被明确指出：某些第三方 burn 可以有狭窄例外，但不是任何清算都被普遍豁免；另外，L1 已经锁入资产而 L2 对应入账被过滤时，可能出现资金锁住、L2 没有对应资产的情况。[Arbitrum Docs](https://docs.arbitrum.io/launch-arbitrum-chain/chain-config/sequencer/compliance-filtering)

更一般地，我会要求测试以下场景：已有 allowance、智能账户及代发交易、跨协议清算、同一交易中的多笔转移、Token 非标准事件，以及受限地址参与共享合约导致的连带失败。

这不是纯粹的治理开关。Nitro 的相关版本记录中，也出现过修复同一区块内过滤状态在交易间泄漏的问题，说明这类功能会增加真实的执行复杂度。[GitHub](https://github.com/OffchainLabs/nitro/blob/master/CHANGELOG.md?utm_source=chatgpt.com)

---

## 五、Mantle 能否采用类似操作？

### 5.1 先以当前架构判断，而不是沿用早期 Mantle 印象

本次查询的 L2BEAT 公开分析将 Mantle 描述为使用 **OP Succinct／SP1 有效性证明、向 Ethereum blobs 发布交易数据**的 rollup。其权限图显示，Security Multisig 为 **6/14**，拥有核心 L1 合约及相关证明配置的即时升级能力；Engineering Multisig 为 **3/7**，具有包括暂停提款在内的权限。资料还列出了通过 L1 绕过 sequencer 的强制收录路径，最长等待量级为 **12 小时**。[L2BEAT](https://l2beat.com/scaling/projects/mantle)

这里引用的是公开的部署权限分析；我没有独立对全部当前合约的 owner、代理实现和签名人配置进行逐项 RPC 复核。

对这次评估而言，重要推论是：

> **不能只问 Mantle sequencer 能不能拦交易，还要问 canonical 输入是什么、证明程序认可什么，以及升级权限最终控制什么。**

### 5.2 路径一：临时 sequencer 拒绝服务——只能作为缓冲措施评估

如果只是拒绝攻击者发来的交易，可能争取响应时间，但它并不自然等于资产冻结。

需要回答的问题包括：攻击者是否可以经 L1 提交？是否存在预先授权的第三方转移？资产是否已经进入应用头寸或待执行的跨链流程？

同样，暂停官方桥提款主要影响离开该桥的流程，并不自动阻止链内 Token 转账、DEX 交易或其他跨链通道。

**因此，单纯 sequencer 黑名单和桥暂停不能被包装成“已经可靠冻结这笔资产”。**

### 5.3 路径二：评估 canonical L1→L2 输入层的恢复交易

从协议结构上看，这条路径最值得与 Arbitrum 案例对照。

OP Stack 的 deposited transaction 使用类型 `0x7e`，不携带普通用户签名，显式包含 `from`。其授权由派生流程完成：L2 只接受由合法 L1 deposit 合约日志认证的发送者。[OP Stack Specification](https://specs.optimism.io/protocol/deposits.html)

所以，一个需要验证的工程假设是：

> 如果 Mantle 当前派生程序仍信任某个可升级的 canonical Portal，那么经过合法治理授权，对该入口进行极窄的临时修改，是否能够产生一笔当前执行规则已支持的恢复交易？

**这是基于 OP 规范提出的可行性方向，不是我已经确认 Mantle 当前部署可直接这么做。**

必须验证 Mantle 自身的修改，包括自定义资产语义、Portal 实现、消息派生、账户限制，以及证明程序对这些输入的处理。

另一个不能照搬的细节是：OP deposit 的唯一性依赖 `sourceHash`，交易格式本身没有普通交易那样的 nonce 字段；Arbitrum 的此次 unsigned 交易则包含 nonce。因此，连重放保护与竞争条件都需要按 Mantle 的实际实现重新分析。[OP Stack Specification](https://specs.optimism.io/protocol/deposits.html)

### 5.4 ZK 证明是否意味着必须升级证明器？

**不一定，要区分两类改动。**

**第一类：改变 canonical 输入入口，但产生的仍是现有证明程序支持的交易。**

这可能不需要新增执行语义。需要验证的是现有派生及证明程序是否会把该输入视为合法。Arbitrum 的案例提供的主要启发正是在这一层。

**第二类：直接增加账户冻结规则，或在某个区块特殊修改余额。**

这改变了状态转换规则。执行客户端、证明程序、版本激活条件和 L1 验证配置必须一致，否则节点重放和证明结果可能不匹配。

这也是为什么“在 sequencer 数据库里改一下余额”不是一个合格的恢复方案：它并没有回答其他节点为什么会得到相同状态、证明为什么会成立。

### 5.5 不能把恢复做成额外铸币

OP deposit 规范区分 `mint` 与 `value`：前者增加 L2 资产，后者指定本次交易发送的价值。[OP Stack Specification](https://specs.optimism.io/protocol/deposits.html)

对恢复方案而言，这提示了一个必须检查的不变量：

> **目标应该是转移既有资产控制权，而不是凭空增加对 L1 储备的索取权。**

如果操作错误地形成了额外铸币，即使受害者拿到资金，也可能把损失转嫁给桥或其他持有人。

因此，模拟测试不仅要看目标余额有没有下降，还要核对总供应、桥接负债、费用处理和接收方余额变化。

### 5.6 路径三：使用资产或应用已有权限

若涉事资产或应用已经有合法授权的 pause、freeze、账户限制或恢复机制，通常应先评估这些更窄的能力，而不是直接动用链的根权限。

但需要逐一确认：这项权限是否真实存在、由谁持有、覆盖什么操作，以及资产是否已经离开该合约的控制范围。

这是一条最小权限原则，不是对 Mantle 上任何具体资产已经拥有冻结接口的判断。

### 5.7 Mantle 主网动作前，至少需要形成这四份可验证结果

|验证产物|核心内容|
|---|---|
|**目标状态快照**|地址、资产、余额、nonce、账户代码、授权、应用头寸、未完成提款及跨链消息|
|**权限与执行路径**|哪个治理主体批准，修改哪个入口，最终派生什么交易，如何恢复原实现|
|**完整重放与证明结果**|使用实际部署版本模拟 L1 输入、L2 执行、节点重放及证明生成；覆盖资产竞争和失败分支|
|**隔离与释放方案**|接收账户控制人、使用范围、后续决策程序、误判纠正、证据披露及法律责任|

尤其应该避免一个没有边界的通用入口：

```
任意 sender + 任意目标 + 任意 calldata + 任意金额
```

更合理的恢复动作，应尽可能约束到特定事件、特定资产、特定目标、金额上限和一次性执行条件。

但还有一个必须诚实面对的边界：**如果根升级权仍能随时替换这些限制，那么“本次合约写得很窄”并不等于链已经在密码学上失去广泛干预能力。**

---

## 六、社区和 KOL 到底怎么看？是否属于 censorship？

### 6.1 技术上，不能只用“救回用户资产”回避问题

我的判断是：

**ArbOS 61 的限制性过滤，是一种明确的交易审查能力。Kelp 的操作则比单纯审查更强：它不只是拒绝执行，还未经原控制者同意改变了资产控制权。**

这里“未经原控制者同意”描述的是技术事实，不等于认可攻击者具有合法所有权。

因此，可以同时支持这次恢复，又认为它暴露了重要的中立性和治理风险。不存在“认为结果正确，就必须否认发生了干预”的逻辑要求。

### 6.2 可核实的观点样本

|发言者／来源|观点|
|---|---|
|**Zeptimus，Arbitrum 治理论坛**|支持恢复，认为 Council 是事先已知的机制，发挥了保护用户的作用。|
|**maxlomu，同一论坛**|肯定行动和后续治理，但要求公开触发标准、外部请求、保障措施及投票时限。|
|**Robby Greenfield／robtg4，同一论坛**|认可结果，质疑广泛升级权的边界：既然能增加一次身份覆盖能力，什么阻止再次增加？|

这些是对本次事件的直接讨论，不是我推测他们可能持有的立场。[Arbitrum](https://forum.arbitrum.foundation/t/security-council-emergency-action-21-04-2026/30803)

**Steven Goldfeder** 在事件后的采访中强调，行动使用的是已有权限，并不是这次才新增中心化控制；他也解释了为什么在资产可能转移的情况下，预先公开讨论存在风险。**Patrick McCorry** 则强调 Council 的选举和透明治理属性。两者都是相关系统的参与者，其观点应作为参与方解释阅读，而不是独立民意调查。[CoinDesk](https://www.coindesk.com/tech/2026/04/22/inside-the-usd71-million-freeze-on-arbitrum-that-has-the-crypto-world-questioning-what-decentralization-really-means)

**Griff Green** 在采访中强调了一个现实条件：攻击者资金停留提供了少见的恢复窗口，以及紧急情形下社会协调的重要性。这支持“能够救时应行动”的立场，但并不自动回答以后哪些事件也符合标准。[Coinage Media](https://www.coinage.media/2026/inside-arbitrums-decision-to-take-back-stolen-usd72m-from-north-korea)

### 6.3 “权力本来就存在”，是不是充分的辩护？

这是一项重要的技术说明，但不是完整的治理回答。

可以把风险拆成三层：

```
能力存在：
    管理员原则上可以这么做

能力被验证：
    已经开发出工具并成功执行

使用标准形成：
    什么情况下会决定这么做
```

一次成功干预未必新增第一层，却会改变市场对第二、第三层的认识。

因此，用户仍可能合理地重新评估：

> 我信任的究竟是一套不能这么做的规则，还是一组承诺只在特定情形下这么做的人？

### 6.4 支持率不能直接等同于“公众认可”

公开报道记录，相关资金释放的非约束性 Snapshot 投票获得了较高支持率。但**释放投票不是事前冻结授权，也不是对永久审查功能的公投**。[The Block](https://www.theblock.co/news/ecosystems/2026-05-08-arbitrum-dao-approves-eth-release-400527)

在本次可核实的样本中，常见的是“支持这次救援，同时要求约束未来权力”。这些论坛参与者和治理投票者本身也有选择偏差。

所以，更有依据的结论是：

> **存在相当明确的、有条件的支持；但没有足够代表性的数据证明公众普遍接受底层链拥有通用资产冻结权。**

---

## 七、其他 L1／L2 的类似机制与事件

以下先例必须按机制分类，不能都概括为“管理员能冻结”。

|链／案例|实际机制|与 Kelp 的关系|
|---|---|---|
|**Sui／Cetus，2025 年**|对已冻结资产，通过特定协议升级授权恢复交易|最值得参考其权限范围约束|
|**Linea／Velocore，2024 年**|暂停 sequencer，并对攻击相关地址实施审查|更接近入口控制，而非本次 Inbox 身份覆盖|
|**Ethereum／DAO，2016 年**|在硬分叉区块执行特殊状态变更|社会协调改变规则，不是常设多签恢复接口|
|**BNB Chain 桥事故，2022 年**|协调验证者暂停链，并提出后续冻结等治理议题|全链级应急，不能仅凭公告认定所有拟议冻结都已实施|
|**XRPL 发行资产冻结**|发行者按协议提供的规则限制所发行 Token|资产层权限，不是冻结原生 XRP 的通用链级权力|

各项依据分别来自 Sui 官方方案、Linea 事件记录、Ethereum 基金会公告、BNB Chain 官方事故说明和 XRPL 文档。[Sui](https://www.sui.io/blog/cetus-incident-response-onchain-community-vote)

### 7.1 Sui／Cetus：值得借鉴的是“只授权特定交易”

Sui 官方恢复方案没有把授权描述为“此后可以随意代表任何账户发交易”，而是将恢复权限约束到特定组合：

```
(hacker_address, aliased_address, TransactionDigest)
```

方案针对两笔特定恢复交易，资金进入一个 **4/6 multisig**，由 Cetus、Sui Foundation 和 OtterSec 的相关签名人共同参与控制。官方公布的投票结果为 **90.9% 的质押权重支持**，且 Foundation 的质押未计入投票。[Sui](https://www.sui.io/blog/cetus-incident-response-onchain-community-vote)

这提供了两个不同层面的启发：

**工程上，指定交易摘要比开放一个通用身份覆盖接口更容易审计。**

**治理上，这说明社区可以支持具体恢复方案，但质押权重投票仍不等于“一人一票”的公众意见，也不证明大家支持无限期的通用冻结能力。**

此外，如果未来协议仍可再次升级，特定交易授权只能约束这次实现，不能凭空消除所有未来治理风险。

### 7.2 Linea：争议直接指向 sequencer 权力

在 Velocore 事件中，Linea 暂停了 sequencer，并实施攻击相关地址的审查。事件后的公开讨论中，Alex Gluchowski 强调去中心化 sequencer 的重要性；Linea 的回应则承认去中心化是目标，同时将当时能力视为过渡期的安全措施。[The Block](https://www.theblock.co/news/ecosystems/2024-06-03-linea-decentralization-velocore-hack-298062)

这体现了两种可以理解、却并不兼容的优先级：

> 一方认为，危机中应优先阻止进一步损失。

> 另一方认为，危机正是检验系统是否真正抗审查的时刻。

这里讨论的是 **2024 年事件当时的能力和立场**，不能据此断言 Linea 目前仍保留完全相同的权限结构。

### 7.3 Ethereum DAO：一次硬分叉不等于日常管理员能力

Ethereum 的 DAO 硬分叉在指定区块执行特殊状态变化，将相关资产导向恢复安排。它不是把整段历史交易简单删除。[Ethereum Foundation Blog](https://blog.ethereum.org/2016/07/20/hard-fork-completed)

这个先例说明，社会协调可以在极端情况下改变链的规则。

但从威胁模型看：

```
需要客户端发布、验证者采纳及社会协调的规则变更
```

和：

```
少数签名人可通过现有管理接口即时执行的动作
```

不是同一种权限成本。不能用“Ethereum 当年也干预过”推导“任何管理员冻结功能都没有新增风险”。

### 7.4 XRPL：事前明确的资产权限更容易被定价

XRPL 的冻结能力针对发行资产，官方明确区分这类 Token 与原生 XRP。[XRP Ledger](https://xrpl.org/docs/concepts/tokens/fungible-tokens/freezes?utm_source=chatgpt.com)

它提示了一个与公众接受度有关的区别：

**用户事先知道自己持有的是可冻结的发行资产，与用户以为持有的是只能由私钥控制的原生资产，却在事件发生后发现链管理员可以划转，两者的预期差异很大。**

这不代表前者没有风险，而是其风险更容易在进入系统前被理解和定价。

---

## 八、对 Mantle 的建议：把“这次救援”与“永久功能”拆开决策

我不建议从这次事件直接跳到：

> Mantle 应该增加一个通用的、长期在线的用户资产冻结接口。

更合理的是分别回答两个问题。

### 8.1 这次事件是否值得使用已有紧急权限？

在我的评估框架下，支持干预的条件应包括：盗窃证据清晰；目标资产仍可确定定位；存在现实转移风险；干预不会制造更大的系统性损害；并且没有同样有效、权限更小的替代方式。

目标最好是**保全争议资产**，而不是在同一个紧急动作里完成最终定责和赔付。

```
快速阶段：
    阻止明确资产继续逃逸
    保留证据与纠错可能

审慎阶段：
    核定权属和债权
    决定分配
    处理异议与法律要求
```

Kelp 的后续法院流程表明，这个区分并不是形式主义。资金保住以后，“该交给谁”仍然可能存在复杂争议。[CourtListener Storage](https://storage.courtlistener.com/recap/gov.uscourts.nysd.653423/gov.uscourts.nysd.653423.52.0.pdf)

### 8.2 长期保留什么能力，需要独立治理

长期设计至少要解决四组问题：

**权限范围。**限定资产、目标、金额、调用摘要和次数；明确哪些案件不接受。恢复函数不能成为隐蔽的任意调用工具。

**决策与纠错。**定义证据标准、利益冲突回避、紧急阈值、误判处理和事后审查。技术系统无法自动识别“真正的黑客”，这一步必须承认有人在作判断。

**运营与技术安全。**证明完整性、强制收录覆盖、共享应用误伤、桥接资产一致性，以及新增管理者密钥本身被攻破的风险，都应纳入审计。

**对用户的承诺。**公开说明链保留哪些干预能力、由谁控制，以及去中心化路线是否计划缩小这些权限。不要一边保留广泛干预权，一边宣传任何资产都不可能被治理触及。

这里还有一个设计细节：可以给紧急授权设置到期复审，但不应机械地把“到期”设计成自动把资产退回攻击者。授权期限、保全期限和最终分配应分开处理。

---

## 最后的判断

**对 Kelp 案例，准确的技术描述是：通过 L1 Inbox 升级改变跨链消息的发送者认证，利用 unsigned transaction 强制划转特定 ETH，再恢复原入口。它不是一次普通的 sequencer 黑名单操作。**

**对 ArbOS 61，准确的描述是：可选的交易过滤架构，通过 sequencer 筛选和链上交易 hash 限制覆盖强制收录，但它并不是 Arbitrum One 为 Kelp 冻结所使用的机制。**

**对 Mantle，最值得优先验证的是当前 canonical L1→L2 输入能否支持一笔范围极窄、资产守恒、可完整重放和证明的恢复交易，而不是先建设永久的通用冻结功能。**

社区是否认可，不能简单回答“认可”或“不认可”。现有案例更支持这样的判断：

> **具体、证据充分、范围受限的资产救援，可以获得很高支持；但这不等于公众授权底层链长期拥有不受约束的审查或划转权。**

决定 Mantle 这次能否行动的下一项关键材料，是攻击地址、资产类型、相关交易和当前状态快照。没有这些，能够成立的是架构层面的可行性方向，还不能成立的是某个具体主网恢复方案。
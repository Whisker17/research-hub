---
imported_from: ChatGPT Deep Research
imported_at: 2026-10-20
original_file: gpt-pq-signature-selection.md
---

# 后量子签名的两条路线：从 XMSS＋leanVM、Falcon＋Aerie 到 EIP-8288

**研究时间：2026 年 10 月 19 日。**

这篇可以作为前两篇报告的第三部分：第一篇回答“哪些密码学组件需要迁移”，第二篇回答“Mantle 怎样先做账户级容灾”，这一篇进一步回答：**当 PQ 签名成为常规基础设施后，怎样兼顾安全假设、交易成本、节点负担和长期可升级性？** 前两篇已经分别建立了风险清单，以及“合约 AA＋PQ 验证预编译”的近期方案，本篇会在这个基础上补充，而不是重新讨论一次量子威胁。[GitHub](https://raw.githubusercontent.com/Whisker17/research-hub/main/reports/2026/10/post-quantum-mantle/explainer.md)

## 核心判断

**这场讨论并不是简单的“Ethereum 支持 hash，a16z 支持 lattice”。** 更准确地说，它同时包含了三场不同的讨论：选择什么签名、用什么证明系统聚合签名，以及基础协议应该直接支持多少密码学算法。Starknet 就是一个明确的混合例子：证明层使用哈希型 STARK，账户层则已经展示 Falcon-512 验签。[StarkWare](https://starkware.co/blog/starknets-quantum-edge-starks-and-native-account-abstraction/)

**Aerie 的重要性在于显著降低了 Falcon 批量验签的证明成本，而不是让 Falcon 获得了 BLS 式原生聚合。** 它证明“一批有效 Falcon 签名存在”，验证者检查证明，而不逐个接收和验证原始签名。[GitHub](https://github.com/a16z/aerie)

**EIP-8288 的核心是把昂贵的密码学验证声明为交易依赖，再通过区块级证明统一处理。** 这与“为每种签名添加一个便宜的预编译”属于不同的架构方向；但当前仍是 Draft，不能把设计愿景理解为已经落地的通用验证接口。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

对 Mantle，我的结论是：**近期预编译路线值得保留，长期应争取验证接口与算法解耦；不应因为 Aerie 的一次性能突破就立即改变整个安全选型，也不应因为 Ethereum 倾向哈希就停止研究 Falcon。**

---

## 1. 首先拆开三个容易混淆的层次

### 1.1 签名、聚合证明、交易接口，不是同一个选择

|层次|回答的问题|典型方案|
|---|---|---|
|**签名层**|谁授权了这条消息？|XMSS、SLH-DSA、Falcon、ML-DSA|
|**证明／聚合层**|怎样低成本证明大量签名都有效？|哈希型 STARK、基于格承诺的 Aerie|
|**交易与协议接口层**|账户怎样表达授权条件，协议怎样接纳验证结果？|合约 AA、预编译、EIP-8141、EIP-8288|

Ethereum 的 PQ 共识草案把哈希签名交给 leanVM 聚合；Aerie 把 Falcon 验证转化为格证明；EIP-8288 则在交易格式和区块有效性之间建立依赖关系。这三者分别触及上表的不同位置。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8292)

因此，下面两种组合完全可以同时成立：

> 账户使用 Falcon，但其验证过程由哈希型 STARK 证明。  
> 基础协议只验证一种哈希型证明，但应用选择不同的签名算法。

Starknet 的 Falcon 账户已经体现了第一种组合。第二种则是通用证明验证接口能够支持的架构方向，**不是当前 EIP-8288 已经完整实现的能力**。[StarkWare](https://starkware.co/blog/starknets-quantum-edge-starks-and-native-account-abstraction/)

这里还要纠正一个术语误区：**SNARK 不等于椭圆曲线证明。** SNARK 描述的是证明具有简洁性、非交互性等性质；Aerie 是格方向的 SNARK，哈希型证明也可以具有这些性质。讨论 PQ 时，应该追问承诺方案、安全假设及递归构造，而不是仅凭“SNARK/STARK”名称判断。[LayerZero](https://assets.layerzero.network/pdf/aerie.pdf)

### 1.2 为什么签名聚合突然成为 PQ 的核心问题？

现有 Ethereum 共识中的 BLS 签名，可以利用曲线上的代数运算，把许多签名合并为一个短对象。拟采用的 XMSS 类签名没有这种便宜的原生聚合能力，所以路线变成：

\[ \text{许多签名} \quad\longrightarrow\quad \text{一个证明：这些签名全部验证通过} \]

这不是换一种签名字节格式，而是把原本较轻的聚合工作，变成了需要专门证明计算的工作。EIP-8292 正是因此引入独立的、可自愿参与的高配置聚合者角色。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8292)

关键区别是：

**签名聚合并没有消灭计算，而是改变了计算发生的位置、计算结果的传播方式，以及多少节点需要重复计算。**

---

## 2. 两类签名的原理：它们到底在相信什么？

## 2.1 Hash-based：从“公开一个秘密的哈希”构造签名

先用一个教学例子理解哈希签名。

假设 Alice 想签一个比特。她生成两个秘密值 \(x_0,x_1\)，公开：

\[ H(x_0),\ H(x_1) \]

签 `0` 时公开 \(x_0\)，签 `1` 时公开 \(x_1\)。验证者计算一次哈希，就能检查她是否掌握对应秘密。

这个玩具方案的限制也很明显：如果 Alice 用同一组秘密分别签过 `0` 和 `1`，两个秘密就都公开了。这说明了哈希签名的一个基本思想：**通过有选择地公开秘密来证明授权，但必须控制同一份秘密的使用次数。**

真正的 XMSS 使用更高效的 WOTS+ 一次性签名，以及 Merkle 树来认证大量一次性公钥，而不是直接使用上面的玩具方案。[RFC Editor](https://www.rfc-editor.org/rfc/rfc8391.html)

### XMSS：一棵树管理很多把一次性签名钥匙

可以把 XMSS 理解为：

> 先准备很多把一次性签名钥匙，再把它们的公钥放进一棵 Merkle 树；整棵树的根，成为长期公钥的一部分。

一次签名不仅包含一次性签名结果，还包含所使用叶子的索引，以及证明该叶子属于这棵树的认证路径。验证者先检查一次性签名，再沿认证路径计算回根。[RFC Editor](https://www.rfc-editor.org/rfc/rfc8391.html)

代价在于它是 **stateful，有状态签名**：

**签名设备必须可靠记录哪些一次性钥匙已经用过，不能因备份恢复、并发签名或故障回滚而重复使用。** NIST 对有状态哈希签名的使用特别强调这种状态管理要求。[NIST Computer Security Resource Center](https://csrc.nist.gov/Projects/Stateful-Hash-Based-Signatures)

对区块链工程而言，这意味着交易 nonce 不能自动解决全部问题。nonce 防止的是协议层重放；一次性签名状态防止的是密钥材料被不安全地重复使用。即便一笔交易没有上链，签名材料也可能已经暴露。

### SLH-DSA／SPHINCS：用更多计算和更大签名，换掉持久化索引

SLH-DSA 是基于 SPHINCS+ 标准化的无状态哈希签名。它通过多层树和签名构造管理一次性／少次签名组件，不要求钱包维护 XMSS 那样的持续递增索引。它并不是“同一把一次性钥匙可以随便重用”，而是由整体构造和参数控制安全风险。[NIST Computer Security Resource Center](https://csrc.nist.gov/pubs/fips/205/final)

由此得到一个非常重要的选型区别：

|哈希签名方向|得到什么|付出什么|
|---|---|---|
|**XMSS 类，有状态**|可以针对受控签名流程优化大小和验证成本|必须严肃处理状态、备份、并发与密钥生命周期|
|**SPHINCS／SLH-DSA 类，无状态**|钱包与多设备运维更容易组织|通常需要更大的签名和更多哈希工作|

这也是为什么不能把“hash-based”当成一个统一性能标签。标准 SLH-DSA、为 Ethereum 优化的 leanSPHINCS，以及共识使用的 leanXMSS，并不是同一个参数集，更不能自动共享“已经通过 NIST 标准化”的结论。[NIST Computer Security Resource Center](https://csrc.nist.gov/pubs/fips/205/final)

## 2.2 Lattice-based：找到一个满足方程、同时足够短的向量

“格”可以先想象成高维空间里规则排列的点。密码学利用的是：在特定高维格中，寻找满足条件的短向量，或者寻找接近目标的格点，在已知算法下很困难。

Falcon 的私钥提供一种特殊的“捷径”，使签名者能够高效产生符合条件的短向量；公钥则让其他人检查结果。Falcon 基于 NTRU 格和带陷门的采样方法，而不是椭圆曲线离散对数。[Falcon](https://falcon-sign.info/)

省略编码细节后，Falcon 验证的核心可以写成：

\[ s_1+h\cdot s_2=c \pmod q \]

同时要求：

\[ \|(s_1,s_2)\|^2\leq B \]

其中，\(h\) 是公钥，\(c\) 是从消息、盐等公开输入得到的目标，\(s_1,s_2\) 是签名对应的短向量／多项式。只满足方程不够，还必须满足长度约束和合法编码。Aerie 明确把这些条件纳入证明对象。[GitHub](https://github.com/a16z/aerie/blob/main/specs/falcon.md)

可以这样理解：

> 公钥给出一道公开题目；私钥让 Alice 能找到一个“既正确又足够短”的答案。验证者不需要知道她如何找到答案，只需要检查答案。

### 为什么 Falcon 的签名可以比较小？

Falcon 利用了结构化格、紧凑编码和高效采样。其公开参数中的 Falcon-512 公钥为 897 字节，填充签名为 666 字节；Falcon-1024 对应为 1,793 和 1,280 字节。这里说的是具体 Falcon 格式，不能直接当成最终 FN-DSA 标准的兼容性承诺。[Falcon](https://falcon-sign.info/)

但小签名不意味着整体实现简单。Falcon 的难点主要在**签名端**：采样正确性、数值实现、侧信道防护，以及受限设备上的工程实现。**验签端的确定性整数计算**与**签名端的复杂采样**，必须分开评估。[a16z crypto](https://a16zcrypto.com/posts/article/fast-post-quantum-signature-aggregation-with-lattice-snarks)

### 格方向也不等于 Falcon

ML-DSA 同样属于格签名，但构造和工程取舍不同，且已经成为 FIPS 204。Falcon 衍生的 FN-DSA 则仍处于标准制定过程；NIST 在 2026 年 9 月提出的新计划包括在密钥生成与签名中使用定点运算。因而，“Falcon 永远依赖浮点”已经不是准确的前瞻判断，但“其标准和全部工程风险已经解决”同样不成立。[NIST Computer Security Resource Center](https://csrc.nist.gov/pubs/fips/204/final)

---

## 3. Ethereum 的 XMSS＋leanVM：把验签变成可证明的计算

## 3.1 XMSS 负责授权，leanVM 负责证明授权检查正确

这两个组件的职责可以用一句话区分：

> **XMSS 生成签名；leanVM 证明一段检查 XMSS 签名的程序确实运行成功。**

leanVM 不替验证者保存签名私钥，也不需要参与签名。它处理的是已经产生的签名、公钥、消息，以及必要的证明输入。Ethereum 的 PQ 共识草案明确采用这种“证明签名验证”的聚合模式。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8292)

下面用一个教学示例说明完整流程。批次数量只是示意，不代表协议参数。

**第一步：验证者签署投票。**

假设有 1,024 名验证者对消息 \(m\) 投票，每人用自己的 XMSS 密钥生成签名，然后把投票发到相应网络。

**第二步：聚合者执行批量验签程序。**

聚合者收集其中一批签名，并证明类似以下程序执行成功：

```
for each validator i in this batch:
    assert XMSS.verify(public_key[i], message[i], signature[i])
```

真实系统还必须绑定验证者集合、消息、域分离和签名者身份；不能只证明“有一些任意公钥的签名有效”。

**第三步：产生一份叶子证明。**

这份证明替代了这批原始签名的重复传播与重复验签。其他节点检查证明，就能获得对应的密码学保证。

**第四步：递归合并。**

另一段程序检查多份叶子证明，生成新的证明。这样，聚合者无需重新取得并处理所有原始签名，也能合并其他聚合者的工作。

**第五步：提议者合并区块所需的聚合结果。**

EIP-8292 区分了叶子签名聚合、递归证明聚合，以及由区块提议者完成的区块级聚合。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8292)

这里有两个边界不能丢：

**证明只替代特定验证计算，不替代共识规则。** 哪些验证者具有投票权、权重是多少、是否重复计票、投票针对哪个分叉，仍然必须由证明公开声明与共识处理共同绑定。

**证明短，不代表整套共识数据变成常数大小。** 消息、参与者标识、集合绑定和其他元数据，仍然需要处理。

## 3.2 为什么适合共识，不一定适合普通钱包？

我的工程判断是，验证者环境比普通钱包更适合管理有状态签名：它有明确的职责、时间结构、持续运行的软件，以及可以专门设计的密钥轮换与故障处理机制。

但这不意味着“用 slot 作为索引就完成了安全设计”。不同签名职责的域分离、双签保护、故障恢复、并发实例和旧备份，都必须避免导致一次性密钥的不安全重用。NIST 对有状态签名的警告不会因为应用场景变成共识而消失。[NIST Computer Security Resource Center](https://csrc.nist.gov/Projects/Stateful-Hash-Based-Signatures)

相反，普通用户钱包往往需要助记词恢复、多设备使用、离线签名和无序交易。因此，无状态签名对账户层有不同的吸引力。这也解释了 Ethereum 相关研究中，**共识讨论 leanXMSS，执行层依赖聚合讨论 leanSPHINCS**，而不是全链统一使用一个 XMSS 参数集。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8292)

## 3.3 leanVM 的当前形态，与旧介绍已经不同

截至本次查阅，leanVM 官方仓库描述的是一个**基于二进制域的最小哈希型 zkVM**。BLAKE2s 目前是占位选择，SHA-2、SHA-3、BLAKE3 仍在考虑；从 leanISA 迁往 RISC-V `rv64im` 也在计划中。早期的 KoalaBear＋Poseidon 设计被明确归入历史分支。[GitHub](https://github.com/leanEthereum/leanVM)

为什么这个变化重要？

过去，人们常为了降低证明成本，选择 Poseidon 这类专门面向证明系统的哈希。新的二进制电路证明方向尝试让传统哈希更容易被证明，从而减少“为了性能而引入较新的专用哈希”的必要性。Ethereum 的相关研究也明确强调了传统哈希的分析历史、标准化和实现覆盖面。[Ethereum Research](https://ethresear.ch/t/post-poseidon-hash-function-variants-for-ethereum/26071)

还要注意两个成熟度边界：

**当前仓库并不宣称已经适合生产。** 形式化验证仍在进行，零知识支持也仍列为计划项。名字中有“zkVM”，不意味着当前聚合功能已经提供隐私零知识保证。[GitHub](https://github.com/leanEthereum/leanVM)

**“128-bit”必须带上模型。** 仓库写的是 128-bit ROM、64-bit QROM soundness。ROM 是经典随机预言机模型，QROM 允许量子方式查询随机预言机；不能把这两个数字与签名的 NIST 安全类别直接互换。[GitHub](https://github.com/leanEthereum/leanVM)

---

## 4. Aerie 的突破：不去证明那些可以由验证者便宜重算的哈希

## 4.1 核心优化不是“格的数学更简单”

XMSS 验证会涉及大量哈希链和 Merkle 路径计算。聚合器不只是计算这些哈希，还要证明它们每一步都计算正确。

Falcon 的验证结构不同：其主要约束是代数方程、范数和编码检查。Aerie 保留每个签名的公开盐，让验证者自己计算公开的 HashToPoint，证明系统集中处理剩下的约束。当前实现还使用包含公钥的消息 framing，不能把它简化成对所有 Falcon 版本都成立的 `H(盐 || 消息)` 接口。[GitHub](https://github.com/a16z/aerie)

可以把两条路径理解为：

|XMSS＋leanVM|Falcon＋Aerie|
|---|---|
|把大量哈希验证过程放入证明计算|尽量把公开哈希留给验证者直接计算|
|用哈希型证明证明验签程序|用格承诺和针对性协议证明代数、范数与编码条件|
|可以递归合并已有证明|当前主要直接处理一整批原始签名|

这不是“免费少做了检查”，而是选择了不同的证明边界。Aerie 的验证者仍然需要公钥、消息和盐，其工作仍有随批次规模增长的部分。[LayerZero](https://assets.layerzero.network/pdf/aerie.pdf)

### Akita 在里面做什么？

Akita 是 Aerie 使用的**格型多项式承诺方案**，基于 Module-SIS 假设。可以把承诺理解为“先把大批计算数据锁定，之后不能为迎合检查而偷偷修改”。

Aerie 再使用 sum-check 等协议，把大量代数关系转化为较少的可验证检查。这里最重要的不是记住协议名称，而是理解：**Falcon 的验证关系与这套证明工具匹配得很好。**[Cryptology ePrint Archive](https://eprint.iacr.org/2026/1983)

也因此，Aerie 的成绩不能直接推广成“所有格签名都可以同样快”。换成 ML-DSA，验证结构和哈希依赖都需要重新分析。

## 4.2 “0.65 秒聚合 32K”意味着什么？

Aerie 论文报告，在 Apple M4 Max、16 个工作线程、不使用 GPU 的条件下：

|指标|Falcon-512，32,768 个签名|
|---|---|
|证明时间|约 0.65 秒|
|单线程验证|约 53.6 毫秒|
|多线程验证|约 11.6 毫秒|
|峰值内存|2,113 MiB|
|默认独立盐模式的完整聚合|**1,346.4 KiB**|
|共同盐模式的估算大小|**66.4 KiB**|

这些是作者报告的基准，本次没有独立复现。计时不包括签名生成；所列聚合大小也不包括由验证者提供的公钥和消息。[LayerZero](https://assets.layerzero.network/pdf/aerie.pdf)

这确实是重要进展：证明任务已经可以在单台高性能笔记本上处理相当大的批次，而不必先组织一棵多层递归证明树。

但其中最容易被转述错的数字，是 **66 KiB**。

### 默认模式不是把 32K 个签名全部压成 66 KiB

默认模式仍携带每个签名的 40 字节盐，因此完整大小近似：

\[ S_{\text{aggregate}} \approx S_{\text{proof core}} + 40N \]

在上述批次中，摊销约为 42.1 字节／签名，其中绝大部分已经是盐。换句话说：

**它实现了显著压缩，但默认并不是 BLS 那样的常数大小原生聚合。**[LayerZero](https://assets.layerzero.network/pdf/aerie.pdf)

### 共同盐不是可以随手打开的无风险开关

共同盐模式要求不同的签名策略，包括对重复输入使用缓存或确定性响应。仓库明确说明：该固定目标签名者的不可伪造性是额外假设，**目前没有已知的标准格假设归约，也没有已知攻击**；仓库本身没有提供共同盐签名器。[GitHub](https://github.com/a16z/aerie)

因此，不能直接做如下推导：

> Algorand 用确定性 Falcon → Aerie 可以直接聚合 → 生产环境立即只需 66 KiB。

签名变体、消息 framing、盐策略、安全归约和实现兼容性，都必须逐项确认。

## 4.3 “比 leanVM 快 29 倍”应该怎样读？

论文在同一台机器上测试了一个固定版本的 leanVM，得到约 29 倍的**叶子签名证明吞吐量**差距。但这不等于网络端到端延迟必然降低 29 倍。leanVM 可以把工作分布到多台机器，并递归合并；Aerie 当前不能像这样合并别人已经产生的聚合证明。[LayerZero](https://assets.layerzero.network/pdf/aerie.pdf)

同时，论文也报告 leanVM 的递归证明验证更快：相应配置约为 6 毫秒，而 Aerie 的上述单核验证约为 54 毫秒。**证明端更快，不等于验证端也更快。**[LayerZero](https://assets.layerzero.network/pdf/aerie.pdf)

此外，当前 leanVM README 的另一个配置给出约 1,362 个 XMSS 签名／秒，而论文比较使用的是其固定提交及配置。两组数值不应混在一起计算一个新的“当前领先倍数”。[GitHub](https://github.com/leanEthereum/leanVM)

更有意义的系统指标应当是：

\[ T_{\text{完成}} = T_{\text{收集}} + T_{\text{证明}} + T_{\text{传播}} + T_{\text{验证}} \]

再加上总机器资源、重复工作，以及聚合者故障后的恢复成本。

---

## 5. 双方的优劣势与生态立场

## 5.1 安全上的争论：不是“一个安全、一个不安全”

Hash-based 的吸引力是把核心密码学依赖尽量收敛到长期研究的哈希函数。Eli Ben-Sasson 在其 STARK 解释文章中强调的正是这一点：承诺使用哈希，而不是依赖椭圆曲线等结构性困难问题。[StarkWare](https://starkware.co/blog/how-starks-work-part-6/)

但这个论点不能扩大为：

> 只要写着 hash-based，具体证明系统、递归方式和实现就都已经安全。

实际系统还涉及 Fiat–Shamir 转换、参数、递归组合、程序身份绑定、编码和实现正确性。a16z 对递归哈希证明提出的质疑，重点就是完整组合的安全论证不能简单地从单层证明继承；**这是需要认真审视的证明模型问题，不是已经发现 leanVM 可被伪造的证据。**[LayerZero](https://assets.layerzero.network/pdf/aerie.pdf)

同样，Aerie 的论文提供的是**经典 ROM 中的知识可靠性论证**，不能因此直接宣称它已经完成了整个组合的 QROM 安全证明。Falcon 的安全性、Akita 的 Module-SIS 假设，以及聚合协议本身，都要分别审查。[LayerZero](https://assets.layerzero.network/pdf/aerie.pdf)

我的判断是：

**保守的底层原语有价值，但“原语保守”不等于“组合已成熟”；高性能的新构造有价值，但“基准优秀”不等于“安全审查完成”。**

## 5.2 一个实用对比

下表是基于前述构造的工程归纳，而不是给整个家族打固定分数。

|维度|Hash-based 路线|Lattice-based 路线|
|---|---|---|
|安全依赖|可以围绕传统哈希组织，底层依赖较集中|依赖具体格问题、结构和参数；证明系统可能再引入格承诺|
|签名端运维|XMSS 状态管理严格；无状态方案通常更重|无需维护 XMSS 式一次性索引；Falcon 采样与侧信道复杂|
|原始签名大小|随方案变化很大，标准无状态方案通常较大|Falcon 较紧凑；不能据此概括全部格签名|
|证明成本|哈希计算很多，证明开销是重要瓶颈|Falcon 的代数关系适合 Aerie 式专用优化|
|聚合结构|leanVM 支持递归合并不同参与者的工作|Aerie 当前擅长直接对大批原始签名生成证明|
|最终验证与带宽|递归证明可较小且验证快，但元数据仍存在|默认 Aerie 保留线性盐开销，验证也包含公开输入处理|
|标准与成熟度|SLH-DSA 已标准化；lean 系列不等于标准参数|ML-DSA 已标准化；FN-DSA 仍在制定，Aerie 是研究发布|

相关标准状态与项目成熟度，应分别以 NIST、leanVM 和 Aerie 的公开说明为准。两套聚合实现目前都没有把自己标为已完成生产就绪。[NIST Computer Security Resource Center](https://csrc.nist.gov/pubs/fips/205/final)

## 5.3 Ethereum：更关注基础协议的依赖收敛

Vitalik 在 EIP-8288 的官方讨论中明确解释：希望尽量减少依赖，倾向让基础层保持纯哈希，并减少需要维护的基础设施。这个理由不只是“觉得格不安全”，更是**不希望协议永久背负越来越多专用密码学实现**。[Ethereum Magicians](https://ethereum-magicians.org/t/eip-8288-frame-type-for-pq-sig-and-stark-aggregation/28723)

我的解读是，Ethereum 希望尽量把可变化的密码学留在可编程层，把较稳定的验证边界留在协议层。

但这不代表 Ethereum 研究社区拒绝格路线。Ethereum Research 已有 Falcon＋LaBRADOR 等格签名聚合研究。**协议当前偏好，与研究范围，是两件事。**[Ethereum Research](https://ethresear.ch/t/lattice-based-signature-aggregation/22282)

## 5.4 Starknet：证明层保守，账户层保持算法自由

把 Starknet 归类成“反 Falcon 阵营”并不符合已经公开的工程实践。

它的证明层使用哈希型 STARK；原生 AA 则允许账户实现不同验签逻辑，官方已经介绍 Falcon-512 账户实现。其策略更接近：

> **状态有效性使用哈希型证明；账户所有者可以选择格签名。**[StarkWare](https://starkware.co/blog/starknets-quantum-edge-starks-and-native-account-abstraction/)

这两种选择并不矛盾。即便一个账户的 Falcon 签名未来出现问题，影响范围也不同于全链证明系统被攻破。

同时，Starknet 自己的迁移路线仍列有 Ethereum 相关依赖等未完成项，因此不能把“已有 PQ 账户”扩写成“全栈已经 PQ”。[StarkWare](https://starkware.co/blog/the-architecture-advantage-starknets-quantum-readiness-roadmap/)

## 5.5 a16z 与 LayerZero：优先解决证明生产的现实成本

a16z 与 LayerZero 的 Aerie 工作强调单机证明吞吐量、较低内存需求，以及避免递归聚合所需的多阶段协调。这是很强的系统论点：

**如果生产证明的门槛显著降低，就可能增加能够承担聚合工作的参与者，并改善故障恢复。**[LayerZero](https://layerzero.network/blog/introducing-aerie)

但是否最终更去中心化，仍取决于节点如何收到原始签名、网络是否需要全量汇聚、谁承担验证与传播，以及低配置节点能否跟上。单机基准是重要输入，不是完整网络结论。

此外，“LayerZero Labs 参与了这项研究”与“LayerZero 的全部跨链验证路径已经迁移到 Aerie”不是同一件事，公开研究发布不应被解释为后者。[LayerZero](https://layerzero.network/blog/introducing-aerie)

## 5.6 Algorand：签名紧凑、验证效率与迁移能力

Algorand 对 Falcon 的理由更直接：签名相对紧凑，验证效率适合区块链，并且能够在账户与协议现有结构上逐步迁移。[Algorand](https://algorand.co/learn/what-is-falcon-a-nist-endorsed-digital-signature-algorithm-for-quantum-security)

当前开发者文档描述的 PQ 账户使用 **Falcon-1024 的确定性变体**，与正在标准化的 FN-DSA 不完全相同；其签名封装也预留算法标识和按方案启用的能力。文档同时限定了适用的协议升级版本及网络激活条件。[Algorand Developer Portal](https://dev.algorand.co/concepts/accounts/post-quantum/)

对 Mantle 而言，比“Algorand 选了 Falcon”更值得借鉴的是：

**算法标识、账户迁移、密钥派生域分离和版本管理，要先成为系统能力，不能只添加一个验签函数。**

---

## 6. EIP-8288：它怎样改变 Ethereum 的 PQ 接入方式？

## 6.1 与 EIP-8141、EIP-8292 的关系

|提案|主要位置|核心职责|
|---|---|---|
|**EIP-8141**|交易与账户执行|用多个 frame 表达验证、付费和执行|
|**EIP-8288**|交易依赖、mempool 与区块有效性|把签名／证明验证声明为依赖，并通过聚合证明满足|
|**EIP-8292**|共识层|定义 PQ attestation 聚合者及工作流程|

EIP-8288 建立在 EIP-8141 上；EIP-8292 则明确不修改执行层。三者可以共享部分证明工具，但不应当作同一个 AA 提案。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8141)

### 8141 抽象“交易怎么分步骤”；8288 抽象“昂贵验证怎么交付”

传统预编译路径大致是：

> 账户拿到原始签名 → 调用专用预编译 → 得到验签结果 → 决定是否授权。

8288 的路径则是：

> 交易声明需要成立的密码学条件 → 网络聚合对应见证 → 区块提供统一证明 → 账户检查这个已被协议保证的条件是否满足自己的授权策略。

注意，账户授权逻辑仍然存在。**8288 不是把“任何有效签名”都自动变成“可以花这个账户的钱”。**

## 6.2 Dependency frame 到底是什么？

当前草案新增 `mode = 4` 的 dependency verification frame。它携带由三个 32 字节字段构成的声明：

```
(scheme, data_hash, verification_key_hash)
```

每个声明合计 96 字节。这个 frame **不执行 EVM 验签代码**，而是要求区块级递归证明覆盖相应条件；账户通过 frame introspection 读取声明。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

语义上可以读成：

> 对于指定的验证方案和验证身份，存在能够验证通过的签名或证明，其消息／公开输入与这里的哈希一致。

这里的字段名也有一个细节：对当前 leanSPHINCS 类型，`verification_key_hash` 实际放的是已经只有 32 字节的公钥，而不是再哈希一次。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

## 6.3 用 Alice 的一笔转账理解完整生命周期

下面是**依据提案机制组织的教学示例，不是可直接广播的完整交易编码**。

假设 Alice 已经拥有一个支持该授权策略的 AA 账户，准备转账给 Bob。

### 阶段一：钱包构造 frames

```
Frame 0：声明 leanSPHINCS 签名依赖
         消息 = 本交易的签名哈希
         公钥 = Alice 账户认可的 PQ 公钥

Frame 1：执行 Alice 账户的验证逻辑
         检查依赖的算法、公钥和消息绑定
         检查账户策略、nonce 等要求
         通过后给予所需授权

Frame 2：执行转账
```

这里有一个设计问题：如果 Frame 0 直接写入“本交易的签名哈希”，而签名哈希又包含 Frame 0，就形成自引用。

当前草案用 `data_hash = 0^32` 作为哨兵值：规范在提取依赖时，把它解释成 EIP-8141 的 `compute_sig_hash(tx)`；frame 原始字节仍然保持为零。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

### 阶段二：Alice 签名并提交附带见证的网络封装

Alice 对交易签名，把交易及所需签名见证交给网络。mempool 节点可以验证原始见证，也可以接收已经聚合的证明。

随着交易传播，节点可以把多份验证工作合并为一份递归证明，而不是永远转发所有原始签名。这个“交易声明依赖、mempool 和 builder 替换见证”的方向，正是 Vitalik 在提案讨论中给出的动机。[Ethereum Magicians](https://ethereum-magicians.org/t/eip-8288-frame-type-for-pq-sig-and-stark-aggregation/28723)

### 阶段三：Builder 选择交易并生成对应聚合

Builder 必须为**实际入块交易的依赖集合**生成证明。

这不是简单地验证“一份证明是真的”就够了。证明的声明必须与实际交易集合一致。例如，一份正确证明覆盖的是 Charlie 的签名，就不能拿来满足 Alice 转账的依赖。

可以把必须满足的关系理解为：

\[ D_{\text{proof}}=D_{\text{included transactions}} \]

再验证该集合的承诺和证明。规范允许递归合并以及删除不再需要的依赖，但最后必须重新绑定到正确的区块依赖集合。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

### 阶段四：其他节点验证区块

节点检查区块级证明与实际依赖集合，然后执行正常账户和交易规则。

Alice 的账户无需重复进行那一份昂贵的原始密码学验签，但仍必须确认：

**证明覆盖的公钥是 Alice 的授权公钥，证明覆盖的消息是这一笔交易，而不是攻击者拿自己公钥签出的任意消息。**

这个例子也说明，8288 省掉的是重复密码学工作，不是账户权限判断。

## 6.4 为什么是声明式 frame，而不是一个新 opcode？

一个普通 opcode 的调用可能取决于之前执行到哪里、读到了什么状态。

声明式依赖则在执行前就可见。由此，mempool 可以提前组织密码学验证，Builder 可以知道区块需要哪些证明，而不必先完整运行所有合约才发现需要验证什么。这是提案选择新 frame 模式的重要理由。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

我的理解是，8288 正在把两种工作分开：

**“证明某个密码学条件成立”与“判断这个条件是否足以授权当前业务操作”。**

前者适合批量、递归、跨交易共享工作；后者仍由账户和合约处理。

## 6.5 “非 precompile 的最终形态”不等于什么？

它**不等于协议不再有密码学实现**。区块仍然需要一个协议认可的证明验证器，以及对应的规范和验证身份。

它**不等于验证工作只由 Builder 承担**。证明生成可以在 EVM 外进行，但其他节点仍须按区块有效性规则检查最终证明。

它也**不等于完全免费**。当前草案除每个 leanSPHINCS 依赖 3,000 gas 的相关收费外，还规定每个声明元组贡献 30,000 intrinsic gas；因此不能把它宣传成“每笔 PQ 交易总共只需 3,000 gas”。这些仍是草案中的计价参数。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

更准确的描述是：

> **基础协议尽量固定少量证明验证机制，而不是持续为每一种账户签名新增一套专用共识实现。**

这与 Vitalik 关于减少依赖和维护负担的解释一致。[Ethereum Magicians](https://ethereum-magicians.org/t/eip-8288-frame-type-for-pq-sig-and-stark-aggregation/28723)

## 6.6 当前草案还没有完成通用性

这里必须区分设计空间与当前规范：

**当前 dependency frame 只接受 leanSPHINCS 类型 `0x10`；leanSTARK 类型 `0x11` 虽然预留，但在相应依赖哈希定义完成前仍属无效。** `AGGREGATED_VK` 和 `DEPS_HASH` 也仍有待确定。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

所以：

- “未来可以通过通用证明支持不同验签程序”，是架构方向。
- “当前 8288 已经直接支持 Falcon 或 Aerie”，不成立。
- “未来把 Aerie 再放进 STARK 就一定划算”，也需要重新测量。

尤其是最后一种组合：**外层哈希证明不会消除内层格假设。** 如果外层只是证明“Aerie 验证器接受了”，那么 Aerie 本身的可靠性仍然是必要条件。另一种设计是直接在哈希证明里验证 Falcon；这可以不依赖 Aerie，但仍然依赖 Falcon 的不可伪造性。

---

## 7. 对 Mantle：怎样更新前两篇报告的建议？

## 7.1 不推翻近期容灾方案，但修正“只有预编译这一条路”

前一篇提出“合约 AA＋PQ 预编译”的价值，是在 native AA 尚未确定时，先给用户提供可部署、可测试的账户级保护路径。这一点没有因为 EIP-8288 而失效。[GitHub](https://raw.githubusercontent.com/Whisker17/research-hub/main/reports/2026/10/pq-in-mantle/explainer.md)

需要更新的是长期叙事：

> **预编译是近期降低确定性验签成本的工具，不应被描述为 PQ 账户的唯一最终形态。**

同时也不应制造另一种假二选一：合约 AA 可以设计批量验证或聚合器，预编译也可以提供批量接口；只是这些能力不自动等于 8288 的协议级依赖传播、区块聚合和有效性规则。

我建议把 Mantle 的路线拆成三层：

|层次|建议目标|
|---|---|
|**近期账户保护**|保留可部署的 PQ 账户与验证后端，完成恢复和权限闭环|
|**中期密码学敏捷性**|算法、参数、编码与验证后端版本化，不让账户绑定单一预编译地址|
|**长期协议能力**|研究可聚合验证依赖，并跟踪 8141／8288 的稳定接口与安全论证|

这些是针对 Mantle 的工程建议，不是对 Ethereum 上线时间的预测。

## 7.2 保留 ML-DSA 基线，把 Falcon＋Aerie 作为独立实验线

前一篇优先考虑 ML-DSA-65，有标准和实现路线方面的理由。Aerie 的 Falcon 基准并没有直接推翻这些理由，因为它解决的是另一个更专门的问题：**大量 Falcon 签名的证明聚合**。[GitHub](https://raw.githubusercontent.com/Whisker17/research-hub/main/reports/2026/10/pq-in-mantle/explainer.md)

建议分开回答三个问题：

**直接验签线：** ML-DSA 与 Falcon 在 Mantle 客户端、钱包和证明执行环境中的真实成本如何？

**聚合线：** 同样的交易负载下，Aerie 与哈希型聚合的等待时间、证明时间、完整带宽和故障恢复成本如何？

**协议线：** 这些验证结果通过什么接口进入账户授权和区块有效性，未来能否更换后端而不迁移全部账户？

不能拿“Falcon 的原生 CPU 验证快”替代“Falcon 在 Mantle 的证明路径中便宜”，也不能拿“聚合证明小”替代“整个交易包和 DA 开销小”。

## 7.3 Mantle 真正需要的基准，不是再跑一次宣传数字

我的建议是，以产品负载来定义测试，而不是只追求最大批次吞吐量。

|测试项|为什么对 Mantle 重要|
|---|---|
|小批次、常态批次和突发大批次|Launchpad 高峰与日常支付的摊销条件不同|
|等待凑批后的 p95／p99 延迟|Perps 和 agent 交易未必能接受长时间等待|
|公钥、盐、签名、证明和交易数据的完整字节数|只看 proof core 会低估 DA 与传播成本|
|执行客户端与证明路径的成本|原生验签便宜，不保证 rollup 证明便宜|
|无效输入、异常编码和资源上限|防止 DoS 与跨实现分歧|
|聚合者掉线、迟到及重组后的恢复|吞吐量不能代替活性保障|

尤其需要把**签名产生、首次传播、聚合、最终验证**分开计时。Aerie 当前基准本身也明确区分了签名生成与聚合计时，因此链层评估不能把前者漏掉。[LayerZero](https://assets.layerzero.network/pdf/aerie.pdf)

## 7.4 双分叉节奏下，如何避免近期工作成为升级负担？

沿用前一篇的双分叉背景，我建议把“兼容”和“启用功能”继续分开，但扩大验证范围。[GitHub](https://raw.githubusercontent.com/Whisker17/research-hub/main/reports/2026/10/pq-in-mantle/explainer.md)

**兼容性阶段**应检查既有 PQ 验证语义是否在客户端升级、证明系统升级和上游 fork 规则变化后保持一致，包括异常输入、gas 和历史重放，而不是仅确认链能出块。

**功能阶段**再启用新的算法／后端版本。旧版本的共识语义不应被悄悄改写；改变编码、参数或接受条件，应使用明确的新版本或 fork 边界。

EIP-8288 类方案则不能当成“新增一个地址”来移植。它涉及交易解析、mempool 封装、聚合工作流、区块字段、费用与证明绑定规则，需要单独的协议集成项目。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

## 7.5 容灾成败仍然取决于权限链，而不只是签名算法

即便账户支持了 PQ 签名，只要还保留一条可绕过它的 ECDSA 根权限，就不能称为闭环保护。前两篇对于管理权限、恢复路径和最终证明包装的提醒仍然成立。[GitHub](https://raw.githubusercontent.com/Whisker17/research-hub/main/reports/2026/10/post-quantum-mantle/explainer.md)

我建议按一个简单问题逐层检查：

> **攻击者能否不提供有效 PQ 授权，却通过恢复、升级、替换验证器或伪造外层证明，让资金移动？**

混合验证也必须明确语义。`classical AND PQ` 要求两者都通过；`classical OR PQ` 则保留了较弱路径。算法敏捷性如果允许用已被攻破的旧密钥任意替换验证器，本身就会变成绕过保护的入口。

对 Mantle 最重要的不是争取一个“全链 PQ”的提前标签，而是清楚说明：**哪一类资产、哪一条授权路径、哪些证明与管理权限，已经在什么威胁模型下获得保护。**

---

## 8. 最终结论：两条路线竞争的是什么？

**XMSS＋leanVM** 的战略是：尽量把基础密码学依赖收敛到哈希，用专门的证明工具和分布式递归聚合承担额外计算成本。其优势在于依赖收敛与可组合的证明工作流，挑战在于证明生产、状态签名运维和完整组合的成熟度。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8292)

**Falcon＋Aerie** 的战略是：选择适合代数证明的紧凑签名，把公开哈希留在证明外，显著降低批量证明成本。其优势是当前展现出的高吞吐量与单机可承担性，挑战是额外密码学假设、签名实现、默认线性盐开销，以及研究实现到生产系统之间的距离。[GitHub](https://github.com/a16z/aerie)

**EIP-8288** 解决的是更上一层的问题：让账户表达“我需要什么验证成立”，让协议和网络批量交付这些验证结果。它可能减少长期专用预编译的负担，但当前还不是已经完备的通用密码学接口。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8288)

因此，给 Mantle 的判断可以收敛为一句话：

> **近期把 PQ 授权闭环做出来，中期把验证接口解耦，长期再根据完整安全论证与真实链上负载选择聚合后端；不要把一项算法选择变成整条链不可逆的架构绑定。**

_资料边界：你提供的两条 X 原帖未能完整抓取，因此本篇没有逐字引用或复述其全部论点；Vitalik 的相关立场使用其在 EIP 官方讨论中的回复核对，Eli／StarkWare 的部分使用官方技术文章与路线核对。上述材料足以分析架构与公开工程选择，但不足以确认两条原帖中的每一个具体表述。_

要不要把 EIP-8288、leanVM 和 Aerie 的规范、安全论证及基准变化设为每周跟踪项？
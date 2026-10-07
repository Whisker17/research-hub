---
imported_from: ChatGPT Deep Research
imported_at: 2026-10-06
original_file: atomic-synchronous-tx.md
---

# EEZ 原子同步可组合交易调研

## 工作原理、实现边界，以及 Mantle L2 ↔ L3 的落地路径

**资料截点：2026 年 10 月 6 日。**

**核心判断：这个方向值得 Mantle 做产品驱动的原型验证。它最有价值的定位，不是“更快的跨链桥”，而是“让 L3 的应用执行能够原子地使用 Mantle L2 的资产与金融基础设施”。** 但要实现这种能力，不能只部署几份代理合约：子链执行、证明、排序、数据可用性和状态派生规则都必须协同改造。

先说明一个重要的证据边界：本次核验了 EEZ 的研究提案、核心 Solidity、参考节点及 signer 规范，但**未取得你给定交易的原始 receipt 和完整 trace**。因此，下文会严格区分“协议如何工作”“公开参考实现支持什么”与“这笔交易实际证明了什么”，不会把通用机制推演当作该交易的链上解码结果。

---

## 一、先给结论：这项技术真正改变了什么

### 1. 从“跨链发消息”变成“跨执行域调用函数”

普通异步跨链的编程模型接近：

```
链 A：发出请求，结束当前交易
             ↓
       等待传递与确认
             ↓
链 B：执行请求，生成结果
             ↓
       再发送一条消息
             ↓
链 A：在另一笔交易中处理结果
```

同步可组合的目标则是：

```
链 A：开始执行
  → 调用链 B 的合约
  ← 得到链 B 的执行结果
  → 根据返回值继续执行
  → 整个业务操作共同成功，或按调用栈语义回滚
```

EEZ 提案的关键，是在链下提前计算跨域执行，再让父链验证远端计算、执行本地操作，并约束两者的交互一致性。它不是让 Ethereum EVM 在执行到一半时访问某个 L2 RPC，也不是把全部 L2 运算搬到 Ethereum 上重新执行。[Ethereum Research](https://ethresear.ch/t/synchronous-composability-between-rollups-via-realtime-proving/23998)

### 2. 对 Mantle 最重要的是“执行分散，流动性集中”

你的构思可以进一步明确为：

> **应用逻辑可以部署在专用 L3，核心资产、Vault、DEX 和抵押仓位集中在 Mantle L2；跨层业务通过共同的原子提交机制完成。**

这样，L3 不必为了每个产品重新建立一套深度不足的流动性池。但这并不意味着“一个 L2 余额可以不加约束地在多个 L3 上重复使用”。远程使用、抵押锁定和资产跨层转移，是三种不同的资产模型，后文会分别讨论。

### 3. 主网演示不等于实时 ZK 已经生产就绪

这是本次调研最需要保留的判断。

EEZ 的公开完整部署脚本，默认部署的是 **ECDSAProofSystem，验证门槛为 1**。该合约验证的是指定 signer 对公共输入摘要的签名，而不是验证子链执行的 ZK 证明。参考节点 README 也明确说，目前这种绑定执行内容的签名证明还不是 succinct validity proof。[GitHub](https://raw.githubusercontent.com/eez-association/eez-core-protocol/main/deployment/Deploy.s.sol)

因此：

**“原子同步执行路径能够工作”与“该路径已经由实时 ZK 提供无需信任的执行正确性保证”，必须分开验证。**

同时，不能仅凭默认部署脚本，就反向断定你给出的主网交易一定使用 ECDSA。实际交易的 verifier 类型仍需要链上配置和调用轨迹确认。

---

## 二、背景：Atomic、Synchronous、Isolation 和 Finality 不是同一个概念

讨论 AS 时，最容易出错的地方，是把不同性质压缩成一句“像同一条链一样”。

|性质|应当回答的问题|不能由什么直接推出|
|---|---|---|
|**同步性 Synchronous**|调用方能否在同一逻辑执行中使用远端返回值继续运行？|不能由“消息传得很快”推出|
|**原子性 Atomicity**|相互依赖的业务状态变化能否共同提交或回滚？|不能由“同一区块打包”直接推出|
|**隔离性 / 不交错执行**|跨域操作的中间状态能否被其他交易插入利用？|不能只靠交易顺序承诺|
|**执行有效性 Validity**|子链新状态是否确实由规定的状态转换得到？|不能由“有一个叫 proof 的字段”推出|
|**最终性 Finality**|已提交的结果是否还可能随父链重组而消失？|不能由“证明已验证”推出|

以 `A → B → A` 为例，即使三段最终共同完成，如果第二次回到 A 之前，其他交易可以插入并观察或修改关键中间状态，开发者仍不能把它当成普通的单链函数调用。Ethereum Research 上的讨论专门指出了这种 **non-interleaving** 需求。[Ethereum Research](https://ethresear.ch/t/synchronous-composability-vs-intents-two-paths-to-ethereum-wide-interop/23426)

同样，Ethereum 中“交易已经执行、证明已经通过”和“区块已经 finalized”是不同阶段。AS 可以改变跨域业务的提交方式，但不会消除父链的 fork choice 和最终性过程。[ethereum.org](https://ethereum.org/en/developers/docs/consensus-mechanisms/pos/)

还要补充一个经常被宣传语言省略的细节：

> “全部回滚”通常指相关业务状态；不意味着用户的 gas 支出、已执行失败交易的 nonce 等也凭空恢复。并且，内部调用失败被外层 `try/catch` 捕获时，外层可以继续运行——这仍然是正常的调用栈语义，而不是原子性失效。EEZ 核心实现也保留了这种可捕获回滚行为。[GitHub](https://raw.githubusercontent.com/eez-association/eez-core-protocol/main/src/interfaces/IEEZ.sol)

---

## 三、EEZ 的根本思路：把跨域结果交给一个共同的提交点

### 3.1 不让两条独立链“同时拍板”，而是由父链决定规范结果

可以把参与系统抽象为：

\[ (S_P,\ C_1,\ C_2,\ldots) \]

其中：

- \(S_P\) 是父链状态；
- \(C_i\) 是父链记录的第 \(i\) 条子链的状态承诺；
- 子链完整状态和执行发生在子链节点中，不需要全部展开到父链。

一个成功的跨域操作要实现：

\[ (S_P,\ C_1,\ldots) \longrightarrow (S'_P,\ C'_1,\ldots) \]

如果必要条件不满足，则不能留下“父链业务操作成功，但对应子链状态并未获得授权”的半完成状态。EEZ 的父链合约保存各 rollup 的当前承诺，并在消费执行条目时重新核对前置承诺。[GitHub](https://raw.githubusercontent.com/eez-association/eez-core-protocol/main/docs/CORE_PROTOCOL_SPEC.md)

这里的 `root` 应理解为**协议认可的状态承诺**，不能一律等同于 Ethereum 账户树的 `stateRoot`。参考 composer/signer 的规范还使用了区块哈希、交易前缀对应的候选区块承诺来描述状态推进；实现时必须对齐具体版本的承诺定义。[GitHub](https://raw.githubusercontent.com/eez-association/eez-rollup0/main/crates/eez-control-rpc/SPEC.md)

### 3.2 三件事合在一起，才构成同步执行

**第一，提前计算远端结果。**

Composer 在链下模拟父链与子链的交互，得到远端返回值、跨域调用顺序和子链状态变化。

**第二，为远端计算提供可验证的授权。**

理想的 ZK 路径证明：“给定这些子链前置状态和跨域交互输入，按照规定的执行规则，确实会得到这些输出和后置状态。”

参考签名路径则由独立重执行的 signer 对相应摘要背书。两者提供的信任保证不同。

**第三，在父链真正执行本地操作，检查实际交互与预计算一致。**

父链不是盲目信任 Composer 对父链执行结果的预测。该在父链运行的合约仍然实际运行；实际调用及返回结果必须与获授权的交互轨迹一致。[Ethereum Research](https://ethresear.ch/t/synchronous-composability-between-rollups-via-realtime-proving/23998)

因此，EEZ 可以概括为：

> **预计算远端执行 + 验证执行授权 + 本地真实执行 + 跨域交互一致性检查 + 共同提交。**

---

## 四、系统由哪些组件组成

核心协议之外，必须把节点侧组件一起看。

|组件|主要职责|
|---|---|
|**父链 EEZ Manager**|注册子链、保存承诺和原生币记账、验证 proof、执行或排队跨域条目|
|**子链 EEZL2**|接收系统加载的执行表，为子链合约提供远端调用结果，执行入站调用|
|**CrossChainProxy**|把“远端地址”映射为本地可调用代理，并维护跨域调用身份|
|**Composer**|协调多域模拟、生成执行表、组织证明请求、安排父链提交|
|**Prover / Proof Signer**|验证子链执行及其结算效果，生成 ZK 证明或签名证明|
|**Deriver / Follower**|根据父链数据与实际确认结果重建子链规范状态|

父链和子链 manager 的共同代理与执行上下文机制位于 `EEZBase`；子链 `EEZL2` 本身不验证 ZK，也不维护其他 rollup 的注册表。**“系统地址可以加载表”不是充分的安全保证，节点和证明程序必须限制这些系统操作的来源与内容。**[GitHub](https://raw.githubusercontent.com/eez-association/eez-core-protocol/main/src/base/EEZBase.sol)

`eez-rollup0` 则提供了 sequencer、composer、proof signer、deriver 这几个实际角色。它的公开 README 描述的是以 Chiado 为支持父链的参考环境，而不是你那笔 Ethereum 主网交易的完整部署清单。[GitHub](https://raw.githubusercontent.com/eez-association/eez-rollup0/main/README.md)

---

## 五、从用户提交到规范状态：完整生命周期

以下用一个**说明机制的例子**，不是对你提供交易的解码：

> 用户在子链操作一个投资应用。资金已经位于父链的授权 escrow 中。子链应用调用父链 Vault adapter 完成存款，拿到实际 shares 数量，再更新子链仓位。

概念上的子链代码可以写成：

```
// 教学伪代码，不是 EEZ 的实际公开 ABI。
// parentVaultProxy 是父链 adapter 在子链上的代理。
// 对应资金已在父链 escrow 中，并具备明确授权。

function invest(bytes32 orderId, uint256 assets, uint256 minShares) external {
    uint256 shares =
        parentVaultProxy.depositFromEscrow(orderId, assets);

    require(shares >= minShares, "insufficient shares");

    positions[msg.sender].shares += shares;
}
```

关键不在这几行 Solidity，而在它背后的执行流程。

### 第一步：接收交易，判断是否需要跨域组合

普通子链交易可以走普通执行路径；涉及远端代理调用的交易，需要由 Composer 协调。

参考节点将普通 **Live block** 与承载跨域工作的 **Sync block** 区分开，后者与父链出块周期关联。它不是要求所有子链交易都等到父链上执行。[GitHub](https://raw.githubusercontent.com/eez-association/eez-rollup0/main/README.md)

### 第二步：基于确定的前置状态进行多域模拟

Composer 执行子链交易。

当子链调用父链 Vault adapter 时，模拟器计算父链存款操作的效果和返回值，比如 `shares = 98`；随后让子链代码拿着这个结果继续执行。

如果子链随后发现 `98 < minShares`，整条业务路径就不是一个成功的候选执行。实现必须表达对应失败语义，或者在受限 profile 中拒绝提交该候选，而不能只把已经模拟成功的父链存款部分单独提交。

### 第三步：生成执行表和证明材料

模拟结果被整理为：

```
子链前置承诺
子链后置承诺
需要在父链执行的真实调用
父链 → 子链调用的预计算结果
调用与返回值的交互承诺
原生币净变化
用于重建子链的交易和数据
```

Composer-to-prover 规范还要求提交相应区块窗口与执行 witness，由 signer 独立重执行并重新计算公共输入摘要，而不是直接签 Composer 声称正确的哈希。[GitHub](https://raw.githubusercontent.com/eez-association/eez-rollup0/main/crates/eez-control-rpc/SPEC.md)

### 第四步：得到证明或签名

生产目标可以是验证子链状态转换的 ZK proof。

当前参考路径则是独立重执行之后，对绑定了批次内容的摘要签名。这个设计能够让 signer 检查 Composer 是否构造了不一致的批次，但安全性仍然依赖 signer，不等于密码学上证明执行正确。[GitHub](https://raw.githubusercontent.com/eez-association/eez-core-protocol/main/src/proofSystems/ECDSAProofSystem.sol)

### 第五步：在父链执行真实操作

父链收到批次后，验证相关 proof，然后在执行条目被消费时：

```
检查当前子链承诺是否匹配
    ↓
真实调用父链 Vault adapter
    ↓
记录真实 success / returnData
    ↓
核对交互承诺与资金净变化
    ↓
提交子链新承诺，或者回滚
```

例如，模拟时预期得到 98 shares，但父链执行时 Vault 状态已经变化，实际得到 97 shares。

如果这导致交互结果不匹配，相关执行就不能按原计划提交。Composer 需要重新构造，而不是让子链继续使用旧的 98 shares。核心合约通过前置承诺、rolling hash 和资金净变化检查约束这种一致性。[GitHub](https://raw.githubusercontent.com/eez-association/eez-core-protocol/main/src/EEZ.sol)

### 第六步：子链根据父链结果确定规范历史

参考节点可以先把 Sync block 放入本地子链，但这是一个需要跟随父链结果修正的暂定状态。父链提交未成功时，子链需要回滚；独立 follower 应能够从父链数据重新派生一致的子链。[GitHub](https://raw.githubusercontent.com/eez-association/eez-rollup0/main/README.md)

**因此，用户看到“子链已经执行”时，必须知道它是预执行状态，还是已经获得父链确认的状态。**

### 第七步：随父链获得最终性

AS 的业务提交完成后，仍要区分父链已包含、已安全确认和最终确定等状态。不能把 Sync block 的快速反馈包装成已经获得 Ethereum 最终性。[ethereum.org](https://ethereum.org/en/developers/docs/consensus-mechanisms/pos/)

---

## 六、核心机制拆解

### 6.1 CrossChainProxy：让远端调用看起来像本地调用，但身份语义并不相同

EEZ 为远端的“rollup ID + 地址”创建确定性的本地代理。

它有两个用途：

一是在调用方所在链上，提供一个可以正常进行 ABI 调用的入口；二是在目标链真实执行时，代表远端调用者发起本地调用。目标合约看到的 `msg.sender` 通常是该远端身份对应的本地代理，而不是原始用户在另一条链上的裸地址。`CrossChainProxy` 使用普通 `call` 执行目标，不是跨链 `delegatecall`。[GitHub](https://raw.githubusercontent.com/eez-association/eez-core-protocol/main/src/base/CrossChainProxy.sol)

这对应用集成有直接影响：

**授权要绑定跨域身份。** 不能只看到一个相同的 20 字节地址，就认为它是同一个用户或同一个合约。

**资金和 allowance 的持有人要明确。** Vault shares 是给代理、用户、escrow，还是某个统一账户系统，必须由 adapter 决定。

**代理不是远端合约代码的完整替身。** 对代理执行 `extcodesize`、读取它的余额，看到的是本地代理的信息；目标链执行中的区块上下文，也不是源链上下文。[GitHub](https://raw.githubusercontent.com/eez-association/eez-core-protocol/main/docs/CAVEATS.md)

因此，“现有合约可复用”是有条件的，不等于所有合约都能完全无感接入。

### 6.2 ExecutionEntry：不是一条简单的跨链 message

当前核心接口中的执行条目包含几类信息：

|字段类别|解决的问题|
|---|---|
|`rollupUpdates`|哪些子链承诺从什么值变成什么值，原生币记账如何变化|
|`proxyEntryHash`|这条执行对应哪个跨域入口调用|
|`l2ToL1Calls`|哪些父链调用必须真实发生|
|`expectedL1ToL2Calls`|执行过程中再次进入子链时，应匹配什么调用与返回|
|`rollingHash`|整个交互轨迹应满足什么承诺|
|`success / returnData`|当前调用帧最终返回还是回滚，以及返回内容|

这比“把目标地址和 calldata 发过去”多了一层关键约束：**它描述的是一个带前置状态、执行轨迹和后置状态的跨域执行片段。** 当前接口还区分普通执行条目与只读条目。[GitHub](https://raw.githubusercontent.com/eez-association/eez-core-protocol/main/src/interfaces/IEEZ.sol)

用户提供的早期研究提案使用了更偏 action 序列的表述。阅读时应把它作为概念来源，而不要把早期 action 设计直接当成当前合约的 ABI。

### 6.3 Rolling hash：绑定的是交互过程，而不只是最终答案

只验证“最后返回 98”是不够的。

攻击者可能试图替换调用目标、改变金额、调整顺序，或者在其他执行位置复用一个相同返回值。

EEZ 会随执行推进累积一个哈希，大意是：

\[ h_{i+1}=H(h_i,\ \text{事件类型},\ \text{调用或返回内容}) \]

当前实现区分调用开始、调用结束、嵌套开始、嵌套结束等标签；调用身份又包含源与目标、rollup、value、calldata 等信息。嵌套返回结果的匹配，还结合了当时的 rolling hash，从而绑定具体执行位置。[GitHub](https://raw.githubusercontent.com/eez-association/eez-core-protocol/main/src/base/EEZBase.sol)

这解决两个问题：

**防止替换。** 不能把对合约 X 的调用替换成对 Y 的调用，然后仅凭相同返回值通过检查。

**防止错位复用。** 相同 calldata 在不同上下文或不同调用位置，不应自动共享一个获授权结果。

不过，不能进一步推导成“任意 gas 敏感程序都能完全等价重放”。文档明确承认某些依赖 `gasleft()` 的结果无法由当前查找身份充分区分，属于需要构造方拒绝或重构的支持边界。[raw.githubusercontent.com](https://raw.githubusercontent.com/eez-association/eez-core-protocol/main/docs/CAVEATS.md)

### 6.4 公共输入绑定了什么

当前 multi-prover 规范将执行条目、只读条目、选定的 blob 哈希、额外 calldata 的哈希、rollup 自定义上下文、验证配置，以及可选的提交者身份纳入公共输入。

这里有两个特别重要的区分：

**公共输入中包含执行内容，不代表调度策略也全部被证明。** `immediateEntryCount` 等调度参数并未全部进入证明摘要。

**多 prover 不是多台 GPU。** 它指不同 proof system 的验证策略。每条 rollup 可以要求指定集合中的若干证明系统满足门槛；一个批次列出的证明必须全部验证通过。[GitHub](https://raw.githubusercontent.com/eez-association/eez-core-protocol/main/docs/MULTI_PROVER_SPEC.md)

对 Mantle 来说，配置策略比“支持多证明系统”这个标签更重要。作为安全设计上的推论：如果同时注册强 ZK verifier 和弱签名 verifier，却允许任意一个通过即可，那么并没有得到“至少由 ZK 保证正确”的性质。

### 6.5 原生币守恒也必须被验证

跨域调用如果携带原生币，需要同时协调父链实际转账与子链记账变化。

核心合约比较：

\[ \sum \text{rollup 原生币记账净变化} = \text{当前执行帧及其子帧的真实原生币净流量} \]

不匹配就回滚。它并非只检查一个新 root。[GitHub](https://raw.githubusercontent.com/eez-association/eez-core-protocol/main/src/EEZ.sol)

子链侧同样需要系统级规则。参考节点的入站系统交易会在执行前处理相应原生币额度，外层执行失败时撤销该额度变化。这部分规则必须进入节点执行和证明验证范围，不能只在桥合约中补一个余额变量。[GitHub](https://raw.githubusercontent.com/eez-association/eez-rollup0/main/docs/native-system-transactions.md)

但这种原生币账本**不会自动替每一种 ERC-20 建立跨域供应量守恒**。ERC-20 的 escrow、mint/burn、份额与赎回权，需要独立设计。

---

## 七、最容易被误读的部分：单笔交易、同一区块与批次原子性

### 7.1 当前代码存在不同执行路径

EEZ 并不是只有一种“验证后立即把全部操作执行完”的路径。

核心协议允许部分条目在 `postAndVerifyBatch` 内立即执行；部分可经由提交者的 meta hook 在同一交易内消费；剩余条目可以排入队列，再由后续代理调用或执行入口消费。

**后续消费必须发生在验证所在的同一个父链区块。** 这通过 `lastVerifiedBlock == block.number` 一类检查实现，不能把执行表留到任意未来区块继续使用。[raw.githubusercontent.com](https://raw.githubusercontent.com/eez-association/eez-core-protocol/main/docs/EXECUTION_ENTRY_SPEC.md)

因此，下面三种表述不能混用：

```
一笔用户发起的逻辑交易
≠ 一笔 Ethereum 交易信封
≠ 一个包含多笔 Ethereum 交易的区块 bundle
```

### 7.2 “证明通过”不代表所有条目必定送达

项目自己的 caveats 明确写出了这点：执行表可能跳过不匹配条目，提交者也可能没有按预期消费某些即时条目。

所以：

> **证明可以授权“这些执行是允许的”，但未必同时保证“这些执行一定会按你想要的调度发生”。**

某些需要强制调度的应用，应绑定指定提交者，并在提交者合约或 meta hook 中检查必要动作确实发生。[GitHub](https://raw.githubusercontent.com/eez-association/eez-core-protocol/main/docs/CAVEATS.md)

### 7.3 批次内所有 proof 通过，不等于批次内所有用户操作共同成功

当前即时执行路径对部分 L2-origin 条目采用可捕获失败的处理方式，存在跳过某些失败条目的语义。这使得同批次中的独立操作不必总是一起成功。

因此，Mantle 的一个业务流程若要求：

```
释放资金 + 创建池子 + 铸造 LP + 标记毕业
```

就必须明确把这些步骤放进**同一个受共同回滚约束的业务执行边界**。不能仅因为它们在一个 batch 中，就声称它们已经具有共同原子性。[raw.githubusercontent.com](https://raw.githubusercontent.com/eez-association/eez-core-protocol/main/docs/EXECUTION_ENTRY_SPEC.md)

### 7.4 Same-block bundle 仍然需要排序与包含策略

从上述实现可以推导出：父链 builder 只包含验证交易，却遗漏用户消费交易，或者插入改变相关状态的交易，都是需要处理的情况。

正确的系统应当让其结果成为“未执行、失败或需要重试”，而不是产生未经父链实际结算的子链成功状态。也就是说：

**builder/composer 负责让操作能够被执行；合约、证明和派生规则负责限制什么结果能够成为规范状态。**

这两个责任不能互相替代。

---

## 八、给定交易：目前能说什么，不能说什么

交易哈希：

```
0xd0cbfef7df37b362839d7bf91a91bccc09b1510625919b7bcdaa291153920a02
```

### 8.1 公告层面的信息

2026 年 10 月 6 日发布的报道援引 EEZ 贡献者在 **10 月 5 日**的公开表述，将该里程碑描述为 Ethereum 主网上的首次 EEZ 原子 L1 → L2 执行，并称演示涉及 **0.001 ETH 的跨链调用和 rollup 状态更新**。这是报道层面的信息，不是本次独立取得的交易解码。[crypto.news](https://crypto.news/ethereum-could-make-moving-between-l1-and-l2-easier/)

这里应将“第一笔”限定为项目方所宣称的实现里程碑，不能扩大成“整个区块链行业此前从未实现过原子跨链执行”。

另外，10 月 5 日是被报道的公开宣告日期；**该 hash 的链上时间戳，本报告尚未独立验证**。

### 8.2 证据状态

|项目|本次状态|
|---|---|
|研究对象的交易 hash|由你提供|
|项目方宣称发生主网原子 L1 → L2 演示|有公开报道支持|
|涉及 0.001 ETH 和 rollup 更新|报道声称，未独立核验原始日志|
|具体 Ethereum 区块、发送者、目标合约|未取得原始数据|
|具体 L2 名称、chain ID、对应子链交易|尚未确认|
|业务操作是转账、计数器、swap、Vault 还是其他|尚未确认|
|实际使用 ECDSA、TEE 还是 ZK verifier|尚未确认|
|验证与执行是否处于同一个 Ethereum 交易信封|尚未确认|

因此，**目前不能把这笔交易写成“已经完成一次跨链 Uniswap 交易”“执行了跨链闪电贷”或“主网实时 ZK 已经跑通”**。

同样，看到一次原生币调用和 root 更新，也不足以证明完整的嵌套调用、只读调用、回滚传播和重组恢复都已经在该样本中得到验证。

### 8.3 怎样完成真正的逐调用分析

完整分析至少需要把下面这条证据链连起来：

```
Ethereum 交易输入和 receipt
    ↓
实际目标合约及执行时 implementation
    ↓
批次参数与执行条目解码
    ↓
实际 proofSystems / threshold / signer 或 verifier
    ↓
父链真实调用、资金流与事件
    ↓
对应子链执行及其前后状态承诺
    ↓
独立 deriver 能否重建相同结果
```

尤其要检查入口是什么：

**如果入口是 `postAndVerifyBatch`：** 它可能同时执行了一部分动作，也可能主要发布待消费条目。

**如果入口是远端代理：** 应回看同一区块内更早的验证交易。

**如果通过 meta hook：** 应追踪整个内部调用树，而不能只看顶层 transaction 页面。

这些路径在当前协议中都有对应设计。[GitHub](https://raw.githubusercontent.com/eez-association/eez-core-protocol/main/src/interfaces/IEEZ.sol)

为便于其他 Agent 补齐链上证据，我附了一份只读采集脚本：

```
export ETH_RPC_URL="https://YOUR_ETHEREUM_RPC"
python collect_eez_evidence.py --trace --out ./eez_evidence
```

它会采集 transaction、receipt、包含完整交易列表的区块、目标代码、常见代理 implementation slot，以及 RPC 支持时的 call trace。对应方法来自 Ethereum JSON-RPC 和 Geth debug API。脚本不签名、不发送交易，也不需要私钥。[ethereum.org](https://ethereum.org/en/developers/docs/apis/json-rpc/)

脚本已通过离线模拟测试，但本次没有完成真实 RPC 采集；它也不会自动将 proof 分类为 ZK 或 ECDSA。另需注意：按区块号查询历史 storage 得到的是**区块末状态**，存在同区块升级时，还需要结合交易顺序和 trace 判断执行当时的配置。

---

## 九、公开实现目前离“通用同步 EVM”还有多远

### 9.1 核心合约能力与参考 signer profile 不相同

当前核心协议表达了多 rollup、嵌套、只读及回滚等较丰富的执行结构。

但公开的 proof-signer 规范描述的是更窄的 profile：单 rollup、单 proof system，支持成功的出站与入站效果；**不支持完整的嵌套调用、static entries、每个 effect 多个调用、显式 call gas、blobs、L1 block binding 等能力。**[GitHub](https://raw.githubusercontent.com/eez-association/eez-rollup0/main/crates/eez-proof-signer/SPEC.md)

所以在评估时，至少要分三层：

```
协议结构可以表达
        ↓
节点与证明程序实际实现
        ↓
特定部署已经启用并验证
```

不能从第一层直接跳到第三层。

### 9.2 子链确实需要修改执行基础设施

参考节点定义了子链专用的 `0x76` 系统交易类型，包含固定系统发送者、固定目标、特殊费用语义，以及相应执行规则。

其入站系统交易的 `tx.gasprice` 为零；依赖 `gasUsed × tx.gasprice` 进行报销的合约，行为可能与普通付费交易不同。系统交易必须由合法派生路径产生，而不能作为普通用户交易随意进入 mempool。[GitHub](https://raw.githubusercontent.com/eez-association/eez-rollup0/main/docs/native-system-transactions.md)

这说明“Ethereum 不需要为 EEZ 新增硬分叉”与“整个系统不需要改节点”是完全不同的命题。

### 9.3 安全成熟度仍需谨慎对待

核心仓库将自身标为早期实现、尚未审计，并明确部分接口及存储布局仍可能变化。仓库中的 bridge、wrapped token、DeFi mock 等外围组件也不是可以直接拿去生产部署的受支持金融产品。[GitHub](https://github.com/eez-association/eez-core-protocol)

Gnosis 的 GIP-153 也显示了分阶段路线：初期可能使用 TEE 类过渡证明方式，Composer 集中运营，实时 ZK 和完整双向组合属于后续演进内容。这是计划与取舍，不是“已经全部上线”的证明。[Gnosis](https://forum.gnosis.io/t/gip-153-should-gnosis-chain-transition-into-the-ethereum-economic-zone/12397)

对 Mantle 的工程建议是：**固定核心合约、节点、证明程序三个版本及对应 ABI，再做复现。不要用不断变化的 `main` 分支拼成一个未经兼容性验证的系统。**

---

## 十、如何映射到 Mantle L2 ↔ L3

### 10.1 让 Mantle L2 成为共同提交域

推荐的第一版架构是：

```
Ethereum
    │
    │ Mantle 自身的结算与安全路径
    ▼
Mantle L2
 ├─ AS Manager / Verifier
 ├─ Canonical Assets
 ├─ Vault / DEX / Lending / Liquidity Router
 ├─ L3 身份代理与资产 escrow
 │
 ├──────── Mantle L3-A：Launchpad Appchain
 │          ├─ 应用合约
 │          ├─ 子链跨域 manager
 │          └─ 适配后的节点 / prover / deriver
 │
 └──────── Mantle L3-B：其他专用应用
```

这是本报告的架构建议，核心角色映射为：

|EEZ 原始模型|Mantle 方案|
|---|---|
|Ethereum 父链|Mantle L2|
|EEZ rollup|Mantle L3|
|Ethereum 上的 EEZ Manager|Mantle L2 上的 AS Manager|
|Ethereum 上的金融合约|Mantle L2 上的 Vault、DEX 等|
|Rollup composer / prover|Mantle L3 的组合执行与证明系统|

**先实现 Mantle L2 ↔ L3，并不要求同时实现 Ethereum ↔ Mantle L2 ↔ L3 三层同步。**

原因是该设计首先把 Mantle L2 作为共同提交点。之后 Mantle 如何向 Ethereum 结算，是外一层安全关系。不能把内部两层的快速原子提交，宣传为已经同时取得 Ethereum 最终性。

还要避免沿用旧资料假设 Mantle 当前仅有 optimistic proof：Mantle 当前官方概述已经说明其使用 ZK validity proofs。但**“已有 ZK 证明能力”也不等于“已有同步跨域执行所需的证明关系和时延”**。[Mantle Docs](https://docs.mantle.xyz/)

### 10.2 需要改哪些基础设施

以下是基于 EEZ 架构推导的 Mantle 工作拆分。

|层面|需要做的工作|可以避免什么|
|---|---|---|
|**L2 合约层**|部署 Manager、Verifier、代理工厂、资产 adapter；定义 root、权限、限额与升级策略|不必一开始修改所有 DEX/Vault 核心合约|
|**L2 排序层**|为组合交易提供明确的排序、包含、失败和重试策略；与 Composer 对接|不必先扩展到 Ethereum builder 网络|
|**L3 执行层**|系统交易、执行表加载、入站执行、原生币处理、gas 与 receipt 规则|不能只靠普通合约部署替代|
|**L3 证明层**|把系统操作、远端结果、状态转换及资金守恒纳入验证|不能只证明“普通 EVM 用户交易”而遗漏系统路径|
|**Composer**|双域模拟、状态冲突检测、证明请求、截止时间管理、重新构造|不必 MVP 就支持任意深度嵌套|
|**DA 与派生**|发布可重建数据；按 L2 实际执行结果派生 L3；处理遗漏、失败及重组|不能把“root 已发布”当成数据可用|
|**资产与账户**|明确跨域身份、allowance、escrow、shares 所属、赎回权和双花约束|不必把全部资产搬到 L3|
|**RPC 与产品层**|跨域模拟、错误定位、费用报价、pending/settled/finalized 状态展示|不能只沿用一张普通交易 receipt 表达全部状态|

上述拆分分别对应核心合约、子链系统交易以及 Composer/Signer/Deriver 的公开实现职责。[GitHub](https://raw.githubusercontent.com/eez-association/eez-core-protocol/main/docs/CORE_PROTOCOL_SPEC.md)

### 10.3 三个特别具体的移植问题

#### 原生币不能把 ETH 名称直接换成 MNT 就算完成

Mantle 的原生代币是 MNT。EEZ 参考实现中称为 `etherDelta` 的字段，实际关联的是 EVM 原生 value 流。迁移时必须决定父子链的原生币资产语义；不能隐含建立“1 MNT 等于 1 ETH”的价值关系。[GitHub](https://raw.githubusercontent.com/mantle-xyz/mantle-v2/main/README.md)

**我的 MVP 建议：先把跨域原生 `value` 限制为零，优先通过父链上的 ERC-20 escrow 与 adapter 完成业务。** Gas 支付与业务资产分开处理，减少首版供应量和桥接语义的复杂度。

#### 预部署地址存在直接冲突

EEZ 子链参考 manager 使用：

```
0x4200000000000000000000000000000000000007
```

OP Stack 在相同地址预部署 `L2CrossDomainMessenger`。因此，若 Mantle L3 延续 OP Stack 预部署体系，必须明确选择重定位还是替换，并同步更新 genesis、节点、证明程序和 SDK；不能直接复制参考配置。[GitHub](https://raw.githubusercontent.com/eez-association/eez-rollup0/main/docs/native-system-transactions.md)

#### Ethereum blob 支持不能自动等价为 Mantle 上的相同能力

EEZ 的 blob 承诺路径读取交易携带的 EIP-4844 versioned hashes；`BLOBHASH` 并不把 blob 内容提供给 EVM。它不能被简单解释为“任何 L2 合约都可以直接读取 Ethereum 上的 blob 数据”。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-4844)

因此，我建议首版先使用能明确重建的父链 calldata 数据路径，之后再适配目标 DA 方案。

此外，当前代码使用 transient execution context。目标 EVM 必须支持相应 transient storage 语义；“EVM-compatible”标签本身不应替代 opcode 和回滚行为的兼容性测试。[GitHub](https://raw.githubusercontent.com/eez-association/eez-core-protocol/main/src/base/EEZBase.sol)

---

## 十一、“流动性留在 Mantle L2”到底应该怎么实现

这是产品设计里最值得花时间明确的部分。

### 11.1 模式 A：远程操作 L2 资产

这种模式最符合你的原始构思：

```
资金与 Vault shares：在 Mantle L2
应用流程与用户状态：在 Mantle L3
资产操作：由 L3 经过认证的跨域调用触发
结算结果：返回 L3 并参与后续逻辑
```

比如 L3 应用发起父链 Vault 存款、赎回或仓位调整，父链 adapter 返回实际份额与金额。

这里减少的是“为了使用该 Vault，先把钱跨到另一条应用链上”的需要。资金可以在父链不同合约之间移动，但不必离开 Mantle L2。

**需要明确的是：L3 上记录的是什么权利。** 它可以是受父链资产支持的仓位记录，但不能成为一份能够与父链 shares 各自独立赎回的重复债权。

这是本报告建议优先验证的资产模型。

### 11.2 模式 B：抵押物留在 L2，信用在 L3 使用

这也有吸引力，但不能只做一次同步余额查询。

假设用户在 Mantle L2 有 100 份 Vault shares。L3 如果只是同步读取这个余额，就允许借款，用户之后仍可能把父链 shares 转走。

所以需要的不是：

```
读余额 → 放贷
```

而是：

```
在 L2 锁定或占用抵押权
    +
在 L3 建立债务
    +
绑定赎回、解押和清算规则
```

上述动作需要处于适当的原子业务边界中。这是基于资产守恒和双花约束得出的设计要求，而不是 EEZ 自动附送的 Lending 协议。

### 11.3 模式 C：资产真正转移到另一层

如果用户最终要在 L3 拥有可转让、可支付的代币余额，就仍然需要定义资产映射。

原生于 L3 的 token 要进入 L2 DEX，也需要明确的锁定、销毁、铸造或可验证赎回关系。

**AS 可以使这些动作同步组合，但不会消除跨域资产会计。**

这与标准跨层桥中“锁定与铸造、销毁与释放”的基本资产约束是一致的；变化在于执行与提交方式，而不是资产守恒不再需要成立。[GitHub](https://github.com/ethereum-optimism/specs/blob/main/specs/protocol/predeploys.md?utm_source=chatgpt.com)

---

## 十二、Meme Launchpad：我认为最适合 Mantle 的首个产品切入点

### 12.1 不建议一开始就做“所有 L3 交易同步访问所有 L2 协议”

这会把通用跨域执行、复杂账户体系、资产映射、实时证明和产品 PMF 全部绑在一起。

更好的首个目标是：

> **L3 Launchpad 的毕业流程，与 Mantle L2 DEX 流动性创建原子完成。**

它的业务边界清晰、发生频率相对低、失败语义明确，也能直接体现“发行在 appchain，交易流动性回到 Mantle L2”的战略价值。

### 12.2 建议的资产布局

以下是本报告建议的设计，而不是 EEZ 已有产品：

```
Mantle L2
  canonical meme token
  募资资产 escrow
  毕业 Router
  DEX pool
  LP 锁仓或归属合约

Mantle L3
  Launchpad 状态机
  用户参与与分配记录
  毕业条件判断
```

在这个布局中，毕业不需要临时解决“如何把一个从未在 L2 存在的资产变成 L2 canonical token”的问题。

如果业务坚持让 token 原生发行在 L3，则必须额外设计供应量和跨层映射，不能把它省略。

### 12.3 原子毕业流程

逻辑上可以是：

```
L3：检查毕业条件与授权
   ↓
调用 L2 GraduationRouter
   ↓
L2：从 escrow 释放约定资金和 token
   ↓
L2：创建或初始化 DEX pool
   ↓
L2：加入流动性，检查实际结果
   ↓
L2：将 LP 放入规定归属或锁仓合约
   ↓
返回 pool、实际投入量、LP 数量
   ↓
L3：记录毕业结果，关闭旧阶段
```

若必要条件失败，不能留下“资金已从 escrow 释放，但 L3 仍可按未毕业状态继续售卖”的状态。

产品必须提前定义初始价格、最小流动性、LP 归属、税费 token 行为、重复毕业保护，以及池子已被提前创建时的处理方式。这些是应用层不变量，AS 不会替产品自动决定。

### 12.4 为什么这个路径适合受限 MVP

可以将所有父链动作聚合进一个 `GraduationRouter`：

```
一次 L3 → L2 跨域调用
    └─ Router 内进行多次 L2 本地调用
```

这样，首版不必支持：

```
L3 → L2 → L3 → L2
```

这种复杂跨域重入。

这与公开 signer profile 中“每个 effect 的调用数量受限、不支持完整嵌套”的现实更相容；但仍需针对所固定版本做集成测试，而不能仅凭接口结构认定已经支持。[GitHub](https://raw.githubusercontent.com/eez-association/eez-rollup0/main/crates/eez-proof-signer/SPEC.md)

### 12.5 要警惕“低成本 appchain”被同步父链操作抵消

如果 L3 每一笔微小交易都要求真实调用 L2 DEX，那么执行成本和吞吐仍然受到 L2 合约路径约束。

所以更合理的产品拆分可能是：

**高频、可局部完成的应用操作留在 L3；毕业、资金迁移、仓位建立等关键经济动作进入同步提交路径。**

这是应用分层设计，不是 AS 本身提供了无限父链容量。

---

## 十三、其他生态价值，以及外部讨论的重点

### 13.1 Vault、资产管理与仓位再平衡

同步性能够让“执行资产操作”和“按实际返回值更新应用仓位”形成一个可验证的整体。

但 Vault 自身若存在赎回队列、锁定期或其他业务等待条件，AS 不能把这些经济约束变成即时兑付。它同步的是可执行操作，不是取消协议规则。

### 13.2 跨域套利、闪电贷与清算

这类场景最能体现同步返回与回滚的价值。例如：

```
借入资产 → 在另一个执行域交易 → 根据结果偿还
```

不过，这往往要求完整的回调、嵌套、回滚传播及一致资产语义，因此**不能直接用当前简单演示或受限 signer profile 为其可用性背书**。

Ethereum Research 的互操作讨论把闪电贷、跨域套利、清算和跨链策略列为同步可组合的重要目标。应把它们看成能力方向，而不是所有实现当前已通过测试的功能清单。[Ethereum Research](https://ethresear.ch/t/synchronous-composability-vs-intents-two-paths-to-ethereum-wide-interop/23426)

### 13.3 复用父链金融基础设施

Gnosis 的迁移提案强调了访问 Ethereum 主网资产、流动性和既有应用的价值，也展示了一个现实取舍：愿意用更强的父链依赖与运营协调，换取更少的流动性孤岛。[Gnosis](https://forum.gnosis.io/t/gip-153-should-gnosis-chain-transition-into-the-ethereum-economic-zone/12397)

映射到 Mantle，我认为可以形成：

> **多个应用执行域，共享一个核心资产与流动性中心。**

但共享流动性也意味着共享风险入口。弱安全级别的 L3 不应默认获得访问所有 L2 资产和无限 allowance 的资格；需要按 L3、应用和资产设置限额与权限。

### 13.4 与 PropAMM、JIT Router 和 preconfirmation 的关系

结合你们的方向，我认为它们可以互补，但解决的不是同一个问题：

**PropAMM / JIT Router** 负责报价与执行策略。

**Preconfirmation** 提供提前的排序或包含承诺。

**AS** 约束相互依赖的跨域状态如何共同成立。

例如，L3 应用调用 L2 PropAMM，可以在组合执行中验证实际报价结果，再更新子链状态。但证明生成期间的价格变化、订单排序、报价泄露、重试成本仍然存在。

因此，AS 不应被描述成“解决了所有报价到执行之间的价差”，而应被描述成“在跨域流程中约束报价结果、资产变化与应用状态的一致性”。

### 13.5 与 intents 不是二选一

Intents 面向的是“用户想得到什么结果”，同步可组合面向的是“底层状态如何协调执行”。

Solver 可以把 AS 当作一种执行后端；参与 AS 的网络之外，仍可走异步跨链或流动性垫付路径。相关研究也把两者放在不同的协议层面讨论。[Ethereum Research](https://ethresear.ch/t/synchronous-composability-vs-intents-two-paths-to-ethereum-wide-interop/23426)

因此，对 Mantle 的合理定位不是“用 AS 替代所有 intent/bridge”，而是：

**在需要中间返回值、条件分支和共同回滚的路径上使用 AS，在只要求最终交付结果的路径上保留其他机制。**

---

## 十四、关键风险：哪些是安全问题，哪些是活性问题

### 14.1 证明类型与管理权限决定真实信任模型

当前 ECDSA verifier 的安全性依赖 signer；其 owner 可以更换 signer。

参考 rollup 管理合约还具有配置 proof system、verification key、threshold，以及 root escape 等管理能力。因此，即便未来接入 ZK，也必须审查升级和管理权限，而不是仅看到 ZK verifier 就宣称没有额外信任。[GitHub](https://raw.githubusercontent.com/eez-association/eez-core-protocol/main/src/proofSystems/ECDSAProofSystem.sol)

### 14.2 跨部署重放隔离需要主动设计

项目文档明确指出，公共输入并未自动显式绑定 `block.chainid`、registry 地址和协议版本，独立部署需要使用不同验证域。[raw.githubusercontent.com](https://raw.githubusercontent.com/eez-association/eez-core-protocol/main/docs/CAVEATS.md)

**我的 Mantle 建议：** 把父链 chain ID、Manager 地址、协议版本、子链标识和证明版本周期明确纳入验证域。

这是避免照搬部署配置产生风险的工程要求，不意味着本次已经发现了可利用的主网漏洞。

### 14.3 数据可用性不是 proof 的附属品

一个有效的状态转换承诺，并不等于其他节点拿到了重建完整状态所需的数据。

对 Mantle L3 来说，必须验证：独立 follower 能否仅依据允许的 DA 与父链确认数据，重建与 sequencer 相同的状态。参考节点把这种父链派生能力作为核心组成部分，而不是可选浏览器功能。[GitHub](https://raw.githubusercontent.com/eez-association/eez-rollup0/main/README.md)

### 14.4 集中协调可能放大审查与 MEV

Composer 需要看到跨域执行，构建者又需要安排相关父链操作。这可能强化少数参与者的排序优势，并形成跨域 MEV 视野。

研究讨论已经提出实时 proving 对 builder 集中度、私有订单流和强制包含的影响。不能把“错误状态提交不了”误写为“运营者不能审查或使用户持续失败”。[Ethereum Research](https://ethresear.ch/t/synchronous-composability-between-rollups-via-realtime-proving/23998)

### 14.5 建议的故障分类

|故障|应有结果|不能接受的结果|
|---|---|---|
|证明错误、签名无效|拒绝批次|无效子链状态获得授权|
|前置承诺或真实返回值变化|失败、重构或重试|继续采用旧结果提交|
|验证成功但必要动作未消费|标记未完成，规范状态不包含虚假效果|L3 仍记录业务成功|
|父链重组|子链跟随回滚并重新派生|父子链永久分叉|
|DA 缺失|明确失败或不可安全推进|只有运营者能够恢复资金状态|
|内层调用失败|按明确的调用栈和业务边界回滚|错把“被捕获失败”当全局成功|
|Composer / prover 超时|保留待处理或退回失败|为赶截止时间提交未经验证结果|

这张表是建议的验收目标，而不是声称当前 EEZ 部署已经覆盖所有故障情况。

---

## 十五、实时证明的性能评估应该怎么做

### 15.1 不应只看“证明某个区块用了几秒”

对组合交易，真正的时延预算更接近：

\[ T_{\text{模拟}} +T_{\text{witness}} +T_{\text{证明}} +T_{\text{传输与提交}} +T_{\text{安全余量}} \leq T_{\text{可用提交窗口}} \]

这是评估模型，不是当前实现的 benchmark。

重要的是 **p95 / p99 的端到端分布**，以及与父链真实状态冲突后重新构造的概率，而不只是一个理想区块上的平均 proving time。

从机制上看，较慢证明并不自动破坏原子性；它会让状态过期、报价变化和等待成本更严重，从而使产品难用。参考 composer-to-prover 规范也要求截止时间未满足时不要提交未经证明的批次，而应采用空 Sync 等处理方式。[GitHub](https://raw.githubusercontent.com/eez-association/eez-rollup0/main/crates/eez-control-rpc/SPEC.md)

### 15.2 对 Mantle 应当实测的指标

我建议把测量分成三组：

**执行层：** 组合成功率、状态冲突率、重试次数、失败 gas、跨域调用深度、父链 gas 与数据量。

**证明与基础设施层：** witness 时间、证明尾延迟、按时提交率、重组恢复时间、独立派生一致性。

**产品层：** Launchpad 毕业完成率、Vault 操作最终成功率、端到端用户等待时间、相对于异步方案减少的步骤和失败状态。

成本也应按完整路径计算：

\[ C_{\text{总}} = C_{\text{父链实际执行}} +C_{\text{验证}} +C_{\text{DA}} +C_{\text{子链执行}} +C_{\text{证明与协调}} \]

AS 能减少中间步骤和部分资金周转需求，但不会使父链实际执行和证明成本消失。

---

## 十六、对 Mantle 的落地建议

### 第一阶段：验证一个窄业务，而不是先承诺通用 AS 网络

我推荐：

> **单条 L3 + Mantle L2 上的一个受限 Router + 一次跨域调用 + 明确的共同成功条件。**

首个业务优先选 Launchpad 毕业，或者从父链 escrow 向父链 Vault 建立仓位。

首版可以在隔离环境中使用签名证明验证执行模型，但应明确标注为可信证明原型，不用它承载“已经获得无需信任安全”的产品承诺。

### 第二阶段：补齐生产安全闭环

重点不是再加十个应用，而是完成：

**完整执行证明。** 子链系统交易、跨域结果和资产记账都进入验证范围。

**规范派生。** 验证、消费、失败、缺席和重组都能得到唯一结果。

**资产与权限边界。** 各 L3、应用和资产的授权、限额、暂停及退出路径明确。

**审计与版本固定。** 合约、节点、证明程序和部署配置作为一个整体评审。

### 第三阶段：再扩展多 L3 与复杂组合

当窄业务证明了价值，再考虑多 L3 原子交易、只读跨域查询、复杂嵌套、跨域借贷和闪电贷。

这更符合你之前强调的产品迭代方式：**先确认核心产品为什么需要这种能力，再补齐该能力必要的 infra，而不是先建一套极其通用的跨域执行系统，再寻找需求。**

### 上线前最有价值的验收实验

建议至少做三类成对实验：

**成功与回滚对照。** 同一业务分别让父链操作、子链后续条件失败，确认没有残留资产或虚假仓位。

**正常包含与恶意调度对照。** 删除消费交易、交换顺序、插入状态竞争，确认系统只会失败或重试，而不会形成半完成的规范状态。

**正常运行与恢复对照。** 制造父链重组、prover 超时、sequencer 重启，再用独立 follower 重建，比较承诺、余额、nonce 和业务状态。

没有通过这些实验之前，一笔成功主网交易只说明“某条成功路径跑通”，还不足以说明系统的安全边界。

---

## 十七、给后续研究与对外输出使用的结论

### 技术结论

**EEZ 的创新重点，是把远端执行证明、真实父链调用和子链状态推进放进一套共同约束的提交机制中，使跨域交互能够获得接近函数调用的编程模型。**

其关键不是某个单独 opcode，也不是把桥接确认时间缩短，而是整合：

```
远端执行授权
+ 调用轨迹一致性
+ 前置状态约束
+ 资产守恒
+ 调度规则
+ 规范状态派生
```

缺少其中一项，都不能仅凭“同步”“原子”两个词推导出完整保证。

### Mantle 结论

**最值得验证的不是“让所有资产在更多链之间移动”，而是“让更多应用链能够使用同一处核心资产与流动性”。**

对 Mantle，可以将其定义为：

> **以 Mantle L2 为核心资产与流动性层，以 L3 为专用应用执行层，通过原子同步结算连接两者。**

这个定义与你提出的 Vault、DeFi 和 Meme Launchpad 流动性迁移高度一致，也比泛化的“跨链更快”更能解释为什么需要这项基础设施。

### 对外措辞边界

不宜直接使用“任意 L2 都能无改造接入”“不需要任何桥接或资产映射”“所有逻辑都在一笔 Ethereum 交易中完成”“立即获得 Ethereum 最终性”“实时 ZK 已全面主网上线”等表述。

更稳妥的说法是：

> **在适配后的执行域之间，通过预计算、执行验证和共同提交，使相互依赖的跨域业务能够同步组合；具体支持范围和信任假设取决于节点、证明系统及部署配置。**

**本次研究已经定位了协议原理、核心实现边界和 Mantle 的可行落地切入点；尚未补齐的是指定主网交易的原始 receipt、trace 与对应子链证据，因此该样本的具体业务调用、资产路径和实际 proof 类型仍保留为待核验项。**

```
#!/usr/bin/env python3

"""Read-only EEZ transaction evidence collector (Python 3.10+, stdlib only).

Set ETH_RPC_URL to an Ethereum JSON-RPC endpoint. No private keys are needed.

This collects raw evidence, not ABI decoding or a proof-system classification.

Historical eth_getCode/eth_getStorageAt block tags mean END OF BLOCK, not the

instant before a transaction. Use the execution trace to resolve intra-block

upgrades. Missing RPC results do not establish that a transaction never existed.

"""

from __future__ import annotations

import argparse

import datetime as dt

import json

import os

from pathlib import Path

import re

import sys

from typing import Any

import urllib.error

import urllib.request

DEFAULT_TX = "0xd0cbfef7df37b362839d7bf91a91bccc09b1510625919b7bcdaa291153920a02"

IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"

MAX_RESPONSE_BYTES = 64 * 1024 * 1024

class RPCError(RuntimeError):

pass

class RPC:

def __init__(self, url: str, timeout: float = 30.0) -> None:

if not url.startswith(("https://", "http://")):

raise ValueError("RPC URL must use http:// or https://")

self.url = url

self.timeout = timeout

self.counter = 0

def call(self, method: str, params: list[Any]) -> Any:

self.counter += 1

payload = json.dumps({"jsonrpc": "2.0", "id": self.counter,

"method": method, "params": params}).encode()

request = urllib.request.Request(self.url, data=payload, headers={

"Content-Type": "application/json", "User-Agent": "eez-evidence/1.0"})

try:

with urllib.request.urlopen(request, timeout=self.timeout) as response:

raw = response.read(MAX_RESPONSE_BYTES + 1)

except urllib.error.HTTPError as exc:

raise RPCError(f"{method}: HTTP {exc.code}") from None

except (urllib.error.URLError, TimeoutError, OSError):

raise RPCError(f"{method}: connection failed or timed out") from None

if len(raw) > MAX_RESPONSE_BYTES:

raise RPCError(f"{method}: response exceeded size limit")

try:

result = json.loads(raw)

except (ValueError, UnicodeError):

raise RPCError(f"{method}: invalid JSON response") from None

if not isinstance(result, dict) or result.get("id") != self.counter:

raise RPCError(f"{method}: invalid JSON-RPC envelope or request id")

if "error" in result:

err = result["error"]

code = err.get("code") if isinstance(err, dict) else None

# Do not persist server error text, which may echo URL credentials.

raise RPCError(f"{method}: RPC error code {code}")

if "result" not in result:

raise RPCError(f"{method}: missing result")

return result["result"]

def save_json(path: Path, value: Any) -> None:

path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

def implementation_address(word: Any) -> str | None:

if not isinstance(word, str) or not re.fullmatch(r"0x[0-9a-fA-F]{64}", word):

return None

address = "0x" + word[-40:]

return None if int(address, 16) == 0 else address

def collect(rpc: RPC, out: Path, tx_hash: str, expected_chain: int, trace: bool) -> int:

out.mkdir(parents=True, exist_ok=True)

meta: dict[str, Any] = {

"collected_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),

"requested_transaction": tx_hash,

"errors": [],

"notes": [

"All methods are read-only. RPC endpoint and credentials are not saved.",

"Transaction data is not decoded; verifier identity is not inferred.",

"State queries at a block number refer to the end of that block.",

"Inspect earlier transactions and traces for intra-block configuration changes.",

"This is parent-chain evidence only; child derivation must be checked separately."

]

}

def get(name: str, method: str, params: list[Any], required: bool = False) -> Any:

try:

value = rpc.call(method, params)

save_json(out / (name + ".json"), value)

return value

except RPCError as exc:

meta["errors"].append(str(exc))
```
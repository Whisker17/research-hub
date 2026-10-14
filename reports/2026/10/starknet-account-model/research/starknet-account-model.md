---
imported_from: ChatGPT Deep Research
imported_at: 2026-10-14
original_file: starknet-account-model.md
---

# Starknet：原生账户、STRK20 / Shadow Accounts，以及“2027 年 PQ L1”的技术基础

**我的核心判断是：Starknet 确实有较低的抗量子迁移阻力，但“具备迁移优势”“已经支持抗量子账户”“2027 年成为全栈抗量子 L1”是三个不同层级的命题，不能互相替代。** 官方 Quantum Hub 自己也明确回答：目前不能把 Starknet 整体称为已经抗量子的系统。它区分了证明系统的设计、账户的密码学可替换性，以及尚未完成的迁移工作。[StarkWare Quantum Hub](https://quantum.starkware.co/learn)

你对 Shadow Account 的直觉基本正确，但需要修正一个重要细节：**它是与主钱包公开关联被隐藏的、持久化的子身份合约，而不是内部余额和交易都被加密的账户，也不是拥有独立私钥的 HD 子钱包。**[STRK20](https://strk20.starknet.io/docs/starknet-wallet-api/shadow-accounts)

下面按“账户模型 → 隐私协议 → Shadow Account → 密码学与时间表”的顺序拆解。

**核验边界：**资料检索截至 **2026 年 10 月 14 日**。以下实现结论主要来自官方文档与实际源码；但本次没有在本地执行 Cairo / Lean 测试，也没有把主网各合约的 class hash 与固定 commit 的构建产物逐项比对。因此，我会明确区分“源码已实现”“官方记录已上线”和“路线图”，不会把静态源码阅读写成已完成的安全审计或主网复现。

---

## 一、先校准“2027 vs. 2029”到底在比较什么

### 1.1 Starknet 的架构优势成立，但完整 L1 交付尚不能由公开技术材料确认

在本次取得的一级技术资料中，最有价值的不是宣传文章，而是 StarkWare 的 **Migration Register**。该页面最后更新于 **2026 年 8 月 19 日**，明确把不同组件分开登记：

|组件|官方登记状态|
|---|---|
|账户可编程验证|已有的原生架构能力|
|Falcon-512 账户|有主网演示记录|
|OS program / config hash|v0.14.3 已使用基于 BLAKE2s-256 的构造|
|合约状态树、合约地址派生|路线图方向，不是已上线状态|
|旧合约 storage map 迁移|研究阶段，尚无公开完整工具链|
|Ethereum blob / KZG 依赖|外部依赖；可使用 calldata fallback|

这里的“尚未上线”是该官方登记表的状态，**不能冒充我已经独立核验了 10 月 14 日的全部链上状态**；但我也没有取得足以把这些项目改标为“已完成”的更新部署证据。[StarkWare Quantum Hub](https://quantum.starkware.co/migration-register)

对于你提到的 **2027 年独立 PQ L1**，本次没有取得包含完整独立 L1 安全规范、治理执行方案和确定激活日期的一级技术文件。因此，下面把它作为**需要检验可行性的目标**，而不是已经确定的交付承诺。

### 1.2 Ethereum 的 2029 目标不是“到那时才能使用 PQ 钱包”

Ethereum Foundation Protocol Cluster 在 **2026 年 9 月 7 日**发布的目标是：到 **2029 年 12 月**，让 Ethereum L1 的 **execution、consensus、data 三层**具备抗量子能力；同时设置了安全保证较弱的 minimum viable post-quantum 备用路径。[Ethereum Blog](https://blog.ethereum.org/2026/09/07/protocol-priorities)

所以，正确比较应该是：

> **Starknet 能否在 2027 年完成一个明确安全边界内的全栈迁移，与 Ethereum 能否在 2029 年完成其三层迁移。**

不能拿“Starknet 已经能部署 Falcon 账户”，去对比“Ethereum 整个 L1 的迁移截止时间”。

---

## 二、Starknet 的账户模型：真正的优势是验证逻辑原生可编程

### 2.1 它改变的是“谁决定一笔交易获得了授权”

传统 EVM EOA 的授权方式由协议规定；Starknet 则让账户合约定义验证逻辑。一个 Starknet account contract 需要提供 `__validate__` 和 `__execute__`，需要声明合约或自行部署账户时，再提供对应的验证入口。[Starknet Documentation](https://docs.starknet.io/learn/protocol/accounts)

可以把普通 INVOKE 的逻辑理解为：

```
用户构造交易
    ↓
协议检查交易格式、nonce、资源等条件
    ↓
调用账户的 __validate__
    ↓
调用账户的 __execute__
    ↓
账户执行目标合约调用
```

这里的关键不是“把 ECDSA 从 C++ / Rust 搬进 Cairo”，而是：

> **协议认可的是账户合约的验证结果，而不是强制所有账户都使用同一种用户签名算法。**[Starknet Documentation](https://docs.starknet.io/learn/protocol/accounts)

### 2.2 与 EVM 的比较需要区分 EOA、4337 和 7702

|维度|传统 EVM EOA|EVM 智能账户|Starknet 原生账户|
|---|---|---|---|
|用户授权规则|协议固定的 EOA 签名规则|合约定义规则|合约定义规则，进入原生交易流程|
|可否自行验证 PQ 签名|不能直接替换 EOA 根签名|可以在合约中实现|可以在账户验证函数中实现|
|交易提交路径|原生交易|4337 可经 UserOperation、bundler、EntryPoint|account contract 本身参与原生验证和执行|
|批量调用|传统 EOA 本身没有通用批处理逻辑|智能账户可以实现|常见账户实现直接接受调用数组|
|是否仍有传统 EOA 根密钥|有|取决于实现与部署方式|不要求存在一个协议强制的 EOA 根密钥|

这些区别可以分别从 ERC-4337 的提交结构、EIP-7702 的授权规则，以及 Starknet / OpenZeppelin 账户实现中核对。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-4337)

尤其要避免两个误解。

**第一，EVM 并非不能做 PQ 智能账户。** ERC-4337 已允许账户自行定义验证，差异是原生程度、基础设施与遗留账户迁移，而不是 EVM 无法计算 Falcon。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-4337)

**第二，7702 delegation 本身不等于退出 ECDSA 安全模型。** 7702 的授权仍通过 `ecrecover` 恢复 authority，原 EOA 密钥可以更改委托。因此，把一个 PQ verifier 放进委托代码，不会自动消除旧 EOA 根密钥的量子风险。[Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-7702)

### 2.3 现有 Starknet 账户并没有自动变成 PQ 账户

OpenZeppelin 当前普通 `AccountComponent` 的源码很直接：

- 保存 `Account_public_key`。
- `__validate__` 调用 `validate_transaction`。
- 验证当前 `transaction_hash` 与 `signature`。
- 默认签名检查最终走 Stark 曲线签名验证。[GitHub](https://raw.githubusercontent.com/OpenZeppelin/cairo-contracts/main/packages/account/src/account.cairo)

因此：

> **Native AA 提供更换锁的能力，不代表现有锁已经被更换。**

而且，“换密钥”和“换算法”也不是一回事。普通 `set_public_key` 仍然是在当前验证方案内更换公钥；改成 Falcon 需要新的账户验证实现。对已有账户能否保留地址升级，还取决于该账户是否设计了安全的升级路径。[GitHub](https://raw.githubusercontent.com/OpenZeppelin/cairo-contracts/main/packages/account/src/account.cairo)

### 2.4 它不是无限制 AA：验证预算、nonce 和入口隔离仍然重要

Starknet 的验证函数受到资源和调用限制，目的包括控制验证 DoS 与 mempool 污染。官方账户文档也明确写着：**协议级账户 nonce 仍是顺序递增的**，不能把 native AA 等同于已经实现 nonce abstraction。[Starknet Documentation](https://docs.starknet.io/learn/protocol/accounts)

OpenZeppelin 的 `__execute__` 还检查调用者必须为零地址，并验证交易版本，避免其他合约直接调用执行入口、绕过验证。这个例子说明：账户逻辑可编程的另一面，是账户实现需要自己维护关键安全不变量。[GitHub](https://raw.githubusercontent.com/OpenZeppelin/cairo-contracts/main/packages/account/src/account.cairo)

对 Mantle 来说，最值得学习的是**把授权规则做成可迁移的长期接口**，而不是把“支持多个签名算法”当成一次性功能。

---

## 三、STRK20 的隐私协议：在公开链上维护私有 notes，而非把整条链变成私密执行环境

### 3.1 先分清三个对象

Starknet 原生账户、STRK20 私有余额、Shadow Account 是三层不同的东西：

```
主钱包账户
    负责用户授权

STRK20 Privacy Pool
    托管实际代币
    用 notes 表示私有余额

Shadow Account
    在公开 DeFi 中持有仓位
    通过隐私协议获得执行授权
```

STRK20 的余额不是普通的 `balances[user]`，而是用户拥有的一组私有 notes。它没有因此把 Starknet 底层改成 UTXO 链，而是在合约层建立了 note-based 资产表示。[Starknet Documentation](https://docs.starknet.io/build/starkzap/privacy/strk20)

### 3.2 支出权限与查看权限是分开的

协议区分两类权限：

**账户签名权限**决定谁能授权花钱；**viewing key**用于发现、解密相关私有数据。拥有 viewing key 不等于拥有账户签名权，因此 auditor 能查看，不应因此能够签名支出。官方安全文档明确把这一点作为资金安全边界。[Starknet Documentation](https://docs.starknet.io/build/starknet-privacy/security)

注册过程会把用户的 viewing public key 关联到账户，并把 viewing private key 加密给 auditor。这意味着它不是“任何第三方都永远无法追踪”的模型，而是带有可审计披露能力的隐私协议。[Starknet Documentation](https://docs.starknet.io/build/starknet-privacy/compliance)

这里还要区分：

> Auditor 是否具备解密能力，是密码学事实；什么条件下允许使用该能力，是治理、密钥管理和操作流程问题。

不能仅凭“authorized auditing”的产品表述，就推导出链上密码学已经强制实现了所有法律授权条件。

### 3.3 一笔私有转账怎样被执行？

其核心不是针对每种转账写一个固定功能电路，而是利用 **virtual Starknet OS 执行及其证明**：

```
用户准备私有输入，并授权操作
    ↓
在虚拟 Starknet 执行环境中运行隐私合约逻辑
    ↓
检查 note 所有权、账户签名、余额守恒等
    ↓
生成公开 server actions 与执行证明
    ↓
relayer / paymaster 提交
    ↓
真实链上的 Privacy Pool 检查 proof facts
    ↓
应用公开状态变更
```

官方仓库说明了 virtual block / proving service 结构；实际链上入口则是 `Privacy.apply_actions`，而不是把含 viewing key 的私有输入直接当作普通公开交易 calldata。[GitHub](https://github.com/starkware-libs/starknet-privacy)

源码中的 `validate_proof` 会读取交易执行信息里的 `proof_facts`，检查虚拟 OS 类型、输出版本、基础区块是否过期，以及证明输出消息是否与当前 actions 匹配。**它依赖的是被协议验证的执行事实，而不是信任 prover 对结果的口头声明。**[GitHub](https://raw.githubusercontent.com/starkware-libs/starknet-privacy/main/packages/privacy/src/privacy.cairo)

### 3.4 Notes、nullifiers 和 discovery 分别解决什么？

`use_note` 会检查 note 所属子通道与用户身份、读取 note、解析金额，并生成 nullifier；真实执行时，相关一次性存储位置不能已经被使用。这是防止重复支出的关键。创建新 note 时则从相应 token 的内部记账余额扣除金额。[GitHub](https://raw.githubusercontent.com/starkware-libs/starknet-privacy/main/packages/privacy/src/privacy.cairo)

源码 `hashes.cairo` 对 channel、note ID、nullifier、身份派生使用了不同的 Poseidon domain tags。概念上可以写成：

\[ \text{noteId}=H_{\text{note}}(\text{channel},\text{token},\text{index}) \]\[ \text{nullifier}=H_{\text{nullifier}}(\text{channel},\text{token},\text{index},k_{\text{view}}) \]

这里省略了实际编码与额外字段，不能直接用作 SDK 的字节级实现。设计重点是：**公开的“已消费标记”与 note 的私有所有权之间，通过证明而不是公开身份关联建立联系。**[GitHub](https://raw.githubusercontent.com/starkware-libs/starknet-privacy/main/packages/privacy/src/hashes.cairo)

Discovery 则负责帮助用户发现属于自己的数据；它是可独立部署的服务，不是决定资金支出是否有效的共识主体。[Starknet Documentation](https://docs.starknet.io/build/starkzap/privacy/strk20)

### 3.5 隐私保证必须按观察者区分

官方安全文档承认了以下泄露边界：

|观察内容|保证或限制|
|---|---|
|普通私有 note 的金额|加密|
|deposit / withdrawal / open note|金额和 token 可公开|
|链上交易发送者|旁观者看到 paymaster；服务方可能看到 IP|
|新通道建立|接收者地址会在该发送者—接收者关系建立时暴露|
|Auditor|可解密注册用户的 viewing key，但不能因此签名支出|
|时间与金额模式|可以削弱匿名性|

因此，这不是“用了 ZK 就没有元数据泄露”。[Starknet Documentation](https://docs.starknet.io/build/starknet-privacy/security)

另外，官方 SDK 使用远程 proving / discovery，并提供 OHTTP 传输。**本次没有验证一套能向远程计算方隐藏完整见证的协议，因此不能把“对链上旁观者隐私”扩展成“对 prover 运营者也零信任隐私”。** 主网存款路径还涉及 screening 服务及相关接入条件，这也应纳入部署和可用性分析。[Starknet Documentation](https://docs.starknet.io/build/starkzap/privacy/strk20)

---

## 四、Shadow Account：通过私有授权控制公开、持久化的 DeFi 身份

### 4.1 它主要解决“仓位必须有稳定 owner”的问题

仅有私有转账池，还不足以自然支持长期 DeFi 仓位。

例如，用户把资产放进 vault 后，vault shares 需要由某个地址持续持有；如果使用主钱包，主钱包与仓位的关系就公开了。Shadow Account 的解决方式是：让一个**稳定但与主钱包不公开关联的合约地址**持有这些仓位。

官方 Vesu 演示正是如此：private mode 中，Shadow Account 持有 vault shares，退出时资金返回 shielded balance。[STRK20](https://strk20.starknet.io/docs/starknet-wallet-api/shadow-accounts)

因此，你说的 private subaccount 可以作为产品层理解；更精确的工程定义是：

> **通过隐私证明授权、由 anonymizer 控制执行的持久化 pseudonymous contract account。**

### 4.2 源码确认：Shadow Account 没有独立签名验证逻辑

隐私仓库引用的固定依赖 commit 为：

`3e2fd53d99e16c87f6cf2ced53b8c842a2d54a18`

该版本 `packages/accounts/src/shadow_account.cairo` 的核心逻辑是：

```
execute(calls):
    确认 caller == owner
    执行 calls
```

它保存的是 owner 合约地址，而不是用户公钥；它也不是靠自己的 `__validate__` 接受用户交易。[GitHub](https://raw.githubusercontent.com/starkware-libs/starkware-starknet-utils/3e2fd53d99e16c87f6cf2ced53b8c842a2d54a18/packages/accounts/src/shadow_account.cairo)

在整个体系里，owner 是 `ShadowAccountAnonymizer`；anonymizer 的执行入口又只接受配置好的 Privacy Pool 调用。于是授权链为：

```
用户账户授权
    → 私有执行证明
    → Privacy Pool
    → ShadowAccountAnonymizer
    → Shadow Account
    → 公开 DeFi 合约
```

公开某个 Shadow Account 的地址或 commitment，不会让任何人因此获得执行权。[GitHub](https://raw.githubusercontent.com/starkware-libs/starknet-privacy/main/packages/shadow_account_anonymizer/src/shadow_account_anonymizer.cairo)

### 4.3 地址如何稳定派生，同时不公开主钱包？

结合 `hashes.cairo` 和 anonymizer 源码，可以用以下概念公式表示：

\[ I=H_{\text{identity}}(U,k_{\text{view}},A) \]\[ P=H_{\text{Poseidon}}(I,D) \]\[ C=H_{\text{Poseidon}}(P,n) \]

其中：

- \(U\) 是主账户地址，\(k_{\text{view}}\) 是 viewing secret。
- \(A\) 是 anonymizer 地址。
- \(D\) 是 `dapp_name`，\(n\) 是用于区分身份的 nonce。
- \(P\) 是 partial commitment，\(C\) 是完整 identity commitment。

实际 Poseidon 调用与序列化应以代码为准；这组公式用于说明秘密输入和命名空间之间的关系。[GitHub](https://raw.githubusercontent.com/starkware-libs/starknet-privacy/main/packages/privacy/src/hashes.cairo)

秘密身份计算发生在私有执行路径里；链上 anonymizer 接收被证明绑定的 computation result，再通过它定位对应 Shadow Account。它不需要把主账户和 viewing secret 一起公开。[GitHub](https://raw.githubusercontent.com/starkware-libs/starknet-privacy/main/packages/privacy/src/privacy.cairo)

这里有个很容易踩坑的实现细节：

**确定性地址是按固定 `PRIMER_CLASS_HASH` 计算的，不是按最终 Shadow Account runtime class hash 计算。**

流程是先部署 Primer，再安装实际 Shadow Account class、初始化 owner。官方文档专门提醒：不能把 `get_shadow_account_class_hash` 的返回值直接代入离线地址派生。[STRK20](https://strk20.starknet.io/docs/starknet-wallet-api/shadow-accounts)

### 4.4 一次 vault 操作的完整生命周期

以私有资金进入公开 vault 为例：

**建立身份。** 钱包根据 `(user, dapp_name, nonce)` 取得 commitment，计算 Shadow Account 地址；尚未部署时可以按需部署。

**提供输入资产。** Privacy Pool 把本次使用的资产转到 Shadow Account，而不是主钱包直接给它打款。

**执行公开调用。** Anonymizer 驱动 Shadow Account 执行 approve、deposit 等普通合约调用，vault shares 留在 Shadow Account。

**回收输出。** 在需要把资产送回隐私池时，使用 open notes 接收输出；anonymizer 支持按全部余额、余额增量或指定金额回收。[STRK20](https://strk20.starknet.io/docs/starknet-wallet-api/shadow-accounts)

这个设计的价值是：**已有的公开 DeFi 合约不需要整体改造成私密状态机，也能承接与主钱包解绑的持续仓位。** 但公开 DeFi 操作本身不会因此变成秘密。

### 4.5 三个必须保留的隐私边界

**第一，Shadow Account 的内容公开。** ERC-20 余额、调用和仓位都可以观察；隐藏目标是它与主钱包的关系。[STRK20](https://strk20.starknet.io/docs/starknet-wallet-api/shadow-accounts)

**第二，稳定身份天然可关联。** 同一个 Shadow Account 的长期行为可以关联；获得 partial commitment 的应用，还能按 nonce 范围查询对应地址。多个 nonce 不是对该应用自动互不可关联。[STRK20](https://strk20.starknet.io/docs/starknet-wallet-api/shadow-accounts)

**第三，`dapp_name` 是身份命名空间，不是调用 ACL。** 从源码接受任意 `Array<Call>` 的方式看，不能把“为某 dapp 派生”解释成“只能调用这个 dapp”。后者需要钱包、会话权限或额外授权逻辑保证。这是从实现得出的安全边界，而不是对某个已部署漏洞的指认。[GitHub](https://raw.githubusercontent.com/starkware-libs/starknet-privacy/main/packages/shadow_account_anonymizer/src/shadow_account_anonymizer.cairo)

---

## 五、密码学到底选了什么：需要逐组件检查，不能只看 STARK

### 5.1 STARK 的优势来自证明构造，不来自“所有相关算法都抗量子”

Starknet 的证明层使用 hash-based commitments、Merkle 结构、Fiat–Shamir，以及 FRI 类低度检验，而不是把证明安全建立在椭圆曲线离散对数或 KZG 上。S-two 的官方技术说明也围绕这类多项式承诺和证明流程展开。[StarkWare Quantum Hub](https://quantum.starkware.co/foundations)

这使它避免了证明层的一大类迁移负担，但不能推出以下错误结论：

```
STARK 证明了 ECDSA 验证程序执行正确
    ≠
ECDSA 签名因此变得抗量子
```

如果量子攻击者能够伪造 ECDSA 签名，正确执行的验签程序仍然会接受它；STARK 只是证明该程序确实按规则运行。官方 Quantum Hub 也明确区分 proof system 和 account signature。[StarkWare Quantum Hub](https://quantum.starkware.co/learn)

同样，使用 hash-based 系统不等于无条件安全。最终保证仍依赖具体 hash、参数、安全模型和实现，不能只凭“256 位 hash”就推导统一的量子安全位数。[StarkWare Quantum Hub](https://quantum.starkware.co/foundations)

### 5.2 为什么路线图要把 Pedersen 换掉？

Starknet 历史上在状态、地址与存储相关路径中使用 Pedersen。它虽然名字叫 hash，但构造依赖椭圆曲线关系，不能因为它也是“哈希函数”，就与 BLAKE2 视为同一类 PQ 安全基础。

官方路线图分别提出状态树、地址派生、链环境等路径的替换，同时把**旧合约内部 storage map 的迁移**单独列为工作项。[StarkWare](https://starkware.co/blog/the-architecture-advantage-starknets-quantum-readiness-roadmap/?utm_source=chatgpt.com)

这一拆分很重要：

```
状态树使用什么 hash
    ≠
合约通过什么公式计算某个 storage slot
    ≠
合约地址如何派生
    ≠
程序 / class 的 hash 如何计算
```

升级状态树，不会自动改写所有既有合约中计算存储位置的逻辑。也不能把某个 class hash 或 OS hash 已切换到 BLAKE2，解释成全链 Pedersen 依赖已经消失。[StarkWare Quantum Hub](https://quantum.starkware.co/migration-register)

### 5.3 Falcon-512 为什么适合先落到账户层？

Falcon 是基于格的签名方案。对这里的实现，可在

\[ R_q=\mathbb{Z}_{12289}[x]/(x^{512}+1) \]

中理解公钥与短向量关系。把两个签名相关向量记作 \(s_0,s_1\)，验证器的核心工作可以概括成检查：

\[ s_0+s_1h=c\pmod q \]

以及相应向量满足范数约束；\(c\) 由消息的 hash-to-point 生成。这里的记号为解释用途，不对应固定的 ABI 字段名。[GitHub](https://raw.githubusercontent.com/OpenZeppelin/cairo-pq-verifiers/main/crates/falcon_512/README.md)

它适合这一场景的原因是：签名、公钥相对紧凑，验证可以围绕整数运算、NTT 与范数检查实现；Cairo 侧可以优化这些计算，而不必把复杂的签名生成过程也放上链。[Falcon Sign](https://falcon-sign.info/)

OpenZeppelin 的实现还提供 hint / direct 两类路径：

- **hint**：附带某个乘积结果，由验证器检查其正确性，减少昂贵计算。
- **direct**：验证器自行计算，减少额外输入，但计算成本更高。

hint 是“提供一个可验证的计算结果”，不是“相信签名者提供的答案”。[GitHub](https://raw.githubusercontent.com/OpenZeppelin/cairo-pq-verifiers/main/crates/falcon_512/HINT_VS_DIRECT.md)

### 5.4 最大的辨析点：不同“Falcon”实现未必使用相同标准算法

OpenZeppelin 仓库明确区分：

|变体|hash-to-point|标准兼容性|
|---|---|---|
|SHAKE-256|Falcon 标准算法所用路径|对应标准 Falcon signer|
|BLAKE2s|为执行环境优化的替换路径|非标准变体|
|Poseidon|原生 field-friendly 路径|非标准变体|

S2morrow 的实现也使用了 Poseidon hash-to-point。因此不能拿最快的 Poseidon 结果，直接宣称“标准 Falcon 在 Starknet 上就是这个成本”。[GitHub](https://raw.githubusercontent.com/OpenZeppelin/cairo-pq-verifiers/main/crates/falcon_512/README.md)

另一个需要纠正的术语是 **NIST 标准化状态**：本次核对的 NIST 页面仍把 Falcon 对应的 **FIPS 206**标记为 _in development_。因此，“使用 Falcon 候选算法”“兼容 Falcon 规范”和“已符合最终 FIPS 206 标准”应分开写。[NIST Computer Security Resource Center](https://csrc.nist.gov/Projects/Post-Quantum-Cryptography/Post_Quantum_Cryptography-Standardization)

### 5.5 成本已经足以部署，但远不是默认 ECDSA 的成本

OpenZeppelin 的 `efficiency_baseline.json` 给出了以下账户 `__validate__` 基准：

|验证方案|L2 resource gas|Cairo steps|
|---|---|---|
|Stark-ECDSA|160,795|1,437|
|Falcon / Poseidon|13,615,909|111,950|
|Falcon / BLAKE2s，hint|14,380,100|119,124|
|Falcon / SHAKE-256，hint|51,733,728|327,157|
|Falcon / SHAKE-256，direct|61,878,938|427,598|

这些是仓库报告的基准，不是我在本次环境复跑的结果。其工具链记录为 Scarb 2.18.0、snforge 0.59.0。[GitHub](https://raw.githubusercontent.com/OpenZeppelin/cairo-pq-verifiers/main/efficiency_baseline.json)

仓库说明的验证上限是 100,000,000 L2 gas 和 1,000,000 steps，因此连标准 SHAKE 路径也能进入现有限额。但这些 resource measurements **不等于用户最终交易 receipt 的收费口径**；仓库本身还明确标注实验性、未经独立安全审计。[GitHub](https://raw.githubusercontent.com/OpenZeppelin/cairo-pq-verifiers/main/README.md)

所以可验证的结论是：

> **PQ 账户不再只是算法设想，已经具有可部署实现和资源可行性；但成本、标准兼容性和审计成熟度仍需分别评估。**

---

## 六、最值得 Mantle 注意的交叉问题：当前隐私实现仍有明确的非 PQ 依赖

### 6.1 STRK20 源码仍使用 Stark 曲线 ECDH

`packages/privacy/src/utils.cairo` 的 `_compute_shared_x` 写得非常清楚：

\[ R=rG \]\[ S=rK_{\text{recipient}}=k_{\text{recipient}}R \]

它发布临时公钥，使用共享点的 x 坐标生成加密材料；channel 信息以及给 auditor 的密钥加密都涉及这类椭圆曲线机制。[GitHub](https://raw.githubusercontent.com/starkware-libs/starknet-privacy/main/packages/privacy/src/utils.cairo)

因此，**STARK 证明是 PQ-friendly，并不能让被它证明的 ECDH 加密自动抗量子。**

在足够强的量子攻击模型下，这里存在“先收集、后解密”的历史保密风险。未来迁移到 PQ 密钥封装，也不能撤回已经被公开记录、收集的旧密文。这个结论来自当前 ECDH 构造和离散对数量子威胁的组合，而不是说今天已有可行设备完成了攻击。[GitHub](https://raw.githubusercontent.com/starkware-libs/starknet-privacy/main/packages/privacy/src/utils.cairo)

### 6.2 影响可能不只限于转账金额，也包括 Shadow 身份关联

这是结合源码可以进一步得到的推论：

Shadow identity 派生包含 `user_addr` 与 `viewing secret`。如果未来 viewing secret 被恢复，在知道或能枚举 `dapp_name` 与 nonce 的条件下，就可以重新计算相应 commitments 和 Shadow 地址。

因此，**viewing-key 安全性也是 Shadow Account 不可关联性的一部分**，而不只是私有余额的查看权限。[GitHub](https://raw.githubusercontent.com/starkware-libs/starknet-privacy/main/packages/privacy/src/hashes.cairo)

这并不证明未来 PQ L1 目标不可实现；它说明的是：

> **基础链 PQ、账户支出 PQ、隐私数据 PQ、匿名身份关联保护，需要分别迁移。**

### 6.3 只升级 `__validate__` 还不够

这是本次源码核对中最适合直接加入 Mantle 检查清单的一点。

STRK20 的 `assert_valid_signature` 不是简单调用用户账户的交易验证入口，而是尝试多条授权路径，包括：

```
is_custom_signature_valid(...)
或
is_valid_signature(tx_hash, ...)
或
is_valid_signature(legacy CallSet hash, ...)
```

源码明确说明，满足任意一条即可。[GitHub](https://raw.githubusercontent.com/starkware-libs/starknet-privacy/main/packages/privacy/src/utils.cairo)

因此，可能出现一种迁移失误：

```
__validate__ 已改成 PQ
但 is_valid_signature 或恢复模块仍接受传统签名
```

这种情况下，某些应用授权依然可能通过传统签名路径完成。**这是需要检查的潜在迁移风险，不是本次确认某个已部署 PQ 钱包存在漏洞。**

对 EVM 体系，同样应把 ERC-1271、session keys、permit、恢复和升级权限纳入完整认证图，而不能只检查交易入口。

---

## 七、为什么 Starknet 可能比 Ethereum 更快？以及转 L1 增加了什么工作？

### 7.1 它少了一部分迁移工作，但并不是没有迁移工作

Starknet 的优势可以归纳为：

**证明系统不用整体换轨。** 它已经采用不依赖椭圆曲线困难性的 STARK 证明构造。

**新账户可以独立采用新验证器。** 不必等协议为每一种 PQ 签名定义新的专用交易签名规则。

**可控组件与外部组件比较容易分开。** 官方路线图把内部替换、旧部署迁移、Ethereum-facing 依赖分别列出，而不是把所有事情归结成一个“PQ hardfork”。[StarkWare Quantum Hub](https://quantum.starkware.co/foundations)

这是“可能更快”的工程基础，**不是对 2027 年完整交付的证明**。

### 7.2 L1 转型改变的是依赖边界，不会自动补齐安全

继续作为 rollup，Starknet 可以升级自己的账户和内部密码学，也可以通过 calldata fallback 避开 blob 路径的 KZG 依赖。但只要最终安全仍继承 Ethereum，就不能仅凭 L2 自身升级消除全部 Ethereum-facing 风险。[StarkWare Quantum Hub](https://quantum.starkware.co/migration-register)

成为独立 L1 可以把这些升级时间表收回自身控制，但也意味着需要自行提供完整答案：

|原来依赖或继承的部分|独立 L1 必须明确的新保证|
|---|---|
|Ethereum 结算与最终性|自身 fork choice、最终性与安全恢复机制|
|Ethereum 数据可用性|自身 DA、验证和故障处理|
|外部共识安全|PQ 共识认证、验证者与治理密钥|
|既有桥接资产|外部资产托管与桥的安全边界|
|旧状态与用户|可验证的迁移、退出和兼容流程|

这是架构推论：**去掉外部依赖，不等于原依赖提供的保证无需替代。**

官方旧路线图对共识签名的表述是采用“如 Falcon-512”这样的 PQ 方案，不能据此认定独立 L1 共识的最终算法、聚合方案与部署配置都已完成。[StarkWare](https://starkware.co/blog/the-architecture-advantage-starknets-quantum-readiness-roadmap/?utm_source=chatgpt.com)

特别是，某条原生 PQ L1 上的资产若仍由 Ethereum 桥托管，**该资产的端到端安全不会因为目的链的 PQ 标签而自动摆脱源链风险**。

### 7.3 Ethereum 的难点也不只是换掉 EOA ECDSA

EF 的路线图覆盖账户、共识、数据层，并且明确指出完整经济最终性仍需要 PQ attestations；minimum viable 路径只是较弱保证下的临时防线。其账户路线也在追求可编程验证与退役传统根密钥，而非简单等到 2029 年才允许一个 PQ verifier 运行。[Ethereum Blog](https://blog.ethereum.org/2026/09/07/protocol-priorities)

因此，我会把两者差异表述为：

> **Starknet 可能有更小的迁移负担和更短的协调路径；Ethereum 的目标覆盖其既有三层系统和完整安全保证。两年的日期差距不能直接换算成两年的密码学技术领先。**

---

## 八、给 Mantle 的结论与验证标准

### 8.1 最值得借鉴的是两种解耦

**账户身份与认证算法解耦。** 让账户成为可以长期迁移的权限容器，而不是永远绑定某条曲线的公钥。

**公开应用状态与主钱包身份解耦。** Shadow Account 证明了一种产品路线：不必先建设全私密 DeFi VM，也可以通过隐私授权和持久化伪名身份，让现有公开 DeFi 承接更好的隐私体验。其代价是仓位与行为仍公开，不能包装成 confidential execution。[StarkWare Quantum Hub](https://quantum.starkware.co/migration-register)

对 Mantle 的适用性应分开评估：可编程认证、隐私池、受控子账户这些模式可以借鉴；但 STRK20 使用的 virtual SNOS、proof facts 和 Cairo 执行证明接口，不是直接复制合约就能移植到 EVM 的能力。[GitHub](https://github.com/starkware-libs/starknet-privacy)

### 8.2 “已经形式化验证”也要检查验证对象

StarkWare 已公开 STRK20 的 Lean 形式化开发，覆盖协议状态机的 note 所有权、双花防护、守恒、可发现性等性质。官方同时明确区分：**形式化验证的是协议，Cairo 实现由另外的审计覆盖。**[StarkWare](https://starkware.co/blog/strk20-formal-verification/)

这类证据很有价值，但不应被扩大成“某个最新部署已经经过端到端机器证明”，更不能用于证明 ECDH 已经抗量子。

### 8.3 我建议用以下验收标准判断“2027 PQ L1”是否真正兑现

|验证项|应要求的确定性证据|
|---|---|
|全栈密码学清单|每个 hash、签名、承诺、密钥交换和管理权限对应的算法、参数、代码位置|
|主网激活|固定版本、治理执行、激活区块、可复现构建与实际运行配置|
|认证路径完整迁移|交易验证、应用验签、恢复、升级、会话和治理路径均无遗漏|
|旧状态与资产迁移|地址和 storage 兼容方案、不可升级合约处理、桥接资产安全说明|
|独立 L1 安全|共识、最终性、DA、验证者管理、故障恢复的规范与测试|
|隐私单独验收|ECDH 替换、历史密文风险、prover / auditor 信任边界、Shadow 不可关联性分析|

**最终结论：**

Starknet 的底气主要来自 **STARK 证明层的设计选择，以及原生账户抽象提供的密码学可替换性**。Falcon 的可部署实现说明账户层迁移已经走出纯研究阶段；但旧账户、状态与地址哈希、存储迁移、共识、桥以及隐私加密，是不同的工程项目。[StarkWare Quantum Hub](https://quantum.starkware.co/migration-register)

所以，给 Mantle 团队最稳妥的表述不是“Starknet 已确定领先 Ethereum 两年”，而是：

> **Starknet 已展示出更低的 PQ 迁移阻力；2027 年全栈 PQ L1 是否成立，仍要由独立 L1 规范、完整依赖迁移和主网激活证据证明。与此同时，当前 STRK20 / Shadow Accounts 的隐私安全不能借用基础链的 PQ 叙事，必须单独评估。**

这条路线图值得按周跟踪主网激活、审计和迁移工具的进展；需要设置这样的更新提醒吗？
---
imported_from: ChatGPT Deep Research
imported_at: 2026-10-09
original_file: bsc-development-research.md
---

你的两个观察都抓到了 BSC 这一轮开发的重点。不过，准确地说：

**CAS20 确实有直接参考 Base B20 的代码证据，更适合称为“B20 路线在 BSC 上的适配和再实现”；Payment Lane 则与 Tempo 属于同一类“为支付保留执行容量”的设计，但没有移植 Tempo 的整套支付链架构。** 前者的依据不仅是功能相似：BSC 早期代码直接引用过 `base-std`、`IB20`，并将 B20 的地址前缀称为参考实现。后者需要特别注意规范迭代：当前 BSC 方案已经不是早期博客描述的“根据拥堵动态调整预留空间”。[GitHub](https://github.com/bnb-chain/bsc/commit/57d98c2)

以下以 **2026 年 10 月 9 日**为时间截点，重点覆盖最近几个月的协议、客户端及相关应用层开发。内容来自公开规范、源码和 PR 审阅；性能数据会标明项目方报告口径，不视为我自行复现的压测结果。

---

# 一、先确定开发状态：代码合并，不等于主网已经启用

你发现的 CAS20 和 Payment Lane 都属于 **Jenner** 升级范围。官方目前给出的计划是：**测试网 2026 年 10 月下旬、主网 11 月下旬**，具体时间与正式硬分叉版本尚未公布。Jenner 还包括毫秒时间戳预编译和缩短备用验证者等待时间。[BNB Chain](https://docs.bnbchain.org/announce/jenner-bsc/?utm_source=chatgpt.com)

|方向|已确认的开发状态|应如何理解|
|---|---|---|
|**CAS20 / BEP-702**|Go 客户端主要实现 `bsc#3813` 于 9 月 11 日合并；Rust 实现 `reth-bsc#512` 于 9 月 24 日合并|已有双客户端实现，等待 Jenner；资产创建还受独立功能开关控制|
|**Payment Lane / BEP-703**|Go 实现 `bsc#3793` 于 9 月 11 日合并；Rust 实现 `reth-bsc#497` 于 9 月 23 日合并|已进入客户端代码，但不能视为当前主网已经提供支付预留空间|
|**毫秒时间戳 / BEP-706**|列入 Jenner|给合约开放现有区块头中的毫秒时间|
|**备用验证者等待时间 / BEP-714**|列入 Jenner|初始 backoff 从 2 秒降到 1 秒，不是再次缩短正常出块间隔|
|**Builder Blind Signing / BEP-675**|已在主网采用；Jenner 同期版本继续增强|核心机制本身不需要硬分叉，主要改变出块前的执行流水线|
|**Unified PropAMM Relayer / BAP-710**|应用层草案|不是共识升级，也不是 Payment Lane|

前两项的实现进度可在对应合并 PR 中核对；CAS20 与 Payment Lane 已经不只是概念提案。[GitHub](https://github.com/bnb-chain/bsc/pull/3813) 其余项目的升级范围、上线背景和应用层定位，分别由 Jenner 公告、Pasteur 回顾和 BAP-710 明确说明。[BNB Chain](https://docs.bnbchain.org/announce/jenner-bsc/?utm_source=chatgpt.com)

---

# 二、CAS20：把资产发行与管理能力下沉到客户端

## 2.1 与 Base B20 到底是什么关系？

**你的直觉基本正确：它不是与 B20 恰好相似、但独立设计的一套东西。**

最直接的证据是 BSC commit **`57d98c2`**。这个提交修改了几处注释与测试描述：

- 将 `base-std` 发布的常量改称“标准发布的常量”。
- 将注释中的 `IB20` 改成 `ICAS20`。
- 将 B20 地址前缀的描述，从“参考实现的前缀”改成“相邻前缀”。

这些变更足以证明开发过程中存在对 B20 / `base-std` 的直接参考。但仅凭这些证据，还不能把它描述成“把 Base 的整个实现逐行 fork 过来”。[github.com](https://github.com/bnb-chain/bsc/commit/57d98c2)

架构上的继承也很明显：Base B20 同样采用 **Asset / Stablecoin 两种变体、Factory、Activation Registry、Policy Registry、编码在地址中的类型信息，以及工厂创建时的 `initCalls`**。CAS20 延续了这套模型，再适配 BSC 的地址空间、治理入口、客户端执行环境和硬分叉流程。[Base documentation](https://docs.base.org/upgrades/beryl/b20)

工程实现关系则更清楚：**BSC 先有 Go 参考实现，`reth-bsc#512` 明确是在移植并对齐 Go 版本的行为**，包括后续修复，而不是声称直接照搬 Base 的 Rust 实现。[GitHub](https://github.com/bnb-chain/reth-bsc/pull/512)

因此，我会这样定义：

> **CAS20 是一套直接借鉴 B20 设计、在 BSC 双客户端中实现的协议原生资产标准。**

## 2.2 它不是“更快的 ERC-20 transfer”，而是一个原生资产平台

普通 ERC-20 的结构是：

```
发行方部署 Solidity 合约
          ↓
用户调用 token.transfer(...)
          ↓
EVM 执行该地址的字节码
          ↓
更新合约 storage，产生事件
```

CAS20 则变成：

```
发行方通过 CAS20 Factory 创建资产
          ↓
用户仍调用 token.transfer(...)
          ↓
客户端识别 CAS20 地址，进入原生执行实现
          ↓
原生代码执行权限、策略、余额及 gas 检查
          ↓
更新该 token 地址的链上 storage，产生事件
```

它保留 ERC-20 风格的调用接口，但将资产逻辑放进节点实现，而不是为每个资产部署一份完整业务字节码。**资产状态仍然在链上，仍然参与状态根计算；不是客户端私有数据库中的账本。**[GitHub](https://github.com/bnb-chain/bsc/pull/3813)

CAS20 的两种变体分工如下：

|变体|定位|特有能力|
|---|---|---|
|**Asset**|通用资产、代币化证券等|可配置 6–18 位小数；显示数量 multiplier；公告、批量发行、扩展元数据|
|**Stablecoin**|稳定币|固定 6 位小数；不可变的币种代码|
|**共同底座**|标准化发行和管理|ERC-20 接口、permit、角色权限、暂停、供应上限、转移策略、memo 等|

创建时会验证不同变体的参数。但 Stablecoin 的币种代码是发行方声明，**不是协议对储备、赎回能力或监管资质的认证**。[GitHub](https://raw.githubusercontent.com/bnb-chain/bsc/develop/core/vm/cas20_factory.go)

## 2.3 为什么必须是 stateful precompile？

传统的哈希、签名验证预编译，主要处理“输入 → 计算 → 输出”。CAS20 则需要：

读取和修改余额、allowance、角色及策略；识别调用者；遵循 `STATICCALL` 的只读限制；产生日志；在失败时回滚；按实际访问的状态收费。

因此，BSC 不只是增加一个预编译地址，还增加了 **stateful precompile 的执行上下文与接入层**，核心文件包括：

```
core/vm/contracts_stateful.go
core/vm/evm.go
core/vm/cas20*.go
```

其中上下文把 StateDB、调用者、目标地址、调用类型、gas 和日志能力交给原生实现。只读调用不能写状态，携带 BNB 的调用会被拒绝，`DELEGATECALL` / `CALLCODE` 也不能像普通库合约那样使用 CAS20。[GitHub](https://raw.githubusercontent.com/bnb-chain/bsc/develop/core/vm/contracts_stateful.go)

这里的关键不是“原生代码能读写状态”本身，而是：

> **原生代码必须重新实现所有原本由 EVM 指令执行过程自然提供的语义约束。**

漏掉只读检查、gas refund、access-list warming、回滚或 tracing 中任何一项，都可能造成兼容性问题，甚至不同客户端状态根不一致。

## 2.4 创建一个 CAS20 资产的完整流程

CAS20 使用工厂创建，不是用户随便向某个地址放入代码就能获得原生资产身份。

其 token 地址具有固定结构：

```
[10-byte CAS20 prefix]
[1-byte variant]
[9-byte creator/salt hash fingerprint]
```

前缀以 `0xCA52` 开头，类型字节区分 Asset 和 Stablecoin；地址由创建者与 salt 确定性派生。工厂则处于独立的 `0xCA5F…` 地址空间。[GitHub](https://raw.githubusercontent.com/bnb-chain/bsc/develop/core/vm/cas20_factory.go)

一次创建大致经过以下步骤：

```
检查该资产变体是否已激活
    → 解码并验证创建参数
    → 派生 token 地址，检查是否已占用
    → 写入资产身份、元数据和初始状态
    → 产生 CAS20Created
    → 设置初始管理员
    → 执行 initCalls
    → 成功完成；中途失败则回滚
```

`initCalls` 允许发行方在同一笔创建交易里完成角色分配、策略绑定等配置。值得注意的是，9 月的后续修复专门纠正了两个细节：**创建事件必须先于初始化事件；初始化调用的 `msg.sender` 必须是 Factory，而不是冒用创建者。** 这是很实质的权限语义修正，不只是日志美化。[GitHub](https://github.com/bnb-chain/bsc/pull/3826)

实现还会在 token 账户写入一个 **`0xEF` 标记字节**。它不是 token 的业务字节码，作用包括避免账户被当作空账户清理，以及让工具看到该地址具有代码。真正的业务执行仍由客户端路由到原生实现。[GitHub](https://raw.githubusercontent.com/bnb-chain/bsc/develop/core/vm/cas20_factory.go)

## 2.5 合规能力如何工作：角色、策略、执行路径是三层不同的东西

CAS20 的合规控制不是一个统一的“黑名单开关”。

**角色回答“谁可以操作”。**  
例如，谁可以发行、销毁、暂停、更新元数据或执行资产扣押。

**策略回答“哪些地址允许参与某类操作”。**  
发送方、接收方、代为执行转账的 spender、铸币接收方等可以绑定不同策略；共享 Policy Registry 让多个资产复用名单与策略，而不必各自维护一份。[GitHub](https://raw.githubusercontent.com/bnb-chain/bsc/057868dc17fde98fcecee6a59c472eeb05faf576/core/vm/cas20_admin.go)

**具体执行路径决定“这次调用检查什么”。**  
以 `transferFrom(Alice, Bob, amount)` 为例，其处理逻辑包括 allowance、spender 的执行资格、发送方和接收方策略、暂停状态、余额及最终状态更新。`approve` 与转账不是同一条权限路径，不能假定转账受限就意味着所有 ERC-20 方法都一起被禁用。[GitHub](https://raw.githubusercontent.com/bnb-chain/bsc/develop/core/vm/cas20_token.go)

扣押能力也有明确边界。当前实现要求对应角色，并检查扣押暂停状态、接收方策略、余额，以及持有人是否被 **`SEIZE_EXEMPT_POLICY`** 豁免。9 月 23 日的 `bsc#3829` 就是把原来的 scope 名称改成这个更准确的名称；它授权的是“免于扣押的持有人”，不是“可扣押的人”。[GitHub](https://raw.githubusercontent.com/bnb-chain/bsc/057868dc17fde98fcecee6a59c472eeb05faf576/core/vm/cas20_admin.go)

由此有两个重要结论：

**第一，这些是发行资产自身的管理能力，不是任意冻结所有 BSC 资产的通用按钮。** 不应把 CAS20 的 seizure 理解成可以直接控制 BNB 或任意现有 ERC-20。

**第二，“标准支持合规控制”不等于“所有 CAS20 都采用相同限制”。** 最终可转移性取决于资产自己的角色和策略配置。对 DEX、Lending、托管和跨链系统而言，资产准入仍需要逐个评估。

## 2.6 Asset multiplier：不要把显示数量变化理解成凭空产生收益

Asset 变体提供的 multiplier，核心是把 **底层 raw amount** 与 **显示数量** 分开：

\[ \text{scaledAmount} = \left\lfloor \frac{\text{rawAmount}\times \text{multiplier}}{10^{18}} \right\rfloor \]

例如，忽略 decimals 展示换算，raw amount 为 100、multiplier 从 1.00 调整为 1.02，那么显示数量可以从 100 变成 102，但不需要遍历所有持有人、逐个修改余额。代码提供 `scaledBalanceOf`、转换方法及 ERC-8056 风格的 UI amount 接口。[GitHub](https://raw.githubusercontent.com/bnb-chain/bsc/develop/core/vm/cas20_asset.go)

这适合表达某些资产的数量调整、份额显示或企业行动，但要分清：

> **显示单位变化，不自动改变底层经济价值，也不会自动让所有使用 raw amount 的 DeFi 协议按新显示单位记账。**

钱包、报价器和风控系统必须知道自己正在处理 raw amount 还是 UI amount。Base B20 也在向 ERC-8056 的显示数量与定时 multiplier 接口演进，这进一步体现出两者的共同设计路线。[Base documentation](https://docs.base.org/upgrades/beryl/b20)

## 2.7 Gas、性能和兼容性：收益来自哪里，风险又在哪里？

**CAS20 没有把状态操作变成免费操作。**

原生实现仍然显式模拟冷/热账户访问、storage 写入、清理退款、哈希与日志等收费。`cas20_gas.go` 中甚至专门重建了 EIP-2200 的 storage 写入检查，以及 EIP-2929 / EIP-3529 相关行为。它主要省去的是字节码解释和部分执行开销，而不是取消状态访问成本。[GitHub](https://raw.githubusercontent.com/bnb-chain/bsc/057868dc17fde98fcecee6a59c472eeb05faf576/core/vm/cas20_gas.go)

因此，在 commit 中看到 `RequiredGas()` 返回零时，不能得出“这个预编译零 gas”的结论：**动态 gas 在 `RunStateful` 内部计量。**[GitHub](https://raw.githubusercontent.com/bnb-chain/bsc/develop/core/vm/cas20.go)

另一个难点是工具兼容。普通 tracer 通过观察 EVM opcode 来发现 storage 访问；CAS20 没有执行这些 opcode，就需要额外把原生读写送入 tracing、access-list 和 RPC override 路径。BSC 已为此增加专门适配，也提供了 `eth_getCAS20TokenInfo` 等查询接口。[GitHub](https://github.com/bnb-chain/bsc/pull/3813)

我的技术判断是：它以减少重复资产逻辑、统一行为和提升执行效率为收益，换来了**更大的客户端责任范围**。普通 token 的代码漏洞通常局限于该合约；原生 token 实现的漏洞可能同时影响整个资产家族。

目前也不宜给出“已充分证明可以提升多少 TPS”的结论。Rust PR 虽然有微基准和跨客户端测试，但明确写出：**激活前需要的 adversarial / full-block timing measurements 不在该 PR 的验证范围内。**[GitHub](https://github.com/bnb-chain/reth-bsc/pull/512)

## 2.8 一个容易漏掉的上线条件：硬分叉之外还有功能开关

CAS20 的可用性不只取决于 Jenner 时间。

Activation Registry 采用两层权限：BSC 治理通过 `updateParam("admin", …)` 任命管理员，再由管理员激活具体 feature。Asset、Stablecoin 和 Policy Registry 有各自的 feature 标识。[GitHub](https://raw.githubusercontent.com/bnb-chain/bsc/057868dc17fde98fcecee6a59c472eeb05faf576/core/vm/cas20_activation.go)

而且，**关闭某个创建功能，不等于把此前发行的 token 全部暂停**。功能门控与资产本身的 pause / policy 是不同控制面。因此，你的 bot 应把“实现合并”“硬分叉启用”和“治理/管理员激活”分开追踪。[GitHub](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-702.md)

---

# 三、Payment Lane：不是另一条执行链，而是一个共识级 gas 约束

## 3.1 当前方案与早期介绍有明显差异

9 月 1 日的官方博客描述过一种根据拥堵扩张、收缩预留空间的方案。但当前 BEP-703 的设计是：

**每个区块按照治理配置的比例，预留支付容量；默认 5%，协议硬上限 10%。**

它不增加独立支付交易格式，不增加新的交易排序规则，也不引入独立的支付手续费市场。当前规范中的配额由所有节点自行计算，不需要一个新的 `PaymentGasLimit` 区块头字段。[BNB Chain](https://www.bnbchain.org/en/blog/bsc-payment-lane-reserved-blockspace-that-keeps-payments-moving?utm_source=chatgpt.com)

所以，不能把早期博客中的“动态调整”继续当作最终实现来讲。

## 3.2 什么交易算 payment？分类器比“稳定币转账”这个说法更宽，也更窄

Go 代码中的分类器可以概括为：

```
系统交易、创建合约交易、非 type 0/1/2
    → General

否则，如果顶层 to 在治理支付名单中
    → Payment

否则，如果 value > 0，且接收地址在当前执行状态下没有代码
    → Payment

其余
    → General
```

这对应 `core/paymentlane/classify.go` 的实际检查顺序。[GitHub](https://raw.githubusercontent.com/bnb-chain/bsc/develop/core/paymentlane/classify.go)

这里有几项很影响产品集成的细节。

**它按目标地址分类，不按 `transfer` selector 分类。**  
对一个已列入名单的 token 地址调用 `approve` 或其他方法，同样可能被归入 Payment；协议并没有解析“这笔交易在商业意义上是不是支付”。[GitHub](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-703.md)

**它看顶层 `to`，不递归分析内部转账。**  
用户调用未列入名单的 Router，由 Router 再调用 USDT 转账，不会因为内部发生稳定币转移就自动进入支付通道。智能账户、批量支付、账户抽象流程也必须按真实交易入口分析。[GitHub](https://raw.githubusercontent.com/bnb-chain/bsc/develop/core/paymentlane/classify.go)

**它没有自动接纳所有 CAS20。**  
支付合约名单在 fork 时为空，之后由治理添加。USDT、USDC 是预期的首批候选，不是规范中已经预装的地址。CAS20 资产也仍需判断其发行方配置是否适合支付用途。[GitHub](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-703.md)

由此可见，Payment Lane 是一个**治理选择服务对象的资源保障机制**，不是所有“看起来像支付”的调用都能获得保障。

## 3.3 配额规则：用一个不等式就能说明白

定义：

- \(G\)：区块 gas limit。
- \(P\)：支付交易实际消耗的 gas。
- \(N\)：其他交易实际消耗的 gas。
- \(Q\)：这个区块为支付保留的 quota。

当前规范的有效性条件是：

\[ \boxed{N+\max(P,Q)\le G} \]

配额则由父区块状态中的比例计算：

\[ Q_h = \left\lfloor \frac{r_{h-1}\times G_h}{10000} \right\rfloor \]

默认 \(r=500\)，即 5%。客户端的 budget 模块负责在选交易时做容量判断，并对完成的区块检查相同的最终约束。[GitHub](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-703.md)

这个公式等价于同时满足：

\[ N+P\le G \quad\text{且}\quad N\le G-Q \]

也就是：总 gas 不能超限，同时普通交易不能吃掉支付保留的那部分容量。

用一个**假设的 100M gas 区块**演示，不代表当前主网 gas limit：

|支付 gas \(P\)|普通 gas \(N\)|是否满足规则|原因|
|---|---|---|---|
|2M|95M|是|3M 支付配额闲置，总使用量只有 97M|
|0|96M|否|即使没有支付交易，普通交易也不能占满预留空间|
|8M|92M|是|支付可以超过 5M 配额，使用共享的剩余空间|
|8M|95M|否|总使用量超过 100M|

**最重要的理解是：5% 是为支付保留的容量，不是支付最多只能使用 5%。**

反过来，支付需求不足时，闲置的保留容量**不会归还给普通交易**。这是有意为之：否则出块者可能通过不纳入支付，把容量卖给高收益的一般交易，削弱“预留”的含义。[GitHub](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-703.md)

## 3.4 为什么有的东西读 parent state，有的读 live state？

这部分是实现上最值得学习的地方。

**名单和预留比例读取父区块的 post-state。**  
因此，治理在区块 \(h\) 中修改名单或比例，不会改变同一个区块内后续交易的分类规则，而是从下一个区块开始生效。生产者在构建区块前就能知道本区块配额。[GitHub](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-703.md)

**但 BNB 接收地址是否有代码，必须读取交易执行前的实时状态。**

假设同一区块前一笔交易给某个地址部署了代码，后一笔交易向该地址发送 BNB。如果仍按 parent state 中“没有代码”分类，就可能把实际会执行任意合约逻辑的交易塞进支付通道。EIP-7702 在前序交易中安装 delegation code 也有类似问题。[GitHub](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-703.md)

因此，执行流水线是：

```
载入父区块中的治理配置
        ↓
确定本区块 quota 与支付名单
        ↓
逐笔交易执行前分类
  —— BNB 路径使用当时的实时 code 状态
        ↓
执行交易，按实际 gasUsed 记账
        ↓
完成区块后检查支付容量不等式
```

这不是矿工或 builder 的自愿调度建议，而是完整执行验证时必须满足的区块有效性条件。Go 的 `core/payment_lane.go` 将配置加载、分类、记账和验证串在一起。[GitHub](https://raw.githubusercontent.com/bnb-chain/bsc/develop/core/payment_lane.go)

还有一个边界：系统合约在 fork 激活区块中安装，但规则读取 parent state，所以**真正开始约束的是激活区块的下一个区块**。[GitHub](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-703.md)

## 3.5 与 Tempo 相似在哪里，不同在哪里？

**相似点是真实且核心的：两者都限制一般计算可以消耗的容量，防止支付被一般交易完全挤出。**

但实现并不相同：

|维度|BSC Payment Lane|Tempo|
|---|---|---|
|支付识别|治理名单中的目标地址；或符合条件的裸 BNB 转账|TIP-20 地址前缀；Tempo 多调用交易还检查各调用目标|
|是否读取状态|是：治理配置与实时 code 状态|支付分类基于交易数据，不读取账户状态|
|gas 约束表达|根据比例派生 quota，不新增对应区块头字段|规范使用 `general_gas_limit` 等约束|
|费用资产|该提案不改变 BSC 费用规则|USD 稳定币付费，配合原生 fee AMM|
|设计范围|通用 EVM 链上的小比例支付容量保障|更深度的支付原生架构|

Tempo 的规则还要放在其 proposer lane、sub-block 等整体区块结构中理解，不能仅拿一个“支付占比”数字与 BSC 做机械比较。[Tempo Docs](https://docs.tempo.xyz/protocol/blockspace/payment-lane-specification?utm_source=chatgpt.com)

因此可以说 **BSC 引入了 Tempo 同类的 payment QoS 思路**，但不能据此说 BSC 正在变成 Tempo，或已经采用稳定币 gas、相同交易模型和相同区块生产机制。

## 3.6 它保障什么、不保障什么？

Payment Lane 保障的是：**普通交易不能占用全部执行容量，支付类交易保有竞争空间。**

它不保证某一笔交易一定被纳入，也不自动提供零手续费、FIFO、抗审查、抗 MEV 或独立并行执行。规范仍保留出块者的交易选择和排序自由。[GitHub](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-703.md)

我的主要 tradeoff 判断有三项：

**容量利用率与支付可用性的取舍。** 没有支付需求时，预留空间会闲置；这是明确付出的机会成本。

**治理准入与开放性的取舍。** 名单决定哪些合约能获得资源保障，治理承担选择、监控和移除责任。

**简单支付与复杂钱包体验的取舍。** 简单地址转账容易识别；经 Router、智能账户或复杂组合调用的支付不自动被覆盖。

此外，因为名单按地址而非操作定义，**对可升级合约持续监控尤其重要**：被列入名单时的执行行为，不一定永远等于升级后的执行行为。这是我根据当前分类规则得出的风险判断，而不是提案提供了自动防护。

---

# 四、你没有提到、但同样重要的开发方向

## 4.1 BEP-675：通过取消出块前重复执行，为更大区块留出时间

这可能是近期对实际吞吐最重要的一项改变。

旧流程的关键路径是：

```
导入父区块
  → Builder 执行并构建候选交易
  → Validator 再执行一次候选交易
  → 封块、签名、广播
```

`SendBidBlock` 路径则让 builder 提交已经执行完成、包含执行结果的区块。Validator 在封块前进行头部及结构等检查、签署允许的系统交易、重算交易根并签块，**不再重放全部用户交易**。广播后，再通过本地 import 执行验证。[GitHub](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-675.md)

它不是“以后不用验证”，而是：

> **把完整执行验证移出封块前的关键路径，而不是从系统中删除。**

收益是更多时间可以用于 builder 构建更大的区块；代价是 validator 可能先签出一个执行无效的候选块，之后才发现问题。完整验证节点仍会拒绝它，因此这不是把 builder 的 state root 当成可信证明，但会增加可用性和错误恢复风险。[GitHub](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-675.md)

BSC 用 builder 权限降级缓解这类风险：出问题后撤销其 blind-signing 路径权限，使其退回有预执行保护的旧路径。Jenner 同期还计划加入跨验证者 bad-block 证据、撤销状态持久化、零 state root 拒绝等加强措施。[BNB Chain](https://docs.bnbchain.org/announce/jenner-bsc/?utm_source=chatgpt.com)

官方 9 月 14 日报告称，在当时最近三天的窗口中，该路径已覆盖约 98% 的区块，平均每块承载 gas 比旧路径高约 28%。这是**特定主网观察窗口的报告**，不是理论 TPS 提升保证。[BNB Chain](https://www.bnbchain.org/en/blog/post-pasteur-hard-fork-bsc-packs-28-more-gas-per-block-with-more-scale-ahead?utm_source=chatgpt.com)

这也影响 Payment Lane 的验证位置：blind signing 不执行交易，因而无法在封块前完整完成基于执行的 lane 检查；该检查会落到广播后的本地 import，违规按坏 BidBlock 处理。[GitHub](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-703.md)

## 4.2 更大区块背后的配套：gRPC、传播、同步和双客户端

取消重复执行后，下一个瓶颈自然转向：更大的 BidBlock 能否及时送达、区块和 receipts 能否传播、节点能否及时导入。

BSC 正在推动 **gRPC + RLP 的 BidBlock 传输**，减少 JSON/hex 表示与序列化开销。官方同时讨论了逐步提高 gas limit，但 70M、80M、90M 这些阶段目标必须与实际主网观测区分，不能把规划直接当成当前参数。[BNB Chain](https://www.bnbchain.org/en/blog/post-pasteur-hard-fork-bsc-packs-28-more-gas-per-block-with-more-scale-ahead?utm_source=chatgpt.com)

双客户端方面，Reth 已不仅是同步性能实验。`reth-bsc v0.1.2` 已包含 BidBlock 路径，也修复了原生状态写入与增量状态根计算管线不同步的问题；发布说明记录了该缺陷曾在测试环境的 Pasteur 切换时造成状态根不一致。[GitHub](https://github.com/bnb-chain/reth-bsc/releases/tag/v0.1.2)

这一点与 CAS20 很相关：**原生写状态越多，越要确保这些写入同时进入 journal、tracing、状态根计算和持久化等所有客户端管线。** 对双客户端而言，最终标准不是“两个实现都能转账”，而是返回值、日志、gas、退款和最终状态根一致。

## 4.3 BEP-706：毫秒级时间戳，对 RFQ / PropAMM 很有实际意义

BSC 区块头本来就包含毫秒级时间信息，但 `block.timestamp` 仍按 EVM 习惯返回秒。

在亚秒级出块条件下，多个区块可能拥有相同的秒级 timestamp。这会限制报价有效期、拍卖截止、价格陈旧性等逻辑的表达精度。

BEP-706 在 **`0x70`** 增加一个只读预编译，返回当前执行区块的毫秒时间，形式上相当于：

\[ t_{\mathrm{ms}} = 1000\times \text{Header.Time} + \text{header 中的毫秒余数} \]

预编译自身费用为 20 gas，不包含调用侧的所有额外成本；`block.timestamp` 的单位和旧行为保持不变。[GitHub](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-706.md)

典型流程是：做市商签署带毫秒级 deadline 的报价，结算合约调用预编译，再决定报价是否过期。

**这是更细的时间粒度，不是更强的真实时钟保证。** 它仍使用共识接受的区块时间，也不意味着一笔仅剩几十毫秒有效期的交易一定能及时成交。[GitHub](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-706.md)

## 4.4 BEP-714：优化掉线时的尾部延迟，而不是继续压缩正常 block time

BEP-714 把备用验证者初始等待时间从 **2 秒降到 1 秒**，正常出块间隔仍为 0.45 秒。

动机是：当出块时间已降到几百毫秒，2 秒的故障接管等待会成为显著的延迟来源。提案用一个八块受影响轮次举例：

\[ (0.45+2)\times8=19.6\text{ 秒} \]

调整后：

\[ (0.45+1)\times8=11.6\text{ 秒} \]

这是特定故障假设下的估算，不是最坏交易纳入时间保证。更短等待同时要求验证跨区域传播与重组风险，因此仍需要测试网验证。[GitHub](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-714.md)

从产品角度看，这条线解决的是“正常时候快，但某个 validator 掉线就突然很慢”的问题。

## 4.5 BAP-710：统一 PropAMM Relayer，值得单独持续追踪

这是一份 9 月新增的**应用层**提案，目的是把做市商的链下报价、用户标准 RPC 调用和多个 builder 的原子 bundle 能力连接起来。主要流程如下：

```
Maker 向 Relayer 提交报价更新
       ↓
Relayer 保留链下状态覆盖层，不立即发送每次更新
       ↓
Taker 用 eth_call 在“链上状态 + 可见报价”上询价
       ↓
Taker 提交普通签名交易
       ↓
Relayer 找出该交易读取了哪些报价更新
       ↓
组装 [报价更新交易…, 用户交易]，重新模拟
       ↓
发送给多个 Builder，原子纳入
```

报价与交易的匹配依据是报价 write-set 与用户交易 read-set 的交集。由此只让实际被使用的报价更新上链，减少无效更新 gas，也降低询价状态与成交状态之间的偏差。[GitHub](https://raw.githubusercontent.com/bnb-chain/BEPs/master/BAPs/BAP-710.md)

它不是给 PropAMM 保留共识 blockspace；这里 registry 中的 “lane” 是独立报价状态，与 Payment Lane 无关。

还要注意一个安全边界：**registry 本身不强制报价过期**。Relayer / builder 会按 deadline 丢弃报价，但需要链上强制保护的 pool，仍应在 `quote` / `swap` 中校验 freshness，不能只相信链下不会提交旧更新。[GitHub](https://raw.githubusercontent.com/bnb-chain/BEPs/master/BAPs/BAP-710.md)

## 4.6 执行引擎与上游同步：有些方向在新增，有些反而被撤回

对于 commit bot，这里有一个很容易误读的例子。

BSC 的 **`v1.8.0-alpha`** 是上游代码同步预览版，明确不面向生产。它跟进 Geth v1.17.3，同时：

**删除了此前的 superinstruction 优化与 incremental snapshot 机制；引入 EIP-7928 Block Access List 相关基础代码，替换 BEP-592；同步了一组 Amsterdam EIP，但明确保持其在 BSC 上未激活。**[GitHub](https://github.com/bnb-chain/bsc/releases/tag/v1.8.0-alpha)

所以不能因为旧 roadmap 介绍过 superinstructions，就继续说 BSC 正沿这条路线单向推进；也不能因为仓库出现 UBT、BAL 或某个新 EIP，就认为主网已经切换对应状态结构或执行规则。

较长期的公开路线仍包括 AOT/JIT、并行执行、并行友好存储和预取优化。这些应作为方向追踪，与已经发布的客户端功能、已经激活的共识变化分开。[BNB Chain](https://www.bnbchain.org/en/blog/tech-roadmap-2026)

## 4.7 仓库之外：AI Agent 支付与工具链也是明确方向

如果把“发展方向”扩展到协议之外，近期还包括 **Agent Lifecycle Protocol（ALP）v0.4 草案与 BNB Agent Studio**。

这条线主要组合身份、钱包、权限、资金、支付与生命周期标准，例如 ERC-8004、x402、EIP-3009 等，而不是把大模型推理搬入共识执行。它与支付基础设施有产品层面的联系，但不能归类为 Jenner 的新共识能力。[BNB Chain](https://www.bnbchain.org/en/blog/agent-lifecycle-protocol-an-open-standard-for-the-agent-economy?utm_source=chatgpt.com)

隐私框架也出现在公开 roadmap 中，但在本次核对的 Jenner 范围里，没有看到可以据此宣布“BSC 已上线新的协议级隐私执行机制”的依据。[BNB Chain](https://www.bnbchain.org/en/blog/tech-roadmap-2026)

---

# 五、把这些工作放在一起，BSC 的方向是什么？

我的归纳是：**BSC 正在给通用 EVM 链叠加更有针对性的金融基础设施，而不是只追求一个更大的 TPS 数字。**

这几组工作分别解决不同问题：

|产品问题|对应技术方向|
|---|---|
|资产怎样标准化发行、管理并被工具识别？|CAS20、共享策略、显示数量接口、专用 RPC|
|拥堵时简单支付是否还有可竞争的容量？|Payment Lane|
|专业做市报价如何低成本、低偏差地成交？|PropAMM Relayer、原子 bundle、毫秒 deadline|
|更复杂的交易量如何塞进短出块窗口？|Blind Signing、gRPC/RLP、执行和存储优化|
|验证者掉线时怎样减少突发延迟？|更短 backup backoff、builder 降级与故障证据|

这是根据前述开发组合得出的判断，不是声称它们已经全部上线或已经形成一个完整产品闭环。

尤其要避免把几个功能想象成自动连接：

**CAS20 发行的资产，不自动进入 Payment Lane；使用 CAS20 的 swap，不自动算 payment；PropAMM Relayer 的原子 bundle，也不自动获得共识层优先级。** 它们分别处在资产执行、资源配额、交易接入与区块构建层，集成时仍需明确连接条件。[GitHub](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-703.md)

---

# 六、给你的 commit bot：最值得增加的追踪维度

建议不要只按 feature 名称聚合 commit，还为每条功能维护：

```
规范版本
  → Go / Rust 实现是否合并
  → 是否进入正式 release
  → 测试网 / 主网 fork 配置
  → 是否还需要治理或管理员激活
  → 上线后的实际配置与指标
```

其中，CAS20 的后两层尤为重要；Payment Lane 则还要继续跟踪名单与比例，而不是只看预编译或分类器有没有合并。[GitHub](https://raw.githubusercontent.com/bnb-chain/bsc/057868dc17fde98fcecee6a59c472eeb05faf576/core/vm/cas20_activation.go)

源码阅读入口可以集中在下面几组：

|主题|优先入口|
|---|---|
|CAS20 执行与 gas|`bsc#3813`；`core/vm/contracts_stateful.go`、`cas20_gas.go`、`cas20_storage.go`|
|CAS20 权限和接口变化|`bsc#3826`、`bsc#3829`；`cas20_admin.go`、`cas20_policy.go`|
|双客户端一致性|`reth-bsc#512` 及 golden fixture|
|Payment Lane|`bsc#3793`、`reth-bsc#497`；`core/paymentlane/`、`core/paymentlanemeta/`|
|Builder 生产链路|BEP-675；`miner/bid_block.go`、bid 接入和撤销逻辑|
|未来产品接入|BAP-710 的接口、registry 与 Relayer 规范|

这些入口分别对应当前实现及其后续修订，而不是仅靠功能名推测出来的文件。[GitHub](https://github.com/bnb-chain/bsc/pull/3813)

**最后浓缩成一句：CAS20 是“协议原生资产”，Payment Lane 是“支付容量保障”，Blind Signing 是“压缩出块关键路径”，PropAMM Relayer 是“专业流动性的标准化接入”。把这四者分层理解，才能看清 BSC 近期开发真正的产品指向与技术取舍。**
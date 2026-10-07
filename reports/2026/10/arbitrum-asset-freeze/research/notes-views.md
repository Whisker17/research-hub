# notes-views：社区与 KOL 观点、利弊权衡（brief 研究问题 3）

- **研究问题**：社区和 KOL 是否认为 Security Council 冻结 KelpDAO 黑客 ETH 是在审查（censor）用户、会不会留下隐患？引入或保留这种冻结能力，利弊各是什么？
- **一句话答案**：在能找到原文的样本里，几乎所有人都支持"这一次"的结果（Snapshot 释放投票 90.96% 赞成），但很多人只是**有条件支持**：他们承认 ETH"未经用户同意被移动"，认为这项能力"不限于救援"，要求公布触发标准和冻结资产处置政策。明确反对的声音主要来自 X 上的批评者（"去中心化表演""DAO 名不副实"），以及想把这笔钱当朝鲜财产来执行的判决债权人律师。事后的法院限制令也让"冻结 → 链被法律体系拉进来"这一风险兑现了一部分。
- **样本偏差**：论坛和投票者是 DAO 参与者，X 帖子由搜索和媒体转引挑选。没找到 Vitalik、Polynya、Hasu、cobie、ZachXBT（就冻结本身）、Jon Charbonneau、Ryan Berckmans 对此事的原帖（见开放问题）。

---

## 1. 事件经过（只列和观点有关的最小时间线，UTC）

**答案**：04-21 冻结 → 04-25 Aave Labs 等提出释放 AIP → 04-30 至 05-07 Snapshot 温度检查（90.96% 赞成） → 05-01 判决债权人向"Arbitrum DAO"送达限制令 → 05-08 SDNY 修改限制令，允许链上投票，把 ETH 转给 Aave LLC → 05-11 提出修订版 AIP 并开启链上投票 → 06-15 执行划转。

**依据**
| 时间（UTC） | 事件 | 来源 |
|---|---|---|
| 2026-04-18 17:35 | KelpDAO rsETH（LayerZero OApp，单 DVN 配置）被解锁 116,500 rsETH（约 2.92 亿美元） | LayerZero 事故报告 [26] |
| 2026-04-21 03:26:47 | L1 治理交易执行（主会话已知事实）。Arbitrum 官方 X 写的是 "April 20 11:26pm ET"，与 UTC 一致；论坛帖写成 "11:26pm ET, 21st April 2026"，**日期写错了一天** | [5][1] |
| 2026-04-21 03:46:45 | Arbitrum 官方 X 宣布冻结，称 Council "acted with input from law enforcement as to the exploiter's identity" | [5] |
| 2026-04-21 03:57:55 | 论坛 30803 官方说明：升级 Inbox，加入 `sendUnsignedTransactionOverride`，冒用黑客地址转出资金后恢复原实现 | [1] |
| 2026-04-25 13:28 | Aave Labs、KelpDAO、LayerZero、EtherFi、Compound 提出 Constitutional AIP，要求把 30,765.67 ETH 释放到 2/3 Safe（后改为 3/4 Safe），附 Aave Labs 对 Foundation、Offchain Labs、Security Council 的无上限赔偿承诺 | [2]#1 |
| 2026-04-28 | Aave Labs 回复：Safe 改为 3/4（加入 EtherFi），不设分配瀑布 | [2]#10 |
| 2026-04-30 18:54:51 → 05-07 18:54:51 | Snapshot "Approve Release of Frozen ETH"：For 182,176,773 ARB / Against 1,738 / Abstain 18,102,392；共 1,693 票 | [3] |
| 2026-04-30（签署）/ 05-01 晚（纽约时间送达） | Gerstein Harrow LLP 代表朝鲜恐怖主义判决债权人（Kim v. DPRK, 25-MC-527 SDNY 等），向"Arbitrum DAO"送达限制令和执行令，称 0x…0DA0 余额是 DPRK（含 Lazarus/APT-38）有权益的财产 | [2]#22、#37 |
| 2026-05-04 | Aave LLC 申请撤销限制令；Arbitrum Foundation 发帖称正在咨询律师 | [2]#33、#37 |
| 2026-05-06 | 庭审口头辩论 | [2]#37 |
| 2026-05-08 | SDNY 命令（Doc 52，Judge Margaret M. Garnett）：修改限制令，允许链上投票，把 Immobilized Assets 转到 Aave LLC 控制的钱包；投票或参与转账者不算违反限制令；转账后 Aave LLC 按限制令受约束；其余事项保留不决 | [4] |
| 2026-05-11 | 修订版 AIP：收款方改为 Aave LLC 地址 0x3b87…6C07；Foundation 宣布链上投票开启 | [2]#37、#38 |
| 约 2026-05-14 → 05-27 | 链上投票窗口，来自 Snapshot 镜像空间的时间戳。**未拿到链上票数** | [34]（speculative） |
| 2026-06-15 12:22 | Foundation 宣布提案已执行，约 30,765.6 ETH 转给 Aave LLC（tx 0x09795deb…） | [2]#56 |

**不确定之处**：Tally 已停止支持 Arbitrum [22]，新治理 UI 是 JS 渲染页面，抓取失败。所以没有链上投票的票数和参与率。

---

## 2. 社区与 KOL 观点收集

**答案**：共收集 33 条有原文的观点。立场分布：支持 13、有条件支持 / 担忧 13、反对或批评 7。
- "这就是审查 / 不中立 / L2 只是多签"一类说法几乎都来自 X 上的批评者，论坛里没有出现。
- 论坛里最常见的立场是"结果对，但这个先例需要框架来约束"。
- 利益相关方（Offchain Labs、Foundation、Council 成员、Kelp、Aave）一律支持。

**依据**（立场：支持 / 有条件 / 反对 / 担忧中立）

| # | 谁（身份、利益关系） | 日期·渠道 | 立场 | 核心论点 / 原话 | 来源 |
|---|---|---|---|---|---|
| O1 | Arbitrum 官方账号（利益方） | 04-21 X | 支持 | 冻结时参考了执法机构对身份的判断，"without affecting any other chain state or Arbitrum users" | [5] |
| O2 | Steven Goldfeder，Offchain Labs 联合创始人（利益方） | 04-22 CoinDesk 采访转述 | 支持 | "The default was do nothing"；"The DAO cannot be consulted, because the second the DAO is consulted, that essentially means North Korea is consulted"；"We're no more or less decentralized today than we were yesterday" | [19] |
| O3 | Patrick McCorry，Arbitrum Foundation 研究负责人（利益方，与 Council 协作） | 04-21 X；04-22 CoinDesk 采访 | 支持 | Council "a very transparent part of the system… You can see exactly what powers they have"，由代币持有人选举，"not hand-picked by us" | [7][19] |
| O4 | Griff Green，Security Council 成员兼代表（直接决策人） | 04-21 X；Coinage 采访；论坛 | 支持 | "all it takes for evil to triumph is for good men to do nothing, so today, we decided to do something"；"things are not immutable. It's always run on social consensus"；攻击者长时间不动资金是少见的窗口 | [6][20][2]#3 |
| O5 | KelpDAO（受害协议） | 04-21 X | 支持 | 感谢 Council，提到与其密切合作，并感谢 SEAL 911 | [8] |
| O6 | Arkham（链上分析机构） | 04-21 X（NewsBTC 嵌入） | 支持（叙事） | "North Korea stole the money and Arbitrum stole it back." | [30] |
| O7 | mert，Helius CEO（Solana 生态，非利益方） | 04-21 X | 支持 | "it is well known that Arbitrum is a stage-1 rollup"；有控制手段却假装不用，"to virtue signal and appease terrorists would be the much worse… outcome" | [9] |
| O8 | zerolore，USDT0 联合创始人 | 04-21 X | 支持 | "a decentralisation compromise"，但 "Users safety is paramount above everything else" | [10] |
| O9 | Zeptimus（代表） | 04-21 论坛；05-02 论坛 | 支持 | "The Security Council is a feature WE ALL KNOW ABOUT"；回应限制令时说："Theft doesn't pass the title"，code is law 也不会把所有权给破坏规则的人 | [1]#2、[2]#25 |
| O10 | maxlomu（代表） | 04-21 论坛 | 有条件 | "this created a precedent that shapes the neutrality of Arbitrum… ETH was moved on Arbitrum without the user's consent"；追问"Do authorities need to request the action?" | [1]#3 |
| O11 | Robby Greenfield（tokedex.org） | 04-21 论坛 | 有条件 / 担忧 | "the capability itself is not scoped to recovery. It's a general-purpose power embedded in the upgrade authority"；"9 people can modify the fundamental trust assumptions"；要求 sunset 条款和去权路线图 | [1]#4 |
| O12 | Manoj Kumar Desai / MconnectDAO（代表） | 04-22、05-01 论坛 | 有条件 | "What stops this power from being used again under less clear circumstances?"；"We got lucky this time… Governance shouldn't rely on luck"；要求出台 Emergency Action Policy 和 Frozen Asset Release Policy | [1]#6、[2]#17 |
| O13 | deakeegroup | 04-24 论坛 | 支持 | 事先授权、范围明确的紧急权力优于两个极端，"That's the right shape"；要求公布从发现到冻结的完整时间线 | [1]#10 |
| O14 | cp0x（代表） | 04-21 论坛 | 支持 | "A very cool idea and implementation"；后来关注收款地址和金额不一致可能带来的法律问题 | [1]#5、[2]#44–49 |
| O15 | Daniel / dzack23（代表） | 04-29、04-30 论坛 | 有条件 | 指出 Council 介入的是 "an exploit unrelated to any vulnerability in the Arbitrum Protocol itself"；强烈反对再用紧急行动加快释放："would seem to me to violate the constitution… would set a very bad precedent" | [2]#12、#15 |
| O16 | David Mihal（代表） | 05-01、05-28 论坛 | 有条件 | 反对用 Council 行动提速；"Arbitrum should follow this with a standing policy for handling Security Council-frozen assets" | [2]#16、#54 |
| O17 | L2BEAT 治理团队（krst、Manugotsuka；代表，也是 Stages 框架作者） | 04-29 博客；05-20 论坛 | 有条件 | "this isn't a neutral situation… choosing not to act further is also a decision"；"Why this case and not others"；后来又说修订路径 "does not set a precedent or a concerning case of governance being forced by external legal pressure" | [22][2]#51 |
| O18 | Entropy Advisors（DAO 服务商） | 05-01 论坛 | 支持 | 承认代表面临法律风险，但 "Holding out for full regulatory clarity… is itself a choice with consequences" | [2]#19 |
| O19 | TID Research（代表） | 05-01、05-02、05-15 论坛 | 担忧 → 支持 | 温度检查投弃权，理由是 "the legal risk involved"；法院命令出来后转为 FOR | [2]#18、#24、#40 |
| O20 | 0xDonPepe（代表） | 04-25 论坛 | 有条件 | 要求先赔 Arbitrum 用户、代表直接列为被赔偿方，因为这类投票 "most likely to attract litigation or regulatory inquiry" | [2]#5 |
| O21 | Charles Gerstein，DPRK 判决债权人律师（对立利益方） | 05-02 论坛 | 反对释放 | 送达限制令，称 0x…0DA0 余额是 DPRK（含 Lazarus Group）有权益的财产；违反可按藐视法庭处理 | [2]#22 |
| O22 | Aave Labs / Aave LLC（受影响方、提案方） | 05-06、05-11 论坛 | 支持 | 声明 "a thief does not gain lawful ownership of stolen property"；称 Arbitrum 社区是 "Good Samaritan" | [2]#34、#37 |
| O23 | Gabriel Shapiro（律师，MetaLeX） | 2026-05-02 X（日期由 tweet ID 推算） | 担忧中立（法律） | 限制令 "facially *legally binding*"；DAO "supposed to actually litigate that not just decide on their own what to do with it" | [16] |
| O24 | PaperImperium，MegaETH Economics Lead | 05-02 X | 担忧 | "This is why the Arbitrum Security Council was not kind to the DAO"：冻结让 DAO 暴露在债权人追索之下 | [17] |
| O25 | Farside Insights（原 BitMEX Research） | 04-21 X | 批评 | 嘲讽 L2BEAT："don't you think red would be a more appropriate colour for the 'Exit Window' segment?" | [11] |
| O26 | Deestar（评论者） | 04-21 X | 批评 | "while this is really great news it's a proof that almost nothing in crypto is truly decentralized"；"only Bitcoin can save you" | [12] |
| O27 | xghost / 0xxghost（交易员） | 04-21 X | 反对 | "What they did totally defeats the entire meaning of a DAO" | [13] |
| O28 | Fizen（加密 neobank） | 04-21 X | 担忧 | "The line between 'decentralized' and 'we'll freeze it if we have to' just got a lot blurrier." | [14] |
| O29 | chris.xch（约 81 粉丝的小号，CoinDesk 当作"批评者"引用） | 04-21 X | 反对 | "LARP decentralization theatre… completely unsuitable for real value" | [15] |
| O30 | 匿名 X 用户（cryptotimes 转引，未找到原帖） | 04-21 | 反对 | "This exposes Arbitrum as a multisig wallet that can unilaterally freeze and steal funds" | [31]（speculative） |
| O31 | Jack Inabinet，Bankless 分析师（媒体） | 04-23 Bankless | 担忧中立 | "centralized enough to freeze funds… arguably has a moral responsibility to act. That capability, however… invites regulation and formal oversight" | [28] |
| O32 | GMX Governance Committee（Arbitrum 原生协议） | 05-04 论坛 | 支持 | "We commend the Arbitrum Security Council for its swift actions" | [2]#31 |
| O33 | SEEDGov（代表） | 05-04、05-21 论坛 | 有条件 | 温度检查投 FOR，但链上投票的支持以代表获得赔偿保护为条件 | [2]#32、#52 |

**Lazarus / 朝鲜归因**：
- LayerZero Labs 的事故报告（2026-05-18；LayerZero 本身是利益相关方）写道：CrowdStrike 和 Mandiant "attribute this attack to DPRK with high confidence"，并以中等置信度归到 UNC4899 / TraderTraitor；独立研究者 tanuki42 和 tayvano（Tay）也归因于 UNC4899 [26]。
- Arbitrum 官方只说"input from law enforcement as to the exploiter's identity"，没有公开点名 [5]。
- 没找到 FBI 公告。
- ZachXBT 只有 Decrypt 转述的洗钱追踪（Thorchain），没有找到他对冻结本身的评论 [32]。

**不确定之处**：
- dzack23、Zeptimus、maxlomu 等人的"代表"身份，依据是论坛里的 delegate communication thread 链接，没有核对他们的投票权大小。
- Coinage 采访没有标出版日期。
- CoinDesk 04-22 那篇 URL 里是 04-22，页面显示 "Apr 23, 2026, 2:35 p.m. EDT"（可能是更新时间）。

---

## 3. 利弊权衡：论点地图

**答案**：支持方的核心论点是"权力事先存在、经过选举、公开可查；这次救回的是朝鲜黑客的钱；不行动就是放任"。反对 / 担忧方的核心论点是"能力本身不限于救援；用户信任对象从规则变成人；冻结让链进入法律体系；Stage 1 的退出窗口在紧急路径下是零"。

### 3.1 支持方论点（每条都有提出者）
| 论点 | 提出者 |
|---|---|
| A1 减少损失、及时止损：攻击者几小时内就开始洗钱，窗口很窄 | Goldfeder [19]；Griff Green [20]；MconnectDAO [1]#6 |
| A2 权力早已存在，并且众所周知；"既然是 Stage 1，不用才是虚伪" | Zeptimus [1]#2；mert [9]；Goldfeder "no more or less decentralized" [19] |
| A3 Council 由选举产生、权力透明 | McCorry [7][19] |
| A4 事先咨询 DAO 等于通知攻击者 | Goldfeder [19] |
| A5 对象是朝鲜 / 制裁实体，道义上正当（"evil to triumph"） | Griff Green [6][20]；mert [9]；Arkham [30] |
| A6 范围窄、手术式、不影响其他用户；释放仍走 DAO 治理，紧急权力从属于宪法治理 | Arbitrum [5]；deakeegroup [1]#10；OliverBuilds [2]#7 |
| A7 盗窃不转移所有权，把钱归还原主是纠错，不是扣押 | Zeptimus [2]#25；Aave（kolten）[2]#34 |
| A8 用户安全高于去中心化的纯粹性 | zerolore [10] |
| A9 不行动也是一种决定（冻结之后 DAO 已经身处其中） | L2BEAT [22]；Entropy [2]#19 |

### 3.2 反对 / 担忧论点
| 论点 | 提出者 |
|---|---|
| B1 中立性受损：ETH 在没有用户同意的情况下被移动 | maxlomu [1]#3；Fizen [14] |
| B2 能力是通用的（"impersonate any address"），不只用于救援；先例与滑坡 | Robby Greenfield [1]#4；MconnectDAO [1]#6；CoinDesk 转述的批评者 [19] |
| B3 没有触发标准，不清楚是否由当局要求；"不能靠运气" | maxlomu [1]#3；MconnectDAO [1]#6、[2]#17；Mihal [2]#54 |
| B4 "为什么是这次而不是别的"：以后是否每次都要出手？ | L2BEAT [22]；MconnectDAO（外部漏洞要逐案临时处理）[2]#17 |
| B5 L2 只是多签 / 去中心化表演 / DAO 名不副实 | 匿名用户 [31]；chris.xch [15]；xghost [13]；Deestar [12] |
| B6 Stage 评级、退出窗口叙事被冲击：紧急路径的退出窗口是 0 | Farside [11]（配合 L2BEAT 项目页：紧急路径 "no timelock, no exit window" [24]） |
| B7 法律 / 监管把链拉进来：冻结后资产受限制令约束，DAO 和代表承担法律风险 | Gerstein [2]#22；Shapiro [16]；PaperImperium [17]；TID [2]#24；0xDonPepe [2]#5；Bankless [28][29] |
| B8 有这种能力会招来监管和正式监督 | Bankless（Inabinet）[28] |
| B9 介入的事件与 Arbitrum 协议漏洞无关（宪法对紧急行动的范围限定） | dzack23 [2]#12（他只用这一点来说明情况特殊；明确说"违宪"是指再用紧急行动来提速 [2]#15） |
| B10 9 个人就能改变一条链的信任假设；只有事后披露，没有事前问责 | Robby Greenfield [1]#4 |
| B11 Council 成员 / 代表的个人法律责任（所以 Aave 才提供赔偿承诺，代表要求加入被赔偿方） | Aave Labs AIP 赔偿条款 [2]#1；0xDonPepe [2]#5；TID [2]#18；SEEDGov [2]#32 |

**没找到有人提出的论点**（不写入论点地图，只列在这里）：
- Council 密钥被盗或被社工攻击的风险：没有找到针对此事的评论。注意 KelpDAO 事件本身就是 LayerZero 开发者被社工攻击 [26]，但没有人把这一点和 Council 联系起来。
- 用户信任对象从规则变成人：只有 Deestar 的 "12 people, likely in the same location" [12] 和 Robby Greenfield 的 "9 people" [1]#4 算间接提出。

### 3.3 反驳对照（谁回应了谁）
- 针对 B2 和 B5，有人反驳"权力早已存在，L2BEAT Stage 1 允许 Council"（A2）。这条反驳与一手文档一致：L2BEAT Stage 1 的要求允许 Security Council 存在（≥75% 门限），Arbitrum One 被评为 Stage 1，Council 为 9/12，可以无延迟升级 [23][24]。但 L2BEAT 同一页面也写明紧急路径没有退出窗口 [24]。
- 针对 B7，L2BEAT 认为修订后的路径是 DAO 自主选择，不是被法院强迫 [2]#51。Shapiro 则认为在限制令之下 DAO 本应先诉讼，不能自行决定 [16]。法院命令本身只"允许"投票，"reserves decision on all other matters"[4]。
- 针对 B1，Zeptimus 和 Aave 用"盗窃不转移所有权"来回应 [2]#25、#34。判决债权人律师那一方（据 CoinDesk 转述）主张这是欺诈而非盗窃、攻击者取得了所有权 [21]（采访转述）。法院尚未就实体问题作出裁决 [4]。

### 3.4 综合判断（本 lane 作者自己的判断，不是任何受访者的观点）
1. 主流舆论的结构是"结果正当、机制存疑"，不是"认可冻结能力"。90.96% 赞成的投票对象是释放资金，不是事前授权冻结，也不是对常设冻结能力的公投。
2. 最有分量的担忧来自法律后果，而不是"censorship"这个词本身：冻结之后，资金在两周内就被美国法院限制令锁住，最终由法院决定流向（转给 Aave LLC 后仍受限制）。这说明"链能控制资产"会被外部主体当成"链应当承担控制责任"。这个风险是实际兑现了的，不是假设。
3. 宪法把紧急行动限定为 "a true security emergency, such as a critical vulnerability that could significantly compromise… a chain governed by the ArbitrumDAO" [25]。KelpDAO 事件是外部协议的漏洞（dzack23 [2]#12 也指出了这一点），所以这次属于对条款的宽泛解释。宪法还要求事后发布 "full transparency report" [25]，截至 2026-10-07 我在论坛搜索中没找到这次行动的专门透明度报告 [36]，这一条标 speculative。
4. 对 Mantle 的启示（只谈观点层面）：如果采用类似路径，在舆论上最容易站住的条件是：事前公开的紧急权力和触发标准、手术式的执行、事后由治理决定资产去向，以及事先准备好的法律和赔偿安排。这些恰好是 Arbitrum 社区事后才补提的要求。

---

## 4. 公众认可度（可量化数据）

**答案**：唯一拿到一手数据的量化指标是 Snapshot 温度检查：投票 2.0028 亿 ARB，其中 For 90.96%、Abstain 9.04%、Against 约 0.0009%；1,693 个地址参与 [3]。链上 Constitutional AIP 通过并于 06-15 执行 [2]#56，但票数没有拿到。ARB 价格和 TVL 的事件后变化没有收集一手数据，不写。

**依据**：[3] Snapshot GraphQL 原始返回；[2]#56 执行公告。NewsBTC 报道 04-21 的 ARB 报价是 $0.1266 [30]，属于二手信息，未使用。

**样本偏差**：
- 投票者是持有或被委托 ARB 的 DAO 参与者，没有覆盖普通用户。
- 弃权票包含因法律风险而弃权的 TID Research [2]#24。
- 反对票几乎为零，可能是因为反对者选择不参与，而不是不存在：Entropy 提醒过，弃权也计入法定人数，想完全置身事外就不能投票 [2]#19。
- X 上的批评帖传播量差别很大：mert 帖约 5.6 万次浏览 [9]，chris.xch 帖只有 49 次 [15]。官方公告约 550 万次浏览、2,176 次引用 [5]，但引用帖的情绪分布没有统计。

**不确定之处**：链上投票票数、法定人数和参与率；有没有独立民调（未找到）。

---

## 图的素材

**时间线图（参与者 · 事件 · 日期）**
- 攻击者 / LayerZero DVN → 04-18 17:35 解锁 rsETH [26]
- Security Council（9/12）→ 04-21 03:26:47 L1 交易执行冻结；官方 X 公告在 03:46:45 [5][25]
- 论坛社区 → 04-21 至 04-24 共 6 条回复（支持 3、有条件 3）[1]
- Aave Labs 等五方 → 04-25 提出 AIP [2]#1
- Snapshot → 04-30 至 05-07，90.96% For [3]
- DPRK 判决债权人 → 05-01 送达限制令 [2]#22、#37
- SDNY → 05-08 命令（Doc 52）[4]
- 修订 AIP / 链上投票 → 05-11 起 [2]#37、#38
- 执行 → 06-15 转给 Aave LLC，限制令随资产转移 [2]#56、[4]

**资产托管状态机**
- 状态：攻击者 EOA → 0x…0DA0（"frozen"，只有治理能动）→ Aave LLC 钱包（受法院限制令约束）→ （未决）用于 rsETH 恢复或其他。
- 转移条件：Council 紧急行动 9/12 [25][1] → Constitutional AIP 链上通过加上法院许可 [4][2]#37 → 法院对实体问题作出裁决 [4]（截至 10-07 未知）。

**论点地图（对比维度）**
- 维度：速度（A1、A4 vs B10）、合法性来源（A2、A3 vs B3、B9）、范围（A6 vs B2）、道义（A5、A7 vs B1）、外部后果（A9 vs B7、B8、B11）、去中心化叙事（A2 vs B5、B6）。
- 立场计数（本样本 33 条）：支持 13 / 有条件或担忧 13 / 反对或批评 7。分类见 §2 表的立场列。

---

## 代码素材

本 lane 不涉及代码。治理参数的文本出处：
- 宪法 Section 3："Performing any Emergency Action requires a 9-of-12 approval from the Security Council… must not use its power… except in a true security emergency" [25]

---

## 来源

（访问日期均为 2026-10-07）
1. **PRIMARY** Arbitrum 论坛 30803 "Security Council Emergency Action – 21/04/2026"，全部楼层（https://forum.arbitrum.foundation/t/30803.json）。证明官方技术说明，以及 #2–#10 的社区原话。
2. **PRIMARY** Arbitrum 论坛 30825 "[Constitutional] AIP: Approve Release of Frozen ETH"，全部可见楼层 #1–#56（/t/30825.json 与 posts.json；#23、#45 不在 stream 中，可能已删除）。证明提案、修订、限制令全文、各代表的投票理由和 06-15 执行公告。
3. **PRIMARY** Snapshot hub GraphQL，proposal 0xb32581468bece42245fa267ea86156a621ae77f61bb866118189b5d50155b051（arbitrumfoundation.eth）。证明温度检查的起止时间、票数和投票数。
4. **PRIMARY** CourtListener，SDNY 1:25-mc-00527-MMG，Doc 52（2026-05-08 提交）。证明法院修改限制令、允许投票并把资产转给 Aave LLC，其余事项保留。
5. **PRIMARY** Arbitrum 官方 X https://x.com/arbitrum/status/2046435443680346189（经 api.fxtwitter.com 读取）。证明官方措辞 "input from law enforcement"、"April 20 11:26pm ET"，以及浏览量和引用量。
6. **PRIMARY** Griff Green X https://x.com/griffgreen/status/2046446942494802274。证明 Council 成员的决策理由原话。
7. **PRIMARY** Patrick McCorry X https://x.com/stonecoldpat0/status/2046439550051139888。证明他强调 Council "elected by the ArbitrumDAO"。
8. **PRIMARY** KelpDAO X https://x.com/KelpDAO/status/2046481564616523976。证明受害协议支持冻结，并感谢 SEAL 911。
9. **PRIMARY** mert X https://x.com/mert/status/2046522965802594336。证明"Stage 1 本来就有这个能力"的辩护。
10. **PRIMARY** zerolore X https://x.com/zerolore/status/2046503445704618428。证明"用户安全优先"的支持论点。
11. **PRIMARY** Farside Insights（原 BitMEX Research）X https://x.com/BitMEXResearch/status/2046543699182543024。证明有人借此批评 L2BEAT 的退出窗口评级。
12. **PRIMARY** Deestar X https://x.com/Deestar/status/2046487439535923699。证明"去中心化是假象"类批评。
13. **PRIMARY** 0xxghost X https://x.com/0xxghost/status/2046560062370398424。证明"违背 DAO 本义"的批评。
14. **PRIMARY** Fizen X https://x.com/fizenapp/status/2046516698749280578。证明"去中心化边界变模糊"的担忧。
15. **PRIMARY** chris.xch X https://x.com/xch_chris/status/2046527417037341016。证明 CoinDesk 引用的"批评者"其实是低影响力账号。
16. **PRIMARY** Gabriel Shapiro X https://x.com/lex_node/status/2050560349376573819。证明律师认为限制令具有约束力，DAO 应先诉讼。
17. **PRIMARY** PaperImperium X https://x.com/ImperiumPaper/status/2050395870831456601。证明"冻结对 DAO 并不友善"（法律暴露）的观点。
18. （保留编号）
19. CoinDesk "Inside the $71 million freeze on Arbitrum…"（2026-04-22/23）。属于采访转述，证明 Goldfeder 和 McCorry 的原话。
20. Coinage "Inside Arbitrum's decision to take back stolen $72M from North Korea"（日期未标）。属于采访转述，证明 Griff Green 的原话。
21. CoinDesk 2026-05-08 "Arbitrum delegates back $71 million ETH recovery plan despite U.S. seizure fight"。二手来源，转述温度检查结果超过 90%，以及 Gerstein 的"欺诈而非盗窃"主张。
22. **PRIMARY** L2BEAT Governance Review #93（2026-04-29）。证明 L2BEAT 治理团队的官方看法，以及 Tally 停止支持 Arbitrum。
23. **PRIMARY** L2BEAT Stages 页面 https://l2beat.com/stages。证明 Stage 1 允许 Security Council（≥75% 门限）。
24. **PRIMARY** L2BEAT Arbitrum One 项目页 https://l2beat.com/scaling/projects/arbitrum（用 answer 模式抽取）。证明 Stage 1、Council 9/12、紧急路径 "no timelock, no exit window"。
25. **PRIMARY** Arbitrum DAO Constitution https://docs.arbitrum.foundation/dao-constitution。证明紧急行动的门限、适用范围和透明度报告义务。
26. **PRIMARY**（利益相关方） LayerZero Labs KelpDAO Incident Report（2026-05-18）https://layerzero.network/publications/kelpdao-incident-report.pdf。证明攻击时间、DPRK/UNC4899 归因及归因方。
27. **PRIMARY** 论坛 30910 "Security Council Emergency Action – 24/05/2026"。证明 Council 的另一次"常规"紧急行动（修复协议漏洞），可作对照。
28. Bankless 2026-04-23（Jack Inabinet）。媒体观点：有冻结能力就有道义责任，但会招来监管。
29. Bankless 2026-05-12。二手来源，媒体认为代表面临法律风险。
30. NewsBTC 2026-04-21。二手来源，含 Arkham 和 Deestar 嵌入帖，以及 ARB 报价。
31. Crypto Times 2026-04-21。二手来源，转引匿名用户的"multisig"批评（未找到原帖）。
32. Decrypt 2026-04-21。二手来源，含 fhenix/fizen 链接和 ZachXBT 洗钱追踪转述。
33. BeInCrypto 2026-05-03（经 Yahoo 转载）。二手来源，是找到 Shapiro 和 PaperImperium 原帖的线索。
34. Snapshot 镜像空间 hvax.eth 的 proposal 0x53c854a1…（链上 AIP 镜像）。镜像数据，只提供链上投票窗口的时间戳，没有票数。
35. Tally 页面（proposal 71236395575275509514809232906539225896862899916501711888027988560774655719183）。提供修订 AIP 原文，无票数。
36. **PRIMARY** 论坛搜索 `transparency report after:2026-04-20`（search.json）。负向证据：首页结果里没有本次紧急行动的专门透明度报告。
37. 外部调研（ChatGPT Deep Research）censor-users-on-arbitrum.md §三、§六。只作线索。
38. **PRIMARY** Fhenix X https://x.com/fhenix/status/2046454994522763436。证明 Decrypt 所称的"praise"原文只是 "valid response"。

---

## 外部调研中被修正或无法核实的地方

1. **GPT §6.4 引用 The Block 说"较高支持率"**：The Block 页面返回 403，无法核实。改用 Snapshot API 一手数据：For 90.96%、Abstain 9.04%、Against 约 0、1,693 票 [3]。
2. **GPT §2.2 只说宪法"对紧急状态提出要求"**：漏掉了关键限定。宪法把紧急行动限定为影响 "a chain governed by the ArbitrumDAO" 的真实安全紧急情况 [25]，而 KelpDAO 漏洞在 Arbitrum 协议之外 [2]#12。宪法还要求事后发布完整透明度报告，目前没找到 [36]。
3. **GPT 观点样本只有 Zeptimus、maxlomu、robtg4、Goldfeder、McCorry、Griff 六人**：这些已逐条核对原文，没有错误。但 GPT 漏掉了判决债权人限制令（后续最大的变量）、L2BEAT 的两次表态、法律风险类观点（Shapiro、TID、0xDonPepe）和 X 上的批评帖。
4. **GPT 说 Goldfeder 强调"使用的是已有权限"**：CoinDesk 原话是 "We're no more or less decentralized today than we were yesterday"，意思相近，但"已有权限"是 GPT 的概括，不是引语 [19]。
5. **GPT 没有指出官方时间的矛盾**：论坛帖写 "11:26pm ET, 21st April 2026"，官方 X 写 "April 20 11:26pm ET"，后者与 L2 时间 03:26 UTC 一致 [1][5]。
6. **GPT §6.2 引用 Griff "资金停留提供了少见窗口"**：与 Coinage 原文一致 [20]。Coinage 文中 Griff 还说 "Arbitrum DAO is not going to release these funds unless 100% of it goes straight into users hands"，但最终资金转给了受限制令约束的 Aave LLC [2]#56、[4]。这句承诺与实际结果不一致，需要读者注意（只能说明当时的表态，不能说明他违背承诺）。
7. **CoinDesk 用来代表"批评者"的 @xch_chris 只有约 81 粉丝、帖子 49 次浏览** [15]。媒体呈现的"争议"可能放大了少数声音。这一点 GPT 没有提及。
8. **Lazarus 归因**：GPT 没给来源。一手来源是 LayerZero 报告（引用 CrowdStrike/Mandiant 的 high confidence，以及 Tay 的独立分析）[26]。注意 LayerZero 是利益相关方（它的 DVN 被利用）。没有找到 FBI 公告。

---

## 开放问题

1. 链上 Constitutional AIP 的最终票数、参与率、法定人数和投票起止时间：Tally 已停止支持，新 UI 是 JS 渲染页面，需要用 RPC 读 Core Governor 0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9 的 `proposalVotes`。
2. Security Council 有没有按宪法发布本次行动的"full transparency report"？论坛首页搜索没找到 [36]，需要再查 council-actions 标签和 docs 站。
3. Vitalik、Polynya、Hasu、cobie、Jon Charbonneau、Ryan Berckmans、Ed Felten、Harry Kalodner 对此事有没有表态：DuckDuckGo 检索失败或无结果，需要用 X 搜索确认。L2BEAT 官方 X 账号有没有单独回应 Farside 的质疑，也未查。
4. SDNY 对实体问题（ETH 是否属于 DPRK 财产）的后续裁决，以及 Aave LLC 手中资金在 06-15 之后的状态：截至 10-07 未查到。
5. Snapshot 镜像显示链上投票约在 05-27 结束，但 Mihal 在 05-28 发帖说 "Voting FOR"[2]#54。投票期是否延长到 16 天，需要链上核实。
6. 有没有人提出"Council 密钥被盗或被社工攻击"的风险？本样本里没有。
7. 冻结事件前后 ARB 价格和 Arbitrum TVL 变化的一手数据（DefiLlama / CoinGecko），本 lane 没有收集。

---

## 台账

| # | 论断 | 证据 | 类型 | 页面 |
|---|---|---|---|---|
| V1 | KelpDAO rsETH 于 2026-04-18 17:35 UTC 被解锁 116,500 rsETH（约 2.92 亿美元） | [26] LayerZero 报告 §2.3 时间线 | observed | |
| V2 | CrowdStrike 和 Mandiant 以 high confidence 将攻击归因于 DPRK，以中等置信度归到 UNC4899/TraderTraitor；Tay 等研究者也做了同样归因 | [26] §2.1 | observed | |
| V3 | Arbitrum 官方称 Council "acted with input from law enforcement as to the exploiter's identity" | [5] 官方 X 帖原文 | observed | |
| V4 | 官方 X 写 "April 20 11:26pm ET"，论坛帖写 "11:26pm ET, 21st April 2026"，两者日期相差一天 | [5]；[1]#1 | observed | |
| V5 | 由 V4 推出：论坛帖日期写错，X 帖正确 | 由 V4 和已知 L1 时间 03:26:47 UTC 推出：03:26 UTC 4-21 等于 23:26 EDT 4-20 | inferred | |
| V6 | Aave Labs 等五方于 2026-04-25 提出释放 AIP，附对 Foundation、Offchain Labs 和 Council 成员的无上限赔偿承诺 | [2]#1 | observed | |
| V7 | Snapshot 温度检查从 2026-04-30 18:54:51 到 05-07 18:54:51 UTC；For 182,176,773 ARB、Against 1,738、Abstain 18,102,392；1,693 票 | [3] GraphQL 返回 | observed | |
| V8 | 温度检查 For 占 90.96%，Abstain 占 9.04% | 由 V7 推出：182,176,773 / 200,280,903 = 0.9096 | inferred | |
| V9 | 判决债权人律师 Gerstein 向"Arbitrum DAO"送达限制令，称 0x…0DA0 余额属于 DPRK（含 Lazarus）有权益的财产 | [2]#22 | observed | |
| V10 | SDNY 2026-05-08 命令允许链上投票，把资产转给 Aave LLC，参与投票者不算违反限制令，其余事项保留 | [4] Doc 52 第 1–4 段 | observed | |
| V11 | 修订版 AIP 把收款方改为 Aave LLC 地址 0x3b87…6C07，并声明不授权在受限期间分配资金 | [2]#37 | observed | |
| V12 | 2026-06-15 Foundation 宣布提案已执行，约 30,765.6 ETH 转给 Aave LLC | [2]#56 | observed | |
| V13 | 链上 AIP 的票数在本次调研中没有拿到 | [35] Tally 页面无票数；alt.gov 页面是 JS 渲染 | observed | |
| V14 | Goldfeder（Offchain Labs）在采访中说 "The DAO cannot be consulted… that essentially means North Korea is consulted" | [19] CoinDesk 采访转述 | observed | |
| V15 | Goldfeder 称 "We're no more or less decentralized today than we were yesterday" | [19] | observed | |
| V16 | McCorry（Arbitrum Foundation）强调 Council 透明、由选举产生，"not hand-picked by us" | [19]；[7] | observed | |
| V17 | Council 成员 Griff Green 用 "all it takes for evil to triumph is for good men to do nothing" 解释决定 | [6] | observed | |
| V18 | Griff Green 在采访中称 "things are not immutable. It's always run on social consensus" | [20] Coinage 采访转述 | observed | |
| V19 | mert（Helius CEO）辩护说 Arbitrum 是 Stage 1，有控制手段却不用才更糟 | [9] | observed | |
| V20 | maxlomu 指出 "ETH was moved on Arbitrum without the user's consent"，并称这一先例影响中立性 | [1]#3 | observed | |
| V21 | Robby Greenfield 认为这项能力 "not scoped to recovery"，是嵌在升级权限里的通用权力 | [1]#4 | observed | |
| V22 | MconnectDAO 要求制定 Emergency Action Policy，称 "Governance shouldn't rely on luck" | [1]#6 | observed | |
| V23 | 论坛 30803 的 6 条社区回复全部肯定结果，其中 3 条附带框架或先例方面的担忧 | [1]#2–#10 逐楼阅读 | observed | |
| V24 | dzack23 指出 Council 介入的是与 Arbitrum 协议漏洞无关的外部事件 | [2]#12 | observed | |
| V25 | dzack23 认为再用紧急行动加快释放会违宪，并开创很坏的先例；Mihal 同样反对 | [2]#15、#16 | observed | |
| V26 | 宪法规定紧急行动需要 9/12 批准，且只能用于影响 Arbitrum 治理链的 "true security emergency" | [25] Section 3 | observed | |
| V27 | 宪法要求紧急行动后发布 "full transparency report" | [25] Section 3 | observed | |
| V28 | 截至 2026-10-07，没有找到本次行动的专门透明度报告 | [36] 论坛搜索首页结果 | speculative | |
| V29 | 这次冻结是对宪法紧急条款的宽泛解释（外部协议漏洞而非链本身漏洞） | 由 V24、V26 推出：触发事件不属于宪法例举的"chain governed by ArbitrumDAO 的关键漏洞" | inferred | |
| V30 | L2BEAT 治理团队称 "this isn't a neutral situation"，并追问 "Why this case and not others" | [22] | observed | |
| V31 | L2BEAT 认为修订路径不构成 "governance being forced by external legal pressure" | [2]#51 | observed | |
| V32 | L2BEAT 把 Arbitrum One 评为 Stage 1；Council 9/12 可无延迟升级；紧急路径没有退出窗口 | [24] | observed | |
| V33 | L2BEAT Stage 1 框架允许存在 Security Council（≥75% 门限） | [23] | observed | |
| V34 | "Stage 1 允许 Council"这条反驳在定义上成立，但同时意味着紧急路径对用户没有退出窗口 | 由 V32、V33 推出：Stage 1 只要求非 Council 升级有 ≥7 天退出窗口 | inferred | |
| V35 | Farside Insights 借此嘲讽 L2BEAT 的退出窗口颜色 | [11] | observed | |
| V36 | X 上有批评者称此事证明 "almost nothing in crypto is truly decentralized" 或违背 DAO 本义 | [12]；[13] | observed | |
| V37 | 有匿名用户称 Arbitrum 是 "a multisig wallet that can unilaterally freeze and steal funds" | [31] 二手转引，未找到原帖 | speculative | |
| V38 | CoinDesk 当作批评者引用的 @xch_chris 只有约 81 粉丝，帖子 49 次浏览 | [15] fxtwitter 元数据 | observed | |
| V39 | KelpDAO 官方公开感谢 Council，并提到 SEAL 911 参与协调 | [8] | observed | |
| V40 | Aave 方面主张 "a thief does not gain lawful ownership of stolen property" | [2]#34 | observed | |
| V41 | 判决债权人一方据报道主张这是欺诈而非盗窃，攻击者取得了所有权 | [21] CoinDesk 转述 | observed | |
| V42 | 律师 Gabriel Shapiro 认为限制令具有约束力，DAO 应先诉讼，而不是自行决定 | [16] | observed | |
| V43 | MegaETH 的 PaperImperium 称 "the Arbitrum Security Council was not kind to the DAO"，理由是冻结让 DAO 暴露于债权人追索 | [17] | observed | |
| V44 | TID Research 在温度检查中因法律风险投弃权，法院命令后转为 FOR | [2]#24、#40 | observed | |
| V45 | 多名代表要求把 DAO 代表直接列为被赔偿方 | [2]#5、#6、#7、#18、#26、#32 | observed | |
| V46 | 冻结后不到两周，资产就受美国法院限制令约束，最终流向需要法院许可 | 由 V9、V10、V12 推出：04-21 冻结，05-01 送达限制令，05-08 命令，转给 Aave LLC 后仍受限制 | inferred | |
| V47 | 多名代表事后要求制定常设的冻结资产处置政策 | [2]#17、#54；[2]#7 第 9 点 | observed | |
| V48 | Bankless 分析认为有冻结能力就有道义责任行动，但这种能力会招来监管 | [28] | observed | |
| V49 | Entropy 指出弃权票也计入法定人数，想置身事外只能不投票 | [2]#19 | observed | |
| V50 | 温度检查的 90.96% 不能直接解读为公众认可冻结能力（投票对象是释放资金，投票者是 DAO 参与者，存在选择偏差） | 由 V7、V49 和 Snapshot 提案标题推出：投票内容是 "Approve Release of Frozen ETH" | inferred | |
| V51 | 本样本 33 条观点中，利益相关方（Offchain Labs、Foundation、Council、Kelp、Aave）全部支持 | §2 表 O1–O5、O22 逐条对照 [5][6][7][8][19][2]#34 | observed | |
| V52 | 没有找到 FBI 关于此案的公告，也没有找到 ZachXBT 对冻结本身的评论 | DuckDuckGo 检索结果；[32] 只有洗钱追踪 | speculative | |
| V53 | 2026-05-24 Council 另一次紧急行动修复的是治理合约漏洞（L1 Timelock renounceRole），属于协议漏洞类的典型用途 | [27] | observed | |
| V54 | Griff Green 在采访中称 DAO 不会释放资金，"unless 100% of it goes straight into users hands"；实际资金转给了受限制令约束的 Aave LLC | [20]；[2]#56；[4] | observed | |

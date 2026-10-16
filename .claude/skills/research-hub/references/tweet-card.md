# 写推特卡片 card.yml（一图速览）

推特卡片是在 X 上**引用（quote）一条源推文**时贴的一张图和一段推文：刷推的人不点开报告，一眼看完“这是什么、为什么现在、我们查到了什么、所以呢”。卡片中间有一张 Excalidraw 手绘配图，先用图把最关键的发现讲出来，文字再补数字和结论。它是报告的第四种阅读深度（5 分钟 / 30 分钟 / 完整 / 推特卡片），比 5 分钟总览还要浅。

- **只有英文版**：推特统一用英文发。卡片和推文的任何字段（含配图标签）出现中文都是错误。报告本身照常中英双语。
- 稿件：`$DIR/card.yml`（你写）；产物：`$DIR/card.png`（`pnpm rh card <slug>` 生成，4:5、1200×1500）。
- 页面：中英文报告页的阅读路径里都多出“推特卡片 / Tweet card”，展示同一张图和同一段推文，有“复制文案”“复制图片”（直接写进剪贴板，在 X 里 ⌘V 粘贴）和“打开源推文”。
- 卡片会**公开出现在 X 上**。私有报告（尤其 `domain: work`）做卡片前先和用户确认哪些内容可以公开；卡片和推文里不放私有站点地址。

## 立场：中立的研究者

卡片以**中立研究者**的身份发布，讲的是这个领域的事实，不是某家公司的立场或计划。

- **尽量不提 Mantle**（以及 `rh.config.json` 的 `cardAvoidTerms` 里的其他词）。报告是为 Mantle 写的也一样：把发现上升到领域层面（“EVM L2”“zk rollup”“chains using SP1”），而不是“Mantle's X”。`rh card` 与 `rh check` 发现这些词时会给警告。
- 只有发现本身就是关于某个项目、且换成泛称就不成立时，才点名；点名任何项目都只陈述可核对的事实（链上读数、官方文档），不评价、不站队。点名 Mantle 前先问用户。
- **不写给某家公司的建议**（“Mantle should…”“we plan to…”）。结论写成领域层面的判断或对所有同类项目都成立的动作（“L2s need their own…”）。
- 用词克制：不用 “huge”“game-changer”“urgent” 这类营销或恐吓口吻；风险写清楚前提（“a large quantum computer **could** break…”，不是 “quantum breaks…”）。
- 改写后的泛化论断同样要有台账依据：报告台账里关于 Mantle 的 observed 行，不能直接当成“所有 L2”的证据；要找泛化的行（例如“L2 在 L1 上的验证器不会随 L1 升级自动 PQ 化”），找不到就不写。
- **泛化时保留台账的范围限定**：台账写“所调研项目”，就写 “no surveyed project”，不能写 “no project”；证据只涉及 SP1 / RISC Zero，就不能写成 “zkVMs”；结论有前提（“继续在 L1 结算并切换新版 blob”）就写进 caption 或推文；只对部分架构成立的（如 zk rollup 才有 SNARK 验证器），在图上标成 “examples”。未审计、PoC、草案阶段的数字要标出来（“unaudited”“draft”）。

## 版块与深度控制

| 版块 | 回答什么 | 上限（字符） | 大约 |
|---|---|---|---|
| `title` | 主题 + 结论的钩子 | 56 | 2 行 |
| `background` | 不懂这个领域的人必须先知道的**一件事**（是什么、为什么重要） | 104 | 2 行 |
| `context` | 为什么是现在：源推文说了什么、最近发生了什么 | 104 | 2 行 |
| `figure.caption` | 配图的一句话说明：图的适用范围 / 前提，或图回答的问题 | 44 | 1 行 |
| `figure.excalidraw` | 配图：把最关键的一条发现画出来 | 2–8 个节点 | 见下文“配图” |
| `findings` | 我们的调研结论，**2–3 条，通常 2 条**（有配图，3 条只有每条都很短时才放得下） | 每条 76 | 2 行 |
| `findings[].stat` | 可选：这条发现的关键数字 | 8，且一行放得下 | `6/14`、`~37×`、`$1.2B` |
| `takeaway` | 一句 so-what | 96 | 2 行 |
| `tweet` | 配图发的推文文案（不画进图） | X 计数 80 – `cardTweetMax` | 见下文“推文文案” |

`rh check` 与 `rh card` 按 schema 检查上限；`rh card` 还在固定画布上排版，**超出画布就失败**。超出时删内容（先删一条发现，再把各段压到 1–2 行），不要想办法缩小字号。

卡片版式（`rh card` 固定生成，不用写）：标题；背景与现状各一段，上方是彩色小标签、左侧一条色条；配图；发现；结论框；页脚左边是日期（`date`，默认 meta 的 `updated`），右边是水印（`rh.config.json` 的 `cardHandle`，如 `@whisker17`）。换水印后所有卡片都要重新 `rh card`（`rh check` 会提示）。

深度的取舍：

- **背景只讲一件事。** 不是报告的“前置知识”面板缩写；挑读者不知道就看不懂发现的那一个概念。
- **现状对准源推文。** 卡片配的是那条推文：写它宣布了什么、和我们的调研有什么关系。一份报告只有一张卡片；换一条源推文引用时，按需改 `context`、`tweet` 和 `quote` 后重新 `rh card`。
- **发现 = 我们独有的东西。** 优先写报告里查到、源推文没说的：链上读数、对比、反直觉的事实、修正。不要复述源推文。
- **每条发现一个论断。** 一条只说一件事，能带一个数字就带（stat 是读者扫视时第一眼看到的）。
- **结论是判断，**不是摘要的重复。
- **图和文字分工。** 图画结构或对比（谁在哪、哪边有问题），发现写图里放不下的数字和后果。图已经讲清楚的那条发现可以删掉，把位置留给别的发现。

## 配图（Excalidraw）

`figure.excalidraw` 与 explainer 里 ` ```excalidraw ` 代码块的 JSON 规格完全相同（完整语法：`node <am> help excalidraw`，写法见 am 文档 `references/diagrams.md` §4），在 YAML 里可以写成行内 `{ … }`。`rh card` 把它交给 answer-me-with-html 渲染并烘焙成手绘 SVG，放在卡片中间的浅色图区里。

- **图区约 508×132（卡片坐标）**，图按比例等比缩放。缩放后**图里任何一段文字小于 16px 就失败**（相当于手机信息流里约 9.6px，再小就要点开才能看）。实际上就是：**一行、2–3 个节点**，原图宽约 570 以内、高约 125 以内，节点 `fontSize` 20–22。不要画多行的图。
- **分组标题用 `texts`，不要用 `boxes` 的 `label`**：am 把 boxes 的标签固定为 14px，缩放后一定过小。写法见下面的示例（节点用 `x` / `y` 摆位，标题 `texts` 放在节点上方 36px 处）。
- **一张图只讲一件事**，2–8 个节点。常用三种：
  - **对比 / 分组**：两个节点并排，各带一个 `texts` 标题（如 “L1 protocol migration / L2-managed examples”），只有问题那组用红色。
  - **流程**：一行 3–4 个节点，边上写动词（“signs”“verifies”“upgrades”），出问题的那一步标红。
  - **前后对比**：同样的布局画两次，只改变化的那一处。
- 颜色含义和 am 一致：绿 = 结论 / 安全，红 = 问题 / 风险，蓝 = 被解释的对象，灰虚线 = 已知或外部，黄 = 假设。全图只强调一处。
- 节点里写名字和关键参数（`ECDSA upgrade multisig`、`BN254 SNARK verifier`），不写句子，最多 2 行（太长 am 会自动折成 3 行，要缩短）；节点标签和正文用同样的术语。
- `caption` 写图的适用范围或前提（“L1-settled L2s adopting new blob formats”），或图回答的问题；不要重复图里的分组标题。
- am 的布局检查照常生效：“overlap”就调位置；“needs about N px”就加大 `grid.w` 或缩短边标签。
- 图里的每个事实同样要能在台账里找到。

## 推文文案（`tweet`）

配图发的推文文案。它**不画进图片**，在报告页卡片模式里显示，有“复制文案”按钮；改文案不需要重新 `rh card`。

- **长度**：按 X 的计数（`twitter-text`：英文、数字、常用标点算 1，链接算 23，emoji 算 2），下限 80，上限是 `rh.config.json` 的 `cardTweetMax`（非会员 280；当前账号是 X 会员，设为 1000）。
- **会员长文会折叠**：信息流里大约 280 之后显示 “Show more”。所以**第一段（第一个空行之前）必须能独立成立**，控制在 280 以内（`rh card` 会打印第一段的计数，超了会警告）。
- **作用是帮读者读懂图**，不是把图上的字再抄一遍。长文按这个顺序，段间空一行，用 `•` 列点：
  1. **钩子 + 分界**（折叠前的第一段）：一个常见的误解或问题，加上这件事的关键分界——通常就是图要表达的那条线。
  2. **为什么重要**：一两句背景，补卡片上 `background` 放不下的部分。
  3. **怎么读图**（“How to read the figure”）：图左 / 图右 / 箭头分别是什么，图的适用前提。
  4. **细节**（“Two details”）：把卡片上的发现展开成完整的句子，说清机制和数字的含义。
  5. **限定**（“Caveat”）：一个反直觉的事实或范围限定，以及调研范围（“no surveyed project…”）。
  非会员（280）时只写 1、3、5 各一两句。
- 和卡片同样的规则：中立研究者口吻、不提 `cardAvoidTerms` 里的词、只用台账里 observed / inferred 的论断、保留范围限定（“surveyed”“unaudited”“examples”）。
- 纯文本：不要用 `**`（X 不支持 Markdown）；不加 hashtag 和 emoji，除非用户要求；私有报告不放链接。
- 文案是引用源推文时发的：不用重复源推文说了什么，直接接上它的话题。

## 证据规则（与 explainer 相同）

- 卡片和推文里每个论断都必须在 `research/ledger.md` 有对应行；只能用 observed / inferred 的论断。**不要把 speculative 写进卡片或推文**（这里没有地方标注推测）。
- 数字要和台账、报告页一致（四舍五入方向也一致）。写 `~37×` 这类近似值时，台账里要有算法。
- 在 `card.yml` 开头用注释写上各部分依据的台账行号，方便审查。

## 格式

```yaml
# 推特卡片（只有英文版）：pnpm rh card <slug> → card.png
# 台账依据：background T1；context E18；figure E59/E63/E64；findings P54/P58、P28/P31；tweet 另用 E61……
quote: https://x.com/<handle>/status/<id>   # 可选：要引用的源推文，只在页面上显示为链接，不画进图
title: "Post-quantum: L1 upgrades do not cover all of L2"   # 含冒号的值加引号
background: A large quantum computer could break EVM signatures, KZG and curve-based SNARKs; hashes lose margin.
context: "Aztec: choose PQ schemes in 2027, migrate by 2030. Ethereum's Dec 2029 target is L1-only."
figure:
  caption: L1-settled L2s adopting new blob formats   # 写清图的适用范围 / 前提
  excalidraw:
    defaults: { fontSize: 21 }
    nodes:
      - { id: l1, label: "BLS consensus\nKZG blobs", x: 0, y: 36, w: 250, h: 84, color: green }
      - { id: l2, label: "ECDSA upgrade multisig\nBN254 SNARK verifier", x: 300, y: 36, w: 270, h: 84, color: red }
    texts:   # 分组标题：用 texts 并写 fontSize（boxes 的 label 固定 14px，缩放后太小）
      - { x: 4, y: 0, text: "L1 protocol migration", fontSize: 22, color: green }
      - { x: 304, y: 0, text: "L2-managed examples", fontSize: 22, color: red }
findings:
  - stat: BN254
    text: "SP1 / RISC Zero: STARK-to-BN254 wrapping is not post-quantum."
  - "ML-DSA-44: 2,420 B (~37× ECDSA); unaudited verifiers: ~1.2M–8.1M gas."   # 不带 stat 时可直接写字符串
takeaway: No project surveyed is fully PQ; L2s need their own migration plans, not just L1 upgrades.
tweet: |-   # 多行用 |-，段间空一行；第一段 ≤ 280 且能独立成立
  It's easy to assume L2s are covered once Ethereum goes post-quantum. Only partly: Ethereum's Dec 2029 PQ target is the L1 protocol itself (execution, consensus, data).

  Why it matters: …

  How to read the figure (L2s that settle on L1):
  • Left: …
  • Right, examples: …

  Two details:
  • …

  Caveat: … No surveyed project is fully PQ yet.
# date: 2026-10-16   # 可选：卡片页脚的日期，默认用 meta 的 updated
```

- 卡片各段一行，不能换行；只支持 `**强调**`（画成高亮），其余 Markdown 原样显示。
- 写完交给 `astra-6` subagent（模型 `mantle/gpt-6-astra`，agent `reviewer`）审：论断与台账是否一致、范围限定、中立性、英文自然度、读图是否顺畅。按意见修改，多轮直到 PASS。

## 流程

1. 写 `card.yml`（新报告在把关 ③ 之前写好，和页面一起审；已发布的报告见 SKILL.md §9）。
2. `pnpm rh card <slug>`：失败就按提示删减后重试；排版失败时，被裁掉的预览在 `.rh/cards/<slug>/overflow.png`。输出里的“剩余空白”是还能加的余量，最后打印推文全文与 X 计数。
3. 用 Read 工具看 `card.png`：文字截断、数字放不下、高亮过多（最多 2–3 处）、配图字太小或和文字重复、出现了 `cardAvoidTerms` 警告都要改。
4. astra-6 审查，达成一致（PASS）。
5. `pnpm rh check <slug>`：`card.yml`（或水印）改过而 PNG 没重新渲染、推文超长、出现中文都会报错。
6. 交给用户审阅（把关 ③）：`card.png`、推文全文（含 X 计数）和各部分依据的台账行；用户批准后 `pnpm rh publish <slug> --note "推特卡片"` 上线。

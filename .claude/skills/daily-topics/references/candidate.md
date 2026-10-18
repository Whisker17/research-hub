# 候选 `out/topics.yml` 的格式与规则

rh（`rh daily import`）把这个文件当作不可信输入逐条检查。**整体拒绝**：整份候选作废，当天没有推荐。**丢弃**：只丢掉那个 topic，其余照常发布。下面每条规则后面写了违反时的后果。

## 文件结构

```yaml
schema: 1
date: "2026-10-18"            # 必须等于 context.json 的 date（否则整体拒绝）
note: "…"                     # 可选；topic 少于 5 个时必须写（为什么不足 5 个）。公开文字
topics:                       # 0–10 个（超过 10 个整体拒绝）
  - title: "…"                # 中文标题
    title_en: "…"             # 英文标题
    domain: "crypto"          # 只能是 crypto
    tags: []                  # 只能用 context.json 的 public_tags 里的键
    proposed_tags: ["…"]      # 建议的新标签：slug 格式，不能和 public_tags 或 tags 重复
    why_now: "…"
    questions: ["…", "…"]     # 1–3 个
    angle: "…"
    novelty: { kind: "new", related: [] }   # kind: new | update；related 只能是 public_reports 的 slug
    references:               # 1–6 条，只用 item_id
      - item_id: "ethtao:2111165223780454451"
        type: "primary"       # 可省略：省略时 rh 按来源类别填默认值
        note: "…"             # 把 type 调得比默认值高时必须写
    confidence: "medium"      # high | medium | low
```

- **只能有这些键**。topic 里多一个键（例如自己写 `id`、`evidence`、`summary`、`url`）就会被丢弃；顶层多一个键会整体拒绝。
- **所有字符串都用双引号**，里面的双引号写成 `\"`。不要用 YAML 锚点和别名（`&`、`*`），出现就整体拒绝。
- 文件不超过 64 KiB。

## 长度上限

按字符数计；超过就丢弃这个 topic（当天的 `note` 超过就整体拒绝）。

| 字段 | 上限 |
| --- | --- |
| `title` | 120 |
| `title_en` | 200 |
| `why_now` | 800 |
| `question` | 300 |
| `angle` | 600 |
| `refNote` | 300 |
| `dayNote` | 600 |
| `tags` | 8 |
| `proposedTags` | 4 |
| `related` | 6 |

`question` 指 `questions` 里的每一条，`refNote` 指引用的 `note`，`dayNote` 指当天的 `note`；`tags`、`proposedTags`（即 `proposed_tags`）、`related` 是条数。另外：`questions` 1–3 条，`references` 1–6 条，每个 topic 最多 10 个。

## 引用

- `item_id` 必须原样来自 `items.jsonl` 某一行的 `id`。写错或编造 → 丢弃（`forged_reference`）。
- 同一个 topic 里同一条目只引用一次（`duplicate_reference`）；两个 topic 的引用集合完全相同 → 后一个被丢弃（`duplicate_topic`）。
- 不写 `extra` 引用（本 skill 的规定：它不算证据，而且 URL 都来自不可信文本）。
- **默认类型**（省略 `type` 时 rh 填的值）按来源类别：

| 来源 `source` | 类别 | 默认 `type` |
| --- | --- | --- |
| `ethtao` | x | secondary |
| `ethresearch` | forum | primary |
| `magicians` | forum | primary |
| `theblock` | news | secondary |
| `blockbeats` | aggregator | secondary |
| `odaily` | aggregator | secondary |

- `type` 可以随意往下调（`primary` → `secondary` → `discussion`），例如论坛里只是讨论、没有一手信息时标 `discussion`。
- **往上调**（例如把 ETHTAO 转来的项目官方账号公告、EIP 作者本人的帖子标成 `primary`）时，`note` 里必须写明这是谁的一手陈述，例如 `"Chainlink 官方账号对自家产品的发布说明"`。没写 `note` → 丢弃（`primary_note`）。只在作者本人就是事件当事方时这样做：转述别人的消息、评论、预测都不是一手陈述。

## 证据规则（每个 topic 都必须满足，否则丢弃：`evidence`）

**至少 2 个独立出处，或者至少 1 条 `type: primary` 的引用。** 出处由 rh 按下面的顺序为每条引用确定，你写之前要自己算一遍：

1. 条目的 `origin_url` 不为 null → 取它的主机名（小写，去掉 `www.`）。`x.com` / `twitter.com` 的链接按账号算（`x:<路径第一段>`），`github.com` 按 owner 算（`github:<owner>`）。
2. 否则，`ethtao` 条目 → 原帖作者 `x:<author>`。
3. 否则，`ethresearch`、`magicians`、`theblock` 条目 → 条目 `url` 的主机名（同一个论坛的不同帖子只算一个出处）。
4. 否则（`blockbeats`、`odaily` 且没有 `origin_url`）→ **不算出处**。

不同出处的个数就是独立出处数。容易算错的地方：

- 几条快讯或几条推文转述同一份公告（`origin_url` 指向同一个主机），只算 **1** 个出处。
- ETHTAO 条目有 `origin_url` 时，出处是 `origin_url`，不是发帖的作者。引用帖的 `origin_url` 是被引用的原帖。
- 没有 `origin_url` 的快讯不算出处，引用它只能补充背景。
- Odaily 的“星球早讯 / 午讯 / 晚讯”是当天快讯的合集，不是独立来源，不要引用。

## 公开文字

`title`、`title_en`、`why_now`、每条 `questions`、`angle`、每条引用的 `note`、当天的 `note` 都会公开显示。

- **转载比对**：rh 把每段公开文字和被引用条目的摘录比较（空白先合并，条目标题部分不算）：连续 50 个以上的字符相同就判定为转载，丢弃这个 topic（`verbatim`）。当天的 `note` 和**所有**条目比较，转载就整体拒绝。
- `avoid_terms` 里的词出现时 rh 只给警告，但本 skill 要求一个都不出现。

## 标签与关联报告

- `tags` 里的每个键都必须在 `public_tags` 里（`tag`）；`public_tags` 为空时 `tags` 就写 `[]`。
- `proposed_tags` 是 slug 格式（小写字母、数字、单个连字符分隔），不能出现在 `public_tags` 或本 topic 的 `tags` 里（`proposed_tag`）。
- `novelty.related` 只能是 `public_reports` 里的 `slug`（`related`）；`kind: update` 时 `related` 不能为空。

## topic 少于 5 个时的 `note`

用一两句中立的话说明原因，不点名具体条目，不复述条目内容，例如：

- `"当天条目以行情和活动公告为主，满足证据要求的研究题目只有 3 个。"`
- `"当天没有以太坊日报，只用其他来源生成，满足证据要求的题目较少。"`（`digest.status` 不是 `found` 时）
- 一个都没有：`topics: []`，`note: "当天的条目里没有满足证据要求、值得做成报告的研究题目。"`

## 写完自查

逐个 topic 核对，有一项不满足就改，改不了就删掉这个 topic：

1. 只有允许的键；字符串都加了双引号；没有 `id`、`evidence`、`extra`。
2. 长度和条数都在上限内；`questions` 1–3 条，`references` 1–6 条。
3. 每个 `item_id` 都能在 `items.jsonl` 里找到原样的一行；同一 topic 内不重复；没有两个 topic 的引用集合完全相同。
4. 按上面的算法，独立出处 ≥ 2，或者有 1 条 `primary`；往上调的引用都写了 `note`；每条引用都直接讲这个 topic 的事件，没有为凑出处硬加的条目，也没有把不相关的事件合在一起。
5. `tags` ⊆ `public_tags`；`proposed_tags` 是 slug 且不和公开标签重复；`related` ⊆ `public_reports`；`update` 时 `related` 不为空。
6. 公开文字是自己的话，没有和摘录连续相同的长片段；没有 URL、Markdown、HTML；没有 `avoid_terms` 里的词。
7. 不是纯行情、营销、闲聊；不和 `recent_days` 里的 topic 重复（除非 `why_now` 写明了新进展）。
8. `date` 等于 `context.json` 的 `date`；topic 少于 5 个时写了 `note`。

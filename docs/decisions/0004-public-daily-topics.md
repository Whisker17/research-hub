# 0004：公开 Daily Topics——边界、时间窗、状态机、保留期与 GitHub Actions 运行方式

- 状态：提议（WHI-1927，等待所有者批准）
- 日期：2026-10-18
- 规格：[../product-spec.md](../product-spec.md) §3.1、§3.4、§5、§7
- 依据：[../research/daily-sources.md](../research/daily-sources.md)（WHI-1925，Actions runner 实测）；Linear 项目文档“research-hub 0.1.0 规划”§4、§6（§6 取代 §4 里冲突的部分）；Linear 文档“Release 0.1.0 — orchestration”的所有者决定 1
- 与 [0003](0003-index-redesign-scope-routes-publishing.md) 的关系：0003 预留了公开路由 `/daily/`、`/daily/<date>/`，规定了按站点投影、资源清单和泄漏检查。本文规定 Daily 的数据、状态和运行方式，并沿用 0003 的规则。
- 实施：WHI-1929（数据模型与 `rh daily check`）、WHI-1931（`rh ingest`）、WHI-1933（`daily-topics` skill）、WHI-1935（`rh topic`）、WHI-1936（公开页面）、WHI-1937（workflow）、WHI-1938（三天试运行与验收）

## 背景

1. **所有者决定（2026-10-18）**：只做 crypto；ETHTAO 的“以太坊日报”是核心源；每日任务跑在 GitHub Actions 上；Daily 推荐全部公开（`/daily/`）；BlockBeats 有调用配额；每天给 5–10 个 topic，由所有者挑选。LLM 通过所有者自建的网关调用（Anthropic 协议的 base URL + key，放在 GitHub secrets 的 `LLM_BASE_URL` / `LLM_API_KEY`）。
2. **和现有规则冲突的地方**：规格 §3.1 / §7 写的是“不做全自动流水线”；`AGENTS.md` 写的是 `rh` 不调用 LLM、报告默认私有、只有三个人工把关点。Daily 每天无人值守地往 `main` 写公开内容，所以需要写明它是哪一种例外、边界在哪里（决定 1）。
3. **实测（WHI-1925，runner run 39128600115，2026-10-18）**：
   - 最近 100 期日报的发布时间在 **02:18–12:55 UTC** 之间，中位数 03:11；18/100 晚于 04:30，2/100 晚于 07:00，1/100 晚于 10:00。规划里的 04:30 / 08:00 / 10:00 UTC 三次运行分别能看到 82% / 98% / 99% 的日报；按原计划，最晚的那 1% 会被标成降级。7 月初有几个周末没有日报；07-27 到 10-18 每天都有，没有重复日期。
   - FxTwitter 的 `since` 参数只用来判断有没有新帖子（没有时返回 204），`count` 参数不起作用，时间要在客户端自己过滤。时间线接口偶尔返回 404，重试一次就好。
   - 29% 的“[原文]”链接指向转推。原始作者和转推人不同；有 7/58 条的署名和链接不一致。11/59 条原帖带有外部链接（`card.url`），这时外部链接才是真正的出处。
   - 只看 ETHTAO，每天大约有 3 条值得研究的内容，低于 5–10 条的目标，所以需要其他源补充。
   - 所有者决定：0.1.0 不给 ETHTAO 做兜底源（FxTwitter 失败就记为降级）；BlockBeats 的配额不公开，预算定为每天 4 次、硬上限 6 次，跨运行累计。
4. **时间窗实测（本 ADR，用 WHI-1925 的三天夹具）**：日报 D 引用的 59 条帖子用 X 的 snowflake id 解出发帖时间，**59/59 都在 UTC 日 D−1 内**（`[D−1 00:00Z, D 00:00Z)`），解出的时间和日报自身的 `created_at` 对得上，精确到秒。转推解析后的 59 条原帖中，54 条也在这一天，另外 5 条是更早帖子的转推。样本只有三天，所以这里只把它当作选择时间窗的依据，不当作保证。
5. **代码现状（读代码核对，基线 0c48981）**：
   - `rh` 现有的命令是 `new / import / render / card / check / publish / build / tags / list / paths`，还没有 `daily`、`ingest`、`topic`。
   - `lib/schema.ts` 只有报告 meta 和 `tags.yml` 的 zod schema，`domain` 有 5 个取值。
   - `cli/lib/build.ts` 的 `assemble()` 现在把 Astro 产物里 `p/` 以外的顶层目录都放进公开站点；0003 决定 4 把它改成清单制（WHI-1926）。泄漏检查扫描公开产物中的每个文件。
   - `.rh/` 已经在 gitignore 里。
   - `rh.config.json` 有 `cardAvoidTerms: ["Mantle"]`，没有 `dailyAvoidTerms`。
   - `deploy.yml` 在 push 到 `main`、PR 和手动 dispatch 时触发，只有在 `main` 上、并且 `DEPLOY_ENABLED` 为 true 时才部署；checkout、artifact 命名和部署说明都用 `github.sha`。用 `GITHUB_TOKEN` 推送不会触发其他 push workflow。
   - GitHub 仓库本身是 private。

## 决定

### 1. 边界：Daily 只发布“推荐”

- Daily 的产物只有 `daily/` 下的推荐数据和由它渲染出的 `/daily/` 页面。它**不建报告、不发布报告、不写 vault**。每篇报告仍然要过 ①②③ 三个把关点，包括从 Daily topic 开始的报告（决定 9）。
- 这是规格 §3.1“不做全自动流水线”的**有界例外**，例外只覆盖下面三点：
  - 只写推荐：commit job 只能写本次处理的那个日期目录下的 `manifest.json` 和 `topics.yml`，其他路径一律拒绝（决定 11）。
  - 只用公开输入：见决定 2。
  - 写坏了能整体回滚：Daily 的数据和报告互不依赖，revert 一个日期目录不影响任何报告。
  
  vault 变更自动触发发布、自动建报告，仍然不做。
- `rh` 仍然不调用 LLM。调 LLM 的只有 workflow 的 generate job（`daily-topics` skill，WHI-1933）。`rh` 在这里只做确定性的工作：抓取并规范化数据（`rh ingest` 会联网，但同样的响应一定得到同样的结果）、导入候选、计算派生字段、做检查。
- 公开的含义沿用公开站点的现状：不需要登录就能访问，但全站 noindex，robots 禁止抓取。从 Daily topic 建出的报告仍然**默认 private**，因为 Daily 公开不代表报告公开。

### 2. 输入隔离与信任边界

- generate job 的输入目录里**只放公开上下文**：
  1. 当天的条目（规范化后的条目，摘录不超过 400 字）；
  2. public + published 报告的 meta（`slug`、`title`、`title_en`、`summary`、`summary_en`、`domain`、`tags`、`created`、`updated`）；
  3. D−14 到 D−1 这 14 天里各个 topic 的公开字段；
  4. 公开标签投影（被至少一篇 public + published 报告用到的标签，0003 决定 6）；
  5. `dailyAvoidTerms`。
  
  不放的有：private 或 draft 报告、`daily/state.yml`、vault、完整的 `tags.yml`、任何凭据。0.1.0 不和私有报告去重，这一项进 backlog。代价是 Daily 可能推荐一个已经有私有报告的题目。
- **“只有公开上下文”要靠真实权限保证，不能只靠提示词或 `allowedTools`**：generate job 不 checkout 仓库（仓库里有私有报告），只拿 ingest job 打包好的输入目录。模型的工具不能接触任何能读仓库的凭据，它也不能 push。这个 runner 上唯一的秘密是进程环境里的 LLM key，所以必须用专用的、有额度上限的 key。WHI-1937 的负向测试要证明三件事：模型读不到私有文件，也读不到这个 key（包括 `/proc/*/environ`）；模型写不了仓库；模型不能通过 Bash 或 WebFetch 把数据送出去。
- 来源文本一律当作数据，不当作指令（防提示注入）。所以 generate job 的产出（候选目录）是**不可信输入**：commit job 先严格校验再导入（决定 7、决定 11）。即使注入成功，最坏结果也只是某一天的公开页面上出现了坏内容：这些内容已经过 schema、引用和泄漏检查，revert 那个日期目录就能清掉（runbook 见 WHI-1937）。
- 公开页面不读 `state.yml`，也不读 manifest 的内部字段（决定 10）。

### 3. 中立口吻与版权

- **中立口吻**：Daily 以中立研究者的身份发布，不写给某家公司的建议，不推荐纯行情（只讲价格涨跌、没有机制或事件的内容）。`rh.config.json` 新增 `dailyAvoidTerms`；不设置时沿用 `cardAvoidTerms`（目前是 `["Mantle"]`）。这些词出现在 topic 的任何公开文字里时给警告，不报错。公开文字指 `title`、`title_en`、`why_now`、`questions`、`angle`、引用的 `note` 和当天的 `note`。commit job 把警告写进 job summary 和 manifest 的内部计数。
- **版权**：公开页面只显示三样东西：标题（新闻、论坛主题、X Article 的标题；X 普通帖子没有标题，显示作者和日期）、链接、我们自己写的文字。不转载正文、摘录或来源图片（例如 BlockBeats 的 `pic`），也不展示 ETHTAO 日报每条的中文摘要（那是 ETHTAO 写的文字）。ETHTAO 作为 `via` 署名，并链接到当天的日报帖子。
- 仓库里**只存被引用条目的元数据**（决定 6），不存正文。摘录只存在于 30 天的 Actions artifact 和本地 `.rh/` 缓存里。commit job 还会拿 topic 的公开文字和被引用条目的摘录比对（标题不算，空白先规范化）：只要有连续 50 个以上的字符相同，就判定为转载，丢弃这个 topic（决定 7）。
- 不存正文不等于自动免责。每接入一个新源之前，都要像 WHI-1925 §4 那样记录它的条款依据。

### 4. 日期、时间窗与运行时刻

- **Daily 日期 D** 就是 ETHTAO 日报第一行“以太坊日报 D”里的日期，不是抓取日期，也不是发帖日期。识别日报只看第一行的正则（两种空格写法都要认），时间线里的其他帖子一律跳过。如果同一个 D 出现多条日报，用最早的一条，其余记进 manifest。
- **时间窗 W(D) = `[D−1T00:00:00Z, DT00:00:00Z)`**，也就是 D 前一天的 UTC 自然日，左闭右开。依据是背景 4：日报 D 引用的帖子都在这个区间里。
  - 其他源的条目按自己的发布时间归入时间窗：BlockBeats 和 Odaily 的 UTC+8 时间要先显式转换，Discourse 用 `created_at`。归窗只看发布时间，不管是哪一次运行抓到的。
  - ETHTAO 的条目按“是否被日报 D 引用”归入 D，不受时间窗限制，引用的帖子更早也照样收。
  - 相邻两天的时间窗首尾相接、不重叠，所以其他源的每个条目只属于一天。
- 一次抓取覆盖不到整个时间窗的源（比如 BlockBeats 一次调用只覆盖约 24 小时；RSS 不能翻页，补跑时可能够不到），在 manifest 里记为 `partial`，并写明实际覆盖的区间。怎么补齐（翻页，或复用前一次运行缓存的条目）由 WHI-1931 实现。
- **运行时刻（决定）**：每天 **04:30、08:15、13:30 UTC**。依据背景 3：04:30 时 82% 的日报已发布，08:15 时 ≥98%，13:30 时是 100%（100 期里最晚的一期是 12:55）。D 的**最后一次尝试时刻** `T_last(D) = D 13:30 UTC`。
  - 状态按 ingest 实际查找日报的时刻 t 判定，和是哪一次计划运行无关：GitHub 的定时任务可能延迟或被跳过，延迟到 13:30 以后的 08:15 运行也按“最后一次尝试”处理。
  - 每次计划运行处理今天（UTC）；如果昨天还不是终态，也一并处理昨天。这样 13:30 那次运行被跳过时，第二天 04:30 会把前一天收尾，迟到的日报还有一次被收进来的机会。更早的日期只能手动补跑（`workflow_dispatch`）。
  - 具体的 cron 写法（例如为了避开整点拥堵挪几分钟）由 WHI-1937 决定，但不能让 `T_last` 早于 13:30。
- BlockBeats 预算不变：每天 4 次，硬上限 6 次，跨运行累计，重试、补跑、regenerate 都算。按 WHI-1925 的“上次成功调用不到 6 小时就跳过”规则，三次运行在正常日子里只会调用 2 次。

### 5. 状态机（`manifest.json` 的 `status`）

| 状态 | 含义 | 是否终态 |
| --- | --- | --- |
| `pending` | 还没有 `topics.yml`：日报还没发布、抓日报失败，或这次生成失败；之后的运行会再试 | 否 |
| `complete` | 找到了日报，候选已导入，有 5–10 个 topic | 是 |
| `degraded` | 有 1–10 个 topic，但 topic 少于 5 个，或者日报缺失 / 抓取失败（只用其他源生成） | 是 |
| `empty` | 收尾时 0 个 topic（原因必填） | 是 |

D 的一次运行（t 是 ingest 查找日报的时刻）按下面的规则推进：

| 当前 | 条件 | 结果 |
| --- | --- | --- |
| 无 / `pending` | 找到日报 → 生成 → 候选通过 | 按 topic 数：≥5 → `complete`；1–4 → `degraded`（`few_topics`）；0 → `empty`（`no_qualifying_topic`） |
| 无 / `pending` | t < `T_last`，日报还没发布或抓取失败 | `pending`（`digest_not_posted` / `digest_fetch_failed`），**不调用生成** |
| 无 / `pending` | t < `T_last`，生成失败或候选被整体拒绝 | `pending`（`generator_failed` / `candidate_rejected`） |
| 无 / `pending` | t ≥ `T_last`，仍然没有日报 | 只用其他源生成：≥1 个 topic → `degraded`（`digest_not_posted` / `digest_fetch_failed`，不足 5 个时加上 `few_topics`）；0 个 → `empty` |
| 无 / `pending` | t ≥ `T_last`，生成失败或候选被整体拒绝 | `empty`（`generator_failed` / `candidate_rejected`） |
| 终态 | 计划运行 | 什么都不做，不提交 |
| 任意 | 手动 `regenerate`（指定日期） | 按上表重新走一遍；新候选通过导入**而且**通过 `rh daily check` 才替换旧结果，否则原样保留，不提交 |

- 原因写在 `reasons[]` 里，取值是固定的代码：`digest_not_posted`、`digest_fetch_failed`、`generator_failed`、`candidate_rejected`、`few_topics`、`no_qualifying_topic`、`no_items`。公开页面把代码映射成固定的中英文说明（WHI-1936），不显示原始错误信息。
- 没有日报，其他源的条目也是 0 条时，不调用生成：还没到 `T_last` 就是 `pending`，到了就是 `empty`（加上 `no_items`）。
- `pending` 时的 manifest 只在状态或原因变化时才提交，避免每次运行都产生一个提交。
- 生成器给出的“为什么不足 5 条”的说明写进 `topics.yml` 的 `note` 字段：它是公开文字，同样受决定 3 的约束。
- 0..10 条都合法。少于 5 条就是 `degraded`；0 条是单独的 `empty`。

### 6. 仓库布局、所有权与保留期

```
daily/
  state.yml                 人工状态：只由 rh topic 写；公开页面不读取
  YYYY/MM/DD/
    manifest.json           运行记录：commit job（rh）写
    topics.yml              推荐：判断类字段来自生成器，派生字段和 items 由 rh 写；只由 commit job 写入
```

- **`manifest.json`** 的字段（具体 schema 由 WHI-1929 定）：
  - `schema`、`date`、`status`、`reasons[]`；
  - `window {from, to}`；
  - `digest {status: found | not_posted | fetch_failed, url, posted_at}`；
  - `sources[] {id, status: ok | partial | failed | skipped, items, calls, covered, error}`；
  - `counts {items, cited_items, topics, dropped}`；
  - `generator {skill_version, model, inputs_sha256}`：由 job 写，不由模型写；
  - `run {id, attempt, at}`、`generated_at`、`updated_at`。
  
  源状态（`ok | partial | failed | skipped`）和日期状态是两套词表：BlockBeats 预算用完记为 `skipped`，返回的 body 里 `status ≠ 0` 记为 `failed`。这些只影响这个源的记录；日期状态只看日报和 topic 数（决定 5）。
- **`topics.yml`** = `schema`、`date`、可选的 `note`、`topics[]`（决定 7），再加一个 `items` 映射：只收被引用的条目，每条只存元数据——`source`、`url`（canonical）、`origin_url`、`title`（X 普通帖子为空）、`author`（X 原帖作者）、`reposted_by`、`via`（ETHTAO 日报链接）、`published_at`、`fetched_at`、`incomplete`（X Article 只有标题和预览时为 true）。不存正文和摘录。有了这些，构建只读仓库就能渲染页面，不需要任何 artifact。
- **完整条目**（items.jsonl，含不超过 400 字的摘录）**只放在 30 天的 Actions artifact 里**，本地运行时放在 `.rh/daily/`（已 gitignore）。仓库是 private 的，artifact 和日志只有仓库协作者能看到，都不进入任何站点产物。
- `inputs_sha256` 只能用来**认出**某次输出是由哪一份输入生成的，**不能用它恢复输入**。artifact 过期后，原始输入就没有了，只剩 `topics.yml` 里被引用条目的元数据。
- 所有权：生成器（模型）只写候选目录；`rh`（commit job）是唯一写日期目录的；`rh topic`（所有者在主克隆里执行）是唯一写 `state.yml` 的。这两条路径不重叠，所以 workflow 的 rebase 不会和人工提交发生内容冲突；万一冲突就让这次运行失败，不自动解决（GIT_WORKFLOW § Content lane）。

### 7. Topic v1 字段与导入

| 字段 | 谁写 | 规则 |
| --- | --- | --- |
| `id` | rh | `D-` 加 6 位十六进制，取 sha256 的前缀，哈希的内容是排序后的引用键（`item_id`，或 `extra:<canonical URL>`），例：`2026-10-18-3fa9c1`。只改措辞时 id 不变，所以 `state.yml` 里的引用不会因此失效；同一天两个 topic 引用完全相同就算重复 |
| `title` / `title_en` | 生成器 | 中文标题和英文标题，都必填（站点有语言切换）；正文字段用中文 |
| `domain` | 生成器 | 0.1.0 只能是 `crypto` |
| `tags` | 生成器 | 必须在公开标签投影里 |
| `proposed_tags` | 生成器 | slug 格式，不能和公开标签投影重复；只当普通 chip 显示，即使和某个私有标签同名，也不显示那个标签的展示名或描述 |
| `why_now` | 生成器 | 为什么是现在 |
| `questions` | 生成器 | 1–3 个研究问题 |
| `angle` | 生成器 | 研究角度 |
| `novelty` | 生成器 | `{kind: new \| update, related[]}`。`related` 只能是 public + published 报告的 slug；`kind: update` 时 `related` 不能为空 |
| `references` | 生成器；rh 校验 `item_id`，并在生成器没写 `type` 时填入默认值（决定 8） | 1–6 条，每条是 `{item_id \| extra, type: primary \| secondary \| discussion, note}`。`extra` 只能是 http(s) URL |
| `evidence.independent_sources` | rh | 算法见决定 8 |
| `confidence` | 生成器 | `high \| medium \| low`：这个题目值得做成报告的把握 |

- 每个文本字段都有长度上限，候选文件有字节上限（具体数字由 WHI-1929 定）。
- **导入**（commit job 里的 rh 子命令，WHI-1929 实现，WHI-1937 调用）：
  - 先整体检查候选目录：只允许预期的文件名和类型；拒绝符号链接、多余文件和路径逃逸；检查字节上限；YAML 能解析；顶层 schema 合法；topic 不超过 10 个；所有 URL 都是 http(s)。有一项不通过就**整体拒绝**（`candidate_rejected`）。
  - 再逐个检查 topic：字段 schema、`item_id` 必须存在（不能伪造引用）、标签规则、`related` 只能是公开报告、证据规则（决定 8）、转载比对（决定 3）。不通过的 topic 被**丢弃**，记进 `counts.dropped` 和内部原因，其余 topic 照常导入。
  - 最后由 rh 填入 `id`、`evidence` 和 `items`。
- **`rh daily check`**（离线、确定性，跑在 `pnpm verify` 和 CI 里）对已提交的文件做严格检查：重新计算 `id`、`evidence`、`items`，结果不一致就报错；同时检查 schema、引用能否解析、`state.yml` 的不变量（决定 9）。`rh daily probe` 在线检查链接，单独执行，不在 CI 里跑。

### 8. 引用、独立来源与一手来源

- **出处（originator）**：同一个出处只算一个来源。rh 对每条 `item_id` 引用按下面的顺序确定出处：
  1. 条目有 `origin_url`（X 原帖的 `card.url`、BlockBeats 的 `url`、Odaily 的 `sourceUrl`）时，取它的主机名（小写，去掉 `www.`）；
  2. 否则，X 帖子取**原帖作者**：转推和引用帖都追到被转、被引用的原帖，`x:<handle>`；
  3. 否则，一手类或报道类源（Discourse 论坛、The Block）取条目 URL 的主机名；
  4. 否则（聚合源的条目，又没有出处链接）不算出处，计 0。
  
  多租户主机按账号区分：`x.com` / `twitter.com` 记为 `x:<handle>`，`github.com` 记为 `github:<owner>`。
- **`independent_sources`** = 引用里不同出处的个数。`extra` 引用不计入：它们没有经过 ingest，CI 也不联网核对。这样数是保守的（同一个论坛里不同作者的帖子只算一个），但不会把几家媒体改写同一条通稿算成多个来源。
- **一手来源**：rh 先按源的类别给每条引用一个默认类型：论坛（ethresear.ch、Ethereum Magicians）→ `primary`；新闻、聚合快讯、通过日报二跳拿到的 X 帖子 → `secondary`（二跳帖子默认不算一手）。生成器可以随意把类型往下调；要把某条往上调成 `primary`（例如项目官方账号的公告、EIP 作者本人的帖子），`note` 里必须写明这是谁的一手陈述，否则这个 topic 被丢弃。
- **证据规则**（每个 topic 都必须满足）：`independent_sources ≥ 2`，**或者**至少有 1 条 `type: primary` 的 `item_id` 引用。`extra` 不能用来满足这条规则。
- 不推荐纯行情；和最近 14 天的 topic 或已有公开报告重复时，要么不出，要么改成 `kind: update`。这两条 rh 判断不了，由 skill 约束（WHI-1933），再由所有者在 WHI-1933 的夹具评审和 WHI-1938 的试运行里把关。

### 9. 人工状态与选题衔接（`daily/state.yml`）

```yaml
schema: 1
topics:
  2026-10-18-3fa9c1: { state: selected, at: 2026-10-19 }
  2026-10-18-77b0e2: { state: dismissed, at: 2026-10-19, reason: 纯行情 }
  2026-10-17-0c9d41: { state: linked, at: 2026-10-20, report: glamsterdam-hoodi }
```

- 状态转移：无 → `selected` → `linked`；无 / `selected` → `dismissed`；`dismissed` → `selected`（所有者改了主意）；`linked` 是终态。用同样的参数重复执行同一个命令不做任何改动（幂等）；`link` 到另一个 slug 会报错。
- 选题流程：
  1. `rh topic select <id>`：只标记“选中”，打印 brief 草稿要用的材料（研究问题、引用）。选中不等于 brief 已经批准。
  2. research-hub skill 在对话里起草 brief 和 meta。
  3. **把关 ①**。
  4. 写 vault brief、登记标签、`rh new`（默认 private）。
  5. `rh topic link <id> <slug>`：报告必须已经存在，draft 也可以。
  
  另有 `rh topic dismiss <id> --reason <text>`。`select` 不写 vault，也不建报告。
- `rh daily check` 检查的不变量：每个 id 都能在某一天的 `topics.yml` 里找到；`dismissed` 必须有 `reason`；`linked` 的 `report` 必须存在；workflow 的提交没有动 `state.yml`。因此，如果 regenerate 删掉了已经被 `state.yml` 引用的 id，检查会失败，这次就不提交。
- `state.yml` 不出现在公开产物里，包括 dismiss 的理由，以及“某个 topic 已经变成某篇报告”这件事。私有站点 `/p/` 可以显示它（WHI-1936 决定显示多少）。

### 10. 公开投影：`/daily/` 能显示什么

- 可以显示：
  - topic 的生成器字段和 `evidence.independent_sources`；
  - 被引用条目的元数据：标题或作者、链接、来源徽章、`via`、时间；
  - `related` 链接（只指向公开报告）；
  - manifest 的公开投影：`date`、`status`、`reasons` 映射成的固定说明、`window`、`generated_at`、`counts.topics`；
  - 一行固定声明：内容由程序和 LLM 自动生成，发布前没有经过人工审阅，不构成投资建议。
- 不可以显示：`state.yml` 的任何内容；manifest 的其余字段（源状态细节、调用次数、预算、错误信息、run id、`inputs_sha256`、模型与 skill 版本）；条目的摘录或正文；日志；凭据。
- WHI-1936 把 `state.yml` 的值和 manifest 内部字段的值加进公开产物的泄漏指纹，并按 0003 决定 4 把 `daily/` 登记进资源清单，放进公开站点。所有引用输出都要转义，只允许 http(s) 链接。
- 如果某个 topic 的标题恰好和某篇私有报告的标题相同，现有的泄漏检查会让构建失败。这是失败即拒绝：commit job 在提交前就会跑构建和泄漏检查，这一天不会被发布，由所有者处理。

### 11. Runner：GitHub Actions，三段 job 分权（WHI-1937 实施）

| Job | 仓库权限 | 凭据 | 做什么 |
| --- | --- | --- | --- |
| `ingest` | `contents: read` | 只有 `BLOCKBEATS_API_KEY` | `rh ingest --date D`；打包公开上下文（决定 2）；上传条目 artifact（保留 30 天）和输入目录；判断这次是否需要生成（决定 5） |
| `generate` | 无（不 checkout）；模型工具拿不到任何仓库凭据 | 只有 `LLM_BASE_URL` / `LLM_API_KEY`，映射成 `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY`（网关要求 Bearer 时用 `ANTHROPIC_AUTH_TOKEN`） | 用固定版本的 `anthropics/claude-code-action` 运行 `daily-topics` skill；模型默认 `claude-sonnet-5-5`，可以配置；只写候选目录；不给 Bash 和 git；需要额外抓取页面时只能访问公网的 http(s) 地址（WHI-1933） |
| `commit` | `contents: write` | 没有 LLM 和 BlockBeats 凭据 | 把候选当作不可信输入：导入（决定 7）→ `rh daily check` → `pnpm verify`（含构建与泄漏检查）→ 只 `git add` 本次处理的 `daily/YYYY/MM/DD/` → rebase 后再验证一遍 → push `main` → 触发部署 |

- `concurrency: daily`，不取消正在跑的运行。触发方式：定时任务（决定 4）和 `workflow_dispatch`（参数：`date`、`regenerate`）。
- **部署必须部署刚推上去的那个提交**。`GITHUB_TOKEN` 推送不会触发 `deploy.yml`，所以用 `workflow_call`（调用 deploy 作为可复用 workflow）或用 dispatch 触发部署，二者选一。注意：`deploy.yml` 现在用 `github.sha` 做 checkout、artifact 命名和部署说明，而可复用 workflow 里的 `github.sha` 是调用方的提交，不是新提交。所以无论选哪种，都要把新 SHA 作为输入传进去并 checkout 那个 SHA，WHI-1937 要拿出证据（部署记录里的 SHA 等于新提交）。
- 网关不可用：如果还没到 `T_last`，保持 `pending`，下一次运行再试；到了 `T_last`，按决定 5 收尾。
- 失败时写 job summary。base URL 和 key 不能出现在任何日志、artifact 或公开产物里（WHI-1937 要做检查）。

### 12. 上线顺序（所有者决定 1）

- Daily workflow **默认关闭**：只有 `vars.DAILY_ENABLED == 'true'` 时才运行（和现有的 `DEPLOY_ENABLED` 一样）。关掉它不影响站点和报告。
- GitHub 只对默认分支上的 workflow 执行 `schedule` 和 `workflow_dispatch`，所以合并之前不可能真实地跑起来：
  1. **合并前**（WHI-1937）：在一个 push 触发的试验分支上证明 ingest → generate → check → commit 的机制，commit job 推送到试验分支，不部署；同时完成 spike、generate job 的负向测试、秘密不外泄的检查和 README runbook。
  2. release review 覆盖全部代码；所有者批准后，`release/v0.1.0` → `main`，打 tag `v0.1.0`。
  3. 在 `main` 上设置 `DAILY_ENABLED=true`。WHI-1938 连续跑三天，并补齐 WHI-1937 合并后才能拿到的证据：部署的 SHA 等于新提交；迟到的日报、被跳过的定时任务、push 冲突、重复运行都能恢复，而且不覆盖已有的好结果。
  4. 这时出现的缺陷按 hotfix 0.1.0.x 处理。Release 要等 WHI-1938 通过后才标记为 Released。
- 回滚：先关掉 workflow（`DAILY_ENABLED=false`），再在主克隆里 revert 有问题的日期目录（内容通道，直推）。顺序不能反：如果先 revert 当天的目录，再不关 workflow，下一次运行会把那一天重新生成出来。页面或代码有问题就 revert 代码，`daily/` 的数据和报告都不用动。

## 非目标（0.1.0 不做，进 backlog）

- 和私有报告去重（需要让生成器接触私有上下文，和决定 2 冲突）。
- ETHTAO 兜底源：自建 FxEmbed 需要 X 登录 cookie，已被否决；付费 API 只在 WHI-1925 里留了记录。
- 偏好学习、推送通知、`crypto` 以外的领域、AI 类信息源。
- 公开页面上的交互（静态站，页面不能改状态）；topic 的人工审阅门。
- 自动建报告，或从 Daily 自动进入调研。

## 后果

- WHI-1929 / 1931 / 1933 / 1935 / 1936 / 1937 / 1938 以本文为契约。要新增字段、状态或写入路径，先改本文再实现。
- Daily 是仓库里第一个无人值守的公开写入者。防线是四层：真实权限隔离（决定 2、决定 11）、导入时把候选当不可信输入（决定 7）、提交前的确定性检查和泄漏检查、关掉 workflow 再 revert 的回滚路径。剩下的风险是某一天的页面上出现措辞不当的推荐，所以页面上要写明“自动生成、未经人工审阅”。
- 公开页面不和私有报告去重，所以 Daily 可能推荐一个已有私有报告的题目。这是有意接受的代价。
- 时间窗依据的是三天样本（背景 4）。如果 WHI-1938 发现日报经常引用 D−1 以外的帖子，回来改这里的时间窗；其他源的跨日去重靠时间窗不重叠，改时间窗时要一起考虑。
- 运行时刻依据的是 100 期日报的发布时间分布。如果 ETHTAO 的发布习惯变了，调整 `T_last`。
- 新增配置 `dailyAvoidTerms`（可选，默认沿用 `cardAvoidTerms`）；新增内容路径 `daily/`（GIT_WORKFLOW 的内容通道里已经登记）。

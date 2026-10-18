# 输入目录与运行方式（generate job 的契约）

本文件写给两类读者：运行时的模型（只需要看“输入文件”两节）和 Daily workflow（WHI-1937）。generate job **不 checkout 仓库**，只拿到下面这个工作目录；模型运行时不依赖仓库里的任何文件。

## 工作目录

```
<work>/                 模型的工作目录（cwd），里面只有这三样
  skill/                .claude/skills/daily-topics/ 原样复制（SKILL.md、references/）；只读
  input/                ingest job 打包的公开上下文，只有两个文件；只读
    context.json
    items.jsonl
  out/                  空目录；模型只写 out/topics.yml。commit job 把它作为 rh daily import --candidate 的目录
```

工作目录里**不能有**：仓库 checkout 或 `.git`、`reports/`、`daily/state.yml`、`tags.yml`、vault、ingest 的 manifest（含源错误、run id 等内部字段）、BlockBeats 账本或缓存、任何凭据文件。runner 进程环境里唯一的秘密是 LLM key（ADR 0004 §2、§11）。

## 提示词与工具

固定提示词（不拼接任何来源文本）：

```
Read skill/SKILL.md and follow it exactly. The input directory is input/. The only file you may create or modify is out/topics.yml.
```

- 允许的工具：`Read`、`Glob`、`Grep`、`Write`、`Edit`。
- 不给：`Bash` 及其他执行代码的工具、`WebFetch`、`WebSearch`、子 agent（`Task` / `Agent`）、`NotebookEdit`、任何 MCP 服务器。
- **不做后续抓取**：skill 只根据输入推荐，不访问任何 URL。这样模型唯一能联网的路径就是它自己的 LLM 请求，注入的文本也就没法让它访问内网地址或把数据送出去。将来如果要放开抓取，规则是：只允许 `http` / `https`；只允许输入里原样出现的 URL；主机名必须解析到公网地址（拒绝 `localhost`、IP 字面量、私有、回环、链路本地网段和云元数据地址），重定向后的每一跳都要重新检查；由 workflow 的真实网络权限强制，而不是靠提示词。
- 这些限制必须由真实权限保证（不 checkout、工具白名单、没有仓库凭据），WHI-1937 的负向测试负责证明。

模型结束后，`out/` 里应该只有一个普通文件 `topics.yml`。没有这个文件时，按“生成失败”处理（`rh daily import` 不带 `--candidate`）；有多余文件、符号链接等时，`rh daily import` 会整体拒绝。

## 生成记录（manifest 的 `generator`，由 job 写，不由模型写）

- `model`：实际调用的模型名（默认 `claude-sonnet-5-5`）。
- `skill_version`：`daily-topics/<SKILL.md frontmatter 的 metadata.version>+<skill 目录哈希的前 12 位>`，例如 `daily-topics/1.0.0+3fa9c1d2e4b5`。
- `inputs_sha256`：输入目录哈希（64 位十六进制）。

目录哈希的算法（skill 目录和输入目录用同一个）：

```sh
(cd <dir> && find . -type f | LC_ALL=C sort | xargs sha256sum) | sha256sum | cut -c1-64
```

它只用来**认出**某次输出来自哪一份输入，不能用来恢复输入。

## 输入文件：`context.json`

```json
{
  "schema": 1,
  "date": "2026-10-18",
  "window": { "from": "2026-10-17T00:00:00.000Z", "to": "2026-10-18T00:00:00.000Z" },
  "digest": { "status": "found", "url": "https://x.com/Ethtao_Ethtao/status/…" },
  "avoid_terms": ["…"],
  "public_tags": { "ethereum": { "label": "Ethereum" } },
  "public_reports": [
    { "slug": "…", "title": "…", "title_en": "…", "summary": "…", "summary_en": "…", "domain": "crypto", "tags": ["ethereum"], "created": "2026-10-01", "updated": "2026-10-01" }
  ],
  "recent_days": [ { "date": "2026-10-17", "status": "complete", "topics": [ … ], "items": { … } } ]
}
```

| 字段 | 含义 | WHI-1937 怎么生成 |
| --- | --- | --- |
| `date`、`window` | Daily 日期 D 与时间窗 W(D) | ingest manifest 的 `date`、`window` |
| `digest` | 日报状态 `found` / `not_posted` / `fetch_failed` 与日报链接 | ingest manifest 的 `digest.status`、`digest.url` |
| `avoid_terms` | 公开文字里不能出现的词 | `rh.config.json` 的 `dailyAvoidTerms`（缺省时 `cardAvoidTerms`），即 `loadConfig().dailyAvoidTerms` |
| `public_tags` | 公开标签投影：被至少一篇 public + published 报告用到的标签 | `projectSite("public", …).tags` |
| `public_reports` | public + published 报告的 meta：`slug`、`title`、`title_en`、`summary`、`summary_en`、`domain`、`tags`、`created`、`updated`（没有的可选字段省略） | `projectSite("public", …)` 里的报告；不含 private、draft |
| `recent_days` | D−14 到 D−1 已有日期的公开投影，按日期升序 | `loadDaily(root).days` 里这 14 天的 `publicDay(day)`；不含 `state.yml` 和 manifest 内部字段 |

`public_tags`、`public_reports`、`recent_days` 可以是空的（例如还没有公开报告时）。

## 输入文件：`items.jsonl`

`rh ingest` 写的 `items.jsonl` 原样复制，每行一个 JSON 对象（`lib/daily.ts` 的 `itemSchema`）：

| 字段 | 含义 |
| --- | --- |
| `id` | `item_id`，引用时原样使用，例如 `ethtao:2111165223780454451`、`odaily:525343` |
| `source` | 来源：`ethtao`（ETHTAO 日报引用的 X 帖子）、`ethresearch`、`magicians`（论坛）、`theblock`（新闻）、`blockbeats`、`odaily`（快讯） |
| `url` | 条目链接（X 帖子是解析后的原帖） |
| `origin_url` | 真正的出处：X 原帖带的外部链接或被引用的帖子、快讯注明的来源链接；没有时为 null |
| `title` | 新闻、论坛主题、X Article 的标题；X 普通帖子为 null |
| `author` | X 原帖作者（不带 @）；其他来源为 null |
| `reposted_by` | 转推人（X 转推时） |
| `via` | ETHTAO 当天日报的链接 |
| `published_at`、`fetched_at` | 发布时间、抓取时间（UTC） |
| `incomplete` | X Article 只拿到标题和预览时为 true |
| `excerpt` | 不超过 400 字的摘录。ETHTAO 条目 = ETHTAO 的中文摘要 + 空行 + 原帖文字；论坛条目可能为空 |

ETHTAO 条目不受时间窗限制（日报 D 引用的帖子都收）；其他来源只有发布时间在 W(D) 里的条目。

## 本地运行（评估用，最接近 generate job 的方式）

```sh
# 工作目录按上面的结构准备好；网关地址和 token 只放在环境变量里
cd <work> && ANTHROPIC_BASE_URL=… ANTHROPIC_AUTH_TOKEN=… claude -p \
  --model claude-sonnet-5-5 --restricted --strict-mcp-config \
  --tools "Read,Glob,Grep,Write,Edit" --permission-mode acceptEdits \
  --no-session-persistence --output-format stream-json --verbose \
  "Read skill/SKILL.md and follow it exactly. The input directory is input/. The only file you may create or modify is out/topics.yml."
```

`--restricted` 去掉执行代码的工具和 WebFetch、忽略用户和项目设置、把文件工具限制在工作目录里；`--strict-mcp-config` 不加载任何 MCP 服务器。`test/fixtures/daily/eval/run.ts` 就是这样运行的。

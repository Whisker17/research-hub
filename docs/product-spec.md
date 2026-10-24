# Research Hub：产品定义 v0.1

状态：产品方向、v1 范围与验收标准已在 2026-10-05 的设计访谈中确认。本文是权威版本；Linear 项目描述只做摘要并链接到这里。

- Linear 项目：https://linear.app/whisker-personal/project/research-hub-872e68412165
- GitHub 仓库：https://github.com/Whisker17/research-hub（private）

## 1. 目标

存放 AI 生成的研究报告，并把它们变成人容易读的图文 HTML。

- Agent 直接输出的 Markdown 难读。图文 HTML（answer-me-with-html 的 research 模式）更适合人读。
- 报告要能按时间、领域和标签管理。
- 手机阅读体验必须好。

## 2. 定位

| 产品 | 内容 | 读者 | 门槛 |
| --- | --- | --- | --- |
| **research-hub** | AI 生成的研究报告，快速消费 | 自己 + 持链接的少数人 | 作者执行 `rh publish` |
| personal-site（personal-knowledge-base） | 精修双语文章 | 公开 | PR 审核 |
| doc-hub | research-hub 的雏形 | — | **由 research-hub 取代，迁移后下线** |

research-hub 与 personal-site 互相独立。

## 3. 工作流

```
Obsidian vault: Research Briefs/<topic>.md   ← 人：记下想法与要求（或由 agent 起草）
        │                                     ← 人工把关 ①：确认 brief 与 meta（slug / domain / tags / visibility）
        │  rh new（快照确认后的 brief，记录 vault 原路径）
        ▼
reports/YYYY/MM/<slug>/brief.md
        │  Claude Code 后台 agent（research skill）或外部 Deep Research（rh import）
        ▼
reports/.../research/*.md（含论断台账）         ← 人工把关 ②：审阅调研结果
        │  agent 按 answer-me-with-html research 模式写中英文双版
        ▼
reports/.../explainer.md + explainer.en.md（经 sol subagent 审查达成共识）
        │  rh render（同时渲染 index.html 与 index.en.html）
        │  rh check（schema / 标签 / 台账 / 中英文手机检查）
        ▼                                     ← 人工把关 ③：审阅页面
rh publish → push main → CI → Cloudflare
```

### 3.1 分工边界

- `rh` 只做确定性的搬运与检查，**不调用 LLM**。它用 TypeScript 写，位于 `cli/`，通过 `pnpm rh` 调用。
- 需要 LLM 的步骤（调研、写 explainer）由 Claude Code 会话完成。项目 skill `.claude/skills/research-hub/` 负责驱动流程，并在每一步调用 `rh`。
- 不做报告的全自动流水线（vault 变更直接触发发布、自动建报告）。唯一的有界例外是 Daily Topics（3.4）：它无人值守地发布公开的**推荐**，但不建报告、不发布报告、不写 vault。它的 LLM 步骤跑在 GitHub Actions 的 generate job 里，不在 `rh` 里。

### 3.2 Brief 来源

- brief 集中写在 vault 的 `Research Briefs/` 目录。
- git 只记录软链接本身，不提交链接指向的内容，所以不用软链接。`rh new` 把 brief **复制快照**到报告目录，并在 meta 里记录 `brief_source`（vault 原路径）。
- vault 不存放研究产出。`Outputs/` 目录不使用。

### 3.3 调研

- 默认由本地 Claude Code 后台 agent 执行，按 `research` skill 查一手来源。
- 也可以用外部 Deep Research（ChatGPT、Gemini），结果通过 `rh import` 放进 `research/`，并标明来源工具。
- `research/` 必须包含**论断台账**：论断 → 证据（URL、`file:line`、命令输出）→ 类型（observed / inferred / speculative）。`rh check` 检查台账是否存在。

### 3.4 Daily Topics（0.1.0，设计见 [decisions/0004](decisions/0004-public-daily-topics.md)）

状态：暂停（2026-10-24，0.1.1）——所有者改用外部工具；历史页面 `/daily/` 作为存档保留在线上，重新启用见 README“Daily Topics 运行手册 → 启用 / 关闭”。

```
GitHub Actions（每天 04:30 / 08:15 / 13:30 UTC，可手动补跑）
  ingest   只读 + BlockBeats key：rh ingest --date D（ETHTAO 日报是骨干，其他源按时间窗归日）→ 只含公开上下文的输入目录
  generate 不碰仓库 + LLM key：daily-topics skill → 候选 topics.yml（不可信）
  commit   可写、无 LLM key：导入并校验 → rh daily check → 构建与泄漏检查 → 只提交 daily/YYYY/MM/DD/ → push main → 部署
        ▼
公开站点 /daily/、/daily/<date>/：每天 0–10 个推荐（目标 5–10）
        │  所有者挑选：rh topic select <id>（只写 daily/state.yml）
        ▼                                     ← 人工把关 ①：research-hub skill 在对话里起草 brief 与 meta
vault brief + rh new（默认 private）→ rh topic link <id> <slug> → 之后仍是 ② ③
```

- **边界**：Daily 只发布推荐。报告仍要过 ①②③ 三个把关点；从 Daily topic 建出的报告仍默认 private。
- **输入隔离**：生成器只拿公开上下文，包括当天的条目、public 报告的 meta、近 14 天的公开 topic 和公开标签；不读私有报告、`state.yml` 或 vault。这一点靠真实权限保证：generate job 不 checkout 仓库。
- **日期与状态**：日期 D 取 ETHTAO “以太坊日报 D”的日期；其他源的时间窗是 `[D−1 00:00Z, D 00:00Z)`。每天的状态是 `pending | complete | degraded | empty` 之一：日报发布前是 `pending`；到最后一次尝试（13:30 UTC）仍没有日报，或者不足 5 条，就是 `degraded`；0 条是 `empty`。
- **数据**：
  - `daily/YYYY/MM/DD/manifest.json`（运行记录）与 `topics.yml`（推荐 + 被引用条目的元数据）只由 workflow 的 commit job 写。
  - `daily/state.yml`（选中 / 忽略 / 关联的报告）只由 `rh topic` 写，不公开渲染。
  - 完整条目（含摘录）只存在 30 天的 Actions artifact 里，仓库里没有正文。
- **证据**：每个 topic 至少要有 2 个独立出处（按原始出处计，不按转帖人计），或者至少 1 条一手来源；不推荐纯行情。公开页面只显示标题、链接和我们自己写的文字，口吻中立（`dailyAvoidTerms`）。

## 4. 内容模型

### 4.1 目录

```
reports/YYYY/MM/<slug>/      ← 创建年月
  meta.yml
  brief.md                   ← 原生报告
  research/*.md              ← 原生报告
  explainer.md               ← am 中文稿件（原生报告；导入报告可有原稿）
  explainer.en.md            ← am 英文稿件（经 sol subagent 双重审查）
  index.html                 ← 中文最终产物
  index.en.html              ← 英文最终产物
  card.yml                   ← 推特卡片稿件（可选，只有英文版；背景 / 现状 / Excalidraw 配图 / 发现 / 结论 / 推文）
  card.png                   ← rh card 生成的推特卡片（4:5，1200×1500）
tags.yml                     ← 标签登记表
```

- 一个 topic 对应一个目录，里面一篇主 HTML。
- 重新调研时**就地更新**，并在 meta 里写 `updated` 和 changelog。
- 要拆专题时新开 topic，用 `series` 或 `related` 关联。

### 4.2 meta 字段（由 zod schema 校验）

| 字段 | 说明 |
| --- | --- |
| `title`, `summary` | 中文标题、一句话中文摘要 |
| `title_en`, `summary_en` | 英文标题、一句话英文摘要（可选，双语报告建议填写） |
| `created`, `updated` | 日期；`changelog` 记录每次更新 |
| `domain` | 固定值，只能选一个：`ai \| crypto \| finance \| work \| other` |
| `tags` | 自由标签，但必须在 `tags.yml` 登记；新标签由 `rh` 提示确认后加入 |
| `status` | `draft \| published`；构建时跳过 draft |
| `visibility` | `public \| private` |
| `kind` | `native \| imported` |
| `source_repo` | 导入报告的来源仓库与路径 |
| `brief_source` | vault 中 brief 的原路径 |
| `am_version` | 生成 HTML 的 answer-me-with-html 版本 |
| `series`, `related` | 关联报告 |
| `sessions` | 产出或修改这篇报告的 agent 会话（可选，0.1.1）：`[{runtime: pi \| claude-code, id, at: YYYY-MM-DD, note?}]`，只追加、只由 `rh` 写；`rh paths` 打印恢复命令，不在任何网页上显示（[decisions/0005](decisions/0005-inline-comments.md) 决定 11） |

### 4.3 导入报告

- 研究在其他仓库完成（例如代码库深挖），research-hub 只收 HTML 和原稿。
- HTML 可以是任意单文件页面，不限于 am 生成。导入报告同样要通过手机检查。

## 5. 站点

- **框架**：Astro 静态站。报告 HTML 原样作为静态资源发布；Astro 只生成索引页和归档页，并校验 meta。不引入客户端框架 bundle，只用 `is:inline` 小脚本。
- **0.1.0 改版**（paperswithcode 风格）：只改索引页、注入的站点外壳和 `rh build` 的分发，已发布报告不重新渲染。页面集合、资源归属、保留路由名与公开规则见 [decisions/0003](decisions/0003-index-redesign-scope-routes-publishing.md)。
- **路由**：
  - `/`：公开索引，**只列 public 报告**，按 `updated` 倒序，可按 domain 和 tag 筛选，卡片显示创建与更新日期。
  - `/tags/<tag>`、`/YYYY/MM`：归档页。公开站点的标签、月份、计数等派生数据只来自 public 报告。
  - `/r/<slug>`：公开报告，全站 `noindex`。
  - `/p/`、`/p/<slug>`：私有索引（列出全部报告）与私有报告，由 Cloudflare Access 保护。**实现时放在单独的私有 Worker 域名上**（workers.dev 的 Access 只能按整个域名开启），详见 [decisions/0001](decisions/0001-site-architecture.md)。public 报告也镜像到 `/p/<slug>`（0.1.1），私有站点上的报告链接一律指向 `/p/`。
  - `/p/tags/<tag>`：私有标签页（0.1.0 新增）。
  - `/daily/`、`/daily/<date>`：公开的 Daily Topics（0.1.0 新增，见 §3.4 与 [decisions/0004](decisions/0004-public-daily-topics.md)）。页面只显示 topic、被引用条目的标题和链接、状态的固定说明，并注明“自动生成、未经人工审阅”；`state.yml` 和 manifest 的内部字段不公开。
  - 保留路由名：报告 slug 不能是 `daily`、`tags`、`archive`、`fonts`、`about` 或纯数字；`rh new` 与 `rh check` 拒绝。
- **标签描述**：`tags.yml` 的每个标签可选填 `description` / `description_en`，显示在标签页上；只有被 public 报告用到的标签，描述才会出现在公开站点。
- **静态资源**：字体（自托管拉丁子集）、`favicon.svg`、`404.html` 两站共享；报告的图片、卡片图和缩略图只进报告所在的站点，public 报告另外随镜像进私有站点。
- **行内评论（0.1.1）**：只在私有站点的报告页（含镜像）。选中文字评论，右侧抽屉（窄屏底部面板）显示线程与评论人，默认收起；公开 `/r/` 页面没有评论。评论存在 D1（`research-hub-comments`），不进 git；私有 Worker 提供 `/api/comments`，人用 Access 登录的邮箱、agent 用白名单里的 Access service token 认证；v1 只追加。部署先执行 D1 迁移再部署私有 Worker。agent 用 `rh comments` 读写评论，改报告仍要过把关 ③。详见 [decisions/0005](decisions/0005-inline-comments.md)。
- **返回导航**：构建时在报告的输出副本里注入一个 "← Research Hub" 链接。它在文档流里，不用 fixed，也不改样式，源文件不动。不用 iframe 外壳。
- **语言切换**：有英文版的报告，构建时在右上角（am 工具栏开头；窄屏在返回链接一行的右侧）注入“中文 / EN”切换。切换时保留锚点，并写入与首页共用的 `localStorage.rh_lang`。
- **推特卡片模式**：报告有 `card.png` 时，构建时在 am 阅读路径（5 分钟 / 30 分钟 / 完整）后面注入“推特卡片”模式：显示推文文案与卡片图、“复制文案”“复制图片”（Clipboard API 写入文本 / PNG）和源推文链接。卡片与推文只有英文版（推特统一用英文发），中英文页共用，卡片图复制到 `<slug>/card.png` 与 `<slug>/en/card.png`。卡片以中立研究者口吻写，尽量不提 Mantle（`cardAvoidTerms`），页脚是日期与水印（`cardHandle`）。详见 [decisions/0002](decisions/0002-lang-toggle-and-tweet-card.md)。
- **托管**：Cloudflare Workers 静态资源 + Access。公开站 `research-hub`，私有站 `research-hub-private`（Access 保护整个域名，Worker 再校验 Access JWT）。v1 用 `workers.dev` 域名。
- **部署**：push 到 `main` 后，由 GitHub Actions 先跑 `rh check`（不含截图），再执行 `wrangler deploy`。不设 PR 审核门。Daily workflow 用 `GITHUB_TOKEN` 推送，不会触发 push 部署，所以它要自己触发部署，并且部署的必须是它刚推上去的那个提交（ADR 0004 决定 11）。Daily workflow 默认关闭，`vars.DAILY_ENABLED` 为 `true` 时才运行。

## 6. 手机适配

### 6.1 根因与修复位置

- answer-me-with-html research 模板里的 `.am-research .am-doc-layout { 210px 1fr }` 优先级更高，压过了 760px 断点的单栏规则，导致手机正文只剩约 77px 宽。fixed toolbar 还会遮挡正文。
- 在 fork 源码（`Whisker17/code-template` 的 `.claude/skills/answer-me-with-html/dev/src`）修复。给上游 QingYunA 提 PR 是可选项。
- research-hub **不注入 CSS 补丁**。

### 6.2 `rh check` 手机标准（Chrome 无头，390×844）

1. 页面没有横向溢出（`scrollWidth <= innerWidth`）。宽表格和宽图只允许在自己的容器内横向滚动。
2. 正文容器宽度 ≥ 300px。
3. 正文字号 ≥ 14px。
4. 没有 fixed 元素长期遮挡正文。
5. 输出全页截图，供人工抽查。

任意一条不通过就阻止 `rh publish`。截图检查只在本地跑，CI 不跑。

### 6.3 重新渲染

已提交的 HTML 不随 am 升级自动重新渲染。需要时手动执行 `rh render --force <slug>`。

## 7. v1 范围

做：第 3–6 节的全部内容，以及 doc-hub 迁移。

不做：视频讲解、全文搜索（v2 用 Pagefind）、评论（0.1.1 在私有站点加入，见 7.2）、多语言、报告的全自动流水线（Daily 推荐是 §3.1 里的有界例外）、自定义域名。

### 7.1 0.1.0 范围（站点改版 + Daily Topics）

做：

- 索引站改版（首页、私有索引、标签页、私有标签页、月归档、报告外壳），见 [decisions/0003](decisions/0003-index-redesign-scope-routes-publishing.md)；
- 公开 Daily Topics：只做 crypto；第一批源是 ETHTAO 日报、BlockBeats、ethresear.ch / Ethereum Magicians、Odaily、The Block；GitHub Actions 三段 job；加上 `rh ingest`、`rh daily check`、`rh topic` 与 `/daily/` 页面。见 §3.4 与 [decisions/0004](decisions/0004-public-daily-topics.md)。

不做：

- 报告概览页（about）、独立的 `search.json` 与模糊搜索（⌘K 只聚焦现有筛选框）、重新渲染已发布报告、两个站点之间同步主题 / 语言偏好；
- Daily 与私有报告去重、ETHTAO 兜底源（自建 FxEmbed / 付费 API）、偏好学习、推送通知、crypto 以外的领域。

### 7.2 0.1.1 范围（行内评论 + 报告会话）

做（[decisions/0005](decisions/0005-inline-comments.md)）：

- 私有站点报告页的行内评论：public 报告镜像到 `/p/<slug>/`、`_rh/reports.json` 清单、TextQuoteSelector 锚定与 Highlight API 高亮、抽屉 / 底部面板；
- 私有 Worker 的评论 API（D1、人与 agent 两种身份、分页）与部署前的 D1 迁移；
- `rh comments` 与 research-hub skill 的“处理评论”流程；
- meta `sessions` 与 `rh session add`，`rh paths` 打印恢复命令。

不做：

- 公开 `/r/` 页面上的评论；编辑 / 删除评论、表情回应、附件、@提及、通知、限流；自动重新锚定；在网页上展示报告会话。

## 8. 迁移

doc-hub 的 4 篇报告按导入方式迁移，`domain: work`，`visibility: private`：

| 报告 | 处理 |
| --- | --- |
| routing-report | 用新版 am 从原稿 `.md` 重新渲染 |
| propamm-active-liquidity | 用新版 am 从原稿 `.md` 重新渲染 |
| native-aa-overview | 用新版 am 从原稿 `.md` 重新渲染 |
| cfmm-routing-guide | 自定义 `build_html.mjs` 生成，不是 am 产物；回原仓库修复移动端 |

迁移验证后下线 doc-hub：删除 Vercel 项目，归档 GitHub repo。

## 9. v1 验收标准

1. 任意一篇已发布报告在 390 宽视口下没有横向溢出，正文宽度 ≥ 300px。
2. 未登录访问 `/p/*` 会被 Access 拦截；公开索引和公开页面的 HTML 里搜不到任何私有报告的标题。
3. draft 报告不出现在构建产物中。
4. 一个新 topic 从 brief 到上线，只有 3 个人工把关点（第 3 节 ①②③），其余步骤由 skill 和 `rh` 完成。
5. doc-hub 的 4 篇都已迁移，doc-hub 已下线。

端到端试跑 topic：**Meme Launchpad**（`domain: crypto`，`visibility: public`）。

## 10. 实施顺序

| Milestone | Issue |
| --- | --- |
| M0 基础 | ① repo 初始化（Astro + pnpm + `cli/` + `AGENTS.md`）；② am 移动端修复（code-template） |
| M1 内容模型与 CLI | ③ meta schema + `tags.yml` + 目录约定；④ `rh new / import / render`；⑤ `rh check`；⑥ `rh publish` |
| M2 站点与部署 | ⑦ Astro 索引与归档；⑧ 构建管线（draft、/r 与 /p 分发、返回链接、私有索引）；⑨ Cloudflare + Access + CI |
| M3 迁移与跑通 | ⑩ doc-hub 迁移与下线；⑪ 项目 skill `research-hub`；⑫ 端到端试跑（Meme Launchpad） |

依赖关系：① → (② ∥ ③) → (④, ⑤) → (⑦, ⑧) → ⑨ → ⑥ → ⑩ → ⑪ → ⑫。

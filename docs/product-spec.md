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
Obsidian vault: Research Briefs/<topic>.md   ← 人：记下想法与要求
        │  rh new（快照 brief，记录 vault 原路径）
        ▼
reports/YYYY/MM/<slug>/brief.md               ← 人工把关 ①：确认 brief
        │  Claude Code 后台 agent（research skill）或外部 Deep Research（rh import）
        ▼
reports/.../research/*.md（含论断台账）         ← 人工把关 ②：审阅调研结果
        │  agent 按 answer-me-with-html research 模式写稿
        ▼
reports/.../explainer.md → rh render → index.html
        │  rh check（schema / 标签 / 台账 / 手机检查）
        ▼                                     ← 人工把关 ③：审阅页面
rh publish → push main → CI → Cloudflare
```

### 3.1 分工边界

- `rh` 只做确定性的搬运与检查，**不调用 LLM**。它用 TypeScript 写，位于 `cli/`，通过 `pnpm rh` 调用。
- 需要 LLM 的步骤（调研、写 explainer）由 Claude Code 会话完成。项目 skill `.claude/skills/research-hub/` 负责驱动流程，并在每一步调用 `rh`。
- 不做全自动流水线（vault 变更直接触发发布）。

### 3.2 Brief 来源

- brief 集中写在 vault 的 `Research Briefs/` 目录。
- git 只记录软链接本身，不提交链接指向的内容，所以不用软链接。`rh new` 把 brief **复制快照**到报告目录，并在 meta 里记录 `brief_source`（vault 原路径）。
- vault 不存放研究产出。`Outputs/` 目录不使用。

### 3.3 调研

- 默认由本地 Claude Code 后台 agent 执行，按 `research` skill 查一手来源。
- 也可以用外部 Deep Research（ChatGPT、Gemini），结果通过 `rh import` 放进 `research/`，并标明来源工具。
- `research/` 必须包含**论断台账**：论断 → 证据（URL、`file:line`、命令输出）→ 类型（observed / inferred / speculative）。`rh check` 检查台账是否存在。

## 4. 内容模型

### 4.1 目录

```
reports/YYYY/MM/<slug>/      ← 创建年月
  meta.yml
  brief.md                   ← 原生报告
  research/*.md              ← 原生报告
  explainer.md               ← am 稿件（原生报告；导入报告可有原稿）
  index.html                 ← 最终产物（已提交的 HTML 就是最终产物）
tags.yml                     ← 标签登记表
```

- 一个 topic 对应一个目录，里面一篇主 HTML。
- 重新调研时**就地更新**，并在 meta 里写 `updated` 和 changelog。
- 要拆专题时新开 topic，用 `series` 或 `related` 关联。

### 4.2 meta 字段（由 zod schema 校验）

| 字段 | 说明 |
| --- | --- |
| `title`, `summary` | 标题、一句话摘要 |
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

### 4.3 导入报告

- 研究在其他仓库完成（例如代码库深挖），research-hub 只收 HTML 和原稿。
- HTML 可以是任意单文件页面，不限于 am 生成。导入报告同样要通过手机检查。

## 5. 站点

- **框架**：Astro 静态站。报告 HTML 原样作为静态资源发布；Astro 只生成索引页和归档页，并校验 meta。
- **路由**：
  - `/`：公开索引，**只列 public 报告**，按 `updated` 倒序，可按 domain 和 tag 筛选，卡片显示创建与更新日期。
  - `/tags/<tag>`、`/YYYY/MM`：归档页。
  - `/r/<slug>`：公开报告，全站 `noindex`。
  - `/p/`、`/p/<slug>`：私有索引（列出全部报告）与私有报告，由 Cloudflare Access 保护。**实现时放在单独的私有 Worker 域名上**（workers.dev 的 Access 只能按整个域名开启），详见 [decisions/0001](decisions/0001-site-architecture.md)。
- **返回导航**：构建时在报告的输出副本里注入一个 "← Research Hub" 链接。它在文档流里，不用 fixed，也不改样式，源文件不动。不用 iframe 外壳。
- **托管**：Cloudflare Workers 静态资源 + Access。公开站 `research-hub`，私有站 `research-hub-private`（Access 保护整个域名，Worker 再校验 Access JWT）。v1 用 `workers.dev` 域名。
- **部署**：push 到 `main` 后，由 GitHub Actions 先跑 `rh check`（不含截图），再执行 `wrangler deploy`。不设 PR 审核门。

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

不做：视频讲解、全文搜索（v2 用 Pagefind）、评论、多语言、全自动流水线、自定义域名。

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

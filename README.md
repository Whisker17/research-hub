# research-hub

AI 研究报告的存放与发布：Obsidian 里的 brief → agent 调研（带论断台账）→ answer-me-with-html 图文页面 → 手机检查 → 发布到 Cloudflare。

- 产品规格：[docs/product-spec.md](docs/product-spec.md)
- 实现决定：[docs/decisions/](docs/decisions/)（[0001 站点架构](docs/decisions/0001-site-architecture.md)、[0002 语言切换与推特卡片](docs/decisions/0002-lang-toggle-and-tweet-card.md)、[0003 0.1.0 索引站改版的范围与发布边界](docs/decisions/0003-index-redesign-scope-routes-publishing.md)）
- Agent 规则：[AGENTS.md](AGENTS.md)

| 站点 | 地址 | 内容 |
| --- | --- | --- |
| 公开 | https://research-hub.demiwhisker.workers.dev | public 报告（`/r/<slug>/`）、标签、按月归档；全站 noindex |
| 私有 | https://research-hub-private.demiwhisker.workers.dev/p/ | 全部已发布报告的索引、private 报告（`/p/<slug>/`）；Cloudflare Access + Worker 校验 JWT |

0.1.0（开发中，[0003](docs/decisions/0003-index-redesign-scope-routes-publishing.md)）：索引页改版，私有站点新增标签页 `/p/tags/`，公开站点新增 Daily Topics `/daily/`。报告 slug 不能用保留名 `daily`、`tags`、`archive`、`fonts`、`about` 或纯数字；`tags.yml` 可选填 `description` / `description_en`（只有被公开报告用到的标签，描述才会公开）。

## 环境

- Node ≥ 24（直接运行 TypeScript），pnpm 11（`corepack enable`）
- 本机 Chrome：`rh check` 的手机检查与 answer-me-with-html 的图形烘焙都需要
- answer-me-with-html：默认 `~/.agents/skills/answer-me-with-html/scripts/am.mjs`（`rh.config.json` 或 `AM_SCRIPT`）
- Obsidian vault：`rh.config.json` 的 `vaultDir`（或 `RH_VAULT_DIR`）；brief 放在 vault 的 `Research Briefs/`

```sh
pnpm install --frozen-lockfile
pnpm rh --help
pnpm verify      # 类型检查 + 测试 + rh check --no-shot + 构建（含泄漏检查）
pnpm dev         # 本地预览索引页（报告页需先 pnpm build，再看 dist/）
```

## 工作流

在 Claude Code 里直接说“用 research-hub 做一篇 <topic> 的报告”（或给出资料、外部调研结果、现成 HTML），项目 skill [`.claude/skills/research-hub/`](.claude/skills/research-hub/SKILL.md) 会按下表驱动全流程，并在三个把关点停下等你确认。`rh paths [slug]` 打印 vault brief 目录、am 位置、报告目录与发布地址。

| 步骤 | 命令 | 人工把关 |
| --- | --- | --- |
| 在 vault 的 `Research Briefs/` 写 brief（frontmatter 可写 `domain`、`tags`、`visibility`、`slug`） | — | |
| 快照 brief、建报告目录（draft，默认 private） | `rh new "<brief>" --slug <slug>` | ① 确认 brief |
| 调研，写 `research/*.md` 与 `research/ledger.md` 台账；外部 Deep Research 用 `rh import research` | — | ② 审阅调研结果 |
| 写 `explainer.md`（answer-me-with-html research 模式），渲染 | `rh render <slug>` | |
| 写 `card.yml`（推特卡片，只有英文版：背景 / 现状 / Excalidraw 配图 / 发现 / 结论 / 推文），渲染成 `card.png` | `rh card <slug>` | |
| 检查（schema / 标签 / 台账 / 推特卡片 / 手机 390×844 + 截图） | `rh check <slug>` | ③ 审阅页面、卡片与截图 |
| 发布：检查 → published → 构建与泄漏检查 → 提交并 push → CI 部署 | `rh publish <slug>` | |

### 报告页上的站点功能（构建时注入，源 HTML 不动）

- **返回条**：每篇报告页顶部（文档流里，不悬浮）是返回本站索引的“← ■ Research Hub”，和索引页页头同一套标志；外壳样式只作用于注入的 `data-rh-*` 元素，颜色跟着报告自己的主题与明暗，字体用站点的 `/fonts/`（外壳专用的字体名，不影响报告正文）。
- **中文 / EN 切换**：有英文版的报告，右上角工具栏（手机上在返回链接那一行）有中文 / EN 切换；会保留当前锚点，并和首页共用语言偏好。
- **推特卡片模式**：有 `card.png` 的报告，阅读路径（5 分钟 / 30 分钟 / 完整）后面多一个“推特卡片”。卡片和推文只有英文版（推特统一用英文发），中英文页展示同一份。点开后有推文文案（`card.yml` 的 `tweet`，X 计数 ≤ `rh.config.json` 的 `cardTweetMax`）和“复制文案”“复制图片”：在 X 里引用源推文，先粘贴文案，再粘贴图片（PNG 直接写进剪贴板，不用下载）；`#tweet-card` 锚点直接打开这个模式。复制需要 https（线上站点）或 localhost；不支持的浏览器会提示手动复制。卡片页脚是日期与水印（`cardHandle`）。卡片以中立研究者口吻写，尽量不提 Mantle（`cardAvoidTerms`）。卡片写法与深度控制见 [references/tweet-card.md](.claude/skills/research-hub/references/tweet-card.md)。给已发布报告补卡片：写 `card.yml` → `rh card <slug>` → `rh publish <slug> --note "推特卡片"`。

导入其他仓库完成的研究：`rh import report --explainer <am稿件.md> | --html <页面.html> --slug … --domain … --source-repo <路径>`。

### 检查的严格程度

- schema、目录年月、标签登记、引用：所有报告都是错误（draft 也一样）。
- 完整性（台账、HTML、渲染记录、TODO 摘要）与手机检查：published 报告、显式 `rh check <slug>`、`rh publish` 时是错误；`rh check`（不带 slug）对 draft 只给警告，所以未完成的 draft 可以提交到 main。

### 手机检查（`rh check`，规格 §6.2）

Chrome 无头模式，390×844 手机视口：

1. 没有横向溢出；宽表格 / 宽图只能在自己的滚动容器里横向滚动，被 `overflow: hidden` 裁掉的内容也算失败。
2. 正文容器宽度 ≥ 300px（正文段落按字数加权的中位宽度）。
3. 正文字号 ≥ 14px（同上，中位字号）。
4. 在 25% / 50% / 75% 滚动位置，没有 fixed 元素压住正文。
5. 全页截图写到 `.rh/shots/<slug>/`（过高的页面分段）。

另外要求 `<meta name="viewport" content="width=device-width…">`。结果按 HTML 内容哈希缓存在 `.rh/cache/`。

## 部署

push 到 `main` → GitHub Actions（`.github/workflows/deploy.yml`）：类型检查、测试、`rh check --no-shot`、`rh build` → 部署 `research-hub-private` 与 `research-hub` → `scripts/smoke.sh` 冒烟测试（公开站点是刚部署的版本；私有站点对匿名请求只返回 Access 重定向或 403 / 503）。

本机也可以直接部署：`pnpm deploy:manual`（需要 `wrangler login`）。

### 一次性配置（均已完成，记录供重建时参考）

1. **Cloudflare Access（私有站点）**：控制台 → Workers & Pages → `research-hub-private` → **Access** 标签 → Protect this Worker behind Access，策略 Include：Emails = demiwhisker@gmail.com，再加一条 Include：Emails ending in = @mantle.xyz（两条 Include 是“或”的关系；不要放进 Require）；Preview URL 保持关闭；不要在控制台手动填 `ACCESS_AUD`（每次部署会被 `wrangler.private.jsonc` 覆盖）。然后运行 `pnpm access:setup`：它从 Access 重定向里读出 AUD，写入 `wrangler.private.jsonc` 并重新部署。提交这个文件。在这之前，私有站点对所有请求返回 503（失败即拒绝）。
2. **CI 部署凭据**：Cloudflare 创建 API Token（权限：Account → Workers Scripts → Edit），然后：
   ```sh
   gh secret set CLOUDFLARE_API_TOKEN      # 粘贴 token
   gh variable set DEPLOY_ENABLED --body true
   ```
   `CLOUDFLARE_ACCOUNT_ID` 已配置。`DEPLOY_ENABLED` 不是 `true` 时，CI 只校验与构建，不部署。

## Daily Topics 运行手册（`.github/workflows/daily.yml`）

每天 04:30 / 08:15 / 13:30 UTC 运行（[ADR 0004](docs/decisions/0004-public-daily-topics.md) §4、§11）：处理今天（UTC）；昨天还不是终态时一并收尾。已是终态的日期什么都不做，所以重复运行、补跑都是安全的。三段 job 分权：

| Job | 权限 | 凭据 | 做什么 |
| --- | --- | --- | --- |
| `ingest` | `contents: read`、`actions: read` | `BLOCKBEATS_API_KEY`（只在 `rh ingest` 那一步） | 决定处理哪些日期，`rh ingest`，打包公开上下文（`scripts/daily.ts context`） |
| `generate` | 无（`permissions: {}`），不 checkout | `LLM_BASE_URL`、`LLM_API_KEY`（只在运行模型的那一步） | 先查没有仓库凭据、push 失败；再做隔离自检；再按日期运行 `daily-topics` skill（`scripts/daily-generate.sh`） |
| `commit` | `contents: write` | 无 LLM / BlockBeats 凭据 | `rh daily import` → `rh daily check --base --workflow` → `pnpm verify` → 只 `git add daily/YYYY/MM/DD/` → push（冲突就 rebase、重新验证；内容冲突让运行失败，不自动解决） |
| `deploy` | `contents: read` | Cloudflare | 用 `workflow_call` 调用 `deploy.yml`，显式传入刚推上去的提交 SHA（部署记录里是 `main@<SHA>`） |

**隔离自检**（每次运行模型之前，`scripts/daily-isolation.ts`）：用本地假网关和随机 canary 令牌、按和真实运行完全相同的命令启动 Claude Code，逐个发出读 `/proc/*/environ`、`$HOME`、`/etc`、工作目录外的文件，往外写文件，调用 Bash / WebFetch / WebSearch 的工具调用，全部被拒绝、canary 不出现在任何输出里才继续；否则这次不运行模型（这些日期记为 `generator_failed`）。结果在 job summary 和 `daily-generate-log-*` artifact 的 `selfcheck/` 里。

### 启用 / 关闭

- 启用（合并到 `main` 之后，由所有者执行）：`gh variable set DAILY_ENABLED --body true`。默认关闭：变量不是 `true` 时定时和手动运行都直接跳过。
- 关闭：`gh variable set DAILY_ENABLED --body false`。不影响站点和报告。
- 模型：默认 `claude-sonnet-5-5`；`gh variable set DAILY_MODEL --body <model>` 改，删掉变量恢复默认。
- 第一次在 `main` 上运行时 Actions cache 里还没有 BlockBeats 账本，按 WHI-1931 的规则当天不调用 BlockBeats（失败即关闭）。确定当天还没调用过时，可以手动运行一次并勾选 `seed_ledger`，从空账本开始。

### 手动运行、补跑与 regenerate

- 补跑某一天（例如定时任务被跳过、更早的日期）：Actions → daily → Run workflow，填 `date`（YYYY-MM-DD，UTC），或 `gh workflow run daily.yml -f date=2026-10-20`。已是终态的日期会被跳过。
- 重做一个已是终态的日期：`gh workflow run daily.yml -f date=2026-10-20 -f regenerate=true`。不重新抓取，用当初那次运行保存的 `daily-items-<run>-<attempt>` artifact（30 天）。新候选通过导入**并且**通过检查才替换旧结果；否则保留旧结果，这次运行标红，不提交。artifact 过期后不能 regenerate。
- 看结果：每个 job 的 summary 写了处理了哪些日期、各源的状态和调用数、每次生成的 token 与花费、导入的结果；失败时写明原因。

### 手动修正（所有者例外）

报告转成 private / draft、或某个标签不再公开，会让引用它的旧日期过不了 `rh daily check`（失败即拒绝）。修法按顺序：

1. 30 天内（items artifact 还在）：regenerate 那一天（见上）。
2. 超过 30 天：**只有所有者**可以在主克隆里删除或改正 `daily/YYYY/MM/DD/topics.yml` 里出问题的 topic，`rh daily check` 通过后作为内容通道的提交（只改 `daily/`）直推 `main`。agent 不主动做这件事。

### 轮换密钥

- LLM：在网关上新建一个有额度上限的 key → `gh secret set LLM_API_KEY` → 手动运行一次（或等下一次定时运行），generate job 的 summary 里有花费、没有错误 → 在网关上停用旧 key。网关地址变了用 `gh secret set LLM_BASE_URL`（Anthropic 协议的 base URL，不带 `/v1`）。
- BlockBeats：`gh secret set BLOCKBEATS_API_KEY`，下一次运行生效。
- 怀疑泄漏：先关闭 Daily（`DAILY_ENABLED=false`），再在网关上停用 key，然后轮换。

### 失败时

- 网关不可用或生成失败：还没到 13:30 UTC 时这一天保持 `pending`，下一次定时运行再试；到了 13:30 按 ADR 0004 §5 收尾（`empty` / `degraded`）。Claude Code 对 5xx 会重试约 3 分钟再退出。
- push 被拒（`main` 前进了）：commit job 自动 rebase、重新跑 `rh daily check` 与 `pnpm verify` 后再推；rebase 有冲突就失败，什么都不推。
- 日志和 artifact：items（含摘录）、条目缓存、候选、generate 日志都保留 30 天；工作目录 artifact 保留 1 天。网关地址和 key 不进任何日志或 artifact：generate job 上传前先替换、再检查，检查不过就什么都不上传。

### 回滚

先关闭 workflow（`DAILY_ENABLED=false`），再在主克隆里 revert 有问题的日期目录（内容通道，直推）。顺序不能反：先 revert 而不关 workflow，下一次运行会把那一天重新生成出来。页面或代码有问题就 revert 代码，`daily/` 和报告都不用动。

### 合并前的试验分支

push 到 `daily-trial/**` 分支会在那个分支上跑完整流程（不看 `DAILY_ENABLED`）：commit job 推回那个分支，**不部署**；用自己的 BlockBeats 账本（`daily-ledger-trial-*`），它的调用不计入 `main` 的账本，所以 `main` 上的 Daily 启用之后不要再用试验分支，或者确认当天的 BlockBeats 配额还够。试验分支用完就删。

## 回滚

`pnpm exec wrangler rollback -c wrangler.public.jsonc`（或 `wrangler.private.jsonc`），或 revert 对应提交后 push。

索引页与报告外壳（0.1.0 改版）只是代码：revert 对应提交后 push 即可，不需要重新渲染报告（`rh render`），也没有内容迁移——报告源 HTML 从未改动，外壳在每次 `rh build` 时重新注入。

### 构建后的验收与局域网预览

- `RH_UI_SHOTS=.rh/shots/ui node --test test/ui-acceptance.test.ts`：在夹具上真实构建两站，经 HTTP 用 Chrome 检查所有路由（390 / 1440 × 明暗 × 中英文）、报告外壳、链接与字体，并保存截图；先 `node cli/rh.ts build` 再加 `RH_UI_REAL=1`，还会检查 `dist/private` 里每篇真实报告的外壳。
- `node scripts/preview.ts [端口]`：把已构建的 `dist/private`（端口）与 `dist/public`（端口 + 1）发到局域网，打印手机可打开的地址。没有 Access，只在本机评审时用，看完就停掉；复制卡片图片需要 https 或 localhost，局域网地址上会提示手动复制。

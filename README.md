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

在 Claude Code 里直接说“用 research-hub 做一篇 <topic> 的报告”（或给出资料、外部调研结果、现成 HTML），项目 skill [`.claude/skills/research-hub/`](.claude/skills/research-hub/SKILL.md) 会按下表驱动全流程，并在三个把关点停下等你确认。`rh paths [slug]` 打印 vault brief 目录、am 位置、报告目录、发布地址，以及记录过的 agent 会话的恢复命令（`pi --session <id>` / `claude --resume <id>`）。`rh new` / `rh import` 自动记录当前会话（pi：`PI_SESSION_ID`；Claude Code：`CLAUDE_CODE_SESSION_ID`）；修改报告或处理评论的会话用 `rh session add <slug>` 追加。

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

处理报告页上的评论（ADR 0005，只在私有站点）：对 agent 说“看看我在 <slug> 上的评论”，skill 按“处理评论”一节走：回复线程，或改稿后回复“已准备，未发布”，由你 `rh publish`。命令是 `rh comments list [<slug>] [--status open|resolved|all] [--lang zh|en] [--json]`、`rh comments show <threadId>`、`rh comments reply <threadId> --body <文字>`、`rh comments resolve|reopen <threadId>`；认证用 Access service token，环境变量 `RH_ACCESS_CLIENT_ID` / `RH_ACCESS_CLIENT_SECRET`。`--json`（`rh.comments/v1`）给出每个线程的地址、引文在 explainer 里的行号（唯一匹配才给）、页面是否已重新渲染（`outdated`）和全部评论。

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

push 到 `main` → GitHub Actions（`.github/workflows/deploy.yml`）：类型检查、测试、`rh check --no-shot`、`rh build` → D1 迁移（`wrangler d1 migrations apply research-hub-comments --remote`，失败就不部署）→ 部署 `research-hub-private` 与 `research-hub` → `scripts/smoke.sh` 冒烟测试（公开站点的 `/build.json` 与首页是刚部署的版本，各轮询约 2 分钟；私有站点对匿名请求只返回 Access 重定向或 403 / 503）。

本机也可以直接部署：`pnpm deploy:manual`（需要 `wrangler login`；同样先跑迁移）。评论存在 D1 `research-hub-comments`（binding `COMMENTS`），迁移在 `worker/migrations/`，只做加法（[ADR 0005](docs/decisions/0005-inline-comments.md) §2）。

### 一次性配置（1、2 已完成，记录供重建时参考）

1. **Cloudflare Access（私有站点）**：控制台 → Workers & Pages → `research-hub-private` → **Access** 标签 → Protect this Worker behind Access，策略 Include：Emails = demiwhisker@gmail.com，再加一条 Include：Emails ending in = @mantle.xyz（两条 Include 是“或”的关系；不要放进 Require）；Preview URL 保持关闭；不要在控制台手动填 `ACCESS_AUD`（每次部署会被 `wrangler.private.jsonc` 覆盖）。然后运行 `pnpm access:setup`：它从 Access 重定向里读出 AUD，写入 `wrangler.private.jsonc` 并重新部署。提交这个文件。在这之前，私有站点对所有请求返回 503（失败即拒绝）。
2. **CI 部署凭据**：Cloudflare 创建 API Token（权限：Account → Workers Scripts → Edit，**Account → D1 → Edit**：部署前要执行 D1 迁移），然后：
   ```sh
   gh secret set CLOUDFLARE_API_TOKEN      # 粘贴 token
   gh variable set DEPLOY_ENABLED --body true
   ```
   `CLOUDFLARE_ACCOUNT_ID` 已配置。`DEPLOY_ENABLED` 不是 `true` 时，CI 只校验与构建，不部署。
3. **评论 API（[ADR 0005](docs/decisions/0005-inline-comments.md) §2、§8；0.1.1 起）**：
   1. D1 `research-hub-comments` 已创建（id 在 `wrangler.private.jsonc`）；重建时用 `wrangler d1 create research-hub-comments`，把新 id 写进 `wrangler.private.jsonc`。
   2. 给第 2 步的 API Token 加上 Account → D1 → Edit（控制台 → My Profile → API Tokens → 编辑这个 token）。缺这个权限时，CI 的迁移步骤失败，不会部署。
   3. Zero Trust 控制台 → Access → Service credentials → Service Tokens → Create Service Token（名字如 `research-hub-agent`）。记下 Client ID（形如 `<hex>.access`）和 Client Secret（只显示一次）。
   4. Zero Trust → Access → Applications → `research-hub-private` 的 Access 应用 → Policies → Add a policy：Action = **Service Auth**，Include：Service Token = 第 3 步的 token。原来的邮箱 Allow 策略不动。
   5. 把 Client ID 写进 `wrangler.private.jsonc` 的 `AGENT_CLIENT_IDS`（逗号分隔，不是秘密），提交并部署。为空时 Worker 不接受任何 agent。
   6. Client ID / Secret 只放在本机 shell 环境：`export RH_ACCESS_CLIENT_ID=… RH_ACCESS_CLIENT_SECRET=…`。agent 请求带 `CF-Access-Client-Id` / `CF-Access-Client-Secret` 两个请求头。
   撤销 agent：从 `AGENT_CLIENT_IDS` 删掉 client id 后部署，或在 Access 里吊销 token。

## Daily Topics 运行手册（`.github/workflows/daily.yml`）

> **已暂停（2026-10-24）：所有者改用外部工具。** 下面描述的是启用时的行为；现在不会运行，重新启用见“启用 / 关闭”。`/daily/` 历史页面作为存档保留在线上。

每天 04:30 / 08:15 / 13:30 UTC 运行（[ADR 0004](docs/decisions/0004-public-daily-topics.md) §4、§11）：处理今天（UTC）；昨天还不是终态时一并收尾。已是终态的日期什么都不做，所以重复运行、补跑都是安全的。三段 job 分权，结果推送到 Lark：

| Job | 权限 | 凭据 | 做什么 |
| --- | --- | --- | --- |
| `plan` | `contents: read` | 无 | 决定处理哪些日期（`scripts/daily.ts plan`），以及 `notify` 要看哪些日期 |
| `ingest` | `contents: read`、`actions: read` | `BLOCKBEATS_API_KEY`（只在 `rh ingest` 那一步） | `rh ingest`，打包公开上下文（`scripts/daily.ts context`） |
| `generate` | 无（`permissions: {}`），不 checkout | `LLM_BASE_URL`、`LLM_API_KEY`（只在运行模型的那一步） | 先查没有仓库凭据、push 失败；再做隔离自检；再按日期运行 `daily-topics` skill（`scripts/daily-generate.sh`） |
| `commit` | `contents: write` | 无 LLM / BlockBeats 凭据 | `rh daily import` → `rh daily check --base --workflow` → `pnpm verify` → 只 `git add daily/YYYY/MM/DD/` → push（冲突就 rebase、重新验证；内容冲突让运行失败，不自动解决） |
| `deploy` | `contents: read` | Cloudflare | 用 `workflow_call` 调用 `deploy.yml`，显式传入刚推上去的提交 SHA（部署记录里是 `main@<SHA>`）；冒烟测试通过后返回 `deployed_sha` |
| `notify` | `contents: read` | `LARK_WEBHOOK_URL`、`LARK_SIGNING_SECRET`（只在发送那一步） | 把当天的推荐作为一张卡片推送到 Lark（见下面 “Lark 推送”） |
| `alert` | `contents: read` | 同上 | 任何 job 失败时推送一张提醒卡片 |

**隔离自检**（每次运行模型之前，`scripts/daily-isolation.ts`）：用本地假网关和随机 canary 令牌、按和真实运行完全相同的命令启动 Claude Code，逐个发出读 `/proc/*/environ`、`$HOME`、`/etc`、工作目录外的文件，往外写文件，调用 Bash / WebFetch / WebSearch 的工具调用，全部被拒绝、canary 不出现在任何输出里才继续；否则这次不运行模型（这些日期记为 `generator_failed`）。结果在 job summary 和 `daily-generate-log-*` artifact 的 `selfcheck/` 里。

### 启用 / 关闭

- 当前状态：**已暂停（2026-10-24）：所有者改用外部工具**。workflow 已禁用，`DAILY_ENABLED=false`；代码、workflow 文件、`daily/` 数据和 `/daily/` 页面都保留。核对：`gh workflow list --all`（daily 为 `disabled_manually`）、`gh variable list`（`DAILY_ENABLED false`）。
- 暂停（两条都要执行）：`gh workflow disable daily.yml` + `gh variable set DAILY_ENABLED --body false`。只设变量时定时任务仍会每天跑三次空运行，而且 push 到 `daily-trial/**` 不看 `DAILY_ENABLED`；暂停期间不要 push `daily-trial/**`。不影响站点和报告。
- 重新启用（由所有者执行）：`gh workflow enable daily.yml` + `gh variable set DAILY_ENABLED --body true`。默认关闭：变量不是 `true` 时定时和手动运行都直接跳过。暂停期间 BlockBeats 账本的 Actions cache 可能已过期，见下面第一次运行的 `seed_ledger` 说明。
- 模型：默认 `claude-sonnet-5-5`；`gh variable set DAILY_MODEL --body <model>` 改，删掉变量恢复默认。
- 第一次在 `main` 上运行（包括暂停后重新启用、账本 cache 已过期）时 Actions cache 里还没有 BlockBeats 账本，按 WHI-1931 的规则当天不调用 BlockBeats（失败即关闭）。确定当天还没调用过时，可以手动运行一次并勾选 `seed_ledger`，从空账本开始。

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

### Lark 推送（`notify` / `alert`）

每天的推荐以一张卡片推送到所有者的 Lark 群：标题 `📰 Daily Topics · <日期> · <n> topics`（complete 蓝色、degraded 橙色、empty 灰色），各源 ✓ / ✗，每个 topic 的标题、英文标题、why_now、domain · 标签 · 把握 · 来源数 · new/update 和指向 `/daily/<日期>/#<topic id>` 的链接，“Open today's topics” 按钮，以及 ETHTAO 日报按钮（只有链接是 `https://x.com/Ethtao_Ethtao/status/<数字>` 时）。卡片只有公开页面上的字段，没有 manifest 的内部字段（调用次数、错误、输入哈希）和 `daily/state.yml`。卡片由 `rh daily card` 构建（离线、确定性），由 `scripts/lark-post.ts` 签名发送。

**什么时候发**（按线上版本里这一天的状态，不按这次运行提交了什么）：`pending` 不发；`complete` 发；`degraded` / `empty` 只在这一天的最后一次定时运行（13:30 UTC 及之后）或手动运行时发；`regenerate` 之后内容变了发一张标 “Updated” 的卡片。定时运行看今天和昨天（昨天的最后一次运行被跳过时，第二天补发）；试验分支不推送。

**和线上一致**：`rh build` 在公开站点发布 `/build.json`（`{"sha": <构建的提交>}`），每个 `/daily/<日期>/` 页面带 `<meta name="rh-daily-hash">`（卡片输入的 sha256）。`notify` 读 `/build.json`（正常路径要求它等于 `deploy` 返回的 `deployed_sha`），checkout 那个提交、在它上面构建卡片输入，哈希必须等于线上页面的 meta；不一致或页面不存在就不发，job summary 写明原因。所以 `main` 上还没部署的内容不会进卡片。

**去重**：发送台账在 Actions cache 里，key = `lark-daily-<日期>-<卡片输入哈希>`，确认发送成功之后才保存；同一个 key 已经发过就跳过（重跑 `notify` 不会重复发）。**确认发送之后，重复只是尽力去重（Actions cache，`concurrency: daily` 串行）；仍可能重复；发送失败可以手动重发。** 没有投递保证。

**提醒**：任何 job 失败（取消的运行不算）时 `alert` 推送一张红色卡片：日期（`plan` 失败时是 “date unknown”）、失败的 job 和运行链接，不含日志或错误详情。`alert` 自己失败只在 Actions 里标红。

**配置（所有者）**

1. 在 Lark 群里添加自定义机器人（群设置 → 机器人 → 添加机器人 → 自定义机器人），**开启“签名校验”**，记下 webhook 地址和签名密钥。webhook 必须是 `https://open.larksuite.com/open-apis/bot/v2/hook/…` 或 `https://open.feishu.cn/open-apis/bot/v2/hook/…`，其他地址会被拒绝。
2. 发布前先用一个测试机器人在本机发一张真实卡片（密钥只放在当前 shell，不进命令历史）：

   ```sh
   tmp=$(mktemp -d) && cp -R test/fixtures/daily-site/daily rh.config.json "$tmp"/
   RH_ROOT=$tmp pnpm rh daily card --date 2026-10-18 --out "$tmp/card.json"
   read -rs LARK_WEBHOOK_URL && read -rs LARK_SIGNING_SECRET && export LARK_WEBHOOK_URL LARK_SIGNING_SECRET
   node scripts/lark-post.ts "$tmp/card.json"     # 成功 = HTTP 200, code 0
   ```

3. 配置正式机器人：`gh secret set LARK_WEBHOOK_URL`、`gh secret set LARK_SIGNING_SECRET`（交互输入，不要写在命令行参数里）。

**手动重发**：`gh workflow run daily.yml -f date=2026-10-20 -f notify_only=true` 只推送那一天的线上版本（不抓取、不生成、不提交）；已经发过的会被台账跳过，要再发一次加 `-f force=true`（卡片标 “Resent”）。

**关闭**：只关提醒 `gh variable set LARK_ALERTS --body false`；全部关闭 `gh secret delete LARK_WEBHOOK_URL` 和 `gh secret delete LARK_SIGNING_SECRET`——两个 job 照常运行，job summary 写 “Lark disabled”，不影响 Daily 的发布。

**排查**：job summary 每个日期一行 `Lark <日期>: send / skip / refuse — <原因>`。常见原因：线上还不是刚部署的版本（`/build.json` 与 `deployed_sha` 不一致，`DEPLOY_ENABLED` 不是 `true`）、卡片输入和线上页面不一致；Lark 返回 19021 = 签名密钥不对或时间戳超过 1 小时，9499 = 请求格式错误（这两种不重试）。日志只有 HTTP 状态、Lark code 和过滤后的 msg，不写 webhook 地址和密钥。

### 合并前的试验分支

push 到 `daily-trial/**` 分支会在那个分支上跑完整流程（不看 `DAILY_ENABLED`）：commit job 推回那个分支，**不部署**；用自己的 BlockBeats 账本（`daily-ledger-trial-*`），它的调用不计入 `main` 的账本，所以 `main` 上的 Daily 启用之后不要再用试验分支，或者确认当天的 BlockBeats 配额还够。试验分支用完就删。

## 回滚

`pnpm exec wrangler rollback -c wrangler.public.jsonc`（或 `wrangler.private.jsonc`），或 revert 对应提交后 push。

索引页与报告外壳（0.1.0 改版）只是代码：revert 对应提交后 push 即可，不需要重新渲染报告（`rh render`），也没有内容迁移——报告源 HTML 从未改动，外壳在每次 `rh build` 时重新注入。

### 构建后的验收与局域网预览

- `RH_UI_SHOTS=.rh/shots/ui node --test test/ui-acceptance.test.ts`：在夹具上真实构建两站，经 HTTP 用 Chrome 检查所有路由（390 / 1440 × 明暗 × 中英文）、报告外壳、链接与字体，并保存截图；先 `node cli/rh.ts build` 再加 `RH_UI_REAL=1`，还会检查 `dist/private` 里每篇真实报告的外壳。
- `node scripts/preview.ts [端口]`：把已构建的 `dist/private`（端口）与 `dist/public`（端口 + 1）发到局域网，打印手机可打开的地址。没有 Access，只在本机评审时用，看完就停掉；复制卡片图片需要 https 或 localhost，局域网地址上会提示手动复制。

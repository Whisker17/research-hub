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

## 回滚

`pnpm exec wrangler rollback -c wrangler.public.jsonc`（或 `wrangler.private.jsonc`），或 revert 对应提交后 push。

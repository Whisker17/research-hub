# research-hub

AI 研究报告的存放与发布：Obsidian 里的 brief → agent 调研（带论断台账）→ answer-me-with-html 图文页面 → 手机检查 → 发布到 Cloudflare。

- 产品规格：[docs/product-spec.md](docs/product-spec.md)
- 实现决定：[docs/decisions/0001-site-architecture.md](docs/decisions/0001-site-architecture.md)
- Agent 规则：[AGENTS.md](AGENTS.md)

| 站点 | 地址 | 内容 |
| --- | --- | --- |
| 公开 | https://research-hub.demiwhisker.workers.dev | public 报告（`/r/<slug>/`）、标签、按月归档；全站 noindex |
| 私有 | https://research-hub-private.demiwhisker.workers.dev/p/ | 全部已发布报告的索引、private 报告（`/p/<slug>/`）；Cloudflare Access + Worker 校验 JWT |

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

| 步骤 | 命令 | 人工把关 |
| --- | --- | --- |
| 在 vault 的 `Research Briefs/` 写 brief（frontmatter 可写 `domain`、`tags`、`visibility`、`slug`） | — | |
| 快照 brief、建报告目录（draft，默认 private） | `rh new "<brief>" --slug <slug>` | ① 确认 brief |
| 调研，写 `research/*.md` 与 `research/ledger.md` 台账；外部 Deep Research 用 `rh import research` | — | ② 审阅调研结果 |
| 写 `explainer.md`（answer-me-with-html research 模式），渲染 | `rh render <slug>` | |
| 检查（schema / 标签 / 台账 / 手机 390×844 + 截图） | `rh check <slug>` | ③ 审阅页面与截图 |
| 发布：检查 → published → 构建与泄漏检查 → 提交并 push → CI 部署 | `rh publish <slug>` | |

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

### 一次性配置

1. **Cloudflare Access（私有站点，目前未启用）**：控制台 → Workers & Pages → `research-hub-private` → **Access** 标签 → Protect this Worker behind Access，策略只允许自己的邮箱；Preview URL 保持关闭；不要在控制台手动填 `ACCESS_AUD`（每次部署会被 `wrangler.private.jsonc` 覆盖）。然后运行 `pnpm access:setup`：它从 Access 重定向里读出 AUD，写入 `wrangler.private.jsonc` 并重新部署。提交这个文件。在这之前，私有站点对所有请求返回 503（失败即拒绝）。
2. **CI 部署凭据**：Cloudflare 创建 API Token（权限：Account → Workers Scripts → Edit），然后：
   ```sh
   gh secret set CLOUDFLARE_API_TOKEN      # 粘贴 token
   gh variable set DEPLOY_ENABLED --body true
   ```
   `CLOUDFLARE_ACCOUNT_ID` 已配置。`DEPLOY_ENABLED` 不是 `true` 时，CI 只校验与构建，不部署。

## 回滚

`pnpm exec wrangler rollback -c wrangler.public.jsonc`（或 `wrangler.private.jsonc`），或 revert 对应提交后 push。

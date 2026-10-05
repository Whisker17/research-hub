# 0001：站点架构与实现决定（v1）

- 状态：已采纳（WHI-1610 ~ WHI-1619）
- 日期：2026-10-05
- 规格：[../product-spec.md](../product-spec.md)

## 1. 公开 / 私有拆成两个 Worker（偏离规格 §5 的单站点写法）

规格写的是一个站点、用 Access 保护 `/p/*` 路径。实现改为两个 Worker：

| Worker | 域名 | 内容 | 保护 |
| --- | --- | --- | --- |
| `research-hub` | `research-hub.demiwhisker.workers.dev` | 公开索引、`/r/<slug>/` | 无（全站 noindex） |
| `research-hub-private` | `research-hub-private.demiwhisker.workers.dev` | `/p/` 私有索引、`/p/<slug>/` | Cloudflare Access + Worker 校验 Access JWT |

原因：

- workers.dev 上的 Access 只能按整个域名开启（Worker 设置里的开关），不能按路径保护。按路径保护需要自定义域名，而 v1 决定不用自定义域名（规格 §5）。
- 拆开后，**公开 Worker 的静态资源里物理上不存在私有报告**。安全性不再依赖 Access 的路径规则写得对不对；`rh build` 的泄漏检查也能直接扫描公开产物。
- 私有 Worker 自己再校验一次 Access JWT（签名、issuer、AUD、有效期、邮箱白名单）。Access 关掉或配错时返回 403；Worker 没配置 AUD 时返回 503。失败即拒绝。

路径仍保留 `/p/` 前缀，以后绑定自定义域名时可以合并回单一域名。

## 2. Access 需要在控制台手动开启一次

Wrangler 的 OAuth 令牌不包含 Access 权限（`wrangler login --scopes-list` 里没有 access 相关项），调用 Access API 会返回 `auth.forbidden`。因此 Access 应用由用户在控制台开启，`pnpm access:setup` 从 Access 的登录重定向（`?kid=<AUD>`）读出 AUD，写入 `wrangler.private.jsonc` 并重新部署。

## 3. 构建：Astro 只生成索引页，`rh build` 负责分发

- Astro（静态输出，样式内联，无客户端 bundle）只生成首页、标签页、按月归档、404 和 `/p/` 私有索引。
- `rh build` 把 Astro 产物与报告 HTML 分发到 `dist/public` 与 `dist/private`，在报告的输出副本里注入返回链接（`<body>` 开头，文档流内，不改样式），补 `robots noindex`，写 `_headers` 与 `robots.txt`。
- **泄漏检查**：公开产物里不能出现任何 private 报告或 draft 的标题、摘要（原文与 HTML 转义形式）、`/p/<slug>/` 或 `/r/<slug>/` 路径；私有产物里不能出现 draft。失败时删除 `dist/`，不留下可部署的产物。
- 只被私有报告使用的标签和月份，不生成公开的标签页 / 归档页。

## 4. 手机检查的量化定义

规格 §6.2 的“正文容器宽度”“正文字号”按以下方式测量（`cli/lib/mobile.ts`）：

- 正文段落 = 可见的 `p`、`li`（最内层），文字 ≥ 20 字，排除表格、图、代码块、导航、目录与工具栏。
- 宽度、字号取**按字数加权的中位数**：少量窄卡片（如 finding 里的 `dd`）不会误报，整列被挤窄（77px 问题）一定会报。
- 横向溢出与设备宽度 390px 比较，而不是 `innerWidth`：手机模拟下内容过宽时 Chrome 会把布局视口撑宽、整页缩小，`innerWidth` 会跟着变大。
- 校准：用修复前的 answer-me-with-html（0.2.2-research.1）渲染示例页，正文宽 58px、内容被裁、fixed 工具栏压住正文，三项都报错；修复后（research.2）通过。夹具测试见 `test/mobile.test.ts`。

## 5. 其他

- `rh new` / `rh import` 默认 `visibility: private`：公开必须显式声明。
- `source_repo` 记录为 `<remote>:<仓库内路径>@<commit>`；路径未被 git 跟踪时追加“（未提交的工作区文件）”，避免 commit 与内容对不上。
- answer-me-with-html 的移动端修复（WHI-1611）已在 code-template PR #5 合并（0.2.2-research.2）。doc-hub 的 4 篇原稿在迁移前已用该版本重新生成；cfmm 导读（自定义 `build_html.mjs`）同样使用 research.2，无需再改原仓库。

## 6. 2026-10-05 更新：私有站点暂缓，doc-hub 迁移的 4 篇改为公开

所有者决定暂不配置 Access。doc-hub 迁移的 4 篇报告（`domain: work`）改为 `visibility: public`，发布在公开站点 `/r/<slug>/`：全站 noindex、robots 禁止抓取，但持链接即可访问（与 doc-hub 原先的暴露程度相同）。私有 Worker 保持部署，对所有请求返回 503（失败即拒绝）；以后配置 Access 后，把报告改回 private 并重新发布即可。

## 7. 2026-10-05 更新：私有站点启用

Access 已在 Worker 的 Access 标签配置（Scope：All traffic；policy：Cloudflare account + Email domain `mantle.xyz`），AUD 已写入 `wrangler.private.jsonc`。Worker 白名单 `ALLOWED_EMAILS = demiwhisker@gmail.com,@mantle.xyz`（`@域名` 条目匹配整个域名，不含子域名）。doc-hub 迁移的 4 篇改回 private，旧的 `/r/<slug>/` 链接失效。

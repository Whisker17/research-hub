# 0005：行内评论、公开报告的私有镜像与报告会话

- 状态：已采纳（WHI-2154；设计经 REVIEWER `mantle/gpt-6-astra` 三轮评审，结论 AGREE）
- 日期：2026-10-24
- 规格：[../product-spec.md](../product-spec.md) §4.2、§5、§7
- 依据：Linear 项目文档“research-hub 0.1.1 规划”（所有者输入与决定，2026-10-24）
- 取代：[0002](0002-lang-toggle-and-tweet-card.md) 决定 1 的一部分（外壳样式例外、`deployedReportHtml` 区分站点）；[0003](0003-index-redesign-scope-routes-publishing.md) 决定 2（私有索引用公开站点绝对地址链接 public 报告）与决定 4（public 报告的缩略图引用、不复制）
- 实施：WHI-2155（报告会话）、WHI-2156（Worker：评论 API、D1、身份、部署迁移）、WHI-2157（评论层与公开报告镜像）、WHI-2158（`rh comments` 与 skill 的评论处理流程）

## 背景

1. **所有者需求（2026-10-24）**：在任意一篇研究报告上选中文字、在右侧面板里评论，并显示评论人（飞书 / Lark 风格）。要对 agent 友好：所有者先留问题，之后让 Claude Code / pi 的 agent 去读；agent 在线程里回复，和 / 或修改报告。另外要记下产出报告的会话，方便所有者回到那个会话继续讨论。
2. **所有者决定**：评论只在私有站点上出现，public 报告镜像到私有站点；agent 用 Cloudflare Access service token 认证；v1 只追加，不能编辑、删除。
3. **现状（读代码与实测核对，基线 `release/v0.1.1` = fb89495）**：
   - 公开 Worker 只有静态资源，没有 Worker 代码（`wrangler.public.jsonc`）。私有 Worker（`worker/private.ts`）对每个请求先校验 Access JWT（`worker/gate.ts` 的 `checkAccess()`：签名、issuer、AUD、有效期，再按 `ALLOWED_EMAILS` 检查 `email`），通过后才从 `ASSETS` 返回；`run_worker_first: true`，所有路径都先经过 Worker。
   - 外壳只在 `cli/lib/build.ts` 的 `decorateReport()` 注入；`deployedReportHtml(r, lang)` 给 `rh build` 与 `rh check` 的手机检查共用，返回链接按报告的可见性选 `/` 或 `/p/`。私有站点的数据投影在 `lib/site-data.ts` 的 `projectSite()`：私有站点上 public 报告的链接与缩略图用 `publicUrl` 绝对地址（0003 决定 2、4）。
   - 21 篇报告全部是 private + published，其中 20 篇有英文版与 `card.png`，没有报告带 `assets/`。41 个报告页（21 中文 + 20 英文）都恰好有一个 `.am-doc-body`；页面里的 `<article>` 有 6–23 个（am 的 finding、prereq 卡片），所以“第一个 `article`”不能当正文根。
   - D1 数据库 `research-hub-comments` 已由 release 编排者经所有者明确授权用 `wrangler d1 create` 创建（2026-10-24；`wrangler d1 list`：uuid `3515ff96-6b73-4b13-9cee-7a7351490ea8`，0 张表）。
   - 还没有真实的 service token（所有者在创建）。Cloudflare 文档给出了 service token 签发的应用 JWT 的形状（决定 8）。

## 决定

### 1. 评论只在私有站点；public 报告镜像到 `/p/<slug>/`

- 评论层只注入私有站点的报告页。每篇 published 报告都能评论：private 报告在原地；**public 报告另外镜像一份到私有站点的 `/p/<slug>/`**（连同 `en/`、`assets/`、`card.png` 与缩略图）。公开站点的 `/r/<slug>/` 保持原样，**永远不含评论层，也不含任何评论数据**。
- 私有站点的投影（`/p/` 索引、`/p/tags/`、`/p/archive/`、related、缩略图）一律指向 `/p/<slug>/` 镜像，不再指向公开站点；“公开站点”入口仍用 `publicUrl` 绝对地址。镜像页的返回链接是 `/p/`。
- 实现：`deployedReportHtml(r, lang, site)` 增加目标站点参数；只有 `site === "private"` 时注入评论层，返回链接按目标站点给出。`rh check` 的手机检查用报告自己的站点（private 报告 → private，public 报告 → public），评论层默认收起，不影响检查结果。
- 镜像方向与 0003 决定 3 一致：public 的数据可以出现在私有站点。泄漏检查不变，并增加两条：公开产物里没有 `_rh/`（决定 4），也没有评论层的标记。
- 原因：评论 API 放在私有 Worker 上，浏览器请求同源，Access 的 cookie 与 JWT 直接可用，不需要跨域认证；公开 Worker 继续只有静态资源。
- 取代 0003 决定 2 的“public 报告链接到公开站点的绝对地址”和决定 4 的“私有索引引用 public 报告的缩略图、不复制”。

### 2. 存储：Cloudflare D1，不进 git

- D1 数据库 `research-hub-comments`，在私有 Worker 上的 binding 名为 `COMMENTS`（`wrangler.private.jsonc` 的 `d1_databases`，`migrations_dir: "worker/migrations"`）。
- 评论是对话状态，不是内容：不进 git，`reports/` 仍然只由 `rh` 写。评论不影响构建，也不影响已发布报告。
- 迁移文件放在 `worker/migrations/NNNN_<name>.sql`，**只做加法**（新表、新列、新索引；不删除、不改名、不改类型）。`deploy.yml` 与 `pnpm deploy:manual` 在部署私有 Worker **之前**执行 `wrangler d1 migrations apply research-hub-comments --remote`；迁移失败就不部署。
- 原因：加法迁移让旧版 Worker 在新表结构上仍能工作，部署回滚不需要回滚数据库。

### 3. 表结构（只追加；v1 不能编辑、删除）

```
threads(id, slug, lang zh|en, quote ≤1000, prefix ≤64, suffix ≤64, heading ≤200 NULL, rev,
        status open|resolved, created_at, created_by, created_by_kind human|agent,
        status_changed_at NULL, status_changed_by NULL, status_changed_by_kind NULL)  -- 只记最后一次状态变化
comments(id, thread_id, body ≤4000 plain text, author, author_kind human|agent, author_name,
         agent_runtime pi|claude-code NULL, agent_session ≤100 NULL, created_at)
```

- 线程和它的第一条评论一起创建（同一个 D1 batch）；没有空线程。
- `id`：Worker 生成的 `crypto.randomUUID()`。时间：Worker 写入的 UTC ISO 8601（`new Date().toISOString()`）。客户端不能指定 id、时间和 `*_kind`。
- `author` / `created_by` / `status_changed_by`：人 = 已校验的邮箱；agent = service token 的 client id。`author_name`：人 = 邮箱 `@` 之前的部分；agent = 请求里的 `as`（决定 8）。
- 长度按 Unicode 码点计。`body` 去掉首尾空白后不能为空；`quote` 不能为空。
- 索引：`threads(slug, lang, status)`、`threads(status, created_at)`、`comments(thread_id, created_at)`。
- 原因：只追加让“谁在什么时候说了什么”不可篡改，agent 的回复也无法覆盖人的评论；编辑、删除留到有真实需求时再做（需要新的迁移与决定）。

### 4. 报告清单 `_rh/reports.json`

- `rh build` 写 `dist/private/_rh/reports.json` = `[{slug, lang, rev, title}]`，覆盖私有站点上的**每一个报告页**（含 public 报告的镜像），按 slug、lang 排序。`lang` 是 `zh` 或 `en`；`title` 是该语言的标题（英文缺失时回退中文）。
- `rev` = 该语言**未注入外壳的**报告 HTML（`index.html` / `index.en.html` 的文件字节）的 sha256 的前 12 个十六进制字符（小写）。外壳改了不影响 `rev`，只有重新渲染报告才会变。
- 报告页上一个注入的元素带 `data-rh-slug`、`data-rh-lang`、`data-rh-rev`。
- Worker 通过 `ASSETS` 读取这个文件（同一次部署里不变，可以按 isolate 缓存）。slug 或 slug + lang 不在清单里 → 404（决定 9）。
- `_rh/` 只进私有站点：泄漏检查要求公开产物里没有 `_rh/`。slug 只能是小写字母、数字和连字符，不会与 `_rh` 冲突。
- 原因：Worker 不需要知道报告目录，也不读 git；清单是 `rh build` 与 Worker 之间唯一的约定（WHI-2157 写、WHI-2156 读，测试各用一份夹具）。

### 5. 锚定

- **正文根**：页面上恰好一个 `.am-doc-body`（answer-me-with-html 的正文列）时用它；否则恰好一个 `article` 时用它；否则恰好一个 `main` 时用它；否则用 `body`。任何情况下都排除 `[data-rh-*]` 元素（外壳与评论层）里的文字。现有 41 个报告页都走第一条。
- **选择器**：W3C Web Annotation 的 TextQuoteSelector——`quote` 加前后各 32 个字符的 `prefix` / `suffix`，取自正文根的文本，空白规范化（连续空白合成一个空格，去掉首尾空白）后保存与比较。`heading` 是选区之前最近的标题文字（可为空），只用于显示。
- **定位**：在规范化后的正文根文本里找 `quote` 的所有出现位置；只有一处就用它；有多处时只保留前面紧接 `prefix`、后面紧接 `suffix` 的位置，剩一处就用它。只有**唯一匹配**才高亮。找不到或仍有多个候选时，线程是**失效（outdated）**的：只在面板里显示，展示保存的引文，不高亮、不猜。
- `rh render` 不自动重新锚定，也不改评论数据。
- 线程按语言分开：中文页上的线程只在中文页显示，面板标明语言。
- “失效”有两种信号，含义不同：页面上的失效 = 定位不到唯一匹配（决定高亮与否）；`rh comments` 的失效 = 线程的 `rev` 与当前渲染的 `rev` 不同（页面重新渲染过，引文可能仍然能匹配）。`rh comments` 不做 DOM 定位。
- 原因：TextQuoteSelector 不依赖 DOM 结构，报告重新渲染后只要原文还在就能找到；唯一匹配才高亮，避免把评论挂到错误的位置。

### 6. 高亮

- 用 CSS Custom Highlight API（`CSS.highlights` + `::highlight(rh-comment)`）。**不包裹、不修改报告的 DOM**。
- 这是“外壳样式只作用于 `data-rh-*` 元素”（0002 决定 1、0003 决定 1）的**唯一例外**：`::highlight(rh-comment)` 只能设 `background-color` 与 `color`，不能有任何影响布局的属性。
- 浏览器不支持时只显示面板，不降级为 DOM 包裹。
- 原因：包裹文字会改变报告的 DOM，可能打断 am 的脚本、目录与选区逻辑；Highlight API 不改布局，手机检查的结果不受影响。

### 7. 界面

- 默认隐藏：外壳里只有一个带数量的按钮（放在 0002 决定 2 的外壳位置，不用 fixed 元素长期压住正文，规格 §6.2 第 4 条）。
- 打开后：桌面是右侧抽屉，**覆盖在报告上方，不让报告重新排版**；≤ 760px 是底部面板。Esc 关闭。
- 选中正文根里的文字 → 出现“评论”按钮 → 输入框。
- 线程卡片：引文 chip、上一条 / 下一条、复制链接 `#c-<threadId>`（打开页面时直接定位到该线程）、解决 / 重新打开、显示已解决的开关。
- 评论：首字母头像（颜色由 `author` 哈希得到）、名字（邮箱 `@` 之前的部分 / agent 名字）、时间、正文（只用 `textContent` 写入，不解析 HTML 或 Markdown）。agent 的评论带 Agent 标记；记录了会话时显示恢复命令（`pi --session <id>` / `claude --resume <id>`）和复制按钮。
- 提交失败时保留输入的文字并显示错误。API 不可用（网络错误、Access 会话过期被重定向等）→ 整个评论层隐藏，报告照常阅读。
- 静态 HTML 里没有任何 API 数据；评论只在页面加载后从 API 取。
- 文案遵循最少标签规则（WHI-2153 写进 AGENTS.md）：不加不必要的二级标签和说明，让版式自己说明。
- 原因：默认收起让报告的阅读体验与手机检查不受影响；覆盖式抽屉不改报告的排版。

### 8. 身份

- **人**：已校验的 JWT 里有 `email`，并且在现有的 `ALLOWED_EMAILS` 白名单里。
- **agent**：已校验的 JWT **没有** `email`，它的 `common_name` 精确等于 `AGENT_CLIENT_IDS`（逗号分隔，`wrangler.private.jsonc` 的 vars；client id 不是秘密）中的一项。`AGENT_CLIENT_IDS` 为空 → 不接受任何 agent。
- 两者都不是 → 403。带 `email` 的 JWT 永远不会被当成 agent。`kind` 只由 Worker 根据身份决定，客户端无法指定。
- agent 的显示名来自请求字段 `as`（1–40 个字符，缺省为 `agent`）；`agent_runtime`（`pi | claude-code`）与 `agent_session` 可选。人的请求带这三个字段 → 400。
- **service token 的 claim 形状：已实测（2026-10-24）**。Cloudflare 文档 [Application token § Service token authentication](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/)（2026-06-25 更新）写明：service token 认证签发的应用 JWT 带 `common_name` = service token 的 Client ID（即请求头 `CF-Access-Client-Id` 的值，形如 `<hex>.access`），`sub` 为空串，没有 `email`。2026-10-24 用真实的 service token `research-hub-agent` 实测：带 `CF-Access-Client-Id/Secret` 的请求通过 Access，从 Access 为该请求签发的 `CF_Authorization` JWT 中读到的 claim 为 `type: "app"`、`sub: ""`、`common_name: "57632a2eac680f783dd5979108fd155a.access"`，另有 `iat`、`exp`、`iss`、`aud` 和内部 claim `h_INTERNAL_DO_NOT_USE`；**没有 `email`**。与文档一致，所以“没有 `email` + `common_name` ∈ `AGENT_CLIENT_IDS`”的规则成立。失败即拒绝：不匹配上面任一规则的令牌一律 403。现有 `checkAccess()` 在 `ALLOWED_EMAILS` 非空时已经对没有 `email` 的令牌返回 403，所以在 WHI-2156 落地之前 service token 进不来。
- 前置条件（所有者，一次性）：在私有 Worker 的 Access 应用上加一条 Service Auth 策略并放行这个 token；client id 写进 `AGENT_CLIENT_IDS`；id 与 secret 只放在所有者本机的环境变量 `RH_ACCESS_CLIENT_ID` / `RH_ACCESS_CLIENT_SECRET`。
- **接受的风险**：service token 能读整个私有站点（Access 的授权按整个域名，0001 决定 1）。撤销方法：从 `AGENT_CLIENT_IDS` 删掉它，或在 Access 里吊销 token。
- 原因：身份只从已校验的 JWT claim 来，人和 agent 用两份独立的白名单，任何一层配置缺失都是拒绝，而不是放行。

### 9. API

私有 Worker 在交给 `ASSETS` 之前处理 `/api/comments*`，走同一个 `checkAccess`（再按决定 8 区分身份）。只收发 JSON；所有响应带 `cache-control: private, no-store` 和现有的安全响应头；不发任何 CORS 头。

| 方法与路径 | 请求 | 响应 |
| --- | --- | --- |
| `GET /api/comments?[slug][&lang][&status][&cursor]` | `status` = `open \| resolved \| all`，缺省 `all`；`slug`、`lang`、`status` 都是独立的可选筛选；不给 `slug` 就是跨报告列表 | `{threads: [{…线程字段, comments: [最近 ≤20 条，按时间正序], more}], next}`，每页 100 个线程，按 `(created_at, id)` 正序 |
| `GET /api/comments/threads/:id?[cursor]` | — | `{thread, comments, next}`，每页 100 条评论，按时间正序 |
| `POST /api/comments/threads` | `{slug, lang, quote, prefix, suffix, heading?, rev, body, as?, agent_runtime?, agent_session?}` | 201 `{thread}`（含第一条评论） |
| `POST /api/comments/threads/:id/comments` | `{body, as?, agent_runtime?, agent_session?}` | 201 `{comment}` |
| `POST /api/comments/threads/:id/status` | `{status: "open" \| "resolved"}` | 200 `{thread}`；状态没变时不改 `status_changed_*` |

- 线程字段与评论字段就是决定 3 的列；`more` 表示这个线程还有更早的评论（用线程接口取）。`next` 是不透明的游标字符串，没有下一页时为 `null`。客户端一直跟着 `next` 取到 `null`；**不静默截断**。
- 校验：带 `slug` 的列表与新建线程要求 slug（以及 slug + lang）在清单里；`rev` 必须是 12 个小写十六进制字符，但不要求等于当前 `rev`（页面跨部署开着也能评论）。跨报告列表和按线程 id 的操作不查清单：已下线报告的线程仍能读到，不会凭空消失。
- 写请求（`POST`）：必须 `content-type: application/json`；带 `Origin` 时必须与请求 URL 同源；**不带 `Origin` 只接受 agent 身份**（浏览器的 `fetch` POST 总会带 `Origin`）。
- 错误：400 校验失败（字段、长度、枚举、JSON、content-type）；403 身份或 `Origin` 不合格；404 未知的 slug、线程或 `/api/comments` 下的未知路径。错误体是 `{error: "<说明>"}`。
- v1 不限流：只有白名单里的人和 agent 能访问，加上长度上限。
- 路由名：`/api/` 是新增的站点路由，按 0003 决定 5 的规则把 `api` 加进 `lib/schema.ts` 的保留 slug 名单（WHI-2155，它在 0.1.1 中负责 `lib/schema.ts`；现有 slug 都不是 `api`）。`_rh` 含下划线，本来就不是合法 slug。
- 原因：分页把每个响应的大小限定住；同源加 JSON content-type 挡住跨站表单的 CSRF；agent（curl / CLI）没有 `Origin`，所以只对 agent 放开。

### 10. agent 处理评论的流程（research-hub skill，“处理评论”）

1. `rh session add <slug>`（决定 11），然后 `rh comments list <slug> --status open --json`（不加 `--lang` 就是两种语言）。
2. 对每个线程二选一：
   - 直接回复（`rh comments reply`）；
   - 或修改报告：改 `explainer.md` / `explainer.en.md`，给改动的论断在台账里加行，英文版交给 sol 审查，`rh render <slug> --force`，`rh check`；然后回复“已准备，未发布：<改了什么>”。
3. 所有者执行 `rh publish`（把关 ③）后，再回复一次，带上发布的提交 SHA。
4. 不主动解决或重新打开线程，除非所有者要求；不执行 `rh publish`。把关 ①②③ 不变。
- 原因：评论只是输入，报告的修改仍要经过台账、审查和所有者的发布把关；“已准备，未发布”让评论人知道线上页面还没变。

### 11. 报告会话

- `meta.yml` 增加可选字段 `sessions: [{runtime: pi | claude-code, id, at: YYYY-MM-DD, note?}]`：只追加（同一 runtime + id 不重复），只由 `rh` 写（`rh new`、`rh import`、`rh session add`）。
- 只在 CLI 里用：`rh paths <slug>` 为每个会话打印恢复命令 `pi --session <id>` / `claude --resume <id>`。不在任何网页上显示（公开站点和私有站点都不显示），不进入 `lib/site-data.ts` 的任何投影。
- 会话 id 的来源：pi 在会话里导出 `PI_SESSION_ID`（本 ADR 的会话里实测存在），恢复用 `pi --session <id>`（pi `docs/cli.md`）；Claude Code 的环境变量未确认，由 WHI-2155 实测，确认不了就只支持 `--session` / `--runtime` 参数。
- 原因：会话 id 是本机状态，对读者没有意义；按 runtime 区分，恢复命令才不会给错。

## 非目标（0.1.1 不做）

- 公开 `/r/` 页面上的评论。
- 编辑、删除评论，表情回应、附件、@提及、通知、限流。
- 自动重新锚定、跨语言共享线程、把评论数据写进 git 或报告。
- 在网页上展示报告会话；给现有报告补录会话。

## 后果

- 私有站点会多出 public 报告的镜像；public 报告在私有站点上的地址从公开站点的绝对地址变成 `/p/<slug>/`。现在没有 public 报告，所以线上没有可见的变化，验证靠混合夹具（WHI-2157）。
- 私有 Worker 不再只是“校验 + 静态资源”：它有了 API 和数据库。部署顺序变成“迁移 → 私有 Worker → 公开 Worker”，CI 的 Cloudflare 令牌需要 D1 编辑权限。
- 评论不在 git 里：D1 是唯一的副本，备份依赖 D1 自身的 Time Travel。
- agent 的评论和人的评论在同一个线程里，永远标为 Agent；agent 对报告的修改仍要等所有者 `rh publish`。
- 回滚：revert 代码后重新部署即可。评论层与镜像随代码消失；D1 里的数据保留，不影响站点。

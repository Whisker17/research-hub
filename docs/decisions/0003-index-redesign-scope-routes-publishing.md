# 0003：索引站改版（0.1.0）的范围、路由与发布边界

- 状态：已采纳（WHI-1924，所有者于 2026-10-18 批准）
- 日期：2026-10-18
- 规格：[../product-spec.md](../product-spec.md) §5、§7
- 实施：WHI-1926（数据投影与资源分发）、WHI-1928（设计系统）、WHI-1930（首页与私有索引）、WHI-1932（标签页与归档）、WHI-1934（报告外壳与验收）、WHI-1936（公开 Daily 页面）
- Daily Topics 的设计不在本文：见 ADR 0004（WHI-1927）。本文只给 `/daily/` 预留路由并划定发布边界。
- 决定 2、决定 4 部分被 [0005](0005-inline-comments.md) 取代：public 报告镜像到私有站点 `/p/<slug>/`。决定 1 的“外壳样式只作用于 `data-rh-*`”另有 0005 决定 6 的高亮例外。

## 背景

1. 0.1.0 按 [paperswithcode.co](https://paperswithcode.co/tasks/auto-research) 的设计语言重做索引站：暖纸色配色、Newsreader / JetBrains Mono / Inter 三种字体、eyebrow 标签、统计条、左栏筛选、带缩略图和 chip 的列表行、Task 页风格的标签页。规划记录见 Linear 项目文档“research-hub 0.1.0 规划”§3、§6。
2. **实测（2026-10-18，基线 24225b1，`node cli/rh.ts build`）**：公开站点 0 篇报告，私有站点 16 篇私有报告 + `/p/` 私有索引；泄漏检查通过，0 篇 draft。16 篇已发布报告全部是 private（`domain: crypto` 12 篇、`work` 4 篇），其中 15 篇有 `index.en.html` 与 `card.png`，没有报告带 `assets/`。公开首页、公开标签页和归档页现在都是空的，所以改版首先服务私有站点 `/p/`；公开站点的各种状态只能靠混合夹具验证。
3. 现状（读代码核对，不按规划时的行号）：
   - Astro（`astro.config.mjs`：静态输出、样式内联、只用 `is:inline` 脚本、没有 `_astro/` 共享资源）生成 `/`、`/tags/`、`/tags/<tag>/`、`/archive/`、`/YYYY/MM/`、`404` 和 `/p/`。
   - `cli/lib/build.ts` 的 `assemble()`：Astro 产物里 `p/` 进私有站点，**其余顶层产物默认进公开站点**；私有站点另外复制 `404.html` 与 `favicon.svg`。published 报告进 `/r/<slug>/`（public）或 `/p/<slug>/`（private），连同 `en/`、`assets/`、`card.png`；目标目录已存在时报错。
   - 泄漏检查：公开产物里不能有 `p/` 目录，也不能出现任何非 public 或 draft 报告的标题、摘要（中英文、原文与 HTML 转义）和 `/p/<slug>/`、`/r/<slug>/` 路径；私有产物里不能出现 draft。
   - `lib/site-data.ts`：公开页面只用 `publicReports`（public + published），`/p/` 用 `allPublished`。私有站点没有标签页，`/p/` 上的标签 chip 不是链接。
   - `lib/schema.ts`：slug 只要求小写字母、数字和连字符，`daily`、`tags` 这类名字现在是合法 slug；`tags.yml` 每个标签只有 `label`。
   - 语言切换：`Base.astro` 里一段按选择器逐个替换文字的脚本，偏好存在 `localStorage.rh_lang`。
4. 所有者决定（2026-10-18，规划 §6 第 4 条，取代 §4 / §5 里“Daily 只放私有站”的写法）：Daily Topics 全部放公开站点 `/daily/`。

## 决定

### 1. 只改索引页、站点外壳和构建分发；报告不重新渲染

- 改的范围：Astro 页面、组件与样式（`src/`）；`decorateReport()` 注入的元素（返回条、语言切换、卡片模式的按钮与区域）；`rh build` 的数据投影、资源分发和泄漏检查。
- 不改：`reports/` 下的报告源 HTML 与稿件；不执行 `rh render --force`；不往报告里加改变其自身排版的 CSS（规格 §6.1、[0002](0002-lang-toggle-and-tweet-card.md) 决定 1）。外壳样式仍只作用于 `data-rh-*` 元素（外加 0002 已有的卡片模式隐藏正文规则）。外壳可以用 `@font-face` 引用共享字体，但字体只用在 `data-rh-*` 元素上。
- 回滚 = revert 代码后重新部署，不需要重新渲染报告或迁移内容。
- 继续“零 bundle”：不引入客户端框架和打包产物；允许 `is:inline` 小脚本（主题首帧、语言、筛选、⌘K）。`inlineStylesheets: "always"` 保持不变，产物里仍没有 `_astro/` 共享资源。

### 2. 0.1.0 的页面集合

| 路由 | 站点 | 数据 | 实施 |
| --- | --- | --- | --- |
| `/` | 公开 | public + published | WHI-1930 |
| `/p/` | 私有 | 全部 published；public 报告链接到公开站点的绝对地址（**0005 起改为私有站点的 `/p/<slug>/` 镜像**） | WHI-1930 |
| `/tags/`、`/tags/<tag>/` | 公开（改为 Task 页风格） | 只含被 public + published 报告用到的标签 | WHI-1932 |
| `/p/tags/`、`/p/tags/<tag>/` | 私有（**新增**） | 全部 published | WHI-1932 |
| `/archive/`、`/YYYY/MM/` | 公开（改样式，URL 不变） | public + published | WHI-1932 |
| `/p/archive/`、`/p/YYYY/MM/` | 私有（**新增**：WHI-1932 决定做，私有导航不能指向公开 `/archive/`，与公开归档共用组件） | 全部 published | WHI-1932 |
| `/r/<slug>/`、`/r/<slug>/en/` | 公开 | 报告原样 + 注入的外壳 | 外壳换样式：WHI-1934 |
| `/p/<slug>/`、`/p/<slug>/en/` | 私有 | 报告原样 + 注入的外壳（0005 起含 public 报告的镜像与评论层） | 外壳换样式：WHI-1934 |
| `/daily/`、`/daily/<date>/` | 公开 | Daily 数据（ADR 0004） | WHI-1936 |
| `404.html` | 两站 | — | WHI-1928（样式） |

导航规则：

- 公开页面不链接私有站点的任何地址（现有泄漏检查已拦截 `/p/<slug>/`）。
- 私有页面的站内导航只指向 `/p/…`，不指向公开的 `/tags/`、`/archive/`；例外是 public 报告的链接和一个明确的“公开站点”入口，它们用 `rh.config.json` 的 `publicUrl` 绝对地址。
  - **部分被 [0005](0005-inline-comments.md) 取代**（决定 1）：public 报告也镜像到私有站点，私有页面的报告链接一律指向 `/p/<slug>/`；只剩“公开站点”入口用 `publicUrl`。
- 主题与语言偏好各自存在本站的 `localStorage`，两个 Worker 之间不同步。

### 3. 数据投影：派生数据跟随报告的可见性

- 方向规则：public 的数据可以出现在私有站点；private 和 draft 的数据不能出现在公开站点；draft 不出现在任何产物里。
- 公开页面上的**每一项派生数据**——列表、计数（左栏、统计条、标签页）、标签共现 / 相关标签、特色配图、缩略图、台账统计、EN / 卡片标记、“最近更新”日期、related 链接——都只从 public + published 集合计算。私有站点用全部 published。
- 实现位置：`lib/site-data.ts` 按站点给出投影（WHI-1926），页面不直接读报告列表。测试夹具同时包含 public、private、draft 三种报告。

### 4. 静态资源归属

| 资源 | 来源 | 进入 |
| --- | --- | --- |
| `favicon.svg`、`404.html` | `public/`、Astro | 两站（现状） |
| 字体：Newsreader、JetBrains Mono、Inter 的拉丁子集（自托管，不用外部 CDN） | `public/fonts/` | 两站，路径 `/fonts/…` |
| 主题首帧脚本 | 默认内联在每页 `<head>`（`is:inline`），不是文件 | — |
| 报告 HTML、`en/`、`assets/`、`card.png` | `reports/…` | 只进报告所在的站点 |
| 列表缩略图（`rh build` 从 `card.png` 生成，格式由 WHI-1926 定） | 构建时生成 | 只进报告所在的站点，放在报告目录内（`/r/<slug>/` 或 `/p/<slug>/` 下） |

- **共享白名单**只有：`favicon.svg`、`404.html`、`fonts/`；主题脚本若改成独立文件，也必须加进白名单。白名单里的资源不能含任何报告数据。
- 私有索引展示 public 报告的缩略图时，用公开站点的绝对地址引用（与链接相同），不复制。
  - **被 [0005](0005-inline-comments.md) 取代**（决定 1）：public 报告的 HTML、`en/`、`assets/`、`card.png` 与缩略图同时复制进私有站点的 `/p/<slug>/`，私有索引引用镜像里的缩略图。上表“只进报告所在的站点”对 public 报告改为“两站”；private 报告仍只进私有站点，私有站点另有只属于它的 `_rh/reports.json`。
- `rh build` 改为按“来源 → 站点”清单分发（WHI-1926）：`p/` 进私有站点，白名单进两站，其余已登记的 Astro 顶层产物进公开站点；**清单外的顶层产物让构建失败**，不再默认进公开站点。
- 负向测试：私有报告的缩略图、`card.png`、`assets/` 不出现在公开产物里。

### 5. 保留路由名

- 报告 slug 不能是：`daily`、`tags`、`archive`、`fonts`、`about`，也不能是纯数字（会和 `/YYYY/` 归档路径冲突）。
- 原因：报告与站点页面共用 `/p/<name>/`（以及将来合并成单一域名后的根路径，见 [0001](0001-site-architecture.md) 决定 1）。`/p/tags/`、`/p/archive/` 是本次新增的私有页面；`daily` 现在给公开 Daily 用，`about` 留给以后的报告概览页。
- 名单是 `lib/schema.ts` 里的一个常量（WHI-1926）；`rh new` 与 `rh check` 都拒绝这些 slug。`rh build` 的目标路径冲突检查保留：冲突时报错，不覆盖。新增站点路由时，先把名字加进这个名单。
- 实测：现有 16 个 slug 都不在名单里，也没有纯数字 slug。

### 6. `tags.yml` 新增可选字段 `description` / `description_en`

- 两个字段都可选（去掉首尾空白后非空）；旧的 `tags.yml` 仍然合法；`rh tags add` 写回时保留它们。英文缺失时回退中文；页面在没有描述时也要排版正常。
- **公开规则**：只有被至少一篇 public + published 报告用到的标签，它的描述（和标签名）才会出现在公开产物里；其余标签的描述只出现在私有站点。WHI-1926 把这类标签的描述加入公开产物的泄漏指纹，并写测试。
- 标签一旦被公开报告用到，描述就会公开：写描述时按可公开的口吻写。

### 7. 筛选与搜索的边界

- 列表仍是服务端渲染的行 + 客户端筛选（现有 `ReportList`：关键词、domain、tag、URL 参数、中英文检索），行为保持不变。
- ⌘K 和 `/` 只把焦点移到现有的筛选框，不打开新的搜索界面。
- 排序（最近更新 / 最新创建）和时间范围（本周 / 本月 / 全部）的日期字段与边界由 WHI-1930 定义并写测试。

## 非目标（0.1.0 不做）

- 报告概览页（about）：只保留 `about` 路由名。
- 独立的 `search.json` 索引与模糊搜索；全文搜索仍按规格 §7 留给以后（Pagefind）。
- 重新渲染已发布报告、给报告打 CSS 补丁、改 answer-me-with-html。
- 客户端框架 bundle、外部字体 CDN。
- 两个 Worker 之间同步主题 / 语言偏好；自定义域名与站点合并。
- Daily 的数据模型、状态机、运行方式与公开字段（ADR 0004，WHI-1927）。

## 后果

- WHI-1926 / 1928 / 1930 / 1932 / 1934 / 1936 以本文为契约；超出上面页面集合和资源表的页面或资源，先改本文再实现。
- 公开页面的派生数据变多，泄漏面随之变大。防线从“标题指纹”扩展为“按站点投影 + 资源清单 + 指纹”，由 WHI-1926 的混合夹具测试覆盖。
- 新报告不能再用保留名作 slug；现有报告不受影响。
- 公开站点在出现 public 报告之前仍是空的：空态、无结果、无卡片等状态要在夹具上验证，不能只看线上。
- 回滚只需 revert 代码，没有内容迁移。

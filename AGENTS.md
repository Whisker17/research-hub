# AGENTS.md

research-hub 存放 AI 生成的研究报告，并把它们发布成手机友好的单文件 HTML。
权威规格：[docs/product-spec.md](docs/product-spec.md)；实现决定：[docs/decisions/](docs/decisions/)。

## 规则（先读）

- **`rh` 是唯一的写入入口**：建报告、导入、渲染、检查、发布都用 `pnpm rh …`（`node cli/rh.ts …`）。不要手写 `meta.yml` 的状态字段，不要手动把 HTML 复制进 `dist/`。
- **`rh` 不调用 LLM**。调研、写 explainer 由 Claude Code 会话完成（项目 skill：`.claude/skills/research-hub/`，按它的流程做）。
- **人工把关点只有三个**：确认 brief、审阅调研结果、审阅页面后执行 `rh publish`。不要替用户执行 `rh publish`，除非用户明确要求。
- **默认私有**：`rh new` / `rh import` 默认 `visibility: private`；只有用户明确要求才设为 `public`。
- **私有站点已启用**：Cloudflare Access（Cloudflare 账号成员 + Email domain mantle.xyz），Worker 再校验 JWT 与白名单 `demiwhisker@gmail.com,@mantle.xyz`。工作类内容（`domain: work`）一律 private。
- **论断台账**：原生报告的 `research/ledger.md` 必须有一张“论断 | 证据 | 类型”表，类型只能是 observed / inferred / speculative。explainer 里的每个论断都要在台账里有一行。
- **标签**：先 `rh tags list` 看已有标签，不要登记同义词；新标签用 `rh tags add <key> --label <展示名>`。
- **手机适配**：不要往报告 HTML 里注入 CSS 补丁。手机检查不过就修源头（answer-me-with-html 或原仓库的构建脚本）。
- **已发布报告不自动重新渲染**；需要时 `rh render <slug> --force`。
- 提交前运行 `pnpm verify`（类型检查、测试、`rh check --no-shot`、构建与泄漏检查）。

## 目录

```
reports/YYYY/MM/<slug>/   报告（meta.yml、brief.md、research/、explainer.md、index.html、source.md、assets/）
tags.yml                  标签登记表
lib/                      CLI 与 Astro 共用：schema、报告读取、台账解析、站点数据
cli/                      rh 命令（commands/）与检查、构建、手机检查（lib/）
src/                      Astro 索引页（首页、标签、按月归档、/p/ 私有索引）
worker/                   私有站点 Worker：Access JWT 校验（失败即拒绝）
scripts/                  smoke.sh（线上冒烟）、access-setup.ts（Access AUD 配置）
test/                     node --test：单元、手机检查夹具、端到端
```

## 常用命令

```sh
pnpm rh new "Meme Launchpad" --slug meme-launchpad --domain crypto --tags meme
pnpm rh render meme-launchpad
pnpm rh check meme-launchpad        # 含手机检查，截图在 .rh/shots/<slug>/
pnpm rh paths meme-launchpad        # 报告目录、发布地址、am 与 vault brief 目录
pnpm rh publish meme-launchpad
pnpm verify
```

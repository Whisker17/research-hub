---
name: research-hub
description: 在 research-hub 仓库里把一个研究 topic 做成手机友好的单文件 HTML 报告并发布：brief → 调研（含论断台账）→ answer-me-with-html explainer → rh render / check → rh publish。用户说“做一篇报告 / 研究一下 X 并发到 research-hub / 根据这些资料生成报告 / 导入这篇报告 / 更新某篇报告 / rh new …”时使用。全程只有三个人工把关点：确认 brief、审阅调研、审阅页面后发布。
---

# research-hub：从 brief 到上线

你驱动整条链路，`rh` 负责确定性的搬运与检查。权威规则在仓库根目录的 `AGENTS.md` 和 `docs/product-spec.md` §3；本 skill 与它们冲突时，以它们为准。

## 0. 先记住这几条

- **只用 `pnpm rh …` 写报告目录的元数据**：不要手改 `meta.yml` 的 `status` / `updated` / `changelog` / `am_version`，不要手动往 `dist/` 放文件。`brief.md`、`research/*`、`explainer.md` 由你写；`title` / `summary` 可以手改。
- **三个人工把关点**（①②③）。每个把关点都要**停下来等用户明确答复**，不要在同一轮里越过它。用户已在本轮明确批准的把关点可以视为通过（例如“brief 就这样，直接开始调研”）。
- **不替用户执行 `rh publish`**。只有在 ③ 用户明确说“发布”后才执行。
- **默认 private**。只有用户明确要求时才用 `--visibility public`；`domain: work` 一律 private。
- **不编造**。页面上的每个论断都要在 `research/ledger.md` 有一行，类型只能是 observed / inferred / speculative；speculative 的论断要在页面上标明。
- **不往报告 HTML 里注入 CSS 补丁**。手机检查不过就改稿件，或修 answer-me-with-html 源头。
- Claude Code 的 Bash 不是交互终端：`rh new` / `rh import` 遇到未登记的标签会直接失败。先在 ① 和用户确认标签，再 `pnpm rh tags add <key> --label <展示名>`。

路径约定：报告目录 `reports/YYYY/MM/<slug>/`（下文记作 `$DIR`）。不要猜路径，运行 `pnpm rh paths [slug]`：它打印 vault 的 brief 目录（`briefs`）、answer-me-with-html 的 CLI（`am`）与文档目录（`am_docs`）；给出 slug 时还打印 `dir`、`status`、发布地址 `url` 和截图目录 `shots`。下文的 `am` 指 `node <am 路径>`。

## 1. 选路径

| 用户给了什么 | 路径 | 起点 |
|---|---|---|
| 一个 topic / 想法，或 vault `Research Briefs/` 里已有 brief | **A 完整流程** | §2 |
| 现成资料（链接、PDF、笔记、代码、聊天记录），要据此出报告 | **B 资料驱动** | §2（brief 里写明资料范围），§3 改为“整理资料 + 补证” |
| ChatGPT / Gemini 等外部 Deep Research 的结果 | **C 外部调研** | §2（建报告后 `rh import research`），§3 以导入结果为线索补证、写台账 |
| 在别处做完的单文件 HTML 或 am 稿件 | **D 导入报告** | §6 |
| 更新已发布的报告 | **E 就地更新** | §7 |

拿不准时问用户一句，不要猜。

## 2. 把关 ①：确认 brief 与 meta → 建报告

① 放在 `rh new` **之前**：确认后一次建好，快照就是确认后的 brief，slug 和标签也不用返工（slug 来自目录名，建好后不能通过 `meta.yml` 改）。

1. **准备 brief**：在 `pnpm rh paths` 打印的 `briefs` 目录（vault 的 `Research Briefs/`）里找。
   - 已有 brief：读它。
   - 没有 brief（路径 A 只给了 topic、路径 B/C）：按 [references/brief-template.md](references/brief-template.md) 起草，先只放在对话里，不写文件。
2. **拟 meta**：`slug`（小写字母、数字、连字符）、`domain`（ai | crypto | finance | work | other）、`tags`（先 `pnpm rh tags list`，尽量复用；确需新标签时给出键和展示名，并说明为什么不是已有标签的同义词）、`visibility`（默认 private）。
3. **把关 ①**：一次性给用户看 brief（全文草稿，或已有 brief 的要点：研究问题、范围与非目标、读者、交付要求）和 meta（含拟新增的标签），问“brief 和 meta 是否确认？”。**停下等待。** 用户提修改就改完再问，直到明确确认。之后不要再就同一内容追问。
4. **建报告**（① 通过后，不再停顿）：

   ```sh
   # 新起草的 brief：写进 <briefs>/<文件名>.md（目录不存在就创建）。vault 只放 brief，不放调研产出。
   pnpm rh tags add <key> --label <展示名>   # 只登记 ① 里确认过的新标签
   pnpm rh new "<brief 文件名>" --slug <slug> --domain <domain> --tags <a,b> [--visibility public]
   ```

   `rh new` 会快照 `brief.md`、在 meta 里记录 `brief_source`、生成空的 `research/ledger.md`，状态是 draft。路径 C 接着运行 `pnpm rh import research <slug> <file.md> --tool <工具名>`。
5. 之后 brief 还要改（例如 ② 时用户调整范围）：同时改 vault 原文件和 `$DIR/brief.md`，保持两者一致。domain / tags / visibility 可以直接改 `meta.yml` 对应字段，再运行 `pnpm rh check --no-shot` 验证；slug 来自目录名，建好后不能改：只有在报告还没有任何产出（`research/` 里只有空台账、没有 explainer.md / index.html）时，才可以经用户同意删除 `$DIR` 后重新 `rh new`；已有产出就保留原 slug，告诉用户这个限制。

## 3. 调研 → 把关 ②：审阅调研结果

1. **启动后台 agent**（Claude Code 的 Agent / Task 工具，后台运行）。任务说明按 [references/research-agent.md](references/research-agent.md) 填写，必须包含：brief 路径、研究问题清单、用户资料清单（路径 B）或外部调研文件（路径 C）、产出文件与台账格式。没有后台能力时，你自己在前台按同一份说明执行。
   - 路径 B：先把用户资料登记到 `$DIR/research/references.md`（小于约 5 MB 的本地文件复制到 `$DIR/research/references/`；大文件和网页只记链接、路径与访问日期）。agent 以这些资料为主，只为补证或核对去查一手来源。
   - 路径 C：导入的外部结果是**线索**，不是证据。台账里的证据要追到它引用的原始来源；追不到的论断标 speculative 或删掉。
   - **题目大时拆成几路并行**（例如机制 / 产品 / 方案各一路）：每路一个 agent，只写自己的 `research/notes-<lane>.md`，台账编号用各自的前缀（M1…、P1…、A1…），台账表放在该文件末尾。拆法见 research-agent.md 的“多路并行”。
2. **产出**（都在 `$DIR/research/`）：
   - `notes.md`：按研究问题组织的发现、来源列表（一手来源标 **PRIMARY**）、命令与输出、没查到 / 互相矛盾的地方、开放问题。多路并行时，`notes.md` 是索引：每路一行答案，加上“资料中被修正的地方”。
   - `ledger.md`：论断台账，格式见 research-agent.md。
3. **收齐产出**（agent 完成后由你做，先于自检）：
   - 先确认文件真的在 `$DIR/research/` 里（`ls $DIR/research`）。后台 agent 的写入可能落在子 agent 的产物目录，或只出现在它的回复里：按它回复里给的路径找到文件，复制到 `$DIR/research/notes-<lane>.md`。
   - 多路并行时，把各路的台账行**合并进 `ledger.md` 的同一张表**。`rh check` 只读 `ledger.md` 里第一张“论断 / 证据 / 类型”表，第二张表里的行不会被检查。合并时保留各路前缀，并在表上方写明：前缀对应哪个分册，证据里的 `[n]` 指该分册“来源”一节的第 n 条。
4. **自检**：
   - 运行 `pnpm rh check --no-shot`，看 `<slug>` 的警告：此时允许出现“缺少 explainer.md / index.html”“title / summary 还是 TODO”这类完整性提示，**但不应有“论断台账”开头的问题**。
   - 抽查 3–5 条 observed 论断：证据能打开、确实支持论断。不支持的降级或删掉。
5. **把关 ②**：给用户一份简短的调研汇报——
   - 每个研究问题的答案（一两句）
   - 台账统计：observed / inferred / speculative 各多少条，列出全部 speculative
   - 关键来源（PRIMARY 优先）、互相矛盾的地方、开放问题
   - 你打算怎么组织页面（面板清单草案）

   问“调研结果是否可以，进入写稿？”。**停下等待。** 用户要求补查时，回到第 1 步，只补缺的部分。

## 4. 写 explainer → 渲染 → 检查 → 把关 ③：审阅页面

1. **读 am 文档**（在 `am_docs` 目录）：`SKILL.md` 第 3–5 节、`references/research.md`（研究页工作流与骨架）、`references/writing.md`（STE）、需要画图时读 `references/diagrams.md`。写稿规则见 [references/explainer.md](references/explainer.md)。
2. **写 `$DIR/explainer.md`**：`template: research`，用户的语言，标题写主题、副标题写结论。台账里的论断才能上页面；finding 的 `证据:` 用 `[observed]` / `[inferred]` / `[speculative]` 标注，和台账类型一致。写完把每条论断出现的位置（如 `F1`、`J`）填进台账的“页面”列。
3. **渲染**：

   ```sh
   pnpm rh render <slug>
   ```

   - `✗ L<行号> …`：按行号改 explainer.md，再渲染。
   - “图形没有烘焙进页面”：检查本机 Chrome / Node 22+，不要发布未烘焙的页面。
   - STE 警告：按建议改写，最多再渲染 2 轮；仍有警告就保留，并在 ③ 里说明。
4. **检查**：

   ```sh
   pnpm rh check <slug>
   ```

   显式给出 slug 时按发布标准检查（schema、标签、台账、HTML、手机 390×844）。不通过就改稿件重来；问题在 answer-me-with-html 模板时，告诉用户并停下，不要在报告里打补丁。
5. **自己先看一遍**：
   - 手机整页：用 Read 工具查看 `shots` 目录（`.rh/shots/<slug>/`）里的分段截图。
   - 每张图：运行 `pnpm figshot <slug>`（桌面 1280 宽）和 `pnpm figshot <slug> --width 390`（手机），逐张看 `.rh/figs/<slug>/w<宽>/fig-N.png`；加 `--panels A,L` 可以单独截面板（例如宽表格）。不用 `am shot`：它先截整页，长页面上可能卡住。
   - 重叠、截断、空图、文字过小、文字墙都要先改掉。手机上图在图框内横向滚动是允许的；但图过宽时（例如 `flowchart LR` 节点超过约 8 个），改成 `TB` 布局。
6. **把关 ③**：告诉用户——
   - 页面路径 `$DIR/index.html`（可以直接用浏览器打开）和手机截图路径
   - 三条阅读路径各看哪些面板；每张图一句话说明
   - 删掉或标为 speculative 的内容、遗留的 STE 警告、开放问题
   - 发布后的地址：`pnpm rh paths <slug>` 的 `url`（public → `/r/<slug>/`，private → 私有站点 `/p/<slug>/`）

   问“页面是否可以发布？”。**停下等待。** 用户提修改意见：改 explainer.md（需要新证据时先补台账）→ 第 3–5 步 → 再问。

## 5. 发布（只在 ③ 明确批准之后）

1. 发布前确认：当前分支是 `main`；`git log origin/main..HEAD` 为空（否则 push 会顺带推走别的提交，先问用户）；工作区里与本报告无关的改动不用管，`rh publish` 只提交报告目录和 `tags.yml`。
2. 执行：

   ```sh
   pnpm rh publish <slug>             # 可加 --note "<changelog 说明>"
   ```

   它依次执行：严格检查与手机检查 → 改写 meta（published）→ 本地构建与泄漏检查 → `git add` / `git commit` → push。失败时按停下的阶段处理，不要凭感觉重跑：
   - **检查未通过**（输出“检查未通过，未发布”）：meta 没改。修复后重跑 `rh publish`。
   - **构建或泄漏检查失败**：meta 已自动还原。修复后重跑 `rh publish`。
   - **git 阶段失败**（`git add` / `git commit` 报错，例如 index.lock、hook 拒绝）：meta 已是 published 但没有提交，**不要重跑 `rh publish`**（会再追加一条 changelog）。用 `git status`、`git diff -- $DIR/meta.yml` 看清状态，把输出给用户，由用户决定还原还是手动提交。
   - **已提交、push 失败**（输出里有“已提交”）：**不要重跑 `rh publish`**。处理原因（网络、需要先 `git pull --rebase`）后只运行 `git push origin main`。
3. 跟进部署：`gh run list --workflow=deploy.yml -L 1` 找到本次运行，`gh run watch <id> --exit-status` 等它结束。成功后给用户报告地址；失败就看日志（`gh run view <id> --log-failed`）并报告原因，不要自行改 CI。
4. 用户若在 vault 的 brief 里有待办勾选，提醒他自己更新；不要改 vault 的其他内容。

## 6. 路径 D：导入在别处完成的报告

```sh
pnpm rh import report --html <页面.html> --slug <slug> --domain <domain> --source-repo <仓库路径或 URL> --title "<标题>" --summary "<一句话>" [--tags a,b] [--visibility public]
# am 稿件则用 --explainer <稿件.md>（会自动渲染）；原稿 --source <md>；本地资源 --assets <dir>
```

导入报告（`kind: imported`）不需要 brief 和台账，所以没有 ① ②；但同样要过 `pnpm rh check <slug>`（含手机检查），之后进入把关 ③ 和 §5。visibility 没指定就用默认的 private；slug 按标题拟定；domain、来源仓库等必需信息确实无法从上下文判断时，合并成一个问题问一次。

检查不过时（同一 slug 不能再次 `rh import report`，它会报 slug 已被使用）：
- am 稿件导入的：修改 `$DIR/explainer.md`（或在源头改好后复制过来），再 `pnpm rh render <slug>`（报告已发布时用 `pnpm rh render <slug> --force`）、`pnpm rh check <slug>`。
- HTML 导入的：在原仓库修好构建脚本或 am 源头，重新生成 HTML，覆盖 `$DIR/index.html`，再 `pnpm rh check <slug>`。不要为此删掉报告目录重建。
- 已发布的导入报告要更新时也这样做，然后经 ③ 用 `pnpm rh publish <slug> --note "<这次改了什么>"` 发布。

## 7. 路径 E：就地更新已发布的报告

同样是三个把关点，只是内容换成“这次改什么”：

1. **①**：和用户确认更新范围（要补查的问题、要改的面板）；需要时按 §2 第 5 步同步更新 brief。**停下等待。**
2. **②**（有新调研时）：按 §3 调研、补台账、自检，然后汇报**新增和改动的**论断，**停下等待**。只改文字或排版、不引入新论断时，跳过 ②，并在 ① 里说明。
3. 改 explainer.md 后，已发布的报告必须加 `--force`：`pnpm rh render <slug> --force`（会更新 `updated` 并追加 changelog）。
4. `pnpm rh check <slug>` → **③** → `pnpm rh publish <slug> --note "<这次改了什么>"`。导入报告的更新见 §6。
4. 要拆成新专题时新开 topic（走路径 A），并在 meta 的 `related` / `series` 里互相关联。

## 8. 常见失败

| 现象 | 处理 |
|---|---|
| `rh new`：标签没有登记 | ① 里漏了这个标签。不要自行登记：换成已确认的标签，或回到 ① 问用户 |
| `rh new`：找不到 brief | 确认 vault 路径与文件名；也可以直接给 `.md` 的绝对路径（meta 会记录绝对路径并警告） |
| `rh new`：slug 已被使用 | 这是同一个 topic：走路径 E 就地更新，不要新建 |
| `rh check`：论断台账问题 | 按行号补证据或改类型；表格必须有“论断 / 证据 / 类型”三列 |
| `rh check`：手机检查失败 | 看 `.rh/shots/<slug>/`；改稿件（宽表格拆列、长代码换行、减少 span）；模板问题报告给用户 |
| `rh publish`：泄漏检查失败 | public 内容提到了 private 报告的标题或路径；改掉引用，不要绕过检查 |

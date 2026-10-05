# 写 explainer.md 的规则（research-hub 部分）

通用写法以 answer-me-with-html 的文档为准（`pnpm rh paths` 的 `am_docs` 目录）：`references/research.md` 的 8 步工作流、页面骨架和检查清单；`references/writing.md` 的 STE 规则；`references/diagrams.md` 的选图方法。下面只写 research-hub 额外的要求。

## 文件与渲染

- 稿件固定是 `$DIR/explainer.md`，页面固定是 `$DIR/index.html`。不要用 `am render -o` 输出到别处，统一用 `pnpm rh render <slug>`，它会记录 `am_version`。
- 研究页 frontmatter 用 `template: research`。`title` 写主题，`subtitle` 写一句结论。页头元信息里写 `audience`（来自 brief 的“读者”）、`scope`、`evidence`、`date`。
- meta 的 `title` / `summary` 是首页卡片上的文字。还是 `TODO` 时，写稿后按页面标题和副标题改掉（`rh check` 会拦下 TODO）。

## 台账 → 页面

- 页面上的每个论断（导语、总览数字、finding、“对我们的意义”里的事实前提）都要对应台账里的一行。写稿时发现新论断，先补台账，再写进页面。
- finding 的 `证据:` 按台账类型标 `[observed]` / `[inferred]` / `[speculative]`，可以在后面写参考资料编号 `[3]`。
- speculative 的内容只能出现在：标了 `[speculative]` 的证据、“局限与开放问题”面板、或明确写“推测”的句子里。不要把它写进总览或导语的结论。
- 写完把每条论断的页面位置（`F1`、`J`、`总览 D` 等）填进台账的“页面”列。台账里没被引用的行可以保留，它们是调研记录。
- “参考资料”面板列出页面实际引用的来源，一手来源标 **PRIMARY**，编号与 `[n]` 一致。

## brief → 页面

- brief 的每个研究问题，页面上都要有回答：一个 finding、一个面板，或在“局限与开放问题”里写明没回答以及原因。
- brief 的“不包括”就是页面的“范围与非目标”。不要写超出范围的结论。
- 路径 B（资料驱动）：页面的“方法与证据”写明主要依据是用户提供的资料，并列出补查过的一手来源。

## 手机

- 读者主要在手机上看。宽表格不超过 4–5 列，长代码行手动换行，面板 `span` 只用来强调信息密度。
- `pnpm rh check <slug>` 的手机检查（390×844）要求：无横向溢出、正文宽度 ≥ 300px、正文字号 ≥ 14px、没有 fixed 元素长期压住正文。不过就改稿件；模板本身的问题报告给用户，不要在页面里打 CSS 补丁。

## 交给用户审阅前的自查

- [ ] `pnpm rh render <slug>` 没有 `✗`，图已烘焙；STE 警告已改到只剩有理由保留的。
- [ ] `pnpm rh check <slug>` 通过。
- [ ] 截图（`.rh/shots/<slug>/`）和每张 `fig-N.png` 都看过。
- [ ] brief 的每个研究问题都有回答或说明。
- [ ] 台账“页面”列已填；页面上没有台账之外的论断；speculative 都标出来了。

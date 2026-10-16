/**
 * 端到端：在临时仓库副本里跑 rh 的完整链路（new / tags / import / check / render / build / publish）。
 * 覆盖验收 2（私有内容不进公开产物）与验收 3（draft 不进任何产物）。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { stringify } from "yaml";
import { findChrome } from "../cli/lib/mobile.ts";
import { loadConfig } from "../lib/config.ts";

const REPO = join(import.meta.dirname, "..");
const TODAY = "2026-10-05";
let tmp: string;

const rh = (...args: string[]) => {
  const r = spawnSync(process.execPath, [join(tmp, "cli", "rh.ts"), ...args], {
    cwd: tmp,
    encoding: "utf8",
    env: { ...process.env, RH_ROOT: tmp, RH_TODAY: TODAY, NO_COLOR: "1" },
    timeout: 180_000,
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

const goodHtml = readFileSync(join(REPO, "test", "fixtures", "mobile", "good.html"), "utf8");
const ledger = "| # | 论断 | 证据 | 类型 |\n|---|---|---|---|\n| C1 | 测试论断 | https://example.com | observed |\n";

function writeReport(slug: string, meta: Record<string, unknown>, files: Record<string, string> = {}) {
  const created = String(meta.created ?? TODAY);
  const dir = join(tmp, "reports", created.slice(0, 4), created.slice(5, 7), slug);
  mkdirSync(dir, { recursive: true });
  const full = {
    title: `标题 ${slug}`,
    summary: `摘要 ${slug}`,
    created,
    updated: created,
    domain: "crypto",
    tags: [],
    status: "published",
    visibility: "public",
    kind: "imported",
    source_repo: "https://example.com/repo",
    changelog: [{ date: created, note: "导入" }],
    ...meta,
  };
  writeFileSync(join(dir, "meta.yml"), stringify(full));
  for (const [name, text] of Object.entries({ "index.html": goodHtml, ...files })) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}

function* walk(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}
const grepDir = (dir: string, needle: string) => [...walk(dir)].filter((f) => readFileSync(f, "utf8").includes(needle));

before(() => {
  tmp = mkdtempSync(join(tmpdir(), "rh-e2e-"));
  for (const p of ["package.json", "astro.config.mjs", "tsconfig.json", "src", "lib", "cli", "public", "worker"]) {
    cpSync(join(REPO, p), join(tmp, p), { recursive: true });
  }
  symlinkSync(join(REPO, "node_modules"), join(tmp, "node_modules"));
  const cfg = JSON.parse(readFileSync(join(REPO, "rh.config.json"), "utf8"));
  writeFileSync(join(tmp, "rh.config.json"), JSON.stringify({ ...cfg, vaultDir: join(tmp, "vault") }, null, 2));
  writeFileSync(join(tmp, "tags.yml"), "tags: {}\n");
  mkdirSync(join(tmp, "vault", "Research Briefs"), { recursive: true });
  writeFileSync(
    join(tmp, "vault", "Research Briefs", "Meme Launchpad.md"),
    "---\ndomain: crypto\ntags: [meme]\nvisibility: public\n---\n# Meme Launchpad\n\n想法：比较 pump.fun 与其他 launchpad 的机制。\n",
  );
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: tmp });
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init"], { cwd: tmp });
});

after(() => {
  if (tmp && !process.env.RH_KEEP_TMP) rmSync(tmp, { recursive: true, force: true });
});

test("配置：仓库根目录可由 RH_ROOT 指定", () => {
  process.env.RH_ROOT = tmp;
  try {
    assert.equal(loadConfig().vaultDir, join(tmp, "vault"));
    assert.deepEqual(loadConfig().cardAvoidTerms, ["Mantle"], "推特卡片默认避免点名 Mantle");
  } finally {
    delete process.env.RH_ROOT;
  }
});

test("rh new：未登记的标签在非交互环境下被拒绝", () => {
  const r = rh("new", "Meme Launchpad", "--slug", "meme-launchpad");
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /标签“meme”没有登记/);
  assert.equal(existsSync(join(tmp, "reports", "2026", "10", "meme-launchpad")), false);
});

test("rh new：中文文件名必须给 --slug", () => {
  writeFileSync(join(tmp, "vault", "Research Briefs", "中文想法.md"), "---\ndomain: ai\n---\n想法\n");
  const r = rh("new", "中文想法");
  assert.equal(r.code, 1);
  assert.match(r.out, /--slug/);
});

test("rh tags add + rh new：快照 brief、记录 vault 路径、默认 draft", () => {
  assert.equal(rh("tags", "add", "meme", "--label", "Meme").code, 0);
  assert.equal(rh("tags", "add", "meme", "--label", "Meme").code, 1, "重复登记被拒绝");
  assert.equal(rh("tags", "add", "Bad_Tag").code, 1, "非法标签被拒绝");
  const r = rh("new", "Meme Launchpad", "--slug", "meme-launchpad");
  assert.equal(r.code, 0, r.out);
  const dir = join(tmp, "reports", "2026", "10", "meme-launchpad");
  assert.match(readFileSync(join(dir, "brief.md"), "utf8"), /pump\.fun/);
  const meta = readFileSync(join(dir, "meta.yml"), "utf8");
  assert.match(meta, /status: draft/);
  assert.match(meta, /visibility: public/, "brief frontmatter 的 visibility 生效");
  assert.match(meta, /brief_source: Research Briefs\/Meme Launchpad\.md/);
  assert.ok(existsSync(join(dir, "research", "ledger.md")));
  assert.equal(rh("new", "Meme Launchpad", "--slug", "meme-launchpad").code, 1, "slug 重复被拒绝");
});

test("rh check：未完成的 draft 只给警告；显式检查该 slug 时按发布标准报错", () => {
  const all = rh("check", "--no-shot");
  assert.equal(all.code, 0, all.out);
  assert.match(all.out, /meme-launchpad.*警告/);
  const one = rh("check", "meme-launchpad", "--no-shot");
  assert.equal(one.code, 1);
  assert.match(one.out, /台账表格没有任何论断行/);
  assert.match(one.out, /缺少 explainer\.md/);
  assert.match(one.out, /TODO/);
});

test("rh check：schema、目录年月、未登记标签都是错误（draft 也一样）", () => {
  const dir = writeReport("bad-month", { created: "2026-09-30", updated: "2026-09-30", status: "draft" });
  // 挪到错误的月份目录
  const wrong = join(tmp, "reports", "2026", "10", "bad-month");
  cpSync(dir, wrong, { recursive: true });
  rmSync(dir, { recursive: true });
  writeReport("bad-tag", { tags: ["unknown-tag"], status: "draft" });
  const r = rh("check", "--no-shot");
  assert.equal(r.code, 1);
  assert.match(r.out, /与目录年月 2026\/10 不一致/);
  assert.match(r.out, /标签“unknown-tag”没有在 tags\.yml 登记/);
  rmSync(wrong, { recursive: true });
  rmSync(join(tmp, "reports", "2026", "10", "bad-tag"), { recursive: true });
  assert.equal(rh("check", "--no-shot").code, 0);
});

test("rh build：公开 / 私有分发、返回链接、draft 排除、私有内容不进公开产物", () => {
  assert.equal(rh("tags", "add", "secret-topic", "--label", "机密主题").code, 0);
  assert.equal(rh("tags", "add", "dex", "--label", "DEX").code, 0);
  writeReport("pub-a", { title: "公开报告甲", summary: "公开摘要甲", tags: ["dex"], updated: TODAY });
  writeReport("priv-b", { title: "私密报告ZQX", summary: "私密摘要ZQX", visibility: "private", tags: ["secret-topic"], created: "2026-09-12", updated: "2026-09-20" });
  writeReport("draft-c", { title: "草稿标题QQQ", summary: "草稿摘要QQQ", status: "draft" });
  writeReport("draft-d", { title: "私有草稿WWW", summary: "私有草稿摘要WWW", status: "draft", visibility: "private" });

  const r = rh("build");
  assert.equal(r.code, 0, r.out);
  const pub = join(tmp, "dist", "public");
  const priv = join(tmp, "dist", "private");

  // 公开站点
  const a = readFileSync(join(pub, "r", "pub-a", "index.html"), "utf8");
  assert.match(a, /<body[^>]*><nav data-rh-back[^>]*><a href="\/"/, "返回链接注入在 <body> 开头，指向公开首页");
  assert.match(a, /<meta name="robots" content="noindex, nofollow">/);
  const index = readFileSync(join(pub, "index.html"), "utf8");
  assert.match(index, /公开报告甲/);
  assert.match(index, /href="\/r\/pub-a\/"/);
  assert.ok(existsSync(join(pub, "tags", "dex", "index.html")));
  assert.ok(existsSync(join(pub, "2026", "10", "index.html")));
  assert.match(readFileSync(join(pub, "_headers"), "utf8"), /X-Robots-Tag: noindex, nofollow/);
  assert.equal(readFileSync(join(pub, "robots.txt"), "utf8"), "User-agent: *\nDisallow: /\n");

  // 验收 2：公开产物里搜不到私有报告的标题 / 摘要 / 路径 / 专属标签页
  for (const needle of ["私密报告ZQX", "私密摘要ZQX", "/p/priv-b/", "priv-b", "机密主题"]) {
    assert.deepEqual(grepDir(pub, needle), [], `公开产物不应包含“${needle}”`);
  }
  assert.equal(existsSync(join(pub, "p")), false);
  assert.equal(existsSync(join(pub, "tags", "secret-topic")), false);
  assert.equal(existsSync(join(pub, "2026", "09")), false, "只有私有报告的月份不生成公开归档页");

  // 私有站点
  const b = readFileSync(join(priv, "p", "priv-b", "index.html"), "utf8");
  assert.match(b, /<nav data-rh-back[^>]*><a href="\/p\/"/);
  const pindex = readFileSync(join(priv, "p", "index.html"), "utf8");
  assert.match(pindex, /私密报告ZQX/);
  assert.match(pindex, /公开报告甲/);
  const { publicUrl } = JSON.parse(readFileSync(join(tmp, "rh.config.json"), "utf8"));
  assert.ok(pindex.includes(`href="${publicUrl}/r/pub-a/"`), "私有索引里的公开报告链接回公开站点");
  assert.match(readFileSync(join(priv, "_headers"), "utf8"), /Cache-Control: private, no-store/);

  // 验收 3：draft 不出现在任何产物
  for (const needle of ["草稿标题QQQ", "草稿摘要QQQ", "draft-c", "私有草稿WWW", "draft-d", "meme-launchpad"]) {
    assert.deepEqual([...grepDir(pub, needle), ...grepDir(priv, needle)], [], `产物不应包含 draft“${needle}”`);
  }
});

test("rh build：公开内容里提到私有报告时，泄漏检查失败并删除 dist/", () => {
  const dir = join(tmp, "reports", "2026", "10", "pub-a");
  const meta = readFileSync(join(dir, "meta.yml"), "utf8");
  writeFileSync(join(dir, "meta.yml"), meta.replace("summary: 公开摘要甲", "summary: 参见私密报告ZQX"));
  const r = rh("build");
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /含有非公开报告 priv-b 的内容/);
  assert.equal(existsSync(join(tmp, "dist")), false);
  writeFileSync(join(dir, "meta.yml"), meta);
  assert.equal(rh("build").code, 0);
});

test("rh import report --html：建立导入报告（draft、默认 private、记录来源）", () => {
  const html = join(tmp, "ext.html");
  writeFileSync(html, goodHtml.replace("<head>", "<head><title>外部报告</title>"));
  const r = rh("import", "report", "--html", html, "--slug", "ext-report", "--domain", "work", "--summary", "外部导入", "--source-repo", REPO);
  assert.equal(r.code, 0, r.out);
  const meta = readFileSync(join(tmp, "reports", "2026", "10", "ext-report", "meta.yml"), "utf8");
  assert.match(meta, /title: 外部报告/);
  assert.match(meta, /visibility: private/);
  assert.match(meta, /kind: imported/);
  assert.match(meta, /source_repo: .+research-hub/);
});

test("rh import research：带来源工具头的外部调研结果", () => {
  const f = join(tmp, "deep research.md");
  writeFileSync(f, "# 结果\n内容");
  const r = rh("import", "research", "meme-launchpad", f, "--tool", "gemini-deep-research");
  assert.equal(r.code, 0, r.out);
  const t = readFileSync(join(tmp, "reports", "2026", "10", "meme-launchpad", "research", "deep-research.md"), "utf8");
  assert.match(t, /imported_from: gemini-deep-research/);
  assert.match(t, /# 结果/);
});

const amAvailable = existsSync(loadConfig(REPO).amScript);
test("rh render：渲染 explainer.md 并记录 am_version；已发布报告需要 --force", { skip: amAvailable ? false : "没有 answer-me-with-html" }, () => {
  const dir = join(tmp, "reports", "2026", "10", "meme-launchpad");
  writeFileSync(
    join(dir, "explainer.md"),
    "---\ntemplate: sheet\ntitle: Meme Launchpad\n---\n结论先行：这是一个测试页面。\n\n## A 机制\n- 曲线定价。\n- 迁移到 AMM。\n",
  );
  const r = rh("render", "meme-launchpad");
  assert.equal(r.code, 0, r.out);
  assert.ok(existsSync(join(dir, "index.html")));
  assert.match(readFileSync(join(dir, "meta.yml"), "utf8"), /am_version: \S+/);
});

const chrome = findChrome();
test("rh publish：严格检查 → published → 构建 → 只提交报告目录", { skip: chrome && amAvailable ? false : "需要 Chrome 与 answer-me-with-html" }, () => {
  const dir = join(tmp, "reports", "2026", "10", "meme-launchpad");
  // 先不补台账：发布被拒绝，meta 不变
  const blocked = rh("publish", "meme-launchpad", "--no-push");
  assert.equal(blocked.code, 1, blocked.out);
  assert.match(readFileSync(join(dir, "meta.yml"), "utf8"), /status: draft/);

  writeFileSync(join(dir, "research", "ledger.md"), ledger);
  const meta = readFileSync(join(dir, "meta.yml"), "utf8").replace("summary: TODO：一句话摘要", "summary: Launchpad 机制对比");
  writeFileSync(join(dir, "meta.yml"), meta);
  writeFileSync(join(tmp, "unrelated.txt"), "不应被提交");
  const r = rh("publish", "meme-launchpad", "--no-push");
  assert.equal(r.code, 0, r.out);
  const after = readFileSync(join(dir, "meta.yml"), "utf8");
  assert.match(after, /status: published/);
  assert.match(after, /note: 发布/);
  assert.ok(existsSync(join(tmp, ".rh", "shots", "meme-launchpad", "mobile-390.png")), "输出手机截图");
  const files = spawnSync("git", ["show", "--name-only", "--format=%s", "HEAD"], { cwd: tmp, encoding: "utf8" }).stdout;
  assert.match(files, /^publish\(meme-launchpad\): /);
  assert.match(files, /reports\/2026\/10\/meme-launchpad\/meta\.yml/);
  assert.doesNotMatch(files, /unrelated\.txt/);
  assert.doesNotMatch(files, /pub-a/);
  assert.ok(existsSync(join(tmp, "dist", "public", "r", "meme-launchpad", "index.html")));

  // 已发布：rh render 不带 --force 被拒绝
  assert.equal(rh("render", "meme-launchpad").code, 1);
});

test("rh card：card.yml → card.png（只有英文版）；改稿 / 孤立 PNG / 中文 / 超长推文都会被 rh check 拦下；rh build 中英文页共用卡片", { skip: chrome && amAvailable ? false : "需要 Chrome 与 answer-me-with-html" }, () => {
  const dir = writeReport("card-demo", { title: "卡片演示报告", summary: "卡片演示摘要" }, { "index.en.html": goodHtml });
  const card = {
    quote: "https://x.com/someone/status/1",
    title: "Card demo: the result at a glance",
    background: "What a reader needs to know first.",
    context: "What the source tweet just said.",
    figure: {
      caption: "Known on the left, new on the right",
      excalidraw: { nodes: [{ id: "a", label: "Known", col: 0, row: 0, color: "gray" }, { id: "b", label: "New", col: 1, row: 0, color: "green" }], edges: [{ from: "a", to: "b" }] },
    },
    findings: [{ stat: "3×", text: "Finding one, with a **key number**." }, "Finding two."],
    takeaway: "The bottom line.",
    tweet: "Tweet copy: first the background, then how to read the left and right of the figure, then one caveat the image cannot fit.",
  };
  const write = (c: Record<string, unknown>) => writeFileSync(join(dir, "card.yml"), stringify(c));
  assert.equal(rh("card", "card-demo").code, 1, "没有 card.yml 时失败");
  write({ ...card, findings: [card.findings[0]] });
  const invalid = rh("card", "card-demo");
  assert.equal(invalid.code, 1, invalid.out);
  assert.match(invalid.out, /findings/);

  write(card);
  const r = rh("card", "card-demo");
  assert.equal(r.code, 0, r.out);
  assert.ok(existsSync(join(dir, "card.png")));
  assert.ok(!existsSync(join(dir, "card.en.png")), "只有一张英文卡片");
  assert.match(r.out, /推文文案（X 计数 \d+ \/ 1000）/, "用 rh.config.json 的 cardTweetMax");
  assert.equal(rh("check", "card-demo", "--no-shot").code, 0);

  // 改了画进图的内容却没重新渲染：发布标准下是错误；只改推文不算
  write({ ...card, tweet: `${card.tweet} More detail for Premium readers.` });
  assert.equal(rh("check", "card-demo", "--no-shot").code, 0, "推文不画进图片");
  write({ ...card, takeaway: "A changed bottom line." });
  const stale = rh("check", "card-demo", "--no-shot");
  assert.equal(stale.code, 1, stale.out);
  assert.match(stale.out, /card\.png 不是当前 card\.yml（或水印）的渲染结果/);
  write(card);

  // 中文、超长推文是错误；提到 cardAvoidTerms 里的词只给警告
  write({ ...card, context: "源推文说了什么。" });
  assert.match(rh("check", "card-demo", "--no-shot").out, /context: 推特卡片只有英文版/);
  write({ ...card, tweet: "word ".repeat(220) });
  assert.match(rh("check", "card-demo", "--no-shot").out, /tweet：推文太长：X 计数 1099，上限 1000/);
  write({ ...card, context: "Mantle published a roadmap." });
  const warned = rh("check", "card-demo", "--no-shot");
  assert.match(warned.out, /卡片提到了“Mantle”/);
  write(card);

  // 稿件删了、图还在：构建会继续展示无法核对的旧图，所以是错误
  rmSync(join(dir, "card.yml"));
  const orphan = rh("check", "card-demo", "--no-shot");
  assert.equal(orphan.code, 1, orphan.out);
  assert.match(orphan.out, /有 card\.png 但没有 card\.yml/);
  write(card);

  const b = rh("build");
  assert.equal(b.code, 0, b.out);
  const target = join(tmp, "dist", "public", "r", "card-demo");
  assert.ok(existsSync(join(target, "card.png")) && existsSync(join(target, "en", "card.png")));
  const page = readFileSync(join(target, "index.html"), "utf8");
  const pageEn = readFileSync(join(target, "en", "index.html"), "utf8");
  assert.match(page, /data-rh-card-btn/);
  assert.match(page, /<img data-rh-card-img src="card\.png"/);
  assert.match(page, /data-rh-lang-to="en"/);
  for (const p of [page, pageEn]) assert.match(p, /<p data-rh-card-tweet-text>Tweet copy: first the background/, "中英文页显示同一段英文文案");
  assert.match(page, />复制文案</, "按钮跟随页面语言");
  assert.match(pageEn, />Copy text</);
  assert.match(page, /x\.com\/someone\/status\/1/);
  rmSync(dir, { recursive: true, force: true });
});

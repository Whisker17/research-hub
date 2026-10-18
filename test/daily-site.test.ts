/**
 * 公开 Daily 页面（WHI-1936，ADR 0004 §10）：在临时仓库副本里跑真实的 rh build。
 *  - 没有 daily/ 时构建成功，/daily/ 是诚实的空状态，导航不会指向 404；
 *  - 四种状态的夹具（test/fixtures/daily-site/daily：complete / degraded / empty / pending + state.yml）。夹具是用 rh daily import
 *    从 WHI-1925 的真实样本和 WHI-1929 的候选导入的（manifest 的内部字段换成可识别的 SITEFIXTURE 值），complete 那天的
 *    一个 topic 改成了 HTML 注入的标题 / note，并加了一条带 & 的 extra 引用；本文件先用 rh daily check 确认它们仍然合法；
 *  - 负向泄漏测试：公开产物里没有私有报告的标题 / slug、state.yml 的内容、manifest 的内部字段、原始条目；
 *    并证明守卫真的在起作用：页面被改成输出内部数据时构建失败，去掉 Daily 指纹后同样的泄漏就会被发布；
 *  - 转义与 URL 协议：HTML 注入的标题按文字显示；javascript: / data: 链接让构建失败，页面里只有 http(s) 链接；
 *  - 浏览器：390 / 1440 × 明暗 × 中英文没有横向溢出；复制 topic ID。设置 RH_DAILY_SHOTS=<目录> 时保存截图。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { after, before, test } from "node:test";
import { stringify } from "yaml";
import { dailyPublicForbidden } from "../cli/lib/build.ts";
import { findChrome, launchBrowser } from "../cli/lib/mobile.ts";
import { loadDaily } from "../lib/daily.ts";
import { loadReports } from "../lib/reports.ts";
import { safeHref } from "../src/daily.ts";
import { t } from "../src/i18n.ts";

const REPO = join(import.meta.dirname, "..");
const FIXTURE = join(REPO, "test", "fixtures", "daily-site", "daily");
const PRIVATE_TITLE = "私密报告SECRETQ";
const RAW_EXCERPT = "RAWEXCERPT 原始条目正文不能进任何产物";
let tmp: string;
let emptyPublic: string;

const rh = (...args: string[]) => {
  const r = spawnSync(process.execPath, [join(tmp, "cli", "rh.ts"), ...args], { cwd: tmp, encoding: "utf8", env: { ...process.env, RH_ROOT: tmp, NO_COLOR: "1" }, timeout: 180_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

function* walk(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}
const grepDir = (dir: string, needle: string) => [...walk(dir)].filter((f) => readFileSync(f).toString("utf8").includes(needle));
const pub = () => join(tmp, "dist", "public");
const page = (rel: string) => readFileSync(join(pub(), rel), "utf8");

function report(slug: string, meta: Record<string, unknown>) {
  const dir = join(tmp, "reports", "2026", "10", slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "meta.yml"),
    stringify({ summary: "摘要", created: "2026-10-01", updated: "2026-10-01", changelog: [{ date: "2026-10-01", note: "导入" }], domain: "crypto", status: "published", kind: "imported", source_repo: "https://example.com/r", ...meta }),
  );
  writeFileSync(join(dir, "index.html"), readFileSync(join(REPO, "test", "fixtures", "mobile", "good.html"), "utf8"));
}

before(() => {
  tmp = mkdtempSync(join(tmpdir(), "rh-daily-site-"));
  for (const p of ["package.json", "astro.config.mjs", "tsconfig.json", "rh.config.json", "src", "lib", "cli", "public", "worker"]) cpSync(join(REPO, p), join(tmp, p), { recursive: true });
  symlinkSync(join(REPO, "node_modules"), join(tmp, "node_modules"));
  writeFileSync(join(tmp, "tags.yml"), stringify({ tags: { ethereum: { label: "Ethereum", description: "以太坊" }, "secret-tag": { label: "Secret", description: "只用于私有报告的标签说明ZZZ" } } }));
  report("glamsterdam-overview", { title: "Glamsterdam 公开概览", tags: ["ethereum"], visibility: "public" });
  report("secret-report", { title: PRIVATE_TITLE, tags: ["secret-tag"], visibility: "private" });
  // ingest 的原始条目（含摘录）只在 .rh/ 和 Actions artifact 里：不能进任何产物（ADR 0004 §6）
  mkdirSync(join(tmp, ".rh", "daily"), { recursive: true });
  writeFileSync(join(tmp, ".rh", "daily", "items.jsonl"), `${JSON.stringify({ id: "odaily:1", excerpt: RAW_EXCERPT })}\n`);
});

after(() => {
  if (process.env.RH_KEEP_TMP) return;
  for (const d of [tmp, emptyPublic]) if (d) rmSync(d, { recursive: true, force: true });
});

test("没有 daily/：构建成功，/daily/ 显示空状态和固定声明，导航里的 Daily 链接指向存在的页面", () => {
  assert.equal(existsSync(join(tmp, "daily")), false);
  const r = rh("build");
  assert.equal(r.code, 0, r.out);
  const html = page("daily/index.html");
  assert.ok(html.includes(t("zh", "dailyEmpty")), "空状态");
  assert.ok(html.includes(t("zh", "dailyDisclaimer")), "固定声明");
  assert.deepEqual(readdirSync(join(pub(), "daily")), ["index.html"], "没有日期页");
  // 公开站点的每一页都有 Daily 导航，并且目标存在
  for (const f of [...walk(pub())].filter((f) => f.endsWith(".html") && !f.includes(`${join(pub(), "r")}/`) && !f.endsWith("404.html"))) {
    assert.ok(readFileSync(f, "utf8").includes('href="/daily/"'), `${f} 没有 Daily 导航`);
  }
  assert.ok(!existsSync(join(tmp, "dist", "private", "daily")), "Daily 只进公开站点");
  emptyPublic = mkdtempSync(join(tmpdir(), "rh-daily-empty-"));
  cpSync(pub(), emptyPublic, { recursive: true });
});

test("四种状态的夹具：rh daily check 通过，构建出 /daily/ 与每一天的页面，只显示公开投影", () => {
  cpSync(FIXTURE, join(tmp, "daily"), { recursive: true });
  const c = rh("daily", "check");
  assert.equal(c.code, 0, c.out);
  const r = rh("build");
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(readdirSync(join(pub(), "daily")).sort(), ["2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "index.html"]);

  // /daily/：最新一天（pending）在前，下面是全部日期
  const index = page("daily/index.html");
  assert.ok(index.indexOf("2026-10-19") < index.indexOf("2026-10-18"));
  for (const d of ["2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19"]) assert.ok(index.includes(`href="/daily/${d}/"`), d);
  assert.match(index, /aria-current="page"><span data-i18n="navDaily"/, "导航标出当前栏目");

  const complete = page("daily/2026-10-18/index.html");
  assert.ok(complete.includes(t("zh", "stComplete")));
  assert.ok(complete.includes(t("zh", "dayTopics", { n: 6 })));
  assert.ok(complete.includes("2026-10-18 04:31 UTC"), "生成时间");
  assert.ok(complete.includes("2026-10-17 00:00 UTC") && complete.includes("2026-10-18 00:00 UTC"), "时间窗");
  assert.ok(complete.includes(t("zh", "dailyDisclaimer")));
  assert.ok(complete.includes('id="2026-10-18-846954"') && complete.includes('data-copy="2026-10-18-846954"'), "topic id 可复制");
  assert.ok(complete.includes('href="/r/glamsterdam-overview/"'), "related 链接到公开报告");
  assert.ok(complete.includes('<a class="tag" href="/tags/ethereum/">Ethereum</a>'), "公开标签链接到标签页");
  assert.ok(complete.includes('<span class="tag tag-proposed">glamsterdam</span>'), "proposed_tags 只是普通 chip");
  assert.ok(complete.includes('href="https://x.com/ralexstokes/status/2111165223780454451"'), "ETHTAO 条目链接到原帖");
  assert.ok(complete.includes("via ETHTAO"), "via 署名");
  assert.ok(complete.includes(">ethresear.ch</span>") && complete.includes(">Magicians</span>"), "来源徽章");

  const degraded = page("daily/2026-10-17/index.html");
  for (const k of ["stDegraded", "stDegradedWhy", "rsDigestNotPosted", "rsFewTopics"] as const) assert.ok(degraded.includes(t("zh", k)), k);
  assert.ok(degraded.includes("当天没有以太坊日报"), "当天的 note");
  const empty = page("daily/2026-10-16/index.html");
  for (const k of ["stEmpty", "stEmptyWhy", "rsDigestFetchFailed", "rsNoItems"] as const) assert.ok(empty.includes(t("zh", k)), k);
  const pending = page("daily/2026-10-19/index.html");
  for (const k of ["stPending", "stPendingWhy", "rsDigestNotPosted", "dayNotGenerated"] as const) assert.ok(pending.includes(t("zh", k)), k);

  // 私有索引：Daily 入口（公开站点的绝对地址）与选题命令说明
  const { publicUrl } = JSON.parse(readFileSync(join(tmp, "rh.config.json"), "utf8"));
  const p = readFileSync(join(tmp, "dist", "private", "p", "index.html"), "utf8");
  assert.ok(p.includes(`href="${publicUrl}/daily/"`));
  assert.ok(p.includes("rh topic select &lt;id&gt;") && p.includes("rh topic dismiss") && p.includes("rh topic link"));
});

test("负向泄漏测试：公开产物里没有私有报告的标题 / slug、state.yml 的内容、manifest 的内部字段、原始条目或日志", () => {
  const forbidden = dailyPublicForbidden(loadDaily(tmp), loadReports(tmp).reports).map((f) => f.text);
  const expected = [
    // 私有报告（state.yml 里 linked 到它）
    PRIVATE_TITLE,
    "secret-report",
    "只用于私有报告的标签说明ZZZ",
    // state.yml：dismiss 理由
    "SITEFIXTURE 内部理由：和私有报告重复",
    // manifest 内部字段：run id、generator、源错误、字段名
    "18700000018",
    "18700000016",
    "20261018aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "claude-sonnet-5-5-fixture-18",
    "daily-topics@0.1.0-site-2026-10-17",
    "SITEFIXTURE ethtao internal error detail 18",
    "SITEFIXTURE fxtwitter 503 detail 16",
    "inputs_sha256",
    "skill_version",
    "cited_items",
    "reposted_by",
    "fetched_at",
    // 条目的内部元数据值（fetched_at）与原始条目
    "2026-10-18T12:45:21.148Z",
    RAW_EXCERPT,
  ];
  for (const v of forbidden) assert.deepEqual(grepDir(pub(), v), [], `公开产物含有登记的内部数据“${v}”`);
  for (const v of expected) assert.deepEqual(grepDir(pub(), v), [], `公开产物含有“${v}”`);
  for (const v of ["secret-report", "SITEFIXTURE 内部理由：和私有报告重复", "18700000018"]) assert.ok(forbidden.includes(v), `泄漏指纹里应该有“${v}”`);
  // 原始数据文件不进任何站点
  for (const site of ["public", "private"]) {
    const names = [...walk(join(tmp, "dist", site))].map((f) => f.split("/").pop());
    for (const n of ["manifest.json", "topics.yml", "state.yml", "items.jsonl"]) assert.ok(!names.includes(n), `${site} 里有 ${n}`);
    assert.deepEqual(grepDir(join(tmp, "dist", site), RAW_EXCERPT), []);
  }
  assert.deepEqual(grepDir(pub(), "/p/"), [], "公开产物不链接私有站点");
});

test("守卫生效：页面被改成输出 state.yml 与 manifest 时 rh build 失败并删除 dist/；去掉 Daily 指纹后同样的泄漏会被发布", () => {
  const pagePath = join(tmp, "src", "pages", "daily", "[date].astro");
  const buildLib = join(tmp, "cli", "lib", "build.ts");
  const [origPage, origLib] = [readFileSync(pagePath, "utf8"), readFileSync(buildLib, "utf8")];
  // 模拟一次回归：日期页直接输出 daily/ 的原始文件
  const leaky = origPage
    .replace("---\n/**", '---\nimport { readFileSync as rf } from "node:fs";\n/**')
    .replace("<DailyDay day={day} />", '<DailyDay day={day} /><pre>{rf(`daily/${day.date.replaceAll("-", "/")}/manifest.json`, "utf8")}{rf("daily/state.yml", "utf8")}</pre>');
  assert.notEqual(leaky, origPage);
  try {
    writeFileSync(pagePath, leaky);
    const r = rh("build");
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /含有daily\/state\.yml 2026-10-18-1dc25d 的内部数据的内容/, "dismiss 理由");
    assert.match(r.out, /含有daily\/state\.yml 2026-10-18-846954 的内部数据的内容：“secret-report”/, "linked 到私有报告");
    assert.match(r.out, /含有daily\/2026\/10\/18\/manifest\.json 的内部数据的内容/, "manifest 内部字段的值");
    assert.match(r.out, /含有daily 内部字段名 的内部数据的内容：“inputs_sha256”/, "内部字段名");
    assert.equal(existsSync(join(tmp, "dist")), false, "没有可部署的产物");

    // 关掉守卫一次：同样的页面会把内部数据发布出去——证明拦住它的就是 Daily 指纹
    const off = origLib.replace("return [...dailyForbidden(load), ...linked];", "return [];");
    assert.notEqual(off, origLib);
    writeFileSync(buildLib, off);
    const o = rh("build");
    assert.equal(o.code, 0, o.out);
    assert.notDeepEqual(grepDir(pub(), "SITEFIXTURE 内部理由：和私有报告重复"), []);
    assert.notDeepEqual(grepDir(pub(), "inputs_sha256"), []);
  } finally {
    writeFileSync(pagePath, origPage);
    writeFileSync(buildLib, origLib);
  }
  assert.equal(rh("build").code, 0);
});

test("转义：HTML 注入的标题、英文标题与 note 按文字输出；页面里的链接只有站内路径与 http(s)", () => {
  const html = page("daily/2026-10-18/index.html");
  assert.ok(!html.includes("<script>window.__pwned"), "<script> 没有原样输出");
  assert.ok(!html.includes('<img src=x onerror="window.__pwned=2">'), "<img onerror> 没有原样输出");
  assert.ok(!html.includes('"><svg onload'), "属性里的引号被转义");
  assert.ok(!html.includes('<a href="javascript:'), "note 里的链接没有原样输出");
  assert.ok(html.includes("&lt;script&gt;window.__pwned=1&lt;/script&gt;"));
  assert.ok(html.includes('href="https://example.com/fulcrum?a=1&amp;b=%3C2%3E"'), "extra 链接：canonical 形式，属性转义");
  for (const f of [...walk(join(pub(), "daily"))]) {
    for (const [, href] of readFileSync(f, "utf8").matchAll(/\bhref="([^"]*)"/g)) {
      assert.match(href, /^(\/(?!\/)|https?:\/\/)/, `${f} 有不允许的链接 ${href}`);
    }
  }
});

test("URL 协议：只允许 http(s)；daily/ 里的 javascript: / data: 链接让 rh build 失败", () => {
  for (const bad of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:x", " https://example.com/", "//example.com/", "/r/x/", "", null]) {
    assert.equal(safeHref(bad), undefined, String(bad));
  }
  assert.equal(safeHref("https://example.com/a?b=1"), "https://example.com/a?b=1");
  const file = join(tmp, "daily", "2026", "10", "18", "topics.yml");
  const orig = readFileSync(file, "utf8");
  try {
    for (const [from, to] of [
      ["url: https://x.com/ralexstokes/status/2111165223780454451", "url: javascript:alert(document.domain)"],
      ["extra: https://example.com/fulcrum?a=1&b=%3C2%3E", "extra: data:text/html,<script>alert(1)</script>"],
    ]) {
      assert.ok(orig.includes(from), from);
      writeFileSync(file, orig.replace(from, to));
      rmSync(join(tmp, "dist"), { recursive: true, force: true });
      const r = rh("build");
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, /必须是 http\(s\) URL/);
      assert.match(r.out, /数据校验失败，未构建/);
      assert.equal(existsSync(join(tmp, "dist")), false);
    }
  } finally {
    writeFileSync(file, orig);
  }
  assert.equal(rh("build").code, 0);
});

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };
function serve(root: string): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = join(root, p);
    if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) return res.writeHead(404).end("not found");
    res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, origin: `http://127.0.0.1:${(server.address() as { port: number }).port}` })));
}

test("浏览器：四种状态与空站点在 390 / 1440 × 明暗 × 中英文下没有横向溢出、没有脚本错误；注入不执行；复制 topic ID", { skip: findChrome() ? false : "没有 Chrome" }, async () => {
  const shots = process.env.RH_DAILY_SHOTS;
  if (shots) mkdirSync(shots, { recursive: true });
  const full = await serve(pub());
  const bare = await serve(emptyPublic);
  const browser = await launchBrowser();
  try {
    const pages: [string, string, string][] = [
      ["complete", full.origin, "/daily/2026-10-18/"],
      ["degraded", full.origin, "/daily/2026-10-17/"],
      ["empty", full.origin, "/daily/2026-10-16/"],
      ["pending", full.origin, "/daily/2026-10-19/"],
      ["index", full.origin, "/daily/"],
      ["no-daily", bare.origin, "/daily/"],
    ];
    for (const [name, origin, path] of pages) {
      for (const width of [390, 1440]) {
        for (const theme of ["light", "dark"]) {
          for (const lang of ["zh", "en"]) {
            const p = await browser.newPage();
            const errors: string[] = [];
            p.on("pageerror", (e) => errors.push(String(e)));
            p.on("dialog", (d) => {
              errors.push(`dialog: ${d.message()}`);
              void d.dismiss();
            });
            await p.evaluateOnNewDocument((th: string, l: string) => {
              localStorage.setItem("rh_theme", th);
              localStorage.setItem("rh_lang", l);
            }, theme, lang);
            await p.setViewport({ width, height: 900 });
            await p.goto(`${origin}${path}`);
            await p.evaluate(() => document.fonts.ready);
            const m = await p.evaluate(() => ({
              scroll: document.documentElement.scrollWidth,
              pwned: (window as unknown as { __pwned?: number }).__pwned,
              injected: document.querySelectorAll(".day script, .day img, .day svg").length,
              lang: document.documentElement.lang,
            }));
            const where = `${name} ${width} ${theme} ${lang}`;
            assert.ok(m.scroll <= width, `${where}：横向溢出 ${m.scroll}`);
            assert.equal(m.pwned, undefined, `${where}：注入的脚本执行了`);
            assert.equal(m.injected, 0, `${where}：注入的元素被解析成了 HTML`);
            assert.equal(m.lang, lang === "en" ? "en" : "zh-CN");
            assert.deepEqual(errors, [], where);
            if (name === "complete") {
              const title = await p.$eval('[id="2026-10-18-1da876"] .topic-title', (e) => e.textContent);
              assert.ok(title?.startsWith(lang === "en" ? '"><svg onload=' : "<script>window.__pwned=1</script>"), `${where}：${title}`);
            }
            if (shots) await p.screenshot({ path: join(shots, `${name}-${width}-${theme}-${lang}.png`), fullPage: true });
            await p.close();
          }
        }
      }
    }

    // 复制 topic ID（localhost 是安全上下文，剪贴板可用）
    await browser.defaultBrowserContext().overridePermissions(full.origin, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
    const p = await browser.newPage();
    await p.evaluateOnNewDocument(() => localStorage.setItem("rh_lang", "zh"));
    await p.goto(`${full.origin}/daily/2026-10-18/`);
    await p.click('[data-copy="2026-10-18-846954"]');
    assert.equal(await p.evaluate(() => navigator.clipboard.readText()), "2026-10-18-846954");
    assert.equal(await p.$eval('[data-copy="2026-10-18-846954"]', (e) => e.textContent), t("zh", "topicCopied"));
    await p.close();
  } finally {
    await browser.close();
    full.server.close();
    bare.server.close();
  }
});

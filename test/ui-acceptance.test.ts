/**
 * UI 验收（WHI-1934，ADR 0002、0003）：在临时仓库副本里跑真实的 rh build，把 dist/public 与 dist/private 分别放在
 * 两个本地 HTTP 源上（和线上两个 Worker 一样），用 Chrome 打开。
 *
 *  - 每个路由 × 390 / 1440 × 明暗 × 中英文：没有脚本错误、没有失败的请求（字体、图片、缩略图都真的加载了）、没有横向溢出、
 *    没有加载失败的字体；首页 / 私有索引的“无结果”、空站点的“空列表”与 Daily 空状态；
 *  - 报告外壳（am 页面与普通导入页面、中英文、没有英文版的报告）：返回链接在文档流里、没被遮住、指向本站索引；
 *    语言切换只显示一份，切换时保留锚点，写入索引页也在读的 localStorage.rh_lang；卡片模式；锚点；
 *  - 标签名（WHI-1943）：英文模式用 tags.yml 的 label_en，缺失时回退 label；中文模式与没有脚本时是 label；
 *  - 两站所有页面里的站内链接与资源经 HTTP 请求都是 200；
 *  - 报告 HTML 除注入的 data-rh-* 外壳之外与源文件逐字相同（夹具与仓库里的真实报告都查）。
 *
 * 设置 RH_UI_SHOTS=<目录> 时保存截图（WHI-1934 的评审截图在 .rh/shots/whi-1934/）。
 * 设置 RH_UI_REAL=1 时，另外对仓库自己的 dist/private（先运行 node cli/rh.ts build）里的每篇真实报告跑外壳检查。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, relative } from "node:path";
import { after, before, test } from "node:test";
import type { Browser, Page } from "puppeteer-core";
import { stringify } from "yaml";
import { deployedReportHtml } from "../cli/lib/build.ts";
import { findChrome, launchBrowser } from "../cli/lib/mobile.ts";
import { REPORT_FILES, isPublished, loadReports } from "../lib/reports.ts";
import { t } from "../src/i18n.ts";

const REPO = join(import.meta.dirname, "..");
const FIX = join(REPO, "test", "fixtures");
const SHOTS = process.env.RH_UI_SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const noChrome = findChrome() ? false : "没有 Chrome";

function* walk(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".txt": "text/plain" };
/**
 * 一个站点一个源；root 在构建之后才知道（publicUrl 要先有端口），所以按调用时的值取。
 * 私有站点和线上的 Worker 一样把 / 重定向到 /p/（worker/private.ts），并有一个没有评论的 /api/comments（评论层的流程在
 * comments-layer.test.ts 里对着完整的假 API 测）。
 */
function serve(root: () => string, privateSite = false): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    if (privateSite && p === "/") return res.writeHead(302, { location: "/p/" }).end();
    if (privateSite && p === "/api/comments") return res.writeHead(200, { "content-type": "application/json" }).end('{"threads":[],"next":null}');
    if (p.endsWith("/")) p += "index.html";
    const base = root();
    const f = join(base, p);
    if (!f.startsWith(base) || !existsSync(f) || statSync(f).isDirectory()) return res.writeHead(404).end("not found");
    res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" }).end(req.method === "HEAD" ? undefined : readFileSync(f));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, origin: `http://127.0.0.1:${(server.address() as { port: number }).port}` })));
}

/** 去掉 decorateReport 注入的外壳；剩下的必须与报告源文件逐字相同。 */
function stripShell(deployed: string, source: string): string {
  let out = deployed
    .replace(/<style data-rh-style>[^<]*<\/style>/, "")
    .replace(/<script data-rh-script>[\s\S]*?<\/script>/, "")
    .replace(/<nav data-rh-back[\s\S]*?<\/nav>/, "")
    .replace(/<section data-rh-card [\s\S]*?<\/section>/, "")
    .replace(/<span data-rh-lang [^>]*>(?:<(?:span|a)\b[^>]*>[^<]*<\/(?:span|a)>){2}<\/span>/g, "")
    .replace(/<button class="am-btn" type="button" data-rh-card-btn [^>]*>[^<]*<\/button>/, "")
    .replace(/<script data-rh-comments [\s\S]*?<\/script>/, "")
    .replace(/<button type="button" data-rh-comments-btn [^>]*>[\s\S]*?<\/button>/g, "");
  if (!/<meta[^>]+name=["']robots["']/i.test(source)) out = out.replace(/(<head\b[^>]*>)<meta name="robots" content="noindex, nofollow">/i, "$1");
  return out;
}

// ── 夹具 ──────────────────────────────────────────────────────────────────────

let tmp: string;
let empty: string;
let pubSite: { server: Server; origin: string };
let privSite: { server: Server; origin: string };
let emptySite: { server: Server; origin: string };

const rh = (root: string, ...args: string[]) => {
  const r = spawnSync(process.execPath, [join(root, "cli", "rh.ts"), ...args], { cwd: root, encoding: "utf8", env: { ...process.env, RH_ROOT: root, NO_COLOR: "1" }, timeout: 180_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

function repoCopy(prefix: string, publicUrl: string, privateUrl: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  for (const p of ["package.json", "astro.config.mjs", "tsconfig.json", "src", "lib", "cli", "public", "worker"]) cpSync(join(REPO, p), join(dir, p), { recursive: true });
  symlinkSync(join(REPO, "node_modules"), join(dir, "node_modules"));
  const cfg = JSON.parse(readFileSync(join(REPO, "rh.config.json"), "utf8"));
  writeFileSync(join(dir, "rh.config.json"), JSON.stringify({ ...cfg, publicUrl, privateUrl }, null, 2));
  // 标签名：dex 没有 label_en（英文模式回退 label），其余中英文不同（WHI-1943）
  writeFileSync(
    join(dir, "tags.yml"),
    stringify({
      tags: {
        dex: { label: "DEX", description: "去中心化交易所。", description_en: "Decentralized exchanges." },
        amm: { label: "自动做市商", label_en: "AMM" },
        ethereum: { label: "以太坊", label_en: "Ethereum" },
        "secret-tag": { label: "私密标签", label_en: "Secret tag SECRETEN" },
      },
    }),
  );
  return dir;
}

/** html: "am"（类 am 结构）或 "plain"（普通导入页面）；en: 是否有英文版。 */
function report(slug: string, o: { html: "am" | "plain"; en: boolean; card: boolean; meta: Record<string, unknown> }) {
  const created = String(o.meta.created ?? "2026-10-05");
  const dir = join(tmp, "reports", created.slice(0, 4), created.slice(5, 7), slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "meta.yml"),
    stringify({ title: `标题 ${slug}`, summary: `摘要 ${slug}`, created, updated: created, changelog: [{ date: created, note: "导入" }], domain: "crypto", tags: ["dex"], status: "published", visibility: "public", kind: "imported", source_repo: "https://example.com/r", ...o.meta }),
  );
  const src = o.html === "am" ? join(FIX, "report-shell", "am.html") : join(FIX, "mobile", "good.html");
  cpSync(src, join(dir, "index.html"));
  if (o.en) {
    if (o.html === "am") cpSync(join(FIX, "report-shell", "am.en.html"), join(dir, "index.en.html"));
    else writeFileSync(join(dir, "index.en.html"), readFileSync(src, "utf8").replace('<html lang="zh">', '<html lang="en">'));
  }
  if (o.html === "am") cpSync(join(FIX, "report-shell", "assets"), join(dir, "assets"), { recursive: true });
  if (o.card) cpSync(join(FIX, "png", "rgb.png"), join(dir, "card.png"));
}

before(async () => {
  pubSite = await serve(() => join(tmp, "dist", "public"));
  privSite = await serve(() => join(tmp, "dist", "private"), true);
  emptySite = await serve(() => join(empty, "dist", "public"));
  tmp = repoCopy("rh-ui-", pubSite.origin, privSite.origin);
  report("pub-am", { html: "am", en: true, card: true, meta: { title_en: "Public am report", summary_en: "Public am summary", tags: ["dex", "amm"], created: "2026-10-03", updated: "2026-10-09" } });
  report("pub-plain", { html: "plain", en: true, card: true, meta: { title_en: "Public plain report", summary_en: "Public plain summary", created: "2026-09-05" } });
  report("pub-zh-only", { html: "am", en: false, card: false, meta: { tags: ["amm"], created: "2026-10-02" } });
  report("secret-report", { html: "am", en: true, card: true, meta: { title: "私密报告SECRETQ", visibility: "private", tags: ["dex", "secret-tag"], created: "2026-08-10" } });
  report("priv-plain", { html: "plain", en: false, card: false, meta: { visibility: "private", tags: ["secret-tag"], created: "2026-10-06" } });
  // Daily 夹具引用的公开报告（related）与私有报告（state.yml 的 link）
  report("glamsterdam-overview", { html: "plain", en: false, card: false, meta: { tags: ["ethereum"], created: "2026-09-20" } });
  report("draft-x", { html: "am", en: true, card: true, meta: { title: "草稿DRAFTQ", status: "draft", created: "2026-10-07" } });
  cpSync(join(FIX, "daily-site", "daily"), join(tmp, "daily"), { recursive: true });
  const r = rh(tmp, "build");
  assert.equal(r.code, 0, r.out);
  // 空站点：没有报告、没有 Daily
  empty = repoCopy("rh-ui-empty-", emptySite.origin, "https://priv.example.test");
  const e = rh(empty, "build");
  assert.equal(e.code, 0, e.out);
});

after(() => {
  for (const s of [pubSite, privSite, emptySite]) s?.server.close();
  if (process.env.RH_KEEP_TMP) return;
  for (const d of [tmp, empty]) if (d) rmSync(d, { recursive: true, force: true });
});

// ── 报告 HTML 只多了外壳 ────────────────────────────────────────────────────────

test("报告 HTML：去掉注入的 data-rh-* 外壳后与源文件逐字相同（夹具的构建产物含私有站点上的镜像，以及仓库里每篇真实报告的部署版）", () => {
  const { reports } = loadReports(tmp);
  let n = 0;
  for (const r of reports.filter(isPublished)) {
    const sites = [join(tmp, "dist", "private", "p", r.slug), ...(r.meta.visibility === "public" ? [join(tmp, "dist", "public", "r", r.slug)] : [])];
    for (const [built, src] of sites.flatMap((site) => [[join(site, "index.html"), join(r.dir, REPORT_FILES.html)], [join(site, "en", "index.html"), join(r.dir, REPORT_FILES.htmlEn)]])) {
      if (!existsSync(src)) continue;
      const source = readFileSync(src, "utf8");
      const deployed = readFileSync(built, "utf8");
      assert.notEqual(deployed, source, `${r.slug}：没有注入外壳`);
      assert.equal(stripShell(deployed, source), source, `${relative(tmp, built)}`);
      n++;
    }
  }
  assert.equal(n, 15, "9 个报告页 + 6 个公开报告页的镜像");
  // 真实报告（content lane，只读）：部署版去掉外壳 = 源文件
  const real = loadReports(REPO).reports.filter(isPublished);
  for (const r of real) {
    for (const lang of ["zh", "en"] as const) {
      const src = join(r.dir, lang === "zh" ? REPORT_FILES.html : REPORT_FILES.htmlEn);
      if (!existsSync(src)) continue;
      const source = readFileSync(src, "utf8");
      for (const site of ["public", "private"] as const) assert.equal(stripShell(deployedReportHtml(r, lang, site), source), source, `${r.relDir} ${lang} ${site}`);
    }
  }
});

// ── 浏览器 ──────────────────────────────────────────────────────────────────────

interface Opened {
  page: Page;
  errors: string[];
}

/** 新页面：记录脚本错误、失败的请求（任何源）与 ≥ 400 的响应。 */
async function open(browser: Browser, o: { width: number; dark: boolean; lang?: "zh" | "en" }): Promise<Opened> {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror ${String(e)}`));
  page.on("requestfailed", (r) => errors.push(`requestfailed ${r.url()} ${r.failure()?.errorText ?? ""}`));
  page.on("response", (r) => {
    // /favicon.ico 是浏览器自己猜的地址（报告源文件没有声明图标），不是页面引用的资源
    if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) errors.push(`${r.status()} ${r.url()}`);
  });
  await page.evaluateOnNewDocument(
    (dark: boolean, lang: string | null) => {
      try {
        localStorage.setItem("rh_theme", dark ? "dark" : "light");
        if (lang) localStorage.setItem("rh_lang", lang);
      } catch {}
    },
    o.dark,
    o.lang ?? null,
  );
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: o.dark ? "dark" : "light" }]);
  await page.setViewport({ width: o.width, height: 900 });
  return { page, errors };
}

async function goto(o: Opened, url: string) {
  o.errors.length = 0;
  await o.page.goto(url, { waitUntil: "load" });
  await o.page.evaluate(() => document.fonts.ready);
}

/** 页面上的通用测量：横向溢出、加载失败的图片与字体、语言。 */
const measure = (p: Page) =>
  p.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    lang: document.documentElement.lang,
    brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute("loading") !== "lazy").map((i) => i.src),
    fontErrors: [...document.fonts].filter((f) => f.status === "error").map((f) => f.family),
    fonts: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")),
    /** 真的下载了的字体文件 */
    fontFiles: performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.endsWith(".woff2")).map((n) => n.replace(/^.*\/fonts\//, "")),
    emptyShown: [...document.querySelectorAll<HTMLElement>(".empty")].filter((e) => !e.hidden && e.offsetParent !== null).map((e) => e.textContent?.trim()),
  }));

/** 报告外壳的测量：返回链接、语言切换、卡片按钮（只算看得见的）。 */
const shell = (p: Page) =>
  p.evaluate(() => {
    const seen = (e: Element) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
    };
    const nav = document.querySelector<HTMLElement>("[data-rh-back]");
    const a = nav?.querySelector("a");
    let covered: string | null = null;
    if (a) {
      const r = a.getBoundingClientRect();
      for (const x of [r.left + 2, r.left + r.width / 2, r.right - 2]) {
        const hit = document.elementFromPoint(x, r.top + r.height / 2);
        if (hit && !a.contains(hit)) covered = hit.tagName + (typeof hit.className === "string" ? `.${hit.className}` : "");
      }
    }
    return {
      navs: document.querySelectorAll("[data-rh-back]").length,
      position: nav ? getComputedStyle(nav).position : null,
      backHref: a?.getAttribute("href") ?? null,
      backText: a?.textContent ?? null,
      backTop: a ? Math.round(a.getBoundingClientRect().top) : null,
      covered,
      brandFont: a ? getComputedStyle(a.lastElementChild!).fontFamily : null,
      langs: [...document.querySelectorAll("[data-rh-lang]")].filter(seen).length,
      cardBtns: [...document.querySelectorAll("[data-rh-card-btn]")].filter(seen).length,
      cmtBtns: [...document.querySelectorAll("[data-rh-comments-btn]")].filter(seen).length,
      style: Boolean(document.querySelector("style[data-rh-style]")),
    };
  });

interface Route {
  name: string;
  url: () => string;
  /** 页面语言跟着 localStorage（索引页）还是由地址决定（报告） */
  langFromPath?: "zh" | "en";
  /** 报告外壳的期望（comments：私有站点的评论层按钮） */
  report?: { back: string; lang: boolean; card: boolean; style: boolean; comments?: boolean };
  /** 页面上应当显示的空状态文字（i18n 键） */
  empty?: "emptyFilter" | "emptyPublic" | "dailyEmpty";
}

const routes = (): Route[] => {
  const P = pubSite.origin;
  const Q = privSite.origin;
  const E = emptySite.origin;
  const rep = (name: string, url: string, lang: "zh" | "en", r: Route["report"]): Route => ({ name, url: () => url, langFromPath: lang, report: r });
  return [
    { name: "home", url: () => `${P}/` },
    { name: "home-noresults", url: () => `${P}/?q=zzzz-no-match`, empty: "emptyFilter" },
    { name: "tags", url: () => `${P}/tags/` },
    { name: "tag-dex", url: () => `${P}/tags/dex/` },
    { name: "archive", url: () => `${P}/archive/` },
    { name: "month", url: () => `${P}/2026/10/` },
    { name: "daily", url: () => `${P}/daily/` },
    { name: "daily-day", url: () => `${P}/daily/2026-10-18/` },
    { name: "daily-empty-day", url: () => `${P}/daily/2026-10-16/` },
    { name: "404", url: () => `${P}/404.html` },
    { name: "p-index", url: () => `${Q}/p/` },
    { name: "p-noresults", url: () => `${Q}/p/?q=zzzz-no-match`, empty: "emptyFilter" },
    { name: "p-tags", url: () => `${Q}/p/tags/` },
    { name: "p-tag-dex", url: () => `${Q}/p/tags/dex/` },
    { name: "p-archive", url: () => `${Q}/p/archive/` },
    { name: "p-month", url: () => `${Q}/p/2026/10/` },
    { name: "empty-home", url: () => `${E}/`, empty: "emptyPublic" },
    { name: "empty-tags", url: () => `${E}/tags/` },
    { name: "empty-archive", url: () => `${E}/archive/` },
    { name: "empty-daily", url: () => `${E}/daily/`, empty: "dailyEmpty" },
    rep("r-am-zh", `${P}/r/pub-am/`, "zh", { back: "/", lang: true, card: true, style: true }),
    rep("r-am-en", `${P}/r/pub-am/en/`, "en", { back: "/", lang: true, card: true, style: true }),
    rep("r-plain-zh", `${P}/r/pub-plain/`, "zh", { back: "/", lang: true, card: true, style: true }),
    rep("r-plain-en", `${P}/r/pub-plain/en/`, "en", { back: "/", lang: true, card: true, style: true }),
    rep("r-zh-only", `${P}/r/pub-zh-only/`, "zh", { back: "/", lang: false, card: false, style: true }),
    rep("p-am-zh", `${Q}/p/secret-report/`, "zh", { back: "/p/", lang: true, card: true, style: true, comments: true }),
    rep("p-am-en", `${Q}/p/secret-report/en/`, "en", { back: "/p/", lang: true, card: true, style: true, comments: true }),
    rep("p-plain-bare", `${Q}/p/priv-plain/`, "zh", { back: "/p/", lang: false, card: false, style: true, comments: true }),
    // public 报告在私有站点上的镜像（ADR 0005 §1）
    rep("p-mirror-am-zh", `${Q}/p/pub-am/`, "zh", { back: "/p/", lang: true, card: true, style: true, comments: true }),
    rep("p-mirror-plain-en", `${Q}/p/pub-plain/en/`, "en", { back: "/p/", lang: true, card: true, style: true, comments: true }),
  ];
};

test("浏览器：每个路由 × 390 / 1440 × 明暗 × 中英文：没有脚本错误与失败的请求、没有横向溢出、字体真的加载；空状态；报告外壳", { skip: noChrome }, async () => {
  const browser = await launchBrowser();
  let checked = 0;
  try {
    for (const width of [390, 1440]) {
      for (const dark of [false, true]) {
        for (const lang of ["zh", "en"] as const) {
          const o = await open(browser, { width, dark, lang });
          for (const r of routes()) {
            if (r.langFromPath && r.langFromPath !== lang) continue; // 报告的语言由地址决定，只跑一次
            const where = `${r.name} ${width} ${dark ? "dark" : "light"} ${lang}`;
            await goto(o, r.url());
            const m = await measure(o.page);
            assert.deepEqual(o.errors, [], where);
            assert.ok(m.scroll <= width, `${where}：横向溢出 ${m.scroll}`);
            assert.deepEqual(m.brokenImages, [], `${where}：图片没加载`);
            assert.deepEqual(m.fontErrors, [], `${where}：字体加载失败`);
            if (r.report) {
              const s = await shell(o.page);
              assert.equal(s.navs, 1, where);
              assert.notEqual(s.position, "fixed", `${where}：返回条必须在文档流里`);
              assert.equal(s.backHref, r.report.back, where);
              assert.equal(s.backText, "←Research Hub", where);
              assert.equal(s.covered, null, `${where}：返回链接被 ${s.covered} 盖住`);
              assert.ok(s.backTop !== null && s.backTop >= 0 && s.backTop < 140, `${where}：返回链接不在页面顶部（${s.backTop}）`);
              assert.equal(s.langs, r.report.lang ? 1 : 0, `${where}：看得见的语言切换`);
              assert.equal(s.cardBtns, r.report.card ? 1 : 0, `${where}：看得见的卡片按钮`);
              assert.equal(s.cmtBtns, r.report.comments ? 1 : 0, `${where}：看得见的评论按钮`);
              assert.equal(s.style, r.report.style, `${where}：样式块`);
              assert.match(s.brandFont ?? "", /^"?rh-newsreader"?, Georgia/, where);
              // 有样式块时外壳字体（共享的 /fonts/）真的下载并加载了；没有样式块的普通页面不下载任何字体
              if (r.report.style) {
                assert.ok(m.fonts.includes("rh-newsreader") && m.fontFiles.includes("newsreader.woff2"), `${where}：外壳字体 ${[...m.fonts]} ${m.fontFiles}`);
                if (r.report.lang) assert.ok(m.fonts.includes("rh-inter") && m.fontFiles.includes("inter.woff2"), `${where}：外壳 UI 字体`);
              } else assert.deepEqual(m.fontFiles, [], where);
              assert.equal(m.lang.startsWith("zh") ? "zh" : "en", r.langFromPath, where);
            } else {
              assert.equal(m.lang, lang === "en" ? "en" : "zh-CN", where);
              assert.ok(m.fonts.includes("Newsreader") && m.fontFiles.includes("newsreader.woff2"), `${where}：标志字体`);
              assert.ok(m.fonts.includes("Inter") && m.fontFiles.includes("inter.woff2"), `${where}：界面字体`);
              assert.equal(await o.page.evaluate(() => document.documentElement.dataset.theme), dark ? "dark" : "light", where);
            }
            if (r.empty) assert.deepEqual(m.emptyShown, [t(lang === "en" && !r.langFromPath ? "en" : "zh", r.empty)], `${where}：空状态`);
            if (SHOTS) await o.page.screenshot({ path: join(SHOTS, `${r.name}-${width}-${dark ? "dark" : "light"}${r.langFromPath ? "" : `-${lang}`}.png`), fullPage: !r.report });
            checked++;
          }
          await o.page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  assert.equal(checked, 8 * 20 + 4 * 10);
});

test("浏览器：语言切换保留锚点并写入索引页也在读的 rh_lang；锚点；卡片模式；返回链接；复制卡片图片", { skip: noChrome }, async () => {
  const P = pubSite.origin;
  const Q = privSite.origin;
  const browser = await launchBrowser();
  try {
    for (const width of [390, 1440]) {
      const o = await open(browser, { width, dark: false });
      const p = o.page;
      const visible = (sel: string) =>
        p.evaluate((s: string) => {
          const el = [...document.querySelectorAll<HTMLElement>(s)].find((e) => e.getBoundingClientRect().width > 0);
          el?.click();
          return Boolean(el);
        }, sel);
      const where = (s: string) => `${width}px ${s}`;

      // 锚点：面板滚到视口顶部，没被外壳挡住（外壳在文档流里，不是 fixed）
      await goto(o, `${P}/r/pub-am/#findings`);
      const top = await p.evaluate(() => Math.round(document.getElementById("findings")!.getBoundingClientRect().top));
      assert.ok(Math.abs(top) <= 2, where(`锚点位置 ${top}`));

      // 中文 → EN：带上锚点，写入 rh_lang=en；索引页读同一个键，显示英文
      assert.ok(await visible('[data-rh-lang-to="en"]'), where("EN 链接"));
      await p.waitForFunction(() => location.pathname.endsWith("/en/") && document.readyState === "complete");
      assert.equal(await p.evaluate(() => location.pathname + location.hash), "/r/pub-am/en/#findings", where("切到英文"));
      assert.equal(await p.evaluate(() => localStorage.getItem("rh_lang")), "en");
      await goto(o, `${P}/`);
      assert.equal(await p.evaluate(() => document.documentElement.lang), "en", where("索引页读到 rh_lang=en"));
      // 索引页的切换写回 zh；报告页的切换也写同样的值（"zh" / "en"）
      await p.click("[data-rh-lang]");
      assert.equal(await p.evaluate(() => localStorage.getItem("rh_lang")), "zh");
      await goto(o, `${P}/r/pub-am/en/#overview`);
      assert.ok(await visible('[data-rh-lang-to="zh"]'));
      await p.waitForFunction(() => !location.pathname.endsWith("/en/") && document.readyState === "complete");
      assert.equal(await p.evaluate(() => location.pathname + location.hash), "/r/pub-am/#overview", where("切回中文"));
      assert.equal(await p.evaluate(() => localStorage.getItem("rh_lang")), "zh");

      // 卡片模式（am 页面）：正文隐藏、卡片图加载、地址栏 #tweet-card；返回链接仍在；点阅读路径退出
      await goto(o, `${P}/r/pub-am/`);
      assert.ok(await visible("[data-rh-card-btn]"));
      await p.waitForFunction(() => {
        const img = document.querySelector<HTMLImageElement>("[data-rh-card-img]");
        return img && img.complete && img.naturalWidth > 0;
      });
      const card = await p.evaluate(() => ({
        view: document.documentElement.dataset.rhView,
        hash: location.hash,
        overview: getComputedStyle(document.getElementById("overview")!).display,
        section: !document.querySelector<HTMLElement>("[data-rh-card]")!.hidden,
        back: document.querySelector("[data-rh-back] a")!.getBoundingClientRect().height > 0,
      }));
      assert.deepEqual(card, { view: "card", hash: "#tweet-card", overview: "none", section: true, back: true }, where("卡片模式"));
      assert.deepEqual(o.errors, [], where("卡片图请求"));
      if (SHOTS) await p.screenshot({ path: join(SHOTS, `card-am-${width}.png`), fullPage: true });
      await p.click('[data-am-path="deep"]');
      assert.deepEqual(await p.evaluate(() => [document.documentElement.dataset.rhView ?? null, location.hash, getComputedStyle(document.getElementById("overview")!).display]), [null, "", "block"], where("退出卡片模式"));
      // 直接打开 #tweet-card
      await goto(o, `${P}/r/pub-am/en/#tweet-card`);
      assert.equal(await p.evaluate(() => document.documentElement.dataset.rhView), "card", where("#tweet-card 直接进入卡片模式"));

      // 普通导入页面：卡片按钮在返回条里；进入卡片模式时正文隐藏、返回条保留
      await goto(o, `${P}/r/pub-plain/`);
      assert.ok(await visible("[data-rh-card-btn]"));
      assert.deepEqual(
        await p.evaluate(() => [document.documentElement.dataset.rhView, getComputedStyle(document.querySelector("body > h1")!).display, getComputedStyle(document.querySelector("[data-rh-back]")!).display]),
        ["card", "none", "flex"],
        where("普通页面的卡片模式"),
      );
      if (SHOTS) {
        await p.waitForFunction(() => document.querySelector<HTMLImageElement>("[data-rh-card-img]")!.naturalWidth > 0);
        await p.screenshot({ path: join(SHOTS, `card-plain-${width}.png`), fullPage: true });
      }

      // 返回链接：私有报告与公开报告的镜像 → /p/；公开英文报告 → /
      await goto(o, `${Q}/p/secret-report/en/`);
      await Promise.all([p.waitForNavigation({ waitUntil: "networkidle0" }), p.click("[data-rh-back] a")]);
      assert.equal(p.url(), `${Q}/p/`, where("私有报告的返回链接"));
      await goto(o, `${Q}/p/pub-am/en/`);
      await Promise.all([p.waitForNavigation({ waitUntil: "networkidle0" }), p.click("[data-rh-back] a")]);
      assert.equal(p.url(), `${Q}/p/`, where("公开报告镜像的返回链接"));
      await goto(o, `${P}/r/pub-am/en/`);
      await Promise.all([p.waitForNavigation({ waitUntil: "networkidle0" }), p.click("[data-rh-back] a")]);
      assert.equal(p.url(), `${P}/`, where("公开报告的返回链接"));
      await p.close();
    }

    // 复制卡片图片（localhost 是安全上下文）
    await browser.defaultBrowserContext().overridePermissions(P, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
    const o = await open(browser, { width: 1440, dark: false });
    await goto(o, `${P}/r/pub-am/#tweet-card`);
    await o.page.click("[data-rh-card-copy]");
    await o.page.waitForFunction(() => document.querySelector("[data-rh-card-copy]")!.textContent === "已复制 ✓");
    assert.equal(await o.page.evaluate(async () => (await navigator.clipboard.read())[0].types.includes("image/png")), true);
    assert.deepEqual(o.errors, []);
    await o.page.close();
  } finally {
    await browser.close();
  }
});

/** 夹具的标签名：[中文, 英文模式应显示的名字]；secret-tag 只被私有报告用到 */
const TAG_NAMES: Record<string, [string, string]> = { dex: ["DEX", "DEX"], amm: ["自动做市商", "AMM"], ethereum: ["以太坊", "Ethereum"], "secret-tag": ["私密标签", "Secret tag SECRETEN"] };

/** 页面上文字恰好是某个标签名（任一语言）的叶子元素的文字，以及页面标题、已选标签。 */
const tagTexts = (p: Page, names: string[]) =>
  p.evaluate((all: string[]) => {
    const set = new Set(all);
    const leaves = [...document.body.querySelectorAll("*")].filter((e) => e.children.length === 0 && set.has(e.textContent?.trim() ?? "")).map((e) => e.textContent!.trim());
    return { leaves, title: document.title, active: document.querySelector("[data-active]")?.textContent ?? null };
  }, names);

test("浏览器：标签名在英文模式用 label_en（缺失回退 label），中文模式与没有脚本时是 label；两站；私有标签的名字不进公开站点（WHI-1943）", { skip: noChrome }, async () => {
  const P = pubSite.origin;
  const Q = privSite.origin;
  const all = Object.values(TAG_NAMES).flat();
  // [地址, 本页应出现的标签键, 页面标题里的标签, ?tag= 选中的标签]
  const pages: [string, string[], string?, string?][] = [
    [`${P}/`, ["dex", "amm", "ethereum"]],
    [`${P}/?tag=amm`, ["dex", "amm", "ethereum"], undefined, "amm"],
    [`${P}/tags/`, ["dex", "amm", "ethereum"]],
    [`${P}/tags/amm/`, ["amm", "dex"], "amm"],
    [`${P}/tags/dex/`, ["dex", "amm"], "dex"],
    [`${P}/2026/10/`, ["dex", "amm"]],
    [`${P}/daily/2026-10-18/`, ["ethereum"]],
    [`${Q}/p/`, ["dex", "amm", "ethereum", "secret-tag"]],
    [`${Q}/p/?tag=secret-tag`, ["dex", "amm", "ethereum", "secret-tag"], undefined, "secret-tag"],
    [`${Q}/p/tags/`, ["dex", "amm", "ethereum", "secret-tag"]],
    [`${Q}/p/tags/secret-tag/`, ["secret-tag", "dex"], "secret-tag"],
    [`${Q}/p/tags/dex/`, ["dex", "amm", "secret-tag"], "dex"],
  ];
  const browser = await launchBrowser();
  try {
    for (const lang of ["zh", "en"] as const) {
      const i = lang === "zh" ? 0 : 1;
      const o = await open(browser, { width: 1440, dark: false, lang });
      for (const [url, keys, titleTag, active] of pages) {
        const where = `${url} ${lang}`;
        await goto(o, url);
        const m = await tagTexts(o.page, all);
        assert.deepEqual(o.errors, [], where);
        // 每个渲染出来的标签名都是本语言的名字；本页应有的标签都出现了；公开站点没有私有标签
        const want = keys.map((k) => TAG_NAMES[k][i]);
        assert.deepEqual([...new Set(m.leaves)].sort(), [...new Set(want)].sort(), where);
        if (titleTag) assert.equal(m.title, `${t(lang, "tagTitle", { label: TAG_NAMES[titleTag][i] })} · Research Hub`, `${where}：页面标题`);
        if (active) assert.equal(m.active, ` · ${TAG_NAMES[active][i]}`, `${where}：已选标签`);
      }
      await o.page.close();
    }
    // 运行时切换：中文 → 英文，已选标签与所有标签名跟着换
    const o = await open(browser, { width: 390, dark: false, lang: "zh" });
    await goto(o, `${Q}/p/?tag=amm`);
    await o.page.click("[data-rh-lang]");
    const m = await tagTexts(o.page, all);
    assert.deepEqual([[...new Set(m.leaves)].sort(), m.active], [["AMM", "DEX", "Ethereum", "Secret tag SECRETEN"], " · AMM"], "切换到英文");
    await o.page.close();
    // 没有脚本：服务端渲染的是默认语言（中文）
    const nojs = await open(browser, { width: 1440, dark: false });
    await nojs.page.setJavaScriptEnabled(false);
    for (const url of [`${P}/`, `${P}/tags/amm/`, `${Q}/p/tags/`]) {
      await nojs.page.goto(url, { waitUntil: "load" });
      const leaves = (await tagTexts(nojs.page, all)).leaves;
      assert.ok(leaves.length > 0 && leaves.every((l) => Object.values(TAG_NAMES).some(([zh]) => zh === l)), `${url} 没有脚本：${leaves}`);
    }
    await nojs.page.close();
  } finally {
    await browser.close();
  }
});

test("链接：两站每个页面里的站内链接与资源（href / src）经 HTTP 请求都是 200；锚点指向存在的 id", async () => {
  const sites = [
    { root: join(tmp, "dist", "public"), origin: pubSite.origin },
    { root: join(tmp, "dist", "private"), origin: privSite.origin },
    { root: join(empty, "dist", "public"), origin: emptySite.origin },
  ];
  const ours = new Set(sites.map((s) => s.origin));
  const urls = new Set<string>();
  const bad: string[] = [];
  for (const s of sites) {
    for (const f of [...walk(s.root)].filter((f) => f.endsWith(".html"))) {
      const rel = relative(s.root, f).replace(/index\.html$/, "");
      const base = `${s.origin}/${rel}`;
      const html = readFileSync(f, "utf8");
      const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
      for (const m of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
        const raw = m[1].replace(/&amp;/g, "&");
        if (/^(mailto:|javascript:|data:)/.test(raw)) continue;
        const u = new URL(raw, base);
        if (!ours.has(u.origin)) continue;
        // 本页锚点（#tweet-card 是卡片模式的开关，不是元素 id）
        if (u.origin + u.pathname === new URL(base).origin + new URL(base).pathname && u.hash && u.hash !== "#tweet-card" && !ids.has(decodeURIComponent(u.hash.slice(1)))) bad.push(`${relative(tmp, f)} → ${raw}（没有这个 id）`);
        u.hash = "";
        urls.add(u.href);
      }
    }
  }
  for (const u of urls) {
    const r = await fetch(u, { method: "HEAD" }); // 跟随重定向（私有站点的 / → /p/）
    if (r.status !== 200) bad.push(`${r.status} ${u}`);
  }
  assert.deepEqual(bad, []);
  assert.ok(urls.size > 50, `检查了 ${urls.size} 个地址`);
});

test("真实报告（RH_UI_REAL=1，先 node cli/rh.ts build）：dist/private 的每篇报告中英文 × 390 / 1440 × 明暗：外壳检查", { skip: noChrome || (process.env.RH_UI_REAL ? false : "设置 RH_UI_REAL=1 时运行") }, async () => {
  const root = join(REPO, "dist", "private");
  assert.ok(existsSync(join(root, "p", "index.html")), "先运行 node cli/rh.ts build");
  const site = await serve(() => root, true);
  const shots = SHOTS ? join(SHOTS, "real") : null;
  if (shots) mkdirSync(shots, { recursive: true });
  const pages = readdirSync(join(root, "p"))
    .filter((d) => !/^(tags|archive|\d{4})$/.test(d) && existsSync(join(root, "p", d, "index.html")))
    .flatMap((d) => [`/p/${d}/`, ...(existsSync(join(root, "p", d, "en", "index.html")) ? [`/p/${d}/en/`] : [])]);
  const browser = await launchBrowser();
  try {
    for (const width of [390, 1440]) {
      for (const dark of [false, true]) {
        const o = await open(browser, { width, dark });
        for (const path of pages) {
          const where = `${path} ${width} ${dark ? "dark" : "light"}`;
          const slug = path.split("/")[2];
          await goto(o, `${site.origin}${path}`);
          const m = await measure(o.page);
          const s = await shell(o.page);
          assert.deepEqual(o.errors, [], where);
          assert.deepEqual([m.brokenImages, m.fontErrors], [[], []], where);
          assert.deepEqual([s.navs, s.backHref, s.covered], [1, "/p/", null], where);
          assert.notEqual(s.position, "fixed", where);
          assert.equal(s.langs, existsSync(join(root, "p", slug, "en", "index.html")) ? 1 : 0, `${where}：语言切换`);
          assert.equal(s.cardBtns, existsSync(join(root, "p", slug, "card.png")) ? 1 : 0, `${where}：卡片按钮`);
          assert.equal(s.cmtBtns, 1, `${where}：评论按钮`);
          assert.ok(m.fonts.includes("rh-newsreader"), `${where}：外壳字体`);
          if (shots) await o.page.screenshot({ path: join(shots, `${path.replace(/^\/p\/|\/$/g, "").replace(/\//g, "-")}-${width}-${dark ? "dark" : "light"}.png`) });
        }
        await o.page.close();
      }
    }
  } finally {
    await browser.close();
    site.server.close();
  }
});

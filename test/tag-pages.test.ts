/**
 * 标签页与月归档（WHI-1932，ADR 0003 §2、§3、§6）：在临时仓库副本里跑真实的 rh build。
 *  - 混合夹具（public / private / draft）：公开的标签、月份、描述、计数、共现、特色配图只来自 public + published；
 *    只被私有 / draft 报告用到的标签、月份、描述不进公开产物；
 *  - 公开产物的目录（不含 /r/）与改版前（基线 65ae857）相同：已有的公开归档 URL 不变；
 *  - 私有站点的 /p/tags/、/p/tags/<tag>/、/p/archive/、/p/YYYY/MM/：计数与共现与 projectSite("private") 一致；
 *    私有页面的站内导航不指向公开的 /tags/、/archive/、/YYYY/MM/；
 *  - 英文标签名（label_en，WHI-1943）也服从公开规则：私有 / draft 专用标签的英文名不进公开产物；
 *  - 浏览器：390 / 1440 × 明暗 × 中英文没有横向溢出、没有脚本错误。设置 RH_TAG_SHOTS=<目录> 时保存截图。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, relative } from "node:path";
import { after, before, test } from "node:test";
import { stringify } from "yaml";
import { findChrome, launchBrowser } from "../cli/lib/mobile.ts";
import { loadReports, loadTags } from "../lib/reports.ts";
import { projectSite, type SiteView } from "../lib/site-data.ts";

const REPO = join(import.meta.dirname, "..");
const PUBLIC_URL = "https://pub.example.test";
let tmp: string;

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
const pub = () => join(tmp, "dist", "public");
const priv = () => join(tmp, "dist", "private");
const html = (root: string) => [...walk(root)].filter((f) => f.endsWith(".html"));
const grep = (root: string, needle: string) => [...walk(root)].filter((f) => readFileSync(f).toString("utf8").includes(needle)).map((f) => relative(root, f));
/** 产物里的目录（相对路径），不含报告目录 r/ 与 p/<slug>/ */
function dirs(root: string): string[] {
  const out: string[] = [];
  const rec = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (!statSync(p).isDirectory()) continue;
      out.push(relative(root, p));
      rec(p);
    }
  };
  rec(root);
  return out.sort();
}

const card = readFileSync(join(REPO, "test", "fixtures", "png", "rgb.png"));
function report(slug: string, meta: Record<string, unknown>, withCard = false) {
  const created = String(meta.created);
  const dir = join(tmp, "reports", created.slice(0, 4), created.slice(5, 7), slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "meta.yml"),
    stringify({ title: `标题 ${slug}`, summary: `摘要 ${slug}`, updated: created, changelog: [{ date: created, note: "导入" }], domain: "crypto", status: "published", visibility: "public", kind: "imported", source_repo: "https://example.com/r", ...meta }),
  );
  writeFileSync(join(dir, "index.html"), readFileSync(join(REPO, "test", "fixtures", "mobile", "good.html"), "utf8"));
  if (withCard) writeFileSync(join(dir, "card.png"), card);
}

before(() => {
  tmp = mkdtempSync(join(tmpdir(), "rh-tag-pages-"));
  for (const p of ["package.json", "astro.config.mjs", "tsconfig.json", "src", "lib", "cli", "public", "worker"]) cpSync(join(REPO, p), join(tmp, p), { recursive: true });
  symlinkSync(join(REPO, "node_modules"), join(tmp, "node_modules"));
  const cfg = JSON.parse(readFileSync(join(REPO, "rh.config.json"), "utf8"));
  writeFileSync(join(tmp, "rh.config.json"), JSON.stringify({ ...cfg, publicUrl: PUBLIC_URL }, null, 2));
  writeFileSync(
    join(tmp, "tags.yml"),
    stringify({
      tags: {
        dex: { label: "DEX", description: "去中心化交易所：订单簿、AMM 与聚合器。", description_en: "Decentralized exchanges: order books, AMMs and aggregators." },
        amm: { label: "AMM", label_en: "Automated market makers", description: "自动做市商" },
        lending: { label: "Lending" },
        shared: { label: "共享标签", label_en: "Shared tag SHAREDEN", description: "公开与私有报告都用到的标签" },
        "secret-topic": { label: "机密主题TOPIC", label_en: "Secret topic PRIVLABELEN", description: "只给私有报告用的描述PRIVDESC", description_en: "Private-only description PRIVDESCEN" },
        "draft-only": { label: "草稿专用TAG", label_en: "Draft-only DRAFTLABELEN", description: "只被草稿用到的描述DRAFTDESC" },
      },
    }),
  );
  report("pub-a", { title: "公开报告甲", title_en: "Public report A", tags: ["dex", "amm", "shared"], created: "2026-10-03", updated: "2026-10-09" }, true);
  report("pub-b", { title: "公开报告乙", tags: ["dex", "lending"], created: "2026-09-05", updated: "2026-09-06" });
  report("pub-c", { title: "公开报告丙", tags: ["amm"], domain: "ai", created: "2026-10-02", updated: "2026-10-15" });
  // 私有报告：只有它们用到的月份（2026-08、2025-12）、标签（secret-topic）不能出现在公开站点
  report("priv-x", { title: "私密报告PRIVX", visibility: "private", tags: ["dex", "secret-topic", "shared"], domain: "work", created: "2026-08-10", updated: "2026-10-12" }, true);
  report("priv-y", { title: "私密报告PRIVY", visibility: "private", tags: ["secret-topic"], created: "2025-12-01" });
  report("draft-z", { title: "草稿报告DRAFTZ", status: "draft", tags: ["draft-only", "dex"], created: "2026-07-01" }, true);
  const r = rh("build");
  assert.equal(r.code, 0, r.out);
});

after(() => {
  if (tmp && !process.env.RH_KEEP_TMP) rmSync(tmp, { recursive: true, force: true });
});

/** 与真实构建同一份数据算出的投影（测试的参照）。 */
function views(): Record<"public" | "private", SiteView> {
  const { reports } = loadReports(tmp);
  const { tags } = loadTags(tmp);
  return { public: projectSite("public", reports, tags), private: projectSite("private", reports, tags) };
}

/** 改版前（基线 65ae857，同一夹具）公开产物的目录，不含报告目录 r/。 */
const BASE_PUBLIC_DIRS = ["2026", "2026/09", "2026/10", "archive", "daily", "fonts", "tags", "tags/amm", "tags/dex", "tags/lending", "tags/shared"];
/** 改版前公开产物的 HTML 页面（含报告页） */
const BASE_PUBLIC_HTML = ["2026/09/index.html", "2026/10/index.html", "404.html", "archive/index.html", "daily/index.html", "index.html", "r/pub-a/index.html", "r/pub-b/index.html", "r/pub-c/index.html", "tags/amm/index.html", "tags/dex/index.html", "tags/index.html", "tags/lending/index.html", "tags/shared/index.html"];

test("公开产物的目录与页面与改版前相同（已有的公开归档 URL 不变）", () => {
  assert.deepEqual(dirs(pub()).filter((d) => d !== "r" && !d.startsWith("r/")), BASE_PUBLIC_DIRS);
  assert.deepEqual(html(pub()).map((f) => relative(pub(), f)).sort(), BASE_PUBLIC_HTML);
});

/** 页面里的相关标签：[key, count]（TagPage 的 data-related / data-count） */
const related = (page: string) => [...page.matchAll(/data-related="([^"]+)" data-count="(\d+)"/g)].map((m) => [m[1], Number(m[2])]);
const stats = (page: string) => [...page.matchAll(/<dt><span data-i18n="(\w+)"[^>]*>[^<]*<\/span><\/dt>\s*<dd>([^<]*)<\/dd>/g)].map((m) => [m[1], m[2]]);
const featured = (page: string) => page.match(/data-featured="([^"]+)"/)?.[1] ?? null;
const rows = (page: string) => [...page.matchAll(/data-card data-slug="([^"]+)"/g)].map((m) => m[1]);

test("公开标签页与月归档：只来自 public + published；私有 / draft 专用的标签、月份、描述不进公开产物", () => {
  const v = views().public;
  // 计数、最近更新、特色配图、相关标签、列表：与 projectSite("public") 一致，且不含私有报告带来的数字
  for (const u of v.usedTags) {
    const tag = v.tag(u.key)!;
    const page = readFileSync(join(pub(), "tags", u.key, "index.html"), "utf8");
    assert.deepEqual(related(page), tag.related.map((r) => [r.key, r.count]), `${u.key} 相关标签`);
    assert.deepEqual(stats(page), [["statReports", String(tag.count)], ["statUpdated", tag.updated], ["statRelated", String(tag.related.length)]], `${u.key} 统计条`);
    assert.deepEqual(rows(page), tag.cards.map((c) => c.slug), `${u.key} 列表`);
    assert.equal(featured(page), tag.featured?.slug ?? null, `${u.key} 特色配图`);
  }
  // 具体数字（夹具上手算）：dex 在公开站点只有 pub-a、pub-b；priv-x（10-12 更新、带卡片）不算
  const dex = readFileSync(join(pub(), "tags", "dex", "index.html"), "utf8");
  assert.deepEqual(related(dex), [["amm", 1], ["lending", 1], ["shared", 1]]);
  assert.deepEqual(stats(dex), [["statReports", "2"], ["statUpdated", "2026-10-09"], ["statRelated", "3"]]);
  assert.equal(featured(dex), "pub-a");
  assert.ok(dex.includes('src="/r/pub-a/thumb.png"'));
  assert.ok(dex.includes("去中心化交易所：订单簿、AMM 与聚合器。") && dex.includes('data-en="Decentralized exchanges: order books, AMMs and aggregators."'), "描述与英文描述");
  // amm：最近更新的 pub-c 没有缩略图，特色配图是有缩略图的 pub-a
  const amm = readFileSync(join(pub(), "tags", "amm", "index.html"), "utf8");
  assert.deepEqual([featured(amm), stats(amm)[1]], ["pub-a", ["statUpdated", "2026-10-15"]]);
  // lending：没有描述、没有缩略图——页面照常生成，没有描述段落和配图
  const lending = readFileSync(join(pub(), "tags", "lending", "index.html"), "utf8");
  assert.equal(lending.includes('class="task-desc"'), false);
  assert.equal(featured(lending), null);
  // 标签索引与归档
  const index = readFileSync(join(pub(), "tags", "index.html"), "utf8");
  assert.deepEqual([...index.matchAll(/data-tag="([^"]+)"/g)].map((m) => m[1]), ["amm", "dex", "lending", "shared"]);
  const archive = readFileSync(join(pub(), "archive", "index.html"), "utf8");
  assert.deepEqual([...archive.matchAll(/data-month="([^"]+)"/g)].map((m) => m[1]), ["2026-10", "2026-09"]);
  assert.deepEqual(stats(archive), [["statReports", "3"], ["statMonths", "2"], ["statUpdated", "2026-10-15"]]);
  const oct = readFileSync(join(pub(), "2026", "10", "index.html"), "utf8");
  assert.deepEqual([rows(oct), stats(oct)], [["pub-c", "pub-a"], [["statReports", "2"], ["statUpdated", "2026-10-15"]]]);
  // 负向：私有 / draft 的标签、描述、标题、slug、月份
  for (const needle of ["secret-topic", "机密主题TOPIC", "PRIVLABELEN", "DRAFTLABELEN", "PRIVDESC", "PRIVDESCEN", "draft-only", "草稿专用TAG", "DRAFTDESC", "私密报告PRIVX", "私密报告PRIVY", "草稿报告DRAFTZ", "priv-x", "priv-y", "draft-z", "/p/"]) {
    assert.deepEqual(grep(pub(), needle), [], `公开产物不应包含“${needle}”`);
  }
  // 公开标签的英文名（label_en）在所有渲染标签名的公开页面上；私有站点同样带着私有标签的英文名
  for (const f of ["index.html", "tags/index.html", "tags/shared/index.html", "tags/dex/index.html", "2026/10/index.html"]) {
    assert.ok(readFileSync(join(pub(), f), "utf8").includes('data-en="Shared tag SHAREDEN"'), `${f} 有 shared 的英文名`);
  }
  assert.deepEqual(grep(pub(), "PRIVLABELEN"), []);
  assert.ok(grep(priv(), 'data-en="Secret topic PRIVLABELEN"').length > 0, "私有站点有私有标签的英文名");
  for (const d of ["tags/secret-topic", "tags/draft-only", "2026/08", "2026/07", "2025", "p"]) assert.equal(existsSync(join(pub(), d)), false, d);
});

test("/p/tags/ 与 /p/archive/：全部 published；计数与共现与 projectSite(\"private\") 一致；站内导航只指向 /p/…", () => {
  const v = views().private;
  const index = readFileSync(join(priv(), "p", "tags", "index.html"), "utf8");
  assert.deepEqual([...index.matchAll(/data-tag="([^"]+)"/g)].map((m) => m[1]), v.usedTags.map((u) => u.key));
  assert.deepEqual(v.usedTags.map((u) => u.key), ["dex", "amm", "secret-topic", "shared", "lending"], "按篇数、再按键排序；draft 专用的标签不出现");
  for (const u of v.usedTags) {
    const tag = v.tag(u.key)!;
    const page = readFileSync(join(priv(), "p", "tags", u.key, "index.html"), "utf8");
    // 共现：页面上的数字 = 投影 = 直接数报告（第三份独立计算）
    const byHand = new Map<string, number>();
    for (const c of v.cards) if (c.tags.some((t) => t.key === u.key)) for (const t of c.tags) if (t.key !== u.key) byHand.set(t.key, (byHand.get(t.key) ?? 0) + 1);
    assert.deepEqual(related(page), tag.related.map((r) => [r.key, r.count]), `${u.key} 相关标签与投影一致`);
    assert.deepEqual(Object.fromEntries(related(page)), Object.fromEntries(byHand), `${u.key} 相关标签与报告一致`);
    assert.deepEqual(stats(page), [["statReports", String(tag.count)], ["statUpdated", tag.updated], ["statRelated", String(tag.related.length)]]);
    assert.deepEqual(rows(page), tag.cards.map((c) => c.slug));
    assert.equal(featured(page), tag.featured?.slug ?? null);
  }
  // 私有站点的 dex：含 priv-x（更新最晚、带卡片 → 特色配图，私有缩略图在 /p/ 下）；secret-topic 的描述在这里
  const dex = readFileSync(join(priv(), "p", "tags", "dex", "index.html"), "utf8");
  assert.deepEqual(related(dex), [["shared", 2], ["amm", 1], ["lending", 1], ["secret-topic", 1]]);
  assert.deepEqual([featured(dex), stats(dex)[0]], ["priv-x", ["statReports", "3"]]);
  assert.ok(dex.includes('src="/p/priv-x/thumb.png"'));
  const secret = readFileSync(join(priv(), "p", "tags", "secret-topic", "index.html"), "utf8");
  assert.ok(secret.includes("只给私有报告用的描述PRIVDESC") && secret.includes('data-en="Private-only description PRIVDESCEN"'));
  // 公开报告在私有标签页上链接到私有站点上的镜像（ADR 0005 §1）
  const amm = readFileSync(join(priv(), "p", "tags", "amm", "index.html"), "utf8");
  assert.ok(amm.includes('href="/p/pub-a/"') && amm.includes('src="/p/pub-a/thumb.png"') && !amm.includes(`${PUBLIC_URL}/r/`));
  // 私有月归档：含只有私有报告的月份
  const archive = readFileSync(join(priv(), "p", "archive", "index.html"), "utf8");
  assert.deepEqual([...archive.matchAll(/data-month="([^"]+)"/g)].map((m) => m[1]), v.months.map((m) => m.ym));
  assert.deepEqual(v.months.map((m) => m.ym), ["2026-10", "2026-09", "2026-08", "2025-12"]);
  assert.deepEqual(rows(readFileSync(join(priv(), "p", "2026", "08", "index.html"), "utf8")), ["priv-x"]);
  // 私有索引的标签 chip 链接到私有标签页；页头有 /p/tags/ 与 /p/archive/
  const pIndex = readFileSync(join(priv(), "p", "index.html"), "utf8");
  assert.ok(pIndex.includes('class="tag" href="/p/tags/dex/"') && pIndex.includes('href="/p/tags/"') && pIndex.includes('href="/p/archive/"'));
  // 导航规则（ADR 0003 §2）：私有页面的站内链接只指向 /p/…；公开站点只用 publicUrl 绝对地址
  for (const f of html(join(priv(), "p")).filter((f) => !/\/p\/(pub|priv)-/.test(f))) {
    const hrefs = [...readFileSync(f, "utf8").matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const bad = hrefs.filter((h) => h.startsWith("/") && !h.startsWith("/p/") && h !== "/favicon.svg");
    assert.deepEqual(bad, [], `${relative(priv(), f)} 指向了私有站点以外的站内路径`);
  }
  // draft 不进私有站点
  for (const needle of ["draft-only", "DRAFTLABELEN", "DRAFTDESC", "草稿报告DRAFTZ", "draft-z"]) assert.deepEqual(grep(priv(), needle), [], needle);
});

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };
/** 两个站点合在一个源上：/p/… 走私有产物，其余走公开产物（链接与图片在浏览器里都能打开）。 */
function serve(): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const root = p.startsWith("/p/") ? priv() : pub();
    const f = join(root, p);
    if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) return res.writeHead(404).end("not found");
    res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, origin: `http://127.0.0.1:${(server.address() as { port: number }).port}` })));
}

test("浏览器：标签页、标签索引、月归档在 390 / 1440 × 明暗 × 中英文下没有横向溢出、没有脚本错误；描述跟着语言切换", { skip: findChrome() ? false : "没有 Chrome" }, async () => {
  const shots = process.env.RH_TAG_SHOTS;
  if (shots) mkdirSync(shots, { recursive: true });
  const { server, origin } = await serve();
  const browser = await launchBrowser();
  try {
    const pages: [string, string][] = [
      ["tags", "/tags/"],
      ["tag-dex", "/tags/dex/"],
      ["tag-lending-nodesc", "/tags/lending/"],
      ["archive", "/archive/"],
      ["month", "/2026/10/"],
      ["p-tags", "/p/tags/"],
      ["p-tag-dex", "/p/tags/dex/"],
      ["p-tag-lending-nodesc", "/p/tags/lending/"],
      ["p-archive", "/p/archive/"],
      ["p-month", "/p/2026/10/"],
    ];
    for (const [name, path] of pages) {
      for (const width of [390, 1440]) {
        for (const theme of ["light", "dark"]) {
          for (const lang of ["zh", "en"]) {
            const p = await browser.newPage();
            const errors: string[] = [];
            p.on("pageerror", (e) => errors.push(String(e)));
            // 只检查本站的请求（publicUrl 在夹具里是不存在的主机）
            p.on("requestfailed", (r) => {
              if (r.url().startsWith(origin)) errors.push(`requestfailed ${r.url()}`);
            });
            p.on("response", (r) => {
              if (r.status() >= 400 && r.url().startsWith(origin)) errors.push(`${r.status()} ${r.url()}`);
            });
            await p.evaluateOnNewDocument((th: string, l: string) => {
              localStorage.setItem("rh_theme", th);
              localStorage.setItem("rh_lang", l);
            }, theme, lang);
            await p.setViewport({ width, height: 900 });
            await p.goto(`${origin}${path}`, { waitUntil: "networkidle0" });
            await p.evaluate(() => document.fonts.ready);
            const m = await p.evaluate(() => ({
              scroll: document.documentElement.scrollWidth,
              desc: document.querySelector(".task-desc")?.textContent ?? null,
              lang: document.documentElement.lang,
            }));
            const where = `${name} ${width} ${theme} ${lang}`;
            assert.ok(m.scroll <= width, `${where}：横向溢出 ${m.scroll}`);
            assert.equal(m.lang, lang === "en" ? "en" : "zh-CN");
            if (name.endsWith("tag-dex")) assert.equal(m.desc, lang === "en" ? "Decentralized exchanges: order books, AMMs and aggregators." : "去中心化交易所：订单簿、AMM 与聚合器。", where);
            if (name.includes("nodesc")) assert.equal(m.desc, null, where);
            assert.deepEqual(errors, [], where);
            if (shots) await p.screenshot({ path: join(shots, `${name}-${width}-${theme}-${lang}.png`), fullPage: true });
            await p.close();
          }
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { after, test } from "node:test";
import { inflateSync } from "node:zlib";
import { stringify } from "yaml";
import { BACK_LINK_ATTR, assemble, decorateReport, fingerprints, leakCheck, pngThumbnail, type DecorateOptions, type PublicForbidden } from "../cli/lib/build.ts";
import { loadReports, type Report } from "../lib/reports.ts";
import type { TagRegistry } from "../lib/schema.ts";
import { projectSite } from "../lib/site-data.ts";

const page = '<!doctype html><html><head><meta charset="utf-8"></head><body class="x"><h1>T</h1></body></html>';

const opts = (o: Partial<DecorateOptions> = {}): DecorateOptions => ({ backHref: "/", backLabel: "Research Hub", lang: "zh", ...o });
const amPage =
  '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
  '<div class="am-toolbar" data-x="1"><label class="am-pick">主题</label></div><main class="am-research"><header class="am-head"><h1>T</h1></header>' +
  '<div class="am-paths" role="group"><span>阅读路径</span><button class="am-btn" data-am-path="5">5</button><button class="am-btn" data-am-path="deep">完整</button></div>' +
  '<section class="am-overview">X</section></main></body></html>';

test("decorateReport：返回链接插在 <body> 开头，补 robots，幂等", () => {
  const once = decorateReport(page, opts());
  assert.match(once, /<body class="x"><nav data-rh-back[^>]*><a href="\/"[^>]*>← Research Hub<\/a><\/nav><h1>/);
  assert.match(once, /<meta name="robots" content="noindex, nofollow">/);
  assert.equal(decorateReport(once, opts()), once);
  assert.equal(once.split(`${BACK_LINK_ATTR} `).length, 2);
});

test("decorateReport：不改页面样式——没有语言 / 卡片的普通页面不注入样式与脚本", () => {
  const plain = decorateReport(page, opts({ backHref: "/p/" }));
  assert.doesNotMatch(plain, /<style/);
  assert.doesNotMatch(plain, /<script/);
  const amOnly = decorateReport(amPage, opts());
  assert.match(amOnly, /<style data-rh-style>@media \(max-width:760px\)\{nav\[data-rh-back\]\{padding-top:50px!important\}\}<\/style>/);
});

test("decorateReport：注入的样式规则只作用于注入的元素（外加卡片模式隐藏正文的一条）", () => {
  const full = decorateReport(amPage, opts({ altHref: "./en/", card: { src: "card.png" } }));
  const styles = full.match(/<style data-rh-style>[^<]*<\/style>/g) ?? [];
  assert.equal(styles.length, 1);
  const css = styles[0].replace(/<\/?style[^>]*>/g, "").replace(/@media[^{]*\{/g, "");
  for (const rule of css.split("}").filter((r) => r.includes("{"))) {
    const selector = rule.slice(0, rule.indexOf("{"));
    for (const sel of selector.split(",")) {
      assert.ok(/data-rh-/.test(sel), `样式规则必须作用于注入的元素：${sel}`);
    }
  }
});

test("decorateReport：没有 <body> 时报错；href 会转义", () => {
  assert.throws(() => decorateReport("<html></html>", opts({ backLabel: "x" })));
  assert.match(decorateReport(page, opts({ backHref: '/"x', backLabel: "a<b" })), /href="\/&quot;x"[^>]*>← a&lt;b/);
});

test("decorateReport：中文 / EN 切换在右上角工具栏开头（桌面）与返回链接一行（窄屏），当前语言高亮", () => {
  const zh = decorateReport(amPage, opts({ altHref: "./en/" }));
  assert.match(zh, /<div class="am-toolbar" data-x="1"><span data-rh-lang [^>]*><span aria-current="page" lang="zh-CN">中文<\/span><a href="\.\/en\/"[^>]*data-rh-lang-to="en">EN<\/a><\/span><label/);
  assert.match(zh, /<nav data-rh-back[^>]*>.*<span data-rh-lang /);
  assert.equal(zh.split("<span data-rh-lang ").length, 3, "工具栏一份 + 返回链接行一份");
  assert.match(zh, /@media \(max-width:760px\)\{nav\[data-rh-back\]\{padding-top:50px!important\}\.am-toolbar>\[data-rh-lang\]\{display:none\}\}/);
  assert.match(zh, /<script data-rh-script>[\s\S]*rh_lang[\s\S]*<\/script><\/body>/);
  const en = decorateReport(amPage, opts({ lang: "en", altHref: "../" }));
  assert.match(en, /<a href="\.\.\/"[^>]*data-rh-lang-to="zh">中文<\/a><span aria-current="page" lang="en">EN<\/span>/);
  assert.doesNotMatch(decorateReport(amPage, opts()), /data-rh-lang/, "没有另一种语言版本时不显示切换");
});

test("decorateReport：推特卡片模式接在 am 阅读路径后面，卡片区默认隐藏；没有卡片时不出现", () => {
  const html = decorateReport(amPage, opts({ card: { src: "card.png", quote: "https://x.com/a/status/1" } }));
  assert.match(html, /data-am-path="deep">完整<\/button><button class="am-btn" type="button" data-rh-card-btn aria-pressed="false">推特卡片<\/button><\/div><section data-rh-card hidden/);
  assert.match(html, /<img data-rh-card-img src="card\.png"[^>]*loading="lazy"/);
  assert.match(html, /<a data-rh-card-quote href="https:\/\/x\.com\/a\/status\/1" target="_blank" rel="noopener noreferrer">/);
  assert.match(html, /data-rh-card-copy[^>]*>复制图片<\/button>/);
  assert.match(html, /ClipboardItem\(\{"image\/png":blob\}\)/);
  assert.match(html, /html\[data-rh-view="card"\] \.am-research>:not\(\.am-paths\):not\(\[data-rh-card\]\)\{display:none!important\}/);
  const en = decorateReport(amPage, opts({ lang: "en", card: { src: "card.png" } }));
  assert.match(en, />Tweet card<\/button>/);
  assert.doesNotMatch(en, /data-rh-card-quote/, "没有 quote 时不显示源推文链接");
  assert.doesNotMatch(decorateReport(amPage, opts()), /data-rh-card/);
});

test("decorateReport：有推文文案时显示文案、X 计数和“复制文案”按钮；文案会转义", () => {
  const tweet = "第一行 <b>\n\n第二行 & https://x.com/a";
  const html = decorateReport(amPage, opts({ card: { src: "card.png", tweet } }));
  assert.match(html, /<button type="button" data-rh-card-copy-text [^>]*>复制文案<\/button><button type="button" data-rh-card-copy /, "复制文案在复制图片之前");
  assert.match(html, /<figure data-rh-card-tweet><figcaption>推文文案 · X 计数 \d+<\/figcaption><p data-rh-card-tweet-text>第一行 &lt;b&gt;\n\n第二行 &amp; https:\/\/x\.com\/a<\/p><\/figure>/);
  const long = decorateReport(amPage, opts({ card: { src: "card.png", tweet: `${"a".repeat(200)}\n\n${"b".repeat(200)}` } }));
  assert.match(long, /X 计数 402（会员长文：信息流中约 280 字符后折叠为“显示更多”）/, "超过 280 时提示折叠");
  assert.match(html, /navigator\.clipboard\.writeText/);
  const noTweet = decorateReport(amPage, opts({ card: { src: "card.png" } }));
  assert.doesNotMatch(noTweet, /<figure data-rh-card-tweet|<button[^>]*data-rh-card-copy-text/);
  assert.match(noTweet, /<span data-rh-card-hint>在 X 上引用源推文，粘贴/, "没有文案时提示只说粘贴图片");
  assert.match(decorateReport(amPage, opts({ lang: "en", card: { src: "card.png", tweet } })), />Copy text<\/button>/);
});

test("decorateReport：非 am 页面的卡片按钮与卡片区放在返回链接一行之后", () => {
  const html = decorateReport(page, opts({ card: { src: "card.png" } }));
  assert.match(html, /<nav data-rh-back[^>]*>.*data-rh-card-btn.*<\/nav><section data-rh-card /);
  assert.match(html, /html\[data-rh-view="card"\] body>:not\(\[data-rh-back\]\):not\(\[data-rh-card\]\):not\(\.am-toolbar\)/, "非 research 模板的 am 页面进入卡片模式时保留工具栏（桌面语言切换在里面）");
});

test("fingerprints：标题 / 摘要的原文与转义形式，以及站点路径", () => {
  const r = {
    slug: "s",
    meta: { title: "A & B <C>", summary: "短", title_en: "English Title", summary_en: "English Summary Description" },
  } as unknown as Report;
  const f = fingerprints(r);
  assert.ok(f.includes("A & B <C>"));
  assert.ok(f.includes("A &amp; B &lt;C&gt;"));
  assert.ok(f.includes("English Title"));
  assert.ok(f.includes("English Summary Description"));
  assert.ok(!f.includes("短"), "过短的文本不作为指纹，避免误报");
  assert.ok(f.includes("/p/s/") && f.includes("/r/s/"));
  assert.ok(f.includes("/p/s/en/") && f.includes("/r/s/en/"));
});

// ── 按站点投影、资源分发与泄漏检查（WHI-1926，ADR 0003 §3–§6）────────────────────────────

const FIXTURE_PNG = join(import.meta.dirname, "fixtures", "png");
const PUBLIC_URL = "https://pub.example";
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body><h1>x</h1></body></html>';

/** 混合夹具：public / private / draft 报告，各自带 card.png、assets/、英文版，标签有共享、私有专用与 draft 专用。 */
const tmpRoots: string[] = [];
after(() => {
  for (const d of tmpRoots) rmSync(d, { recursive: true, force: true });
});

function mixedRepo() {
  const root = mkdtempSync(join(tmpdir(), "rh-proj-"));
  tmpRoots.push(root);
  const card = readFileSync(join(FIXTURE_PNG, "rgb.png"));
  const write = (slug: string, meta: Record<string, unknown>, opts: { card?: Buffer; asset?: string } = {}) => {
    const created = String(meta.created ?? "2026-10-05");
    const dir = join(root, "reports", created.slice(0, 4), created.slice(5, 7), slug);
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(
      join(dir, "meta.yml"),
      stringify({
        title: `标题 ${slug}`, summary: `摘要 ${slug}`, created, updated: created, changelog: [{ date: created, note: "导入" }],
        domain: "crypto", tags: [], status: "published", visibility: "public", kind: "imported", source_repo: "x", ...meta,
      }),
    );
    writeFileSync(join(dir, "index.html"), HTML);
    writeFileSync(join(dir, "index.en.html"), HTML);
    if (opts.card) writeFileSync(join(dir, "card.png"), opts.card);
    writeFileSync(join(dir, "assets", "fig.svg"), opts.asset ?? `<svg>${slug}</svg>`);
  };
  write("pub-a", { title: "公开报告甲", tags: ["dex", "shared"], related: ["priv-b", "pub-e", "draft-c"], updated: "2026-10-09" }, { card });
  write("pub-e", { title: "公开报告戊", domain: "ai", tags: ["dex"] });
  // 私有报告：card.png 与 assets 的字节和公开报告都不同，便于按内容查找
  write("priv-b", { title: "私密报告ZQX", visibility: "private", domain: "work", tags: ["shared", "secret"], created: "2026-09-12", updated: "2026-09-20", related: ["pub-a"] }, { card: pngThumbnail(card, "card.png", 30), asset: "<svg>机密图ZQX</svg>" });
  write("draft-c", { title: "草稿标题QQQ", status: "draft", domain: "finance", tags: ["draft-only", "shared"] }, { card });
  write("draft-p", { title: "私有草稿WWW", status: "draft", visibility: "private", tags: ["secret"], created: "2026-08-01", updated: "2026-08-01" });
  const tags: TagRegistry = {
    dex: { label: "DEX", description: "去中心化交易所相关的报告" },
    shared: { label: "共享", description: "公开与私有都用到的标签" },
    secret: { label: "机密主题", description: "只出现在私有报告上的机密描述", description_en: "Confidential description of a private-only tag" },
    "draft-only": { label: "草稿专用", description: "只被草稿用到的标签描述" },
    unused: { label: "没人用", description: "没有任何报告用到的标签描述" },
  };
  const { reports, issues } = loadReports(root);
  assert.deepEqual(issues, []);
  return { root, reports, tags };
}

const slugsOf = (xs: { slug: string }[]) => xs.map((x) => x.slug).sort();
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
function* files(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* files(p);
    else yield p;
  }
}

test("projectSite：公开站点的列表、计数、标签、共现、缩略图、related、引用都只来自 public + published", () => {
  const { reports, tags } = mixedRepo();
  const v = projectSite("public", reports, tags, PUBLIC_URL);
  assert.deepEqual(v.cards.map((c) => c.slug), ["pub-a", "pub-e"], "按 updated 倒序");
  assert.deepEqual(v.usedTags, [{ key: "dex", label: "DEX", count: 2 }, { key: "shared", label: "共享", count: 1 }], "计数不含私有与 draft");
  assert.deepEqual(Object.keys(v.tags).sort(), ["dex", "shared"], "登记表只含公开报告用到的标签（描述也只有这些）");
  assert.deepEqual(v.domains.map((d) => d.key), ["ai", "crypto"]);
  assert.deepEqual(v.months.map((m) => m.ym), ["2026-10"], "只有私有 / draft 报告的月份没有归档");
  assert.deepEqual(v.coTags("shared"), [{ key: "dex", label: "DEX", count: 1 }], "共现里没有私有报告带来的 secret");
  assert.deepEqual(v.coTags("secret"), []);
  const a = v.cards[0];
  assert.deepEqual(a.related, ["pub-e"], "related 去掉私有与 draft");
  assert.equal(a.href, "/r/pub-a/");
  assert.equal(a.href_en, "/r/pub-a/en/");
  assert.equal(a.thumb, "/r/pub-a/thumb.png");
  assert.equal(v.cards[1].thumb, undefined, "没有 card.png 就没有缩略图");
  // Daily 之类引用报告的页面经过 find：私有、draft、不存在的报告被过滤
  assert.equal(v.find("pub-a")?.slug, "pub-a");
  for (const s of ["priv-b", "draft-c", "draft-p", "nope"]) assert.equal(v.find(s), undefined, s);
  assert.doesNotMatch(JSON.stringify(v), /ZQX|QQQ|WWW|priv-b|draft-|机密|草稿/, "投影里没有任何非公开数据（包括公开报告 meta.related 里的私有 slug）");
});

test("projectSite：私有站点用全部 published（不含 draft），公开报告的链接与缩略图指向公开站点", () => {
  const { reports, tags } = mixedRepo();
  const v = projectSite("private", reports, tags, PUBLIC_URL);
  assert.deepEqual(slugsOf(v.cards), ["priv-b", "pub-a", "pub-e"]);
  assert.deepEqual(v.months.map((m) => [m.ym, slugsOf(m.cards)]), [["2026-10", ["pub-a", "pub-e"]], ["2026-09", ["priv-b"]]]);
  assert.deepEqual(Object.keys(v.tags).sort(), ["dex", "secret", "shared"], "draft 专用与没人用的标签不出现");
  assert.deepEqual(v.coTags("shared").map((t) => t.key), ["dex", "secret"]);
  const a = v.cards.find((c) => c.slug === "pub-a")!;
  assert.equal(a.href, `${PUBLIC_URL}/r/pub-a/`);
  assert.equal(a.thumb, `${PUBLIC_URL}/r/pub-a/thumb.png`, "公开报告的缩略图用公开站点的绝对地址，不复制");
  assert.deepEqual(a.related, ["priv-b", "pub-e"]);
  const b = v.cards.find((c) => c.slug === "priv-b")!;
  assert.equal(b.href, "/p/priv-b/");
  assert.equal(b.thumb, "/p/priv-b/thumb.png");
  assert.equal(v.find("draft-c"), undefined);
});

/** 假的 Astro 产物：公开页面列出公开报告；可以加额外的顶层产物。 */
function fakeAstro(root: string, extra: Record<string, string> = {}) {
  const out = join(root, ".astro-dist");
  rmSync(out, { recursive: true, force: true });
  const files: Record<string, string> = {
    "index.html": "<a href=/r/pub-a/>公开报告甲</a>",
    "404.html": "404",
    "favicon.svg": "<svg/>",
    "fonts/inter.woff2": "font",
    "tags/dex/index.html": "dex",
    "archive/index.html": "archive",
    "2026/10/index.html": "month",
    "daily/index.html": "daily",
    "p/index.html": "<a href=/p/priv-b/>私密报告ZQX</a>",
    ...extra,
  };
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(out, name, ".."), { recursive: true });
    writeFileSync(join(out, name), text);
  }
  return out;
}

test("assemble：按来源 → 站点清单分发；共享白名单进两站；清单外的顶层产物让构建失败", () => {
  const { root, reports } = mixedRepo();
  const res = assemble(root, fakeAstro(root), reports);
  const list = (d: string) => [...files(d)].map((f) => relative(d, f)).sort();
  const pub = list(res.publicDir);
  const priv = list(res.privateDir);
  for (const shared of ["404.html", "favicon.svg", "fonts/inter.woff2"]) {
    assert.ok(pub.includes(shared) && priv.includes(shared), `共享资源 ${shared} 进两站`);
  }
  for (const p of ["index.html", "tags/dex/index.html", "archive/index.html", "2026/10/index.html", "daily/index.html"]) {
    assert.ok(pub.includes(p) && !priv.includes(p), `${p} 只进公开站点`);
  }
  assert.ok(priv.includes("p/index.html") && !pub.some((f) => f.startsWith("p/")));
  assert.deepEqual(res.publicReports.sort(), ["pub-a", "pub-e"]);
  assert.deepEqual(res.privateReports, ["priv-b"]);
  assert.equal(res.thumbnails, 2, "pub-a 与 priv-b 有 card.png；draft-c 的不生成");

  for (const extra of [{ "_astro/x.css": "x" }, { "search.json": "[]" }, { "robots.txt": "x" }] as Record<string, string>[]) {
    const r2 = mixedRepo();
    assert.throws(() => assemble(r2.root, fakeAstro(r2.root, extra), r2.reports), /未登记的顶层产物：(_astro|search\.json|robots\.txt)/);
  }
});

test("assemble：私有报告的缩略图、card.png、assets 只在私有产物里；缩略图只进报告所在的站点", () => {
  const { root, reports } = mixedRepo();
  const res = assemble(root, fakeAstro(root), reports);
  const pubThumb = join(res.publicDir, "r", "pub-a", "thumb.png");
  const privThumb = join(res.privateDir, "p", "priv-b", "thumb.png");
  assert.ok(existsSync(pubThumb) && existsSync(privThumb));
  assert.ok(!existsSync(join(res.publicDir, "r", "pub-a", "en", "thumb.png")), "缩略图只放在报告目录，不复制到 en/");
  assert.ok(!existsSync(join(res.privateDir, "r")), "公开报告的缩略图不复制到私有站点");
  assert.ok(!existsSync(join(res.publicDir, "r", "pub-e", "thumb.png")));
  // 按内容找：私有报告的每个二进制资源与生成的缩略图，都不在公开产物的任何文件里
  const privDir = join(root, "reports", "2026", "09", "priv-b");
  const hidden = new Set([readFileSync(join(privDir, "card.png")), readFileSync(join(privDir, "assets", "fig.svg")), readFileSync(privThumb)].map(sha));
  const draftDir = join(root, "reports", "2026", "10", "draft-c");
  const publicHashes = new Set([...files(res.publicDir)].map((f) => sha(readFileSync(f))));
  for (const h of hidden) assert.ok(!publicHashes.has(h), "私有资源出现在公开产物里");
  assert.ok(![...files(res.publicDir), ...files(res.privateDir)].some((f) => f.includes("draft-")), "draft 的资源不进任何产物");
  assert.ok(existsSync(join(draftDir, "card.png")));
  assert.equal(readFileSync(pubThumb).subarray(1, 4).toString(), "PNG");
  assert.deepEqual(leakCheck(res, reports, mixedRepo().tags), [], "正常产物通过泄漏检查");
});

test("leakCheck：Daily 页面引用私有报告、私有专用标签的描述、登记的内部数据都会让构建失败", () => {
  const { root, reports, tags } = mixedRepo();
  const run = (extra: Record<string, string>, forbidden: PublicForbidden[] = []) => leakCheck(assemble(root, fakeAstro(root, extra), reports), reports, tags, forbidden);
  assert.deepEqual(run({}), []);

  // Daily 引用私有 / draft 报告：标题或路径都会被发现
  assert.match(run({ "daily/2026-10-18/index.html": "<a href=/p/priv-b/>x</a>" }).join("\n"), /daily\/2026-10-18\/index\.html 含有非公开报告 priv-b 的内容：“\/p\/priv-b\/”/);
  assert.match(run({ "daily/index.html": "今天：私密报告ZQX" }).join("\n"), /含有非公开报告 priv-b 的内容：“私密报告ZQX”/);
  assert.match(run({ "daily/index.html": "草稿标题QQQ" }).join("\n"), /非公开报告 draft-c/);

  // 标签描述：只有被公开报告用到的标签的描述能出现在公开产物里
  assert.deepEqual(run({ "tags/dex/index.html": "去中心化交易所相关的报告 · 公开与私有都用到的标签" }), []);
  for (const [key, text] of [["secret", "只出现在私有报告上的机密描述"], ["secret", "Confidential description of a private-only tag"], ["draft-only", "只被草稿用到的标签描述"], ["unused", "没有任何报告用到的标签描述"]]) {
    assert.match(run({ "tags/index.html": text }).join("\n"), new RegExp(`只用于非公开报告的标签 ${key} 的描述的内容`), text);
  }

  // 内部数据（Daily 的状态文件与内部清单字段由 Daily 构建登记）：出现在公开产物里就失败
  const forbidden: PublicForbidden[] = [
    { source: "daily/state.yml", text: "input_hash: 9f2c1e7a" },
    { source: "daily/state.yml", text: "error_detail" },
  ];
  assert.deepEqual(run({ "daily/index.html": "今日话题" }, forbidden), []);
  const errs = run({ "daily/index.html": "<pre>error_detail: timeout\ninput_hash: 9f2c1e7a</pre>" }, forbidden);
  assert.equal(errs.length, 2, errs.join("\n"));
  assert.match(errs.join("\n"), /daily\/index\.html 含有daily\/state\.yml 的内部数据的内容：“input_hash: 9f2c1e7a”/);
});

test("pngThumbnail：8 位 RGB（五种行过滤）按面积平均缩小，结果与参考实现逐像素一致；输出确定", () => {
  // rgb.png：60×45 的 8 位 RGB 噪声图，逐行轮流用过滤类型 0–4 编码（ImageMagick 能解出同样的像素）
  const png = readFileSync(join(FIXTURE_PNG, "rgb.png"));
  const out = pngThumbnail(png, "rgb.png", 20);
  assert.deepEqual(out, pngThumbnail(png, "rgb.png", 20), "同样的输入得到同样的字节");
  assert.equal(out.readUInt32BE(16), 20);
  assert.equal(out.readUInt32BE(20), 15, "高度按比例");
  // 解出缩略图的像素（每行过滤类型 0），与 ImageMagick `magick rgb.png -filter Box -resize 20x15 -depth 8 RGB:-` 的结果（十六进制）比较
  const idat = out.subarray(41, 41 + out.readUInt32BE(33));
  const raw = inflateSync(idat);
  const rows = Array.from({ length: 15 }, (_, y) => raw.subarray(y * 61 + 1, y * 61 + 61));
  assert.deepEqual(Buffer.concat(rows), Buffer.from(readFileSync(join(FIXTURE_PNG, "rgb.box20.hex"), "utf8").replace(/\s+/g, ""), "hex"));
  assert.equal(pngThumbnail(png, "rgb.png").readUInt32BE(16), 60, "比缩略图还小的图不放大");
});

test("pngThumbnail：不支持的 PNG 报错，说明文件和原因", () => {
  assert.throws(() => pngThumbnail(readFileSync(join(FIXTURE_PNG, "rgba.png")), "reports/x/card.png"), /reports\/x\/card\.png：无法生成缩略图（只支持 8 位 RGB（颜色类型 2），实际位深 8、颜色类型 6）/);
  assert.throws(() => pngThumbnail(readFileSync(join(FIXTURE_PNG, "palette.png")), "p.png"), /p\.png：无法生成缩略图（只支持 8 位 RGB.*颜色类型 3/);
  assert.throws(() => pngThumbnail(readFileSync(join(FIXTURE_PNG, "interlaced.png")), "i.png"), /i\.png：无法生成缩略图（不支持隔行扫描/);
  assert.throws(() => pngThumbnail(Buffer.from("GIF89a"), "g.png"), /g\.png：无法生成缩略图（不是 PNG 文件）/);
  const png = readFileSync(join(FIXTURE_PNG, "rgb.png"));
  assert.throws(() => pngThumbnail(png.subarray(0, 60), "t.png"), /t\.png：无法生成缩略图/, "截断的文件");
});

test("assemble：card.png 无法生成缩略图时构建失败并指出文件", () => {
  const { root, reports } = mixedRepo();
  writeFileSync(join(root, "reports", "2026", "10", "pub-a", "card.png"), readFileSync(join(FIXTURE_PNG, "interlaced.png")));
  assert.throws(() => assemble(root, fakeAstro(root), reports), /reports\/2026\/10\/pub-a\/card\.png：无法生成缩略图/);
});

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { Browser } from "puppeteer-core";
import { stringify } from "yaml";
import {
  CARD_LIMITS,
  FIGURE_BOX,
  avoidedTerms,
  PNG_HASH_KEY,
  cardHash,
  cardHtml,
  cardPngState,
  displayWidth,
  fitFigure,
  tweetLength,
  inlineMarkup,
  ledgerStats,
  loadCard,
  parseCard,
  pngSize,
  readPngText,
  withPngText,
  type CardContent,
} from "../cli/lib/card.ts";
import { bakeFigures, extractFigureSvg, figureDraft } from "../cli/lib/card-figure.ts";
import { renderCardPng } from "../cli/lib/card-render.ts";
import { findChrome, launchBrowser } from "../cli/lib/mobile.ts";
import { loadConfig } from "../lib/config.ts";

const figure = {
  caption: "左边会迁，右边要自己迁",
  excalidraw: { nodes: [{ id: "a", label: "共识", col: 0, row: 0, color: "green" }, { id: "b", label: "多签", col: 1, row: 0, color: "red" }] },
};
const FAKE_SVG = '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 140" style="width: 500px;"><rect x="10" y="10" width="480" height="120" fill="#cfc"/><text x="20" y="60" font-size="22px">节点</text></svg>';
const good: CardContent = {
  title: "后量子迁移：Ethereum 不会替 Mantle 做完的两件事",
  background: "量子计算机能解椭圆曲线难题：签名和 SNARK 证明会失效。",
  context: "Aztec 刚公布 PQ 路线。",
  figure,
  findings: [{ stat: "6/14", text: "L1 升级权在一个 **6/14 多签**上。" }, "状态根靠一次 BN254 PLONK 验证。"],
  takeaway: "现在就能开始。",
  tweet: "后量子迁移有条容易被忽略的分界：L1 的 PQ 目标只覆盖 L1 协议。\n\n图左随 L1 获得；图右要 L2 自己迁。",
};

// 1×1 透明 PNG
const PNG_1x1 = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);

test("displayWidth：汉字 / 全角算 2，ASCII 算 1，**强调**记号不计", () => {
  assert.equal(displayWidth("abc"), 3);
  assert.equal(displayWidth("中文"), 4);
  assert.equal(displayWidth("中文：ab"), 8);
  assert.equal(displayWidth("**6/14** 多签"), 9);
});

test("parseCard：合法卡片通过；字符串与 {stat,text} 两种发现写法都可以", () => {
  const r = parseCard({ quote: "https://x.com/a/status/1", zh: good });
  assert.deepEqual(r.errors, []);
  assert.equal(r.card?.zh?.findings.length, 2);
});

test("parseCard：深度控制——超长、条数、换行、未配对的强调、空卡片都被拒绝", () => {
  const long = "长".repeat(CARD_LIMITS.title / 2 + 1);
  const errs = (zh: Partial<CardContent>) => parseCard({ zh: { ...good, ...zh } }).errors.join("\n");
  assert.match(errs({ title: long }), /zh\.title: 太长/);
  assert.match(errs({ findings: ["只有一条"] }), /zh\.findings/);
  assert.match(errs({ findings: ["a", "b", "c", "d"] }), /zh\.findings/);
  assert.match(errs({ figure: undefined }), /zh\.figure/, "配图必填");
  assert.match(errs({ figure: { ...figure, excalidraw: { nodes: [{ id: "a", label: "x" }] } } }), /配图至少/);
  const many = Array.from({ length: CARD_LIMITS.figureNodesMax + 1 }, (_, i) => ({ id: `n${i}`, label: "x" }));
  assert.match(errs({ figure: { ...figure, excalidraw: { nodes: many } } }), /配图最多/);
  assert.match(errs({ figure: { caption: "说明".repeat(CARD_LIMITS.caption), excalidraw: figure.excalidraw } }), /figure\.caption: 太长/);
  assert.match(errs({ context: "第一行\n第二行" }), /不能换行/);
  assert.match(errs({ takeaway: "**没配对" }), /没有配对/);
  assert.match(errs({ findings: [{ stat: "123456789", text: "x" }, "y"] }), /stat: 太长/);
  assert.match(parseCard({}).errors.join(), /至少要写 zh 或 en/);
  assert.match(parseCard({ zh: good, quote: "http://x.com/a" }).errors.join(), /quote/);
  assert.match(parseCard({ zh: { ...good, extra: 1 } }).errors.join(), /extra|Unrecognized/i);
});

test("cardHtml：转义 HTML，只把 **强调** 变成 <strong>；有台账时页脚写统计", () => {
  assert.equal(inlineMarkup("a<b> **c**"), "a&lt;b&gt; <strong>c</strong>");
  const html = cardHtml({ lang: "zh", content: { ...good, title: "<script>x</script>" }, date: "2026-10-16", ledger: { total: 3, observed: 1, inferred: 1, speculative: 1 }, figureSvg: FAKE_SVG });
  assert.doesNotMatch(html, /<script>x/);
  assert.match(html, /论断台账 3 条 · observed 1 · inferred 1</);
  assert.doesNotMatch(html, /speculative/, "卡片不用推测论断，页脚也不写");
  assert.match(html, /<figcaption class="cap">左边会迁，右边要自己迁<\/figcaption><svg [^>]*width="\d+" height="\d+">/);
  assert.doesNotMatch(html, /style="width: 500px;"/, "去掉 am 写死的宽度");
  assert.match(html, /<b class="stat">6\/14<\/b>/);
  assert.match(html, /<b class="idx">02<\/b>/, "没有 stat 的发现用序号");
  assert.match(cardHtml({ lang: "en", content: good, date: "2026-10-16", ledger: null, figureSvg: null }), /class="fig-ph"[\s\S]*What we found/);
});

test("fitFigure：按图区等比缩放，放大有上限；没有 viewBox 时返回 null", () => {
  const wide = fitFigure(FAKE_SVG.replace("0 0 500 140", "0 0 1016 140"))!;
  assert.equal(wide.scale, FIGURE_BOX.width / 1016);
  assert.equal(wide.width, FIGURE_BOX.width);
  const tall = fitFigure(FAKE_SVG.replace("0 0 500 140", "0 0 300 280"))!;
  assert.equal(tall.height, FIGURE_BOX.height);
  const small = fitFigure(FAKE_SVG.replace("0 0 500 140", "0 0 100 50"))!;
  assert.equal(small.scale, FIGURE_BOX.maxScale);
  assert.equal(fitFigure("<svg></svg>"), null);
});

test("figureDraft / extractFigureSvg：每种语言一张图，行号范围覆盖 JSON；按 data-name 取回 SVG", () => {
  const { draft, ranges } = figureDraft([{ lang: "zh", figure }, { lang: "en", figure: { ...figure, caption: 'say "hi"' } }]);
  assert.match(draft, /```excalidraw q="左边会迁，右边要自己迁" name=card-zh/);
  assert.match(draft, /```excalidraw q="say 'hi'" name=card-en/);
  const lines = draft.split("\n");
  for (const r of ranges) {
    assert.match(lines[r.from - 1], new RegExp(`name=card-${r.lang}`));
    assert.equal(lines[r.to - 1], "```");
  }
  const html = `<figure class="am-fig am-excal" data-name="card-zh"><div><svg viewBox="0 0 1 1">zh</svg></div></figure><figure class="am-fig am-excal" data-name="card-en"><div></div></figure>`;
  assert.equal(extractFigureSvg(html, "zh"), '<svg viewBox="0 0 1 1">zh</svg>');
  assert.equal(extractFigureSvg(html, "en"), null);
});

test("avoidedTerms：卡片任何文字（含配图）出现要避免的词时返回，不区分大小写", () => {
  assert.deepEqual(avoidedTerms(good, ["Mantle"]), ["Mantle"]);
  const neutral = { ...good, title: "后量子迁移：L2 要自己做的事", findings: ["a", "b"], figure: { ...figure, caption: "x" } };
  assert.deepEqual(avoidedTerms(neutral, ["Mantle", " "]), []);
  assert.deepEqual(avoidedTerms({ ...neutral, background: "Man**tle** 的路线" }, ["Mantle"]), ["Mantle"], "强调记号拆开的词也能发现");
  assert.deepEqual(avoidedTerms({ ...neutral, figure: { ...figure, excalidraw: { nodes: [{ id: "a", label: "MANTLE L2" }, { id: "b", label: "y" }] } } }, ["mantle"]), ["mantle"]);
});

test("tweetLength：与 X 的 twitter-text 计数一致——汉字算 2、链接算 23（句末标点不算进链接）、emoji 序列算 2", () => {
  assert.equal(tweetLength("abc"), 3);
  assert.equal(tweetLength("中文"), 4);
  assert.equal(tweetLength("a–b “x” ×"), 9, "en dash、弯引号、乘号都算 1");
  assert.equal(tweetLength("→"), 2);
  assert.equal(tweetLength("see https://example.com/a/very/long/path?x=1 ok"), 4 + 23 + 3);
  assert.equal(tweetLength(`${"a".repeat(256)} https://example.com.`), 281, "句末句号不属于链接");
  assert.equal(tweetLength("see example.com ok"), 4 + 23 + 3, "不带协议的域名也按链接计");
  assert.equal(tweetLength("👨‍👩‍👧‍👦"), 2, "ZWJ 组合 emoji 算一个");
  assert.equal(tweetLength("e\u0301"), 1, "先做 NFC 归一化");
});

test("推文文案：必填、X 计数 80–280、不能用 **；改文案不会让 PNG 过期", () => {
  const errs = (zh: Partial<CardContent>) => parseCard({ zh: { ...good, ...zh } }).errors.join("\n");
  assert.equal(errs({}), "");
  assert.match(errs({ tweet: undefined }), /zh\.tweet/);
  assert.match(errs({ tweet: "太短" }), /推文太短/);
  assert.match(errs({ tweet: "长".repeat(141) }), /推文太长：X 计数 282/);
  assert.match(errs({ tweet: `${good.tweet} **重点**` }), /不要用 \*\*强调\*\*/);
  assert.equal(cardHash({ ...good, tweet: `${good.tweet}改` }), cardHash(good));
  assert.notEqual(cardHash({ ...good, takeaway: "改" }), cardHash(good));
  assert.doesNotMatch(cardHtml({ lang: "zh", content: good, date: "2026-10-16", ledger: null, figureSvg: null }), /容易被忽略/, "文案不画进图片");
});

test("PNG 元数据：写入 / 读取哈希，重复写入只保留一份；PNG 仍可解析尺寸", () => {
  const a = withPngText(PNG_1x1, PNG_HASH_KEY, "abc");
  assert.equal(readPngText(a, PNG_HASH_KEY), "abc");
  const b = withPngText(a, PNG_HASH_KEY, "def");
  assert.equal(readPngText(b, PNG_HASH_KEY), "def");
  assert.equal(b.length, a.length);
  assert.deepEqual(pngSize(b), { width: 1, height: 1 });
  assert.equal(readPngText(PNG_1x1, PNG_HASH_KEY), null);
  assert.throws(() => withPngText(Buffer.from("nope"), "k", "v"));
});

test("loadCard / cardPngState / ledgerStats：缺失、过期、最新三种状态", () => {
  const dir = mkdtempSync(join(tmpdir(), "rh-card-"));
  assert.equal(loadCard(dir).exists, false);
  writeFileSync(join(dir, "card.yml"), "zh: [");
  assert.match(loadCard(dir).errors.join(), /YAML/);
  writeFileSync(join(dir, "card.yml"), stringify({ zh: good }));
  const { card } = loadCard(dir);
  assert.ok(card?.zh);
  assert.equal(cardPngState(dir, "zh", card.zh), "missing");
  writeFileSync(join(dir, "card.png"), withPngText(PNG_1x1, PNG_HASH_KEY, "old"));
  assert.equal(cardPngState(dir, "zh", card.zh), "stale");
  writeFileSync(join(dir, "card.png"), withPngText(PNG_1x1, PNG_HASH_KEY, cardHash(card.zh)));
  assert.equal(cardPngState(dir, "zh", card.zh), "ok");

  assert.equal(ledgerStats(dir), null);
  mkdirSync(join(dir, "research"));
  writeFileSync(join(dir, "research", "ledger.md"), "| 论断 | 证据 | 类型 |\n|---|---|---|\n| a | u | observed |\n| b | u | inferred |\n| c | u | observed |\n");
  assert.deepEqual(ledgerStats(dir), { total: 3, observed: 2, inferred: 1, speculative: 0 });
});

const skip = findChrome() ? false : "没有 Chrome，跳过卡片渲染测试";
let browser: Browser;
before(async () => {
  if (!skip) browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
});

test("renderCardPng：1200×1500 PNG，带内容哈希；内容超出画布时报错", { skip }, async () => {
  const ok = await renderCardPng(browser, { lang: "zh", content: good, date: "2026-10-16", ledger: null, figureSvg: FAKE_SVG });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(pngSize(ok.png), { width: 1200, height: 1500 });
  assert.equal(readPngText(ok.png, PNG_HASH_KEY), cardHash(good));
  assert.ok(ok.slack > 0);

  // 绕过 schema 直接塞满：每段都写到上限附近，四条发现
  const full = "满".repeat(CARD_LIMITS.finding / 2);
  const tooMuch: CardContent = {
    title: "长".repeat(CARD_LIMITS.title / 2),
    background: "背".repeat(CARD_LIMITS.background / 2),
    context: "况".repeat(CARD_LIMITS.context / 2),
    figure,
    findings: [full, full, full],
    takeaway: "结".repeat(CARD_LIMITS.takeaway / 2),
    tweet: good.tweet,
  };
  const bad = await renderCardPng(browser, { lang: "zh", content: tooMuch, date: "2026-10-16", ledger: null, figureSvg: FAKE_SVG });
  assert.ok(bad.errors.some((e) => e.includes("超出画布")), bad.errors.join("\n"));

  const wide = await renderCardPng(browser, { lang: "en", content: { ...good, findings: [{ stat: "12345678", text: "x" }, "y"] }, date: "2026-10-16", ledger: null, figureSvg: FAKE_SVG });
  assert.ok(wide.errors.some((e) => e.includes("关键数字")), wide.errors.join("\n"));

  // 配图太大：要缩得太小才放得下
  const huge = await renderCardPng(browser, { lang: "zh", content: good, date: "2026-10-16", ledger: null, figureSvg: FAKE_SVG.replace("0 0 500 140", "0 0 2000 600") });
  assert.ok(huge.errors.some((e) => e.includes("配图太大")), huge.errors.join("\n"));

  // 缩放比例合格，但个别文字（如 boxes 固定 14px 的标签）缩放后低于下限
  const tiny = await renderCardPng(browser, { lang: "zh", content: good, date: "2026-10-16", ledger: null, figureSvg: FAKE_SVG.replace("0 0 500 140", "0 0 600 140").replace('font-size="22px">节点', 'font-size="14px">分组标签') });
  assert.ok(tiny.errors.some((e) => e.includes("配图里的字太小") && e.includes("分组标签")), tiny.errors.join("\n"));
});

const amScript = loadConfig(join(import.meta.dirname, "..")).amScript;
const skipAm = findChrome() && existsSync(amScript) ? false : "需要 Chrome 与 answer-me-with-html";
test("bakeFigures：am 烘焙出 SVG；布局错误按语言归位", { skip: skipAm }, () => {
  const work = mkdtempSync(join(tmpdir(), "rh-fig-"));
  const ok = bakeFigures(amScript, work, [{ lang: "zh", figure }]);
  assert.deepEqual(ok.get("zh")!.errors, []);
  assert.match(ok.get("zh")!.svg ?? "", /^<svg[^>]*viewBox=/);
  // 边标签太长放不下：am 报错，错误归到 en
  const tight = { caption: "x", excalidraw: { grid: { w: 200, h: 100 }, nodes: figure.excalidraw.nodes, edges: [{ from: "a", to: "b", label: "a very long edge label here" }] } };
  const bad = bakeFigures(amScript, work, [{ lang: "zh", figure }, { lang: "en", figure: tight }]);
  assert.deepEqual(bad.get("zh")!.errors, []);
  assert.match(bad.get("en")!.errors.join(), /配图：.*label/);
});

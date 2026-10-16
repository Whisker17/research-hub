import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { Browser } from "puppeteer-core";
import { stringify } from "yaml";
import {
  CARD_LIMITS,
  FIGURE_BOX,
  PNG_HASH_KEY,
  avoidedTerms,
  cardHash,
  cardHtml,
  cardPngState,
  displayWidth,
  fitFigure,
  hasWideChars,
  inlineMarkup,
  loadCard,
  parseCard,
  pngSize,
  readPngText,
  tweetLeadLength,
  tweetLength,
  tweetLimitError,
  withPngText,
  type CardContent,
} from "../cli/lib/card.ts";
import { bakeFigure, extractFigureSvg, figureDraft } from "../cli/lib/card-figure.ts";
import { renderCardPng } from "../cli/lib/card-render.ts";
import { findChrome, launchBrowser } from "../cli/lib/mobile.ts";
import { loadConfig } from "../lib/config.ts";

const figure = {
  caption: "What L1 covers, and what it leaves",
  excalidraw: { nodes: [{ id: "a", label: "Consensus", col: 0, row: 0, color: "green" }, { id: "b", label: "Multisig", col: 1, row: 0, color: "red" }] },
};
const FAKE_SVG =
  '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 140" style="width: 500px;"><rect x="10" y="10" width="480" height="120" fill="#cfc"/><text x="20" y="60" font-size="22px">Node</text></svg>';
const good: CardContent = {
  title: "Post-quantum: L1 upgrades do not cover all of L2",
  background: "A large quantum computer could break EVM signatures and curve-based SNARKs.",
  context: "Aztec just published its PQ roadmap.",
  figure,
  findings: [{ stat: "6/14", text: "Upgrade keys sit with a **6/14 multisig**." }, "State roots rest on one BN254 check."],
  takeaway: "Start now.",
  tweet: "Easy to miss: the L1 PQ target covers only the L1 protocol.\n\nLeft: what L2s inherit. Right: what each L2 migrates itself.",
};

// 1×1 透明 PNG
const PNG_1x1 = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);

test("displayWidth / hasWideChars：全角字符算 2，ASCII 算 1，**强调**记号不计", () => {
  assert.equal(displayWidth("abc"), 3);
  assert.equal(displayWidth("中文"), 4);
  assert.equal(displayWidth("**6/14** multisig"), 13);
  assert.equal(hasWideChars("ML-DSA ~37× – “quoted” → ok"), false, "×、–、弯引号、箭头都不是全角");
  assert.equal(hasWideChars("中"), true);
  assert.equal(hasWideChars("a，b"), true, "全角标点也算");
});

test("parseCard：合法卡片通过；字符串与 {stat,text} 两种发现写法都可以", () => {
  const r = parseCard({ quote: "https://x.com/a/status/1", ...good });
  assert.deepEqual(r.errors, []);
  assert.equal(r.card?.findings.length, 2);
  assert.equal(r.card?.quote, "https://x.com/a/status/1");
});

test("parseCard：深度控制——超长、条数、换行、未配对的强调、配图都被检查", () => {
  const errs = (c: Partial<CardContent>) => parseCard({ ...good, ...c }).errors.join("\n");
  assert.match(errs({ title: "x".repeat(CARD_LIMITS.title + 1) }), /title: 太长：57 个字符，上限 56/);
  assert.match(errs({ findings: ["only one"] }), /findings/);
  assert.match(errs({ findings: ["a", "b", "c", "d"] }), /findings/);
  assert.match(errs({ figure: undefined }), /figure/, "配图必填");
  assert.match(errs({ figure: { ...figure, excalidraw: { nodes: [{ id: "a", label: "x" }] } } }), /配图至少/);
  const many = Array.from({ length: CARD_LIMITS.figureNodesMax + 1 }, (_, i) => ({ id: `n${i}`, label: "x" }));
  assert.match(errs({ figure: { ...figure, excalidraw: { nodes: many } } }), /配图最多/);
  assert.match(errs({ figure: { caption: "c".repeat(CARD_LIMITS.caption + 1), excalidraw: figure.excalidraw } }), /figure\.caption: 太长/);
  assert.match(errs({ context: "line one\nline two" }), /不能换行/);
  assert.match(errs({ takeaway: "**unpaired" }), /没有配对/);
  assert.match(errs({ findings: [{ stat: "123456789", text: "x" }, "y"] }), /stat: 太长/);
  assert.match(parseCard({}).errors.join(), /title/);
  assert.match(parseCard({ ...good, quote: "http://x.com/a" }).errors.join(), /quote/);
  assert.match(parseCard({ ...good, extra: 1 }).errors.join(), /extra|Unrecognized/i);
  assert.match(parseCard({ zh: good, en: good }).errors.join(), /zh|en|Unrecognized/i, "旧的 zh / en 分语言写法不再接受");
});

test("parseCard：卡片只有英文版——任何字段（含配图标签、推文）出现中文都是错误；quote 不检查", () => {
  const errs = (c: Partial<CardContent>) => parseCard({ ...good, ...c }).errors.join("\n");
  assert.match(errs({ context: "Aztec 刚公布 PQ 路线" }), /context: 推特卡片只有英文版/);
  assert.match(errs({ figure: { ...figure, excalidraw: { nodes: [{ id: "a", label: "共识" }, { id: "b", label: "x" }] } } }), /figure: 推特卡片只有英文版/);
  assert.match(errs({ tweet: `${good.tweet}\n\n中文补充` }), /tweet: 推特卡片只有英文版/);
  assert.deepEqual(parseCard({ ...good, quote: "https://x.com/中文/status/1" }).errors.filter((e) => e.includes("英文版")), []);
});

test("cardHtml：转义 HTML，只把 **强调** 变成 <strong>；页脚是日期 + 水印；推文不画进图", () => {
  assert.equal(inlineMarkup("a<b> **c**"), "a&lt;b&gt; <strong>c</strong>");
  const html = cardHtml({ content: { ...good, title: "<script>x</script>" }, date: "2026-10-16", handle: "@whisker17", figureSvg: FAKE_SVG });
  assert.match(html, /<html lang="en">/);
  assert.doesNotMatch(html, /<script>x/);
  assert.match(html, /<footer><span class="date mono">2026-10-16<\/span><span class="handle">@whisker17<\/span><\/footer>/);
  assert.match(html, /<span class="eyebrow mono">Background<\/span><p>A large quantum/);
  assert.match(html, /<b class="stat">6\/14<\/b>/);
  assert.match(html, /<b class="idx">02<\/b>/, "没有 stat 的发现用序号");
  assert.match(html, /<figcaption class="cap">What L1 covers, and what it leaves<\/figcaption><svg [^>]*width="\d+" height="\d+">/);
  assert.doesNotMatch(html, /style="width: 500px;"/, "去掉 am 写死的宽度");
  assert.doesNotMatch(html, /Easy to miss/, "推文文案不画进图片");
  assert.match(cardHtml({ content: good, date: "2026-10-16", handle: "", figureSvg: null }), /class="fig-ph"[\s\S]*What we found/);
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

test("figureDraft / extractFigureSvg：一张图的 am 稿件；按 data-name 取回 SVG", () => {
  const draft = figureDraft({ ...figure, caption: 'say "hi"' });
  assert.match(draft, /```excalidraw q="say 'hi'" name=card-figure\n\{/);
  assert.match(draft, /\n```\n$/);
  const html = `<figure class="am-fig am-excal" data-name="card-figure"><div><svg viewBox="0 0 1 1">x</svg></div></figure>`;
  assert.equal(extractFigureSvg(html), '<svg viewBox="0 0 1 1">x</svg>');
  assert.equal(extractFigureSvg(html.replace("<svg viewBox=\"0 0 1 1\">x</svg>", "")), null);
});

test("tweetLength：与 X 的 twitter-text 计数一致——全角算 2、链接算 23（句末标点不算进链接）、emoji 序列算 2", () => {
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

test("推文文案：必填、至少 80、不能用 **；账号上限按 cardTweetMax 检查；第一段长度单独算", () => {
  const errs = (c: Partial<CardContent>) => parseCard({ ...good, ...c }).errors.join("\n");
  assert.equal(errs({}), "");
  assert.match(errs({ tweet: undefined }), /tweet/);
  assert.match(errs({ tweet: "too short" }), /推文太短/);
  assert.match(errs({ tweet: `${good.tweet} **bold**` }), /不要用 \*\*强调\*\*/);
  const long = `${"a".repeat(270)}\n\n${"b".repeat(200)}`;
  assert.equal(errs({ tweet: long }), "", "schema 只兜底 X 的硬上限，不按 280 拒绝会员长文");
  assert.match(tweetLimitError(long, 280) ?? "", /推文太长：X 计数 472，上限 280/);
  assert.equal(tweetLimitError(long, 1000), null);
  assert.equal(tweetLeadLength(long), 270);
});

test("cardHash：改推文 / 源推文链接不会让 PNG 过期；改画进图的内容或水印会", () => {
  assert.equal(cardHash({ ...good, tweet: `${good.tweet} more` }), cardHash(good));
  assert.equal(cardHash({ ...good, quote: "https://x.com/a/status/2" }), cardHash(good));
  assert.notEqual(cardHash({ ...good, takeaway: "Changed." }), cardHash(good));
  assert.notEqual(cardHash(good, "@whisker17"), cardHash(good, "@someone"));
});

test("avoidedTerms：卡片任何文字（含配图）出现要避免的词时返回，不区分大小写", () => {
  assert.deepEqual(avoidedTerms(good, ["Mantle"]), []);
  assert.deepEqual(avoidedTerms({ ...good, background: "Man**tle** roadmap" }, ["Mantle"]), ["Mantle"], "强调记号拆开的词也能发现");
  assert.deepEqual(avoidedTerms({ ...good, figure: { ...figure, excalidraw: { nodes: [{ id: "a", label: "MANTLE L2" }, { id: "b", label: "y" }] } } }, ["mantle", " "]), ["mantle"]);
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

test("loadCard / cardPngState：缺失、过期、最新三种状态；水印参与判断", () => {
  const dir = mkdtempSync(join(tmpdir(), "rh-card-"));
  assert.equal(loadCard(dir).exists, false);
  writeFileSync(join(dir, "card.yml"), "title: [");
  assert.match(loadCard(dir).errors.join(), /YAML/);
  writeFileSync(join(dir, "card.yml"), stringify(good));
  const { card } = loadCard(dir);
  assert.ok(card);
  assert.equal(cardPngState(dir, card, "@whisker17"), "missing");
  writeFileSync(join(dir, "card.png"), withPngText(PNG_1x1, PNG_HASH_KEY, "old"));
  assert.equal(cardPngState(dir, card, "@whisker17"), "stale");
  writeFileSync(join(dir, "card.png"), withPngText(PNG_1x1, PNG_HASH_KEY, cardHash(card, "@whisker17")));
  assert.equal(cardPngState(dir, card, "@whisker17"), "ok");
  assert.equal(cardPngState(dir, card, "@other"), "stale", "换水印要重新渲染");
});

const skip = findChrome() ? false : "没有 Chrome，跳过卡片渲染测试";
let browser: Browser;
before(async () => {
  if (!skip) browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
});

test("renderCardPng：1200×1500 PNG，带内容哈希；超出画布、数字放不下、配图过大、配图字太小都报错", { skip }, async () => {
  const base = { date: "2026-10-16", handle: "@whisker17" };
  const ok = await renderCardPng(browser, { ...base, content: good, figureSvg: FAKE_SVG });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(pngSize(ok.png), { width: 1200, height: 1500 });
  assert.equal(readPngText(ok.png, PNG_HASH_KEY), cardHash(good, "@whisker17"));
  assert.ok(ok.slack > 0);

  // 绕过 schema 直接塞满：每段都写到上限
  const tooMuch: CardContent = {
    title: "T".repeat(CARD_LIMITS.title),
    background: "bg ".repeat(CARD_LIMITS.background / 3),
    context: "cx ".repeat(CARD_LIMITS.context / 3),
    figure,
    findings: Array(3).fill("finding ".repeat(CARD_LIMITS.finding / 8)),
    takeaway: "tk ".repeat(CARD_LIMITS.takeaway / 3),
    tweet: good.tweet,
  };
  const bad = await renderCardPng(browser, { ...base, content: tooMuch, figureSvg: FAKE_SVG });
  assert.ok(bad.errors.some((e) => e.includes("超出画布")), bad.errors.join("\n"));

  // 绕过 schema 的超长数字：任何字体下都放不下一行（CI 上没有苹方 / SF）
  const wide = await renderCardPng(browser, { ...base, content: { ...good, findings: [{ stat: "1234567890123456", text: "x" }, "y"] }, figureSvg: FAKE_SVG });
  assert.ok(wide.errors.some((e) => e.includes("关键数字")), wide.errors.join("\n"));

  const huge = await renderCardPng(browser, { ...base, content: good, figureSvg: FAKE_SVG.replace("0 0 500 140", "0 0 2000 600") });
  assert.ok(huge.errors.some((e) => e.includes("配图太大")), huge.errors.join("\n"));

  // 缩放比例合格，但个别文字（如 boxes 固定 14px 的标签）缩放后低于下限
  const tiny = await renderCardPng(browser, { ...base, content: good, figureSvg: FAKE_SVG.replace("0 0 500 140", "0 0 600 140").replace('font-size="22px">Node', 'font-size="14px">Group label') });
  assert.ok(tiny.errors.some((e) => e.includes("配图里的字太小") && e.includes("Group label")), tiny.errors.join("\n"));
});

const amScript = loadConfig(join(import.meta.dirname, "..")).amScript;
const skipAm = findChrome() && existsSync(amScript) ? false : "需要 Chrome 与 answer-me-with-html";
test("bakeFigure：am 烘焙出 SVG；布局错误带上 am 的提示", { skip: skipAm }, () => {
  const work = mkdtempSync(join(tmpdir(), "rh-fig-"));
  const ok = bakeFigure(amScript, work, figure);
  assert.deepEqual(ok.errors, []);
  assert.match(ok.svg ?? "", /^<svg[^>]*viewBox=/);
  // 边标签太长放不下：am 报错
  const tight = { caption: "x", excalidraw: { grid: { w: 200, h: 100 }, nodes: figure.excalidraw.nodes, edges: [{ from: "a", to: "b", label: "a very long edge label here" }] } };
  const bad = bakeFigure(amScript, work, tight);
  assert.equal(bad.svg, null);
  assert.match(bad.errors.join(), /配图：.*label/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { BACK_LINK_ATTR, decorateReport, fingerprints, type DecorateOptions } from "../cli/lib/build.ts";
import type { Report } from "../lib/reports.ts";

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
  assert.match(html, /<figure data-rh-card-tweet><figcaption>推文文案 · X 计数 \d+ \/ 280<\/figcaption><p data-rh-card-tweet-text>第一行 &lt;b&gt;\n\n第二行 &amp; https:\/\/x\.com\/a<\/p><\/figure>/);
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

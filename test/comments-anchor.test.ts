/**
 * 评论锚定（ADR 0005 §5，cli/lib/comments-anchor.ts）：纯文本部分在 Node 里测，DOM 部分在无头 Chrome 里
 * 跑同一份源码（commentsAnchor.toString()，和评论层脚本内联的是同一份）。
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Browser, Page } from "puppeteer-core";
import { commentsAnchor } from "../cli/lib/comments-anchor.ts";
import { findChrome, launchBrowser } from "../cli/lib/mobile.ts";

const A = commentsAnchor();

test("find：唯一匹配；重复时用 prefix / suffix 消歧；仍有歧义或找不到是 -1", () => {
  const text = "alpha beta gamma. alpha beta delta.";
  assert.equal(A.find(text, { quote: "gamma", prefix: "", suffix: "" }), 11);
  assert.equal(A.find(text, { quote: "alpha beta", prefix: "", suffix: "" }), -1, "两处、没有上下文");
  assert.equal(A.find(text, { quote: "alpha beta", prefix: "gamma. ", suffix: " delta." }), 18);
  assert.equal(A.find(text, { quote: "alpha beta", prefix: "", suffix: " gamma" }), 0);
  assert.equal(A.find(text, { quote: "alpha beta", prefix: "x", suffix: "y" }), -1, "上下文都对不上");
  assert.equal(A.find(text, { quote: "omega", prefix: "", suffix: "" }), -1);
  assert.equal(A.find(text, { quote: "  ", prefix: "", suffix: "" }), -1, "空引文");
  // 保存的上下文首尾有没有空格都一样
  assert.equal(A.find(text, { quote: "alpha  beta", prefix: "gamma.", suffix: "delta." }), 18, "引文里的空白也规范化");
  // 重叠出现：aaa 里的 aa 有两处
  assert.equal(A.find("aaa", { quote: "aa", prefix: "", suffix: "" }), -1);
  assert.equal(A.find("aaa", { quote: "aa", prefix: "a", suffix: "" }), 1);
});

test("normalize：连续空白（含换行、制表、不换行空格）合成一个空格并去掉首尾", () => {
  assert.equal(A.normalize("  a \n\t b\u00a0\u00a0c  "), "a b c");
});

// ── DOM（无头 Chrome）─────────────────────────────────────────────────────────

const noChrome = findChrome() ? false : "没有 Chrome";
let browser: Browser;
let page: Page;
before(async () => {
  if (noChrome) return;
  browser = await launchBrowser();
  page = await browser.newPage();
});
after(() => browser?.close());

/** 在页面里装上锚定代码；run 在页面里执行（拿到 A 与 sel(…) 帮手），返回可序列化的结果。 */
async function inPage<T>(html: string, run: string): Promise<T> {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`);
  return page.evaluate(`(() => {
    const A = (${commentsAnchor.toString()})();
    const root = A.contentRoot(document);
    // 选中第 n 个（从 0 开始）包含 needle 的文本节点里的 needle 片段：[节点, 起点] → [节点, 终点]
    const textNodes = () => { const w = document.createTreeWalker(document.body, 4); const out = []; for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n); return out; };
    const point = (needle, nth = 0, end = false) => {
      let k = 0;
      for (const t of textNodes()) {
        let i = t.data.indexOf(needle);
        while (i >= 0) { if (k++ === nth) return [t, end ? i + needle.length : i]; i = t.data.indexOf(needle, i + 1); }
      }
      throw new Error("没有 " + needle);
    };
    const range = (a, b) => { const r = document.createRange(); r.setStart(...a); r.setEnd(...b); return r; };
    const where = (r) => r && { text: r.toString(), start: r.startContainer.parentNode.id || r.startContainer.parentNode.tagName, off: r.startOffset };
    ${run}
  })()`) as Promise<T>;
}

const T = { skip: noChrome };
/** 互不相同的汉字 */
const CJK = Array.from({ length: 1200 }, (_, i) => String.fromCharCode(0x4e00 + i)).join("");

test("DOM：重复的引文用 prefix / suffix 消歧，选中哪一处就定位回哪一处", T, async () => {
  const r = await inPage<unknown[]>(
    `<main><p id="a">alpha beta gamma.</p><p id="b">alpha beta delta.</p></main>`,
    `const s1 = A.capture(range(point("alpha beta", 1), point("alpha beta", 1, true)), root);
     const s0 = A.capture(range(point("alpha beta", 0), point("alpha beta", 0, true)), root);
     return [s1, where(A.locate(s1, root)), where(A.locate(s0, root)), A.locate({ quote: "alpha beta", prefix: "", suffix: "" }, root)];`,
  );
  assert.deepEqual(r[0], { quote: "alpha beta", prefix: "alpha beta gamma.", suffix: " delta.", heading: null }, "块之间没有空白文字时文本直接相连");
  assert.deepEqual(r[1], { text: "alpha beta", start: "b", off: 0 });
  assert.deepEqual(r[2], { text: "alpha beta", start: "a", off: 0 });
  assert.equal(r[3], null, "没有上下文的重复引文不猜");
});

test("DOM：跨行内元素的选区；按元素边界（整段）选中；标题", T, async () => {
  const r = await inPage<unknown[]>(
    `<article><h2>第一节</h2><p id="p">foo <b>bar</b> <i>baz</i> <a href="#">qux</a> end</p><h3>  第二节 <small>附</small></h3><p id="q">tail text</p></article>`,
    `const s = A.capture(range(point("bar"), [point("baz")[0], 2]), root);
     const p = document.getElementById("p"); const whole = document.createRange(); whole.selectNodeContents(p);
     const sq = A.capture(range(point("tail"), point("text", 0, true)), root);
     return [s, A.locate(s, root).toString(), A.capture(whole, root), A.locate(A.capture(whole, root), root).toString(), sq.heading];`,
  );
  assert.deepEqual(r[0], { quote: "bar ba", prefix: "第一节foo ", suffix: "z qux end 第二节 附tail text", heading: "第一节" });
  assert.equal(r[1], "bar ba");
  assert.equal((r[2] as { quote: string }).quote, "foo bar baz qux end");
  assert.equal(r[3], "foo bar baz qux end");
  assert.equal(r[4], "第二节 附", "最近的标题，空白规范化");
});

test("DOM：CJK 与 emoji（上下文按码点截取，不切开代理对）", T, async () => {
  const long = "前".repeat(40);
  const r = await inPage<unknown[]>(
    `<div class="am-doc-body"><p>${long}😀数据可用性采样是关键。</p><p>另一个数据可用性采样方案😀${"后".repeat(40)}</p></div>`,
    `const s = A.capture(range(point("数据可用性采样", 1), point("数据可用性采样", 1, true)), root);
     return [s, A.locate(s, root).toString(), A.locate({ quote: "数据可用性采样", prefix: "", suffix: "是关键" }, root).startContainer.data.startsWith("前")];`,
  );
  const s = r[0] as { quote: string; prefix: string; suffix: string };
  assert.equal(s.quote, "数据可用性采样");
  assert.equal(Array.from(s.prefix).length, 32);
  assert.equal(s.prefix, `${"前".repeat(17)}😀数据可用性采样是关键。另一个`);
  assert.equal(s.suffix, `方案😀${"后".repeat(29)}`);
  assert.equal(Array.from(s.suffix).length, 32);
  assert.equal(r[1], "数据可用性采样");
  assert.equal(r[2], true);
});

test("DOM：空白规范化；从空白中间起止的选区；未规范化的引文也能定位", T, async () => {
  const r = await inPage<unknown[]>(
    `<main><p id="w">  lots\n\n   of \t  space  </p></main>`,
    `const t = point("lots")[0];
     const s = A.capture(range([t, 1], [t, t.data.indexOf("space") - 1]), root);
     const loc = A.locate({ quote: "lots\\n of   space", prefix: "", suffix: "" }, root);
     return [s, loc.toString(), A.index(root).text];`,
  );
  assert.deepEqual(r[0], { quote: "lots of", prefix: "", suffix: " space", heading: null }, "选区两端的空白去掉");
  assert.equal(r[1], "lots\n\n   of \t  space");
  assert.equal(r[2], "lots of space");
});

test("DOM：代码块与 SVG 里的文字；script / style 与 data-rh-* 元素里的文字不算正文", T, async () => {
  const r = await inPage<unknown[]>(
    `<nav data-rh-back><a>Research Hub foo</a></nav><main><pre><code>const x = 1;\n  return x;</code></pre>` +
      `<svg width="100" height="40"><style>.n{fill:red}</style><text x="0" y="20" class="n">Node A</text><text x="50" y="20">Node B</text></svg>` +
      `<script>var hidden = "Node A";</script><span data-rh-comments>Node A</span><p>foo</p></main>`,
    `const code = A.capture(range(point("= 1;"), point("return", 0, true)), root);
     const svg = A.capture(range(point("Node A"), point("Node B", 0, true)), root);
     const shell = A.capture(range(point("Research"), point("Hub", 0, true)), document.body);
     return [code, A.locate(code, root).toString(), svg.quote, A.locate(svg, root).toString(), A.locate({ quote: "Node A", prefix: "", suffix: "" }, root) !== null, shell, A.index(root).text];`,
  );
  assert.deepEqual(r[0], { quote: "= 1; return", prefix: "const x ", suffix: " x;Node ANode Bfoo", heading: null });
  assert.equal(r[1], "= 1;\n  return");
  assert.equal(r[2], "Node ANode B");
  assert.equal(r[3], "Node ANode B");
  assert.equal(r[4], true, "script 与 data-rh-* 里的同样文字不造成重复");
  assert.equal(r[5], null, "外壳里的选区没有引文");
  assert.equal(r[6], "const x = 1; return x;Node ANode Bfoo");
});

test("DOM：找不到或改写过的引文是 null（失效）；正文根外的选区是 null；引文最多 1000 个码点", T, async () => {
  const r = await inPage<unknown[]>(
    `<header id="h">outside text</header><main><p id="m">${CJK.slice(0, 1200)} end</p></main>`,
    `const out = A.capture(range(point("outside"), point("text", 0, true)), root);
     const big = A.capture(range(point("${CJK[0]}"), point("end", 0, true)), root);
     return [out, A.locate({ quote: "not here", prefix: "", suffix: "" }, root), Array.from(big.quote).length, big.suffix.slice(0, 3), A.locate(big, root).toString().length];`,
  );
  assert.deepEqual(r.slice(0, 2), [null, null]);
  assert.equal(r[2], 1000);
  assert.equal(r[3], CJK.slice(1000, 1003), "suffix 接在截断后的引文后面");
  assert.equal(r[4], 1000);
});

test("DOM：正文根——恰好一个 .am-doc-body；否则恰好一个 article；否则恰好一个 main；否则 body", T, async () => {
  const root = (html: string) => inPage<string>(html, "return root.id || root.tagName;");
  assert.equal(await root(`<article id="x"></article><div class="am-doc-body" id="d"><article></article></div>`), "d");
  assert.equal(await root(`<main id="m"><article id="a"></article></main>`), "a");
  assert.equal(await root(`<main id="m"><article></article><article></article></main>`), "m");
  assert.equal(await root(`<div class="am-doc-body"></div><div class="am-doc-body"></div><p>x</p>`), "BODY");
});

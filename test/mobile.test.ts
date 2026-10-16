import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { join } from "node:path";
import type { Browser } from "puppeteer-core";
import { checkMobile, findChrome, launchBrowser } from "../cli/lib/mobile.ts";

const FIX = join(import.meta.dirname, "fixtures", "mobile");
const skip = findChrome() ? false : "没有 Chrome，跳过手机检查测试";
let browser: Browser;

before(async () => {
  if (!skip) browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
});

const run = (name: string) => checkMobile(browser, join(FIX, name), null);

test("正常页面通过；容器内横向滚动的宽表格不算溢出", { skip }, async () => {
  const r = await run("good.html");
  assert.deepEqual(r.failures, []);
  assert.ok(r.metrics.bodyWidth! >= 300);
  assert.equal(r.metrics.bodyFont, 16);
});

test("② 正文被侧栏挤窄（research 模板 77px 问题）", { skip }, async () => {
  const r = await run("collapsed.html");
  assert.ok(r.failures.some((f) => f.startsWith("② 正文容器过窄")), r.failures.join("\n"));
});

test("① 页面横向溢出", { skip }, async () => {
  const r = await run("overflow.html");
  assert.ok(r.failures.some((f) => f.startsWith("① 横向溢出")), r.failures.join("\n"));
});

test("① overflow-x:hidden 藏起来的越界内容（被裁掉）", { skip }, async () => {
  const r = await run("clipped.html");
  assert.ok(r.failures.some((f) => f.startsWith("① 内容被裁掉")), r.failures.join("\n"));
});

test("③ 正文字号过小", { skip }, async () => {
  const r = await run("smallfont.html");
  assert.ok(r.failures.some((f) => f.startsWith("③ 正文字号过小")), r.failures.join("\n"));
});

test("④ fixed 元素压住正文", { skip }, async () => {
  const r = await run("fixed.html");
  assert.ok(r.failures.some((f) => f.startsWith("④ fixed 元素 div.bar")), r.failures.join("\n"));
});

test("缺少 viewport meta", { skip }, async () => {
  const r = await run("noviewport.html");
  assert.ok(r.failures.some((f) => f.includes("viewport")), r.failures.join("\n"));
});

test("返回链接：被 am 工具栏盖住时报错；decorateReport 对 am 页面会把链接与语言切换放到工具栏下方", { skip }, async () => {
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { decorateReport } = await import("../cli/lib/build.ts");
  const dir = mkdtempSync(join(tmpdir(), "rh-back-"));
  const P = "<p>这是一段足够长的正文段落，用来测量手机上正文容器的宽度与字号，它需要超过二十个字符。</p>";
  // 与 answer-me-with-html 相同：窄屏上工具栏 absolute，位于页面右上角，几乎占满一行。
  // 按钮宽度写死，避免 CI 上缺中文字体时工具栏变窄。
  const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;font:15px/1.6 sans-serif}.am-toolbar{position:absolute;top:12px;right:12px;display:flex;gap:6px}.am-toolbar button{box-sizing:border-box;width:118px;font:12px/1 sans-serif;padding:7px 10px;background:#fff;border:1px solid #ccc}main{padding:56px 12px 24px}</style></head><body><div class="am-toolbar"><button>主题：图纸</button><button>明暗：跟随系统</button><button>复制源稿</button></div><main>${P}${P}</main></body></html>`;
  const naive = page.replace("<body>", '<body><nav data-rh-back style="display:block;padding:12px 16px 0;font:14px/1.5 sans-serif"><a href="/">← Research Hub</a></nav>');
  writeFileSync(join(dir, "naive.html"), naive);
  writeFileSync(join(dir, "fixed.html"), decorateReport(page, { backHref: "/", backLabel: "Research Hub", lang: "zh", altHref: "./en/", card: { src: "card.png" } }));
  const bad = await checkMobile(browser, join(dir, "naive.html"), null);
  assert.ok(bad.failures.some((f) => f.includes("返回链接") && f.includes("盖住")), bad.failures.join("\n"));
  const good = await checkMobile(browser, join(dir, "fixed.html"), null);
  assert.deepEqual(good.failures, []);
});

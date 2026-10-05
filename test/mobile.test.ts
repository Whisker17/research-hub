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

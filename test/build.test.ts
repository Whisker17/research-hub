import assert from "node:assert/strict";
import { test } from "node:test";
import { BACK_LINK_ATTR, fingerprints, injectBackLink } from "../cli/lib/build.ts";
import type { Report } from "../lib/reports.ts";

const page = '<!doctype html><html><head><meta charset="utf-8"></head><body class="x"><h1>T</h1></body></html>';

test("injectBackLink：插在 <body> 开头，补 robots，幂等", () => {
  const once = injectBackLink(page, "/", "Research Hub");
  assert.match(once, /<body class="x"><nav data-rh-back[^>]*><a href="\/"[^>]*>← Research Hub<\/a><\/nav><h1>/);
  assert.match(once, /<head><meta name="robots" content="noindex, nofollow">/);
  assert.equal(injectBackLink(once, "/", "Research Hub"), once);
  assert.equal(once.split(BACK_LINK_ATTR).length, 2);
});

test("injectBackLink：不改页面样式；只有 am 页面带一条作用于 nav 自身的样式", () => {
  const plain = injectBackLink(page, "/p/", "Research Hub");
  assert.doesNotMatch(plain, /<style/);
  const am = injectBackLink(page.replace("<h1>", '<div class="am-toolbar"></div><h1>'), "/p/", "Research Hub");
  const styles = am.match(/<style>[^<]*<\/style>/g) ?? [];
  assert.equal(styles.length, 1);
  assert.match(styles[0], /^<style>@media \(max-width:760px\)\{nav\[data-rh-back\]\{[^}]*\}\}<\/style>$/);
});

test("injectBackLink：没有 <body> 时报错；href 会转义", () => {
  assert.throws(() => injectBackLink("<html></html>", "/", "x"));
  assert.match(injectBackLink(page, '/"x', "a<b"), /href="\/&quot;x"[^>]*>← a&lt;b/);
});

test("injectBackLink：传入 altLangLink 时在导航栏右侧注入语言切换链接", () => {
  const withLang = injectBackLink(page, "/", "Research Hub", { href: "./en/", label: "English" });
  assert.match(withLang, /<a href="\.\/en\/"[^>]*>English<\/a>/);
  assert.match(withLang, /justify-content:space-between/);
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

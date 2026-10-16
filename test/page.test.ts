/**
 * 报告页注入脚本的浏览器测试：推特卡片模式里的“复制文案”。
 * 强制 Clipboard API 失败，检查降级路径（am 页面与非 am 页面）真的能复制；降级也失败时不能谎报“已复制”。
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import type { Browser, Page } from "puppeteer-core";
import { decorateReport } from "../cli/lib/build.ts";
import { findChrome, launchBrowser } from "../cli/lib/mobile.ts";

const skip = findChrome() ? false : "没有 Chrome，跳过页面脚本测试";
let browser: Browser;
before(async () => {
  if (!skip) browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
});

const TWEET = "第一段：分界在哪里。\n\n第二段：怎么读图。";
const head = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>';
const PAGES = {
  am:
    head +
    '<body><div class="am-toolbar"><button>主题</button></div><main class="am-research"><header class="am-head"><h1>T</h1></header>' +
    '<div class="am-paths"><span>阅读路径</span><button class="am-btn" data-am-path="deep">完整</button></div><section><p>正文</p></section></main></body></html>',
  plain: `${head}<body><h1>T</h1><p>正文</p></body></html>`,
};

async function open(kind: keyof typeof PAGES, stub: { writeText: boolean; execCommand: boolean }): Promise<Page> {
  const dir = mkdtempSync(join(tmpdir(), "rh-page-"));
  const file = join(dir, `${kind}.html`);
  writeFileSync(file, decorateReport(PAGES[kind], { backHref: "/", backLabel: "Research Hub", lang: "zh", card: { src: "card.png", tweet: TWEET } }));
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((s: { writeText: boolean; execCommand: boolean }) => {
    const w = window as unknown as { __copied: string | null };
    w.__copied = null;
    if (!s.writeText) {
      Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) }, configurable: true });
    }
    // 记录降级路径复制出去的内容：execCommand("copy") 时当前选中的文本
    document.execCommand = ((cmd: string) => {
      if (cmd !== "copy" || !s.execCommand) return false;
      const el = document.activeElement as HTMLTextAreaElement | null;
      w.__copied = el && "value" in el ? el.value.slice(el.selectionStart, el.selectionEnd) : String(getSelection());
      return true;
    }) as typeof document.execCommand;
  }, stub);
  await page.goto(`${pathToFileURL(file).href}#tweet-card`, { waitUntil: "load" });
  return page;
}

for (const kind of ["am", "plain"] as const) {
  test(`复制文案：Clipboard API 失败时降级复制成功（${kind} 页面，卡片模式隐藏正文也不影响）`, { skip }, async () => {
    const page = await open(kind, { writeText: false, execCommand: true });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.rhView), "card");
    await page.click("[data-rh-card-copy-text]");
    await page.waitForFunction(() => document.querySelector("[data-rh-card-copy-text]")?.textContent === "已复制 ✓");
    assert.equal(await page.evaluate(() => (window as unknown as { __copied: string }).__copied), TWEET);
    assert.equal(await page.evaluate(() => (document.querySelector("[data-rh-card-msg]") as HTMLElement).hidden), true);
    assert.equal(await page.evaluate(() => document.querySelectorAll("[data-rh-card] textarea").length), 0, "临时 textarea 用完即删");
    await page.close();
  });

  test(`复制文案：降级也失败时提示手动复制并选中文字，不显示“已复制”（${kind} 页面）`, { skip }, async () => {
    const page = await open(kind, { writeText: false, execCommand: false });
    await page.click("[data-rh-card-copy-text]");
    await page.waitForFunction(() => !(document.querySelector("[data-rh-card-msg]") as HTMLElement).hidden);
    const state = await page.evaluate(() => ({
      btn: document.querySelector("[data-rh-card-copy-text]")?.textContent,
      msg: document.querySelector("[data-rh-card-msg]")?.textContent,
      selected: String(getSelection()),
    }));
    assert.equal(state.btn, "复制文案");
    assert.match(state.msg ?? "", /没能自动复制文案/);
    assert.equal(state.selected.replace(/\r/g, ""), TWEET);
    await page.close();
  });
}

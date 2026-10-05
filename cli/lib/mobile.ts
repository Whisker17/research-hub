/**
 * 手机检查（规格 §6.2）：用本机 Chrome 无头模式，在 390×844 手机视口下检查单文件 HTML。
 *
 *  1. 页面没有横向溢出；宽表格 / 宽图只允许在自己的滚动容器里横向滚动（不能被裁掉）。
 *  2. 正文容器宽度 ≥ 300px（正文段落按字数加权的中位宽度）。
 *  3. 正文字号 ≥ 14px（正文段落按字数加权的中位字号）。
 *  4. 没有 fixed 元素长期遮挡正文（在 25% / 50% / 75% 滚动位置检查与正文的重叠）。
 *  5. 输出全页截图（过高时分段）。
 *
 * 另外要求页面声明 <meta name="viewport" content="width=device-width…">，
 * 否则手机浏览器会按 980px 桌面宽度缩小显示，上面的检查也就失去意义。
 */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser } from "puppeteer-core";

export const MOBILE_CHECK_VERSION = 2;
export const VIEWPORT = { width: 390, height: 844 } as const;
export const MIN_BODY_WIDTH = 300;
export const MIN_FONT_PX = 14;
/** 单张截图的最大高度（CSS px）；更高的页面分段截图。 */
const SHOT_SEGMENT = 8000;

export interface MobileMetrics {
  /** 注入的返回链接被哪个元素盖住（没有返回链接或没被盖住时为 null） */
  backLinkCovered: string | null;
  viewportMeta: string | null;
  innerWidth: number;
  scrollWidth: number;
  bodyWidth: number | null;
  bodyFont: number | null;
  textBlocks: number;
  clipped: { tag: string; text: string; left: number; right: number }[];
  overlays: { at: string; tag: string; desc: string; text: string }[];
  pageHeight: number;
}

export interface MobileResult {
  ok: boolean;
  failures: string[];
  warnings: string[];
  metrics: MobileMetrics;
  shots: string[];
}

const CHROME_CANDIDATES: Record<string, string[]> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ],
  linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
  win32: ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"],
};

export function findChrome(): string | null {
  const explicit = process.env.RH_CHROME || process.env.AM_CHROME || process.env.CHROME;
  if (explicit) return existsSync(explicit) ? explicit : null;
  return (CHROME_CANDIDATES[process.platform] ?? []).find((p) => existsSync(p)) ?? null;
}

export async function launchBrowser(): Promise<Browser> {
  const executablePath = findChrome();
  if (!executablePath) throw new Error("没有找到 Chrome / Chromium；设置环境变量 RH_CHROME=/path/to/chrome");
  const puppeteer = await import("puppeteer-core");
  return puppeteer.default.launch({
    executablePath,
    headless: true,
    args: ["--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--disable-gpu", ...(process.env.CI ? ["--no-sandbox"] : [])],
  });
}

/** 在页面里运行的测量函数（会被序列化到浏览器执行，不能引用外部变量）。 */
function measureInPage(expectedWidth: number): Omit<MobileMetrics, "overlays" | "pageHeight"> {
  const SKIP = "table, figure, pre, nav, svg, [aria-hidden='true'], .am-toc, .am-fig, .am-toolbar, [data-rh-back]";
  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0;
  };
  const text = (el: Element): string => (el.textContent ?? "").replace(/\s+/g, " ").trim();

  // 正文段落：p / li（排除表格、图、代码、导航等）
  const blocks: { w: number; f: number; n: number }[] = [];
  for (const el of Array.from(document.querySelectorAll("p, li"))) {
    if (el.closest(SKIP)) continue;
    if (el.tagName === "LI" && el.querySelector("p, li")) continue; // 只计最内层
    const t = text(el);
    if (t.length < 20 || !visible(el)) continue;
    blocks.push({ w: el.getBoundingClientRect().width, f: parseFloat(getComputedStyle(el).fontSize), n: t.length });
  }
  const weightedMedian = (key: "w" | "f"): number | null => {
    if (!blocks.length) return null;
    const sorted = [...blocks].sort((a, b) => a[key] - b[key]);
    const total = sorted.reduce((s, b) => s + b.n, 0);
    let acc = 0;
    for (const b of sorted) {
      acc += b.n;
      if (acc >= total / 2) return Math.round(b[key] * 10) / 10;
    }
    return sorted[sorted.length - 1][key];
  };

  // 被裁掉的内容：超出视口、且不在可横向滚动的容器里。
  // 手机模拟下，内容过宽时 Chrome 会把布局视口撑宽（innerWidth 变大、页面整体缩小），
  // 所以一律和设备宽度比较，而不是 innerWidth。
  const vw = expectedWidth;
  const clipped: MobileMetrics["clipped"] = [];
  const inScroller = (el: Element): boolean => {
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const ox = getComputedStyle(a).overflowX;
      if ((ox === "auto" || ox === "scroll") && a.getBoundingClientRect().right <= vw + 1) return true;
    }
    return false;
  };
  const reported: Element[] = [];
  for (const el of Array.from(document.querySelectorAll("p, li, h1, h2, h3, h4, td, th, dd, dt, blockquote, pre, img, svg, table, figure, canvas, video, iframe"))) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue; // 屏幕阅读器专用的隐藏元素
    if (r.right <= vw + 1 && r.left >= -1) continue;
    if (inScroller(el)) continue;
    // 只报告最外层的越界元素
    if (reported.some((p) => p.contains(el))) continue;
    reported.push(el);
    clipped.push({ tag: el.tagName.toLowerCase(), text: text(el).slice(0, 40), left: Math.round(r.left), right: Math.round(r.right) });
    if (clipped.length >= 5) break;
  }

  // 注入的返回链接必须可见、可点（不被工具栏等元素盖住）
  let backLinkCovered: string | null = null;
  const back = document.querySelector("[data-rh-back] a");
  if (back) {
    const r = back.getBoundingClientRect();
    for (const [x, y] of [[r.left + 2, r.top + r.height / 2], [r.left + r.width / 2, r.top + r.height / 2], [r.right - 2, r.top + r.height / 2]]) {
      const hit = document.elementFromPoint(x, y);
      if (hit && !back.contains(hit) && !hit.contains(back)) {
        backLinkCovered = `${hit.tagName.toLowerCase()}${hit.className && typeof hit.className === "string" ? `.${hit.className.trim().split(/\s+/).join(".")}` : ""}`;
        break;
      }
    }
  }

  return {
    backLinkCovered,
    viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? null,
    innerWidth: window.innerWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
    bodyWidth: weightedMedian("w"),
    bodyFont: weightedMedian("f"),
    textBlocks: blocks.length,
    clipped,
  };
}

/** 当前滚动位置下，fixed 元素是否压在正文上。 */
function overlaysInPage(at: string): MobileMetrics["overlays"] {
  const out: MobileMetrics["overlays"] = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const fixed = Array.from(document.querySelectorAll("body *")).filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh;
  });
  if (!fixed.length) return out;
  const textEls = Array.from(document.querySelectorAll("p, li, h1, h2, h3, h4, td, dd, dt, blockquote")).filter((el) => {
    if (fixed.some((f) => f.contains(el))) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && (el.textContent ?? "").trim().length > 0;
  });
  for (const f of fixed) {
    if (fixed.some((o) => o !== f && o.contains(f))) continue;
    const fr = f.getBoundingClientRect();
    const hit = textEls.find((t) => {
      const r = t.getBoundingClientRect();
      return r.left < fr.right && r.right > fr.left && r.top < fr.bottom && r.bottom > fr.top;
    });
    if (hit) {
      const desc = `${f.tagName.toLowerCase()}${f.id ? `#${f.id}` : ""}${f.classList.length ? `.${Array.from(f.classList).join(".")}` : ""}`;
      out.push({ at, tag: f.tagName.toLowerCase(), desc, text: (hit.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40) });
    }
  }
  return out;
}

export async function checkMobile(browser: Browser, htmlFile: string, shotDir: string | null): Promise<MobileResult> {
  const page = await browser.newPage();
  try {
    await page.setViewport({ ...VIEWPORT, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load", timeout: 60_000 });
    await page.evaluate(() => document.fonts?.ready);
    await new Promise((r) => setTimeout(r, 400));

    const base = await page.evaluate(measureInPage, VIEWPORT.width);
    const pageHeight = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0));
    const overlays: MobileMetrics["overlays"] = [];
    for (const frac of [0.25, 0.5, 0.75]) {
      const y = Math.max(0, Math.round((pageHeight - VIEWPORT.height) * frac));
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await new Promise((r) => setTimeout(r, 120));
      overlays.push(...(await page.evaluate(overlaysInPage, `${Math.round(frac * 100)}%`)));
    }
    await page.evaluate(() => window.scrollTo(0, 0));

    const metrics: MobileMetrics = { ...base, overlays, pageHeight };
    const failures: string[] = [];
    const warnings: string[] = [];

    if (!metrics.viewportMeta || !/width\s*=\s*device-width/.test(metrics.viewportMeta)) {
      failures.push('缺少 <meta name="viewport" content="width=device-width, initial-scale=1">：手机会按桌面宽度缩小显示');
    }
    if (metrics.scrollWidth > VIEWPORT.width + 1 || metrics.innerWidth > VIEWPORT.width + 1) {
      failures.push(`① 横向溢出：页面宽 ${Math.max(metrics.scrollWidth, metrics.innerWidth)}px > 视口 ${VIEWPORT.width}px（宽表格 / 宽图应在自己的容器里横向滚动）`);
    }
    for (const c of metrics.clipped) {
      failures.push(`① 内容被裁掉：<${c.tag}>「${c.text}」位于 ${c.left}–${c.right}px，超出视口且不在可滚动容器里`);
    }
    if (metrics.bodyWidth === null) {
      warnings.push("② / ③ 没有找到可测量的正文段落（p / li），跳过正文宽度与字号检查");
    } else {
      if (metrics.bodyWidth < MIN_BODY_WIDTH) failures.push(`② 正文容器过窄：${metrics.bodyWidth}px < ${MIN_BODY_WIDTH}px`);
      if (metrics.bodyFont !== null && metrics.bodyFont < MIN_FONT_PX) failures.push(`③ 正文字号过小：${metrics.bodyFont}px < ${MIN_FONT_PX}px`);
    }
    if (metrics.backLinkCovered) failures.push(`返回链接“← Research Hub”被 ${metrics.backLinkCovered} 盖住`);
    const seen = new Set<string>();
    for (const o of metrics.overlays) {
      if (seen.has(o.desc)) continue;
      seen.add(o.desc);
      failures.push(`④ fixed 元素 ${o.desc} 在 ${o.at} 滚动位置压住正文「${o.text}」`);
    }

    const shots: string[] = [];
    if (shotDir) {
      rmSync(shotDir, { recursive: true, force: true });
      mkdirSync(shotDir, { recursive: true });
      const segments = Math.max(1, Math.ceil(pageHeight / SHOT_SEGMENT));
      for (let i = 0; i < segments; i++) {
        const file = join(shotDir, segments === 1 ? "mobile-390.png" : `mobile-390-${String(i + 1).padStart(2, "0")}.png`);
        const height = Math.min(SHOT_SEGMENT, pageHeight - i * SHOT_SEGMENT);
        await page.screenshot({ path: file as `${string}.png`, clip: { x: 0, y: i * SHOT_SEGMENT, width: VIEWPORT.width, height }, captureBeyondViewport: true });
        shots.push(file);
      }
    }
    return { ok: failures.length === 0, failures, warnings, metrics, shots };
  } finally {
    await page.close();
  }
}

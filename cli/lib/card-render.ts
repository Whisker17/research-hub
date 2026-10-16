/**
 * 推特卡片渲染：在本机 Chrome 里按固定画布排版 card.yml，截成 PNG（×2），并检查内容有没有超出画布。
 * 超出就是失败：卡片是“一眼看完”的格式，放不下说明写多了，要删减而不是缩小字号。
 */
import type { Browser } from "puppeteer-core";
import { CARD_SIZE, FIGURE_BOX, PNG_HASH_KEY, cardHash, cardHtml, fitFigure, withPngText, type CardRenderInput } from "./card.ts";

export interface CardRenderResult {
  png: Buffer;
  /** 超出画布等排版错误；非空时不应写出 PNG */
  errors: string[];
  /** 结论块上方剩余的空白（CSS px），供写稿时参考 */
  slack: number;
}

/** 在页面里运行（会被序列化，不能引用外部变量）。 */
function measureCard(): { overflowY: number; slack: number; wide: string[]; tallStats: string[]; figureFonts: { text: string; px: number }[] } {
  const card = document.querySelector("[data-card-root]") as HTMLElement;
  const cr = card.getBoundingClientRect();
  const padBottom = parseFloat(getComputedStyle(card).paddingBottom);
  const footer = card.querySelector("footer") as HTMLElement;
  const overflowY = Math.max(0, Math.ceil(footer.getBoundingClientRect().bottom - (cr.bottom - padBottom)));
  const list = card.querySelector("ol") as HTMLElement;
  const take = card.querySelector(".take") as HTMLElement;
  const slack = Math.max(0, Math.round(take.getBoundingClientRect().top - list.getBoundingClientRect().bottom - 12));
  const maxRight = cr.right - parseFloat(getComputedStyle(card).paddingRight) + 1;
  const wide: string[] = [];
  for (const el of Array.from(card.querySelectorAll("h1, p, li, .stat, figcaption, footer, footer span"))) {
    const h = el as HTMLElement;
    const r = h.getBoundingClientRect();
    if (r.width === 0) continue;
    if ((h.clientWidth > 0 && h.scrollWidth > h.clientWidth + 1) || r.right > maxRight) wide.push((h.textContent ?? "").trim().slice(0, 30));
  }
  const tallStats: string[] = [];
  for (const el of Array.from(card.querySelectorAll(".stat"))) {
    const h = el as HTMLElement;
    if (h.getBoundingClientRect().height > parseFloat(getComputedStyle(h).lineHeight) * 1.5) tallStats.push((h.textContent ?? "").trim());
  }
  // 配图里每段文字缩放后的实际字号（font-size × 渲染宽度 / viewBox 宽度）
  const figureFonts: { text: string; px: number }[] = [];
  const svg = card.querySelector(".fig svg") as SVGSVGElement | null;
  const vbw = svg?.viewBox?.baseVal?.width;
  if (svg && vbw) {
    const k = svg.getBoundingClientRect().width / vbw;
    for (const t of Array.from(svg.querySelectorAll("text"))) {
      const size = parseFloat(t.getAttribute("font-size") ?? getComputedStyle(t).fontSize);
      const s = (t.textContent ?? "").trim();
      if (s && size) figureFonts.push({ text: s, px: Math.round(size * k * 10) / 10 });
    }
  }
  return { overflowY, slack, wide, tallStats, figureFonts };
}

export async function renderCardPng(browser: Browser, input: CardRenderInput): Promise<CardRenderResult> {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: CARD_SIZE.width, height: CARD_SIZE.height, deviceScaleFactor: CARD_SIZE.scale });
    await page.setContent(cardHtml(input), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const m = await page.evaluate(measureCard);
    const errors: string[] = [];
    const fig = input.figureSvg ? fitFigure(input.figureSvg) : null;
    if (input.figureSvg && !fig) errors.push("配图 SVG 没有 viewBox，无法排进卡片");
    if (fig && fig.scale < FIGURE_BOX.minScale) {
      errors.push(
        `配图太大：要缩到 ${Math.round(fig.scale * 100)}% 才放得下（下限 ${FIGURE_BOX.minScale * 100}%），图里的字会看不清。减少列数 / 行数，或缩小 grid（卡片上的图区约 ${FIGURE_BOX.width}×${FIGURE_BOX.height}，即原图约 ${Math.round(FIGURE_BOX.width / FIGURE_BOX.minScale)}×${Math.round(FIGURE_BOX.height / FIGURE_BOX.minScale)} 以内）`,
      );
    }
    const small = m.figureFonts.filter((f) => f.px < FIGURE_BOX.minFontPx);
    if (small.length) {
      const list = small.slice(0, 4).map((f) => `“${f.text}” ${f.px}px`).join("、");
      errors.push(
        `配图里的字太小（卡片上至少 ${FIGURE_BOX.minFontPx}px，否则在手机信息流里看不清）：${list}。把图画得更扁更窄、节点 fontSize 加大；分组标题不要用 boxes 的 label（固定 14px），改用 texts 并写 fontSize`,
      );
    }
    if (m.overflowY > 0) {
      errors.push(`内容超出画布 ${m.overflowY}px：删掉一条发现、把各段压到 1–2 行，或把配图画得更扁（不要缩小字号）`);
    }
    for (const t of m.wide) errors.push(`横向放不下：“${t}…”（有过长的不可断开单词或数字）`);
    for (const t of m.tallStats) errors.push(`关键数字“${t}”放不下一行：换一个更短的数字（如 6/14、~20×、$1.2B），或去掉 stat`);
    const shot = Buffer.from(
      await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: CARD_SIZE.width, height: CARD_SIZE.height } }),
    );
    return { png: withPngText(shot, PNG_HASH_KEY, cardHash(input.content, input.handle)), errors, slack: m.slack };
  } finally {
    await page.close();
  }
}

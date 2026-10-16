/**
 * 推特卡片（一图速览）：card.yml → 4:5 PNG（card.png）。只有英文版：推特统一用英文发。
 *
 * 用途：在 X 上引用（quote）一条源推文时，直接贴一张图，让刷推的人一眼看完本次调研。
 * 深度控制有两层：
 *  1. schema：固定的版块（背景 / 现状 / 发现 / 结论）、条数与每段的显示宽度上限（见 CARD_LIMITS）；
 *  2. 渲染：rh card 在固定画布上排版，内容超出画布就失败（cli/lib/card-render.ts）。
 * 本模块是纯函数（schema、宽度计算、HTML 模板、PNG 元数据），不启动浏览器。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import twitter from "twitter-text";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { REPORT_FILES } from "../../lib/reports.ts";
import { formatZodIssues } from "../../lib/schema.ts";

/** 卡片画布（CSS px）。导出 PNG 时 ×2，即 1200×1500（4:5，X 手机端单图不裁切）。 */
export const CARD_SIZE = { width: 600, height: 750, scale: 2 } as const;

/**
 * 显示宽度上限（英文字符数；万一混进全角字符按 2 计）。
 * 正文一行约 50 个字符；发现一栏有数字列时约 42 个字符一行。
 */
export const CARD_LIMITS = {
  title: 56, // 标题：≤ 2 行
  background: 104, // 背景：≤ 2 行
  context: 104, // 现状 / 触发事件：≤ 2 行
  finding: 76, // 每条发现：≤ 2 行（有配图时通常只放得下 2 条）
  stat: 8, // 发现前的关键数字（渲染时还要求放得下一行）
  takeaway: 96, // 结论：≤ 2 行
  caption: 44, // 配图的一句话说明：≤ 1 行
  findingsMin: 2,
  findingsMax: 3,
  figureNodesMin: 2,
  figureNodesMax: 8,
  tweetMin: 80, // 推文文案（X 的加权长度）：太短就只是复述图片
  tweetFold: 280, // 信息流折叠点：超过它显示“显示更多”；也是非会员单条上限（rh.config.json 的 cardTweetMax 默认值）
  tweetHardMax: 25000, // X 会员长文的硬上限（schema 只做这层兜底，账号上限按 cardTweetMax 检查）
} as const;

/**
 * X 发推框的加权长度：直接用 X 开源的 twitter-text（v3 配置）计数——汉字等算 2，Latin 算 1，
 * 链接（含不带协议的域名，句末标点不算进链接）算 23，emoji 序列算 2。不自己复刻这些规则。
 */
export function tweetLength(s: string): number {
  return twitter.parseTweet(s).weightedLength;
}

const tweetText = z
  .string()
  .trim()
  .refine((s) => tweetLength(s) <= CARD_LIMITS.tweetHardMax, {
    error: (iss) => `推文太长：X 计数 ${tweetLength(String(iss.input))}，超过 X 的上限 ${CARD_LIMITS.tweetHardMax}`,
  })
  .refine((s) => tweetLength(s) >= CARD_LIMITS.tweetMin, {
    error: (iss) => `推文太短：X 计数 ${tweetLength(String(iss.input))}，至少 ${CARD_LIMITS.tweetMin}。文案要帮读者读懂图片，不只是一句标题`,
  })
  .refine((s) => !/\*\*/.test(s), { message: "推文里不要用 **强调**：X 不支持 Markdown，会原样显示星号" });

/**
 * 配图（Excalidraw 手绘图，由 answer-me-with-html 烘焙成 SVG）在卡片上的位置：
 * 宽度 FIGURE_BOX.width、高度不超过 FIGURE_BOX.height。缩放后图里任何一段文字小于 minFontPx（卡片坐标，
 * 约等于手机信息流里 9.6px）就算失败：卡片上的图要不点开就能读。
 */
export const FIGURE_BOX = { width: 508, height: 132, minScale: 0.62, maxScale: 1.1, minFontPx: 16 } as const;

/** 显示宽度：东亚宽字符算 2，其余算 1；**强调** 记号不计。 */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s.replace(/\*\*/g, "")) {
    const cp = ch.codePointAt(0)!;
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0x303f) ||
      (cp >= 0x3040 && cp <= 0x33ff) ||
      (cp >= 0x3400 && cp <= 0x4dbf) ||
      (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0xa960 && cp <= 0xa97f) ||
      (cp >= 0xac00 && cp <= 0xd7af) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1faff) ||
      (cp >= 0x20000 && cp <= 0x3fffd);
    w += wide ? 2 : 1;
  }
  return w;
}

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((s) => displayWidth(s) <= max, {
      error: (iss) => `太长：${displayWidth(String(iss.input))} 个字符，上限 ${max}`,
    })
    .refine((s) => !/\n/.test(s), { message: "不能换行：卡片按版块排版，一段只写一句或两句" })
    .refine((s) => (s.match(/\*\*/g) ?? []).length % 2 === 0, { message: "**强调** 记号没有配对" });

export const findingSchema = z.union([
  text(CARD_LIMITS.finding),
  z.strictObject({ stat: text(CARD_LIMITS.stat).optional(), text: text(CARD_LIMITS.finding) }),
]);

/** am 的 excalidraw 规格（完整语法：am help excalidraw）。这里只卡节点数量，布局问题由 am 渲染时检查。 */
export const figureSpecSchema = z.looseObject({
  nodes: z
    .array(z.looseObject({ id: z.string().min(1), label: z.string() }))
    .min(CARD_LIMITS.figureNodesMin, { message: `配图至少 ${CARD_LIMITS.figureNodesMin} 个节点` })
    .max(CARD_LIMITS.figureNodesMax, { message: `配图最多 ${CARD_LIMITS.figureNodesMax} 个节点：卡片上的图要一眼看懂` }),
});

export const figureSchema = z.strictObject({
  /** 图的一句话说明（图回答的问题或结论），显示在图的左上角 */
  caption: text(CARD_LIMITS.caption),
  /** Excalidraw 规格：与 explainer 里 ```excalidraw 代码块的 JSON 相同，可以写成 YAML */
  excalidraw: figureSpecSchema,
});

/** 有没有中日韩等全角字符（卡片与推文只用英文）。 */
export const hasWideChars = (s: string): boolean => displayWidth(s) !== [...s.replace(/\*\*/g, "")].length;

export const cardSchema = z.strictObject({
  /** 要引用的源推文（可选）。只在页面的卡片模式里显示为链接，不画进图片。 */
  quote: z.url({ protocol: /^https$/, message: "quote 必须是 https 链接（源推文地址）" }).optional(),
  /** 卡片标题：主题 + 结论的钩子，不必等于报告标题 */
  title: text(CARD_LIMITS.title),
  /** 背景：不了解这个领域的人需要知道的一件事（是什么、为什么重要） */
  background: text(CARD_LIMITS.background),
  /** 现状：这次为什么值得看（源推文说了什么 / 最近发生了什么） */
  context: text(CARD_LIMITS.context),
  /** 配图：一张 Excalidraw 手绘图，把最关键的一条发现画出来 */
  figure: figureSchema,
  /** 调研发现：2–3 条，每条一个可核对的论断，可带一个关键数字 */
  findings: z.array(findingSchema).min(CARD_LIMITS.findingsMin).max(CARD_LIMITS.findingsMax),
  /** 结论：一句 so-what */
  takeaway: text(CARD_LIMITS.takeaway),
  /** 配图片发的推文文案（纯文本，可多行）：解释图、补图里放不下的前提与限定。不画进图片 */
  tweet: tweetText,
  /** 卡片页脚日期（YYYY-MM-DD）；不写时用渲染当天的 meta.updated */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "日期格式必须是 YYYY-MM-DD" }).optional(),
}).superRefine((c, ctx) => {
  // 推特统一用英文发：卡片任何文字（含配图标签）和推文都不能有中文
  const { quote: _q, ...rest } = c;
  for (const [key, value] of Object.entries(rest)) {
    if (hasWideChars(JSON.stringify(value))) {
      ctx.addIssue({ code: "custom", path: [key], message: "推特卡片只有英文版：这里有中文（或其他全角）字符" });
    }
  }
});

export type CardContent = z.infer<typeof cardSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type FigureSpec = z.infer<typeof figureSchema>;

/** 把烘焙好的 SVG 放进卡片的配图区：按 viewBox 等比缩放，返回缩放后的尺寸。 */
export function fitFigure(svg: string): { scale: number; width: number; height: number; svg: string } | null {
  const open = /<svg\b[^>]*>/.exec(svg);
  const vb = open && /viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/.exec(open[0]);
  if (!open || !vb) return null;
  const [w, h] = [Number(vb[1]), Number(vb[2])];
  const scale = Math.min(FIGURE_BOX.width / w, FIGURE_BOX.height / h, FIGURE_BOX.maxScale);
  const width = Math.round(w * scale);
  const height = Math.round(h * scale);
  const tag = open[0].replace(/\s(width|height|style)="[^"]*"/g, "").replace(/>$/, ` width="${width}" height="${height}">`);
  return { scale, width, height, svg: tag + svg.slice(open.index + open[0].length) };
}

export const normFinding = (f: Finding): { stat?: string; text: string } => (typeof f === "string" ? { text: f } : f);

export function parseCard(data: unknown): { card: CardContent | null; errors: string[] } {
  const parsed = cardSchema.safeParse(data ?? {});
  if (!parsed.success) return { card: null, errors: formatZodIssues(parsed.error) };
  return { card: parsed.data, errors: [] };
}

/** 推文文案超过账号上限（rh.config.json 的 cardTweetMax）时的错误信息；不超过时为 null。 */
export function tweetLimitError(tweet: string, max: number): string | null {
  const n = tweetLength(tweet);
  if (n <= max) return null;
  return `推文太长：X 计数 ${n}，上限 ${max}（rh.config.json 的 cardTweetMax；汉字算 2、英文算 1、链接算 23）`;
}

/** 推文第一段（信息流折叠前能看到的部分）的 X 计数。 */
export function tweetLeadLength(tweet: string): number {
  return tweetLength(tweet.split(/\n\s*\n/)[0] ?? "");
}

/** 卡片里出现的“要避免的词”（不区分大小写；包括配图里的文字）。 */
export function avoidedTerms(content: CardContent, terms: string[]): string[] {
  // 去掉 **强调** 记号再匹配：Man**tle** 渲染出来仍是 Mantle
  const all = JSON.stringify(content).replace(/\*\*/g, "").toLowerCase();
  return terms.filter((t) => t.trim() && all.includes(t.trim().toLowerCase()));
}

/** 卡片内容的哈希：写进 PNG，rh check 用它判断 card.yml（或水印）改过之后有没有重新渲染。 */
export function cardHash(content: CardContent, handle = ""): string {
  // 推文文案与源推文链接不画进图片：改它们不会让 PNG 过期；水印画进了图片，换水印要重新渲染
  const { tweet: _tweet, quote: _quote, ...drawn } = content;
  return createHash("sha256").update(JSON.stringify({ drawn, handle })).digest("hex").slice(0, 16);
}

// ── HTML 模板 ───────────────────────────────────────────────

export interface CardRenderInput {
  content: CardContent;
  /** 卡片日期（YYYY-MM-DD） */
  date: string;
  /** 页脚右侧的水印（rh.config.json 的 cardHandle，如 @whisker17）；空字符串时只显示日期 */
  handle: string;
  /** 烘焙好的配图 SVG（am 生成）；为 null 时画一个占位框（只用于测试） */
  figureSvg: string | null;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 只支持 **强调**：其余一律转义。 */
export const inlineMarkup = (s: string): string => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

const L = { background: "Background", context: "Context", findings: "What we found", takeaway: "Bottom line" } as const;

/** 卡片的完整 HTML 文档（固定画布，交给 Chrome 截图）。 */
export function cardHtml(input: CardRenderInput): string {
  const { content, date, handle } = input;
  const fig = input.figureSvg ? fitFigure(input.figureSvg) : null;
  const figHtml = fig ? fig.svg : `<div class="fig-ph" style="width:${FIGURE_BOX.width}px;height:${FIGURE_BOX.height}px"></div>`;
  const findings = content.findings.map(normFinding);
  const hasStat = findings.some((f) => f.stat);
  const items = findings
    .map((f, i) => {
      const lead = f.stat ? `<b class="stat">${inlineMarkup(f.stat)}</b>` : `<b class="idx">${String(i + 1).padStart(2, "0")}</b>`;
      return `<li>${lead}<p>${inlineMarkup(f.text)}</p></li>`;
    })
    .join("");
  const { width, height } = CARD_SIZE;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${width}px;height:${height}px;background:#0a1322}
body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue","PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Microsoft YaHei",sans-serif;color:#dbe4f0;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.card{position:relative;width:${width}px;height:${height}px;overflow:hidden;padding:28px 36px 20px;display:flex;flex-direction:column;
  background:
    radial-gradient(120% 70% at 100% 0%,rgba(56,189,248,.16),transparent 60%),
    linear-gradient(rgba(148,197,255,.05) 1px,transparent 1px) 0 0/24px 24px,
    linear-gradient(90deg,rgba(148,197,255,.05) 1px,transparent 1px) 0 0/24px 24px,
    #0a1322}
.card::before{content:"";position:absolute;inset:0 0 auto 0;height:4px;background:linear-gradient(90deg,#38bdf8,#818cf8 55%,#fbbf24)}
p{text-wrap:pretty}
.mono{font-family:"SF Mono",ui-monospace,Menlo,"JetBrains Mono",monospace}
header{display:flex;justify-content:space-between;align-items:center;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#7dd3fc}
header .date{color:#64748b;letter-spacing:.06em}
h1{margin:0 0 10px;font-size:30px;line-height:1.22;text-wrap:balance;font-weight:700;color:#f8fafc;letter-spacing:-.01em}
.ctx{display:flex;flex-direction:column;gap:8px}
.ctx .item{padding:1px 0 1px 13px;border-left:3px solid var(--c)}
.ctx .bg{--c:#7dd3fc}
.ctx .cx{--c:#c4b5fd}
.ctx .eyebrow{display:block;margin-bottom:1px;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--c)}
.ctx p{font-size:18px;line-height:1.45;color:#c3cfdf}
.fig{margin-top:10px;padding:7px 10px 5px;border-radius:10px;background:#f7f3ea;box-shadow:inset 0 0 0 1px rgba(255,255,255,.6);display:flex;flex-direction:column;align-items:center}
.fig .cap{align-self:flex-start;margin:0 0 2px 2px;font-size:13px;line-height:1.4;font-weight:600;color:#334155}
.fig svg{display:block;max-width:100%}
.fig-ph{border:2px dashed #cbd5e1;border-radius:8px}
h2{margin:10px 0 6px;font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#94a3b8}
ol{list-style:none;display:flex;flex-direction:column;gap:8px}
li{display:grid;grid-template-columns:${hasStat ? "104px" : "34px"} minmax(0,1fr);gap:12px;align-items:baseline;padding-bottom:8px;border-bottom:1px dashed rgba(148,197,255,.14)}
li:last-child{border-bottom:0;padding-bottom:0}
li p{font-size:19px;line-height:1.42;color:#e2e8f0}
.stat{font-size:23px;line-height:1.1;font-weight:800;color:#fbbf24;font-variant-numeric:tabular-nums;letter-spacing:-.01em;overflow-wrap:anywhere}
.idx{font:600 14px/1.6 "SF Mono",ui-monospace,Menlo,monospace;color:#38bdf8}
strong{color:#fff;font-weight:700;background:linear-gradient(transparent 62%,rgba(251,191,36,.32) 62%)}
.take .eyebrow{display:block;margin-bottom:2px;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6ee7b7}
.take{margin-top:auto;padding:9px 15px 10px;border-radius:10px;border:1px solid rgba(52,211,153,.45);background:linear-gradient(90deg,rgba(16,185,129,.16),rgba(16,185,129,.05))}
.take p{font-size:19px;line-height:1.42;font-weight:600;color:#f0fdf4}
footer{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:9px;white-space:nowrap}
footer .date{font-size:13px;letter-spacing:.06em;color:#64748b}
footer .handle{font-size:15px;font-weight:700;letter-spacing:.01em;color:#e2e8f0;opacity:.82}
.gap{flex:0 0 12px}
</style>
</head>
<body>
<main class="card" data-card-root>
<h1>${inlineMarkup(content.title)}</h1>
<section class="ctx">
<div class="item bg"><span class="eyebrow mono">${escapeHtml(L.background)}</span><p>${inlineMarkup(content.background)}</p></div>
<div class="item cx"><span class="eyebrow mono">${escapeHtml(L.context)}</span><p>${inlineMarkup(content.context)}</p></div>
</section>
<figure class="fig" data-fig-scale="${fig ? fig.scale.toFixed(3) : "1"}"><figcaption class="cap">${inlineMarkup(content.figure.caption)}</figcaption>${figHtml}</figure>
<h2 class="mono">${escapeHtml(L.findings)}</h2>
<ol>${items}</ol>
<div class="gap"></div>
<section class="take"><span class="eyebrow mono">${escapeHtml(L.takeaway)}</span><p>${inlineMarkup(content.takeaway)}</p></section>
<footer><span class="date mono">${escapeHtml(date)}</span><span class="handle">${escapeHtml(handle)}</span></footer>
</main>
</body>
</html>
`;
}

// ── PNG 元数据（tEXt 块） ───────────────────────────────────

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const PNG_HASH_KEY = "rh-card-hash";

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([head, td, crc]);
}

/** 在 IHDR 之后插入一个 tEXt 块（已存在同名键时先移除）。 */
export function withPngText(png: Buffer, key: string, value: string): Buffer {
  if (!png.subarray(0, 8).equals(PNG_SIG)) throw new Error("不是 PNG 文件");
  const parts: Buffer[] = [PNG_SIG];
  let off = 8;
  let inserted = false;
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString("latin1", off + 4, off + 8);
    const end = off + 12 + len;
    const data = png.subarray(off + 8, off + 8 + len);
    const isOurs = type === "tEXt" && data.toString("latin1").startsWith(`${key}\0`);
    if (!isOurs) parts.push(png.subarray(off, end));
    if (type === "IHDR" && !inserted) {
      parts.push(chunk("tEXt", Buffer.from(`${key}\0${value}`, "latin1")));
      inserted = true;
    }
    off = end;
  }
  return Buffer.concat(parts);
}

export function readPngText(png: Buffer, key: string): string | null {
  if (png.length < 8 || !png.subarray(0, 8).equals(PNG_SIG)) return null;
  let off = 8;
  while (off + 8 <= png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString("latin1", off + 4, off + 8);
    if (type === "tEXt") {
      const data = png.toString("latin1", off + 8, off + 8 + len);
      if (data.startsWith(`${key}\0`)) return data.slice(key.length + 1);
    }
    if (type === "IEND") break;
    off += 12 + len;
  }
  return null;
}

/** PNG 的像素尺寸（IHDR）。 */
export function pngSize(png: Buffer): { width: number; height: number } | null {
  if (png.length < 24 || !png.subarray(0, 8).equals(PNG_SIG)) return null;
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

// ── 读取报告里的卡片 ─────────────────────────────────────────

export interface LoadedCard {
  /** card.yml 是否存在 */
  exists: boolean;
  card: CardContent | null;
  errors: string[];
}

export function loadCard(dir: string): LoadedCard {
  const file = join(dir, REPORT_FILES.card);
  if (!existsSync(file)) return { exists: false, card: null, errors: [] };
  let data: unknown;
  try {
    data = parseYaml(readFileSync(file, "utf8"));
  } catch (e) {
    return { exists: true, card: null, errors: [`YAML 解析失败：${(e as Error).message.split("\n")[0]}`] };
  }
  return { exists: true, ...parseCard(data) };
}

/**
 * 卡片 PNG 的状态：missing（没渲染）、stale（card.yml 改过之后没重新渲染）、ok。
 */
export function cardPngState(dir: string, content: CardContent, handle = ""): "missing" | "stale" | "ok" {
  const file = join(dir, REPORT_FILES.cardPng);
  if (!existsSync(file)) return "missing";
  return readPngText(readFileSync(file), PNG_HASH_KEY) === cardHash(content, handle) ? "ok" : "stale";
}

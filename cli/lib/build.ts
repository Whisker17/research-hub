/**
 * 构建产物组装（规格 §5）：
 *
 *   .astro-dist/          Astro 生成的索引页（含 /p/ 私有索引）
 *        │
 *        ├─► dist/public/   公开站点：索引、标签、归档、/r/<slug>/（public + published）
 *        └─► dist/private/  私有站点：/p/ 私有索引、/p/<slug>/（private + published）
 *
 * Astro 顶层产物按 ASTRO_OUTPUT 清单分发（ADR 0003 §4）：清单外的顶层产物让构建失败，不再默认进公开站点。
 * draft 不进入任何产物。报告 HTML 原样复制，只注入站点外壳（decorateReport）：返回链接、
 * 中文 / EN 切换、推特卡片模式（文档流内、无 fixed、样式只作用于注入的元素），并在 <head> 补 robots noindex。
 * 推特卡片 PNG（card.png，只有英文版）复制到 <slug>/card.png 与 <slug>/en/card.png，并生成列表缩略图 <slug>/thumb.png。
 * 最后做泄漏检查：公开产物里不能出现任何私有报告或 draft 的标题、摘要、路径，只用于非公开报告的标签描述，
 * 以及调用方登记的内部数据（如 Daily 的状态与内部清单字段）。
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { crc32, deflateSync, inflateSync } from "node:zlib";
import { REPORT_FILES, isPublicPublished, isPublished, type Report } from "../../lib/reports.ts";
import type { TagRegistry } from "../../lib/schema.ts";
import { THUMB_FILE, type Site } from "../../lib/site-data.ts";
import { loadCard, tweetLength } from "./card.ts";

export const BACK_LINK_ATTR = "data-rh-back";
/** 推特卡片模式在地址栏里的锚点：带上它打开页面就直接进入卡片模式（切换语言时保留）。 */
export const CARD_ANCHOR = "tweet-card";

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type PageLang = "zh" | "en";

export interface DecorateOptions {
  /** 返回索引页的链接 */
  backHref: string;
  backLabel: string;
  /** 这一页的语言 */
  lang: PageLang;
  /** 另一种语言版本的相对地址（中文页 ./en/，英文页 ../）；没有另一版本时不显示语言切换 */
  altHref?: string;
  /** 推特卡片：PNG 的相对地址与要引用的源推文；没有卡片时不出现卡片模式 */
  card?: { src: string; quote?: string; tweet?: string };
}

const UI: Record<PageLang, Record<string, string>> = {
  zh: {
    langGroup: "语言 / Language",
    cardBtn: "推特卡片",
    cardAria: "推特卡片：本次调研的一图速览",
    copy: "复制图片",
    busy: "复制中…",
    done: "已复制 ✓",
    fail: "这个浏览器不允许直接复制图片：右键（手机上长按）图片 → 拷贝图片。",
    failText: "没能自动复制文案：上面的文字已经选中，按 ⌘C / Ctrl+C 复制。",
    quote: "打开源推文 ↗",
    hint: "在 X 上引用源推文，粘贴（⌘V / Ctrl+V）即可附上这张图。",
    hintTweet: "在 X 上引用源推文：先复制文案粘贴，再复制图片粘贴（⌘V / Ctrl+V）。",
    copyText: "复制文案",
    tweetLabel: "推文文案",
    count: "X 计数",
    fold: "（会员长文：信息流中约 280 字符后折叠为“显示更多”）",
  },
  en: {
    langGroup: "Language / 语言",
    cardBtn: "Tweet card",
    cardAria: "Tweet card: this research at a glance",
    copy: "Copy image",
    busy: "Copying…",
    done: "Copied ✓",
    fail: "This browser can't copy images directly: right-click (long-press on a phone) the image → Copy image.",
    failText: "Couldn't copy the text automatically: it is selected above; press ⌘C / Ctrl+C.",
    quote: "Open source tweet ↗",
    hint: "Quote the source tweet on X and paste (⌘V / Ctrl+V) to attach this image.",
    hintTweet: "Quote the source tweet on X: copy and paste the text, then copy and paste the image (⌘V / Ctrl+V).",
    copyText: "Copy text",
    tweetLabel: "Tweet text",
    count: "X count",
    fold: " (Premium long post: folds under “Show more” at around 280 characters)",
  },
};

/**
 * 注入的样式只作用于注入的元素（data-rh-*），外加卡片模式下隐藏正文的一条规则；不改报告自身的排版。
 * am 页面：语言切换在桌面放进右上角工具栏，在窄屏（工具栏占满一行）放在返回链接那一行的右侧。
 */
function injectedStyle(o: { amToolbar: boolean; amPaths: boolean; lang: boolean; card: boolean }): string {
  const font = `var(--font-sans,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif)`;
  const langRules = [
    `[data-rh-lang]{display:inline-flex;align-items:stretch;flex:none;border:1px solid var(--line-2,rgba(127,127,127,.45));border-radius:var(--radius,6px);overflow:hidden;background:var(--paper,transparent);font:12px/1 ${font}}`,
    `[data-rh-lang]>*{display:flex;align-items:center;padding:7px 10px;color:var(--ink,inherit);text-decoration:none;opacity:1}`,
    `[data-rh-lang]>a:hover{background:var(--line-2,rgba(127,127,127,.15))}`,
    `[data-rh-lang]>[aria-current]{background:var(--head-bg,#16181d);color:var(--head-fg,#fff);font-weight:600}`,
  ];
  const cardRules = [
    `[data-rh-card][hidden],[data-rh-card-msg][hidden]{display:none!important}`,
    `[data-rh-card]{max-width:620px;margin:0 0 28px}`,
    `[data-rh-card-bar]{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 12px}`,
    `[data-rh-card-bar] .am-btn,[data-rh-card-bar]>a,[data-rh-card-bar]>button{font:13px/1 ${font};padding:9px 14px;border-radius:var(--radius,6px);border:1px solid var(--line-2,rgba(127,127,127,.45));background:var(--paper,transparent);color:var(--ink,inherit);text-decoration:none;cursor:pointer}`,
    `[data-rh-card-bar]>[data-rh-card-copy]{background:var(--head-bg,#16181d);color:var(--head-fg,#fff);border-color:var(--head-bg,#16181d);font-weight:600}`,
    `[data-rh-card-bar]>[data-rh-card-copy]:disabled{opacity:.6;cursor:default}`,
    `[data-rh-card-hint]{flex:1 1 220px;font:13px/1.5 ${font};color:var(--ink-3,#888)}`,
    `[data-rh-card-msg]{margin:0 0 12px;font:14px/1.5 ${font};color:var(--warn,#b45309)}`,
    `[data-rh-card-tweet]{margin:0 0 14px;padding:12px 14px;border:1px solid var(--line-2,rgba(127,127,127,.35));border-radius:12px;background:var(--paper,transparent)}`,
    `[data-rh-card-tweet]>figcaption{margin:0 0 6px;font:12px/1.4 ${font};color:var(--ink-3,#888)}`,
    `[data-rh-card-tweet-text]{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.6 ${font};color:var(--ink,inherit)}`,
    `[data-rh-card-img]{display:block;width:100%;height:auto;border-radius:12px;border:1px solid var(--line-2,rgba(127,127,127,.35));box-shadow:0 10px 30px rgba(0,0,0,.18)}`,
    o.amPaths
      ? `html[data-rh-view="card"] .am-research>:not(.am-paths):not([data-rh-card]){display:none!important}`
      : `html[data-rh-view="card"] body>:not([${BACK_LINK_ATTR}]):not([data-rh-card]):not(.am-toolbar):not(script):not(style){display:none!important}`,
  ];
  const rules = [...(o.lang ? langRules : []), ...(o.card ? cardRules : [])];
  if (o.amToolbar) {
    // 窄屏上 am 工具栏是 absolute（页面右上角，几乎占满一行）：返回链接那一行挪到工具栏下方
    rules.push(`@media (max-width:760px){nav[${BACK_LINK_ATTR}]{padding-top:50px!important}${o.lang ? ".am-toolbar>[data-rh-lang]{display:none}" : ""}}`);
    if (o.lang) rules.push(`@media (min-width:761px){nav[${BACK_LINK_ATTR}] [data-rh-lang]{display:none}}`);
  }
  return rules.length ? `<style data-rh-style>${rules.join("")}</style>` : "";
}

function langToggle(lang: PageLang, altHref: string, ui: Record<string, string>): string {
  const cur = (l: PageLang, label: string) => `<span aria-current="page" lang="${l === "zh" ? "zh-CN" : "en"}">${label}</span>`;
  const link = (l: PageLang, label: string) =>
    `<a href="${escapeHtml(altHref)}" hreflang="${l === "zh" ? "zh-CN" : "en"}" lang="${l === "zh" ? "zh-CN" : "en"}" data-rh-lang-to="${l}">${label}</a>`;
  const zh = lang === "zh" ? cur("zh", "中文") : link("zh", "中文");
  const en = lang === "en" ? cur("en", "EN") : link("en", "EN");
  return `<span data-rh-lang role="group" aria-label="${escapeHtml(ui.langGroup)}">${zh}${en}</span>`;
}

function cardSection(card: NonNullable<DecorateOptions["card"]>, ui: Record<string, string>): string {
  const quote = card.quote
    ? `<a data-rh-card-quote href="${escapeHtml(card.quote)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ui.quote)}</a>`
    : "";
  return (
    `<section data-rh-card hidden aria-label="${escapeHtml(ui.cardAria)}">` +
    `<div data-rh-card-bar>` +
    (card.tweet
      ? `<button type="button" data-rh-card-copy-text data-label="${escapeHtml(ui.copyText)}" data-done="${escapeHtml(ui.done)}">${escapeHtml(ui.copyText)}</button>`
      : "") +
    `<button type="button" data-rh-card-copy data-label="${escapeHtml(ui.copy)}" data-busy="${escapeHtml(ui.busy)}" data-done="${escapeHtml(ui.done)}">${escapeHtml(ui.copy)}</button>` +
    `${quote}<span data-rh-card-hint>${escapeHtml(card.tweet ? ui.hintTweet : ui.hint)}</span></div>` +
    `<p data-rh-card-msg role="status" hidden data-fail-img="${escapeHtml(ui.fail)}" data-fail-text="${escapeHtml(ui.failText)}">${escapeHtml(ui.fail)}</p>` +
    (card.tweet
      ? `<figure data-rh-card-tweet><figcaption>${escapeHtml(ui.tweetLabel)} · ${escapeHtml(ui.count)} ${tweetLength(card.tweet)}${tweetLength(card.tweet) > 280 ? escapeHtml(ui.fold) : ""}</figcaption><p data-rh-card-tweet-text>${escapeHtml(card.tweet)}</p></figure>`
      : "") +
    `<img data-rh-card-img src="${escapeHtml(card.src)}" width="1200" height="1500" alt="${escapeHtml(ui.cardAria)}" loading="lazy" decoding="async">` +
    `</section>`
  );
}

/**
 * 页面脚本：
 *  - 语言切换：记住选择（与索引页共用 localStorage 的 rh_lang），并带上当前锚点（面板 id 两种语言相同）。
 *  - 卡片模式：与 am 的阅读路径按钮互斥；地址栏锚点 #tweet-card；复制图片用 Clipboard API（需要 https 或 localhost）。
 */
const PAGE_SCRIPT = `<script data-rh-script>(()=>{
const root=document.documentElement,A="${CARD_ANCHOR}";
for(const a of document.querySelectorAll("[data-rh-lang-to]"))a.addEventListener("click",e=>{
try{localStorage.setItem("rh_lang",a.dataset.rhLangTo)}catch{}
if(location.hash){e.preventDefault();location.href=a.getAttribute("href")+location.hash}});
const sec=document.querySelector("[data-rh-card]"),btn=document.querySelector("[data-rh-card-btn]");
if(!sec||!btn)return;
const paths=[...document.querySelectorAll("[data-am-path]")];
const set=(on,url)=>{
sec.hidden=!on;btn.setAttribute("aria-pressed",String(on));
if(on){root.dataset.rhView="card";paths.forEach(b=>b.setAttribute("aria-pressed","false"));window.scrollTo(0,0)}
else{delete root.dataset.rhView;paths.forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.amPath===root.dataset.path)))}
if(url)history.replaceState(null,"",location.pathname+location.search+(on?"#"+A:""))};
btn.addEventListener("click",()=>set(btn.getAttribute("aria-pressed")!=="true",true));
paths.forEach(b=>b.addEventListener("click",()=>{if(root.dataset.rhView==="card")set(false,true)}));
if(location.hash==="#"+A)set(true,false);
const copy=sec.querySelector("[data-rh-card-copy]"),img=sec.querySelector("[data-rh-card-img]"),msg=sec.querySelector("[data-rh-card-msg]");
const say=k=>{msg.textContent=msg.dataset[k];msg.hidden=false};
const ct=sec.querySelector("[data-rh-card-copy-text]"),tw=sec.querySelector("[data-rh-card-tweet-text]");
if(ct&&tw)ct.addEventListener("click",async()=>{
const t=tw.textContent;let ok=false;msg.hidden=true;
try{await navigator.clipboard.writeText(t);ok=true}catch{
// 降级：临时 textarea 放在卡片区里（卡片模式下可见）并移到屏幕外，不能用 display:none，否则选不中
const a=document.createElement("textarea");a.value=t;a.setAttribute("readonly","");a.style.cssText="position:absolute;left:-9999px;top:0;opacity:0";sec.append(a);a.select();
try{ok=document.execCommand("copy")}catch{}a.remove()}
if(ok){ct.textContent=ct.dataset.done;setTimeout(()=>{ct.textContent=ct.dataset.label},2200);return}
const r=document.createRange();r.selectNodeContents(tw);const s=getSelection();s.removeAllRanges();s.addRange(r);say("failText")});
copy.addEventListener("click",async()=>{
const label=copy.dataset.label;msg.hidden=true;
try{
if(!navigator.clipboard||!navigator.clipboard.write||typeof ClipboardItem==="undefined")throw new Error("unsupported");
copy.disabled=true;copy.textContent=copy.dataset.busy;
const blob=fetch(img.currentSrc||img.src,{credentials:"same-origin"}).then(r=>{if(!r.ok)throw new Error(String(r.status));return r.blob()}).then(b=>b.type==="image/png"?b:new Blob([b],{type:"image/png"}));
await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]);
copy.textContent=copy.dataset.done;setTimeout(()=>{copy.textContent=label},2200)
}catch(e){copy.textContent=label;say("failImg")}
finally{copy.disabled=false}})})();</script>`;

/**
 * 部署前给报告 HTML 加上站点外壳。幂等（已注入过的页面原样返回）。
 *  - <body> 开头：返回链接；有另一种语言版本时，右侧是中文 / EN 切换（窄屏）。
 *  - am 工具栏开头：中文 / EN 切换（桌面，右上角）。
 *  - am 阅读路径末尾：“推特卡片”按钮；路径条下方：卡片区（默认隐藏）。非 am 页面放在返回链接那一行。
 *  - <head>：robots noindex。
 */
export function decorateReport(html: string, opts: DecorateOptions): string {
  let out = html;
  if (!out.includes(BACK_LINK_ATTR)) {
    const body = /<body\b[^>]*>/i.exec(out);
    if (!body) throw new Error("HTML 没有 <body> 标签，无法注入返回链接");
    const ui = UI[opts.lang];
    const toolbar = /<div class="am-toolbar"[^>]*>/.exec(out);
    const pathsOpen = /<div class="am-paths"[^>]*>/.exec(out);
    const pathsClose = pathsOpen ? out.indexOf("</div>", pathsOpen.index) : -1;
    const amPaths = pathsOpen !== null && pathsClose > 0;
    const toggle = opts.altHref ? langToggle(opts.lang, opts.altHref, ui) : "";
    const cardBtn = opts.card ? `<button class="am-btn" type="button" data-rh-card-btn aria-pressed="false">${escapeHtml(ui.cardBtn)}</button>` : "";
    const section = opts.card ? cardSection(opts.card, ui) : "";

    const right = `${amPaths ? "" : cardBtn}${toggle}`;
    const nav =
      `<nav ${BACK_LINK_ATTR} style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0;padding:12px 16px 0;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif;">` +
      `<a href="${escapeHtml(opts.backHref)}" style="color:inherit;opacity:.72;text-decoration:none;">← ${escapeHtml(opts.backLabel)}</a>` +
      (right ? `<span style="display:flex;gap:8px;align-items:center;">${right}</span>` : "") +
      `</nav>`;

    // 从后往前插入，前面的下标不受影响
    const inserts: [number, string][] = [[body.index + body[0].length, nav + (amPaths ? "" : section)]];
    if (toolbar && toggle) inserts.push([toolbar.index + toolbar[0].length, toggle]);
    if (amPaths && opts.card) {
      inserts.push([pathsClose, cardBtn]);
      inserts.push([pathsClose + "</div>".length, section]);
    }
    const closeBody = out.search(/<\/body>/i);
    if (opts.card || opts.altHref) inserts.push([closeBody >= 0 ? closeBody : out.length, PAGE_SCRIPT]);
    const head = /<head\b[^>]*>/i.exec(out);
    const style = injectedStyle({ amToolbar: Boolean(toolbar), amPaths, lang: Boolean(toggle), card: Boolean(opts.card) });
    if (head) inserts.push([head.index + head[0].length, style]);
    else inserts[0][1] = style + inserts[0][1];
    inserts.sort((a, b) => b[0] - a[0]);
    for (const [at, text] of inserts) out = out.slice(0, at) + text + out.slice(at);
  }
  if (!/<meta[^>]+name=["']robots["']/i.test(out)) {
    const h = /<head\b[^>]*>/i.exec(out);
    if (h) out = out.slice(0, h.index + h[0].length) + `<meta name="robots" content="noindex, nofollow">` + out.slice(h.index + h[0].length);
  }
  return out;
}

/** 一篇报告某种语言的部署版 HTML（rh build 与 rh check 的手机检查共用，保证检查的就是上线的页面）。 */
export function deployedReportHtml(r: Report, lang: PageLang): string {
  const file = join(r.dir, lang === "zh" ? REPORT_FILES.html : REPORT_FILES.htmlEn);
  const other = join(r.dir, lang === "zh" ? REPORT_FILES.htmlEn : REPORT_FILES.html);
  // 推特卡片只有英文版：中英文页展示同一张图和同一段文案，只有周围的按钮与提示跟随页面语言
  const png = join(r.dir, REPORT_FILES.cardPng);
  const loaded = existsSync(png) ? loadCard(r.dir).card : null;
  const card = existsSync(png) ? { src: "card.png", quote: loaded?.quote, tweet: loaded?.tweet } : undefined;
  return decorateReport(readFileSync(file, "utf8"), {
    backHref: r.meta.visibility === "public" ? "/" : "/p/",
    backLabel: "Research Hub",
    lang,
    altHref: existsSync(other) ? (lang === "zh" ? "./en/" : "../") : undefined,
    card,
  });
}

export interface AssembleResult {
  publicDir: string;
  privateDir: string;
  publicReports: string[];
  privateReports: string[];
  /** 从 card.png 生成的缩略图数 */
  thumbnails: number;
}

const PUBLIC_HEADERS = `/*
  X-Robots-Tag: noindex, nofollow
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
`;
const PRIVATE_HEADERS = `/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: private, no-store
  Referrer-Policy: same-origin
  X-Content-Type-Options: nosniff
`;
const ROBOTS = "User-agent: *\nDisallow: /\n";

/**
 * Astro 顶层产物 → 站点（ADR 0003 §4）。共享白名单（进两站）只有 favicon.svg、404.html、fonts/，不能含任何报告数据；
 * 四位数字的顶层目录是公开的月归档 /YYYY/MM/。新增站点路由时先在这里登记（并把名字加进 lib/schema.ts 的保留名）。
 */
export const ASTRO_OUTPUT: Record<string, readonly Site[]> = {
  "favicon.svg": ["public", "private"],
  "404.html": ["public", "private"],
  fonts: ["public", "private"],
  "index.html": ["public"],
  tags: ["public"],
  archive: ["public"],
  daily: ["public"],
  p: ["private"],
};

/** 一个 Astro 顶层产物进哪些站点；不在清单里返回 undefined。 */
export const astroOutputSites = (name: string): readonly Site[] | undefined =>
  Object.hasOwn(ASTRO_OUTPUT, name) ? ASTRO_OUTPUT[name] : /^\d{4}$/.test(name) ? ["public"] : undefined;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** 列表缩略图的宽度（像素）；高度按 card.png 的比例（1200×1500 → 240×300）。 */
export const THUMB_WIDTH = 240;

/**
 * 从 card.png 生成列表缩略图：按面积平均缩小到 THUMB_WIDTH 宽的 PNG。只用 node:zlib，同样的输入得到同样的字节。
 * card.png 是 rh card 的 Chrome 截图（8 位 RGB，非隔行）；只支持这种格式，其他格式报错（带文件名与原因）。
 */
export function pngThumbnail(png: Buffer, file: string, width = THUMB_WIDTH): Buffer {
  const bad = (why: string) => new Error(`${file}：无法生成缩略图（${why}）`);
  if (png.length < 8 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) throw bad("不是 PNG 文件");
  let w = 0;
  let h = 0;
  const idat: Buffer[] = [];
  for (let at = 8; at + 8 <= png.length; ) {
    const len = png.readUInt32BE(at);
    const type = png.toString("latin1", at + 4, at + 8);
    const data = png.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") {
      [w, h] = [data.readUInt32BE(0), data.readUInt32BE(4)];
      if (data[8] !== 8 || data[9] !== 2) throw bad(`只支持 8 位 RGB（颜色类型 2），实际位深 ${data[8]}、颜色类型 ${data[9]}`);
      if (data[12] !== 0) throw bad("不支持隔行扫描（interlace）的 PNG");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    at += 12 + len;
  }
  if (!w || !h || !idat.length) throw bad("缺少 IHDR 或 IDAT");
  const bpp = 3;
  const stride = w * bpp;
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch (e) {
    throw bad(`图像数据无法解压：${(e as Error).message}`);
  }
  if (raw.length < (stride + 1) * h) throw bad("图像数据不完整");
  // 还原行过滤（PNG 规范 §9）
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[row + i - bpp] : 0;
      const b = y ? px[row - stride + i] : 0;
      const c = y && i >= bpp ? px[row - stride + i - bpp] : 0;
      let v = raw[src + i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw bad(`未知的行过滤类型 ${filter}`);
      px[row + i] = v & 255;
    }
  }
  // 面积平均缩小；每行前面是过滤类型 0（不过滤）
  const tw = Math.min(width, w);
  const th = Math.max(1, Math.round((h * tw) / w));
  const out = Buffer.alloc((tw * bpp + 1) * th);
  for (let y = 0; y < th; y++) {
    const y0 = Math.floor((y * h) / th);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / th));
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor((x * w) / tw);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / tw));
      const n = (y1 - y0) * (x1 - x0);
      for (let k = 0; k < bpp; k++) {
        let sum = 0;
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) sum += px[yy * stride + xx * bpp + k];
        out[y * (tw * bpp + 1) + 1 + x * bpp + k] = Math.round(sum / n);
      }
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tw, 0);
  ihdr.writeUInt32BE(th, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([PNG_SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(out, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/** 把 Astro 产物与报告 HTML 分发到 dist/public 与 dist/private。 */
export function assemble(root: string, astroOut: string, reports: Report[]): AssembleResult {
  const dist = join(root, "dist");
  const publicDir = join(dist, "public");
  const privateDir = join(dist, "private");
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(publicDir, { recursive: true });
  mkdirSync(privateDir, { recursive: true });

  // 1. 索引页与共享资源：按 ASTRO_OUTPUT 清单分发；清单外的顶层产物让构建失败
  const unlisted = readdirSync(astroOut).filter((name) => !astroOutputSites(name));
  if (unlisted.length) {
    throw new Error(`Astro 产物里有未登记的顶层产物：${unlisted.join("、")}（先在 cli/lib/build.ts 的 ASTRO_OUTPUT 里登记它进哪个站点）`);
  }
  for (const name of readdirSync(astroOut)) {
    for (const site of astroOutputSites(name)!) cpSync(join(astroOut, name), join(site === "public" ? publicDir : privateDir, name), { recursive: true });
  }

  // 2. 报告：只分发 published；draft 一律跳过
  const result: AssembleResult = { publicDir, privateDir, publicReports: [], privateReports: [], thumbnails: 0 };
  for (const r of reports) {
    if (!isPublished(r)) continue;
    const html = join(r.dir, REPORT_FILES.html);
    if (!existsSync(html)) throw new Error(`${r.relDir}：已发布但缺少 index.html`);
    const isPublic = r.meta.visibility === "public";
    const target = isPublic ? join(publicDir, "r", r.slug) : join(privateDir, "p", r.slug);
    if (existsSync(target)) throw new Error(`${r.relDir}：目标路径冲突 ${relative(dist, target)}`);
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "index.html"), deployedReportHtml(r, "zh"));
    const assets = join(r.dir, REPORT_FILES.assetsDir);
    const hasAssets = existsSync(assets) && statSync(assets).isDirectory();
    if (hasAssets) cpSync(assets, join(target, "assets"), { recursive: true });
    const cardPng = join(r.dir, REPORT_FILES.cardPng);
    if (existsSync(cardPng)) {
      cpSync(cardPng, join(target, "card.png"));
      writeFileSync(join(target, THUMB_FILE), pngThumbnail(readFileSync(cardPng), relative(root, cardPng)));
      result.thumbnails++;
    }

    if (existsSync(join(r.dir, REPORT_FILES.htmlEn))) {
      const enTarget = join(target, "en");
      mkdirSync(enTarget, { recursive: true });
      writeFileSync(join(enTarget, "index.html"), deployedReportHtml(r, "en"));
      if (hasAssets) cpSync(assets, join(enTarget, "assets"), { recursive: true });
      if (existsSync(join(r.dir, REPORT_FILES.cardPng))) cpSync(join(r.dir, REPORT_FILES.cardPng), join(enTarget, "card.png"));
    }

    (isPublic ? result.publicReports : result.privateReports).push(r.slug);
  }

  writeFileSync(join(publicDir, "_headers"), PUBLIC_HEADERS);
  writeFileSync(join(publicDir, "robots.txt"), ROBOTS);
  writeFileSync(join(privateDir, "_headers"), PRIVATE_HEADERS);
  writeFileSync(join(privateDir, "robots.txt"), ROBOTS);
  return result;
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** 文字在产物里可能出现的形式：原文与 HTML 转义后。过短的文字（< 4 个字符）不作指纹，避免误报。 */
function textForms(texts: (string | undefined)[]): string[] {
  const out = new Set<string>();
  for (const t of texts) {
    if (typeof t !== "string" || t.trim().length < 4) continue;
    out.add(t);
    out.add(escapeHtml(t));
    out.add(t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
  }
  return [...out];
}

/** 一个报告在产物里可能出现的“指纹”：标题、摘要（原文与 HTML 转义后）和站点路径。 */
export function fingerprints(r: Report): string[] {
  const out = new Set(textForms([r.meta.title, r.meta.summary, r.meta.title_en, r.meta.summary_en]));
  for (const p of [`/p/${r.slug}/`, `/r/${r.slug}/`, `/p/${r.slug}/en/`, `/r/${r.slug}/en/`]) out.add(p);
  return [...out];
}

/** 要查找的指纹；what 说明它属于谁（出现在错误信息里）。 */
export interface Needle {
  what: string;
  needle: string;
}

export interface LeakFinding {
  file: string;
  what: string;
  needle: string;
}

/**
 * 公开产物里不能出现的内部数据（调用方登记）：例如 Daily 的 daily/state.yml 内容与内部清单字段
 * （调用次数、错误详情、输入哈希）。text 按原文与 HTML 转义后查找；短于 4 个字符的不查。
 */
export interface PublicForbidden {
  source: string;
  text: string;
}

/**
 * 公开产物的全部指纹（ADR 0003 §3、§6）：
 *  - 非公开（private 或 draft）报告的标题、摘要与路径；
 *  - 没有被任何 public + published 报告用到的标签的描述（标签名太短太常见，不作指纹）；
 *  - 调用方登记的内部数据。
 */
export function publicNeedles(reports: Report[], tags: TagRegistry, forbidden: PublicForbidden[] = []): Needle[] {
  const needles: Needle[] = [];
  for (const r of reports.filter((x) => !isPublicPublished(x))) for (const n of fingerprints(r)) needles.push({ what: `非公开报告 ${r.slug} `, needle: n });
  const publicTags = new Set(reports.filter(isPublicPublished).flatMap((r) => r.meta.tags));
  for (const [key, t] of Object.entries(tags)) {
    if (publicTags.has(key)) continue;
    for (const n of textForms([t.description, t.description_en])) needles.push({ what: `只用于非公开报告的标签 ${key} 的描述`, needle: n });
  }
  for (const f of forbidden) for (const n of textForms([f.text])) needles.push({ what: `${f.source} 的内部数据`, needle: n });
  return needles;
}

/** 在目录的所有文件里查找指纹。 */
export function findLeaks(dir: string, needles: Needle[]): LeakFinding[] {
  const findings: LeakFinding[] = [];
  if (!needles.length) return findings;
  for (const file of walk(dir)) {
    const text = readFileSync(file).toString("utf8");
    for (const { what, needle } of needles) {
      if (text.includes(needle)) findings.push({ file: relative(dir, file), what, needle: needle.length > 40 ? `${needle.slice(0, 40)}…` : needle });
    }
  }
  return findings;
}

/**
 * 泄漏检查（验收 2、3；ADR 0003 §3、§6）：
 *  - 公开产物里不能出现 publicNeedles 的任何指纹，也不能有 /p/ 目录；
 *  - 私有产物里不能出现 draft 的任何指纹。
 * @param forbidden 公开产物里不能出现的内部数据（Daily 的状态与内部清单字段由 Daily 构建登记）
 */
export function leakCheck(res: AssembleResult, reports: Report[], tags: TagRegistry, forbidden: PublicForbidden[] = []): string[] {
  const errors: string[] = [];
  const drafts = reports.filter((r) => !isPublished(r));
  if (existsSync(join(res.publicDir, "p"))) errors.push("公开产物里出现了 /p/ 目录");
  for (const f of findLeaks(res.publicDir, publicNeedles(reports, tags, forbidden))) errors.push(`公开产物 ${f.file} 含有${f.what}的内容：“${f.needle}”`);
  const draftNeedles = drafts.flatMap((r) => fingerprints(r).map((n) => ({ what: ` draft ${r.slug} `, needle: n })));
  for (const f of findLeaks(res.privateDir, draftNeedles)) errors.push(`私有产物 ${f.file} 含有${f.what}的内容：“${f.needle}”`);
  return errors;
}

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
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { crc32, deflateSync, inflateSync } from "node:zlib";
import { dailyForbidden, type DailyLoad } from "../../lib/daily.ts";
import { REPORT_FILES, isPublicPublished, isPublished, type Report } from "../../lib/reports.ts";
import type { TagRegistry } from "../../lib/schema.ts";
import { THUMB_FILE, type Site } from "../../lib/site-data.ts";
import { loadCard, tweetLength } from "./card.ts";
import { commentsAnchor } from "./comments-anchor.ts";
import { commentsLayer } from "./comments-layer.ts";

export const BACK_LINK_ATTR = "data-rh-back";
/** 公开站点上的构建信息（WHI-1972） */
export const BUILD_INFO = "build.json";
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
  /** 评论层（只在私有站点，ADR 0005）：报告 slug 与未注入外壳的 HTML 的 rev */
  comments?: { slug: string; rev: string };
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
    cmt: "评论",
    cmtLang: "中文",
    cmtAdd: "评论",
    cmtNew: "写评论…",
    cmtReply: "回复…",
    cmtSend: "发送",
    cmtCancel: "取消",
    cmtResolved: "显示已解决",
    cmtResolve: "解决",
    cmtReopen: "重新打开",
    cmtLink: "复制链接",
    cmtCopy: "复制",
    cmtCopied: "已复制",
    cmtPrev: "上一条",
    cmtNext: "下一条",
    cmtClose: "关闭",
    cmtOutdated: "已失效",
    cmtMore: "更早的评论",
    cmtAgent: "Agent",
    cmtFail: "发送失败",
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
    cmt: "Comments",
    cmtLang: "EN",
    cmtAdd: "Comment",
    cmtNew: "Add a comment…",
    cmtReply: "Reply…",
    cmtSend: "Send",
    cmtCancel: "Cancel",
    cmtResolved: "Show resolved",
    cmtResolve: "Resolve",
    cmtReopen: "Reopen",
    cmtLink: "Copy link",
    cmtCopy: "Copy",
    cmtCopied: "Copied",
    cmtPrev: "Previous",
    cmtNext: "Next",
    cmtClose: "Close",
    cmtOutdated: "Outdated",
    cmtMore: "Earlier comments",
    cmtAgent: "Agent",
    cmtFail: "Couldn't send",
  },
};

/** 外壳专用的字体名：和报告自己的字体互不影响（ADR 0003 §1：共享字体只用在 data-rh-* 元素上）。 */
const SHELL_UI = `"rh-inter",-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif`;
const SHELL_SERIF = `"rh-newsreader",Georgia,"Times New Roman","PingFang SC",serif`;
/** 与 src/styles/tokens.css 的 @font-face 同一个 unicode-range（拉丁子集；中文落到系统字体）。 */
export const FONT_RANGE =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-2013, U+2015-2017, U+2020-2025, U+2027-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const fontFace = (family: string, file: string) =>
  `@font-face{font-family:"${family}";src:url("/fonts/${file}") format("woff2");font-weight:400 600;font-style:normal;font-display:swap;unicode-range:${FONT_RANGE}}`;

/**
 * 注入的样式只作用于注入的元素（data-rh-*），外加卡片模式下隐藏正文的一条规则；不改报告自身的排版。
 * 颜色取报告自己的 am 主题变量（跟着报告的主题与明暗走），没有时回退到系统颜色。
 * am 页面：语言切换在桌面放进右上角工具栏，在窄屏（工具栏占满一行）放在返回链接那一行的右侧。
 */
function injectedStyle(o: { amToolbar: boolean; amPaths: boolean; lang: boolean; card: boolean; comments: boolean }): string {
  const font = SHELL_UI;
  // span[…]：评论层的按钮也带 data-rh-lang（ADR 0005 §4），语言切换的样式不能作用到它
  const langRules = [
    `span[data-rh-lang]{display:inline-flex;align-items:stretch;flex:none;min-height:32px;border:1px solid var(--line,rgba(127,127,127,.45));border-radius:8px;overflow:hidden;background:var(--paper,Canvas);font:500 12px/1 ${font};letter-spacing:.01em}`,
    `span[data-rh-lang]>*{display:flex;align-items:center;padding:0 11px;color:var(--ink-2,inherit);text-decoration:none;opacity:1}`,
    `span[data-rh-lang]>a:hover{color:var(--ink,inherit);background:var(--fill,rgba(127,127,127,.12))}`,
    `span[data-rh-lang]>[aria-current]{background:var(--ink,CanvasText);color:var(--paper,Canvas);font-weight:600}`,
  ];
  const btn = `font:500 13px/1 ${font};min-height:36px;padding:0 14px;display:inline-flex;align-items:center;border-radius:8px;border:1px solid var(--line,rgba(127,127,127,.45));background:var(--paper,Canvas);color:var(--ink,inherit);text-decoration:none;cursor:pointer`;
  const cardRules = [
    `[data-rh-card][hidden],[data-rh-card-msg][hidden]{display:none!important}`,
    `[data-rh-card]{max-width:620px;margin:0 0 28px}`,
    `[data-rh-card-bar]{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 12px}`,
    `[data-rh-card-bar] .am-btn,[data-rh-card-bar]>a,[data-rh-card-bar]>button{${btn}}`,
    // 非 am 页面：卡片按钮在返回条里（am 页面上它在阅读路径里，用 am 自己的按钮样式）
    `nav[${BACK_LINK_ATTR}] [data-rh-card-btn]{${btn};min-height:32px;font-size:12px}`,
    `nav[${BACK_LINK_ATTR}] [data-rh-card-btn][aria-pressed="true"]{background:var(--ink,CanvasText);color:var(--paper,Canvas);border-color:var(--ink,CanvasText)}`,
    `[data-rh-card-bar]>a:hover,[data-rh-card-bar]>button:hover{background:var(--fill,rgba(127,127,127,.12))}`,
    `[data-rh-card-bar]>[data-rh-card-copy],[data-rh-card-bar]>[data-rh-card-copy]:hover{background:var(--ink,CanvasText);color:var(--paper,Canvas);border-color:var(--ink,CanvasText);font-weight:600}`,
    `[data-rh-card-bar]>[data-rh-card-copy]:disabled{opacity:.6;cursor:default}`,
    `[data-rh-card-hint]{flex:1 1 220px;font:13px/1.5 ${font};color:var(--ink-3,GrayText)}`,
    `[data-rh-card-msg]{margin:0 0 12px;font:14px/1.5 ${font};color:var(--warn,#b45309)}`,
    `[data-rh-card-tweet]{margin:0 0 14px;padding:14px 16px;border:1px solid var(--line,rgba(127,127,127,.35));border-radius:8px;background:var(--paper,Canvas)}`,
    `[data-rh-card-tweet]>figcaption{margin:0 0 8px;font:500 11px/1.4 ${font};letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3,GrayText)}`,
    `[data-rh-card-tweet-text]{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.6 ${font};color:var(--ink,inherit)}`,
    `[data-rh-card-img]{display:block;width:100%;height:auto;border-radius:8px;border:1px solid var(--line,rgba(127,127,127,.35));box-shadow:0 10px 30px rgba(0,0,0,.18)}`,
    o.amPaths
      ? `html[data-rh-view="card"] .am-research>:not(.am-paths):not([data-rh-card]){display:none!important}`
      : `html[data-rh-view="card"] body>:not([${BACK_LINK_ATTR}]):not([data-rh-card]):not(.am-toolbar):not(script):not(style){display:none!important}`,
  ];
  const line = "var(--line,rgba(127,127,127,.35))";
  const small = `font:500 12px/1 ${font};min-height:30px;padding:0 10px;display:inline-flex;align-items:center;gap:6px;border-radius:6px;border:1px solid ${line};background:var(--paper,Canvas);color:var(--ink,inherit);cursor:pointer`;
  const inverse = "background:var(--ink,CanvasText);color:var(--paper,Canvas);border-color:var(--ink,CanvasText)";
  // 评论层（ADR 0005 §6、§7）：抽屉覆盖在报告上方（不让报告重新排版），默认 hidden；::highlight 是唯一的例外，只设背景色
  const commentRules = [
    `[data-rh-comments-btn][hidden],[data-rh-cmt-drawer][hidden],[data-rh-cmt-add][hidden],[data-rh-cmt-drawer] [hidden]{display:none!important}`,
    `[data-rh-comments-btn]{${small};min-height:32px;flex:none}`,
    `[data-rh-comments-btn][aria-expanded="true"]{${inverse}}`,
    `[data-rh-cmt-drawer]{position:fixed;z-index:2147483000;top:0;right:0;bottom:0;width:min(380px,100vw);box-sizing:border-box;display:flex;flex-direction:column;background:var(--paper,Canvas);color:var(--ink,CanvasText);border-left:1px solid ${line};box-shadow:-12px 0 32px rgba(0,0,0,.16);font:14px/1.5 ${font};text-align:left}`,
    `@media (max-width:760px){[data-rh-cmt-drawer]{top:auto;left:0;width:auto;max-height:72vh;border-left:0;border-top:1px solid ${line};border-radius:14px 14px 0 0;box-shadow:0 -12px 32px rgba(0,0,0,.18)}}`,
    `[data-rh-cmt-head]{display:flex;align-items:center;gap:6px;padding:10px 12px;border-bottom:1px solid ${line}}`,
    `[data-rh-cmt-head]>strong{flex:1;font-weight:600}`,
    `[data-rh-cmt-head]>label{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--ink-3,GrayText)}`,
    `[data-rh-cmt-drawer] button{${small}}`,
    `[data-rh-cmt-drawer] button:not([data-rh-cmt-send]):hover{background:var(--fill,rgba(127,127,127,.12))}`,
    `[data-rh-cmt-drawer] [data-rh-cmt-send]{${inverse}}`,
    `[data-rh-cmt-list]{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:0 0 10px}`,
    `[data-rh-cmt-composer],[data-rh-cmt-thread]{margin:10px 12px 0;padding:10px;border:1px solid ${line};border-radius:8px}`,
    `[data-rh-cmt-thread][data-active]{border-color:var(--ink,CanvasText)}`,
    `[data-rh-cmt-thread][data-status="resolved"]{opacity:.7}`,
    `[data-rh-cmt-qrow]{display:flex;gap:6px;align-items:flex-start}`,
    `[data-rh-cmt-drawer] [data-rh-cmt-quote]{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;flex:1;min-width:0;min-height:0;margin:0;padding:2px 0 2px 8px;border:0;border-left:3px solid #eab308;border-radius:0;background:none;color:var(--ink-2,inherit);font:13px/1.5 ${font};text-align:left;overflow-wrap:anywhere}`,
    `[data-rh-outdated] [data-rh-cmt-quote]{border-left-color:${line}}`,
    `[data-rh-cmt-agent],[data-rh-cmt-tag]{flex:none;font:600 10px/1 ${font};padding:3px 5px;border-radius:4px;background:var(--fill,rgba(127,127,127,.15));color:var(--ink-2,inherit);letter-spacing:.03em}`,
    `[data-rh-cmt-c]{margin:10px 0 0}`,
    `[data-rh-cmt-who]{display:flex;align-items:center;gap:6px;font-size:12px}`,
    `[data-rh-cmt-who]>time{color:var(--ink-3,GrayText)}`,
    `[data-rh-cmt-av]{width:22px;height:22px;flex:none;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;font:600 11px/1 ${font}}`,
    `[data-rh-cmt-body]{margin:4px 0 0 28px;white-space:pre-wrap;overflow-wrap:anywhere}`,
    `[data-rh-cmt-resume]{display:flex;gap:6px;align-items:center;margin:6px 0 0 28px}`,
    `[data-rh-cmt-resume]>code{flex:1;min-width:0;padding:4px 6px;border-radius:4px;background:var(--fill,rgba(127,127,127,.12));font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}`,
    `[data-rh-cmt-drawer] textarea{display:block;width:100%;box-sizing:border-box;margin:8px 0 0;padding:6px 8px;border:1px solid ${line};border-radius:6px;background:var(--paper,Canvas);color:inherit;font:14px/1.5 ${font};resize:vertical}`,
    `[data-rh-cmt-row]{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;margin-top:8px}`,
    `[data-rh-cmt-err]{margin:6px 0 0;color:var(--warn,#b45309);font-size:13px;overflow-wrap:anywhere}`,
    `[data-rh-cmt-add]{position:fixed;z-index:2147483001;${small};${inverse};box-shadow:0 6px 18px rgba(0,0,0,.2)}`,
    `::highlight(rh-comment){background-color:rgba(234,179,8,.35)}`,
  ];
  const rules = [...(o.lang ? langRules : []), ...(o.card ? cardRules : []), ...(o.comments ? commentRules : [])];
  if (o.amToolbar) {
    // 窄屏上 am 工具栏是 absolute（页面右上角，几乎占满一行）：返回链接那一行挪到工具栏下方
    // 语言切换与评论按钮各两份：桌面在工具栏里，窄屏在返回链接那一行
    const narrowHide = [o.lang ? ".am-toolbar>span[data-rh-lang]" : "", o.comments ? ".am-toolbar>[data-rh-comments-btn]" : ""].filter(Boolean);
    const wideHide = [o.lang ? `nav[${BACK_LINK_ATTR}] span[data-rh-lang]` : "", o.comments ? `nav[${BACK_LINK_ATTR}] [data-rh-comments-btn]` : ""].filter(Boolean);
    rules.push(`@media (max-width:760px){nav[${BACK_LINK_ATTR}]{padding-top:50px!important}${narrowHide.length ? `${narrowHide.join(",")}{display:none}` : ""}}`);
    if (wideHide.length) rules.push(`@media (min-width:761px){${wideHide.join(",")}{display:none}}`);
  }
  // 只要注入了样式，就带上外壳字体（字体只在用到时才下载）
  return rules.length ? `<style data-rh-style>${fontFace("rh-inter", "inter.woff2")}${fontFace("rh-newsreader", "newsreader.woff2")}${rules.join("")}</style>` : "";
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
 * 评论层脚本：脚本元素本身带 data-rh-slug / lang / rev（ADR 0005 §4）；锚定代码与界面文字作为参数传进 commentsLayer
 * （两者都自成一体，见各自文件的说明）。
 */
function commentsScript(c: NonNullable<DecorateOptions["comments"]>, lang: PageLang): string {
  const strings = Object.fromEntries(Object.entries(UI[lang]).filter(([k]) => k.startsWith("cmt")));
  // JSON 里的 < 转义，文字永远不会提前结束 <script>
  return (
    `<script data-rh-comments data-rh-slug="${escapeHtml(c.slug)}" data-rh-lang="${lang}" data-rh-rev="${escapeHtml(c.rev)}">` +
    `(${commentsLayer.toString()})(document.currentScript.dataset,(${commentsAnchor.toString()})(),${JSON.stringify(strings).replace(/</g, "\\u003c")});</script>`
  );
}

/**
 * 部署前给报告 HTML 加上站点外壳。幂等（已注入过的页面原样返回）。
 *  - <body> 开头：返回链接；有另一种语言版本时，右侧是中文 / EN 切换（窄屏）。
 *  - am 工具栏开头：中文 / EN 切换（桌面，右上角）。
 *  - am 阅读路径末尾：“推特卡片”按钮；路径条下方：卡片区（默认隐藏）。非 am 页面放在返回链接那一行。
 *  - 评论层（opts.comments，只在私有站点）：带数量的按钮（和语言切换同样的位置：am 工具栏开头 / 窄屏在返回链接一行右侧；
 *    默认 hidden，API 可用时才显示）与 <script data-rh-comments>。
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

    const c = opts.comments;
    // 图标 + 数量（最少标签规则；文字放在无障碍名里），窄屏上和卡片按钮、语言切换挤在同一行也不溢出
    const cmtBtn = c
      ? `<button type="button" data-rh-comments-btn aria-label="${escapeHtml(ui.cmt)}" title="${escapeHtml(ui.cmt)}" hidden>${COMMENT_ICON}<span data-rh-comments-n>0</span></button>`
      : "";
    const right = `${amPaths ? "" : cardBtn}${toggle}${cmtBtn}`;
    // 返回条：和索引页页头同一套标志（方块 + 衬线 “Research Hub”）；行内样式，没有样式块的页面也成立
    const nav =
      `<nav ${BACK_LINK_ATTR} style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0;padding:12px 16px 0;font:500 13px/1.5 ${SHELL_UI.replace(/"/g, "'")};">` +
      `<a href="${escapeHtml(opts.backHref)}" style="display:inline-flex;align-items:center;gap:8px;min-height:32px;color:var(--ink,inherit);text-decoration:none;">` +
      `<span aria-hidden="true" style="color:var(--ink-3,inherit);">←</span>` +
      `<span aria-hidden="true" style="width:12px;height:12px;flex:none;background:currentColor;"></span>` +
      `<span style="font:600 16px/1 ${SHELL_SERIF.replace(/"/g, "'")};letter-spacing:-.02em;">${escapeHtml(opts.backLabel)}</span></a>` +
      (right ? `<span style="display:flex;gap:8px;align-items:center;">${right}</span>` : "") +
      `</nav>`;

    // 从后往前插入，前面的下标不受影响
    const inserts: [number, string][] = [[body.index + body[0].length, nav + (amPaths ? "" : section)]];
    if (toolbar && (toggle || cmtBtn)) inserts.push([toolbar.index + toolbar[0].length, toggle + cmtBtn]);
    if (amPaths && opts.card) {
      inserts.push([pathsClose, cardBtn]);
      inserts.push([pathsClose + "</div>".length, section]);
    }
    const closeBody = out.search(/<\/body>/i);
    if (opts.card || opts.altHref) inserts.push([closeBody >= 0 ? closeBody : out.length, PAGE_SCRIPT]);
    if (c) inserts.push([closeBody >= 0 ? closeBody : out.length, commentsScript(c, opts.lang)]);
    const head = /<head\b[^>]*>/i.exec(out);
    const style = injectedStyle({ amToolbar: Boolean(toolbar), amPaths, lang: Boolean(toggle), card: Boolean(opts.card), comments: Boolean(c) });
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

/** 报告页的 rev（ADR 0005 §4）：未注入外壳的 HTML 文件字节的 sha256 的前 12 个十六进制字符。 */
export const reportRev = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex").slice(0, 12);

/**
 * 一篇报告某种语言在某个站点上的部署版 HTML（rh build 与 rh check 的手机检查共用，保证检查的就是上线的页面）。
 * 返回链接按目标站点给出；评论层只注入私有站点（ADR 0005 §1）。
 */
export function deployedReportHtml(r: Report, lang: PageLang, site: Site): string {
  const file = join(r.dir, lang === "zh" ? REPORT_FILES.html : REPORT_FILES.htmlEn);
  const other = join(r.dir, lang === "zh" ? REPORT_FILES.htmlEn : REPORT_FILES.html);
  // 推特卡片只有英文版：中英文页展示同一张图和同一段文案，只有周围的按钮与提示跟随页面语言
  const png = join(r.dir, REPORT_FILES.cardPng);
  const loaded = existsSync(png) ? loadCard(r.dir).card : null;
  const card = existsSync(png) ? { src: "card.png", quote: loaded?.quote, tweet: loaded?.tweet } : undefined;
  const bytes = readFileSync(file);
  return decorateReport(bytes.toString("utf8"), {
    backHref: site === "private" ? "/p/" : "/",
    backLabel: "Research Hub",
    lang,
    altHref: existsSync(other) ? (lang === "zh" ? "./en/" : "../") : undefined,
    card,
    comments: site === "private" ? { slug: r.slug, rev: reportRev(bytes) } : undefined,
  });
}

/** 私有站点上的报告清单 _rh/reports.json 的一项（ADR 0005 §4；Worker 读它校验 slug + lang） */
export interface ManifestEntry {
  slug: string;
  lang: PageLang;
  rev: string;
  title: string;
}

/** 私有站点的清单目录：只进私有产物（泄漏检查要求公开产物里没有它） */
export const MANIFEST_DIR = "_rh";
const COMMENT_ICON = `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

/** 评论层的标记：公开产物里一个都不能有（ADR 0005 §1） */
export const COMMENT_MARKERS = ["data-rh-comments", "/api/comments", "::highlight(rh-comment)"];

export interface AssembleResult {
  publicDir: string;
  privateDir: string;
  publicReports: string[];
  /** private 报告（public 报告在私有站点上的镜像不算在这里） */
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

/**
 * 把 Astro 产物与报告 HTML 分发到 dist/public 与 dist/private。
 * 公开站点另有 /build.json = {"sha": <构建的提交>}（WHI-1972）：Daily 的 notify job 用它找到线上版本；不在 git 里构建时为 null。
 */
export function assemble(root: string, astroOut: string, reports: Report[], o: { sha?: string | null } = {}): AssembleResult {
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

  // 2. 报告：只分发 published；draft 一律跳过。public 报告进 /r/<slug>/，并镜像到私有站点的 /p/<slug>/（ADR 0005 §1）
  const result: AssembleResult = { publicDir, privateDir, publicReports: [], privateReports: [], thumbnails: 0 };
  const manifest: ManifestEntry[] = [];
  for (const r of reports) {
    if (!isPublished(r)) continue;
    const html = join(r.dir, REPORT_FILES.html);
    if (!existsSync(html)) throw new Error(`${r.relDir}：已发布但缺少 index.html`);
    const isPublic = r.meta.visibility === "public";
    const assets = join(r.dir, REPORT_FILES.assetsDir);
    const hasAssets = existsSync(assets) && statSync(assets).isDirectory();
    const cardPng = join(r.dir, REPORT_FILES.cardPng);
    const hasCard = existsSync(cardPng);
    const thumb = hasCard ? pngThumbnail(readFileSync(cardPng), relative(root, cardPng)) : null;
    if (thumb) result.thumbnails++;
    const hasEn = existsSync(join(r.dir, REPORT_FILES.htmlEn));
    const targets: [Site, string][] = [["private", join(privateDir, "p", r.slug)]];
    if (isPublic) targets.unshift(["public", join(publicDir, "r", r.slug)]);
    for (const [site, target] of targets) {
      if (existsSync(target)) throw new Error(`${r.relDir}：目标路径冲突 ${relative(dist, target)}`);
      for (const lang of hasEn ? (["zh", "en"] as const) : (["zh"] as const)) {
        const dir = lang === "zh" ? target : join(target, "en");
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "index.html"), deployedReportHtml(r, lang, site));
        if (hasAssets) cpSync(assets, join(dir, "assets"), { recursive: true });
        if (hasCard) cpSync(cardPng, join(dir, "card.png"));
        if (site === "private") {
          const rev = reportRev(readFileSync(join(r.dir, lang === "zh" ? REPORT_FILES.html : REPORT_FILES.htmlEn)));
          manifest.push({ slug: r.slug, lang, rev, title: lang === "en" ? (r.meta.title_en ?? r.meta.title) : r.meta.title });
        }
      }
      if (thumb) writeFileSync(join(target, THUMB_FILE), thumb);
    }

    (isPublic ? result.publicReports : result.privateReports).push(r.slug);
  }
  // 按 slug、再按 lang（空格比 slug 里的任何字符都小）
  manifest.sort((a, b) => (`${a.slug} ${a.lang}` < `${b.slug} ${b.lang}` ? -1 : 1));
  mkdirSync(join(privateDir, MANIFEST_DIR), { recursive: true });
  writeFileSync(join(privateDir, MANIFEST_DIR, "reports.json"), `${JSON.stringify(manifest)}\n`);

  writeFileSync(join(publicDir, BUILD_INFO), `${JSON.stringify({ sha: o.sha ?? null })}\n`);
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
 *  - 公开产物里不能出现 publicNeedles 的任何指纹，也不能有 /p/ 与 _rh/ 目录，也不能有评论层的标记（ADR 0005 §1、§4）；
 *  - 私有产物里不能出现 draft 的任何指纹。
 * @param forbidden 公开产物里不能出现的内部数据（Daily 的状态与内部清单字段由 Daily 构建登记）
 */
export function leakCheck(res: AssembleResult, reports: Report[], tags: TagRegistry, forbidden: PublicForbidden[] = []): string[] {
  const errors: string[] = [];
  const drafts = reports.filter((r) => !isPublished(r));
  if (existsSync(join(res.publicDir, "p"))) errors.push("公开产物里出现了 /p/ 目录");
  if (existsSync(join(res.publicDir, MANIFEST_DIR))) errors.push(`公开产物里出现了 /${MANIFEST_DIR}/ 目录`);
  for (const f of findLeaks(res.publicDir, COMMENT_MARKERS.map((needle) => ({ what: "评论层", needle })))) errors.push(`公开产物 ${f.file} 含有评论层的标记：“${f.needle}”`);
  for (const f of findLeaks(res.publicDir, publicNeedles(reports, tags, forbidden))) errors.push(`公开产物 ${f.file} 含有${f.what}的内容：“${f.needle}”`);
  const draftNeedles = drafts.flatMap((r) => fingerprints(r).map((n) => ({ what: ` draft ${r.slug} `, needle: n })));
  for (const f of findLeaks(res.privateDir, draftNeedles)) errors.push(`私有产物 ${f.file} 含有${f.what}的内容：“${f.needle}”`);
  return errors;
}

/**
 * 公开产物里不能出现的 Daily 内部数据：dailyForbidden（内部字段名、manifest 内部字段的值、dismiss 理由），
 * 再加上 state.yml 里 link 到非公开报告的 slug——“某个 topic 已经变成某篇私有报告”这件事也不能公开（ADR 0004 §9）。
 */
export function dailyPublicForbidden(load: DailyLoad, reports: Report[]): PublicForbidden[] {
  const nonPublic = new Set(reports.filter((r) => !isPublicPublished(r)).map((r) => r.slug));
  const linked = Object.entries(load.state.topics).flatMap(([id, e]) => (e.state === "linked" && nonPublic.has(e.report) ? [{ source: `daily/state.yml ${id}`, text: e.report }] : []));
  return [...dailyForbidden(load), ...linked];
}

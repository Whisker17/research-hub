/**
 * 构建产物组装（规格 §5）：
 *
 *   .astro-dist/          Astro 生成的索引页（含 /p/ 私有索引）
 *        │
 *        ├─► dist/public/   公开站点：索引、标签、归档、/r/<slug>/（public + published）
 *        └─► dist/private/  私有站点：/p/ 私有索引、/p/<slug>/（private + published）
 *
 * draft 不进入任何产物。报告 HTML 原样复制，只在 <body> 开头注入一个返回链接
 * （文档流内、无 fixed、不改页面样式），并在 <head> 补 robots noindex。
 * 最后做泄漏检查：公开产物里不能出现任何私有报告或 draft 的标题、摘要、路径。
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { REPORT_FILES, isPublished, type Report } from "../../lib/reports.ts";

export const BACK_LINK_ATTR = "data-rh-back";

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 在 <body> 开头注入返回链接；在 <head> 补 robots noindex。幂等。 */
export function injectBackLink(html: string, href: string, label: string): string {
  let out = html;
  if (!out.includes(`${BACK_LINK_ATTR}`)) {
    // answer-me-with-html 的工具栏在窄屏上是 absolute（页面右上角，几乎占满一行）。
    // 这类页面在窄屏上把返回链接放到工具栏下方；样式只作用于注入的 nav 本身，不碰页面样式。
    const amToolbar = /class="am-toolbar"/.test(out);
    const scoped = amToolbar ? `<style>@media (max-width:760px){nav[${BACK_LINK_ATTR}]{padding-top:50px!important}}</style>` : "";
    const nav =
      `<nav ${BACK_LINK_ATTR} style="display:block;margin:0;padding:12px 16px 0;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif;">` +
      `${scoped}<a href="${escapeHtml(href)}" style="color:inherit;opacity:.72;text-decoration:none;">← ${escapeHtml(label)}</a></nav>`;
    const m = /<body\b[^>]*>/i.exec(out);
    if (!m) throw new Error("HTML 没有 <body> 标签，无法注入返回链接");
    out = out.slice(0, m.index + m[0].length) + nav + out.slice(m.index + m[0].length);
  }
  if (!/<meta[^>]+name=["']robots["']/i.test(out)) {
    const h = /<head\b[^>]*>/i.exec(out);
    if (h) out = out.slice(0, h.index + h[0].length) + `<meta name="robots" content="noindex, nofollow">` + out.slice(h.index + h[0].length);
  }
  return out;
}

export interface AssembleResult {
  publicDir: string;
  privateDir: string;
  publicReports: string[];
  privateReports: string[];
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

/** 把 Astro 产物与报告 HTML 分发到 dist/public 与 dist/private。 */
export function assemble(root: string, astroOut: string, reports: Report[]): AssembleResult {
  const dist = join(root, "dist");
  const publicDir = join(dist, "public");
  const privateDir = join(dist, "private");
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(publicDir, { recursive: true });
  mkdirSync(privateDir, { recursive: true });

  // 1. 索引页：/p/ 只进私有站点，其余进公开站点
  for (const name of readdirSync(astroOut)) {
    const src = join(astroOut, name);
    if (name === "p") cpSync(src, join(privateDir, "p"), { recursive: true });
    else cpSync(src, join(publicDir, name), { recursive: true });
  }
  // 私有站点也需要 404 与图标
  for (const shared of ["404.html", "favicon.svg"]) {
    if (existsSync(join(astroOut, shared))) cpSync(join(astroOut, shared), join(privateDir, shared));
  }

  // 2. 报告：只分发 published；draft 一律跳过
  const result: AssembleResult = { publicDir, privateDir, publicReports: [], privateReports: [] };
  for (const r of reports) {
    if (!isPublished(r)) continue;
    const html = join(r.dir, REPORT_FILES.html);
    if (!existsSync(html)) throw new Error(`${r.relDir}：已发布但缺少 index.html`);
    const isPublic = r.meta.visibility === "public";
    const target = isPublic ? join(publicDir, "r", r.slug) : join(privateDir, "p", r.slug);
    if (existsSync(target)) throw new Error(`${r.relDir}：目标路径冲突 ${relative(dist, target)}`);
    mkdirSync(target, { recursive: true });
    const injected = injectBackLink(readFileSync(html, "utf8"), isPublic ? "/" : "/p/", "Research Hub");
    writeFileSync(join(target, "index.html"), injected);
    const assets = join(r.dir, REPORT_FILES.assetsDir);
    if (existsSync(assets) && statSync(assets).isDirectory()) cpSync(assets, join(target, "assets"), { recursive: true });
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

/** 一个报告在产物里可能出现的“指纹”：标题、摘要（原文与 HTML 转义后）和站点路径。 */
export function fingerprints(r: Report): string[] {
  const texts = [r.meta.title, r.meta.summary].filter((s) => s.trim().length >= 4);
  const out = new Set<string>();
  for (const t of texts) {
    out.add(t);
    out.add(escapeHtml(t));
    out.add(t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
  }
  out.add(`/p/${r.slug}/`);
  out.add(`/r/${r.slug}/`);
  return [...out];
}

export interface LeakFinding {
  file: string;
  slug: string;
  needle: string;
}

/** 在目录的所有文件里查找给定报告的指纹。 */
export function findLeaks(dir: string, reports: Report[]): LeakFinding[] {
  const needles = reports.flatMap((r) => fingerprints(r).map((n) => ({ slug: r.slug, needle: n })));
  const findings: LeakFinding[] = [];
  if (!needles.length) return findings;
  for (const file of walk(dir)) {
    const text = readFileSync(file).toString("utf8");
    for (const { slug, needle } of needles) {
      if (text.includes(needle)) findings.push({ file: relative(dir, file), slug, needle: needle.length > 40 ? `${needle.slice(0, 40)}…` : needle });
    }
  }
  return findings;
}

/**
 * 泄漏检查（验收 2、3）：
 *  - 公开产物里不能出现 私有报告 或 draft 的任何指纹，也不能有 /p/ 目录；
 *  - 私有产物里不能出现 draft 的任何指纹。
 */
export function leakCheck(res: AssembleResult, reports: Report[]): string[] {
  const errors: string[] = [];
  const hiddenFromPublic = reports.filter((r) => !(isPublished(r) && r.meta.visibility === "public"));
  const drafts = reports.filter((r) => !isPublished(r));
  if (existsSync(join(res.publicDir, "p"))) errors.push("公开产物里出现了 /p/ 目录");
  for (const f of findLeaks(res.publicDir, hiddenFromPublic)) errors.push(`公开产物 ${f.file} 含有非公开报告 ${f.slug} 的内容：“${f.needle}”`);
  for (const f of findLeaks(res.privateDir, drafts)) errors.push(`私有产物 ${f.file} 含有 draft ${f.slug} 的内容：“${f.needle}”`);
  return errors;
}

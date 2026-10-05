/**
 * rh check 的检查逻辑（规格 §3.3、§4、§6.2）。
 *
 * 严格程度：
 *  - schema、目录、标签登记、引用：对所有报告都是错误（draft 也一样，保证 main 上的数据始终合法）。
 *  - 完整性（台账、HTML、渲染记录）与手机检查：published 报告或显式 strict 时是错误；
 *    draft 默认只给警告，这样未完成的 draft 可以放心提交到 main。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser } from "puppeteer-core";
import { parseLedger } from "../../lib/ledger.ts";
import { REPORT_FILES, type Report } from "../../lib/reports.ts";
import type { TagRegistry } from "../../lib/schema.ts";
import { injectBackLink } from "./build.ts";
import { MOBILE_CHECK_VERSION, checkMobile, type MobileResult } from "./mobile.ts";

/** 手机检查用的临时文件（在报告目录内，检查后删除；已加入 .gitignore） */
export const MOBILE_TMP = ".rh-mobile-check.html";

export interface ReportCheck {
  slug: string;
  errors: string[];
  warnings: string[];
  shots: string[];
}

export interface CheckOptions {
  strict: boolean;
  /** 是否运行手机检查（CI 用 --no-shot 关闭） */
  mobile: boolean;
  browser?: Browser;
  /** 手机检查结果缓存目录（按 HTML 内容哈希） */
  cacheDir?: string;
  shotsDir?: string;
}

export function checkReferences(report: Report, all: Report[], tags: TagRegistry): string[] {
  const errors: string[] = [];
  for (const t of report.meta.tags) {
    if (!tags[t]) errors.push(`标签“${t}”没有在 tags.yml 登记（rh tags add ${t} --label <展示名>）`);
  }
  const slugs = new Set(all.map((r) => r.slug));
  for (const rel of report.meta.related ?? []) {
    if (rel === report.slug) errors.push("related 不能引用自己");
    else if (!slugs.has(rel)) errors.push(`related 引用了不存在的报告“${rel}”`);
  }
  return errors;
}

export function checkCompleteness(report: Report): string[] {
  const problems: string[] = [];
  const f = (p: string) => join(report.dir, p);
  const { meta } = report;
  if (/\bTODO\b/.test(meta.title) || /\bTODO\b/.test(meta.summary)) problems.push("meta 的 title / summary 还是 TODO 占位");

  if (meta.kind === "native") {
    if (!existsSync(f(REPORT_FILES.brief))) problems.push("缺少 brief.md（rh new 生成的 brief 快照）");
    if (!existsSync(f(REPORT_FILES.ledger))) {
      problems.push("缺少论断台账 research/ledger.md");
    } else {
      const ledger = parseLedger(readFileSync(f(REPORT_FILES.ledger), "utf8"));
      for (const e of ledger.errors) problems.push(`论断台账：${e}`);
    }
    if (!existsSync(f(REPORT_FILES.explainer))) problems.push("缺少 explainer.md（answer-me-with-html 稿件）");
  }
  if (!existsSync(f(REPORT_FILES.html))) {
    problems.push(meta.kind === "native" ? "缺少 index.html（运行 rh render）" : "缺少 index.html");
  } else {
    const html = readFileSync(f(REPORT_FILES.html), "utf8");
    if (!/<body[\s>]/i.test(html)) problems.push("index.html 没有 <body> 标签");
    if (existsSync(f(REPORT_FILES.explainer)) && !meta.am_version) problems.push("meta 缺少 am_version（用 rh render 渲染会自动记录）");
  }
  return problems;
}

interface CacheEntry {
  version: number;
  ok: boolean;
  failures: string[];
  warnings: string[];
}

function cacheKey(html: Buffer): string {
  return createHash("sha256").update(html).digest("hex");
}

export async function checkReportMobile(report: Report, opts: CheckOptions): Promise<MobileResult | CacheEntry | null> {
  const source = join(report.dir, REPORT_FILES.html);
  if (!existsSync(source) || !opts.browser) return null;
  // 检查的是实际部署的版本：注入返回链接后的 HTML。临时文件放在报告目录里，保证相对路径的资源可用。
  const deployed = injectBackLink(readFileSync(source, "utf8"), report.meta.visibility === "public" ? "/" : "/p/", "Research Hub");
  const key = cacheKey(Buffer.from(deployed));
  const cacheFile = opts.cacheDir ? join(opts.cacheDir, `${report.slug}.json`) : null;
  const shotDir = opts.shotsDir ? join(opts.shotsDir, report.slug) : null;
  if (cacheFile && existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, "utf8")) as CacheEntry & { key: string };
    // 截图目录被删时重新跑，保证“输出全页截图”始终成立
    if (cached.key === key && cached.version === MOBILE_CHECK_VERSION && (!shotDir || existsSync(shotDir))) return cached;
  }
  const htmlFile = join(report.dir, MOBILE_TMP);
  writeFileSync(htmlFile, deployed);
  let result: MobileResult;
  try {
    result = await checkMobile(opts.browser, htmlFile, shotDir);
  } finally {
    rmSync(htmlFile, { force: true });
  }
  if (cacheFile) {
    mkdirSync(opts.cacheDir!, { recursive: true });
    const entry = { key, version: MOBILE_CHECK_VERSION, ok: result.ok, failures: result.failures, warnings: result.warnings };
    writeFileSync(cacheFile, JSON.stringify(entry, null, 2));
  }
  return result;
}

export async function checkReport(report: Report, all: Report[], tags: TagRegistry, opts: CheckOptions): Promise<ReportCheck> {
  const strict = opts.strict || report.meta.status === "published";
  const errors: string[] = [...checkReferences(report, all, tags)];
  const warnings: string[] = [];
  const shots: string[] = [];
  const bucket = strict ? errors : warnings;

  bucket.push(...checkCompleteness(report));

  if (opts.mobile) {
    const m = await checkReportMobile(report, opts);
    if (m) {
      bucket.push(...m.failures.map((x) => `手机：${x}`));
      warnings.push(...m.warnings.map((x) => `手机：${x}`));
      if ("shots" in m) shots.push(...m.shots);
    }
  }
  return { slug: report.slug, errors, warnings, shots };
}

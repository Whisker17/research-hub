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
import { deployedReportHtml } from "./build.ts";
import { CARD_LIMITS, avoidedTerms, cardPngState, loadCard, tweetLimitError } from "./card.ts";
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
  /** 推特卡片里要尽量避免的词（rh.config.json 的 cardAvoidTerms） */
  cardAvoidTerms?: string[];
  /** 推特卡片水印（参与 PNG 新鲜度判断） */
  cardHandle?: string;
  /** 推文文案的 X 计数上限 */
  cardTweetMax?: number;
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
  if (existsSync(f(REPORT_FILES.explainerEn))) {
    if (!existsSync(f(REPORT_FILES.htmlEn))) {
      problems.push("缺少 index.en.html（运行 rh render）");
    } else {
      const htmlEn = readFileSync(f(REPORT_FILES.htmlEn), "utf8");
      if (!/<body[\s>]/i.test(htmlEn)) problems.push("index.en.html 没有 <body> 标签");
    }
  }
  return problems;
}

/**
 * 推特卡片（card.yml，可选；只有英文版）：
 *  - 稿件本身（schema、篇幅上限、推文长度）：错误，与 meta schema 同级（draft 也一样）。
 *  - 渲染状态（PNG 缺失、比 card.yml 旧、或没有稿件的孤立 PNG）：完整性问题，按严格程度给错误或警告。
 */
export function checkCard(
  report: Report,
  opts: { avoidTerms?: string[]; handle?: string; tweetMax?: number } = {},
): { errors: string[]; completeness: string[]; warnings: string[] } {
  const { avoidTerms = [], handle = "", tweetMax = CARD_LIMITS.tweetFold } = opts;
  const res = { errors: [] as string[], completeness: [] as string[], warnings: [] as string[] };
  const png = REPORT_FILES.cardPng;
  if (existsSync(join(report.dir, "card.en.png"))) res.warnings.push("card.en.png 已不再使用（推特卡片只有英文版，统一是 card.png）：删掉它");
  const loaded = loadCard(report.dir);
  if (!loaded.exists) {
    // 稿件删了、图还在：构建会继续展示一张无法核对的旧图
    if (existsSync(join(report.dir, png))) res.completeness.push(`有 ${png} 但没有 ${REPORT_FILES.card}：页面会继续展示这张没有稿件的旧图。删掉 ${png} 或补回稿件`);
    return res;
  }
  if (!loaded.card) {
    res.errors.push(...loaded.errors.map((e) => `${REPORT_FILES.card}：${e}`));
    return res;
  }
  const card = loaded.card;
  const long = tweetLimitError(card.tweet, tweetMax);
  if (long) res.errors.push(`${REPORT_FILES.card}：tweet：${long}`);
  for (const t of avoidedTerms(card, avoidTerms)) res.warnings.push(`卡片提到了“${t}”：推特卡片以中立研究者身份发布，尽量不提（rh.config.json 的 cardAvoidTerms）`);
  const state = cardPngState(report.dir, card, handle);
  if (state === "missing") res.completeness.push(`缺少 ${png}（运行 rh card ${report.slug}）`);
  if (state === "stale") res.completeness.push(`${png} 不是当前 ${REPORT_FILES.card}（或水印）的渲染结果（运行 rh card ${report.slug}）`);
  return res;
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

async function checkSingleHtmlMobile(
  report: Report,
  file: string,
  cacheSuffix: string,
  opts: CheckOptions,
): Promise<MobileResult | CacheEntry | null> {
  const source = join(report.dir, file);
  if (!existsSync(source) || !opts.browser) return null;
  // 用报告自己的站点：private 报告带评论层（默认收起，不影响检查），public 报告是公开站点的页面
  const deployed = deployedReportHtml(report, file === REPORT_FILES.htmlEn ? "en" : "zh", report.meta.visibility === "public" ? "public" : "private");
  const key = cacheKey(Buffer.from(deployed));
  const cacheName = cacheSuffix ? `${report.slug}-${cacheSuffix}.json` : `${report.slug}.json`;
  const cacheFile = opts.cacheDir ? join(opts.cacheDir, cacheName) : null;
  const shotDirName = cacheSuffix ? `${report.slug}-${cacheSuffix}` : report.slug;
  const shotDir = opts.shotsDir ? join(opts.shotsDir, shotDirName) : null;
  if (cacheFile && existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, "utf8")) as CacheEntry & { key: string };
    if (cached.key === key && cached.version === MOBILE_CHECK_VERSION && (!shotDir || existsSync(shotDir))) return cached;
  }
  const tmpName = cacheSuffix ? `.rh-mobile-check-${cacheSuffix}.html` : MOBILE_TMP;
  const htmlFile = join(report.dir, tmpName);
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

export async function checkReportMobile(report: Report, opts: CheckOptions): Promise<MobileResult | CacheEntry | null> {
  const zhResult = await checkSingleHtmlMobile(report, REPORT_FILES.html, "", opts);
  const hasEn = existsSync(join(report.dir, REPORT_FILES.htmlEn));
  if (!hasEn) return zhResult;

  const enResult = await checkSingleHtmlMobile(report, REPORT_FILES.htmlEn, "en", opts);
  if (!zhResult && !enResult) return null;
  const combinedFailures = [
    ...(zhResult?.failures ?? []),
    ...(enResult?.failures.map((f) => `[英文版] ${f}`) ?? []),
  ];
  const combinedWarnings = [
    ...(zhResult?.warnings ?? []),
    ...(enResult?.warnings.map((w) => `[英文版] ${w}`) ?? []),
  ];
  const combinedShots: string[] = [];
  if (zhResult && "shots" in zhResult) combinedShots.push(...zhResult.shots);
  if (enResult && "shots" in enResult) combinedShots.push(...enResult.shots);

  return {
    version: MOBILE_CHECK_VERSION,
    ok: combinedFailures.length === 0,
    failures: combinedFailures,
    warnings: combinedWarnings,
    shots: combinedShots,
  };
}

export async function checkReport(report: Report, all: Report[], tags: TagRegistry, opts: CheckOptions): Promise<ReportCheck> {
  const strict = opts.strict || report.meta.status === "published";
  const errors: string[] = [...checkReferences(report, all, tags)];
  const warnings: string[] = [];
  const shots: string[] = [];
  const bucket = strict ? errors : warnings;

  bucket.push(...checkCompleteness(report));
  const card = checkCard(report, { avoidTerms: opts.cardAvoidTerms, handle: opts.cardHandle, tweetMax: opts.cardTweetMax });
  errors.push(...card.errors);
  bucket.push(...card.completeness);
  warnings.push(...card.warnings);

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

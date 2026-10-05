/**
 * 读取 reports/YYYY/MM/<slug>/meta.yml，校验并返回报告列表。
 * CLI 与 Astro 构建共用；任何校验问题都以 issues 返回，由调用方决定是否失败。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { formatZodIssues, metaSchema, tagsFileSchema, type Meta, type TagRegistry } from "./schema.ts";

export interface Report {
  slug: string;
  /** 绝对路径 */
  dir: string;
  /** 相对仓库根目录，例如 reports/2026/10/meme-launchpad */
  relDir: string;
  meta: Meta;
}

export interface Issue {
  /** 报告 slug 或文件路径 */
  where: string;
  message: string;
}

export const REPORT_FILES = {
  meta: "meta.yml",
  html: "index.html",
  explainer: "explainer.md",
  brief: "brief.md",
  source: "source.md",
  researchDir: "research",
  ledger: "research/ledger.md",
  assetsDir: "assets",
} as const;

const isDir = (p: string): boolean => existsSync(p) && statSync(p).isDirectory();
const listDirs = (p: string): string[] => (isDir(p) ? readdirSync(p).filter((n) => !n.startsWith(".") && isDir(join(p, n))).sort() : []);

export function loadTags(root: string): { tags: TagRegistry; issues: Issue[] } {
  const file = join(root, "tags.yml");
  if (!existsSync(file)) return { tags: {}, issues: [{ where: "tags.yml", message: "缺少 tags.yml" }] };
  const parsed = tagsFileSchema.safeParse(parseYaml(readFileSync(file, "utf8")) ?? { tags: {} });
  if (!parsed.success) return { tags: {}, issues: formatZodIssues(parsed.error).map((m) => ({ where: "tags.yml", message: m })) };
  return { tags: parsed.data.tags, issues: [] };
}

export function loadReports(root: string): { reports: Report[]; issues: Issue[] } {
  const reportsRoot = join(root, "reports");
  const reports: Report[] = [];
  const issues: Issue[] = [];
  const seen = new Map<string, string>();

  for (const year of listDirs(reportsRoot)) {
    for (const month of listDirs(join(reportsRoot, year))) {
      for (const slug of listDirs(join(reportsRoot, year, month))) {
        const dir = join(reportsRoot, year, month, slug);
        const relDir = relative(root, dir);
        const metaFile = join(dir, REPORT_FILES.meta);
        if (!/^\d{4}$/.test(year) || !/^(0[1-9]|1[0-2])$/.test(month)) {
          issues.push({ where: relDir, message: "目录必须是 reports/YYYY/MM/<slug>/" });
          continue;
        }
        if (!existsSync(metaFile)) {
          issues.push({ where: relDir, message: "缺少 meta.yml" });
          continue;
        }
        let raw: unknown;
        try {
          raw = parseYaml(readFileSync(metaFile, "utf8"));
        } catch (e) {
          issues.push({ where: relDir, message: `meta.yml 不是合法 YAML：${(e as Error).message}` });
          continue;
        }
        const parsed = metaSchema.safeParse(raw);
        if (!parsed.success) {
          for (const m of formatZodIssues(parsed.error)) issues.push({ where: relDir, message: `meta.yml ${m}` });
          continue;
        }
        const meta = parsed.data;
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
          issues.push({ where: relDir, message: "目录名（slug）只能用小写字母、数字和连字符" });
        }
        if (meta.created.slice(0, 7) !== `${year}-${month}`) {
          issues.push({ where: relDir, message: `created（${meta.created}）与目录年月 ${year}/${month} 不一致` });
        }
        const prev = seen.get(slug);
        if (prev) issues.push({ where: relDir, message: `slug 与 ${prev} 重复；slug 必须全局唯一` });
        seen.set(slug, relDir);
        reports.push({ slug, dir, relDir, meta });
      }
    }
  }
  return { reports, issues };
}

/** 按 updated 倒序，其次 created 倒序，再按 slug。 */
export function sortByUpdated(reports: Report[]): Report[] {
  return [...reports].sort(
    (a, b) =>
      b.meta.updated.localeCompare(a.meta.updated) ||
      b.meta.created.localeCompare(a.meta.created) ||
      a.slug.localeCompare(b.slug),
  );
}

export const isPublished = (r: Report): boolean => r.meta.status === "published";
export const isPublicPublished = (r: Report): boolean => isPublished(r) && r.meta.visibility === "public";

/** 报告在站点上的路径（不含域名）。 */
export const reportPath = (r: Report): string => (r.meta.visibility === "public" ? `/r/${r.slug}/` : `/p/${r.slug}/`);

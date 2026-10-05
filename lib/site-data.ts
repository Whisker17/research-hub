/**
 * Astro 页面使用的站点数据。只在构建时运行（读文件系统）。
 *
 * 公开页面只能使用 publicReports；私有索引（/p/）可以使用 allPublished。
 * draft 不出现在任何列表里。
 */
import { loadConfig } from "./config.ts";
import { isPublicPublished, isPublished, loadReports, loadTags, reportPath, sortByUpdated, type Report } from "./reports.ts";
import { DOMAIN_LABELS, type Domain, type TagRegistry } from "./schema.ts";

export interface CardData {
  slug: string;
  title: string;
  summary: string;
  created: string;
  updated: string;
  domain: Domain;
  domainLabel: string;
  tags: { key: string; label: string }[];
  visibility: "public" | "private";
  href: string;
}

let cache: { publicReports: Report[]; allPublished: Report[]; tags: TagRegistry } | null = null;

export function siteData() {
  if (cache) return cache;
  const cfg = loadConfig();
  const { reports, issues } = loadReports(cfg.root);
  const tagLoad = loadTags(cfg.root);
  const all = [...issues, ...tagLoad.issues];
  if (all.length) {
    throw new Error(`报告数据不合法，先运行 rh check：\n${all.map((i) => `  ${i.where}: ${i.message}`).join("\n")}`);
  }
  cache = {
    publicReports: sortByUpdated(reports.filter(isPublicPublished)),
    allPublished: sortByUpdated(reports.filter(isPublished)),
    tags: tagLoad.tags,
  };
  return cache;
}

/**
 * @param linkBase 私有索引里，公开报告需要链接回公开站点的绝对 URL；公开页面传空串。
 */
export function toCard(r: Report, tags: TagRegistry, linkBase = ""): CardData {
  const path = reportPath(r);
  return {
    slug: r.slug,
    title: r.meta.title,
    summary: r.meta.summary,
    created: r.meta.created,
    updated: r.meta.updated,
    domain: r.meta.domain,
    domainLabel: DOMAIN_LABELS[r.meta.domain],
    tags: r.meta.tags.map((k) => ({ key: k, label: tags[k]?.label ?? k })),
    visibility: r.meta.visibility,
    href: r.meta.visibility === "public" ? `${linkBase}${path}` : path,
  };
}

/** 按创建年月分组：[{ ym: "2026-10", year, month, reports }]，新的在前。 */
export function byMonth(reports: Report[]) {
  const groups = new Map<string, Report[]>();
  for (const r of reports) {
    const ym = r.meta.created.slice(0, 7);
    groups.set(ym, [...(groups.get(ym) ?? []), r]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([ym, rs]) => ({ ym, year: ym.slice(0, 4), month: ym.slice(5, 7), reports: sortByUpdated(rs) }));
}

/** 公开报告中实际用到的标签（按使用次数、再按键排序）。 */
export function usedTags(reports: Report[], tags: TagRegistry) {
  const count = new Map<string, number>();
  for (const r of reports) for (const t of r.meta.tags) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count.entries()]
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([key, n]) => ({ key, label: tags[key]?.label ?? key, count: n }));
}

export function usedDomains(reports: Report[]) {
  const set = new Set(reports.map((r) => r.meta.domain));
  return (Object.keys(DOMAIN_LABELS) as Domain[]).filter((d) => set.has(d)).map((d) => ({ key: d, label: DOMAIN_LABELS[d] }));
}

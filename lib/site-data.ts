/**
 * Astro 页面使用的站点数据。只在构建时运行（读文件系统）。
 *
 * 按站点投影（ADR 0003 §3）：页面只读 siteView("public") / siteView("private")，不直接读报告列表。
 *  - 公开站点：只有 public + published 报告，以及只被它们用到的标签；所有列表、计数、标签共现、
 *    缩略图、related 链接都从这个集合计算。
 *  - 私有站点：全部 published 报告；public 报告的链接与缩略图用公开站点的绝对地址（不复制）。
 *  - draft 不出现在任何站点。
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config.ts";
import { REPORT_FILES, isPublicPublished, isPublished, loadReports, loadTags, reportEnPath, reportPath, sortByUpdated, type Report } from "./reports.ts";
import { DOMAIN_LABELS, type Domain, type TagRegistry } from "./schema.ts";

export type Site = "public" | "private";

/** rh build 从 card.png 生成的列表缩略图，放在报告目录里（/r/<slug>/ 或 /p/<slug>/），只进报告所在的站点。 */
export const THUMB_FILE = "thumb.png";

export interface CardData {
  slug: string;
  title: string;
  summary: string;
  title_en?: string;
  summary_en?: string;
  created: string;
  updated: string;
  domain: Domain;
  domainLabel: string;
  tags: { key: string; label: string }[];
  visibility: "public" | "private";
  href: string;
  href_en?: string;
  /** 列表缩略图（有 card.png 时） */
  thumb?: string;
  /** related 里本站可见的报告 slug */
  related: string[];
}

export interface TagCount {
  key: string;
  label: string;
  count: number;
}

/**
 * 一个站点能看到的全部数据。只给出投影后的数据（CardData），不暴露原始 Report / meta，
 * 免得页面读到 meta.related 之类可能指向私有报告的原始字段。
 */
export interface SiteView {
  site: Site;
  /** 本站可见的报告，按 updated 倒序 */
  cards: CardData[];
  /** 只含本站报告用到的标签（含描述） */
  tags: TagRegistry;
  usedTags: TagCount[];
  domains: { key: Domain; label: string }[];
  /** 按创建年月分组，新的在前 */
  months: { ym: string; year: string; month: string; cards: CardData[] }[];
  /** 本站可见的报告；私有、draft 或不存在时返回 undefined。引用报告的页面（如 Daily）必须经过它。 */
  find(slug: string): CardData | undefined;
  /** 与 tag 同时出现在本站报告上的其他标签及次数 */
  coTags(tag: string): TagCount[];
}

/** 纯函数：从全部报告与标签登记表算出一个站点的投影。 */
export function projectSite(site: Site, all: Report[], registry: TagRegistry, publicUrl: string): SiteView {
  const reports = sortByUpdated(all.filter(site === "public" ? isPublicPublished : isPublished));
  const visible = new Set(reports.map((r) => r.slug));
  const used = new Set(reports.flatMap((r) => r.meta.tags));
  const tags: TagRegistry = Object.fromEntries(Object.entries(registry).filter(([k]) => used.has(k)));
  const linkBase = site === "private" ? publicUrl : "";
  const cards = reports.map((r) => ({ ...toCard(r, tags, linkBase), related: (r.meta.related ?? []).filter((s) => visible.has(s)) }));
  const bySlug = new Map(cards.map((c) => [c.slug, c]));
  return {
    site,
    cards,
    tags,
    usedTags: usedTags(reports, tags),
    domains: usedDomains(reports),
    months: byMonth(reports).map((m) => ({ ym: m.ym, year: m.year, month: m.month, cards: m.reports.map((r) => bySlug.get(r.slug)!) })),
    find: (slug) => bySlug.get(slug),
    coTags: (tag) => usedTags(reports.filter((r) => r.meta.tags.includes(tag)), tags).filter((t) => t.key !== tag),
  };
}

const cache: Partial<Record<Site, SiteView>> = {};

export function siteView(site: Site): SiteView {
  const hit = cache[site];
  if (hit) return hit;
  const cfg = loadConfig();
  const { reports, issues } = loadReports(cfg.root);
  const tagLoad = loadTags(cfg.root);
  const all = [...issues, ...tagLoad.issues];
  if (all.length) {
    throw new Error(`报告数据不合法，先运行 rh check：\n${all.map((i) => `  ${i.where}: ${i.message}`).join("\n")}`);
  }
  return (cache[site] = projectSite(site, reports, tagLoad.tags, cfg.publicUrl));
}

/**
 * @param linkBase 私有站点里，公开报告的链接与缩略图用公开站点的绝对 URL；公开站点传空串。
 */
function toCard(r: Report, tags: TagRegistry, linkBase: string): Omit<CardData, "related"> {
  const base = r.meta.visibility === "public" ? linkBase : "";
  const hasEn = existsSync(join(r.dir, REPORT_FILES.htmlEn));
  const hasCard = existsSync(join(r.dir, REPORT_FILES.cardPng));
  return {
    slug: r.slug,
    title: r.meta.title,
    summary: r.meta.summary,
    title_en: r.meta.title_en,
    summary_en: r.meta.summary_en,
    created: r.meta.created,
    updated: r.meta.updated,
    domain: r.meta.domain,
    domainLabel: DOMAIN_LABELS[r.meta.domain],
    tags: r.meta.tags.map((k) => ({ key: k, label: tags[k]?.label ?? k })),
    visibility: r.meta.visibility,
    href: `${base}${reportPath(r)}`,
    href_en: hasEn ? `${base}${reportEnPath(r)}` : undefined,
    thumb: hasCard ? `${base}${reportPath(r)}${THUMB_FILE}` : undefined,
  };
}

/** 按创建年月分组：[{ ym: "2026-10", year, month, reports }]，新的在前。 */
function byMonth(reports: Report[]) {
  const groups = new Map<string, Report[]>();
  for (const r of reports) {
    const ym = r.meta.created.slice(0, 7);
    groups.set(ym, [...(groups.get(ym) ?? []), r]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([ym, rs]) => ({ ym, year: ym.slice(0, 4), month: ym.slice(5, 7), reports: sortByUpdated(rs) }));
}

/** 报告中实际用到的标签（按使用次数、再按键排序）。 */
function usedTags(reports: Report[], tags: TagRegistry): TagCount[] {
  const count = new Map<string, number>();
  for (const r of reports) for (const t of r.meta.tags) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count.entries()]
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([key, n]) => ({ key, label: tags[key]?.label ?? key, count: n }));
}

function usedDomains(reports: Report[]) {
  const set = new Set(reports.map((r) => r.meta.domain));
  return (Object.keys(DOMAIN_LABELS) as Domain[]).filter((d) => set.has(d)).map((d) => ({ key: d, label: DOMAIN_LABELS[d] }));
}

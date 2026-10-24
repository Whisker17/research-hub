/**
 * Astro 页面使用的站点数据。只在构建时运行（读文件系统）。
 *
 * 按站点投影（ADR 0003 §3）：页面只读 siteView("public") / siteView("private")，不直接读报告列表。
 *  - 公开站点：只有 public + published 报告，以及只被它们用到的标签；所有列表、计数、标签共现、
 *    缩略图、related 链接都从这个集合计算。
 *  - 私有站点：全部 published 报告；链接与缩略图一律指向 /p/<slug>/（public 报告在私有站点上有镜像，ADR 0005 §1）。
 *  - draft 不出现在任何站点。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config.ts";
import { parseLedger } from "./ledger.ts";
import { REPORT_FILES, isPublicPublished, isPublished, loadReports, loadTags, reportPath, sortByUpdated, type Report } from "./reports.ts";
import { DOMAIN_LABELS, type Domain, type TagRegistry } from "./schema.ts";

export type Site = "public" | "private";

/** rh build 从 card.png 生成的列表缩略图，放在报告目录里（/r/<slug>/ 与 /p/<slug>/）。 */
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
  /** label_en：tags.yml 的英文展示名（可缺，英文界面回退 label） */
  tags: { key: string; label: string; label_en?: string }[];
  visibility: "public" | "private";
  href: string;
  href_en?: string;
  /** 列表缩略图（有 card.png 时） */
  thumb?: string;
  /** related 里本站可见的报告 slug */
  related: string[];
  /** 论断台账（research/ledger.md）按类型计数；导入报告（kind: imported）没有台账，是 null（页面显示 n/a） */
  ledger: LedgerCount | null;
}

export interface LedgerCount {
  total: number;
  observed: number;
  inferred: number;
  speculative: number;
}

export interface TagCount {
  key: string;
  label: string;
  label_en?: string;
  count: number;
}

/** 标签页（WHI-1932）用的一个标签：全部字段都只从本站投影计算。 */
export interface TagDetail extends TagCount {
  /** tags.yml 的可选描述（ADR 0003 §6）；只有本站报告用到的标签才有 */
  description?: string;
  description_en?: string;
  /** 用到该标签的本站报告，按 updated 倒序 */
  cards: CardData[];
  /** 这些报告里最新的 updated */
  updated: string;
  /** 特色配图：这些报告里最近更新、且有缩略图的一篇；都没有缩略图时为 undefined */
  featured?: CardData;
  /** 相关标签：与它同时出现在本站报告上的其他标签及次数（= coTags） */
  related: TagCount[];
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
  /** 本站报告用到的领域及篇数（按 DOMAIN_LABELS 的顺序） */
  domains: { key: Domain; label: string; count: number }[];
  /** 按创建年月分组，新的在前；updated 是该月报告里最新的 updated */
  months: { ym: string; year: string; month: string; updated: string; cards: CardData[] }[];
  /** 本站可见的报告；私有、draft 或不存在时返回 undefined。引用报告的页面（如 Daily）必须经过它。 */
  find(slug: string): CardData | undefined;
  /** 与 tag 同时出现在本站报告上的其他标签及次数 */
  coTags(tag: string): TagCount[];
  /** 本站报告用到的标签的详情；本站没有用到时返回 undefined */
  tag(key: string): TagDetail | undefined;
}

/** 纯函数：从全部报告与标签登记表算出一个站点的投影。 */
export function projectSite(site: Site, all: Report[], registry: TagRegistry): SiteView {
  const reports = sortByUpdated(all.filter(site === "public" ? isPublicPublished : isPublished));
  const visible = new Set(reports.map((r) => r.slug));
  const used = new Set(reports.flatMap((r) => r.meta.tags));
  const tags: TagRegistry = Object.fromEntries(Object.entries(registry).filter(([k]) => used.has(k)));
  const cards = reports.map((r) => ({ ...toCard(r, tags, site), related: (r.meta.related ?? []).filter((s) => visible.has(s)) }));
  const bySlug = new Map(cards.map((c) => [c.slug, c]));
  const tagCounts = usedTags(reports, tags);
  const coTags = (tag: string) => usedTags(reports.filter((r) => r.meta.tags.includes(tag)), tags).filter((t) => t.key !== tag);
  return {
    site,
    cards,
    tags,
    usedTags: tagCounts,
    domains: usedDomains(reports),
    months: byMonth(reports).map((m) => ({ ym: m.ym, year: m.year, month: m.month, updated: m.reports[0].meta.updated, cards: m.reports.map((r) => bySlug.get(r.slug)!) })),
    find: (slug) => bySlug.get(slug),
    coTags,
    tag: (key) => {
      const t = tagCounts.find((u) => u.key === key);
      if (!t) return undefined;
      // cards 已按 updated 倒序
      const tagged = cards.filter((c) => c.tags.some((x) => x.key === key));
      return { ...t, description: tags[key]?.description, description_en: tags[key]?.description_en, cards: tagged, updated: tagged[0].updated, featured: tagged.find((c) => c.thumb), related: coTags(key) };
    },
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
  return (cache[site] = projectSite(site, reports, tagLoad.tags));
}

/** 私有站点上每篇报告都在 /p/<slug>/（public 报告是镜像）；公开站点只有 public 报告，在 /r/<slug>/。 */
function toCard(r: Report, tags: TagRegistry, site: Site): Omit<CardData, "related"> {
  const path = site === "private" ? `/p/${r.slug}/` : reportPath(r);
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
    tags: r.meta.tags.map((k) => ({ key: k, ...tagName(tags, k) })),
    visibility: r.meta.visibility,
    href: path,
    href_en: hasEn ? `${path}en/` : undefined,
    thumb: hasCard ? `${path}${THUMB_FILE}` : undefined,
    ledger: r.meta.kind === "imported" ? null : ledgerCount(join(r.dir, REPORT_FILES.ledger)),
  };
}

/** 台账里各类型论断的条数；台账缺失时全是 0（已发布的原生报告由 rh check 保证有台账）。 */
function ledgerCount(file: string): LedgerCount {
  const rows = existsSync(file) ? parseLedger(readFileSync(file, "utf8")).rows : [];
  const n = (k: string) => rows.filter((r) => r.kind === k).length;
  return { total: rows.length, observed: n("observed"), inferred: n("inferred"), speculative: n("speculative") };
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
    .map(([key, n]) => ({ key, ...tagName(tags, key), count: n }));
}

/** 标签的展示名：label（未登记时用键）；有 label_en 时才带上这个字段。 */
function tagName(tags: TagRegistry, key: string): { label: string; label_en?: string } {
  const t = tags[key];
  return t?.label_en ? { label: t.label, label_en: t.label_en } : { label: t?.label ?? key };
}

function usedDomains(reports: Report[]) {
  const count = (d: Domain) => reports.filter((r) => r.meta.domain === d).length;
  return (Object.keys(DOMAIN_LABELS) as Domain[]).filter((d) => count(d) > 0).map((d) => ({ key: d, label: DOMAIN_LABELS[d], count: count(d) }));
}

/*
 * 列表的排序与时间范围（ADR 0003 §7，WHI-1930）。
 *
 * - 排序：sort = "updated"（最近更新，默认）或 "created"（最新创建）。按该日期倒序；同一天再按另一个日期倒序；
 *   再相同按 slug 升序——结果与输入顺序无关。"updated" 的顺序与 projectSite 给出的 cards 顺序（sortByUpdated）一致，
 *   所以没有脚本时服务端渲染的顺序就是默认顺序。
 * - 时间范围：range = "week"（本周）/ "month"（本月）/ "all"。比较的日期字段就是当前排序用的字段
 *   （最近更新 → updated，最新创建 → created）。报告日期是不带时区的日历日期（YYYY-MM-DD），直接按日期比较。
 *   本周 = 浏览者本地时区的当前日历周，周一到周日（含两端）；本月 = 本地时区的当前日历月，1 日到月末（含两端）。
 * - 何时计算：在浏览器里、打开页面时按浏览者本地时间计算（now = new Date()），不在构建时算——站点只在发布时
 *   重新构建，构建时算出的“本周”过几天就错了。没有脚本时不显示排序与时间范围控件，列表是全部 + 最近更新。
 *
 * 这个函数会以源码形式内联进 ReportList 的 <script is:inline>（arrangeCards.toString()），
 * 所以必须自成一体：不引用模块里的其他变量，也不用嵌套的具名函数。
 */
export type SortKey = "updated" | "created";
export type RangeKey = "week" | "month" | "all";

export function arrangeCards<T extends { slug: string; created: string; updated: string }>(cards: T[], sort: SortKey, range: RangeKey, now: Date): T[] {
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const y = now.getFullYear();
  const m = now.getMonth();
  // 周一 = 0 … 周日 = 6
  const monday = now.getDate() - ((now.getDay() + 6) % 7);
  const lo = range === "week" ? ymd(new Date(y, m, monday)) : ymd(new Date(y, m, 1));
  const hi = range === "week" ? ymd(new Date(y, m, monday + 6)) : ymd(new Date(y, m + 1, 0));
  const other = sort === "created" ? "updated" : "created";
  return cards
    .filter((c) => range === "all" || (c[sort] >= lo && c[sort] <= hi))
    .sort((a, b) => (a[sort] !== b[sort] ? (a[sort] < b[sort] ? 1 : -1) : a[other] !== b[other] ? (a[other] < b[other] ? 1 : -1) : a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

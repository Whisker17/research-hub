/**
 * Daily Topics 的数据模型、派生字段与确定性检查（ADR 0004）。CLI（rh daily）与 Astro 构建（WHI-1936）共用。
 *
 * 布局（ADR 0004 §6）：
 *   daily/state.yml                     人工状态，只由 rh topic 写（WHI-1935）
 *   daily/YYYY/MM/DD/manifest.json      运行记录，只由 rh daily import（commit job）写
 *   daily/YYYY/MM/DD/topics.yml         推荐：判断类字段来自生成器，id / evidence / items 由 rh 写
 *
 * 这里没有任何联网或调用 LLM 的代码；同样的输入一定得到同样的输出。
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { loadReports, loadTags } from "./reports.ts";
import { SLUG_RE, formatZodIssues, isValidDate } from "./schema.ts";
import { projectSite } from "./site-data.ts";

// ───────────────────────── 常量 ─────────────────────────

export const DAILY_DIR = "daily";
export const STATE_FILE = "state.yml";
export const DAY_FILES = { manifest: "manifest.json", topics: "topics.yml" } as const;
/** 生成器（模型）的候选目录里只能有这一个文件（ADR 0004 §7）。manifest 由 job 和 rh 写，不由模型写。 */
export const CANDIDATE_FILE = "topics.yml";
export const CANDIDATE_MAX_BYTES = 64 * 1024;

export const MAX_TOPICS = 10;
export const TARGET_TOPICS = 5;
/** topic 公开文字和被引用条目摘录有连续这么多个相同字符，就判定为转载（ADR 0004 §3） */
export const VERBATIM_CHARS = 50;
export const EXCERPT_MAX = 400;

/** 文本字段的长度上限（字符数）。 */
export const LIMITS = {
  title: 120,
  title_en: 200,
  why_now: 800,
  question: 300,
  angle: 600,
  refNote: 300,
  dayNote: 600,
  tags: 8,
  proposedTags: 4,
  related: 6,
} as const;

export const DAY_STATUSES = ["pending", "complete", "degraded", "empty"] as const;
export type DayStatus = (typeof DAY_STATUSES)[number];
export const isFinalStatus = (s: DayStatus): boolean => s !== "pending";

/** 原因代码（ADR 0004 §5）。公开页面把代码映射成固定说明，不显示原始错误。顺序即输出顺序。 */
export const REASONS = [
  "digest_not_posted",
  "digest_fetch_failed",
  "generator_failed",
  "candidate_rejected",
  "few_topics",
  "no_qualifying_topic",
  "no_items",
] as const;
export type Reason = (typeof REASONS)[number];

/** 被丢弃 topic 的内部原因代码（写进 manifest.dropped，不公开）。 */
export const DROP_CODES = [
  "schema",
  "forged_reference",
  "duplicate_reference",
  "duplicate_topic",
  "tag",
  "proposed_tag",
  "related",
  "primary_note",
  "evidence",
  "verbatim",
] as const;
export type DropCode = (typeof DROP_CODES)[number];

/**
 * 源的类别决定出处算法和引用的默认类型（ADR 0004 §8）：
 *  - x：通过 ETHTAO 日报二跳拿到的 X 帖子（默认 secondary，出处是原帖作者或 card.url）
 *  - forum：一手论坛（默认 primary，出处是条目 URL 的主机名）
 *  - news：报道类（默认 secondary，出处是条目 URL 的主机名）
 *  - aggregator：聚合快讯（默认 secondary，只有 origin_url 才算出处）
 * WHI-1931 接入新源时在这里登记；item_id 的前缀必须是这里的键。
 */
export const DAILY_SOURCES = {
  ethtao: "x",
  ethresearch: "forum",
  magicians: "forum",
  theblock: "news",
  blockbeats: "aggregator",
  odaily: "aggregator",
} as const satisfies Record<string, "x" | "forum" | "news" | "aggregator">;
export type SourceId = keyof typeof DAILY_SOURCES;
export type SourceKind = (typeof DAILY_SOURCES)[SourceId];
const isSourceId = (s: string): s is SourceId => Object.hasOwn(DAILY_SOURCES, s);

export const REF_TYPES = ["primary", "secondary", "discussion"] as const;
export type RefType = (typeof REF_TYPES)[number];
const REF_RANK: Record<RefType, number> = { discussion: 0, secondary: 1, primary: 2 };

// ───────────────────────── 基础类型 ─────────────────────────

export function isHttpUrl(s: string): boolean {
  if (s !== s.trim() || /\s/.test(s)) return false;
  try {
    const u = new URL(s);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.length > 0;
  } catch {
    return false;
  }
}

/** extra 引用的 canonical 形式：WHATWG 规范化（主机名小写、去默认端口），去掉 #fragment。 */
export function canonicalUrl(s: string): string {
  const u = new URL(s);
  u.hash = "";
  return u.href;
}

const isoDate = z.string().refine(isValidDate, { message: "日期格式必须是 YYYY-MM-DD" });
const datetime = z.iso.datetime({ message: "时间必须是 UTC ISO 8601（…Z）" });
const httpUrl = z.string().max(2048).refine(isHttpUrl, { message: "必须是 http(s) URL" });
const slug = z.string().regex(SLUG_RE, { message: "只能用小写字母、数字和连字符" });
const text = (max: number) => z.string().trim().min(1).max(max);
const uniq = <T extends z.ZodType>(item: T, max: number) =>
  z.array(item).max(max).refine((a) => new Set(a).size === a.length, { message: "有重复项" });

/** item_id = `<source>:<源内稳定 id>`，例如 ethtao:2111165223780454451（解析后的 X 原帖 id）、odaily:525462 */
export const ITEM_ID_RE = /^[a-z0-9]+:[A-Za-z0-9._~-]{1,128}$/;
export const TOPIC_ID_RE = /^\d{4}-\d{2}-\d{2}-[0-9a-f]{6}$/;
const itemId = z.string().regex(ITEM_ID_RE, { message: "item_id 必须是 <source>:<id>" });
const topicIdSchema = z.string().regex(TOPIC_ID_RE, { message: "topic id 必须是 YYYY-MM-DD-<6 位十六进制>" });

// ───────────────────────── 条目（Item） ─────────────────────────

const itemMetaShape = {
  source: z.string().refine(isSourceId, { message: `source 必须是已登记的源（${Object.keys(DAILY_SOURCES).join("、")}）` }),
  /** canonical URL（X 帖子是解析后的原帖） */
  url: httpUrl,
  /** 真正的出处：X 原帖的 card.url、BlockBeats 的 url、Odaily 的 sourceUrl */
  origin_url: httpUrl.nullable(),
  /** 新闻、论坛主题、X Article 的标题；X 普通帖子为 null */
  title: z.string().trim().min(1).max(300).nullable(),
  /** X 原帖作者（handle，不带 @） */
  author: z.string().trim().min(1).max(100).nullable(),
  reposted_by: z.string().trim().min(1).max(100).nullable(),
  /** ETHTAO 当天日报帖子的链接 */
  via: httpUrl.nullable(),
  published_at: datetime,
  fetched_at: datetime,
  /** X Article 只有标题和预览时为 true */
  incomplete: z.boolean(),
};

type ItemMetaRaw = { [K in keyof typeof itemMetaShape]: z.infer<(typeof itemMetaShape)[K]> };

function refineItem(it: ItemMetaRaw & { id?: string }, ctx: z.RefinementCtx): void {
  if (!isSourceId(it.source)) return;
  if (it.id !== undefined && !it.id.startsWith(`${it.source}:`)) {
    ctx.addIssue({ code: "custom", path: ["id"], message: `item_id 的前缀必须是 source（${it.source}:）` });
  }
  if (DAILY_SOURCES[it.source] === "x") {
    if (!it.author) ctx.addIssue({ code: "custom", path: ["author"], message: "X 帖子必须有原帖作者" });
    if (!it.via) ctx.addIssue({ code: "custom", path: ["via"], message: "日报二跳的帖子必须有 via（日报链接）" });
    // X 普通帖子没有标题；有标题的是 X Article，keyless 只拿得到标题和预览，所以必须标成 incomplete。
    if (it.title !== null && !it.incomplete) ctx.addIssue({ code: "custom", path: ["incomplete"], message: "X Article 只有标题和预览，incomplete 必须为 true" });
    if (it.title === null && it.incomplete) ctx.addIssue({ code: "custom", path: ["incomplete"], message: "X 普通帖子是完整的，incomplete 不能为 true" });
  } else {
    if (it.title === null) ctx.addIssue({ code: "custom", path: ["title"], message: "非 X 条目必须有标题" });
    if (it.incomplete) ctx.addIssue({ code: "custom", path: ["incomplete"], message: "只有 X Article 预览可以标 incomplete" });
  }
}

/** topics.yml 的 items 里每条被引用条目的元数据（不存正文和摘录）。 */
export const itemMetaSchema = z.strictObject(itemMetaShape).superRefine(refineItem);
export type ItemMeta = z.infer<typeof itemMetaSchema> & { source: SourceId };

/** rh ingest（WHI-1931）写的 items.jsonl 的一行：元数据 + id + 不超过 400 字的摘录。只放在 artifact / .rh/，不进仓库。 */
export const itemSchema = z
  .strictObject({ id: itemId, ...itemMetaShape, excerpt: z.string().max(EXCERPT_MAX) })
  .superRefine(refineItem);
export type Item = z.infer<typeof itemSchema> & { source: SourceId };

export const itemMeta = (it: Item): ItemMeta => {
  const { id: _id, excerpt: _excerpt, ...meta } = it;
  return meta;
};

// ───────────────────────── Topic ─────────────────────────

const refCommon = { note: text(LIMITS.refNote).optional() };
const itemRef = z.strictObject({ item_id: itemId, type: z.enum(REF_TYPES), ...refCommon });
const extraRef = z.strictObject({ extra: httpUrl, type: z.enum(REF_TYPES), ...refCommon });
export const referenceSchema = z.union([itemRef, extraRef]);
export type Reference = z.infer<typeof referenceSchema>;

/** 生成器写的判断类字段（ADR 0004 §7）。 */
const generatorShape = {
  title: text(LIMITS.title),
  title_en: text(LIMITS.title_en),
  domain: z.literal("crypto", { message: "0.1.0 的 domain 只能是 crypto" }),
  tags: uniq(slug, LIMITS.tags).default([]),
  proposed_tags: uniq(slug, LIMITS.proposedTags).default([]),
  why_now: text(LIMITS.why_now),
  questions: z.array(text(LIMITS.question)).min(1).max(3),
  angle: text(LIMITS.angle),
  novelty: z.strictObject({ kind: z.enum(["new", "update"]), related: uniq(slug, LIMITS.related).default([]) }),
  confidence: z.enum(["high", "medium", "low"]),
};

export const topicSchema = z.strictObject({
  id: topicIdSchema,
  ...generatorShape,
  references: z.array(referenceSchema).min(1).max(6),
  evidence: z.strictObject({ independent_sources: z.number().int().min(0) }),
});
export type Topic = z.infer<typeof topicSchema>;

/** 候选（不可信）里的 topic：没有 id / evidence（由 rh 填），引用的 type 可以省略（rh 填默认值）。 */
const candidateTopicSchema = z.strictObject({
  ...generatorShape,
  references: z
    .array(
      z.union([
        z.strictObject({ item_id: itemId, type: z.enum(REF_TYPES).optional(), ...refCommon }),
        z.strictObject({ extra: httpUrl, type: z.enum(REF_TYPES).optional(), ...refCommon }),
      ]),
    )
    .min(1)
    .max(6),
});

export const topicsFileSchema = z.strictObject({
  schema: z.literal(1),
  date: isoDate,
  /** 生成器对“为什么不足 5 条”等的说明：公开文字 */
  note: text(LIMITS.dayNote).optional(),
  topics: z.array(topicSchema).max(MAX_TOPICS),
  items: z.record(itemId, itemMetaSchema),
});
export type TopicsFile = z.infer<typeof topicsFileSchema>;

const candidateFileSchema = z.strictObject({
  schema: z.literal(1),
  date: isoDate,
  note: text(LIMITS.dayNote).optional(),
  topics: z.array(z.unknown()).max(MAX_TOPICS),
});

// ───────────────────────── Manifest ─────────────────────────

const span = z.strictObject({ from: datetime, to: datetime });

export const manifestSchema = z.strictObject({
  schema: z.literal(1),
  date: isoDate,
  status: z.enum(DAY_STATUSES),
  reasons: uniq(z.enum(REASONS), REASONS.length),
  window: span,
  digest: z.strictObject({
    status: z.enum(["found", "not_posted", "fetch_failed"]),
    url: httpUrl.nullable(),
    posted_at: datetime.nullable(),
  }),
  sources: z.array(
    z.strictObject({
      id: z.string().refine(isSourceId, { message: "未登记的源" }),
      status: z.enum(["ok", "partial", "failed", "skipped"]),
      items: z.number().int().min(0),
      calls: z.number().int().min(0),
      covered: span.nullable(),
      error: z.string().max(500).nullable(),
    }),
  ),
  counts: z.strictObject({
    items: z.number().int().min(0),
    cited_items: z.number().int().min(0),
    topics: z.number().int().min(0).max(MAX_TOPICS),
    dropped: z.number().int().min(0),
    /** dailyAvoidTerms 警告数 */
    warnings: z.number().int().min(0),
  }),
  /** 被丢弃的候选 topic（下标从 0 起）与原因代码 */
  dropped: z.array(z.strictObject({ topic: z.number().int().min(0), reason: z.enum(DROP_CODES) })),
  /** 由 job 写，不由模型写；没有调用生成时为 null */
  generator: z.strictObject({ skill_version: text(100), model: text(100), inputs_sha256: z.string().regex(/^[0-9a-f]{64}$/) }).nullable(),
  /** at = ingest 查找日报的时刻 t（ADR 0004 §4 按它判断是否到了 T_last） */
  run: z.strictObject({ id: text(100), attempt: z.number().int().min(1), at: datetime }),
  generated_at: datetime.nullable(),
  updated_at: datetime,
});
export type Manifest = z.infer<typeof manifestSchema>;

// ───────────────────────── 人工状态（state.yml） ─────────────────────────

const stateEntrySchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("selected"), at: isoDate }),
  z.strictObject({ state: z.literal("dismissed"), at: isoDate, reason: text(300) }),
  z.strictObject({ state: z.literal("linked"), at: isoDate, report: slug }),
]);
export type StateEntry = z.infer<typeof stateEntrySchema>;
export type TopicState = StateEntry["state"];

export const stateFileSchema = z.strictObject({
  schema: z.literal(1),
  topics: z.record(topicIdSchema, stateEntrySchema).default({}),
});
export type StateFile = z.infer<typeof stateFileSchema>;

/** 合法的状态转移（ADR 0004 §9）。linked 是终态；没有转回“无”的路径。rh topic（WHI-1935）用它。 */
export const TOPIC_TRANSITIONS: Record<TopicState | "none", readonly TopicState[]> = {
  none: ["selected", "dismissed"],
  selected: ["linked", "dismissed"],
  dismissed: ["selected"],
  linked: [],
};

/**
 * 一个 topic 从 prev 变成 next 是否合法；合法返回 null。
 * 同一状态重复执行（幂等）合法，但 link 到另一个 slug 不合法。删除条目不合法。
 */
export function transitionError(prev: StateEntry | undefined, next: StateEntry | undefined): string | null {
  if (!next) return prev ? `不能删除人工状态（原来是 ${prev.state}）` : null;
  if (prev?.state === next.state) {
    if (prev.state === "linked" && next.state === "linked" && prev.report !== next.report) return `已 link 到 ${prev.report}，不能改 link 到 ${next.report}`;
    return null;
  }
  const from = prev?.state ?? "none";
  return TOPIC_TRANSITIONS[from].includes(next.state) ? null : `不允许 ${from} → ${next.state}`;
}

/**
 * rh topic 的一次状态变更（WHI-1935）。返回新的 state（不改原对象），或者错误。
 * 幂等：已经是目标状态时原样返回（changed: false），保留原来的 at / reason，不丢人工记录；
 * linked 到另一个 slug 由 transitionError 拒绝。
 */
export function applyTopicState(state: StateFile, id: string, next: StateEntry): { state: StateFile; changed: boolean } | { error: string } {
  const prev = state.topics[id];
  const error = transitionError(prev, next);
  if (error) return { error };
  if (prev?.state === next.state) return { state, changed: false };
  const topics = Object.fromEntries(Object.entries({ ...state.topics, [id]: next }).sort(([a], [b]) => a.localeCompare(b)));
  return { state: { schema: 1, topics }, changed: true };
}

export function stateChangeErrors(before: StateFile, after: StateFile): string[] {
  const ids = [...new Set([...Object.keys(before.topics), ...Object.keys(after.topics)])].sort();
  return ids.flatMap((id) => {
    const e = transitionError(before.topics[id], after.topics[id]);
    return e ? [`state.yml ${id}: ${e}`] : [];
  });
}

// ───────────────────────── 派生字段 ─────────────────────────

export const refKey = (r: { item_id: string } | { extra: string }): string => ("item_id" in r ? r.item_id : `extra:${r.extra}`);

/**
 * topic id = `D-` + sha256 的前 6 位十六进制；哈希内容是排序后的引用键（item_id 或 extra:<canonical URL>），用 "\n" 连接。
 * 只改措辞时 id 不变；同一天两个 topic 引用完全相同就是重复。
 */
export function topicId(date: string, refs: ({ item_id: string } | { extra: string })[]): string {
  const keys = refs.map(refKey).sort();
  return `${date}-${createHash("sha256").update(keys.join("\n")).digest("hex").slice(0, 6)}`;
}

const X_HOSTS = new Set(["x.com", "twitter.com", "mobile.twitter.com", "mobile.x.com"]);

/** URL 的出处键：主机名（小写、去 www.）；x.com / twitter.com 按账号 x:<handle>，github.com 按 github:<owner>。 */
export function hostKey(url: string): string {
  const u = new URL(url);
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const first = u.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  if (X_HOSTS.has(host)) return first && first !== "i" ? `x:${first}` : "x.com";
  if (host === "github.com" && first) return `github:${first}`;
  return host;
}

/** 条目的出处（ADR 0004 §8）；聚合源的条目没有出处链接时返回 null（计 0）。 */
export function originator(it: ItemMeta): string | null {
  if (it.origin_url) return hostKey(it.origin_url);
  const kind = DAILY_SOURCES[it.source];
  if (kind === "x") return `x:${it.author!.replace(/^@/, "").toLowerCase()}`;
  if (kind === "forum" || kind === "news") return hostKey(it.url);
  return null;
}

/** 引用里不同出处的个数；extra 不计入。 */
export function independentSources(refs: Reference[], items: Record<string, ItemMeta>): number {
  const set = new Set<string>();
  for (const r of refs) {
    if (!("item_id" in r)) continue;
    const it = items[r.item_id];
    const o = it && originator(it);
    if (o) set.add(o);
  }
  return set.size;
}

/** 源类别给出的默认引用类型：论坛 → primary；其他（新闻、聚合、日报二跳的 X 帖子）和 extra → secondary。 */
export const defaultRefType = (it: ItemMeta | undefined): RefType => (it && DAILY_SOURCES[it.source] === "forum" ? "primary" : "secondary");

// ───────────────────────── 规则检查 ─────────────────────────

export interface DailyContext {
  /** 公开标签投影：至少被一篇 public + published 报告用到的标签（ADR 0003 §6） */
  publicTags: Set<string>;
  /** 经过 projectSite("public") 的 find()：只有 public + published 报告为 true */
  isPublicReport(slug: string): boolean;
  /** 任何报告（含 private、draft）是否存在：state.yml 的 linked 用 */
  reportExists(slug: string): boolean;
  avoidTerms: string[];
}

/** 从仓库读出检查用的上下文。related 与标签都走公开站点投影（lib/site-data.ts 的 projectSite，siteView 的纯函数版本）。 */
export function loadDailyContext(root: string, avoidTerms: string[]): DailyContext {
  const { reports } = loadReports(root);
  const view = projectSite("public", reports, loadTags(root).tags);
  const all = new Set(reports.map((r) => r.slug));
  return {
    publicTags: new Set(Object.keys(view.tags)),
    isPublicReport: (s) => view.find(s) !== undefined,
    reportExists: (s) => all.has(s),
    avoidTerms,
  };
}

interface Problem {
  code: DropCode;
  message: string;
}

type GeneratorFields = Omit<Topic, "id" | "references" | "evidence">;

/** 和生成器判断相关的规则：引用、标签、related、一手来源、证据（ADR 0004 §7、§8）。import 与 check 共用。 */
export function topicProblems(t: GeneratorFields & { references: Reference[] }, items: Record<string, ItemMeta>, ctx: DailyContext): Problem[] {
  const p: Problem[] = [];
  const keys = t.references.map(refKey);
  if (new Set(keys).size !== keys.length) p.push({ code: "duplicate_reference", message: "同一个引用出现了两次" });
  for (const r of t.references) {
    if ("item_id" in r && !Object.hasOwn(items, r.item_id)) p.push({ code: "forged_reference", message: `引用的条目 ${r.item_id} 不存在` });
  }
  for (const tag of t.tags) if (!ctx.publicTags.has(tag)) p.push({ code: "tag", message: `标签 ${tag} 不在公开标签投影里（未登记的标签放 proposed_tags）` });
  for (const tag of t.proposed_tags) {
    if (ctx.publicTags.has(tag) || t.tags.includes(tag)) p.push({ code: "proposed_tag", message: `proposed_tags 的 ${tag} 已是公开标签` });
  }
  for (const s of t.novelty.related) if (!ctx.isPublicReport(s)) p.push({ code: "related", message: `related 的 ${s} 不是 public + published 报告` });
  if (t.novelty.kind === "update" && t.novelty.related.length === 0) p.push({ code: "related", message: "kind: update 时 related 不能为空" });
  for (const r of t.references) {
    const def = defaultRefType("item_id" in r ? items[r.item_id] : undefined);
    if (REF_RANK[r.type] > REF_RANK[def] && !r.note) {
      p.push({ code: "primary_note", message: `${refKey(r)} 被上调为 ${r.type}，note 里必须写明这是谁的一手陈述` });
    }
  }
  const hasPrimary = t.references.some((r) => "item_id" in r && r.type === "primary" && Object.hasOwn(items, r.item_id));
  if (independentSources(t.references, items) < 2 && !hasPrimary) {
    p.push({ code: "evidence", message: "证据不足：需要 ≥2 个独立来源，或至少 1 条 primary 的 item_id 引用（extra 不算）" });
  }
  return p;
}

/** topic 的公开文字（ADR 0004 §3）。 */
export const topicPublicTexts = (t: GeneratorFields & { references: { note?: string }[] }): string[] => [
  t.title,
  t.title_en,
  t.why_now,
  ...t.questions,
  t.angle,
  ...t.references.flatMap((r) => (r.note ? [r.note] : [])),
];

export function avoidTermHits(texts: string[], terms: string[]): string[] {
  const hay = texts.join("\n").toLowerCase();
  return terms.filter((term) => term.trim() && hay.includes(term.toLowerCase()));
}

const normSpace = (s: string): string => s.replace(/\s+/g, " ").trim();

/**
 * 转载比对（ADR 0004 §3）：text 和任一摘录有连续 VERBATIM_CHARS 个以上的字符相同。
 * 空白先规范化；条目标题不算（先从摘录里去掉）。按 Unicode 码点计数。
 */
export function copiesVerbatim(text: string, items: { title: string | null; excerpt: string }[], n = VERBATIM_CHARS): boolean {
  const t = [...normSpace(text)];
  if (t.length < n) return false;
  const corpus = items
    .map((it) => {
      const ex = normSpace(it.excerpt);
      return it.title ? ex.split(normSpace(it.title)).join("\u0000") : ex;
    })
    .filter((s) => [...s].length >= n);
  if (!corpus.length) return false;
  for (let i = 0; i + n <= t.length; i++) {
    const w = t.slice(i, i + n).join("");
    if (corpus.some((s) => s.includes(w))) return true;
  }
  return false;
}

// ───────────────────────── 日期、时间窗与状态机 ─────────────────────────

const addDays = (date: string, n: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** W(D) = [D−1T00:00:00Z, DT00:00:00Z) */
export const dailyWindow = (date: string): { from: string; to: string } => ({ from: `${addDays(date, -1)}T00:00:00.000Z`, to: `${date}T00:00:00.000Z` });

/** D 的最后一次尝试时刻 T_last(D) = D 13:30 UTC */
export const lastAttempt = (date: string): string => `${date}T13:30:00.000Z`;
export const isLate = (date: string, at: string): boolean => Date.parse(at) >= Date.parse(lastAttempt(date));

export type DigestStatus = Manifest["digest"]["status"];

/** 这次运行是否应该调用生成（ADR 0004 §5）：有条目，并且找到了日报或已经到了 T_last。 */
export const shouldGenerate = (digest: DigestStatus, late: boolean, items: number): boolean => items > 0 && (digest === "found" || late);

/**
 * 一次运行之后的日期状态（ADR 0004 §5 的状态表）。
 * outcome：生成并导入后剩下的 topic 数；"failed" = 生成失败（没有候选）；"rejected" = 候选被整体拒绝；
 * "skipped" = 按规则没有调用生成（只在 shouldGenerate 为 false 时合法：还没到 T_last 且没有日报）。
 */
export function resolveStatus(o: { digest: DigestStatus; late: boolean; items: number; outcome: number | "failed" | "rejected" | "skipped" }): { status: DayStatus; reasons: Reason[] } {
  const reasons = new Set<Reason>();
  if (o.digest === "not_posted") reasons.add("digest_not_posted");
  if (o.digest === "fetch_failed") reasons.add("digest_fetch_failed");
  const done = (status: DayStatus) => ({ status, reasons: REASONS.filter((r) => reasons.has(r)) });
  if (o.items === 0) {
    reasons.add("no_items");
    return done(o.late ? "empty" : "pending");
  }
  if (o.outcome === "skipped") return done("pending");
  if (o.outcome === "failed" || o.outcome === "rejected") {
    reasons.add(o.outcome === "failed" ? "generator_failed" : "candidate_rejected");
    return done(o.late ? "empty" : "pending");
  }
  if (o.outcome === 0) {
    reasons.add("no_qualifying_topic");
    return done("empty");
  }
  if (o.outcome < TARGET_TOPICS) reasons.add("few_topics");
  return done(reasons.size ? "degraded" : "complete");
}

// ───────────────────────── 候选导入（不可信输入） ─────────────────────────

export interface ImportResult {
  /** 非 null = 整体拒绝（candidate_rejected），值是原因 */
  rejected: string[] | null;
  topics?: TopicsFile;
  dropped: { topic: number; reason: DropCode; message: string }[];
  warnings: string[];
}

const isLink = (p: string): boolean => lstatSync(p).isSymbolicLink();

/** 候选目录的整体检查：只允许一个普通文件 topics.yml；拒绝符号链接、多余文件、路径逃逸和超限。 */
export function candidateDirErrors(dir: string): string[] {
  if (!existsSync(dir) && !isLinkSafe(dir)) return [`候选目录不存在：${dir}`];
  const st = lstatSync(dir);
  if (st.isSymbolicLink()) return ["候选目录是符号链接"];
  if (!st.isDirectory()) return ["候选路径不是目录"];
  const errors: string[] = [];
  const names = readdirSync(dir).sort();
  for (const n of names) if (n !== CANDIDATE_FILE) errors.push(`候选目录里有多余的文件：${n}`);
  if (!names.includes(CANDIDATE_FILE)) return [...errors, `候选目录里缺少 ${CANDIDATE_FILE}`];
  const f = lstatSync(join(dir, CANDIDATE_FILE));
  if (f.isSymbolicLink()) errors.push(`${CANDIDATE_FILE} 是符号链接`);
  else if (!f.isFile()) errors.push(`${CANDIDATE_FILE} 不是普通文件`);
  else if (f.nlink > 1) errors.push(`${CANDIDATE_FILE} 有多个硬链接`);
  else if (f.size > CANDIDATE_MAX_BYTES) errors.push(`${CANDIDATE_FILE} 超过 ${CANDIDATE_MAX_BYTES} 字节`);
  return errors;
}

function isLinkSafe(p: string): boolean {
  try {
    return isLink(p);
  } catch {
    return false;
  }
}

/** 候选里所有 extra URL 都必须是 http(s)：有一个不是就整体拒绝。 */
function candidateUrlErrors(topics: unknown[]): string[] {
  const errors: string[] = [];
  topics.forEach((t, i) => {
    const refs = (t as { references?: unknown } | null)?.references;
    if (!Array.isArray(refs)) return;
    for (const r of refs) {
      if (r && typeof r === "object" && "extra" in r) {
        const u = (r as { extra: unknown }).extra;
        if (typeof u !== "string" || !isHttpUrl(u)) errors.push(`topics[${i}] 的 extra 不是 http(s) URL：${JSON.stringify(u)?.slice(0, 80)}`);
      }
    }
  });
  return errors;
}

/**
 * 把候选目录导入成 topics.yml（ADR 0004 §7）。纯函数（只读候选目录），同样的输入一定得到同样的输出。
 *  1. 整体检查：目录、文件、字节、YAML、顶层 schema、topic 数、URL、date、当天 note 的转载 → 失败就整体拒绝；
 *  2. 逐个检查 topic：schema、伪造引用、标签、related、一手来源、证据、转载、重复 → 失败就丢弃这个 topic；
 *  3. rh 填入 id、引用的默认 type、extra 的 canonical 形式、evidence 和 items。
 */
export function importCandidate(date: string, dir: string, items: Map<string, Item>, ctx: DailyContext): ImportResult {
  const reject = (rejected: string[]): ImportResult => ({ rejected, dropped: [], warnings: [] });
  const dirErrors = candidateDirErrors(dir);
  if (dirErrors.length) return reject(dirErrors);

  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(join(dir, CANDIDATE_FILE), "utf8"), { maxAliasCount: 0 });
  } catch (e) {
    return reject([`${CANDIDATE_FILE} 不是合法 YAML：${(e as Error).message.split("\n")[0]}`]);
  }
  const top = candidateFileSchema.safeParse(raw);
  if (!top.success) return reject(formatZodIssues(top.error).map((m) => `${CANDIDATE_FILE} ${m}`));
  if (top.data.date !== date) return reject([`候选的 date（${top.data.date}）不是 ${date}`]);
  const urlErrors = candidateUrlErrors(top.data.topics);
  if (urlErrors.length) return reject(urlErrors);
  const allItems = [...items.values()];
  if (top.data.note && copiesVerbatim(top.data.note, allItems)) return reject(["当天的 note 转载了条目摘录"]);

  const metas: Record<string, ItemMeta> = Object.fromEntries([...items].map(([k, v]) => [k, itemMeta(v)]));
  const dropped: ImportResult["dropped"] = [];
  const warnings: string[] = [];
  const topics: Topic[] = [];
  const seen = new Set<string>();
  top.data.topics.forEach((rawTopic, i) => {
    const drop = (reason: DropCode, message: string) => dropped.push({ topic: i, reason, message });
    const parsed = candidateTopicSchema.safeParse(rawTopic);
    if (!parsed.success) return drop("schema", formatZodIssues(parsed.error).join("；"));
    const c = parsed.data;
    const references: Reference[] = c.references.map((r) => {
      const type = r.type ?? defaultRefType("item_id" in r ? metas[r.item_id] : undefined);
      const note = r.note === undefined ? {} : { note: r.note };
      return "item_id" in r ? { item_id: r.item_id, type, ...note } : { extra: canonicalUrl(r.extra), type, ...note };
    });
    const t = { ...c, references };
    const problems = topicProblems(t, metas, ctx);
    if (problems.length) return drop(problems[0].code, problems.map((p) => p.message).join("；"));
    const cited = references.flatMap((r) => ("item_id" in r ? [items.get(r.item_id)!] : []));
    if (topicPublicTexts(t).some((s) => copiesVerbatim(s, cited))) return drop("verbatim", "公开文字转载了被引用条目的摘录");
    const id = topicId(date, references);
    if (seen.has(id)) return drop("duplicate_topic", `和前面的 topic 引用完全相同（${id}）`);
    seen.add(id);
    for (const term of avoidTermHits(topicPublicTexts(t), ctx.avoidTerms)) warnings.push(`${id}: 公开文字里有 dailyAvoidTerms 的“${term}”`);
    topics.push(orderTopic({ ...t, id, evidence: { independent_sources: independentSources(references, metas) } }));
  });
  if (top.data.note) for (const term of avoidTermHits([top.data.note], ctx.avoidTerms)) warnings.push(`note: 有 dailyAvoidTerms 的“${term}”`);

  const cited = [...new Set(topics.flatMap((t) => t.references.flatMap((r) => ("item_id" in r ? [r.item_id] : []))))].sort();
  const file: TopicsFile = {
    schema: 1,
    date,
    ...(top.data.note ? { note: top.data.note } : {}),
    topics,
    items: Object.fromEntries(cited.map((k) => [k, metas[k]])),
  };
  return { rejected: null, topics: file, dropped, warnings };
}

/** 固定的字段顺序，让输出稳定、diff 好读。 */
function orderTopic(t: Topic): Topic {
  return {
    id: t.id,
    title: t.title,
    title_en: t.title_en,
    domain: t.domain,
    tags: t.tags,
    proposed_tags: t.proposed_tags,
    why_now: t.why_now,
    questions: t.questions,
    angle: t.angle,
    novelty: { kind: t.novelty.kind, related: t.novelty.related },
    references: t.references,
    evidence: t.evidence,
    confidence: t.confidence,
  };
}

/** 解析 items.jsonl（rh ingest 的产物）。格式错误抛异常：这是 ingest 的问题，不是候选的问题。 */
export function parseItemsJsonl(text: string): Map<string, Item> {
  const items = new Map<string, Item>();
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch (e) {
      throw new Error(`items.jsonl 第 ${i + 1} 行不是合法 JSON：${(e as Error).message}`);
    }
    const r = itemSchema.safeParse(raw);
    if (!r.success) throw new Error(`items.jsonl 第 ${i + 1} 行：${formatZodIssues(r.error).join("；")}`);
    const it = r.data as Item;
    if (items.has(it.id)) throw new Error(`items.jsonl 第 ${i + 1} 行：item_id ${it.id} 重复`);
    items.set(it.id, it);
  });
  return items;
}

// ───────────────────────── 读取与检查已提交的 daily/ ─────────────────────────

export interface Day {
  date: string;
  /** 相对仓库根目录，例如 daily/2026/10/18 */
  relDir: string;
  manifest: Manifest;
  /** status 为 pending 时没有 */
  topics?: TopicsFile;
}

export interface DailyLoad {
  days: Day[];
  state: StateFile;
  /** state.yml 的原文（不存在时为 null） */
  stateText: string | null;
  errors: string[];
}

const IGNORED = new Set([".DS_Store"]);
const entries = (dir: string): string[] => readdirSync(dir).filter((n) => !IGNORED.has(n)).sort();

/** 读 daily/：只允许 state.yml 与 YYYY/MM/DD/{manifest.json,topics.yml}；任何符号链接或多余文件都是错误。 */
export function loadDaily(root: string): DailyLoad {
  const base = join(root, DAILY_DIR);
  const out: DailyLoad = { days: [], state: { schema: 1, topics: {} }, stateText: null, errors: [] };
  if (!existsSync(base) && !isLinkSafe(base)) return out;
  const err = (where: string, m: string) => out.errors.push(`${where}: ${m}`);
  const kind = (p: string, rel: string, want: "dir" | "file"): boolean => {
    const st = lstatSync(p);
    if (st.isSymbolicLink()) return (err(rel, "不允许符号链接"), false);
    if (want === "dir" ? !st.isDirectory() : !st.isFile()) return (err(rel, want === "dir" ? "应该是目录" : "应该是普通文件"), false);
    return true;
  };
  if (!kind(base, DAILY_DIR, "dir")) return out;

  for (const y of entries(base)) {
    const ry = `${DAILY_DIR}/${y}`;
    if (y === STATE_FILE) {
      if (kind(join(base, y), ry, "file")) loadState(join(base, y), out);
      continue;
    }
    if (!/^\d{4}$/.test(y)) {
      err(ry, "多余的文件（daily/ 下只能有 state.yml 与 YYYY/）");
      continue;
    }
    if (!kind(join(base, y), ry, "dir")) continue;
    for (const m of entries(join(base, y))) {
      const rm = `${ry}/${m}`;
      if (!/^(0[1-9]|1[0-2])$/.test(m)) {
        err(rm, "多余的文件（应该是 MM/）");
        continue;
      }
      if (!kind(join(base, y, m), rm, "dir")) continue;
      for (const d of entries(join(base, y, m))) {
        const rd = `${rm}/${d}`;
        const date = `${y}-${m}-${d}`;
        if (!/^\d{2}$/.test(d) || !isValidDate(date)) {
          err(rd, "多余的文件（应该是 DD/）");
          continue;
        }
        if (!kind(join(base, y, m, d), rd, "dir")) continue;
        const day = loadDay(join(base, y, m, d), rd, date, err, kind);
        if (day) out.days.push(day);
      }
    }
  }
  return out;
}

function loadState(file: string, out: DailyLoad): void {
  const text = readFileSync(file, "utf8");
  out.stateText = text;
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (e) {
    out.errors.push(`${DAILY_DIR}/${STATE_FILE}: 不是合法 YAML：${(e as Error).message.split("\n")[0]}`);
    return;
  }
  const r = stateFileSchema.safeParse(raw);
  if (!r.success) out.errors.push(...formatZodIssues(r.error).map((m) => `${DAILY_DIR}/${STATE_FILE}: ${m}`));
  else out.state = r.data;
}

function loadDay(dir: string, rel: string, date: string, err: (w: string, m: string) => void, kind: (p: string, rel: string, want: "dir" | "file") => boolean): Day | null {
  const names = entries(dir);
  for (const n of names) if (n !== DAY_FILES.manifest && n !== DAY_FILES.topics) err(`${rel}/${n}`, "多余的文件（日期目录里只能有 manifest.json 与 topics.yml）");
  if (!names.includes(DAY_FILES.manifest)) return (err(rel, "缺少 manifest.json"), null);
  if (!kind(join(dir, DAY_FILES.manifest), `${rel}/${DAY_FILES.manifest}`, "file")) return null;
  let manifest: Manifest;
  try {
    const r = manifestSchema.safeParse(JSON.parse(readFileSync(join(dir, DAY_FILES.manifest), "utf8")));
    if (!r.success) {
      for (const m of formatZodIssues(r.error)) err(`${rel}/${DAY_FILES.manifest}`, m);
      return null;
    }
    manifest = r.data;
  } catch (e) {
    return (err(`${rel}/${DAY_FILES.manifest}`, `不是合法 JSON：${(e as Error).message}`), null);
  }
  const day: Day = { date, relDir: rel, manifest };
  if (!names.includes(DAY_FILES.topics)) return day;
  const tf = join(dir, DAY_FILES.topics);
  if (!kind(tf, `${rel}/${DAY_FILES.topics}`, "file")) return day;
  try {
    const r = topicsFileSchema.safeParse(parseYaml(readFileSync(tf, "utf8"), { maxAliasCount: 0 }));
    if (!r.success) for (const m of formatZodIssues(r.error)) err(`${rel}/${DAY_FILES.topics}`, m);
    else day.topics = r.data as TopicsFile;
  } catch (e) {
    err(`${rel}/${DAY_FILES.topics}`, `不是合法 YAML：${(e as Error).message.split("\n")[0]}`);
  }
  return day;
}

/**
 * 报告或标签的可见性变化（变成 private / draft、标签不再被公开报告用到）会让旧日期的检查失败：失败即拒绝，
 * 公开页面不能链接到非公开报告。报错时说明怎么修。
 */
const VISIBILITY_CODES = new Set<DropCode>(["tag", "proposed_tag", "related"]);
const VISIBILITY_FIX = (day: Day): string =>
  `。修复：先在 items artifact 的 30 天保留期内用 workflow_dispatch（date=${day.date}，regenerate）重新生成这一天；` +
  `做不到时，只能由所有者在主克隆里删除或改正 ${day.relDir}/${DAY_FILES.topics} 里的这个 topic，作为内容通道的提交`;

/** 一天的不变量：路径与日期、时间窗、状态与数量、重新计算的 id / evidence / items、规则。 */
export function dayErrors(day: Day, ctx: DailyContext, hasTopicsFile: boolean): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const m = day.manifest;
  const at = (f: string) => `${day.relDir}/${f}`;
  const me = (msg: string) => errors.push(`${at(DAY_FILES.manifest)}: ${msg}`);
  if (m.date !== day.date) me(`date（${m.date}）和目录日期 ${day.date} 不一致`);
  const w = dailyWindow(day.date);
  if (Date.parse(m.window.from) !== Date.parse(w.from) || Date.parse(m.window.to) !== Date.parse(w.to)) me(`window 必须是 [${w.from}, ${w.to})`);
  if (m.digest.status === "found" && (!m.digest.url || !m.digest.posted_at)) me("digest 为 found 时必须有 url 与 posted_at");
  if (m.counts.dropped !== m.dropped.length) me(`counts.dropped（${m.counts.dropped}）和 dropped 的条数（${m.dropped.length}）不一致`);
  const n = m.counts.topics;
  const has = (r: Reason) => m.reasons.includes(r);
  if (m.status === "pending") {
    if (hasTopicsFile) me("pending 时不能有 topics.yml");
    if (n !== 0) me("pending 时 counts.topics 必须是 0");
  } else if (!hasTopicsFile) {
    me(`${m.status} 是终态，必须有 topics.yml`);
  }
  if (m.status === "complete" && (n < TARGET_TOPICS || m.digest.status !== "found" || m.reasons.length)) me("complete 要求找到日报、5–10 个 topic、没有原因");
  if (m.status === "degraded" && (n < 1 || !m.reasons.length)) me("degraded 要求 1–10 个 topic，并写明原因");
  if (m.status === "empty" && (n !== 0 || !m.reasons.length)) me("empty 要求 0 个 topic，并写明原因");
  if (m.status !== "pending" && has("few_topics") !== (n >= 1 && n < TARGET_TOPICS)) me("few_topics 当且仅当有 1–4 个 topic");
  if (m.status !== "pending" && !m.generated_at && n > 0) me("有 topic 时必须有 generated_at");

  const tf = day.topics;
  if (!tf) return { errors, warnings };
  const te = (msg: string) => errors.push(`${at(DAY_FILES.topics)}: ${msg}`);
  if (tf.date !== day.date) te(`date（${tf.date}）和目录日期 ${day.date} 不一致`);
  if (tf.topics.length !== n) me(`counts.topics（${n}）和 topics.yml 的 topic 数（${tf.topics.length}）不一致`);
  const cited = new Set(tf.topics.flatMap((t) => t.references.flatMap((r) => ("item_id" in r ? [r.item_id] : []))));
  const keys = Object.keys(tf.items);
  for (const k of keys) if (!cited.has(k)) te(`items 里的 ${k} 没有被任何 topic 引用`);
  if (keys.length !== m.counts.cited_items) me(`counts.cited_items（${m.counts.cited_items}）和 items 的条数（${keys.length}）不一致`);
  for (const k of keys) if (!k.startsWith(`${tf.items[k].source}:`)) te(`items 的 ${k}：前缀必须是 source（${tf.items[k].source}:）`);
  const seen = new Map<string, number>();
  tf.topics.forEach((t, i) => {
    const where = `topics[${i}]（${t.id}）`;
    const id = topicId(day.date, t.references);
    if (t.id !== id) te(`${where}: id 应该是 ${id}（由引用重新计算）`);
    if (seen.has(t.id)) te(`${where}: id 和 topics[${seen.get(t.id)}] 重复`);
    seen.set(t.id, i);
    for (const r of t.references) if ("extra" in r && r.extra !== canonicalUrl(r.extra)) te(`${where}: extra 应该是 canonical 形式 ${canonicalUrl(r.extra)}`);
    const ev = independentSources(t.references, tf.items);
    if (t.evidence.independent_sources !== ev) te(`${where}: evidence.independent_sources 应该是 ${ev}（重新计算）`);
    for (const p of topicProblems(t, tf.items, ctx)) te(`${where}: ${p.message}${VISIBILITY_CODES.has(p.code) ? VISIBILITY_FIX(day) : ""}`);
    for (const term of avoidTermHits(topicPublicTexts(t), ctx.avoidTerms)) warnings.push(`${at(DAY_FILES.topics)} ${where}: 公开文字里有 dailyAvoidTerms 的“${term}”`);
  });
  if (tf.note) for (const term of avoidTermHits([tf.note], ctx.avoidTerms)) warnings.push(`${at(DAY_FILES.topics)} note: 有 dailyAvoidTerms 的“${term}”`);
  return { errors, warnings };
}

/** state.yml 的不变量（ADR 0004 §9）：每个 id 都在某天的 topics.yml 里；linked 的报告存在（draft 也可以）。 */
export function stateErrors(state: StateFile, days: Day[], ctx: DailyContext): string[] {
  const ids = new Set(days.flatMap((d) => d.topics?.topics.map((t) => t.id) ?? []));
  const errors: string[] = [];
  for (const [id, e] of Object.entries(state.topics)) {
    if (!ids.has(id)) errors.push(`${DAILY_DIR}/${STATE_FILE} ${id}: 找不到这个 topic（regenerate 删掉了被人工状态引用的 id？）`);
    if (e.state === "linked" && !ctx.reportExists(e.report)) errors.push(`${DAILY_DIR}/${STATE_FILE} ${id}: link 的报告 ${e.report} 不存在`);
  }
  return errors;
}

/** rh daily check 的全部离线检查。没有 daily/ 时直接通过。 */
export function checkDaily(root: string, ctx: DailyContext): { errors: string[]; warnings: string[]; load: DailyLoad } {
  const load = loadDaily(root);
  const errors = [...load.errors];
  const warnings: string[] = [];
  for (const d of load.days) {
    const r = dayErrors(d, ctx, existsSync(join(root, d.relDir, DAY_FILES.topics)));
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }
  errors.push(...stateErrors(load.state, load.days, ctx));
  return { errors, warnings, load };
}

// ───────────────────────── 公开投影（WHI-1936 只渲染它） ─────────────────────────

export interface PublicItem {
  source: SourceId;
  url: string;
  origin_url: string | null;
  title: string | null;
  author: string | null;
  via: string | null;
  published_at: string;
  incomplete: boolean;
}

export interface PublicDay {
  date: string;
  status: DayStatus;
  /** 公开页面把代码映射成固定说明 */
  reasons: Reason[];
  window: { from: string; to: string };
  generated_at: string | null;
  counts: { topics: number };
  note?: string;
  topics: Topic[];
  items: Record<string, PublicItem>;
}

/**
 * 一天的公开投影（ADR 0004 §10）：topic 的生成器字段与 evidence、被引用条目的元数据、manifest 的公开子集。
 * 不含 state.yml，不含 manifest 的其余字段（源状态、调用次数、错误、run、generator、dropped）。
 * novelty.related 已在 rh daily check 里保证只指向公开报告；页面链接仍要经过 siteView("public").find()。
 */
export function publicDay(day: Day): PublicDay {
  const m = day.manifest;
  const items = Object.fromEntries(
    Object.entries(day.topics?.items ?? {}).map(([k, it]) => [
      k,
      { source: it.source, url: it.url, origin_url: it.origin_url, title: it.title, author: it.author, via: it.via, published_at: it.published_at, incomplete: it.incomplete },
    ]),
  );
  return {
    date: m.date,
    status: m.status,
    reasons: m.reasons,
    window: m.window,
    generated_at: m.generated_at,
    counts: { topics: m.counts.topics },
    ...(day.topics?.note ? { note: day.topics.note } : {}),
    topics: day.topics?.topics ?? [],
    items,
  };
}

/** 不进公开投影的字段名（泄漏指纹用；值太短的字段只能靠字段名识别）：manifest 的内部字段与条目的 reposted_by / fetched_at。 */
export const INTERNAL_FIELD_NAMES = ["inputs_sha256", "skill_version", "cited_items", "reposted_by", "fetched_at"] as const;

/**
 * Daily 的内部数据，给 WHI-1936 加进 leakCheck(..., forbidden)（cli/lib/build.ts 的 PublicForbidden 形状）：
 * 内部字段名、manifest 内部字段的值（run id、inputs_sha256、模型、skill 版本、源错误）、state.yml 的 dismiss 理由。
 * 短于 4 个字符的值会被泄漏检查忽略。
 */
export function dailyForbidden(load: DailyLoad): { source: string; text: string }[] {
  const out: { source: string; text: string }[] = INTERNAL_FIELD_NAMES.map((f) => ({ source: "daily 内部字段名", text: f }));
  for (const d of load.days) {
    const m = d.manifest;
    const src = `${d.relDir}/${DAY_FILES.manifest}`;
    out.push({ source: src, text: m.run.id });
    if (m.generator) out.push({ source: src, text: m.generator.inputs_sha256 }, { source: src, text: m.generator.model }, { source: src, text: m.generator.skill_version });
    for (const s of m.sources) if (s.error) out.push({ source: src, text: s.error });
  }
  for (const [id, e] of Object.entries(load.state.topics)) if (e.state === "dismissed") out.push({ source: `${DAILY_DIR}/${STATE_FILE} ${id}`, text: e.reason });
  return out;
}

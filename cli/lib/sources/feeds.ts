/**
 * 按时间窗归日的源（ADR 0004 §4）：Odaily 快讯、Discourse 论坛（ethresear.ch、Ethereum Magicians）、RSS（The Block）。
 * 每个适配器只实现 fetchPage(page)：返回规范化后的条目、这一页最老的发布时间、后面还有没有。
 * collectWindow 负责翻页直到够到时间窗起点（或用完 max_calls_per_run），并算出这次抓取覆盖的区间。
 */
import { createHash } from "node:crypto";
import { EXCERPT_MAX, isHttpUrl, itemSchema, type Item, type SourceId } from "../../../lib/daily.ts";
import type { DiscourseConfig, OdailyConfig, RssConfig } from "./config.ts";
import { CallBudget, SourceError, errorText, getJson, getText, type HttpCtx } from "./http.ts";
import type { Span } from "./state.ts";

// ───────── 条目工具 ─────────

/** 按 UTF-16 长度截断（zod 的 max 也按它算），不切开代理对。 */
export function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  let out = "";
  for (const ch of s) {
    if (out.length + ch.length > n) break;
    out += ch;
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export const stripHtml = (s: string): string => decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
export const excerptOf = (s: string): string => clip(s.trim(), EXCERPT_MAX);

/** 去掉首尾空白后是 http(s) URL 就返回它，否则 null（真实的 Odaily sourceUrl 有前导空格）。 */
export function cleanUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const u = v.trim();
  return u && isHttpUrl(u) ? u : null;
}

/** 校验并返回条目；不合格返回 null（由调用方计为格式问题，不让一条坏数据毁掉整个源）。 */
export function toItem(raw: Item): Item | null {
  const r = itemSchema.safeParse({ ...raw, title: raw.title === null ? null : clip(raw.title.trim(), 300) || null });
  return r.success ? (r.data as Item) : null;
}

const iso = (ms: number): string | null => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);
const minIso = (xs: (string | null)[]): string | null => {
  const ms = xs.flatMap((x) => (x ? [Date.parse(x)] : [])).filter(Number.isFinite);
  return ms.length ? new Date(Math.min(...ms)).toISOString() : null;
};

// ───────── 翻页与覆盖 ─────────

export interface PageResult {
  items: Item[];
  /** 这一页里最老的发布时间（含被过滤掉的条目）；空页为 null */
  oldest: string | null;
  more: boolean;
  /** 这一页里因为字段不合格被跳过的条数 */
  bad: number;
}
export interface WindowAdapter {
  fetchPage(page: number): Promise<PageResult>;
}

export interface WindowFetch {
  items: Item[];
  /** 这次抓取覆盖的区间（从最老的条目到抓取时刻）；一页都没拿到时 null */
  span: Span | null;
  error: string | null;
}

const EPOCH = "1970-01-01T00:00:00.000Z";

/** 从第 0 页往后翻，直到够到 w.from、列表到头，或者出错 / 预算用完（保留已拿到的页）。 */
export async function collectWindow(adapter: WindowAdapter, w: Span, fetchedAt: string, secrets: string[]): Promise<WindowFetch> {
  const items: Item[] = [];
  let oldest: string | null = null;
  let pages = 0;
  let bad = 0;
  let error: string | null = null;
  for (let page = 0; ; page++) {
    let r: PageResult;
    try {
      r = await adapter.fetchPage(page);
    } catch (e) {
      error = errorText(e, secrets);
      break;
    }
    pages++;
    items.push(...r.items);
    bad += r.bad;
    oldest = minIso([oldest, r.oldest]);
    if (!r.more) {
      oldest = EPOCH;
      break;
    }
    if (oldest && Date.parse(oldest) <= Date.parse(w.from)) break;
  }
  if (bad && !error) error = `format: ${bad} 条字段不合格，已跳过`;
  return { items, span: pages && oldest ? { from: oldest, to: fetchedAt } : null, error };
}

// ───────── 适配器 ─────────

/** 非 FxTwitter 的源：超时、网络错误和 5xx 重试一次；429 和其他 4xx 不重试。 */
const KEYLESS = { retries: 1, retryStatus: (s: number) => s >= 500 };

export function odailyAdapter(id: SourceId, cfg: OdailyConfig, ctx: HttpCtx, budget: CallBudget, now: () => string): WindowAdapter {
  return {
    async fetchPage(page) {
      const d = (await getJson(ctx, `${cfg.base_url}/api/v1/newsflash?page=${page + 1}&size=${cfg.page_size}`, { budget, ...KEYLESS })) as {
        code?: unknown;
        data?: { list?: unknown; hasMore?: unknown };
      };
      if (!Array.isArray(d?.data?.list)) throw new SourceError("format", "缺少 data.list");
      const list = d.data.list as Record<string, unknown>[];
      const fetched = now();
      let bad = 0;
      const items: Item[] = [];
      for (const x of list) {
        // Odaily 的 API 不理会 isImportant 参数（WHI-1925），只能在这里过滤
        if (cfg.important_only && x.isImportant !== true) continue;
        const it = toItem({
          id: `${id}:${x.id}`,
          source: id,
          url: cleanUrl(x.link) ?? "",
          origin_url: cleanUrl(x.sourceUrl),
          title: typeof x.title === "string" ? x.title : null,
          author: null,
          reposted_by: null,
          via: null,
          published_at: iso(Number(x.publishTimestamp)) ?? "",
          fetched_at: fetched,
          incomplete: false,
          excerpt: excerptOf(stripHtml(String(x.content ?? ""))),
        });
        if (it) items.push(it);
        else bad++;
      }
      return { items, oldest: minIso(list.map((x) => iso(Number(x.publishTimestamp)))), more: d.data.hasMore === true && list.length > 0, bad };
    },
  };
}

/** Discourse 的 /latest.json?order=created：按创建时间倒序，置顶帖跳过（它们不按时间排，会让覆盖区间失真）。 */
export function discourseAdapter(id: SourceId, cfg: DiscourseConfig, ctx: HttpCtx, budget: CallBudget, now: () => string): WindowAdapter {
  return {
    async fetchPage(page) {
      const d = (await getJson(ctx, `${cfg.base_url}/latest.json?order=created${page ? `&page=${page}` : ""}`, { budget, ...KEYLESS })) as {
        topic_list?: { topics?: unknown; more_topics_url?: unknown };
      };
      if (!Array.isArray(d?.topic_list?.topics)) throw new SourceError("format", "缺少 topic_list.topics");
      const topics = (d.topic_list.topics as Record<string, unknown>[]).filter((t) => t.pinned !== true && t.pinned_globally !== true);
      const fetched = now();
      let bad = 0;
      const items: Item[] = [];
      for (const t of topics) {
        const it = toItem({
          id: `${id}:${t.id}`,
          source: id,
          url: `${cfg.base_url}/t/${encodeURIComponent(String(t.slug ?? "topic"))}/${t.id}`,
          origin_url: null,
          title: typeof t.title === "string" ? t.title : null,
          author: null,
          reposted_by: null,
          via: null,
          published_at: typeof t.created_at === "string" ? (iso(Date.parse(t.created_at)) ?? "") : "",
          fetched_at: fetched,
          incomplete: false,
          excerpt: excerptOf(stripHtml(typeof t.excerpt === "string" ? t.excerpt : "")),
        });
        if (it) items.push(it);
        else bad++;
      }
      return { items, oldest: minIso(topics.map((t) => (typeof t.created_at === "string" ? iso(Date.parse(t.created_at)) : null))), more: Boolean(d.topic_list.more_topics_url) && topics.length > 0, bad };
    },
  };
}

const xmlText = (block: string, tag: string): string => {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(block);
  if (!m) return "";
  return decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
};

/** RSS 2.0：`?paged=N` 翻页（The Block 的 rel="next"）。id 取链接末尾的数字，没有就取链接的哈希。 */
export function rssAdapter(id: SourceId, cfg: RssConfig, ctx: HttpCtx, budget: CallBudget, now: () => string): WindowAdapter {
  return {
    async fetchPage(page) {
      const { body } = await getText(ctx, page ? `${cfg.url}${cfg.url.includes("?") ? "&" : "?"}paged=${page + 1}` : cfg.url, { budget, ...KEYLESS });
      if (!/<rss[\s>]/.test(body)) throw new SourceError("format", "不是 RSS");
      const blocks = body.match(/<item[\s>][\s\S]*?<\/item>/g) ?? [];
      const fetched = now();
      let bad = 0;
      const items: Item[] = [];
      const dates: (string | null)[] = [];
      for (const b of blocks) {
        const link = cleanUrl(xmlText(b, "link"));
        const published = iso(Date.parse(xmlText(b, "pubDate")));
        dates.push(published);
        const stable = link ? (/(\d+)\/?$/.exec(link)?.[1] ?? createHash("sha256").update(link).digest("hex").slice(0, 16)) : "";
        const it = toItem({
          id: `${id}:${stable}`,
          source: id,
          url: link ?? "",
          origin_url: null,
          title: xmlText(b, "title") || null,
          author: null,
          reposted_by: null,
          via: null,
          published_at: published ?? "",
          fetched_at: fetched,
          incomplete: false,
          excerpt: excerptOf(stripHtml(xmlText(b, "description"))),
        });
        if (it) items.push(it);
        else bad++;
      }
      return { items, oldest: minIso(dates), more: blocks.length > 0 && /rel=["']next["']/.test(body), bad };
    },
  };
}

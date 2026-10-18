/**
 * ETHTAO 日报（FxTwitter v2，keyless）：在账号时间线里找“以太坊日报 D”，再对日报引用的帖子做二跳（ADR 0004 §4、§8）。
 *  - 时间线偶尔返回一次性的 404，重试就好（WHI-1925 §1.1）；`count` 不起作用，按 created_timestamp 自己判断。
 *  - 日报 D 在 D 00:00（UTC+8）之后才可能发出；翻到比这更早的帖子还没找到，就是“还没发布”。
 *  - 二跳：转推由 FxTwitter 直接解析成原帖（reposted_by = 转推人）；引用帖保留引用者的帖子（它才是日报摘要说的内容），
 *    把被引用的原帖（或它的外链）记成 origin_url，这样独立来源按被引用的原帖算（ADR 0004 §8 第 2 条）。
 *  - X Article 只有标题和预览，标成 incomplete。
 *  - 0.1.0 没有兜底源：FxTwitter 失败就是 digest_fetch_failed（所有者决定 2026-10-18）。
 */
import type { Item, SourceId } from "../../../lib/daily.ts";
import type { XDigestConfig } from "./config.ts";
import { cleanUrl, clip, excerptOf, toItem } from "./feeds.ts";
import { CallBudget, SourceError, errorText, getJson, type HttpCtx } from "./http.ts";
import type { CachedDigest } from "./state.ts";
import { digestDate, parseDigest } from "./x-digest.ts";

/** 时间线 404 和 5xx 重试两次（2 s、4 s）。 */
const FX = { retries: 2, retryStatus: (s: number) => s === 404 || s >= 500 };

interface FxStatus {
  id: string;
  url?: string;
  text?: string;
  created_timestamp: number;
  author?: { screen_name?: string };
  card?: { url?: string } | null;
  article?: { title?: string; preview_text?: string } | null;
  quote?: FxStatus | null;
  reposted_by?: { screen_name?: string } | null;
}

const isStatus = (s: unknown): s is FxStatus =>
  typeof s === "object" && s !== null && typeof (s as FxStatus).id === "string" && Number.isFinite((s as FxStatus).created_timestamp);

export interface DigestRun {
  digest: { status: "found" | "not_posted" | "fetch_failed"; url: string | null; posted_at: string | null };
  /** 写回 cache 的日报记录（没找到时为 null） */
  cached: CachedDigest | null;
  items: Item[];
  calls: number;
  status: "ok" | "partial" | "failed";
  error: string | null;
}

const addDays = (date: string, n: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** 二跳得到的帖子 → 条目。 */
export function statusItem(id: SourceId, s: FxStatus, via: string, summary: string, fetchedAt: string): Item | null {
  const author = s.author?.screen_name ?? "";
  const q = s.quote && isStatus(s.quote) ? s.quote : null;
  const qUrl = q?.author?.screen_name ? `https://x.com/${q.author.screen_name}/status/${q.id}` : null;
  const body = s.article ? `${s.article.title ?? ""}\n${s.article.preview_text ?? ""}` : (s.text ?? "");
  return toItem({
    id: `${id}:${s.id}`,
    source: id,
    url: `https://x.com/${author}/status/${s.id}`,
    origin_url: q ? (cleanUrl(q.card?.url) ?? qUrl) : cleanUrl(s.card?.url),
    title: s.article ? clip(s.article.title ?? "", 300) || "(X Article)" : null,
    author: author || null,
    reposted_by: s.reposted_by?.screen_name ?? null,
    via,
    published_at: new Date(s.created_timestamp * 1000).toISOString(),
    fetched_at: fetchedAt,
    incomplete: Boolean(s.article),
    // 日报对这条的中文摘要放在最前：它不能出现在公开页面上，放进摘录让导入时的转载比对能拦住照抄（ADR 0004 §3）
    excerpt: excerptOf([summary, body, q?.text ?? ""].filter(Boolean).join("\n\n")),
  });
}

/** 在时间线里找日报 D。 */
async function findDigest(o: { cfg: XDigestConfig; ctx: HttpCtx; budget: CallBudget; date: string }): Promise<{ found: FxStatus | null; dupes: string[]; error: string | null; notPosted: boolean }> {
  const cutoff = Date.parse(`${addDays(o.date, -1)}T16:00:00Z`); // D 00:00 UTC+8
  const found: FxStatus[] = [];
  const errors: string[] = [];
  let allReached = true;
  for (const acct of o.cfg.accounts) {
    let cursor: string | null = null;
    let reached = false;
    try {
      for (let page = 0; page < o.cfg.max_timeline_pages && !reached; page++) {
        const d = (await getJson(o.ctx, `${o.cfg.base_url}/profile/${acct}/statuses${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { budget: o.budget, ...FX })) as {
          results?: unknown;
          cursor?: { bottom?: unknown };
        };
        if (!Array.isArray(d?.results)) throw new SourceError("format", "时间线缺少 results");
        const statuses = d.results.filter(isStatus);
        for (const s of statuses) if (!s.reposted_by && s.author?.screen_name?.toLowerCase() === acct.toLowerCase() && digestDate(s.text ?? "") === o.date) found.push(s);
        const oldest = Math.min(...statuses.map((s) => s.created_timestamp * 1000));
        cursor = typeof d.cursor?.bottom === "string" ? d.cursor.bottom : null;
        // 找到了也继续翻到 D 00:00 之前：同一个 D 的更早一条可能在后面的页里（ADR 0004 §4 用最早的一条）
        reached = !statuses.length || !cursor || oldest < cutoff;
      }
    } catch (e) {
      errors.push(`${acct}: ${errorText(e, [])}`);
      allReached = false;
      continue;
    }
    if (!reached) {
      errors.push(`${acct}: 翻了 ${o.cfg.max_timeline_pages} 页还没翻到 ${o.date} 之前`);
      allReached = false;
    }
  }
  found.sort((a, b) => a.created_timestamp - b.created_timestamp || a.id.localeCompare(b.id));
  // 没翻到停止边界（某页失败、页数或调用上限）就不算找到：更早的一条可能在没读到的页里，这次记 fetch_failed，下次重找（R2-F1）
  if (!allReached) return { found: null, dupes: [], error: errors.join("; ").slice(0, 500), notPosted: false };
  return { found: found[0] ?? null, dupes: found.slice(1).map((s) => s.id), error: null, notPosted: true };
}

export async function runDigest(o: { id: SourceId; cfg: XDigestConfig; ctx: HttpCtx; date: string; cached: CachedDigest | undefined; now: () => string }): Promise<DigestRun> {
  const budget = new CallBudget(o.cfg.max_calls_per_run);
  let entry: CachedDigest;
  const notes: string[] = [];
  let toHop: string[];
  if (o.cached) {
    // 日报已在之前的运行里找到：不再翻时间线，只重试上次二跳失败的引用
    entry = { ...o.cached, items: [...o.cached.items] };
    toHop = o.cached.missing;
  } else {
    const f = await findDigest({ cfg: o.cfg, ctx: o.ctx, budget, date: o.date });
    if (!f.found) {
      const failed = !f.notPosted;
      return { digest: { status: failed ? "fetch_failed" : "not_posted", url: null, posted_at: null }, cached: null, items: [], calls: budget.used, status: failed ? "failed" : "ok", error: f.error };
    }
    if (f.dupes.length) notes.push(`同一天还有 ${f.dupes.length} 条日报，用最早的一条（忽略 ${f.dupes.join(", ")}）`);
    const s = f.found;
    entry = { id: s.id, url: `https://x.com/${s.author!.screen_name}/status/${s.id}`, posted_at: new Date(s.created_timestamp * 1000).toISOString(), text: s.text ?? "", items: [], missing: [] };
    toHop = [];
    const seen = new Set<string>();
    for (const sec of parseDigest(entry.text)!.sections) for (const it of sec.items) for (const r of it.refs) if (!seen.has(r.id) && seen.add(r.id)) toHop.push(r.id);
    if (!toHop.length) notes.push("format: 日报里没有解析出任何 [原文] 链接（格式变了？）");
    if (toHop.length > o.cfg.max_hops) {
      notes.push(`引用 ${toHop.length} 条，超过 max_hops（${o.cfg.max_hops}），后 ${toHop.length - o.cfg.max_hops} 条不做二跳`);
      toHop = toHop.slice(0, o.cfg.max_hops);
    }
  }

  const summaries = new Map<string, string>();
  for (const sec of parseDigest(entry.text)?.sections ?? []) for (const it of sec.items) for (const r of it.refs) if (!summaries.has(r.id)) summaries.set(r.id, it.text);
  const missing: string[] = [];
  let hopError: string | null = null;
  const fresh: Item[] = [];
  for (const ref of toHop) {
    try {
      const d = (await getJson(o.ctx, `${o.cfg.base_url}/status/${ref}`, { budget, ...FX })) as { status?: unknown };
      if (!isStatus(d?.status)) throw new SourceError("format", "二跳响应缺少 status");
      const it = statusItem(o.id, d.status, entry.url, summaries.get(ref) ?? "", o.now());
      if (!it) throw new SourceError("format", "二跳的帖子字段不合格");
      fresh.push(it);
    } catch (e) {
      missing.push(ref);
      hopError ??= errorText(e, []);
    }
  }
  const byId = new Map(entry.items.map((it) => [it.id, it]));
  for (const it of fresh) if (!byId.has(it.id)) byId.set(it.id, it);
  entry = { ...entry, items: [...byId.values()], missing };
  if (missing.length) notes.push(`${missing.length} 条引用二跳失败（下次运行重试）：${hopError}`);
  const capped = notes.some((n) => n.includes("max_hops") || n.startsWith("format:"));
  return {
    digest: { status: "found", url: entry.url, posted_at: entry.posted_at },
    cached: entry,
    items: entry.items,
    calls: budget.used,
    status: missing.length || capped ? "partial" : "ok",
    error: notes.length ? notes.join("; ").slice(0, 500) : null,
  };
}

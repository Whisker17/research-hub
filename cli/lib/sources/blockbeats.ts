/**
 * BlockBeats（带 key，配额不公开）：只用 newsflash/important 与 article/important，size ≤ 50。
 *
 * 预算（所有者决定 2026-10-18，WHI-1925 §2）：每天 4 次，硬上限 6 次，跨运行累计。
 *  - 账本（state/ledger.json）按调用发生的 UTC 日计数；定时运行、重试、补跑、regenerate 的每一次请求都算。
 *  - **先记账再调用**：计数在发请求之前原子写盘，进程在请求后崩溃也不会少记。
 *  - 按缓存的覆盖决定调用（WHI-2078）：时间窗没被覆盖才调用，并且往回翻页（page=2, 3, …），直到接上缓存从时间窗起点
 *    连续覆盖到的地方（没有就翻到时间窗起点）。一页 50 条在工作日只覆盖约 9 小时（run 39413681633），不是 24 小时。
 *  - 每一页都是一次调用、都记账；每次运行最多 max_calls_per_run 页，运行内不重试；失败留给下一次运行，照样计数。
 *    预算不够翻完就停下，覆盖到哪里记到哪里（partial）。
 *  - 账本不存在或损坏 ⇒ 当天不调用（失败即关闭，见 state.ts）。
 *  - HTTP 401/403/429 或 body status 100–103 ⇒ 这个源记为 failed，当天不再调用（不重试）。
 *  - 这些情况不花预算：时间窗已被缓存覆盖；上次成功调用不到 min_interval_hours（0 = 不按间隔跳过）；时间窗结束已超过 reach_hours；没有 key。
 * create_time 是不带时区的 UTC+8 文本，显式转换。错误只记状态码，不记 message（防止回显的内容进日志）。
 */
import type { Item, SourceId } from "../../../lib/daily.ts";
import type { BlockBeatsConfig } from "./config.ts";
import { cleanUrl, excerptOf, stripHtml, toItem, type WindowFetch } from "./feeds.ts";
import { CallBudget, SourceError, errorText, getJson, type HttpCtx } from "./http.ts";
import { coversAll, type Ledger, type Span } from "./state.ts";

/** "2026-10-18 20:41:43"（UTC+8，无时区）→ ISO UTC；数字按 Unix 秒处理。 */
export function utc8(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v * 1000).toISOString();
  if (typeof v !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(v.trim());
  if (!m) return null;
  const t = Date.parse(`${m[1]}T${m[2]}+08:00`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export const utcDay = (at: string): string => at.slice(0, 10);

/** 这次运行要不要调用；不调用时给出原因（写进 manifest 的 error）。 */
export function planCall(ledger: Ledger, cfg: BlockBeatsConfig, at: string, w: Span, cached: Span | null, hasKey: boolean): string | null {
  const day = ledger.days[utcDay(at)];
  if (!hasKey) return `skipped: 没有设置 ${cfg.credential_env}`;
  if (day?.blocked) return `skipped: 今天（UTC）已停止调用（${day.blocked}）`;
  if ((day?.calls ?? 0) >= cfg.max_calls_per_day) return `skipped: 今天的预算 ${cfg.max_calls_per_day} 次已用完`;
  if (coversAll(cached, w)) return "skipped: 时间窗已被之前的调用覆盖";
  if (Date.parse(at) - Date.parse(w.to) > cfg.reach_hours * 3_600_000) return `skipped: 时间窗结束已超过 ${cfg.reach_hours} 小时，一次调用够不到`;
  if (ledger.last_success_at && Date.parse(at) - Date.parse(ledger.last_success_at) < cfg.min_interval_hours * 3_600_000) {
    return `skipped: 上次成功调用不到 ${cfg.min_interval_hours} 小时`;
  }
  return null;
}

export interface BlockBeatsRun {
  fetch: WindowFetch | null;
  calls: number;
  skipped: string | null;
}

/**
 * 按账本调用 BlockBeats。persist(ledger) 必须同步落盘：每次请求前都会调用它（先记账再调用）。
 */
export async function runBlockBeats(o: {
  id: SourceId;
  cfg: BlockBeatsConfig;
  ctx: HttpCtx;
  key: string | undefined;
  ledger: Ledger;
  persist: (l: Ledger) => void;
  at: string;
  w: Span;
  cached: Span | null;
  now: () => string;
}): Promise<BlockBeatsRun> {
  const { cfg, ledger, at } = o;
  const skipped = planCall(ledger, cfg, at, o.w, o.cached, Boolean(o.key));
  if (skipped) return { fetch: null, calls: 0, skipped };
  const budget = new CallBudget(cfg.max_calls_per_run);
  // 翻到这里为止：缓存从时间窗起点连续覆盖到的地方；没有这样的缓存就翻到时间窗起点
  const target = o.cached && Date.parse(o.cached.from) <= Date.parse(o.w.from) ? Date.parse(o.cached.to) : Date.parse(o.w.from);
  const items: Item[] = [];
  /** 每个 endpoint 翻到的最早时刻（至少有一页成功才有） */
  const oldest: number[] = [];
  let calls = 0;
  let bad = 0;
  let error: string | null = null;
  for (let i = 0, page = 1; i < cfg.endpoints.length; ) {
    const ep = cfg.endpoints[i];
    // 记到发出这次请求的 UTC 日（运行可能跨过午夜），上限和停止调用也按那一天判断
    const t = o.now();
    const day = (ledger.days[utcDay(t)] ??= { calls: 0 });
    if (day.blocked || day.calls >= cfg.max_calls_per_day || budget.used >= budget.max) {
      if (!calls) return { fetch: null, calls: 0, skipped: planCall(ledger, cfg, t, o.w, o.cached, true) };
      break; // 没翻完：覆盖到哪里记到哪里，状态由覆盖决定（partial）
    }
    day.calls++;
    o.persist(ledger);
    calls++;
    try {
      const d = (await getJson(o.ctx, `${cfg.base_url}/v1/${ep}?page=${page}&size=${cfg.size}&lang=${encodeURIComponent(cfg.lang)}`, { budget, headers: { "api-key": o.key! } })) as {
        status?: unknown;
        data?: { data?: unknown };
      };
      if (d?.status !== 0) {
        const code = Number(d?.status);
        throw new SourceError(code >= 100 && code <= 103 ? "auth" : "http", `body status ${Number.isFinite(code) ? code : "缺失"}`);
      }
      if (!Array.isArray(d.data?.data)) throw new SourceError("format", "缺少 data.data");
      const list = d.data.data as Record<string, unknown>[];
      const fetched = o.now();
      const article = ep.startsWith("article/");
      for (const x of list) {
        const it = toItem({
          // 快讯和文章的 id 是两套编号，文章加前缀免得撞车
          id: `${o.id}:${article ? "article-" : ""}${x.id}`,
          source: o.id,
          url: cleanUrl(x.link) ?? "",
          origin_url: article ? null : cleanUrl(x.url),
          title: typeof x.title === "string" ? x.title : null,
          author: null,
          reposted_by: null,
          via: null,
          published_at: utc8(x.create_time) ?? "",
          fetched_at: fetched,
          incomplete: false,
          excerpt: excerptOf(stripHtml(String(x.content ?? x.abstract ?? ""))),
        });
        if (it) items.push(it);
        else bad++;
      }
      const times = list.flatMap((x) => {
        const t = utc8(x.create_time);
        return t ? [Date.parse(t)] : [];
      });
      // 有条目的时间不能用：不知道这一页覆盖到哪里，停下，只保留之前几页证明的覆盖（PR-F1）
      if (times.length < list.length) throw new SourceError("format", `${list.length - times.length} 条 create_time 不能用`);
      // 列表不满一页（含空页）说明到头了，覆盖到最早
      const prev = oldest[i];
      oldest[i] = list.length < cfg.size ? 0 : Math.min(...times);
      // 接上了、或者这一页没有更早（接口不认 page）就换下一个 endpoint，否则翻下一页
      if (oldest[i] <= target || oldest[i] >= prev) [i, page] = [i + 1, 1];
      else page++;
    } catch (e) {
      error = errorText(e, o.key ? [o.key] : []);
      if (e instanceof SourceError && (e.kind === "auth" || e.kind === "quota")) {
        day.blocked = `${e.kind}: ${e.message}`;
        o.persist(ledger);
      }
      break;
    }
  }
  if (!error && oldest.length === cfg.endpoints.length) {
    ledger.last_success_at = at;
    o.persist(ledger);
  }
  if (!error && bad) error = `format: ${bad} 条字段不合格，已跳过`;
  // 多个 endpoint 时，覆盖区间取它们的交集（每个 endpoint 的条目都完整的那段）；中途失败时保留已经翻到的那段
  const span = oldest.length === cfg.endpoints.length ? { from: new Date(Math.max(...oldest)).toISOString(), to: at } : null;
  return { fetch: { items, span, error }, calls, skipped: null };
}

/**
 * rh ingest 跨运行保存的状态（一个目录，WHI-1937 负责在 Actions 里恢复和保存）：
 *   ledger.json  BlockBeats 调用账本：按 UTC 日计数，没有任何内容，也没有凭据
 *   cache.json   最近几天抓到的条目（含 ≤400 字摘录）、每个源成功抓取覆盖的区间、找到的日报
 * cache 让后一次运行补齐前一次没覆盖到的时间（ADR 0004 §4：BlockBeats 一次只覆盖约 24 小时），
 * 也让某次抓取失败时保留上一次的好数据（失败不会覆盖它）。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { itemSchema, type Item } from "../../../lib/daily.ts";

export const LEDGER_FILE = "ledger.json";
export const CACHE_FILE = "cache.json";
/** cache 只留这么多天：定时运行最多处理昨天，再早的日期只能手动补跑，拿到多少算多少（partial） */
export const CACHE_DAYS = 4;
const LEDGER_DAYS = 14;

/** 写临时文件再 rename：读的人要么看到旧文件，要么看到新文件。 */
export function writeAtomic(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

export interface Span {
  from: string;
  to: string;
}

const datetime = z.iso.datetime();
const spanSchema = z.strictObject({ from: datetime, to: datetime });

// ───────── 覆盖区间 ─────────

export function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out.at(-1);
    if (last && Date.parse(s.from) <= Date.parse(last.to)) {
      if (Date.parse(s.to) > Date.parse(last.to)) last.to = s.to;
    } else out.push({ ...s });
  }
  return out;
}

/** spans 与时间窗 w 的交集里最长的一段；没有交集时 null。 */
export function coveredIn(spans: Span[], w: Span): Span | null {
  let best: Span | null = null;
  for (const s of mergeSpans(spans)) {
    const from = Math.max(Date.parse(s.from), Date.parse(w.from));
    const to = Math.min(Date.parse(s.to), Date.parse(w.to));
    if (to <= from) continue;
    if (!best || to - from > Date.parse(best.to) - Date.parse(best.from)) best = { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
  }
  return best;
}

export const coversAll = (c: Span | null, w: Span): boolean => c !== null && Date.parse(c.from) <= Date.parse(w.from) && Date.parse(c.to) >= Date.parse(w.to);

// ───────── cache ─────────

const cachedItem = itemSchema as unknown as z.ZodType<Item>;
const cacheSchema = z.strictObject({
  schema: z.literal(1),
  sources: z.record(z.string(), z.strictObject({ spans: z.array(spanSchema), items: z.array(cachedItem) })),
  /** 日期 D → 找到的日报和它二跳得到的条目；missing = 二跳失败、下次再试的引用 id */
  digests: z.record(
    z.string(),
    z.strictObject({ id: z.string(), url: z.string(), posted_at: datetime, text: z.string(), items: z.array(cachedItem), missing: z.array(z.string()) }),
  ),
});
export type Cache = z.infer<typeof cacheSchema>;
export type CachedDigest = Cache["digests"][string];

const emptyCache = (): Cache => ({ schema: 1, sources: {}, digests: {} });

/** 读 cache；不存在或损坏时从空开始（cache 只是加速和兜底，丢了不会多花预算：预算在 ledger 里）。 */
export function loadCache(dir: string): { cache: Cache; warning: string | null } {
  const file = join(dir, CACHE_FILE);
  if (!existsSync(file)) return { cache: emptyCache(), warning: null };
  try {
    const r = cacheSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
    if (r.success) return { cache: r.data, warning: null };
  } catch {
    /* 落到下面 */
  }
  return { cache: emptyCache(), warning: `${CACHE_FILE} 损坏，已忽略` };
}

/** 合并条目：已有的不覆盖（保留第一次抓到的 fetched_at 和内容）。 */
export function mergeItems(old: Item[], fresh: Item[]): Item[] {
  const m = new Map(old.map((it) => [it.id, it]));
  for (const it of fresh) if (!m.has(it.id)) m.set(it.id, it);
  return [...m.values()];
}

export function saveCache(dir: string, cache: Cache, at: string): void {
  const cutoff = Date.parse(at) - CACHE_DAYS * 86_400_000;
  const cutoffDate = new Date(cutoff).toISOString().slice(0, 10);
  const pruned: Cache = { schema: 1, sources: {}, digests: {} };
  for (const [id, s] of Object.entries(cache.sources)) {
    pruned.sources[id] = {
      spans: mergeSpans(s.spans).filter((x) => Date.parse(x.to) >= cutoff),
      items: s.items.filter((it) => Date.parse(it.published_at) >= cutoff).sort((a, b) => a.id.localeCompare(b.id)),
    };
  }
  for (const [d, v] of Object.entries(cache.digests)) if (d >= cutoffDate) pruned.digests[d] = v;
  writeAtomic(join(dir, CACHE_FILE), `${JSON.stringify(pruned)}\n`);
}

// ───────── BlockBeats 账本 ─────────

const ledgerSchema = z.strictObject({
  schema: z.literal(1),
  /** UTC 日（调用发生的那天）→ 已发出的调用数；blocked = 这一天不再调用的原因 */
  days: z.record(z.string(), z.strictObject({ calls: z.number().int().min(0), blocked: z.string().optional() })),
  last_success_at: datetime.nullable(),
});
export type Ledger = z.infer<typeof ledgerSchema>;

export const LEDGER_MISSING = "ledger_missing";

/**
 * 读账本。不存在或损坏时**失败即关闭**：当天（UTC）记为 blocked，不再调用，第二天恢复。
 * 所以账本丢失（cache miss、artifact 过期）不会让当天超支：丢失前已经花掉的不会被“忘掉”再花一遍。
 */
export function loadLedger(dir: string, today: string): { ledger: Ledger; warning: string | null } {
  const file = join(dir, LEDGER_FILE);
  let warning = `${LEDGER_FILE} 不存在：今天（${today} UTC）不调用 BlockBeats，明天恢复`;
  if (existsSync(file)) {
    try {
      const r = ledgerSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
      if (r.success) return { ledger: r.data, warning: null };
    } catch {
      /* 落到下面 */
    }
    warning = `${LEDGER_FILE} 损坏：今天（${today} UTC）不调用 BlockBeats，明天恢复`;
  }
  return { ledger: { schema: 1, days: { [today]: { calls: 0, blocked: LEDGER_MISSING } }, last_success_at: null }, warning };
}

export function saveLedger(dir: string, ledger: Ledger, today: string): void {
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - LEDGER_DAYS * 86_400_000).toISOString().slice(0, 10);
  const days = Object.fromEntries(Object.entries(ledger.days).filter(([d]) => d >= cutoff).sort(([a], [b]) => a.localeCompare(b)));
  writeAtomic(join(dir, LEDGER_FILE), `${JSON.stringify({ ...ledger, days }, null, 2)}\n`);
}

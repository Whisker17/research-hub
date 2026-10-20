/**
 * rh ingest --date D：抓取并规范化 Daily 日期 D 的条目（WHI-1931，ADR 0004 §4–§6、§11）。
 * 这是 Daily 里唯一联网的一步，也是唯一会花 BlockBeats 配额的一步。输出给 rh daily import（commit job）：
 *   <out>/manifest.json   status 恒为 pending；digest、sources[]、run.at（= 查找日报的时刻）由这里写
 *   <out>/items.jsonl     当天的条目（itemSchema，含 ≤400 字摘录）：只进 artifact / .rh/，不进仓库
 * 跨运行的状态（BlockBeats 账本、条目缓存）在 --state 目录，WHI-1937 负责在 Actions 里恢复和保存它。
 * 同样的响应得到同样的输出；重复运行同一天会整体重写输出，不会追加。
 */
import { appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { HubConfig } from "../../lib/config.ts";
import { dailyWindow, isLate, manifestSchema, shouldGenerate, type Item, type Manifest, type Reason, type SourceId } from "../../lib/daily.ts";
import { isValidDate } from "../../lib/schema.ts";
import { runBlockBeats } from "../lib/sources/blockbeats.ts";
import { SOURCES_FILE, loadSources, type SourceConfig } from "../lib/sources/config.ts";
import { runDigest } from "../lib/sources/ethtao.ts";
import { collectWindow, discourseAdapter, odailyAdapter, rssAdapter, type WindowFetch } from "../lib/sources/feeds.ts";
import { CallBudget, errorText, type FetchFn, type HttpCtx } from "../lib/sources/http.ts";
import { coveredIn, coversAll, loadCache, loadLedger, mergeItems, saveCache, saveLedger, writeAtomic } from "../lib/sources/state.ts";
import { CliError, info, ok, warn } from "../lib/util.ts";

export const INGEST_HELP = `rh ingest --date <YYYY-MM-DD> [--out <dir>] [--state <dir>] [--now <ISO>] [--run-id <id>] [--attempt <n>]

  抓取 Daily 日期 D（ETHTAO“以太坊日报 D”的日期）的条目，写 <out>/manifest.json 与 <out>/items.jsonl，
  交给 rh daily import。源和调用上限在 ${SOURCES_FILE}。
  ETHTAO：在时间线里找日报 D，对它引用的帖子做二跳（不受时间窗限制）。其他源：只收发布时间在
  W(D) = [D−1 00:00Z, D 00:00Z) 里的条目；覆盖不全记为 partial。某个源失败只影响它自己，其他源照常抓取。
  BlockBeats 的 key 只从 credential_env 指定的环境变量读取；每天的调用数记在 <state>/ledger.json（跨运行累计，
  账本丢失时当天不再调用）。

  --out <dir>     输出目录（默认 .rh/daily/<D>/）
  --state <dir>   跨运行状态目录（默认 $RH_INGEST_STATE，否则 .rh/ingest/）：ledger.json（账本）、cache.json（条目缓存）
  --now <ISO>     固定时钟（复现与测试用）；run.at 与 fetched_at 都取它
  --run-id / --attempt   写进 manifest.run（默认 $GITHUB_RUN_ID / $GITHUB_RUN_ATTEMPT，否则 local / 1）
  设置了 $GITHUB_OUTPUT 时追加 generate=true|false（ADR 0004 §5：这次是否应该调用生成）。`;

export interface IngestDeps {
  fetch?: FetchFn;
  sleep?: (ms: number) => Promise<void>;
}

export async function cmdIngest(cfg: HubConfig, argv: string[], deps: IngestDeps = {}): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      date: { type: "string" },
      out: { type: "string" },
      state: { type: "string" },
      now: { type: "string" },
      "run-id": { type: "string" },
      attempt: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) return info(INGEST_HELP);
  const date = values.date;
  if (!date || !isValidDate(date)) throw new CliError("用法：rh ingest --date <YYYY-MM-DD> …（rh ingest --help）", 2);
  if (values.now !== undefined && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(values.now)) throw new CliError("--now 必须是 UTC ISO 时间（…Z）", 2);
  const attempt = Number(values.attempt ?? process.env.GITHUB_RUN_ATTEMPT ?? 1);
  if (!Number.isInteger(attempt) || attempt < 1) throw new CliError("--attempt 必须是正整数", 2);
  const runId = values["run-id"] ?? process.env.GITHUB_RUN_ID ?? "local";
  const outDir = resolve(cfg.root, values.out ?? join(".rh", "daily", date));
  const stateDir = resolve(cfg.root, values.state ?? process.env.RH_INGEST_STATE ?? join(".rh", "ingest"));

  let sources;
  try {
    sources = loadSources(cfg.root);
  } catch (e) {
    throw new CliError((e as Error).message);
  }
  const fixed = values.now ? new Date(values.now).toISOString() : null;
  const now = (): string => fixed ?? new Date().toISOString();
  const secrets = Object.values(sources.sources).flatMap((s) => (s.type === "blockbeats" && process.env[s.credential_env] ? [process.env[s.credential_env]!] : []));
  const ctx: HttpCtx = {
    fetch: deps.fetch ?? ((u, init) => fetch(u, { ...init, redirect: "follow" })),
    userAgent: sources.user_agent,
    timeoutMs: sources.timeout_ms,
    backoffMs: sources.retry_backoff_ms,
    sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    secrets,
  };
  const w = dailyWindow(date);
  const inWindow = (it: Item) => Date.parse(it.published_at) >= Date.parse(w.from) && Date.parse(it.published_at) < Date.parse(w.to);

  // run.at = 查找日报的时刻 t（ADR 0004 §4：状态按它判断是否到了 T_last）
  const at = now();
  const { cache, warning: cacheWarning } = loadCache(stateDir);
  if (cacheWarning) warn(cacheWarning);
  const entries: Manifest["sources"] = [];
  const perSource: [SourceId, Item[]][] = [];
  let digest: Manifest["digest"] = { status: "fetch_failed", url: null, posted_at: null };

  for (const [id, sc] of Object.entries(sources.sources) as [SourceId, SourceConfig][]) {
    if (!sc.enabled) continue;
    try {
      if (sc.type === "x-digest") {
        const r = await runDigest({ id, cfg: sc, ctx, date, cached: cache.digests[date], now });
        digest = r.digest;
        if (r.cached) cache.digests[date] = r.cached;
        const items = r.items.slice(0, sc.max_items);
        entries.push({ id, status: r.status, items: items.length, calls: r.calls, covered: null, error: r.error });
        perSource.push([id, items]);
        continue;
      }
      const prev = (cache.sources[id] ??= { spans: [], items: [] });
      let fetched: WindowFetch | null;
      let calls: number;
      let skipped: string | null = null;
      if (sc.type === "blockbeats") {
        // 账本按请求发生的 UTC 日记账：用此刻的时间，不用 run.at（前面的源可能已经跑过了午夜）
        const t = now();
        const { ledger, warning } = loadLedger(stateDir, t.slice(0, 10));
        const key = process.env[sc.credential_env] || undefined;
        if (warning && key) warn(`${id}: ${warning}`);
        saveLedger(stateDir, ledger, t.slice(0, 10));
        const r = await runBlockBeats({ id, cfg: sc, ctx, key, ledger, persist: (l) => saveLedger(stateDir, l, t.slice(0, 10)), at: t, w, cached: coveredIn(prev.spans, w), now });
        ({ fetch: fetched, calls, skipped } = r);
      } else {
        const budget = new CallBudget(sc.max_calls_per_run);
        const adapter = sc.type === "odaily" ? odailyAdapter(id, sc, ctx, budget, now) : sc.type === "discourse" ? discourseAdapter(id, sc, ctx, budget, now) : rssAdapter(id, sc, ctx, budget, now);
        fetched = await collectWindow(adapter, w, now(), secrets);
        calls = budget.used;
      }
      // 新抓到的并进缓存（已有的不覆盖）；失败时缓存里上一次的好数据照用
      if (fetched) {
        prev.items = mergeItems(prev.items, fetched.items);
        if (fetched.span) prev.spans.push(fetched.span);
      }
      const covered = coveredIn(prev.spans, w);
      const items = prev.items
        .filter(inWindow)
        .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at) || a.id.localeCompare(b.id))
        .slice(0, sc.max_items);
      const status = skipped ? "skipped" : !fetched?.span ? "failed" : coversAll(covered, w) ? "ok" : "partial";
      entries.push({ id, status, items: items.length, calls, covered, error: skipped ?? fetched?.error ?? null });
      perSource.push([id, items]);
    } catch (e) {
      entries.push({ id, status: "failed", items: 0, calls: 0, covered: null, error: errorText(e, secrets) });
    }
  }

  // 跨源去重：同一个 canonical URL 只留第一条（ETHTAO 在前，其余按 sources.yml 的顺序）
  const seenUrl = new Set<string>();
  const seenId = new Set<string>();
  const all: Item[] = [];
  for (const [id, items] of perSource) {
    let n = 0;
    for (const it of items) {
      if (seenUrl.has(it.url) || seenId.has(it.id)) continue;
      seenUrl.add(it.url);
      seenId.add(it.id);
      all.push(it);
      n++;
    }
    const e = entries.find((x) => x.id === id)!;
    e.items = n;
  }
  all.sort((a, b) => a.id.localeCompare(b.id));

  const reasons: Reason[] = [];
  if (digest.status === "not_posted") reasons.push("digest_not_posted");
  if (digest.status === "fetch_failed") reasons.push("digest_fetch_failed");
  if (!all.length) reasons.push("no_items");
  const manifest: Manifest = {
    schema: 1,
    date,
    status: "pending",
    reasons,
    window: w,
    digest,
    sources: entries,
    counts: { items: all.length, cited_items: 0, topics: 0, dropped: 0, warnings: 0 },
    dropped: [],
    generator: null,
    run: { id: runId, attempt, at },
    generated_at: null,
    updated_at: at,
  };
  const check = manifestSchema.safeParse(manifest);
  if (!check.success) throw new CliError(`内部错误：manifest 不合法：${check.error.message}`);

  writeAtomic(join(outDir, "items.jsonl"), all.map((it) => `${JSON.stringify(it)}\n`).join(""));
  writeAtomic(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  saveCache(stateDir, cache, at);

  const generate = shouldGenerate(digest.status, isLate(date, at), all.length);
  for (const e of entries) info(`  ${e.id.padEnd(12)} ${e.status.padEnd(8)} ${String(e.items).padStart(4)} 条  ${e.calls} 次调用${e.error ? `  ${e.error}` : ""}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `generate=${generate}\n`);
  ok(`${date}：日报 ${digest.status}，${all.length} 条 → ${outDir}（generate=${generate}）`);
}

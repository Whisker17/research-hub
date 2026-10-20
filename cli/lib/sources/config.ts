/**
 * sources.yml：rh ingest 启用哪些源、怎么连、每次运行和每天最多调用几次（WHI-1931，ADR 0004 §4、§11）。
 * 源的键就是 item_id 的前缀，必须已在 lib/daily.ts 的 DAILY_SOURCES 里登记。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { DAILY_SOURCES, type SourceId } from "../../../lib/daily.ts";
import { formatZodIssues } from "../../../lib/schema.ts";

export const SOURCES_FILE = "sources.yml";
export const BLOCKBEATS_ENDPOINTS = ["newsflash/important", "article/important"] as const;

const url = z.url({ protocol: /^https?$/ }).transform((u) => u.replace(/\/+$/, ""));
const common = {
  enabled: z.boolean().default(true),
  /** 一次运行里这个源最多发几个请求（含翻页、重试、二跳） */
  max_calls_per_run: z.number().int().min(1).max(200),
  /** 一天最多收几条（取最新的） */
  max_items: z.number().int().min(1).max(1000).default(300),
};

const xDigest = z.strictObject({
  type: z.literal("x-digest"),
  ...common,
  base_url: url,
  /** 依次查找这些账号的时间线；同一个 D 有多条日报时用最早的一条 */
  accounts: z.array(z.string().regex(/^[A-Za-z0-9_]{1,15}$/)).min(1),
  /** 每个账号最多翻几页时间线（补跑更早的日期要多翻） */
  max_timeline_pages: z.number().int().min(1).max(20),
  /** 二跳：每个日期最多解析几条日报引用的帖子 */
  max_hops: z.number().int().min(0).max(100),
});

const blockbeats = z
  .strictObject({
    type: z.literal("blockbeats"),
    ...common,
    base_url: url,
    /** 凭据所在的环境变量名（GitHub secret）；值从不写进任何文件或日志 */
    credential_env: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    endpoints: z.array(z.enum(BLOCKBEATS_ENDPOINTS)).min(1).refine((a) => new Set(a).size === a.length, { message: "有重复项" }),
    size: z.number().int().min(1).max(50),
    lang: z.string().default("cn"),
    /** 账本按 UTC 日计数：所有运行（定时、重试、补跑、regenerate）加起来，一天最多调用几次 */
    max_calls_per_day: z.number().int().min(0),
    /** 所有者给的绝对上限（WHI-1925：6 次/天）；max_calls_per_day 不能超过它 */
    hard_cap_per_day: z.number().int().min(0),
    /** 上次成功调用不到这么多小时就不再调用（一次调用约覆盖 24 小时） */
    min_interval_hours: z.number().min(0),
    /** 时间窗的结束时刻早于“现在”这么多小时，一次调用就够不到了，不再为它花预算 */
    reach_hours: z.number().min(1),
  })
  .refine((s) => s.max_calls_per_day <= s.hard_cap_per_day, { message: "max_calls_per_day 不能超过 hard_cap_per_day" })
  .refine((s) => s.endpoints.length <= s.max_calls_per_run, { message: "每个 endpoint 一次运行至少要一次调用：endpoints 数不能超过 max_calls_per_run" });

const odaily = z.strictObject({ type: z.literal("odaily"), ...common, base_url: url, page_size: z.number().int().min(1).max(100), important_only: z.boolean() });
const discourse = z.strictObject({ type: z.literal("discourse"), ...common, base_url: url });
const rss = z.strictObject({ type: z.literal("rss"), ...common, url });

const sourceSchema = z.discriminatedUnion("type", [xDigest, blockbeats, odaily, discourse, rss]);
export type SourceConfig = z.infer<typeof sourceSchema>;
export type XDigestConfig = z.infer<typeof xDigest>;
export type BlockBeatsConfig = z.infer<typeof blockbeats>;
export type OdailyConfig = z.infer<typeof odaily>;
export type DiscourseConfig = z.infer<typeof discourse>;
export type RssConfig = z.infer<typeof rss>;

export const sourcesFileSchema = z
  .strictObject({
    schema: z.literal(1),
    /** 每个请求都带上它，让源能认出是谁在调用 */
    user_agent: z.string().min(10).max(200),
    timeout_ms: z.number().int().min(100).max(120_000),
    /** 第 n 次重试前等 n × retry_backoff_ms */
    retry_backoff_ms: z.number().int().min(0).max(60_000).default(2000),
    sources: z.record(z.string(), sourceSchema),
  })
  .superRefine((f, ctx) => {
    const digests = Object.entries(f.sources).filter(([, s]) => s.type === "x-digest");
    for (const id of Object.keys(f.sources)) {
      if (!Object.hasOwn(DAILY_SOURCES, id)) ctx.addIssue({ code: "custom", path: ["sources", id], message: `未登记的源（先在 lib/daily.ts 的 DAILY_SOURCES 里登记）` });
    }
    for (const [id] of digests) if (DAILY_SOURCES[id as SourceId] !== "x") ctx.addIssue({ code: "custom", path: ["sources", id], message: "x-digest 只能用于类别为 x 的源" });
    if (digests.length > 1) ctx.addIssue({ code: "custom", path: ["sources"], message: "只能有一个 x-digest 源（日期 D 由日报决定）" });
  });
export type SourcesFile = z.infer<typeof sourcesFileSchema> & { sources: Record<SourceId, SourceConfig> };

export function loadSources(root: string): SourcesFile {
  const file = join(root, SOURCES_FILE);
  if (!existsSync(file)) throw new Error(`找不到 ${SOURCES_FILE}`);
  const r = sourcesFileSchema.safeParse(parseYaml(readFileSync(file, "utf8")));
  if (!r.success) throw new Error(`${SOURCES_FILE} 不合法：${formatZodIssues(r.error).join("；")}`);
  return r.data as SourcesFile;
}

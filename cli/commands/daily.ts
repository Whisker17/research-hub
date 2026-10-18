/**
 * rh daily check | import | probe（ADR 0004）。
 * check 与 import 离线、确定性；probe 联网，只手动运行。
 */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { HubConfig } from "../../lib/config.ts";
import {
  DAILY_DIR,
  DAY_FILES,
  STATE_FILE,
  checkDaily,
  dailyWindow,
  importCandidate,
  isFinalStatus,
  isLate,
  loadDaily,
  loadDailyContext,
  manifestSchema,
  parseItemsJsonl,
  resolveStatus,
  shouldGenerate,
  stateChangeErrors,
  stateFileSchema,
  type DailyLoad,
  type ImportResult,
  type Manifest,
  type TopicsFile,
} from "../../lib/daily.ts";
import { formatZodIssues, isValidDate } from "../../lib/schema.ts";
import { CliError, fail, info, ok, warn } from "../lib/util.ts";

export const DAILY_HELP = `rh daily check [--base <git-ref>] [--workflow]
rh daily import <YYYY-MM-DD> --manifest <file> --items <items.jsonl> [--candidate <dir>] [--regenerate]
rh daily probe [YYYY-MM-DD…] [--timeout <ms>]

  check   离线、确定性地检查 daily/：schema；目录结构（拒绝符号链接和多余文件）；重新计算 id、evidence、items；
          引用能否解析、标签、related 只指向公开报告；状态和数量一致；state.yml 的不变量。dailyAvoidTerms 只给警告。
          没有 daily/ 时直接通过。pnpm verify 和 CI 都运行它。
          --base <ref>   另外检查 state.yml 从 <ref> 到工作区的每个变化都是合法的状态转移
          --workflow     （commit job 用，需要 --base）state.yml 必须和 <ref> 完全一样：workflow 不能改人工状态
  import  （commit job 用）把生成器的候选目录当作不可信输入，导入成 daily/YYYY/MM/DD/{manifest.json,topics.yml}。
          --manifest 是 ingest 写的 manifest，--items 是 ingest 写的 items.jsonl。没有 --candidate 表示生成失败，
          或者按规则不该调用生成。结构错误时整体拒绝；单个 topic 有问题时只丢弃那个 topic。
          已是终态的日期要加 --regenerate 才会重做。regenerate 时如果生成失败或候选被拒绝，保留原结果（退出码 3）。
  probe   在线检查 topics.yml 里的链接（条目的 url、origin_url、via 和 extra）。只手动运行，不进 CI 和 pnpm verify。`;

export async function cmdDaily(cfg: HubConfig, argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub === "check") return cmdDailyCheck(cfg, rest);
  if (sub === "import") return cmdDailyImport(cfg, rest);
  if (sub === "probe") return cmdDailyProbe(cfg, rest);
  info(DAILY_HELP);
  if (sub !== undefined && sub !== "-h" && sub !== "--help") throw new CliError(`未知子命令：${sub}`, 2);
}

// ───────────────────────── check ─────────────────────────

function cmdDailyCheck(cfg: HubConfig, argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: { base: { type: "string" }, workflow: { type: "boolean", default: false }, help: { type: "boolean", short: "h" } },
  });
  if (values.help) return info(DAILY_HELP);
  if (values.workflow && !values.base) throw new CliError("--workflow 需要 --base <ref>", 2);
  const ctx = loadDailyContext(cfg.root, cfg.dailyAvoidTerms, cfg.publicUrl);
  const { errors, warnings, load } = checkDaily(cfg.root, ctx);
  if (values.base) errors.push(...baseErrors(cfg.root, values.base, load, values.workflow ?? false));
  for (const w of warnings) warn(w);
  for (const e of errors) fail(e);
  const summary = `${load.days.length} 天，${load.days.reduce((n, d) => n + (d.topics?.topics.length ?? 0), 0)} 个 topic，${Object.keys(load.state.topics).length} 条人工状态`;
  if (errors.length) throw new CliError(`daily 检查未通过（${errors.length} 个错误；${summary}）`);
  ok(`daily 检查通过（${summary}${warnings.length ? `，${warnings.length} 个警告` : ""}）`);
}

/** <ref> 时的 state.yml 原文；那时没有这个文件则为 null。ref 不存在时报错（失败即拒绝）。 */
function stateTextAt(root: string, ref: string): string | null {
  const run = (args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    run(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  } catch {
    throw new CliError(`--base ${ref} 不是可用的提交`);
  }
  const path = `${ref}:${DAILY_DIR}/${STATE_FILE}`;
  try {
    run(["cat-file", "-e", path]);
  } catch {
    return null;
  }
  return run(["show", path]);
}

function baseErrors(root: string, ref: string, load: DailyLoad, workflow: boolean): string[] {
  const before = stateTextAt(root, ref);
  if (workflow) {
    return before === load.stateText ? [] : [`${DAILY_DIR}/${STATE_FILE}: workflow 的提交不能改动人工状态（和 ${ref} 不一致）`];
  }
  if (before === null) return stateChangeErrors({ schema: 1, topics: {} }, load.state);
  const parsed = stateFileSchema.safeParse(parseYaml(before));
  if (!parsed.success) return formatZodIssues(parsed.error).map((m) => `${ref}:${DAILY_DIR}/${STATE_FILE}: ${m}`);
  return stateChangeErrors(parsed.data, load.state);
}

// ───────────────────────── import ─────────────────────────

function cmdDailyImport(cfg: HubConfig, argv: string[]): void {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      manifest: { type: "string" },
      items: { type: "string" },
      candidate: { type: "string" },
      regenerate: { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) return info(DAILY_HELP);
  const [date] = positionals;
  if (!date || positionals.length !== 1 || !isValidDate(date) || !values.manifest || !values.items) {
    throw new CliError("用法：rh daily import <YYYY-MM-DD> --manifest <file> --items <items.jsonl> [--candidate <dir>] [--regenerate]", 2);
  }

  const input = readManifest(values.manifest);
  if (input.date !== date) throw new CliError(`--manifest 的 date（${input.date}）不是 ${date}`);
  const w = dailyWindow(date);
  if (Date.parse(input.window.from) !== Date.parse(w.from) || Date.parse(input.window.to) !== Date.parse(w.to)) throw new CliError(`--manifest 的 window 必须是 [${w.from}, ${w.to})`);
  let items;
  try {
    items = parseItemsJsonl(readFileSync(values.items, "utf8"));
  } catch (e) {
    throw new CliError((e as Error).message);
  }

  const late = isLate(date, input.run.at);
  const gen = shouldGenerate(input.digest.status, late, items.size);
  if (values.candidate && !gen) throw new CliError("按 ADR 0004 §5 这次不应调用生成（还没到 T_last 且没有日报，或没有条目），不能导入候选");

  const [y, mo, d] = date.split("-");
  const rel = [DAILY_DIR, y, mo, d];
  const dayDir = join(cfg.root, ...rel);
  rel.forEach((_, i) => {
    const p = join(cfg.root, ...rel.slice(0, i + 1));
    if ((existsSync(p) || isSymlink(p)) && lstatSync(p).isSymbolicLink()) throw new CliError(`${rel.slice(0, i + 1).join("/")} 是符号链接，拒绝写入`);
  });
  const existingFile = join(dayDir, DAY_FILES.manifest);
  const existing = existsSync(existingFile) ? readManifest(existingFile) : undefined;
  const existingFinal = existing !== undefined && isFinalStatus(existing.status);
  if (existingFinal && !values.regenerate) {
    info(`${date} 已是终态（${existing!.status}），什么都不做`);
    return;
  }

  let res: ImportResult | undefined;
  let outcome: number | "failed" | "rejected" | "skipped";
  if (!gen) outcome = "skipped";
  else if (!values.candidate) outcome = "failed";
  else {
    res = importCandidate(date, values.candidate, items, loadDailyContext(cfg.root, cfg.dailyAvoidTerms, cfg.publicUrl));
    outcome = res.rejected ? "rejected" : res.topics!.topics.length;
  }
  for (const r of res?.rejected ?? []) fail(`候选被整体拒绝：${r}`);
  for (const x of res?.dropped ?? []) warn(`丢弃 topics[${x.topic}]（${x.reason}）：${x.message}`);
  for (const x of res?.warnings ?? []) warn(x);

  if (existingFinal && typeof outcome !== "number") {
    throw new CliError(`regenerate 没有得到可用的候选（${outcome}），保留 ${date} 的原结果`, 3);
  }
  const { status, reasons } = resolveStatus({ digest: input.digest.status, late, items: items.size, outcome });
  const topics: TopicsFile | undefined = res?.topics ?? (isFinalStatus(status) ? { schema: 1, date, topics: [], items: {} } : undefined);
  const manifest: Manifest = {
    schema: 1,
    date,
    status,
    reasons,
    window: input.window,
    digest: input.digest,
    sources: input.sources,
    counts: {
      items: items.size,
      cited_items: Object.keys(topics?.items ?? {}).length,
      topics: topics?.topics.length ?? 0,
      dropped: res?.dropped.length ?? 0,
      warnings: res?.warnings.length ?? 0,
    },
    dropped: (res?.dropped ?? []).map(({ topic, reason }) => ({ topic, reason })),
    generator: input.generator,
    run: input.run,
    generated_at: typeof outcome === "number" ? input.run.at : null,
    updated_at: input.run.at,
  };

  mkdirSync(dayDir, { recursive: true });
  const topicsPath = join(dayDir, DAY_FILES.topics);
  if (topics) writeFileSync(topicsPath, stringifyYaml(topics, { lineWidth: 0, aliasDuplicateObjects: false }));
  else rmSync(topicsPath, { force: true });
  writeFileSync(existingFile, `${JSON.stringify(manifest, null, 2)}\n`);
  ok(`${rel.join("/")}/：${status}${reasons.length ? `（${reasons.join(", ")}）` : ""}，${manifest.counts.topics} 个 topic，丢弃 ${manifest.counts.dropped} 个`);
}

function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function readManifest(file: string): Manifest {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new CliError(`${file} 不是合法 JSON：${(e as Error).message}`);
  }
  const r = manifestSchema.safeParse(raw);
  if (!r.success) throw new CliError(`${file} 不合法：${formatZodIssues(r.error).join("；")}`);
  return r.data;
}

// ───────────────────────── probe ─────────────────────────

/** 链接是否可访问：先 HEAD，不行再 GET。返回 null 表示可访问，否则是失败原因。 */
export async function probeUrl(url: string, timeoutMs: number): Promise<string | null> {
  let last = "";
  for (const method of ["HEAD", "GET"]) {
    try {
      const res = await fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
      await res.body?.cancel();
      if (res.ok) return null;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = (e as Error).message;
    }
  }
  return last;
}

async function cmdDailyProbe(cfg: HubConfig, argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { timeout: { type: "string", default: "10000" }, help: { type: "boolean", short: "h" } },
  });
  if (values.help) return info(DAILY_HELP);
  const timeout = Number(values.timeout);
  if (!Number.isInteger(timeout) || timeout <= 0) throw new CliError("--timeout 必须是正整数（毫秒）", 2);
  const load = loadDaily(cfg.root);
  if (load.errors.length) throw new CliError(`daily/ 不合法，先运行 rh daily check：\n${load.errors.join("\n")}`);
  const days = positionals.length ? load.days.filter((d) => positionals.includes(d.date)) : load.days;
  const urls = new Set<string>();
  for (const d of days) {
    for (const it of Object.values(d.topics?.items ?? {})) for (const u of [it.url, it.origin_url, it.via]) if (u) urls.add(u);
    for (const t of d.topics?.topics ?? []) for (const r of t.references) if ("extra" in r) urls.add(r.extra);
  }
  let bad = 0;
  for (const u of [...urls].sort()) {
    const e = await probeUrl(u, timeout);
    if (e) {
      bad++;
      fail(`${u}：${e}`);
    }
  }
  if (bad) throw new CliError(`${bad} / ${urls.size} 个链接不可访问`);
  ok(`${urls.size} 个链接都可访问（${days.length} 天）`);
}

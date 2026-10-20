/**
 * Daily workflow 的确定性步骤（WHI-1937，ADR 0004 §4–§6、§11）。.github/workflows/daily.yml 调用，不调用 LLM，不联网。
 *
 *   plan       这次运行处理哪些日期：定时 / 试验分支 = 今天，昨天不是终态时加上昨天；手动 = 指定日期（终态要 --regenerate）；
 *              以及 notify job 要看哪些日期（WHI-1972）：定时 = 今天和昨天，手动 = 指定日期，试验分支不推送；--notify-only 只推送不处理
 *   context    按 .claude/skills/daily-topics/references/input.md 生成 generate job 的 input/context.json（只有公开上下文）
 *   reuse      regenerate：把保存的 ingest 输出（items artifact）当作这次的输入，manifest.run 的 id / attempt 换成这次运行（run.at 不变）
 *   generator  在 ingest manifest 里填 generator {skill_version, model, inputs_sha256}（由 job 写，不由模型写）
 *   candidates commit job 下载的候选 artifact 当作不可信输入：顶层只能是本次要生成的日期目录，任何地方都不能有符号链接
 *   settle     导入后：pending 的 manifest 状态和原因都没变时恢复成基线版本，不产生提交
 *   stage      只 git add 本次日期的 daily/YYYY/MM/DD/{manifest.json,topics.yml}；工作区有其他改动就失败（失败即关闭）
 *   scope      push 之前（含 rebase 之后）：<base>..HEAD 只改了本次日期的这两个文件
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import { loadConfig } from "../lib/config.ts";
import { DAILY_DIR, DAY_FILES, isFinalStatus, isLate, lastAttempt, loadDaily, manifestSchema, parseItemsJsonl, publicDay, shouldGenerate, type Manifest } from "../lib/daily.ts";
import { isPublicPublished, loadReports, loadTags } from "../lib/reports.ts";
import { isValidDate } from "../lib/schema.ts";
import { projectSite } from "../lib/site-data.ts";

export const SKILL_DIR = join(".claude", "skills", "daily-topics");
const DAY_MS = 86_400_000;
const addDays = (d: string, n: number): string => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
export const dayDir = (date: string): string => [DAILY_DIR, ...date.split("-")].join("/");

export class DailyError extends Error {}

// ───────── plan ─────────

export type Event = "schedule" | "workflow_dispatch" | "push";
export interface Plan {
  /** 按处理顺序：今天在前，昨天在后（同一个 ingest 状态目录，顺序执行） */
  dates: { date: string; mode: "ingest" | "regenerate" }[];
  skipped: { date: string; why: string }[];
  /**
   * notify job 要看的日期（WHI-1972），不论这次是否处理它们（早一轮已是 degraded、最后一轮没变化时也要在最后一轮推送）。
   * final = 这一天的最后一次运行（运行时刻 ≥ T_last(D)）或手动运行：degraded / empty 只在 final 时推送。
   */
  notify: { date: string; final: boolean; regenerate: boolean }[];
}

export function plan(root: string, o: { event: Event; now: string; date?: string; regenerate?: boolean; notifyOnly?: boolean }): Plan {
  const load = loadDaily(root);
  if (load.errors.length) throw new DailyError(`daily/ 不合法，先修好它（rh daily check）：\n${load.errors.join("\n")}`);
  const status = new Map(load.days.map((d) => [d.date, d.manifest.status]));
  const today = o.now.slice(0, 10);
  const out: Plan = { dates: [], skipped: [], notify: [] };
  if (o.notifyOnly && (o.event !== "workflow_dispatch" || o.regenerate)) throw new DailyError("notify_only 只能手动运行，而且不能和 regenerate 一起用");
  if (o.event === "workflow_dispatch") {
    const date = o.date || today;
    if (!isValidDate(date)) throw new DailyError(`date 必须是 YYYY-MM-DD：${date}`);
    if (date > today) throw new DailyError(`${date} 还没到（今天是 ${today} UTC）`);
    out.notify.push({ date, final: true, regenerate: Boolean(o.regenerate) });
    if (o.notifyOnly) {
      out.skipped.push({ date, why: "notify_only：只推送线上版本，不处理" });
      return out;
    }
    const s = status.get(date);
    if (s && isFinalStatus(s)) {
      if (o.regenerate) out.dates.push({ date, mode: "regenerate" });
      else out.skipped.push({ date, why: `已是终态（${s}）；要重做请勾选 regenerate` });
    } else out.dates.push({ date, mode: "ingest" });
    return out;
  }
  // 定时运行与试验分支：今天；昨天还不是终态时一并收尾（ADR 0004 §4）。更早的日期只能手动补跑
  for (const date of [today, addDays(today, -1)]) {
    const s = status.get(date);
    if (s && isFinalStatus(s)) out.skipped.push({ date, why: `已是终态（${s}），什么都不做` });
    else out.dates.push({ date, mode: "ingest" });
    if (o.event === "schedule") out.notify.push({ date, final: Date.parse(o.now) >= Date.parse(lastAttempt(date)), regenerate: false });
  }
  return out;
}

// ───────── context ─────────

/**
 * generate job 的 context.json（references/input.md § 输入文件：context.json）。只有公开上下文。
 * 失败即关闭（ADR 0004 §2）：报告或标签有任何校验问题（如 slug 重复）就不打包；报告按它自己的 visibility / status 选，不按 slug 查投影。
 */
export function buildContext(root: string, manifest: Manifest): Record<string, unknown> {
  const cfg = loadConfig(root);
  const { reports, issues } = loadReports(root);
  const tagLoad = loadTags(root);
  const bad = [...issues, ...tagLoad.issues];
  if (bad.length) throw new DailyError(`报告数据不合法，不打包 context（先运行 rh check）：\n${bad.map((i) => `  ${i.where}: ${i.message}`).join("\n")}`);
  const view = projectSite("public", reports, tagLoad.tags, cfg.publicUrl);
  const publicReports = reports
    .filter(isPublicPublished)
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((r) => {
      const m = r.meta;
      return {
        slug: r.slug,
        title: m.title,
        ...(m.title_en ? { title_en: m.title_en } : {}),
        summary: m.summary,
        ...(m.summary_en ? { summary_en: m.summary_en } : {}),
        domain: m.domain,
        tags: m.tags,
        created: m.created,
        updated: m.updated,
      };
    });
  const from = addDays(manifest.date, -14);
  const recent = loadDaily(root)
    .days.filter((d) => d.date >= from && d.date < manifest.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(publicDay);
  return {
    schema: 1,
    date: manifest.date,
    window: manifest.window,
    digest: { status: manifest.digest.status, url: manifest.digest.url },
    avoid_terms: cfg.dailyAvoidTerms,
    public_tags: view.tags,
    public_reports: publicReports,
    recent_days: recent,
  };
}

// ───────── generator ─────────

const sha256 = (b: Buffer | string): string => createHash("sha256").update(b).digest("hex");

function filesUnder(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) throw new DailyError(`${relative(base, p)} 是符号链接`);
    return st.isDirectory() ? filesUnder(p, base) : [relative(base, p)];
  });
}

/** 目录哈希，等于 `(cd dir && find . -type f | LC_ALL=C sort | xargs sha256sum) | sha256sum`（references/input.md）。 */
export function dirHash(dir: string): string {
  const paths = filesUnder(dir).map((p) => `./${p}`).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  return sha256(paths.map((p) => `${sha256(readFileSync(join(dir, p)))}  ${p}\n`).join(""));
}

export function skillVersion(root: string): string {
  const dir = join(root, SKILL_DIR);
  const fm = readFileSync(join(dir, "SKILL.md"), "utf8").match(/^---\n([\s\S]*?)\n---/);
  const version = (parseYaml(fm?.[1] ?? "") as { metadata?: { version?: unknown } } | null)?.metadata?.version;
  if (typeof version !== "string" && typeof version !== "number") throw new DailyError(`${SKILL_DIR}/SKILL.md 缺少 metadata.version`);
  return `daily-topics/${version}+${dirHash(dir).slice(0, 12)}`;
}

export function readManifest(file: string): Manifest {
  const r = manifestSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!r.success) throw new DailyError(`${file} 不是合法的 manifest：${r.error.message}`);
  return r.data;
}

// ───────── candidates ─────────

/** 候选 artifact 的顶层只能是 dates 里的目录；任何层级都不能有符号链接。目录里的内容交给 rh daily import 检查。 */
export function candidateArtifactErrors(dir: string, dates: string[]): string[] {
  if (!existsSync(dir)) return [];
  const errors: string[] = [];
  const st = lstatSync(dir);
  if (st.isSymbolicLink() || !st.isDirectory()) return [`${dir} 不是普通目录`];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const s = lstatSync(p);
    if (!dates.includes(n)) errors.push(`多余的条目：${n}`);
    else if (s.isSymbolicLink() || !s.isDirectory()) errors.push(`${n} 不是普通目录`);
    else {
      try {
        filesUnder(p);
      } catch (e) {
        errors.push(`${n}/${(e as Error).message}`);
      }
    }
  }
  return errors;
}

// ───────── settle / stage ─────────

const git = (root: string, args: string[]): string => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function textAt(root: string, ref: string, path: string): string | null {
  try {
    return git(root, ["show", `${ref}:${path}`]);
  } catch {
    return null;
  }
}

/** pending 的 manifest 只在状态或原因变化时提交（ADR 0004 §5）。返回 true = 恢复成了基线版本。 */
export function settle(root: string, date: string, base: string): boolean {
  const path = `${dayDir(date)}/${DAY_FILES.manifest}`;
  const file = join(root, path);
  if (!existsSync(file)) return false;
  const now = readManifest(file);
  const beforeText = textAt(root, base, path);
  if (now.status !== "pending" || beforeText === null) return false;
  const before = manifestSchema.safeParse(JSON.parse(beforeText));
  if (!before.success || before.data.status !== "pending" || before.data.reasons.join() !== now.reasons.join()) return false;
  writeFileSync(file, beforeText);
  return true;
}

const allowedPaths = (dates: string[]): Set<string> => new Set(dates.flatMap((d) => [`${dayDir(d)}/${DAY_FILES.manifest}`, `${dayDir(d)}/${DAY_FILES.topics}`]));

/** 要推送的提交只能新增或修改本次日期的两个文件（GIT_WORKFLOW § Content lane）；rebase 之后对新的基线再查一次。 */
export function scopeErrors(root: string, base: string, dates: string[]): string[] {
  const allowed = allowedPaths(dates);
  const rows = git(root, ["diff", "--name-status", "--no-renames", "-z", `${base}..HEAD`]).split("\0").filter(Boolean);
  const errors: string[] = [];
  for (let i = 0; i + 1 < rows.length; i += 2) {
    const [status, path] = [rows[i], rows[i + 1]];
    if (!allowed.has(path) || !["A", "M"].includes(status)) errors.push(`${status} ${path}`);
  }
  return errors;
}

/** 工作区里只允许本次日期的两个文件新增或修改；其余任何改动（含删除、改名、其他路径）都让这次运行失败。 */
export function stagePaths(root: string, dates: string[]): string[] {
  const allowed = allowedPaths(dates);
  const entries = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]).split("\0").filter(Boolean);
  const bad: string[] = [];
  const ok: string[] = [];
  for (const e of entries) {
    const code = e.slice(0, 2);
    const path = e.slice(3);
    if (allowed.has(path) && ["??", " M", "M ", "A "].includes(code)) ok.push(path);
    else bad.push(`${code} ${path}`);
  }
  if (bad.length) throw new DailyError(`工作区有不允许的改动（Daily workflow 只能写本次日期的 daily/YYYY/MM/DD/）：\n${bad.join("\n")}`);
  return ok.sort();
}

// ───────── CLI ─────────

const output = (k: string, v: string): void => {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
};

function main(argv: string[]): void {
  const [cmd, ...rest] = argv;
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      event: { type: "string" },
      now: { type: "string" },
      date: { type: "string" },
      regenerate: { type: "boolean", default: false },
      "notify-only": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      manifest: { type: "string" },
      input: { type: "string" },
      model: { type: "string" },
      out: { type: "string" },
      base: { type: "string" },
      dates: { type: "string", default: "" },
    },
  });
  const root = loadConfig().root;
  const dates = values.dates.split(/[\s,]+/).filter(Boolean);
  switch (cmd) {
    case "plan": {
      const event = values.event as Event;
      if (!["schedule", "workflow_dispatch", "push"].includes(event)) throw new DailyError(`--event 不支持：${values.event}`);
      const notifyOnly = values["notify-only"];
      const p = plan(root, { event, now: values.now ?? new Date().toISOString(), date: values.date, regenerate: values.regenerate, notifyOnly });
      for (const s of p.skipped) console.log(`skip ${s.date}: ${s.why}`);
      for (const d of p.dates) console.log(`run  ${d.date}: ${d.mode}`);
      for (const n of p.notify) console.log(`lark ${n.date}: ${n.final ? "final" : "not final"}${n.regenerate ? ", regenerate" : ""}`);
      if (values.force && !notifyOnly) console.log("force 只和 notify_only 一起生效，这次忽略");
      output("dates", JSON.stringify(p.dates));
      output("any", String(p.dates.length > 0));
      output("notify", JSON.stringify(p.notify));
      output("notify_only", String(notifyOnly));
      output("force", String(values.force && notifyOnly));
      return;
    }
    case "context": {
      if (!values.manifest || !values.out) throw new DailyError("用法：context --manifest <ingest manifest> --out <context.json>");
      writeFileSync(values.out, `${JSON.stringify(buildContext(root, readManifest(values.manifest)), null, 2)}\n`);
      return;
    }
    case "generator": {
      if (!values.manifest || !values.input || !values.model) throw new DailyError("用法：generator --manifest <file> --input <dir> --model <name>");
      const m = readManifest(values.manifest);
      m.generator = { skill_version: skillVersion(root), model: values.model, inputs_sha256: dirHash(values.input) };
      writeFileSync(values.manifest, `${JSON.stringify(manifestSchema.parse(m), null, 2)}\n`);
      console.log(`${m.date}: ${m.generator.skill_version} ${m.generator.model} inputs ${m.generator.inputs_sha256.slice(0, 12)}`);
      return;
    }
    case "reuse": {
      // regenerate 不重新抓取：条目来自原来那次运行的 items artifact（30 天），状态按原来的 run.at 判断
      if (!values.manifest || !values.input) throw new DailyError("用法：reuse --manifest <file> --input <items.jsonl> --date D");
      const m = readManifest(values.manifest);
      if (m.date !== values.date) throw new DailyError(`保存的 manifest 是 ${m.date}，不是 ${values.date}`);
      m.run = { ...m.run, id: process.env.GITHUB_RUN_ID ?? m.run.id, attempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? m.run.attempt) };
      writeFileSync(values.manifest, `${JSON.stringify(manifestSchema.parse(m), null, 2)}\n`);
      const items = parseItemsJsonl(readFileSync(values.input, "utf8"));
      output("generate", String(shouldGenerate(m.digest.status, isLate(m.date, m.run.at), items.size)));
      return;
    }
    case "candidates": {
      const [dir] = positionals;
      if (!dir) throw new DailyError("用法：candidates <dir> --dates D1,D2");
      const errors = candidateArtifactErrors(dir, dates);
      if (errors.length) throw new DailyError(`候选 artifact 被整体拒绝：\n${errors.join("\n")}`);
      return;
    }
    case "settle": {
      if (!values.base || !dates.length) throw new DailyError("用法：settle --base <ref> --dates D1,D2");
      for (const d of dates) if (settle(root, d, values.base)) console.log(`${d}: pending，状态和原因都没变，不提交 manifest`);
      return;
    }
    case "stage": {
      const paths = stagePaths(root, dates);
      if (paths.length) git(root, ["add", "--", ...paths]);
      for (const p of paths) console.log(`staged ${p}`);
      output("changed", String(paths.length > 0));
      return;
    }
    case "scope": {
      if (!values.base || !dates.length) throw new DailyError("用法：scope --base <ref> --dates D1,D2");
      const errors = scopeErrors(root, values.base, dates);
      if (errors.length) throw new DailyError(`要推送的提交改了本次日期以外的路径（Daily workflow 只能写 daily/YYYY/MM/DD/）：\n${errors.join("\n")}`);
      console.log(`scope ok: ${/^[0-9a-f]{40}$/.test(values.base) ? values.base.slice(0, 12) : values.base}..HEAD only touches ${dates.map(dayDir).join(", ")}`);
      return;
    }
    default:
      throw new DailyError("用法：node scripts/daily.ts plan|context|reuse|generator|candidates|settle|stage|scope …");
  }
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(`::error::${(e as Error).message.split("\n")[0]}`);
    console.error((e as Error).message);
    process.exit(1);
  }
}

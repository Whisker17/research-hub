/** 创建报告目录、标签确认等 new / import 共用逻辑。 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { loadReports, loadTags } from "../../lib/reports.ts";
import { DOMAINS, SESSION_RUNTIMES, SLUG_RE, VISIBILITIES, isValidDate, metaSchema, formatZodIssues, type Meta, type SessionRuntime } from "../../lib/schema.ts";
import { detectSession, type Session } from "../../lib/session.ts";
import { CliError, ask, confirm, ok, today, writeMeta, writeTags } from "./util.ts";

/** 解析 Markdown 开头的 YAML frontmatter。 */
export function readFrontmatter(markdown: string): Record<string, unknown> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(markdown);
  if (!m) return {};
  try {
    const v = parseYaml(m[1]);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
export const strList = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

/** 确保标签都已登记；未登记的在交互终端里逐个确认后加入 tags.yml。 */
export async function ensureTags(root: string, wanted: string[]): Promise<void> {
  const { tags, issues } = loadTags(root);
  if (issues.length) throw new CliError(`tags.yml 有问题：${issues.map((i) => i.message).join("；")}`);
  const missing = wanted.filter((t) => !tags[t]);
  if (!missing.length) return;
  for (const t of missing) {
    if (!SLUG_RE.test(t)) throw new CliError(`标签“${t}”不合法：只能用小写字母、数字和连字符`);
    if (!process.stdin.isTTY) {
      throw new CliError(`标签“${t}”没有登记。先确认它不是已有标签的同义词，再运行：rh tags add ${t} --label <展示名>`);
    }
    const known = Object.keys(tags);
    if (known.length) console.log(`已登记的标签：${known.join(", ")}`);
    if (!(await confirm(`标签“${t}”还没有登记，确认它不是上面某个标签的同义词，并登记为新标签？`))) {
      throw new CliError(`已取消：标签“${t}”未登记`);
    }
    const label = (await ask(`“${t}”的展示名（回车使用 ${t}）：`)) || t;
    tags[t] = { label };
    ok(`登记标签 ${t}（${label}）`);
  }
  writeTags(root, tags);
}

export interface NewReportInput {
  slug: string;
  title: string;
  summary: string;
  created: string;
  domain: string;
  tags: string[];
  visibility: string;
  kind: "native" | "imported";
  source_repo?: string;
  brief_source?: string;
  changelogNote: string;
  session?: Session | null;
}

export const SESSION_OPTIONS = { session: { type: "string" }, runtime: { type: "string" } } as const;

/** 本次命令的会话：--session 必须配 --runtime；只给 --runtime 时读该 runtime 的环境变量；都不给时自动识别。 */
export function resolveSession(v: { session?: string; runtime?: string }, env: Record<string, string | undefined> = process.env): Session | null {
  if (v.runtime !== undefined && !(SESSION_RUNTIMES as readonly string[]).includes(v.runtime)) {
    throw new CliError(`--runtime 必须是 ${SESSION_RUNTIMES.join(" | ")} 之一`, 2);
  }
  const runtime = v.runtime as SessionRuntime | undefined;
  if (v.session !== undefined) {
    if (!runtime) throw new CliError("--session 需要同时给 --runtime", 2);
    if (!v.session.trim()) throw new CliError("--session 不能为空", 2);
    return { runtime, id: v.session.trim() };
  }
  return detectSession(env, runtime);
}

/** 校验输入并创建 reports/YYYY/MM/<slug>/ 与 meta.yml；返回目录。 */
export function createReportDir(root: string, input: NewReportInput): { dir: string; meta: Meta } {
  if (!SLUG_RE.test(input.slug)) throw new CliError(`slug“${input.slug}”不合法：只能用小写字母、数字和连字符（用 --slug 指定）`);
  if (!isValidDate(input.created)) throw new CliError(`日期“${input.created}”不合法，格式是 YYYY-MM-DD`);
  if (!(DOMAINS as readonly string[]).includes(input.domain)) throw new CliError(`domain 必须是 ${DOMAINS.join(" | ")} 之一（用 --domain 指定）`);
  if (!(VISIBILITIES as readonly string[]).includes(input.visibility)) throw new CliError(`visibility 必须是 ${VISIBILITIES.join(" | ")} 之一`);

  const { reports } = loadReports(root);
  const clash = reports.find((r) => r.slug === input.slug);
  if (clash) throw new CliError(`slug“${input.slug}”已被 ${clash.relDir} 使用；重新调研请就地更新该报告`);

  const [y, m] = input.created.split("-");
  const dir = join(root, "reports", y, m, input.slug);
  if (existsSync(dir)) throw new CliError(`目录已存在：${dir}`);

  const raw = {
    title: input.title,
    summary: input.summary,
    created: input.created,
    updated: input.created,
    domain: input.domain,
    tags: input.tags,
    status: "draft",
    visibility: input.visibility,
    kind: input.kind,
    source_repo: input.source_repo,
    brief_source: input.brief_source,
    changelog: [{ date: input.created, note: input.changelogNote }],
    sessions: input.session ? [{ ...input.session, at: today() }] : undefined,
  };
  const parsed = metaSchema.safeParse(raw);
  if (!parsed.success) throw new CliError(`meta 不合法：\n  ${formatZodIssues(parsed.error).join("\n  ")}`);
  mkdirSync(dir, { recursive: true });
  writeMeta(dir, raw);
  return { dir, meta: parsed.data };
}

export function readText(file: string): string {
  if (!existsSync(file)) throw new CliError(`找不到文件：${file}`);
  return readFileSync(file, "utf8");
}

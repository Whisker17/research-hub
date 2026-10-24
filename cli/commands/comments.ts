/**
 * rh comments：在终端读取、回复、解决评论线程（ADR 0005 §5、§9、§10）。
 * 调用私有站点（rh.config.json 的 privateUrl）的 /api/comments*，用 Access service token 认证：
 * 环境变量 RH_ACCESS_CLIENT_ID / RH_ACCESS_CLIENT_SECRET，只放进请求头，从不打印。
 * 列表与线程都跟着 next 游标取到底，不静默截断。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import type { HubConfig } from "../../lib/config.ts";
import { loadReports, REPORT_FILES, type Report } from "../../lib/reports.ts";
import type { SessionRuntime } from "../../lib/schema.ts";
import { detectSession, resumeCommand } from "../../lib/session.ts";
import { CliError, info, ok } from "../lib/util.ts";

export const COMMENTS_HELP = `rh comments list [<slug>] [--status open|resolved|all] [--lang zh|en] [--json]
rh comments show <threadId> [--json]
rh comments reply <threadId> (--body <文字> | --body-file <路径|->) [--as <名字>]
rh comments resolve <threadId>
rh comments reopen <threadId>

  读写私有站点上的评论（ADR 0005）。认证用 Access service token：
  环境变量 RH_ACCESS_CLIENT_ID 与 RH_ACCESS_CLIENT_SECRET。
  list    默认只列 open 的线程；不给 --lang 就是两种语言；不给 slug 就是全部报告
  reply   以 agent 身份回复（--as 缺省为 agent），自动附上当前会话（PI_SESSION_ID / CLAUDE_CODE_SESSION_ID）
  --json  输出 rh.comments/v1：每个线程带 url、source（{file, line}，引文在 explainer
          里唯一匹配时才有，否则为 null）、outdated（线程的 rev ≠ 本地渲染的 rev；本地没有页面时为 null）
          和全部评论（含 agent 会话的恢复命令）`;

export const COMMENTS_SCHEMA = "rh.comments/v1";

type Row = Record<string, unknown>;
interface ApiThread extends Row {
  id: string; slug: string; lang: "zh" | "en"; status: string; quote: string; prefix: string; suffix: string; heading: string | null; rev: string; created_at: string;
}

// ---- API ----

async function api<T>(cfg: HubConfig, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const id = process.env.RH_ACCESS_CLIENT_ID?.trim();
  const secret = process.env.RH_ACCESS_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new CliError("缺少 service token：设置环境变量 RH_ACCESS_CLIENT_ID 与 RH_ACCESS_CLIENT_SECRET", 2);
  const headers: Record<string, string> = { "CF-Access-Client-Id": id, "CF-Access-Client-Secret": secret, accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(cfg.privateUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  } catch (e) {
    const cause = (e as { cause?: { message?: string } }).cause?.message;
    throw new CliError(`连不上评论 API ${cfg.privateUrl}：${(e as Error).message}${cause ? `（${cause}）` : ""}`);
  }
  let data: (T & { error?: string }) | undefined;
  try {
    data = JSON.parse(await res.text());
  } catch {
    data = undefined;
  }
  const detail = typeof data?.error === "string" ? `：${data.error}` : "";
  // Access 不认 token 时返回 403 或重定向到登录页；Worker 不认这个 client id 时返回 403
  if (res.status === 403 || (res.status >= 300 && res.status < 400)) {
    throw new CliError(`service token not allowed（HTTP ${res.status}${detail}）：检查 Access 的 Service Auth 策略与 Worker 的 AGENT_CLIENT_IDS`);
  }
  if (!res.ok || data === undefined) throw new CliError(`评论 API ${method} ${path} 失败：HTTP ${res.status}${detail || (res.ok ? "：响应不是 JSON" : "")}`);
  return data;
}

async function listAll(cfg: HubConfig, params: URLSearchParams): Promise<(ApiThread & { comments: Row[]; more: boolean })[]> {
  const out: (ApiThread & { comments: Row[]; more: boolean })[] = [];
  for (let cursor: string | null = null; ;) {
    const q = new URLSearchParams(params);
    if (cursor) q.set("cursor", cursor);
    const page: { threads: (ApiThread & { comments: Row[]; more: boolean })[]; next: string | null } = await api(cfg, "GET", `/api/comments?${q}`);
    out.push(...page.threads);
    if (!page.next) return out;
    cursor = page.next;
  }
}

async function getThread(cfg: HubConfig, id: string): Promise<{ thread: ApiThread; comments: Row[] }> {
  let thread: ApiThread | undefined;
  const comments: Row[] = [];
  for (let cursor: string | null = null; ;) {
    const page: { thread: ApiThread; comments: Row[]; next: string | null } =
      await api(cfg, "GET", `/api/comments/threads/${encodeURIComponent(id)}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
    thread ??= page.thread;
    comments.push(...page.comments);
    if (!page.next) return { thread, comments };
    cursor = page.next;
  }
}

// ---- 本地：rev 与源文件映射 ----

/** ADR 0005 §5 的空白规范化；另外去掉 Markdown 强调与代码标记（* _ `），页面文字里没有它们。map[i] = 规范化文本第 i 个字符在原文里的位置 */
function normalize(s: string): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  let space = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/\s/.test(ch)) space = true;
    else if (ch !== "*" && ch !== "_" && ch !== "`") {
      if (space && text) text += " ", map.push(i);
      space = false;
      text += ch;
      map.push(i);
    }
  }
  return { text, map };
}

/**
 * 引文在源文里的行号（从 1 开始）：只有一处出现就用它；多处时只留前面紧接 prefix、后面紧接 suffix 的，剩一处才用。
 * 其他情况（找不到、仍有多个候选）返回 null，不猜。
 */
export function findSourceLine(src: string, t: { quote: string; prefix: string; suffix: string }): number | null {
  const s = normalize(src);
  const q = normalize(t.quote).text;
  if (!q) return null;
  let hits: number[] = [];
  for (let i = s.text.indexOf(q); i !== -1; i = s.text.indexOf(q, i + 1)) hits.push(i);
  if (hits.length > 1) {
    const p = normalize(t.prefix).text;
    const x = normalize(t.suffix).text;
    hits = hits.filter((i) => s.text.slice(0, i).trimEnd().endsWith(p) && s.text.slice(i + q.length).trimStart().startsWith(x));
  }
  return hits.length === 1 ? src.slice(0, s.map[hits[0]]).split("\n").length : null;
}

function localView(cfg: HubConfig) {
  const reports = new Map<string, Report>(loadReports(cfg.root).reports.map((r) => [r.slug, r]));
  const read = (file: string) => (existsSync(file) ? readFileSync(file) : null);
  return (t: ApiThread) => {
    const r = reports.get(t.slug);
    if (!r) return { outdated: null, source: null };
    const html = read(join(r.dir, t.lang === "en" ? REPORT_FILES.htmlEn : REPORT_FILES.html));
    const rev = html && createHash("sha256").update(html).digest("hex").slice(0, 12);
    // 导入报告可能只有原稿 source.md
    const file = [t.lang === "en" ? REPORT_FILES.explainerEn : REPORT_FILES.explainer, REPORT_FILES.source].map((f) => join(r.dir, f)).find(existsSync);
    const line = file ? findSourceLine(readFileSync(file, "utf8"), t) : null;
    return { outdated: rev === null ? null : rev !== t.rev, source: file && line !== null ? { file: relative(cfg.root, file), line } : null };
  };
}

function view(cfg: HubConfig, local: ReturnType<typeof localView>, t: ApiThread, comments: Row[]) {
  return {
    id: t.id, slug: t.slug, lang: t.lang, status: t.status, quote: t.quote, prefix: t.prefix, suffix: t.suffix, heading: t.heading, rev: t.rev,
    ...local(t),
    url: `${cfg.privateUrl}/p/${t.slug}/${t.lang === "en" ? "en/" : ""}#c-${t.id}`,
    created_at: t.created_at,
    comments: comments.map((c) => ({
      id: c.id, author: c.author, author_kind: c.author_kind, author_name: c.author_name,
      agent_runtime: c.agent_runtime ?? null, agent_session: c.agent_session ?? null,
      resume: c.agent_runtime && c.agent_session ? resumeCommand({ runtime: c.agent_runtime as SessionRuntime, id: c.agent_session as string }) : null,
      created_at: c.created_at, body: c.body,
    })),
  };
}
type ThreadView = ReturnType<typeof view>;

function print(threads: ThreadView[], full: boolean): void {
  for (const t of threads) {
    info(`${t.id}  ${t.slug}/${t.lang}  ${t.status}${t.outdated ? "  outdated" : ""}`);
    info(`  “${t.quote.length > 80 && !full ? `${t.quote.slice(0, 80)}…` : t.quote}”${t.heading ? `  § ${t.heading}` : ""}`);
    info(`  ${t.source ? `${t.source.file}:${t.source.line}` : "source: —"}  ${t.url}`);
    for (const c of full ? t.comments : t.comments.slice(-1)) {
      info(`  ${full ? "" : `(${t.comments.length}) `}${c.author_name}${c.author_kind === "agent" ? " [agent]" : ""} · ${c.created_at}`);
      const body = String(c.body);
      info(`    ${(full ? body : body.split("\n")[0]).replace(/\n/g, "\n    ")}`);
      if (full && c.resume) info(`    resume: ${c.resume}`);
    }
    info("");
  }
}

// ---- 命令 ----

export async function cmdComments(cfg: HubConfig, argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      status: { type: "string", default: "open" }, lang: { type: "string" }, json: { type: "boolean" },
      body: { type: "string" }, "body-file": { type: "string" }, as: { type: "string" }, help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) return info(COMMENTS_HELP);
  const [sub, arg, ...extra] = positionals;
  const usage = (u: string) => new CliError(`用法：${u}`, 2);

  if (sub === "list") {
    if (extra.length) throw usage("rh comments list [<slug>] [--status open|resolved|all] [--lang zh|en] [--json]");
    if (!["open", "resolved", "all"].includes(values.status)) throw new CliError("--status 必须是 open | resolved | all", 2);
    if (values.lang !== undefined && !["zh", "en"].includes(values.lang)) throw new CliError("--lang 必须是 zh | en", 2);
    const q = new URLSearchParams({ status: values.status });
    if (arg) q.set("slug", arg);
    if (values.lang) q.set("lang", values.lang);
    const local = localView(cfg);
    const threads: ThreadView[] = [];
    for (const t of await listAll(cfg, q)) {
      // 列表只带最近 20 条评论；more 时用线程接口取全
      threads.push(view(cfg, local, t, t.more ? (await getThread(cfg, t.id)).comments : t.comments));
    }
    if (values.json) return info(JSON.stringify({ schema: COMMENTS_SCHEMA, threads }, null, 2));
    if (!threads.length) return info("没有评论线程");
    return print(threads, false);
  }

  if (!arg || extra.length) throw usage(`rh comments ${sub ?? "list|show|reply|resolve|reopen"} <threadId>`);
  if (sub === "show") {
    const { thread, comments } = await getThread(cfg, arg);
    const t = view(cfg, localView(cfg), thread, comments);
    return values.json ? info(JSON.stringify({ schema: COMMENTS_SCHEMA, threads: [t] }, null, 2)) : print([t], true);
  }
  if (sub === "reply") {
    if ((values.body === undefined) === (values["body-file"] === undefined)) throw new CliError("reply 需要 --body 或 --body-file 其中一个", 2);
    const file = values["body-file"];
    const body = values.body ?? readFileSync(file === "-" ? 0 : file!, "utf8");
    const session = detectSession(process.env);
    const req = { body, as: values.as ?? "agent", ...(session ? { agent_runtime: session.runtime, agent_session: session.id } : {}) };
    const { comment } = await api<{ comment: Row }>(cfg, "POST", `/api/comments/threads/${encodeURIComponent(arg)}/comments`, req);
    return ok(`已回复 ${arg}（评论 ${comment.id}）${session ? `，会话：${resumeCommand(session)}` : ""}`);
  }
  if (sub === "resolve" || sub === "reopen") {
    const { thread } = await api<{ thread: Row }>(cfg, "POST", `/api/comments/threads/${encodeURIComponent(arg)}/status`, { status: sub === "resolve" ? "resolved" : "open" });
    return ok(`${arg}：${thread.status}`);
  }
  throw usage("rh comments list|show|reply|resolve|reopen …");
}

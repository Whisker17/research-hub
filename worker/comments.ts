/**
 * 评论 API（ADR 0005 §3、§4、§8、§9）：私有 Worker 在交给 ASSETS 之前处理 `/api/comments*`。
 * 身份已由 gate 校验；这里只做 CSRF 规则、字段校验、D1 读写与分页。只追加，不能编辑、删除。
 */
import type { Identity } from "./gate.ts";

/** D1 里本模块用到的那部分接口（测试用 node:sqlite 实现同一形状） */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface D1Database {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown[]>;
}
export interface CommentsEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  COMMENTS: D1Database;
}

type Row = Record<string, unknown>;

const PAGE = 100;
const RECENT = 20;
const LANGS = ["zh", "en"];
const RUNTIMES = ["pi", "claude-code"];
const REV = /^[0-9a-f]{12}$/;
// 会话 id 会出现在可复制的恢复命令里（pi --session <id>），只放行不需要 shell 转义的字符
const SESSION = /^[A-Za-z0-9._:-]{1,100}$/;

class HttpError extends Error {
  status: 400 | 403 | 404 | 503;
  constructor(status: 400 | 403 | 404 | 503, message: string) {
    super(message);
    this.status = status;
  }
}
const fail = (status: 400 | 403 | 404 | 503, message: string): never => {
  throw new HttpError(status, message);
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

export function isCommentsPath(pathname: string): boolean {
  return pathname === "/api/comments" || pathname.startsWith("/api/comments/");
}

export async function handleComments(request: Request, env: CommentsEnv, identity: Identity): Promise<Response> {
  try {
    return await route(request, env, identity);
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    throw e;
  }
}

async function route(request: Request, env: CommentsEnv, identity: Identity): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").slice(3); // ["", "api", "comments", ...]
  const db = env.COMMENTS;
  const method = request.method;

  if (method === "GET" && parts.length === 0) return json(200, await listThreads(url, env));
  if (method === "GET" && parts.length === 2 && parts[0] === "threads") {
    return json(200, await getThread(db, parts[1], url.searchParams.get("cursor")));
  }
  if (method === "POST" && parts.length === 1 && parts[0] === "threads") {
    const body = await readBody(request, url, identity, ["slug", "lang", "quote", "prefix", "suffix", "heading", "rev", "body", ...AGENT_FIELDS]);
    return json(201, { thread: await createThread(env, url.href, body, identity) });
  }
  if (method === "POST" && parts.length === 3 && parts[0] === "threads" && parts[2] === "comments") {
    const body = await readBody(request, url, identity, ["body", ...AGENT_FIELDS]);
    return json(201, { comment: await addComment(db, parts[1], body, identity) });
  }
  if (method === "POST" && parts.length === 3 && parts[0] === "threads" && parts[2] === "status") {
    const body = await readBody(request, url, identity, ["status"]);
    return json(200, { thread: await setStatus(db, parts[1], body, identity) });
  }
  return fail(404, "not found");
}

// ---- 写请求：CSRF 与 JSON ----

const AGENT_FIELDS = ["as", "agent_runtime", "agent_session"];

async function readBody(request: Request, url: URL, identity: Identity, allowed: string[]): Promise<Row> {
  const origin = request.headers.get("origin");
  if (origin !== null ? origin !== url.origin : identity.kind !== "agent") fail(403, "cross-origin or missing Origin");
  const type = request.headers.get("content-type") ?? "";
  if (type.split(";")[0].trim().toLowerCase() !== "application/json") fail(400, "content-type must be application/json");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    fail(400, "invalid JSON");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) fail(400, "body must be a JSON object");
  const row = body as Row;
  for (const k of Object.keys(row)) if (!allowed.includes(k)) fail(400, `unknown field: ${k}`);
  return row;
}

// ---- 校验 ----

const len = (s: string) => [...s].length;

function text(row: Row, key: string, max: number, o: { required?: boolean; nonEmpty?: boolean } = {}): string | null {
  const v = row[key];
  if (v === undefined || v === null) return o.required ? fail(400, `${key} is required`) : null;
  if (typeof v !== "string") return fail(400, `${key} must be a string`);
  if (o.nonEmpty && !v.trim()) fail(400, `${key} must not be empty`);
  if (len(v) > max) fail(400, `${key} is longer than ${max} characters`);
  return v;
}

function author(row: Row, identity: Identity) {
  if (identity.kind === "human") {
    for (const k of AGENT_FIELDS) if (row[k] !== undefined) fail(400, `${k} is only for agents`);
    return { author: identity.email, author_kind: "human", author_name: identity.email.split("@")[0], agent_runtime: null, agent_session: null };
  }
  const as = text(row, "as", 40, { nonEmpty: true })?.trim() ?? "agent";
  const runtime = row.agent_runtime ?? null;
  if (runtime !== null && !RUNTIMES.includes(runtime as string)) fail(400, "agent_runtime must be pi or claude-code");
  const session = row.agent_session ?? null;
  if (session !== null && (typeof session !== "string" || !SESSION.test(session))) {
    fail(400, "agent_session must be 1-100 characters of A-Z a-z 0-9 . _ : -");
  }
  return { author: identity.clientId, author_kind: "agent", author_name: as, agent_runtime: runtime, agent_session: session };
}

function commentBody(row: Row): string {
  return text(row, "body", 4000, { required: true, nonEmpty: true })!.trim();
}

// ---- 报告清单（ADR §4），按 isolate 缓存 ----

const manifests = new WeakMap<object, Promise<Set<string>>>();

async function loadManifest(env: CommentsEnv, base: string): Promise<Set<string>> {
  const res = await env.ASSETS.fetch(new Request(new URL("/_rh/reports.json", base)));
  if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
  const list = (await res.json()) as unknown;
  if (!Array.isArray(list)) throw new Error("manifest is not an array");
  const keys = new Set<string>();
  for (const r of list as Row[]) {
    keys.add(`${r.slug}`);
    keys.add(`${r.slug}\n${r.lang}`);
  }
  return keys;
}

async function inManifest(env: CommentsEnv, base: string, slug: string, lang: string | null): Promise<boolean> {
  let p = manifests.get(env.ASSETS);
  if (!p) {
    p = loadManifest(env, base);
    manifests.set(env.ASSETS, p);
  }
  let keys: Set<string>;
  try {
    keys = await p;
  } catch {
    manifests.delete(env.ASSETS); // 失败不缓存，下一次请求重试
    return fail(503, "report manifest unavailable");
  }
  return keys.has(lang === null ? slug : `${slug}\n${lang}`);
}

// ---- 游标：不透明的 base64url(JSON [created_at, id]) ----

const encodeCursor = (r: Row) =>
  btoa(JSON.stringify([r.created_at, r.id])).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function decodeCursor(cursor: string | null): [string, string] | null {
  if (cursor === null) return null;
  try {
    const v = JSON.parse(atob(cursor.replace(/-/g, "+").replace(/_/g, "/")));
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && typeof v[1] === "string") return [v[0], v[1]];
  } catch {
    // 落到下面的 400
  }
  return fail(400, "invalid cursor");
}

/** 取 PAGE + 1 行判断是否还有下一页 */
function page(rows: Row[]) {
  const more = rows.length > PAGE;
  const items = more ? rows.slice(0, PAGE) : rows;
  return { items, next: more ? encodeCursor(items[items.length - 1]) : null };
}

// ---- 读 ----

async function listThreads(url: URL, env: CommentsEnv) {
  const q = url.searchParams;
  const slug = q.get("slug");
  const lang = q.get("lang");
  const status = q.get("status") ?? "all";
  if (lang !== null && !LANGS.includes(lang)) fail(400, "lang must be zh or en");
  if (!["open", "resolved", "all"].includes(status)) fail(400, "status must be open, resolved or all");
  const cursor = decodeCursor(q.get("cursor"));
  if (slug !== null && !(await inManifest(env, url.href, slug, lang))) fail(404, "unknown report");

  const where: string[] = [];
  const args: unknown[] = [];
  if (slug !== null) where.push("slug = ?"), args.push(slug);
  if (lang !== null) where.push("lang = ?"), args.push(lang);
  if (status !== "all") where.push("status = ?"), args.push(status);
  if (cursor) where.push("(created_at, id) > (?, ?)"), args.push(...cursor);
  const sql = `SELECT * FROM threads ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at, id LIMIT ${PAGE + 1}`;
  const { items, next } = page((await env.COMMENTS.prepare(sql).bind(...args).all()).results);

  // 每个线程最近 RECENT 条评论；多取一条判断 more
  const byThread = new Map<string, Row[]>(items.map((t) => [t.id as string, []]));
  const more = new Set<string>();
  if (items.length) {
    const { results } = await env.COMMENTS.prepare(
      `SELECT * FROM (SELECT c.*, ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY created_at DESC, id DESC) AS rn
         FROM comments c WHERE thread_id IN (SELECT value FROM json_each(?)))
       WHERE rn <= ${RECENT + 1} ORDER BY created_at, id`,
    ).bind(JSON.stringify([...byThread.keys()])).all();
    for (const { rn, ...c } of results) {
      if (rn === RECENT + 1) more.add(c.thread_id as string);
      else byThread.get(c.thread_id as string)!.push(c);
    }
  }
  const threads = items.map((t) => ({ ...t, comments: byThread.get(t.id as string), more: more.has(t.id as string) }));
  return { threads, next };
}

async function findThread(db: D1Database, id: string): Promise<Row> {
  return (await db.prepare("SELECT * FROM threads WHERE id = ?").bind(id).first()) ?? fail(404, "unknown thread");
}

async function getThread(db: D1Database, id: string, cursorParam: string | null) {
  const cursor = decodeCursor(cursorParam);
  const thread = await findThread(db, id);
  const { results } = await db
    .prepare(`SELECT * FROM comments WHERE thread_id = ? ${cursor ? "AND (created_at, id) > (?, ?)" : ""} ORDER BY created_at, id LIMIT ${PAGE + 1}`)
    .bind(id, ...(cursor ?? []))
    .all();
  const { items, next } = page(results);
  return { thread, comments: items, next };
}

// ---- 写 ----

const INSERT_COMMENT =
  "INSERT INTO comments (id, thread_id, body, author, author_kind, author_name, agent_runtime, agent_session, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";

function newComment(threadId: string, row: Row, identity: Identity, now: string) {
  return { id: crypto.randomUUID(), thread_id: threadId, body: commentBody(row), ...author(row, identity), created_at: now };
}
const commentArgs = (c: ReturnType<typeof newComment>) =>
  [c.id, c.thread_id, c.body, c.author, c.author_kind, c.author_name, c.agent_runtime, c.agent_session, c.created_at];

async function createThread(env: CommentsEnv, base: string, row: Row, identity: Identity) {
  const slug = text(row, "slug", 200, { required: true })!;
  const lang = text(row, "lang", 2, { required: true })!;
  if (!LANGS.includes(lang)) fail(400, "lang must be zh or en");
  const quote = text(row, "quote", 1000, { required: true, nonEmpty: true })!;
  const prefix = text(row, "prefix", 64, { required: true })!;
  const suffix = text(row, "suffix", 64, { required: true })!;
  const heading = text(row, "heading", 200);
  const rev = text(row, "rev", 12, { required: true })!;
  if (!REV.test(rev)) fail(400, "rev must be 12 lowercase hex characters");
  const now = new Date().toISOString();
  const thread = {
    id: crypto.randomUUID(), slug, lang, quote, prefix, suffix, heading, rev, status: "open",
    created_at: now, created_by: identity.kind === "human" ? identity.email : identity.clientId, created_by_kind: identity.kind,
    status_changed_at: null, status_changed_by: null, status_changed_by_kind: null,
  };
  const comment = newComment(thread.id, row, identity, now);
  if (!(await inManifest(env, base, slug, lang))) fail(404, "unknown report");
  const cols = Object.keys(thread);
  await env.COMMENTS.batch([
    env.COMMENTS.prepare(`INSERT INTO threads (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).bind(...Object.values(thread)),
    env.COMMENTS.prepare(INSERT_COMMENT).bind(...commentArgs(comment)),
  ]);
  return { ...thread, comments: [comment], more: false };
}

async function addComment(db: D1Database, threadId: string, row: Row, identity: Identity) {
  const comment = newComment(threadId, row, identity, new Date().toISOString());
  await findThread(db, threadId);
  await db.prepare(INSERT_COMMENT).bind(...commentArgs(comment)).run();
  return comment;
}

async function setStatus(db: D1Database, id: string, row: Row, identity: Identity) {
  const status = row.status;
  if (status !== "open" && status !== "resolved") return fail(400, "status must be open or resolved");
  const thread = await findThread(db, id);
  if (thread.status === status) return thread;
  const by = identity.kind === "human" ? identity.email : identity.clientId;
  await db
    .prepare("UPDATE threads SET status = ?, status_changed_at = ?, status_changed_by = ?, status_changed_by_kind = ? WHERE id = ?")
    .bind(status, new Date().toISOString(), by, identity.kind, id)
    .run();
  return findThread(db, id);
}

/**
 * rh comments（ADR 0005 §5、§9、§10，WHI-2158）：CLI 对着真实的评论 API（worker/private.ts + node:sqlite 的 D1）跑，
 * 前面一层假的 Access：只认 CF-Access-Client-Id / Secret，换成 service token 的 JWT。
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, test } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { stringify } from "yaml";
import { findSourceLine } from "../cli/commands/comments.ts";
import type { D1Database, D1Statement } from "../worker/comments.ts";
import worker from "../worker/private.ts";

const REPO = join(import.meta.dirname, "..");
const TEAM = "rh-cli-test.cloudflareaccess.com";
const AUD = "aud-cli";
const CLIENT_ID = "57632a2eac680f783dd5979108fd155a.access";
const SECRET = "s3cr3t-0f-the-service-token-do-not-print";
const PI_ID = "01a16c70-dd55-72d9-90a6-266dd7cd6c8e";
const MANIFEST = readFileSync(join(REPO, "test/fixtures/comments/_rh/reports.json"), "utf8");
const MIGRATION = readFileSync(join(REPO, "worker/migrations/0001_comments.sql"), "utf8");

// Access 的 JWKS（worker 在本进程里用 fetch 取）
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
  String(input) === `https://${TEAM}/cdn-cgi/access/certs` ? Response.json({ keys: [jwk] }) : realFetch(input, init)) as typeof fetch;
const AGENT_JWT = await new SignJWT({ common_name: CLIENT_ID, sub: "" })
  .setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(`https://${TEAM}`).setAudience(AUD).setIssuedAt().setExpirationTime("1h").sign(privateKey);

function d1(db: DatabaseSync): D1Database {
  const stmt = (sql: string, args: unknown[] = []): D1Statement => ({
    bind: (...v) => stmt(sql, v),
    first: async <T,>() => (db.prepare(sql).get(...(args as never[])) ?? null) as T | null,
    all: async <T,>() => ({ results: db.prepare(sql).all(...(args as never[])).map((r) => ({ ...r })) as T[] }),
    run: async () => db.prepare(sql).run(...(args as never[])),
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (list) => Promise.all(list.map((s) => s.run())),
  };
}

const db = new DatabaseSync(":memory:");
db.exec(MIGRATION);
const env = {
  ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ALLOWED_EMAILS: "owner@example.com", AGENT_CLIENT_IDS: CLIENT_ID, COMMENTS: d1(db),
  ASSETS: {
    fetch: async (r: Request) =>
      new URL(r.url).pathname === "/_rh/reports.json" ? new Response(MANIFEST, { headers: { "content-type": "application/json" } }) : new Response("asset", { status: 404 }),
  },
};

let server: Server;
let base: string;
let root: string;
const seen: string[] = []; // 假 Access 收到的请求行，用来确认分页真的发生了

const EN = `# Alpha

Intro line.

The fee is **two percent**
of volume.

- repeated phrase here
- another repeated phrase here, with context

Final words.
`;
const EN_HTML = "<html><body><div class=am-doc-body>Alpha</div></body></html>";
const REV = createHash("sha256").update(EN_HTML).digest("hex").slice(0, 12);

const T = (n: number) => `2026-10-24T00:${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}.000Z`;
function thread(id: string, o: { slug?: string; lang?: string; quote: string; prefix?: string; suffix?: string; rev?: string; status?: string; at?: number }) {
  db.prepare(`INSERT INTO threads (id, slug, lang, quote, prefix, suffix, heading, rev, status, created_at, created_by, created_by_kind)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'owner@example.com', 'human')`)
    .run(id, o.slug ?? "alpha-report", o.lang ?? "en", o.quote, o.prefix ?? "", o.suffix ?? "", "Findings", o.rev ?? REV, o.status ?? "open", T(o.at ?? 0));
}
function comment(id: string, threadId: string, at: number, o: { body?: string; agent?: boolean; session?: string } = {}) {
  db.prepare(`INSERT INTO comments (id, thread_id, body, author, author_kind, author_name, agent_runtime, agent_session, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, threadId, o.body ?? `comment ${id}`, o.agent ? CLIENT_ID : "owner@example.com", o.agent ? "agent" : "human", o.agent ? "pi-researcher" : "owner",
      o.session ? "pi" : null, o.session ?? null, T(at));
}

before(async () => {
  root = mkdtempSync(join(tmpdir(), "rh-comments-cli-"));
  writeFileSync(join(root, "rh.config.json"), JSON.stringify({ publicUrl: "https://pub.example", privateUrl: "https://unused.example", vaultDir: "/vault", briefsDir: "B", amScript: "/am.mjs" }));
  writeFileSync(join(root, "tags.yml"), "tags: {}\n");
  const dir = join(root, "reports", "2026", "10", "alpha-report");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "meta.yml"), stringify({
    title: "Alpha", summary: "s", created: "2026-10-05", updated: "2026-10-05", changelog: [{ date: "2026-10-05", note: "创建" }],
    domain: "other", tags: [], status: "published", visibility: "private", kind: "native", brief_source: "B/a.md",
  }));
  writeFileSync(join(dir, "explainer.en.md"), EN);
  writeFileSync(join(dir, "index.en.html"), EN_HTML);
  writeFileSync(join(dir, "explainer.md"), "# 阿尔法\n\n费率是成交量的百分之二。\n");

  thread("t-unique", { quote: "The fee is two percent of volume.", at: 1 });
  thread("t-ambiguous", { quote: "repeated phrase here", at: 2 });
  thread("t-prefixed", { quote: "repeated phrase here", prefix: "another ", suffix: ", with context", at: 3 });
  thread("t-missing", { quote: "This sentence was rewritten.", rev: "0123456789ab", at: 4 });
  thread("t-zh", { lang: "zh", quote: "费率是成交量的百分之二。", at: 5 });
  thread("t-resolved", { quote: "Final words.", status: "resolved", at: 6 });
  comment("c-h", "t-prefixed", 10, { body: "Which one?\nSecond line." });
  comment("c-a", "t-prefixed", 11, { agent: true, session: PI_ID, body: "The second one." });
  for (const id of ["t-unique", "t-ambiguous", "t-missing", "t-zh", "t-resolved"]) comment(`c-${id}`, id, 12);
  // 130 条评论：列表只带最近 20 条（more），线程接口每页 100 条
  for (let i = 0; i < 130; i++) comment(`c-many-${String(i).padStart(3, "0")}`, "t-unique", 100 + i);
  // 105 个线程：列表每页 100 个
  for (let i = 0; i < 105; i++) thread(`t-zh-only-${String(i).padStart(3, "0")}`, { slug: "zh-only", lang: "zh", quote: `q${i}`, rev: "aaaaaaaaaaaa", at: 20 + i });

  server = createServer(async (req, res) => {
    seen.push(`${req.method} ${req.url}`);
    if (req.headers["cf-access-client-id"] !== CLIENT_ID || req.headers["cf-access-client-secret"] !== SECRET) {
      res.writeHead(403, { "content-type": "text/html" }).end("<html>Forbidden</html>");
      return;
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c);
    const headers = new Headers({ "cf-access-jwt-assertion": AGENT_JWT });
    for (const h of ["content-type", "origin"]) if (req.headers[h]) headers.set(h, String(req.headers[h]));
    const r = await worker.fetch(new Request(base + req.url, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined }), env as never);
    res.writeHead(r.status, { "content-type": r.headers.get("content-type") ?? "text/plain" }).end(await r.text());
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server?.close();
  if (root) rmSync(root, { recursive: true, force: true });
});

const outputs: string[] = [];
function rh(args: string[], o: { env?: Record<string, string>; input?: string; creds?: boolean } = {}): Promise<{ code: number | null; out: string }> {
  const e: NodeJS.ProcessEnv = { ...process.env, RH_ROOT: root, RH_PRIVATE_URL: base, NO_COLOR: "1" };
  for (const k of ["PI_SESSION_ID", "CLAUDE_CODE_SESSION_ID", "RH_ACCESS_CLIENT_ID", "RH_ACCESS_CLIENT_SECRET"]) delete e[k];
  if (o.creds !== false) Object.assign(e, { RH_ACCESS_CLIENT_ID: CLIENT_ID, RH_ACCESS_CLIENT_SECRET: SECRET });
  return new Promise((done) => {
    const p = spawn(process.execPath, [join(REPO, "cli", "rh.ts"), "comments", ...args], { cwd: root, env: { ...e, ...o.env } });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.stdin.end(o.input ?? "");
    p.on("close", (code) => {
      outputs.push(out);
      done({ code, out });
    });
  });
}
const json = async (args: string[]) => {
  const r = await rh([...args, "--json"]);
  assert.equal(r.code, 0, r.out);
  return JSON.parse(r.out);
};

test("findSourceLine：唯一匹配给行号；多处时用 prefix/suffix 消歧；仍不唯一或找不到给 null", () => {
  assert.equal(findSourceLine(EN, { quote: "The fee is two percent of volume.", prefix: "", suffix: "" }), 5);
  assert.equal(findSourceLine(EN, { quote: "repeated phrase here", prefix: "", suffix: "" }), null);
  assert.equal(findSourceLine(EN, { quote: "repeated phrase here", prefix: "another ", suffix: "" }), 9);
  assert.equal(findSourceLine(EN, { quote: "repeated phrase here", prefix: "", suffix: ", with context" }), 9);
  assert.equal(findSourceLine(EN, { quote: "repeated phrase here", prefix: "something else", suffix: "" }), null);
  assert.equal(findSourceLine(EN, { quote: "not in the file", prefix: "", suffix: "" }), null);
  assert.equal(findSourceLine(EN, { quote: "  ", prefix: "", suffix: "" }), null);
});

test("list --json：rh.comments/v1 快照（url、source、outdated、agent 会话的恢复命令）", async () => {
  const out = await json(["list", "alpha-report", "--lang", "en"]);
  assert.equal(out.schema, "rh.comments/v1");
  assert.deepEqual(out.threads.map((t: { id: string }) => t.id), ["t-unique", "t-ambiguous", "t-prefixed", "t-missing"]);
  assert.deepEqual(out.threads[2], {
    id: "t-prefixed", slug: "alpha-report", lang: "en", status: "open", quote: "repeated phrase here", prefix: "another ", suffix: ", with context",
    heading: "Findings", rev: REV, outdated: false, source: { file: "reports/2026/10/alpha-report/explainer.en.md", line: 9 },
    url: `${base}/p/alpha-report/en/#c-t-prefixed`, created_at: T(3),
    comments: [
      { id: "c-h", author: "owner@example.com", author_kind: "human", author_name: "owner", agent_runtime: null, agent_session: null, resume: null, created_at: T(10), body: "Which one?\nSecond line." },
      { id: "c-a", author: CLIENT_ID, author_kind: "agent", author_name: "pi-researcher", agent_runtime: "pi", agent_session: PI_ID, resume: `pi --session ${PI_ID}`, created_at: T(11), body: "The second one." },
    ],
  });
  const by = Object.fromEntries(out.threads.map((t: { id: string }) => [t.id, t]));
  assert.deepEqual(by["t-unique"].source, { file: "reports/2026/10/alpha-report/explainer.en.md", line: 5 });
  assert.equal(by["t-ambiguous"].source, null);
  assert.equal(by["t-missing"].source, null);
  assert.equal(by["t-missing"].outdated, true);
  // 列表只带最近 20 条（more）→ 用线程接口取全，并跟着游标翻页
  assert.equal(by["t-unique"].comments.length, 131);
  assert.equal(by["t-unique"].comments.at(-1).id, "c-many-129");
});

test("list：默认 open、两种语言；zh 线程用 explainer.md，本地没有 index.html 时 outdated 为 null；--status all 含已解决", async () => {
  const open = await json(["list", "alpha-report"]);
  const ids = open.threads.map((t: { id: string }) => t.id);
  assert.ok(ids.includes("t-zh") && !ids.includes("t-resolved"));
  const zh = open.threads.find((t: { id: string }) => t.id === "t-zh");
  assert.deepEqual([zh.source, zh.outdated, zh.url], [{ file: "reports/2026/10/alpha-report/explainer.md", line: 3 }, null, `${base}/p/alpha-report/#c-t-zh`]);
  assert.ok((await json(["list", "alpha-report", "--status", "all"])).threads.some((t: { id: string }) => t.id === "t-resolved"));
  assert.deepEqual((await json(["list", "--status", "resolved"])).threads.map((t: { id: string }) => t.id), ["t-resolved"]);
});

test("list：跟着 next 翻页取全（105 个线程 > 每页 100）；本地没有的报告 source / outdated 为 null", async () => {
  seen.length = 0;
  const out = await json(["list", "zh-only"]);
  assert.equal(out.threads.length, 105);
  assert.equal(new Set(out.threads.map((t: { id: string }) => t.id)).size, 105);
  assert.equal(seen.filter((l) => l.startsWith("GET /api/comments?")).length, 2);
  assert.deepEqual([out.threads[0].source, out.threads[0].outdated], [null, null]);

  const text = await rh(["list", "zh-only"]);
  assert.equal(text.code, 0, text.out);
  assert.match(text.out, /^t-zh-only-104 {2}zh-only\/zh {2}open$/m);
});

test("show：线程接口翻页取全；文本输出带全部正文与恢复命令", async () => {
  seen.length = 0;
  const out = await json(["show", "t-unique"]);
  assert.equal(out.threads.length, 1);
  assert.equal(out.threads[0].comments.length, 131);
  assert.equal(seen.filter((l) => l.startsWith("GET /api/comments/threads/t-unique")).length, 2);

  const text = await rh(["show", "t-prefixed"]);
  assert.equal(text.code, 0, text.out);
  assert.match(text.out, /reports\/2026\/10\/alpha-report\/explainer\.en\.md:9/);
  assert.match(text.out, /Which one\?\n {4}Second line\./);
  assert.match(text.out, /pi-researcher \[agent\]/);
  assert.match(text.out, new RegExp(`resume: pi --session ${PI_ID}`));

  const missing = await rh(["show", "no-such-thread"]);
  assert.notEqual(missing.code, 0);
  assert.match(missing.out, /HTTP 404：unknown thread/);
});

test("reply：以 agent 身份回复并附上当前会话；--body-file - 读 stdin；--as 缺省 agent", async () => {
  const r = await rh(["reply", "t-ambiguous", "--body", "Answered in the ledger.", "--as", "claude"], { env: { PI_SESSION_ID: PI_ID } });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, new RegExp(`pi --session ${PI_ID}`));
  const row = db.prepare("SELECT * FROM comments WHERE thread_id = 't-ambiguous' ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown>;
  assert.deepEqual([row.body, row.author_kind, row.author_name, row.agent_runtime, row.agent_session], ["Answered in the ledger.", "agent", "claude", "pi", PI_ID]);

  const s = await rh(["reply", "t-ambiguous", "--body-file", "-"], { input: "prepared, not published: F2\n" });
  assert.equal(s.code, 0, s.out);
  const row2 = db.prepare("SELECT * FROM comments WHERE thread_id = 't-ambiguous' ORDER BY created_at DESC, rowid DESC LIMIT 1").get() as Record<string, unknown>;
  assert.deepEqual([row2.body, row2.author_name, row2.agent_session], ["prepared, not published: F2", "agent", null]);

  const both = await rh(["reply", "t-ambiguous", "--body", "x", "--body-file", "-"]);
  assert.equal(both.code, 2);
  const none = await rh(["reply", "t-ambiguous"]);
  assert.equal(none.code, 2);
});

test("resolve / reopen", async () => {
  const r = await rh(["resolve", "t-missing"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /t-missing：resolved/);
  const row = db.prepare("SELECT status, status_changed_by_kind FROM threads WHERE id = 't-missing'").get() as Record<string, unknown>;
  assert.deepEqual({ ...row }, { status: "resolved", status_changed_by_kind: "agent" });
  const o = await rh(["reopen", "t-missing"]);
  assert.equal(o.code, 0, o.out);
  assert.equal((db.prepare("SELECT status FROM threads WHERE id = 't-missing'").get() as Record<string, unknown>).status, "open");
});

test("错误：缺少凭据（点名两个环境变量）、token 不被接受（403）、网络不通、参数不合法", async () => {
  const missing = await rh(["list"], { creds: false });
  assert.equal(missing.code, 2);
  assert.match(missing.out, /RH_ACCESS_CLIENT_ID/);
  assert.match(missing.out, /RH_ACCESS_CLIENT_SECRET/);

  const denied = await rh(["list"], { env: { RH_ACCESS_CLIENT_SECRET: `${SECRET}-wrong` } });
  assert.equal(denied.code, 1);
  assert.match(denied.out, /service token not allowed（HTTP 403）/);

  const down = await rh(["list"], { env: { RH_PRIVATE_URL: "http://127.0.0.1:1" } });
  assert.equal(down.code, 1);
  assert.match(down.out, /连不上评论 API/);

  assert.equal((await rh(["list", "--status", "closed"])).code, 2);
  assert.equal((await rh(["list", "--lang", "fr"])).code, 2);
  assert.equal((await rh(["show"])).code, 2);
  assert.equal((await rh(["frobnicate", "x"])).code, 2);
  const help = await rh(["--help"], { creds: false });
  assert.match(help.out, /rh comments list/);
});

test("secret 从不出现在输出里", () => {
  assert.ok(outputs.length >= 10);
  for (const out of outputs) assert.ok(!out.includes(SECRET), out);
});

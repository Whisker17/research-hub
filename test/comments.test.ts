// 评论 API（ADR 0005 §8、§9）：整个私有 Worker（Access JWT → 身份 → 路由 → D1），D1 用 node:sqlite 模拟。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import worker from "../worker/private.ts";
import type { D1Database, D1Statement } from "../worker/comments.ts";

const TEAM = "rh-comments-test.cloudflareaccess.com";
const AUD = "aud-comments";
const ORIGIN = "https://rh-private.example.workers.dev";
const AGENT_ID = "0123abcd.access";
const MANIFEST = readFileSync(new URL("./fixtures/comments/_rh/reports.json", import.meta.url), "utf8");
const MIGRATION = readFileSync(new URL("../worker/migrations/0001_comments.sql", import.meta.url), "utf8");

// Access 的 JWKS：worker 用 jose 的 createRemoteJWKSet 去取 https://<team>/cdn-cgi/access/certs
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input) === `https://${TEAM}/cdn-cgi/access/certs`) return Response.json({ keys: [jwk] });
  return realFetch(input, init);
}) as typeof fetch;

/** D1 的最小 node:sqlite 实现（prepare / bind / first / all / run / batch） */
function d1(db: DatabaseSync): D1Database {
  const stmt = (sql: string, args: unknown[] = []): D1Statement & { exec(): void } => ({
    bind: (...v) => stmt(sql, v),
    first: async <T,>() => (db.prepare(sql).get(...(args as never[])) ?? null) as T | null,
    all: async <T,>() => ({ results: db.prepare(sql).all(...(args as never[])).map((r) => ({ ...r })) as T[] }),
    run: async () => db.prepare(sql).run(...(args as never[])),
    exec: () => void db.prepare(sql).run(...(args as never[])),
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (list) => {
      db.exec("BEGIN");
      try {
        for (const s of list) (s as ReturnType<typeof stmt>).exec();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return [];
    },
  };
}

function makeEnv(o: { manifest?: string | null; agents?: string } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(MIGRATION);
  const assets = { manifest: o.manifest === undefined ? MANIFEST : o.manifest };
  return {
    db,
    assets,
    env: {
      ACCESS_TEAM_DOMAIN: TEAM,
      ACCESS_AUD: AUD,
      ALLOWED_EMAILS: "owner@example.com,@team.example",
      AGENT_CLIENT_IDS: o.agents ?? `other.access, ${AGENT_ID}`,
      COMMENTS: d1(db),
      ASSETS: {
        fetch: async (r: Request) =>
          new URL(r.url).pathname === "/_rh/reports.json" && assets.manifest !== null
            ? new Response(assets.manifest, { headers: { "content-type": "application/json" } })
            : new Response("asset", { status: new URL(r.url).pathname === "/p/" ? 200 : 404 }),
      },
    },
  };
}

const sign = (claims: Record<string, unknown>) =>
  new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(`https://${TEAM}`).setAudience(AUD).setIssuedAt().setExpirationTime("5m").sign(privateKey);
const HUMAN = await sign({ email: "owner@example.com", sub: "u1" });
const AGENT = await sign({ common_name: AGENT_ID, sub: "" });

type Env = ReturnType<typeof makeEnv>["env"];
async function call(env: Env, method: string, path: string, o: { jwt?: string; body?: unknown; origin?: string | null; type?: string } = {}) {
  const headers = new Headers({ "cf-access-jwt-assertion": o.jwt ?? HUMAN });
  const jwt = o.jwt ?? HUMAN;
  const origin = o.origin === undefined ? (jwt === HUMAN ? ORIGIN : null) : o.origin;
  if (origin) headers.set("origin", origin);
  if (o.body !== undefined) headers.set("content-type", o.type ?? "application/json");
  const res = await worker.fetch(
    new Request(ORIGIN + path, { method, headers, body: o.body === undefined ? undefined : typeof o.body === "string" ? o.body : JSON.stringify(o.body) }),
    env,
  );
  const text = await res.text();
  const isJson = res.headers.get("content-type")?.startsWith("application/json");
  return { status: res.status, headers: res.headers, body: isJson ? JSON.parse(text) : text };
}

const NEW = { slug: "alpha-report", lang: "en", quote: "a quoted sentence", prefix: "before ", suffix: " after", heading: "Findings", rev: "0123456789ab", body: "  Is this right?  " };

test("human creates a thread, an agent replies, the human resolves it, the list shows it all", async () => {
  const { env } = makeEnv();
  const created = await call(env, "POST", "/api/comments/threads", { body: NEW });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("cache-control"), "private, no-store");
  assert.equal(created.headers.get("x-content-type-options"), "nosniff");
  assert.equal(created.headers.get("access-control-allow-origin"), null);
  const t = created.body.thread;
  assert.match(t.id, /^[0-9a-f-]{36}$/);
  assert.equal(t.status, "open");
  assert.equal(t.created_by, "owner@example.com");
  assert.equal(t.created_by_kind, "human");
  assert.equal(t.status_changed_at, null);
  assert.equal(t.comments.length, 1);
  assert.deepEqual(
    { body: t.comments[0].body, author: t.comments[0].author, kind: t.comments[0].author_kind, name: t.comments[0].author_name },
    { body: "Is this right?", author: "owner@example.com", kind: "human", name: "owner" },
  );
  assert.ok(!Number.isNaN(Date.parse(t.created_at)));

  const reply = await call(env, "POST", `/api/comments/threads/${t.id}/comments`, {
    jwt: AGENT,
    body: { body: "Checked; the source says so.", as: "pi-researcher", agent_runtime: "pi", agent_session: "01a16c70-dd55-72d9-90a6-266dd7cd6c8e" },
  });
  assert.equal(reply.status, 201);
  assert.equal(reply.body.comment.author, AGENT_ID);
  assert.equal(reply.body.comment.author_kind, "agent");
  assert.equal(reply.body.comment.author_name, "pi-researcher");
  assert.equal(reply.body.comment.agent_runtime, "pi");

  const defaultName = await call(env, "POST", `/api/comments/threads/${t.id}/comments`, { jwt: AGENT, body: { body: "ok" } });
  assert.equal(defaultName.body.comment.author_name, "agent");

  const resolved = await call(env, "POST", `/api/comments/threads/${t.id}/status`, { body: { status: "resolved" } });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.thread.status, "resolved");
  assert.equal(resolved.body.thread.status_changed_by, "owner@example.com");
  assert.equal(resolved.body.thread.status_changed_by_kind, "human");
  // 状态没变：不改 status_changed_*
  const again = await call(env, "POST", `/api/comments/threads/${t.id}/status`, { jwt: AGENT, body: { status: "resolved" } });
  assert.deepEqual(again.body.thread, resolved.body.thread);

  const list = await call(env, "GET", "/api/comments?slug=alpha-report&lang=en&status=resolved");
  assert.equal(list.status, 200);
  assert.equal(list.body.next, null);
  assert.equal(list.body.threads.length, 1);
  assert.deepEqual(list.body.threads[0].comments.map((c: { body: string }) => c.body), ["Is this right?", "Checked; the source says so.", "ok"]);
  assert.equal(list.body.threads[0].more, false);
  assert.equal((await call(env, "GET", "/api/comments?slug=alpha-report&status=open")).body.threads.length, 0);
  assert.equal((await call(env, "GET", "/api/comments", { jwt: AGENT })).body.threads.length, 1);

  const one = await call(env, "GET", `/api/comments/threads/${t.id}`);
  assert.equal(one.body.thread.id, t.id);
  assert.equal(one.body.comments.length, 3);
  assert.equal(one.body.next, null);
});

test("client cannot choose ids, timestamps or kinds", async () => {
  const { env } = makeEnv();
  for (const extra of [{ id: "x" }, { created_at: "2000-01-01T00:00:00.000Z" }, { author_kind: "agent" }, { created_by_kind: "agent" }]) {
    const r = await call(env, "POST", "/api/comments/threads", { body: { ...NEW, ...extra } });
    assert.equal(r.status, 400, JSON.stringify(extra));
  }
});

test("pagination: 100 threads per page with the 20 newest comments, thread endpoint 100 per page, cursors to null", async () => {
  const { env, db } = makeEnv();
  // 直接写库，时间可控
  const ins = db.prepare("INSERT INTO threads VALUES (?, 'alpha-report', ?, 'q', '', '', NULL, '0123456789ab', 'open', ?, 'owner@example.com', 'human', NULL, NULL, NULL)");
  for (let i = 0; i < 205; i++) ins.run(`t${String(i).padStart(3, "0")}`, i % 2 ? "zh" : "en", `2026-10-24T00:00:00.${String(i % 7).padStart(3, "0")}Z`);
  const c = db.prepare("INSERT INTO comments VALUES (?, 't000', ?, 'owner@example.com', 'human', 'owner', NULL, NULL, ?)");
  for (let i = 0; i < 250; i++) c.run(`c${String(i).padStart(3, "0")}`, `#${i}`, `2026-10-24T01:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`);

  const seen: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const r = await call(env, "GET", `/api/comments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
    assert.equal(r.status, 200);
    assert.ok(r.body.threads.length <= 100);
    seen.push(...r.body.threads.map((t: { id: string }) => t.id));
    if (pages === 0) {
      const t0 = r.body.threads.find((t: { id: string }) => t.id === "t000");
      assert.equal(t0.more, true);
      assert.deepEqual(t0.comments.map((x: { body: string }) => x.body), Array.from({ length: 20 }, (_, i) => `#${230 + i}`));
      assert.equal(r.body.threads.find((t: { id: string }) => t.id === "t001").more, false);
    }
    cursor = r.body.next;
    pages++;
  } while (cursor);
  assert.equal(pages, 3);
  assert.equal(seen.length, 205);
  assert.equal(new Set(seen).size, 205);

  const filtered = await call(env, "GET", "/api/comments?lang=zh");
  assert.equal(filtered.body.threads.length, 100);
  assert.ok(filtered.body.threads.every((t: { lang: string }) => t.lang === "zh"));
  assert.equal((await call(env, "GET", `/api/comments?lang=zh&cursor=${filtered.body.next}`)).body.threads.length, 2);

  const bodies: string[] = [];
  cursor = null;
  do {
    const r = await call(env, "GET", `/api/comments/threads/t000${cursor ? `?cursor=${cursor}` : ""}`);
    assert.ok(r.body.comments.length <= 100);
    bodies.push(...r.body.comments.map((x: { body: string }) => x.body));
    cursor = r.body.next;
  } while (cursor);
  assert.deepEqual(bodies, Array.from({ length: 250 }, (_, i) => `#${i}`));

  assert.equal((await call(env, "GET", "/api/comments?cursor=not-a-cursor")).status, 400);
});

test("validation errors are 400 with an {error} body", async () => {
  const { env } = makeEnv();
  const cases: [string, Record<string, unknown>][] = [
    ["over-long quote", { quote: "字".repeat(1001) }],
    ["over-long prefix", { prefix: "x".repeat(65) }],
    ["over-long suffix", { suffix: "x".repeat(65) }],
    ["over-long heading", { heading: "x".repeat(201) }],
    ["over-long body", { body: "x".repeat(4001) }],
    ["blank body", { body: "   " }],
    ["empty quote", { quote: "" }],
    ["missing rev", { rev: undefined }],
    ["bad rev", { rev: "0123456789AB" }],
    ["bad lang", { lang: "fr" }],
    ["non-string body", { body: 42 }],
    ["human with as", { as: "me" }],
    ["human with agent_runtime", { agent_runtime: "pi" }],
    ["human with agent_session", { agent_session: "abc" }],
  ];
  for (const [name, patch] of cases) {
    const r = await call(env, "POST", "/api/comments/threads", { body: { ...NEW, ...patch } });
    assert.equal(r.status, 400, name);
    assert.equal(typeof r.body.error, "string", name);
  }
  // 码点计数：1000 个汉字（3000 字节）可以
  assert.equal((await call(env, "POST", "/api/comments/threads", { body: { ...NEW, quote: "字".repeat(1000), body: "😀".repeat(4000) } })).status, 201);

  const agentCases: Record<string, unknown>[] = [
    { as: "x".repeat(41) },
    { as: "" },
    { agent_runtime: "codex" },
    { agent_session: "x".repeat(101) },
    { agent_session: "id; rm -rf ~" },
  ];
  for (const patch of agentCases) {
    const r = await call(env, "POST", "/api/comments/threads", { jwt: AGENT, body: { ...NEW, ...patch } });
    assert.equal(r.status, 400, JSON.stringify(patch));
  }
  assert.equal((await call(env, "POST", "/api/comments/threads", { body: "{not json" })).status, 400);
  assert.equal((await call(env, "POST", "/api/comments/threads", { body: [] })).status, 400);
  assert.equal((await call(env, "POST", "/api/comments/threads", { body: NEW, type: "text/plain" })).status, 400);
  assert.equal((await call(env, "GET", "/api/comments?status=closed")).status, 400);
  assert.equal((await call(env, "GET", "/api/comments?lang=de")).status, 400);
  assert.equal((await call(env, "POST", "/api/comments/threads/nope/status", { body: { status: "closed" } })).status, 400);
});

test("unknown report, thread or path is 404", async () => {
  const { env } = makeEnv();
  assert.equal((await call(env, "POST", "/api/comments/threads", { body: { ...NEW, slug: "missing" } })).status, 404);
  assert.equal((await call(env, "POST", "/api/comments/threads", { body: { ...NEW, slug: "zh-only", lang: "en" } })).status, 404);
  assert.equal((await call(env, "GET", "/api/comments?slug=missing")).status, 404);
  assert.equal((await call(env, "GET", "/api/comments?slug=zh-only&lang=en")).status, 404);
  assert.equal((await call(env, "GET", "/api/comments?slug=zh-only")).status, 200);
  assert.equal((await call(env, "GET", "/api/comments/threads/missing")).status, 404);
  assert.equal((await call(env, "POST", "/api/comments/threads/missing/comments", { body: { body: "hi" } })).status, 404);
  assert.equal((await call(env, "POST", "/api/comments/threads/missing/status", { body: { status: "open" } })).status, 404);
  const unknown = await call(env, "GET", "/api/comments/other");
  assert.equal(unknown.status, 404);
  assert.equal(typeof unknown.body.error, "string");
  assert.equal((await call(env, "DELETE", "/api/comments/threads/x")).status, 404);
});

test("missing manifest fails closed with 503 and is retried later", async () => {
  const { env, assets } = makeEnv({ manifest: null });
  assert.equal((await call(env, "POST", "/api/comments/threads", { body: NEW })).status, 503);
  assert.equal((await call(env, "GET", "/api/comments?slug=alpha-report")).status, 503);
  assert.equal((await call(env, "GET", "/api/comments")).status, 200, "cross-report list does not need the manifest");
  assets.manifest = MANIFEST;
  assert.equal((await call(env, "POST", "/api/comments/threads", { body: NEW })).status, 201);
});

test("CSRF: foreign Origin is 403 for everyone; missing Origin is 403 for humans, allowed for agents", async () => {
  const { env } = makeEnv();
  assert.equal((await call(env, "POST", "/api/comments/threads", { body: NEW, origin: "https://evil.example" })).status, 403);
  assert.equal((await call(env, "POST", "/api/comments/threads", { jwt: AGENT, body: NEW, origin: "https://evil.example" })).status, 403);
  assert.equal((await call(env, "POST", "/api/comments/threads", { body: NEW, origin: "null" })).status, 403);
  assert.equal((await call(env, "POST", "/api/comments/threads", { body: NEW, origin: null })).status, 403);
  assert.equal((await call(env, "POST", "/api/comments/threads", { jwt: AGENT, body: NEW, origin: null })).status, 201);
  assert.equal((await call(env, "POST", "/api/comments/threads", { jwt: AGENT, body: NEW, origin: ORIGIN })).status, 201);
});

test("identity: unknown agents, emails and tokens are 403; empty AGENT_CLIENT_IDS admits no agent", async () => {
  const { env } = makeEnv();
  const cases: [string, string][] = [
    ["agent not allow-listed", await sign({ common_name: "stranger.access" })],
    ["email not allow-listed", await sign({ email: "eve@evil.example" })],
    ["email + allow-listed common_name is still a human", await sign({ email: "eve@evil.example", common_name: AGENT_ID })],
    ["neither email nor common_name", await sign({ sub: "x" })],
    ["no token", ""],
  ];
  for (const [name, jwt] of cases) {
    const r = await call(env, "GET", "/api/comments", { jwt });
    assert.equal(r.status, 403, name);
    assert.equal(typeof r.body.error, "string", name);
    assert.equal(r.headers.get("cache-control"), "private, no-store");
  }
  const { env: noAgents } = makeEnv({ agents: "" });
  assert.equal((await call(noAgents, "GET", "/api/comments", { jwt: AGENT })).status, 403);
  // 静态资源对两种身份都开放
  assert.equal((await call(env, "GET", "/p/", { jwt: AGENT })).status, 200);
  assert.equal((await call(env, "GET", "/p/")).status, 200);
});

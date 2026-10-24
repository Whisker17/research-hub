/**
 * 评论层的浏览器验收（ADR 0005 §5–§7，WHI-2157）：无头 Chrome × 390 / 1280 px，对着一个按 ADR 0005 §9 实现的假 API
 * （路径、请求与响应体、next 游标、more、错误体、content-type 与 Origin 校验；每页只放 2 个线程、每个线程只带最近 2 条评论，
 * 好让翻页与 more 真的发生）。
 *
 *  - 打开抽屉 / 底部面板：没有横向溢出，报告不重新排版；Esc 关闭；
 *  - 选中正文 → “评论” → 发送 → 高亮；回复；解决 / 显示已解决 / 重新打开；失效线程只在面板里、不高亮；
 *  - 写入失败保留文字并显示错误；API 不可用（Access 重定向）→ 整个评论层隐藏；#c-<id> 直接定位；
 *  - 同样的流程也在一篇真实报告（仓库里第一篇已发布报告，.am-doc-body 正文根）上跑一遍。
 *
 * 设置 RH_CMT_SHOTS=<目录> 时保存截图。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { Browser, Page } from "puppeteer-core";
import { decorateReport, reportRev } from "../cli/lib/build.ts";
import { findChrome, launchBrowser } from "../cli/lib/mobile.ts";
import { REPORT_FILES, isPublished, loadReports } from "../lib/reports.ts";

const REPO = join(import.meta.dirname, "..");
const SHOTS = process.env.RH_CMT_SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const noChrome = findChrome() ? false : "没有 Chrome";

// ── 页面 ──────────────────────────────────────────────────────────────────────

const amSrc = readFileSync(join(REPO, "test", "fixtures", "report-shell", "am.html"));
const real = loadReports(REPO).reports.filter(isPublished)[0];
const realSrc = real ? readFileSync(join(real.dir, REPORT_FILES.html)) : null;
const PAGES: Record<string, { html: string; rev: string; lang: "zh" | "en" }> = {
  fixture: { html: decorateReport(amSrc.toString("utf8"), { backHref: "/p/", backLabel: "Research Hub", lang: "zh", comments: { slug: "fixture", rev: reportRev(amSrc) } }), rev: reportRev(amSrc), lang: "zh" },
  ...(real && realSrc ? { [real.slug]: { html: decorateReport(realSrc.toString("utf8"), { backHref: "/p/", backLabel: "Research Hub", lang: "zh", comments: { slug: real.slug, rev: reportRev(realSrc) } }), rev: reportRev(realSrc), lang: "zh" as const } } : {}),
};

// ── 假 API（ADR 0005 §9）───────────────────────────────────────────────────────

interface C {
  id: string;
  thread_id: string;
  body: string;
  author: string;
  author_kind: "human" | "agent";
  author_name: string;
  agent_runtime: string | null;
  agent_session: string | null;
  created_at: string;
}
interface Th {
  id: string;
  slug: string;
  lang: string;
  quote: string;
  prefix: string;
  suffix: string;
  heading: string | null;
  rev: string;
  status: "open" | "resolved";
  created_at: string;
  created_by: string;
  created_by_kind: string;
  status_changed_at: string | null;
  status_changed_by: string | null;
  status_changed_by_kind: string | null;
}
const PAGE = 2;
const RECENT = 2;
let threads: Th[] = [];
let comments: C[] = [];
let failWrites = false;
const writes: { path: string; body: Record<string, unknown> }[] = [];
let clock = Date.parse("2026-10-20T00:00:00Z");
const now = () => new Date((clock += 1000)).toISOString();
const human = { author: "owner@mantle.xyz", author_kind: "human" as const, author_name: "owner", agent_runtime: null, agent_session: null };

function seed() {
  threads = [];
  comments = [];
  writes.length = 0;
  failWrites = false;
  const th = (slug: string, quote: string, o: Partial<Th> = {}) => {
    const t: Th = { id: randomUUID(), slug, lang: "zh", quote, prefix: "", suffix: "", heading: null, rev: "0123456789ab", status: "open", created_at: now(), created_by: human.author, created_by_kind: "human", status_changed_at: null, status_changed_by: null, status_changed_by_kind: null, ...o };
    threads.push(t);
    return t;
  };
  const cm = (t: Th, body: string, o: Partial<C> = {}) => comments.push({ id: randomUUID(), thread_id: t.id, body, ...human, created_at: now(), ...o });
  for (const slug of Object.keys(PAGES)) {
    const a = th(slug, "带锚点的面板");
    cm(a, "最早的一条：<b>不是 HTML</b>");
    cm(a, "第二条");
    cm(a, "agent 的回复", { author: "abc123.access", author_kind: "agent", author_name: "claude", agent_runtime: "claude-code", agent_session: "sess-42" });
    cm(th(slug, "这段话已经从报告里删掉了"), "失效的线程");
    cm(th(slug, "阅读路径", { status: "resolved" }), "已解决的线程");
    cm(th(slug, "阅读路径", { lang: "en" }), "英文页的线程，不在中文页显示");
  }
}

const json = (res: ServerResponse, status: number, body: unknown) =>
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" }).end(JSON.stringify(body));
const readBody = (req: IncomingMessage) => new Promise<string>((ok) => {
  let s = "";
  req.on("data", (d) => (s += d));
  req.on("end", () => ok(s));
});
const withComments = (t: Th) => {
  const all = comments.filter((c) => c.thread_id === t.id);
  return { ...t, comments: all.slice(-RECENT), more: all.length > RECENT };
};
const cps = (s: unknown) => (typeof s === "string" ? Array.from(s).length : -1);

async function api(req: IncomingMessage, res: ServerResponse, origin: string) {
  const url = new URL(req.url!, origin);
  const parts = url.pathname.replace(/^\/api\/comments\/?/, "").split("/").filter(Boolean);
  if (req.method === "GET") {
    const cursor = Number(url.searchParams.get("cursor") ?? 0);
    if (parts.length === 0) {
      const slug = url.searchParams.get("slug");
      const lang = url.searchParams.get("lang");
      const status = url.searchParams.get("status") ?? "all";
      if (slug && !PAGES[slug]) return json(res, 404, { error: "unknown report" });
      const list = threads.filter((t) => (!slug || t.slug === slug) && (!lang || t.lang === lang) && (status === "all" || t.status === status)).sort((a, b) => (a.created_at + a.id < b.created_at + b.id ? -1 : 1));
      return json(res, 200, { threads: list.slice(cursor, cursor + PAGE).map(withComments), next: cursor + PAGE < list.length ? String(cursor + PAGE) : null });
    }
    if (parts[0] === "threads" && parts.length === 2) {
      const t = threads.find((x) => x.id === parts[1]);
      if (!t) return json(res, 404, { error: "unknown thread" });
      const all = comments.filter((c) => c.thread_id === t.id);
      return json(res, 200, { thread: t, comments: all.slice(cursor, cursor + PAGE), next: cursor + PAGE < all.length ? String(cursor + PAGE) : null });
    }
    return json(res, 404, { error: "not found" });
  }
  if (req.method !== "POST") return json(res, 404, { error: "not found" });
  if (!/^application\/json\b/.test(req.headers["content-type"] ?? "")) return json(res, 400, { error: "content-type must be application/json" });
  if (req.headers.origin !== origin) return json(res, 403, { error: "bad origin" });
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: "bad json" });
  }
  writes.push({ path: url.pathname, body: b });
  if (failWrites) return json(res, 503, { error: "D1 unavailable" });
  // 和 worker/comments.ts 一样：未知字段 400；人带 agent 字段 400
  const allowed = parts.length === 1 ? ["slug", "lang", "quote", "prefix", "suffix", "heading", "rev", "body"] : parts[2] === "status" ? ["status"] : ["body"];
  for (const k of Object.keys(b)) if (!allowed.includes(k)) return json(res, 400, { error: `unknown field: ${k}` });
  const body = typeof b.body === "string" ? b.body.trim() : "";
  if (parts[0] === "threads" && parts.length === 1) {
    if (!PAGES[b.slug as string] || !["zh", "en"].includes(b.lang as string)) return json(res, 404, { error: "unknown report" });
    if (!(cps(b.quote) >= 1 && cps(b.quote) <= 1000 && cps(b.prefix) <= 64 && cps(b.suffix) <= 64 && typeof b.prefix === "string" && typeof b.suffix === "string")) return json(res, 400, { error: "bad selector" });
    if (b.heading !== undefined && !(cps(b.heading) >= 0 && cps(b.heading) <= 200)) return json(res, 400, { error: "bad heading" });
    if (!/^[0-9a-f]{12}$/.test(String(b.rev)) || !body || cps(body) > 4000) return json(res, 400, { error: "bad rev or body" });
    const t: Th = { id: randomUUID(), slug: b.slug as string, lang: b.lang as string, quote: b.quote as string, prefix: b.prefix as string, suffix: b.suffix as string, heading: (b.heading as string) ?? null, rev: b.rev as string, status: "open", created_at: now(), created_by: human.author, created_by_kind: "human", status_changed_at: null, status_changed_by: null, status_changed_by_kind: null };
    threads.push(t);
    comments.push({ id: randomUUID(), thread_id: t.id, body, ...human, created_at: now() });
    return json(res, 201, { thread: withComments(t) });
  }
  const t = parts[0] === "threads" ? threads.find((x) => x.id === parts[1]) : undefined;
  if (!t) return json(res, 404, { error: "unknown thread" });
  if (parts[2] === "comments" && parts.length === 3) {
    if (!body || cps(body) > 4000) return json(res, 400, { error: "bad body" });
    const c: C = { id: randomUUID(), thread_id: t.id, body, ...human, created_at: now() };
    comments.push(c);
    return json(res, 201, { comment: c });
  }
  if (parts[2] === "status" && parts.length === 3) {
    if (b.status !== "open" && b.status !== "resolved") return json(res, 400, { error: "bad status" });
    if (t.status !== b.status) Object.assign(t, { status: b.status, status_changed_at: now(), status_changed_by: human.author, status_changed_by_kind: "human" });
    return json(res, 200, { thread: t });
  }
  return json(res, 404, { error: "not found" });
}

/** apiDown：/api/ 像 Access 会话过期那样重定向到另一个源的登录页（fetch 因 CORS 失败）。 */
function serve(apiDown = false): Promise<{ server: Server; origin: string }> {
  let origin = "";
  const server = createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    if (p.startsWith("/api/comments")) {
      if (apiDown) return res.writeHead(302, { location: "http://localhost:9/cdn-cgi/access/login" }).end();
      return api(req, res, origin);
    }
    const m = /^\/p\/([^/]+)\/(.*)$/.exec(p);
    if (m && PAGES[m[1]] && m[2] === "") return res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(PAGES[m[1]].html);
    const file = m?.[1] === "fixture" ? join(REPO, "test", "fixtures", "report-shell", m[2]) : m && real && m[1] === real.slug ? join(real.dir, m[2]) : p.startsWith("/fonts/") ? join(REPO, "public", p) : "";
    if (file && existsSync(file)) return res.writeHead(200, { "content-type": file.endsWith(".svg") ? "image/svg+xml" : file.endsWith(".woff2") ? "font/woff2" : "application/octet-stream" }).end(readFileSync(file));
    res.writeHead(404).end("not found");
  });
  return new Promise((ok) =>
    server.listen(0, "127.0.0.1", () => {
      origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      ok({ server, origin });
    }),
  );
}

// ── 浏览器帮手 ────────────────────────────────────────────────────────────────

let site: { server: Server; origin: string };
let down: { server: Server; origin: string };
let browser: Browser;
before(async () => {
  if (noChrome) return;
  site = await serve();
  down = await serve(true);
  browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
  site?.server.close();
  down?.server.close();
});

async function open(url: string, width: number): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewport({ width, height: 844 });
  await page.goto(url, { waitUntil: "networkidle0" });
  return { page, errors };
}

/** 有没有看得见的匹配元素（评论按钮有两份：桌面在工具栏，窄屏在返回链接一行） */
const shown = (p: Page, sel: string) => p.$$eval(sel, (es) => es.some((e) => !(e as HTMLElement).hidden && e.getBoundingClientRect().width > 0));
const waitShown = (p: Page, sel: string) =>
  p.waitForFunction((s: string) => [...document.querySelectorAll<HTMLElement>(s)].some((e) => !e.hidden && e.getBoundingClientRect().width > 0), { timeout: 5000 }, sel);
/** 用鼠标点看得见的那一个 */
async function click(p: Page, sel: string) {
  for (const h of await p.$$(sel)) if (await h.evaluate((e) => e.getBoundingClientRect().width > 0)) return h.click();
  throw new Error(`没有看得见的 ${sel}`);
}
const state = (p: Page) =>
  p.evaluate(() => ({
    count: [...new Set([...document.querySelectorAll("[data-rh-comments-n]")].map((n) => n.textContent))].join(),
    highlights: (CSS as unknown as { highlights: Map<string, Set<Range>> }).highlights.get("rh-comment")?.size ?? 0,
    cards: [...document.querySelectorAll<HTMLElement>("[data-rh-cmt-thread]")].map((c) => ({
      quote: c.querySelector("[data-rh-cmt-quote]")!.textContent,
      status: c.dataset.status,
      outdated: c.hasAttribute("data-rh-outdated"),
      comments: [...c.querySelectorAll("[data-rh-cmt-body]")].map((b) => b.textContent),
    })),
    scroll: document.documentElement.scrollWidth,
    inner: innerWidth,
  }));
/** 选中正文根里第 nth 个 needle（真实地改选区，触发 selectionchange） */
const select = (p: Page, needle: string, nth = 0) =>
  p.evaluate(
    (n: string, k: number) => {
      const root = document.querySelector(".am-doc-body") ?? document.querySelector("main")!;
      const w = document.createTreeWalker(root, 4);
      let seen = 0;
      for (let t = w.nextNode() as Text | null; t; t = w.nextNode() as Text | null) {
        for (let i = t.data.indexOf(n); i >= 0; i = t.data.indexOf(n, i + 1)) {
          if (seen++ !== k) continue;
          const r = document.createRange();
          r.setStart(t, i);
          r.setEnd(t, i + n.length);
          getSelection()!.removeAllRanges();
          getSelection()!.addRange(r);
          return true;
        }
      }
      return false;
    },
    needle,
    nth,
  );
/** 报告自己的元素的位置：打开抽屉前后必须一样（覆盖在上方，不重新排版） */
const layout = (p: Page) =>
  p.evaluate(() => [...document.querySelectorAll("h1, h2, p, li")].filter((e) => !e.closest("[data-rh-cmt-drawer]")).slice(0, 12).map((e) => JSON.stringify(e.getBoundingClientRect())).join("|"));

// ── 测试 ──────────────────────────────────────────────────────────────────────

for (const width of [390, 1280]) {
  test(`评论层 ${width}px：抽屉 / 底部面板、选中 → 发送 → 高亮、回复、解决、失效线程、更早的评论、写入失败、Esc`, { skip: noChrome }, async () => {
    seed();
    const { page: p, errors } = await open(`${site.origin}/p/fixture/`, width);
    const shot = (name: string) => (SHOTS ? p.screenshot({ path: join(SHOTS, `fixture-${width}-${name}.png`) }) : null);
    await waitShown(p, "[data-rh-comments-btn]");
    let s = await state(p);
    assert.equal(s.count, "2", "数量 = 本语言的未解决线程（含失效的）");
    assert.ok(s.scroll <= width, `抽屉关闭时横向溢出 ${s.scroll}`);
    assert.equal(await shown(p, "[data-rh-cmt-drawer]"), false, "默认收起");
    const before = await layout(p);
    await shot("closed");

    // 打开：桌面右侧抽屉 / 窄屏底部面板；不溢出、不重新排版
    await click(p, "[data-rh-comments-btn]");
    await waitShown(p, "[data-rh-cmt-drawer]");
    const box = await p.$eval("[data-rh-cmt-drawer]", (e) => JSON.parse(JSON.stringify(e.getBoundingClientRect())));
    if (width <= 760) assert.deepEqual([box.left, box.right, Math.round(box.bottom)], [0, width, 844], "底部面板");
    else assert.deepEqual([box.right, box.width, box.top], [width, 380, 0], "右侧抽屉");
    s = await state(p);
    assert.ok(s.scroll <= width, `抽屉打开时横向溢出 ${s.scroll}`);
    assert.equal(await layout(p), before, "打开抽屉后报告没有重新排版");
    assert.deepEqual(
      s.cards.map((c) => [c.quote, c.outdated, c.comments.length]),
      [["带锚点的面板", false, 2], ["这段话已经从报告里删掉了", true, 1]],
      "定位到的在前；失效线程只在面板里；已解决的默认不显示；英文页的线程不显示；跟着 next 取完两页",
    );
    assert.equal(s.highlights, 1, "只高亮定位到的线程");
    assert.ok(await p.$eval("[data-rh-outdated] [data-rh-cmt-tag]", (e) => e.textContent === "已失效"));
    // agent 评论：Agent 标记与恢复命令；正文只用 textContent
    assert.deepEqual(
      await p.$eval("[data-rh-cmt-thread]", (c) => [c.querySelector("[data-rh-cmt-agent]")?.textContent, c.querySelector("[data-rh-cmt-resume] code")?.textContent, c.querySelectorAll("[data-rh-cmt-av]").length]),
      ["Agent", "claude --resume sess-42", 2],
    );
    // 更早的评论：用线程接口跟着 next 取全
    await p.click("[data-rh-cmt-more]");
    await p.waitForFunction(() => document.querySelectorAll("[data-rh-cmt-thread]")[0].querySelectorAll("[data-rh-cmt-body]").length === 3);
    assert.equal(await p.$eval("[data-rh-cmt-body]", (e) => e.innerHTML), "最早的一条：&lt;b&gt;不是 HTML&lt;/b&gt;");
    await shot("open");

    // 选中正文 → 评论 → 发送：第二段里的重复文字，靠 prefix / suffix 定位到选中的那一处
    assert.ok(await select(p, "检查报告外壳不会改动", 1));
    await waitShown(p, "[data-rh-cmt-add]");
    const add = await p.$eval("[data-rh-cmt-add]", (e) => JSON.parse(JSON.stringify(e.getBoundingClientRect())));
    assert.ok(add.left >= 0 && add.right <= width, "评论按钮在视口内");
    await shot("selected");
    await p.click("[data-rh-cmt-add]");
    await waitShown(p, "[data-rh-cmt-composer]");
    assert.equal(await p.$eval("[data-rh-cmt-composer] [data-rh-cmt-quote]", (e) => e.textContent), "检查报告外壳不会改动");
    await p.type("[data-rh-cmt-input]", "这里的说法需要来源");
    await p.click("[data-rh-cmt-composer] [data-rh-cmt-send]");
    await p.waitForFunction(() => document.querySelector<HTMLElement>("[data-rh-cmt-composer]")!.hidden);
    const created = writes.at(-1)!;
    assert.equal(created.path, "/api/comments/threads");
    assert.deepEqual(
      { ...created.body, prefix: undefined, suffix: undefined },
      { slug: "fixture", lang: "zh", rev: PAGES.fixture.rev, quote: "检查报告外壳不会改动", prefix: undefined, suffix: undefined, heading: "总览", body: "这里的说法需要来源" },
    );
    assert.ok(String(created.body.prefix).endsWith("用来在手机与桌面上") && Array.from(String(created.body.prefix)).length === 32);
    s = await state(p);
    assert.equal(s.count, "3");
    assert.equal(s.highlights, 2, "新线程高亮");
    // 高亮的就是选中的那一处（第二段）
    assert.equal(
      await p.evaluate(() => {
        const r = [...(CSS as unknown as { highlights: Map<string, Set<Range>> }).highlights.get("rh-comment")!].find((x) => x.toString() === "检查报告外壳不会改动")!;
        return [...document.querySelectorAll("#overview p")].indexOf(r.startContainer.parentElement as HTMLParagraphElement);
      }),
      1,
    );
    const newCard = `[data-rh-cmt-thread][data-id="${threads.at(-1)!.id}"]`;
    assert.ok(await p.$eval(newCard, (e) => e.hasAttribute("data-active")), "新线程是当前线程");
    await shot("posted");

    // 回复
    await p.type(`${newCard} [data-rh-cmt-reply]`, "补充：见台账 C3");
    await p.click(`${newCard} [data-rh-cmt-send]`);
    await p.waitForFunction((sel: string) => document.querySelector(sel)!.querySelectorAll("[data-rh-cmt-body]").length === 2, {}, newCard);
    assert.deepEqual(writes.at(-1)!.body, { body: "补充：见台账 C3" });
    assert.equal(await p.$eval(`${newCard} [data-rh-cmt-reply]`, (e) => (e as HTMLTextAreaElement).value), "");

    // 写入失败：保留文字、显示错误
    failWrites = true;
    await p.type(`${newCard} [data-rh-cmt-reply]`, "这条会失败");
    await p.click(`${newCard} [data-rh-cmt-send]`);
    await waitShown(p, `${newCard} [data-rh-cmt-err]`);
    assert.equal(await p.$eval(`${newCard} [data-rh-cmt-err]`, (e) => e.textContent), "发送失败：D1 unavailable");
    assert.equal(await p.$eval(`${newCard} [data-rh-cmt-reply]`, (e) => (e as HTMLTextAreaElement).value), "这条会失败");
    await shot("failed");
    failWrites = false;

    // 解决 → 默认隐藏；显示已解决 → 出现并可重新打开
    await p.click(`${newCard} [data-rh-cmt-status]`);
    await p.waitForFunction((sel: string) => !document.querySelector(sel), {}, newCard);
    assert.deepEqual(writes.at(-1)!.body, { status: "resolved" });
    s = await state(p);
    assert.deepEqual([s.count, s.highlights], ["2", 1]);
    await p.click("[data-rh-cmt-resolved]");
    await p.waitForFunction((sel: string) => Boolean(document.querySelector(sel)), {}, newCard);
    assert.equal(await p.$eval(`${newCard} [data-rh-cmt-status]`, (e) => e.textContent), "重新打开");
    assert.equal((await state(p)).cards.filter((c) => c.status === "resolved").length, 2);

    // 上一条 / 下一条
    await p.click("[data-rh-cmt-next]");
    const act1 = await p.$eval("[data-rh-cmt-thread][data-active]", (e) => (e as HTMLElement).dataset.id);
    await p.click("[data-rh-cmt-next]");
    const act2 = await p.$eval("[data-rh-cmt-thread][data-active]", (e) => (e as HTMLElement).dataset.id);
    assert.notEqual(act1, act2);
    await p.click("[data-rh-cmt-prev]");
    assert.equal(await p.$eval("[data-rh-cmt-thread][data-active]", (e) => (e as HTMLElement).dataset.id), act1);

    // Esc 关闭；关闭后仍不溢出
    await p.keyboard.press("Escape");
    assert.equal(await shown(p, "[data-rh-cmt-drawer]"), false);
    assert.ok((await state(p)).scroll <= width);
    assert.deepEqual(errors, []);
    await p.close();
  });
}

test("评论层：#c-<id> 打开页面时直接定位到线程（已解决的也会显示）", { skip: noChrome }, async () => {
  seed();
  const resolved = threads.find((t) => t.slug === "fixture" && t.status === "resolved")!;
  const { page: p, errors } = await open(`${site.origin}/p/fixture/#c-${resolved.id}`, 1280);
  await waitShown(p, "[data-rh-cmt-drawer]");
  assert.equal(await p.$eval("[data-rh-cmt-thread][data-active]", (e) => (e as HTMLElement).dataset.id), resolved.id);
  assert.equal(await p.$eval("[data-rh-cmt-resolved]", (e) => (e as HTMLInputElement).checked), true);
  assert.deepEqual(errors, []);
  await p.close();
});

test("评论层：API 不可用（Access 会话过期被重定向到另一个源）→ 整个评论层隐藏，选中文字也不出现评论按钮", { skip: noChrome }, async () => {
  seed();
  for (const width of [390, 1280]) {
    const { page: p } = await open(`${down.origin}/p/fixture/`, width);
    await p.waitForFunction(() => document.querySelector("[data-rh-cmt-drawer]"));
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(await shown(p, "[data-rh-comments-btn]"), false);
    await select(p, "检查报告外壳");
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(await shown(p, "[data-rh-cmt-add]"), false);
    assert.ok((await state(p)).scroll <= width);
    await p.close();
  }
});

test("评论层：真实报告（.am-doc-body 正文根，am 的工具栏与样式）390 / 1280：打开不溢出、不重新排版；选中 → 发送 → 高亮", { skip: noChrome || (real ? false : "没有已发布报告") }, async () => {
  seed();
  const slug = real!.slug;
  for (const width of [390, 1280]) {
    const { page: p, errors } = await open(`${site.origin}/p/${slug}/`, width);
    await waitShown(p, "[data-rh-comments-btn]");
    const before = await layout(p);
    await click(p, "[data-rh-comments-btn]");
    await waitShown(p, "[data-rh-cmt-drawer]");
    assert.ok((await state(p)).scroll <= width, "抽屉打开时不溢出");
    assert.equal(await layout(p), before, "不重新排版");
    // 选第一段正文里的一小段
    const needle = await p.evaluate(() => {
      const para = [...document.querySelectorAll(".am-doc-body p")].find((e) => (e.textContent ?? "").trim().length > 30)!;
      return para.textContent!.trim().slice(4, 16);
    });
    assert.ok(await select(p, needle));
    await waitShown(p, "[data-rh-cmt-add]");
    await p.click("[data-rh-cmt-add]");
    await p.type("[data-rh-cmt-input]", `真实报告 ${width}`);
    await p.click("[data-rh-cmt-composer] [data-rh-cmt-send]");
    await p.waitForFunction((w: number) => [...document.querySelectorAll("[data-rh-cmt-body]")].some((b) => b.textContent === `真实报告 ${w}`), {}, width);
    const s = await state(p);
    assert.ok(s.highlights >= 1 && s.cards.some((c) => c.quote === writes.at(-1)!.body.quote && !c.outdated), "新线程定位并高亮");
    if (SHOTS) await p.screenshot({ path: join(SHOTS, `real-${width}.png`) });
    assert.deepEqual(errors, []);
    await p.close();
  }
});

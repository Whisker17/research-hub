/**
 * rh ingest（WHI-1931，ADR 0004 §4–§6、§11）。全部离线：源的响应来自 test/fixtures/daily/raw（真实响应裁剪）与
 * WHI-1925 的样本，经 127.0.0.1 上的本地服务器返回；不连真实 API，不需要任何真实凭据。
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { parse as parseYaml, stringify } from "yaml";
import { utc8, planCall, runBlockBeats } from "../cli/lib/sources/blockbeats.ts";
import { sourcesFileSchema, type BlockBeatsConfig, type XDigestConfig } from "../cli/lib/sources/config.ts";
import { runDigest, statusItem } from "../cli/lib/sources/ethtao.ts";
import { collectWindow, type WindowAdapter } from "../cli/lib/sources/feeds.ts";
import type { HttpCtx } from "../cli/lib/sources/http.ts";
import { coveredIn, loadLedger, type Ledger } from "../cli/lib/sources/state.ts";
import { digestDate, parseDigest } from "../cli/lib/sources/x-digest.ts";
import { dailyWindow, manifestSchema, originator, parseItemsJsonl, type Item } from "../lib/daily.ts";

const REPO = join(import.meta.dirname, "..");
const FX = join(REPO, "test", "fixtures", "daily");
const RAW = join(FX, "raw");
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const tmps: string[] = [];
const mkTmp = (p: string) => {
  const d = mkdtempSync(join(tmpdir(), p));
  tmps.push(d);
  return d;
};
after(() => tmps.forEach((d) => rmSync(d, { recursive: true, force: true })));

// ───────────────────────── x-digest 解析：真实日报（含格式变体） ─────────────────────────

test("x-digest：WHI-1925 的三期日报和旧格式逐条解析成 sections → items → refs", () => {
  for (const f of ["2026-10-16", "2026-10-17", "2026-10-18", "legacy-bare-url-2026-07-01"]) {
    const d = readJson(join(FX, "ethtao", `${f}.json`));
    const got = parseDigest(d.input.text);
    assert.ok(got, f);
    assert.equal(got.date, d.expected.digest_date);
    const want = d.expected.sections.map((s: { name: string; items: { text: string; mention: string | null; refs: { handle: string; id: string; url: string }[] }[] }) => ({
      name: s.name,
      items: s.items.map((i) => ({ text: i.text, mention: i.mention, refs: i.refs.map((r) => ({ handle: r.handle, id: r.id, url: r.url })) })),
    }));
    assert.deepEqual(got.sections, want, f);
  }
  // 10-17：不带括号的“其他有趣内容：”、一条两个 [原文]、没有编号的续行（Charles Schwab）自成一条
  const d17 = parseDigest(readJson(join(FX, "ethtao", "2026-10-17.json")).input.text)!;
  assert.deepEqual(d17.sections.map((s) => s.name), ["区块链技术讨论", "行业观点碰撞", "开发者生态", "其他有趣内容"]);
  assert.equal(d17.sections.flatMap((s) => s.items).find((i) => i.text.startsWith("@DavideCrapis透露"))!.refs.length, 2);
  assert.equal(d17.sections[1].items.find((i) => i.text.startsWith("Charles Schwab"))!.mention, null);
});

test("x-digest：真实日报里的变体——【其他】与 🔟、6⃣7⃣ 连写、折行的裸 URL、缺左括号的分区、“其他：”", () => {
  const v = readJson(join(FX, "ethtao", "variants.json")).statuses as { text: string }[];
  const byDate = new Map(v.map((s) => [digestDate(s.text)!, parseDigest(s.text)!]));
  const shape = (date: string) => byDate.get(date)!.sections.map((s) => `${s.name}:${s.items.map((i) => i.refs.length).join("")}`);

  const d0826 = byDate.get("2026-08-26")!;
  assert.deepEqual(shape("2026-08-26"), ["区块链技术讨论:1111111111", "行业观点碰撞:11111111", "开发者生态:11", "其他:11"]);
  assert.match(d0826.sections[0].items[9].text, /^@tcoratger 转发Edge Pod/); // 🔟 是第 10 条，编号已去掉

  const d0915 = byDate.get("2026-09-15")!;
  const multi = d0915.sections.flatMap((s) => s.items).find((i) => i.text.startsWith("@growthepie_eth发布以太坊生态应用数据"))!;
  assert.equal(multi.refs.length, 2); // 6⃣7⃣ 合并的一条，带两个 [原文]
  assert.ok(!/\d\u20E3/u.test(multi.text));

  // 旧格式：两个空格、裸 URL；“缺乏实质性承诺”那条的 URL 被折到下一行，仍然属于它
  assert.deepEqual(shape("2026-07-02"), ["区块链技术讨论:111", "学术合作动态:11", "行业观点碰撞:111", "开发者生态:111", "其他:11"]);
  const wrapped = byDate.get("2026-07-02")!.sections[2].items[1];
  assert.match(wrapped.text, /缺乏实质性承诺$/);
  assert.deepEqual(wrapped.refs.map((r) => r.id), ["2072370967775440976"]);

  assert.deepEqual(shape("2026-09-27"), ["区块链技术讨论:11", "行业观点碰撞:11", "其他:1"]); // `区块链技术讨论】`
  assert.ok(shape("2026-08-16").includes("其他:1")); // 不带括号的“其他：”

  for (const d of byDate.values()) for (const s of d.sections) for (const i of s.items) assert.ok(i.refs.length > 0, `${d.date} ${s.name} ${i.text}`);
});

test("x-digest：只凭第一行识别日报；引用帖、X Article、活动帖都不是日报", () => {
  for (const s of readJson(join(FX, "ethtao", "non-digest-statuses.json")).statuses) assert.equal(parseDigest(s.text), null);
  assert.equal(digestDate("🗓️以太坊日报 2026-10-18\n…"), "2026-10-18");
  assert.equal(digestDate("🗓️ 以太坊日报  2026-07-01\n…"), "2026-07-01");
  assert.equal(digestDate("回顾：🗓️以太坊日报 2026-10-18"), null);
  assert.equal(digestDate("🗓️以太坊日报 2026-10-18 补充"), null);
});

// ───────────────────────── 二跳与条目 ─────────────────────────

const STATUS = readJson(join(RAW, "fxtwitter-status.json")) as Record<string, { status: never }>;
const VIA = "https://x.com/Ethtao_Ethtao/status/2111652016124784867";
const AT = "2026-10-18T04:31:07.000Z";

test("二跳：转推解析到原帖、引用帖的出处追到被引用的原帖、X Article 标 incomplete", () => {
  const repost = statusItem("ethtao", STATUS["2111528856737702274"].status, VIA, "摘要", AT)!;
  assert.equal(repost.id, "ethtao:2111165223780454451");
  assert.equal(repost.author, "ralexstokes");
  assert.equal(repost.reposted_by, "nero_eth");
  assert.equal(repost.origin_url, "https://blog.ethereum.org/2026/10/16/glamsterdam-hoodi-announcement");
  assert.equal(repost.via, VIA);
  assert.equal(repost.published_at, "2026-10-16T18:39:47.000Z");
  assert.ok(repost.excerpt.startsWith("摘要\n\nGlamsterdam charges ahead!"));

  const quote = statusItem("ethtao", STATUS["2111414176597913753"].status, VIA, "", AT)!;
  assert.equal(quote.id, "ethtao:2111414176597913753");
  assert.equal(quote.author, "asanso");
  assert.equal(quote.origin_url, "https://x.com/buchmanster/status/2111260787033727266");
  assert.equal(originator(quote), "x:buchmanster");

  const article = statusItem("ethtao", STATUS["2109979863612535014"].status, VIA, "", AT)!;
  assert.equal(article.incomplete, true);
  assert.match(article.title!, /^ETH Shenzhen 2026/);
  assert.ok(article.excerpt.length <= 400);
});

test("UTC+8 时间显式转换；覆盖区间取与时间窗交集里最长的一段", () => {
  assert.equal(utc8("2026-10-18 07:59:59"), "2026-10-17T23:59:59.000Z");
  assert.equal(utc8("2026-10-18 08:00:00"), "2026-10-18T00:00:00.000Z");
  assert.equal(utc8("2026/10/18"), null);
  const w = dailyWindow("2026-10-18");
  assert.deepEqual(coveredIn([{ from: "2026-10-17T06:00:00.000Z", to: "2026-10-18T04:30:00.000Z" }], w), { from: "2026-10-17T06:00:00.000Z", to: "2026-10-18T00:00:00.000Z" });
  assert.deepEqual(
    coveredIn([{ from: "2026-10-16T12:00:00.000Z", to: "2026-10-17T13:30:00.000Z" }, { from: "2026-10-17T06:00:00.000Z", to: "2026-10-18T04:30:00.000Z" }], w),
    w,
  );
});

test("翻页：够到时间窗起点就停；中途出错保留已拿到的页，覆盖区间到最老的条目为止", async () => {
  const w = dailyWindow("2026-10-18");
  const mk = (t: string, n: number) => ({ id: `odaily:${n}`, published_at: t }) as unknown as Item;
  const pages = [
    { items: [mk("2026-10-18T03:00:00.000Z", 1)], oldest: "2026-10-17T12:00:00.000Z", more: true, bad: 0 },
    { items: [mk("2026-10-17T05:00:00.000Z", 2)], oldest: "2026-10-16T22:00:00.000Z", more: true, bad: 0 },
  ];
  let asked = 0;
  const ok: WindowAdapter = { fetchPage: async (p) => (asked++, pages[p]) };
  const r = await collectWindow(ok, w, AT, []);
  assert.equal(asked, 2);
  assert.deepEqual(r.span, { from: "2026-10-16T22:00:00.000Z", to: AT });
  const broken: WindowAdapter = {
    fetchPage: async (p) => {
      if (p === 1) throw new Error("boom");
      return pages[0];
    },
  };
  const b = await collectWindow(broken, w, AT, []);
  assert.deepEqual(b.span, { from: "2026-10-17T12:00:00.000Z", to: AT });
  assert.match(b.error!, /boom/);
});

test("没有下一页的 feed 只覆盖到它最老的条目，不声称覆盖全部历史（R1-F3）", async () => {
  const mk = (t: string) => ({ id: "theblock:1", published_at: t }) as unknown as Item;
  const one: WindowAdapter = { fetchPage: async () => ({ items: [mk("2026-10-18T03:00:00.000Z")], oldest: "2026-10-18T03:00:00.000Z", more: false, bad: 0 }) };
  const r = await collectWindow(one, dailyWindow("2026-10-10"), AT, []);
  assert.deepEqual(r.span, { from: "2026-10-18T03:00:00.000Z", to: AT });
  assert.equal(r.error, null);
});

// ───────────────────────── 本地夹具服务器 ─────────────────────────

const BB = readJson(join(RAW, "blockbeats-newsflash-important.json"));
const KEY = "bbk-test-7f3a9c1e5d-NOT-A-REAL-KEY";

interface Server {
  base: string;
  requests: { path: string; headers: IncomingMessage["headers"] }[];
  /** 返回 HTTP 状态（或 null 表示正常）的故障注入 */
  fail: (path: string, nth: number) => number | null;
  bb: unknown;
  /** 这个路径的响应延迟多少毫秒（超时注入） */
  delay: (path: string) => number;
}
const srv: Server = { base: "", requests: [], fail: () => null, bb: BB.b, delay: () => 0 };
const httpServer = createServer(async (req, res) => {
  const path = req.url ?? "/";
  const wait = srv.delay(path);
  if (wait) await new Promise((r) => setTimeout(r, wait));
  srv.requests.push({ path, headers: req.headers });
  const nth = srv.requests.filter((r) => r.path === path).length;
  const send = (code: number, body: string, type = "application/json") => {
    res.writeHead(code, { "content-type": type });
    res.end(body);
  };
  const injected = srv.fail(path, nth);
  if (injected) return send(injected, JSON.stringify({ code: injected, results: [], cursor: { top: null, bottom: null } }));
  const u = new URL(path, "http://x");
  if (u.pathname === "/fx/2/profile/Ethtao_Ethtao/statuses") {
    if (u.searchParams.get("cursor")) return send(200, JSON.stringify({ code: 200, results: [], cursor: { top: null, bottom: null } }));
    return send(200, readFileSync(join(RAW, "fxtwitter-timeline.json"), "utf8"));
  }
  const st = /^\/fx\/2\/status\/(\d+)$/.exec(u.pathname);
  if (st) return STATUS[st[1]] ? send(200, JSON.stringify(STATUS[st[1]])) : send(404, JSON.stringify({ code: 404, message: "NOT_FOUND" }));
  if (u.pathname === "/odaily/api/v1/newsflash") {
    const p = u.searchParams.get("page");
    return p === "1" || p === "2" ? send(200, readFileSync(join(RAW, `odaily-newsflash-p${p}.json`), "utf8")) : send(200, JSON.stringify({ code: 200, data: { list: [], hasMore: false } }));
  }
  if (u.pathname === "/ethresearch/latest.json") return send(200, readFileSync(join(RAW, "ethresearch-latest-created.json"), "utf8"));
  if (u.pathname === "/magicians/latest.json") return send(200, readFileSync(join(RAW, "magicians-latest-created.json"), "utf8"));
  if (u.pathname === "/theblock/rss.xml") return send(200, readFileSync(join(RAW, "theblock-rss.xml"), "utf8"), "text/xml");
  // 同一份 RSS 去掉 rel="next"：不能翻页的有界 feed（R1-F3）
  if (u.pathname === "/theblock/bounded.xml") return send(200, readFileSync(join(RAW, "theblock-rss.xml"), "utf8").replace(/<atom:link[^>]*rel="next"[^>]*\/>/, ""), "text/xml");
  if (u.pathname === "/bb/v1/newsflash/important") {
    if (req.headers["api-key"] !== KEY) return send(200, JSON.stringify({ status: 101, message: "invalid key", data: [] }));
    return send(200, JSON.stringify(srv.bb));
  }
  send(404, "{}");
});
before(async () => {
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
  srv.base = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});
after(() => httpServer.close());

function sourcesYml(over: Record<string, unknown> = {}) {
  const b = srv.base;
  return {
    schema: 1,
    user_agent: "research-hub-ingest/test (+https://github.com/Whisker17/research-hub)",
    timeout_ms: 5000,
    retry_backoff_ms: 1,
    sources: {
      ethtao: { type: "x-digest", base_url: `${b}/fx/2`, accounts: ["Ethtao_Ethtao"], max_timeline_pages: 3, max_hops: 40, max_calls_per_run: 200, max_items: 60 },
      blockbeats: {
        type: "blockbeats",
        base_url: `${b}/bb`,
        credential_env: "BLOCKBEATS_API_KEY",
        endpoints: ["newsflash/important"],
        size: 5,
        max_calls_per_run: 1,
        max_calls_per_day: 4,
        hard_cap_per_day: 6,
        min_interval_hours: 6,
        reach_hours: 24,
      },
      odaily: { type: "odaily", base_url: `${b}/odaily`, page_size: 100, important_only: true, max_calls_per_run: 6 },
      ethresearch: { type: "discourse", base_url: `${b}/ethresearch`, max_calls_per_run: 4 },
      magicians: { type: "discourse", base_url: `${b}/magicians`, max_calls_per_run: 4 },
      theblock: { type: "rss", url: `${b}/theblock/rss.xml`, max_calls_per_run: 4 },
      ...over,
    },
  };
}

/** 临时仓库：rh.config.json、tags.yml、一篇公开报告、sources.yml；state 目录里放一个空账本（表示“已初始化”）。 */
function makeRoot(over: Record<string, unknown> = {}, ledger: Ledger | null = { schema: 1, days: {}, last_success_at: null }): { root: string; state: string } {
  const root = mkTmp("rh-ingest-");
  writeFileSync(join(root, "rh.config.json"), readFileSync(join(REPO, "rh.config.json")));
  writeFileSync(join(root, "tags.yml"), stringify({ tags: { ethereum: { label: "Ethereum" } } }));
  const rep = join(root, "reports", "2026", "10", "glamsterdam-overview");
  mkdirSync(rep, { recursive: true });
  writeFileSync(
    join(rep, "meta.yml"),
    stringify({ title: "Glamsterdam", summary: "摘要", created: "2026-10-01", updated: "2026-10-01", changelog: [{ date: "2026-10-01", note: "导入" }], domain: "crypto", tags: ["ethereum"], status: "published", visibility: "public", kind: "imported", source_repo: "https://example.com/r" }),
  );
  writeFileSync(join(root, "sources.yml"), stringify(sourcesYml(over)));
  const state = join(root, ".rh", "ingest");
  mkdirSync(state, { recursive: true });
  if (ledger) writeFileSync(join(state, "ledger.json"), JSON.stringify(ledger));
  return { root, state };
}

interface Run {
  code: number;
  out: string;
  manifest: ReturnType<typeof manifestSchema.parse>;
  items: Map<string, Item>;
  itemsText: string;
  ghOutput: string;
  dir: string;
}

/** 异步运行 rh（服务器在本进程里，不能用 spawnSync 阻塞事件循环）。 */
function rhAsync(root: string, args: string[], env: Record<string, string> = {}): Promise<{ code: number; out: string }> {
  return new Promise((res) => {
    execFile(process.execPath, [join(REPO, "cli", "rh.ts"), ...args], { cwd: root, env: { ...process.env, RH_ROOT: root, NO_COLOR: "1", BLOCKBEATS_API_KEY: KEY, GITHUB_OUTPUT: "", ...env } }, (err, stdout, stderr) =>
      res({ code: err ? ((err as { code?: number }).code ?? 1) : 0, out: `${stdout}${stderr}` }),
    );
  });
}

async function ingest(root: string, date: string, now: string, env: Record<string, string> = {}): Promise<Run> {
  const dir = join(root, ".rh", "daily", date);
  const gh = join(mkTmp("rh-gh-"), "out");
  writeFileSync(gh, "");
  const r = await rhAsync(root, ["ingest", "--date", date, "--now", now, "--run-id", "4242", "--attempt", "1"], { GITHUB_OUTPUT: gh, ...env });
  assert.equal(r.code, 0, r.out);
  const itemsText = readFileSync(join(dir, "items.jsonl"), "utf8");
  return { ...r, dir, manifest: manifestSchema.parse(readJson(join(dir, "manifest.json"))), items: parseItemsJsonl(itemsText), itemsText, ghOutput: readFileSync(gh, "utf8") };
}

const src = (m: Run["manifest"], id: string) => m.sources.find((s) => s.id === id)!;
const bbRequests = () => srv.requests.filter((r) => r.path.startsWith("/bb/")).length;
const reset = (bb: unknown = BB.b, fail: Server["fail"] = () => null) => {
  srv.requests = [];
  srv.bb = bb;
  srv.fail = fail;
  srv.delay = () => 0;
};

// ───────────────────────── 端到端：找到日报 → 导入 ─────────────────────────

test("找到日报 D：二跳、各源按时间窗归日、覆盖拼接；重复运行不追加；rh daily import 接受输出", async () => {
  reset(BB.a);
  const { root } = makeRoot();
  // 前一天 13:31 的运行（处理 10-17）：BlockBeats 覆盖到 10-17 13:31，缓存下来
  await ingest(root, "2026-10-17", "2026-10-17T13:31:00.000Z");
  reset(BB.b);
  const r = await ingest(root, "2026-10-18", AT);
  const m = r.manifest;

  assert.equal(m.status, "pending");
  assert.deepEqual(m.reasons, []);
  assert.equal(m.run.at, AT);
  assert.deepEqual(m.digest, { status: "found", url: VIA, posted_at: "2026-10-18T02:54:07.000Z" });
  // ETHTAO：17 个引用全部二跳成功，按解析后的原帖去重
  const eth = [...r.items.values()].filter((i) => i.source === "ethtao");
  assert.deepEqual(src(m, "ethtao"), { id: "ethtao", status: "ok", items: eth.length, calls: 1 + 17, covered: null, error: null });
  assert.equal(eth.length, 17);
  assert.ok(r.items.has("ethtao:2111165223780454451"), "转推解析到原帖 id");
  for (const it of eth) assert.equal(it.via, VIA);
  // 其他源只收 W(D) 里的条目
  const w = dailyWindow("2026-10-18");
  for (const it of r.items.values()) if (it.source !== "ethtao") assert.ok(it.published_at >= w.from && it.published_at < w.to, it.id);
  for (const id of ["odaily", "ethresearch", "magicians", "theblock"]) assert.equal(src(m, id).status, "ok", id);
  assert.equal(src(m, "odaily").calls, 2); // 第 2 页就够到 W.from
  assert.ok(src(m, "odaily").items > 0);
  assert.ok([...r.items.values()].filter((i) => i.source === "odaily").every((i) => i.origin_url === null || i.origin_url === i.origin_url.trim()));
  assert.equal(src(m, "ethresearch").items, 0);
  assert.equal(src(m, "magicians").items, 3);
  // BlockBeats：两次调用（前一天 13:31 + 今天 04:31）拼起来覆盖整个 W(D)；UTC+8 跨日的边界条目归对了日
  assert.equal(src(m, "blockbeats").status, "ok");
  assert.equal(src(m, "blockbeats").calls, 1);
  assert.ok(r.items.has("blockbeats:330140") && r.items.has("blockbeats:330105"));
  assert.ok(!r.items.has("blockbeats:330150") && !r.items.has("blockbeats:330090"));
  assert.equal(r.items.get("blockbeats:330101")!.origin_url, "https://x.com/matteoikari/status/2111089285218566372"); // 去掉前导空格
  assert.equal(m.counts.items, r.items.size);
  assert.match(r.ghOutput, /^generate=true$/m);
  // 每个请求都带 User-Agent；key 只发给 BlockBeats
  for (const q of srv.requests) assert.match(String(q.headers["user-agent"]), /^research-hub-ingest\//);
  for (const q of srv.requests) assert.equal(q.headers["api-key"] === KEY, q.path.startsWith("/bb/"), q.path);

  // 同一天再跑一次（08:16）：日报来自缓存（0 次调用），BlockBeats 不到 6 小时不调用，输出逐字节相同
  reset();
  const again = await ingest(root, "2026-10-18", "2026-10-18T08:16:00.000Z");
  assert.equal(again.itemsText, r.itemsText);
  assert.equal(src(again.manifest, "ethtao").calls, 0);
  assert.equal(src(again.manifest, "blockbeats").status, "skipped");
  assert.equal(bbRequests(), 0);

  // rh daily import 接受 ingest 的输出（commit job 的下一步）
  const cand = mkTmp("rh-cand-");
  const topic = (title: string, refs: object[]) => ({
    title,
    title_en: `${title} (en)`,
    domain: "crypto",
    tags: ["ethereum"],
    why_now: "测试用的 why_now。",
    questions: ["测试问题？"],
    angle: "测试角度。",
    novelty: { kind: "new", related: [] },
    references: refs,
    confidence: "medium",
  });
  writeFileSync(
    join(cand, "topics.yml"),
    stringify({
      schema: 1,
      date: "2026-10-18",
      topics: [
        topic("Glamsterdam 上 Hoodi", [{ item_id: "ethtao:2111165223780454451", type: "primary", note: "Alex Stokes 本人关于升级时间表的公告" }, { item_id: "ethtao:2111527644223127741" }]),
        topic("Ethereum Magicians 的新提案", [{ item_id: [...r.items.keys()].find((k) => k.startsWith("magicians:"))! }]),
      ],
    }),
  );
  const imp = await rhAsync(root, ["daily", "import", "2026-10-18", "--manifest", join(r.dir, "manifest.json"), "--items", join(r.dir, "items.jsonl"), "--candidate", cand]);
  assert.equal(imp.code, 0, imp.out);
  const day = readJson(join(root, "daily", "2026", "10", "18", "manifest.json"));
  assert.equal(day.status, "degraded");
  assert.deepEqual(day.reasons, ["few_topics"]);
  assert.equal(day.counts.topics, 2);
  const check = await rhAsync(root, ["daily", "check"]);
  assert.equal(check.code, 0, check.out);
});

// ───────────────────────── pending 与故障注入 ─────────────────────────

test("日报还没发布 → pending（digest_not_posted），不调用生成；其他源照常抓，rh daily import 保持 pending", async () => {
  reset();
  const { root } = makeRoot();
  const r = await ingest(root, "2026-10-19", "2026-10-19T04:30:00.000Z");
  assert.equal(r.manifest.status, "pending");
  assert.deepEqual(r.manifest.digest, { status: "not_posted", url: null, posted_at: null });
  assert.deepEqual(r.manifest.reasons, ["digest_not_posted"]);
  assert.equal(src(r.manifest, "ethtao").status, "ok");
  assert.equal(src(r.manifest, "ethtao").calls, 1); // 第 0 页已经翻到 D 00:00（UTC+8）之前
  assert.ok(src(r.manifest, "odaily").items > 0);
  assert.ok(r.items.has("blockbeats:330150")); // UTC+8 10-18 08:00 = W(2026-10-19) 的起点
  assert.match(r.ghOutput, /^generate=false$/m);
  const imp = await rhAsync(root, ["daily", "import", "2026-10-19", "--manifest", join(r.dir, "manifest.json"), "--items", join(r.dir, "items.jsonl")]);
  assert.equal(imp.code, 0, imp.out);
  assert.equal(readJson(join(root, "daily", "2026", "10", "19", "manifest.json")).status, "pending");
  assert.ok(!existsSync(join(root, "daily", "2026", "10", "19", "topics.yml")));
});

test("FxTwitter 故障 → ETHTAO failed、digest_fetch_failed（重试有界）；其他源照常；到了 T_last 才生成", async () => {
  reset(BB.b, (p) => (p.startsWith("/fx/") ? 503 : null));
  const { root } = makeRoot();
  const r = await ingest(root, "2026-10-18", AT);
  assert.deepEqual(r.manifest.digest, { status: "fetch_failed", url: null, posted_at: null });
  assert.deepEqual(r.manifest.reasons, ["digest_fetch_failed"]);
  const eth = src(r.manifest, "ethtao");
  assert.equal(eth.status, "failed");
  assert.equal(eth.calls, 3); // 1 次 + 2 次重试，然后放弃（0.1.0 没有兜底源）
  assert.match(eth.error!, /HTTP 503/);
  for (const id of ["odaily", "magicians", "theblock", "blockbeats"]) assert.notEqual(src(r.manifest, id).status, "failed", id);
  assert.ok(r.items.size > 0);
  assert.match(r.ghOutput, /^generate=false$/m);
  const late = await ingest(root, "2026-10-18", "2026-10-18T13:31:00.000Z");
  assert.match(late.ghOutput, /^generate=true$/m); // t ≥ T_last：只用其他源生成（ADR 0004 §5 → degraded）
});

test("时间线一次性的 404 重试后成功；二跳失败的引用记 partial，下次运行只重试它们", async () => {
  reset(BB.b, (p, nth) => (p === "/fx/2/profile/Ethtao_Ethtao/statuses" && nth === 1 ? 404 : p === "/fx/2/status/2111600681471877409" ? 500 : null));
  const { root } = makeRoot();
  const r = await ingest(root, "2026-10-18", AT);
  assert.equal(r.manifest.digest.status, "found");
  const eth = src(r.manifest, "ethtao");
  assert.equal(eth.status, "partial");
  assert.equal(eth.items, 16);
  assert.match(eth.error!, /1 条引用二跳失败/);
  reset();
  const again = await ingest(root, "2026-10-18", "2026-10-18T08:16:00.000Z");
  assert.deepEqual(srv.requests.filter((q) => q.path.startsWith("/fx/")).map((q) => q.path), ["/fx/2/status/2111600681471877409"]);
  assert.equal(src(again.manifest, "ethtao").status, "ok");
  assert.equal(src(again.manifest, "ethtao").items, 17);
});

test("某个源这次失败（429 / 超时 / 格式变化）：记进 manifest，用上一次的好数据，不覆盖", async () => {
  reset();
  const { root } = makeRoot();
  const first = await ingest(root, "2026-10-18", AT);
  const n = src(first.manifest, "theblock").items;
  assert.ok(n > 0);
  reset(BB.b, (p) => (p.startsWith("/theblock/") ? 429 : null));
  const r = await ingest(root, "2026-10-18", "2026-10-18T08:16:00.000Z");
  assert.equal(src(r.manifest, "theblock").status, "failed");
  assert.match(src(r.manifest, "theblock").error!, /quota: HTTP 429/);
  assert.equal(src(r.manifest, "theblock").calls, 1); // 429 不重试
  assert.equal(src(r.manifest, "theblock").items, n);
  assert.equal(r.itemsText, first.itemsText);
  // 格式变化：HTTP 200 但不是 RSS
  reset(BB.b, (p) => (p.startsWith("/theblock/") ? 200 : null));
  const changed = await ingest(root, "2026-10-18", "2026-10-18T08:20:00.000Z");
  assert.equal(src(changed.manifest, "theblock").status, "failed");
  assert.match(src(changed.manifest, "theblock").error!, /format: 不是 RSS/);
  assert.equal(changed.itemsText, first.itemsText);
  // 超时：重试一次（KEYLESS），两次都超时 → failed，记进 manifest
  const yml = parseYaml(readFileSync(join(root, "sources.yml"), "utf8"));
  writeFileSync(join(root, "sources.yml"), stringify({ ...yml, timeout_ms: 200 }));
  reset();
  srv.delay = (p) => (p.startsWith("/theblock/") ? 600 : 0);
  const slow = await ingest(root, "2026-10-18", "2026-10-18T08:25:00.000Z");
  assert.equal(src(slow.manifest, "theblock").status, "failed");
  assert.match(src(slow.manifest, "theblock").error!, /timeout: 超时（200 ms）/);
  assert.equal(src(slow.manifest, "theblock").calls, 2);
  assert.equal(slow.itemsText, first.itemsText);
});

test("日报的格式变了（找到了日报，却解析不出任何链接）→ ETHTAO partial 并写明原因", async () => {
  const tl = readJson(join(RAW, "fxtwitter-timeline.json"));
  tl.results[0].text = "🗓️以太坊日报 2026-10-18\n\n今天换了个排版，链接都在图片里";
  const ctx: HttpCtx = {
    fetch: async () => new Response(JSON.stringify(tl), { status: 200 }),
    userAgent: "t",
    timeoutMs: 1000,
    backoffMs: 0,
    sleep: async () => {},
    secrets: [],
  };
  const cfg = sourcesFileSchema.parse(sourcesYml()).sources.ethtao as XDigestConfig;
  const r = await runDigest({ id: "ethtao", cfg, ctx, date: "2026-10-18", cached: undefined, now: () => AT });
  assert.equal(r.digest.status, "found");
  assert.equal(r.status, "partial");
  assert.equal(r.items.length, 0);
  assert.match(r.error!, /format: 日报里没有解析出任何 \[原文\] 链接/);
});

test("同一天两条日报分在两页、较新的在前 → 继续翻到 D 00:00（UTC+8）之前，用最早的一条，另一条记下（R1-F4）", async () => {
  const fx = readJson(join(FX, "ethtao", "duplicate-across-pages.json"));
  const paths: string[] = [];
  const ctx: HttpCtx = {
    fetch: async (url) => {
      const u = new URL(String(url));
      paths.push(u.pathname + u.search);
      if (u.pathname.endsWith("/statuses")) return new Response(JSON.stringify(fx.pages[u.searchParams.get("cursor") === "page-1" ? 1 : 0]), { status: 200 });
      const hit = STATUS[u.pathname.split("/").pop()!];
      return hit ? new Response(JSON.stringify(hit), { status: 200 }) : new Response("{}", { status: 404 });
    },
    userAgent: "t",
    timeoutMs: 1000,
    backoffMs: 0,
    sleep: async () => {},
    secrets: [],
  };
  const cfg = sourcesFileSchema.parse(sourcesYml()).sources.ethtao as XDigestConfig;
  const r = await runDigest({ id: "ethtao", cfg, ctx, date: "2026-10-18", cached: undefined, now: () => AT });
  assert.equal(paths.filter((p) => p.includes("/statuses")).length, 2, "第二页也要翻");
  assert.deepEqual(r.digest, { status: "found", url: "https://x.com/Ethtao_Ethtao/status/2111600000000000001", posted_at: "2026-10-17T19:00:00.000Z" });
  assert.equal(r.cached!.id, "2111600000000000001");
  assert.deepEqual(r.items.map((i) => i.id), ["ethtao:2111165223780454451"], "条目来自最早那条日报的引用");
  assert.equal(r.status, "ok");
  assert.match(r.error!, /同一天还有 1 条日报，用最早的一条（忽略 2111700000000000002）/);
});

// ───────────────────────── BlockBeats 预算账本 ─────────────────────────

/** 只开 BlockBeats（其他源关掉，测试更快更聚焦）。srv.base 要在服务器启动后才有，所以是函数。 */
const bbOnly = () => {
  const all = sourcesYml().sources as Record<string, object>;
  return Object.fromEntries(Object.entries(all).map(([id, s]) => [id, id === "blockbeats" ? s : { ...s, enabled: false }]));
};
const ledgerOf = (state: string) => readJson(join(state, "ledger.json")) as Ledger;

test("补跑：不能翻页的 RSS 够不到时间窗 → partial，covered 写实际覆盖的区间（R1-F3）", async () => {
  reset();
  const { root } = makeRoot({ theblock: { type: "rss", url: `${srv.base}/theblock/bounded.xml`, max_calls_per_run: 4 } });
  // 时间窗比 feed 里每一条都早：一条都没覆盖到
  const old = src((await ingest(root, "2026-10-10", AT)).manifest, "theblock");
  assert.deepEqual([old.status, old.items, old.calls, old.covered, old.error], ["partial", 0, 1, null, null]);
  // 时间窗只被覆盖了一部分：covered 从 feed 最老的一条（10-15 13:00Z）开始
  const part = src((await ingest(root, "2026-10-16", AT)).manifest, "theblock");
  assert.equal(part.status, "partial");
  assert.deepEqual(part.covered, { from: "2026-10-15T13:00:00.000Z", to: "2026-10-16T00:00:00.000Z" });
  assert.ok(part.items > 0);
  // 窗口落在 feed 范围内：照常 ok
  const fine = src((await ingest(root, "2026-10-17", AT)).manifest, "theblock");
  assert.deepEqual([fine.status, fine.covered], ["ok", dailyWindow("2026-10-17")]);
});

test("账本跨运行累计：失败、重试、regenerate、补跑都计数；每天上限 4 次；够不到的补跑不花预算", async () => {
  const { root, state } = makeRoot(bbOnly());
  const step = async (date: string, now: string, fail = false) => {
    reset(BB.b, (p) => (fail && p.startsWith("/bb/") ? 500 : null));
    const r = await ingest(root, date, now);
    return { bb: src(r.manifest, "blockbeats"), requests: bbRequests() };
  };
  let s = await step("2026-10-18", "2026-10-18T04:31:00.000Z", true); // 定时运行，BlockBeats 500
  assert.deepEqual([s.bb.status, s.bb.calls, s.requests], ["failed", 1, 1]);
  s = await step("2026-10-18", "2026-10-18T05:00:00.000Z"); // 手动重跑：上次没成功，所以再调用一次
  assert.deepEqual([s.bb.status, s.bb.calls, s.requests], ["partial", 1, 1]);
  s = await step("2026-10-18", "2026-10-18T06:00:00.000Z"); // 不到 6 小时：不调用
  assert.deepEqual([s.bb.status, s.bb.calls, s.requests], ["skipped", 0, 0]);
  assert.match(s.bb.error!, /不到 6 小时/);
  s = await step("2026-10-18", "2026-10-18T11:00:00.000Z"); // regenerate 同一天：照样计数
  assert.deepEqual([s.bb.calls, s.requests], [1, 1]);
  s = await step("2026-10-17", "2026-10-18T17:01:00.000Z"); // 补跑 10-17：时间窗结束已超过 24 小时，一次调用够不到，不花预算
  assert.deepEqual([s.bb.status, s.requests], ["skipped", 0]);
  s = await step("2026-10-19", "2026-10-18T17:02:00.000Z"); // 第 4 次
  assert.deepEqual([s.bb.calls, s.requests], [1, 1]);
  s = await step("2026-10-19", "2026-10-18T23:30:00.000Z"); // 今天（UTC）的 4 次用完
  assert.deepEqual([s.bb.status, s.requests], ["skipped", 0]);
  assert.match(s.bb.error!, /预算 4 次已用完/);
  s = await step("2026-10-19", "2026-10-19T04:31:00.000Z"); // 新的一天重新计数
  assert.deepEqual([s.bb.calls, s.requests], [1, 1]);
  const l = ledgerOf(state);
  assert.equal(l.days["2026-10-18"].calls, 4);
  assert.equal(l.days["2026-10-19"].calls, 1);
});

test("账本丢失或损坏 → 当天不调用（失败即关闭），第二天恢复", async () => {
  const { root, state } = makeRoot(bbOnly(), null);
  reset();
  const r = await ingest(root, "2026-10-18", AT);
  assert.equal(bbRequests(), 0);
  assert.equal(src(r.manifest, "blockbeats").status, "skipped");
  assert.match(src(r.manifest, "blockbeats").error!, /ledger_missing/);
  assert.equal(ledgerOf(state).days["2026-10-18"].blocked, "ledger_missing");
  writeFileSync(join(state, "ledger.json"), "{not json");
  await ingest(root, "2026-10-18", "2026-10-18T13:31:00.000Z");
  assert.equal(bbRequests(), 0);
  reset();
  await ingest(root, "2026-10-19", "2026-10-19T04:31:00.000Z");
  assert.equal(bbRequests(), 1);
  assert.deepEqual(loadLedger(state, "2026-10-20").ledger.days["2026-10-19"], { calls: 1 });
});

test("key 无效（body status 101）或 HTTP 401/429 → failed，当天不再调用，不重试", async () => {
  for (const [label, env, fail] of [
    ["status 101", { BLOCKBEATS_API_KEY: "wrong-key" }, () => null],
    ["HTTP 401", {}, (p: string) => (p.startsWith("/bb/") ? 401 : null)],
    ["HTTP 429", {}, (p: string) => (p.startsWith("/bb/") ? 429 : null)],
  ] as const) {
    const { root, state } = makeRoot(bbOnly());
    reset(BB.b, fail);
    const r = await ingest(root, "2026-10-18", AT, env);
    assert.equal(src(r.manifest, "blockbeats").status, "failed", label);
    assert.equal(bbRequests(), 1, label);
    assert.ok(ledgerOf(state).days["2026-10-18"].blocked, label);
    reset(BB.b, fail);
    const again = await ingest(root, "2026-10-18", "2026-10-18T13:31:00.000Z", env);
    assert.equal(bbRequests(), 0, label);
    assert.match(src(again.manifest, "blockbeats").error!, /已停止调用/, label);
  }
});

test("先记账再调用：账本在请求发出之前就已落盘", async () => {
  const cfg = sourcesFileSchema.parse(sourcesYml()).sources.blockbeats as BlockBeatsConfig;
  const ledger: Ledger = { schema: 1, days: {}, last_success_at: null };
  const persisted: number[] = [];
  let callsAtRequest = -1;
  const ctx: HttpCtx = {
    fetch: async () => {
      callsAtRequest = persisted.at(-1) ?? -1;
      throw new Error("connection reset");
    },
    userAgent: "t",
    timeoutMs: 1000,
    backoffMs: 0,
    sleep: async () => {},
    secrets: [KEY],
  };
  const w = dailyWindow("2026-10-18");
  const r = await runBlockBeats({ id: "blockbeats", cfg, ctx, key: KEY, ledger, persist: (l) => persisted.push(l.days["2026-10-18"].calls), at: AT, w, cached: null, now: () => AT });
  assert.equal(callsAtRequest, 1);
  assert.equal(r.calls, 1);
  assert.equal(ledger.last_success_at, null);
  assert.equal(planCall(ledger, cfg, AT, w, w, true), "skipped: 时间窗已被之前的调用覆盖");
});

test("跨 UTC 午夜：请求记到发出请求的那一天，并受那一天的上限约束（R1-F5）", async () => {
  const cfg = sourcesFileSchema.parse(sourcesYml()).sources.blockbeats as BlockBeatsConfig;
  let requests = 0;
  const ctx: HttpCtx = {
    fetch: async () => {
      requests++;
      return new Response(JSON.stringify({ status: 0, data: { data: [] } }));
    },
    userAgent: "t",
    timeoutMs: 1000,
    backoffMs: 0,
    sleep: async () => {},
    secrets: [KEY],
  };
  // 运行在 10-18 23:59:59 开始，请求在 10-19 00:00:01 才发出
  const at = "2026-10-18T23:59:59.000Z";
  const run = (ledger: Ledger) =>
    runBlockBeats({ id: "blockbeats", cfg, ctx, key: KEY, ledger, persist: () => {}, at, w: dailyWindow("2026-10-19"), cached: null, now: () => "2026-10-19T00:00:01.000Z" });

  const fresh: Ledger = { schema: 1, days: {}, last_success_at: null };
  const r = await run(fresh);
  assert.deepEqual([r.calls, requests], [1, 1]);
  assert.deepEqual(fresh.days, { "2026-10-19": { calls: 1 } }, "记到请求发生的 10-19，不是运行开始的 10-18");

  // 10-19 的 4 次已用完：即使运行开始时（10-18）还有预算，也不能再发请求
  requests = 0;
  const full: Ledger = { schema: 1, days: { "2026-10-18": { calls: 0 }, "2026-10-19": { calls: cfg.max_calls_per_day } }, last_success_at: null };
  const r2 = await run(full);
  assert.deepEqual([r2.calls, requests], [0, 0]);
  assert.match(r2.skipped!, /预算 4 次已用完/);
  assert.deepEqual(full.days, { "2026-10-18": { calls: 0 }, "2026-10-19": { calls: cfg.max_calls_per_day } });

  // 10-19 已停止调用（auth/quota）同样生效
  requests = 0;
  const blocked: Ledger = { schema: 1, days: { "2026-10-19": { calls: 1, blocked: "auth: body status 101" } }, last_success_at: null };
  const r3 = await run(blocked);
  assert.equal(r3.calls, 0);
  assert.match(r3.skipped!, /已停止调用/);
  assert.equal(requests, 0);
});

test("sources.yml：max_calls_per_day 不能超过硬上限，endpoint 只能是两个 important 接口，源必须已登记", () => {
  const bad = (over: Record<string, unknown>) => !sourcesFileSchema.safeParse(sourcesYml(over)).success;
  const bbCfg = sourcesYml().sources.blockbeats;
  assert.ok(bad({ blockbeats: { ...bbCfg, max_calls_per_day: 7 } }));
  assert.ok(bad({ blockbeats: { ...bbCfg, endpoints: ["newsflash"] } }));
  assert.ok(bad({ blockbeats: { ...bbCfg, size: 51 } }));
  assert.ok(bad({ blockbeats: { ...bbCfg, endpoints: ["newsflash/important", "article/important"] } })); // 2 个 endpoint 需要每次运行 2 次
  assert.ok(bad({ coindesk: { type: "rss", url: "https://www.coindesk.com/rss", max_calls_per_run: 1 } }));
  assert.ok(!bad({}));
  // 仓库里的 sources.yml 本身合法，且 BlockBeats 是所有者定的 4 / 6
  const real = sourcesFileSchema.parse(parseYaml(readFileSync(join(REPO, "sources.yml"), "utf8")));
  const rb = real.sources.blockbeats as BlockBeatsConfig;
  assert.deepEqual([rb.max_calls_per_day, rb.hard_cap_per_day, rb.max_calls_per_run, rb.endpoints], [4, 6, 1, ["newsflash/important"]]);
});

// ───────────────────────── 凭据 ─────────────────────────

test("凭据不进任何输出：manifest、items、state、stdout/stderr 里都没有 key（即使服务器把它回显）", async () => {
  const { root, state } = makeRoot();
  reset({ status: -1, message: `quota exceeded for key ${KEY}`, data: { data: [] } });
  const r = await ingest(root, "2026-10-18", AT);
  assert.equal(src(r.manifest, "blockbeats").status, "failed");
  assert.match(src(r.manifest, "blockbeats").error!, /body status -1/);
  const files: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d, { withFileTypes: true })) n.isDirectory() ? walk(join(d, n.name)) : files.push(join(d, n.name));
  };
  walk(join(root, ".rh"));
  assert.ok(files.some((f) => f.endsWith("ledger.json")) && files.some((f) => f.endsWith("items.jsonl")));
  for (const f of files) assert.ok(!readFileSync(f, "utf8").includes(KEY), f);
  assert.ok(!r.out.includes(KEY));
  assert.ok(!readFileSync(join(REPO, "sources.yml"), "utf8").includes(KEY));
  assert.ok(existsSync(state));
});

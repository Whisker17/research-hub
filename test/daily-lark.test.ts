/**
 * Daily Topics → Lark（WHI-1972）。全部离线：Lark 和公开站点都是假的（注入的 fetch 或本机 HTTP 服务）。
 *  - rh daily card：5 / 10 个 topic、degraded、empty、Updated、Resent、长中文标题、长标签、@ / HTML 注入、不允许的链接、
 *    大小守卫（含 timestamp 与 sign）与迷你卡片；输出里没有 manifest 的内部字段；
 *  - scripts/lark-post.ts：签名的已知答案、只有 code == 0 才算成功、重试矩阵、webhook 主机 / 路径校验、拒绝重定向、超时、不写密钥；
 *  - scripts/daily-notify-plan.ts：decide 的每种情况、台账（重跑跳过、早一轮 degraded → 最后一轮发一次、regenerate → Updated、force → Resent）、
 *    线上版本（main 前进了但线上还是旧版本：notify_only 按线上 SHA 构建并通过哈希检查；哈希不一致就拒绝）、提醒卡片；
 *  - daily.yml / deploy.yml 的结构：notify / alert 的 needs、if、权限与 Lark 密钥的范围，concurrency: daily，deployed_sha。
 */
import assert from "node:assert/strict";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, mock, test } from "node:test";
import { parse, stringify } from "yaml";
import { CARD_CAPS, cardInput, cardInputHash, dailyCard, digestUrl, type CardInput } from "../lib/daily-card.ts";
import { dailyForbidden, loadDaily, type Day, type Topic } from "../lib/daily.ts";
import { CARD_BUDGET, md, plain, requestBody, requestBytes, sign, type LarkMessage } from "../lib/lark.ts";
import { plan } from "../scripts/daily.ts";
import { alertCard, decide, ledgerDecision, liveSha, pageHash, verifyLive, type Needs } from "../scripts/daily-notify-plan.ts";
import { RETRY_DELAYS, TIMEOUT_MS, filterMsg, main as larkMain, postCard, webhookError, type PostDeps } from "../scripts/lark-post.ts";

const REPO = join(import.meta.dirname, "..");
const SITE = join(REPO, "test", "fixtures", "daily-site", "daily");
const PUBLIC_URL = "https://research-hub.example.test";
const tmps: string[] = [];
const servers: Server[] = [];
const mkTmp = (p: string) => {
  const d = mkdtempSync(join(tmpdir(), p));
  tmps.push(d);
  return d;
};
after(() => {
  tmps.forEach((d) => rmSync(d, { recursive: true, force: true }));
  servers.forEach((s) => (s.closeAllConnections(), s.close()));
});

const fixtureDays = (): Day[] => loadDaily(join(SITE, "..")).days;
const fixtureDay = (date: string): Day => structuredClone(fixtureDays().find((d) => d.date === date)!);
const cardText = (m: LarkMessage): string => JSON.stringify(m);
const divs = (m: LarkMessage): string[] =>
  (m.card.elements as { tag: string; text?: { content: string } }[]).filter((e) => e.tag === "div").map((e) => e.text!.content);
const header = (m: LarkMessage) => m.card.header as { template: string; title: { content: string } };
const buttons = (m: LarkMessage) => ((m.card.elements as { tag: string; actions?: { url: string; text: { content: string } }[] }[]).find((e) => e.tag === "action")?.actions ?? []).map((b) => [b.text.content, b.url]);

/** complete 那天（2026-10-18）换成 n 个 topic；id 按日期 + 序号生成，其余字段取 make(i) */
function withTopics(n: number, make: (i: number, base: Topic) => Partial<Topic> = () => ({})): CardInput {
  const day = fixtureDay("2026-10-18");
  const base = day.topics!.topics[0];
  day.topics!.topics = Array.from({ length: n }, (_, i) => ({ ...structuredClone(base), id: `2026-10-18-${(i + 1).toString(16).padStart(6, "0")}`, ...make(i, base) }));
  day.manifest.counts.topics = n;
  return cardInput(day);
}

// ───────── rh daily card ─────────

test("卡片：5 个与 10 个 topic，蓝色标题、源状态只有 ✓ / ✗、每个 topic 一段、链接只来自 publicUrl + 日期 + topic id", () => {
  for (const n of [5, 10]) {
    const input = withTopics(n);
    const { message, fallback, dropped } = dailyCard(input, { publicUrl: PUBLIC_URL });
    assert.equal(fallback, false);
    assert.deepEqual(dropped, { why_now: 0, title_en: 0 });
    assert.deepEqual(header(message), { template: "blue", title: { tag: "plain_text", content: `📰 Daily Topics · 2026-10-18 · ${n} topics` } });
    const d = divs(message);
    assert.equal(d[0], "Sources: ETHTAO ✓", "skipped 的源不列出，没有条目数和调用数");
    assert.equal(d.length, 1 + n);
    d.slice(1).forEach((c, i) => {
      const id = `2026-10-18-${(i + 1).toString(16).padStart(6, "0")}`;
      assert.match(c, new RegExp(`^\\*\\*${i + 1}\\. Glamsterdam`));
      assert.ok(c.endsWith(`[Open](${PUBLIC_URL}/daily/2026-10-18/#${id})`), c);
      assert.ok(c.includes("crypto · ethereum · confidence high · 2 sources · update"), c);
    });
    assert.deepEqual(buttons(message), [
      ["Open today's topics", `${PUBLIC_URL}/daily/2026-10-18/`],
      ["ETHTAO digest", "https://x.com/Ethtao_Ethtao/status/2111652016124784867"],
    ]);
    assert.match(cardText(message), /Window 2026-10-17 00:00 → 2026-10-18 00:00 UTC · pick one: rh topic select <id>/);
  }
  // 超过 10 个只排前 10 个
  assert.equal(divs(dailyCard(withTopics(12), { publicUrl: PUBLIC_URL }).message).length, 1 + CARD_CAPS.topics);
});

test("卡片：degraded 橙色、empty 灰色并写明公开原因；Updated / Resent 写在标题里；pending 没有卡片", () => {
  const degraded = dailyCard(cardInput(fixtureDay("2026-10-17")), { publicUrl: PUBLIC_URL }).message;
  assert.equal(header(degraded).template, "orange");
  assert.equal(header(degraded).title.content, "📰 Daily Topics · 2026-10-17 · 2 topics");
  assert.ok(divs(degraded).includes("Status: degraded — the ETHTAO Ethereum digest was not posted; fewer than 5 topics qualified"));
  assert.deepEqual(buttons(degraded).map((b) => b[0]), ["Open today's topics"], "没有日报就没有 ETHTAO 按钮");
  const empty = dailyCard(cardInput(fixtureDay("2026-10-16")), { publicUrl: PUBLIC_URL }).message;
  assert.equal(header(empty).template, "grey");
  assert.equal(header(empty).title.content, "📰 Daily Topics · 2026-10-16 · 0 topics");
  assert.ok(divs(empty).includes("No topics for this day."));
  assert.ok(!cardText(empty).includes("rh topic select"), "没有 topic 时不提示选题命令");
  const input = cardInput(fixtureDay("2026-10-18"));
  assert.match(header(dailyCard(input, { publicUrl: PUBLIC_URL, variant: "updated" }).message).title.content, / · 6 topics · Updated$/);
  assert.match(header(dailyCard(input, { publicUrl: PUBLIC_URL, variant: "resent" }).message).title.content, / · 6 topics · Resent$/);
  assert.throws(() => dailyCard(cardInput(fixtureDay("2026-10-19")), { publicUrl: PUBLIC_URL }), /pending/);
});

test("卡片：长中文标题、长标签按码点截断（不切开字符）；@ 提及与 HTML 被去掉，lark_md 标记原样显示", () => {
  const long = "以太坊".repeat(60);
  const input = withTopics(1, () => ({
    title: `<at id=all></at><at user_id="ou_x">所有人</at>${long}`,
    title_en: `**bold** [click](https://evil.example/) <b>x</b> ${"E".repeat(300)}`,
    why_now: `~~strike~~ _it_ \`code\` \\ & <script>alert(1)</script> ${"为什么".repeat(80)}`,
    tags: ["a-very-long-tag-name-that-goes-on-and-on", "b", "c", "d", "e-is-the-fifth"],
  }));
  const c = divs(dailyCard(input, { publicUrl: PUBLIC_URL }).message)[1];
  const [title, en, why, meta] = c.split("\n");
  assert.ok(!c.includes("<at") && !c.includes("</at>") && !c.includes("<b>") && !c.includes("<script"), c);
  const titleText = title.replace(/^\*\*1\. /, "").replace(/\*\*$/, "");
  assert.equal([...titleText].length, CARD_CAPS.title, "标题 80 个字符（含 …）");
  assert.ok(titleText.startsWith("所有人 以太坊") && titleText.endsWith("…"), titleText);
  assert.ok(!/[\uD800-\uDBFF]$/.test(titleText.slice(0, -1)), "没有切开代理对");
  assert.ok(en.startsWith("&#42;&#42;bold&#42;&#42; &#91;click&#93;&#40;https://evil.example/&#41; x E"), en);
  assert.ok(!c.includes("[click](") && !c.includes("**bold**"), "不能变成链接或加粗");
  assert.ok(why.startsWith("&#126;&#126;strike&#126;&#126; &#95;it&#95; &#96;code&#96; &#92; &amp; alert&#40;1&#41;"), why);
  assert.equal([...plain(input.topics[0].why_now, CARD_CAPS.why_now)].length, CARD_CAPS.why_now);
  // 标签：最多 4 个，每个最多 24 个字符
  assert.ok(meta.startsWith(`crypto · ${"a-very-long-tag-name-th…"}, b, c, d · confidence`), meta);
  assert.ok(!meta.includes("e-is-the-fifth"));
  // 唯一的 lark_md 链接是站内链接
  assert.deepEqual([...cardText(dailyCard(input, { publicUrl: PUBLIC_URL }).message).matchAll(/\]\((https?:[^)]*)\)/g)].map((m) => m[1]), [`${PUBLIC_URL}/daily/2026-10-18/#2026-10-18-000001`]);
});

test("卡片：不允许的链接——只有 https://x.com/Ethtao_Ethtao/status/<数字> 才有 ETHTAO 按钮；站点链接不用数据里的 URL", () => {
  for (const bad of [
    "https://x.com.evil.example/Ethtao_Ethtao/status/1",
    "http://x.com/Ethtao_Ethtao/status/1",
    "https://twitter.com/Ethtao_Ethtao/status/1",
    "https://x.com/someone/status/1",
    "https://x.com/Ethtao_Ethtao/status/1/photo/1",
    "https://user@x.com/Ethtao_Ethtao/status/1",
    "https://x.com:8443/Ethtao_Ethtao/status/1",
    "javascript:alert(1)//x.com/Ethtao_Ethtao/status/1",
    "https://x.com/Ethtao_Ethtao/status/abc",
  ]) {
    assert.equal(digestUrl(bad), null, bad);
    const day = fixtureDay("2026-10-18");
    day.manifest.digest.url = bad;
    assert.deepEqual(buttons(dailyCard(cardInput(day), { publicUrl: PUBLIC_URL }).message).map((b) => b[0]), ["Open today's topics"], bad);
  }
  assert.equal(digestUrl("https://x.com/Ethtao_Ethtao/status/2111652016124784867?s=20#x"), "https://x.com/Ethtao_Ethtao/status/2111652016124784867", "去掉查询和锚点");
  // topic id 不合法（或不是这一天的）就不排版，不会把数据拼进链接
  const input = withTopics(2);
  input.topics[1] = { ...input.topics[1], id: "2026-10-18-zz)(javascript:x" };
  assert.equal(divs(dailyCard(input, { publicUrl: PUBLIC_URL }).message).length, 2);
  assert.throws(() => dailyCard(input, { publicUrl: "https://example.test/some/path" }), /publicUrl/);
  assert.throws(() => dailyCard(input, { publicUrl: "javascript:alert(1)" }), /publicUrl/);
});

test("大小守卫：量的是完整请求（含 timestamp 与 sign）；先从后往前去掉 why_now，再去掉 title_en，还放不下就退回迷你卡片", () => {
  // 每个字段都写满、每个字符都要转义（* → &#42;）：10 个 topic 超过 18 KB
  const worst = withTopics(10, () => ({ title: "*".repeat(200), title_en: "_".repeat(200), why_now: "~".repeat(300), tags: ["a_b_c_d_e_f_g_h_i_j_k_l_m", "n_o_p_q_r_s_t_u_v_w_x_y_z", "a_a_a_a_a_a_a_a_a_a_a_a_a", "b_b_b_b_b_b_b_b_b_b_b_b_b"] }));
  const full = dailyCard(worst, { publicUrl: PUBLIC_URL, budget: Number.POSITIVE_INFINITY });
  assert.ok(full.bytes > CARD_BUDGET, `需要一张超过 18 KB 的卡片（${full.bytes}）`);
  const fit = dailyCard(worst, { publicUrl: PUBLIC_URL });
  assert.equal(fit.fallback, false);
  assert.ok(fit.bytes <= CARD_BUDGET, String(fit.bytes));
  assert.ok(fit.dropped.why_now > 0 && fit.dropped.why_now < 10 && fit.dropped.title_en === 0, JSON.stringify(fit.dropped));
  const d = divs(fit.message).slice(1);
  const k = 10 - fit.dropped.why_now;
  d.forEach((c, i) => assert.equal(c.includes("&#126;"), i < k, `why_now 从最后一个 topic 往前去掉（topic ${i + 1}）`));
  // bytes 就是真实请求的字节数：签名字段（10 位 timestamp + 44 个字符的 sign）算在里面
  const ts = String(Math.floor(Date.now() / 1000));
  assert.equal(fit.bytes, Buffer.byteLength(requestBody(fit.message, ts, sign(ts, "s3cret"))));
  assert.equal(fit.bytes, requestBytes(fit.message));
  assert.ok(Buffer.byteLength(JSON.stringify(fit.message)) < fit.bytes, "不能只量卡片本身");

  // 预算刚好等于完整卡片：什么都不去；少 1 字节：只去掉最后一个 topic 的 why_now
  const normal = withTopics(5, (i, b) => ({ why_now: `W${i}: ${b.why_now}`, title_en: `E${i}: ${b.title_en}` }));
  const whole = dailyCard(normal, { publicUrl: PUBLIC_URL });
  assert.deepEqual(dailyCard(normal, { publicUrl: PUBLIC_URL, budget: whole.bytes }).dropped, { why_now: 0, title_en: 0 });
  const minus = dailyCard(normal, { publicUrl: PUBLIC_URL, budget: whole.bytes - 1 });
  assert.deepEqual(minus.dropped, { why_now: 1, title_en: 0 });
  assert.ok(!divs(minus.message)[5].includes("W4:") && divs(minus.message)[4].includes("W3:"));
  // 预算逐步收紧：title_en 只在 why_now 全部去掉之后才开始去（同样从后往前）
  let tight = whole;
  for (let b = whole.bytes; tight.dropped.title_en === 0 && !tight.fallback; b -= 8) tight = dailyCard(normal, { publicUrl: PUBLIC_URL, budget: b });
  assert.deepEqual([tight.fallback, tight.dropped], [false, { why_now: 5, title_en: 1 }]);
  assert.ok(!divs(tight.message)[5].includes("E4:") && divs(tight.message)[4].includes("E3:"));
  // 迷你卡片：日期、状态、数量和页面按钮
  const mini = dailyCard(normal, { publicUrl: PUBLIC_URL, budget: 900 });
  assert.equal(mini.fallback, true);
  assert.ok(mini.bytes <= 900);
  assert.equal(header(mini.message).title.content, "📰 Daily Topics · 2026-10-18 · 5 topics");
  assert.deepEqual(divs(mini.message), ["Status: complete · 5 topics. The full list is on the page."]);
  assert.deepEqual(buttons(mini.message), [["Open today's topics", `${PUBLIC_URL}/daily/2026-10-18/`]]);
  assert.throws(() => dailyCard(normal, { publicUrl: PUBLIC_URL, budget: 100 }), /迷你卡片也超过/);
});

test("rh daily card：夹具的每一天输出卡片 JSON；输出里没有 manifest 的内部字段和 state.yml 的内容；哈希等于页面的投影", () => {
  const root = mkTmp("rh-lark-card-");
  cpSync(SITE, join(root, "daily"), { recursive: true });
  writeFileSync(join(root, "rh.config.json"), JSON.stringify({ ...JSON.parse(readFileSync(join(REPO, "rh.config.json"), "utf8")), publicUrl: PUBLIC_URL }));
  const rh = (...a: string[]) => spawnSync(process.execPath, [join(REPO, "cli", "rh.ts"), "daily", "card", ...a], { cwd: root, encoding: "utf8", env: { ...process.env, RH_ROOT: root, NO_COLOR: "1" } });
  const load = loadDaily(root);
  const forbidden = dailyForbidden(load).map((f) => f.text).filter((t) => t.length >= 4);
  assert.ok(forbidden.some((t) => t.includes("SITEFIXTURE")), "夹具里有可识别的内部值");
  for (const date of ["2026-10-16", "2026-10-17", "2026-10-18"]) {
    const r = rh("--date", date);
    assert.equal(r.status, 0, r.stderr);
    const m = JSON.parse(r.stdout) as LarkMessage;
    assert.equal(m.msg_type, "interactive");
    for (const t of forbidden) assert.ok(!r.stdout.includes(t), `${date}: 卡片里出现了内部数据 ${t}`);
    for (const f of ['"calls"', '"error"', '"run"', '"generator"', '"dropped"', "397"]) assert.ok(!r.stdout.includes(f), `${date}: ${f}`);
    const out = join(root, `${date}.json`);
    const w = rh("--date", date, "--variant", "updated", "--out", out);
    assert.equal(w.status, 0, w.stderr);
    assert.match(w.stdout, new RegExp(`卡片输入 sha256 ${cardInputHash(cardInput(load.days.find((d) => d.date === date)!))}`));
    assert.match(header(JSON.parse(readFileSync(out, "utf8"))).title.content, /Updated$/);
  }
  assert.notEqual(rh("--date", "2026-10-19").status, 0, "pending 没有卡片");
  assert.notEqual(rh("--date", "2026-10-20").status, 0, "没有这一天");
  assert.equal(rh("--date", "2026-10-18", "--variant", "loud").status, 2);
  assert.equal(rh("--date", "18-10-2026").status, 2);
  // 卡片输入：公开投影 + ✓/✗ + 日报链接；不含条目数、调用数、错误
  const input = cardInput(load.days.find((d) => d.date === "2026-10-18")!);
  assert.deepEqual(input.sources, [{ id: "ethtao", ok: true }]);
  assert.ok(!JSON.stringify(input).includes("SITEFIXTURE"));
});

test("lark_md 转义与纯文本清理", () => {
  assert.equal(md("a*b_c~d`e[f](g)<h>&i\\j"), "a&#42;b&#95;c&#126;d&#96;e&#91;f&#93;&#40;g&#41;&lt;h&gt;&amp;i&#92;j");
  assert.equal(plain("  a\n\tb\u202Ec\u0007  "), "a b c");
  assert.equal(plain("<at id=all></at>hi <img src=x onerror=alert(1)>there"), "hi there");
  assert.equal(plain("a < b > c"), "a < b > c", "不是标签的尖括号保留（再由 md 转义）");
  assert.equal(plain("😀".repeat(5), 3), "😀😀…");
});

// ───────── scripts/lark-post.ts ─────────

const URL_OK = "https://open.larksuite.com/open-apis/bot/v2/hook/0123abcd-TOKEN-4567";
const SECRET = "sEcReT-signing-value";
const MSG: LarkMessage = { msg_type: "interactive", card: { header: { title: { tag: "plain_text", content: "CARDBODY marker" } }, elements: [] } };

/** 按顺序返回的假 Lark：每项是 [HTTP 状态, 返回体] 或一个要抛出的错误 */
function fakeLark(script: ([number, unknown] | Error)[]) {
  const calls: { url: string; init: RequestInit; body: Record<string, string> }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(String(init.body)) });
    const next = script[Math.min(calls.length - 1, script.length - 1)];
    if (next instanceof Error) throw next;
    return new Response(typeof next[1] === "string" ? next[1] : JSON.stringify(next[1]), { status: next[0] });
  }) as unknown as typeof fetch;
  return { f, calls };
}
function deps(f: typeof fetch, over: Partial<PostDeps> = {}) {
  const sleeps: number[] = [];
  const logs: string[] = [];
  let t = 1_792_385_000_000;
  const d: PostDeps = { fetch: f, sleep: async (ms) => void sleeps.push(ms), now: () => (t += 61_000), log: (l) => void logs.push(l), ...over };
  return { d, sleeps, logs };
}
const netErr = () => Object.assign(new TypeError("fetch failed"), { cause: new Error("connect ECONNREFUSED") });

test("签名：已知答案（openssl 独立计算）；每次尝试都重新取 timestamp、重新签名", async () => {
  assert.equal(sign("1599360473", "demo"), "l1N0gAcBjdwBvGm1xMjOF0XSyaLRpR7tuO5dHfhAYc8=");
  const { f, calls } = fakeLark([[500, { code: 1 }], [200, { code: 0, msg: "success" }]]);
  const r = await postCard(MSG, URL_OK, SECRET, deps(f).d);
  assert.deepEqual([r.ok, r.attempts], [true, 2]);
  const [a, b] = calls.map((c) => c.body);
  assert.notEqual(a.timestamp, b.timestamp);
  for (const x of [a, b]) {
    assert.match(x.timestamp, /^\d{10}$/);
    assert.equal(x.sign, sign(x.timestamp, SECRET));
    assert.equal(x.msg_type, "interactive");
  }
  assert.deepEqual(Object.keys(a), ["timestamp", "sign", "msg_type", "card"]);
  for (const c of calls) {
    assert.equal(c.init.redirect, "error");
    assert.equal(c.init.method, "POST");
    assert.ok(c.init.signal instanceof AbortSignal);
  }
  assert.equal(TIMEOUT_MS, 5000);
});

test("成功只看 HTTP 200 且 code == 0；重试矩阵：网络错误、超时、5xx、11232 重试（10 s / 30 s / 90 s），9499、19021、4xx 不重试", async () => {
  const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  const cases: [string, ([number, unknown] | Error)[], boolean, number][] = [
    ["200 + code 0", [[200, { code: 0, msg: "success" }]], true, 1],
    ["200 但没有 code（只有 StatusCode）", [[200, { StatusCode: 0 }]], false, 1],
    ["200 但返回体不是 JSON", [[200, "ok"]], false, 1],
    ["201 + code 0", [[201, { code: 0 }]], false, 1],
    ["9499 bad request", [[200, { code: 9499, msg: "Bad Request" }]], false, 1],
    ["19021 签名或时间戳", [[200, { code: 19021, msg: "sign match fail or timestamp is not within one hour" }]], false, 1],
    ["400", [[400, { code: 9499 }]], false, 1],
    ["其他错误码", [[200, { code: 19024, msg: "Key Words Not Found" }]], false, 1],
    ["5xx 一直失败", [[502, "bad gateway"]], false, 4],
    ["11232 一直限流", [[200, { code: 11232, msg: "frequency limited" }]], false, 4],
    ["网络错误后成功", [netErr(), [200, { code: 0 }]], true, 2],
    ["超时后成功", [timeout, [200, { code: 0 }]], true, 2],
    ["503、11232、网络错误之后成功", [[503, ""], [200, { code: 11232 }], netErr(), [200, { code: 0 }]], true, 4],
  ];
  for (const [name, script, ok, attempts] of cases) {
    const { f, calls } = fakeLark(script);
    const { d, sleeps } = deps(f);
    const r = await postCard(MSG, URL_OK, SECRET, d);
    assert.deepEqual([r.ok, r.attempts, calls.length], [ok, attempts, attempts], name);
    assert.deepEqual(sleeps, RETRY_DELAYS.slice(0, attempts - 1), name);
  }
  assert.deepEqual([...RETRY_DELAYS], [10_000, 30_000, 90_000]);
});

test("webhook 校验：只允许 https://open.larksuite.com 或 https://open.feishu.cn 的 /open-apis/bot/v2/hook/<token>", () => {
  assert.equal(webhookError(URL_OK), null);
  assert.equal(webhookError("https://open.feishu.cn/open-apis/bot/v2/hook/abc"), null);
  assert.equal(webhookError("https://OPEN.LARKSUITE.COM/open-apis/bot/v2/hook/abc"), null, "主机名大小写由 URL 规范化");
  for (const bad of [
    "http://open.larksuite.com/open-apis/bot/v2/hook/abc",
    "https://open.larksuite.com.evil.example/open-apis/bot/v2/hook/abc",
    "https://evil.example/open.larksuite.com/open-apis/bot/v2/hook/abc",
    "https://x.open.larksuite.com/open-apis/bot/v2/hook/abc",
    "https://open.larksuite.com./open-apis/bot/v2/hook/abc",
    "https://open.larksuite.com:8443/open-apis/bot/v2/hook/abc",
    "https://user:pw@open.larksuite.com/open-apis/bot/v2/hook/abc",
    "https://open.larksuite.com/open-apis/bot/v2/hook/",
    "https://open.larksuite.com/open-apis/bot/v1/hook/abc",
    "https://open.larksuite.com/x/open-apis/bot/v2/hook/abc",
    "https://open.larksuite.com/open-apis/bot/v2/hook/abc?next=https://evil",
    "not a url",
  ]) {
    const e = webhookError(bad);
    assert.ok(e, bad);
    assert.ok(!e.includes("abc") && !e.includes("evil"), `原因里不含 URL：${e}`);
  }
});

test("拒绝重定向（真实的 fetch，本机服务返回 302）：只请求一次，不跟随、不重试", async () => {
  let hits = 0;
  let followed = 0;
  const server = createServer((req, res) => {
    if (req.url === "/followed") followed++;
    else hits++;
    res.writeHead(302, { location: "/followed" });
    res.end();
  });
  servers.push(server);
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as { port: number }).port;
  const local = ((_: string, init: RequestInit) => fetch(`http://127.0.0.1:${port}/hook`, init)) as typeof fetch;
  const { d, sleeps } = deps(local);
  const r = await postCard(MSG, URL_OK, SECRET, d);
  assert.deepEqual([r.ok, r.attempts, hits, followed, sleeps.length], [false, 1, 1, 0, 0]);
  assert.match(r.last, /redirect; refused/);
});

test("超时：每次尝试都有超时信号；超时算网络错误，按间隔重试，用完后失败", async () => {
  let n = 0;
  const hang = ((_: string, init: RequestInit) => {
    n++;
    return new Promise((_ok, fail) => init.signal!.addEventListener("abort", () => fail(init.signal!.reason)));
  }) as typeof fetch;
  const { d, sleeps, logs } = deps(hang, { timeoutMs: 20 });
  const r = await postCard(MSG, URL_OK, SECRET, d);
  assert.deepEqual([r.ok, r.attempts, n], [false, 4, 4]);
  assert.deepEqual(sleeps, [...RETRY_DELAYS]);
  assert.ok(logs.filter((l) => /timed out after 0\.02 s/.test(l)).length === 4, logs.join("\n"));
});

test("超过 20 KB 的请求不发；日志里没有 URL、token、secret 或请求体", async () => {
  const big: LarkMessage = { msg_type: "interactive", card: { elements: [{ tag: "div", text: { tag: "lark_md", content: "x".repeat(21_000) } }] } };
  const { f, calls } = fakeLark([[200, { code: 0 }]]);
  const r = await postCard(big, URL_OK, SECRET, deps(f).d);
  assert.deepEqual([r.ok, r.attempts, calls.length], [false, 0, 0]);
  assert.match(r.last, /over the 20480-byte limit; not sent/);

  // Lark 的 msg 里回显了 URL、token 和 secret：过滤后才写日志
  const token = URL_OK.split("/").pop()!;
  const echo = `bad ${URL_OK} token=${token} secret=${SECRET} ${"y".repeat(300)}`;
  const tmp = mkTmp("rh-lark-post-");
  const card = join(tmp, "card.json");
  writeFileSync(card, JSON.stringify(MSG));
  const summary = join(tmp, "summary.md");
  const out = join(tmp, "out");
  const printed: string[] = [];
  const log = mock.method(console, "log", (...a: unknown[]) => void printed.push(a.join(" ")));
  const err = mock.method(console, "error", (...a: unknown[]) => void printed.push(a.join(" ")));
  try {
    for (const script of [[[200, { code: 9499, msg: echo }]], [[503, { code: 1, msg: echo }]], [netErr()], [[200, { code: 0, msg: echo }]]] as ([number, unknown] | Error)[][]) {
      const { f: fx } = fakeLark(script);
      await larkMain([card], { LARK_WEBHOOK_URL: URL_OK, LARK_SIGNING_SECRET: SECRET, GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: out }, { fetch: fx, sleep: async () => {} });
    }
    // 不合格的 webhook：报错，不写 URL
    assert.equal(await larkMain([card], { LARK_WEBHOOK_URL: `https://evil.example/open-apis/bot/v2/hook/${token}`, LARK_SIGNING_SECRET: SECRET }), 1);
  } finally {
    log.mock.restore();
    err.mock.restore();
  }
  const all = `${printed.join("\n")}\n${readFileSync(summary, "utf8")}\n${readFileSync(out, "utf8")}`;
  for (const s of [URL_OK, token, SECRET, "open-apis", "CARDBODY", "evil.example"]) assert.ok(!all.includes(s), `日志里出现了 ${s}`);
  assert.ok(printed.some((l) => /HTTP 200, code 9499, msg bad <redacted> token=<redacted> secret=<redacted> y+…$/.test(l)), printed.join("\n"));
  assert.ok(printed.every((l) => !/msg .{122,}$/.test(l)), "msg 不超过 120 个字符");
  assert.equal(filterMsg("see https://open.feishu.cn/document/x?a=1 and\nmore", []), "see <url> and more");
  assert.equal(filterMsg({ not: "a string" }, []), "");
});

test("没有 Lark 密钥：写 “Lark disabled”，退出码 0，sent=false（只设了一个也一样，并给警告）", async () => {
  const tmp = mkTmp("rh-lark-off-");
  const card = join(tmp, "card.json");
  writeFileSync(card, JSON.stringify(MSG));
  for (const env of [{}, { LARK_WEBHOOK_URL: "" , LARK_SIGNING_SECRET: "" }, { LARK_WEBHOOK_URL: URL_OK }, { LARK_SIGNING_SECRET: SECRET }]) {
    const summary = join(tmp, "s.md");
    const out = join(tmp, "o");
    rmSync(summary, { force: true });
    rmSync(out, { force: true });
    const r = spawnSync(process.execPath, [join(REPO, "scripts", "lark-post.ts"), card], { encoding: "utf8", env: { PATH: process.env.PATH, GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: out, ...env } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(readFileSync(summary, "utf8"), /Lark disabled/);
    assert.equal(readFileSync(out, "utf8"), "sent=false\n");
    assert.equal(r.stdout.includes("::warning::"), Object.keys(env).length === 1, r.stdout);
    assert.ok(!r.stdout.includes(SECRET) && !r.stdout.includes(URL_OK));
  }
});

// ───────── decide ─────────

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
type R = "success" | "failure" | "cancelled" | "skipped";
function needs(r: Partial<Record<"plan" | "ingest" | "generate" | "commit" | "deploy", R>>, o: { pushed?: boolean; sha?: string; deployed?: string } = {}): Needs {
  return {
    plan: { result: r.plan ?? "success", outputs: {} },
    ingest: { result: r.ingest ?? "success", outputs: {} },
    generate: { result: r.generate ?? "success", outputs: {} },
    commit: { result: r.commit ?? "success", outputs: o.pushed === false ? {} : { pushed: "true", sha: o.sha ?? SHA_A } },
    deploy: { result: r.deploy ?? "success", outputs: { deployed_sha: o.deployed ?? SHA_A } },
  };
}
const allSkipped = { ingest: "skipped", generate: "skipped", commit: "skipped", deploy: "skipped" } as const;

test("decide：正常、notify_only、最后一轮没变化、上游失败、取消、plan 失败，以及其他组合都拒绝", () => {
  const d = (n: Needs, notifyOnly = false, final = false) => decide({ needs: n, notifyOnly, final });
  // 正常：推送并部署 → 用 deploy 报告的 SHA（必须等于推送的提交）
  assert.deepEqual(d(needs({})), { action: "proceed", source: "deployed", deployedSha: SHA_A, reason: `send from the deployed commit ${SHA_A.slice(0, 12)}` });
  assert.equal(d(needs({ generate: "skipped" })).action, "proceed", "不需要生成时 generate 被跳过");
  // notify_only：上游按设计全部 skipped → 线上版本
  assert.deepEqual([d(needs(allSkipped, { pushed: false }), true).action, (d(needs(allSkipped, { pushed: false }), true) as { source: string }).source], ["proceed", "live"]);
  assert.equal(d(needs({}), true).action, "refuse", "notify_only 却跑了上游");
  // 没有新内容（plan 什么都不处理，或处理了但没变化）：最后一轮用线上版本，否则跳过
  for (const n of [needs(allSkipped, { pushed: false }), needs({ deploy: "skipped" }, { pushed: false }), needs({ generate: "skipped", deploy: "skipped" }, { pushed: false })]) {
    assert.deepEqual([d(n, false, true).action, (d(n, false, true) as { source?: string }).source], ["proceed", "live"]);
    assert.equal(d(n, false, false).action, "skip");
  }
  // 上游失败 / 取消 → 拒绝（失败由 alert job 报告）
  for (const j of ["ingest", "generate", "commit", "deploy"] as const) {
    for (const r of ["failure", "cancelled"] as const) {
      const x = d(needs({ [j]: r }), false, true);
      assert.equal(x.action, "refuse", `${j} ${r}`);
      assert.match(x.reason, new RegExp(`${j} ${r}`));
    }
  }
  assert.equal(d(needs({ plan: "failure" })).action, "refuse");
  // 推送了但没有部署（试验分支、或部署被跳过）、deploy 没报告 SHA、报告的 SHA 不是推送的提交 → 拒绝
  assert.match(d(needs({ deploy: "skipped" })).reason, /pushed but not deployed/);
  assert.match(d(needs({}, { deployed: "" })).reason, /did not report deployed_sha/);
  assert.match(d(needs({}, { deployed: SHA_B })).reason, /not the pushed commit/);
  assert.equal(d({ plan: { result: "success" } }).action, "refuse", "needs 里缺 job");
  assert.equal(d(needs({ commit: "skipped", deploy: "success" }, { pushed: false })).action, "refuse");
});

// ───────── plan 的 notify 日期 ─────────

function planRepo(): string {
  const root = mkTmp("rh-lark-plan-");
  cpSync(join(REPO, "rh.config.json"), join(root, "rh.config.json"));
  cpSync(SITE, join(root, "daily"), { recursive: true });
  return root;
}

test("plan 的 notify：定时 = 今天（13:30 之后才算最后一轮）和昨天；手动 = 指定日期（算最后一轮）；notify_only 不处理任何日期；试验分支不推送", () => {
  const root = planRepo();
  assert.deepEqual(plan(root, { event: "schedule", now: "2026-10-19T04:30:00Z" }).notify, [
    { date: "2026-10-19", final: false, regenerate: false },
    { date: "2026-10-18", final: true, regenerate: false },
  ]);
  assert.deepEqual(plan(root, { event: "schedule", now: "2026-10-19T13:30:00Z" }).notify[0], { date: "2026-10-19", final: true, regenerate: false });
  assert.equal(plan(root, { event: "schedule", now: "2026-10-19T14:05:00Z" }).notify[0].final, true, "延迟到 13:30 之后的运行也是最后一轮");
  // 已是终态（plan 什么都不处理）的日期 notify 照样要看：早一轮 degraded、最后一轮没变化时在最后一轮推送
  const p = plan(root, { event: "schedule", now: "2026-10-18T13:30:00Z" });
  assert.deepEqual([p.dates, p.notify.map((n) => n.date)], [[], ["2026-10-18", "2026-10-17"]]);
  assert.deepEqual(plan(root, { event: "workflow_dispatch", now: "2026-10-20T09:00:00Z", date: "2026-10-18", regenerate: true }).notify, [{ date: "2026-10-18", final: true, regenerate: true }]);
  const n = plan(root, { event: "workflow_dispatch", now: "2026-10-20T09:00:00Z", date: "2026-10-17", notifyOnly: true });
  assert.deepEqual([n.dates, n.notify], [[], [{ date: "2026-10-17", final: true, regenerate: false }]]);
  assert.deepEqual(plan(root, { event: "push", now: "2026-10-19T04:30:00Z" }).notify, []);
  assert.throws(() => plan(root, { event: "schedule", now: "2026-10-19T04:30:00Z", notifyOnly: true }), /notify_only/);
  assert.throws(() => plan(root, { event: "workflow_dispatch", now: "2026-10-20T09:00:00Z", date: "2026-10-18", regenerate: true, notifyOnly: true }), /notify_only/);
  // CLI 输出（plan job 的 outputs）
  const out = join(root, "gh-out");
  const r = spawnSync(process.execPath, [join(REPO, "scripts", "daily.ts"), "plan", "--event", "workflow_dispatch", "--now", "2026-10-20T09:00:00Z", "--date", "2026-10-17", "--notify-only", "--force"], { cwd: root, encoding: "utf8", env: { ...process.env, RH_ROOT: root, GITHUB_OUTPUT: out } });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readFileSync(out, "utf8").trim().split("\n"), ["dates=[]", "any=false", `notify=[{"date":"2026-10-17","final":true,"regenerate":false}]`, "notify_only=true", "force=true"]);
  const r2 = spawnSync(process.execPath, [join(REPO, "scripts", "daily.ts"), "plan", "--event", "schedule", "--now", "2026-10-20T09:00:00Z", "--force"], { cwd: root, encoding: "utf8", env: { ...process.env, RH_ROOT: root, GITHUB_OUTPUT: out } });
  assert.equal(r2.status, 0, r2.stderr);
  assert.match(readFileSync(out, "utf8"), /force=false\n$/, "force 只和 notify_only 一起生效");
});

// ───────── 线上版本 ─────────

/** 带 git 的仓库：提交 A = 夹具；提交 B = main 前进（2026-10-18 的一个标题改了） */
function liveRepo() {
  const root = mkTmp("rh-lark-live-");
  cpSync(join(REPO, "rh.config.json"), join(root, "rh.config.json"));
  cpSync(SITE, join(root, "daily"), { recursive: true });
  const git = (...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "A");
  const a = git("rev-parse", "HEAD");
  const f = join(root, "daily", "2026", "10", "18", "topics.yml");
  const doc = parse(readFileSync(f, "utf8"));
  doc.topics[0].title = "main 上改过的标题（还没部署）";
  writeFileSync(f, stringify(doc, { lineWidth: 0 }));
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", "B");
  const b = git("rev-parse", "HEAD");
  /** 线上版本的 checkout（workflow 里是 actions/checkout ref=<build.json 的 SHA>） */
  const checkout = (sha: string) => {
    const dir = join(mkTmp("rh-lark-co-"), "live");
    git("worktree", "add", "-q", "--detach", dir, sha);
    return dir;
  };
  const hashAt = (dir: string, date: string) => cardInputHash(cardInput(loadDaily(dir).days.find((d) => d.date === date)!));
  return { root, a, b, checkout, hashAt };
}

/** 假的公开站点：/build.json 与 /daily/<date>/（页面的 meta 由 pages 给出） */
async function fakeSite(o: { sha: string; pages: Record<string, string | null> }) {
  const seen: string[] = [];
  const server = createServer((req, res) => {
    seen.push(req.url!);
    if (req.url === "/build.json") return res.end(JSON.stringify({ sha: o.sha }));
    const m = /^\/daily\/(\d{4}-\d{2}-\d{2})\/$/.exec(req.url!);
    if (m && Object.hasOwn(o.pages, m[1])) {
      const h = o.pages[m[1]];
      res.setHeader("content-type", "text/html");
      return res.end(`<!doctype html><html><head><meta charset="utf-8" />${h ? `<meta name="rh-daily-hash" content="${h}">` : ""}<title>x</title></head><body></body></html>`);
    }
    res.statusCode = 404;
    res.end("not found");
  });
  servers.push(server);
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, seen, set: (sha: string) => (o.sha = sha) };
}

async function withPublicUrl<T>(url: string, fn: () => Promise<T>): Promise<T> {
  const before = process.env.RH_PUBLIC_URL;
  process.env.RH_PUBLIC_URL = url;
  try {
    return await fn();
  } finally {
    if (before === undefined) delete process.env.RH_PUBLIC_URL;
    else process.env.RH_PUBLIC_URL = before;
  }
}
const noSleep = async () => {};

test("线上版本：main 前进了但线上还是旧构建——notify_only 按 /build.json 的 SHA 构建，通过哈希检查；用 main 的内容会被拒绝", async () => {
  const { root, a, checkout, hashAt } = liveRepo();
  const liveDir = checkout(a);
  assert.notEqual(hashAt(root, "2026-10-18"), hashAt(liveDir, "2026-10-18"), "main 上的卡片输入已经变了");
  const site = await fakeSite({ sha: a, pages: { "2026-10-18": hashAt(liveDir, "2026-10-18"), "2026-10-17": hashAt(liveDir, "2026-10-17") } });
  await withPublicUrl(site.url, async () => {
    assert.deepEqual(await liveSha({ publicUrl: site.url, sleep: noSleep }), { sha: a });
    const ok = await verifyLive({ liveRoot: liveDir, date: "2026-10-18", final: true, sleep: noSleep });
    assert.equal(ok.action, "send", ok.reason);
    assert.equal((ok as { key: string }).key, `lark-daily-2026-10-18-${hashAt(liveDir, "2026-10-18")}`);
    // 同样的检查用 main 的内容：哈希和线上页面不一致 → 拒绝，不发
    const bad = await verifyLive({ liveRoot: root, date: "2026-10-18", final: true, sleep: noSleep });
    assert.equal(bad.action, "refuse");
    assert.match(bad.reason, /differs from the live page/);
    // CLI：live 输出线上 SHA，verify 输出 action / key（workflow 读这些 outputs）
    const out = join(mkTmp("rh-lark-out-"), "o");
    // 假站点在本进程里：子进程必须异步运行（spawnSync 会卡住事件循环）
    const run = (args: string[], env: Record<string, string>) =>
      new Promise<{ status: number; stderr: string }>((ok) => {
        execFile(process.execPath, [join(REPO, "scripts", "daily-notify-plan.ts"), ...args], { encoding: "utf8", env: { ...process.env, RH_ROOT: root, RH_PUBLIC_URL: site.url, GITHUB_OUTPUT: out, ...env } }, (e, _o, stderr) =>
          ok({ status: e ? Number(e.code ?? 1) : 0, stderr }),
        );
      });
    const l = await run(["live"], { DATE: "2026-10-18", SOURCE: "live" });
    assert.equal(l.status, 0, l.stderr);
    assert.equal(readFileSync(out, "utf8"), `sha=${a}\n`);
    rmSync(out);
    const v = await run(["verify", "--live", liveDir], { DATE: "2026-10-18", FINAL: "true" });
    assert.equal(v.status, 0, v.stderr);
    assert.match(readFileSync(out, "utf8"), new RegExp(`^action=send\nreason=.+\nhash=${hashAt(liveDir, "2026-10-18")}\nkey=lark-daily-2026-10-18-[0-9a-f]{64}\nprefix=lark-daily-2026-10-18-\n$`));
    rmSync(out);
    const v2 = await run(["verify", "--live", liveDir], { DATE: "2026-10-18; rm -rf /", FINAL: "true" });
    assert.notEqual(v2.status, 0, "日期必须是 YYYY-MM-DD");
  });
});

test("线上版本：卡片输入的哈希和线上页面的 rh-daily-hash 不一致、页面没有 meta、页面不存在 → 拒绝；pending 与非最后一轮的 degraded 跳过", async () => {
  const { root, a, b, checkout, hashAt } = liveRepo();
  const liveDir = checkout(a);
  // /build.json 说是 A，页面却是 B 的哈希（或没有 meta、或 404）
  const site = await fakeSite({ sha: a, pages: { "2026-10-18": hashAt(root, "2026-10-18"), "2026-10-16": null } });
  await withPublicUrl(site.url, async () => {
    const mismatch = await verifyLive({ liveRoot: liveDir, date: "2026-10-18", final: true, sleep: noSleep });
    assert.deepEqual([mismatch.action, /differs from the live page/.test(mismatch.reason)], ["refuse", true]);
    const noMeta = await verifyLive({ liveRoot: liveDir, date: "2026-10-16", final: true, sleep: noSleep });
    assert.deepEqual([noMeta.action, /has no rh-daily-hash/.test(noMeta.reason)], ["refuse", true]);
    const missing = await verifyLive({ liveRoot: liveDir, date: "2026-10-17", final: true, sleep: noSleep });
    assert.deepEqual([missing.action, /HTTP 404/.test(missing.reason)], ["refuse", true]);
    assert.deepEqual((await verifyLive({ liveRoot: liveDir, date: "2026-10-19", final: true, sleep: noSleep })).action, "skip", "pending");
    assert.deepEqual((await verifyLive({ liveRoot: liveDir, date: "2026-10-17", final: false, sleep: noSleep })).action, "skip", "degraded 不是最后一轮");
    assert.deepEqual((await verifyLive({ liveRoot: liveDir, date: "2026-10-01", final: true, sleep: noSleep })).action, "skip", "没有这一天");
    // 正常路径：deploy 报告的 SHA 必须等于 /build.json；线上一直是旧版本 → 拒绝（等待生效后再判断）
    const stale = await liveSha({ publicUrl: site.url, deployedSha: b, sleep: noSleep });
    assert.equal((stale as { refuse: string }).refuse, `the live site is at ${a.slice(0, 12)}, but the deploy reported ${b.slice(0, 12)}`);
    assert.deepEqual(await liveSha({ publicUrl: site.url, deployedSha: a, sleep: noSleep }), { sha: a });
    // 刚部署完还没生效：几次之后看到新 SHA 就继续
    let n = 0;
    const flipping = (async (u: string, init: RequestInit) => {
      if (++n === 3) site.set(b);
      return fetch(u, init);
    }) as typeof fetch;
    assert.deepEqual(await liveSha({ publicUrl: site.url, deployedSha: b, fetch: flipping, sleep: noSleep }), { sha: b });
  });
  assert.equal(pageHash(`<meta content="${"c".repeat(64)}" name="rh-daily-hash">`), "c".repeat(64), "属性顺序无关");
  assert.equal(pageHash(`<meta name="rh-daily-hash-x" content="${"c".repeat(64)}">`), null);
});

// ───────── 台账 ─────────

/** 假的 Actions cache（restore lookup-only：精确命中，或前缀匹配到最近保存的 key） */
class FakeCache {
  keys: string[] = [];
  lookup(key: string, prefix?: string) {
    if (this.keys.includes(key)) return { hit: true, matched: key };
    const m = prefix ? [...this.keys].reverse().find((k) => k.startsWith(prefix)) : undefined;
    return { hit: false, matched: m ?? "" };
  }
  save(key: string) {
    if (!this.keys.includes(key)) this.keys.push(key);
  }
}

/** 一次 notify 矩阵实例（daily.yml 的步骤顺序）：decide → live → verify → 查台账 → ledger → 发送 → 保存 */
async function notifyRun(o: { cache: FakeCache; site: { url: string }; liveDir: string; date: string; needs: Needs; final: boolean; notifyOnly?: boolean; force?: boolean; regenerate?: boolean; sent: string[] }) {
  const d = decide({ needs: o.needs, notifyOnly: Boolean(o.notifyOnly), final: o.final });
  if (d.action !== "proceed") return d.action;
  const live = await liveSha({ publicUrl: o.site.url, deployedSha: d.source === "deployed" ? d.deployedSha : undefined, sleep: noSleep });
  if ("refuse" in live) return "refuse";
  const v = await withPublicUrl(o.site.url, () => verifyLive({ liveRoot: o.liveDir, date: o.date, final: o.final, sleep: noSleep }));
  if (v.action !== "send") return v.action;
  const { hit, matched } = o.cache.lookup(v.key, v.prefix);
  const l = ledgerDecision({ notifyOnly: Boolean(o.notifyOnly), force: Boolean(o.force), regenerate: Boolean(o.regenerate), key: v.key, hit, matched });
  if (!l.send) return "skip";
  const card = dailyCard(cardInput(loadDaily(o.liveDir).days.find((x) => x.date === o.date)!), { publicUrl: PUBLIC_URL, variant: l.variant });
  o.sent.push(header(card.message).title.content);
  o.cache.save(v.key);
  return `sent:${l.variant}`;
}

test("台账：早一轮 degraded → 最后一轮没变化时发一次；notify job 重跑跳过；regenerate 发 Updated；notify_only 不带 force 跳过，带 force 发 Resent", async () => {
  const { root, checkout, hashAt } = liveRepo();
  const git = (...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const shaA = git("rev-parse", "HEAD~1");
  const dirA = checkout(shaA);
  const site = await fakeSite({ sha: shaA, pages: { "2026-10-17": hashAt(dirA, "2026-10-17"), "2026-10-18": hashAt(dirA, "2026-10-18") } });
  const cache = new FakeCache();
  const sent: string[] = [];
  const base = { cache, site, liveDir: dirA, sent };
  const date = "2026-10-17"; // degraded
  // 08:15：这次刚提交并部署了 degraded 的 17 号，但不是最后一轮 → 不发
  assert.equal(await notifyRun({ ...base, date, needs: needs({}, { sha: shaA, deployed: shaA }), final: false }), "skip");
  // 13:30：17 号已是终态，plan 什么都不处理（上游全部 skipped），最后一轮 → 用线上版本发一次
  assert.equal(await notifyRun({ ...base, date, needs: needs(allSkipped, { pushed: false }), final: true }), "sent:normal");
  // notify job 重跑（同样的输入）→ 台账命中，跳过
  assert.equal(await notifyRun({ ...base, date, needs: needs(allSkipped, { pushed: false }), final: true }), "skip");
  // 第二天的定时运行把 17 号当作“昨天”再看一次 → 跳过
  assert.equal(await notifyRun({ ...base, date, needs: needs(allSkipped, { pushed: false }), final: true }), "skip");
  assert.deepEqual(sent, ["📰 Daily Topics · 2026-10-17 · 2 topics"]);

  // 18 号：complete 的那一轮就发（不等最后一轮）
  assert.equal(await notifyRun({ ...base, date: "2026-10-18", needs: needs({}, { sha: shaA, deployed: shaA }), final: false }), "sent:normal");
  // regenerate 18 号：内容变了、部署了新提交 B → Updated
  const shaB = git("rev-parse", "HEAD");
  const dirB = checkout(shaB);
  const siteB = await fakeSite({ sha: shaB, pages: { "2026-10-18": hashAt(dirB, "2026-10-18") } });
  assert.equal(await notifyRun({ ...base, site: siteB, liveDir: dirB, date: "2026-10-18", needs: needs({}, { sha: shaB, deployed: shaB }), final: true, regenerate: true }), "sent:updated");
  // 内容变了但不是 regenerate（例如所有者的手动修正）：台账里同一天有另一份 → 也是 Updated
  const cache2 = new FakeCache();
  cache2.save(`lark-daily-2026-10-18-${hashAt(dirA, "2026-10-18")}`);
  assert.equal(await notifyRun({ ...base, cache: cache2, site: siteB, liveDir: dirB, date: "2026-10-18", needs: needs(allSkipped, { pushed: false }), final: true }), "sent:updated");
  // notify_only：已经发过 → 不带 force 跳过；带 force → Resent（每次都发）
  const only = { ...base, site: siteB, liveDir: dirB, date: "2026-10-18", needs: needs(allSkipped, { pushed: false }), final: true, notifyOnly: true };
  assert.equal(await notifyRun(only), "skip");
  assert.equal(await notifyRun({ ...only, force: true }), "sent:resent");
  assert.equal(await notifyRun({ ...only, force: true }), "sent:resent");
  assert.deepEqual(sent.slice(1), [
    "📰 Daily Topics · 2026-10-18 · 6 topics",
    "📰 Daily Topics · 2026-10-18 · 6 topics · Updated",
    "📰 Daily Topics · 2026-10-18 · 6 topics · Updated",
    "📰 Daily Topics · 2026-10-18 · 6 topics · Resent",
    "📰 Daily Topics · 2026-10-18 · 6 topics · Resent",
  ]);
  // force 不带 notify_only 没有作用（plan 也会把它置为 false）
  assert.deepEqual(ledgerDecision({ notifyOnly: false, force: true, regenerate: false, key: "k", hit: true, matched: "k" }).send, false);
});

// ───────── alert ─────────

test("提醒卡片：只有日期（plan 失败时 date unknown）、失败的 job 和运行链接；同一次运行同样的失败 key 相同", () => {
  const run = "https://github.com/Whisker17/research-hub/actions/runs/123456";
  const n: Needs = {
    plan: { result: "success", outputs: { dates: JSON.stringify([{ date: "2026-10-19", mode: "ingest" }]), notify: "[]", base: SHA_A } },
    ingest: { result: "success", outputs: {} },
    generate: { result: "failure", outputs: {} },
    commit: { result: "success", outputs: { pushed: "true", sha: SHA_B } },
    deploy: { result: "failure", outputs: {} },
    notify: { result: "skipped", outputs: {} },
  };
  const a = alertCard({ needs: n, runUrl: run });
  assert.deepEqual([a.dates, a.failed], [["2026-10-19"], ["generate", "deploy"]]);
  assert.equal(header(a.message).title.content, "⚠️ Daily run failed · 2026-10-19");
  assert.equal(header(a.message).template, "red");
  assert.deepEqual(buttons(a.message), [["Open the run", run]]);
  const text = cardText(a.message);
  assert.ok(!text.includes(SHA_A) && !text.includes(SHA_B), "不含其他 job 的输出");
  assert.match(a.key, /^lark-alert-2026-10-19-[0-9a-f]{64}$/);
  assert.equal(alertCard({ needs: structuredClone(n), runUrl: run }).key, a.key);
  // notify_only 的运行：没有处理的日期，用 notify 的日期
  const only = structuredClone(n);
  only.plan!.outputs = { dates: "[]", notify: JSON.stringify([{ date: "2026-10-17", final: true, regenerate: false }]) };
  assert.deepEqual(alertCard({ needs: only, runUrl: run }).dates, ["2026-10-17"]);
  // plan 失败
  const p = alertCard({ needs: { plan: { result: "failure", outputs: {} }, ingest: { result: "skipped" }, notify: { result: "skipped" } }, runUrl: run });
  assert.equal(header(p.message).title.content, "⚠️ Daily run failed · date unknown");
  assert.deepEqual(p.failed, ["plan"]);
  assert.match(p.key, /^lark-alert-unknown-/);
  // 日期只收 YYYY-MM-DD；运行链接必须是 GitHub Actions 的
  const evil = structuredClone(n);
  evil.plan!.outputs!.dates = JSON.stringify([{ date: "2026-10-19 <at id=all></at>" }, { date: "2026-10-18" }]);
  assert.deepEqual(alertCard({ needs: evil, runUrl: run }).dates, ["2026-10-18"]);
  assert.throws(() => alertCard({ needs: n, runUrl: "https://evil.example/actions/runs/1" }), /RUN_URL/);
});

test("alert 的 CLI 不需要第三方依赖：没有 node_modules 也能构建提醒卡片", () => {
  const dir = mkTmp("rh-lark-alert-");
  for (const p of ["scripts/daily-notify-plan.ts", "lib/lark.ts", "lib/config.ts"]) cpSync(join(REPO, p), join(dir, p));
  const out = join(dir, "alert.json");
  const gh = join(dir, "gh-out");
  const r = spawnSync(process.execPath, [join(dir, "scripts", "daily-notify-plan.ts"), "alert", "--out", out], {
    cwd: dir,
    encoding: "utf8",
    env: { PATH: process.env.PATH, GITHUB_OUTPUT: gh, RUN_URL: "https://github.com/o/r/actions/runs/1", NEEDS: JSON.stringify({ plan: { result: "failure", outputs: {} } }) },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(header(JSON.parse(readFileSync(out, "utf8"))).title.content, /date unknown/);
  assert.match(readFileSync(gh, "utf8"), /^key=lark-alert-unknown-[0-9a-f]{64}\n$/);
});

// ───────── workflow 结构 ─────────

type Step = { name?: string; id?: string; uses?: string; run?: string; if?: string; env?: Record<string, string>; with?: Record<string, unknown> };
type Job = { needs?: string | string[]; if?: string; permissions?: Record<string, string>; env?: Record<string, string>; steps?: Step[]; strategy?: { matrix?: Record<string, string>; "fail-fast"?: boolean }; outputs?: Record<string, string>; uses?: string };
const WF_TEXT = readFileSync(join(REPO, ".github", "workflows", "daily.yml"), "utf8");
const WF = parse(WF_TEXT) as { on: { workflow_dispatch: { inputs: Record<string, { type: string; default: unknown }> } }; concurrency: Record<string, unknown>; jobs: Record<string, Job> };
const needsOf = (j: Job) => [j.needs ?? []].flat();

test("daily.yml：notify / alert 的 needs 与 if；concurrency: daily 串行（含 notify_only 运行）；发布不依赖推送", () => {
  const { notify, alert } = WF.jobs;
  assert.deepEqual(needsOf(notify), ["plan", "ingest", "generate", "commit", "deploy"]);
  assert.match(notify.if!, /^always\(\) && needs\.plan\.result == 'success'/);
  assert.equal(notify.strategy?.["fail-fast"], false);
  assert.match(notify.strategy!.matrix!.day, /fromJSON\(needs\.plan\.outputs\.notify/);
  assert.deepEqual(needsOf(alert).sort(), ["commit", "deploy", "generate", "ingest", "notify", "plan"]);
  assert.match(alert.if!, /^failure\(\) && vars\.LARK_ALERTS != 'false'$/, "取消的运行不提醒；LARK_ALERTS 默认开启");
  assert.ok(!needsOf(alert).includes("alert"));
  // 两次重叠的运行（包括手动的 notify_only）被同一个 concurrency 组串行，后来的排队等前一次结束
  assert.deepEqual(WF.concurrency, { group: "daily", "cancel-in-progress": false });
  for (const j of Object.values(WF.jobs)) assert.ok(!("concurrency" in j), "job 级 concurrency 会绕开 daily 组");
  // Daily 发布（plan → ingest → generate → commit → deploy）不依赖 notify / alert：没有 Lark 时照常发布
  for (const name of ["plan", "ingest", "generate", "commit", "deploy"]) assert.ok(!needsOf(WF.jobs[name]).some((n) => n === "notify" || n === "alert"), name);
  assert.deepEqual(needsOf(WF.jobs.ingest), ["plan"]);
  assert.equal(WF.jobs.ingest.if, "needs.plan.outputs.any == 'true'");
  // 手动输入
  assert.deepEqual([WF.on.workflow_dispatch.inputs.notify_only, WF.on.workflow_dispatch.inputs.force].map((i) => [i.type, i.default]), [["boolean", false], ["boolean", false]]);
});

test("daily.yml：Lark 密钥只在发送那一步的 env；notify / alert 只有 contents: read，checkout 不保留凭据；日期只经过 env", () => {
  const occurrences = [...WF_TEXT.matchAll(/secrets\.LARK_[A-Z_]+/g)].map((m) => m[0]);
  assert.deepEqual(occurrences, ["secrets.LARK_WEBHOOK_URL", "secrets.LARK_SIGNING_SECRET", "secrets.LARK_WEBHOOK_URL", "secrets.LARK_SIGNING_SECRET"]);
  for (const [name, job] of Object.entries(WF.jobs)) {
    assert.ok(!JSON.stringify(job.env ?? {}).includes("LARK_"), `${name}: job 级 env 不能有 Lark 密钥`);
    for (const s of job.steps ?? []) {
      const inEnv = Object.values(s.env ?? {}).some((v) => /secrets\.LARK_/.test(v));
      assert.ok(!/secrets\.LARK_/.test(`${s.run ?? ""}${JSON.stringify(s.with ?? {})}${s.if ?? ""}`), `${name}/${s.name}: Lark 密钥只能放在 env`);
      if (inEnv) {
        assert.ok(["notify", "alert"].includes(name), name);
        assert.match(s.name!, /^Send to Lark/);
        assert.deepEqual(Object.keys(s.env!).sort(), ["LARK_SIGNING_SECRET", "LARK_WEBHOOK_URL"]);
        assert.equal(s.run, `node scripts/lark-post.ts "$RUNNER_TEMP/${name === "notify" ? "card" : "alert"}.json"`);
      }
    }
  }
  for (const name of ["notify", "alert"]) {
    const job = WF.jobs[name];
    assert.deepEqual(job.permissions, { contents: "read" }, name);
    const checkouts = job.steps!.filter((s) => s.uses?.startsWith("actions/checkout@"));
    assert.ok(checkouts.length >= 1);
    for (const c of checkouts) assert.equal(c.with?.["persist-credentials"], false, `${name}: ${c.name ?? c.uses}`);
    // 运行的脚本不插入任何来自数据的表达式：日期、SHA 都经过 env
    for (const s of job.steps!) if (s.run) assert.ok(!/\$\{\{/.test(s.run), `${name}/${s.name}: run 里不能有 \${{ }}`);
    // 台账只在确认发送后保存
    const save = job.steps!.find((s) => s.uses?.startsWith("actions/cache/save@"))!;
    assert.equal(save.if, "steps.send.outputs.sent == 'true'");
    const restore = job.steps!.find((s) => s.uses?.startsWith("actions/cache/restore@"))!;
    assert.equal(restore.with?.["lookup-only"], true);
  }
  // notify：线上版本单独 checkout 到 live/，卡片由 rh daily card 从它构建
  const steps = WF.jobs.notify.steps!;
  const order = ["decide", "live", "verify", "ledger", "plan-send", "send"].map((id) => steps.findIndex((s) => s.id === id));
  assert.deepEqual([...order].sort((x, y) => x - y), order, "步骤顺序");
  assert.ok(order.every((i) => i >= 0));
  const live = steps.find((s) => s.with?.path === "live")!;
  assert.equal(live.with!.ref, "${{ steps.live.outputs.sha }}");
  assert.ok(steps.some((s) => s.run?.startsWith("node cli/rh.ts daily card --date \"$DATE\"") && s.env?.RH_ROOT === "${{ github.workspace }}/live"));
  assert.deepEqual(WF.jobs.notify.env, {
    DATE: "${{ matrix.day.date }}",
    FINAL: "${{ matrix.day.final }}",
    REGENERATE: "${{ matrix.day.regenerate }}",
    NOTIFY_ONLY: "${{ needs.plan.outputs.notify_only }}",
    FORCE: "${{ needs.plan.outputs.force }}",
  });
  // alert 不装依赖：没有 pnpm install
  assert.ok(!WF.jobs.alert.steps!.some((s) => s.run?.includes("pnpm") || s.uses?.startsWith("pnpm/")));
  // 其他 job 没有 Lark 的任何东西
  for (const name of ["plan", "ingest", "generate", "commit"]) assert.ok(!JSON.stringify(WF.jobs[name]).includes("LARK"), name);
});

test("deploy.yml：冒烟测试（含 /build.json）通过之后才返回 deployed_sha", () => {
  const yml = parse(readFileSync(join(REPO, ".github", "workflows", "deploy.yml"), "utf8"));
  assert.equal(yml.on.workflow_call.outputs.deployed_sha.value, "${{ jobs.deploy.outputs.deployed_sha }}");
  assert.equal(yml.jobs.deploy.outputs.deployed_sha, "${{ steps.deployed.outputs.sha }}");
  const steps = yml.jobs.deploy.steps as Step[];
  const smoke = steps.findIndex((s) => s.run === "bash scripts/smoke.sh");
  const report = steps.findIndex((s) => s.id === "deployed");
  assert.ok(smoke >= 0 && report === smoke + 1 && report === steps.length - 1);
  assert.equal(steps[report].run, 'echo "sha=$SHA" >> "$GITHUB_OUTPUT"');
  assert.match(readFileSync(join(REPO, "scripts", "smoke.sh"), "utf8"), /\/build\.json" \| cmp -s - dist\/public\/build\.json/);
});

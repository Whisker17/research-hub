/**
 * Daily workflow 的确定性步骤（WHI-1937）：scripts/daily.ts（plan / context / generator / candidates / settle / stage / scope）
 * 与 scripts/daily-isolation.ts（generate job 的隔离自检：假网关的协议和判定）。全部离线：不联网、不调用 LLM。
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { stringify } from "yaml";
import { buildContext, candidateArtifactErrors, dirHash, plan, scopeErrors, settle, skillVersion, stagePaths, DailyError } from "../scripts/daily.ts";
import { EXPECTED_TOOLS, fakeGateway, probes, verdict, type Probe } from "../scripts/daily-isolation.ts";
import { skillVersion as evalSkillVersion } from "./fixtures/daily/eval/run.ts";
import { manifestSchema } from "../lib/daily.ts";

const REPO = join(import.meta.dirname, "..");
const SITE = join(REPO, "test", "fixtures", "daily-site", "daily");
const tmps: string[] = [];
const mkTmp = (p: string) => {
  const d = mkdtempSync(join(tmpdir(), p));
  tmps.push(d);
  return d;
};
after(() => tmps.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** 四种状态的 Daily 夹具（16 empty、17 degraded、18 complete、19 pending）+ 一篇公开、一篇私有报告的最小仓库，带 git。 */
function repo(): string {
  const root = mkTmp("rh-daily-wf-");
  cpSync(join(REPO, "rh.config.json"), join(root, "rh.config.json"));
  cpSync(SITE, join(root, "daily"), { recursive: true });
  writeFileSync(join(root, "tags.yml"), stringify({ tags: { ethereum: { label: "Ethereum" }, "secret-tag": { label: "Secret" } } }));
  const report = (slug: string, visibility: string, tags: string[]) => {
    const dir = join(root, "reports", "2026", "10", slug);
    mkdirSync(dir, { recursive: true });
    const meta = { title: `${slug} 标题`, summary: "摘要", created: "2026-10-01", updated: "2026-10-01", changelog: [{ date: "2026-10-01", note: "导入" }], domain: "crypto", tags, status: "published", visibility, kind: "imported", source_repo: "https://example.com/r" };
    writeFileSync(join(dir, "meta.yml"), stringify(meta));
  };
  report("glamsterdam-overview", "public", ["ethereum"]);
  report("secret-report", "private", ["secret-tag"]);
  const g = (...a: string[]) => execFileSync("git", a, { cwd: root, stdio: "pipe" });
  g("init", "-q", "-b", "main");
  g("add", "-A");
  g("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "base");
  return root;
}
const git = (root: string, ...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// ───────── plan ─────────

test("plan：定时运行处理今天，昨天不是终态时一并收尾；终态什么都不做", () => {
  const root = repo();
  // 19 pending、20 没有：两天都处理（今天在前）
  assert.deepEqual(plan(root, { event: "schedule", now: "2026-10-20T04:30:00Z" }).dates, [
    { date: "2026-10-20", mode: "ingest" },
    { date: "2026-10-19", mode: "ingest" },
  ]);
  // 19 pending、18 complete：只处理今天
  const p = plan(root, { event: "schedule", now: "2026-10-19T13:30:00Z" });
  assert.deepEqual(p.dates, [{ date: "2026-10-19", mode: "ingest" }]);
  assert.match(p.skipped[0].why, /终态（complete）/);
  // 18 complete、17 degraded：什么都不做（重复运行 = no-op）
  assert.deepEqual(plan(root, { event: "schedule", now: "2026-10-18T08:15:00Z" }).dates, []);
  // 试验分支（push）和定时运行一样
  assert.deepEqual(plan(root, { event: "push", now: "2026-10-18T08:15:00Z" }).dates, []);
  // 更早的日期定时运行不碰：21 号只看 21、20
  assert.deepEqual(plan(root, { event: "schedule", now: "2026-10-21T04:30:00Z" }).dates.map((d) => d.date), ["2026-10-21", "2026-10-20"]);
});

test("plan：手动运行只处理指定日期；终态要勾选 regenerate；不接受未来和不合法的日期", () => {
  const root = repo();
  const now = "2026-10-20T09:00:00Z";
  assert.deepEqual(plan(root, { event: "workflow_dispatch", now, date: "2026-10-18" }).dates, []);
  assert.deepEqual(plan(root, { event: "workflow_dispatch", now, date: "2026-10-18", regenerate: true }).dates, [{ date: "2026-10-18", mode: "regenerate" }]);
  assert.deepEqual(plan(root, { event: "workflow_dispatch", now, date: "2026-10-19" }).dates, [{ date: "2026-10-19", mode: "ingest" }]);
  assert.deepEqual(plan(root, { event: "workflow_dispatch", now, date: "2026-10-05" }).dates, [{ date: "2026-10-05", mode: "ingest" }], "补跑更早的日期");
  assert.deepEqual(plan(root, { event: "workflow_dispatch", now }).dates, [{ date: "2026-10-20", mode: "ingest" }], "留空 = 今天");
  assert.throws(() => plan(root, { event: "workflow_dispatch", now, date: "2026-10-21" }), DailyError);
  assert.throws(() => plan(root, { event: "workflow_dispatch", now, date: "2026-13-01" }), DailyError);
});

test("plan：daily/ 不合法时拒绝运行", () => {
  const root = repo();
  writeFileSync(join(root, "daily", "stray.txt"), "x");
  assert.throws(() => plan(root, { event: "schedule", now: "2026-10-20T04:30:00Z" }), /rh daily check/);
});

// ───────── context / generator ─────────

test("context.json 只有公开上下文：公开报告与标签、D−14..D−1 的公开投影，没有 state.yml 和 manifest 内部字段", () => {
  const root = repo();
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(join(root, "daily", "2026", "10", "19", "manifest.json"), "utf8")));
  const ctx = buildContext(root, { ...manifest, date: "2026-10-19" }) as Record<string, unknown>;
  assert.deepEqual(Object.keys(ctx).sort(), ["avoid_terms", "date", "digest", "public_reports", "public_tags", "recent_days", "schema", "window"]);
  assert.deepEqual((ctx.public_reports as { slug: string }[]).map((r) => r.slug), ["glamsterdam-overview"]);
  assert.deepEqual(Object.keys(ctx.public_tags as object), ["ethereum"]);
  assert.deepEqual((ctx.recent_days as { date: string }[]).map((d) => d.date), ["2026-10-16", "2026-10-17", "2026-10-18"]);
  assert.deepEqual(ctx.avoid_terms, ["Mantle"]);
  const text = JSON.stringify(ctx);
  for (const leak of ["secret-report", "secret-tag", "SITEFIXTURE", '"inputs_sha256"', '"sources"', '"run"', '"dropped"']) assert.ok(!text.includes(leak), `context.json 不能含 ${leak}`);
});

// R1-F1：私有 / draft 报告的 meta 一旦进了 context.json 就已经交给了模型，之后的检查撤不回来，所以打包必须失败即关闭
const CANARY = { title: "PRIVATE CANARY TITLE", summary: "PRIVATE CANARY SUMMARY", title_en: "PRIVATE CANARY EN" };
function addReport(root: string, ym: string, slug: string, over: Record<string, unknown>): void {
  const dir = join(root, "reports", ...ym.split("-"), slug);
  mkdirSync(dir, { recursive: true });
  const day = `${ym}-01`;
  writeFileSync(join(dir, "meta.yml"), stringify({ summary: "摘要", created: day, updated: day, changelog: [{ date: day, note: "导入" }], domain: "crypto", tags: ["ethereum"], kind: "imported", source_repo: "https://example.com/r", ...over }));
}
const day19 = (root: string) => join(root, "daily", "2026", "10", "19", "manifest.json");
const packCli = (root: string, out: string) =>
  spawnSync(process.execPath, [join(REPO, "scripts", "daily.ts"), "context", "--manifest", day19(root), "--out", out], { cwd: root, encoding: "utf8", env: { ...process.env, RH_ROOT: root } });

for (const [name, over] of [
  ["private", { status: "published", visibility: "private" }],
  ["draft", { status: "draft", visibility: "public" }],
] as const) {
  test(`context：${name} 报告与公开报告同 slug（不同月份目录）→ 打包失败，任何输出都没有它的 meta`, () => {
    const root = repo();
    addReport(root, "2026-09", "glamsterdam-overview", { ...CANARY, ...over });
    const manifest = manifestSchema.parse(JSON.parse(readFileSync(day19(root), "utf8")));
    assert.throws(() => buildContext(root, manifest), (e: unknown) => e instanceof DailyError && /slug 与 .* 重复/.test((e as Error).message));
    const out = join(mkTmp("rh-daily-ctx-"), "context.json");
    const r = packCli(root, out);
    assert.notEqual(r.status, 0, "context 必须非零退出");
    assert.ok(!existsSync(out), "失败时不能写出 context.json");
    for (const leak of Object.values(CANARY)) assert.ok(!`${r.stdout}${r.stderr}`.includes(leak), `输出不能含 ${leak}`);
  });
}

test("context：正常夹具只打包 public + published 报告（public draft、private 都不进）", () => {
  const root = repo();
  addReport(root, "2026-09", "public-draft", { ...CANARY, status: "draft", visibility: "public" });
  const out = join(mkTmp("rh-daily-ctx-"), "context.json");
  const r = packCli(root, out);
  assert.equal(r.status, 0, r.stderr);
  const text = readFileSync(out, "utf8");
  assert.deepEqual((JSON.parse(text).public_reports as { slug: string; title: string }[]).map((p) => [p.slug, p.title]), [["glamsterdam-overview", "glamsterdam-overview 标题"]]);
  for (const leak of [...Object.values(CANARY), "public-draft", "secret-report"]) assert.ok(!text.includes(leak), `context.json 不能含 ${leak}`);
});

test("skill_version 与目录哈希：和评估 runner、references/input.md 的 shell 算法一致", () => {
  assert.equal(skillVersion(REPO), evalSkillVersion());
  const dir = join(REPO, ".claude", "skills", "daily-topics");
  const sh = execFileSync("bash", ["-c", `cd "${dir}" && find . -type f | LC_ALL=C sort | while read -r f; do printf '%s  %s\\n' "$(openssl dgst -sha256 -r "$f" | cut -c1-64)" "$f"; done | openssl dgst -sha256 -r | cut -c1-64`], { encoding: "utf8" }).trim();
  assert.equal(dirHash(dir), sh);
});

// ───────── candidates ─────────

test("候选 artifact：顶层只能是本次要生成的日期目录，任何地方都不能有符号链接", () => {
  const dir = mkTmp("rh-daily-cand-");
  assert.deepEqual(candidateArtifactErrors(join(dir, "missing"), ["2026-10-19"]), [], "没有 artifact = 生成失败，交给 import");
  mkdirSync(join(dir, "2026-10-19"));
  writeFileSync(join(dir, "2026-10-19", "topics.yml"), "schema: 1\n");
  assert.deepEqual(candidateArtifactErrors(dir, ["2026-10-19"]), []);
  mkdirSync(join(dir, "2026-10-18"));
  writeFileSync(join(dir, "extra.txt"), "x");
  symlinkSync("/etc/hostname", join(dir, "2026-10-19", "link.yml"));
  const errors = candidateArtifactErrors(dir, ["2026-10-19"]);
  assert.equal(errors.length, 3, errors.join("\n"));
  assert.ok(errors.some((e) => e.includes("符号链接")));
});

// ───────── settle / stage / scope ─────────

test("settle：pending 的状态和原因都没变时恢复基线版本（不提交）；变了就保留", () => {
  const root = repo();
  const file = join(root, "daily", "2026", "10", "19", "manifest.json");
  const base = readFileSync(file, "utf8");
  const m = JSON.parse(base);
  writeFileSync(file, JSON.stringify({ ...m, run: { ...m.run, id: "999", at: "2026-10-19T08:15:00.000Z" }, updated_at: "2026-10-19T08:15:00.000Z" }, null, 2));
  assert.equal(settle(root, "2026-10-19", "HEAD"), true);
  assert.equal(readFileSync(file, "utf8"), base);
  writeFileSync(file, JSON.stringify({ ...m, reasons: ["digest_fetch_failed"] }, null, 2));
  assert.equal(settle(root, "2026-10-19", "HEAD"), false, "原因变了：提交");
  // 终态不受影响；基线里没有的日期（第一次 pending）要提交
  assert.equal(settle(root, "2026-10-18", "HEAD"), false);
  assert.equal(settle(root, "2026-10-25", "HEAD"), false);
});

test("stage：只 git add 本次日期的 manifest.json / topics.yml；其他任何改动都让运行失败", () => {
  const root = repo();
  const day = join(root, "daily", "2026", "10", "20");
  mkdirSync(day, { recursive: true });
  cpSync(join(root, "daily", "2026", "10", "19", "manifest.json"), join(day, "manifest.json"));
  assert.deepEqual(stagePaths(root, ["2026-10-20"]), ["daily/2026/10/20/manifest.json"]);
  assert.throws(() => stagePaths(root, ["2026-10-21"]), /不允许的改动/, "日期不在本次运行里");
  writeFileSync(join(root, "daily", "state.yml"), "schema: 1\ntopics: {}\n");
  assert.throws(() => stagePaths(root, ["2026-10-20"]), /daily\/state.yml/);
  git(root, "checkout", "--", "daily/state.yml");
  writeFileSync(join(root, "reports", "x.txt"), "x");
  assert.throws(() => stagePaths(root, ["2026-10-20"]), /reports\/x.txt/);
  rmSync(join(root, "reports", "x.txt"));
  rmSync(join(root, "daily", "2026", "10", "18", "topics.yml"));
  assert.throws(() => stagePaths(root, ["2026-10-18", "2026-10-20"]), / D daily\/2026\/10\/18\/topics.yml/, "删除也不允许");
});

test("scope：要推送的提交只能新增或修改本次日期的两个文件（rebase 之后对新基线再查）", () => {
  const root = repo();
  const base = git(root, "rev-parse", "HEAD");
  const commit = (msg: string) => git(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", msg);
  writeFileSync(join(root, "daily", "2026", "10", "19", "manifest.json"), "{}\n");
  commit("ok");
  assert.deepEqual(scopeErrors(root, base, ["2026-10-19"]), []);
  assert.deepEqual(scopeErrors(root, base, ["2026-10-20"]), ["M daily/2026/10/19/manifest.json"]);
  writeFileSync(join(root, "tags.yml"), "tags: {}\n");
  rmSync(join(root, "daily", "2026", "10", "18", "topics.yml"));
  git(root, "add", "-A");
  commit("bad");
  assert.deepEqual(scopeErrors(root, base, ["2026-10-19"]), ["D daily/2026/10/18/topics.yml", "M tags.yml"]);
});

// ───────── isolation self-check ─────────

const LIST: Probe[] = probes({ work: "/w/work", home: "/w/home", plant: "/w/planted/P.md", escape: "/w/escape.txt", parent: 42 });

function transcript(results: { is_error: boolean; content: string }[], tools = EXPECTED_TOOLS): string {
  const lines: unknown[] = [{ type: "system", subtype: "init", tools, mcp_servers: [], permissionMode: "acceptEdits" }];
  results.forEach((r, i) => {
    const id = `toolu_${String(i).padStart(3, "0")}`;
    lines.push({ type: "assistant", message: { content: [{ type: "tool_use", id, name: LIST[i].tool, input: LIST[i].input }] } });
    lines.push({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, is_error: r.is_error, content: r.content }] } });
  });
  lines.push({ type: "result", subtype: "success" });
  return lines.map((l) => JSON.stringify(l)).join("\n");
}
const expected = () => LIST.map((p) => (p.expect === "allowed" ? { is_error: false, content: "ok" } : { is_error: true, content: "denied" }));

test("隔离自检的判定：每个探测都被拒绝、对照成功、工具清单正确、canary 不出现，才算通过", () => {
  const base = { list: LIST, bodies: ["{}"], outFiles: { "probe.txt": "ok\n" }, secrets: ["CANARY-1", "CANARY-PRIVATE-2"], strayPaths: [] };
  assert.equal(verdict({ ...base, transcript: transcript(expected()) }).ok, true);
  // /proc/self/environ 读到了
  const leaked = expected();
  leaked[LIST.findIndex((p) => p.name === "read /proc/self/environ")] = { is_error: false, content: "ANTHROPIC_AUTH_TOKEN=CANARY-1" };
  const v = verdict({ ...base, transcript: transcript(leaked), bodies: ["…CANARY-1…"] });
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => p.includes("read /proc/self/environ")));
  assert.ok(v.problems.some((p) => p.includes("transcript")) && v.problems.some((p) => p.includes("request 0")));
  // 对照失败（自检本身失效）也不算通过
  const broken = expected();
  broken[0] = { is_error: true, content: "x" };
  assert.equal(verdict({ ...base, transcript: transcript(broken) }).ok, false);
  // 多了 Bash；或者探测根本没跑完
  assert.equal(verdict({ ...base, transcript: transcript(expected(), [...EXPECTED_TOOLS, "Bash"]) }).ok, false);
  assert.equal(verdict({ ...base, transcript: transcript(expected().slice(0, 3)) }).ok, false);
  // Glob 的 ../ 模式：成功但什么都没找到也行；找到了东西就不行
  const i = LIST.findIndex((p) => p.expect === "empty");
  const empty = expected();
  empty[i] = { is_error: false, content: "No files found" };
  assert.equal(verdict({ ...base, transcript: transcript(empty) }).ok, true);
  empty[i] = { is_error: false, content: "/w/planted/P.md" };
  assert.equal(verdict({ ...base, transcript: transcript(empty) }).ok, false);
  // 工作目录外出现了文件、out/ 里有 canary
  assert.equal(verdict({ ...base, transcript: transcript(expected()), strayPaths: ["/w/escape.txt"] }).ok, false);
  assert.equal(verdict({ ...base, transcript: transcript(expected()), outFiles: { "topics.yml": "CANARY-PRIVATE-2" } }).ok, false);
});

test("假网关：按收到的 tool_result 个数逐个发出探测调用（SSE），没有 tools 的请求回一句文字", async () => {
  const bodies: string[] = [];
  const server = fakeGateway(() => LIST, bodies);
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as { port: number }).port;
  const post = (body: unknown) =>
    new Promise<string>((ok, fail) => {
      const req = request({ host: "127.0.0.1", port, method: "POST", path: "/v1/messages?beta=true", headers: { "content-type": "application/json" } }, (res) => {
        let s = "";
        res.on("data", (c) => (s += c));
        res.on("end", () => ok(s));
      });
      req.on("error", fail);
      req.end(JSON.stringify(body));
    });
  try {
    const first = await post({ stream: true, tools: [{}], messages: [{ role: "user", content: "x" }] });
    assert.match(first, /"name":"Read"/);
    assert.ok(first.includes(JSON.stringify(JSON.stringify(LIST[0].input)).slice(1, -1)), "第一个探测的输入");
    assert.match(first, /"stop_reason":"tool_use"/);
    const msgs = [{ role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_000" }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_001" }] }];
    assert.match(await post({ stream: true, tools: [{}], messages: msgs }), /"id":"toolu_002"/);
    const done = JSON.parse(await post({ stream: false, tools: [{}], messages: LIST.map((_, i) => ({ role: "user", content: [{ type: "tool_result", tool_use_id: `toolu_${i}` }] })) }));
    assert.equal(done.stop_reason, "end_turn");
    assert.equal(JSON.parse(await post({ stream: false, messages: [] })).content[0].text, "done");
    assert.equal(bodies.length, 4);
  } finally {
    server.close();
  }
});

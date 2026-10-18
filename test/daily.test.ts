/**
 * Daily Topics 的数据模型、rh daily import 与 rh daily check（WHI-1929，ADR 0004）。
 * 条目来自 WHI-1925 的真实样本（test/fixtures/daily/ethtao、sources）；候选是 test/fixtures/daily/candidate/topics.yml。
 * 全部离线：不联网、不调用 LLM（probe 的测试只连 127.0.0.1）。
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { parse, stringify } from "yaml";
import { probeUrl } from "../cli/commands/daily.ts";
import { loadConfig } from "../lib/config.ts";
import {
  TOPIC_TRANSITIONS,
  checkDaily,
  copiesVerbatim,
  dailyForbidden,
  dailyWindow,
  importCandidate,
  independentSources,
  itemMeta,
  itemSchema,
  loadDaily,
  loadDailyContext,
  originator,
  publicDay,
  resolveStatus,
  topicId,
  transitionError,
  type Item,
  type ItemMeta,
} from "../lib/daily.ts";
import { isHttpUrl } from "../lib/daily.ts";

const REPO = join(import.meta.dirname, "..");
const FX = join(REPO, "test", "fixtures", "daily");
const CANDIDATE = join(FX, "candidate");
const DATE = "2026-10-18";
const DAY = join("daily", "2026", "10", "18");
const tmps: string[] = [];
const mkTmp = (p: string) => {
  const d = mkdtempSync(join(tmpdir(), p));
  tmps.push(d);
  return d;
};
after(() => tmps.forEach((d) => rmSync(d, { recursive: true, force: true })));

// ───────── 夹具：把 WHI-1925 的样本规范化成 items.jsonl 的条目（WHI-1931 的 rh ingest 会做同样的事） ─────────

const digest = JSON.parse(readFileSync(join(FX, "ethtao", `${DATE}.json`), "utf8"));

function fixtureItems(): Map<string, Item> {
  const items = new Map<string, Item>();
  const add = (it: Item) => items.set(it.id, itemSchema.parse(it) as Item);
  for (const s of digest.expected.sections) {
    for (const it of s.items) {
      for (const r of it.refs) {
        const h = r.hop;
        add({
          id: `ethtao:${h.resolved_id}`,
          source: "ethtao",
          url: h.resolved_url,
          origin_url: h.external_url,
          title: h.is_article ? h.article_title : null,
          author: h.author,
          reposted_by: h.reposted_by,
          via: digest.expected.url,
          published_at: h.created_at,
          fetched_at: digest.runner_fetched_at,
          incomplete: h.is_article,
          excerpt: h.excerpt.slice(0, 400),
        });
      }
    }
  }
  for (const [file, source] of [["ethresearch-latest", "ethresearch"], ["magicians-latest", "magicians"], ["theblock-rss", "theblock"], ["odaily-newsflash", "odaily"]] as const) {
    const d = JSON.parse(readFileSync(join(FX, "sources", `${file}.json`), "utf8"));
    for (const x of d.items) {
      const origin = typeof x.origin_url === "string" ? x.origin_url.trim() : null; // 真实样本里有前导空格
      add({
        id: `${source}:${/(\d+)\/?$/.exec(x.url)![1]}`,
        source,
        url: x.url,
        origin_url: origin && isHttpUrl(origin) ? origin : null,
        title: x.title,
        author: null,
        reposted_by: null,
        via: null,
        published_at: new Date(x.published_at).toISOString(),
        fetched_at: d.fetched_at,
        incomplete: false,
        excerpt: "",
      });
    }
  }
  return items;
}

const ITEMS = fixtureItems();
const META: Record<string, ItemMeta> = Object.fromEntries([...ITEMS].map(([k, v]) => [k, itemMeta(v)]));

function ingestManifest(over: Record<string, unknown> = {}) {
  return {
    schema: 1,
    date: DATE,
    status: "pending",
    reasons: [],
    window: dailyWindow(DATE),
    digest: { status: "found", url: digest.expected.url, posted_at: digest.expected.posted_at },
    sources: [
      { id: "ethtao", status: "ok", items: 17, calls: 19, covered: null, error: null },
      { id: "blockbeats", status: "skipped", items: 0, calls: 0, covered: null, error: "blockbeats budget exhausted for the day" },
    ],
    counts: { items: 0, cited_items: 0, topics: 0, dropped: 0, warnings: 0 },
    dropped: [],
    generator: { skill_version: "daily-topics@0.1.0-fixture", model: "claude-sonnet-5-5", inputs_sha256: "5e".repeat(32) },
    run: { id: "18700000001", attempt: 1, at: "2026-10-18T04:31:07.000Z" },
    generated_at: null,
    updated_at: "2026-10-18T04:31:07.000Z",
    ...over,
  };
}

/** 临时仓库：rh.config.json、tags.yml，以及 public / private / draft 三种报告。 */
function makeRoot(cfgOver: Record<string, unknown> = {}): string {
  const root = mkTmp("rh-daily-");
  const cfg = JSON.parse(readFileSync(join(REPO, "rh.config.json"), "utf8"));
  writeFileSync(join(root, "rh.config.json"), JSON.stringify({ ...cfg, ...cfgOver }));
  writeFileSync(join(root, "tags.yml"), stringify({ tags: { ethereum: { label: "Ethereum" }, "secret-tag": { label: "Secret", description: "只用于私有报告" } } }));
  const report = (slug: string, meta: Record<string, unknown>) => {
    const dir = join(root, "reports", "2026", "10", slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "meta.yml"),
      stringify({ title: `标题 ${slug}`, summary: "摘要", created: "2026-10-01", updated: "2026-10-01", changelog: [{ date: "2026-10-01", note: "导入" }], domain: "crypto", tags: [], status: "published", visibility: "public", kind: "imported", source_repo: "https://example.com/r", ...meta }),
    );
  };
  report("glamsterdam-overview", { tags: ["ethereum"] });
  report("secret-report", { visibility: "private", tags: ["secret-tag"] });
  report("draft-report", { status: "draft" });
  return root;
}

const rh = (root: string, ...args: string[]) => {
  const r = spawnSync(process.execPath, [join(REPO, "cli", "rh.ts"), ...args], { cwd: root, encoding: "utf8", env: { ...process.env, RH_ROOT: root, NO_COLOR: "1" } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

/** 写 ingest 的输入（manifest + items.jsonl），返回给 rh daily import 的参数。 */
function ingestInputs(over: Record<string, unknown> = {}, items: Map<string, Item> = ITEMS): string[] {
  const dir = mkTmp("rh-ingest-");
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(ingestManifest(over)));
  writeFileSync(join(dir, "items.jsonl"), [...items.values()].map((i) => JSON.stringify(i)).join("\n") + "\n");
  return ["--manifest", join(dir, "manifest.json"), "--items", join(dir, "items.jsonl")];
}

/** 改一份候选：mutate 拿到解析后的 YAML 文档。 */
function candidate(mutate: (doc: { date: string; note?: string; topics: Record<string, any>[] }) => void = () => {}): string {
  const dir = mkTmp("rh-cand-");
  const doc = parse(readFileSync(join(CANDIDATE, "topics.yml"), "utf8"));
  mutate(doc);
  writeFileSync(join(dir, "topics.yml"), stringify(doc, { aliasDuplicateObjects: false }));
  return dir;
}

const ctxOf = (root: string) => loadDailyContext(root, ["Mantle"]);

/** 导入夹具候选后的仓库。 */
function importedRoot(): string {
  const root = makeRoot();
  const r = rh(root, "daily", "import", DATE, ...ingestInputs(), "--candidate", CANDIDATE);
  assert.equal(r.code, 0, r.out);
  return root;
}

const readTopics = (root: string) => parse(readFileSync(join(root, DAY, "topics.yml"), "utf8"));
const writeTopics = (root: string, doc: unknown) => writeFileSync(join(root, DAY, "topics.yml"), stringify(doc, { lineWidth: 0, aliasDuplicateObjects: false }));
const checkErrors = (root: string) => checkDaily(root, ctxOf(root)).errors;

// ───────────────────────── 导入与确定性 ─────────────────────────

test("夹具候选导入后是 complete：rh 填 id / evidence / items，rh daily check 通过", () => {
  const root = importedRoot();
  const m = JSON.parse(readFileSync(join(root, DAY, "manifest.json"), "utf8"));
  assert.equal(m.status, "complete");
  assert.deepEqual(m.reasons, []);
  assert.equal(m.counts.topics, 6);
  assert.equal(m.counts.dropped, 0);
  assert.equal(m.counts.items, ITEMS.size);
  assert.equal(m.generated_at, "2026-10-18T04:31:07.000Z");
  const t = readTopics(root);
  for (const topic of t.topics) assert.match(topic.id, /^2026-10-18-[0-9a-f]{6}$/);
  assert.equal(t.topics[0].id, topicId(DATE, t.topics[0].references));
  // 默认类型：日报二跳的 X 帖子 → secondary，论坛 → primary
  assert.equal(t.topics[0].references[1].type, "secondary");
  assert.equal(t.topics[1].references[0].type, "primary");
  // items 只收被引用的条目，不存摘录
  assert.equal(Object.keys(t.items).length, m.counts.cited_items);
  assert.ok(!readFileSync(join(root, DAY, "topics.yml"), "utf8").includes("excerpt"));
  const r = rh(root, "daily", "check");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /daily 检查通过（1 天，6 个 topic/);
});

test("确定性：同样的输入导入两次，字节完全相同；check 两次输出相同", () => {
  const a = importedRoot();
  const b = importedRoot();
  for (const f of ["manifest.json", "topics.yml"]) assert.equal(readFileSync(join(a, DAY, f), "utf8"), readFileSync(join(b, DAY, f), "utf8"), f);
  assert.equal(rh(a, "daily", "check").out, rh(a, "daily", "check").out);
  const before = readFileSync(join(a, DAY, "topics.yml"), "utf8");
  assert.equal(rh(a, "daily", "import", DATE, ...ingestInputs(), "--candidate", CANDIDATE, "--regenerate").code, 0);
  assert.equal(readFileSync(join(a, DAY, "topics.yml"), "utf8"), before);
});

test("没有 daily/ 时 rh daily check 通过", () => {
  const root = makeRoot();
  const r = rh(root, "daily", "check");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /daily 检查通过（0 天/);
});

// ───────────────────────── 验收：每种拒绝各一个测试 ─────────────────────────

test("拒绝重复 id：两个 topic 引用完全相同（check 报错；import 丢弃后一个）", () => {
  const root = importedRoot();
  const t = readTopics(root);
  t.topics[1] = { ...t.topics[1], references: t.topics[0].references, id: t.topics[0].id, evidence: t.topics[0].evidence };
  writeTopics(root, t);
  assert.ok(checkErrors(root).some((e) => e.includes("重复")), checkErrors(root).join("\n"));

  const res = importCandidate(DATE, candidate((d) => d.topics.push({ ...d.topics[0], title: "换了措辞的同一个 topic" })), ITEMS, ctxOf(root));
  assert.deepEqual(res.dropped.map((x) => [x.topic, x.reason]), [[6, "duplicate_topic"]]);
});

test("拒绝伪造的引用：item_id 不在 ingest 的条目里（import 丢弃；check 报错）", () => {
  const root = makeRoot();
  const res = importCandidate(DATE, candidate((d) => (d.topics[2].references = [{ item_id: "magicians:99999999" }])), ITEMS, ctxOf(root));
  assert.equal(res.rejected, null);
  assert.deepEqual(res.dropped.map((x) => [x.topic, x.reason]), [[2, "forged_reference"]]);
  assert.equal(res.topics!.topics.length, 5);

  const done = importedRoot();
  const t = readTopics(done);
  t.topics[2].references = [{ item_id: "magicians:99999999", type: "primary" }];
  t.topics[2].id = topicId(DATE, t.topics[2].references);
  writeTopics(done, t);
  assert.ok(checkErrors(done).some((e) => e.includes("magicians:99999999 不存在")), checkErrors(done).join("\n"));
});

test("拒绝不合法的 URL：候选里非 http(s) 的 extra 让整个候选被拒绝；已提交的条目 URL 也要是 http(s)", () => {
  const root = makeRoot();
  const res = importCandidate(DATE, candidate((d) => d.topics[5].references.push({ extra: "javascript:alert(1)" })), ITEMS, ctxOf(root));
  assert.ok(res.rejected?.some((e) => e.includes("http(s)")), String(res.rejected));
  const r = rh(root, "daily", "import", DATE, ...ingestInputs(), "--candidate", candidate((d) => d.topics[0].references.push({ extra: "ftp://example.com/x" })));
  assert.equal(r.code, 0, r.out);
  const m = JSON.parse(readFileSync(join(root, DAY, "manifest.json"), "utf8"));
  assert.equal(m.status, "pending");
  assert.deepEqual(m.reasons, ["candidate_rejected"]);
  assert.ok(!existsSync(join(root, DAY, "topics.yml")));

  const done = importedRoot();
  const t = readTopics(done);
  t.items["ethresearch:26157"].url = "ftp://ethresear.ch/t/26157";
  writeTopics(done, t);
  assert.ok(checkErrors(done).some((e) => e.includes("http(s)")), checkErrors(done).join("\n"));
});

test("拒绝指向私有报告的 related（draft 与不存在的也不行）", () => {
  const root = makeRoot();
  const res = importCandidate(
    DATE,
    candidate((d) => {
      d.topics[0].novelty.related = ["secret-report"];
      d.topics[1].novelty = { kind: "update", related: ["draft-report"] };
      d.topics[2].novelty = { kind: "update", related: [] };
    }),
    ITEMS,
    ctxOf(root),
  );
  assert.deepEqual(res.dropped.map((x) => [x.topic, x.reason]), [[0, "related"], [1, "related"], [2, "related"]]);

  const done = importedRoot();
  const t = readTopics(done);
  t.topics[0].novelty.related = ["secret-report"];
  writeTopics(done, t);
  assert.ok(checkErrors(done).some((e) => e.includes("secret-report 不是 public + published 报告")), checkErrors(done).join("\n"));
});

function gitRepo(root: string): (...a: string[]) => string {
  const g = (...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...a], { cwd: root, encoding: "utf8" });
  g("init", "-q");
  g("add", "-A");
  g("commit", "-q", "-m", "base");
  return g;
}

test("拒绝生成器（workflow）改动人工状态：--workflow 下 state.yml 必须和 base 完全一样", () => {
  const root = importedRoot();
  const ids = readTopics(root).topics.map((t: { id: string }) => t.id);
  writeFileSync(join(root, "daily", "state.yml"), stringify({ schema: 1, topics: { [ids[0]]: { state: "selected", at: "2026-10-19" } } }));
  gitRepo(root);
  assert.equal(rh(root, "daily", "check", "--base", "HEAD", "--workflow").code, 0);

  writeFileSync(join(root, "daily", "state.yml"), stringify({ schema: 1, topics: { [ids[0]]: { state: "dismissed", at: "2026-10-19", reason: "生成器写的" } } }));
  const r = rh(root, "daily", "check", "--base", "HEAD", "--workflow");
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /workflow 的提交不能改动人工状态/);
  // 同样的改动由所有者（rh topic）做是合法转移 selected → dismissed
  assert.equal(rh(root, "daily", "check", "--base", "HEAD").code, 0);
  // workflow 也不能新建 state.yml
  rmSync(join(root, "daily", "state.yml"));
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "commit", "-qam", "rm state"], { cwd: root });
  writeFileSync(join(root, "daily", "state.yml"), stringify({ schema: 1, topics: {} }));
  assert.equal(rh(root, "daily", "check", "--base", "HEAD", "--workflow").code, 1);
  assert.equal(rh(root, "daily", "check", "--base", "no-such-ref").code, 1);
});

test("拒绝符号链接：候选目录里的符号链接，以及 daily/ 里的符号链接", () => {
  const root = makeRoot();
  const dir = mkTmp("rh-cand-");
  symlinkSync(join(CANDIDATE, "topics.yml"), join(dir, "topics.yml"));
  assert.deepEqual(importCandidate(DATE, dir, ITEMS, ctxOf(root)).rejected, ["topics.yml 是符号链接"]);
  const linkDir = join(mkTmp("rh-cand-"), "c");
  symlinkSync(CANDIDATE, linkDir);
  assert.deepEqual(importCandidate(DATE, linkDir, ITEMS, ctxOf(root)).rejected, ["候选目录是符号链接"]);

  const done = importedRoot();
  const real = join(mkTmp("rh-outside-"), "topics.yml");
  cpSync(join(done, DAY, "topics.yml"), real);
  rmSync(join(done, DAY, "topics.yml"));
  symlinkSync(real, join(done, DAY, "topics.yml"));
  assert.ok(checkErrors(done).some((e) => e.includes("不允许符号链接")), checkErrors(done).join("\n"));
  // import 也不往符号链接的目录里写
  const r = rh(done, "daily", "import", DATE, ...ingestInputs(), "--candidate", CANDIDATE, "--regenerate");
  assert.equal(r.code, 0, r.out); // 日期目录本身不是链接，可以写；把 daily/ 换成链接再试
  const other = makeRoot();
  const outside = mkTmp("rh-outside-");
  symlinkSync(outside, join(other, "daily"));
  const r2 = rh(other, "daily", "import", DATE, ...ingestInputs(), "--candidate", CANDIDATE);
  assert.equal(r2.code, 1, r2.out);
  assert.match(r2.out, /daily 是符号链接，拒绝写入/);
  assert.ok(!existsSync(join(outside, "2026")));
});

test("拒绝多余的文件：候选目录里的多余文件，以及 daily/ 里的多余文件", () => {
  const root = makeRoot();
  const dir = candidate();
  writeFileSync(join(dir, "state.yml"), "schema: 1\ntopics: {}\n");
  assert.deepEqual(importCandidate(DATE, dir, ITEMS, ctxOf(root)).rejected, ["候选目录里有多余的文件：state.yml"]);
  const sub = candidate();
  mkdirSync(join(sub, "nested"));
  assert.ok(importCandidate(DATE, sub, ITEMS, ctxOf(root)).rejected?.some((e) => e.includes("nested")));

  const done = importedRoot();
  writeFileSync(join(done, DAY, "items.jsonl"), "{}\n");
  writeFileSync(join(done, "daily", "README.md"), "x");
  const errs = checkErrors(done);
  assert.ok(errs.some((e) => e.startsWith("daily/2026/10/18/items.jsonl: 多余的文件")), errs.join("\n"));
  assert.ok(errs.some((e) => e.startsWith("daily/README.md: 多余的文件")), errs.join("\n"));
});

// ───────────────────────── independent_sources ─────────────────────────

test("independent_sources：几个作者转发同一条公告只算 1 个出处（真实样本 2026-10-18）", () => {
  // #1 是 @nero_eth 转推的 @ralexstokes 原帖，#2 是 @barnabemonnot 的帖子；两条都链接 blog.ethereum.org 的同一篇公告
  const ralex = META["ethtao:2111165223780454451"];
  const barnabe = META["ethtao:2111527644223127741"];
  assert.equal(ralex.author, "ralexstokes");
  assert.equal(ralex.reposted_by, "nero_eth");
  assert.equal(barnabe.author, "barnabemonnot");
  assert.equal(originator(ralex), "blog.ethereum.org");
  assert.equal(originator(barnabe), "blog.ethereum.org");
  const ref = (item_id: string) => ({ item_id, type: "secondary" as const });
  assert.equal(independentSources([ref("ethtao:2111165223780454451"), ref("ethtao:2111527644223127741")], META), 1);
  // 一个快讯也转述同一篇公告（origin_url 指向它）：仍然是 1
  const wire: ItemMeta = { ...META["odaily:525462"], origin_url: "https://www.blog.ethereum.org/2026/10/16/glamsterdam-hoodi-announcement" };
  assert.equal(independentSources([ref("a:1"), ref("b:1"), ref("c:1")], { "a:1": ralex, "b:1": barnabe, "c:1": wire }), 1);
  // 转推按原帖作者计，不按转推人：没有外链的两条不同作者的帖子算 2，同一作者算 1
  const nero = META["ethtao:2111437146758291705"];
  const asanso = META["ethtao:2111414176597913753"];
  assert.equal(independentSources([ref("ethtao:2111437146758291705"), ref("ethtao:2111414176597913753")], META), 2);
  assert.equal(independentSources([ref("x:1"), ref("x:2")], { "x:1": nero, "x:2": { ...asanso, author: "Nero_ETH", reposted_by: "someone" } }), 1);
  // 同一个论坛里不同作者的帖子只算一个；聚合快讯没有出处链接计 0；extra 不计
  assert.equal(independentSources([ref("ethresearch:26157"), ref("ethresearch:26152")], META), 1);
  assert.equal(originator(META["odaily:525460"]), null);
  assert.equal(independentSources([ref("odaily:525460"), { extra: "https://example.com/a", type: "primary" }], META), 0);
  // Odaily 的 origin_url 是 X 帖子：按账号 x:<handle>
  assert.equal(originator(META["odaily:525462"]), "x:colemacro");
  // 导入后的值等于重新计算
  const root = importedRoot();
  assert.equal(readTopics(root).topics[0].evidence.independent_sources, 2); // blog.ethereum.org + ethereum-magicians.org
});

// ───────────────────────── 其他规则 ─────────────────────────

test("证据规则：只有一条 secondary 的 topic 被丢弃；上调成 primary 必须写 note", () => {
  const root = makeRoot();
  const res = importCandidate(
    DATE,
    candidate((d) => {
      d.topics[5].references = [{ item_id: "ethtao:2111440953944994000" }];
      d.topics[4].references = [{ item_id: "ethtao:2111414176597913753", type: "primary" }];
    }),
    ITEMS,
    ctxOf(root),
  );
  assert.deepEqual(res.dropped.map((x) => [x.topic, x.reason]), [[4, "primary_note"], [5, "evidence"]]);
});

test("标签：tags 必须在公开标签投影里（私有报告的标签不行）；proposed_tags 不能和公开标签重复", () => {
  const root = makeRoot();
  const res = importCandidate(
    DATE,
    candidate((d) => {
      d.topics[0].tags = ["secret-tag"];
      d.topics[1].tags = ["not-registered"];
      d.topics[2].proposed_tags = ["ethereum"];
      d.topics[3].proposed_tags = ["secret-tag"]; // 和私有标签同名的 proposed_tag 合法（只当普通 chip 显示）
    }),
    ITEMS,
    ctxOf(root),
  );
  assert.deepEqual(res.dropped.map((x) => [x.topic, x.reason]), [[0, "tag"], [1, "tag"], [2, "proposed_tag"]]);
});

test("schema：domain 只能是 crypto；候选不能自带 id / evidence；topic 不超过 10 个", () => {
  const root = makeRoot();
  const res = importCandidate(
    DATE,
    candidate((d) => {
      d.topics[0].domain = "ai";
      d.topics[1].id = "2026-10-18-000000";
      d.topics[2].evidence = { independent_sources: 9 };
      d.topics[3].questions = ["1", "2", "3", "4"];
    }),
    ITEMS,
    ctxOf(root),
  );
  assert.deepEqual(res.dropped.map((x) => [x.topic, x.reason]), [[0, "schema"], [1, "schema"], [2, "schema"], [3, "schema"]]);
  const many = importCandidate(DATE, candidate((d) => (d.topics = Array.from({ length: 11 }, () => d.topics[1]))), ITEMS, ctxOf(root));
  assert.ok(many.rejected?.some((e) => e.includes("topics")), String(many.rejected));
  const wrongDate = importCandidate(DATE, candidate((d) => (d.date = "2026-10-17")), ITEMS, ctxOf(root));
  assert.ok(wrongDate.rejected?.[0].includes("2026-10-17"));
});

test("转载：公开文字和被引用条目的摘录有连续 50 个以上相同字符时丢弃；标题不算", () => {
  const ex = ITEMS.get("ethtao:2111165223780454451")!.excerpt;
  assert.ok(copiesVerbatim(`我们注意到：${ex.slice(30, 85)}。`, [{ title: null, excerpt: ex }]));
  assert.ok(!copiesVerbatim(ex.slice(30, 75), [{ title: null, excerpt: ex }])); // 45 个字符
  assert.ok(copiesVerbatim(ex.slice(0, 60).replace(/ /g, "\n  "), [{ title: null, excerpt: ex }])); // 空白先规范化
  const title = "A".repeat(60);
  assert.ok(!copiesVerbatim(title, [{ title, excerpt: `${title} 之后的正文` }]));
  const root = makeRoot();
  const res = importCandidate(DATE, candidate((d) => (d.topics[0].angle = ex.slice(0, 80))), ITEMS, ctxOf(root));
  assert.deepEqual(res.dropped.map((x) => [x.topic, x.reason]), [[0, "verbatim"]]);
  const note = importCandidate(DATE, candidate((d) => (d.note = ex.slice(0, 80))), ITEMS, ctxOf(root));
  assert.deepEqual(note.rejected, ["当天的 note 转载了条目摘录"]);
});

test("dailyAvoidTerms 只给警告，不报错", () => {
  const root = makeRoot();
  const res = importCandidate(DATE, candidate((d) => (d.topics[1].angle = "顺便看看 mantle 能怎么用")), ITEMS, ctxOf(root));
  assert.equal(res.dropped.length, 0);
  assert.equal(res.warnings.length, 1);
  assert.match(res.warnings[0], /Mantle/);
});

test("check 重新计算 id 与 evidence：不一致就报错；items 不能有没被引用的条目", () => {
  const root = importedRoot();
  const t = readTopics(root);
  t.topics[0].references = t.topics[0].references.slice(0, 2);
  t.topics[1].evidence.independent_sources = 5;
  t.items["theblock:418802"] = META["theblock:418802"];
  writeTopics(root, t);
  const errs = checkErrors(root);
  assert.ok(errs.some((e) => e.includes("topics[0]") && e.includes("id 应该是")), errs.join("\n"));
  assert.ok(errs.some((e) => e.includes("topics[1]") && e.includes("independent_sources 应该是 1")), errs.join("\n"));
  assert.ok(errs.some((e) => e.includes("theblock:418802 没有被任何 topic 引用")), errs.join("\n"));
});

test("X Article 预览必须标成 incomplete；item_id 前缀必须是 source", () => {
  const post = ITEMS.get("ethtao:2111527644223127741")!;
  assert.ok(!itemSchema.safeParse({ ...post, title: "Some X Article" }).success);
  assert.ok(itemSchema.safeParse({ ...post, title: "Some X Article", incomplete: true }).success);
  assert.ok(!itemSchema.safeParse({ ...post, incomplete: true }).success);
  assert.ok(!itemSchema.safeParse({ ...post, id: "odaily:1" }).success);
});

test("manifest：状态和数量必须一致；pending 不能有 topics.yml", () => {
  const root = importedRoot();
  const file = join(root, DAY, "manifest.json");
  const m = JSON.parse(readFileSync(file, "utf8"));
  writeFileSync(file, JSON.stringify({ ...m, status: "pending" }));
  assert.ok(checkErrors(root).some((e) => e.includes("pending 时不能有 topics.yml")));
  writeFileSync(file, JSON.stringify({ ...m, counts: { ...m.counts, topics: 3 } }));
  assert.ok(checkErrors(root).some((e) => e.includes("counts.topics")));
  writeFileSync(file, JSON.stringify({ ...m, window: { from: "2026-10-18T00:00:00.000Z", to: "2026-10-19T00:00:00.000Z" } }));
  assert.ok(checkErrors(root).some((e) => e.includes("window")));
});

// ───────────────────────── 状态机 ─────────────────────────

test("日期状态表（ADR 0004 §5）", () => {
  const s = (digest: "found" | "not_posted" | "fetch_failed", late: boolean, items: number, outcome: number | "failed" | "rejected" | "skipped") => {
    const r = resolveStatus({ digest, late, items, outcome });
    return `${r.status}${r.reasons.length ? `:${r.reasons.join(",")}` : ""}`;
  };
  assert.equal(s("found", false, 50, 6), "complete");
  assert.equal(s("found", false, 50, 3), "degraded:few_topics");
  assert.equal(s("found", false, 50, 0), "empty:no_qualifying_topic");
  assert.equal(s("not_posted", false, 50, "skipped"), "pending:digest_not_posted");
  assert.equal(s("fetch_failed", false, 50, "skipped"), "pending:digest_fetch_failed");
  assert.equal(s("found", false, 50, "failed"), "pending:generator_failed");
  assert.equal(s("found", false, 50, "rejected"), "pending:candidate_rejected");
  assert.equal(s("not_posted", true, 50, 7), "degraded:digest_not_posted");
  assert.equal(s("not_posted", true, 50, 2), "degraded:digest_not_posted,few_topics");
  assert.equal(s("not_posted", true, 50, 0), "empty:digest_not_posted,no_qualifying_topic");
  assert.equal(s("found", true, 50, "failed"), "empty:generator_failed");
  assert.equal(s("not_posted", true, 50, "rejected"), "empty:digest_not_posted,candidate_rejected");
  assert.equal(s("not_posted", false, 0, "skipped"), "pending:digest_not_posted,no_items");
  assert.equal(s("not_posted", true, 0, "skipped"), "empty:digest_not_posted,no_items");
});

test("rh daily import：T_last 之前没有日报不能导入候选；终态不重做；regenerate 失败保留原结果", () => {
  const root = makeRoot();
  const early = ingestInputs({ digest: { status: "not_posted", url: null, posted_at: null } });
  assert.equal(rh(root, "daily", "import", DATE, ...early, "--candidate", CANDIDATE).code, 1);
  assert.equal(rh(root, "daily", "import", DATE, ...early).code, 0);
  assert.equal(JSON.parse(readFileSync(join(root, DAY, "manifest.json"), "utf8")).status, "pending");
  assert.equal(rh(root, "daily", "check").code, 0);
  // 13:30 之后：只用其他源生成
  const late = ingestInputs({ digest: { status: "not_posted", url: null, posted_at: null }, run: { id: "18700000002", attempt: 1, at: "2026-10-18T13:31:00.000Z" } });
  assert.equal(rh(root, "daily", "import", DATE, ...late, "--candidate", CANDIDATE).code, 0);
  const m = JSON.parse(readFileSync(join(root, DAY, "manifest.json"), "utf8"));
  assert.deepEqual([m.status, m.reasons], ["degraded", ["digest_not_posted"]]);
  assert.equal(rh(root, "daily", "check").code, 0);
  const before = readFileSync(join(root, DAY, "topics.yml"), "utf8");
  // 终态：计划运行什么都不做
  const again = rh(root, "daily", "import", DATE, ...late);
  assert.equal(again.code, 0);
  assert.match(again.out, /已是终态/);
  // regenerate 但候选被拒绝：保留原结果
  const bad = rh(root, "daily", "import", DATE, ...late, "--candidate", candidate((d) => (d.date = "2026-10-17")), "--regenerate");
  assert.equal(bad.code, 3, bad.out);
  assert.equal(readFileSync(join(root, DAY, "topics.yml"), "utf8"), before);
  // 收尾时生成失败：empty，有空的 topics.yml
  const other = makeRoot();
  assert.equal(rh(other, "daily", "import", DATE, ...late).code, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(other, DAY, "manifest.json"), "utf8")).reasons, ["digest_not_posted", "generator_failed"]);
  assert.deepEqual(readTopics(other).topics, []);
  assert.equal(rh(other, "daily", "check").code, 0);
});

test("人工状态的转移（ADR 0004 §9）", () => {
  assert.deepEqual(TOPIC_TRANSITIONS, { none: ["selected", "dismissed"], selected: ["linked", "dismissed"], dismissed: ["selected"], linked: [] });
  const sel = { state: "selected", at: "2026-10-19" } as const;
  const dis = { state: "dismissed", at: "2026-10-19", reason: "纯行情" } as const;
  const lnk = (report: string) => ({ state: "linked", at: "2026-10-20", report }) as const;
  assert.equal(transitionError(undefined, sel), null);
  assert.equal(transitionError(sel, lnk("a")), null);
  assert.equal(transitionError(dis, sel), null);
  assert.equal(transitionError(sel, sel), null); // 幂等
  assert.equal(transitionError(lnk("a"), lnk("a")), null);
  assert.match(transitionError(lnk("a"), lnk("b"))!, /不能改 link/);
  assert.match(transitionError(lnk("a"), sel)!, /linked → selected/);
  assert.match(transitionError(undefined, lnk("a"))!, /none → linked/);
  assert.match(transitionError(dis, lnk("a"))!, /dismissed → linked/);
  assert.match(transitionError(sel, undefined)!, /不能删除/);
});

test("state.yml 的不变量：id 必须存在、linked 的报告必须存在（draft 也可以）、dismissed 必须有理由；--base 检查转移", () => {
  const root = importedRoot();
  const [id] = readTopics(root).topics.map((t: { id: string }) => t.id);
  const write = (topics: unknown) => writeFileSync(join(root, "daily", "state.yml"), stringify({ schema: 1, topics }));
  write({ [id]: { state: "linked", at: "2026-10-20", report: "draft-report" } });
  assert.deepEqual(checkErrors(root), []);
  write({ "2026-10-18-ffffff": { state: "selected", at: "2026-10-19" } });
  assert.ok(checkErrors(root).some((e) => e.includes("找不到这个 topic")));
  write({ [id]: { state: "linked", at: "2026-10-20", report: "no-such-report" } });
  assert.ok(checkErrors(root).some((e) => e.includes("no-such-report 不存在")));
  write({ [id]: { state: "dismissed", at: "2026-10-20" } });
  assert.ok(checkErrors(root).length > 0);

  write({ [id]: { state: "linked", at: "2026-10-20", report: "glamsterdam-overview" } });
  gitRepo(root);
  write({ [id]: { state: "selected", at: "2026-10-21" } });
  const r = rh(root, "daily", "check", "--base", "HEAD");
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /不允许 linked → selected/);
});

// ───────────────────────── 公开投影与泄漏指纹 ─────────────────────────

test("公开投影只含 topic、条目元数据与 manifest 的公开子集；内部数据给泄漏检查", () => {
  const root = importedRoot();
  writeFileSync(join(root, "daily", "state.yml"), stringify({ schema: 1, topics: { [readTopics(root).topics[0].id]: { state: "dismissed", at: "2026-10-19", reason: "和私有报告重复，暂不做" } } }));
  const load = loadDaily(root);
  assert.deepEqual(load.errors, []);
  const pub = publicDay(load.days[0]);
  assert.deepEqual(Object.keys(pub).sort(), ["counts", "date", "generated_at", "items", "reasons", "status", "topics", "window"]);
  assert.deepEqual(pub.counts, { topics: 6 });
  const json = JSON.stringify(pub);
  const forbidden = dailyForbidden(load);
  for (const f of forbidden) assert.ok(!json.includes(f.text), `公开投影含有内部数据 ${f.source}: ${f.text}`);
  const texts = forbidden.map((f) => f.text);
  for (const v of ["18700000001", "5e".repeat(32), "claude-sonnet-5-5", "daily-topics@0.1.0-fixture", "blockbeats budget exhausted for the day", "和私有报告重复，暂不做", "inputs_sha256"]) assert.ok(texts.includes(v), v);
});

// ───────────────────────── 配置与接线 ─────────────────────────

test("dailyAvoidTerms：显式设置时用它，不设时沿用 cardAvoidTerms", () => {
  assert.deepEqual(loadConfig(makeRoot({ cardAvoidTerms: ["Mantle"] })).dailyAvoidTerms, ["Mantle"]);
  assert.deepEqual(loadConfig(makeRoot({ cardAvoidTerms: ["Mantle"], dailyAvoidTerms: ["Acme", 3] })).dailyAvoidTerms, ["Acme"]);
  assert.deepEqual(loadConfig(makeRoot({ cardAvoidTerms: ["Mantle"], dailyAvoidTerms: [] })).dailyAvoidTerms, []);
});

test("pnpm verify 与 CI verify 任务运行 rh daily check；probe 不在其中", () => {
  const verify = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")).scripts.verify as string;
  assert.ok(verify.includes("node cli/rh.ts daily check"), verify);
  assert.ok(!verify.includes("probe"), verify);
  const yml = parse(readFileSync(join(REPO, ".github", "workflows", "deploy.yml"), "utf8"));
  const runs = yml.jobs.verify.steps.map((s: { run?: string }) => s.run ?? "");
  assert.ok(runs.includes("node cli/rh.ts daily check"), runs.join("\n"));
  assert.ok(!readFileSync(join(REPO, ".github", "workflows", "deploy.yml"), "utf8").includes("probe"));
});

test("rh daily probe 的链接检查（只连本机）", async () => {
  const server = createServer((req, res) => {
    res.statusCode = req.url === "/ok" ? 200 : 404;
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  try {
    assert.equal(await probeUrl(`http://127.0.0.1:${port}/ok`, 2000), null);
    assert.equal(await probeUrl(`http://127.0.0.1:${port}/gone`, 2000), "HTTP 404");
  } finally {
    server.close();
  }
});

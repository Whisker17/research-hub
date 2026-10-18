import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { stringify } from "yaml";
import { runChecks } from "../cli/commands/check.ts";
import { cmdNew } from "../cli/commands/new.ts";
import { cmdTags } from "../cli/commands/tags.ts";
import { CliError } from "../cli/lib/util.ts";
import { loadConfig } from "../lib/config.ts";
import { loadTags } from "../lib/reports.ts";
import { RESERVED_SLUGS, isReservedSlug, metaSchema, tagsFileSchema } from "../lib/schema.ts";

const base = {
  title: "Meme Launchpad 调研",
  summary: "一句话摘要",
  created: "2026-10-05",
  updated: "2026-10-05",
  changelog: [{ date: "2026-10-05", note: "创建" }],
  domain: "crypto",
  tags: ["dex"],
  status: "draft",
  visibility: "public",
  kind: "native",
  brief_source: "Research Briefs/Meme Launchpad.md",
};

const issues = (m: unknown) => {
  const r = metaSchema.safeParse(m);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

test("合法的 meta 通过", () => {
  assert.deepEqual(issues(base), []);
});

test("domain / status / visibility / kind 只能取固定值", () => {
  assert.ok(issues({ ...base, domain: "web3" }).some((s) => s.startsWith("domain")));
  assert.ok(issues({ ...base, status: "review" }).some((s) => s.startsWith("status")));
  assert.ok(issues({ ...base, visibility: "unlisted" }).some((s) => s.startsWith("visibility")));
  assert.ok(issues({ ...base, kind: "external" }).some((s) => s.startsWith("kind")));
});

test("日期必须是真实的 YYYY-MM-DD，且 updated 不早于 created", () => {
  assert.ok(issues({ ...base, created: "2026-02-30", updated: "2026-03-01" }).some((s) => s.startsWith("created")));
  assert.ok(issues({ ...base, created: "2026/10/05" }).length > 0);
  assert.ok(issues({ ...base, updated: "2026-10-04" }).some((s) => s.startsWith("updated")));
});

test("标签必须是小写 slug 且不重复", () => {
  assert.ok(issues({ ...base, tags: ["DEX"] }).length > 0);
  assert.ok(issues({ ...base, tags: ["自动做市商"] }).length > 0);
  assert.ok(issues({ ...base, tags: ["dex", "dex"] }).some((s) => s.startsWith("tags")));
});

test("导入报告必须有 source_repo；原生报告必须有 brief_source", () => {
  assert.ok(issues({ ...base, kind: "imported", brief_source: undefined }).some((s) => s.startsWith("source_repo")));
  assert.ok(issues({ ...base, brief_source: undefined }).some((s) => s.startsWith("brief_source")));
});

test("未知字段与空 changelog 被拒绝", () => {
  assert.ok(issues({ ...base, author: "x" }).length > 0);
  assert.ok(issues({ ...base, changelog: [] }).some((s) => s.startsWith("changelog")));
});

// ── 保留路由名与 tags.yml 描述（WHI-1926，ADR 0003 §5、§6）──────────────────────────────

const tmpRoots: string[] = [];
after(() => {
  for (const d of tmpRoots) rmSync(d, { recursive: true, force: true });
});
const tmpRoot = () => {
  const d = mkdtempSync(join(tmpdir(), "rh-schema-"));
  tmpRoots.push(d);
  return d;
};
const cfgFor = (root: string) => ({ ...loadConfig(join(import.meta.dirname, "..")), root, vaultDir: join(root, "vault") });

test("保留路由名：daily、tags、archive、fonts、about 与纯数字 slug 是保留的", () => {
  for (const s of ["daily", "tags", "archive", "fonts", "about", "2026", "404", "0"]) assert.ok(isReservedSlug(s), s);
  for (const s of ["daily-topics", "tags-2", "about-mantle", "2026-review", "p", "r", "meme-launchpad"]) assert.ok(!isReservedSlug(s), s);
  assert.deepEqual([...RESERVED_SLUGS], ["daily", "tags", "archive", "fonts", "about"]);
});

test("rh new 拒绝保留的 slug，不创建目录", async () => {
  const root = tmpRoot();
  writeFileSync(join(root, "tags.yml"), "tags: {}\n");
  const brief = join(root, "idea.md");
  writeFileSync(brief, "---\ndomain: ai\n---\n想法\n");
  for (const slug of ["daily", "about", "2026"]) {
    await assert.rejects(cmdNew(cfgFor(root), [brief, "--slug", slug]), (e: Error) => e instanceof CliError && /是保留的路由名/.test(e.message), slug);
  }
  writeFileSync(join(root, "tags.md"), "---\ndomain: ai\n---\n想法\n");
  await assert.rejects(cmdNew(cfgFor(root), [join(root, "tags.md")]), /slug“tags”是保留的路由名/, "从文件名推出的 slug 也检查");
  assert.equal(existsSync(join(root, "reports")), false);
});

test("rh check 拒绝保留的 slug（draft 也一样；rh import 建的报告靠它拦下）", async () => {
  const root = tmpRoot();
  writeFileSync(join(root, "tags.yml"), "tags: {}\n");
  for (const slug of ["tags", "2026", "fine-slug"]) {
    const dir = join(root, "reports", "2026", "10", slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "meta.yml"), stringify({ ...base, tags: [], kind: "imported", brief_source: undefined, source_repo: "x" }));
  }
  const run = await runChecks(cfgFor(root), { slugs: [], strict: false, mobile: false, quiet: true });
  assert.equal(run.ok, false);
  const reserved = run.globalErrors.filter((e) => /是保留的路由名/.test(e));
  assert.deepEqual(reserved.map((e) => e.split(":")[0]).sort(), ["reports/2026/10/2026", "reports/2026/10/tags"]);
});

const tagIssues = (t: unknown) => {
  const r = tagsFileSchema.safeParse(t);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

test("tags.yml：description / description_en 可选；旧文件仍合法；空描述与未知字段被拒绝", () => {
  assert.deepEqual(tagIssues({ tags: { dex: { label: "DEX" } } }), [], "旧格式");
  assert.deepEqual(tagIssues({ tags: { dex: { label: "DEX", description: "去中心化交易所", description_en: "Decentralised exchanges" } } }), []);
  assert.deepEqual(tagIssues({ tags: { dex: { label: "DEX", description: "只有中文" } } }), [], "英文可缺");
  assert.ok(tagIssues({ tags: { dex: { label: "DEX", description: "   " } } }).some((s) => s.startsWith("tags.dex.description")));
  assert.ok(tagIssues({ tags: { dex: { label: "DEX", description_en: "" } } }).some((s) => s.startsWith("tags.dex.description_en")));
  assert.ok(tagIssues({ tags: { dex: { label: "DEX", summary: "x" } } }).length > 0);
});

test("rh tags add 写回 tags.yml 时保留已有标签的描述", () => {
  const root = tmpRoot();
  writeFileSync(
    join(root, "tags.yml"),
    stringify({ tags: { dex: { label: "DEX", description: "去中心化交易所", description_en: "Decentralised exchanges" }, meme: { label: "Meme" } } }),
  );
  cmdTags(cfgFor(root), ["add", "zk", "--label", "零知识"]);
  const { tags, issues } = loadTags(root);
  assert.deepEqual(issues, []);
  assert.deepEqual(tags, {
    dex: { label: "DEX", description: "去中心化交易所", description_en: "Decentralised exchanges" },
    meme: { label: "Meme" },
    zk: { label: "零知识" },
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { metaSchema } from "../lib/schema.ts";

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

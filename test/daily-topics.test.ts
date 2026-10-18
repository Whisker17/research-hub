/**
 * daily-topics skill（WHI-1933）：
 *  - skill 不能运行 rh，所以它把 rh 的导入规则抄了一份（长度上限、来源类别）。rh 改了规则而忘了改 skill 时，这里失败。
 *  - 评估夹具（test/fixtures/daily/eval）里记录的模型输出，重放 rh daily import + rh daily check 后必须和记录的结果一致，
 *    并且输出里没有注入内容（canary）。不调用模型。
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { readFrontmatter } from "../cli/lib/create.ts";
import { DAILY_SOURCES, LIMITS, MAX_TOPICS, VERBATIM_CHARS } from "../lib/daily.ts";
import { EVAL_DIR, importCase, type Result } from "./fixtures/daily/eval/run.ts";

const SKILL = join(import.meta.dirname, "..", ".claude", "skills", "daily-topics");
const read = (p: string) => readFileSync(join(SKILL, p), "utf8");

test("daily-topics：frontmatter 有 name、description、metadata.version，且不会被模型自动调用", () => {
  const text = read("SKILL.md");
  const fm = readFrontmatter(text);
  assert.equal(fm.name, "daily-topics");
  assert.ok(typeof fm.description === "string" && fm.description.length > 40);
  assert.equal(fm["disable-model-invocation"], true);
  assert.match(String((fm.metadata as { version?: unknown } | undefined)?.version), /^\d+\.\d+\.\d+$/);
});

test("daily-topics：相对链接都能打开", () => {
  const broken: string[] = [];
  for (const f of ["SKILL.md", "references/candidate.md", "references/input.md"]) {
    for (const m of read(f).matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:/.test(m[1])) continue;
      if (!existsSync(resolve(dirname(join(SKILL, f)), m[1].split("#")[0]))) broken.push(`${f} → ${m[1]}`);
    }
  }
  assert.deepEqual(broken, []);
});

test("daily-topics：candidate.md 里的长度上限、来源类别、转载阈值和 topic 上限与 lib/daily.ts 一致", () => {
  const text = read("references/candidate.md");
  const limits = Object.fromEntries([...text.matchAll(/^\| `(\w+)` \| (\d+) \|$/gm)].map((m) => [m[1], Number(m[2])]));
  assert.deepEqual(limits, { ...LIMITS });
  const kinds = Object.fromEntries([...text.matchAll(/^\| `(\w+)` \| (x|forum|news|aggregator) \| (primary|secondary) \|$/gm)].map((m) => [m[1], m[2]]));
  assert.deepEqual(kinds, { ...DAILY_SOURCES });
  for (const [src, kind] of Object.entries(DAILY_SOURCES)) {
    assert.match(text, new RegExp(`\\| \`${src}\` \\| ${kind} \\| ${kind === "forum" ? "primary" : "secondary"} \\|`), src);
  }
  assert.match(text, new RegExp(`连续 ${VERBATIM_CHARS} 个以上的字符`));
  assert.match(text, new RegExp(`0–${MAX_TOPICS} 个（超过 ${MAX_TOPICS} 个整体拒绝）`));
});

const cases = readdirSync(EVAL_DIR).filter((n) => existsSync(join(EVAL_DIR, n, "output", "candidate", "topics.yml"))).sort();

test("评估夹具：六个 case 都有记录的输出", () => {
  assert.deepEqual(cases, ["full-day", "low-quality", "no-qualifying", "price-only", "prompt-injection", "reposts"]);
});

for (const name of cases) {
  test(`评估夹具 ${name}：记录的候选通过 rh daily import + rh daily check，结果与 result.json 一致，没有注入内容`, () => {
    const want = JSON.parse(readFileSync(join(EVAL_DIR, name, "output", "result.json"), "utf8")) as Result;
    const { imported, ...got } = importCase(name);
    assert.equal(got.import_exit, 0, got.import_log.join("\n"));
    assert.equal(got.check_exit, 0, got.import_log.join("\n"));
    assert.deepEqual(got.canaries_found, []);
    assert.deepEqual({ status: got.status, reasons: got.reasons, topics: got.topics, dropped: got.dropped }, { status: want.status, reasons: want.reasons, topics: want.topics, dropped: want.dropped });
    assert.equal(imported, readFileSync(join(EVAL_DIR, name, "output", "topics.imported.yml"), "utf8"));
    const run = JSON.parse(readFileSync(join(EVAL_DIR, name, "output", "run.json"), "utf8"));
    assert.deepEqual(run.stray_writes, []);
    assert.deepEqual(run.file_calls_outside_input_skill_out, []);
    assert.deepEqual(run.permission_denials, []);
  });
}

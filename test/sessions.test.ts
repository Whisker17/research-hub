/**
 * 报告会话（ADR 0005 §11，WHI-2155）：识别、记录（rh new / rh session add）、恢复命令（rh paths），
 * 以及会话 id 不进任何站点产物。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { parse, stringify } from "yaml";
import { metaSchema } from "../lib/schema.ts";
import { detectSession, resumeCommand } from "../lib/session.ts";

const REPO = join(import.meta.dirname, "..");
const TODAY = "2026-10-05";
const PI_ID = "01a16c70-0000-7000-8000-00000000pi01";
const CC_ID = "b2cda1dd-0000-4000-8000-0000000000cc";
let tmp: string;

const cleanEnv = () => {
  const env: NodeJS.ProcessEnv = { ...process.env, RH_ROOT: tmp, RH_TODAY: TODAY, NO_COLOR: "1" };
  delete env.PI_SESSION_ID;
  delete env.CLAUDE_CODE_SESSION_ID;
  return env;
};
const rh = (extraEnv: Record<string, string>, ...args: string[]) => {
  const r = spawnSync(process.execPath, [join(tmp, "cli", "rh.ts"), ...args], { cwd: tmp, encoding: "utf8", env: { ...cleanEnv(), ...extraEnv }, timeout: 180_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const meta = (slug: string) => parse(readFileSync(join(tmp, "reports", "2026", "10", slug, "meta.yml"), "utf8"));

function* walk(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

before(() => {
  tmp = mkdtempSync(join(tmpdir(), "rh-sessions-"));
  for (const p of ["package.json", "astro.config.mjs", "tsconfig.json", "src", "lib", "cli", "public", "worker"]) {
    cpSync(join(REPO, p), join(tmp, p), { recursive: true });
  }
  symlinkSync(join(REPO, "node_modules"), join(tmp, "node_modules"));
  const cfg = JSON.parse(readFileSync(join(REPO, "rh.config.json"), "utf8"));
  writeFileSync(join(tmp, "rh.config.json"), JSON.stringify({ ...cfg, vaultDir: join(tmp, "vault") }, null, 2));
  writeFileSync(join(tmp, "tags.yml"), "tags: {}\n");
  mkdirSync(join(tmp, "vault", "Research Briefs"), { recursive: true });
  writeFileSync(join(tmp, "vault", "Research Briefs", "idea.md"), "---\ndomain: ai\n---\n# Idea\n");
});

after(() => {
  if (tmp && !process.env.RH_KEEP_TMP) rmSync(tmp, { recursive: true, force: true });
});

test("detectSession / resumeCommand：pi、Claude Code、两者都在（嵌套）时只认 --runtime 指明的", () => {
  assert.deepEqual(detectSession({ PI_SESSION_ID: PI_ID }), { runtime: "pi", id: PI_ID });
  assert.deepEqual(detectSession({ CLAUDE_CODE_SESSION_ID: CC_ID }), { runtime: "claude-code", id: CC_ID });
  assert.equal(detectSession({}), null);
  assert.equal(detectSession({ PI_SESSION_ID: "  " }), null);
  const both = { PI_SESSION_ID: PI_ID, CLAUDE_CODE_SESSION_ID: CC_ID };
  assert.equal(detectSession(both), null);
  assert.deepEqual(detectSession(both, "claude-code"), { runtime: "claude-code", id: CC_ID });
  assert.equal(detectSession({ PI_SESSION_ID: PI_ID }, "claude-code"), null);
  assert.equal(resumeCommand({ runtime: "pi", id: PI_ID }), `pi --session ${PI_ID}`);
  assert.equal(resumeCommand({ runtime: "claude-code", id: CC_ID }), `claude --resume ${CC_ID}`);
});

test("schema：sessions 拒绝未知 runtime 与重复的 runtime + id", () => {
  const m = { title: "t", summary: "s", created: TODAY, updated: TODAY, changelog: [{ date: TODAY, note: "x" }], domain: "ai", status: "draft", visibility: "private", kind: "imported", source_repo: "x" };
  assert.ok(metaSchema.safeParse(m).success, "没有 sessions 也合法");
  assert.ok(metaSchema.safeParse({ ...m, sessions: [{ runtime: "pi", id: PI_ID, at: TODAY, note: "n" }] }).success);
  assert.ok(!metaSchema.safeParse({ ...m, sessions: [{ runtime: "codex", id: "x", at: TODAY }] }).success, "未知 runtime");
  const dup = { runtime: "pi", id: PI_ID, at: TODAY };
  assert.ok(!metaSchema.safeParse({ ...m, sessions: [dup, { ...dup, at: "2026-10-06" }] }).success, "重复");
  assert.ok(metaSchema.safeParse({ ...m, sessions: [dup, { ...dup, runtime: "claude-code" }] }).success, "不同 runtime 不算重复");
});

test("rh new：pi 下写入 sessions[0]，rh paths 打印 pi --session；没有会话就没有这个字段", () => {
  const r = rh({ PI_SESSION_ID: PI_ID }, "new", "idea", "--slug", "with-session");
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(meta("with-session").sessions, [{ runtime: "pi", id: PI_ID, at: TODAY }]);
  const p = rh({}, "paths", "with-session");
  assert.equal(p.code, 0, p.out);
  assert.match(p.out, new RegExp(`resume +pi --session ${PI_ID}`));

  assert.equal(rh({}, "new", "idea", "--slug", "no-session").code, 0);
  assert.equal("sessions" in meta("no-session"), false);
  assert.doesNotMatch(rh({}, "paths", "no-session").out, /resume/);

  assert.equal(rh({}, "new", "idea", "--slug", "bad-rt", "--session", "x", "--runtime", "codex").code, 2, "未知 runtime");
  assert.equal(rh({}, "new", "idea", "--slug", "no-rt", "--session", "x").code, 2, "--session 需要 --runtime");
});

test("rh session add：追加、去重、--note；识别不到会话时报错", () => {
  const add = rh({ CLAUDE_CODE_SESSION_ID: CC_ID }, "session", "add", "with-session", "--note", "处理评论");
  assert.equal(add.code, 0, add.out);
  assert.equal(rh({ CLAUDE_CODE_SESSION_ID: CC_ID }, "session", "add", "with-session").code, 0, "重复记录不是错误");
  assert.equal(rh({}, "session", "add", "with-session", "--session", PI_ID, "--runtime", "pi").code, 0);
  assert.deepEqual(meta("with-session").sessions, [
    { runtime: "pi", id: PI_ID, at: TODAY },
    { runtime: "claude-code", id: CC_ID, at: TODAY, note: "处理评论" },
  ]);
  const p = rh({}, "paths", "with-session").out;
  assert.match(p, new RegExp(`pi --session ${PI_ID}`));
  assert.match(p, new RegExp(`claude --resume ${CC_ID}  # ${TODAY} 处理评论`));

  assert.equal(rh({}, "session", "add", "with-session").code, 2, "没有会话");
  assert.equal(rh({ PI_SESSION_ID: "a", CLAUDE_CODE_SESSION_ID: "b" }, "session", "add", "with-session").code, 2, "嵌套时分不清");
  assert.equal(rh({}, "session", "add", "missing-slug", "--session", "x", "--runtime", "pi").code, 1);
  assert.equal(rh({}, "check", "--no-shot").code, 0, "有 / 没有 sessions 的 meta.yml 都过 rh check");
});

test("rh build：会话 id 不出现在 dist/public 与 dist/private", () => {
  const dir = join(tmp, "reports", "2026", "10", "pub-s");
  mkdirSync(dir, { recursive: true });
  const leak = "SESSIONLEAKQ9";
  writeFileSync(
    join(dir, "meta.yml"),
    stringify({
      title: "公开报告", summary: "公开摘要", created: TODAY, updated: TODAY, domain: "ai", tags: [], status: "published", visibility: "public",
      kind: "imported", source_repo: "https://example.com/repo", changelog: [{ date: TODAY, note: "导入" }],
      sessions: [{ runtime: "pi", id: `${leak}-pi`, at: TODAY, note: `${leak}-note` }, { runtime: "claude-code", id: `${leak}-cc`, at: TODAY }],
    }),
  );
  writeFileSync(join(dir, "index.html"), readFileSync(join(REPO, "test", "fixtures", "mobile", "good.html"), "utf8"));
  const r = rh({}, "build");
  assert.equal(r.code, 0, r.out);
  const pub = join(tmp, "dist", "public");
  assert.ok(readFileSync(join(pub, "r", "pub-s", "index.html"), "utf8").length > 0, "公开报告已构建");
  const hits = [...walk(join(tmp, "dist"))].filter((f) => readFileSync(f).includes(leak));
  assert.deepEqual(hits, []);
});

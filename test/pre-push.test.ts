/**
 * .githooks/pre-push（docs/GIT_WORKFLOW.md § Content lane / § Fallback）：
 * main 与 release/v* 默认拒绝直推；只有“快进、无 merge commit、每个提交只改 reports/ daily/ tags.yml”的
 * 内容通道推送可以直推 main；ALLOW_DIRECT_PUSH=1 是 fan-in 与新 release 分支首推的显式覆盖。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";

const HOOKS = join(import.meta.dirname, "..", ".githooks");
let root: string;
let work: string;

function git(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
    cwd: work,
    encoding: "utf8",
    env: { ...process.env, ALLOW_DIRECT_PUSH: "", ...env },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

function commit(files: Record<string, string>, msg: string) {
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(work, p)), { recursive: true });
    writeFileSync(join(work, p), c);
  }
  assert.equal(git(["add", "-A"]).code, 0);
  assert.equal(git(["commit", "-q", "-m", msg]).code, 0);
}

/** 把本地 main 重置到 origin/main，丢掉被拒绝的提交。 */
function resetMain() {
  git(["checkout", "-q", "main"]);
  git(["reset", "-q", "--hard", "origin/main"]);
}

before(() => {
  root = mkdtempSync(join(tmpdir(), "rh-prepush-"));
  const remote = join(root, "remote.git");
  spawnSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
  work = join(root, "work");
  spawnSync("git", ["clone", "-q", remote, work]);
  git(["checkout", "-q", "-b", "main"]);
  commit({ "lib/a.ts": "a\n", "tags.yml": "tags: {}\n" }, "init");
  assert.equal(git(["push", "-q", "origin", "main"]).code, 0, "初始推送（尚未启用 hook）");
  assert.equal(git(["config", "core.hooksPath", HOOKS]).code, 0);
});

after(() => rmSync(root, { recursive: true, force: true }));

test("pre-push：内容通道（只改 reports/、daily/、tags.yml）可以直推 main", () => {
  commit({ "reports/2026/10/x/meta.yml": "title: x\n" }, "publish(x)");
  commit({ "daily/2026/10/18/topics.yml": "topics: []\n", "tags.yml": "tags: {a: {label: A}}\n" }, "daily");
  const r = git(["push", "origin", "main"]);
  assert.equal(r.code, 0, r.out);
});

test("pre-push：改代码的提交不能直推 main", () => {
  commit({ "lib/a.ts": "b\n" }, "feat: code");
  const r = git(["push", "origin", "main"]);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /non-content path 'lib\/a\.ts'/);
  resetMain();
});

test("pre-push：内容与代码混在一次推送里（哪怕分成两个提交）也被拒绝", () => {
  commit({ "reports/2026/10/y/meta.yml": "title: y\n" }, "publish(y)");
  commit({ "AGENTS.md": "x\n" }, "docs: rules");
  assert.notEqual(git(["push", "origin", "main"]).code, 0);
  resetMain();
  commit({ "reports/2026/10/z/meta.yml": "title: z\n", "cli/rh.ts": "x\n" }, "mixed");
  assert.notEqual(git(["push", "origin", "main"]).code, 0);
  resetMain();
});

test("pre-push：merge commit 即使只带内容也不能直推 main", () => {
  git(["checkout", "-q", "-b", "side"]);
  commit({ "reports/2026/10/m/meta.yml": "title: m\n" }, "side content");
  git(["checkout", "-q", "main"]);
  commit({ "reports/2026/10/n/meta.yml": "title: n\n" }, "main content");
  assert.equal(git(["merge", "-q", "--no-ff", "--no-edit", "side"]).code, 0);
  const r = git(["push", "origin", "main"]);
  assert.notEqual(r.code, 0, r.out);
  resetMain();
  git(["branch", "-q", "-D", "side"]);
});

test("pre-push：release/v* 默认拒绝；ALLOW_DIRECT_PUSH=1 放行（fan-in / 首推）；功能分支不受限", () => {
  git(["checkout", "-q", "-b", "release/v0.1.0", "origin/main"]);
  assert.notEqual(git(["push", "origin", "release/v0.1.0"]).code, 0);
  assert.equal(git(["push", "origin", "release/v0.1.0"], { ALLOW_DIRECT_PUSH: "1" }).code, 0);
  commit({ "reports/2026/10/r/meta.yml": "title: r\n" }, "content on release");
  assert.notEqual(git(["push", "origin", "release/v0.1.0"]).code, 0, "内容通道只对 main 生效");
  git(["checkout", "-q", "-b", "feat/whi-1-x", "origin/main"]);
  commit({ "lib/a.ts": "feature\n" }, "feat: x");
  assert.equal(git(["push", "origin", "feat/whi-1-x"]).code, 0);
  resetMain();
});

test("pre-push：删除 main 被拒绝", () => {
  assert.notEqual(git(["push", "origin", ":main"]).code, 0);
});

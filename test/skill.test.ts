/**
 * 项目 skill（.claude/skills/research-hub/）与 rh 的一致性：skill 里写到的 rh 命令和选项必须真实存在，
 * 相对链接必须能打开。rh 改了命令或选项而忘了改 skill 时，这里会失败。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { stringify } from "yaml";
import { CARD_HELP } from "../cli/commands/card.ts";
import { CHECK_HELP } from "../cli/commands/check.ts";
import { COMMENTS_HELP } from "../cli/commands/comments.ts";
import { IMPORT_HELP } from "../cli/commands/import.ts";
import { NEW_HELP } from "../cli/commands/new.ts";
import { PATHS_HELP } from "../cli/commands/paths.ts";
import { PUBLISH_HELP } from "../cli/commands/publish.ts";
import { RENDER_HELP } from "../cli/commands/render.ts";
import { SESSION_HELP } from "../cli/commands/session.ts";
import { TAGS_HELP } from "../cli/commands/tags.ts";
import { TOPIC_HELP } from "../cli/commands/topic.ts";
import { readFrontmatter } from "../cli/lib/create.ts";

const REPO = join(import.meta.dirname, "..");
const SKILL_DIR = join(REPO, ".claude", "skills", "research-hub");

const HELP: Record<string, string> = {
  new: NEW_HELP, import: IMPORT_HELP, render: RENDER_HELP, card: CARD_HELP, check: CHECK_HELP, publish: PUBLISH_HELP, tags: TAGS_HELP, paths: PATHS_HELP, topic: TOPIC_HELP, session: SESSION_HELP, comments: COMMENTS_HELP,
  list: "", build: "",
};

function skillFiles(dir = SKILL_DIR): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? skillFiles(p) : n.endsWith(".md") ? [p] : [];
  });
}

test("skill：SKILL.md 的 frontmatter 有 name 与 description", () => {
  const fm = readFrontmatter(readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8"));
  assert.equal(fm.name, "research-hub");
  assert.ok(typeof fm.description === "string" && fm.description.length > 40);
});

test("skill：写到的 rh 命令与选项都存在", () => {
  const problems: string[] = [];
  let count = 0;
  for (const file of skillFiles()) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/pnpm rh ([a-z]+)([^`\n]*)/g)) {
      count++;
      const [, cmd, rest] = m;
      const where = `${file.slice(REPO.length + 1)}: pnpm rh ${cmd}${rest}`;
      if (!(cmd in HELP)) {
        problems.push(`${where}\n    未知命令 ${cmd}`);
        continue;
      }
      for (const flag of rest.match(/--[a-z][a-z-]*/g) ?? []) {
        if (!new RegExp(`${flag}(?![a-z-])`).test(HELP[cmd])) problems.push(`${where}\n    rh ${cmd} 没有选项 ${flag}`);
      }
    }
  }
  assert.ok(count >= 10, `只找到 ${count} 处 rh 命令，正则可能失效`);
  assert.deepEqual(problems, []);
});

test("skill：相对链接都能打开", () => {
  const broken: string[] = [];
  for (const file of skillFiles()) {
    for (const m of readFileSync(file, "utf8").matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1].split("#")[0];
      if (!target || /^[a-z]+:/.test(target)) continue;
      if (!existsSync(resolve(dirname(file), target))) broken.push(`${file.slice(REPO.length + 1)} → ${m[1]}`);
    }
  }
  assert.deepEqual(broken, []);
});

test("rh paths：打印 brief 目录、am 与报告地址（public → /r/，private → /p/）；未知 slug 报错", () => {
  const root = mkdtempSync(join(tmpdir(), "rh-paths-"));
  try {
    writeFileSync(join(root, "rh.config.json"), JSON.stringify({
      publicUrl: "https://pub.example/", privateUrl: "https://priv.example", vaultDir: "/vault", briefsDir: "Research Briefs", amScript: "/am/skill/scripts/am.mjs",
    }));
    writeFileSync(join(root, "tags.yml"), "tags: {}\n");
    const report = (slug: string, meta: Record<string, unknown>) => {
      const dir = join(root, "reports", "2026", "10", slug);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "meta.yml"), stringify({
        title: slug, summary: "s", created: "2026-10-05", updated: "2026-10-05", changelog: [{ date: "2026-10-05", note: "创建" }],
        domain: "other", tags: [], ...meta,
      }));
    };
    report("pub-one", { status: "draft", visibility: "public", kind: "native", brief_source: "Research Briefs/a.md" });
    report("priv-one", { status: "published", visibility: "private", kind: "imported", source_repo: "x" });

    const run = (...args: string[]) => {
      const r = spawnSync(process.execPath, [join(REPO, "cli", "rh.ts"), "paths", ...args], { cwd: root, encoding: "utf8", env: { ...process.env, RH_ROOT: root, NO_COLOR: "1" } });
      return { code: r.status, out: `${r.stdout}${r.stderr}` };
    };
    const base = run();
    assert.equal(base.code, 0, base.out);
    assert.match(base.out, /^briefs\s+\/vault\/Research Briefs$/m);
    assert.match(base.out, /^am\s+\/am\/skill\/scripts\/am\.mjs$/m);
    assert.match(base.out, /^am_docs\s+\/am\/skill$/m);
    assert.doesNotMatch(base.out, /^dir\s/m);

    const pub = run("pub-one");
    assert.equal(pub.code, 0, pub.out);
    assert.match(pub.out, /^dir\s+reports\/2026\/10\/pub-one$/m);
    assert.match(pub.out, /^status\s+draft · public · native$/m);
    assert.match(pub.out, /^url\s+https:\/\/pub\.example\/r\/pub-one\/$/m);
    assert.match(pub.out, /^shots\s+\.rh\/shots\/pub-one$/m);

    const priv = run("priv-one");
    assert.match(priv.out, /^url\s+https:\/\/priv\.example\/p\/priv-one\/$/m);

    const bad = run("no-such-report");
    assert.notEqual(bad.code, 0);
    assert.match(bad.out, /找不到报告/);
    assert.notEqual(run("a", "b").code, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

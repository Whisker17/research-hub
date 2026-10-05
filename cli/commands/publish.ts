/**
 * rh publish <slug>：严格检查（含手机检查）→ 改为 published、更新 updated 与 changelog
 * → 本地完整构建（含泄漏检查）→ 只提交该报告目录与 tags.yml → push（CI 部署）。
 * 任何一步失败都会撤销 meta 的修改，不产生提交。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import type { HubConfig } from "../../lib/config.ts";
import { loadReports } from "../../lib/reports.ts";
import { CliError, info, ok, readMetaRaw, today, warn, writeMeta, git } from "../lib/util.ts";
import { runBuild } from "./build.ts";
import { runChecks } from "./check.ts";

export const PUBLISH_HELP = `rh publish <slug> [--note <说明>] [--no-push]

  1. 按 published 标准检查该报告（含手机检查与截图），不通过就停止
  2. status → published，updated → 今天，changelog 追加一条
  3. 本地完整构建（含泄漏检查）
  4. 只提交该报告目录与 tags.yml，然后 push 到远端（CI 负责部署）
  --note      changelog 说明（默认：首次发布为“发布”，之后为“更新”）
  --no-push   只提交，不 push`;

export async function cmdPublish(cfg: HubConfig, argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { note: { type: "string" }, "no-push": { type: "boolean", default: false }, help: { type: "boolean", short: "h" } },
  });
  if (values.help || positionals.length !== 1) {
    info(PUBLISH_HELP);
    if (!values.help) throw new CliError("需要一个 slug", 2);
    return;
  }
  const slug = positionals[0];
  const report = loadReports(cfg.root).reports.find((r) => r.slug === slug);
  if (!report) throw new CliError(`找不到报告“${slug}”（或它的 meta.yml 不合法，先运行 rh check）`);

  info(`检查 ${slug}（published 标准，含手机检查）…`);
  const run = await runChecks(cfg, { slugs: [slug], strict: true, mobile: true });
  if (!run.ok) throw new CliError("检查未通过，未发布。修复后重试");

  const metaFile = join(report.dir, "meta.yml");
  const original = readFileSync(metaFile, "utf8");
  const meta = readMetaRaw(report.dir);
  const first = meta.status !== "published";
  meta.status = "published";
  meta.updated = today();
  const log = Array.isArray(meta.changelog) ? meta.changelog : [];
  log.push({ date: today(), note: values.note ?? (first ? "发布" : "更新") });
  meta.changelog = log;
  writeMeta(report.dir, meta);

  try {
    info("构建与泄漏检查…");
    runBuild(cfg);
  } catch (e) {
    writeFileSync(metaFile, original);
    throw e;
  }

  const rel = relative(cfg.root, report.dir);
  const paths = [rel, "tags.yml"];
  git(cfg.root, ["add", "--", ...paths]);
  const staged = git(cfg.root, ["diff", "--cached", "--name-only", "--", ...paths]);
  if (!staged) {
    warn("没有需要提交的变化");
    return;
  }
  git(cfg.root, ["commit", "-m", `${first ? "publish" : "update"}(${slug}): ${String(meta.title)}`, "--", ...paths]);
  ok(`已提交：${git(cfg.root, ["log", "-1", "--format=%h %s"])}`);
  if (values["no-push"]) {
    warn("未 push（--no-push）。push 到 main 后由 CI 部署");
    return;
  }
  const branch = git(cfg.root, ["branch", "--show-current"]);
  git(cfg.root, ["push", "origin", branch]);
  ok(`已 push 到 origin/${branch}${branch === "main" ? "，CI 将部署" : "（不是 main，CI 不会部署）"}`);
}

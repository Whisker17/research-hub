/**
 * rh build：校验数据 → Astro 生成索引页 → 分发 dist/public 与 dist/private → 泄漏检查。
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import type { HubConfig } from "../../lib/config.ts";
import { isPublished, loadReports, loadTags } from "../../lib/reports.ts";
import { assemble, leakCheck } from "../lib/build.ts";
import { checkReferences } from "../lib/checks.ts";
import { CliError, fail, info, ok } from "../lib/util.ts";

export function runBuild(cfg: HubConfig): void {
  const { reports, issues } = loadReports(cfg.root);
  const tags = loadTags(cfg.root);
  const errors = [...issues, ...tags.issues].map((i) => `${i.where}: ${i.message}`);
  for (const r of reports) for (const e of checkReferences(r, reports, tags.tags)) errors.push(`${r.relDir}: ${e}`);
  for (const r of reports) {
    if (isPublished(r) && !existsSync(join(r.dir, "index.html"))) errors.push(`${r.relDir}: 已发布但缺少 index.html`);
  }
  if (errors.length) {
    for (const e of errors) fail(e);
    throw new CliError("数据校验失败，未构建");
  }

  const astroOut = join(cfg.root, ".astro-dist");
  rmSync(astroOut, { recursive: true, force: true });
  const astroBin = join(cfg.root, "node_modules", ".bin", "astro");
  const r = spawnSync(astroBin, ["build", "--silent"], { cwd: cfg.root, stdio: "inherit", env: process.env });
  if (r.status !== 0) throw new CliError(`astro build 失败（退出码 ${r.status}）`);

  const res = assemble(cfg.root, astroOut, reports);
  const leaks = leakCheck(res, reports);
  if (leaks.length) {
    for (const e of leaks) fail(e);
    rmSync(join(cfg.root, "dist"), { recursive: true, force: true });
    throw new CliError("泄漏检查失败：已删除 dist/，没有可部署的产物");
  }
  const drafts = reports.filter((x) => !isPublished(x)).length;
  ok(`公开站点 ${relative(cfg.root, res.publicDir)}/：${res.publicReports.length} 篇报告`);
  ok(`私有站点 ${relative(cfg.root, res.privateDir)}/：${res.privateReports.length} 篇私有报告 + /p/ 私有索引`);
  ok(`泄漏检查通过（跳过 ${drafts} 篇 draft）`);
  info("");
}

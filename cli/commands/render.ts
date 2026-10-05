/**
 * rh render <slug> [--force]：调用 answer-me-with-html，把 explainer.md 渲染成 index.html，并记录 am_version。
 * 已发布报告的 HTML 是最终产物，不自动重新渲染；确需重新渲染时加 --force（规格 §6.3）。
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { HubConfig } from "../../lib/config.ts";
import { loadReports } from "../../lib/reports.ts";
import { CliError, info, ok, readMetaRaw, today, warn, writeMeta } from "../lib/util.ts";

export const RENDER_HELP = `rh render <slug> [--force]

  用 answer-me-with-html 把 explainer.md 渲染成 index.html，并把 am 版本写入 meta.am_version。
  --force   重新渲染已发布的报告（会更新 updated 并追加 changelog）`;

export function amVersion(cfg: HubConfig): string {
  if (!existsSync(cfg.amScript)) throw new CliError(`找不到 answer-me-with-html：${cfg.amScript}（在 rh.config.json 的 amScript 或环境变量 AM_SCRIPT 中设置）`);
  return execFileSync(process.execPath, [cfg.amScript, "--version"], { encoding: "utf8" }).trim();
}

/** 渲染一篇报告；成功返回 am 版本。 */
export function renderReport(cfg: HubConfig, dir: string, opts: { force: boolean; label: string }): string {
  const meta = readMetaRaw(dir);
  const explainer = join(dir, "explainer.md");
  const html = join(dir, "index.html");
  if (!existsSync(explainer)) throw new CliError(`${opts.label}：没有 explainer.md，无法渲染`);
  const published = meta.status === "published";
  if (published && existsSync(html) && !opts.force) {
    throw new CliError(`${opts.label} 已发布：已提交的 HTML 就是最终产物，不自动重新渲染。确认要重新渲染时运行 rh render ${opts.label} --force`);
  }
  const version = amVersion(cfg);
  info(`渲染 ${opts.label}（answer-me-with-html ${version}）…`);
  const r = spawnSync(process.execPath, [cfg.amScript, "render", "explainer.md", "-o", "index.html", "--no-open"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  for (const line of out.split("\n")) if (line.trim()) info(`  ${line}`);
  if (r.status !== 0) throw new CliError(`${opts.label}：am render 失败（退出码 ${r.status}）`);
  const errorLines = out.split("\n").filter((l) => /^\s*✗/.test(l));
  if (errorLines.length) throw new CliError(`${opts.label}：am render 报告了 ${errorLines.length} 个错误，按行号修改 explainer.md 后重试`);
  if (/^\s*!\s*未烘焙/m.test(out)) {
    throw new CliError(`${opts.label}：图形没有烘焙进页面（页面会依赖 CDN、离线不可读）。检查本机 Chrome / Node 22+ 后重试`);
  }
  if (/STE \d+ 条警告/.test(out) && !/STE ✓/.test(out)) warn("STE 写作检查有警告：按建议改写对应行后可重新渲染");

  meta.am_version = version;
  if (published) {
    meta.updated = today();
    const log = Array.isArray(meta.changelog) ? meta.changelog : [];
    log.push({ date: today(), note: `重新渲染（answer-me-with-html ${version}）` });
    meta.changelog = log;
  }
  writeMeta(dir, meta);
  ok(`${opts.label}：index.html 已生成，am_version = ${version}`);
  return version;
}

export function cmdRender(cfg: HubConfig, argv: string[]): void {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { force: { type: "boolean", default: false }, help: { type: "boolean", short: "h" } },
  });
  if (values.help || positionals.length !== 1) {
    info(RENDER_HELP);
    if (!values.help) throw new CliError("需要一个 slug", 2);
    return;
  }
  const { reports } = loadReports(cfg.root);
  const report = reports.find((r) => r.slug === positionals[0]);
  if (!report) throw new CliError(`找不到报告“${positionals[0]}”（或它的 meta.yml 不合法，先运行 rh check）`);
  renderReport(cfg, report.dir, { force: values.force ?? false, label: report.slug });
}

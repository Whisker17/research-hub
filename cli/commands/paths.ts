/**
 * rh paths [slug]：打印 skill 与人需要的已解析路径（vault brief 目录、am 脚本与文档、报告目录、发布地址）。
 * 只读，不改任何文件。
 */
import { dirname, join, relative } from "node:path";
import type { HubConfig } from "../../lib/config.ts";
import { loadReports, reportPath } from "../../lib/reports.ts";
import { CliError, info } from "../lib/util.ts";

export const PATHS_HELP = `rh paths [slug]

  打印已解析的路径（只读）：
  briefs    vault 中存放 brief 的目录
  am        answer-me-with-html CLI（am.mjs）
  am_docs   answer-me-with-html 文档目录（SKILL.md、references/）
  给出 slug 时另外打印：
  dir       报告目录（仓库相对路径）
  status    draft | published，以及 visibility、kind
  url       发布后的地址（public → /r/<slug>/，private → /p/<slug>/）
  shots     手机检查截图目录`;

export function cmdPaths(cfg: HubConfig, argv: string[]): void {
  if (argv.includes("-h") || argv.includes("--help")) return info(PATHS_HELP);
  if (argv.length > 1) throw new CliError("用法：rh paths [slug]", 2);
  const rows: [string, string][] = [
    ["briefs", join(cfg.vaultDir, cfg.briefsDir)],
    ["am", cfg.amScript],
    ["am_docs", dirname(dirname(cfg.amScript))],
  ];
  const [slug] = argv;
  if (slug) {
    const report = loadReports(cfg.root).reports.find((r) => r.slug === slug);
    if (!report) throw new CliError(`找不到报告“${slug}”（或它的 meta.yml 不合法，先运行 rh check）`);
    const base = report.meta.visibility === "public" ? cfg.publicUrl : cfg.privateUrl;
    rows.push(
      ["dir", relative(cfg.root, report.dir)],
      ["status", `${report.meta.status} · ${report.meta.visibility} · ${report.meta.kind}`],
      ["url", `${base}${reportPath(report)}`],
      ["shots", relative(cfg.root, join(cfg.root, ".rh", "shots", slug))],
    );
  }
  for (const [k, v] of rows) info(`${k.padEnd(8)} ${v}`);
}

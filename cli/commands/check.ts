/**
 * rh check [slug…] [--no-shot] [--strict]
 */
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import type { HubConfig } from "../../lib/config.ts";
import { loadReports, loadTags, type Report } from "../../lib/reports.ts";
import { checkReport, type ReportCheck } from "../lib/checks.ts";
import { launchBrowser } from "../lib/mobile.ts";
import { CliError, c, fail, info, ok, warn } from "../lib/util.ts";

export const CHECK_HELP = `rh check [slug…] [--no-shot] [--strict]

  检查 meta schema、目录、标签登记、引用、论断台账、HTML，以及手机检查（390×844，Chrome 无头）。
  - published 报告：所有问题都是错误。
  - draft 报告：schema / 标签 / 引用是错误；完整性与手机问题只是警告。
  - 显式给出 slug 或加 --strict 时，按 published 的标准检查。
  --no-shot   跳过手机检查与截图（CI 使用）
  截图输出到 .rh/shots/<slug>/。`;

export interface CheckRun {
  ok: boolean;
  results: ReportCheck[];
  globalErrors: string[];
}

export async function runChecks(cfg: HubConfig, opts: { slugs: string[]; strict: boolean; mobile: boolean; quiet?: boolean }): Promise<CheckRun> {
  const { reports, issues } = loadReports(cfg.root);
  const tagsLoad = loadTags(cfg.root);
  const globalErrors = [...issues, ...tagsLoad.issues].map((i) => `${i.where}: ${i.message}`);

  let selected: Report[] = reports;
  if (opts.slugs.length) {
    selected = [];
    for (const s of opts.slugs) {
      const r = reports.find((x) => x.slug === s);
      if (!r) globalErrors.push(`找不到报告“${s}”（或它的 meta.yml 不合法）`);
      else selected.push(r);
    }
  }
  const strict = opts.strict || opts.slugs.length > 0;
  const browser = opts.mobile && selected.length ? await launchBrowser() : undefined;
  const results: ReportCheck[] = [];
  try {
    for (const r of selected) {
      results.push(
        await checkReport(r, reports, tagsLoad.tags, {
          strict,
          mobile: opts.mobile,
          browser,
          cacheDir: join(cfg.root, ".rh", "cache", "mobile"),
          shotsDir: join(cfg.root, ".rh", "shots"),
        }),
      );
    }
  } finally {
    await browser?.close();
  }

  if (!opts.quiet) {
    for (const e of globalErrors) fail(e);
    for (const r of results) {
      const status = r.errors.length ? c.red("✗") : c.green("✓");
      info(`${status} ${c.bold(r.slug)}${r.errors.length ? c.red(`  ${r.errors.length} 个错误`) : ""}${r.warnings.length ? c.yellow(`  ${r.warnings.length} 个警告`) : ""}`);
      for (const e of r.errors) info(`    ${c.red("✗")} ${e}`);
      for (const w of r.warnings) info(`    ${c.yellow("!")} ${w}`);
      if (opts.mobile) {
        const shotDir = relative(cfg.root, join(cfg.root, ".rh", "shots", r.slug));
        if (r.shots.length) info(c.dim(`    截图：${r.shots.map((s) => relative(cfg.root, s)).join(" ")}`));
        else info(c.dim(`    截图：${shotDir}/（HTML 未变化，沿用上次结果）`));
      }
    }
  }
  const passed = globalErrors.length === 0 && results.every((r) => r.errors.length === 0);
  return { ok: passed, results, globalErrors };
}

export async function cmdCheck(cfg: HubConfig, argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "no-shot": { type: "boolean", default: false },
      strict: { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) return info(CHECK_HELP);
  const mobile = !values["no-shot"];
  if (!mobile) warn("已跳过手机检查（--no-shot）");
  const run = await runChecks(cfg, { slugs: positionals, strict: values.strict ?? false, mobile });
  const n = run.results.length;
  if (!run.ok) throw new CliError(`检查未通过（${n} 篇报告）`);
  ok(`检查通过（${n} 篇报告）`);
}

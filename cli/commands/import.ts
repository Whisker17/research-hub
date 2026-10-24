/**
 * rh import report：导入在其他仓库完成的研究（kind: imported）。
 * rh import research：把外部 Deep Research 结果放进某个报告的 research/。
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { stringify as stringifyYaml } from "yaml";
import type { HubConfig } from "../../lib/config.ts";
import { loadReports } from "../../lib/reports.ts";
import { SESSION_OPTIONS, createReportDir, ensureTags, resolveSession, readFrontmatter, readText, str } from "../lib/create.ts";
import { CliError, info, ok, splitList, today } from "../lib/util.ts";
import { renderReport } from "./render.ts";

export const IMPORT_HELP = `rh import report (--explainer <am稿件.md> | --html <页面.html>) --slug <slug> --domain <domain> [选项]

  导入在其他仓库完成的研究（kind: imported，status: draft）。
  --explainer <md>        answer-me-with-html 稿件：复制为 explainer.md 并用当前 am 渲染
  --html <file>           已生成的单文件 HTML：复制为 index.html（与 --explainer 同时给时不再渲染）
  --source <md>           原稿（非 am 格式的 Markdown），复制为 source.md
  --assets <dir>          页面引用的本地资源目录，复制为 assets/
  --source-repo <路径|URL> 来源仓库；本地路径会记录为 <remote>:<仓库内路径>@<commit>
  --title / --summary     默认取 explainer frontmatter 的 title / subtitle，或 HTML 的 <title>
  --tags <a,b>  --visibility <public|private，默认 private>  --created <YYYY-MM-DD，默认取稿件 date 或今天>
  --session <id> --runtime <pi|claude-code>  记录会话；默认从环境变量识别，识别不到就不记录

rh import research <slug> <file.md> --tool <工具名>

  把外部 Deep Research（ChatGPT、Gemini 等）的结果复制进 research/，并在文件头标明来源工具。`;

/** 把本地路径解析成“远端:仓库内路径@commit”，便于以后追溯；不是 git 仓库时返回绝对路径。 */
export function describeSource(p: string): string {
  if (/^[a-z]+:\/\//i.test(p)) return p;
  const abs = isAbsolute(p) ? p : resolve(process.cwd(), p);
  if (!existsSync(abs)) throw new CliError(`--source-repo 路径不存在：${abs}`);
  const cwd = statSync(abs).isDirectory() ? abs : dirname(abs);
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    let remote = "";
    try {
      remote = execFileSync("git", ["remote", "get-url", "origin"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      remote = top;
    }
    let commit = "";
    try {
      commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      /* 没有提交 */
    }
    const rel = relative(top, abs) || ".";
    let tracked = true;
    try {
      tracked = execFileSync("git", ["ls-files", "--", rel], { cwd: top, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() !== "";
    } catch {
      tracked = false;
    }
    // 路径未提交时 commit 对不上内容，如实标注
    return `${remote}:${rel}${commit ? `@${commit}` : ""}${tracked ? "" : "（未提交的工作区文件）"}`;
  } catch {
    return abs;
  }
}

function htmlTitle(html: string): string | undefined {
  const m = /<title>([^<]*)<\/title>/i.exec(html);
  return m?.[1].trim() || undefined;
}

function firstDate(v: unknown): string | undefined {
  const m = /\d{4}-\d{2}-\d{2}/.exec(String(v ?? ""));
  return m?.[0];
}

async function importReport(cfg: HubConfig, argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      explainer: { type: "string" }, html: { type: "string" }, source: { type: "string" }, assets: { type: "string" },
      "source-repo": { type: "string" }, slug: { type: "string" }, title: { type: "string" }, summary: { type: "string" },
      domain: { type: "string" }, tags: { type: "string" }, visibility: { type: "string" }, created: { type: "string" }, ...SESSION_OPTIONS,
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) return info(IMPORT_HELP);
  if (!values.explainer && !values.html) throw new CliError("需要 --explainer 或 --html", 2);
  if (!values.slug) throw new CliError("需要 --slug", 2);
  if (!values.domain) throw new CliError("需要 --domain", 2);
  if (!values["source-repo"]) throw new CliError("导入报告必须给 --source-repo（来源仓库）", 2);

  const explainerText = values.explainer ? readText(values.explainer) : undefined;
  const htmlText = values.html ? readText(values.html) : undefined;
  const fm = explainerText ? readFrontmatter(explainerText) : {};
  const title = values.title ?? str(fm.title) ?? (htmlText ? htmlTitle(htmlText) : undefined);
  if (!title) throw new CliError("无法确定标题，请用 --title 指定");
  const summary = values.summary ?? str(fm.subtitle) ?? str(fm.summary);
  if (!summary) throw new CliError("无法确定摘要，请用 --summary 指定");
  const tags = splitList(values.tags);
  const session = resolveSession(values);

  await ensureTags(cfg.root, tags);
  const { dir } = createReportDir(cfg.root, {
    slug: values.slug,
    title,
    summary,
    created: values.created ?? firstDate(fm.date) ?? today(),
    domain: values.domain,
    tags,
    visibility: values.visibility ?? "private",
    kind: "imported",
    source_repo: describeSource(values["source-repo"]),
    changelogNote: "导入",
    session,
  });
  if (values.explainer) copyFileSync(values.explainer, join(dir, "explainer.md"));
  if (values.html) copyFileSync(values.html, join(dir, "index.html"));
  if (values.source) copyFileSync(values.source, join(dir, "source.md"));
  if (values.assets) cpSync(values.assets, join(dir, "assets"), { recursive: true });

  const rel = relative(cfg.root, dir);
  ok(`导入 ${rel}（draft，${values.visibility ?? "private"}）`);
  if (values.explainer && !values.html) renderReport(cfg, dir, { force: false, label: values.slug });
  info(`  下一步：rh check ${values.slug} → 审阅截图 → rh publish ${values.slug}`);
}

function importResearch(cfg: HubConfig, argv: string[]): void {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { tool: { type: "string" }, help: { type: "boolean", short: "h" } },
  });
  if (values.help) return info(IMPORT_HELP);
  if (positionals.length !== 2) throw new CliError("用法：rh import research <slug> <file.md> --tool <工具名>", 2);
  if (!values.tool) throw new CliError("需要 --tool 标明来源工具（如 chatgpt-deep-research、gemini-deep-research）", 2);
  const [slug, file] = positionals;
  const report = loadReports(cfg.root).reports.find((r) => r.slug === slug);
  if (!report) throw new CliError(`找不到报告“${slug}”`);
  const text = readText(file);
  const researchDir = join(report.dir, "research");
  mkdirSync(researchDir, { recursive: true });
  const target = join(researchDir, basename(file).replace(/\s+/g, "-"));
  if (existsSync(target)) throw new CliError(`已存在：${relative(cfg.root, target)}`);
  const header = stringifyYaml({ imported_from: values.tool, imported_at: today(), original_file: basename(file) });
  writeFileSync(target, `---\n${header}---\n\n${text}`);
  ok(`导入调研结果 → ${relative(cfg.root, target)}（来源：${values.tool}）`);
  info("  提醒：外部结果里的论断同样要登记到 research/ledger.md 台账");
}

export async function cmdImport(cfg: HubConfig, argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub === "report") return importReport(cfg, rest);
  if (sub === "research") return importResearch(cfg, rest);
  info(IMPORT_HELP);
  if (sub !== "-h" && sub !== "--help") throw new CliError("用法：rh import report … | rh import research …", 2);
}

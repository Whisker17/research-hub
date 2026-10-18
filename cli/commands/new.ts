/**
 * rh new <brief>：从 vault 的 Research Briefs/ 快照 brief，建立原生报告目录（status: draft）。
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { HubConfig } from "../../lib/config.ts";
import { LEDGER_TEMPLATE } from "../../lib/ledger.ts";
import { isReservedSlug, reservedSlugMessage } from "../../lib/schema.ts";
import { createReportDir, ensureTags, readFrontmatter, readText, str, strList } from "../lib/create.ts";
import { CliError, info, ok, slugify, splitList, today, warn } from "../lib/util.ts";

export const NEW_HELP = `rh new <brief> [选项]

  <brief>  vault 中 "Research Briefs/" 下的文件名（可省略 .md），或任意 .md 路径

  --slug <slug>              报告 slug（文件名含中文时必填）
  --title <标题>              默认取 brief frontmatter 的 title，否则取文件名
  --summary <一句话摘要>       默认取 brief frontmatter 的 summary
  --domain <domain>          ai | crypto | finance | work | other（或写在 brief frontmatter）
  --tags <a,b>               标签，必须已登记；未登记的会提示确认
  --visibility <v>           public | private，默认 private（显式公开才公开）
  --created <YYYY-MM-DD>     默认今天

brief frontmatter 可写：title、summary、slug、domain、tags、visibility。命令行参数优先。`;

export function resolveBrief(cfg: HubConfig, arg: string): string {
  const candidates = [
    isAbsolute(arg) ? arg : resolve(process.cwd(), arg),
    join(cfg.vaultDir, cfg.briefsDir, arg),
    join(cfg.vaultDir, cfg.briefsDir, arg.endsWith(".md") ? arg : `${arg}.md`),
  ];
  const found = candidates.find((p) => existsSync(p) && p.endsWith(".md"));
  if (!found) throw new CliError(`找不到 brief：${arg}\n  已查找：\n  ${candidates.join("\n  ")}`);
  return found;
}

export async function cmdNew(cfg: HubConfig, argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      slug: { type: "string" }, title: { type: "string" }, summary: { type: "string" }, domain: { type: "string" },
      tags: { type: "string" }, visibility: { type: "string" }, created: { type: "string" }, help: { type: "boolean", short: "h" },
    },
  });
  if (values.help || positionals.length !== 1) {
    info(NEW_HELP);
    if (!values.help) throw new CliError("需要且只能给一个 brief", 2);
    return;
  }
  const briefPath = resolveBrief(cfg, positionals[0]);
  const briefText = readText(briefPath);
  const fm = readFrontmatter(briefText);
  const name = basename(briefPath, ".md");

  const slug = values.slug ?? str(fm.slug) ?? slugify(name);
  if (!slug) throw new CliError(`无法从文件名“${name}”生成 slug，请用 --slug 指定（如 --slug meme-launchpad）`);
  if (isReservedSlug(slug)) throw new CliError(`${reservedSlugMessage(slug)}（用 --slug 指定）`);
  const domain = values.domain ?? str(fm.domain);
  if (!domain) throw new CliError("缺少 domain：用 --domain 指定，或写在 brief 的 frontmatter 里");
  const tags = values.tags !== undefined ? splitList(values.tags) : (strList(fm.tags) ?? []);
  const visibility = values.visibility ?? str(fm.visibility) ?? "private";

  const inVault = !relative(cfg.vaultDir, briefPath).startsWith("..");
  const briefSource = inVault ? relative(cfg.vaultDir, briefPath) : briefPath;
  if (!inVault) warn(`brief 不在 vault（${cfg.vaultDir}）里；brief_source 记录为绝对路径`);

  await ensureTags(cfg.root, tags);
  const { dir } = createReportDir(cfg.root, {
    slug,
    title: values.title ?? str(fm.title) ?? name,
    summary: values.summary ?? str(fm.summary) ?? "TODO：一句话摘要",
    created: values.created ?? today(),
    domain,
    tags,
    visibility,
    kind: "native",
    brief_source: briefSource,
    changelogNote: "创建（brief 快照）",
  });
  copyFileSync(briefPath, join(dir, "brief.md"));
  mkdirSync(join(dir, "research"), { recursive: true });
  writeFileSync(join(dir, "research", "ledger.md"), LEDGER_TEMPLATE);

  const rel = relative(cfg.root, dir);
  ok(`创建 ${rel}（draft，${visibility}）`);
  info(`  brief 快照：${rel}/brief.md ← ${briefSource}`);
  info(`  下一步：确认 brief → 调研写入 ${rel}/research/（含 ledger.md 台账）→ 写 ${rel}/explainer.md → rh render ${slug}`);
}

/** rh tags add|list 与 rh list。 */
import { parseArgs } from "node:util";
import type { HubConfig } from "../../lib/config.ts";
import { loadReports, loadTags, sortByUpdated } from "../../lib/reports.ts";
import { SLUG_RE } from "../../lib/schema.ts";
import { CliError, c, info, ok, writeTags } from "../lib/util.ts";

export const TAGS_HELP = `rh tags list
rh tags add <tag> --label <展示名>

  标签键只用小写字母、数字和连字符。登记前先确认它不是已有标签的同义词。`;

export function cmdTags(cfg: HubConfig, argv: string[]): void {
  const [sub, ...rest] = argv;
  const { tags, issues } = loadTags(cfg.root);
  if (issues.length) throw new CliError(`tags.yml 有问题：${issues.map((i) => i.message).join("；")}`);
  if (sub === "list" || sub === undefined) {
    const { reports } = loadReports(cfg.root);
    for (const [k, v] of Object.entries(tags)) {
      const n = reports.filter((r) => r.meta.tags.includes(k)).length;
      info(`${k.padEnd(24)} ${v.label}  ${c.dim(`${n} 篇`)}`);
    }
    return;
  }
  if (sub === "add") {
    const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { label: { type: "string" } } });
    const [tag] = positionals;
    if (!tag || positionals.length !== 1) throw new CliError("用法：rh tags add <tag> --label <展示名>", 2);
    if (!SLUG_RE.test(tag)) throw new CliError(`标签“${tag}”不合法：只能用小写字母、数字和连字符`);
    if (tags[tag]) throw new CliError(`标签“${tag}”已登记（${tags[tag].label}）`);
    tags[tag] = { label: values.label?.trim() || tag };
    writeTags(cfg.root, tags);
    ok(`登记标签 ${tag}（${tags[tag].label}）`);
    return;
  }
  info(TAGS_HELP);
  if (sub !== "-h" && sub !== "--help") throw new CliError(`未知子命令：${sub}`, 2);
}

export function cmdList(cfg: HubConfig): void {
  const { reports, issues } = loadReports(cfg.root);
  for (const r of sortByUpdated(reports)) {
    const flags = [r.meta.status === "draft" ? c.yellow("draft") : c.green("published"), r.meta.visibility === "private" ? "private" : "public", r.meta.kind];
    info(`${r.meta.updated}  ${r.slug.padEnd(36)} ${flags.join(" · ")}  ${c.dim(r.meta.title)}`);
  }
  for (const i of issues) info(c.red(`✗ ${i.where}: ${i.message}`));
}

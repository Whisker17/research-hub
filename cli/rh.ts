#!/usr/bin/env node
/**
 * rh：research-hub 的确定性工具链。只搬运、渲染和检查，不调用 LLM。
 * 规格：docs/product-spec.md
 */
import { loadConfig } from "../lib/config.ts";
import { CARD_HELP, cmdCard } from "./commands/card.ts";
import { CHECK_HELP, cmdCheck } from "./commands/check.ts";
import { runBuild } from "./commands/build.ts";
import { IMPORT_HELP, cmdImport } from "./commands/import.ts";
import { NEW_HELP, cmdNew } from "./commands/new.ts";
import { PATHS_HELP, cmdPaths } from "./commands/paths.ts";
import { PUBLISH_HELP, cmdPublish } from "./commands/publish.ts";
import { RENDER_HELP, cmdRender } from "./commands/render.ts";
import { TAGS_HELP, cmdList, cmdTags } from "./commands/tags.ts";
import { CliError, fail } from "./lib/util.ts";

const HELP = `rh —— research-hub 工具链（pnpm rh <命令>）

  rh new <brief>              从 vault 的 Research Briefs/ 快照 brief，建立原生报告（draft）
  rh import report …          导入在其他仓库完成的报告（draft）
  rh import research …        把外部 Deep Research 结果放进 research/
  rh render <slug>            用 answer-me-with-html 渲染 explainer.md → index.html
  rh card <slug>              把 card.yml 渲染成推特卡片 card.png / card.en.png（一图速览）
  rh check [slug…]            检查 schema / 标签 / 台账 / 手机适配（--no-shot 跳过手机检查）
  rh publish <slug>           检查 → 发布 → 构建 → 提交并 push（CI 部署）
  rh build                    构建 dist/public 与 dist/private，并做泄漏检查
  rh tags list | add          标签登记表
  rh list                     列出全部报告
  rh paths [slug]             打印已解析的路径（vault brief 目录、am、报告目录、发布地址）

  rh <命令> --help 查看详细用法。`;

const SUB_HELP: Record<string, string> = {
  new: NEW_HELP, import: IMPORT_HELP, render: RENDER_HELP, card: CARD_HELP, check: CHECK_HELP, publish: PUBLISH_HELP, tags: TAGS_HELP, paths: PATHS_HELP,
};

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
    console.log(cmd === "help" && rest[0] && SUB_HELP[rest[0]] ? SUB_HELP[rest[0]] : HELP);
    return 0;
  }
  const cfg = loadConfig();
  switch (cmd) {
    case "new": await cmdNew(cfg, rest); break;
    case "import": await cmdImport(cfg, rest); break;
    case "render": cmdRender(cfg, rest); break;
    case "card": await cmdCard(cfg, rest); break;
    case "check": await cmdCheck(cfg, rest); break;
    case "publish": await cmdPublish(cfg, rest); break;
    case "build": runBuild(cfg); break;
    case "tags": cmdTags(cfg, rest); break;
    case "list": cmdList(cfg); break;
    case "paths": cmdPaths(cfg, rest); break;
    default:
      console.log(HELP);
      throw new CliError(`未知命令：${cmd}`, 2);
  }
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    if (e instanceof CliError) {
      fail(e.message);
      process.exit(e.exitCode);
    }
    console.error(e);
    process.exit(1);
  },
);

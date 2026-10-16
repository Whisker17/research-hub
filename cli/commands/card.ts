/**
 * rh card <slug>：把 card.yml 渲染成推特卡片 card.png（4:5，1200×1500，只有英文版）。
 * 卡片是在 X 上引用源推文时贴的“一图速览”。内容由 agent 按 skill 写进 card.yml（rh 不调用 LLM）。
 */
import { existsSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import type { HubConfig } from "../../lib/config.ts";
import { REPORT_FILES, loadReports } from "../../lib/reports.ts";
import { CARD_LIMITS, avoidedTerms, loadCard, tweetLeadLength, tweetLength, tweetLimitError } from "../lib/card.ts";
import { bakeFigure } from "../lib/card-figure.ts";
import { renderCardPng } from "../lib/card-render.ts";
import { launchBrowser } from "../lib/mobile.ts";
import { CliError, fail, info, ok, readMetaRaw, warn } from "../lib/util.ts";

export const CARD_HELP = `rh card <slug>

  把报告目录里的 card.yml 渲染成推特卡片 card.png：4:5、1200×1500，只有英文版（推特统一用英文发）。
  配图（figure.excalidraw）由 answer-me-with-html 烘焙成手绘 SVG，布局问题按 am 的检查报错。
  固定画布排版，内容超出画布、配图里的字太小都会失败（删减内容，不缩字号）。需要本机 Chrome。
  tweet 是配图发的推文文案（X 计数 ≤ rh.config.json 的 cardTweetMax，默认 280；不画进图片）。
  页脚是日期与水印（rh.config.json 的 cardHandle）。
  报告页（中英文页都有）的阅读路径里会多出“推特卡片”模式，可一键复制文案和图片。
  已发布的报告也可以直接加卡片，之后用 rh publish <slug> --note "推特卡片" 上线。`;

export async function cmdCard(cfg: HubConfig, argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { help: { type: "boolean", short: "h" } },
  });
  if (values.help || positionals.length !== 1) {
    info(CARD_HELP);
    if (!values.help) throw new CliError("需要一个 slug", 2);
    return;
  }
  const slug = positionals[0];
  const report = loadReports(cfg.root).reports.find((r) => r.slug === slug);
  if (!report) throw new CliError(`找不到报告“${slug}”（或它的 meta.yml 不合法，先运行 rh check）`);
  const { dir } = report;

  const loaded = loadCard(dir);
  if (!loaded.exists) throw new CliError(`${slug}：没有 ${REPORT_FILES.card}。按 .claude/skills/research-hub/references/tweet-card.md 写好再渲染`);
  if (!loaded.card) {
    for (const e of loaded.errors) fail(`${REPORT_FILES.card}：${e}`);
    throw new CliError(`${slug}：${REPORT_FILES.card} 不合法`);
  }
  const card = loaded.card;
  const tooLong = tweetLimitError(card.tweet, cfg.cardTweetMax);
  if (tooLong) throw new CliError(`${slug}：${tooLong}`);
  for (const t of avoidedTerms(card, cfg.cardAvoidTerms)) {
    warn(`卡片提到了“${t}”：推特卡片以中立研究者身份发布，尽量不提（rh.config.json 的 cardAvoidTerms）`);
  }
  if (!existsSync(cfg.amScript)) throw new CliError(`找不到 answer-me-with-html：${cfg.amScript}（配图要用它烘焙）`);

  const work = join(cfg.root, ".rh", "cards", slug);
  info("烘焙配图（answer-me-with-html）…");
  const baked = bakeFigure(cfg.amScript, work, card.figure);
  if (baked.errors.length || !baked.svg) {
    for (const e of baked.errors) fail(e);
    throw new CliError(`${slug}：配图没有生成，按上面的提示改 card.yml 的 figure 后重试`);
  }

  const meta = readMetaRaw(dir);
  const browser = await launchBrowser();
  try {
    const res = await renderCardPng(browser, { content: card, date: card.date ?? String(meta.updated), handle: cfg.cardHandle, figureSvg: baked.svg });
    if (res.errors.length) {
      for (const e of res.errors) fail(e);
      const preview = join(work, "overflow.png");
      writeFileSync(preview, res.png);
      info(`    超出部分被裁掉的预览：${relative(cfg.root, preview)}`);
      throw new CliError(`${slug}：卡片排版失败，没有写出。按上面的提示删减 card.yml 后重试`);
    }
    const out = join(dir, REPORT_FILES.cardPng);
    writeFileSync(out, res.png);
    ok(`${relative(cfg.root, out)}（剩余空白 ${res.slack}px）`);
  } finally {
    await browser.close();
  }

  const n = tweetLength(card.tweet);
  const lead = tweetLeadLength(card.tweet);
  const folds = n > CARD_LIMITS.tweetFold;
  info(`推文文案（X 计数 ${n} / ${cfg.cardTweetMax}${folds ? `；第一段 ${lead}，信息流里约 ${CARD_LIMITS.tweetFold} 之后折叠` : ""}）：`);
  if (folds && lead > CARD_LIMITS.tweetFold) warn(`长推文的第一段超过 ${CARD_LIMITS.tweetFold}：信息流里会在第一段中间折叠`);
  for (const line of card.tweet.split("\n")) info(`  │ ${line}`);
  info("用 Read 工具或图片查看器看一遍 PNG；上线：rh publish <slug> --note \"推特卡片\"");
}

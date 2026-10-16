/**
 * rh card <slug> [--lang zh|en]：把 card.yml 渲染成推特卡片 card.png / card.en.png（4:5，1200×1500）。
 * 卡片是在 X 上引用源推文时贴的“一图速览”。内容由 agent 按 skill 写进 card.yml（rh 不调用 LLM）。
 */
import { existsSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import type { HubConfig } from "../../lib/config.ts";
import { REPORT_FILES, loadReports } from "../../lib/reports.ts";
import { CARD_LANGS, avoidedTerms, cardPngName, ledgerStats, loadCard, tweetLength, type CardLang } from "../lib/card.ts";
import { bakeFigures } from "../lib/card-figure.ts";
import { renderCardPng } from "../lib/card-render.ts";
import { launchBrowser } from "../lib/mobile.ts";
import { CliError, fail, info, ok, readMetaRaw, warn } from "../lib/util.ts";

export const CARD_HELP = `rh card <slug> [--lang zh|en]

  把报告目录里的 card.yml 渲染成推特卡片：card.png（中文）、card.en.png（英文），4:5、1200×1500。
  配图（figure.excalidraw）由 answer-me-with-html 烘焙成手绘 SVG，布局问题按 am 的检查报错。
  固定画布排版，内容超出画布、配图缩得太小都会失败（删减内容，不缩字号）。需要本机 Chrome。
  每种语言的 tweet 是配图发的推文文案（X 计数 ≤ 280，不画进图片）。
  报告页的阅读路径里会多出“推特卡片”模式，可一键复制文案和图片。
  已发布的报告也可以直接加卡片，之后用 rh publish <slug> --note "推特卡片" 上线。
  --lang   只渲染一种语言（默认渲染 card.yml 里写了的全部语言）`;

export async function cmdCard(cfg: HubConfig, argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { lang: { type: "string" }, help: { type: "boolean", short: "h" } },
  });
  if (values.help || positionals.length !== 1) {
    info(CARD_HELP);
    if (!values.help) throw new CliError("需要一个 slug", 2);
    return;
  }
  if (values.lang && !(CARD_LANGS as readonly string[]).includes(values.lang)) throw new CliError(`--lang 只能是 ${CARD_LANGS.join(" / ")}`, 2);
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
  const langs = CARD_LANGS.filter((l) => card[l] && (!values.lang || values.lang === l));
  if (!langs.length) throw new CliError(`${slug}：${REPORT_FILES.card} 里没有 ${values.lang} 卡片`);

  const hasEnPage = existsSync(join(dir, REPORT_FILES.explainerEn)) || existsSync(join(dir, REPORT_FILES.htmlEn));
  if (!values.lang && hasEnPage && !card.en) warn("报告有英文版，但 card.yml 没有 en 卡片：英文页不会出现推特卡片模式");
  if (card.en && !hasEnPage) warn("报告没有英文版：en 卡片会渲染，但没有页面展示它");

  for (const lang of langs as CardLang[]) {
    for (const t of avoidedTerms(card[lang]!, cfg.cardAvoidTerms)) {
      warn(`${lang} 卡片提到了“${t}”：推特卡片以中立研究者身份发布，尽量不提（rh.config.json 的 cardAvoidTerms）`);
    }
  }
  const meta = readMetaRaw(dir);
  const ledger = ledgerStats(dir);
  if (!existsSync(cfg.amScript)) throw new CliError(`找不到 answer-me-with-html：${cfg.amScript}（配图要用它烘焙）`);
  info(`烘焙配图（answer-me-with-html）…`);
  const figures = bakeFigures(
    cfg.amScript,
    join(cfg.root, ".rh", "cards", slug),
    (langs as CardLang[]).map((lang) => ({ lang, figure: card[lang]!.figure })),
  );
  const browser = await launchBrowser();
  let failed = 0;
  try {
    for (const lang of langs as CardLang[]) {
      const content = card[lang]!;
      const baked = figures.get(lang)!;
      if (baked.errors.length || !baked.svg) {
        failed++;
        for (const e of baked.errors) fail(`${lang}：${e}`);
        continue;
      }
      const res = await renderCardPng(browser, { lang, content, date: content.date ?? String(meta.updated), ledger, figureSvg: baked.svg });
      const out = join(dir, cardPngName(lang));
      if (res.errors.length) {
        failed++;
        for (const e of res.errors) fail(`${lang}：${e}`);
        const preview = join(cfg.root, ".rh", "cards", slug, `overflow-${lang}.png`);
        writeFileSync(preview, res.png);
        info(`    超出部分被裁掉的预览：${relative(cfg.root, preview)}`);
        continue;
      }
      writeFileSync(out, res.png);
      ok(`${lang}：${relative(cfg.root, out)}（剩余空白 ${res.slack}px）`);
      info(`  推文文案（X 计数 ${tweetLength(content.tweet)} / 280）：`);
      for (const line of content.tweet.split("\n")) info(`  │ ${line}`);
    }
  } finally {
    await browser.close();
  }
  if (failed) throw new CliError(`${slug}：${failed} 张卡片排版失败，没有写出。按上面的提示删减 card.yml 后重试`);
  info("用 Read 工具或图片查看器看一遍 PNG；上线：rh publish <slug> --note \"推特卡片\"");
}

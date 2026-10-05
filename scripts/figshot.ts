/**
 * 逐图截图：pnpm figshot <slug> [--width 1280] [--panels A,B]
 *
 * 把报告 index.html 里每张图（figure.am-fig 的画布）单独截图，供人工检查重叠、截断、文字过小。
 * 用来代替 `am shot`：am shot 会先截整页，页面很长时可能卡住。
 * 输出：.rh/figs/<slug>/w<width>/fig-N.png（以及 panel-X.png）。只读报告，不改任何文件。
 */
import { mkdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { launchBrowser } from "../cli/lib/mobile.ts";
import { loadConfig } from "../lib/config.ts";
import { loadReports } from "../lib/reports.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { width: { type: "string", default: "1280" }, panels: { type: "string", default: "" } },
});
if (positionals.length !== 1) {
  console.error("用法：pnpm figshot <slug> [--width 1280] [--panels A,B]");
  process.exit(2);
}
const cfg = loadConfig();
const slug = positionals[0];
const report = loadReports(cfg.root).reports.find((r) => r.slug === slug);
if (!report) {
  console.error(`找不到报告“${slug}”`);
  process.exit(1);
}
const width = Number(values.width);
if (!Number.isInteger(width) || width < 320) {
  console.error("--width 必须是不小于 320 的整数");
  process.exit(2);
}
const outDir = join(cfg.root, ".rh", "figs", slug, `w${width}`);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 1000 });
  await page.goto(`file://${join(report.dir, "index.html")}`, { waitUntil: "load" });
  const ids = await page.$$eval("figure.am-fig", (els) => els.map((e) => e.id).filter(Boolean));
  const files: string[] = [];
  for (const id of ids) {
    const el = (await page.$(`#${id} .am-fig-canvas`)) ?? (await page.$(`#${id}`));
    if (!el) continue;
    const file = join(outDir, `${id}.png`);
    await el.screenshot({ path: file });
    files.push(file);
  }
  for (const p of values.panels.split(",").map((s) => s.trim()).filter(Boolean)) {
    const el = await page.$(`#panel-${p}`);
    if (!el) {
      console.error(`! 没有面板 ${p}`);
      continue;
    }
    const file = join(outDir, `panel-${p}.png`);
    await el.screenshot({ path: file });
    files.push(file);
  }
  console.log(`✓ ${files.length} 张截图（视口 ${width}px）→ ${relative(cfg.root, outDir)}/`);
  for (const f of files) console.log(`  ${relative(cfg.root, f)}`);
} finally {
  await browser.close();
}

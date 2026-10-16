/**
 * 推特卡片的配图：把 card.yml 里每种语言的 Excalidraw 规格交给 answer-me-with-html 渲染并烘焙成 SVG。
 * 复用 am 的布局检查（节点重叠、边标签放不下等）与手绘字体；一次渲染所有语言，只启动一次 Chrome。
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CardLang, FigureSpec } from "./card.ts";

export interface BakedFigure {
  svg: string | null;
  errors: string[];
}

/** am 的 q= 属性值：去掉双引号与换行。 */
const attr = (s: string): string => s.replace(/\*\*/g, "").replace(/["\n]/g, "'");

/** 生成只含配图的 am 稿件；返回稿件文本与每张图 JSON 所在的行号范围。 */
export function figureDraft(figures: { lang: CardLang; figure: FigureSpec }[]): { draft: string; ranges: { lang: CardLang; from: number; to: number }[] } {
  const lines = ["---", "template: sheet", "title: card figures", "---"];
  const ranges: { lang: CardLang; from: number; to: number }[] = [];
  figures.forEach(({ lang, figure }, i) => {
    lines.push(`## ${String.fromCharCode(65 + i)} ${lang}`);
    const from = lines.length + 1;
    lines.push(`\`\`\`excalidraw q="${attr(figure.caption)}" name=card-${lang}`);
    lines.push(...JSON.stringify(figure.excalidraw, null, 1).split("\n"));
    lines.push("```");
    ranges.push({ lang, from, to: lines.length });
    lines.push("");
  });
  return { draft: `${lines.join("\n")}\n`, ranges };
}

/** 从 am 生成的页面里取出 data-name="card-<lang>" 那张图的烘焙 SVG。 */
export function extractFigureSvg(html: string, lang: CardLang): string | null {
  const start = html.search(new RegExp(`<figure[^>]*data-name="card-${lang}"`));
  if (start < 0) return null;
  const end = html.indexOf("</figure>", start);
  const fig = html.slice(start, end);
  const s = fig.indexOf("<svg");
  const e = fig.lastIndexOf("</svg>");
  return s >= 0 && e > s ? fig.slice(s, e + "</svg>".length) : null;
}

export function bakeFigures(amScript: string, workDir: string, figures: { lang: CardLang; figure: FigureSpec }[]): Map<CardLang, BakedFigure> {
  const out = new Map<CardLang, BakedFigure>(figures.map((f) => [f.lang, { svg: null, errors: [] }]));
  if (!figures.length) return out;
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  const { draft, ranges } = figureDraft(figures);
  writeFileSync(join(workDir, "figures.md"), draft);
  const r = spawnSync(process.execPath, [amScript, "render", "figures.md", "-o", "figures.html", "--no-open", "--style", "off"], {
    cwd: workDir,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  const log = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  for (const line of log.split("\n")) {
    const m = /^\s*✗\s*L(\d+)\s*(.*)$/.exec(line);
    if (!m) continue;
    const n = Number(m[1]);
    const hit = ranges.find((x) => n >= x.from && n <= x.to) ?? ranges[0];
    out.get(hit.lang)!.errors.push(`配图：${m[2].replace(/^\[excalidraw\]\s*/, "")}`);
  }
  if (r.status !== 0) {
    if ([...out.values()].every((f) => !f.errors.length)) {
      for (const f of out.values()) f.errors.push(`配图：am render 失败（退出码 ${r.status}）：${log.trim().split("\n").slice(0, 3).join(" / ")}`);
    }
    return out;
  }
  const html = readFileSync(join(workDir, "figures.html"), "utf8");
  for (const { lang } of figures) {
    const svg = extractFigureSvg(html, lang);
    const f = out.get(lang)!;
    if (svg) f.svg = svg;
    else f.errors.push("配图没有烘焙成 SVG（检查本机 Chrome / Node 22+）");
  }
  return out;
}

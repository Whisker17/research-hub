/**
 * 推特卡片的配图：把 card.yml 里的 Excalidraw 规格交给 answer-me-with-html 渲染并烘焙成 SVG。
 * 复用 am 的布局检查（节点重叠、边标签放不下等）与手绘字体。
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FigureSpec } from "./card.ts";

export interface BakedFigure {
  svg: string | null;
  errors: string[];
}

/** am 的 q= 属性值：去掉双引号与换行。 */
const attr = (s: string): string => s.replace(/\*\*/g, "").replace(/["\n]/g, "'");

/** 生成只含这张配图的 am 稿件。 */
export function figureDraft(figure: FigureSpec): string {
  return [
    "---",
    "template: sheet",
    "title: card figure",
    "---",
    "## A figure",
    `\`\`\`excalidraw q="${attr(figure.caption)}" name=card-figure`,
    JSON.stringify(figure.excalidraw, null, 1),
    "```",
    "",
  ].join("\n");
}

/** 从 am 生成的页面里取出 data-name="card-figure" 那张图的烘焙 SVG。 */
export function extractFigureSvg(html: string): string | null {
  const start = html.search(/<figure[^>]*data-name="card-figure"/);
  if (start < 0) return null;
  const end = html.indexOf("</figure>", start);
  const fig = html.slice(start, end);
  const s = fig.indexOf("<svg");
  const e = fig.lastIndexOf("</svg>");
  return s >= 0 && e > s ? fig.slice(s, e + "</svg>".length) : null;
}

export function bakeFigure(amScript: string, workDir: string, figure: FigureSpec): BakedFigure {
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  writeFileSync(join(workDir, "figure.md"), figureDraft(figure));
  const r = spawnSync(process.execPath, [amScript, "render", "figure.md", "-o", "figure.html", "--no-open", "--style", "off"], {
    cwd: workDir,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  const log = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const errors = log
    .split("\n")
    .map((line) => /^\s*✗\s*L\d+\s*(.*)$/.exec(line)?.[1])
    .filter((m): m is string => Boolean(m))
    .map((m) => `配图：${m.replace(/^\[excalidraw\]\s*/, "")}`);
  if (r.status !== 0) {
    if (!errors.length) errors.push(`配图：am render 失败（退出码 ${r.status}）：${log.trim().split("\n").slice(0, 3).join(" / ")}`);
    return { svg: null, errors };
  }
  const svg = extractFigureSvg(readFileSync(join(workDir, "figure.html"), "utf8"));
  return svg ? { svg, errors } : { svg: null, errors: [...errors, "配图没有烘焙成 SVG（检查本机 Chrome / Node 22+）"] };
}

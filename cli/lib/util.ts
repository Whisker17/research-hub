/** CLI 公共工具：输出、日期、meta 读写、交互确认、git。 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { Meta, TagRegistry } from "../../lib/schema.ts";

export class CliError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
export const c = { red: paint("31"), green: paint("32"), yellow: paint("33"), dim: paint("2"), bold: paint("1") };

export const ok = (msg: string): void => console.log(`${c.green("✓")} ${msg}`);
export const warn = (msg: string): void => console.log(`${c.yellow("!")} ${msg}`);
export const fail = (msg: string): void => console.log(`${c.red("✗")} ${msg}`);
export const info = (msg: string): void => console.log(msg);

/** 本地时区的今天（YYYY-MM-DD）。可用 RH_TODAY 固定（测试用）。 */
export function today(): string {
  if (process.env.RH_TODAY) return process.env.RH_TODAY;
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const META_KEY_ORDER: (keyof Meta)[] = [
  "title", "summary", "created", "updated", "domain", "tags", "status", "visibility", "kind",
  "source_repo", "brief_source", "am_version", "series", "related", "changelog",
];

export function readMetaRaw(dir: string): Record<string, unknown> {
  return (parseYaml(readFileSync(join(dir, "meta.yml"), "utf8")) ?? {}) as Record<string, unknown>;
}

export function writeMeta(dir: string, meta: Record<string, unknown>): void {
  const ordered: Record<string, unknown> = {};
  for (const k of META_KEY_ORDER) if (meta[k] !== undefined) ordered[k] = meta[k];
  for (const [k, v] of Object.entries(meta)) if (!(k in ordered) && v !== undefined) ordered[k] = v;
  writeFileSync(join(dir, "meta.yml"), stringifyYaml(ordered, { lineWidth: 0 }));
}

export function writeTags(root: string, tags: TagRegistry): void {
  const sorted = Object.fromEntries(Object.entries(tags).sort(([a], [b]) => a.localeCompare(b)));
  const header = "# 标签登记表：报告的 tags 必须在这里登记（rh tags add <tag> --label <展示名>）。\n# 键只用小写字母、数字和连字符；同一个概念只登记一个键，避免同义词分裂。\n";
  writeFileSync(join(root, "tags.yml"), header + stringifyYaml({ tags: sorted }, { lineWidth: 0 }));
}

export async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

export async function ask(question: string): Promise<string> {
  if (!process.stdin.isTTY) return "";
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

export function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function splitList(v: string | undefined): string[] {
  return (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** 从文件名或标题生成 slug；含非 ASCII 字符时返回 null（需要用户用 --slug 指定）。 */
export function slugify(name: string): string | null {
  const s = name
    .replace(/\.[a-z0-9]+$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // eslint-disable-next-line no-control-regex
  if (!s || /[^\x00-\x7f]/.test(name.replace(/\.[a-z0-9]+$/i, ""))) return null;
  return s;
}

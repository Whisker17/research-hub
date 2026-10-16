/**
 * 仓库级配置：rh.config.json + 环境变量覆盖。
 * CLI 与 Astro 构建共用。所有路径都相对仓库根目录解析。
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface HubConfig {
  /** 仓库根目录（绝对路径）。测试可用 RH_ROOT 覆盖。 */
  root: string;
  /** 公开站点 URL（无尾斜杠），例如 https://research-hub.<sub>.workers.dev */
  publicUrl: string;
  /** 私有站点 URL（无尾斜杠），由 Cloudflare Access 保护 */
  privateUrl: string;
  /** Obsidian vault 根目录（绝对路径） */
  vaultDir: string;
  /** vault 内存放 brief 的目录（相对 vaultDir） */
  briefsDir: string;
  /** answer-me-with-html CLI（am.mjs）的绝对路径 */
  amScript: string;
  /** 推特卡片里尽量不出现的词（卡片以中立研究者身份发布）；出现时 rh card / rh check 给警告 */
  cardAvoidTerms: string[];
  /** 推特卡片页脚的水印（X 账号，如 @whisker17）；不设时页脚只有日期 */
  cardHandle: string;
  /** 推文文案的 X 计数上限：非会员 280；X 会员可以写长文（超过 280 的部分在信息流里折叠） */
  cardTweetMax: number;
}

interface RawConfig {
  publicUrl: string;
  privateUrl: string;
  vaultDir: string;
  briefsDir: string;
  amScript: string;
  cardAvoidTerms?: string[];
  cardHandle?: string;
  cardTweetMax?: number;
}

const expandHome = (p: string): string => (p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);
const trimSlash = (u: string): string => u.replace(/\/+$/, "");

export function repoRoot(): string {
  if (process.env.RH_ROOT) return resolve(process.env.RH_ROOT);
  // 从本文件往上找 rh.config.json。Astro 构建时本模块被打包到 .astro-dist/ 下，所以不能写死相对层级。
  for (const start of [dirname(fileURLToPath(import.meta.url)), process.cwd()]) {
    let dir = start;
    for (;;) {
      if (existsSync(join(dir, "rh.config.json"))) return dir;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error("找不到 rh.config.json；请在仓库内运行，或设置 RH_ROOT");
}

export function loadConfig(root: string = repoRoot()): HubConfig {
  const raw = JSON.parse(readFileSync(join(root, "rh.config.json"), "utf8")) as RawConfig;
  return {
    root,
    publicUrl: trimSlash(process.env.RH_PUBLIC_URL ?? raw.publicUrl),
    privateUrl: trimSlash(process.env.RH_PRIVATE_URL ?? raw.privateUrl),
    vaultDir: resolve(expandHome(process.env.RH_VAULT_DIR ?? raw.vaultDir)),
    briefsDir: raw.briefsDir,
    amScript: resolve(expandHome(process.env.AM_SCRIPT ?? raw.amScript)),
    cardAvoidTerms: Array.isArray(raw.cardAvoidTerms) ? raw.cardAvoidTerms.filter((t) => typeof t === "string") : [],
    cardHandle: typeof raw.cardHandle === "string" ? raw.cardHandle.trim() : "",
    cardTweetMax: Number.isInteger(raw.cardTweetMax) && raw.cardTweetMax! > 0 ? raw.cardTweetMax! : 280,
  };
}

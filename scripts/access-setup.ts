/**
 * pnpm access:setup —— 在 Cloudflare 控制台为私有站点开启 Access 之后运行一次。
 *
 * 1. 匿名请求私有站点：Access 开启后会 302 到 <team>.cloudflareaccess.com/...?kid=<AUD>。
 * 2. 从重定向地址读出团队域名与 AUD，写入 wrangler.private.jsonc。
 * 3. 重新部署私有 Worker（网关从 503“未配置”变为校验 Access JWT）。
 * 4. 再次匿名请求，确认仍被拦截。
 *
 * Access 还没开启时（匿名请求直接到达 Worker，得到 503），打印开启步骤并退出。
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../lib/config.ts";

const cfg = loadConfig();
const wranglerFile = join(cfg.root, "wrangler.private.jsonc");

async function probe(): Promise<{ status: number; location: string | null }> {
  const res = await fetch(`${cfg.privateUrl}/p/`, { redirect: "manual" });
  return { status: res.status, location: res.headers.get("location") };
}

const first = await probe();
const loc = first.location ? new URL(first.location, cfg.privateUrl) : null;
if (!loc || !loc.hostname.endsWith(".cloudflareaccess.com")) {
  console.log(`✗ 私有站点没有被 Cloudflare Access 拦截（匿名请求得到 HTTP ${first.status}）。先在控制台开启 Access：
  1. Cloudflare 控制台 → Workers & Pages → research-hub-private → Access 标签
  2. Protect this Worker behind Access（或 Domains 标签里 Production 一行的 “Enable Access”）
  3. 策略 Include：Emails = demiwhisker@gmail.com；再加 Include：Emails ending in = @mantle.xyz；Preview URL 保持关闭
  然后重新运行：pnpm access:setup`);
  process.exit(1);
}
const aud = loc.searchParams.get("kid");
if (!aud) {
  console.log(`✗ Access 重定向里没有 kid（AUD）：${loc.href}`);
  process.exit(1);
}
const team = loc.hostname;
console.log(`✓ Access 已开启：团队 ${team}，AUD ${aud}`);

let text = readFileSync(wranglerFile, "utf8");
text = text.replace(/"ACCESS_AUD":\s*"[^"]*"/, `"ACCESS_AUD": "${aud}"`).replace(/"ACCESS_TEAM_DOMAIN":\s*"[^"]*"/, `"ACCESS_TEAM_DOMAIN": "${team}"`);
writeFileSync(wranglerFile, text);
console.log("✓ 已写入 wrangler.private.jsonc");

execFileSync(join(cfg.root, "node_modules", ".bin", "wrangler"), ["deploy", "-c", "wrangler.private.jsonc", "--message", "access setup"], {
  cwd: cfg.root,
  stdio: "inherit",
});

const after = await probe();
if (after.status === 200) {
  console.log("✗ 部署后匿名请求得到 200：私有内容可能可被公开访问，立即检查 Access 配置！");
  process.exit(1);
}
console.log(`✓ 部署后匿名访问仍被拦截（HTTP ${after.status}）。提交 wrangler.private.jsonc：
  git add wrangler.private.jsonc && git commit -m "chore: configure Access AUD for private site" && git push`);

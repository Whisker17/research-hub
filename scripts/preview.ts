/**
 * 局域网预览：把已构建的 dist/private 与 dist/public 用 HTTP 发到本机所有网卡上，手机和桌面都能打开。
 * 先 node cli/rh.ts build，再 node scripts/preview.ts [端口]（私有站点用这个端口，公开站点用下一个）。
 * 只用于本机评审：没有 Cloudflare Access，私有站点对同一局域网里的任何人可见，看完就停掉。
 * 私有站点和线上 Worker 一样把 / 重定向到 /p/；页头的“公开站点”仍指向 rh.config.json 的 publicUrl（线上地址）。
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".txt": "text/plain; charset=utf-8" };
const port = Number(process.argv[2] ?? 4321);
const lan = Object.values(networkInterfaces()).flat().filter((a) => a && a.family === "IPv4" && !a.internal).map((a) => a!.address);

for (const [site, at, start] of [["private", port, "/p/"], ["public", port + 1, "/"]] as const) {
  const root = join(ROOT, "dist", site);
  if (!existsSync(root)) throw new Error(`没有 ${root}：先运行 node cli/rh.ts build`);
  createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    if (site === "private" && p === "/") return res.writeHead(302, { location: "/p/" }).end();
    if (p.endsWith("/")) p += "index.html";
    const f = join(root, p);
    if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) return res.writeHead(404, { "content-type": MIME[".html"] }).end(readFileSync(join(root, "404.html")));
    res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream", "cache-control": "no-store" }).end(readFileSync(f));
  }).listen(at, "0.0.0.0", () => {
    for (const host of ["127.0.0.1", ...lan]) console.log(`${site.padEnd(7)} http://${host}:${at}${start}`);
  });
}

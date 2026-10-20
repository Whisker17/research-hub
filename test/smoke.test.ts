/**
 * scripts/smoke.sh 对着本地 HTTP 服务跑（WHI-2077）：/build.json 晚几次才切到新版本 ⇒ 通过；
 * 一直不切 ⇒ 失败，并打印线上返回了什么、期望什么。
 * Daily 提交不改首页，所以服务从一开始就返回与产物相同的 index.html，版本只看 /build.json。
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const REPO = join(import.meta.dirname, "..");
const INDEX = "<!doctype html><title>research-hub</title>\n";
const OLD = '{"sha":"1111111111111111111111111111111111111111"}';
const NEW = '{"sha":"2222222222222222222222222222222222222222"}';

const dirs: string[] = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** 公开站点：前 staleFor 次 /build.json 返回旧版本；私有站点（/private/…）对匿名请求返回 403 */
async function smoke(staleFor: number) {
  let buildRequests = 0;
  const server = createServer((req, res) => {
    if (req.url === "/") return res.end(INDEX);
    if (req.url === "/build.json") return res.end(buildRequests++ < staleFor ? OLD : NEW);
    res.statusCode = req.url?.startsWith("/private/") ? 403 : 404;
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const dir = mkdtempSync(join(tmpdir(), "rh-smoke-"));
  dirs.push(dir);
  mkdirSync(join(dir, "dist", "public"), { recursive: true });
  mkdirSync(join(dir, "scripts"));
  cpSync(join(REPO, "scripts", "smoke.sh"), join(dir, "scripts", "smoke.sh"));
  writeFileSync(join(dir, "rh.config.json"), JSON.stringify({ publicUrl: base, privateUrl: `${base}/private` }));
  writeFileSync(join(dir, "dist", "public", "index.html"), INDEX);
  writeFileSync(join(dir, "dist", "public", "build.json"), NEW);
  try {
    return await new Promise<{ code: number | null; out: string }>((resolve) => {
      const p = spawn("bash", [join(dir, "scripts", "smoke.sh")], { env: { ...process.env, SMOKE_INTERVAL: "0.05" } });
      let out = "";
      p.stdout.on("data", (d) => (out += d));
      p.stderr.on("data", (d) => (out += d));
      p.on("close", (code) => resolve({ code, out }));
    });
  } finally {
    server.close();
  }
}

test("smoke.sh：/build.json 晚几次才切到刚部署的版本 ⇒ 轮询后通过", async () => {
  const r = await smoke(5);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /✓ 公开站点 \/build\.json：\{"sha":"2{40}"\}/);
  assert.match(r.out, /✓ 私有站点 \/p\/ 匿名访问被拦截（403）/);
});

test("smoke.sh：/build.json 一直是旧版本 ⇒ 失败，并写出线上返回与期望", async () => {
  const r = await smoke(Infinity);
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /::error::公开站点 \/build\.json .*没有切到刚部署的版本/);
  assert.ok(r.out.includes(`期望 ${NEW}`) && r.out.includes(`线上 ${OLD}`), r.out);
  assert.doesNotMatch(r.out, /✓ 公开站点 \/build\.json/);
});

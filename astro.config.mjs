// @ts-check
import { readFileSync } from "node:fs";
import { defineConfig } from "astro/config";

const cfg = JSON.parse(readFileSync(new URL("./rh.config.json", import.meta.url), "utf8"));

// 只生成索引页 / 归档页；报告 HTML 由 rh build 原样分发到 /r/ 与 /p/。
// 样式全部内联、只用 is:inline 脚本，产物里没有共享的 _astro 资源，便于拆成公开 / 私有两份。
export default defineConfig({
  site: process.env.RH_PUBLIC_URL ?? cfg.publicUrl,
  output: "static",
  outDir: "./.astro-dist",
  trailingSlash: "always",
  build: { format: "directory", inlineStylesheets: "always" },
  devToolbar: { enabled: false },
  vite: { server: { fs: { allow: ["."] } } },
});

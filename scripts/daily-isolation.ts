/**
 * generate job 的隔离自检（WHI-1937，ADR 0004 §2、§11）。每次运行模型之前跑一遍，失败就不运行模型。
 *
 *   node daily-isolation.ts --work <dir> --home <dir> --plant <file> --out <dir>
 *
 * 不调用 LLM，也不用真实 key：起一个本地的假网关（Anthropic Messages 协议），用和真实运行完全相同的命令
 * （daily-generate.sh）启动 Claude Code，令牌是一个随机的 canary。假网关不“思考”，只按固定清单逐个发出工具调用：
 * 读 /proc/*\/environ、$HOME、/etc、工作目录外的私有文件，往工作目录外写文件，调用 Bash / WebFetch / WebSearch。
 * 期望：清单里的每个调用都被拒绝；两个对照调用（读 input/、写 out/）成功；canary 和私有文件的内容不出现在
 * 发给“模型”的任何请求、transcript 和 out/ 里；工作目录外没有多出文件；init 事件只列出 Read/Glob/Grep/Write/Edit，没有 MCP。
 * 这样证明的是工具层的真实权限，和模型愿不愿意照做无关。
 *
 * 只用 Node 内置模块：generate job 不 checkout 仓库，这个文件随 ingest 打包的工作目录 artifact 的 tools/ 一起送过去。
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join, relative } from "node:path";
import { parseArgs } from "node:util";

export const EXPECTED_TOOLS = ["Edit", "Glob", "Grep", "Read", "Write"];

export interface Probe {
  name: string;
  tool: string;
  input: Record<string, unknown>;
  /** allowed = 对照，必须成功；denied = 必须被拒绝；empty = 被拒绝，或者成功但什么都没找到（Glob 的 ../ 模式不会越出 cwd） */
  expect: "allowed" | "denied" | "empty";
}

export function probes(o: { work: string; home: string; plant: string; escape: string; parent: number }): Probe[] {
  const up = relative(o.work, o.plant);
  const deny = (name: string, tool: string, input: Record<string, unknown>): Probe => ({ name, tool, input, expect: "denied" });
  return [
    { name: "control: read input/", tool: "Read", input: { file_path: join(o.work, "input", "context.json") }, expect: "allowed" },
    { name: "control: write out/", tool: "Write", input: { file_path: join(o.work, "out", "probe.txt"), content: "ok\n" }, expect: "allowed" },
    deny("read /proc/self/environ", "Read", { file_path: "/proc/self/environ" }),
    deny("read parent /proc/<ppid>/environ", "Read", { file_path: `/proc/${o.parent}/environ` }),
    deny("read /proc/1/environ", "Read", { file_path: "/proc/1/environ" }),
    deny("glob /proc/*/environ", "Glob", { pattern: "*/environ", path: "/proc" }),
    deny("grep /proc/self/environ", "Grep", { pattern: "ANTHROPIC", path: "/proc/self/environ", output_mode: "content" }),
    deny("grep /proc/<ppid>", "Grep", { pattern: "CANARY", path: `/proc/${o.parent}`, glob: "environ", output_mode: "content" }),
    deny("read ~/.claude.json", "Read", { file_path: join(o.home, ".claude.json") }),
    deny("glob ~/**", "Glob", { pattern: "**/*", path: o.home }),
    deny("grep ~", "Grep", { pattern: "token|key", path: o.home, output_mode: "content" }),
    deny("read /etc/hostname", "Read", { file_path: "/etc/hostname" }),
    deny("read planted private file (absolute)", "Read", { file_path: o.plant }),
    deny("read planted private file (../)", "Read", { file_path: up }),
    deny("glob ** in ..", "Glob", { pattern: "**/*", path: ".." }),
    { name: "glob ../** from cwd", tool: "Glob", input: { pattern: "../**/*" }, expect: "empty" },
    deny("grep ..", "Grep", { pattern: "CANARY", path: "..", output_mode: "content" }),
    deny("write outside (../)", "Write", { file_path: relative(o.work, o.escape), content: "x\n" }),
    deny("write outside (absolute)", "Write", { file_path: `${o.escape}.tmp`, content: "x\n" }),
    deny("bash env", "Bash", { command: "env" }),
    deny("webfetch", "WebFetch", { url: "https://example.com/", prompt: "x" }),
    deny("websearch", "WebSearch", { query: "x" }),
  ];
}

// ───────── fake gateway ─────────

interface Req {
  messages?: { role: string; content: unknown }[];
  tools?: unknown[];
  stream?: boolean;
  model?: string;
}

const toolResults = (r: Req): number =>
  (r.messages ?? []).reduce((n, m) => n + (Array.isArray(m.content) ? m.content.filter((b: { type?: string }) => b?.type === "tool_result").length : 0), 0);

function reply(res: ServerResponse, r: Req, block: Record<string, unknown>, stop: string): void {
  const usage = { input_tokens: 1, output_tokens: 1 };
  const message = { id: `msg_${randomBytes(6).toString("hex")}`, type: "message", role: "assistant", model: r.model ?? "fake", content: [] as unknown[], stop_reason: null, stop_sequence: null, usage };
  if (!r.stream) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ...message, content: [block], stop_reason: stop }));
    return;
  }
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  const ev = (type: string, data: Record<string, unknown>) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  ev("message_start", { message });
  if (block.type === "tool_use") {
    ev("content_block_start", { index: 0, content_block: { ...block, input: {} } });
    ev("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
  } else {
    ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: block.text } });
  }
  ev("content_block_stop", { index: 0 });
  ev("message_delta", { delta: { stop_reason: stop, stop_sequence: null }, usage });
  ev("message_stop", {});
  res.end();
}

/** 假网关：带 tools 的请求按已收到的 tool_result 个数发出下一个探测调用；其余请求（标题、配额等）回一句文字。 */
export function fakeGateway(probeList: () => Probe[], bodies: string[]) {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      bodies.push(raw);
      if (req.method !== "POST" || !req.url?.includes("/messages")) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ type: "error", error: { type: "not_found_error", message: "not found" } }));
        return;
      }
      let r: Req = {};
      try {
        r = JSON.parse(raw) as Req;
      } catch {
        /* 空 */
      }
      if (req.url.includes("count_tokens")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ input_tokens: 1 }));
        return;
      }
      const list = probeList();
      const i = toolResults(r);
      if (!r.tools?.length || i >= list.length) return reply(res, r, { type: "text", text: "done" }, "end_turn");
      const p = list[i];
      reply(res, r, { type: "tool_use", id: `toolu_${String(i).padStart(3, "0")}`, name: p.tool, input: p.input }, "tool_use");
    });
  });
}

// ───────── check ─────────

interface Event {
  type?: string;
  subtype?: string;
  tools?: string[];
  mcp_servers?: unknown[];
  permissionMode?: string;
  message?: { content?: { type?: string; id?: string; tool_use_id?: string; is_error?: boolean; content?: unknown }[] };
}

export interface Row {
  probe: string;
  tool: string;
  expected: Probe["expect"];
  got: "allowed" | "denied" | "no result";
  ok: boolean;
  result: string;
}

export interface Verdict {
  ok: boolean;
  init: { tools: string[]; mcp_servers: unknown[]; permissionMode?: string } | null;
  rows: Row[];
  problems: string[];
}

/** 对照 transcript、假网关收到的请求、工作目录外的文件，给出结论。secrets = 不能出现在任何输出里的字符串。 */
export function verdict(o: { list: Probe[]; transcript: string; bodies: string[]; outFiles: Record<string, string>; secrets: string[]; strayPaths: string[] }): Verdict {
  const events = o.transcript
    .split("\n")
    .filter((l) => l.trim().startsWith("{"))
    .map((l) => JSON.parse(l) as Event);
  const problems: string[] = [];
  const initEv = events.find((e) => e.type === "system" && e.subtype === "init");
  const init = initEv ? { tools: [...(initEv.tools ?? [])].sort(), mcp_servers: initEv.mcp_servers ?? [], permissionMode: initEv.permissionMode } : null;
  if (!init) problems.push("没有 init 事件");
  else {
    if (JSON.stringify(init.tools) !== JSON.stringify(EXPECTED_TOOLS)) problems.push(`可用工具不对：${init.tools.join(",")}`);
    if (init.mcp_servers.length) problems.push(`加载了 MCP 服务器：${JSON.stringify(init.mcp_servers)}`);
  }
  const results = new Map<string, { is_error?: boolean; content?: unknown }>();
  for (const e of events) {
    if (e.type !== "user") continue;
    for (const b of e.message?.content ?? []) if (b.type === "tool_result" && b.tool_use_id) results.set(b.tool_use_id, b);
  }
  const rows: Row[] = o.list.map((p, i) => {
    const r = results.get(`toolu_${String(i).padStart(3, "0")}`);
    const got = !r ? "no result" : r.is_error ? "denied" : "allowed";
    const text = typeof r?.content === "string" ? r.content : JSON.stringify(r?.content ?? "");
    const ok = p.expect === "empty" ? got === "denied" || (got === "allowed" && text.trim() === "No files found") : got === p.expect;
    return { probe: p.name, tool: p.tool, expected: p.expect, got, ok, result: text.replace(/\s+/g, " ").slice(0, 160) };
  });
  for (const r of rows) if (!r.ok) problems.push(`${r.probe}：期望 ${r.expected}，实际 ${r.got}`);
  const haystacks: [string, string][] = [["transcript", o.transcript], ...o.bodies.map((b, i): [string, string] => [`request ${i}`, b]), ...Object.entries(o.outFiles).map(([k, v]): [string, string] => [`out/${k}`, v])];
  for (const s of o.secrets) for (const [where, text] of haystacks) if (s && text.includes(s)) problems.push(`秘密值出现在 ${where} 里`);
  for (const p of o.strayPaths) problems.push(`工作目录外出现了文件：${p}`);
  return { ok: problems.length === 0, init, rows, problems };
}

export function markdown(v: Verdict): string {
  const lines = [
    `### Generate isolation self-check: ${v.ok ? "PASS" : "FAIL"}`,
    "",
    `init: tools = ${v.init?.tools.join(", ") ?? "?"}; mcp_servers = ${JSON.stringify(v.init?.mcp_servers ?? null)}; permissionMode = ${v.init?.permissionMode ?? "?"}`,
    "",
    "| probe | tool | expected | got | tool result (first 160 chars) |",
    "| --- | --- | --- | --- | --- |",
    ...v.rows.map((r) => `| ${r.ok ? "✅" : "❌"} ${r.probe} | ${r.tool} | ${r.expected} | ${r.got} | ${r.result.replaceAll("|", "\\|")} |`),
    ...(v.problems.length ? ["", ...v.problems.map((p) => `- ❌ ${p}`)] : []),
  ];
  return `${lines.join("\n")}\n`;
}

// ───────── CLI ─────────

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { work: { type: "string" }, home: { type: "string" }, plant: { type: "string" }, out: { type: "string" }, runner: { type: "string" } } });
  const { work, home, plant, out } = values;
  if (!work || !home || !plant || !out) throw new Error("usage: daily-isolation.ts --work <dir> --home <dir> --plant <file> --out <dir> [--runner daily-generate.sh]");
  const runner = values.runner ?? join(import.meta.dirname, "daily-generate.sh");
  const canary = `CANARY-${randomBytes(12).toString("hex")}`;
  const plantCanary = `CANARY-PRIVATE-${randomBytes(12).toString("hex")}`;
  mkdirSync(dirname(plant), { recursive: true });
  writeFileSync(plant, `private report draft ${plantCanary}\n`);
  const escape = join(dirname(work), `escape-${randomBytes(4).toString("hex")}.txt`);
  // 父进程 = runner 脚本 exec 出来的 timeout（pid 不变），它的环境里有令牌：spawn 之后才知道 pid
  let list: Probe[] = [];
  const bodies: string[] = [];
  const server = fakeGateway(() => list, bodies);
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as { port: number }).port;
  mkdirSync(out, { recursive: true });
  const transcriptFile = join(out, "isolation.transcript.jsonl");
  const code = await new Promise<number>((ok) => {
    const child = spawn("bash", [runner, work, home, transcriptFile, join(out, "isolation.stderr")], {
      stdio: "inherit",
      env: { ...process.env, LLM_URL: `http://127.0.0.1:${port}`, LLM_TOKEN: canary, TIMEOUT: "300" },
    });
    list = probes({ work, home, plant, escape, parent: child.pid ?? 1 });
    child.on("exit", (c) => ok(c ?? 1));
  });
  server.close();
  const outDir = join(work, "out");
  const outFiles = Object.fromEntries(readdirSync(outDir).map((n) => [n, readFileSync(join(outDir, n), "utf8")]));
  const strayPaths = [escape, `${escape}.tmp`].filter((p) => existsSync(p));
  const v = verdict({ list, transcript: readFileSync(transcriptFile, "utf8"), bodies, outFiles, secrets: [canary, plantCanary], strayPaths });
  if (code !== 0) v.problems.push(`claude 退出码 ${code}`), (v.ok = false);
  writeFileSync(join(out, "isolation.json"), `${JSON.stringify({ ...v, requests: bodies.length }, null, 2)}\n`);
  const md = markdown(v);
  process.stdout.write(md);
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, md, { flag: "a" });
  return v.ok ? 0 : 1;
}

if (import.meta.main) process.exit(await main());

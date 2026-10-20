/**
 * 把一张卡片发到 Lark 自定义机器人（WHI-1972）。只用 node 内置模块。
 *
 *   node scripts/lark-post.ts <card.json> [--if-present]
 *       card.json = rh daily card 或 daily-notify-plan.ts alert 的输出（{msg_type, card}）
 *       --if-present：没有这个文件就什么都不发（notify job 每个实例都运行发送这一步，没有 Lark 密钥时总能写出 “Lark disabled”）
 *
 * 环境变量：LARK_WEBHOOK_URL、LARK_SIGNING_SECRET（Daily workflow 里只在发送这一步的 env 里）。两个都没设 = Lark 关闭：
 * job summary 写 “Lark disabled”，退出码 0，输出 sent=false。
 *
 *  - webhook 必须是 https://open.larksuite.com 或 https://open.feishu.cn，路径以 /open-apis/bot/v2/hook/ 开头；
 *  - fetch 不跟随重定向（redirect: "error"），每次 5 秒超时；每次尝试都重新取 timestamp、重新签名；
 *  - 只在网络错误（含超时）、HTTP 5xx 和 Lark 11232（限流）时重试，间隔 10 s、30 s、90 s；9499、19021 和其他错误码不重试；
 *  - 成功 = HTTP 200 且返回体 code == 0；完整请求超过 20 KB 就不发；
 *  - 日志只有 HTTP 状态、Lark code 和过滤后的 msg（≤ 120 字符），不写 URL、token、secret 或请求体。
 * 投递没有保证：确认发送成功之后，重复由 notify job 的台账尽力去重；仍可能重复；发送失败可以手动重发。
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { REQUEST_LIMIT, requestBody, sign, type LarkMessage } from "../lib/lark.ts";

export const LARK_HOSTS = ["open.larksuite.com", "open.feishu.cn"] as const;
export const HOOK_PATH = "/open-apis/bot/v2/hook/";
export const TIMEOUT_MS = 5000;
export const RETRY_DELAYS = [10_000, 30_000, 90_000] as const;
const RATE_LIMITED = 11232;

/** webhook URL 不合格的原因；合格返回 null。原因里不含 URL 本身。 */
export function webhookError(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "is not a URL";
  }
  if (u.protocol !== "https:") return "must use https";
  if (!(LARK_HOSTS as readonly string[]).includes(u.hostname) || u.port) return `host must be exactly ${LARK_HOSTS.join(" or ")}`;
  if (u.username || u.password || u.search || u.hash) return "must not carry credentials, a query or a fragment";
  if (!u.pathname.startsWith(HOOK_PATH) || u.pathname.length === HOOK_PATH.length) return `path must start with ${HOOK_PATH}<token>`;
  return null;
}

export interface PostDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  /** 毫秒 */
  now: () => number;
  log: (line: string) => void;
  timeoutMs?: number;
}

export interface PostResult {
  ok: boolean;
  attempts: number;
  /** 最后一次尝试的结果（已过滤） */
  last: string;
}

/** Lark 返回的 msg：去掉 URL、密钥材料和控制字符，最多 120 个字符 */
export function filterMsg(msg: unknown, secrets: string[]): string {
  let s = typeof msg === "string" ? msg : "";
  for (const x of secrets) if (x) s = s.split(x).join("<redacted>");
  s = s.replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, "<url>").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
  const cps = [...s.trim()];
  return cps.length > 120 ? `${cps.slice(0, 119).join("")}…` : cps.join("");
}

const isRedirect = (e: unknown): boolean => /redirect/i.test(String((e as { cause?: { message?: string } })?.cause?.message ?? ""));
const isTimeout = (e: unknown): boolean => (e as { name?: string })?.name === "TimeoutError";

export async function postCard(message: LarkMessage, url: string, secret: string, deps: PostDeps): Promise<PostResult> {
  const token = url.slice(url.indexOf(HOOK_PATH) + HOOK_PATH.length);
  const hide = [url, token, secret];
  let last = "";
  for (let attempt = 1; attempt <= RETRY_DELAYS.length + 1; attempt++) {
    const timestamp = String(Math.floor(deps.now() / 1000));
    const body = requestBody(message, timestamp, sign(timestamp, secret));
    const bytes = Buffer.byteLength(body);
    if (bytes > REQUEST_LIMIT) {
      last = `request is ${bytes} bytes, over the ${REQUEST_LIMIT}-byte limit; not sent`;
      deps.log(last);
      return { ok: false, attempts: attempt - 1, last };
    }
    let retry: boolean;
    try {
      const res = await deps.fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(deps.timeoutMs ?? TIMEOUT_MS),
      });
      // 读正文时的超时 / 断线是网络错误（外层 catch 重试）；只有解析失败才算 “不是 JSON”
      const text = await res.text();
      let code: unknown = null;
      let msg: unknown = "";
      try {
        const j = JSON.parse(text) as { code?: unknown; msg?: unknown };
        code = j.code ?? null;
        msg = j.msg ?? "";
      } catch {
        msg = "response body is not JSON";
      }
      last = `HTTP ${res.status}, code ${typeof code === "number" ? code : "none"}, msg ${filterMsg(msg, hide) || "-"}`;
      deps.log(`attempt ${attempt}: ${last}`);
      if (res.status === 200 && code === 0) return { ok: true, attempts: attempt, last };
      retry = res.status >= 500 || code === RATE_LIMITED;
    } catch (e) {
      if (isRedirect(e)) {
        last = "the webhook answered with a redirect; refused (not followed)";
        deps.log(`attempt ${attempt}: ${last}`);
        return { ok: false, attempts: attempt, last };
      }
      last = isTimeout(e) ? `timed out after ${(deps.timeoutMs ?? TIMEOUT_MS) / 1000} s` : `network error (${(e as Error)?.name ?? "Error"})`;
      deps.log(`attempt ${attempt}: ${last}`);
      retry = true;
    }
    if (!retry || attempt > RETRY_DELAYS.length) return { ok: false, attempts: attempt, last };
    const wait = RETRY_DELAYS[attempt - 1];
    deps.log(`retrying in ${wait / 1000} s`);
    await deps.sleep(wait);
  }
  return { ok: false, attempts: RETRY_DELAYS.length + 1, last };
}

/** 卡片文件的最小形状检查：{msg_type: "interactive", card: {...}} */
export function readMessage(text: string): LarkMessage {
  const m = JSON.parse(text) as Partial<LarkMessage>;
  if (m?.msg_type !== "interactive" || !m.card || typeof m.card !== "object" || Array.isArray(m.card)) throw new Error("the card file must be {msg_type: \"interactive\", card: {…}}");
  return { msg_type: "interactive", card: m.card };
}


export const DELIVERY_NOTE = "After a confirmed send, duplicates are suppressed best-effort; duplicates are possible; failed sends can be resent by hand (notify_only + force).";

export async function main(argv: string[], env: NodeJS.ProcessEnv = process.env, deps: Partial<PostDeps> = {}): Promise<number> {
  const summary = (line: string): void => {
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${line}\n`);
  };
  const output = (k: string, v: string): void => {
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `${k}=${v}\n`);
  };
  const ifPresent = argv.includes("--if-present");
  const rest = argv.filter((a) => a !== "--if-present");
  const [file] = rest;
  if (!file || rest.length !== 1 || file.startsWith("-")) {
    console.error("usage: node scripts/lark-post.ts <card.json> [--if-present]");
    return 2;
  }
  const url = env.LARK_WEBHOOK_URL ?? "";
  const secret = env.LARK_SIGNING_SECRET ?? "";
  if (!url || !secret) {
    // 只设了一个也算关闭（要求签名校验），但给出警告
    if (url || secret) console.log("::warning::only one of LARK_WEBHOOK_URL / LARK_SIGNING_SECRET is set; set both (signature verification is required) or neither");
    console.log("Lark disabled: LARK_WEBHOOK_URL / LARK_SIGNING_SECRET are not set; nothing was sent.");
    summary("**Lark disabled** — LARK_WEBHOOK_URL / LARK_SIGNING_SECRET are not set; nothing was sent (README → Lark 推送).");
    output("sent", "false");
    return 0;
  }
  if (ifPresent && !existsSync(file)) {
    console.log("Lark: no card to send in this run.");
    output("sent", "false");
    return 0;
  }
  const bad = webhookError(url);
  if (bad) {
    console.error(`::error::LARK_WEBHOOK_URL ${bad}`);
    return 1;
  }
  const message = readMessage(readFileSync(file, "utf8"));
  const log = deps.log ?? ((l: string) => console.log(l));
  const r = await postCard(message, url, secret, {
    fetch: deps.fetch ?? fetch,
    sleep: deps.sleep ?? ((ms) => new Promise((ok) => setTimeout(ok, ms))),
    now: deps.now ?? Date.now,
    log,
    timeoutMs: deps.timeoutMs,
  });
  if (r.ok) {
    summary(`Lark: sent (${r.attempts} attempt${r.attempts === 1 ? "" : "s"}; ${r.last}). ${DELIVERY_NOTE}`);
    output("sent", "true");
    return 0;
  }
  console.error(`::error::Lark send failed after ${r.attempts} attempt(s): ${r.last}`);
  summary(`**Lark send failed** after ${r.attempts} attempt(s): ${r.last}. ${DELIVERY_NOTE}`);
  output("sent", "false");
  return 1;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));

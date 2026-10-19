/**
 * Daily workflow 的 Lark 推送决策（WHI-1972）。.github/workflows/daily.yml 的 notify / alert job 调用；不发送（发送是 scripts/lark-post.ts）。
 *
 *   decide   notify 的第一步：按 toJSON(needs)、notify_only 和这一天的 final 标志决定 proceed（用线上版本或 deploy 报告的 SHA）/ skip / refuse
 *   live     读公开站点的 /build.json 得到线上版本的 SHA；正常路径要求它等于 deploy 报告的 deployed_sha
 *   verify   在线上版本的 daily/ 上算卡片输入的哈希，要求等于线上页面的 <meta name="rh-daily-hash">；再按状态判断这一天该不该发
 *   ledger   发送台账（Actions cache）查到之后：同一个 key 已确认发过 → 跳过；notify_only + force → Resent；同一天内容变了 → Updated
 *   alert    运行失败的提醒卡片：只用 plan 的输出（日期）、各 job 的结果和运行链接；plan 失败时日期写 “date unknown”
 *
 * skip / refuse 都不发卡片、退出码 0，原因写进 job summary（refuse 另有 ::warning::）；失败由 alert job 报告。
 * 顶层只 import node 内置模块和不依赖第三方包的 lib/lark.ts、lib/config.ts：alert job 不装依赖。verify 动态加载 Daily 的 schema。
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadConfig } from "../lib/config.ts";
import { canonicalJson, isDate, md, sha256, type LarkMessage } from "../lib/lark.ts";

export const UPSTREAM = ["ingest", "generate", "commit", "deploy"] as const;
export const JOBS = ["plan", ...UPSTREAM, "notify"] as const;
const SHA_RE = /^[0-9a-f]{40}$/;
const short = (s: string | undefined): string => (s ? s.slice(0, 12) : "none");

export type Needs = Record<string, { result?: string; outputs?: Record<string, string> } | undefined>;

// ───────── decide ─────────

export type Decision =
  | { action: "proceed"; source: "live"; reason: string }
  | { action: "proceed"; source: "deployed"; deployedSha: string; reason: string }
  | { action: "skip" | "refuse"; reason: string };

/**
 * 从上游 job 的结果决定这次 notify 用哪个版本：
 *  - 任何上游 failure / cancelled → refuse（alert job 报告失败）；
 *  - notify_only（上游按设计全部 skipped）→ 线上版本；
 *  - 推送了新内容且部署成功 → deploy 报告的 deployed_sha（必须等于推送的提交）；
 *  - 这次没有新内容（commit / deploy 被跳过）→ 这一天的最后一次运行用线上版本，否则 skip；
 *  - 其他组合 → refuse。
 */
export function decide(o: { needs: Needs; notifyOnly: boolean; final: boolean }): Decision {
  const res = (j: string): string => o.needs[j]?.result ?? "missing";
  const refuse = (reason: string): Decision => ({ action: "refuse", reason });
  if (res("plan") !== "success") return refuse(`the plan job did not succeed (${res("plan")})`);
  const missing = UPSTREAM.filter((j) => !o.needs[j]);
  if (missing.length) return refuse(`needs is missing ${missing.join(", ")}`);
  const bad = UPSTREAM.filter((j) => res(j) === "failure" || res(j) === "cancelled");
  if (bad.length) return refuse(`${bad.map((j) => `${j} ${res(j)}`).join(", ")}; failures are reported by the alert job`);
  if (o.notifyOnly) {
    return UPSTREAM.every((j) => res(j) === "skipped")
      ? { action: "proceed", source: "live", reason: "notify_only: send from the live version" }
      : refuse(`notify_only, but upstream jobs ran (${UPSTREAM.map((j) => `${j}=${res(j)}`).join(", ")})`);
  }
  const commit = o.needs.commit!;
  if (res("commit") === "success" && commit.outputs?.pushed === "true") {
    if (res("deploy") !== "success") return refuse(`new content was pushed but not deployed (deploy ${res("deploy")}; only main deploys)`);
    const sha = o.needs.deploy!.outputs?.deployed_sha ?? "";
    if (!SHA_RE.test(sha)) return refuse("the deploy did not report deployed_sha (DEPLOY_ENABLED is not true, or the smoke test did not pass)");
    if (sha !== commit.outputs?.sha) return refuse(`the deploy reported ${short(sha)}, not the pushed commit ${short(commit.outputs?.sha)}`);
    return { action: "proceed", source: "deployed", deployedSha: sha, reason: `send from the deployed commit ${short(sha)}` };
  }
  if (res("deploy") === "skipped" && (res("commit") === "skipped" || res("commit") === "success")) {
    return o.final
      ? { action: "proceed", source: "live", reason: "no new content in this run; final run for this date, send from the live version" }
      : { action: "skip", reason: "no new content in this run, and it is not the final run for this date" };
  }
  return refuse(`unexpected job results (${UPSTREAM.map((j) => `${j}=${res(j)}`).join(", ")})`);
}

// ───────── live / verify ─────────

type Fetch = typeof fetch;
type Sleep = (ms: number) => Promise<void>;
const sleep: Sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** GET，不跟随重定向，15 秒超时；返回 [HTTP 状态, 正文] 或抛错 */
async function get(f: Fetch, url: string): Promise<[number, string]> {
  const res = await f(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) });
  return [res.status, await res.text()];
}

/**
 * 线上版本的 SHA（公开站点的 /build.json）。deployedSha 给定时要求相等：刚部署完可能还没生效，最多等约 1 分钟。
 */
export async function liveSha(o: { publicUrl: string; deployedSha?: string; fetch?: Fetch; sleep?: Sleep }): Promise<{ sha: string } | { refuse: string }> {
  const f = o.fetch ?? fetch;
  const tries = o.deployedSha ? 7 : 3;
  let last = "";
  for (let i = 1; i <= tries; i++) {
    try {
      const [status, body] = await get(f, `${o.publicUrl}/build.json`);
      let sha: unknown;
      try {
        sha = (JSON.parse(body) as { sha?: unknown })?.sha;
      } catch {
        sha = undefined;
      }
      if (status !== 200) last = `GET /build.json answered HTTP ${status}`;
      else if (typeof sha !== "string" || !SHA_RE.test(sha)) last = "/build.json has no commit SHA";
      else if (!o.deployedSha || sha === o.deployedSha) return { sha };
      else last = `the live site is at ${short(sha)}, but the deploy reported ${short(o.deployedSha)}`;
    } catch (e) {
      last = `GET /build.json failed (${(e as Error)?.name ?? "Error"})`;
    }
    if (i < tries) await (o.sleep ?? sleep)(10_000);
  }
  return { refuse: last };
}

/** 页面里的 <meta name="rh-daily-hash" content="<sha256>">；没有时返回 null */
export function pageHash(html: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/\bname=["']?rh-daily-hash["'\s>/]/i.test(tag)) continue;
    return /\bcontent=["']?([0-9a-f]{64})\b/.exec(tag)?.[1] ?? null;
  }
  return null;
}

export type Verify =
  | { action: "send"; status: string; hash: string; key: string; prefix: string; reason: string }
  | { action: "skip" | "refuse"; reason: string; status?: string; hash?: string };

export const ledgerKey = (kind: "daily" | "alert", date: string, hash: string): string => `lark-${kind}-${date}-${hash}`;

/**
 * 在线上版本（liveRoot，已 checkout 的 /build.json SHA）上判断这一天发不发、发哪一份：
 * pending → skip；degraded / empty 不是最后一次运行（也不是手动运行）→ skip；
 * 卡片输入的哈希必须等于线上页面的 rh-daily-hash，页面不存在或不一致 → refuse。
 */
export async function verifyLive(o: { liveRoot: string; date: string; final: boolean; fetch?: Fetch; sleep?: Sleep }): Promise<Verify> {
  if (!isDate(o.date)) throw new Error(`DATE must be YYYY-MM-DD: ${JSON.stringify(o.date)}`);
  const { loadDaily } = await import("../lib/daily.ts");
  const { cardInput, cardInputHash } = await import("../lib/daily-card.ts");
  const load = loadDaily(o.liveRoot);
  if (load.errors.length) return { action: "refuse", reason: `daily/ at the live version is not valid (${load.errors.length} errors)` };
  const day = load.days.find((d) => d.date === o.date);
  if (!day) return { action: "skip", reason: "the live version has no daily/ entry for this date" };
  const status = day.manifest.status;
  if (status === "pending") return { action: "skip", status, reason: "pending: nothing to send yet" };
  if (status !== "complete" && !o.final) return { action: "skip", status, reason: `${status}: degraded / empty days are sent only on the final scheduled run of the day or a manual run` };
  const hash = cardInputHash(cardInput(day));
  const page = `${loadConfig(o.liveRoot).publicUrl}/daily/${o.date}/`;
  let live: string | null = null;
  let why = "";
  for (let i = 1; i <= 3 && live === null; i++) {
    try {
      const [code, html] = await get(o.fetch ?? fetch, page);
      if (code === 200) live = pageHash(html) ?? "";
      else why = `the live page /daily/${o.date}/ answered HTTP ${code}`;
    } catch (e) {
      why = `GET /daily/${o.date}/ failed (${(e as Error)?.name ?? "Error"})`;
    }
    if (live === null && i < 3) await (o.sleep ?? sleep)(5_000);
  }
  if (live === null) return { action: "refuse", status, hash, reason: why };
  if (!live) return { action: "refuse", status, hash, reason: `the live page /daily/${o.date}/ has no rh-daily-hash` };
  if (live !== hash) return { action: "refuse", status, hash, reason: `the card input (${short(hash)}) differs from the live page (${short(live)})` };
  return { action: "send", status, hash, key: ledgerKey("daily", o.date, hash), prefix: `lark-daily-${o.date}-`, reason: `${status}, matches the live page` };
}

// ───────── ledger ─────────

export type Variant = "normal" | "updated" | "resent";

/**
 * 台账查过之后发不发、发哪种：notify_only + force → Resent（不看台账）；同一个 key 已确认发过 → 跳过；
 * 同一天以前发过另一份内容（台账里前缀匹配到别的 key），或这次是 regenerate → Updated。
 */
export function ledgerDecision(o: { notifyOnly: boolean; force: boolean; regenerate: boolean; key: string; hit: boolean; matched: string }): { send: boolean; variant: Variant; reason: string } {
  if (o.notifyOnly && o.force) return { send: true, variant: "resent", reason: "notify_only + force: resend" };
  if (o.hit || o.matched === o.key) return { send: false, variant: "normal", reason: "already sent (send ledger); to send again run notify_only with force" };
  if (o.regenerate || o.matched) return { send: true, variant: "updated", reason: o.regenerate ? "regenerated" : "this date was sent before with different content" };
  return { send: true, variant: "normal", reason: "not sent before" };
}

// ───────── alert ─────────

const RUN_URL_RE = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+$/;

function jsonList(s: string | undefined): unknown[] {
  try {
    const v = JSON.parse(s ?? "");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** 运行失败的提醒：日期（plan 失败时 “date unknown”）、失败的 job、运行链接。不含日志、错误详情或任何密钥。 */
export function alertCard(o: { needs: Needs; runUrl: string }): { message: LarkMessage; key: string; dates: string[]; failed: string[] } {
  if (!RUN_URL_RE.test(o.runUrl)) throw new Error("RUN_URL is not a GitHub Actions run URL");
  const plan = o.needs.plan;
  const pick = (s: string | undefined) => [...new Set(jsonList(s).map((d) => (d as { date?: unknown })?.date).filter(isDate))];
  const processed = pick(plan?.outputs?.dates);
  const dates = plan?.result === "success" ? (processed.length ? processed : pick(plan?.outputs?.notify)) : [];
  const failed = JOBS.filter((j) => o.needs[j]?.result === "failure");
  const hash = sha256(canonicalJson({ kind: "alert", dates, failed, run: o.runUrl }));
  const message: LarkMessage = {
    msg_type: "interactive",
    card: {
      config: { wide_screen_mode: true },
      header: { template: "red", title: { tag: "plain_text", content: `⚠️ Daily run failed · ${dates.join(", ") || "date unknown"}` } },
      elements: [
        { tag: "div", text: { tag: "lark_md", content: md(`Failed jobs: ${failed.join(", ") || "unknown"}`) } },
        { tag: "div", text: { tag: "lark_md", content: "No logs or error details are included; open the run for details (README → Daily Topics → 失败时)." } },
        { tag: "action", actions: [{ tag: "button", type: "danger", text: { tag: "plain_text", content: "Open the run" }, url: o.runUrl }] },
      ],
    },
  };
  return { message, key: ledgerKey("alert", dates[0] ?? "unknown", hash), dates, failed };
}

// ───────── CLI ─────────

const output = (k: string, v: string): void => {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
};
const summary = (line: string): void => {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
};
function report(date: string, action: string, reason: string): void {
  const line = `Lark ${date}: ${action} — ${reason}`;
  console.log(action === "refuse" ? `::warning::${line}` : line);
  summary(`- ${line}`);
  output("action", action);
  output("reason", reason);
}

export async function main(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const [cmd, ...rest] = argv;
  const { values } = parseArgs({ args: rest, options: { live: { type: "string" }, out: { type: "string" } } });
  const date = env.DATE ?? "";
  const needDate = (): void => {
    if (!isDate(date)) throw new Error(`DATE must be YYYY-MM-DD: ${JSON.stringify(date).slice(0, 40)}`);
  };
  switch (cmd) {
    case "decide": {
      needDate();
      const d = decide({ needs: JSON.parse(env.NEEDS ?? "{}") as Needs, notifyOnly: env.NOTIFY_ONLY === "true", final: env.FINAL === "true" });
      report(date, d.action, d.reason);
      if (d.action === "proceed") {
        output("source", d.source);
        output("deployed_sha", d.source === "deployed" ? d.deployedSha : "");
      }
      return;
    }
    case "live": {
      needDate();
      const deployed = env.SOURCE === "deployed" ? (env.DEPLOYED_SHA ?? "") : undefined;
      if (deployed !== undefined && !SHA_RE.test(deployed)) throw new Error("SOURCE=deployed needs DEPLOYED_SHA");
      const r = await liveSha({ publicUrl: loadConfig().publicUrl, deployedSha: deployed });
      if ("refuse" in r) return report(date, "refuse", r.refuse);
      console.log(`live version: ${r.sha}`);
      output("sha", r.sha);
      return;
    }
    case "verify": {
      needDate();
      if (!values.live) throw new Error("usage: verify --live <checkout of the live SHA>");
      const v = await verifyLive({ liveRoot: values.live, date, final: env.FINAL === "true" });
      report(date, v.action, v.reason);
      if (v.action === "send") {
        output("hash", v.hash);
        output("key", v.key);
        output("prefix", v.prefix);
      }
      return;
    }
    case "ledger": {
      needDate();
      const l = ledgerDecision({
        notifyOnly: env.NOTIFY_ONLY === "true",
        force: env.FORCE === "true",
        regenerate: env.REGENERATE === "true",
        key: env.KEY ?? "",
        hit: env.HIT === "true",
        matched: env.MATCHED ?? "",
      });
      report(date, l.send ? `send (${l.variant})` : "skip", l.reason);
      output("send", String(l.send));
      output("variant", l.variant);
      return;
    }
    case "alert": {
      if (!values.out) throw new Error("usage: alert --out <file>");
      const a = alertCard({ needs: JSON.parse(env.NEEDS ?? "{}") as Needs, runUrl: env.RUN_URL ?? "" });
      writeFileSync(values.out, `${JSON.stringify(a.message)}\n`);
      const line = `Lark alert: ${a.dates.join(", ") || "date unknown"}; failed: ${a.failed.join(", ") || "unknown"}`;
      console.log(line);
      summary(`- ${line}`);
      output("key", a.key);
      return;
    }
    default:
      throw new Error("usage: node scripts/daily-notify-plan.ts decide|live|verify|ledger|alert …");
  }
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (e) {
    console.error(`::error::${(e as Error).message.split("\n")[0]}`);
    process.exit(1);
  }
}

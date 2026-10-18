/**
 * rh topic select | dismiss | link（ADR 0004 §9，WHI-1935）：把 Daily 推荐交给人工把关点。
 * 只写 daily/state.yml；不写 vault，不建报告。同样的参数重复执行不做任何改动。
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { stringify as stringifyYaml } from "yaml";
import type { HubConfig } from "../../lib/config.ts";
import { DAILY_DIR, STATE_FILE, TOPIC_ID_RE, applyTopicState, loadDaily, type StateEntry, type Topic, type TopicsFile } from "../../lib/daily.ts";
import { loadReports } from "../../lib/reports.ts";
import { CliError, info, ok, today } from "../lib/util.ts";

export const TOPIC_HELP = `rh topic select <id>
rh topic dismiss <id> --reason <理由>
rh topic link <id> <slug>

  <id> 是公开页面 /daily/ 上的 topic id（形如 2026-10-18-3fa9c1）。三个命令都只写 daily/state.yml
  （不公开），在主克隆里运行，改动按内容通道提交。同样的参数重复执行不做任何改动。

  select   标记选中，并打印起草 brief 用的材料（研究问题、角度、引用）。不写 vault，不建报告；
           选中不等于 brief 已经批准：之后由 research-hub skill 在对话里起草 brief 和 meta，等把关 ①。
  dismiss  不做这个 topic，--reason 写明理由（只记在 state.yml）。dismissed 的 topic 以后还可以 select。
  link     报告建好后（draft 也可以）把 topic 关联到报告 <slug>。需要先 select；报告必须已经存在；
           link 是终态，不能改关联到另一篇报告。`;

export function cmdTopic(cfg: HubConfig, argv: string[]): void {
  const [sub, ...rest] = argv;
  if (sub !== "select" && sub !== "dismiss" && sub !== "link") {
    info(TOPIC_HELP);
    if (sub !== undefined && sub !== "-h" && sub !== "--help") throw new CliError(`未知子命令：${sub}`, 2);
    return;
  }
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: { reason: { type: "string" }, help: { type: "boolean", short: "h" } },
  });
  if (values.help) return info(TOPIC_HELP);
  const want = sub === "link" ? 2 : 1;
  if (positionals.length !== want || (sub === "dismiss") !== (values.reason !== undefined)) {
    throw new CliError(`用法：${TOPIC_HELP.split("\n").find((l) => l.startsWith(`rh topic ${sub}`))}`, 2);
  }
  const [id, slug] = positionals;
  if (!TOPIC_ID_RE.test(id)) throw new CliError(`topic id 必须是 YYYY-MM-DD-<6 位十六进制>：${id}`, 2);

  const load = loadDaily(cfg.root);
  if (load.errors.length) throw new CliError(`daily/ 不合法，先运行 rh daily check：\n${load.errors.join("\n")}`);
  const found = load.days.flatMap((d) => (d.topics?.topics ?? []).map((t) => ({ t, file: d.topics! }))).find((x) => x.t.id === id);
  if (!found) throw new CliError(`找不到 topic ${id}（daily/ 里没有这个 id）`);

  const at = today();
  let next: StateEntry;
  if (sub === "select") next = { state: "selected", at };
  else if (sub === "dismiss") {
    const reason = values.reason!.trim();
    if (!reason || reason.length > 300) throw new CliError("--reason 不能为空，最多 300 字", 2);
    next = { state: "dismissed", at, reason };
  } else {
    if (!loadReports(cfg.root).reports.some((r) => r.slug === slug)) throw new CliError(`报告 ${slug} 不存在：先在把关 ① 之后用 rh new 建好报告，再 link`);
    next = { state: "linked", at, report: slug };
  }

  const res = applyTopicState(load.state, id, next);
  if ("error" in res) throw new CliError(`${id}：${res.error}${load.state.topics[id] === undefined && sub === "link" ? "（先 rh topic select）" : ""}`);
  const cur = res.changed ? next : load.state.topics[id];
  if (res.changed) {
    writeFileSync(join(cfg.root, DAILY_DIR, STATE_FILE), stringifyYaml(res.state, { lineWidth: 0 }));
    ok(`${DAILY_DIR}/${STATE_FILE}：${id} → ${describe(cur)}`);
  } else {
    ok(`${id} 已经是 ${describe(cur)}，没有改动`);
  }
  if (sub === "select") info(material(found.t, found.file));
}

const describe = (e: StateEntry): string =>
  e.state === "linked" ? `linked（${e.report}，${e.at}）` : e.state === "dismissed" ? `dismissed（${e.at}：${e.reason}）` : `selected（${e.at}）`;

/** select 打印的起草材料：只读 topics.yml 里已经公开的内容。 */
function material(t: Topic, file: TopicsFile): string {
  const refs = t.references.map((r) => {
    if ("extra" in r) return `  - [${r.type}] ${r.extra}${r.note ? `\n      ${r.note}` : ""}`;
    const it = file.items[r.item_id];
    const who = it.author ? `@${it.author}` : it.source;
    const head = `  - [${r.type}] ${it.title ?? who}${it.title && it.author ? `（${who}）` : ""}${it.incomplete ? "（只有预览）" : ""}`;
    const urls = [it.url, it.origin_url && it.origin_url !== it.url ? `出处 ${it.origin_url}` : null].filter(Boolean).join("\n      ");
    return `${head}\n      ${urls}${r.note ? `\n      ${r.note}` : ""}`;
  });
  return [
    "",
    `# ${t.title}`,
    `  ${t.title_en}`,
    `日期 ${file.date} · ${t.domain} · confidence ${t.confidence} · 独立来源 ${t.evidence.independent_sources}`,
    `novelty: ${t.novelty.kind}${t.novelty.related.length ? `（related: ${t.novelty.related.join(", ")}）` : ""}`,
    `tags: ${t.tags.join(", ") || "—"}${t.proposed_tags.length ? `；proposed_tags（未登记）: ${t.proposed_tags.join(", ")}` : ""}`,
    "",
    "为什么是现在：",
    `  ${t.why_now}`,
    "研究问题（起草 brief 时重新斟酌）：",
    ...t.questions.map((q, i) => `  ${i + 1}. ${q}`),
    "角度：",
    `  ${t.angle}`,
    "引用（初始线索，未经核实）：",
    ...refs,
    "",
    "下一步：在对话里起草 brief 和 meta（visibility 默认 private）→ 把关 ① → 写 vault brief、rh new → rh topic link " + `${t.id} <slug>`,
    "本命令没有写 vault，也没有建报告。",
  ].join("\n");
}

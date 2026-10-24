/**
 * rh session add <slug>：把当前（或指定的）agent 会话追加到报告 meta.yml 的 sessions（ADR 0005 §11）。
 * 只追加；同一 runtime + id 已记录时不重复。
 */
import { parseArgs } from "node:util";
import type { HubConfig } from "../../lib/config.ts";
import { loadReports } from "../../lib/reports.ts";
import { formatZodIssues, metaSchema } from "../../lib/schema.ts";
import { resumeCommand } from "../../lib/session.ts";
import { SESSION_OPTIONS, resolveSession } from "../lib/create.ts";
import { CliError, info, ok, readMetaRaw, today, writeMeta } from "../lib/util.ts";

export const SESSION_HELP = `rh session add <slug> [--session <id> --runtime <pi|claude-code>] [--note <说明>]

  把 agent 会话记到报告 meta.yml 的 sessions（只追加，同一 runtime + id 不重复）。
  默认从环境变量识别：pi → PI_SESSION_ID，Claude Code → CLAUDE_CODE_SESSION_ID。
  只给 --runtime 时读该 runtime 的变量（两个变量都在时用它指明是哪一个）。
  rh paths <slug> 会为每个会话打印恢复命令。`;

export function cmdSession(cfg: HubConfig, argv: string[]): void {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { ...SESSION_OPTIONS, note: { type: "string" }, help: { type: "boolean", short: "h" } },
  });
  if (values.help) return info(SESSION_HELP);
  if (positionals[0] !== "add" || positionals.length !== 2) throw new CliError("用法：rh session add <slug> [--session <id> --runtime <r>] [--note <说明>]", 2);
  const slug = positionals[1];
  const report = loadReports(cfg.root).reports.find((r) => r.slug === slug);
  if (!report) throw new CliError(`找不到报告“${slug}”（或它的 meta.yml 不合法，先运行 rh check）`);
  const session = resolveSession(values);
  if (!session) {
    throw new CliError("识别不到当前会话（没有 PI_SESSION_ID / CLAUDE_CODE_SESSION_ID，或两者都有）：用 --session <id> --runtime <r> 指定，或用 --runtime 指明是哪一个", 2);
  }

  const meta = readMetaRaw(report.dir);
  const sessions = Array.isArray(meta.sessions) ? meta.sessions : [];
  if (sessions.some((s) => s?.runtime === session.runtime && s?.id === session.id)) {
    ok(`会话已记录：${resumeCommand(session)}`);
    return;
  }
  const note = values.note?.trim();
  sessions.push({ ...session, at: today(), ...(note ? { note } : {}) });
  meta.sessions = sessions;
  const parsed = metaSchema.safeParse(meta);
  if (!parsed.success) throw new CliError(`meta 不合法：\n  ${formatZodIssues(parsed.error).join("\n  ")}`);
  writeMeta(report.dir, meta);
  ok(`记录会话 ${slug}：${resumeCommand(session)}`);
}

/**
 * 报告会话（ADR 0005 §11）：从环境变量识别当前 agent 会话，并给出恢复命令。
 * pi 导出 PI_SESSION_ID；Claude Code 导出 CLAUDE_CODE_SESSION_ID（WHI-2155 实测：Claude Code 2.1.287，
 * `claude -p --session-id <uuid>` 的 Bash 工具环境里该变量等于 <uuid>）。
 */
import type { SessionRuntime } from "./schema.ts";

export interface Session {
  runtime: SessionRuntime;
  id: string;
}

const ENV_VAR: Record<SessionRuntime, string> = { pi: "PI_SESSION_ID", "claude-code": "CLAUDE_CODE_SESSION_ID" };

/**
 * 识别当前会话。给了 runtime 只看该 runtime 的变量；没给时只有一个 runtime 的变量存在才返回——
 * 两个都在说明是嵌套启动（子进程继承了父会话的变量），分不清是哪一个，返回 null。
 */
export function detectSession(env: Record<string, string | undefined>, runtime?: SessionRuntime): Session | null {
  const found = (Object.keys(ENV_VAR) as SessionRuntime[])
    .filter((r) => !runtime || r === runtime)
    .map((r) => ({ runtime: r, id: env[ENV_VAR[r]]?.trim() ?? "" }))
    .filter((s) => s.id);
  return found.length === 1 ? found[0] : null;
}

export function resumeCommand(s: Session): string {
  return s.runtime === "pi" ? `pi --session ${s.id}` : `claude --resume ${s.id}`;
}

#!/usr/bin/env bash
# Daily generate job 运行 Claude Code 的唯一入口（WHI-1937，ADR 0004 §2、§11）。真实运行和隔离自检（daily-isolation.ts）用的是这同一个文件。
#
#   daily-generate.sh <work dir> <home dir> <transcript.jsonl> <stderr file>
#   环境变量：LLM_URL、LLM_TOKEN（只经环境传入，不进 argv，否则 /proc/*/cmdline 能看到）、MODEL、TIMEOUT（秒）
#
# 参数和 .claude/skills/daily-topics/references/input.md、test/fixtures/daily/eval/run.ts 相同：
#   --restricted          去掉 Bash 等执行代码的工具和 WebFetch，忽略用户 / 项目设置，文件工具限制在工作目录（cwd）里
#   --strict-mcp-config   不加载任何 MCP 服务器
#   --tools               只给 Read、Glob、Grep、Write、Edit
#   --disallowedTools     再明确拒绝工作目录外的常见敏感路径（纵深防御；--restricted 已经挡住，自检两者都验证）
# 进程环境用 env -i 清空：只留 HOME（空的临时目录）、PATH、LANG 和网关变量。网关要求 Bearer，所以用 ANTHROPIC_AUTH_TOKEN。
set -euo pipefail
work=$1 home=$2 transcript=$3 errfile=$4
: "${LLM_URL:?}" "${LLM_TOKEN:?}" "${MODEL:?}" "${TIMEOUT:=1200}"
PROMPT='Read skill/SKILL.md and follow it exactly. The input directory is input/. The only file you may create or modify is out/topics.yml.'
cd "$work"
exec timeout "$TIMEOUT" env -i HOME="$home" PATH="$PATH" LANG=C.UTF-8 \
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 DISABLE_AUTOUPDATER=1 DISABLE_TELEMETRY=1 DISABLE_ERROR_REPORTING=1 \
  ANTHROPIC_BASE_URL="$LLM_URL" ANTHROPIC_AUTH_TOKEN="$LLM_TOKEN" \
  claude -p --model "$MODEL" --restricted --strict-mcp-config --tools "Read,Glob,Grep,Write,Edit" \
    --disallowedTools "Read(//proc/**)" "Read(//sys/**)" "Read(//etc/**)" "Read(~/**)" "Edit(//proc/**)" "Edit(~/**)" \
    --permission-mode acceptEdits --no-session-persistence --max-budget-usd 3 \
    --output-format stream-json --verbose "$PROMPT" > "$transcript" 2> "$errfile"

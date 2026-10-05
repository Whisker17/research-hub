/**
 * 论断台账（research/ledger.md）解析。
 *
 * 台账是一张 Markdown 表格，至少包含三列：论断（claim）、证据（evidence）、类型（type）。
 * 类型只能是 observed / inferred / speculative。表头可用中文或英文。
 */
export const CLAIM_KINDS = ["observed", "inferred", "speculative"] as const;

export interface LedgerRow {
  line: number;
  claim: string;
  evidence: string;
  kind: string;
}

export interface LedgerResult {
  rows: LedgerRow[];
  errors: string[];
}

const HEAD = {
  claim: /^(论断|claim|claims)$/i,
  evidence: /^(证据|evidence|source|sources|来源)$/i,
  kind: /^(类型|type|kind)$/i,
};

function splitRow(line: string): string[] | null {
  const t = line.trim();
  if (!t.startsWith("|")) return null;
  // 不拆开反引号内与转义的竖线
  const cells: string[] = [];
  let cur = "";
  let inCode = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === "\\" && t[i + 1] === "|") {
      cur += "|";
      i++;
      continue;
    }
    if (ch === "`") inCode = !inCode;
    if (ch === "|" && !inCode) {
      cells.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  // 去掉首尾竖线产生的空单元
  if (cells.length && cells[0].trim() === "") cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === "") cells.pop();
  return cells.map((c) => c.trim());
}

const isSeparator = (cells: string[]): boolean => cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));

export function parseLedger(markdown: string): LedgerResult {
  const lines = markdown.split(/\r?\n/);
  const errors: string[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) inFence = !inFence;
    if (inFence) continue;
    const head = splitRow(lines[i]);
    const sep = i + 1 < lines.length ? splitRow(lines[i + 1]) : null;
    if (!head || !sep || !isSeparator(sep)) continue;
    const ci = head.findIndex((h) => HEAD.claim.test(h));
    const ei = head.findIndex((h) => HEAD.evidence.test(h));
    const ki = head.findIndex((h) => HEAD.kind.test(h));
    if (ci < 0 || ei < 0 || ki < 0) continue;

    const rows: LedgerRow[] = [];
    for (let j = i + 2; j < lines.length; j++) {
      const cells = splitRow(lines[j]);
      if (!cells) break;
      const row: LedgerRow = {
        line: j + 1,
        claim: cells[ci] ?? "",
        evidence: cells[ei] ?? "",
        kind: (cells[ki] ?? "").replace(/[`*_]/g, "").trim().toLowerCase(),
      };
      if (!row.claim) errors.push(`第 ${row.line} 行：论断为空`);
      if (!row.evidence || /^(-|—|无|n\/a|todo|tbd)$/i.test(row.evidence)) errors.push(`第 ${row.line} 行：缺少证据（URL、file:line 或命令输出）`);
      if (!(CLAIM_KINDS as readonly string[]).includes(row.kind)) {
        errors.push(`第 ${row.line} 行：类型“${row.kind || "（空）"}”无效，只能是 ${CLAIM_KINDS.join(" / ")}`);
      }
      rows.push(row);
    }
    if (rows.length === 0) errors.push("台账表格没有任何论断行");
    return { rows, errors };
  }
  return { rows: [], errors: ["没有找到台账表格：需要一张包含“论断 | 证据 | 类型”三列的 Markdown 表格"] };
}

export const LEDGER_TEMPLATE = `# 论断台账

每条会出现在 explainer 里的论断，都要在这里有一行。
类型：observed（直接观察到，有一手证据）/ inferred（由证据推出）/ speculative（推测，需在页面上标明）。

| # | 论断 | 证据 | 类型 |
|---|---|---|---|
`;

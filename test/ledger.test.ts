import assert from "node:assert/strict";
import { test } from "node:test";
import { LEDGER_TEMPLATE, parseLedger } from "../lib/ledger.ts";

test("合法台账：三列齐全、类型有效", () => {
  const md = `# 台账\n\n| # | 论断 | 证据 | 类型 |\n|---|---|---|---|\n| C1 | pump.fun 用 bonding curve | https://pump.fun/docs | observed |\n| C2 | 迁移阈值影响狙击 | \`src/a.ts:12\` 与 C1 | inferred |\n`;
  const r = parseLedger(md);
  assert.deepEqual(r.errors, []);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[1].kind, "inferred");
});

test("英文表头与加粗类型也能识别", () => {
  const r = parseLedger(`| Claim | Evidence | Type |\n|:--|:--|:--|\n| a | https://x | **speculative** |\n`);
  assert.deepEqual(r.errors, []);
});

test("rh new 生成的空模板不通过", () => {
  const r = parseLedger(LEDGER_TEMPLATE);
  assert.ok(r.errors.some((e) => e.includes("没有任何论断行")));
});

test("缺证据、类型无效都会报错并带行号", () => {
  const r = parseLedger(`| 论断 | 证据 | 类型 |\n|---|---|---|\n| a | — | observed |\n| b | https://x | maybe |\n`);
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /第 3 行.*缺少证据/);
  assert.match(r.errors[1], /第 4 行.*maybe/);
});

test("没有台账表格时报错；代码块里的表格不算", () => {
  assert.ok(parseLedger("只有文字").errors[0].includes("没有找到台账表格"));
  const fenced = "```\n| 论断 | 证据 | 类型 |\n|---|---|---|\n| a | b | observed |\n```\n";
  assert.ok(parseLedger(fenced).errors[0].includes("没有找到台账表格"));
});

/**
 * 列表的排序与时间范围（WHI-1930，ADR 0003 §7）：lib/site-data.ts 的 arrangeCards。
 * 同一个函数以源码形式内联进 ReportList 的页面脚本；浏览器里的行为由 e2e.test.ts 在真实构建上检查。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { sortByUpdated, type Report } from "../lib/reports.ts";
import { arrangeCards, type RangeKey, type SortKey } from "../lib/site-data.ts";

const c = (slug: string, created: string, updated: string) => ({ slug, created, updated });
// 有同一天更新、同一天创建、两个日期都相同只能靠 slug 区分的行
const CARDS = [
  c("b", "2026-10-01", "2026-10-16"),
  c("a", "2026-10-01", "2026-10-16"),
  c("c", "2026-10-11", "2026-10-16"),
  c("d", "2026-10-11", "2026-10-12"),
  c("e", "2026-09-28", "2026-10-05"),
  c("f", "2026-10-31", "2026-10-31"),
  c("g", "2026-11-01", "2026-11-01"),
];
const NOW = new Date(2026, 9, 15, 23, 59); // 2026-10-15 周四，本地时间
const slugs = (sort: SortKey, range: RangeKey, now = NOW, cards = CARDS) => arrangeCards(cards, sort, range, now).map((x) => x.slug);

/** 所有排列里结果都一样（输入顺序不影响输出） */
function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

test("排序：最近更新 = updated 倒序 → created 倒序 → slug 升序", () => {
  assert.deepEqual(slugs("updated", "all"), ["g", "f", "c", "a", "b", "d", "e"]);
});

test("排序：最新创建 = created 倒序 → updated 倒序 → slug 升序", () => {
  assert.deepEqual(slugs("created", "all"), ["g", "f", "c", "d", "a", "b", "e"]);
});

test("排序：结果与输入顺序无关（确定的 tie-break），不改动输入数组", () => {
  const small = CARDS.slice(0, 5);
  for (const sort of ["updated", "created"] as const) {
    const want = slugs(sort, "all", NOW, small);
    for (const p of permutations(small)) assert.deepEqual(slugs(sort, "all", NOW, p), want, `${sort}: ${p.map((x) => x.slug)}`);
  }
  const copy = [...CARDS];
  arrangeCards(CARDS, "created", "week", NOW);
  assert.deepEqual(CARDS, copy);
});

test("排序：默认（最近更新 + 全部）与 projectSite 的服务端顺序 sortByUpdated 一致", () => {
  const reports = CARDS.map((x) => ({ slug: x.slug, meta: { created: x.created, updated: x.updated } }) as unknown as Report);
  assert.deepEqual(slugs("updated", "all"), sortByUpdated(reports).map((r) => r.slug));
});

test("时间范围：本周 = 本地日历周一到周日（含两端），按当前排序的日期字段", () => {
  // 2026-10-15 周四 → 本周是 10-12（周一）到 10-18（周日）
  assert.deepEqual(slugs("updated", "week"), ["c", "a", "b", "d"], "updated 在 10-12…10-18");
  assert.deepEqual(slugs("created", "week"), [], "没有报告在 10-12…10-18 创建");
  const edge = [c("mon", "2026-10-12", "2026-10-12"), c("sun", "2026-10-18", "2026-10-18"), c("prev-sun", "2026-10-11", "2026-10-11"), c("next-mon", "2026-10-19", "2026-10-19")];
  assert.deepEqual(slugs("created", "week", NOW, edge), ["sun", "mon"]);
  // 周日当天仍属于以周一开始的这一周；周一当天开始新的一周
  assert.deepEqual(slugs("created", "week", new Date(2026, 9, 18, 0, 0), edge), ["sun", "mon"]);
  assert.deepEqual(slugs("created", "week", new Date(2026, 9, 19, 0, 0), edge), ["next-mon"]);
  assert.deepEqual(slugs("created", "week", new Date(2026, 9, 11, 23, 59), edge), ["prev-sun"]);
});

test("时间范围：本周跨月 / 跨年时按日历计算", () => {
  const xs = [c("dec29", "2025-12-29", "2025-12-29"), c("jan4", "2026-01-04", "2026-01-04"), c("jan5", "2026-01-05", "2026-01-05"), c("dec28", "2025-12-28", "2025-12-28")];
  // 2026-01-01 周四 → 2025-12-29（周一）到 2026-01-04（周日）
  assert.deepEqual(slugs("created", "week", new Date(2026, 0, 1, 12), xs), ["jan4", "dec29"]);
});

test("时间范围：本月 = 本地日历月 1 日到月末（含两端）；全部不过滤", () => {
  assert.deepEqual(slugs("updated", "month"), ["f", "c", "a", "b", "d", "e"], "10 月更新的，不含 11-01");
  assert.deepEqual(slugs("created", "month"), ["f", "c", "d", "a", "b"], "10 月创建的，不含 09-28 与 11-01");
  const feb = [c("feb28", "2026-02-28", "2026-02-28"), c("mar1", "2026-03-01", "2026-03-01"), c("feb1", "2026-02-01", "2026-02-01"), c("jan31", "2026-01-31", "2026-01-31")];
  assert.deepEqual(slugs("created", "month", new Date(2026, 1, 1, 0, 0), feb), ["feb28", "feb1"]);
  assert.equal(slugs("updated", "all").length, CARDS.length);
});

test("时间范围：用浏览者本地时区的日期（同一时刻在不同时区可能是不同的“今天”）", () => {
  // now 的本地日期决定范围：本测试在 TZ 环境下运行时，new Date(年, 月, 日, …) 构造的就是本地时间
  const instant = new Date(2026, 9, 18, 23, 30); // 本地 10-18 周日深夜
  const xs = [c("sun", "2026-10-18", "2026-10-18"), c("mon", "2026-10-19", "2026-10-19")];
  assert.deepEqual(slugs("created", "week", instant, xs), ["sun"]);
  assert.deepEqual(slugs("created", "week", new Date(instant.getTime() + 60 * 60 * 1000), xs), ["mon"], "一小时后本地已是周一，新的一周");
});

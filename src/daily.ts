/**
 * Daily 页面（/daily/、/daily/<date>/，WHI-1936）的数据：只读 publicDay(day)，不读 state.yml 与 manifest 的内部字段（ADR 0004 §10）。
 * 只在构建时运行（读文件系统）。daily/ 不合法时构建失败（rh build 在调用 Astro 之前也会先跑同样的检查）。
 */
import { loadConfig } from "../lib/config.ts";
import { isHttpUrl, loadDaily, publicDay, type DayStatus, type PublicDay } from "../lib/daily.ts";
import type { I18nKey } from "./i18n.ts";

let cache: PublicDay[] | undefined;

/** 全部日期的公开投影，新的在前；没有 daily/ 时是空数组。 */
export function dailyDays(): PublicDay[] {
  if (cache) return cache;
  const load = loadDaily(loadConfig().root);
  if (load.errors.length) throw new Error(`daily/ 不合法，先运行 rh daily check：\n${load.errors.map((e) => `  ${e}`).join("\n")}`);
  return (cache = load.days.map(publicDay).sort((a, b) => b.date.localeCompare(a.date)));
}

/** 页面里的外部链接只允许 http(s)；其他协议（javascript:、data: …）不输出成链接。 */
export const safeHref = (url: string | null | undefined): string | undefined => (url && isHttpUrl(url) ? url : undefined);

/** "2026-10-18T04:31:07.000Z" → "2026-10-18 04:31 UTC" */
export const utcMinute = (iso: string): string => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

/** 日期状态的 chip 与公开说明（ADR 0004 §5：只用固定说明，不显示原始错误）。 */
export const DAY_STATUS: Record<DayStatus, { k: I18nKey; chip: string; why?: I18nKey }> = {
  complete: { k: "stComplete", chip: "chip-positive" },
  degraded: { k: "stDegraded", chip: "chip-highlight", why: "stDegradedWhy" },
  pending: { k: "stPending", chip: "chip-info", why: "stPendingWhy" },
  empty: { k: "stEmpty", chip: "chip-neutral", why: "stEmptyWhy" },
};

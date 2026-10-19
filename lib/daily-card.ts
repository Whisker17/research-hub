/**
 * Daily Topics 的 Lark 卡片（WHI-1972）：纯函数，文件进、JSON 出，不联网。
 *
 * 卡片输入 = 公开页面 /daily/<date>/ 的同一份投影 publicDay(day)，外加两项公开信息：各源只剩 ✓ / ✗，以及通过校验的 ETHTAO 日报链接。
 * 不含 manifest 的内部字段（调用次数、条目数、错误、run、generator、dropped）和 daily/state.yml。
 * 页面在 <meta name="rh-daily-hash"> 里放 cardInputHash(cardInput(day))：notify job 用它证明卡片和线上页面是同一份数据。
 * 站点链接只由 rh.config.json 的 publicUrl + 校验过的日期 + topic id 拼出，不用数据里的 URL。
 */
import { DAILY_SOURCES, TOPIC_ID_RE, publicDay, type Day, type DayStatus, type PublicDay, type Reason, type SourceId } from "./daily.ts";
import { CARD_BUDGET, canonicalJson, isDate, md, plain, requestBytes, sha256, type LarkMessage } from "./lark.ts";

export interface CardInput extends PublicDay {
  /** ok → ✓；partial、failed → ✗；skipped 不列出 */
  sources: { id: SourceId; ok: boolean }[];
  /** 只有 https://x.com/Ethtao_Ethtao/status/<数字> 才保留（去掉查询和锚点），否则 null */
  digest_url: string | null;
}

/** 卡片排版前的上限（字符数按码点） */
export const CARD_CAPS = { title: 80, title_en: 100, why_now: 120, tags: 4, tag: 24, topics: 10, sources: 8 } as const;

export function digestUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.origin !== "https://x.com" || u.username || u.password || !/^\/Ethtao_Ethtao\/status\/\d+$/.test(u.pathname)) return null;
    return `${u.origin}${u.pathname}`;
  } catch {
    return null;
  }
}

export function cardInput(day: Day): CardInput {
  const m = day.manifest;
  return {
    ...publicDay(day),
    sources: m.sources.filter((s) => s.status !== "skipped").map((s) => ({ id: s.id as SourceId, ok: s.status === "ok" })),
    digest_url: digestUrl(m.digest.url),
  };
}

/** 页面 meta 与发送台账用的哈希：键排序后的 JSON 的 sha256 */
export const cardInputHash = (input: CardInput): string => sha256(canonicalJson(input));

export type CardVariant = "normal" | "updated" | "resent";
export const CARD_VARIANTS: readonly CardVariant[] = ["normal", "updated", "resent"];

export interface BuiltCard {
  message: LarkMessage;
  /** 完整请求（含 timestamp 与 sign）的 UTF-8 字节数 */
  bytes: number;
  /** 放不下时退回的迷你卡片（日期、状态、数量、页面按钮） */
  fallback: boolean;
  /** 为了放下而去掉的 why_now / title_en 个数（从最后一个 topic 往前去） */
  dropped: { why_now: number; title_en: number };
}

const SOURCE_NAME: Record<SourceId, string> = {
  ethtao: "ETHTAO",
  ethresearch: "ethresear.ch",
  magicians: "Magicians",
  theblock: "The Block",
  blockbeats: "BlockBeats",
  odaily: "Odaily",
};
const REASON_TEXT: Record<Reason, string> = {
  digest_not_posted: "the ETHTAO Ethereum digest was not posted",
  digest_fetch_failed: "the ETHTAO Ethereum digest could not be fetched",
  generator_failed: "generation did not succeed",
  candidate_rejected: "the generated result did not pass the checks",
  few_topics: "fewer than 5 topics qualified",
  no_qualifying_topic: "no topic qualified",
  no_items: "no usable items in the window",
};
const TEMPLATE: Record<DayStatus, string> = { complete: "blue", degraded: "orange", empty: "grey", pending: "grey" };
const SUFFIX: Record<CardVariant, string> = { normal: "", updated: " · Updated", resent: " · Resent" };

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? "" : "s"}`;
const minute = (iso: string): string => `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
const text = (content: string) => ({ tag: "plain_text", content });
const div = (content: string) => ({ tag: "div", text: { tag: "lark_md", content } });
const button = (label: string, url: string, type: "primary" | "default") => ({ tag: "button", type, text: text(label), url });

/** publicUrl 的 origin（只接受 http(s)，不带路径）；不合法时抛错，不拼链接 */
function siteOrigin(publicUrl: string): string {
  const u = new URL(publicUrl);
  if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password || (u.pathname !== "/" && u.pathname !== "") || u.search || u.hash) {
    throw new Error(`publicUrl 必须是不带路径的 http(s) 地址：${publicUrl}`);
  }
  return u.origin;
}

/**
 * 当天的 Lark 卡片。先按 CARD_CAPS 截断，再排版；完整请求超过 budget（默认 18 KB）时，从最后一个 topic 往前去掉 why_now，
 * 再去掉 title_en；还放不下就退回迷你卡片。pending 没有卡片（抛错）。
 */
export function dailyCard(input: CardInput, o: { publicUrl: string; variant?: CardVariant; budget?: number }): BuiltCard {
  const { date, status } = input;
  if (!isDate(date)) throw new Error(`日期不合法：${date}`);
  if (status === "pending") throw new Error(`${date} 还是 pending，没有卡片`);
  const budget = o.budget ?? CARD_BUDGET;
  const page = `${siteOrigin(o.publicUrl)}/daily/${date}/`;
  const topics = input.topics.filter((t) => TOPIC_ID_RE.test(t.id) && t.id.startsWith(`${date}-`)).slice(0, CARD_CAPS.topics);
  const n = topics.length;
  const header = { template: TEMPLATE[status], title: text(`📰 Daily Topics · ${date} · ${plural(n, "topic")}${SUFFIX[o.variant ?? "normal"]}`) };
  const statusLine = status === "complete" ? null : `Status: ${status}${input.reasons.length ? ` — ${input.reasons.map((r) => REASON_TEXT[r]).join("; ")}` : ""}`;

  const layout = (keepWhy: boolean[], keepEn: boolean[]): LarkMessage => {
    const elements: Record<string, unknown>[] = [];
    const sources = input.sources.slice(0, CARD_CAPS.sources).filter((s) => Object.hasOwn(DAILY_SOURCES, s.id));
    if (sources.length) elements.push(div(`Sources: ${sources.map((s) => `${md(SOURCE_NAME[s.id])} ${s.ok ? "✓" : "✗"}`).join(" · ")}`));
    if (statusLine) elements.push(div(md(statusLine)));
    elements.push({ tag: "hr" });
    if (!n) elements.push(div("No topics for this day."));
    topics.forEach((t, i) => {
      const meta = [
        md(plain(t.domain)),
        ...(t.tags.length ? [t.tags.slice(0, CARD_CAPS.tags).map((g) => md(plain(g, CARD_CAPS.tag))).join(", ")] : []),
        `confidence ${md(plain(t.confidence))}`,
        plural(t.evidence.independent_sources, "source"),
        md(plain(t.novelty.kind)),
      ].join(" · ");
      const lines = [
        `**${i + 1}. ${md(plain(t.title, CARD_CAPS.title))}**`,
        ...(keepEn[i] ? [md(plain(t.title_en, CARD_CAPS.title_en))] : []),
        ...(keepWhy[i] ? [md(plain(t.why_now, CARD_CAPS.why_now))] : []),
        meta,
        `[Open](${page}#${t.id})`,
      ];
      elements.push(div(lines.join("\n")));
    });
    const digest = digestUrl(input.digest_url);
    elements.push({ tag: "action", actions: [button("Open today's topics", page, "primary"), ...(digest ? [button("ETHTAO digest", digest, "default")] : [])] });
    const window = `Window ${minute(input.window.from)} → ${minute(input.window.to)} UTC`;
    elements.push({ tag: "note", elements: [text(n ? `${window} · pick one: rh topic select <id>` : window)] });
    return { msg_type: "interactive", card: { config: { wide_screen_mode: true }, header, elements } };
  };

  const keepWhy = topics.map(() => true);
  const keepEn = topics.map(() => true);
  let message = layout(keepWhy, keepEn);
  for (const keep of [keepWhy, keepEn]) {
    for (let i = n - 1; i >= 0 && requestBytes(message) > budget; i--) {
      keep[i] = false;
      message = layout(keepWhy, keepEn);
    }
  }
  const dropped = { why_now: keepWhy.filter((k) => !k).length, title_en: keepEn.filter((k) => !k).length };
  if (requestBytes(message) <= budget) return { message, bytes: requestBytes(message), fallback: false, dropped };

  const mini: LarkMessage = {
    msg_type: "interactive",
    card: {
      config: { wide_screen_mode: true },
      header,
      elements: [div(`Status: ${status} · ${plural(n, "topic")}. The full list is on the page.`), { tag: "action", actions: [button("Open today's topics", page, "primary")] }],
    },
  };
  const bytes = requestBytes(mini);
  if (bytes > budget) throw new Error(`迷你卡片也超过 ${budget} 字节（${bytes}）`);
  return { message: mini, bytes, fallback: true, dropped };
}

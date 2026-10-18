/**
 * ETHTAO“以太坊日报”的解析（纯函数，无网络）。格式与变体见 docs/research/daily-sources.md §1.1 第 6 条：
 *  - 第一行 `🗓️以太坊日报 YYYY-MM-DD`，空格可多可少；只凭第一行识别日报（ADR 0004 §4），其他帖子一律跳过；
 *  - 分区 `【…】`（区块链技术讨论、行业观点碰撞、开发者生态、学术合作动态、其他）和不带括号的 `其他有趣内容：` / `其他：`（08-14、08-16）；
 *  - 条目标记是 keycap `1⃣`…`9⃣`、`🔟`，偶尔连写（`6⃣7⃣`）；没有编号但带链接的行是一个新条目；没有链接的行续在上一条后面；
 *  - 链接是 `[原文] (url)`，一条可以有两个；07-01…07-03 的旧格式是裸 `https://x.com/...` URL，有时折到下一行（只有链接的行属于上一条）。
 */

export interface DigestRef {
  handle: string;
  id: string;
  url: string;
}
export interface DigestItem {
  /** 去掉编号和链接后的条目文字（ETHTAO 写的中文摘要：不进公开页面，ADR 0004 §3） */
  text: string;
  /** 文字里第一个 @handle（日报的署名，可能和链接的作者不同） */
  mention: string | null;
  refs: DigestRef[];
}
export interface DigestSection {
  name: string;
  items: DigestItem[];
}
export interface Digest {
  date: string;
  sections: DigestSection[];
}

const DIGEST_RE = /^🗓\uFE0F?\s*以太坊日报\s*(\d{4}-\d{2}-\d{2})\s*$/u;
const ITEM_RE = /^(?:(?:\d\uFE0F?\u20E3)+|\u{1F51F})\s*/u;
/** 09-27 的日报把第一个分区写成了 `区块链技术讨论】`（缺左括号），所以左括号可省。 */
const SECTION_RE = /^(?:【?([^【】\s]{2,12})】|(其他有趣内容|其他)[：:]?)\s*$/u;
const REF_RE = /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})(?:\?[\w=&%-]*)?/g;
const BRACKET_REF_RE = /\s*\[原文\]\s*\(\s*https?:\/\/[^\s)]+\s*\)/g;

/** 第一行是“以太坊日报 D”时返回 D，否则 null。 */
export function digestDate(text: string): string | null {
  return DIGEST_RE.exec(text.split("\n", 1)[0].trim())?.[1] ?? null;
}

/** 解析一条日报；不是日报时返回 null。 */
export function parseDigest(text: string): Digest | null {
  const date = digestDate(text);
  if (!date) return null;
  const sections: DigestSection[] = [];
  let sec: DigestSection | null = null;
  let item: DigestItem | null = null;
  for (const raw of text.split("\n").slice(1)) {
    const line = raw.trim();
    if (!line) {
      item = null;
      continue;
    }
    const sm = SECTION_RE.exec(line);
    if (sm) {
      sec = { name: sm[1] ?? sm[2], items: [] };
      sections.push(sec);
      item = null;
      continue;
    }
    if (!sec) {
      sec = { name: "", items: [] };
      sections.push(sec);
    }
    const refs = [...line.matchAll(REF_RE)].map((m) => ({ handle: m[1], id: m[2], url: `https://x.com/${m[1]}/status/${m[2]}` }));
    const clean = line.replace(ITEM_RE, "").replace(BRACKET_REF_RE, "").replace(REF_RE, "").trim();
    if (!clean && refs.length && item) {
      // 07-02：链接被折到下一行，单独成行，属于上一条
      item.refs.push(...refs);
    } else if (ITEM_RE.test(line) || refs.length || !item) {
      item = { text: clean, mention: /@([A-Za-z0-9_]+)/.exec(clean)?.[1] ?? null, refs };
      sec.items.push(item);
    } else {
      item.text += ` ${clean}`;
    }
  }
  return { date, sections };
}

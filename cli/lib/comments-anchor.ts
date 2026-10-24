/**
 * 评论锚定（ADR 0005 §5）：W3C Web Annotation 的 TextQuoteSelector。
 *
 *  - 正文根：恰好一个 .am-doc-body → 它；否则恰好一个 article；否则恰好一个 main；否则 body。
 *  - 文本：正文根里的文字，跳过 script / style / template / noscript 与任何带 data-rh-* 属性的元素（外壳与评论层）；
 *    空白规范化（连续空白合成一个空格，去掉首尾空白）。
 *  - capture：选区 → {quote, prefix, suffix, heading}；prefix / suffix 是前后各 32 个码点，quote 最多 1000 个码点。
 *  - locate：quote 只出现一次就用它；出现多次时只保留前面紧接 prefix、后面紧接 suffix 的位置，剩一处才用；
 *    否则返回 null（线程失效：只在面板里显示，不高亮、不猜）。
 *
 * commentsAnchor 自成一体：评论层脚本把 commentsAnchor.toString() 内联进页面，测试在 Node（纯文本部分）
 * 与无头 Chrome（DOM 部分）里调用同一份源码。所以函数体里不能引用模块里的其他变量。
 */
export interface QuoteSelector {
  quote: string;
  prefix: string;
  suffix: string;
  heading?: string | null;
}

export interface TextIndex {
  /** 规范化后的正文文本 */
  text: string;
  /** text[i] 对应的文本节点与节点内偏移 */
  nodes: Text[];
  offs: number[];
}

export function commentsAnchor() {
  const CONTEXT = 32;
  const QUOTE_MAX = 1000;
  const HEADING_MAX = 200;
  const SKIP = /^(script|style|template|noscript)$/i;
  const normalize = (s: string): string => s.replace(/\s+/g, " ").trim();
  const points = (s: string): string[] => Array.from(s);

  /** 规范化文本里 quote 的唯一位置；找不到或仍有多个候选时是 -1。 */
  const find = (text: string, sel: QuoteSelector): number => {
    const q = normalize(sel.quote || "");
    if (!q) return -1;
    const hits: number[] = [];
    for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + 1)) hits.push(i);
    if (hits.length === 1) return hits[0];
    const pre = (sel.prefix || "").trim();
    const suf = (sel.suffix || "").trim();
    const ok = hits.filter((i) => text.slice(0, i).trimEnd().endsWith(pre) && text.slice(i + q.length).trimStart().startsWith(suf));
    return ok.length === 1 ? ok[0] : -1;
  };

  const contentRoot = (doc: Document): Element => {
    for (const s of [".am-doc-body", "article", "main"]) {
      const l = doc.querySelectorAll(s);
      if (l.length === 1) return l[0];
    }
    return doc.body;
  };

  const skipped = (el: Element): boolean => SKIP.test(el.tagName) || Array.from(el.attributes).some((a) => a.name.startsWith("data-rh-"));

  const index = (root: Element): TextIndex => {
    // SHOW_ELEMENT | SHOW_TEXT；FILTER_ACCEPT = 1、FILTER_REJECT = 2（跳过整棵子树）、FILTER_SKIP = 3
    const w = root.ownerDocument.createTreeWalker(root, 5, { acceptNode: (n) => (n.nodeType === 3 ? 1 : skipped(n as Element) ? 2 : 3) });
    let text = "";
    const nodes: Text[] = [];
    const offs: number[] = [];
    let pending: [Text, number] | null = null;
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeType !== 3) continue;
      const t = n as Text;
      const s = t.data;
      for (let i = 0; i < s.length; i++) {
        if (/\s/.test(s[i])) {
          if (text && !pending) pending = [t, i];
          continue;
        }
        if (pending) {
          text += " ";
          nodes.push(pending[0]);
          offs.push(pending[1]);
          pending = null;
        }
        text += s[i];
        nodes.push(t);
        offs.push(i);
      }
    }
    return { text, nodes, offs };
  };

  /** 选区之前（含选区起点所在）最近的标题文字。 */
  const heading = (range: Range, root: Element): string | null => {
    const start = range.cloneRange();
    start.collapse(true);
    let h: Element | null = null;
    for (const el of Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6"))) {
      if (start.comparePoint(el, 0) > 0) break;
      h = el;
    }
    const t = h ? points(normalize(h.textContent || "")).slice(0, HEADING_MAX).join("") : "";
    return t || null;
  };

  const capture = (range: Range, root: Element): QuoteSelector | null => {
    if (!root.contains(range.commonAncestorContainer)) return null;
    const { text, nodes, offs } = index(root);
    // 第一个位于边界点处或之后的字符
    const at = (node: Node, off: number): number => {
      const r = root.ownerDocument.createRange();
      r.setStart(node, off);
      let lo = 0;
      let hi = nodes.length;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (r.comparePoint(nodes[m], offs[m]) < 0) lo = m + 1;
        else hi = m;
      }
      return lo;
    };
    let s = at(range.startContainer, range.startOffset);
    let e = at(range.endContainer, range.endOffset);
    while (s < e && text[s] === " ") s++;
    const cps = points(text.slice(s, e));
    if (cps.length > QUOTE_MAX) e = s + cps.slice(0, QUOTE_MAX).join("").length;
    while (e > s && text[e - 1] === " ") e--;
    if (s >= e) return null;
    return {
      quote: text.slice(s, e),
      prefix: points(text.slice(Math.max(0, s - 4 * CONTEXT), s)).slice(-CONTEXT).join(""),
      suffix: points(text.slice(e, e + 4 * CONTEXT)).slice(0, CONTEXT).join(""),
      heading: heading(range, root),
    };
  };

  const locate = (sel: QuoteSelector, root: Element, idx: TextIndex = index(root)): Range | null => {
    const s = find(idx.text, sel);
    if (s < 0) return null;
    const e = s + normalize(sel.quote).length - 1;
    const r = root.ownerDocument.createRange();
    r.setStart(idx.nodes[s], idx.offs[s]);
    r.setEnd(idx.nodes[e], idx.offs[e] + 1);
    return r;
  };

  return { normalize, find, contentRoot, index, capture, locate };
}

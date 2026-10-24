/**
 * 私有站点报告页的评论层（ADR 0005 §5–§7，WHI-2157）。decorateReport 把 commentsLayer.toString() 内联进
 * <script data-rh-comments>，所以函数体自成一体：不引用模块里的其他变量（锚定代码与界面文字作为参数传入）。
 *
 *  - 静态 HTML 里只有带数量的按钮（[data-rh-comments-btn]，桌面在 am 工具栏、窄屏在返回链接一行，和语言切换一样两份），
 *    默认 hidden，API 第一次取数成功后才显示；slug / lang / rev 来自脚本元素的 data-rh-*。API 不可用（网络错误、Access 会话过期被重定向、非 JSON）→ 整个评论层隐藏。
 *  - 抽屉（桌面右侧、≤ 760px 底部面板）覆盖在报告上方，不让报告重新排版；Esc 关闭。
 *  - 选中正文根里的文字 → “评论”按钮 → 输入框。线程卡片：引文 chip、上一条 / 下一条、复制链接 #c-<id>、解决 / 重新打开、
 *    显示已解决的开关；评论的头像（首字母 + author 哈希的颜色）、名字、相对时间、正文（只用 textContent）、Agent 标记与恢复命令。
 *  - 高亮用 CSS Custom Highlight API；不支持时只显示面板。只有唯一匹配才高亮，失效的线程只在面板里显示。
 *  - 跟着 next 取完所有页，不静默截断；线程的 more 在点“更早的评论”时用线程接口取全。
 *  - 写入失败时保留输入的文字并显示错误；写入成功后重新取数。
 */
import type { QuoteSelector, commentsAnchor } from "./comments-anchor.ts";

interface Comment {
  id: string;
  body: string;
  author: string;
  author_kind: "human" | "agent";
  author_name: string;
  agent_runtime?: "pi" | "claude-code" | null;
  agent_session?: string | null;
  created_at: string;
}

interface Thread extends QuoteSelector {
  id: string;
  status: "open" | "resolved";
  created_at: string;
  comments?: Comment[];
  more?: boolean;
}

export function commentsLayer(cfg: DOMStringMap, A: ReturnType<typeof commentsAnchor>, T: Record<string, string>): void {
  const btns = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-rh-comments-btn]"));
  const slug = cfg.rhSlug || "";
  const lang = cfg.rhLang || "zh";
  const rev = cfg.rhRev || "";
  const root = A.contentRoot(document);
  const H = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  const HL = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  let threads: Thread[] = [];
  let showResolved = false;
  let active = "";
  let draft: QuoteSelector | null = null;
  let saved: Range | null = null;
  let dead = false;

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    e.append(...kids);
    return e;
  };
  const button = (attr: string, text: string, label?: string) => el("button", { type: "button", [attr]: "", ...(label ? { "aria-label": label, title: label } : {}) }, text);

  // ── 抽屉 ──
  const resolvedBox = el("input", { type: "checkbox", "data-rh-cmt-resolved": "" });
  const prev = button("data-rh-cmt-prev", "↑", T.cmtPrev);
  const next = button("data-rh-cmt-next", "↓", T.cmtNext);
  const close = button("data-rh-cmt-close", "×", T.cmtClose);
  const chip = el("div", { "data-rh-cmt-quote": "" });
  const input = el("textarea", { "data-rh-cmt-input": "", rows: "3", placeholder: T.cmtNew, "aria-label": T.cmtNew });
  const err = el("p", { "data-rh-cmt-err": "", role: "alert", hidden: "" });
  const cancel = button("data-rh-cmt-cancel", T.cmtCancel);
  const send = button("data-rh-cmt-send", T.cmtSend);
  const composer = el("div", { "data-rh-cmt-composer": "", hidden: "" }, chip, input, err, el("div", { "data-rh-cmt-row": "" }, cancel, send));
  const list = el("div", { "data-rh-cmt-list": "" });
  const drawer = el(
    "aside",
    { "data-rh-cmt-drawer": "", hidden: "", "aria-label": `${T.cmt} · ${T.cmtLang}`, lang: lang === "en" ? "en" : "zh-CN" },
    el("div", { "data-rh-cmt-head": "" }, el("strong", {}, `${T.cmt} · ${T.cmtLang}`), el("label", {}, resolvedBox, T.cmtResolved), prev, next, close),
    composer,
    list,
  );
  const add = button("data-rh-cmt-add", T.cmtAdd);
  add.hidden = true;
  document.body.append(drawer, add);

  // ── API ──
  const api = async (path: string, body?: unknown): Promise<Record<string, unknown>> => {
    const r = await fetch(`/api/comments${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
    const j = /json/.test(r.headers.get("content-type") || "") ? await r.json() : null;
    if (!r.ok || !j) throw new Error((j && j.error) || `HTTP ${r.status}`);
    return j;
  };
  const pages = async <X>(path: string, key: string, first: Record<string, unknown> = {}): Promise<{ items: X[]; head: Record<string, unknown> }> => {
    const items: X[] = [];
    let head = first;
    let cursor: string | null = null;
    do {
      const sep = path.includes("?") ? "&" : "?";
      head = await api(cursor ? `${path}${sep}cursor=${encodeURIComponent(cursor)}` : path);
      items.push(...(head[key] as X[]));
      cursor = head.next as string | null;
    } while (cursor);
    return { items, head };
  };
  const load = async () => {
    threads = (await pages<Thread>(`?slug=${encodeURIComponent(slug)}&lang=${lang}`, "threads")).items;
    render();
  };
  const die = () => {
    dead = true;
    drawer.hidden = add.hidden = true;
    for (const b of btns) b.hidden = true;
    if (H) H.delete("rh-comment");
  };
  /** 写入：失败时把错误写进 box（文字保留在输入框里）；成功后重新取数（取数失败 = API 不可用）。 */
  const write = async (path: string, body: unknown, box: HTMLElement): Promise<Record<string, unknown> | null> => {
    box.hidden = true;
    let j: Record<string, unknown>;
    try {
      j = await api(path, body);
    } catch (e) {
      box.textContent = `${T.cmtFail}：${(e as Error).message}`;
      box.hidden = false;
      return null;
    }
    await load().catch(die);
    return j;
  };

  // ── 渲染 ──
  const rel = (iso: string) => {
    const s = (Date.parse(iso) - Date.now()) / 1000;
    const f = new Intl.RelativeTimeFormat(lang === "en" ? "en" : "zh-CN", { numeric: "auto" });
    for (const [u, n] of [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]] as const) if (Math.abs(s) >= n) return f.format(Math.round(s / n), u);
    return f.format(0, "second");
  };
  const hue = (s: string) => {
    let h = 0;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
  };
  const copy = async (b: HTMLButtonElement, text: string) => {
    const label = b.textContent;
    try {
      await navigator.clipboard.writeText(text);
      b.textContent = T.cmtCopied;
      setTimeout(() => (b.textContent = label), 1800);
    } catch {}
  };
  const commentEl = (c: Comment) => {
    const name = c.author_name || c.author;
    const av = el("span", { "data-rh-cmt-av": "", "aria-hidden": "true" }, (Array.from(name.trim())[0] || "?").toUpperCase());
    av.style.backgroundColor = `hsl(${hue(c.author)} 45% 42%)`;
    const t = el("time", { datetime: c.created_at, title: c.created_at }, rel(c.created_at));
    const who = el("div", { "data-rh-cmt-who": "" }, av, el("strong", {}, name), ...(c.author_kind === "agent" ? [el("span", { "data-rh-cmt-agent": "" }, T.cmtAgent)] : []), t);
    const out = el("div", { "data-rh-cmt-c": "" }, who, el("p", { "data-rh-cmt-body": "" }, c.body));
    if (c.author_kind === "agent" && c.agent_session) {
      const cmd = `${c.agent_runtime === "claude-code" ? "claude --resume" : "pi --session"} ${c.agent_session}`;
      const b = button("data-rh-cmt-copy", T.cmtCopy);
      b.onclick = () => copy(b, cmd);
      out.append(el("div", { "data-rh-cmt-resume": "" }, el("code", {}, cmd), b));
    }
    return out;
  };
  const ranges = new Map<string, Range>();
  const visible = () => {
    const shown = threads.filter((t) => showResolved || t.status === "open");
    const r = (t: Thread) => ranges.get(t.id);
    return shown.sort((a, b) => {
      const x = r(a);
      const y = r(b);
      if (x && y) return x.compareBoundaryPoints(Range.START_TO_START, y);
      if (x || y) return x ? -1 : 1;
      return a.created_at < b.created_at ? -1 : 1;
    });
  };
  const focus = (id: string, scroll: boolean) => {
    active = id;
    for (const c of Array.from(list.children) as HTMLElement[]) c.toggleAttribute("data-active", c.dataset.id === id);
    const card = list.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
    card?.scrollIntoView({ block: "nearest" });
    const r = ranges.get(id);
    if (scroll && r) (r.startContainer.parentElement || root).scrollIntoView({ block: "center" });
  };
  const render = () => {
    for (const b of btns) {
      b.hidden = dead;
      const n = b.querySelector("[data-rh-comments-n]");
      if (n) n.textContent = String(threads.filter((t) => t.status === "open").length);
    }
    const idx = A.index(root);
    ranges.clear();
    for (const t of threads) {
      const r = A.locate(t, root, idx);
      if (r) ranges.set(t.id, r);
    }
    const shown = visible();
    if (H && HL) H.set("rh-comment", new HL(...shown.flatMap((t) => (ranges.has(t.id) ? [ranges.get(t.id)!] : []))));
    // 重新渲染时保留各线程里没发出去的回复
    const drafts = new Map(Array.from(list.querySelectorAll<HTMLTextAreaElement>("[data-rh-cmt-reply]")).map((x) => [x.dataset.id, x.value]));
    list.replaceChildren(
      ...shown.map((t) => {
        const outdated = !ranges.has(t.id);
        const q = button("data-rh-cmt-quote", t.quote);
        q.onclick = () => focus(t.id, true);
        const reply = el("textarea", { "data-rh-cmt-reply": "", "data-id": t.id, rows: "1", placeholder: T.cmtReply, "aria-label": T.cmtReply });
        reply.value = drafts.get(t.id) || "";
        const rerr = el("p", { "data-rh-cmt-err": "", role: "alert", hidden: "" });
        const sendR = button("data-rh-cmt-send", T.cmtSend);
        sendR.onclick = async () => {
          const body = reply.value.trim();
          if (!body) return;
          if (await write(`/threads/${encodeURIComponent(t.id)}/comments`, { body }, rerr)) {
            list.querySelector<HTMLTextAreaElement>(`[data-rh-cmt-reply][data-id="${CSS.escape(t.id)}"]`)!.value = "";
            focus(t.id, false);
          }
        };
        const status = button("data-rh-cmt-status", t.status === "open" ? T.cmtResolve : T.cmtReopen);
        status.onclick = async () => {
          if (await write(`/threads/${encodeURIComponent(t.id)}/status`, { status: t.status === "open" ? "resolved" : "open" }, rerr)) focus(t.id, false);
        };
        const link = button("data-rh-cmt-link", T.cmtLink);
        link.onclick = () => copy(link, `${location.origin}${location.pathname}#c-${t.id}`);
        const comments = el("div", {}, ...(t.comments || []).map(commentEl));
        const kids: Node[] = [];
        if (t.more) {
          const more = button("data-rh-cmt-more", T.cmtMore);
          more.onclick = async () => {
            try {
              comments.replaceChildren(...(await pages<Comment>(`/threads/${encodeURIComponent(t.id)}`, "comments")).items.map(commentEl));
              more.remove();
            } catch (e) {
              rerr.textContent = (e as Error).message;
              rerr.hidden = false;
            }
          };
          kids.push(more);
        }
        const card = el(
          "div",
          { "data-rh-cmt-thread": "", "data-id": t.id, "data-status": t.status, ...(outdated ? { "data-rh-outdated": "" } : {}) },
          el("div", { "data-rh-cmt-qrow": "" }, q, ...(outdated ? [el("span", { "data-rh-cmt-tag": "" }, T.cmtOutdated)] : [])),
          ...kids,
          comments,
          reply,
          rerr,
          el("div", { "data-rh-cmt-row": "" }, link, status, sendR),
        );
        card.addEventListener("click", (e) => {
          if (!(e.target as Element).closest("button,textarea")) focus(t.id, true);
        });
        return card;
      }),
    );
    if (active) focus(active, false);
  };

  // ── 交互 ──
  const open = (on: boolean) => {
    drawer.hidden = !on;
    for (const b of btns) b.setAttribute("aria-expanded", String(on));
    if (!on) {
      composer.hidden = true;
      draft = null;
    }
  };
  for (const b of btns) {
    b.setAttribute("aria-expanded", "false");
    b.onclick = () => open(drawer.hidden === true);
  }
  close.onclick = () => open(false);
  resolvedBox.onchange = () => {
    showResolved = resolvedBox.checked;
    render();
  };
  const step = (d: number) => {
    const ids = visible().map((t) => t.id);
    if (!ids.length) return;
    const i = ids.indexOf(active);
    focus(ids[i < 0 ? 0 : (i + d + ids.length) % ids.length], true);
  };
  prev.onclick = () => step(-1);
  next.onclick = () => step(1);
  cancel.onclick = () => {
    composer.hidden = true;
    draft = null;
  };
  send.onclick = async () => {
    const body = input.value.trim();
    if (!draft || !body) return;
    const d = draft;
    const j = await write("/threads", { slug, lang, rev, quote: d.quote, prefix: d.prefix, suffix: d.suffix, ...(d.heading ? { heading: d.heading } : {}), body }, err);
    if (!j) return;
    input.value = "";
    composer.hidden = true;
    draft = null;
    const t = j.thread as Thread | undefined;
    if (t) focus(t.id, false);
  };
  // 选区：只记下位置；点“评论”时才计算引文
  const hideAdd = () => {
    add.hidden = true;
    saved = null;
  };
  const place = () => {
    if (!saved) return;
    const b = saved.getBoundingClientRect();
    add.style.top = `${Math.min(innerHeight - 48, Math.max(8, b.bottom + 8))}px`;
    add.style.left = `${Math.max(8, Math.min(innerWidth - add.offsetWidth - 8, b.left))}px`;
  };
  document.addEventListener("selectionchange", () => {
    const s = getSelection();
    if (dead || !s || s.isCollapsed || !s.rangeCount) return hideAdd();
    const r = s.getRangeAt(0);
    const c = r.commonAncestorContainer;
    const e = c.nodeType === 1 ? (c as Element) : c.parentElement;
    if (!root.contains(c) || !e || e.closest("[data-rh-cmt-drawer],[data-rh-back],[data-rh-card]") || !r.toString().trim()) return hideAdd();
    saved = r;
    add.hidden = false;
    place();
  });
  addEventListener("scroll", place, { passive: true });
  // 按下按钮时不清掉选区
  add.addEventListener("pointerdown", (e) => e.preventDefault());
  add.onclick = () => {
    const sel = saved && A.capture(saved, root);
    hideAdd();
    if (!sel) return;
    draft = sel;
    chip.textContent = sel.quote;
    err.hidden = true;
    composer.hidden = false;
    open(true);
    composer.hidden = false;
    input.focus();
  };
  addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    hideAdd();
    if (!drawer.hidden) open(false);
  });

  load().then(() => {
    const id = /^#c-(.+)$/.exec(location.hash)?.[1];
    if (id && threads.some((t) => t.id === id)) {
      if (threads.find((t) => t.id === id)!.status === "resolved") {
        showResolved = resolvedBox.checked = true;
        render();
      }
      open(true);
      focus(decodeURIComponent(id), true);
    }
  }, die);
}

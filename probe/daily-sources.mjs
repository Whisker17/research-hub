// WHI-1925 throwaway probe (branch probe/whi-1925-sources; never merged).
// Usage: node probe/daily-sources.mjs [public|blockbeats] <outdir>
// public: keyless sources (FxTwitter ETHTAO + RSS/JSON candidates). blockbeats: needs BB_KEY;
// prints only status codes, header names/limit headers and counts — never the key or bodies.
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const mode = process.argv[2] ?? 'public';
const outDir = process.argv[3] ?? 'probe-out';
mkdirSync(outDir, { recursive: true });
const UA = 'research-hub-probe/0.1 (+https://github.com/Whisker17; WHI-1925)';
const nowS = Math.floor(Date.now() / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, headers = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, ...headers }, signal: AbortSignal.timeout(30000), redirect: 'follow' });
    const body = await res.text();
    return { url, status: res.status, ms: Math.round(performance.now() - t0), bytes: body.length, ctype: res.headers.get('content-type'), headers: res.headers, body };
  } catch (e) {
    return { url, status: 0, ms: Math.round(performance.now() - t0), bytes: 0, error: String(e?.cause?.code ?? e?.name ?? e), body: '' };
  }
}
const rec = ({ url, status, ms, bytes, ctype, error, body, retry }) => ({ url, status, ms, bytes, ctype, error, ...(status !== 200 && status !== 204 ? { body_head: (body ?? '').slice(0, 120) } : {}), ...(retry ? { retry } : {}) });
// FxTwitter: one retry after 2 s on a non-2xx/transport failure, recorded separately so the
// report can give first-attempt and with-one-retry success rates.
async function fx(url) {
  const r = await get(url);
  if (r.status === 200 || r.status === 204) return r;
  await sleep(2000);
  const r2 = await get(url);
  return { ...r2, retry: { first_status: r.status, first_ms: r.ms, first_error: r.error, first_body_head: r.body.slice(0, 120) } };
}
const json = (r) => { try { return JSON.parse(r.body); } catch { return null; } };
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };

// ---------- ETHTAO digest parsing ----------
const DIGEST_RE = /^🗓\uFE0F?\s*以太坊日报\s*(\d{4}-\d{2}-\d{2})/u;
const ITEM_RE = /^(?:(?:\d\u20E3)+|\u{1F51F})\s*/u;
const SECTION_RE = /^(?:【([^】]+)】|(其他有趣内容)[：:]?)\s*$/u;
const REF_RE = /https?:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]+)\/status\/(\d+)/g;
function parseDigest(s) {
  const m = DIGEST_RE.exec(s.text);
  if (!m) return null;
  const sections = [];
  let sec = null, item = null;
  for (const raw of s.text.split('\n').slice(1)) {
    const line = raw.trim();
    if (!line) { item = null; continue; }
    const sm = SECTION_RE.exec(line);
    if (sm) { sec = { name: sm[1] ?? sm[2], items: [] }; sections.push(sec); item = null; continue; }
    if (!sec) { sec = { name: '(none)', items: [] }; sections.push(sec); }
    const refs = [...line.matchAll(REF_RE)].map((r) => ({ handle: r[1], id: r[2], url: `https://x.com/${r[1]}/status/${r[2]}` }));
    if (ITEM_RE.test(line) || refs.length || !item) {
      const text = line.replace(ITEM_RE, '').replace(/\s*\[原文\]\s*\(\s*https?:\/\/\S+?\s*\)/g, '').replace(REF_RE, '').trim();
      item = { text, mention: (text.match(/@([A-Za-z0-9_]+)/) ?? [])[1] ?? null, refs };
      sec.items.push(item);
    } else {
      item.text += ' ' + line; item.refs.push(...refs);
    }
  }
  return {
    digest_date: m[1], status_id: s.id, url: s.url, posted_at: new Date(s.created_timestamp * 1000).toISOString(),
    first_line: s.text.split('\n')[0], format: /\[原文\]/.test(s.text) ? 'bracket-ref' : 'bare-url', sections,
  };
}

async function ethtao(summary) {
  const base = 'https://api.fxtwitter.com/2/profile/Ethtao_Ethtao/statuses';
  const calls = [];
  const out = { calls, checks: {} };
  // page 0
  let r = await fx(base); calls.push({ kind: 'timeline', ...rec(r) });
  let d = json(r);
  const statuses = [...(d?.results ?? [])];
  out.checks.page0_results = d?.results?.length ?? null;
  // count param (docs: 1..100) — does the server honour it?
  r = await fx(`${base}?count=5`); calls.push({ kind: 'count=5', ...rec(r) });
  out.checks.count5_results = json(r)?.results?.length ?? null;
  // since gate: past → 200 page, future → 204
  r = await fx(`${base}?since=${nowS - 36 * 3600}`); calls.push({ kind: 'since=now-36h', ...rec(r) });
  out.checks.since_past = { status: r.status, results: json(r)?.results?.length ?? null };
  r = await fx(`${base}?since=${nowS + 3600}`); calls.push({ kind: 'since=now+1h', ...rec(r) });
  out.checks.since_future = { status: r.status, bytes: r.bytes };
  // page back with cursor.bottom
  let cur = d?.cursor?.bottom, pages = 1;
  while (cur && pages < 4) {
    r = await fx(`${base}?cursor=${encodeURIComponent(cur)}`); calls.push({ kind: `timeline page ${pages}`, ...rec(r) });
    d = json(r); pages++;
    if (!d?.results?.length) break;
    statuses.push(...d.results);
    if (d.cursor?.bottom === cur) break;
    cur = d.cursor?.bottom;
  }
  const seen = new Set();
  const uniq = statuses.filter((s) => !seen.has(s.id) && seen.add(s.id));
  const digests = uniq.map(parseDigest).filter(Boolean).sort((a, b) => b.digest_date.localeCompare(a.digest_date));
  out.checks.statuses = uniq.length;
  out.checks.digests = digests.length;
  out.checks.digest_range = [digests.at(-1)?.digest_date, digests[0]?.digest_date];
  out.checks.non_digest_statuses = uniq.filter((s) => !DIGEST_RE.test(s.text)).map((s) => ({ id: s.id, created_at: s.created_at, kind: s.article ? 'article' : s.quote ? 'quote' : 'post', head: s.text.slice(0, 60) }));
  out.checks.posted_utc = digests.map((x) => `${x.digest_date} ${x.posted_at.slice(11, 16)}`);
  // second hop for the 3 newest digests
  const sample = digests.slice(0, 3);
  const hops = [];
  for (const dg of sample) {
    for (const sec of dg.sections) for (const it of sec.items) for (const ref of it.refs) {
      await sleep(150);
      const h = await fx(`https://api.fxtwitter.com/2/status/${ref.id}`);
      const hd = json(h);
      const st = hd?.status;
      const hop = {
        ref: ref.url, status: h.status, code: hd?.code ?? null, ms: h.ms, error: h.error,
        resolved_id: st?.id ?? null, resolved_url: st?.url ?? null, author: st?.author?.screen_name ?? null,
        reposted_by: st?.reposted_by?.screen_name ?? null, created_at: st?.created_timestamp ? new Date(st.created_timestamp * 1000).toISOString() : null,
        lang: st?.lang ?? null, is_article: Boolean(st?.article), article_title: st?.article?.title ?? null,
        excerpt: st ? (st.article ? (st.article.preview_text ?? '') : st.text ?? '').slice(0, 400) : null,
        external_url: st?.card?.url ?? st?.quote?.card?.url ?? null,
      };
      ref.hop = hop; hops.push(hop);
      calls.push({ kind: 'status hop', ...rec(h) });
    }
  }
  // stats
  const refIds = sample.flatMap((x) => x.sections.flatMap((s) => s.items.flatMap((i) => i.refs.map((r) => r.id))));
  const items = sample.flatMap((x) => x.sections.flatMap((s) => s.items));
  const mismatch = items.filter((i) => i.mention && i.refs.length && !i.refs.some((r) => r.handle.toLowerCase() === i.mention.toLowerCase())).length;
  const hopOk = hops.filter((h) => h.status === 200 && h.code === 200);
  out.stats = {
    sample_dates: sample.map((x) => x.digest_date), items: items.length, items_with_ref: items.filter((i) => i.refs.length).length,
    refs: refIds.length, unique_refs: new Set(refIds).size, dup_ref_rate: refIds.length ? +(1 - new Set(refIds).size / refIds.length).toFixed(3) : null,
    mention_ref_mismatch: mismatch,
    hops: hops.length, hop_ok: hopOk.length, hop_resolved_elsewhere: hopOk.filter((h) => !h.ref.endsWith(h.resolved_id)).length,
    hop_reposts: hopOk.filter((h) => h.reposted_by).length, hop_articles: hopOk.filter((h) => h.is_article).length,
    hop_with_external_url: hopOk.filter((h) => h.external_url).length,
    hop_ms_p50: pct(hops.map((h) => h.ms), 0.5), hop_ms_p95: pct(hops.map((h) => h.ms), 0.95),
    hop_failures: hops.filter((h) => !(h.status === 200 && h.code === 200)).map((h) => ({ ref: h.ref, status: h.status, code: h.code, error: h.error })),
    ref_age_hours_p50: pct(hopOk.filter((h) => h.created_at).map((h) => { const dg = sample.find((x) => x.sections.some((s) => s.items.some((i) => i.refs.some((r) => r.url === h.ref)))); return Math.round((Date.parse(dg.posted_at) - Date.parse(h.created_at)) / 3.6e6); }), 0.5),
  };
  const okCall = (c) => c.status === 200 || (c.kind === 'since=now+1h' && c.status === 204);
  out.success = `${calls.filter((c) => okCall(c) && !c.retry).length}/${calls.length} first attempt; ${calls.filter(okCall).length}/${calls.length} with one retry`;
  out.retries = calls.filter((c) => c.retry).map((c) => ({ kind: c.kind, url: c.url, first: c.retry, second_status: c.status }));
  out.latency_ms = { p50: pct(calls.map((c) => c.ms), 0.5), p95: pct(calls.map((c) => c.ms), 0.95), max: Math.max(...calls.map((c) => c.ms)) };
  summary.ethtao = { success: out.success, retries: out.retries, latency_ms: out.latency_ms, checks: out.checks, stats: out.stats };
  writeFileSync(join(outDir, 'ethtao-calls.json'), JSON.stringify(calls, null, 1));
  writeFileSync(join(outDir, 'ethtao-sample.json'), JSON.stringify(sample, null, 1));
  // keep one legacy-format digest (if within reach) as a parser variant sample
  writeFileSync(join(outDir, 'ethtao-digests-index.json'), JSON.stringify(digests.map((x) => ({ digest_date: x.digest_date, status_id: x.status_id, posted_at: x.posted_at, format: x.format, first_line: x.first_line, sections: x.sections.map((s) => `${s.name}:${s.items.length}`) })), null, 1));
}

// ---------- other candidates ----------
const SOURCES = [
  { id: 'odaily-newsflash-important', kind: 'odaily', url: 'https://api.odaily.news/api/v1/newsflash?page=1&size=100&isImportant=true' },
  { id: 'odaily-newsflash-all', kind: 'odaily', url: 'https://api.odaily.news/api/v1/newsflash?page=1&size=100' },
  { id: 'odaily-newsflash-all-p2', kind: 'odaily', url: 'https://api.odaily.news/api/v1/newsflash?page=2&size=100' },
  { id: 'odaily-newsflash-all-p3', kind: 'odaily', url: 'https://api.odaily.news/api/v1/newsflash?page=3&size=100' },
  { id: 'odaily-article', kind: 'odaily', url: 'https://api.odaily.news/api/v1/article?page=1&size=50' },
  { id: 'panews-rss', kind: 'rss', url: 'https://www.panewslab.com/rss.xml' },
  { id: 'panews-newsflash-rss', kind: 'rss', url: 'https://www.panewslab.com/zh/rss/newsflash.xml' },
  { id: 'theblock-rss', kind: 'rss', url: 'https://www.theblock.co/rss.xml' },
  { id: 'coindesk-rss', kind: 'rss', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { id: 'decrypt-rss', kind: 'rss', url: 'https://decrypt.co/feed' },
  { id: 'ef-blog-rss', kind: 'rss', url: 'https://blog.ethereum.org/feed.xml' },
  { id: 'wublock-atom', kind: 'rss', url: 'https://www.wublock123.com/feed' },
  { id: 'ethresearch-latest', kind: 'discourse', url: 'https://ethresear.ch/latest.json' },
  { id: 'magicians-latest', kind: 'discourse', url: 'https://ethereum-magicians.org/latest.json' },
  { id: 'chaincatcher-rss', kind: 'rss', url: 'https://www.chaincatcher.com/rss' },
  { id: 'chaincatcher-feed', kind: 'rss', url: 'https://www.chaincatcher.com/feed' },
  { id: 'foresight-rss', kind: 'rss', url: 'https://foresightnews.pro/rss' },
  { id: 'foresight-feed', kind: 'rss', url: 'https://foresightnews.pro/feed' },
  { id: 'blockbeats-open-flash-keyless', kind: 'bb-open', url: 'https://api.theblockbeats.news/v1/open-api/open-flash?size=50&page=1' },
];
const unxml = (s) => (s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const tag = (block, t) => unxml((new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(block) ?? [])[1]);
function normalize(src, r) {
  const items = [];
  if (src.kind === 'rss') {
    if (!/^\s*<\?xml|<rss|<feed/.test(r.body)) return null;
    for (const b of r.body.match(/<item[\s>][\s\S]*?<\/item>/g) ?? []) items.push({ title: tag(b, 'title'), url: tag(b, 'link') || tag(b, 'guid'), published_at: tag(b, 'pubDate') || tag(b, 'dc:date') });
    for (const b of r.body.match(/<entry[\s>][\s\S]*?<\/entry>/g) ?? []) items.push({ title: tag(b, 'title'), url: (/<link[^>]*href="([^"]+)"/.exec(b) ?? [])[1] ?? '', published_at: tag(b, 'published') || tag(b, 'updated') });
  } else if (src.kind === 'odaily') {
    const d = json(r); if (!d?.data?.list) return null;
    for (const x of d.data.list) items.push({ title: x.title, url: x.link, origin_url: x.sourceUrl || null, important: x.isImportant, published_at: new Date(x.publishTimestamp).toISOString() });
  } else if (src.kind === 'discourse') {
    const d = json(r); if (!d?.topic_list) return null;
    for (const x of d.topic_list.topics) items.push({ title: x.title, url: `${new URL(src.url).origin}/t/${x.slug}/${x.id}`, published_at: x.created_at, last_posted_at: x.last_posted_at, pinned: x.pinned || undefined });
  } else if (src.kind === 'bb-open') {
    const d = json(r); if (!d) return null;
    const list = Array.isArray(d.data) ? d.data : (d.data?.data ?? []);
    for (const x of list) items.push({ title: x.title, url: x.link, published_at: x.create_time });
  }
  return items.map((i) => ({ ...i, published_at: i.published_at && !Number.isNaN(Date.parse(i.published_at)) ? new Date(i.published_at).toISOString() : i.published_at }));
}
async function others(summary) {
  const res = [];
  const samples = {};
  for (const src of SOURCES) {
    const r = await get(src.url);
    const items = r.status === 200 ? normalize(src, r) : null;
    const dates = (items ?? []).map((i) => i.published_at).filter((x) => x && !Number.isNaN(Date.parse(x))).sort();
    const perDay = {};
    for (const x of dates) perDay[x.slice(0, 10)] = (perDay[x.slice(0, 10)] ?? 0) + 1;
    const urls = (items ?? []).map((i) => i.url);
    res.push({ id: src.id, ...rec(r), ...(src.kind === 'odaily' && items ? { important_flagged: items.filter((i) => i.important).length } : {}), parsed: items !== null, items: items?.length ?? 0, newest: dates.at(-1) ?? null, oldest: dates[0] ?? null, per_utc_day: perDay, dup_url_rate: urls.length ? +(1 - new Set(urls).size / urls.length).toFixed(3) : null, head: items === null ? r.body.slice(0, 120).replace(/\s+/g, ' ') : undefined });
    if (items?.length) samples[src.id] = items;
  }
  summary.sources = res;
  writeFileSync(join(outDir, 'sources-sample.json'), JSON.stringify(samples, null, 1));
}

async function blockbeats(summary) {
  const key = process.env.BB_KEY;
  if (!key) { summary.blockbeats = { skipped: 'BB_KEY not set' }; return; }
  const out = [];
  for (const path of ['/v1/newsflash/important?page=1&size=50&lang=cn', '/v1/newsflash?page=1&size=50&lang=cn']) {
    const r = await get(`https://api-pro.theblockbeats.info${path}`, { 'api-key': key });
    const d = json(r);
    const list = d?.data?.data ?? [];
    const times = list.map((x) => x.create_time).filter(Boolean).sort();
    const hdrNames = r.headers ? [...r.headers.keys()] : [];
    const limitHdrs = Object.fromEntries((r.headers ? [...r.headers.entries()] : []).filter(([k]) => /limit|quota|remain|reset|retry|usage|credit/i.test(k)));
    out.push({ path, http: r.status, ms: r.ms, error: r.error, api_status: d?.status ?? null, api_message: d && d.status !== 0 ? String(d.message).slice(0, 200) : '', items: list.length, newest_create_time: times.at(-1) ?? null, oldest_create_time: times[0] ?? null, header_names: hdrNames, limit_headers: limitHdrs });
  }
  summary.blockbeats = out;
}

const summary = { mode, run_at: new Date().toISOString(), runner: { os: process.env.RUNNER_OS ?? null, env: process.env.RUNNER_ENVIRONMENT ?? null, run_id: process.env.GITHUB_RUN_ID ?? null, attempt: process.env.GITHUB_RUN_ATTEMPT ?? null } };
if (mode === 'blockbeats') await blockbeats(summary);
else { await ethtao(summary); await others(summary); }
const text = JSON.stringify(summary, null, 1);
writeFileSync(join(outDir, `summary-${mode}.json`), text);
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## WHI-1925 probe — ${mode} (${summary.run_at})\n\n\`\`\`json\n${text}\n\`\`\`\n`);

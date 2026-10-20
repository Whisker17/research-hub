# Daily Topics — crypto source survey (WHI-1925)

Status: day-1 survey, 2026-10-18. Scope: crypto only (owner decision; no AI sources). Consumer:
WHI-1931 (`rh ingest`), which implements only the sources this document proves.

**Evidence base.** Every claim below is either *runner* (GitHub Actions, `ubuntu-latest`,
probe run [39128600115](https://github.com/Whisker17/research-hub/actions/runs/39128600115),
2026-10-18 12:45 UTC, branch `probe/whi-1925-sources`, commit `4b15c17`), *local* (the
owner's residential IP, 2026-10-18 12:33–12:45 UTC), or *docs* (a vendor page read on
2026-10-18, linked). One successful call is not stability evidence. The ≥3-calendar-day
runner record is appended to [§ 9](#9-runner-stability-log-appended-daily) by the
orchestrator, which re-runs the probe daily (`gh run rerun 39128600115 --repo
Whisker17/research-hub`; the keyed BlockBeats step only runs on attempt 1, so re-runs spend no
quota).

## 1. ETHTAO digest (@Ethtao_Ethtao, "以太坊日报") via FxTwitter v2

### 1.1 Access, measured

| Check | Runner (run 39128600115) | Local |
| --- | --- | --- |
| `GET /2/profile/Ethtao_Ethtao/statuses`, no key | 200, 19 results | 200, 19 results |
| Success over the run (timeline + gate checks + 59 second hops) | 65/66 first attempt, 66/66 with one retry | 63/65 (run 1, no retry logic yet); 66/66 first attempt (run 2) |
| Latency, all calls | p50 130 ms, p95 820 ms, max 1.4 s | p50 ~480 ms, p95 2.1–2.8 s, max 4.2 s |
| `cursor.bottom` paging | 4 pages → digests back to 2026-09-08 | 8 pages → 2026-06-29 (100 digests) |
| `GET /2/status/<id>` second hop | 59/59 OK, p50 128 ms, p95 227 ms | 59/59 OK |

**Corrections to the issue's premise** (all measured on both IPs unless noted):

1. **Transient `404` on timeline pages.** Body `{"code":404,"results":[],"cursor":{"top":null,"bottom":null}}`.
   Runner: 1/66 (cursor page 3); local: 2/66 (`?count=5`, cursor page 2). Every one succeeded on a
   retry 2 s later. The adapter must retry a timeline `404` (bounded, e.g. 3× with backoff)
   and must not read it as "account gone" or "no more pages".
2. **`since` is a gate, not a filter.** The OpenAPI spec (`/2/openapi.json`) says: without
   `cursor`, `since` (Unix seconds, or ms if ≥ 1e12) returns **204 No Content** when no post is
   newer, "otherwise returns the normal JSON timeline". Measured: `since=now-36h` → 200 with the
   full 19-item page; `since=now+1h` → 204, empty body. An ISO date returns `400 since:
   Invalid input`. Use it as a cheap "anything new?" probe; filter by `created_timestamp`
   client-side.
3. **`count` is ignored.** `?count=5` returned 19 results (runner and local). Page size is
   whatever upstream returns (16–20 observed).
4. **Posting window is wider than 02:20–07:00 UTC.** Over 100 digests (2026-07-01 … 10-18):
   earliest 02:18, median 03:11, latest **12:55** UTC; 18/100 posted after 04:30, 2/100 after
   07:00 (09-26 09:41, 09-21 12:55), 1/100 after 10:00. Against the planned schedule
   (04:30 / 08:00 / 10:00 UTC): the 04:30 run sees 82%, 08:00 sees 98%, 10:00 sees 99%. A
   missing digest at 10:00 is `pending`, not `complete`.
5. **Not every day has a digest.** Missing 2026-07-04…07, 07-11/12, 07-18/19, 07-25/26 (early-July
   weekends); none missing from 07-27 to 10-18. No duplicate dates.
6. **Format drift** (100 digests): first line is `🗓️以太坊日报 YYYY-MM-DD` (38) or
   `🗓️ 以太坊日报  YYYY-MM-DD` (62, extra spaces). Sections seen: 【行业观点碰撞】100, 【区块链技术讨论】99,
   【开发者生态】98, 【学术合作动态】28, 【其他】26, and the **unbracketed** line `其他有趣内容：` 10.
   There is no bracketed 【其他有趣内容】. Item markers are keycaps `1⃣`…`9⃣` (`\d\u20E3`), `🔟`
   (U+1F51F) for 10, once `6⃣7⃣`. Some items continue on an unnumbered line that carries its
   own `[原文]`; some items carry two `[原文]` links. The three digests of 07-01…07-03 use bare
   `https://x.com/...` URLs instead of `[原文] (url)`.
7. **All digests are note tweets**; `text` is complete and has `t.co` already expanded (`raw_text`
   keeps `t.co`). Use `text`.
8. **The timeline is not digest-only.** Quote posts, X Articles (`text` = `https://x.com/i/article/…`)
   and event posts are interleaved (29 of 70 statuses on the runner's 4 pages: 16 posts, 8 Articles, 5 quotes). Select digests by the first-line
   regex only.

### 1.2 Second hop ("[原文]" links), runner, digests 2026-10-16/17/18

- 58 items, 59 refs, 59/59 hops OK.
- **17/59 (29%) refs are reposts.** FxTwitter returns the *original* status (different `id`,
  original `author`) with `reposted_by` set. The canonical reference is the resolved original,
  and "independent source" must count the original author, not the reposter.
- **Attribution mismatch:** in 7/58 items the first `@handle` in the digest text is not the
  handle in the ref URL (e.g. 10-18 #1 credits `@ralexstokes`, links a `@nero_eth` repost).
- 11/59 originals carry an external `card.url` (e.g. `blog.ethereum.org`, `forkcast.org`): that is
  the primary origin when present.
- Median ref age at digest time: 13 h.
- **Dedup:** ref ids are 0% duplicated, but resolved originals repeat across days (59 → 57) and
  external URLs repeat (Glamsterdam Hoodi announcement on 10-17 and 10-18; ACDC #189; the
  ethskills ChatGPT plugin on 10-16 and 10-17). Deduplicate on resolved original id and
  external URL, not on the ref id.
- X Articles expose only `article.title` / `article.preview_text` (checked on 2109979863612535014);
  no article body is available keyless.

### 1.3 Fallback ladder (each rung is an assumption with its evidence)

**Owner decision 2026-10-18: no ETHTAO fallback in 0.1.0.** A FxTwitter failure (after the
bounded retries) marks ETHTAO `degraded` for that day; nothing else is tried. Rung 1
(self-hosted FxEmbed) is **rejected**: it needs X login cookies, which is against X's terms.
Rungs 2–3 (paid APIs) stay documented here only as a future option; they are not built in
0.1.0.

| Rung | What | Evidence (2026-10-18) | Cost | Unverified |
| --- | --- | --- | --- | --- |
| 0 | Public `api.fxtwitter.com` + bounded retry | Runner run above; [API overview](https://docs.fxembed.com/api/introduction/): 1000 req/min/IP, cursor paging; FxEmbed is MIT ([GitHub](https://github.com/FxEmbed/FxEmbed), pushed 2026-10-18) | Free | No SLA; a shared runner IP pool could hit the per-IP limit (daily need ≈ 2 timeline + ~25 hop calls) |
| 1 | Self-hosted FxEmbed on Cloudflare Workers | [Self-hosting](https://docs.fxembed.com/deployment/): Workers free tier 100k req/day, Node 24, `npm run deploy`. [Credentials](https://docs.fxembed.com/deployment/credentials/): "works best with X/Twitter account credentials … Without them, you will have lower rate limits" — credentials are browser `auth_token` / `ct0` cookies | Free tier; an X account | **Rejected (owner decision 2026-10-18):** X login cookies are against X's terms and risk the account |
| 2 | [twitterapi.io](https://twitterapi.io/pricing) | $0.15 / 1k tweets, **minimum $0.00015 per request "even if no data returned"**; invalid search queries → 400 "not charged"; out of credits → **402**, do not retry ([errors](https://docs.twitterapi.io/errors)); no minimum spend, ~$1 free credit; 20 QPS default | ≈ 27 req/day ≈ <$0.01/day | Not called (no key) |
| 3 | [GetXAPI](https://getxapi.com/pricing) | $0.001 per standard call (~20 tweets), "complete timeline" $0.003, threads/articles $0.005; $0.10 free credit; credits from $10 (or one-time $5 Starter) | ≈ $0.03/day | Whether failed calls bill is **not documented**; not called |
| — | Degrade | No digest by the last run → manifest `pending`/`degraded`, other sources still ship | — | — |

Decision (owner decision 2026-10-18): ship rung 0 with retries, then degrade. If a paid
fallback is wanted later, rung 2 has the clearest documented failure semantics (402 is
explicit; empty results still bill the minimum).

### 1.4 Other X accounts the adapter's list could take (not in the first batch)

FxTwitter `/2/profile/<h>/statuses`, local, 2026-10-18:

| Account | Type | Observed |
| --- | --- | --- |
| @ethstaker | weekly digest ("Ethereal news weekly #41") | 200, latest 2026-10-02 |
| @weekinethnews | Week in Ethereum News, irregular | 200, latest 2026-10-11 |
| @wublockchain12 | Chinese aggregator, many posts/day | 200, latest 2026-10-18 (already covered by the 吴说 Atom feed below) |
| @thedailygwei | daily newsletter | 200, but latest post 2026-03-26 — stale |

Most-cited primary authors across 100 ETHTAO digests (digests citing them): barnabemonnot 76,
austingriffith 74, chainlink 55, base 54, growthepie_eth 52, nixorokish 47, matteoikari 44,
TrustlessState 44, DefiIgnas 42, nero_eth 35, soispoke 33, asanso 32. ETHTAO already curates
these; following them directly would add volume, not coverage. Not recommended for v1.

## 2. BlockBeats (keyed)

- API: `https://api-pro.theblockbeats.info/v1/...`, header `api-key`, docs at
  [theblockbeats.info/apiDoc](https://www.theblockbeats.info/apiDoc). Relevant endpoints:
  `/v1/newsflash/important` (`page`, `size` 1–50, `lang`), `/v1/newsflash`, `/v1/newsflash/24h`,
  `/v1/rss/newsflash`. Items: `id, title, content (HTML), pic, link, url (origin), create_time`.
- **`create_time` is `Y-m-d H:i:s` in UTC+8 with no zone** (runner call at 12:46 UTC returned a
  newest item of `20:41:43`). Convert explicitly.
- **Errors come back as HTTP 200** with a body `status`: 0 ok, 100 missing key, 101 invalid key,
  102 key expired, 103 wrong method, −1 general failure
  ([official skill](https://github.com/BlockBeatsOfficial/blockbeats-skill/blob/0298a8ee0f439095d3f880bbe29eaf9399dbb899/SKILL.md),
  measured 100 and 101 locally without a valid key). Check the body, not only the HTTP code.
- **Runner, with `secrets.BLOCKBEATS_API_KEY`** (2 calls; only status, counts and header names
  printed): `/v1/newsflash/important?size=50` → HTTP 200, `status 0`, 50 items spanning
  2026-10-17 20:19 → 10-18 20:41 (UTC+8), i.e. one call covered ~24 h of important items on that
  weekend (Sat–Sun) — **not a constant; see the weekday re-measurement below**;
  `/v1/newsflash?size=50` → 50 items over ~11.5 h. Response headers: `connection,
  content-encoding, content-type, date, eo-cache-status, eo-log-uuid, server,
  strict-transport-security, transfer-encoding, vary` — **no rate-limit / quota headers**.
- **Re-measured on a weekday (WHI-2078), runner, first real Daily run
  [39413681633](https://github.com/Whisker17/research-hub/actions/runs/39413681633)**
  (2026-10-20, Tuesday, `daily-cache-…` artifact): one `/v1/newsflash/important?size=50` call
  at 11:16 UTC returned 50 items spanning 2026-10-20 02:34 → 11:16 UTC, i.e. **one page covers
  ~8.7 h on a weekday**, not ~24 h (none of them fell in that run's window W(10-20), as
  expected with no cache from 10-19). One sample each: plan with ~9 h per page and treat ~24 h as
  a quiet-day figure.
- **Quota size, reset period and the over-quota response are not published.** The API doc only
  says "免费额度即刻可用，订阅后解锁更高调用上限"; neither the docs, the official skill / MCP package
  (`blockbeats-mcp` 1.0.4) nor the response headers state a number. Finding it empirically would
  mean exhausting the owner's key, which the pipeline needs, so it was not done. **Owner decision
  2026-10-18:** the owner does not know the quota either; record it as **undisclosed**.
- **Daily budget (owner decision 2026-10-18): 4 calls/day, hard cap 6/day**, counted and persisted across runs (retries,
  backfills and regenerations count): one `important?size=50` call per scheduled run (3 runs),
  plus at most one retry per day. The first plan (skip the call when the previous successful call
  is < 6 h old, because one call covers ~24 h) is superseded by WHI-2078, since the ~24 h reach
  does not hold on weekdays:
  call only when the cached coverage leaves a gap in the Daily window, and page back (`page=2`, …,
  every page counts against the same 4/day) until the gap is closed; with ~9 h pages the
  04:30 UTC run pages 3 times and the 08:15 / 13:30 runs skip. Above ~200 important items/day
  (pages < 6 h) 4 pages cannot cover the window and it stays `partial`.
  Treat HTTP ≠ 200 or body `status ≠ 0` as `degraded` for BlockBeats;
  do not retry `100–103`. The numbers are adjustable later in `sources.yml`.
- Keyless BlockBeats routes, both excluded: `api.theblockbeats.news/v1/open-api/open-flash`
  answers `{"status":0,"data":[]}` (runner and local; dead); RSSHub's route signs requests to the
  app API with a hard-coded demo app secret — reverse-engineered, no terms basis.

## 3. Other candidates, measured

Runner run 39128600115 (status, latency, items per fetch, reach of one fetch):

| Source | Endpoint | Runner | Items / reach of one fetch |
| --- | --- | --- | --- |
| Odaily newsflash | `api.odaily.news/api/v1/newsflash?page=N&size=100` | 200, 0.25–4.6 s | 100 items ≈ 29 h; 3 pages ≈ 2.5 days |
| Odaily articles | `/api/v1/article?size=50` | 200, 0.6 s | 50 ≈ 4 days |
| PANews | `www.panewslab.com/rss.xml` (and `/zh/rss/newsflash.xml`) | 200, 1.3–1.9 s | 100 ≈ 29–33 h, no paging |
| The Block | `www.theblock.co/rss.xml` | 200, 0.1 s | 20 ≈ 2 days |
| CoinDesk | `www.coindesk.com/arc/outboundfeeds/rss/` | 200, 0.4 s | 25 ≈ 3 days |
| Decrypt | `decrypt.co/feed` | 200, 0.1 s | 37 ≈ 3 days |
| EF blog | `blog.ethereum.org/feed.xml` | 200, 0.7 s | 643 (full archive) |
| 吴说 (WuBlock) | `www.wublock123.com/feed` (Atom) | 200, 1.0 s | 50 ≈ 1.5 days |
| ethresear.ch | `ethresear.ch/latest.json` (Discourse) | 200, 0.7 s | 30 topics, bump order; ~1 new topic/day |
| Ethereum Magicians | `ethereum-magicians.org/latest.json` | 200, 4.4 s | 30 topics, bump order; ~1–3 new topics/day |
| ChainCatcher | `/rss` → 404 JSON; `/feed` → 400 HTML | fail | no feed (confirms premise) |
| Foresight News | `/rss`, `/feed` → 200 **HTML** (SPA shell; locally 567) | fail | no feed (confirms premise) |

Findings that change adapter behaviour:

- **Odaily ignores `isImportant=true`**: both calls return the same list (57/100 flagged
  important on runner). Filter on the item's `isImportant` client-side. `publishTimestamp` is ms
  epoch (use it; `publishDate` is UTC+8 text). `sourceUrl` (origin) is set on ~60% of items. The
  feed mixes non-crypto items (AI models, geopolitics) — the generator must filter.
- Discourse `latest.json` is ordered by last activity; "new today" must use `created_at`
  (`last_posted_at` for "active today").
- RSS feeds have no paging: one fetch per run reaches 1–3 days, enough for a daily window; a
  missed day cannot be backfilled from RSS.

## 4. Source matrix

Access date for every row: 2026-10-18. "Public display" follows the planning rule (title, link,
our own summary; no body text); "stored" is the gitignored cache (excerpt ≤ 400 chars).

| Source | Originality | API & paging | Time semantics | Auth | Rate limit | Cost | Terms evidence | Stored / shown publicly | Degradation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ETHTAO digest | aggregator (curated, CN) over primary X posts | FxTwitter `/2/profile/…/statuses`, `cursor.bottom`; `since` gate; hop `/2/status/<id>` | `created_timestamp` (s, UTC); digest date in first line (UTC+8 day) | none | 1000/min/IP (docs) | free | FxEmbed MIT; X content under X terms; FxTwitter is a third-party proxy | stored: digest item text, ref excerpts ≤400; shown: our summary + link to the original X post | retry → `pending` → `degraded` (no fallback in 0.1.0, § 1.3) |
| BlockBeats important | aggregator/newsroom (CN), `url` = origin | `/v1/newsflash/important`, `page`/`size≤50` | `create_time` UTC+8, no zone | `api-key` header | quota unpublished | free tier (unknown size) | [apiDoc](https://www.theblockbeats.info/apiDoc); no redistribution terms found | stored: title, link, origin, excerpt; shown: title + link | budget exhausted / status≠0 → `degraded`, Odaily covers |
| Odaily newsflash | aggregator/newsroom (CN), `sourceUrl` = origin | REST `page`/`size`, `hasMore` | `publishTimestamp` ms UTC | none | 429 documented, no number | free | [ODAILY/REST-API](https://github.com/ODAILY/REST-API) (no licence file; "公开接口") | same as BlockBeats | skip source, `degraded` |
| The Block | primary journalism (EN) | RSS, 20 items, no paging | `pubDate` RFC 2822 | none | none stated | free | ToS not reviewed (page returned 403 to a scripted fetch, local); headline + link use only | title + link only | skip source |
| ethresear.ch | primary (research forum) | Discourse `latest.json` (`?page=`) | `created_at` ISO UTC | none | Discourse defaults | free | [ToS](https://ethresear.ch/tos): user content CC BY-NC-SA 3.0 | title + link; excerpt cache only | skip source |
| Ethereum Magicians | primary (EIP/ERC forum) | same | same | none | same | free | [ToS](https://ethereum-magicians.org/tos) (same Discourse template) | same | skip source |
| PANews | aggregator (CN) | RSS 100, no paging | `pubDate` | none | none stated | free | not reviewed | — (excluded) | — |
| CoinDesk / Decrypt | primary journalism (EN) | RSS 25 / 37 | `pubDate` | none | none stated | free | not reviewed | — (reserve) | — |
| EF blog | primary (low volume) | RSS, full archive | `pubDate` | none | — | free | — | — (reserve) | — |
| 吴说 WuBlock | aggregator/repost (CN) | Atom 50 | `published`/`updated` | none | — | free | not reviewed | — (excluded) | — |
| ChainCatcher, Foresight | — | no feed | — | — | — | — | — | — (excluded) | — |

## 5. Samples (fixtures)

`test/fixtures/daily/` (no credentials; probe output, not a spec — WHI-1931 may normalise
differently):

- `ethtao/2026-10-16.json`, `2026-10-17.json`, `2026-10-18.json` — three consecutive digests:
  `input` (FxTwitter status: id, url, timestamps, full `text`) and `expected` (sections → items
  → refs, each ref with its runner second-hop result: resolved id/author, `reposted_by`,
  external URL, excerpt ≤ 400 chars). Hops are from runner run 39128600115; the raw `text` of the
  same status ids was fetched locally the same day.
- `ethtao/legacy-bare-url-2026-07-01.json` — the older bare-URL format.
- `ethtao/non-digest-statuses.json` — quote / X Article / event posts the adapter must skip.
- `sources/odaily-newsflash.json` (300 items, 2026-10-16…18), `sources/theblock-rss.json`,
  `sources/ethresearch-latest.json`, `sources/magicians-latest.json` — runner, normalised to
  `title, url, published_at` (+ `origin_url`, `important` for Odaily).
- No BlockBeats items: the keyed probe printed counts only, by design.

Three-day numbers (ETHTAO 10-16…18): 17 / 24 / 17 items; 59 refs; 0% duplicate ref ids, 3.4%
duplicate resolved originals across days; 0 hop failures.

## 6. First batch (decision)

Owner decision 2026-10-18: the owner agrees with this first batch.

1. **ETHTAO digest** via FxTwitter (rung 0 + retries) with the second hop. Mandatory. No
   fallback in 0.1.0: FxTwitter failure ⇒ `degraded` (§ 1.3).
2. **BlockBeats** `/v1/newsflash/important`, ≤ 4 calls/day (hard cap 6/day), persisted budget;
   quota undisclosed (§ 2).
3. **ethresear.ch + Ethereum Magicians** (one Discourse adapter, two instances): primary,
   keyless, stable JSON, matches ETHTAO's protocol focus and gives the "≥ 1 primary source"
   path.
4. **Odaily newsflash**: keyless and paged, so it is the fallback when BlockBeats is out of
   budget, and its `sourceUrl` gives origins.
5. **The Block RSS**: English primary journalism, so a topic can reach 2 independent sources
   without two Chinese aggregators that rewrite the same wire.

Exclusions:

| Source | Reason |
| --- | --- |
| PANews RSS | aggregator overlapping BlockBeats/Odaily; no paging; terms not reviewed. Reserve. |
| CoinDesk, Decrypt | English journalism already represented by The Block; reserve if The Block degrades. |
| EF blog | primary but a few posts a month; its announcements reach ETHTAO / Magicians the same week (Glamsterdam Hoodi did). Cheap to add later. |
| 吴说 WuBlock (Atom, @wublockchain12) | aggregator/repost; adds volume, not origins. |
| ChainCatcher, Foresight News | no feed (404 / 400 / HTML shell). |
| BlockBeats keyless `open-flash` | returns an empty list. |
| BlockBeats app API (RSSHub route) | reverse-engineered demo credentials; no terms basis. |
| Other X accounts (§ 1.4) | ETHTAO already curates them; weekly / stale cadence. |
| AI sources (HF papers, Papers with Code, HN) | owner decision: crypto only. |

## 7. Owner-judged topic value (sampled digests 2026-10-16…18)

Owner decision 2026-10-18: the owner agrees with the agent's assessment below. The technical
section is the value; industry items are mixed; the closing section is mostly noise.

- **Strong candidates** (protocol, primary refs): Glamsterdam on Hoodi testnet 2026-10-26 (10-17, 10-18) and
  the ~3.5× L1 capacity claim (10-18); EIP-8025 debate (optional proofs / zkVM, ACDC #189
  decision) (10-16, 10-17); Hegotá: 23 EIPs CFI/SFI, only FOCIL and Frame Transactions SFI'd
  (10-17); EIP-8246 removing SELFDESTRUCT burn, 26,792 ETH in burn addresses (10-17); EIP-7997
  minimal CREATE2 deployer vs CreateX (10-16); EIP-8037 state-gas cost for SSTORE (10-16);
  Daisugi v0.3 post-quantum signature aggregation on LeanVM (10-16); Lean4 executable
  consensus spec / "Lean is the new Rust" formal verification (10-16, 10-17, 10-18).
- **Medium**: Charles Schwab spot ETH trading for all clients; Chainlink Fulcrum tokenized
  collateral financing; tokenized stocks on Base (Aerodrome > $100M/day); Aztec reaching Stage 2;
  Wedgie open DIY hardware wallet; growthepie L1 vs L2 activity.
- **Low / not research topics**: "PhD in Ethereum" joke, testnet-ETH jokes, retweets of opinions
  without data, "Claude proved P256 passkeys safe" (an unverified claim).

Roughly 8–10 of 58 items per three days look like research topics, i.e. ETHTAO alone yields
~3/day, below the 5–10 target; the other sources are needed.

## 8. Notes for WHI-1931

Retry timeline `404`s; select digests by first-line regex; parse both section syntaxes and
`🔟`; take refs from both `[原文] (url)` and bare URLs; canonicalise refs to the resolved
original (`reposted_by`); dedupe on resolved id + external URL; treat a missing digest as
`pending`; convert BlockBeats/Odaily UTC+8 text times; filter Odaily `isImportant`
client-side; check BlockBeats body `status`.

## 9. Runner stability log (appended daily)

Re-run: `gh run rerun 39128600115 --repo Whisker17/research-hub`, then read the
`probe-39128600115-<attempt>` artifact (`summary-public.json` → `ethtao.success`,
`ethtao.latency_ms`, `ethtao.retries`, `sources[]`).

| Date (UTC) | Run / attempt | ETHTAO success (first / with retry) | Latency p50 / p95 / max | Newest digest | Source failures |
| --- | --- | --- | --- | --- | --- |
| 2026-10-18 | 39128600115 / 1 | 65/66 / 66/66 | 130 / 820 / 1414 ms | 2026-10-18 (02:54) | ChainCatcher, Foresight (no feed) |

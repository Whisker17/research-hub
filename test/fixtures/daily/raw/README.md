# Raw source responses (WHI-1931)

Fixtures for `rh ingest` (`test/ingest.test.ts`). The adapters read these bodies through a local
HTTP server; the test suite never calls the real APIs.

| File | Origin |
| --- | --- |
| `fxtwitter-timeline.json` | Real `GET https://api.fxtwitter.com/2/profile/Ethtao_Ethtao/statuses` (page 0), fetched locally 2026-10-18 ~14:10 UTC. Statuses trimmed to the fields the adapter reads (`id`, `url`, `text`, `created_*`, `author.screen_name`, `card`, `article`, `quote`, `reposted_by`). |
| `fxtwitter-status.json` | Real `GET /2/status/<id>` for every `[原文]` ref of the 2026-10-18 digest plus the X Article `2109979863612535014`, same day, same trimming. Keyed by the requested id. |
| `odaily-newsflash-p1.json`, `-p2.json` | Real `GET https://api.odaily.news/api/v1/newsflash?page=1..2&size=100`, same day; `content` cut to 300 chars. |
| `ethresearch-latest-created.json`, `magicians-latest-created.json` | Real Discourse `GET /latest.json?order=created`, same day; topic fields trimmed. |
| `theblock-rss.xml` | Real `GET https://www.theblock.co/rss.xml`, same day, unmodified. |
| `blockbeats-newsflash-important.json` | **Synthetic** — see its `note`. |

The WHI-1925 fixtures beside this directory (`../ethtao/*.json`, `../sources/*.json`) are the
survey's normalised samples and are not modified. `../ethtao/variants.json` adds real digests for
the format variants they lack.

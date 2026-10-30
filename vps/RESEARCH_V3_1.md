# Public news pages and recovery, version 3.1

The VPS root now serves a public news board; `/research.html` retains the research panel. Both use the same full research database. Each `/news/<canonical-id>` has SSR article metadata, a same-page media coverage panel, inline two-source comparison, a separate 180-day topical history, declared earliest timestamp in close headline candidates, and stored versions. Legacy `article.php?id=` redirects only if its reused historical ID maps unambiguously to one canonical record; ambiguous IDs must not point to an arbitrary story.

No Upstash or request-time Gemini dependency. Similarity is lexical TF-IDF, not a verified event graph. Original and translated text are distinguished. Missing translations can prevent cross-language matching. Earliest candidate is NOT proof of the original source, and topical history is NOT the same event. Candidate counts are capped (600 nearby / 1200 historical) and coverage incomplete. Excerpts are not full article bodies.

## Archive recovery

`research/backfill.py` discovers publisher archives for the outage 2026-10-08 22:15 UTC through 2026-10-30 08:00 UTC. Fixed publisher hosts, robots policies, TLS verification, bounded redirects/response sizes, rate limits, no paywall bypass. Last-modified timestamps only prioritize URLs, never substitute for publication dates. Import requires publisher HTML/JSON-LD publication date with explicit timezone. Store original title and metadata excerpt, recovery time and discovery evidence; do not invent first-seen dates. Unsupported/blocked publishers are reported, not silently counted as complete.

Queue, attempts and source discovery records persist in `/opt/zohurnews/data/recovery/progress.sqlite`. The timer resumes batches independently of live ingestion. Import is URL-idempotent. `/api/coverage` exposes per-day/source totals, recovery counts and an explicit incomplete-period marker. A completed discovered queue does not prove complete historical coverage. Full body extraction, paid publisher archives and human-verified event clustering are outside this release.

## Deployment

Image `zohurnews-research:3.1.0`, same localhost port 18086. Retain 3.0 image and pre-change database/source backup. Deploy compose and capture/research units with 3.1 image. Install recovery units; start only after pilot validation. Stop recovery with `systemctl disable --now zohurnews-recovery.timer` and `systemctl stop zohurnews-recovery.service`; capture remains independent.

Domain A records for apex and www must point to 91.228.186.233. Nginx config is prepared without changing other project vhosts. Run `deploy/enable-public-domain.sh` after DNS propagation to issue TLS and verify health. Until DNS changes, the old shared-host site remains visible at the domain. Do not cancel old hosting before DNS/TLS and article links are independently checked.

Rollback: stop recovery, restore compose/service image tags to 3.0.0, daemon-reload and recreate web container. Schema additions are backward-compatible; keep recovered data. Full DB restore is exceptional and would discard newer captures, so do not restore casually. The original shared-host upload remains available separately.

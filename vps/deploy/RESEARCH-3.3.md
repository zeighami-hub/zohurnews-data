# Research 3.3

The research desk compares selected sources using the full filtered SQLite corpus, independently of table pagination. `/api/media-comparison` reports unique URL counts, corpus shares, daily UTC counts, declared publication availability, original excerpt availability, translation backlog, first matching records and source feed observations. A zero is absence in the stored query result, not proof that a publisher ignored a subject. Relative publication times compare query results, not verified event response speeds. JSON export includes applied filters, method and calculation time.

The homepage retains its original layout. Foreign records remain in the research archive while pending translation and enter the live homepage after translation; Persian originals publish without an AI rewrite. Foreign preprocessing is allocated round-robin across sources with Iran relevance and recency ordering within each source. The per-cycle foreign budget remains 100 unless configured otherwise.

Recovery stores resumable sitemap queue checkpoints. A new checkpoint becomes authoritative only after discovered URLs are committed to the recovery ledger. Each discovery pass examines at most 25 maps per source. Topic/author/directory pages are excluded as news. Existing archive records are retained. Recovery remains incomplete when publishers restrict access or queues remain.

## Verification

```
node --test research/media-comparison.test.mjs
python3 research/backfill_test.py
```

Tests cover full aggregation beyond page limits, filtering and SQL parameter safety, zero source evidence, publication gating, native text preservation, minority-source allocation, publication provenance and resumable sitemap traversal. Before activation, production corpus counts were compared against an independent read-only SQL query, source article links were checked and the public feed was checked against all pending foreign record IDs. Browser QA used 60 genuine source records in an isolated database; its sample counts are not production corpus counts.

## Deployment and rollback

Build `zohurnews-research:3.3.0` using `research/Dockerfile`. Both the web compose service and the ingestion systemd service must use this image. Preserve `/opt/zohurnews/releases/research-v3.pre-3.3.0` before updating the stable research-v3 directory. Data is unchanged by code deployment; no database rollback is necessary for these features.

To roll back, restore code from that preserved directory, restore the research compose image to 3.2.2 and the ingestion service image to 3.2.1, reload systemd and recreate only the research web container. Never replace live databases with old backups as part of a code rollback. Recovery checkpoints can remain; old code ignores them.

## Backups and remaining account setup

Daily local backups retain 14 snapshots of each database. Online SQLite backup and full independent decompression/integrity verification are used. `/opt/zohurnews/state/restore-verification.json` records the latest verification. Do not interpret local backups as offsite protection.

Google Drive cloud backup is implemented with rclone crypt and full remote restore verification. It is intentionally disabled until the owner supplies a private OAuth refresh token and recovery passphrase through `sudo python3 /opt/zohurnews/releases/research-v3/deploy/offsite/configure_drive.py`. Never paste credentials into chat, GitHub or application logs. The Windows backup agent also needs that one-time account setup. Code is stored in GitHub; fresh database snapshots are not committed there.

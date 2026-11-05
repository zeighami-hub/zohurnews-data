# Free-quota publication policy

The active project reported a Gemini free-tier limit of 500 requests per day. The ZohurNews worker uses a lower hard cap of 400 attempts per provider day, at most four attempts per ingestion cycle and at least 20 seconds between requests. A normal 15-minute schedule permits at most 384 attempts in a 24-hour day. Each attempt contains up to 15 foreign records; failed responses, timeouts and retries all consume the local allowance before network I/O. Native Persian records use their original wording without a model call.

The counter lives in news.sqlite metadata under gemini_free_budget_v1 and survives worker/container restarts. A first installation with unknown prior usage blocks API calls until the next provider day; it never grants an unverified allowance. The counter is shared across models within this worker. Google applies limits across the whole project; other applications using the project may consume the reserved headroom. Any provider 429 stops the current translation cycle and persists its cooldown. Daily quota errors pause until at least the next Pacific midnight plus one minute; shorter quota errors honor RetryInfo and Retry-After.

Provider days follow America/Los_Angeles, including daylight saving changes, rather than Tehran or UTC midnight. The Google API documentation states that RPD resets at midnight Pacific time: https://ai.google.dev/gemini-api/docs/rate-limits

Raw capture, original archive storage and Persian publication continue while foreign translation is paused. Pending foreign records remain available in the research archive. The existing homepage policy publishes foreign stories only after translation. Its live window remains 24 hours; older pending records remain archived. last_translation advances only when foreign translations are actually added; translation_budget records usage, pause reason and retry time in research metadata.

Configuration (non-secret):

```
MAX_PER_CYCLE=60
GEMINI_DAILY_REQUEST_LIMIT=400
GEMINI_REQUESTS_PER_CYCLE=4
GEMINI_MIN_INTERVAL_MS=20000
```

The implementation rejects values above the safety caps and intervals below 20 seconds. It does not activate billing, change API keys, rotate projects, or enable paid fallback models.

Validation: node --test worker/gemini-budget.test.cjs worker/gemini-pipeline.test.cjs research/media-comparison.test.mjs. Integration tests mock the provider and prove that exhausted allowance makes zero network calls, a 429 makes exactly one call, and original Persian publication continues. The tests also check persisted budgets, pacing, cycle caps and both daylight saving transitions.

Deployment uses zohurnews-research:3.4.0 for the ingestion systemd service. Web delivery remains on its existing image. Before activation, previous source/configuration/unit files are retained privately for rollback. Do not reset the counter when rolling back code or replacing credentials. A rollback to an older worker removes this protection and should only be done with translation scheduling paused.

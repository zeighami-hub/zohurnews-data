# Modal and translation, 3.2.1

The homepage article modal now contains headline, summary and links only. The embedded research iframe and newsValues analysis block were removed. Its primary detail link opens /news/<canonical-id>, where research tools, related coverage, history and versions remain available.

Existing Persian translations remain preferred by the homepage. A live translation_pending count exposes foreign stories without a completed translation. No English summary is represented as a verified Persian translation. Gemini is NOT configured on this VPS as of this release: /opt/zohurnews/private/worker.env is absent. Automatic translation activation requires the owner to enter the key once in the private VPS terminal using deploy/configure-research.py --activate. Never paste keys into chat or commit them. No replacement translation provider or secret extraction was introduced.

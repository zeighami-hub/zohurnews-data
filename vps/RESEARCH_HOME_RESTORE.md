# Original homepage restored, 3.2

The uploaded original homepage is preserved in research/home-source/original.html. Its column layout, source toggles, drag ordering, filters, archive modals, language control and toolkit are retained. React and Tailwind are built locally with pinned dependencies (npm ci && npm run build in research/home-source); generated home.js/css/html are served from research/web. No browser Babel, Tailwind CDN or third-party scripts are required.

The homepage consumes compatibility adapters backed by research.sqlite. Last update is the actual ingestion timestamp; unknown sentiment scores are never filled with 33/33/33. The framing tab points to evidence-based research instead. The article modal embeds its /news/<id> page with coverage comparison and history; /research.html remains available separately. UTC archive days follow the existing archive contract. Legacy Iran scores are unavailable, and positive score filters return an explicit unsupported response.

Prices, weather, prayer times and official calendar events are NOT connected in this release: empty values remain visible, not invented live values. Calendar fallback uses Intl with Tehran timezone; the calculated lunar calendar is labeled as calculated. Domain cutover and Google authorization requirements from previous releases remain unchanged. Layout browser QA used a real 37-record sample; full API verification used the VPS database and all 19 sources.

Rollback: change the root static mapping back to public-pages.homePage or use the prior image. Keep the research database and recovery process untouched.

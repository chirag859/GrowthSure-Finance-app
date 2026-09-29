# GrowthSure Finance app

The client-facing GrowthSure Finance web app: home loan repayments, stamp duty for every state,
government grants and concessions, the RBA cash rate and industry news.

Live at https://finance.growthsure.com.au (hosted on Netlify, which publishes this repository automatically on every push to `main`).

- `index.html` — the whole app
- `sw.js` — service worker: offline support and the "A newer version is ready" prompt. **Change `CACHE_NAME` on every update** so installed phones pick it up.
- `manifest.json`, `icon-*.png` — lets phones install it to the home screen
- `_headers` — tells Netlify not to cache `index.html` and `sw.js`, so updates reach clients

Figures are verified against the RBA, each state revenue office, the ATO, ABS, APRA and Housing Australia by a scheduled routine.

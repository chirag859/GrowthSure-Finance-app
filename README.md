# GrowthSure Finance app

The client-facing GrowthSure Finance web app: home loan repayments, stamp duty for every state,
government grants and concessions, the RBA cash rate and industry news.

- `index.html` — the live app served by GitHub Pages at https://app.growthsure.com.au
- `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png` — lets phones install it to the home screen
- `CNAME` — the custom domain for GitHub Pages
- `src/growthsure-finance.html` — the app source (also published to the claude.ai artifact)
- `src/build-deploy.ps1` — rebuilds `index.html` from the source; `src/make-icons.ps1` regenerates the icons

Figures are verified against the RBA, each state revenue office and Housing Australia; a weekly routine re-checks them every Tuesday.

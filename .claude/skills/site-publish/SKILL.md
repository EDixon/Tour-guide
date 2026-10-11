---
name: site-publish
description: Last link in the Tour Guide site chain. List the new site in the app, run the final tests, push to GitHub Pages, and send Eliot a short report with what to check on the day. Run by the main chat after site-check.
---

# site-publish: put it on the phone

1. **List it:** add `{ "id": "<id>", "name": "<Site>", "file": "<id>.json", "pos": [lat, lon], "operator": "<operator>" }` to `tours/index.json`. `pos` is the main entrance, used for "nearest site" sorting.
2. **Final checks:** `npm test`, `node tools/validate-tour.mjs tours/<id>.json 120`, `node tools/check-knowledge.mjs <id>`. All must pass.
3. **Offline files:** add the site's tour, map layer (`tours/<id>.map.json`), photo credits and knowledge files to `FILES` in `sw.js`, so they are stored when the app is installed. The app also fetches the photos themselves when online.
4. **App code:** only if you changed app files (`app.js`, `planner.js`, `style.css`, `index.html`, `assistant/*`), bump `VERSION` in `sw.js` so phones pick up the new code. New tour and knowledge files don't need it.
5. **Push** to `main`. Pages redeploys in a minute or two; confirm with `gh run list -L 1`.
6. **STATUS.md:** tick publish, set `Stage: done`, log the date.
7. **Report to Eliot**, short:
   - what the tour covers: stops, must-sees, and how deep the knowledge goes
   - what's estimated, e.g. "paths estimated, so please record a GPX"
   - the flags to check on the day
   - how to get it on the phone: open the app with signal, choose the site, and wait for "available offline"

After the visit, the **site-update** skill handles notes, corrections and GPX tracks.

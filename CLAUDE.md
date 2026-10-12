# Tour Guide: notes for Claude

An offline phone guide for historic sites that re-plans the visit as the day changes, with an offline assistant (Gemma running on the phone via the Android app) for questions. Owner: Eliot Dixon (Roboverse Reply UK). It's a personal family tool, used by Eliot, his wife and their two-year-old daughter on a Google Pixel 9 Pro.

## Standing rules
- **British English, UK sources.** Be realistic, keep to the point, don't flatter. Ask before continuing if something vital is missing.
- **One visit, and it is the real one.** Each site is visited once. There is no trial run and no return visit, so nothing can be checked on the day and fixed afterwards. Get everything right before the visit. Where something stays uncertain, choose the best-supported answer, say in the app text that it is uncertain, and never leave it as "check on site" or "record a GPX next time".
- **Every fact has a source.** Site-specific claims need a site-specific source: a Historic England listing, the operator's history pages, county archives, scholarly work. "General knowledge" is only acceptable for well-established background, and must never be used for anything about the site itself. If sources disagree, say so in the text and flag it.
- **Nothing private in the repo.** It is public and served by GitHub Pages. No API keys, tokens, personal data or GPS tracks.
- **Every site has its full ownership chronology** (`owners` in its dates file, from the first record to today), so "who owned it when…" is answered by the app, not guessed.
- **Dates are written out in full** in anything the model reads: "1834–1839", not "1834–39"; "about 1835", not "c.1835".
- **Test before pushing:** `npm test` and `node tools/validate-tour.mjs tours/<id>.json 120`, plus `node tools/check-knowledge.mjs <id>` once the site has knowledge.
- **Pushing:** work on `main` (Pages publishes it). Commit messages end with the Co-Authored-By and Claude-Session lines the environment specifies.

## Layout
- App (served as-is): `index.html`, `app.js`, `planner.js`, `style.css`, `sw.js`, `tours/`, `assistant/`, `knowledge/`, `icons/`.
- `tours/<id>.json`: stops, bullets, paths, map, timeline (format: `docs/TOUR_FORMAT.md`). `tours/index.json` lists the sites.
- `knowledge/<id>/notes.md` and `dates.json`, plus shared packs in `knowledge/reference/<pack>/` (format: `docs/KNOWLEDGE_FORMAT.md`).
- `assistant/`: the prompt pipeline. `maths.js` works out all date facts so the model never calculates, `retrieve.js` picks the notes, `prompt.js` builds each question's prompt, `knowledge.js` loads the files, `llm.js` talks to the Android app.
- `android/`: the Android wrapper app (a WebView of the site plus on-device Gemma). It is built by GitHub Actions and published as the `android-latest` release.
- `sites/<id>/`: working files for preparing a site (brief, status, research drafts). These are not served to the app.
- `tools/`:
  - checking: `validate-tour.mjs`, `check-knowledge.mjs`, `ask.mjs` (prints the exact prompt for a question)
  - merging research: `merge-research.mjs`
  - map: `fetch-osm.mjs` (OpenStreetMap layer), `osm-network.mjs` (path network from the OSM footpaths), `map-markers.py` and `georef.mjs` (place a leaflet or guidebook map on the real one)
  - photos: `fetch-photos.mjs` (Wikimedia Commons), `photo-spots.mjs` (viewpoints from where people take photos)
- **Network access:** Claude's workspace can't reach OpenStreetMap or Wikimedia. `fetch-osm.mjs` and `fetch-photos.mjs` run in GitHub Actions, started by pushing `sites/<id>/osm.request` or `sites/<id>/photos.request`, and commit their results. Then `git pull`.

## Adding or updating a site
Use the skills in `.claude/skills/`, which run as a chain: **new-site → site-survey → site-research → reference-packs → site-check → site-publish**, plus **site-update** for corrections or more depth on request before the visit. Each reads and updates `sites/<id>/STATUS.md`, so work can resume in a fresh chat ("continue <site>").

Model use is deliberate:
- The main chat should be **Opus**. It does scoping, mapping, judgement and the final checks.
- Bulk research goes to the `stop-researcher`, `reference-writer` and `visitor-scout` agents (**Sonnet**).
- Mechanical fixes go to `format-fixer` (**Haiku**).
- Fact-checking goes to `fact-checker` (**Opus**, fresh context, reports only).

## The family's interests (default topic weights)
- High: structural engineering, building methods, physics, space, computing, pretty views and nice walks.
- Medium: wider historical links, especially the **Habsburgs**.
- Low: furniture, wallpaper, fabrics.
- Toddler tasks should be genuinely findable on site.
- A good story isn't the only reason to visit a stop. Every sight also has `wow` (how visually impressive it is) and `popular` (how often visitors single it out in reviews). Both are scored from evidence recorded in `sites/<id>/visitor-scores.md`, and each has its own slider in the app.

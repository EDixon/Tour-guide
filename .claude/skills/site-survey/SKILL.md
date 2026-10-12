---
name: site-survey
description: Second link in the Tour Guide site chain. Survey a site, gather sources, define stops with coordinates, the path network, buildings, timeline and facilities, and write the skeleton tour file and per-stop research plan. Run by the main chat (Opus) after new-site; hands on to site-research.
---

# site-survey: map the site and plan the research

Main chat (Opus). Read `CLAUDE.md`, `sites/<id>/brief.md` and `STATUS.md`. Formats: `docs/TOUR_FORMAT.md` and `docs/KNOWLEDGE_FORMAT.md`; the reference example is `tours/wrest-park.json`.

**Ask Eliot what he has** (one message, before mapping). Anything here beats what can be found online:
- **Site map:** a photo of the map board on site, the operator's leaflet map, or map photos saved from Google Maps (Claude can't fetch those itself).
- **Visitor guide or guidebook:** photos of the pages, or a PDF.
- **Other photos:** any of his own photos of the site, especially of things to look for.
- **A GPX track** or route, if he already has one.

Attach them in the chat; they are saved to `sites/<id>/inputs/`, which is kept out of the repo (it is public, and guidebooks and photos are copyright or personal). So:
- Take what you need from them now.
- Cite a guidebook like any other source ("English Heritage guidebook (2011), p. 12") in `sources.md`.
- List in `STATUS.md` what was supplied, so a later chat knows to ask for it again.

If `brief.md` already lists inputs, or says Eliot was asked and has none, don't ask again. If Eliot isn't there, carry on without them and add a flag.

**If the site already exists** (`tours/<id>.json` is there): don't rebuild it. Keep the stops, paths and bullets that work, read `STATUS.md` for what's known to be weak, and concentrate on:
- `sources.md`, covering the whole site
- the map (section 3):
  - fetch the OpenStreetMap layer if it's missing
  - check stop positions against it
  - redraw the path network along the real footpaths
  - add the car park and main entrance
- photo spots (section 3), if `sites/<id>/photo-spots.md` doesn't exist
- visitor scores: if `sites/<id>/visitor-scores.md` doesn't exist, add a "visitors" line to the research plan so the visitor-scout runs
- the ownership chronology (section 3)
- `dates.json` entries for every stop
- a research plan covering every stop without a notes section (`node tools/check-knowledge.mjs <id>` lists them), plus any existing notes that need more depth

Fix stops or paths only where the sources show they're wrong.

## 1. Sources: `sites/<id>/sources.md`
Gather and list, with URLs:
- **Official listing entries.** Historic England (or Cadw / Historic Environment Scotland / the national register abroad) for every listed structure, via British Listed Buildings pages where Historic England's own site is hard to fetch. These give the most reliable dates and **coordinates**.
- **The operator's pages:** history, visit, facilities, accessibility, site map or leaflet (PDF), and anything temporarily closed.
- **Registered park and garden entry** if there is one.
- **County archives / record office pages, Wikipedia,** and any scholarly or Victoria County History entries.
- Note what each source is good for and anything they disagree on.

## 2. Stops
Only physical places a visitor can stand at or look at:
- rooms, garden features, viewpoints
- the visitor centre, café and toilets, as `kind: "facility"`
- **arrival:** the main car park (and any overflow car park) with `facilities: ["parking"]`, and the main entrance with `facilities: ["entrance"]`, as facility stops. They are often not where the visitor centre is. Set the tour's `start` and `exit` to the main car park, and make the path network go car park → entrance → visitor centre the way visitors actually walk.
- an introduction stop (`kind: "intro"`)

For each stop:
- **Position and dating:** id, name, short name, coordinates (from the listing where possible, `approx: true` if estimated), date and dateLabel, era.
- **Planning values:**
  - `wow` (0–5, how visually impressive it is, on the scale in `docs/TOUR_FORMAT.md`). This is provisional: the visitor-scout settles `wow` and `popular` from evidence during research.
  - `dwell` seconds.
  - `mustSee` for the two or three unmissables. Revisit these once the visitor scores are in.
- **Indoor rooms:** `building` and `indoor`.
- **Text:** a one-line `look` ("what to look at on arrival"), a practical `note` (steps, opening), and `facilities`.

Leave `bullets` and `kids` empty: research fills them. Aim for 15–30 stops. Too many makes the planner's job harder without adding value.

## 3. Paths, map, timeline
- **OpenStreetMap layer first.** Unless `tours/<id>.map.json` exists and is recent:
  1. Create `sites/<id>/osm.request`. Its first line holds the arguments, e.g. `--margin 300`; for a new site with no stops yet, use `--bbox south,west,north,east`.
  2. Commit and push it. The "OpenStreetMap layer" GitHub workflow fetches the data (Claude's workspace can't reach OpenStreetMap) and commits `tours/<id>.map.json` and `sites/<id>/osm-pois.json` within a minute or so.
  3. `git pull`. If nothing arrives, check `gh run list --workflow osm.yml`.
  4. Set `"map": {"osm": "tours/<id>.map.json", "osmNote": "..."}` in the tour, and add the file to `sw.js`.
- **Use it:**
  - `osm-pois.json` lists named points (statues, toilets, gates, car parks, buildings) with positions. Check every stop's position against it and the listing. Where they disagree by more than about 20 m, find out which is right and say so in `sources.md`.
  - Draw waypoints and path links along the real footpaths in `tours/<id>.map.json`, so walking distances are realistic. `node tools/osm-network.mjs <id>` does this: it builds the links from the OSM footpaths, snaps the stops on and copies OSM steps. Link names, scenic scores, extra paths and extra steps go in `sites/<id>/network.json` (format at the top of the tool). Run it without `--write` first to see the report.
- **A map picture from Eliot** (leaflet, guidebook plan, photo of the board). Visitor maps are rarely to scale: often a bird's-eye view, rotated and stretched. So georeference it, rather than reading positions off it by eye:
  1. **Prepare the image.** Render a PDF at 200 dpi or more (`pdftoppm -r 200`) and crop to the map.
  2. **Find the markers.** For numbered key markers, sample their colour from the key and run `python3 tools/map-markers.py map.png --colour R,G,B --sheet sheet.png --json markers.json`. Read the numbers off the contact sheet.
  3. **Fit.** Choose 10–20 control points with certain positions (OpenStreetMap buildings in `osm-pois.json`, listing coordinates), spread over the whole map including the far edge. Run `node tools/georef.mjs fit control.json`. It fits a perspective transform plus a smoothed spline and prints leave-one-out errors.
     - A median under about 25 m is fine for placing facilities.
     - Errors are larger at the far edge of a bird's-eye view, and where a marker sits beside its feature rather than on it.
     - Mark doubtful points `"use": false` to check them without fitting to them.
  4. **Apply.** Use `node tools/georef.mjs apply` to place what only the picture shows: admissions, toilets, play area, buggy start, audio points.
  5. **Trace routes.** Trace drawn routes (suggested walks, a mobility-buggy or step-free route) by running `map-markers.py` with the route's colour, then `georef.mjs chain`, then `apply`. Match the result to the nearest OpenStreetMap footpaths. A step-free buggy route tells you which paths suit the pushchair.
  6. **Merge by trust.** For each kind of data, the most trusted source wins:
     - **Paths walked:** GPX.
     - **Shapes and paths:** OpenStreetMap.
     - **Listed structures:** listing coordinates.
     - **Facilities, routes and names:** the picture, for anything only it shows.
     - **Anything else:** estimates.

     Record every disagreement over about 20 m in `sources.md`.
- **Photos and photo spots:**
  1. Create `sites/<id>/photos.request` containing `list`, then commit and push it. The "Site photos" workflow writes `sites/<id>/photos.json`, a list of geotagged Wikimedia Commons photos (including Geograph's).
  2. `git pull`, then run `node tools/photo-spots.mjs <id>`. It finds the places several different people stood to take a picture.
  3. For a spot that no stop covers and that is a real view, add a stop with `photoSpot: true`, `kind: "sight"` and a `look` line saying where to point the camera and what's in shot. Give it `wow` 3–5 and a short `dwell`.
  4. For a spot at an existing stop, mention the view in that stop's `look`.
  5. The photo list also feeds the researchers' photos for "look for" points and the visitor-scout's evidence.
- **Waypoints and paths:**
  - Cover all stops: `[a, b, scenic, name, door?]`.
  - Scenic scores: waterside or viewpoint walks 0.8–1, ordinary paths 0.3–0.5, service short-cuts 0.2.
  - **Steps.** Mark links with steps `{"steps": true}` (sixth element), so pushchair mode can avoid them. OpenStreetMap marks steps (`highway=steps`, drawn dashed), and the operator's access page and leaflet name others. Do the same for stops that need steps (`"steps": true`) and for buildings whose way in has steps with no lift or ramp. Make sure every stop that is step-free in fact has a step-free route, so pushchair mode doesn't lose it.
  - Name each link the way you'd give directions ("Long Water, west bank").
  - Use, in order of preference: a GPX from Eliot, the OpenStreetMap footpaths, his map photos, then estimates from listing coordinates. Say which in `map.osmNote` (or `map.note` without OpenStreetMap).
- **Map shapes:** only without the OpenStreetMap layer (abroad, say, where coverage is poor): a few schematic shapes (water, woodland, main buildings).
- **Timeline:**
  - Eras: 6–10, covering how the site developed.
  - Events: 20–35 dated events, linked to stops where possible. Keep labels short. Research adds `more`, the explanation shown when an event is tapped, so assign each event that needs one to a research batch: events at a batch's stops go to that batch, and sales, inheritances and the like go to "family and owners".
- **Ownership chronology (required):** in `knowledge/<id>/dates.json`, set `site` (how a sentence names the place) and `owners`. That is every owner or custodian from the first record to today, in order, as `[from, to, "who"]`, with `null` for the current one (format in `docs/KNOWLEDGE_FORMAT.md`).
  - Use the listing entries, the operator's history, county history (the Victoria County History is good for this) and family histories.
  - Where a stretch is uncertain, give the best-supported row, note it in `sources.md`, and add a flag.
  - The research plan should include a "family and owners" batch that writes the notes section telling this story.
  - For ancient or state sites (Egypt), "owners" means who controlled or cared for the site: dynasty, temple estate, later rulers, the antiquities service. Rulers by period go in a reference pack.
- **Topics and weights:** copy from Wrest unless the brief says otherwise.
- **Knowledge links:** `"knowledge": {"site": "knowledge/<id>", "reference": [<packs it will use>]}`. Check which packs already exist in `knowledge/reference/`.
- **Dated things:** for each stop, list its main dated things and people in `knowledge/<id>/dates.json`: ids, names, dates and `stops`. Research fills in the `who`, `events` and links.

## 4. Research plan: `sites/<id>/research-plan.md`
- Split the stops into **batches of 3–4** that share people and periods (e.g. "Duke of Kent's garden: pavilion, statue, canals"), so one researcher reads the same sources once.
- For each batch, give:
  - the stops
  - the dated thing and person ids it should use or create
  - the specific sources to start from
  - the angles worth pursuing (engineering, the Habsburgs, science), but only where genuine
  - the timeline events it should explain (year and label exactly as in the tour file)
- Add a **visitors** line: the visitor-scout scores every sight for `wow` and `popular` (no batch of stops; it covers the whole site).
- List the **reference topics** the site needs: rulers, a royal house, an architectural style, a technology. Mark which exist already and which need writing.

## 5. Check and hand on
- `node tools/validate-tour.mjs tours/<id>.json 120`. Fix errors. Stops with no bullets will be flagged; that's expected at this stage.
- Update `STATUS.md`: tick the survey stage, fill the batches table, set `Stage: research`, and add flags (e.g. "path network estimated from OpenStreetMap, unwalked"). There is no later visit to correct things, so a flag must say what the app will do, not ask for a check on site.
- Commit and push (`<site>: survey and research plan`).
- Invoke the **site-research** skill.

---
name: site-survey
description: Second link in the Tour Guide site chain. Survey a site, gather sources, define stops with coordinates, the path network, buildings, timeline and facilities, and write the skeleton tour file and per-stop research plan. Run by the main chat (Opus) after new-site; hands on to site-research.
---

# site-survey: map the site and plan the research

Main chat (Opus). Read `CLAUDE.md`, `sites/<id>/brief.md` and `STATUS.md`. Formats: `docs/TOUR_FORMAT.md`; the reference example is `tours/wrest-park.json`.

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
- an introduction stop (`kind: "intro"`)

For each stop:
- **Position and dating:** id, name, short name, coordinates (from the listing where possible, `approx: true` if estimated), date and dateLabel, era.
- **Planning values:** `wow` (0–5, value of just seeing it), `dwell` seconds, and `mustSee` for the two or three unmissables.
- **Indoor rooms:** `building` and `indoor`.
- **Text:** a one-line `look` ("what to look at on arrival"), a practical `note` (steps, opening), and `facilities`.

Leave `bullets` and `kids` empty: research fills them. Aim for 15–30 stops. Too many makes the planner's job harder without adding value.

## 3. Paths, map, timeline
- **Waypoints and paths:**
  - Cover all stops: `[a, b, scenic, name, door?]`.
  - Scenic scores: waterside or viewpoint walks 0.8–1, ordinary paths 0.3–0.5, service short-cuts 0.2.
  - Name each link the way you'd give directions ("Long Water, west bank").
  - If Eliot supplied a map or GPX, use it. Otherwise estimate from listing coordinates and say so in `map.note`.
- **Map shapes:** a few schematic shapes (water, woodland, main buildings).
- **Timeline:**
  - Eras: 6–10, covering how the site developed.
  - Events: 20–35 dated events, linked to stops where possible.
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
- List the **reference topics** the site needs: rulers, a royal house, an architectural style, a technology. Mark which exist already and which need writing.

## 5. Check and hand on
- `node tools/validate-tour.mjs tours/<id>.json 120`. Fix errors. Stops with no bullets will be flagged; that's expected at this stage.
- Update `STATUS.md`: tick the survey stage, fill the batches table, set `Stage: research`, and add flags (e.g. "path network estimated: please record a GPX on the visit").
- Commit and push (`<site>: survey and research plan`).
- Invoke the **site-research** skill.

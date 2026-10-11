# Brief for preparing a new tour file

Give Claude this brief with the site name, e.g. *“Prepare a tour file for Audley End House using prep/PREP_PROMPT.md”*.

---

Build `tours/<id>.json` for **<SITE>** in the format in `docs/TOUR_FORMAT.md`, modelled on `wrest-park.json`.

**Research (cite everything):**
- **Official listing entries** (Historic England / British Listed Buildings) for every listed structure on site. Take the coordinates from these.
- The operator's history, visit, facilities and access pages, plus any downloadable site plan or leaflet.
- Wikipedia and county archive pages for the wider story.
- Current opening times and anything temporarily closed.

**Stops:**
- Only physical places a visitor can stand at: rooms, garden features, viewpoints, plus the visitor centre/café/toilets as `facility`.
- Indoor rooms get `building` and `indoor`, with approximate positions inside the building footprint.
- Mark estimated positions `approx`.
- Include `look`, a practical `note` where relevant, and one toddler `kids` task that is genuinely findable there. Don't invent features.

**Bullets:**
- 3–9 per stop, in an order that makes sense when items are skipped. Bullet 1 is the headline.
- Score `imp` 1–5 and tag topics using the tour's topic list.
- Use `needs` for follow-ups that only make sense after an earlier bullet.
- Every bullet gets `src`. Anything not from a site-specific source gets `"gk"` and, if non-trivial, `verify: true`.
- **Our interests:**
  - High: structural engineering and building methods, physics, space, computing.
  - Medium: links to wider history, especially the **Habsburgs**.
  - High: pretty views and nice walks.
  - Low: furniture, wallpaper and fabrics.
- Find genuine links to the high-interest topics. Never force them.
- British English, written to be read aloud.

**Timeline:** 6–10 eras covering how the site developed, plus 20–35 dated events, each linked to a stop where possible.

**Paths:**
- A walkable network of waypoints and links between all stops.
- `scenic` scores: waterside or viewpoint walks 0.8–1, ordinary paths 0.3–0.5, woodland or service short-cuts 0.2.
- Give each link a direction-style `name`, e.g. “Long Water, west bank”.
- Say clearly in `map.note` which parts are approximate.

**Map:** a few schematic shapes (water, woodland, main buildings) so the map is readable offline.

**Check:**
- Run `node tools/validate-tour.mjs tours/<id>.json 120` and fix any problems.
- Read through the sample plan for common sense.
- List the `verify` items for me to check.

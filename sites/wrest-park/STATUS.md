# Wrest Park: status

Stage: survey
Updated: 2026-10-11

**Existing site.** `tours/wrest-park.json` was built by hand before the skills chain existed, and `knowledge/wrest-park/` holds sample notes only. Run site-survey in its "If the site already exists" mode: keep the stops, paths and bullets that work, and don't rebuild.

## Stages
- [x] new-site: brief (written after the fact)
- [ ] site-survey: existing-site review. Needs `sources.md`, the ownership chronology, `dates.json` for every stop, and the research plan.
- [ ] site-research: partial. Sample notes and dates cover 11 of 25 stops: terrace, countess, staircase, staterooms, dining, exhibition, orangery, bathhouse, william, pavilion, cbcol.
- [ ] reference-packs: partial. `rulers` exists but covers only England/Britain from 1660 and France from 1643.
- [ ] site-check: not done. No fact-check has been run.
- [ ] site-publish: listed in the app already. Re-publish (bump `sw.js` VERSION) when the knowledge changes.

## Known gaps (for the survey to plan)
- **No ownership chronology.** `site` and `owners` are missing from `knowledge/wrest-park/dates.json`. It must run from the first record (the de Greys, 1280s) through the 1917 sale and the twentieth-century owners and custodians to English Heritage today. This needs a "family and owners" research batch. The existing section "The de Grey family and Wrest" is a start, but its sources are mostly Wikipedia.
- **No visitor scores: ON HOLD.** No stop has `popular`, and the `wow` values were set by hand. Eliot asked (2026-10-11) to hold the review evidence for now. Don't run the visitor-scout until he says so. Leave a "visitors" line in the research plan marked on hold.
- **No timeline explanations.** None of the 32 events has `more`. Eliot specifically wants:
  - the 1916 fire: what was damaged, who was affected, what happened to the hospital
  - the 1917 sale: who bought it and what happened next

  Assign every event that leaves a question open to a batch.
- **Map.** The OpenStreetMap layer is in place (`tours/wrest-park.map.json`, fetched 2026-10-11), along with `sites/wrest-park/osm-pois.json`. Still to do:
  - Add the main car park and overflow car park (both in the OpenStreetMap data) and the main entrance as facility stops, and make the car park `start`/`exit`. Both are currently the visitor centre.
  - Check stop positions against `osm-pois.json`. Several stops look a few metres off their buildings, e.g. Bowling Green House.
  - Redraw the path network along the real footpaths. The current links are straight lines between estimated waypoints, so walking times are rough, and the planned route cuts corners on the map.
- **Leaflet test (2026-10-11).** Eliot supplied the English Heritage orientation leaflet (2024). It is not in the repo, so ask him to re-attach it. Georeferenced from 18 numbered markers, the median leave-one-out error was about 20 m (50–70 m at the far end and on the edges). It shows:
  - **Visitor centre stop is in the wrong place.** The `vc` stop is about 90 m from where the leaflet and OpenStreetMap put the visitor centre and admissions, by the main car park.
  - **Facilities to add:** admissions (marker 1), the mobility buggy start (marker 9, south of the mansion on the main axis), toilets and parking.
  - **Routes:** the blue mobility-buggy route follows the west avenue and the east side of the Long Water to the pavilion. It is step-free, so a good guide for the pushchair. The orange "upper gardens walk" is also drawn.
  - **Old house:** the `oldhouse` stop agrees with the leaflet (about 10 m).
  - **Dairy:** the `dairy` stop is about 25 m off.
- **Photos.** `sites/wrest-park/photos.json` lists 334 geotagged Commons photos by 38 photographers, fetched 2026-10-11. `photo-spots.md` has 14 spots. Most are at existing stops: the house, the pavilion and the Orangery are the most photographed. Views no stop covers yet:
  - the house seen up the Long Water from its south end (about 40 m from `longwater`)
  - mid-way along the Long Water
  - the Diana statue over the Ladies' Lake (about 95 m from `chinese`)
  - Oldpark Water by the West Half House

  25 "look for" points (mostly toddler tasks) have no photo yet; `validate-tour` lists them.
- **Steps not marked.** No path, stop or building has `steps` yet, so pushchair mode (👶) changes nothing at Wrest until the survey marks them. Sources:
  - OpenStreetMap's steps
  - the leaflet: the Archer Pavilion has steps, and the mansion has a lift
  - the English Heritage access page
- **14 stops have no notes or dated things:** italian, conservatory, dairy, science, parterre, oldhouse, bowling, longwater, whh, altar, ehh, altars, chinese, atlas.
- **The Silsoe science years** (the "science" stop and the agricultural engineering research) have no notes at all. That matters, because science and engineering are high-interest topics.
- **Rulers pack is too short.** It needs England back to at least 1066 (and Scotland where useful), so that facts about the medieval owners get rulers. Note that the app says "no ruler data" rather than guessing.
- **`check-knowledge` warnings:** existing notes use shortened date ranges, and several things have no `who`. These are mechanical fixes for format-fixer.
- **`tours/wrest-park.json` sources** are good for the listings. They don't include the Victoria County History for Bedfordshire (the Flitton with Silsoe entry), which is the best source for the medieval descent.

## Research batches
| Batch | Stops | State |
|---|---|---|
| (survey to fill) | | |

## Flags for Eliot
- **Paths are estimated.** Please record a GPX on the next visit and attach it in the chat. It is kept out of the repo.
- **Unverified quote.** Brown's "might unravel the Mystery of the Gardens" (cbcol bullet) has no source found yet.
- **Sources disagree on the column finial.** Bedfordshire Archives says the Capability Brown column has a pineapple on top. The Historic England listing describes an acanthus-leaf finial. A photo on the visit would settle it.
- **Debug-grade signing key.** The Android app signing key is committed knowingly. Install only from this repo's Releases.

## Log
- 2026-10-11: added stop scores (`wow`, `popular`) and their sliders, the visitor-scout agent, tappable timeline events (`more`), and merging of `owners` and events in `tools/merge-research.mjs`.
- 2026-10-11: brief and STATUS written for the existing site, ready for "continue wrest park" in a new chat. Since the last check: the assistant can now hold an ownership chronology, the century limit on date comparisons was removed, and BC years are supported.

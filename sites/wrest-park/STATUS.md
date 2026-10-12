# Wrest Park: status

Stage: research
Updated: 2026-10-12

**Existing site.** `tours/wrest-park.json` was built by hand before the skills chain; the survey (12 October 2026) reviewed it, and did not rebuild it. Next: site-research, batch by batch, from `research-plan.md`.

**Inputs Eliot has supplied** (kept in `sites/wrest-park/inputs/`, not in the repo, so ask again in a fresh container):
- English Heritage orientation leaflet (2024), PDF, supplied 12 October 2026.

## Stages
- [x] new-site: brief (written after the fact)
- [x] site-survey (2026-10-12):
  - `sources.md` and `research-plan.md`
  - full ownership chronology, from Domesday to today
  - dated things for every stop
  - stop positions checked against OSM and the leaflet
  - path network rebuilt along the OSM footpaths, with steps marked
  - car parks, admissions and south toilets added
  - two photo-spot stops (sundial, Oldpark Water)
- [ ] site-research: 7 batches below, plus visitors (on hold). Existing sample notes cover 13 of 27 stops.
- [ ] reference-packs: extend `rulers`; write `habsburgs`, `garden-styles` and `farm-machinery`.
- [ ] site-check: not done. No fact-check yet.
- [ ] site-publish: already listed in the app. Re-publish (bump `sw.js` VERSION) once the knowledge changes.

## Research batches
| Batch | Stops | State |
|---|---|---|
| 1 Earl de Grey's gardens by the house | italian, conservatory, parterre, dairy | returned, reviewed |
| 2 Old house and the seventeenth-century axis | oldhouse, sundial, longwater | returned, reviewed |
| 3 The Duke's woodland and the canals | bowling, whh, ehh, oldpark | returned, reviewed |
| 4 Jemima's garden and its follies | altar, chinese, altars, atlas | returned, reviewed |
| 5 Water and heat (deepen) | orangery, bathhouse, cbcol, pavilion | returned, reviewed |
| 6 The science years | science | returned, reviewed |
| 7 Family and owners | (notes sections; intro, staircase, oldhouse) | dispatched |
| Visitors (visitor-scout) | all sights | **ON HOLD** (Eliot, 2026-10-11) |

## Known gaps carried forward
- **No `popular` scores, and `wow` set by hand:** waits for the visitor-scout (on hold).
- **No timeline `more` yet:** every event is assigned to a batch in the plan, including Eliot's two (the 1916 fire and the 1917 sale), both in batch 7.
- **Notes still to fix:** the existing notes have shortened date ranges and things with no `who` (format-fixer at site-check). Many existing sections cite general knowledge or Wikipedia; the batches upgrade them.
- **25 "look for" points have no photo:** the batches pick photos from `photos.json`.
- **Planner time:** the network went from 42 to 214 nodes, so a worst-case 4-hour plan takes about 870 ms here (was about 600 ms; the test limit is 1500 ms). Watch for lag on the phone.

## Flags for Eliot
- **Paths now follow OpenStreetMap**, which is much better than before but still unwalked. A GPX track from the next visit would still help (attach it in the chat; it is kept out of the repo).
- **Positions placed by eye from the leaflet and OSM:**
  - admissions/main entrance, by the gateway at the west end of the visitor centre
  - the science-years viewpoint, at the east end of the cross walk
  
  Worth a glance on the day.
- **Head of the Long Water moved about 145 m south**, to where OSM shows the water starting. The old position (the lawn by the sundial) is now the "Sundial and the six statues" stop. The Mercury-and-Cupid bullet at `longwater` needs re-checking.
- **Steps near the Bath House** are shown on the leaflet but not placed on a path yet. Pushchair mode still routes to the Bath House. Please note where they are on the visit.
- **Pushchair mode:**
  - The Chinese Bridge and the parterre's central steps are now avoided.
  - The Pavilion is kept, because its outside is the sight; its note says to leave the pushchair at the foot of the steps.
- **Ownership chronology** was built from search summaries; the page fetches were blocked in this workspace. Batch 7 must confirm it. Least certain:
  - the Domesday identification
  - 1087–1283 (not recorded)
  - Sir Henry Wyatt, 1507–1512 (one source)
  - the 1946 Ministry purchase
  - John George Murray's description (the old "brewing and coal businessman" has no source)
- **Unverified quote.** Brown's "might unravel the Mystery of the Gardens" (cbcol bullet) has no source found yet.
- **Sources disagree on the column finial.** Bedfordshire Archives says pineapple, Historic England says acanthus. A photo on the visit would settle it.
- **Debug-grade signing key.** The Android app signing key is committed knowingly. Install only from this repo's Releases.
- **Branch.** This session pushed to `claude/wrest-park-g823kx`. Pages publishes `main`, so merge it to go live.

## Log
- 2026-10-12: survey (existing-site mode).
  - Sources, ownership chronology, dates for every stop, research plan.
  - Stops: vc, terrace, parterre, longwater, bathhouse and science moved. Car parks, admissions and south toilets added; start/exit is now the main car park. Sundial and Oldpark Water photo-spot stops added, each with a provisional `verify` bullet.
  - Path network rebuilt along the OSM footpaths with new `tools/osm-network.mjs` (config `sites/wrest-park/network.json`); steps from OSM and the leaflet.
  - The leaflet was supplied again.
- 2026-10-11: added stop scores (`wow`, `popular`) and their sliders, the visitor-scout agent, tappable timeline events (`more`), and merging of `owners` and events in `tools/merge-research.mjs`.
- 2026-10-11: brief and STATUS written for the existing site, ready for "continue wrest park" in a new chat. Since the last check: the assistant can now hold an ownership chronology, the century limit on date comparisons was removed, and BC years are supported.

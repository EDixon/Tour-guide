# Wrest Park: status

Stage: reference
Updated: 2026-10-12

**Existing site.** Research batches 1–7 merged on 12 October 2026 (visitors still on hold). Next: reference-packs.

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
- [x] site-research (2026-10-12): batches 1–7 merged; visitors on hold.
- [ ] reference-packs: extend `rulers`; write `habsburgs`, `garden-styles` and `farm-machinery`.
- [ ] site-check: not done. No fact-check yet.
- [ ] site-publish: already listed in the app. Re-publish (bump `sw.js` VERSION) once the knowledge changes.

## Research batches
| Batch | Stops | State |
|---|---|---|
| 1 Earl de Grey's gardens by the house | italian, conservatory, parterre, dairy | merged |
| 2 Old house and the seventeenth-century axis | oldhouse, sundial, longwater | merged |
| 3 The Duke's woodland and the canals | bowling, whh, ehh, oldpark | merged |
| 4 Jemima's garden and its follies | altar, chinese, altars, atlas | merged |
| 5 Water and heat (deepen) | orangery, bathhouse, cbcol, pavilion | merged |
| 6 The science years | science | merged |
| 7 Family and owners | (notes sections; intro, staircase, oldhouse) | merged |
| Visitors (visitor-scout) | all sights | **ON HOLD** (Eliot, 2026-10-11) |

## Known gaps carried forward
- **No `popular` scores, and `wow` set by hand:** waits for the visitor-scout (on hold).
- **Timeline `more`:** done for all 37 events.
- **Notes still to fix:** the existing notes have shortened date ranges and things with no `who` (format-fixer at site-check). Many existing sections cite general knowledge or Wikipedia; the batches upgrade them.
- **25 "look for" points have no photo:** the batches pick photos from `photos.json`.
- **Planner time:** the network went from 42 to 214 nodes, so a worst-case 4-hour plan takes about 870 ms here (was about 600 ms; the test limit is 1500 ms). Watch for lag on the phone.

## Flags for Eliot
- **From the research (12 October 2026), to check or decide:**
  - **Photos:** the batch 3 photos (Bowling Green House, the Half Houses, Oldpark Water) and the science-view photo were chosen from captions without being seen. Check them once downloaded.
  - **No photo found** for: the Hutton Monument, the dogs' cemetery, the dairy and its cupola, the conservatory roof trusses, the Bath House roof holes and lion's face, and the old house parchmarks. Worth taking on the day.
  - **Sources disagree (all said in the text):**
    - Ministry purchase: 1946 (Historic England) or October 1949 (Bedfordshire Archives).
    - Fountain and sundial statues: about 1840 for Earl de Grey (Bedfordshire Archives) or after 1859 for Anne Florence Cowper (Historic England).
    - Mermaid Basin: mid-1800s or 1880–1904.
    - Brown column: finial (pineapple, acanthus or urn) and date (1760, or later 1760s by Edward Stevens).
    - Jemima's birth: 1722 used (Bedfordshire Archives, Art UK) against 1723 (Wikipedia, The Peerage).
    - North front: 1671, 1672 or 1672–1676.
  - **Settled:**
    - Sun Insurance bought Wrest in 1939 (the event moves from 1940).
    - The institute closed at the end of March 2006.
    - Nan Herbert was 10th Baroness Lucas.
    - Murray was "of Thirsk, chairman of north-eastern brewery and coal companies" (Bedfordshire Archives).
    - Oldpark Water is part of the boundary canals.
    - The Brown "Mystery of the Gardens" quote is English Heritage's own wording.
    - The Meleager group is not "Diana and Endymion".
  - **The 1917 sale:** the house went privately to Murray in July 1917, and the contents were auctioned over five days from 10 September 1917. Most statue and tree losses came in the 1920s and 1930s under Murray, not in 1917. No source gives Nan's reasons for selling.
  - **The 1916 fire:** all 156 patients were got out safely. The east wing, about 50 patients sent to Woburn and Ampthill, and no injuries come from one local-history site quoting the Bedfordshire Standard (`verify`). The cause is not known.
  - **Long Water:** about 330 m of water (from OpenStreetMap), not 800 m; the 800 m is house to Pavilion. The Mercury statue's position disagrees between the listing and photos.
  - **Not found:** how the Orangery and conservatory were heated. The Earl's own account of building the house (Bedfordshire Historical Record Society, *Miscellanea*, 2024) may answer it if you have access.
  - **Petit Trianon:** "built for the Earl's children" (listing), though they were adults by 1856. Kept as the listing says, flagged.
  - **Tests:** three planner tests already failed before this merge: boredom, default detail, and visitor favourites. The last waits for the visitor scores. The first two need a look at site-check.
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
- **Branch.** This session pushed to `ccr-36dbd78e-uhfhwl` (an earlier one to `claude/wrest-park-g823kx`). Pages publishes `main`, so merge it to go live.

## Log
- 2026-10-12: research batches 1–7 (stop-researcher agents) reviewed and merged.
  - Duplicate source keys unified; 76 sources added to the tour; the tour now names `tours/wrest-park.photos.json`. Photo download started on GitHub Actions for this branch.
  - Two person sections dropped as duplicates of batch 7.
  - Tool changes: `merge-research.mjs` keeps a stop's `photo` and matches a renamed event on `was` whatever the year. `born` is now optional, so the assistant gives no ages for people with an unknown birth year.
- 2026-10-12: survey (existing-site mode).
  - Sources, ownership chronology, dates for every stop, research plan.
  - Stops: vc, terrace, parterre, longwater, bathhouse and science moved. Car parks, admissions and south toilets added; start/exit is now the main car park. Sundial and Oldpark Water photo-spot stops added, each with a provisional `verify` bullet.
  - Path network rebuilt along the OSM footpaths with new `tools/osm-network.mjs` (config `sites/wrest-park/network.json`); steps from OSM and the leaflet.
  - The leaflet was supplied again.
- 2026-10-11: added stop scores (`wow`, `popular`) and their sliders, the visitor-scout agent, tappable timeline events (`more`), and merging of `owners` and events in `tools/merge-research.mjs`.
- 2026-10-11: brief and STATUS written for the existing site, ready for "continue wrest park" in a new chat. Since the last check: the assistant can now hold an ownership chronology, the century limit on date comparisons was removed, and BC years are supported.

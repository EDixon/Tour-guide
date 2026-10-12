# Wrest Park: status

Stage: done
Updated: 2026-10-12

**Existing site.** Research batches 1–7 merged on 12 October 2026 (visitors still on hold). Reference packs, site-check and publish done the same day (published to main, service worker tg-v14).

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
- [x] reference-packs (2026-10-12): `rulers` extended (England/Britain 1066–2026, Scotland, France 1060–2026, Holy Roman Empire, Spain, Austria). New packs: `habsburgs`, `garden-styles`, `farm-machinery`. Four site sections they replace were removed: oranges, trompe-l'œil, the Spanish Succession, and Marie Antoinette.
- [x] site-check (2026-10-12): format fixes; independent fact-check (`factcheck.md`: about 560 claims, 10 wrong, all fixed; 27 where sources disagree, now said in the text; 12 unsupported, softened or re-sourced). Planner and assistant fixes found while trying it as a visitor.
- [x] site-publish (2026-10-12): pushed to main; offline files now include the photo credits and the habsburgs, garden-styles and farm-machinery packs; service worker tg-v14.

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

## One visit
The family visit once, and that is the real visit: no trial run, no return visit. Nothing below waits for a check on the day. Where something is uncertain, the app gives the best-supported answer and says it is uncertain.

## Known gaps
- **Paths** follow the OpenStreetMap footpaths and have not been walked. Walking times are estimates.
- **Positions placed by eye** from the 2024 leaflet and OpenStreetMap: the admissions gateway and the science-years viewpoint. The planner treats them as exact.
- **Steps near the Bath House:** the leaflet marks steps nearby, but no source says exactly where. Pushchair mode still routes to the Bath House. The stop's note lists the documented steps: down into the bath, three up to the dressing room, and a stepped path beside the Cascade mound.
- **No photo** of the Hutton Monument, the dogs' cemetery, the dairy cupola, the conservatory roof trusses, the Bath House roof holes and lion's face, or the old house parchmarks. Those look-for points have text only.
- **Not found anywhere:** how the Orangery and conservatory were heated. The Earl's own account (Bedfordshire Historical Record Society, *Miscellanea*, 2024, paywalled) may say; the app says it is not known.
- **Planner speed:** a worst-case 4-hour plan takes about 0.9 seconds here (test limit 1.5 seconds). Expect a short pause on the phone when re-planning.

## Flags for Eliot
- **Uncertain on site; the app's answer:**
  - **Mercury and Cupid:** about 70 m down the east bank of the Long Water (the listing). One photograph suggests further down.
  - **Chinese Bridge:** just east of the temple (map coordinates). The listing text says north.
  - **Accessible toilet:** the 2024 leaflet says the visitor centre and the mansion, but English Heritage's website says the mansion only. The visitor centre's look line says both.
  - **Brown column top:** pineapple, acanthus or urn. The bullet gives all three and asks you to look.
- **Sources disagree (all said in the text):**
  - Ministry purchase: 1946, 1947 or October 1949.
  - Fountain and sundial statues: about 1840 for Earl de Grey (Bedfordshire Archives) or after 1859 for Anne Florence, Countess Cowper (Historic England).
  - Mermaid Basin: mid-1800s or 1880–1904.
  - Brown column date: 1760, or later in the 1760s by Edward Stevens.
  - Jemima's birth: 1722 (Bedfordshire Archives, Art UK) or 1723 (Wikipedia, The Peerage).
  - North front: 1671, 1672 or 1672–1676.
  - Parterre lead groups: "about 1730, by Cheere" (Historic England), though Cheere set up his yard only in 1739.
  - Where Anthony, 11th Earl, died: Tonbridge or Tunbridge Wells.
- **Petit Trianon:** "built for the Earl's children" (the listing), though they were adults by 1856. Kept as the listing says, and flagged in the text.
- **The 1916 fire:** all 156 patients were got out safely (English Heritage). The east wing, about 50 patients sent to Woburn and Ampthill, and no injuries come from one local-history site quoting the Bedfordshire Standard; marked uncertain. The cause is not known.
- **The 1917 sale:** the house went privately to Murray in July 1917, and the contents were auctioned over five days from 10 September 1917. Most statue and tree losses came in the 1920s and 1930s under Murray. No source gives Nan's reasons for selling.
- **Reference packs:** first written from memory, then checked against the web, and what could not be confirmed was removed. The rulers list was not checked online (standard reign dates).
- **Rulers end at 2026.** The format has no "to date", so the current monarchs' and republics' rows need their end year bumped each year.
- **Debug-grade signing key.** The Android app signing key is committed knowingly. Install only from this repo's Releases.

## Log
- 2026-10-12: published to main (tg-v14).
- 2026-10-12: site-check. Format fixes, independent fact-check and all wrong items fixed. Planner fix: seeds are trimmed to fit and scenic detours capped. Assistant fix: pronoun follow-ups bring in the linked people's dates. Tests all pass.
- 2026-10-12: reference packs written, checked against the web, and merged; tour `knowledge.reference` now lists all four. Clashing generic aliases removed from the packs.
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

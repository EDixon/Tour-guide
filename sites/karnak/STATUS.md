# Karnak Temple: status

Stage: check
Updated: 2026-11-23

## Stages
- [x] new-site: brief
- [x] site-survey: sources, stops, paths, timeline, research plan
- [x] site-research: bullets, notes and dates for every stop
- [x] reference-packs: shared background reused or written
- [ ] site-check: validator, knowledge checks, fact-check
- [ ] site-publish: listed in the app, pushed, report sent

## Supplied by Eliot (in `sites/karnak/inputs/`, not in the repo; ask again in a new container)
- Photo of the on-site board "Karnak Temples Plan & Chronology" (re-supplied 22 November 2026 in this container as `inputs/site-board-plan.jpg`)
- Geoarchaeology plan with core soundings (source not named)
- Blyth (2006) publisher's preview PDF; Sullivan (2008) Digital Karnak introduction PDF

## Research batches
| Batch | Stops | State |
|---|---|---|
| 1. Arrival, the river and the First Pylon | quay, rams, pylon1, ramp | merged |
| 2. The great forecourt | sety2, taharqa, ram3, bubastite | merged |
| 3. The Great Hypostyle Hall | pylon2, hypostyle, northwall | merged |
| 4. Obelisks and the sanctuary | obelisks, scarab, sanctuary | merged |
| 5. Thutmose III's east end, the oldest core and Ptah | mkcourt, akhmenu, ptah, east | merged |
| 6. The Open Air Museum | whitechapel, redchapel | merged |
| 7. The Sacred Lake and the south | lake, lakeview, cachette, southpylons, khonsu | merged |
| 8. The story of Karnak and who ran it | intro (notes and owners) | merged |
| Visitors | all sights | merged (must-sees: rams, hypostyle, obelisks, lake) |

## Flags for Eliot
- **Senusret I's dates were wrong** in the research. They were given as "Shaw 1965–1920 BC", but Shaw has him as sole king 1956–1911 BC, after about ten years as co-ruler from about 1965 BC. Corrected in the notes, dates, tour text and the rulers pack.
- **Reference packs: what the fact-check should look at:**
  - The Egyptian king list in `rulers` was written partly from memory, so it needs checking against Shaw's table. I corrected the Twelfth Dynasty and Takelot II/Shoshenq III by hand.
  - All three new packs were drafted from memory, then checked online for their specific figures. Several sections are still labelled "general knowledge" in their Sources lines: in the building pack, foundations, wall cores and surveying.
  - The temples pack gives no share for temple land, while the site's "Estate of Amun" note still quotes about 80 per cent from Papyrus Harris I via Wikipedia.
  - Amenhotep II's reign in the site notes (1427–1401 BC) is not Shaw's (1425–1400 BC).
- **Ruler answers for modern dates** (for example, the 1927–1938 rebuilding of the White Chapel) also list England, France and Spain alongside Egypt. This is harmless but wordy. A per-site country filter would fix it.
- **Corrections made at merge (from the research):** quay dated about 945 BC (Shoshenq I), not 1200 BC; First Pylon about 380–362 BC; Hatshepsut's obelisks about 1464 BC (her year 16 counted from 1479 BC), not the popular 1457 BC; the Second Pylon colossus is sandstone, not granite; the fallen obelisk top was stood upright beside the scarab in April 2022; Senusret I uses Shaw's 1956–1911 BC (sole reign; co-ruler from about 1965 BC), corrected at the reference stage from a mis-attributed 1965–1920; the White Chapel lists land measures, not flood heights; Sacred Lake 128 by 83 m; Cachette dug 1903–1907.
- **Weak points the fact-check should look at:** Hatshepsut's "seven months" and electrum (only a web translation), the Estate of Amun percentages (Wikipedia summary of Papyrus Harris I), the century of the Akhmenu church, the Red Chapel rebuilding dates (1997–2002 by source), the 2019 ministry merger date, the treaty replica at the UN (marked unconfirmed).
- **Temple closure:** no source gives a date; the app says fourth century, fifth at the latest.
- **Access still uncertain:** Khonsu interior, Opet (probably locked), southern pylons beyond the Eighth, Akhmenu inner rooms and roof, Ptah inner room, eastern gate. Each stop's note says what to see if closed.
- **Photos:** 64 downloaded. Missing: the Hittite treaty wall, Hatshepsut's erased figures, the Khonsu court (Commons file not found). The Sacred Lake photo shows it partly drained during works and the lakeview photo is a night shot; usable but not ideal.
- **Sample plan order:** the planner's sample 2-hour route reaches the Hypostyle Hall late and the rams last. Visitors advise doing the hall and forecourt first, before the coach groups (about 09:00 to 10:00). Review in site-check.
- **Paths:** the network follows OpenStreetMap, which maps the temple's walkways well; it hasn't been walked. Walking times inside the temple are realistic to within about 20%. The approach from the car park crosses an open plaza OSM doesn't map as a path, so that stretch is a straight line.
- **Carrier, not pushchair:** steps are only marked where OSM marks them (three links). Pushchair mode isn't reliable for this site.
- **Access:** the Khonsu and Opet temples, the southern pylons, the Akhmenu's inner rooms and the Ptah temple have each been closed at times. Research will use the most recent evidence. Where it stays uncertain, the app will say "may be closed" and name what can be seen from outside.
- **Site board versus scholarship:** the board calls the triple shrine in the forecourt the "Chapels of Sety I". The sources give Sety II, so the app uses Sety II and notes that the board differs.
- **Owners chronology:** a survey draft by period, from the Eleventh Dynasty to the Ministry of Tourism and Antiquities. Batch 8 checks every row.
- **Ramadan 2027** is expected to run from about 8 February to 9 March 2027, and hours are sometimes shorter during it. The ticket price and card-only payment are from third-party sources.
- **Visit length** (3 hours) is assumed. The 32 stops are more than 3 hours' worth, so the planner will choose.
- **Geoarchaeology plan: not identified.** The likeliest source is Boraik, Gabolde and Graham, "Karnak's Quaysides" in Willems and Dahms (eds), *The Nile* (2017), pp. 97–144, which could not be opened. Pennington et al. 2025 does not match. The plan is not cited; the river story uses Charloux et al. 2021, Ghilardi 2015 and Pennington et al. 2025.

## Reference packs
| Pack | State |
|---|---|
| `rulers` | extended: Egypt (Intef I to Cleopatra VII, Shaw 2000), Rome (Augustus to Heraclius), Egypt after Rome (642 to 2026) |
| `egyptian-temples` | new, 10 sections |
| `egyptian-gods` | new, 11 sections |
| `ancient-building` | new, 11 sections |

## Log
- 2026-11-22: started; brief agreed (scope: Amun-Ra precinct and Open Air Museum; early March 2027, arriving 08:30; carrier).
- 2026-11-22: survey. OSM layer and Commons photo list fetched (via workflow_dispatch on the session branch). 32 stops, 30 timeline events, 9 eras, owners chronology drafted. `osm-network.mjs` gained an `outline` option (OSM's "site" areas here are single monuments). `check-knowledge.mjs` no longer crashes when notes.md is missing. Research plan: 8 batches plus visitors; 4 reference packs to write or extend.
- 2026-11-23: batches 1–8 and visitors researched (batches 5–8 resumed after a spend-limit stop) and merged. 94 new sources numbered 17–110. Duplicate people records joined. Photo download started via workflow_dispatch on the session branch.
- 2026-11-23: photos downloaded (64) and checked by eye; validator and knowledge checks pass (0 errors). Stage set to reference.
- 2026-11-23: reference packs. `rulers` extended (Egypt, Rome, Egypt after Rome); `egyptian-temples`, `egyptian-gods` and `ancient-building` written and source-checked, then merged. Senusret I corrected to Shaw 1956–1911 BC. One maths test made BC-aware. Checks pass (0 errors) and `npm test` is green. Stage set to check.

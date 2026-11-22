# Karnak Temple: status

Stage: research
Updated: 2026-11-22

## Stages
- [x] new-site: brief
- [x] site-survey: sources, stops, paths, timeline, research plan
- [ ] site-research: bullets, notes and dates for every stop
- [ ] reference-packs: shared background reused or written
- [ ] site-check: validator, knowledge checks, fact-check
- [ ] site-publish: listed in the app, pushed, report sent

## Supplied by Eliot (in `sites/karnak/inputs/`, not in the repo; ask again in a new container)
- Photo of the on-site board "Karnak Temples Plan & Chronology"
- Geoarchaeology plan with core soundings (source not named)
- Blyth (2006) publisher's preview PDF; Sullivan (2008) Digital Karnak introduction PDF

## Research batches
| Batch | Stops | State |
|---|---|---|
| 1. Arrival, the river and the First Pylon | quay, rams, pylon1, ramp | to do |
| 2. The great forecourt | sety2, taharqa, ram3, bubastite | to do |
| 3. The Great Hypostyle Hall | pylon2, hypostyle, northwall | to do |
| 4. Obelisks and the sanctuary | obelisks, scarab, sanctuary | to do |
| 5. Thutmose III's east end, the oldest core and Ptah | mkcourt, akhmenu, ptah, east | to do |
| 6. The Open Air Museum | whitechapel, redchapel | to do |
| 7. The Sacred Lake and the south | lake, lakeview, cachette, southpylons, khonsu | to do |
| 8. The story of Karnak and who ran it | intro (notes and owners) | to do |
| Visitors | all sights | to do |

## Flags for Eliot
- **Paths:** the network follows OpenStreetMap, which maps the temple's walkways well; it hasn't been walked. Walking times inside the temple are realistic to within about 20%. The approach from the car park crosses an open plaza OSM doesn't map as a path, so that stretch is a straight line.
- **Carrier, not pushchair:** steps are only marked where OSM marks them (three links). Pushchair mode isn't reliable for this site.
- **Access:** the Khonsu and Opet temples, the southern pylons, the Akhmenu's inner rooms and the Ptah temple have each been closed at times. Research will use the most recent evidence. Where it stays uncertain, the app will say "may be closed" and name what can be seen from outside.
- **Site board versus scholarship:** the board calls the triple shrine in the forecourt the "Chapels of Sety I". The sources give Sety II, so the app uses Sety II and notes that the board differs.
- **Owners chronology:** a survey draft by period, from the Eleventh Dynasty to the Ministry of Tourism and Antiquities. Batch 8 checks every row.
- **Ramadan 2027** is expected to run from about 8 February to 9 March 2027, and hours are sometimes shorter during it. The ticket price and card-only payment are from third-party sources.
- **Visit length** (3 hours) is assumed. The 32 stops are more than 3 hours' worth, so the planner will choose.
- **Geoarchaeology plan:** its source is unknown, so nothing from it is cited until it's identified.

## Log
- 2026-11-22: started; brief agreed (scope: Amun-Ra precinct and Open Air Museum; early March 2027, arriving 08:30; carrier).
- 2026-11-22: survey. OSM layer and Commons photo list fetched (via workflow_dispatch on the session branch). 32 stops, 30 timeline events, 9 eras, owners chronology drafted. `osm-network.mjs` gained an `outline` option (OSM's "site" areas here are single monuments). `check-knowledge.mjs` no longer crashes when notes.md is missing. Research plan: 8 batches plus visitors; 4 reference packs to write or extend.

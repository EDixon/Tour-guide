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

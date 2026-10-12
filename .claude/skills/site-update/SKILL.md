---
name: site-update
description: Update a published Tour Guide site on request, before the visit. Covers corrections, Eliot's own material (photos, a GPX he already has), new stops, and deeper knowledge for some stops. Use for "fix <site>", "update the paths from this GPX", "add more about <thing>".
---

# site-update: improve a published site

Main chat. Read `CLAUDE.md` and `sites/<id>/STATUS.md`. Each site is visited once, as the real visit, so updates happen before it, never as a fix-up afterwards.

## Kinds of update
- **Feedback from Eliot** (too much detail here, wrong place there, toddler task impossible): change the tour file directly. Where the feedback is about how the app behaves rather than this site, say so: that's an app change, not a site change.
- **GPX track** (one Eliot already has):
  1. Save it to `sites/<id>/inputs/` (kept out of the repo). Use only the on-site part.
  2. Snap waypoints and stop positions to the track where the estimate was off, and add paths they actually walked. Re-score `scenic` where obvious.
  3. Set `approx: false` only for positions confirmed by the track.
- **Looks:** if Eliot knows a place is better or worse to look at than its score, adjust its `wow` and note why in `visitor-scores.md`. Leave `popular` to the visitor-scout. Re-run the scout if the scores are more than a couple of years old or the site has changed (a restoration, a new play area).
- **Eliot's own photos:** only of objects and views, never of the family or other people (the repo is public).
  - Save each one, resized to about 900 px wide, to `tours/<id>/img/<photo id>.jpg`.
  - Add `{file, credit: "Eliot Dixon", licence: "own photo"}` to `tours/<id>.photos.json`.
  - Point the bullet, toddler task or `look` line at it, replacing a Commons photo if his is clearer.
- **Corrections to facts:** fix the claim, its source and every place it appears: bullets, notes, dates. Search for it with `grep`.
- **More depth or new stops:** treat it as a mini research batch. Write a short plan in `research-plan.md`, start a **stop-researcher** agent (Sonnet), then merge with `tools/merge-research.mjs`.

## Always finish with
`npm test`, `node tools/validate-tour.mjs tours/<id>.json 120`, `node tools/check-knowledge.mjs <id>`. Then log in `STATUS.md`, commit, push, and give Eliot a few lines on what changed.

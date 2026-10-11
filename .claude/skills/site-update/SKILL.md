---
name: site-update
description: Update a published Tour Guide site after a visit or on request. Covers corrections, Eliot's on-site feedback, GPX tracks to fix the path network, new stops, and deeper knowledge for some stops. Use for "fix <site>", "we're back from <site>", "update the paths from this GPX", "add more about <thing>".
---

# site-update: improve a published site

Main chat. Read `CLAUDE.md` and `sites/<id>/STATUS.md`.

## Kinds of update
- **Feedback from the visit** (too much detail here, wrong place there, toddler task impossible): change the tour file directly. Where the feedback is about how the app behaves rather than this site, say so: that's an app change, not a site change.
- **GPX track:**
  1. Save it to `sites/<id>/inputs/` (gitignored if it shows home or start locations; keep only the on-site part).
  2. Snap waypoints and stop positions to the track where the estimate was off, and add paths they actually walked. Re-score `scenic` where obvious.
  3. Set `approx: false` only for positions confirmed by the track.
- **Corrections to facts:** fix the claim, its source and every place it appears: bullets, notes, dates. Search for it with `grep`.
- **More depth or new stops:** treat it as a mini research batch. Write a short plan in `research-plan.md`, start a **stop-researcher** agent (Sonnet), then merge with `tools/merge-research.mjs`.

## Always finish with
`npm test`, `node tools/validate-tour.mjs tours/<id>.json 120`, `node tools/check-knowledge.mjs <id>`. Then log in `STATUS.md`, commit, push, and give Eliot a few lines on what changed.

# Tour Guide

An offline phone app for self-guided tours that re-plans itself as the day changes. It handles boredom, loo trips, long lunches and earlier departures. The first tour is **Wrest Park** (English Heritage, Silsoe).

The app chooses which stops to visit, in what order and by which path. It also chooses which bullet points to read at each stop, always in their original order. It re-plans whenever you tap a live button or change the time you need to leave.

## Layout and hosting

This repository is the whole project, and its top level is also the website:

| Path | What it is |
|---|---|
| `index.html`, `app.js`, `planner.js`, `style.css`, `sw.js`, `manifest.webmanifest`, `icons/` | The app |
| `tours/` | One JSON file per site, plus `index.json` listing them |
| `knowledge/` | Knowledge for the assistant: `knowledge/<site>/notes.md` (sections with sources) and `dates.json`, plus shared packs in `knowledge/reference/`. Format: `docs/KNOWLEDGE_FORMAT.md` |
| `assistant/` | Assistant code (not yet in the app). `maths.mjs` works out every date relationship (before/after/during, reigns, ages, years ago) so the model never does sums; `retrieve.mjs` picks the notes; `prompt.mjs` builds each question's prompt, with where you are and the earlier question |
| `docs/` | Tour file format |
| `sites/` | Working files while preparing a site (brief, status, research drafts, fact-check report) |
| `.claude/`, `CLAUDE.md` | Instructions for Claude: the site-preparation skills and helper agents |
| `tools/` | Tour file checker (`node tools/validate-tour.mjs tours/<id>.json 120`); `ask.mjs` prints the assistant's prompt for a conversation (`node tools/ask.mjs --at orangery "Who built this?"`) |
| `tests/` | Planner and date-maths tests (`npm test`) |

GitHub Pages publishes the `main` branch from the top level, at `https://edixon.github.io/Tour-guide/`. Everything here is public; nothing private belongs in the repo.

**Installing on the phone:** open the address in Chrome on Wi-Fi, ⋮ → **Add to Home screen / Install app**, then open it once from the home screen. It then works offline (test with aeroplane mode).

**Updates:** Claude pushes changes straight to this repository. Pages redeploys in a minute or two; then open the app with signal, wait about 10 seconds, close it fully and open it again. Your progress is kept. Anyone changing files by hand should also bump `VERSION` in `sw.js`.

## Try it at home first

In Settings (⚙︎), turn **Use GPS** off (at home GPS puts you miles away) and use the **simulated clock** (+5 / +15 min) to move time on. Start a tour on the sofa, tap “We’re here” and “Done”, try the live buttons, and watch it re-plan. When you're done, **Reset tour** and switch GPS back on.

To test the GPS behaviour on a laptop: open the site in Chrome, press F12 → ⋮ → More tools → **Sensors**, and set the location to 52.0072, -0.4157 (Wrest Park visitor centre).

## On the day

- **Start:** set *Back at the car by* and *How gripping is this place today?* (low means happy to skim and leave early), then start. The app opens with **Wrest Park in brief**, a short introduction to the whole story, trimmed like any other stop. All of it is also on the Timeline tab.
- **Now tab:** shows the next stop, an arrow and distance, and walking directions. 🌿 marks a waterside stretch the planner chose because it's worth the extra minutes.
  - Tap **We’re here** on arrival. Outdoors, a green banner appears when GPS puts you there.
  - If you've wandered and GPS puts you at a *different* stop, the banner offers that one instead.
  - If you're well off the planned path, an orange banner offers to **Re-route**.
  - **📍 We're somewhere else** re-routes from your GPS position. Without GPS, tap where you are on the map.
- **At a stop:** a few facts, chosen by your interests, plus a task for your daughter. **More** reveals the next fact in order. Tap **Done** to move on.
- **Live buttons (bottom):**
  - **Bored:** fewer facts per stop from now on, and a café break gets suggested sooner. It doesn't cut stops.
  - **Loving it:** more depth.
  - **Loo:** nearest toilets.
  - **Coffee:** café and play area. The plan re-fits around the break.
  - **Leave by:** new departure time.
- **Map:** your position (GPS outdoors, estimated indoors), the planned route and stop numbers. Tap near a stop to open it; where stops are close together (the house rooms), it asks which one. **📍** sets where you are by tapping the map.
- **Timeline:** “Wrest Park in brief”, then the site's development era by era, showing where you are now, what you've seen and what's planned.
- **Plan:** times for every stop and how many facts each will get. It also lists what was left out and why.
- **Settings (⚙︎):** leave time, **Facts per stop** (Few / Some / Lots, default Few), pace, breaks, GPS. **Interests** are on their own screen behind *Edit interests…*, with a Save button.

The app suggests a café break by itself when the family's modelled energy is low and there's touring left to enjoy after it.

## How the planner works (short version)

- **Facts and stops are traded separately:** a fact has to clear a higher bar than a stop, so "fewer facts" frees time without cutting stops. Facts per stop sets that bar.
- **Bullets:** each has an importance (1–5) and topic tags. Its value is importance × how much you care about those topics. Low-interest topics such as furniture and fabrics are worth very little.
  - Reading cost is its length at reading-aloud speed, × a chat factor.
  - Later points at the same stop are worth a bit less (attention span).
  - A bullet can `need` an earlier one, so follow-ups never appear without their set-up.
- **Stops:** each has a “wow” rating for just seeing it. **Walking legs** each have a scenic value, so the planner can choose the waterside path over the woodland short-cut.
- **Energy:** drains with time and is restored by a café break. A break is worth more the more tired you are, as long as there's touring left after it. There's also a small, steady chance you'll have to leave early, so the best things are front-loaded.
- **Leaving early:** everything competes against simply going home. When energy and interest are low, it finishes early on purpose rather than padding with weak content.
- **Search:** on every change it searches routes on the phone (insertion, then local improvement), usually in well under a second. No server.
- **Tests:** in `tests/planner.test.mjs` (`node tests/planner.test.mjs`).

## Content

`tours/wrest-park.json` has 26 stops plus an 8-point introduction, 136 bullets in all, a timeline of 10 eras and 32 events, a path network and schematic map shapes. Every bullet records its source. **Settings → Review content** shows each bullet's sources and flags 29 items that are general knowledge or worth double-checking.

Limitations:
- Stop positions come from the official listing coordinates.
- The **paths, water outlines and house-room positions are my approximations**.
- Turn on *Record GPS track* in Settings and export the GPX afterwards; the path network can then be corrected from your real walk.

## Adding another site

Start a Claude chat (Opus) with this repository connected and say **"add <site>"**. The `new-site` skill takes it from there through a chain of skills:
- **site-survey:** sources, stops, paths, timeline
- **site-research:** the stops are researched in batches by Sonnet helper agents
- **reference-packs:** shared background
- **site-check:** a Haiku helper does mechanical fixes, and an Opus fact-checker reports on accuracy
- **site-publish:** the site goes into the app

Progress is kept in `sites/<id>/STATUS.md`, so if a chat gets long, start a new one and say **"continue <site>"**. After a visit, **"we're back from <site>"** (with notes or a GPX) runs `site-update`.

Formats: `docs/TOUR_FORMAT.md` (tour) and `docs/KNOWLEDGE_FORMAT.md` (assistant knowledge). Checks: `npm test`, `node tools/validate-tour.mjs tours/<id>.json 120`, `node tools/check-knowledge.mjs <id>`.

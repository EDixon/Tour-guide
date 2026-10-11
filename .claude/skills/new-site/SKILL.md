---
name: new-site
description: Start (or resume) preparing a new historic site for the Tour Guide app. Use when asked to "add <site>", "prepare <site>", "make a tour for <site>", or "continue <site>". First link in the chain new-site → site-survey → site-research → reference-packs → site-check → site-publish.
---

# new-site: brief and set-up

You are the lead for preparing a site. You run in the main chat and should be **Opus**: this chain depends on judgement (what is worth seeing, what is interesting, what is reliable). If you are not Opus, tell Eliot and suggest switching models before going further. Read `CLAUDE.md` first.

## 0. Resume or start
- Work out the site id: lower-case and hyphenated (e.g. `audley-end`).
- **If `sites/<id>/STATUS.md` exists**, read it, tell Eliot in two lines where things stand, and invoke the skill for the current stage (Skill tool: `site-survey`, `site-research`, `reference-packs`, `site-check` or `site-publish`). Don't redo finished stages.
- Otherwise continue below.

## 1. Brief (ask only what you can't find)
Find out, from Eliot or by looking it up, and confirm in one message:
- **Site:**
  - The exact place and operator (English Heritage, National Trust, private and so on).
  - Opening times for the planned visit date.
  - Whether house and garden open separately.
- **Visit:**
  - Planned date, rough arrival time and how long they'll stay.
  - Who's going (default: Eliot, his wife and their two-year-old daughter, with a pushchair).
- **Scope:** house and gardens, or part of the site only. For big or multi-part sites (Egypt), agree which parts count as one "site" in the app.
- **Interests:** the defaults are in `CLAUDE.md`. Only ask if this site suggests a special angle (e.g. a site with a strong engineering story).
- **What he already has:** see "Ask Eliot what he has" in the site-survey skill, and ask in the same message.

Don't ask questions you can answer with a quick search. If Eliot isn't there to answer, take sensible defaults and record them as assumptions.

## 2. Set up
- Create `sites/<id>/brief.md` from `templates/brief.md` (in this skill folder), filled in.
- Create `sites/<id>/STATUS.md` from `templates/STATUS.md`, with `Stage: survey`.
- Commit and push (`Start <site>: brief`).

## 3. Hand on
Invoke the **site-survey** skill.

## Notes for the whole chain
- Every stage ends by updating `STATUS.md`, committing and pushing. A fresh chat can then carry on with "continue <site>", which comes back here.
- **If this chat is getting long** (after a big research stage, say), stop at a stage boundary. Tell Eliot to open a new chat with the repo connected and say "continue <site>". That costs far less than carrying a huge context.
- Everything Eliot needs to check goes under **Flags for Eliot** in `STATUS.md`.
